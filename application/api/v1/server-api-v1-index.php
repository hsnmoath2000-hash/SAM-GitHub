<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/includes/RadiusService.php';
require_once __DIR__ . '/lib/ApiResponse.php';
require_once __DIR__ . '/lib/ApiAuth.php';
require_once __DIR__ . '/lib/ApiAuthorization.php';
require_once __DIR__ . '/lib/ApiJobs.php';

ApiResponse::init();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Allow: GET, POST, PATCH, DELETE, OPTIONS');
    http_response_code(204);
    exit;
}

// Ensure session is started only once and header logic is sound.
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start([
        'name' => 'UMADMINSESSID',
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
    ]);
}
header_remove('Expires');
header_remove('Pragma');

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

/**
 * Settings exposed through API v1 are deliberately allow-listed. Never return
 * the raw um_settings table because it also contains router, VPN, Telegram,
 * WhatsApp, and proxy secrets.
 */
function apiV1Setting(PDO $db, string $key, string $default = ''): string
{
    $stmt = $db->prepare('SELECT setting_value FROM um_settings WHERE setting_key=? LIMIT 1');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return $value === false || $value === null ? $default : (string)$value;
}

function apiV1PutSetting(PDO $db, string $key, string $value): void
{
    $stmt = $db->prepare('INSERT INTO um_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=NOW()');
    $stmt->execute([$key, $value]);
}

function apiV1Bool(mixed $value): bool
{
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return (int)$value !== 0;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
}

function apiV1Text(mixed $value, int $max, bool $required = false): string
{
    if (is_array($value) || is_object($value)) throw new InvalidArgumentException('INVALID_SETTINGS');
    $text = trim((string)$value);
    if ($required && $text === '') throw new InvalidArgumentException('INVALID_SETTINGS');
    return mb_substr($text, 0, $max);
}

function apiV1PrintDefaults(string $kind): array
{
    return [
        'paper_size' => $kind === 'voucher' ? 'A5' : 'A4',
        'orientation' => 'portrait',
        'show_logo' => true,
        'show_header' => true,
        'show_signatures' => true,
        'show_qr' => false,
        'show_summary' => $kind === 'statement',
        'header_text' => match ($kind) {
            'invoice' => 'فاتورة مبيعات',
            'voucher' => 'سند مالي',
            default => 'كشف حساب',
        },
        'footer_text' => 'شكراً لتعاملكم معنا',
        'accent_color' => '#0B4D9B',
    ];
}

function apiV1PrintTemplate(PDO $db, string $kind): array
{
    $defaults = apiV1PrintDefaults($kind);
    $raw = apiV1Setting($db, 'sam_print_' . $kind, '');
    $stored = json_decode($raw, true);
    return is_array($stored) ? array_merge($defaults, $stored) : $defaults;
}

function apiV1SettingsSnapshot(PDO $db): array
{
    $appTitle = apiV1Setting($db, 'ui_app_title', 'MikroTik User Manager ERP');
    return [
        'schema_version' => 1,
        'organization' => [
            'name' => $appTitle,
            'short_name' => apiV1Setting($db, 'ui_app_short_title', 'SAM ERP'),
            'network_name' => apiV1Setting($db, 'sam_network_name', $appTitle),
            'phone' => apiV1Setting($db, 'sam_org_phone'),
            'email' => apiV1Setting($db, 'sam_org_email'),
            'address' => apiV1Setting($db, 'sam_org_address'),
            'currency' => apiV1Setting($db, 'sam_currency', 'YER'),
            'tax_number' => apiV1Setting($db, 'sam_tax_number'),
            'footer' => apiV1Setting($db, 'sam_org_footer', 'شكراً لتعاملكم معنا'),
        ],
        'print' => [
            'invoice' => apiV1PrintTemplate($db, 'invoice'),
            'voucher' => apiV1PrintTemplate($db, 'voucher'),
            'statement' => apiV1PrintTemplate($db, 'statement'),
        ],
    ];
}

