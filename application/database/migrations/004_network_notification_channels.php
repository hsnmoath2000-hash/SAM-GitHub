<?php
declare(strict_types=1);

/**
 * Network-scoped notification channels and device routing.
 *
 * This migration is intentionally additive. Existing global settings remain
 * available as a temporary compatibility fallback for network 1 only; no
 * credentials are copied to another network.
 */

require_once dirname(__DIR__, 2) . '/config.php';

$db = getDB();

$db->exec("CREATE TABLE IF NOT EXISTS um_network_channels (
    id INT NOT NULL AUTO_INCREMENT,
    network_id INT NOT NULL,
    channel_type ENUM('whatsapp','telegram') NOT NULL,
    label VARCHAR(128) NULL,
    api_url VARCHAR(255) NULL,
    auth_path VARCHAR(255) NULL,
    bot_token_ciphertext TEXT NULL,
    chat_id_ciphertext TEXT NULL,
    webhook_secret_hash CHAR(64) NULL,
    webhook_secret_ciphertext TEXT NULL,
    config_json TEXT NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'DISCONNECTED',
    last_connected_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_network_channel (network_id, channel_type),
    KEY idx_network_channels_network (network_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$db->exec("CREATE TABLE IF NOT EXISTS um_network_notification_settings (
    network_id INT NOT NULL,
    whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 0,
    telegram_enabled TINYINT(1) NOT NULL DEFAULT 0,
    fcm_enabled TINYINT(1) NOT NULL DEFAULT 0,
    chatbot_enabled TINYINT(1) NOT NULL DEFAULT 0,
    notify_sales TINYINT(1) NOT NULL DEFAULT 1,
    notify_receipts TINYINT(1) NOT NULL DEFAULT 1,
    notify_transfers TINYINT(1) NOT NULL DEFAULT 1,
    notify_inventory TINYINT(1) NOT NULL DEFAULT 1,
    notify_routers TINYINT(1) NOT NULL DEFAULT 1,
    notify_finance TINYINT(1) NOT NULL DEFAULT 1,
    chatbot_welcome_msg TEXT NULL,
    chatbot_support_phone VARCHAR(32) NULL,
    chatbot_network_name VARCHAR(128) NULL,
    updated_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (network_id),
    KEY idx_network_notification_settings_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Add network_id to FCM registrations if this installation predates the
// network-aware mobile registration schema.
$hasFcmNetwork = (int)$db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_fcm_tokens' AND COLUMN_NAME='network_id'")->fetchColumn();
if (!$hasFcmNetwork) {
    $db->exec("ALTER TABLE um_fcm_tokens ADD COLUMN network_id INT NULL AFTER admin_id");
}

// Backfill existing devices to their default membership, falling back to the
// original network 1 only for orphaned legacy rows.
$db->exec("UPDATE um_fcm_tokens t
    LEFT JOIN (
        SELECT admin_id, MIN(network_id) AS network_id
        FROM um_admin_network_access
        WHERE is_active=1
        GROUP BY admin_id
    ) a ON a.admin_id=t.admin_id
    SET t.network_id=COALESCE(t.network_id,a.network_id,1)
    WHERE t.network_id IS NULL OR t.network_id=0");

$uniqueTokenIndexes = $db->query("SHOW INDEX FROM um_fcm_tokens WHERE Non_unique=0 AND Key_name <> 'PRIMARY' AND Column_name='fcm_token'")->fetchAll(PDO::FETCH_ASSOC);
foreach ($uniqueTokenIndexes as $index) {
    $name = str_replace('`', '', (string)$index['Key_name']);
    if ($name !== '') {
        $db->exec("ALTER TABLE um_fcm_tokens DROP INDEX `{$name}`");
    }
}

$hasCompositeFcmIndex = (int)$db->query("SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_fcm_tokens'
      AND INDEX_NAME IN ('uq_fcm_network_token','uq_network_fcm_token')
      AND NON_UNIQUE=0")->fetchColumn();
if (!$hasCompositeFcmIndex) {
    $db->exec("ALTER TABLE um_fcm_tokens ADD UNIQUE KEY uq_fcm_network_token (network_id, fcm_token)");
}
$hasNetworkFcmIndex = (int)$db->query("SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_fcm_tokens' AND INDEX_NAME='idx_fcm_network'")->fetchColumn();
if (!$hasNetworkFcmIndex) {
    $db->exec("ALTER TABLE um_fcm_tokens ADD KEY idx_fcm_network (network_id)");
}

// Chatbot sessions already have network_id in current installations. Ensure
// legacy NULL/zero rows are assigned to network 1 before enforcing uniqueness.
$hasSessionNetwork = (int)$db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_chatbot_sessions' AND COLUMN_NAME='network_id'")->fetchColumn();
if (!$hasSessionNetwork) {
    $db->exec("ALTER TABLE um_chatbot_sessions ADD COLUMN network_id INT NULL AFTER phone");
}
$db->exec("UPDATE um_chatbot_sessions SET network_id=1 WHERE network_id IS NULL OR network_id=0");
$duplicateSessions = (int)$db->query("SELECT COUNT(*) FROM (
    SELECT network_id,phone FROM um_chatbot_sessions GROUP BY network_id,phone HAVING COUNT(*)>1
) d")->fetchColumn();
if ($duplicateSessions === 0) {
    $hasSessionUnique = (int)$db->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_chatbot_sessions' AND INDEX_NAME='uq_chatbot_network_phone'")->fetchColumn();
    if (!$hasSessionUnique) {
        $db->exec("ALTER TABLE um_chatbot_sessions ADD UNIQUE KEY uq_chatbot_network_phone (network_id, phone)");
    }
}

// Create a disabled settings row for every active network. Secrets are not
// copied from the old global settings; the owner must configure each channel.
$db->exec("INSERT INTO um_network_notification_settings (network_id, chatbot_network_name)
    SELECT n.id,n.name FROM um_networks n
    LEFT JOIN um_network_notification_settings s ON s.network_id=n.id
    WHERE n.status='active' AND s.network_id IS NULL");

// Preserve the behaviour of the original installation for network 1 only.
// This copies switches/text, never WhatsApp/Telegram/Firebase credentials;
// networks 2+ remain disabled until explicitly configured by the owner.
$legacy = $db->query("SELECT setting_key,setting_value FROM um_settings
    WHERE setting_key LIKE 'whatsapp_%' OR setting_key LIKE 'telegram_%'
       OR setting_key LIKE 'firebase_%' OR setting_key LIKE 'chatbot_%'")->fetchAll(PDO::FETCH_KEY_PAIR);
$legacyValue = static function (string $key, string $fallback = '') use ($legacy): string {
    return array_key_exists($key, $legacy) ? (string)$legacy[$key] : $fallback;
};
$legacyUpdate = $db->prepare("UPDATE um_network_notification_settings SET
    whatsapp_enabled=?, telegram_enabled=?, fcm_enabled=?, chatbot_enabled=?,
    notify_sales=?, notify_receipts=?, notify_transfers=?, notify_inventory=?, notify_routers=?,
    chatbot_welcome_msg=?, chatbot_support_phone=?, chatbot_network_name=?
    WHERE network_id=1");
$legacyUpdate->execute([
    $legacyValue('whatsapp_enabled', '0') === '1' ? 1 : 0,
    $legacyValue('telegram_enabled', '0') === '1' ? 1 : 0,
    $legacyValue('firebase_enabled', '0') === '1' ? 1 : 0,
    $legacyValue('chatbot_enabled', '0') === '1' ? 1 : 0,
    $legacyValue('whatsapp_notify_sales', $legacyValue('telegram_notify_sales', '1')) === '1' ? 1 : 0,
    $legacyValue('whatsapp_notify_receipts', $legacyValue('telegram_notify_receipts', '1')) === '1' ? 1 : 0,
    $legacyValue('whatsapp_notify_transfers', $legacyValue('telegram_notify_transfers', '1')) === '1' ? 1 : 0,
    $legacyValue('whatsapp_notify_low_stock', $legacyValue('telegram_notify_low_stock', '1')) === '1' ? 1 : 0,
    $legacyValue('whatsapp_notify_routers', $legacyValue('telegram_notify_routers', '1')) === '1' ? 1 : 0,
    $legacyValue('chatbot_welcome_msg', 'مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐'),
    $legacyValue('chatbot_support_phone', '777000000'),
    $legacyValue('chatbot_network_name', 'شبكة ميكروتك مانجر')
]);

echo "network_notification_migration_ok\n";
