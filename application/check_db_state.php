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
echo "=== TABLES ===\n";
foreach ($tables as $t) {
    echo $t . "\n";
}
echo "\n=== NETWORKS ===\n";
$nets = $db->query('SELECT * FROM um_networks')->fetchAll(PDO::FETCH_ASSOC);
print_r($nets);

echo "\n=== GATEWAYS / NODES / ROUUTERS ===\n";
$routers = $db->query('SELECT id, nasname, shortname, network_id FROM nas')->fetchAll(PDO::FETCH_ASSOC);
print_r($routers);

$nodes = $db->query('SELECT id, node_name, node_type, nas_ip, network_id FROM um_network_nodes')->fetchAll(PDO::FETCH_ASSOC);
print_r($nodes);
