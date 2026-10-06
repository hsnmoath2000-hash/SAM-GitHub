<?php

// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}
require '/var/www/mikrotik-usermanager/config.php';

if (php_sapi_name() !== 'cli' && empty($_SESSION['admin_id']) && empty($_SESSION['system_owner_authenticated'])) {
    http_response_code(403);
    die('Forbidden: CLI or authenticated session required');
}

$db = getDB();

echo "=== NETWORKS ===\n";
$nets = $db->query("SELECT id, code, name FROM um_networks")->fetchAll(PDO::FETCH_ASSOC);
print_r($nets);

echo "\n=== UM_NETWORK_CHANNELS ===\n";
$channels = $db->query("SELECT * FROM um_network_channels")->fetchAll(PDO::FETCH_ASSOC);
print_r($channels);

echo "\n=== UM_NETWORK_NOTIFICATION_SETTINGS ===\n";
$notif = $db->query("SELECT * FROM um_network_notification_settings")->fetchAll(PDO::FETCH_ASSOC);
print_r($notif);

echo "\n=== SMS / WHATSAPP SETTINGS IN UM_SETTINGS ===\n";
$settings = $db->query("SELECT setting_key, setting_value, network_id FROM um_settings WHERE setting_key LIKE '%whatsapp%' OR setting_key LIKE '%sms%' OR setting_key LIKE '%gateway%' OR setting_key LIKE '%telegram%'")->fetchAll(PDO::FETCH_ASSOC);
print_r($settings);
