<?php
declare(strict_types=1);
// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}


require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/includes/RadiusService.php';
require_once dirname(__DIR__, 2) . '/includes/UserManagerSQLiteImportService.php';

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
    $_SESSION = [];
}

$db = getDB();
$daemon = in_array('--daemon', $argv, true);

function claimJob(PDO $db): ?array
{
    $db->beginTransaction();
    try {
        $row = $db->query("SELECT * FROM um_api_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED")->fetch(PDO::FETCH_ASSOC);
        if (!$row) { $db->commit(); return null; }
        $stmt = $db->prepare("UPDATE um_api_jobs SET status='running',progress=5,started_at=NOW(),attempts=attempts+1 WHERE id=? AND status='queued'");
        $stmt->execute([$row['id']]);
        if ($stmt->rowCount() !== 1) { $db->rollBack(); return null; }
        $db->commit();
        return $row;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function setJob(PDO $db, string $id, string $status, int $progress, ?array $result = null, ?string $error = null): void
{
    $stmt = $db->prepare('UPDATE um_api_jobs SET status=?,progress=?,result=?,error_message=?,finished_at=IF(? IN (\'completed\',\'failed\'),NOW(),finished_at) WHERE id=?');
    $stmt->execute([$status, $progress, $result === null ? null : json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $error ? mb_substr($error, 0, 2000) : null, $status, $id]);
}
function setJobResilient(PDO &$db, string $id, string $status, int $progress, ?array $result = null, ?string $error = null): void
{
    try {
        setJob($db, $id, $status, $progress, $result, $error);
    } catch (Throwable $e) {
        $msg = strtolower($e->getMessage());
        if (str_contains($msg, '2006') || str_contains($msg, '2013') || str_contains($msg, 'server has gone away')) {
            $db = getDB();
            setJob($db, $id, $status, $progress, $result, $error);
            return;
        }
        throw $e;
    }
}

function primeActor(PDO $db, int $adminId): array
{
    $stmt = $db->prepare('SELECT * FROM um_admins WHERE id=? AND is_active=1');
    $stmt->execute([$adminId]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin) throw new RuntimeException('Job owner is missing or inactive');
    $_SESSION['logged_in'] = true;
    $_SESSION['admin_id'] = $adminId;
    $_SESSION['user'] = $admin['username'];
    $_SESSION['fullname'] = $admin['fullname'];
    $_SESSION['role'] = $admin['role'];
    $_SESSION['admin_role'] = $admin['role'];
    $_SESSION['data_scope'] = $admin['data_scope'] ?? 'own';
    $_SESSION['permissions'] = json_decode((string)($admin['permissions'] ?? '[]'), true) ?: [];
    $_SESSION['delegated_admin_ids'] = json_decode((string)($admin['delegated_admin_ids'] ?? '[]'), true) ?: [];
    return $admin;
}

function exportRows(PDO $db, array $payload): array
{
    $where = ['1=1'];
    $params = [];
    if (is_array($payload['scope_ids'] ?? null)) {
        $ids = array_values(array_filter(array_map('intval', $payload['scope_ids'])));
        if (!$ids) return [];
        $where[] = 'id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        array_push($params, ...$ids);
    }
    $filters = (array)($payload['filters'] ?? []);
    if (!empty($filters['role'])) { $where[] = 'role=?'; $params[] = (string)$filters['role']; }
    if (isset($filters['active']) && $filters['active'] !== '') { $where[] = 'is_active=?'; $params[] = (int)(bool)$filters['active']; }
    if (!empty($filters['search'])) {
        $where[] = '(username LIKE ? OR fullname LIKE ? OR phone LIKE ?)';
        $term = '%' . trim((string)$filters['search']) . '%';
        array_push($params, $term, $term, $term);
    }
    $sql = 'SELECT id,username,fullname,phone,email,role,credit_limit,discount_rate,balance,is_active,data_scope,created_at FROM um_admins WHERE ' . implode(' AND ', $where) . ' ORDER BY id';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function createCsv(array $rows, string $file): void
{
    $fp = fopen($file, 'wb');
    if (!$fp) throw new RuntimeException('Unable to create CSV');
    fwrite($fp, "\xEF\xBB\xBF");
    fputcsv($fp, ['ID','Username','Full name','Phone','Email','Role','Credit limit','Discount rate','Balance','Active','Data scope','Created at']);
    foreach ($rows as $row) fputcsv($fp, array_values($row));
    fclose($fp);
}

function createPdf(array $rows, string $file): void
{
    $tcpdf = '/usr/share/php/tcpdf/tcpdf.php';
    if (!is_file($tcpdf)) throw new RuntimeException('TCPDF is not installed');
    require_once $tcpdf;
    $pdf = new TCPDF('L', 'mm', 'A4', true, 'UTF-8', false);
    $pdf->SetCreator('MikroTik User Manager API v1');
    $pdf->SetTitle('Users export');
    $pdf->setPrintHeader(false);
    $pdf->setPrintFooter(false);
    $pdf->SetMargins(8, 8, 8);
    $pdf->AddPage();
    $pdf->SetFont('dejavusans', '', 8);
    $html = '<h2 style="text-align:center">تقرير المستخدمين</h2><table border="1" cellpadding="4"><thead><tr style="background-color:#e5e7eb"><th>ID</th><th>اسم المستخدم</th><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الرصيد</th><th>الحالة</th></tr></thead><tbody>';
    foreach ($rows as $row) {
        $e = static fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html .= '<tr><td>'.$e($row['id']).'</td><td>'.$e($row['username']).'</td><td>'.$e($row['fullname']).'</td><td>'.$e($row['phone']).'</td><td>'.$e($row['role']).'</td><td>'.$e($row['balance']).'</td><td>'.((int)$row['is_active'] ? 'نشط' : 'متوقف').'</td></tr>';
    }
    $html .= '</tbody></table>';
    $pdf->writeHTML($html, true, false, true, false, '');
    $pdf->Output($file, 'F');
}

function processJob(PDO &$db, array $job): void
{
    $payload = json_decode((string)$job['payload'], true) ?: [];
    primeActor($db, (int)$job['created_by']);
    $_SESSION['active_network_id'] = (int)$job['network_id'];
    $service = new RadiusService($db);
    $exportDir = '/var/lib/mikrotik-usermanager/exports';
    if (!is_dir($exportDir) && !mkdir($exportDir, 0750, true) && !is_dir($exportDir)) throw new RuntimeException('Unable to create export directory');
    setJobResilient($db, $job['id'], 'running', 20);
    switch ($job['type']) {
        case 'export_users_csv':
        case 'export_users_pdf':
            $rows = exportRows($db, $payload);
            setJobResilient($db, $job['id'], 'running', 60);
            $ext = str_ends_with($job['type'], '_pdf') ? 'pdf' : 'csv';
            $file = "$exportDir/users-{$job['id']}.$ext";
            $ext === 'pdf' ? createPdf($rows, $file) : createCsv($rows, $file);
            chmod($file, 0640);
            setJobResilient($db, $job['id'], 'completed', 100, ['file' => $file, 'filename' => basename($file), 'rows' => count($rows), 'download_url' => "/api/v1/exports/{$job['id']}/download"]);
            break;
        case 'database_backup':
            $result = $service->createDatabaseBackup();
            if (isset($result['success']) && !$result['success']) throw new RuntimeException((string)($result['error'] ?? 'Backup failed'));
            setJobResilient($db, $job['id'], 'completed', 100, ['backup' => true, 'result' => $result]);
            break;
        case 'router_backup':
            $result = $service->createRouterBackupFile((int)($payload['nas_id'] ?? 0), (string)($payload['backup_name'] ?? ''));
            if (isset($result['success']) && !$result['success']) throw new RuntimeException((string)($result['error'] ?? 'Router backup failed'));
            setJobResilient($db, $job['id'], 'completed', 100, ['router_backup' => true, 'result' => $result]);
            break;
        case 'router_import_prepare':
            setJobResilient($db, $job['id'], 'running', 10);
            $importer = $service->userManagerImport;
            $result = $importer->prepareRouterTransfer((int)($payload['router_id'] ?? 0), (array)($payload['credentials'] ?? []));
            setJobResilient($db, $job['id'], 'completed', 100, $result);
            break;
        case 'router_import_commit':
            setJobResilient($db,$job['id'],'running',10);
            $importer=$service->userManagerImport;$token=(string)($payload['token']??'');$customerId=(int)($payload['customer_id']??0);
            $map=(array)($payload['profile_map']??[]);$mode=(string)($payload['mode']??'all');$target=(string)($payload['target_status']??'disabled');
            $aggregate=['success'=>true,'network_id'=>(int)$job['network_id'],'batch_id'=>null,'imported'=>0,'fresh_imported'=>0,'used_imported'=>0,'duplicates'=>0,'status'=>$target];
            $cursor=0;$processed=0;$batches=0;$all=!empty($payload['import_all']);
            $included=(array)($payload['included_profiles']??[]);if(!$included)$included=array_keys($map);
            $selected=$all?[]:array_values(array_unique(array_filter(array_map('intval',(array)($payload['source_user_ids']??[])),fn($v)=>$v>0)));
            if(!$all&&count($selected)>100000)throw new RuntimeException('حدد حتى 100000 كرت، أو استخدم استيراد الكل');
            do{
                if($all){$page=$importer->getPreviewCardsCursor($token,$cursor,250,$included,$mode);$cursor=$page['next_cursor'];$ids=array_column($page['cards'],'id');$more=$page['has_more'];}
                else{$ids=array_splice($selected,0,250);$more=count($selected)>0;}
                if(!$ids)break;
                $part=$importer->commitSelected($token,$customerId,$map,$ids,$target,false,[],$mode,$more);
                $aggregate['batch_id']=$part['batch_id']??$aggregate['batch_id'];
                foreach(['imported','fresh_imported','used_imported','duplicates'] as $k)$aggregate[$k]+=(int)($part[$k]??0);
                $processed+=count($ids);$batches++;
                // Phase progress stays honest when a cursor has no precomputed total.
                setJobResilient($db,$job['id'],'running',20,['processed'=>$processed,'imported'=>$aggregate['imported'],'batch'=>$batches,'cursor'=>$cursor,'phase'=>'importing']);
            }while($more);
            if($processed===0){$importer->discardPreview($token);throw new RuntimeException('لم توجد بطاقات مطابقة للاختيار');}
            $aggregate['message']="تم استيراد {$aggregate['imported']} كرت على {$batches} دفعة";
            setJobResilient($db,$job['id'],'completed',100,$aggregate);
            break;

        default:
            throw new RuntimeException('Unsupported job type');
    }
}

do {
    try {
        $job = claimJob($db);
        if (!$job) { if ($daemon) sleep(2); continue; }
        try { processJob($db, $job); }
        catch (Throwable $e) { setJobResilient($db, $job['id'], 'failed', 100, null, $e->getMessage()); error_log("API v1 job {$job['id']} failed: {$e->getMessage()}"); }
    } catch (Throwable $e) {
        $message = $e->getMessage();
        error_log('API v1 worker error: ' . $message);
        if (str_contains($message, '2006') || str_contains($message, '2013') || str_contains(strtolower($message), 'server has gone away')) {
            exit(75);
        }
        if ($daemon) sleep(5); else exit(1);
    }
} while ($daemon);
