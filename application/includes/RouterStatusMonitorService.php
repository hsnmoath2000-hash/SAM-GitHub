<?php
declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';
require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/WhatsAppService.php';
require_once __DIR__ . '/FirebaseService.php';

/** Polls RouterOS reachability and sends one network-scoped alert per state transition. */
final class RouterStatusMonitorService
{
    private PDO $db;
    private const MANAGER_ROLES = ['superadmin', 'superadmin', 'supervisor'];

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function ensureSchema(): void
    {
        $this->db->exec("CREATE TABLE IF NOT EXISTS um_router_status_monitor (
            network_id INT NOT NULL,
            router_id INT NOT NULL,
            last_status ENUM('online','offline') NULL,
            last_notified_status ENUM('online','offline') NULL,
            pending_status ENUM('online','offline') NULL,
            pending_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
            last_checked_at DATETIME NULL,
            changed_at DATETIME NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (network_id,router_id),
            KEY idx_router_monitor_pending (network_id,last_status,last_notified_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    public function run(bool $dryRun = false): array
    {
        $this->ensureSchema();
        $lock = (int)$this->db->query("SELECT GET_LOCK('sam_router_status_monitor',0)")->fetchColumn();
        if ($lock !== 1) return ['success'=>true,'skipped'=>'already_running','checked'=>0,'transitions'=>0];

        $checked = 0;
        $transitions = 0;
        $errors = [];
        try {
            $networks = $this->db->query("SELECT id FROM um_networks WHERE status='active' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($networks as $rawNetworkId) {
                $networkId = (int)$rawNetworkId;
                $this->db->exec('SET @sam_active_network_id=' . $networkId);
                $routers = $this->db->prepare('SELECT id,shortname,nasname FROM nas WHERE network_id=? ORDER BY id');
                $routers->execute([$networkId]);
                $sessions = $this->activeRouterSessions($networkId);
                foreach ($routers->fetchAll(PDO::FETCH_ASSOC) as $router) {
                    try {
                        $routerId = (int)$router['id'];
                        $observation = $this->observeRouter($router, $sessions);
                        if ($observation === null) {
                            $errors[] = ['network_id'=>$networkId,'router_id'=>$routerId,'error'=>'STATUS_UNAVAILABLE'];
                            continue;
                        }
                        $checked++;
                        if (!$dryRun) $this->recordObservation($networkId, $routerId, $observation);
                    } catch (Throwable $e) {
                        $errors[] = ['network_id'=>$networkId,'router_id'=>(int)$router['id'],'error'=>'ROUTER_CHECK_FAILED'];
                        error_log('Router status check failed for network ' . $networkId . ' router ' . (int)$router['id'] . ': ' . $e->getMessage());
                    }
                }
                if (!$dryRun) $transitions += $this->dispatchPendingNotifications($networkId);
            }
        } finally {
            $this->db->query("SELECT RELEASE_LOCK('sam_router_status_monitor')");
        }
        return ['success'=>true,'checked'=>$checked,'transitions'=>$transitions,'errors'=>$errors,'dry_run'=>$dryRun];
    }

    /** @return array<string,bool> keys are router_<id> and assigned SSTP addresses */
    private function activeRouterSessions(int $networkId): array
    {
        $active = [];
        $cmd = '/usr/bin/accel-cmd -H 127.0.0.1 -p 2001 show sessions 2>/dev/null';
        if (!file_exists('/usr/bin/accel-cmd') && file_exists('/usr/sbin/accel-cmd')) {
            $cmd = '/usr/sbin/accel-cmd -H 127.0.0.1 -p 2001 show sessions 2>/dev/null';
        }
        $lines = [];
        $code = 1;
        exec($cmd, $lines, $code);
        if ($code === 0 && !empty($lines)) {
            $headers = [];
            foreach ($lines as $line) {
                if (!str_contains($line, '|') || str_contains($line, '---')) continue;
                $parts = array_map('trim', explode('|', trim($line)));
                if (empty($headers)) {
                    $headers = array_map('strtolower', $parts);
                    continue;
                }
                $row = [];
                foreach ($headers as $idx => $name) {
                    $row[$name] = $parts[$idx] ?? '';
                }
                $username = (string)($row['username'] ?? '');
                $ip = (string)($row['ip'] ?? '');
                $state = (string)($row['state'] ?? 'active');
                if ($state === 'active') {
                    if (preg_match('/^router_(\d+)$/', $username)) $active[$username] = true;
                    if (filter_var($ip, FILTER_VALIDATE_IP)) $active[$ip] = true;
                }
            }
        }

        // Keep SSTP observations tenant-bound and do not accept another tenant's accounting row.
        try {
            $stmt = $this->db->prepare("SELECT username,framedipaddress FROM radacct
                WHERE network_id=? AND acctstoptime IS NULL AND username REGEXP '^router_[0-9]+$'");
            $stmt->execute([$networkId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $active[(string)$row['username']] = true;
                $ip = (string)($row['framedipaddress'] ?? '');
                if (filter_var($ip, FILTER_VALIDATE_IP)) $active[$ip] = true;
            }
        } catch (Throwable $e) {
            // ICMP remains available when the optional RADIUS accounting query is absent.
        }
        return $active;
    }

    private function observeRouter(array $router, array $activeSessions): ?string
    {
        $ip = trim((string)($router['nasname'] ?? ''));
        $sessionOnline = !empty($activeSessions['router_' . (int)$router['id']])
            || !empty($activeSessions['10.101.0.' . (int)$router['id']]);
        if ($sessionOnline) return 'online';
        if ($ip === '' || !$this->isSafeHost($ip)) return null;
        if (!function_exists('exec')) return null;
        $output = [];
        $code = 1;
        exec('ping -n -c 1 -W 1 ' . escapeshellarg($ip) . ' >/dev/null 2>&1', $output, $code);
        return $code === 0 ? 'online' : 'offline';
    }

    private function isSafeHost(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) return true;
        return strlen($host) <= 253 && (bool)preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i', $host);
    }

    /** Returns true only when a confirmed state transition needs delivery. */
    private function recordObservation(int $networkId, int $routerId, string $observed): bool
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT last_status,pending_status,pending_count FROM um_router_status_monitor WHERE network_id=? AND router_id=? FOR UPDATE');
            $stmt->execute([$networkId,$routerId]);
            $state = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$state) {
                $insert = $this->db->prepare('INSERT INTO um_router_status_monitor (network_id,router_id,last_status,last_notified_status,pending_status,pending_count,last_checked_at,changed_at) VALUES (?,?,?,?,NULL,0,NOW(),NOW())');
                $insert->execute([$networkId,$routerId,$observed,$observed]);
                $this->db->commit();
                return false; // Establish a baseline without sending startup noise.
            }

            $last = (string)($state['last_status'] ?? '');
            if ($last === $observed) {
                $update = $this->db->prepare('UPDATE um_router_status_monitor SET pending_status=NULL,pending_count=0,last_checked_at=NOW() WHERE network_id=? AND router_id=?');
                $update->execute([$networkId,$routerId]);
                $this->db->commit();
                return false;
            }

            // Require two consecutive failed polls before declaring an outage; recovery is immediate.
            $pendingCount = (string)($state['pending_status'] ?? '') === $observed ? (int)$state['pending_count'] + 1 : 1;
            if ($observed === 'offline' && $pendingCount < 2) {
                $update = $this->db->prepare('UPDATE um_router_status_monitor SET pending_status=?,pending_count=?,last_checked_at=NOW() WHERE network_id=? AND router_id=?');
                $update->execute([$observed,$pendingCount,$networkId,$routerId]);
                $this->db->commit();
                return false;
            }

            $update = $this->db->prepare('UPDATE um_router_status_monitor SET last_status=?,pending_status=NULL,pending_count=0,last_checked_at=NOW(),changed_at=NOW() WHERE network_id=? AND router_id=?');
            $update->execute([$observed,$networkId,$routerId]);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    private function dispatchPendingNotifications(int $networkId): int
    {
        $stmt = $this->db->prepare("SELECT s.router_id,s.last_status,n.shortname,n.nasname
            FROM um_router_status_monitor s
            JOIN nas n ON n.id=s.router_id AND n.network_id=s.network_id
            WHERE s.network_id=? AND s.last_status IS NOT NULL
              AND (s.last_notified_status IS NULL OR s.last_status<>s.last_notified_status)
            ORDER BY s.router_id");
        $stmt->execute([$networkId]);
        $sent = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $event) {
            $status = (string)$event['last_status'];
            $routerId = (int)$event['router_id'];
            try {
                $this->notifyTransition($networkId,$event,$status);
                $ack = $this->db->prepare('UPDATE um_router_status_monitor SET last_notified_status=? WHERE network_id=? AND router_id=? AND last_status=?');
                $ack->execute([$status,$networkId,$routerId,$status]);
                $sent++;
            } catch (Throwable $e) {
                error_log('Router status notification dispatch failed for network ' . $networkId . ' router ' . $routerId . ': ' . $e->getMessage());
            }
        }
        return $sent;
    }

    private function notifyTransition(int $networkId, array $router, string $status): void
    {
        $this->db->exec('SET @sam_active_network_id=' . $networkId);
        $channels = new NetworkChannelService($this->db);
        $settings = $channels->getNotificationSettings($networkId);
        if (empty($settings['notify_routers'])) return;

        $routerId = (int)$router['id'];
        $routerName = trim((string)($router['shortname'] ?? '')) ?: ('راوتر #' . $routerId);
        $ip = trim((string)($router['nasname'] ?? ''));
        $eventType = $status === 'online' ? 'router_online' : 'router_offline';
        $refId = 'router-' . $routerId . ':' . $status . ':' . date('YmdHis');
        $isOnline = $status === 'online';
        $title = $isOnline ? 'عودة اتصال الراوتر' : 'انقطاع اتصال الراوتر';
        $downtimeInfo = '';

        // Update Outage Ledger in um_asset_outage_logs
        try {
            if (!$isOnline) {
                $insOutage = $this->db->prepare("
                    INSERT INTO um_asset_outage_logs (asset_id, disconnected_at, nas_ip, network_id, notes)
                    VALUES (?, NOW(), ?, ?, 'انقطاع الاتصال بالراوتر')
                ");
                $insOutage->execute([$routerId, $ip, $networkId]);
            } else {
                $findOpen = $this->db->prepare("
                    SELECT id, disconnected_at FROM um_asset_outage_logs 
                    WHERE asset_id = ? AND network_id = ? AND reconnected_at IS NULL 
                    ORDER BY id DESC LIMIT 1
                ");
                $findOpen->execute([$routerId, $networkId]);
                $openOutage = $findOpen->fetch(PDO::FETCH_ASSOC);

                if ($openOutage) {
                    $discTime = strtotime($openOutage['disconnected_at']);
                    $durationSec = max(1, time() - $discTime);
                    $durationMin = round($durationSec / 60, 1);
                    $updOutage = $this->db->prepare("
                        UPDATE um_asset_outage_logs 
                        SET reconnected_at = NOW(), duration_seconds = ? 
                        WHERE id = ?
                    ");
                    $updOutage->execute([$durationSec, (int)$openOutage['id']]);
                    $downtimeInfo = " (مدة الانقطاع: {$durationMin} دقيقة)";
                }
            }
        } catch (Throwable $e) {
            error_log('Outage log ledger update failed: ' . $e->getMessage());
        }

        $body = $isOnline
            ? "عاد الراوتر {$routerName} ({$ip}) للاتصال بالشبكة{$downtimeInfo}."
            : "انقطع اتصال الراوتر {$routerName} ({$ip}) عن الشبكة.";
        $html = ($isOnline ? '🟢' : '🔴') . ' <b>' . htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . "</b>\n"
            . 'الشبكة: #' . $networkId . "\n"
            . 'الراوتر: <b>' . htmlspecialchars($routerName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . "</b>\n"
            . 'العنوان: <code>' . htmlspecialchars($ip, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . "</code>\n"
            . ($downtimeInfo ? 'المدة: <b>' . htmlspecialchars($downtimeInfo, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . "</b>\n" : '')
            . 'الوقت: ' . date('Y-m-d H:i:s');

        $managers = $this->getNetworkManagers($networkId);
        $metadata = json_encode(['router_id'=>$routerId,'nas_ip'=>$ip,'status'=>$status,'event_type'=>$eventType], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        try {
            $inApp = $this->db->prepare("INSERT INTO um_notifications (network_id,category,title,message,target_role,target_admin_id,is_read,metadata,created_at)
                VALUES (?,'alert',?,?,'all',?,0,?,NOW())");
            foreach ($managers as $manager) $inApp->execute([$networkId,$title,$body,(int)$manager['id'],$metadata]);
        } catch (Throwable $e) {
            error_log('Router status in-app notification write failed for network ' . $networkId . ': ' . $e->getMessage());
        }

        if (!empty($settings['telegram_enabled']) && !empty($settings['notify_routers'])) {
            try {
                (new TelegramService($this->db,$networkId))->sendMessage($html,null,'HTML',$eventType,$refId,null);
            } catch (Throwable $e) {
                error_log('Router status Telegram notification failed for network ' . $networkId . ': ' . $e->getMessage());
            }
        }

        if (!empty($settings['whatsapp_enabled']) && !empty($settings['notify_routers'])) {
            $whatsapp = new WhatsAppService($this->db,null,$networkId);
            $plain = ($isOnline ? '🟢 ' : '🔴 ') . $title . "\nالشبكة: #{$networkId}\nالراوتر: {$routerName}\nالعنوان: {$ip}\nالوقت: " . date('Y-m-d H:i:s');
            $phones = [];
            foreach ($managers as $manager) {
                $phone = WhatsAppService::normalizePhone((string)($manager['phone'] ?? ''));
                if ($phone !== '') $phones[$phone] = true;
            }
            foreach (array_keys($phones) as $phone) {
                try { $whatsapp->sendMessage($phone,$plain,$refId,null,$eventType); }
                catch (Throwable $e) { error_log('Router status WhatsApp notification failed for network ' . $networkId); }
            }
        }

        if (!empty($settings['fcm_enabled']) && !empty($settings['notify_routers'])) {
            $firebase = new FirebaseService($this->db,$networkId);
            $pushData = ['event_type'=>$eventType,'network_id'=>(string)$networkId,'router_id'=>(string)$routerId,'nas_ip'=>$ip,'status'=>$status,'click_action'=>'OPEN_ROUTERS_SCREEN'];
            foreach ($managers as $manager) {
                try { $firebase->sendToAdmin((int)$manager['id'],$title,$body,$pushData,$eventType,$refId,null); }
                catch (Throwable $e) { error_log('Router status FCM notification failed for network ' . $networkId); }
            }
        }
    }

    private function getNetworkManagers(int $networkId): array
    {
        $stmt = $this->db->prepare("SELECT DISTINCT a.id,a.fullname,a.phone
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            LEFT JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            WHERE a.is_active=1 AND (
                x.access_level IN ('manager','owner')
                OR COALESCE(r.role_key,a.role) IN ('superadmin','superadmin','supervisor')
            )");
        $stmt->execute([$networkId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}
