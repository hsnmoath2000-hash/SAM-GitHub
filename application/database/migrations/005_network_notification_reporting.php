<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/includes/NetworkChannelService.php';

$db = getDB();
$db->exec("CREATE TABLE IF NOT EXISTS um_notification_job_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    network_id INT NOT NULL,
    job_name VARCHAR(64) NOT NULL,
    run_key VARCHAR(40) NOT NULL,
    status ENUM('running','sent','partial','failed','skipped') NOT NULL DEFAULT 'running',
    result_summary VARCHAR(512) NULL,
    error_message VARCHAR(512) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_job_run (network_id,job_name,run_key),
    KEY idx_notification_job_status (status,started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Chatbot permissions are network-owned settings too. Add these columns for
// installations where migration 004 has already created the shared table.
$chatbotAccessColumnsAdded = false;
foreach ([
    'chatbot_allow_subscribers' => 'TINYINT(1) NOT NULL DEFAULT 1',
    'chatbot_allow_pos' => 'TINYINT(1) NOT NULL DEFAULT 1',
    'chatbot_allow_admins' => 'TINYINT(1) NOT NULL DEFAULT 1',
] as $column => $definition) {
    $check = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_network_notification_settings' AND COLUMN_NAME=?");
    $check->execute([$column]);
    if (!(int)$check->fetchColumn()) {
        $db->exec("ALTER TABLE um_network_notification_settings ADD COLUMN {$column} {$definition}");
        $chatbotAccessColumnsAdded = true;
    }
}

if ($chatbotAccessColumnsAdded) {
    $legacyChatbot = $db->query("SELECT setting_key,setting_value FROM um_settings WHERE setting_key IN
        ('chatbot_allow_subscribers','chatbot_allow_pos','chatbot_allow_admins')")->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
    $chatbotAccess = $db->prepare("UPDATE um_network_notification_settings SET
        chatbot_allow_subscribers=?,chatbot_allow_pos=?,chatbot_allow_admins=? WHERE network_id=1");
    $chatbotAccess->execute([
        ($legacyChatbot['chatbot_allow_subscribers'] ?? '1') === '1' ? 1 : 0,
        ($legacyChatbot['chatbot_allow_pos'] ?? '1') === '1' ? 1 : 0,
        ($legacyChatbot['chatbot_allow_admins'] ?? '1') === '1' ? 1 : 0,
    ]);
}

// Copy the old global credentials to network 1 only. Values are read in
// process memory and encrypted by NetworkChannelService before being stored.
$legacy = $db->query("SELECT setting_key,setting_value FROM um_settings
    WHERE setting_key LIKE 'whatsapp_%' OR setting_key LIKE 'telegram_%'")->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
$setting = static fn(string $key, string $default = ''): string => (string)($legacy[$key] ?? $default);
$channels = new NetworkChannelService($db);
$networkSettings = $channels->getNotificationSettings(1);
$migrated = [];

foreach (['whatsapp', 'telegram'] as $type) {
    $exists = $db->prepare('SELECT 1 FROM um_network_channels WHERE network_id=1 AND channel_type=? LIMIT 1');
    $exists->execute([$type]);
    if ($exists->fetchColumn()) continue;

    if ($type === 'whatsapp') {
        $enabled = $setting('whatsapp_enabled', '0') === '1' && !empty($networkSettings['whatsapp_enabled']);
        $data = [
            'api_url' => $setting('whatsapp_api_url', 'http://127.0.0.1:3388'),
            'bot_token' => $setting('whatsapp_bot_token'),
            'chat_id' => $setting('whatsapp_chat_id'),
            'enabled' => $enabled,
            'label' => 'WhatsApp — Network 1',
            'status' => 'MIGRATED_FROM_LEGACY',
        ];
    } else {
        $enabled = $setting('telegram_enabled', '0') === '1' && !empty($networkSettings['telegram_enabled']);
        $data = [
            'api_url' => $setting('telegram_api_url'),
            'bot_token' => $setting('telegram_bot_token'),
            'chat_id' => $setting('telegram_chat_id'),
            'webhook_secret' => $setting('telegram_webhook_secret'),
            'enabled' => $enabled,
            'label' => 'Telegram — Network 1',
            'status' => 'MIGRATED_FROM_LEGACY',
        ];
    }
    $channels->saveChannel(1, $type, $data, 1);
    $migrated[] = $type;
}

echo 'network_notification_reporting_migration_ok channels=' . implode(',', $migrated) . PHP_EOL;
