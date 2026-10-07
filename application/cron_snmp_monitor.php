<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

date_default_timezone_set(getenv('SAM_TIMEZONE') ?: 'Asia/Aden');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';

try {
    $db = getDB();
    $snmp = new SnmpFleetMonitorService($db);
    
    // Fetch active networks
    $networks = $db->query("SELECT id FROM um_networks WHERE status = 'active'")->fetchAll(PDO::FETCH_COLUMN) ?: [1];
    $totalPolled = 0;
    
    foreach ($networks as $netId) {
        $res = $snmp->pollAllDevices((int)$netId);
        $totalPolled += ($res['polled_count'] ?? 0);
    }
    
    echo "[" . date('Y-m-d H:i:s') . "] SNMP Monitor completed. Total devices polled: {$totalPolled}\n";
} catch (Throwable $e) {
    error_log("SNMP Monitor Cron failed: " . $e->getMessage());
    fwrite(STDERR, "snmp_monitor_failed: " . $e->getMessage() . "\n");
    exit(1);
}
