<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/RouterOSApi.php';
require_once __DIR__ . '/RouterRadiusService.php';
require_once __DIR__ . '/NetworkChannelService.php';

/**
 * MikroTik Fleet Management & Diagnostics Engine
 * Version-Aware for RouterOS v6 and RouterOS v7
 * Provides live telemetry, resource monitoring, outage ledger, and automated script provisioning.
 */
class MikroTikFleetService extends BaseService {

    /**
     * Get real-time health and diagnostics for a specific router
     */
    public function diagnoseRouter(int $routerId, int $networkId = 1): array {
        $stmt = $this->db->prepare("
            SELECT id, nasname, shortname, secret, api_user, api_password, api_port, api_ssl, api_enabled, network_id
            FROM nas 
            WHERE id = ? AND network_id = ? 
            LIMIT 1
        ");
        $stmt->execute([$routerId, $networkId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$router) {
            throw new InvalidArgumentException("الراوتر المطلوب غير موجود");
        }

        $ip = trim((string)$router['nasname']);
        $result = [
            'router_id' => $routerId,
            'name' => (string)($router['shortname'] ?: 'راوتر #' . $routerId),
            'ip_address' => $ip,
            'ping_status' => 'offline',
            'latency_ms' => null,
            'api_connected' => false,
            'detected_ros_version' => 'v7',
            'cpu_load' => null,
            'free_memory_mb' => null,
            'total_memory_mb' => null,
            'free_hdd_mb' => null,
            'uptime' => null,
            'version' => null,
            'board_name' => null,
            'active_sessions_count' => 0
        ];

        // 1. Ping and Latency check
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            $output = [];
            $code = 1;
            exec("ping -c 2 -W 1 " . escapeshellarg($ip), $output, $code);
            if ($code === 0) {
                $result['ping_status'] = 'online';
                foreach ($output as $line) {
                    if (str_contains($line, 'avg') || str_contains($line, 'min/avg/max')) {
                        if (preg_match('/=\s*[\d\.]+\/([\d\.]+)\//', $line, $m)) {
                            $result['latency_ms'] = round((float)$m[1], 1);
                        }
                    }
                }
                if ($result['latency_ms'] === null) {
                    $result['latency_ms'] = 1.0;
                }
            }
        }

        // 2. Count active RADIUS sessions
        $acctStmt = $this->db->prepare("
            SELECT COUNT(*) FROM radacct 
            WHERE nasipaddress = ? AND network_id = ? AND acctstoptime IS NULL
        ");
        $acctStmt->execute([$ip, $networkId]);
        $result['active_sessions_count'] = (int)$acctStmt->fetchColumn();

        // 3. API Deep Telemetry if enabled and reachable
        if (!empty($router['api_enabled']) && !empty($router['api_user']) && $result['ping_status'] === 'online') {
            try {
                $api = new RouterOSApi();
                $port = (int)($router['api_port'] ?: 8728);
                $ssl = !empty($router['api_ssl']);
                if ($api->connect($ip, (string)$router['api_user'], (string)$router['api_password'], $port, $ssl, 2)) {
                    $result['api_connected'] = true;
                    
                    $res = $api->comm('/system/resource/print');
                    if (!empty($res[0])) {
                        $info = $res[0];
                        $result['cpu_load'] = isset($info['cpu-load']) ? (int)$info['cpu-load'] : null;
                        $result['free_memory_mb'] = isset($info['free-memory']) ? round((int)$info['free-memory'] / (1024 * 1024), 1) : null;
                        $result['total_memory_mb'] = isset($info['total-memory']) ? round((int)$info['total-memory'] / (1024 * 1024), 1) : null;
                        $result['free_hdd_mb'] = isset($info['free-hdd-space']) ? round((int)$info['free-hdd-space'] / (1024 * 1024), 1) : null;
                        $result['uptime'] = (string)($info['uptime'] ?? '');
                        $result['version'] = (string)($info['version'] ?? '');
                        $result['board_name'] = (string)($info['board-name'] ?? '');

                        // Detect RouterOS major version
                        if (str_starts_with($result['version'], '6.')) {
                            $result['detected_ros_version'] = 'v6';
                        } else {
                            $result['detected_ros_version'] = 'v7';
                        }
                    }
                    $api->disconnect();
                }
            } catch (Throwable $e) {
                $result['api_error'] = $e->getMessage();
            }
        }

        return $result;
    }

    /**
     * Get fleet overview for all routers in a network
     */
    public function getFleetOverview(int $networkId = 1): array {
        $stmt = $this->db->prepare("
            SELECT 
                n.id, n.nasname, n.shortname, n.type, n.description, n.api_enabled,
                CASE WHEN m.last_checked_at IS NULL OR m.last_checked_at < NOW() - INTERVAL 5 MINUTE THEN 'unknown' ELSE COALESCE(m.last_status, 'unknown') END AS status,
                m.last_checked_at,
                m.changed_at,
                (SELECT COUNT(*) FROM radacct a WHERE a.nasipaddress = n.nasname AND a.network_id = n.network_id AND a.acctstoptime IS NULL AND a.acctupdatetime >= NOW() - INTERVAL 10 MINUTE AND a.username NOT REGEXP '^router_[0-9]+$') AS active_users
            FROM nas n
            LEFT JOIN um_router_status_monitor m ON m.router_id = n.id AND m.network_id = n.network_id
            WHERE n.network_id = ?
            ORDER BY n.id ASC
        ");
        $stmt->execute([$networkId]);
        $routers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $total = count($routers);
        $online = 0;
        $offline = 0;
        $unknown = 0;
        $totalUsers = 0;

        foreach ($routers as &$r) {
            $r['id'] = (int)$r['id'];
            $r['active_users'] = (int)$r['active_users'];
            $totalUsers += $r['active_users'];
            if ($r['status'] === 'online') {
                $online++;
            } elseif ($r['status'] === 'offline') {
                $offline++;
            } else {
                $unknown++;
            }
        }

        return [
            'summary' => [
                'total_routers' => $total,
                'online_routers' => $online,
                'offline_routers' => $offline,
                'unknown_routers' => $unknown,
                'fleet_health_percent' => $total > 0 ? round(($online / $total) * 100, 1) : 100.0,
                'total_active_sessions' => $totalUsers
            ],
            'routers' => $routers
        ];
    }

    /**
     * Generate 1-Click Complete Setup Script for MikroTik RouterOS (v6 or v7)
     */
    public function generateSmartMikrotikScript(int $routerId, int $networkId = 1, string $rosVersion = 'v7'): array {
        $stmt = $this->db->prepare("SELECT id, nasname, shortname, secret, network_id, winbox_port, winbox_listen_port, api_port, api_listen_port FROM nas WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$routerId, $networkId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$router) {
            $stmt = $this->db->prepare("SELECT id, nasname, shortname, secret, network_id, winbox_port, winbox_listen_port, api_port, api_listen_port FROM nas WHERE id = ? LIMIT 1");
            $stmt->execute([$routerId]);
            $router = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$router) {
            throw new InvalidArgumentException("الراوتر غير موجود");
        }
        $networkId = (int)($router['network_id'] ?? $networkId);

        $isV6 = strtolower($rosVersion) === 'v6';
        $serverIp = '194.163.165.238';
        $secret = (string)($router['secret'] ?: 'secret');
        $routerName = (string)($router['shortname'] ?: 'SAM-Router-' . $routerId);
        $coaPort = 3799;
        $winboxPort = !empty($router['winbox_port']) ? (int)$router['winbox_port'] : 8291;
        $winboxListenPort = !empty($router['winbox_listen_port']) ? (int)$router['winbox_listen_port'] : (8220 + $routerId);
        $apiPort = !empty($router['api_port']) ? (int)$router['api_port'] : 8728;
        $apiListenPort = !empty($router['api_listen_port']) ? (int)$router['api_listen_port'] : (8720 + $routerId);

        if ($isV6) {
            $script = <<<MIKROTIK
# ==============================================================================
# SAM Enterprise v81 - Automated Configuration for MikroTik [RouterOS v6.x]
# Router: {$routerName} (#{$routerId})
# Server: {$serverIp} | Architecture: RouterOS v6 (Legacy)
# Generated: {date('Y-m-d H:i:s')}
# ==============================================================================

/log info "Starting SAM Enterprise Setup for {$routerName} (RouterOS v6)..."

# 1. Configure FreeRADIUS AAA Client (v6)
/radius remove [find comment="SAM_ENTERPRISE_RADIUS"]
/radius add address={$serverIp} secret="{$secret}" service=hotspot,ppp,login \
    authentication-port=1812 accounting-port=1813 timeout=3000ms \
    comment="SAM_ENTERPRISE_RADIUS"

# 2. Enable CoA / Disconnect Requests (v6)
/radius incoming set accept=yes port={$coaPort}

# 3. Configure Hotspot Profile (v6)
/ip hotspot profile
set [find default=yes] use-radius=yes radius-accounting=yes \
    radius-interim-update=1m login-by=http-chap,http-pap,mac-cookie \
    split-user-domain=no

# 4. Walled Garden for Captive Portal (v6)
/ip hotspot walled-garden
add dst-host="{$serverIp}" comment="SAM_SERVER_IP"
add dst-host="*.ddns.net" comment="SAM_DDNS"
add dst-host="*.duckdns.org" comment="SAM_PORTAL_HOSTS"

/ip hotspot walled-garden ip
add dst-address={$serverIp} action=accept comment="SAM_SERVER_DIRECT_ACCESS"

# 5. System Clock and Identity (v6)
/system identity set name="{$routerName}"
/system clock set time-zone-name="Asia/Aden"

# 6. Remote Management Endpoints via Central Server (v6)
# -> Winbox Remote: {$serverIp}:{$winboxListenPort} (Forwarded to local port {$winboxPort})
# -> API Remote:    {$serverIp}:{$apiListenPort} (Forwarded to local port {$apiPort})
/ip service set winbox port={$winboxPort} disabled=no
/ip service set api port={$apiPort} disabled=no

/log info "SAM Enterprise RouterOS v6 Configuration successfully applied!"
MIKROTIK;
        } else {
            $script = <<<MIKROTIK
# ==============================================================================
# SAM Enterprise v81 - Automated Configuration for MikroTik [RouterOS v7.x]
# Router: {$routerName} (#{$routerId})
# Server: {$serverIp} | Architecture: RouterOS v7 (Modern)
# Generated: {date('Y-m-d H:i:s')}
# ==============================================================================

/log info "Starting SAM Enterprise Setup for {$routerName} (RouterOS v7)..."

# 1. Configure FreeRADIUS AAA Client (v7)
/radius remove [find comment="SAM_ENTERPRISE_RADIUS"]
/radius add address={$serverIp} secret="{$secret}" service=hotspot,ppp,login \
    authentication-port=1812 accounting-port=1813 timeout=3000ms \
    comment="SAM_ENTERPRISE_RADIUS"

# 2. Enable CoA / Disconnect Requests (v7)
/radius incoming set accept=yes port={$coaPort}

# 3. Configure Hotspot Profile with 1-Min Accounting Updates (v7)
/ip hotspot profile
set [find default=yes] use-radius=yes radius-accounting=yes \
    radius-interim-update=1m login-by=http-chap,http-pap,mac-cookie \
    split-user-domain=no

# 4. Walled Garden for Captive Portal (v7)
/ip hotspot walled-garden
add dst-host="{$serverIp}" comment="SAM_SERVER_IP"
add dst-host="*.ddns.net" comment="SAM_DDNS"
add dst-host="*.duckdns.org" comment="SAM_PORTAL_HOSTS"

/ip hotspot walled-garden ip
add dst-address={$serverIp} action=accept comment="SAM_SERVER_DIRECT_ACCESS"

# 5. System Clock and Identity (v7)
/system identity set name="{$routerName}"
/system clock set time-zone-name="Asia/Aden"

/log info "SAM Enterprise RouterOS v7 Configuration successfully applied!"
MIKROTIK;
        }

        return [
            'success' => true,
            'ros_version' => $isV6 ? 'v6' : 'v7',
            'router_id' => $routerId,
            'router_name' => $routerName,
            'server_ip' => $serverIp,
            'script' => $script
        ];
    }

    /**
     * Generate customized multi-tenant Telegram Bot scripts (TG2 package) for RouterOS v6 and v7
     */
    public function generateTelegramBotPackage(int $routerId, int $networkId = 1, string $rosVersion = 'both'): array {
        $stmt = $this->db->prepare("SELECT id, nasname, shortname, secret, network_id FROM nas WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$routerId, $networkId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$router) {
            $stmt = $this->db->prepare("SELECT id, nasname, shortname, secret, network_id FROM nas WHERE id = ? LIMIT 1");
            $stmt->execute([$routerId]);
            $router = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$router) {
            throw new InvalidArgumentException("الراوتر غير موجود");
        }
        $networkId = (int)($router['network_id'] ?? $networkId);

        $botToken = '';
        $chatId = '';
        try {
            $chService = new NetworkChannelService($this->db);
            $tgChannel = $chService->getChannel($networkId, 'telegram');
            $botToken = trim((string)($tgChannel['bot_token'] ?? ''));
            $chatId = trim((string)($tgChannel['chat_id'] ?? ''));
        } catch (Throwable $e) {}

        if ($botToken === '') {
            $setStmt = $this->db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'telegram_bot_token' LIMIT 1");
            $botToken = (string)($setStmt ? $setStmt->fetchColumn() : 'YOUR_BOT_TOKEN_HERE');
        }
        if ($chatId === '') {
            $setStmt = $this->db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'telegram_chat_id' LIMIT 1");
            $chatId = (string)($setStmt ? $setStmt->fetchColumn() : 'YOUR_CHAT_ID_HERE');
        }

        $serverIp = '194.163.165.238';
        $routerName = (string)($router['shortname'] ?: 'SAM-Router-' . $routerId);

        // --- Common Secrets ---
        $secretsRsc = <<<RSC
# ==============================================================================
# SAM Telegram Bot TG2 - Custom Secrets for {$routerName} (Network #{$networkId})
# Generated automatically by SAM Enterprise Server
# ==============================================================================
:global botID "{$botToken}";
:global telegramGroupChatId "{$chatId}";
:global telegramAdminIds {"{$chatId}"};
RSC;

        // --- Config file for v6 ---
        $configRscV6 = <<<RSC
# ==============================================================================
# SAM Telegram Bot TG2 - Configuration for {$routerName} [RouterOS v6]
# ==============================================================================
:global urlStart "https://api.telegram.org/bot";
:global telegramGroupMode 1;
:global telegramDebug 0;
:global samServerUrl "https://{$serverIp}";
:global samNetworkId "{$networkId}";
:global samRouterId "{$routerId}";
:global samRosVersion "v6";

:if ([:len [/file find name="TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc"]] > 0) do={
    :local sec [:parse [/file get [find name="TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc"] contents]];
    \$sec
};
RSC;

        // --- Config file for v7 ---
        $configRscV7 = <<<RSC
# ==============================================================================
# SAM Telegram Bot TG2 - Configuration for {$routerName} [RouterOS v7]
# ==============================================================================
:global urlStart "https://api.telegram.org/bot";
:global telegramGroupMode 1;
:global telegramDebug 0;
:global samServerUrl "https://{$serverIp}";
:global samNetworkId "{$networkId}";
:global samRouterId "{$routerId}";
:global samRosVersion "v7";

:if ([:len [/file find name="TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc"]] > 0) do={
    :local sec [:parse [/file get [find name="TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc"] contents]];
    \$sec
};
RSC;

        // --- WhatsApp sender script for v6 ---
        $sendWhatsAppV6 = <<<RSC
# ==============================================================================
# SAM WhatsApp Sender Function for [RouterOS v6]
# Usage: \$sendWhatsApp phone="967770000000" message="نص الرسالة"
# ==============================================================================
:global sendWhatsApp do={
    :local toPhone \$phone;
    :local msgText \$message;
    :local netId "{$networkId}";
    :local serverUrl "https://{$serverIp}/api.php?action=send_whatsapp_relay";
    
    :if ([:len \$toPhone] > 0 && [:len \$msgText] > 0) do={
        /tool fetch mode=https check-certificate=no url=\$serverUrl \\
            http-method=post \\
            http-header-field="Content-Type: application/json" \\
            http-data="{\"network_id\":\"\$netId\",\"phone\":\"\$toPhone\",\"message\":\"\$msgText\"}" \\
            keep-result=no
    }
}
RSC;

        // --- WhatsApp sender script for v7 ---
        $sendWhatsAppV7 = <<<RSC
# ==============================================================================
# SAM WhatsApp Sender Function for [RouterOS v7]
# Usage: \$sendWhatsApp phone="967770000000" message="نص الرسالة"
# ==============================================================================
:global sendWhatsApp do={
    :local toPhone \$phone;
    :local msgText \$message;
    :local netId "{$networkId}";
    :local serverUrl "https://{$serverIp}/api.php?action=send_whatsapp_relay";
    
    :if ([:len \$toPhone] > 0 && [:len \$msgText] > 0) do={
        /tool fetch url=\$serverUrl \\
            http-method=post \\
            check-certificate=no \\
            http-header-field="Content-Type: application/json" \\
            http-data="{\"network_id\":\"\$netId\",\"phone\":\"\$toPhone\",\"message\":\"\$msgText\"}" \\
            keep-result=no
    }
}
RSC;

        // --- Telemetry reporter script for v6 ---
        $telemetryV6 = <<<RSC
# ==============================================================================
# SAM Telemetry & Outage Reporter for [RouterOS v6]
# Usage: \$sendTelemetry event="wan_down" details="انقطاع خط يمن نت"
# ==============================================================================
:global sendTelemetry do={
    :local evType \$event;
    :local evDetails \$details;
    :local netId "{$networkId}";
    :local rId "{$routerId}";
    :local serverUrl "https://{$serverIp}/api.php?action=mikrotik_telemetry";
    
    /tool fetch mode=https check-certificate=no url=\$serverUrl \\
        http-method=post \\
        http-header-field="Content-Type: application/json" \\
        http-data="{\"network_id\":\"\$netId\",\"router_id\":\"\$rId\",\"event_type\":\"\$evType\",\"details\":\"\$evDetails\"}" \\
        keep-result=no
}
RSC;

        // --- Telemetry reporter script for v7 ---
        $telemetryV7 = <<<RSC
# ==============================================================================
# SAM Telemetry & Outage Reporter for [RouterOS v7]
# Usage: \$sendTelemetry event="wan_down" details="انقطاع خط يمن نت"
# ==============================================================================
:global sendTelemetry do={
    :local evType \$event;
    :local evDetails \$details;
    :local netId "{$networkId}";
    :local rId "{$routerId}";
    :local serverUrl "https://{$serverIp}/api.php?action=mikrotik_telemetry";
    
    /tool fetch url=\$serverUrl \\
        http-method=post \\
        check-certificate=no \\
        http-header-field="Content-Type: application/json" \\
        http-data="{\"network_id\":\"\$netId\",\"router_id\":\"\$rId\",\"event_type\":\"\$evType\",\"details\":\"\$evDetails\"}" \\
        keep-result=no
}
RSC;

        return [
            'success' => true,
            'router_id' => $routerId,
            'router_name' => $routerName,
            'network_id' => $networkId,
            'bot_token_preview' => substr($botToken, 0, 10) . '...',
            'chat_id' => $chatId,
            'v6' => [
                'TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc' => $secretsRsc,
                'TLGRM/scripts/telegram_bot/telegram_bot_config.rsc' => $configRscV6,
                'TLGRM/send_whatsapp.rsc' => $sendWhatsAppV6,
                'TLGRM/send_telemetry.rsc' => $telemetryV6
            ],
            'v7' => [
                'TLGRM/scripts/telegram_bot/telegram_bot_secrets.rsc' => $secretsRsc,
                'TLGRM/scripts/telegram_bot/telegram_bot_config.rsc' => $configRscV7,
                'TLGRM/send_whatsapp.rsc' => $sendWhatsAppV7,
                'TLGRM/send_telemetry.rsc' => $telemetryV7
            ]
        ];
    }

    /**
     * Build and return a dynamically customized TG2 TLGRM zip package for a specific router and network
     */
    public function generateCustomizedTlgrmZip(int $routerId, int $networkId = 1, string $rosVersion = 'v7'): string {
        $pack = $this->generateTelegramBotPackage($routerId, $networkId, $rosVersion);
        $vKey = ($rosVersion === 'v6') ? 'v6' : 'v7';
        $vFiles = $pack[$vKey] ?? $pack['v7'];
        $routerName = (string)($pack['router_name'] ?? 'Router-' . $routerId);

        $baseZip = __DIR__ . '/../downloads/tlgrm_package_base.zip';
        $tmpZip = sys_get_temp_dir() . '/tlgrm_pack_net_' . $networkId . '_router_' . $routerId . '_' . time() . '.zip';

        if (file_exists($baseZip)) {
            copy($baseZip, $tmpZip);
        }

        $zip = new ZipArchive();
        $res = $zip->open($tmpZip, file_exists($baseZip) ? ZipArchive::CHECKCONS : ZipArchive::CREATE | ZipArchive::OVERWRITE);
        if ($res !== true) {
            throw new RuntimeException("تعذر إنشاء ملف الحزمة المضغوطة: كود الخطأ " . $res);
        }

        // Add / overwrite the customized script files
        foreach ($vFiles as $inZipPath => $codeContent) {
            $zip->addFromString($inZipPath, $codeContent);
        }

        // Add auto installer scripts
        $setupV7 = <<<RSC
# ==============================================================================
# SAM Telegram Bot TG2 - Auto Installer for RouterOS v7 [Router: {$routerName}]
# ==============================================================================
/system script add name="TLGRM_LOAD" source={/import "TLGRM/scripts/tg2/tg2_load.rsc"}
/system script add name="TLGRM_POLL" source={/import "TLGRM/scripts/telegram_bot/telegram_bot_main.rsc"}
/system scheduler add name="TLGRM_POLL_JOB" interval=2s on-event=TLGRM_POLL start-time=startup
/system script run TLGRM_LOAD
:log info "✅ [SAM TG2 Pack] Telegram Bot initialized successfully for {$routerName}!"
RSC;

        $setupV6 = <<<RSC
# ==============================================================================
# SAM Telegram Bot TG2 - Auto Installer for RouterOS v6 [Router: {$routerName}]
# ==============================================================================
/system script add name="TLGRM_LOAD" source={/import "TLGRM/scripts/tg2/tg2_load.rsc"}
/system script add name="TLGRM_POLL" source={/import "TLGRM/scripts/telegram_bot/telegram_bot_main.rsc"}
/system scheduler add name="TLGRM_POLL_JOB" interval=2s on-event=TLGRM_POLL start-time=startup
/system script run TLGRM_LOAD
:log info "✅ [SAM TG2 Pack] Telegram Bot initialized successfully for {$routerName}!"
RSC;

        $zip->addFromString('TLGRM/setup_tlgrm_v7.rsc', $setupV7);
        $zip->addFromString('TLGRM/setup_tlgrm_v6.rsc', $setupV6);

        $readme = <<<TXT
================================================================================
دليل تشغيل حزمة بوت التيليجرام الذكي (TG2 Pack) لراوتر: {$routerName}
رقم الشبكة: {$networkId} | معرف الراوتر: {$routerId} | الإصدار المحدد: {$rosVersion}
================================================================================

تم حقن وضبط بيانات شبكتك وتوكن البوت ومعرف المجموعة تلقائياً داخل الحزمة!

خطوات التثبيت السريعة:
1. قم بفك ضغط هذا الملف على جهازك، ستجد مجلد باسم "TLGRM".
2. افتح تطبيق WinBox، ثم توجه إلى قائمة (Files).
3. اسحب مجلد "TLGRM" كاملاً وأفلته داخل قائمة Files.
4. افتح شاشة الأوامر (New Terminal) في WinBox ونفّذ أمر التثبيت بحسب إصدارك:

   - إذا كان إصدار المايكروتك لديك RouterOS v7:
     /import file-name="TLGRM/setup_tlgrm_v7.rsc"

   - إذا كان إصدار المايكروتك لديك RouterOS v6:
     /import file-name="TLGRM/setup_tlgrm_v6.rsc"

5. تهانينا! سيقوم المايكروتك بتحميل كافة الدوال، تفعيل البوت، وجدولة الفحص التلقائي.
   يمكنك الآن إرسال الأوامر للبوت في التيليجرام والتحكم بالشبكة واستقبال إشعارات الواتساب!
================================================================================
TXT;
        $zip->addFromString('TLGRM/README_START_HERE.txt', $readme);

        $zip->close();
        return $tmpZip;
    }

    /**
     * Handle dynamic router bootstrap via secure provisioning key
     */
    public function handleRouterBootstrap(string $provisionToken, string $rosVersion = 'v7'): string {
        $provisionToken = trim($provisionToken);
        if ($provisionToken === '') {
            return "# Error: Empty provisioning token.\n:log error \"❌ [SAM Error] Empty router license key.\";";
        }

        $stmt = $this->db->prepare("SELECT * FROM nas WHERE provision_token = ? LIMIT 1");
        $stmt->execute([$provisionToken]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$router) {
            return "# Error: Invalid or unrecognized provisioning key.\n:log error \"❌ [SAM License Error] Unrecognized router provisioning key. Configuration rejected.\";";
        }

        if (isset($router['is_active']) && (int)$router['is_active'] === 0) {
            return "# Error: Router license is disabled or revoked.\n:log error \"❌ [SAM License Error] Router license has been revoked or disabled by system administrator.\";";
        }

        // Record bootstrap telemetry and timestamp
        $remoteIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $updStmt = $this->db->prepare("UPDATE nas SET last_bootstrap_at = NOW(), bootstrap_ip = ? WHERE id = ?");
        $updStmt->execute([$remoteIp, $router['id']]);

        // Generate full dynamic configuration script
        $gen = $this->generateSmartMikrotikScript((int)$router['id'], (int)$router['network_id'], $rosVersion);
        $script = (string)($gen['script'] ?? '');

        $routerName = (string)($router['shortname'] ?: 'Router-' . $router['id']);
        $serverIp = '194.163.165.238';

        // Append automatic sync / re-verification job
        $syncJob = <<<RSC

# ==============================================================================
# SAM Dynamic Licensing & Cloud Config Auto-Sync Job
# Automatically synchronizes changes and validates licensing with SAM Cloud
# ==============================================================================
/system script remove [find name="SAM_CLOUD_SYNC"]
/system scheduler remove [find name="SAM_CLOUD_SYNC_JOB"]

/system script add name="SAM_CLOUD_SYNC" source={
    :local samKey "{$provisionToken}";
    :local samVer "{$rosVersion}";
    :local syncUrl "https://{$serverIp}/api.php?action=bootstrap_router&key=\$samKey&version=\$samVer";
    :do {
        /tool fetch url=\$syncUrl dst-path="sam_sync.rsc" check-certificate=no;
        :delay 2s;
        :if ([:len [/file find name="sam_sync.rsc"]] > 0) do={
            /import file-name="sam_sync.rsc";
            /file remove "sam_sync.rsc";
            :log info "✅ [SAM Cloud Sync] Configuration synchronized successfully with server.";
        }
    } on-error={
        :log warning "⚠️ [SAM Cloud Sync] Could not reach SAM Cloud server or invalid license.";
    }
}

/system scheduler add name="SAM_CLOUD_SYNC_JOB" interval=12h on-event=SAM_CLOUD_SYNC start-time=startup
:log info "✅ [SAM Enterprise] Router '{$routerName}' bootstrapped and licensed successfully!";
RSC;

        return $script . "\n" . $syncJob;
    }

    /**
     * Get router provisioning info (Key, status, caller commands)
     */
    public function getRouterProvisionInfo(int $routerId, int $networkId = 1): array {
        $stmt = $this->db->prepare("SELECT id, nasname, shortname, secret, provision_token, is_active, last_bootstrap_at, bootstrap_ip, network_id FROM nas WHERE id = ? LIMIT 1");
        $stmt->execute([$routerId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$router) {
            throw new InvalidArgumentException("الراوتر غير موجود");
        }

        $token = (string)($router['provision_token'] ?? '');
        if ($token === '') {
            $token = 'sam_lic_' . bin2hex(random_bytes(16));
            $upd = $this->db->prepare("UPDATE nas SET provision_token = ? WHERE id = ?");
            $upd->execute([$token, $routerId]);
            $router['provision_token'] = $token;
        }

        $serverIp = '194.163.165.238';
        $v7Command = "/tool fetch url=\"https://{$serverIp}/api.php?action=bootstrap_router&key={$token}&version=v7\" dst-path=\"sam_init.rsc\"; :delay 1s; /import file-name=\"sam_init.rsc\"; /file remove \"sam_init.rsc\";";
        $v6Command = "/tool fetch mode=https check-certificate=no url=\"https://{$serverIp}/api.php?action=bootstrap_router&key={$token}&version=v6\" dst-path=\"sam_init.rsc\"; :delay 1s; /import file-name=\"sam_init.rsc\"; /file remove \"sam_init.rsc\";";

        return [
            'success' => true,
            'router_id' => (int)$router['id'],
            'router_name' => (string)($router['shortname'] ?: $router['nasname']),
            'nas_ip' => (string)$router['nasname'],
            'network_id' => (int)$router['network_id'],
            'provision_token' => $token,
            'is_active' => (int)($router['is_active'] ?? 1) === 1,
            'last_bootstrap_at' => $router['last_bootstrap_at'],
            'bootstrap_ip' => $router['bootstrap_ip'],
            'v7_bootstrap_command' => $v7Command,
            'v6_bootstrap_command' => $v6Command
        ];
    }

    /**
     * Regenerate provisioning token (Revokes old key immediately)
     */
    public function regenerateProvisionToken(int $routerId, int $networkId = 1): array {
        $newToken = 'sam_lic_' . bin2hex(random_bytes(16));
        $stmt = $this->db->prepare("UPDATE nas SET provision_token = ? WHERE id = ?");
        $stmt->execute([$newToken, $routerId]);

        return $this->getRouterProvisionInfo($routerId, $networkId);
    }

    /**
     * Toggle router license active status
     */
    public function toggleRouterLicenseStatus(int $routerId, bool $active, int $networkId = 1): array {
        $stmt = $this->db->prepare("UPDATE nas SET is_active = ? WHERE id = ?");
        $stmt->execute([$active ? 1 : 0, $routerId]);

        return $this->getRouterProvisionInfo($routerId, $networkId);
    }

    /**
     * Network Ping & Latency Matrix for Towers & Routers
     * Executes parallel ICMP probes via fping with instant status classification & metrics
     */
    public function pingFleetMatrix(int $networkId = 1): array {
        $sql = "SELECT id, nasname, shortname, description, api_port, is_active, last_bootstrap_at, bootstrap_ip FROM nas ";
        if ($networkId > 0) {
            $sql .= "WHERE network_id = ? ORDER BY id ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$networkId]);
        } else {
            $sql .= "ORDER BY id ASC";
            $stmt = $this->db->query($sql);
        }
        $routers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($routers)) {
            return [
                'success' => true,
                'total_routers' => 0,
                'online_count' => 0,
                'warning_count' => 0,
                'offline_count' => 0,
                'avg_latency_ms' => 0,
                'network_health_score' => 100,
                'tested_at' => date('Y-m-d H:i:s'),
                'routers' => []
            ];
        }

        $ipList = [];
        foreach ($routers as $idx => $r) {
            $ip = trim((string)$r['nasname']);
            if (empty($ip) || $ip === '127.0.0.1' || $ip === 'localhost') {
                $ip = '10.101.0.' . $r['id'];
            }
            $routers[$idx]['target_ip'] = $ip;
            if (!in_array($ip, $ipList, true)) {
                $ipList[] = $ip;
            }
        }

        $escapedIps = implode(' ', array_map('escapeshellarg', $ipList));
        $cmd = "fping -C 3 -q {$escapedIps} 2>&1";
        $output = shell_exec($cmd);

        $pingResultsByIp = [];
        if ($output) {
            $lines = explode("\n", trim($output));
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || strpos($line, ':') === false) continue;
                [$ipPart, $resPart] = explode(':', $line, 2);
                $ip = trim($ipPart);
                $tokens = preg_split('/\s+/', trim($resPart));
                $pings = [];
                $lossCount = 0;
                foreach ($tokens as $tok) {
                    if ($tok === '-' || !is_numeric($tok)) {
                        $lossCount++;
                    } else {
                        $pings[] = round((float)$tok, 1);
                    }
                }
                $totalProbes = count($tokens);
                $lossPercent = $totalProbes > 0 ? (int)round(($lossCount / $totalProbes) * 100) : 100;
                $avgMs = !empty($pings) ? round(array_sum($pings) / count($pings), 1) : null;
                $minMs = !empty($pings) ? min($pings) : null;
                $maxMs = !empty($pings) ? max($pings) : null;
                $jitterMs = (!empty($pings) && count($pings) > 1) ? round($maxMs - $minMs, 1) : 0;

                $pingResultsByIp[$ip] = [
                    'pings' => $pings,
                    'loss_percent' => $lossPercent,
                    'avg_ms' => $avgMs,
                    'min_ms' => $minMs,
                    'max_ms' => $maxMs,
                    'jitter_ms' => $jitterMs
                ];
            }
        }

        $onlineCount = 0;
        $warningCount = 0;
        $offlineCount = 0;
        $totalLatencies = [];
        $detailedRouters = [];

        foreach ($routers as $r) {
            $ip = $r['target_ip'];
            $res = $pingResultsByIp[$ip] ?? [
                'pings' => [],
                'loss_percent' => 100,
                'avg_ms' => null,
                'min_ms' => null,
                'max_ms' => null,
                'jitter_ms' => 0
            ];

            $avg = $res['avg_ms'];
            $loss = $res['loss_percent'];

            if ($loss === 100 || $avg === null) {
                $status = 'down';
                $statusLabel = 'منقطع / لا توجد استجابة';
                $statusColor = '#ef4444';
                $offlineCount++;
            } elseif ($loss >= 50 || $avg > 450) {
                $status = 'critical';
                $statusLabel = 'حرج / ضغط شديد وبطء';
                $statusColor = '#f97316';
                $warningCount++;
                $onlineCount++;
                $totalLatencies[] = $avg;
            } elseif ($loss > 0 || $avg > 280) {
                $status = 'warning';
                $statusLabel = 'متوسط / تذبذب خفيف';
                $statusColor = '#eab308';
                $warningCount++;
                $onlineCount++;
                $totalLatencies[] = $avg;
            } else {
                $status = 'healthy';
                $statusLabel = 'ممتاز / استجابة فائقة';
                $statusColor = '#10b981';
                $onlineCount++;
                $totalLatencies[] = $avg;
            }

            $detailedRouters[] = [
                'id' => (int)$r['id'],
                'name' => (string)($r['shortname'] ?: $r['nasname']),
                'ip' => $ip,
                'description' => (string)($r['description'] ?: 'برج / راوتر ميكروتك'),
                'api_port' => (int)($r['api_port'] ?: 8728),
                'is_active' => (int)($r['is_active'] ?? 1) === 1,
                'status' => $status,
                'status_label' => $statusLabel,
                'status_color' => $statusColor,
                'latency_ms' => $avg,
                'min_ms' => $res['min_ms'],
                'max_ms' => $res['max_ms'],
                'jitter_ms' => $res['jitter_ms'],
                'packet_loss' => $loss,
                'pings' => $res['pings'],
                'last_bootstrap_at' => $r['last_bootstrap_at']
            ];
        }

        $totalRouters = count($detailedRouters);
        $avgNetworkLatency = !empty($totalLatencies) ? round(array_sum($totalLatencies) / count($totalLatencies), 1) : 0;
        $healthScore = $totalRouters > 0 ? (int)round(($onlineCount / $totalRouters) * 100) : 100;

        return [
            'success' => true,
            'total_routers' => $totalRouters,
            'online_count' => $onlineCount,
            'warning_count' => $warningCount,
            'offline_count' => $offlineCount,
            'avg_latency_ms' => $avgNetworkLatency,
            'network_health_score' => $healthScore,
            'tested_at' => date('Y-m-d H:i:s'),
            'routers' => $detailedRouters
        ];
    }
}
