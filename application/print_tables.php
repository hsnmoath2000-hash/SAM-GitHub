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
$tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
echo implode(', ', $tables) . "\n";
