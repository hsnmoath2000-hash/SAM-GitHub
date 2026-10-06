<?php
/**
 * FirebaseService — Firebase Cloud Messaging (FCM) Push Notifications Engine
 * يدعم بروتوكول Firebase HTTP v1 API الحديث عبر Google OAuth2 Service Account
 * ويدعم المفتاح الكلاسيكي Server Key للتوافقية
 */

declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';

class FirebaseService {
    private PDO $db;
    private ?array $settingsCache = null;
    private int $networkId = 0;

    public function __construct(PDO $db, int $networkId = 0) {
        $this->db = $db;
        $this->networkId = $this->resolveNetworkId($networkId);
    }

    private function resolveNetworkId(int $networkId = 0): int {
        $candidate = $networkId;
        if ($candidate <= 0) {
            try { $candidate = (int)$this->db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn(); } catch (Throwable $e) {}
        }
        if ($candidate <= 0 && session_status() === PHP_SESSION_ACTIVE) $candidate = (int)($_SESSION['active_network_id'] ?? 0);
        if ($candidate <= 0) {
            throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        }
        $candidate = (new NetworkChannelService($this->db))->normalizeNetworkId($candidate);
        $this->db->exec('SET @sam_active_network_id=' . $candidate);
        return $candidate;
    }

    public function getNetworkId(): int {
        return $this->networkId;
    }

    // =========================================================================
    // 1. SETTINGS & CREDENTIALS
    // =========================================================================

