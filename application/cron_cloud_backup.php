<?php
declare(strict_types=1);
// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}


/**
 * SAM MikroTik Manager - Automated Off-Site Cloud Backup Cron Script
 * Runs scheduled automated backups, syncs them to Telegram Cloud & SFTP, and purges expired copies.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/CloudBackupService.php';

// Ensure CLI or Authorized execution
if (php_sapi_name() !== 'cli' && (!isset($_GET['token']) || $_GET['token'] !== (defined('CRON_TOKEN') ? CRON_TOKEN : 'sam_cron_secret_2026'))) {
    http_response_code(403);
    die(json_encode(['error' => 'Access denied']));
}

$pdo = getDB();
$cloudService = new CloudBackupService($pdo);

echo "[" . date('Y-m-d H:i:s') . "] Starting scheduled off-site cloud backup routine...\n";

$result = $cloudService->executeScheduledBackup();

if (!empty($result['success'])) {
    echo "[" . date('Y-m-d H:i:s') . "] ✅ Backup & Cloud Sync completed successfully!\n";
    echo "  • Local File: " . ($result['local_backup']['filename'] ?? 'N/A') . "\n";
    echo "  • Size: " . ($result['local_backup']['size_formatted'] ?? 'N/A') . "\n";
    echo "  • Cloud Sync: " . ($result['cloud_sync']['summary'] ?? 'N/A') . "\n";
    echo "  • Purged Old Backups: " . ($result['purged_files_count'] ?? 0) . " files\n";
} else {
    echo "[" . date('Y-m-d H:i:s') . "] ❌ Error during backup execution: " . ($result['error'] ?? 'Unknown error') . "\n";
}

if (php_sapi_name() !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
