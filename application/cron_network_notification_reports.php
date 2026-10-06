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

date_default_timezone_set(getenv('SAM_TIMEZONE') ?: 'Asia/Aden');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/NetworkChannelService.php';
require_once __DIR__ . '/includes/WhatsAppReportService.php';
require_once __DIR__ . '/includes/FirebaseService.php';

$db = getDB();
$currentNetworkId = (int)$db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn();
$lockName = 'sam_network_notification_reports';
$lock = (int)$db->query("SELECT GET_LOCK(" . $db->quote($lockName) . ",0)")->fetchColumn();
if ($lock !== 1) exit("already_running\n");

function samNotificationRunKey(DateTimeImmutable $date, int $hour, int $minute): string
{
    return $date->format('Y-m-d') . 'T' . sprintf('%02d:%02d', $hour, $minute);
}

function samNotificationJobDue(DateTimeImmutable $now, int $hour, int $minute, int $graceMinutes = 45): bool
{
    $scheduled = new DateTimeImmutable($now->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', $hour, $minute), $now->getTimezone());
    return $now >= $scheduled && $now < $scheduled->modify('+' . $graceMinutes . ' minutes');
}

function samClaimNotificationRun(PDO $db, int $networkId, string $job, string $runKey): bool
{
    $stmt = $db->prepare("INSERT IGNORE INTO um_notification_job_runs (network_id,job_name,run_key,status,started_at)
        VALUES (?,?,?,'running',NOW())");
    $stmt->execute([$networkId, $job, $runKey]);
    return $stmt->rowCount() === 1;
}

function samFinishNotificationRun(PDO $db, int $networkId, string $job, string $runKey, string $status, string $summary = '', ?string $error = null): void
{
    $stmt = $db->prepare("UPDATE um_notification_job_runs
        SET status=?,result_summary=?,error_message=?,finished_at=NOW()
        WHERE network_id=? AND job_name=? AND run_key=? AND status='running'");
    $stmt->execute([$status, mb_substr($summary, 0, 512), $error !== null ? mb_substr($error, 0, 512) : null, $networkId, $job, $runKey]);
}

function samPersistSystemOwnerAlert(PDO $db, int $networkId, string $title, string $message): int
{
    $owners = $db->prepare("SELECT DISTINCT so.admin_id
        FROM um_system_owners so
        JOIN um_admins a ON a.id=so.admin_id AND a.is_active=1");
    $owners->execute();
    $insert = $db->prepare("INSERT INTO um_notifications
        (network_id,category,title,message,target_role,target_admin_id,is_read,metadata,created_at)
        VALUES (?,'system',?,?,'system_owner',?,0,?,NOW())");
    $count = 0;
    foreach ($owners->fetchAll(PDO::FETCH_COLUMN) as $adminId) {
        $insert->execute([$networkId, $title, $message, (int)$adminId, '{"scope":"platform_owner","source":"network_notification_cron"}']);
        $count++;
    }
    return $count;
}

function samSystemOwnerPushEnabled(PDO $db): bool
{
    try {
        $stmt = $db->prepare("SELECT setting_value FROM um_settings WHERE setting_key='system_owner_alert_push_enabled' LIMIT 1");
        $stmt->execute();
        $value = $stmt->fetchColumn();
        // Preserve current behavior on first upgrade; only an explicit 0 opts out.
        return $value === false || (string)$value !== '0';
    } catch (Throwable $e) {
        error_log('System owner push preference unavailable; disabling push for this run');
        return false;
    }
}

function samReportStatus(array $result): array
{
    $channels = [];
    $wa = $result['whatsapp'] ?? [];
    if (!empty($wa['enabled'])) {
        $channels[] = ['enabled' => true, 'success' => (int)($wa['sent_count'] ?? 0) > 0];
    }
    $tg = $result['telegram'] ?? [];
    if (empty($tg['skipped'])) {
        $channels[] = ['enabled' => true, 'success' => !empty($tg['success'])];
    }
    if (!$channels) return ['status' => 'skipped', 'summary' => 'لا توجد قناة مفعّلة لهذه الشبكة'];
    $success = count(array_filter($channels, static fn(array $channel): bool => $channel['success']));
    if ($success === count($channels)) return ['status' => 'sent', 'summary' => 'تم الإرسال عبر القنوات المفعّلة'];
    if ($success > 0) return ['status' => 'partial', 'summary' => 'نجح الإرسال عبر بعض القنوات وتعذّر عبر أخرى'];
    return ['status' => 'failed', 'summary' => 'فشل الإرسال عبر القنوات المفعّلة'];
}

require_once __DIR__ . '/includes/NetworkClock.php';

$networks = $db->query("SELECT id,name FROM um_networks WHERE status='active' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$processed = [];

try {
    foreach ($networks as $network) {
        $networkId = (int)$network['id'];
        $now = new DateTimeImmutable('now', new DateTimeZone(NetworkClock::timezone($db,$networkId)));
        $jobs = [];
        if (samNotificationJobDue($now,8,0)) $jobs[]=['daily_morning_report',8,0];
        if (samNotificationJobDue($now,9,0)) $jobs[]=['low_stock_alerts',9,0];
        if (samNotificationJobDue($now,21,0)) $jobs[]=['daily_cashbox_report',21,0];
        if ((int)$now->format('N')===7 && samNotificationJobDue($now,21,15)) $jobs[]=['weekly_summary_report',21,15];
        $db->exec('SET @sam_active_network_id=' . $networkId);
        foreach ($jobs as [$job, $hour, $minute]) {
            $runKey = samNotificationRunKey($now, (int)$hour, (int)$minute);
            if (!samClaimNotificationRun($db, $networkId, (string)$job, $runKey)) continue;

            try {
                $report = new WhatsAppReportService($db, $networkId);
                if ($job === 'daily_morning_report') {
                    $result = $report->sendDailyMorningReport();
                } elseif ($job === 'daily_cashbox_report') {
                    $result = $report->sendDailyCashboxReport();
                } elseif ($job === 'weekly_summary_report') {
                    $result = $report->sendWeeklySummaryReport();
                } else {
                    $result = $report->checkAndSendLowStockAlerts();
                    if (empty($result['alerts'])) {
                        samFinishNotificationRun($db, $networkId, (string)$job, $runKey, 'skipped', 'لا توجد مخازن وصلت إلى حد التنبيه');
                        $processed[] = ['network_id' => $networkId, 'job' => $job, 'status' => 'skipped'];
                        continue;
                    }
                    $result = $result['owner'] ?? [];
                }

                $state = samReportStatus($result);
                samFinishNotificationRun($db, $networkId, (string)$job, $runKey, $state['status'], $state['summary']);
                $processed[] = ['network_id' => $networkId, 'job' => $job, 'status' => $state['status']];

                if (in_array($state['status'], ['failed', 'partial'], true)) {
                    $networkName = (string)$network['name'];
                    $ownerTitle = 'تنبيه من النظام الرئيسي';
                    $ownerMessage = 'تعذّر إرسال تقرير ' . $job . ' لشبكة ' . $networkName . '. راجع سجل إشعارات الشبكة.';
                    try { samPersistSystemOwnerAlert($db, $networkId, $ownerTitle, $ownerMessage); }
                    catch (Throwable $notifyError) { error_log('System owner inbox write failed for network ' . $networkId); }
                    if (samSystemOwnerPushEnabled($db)) {
                        try {
                            FirebaseService::sendToSystemOwnersAcrossNetworks(
                                $db,
                                $ownerTitle,
                                $ownerMessage,
                                ['scope' => 'system', 'network_id' => (string)$networkId, 'job' => (string)$job],
                                'system_notification_job_failure',
                                $job . ':' . $runKey,
                                1
                            );
                        } catch (Throwable $pushError) { error_log('System owner push failed for network ' . $networkId); }
                    }
                }
            } catch (Throwable $e) {
                samFinishNotificationRun($db, $networkId, (string)$job, $runKey, 'failed', 'تعذر تجهيز التقرير', $e->getMessage());
                $processed[] = ['network_id' => $networkId, 'job' => $job, 'status' => 'failed'];
                try {
                    $ownerTitle = 'تعذّر تجهيز تقرير شبكة';
                    $ownerMessage = 'تعذّر تجهيز ' . $job . ' للشبكة ' . (string)$network['name'] . '. راجع سجل تشغيل النظام.';
                    try { samPersistSystemOwnerAlert($db, $networkId, $ownerTitle, $ownerMessage); }
                    catch (Throwable $notifyError) { error_log('System owner inbox write failed for network ' . $networkId); }
                    if (samSystemOwnerPushEnabled($db)) {
                        try {
                            FirebaseService::sendToSystemOwnersAcrossNetworks(
                                $db,
                                $ownerTitle,
                                $ownerMessage,
                                ['scope' => 'system', 'network_id' => (string)$networkId, 'job' => (string)$job],
                                'system_notification_job_exception',
                                $job . ':' . $runKey,
                                1
                            );
                        } catch (Throwable $pushError) { error_log('System owner push failed for network ' . $networkId); }
                    }
                } catch (Throwable $ignored) {}
            }
        }
    }
} finally {
    if ($currentNetworkId > 0) $db->exec('SET @sam_active_network_id=' . $currentNetworkId);
    $db->query("SELECT RELEASE_LOCK(" . $db->quote($lockName) . ")");
}

echo json_encode(['success' => true, 'timezone' => date_default_timezone_get(), 'processed' => $processed], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
