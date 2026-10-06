<?php
// Include-only API module; requests must pass through api.php authentication.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

// Platform-owner communications, inbox, push preference, sovereign Telegram, WhatsApp & Broadcast.

if (!function_exists('samOwnerSetting')) {
    function samOwnerSetting(PDO $db, string $key, string $default=''): string {
        $q=$db->prepare('SELECT setting_value FROM um_settings WHERE setting_key=?'); $q->execute([$key]);
        $v=$q->fetchColumn(); return $v===false?$default:(string)$v;
    }
}
if (!function_exists('samOwnerSet')) {
    function samOwnerSet(PDO $db, string $key, string $value): void {
        $q=$db->prepare('INSERT INTO um_settings(setting_key,setting_value,updated_at) VALUES(?,?,NOW()) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()');
        $q->execute([$key,$value]);
    }
}
if (!function_exists('jsonResponse')) {
    function jsonResponse($data, int $status = 200): void {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if (!isset($db) || !($db instanceof PDO)) {
    if (isset($pdo) && ($pdo instanceof PDO)) {
        $db = $pdo;
    } elseif (function_exists('getDB')) {
        $db = getDB();
    }
}
if (!isset($currentAdminId)) {
    $currentAdminId = (int)($_SESSION['admin_id'] ?? 1);
}

function samOwnerTelegramConfig(PDO $db): array {
    return [
        'enabled' => samOwnerSetting($db, 'system_owner_telegram_enabled', '0') === '1',
        'bot_token' => samOwnerSetting($db, 'system_owner_telegram_bot_token', ''),
        'chat_id' => samOwnerSetting($db, 'system_owner_telegram_chat_id', ''),
        'notify_backups' => samOwnerSetting($db, 'system_owner_telegram_notify_backups', '1') === '1',
        'notify_server_alerts' => samOwnerSetting($db, 'system_owner_telegram_notify_server_alerts', '1') === '1',
        'notify_sstp' => samOwnerSetting($db, 'system_owner_telegram_notify_sstp', '1') === '1',
        'notify_new_network' => samOwnerSetting($db, 'system_owner_telegram_notify_new_network', '1') === '1',
        'notify_security' => samOwnerSetting($db, 'system_owner_telegram_notify_security', '1') === '1',
    ];
}

function samOwnerSendTelegram(PDO $db, string $text, ?string $customChatId = null, string $parseMode = 'HTML'): array {
    $cfg = samOwnerTelegramConfig($db);
    $token = trim((string)($cfg['bot_token'] ?? ''));
    $chatId = trim((string)($customChatId ?: ($cfg['chat_id'] ?? '')));
    if (empty($token) || empty($chatId)) {
        return ['success' => false, 'error' => 'بيانات بوت تليجرام المالك غير مكتملة (يرجى إدخال Token و Chat ID)'];
    }
    $url = 'https://api.telegram.org/bot' . urlencode($token) . '/sendMessage';
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => $parseMode,
        'disable_web_page_preview' => true
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($payload),
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true
    ]);
    $res = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $json = is_string($res) ? (json_decode($res, true) ?: []) : [];

    $status = ($http === 200 && !empty($json['ok'])) ? 'sent' : 'failed';
    $errMsg = $status === 'sent' ? null : ($json['description'] ?? ($err ?: "HTTP Code {$http}"));

    try {
        $logStmt = $db->prepare("INSERT INTO um_notification_logs 
            (channel, event_type, recipient_chat_id, recipient_name, message_text, status, error_message, reference_id, created_by, created_at, network_id)
            VALUES ('telegram', 'owner_telegram_alert', ?, 'مالك النظام', ?, ?, ?, ?, 1, NOW(), 1)");
        $logStmt->execute([$chatId, $text, $status, $errMsg, 'owner_tg_' . time()]);
    } catch (Throwable $e) {}

    if ($status === 'sent') {
        return ['success' => true, 'message' => 'تم إرسال إشعار تليجرام للمالك بنجاح'];
    }
    return ['success' => false, 'error' => 'فشل إرسال تليجرام: ' . $errMsg];
}

function samOwnerWhatsAppConfig(PDO $db): array {
    return [
        'enabled' => samOwnerSetting($db, 'system_owner_whatsapp_enabled', '0') === '1',
        'api_url' => samOwnerSetting($db, 'system_owner_whatsapp_api_url', 'http://127.0.0.1:3388'),
        'owner_phone' => samOwnerSetting($db, 'system_owner_whatsapp_owner_phone', ''),
        'session_id' => samOwnerSetting($db, 'system_owner_whatsapp_session_id', 'system_owner'),
        'notify_backups' => samOwnerSetting($db, 'system_owner_whatsapp_notify_backups', '1') === '1',
        'notify_server_alerts' => samOwnerSetting($db, 'system_owner_whatsapp_notify_server_alerts', '1') === '1',
        'notify_security' => samOwnerSetting($db, 'system_owner_whatsapp_notify_security', '1') === '1',
    ];
}

function samOwnerSendWhatsApp(PDO $db, string $phone, string $message): array {
    $cfg = samOwnerWhatsAppConfig($db);
    $apiUrl = rtrim((string)($cfg['api_url'] ?: 'http://127.0.0.1:3388'), '/');
    $normalizedPhone = function_exists('normalizeYemenPhone') ? normalizeYemenPhone($phone) : preg_replace('/[^0-9]/', '', $phone);
    if (empty($normalizedPhone)) {
        return ['success' => false, 'error' => 'رقم هاتف المستلم غير صحيح'];
    }

    $ch = curl_init($apiUrl . '/send-message?network_id=0');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-SAM-Network-ID: 0'],
        CURLOPT_POSTFIELDS => json_encode([
            'network_id' => 0,
            'phone' => $normalizedPhone,
            'message' => $message
        ], JSON_UNESCAPED_UNICODE)
    ]);
    $res = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $json = is_string($res) ? (json_decode($res, true) ?: []) : [];

    $status = ($http >= 200 && $http < 300 && !empty($json['success'])) ? 'sent' : 'failed';
    $errMsg = $status === 'sent' ? null : ($json['error'] ?? ($err ?: "HTTP Code {$http}"));

    try {
        $logStmt = $db->prepare("INSERT INTO um_notification_logs 
            (channel, event_type, recipient_phone, recipient_name, message_text, status, error_message, reference_id, created_by, created_at, network_id)
            VALUES ('whatsapp', 'owner_whatsapp_alert', ?, 'مالك النظام', ?, ?, ?, ?, 1, NOW(), 1)");
        $logStmt->execute([$normalizedPhone, $message, $status, $errMsg, 'owner_wa_' . time()]);
    } catch (Throwable $e) {}

    if ($status === 'sent') {
        return ['success' => true, 'message' => 'تم إرسال رسالة واتساب بنجاح'];
    }
    return ['success' => false, 'error' => 'فشل إرسال واتساب: ' . $errMsg];
}

