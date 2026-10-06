<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/includes/RadiusService.php';
require_once __DIR__ . '/lib/ApiResponse.php';
require_once __DIR__ . '/lib/ApiAuth.php';
require_once __DIR__ . '/lib/ApiAuthorization.php';
require_once __DIR__ . '/lib/AuthorizationContext.php';
require_once __DIR__ . '/lib/ApiJobs.php';

// API v1 is bearer-only. Keep the legacy bootstrap for shared DB/services,
// but do not create or persist a PHP session cookie for API clients.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_destroy();
    $_SESSION = [];
}
header_remove('Set-Cookie');
header_remove('Expires');
header_remove('Pragma');

ApiResponse::init();
require __DIR__.'/integration-cors.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Allow: GET, POST, PATCH, DELETE, OPTIONS');
    http_response_code(204);
    exit;
}

$db = getDB();
$auth = new ApiAuth($db);
$jobs = new ApiJobs($db);
$service = new RadiusService();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^.*?/api/v1(?:/index\.php)?#', '', $path) ?: '/';
$path = '/' . ltrim($path, '/');

function apiBody(): array
{
    static $body;
    if ($body !== null) return $body;
    $contentType = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($contentType, 'application/json')) {
        $raw = file_get_contents('php://input');
        $body = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($body)) throw new InvalidArgumentException('INVALID_JSON');
    } else {
        $body = $_POST;
    }
    return $body;
}

function apiPage(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 25)));
    return [$page, $perPage, ($page - 1) * $perPage];
}

function apiPagination(int $page, int $perPage, int $total): array
{
    return ['page' => $page, 'per_page' => $perPage, 'total' => $total, 'last_page' => max(1, (int)ceil($total / $perPage))];
}