    public function getSettings(bool $includeSecrets = false): array {
        if ($this->settingsCache !== null) {
            $result = $this->settingsCache;
            if (!$includeSecrets) {
                $result['service_account_json'] = '';
                $result['server_key'] = '';
            }
            return $result;
        }

        $stmt = $this->db->query("SELECT setting_key, setting_value FROM um_settings WHERE setting_key LIKE 'firebase_%'");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_KEY_PAIR) ?: []) : [];
        $networkSettings = (new NetworkChannelService($this->db))->getNotificationSettings($this->networkId);

        $saJson = $rows['firebase_service_account_json'] ?? '';
        $hasServiceAccount = false;
        $projectId = $rows['firebase_project_id'] ?? '';
        $clientEmail = '';

        if (!empty($saJson)) {
            $parsed = json_decode($saJson, true);
            if (is_array($parsed) && !empty($parsed['project_id']) && !empty($parsed['private_key'])) {
                $hasServiceAccount = true;
                if (empty($projectId)) {
                    $projectId = $parsed['project_id'];
                }
                $clientEmail = $parsed['client_email'] ?? '';
            }
        }

        $serverKey = $rows['firebase_server_key'] ?? '';
        $hasServerKey = !empty($serverKey);

        $this->settingsCache = [
            'enabled' => !empty($networkSettings['fcm_enabled']),
            'project_id' => $projectId,
            'service_account_json' => $saJson,
            'has_service_account' => $hasServiceAccount,
            'client_email' => $clientEmail,
            'server_key' => $serverKey,
            'has_server_key' => $hasServerKey,
            'notify_routers' => !empty($networkSettings['notify_routers']),
            'notify_sales' => !empty($networkSettings['notify_sales']),
            'notify_receipts' => !empty($networkSettings['notify_receipts']),
            'notify_transfers' => !empty($networkSettings['notify_transfers']),
            'notify_low_stock' => !empty($networkSettings['notify_inventory']),
            'is_configured' => ($hasServiceAccount || $hasServerKey)
        ];

        $result = $this->settingsCache;
        if (!$includeSecrets) {
            $result['service_account_json'] = '';
            $result['server_key'] = '';
        }
        return $result;
    }

    public function saveSettings(array $data): array {
        $actorId = (int)($_SESSION['admin_id'] ?? 0);
        $hasCredentialInput = false;
        foreach (['firebase_project_id','firebase_service_account_json','firebase_server_key'] as $key) {
            if (isset($data[$key]) && trim((string)$data[$key]) !== '') $hasCredentialInput = true;
        }
        if ($hasCredentialInput) {
            $owner = $this->db->prepare('SELECT 1 FROM um_system_owners WHERE admin_id=? LIMIT 1');
            $owner->execute([$actorId]);
            if (!$owner->fetchColumn()) throw new DomainException('SYSTEM_OWNER_ONLY');
        }

        $keys = [];
        foreach (['firebase_project_id','firebase_service_account_json','firebase_server_key'] as $key) {
            if (isset($data[$key]) && trim((string)$data[$key]) !== '') $keys[$key] = trim((string)$data[$key]);
        }

        // Auto extract project_id if service account JSON provided
        if (!empty($keys['firebase_service_account_json'])) {
            $parsed = json_decode($keys['firebase_service_account_json'], true);
            if (is_array($parsed) && !empty($parsed['project_id']) && empty($keys['firebase_project_id'])) {
                $keys['firebase_project_id'] = $parsed['project_id'];
            }
        }

        foreach ($keys as $k => $v) {
            $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
            $stmt->execute([$k, $v]);
        }

        $networkChanges = [];
        if (array_key_exists('firebase_enabled', $data)) $networkChanges['fcm_enabled'] = !empty($data['firebase_enabled']);
        foreach ([
            'firebase_notify_sales' => 'notify_sales',
            'firebase_notify_receipts' => 'notify_receipts',
            'firebase_notify_transfers' => 'notify_transfers',
            'firebase_notify_routers' => 'notify_routers',
            'firebase_notify_low_stock' => 'notify_inventory',
        ] as $inputKey => $settingKey) {
            if (array_key_exists($inputKey, $data)) $networkChanges[$settingKey] = !empty($data[$inputKey]);
        }
        if ($networkChanges) {
            $channels = new NetworkChannelService($this->db);
            $current = $channels->getNotificationSettings($this->networkId);
            $channels->saveNotificationSettings($this->networkId, array_merge($current, $networkChanges), $actorId);
        }

        $this->settingsCache = null;
        return ['success' => true, 'message' => 'تم حفظ إعدادات إشعارات فايربيس (FCM) بنجاح'];
    }

    /**
     * التحقق من صحة مفاتيح Firebase والاتصال بجوجل
     */
    public function verifyCredentials(): array {
        $settings = $this->getSettings(true);
        if (!$settings['is_configured']) {
            return [
                'success' => false,
                'error' => 'لم يتم إدخال مفتاح Service Account JSON أو مفتاح السيرفر في إعدادات فايربيس.'
            ];
        }

        if (!empty($settings['has_service_account'])) {
            $token = $this->getGoogleOAuth2AccessToken();
            if ($token) {
                return [
                    'success' => true,
                    'auth_type' => 'oauth2_v1',
                    'project_id' => $settings['project_id'],
                    'client_email' => $settings['client_email'],
                    'message' => 'تم التحقق من صحة ملف Service Account والاتصال بسحابة Google Firebase بنجاح 100%.'
                ];
            } else {
                return [
                    'success' => false,
                    'error' => 'فشلت المصادقة مع Google OAuth2. تأكد من صحة ملف Service Account JSON وصلاحية المفتاح الخاص.'
                ];
            }
        }

        if (!empty($settings['has_server_key'])) {
            return [
                'success' => true,
                'auth_type' => 'legacy_server_key',
                'message' => 'تم التحقق من ضبط مفتاح السيرفر الكلاسيكي بنجاح.'
            ];
        }

        return ['success' => false, 'error' => 'بيانات الاعتماد غير مكتملة'];
    }

    // =========================================================================
    // 2. DEVICE TOKENS REGISTRATION & MANAGEMENT
    // =========================================================================

    public function registerToken(
        int $adminId,
        string $fcmToken,
        string $deviceName = 'Android Device',
        string $platform = 'android',
        string $appVersion = '1.0',
        int $networkId = 0
    ): array {
        $targetNetworkId = $this->resolveNetworkId($networkId);
        if ($targetNetworkId !== $this->networkId) throw new DomainException('FORBIDDEN_NETWORK');
        $cleanToken = trim($fcmToken);
        if (empty($cleanToken)) {
            throw new InvalidArgumentException('FCM_TOKEN_REQUIRED');
        }

        $membership = $this->db->prepare("SELECT 1 FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            JOIN um_networks n ON n.id=x.network_id AND n.status='active'
            WHERE a.id=? AND a.is_active=1 LIMIT 1");
        $membership->execute([$targetNetworkId, $adminId]);
        if (!$membership->fetchColumn()) throw new DomainException('FORBIDDEN_NETWORK');

        $this->ensureTableExists();

        $stmt = $this->db->prepare("
            INSERT INTO um_fcm_tokens (network_id, admin_id, fcm_token, device_name, platform, app_version, is_active, last_used_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                admin_id = VALUES(admin_id),
                device_name = VALUES(device_name),
                platform = VALUES(platform),
                app_version = VALUES(app_version),
                is_active = 1,
                last_used_at = NOW()
        ");
        $stmt->execute([
            $targetNetworkId,
            $adminId,
            $cleanToken,
            mb_substr($deviceName, 0, 100),
            mb_substr($platform, 0, 20),
            mb_substr($appVersion, 0, 20)
        ]);

        return [
            'success' => true,
            'message' => 'تم تسجيل الجهاز واستقبال الإشعارات بنجاح',
            'device_name' => $deviceName,
            'admin_id' => $adminId,
            'network_id' => $targetNetworkId
        ];
    }

    public function unregisterToken(string $fcmToken, ?int $networkId = null): array {
        $cleanToken = trim($fcmToken);
        if (empty($cleanToken)) {
            return ['success' => false, 'error' => 'TOKEN_EMPTY'];
        }

        $this->ensureTableExists();

        $targetNetworkId = $this->resolveNetworkId($networkId ?? 0);
        if ($targetNetworkId !== $this->networkId) throw new DomainException('FORBIDDEN_NETWORK');
        $stmt = $this->db->prepare("UPDATE um_fcm_tokens SET is_active = 0 WHERE network_id = ? AND fcm_token = ?");
        $stmt->execute([$targetNetworkId, $cleanToken]);

        return ['success' => true, 'unregistered' => $stmt->rowCount() > 0];
    }

    public function getActiveTokensForAdmin(int $adminId): array {
        $this->ensureTableExists();
        $stmt = $this->db->prepare("SELECT t.fcm_token FROM um_fcm_tokens t
            JOIN um_admins a ON a.id=t.admin_id AND a.is_active=1
            JOIN um_admin_network_access x ON x.admin_id=t.admin_id AND x.network_id=t.network_id AND x.is_active=1
            JOIN um_networks n ON n.id=t.network_id AND n.status='active'
            WHERE t.network_id=? AND t.admin_id=? AND t.is_active=1");
        $stmt->execute([$this->networkId, $adminId]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }

    public function getActiveTokensForRole(string $role): array {
        $this->ensureTableExists();
        if ($role === 'all') {
            return $this->getAllActiveTokens();
        }

        if ($role === 'system_owner') {
            $stmt = $this->db->prepare("SELECT DISTINCT t.fcm_token
                FROM um_fcm_tokens t
                JOIN um_admins a ON a.id=t.admin_id AND a.is_active=1
                JOIN um_system_owners so ON so.admin_id=a.id
                JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=t.network_id AND x.is_active=1
                JOIN um_networks n ON n.id=t.network_id AND n.status='active'
                WHERE t.network_id=? AND t.is_active=1");
            $stmt->execute([$this->networkId]);
        } else {
            $stmt = $this->db->prepare("SELECT DISTINCT t.fcm_token
                FROM um_fcm_tokens t
                JOIN um_admins a ON a.id=t.admin_id AND a.is_active=1
                JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=t.network_id AND x.is_active=1
                JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=t.network_id AND r.is_active=1
                JOIN um_networks n ON n.id=t.network_id AND n.status='active'
                WHERE t.network_id=? AND r.role_key=? AND t.is_active=1");
            $stmt->execute([$this->networkId, $role]);
        }
        return $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }

    public function getAllActiveTokens(): array {
        $this->ensureTableExists();
        $stmt = $this->db->prepare("SELECT t.fcm_token FROM um_fcm_tokens t
            JOIN um_admins a ON a.id=t.admin_id AND a.is_active=1
            JOIN um_admin_network_access x ON x.admin_id=t.admin_id AND x.network_id=t.network_id AND x.is_active=1
            JOIN um_networks n ON n.id=t.network_id AND n.status='active'
            WHERE t.network_id=? AND t.is_active=1");
        $stmt->execute([$this->networkId]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }

    public function getDevicesList(?int $adminId = null): array {
        $this->ensureTableExists();
        $where = "t.network_id = ?";
        $params = [$this->networkId];
        if ($adminId !== null) {
            $where .= " AND t.admin_id = ?";
            $params[] = $adminId;
        }

        $stmt = $this->db->prepare("
            SELECT t.*, a.username, a.fullname, a.role
            FROM um_fcm_tokens t
            LEFT JOIN um_admins a ON t.admin_id = a.id
            WHERE $where
            ORDER BY t.last_used_at DESC
        ");
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function markTokenInvalid(string $token): void {
        try {
            $this->ensureTableExists();
            $stmt = $this->db->prepare("UPDATE um_fcm_tokens SET is_active = 0 WHERE network_id = ? AND fcm_token = ?");
            $stmt->execute([$this->networkId, $token]);
        } catch (Throwable $e) {}
    }

    // =========================================================================
    // 3. PUSH NOTIFICATION SENDER (HTTP v1 & Legacy)
    // =========================================================================

    /**
     * Send push notification to a specific admin's devices
     */
    public function sendToAdmin(
        int $adminId,
        string $title,
        string $body,
        array $data = [],
        string $eventType = 'general',
        ?string $refId = null,
        ?int $createdBy = null
    ): array {
        $tokens = $this->getActiveTokensForAdmin($adminId);
        if (empty($tokens)) {
            return ['success' => false, 'sent_count' => 0, 'reason' => 'NO_DEVICES_REGISTERED'];
        }

        return $this->sendMulticast($tokens, $title, $body, $data, $eventType, $refId, $createdBy, (string)$adminId);
    }

    /**
     * Send push notification to all admins with a specific role
     */
    public function sendToRole(
        string $role,
        string $title,
        string $body,
        array $data = [],
        string $eventType = 'general',
        ?string $refId = null,
        ?int $createdBy = null
    ): array {
        $tokens = $this->getActiveTokensForRole($role);
        if (empty($tokens)) {
            return ['success' => false, 'sent_count' => 0, 'reason' => 'NO_DEVICES_REGISTERED'];
        }

        return $this->sendMulticast($tokens, $title, $body, $data, $eventType, $refId, $createdBy, "role:$role");
    }

    /**
     * Send a system-level alert only to registered system owners, using each
     * owner's device registration in an active network. Delivery and logs
     * remain attributed to the network that owns the token.
     */
    public static function sendToSystemOwnersAcrossNetworks(
        PDO $db,
        string $title,
        string $body,
        array $data = [],
        string $eventType = 'system_owner_alert',
        ?string $refId = null,
        ?int $createdBy = null
    ): array {
        $currentNetworkId = 0;
        try { $currentNetworkId = (int)$db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn(); } catch (Throwable $e) {}
        $stmt = $db->query("SELECT t.network_id,so.admin_id,t.fcm_token
            FROM um_system_owners so
            JOIN um_admins a ON a.id=so.admin_id AND a.is_active=1
            JOIN um_admin_network_access x ON x.admin_id=so.admin_id AND x.is_active=1
            JOIN um_networks n ON n.id=x.network_id AND n.status='active'
            JOIN um_fcm_tokens t ON t.admin_id=so.admin_id AND t.network_id=x.network_id AND t.is_active=1
            ORDER BY t.network_id,so.admin_id");

        $groups = [];
        $seenTokens = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $token = (string)$row['fcm_token'];
            $tokenHash = hash('sha256', $token);
            if (isset($seenTokens[$tokenHash])) continue;
            $seenTokens[$tokenHash] = true;
            $networkId = (int)$row['network_id'];
            $adminId = (int)$row['admin_id'];
            $groups[$networkId][$adminId][] = $token;
        }

        $results = [];
        try {
            foreach ($groups as $networkId => $owners) {
                $service = new self($db, (int)$networkId);
                foreach ($owners as $adminId => $tokens) {
                    $results[] = [
                        'network_id' => (int)$networkId,
                        'admin_id' => (int)$adminId,
                        'result' => $service->sendMulticast(
                            $tokens,
                            $title,
                            $body,
                            array_merge($data, ['scope' => 'system']),
                            $eventType,
                            $refId,
                            $createdBy,
                            'system_owner:' . (int)$adminId,
                            true
                        )
                    ];
                }
            }
        } finally {
            $db->exec('SET @sam_active_network_id=' . $currentNetworkId);
        }

        $sent = 0;
        foreach ($results as $result) $sent += (int)($result['result']['sent_count'] ?? 0);
        return ['success' => $sent > 0, 'sent_count' => $sent, 'results' => $results];
    }

    /**
     * Send broadcast push notification to all active devices
     */
    public function broadcast(
        string $title,
        string $body,
        array $data = [],
        string $eventType = 'broadcast',
        ?string $refId = null,
        ?int $createdBy = null
    ): array {
        $tokens = $this->getAllActiveTokens();
        if (empty($tokens)) {
            return ['success' => false, 'sent_count' => 0, 'reason' => 'NO_DEVICES_REGISTERED'];
        }

        return $this->sendMulticast($tokens, $title, $body, $data, $eventType, $refId, $createdBy, 'broadcast_all');
    }

    /**
     * Send to multiple tokens
     */
    public function sendMulticast(
        array $tokens,
        string $title,
        string $body,
        array $data = [],
        string $eventType = 'general',
        ?string $refId = null,
        ?int $createdBy = null,
        string $recipientTarget = 'devices',
        bool $allowWhenNetworkDisabled = false
    ): array {
        $data['network_id'] = (string)$this->networkId;
        $settings = $this->getSettings(true);
        if (empty($settings['enabled']) && !$allowWhenNetworkDisabled) {
            return ['success' => false, 'error' => 'FIREBASE_DISABLED'];
        }
        if (!$settings['is_configured']) {
            return ['success' => false, 'error' => 'FIREBASE_NOT_CONFIGURED'];
        }

        $sentCount = 0;
        $failedCount = 0;
        $errors = [];

        foreach (array_unique($tokens) as $token) {
            $res = $this->sendSinglePush($token, $title, $body, $data, [], $allowWhenNetworkDisabled);
            if ($res['success']) {
                $sentCount++;
            } else {
                $failedCount++;
                $errors[] = $res['error'] ?? 'Unknown error';
                if (!empty($res['invalid_token'])) {
                    $this->markTokenInvalid($token);
                }
            }
        }

        $status = ($sentCount > 0) ? 'sent' : 'failed';
        $errMsg = !empty($errors) ? implode('; ', array_slice($errors, 0, 3)) : null;

        $this->logNotification(
            $eventType,
            "$recipientTarget ($sentCount/" . count($tokens) . ")",
            "[$title] $body",
            $status,
            $errMsg,
            $refId,
            $createdBy
        );

        return [
            'success' => ($sentCount > 0),
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
            'total' => count($tokens),
            'errors' => $errors
        ];
    }

    /**
     * Send a single push notification to a specific FCM token
     */
    public function sendSinglePush(
        string $token,
        string $title,
        string $body,
        array $data = [],
        array $options = [],
        bool $allowWhenNetworkDisabled = false
    ): array {
        $membership = $this->db->prepare("SELECT 1 FROM um_fcm_tokens t
            JOIN um_admins a ON a.id=t.admin_id AND a.is_active=1
            JOIN um_admin_network_access x ON x.admin_id=t.admin_id AND x.network_id=t.network_id AND x.is_active=1
            JOIN um_networks n ON n.id=t.network_id AND n.status='active'
            WHERE t.network_id=? AND t.fcm_token=? AND t.is_active=1 LIMIT 1");
        $membership->execute([$this->networkId, trim($token)]);
        if (!$membership->fetchColumn()) return ['success' => false, 'error' => 'FCM_TOKEN_OUT_OF_NETWORK'];

        $settings = $this->getSettings(true);
        if (empty($settings['enabled']) && !$allowWhenNetworkDisabled) {
            return ['success' => false, 'error' => 'FIREBASE_DISABLED'];
        }

        // 1. Try Firebase HTTP v1 API first if service account is configured
        if (!empty($settings['has_service_account'])) {
            return $this->sendViaHttpV1($token, $title, $body, $data, $options);
        }

        // 2. Fallback to Legacy Server Key API
        if (!empty($settings['has_server_key'])) {
            return $this->sendViaLegacyApi($token, $title, $body, $data, $options);
        }

        return ['success' => false, 'error' => 'NO_FIREBASE_CREDENTIALS'];
    }

    /**
     * Send via Firebase HTTP v1 API
     */
    private function sendViaHttpV1(
        string $token,
        string $title,
        string $body,
        array $data = [],
        array $options = []
    ): array {
        $settings = $this->getSettings(true);
        $projectId = $settings['project_id'];

        if (empty($projectId)) {
            return ['success' => false, 'error' => 'FIREBASE_PROJECT_ID_MISSING'];
        }

        $accessToken = $this->getGoogleOAuth2AccessToken();
        if (!$accessToken) {
            return ['success' => false, 'error' => 'GOOGLE_AUTH_TOKEN_FAILED'];
        }

        $url = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";

        // Stringify all data values for FCM v1 requirement
        $stringData = [];
        foreach ($data as $k => $v) {
            $stringData[(string)$k] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string)$v;
        }
        $stringData['timestamp'] = (string)time();

        $channelId = $options['channel_id'] ?? ($data['channel_id'] ?? 'sam_alerts');
        $sound = $options['sound'] ?? ($data['sound'] ?? 'default');
        $priority = $options['priority'] ?? 'HIGH';

        $payload = [
            'message' => [
                'token' => $token,
                'notification' => [
                    'title' => $title,
                    'body' => $body
                ],
                'data' => $stringData,
                'android' => [
                    'priority' => $priority,
                    'notification' => [
                        'channel_id' => $channelId,
                        'sound' => $sound,
                        'icon' => 'ic_notification',
                        'color' => '#0284c7',
                        'default_vibrate_timings' => true,
                        'default_light_settings' => true
                    ]
                ]
            ]
        ];

        if (!empty($options['image_url'])) {
            $payload['message']['notification']['image'] = $options['image_url'];
        }

        try {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json; UTF-8'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $result = json_decode((string)$response, true) ?: [];

            if ($httpCode === 200 && !empty($result['name'])) {
                return ['success' => true, 'message_id' => $result['name']];
            }

            $errMsg = $result['error']['message'] ?? "HTTP $httpCode";
            $status = $result['error']['status'] ?? '';
            $isInvalid = in_array($status, ['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND'], true) ||
                         str_contains(strtolower($errMsg), 'not a valid fcm registration token') ||
                         str_contains(strtolower($errMsg), 'requested entity was not found');

            return [
                'success' => false,
                'error' => $errMsg,
                'status' => $status,
                'invalid_token' => $isInvalid
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send via Firebase Legacy HTTP API
     */
    private function sendViaLegacyApi(
        string $token,
        string $title,
        string $body,
        array $data = [],
        array $options = []
    ): array {
        $settings = $this->getSettings(true);
        $serverKey = $settings['server_key'];
        $url = 'https://fcm.googleapis.com/fcm/send';

        $stringData = [];
        foreach ($data as $k => $v) {
            $stringData[(string)$k] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string)$v;
        }

        $payload = [
            'to' => $token,
            'priority' => 'high',
            'notification' => [
                'title' => $title,
                'body' => $body,
                'sound' => $options['sound'] ?? 'default',
                'channel_id' => $options['channel_id'] ?? 'sam_alerts'
            ],
            'data' => array_merge([
                'title' => $title,
                'body' => $body,
                'timestamp' => (string)time()
            ], $stringData)
        ];

        try {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: key=' . $serverKey,
                'Content-Type: application/json'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $result = json_decode((string)$response, true) ?: [];

            if ($httpCode === 200 && !empty($result['success']) && (int)$result['success'] > 0) {
                return ['success' => true, 'message_id' => $result['results'][0]['message_id'] ?? null];
            }

            $errMsg = $result['results'][0]['error'] ?? "HTTP $httpCode";
            $isInvalid = in_array($errMsg, ['NotRegistered', 'InvalidRegistration', 'MismatchSenderId'], true);

            return [
                'success' => false,
                'error' => $errMsg,
                'invalid_token' => $isInvalid
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // 4. GOOGLE OAUTH2 JWT TOKEN GENERATOR (HTTP v1)
    // =========================================================================

    /**
     * Obtains an OAuth2 access token for Google API using Service Account JWT assertion
     */
    public function getGoogleOAuth2AccessToken(): ?string {
        $settings = $this->getSettings(true);
        $saJson = $settings['service_account_json'];
        if (empty($saJson)) return null;

        $sa = json_decode($saJson, true);
        if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) {
            return null;
        }

        $projectId = $sa['project_id'] ?? 'sam';
        $cacheFile = sys_get_temp_dir() . '/sam_fcm_oauth_' . md5($projectId . $sa['client_email']) . '.json';

        // Check cached token
        if (file_exists($cacheFile)) {
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            if (is_array($cached) && !empty($cached['access_token']) && !empty($cached['expires_at'])) {
                if (time() < ($cached['expires_at'] - 120)) { // 2 min safety margin
                    return $cached['access_token'];
                }
            }
        }

        // Generate JWT Assertion
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $now = time();
        $claimSet = [
            'iss' => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => 'https://oauth2.googleapis.com/token',
            'exp' => $now + 3600,
            'iat' => $now
        ];

        $b64Header = $this->base64UrlEncode((string)json_encode($header));
        $b64ClaimSet = $this->base64UrlEncode((string)json_encode($claimSet));
        $signatureInput = $b64Header . '.' . $b64ClaimSet;

        $privateKey = $sa['private_key'];
        $signature = '';
        $success = openssl_sign($signatureInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (!$success) {
            error_log('FirebaseService: OpenSSL sign failed for Google OAuth2');
            return null;
        }

        $jwt = $signatureInput . '.' . $this->base64UrlEncode($signature);

        // Exchange JWT for Access Token
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt
        ]));
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string)$res, true) ?: [];
        if ($code === 200 && !empty($json['access_token'])) {
            $accessToken = $json['access_token'];
            $expiresIn = (int)($json['expires_in'] ?? 3600);
            @file_put_contents($cacheFile, json_encode([
                'access_token' => $accessToken,
                'expires_at' => time() + $expiresIn
            ]));
            return $accessToken;
        }

        error_log('FirebaseService: OAuth2 token exchange error: ' . ($json['error_description'] ?? ($json['error'] ?? "HTTP $code")));
        return null;
    }

    private function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    // =========================================================================
    // 5. HELPER UTILITIES & LOGS
    // =========================================================================

    public function ensureTableExists(): void {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS `um_fcm_tokens` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `network_id` INT NOT NULL,
                    `admin_id` INT NOT NULL,
                    `fcm_token` VARCHAR(255) NOT NULL,
                    `device_name` VARCHAR(100) DEFAULT 'Android Device',
                    `platform` VARCHAR(20) DEFAULT 'android',
                    `app_version` VARCHAR(20) DEFAULT '1.0',
                    `is_active` TINYINT(1) DEFAULT 1,
                    `last_used_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `uq_network_fcm_token` (`network_id`, `fcm_token`),
                    INDEX `idx_network_admin` (`network_id`, `admin_id`),
                    INDEX `idx_is_active` (`is_active`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (Throwable $e) {}
    }

    private function logNotification(
        string $eventType,
        string $recipient,
        string $message,
        string $status,
        ?string $errMsg,
        ?string $refId,
        ?int $createdBy
    ): void {
        try {
            $stmt = $this->db->prepare("
                INSERT INTO um_notification_logs 
                (network_id, channel, event_type, recipient_phone, message_text, status, error_message, reference_id, created_by, created_at)
                VALUES (?, 'fcm', ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $this->networkId,
                $eventType,
                $recipient,
                $message,
                $status,
                $errMsg,
                $refId,
                $createdBy
            ]);
        } catch (Throwable $e) {}
    }
}
