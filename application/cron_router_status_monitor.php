<?php
declare(strict_types=1);
// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}


date_default_timezone_set(getenv('SAM_TIMEZONE') ?: 'Asia/Aden');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/RouterStatusMonitorService.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

try {
    $db = getDB();
    $dryRun = in_array('--dry-run', $argv ?? [], true);
    $result = (new RouterStatusMonitorService($db))->run($dryRun);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    error_log('Router status monitor failed: ' . $e->getMessage());
    fwrite(STDERR, "router_status_monitor_failed\n");
    exit(1);
}
