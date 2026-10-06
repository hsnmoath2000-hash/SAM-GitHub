<?php
declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';

/** Network-aware interface to the local multi-session WhatsApp gateway. */
class WhatsAppService
{
    private PDO $db;
    private string $apiUrl;
    private int $networkId;
    private NetworkChannelService $channels;

    public function __construct(PDO $db, ?string $apiUrl = null, ?int $networkId = null)
    {
        $this->db = $db;
        $this->channels = new NetworkChannelService($db);
        if ($networkId === null || $networkId < 0) {
            $networkId = $this->channels->activeNetworkId();
        }
        $this->networkId = ($networkId === 0) ? 0 : $this->channels->normalizeNetworkId($networkId, true);
        $channel = $this->channels->getChannel($this->networkId, 'whatsapp');
        // The local gateway is shared infrastructure; network_id selects its
        // isolated WhatsApp session. Never inherit a URL from legacy settings.
        $configuredUrl = trim((string)($channel['api_url'] ?? ''));
        $this->apiUrl = rtrim($apiUrl ?: ($configuredUrl !== '' ? $configuredUrl : 'http://127.0.0.1:3388'), '/');
    }

    public function getNetworkId(): int { return $this->networkId; }

    public static function normalizePhone($phone): string
    {
        if (function_exists('normalizeYemenPhone')) return normalizeYemenPhone((string)$phone);
        $digits = preg_replace('/[^0-9]/', '', (string)$phone);
        if (str_starts_with($digits, '00967')) $digits = substr($digits, 2);
        if (str_starts_with($digits, '967') && strlen($digits) === 12) return $digits;
        if (str_starts_with($digits, '07') && strlen($digits) === 10) return '967' . substr($digits, 1);
        if (str_starts_with($digits, '7') && strlen($digits) === 9) return '967' . $digits;
        if (strlen($digits) === 9) return '967' . $digits;
        return $digits;
    }

    public function isEnabled(): bool
    {
        return $this->isEnabledForNetwork($this->networkId);
    }

    public function isEnabledForNetwork(int $netId): bool
    {
        if ($netId === 0) {
            return true;
        }
        $channel = $this->channels->getChannel($netId, 'whatsapp');
        $settings = $this->channels->getNotificationSettings($netId);
        return !empty($channel['is_enabled']) && !empty($settings['whatsapp_enabled']);
    }

    private function request(string $method, string $path, ?array $body = null): array
    {
        return $this->requestWithNetwork($this->networkId, $method, $path, $body);
    }

    private function requestWithNetwork(int $netId, string $method, string $path, ?array $body = null): array
    {
        $separator = str_contains($path, '?') ? '&' : '?';
        $url = $this->apiUrl . $path . $separator . 'network_id=' . $netId;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-SAM-Network-ID: ' . $netId],
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        $res = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $json = is_string($res) ? (json_decode($res, true) ?: []) : [];
        if ($http < 200 || $http >= 300) $json['error'] = $json['error'] ?? ($err ?: "HTTP Code {$http}");
        return $json;
    }

    public function getStatus(): array
    {
        try { return $this->request('GET', '/status') ?: ['status' => 'DISCONNECTED', 'connected' => false]; }
        catch (Throwable $e) { return ['status' => 'ERROR', 'message' => $e->getMessage(), 'connected' => false]; }
    }

    public function getQr(): array
    {
        try { return $this->request('GET', '/qr') ?: ['qr' => null, 'status' => 'UNAVAILABLE']; }
        catch (Throwable $e) { return ['qr' => null, 'error' => $e->getMessage()]; }
    }

    public function testMessage($phone, $gateway = null, $token = null): array
    {
        return $this->sendMessage($phone, 'رسالة اختبارية من منظومة ميكروتك مانجر لتأكيد ربط واتساب بالشبكة بنجاح 🌐', 'test_' . time());
    }

