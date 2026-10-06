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

echo "=== UM_ADMIN_NETWORK_ACCESS ===\n";
$access = $db->query("SELECT * FROM um_admin_network_access")->fetchAll(PDO::FETCH_ASSOC);
print_r($access);

echo "\n=== UM_ADMIN_NETWORK_ROLES ===\n";
$roles = $db->query("SELECT * FROM um_admin_network_roles")->fetchAll(PDO::FETCH_ASSOC);
print_r($roles);

echo "\n=== UM_ADMINS ===\n";
$admins = $db->query("SELECT id, username, fullname, role FROM um_admins")->fetchAll(PDO::FETCH_ASSOC);
print_r($admins);