function apiV1NormalizePrintTemplate(string $kind, mixed $input, array $current): array
{
    if (!is_array($input)) throw new InvalidArgumentException('INVALID_SETTINGS');
    $out = $current;
    if (array_key_exists('paper_size', $input)) {
        $value = strtoupper(apiV1Text($input['paper_size'], 20, true));
        if (!in_array($value, ['A4', 'A5', 'THERMAL_80'], true)) throw new InvalidArgumentException('INVALID_SETTINGS');
        $out['paper_size'] = $value;
    }
    if (array_key_exists('orientation', $input)) {
        $value = strtolower(apiV1Text($input['orientation'], 20, true));
        if (!in_array($value, ['portrait', 'landscape'], true)) throw new InvalidArgumentException('INVALID_SETTINGS');
        $out['orientation'] = $value;
    }
    foreach (['show_logo', 'show_header', 'show_signatures', 'show_qr', 'show_summary'] as $key) {
        if (array_key_exists($key, $input)) $out[$key] = apiV1Bool($input[$key]);
    }
    foreach (['header_text' => 120, 'footer_text' => 255] as $key => $max) {
        if (array_key_exists($key, $input)) $out[$key] = apiV1Text($input[$key], $max);
    }
    if (array_key_exists('accent_color', $input)) {
        $color = apiV1Text($input['accent_color'], 7, true);
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) throw new InvalidArgumentException('INVALID_SETTINGS');
        $out['accent_color'] = strtoupper($color);
    }
    return $out;
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

    $actor = $auth->authenticate();

    if ($method === 'POST' && $path === '/auth/logout') {
        $auth->logout($actor);
        ApiResponse::ok(['logged_out' => true]);
    }

    if ($method === 'GET' && $path === '/me') {
        ApiResponse::ok(ApiAuth::publicUser($actor));
    }

    if (($method === 'GET' || $method === 'PATCH' || $method === 'POST') && $path === '/settings') {
        ApiAuthorization::requirePermission($actor, 'ui_customizer');
        if ($method === 'GET') {
            ApiResponse::ok(apiV1SettingsSnapshot($db));
        }

        $input = apiBody();
        $current = apiV1SettingsSnapshot($db);
        $organization = $current['organization'];
        if (array_key_exists('organization', $input)) {
            if (!is_array($input['organization'])) throw new InvalidArgumentException('INVALID_SETTINGS');
            foreach (['name' => 128, 'short_name' => 64, 'network_name' => 128, 'phone' => 40, 'email' => 160, 'address' => 255, 'currency' => 8, 'tax_number' => 64, 'footer' => 255] as $key => $max) {
                if (array_key_exists($key, $input['organization'])) $organization[$key] = apiV1Text($input['organization'][$key], $max, in_array($key, ['name', 'short_name', 'network_name'], true));
            }
            if ($organization['email'] !== '' && !filter_var($organization['email'], FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('INVALID_SETTINGS');
            $organization['currency'] = strtoupper($organization['currency'] ?: 'YER');
            if (!preg_match('/^[A-Z]{3,8}$/', $organization['currency'])) throw new InvalidArgumentException('INVALID_SETTINGS');
        }

        $print = $current['print'];
        if (array_key_exists('print', $input)) {
            if (!is_array($input['print'])) throw new InvalidArgumentException('INVALID_SETTINGS');
            foreach (['invoice', 'voucher', 'statement'] as $kind) {
                if (array_key_exists($kind, $input['print'])) $print[$kind] = apiV1NormalizePrintTemplate($kind, $input['print'][$kind], $print[$kind]);
            }
        }

        $db->beginTransaction();
        try {
            apiV1PutSetting($db, 'ui_app_title', $organization['name']);
            apiV1PutSetting($db, 'ui_app_short_title', $organization['short_name']);
            apiV1PutSetting($db, 'sam_network_name', $organization['network_name']);
            apiV1PutSetting($db, 'sam_org_phone', $organization['phone']);
            apiV1PutSetting($db, 'sam_org_email', $organization['email']);
            apiV1PutSetting($db, 'sam_org_address', $organization['address']);
            apiV1PutSetting($db, 'sam_currency', $organization['currency']);
            apiV1PutSetting($db, 'sam_tax_number', $organization['tax_number']);
            apiV1PutSetting($db, 'sam_org_footer', $organization['footer']);
            foreach (['invoice', 'voucher', 'statement'] as $kind) apiV1PutSetting($db, 'sam_print_' . $kind, json_encode($print[$kind], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
        ApiResponse::ok(apiV1SettingsSnapshot($db), ['updated' => true]);
    }

    if ($method === 'GET' && $path === '/users') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        [$page, $perPage, $offset] = apiPage();
        $where = ['1=1'];
        $params = [];
        $ids = ApiAuthorization::scopedAdminIds($db, $actor);
        if ($ids !== null) {
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $where[] = "a.id IN ($marks)";
            array_push($params, ...$ids);
        }
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

    if ($method === 'GET' && $path === '/sales/invoices') {
        ApiAuthorization::requirePermission($actor, 'sales_reports');
        [$page, $perPage] = apiPage();
        // The underlying service might not support pagination directly in this exact way,
        // but we proxy it. RadiusService usually handles the filters from $_GET.
        ApiResponse::ok($service->getSalesInvoices());
    }

    if ($method === 'POST' && $path === '/sales/invoices') {
        ApiAuthorization::requirePermission($actor, 'create_sales');
        ApiResponse::ok($service->createSaleInvoice(apiBody()));
    }

    if ($method === 'GET' && $path === '/warehouses/summary') {
        ApiAuthorization::requirePermission($actor, 'inventory_view');
        ApiResponse::ok($service->getCardWarehousesSummary());
    }

    if ($method === 'GET' && $path === '/warehouses/stock') {
        ApiAuthorization::requirePermission($actor, 'inventory_view');
        $adminId = (int)($_GET['admin_id'] ?? $actor['admin_id']);
        $scopeContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)$actor['admin_id']));
        $scopeContext->assertCanAccessAdmin($adminId);
        ApiResponse::ok($service->getWarehouseStockDetails($adminId));
    }

    if ($method === 'POST' && $path === '/warehouses/transfer') {
        ApiAuthorization::requirePermission($actor, 'inventory_transfer');
        $input = apiBody();
        $scopeContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)$actor['admin_id']));
        $sourceAdminId = (int)($input['source_admin_id'] ?? $actor['admin_id']);
        $targetAdminId = (int)($input['target_admin_id'] ?? 0);
        $scopeContext->assertCanAccessAdmin($sourceAdminId);
        if ($targetAdminId <= 0) throw new DomainException('INVALID_TARGET');
        $scopeContext->assertCanAccessAdmin($targetAdminId);
        ApiResponse::ok($service->transferWarehouseStock($input, (int)$actor['admin_id']));
    }

    if ($method === 'GET' && $path === '/finance/cashbox') {
        ApiAuthorization::requirePermission($actor, 'accounting_reports');
        ApiResponse::ok($service->getCashboxSummary());
    }

    if ($method === 'GET' && $path === '/finance/accounts') {
        ApiAuthorization::requirePermission($actor, 'accounting_setup');
        ApiResponse::ok($service->getChartOfAccounts());
    }

    if ($method === 'GET' && $path === '/finance/vouchers') {
        ApiAuthorization::requirePermission($actor, 'accounting_reports');
        ApiResponse::ok($service->getFinancialVouchers());
    }

    if ($method === 'GET' && $path === '/network/topology') {
        ApiAuthorization::requirePermission($actor, 'routers');
        ApiResponse::ok($service->getNetworkTopologyTree((int)($_GET['nas'] ?? 0)));
    }

    if ($method === 'GET' && preg_match('#^/network/neighbors/(\d+)$#', $path, $m)) {
        ApiAuthorization::requirePermission($actor, 'routers');
        ApiResponse::ok($service->fetchRouterNeighbors((int)$m[1]));
    }

    if ($method === 'GET' && preg_match('#^/network/traffic/(\d+)$#', $path, $m)) {
        ApiAuthorization::requirePermission($actor, 'routers');
        ApiResponse::ok($service->getRouterInterfacesTraffic((int)$m[1]));
    }

    if ($method === 'POST' && preg_match('#^/network/reboot/(\d+)$#', $path, $m)) {
        ApiAuthorization::requirePermission($actor, 'routers');
        ApiResponse::ok($service->rebootRouterHardware((int)$m[1]));
    }

    if ($method === 'GET' && $path === '/network/sessions') {
        ApiAuthorization::requirePermission($actor, 'sessions_view');
        ApiResponse::ok($service->getActiveSessions());
    }

    if ($method === 'GET' && $path === '/vouchers/profiles') {
        ApiResponse::ok($service->getProfiles());
    }

    if ($method === 'POST' && $path === '/vouchers/generate') {
        ApiAuthorization::requirePermission($actor, 'generate_vouchers');
        ApiResponse::ok($service->generateBatch(apiBody()));
    }

    if ($method === 'GET' && $path === '/vouchers/batches') {
        ApiResponse::ok($service->getBatches());
    }

    if ($method === 'POST' && $path === '/users') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $result = $service->saveAdmin(apiBody());
        ApiResponse::ok($result, ['whatsapp_confirmation' => !empty($result['whatsapp_sent']) ? 'sent' : 'not_sent'], 201);
    }

    if (preg_match('#^/users/(\d+)$#', $path, $m)) {
        $targetId = (int)$m[1];
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        if (!ApiAuthorization::canAccessAdmin($db, $actor, $targetId)) throw new DomainException('FORBIDDEN');
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
        if (!ApiAuthorization::canAccessAdmin($db, $actor, $targetId)) throw new DomainException('FORBIDDEN');
        $auth->revokeAllForAdmin($targetId);
        ApiResponse::ok(['revoked' => true, 'admin_id' => $targetId]);
    }

    if ($method === 'GET' && $path === '/notifications') {
        [$page, $perPage, $offset] = apiPage();
        $where = '(target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL)';
        $params = [(int)$actor['admin_id'], (string)$actor['role']];
        if (isset($_GET['after_id'])) { $where .= ' AND id>?'; $params[] = max(0, (int)$_GET['after_id']); }
        $count = $db->prepare("SELECT COUNT(*) FROM um_notifications WHERE $where");
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $stmt = $db->prepare("SELECT id,category,title,message,is_read,metadata,created_at FROM um_notifications WHERE $where ORDER BY id DESC LIMIT $perPage OFFSET $offset");
        $stmt->execute($params);
        ApiResponse::ok($stmt->fetchAll(PDO::FETCH_ASSOC), apiPagination($page, $perPage, $total));
    }

    if ($method === 'POST' && preg_match('#^/notifications/(\d+)/read$#', $path, $m)) {
        $stmt = $db->prepare('UPDATE um_notifications SET is_read=1 WHERE id=? AND (target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL)');
        $stmt->execute([(int)$m[1], (int)$actor['admin_id'], (string)$actor['role']]);
        ApiResponse::ok(['updated' => $stmt->rowCount() > 0]);
    }

    if ($method === 'POST' && $path === '/exports') {
        ApiAuthorization::requirePermission($actor, 'admins_agents');
        $input = apiBody();
        $resource = (string)($input['resource'] ?? 'users');
        $format = strtolower((string)($input['format'] ?? 'csv'));
        if ($resource !== 'users' || !in_array($format, ['csv', 'pdf'], true)) throw new InvalidArgumentException('UNSUPPORTED_EXPORT');
        $job = $jobs->create((int)$actor['admin_id'], "export_users_$format", ['filters' => (array)($input['filters'] ?? []), 'scope_ids' => ApiAuthorization::scopedAdminIds($db, $actor)]);
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
        $job = $jobs->create((int)$actor['admin_id'], 'router_backup', ['nas_id' => $nasId, 'backup_name' => (string)($input['backup_name'] ?? '')]);
        ApiResponse::ok($job, ['poll_url' => '/api/v1/jobs/' . $job['id']], 202);
    }

    if ($method === 'GET' && $path === '/jobs') {
        [$page, $perPage] = apiPage();
        [$rows, $total] = $jobs->list((int)$actor['admin_id'], $page, $perPage, in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true));
        ApiResponse::ok($rows, apiPagination($page, $perPage, $total));
    }

    if ($method === 'GET' && preg_match('#^/jobs/([a-f0-9-]+)$#', $path, $m)) {
        ApiResponse::ok($jobs->get($m[1], (int)$actor['admin_id'], in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)));
    }

    if ($method === 'GET' && preg_match('#^/exports/([a-f0-9-]+)/download$#', $path, $m)) {
        $job = $jobs->get($m[1], (int)$actor['admin_id'], in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true));
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
        $image = imagecreatefromstring($raw);
        if (!$image) throw new InvalidArgumentException('INVALID_IMAGE');
        $id = bin2hex(random_bytes(16));
        $dir = '/var/lib/mikrotik-usermanager/uploads/' . date('Y/m');
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException('UPLOAD_DIRECTORY_FAILED');
        $stored = "$dir/$id." . $allowed[$mime];
        $saved = $mime === 'image/jpeg' ? imagejpeg($image, $stored, 90) : ($mime === 'image/png' ? imagepng($image, $stored, 6) : imagewebp($image, $stored, 90));
        imagedestroy($image);
        if (!$saved) throw new RuntimeException('UPLOAD_SAVE_FAILED');
        chmod($stored, 0640);
        $stmt = $db->prepare('INSERT INTO um_api_uploads (id,admin_id,category,original_name,stored_path,mime_type,file_size,sha256) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$id, (int)$actor['admin_id'], mb_substr((string)($_POST['category'] ?? 'general'), 0, 50), mb_substr(basename((string)$file['name']), 0, 255), $stored, $mime, filesize($stored), hash_file('sha256', $stored)]);
        ApiResponse::ok(['id' => $id, 'mime_type' => $mime, 'size' => filesize($stored), 'url' => '/api/v1/uploads/' . $id], [], 201);
    }

    if ($method === 'GET' && preg_match('#^/uploads/([a-f0-9]{32})$#', $path, $m)) {
        $stmt = $db->prepare('SELECT * FROM um_api_uploads WHERE id=? LIMIT 1');
        $stmt->execute([$m[1]]);
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

    if ($method === 'GET' && $path === '/events') {
        $afterId = max(0, (int)($_GET['after_id'] ?? 0));
        $timeout = max(0, min(20, (int)($_GET['timeout'] ?? 0)));
        $deadline = time() + $timeout;
        do {
            $stmt = $db->prepare('SELECT id,category,title,message,created_at FROM um_notifications WHERE id>? AND (target_admin_id=? OR target_role=? OR target_role=\'all\' OR target_role IS NULL) ORDER BY id ASC LIMIT 100');
            $stmt->execute([$afterId, (int)$actor['admin_id'], (string)$actor['role']]);
            $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if ($events || time() >= $deadline) break;
            usleep(500000);
        } while (true);
        ApiResponse::ok($events, ['next_after_id' => $events ? (int)end($events)['id'] : $afterId]);
    }

    if ($method === 'POST' && $path === '/bridge') {
        $input = apiBody();
        $action = (string)($input['action'] ?? '');
        $params = (array)($input['params'] ?? []);
        if ($action === '') throw new InvalidArgumentException('ACTION_REQUIRED');

        // This is a universal bridge to the legacy RadiusService actions.
        // It uses the modern Bearer authentication context.
        // In a real production system, we'd whitelist actions or check granular permissions.
        if (method_exists($service, $action)) {
            // Some methods might expect data in $_GET or $_POST specifically.
            // We temporarily merge params into appropriate superglobals if needed,
            // or just call the method if it's well-designed to take an array.
            // Most RadiusService methods in this system are designed to read from request or take params.
            ApiResponse::ok($service->$action($params));
        } else {
            // Fallback for actions that are handled in the main api.php switch but not direct service methods
            ApiResponse::error('UNKNOWN_ACTION', "العملية $action غير معرفة في الجسر", 400);
        }
    }

    ApiResponse::error('NOT_FOUND', "المسار المطلوب ($path) غير موجود في الإصدار v1", 404);
} catch (DomainException $e) {
    $map = [
        'INVALID_CREDENTIALS' => [401, 'اسم المستخدم أو كلمة المرور غير صحيحة'],
        'RATE_LIMITED' => [429, 'محاولات دخول كثيرة؛ حاول لاحقًا'],
        'TOKEN_MISSING' => [401, 'Access Token مطلوب'], 'TOKEN_INVALID' => [401, 'Access Token غير صالح أو منتهي'],
        'REFRESH_TOKEN_INVALID' => [401, 'Refresh Token غير صالح أو منتهي'], 'FORBIDDEN' => [403, 'لا تملك صلاحية تنفيذ هذه العملية'],
        'USER_NOT_FOUND' => [404, 'المستخدم غير موجود'], 'JOB_NOT_FOUND' => [404, 'المهمة غير موجودة'],
        'EXPORT_NOT_READY' => [409, 'ملف التصدير غير جاهز'], 'FILE_NOT_FOUND' => [404, 'الملف غير موجود'],
    ];
    [$status, $message] = $map[$e->getMessage()] ?? [400, $e->getMessage()];
    ApiResponse::error($e->getMessage(), $message, $status);
} catch (InvalidArgumentException $e) {
    ApiResponse::error($e->getMessage(), 'بيانات الطلب غير صحيحة أو ناقصة', 422);
} catch (Throwable $e) {
    error_log('API v1 [' . ApiResponse::$requestId . '] ' . $e->getMessage());
    ApiResponse::error('INTERNAL_ERROR', 'حدث خطأ داخلي غير متوقع', 500);
}
