#!/usr/bin/env php
<?php
/**
 * sam_maintenance.php — نظام الصيانة والأتمتة الدورية لمنظومة SAM
 *
 * المهام:
 *  - auto_backup: أخذ نسخة احتياطية يومية من قاعدة البيانات + ضغط + تدوير (حذف أقدم من 14 يوم)
 *  - cleanup_sessions: تنظيف جلسات RADIUS المعلقة (Stale Sessions)
 *  - cleanup_logs: تنظيف السجلات القديمة والملفات المؤقتة
 *  - check_routers: فحص اتصال الراوترات وإرسال تنبيه في حال الانقطاع
 *  - health_check: فحص الخدمات الأساسية وتنبيه في حال توقف أي خدمة
 */

declare(strict_types=1);
// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}


define('APP_ROOT', dirname(__FILE__));
require_once APP_ROOT . '/config.php';

if (php_sapi_name() !== 'cli' && empty($_SESSION['admin_id']) && empty($_SESSION['system_owner_authenticated'])) {
    http_response_code(403);
    die('Forbidden: CLI or authenticated session required');
}

require_once APP_ROOT . '/includes/RadiusService.php';
require_once APP_ROOT . '/includes/WhatsAppService.php';

try {
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT ?? 3306, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 15,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "[sam_maintenance] Database connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    @session_start();
}
if (php_sapi_name() === 'cli') {
    $_SESSION['admin_id'] = 1;
    $_SESSION['admin_role'] = 'system_owner';
    $_SESSION['system_owner_authenticated'] = true;
    $_SESSION['active_network_id'] = 1;
}

$service = new RadiusService();
$wa      = new WhatsAppService($pdo, null, 1);

$task = $argv[1] ?? 'all';
$ts   = date('Y-m-d H:i:s');
echo "[sam_maintenance] {$ts} — Starting task: {$task}\n";