    public function sendMessage($phone, $message, $referenceId = null, $createdBy = null, string $eventType = 'custom_message'): array
    {
        $cleanPhone = self::normalizePhone($phone);
        if ($cleanPhone === '') return ['success' => false, 'error' => 'رقم الهاتف غير صالح أو فارغ'];

        $targetNetworkId = $this->networkId;
        // Only auto-detect if this is a general/unscoped request and NOT explicitly scoped to Sovereign Gateway (0)
        if ($targetNetworkId < 0) {
            $targetNetworkId = $this->channels->activeNetworkId();
        }

        // Auto-detect network_id for recipient phone only if network is not explicitly set
        if ($this->networkId < 0 && $targetNetworkId <= 0 && $cleanPhone !== '') {
            try {
                $suffix9 = strlen($cleanPhone) >= 9 ? substr($cleanPhone, -9) : $cleanPhone;
                $netStmt = $this->db->prepare("
                    SELECT a.network_id 
                    FROM um_admin_network_access a 
                    JOIN um_admins adm ON adm.id = a.admin_id 
                    WHERE (adm.phone = ? OR adm.phone LIKE ? OR adm.phone LIKE ?) AND a.is_active = 1 
                    ORDER BY a.is_default DESC LIMIT 1
                ");
                $netStmt->execute([$cleanPhone, "%" . $suffix9, "%" . $cleanPhone]);
                $detected = (int)$netStmt->fetchColumn();
                if ($detected > 0) {
                    $targetNetworkId = $detected;
                }
            } catch (Throwable $e) {}
        }
        if ($this->networkId < 0 && $targetNetworkId <= 0 && $cleanPhone !== '') {
            try {
                $vStmt = $this->db->prepare("
                    SELECT MIN(network_id) FROM um_vouchers_meta WHERE (username = ? OR buyer_phone = ?) AND network_id > 0 HAVING COUNT(DISTINCT network_id) = 1
                ");
                $vStmt->execute([$cleanPhone, $cleanPhone]);
                $detected = (int)$vStmt->fetchColumn();
                if ($detected > 0) {
                    $targetNetworkId = $detected;
                }
            } catch (Throwable $e) { error_log("WhatsApp recipient network lookup failed: " . get_class($e) . ":" . $e->getCode()); }
        }

        if ($targetNetworkId < 0) {
            $targetNetworkId = 0;
        }

        $sent = false;
        $error = null;
        $response = [];

        $channel = $this->channels->getChannel($targetNetworkId, 'whatsapp');
        $senderPhone = $channel['label'] ?? ($targetNetworkId === 0 ? '👑 Sovereign Gateway #0' : null);

        if ($this->isEnabledForNetwork($targetNetworkId)) {
            try {
                $response = $this->requestWithNetwork($targetNetworkId, 'POST', '/send-message', ['network_id' => $targetNetworkId, 'phone' => $cleanPhone, 'message' => $message]);
                $sent = !empty($response['success']);
                $error = $sent ? null : (string)($response['error'] ?? 'WHATSAPP_SEND_FAILED');
            } catch (Throwable $e) {
                $error = $e->getMessage();
            }
        } else {
            $error = "خدمة الواتساب غير مفعلة للشبكة #{$targetNetworkId}";
        }

        // Automatic fallback to Sovereign Owner Session 0 for critical events or when network session is offline/failed
        $isSystemCritical = str_contains($eventType, 'otp') || 
                            str_contains($eventType, 'account_') || 
                            str_contains($eventType, 'owner_') || 
                            str_contains($eventType, 'system_') || 
                            str_contains($eventType, 'router_') ||
                            str_contains($eventType, 'custom_message') ||
                            $targetNetworkId === 0;

        if (!$sent && ($isSystemCritical || $targetNetworkId === 0)) {
            try {
                $fallbackRes = $this->requestWithNetwork(0, 'POST', '/send-message', [
                    'network_id' => 0,
                    'phone' => $cleanPhone,
                    'message' => $message
                ]);
                if (!empty($fallbackRes['success'])) {
                    $sent = true;
                    $error = null;
                    $response = $fallbackRes;
                    $senderPhone = '👑 Sovereign Gateway (Session 0)';
                }
            } catch (Throwable $e) {}
        }

        // Logging happens after delivery.
        try {
            $stmt = $this->db->prepare("INSERT INTO um_notification_logs (channel,event_type,recipient_phone,sender_phone,message_text,status,error_message,reference_id,created_by,network_id) VALUES ('whatsapp',?,?,?,?,?,?,?,?,?)");
            $stmt->execute([$eventType, $cleanPhone, $senderPhone, $message, $sent ? 'sent' : 'failed', $error, $referenceId, $createdBy, $targetNetworkId]);
        } catch (Throwable $logError) {
            error_log('WhatsApp notification log write failed for network ' . $targetNetworkId . ': ' . $logError->getMessage());
        }

        if (!$sent) {
            $this->alertAdminWhatsAppDisconnected($targetNetworkId, $cleanPhone, $error, $eventType);
        }

        return ['success' => $sent, 'error' => $error, 'phone' => $cleanPhone, 'network_id' => $targetNetworkId, 'response' => $response];
    }

    public function sendMedia($phone, string $base64, string $caption = '', string $mimetype = 'image/png', string $filename = 'card.png', $referenceId = null, $createdBy = null, string $eventType = 'voucher_media'): array
    {
        $cleanPhone = self::normalizePhone($phone);
        if ($cleanPhone === '') return ['success' => false, 'error' => 'رقم الهاتف غير صالح أو فارغ'];

        // Clean base64 data header if present
        if (str_contains($base64, ';base64,')) {
            $parts = explode(';base64,', $base64);
            $base64 = $parts[1] ?? $base64;
        }
        $base64 = trim($base64);
        if ($base64 === '') return ['success' => false, 'error' => 'بيانات الصورة/الملف فارغة'];

        $targetNetworkId = $this->networkId;
        if ($targetNetworkId < 0) {
            $targetNetworkId = $this->channels->activeNetworkId();
        }

        // Auto-detect network_id for recipient phone only if network is not explicitly set
        if ($this->networkId < 0 && $targetNetworkId <= 0 && $cleanPhone !== '') {
            try {
                $suffix9 = strlen($cleanPhone) >= 9 ? substr($cleanPhone, -9) : $cleanPhone;
                $netStmt = $this->db->prepare("
                    SELECT a.network_id 
                    FROM um_admin_network_access a 
                    JOIN um_admins adm ON adm.id = a.admin_id 
                    WHERE (adm.phone = ? OR adm.phone LIKE ? OR adm.phone LIKE ?) AND a.is_active = 1 
                    ORDER BY a.is_default DESC LIMIT 1
                ");
                $netStmt->execute([$cleanPhone, "%" . $suffix9, "%" . $cleanPhone]);
                $detected = (int)$netStmt->fetchColumn();
                if ($detected > 0) {
                    $targetNetworkId = $detected;
                }
            } catch (Throwable $e) {}
        }
        if ($this->networkId < 0 && $targetNetworkId <= 0 && $cleanPhone !== '') {
            try {
                $vStmt = $this->db->prepare("
                    SELECT MIN(network_id) FROM um_vouchers_meta WHERE (username = ? OR buyer_phone = ?) AND network_id > 0 HAVING COUNT(DISTINCT network_id) = 1
                ");
                $vStmt->execute([$cleanPhone, $cleanPhone]);
                $detected = (int)$vStmt->fetchColumn();
                if ($detected > 0) {
                    $targetNetworkId = $detected;
                }
            } catch (Throwable $e) { error_log("WhatsApp recipient network lookup failed: " . get_class($e) . ":" . $e->getCode()); }
        }

        if ($targetNetworkId < 0) {
            $targetNetworkId = 0;
        }

        $sent = false;
        $error = null;
        $response = [];

        $channel = $this->channels->getChannel($targetNetworkId, 'whatsapp');
        $senderPhone = $channel['label'] ?? ($targetNetworkId === 0 ? '👑 Sovereign Gateway #0' : null);

        if ($this->isEnabledForNetwork($targetNetworkId)) {
            try {
                $response = $this->requestWithNetwork($targetNetworkId, 'POST', '/send-media', [
                    'network_id' => $targetNetworkId,
                    'phone' => $cleanPhone,
                    'base64' => $base64,
                    'mimetype' => $mimetype,
                    'filename' => $filename,
                    'caption' => $caption
                ]);
                $sent = !empty($response['success']);
                $error = $sent ? null : (string)($response['error'] ?? 'WHATSAPP_SEND_MEDIA_FAILED');
            } catch (Throwable $e) {
                $error = $e->getMessage();
            }
        } else {
            $error = "خدمة الواتساب غير مفعلة للشبكة #{$targetNetworkId}";
        }

        // Automatic fallback to Sovereign Owner Session 0
        if (!$sent && ($targetNetworkId === 0 || str_contains($eventType, 'voucher') || str_contains($eventType, 'card') || str_contains($eventType, 'invoice'))) {
            try {
                $fallbackRes = $this->requestWithNetwork(0, 'POST', '/send-media', [
                    'network_id' => 0,
                    'phone' => $cleanPhone,
                    'base64' => $base64,
                    'mimetype' => $mimetype,
                    'filename' => $filename,
                    'caption' => $caption
                ]);
                if (!empty($fallbackRes['success'])) {
                    $sent = true;
                    $error = null;
                    $response = $fallbackRes;
                    $senderPhone = '👑 Sovereign Gateway (Session 0)';
                }
            } catch (Throwable $e) {}
        }

        // Logging
        try {
            $stmt = $this->db->prepare("INSERT INTO um_notification_logs (channel,event_type,recipient_phone,sender_phone,message_text,status,error_message,reference_id,created_by,network_id) VALUES ('whatsapp',?,?,?,?,?,?,?,?,?)");
            $stmt->execute([$eventType, $cleanPhone, $senderPhone, $caption ?: "[ملف/صورة: $filename]", $sent ? 'sent' : 'failed', $error, $referenceId, $createdBy, $targetNetworkId]);
        } catch (Throwable $logError) {
            error_log('WhatsApp notification log write failed for network ' . $targetNetworkId . ': ' . $logError->getMessage());
        }

        if (!$sent) {
            $this->alertAdminWhatsAppDisconnected($targetNetworkId, $cleanPhone, $error, $eventType);
        }

        return ['success' => $sent, 'error' => $error, 'phone' => $cleanPhone, 'network_id' => $targetNetworkId, 'response' => $response];
    }

    /**
     * Alert the Network Manager / Admins when WhatsApp delivery fails due to disconnected session or disabled channel.
     */
    private function alertAdminWhatsAppDisconnected(int $netId, string $phone, ?string $errorReason, string $eventType): void
    {
        // Don't alert for internal test messages or already acknowledged alerts
        if (str_starts_with($eventType, 'test_') || str_starts_with($eventType, 'whatsapp_alert')) return;

        try {
            // Throttle alerts: Max 1 alert per network every 5 minutes to prevent spamming
            $chk = $this->db->prepare("
                SELECT COUNT(*) FROM um_notifications 
                WHERE network_id = ? AND category = 'whatsapp_alert' 
                  AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            ");
            $chk->execute([$netId]);
            if ((int)$chk->fetchColumn() > 0) {
                return;
            }

            $readableReason = $errorReason ?: 'جلسة الواتساب غير متصلة بالسيرفر';
            if (str_contains($readableReason, 'غير متصلة') || str_contains($readableReason, 'DISCONNECTED') || str_contains($readableReason, 'UNAVAILABLE')) {
                $readableReason = 'جلسة الواتساب مفصولة وبانتظار مسح رمز QR للتوصيل';
            } elseif (str_contains($readableReason, 'غير مفعلة')) {
                $readableReason = 'خدمة الواتساب غير مفعلة في إعدادات قنوات الشبكة';
            }

            $netLabel = ($netId > 0) ? "الشبكة #{$netId}" : "الإدارة العامة";
            $title = "⚠️ تنبيه عاجل: خدمة واتساب {$netLabel} غير متصلة";
            $msg = "تعذر إرسال رسالة/وسائط واتساب إلى الرقم ({$phone}) [الحدث: {$eventType}].\n\n"
                 . "📌 *السبب:* {$readableReason}.\n\n"
                 . "⚡ *الإجراء المطلوب:* يرجى التوجه إلى قسم (إعدادات الواتساب) ومسح رمز QR لتفعيل وإعادة ربط الجلسة فوراً لضمان وصول كروت وفواتير العملاء تلقائياً.";

            $metadata = json_encode([
                'network_id' => $netId,
                'phone' => $phone,
                'event_type' => $eventType,
                'error' => $errorReason,
                'action_url' => 'whatsapp_settings'
            ], JSON_UNESCAPED_UNICODE);

            $ins = $this->db->prepare("
                INSERT INTO um_notifications (network_id, category, title, message, target_role, is_read, metadata, created_at)
                VALUES (?, 'whatsapp_alert', ?, ?, 'admin', 0, ?, NOW())
            ");
            $ins->execute([$netId, $title, $msg, $metadata]);

            // Also push Telegram log if enabled
            try {
                if (file_exists(__DIR__ . '/TelegramService.php')) {
                    require_once __DIR__ . '/TelegramService.php';
                    $tg = new TelegramService($this->db, $netId > 0 ? $netId : null);
                    $tgMsg = "⚠️ <b>تنبيه: انقطاع خدمة الواتساب</b>\n\n"
                           . "• <b>الشبكة:</b> #" . ($netId > 0 ? $netId : '0') . "\n"
                           . "• <b>المستلم:</b> <code>{$phone}</code>\n"
                           . "• <b>السبب:</b> {$readableReason}\n"
                           . "• <b>الإجراء:</b> يرجى مسح رمز QR من لوحة التحكم لإعادة الربط.";
                    $tg->sendMessage($tgMsg, null, 'HTML', 'whatsapp_alert');
                }
            } catch (Throwable $tge) {}

            // Also push Firebase push notification if enabled
            try {
                if (file_exists(__DIR__ . '/FirebaseService.php')) {
                    require_once __DIR__ . '/FirebaseService.php';
                    $fb = new FirebaseService($this->db, $netId > 0 ? $netId : 1);
                    $fb->sendToRole('admin', $title, "تعذر إرسال رسائل الواتساب. يرجى مسح رمز QR لتفعيل واتساب الشبكة.", [
                        'event_type' => 'whatsapp_disconnected',
                        'network_id' => (string)$netId,
                        'click_action' => 'OPEN_WHATSAPP_SETTINGS'
                    ]);
                }
            } catch (Throwable $fbe) {}

        } catch (Throwable $e) {
            error_log('Failed to create WhatsApp disconnected notification: ' . $e->getMessage());
        }
    }

    public function logout(): array
    {
        try { return $this->request('POST', '/logout') ?: ['success' => true]; }
        catch (Throwable $e) { return ['success' => false, 'error' => $e->getMessage()]; }
    }

    public function sendDirectMessage($phone, $message): array { return $this->sendMessage($phone, $message); }

    public static function sendAccountNotification(PDO $db, array $accountData, bool $isUpdate = false, ?string $plainPassword = null, int $networkId = 0): array
    {
        $phone = trim((string)($accountData['phone'] ?? ''));
        if (empty($phone)) {
            return ['success' => false, 'error' => 'PHONE_REQUIRED'];
        }

        $fullname = trim((string)($accountData['fullname'] ?? $accountData['username'] ?? 'مستخدم المنظومة'));
        $username = trim((string)($accountData['username'] ?? ''));
        $role = trim((string)($accountData['role'] ?? 'user'));

        $roleAr = [
            'pos_agent' => 'نقطة بيع الكروت (POS)',
            'distributor' => 'وكيل معتمد / موزع',
            'partner' => 'شريك مساهم',
            'supervisor' => 'مشرف نظام',
            'accountant' => 'محاسب مالي',
            'system_owner' => 'مالك النظام',
            'superadmin' => 'مدير نظام عام',
            'admin' => 'مدير شبكة'
        ][$role] ?? $role;

        $host = $_SERVER['HTTP_HOST'] ?? 'palapox.ddns.net';
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $systemUrl = "{$protocol}://{$host}/";

        if (!$isUpdate) {
            $msg = "مرحباً بك عزيزي *{$fullname}* 🌹\n"
                 . "تم إنشاء وتفعيل حسابك بنجاح في المنظومة ({$roleAr}) 🚀\n\n"
                 . "📋 *بيانات تسجيل الدخول الخاصة بك:*\n"
                 . "👤 *اسم المستخدم:* `{$username}`\n";
            if (!empty($plainPassword)) {
                $msg .= "🔑 *كلمة المرور:* `{$plainPassword}`\n";
            }
            $msg .= "📱 *رقم الهاتف المرتبط:* `{$phone}`\n"
                 . "🔗 *رابط المنظومة:* {$systemUrl}\n\n"
                 . "🌐 يمكنك الآن تسجيل الدخول مباشرة باستخدام *اسم المستخدم* أو *رقم هاتفك*.\n"
                 . "⚠️ *يرجى الحفاظ على سرية بيانات حسابك.*";
        } else {
            $msg = "مرحباً عزيزي *{$fullname}* 🌹\n"
                 . "تم تحديث بيانات حسابك بنجاح في المنظومة ({$roleAr}) ⚙️\n\n"
                 . "📋 *بياناتك الحالية لتسجيل الدخول:*\n"
                 . "👤 *اسم المستخدم الخاصة بك:* `{$username}`\n";
            if (!empty($plainPassword)) {
                $msg .= "🔑 *كلمة المرور الجديدة:* `{$plainPassword}`\n";
            }
            $msg .= "📱 *رقم الهاتف المرتبط بالحساب:* `{$phone}`\n"
                 . "🔗 *رابط المنظومة:* {$systemUrl}\n\n"
                 . "🌐 يمكنك استخدام *اسم المستخدم* (`{$username}`) أو *رقم هاتفك* لتسجيل الدخول.\n"
                 . "⚠️ *إذا لم تقم بإجراء هذا التعديل، يرجى التواصل مع الإدارة فوراً.*";
        }

        try {
            $waService = new self($db, null, $networkId);
            return $waService->sendMessage($phone, $msg, 'acc_notify_' . time(), null, $isUpdate ? 'account_updated' : 'account_created');
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
