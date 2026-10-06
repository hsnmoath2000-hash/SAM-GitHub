#!/usr/bin/env php
<?php
/**
 * wa_reports.php — نقطة دخول Cron لتقارير واتساب
 *
 * الاستخدام:
 *   php wa_reports.php daily_morning   # التقرير الصباحي اليومي
 *   php wa_reports.php daily_cashbox   # تقرير الصندوق المسائي
 *   php wa_reports.php weekly_summary  # التقرير الأسبوعي
 *   php wa_reports.php low_stock       # فحص نفاد الكروت
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
define('APP_ROOT', dirname(__FILE__));
require_once APP_ROOT . '/config.php';
require_once APP_ROOT . '/includes/WhatsAppReportService.php';

// ─── اتصال قاعدة البيانات ─────────────────────────────────────────────────────
try {
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT ?? 3306, DB_NAME
    );
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 10,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "[wa_reports] DB connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

// ─── تنفيذ التقرير ────────────────────────────────────────────────────────────
$type = $argv[1] ?? '';
$svc  = new WhatsAppReportService($pdo);

$ts = date('Y-m-d H:i:s');
echo "[wa_reports] {$ts} — Running: {$type}\n";

try {
    switch ($type) {
        case 'daily_morning':
            $result = $svc->sendDailyMorningReport();
            echo "[wa_reports] Daily morning report sent to " . count($result) . " recipients\n";
            foreach ($result as $r) {
                $status = $r['success'] ? '✅' : '❌';
                echo "  {$status} {$r['admin']} ({$r['phone']})\n";
            }
            break;

        case 'daily_cashbox':
            $result = $svc->sendDailyCashboxReport();
            echo "[wa_reports] Cashbox report sent to " . count($result) . " recipients\n";
            foreach ($result as $r) {
                $status = $r['success'] ? '✅' : '❌';
                echo "  {$status} {$r['admin']} ({$r['phone']})\n";
            }
            break;

        case 'weekly_summary':
            $result = $svc->sendWeeklySummaryReport();
            echo "[wa_reports] Weekly report sent to " . count($result) . " recipients\n";
            foreach ($result as $r) {
                $status = $r['success'] ? '✅' : '❌';
                echo "  {$status} {$r['admin']} ({$r['phone']})\n";
            }
            break;

        case 'low_stock':
            $result = $svc->checkAndSendLowStockAlerts();
            echo "[wa_reports] Low stock check: {$result['sent']} alert(s)\n";
            foreach ($result['alerts'] ?? [] as $a) {
                echo "  ⚠️  {$a['owner_name']} / {$a['profile_name']}: {$a['stock_count']} cards\n";
            }
            break;

        default:
            fwrite(STDERR, "[wa_reports] Unknown report type: '{$type}'\n");
            fwrite(STDERR, "Usage: php wa_reports.php [daily_morning|daily_cashbox|weekly_summary|low_stock]\n");
            exit(1);
    }

    echo "[wa_reports] Done — " . date('Y-m-d H:i:s') . "\n";
    exit(0);

} catch (Throwable $e) {
    fwrite(STDERR, "[wa_reports] ERROR: " . $e->getMessage() . "\n");
    fwrite(STDERR, $e->getTraceAsString() . "\n");
    exit(1);
}