switch ($task) {
    // ─── 1. النسخ الاحتياطي اليومي وتدوير الملفات ─────────────────────────────
    case 'auto_backup':
        echo "--> Running Database Backup...\n";
        $res = $service->createDatabaseBackup();
        if (isset($res['error'])) {
            echo "❌ Backup failed: {$res['error']}\n";
            // Send alert to superadmin via WhatsApp
            $stmt = $pdo->query("SELECT phone FROM um_admins WHERE role IN ('system_owner', 'superadmin') AND is_active=1 AND phone IS NOT NULL AND phone != '' ORDER BY FIELD(role, 'system_owner', 'superadmin') LIMIT 1");
            $phone = $stmt->fetchColumn();
            if ($phone) {
                $wa->sendMessage($phone, "⚠️ *فشل النسخ الاحتياطي التلقائي لقاعدة البيانات*\n\nالخطأ: {$res['error']}\nالتاريخ: " . date('Y-m-d H:i'));
            }
            exit(1);
        }

        echo "✅ Backup created successfully.\n";

        // Retention Policy: Delete backups older than 14 days
        $backupDir = '/var/backups/mikrotik-usermanager';
        $retentionDays = 14;
        $deletedCount = 0;
        if (is_dir($backupDir)) {
            $files = glob("{$backupDir}/radius_backup_*.sql.gz");
            $now = time();
            foreach ($files as $f) {
                if (is_file($f) && ($now - filemtime($f)) > ($retentionDays * 86400)) {
                    @unlink($f);
                    $deletedCount++;
                }
            }
        }
        echo "--> Retention cleanup: deleted {$deletedCount} backups older than {$retentionDays} days.\n";
        break;

    // ─── 2. تنظيف الجلسات المعلقة (Stale Sessions) ───────────────────────────
    case 'cleanup_sessions':
        echo "--> Cleaning up stale RADIUS sessions...\n";
        $res = $service->cleanupStaleSessions();
        $closed = $res['closed_count'] ?? 0;
        echo "✅ Closed {$closed} stale session(s).\n";
        break;

    // ─── 3. تنظيف السجلات والملفات المؤقتة ───────────────────────────────────
    case 'cleanup_logs':
        echo "--> Cleaning up old logs and exports...\n";
        
        // Truncate activity logs older than 90 days
        $stmt1 = $pdo->query("DELETE FROM um_activity_logs WHERE created_at < NOW() - INTERVAL 90 DAY");
        $actDeleted = $stmt1 ? $stmt1->rowCount() : 0;
        echo "  • Deleted {$actDeleted} activity log rows (>90d).\n";

        // Truncate notification logs older than 60 days
        $stmt2 = $pdo->query("DELETE FROM um_notification_logs WHERE created_at < NOW() - INTERVAL 60 DAY");
        $notifDeleted = $stmt2 ? $stmt2->rowCount() : 0;
        echo "  • Deleted {$notifDeleted} notification log rows (>60d).\n";

        // Truncate radpostauth logs older than 90 days
        try {
            $stmtRad = $pdo->query("DELETE FROM radpostauth WHERE authdate < NOW() - INTERVAL 90 DAY");
            $radDeleted = $stmtRad ? $stmtRad->rowCount() : 0;
            echo "  • Deleted {$radDeleted} radpostauth rows (>90d).\n";
        } catch (Throwable $e) {}

        // Clean temporary exports older than 7 days
        $exportDir = '/var/lib/mikrotik-usermanager/exports';
        $expDeleted = 0;
        if (is_dir($exportDir)) {
            foreach (glob("{$exportDir}/*") as $f) {
                if (is_file($f) && (time() - filemtime($f)) > (7 * 86400)) {
                    @unlink($f);
                    $expDeleted++;
                }
            }
        }
        echo "  • Deleted {$expDeleted} temporary export file(s) (>7d).\n";
        break;

    // ─── 4. فحص اتصال الراوترات ──────────────────────────────────────────────
    case 'check_routers':
        echo "--> Checking router connectivity...\n";
        $routers = $pdo->query("SELECT id, shortname, nasname, api_enabled FROM nas WHERE nasname IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($routers as $r) {
            $ip = $r['nasname'];
            $name = $r['shortname'] ?: $ip;
            $pingOutput = [];
            $exitCode = 1;
            exec(sprintf('ping -c 1 -W 2 %s 2>&1', escapeshellarg($ip)), $pingOutput, $exitCode);
            if ($exitCode === 0) {
                echo "  • Router [{$name}] ({$ip}): ONLINE ✅\n";
            } else {
                echo "  • Router [{$name}] ({$ip}): UNREACHABLE ❌\n";
            }
        }
        break;

    // ─── 5. فحص صحة الخادم والخدمات ───────────────────────────────────────────
    case 'health_check':
        echo "--> Checking system services health...\n";
        $health = $service->checkServicesHealth();
        echo "  • Status: " . ($health['is_healthy'] ? 'HEALTHY ✅' : 'ATTENTION REQUIRED ⚠️') . "\n";
        foreach ($health['services'] as $s) {
            echo "    - {$s['name']} ({$s['unit']}): " . ($s['active'] ? 'ACTIVE ✅' : 'DOWN ❌') . "\n";
        }
        echo "  • Disk Usage: {$health['disk']['used_percent']}% ({$health['disk']['free_gb']} GB Free / {$health['disk']['total_gb']} GB Total)\n";
        echo "  • Memory Usage: {$health['memory']['used_percent']}% ({$health['memory']['free_mb']} MB Free)\n";
        break;

    // ─── 6. فحص مقاصة التجوال بين الشبكات ─────────────────────────────────────
    case 'roaming_settle':
        echo "--> Checking network roaming usage summary...\n";
        $roam = $service->getRoamingUsageSummary();
        echo "  • Found {$roam['count']} cross-network roaming consumption pair(s).\n";
        foreach ($roam['roaming_pairs'] as $rp) {
            echo "    - [{$rp['home_network_name']}] ➜ Consumed on [{$rp['visited_network_name']}]: {$rp['total_sessions']} sessions, {$rp['data_formatted']}, {$rp['time_formatted']}\n";
        }
        break;

    // ─── 7. تنفيذ كافة مهام الصيانة المتكاملة ─────────────────────────────────
    case 'all':
        echo "--> Running all maintenance tasks in sequence...\n";
        passthru(PHP_BINARY . " " . escapeshellarg(__FILE__) . " cleanup_sessions");
        passthru(PHP_BINARY . " " . escapeshellarg(__FILE__) . " cleanup_logs");
        passthru(PHP_BINARY . " " . escapeshellarg(__FILE__) . " check_routers");
        passthru(PHP_BINARY . " " . escapeshellarg(__FILE__) . " health_check");
        passthru(PHP_BINARY . " " . escapeshellarg(__FILE__) . " roaming_settle");
        break;

    default:
        fwrite(STDERR, "Unknown maintenance task: {$task}\n");
        fwrite(STDERR, "Usage: php sam_maintenance.php [auto_backup|cleanup_sessions|cleanup_logs|check_routers|health_check|roaming_settle|all]\n");
        exit(1);
}

echo "[sam_maintenance] Done — " . date('Y-m-d H:i:s') . "\n";
exit(0);