// -----------------------------------------------------------------------------
// 1. INBOX & ALERTS (صندوق التنبيهات)
// -----------------------------------------------------------------------------
if ($action === 'owner_system_notifications_get') {
    $alertsStmt = $db->prepare("SELECT n.id,n.network_id,COALESCE(net.name,'منصة النظام') AS network_name,
            n.title,n.message,CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS is_read,n.created_at
        FROM um_notifications n
        LEFT JOIN um_networks net ON net.id=n.network_id
        LEFT JOIN um_notification_receipts r ON r.network_id=n.network_id
            AND r.notification_id=n.id AND r.admin_id=?
        WHERE n.target_admin_id=? AND n.target_role='system_owner' AND n.category='system'
          AND JSON_VALID(n.metadata)=1
          AND JSON_UNQUOTE(JSON_EXTRACT(n.metadata,'$.scope'))='platform_owner'
          AND r.deleted_at IS NULL
        ORDER BY n.id DESC LIMIT 100");
    $alertsStmt->execute([(int)$currentAdminId,(int)$currentAdminId]);
    $alerts = $alertsStmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $db->prepare("SELECT COUNT(*) AS total,
            SUM(CASE WHEN r.read_at IS NULL THEN 1 ELSE 0 END) AS unread
        FROM um_notifications n
        LEFT JOIN um_notification_receipts r ON r.network_id=n.network_id
            AND r.notification_id=n.id AND r.admin_id=?
        WHERE n.target_admin_id=? AND n.target_role='system_owner' AND n.category='system'
          AND JSON_VALID(n.metadata)=1
          AND JSON_UNQUOTE(JSON_EXTRACT(n.metadata,'$.scope'))='platform_owner'
          AND r.deleted_at IS NULL");
    $countStmt->execute([(int)$currentAdminId,(int)$currentAdminId]);
    $counts = $countStmt->fetch(PDO::FETCH_ASSOC) ?: ['total'=>0,'unread'=>0];

    $ownerDevices = 0;
    try {
        $deviceStmt = $db->prepare("SELECT COUNT(DISTINCT t.fcm_token)
            FROM um_fcm_tokens t
            JOIN um_admin_network_access x ON x.admin_id=t.admin_id AND x.network_id=t.network_id AND x.is_active=1
            JOIN um_networks net ON net.id=t.network_id AND net.status='active'
            WHERE t.admin_id=? AND t.is_active=1
              AND (x.starts_at IS NULL OR x.starts_at<=NOW())
              AND (x.expires_at IS NULL OR x.expires_at>NOW())");
        $deviceStmt->execute([(int)$currentAdminId]);
        $ownerDevices = (int)$deviceStmt->fetchColumn();
    } catch (Throwable $e) {}

    jsonResponse([
        'success'=>true,
        'settings'=>[
            'push_enabled'=>samOwnerSetting($db,'system_owner_alert_push_enabled','1') !== '0',
            'telegram'=>samOwnerTelegramConfig($db),
            'whatsapp'=>samOwnerWhatsAppConfig($db)
        ],
        'summary'=>[
            'total'=>(int)($counts['total'] ?? 0),
            'unread'=>(int)($counts['unread'] ?? 0),
            'owner_devices'=>$ownerDevices
        ],
        'alerts'=>$alerts
    ]);
}

if ($action === 'owner_system_notifications_save') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $enabled = filter_var($in['push_enabled'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($enabled !== null) {
        samOwnerSet($db, 'system_owner_alert_push_enabled', $enabled ? '1' : '0');
    }
    jsonResponse(['success'=>true, 'push_enabled'=>$enabled]);
}

if ($action === 'owner_system_notification_read') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $notificationId = (int)($in['id'] ?? 0);
    if ($notificationId <= 0) jsonResponse(['success'=>false,'error'=>'معرّف التنبيه غير صالح'],400);
    $stmt = $db->prepare("INSERT INTO um_notification_receipts (network_id,notification_id,admin_id,read_at)
        SELECT n.network_id,n.id,?,NOW() FROM um_notifications n
        WHERE n.id=? AND n.target_admin_id=? AND n.target_role='system_owner' AND n.category='system'
          AND JSON_VALID(n.metadata)=1
          AND JSON_UNQUOTE(JSON_EXTRACT(n.metadata,'$.scope'))='platform_owner'
        ON DUPLICATE KEY UPDATE read_at=NOW()");
    $stmt->execute([(int)$currentAdminId,$notificationId,(int)$currentAdminId]);
    jsonResponse(['success'=>true,'updated'=>$stmt->rowCount()]);
}

if ($action === 'owner_system_notifications_read_all') {
    $stmt = $db->prepare("INSERT INTO um_notification_receipts (network_id,notification_id,admin_id,read_at)
        SELECT n.network_id,n.id,?,NOW() FROM um_notifications n
        WHERE n.target_admin_id=? AND n.target_role='system_owner' AND n.category='system'
          AND JSON_VALID(n.metadata)=1
          AND JSON_UNQUOTE(JSON_EXTRACT(n.metadata,'$.scope'))='platform_owner'
        ON DUPLICATE KEY UPDATE read_at=NOW()");
    $stmt->execute([(int)$currentAdminId,(int)$currentAdminId]);
    jsonResponse(['success'=>true,'updated'=>$stmt->rowCount()]);
}

// -----------------------------------------------------------------------------
// 2. SOVEREIGN TELEGRAM (بوت وقناة تليجرام المالك)
// -----------------------------------------------------------------------------
if ($action === 'owner_system_telegram_get') {
    jsonResponse([
        'success' => true,
        'telegram' => samOwnerTelegramConfig($db)
    ]);
}

if ($action === 'owner_system_telegram_save') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $enabled = !empty($in['enabled']) ? '1' : '0';
    $botToken = trim((string)($in['bot_token'] ?? ''));
    $chatId = trim((string)($in['chat_id'] ?? ''));
    
    samOwnerSet($db, 'system_owner_telegram_enabled', $enabled);
    if ($botToken !== '') samOwnerSet($db, 'system_owner_telegram_bot_token', $botToken);
    if ($chatId !== '') samOwnerSet($db, 'system_owner_telegram_chat_id', $chatId);
    
    samOwnerSet($db, 'system_owner_telegram_notify_backups', !empty($in['notify_backups']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_telegram_notify_server_alerts', !empty($in['notify_server_alerts']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_telegram_notify_sstp', !empty($in['notify_sstp']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_telegram_notify_new_network', !empty($in['notify_new_network']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_telegram_notify_security', !empty($in['notify_security']) ? '1' : '0');

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ إعدادات بوت تليجرام المالك السيادي بنجاح',
        'telegram' => samOwnerTelegramConfig($db)
    ]);
}

if ($action === 'owner_system_telegram_test') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $testChatId = trim((string)($in['chat_id'] ?? '')) ?: null;
    
    $msg = "👑 <b>فحص اتصال بوت تليجرام مالك النظام السيادي</b>\n";
    $msg .= "━━━━━━━━━━━━━━━━━━\n";
    $msg .= "🏢 <b>المنصة:</b> SAM Platform Sovereign Hub\n";
    $msg .= "👤 <b>المالك:</b> " . htmlspecialchars($_SESSION['fullname'] ?? 'مالك النظام') . "\n";
    $msg .= "⏱️ <b>الوقت:</b> " . date('Y-m-d H:i:s') . "\n";
    $msg .= "✅ <b>الحالة:</b> الاتصال المباشر يعمل بكفاءة تامة.";

    $res = samOwnerSendTelegram($db, $msg, $testChatId);
    jsonResponse($res);
}

// -----------------------------------------------------------------------------
// 3. SOVEREIGN WHATSAPP (خادم وقناة واتساب المالك)
// -----------------------------------------------------------------------------
if ($action === 'owner_system_whatsapp_get') {
    $cfg = samOwnerWhatsAppConfig($db);
    // Check local session status
    $status = ['status' => 'DISCONNECTED', 'connected' => false];
    try {
        $ch = curl_init(rtrim($cfg['api_url'], '/') . '/status?network_id=0');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 4,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_HTTPHEADER => ['X-SAM-Network-ID: 0']
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
        if ($res) {
            $status = json_decode($res, true) ?: $status;
        }
    } catch (Throwable $e) {}

    jsonResponse([
        'success' => true,
        'whatsapp' => $cfg,
        'session_status' => $status
    ]);
}

if ($action === 'owner_system_whatsapp_save') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $enabled = !empty($in['enabled']) ? '1' : '0';
    $apiUrl = trim((string)($in['api_url'] ?? 'http://127.0.0.1:3388'));
    $phone = trim((string)($in['owner_phone'] ?? ''));
    
    samOwnerSet($db, 'system_owner_whatsapp_enabled', $enabled);
    if ($apiUrl !== '') samOwnerSet($db, 'system_owner_whatsapp_api_url', $apiUrl);
    if ($phone !== '') samOwnerSet($db, 'system_owner_whatsapp_owner_phone', $phone);
    
    samOwnerSet($db, 'system_owner_whatsapp_notify_backups', !empty($in['notify_backups']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_whatsapp_notify_server_alerts', !empty($in['notify_server_alerts']) ? '1' : '0');
    samOwnerSet($db, 'system_owner_whatsapp_notify_security', !empty($in['notify_security']) ? '1' : '0');

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ إعدادات خادم واتساب المالك السيادي بنجاح',
        'whatsapp' => samOwnerWhatsAppConfig($db)
    ]);
}

if ($action === 'owner_system_whatsapp_test') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $targetPhone = trim((string)($in['phone'] ?? '')) ?: samOwnerSetting($db, 'system_owner_whatsapp_owner_phone', '');
    if (empty($targetPhone)) {
        jsonResponse(['success' => false, 'error' => 'يرجى تحديد رقم هاتف المالك لإرسال رسالة الاختبار']);
    }

    $msg = "👑 *إشعار اختبار واتساب مالك النظام السيادي*\n"
        . "━━━━━━━━━━━━━━━━━━\n"
        . "🏢 *المنصة:* SAM Sovereign Portal\n"
        . "👤 *المالك:* " . ($_SESSION['fullname'] ?? 'مالك النظام') . "\n"
        . "⏱️ *الوقت:* " . date('Y-m-d H:i:s') . "\n"
        . "✅ *الحالة:* بوابة إرسال رسائل واتساب السيادية تعمل بنجاح.";

    $res = samOwnerSendWhatsApp($db, $targetPhone, $msg);
    jsonResponse($res);
}

if ($action === 'owner_system_whatsapp_qr') {
    $cfg = samOwnerWhatsAppConfig($db);
    $apiUrl = rtrim($cfg['api_url'], '/');
    $ch = curl_init($apiUrl . '/qr?network_id=0');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['X-SAM-Network-ID: 0']
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $json = is_string($res) ? (json_decode($res, true) ?: []) : [];
    jsonResponse($json);
}

// -----------------------------------------------------------------------------
// 4. SOVEREIGN BROADCAST DISPATCH (إرسال تعميم وإشعارات المنظومة)
// -----------------------------------------------------------------------------
if ($action === 'owner_system_broadcast_send') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $title = trim((string)($in['title'] ?? ''));
    $message = trim((string)($in['message'] ?? ''));
    $targetAudience = trim((string)($in['target_audience'] ?? 'all_admins'));
    $channels = (array)($in['channels'] ?? ['in_app']);
    $networkId = (int)($in['network_id'] ?? 0);

    if (empty($title) || empty($message)) {
        jsonResponse(['success' => false, 'error' => 'عنوان ونص التعميم مطلوبان']);
    }

    // 1. Resolve recipients
    $recipients = [];
    if ($targetAudience === 'all_admins') {
        $q = $db->query("SELECT id, username, fullname, phone, role FROM um_admins WHERE is_active=1 AND id != 1");
        $recipients = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    } elseif ($targetAudience === 'network_managers') {
        $q = $db->query("SELECT id, username, fullname, phone, role FROM um_admins WHERE is_active=1 AND role IN ('superadmin', 'admin') AND id != 1");
        $recipients = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    } elseif ($targetAudience === 'distributors') {
        $q = $db->query("SELECT id, username, fullname, phone, role FROM um_admins WHERE is_active=1 AND role = 'distributor'");
        $recipients = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    } elseif ($targetAudience === 'pos_agents') {
        $q = $db->query("SELECT id, username, fullname, phone, role FROM um_admins WHERE is_active=1 AND role = 'pos_agent'");
        $recipients = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    } elseif ($targetAudience === 'specific_network' && $networkId > 0) {
        $q = $db->prepare("SELECT a.id, a.username, a.fullname, a.phone, a.role 
            FROM um_admins a 
            JOIN um_admin_network_access na ON na.admin_id = a.id 
            WHERE na.network_id = ? AND na.is_active = 1 AND a.is_active = 1");
        $q->execute([$networkId]);
        $recipients = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    }

    $inAppCount = 0;
    $waCount = 0;
    $tgCount = 0;

    // A. In-App Notifications
    if (in_array('in_app', $channels, true)) {
        $notifStmt = $db->prepare("INSERT INTO um_notifications 
            (category, title, message, target_role, target_admin_id, is_read, metadata, created_at, network_id)
            VALUES ('system', ?, ?, ?, ?, 0, ?, NOW(), ?)");
        
        $meta = json_encode(['scope' => 'platform_broadcast', 'sender' => 'مالك النظام', 'sent_at' => date('Y-m-d H:i:s')], JSON_UNESCAPED_UNICODE);

        foreach ($recipients as $rec) {
            $notifStmt->execute([
                $title,
                $message,
                $rec['role'],
                (int)$rec['id'],
                $meta,
                $networkId > 0 ? $networkId : 1
            ]);
            $inAppCount++;
        }
    }

    // B. WhatsApp Broadcast
    if (in_array('whatsapp', $channels, true)) {
        foreach ($recipients as $rec) {
            if (!empty($rec['phone'])) {
                $waText = "📢 *تعميم رسمي من مالك النظام*\n"
                    . "━━━━━━━━━━━━━━━━━━\n"
                    . "📌 *" . $title . "*\n\n"
                    . $message . "\n\n"
                    . "⏱️ " . date('Y-m-d H:i:s') . "\n"
                    . "🏢 إدارة المنظومة الرئيسية";
                samOwnerSendWhatsApp($db, $rec['phone'], $waText);
                $waCount++;
            }
        }
    }

    // C. Telegram Sovereign Bot Broadcast (Post to Owner's Telegram Channel/Group)
    if (in_array('telegram', $channels, true)) {
        $tgText = "📢 <b>تعميم رسمي من مالك النظام</b>\n"
            . "━━━━━━━━━━━━━━━━━━\n"
            . "📌 <b>" . htmlspecialchars($title) . "</b>\n\n"
            . htmlspecialchars($message) . "\n\n"
            . "👥 <b>الفئة المستهدفة:</b> " . htmlspecialchars($targetAudience) . " (" . count($recipients) . " مستلم)\n"
            . "⏱️ " . date('Y-m-d H:i:s');
        samOwnerSendTelegram($db, $tgText);
        $tgCount++;
    }

    // Log Activity
    if (isset($service) && method_exists($service, 'logActivity')) {
        $service->logActivity('owner_broadcast_sent', 'system', "تعميم المنظومة: {$title}", "تم إرسال تعميم إلى " . count($recipients) . " مستخدم عبر القنوات المختارة", 'success', (int)$currentAdminId);
    }

    jsonResponse([
        'success' => true,
        'message' => "تم إرسال واعتماد التعميم بنجاح إلى " . count($recipients) . " مستخدم",
        'summary' => [
            'recipients_count' => count($recipients),
            'in_app_count' => $inAppCount,
            'whatsapp_count' => $waCount,
            'telegram_count' => $tgCount
        ]
    ]);
}

if ($action === 'owner_system_broadcast_logs') {
    $q = $db->query("SELECT l.*, n.name AS network_name 
        FROM um_notification_logs l 
        LEFT JOIN um_networks n ON n.id = l.network_id 
        WHERE l.event_type LIKE 'owner_%' OR l.event_type = 'platform_broadcast' OR l.channel IN ('whatsapp', 'telegram')
        ORDER BY l.id DESC LIMIT 100");
    $logs = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];
    jsonResponse([
        'success' => true,
        'logs' => $logs
    ]);
}

// -----------------------------------------------------------------------------
// 5. SOVEREIGN WHATSAPP OUTBOX & FAILED MESSAGES LOGS (سجل وإعادة إرسال رسائل الواتساب)
// -----------------------------------------------------------------------------
if ($action === 'owner_system_whatsapp_logs') {
    $statusFilter = trim((string)($_GET['status'] ?? 'all'));
    $search = trim((string)($_GET['search'] ?? ''));
    $limit = min(max((int)($_GET['limit'] ?? 50), 10), 200);
    $page = max((int)($_GET['page'] ?? 1), 1);
    $offset = ($page - 1) * $limit;

    // Build query conditions
    $where = ["l.channel = 'whatsapp'"];
    $params = [];

    if ($statusFilter === 'failed') {
        $where[] = "l.status = 'failed'";
    } elseif ($statusFilter === 'sent') {
        $where[] = "l.status = 'sent'";
    } elseif ($statusFilter === 'pending') {
        $where[] = "l.status = 'pending'";
    }

    if ($search !== '') {
        $where[] = "(l.recipient_phone LIKE ? OR l.recipient_name LIKE ? OR l.message_text LIKE ? OR l.event_type LIKE ? OR l.error_message LIKE ?)";
        $sWild = "%{$search}%";
        $params = array_merge($params, [$sWild, $sWild, $sWild, $sWild, $sWild]);
    }

    $whereSql = implode(' AND ', $where);

    // Summary counts
    $countsStmt = $db->query("
        SELECT 
            COUNT(*) AS total_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
        FROM um_notification_logs 
        WHERE channel = 'whatsapp'
    ");
    $summaryCounts = $countsStmt ? $countsStmt->fetch(PDO::FETCH_ASSOC) : [];

    // Filtered total
    $countSql = "SELECT COUNT(*) FROM um_notification_logs l WHERE {$whereSql}";
    $stmtC = $db->prepare($countSql);
    $stmtC->execute($params);
    $filteredTotal = (int)$stmtC->fetchColumn();

    // Fetch logs
    $dataSql = "
        SELECT l.*, COALESCE(n.name, '👑 المنظومة السيادية') AS network_name 
        FROM um_notification_logs l 
        LEFT JOIN um_networks n ON n.id = l.network_id 
        WHERE {$whereSql} 
        ORDER BY l.id DESC 
        LIMIT {$limit} OFFSET {$offset}
    ";
    $stmtD = $db->prepare($dataSql);
    $stmtD->execute($params);
    $logs = $stmtD->fetchAll(PDO::FETCH_ASSOC);

    // Friendly event labels
    $eventLabels = [
        'password_reset_otp' => '🔑 رمز استعادة كلمة المرور',
        'registration_otp' => '📝 رمز تأكيد التسجيل',
        'account_created' => '👤 بيانات حساب جديد',
        'account_updated' => '⚙️ تحديث بيانات الحساب',
        'router_offline' => '🚨 تنبيه انقطاع راوتر / برج',
        'router_online' => '✅ عودة راوتر للخدمة',
        'owner_whatsapp_alert' => '👑 تنبيه مالك النظام',
        'platform_broadcast' => '📢 تعميم رسمي للمنظومة',
        'voucher_purchase' => '🎫 شراء وشحن كروت',
        'free_voucher' => '🎁 كرت مجاني',
        'custom_message' => '💬 رسالة مباشرة',
        'backup_alert' => '📦 تنبيه النسخ الاحتياطي',
        'server_alert' => '🖥️ تنبيه أداء الخادم',
        'test_message' => '🧪 رسالة فحص تجريبية'
    ];

    foreach ($logs as &$item) {
        $ev = (string)($item['event_type'] ?? '');
        $item['event_label'] = $eventLabels[$ev] ?? $ev;
        $item['can_retry'] = !empty($item['recipient_phone']) && !empty($item['message_text']);
    }
    unset($item);

    jsonResponse([
        'success' => true,
        'summary' => [
            'total_count' => (int)($summaryCounts['total_count'] ?? 0),
            'failed_count' => (int)($summaryCounts['failed_count'] ?? 0),
            'sent_count' => (int)($summaryCounts['sent_count'] ?? 0),
            'pending_count' => (int)($summaryCounts['pending_count'] ?? 0),
            'filtered_total' => $filteredTotal
        ],
        'page' => $page,
        'limit' => $limit,
        'logs' => $logs
    ]);
}

if ($action === 'owner_system_whatsapp_retry') {
    $in = (isset($in) && is_array($in) && !empty($in)) ? $in : (json_decode(file_get_contents('php://input'), true) ?: ($_POST ?: ($_GET ?: [])));
    $logId = (int)($in['log_id'] ?? $in['id'] ?? 0);
    if ($logId <= 0) {
        jsonResponse(['success' => false, 'error' => 'معرّف الرسالة غير صالح'], 400);
    }

    $stmt = $db->prepare("SELECT * FROM um_notification_logs WHERE id = ? AND channel = 'whatsapp' LIMIT 1");
    $stmt->execute([$logId]);
    $log = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$log) {
        jsonResponse(['success' => false, 'error' => 'سجل الرسالة غير موجود'], 404);
    }

    $phone = trim((string)($log['recipient_phone'] ?? ''));
    $msg = (string)($log['message_text'] ?? '');
    if (empty($phone) || empty($msg)) {
        jsonResponse(['success' => false, 'error' => 'بيانات الرسالة غير مكتملة (الرقم أو النص فارغ)'], 400);
    }

    // Attempt re-sending via Sovereign WhatsApp Gateway (Session #0)
    try {
        require_once __DIR__ . '/includes/WhatsAppService.php';
        $wa = new WhatsAppService($db, null, 0);
        $res = $wa->sendMessage($phone, $msg, 'retry_' . $log['id'] . '_' . time(), (int)$currentAdminId, (string)$log['event_type']);

        if (!empty($res['success'])) {
            // Update the original log entry to sent
            $upd = $db->prepare("UPDATE um_notification_logs SET status = 'sent', error_message = NULL, sender_phone = '👑 Sovereign Gateway (Session 0)' WHERE id = ?");
            $upd->execute([$logId]);

            jsonResponse([
                'success' => true,
                'message' => "تمت إعادة إرسال الرسالة بنجاح إلى الرقم ({$phone}) عبر بوابة المالك 🟢",
                'log_id' => $logId,
                'status' => 'sent'
            ]);
        } else {
            $errMsg = (string)($res['error'] ?? 'فشل الإرسال عبر خادم الواتساب');
            $upd = $db->prepare("UPDATE um_notification_logs SET error_message = ? WHERE id = ?");
            $upd->execute([$errMsg, $logId]);

            jsonResponse([
                'success' => false,
                'error' => "تعذر إعادة الإرسال: {$errMsg}",
                'log_id' => $logId,
                'status' => 'failed'
            ]);
        }
    } catch (Throwable $e) {
        jsonResponse(['success' => false, 'error' => 'حدث استثناء أثناء إعادة الإرسال: ' . $e->getMessage()]);
    }
}

if ($action === 'owner_system_whatsapp_retry_all') {
    $q = $db->query("SELECT * FROM um_notification_logs WHERE channel = 'whatsapp' AND status = 'failed' ORDER BY id DESC LIMIT 50");
    $failedLogs = $q ? $q->fetchAll(PDO::FETCH_ASSOC) : [];

    if (empty($failedLogs)) {
        jsonResponse(['success' => true, 'message' => 'لا توجد رسائل فاشلة حالياً لإعادة إرسالها', 'retried' => 0, 'succeeded' => 0, 'failed' => 0]);
    }

    require_once __DIR__ . '/includes/WhatsAppService.php';
    $wa = new WhatsAppService($db, null, 0);

    $succeeded = 0;
    $failed = 0;

    foreach ($failedLogs as $fl) {
        $logId = (int)$fl['id'];
        $phone = trim((string)($fl['recipient_phone'] ?? ''));
        $msg = (string)($fl['message_text'] ?? '');

        if (empty($phone) || empty($msg)) {
            $failed++;
            continue;
        }

        try {
            $res = $wa->sendMessage($phone, $msg, 'retry_all_' . $logId . '_' . time(), (int)$currentAdminId, (string)$fl['event_type']);
            if (!empty($res['success'])) {
                $upd = $db->prepare("UPDATE um_notification_logs SET status = 'sent', error_message = NULL, sender_phone = '👑 Sovereign Gateway (Session 0)' WHERE id = ?");
                $upd->execute([$logId]);
                $succeeded++;
            } else {
                $errMsg = (string)($res['error'] ?? 'فشل الإرسال');
                $upd = $db->prepare("UPDATE um_notification_logs SET error_message = ? WHERE id = ?");
                $upd->execute([$errMsg, $logId]);
                $failed++;
            }
        } catch (Throwable $e) {
            $failed++;
        }
    }

    $total = count($failedLogs);
    jsonResponse([
        'success' => true,
        'message' => "تمت معالجة إعادة الإرسال لـ {$total} رسالة: نجح إرسال {$succeeded} 🟢 وفشل {$failed} 🔴",
        'total' => $total,
        'succeeded' => $succeeded,
        'failed' => $failed
    ]);
}

if ($action === 'owner_system_whatsapp_delete_log') {
    $in = (isset($in) && is_array($in) && !empty($in)) ? $in : (json_decode(file_get_contents('php://input'), true) ?: ($_POST ?: ($_GET ?: [])));
    $logId = (int)($in['log_id'] ?? $in['id'] ?? 0);
    $clearAllFailed = !empty($in['clear_all_failed']);

    if ($clearAllFailed) {
        $del = $db->query("DELETE FROM um_notification_logs WHERE channel = 'whatsapp' AND status = 'failed'");
        jsonResponse(['success' => true, 'message' => 'تم حذف ومسح كافة سجلات الرسائل الفاشلة بنجاح 🗑️']);
    } elseif ($logId > 0) {
        $stmt = $db->prepare("DELETE FROM um_notification_logs WHERE id = ? AND channel = 'whatsapp'");
        $stmt->execute([$logId]);
        jsonResponse(['success' => true, 'message' => 'تم حذف سجل الرسالة بنجاح']);
    } else {
        jsonResponse(['success' => false, 'error' => 'معرّف السجل غير صالح'], 400);
    }
}
