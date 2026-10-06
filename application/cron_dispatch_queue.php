<?php
declare(strict_types=1);
// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}


if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once '/var/www/mikrotik-usermanager/config.php';
require_once '/var/www/mikrotik-usermanager/includes/WhatsAppService.php';
require_once '/var/www/mikrotik-usermanager/includes/MessageQueueManager.php';

$pdo = getDB();
$apiService = new WhatsAppService($pdo);
$queueManager = new MessageQueueManager($pdo);

$sentCount = $queueManager->dispatchApprovedQueue($apiService, 50);
echo "[" . date('Y-m-d H:i:s') . "] Dispatched {$sentCount} approved WhatsApp messages.\n";
