<?php
declare(strict_types=1);

/**
 * Network-scoped communication configuration.
 *
 * Channel credentials are encrypted at rest. There is no global credential
 * fallback: an unconfigured network stays disabled until its own channel is
 * configured.
 */
final class NetworkChannelService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function activeNetworkId(): int
    {
        try {
            $id = (int)$this->db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn();
        } catch (Throwable $e) {
            $id = 0;
        }
        if ($id <= 0 && session_status() === PHP_SESSION_ACTIVE) {
            $id = (int)($_SESSION['active_network_id'] ?? 0);
        }
        return max(0, $id);
    }

    public function normalizeNetworkId(int $networkId = 0, bool $allowSystemContext = true): int
    {
        if ($networkId === 0 && $allowSystemContext) {
            return 0;
        }
        $networkId = $networkId > 0 ? $networkId : $this->activeNetworkId();
        if ($networkId <= 0) {
            if ($allowSystemContext) return 0;
            throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        }
        $stmt = $this->db->prepare("SELECT id FROM um_networks WHERE id=? AND status='active' LIMIT 1");
        $stmt->execute([$networkId]);
        if (!$stmt->fetchColumn()) {
            if ($allowSystemContext) return 0;
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        return $networkId;
    }

    public function getChannel(int $networkId, string $channelType): array
    {
        $channelType = strtolower(trim($channelType));
        if (!in_array($channelType, ['whatsapp', 'telegram'], true)) {
            throw new InvalidArgumentException('INVALID_CHANNEL_TYPE');
        }
        $normalizedNetId = $this->normalizeNetworkId($networkId, true);
        $stmt = $this->db->prepare('SELECT * FROM um_network_channels WHERE network_id=? AND channel_type=? LIMIT 1');
        $stmt->execute([$normalizedNetId, $channelType]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        if ($row) {
            $row['bot_token'] = $this->decrypt((string)($row['bot_token_ciphertext'] ?? ''));
            $row['chat_id'] = $this->decrypt((string)($row['chat_id_ciphertext'] ?? ''));
            $row['webhook_secret'] = $this->decrypt((string)($row['webhook_secret_ciphertext'] ?? ''));
            return $row;
        }

        return [
            'network_id' => $normalizedNetId,
            'channel_type' => $channelType,
            'is_enabled' => 1,
            'status' => 'CONNECTED',
            'api_url' => 'http://127.0.0.1:3388',
            'bot_token' => '',
            'chat_id' => '',
            'webhook_secret' => '',
        ];
    }

    public function saveChannel(int $networkId, string $channelType, array $data, int $actorId = 0): array
    {
        $networkId = $this->normalizeNetworkId($networkId, true);
        $channelType = strtolower(trim($channelType));
        if (!in_array($channelType, ['whatsapp', 'telegram'], true)) {
            throw new InvalidArgumentException('INVALID_CHANNEL_TYPE');
        }
        $existing = $this->getChannel($networkId, $channelType);
        $token = array_key_exists('bot_token', $data) ? trim((string)$data['bot_token']) : (string)($existing['bot_token'] ?? '');
        $chatId = array_key_exists('chat_id', $data) ? trim((string)$data['chat_id']) : (string)($existing['chat_id'] ?? '');
        $webhookSecret = array_key_exists('webhook_secret', $data) ? trim((string)$data['webhook_secret']) : (string)($existing['webhook_secret'] ?? '');
        $apiUrl = trim((string)($data['api_url'] ?? ($existing['api_url'] ?? '')));
        $authPath = trim((string)($data['auth_path'] ?? ($existing['auth_path'] ?? '')));
        $label = trim((string)($data['label'] ?? ($existing['label'] ?? '')));
        $enabled = array_key_exists('is_enabled', $data) || array_key_exists('enabled', $data)
            ? ((!empty($data['is_enabled']) || !empty($data['enabled'])) ? 1 : 0)
            : (!empty($existing['is_enabled']) ? 1 : 0);
        $status = trim((string)($data['status'] ?? ($existing['status'] ?? 'DISCONNECTED'))) ?: 'DISCONNECTED';
        $config = $data['config'] ?? ($existing['config_json'] ?? null);
        if (is_array($config)) $config = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt = $this->db->prepare("INSERT INTO um_network_channels
            (network_id,channel_type,label,api_url,auth_path,bot_token_ciphertext,chat_id_ciphertext,webhook_secret_hash,webhook_secret_ciphertext,config_json,is_enabled,status,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE label=VALUES(label),api_url=VALUES(api_url),auth_path=VALUES(auth_path),
                bot_token_ciphertext=VALUES(bot_token_ciphertext),chat_id_ciphertext=VALUES(chat_id_ciphertext),
                webhook_secret_hash=VALUES(webhook_secret_hash),webhook_secret_ciphertext=VALUES(webhook_secret_ciphertext),
                config_json=VALUES(config_json),is_enabled=VALUES(is_enabled),status=VALUES(status)");
        $stmt->execute([
            $networkId, $channelType, $label ?: null, $apiUrl ?: null, $authPath ?: null,
            $this->encrypt($token), $this->encrypt($chatId),
            $webhookSecret !== '' ? hash('sha256', $webhookSecret) : null,
            $this->encrypt($webhookSecret), $config ?: null, $enabled, $status, $actorId ?: null
        ]);
        return ['success' => true, 'network_id' => $networkId, 'channel_type' => $channelType, 'message' => 'تم حفظ إعدادات القناة للشبكة بنجاح'];
    }

    public function verifyWebhookSecret(int $networkId, string $channelType, string $secret): bool
    {
        $channel = $this->getChannel($networkId, $channelType);
        $stored = (string)($channel['webhook_secret_hash'] ?? '');
        return $stored !== '' && hash_equals($stored, hash('sha256', $secret));
    }

    public function getNotificationSettings(int $networkId = 0): array
    {
        $normalizedNetId = $this->normalizeNetworkId($networkId, true);
        $stmt = $this->db->prepare('SELECT * FROM um_network_notification_settings WHERE network_id=? LIMIT 1');
        $stmt->execute([$normalizedNetId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        return array_merge([
            'network_id' => $normalizedNetId,
            'whatsapp_enabled' => 1,
            'telegram_enabled' => 0,
            'fcm_enabled' => 0,
            'chatbot_enabled' => 0,
            'chatbot_allow_subscribers' => 1,
            'chatbot_allow_pos' => 1,
            'chatbot_allow_admins' => 1,
            'notify_sales' => 1,
            'notify_receipts' => 1,
            'notify_transfers' => 1,
            'notify_inventory' => 1,
            'notify_routers' => 1,
            'notify_finance' => 1,
            'chatbot_welcome_msg' => '',
            'chatbot_support_phone' => '',
            'chatbot_network_name' => '',
        ], $row);
    }

    public function saveNotificationSettings(int $networkId, array $data, int $actorId = 0): array
    {
        $networkId = $this->normalizeNetworkId($networkId);
        // Channel-specific updates are intentionally partial. Merge them with
        // this network's current row so saving Telegram cannot disable FCM,
        // WhatsApp, chatbot, or another notification category by omission.
        $data = array_merge($this->getNotificationSettings($networkId), $data);
        $keys = ['whatsapp_enabled','telegram_enabled','fcm_enabled','chatbot_enabled','chatbot_allow_subscribers','chatbot_allow_pos','chatbot_allow_admins','notify_sales','notify_receipts','notify_transfers','notify_inventory','notify_routers','notify_finance'];
        $values = [];
        foreach ($keys as $key) $values[$key] = !empty($data[$key]) ? 1 : 0;
        $values['chatbot_welcome_msg'] = trim((string)($data['chatbot_welcome_msg'] ?? ''));
        $values['chatbot_support_phone'] = trim((string)($data['chatbot_support_phone'] ?? ''));
        $values['chatbot_network_name'] = trim((string)($data['chatbot_network_name'] ?? ''));
        $sql = "INSERT INTO um_network_notification_settings (network_id," . implode(',', array_keys($values)) . ",updated_by)
                VALUES (? ," . implode(',', array_fill(0, count($values), '?')) . ",?)
                ON DUPLICATE KEY UPDATE " . implode(',', array_map(static fn($k) => "$k=VALUES($k)", array_keys($values))) . ",updated_by=VALUES(updated_by)";
        $this->db->prepare($sql)->execute(array_merge([$networkId], array_values($values), [$actorId ?: null]));
        return ['success' => true, 'network_id' => $networkId, 'settings' => $this->getNotificationSettings($networkId)];
    }

    public function publicChannelStatus(int $networkId, string $channelType): array
    {
        $row = $this->getChannel($networkId, $channelType);
        unset($row['bot_token_ciphertext'], $row['chat_id_ciphertext'], $row['webhook_secret_ciphertext'], $row['bot_token'], $row['chat_id'], $row['webhook_secret']);
        $row['has_bot_token'] = !empty($this->getChannel($networkId, $channelType)['bot_token']);
        return $row;
    }

    private function key(): string
    {
        $seed = (string)(getenv('UM_CHANNEL_KEY') ?: (defined('DB_PASS') ? DB_PASS : 'sam-network-channel-key'));
        return hash('sha256', $seed . '|sam-network-channel-v1', true);
    }

    private function encrypt(string $value): ?string
    {
        if ($value === '') return null;
        if (!function_exists('sodium_crypto_secretbox')) throw new RuntimeException('SODIUM_REQUIRED');
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox($value, $nonce, $this->key());
        return 'v1.' . base64_encode($nonce) . '.' . base64_encode($cipher);
    }

    private function decrypt(string $value): string
    {
        if ($value === '') return '';
        if (!str_starts_with($value, 'v1.')) return '';
        $parts = explode('.', $value, 3);
        if (count($parts) !== 3 || !function_exists('sodium_crypto_secretbox_open')) return '';
        $plain = sodium_crypto_secretbox_open(base64_decode($parts[2], true), base64_decode($parts[1], true), $this->key());
        return $plain === false ? '' : (string)$plain;
    }
}
