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

$admin1 = $db->query("SELECT * FROM um_admin_network_access WHERE admin_id = 1")->fetchAll(PDO::FETCH_ASSOC);
echo "=== ADMIN 1 ACCESS ===\n";
print_r($admin1);
