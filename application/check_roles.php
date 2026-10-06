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
$roles = $db->query("SELECT role_key, role_name_ar, permissions FROM um_roles_def")->fetchAll(PDO::FETCH_ASSOC);
foreach ($roles as $r) {
    echo "Role: {$r['role_key']} ({$r['role_name_ar']})\n";
    echo "Permissions: {$r['permissions']}\n\n";
}