function apiClientIp(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

function apiUserAgent(): string
{
    return (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
}

try {
    if ($method === 'GET' && $path === '/health') {
        $db->query('SELECT 1');
        ApiResponse::ok(['status' => 'ok', 'version' => '1.0.0', 'database' => 'ok']);
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $input = apiBody();
        $pair = $auth->login((string)($input['username'] ?? ''), (string)($input['password'] ?? ''), (string)($input['device_name'] ?? 'API client'), apiClientIp(), apiUserAgent());
        ApiResponse::ok($pair);
    }

    if ($method === 'POST' && $path === '/auth/refresh') {
        $input = apiBody();
        if (empty($input['refresh_token'])) throw new InvalidArgumentException('REFRESH_TOKEN_REQUIRED');
        ApiResponse::ok($auth->refresh((string)$input['refresh_token'], apiClientIp(), apiUserAgent()));
    }

    $tokenActor = $auth->authenticate();
    $requestedNetworkId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? 0);
    $networkActor = AuthorizationContext::loadActor(
        $db,
        (int)$tokenActor['admin_id'],
        $requestedNetworkId > 0 ? $requestedNetworkId : null
    );
    // Keep token metadata required by logout while replacing stale token role/scope
    // claims with the live role and permissions for the selected network.
    $actor = array_merge($tokenActor, $networkActor);
    $authorizationContext = new AuthorizationContext($db, $actor);
    $authorizationContext->assertActiveNetwork();
    $_SERVER['HTTP_X_SAM_NETWORK_ID'] = (string)$authorizationContext->activeNetworkId();
    if($requestedNetworkId>0&&$requestedNetworkId!==$authorizationContext->activeNetworkId())throw new DomainException('FORBIDDEN_NETWORK');
    $GLOBALS['sam_request_authorization_context'] = $authorizationContext;
    require __DIR__.'/network-integration-routes.php';

    if ($method === 'POST' && $path === '/auth/logout') {
        $auth->logout($actor);
        ApiResponse::ok(['logged_out' => true]);
    }

    if ($method === 'GET' && $path === '/me') {
        ApiResponse::ok(ApiAuth::publicUser($actor));
    }

    if ($method === 'GET' && $path === '/users') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        [$page, $perPage, $offset] = apiPage();
        $ids = $authorizationContext->scopeAdminIds();
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $where = ["a.id IN ($marks)"];
        $params = $ids;
        if (($search = trim((string)($_GET['search'] ?? ''))) !== '') {
            $where[] = '(a.username LIKE ? OR a.fullname LIKE ? OR a.phone LIKE ?)';
            $term = '%' . $search . '%';
            array_push($params, $term, $term, $term);
        }
        if (($role = trim((string)($_GET['role'] ?? ''))) !== '') { $where[] = 'a.role=?'; $params[] = $role; }
        if (isset($_GET['active']) && $_GET['active'] !== '') { $where[] = 'a.is_active=?'; $params[] = (int)(bool)$_GET['active']; }
        $whereSql = implode(' AND ', $where);
        $count = $db->prepare("SELECT COUNT(*) FROM um_admins a WHERE $whereSql");
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $stmt = $db->prepare("SELECT a.id,a.username,a.fullname,a.phone,a.email,a.role,a.parent_id,a.credit_limit,a.discount_rate,a.balance,a.is_active,a.data_scope,a.created_at FROM um_admins a WHERE $whereSql ORDER BY a.id DESC LIMIT $perPage OFFSET $offset");
        $stmt->execute($params);
        ApiResponse::ok($stmt->fetchAll(PDO::FETCH_ASSOC), apiPagination($page, $perPage, $total));
    }

    if ($method === 'POST' && $path === '/users') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $result = $service->saveAdmin(apiBody());
        ApiResponse::ok($result, ['whatsapp_confirmation' => !empty($result['whatsapp_sent']) ? 'sent' : 'not_sent'], 201);
    }

    if (preg_match('#^/users/(\d+)$#', $path, $m)) {
        $targetId = (int)$m[1];
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $authorizationContext->assertCanAccessAdmin($targetId);
        if ($method === 'GET') {
            $data = $service->getAdminById($targetId);
            if (!$data) throw new DomainException('USER_NOT_FOUND');
            ApiResponse::ok($data);
        }
        if ($method === 'PATCH') {
            $input = apiBody();
            $input['id'] = $targetId;
            ApiResponse::ok($service->saveAdmin($input));
        }
    }

    if ($method === 'POST' && preg_match('#^/users/(\d+)/tokens/revoke$#', $path, $m)) {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $targetId = (int)$m[1];
        $authorizationContext->assertCanAccessAdmin($targetId);
        $auth->revokeAllForAdmin($targetId);
        ApiResponse::ok(['revoked' => true, 'admin_id' => $targetId]);
    }

    if ($method === 'GET' && $path === '/notifications') {
        [$page, $perPage, $offset] = apiPage();
        $where = 'network_id=? AND (target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL)';
        $params = [$authorizationContext->activeNetworkId(), (int)$actor['admin_id'], (string)$actor['role']];
        if (isset($_GET['after_id'])) { $where .= ' AND id>?'; $params[] = max(0, (int)$_GET['after_id']); }
        $count = $db->prepare("SELECT COUNT(*) FROM um_notifications WHERE $where");
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $stmt = $db->prepare("SELECT id,category,title,message,is_read,metadata,created_at FROM um_notifications WHERE $where ORDER BY id DESC LIMIT $perPage OFFSET $offset");
        $stmt->execute($params);
        ApiResponse::ok($stmt->fetchAll(PDO::FETCH_ASSOC), apiPagination($page, $perPage, $total));
    }

    if ($method === 'POST' && preg_match('#^/notifications/(\d+)/read$#', $path, $m)) {
        $stmt = $db->prepare('UPDATE um_notifications SET is_read=1 WHERE network_id=? AND id=? AND (target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL)');
        $stmt->execute([$authorizationContext->activeNetworkId(), (int)$m[1], (int)$actor['admin_id'], (string)$actor['role']]);
        ApiResponse::ok(['updated' => $stmt->rowCount() > 0]);
    }

    if ($method === 'POST' && $path === '/exports') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $input = apiBody();
        $resource = (string)($input['resource'] ?? 'users');
        $format = strtolower((string)($input['format'] ?? 'csv'));
        if ($resource !== 'users' || !in_array($format, ['csv', 'pdf'], true)) throw new InvalidArgumentException('UNSUPPORTED_EXPORT');
        $job = $jobs->create((int)$actor['admin_id'], "export_users_$format", [
            'network_id' => $authorizationContext->activeNetworkId(),
            'filters' => (array)($input['filters'] ?? []),
            'scope_ids' => $authorizationContext->scopeAdminIds(),
        ]);
        ApiResponse::ok($job, ['poll_url' => '/api/v1/jobs/' . $job['id']], 202);
    }

    if ($method === 'POST' && $path === '/jobs/backup') {
        ApiAuthorization::requirePermission($actor, 'backups');
        $job = $jobs->create((int)$actor['admin_id'], 'database_backup', []);
        ApiResponse::ok($job, ['poll_url' => '/api/v1/jobs/' . $job['id']], 202);
    }

    if ($method === 'POST' && $path === '/jobs/router-backup') {
        ApiAuthorization::requirePermission($actor, 'routers');
        $input = apiBody();
        $nasId = (int)($input['nas_id'] ?? 0);
        if ($nasId < 1) throw new InvalidArgumentException('NAS_ID_REQUIRED');
        $authorizationContext->assertCanAccessRouter($nasId);
        $job = $jobs->create((int)$actor['admin_id'], 'router_backup', [
            'network_id' => $authorizationContext->activeNetworkId(),
            'nas_id' => $nasId,
            'backup_name' => (string)($input['backup_name'] ?? ''),
        ]);
        ApiResponse::ok($job, ['poll_url' => '/api/v1/jobs/' . $job['id']], 202);
    }

    if ($method === 'GET' && $path === '/jobs') {
        [$page, $perPage] = apiPage();
        [$rows, $total] = $jobs->list(
            (int)$actor['admin_id'],
            $authorizationContext->activeNetworkId(),
            $page,
            $perPage,
            in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)
        );
        ApiResponse::ok($rows, apiPagination($page, $perPage, $total));
    }

    if ($method === 'GET' && preg_match('#^/jobs/([a-f0-9-]+)$#', $path, $m)) {
        ApiResponse::ok($jobs->get(
            $m[1],
            (int)$actor['admin_id'],
            $authorizationContext->activeNetworkId(),
            in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)
        ));
    }

    if ($method === 'GET' && preg_match('#^/exports/([a-f0-9-]+)/download$#', $path, $m)) {
        $job = $jobs->get(
            $m[1],
            (int)$actor['admin_id'],
            $authorizationContext->activeNetworkId(),
            in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)
        );
        if ($job['status'] !== 'completed' || empty($job['result']['file'])) throw new DomainException('EXPORT_NOT_READY');
        $base = realpath('/var/lib/mikrotik-usermanager/exports');
        $file = realpath((string)$job['result']['file']);
        if (!$base || !$file || !str_starts_with($file, $base . DIRECTORY_SEPARATOR) || !is_file($file)) throw new DomainException('FILE_NOT_FOUND');
        $mime = mime_content_type($file) ?: 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, no-store');
        readfile($file);
        exit;
    }

    if ($method === 'POST' && $path === '/uploads/images') {
        ApiAuthorization::requirePermission($actor, 'ui_customizer');
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) throw new InvalidArgumentException('UPLOAD_REQUIRED');
        $file = $_FILES['file'];
        if ((int)$file['size'] > 5 * 1024 * 1024) throw new InvalidArgumentException('FILE_TOO_LARGE');
        $raw = file_get_contents($file['tmp_name']);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($raw);
        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        if (!isset($allowed[$mime]) || !getimagesizefromstring($raw)) throw new InvalidArgumentException('INVALID_IMAGE');
        $dimensions=getimagesizefromstring($raw);if($dimensions[0]>8192||$dimensions[1]>8192||$dimensions[0]*$dimensions[1]>16000000)throw new InvalidArgumentException('IMAGE_DIMENSIONS_TOO_LARGE');
        $image = imagecreatefromstring($raw);
        if (!$image) throw new InvalidArgumentException('INVALID_IMAGE');
        $sourceW = imagesx($image); $sourceH = imagesy($image);
        $requestedW = (int)($_POST['width'] ?? 775); $requestedH = (int)($_POST['height'] ?? 409);
        $maxW = max(1, min(4096, $requestedW)); $maxH = max(1, min(4096, $requestedH));
        $scale = min(1.0, $maxW / max(1, $sourceW), $maxH / max(1, $sourceH));
        $targetW = max(1, (int)round($sourceW * $scale)); $targetH = max(1, (int)round($sourceH * $scale));
        if ($targetW !== $sourceW || $targetH !== $sourceH) {
            $resized = imagecreatetruecolor($targetW, $targetH);
            if ($mime === 'image/png' || $mime === 'image/webp') { imagealphablending($resized, false); imagesavealpha($resized, true); $transparent = imagecolorallocatealpha($resized, 0, 0, 0, 127); imagefilledrectangle($resized, 0, 0, $targetW, $targetH, $transparent); }
            imagecopyresampled($resized, $image, 0, 0, 0, 0, $targetW, $targetH, $sourceW, $sourceH);
            imagedestroy($image); $image = $resized;
        }
        $id = bin2hex(random_bytes(16));
        $category = mb_substr((string)($_POST['category'] ?? 'general'), 0, 50);
        $networkId = $authorizationContext->activeNetworkId(); $adminId = (int)$actor['admin_id'];
        $dir = '/var/lib/mikrotik-usermanager/uploads/' . date('Y/m');
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException('UPLOAD_DIRECTORY_FAILED');
        $stored = "$dir/$id." . $allowed[$mime];
        $saved = $mime === 'image/jpeg' ? imagejpeg($image, $stored, 90) : ($mime === 'image/png' ? imagepng($image, $stored, 6) : imagewebp($image, $stored, 90));
        imagedestroy($image);
        if (!$saved) throw new RuntimeException('UPLOAD_SAVE_FAILED');
        chmod($stored, 0640);
        $oldStmt = $db->prepare('SELECT id,stored_path FROM um_api_uploads WHERE network_id=? AND admin_id=? AND category=? AND id=? FOR UPDATE');
        $db->beginTransaction();
        try {
            $replaceId=$_POST['replace_id']??'';if(!is_string($replaceId)||($replaceId!==''&&!preg_match('/^[a-f0-9]{32}$/',$replaceId)))throw new InvalidArgumentException('INVALID_REPLACE_ID');$oldStmt->execute([$networkId, $adminId, $category,$replaceId]); $oldRows = $oldStmt->fetchAll(PDO::FETCH_ASSOC);
            $stmt = $db->prepare('INSERT INTO um_api_uploads (id,network_id,admin_id,category,original_name,stored_path,mime_type,file_size,sha256) VALUES (?,?,?,?,?,?,?,?,?)');
            $stmt->execute([$id, $networkId, $adminId, $category, mb_substr(basename((string)$file['name']), 0, 255), $stored, $mime, filesize($stored), hash_file('sha256', $stored)]);
            $db->prepare('DELETE FROM um_api_uploads WHERE network_id=? AND admin_id=? AND category=? AND id=?')->execute([$networkId, $adminId, $category, $replaceId]);
            $db->commit();
        } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); @unlink($stored); throw $e; }
        foreach ($oldRows ?? [] as $old) { $oldPath = (string)($old['stored_path'] ?? ''); if ($oldPath !== $stored && str_starts_with($oldPath, '/var/lib/mikrotik-usermanager/uploads/') && is_file($oldPath)) @unlink($oldPath); }
        ApiResponse::ok(['id' => $id, 'mime_type' => $mime, 'size' => filesize($stored), 'width' => $targetW, 'height' => $targetH, 'replaced' => count($oldRows ?? []), 'url' => '/api/v1/uploads/' . $id], [], 201);
    }

    if ($method === 'GET' && preg_match('#^/uploads/([a-f0-9]{32})$#', $path, $m)) {
        $stmt = $db->prepare('SELECT * FROM um_api_uploads WHERE id=? AND network_id=? LIMIT 1');
        $stmt->execute([$m[1], $authorizationContext->activeNetworkId()]);
        $upload = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$upload) throw new DomainException('FILE_NOT_FOUND');
        if ((int)$upload['admin_id'] !== (int)$actor['admin_id'] && !in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)) throw new DomainException('FORBIDDEN');
        $base = realpath('/var/lib/mikrotik-usermanager/uploads');
        $file = realpath((string)$upload['stored_path']);
        if (!$base || !$file || !str_starts_with($file, $base . DIRECTORY_SEPARATOR)) throw new DomainException('FILE_NOT_FOUND');
        header('Content-Type: ' . $upload['mime_type']);
        header('Content-Length: ' . filesize($file));
        header('Content-Disposition: inline; filename="' . basename((string)$upload['original_name']) . '"');
        readfile($file);
        exit;
    }

    // Multi-Currency & Exchange Rates Routes
    if ($method === 'GET' && $path === '/currencies') {
        $finService = $service->getFinancialAccountingService();
        ApiResponse::ok($finService->getExchangeRates());
    }

    if ($method === 'POST' && $path === '/currencies') {
        ApiAuthorization::requirePermission($actor, 'finance_settings');
        $finService = $service->getFinancialAccountingService();
        ApiResponse::ok($finService->saveExchangeRate(apiBody()));
    }

    if ($method === 'POST' && $path === '/currencies/convert') {
        $input = apiBody();
        $amount = (float)($input['amount'] ?? 0);
        $from = (string)($input['from'] ?? 'YER_SANAA');
        $to = (string)($input['to'] ?? 'YER_SANAA');
        $finService = $service->getFinancialAccountingService();
        ApiResponse::ok($finService->convertCurrency($amount, $from, $to));
    }

    // FCM Push Notification Routes
    if ($method === 'POST' && $path === '/fcm/register') {
        $input = apiBody();
        $token = (string)($input['fcm_token'] ?? ($input['token'] ?? ''));
        if (empty($token)) throw new InvalidArgumentException('FCM_TOKEN_REQUIRED');
        $deviceName = (string)($input['device_name'] ?? 'Android Device');
        $platform = (string)($input['platform'] ?? 'android');
        $appVersion = (string)($input['app_version'] ?? '1.0');
        
        $firebase = $service->getFirebaseService();
        $res = $firebase->registerToken((int)$actor['admin_id'], $token, $deviceName, $platform, $appVersion);
        ApiResponse::ok($res, [], 201);
    }

    if ($method === 'POST' && $path === '/fcm/unregister') {
        $input = apiBody();
        $token = (string)($input['fcm_token'] ?? ($input['token'] ?? ''));
        if (empty($token)) throw new InvalidArgumentException('FCM_TOKEN_REQUIRED');
        
        $firebase = $service->getFirebaseService();
        $res = $firebase->unregisterToken($token);
        ApiResponse::ok($res);
    }

    if ($method === 'GET' && $path === '/fcm/devices') {
        $firebase = $service->getFirebaseService();
        $isSuper = in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true);
        $devices = $firebase->getDevicesList($isSuper ? null : (int)$actor['admin_id']);
        ApiResponse::ok($devices);
    }

    if ($method === 'POST' && $path === '/fcm/test') {
        $input = apiBody();
        $firebase = $service->getFirebaseService();
        $title = (string)($input['title'] ?? '🔔 تنبيه اختباري من SAM');
        $body = (string)($input['body'] ?? 'تم التحقق من استقبال الإشعارات الفورية بنجاح على هذا الجهاز 🌐');
        $targetToken = (string)($input['fcm_token'] ?? '');
        
        if (!empty($targetToken)) {
            $res = $firebase->sendSinglePush($targetToken, $title, $body, ['event_type' => 'test_alert', 'click_action' => 'OPEN_NOTIFICATIONS']);
        } else {
            $res = $firebase->sendToAdmin((int)$actor['admin_id'], $title, $body, ['event_type' => 'test_alert', 'click_action' => 'OPEN_NOTIFICATIONS'], 'test_alert', 'test_' . time(), (int)$actor['admin_id']);
        }
        ApiResponse::ok($res);
    }

    if ($method === 'GET' && $path === '/events') {
        $afterId = max(0, (int)($_GET['after_id'] ?? 0));
        $timeout = max(0, min(20, (int)($_GET['timeout'] ?? 0)));
        $deadline = time() + $timeout;
        do {
            $stmt = $db->prepare('SELECT id,category,title,message,created_at FROM um_notifications WHERE network_id=? AND id>? AND (target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL) ORDER BY id ASC LIMIT 100');
            $stmt->execute([$authorizationContext->activeNetworkId(), $afterId, (int)$actor['admin_id'], (string)$actor['role']]);
            $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if ($events || time() >= $deadline) break;
            usleep(500000);
        } while (true);
        ApiResponse::ok($events, ['next_after_id' => $events ? (int)end($events)['id'] : $afterId]);
    }

    ApiResponse::error('NOT_FOUND', 'المسار المطلوب غير موجود', 404);
} catch (DomainException $e) {
    $map = [
        'INVALID_CREDENTIALS' => [401, 'اسم المستخدم أو كلمة المرور غير صحيحة'],
        'RATE_LIMITED' => [429, 'محاولات دخول كثيرة؛ حاول لاحقًا'],
        'TOKEN_MISSING' => [401, 'Access Token مطلوب'], 'TOKEN_INVALID' => [401, 'Access Token غير صالح أو منتهي'],
        'REFRESH_TOKEN_INVALID' => [401, 'Refresh Token غير صالح أو منتهي'], 'FORBIDDEN' => [403, 'لا تملك صلاحية تنفيذ هذه العملية'],
        'FORBIDDEN_SCOPE' => [403, 'المورد المطلوب خارج نطاقك في الشبكة النشطة'],
        'FORBIDDEN_NETWORK' => [403, 'لا تملك صلاحية الدخول إلى هذه الشبكة'],
        'FORBIDDEN_IMPORT_OWNER'=>[403,'المعاينة تابعة لمستخدم آخر'],
        'NETWORK_CONTEXT_REQUIRED' => [403, 'يجب اختيار شبكة نشطة مسموح بها'],
        'USER_NOT_FOUND' => [404, 'المستخدم غير موجود'], 'JOB_NOT_FOUND' => [404, 'المهمة غير موجودة'],
        'EXPORT_NOT_READY' => [409, 'ملف التصدير غير جاهز'], 'FILE_NOT_FOUND' => [404, 'الملف غير موجود'],
    ];
    [$status, $message] = $map[$e->getMessage()] ?? [400, $e->getMessage()];
    ApiResponse::error($e->getMessage(), $message, $status);
} catch (InvalidArgumentException $e) {
    ApiResponse::error($e->getMessage(), 'بيانات الطلب غير صحيحة أو ناقصة', 422);
} catch (RuntimeException $e) {
    $known=[
        'انتهت صلاحية المعاينة؛ أعد المحاولة مجدداً'=>['PREVIEW_EXPIRED',410],
        'ملف المعاينة غير متاح'=>['PREVIEW_UNAVAILABLE',410],
        'رمز المعاينة غير صالح'=>['INVALID_PREVIEW',422],
        'تغير نمط دخول الشبكة منذ المعاينة؛ أعد المعاينة قبل الاعتماد'=>['NETWORK_MODE_CHANGED',409],
    ];
    if(isset($known[$e->getMessage()])) {[$code,$status]=$known[$e->getMessage()];ApiResponse::error($code,$e->getMessage(),$status);}
    error_log('API v1 [' . ApiResponse::$requestId . '] ' . $e->getMessage());
    ApiResponse::error('INTERNAL_ERROR','حدث خطأ داخلي غير متوقع',500);
} catch (Throwable $e) {
    error_log('API v1 [' . ApiResponse::$requestId . '] ' . $e->getMessage());
    ApiResponse::error('INTERNAL_ERROR', 'حدث خطأ داخلي غير متوقع', 500);
}
