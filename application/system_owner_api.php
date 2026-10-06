<?php
// Include-only API module; requests must pass through api.php authentication.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

// Owner-only system administration API. Included after requireAuth().

function samOwnerSetting(PDO $db, string $key, string $default=''): string {
    $q=$db->prepare('SELECT setting_value FROM um_settings WHERE setting_key=?'); $q->execute([$key]);
    $v=$q->fetchColumn(); return $v===false?$default:(string)$v;
}

function samOwnerSet(PDO $db, string $key, string $value): void {
    $q=$db->prepare('INSERT INTO um_settings(setting_key,setting_value,updated_at) VALUES(?,?,NOW()) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()');
    $q->execute([$key,$value]);
}

function samOwnerLogActivity(PDO $db, mixed $service, string $actionType, string $category, string $title, string $details, string $status, int $adminId): void {
    if (isset($service) && is_object($service) && method_exists($service, 'logActivity')) {
        $service->logActivity($actionType, $category, $title, $details, $status, $adminId);
        return;
    }
    try {
        $stmt = $db->prepare("INSERT INTO um_activity_logs (admin_id, admin_name, action_type, action_category, action_title, details, status, created_at) VALUES (?, 'مالك النظام', ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$adminId, $actionType, $category, $title, $details, $status]);
    } catch (Throwable $e) {
        error_log('Activity log failed: ' . $e->getMessage());
    }
}

function samOwnerServices(): array {
    $map = [
        'apache2' => 'خادم الويب (Apache)',
        ('php'.PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION.'-fpm') => 'معالج بي إتش بي (PHP-FPM)',
        'mariadb' => 'قاعدة البيانات (MariaDB)',
        'redis-server' => 'خادم الذاكرة السريعة (Redis)',
        'freeradius' => 'خدمة المصادقة (FreeRADIUS)',
        'accel-ppp' => 'خادم نفق الراوترات (SSTP)',
        'sam-telemetry' => 'خدمة البث اللحظي (Telemetry)',
        'sam-whatsapp' => 'خدمة الواتساب (Baileys)',
        'mikrotik-usermanager-api-worker' => 'عامل المزامنة والمهام (Worker)',
        'cron' => 'خدمة الجدولة التلقائية (Cron)'
    ];
    $out = [];
    foreach ($map as $unit => $label) {
        $state = trim((string)shell_exec('/bin/systemctl is-active ' . escapeshellarg($unit) . ' 2>/dev/null'));
        $uptime = trim((string)shell_exec('/bin/systemctl show ' . escapeshellarg($unit) . ' --property=ActiveEnterTimestamp --value 2>/dev/null'));
        $mem = trim((string)shell_exec('/bin/systemctl show ' . escapeshellarg($unit) . ' --property=MemoryCurrent --value 2>/dev/null'));
        $out[] = [
            'installed' => trim((string)shell_exec('/bin/systemctl show '.escapeshellarg($unit).' --property=LoadState --value 2>/dev/null'))==='loaded',
            'installer_available'=>is_file('/usr/local/libexec/sam-service-manager.py'),
            'unit' => $unit,
            'label' => $label,
            'state' => $state ?: 'unknown',
            'started_at' => $uptime ?: '-',
            'memory_bytes' => (is_numeric($mem) && (int)$mem > 0) ? (int)$mem : 0
        ];
    }
    return $out;
}

function samOwnerDefaultsFile(): string {
    $f = tempnam(sys_get_temp_dir(), 'sam_factory_db_');
    if ($f === false) throw new Exception('تعذر إنشاء ملف اتصال قاعدة البيانات');
    $v = "[client]\nhost=" . DB_HOST . "\nport=" . DB_PORT . "\nuser=" . DB_USER . "\npassword=" . str_replace(["\\", "\n", "\r"], ["\\\\", '', ''], DB_PASS) . "\n";
    file_put_contents($f, $v, LOCK_EX);
    chmod($f, 0600);
    return $f;
}

function samOwnerFactoryPath(): string {
    return '/var/backups/mikrotik-usermanager/factory/sam-factory-clean.sql.gz';
}


function samOwnerBuildFactory(PDO $db): array {
    $dest = samOwnerFactoryPath();
    $dir = dirname($dest);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    @chmod($dir, 0775);

    $cfg = samOwnerDefaultsFile();
    $tmpDir = sys_get_temp_dir();
    $tmpSql = tempnam($tmpDir, 'sam_fac_sql_');
    $tmpGz = tempnam($tmpDir, 'sam_fac_gz_');
    $err = tempnam($tmpDir, 'sam_fac_err_');

    try {
        $base = 'mysqldump --defaults-extra-file=' . escapeshellarg($cfg) . ' --single-transaction --skip-comments ' . escapeshellarg(DB_NAME);

        // 1. Structure dump (no data)
        $cmd1 = $base . ' --no-data --routines --triggers > ' . escapeshellarg($tmpSql) . ' 2>' . escapeshellarg($err);
        exec('/bin/bash -c ' . escapeshellarg($cmd1), $o1, $c1);
        if ($c1 !== 0) {
            $msg = trim((string)@file_get_contents($err));
            throw new Exception('فشل تفريغ هيكل الجداول: ' . ($msg ?: 'خطأ غير معروف'));
        }

        // 2. Static configuration tables
        $static = ['um_settings', 'um_roles_def', 'um_app_migrations', 'um_speed_tiers', 'invoice_status', 'invoice_type', 'payment_type', 'um_chart_of_accounts'];
        foreach ($static as $t) {
            try {
                $db->query('SELECT 1 FROM `' . $t . '` LIMIT 1');
                $cmdTable = $base . ' --no-create-info --skip-triggers ' . escapeshellarg($t) . ' >> ' . escapeshellarg($tmpSql) . ' 2>>' . escapeshellarg($err);
                exec('/bin/bash -c ' . escapeshellarg($cmdTable), $oT, $cT);
            } catch (Throwable $e) {}
        }

        // 3. Admin user ID 1 and system owner ID 1
        $cmdAdmin = $base . " --no-create-info --skip-triggers --where='id=1' um_admins >> " . escapeshellarg($tmpSql) . " 2>>" . escapeshellarg($err);
        exec('/bin/bash -c ' . escapeshellarg($cmdAdmin), $oA, $cA);

        $cmdOwner = $base . " --no-create-info --skip-triggers --where='admin_id=1' um_system_owners >> " . escapeshellarg($tmpSql) . " 2>>" . escapeshellarg($err);
        exec('/bin/bash -c ' . escapeshellarg($cmdOwner), $oO, $cO);

        // 4. Compress to GZ
        $cmdGz = 'gzip -c ' . escapeshellarg($tmpSql) . ' > ' . escapeshellarg($tmpGz) . ' 2>>' . escapeshellarg($err);
        exec('/bin/bash -c ' . escapeshellarg($cmdGz), $oG, $cG);
        if ($cG !== 0 || !is_file($tmpGz) || filesize($tmpGz) < 500) {
            $msg = trim((string)@file_get_contents($err));
            throw new Exception('فشل ضغط ملف صورة المصنع: ' . ($msg ?: 'خطأ في الضغط'));
        }

        // 5. Move to final destination
        if (!@copy($tmpGz, $dest) && !@rename($tmpGz, $dest)) {
            throw new Exception('تعذر حفظ ملف صورة المصنع في المسار النهائي. تحقق من الصلاحيات.');
        }
        @chmod($dest, 0664);

        $size = filesize($dest);
        $sizeFormatted = round($size / 1024, 2) . ' KB';
        return [
            'path' => $dest,
            'size' => $size,
            'size_formatted' => $sizeFormatted,
            'created_at' => date('Y-m-d H:i:s')
        ];
    } finally {
        @unlink($cfg);
        @unlink($tmpSql);
        @unlink($tmpGz);
        @unlink($err);
    }
}

function samOwnerFactoryInfo(): array {
    $p = samOwnerFactoryPath();
    $exists = is_file($p);
    $size = $exists ? filesize($p) : 0;
    $sizeFormatted = $size >= 1048576 ? round($size / 1048576, 2) . ' MB' : round($size / 1024, 2) . ' KB';
    return [
        'exists' => $exists,
        'size' => $size,
        'size_formatted' => $sizeFormatted,
        'created_at' => $exists ? date('Y-m-d H:i:s', filemtime($p)) : null
    ];
}

function samOwnerApplyFactory(PDO $db): array {
    $p = samOwnerFactoryPath();
    if (!is_file($p)) throw new Exception('صورة المصنع غير موجودة. يرجى إنشاؤها أولاً.');
    $cfg = samOwnerDefaultsFile();
    $err = tempnam(sys_get_temp_dir(), 'sam_factory_restore_');
    try {
        $pipeline = 'gzip -dc ' . escapeshellarg($p) . ' | mysql --defaults-extra-file=' . escapeshellarg($cfg) . ' ' . escapeshellarg(DB_NAME) . ' 2>' . escapeshellarg($err);
        exec('/bin/bash -o pipefail -c ' . escapeshellarg($pipeline), $o, $code);
        $msg = trim((string)@file_get_contents($err));
        if ($code !== 0) {
            throw new Exception('فشلت استعادة المصنع: ' . ($msg ?: 'خطأ غير معروف'));
        }
        return ['success' => true];
    } finally {
        @unlink($cfg);
        @unlink($err);
    }
}

$db = getDB();
$db->exec("CREATE TABLE IF NOT EXISTS um_system_owners (admin_id INT NOT NULL PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->exec("INSERT INTO um_system_owners(admin_id)
           SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM um_system_owners)");


if (isset($currentAdminId)) {
    $maintenance = samOwnerSetting($db, 'system_maintenance_mode', '0') === '1';
    $isOwnerCheck = $db->prepare('SELECT COUNT(*) FROM um_system_owners WHERE admin_id=?');
    $isOwnerCheck->execute([(int)$currentAdminId]);
    $isOwner = (bool)$isOwnerCheck->fetchColumn();
    if ($maintenance && !$isOwner) {
        jsonResponse(['success' => false, 'error' => 'النظام في وضع الصيانة بواسطة مالك النظام'], 503);
    }
}

if (!isset($action) || strpos((string)$action, 'owner_system_') !== 0) return;

if (empty($currentAdminId) || empty($_SESSION['admin_id']) || (int)$currentAdminId !== (int)$_SESSION['admin_id']) {
    jsonResponse(['success' => false, 'error' => 'Unauthorized'], 401);
}

if (isset($currentAdminId)) {
    $ownerStmt = $db->prepare('SELECT COUNT(*) FROM um_system_owners WHERE admin_id=?');
    $ownerStmt->execute([(int)$currentAdminId]);
    if (!(bool)$ownerStmt->fetchColumn()) {
        jsonResponse(['success' => false, 'error' => 'هذه الإدارة خاصة بمالك النظام فقط'], 403);
    }
}

require_once __DIR__ . '/includes/NetworkSubscriptionService.php';
$networkSubscriptionService = new NetworkSubscriptionService($db);
require __DIR__ . '/system_owner_notifications_api.php';

if ($action === 'owner_system_subscription_center') {
    jsonResponse($networkSubscriptionService->getCenter());
}

if ($action === 'owner_system_network_subscription_detail') {
    jsonResponse($networkSubscriptionService->getNetworkDetail((int)($_GET['network_id'] ?? 0)));
}

if ($action === 'owner_system_save_network_plan') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    jsonResponse($networkSubscriptionService->savePlan($in, (int)$currentAdminId));
}

if ($action === 'owner_system_delete_network_plan') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    jsonResponse($networkSubscriptionService->deletePlan((int)($in['id'] ?? 0), (int)$currentAdminId));
}

if ($action === 'owner_system_assign_network_plan') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    jsonResponse($networkSubscriptionService->assignPlan(
        (int)($in['network_id'] ?? 0),
        (int)($in['plan_id'] ?? 0),
        $in,
        (int)$currentAdminId
    ));
}

if ($action === 'owner_system_set_subscription_state') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    jsonResponse($networkSubscriptionService->setSubscriptionState(
        (int)($in['network_id'] ?? 0),
        (string)($in['status'] ?? 'active'),
        array_key_exists('is_enabled', $in) ? !empty($in['is_enabled']) : true,
        isset($in['reason']) ? (string)$in['reason'] : null,
        (int)$currentAdminId
    ));
}

if ($action === 'owner_system_get_network_admins') {
    $adminsStmt = $db->query("
        SELECT a.id, a.username, a.fullname, a.phone, a.email, a.role, 
               a.data_scope, a.credit_limit, a.balance, a.is_active, 
               a.created_at, a.parent_id, NULL AS last_login, a.must_change_password
        FROM um_admins a
        ORDER BY a.id ASC
    ");
    $admins = $adminsStmt ? $adminsStmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $accessStmt = $db->query("
        SELECT na.admin_id, na.network_id, na.access_level, na.is_default, na.is_active,
               n.name AS network_name, n.code AS network_code, n.status AS network_status
        FROM um_admin_network_access na
        JOIN um_networks n ON n.id = na.network_id
        ORDER BY na.is_default DESC, n.id ASC
    ");
    $accessRows = $accessStmt ? $accessStmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $accessByAdmin = [];
    foreach ($accessRows as $row) {
        $accessByAdmin[(int)$row['admin_id']][] = [
            'network_id' => (int)$row['network_id'],
            'network_name' => $row['network_name'],
            'network_code' => $row['network_code'],
            'network_status' => $row['network_status'],
            'access_level' => $row['access_level'] ?: 'manager',
            'is_default' => (bool)$row['is_default'],
            'is_active' => (bool)$row['is_active']
        ];
    }

    foreach ($admins as &$adm) {
        $adm['id'] = (int)$adm['id'];
        $adm['is_active'] = (bool)$adm['is_active'];
        $adm['credit_limit'] = (float)$adm['credit_limit'];
        $adm['balance'] = (float)$adm['balance'];
        $adm['assigned_networks'] = $accessByAdmin[$adm['id']] ?? [];
    }
    unset($adm);

    $netsStmt = $db->query("
        SELECT 
            n.id, 
            n.name, 
            n.code, 
            n.status, 
            n.auth_mode, 
            n.logo_url,
            (SELECT COUNT(DISTINCT username) FROM radcheck WHERE network_id = n.id) AS subscribers_count,
            (SELECT COUNT(*) FROM nas WHERE network_id = n.id) AS routers_count,
            (SELECT COUNT(DISTINCT username) FROM radacct WHERE network_id = n.id AND acctstoptime IS NULL) AS online_count,
            (SELECT COUNT(DISTINCT admin_id) FROM um_admin_network_access WHERE network_id = n.id AND is_active = 1) AS admins_count
        FROM um_networks n 
        ORDER BY n.id ASC
    ");
    $networks = $netsStmt ? $netsStmt->fetchAll(PDO::FETCH_ASSOC) : [];
    foreach ($networks as &$netRow) {
        $netRow['id'] = (int)$netRow['id'];
        $netRow['subscribers_count'] = (int)$netRow['subscribers_count'];
        $netRow['routers_count'] = (int)$netRow['routers_count'];
        $netRow['online_count'] = (int)$netRow['online_count'];
        $netRow['admins_count'] = (int)$netRow['admins_count'];
    }
    unset($netRow);

    $rolesStmt = $db->query("SELECT role_key, role_name_ar, description FROM um_roles_def ORDER BY id ASC");
    $roles = $rolesStmt ? ($rolesStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    if (empty($roles)) {
        $roles = [
            ['role_key' => 'superadmin', 'role_name_ar' => 'مدير عام شبكة (Superadmin)', 'description' => 'إدارة شاملة لكافة أقسام الشبكة'],
            ['role_key' => 'network_manager', 'role_name_ar' => 'مدير تشغيل الشبكة', 'description' => 'إدارة الراوترات والجلسات والبطاقات'],
            ['role_key' => 'accountant', 'role_name_ar' => 'محاسب مالي', 'description' => 'إدارة القيود والسندات والتقارير المالية'],
            ['role_key' => 'cashier', 'role_name_ar' => 'كاشير ونقاط البيع', 'description' => 'بيع وتوليد الكروت وتحصيل الإيرادات'],
            ['role_key' => 'distributor', 'role_name_ar' => 'وكيل وموزع معتمد', 'description' => 'شحن وتوزيع البطاقات والأرصدة'],
            ['role_key' => 'operator', 'role_name_ar' => 'مشغل وفني شبكة', 'description' => 'مراقبة الجلسات وحالة الراوترات']
        ];
    }

    $totalSubscribers = (int)$db->query("SELECT COUNT(DISTINCT username) FROM radcheck")->fetchColumn();
    $totalRouters = (int)$db->query("SELECT COUNT(*) FROM nas")->fetchColumn();
    $totalOnline = (int)$db->query("SELECT COUNT(DISTINCT username) FROM radacct WHERE acctstoptime IS NULL")->fetchColumn();

    jsonResponse([
        'success' => true,
        'admins' => $admins,
        'networks' => $networks,
        'roles' => $roles,
        'summary' => [
            'total_admins' => count($admins),
            'active_admins' => count(array_filter($admins, fn($a) => $a['is_active'])),
            'disabled_admins' => count(array_filter($admins, fn($a) => !$a['is_active'])),
            'total_networks' => count($networks),
            'total_subscribers' => $totalSubscribers,
            'total_routers' => $totalRouters,
            'total_online' => $totalOnline
        ]
    ]);
}

if ($action === 'owner_system_save_network_admin') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $username = trim((string)($in['username'] ?? ''));
    $fullname = trim((string)($in['fullname'] ?? ''));
    $phone = function_exists('normalizeYemenPhone') ? normalizeYemenPhone(trim((string)($in['phone'] ?? ''))) : trim((string)($in['phone'] ?? ''));
    $email = trim((string)($in['email'] ?? ''));
    $role = trim((string)($in['role'] ?? 'superadmin'));
    $dataScope = trim((string)($in['data_scope'] ?? 'all'));
    $password = trim((string)($in['password'] ?? ''));
    $isActive = array_key_exists('is_active', $in) ? (!empty($in['is_active']) ? 1 : 0) : 1;
    $assignedNetworks = (array)($in['assigned_networks'] ?? []);
    $defaultNetworkId = (int)($in['default_network_id'] ?? 0);

    if (empty($fullname)) throw new Exception('الاسم الكامل للمدير إجباري');
    if (empty($username)) throw new Exception('اسم المستخدم إجباري');
    if (empty($phone)) throw new Exception('رقم الهاتف إجباري');

    if (empty($email)) {
        $email = preg_replace('/[^a-zA-Z0-9_\.]/', '', strtolower($username)) . '@sam.local';
    }

    $chk = $db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) AND id != ? LIMIT 1");
    $chk->execute([$username, $id]);
    if ($chk->fetch()) throw new Exception('اسم المستخدم مسجل مسبقاً لمستخدم آخر');

    $chkP = $db->prepare("SELECT id FROM um_admins WHERE phone = ? AND id != ? LIMIT 1");
    $chkP->execute([$phone, $id]);
    if ($chkP->fetch()) throw new Exception('رقم الهاتف مسجل مسبقاً لمستخدم آخر');

    if ($id > 0) {
        if ($id === 1 && $role !== 'system_owner') {
            throw new Exception('لا يمكن تغيير رتبة مالك النظام الأساسي');
        }
        $sql = "UPDATE um_admins SET fullname=?, username=?, phone=?, email=?, role=?, data_scope=?, is_active=? WHERE id=?";
        $params = [$fullname, $username, $phone, $email, $role, $dataScope, $isActive, $id];
        if (!empty($password)) {
            if (strlen($password) < 6) throw new Exception('كلمة المرور يجب ألا تقل عن 6 أحرف/أرقام');
            $sql = "UPDATE um_admins SET fullname=?, username=?, phone=?, email=?, role=?, data_scope=?, is_active=?, password_hash=?, must_change_password=0 WHERE id=?";
            $params = [$fullname, $username, $phone, $email, $role, $dataScope, $isActive, password_hash($password, PASSWORD_BCRYPT), $id];
        }
        $db->prepare($sql)->execute($params);
        $isUpdateAction = true;
    } else {
        if (empty($password)) throw new Exception('كلمة المرور مطلوبة عند إنشاء حساب مدير جديد');
        if (strlen($password) < 6) throw new Exception('كلمة المرور يجب ألا تقل عن 6 أحرف/أرقام');
        $stmt = $db->prepare("INSERT INTO um_admins (fullname, username, phone, email, role, data_scope, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$fullname, $username, $phone, $email, $role, $dataScope, $isActive, password_hash($password, PASSWORD_BCRYPT)]);
        $id = (int)$db->lastInsertId();
        $isUpdateAction = false;
    }

    try {
        require_once __DIR__ . '/includes/WhatsAppService.php';
        WhatsAppService::sendAccountNotification($db, [
            'fullname' => $fullname,
            'username' => $username,
            'phone' => $phone,
            'role' => $role
        ], $isUpdateAction, !empty($password) ? $password : null);
    } catch (Throwable $waErr) {}

    $validNetworkIds = [];
    foreach ($assignedNetworks as $netItem) {
        $netId = is_array($netItem) ? (int)($netItem['network_id'] ?? 0) : (int)$netItem;
        if ($netId <= 0) continue;
        $validNetworkIds[] = $netId;
        $accessLevel = is_array($netItem) ? ($netItem['access_level'] ?? 'manager') : 'manager';
        $isDef = ($defaultNetworkId === $netId) || (is_array($netItem) && !empty($netItem['is_default']));
        $netActive = is_array($netItem) ? (!empty($netItem['is_active']) ? 1 : 0) : 1;

        $upsertAccess = $db->prepare("
            INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE access_level=VALUES(access_level), is_default=VALUES(is_default), is_active=VALUES(is_active)
        ");
        $upsertAccess->execute([$id, $netId, $accessLevel, $isDef ? 1 : 0, $netActive, (int)$currentAdminId]);

        if ($netActive && $isActive) {
            $db->prepare("UPDATE um_networks SET status = 'active' WHERE id = ? AND status = 'pending_approval'")->execute([$netId]);
            if($db->query('SELECT ROW_COUNT()')->fetchColumn()>0) {
                $db->prepare("INSERT IGNORE INTO um_network_settings(network_id,setting_key,setting_value,updated_by_admin_id) VALUES(?,'onboarding_v1',?,?)")->execute([$netId,json_encode(['auto_pending'=>true]),$currentAdminId]);
            }
        }
    }

    if (!empty($validNetworkIds)) {
        $inPlaceholders = implode(',', array_fill(0, count($validNetworkIds), '?'));
        $delAccess = $db->prepare("DELETE FROM um_admin_network_access WHERE admin_id = ? AND network_id NOT IN ($inPlaceholders)");
        $delAccess->execute(array_merge([$id], $validNetworkIds));
    } else {
        if ($id === 1) {
            $db->exec("INSERT IGNORE INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active) VALUES (1, 1, 'owner', 1, 1)");
        }
    }

    $hasDefault = (int)$db->query("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=$id AND is_default=1 AND is_active=1")->fetchColumn();
    if (!$hasDefault) {
        $db->exec("UPDATE um_admin_network_access SET is_default=1 WHERE admin_id=$id AND is_active=1 LIMIT 1");
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_admin_save', 'admins', 'حفظ وتفويض حساب مدير شبكة', "المدير: $fullname ($username) - الرتبة: $role", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ بيانات المدير وتفويض الشبكات المصرحة بنجاح!',
        'id' => $id
    ]);
}

if ($action === 'owner_system_toggle_admin_status') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $active = !empty($in['active']) ? 1 : 0;

    if ($id <= 0) throw new Exception('معرف الحساب غير صالح');
    if ($id === 1 || $id === (int)$currentAdminId) {
        throw new Exception('لا يمكن تعطيل حساب مالك النظام الرئيسي');
    }

    $db->prepare("UPDATE um_admins SET is_active = ? WHERE id = ?")->execute([$active, $id]);
    samOwnerLogActivity($db, $service ?? null, 'owner_admin_toggle', 'admins', ($active ? 'تفعيل' : 'تعطيل') . ' حساب مدير', "معرف المدير: $id", 'success', (int)$currentAdminId);

    // Dispatch WhatsApp alert to the admin's phone
    try {
        $admStmt = $db->prepare("SELECT fullname, username, phone FROM um_admins WHERE id = ?");
        $admStmt->execute([$id]);
        $admRow = $admStmt->fetch(PDO::FETCH_ASSOC);
        if ($admRow && !empty($admRow['phone'])) {
            require_once __DIR__ . '/includes/WhatsAppService.php';
            $wa = new WhatsAppService($db, null, 0);
            $admName = $admRow['fullname'] ?: $admRow['username'];
            if ($active) {
                $admMsg = "🟢 *تنبيه منصة SAM - تفعيل الحساب الإداري*\n"
                        . "━━━━━━━━━━━━━━━━━━\n"
                        . "مرحباً بك *" . $admName . "*،\n"
                        . "✅ تم *تفعيل* حسابك الإداري بنجاح من قبل مالك المنظومة.\n"
                        . "يمكنك الآن تسجيل الدخول مباشرة وممارسة مهامك في النظام.";
            } else {
                $admMsg = "🔴 *تنبيه منصة SAM - تعطيل الحساب الإداري*\n"
                        . "━━━━━━━━━━━━━━━━━━\n"
                        . "عزيزي *" . $admName . "*،\n"
                        . "⚠️ تم *تعطيل* حسابك الإداري في النظام.\n"
                        . "يرجى مراجعة إدارة المنظومة الرئيسية للاستفسار.";
            }
            $wa->sendMessage($admRow['phone'], $admMsg, 'adm_toggle_' . $id . '_' . time(), (int)$currentAdminId, 'admin_status_alert');
        }
    } catch (Throwable $e) {}

    jsonResponse([
        'success' => true,
        'message' => $active ? 'تم تفعيل حساب المدير بنجاح' : 'تم تعطيل حساب المدير بنجاح'
    ]);
}

if ($action === 'owner_system_delete_network_admin') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);

    if ($id <= 0) throw new Exception('معرف الحساب غير صالح');
    if ($id === 1 || $id === (int)$currentAdminId) {
        throw new Exception('لا يمكن حذف حساب مالك النظام الرئيسي');
    }

    $isOwnerCheck = (int)$db->query("SELECT COUNT(*) FROM um_system_owners WHERE admin_id=$id")->fetchColumn();
    if ($isOwnerCheck > 0) {
        throw new Exception('لا يمكن حذف حساب مسجل كمالك للنظام');
    }

    $db->prepare("DELETE FROM um_admin_network_access WHERE admin_id = ?")->execute([$id]);
    $db->prepare("DELETE FROM um_admin_network_roles WHERE admin_id = ?")->execute([$id]);
    $db->prepare("DELETE FROM um_admins WHERE id = ?")->execute([$id]);

    samOwnerLogActivity($db, $service ?? null, 'owner_admin_delete', 'admins', 'حذف حساب مدير شبكة', "معرف المدير: $id", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حذف حساب المدير وإلغاء كافة صلاحياته وشبكاته بنجاح!'
    ]);
}

if ($action === 'owner_system_create_network') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $name = trim((string)($in['name'] ?? ''));
    $code = strtoupper(trim((string)($in['code'] ?? '')));
    $city = trim((string)($in['city'] ?? ''));
    $phone = trim((string)($in['phone'] ?? ''));
    $ownerName = trim((string)($in['owner_name'] ?? ''));
    $planId = (int)($in['plan_id'] ?? 1);
    $notes = trim((string)($in['notes'] ?? ''));

    if ($name === '') throw new Exception('اسم شبكة العميل مطلوب');
    $code = samGenerateUniqueNetworkCode($db, $code);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO um_networks (code, name, location, status, notes, created_by, created_at) VALUES (?, ?, ?, 'active', ?, ?, NOW())");
        $stmt->execute([$code, $name, $city ?: null, $notes ?: "شبكة عميل مضافة من لوحة المالك", (int)$currentAdminId]);
        $netId = (int)$db->lastInsertId();
        // Create subscription
        $planStmt = $db->prepare("SELECT * FROM um_network_plans WHERE id = ? LIMIT 1");
        $planStmt->execute([$planId]);
        $plan = $planStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $price = (float)($plan['monthly_price'] ?? 0);
        $currency = $plan['currency_code'] ?? 'YER';

        $subStmt = $db->prepare("INSERT INTO um_network_subscriptions (network_id, plan_id, status, is_enabled, starts_at, expires_at, price_snapshot, currency_code, created_at) VALUES (?, ?, 'active', 1, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?, NOW())");
        $subStmt->execute([$netId, $planId, $price, $currency]);

        // Channels init (WhatsApp & Telegram)
        $insWa = $db->prepare("INSERT INTO um_network_channels (network_id, channel_type, label, api_url, is_enabled, status, created_by, created_at) VALUES (?, 'whatsapp', 'بوابة واتساب الشبكة', 'http://127.0.0.1:3388', 1, 'DISCONNECTED', ?, NOW()) ON DUPLICATE KEY UPDATE is_enabled=1");
        $insWa->execute([$netId, (int)$currentAdminId]);

        $insTg = $db->prepare("INSERT INTO um_network_channels (network_id, channel_type, label, is_enabled, status, created_by, created_at) VALUES (?, 'telegram', 'بوت تليجرام الشبكة', 0, 'DISCONNECTED', ?, NOW()) ON DUPLICATE KEY UPDATE is_enabled=0");
        $insTg->execute([$netId, (int)$currentAdminId]);

        // Notification Settings init
        $insNotif = $db->prepare("INSERT INTO um_network_notification_settings (network_id, whatsapp_enabled, telegram_enabled, fcm_enabled, chatbot_enabled, notify_sales, notify_receipts, notify_transfers, notify_inventory, notify_routers, notify_finance, chatbot_network_name, created_at) VALUES (?, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, ?, NOW()) ON DUPLICATE KEY UPDATE whatsapp_enabled=1");
        $insNotif->execute([$netId, $name]);

        // Link System Owner ID 1 as sovereign access to this new network
        $insOwnAcc = $db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (1, ?, 'owner', 0, 1, 1) ON DUPLICATE KEY UPDATE is_active=1");
        $insOwnAcc->execute([$netId]);

        $insOwnRole = $db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, created_at) VALUES (1, ?, 'system_owner', NOW()) ON DUPLICATE KEY UPDATE role_key='system_owner'");
        $insOwnRole->execute([$netId]);

        // If phone or client manager info is provided, link/create admin access
        $clientPhone = function_exists('normalizeYemenPhone') ? normalizeYemenPhone($phone) : preg_replace('/[^0-9]/', '', $phone);
        if (!empty($clientPhone)) {
            $admStmt = $db->prepare("SELECT id FROM um_admins WHERE phone = ? LIMIT 1");
            $admStmt->execute([$clientPhone]);
            $existingAdminId = (int)$admStmt->fetchColumn();
            if ($existingAdminId > 0) {
                $db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (?, ?, 'manager', 1, 1, ?) ON DUPLICATE KEY UPDATE is_active=1")->execute([$existingAdminId, $netId, (int)$currentAdminId]);
                $db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, created_at) VALUES (?, ?, 'network_manager', NOW()) ON DUPLICATE KEY UPDATE role_key='network_manager'")->execute([$existingAdminId, $netId]);
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_network_create', 'networks', 'إنشاء شبكة عميل جديدة', "الشبكة: $name ($code)", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم إنشاء شبكة العميل وتفعيل اشتراكها بنجاح!',
        'network_id' => $netId,
        'code' => $code,
        'name' => $name
    ]);
}

if ($action === 'owner_system_save_network_info') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $netId = (int)($in['network_id'] ?? 0);
    $name = trim((string)($in['name'] ?? ''));
    $code = strtoupper(trim((string)($in['code'] ?? '')));
    $city = trim((string)($in['city'] ?? ''));
    $notes = trim((string)($in['notes'] ?? ''));

    if ($netId <= 0) throw new Exception('معرف الشبكة غير صالح');
    if ($name === '') throw new Exception('اسم الشبكة مطلوب');

    $chk = $db->prepare("SELECT id FROM um_networks WHERE code = ? AND id != ?");
    $chk->execute([$code, $netId]);
    if ($chk->fetch()) throw new Exception('رمز الشبكة مستخدم لشبكة أخرى');

    $stmt = $db->prepare("UPDATE um_networks SET name = ?, code = ?, location = ?, notes = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([$name, $code, $city ?: null, $notes, $netId]);

    samOwnerLogActivity($db, $service ?? null, 'owner_network_edit', 'networks', 'تعديل بيانات شبكة عميل', "معرف الشبكة: $netId، الاسم: $name", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ بيانات الشبكة بنجاح'
    ]);
}

if ($action === 'owner_system_toggle_network_status') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $netId = (int)($in['network_id'] ?? 0);
    $targetStatus = (string)($in['status'] ?? 'active');
    if ($netId <= 1) throw new Exception('لا يمكن تعليق أو تعديل حالة الشبكة الرئيسية للنظام');

    $isEnabled = ($targetStatus === 'active') ? 1 : 0;

    $db->prepare("UPDATE um_networks SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$targetStatus, $netId]);
    $db->prepare("UPDATE um_network_subscriptions SET status = ?, is_enabled = ?, updated_at = NOW() WHERE network_id = ?")->execute([$targetStatus, $isEnabled, $netId]);

    // Dispatch WhatsApp alert to network manager
    try {
        $adminsStmt = $db->prepare("SELECT a.phone, a.fullname, a.username FROM um_admins a JOIN um_admin_network_access na ON na.admin_id = a.id WHERE na.network_id = ? AND a.phone IS NOT NULL AND a.phone != ''");
        $adminsStmt->execute([$netId]);
        $adminsList = $adminsStmt->fetchAll(PDO::FETCH_ASSOC);

        $netName = (string)$db->query("SELECT name FROM um_networks WHERE id = $netId")->fetchColumn();
        require_once __DIR__ . '/includes/WhatsAppService.php';
        $wa = new WhatsAppService($db, null, 0);

        foreach ($adminsList as $adm) {
            $p = (string)$adm['phone'];
            $n = (string)($adm['fullname'] ?: $adm['username']);
            if ($targetStatus === 'active') {
                $msg = "🟢 *منصة SAM - تفعيل خدمة الشبكة*\n━━━━━━━━━━━━━━━━━━\nمرحباً بك عزيزي *{$n}*،\n✅ تم *تفعيل* شبكتكم (*{$netName}*) بنجاح من قبل إدارة المنظومة.";
            } else {
                $msg = "🔴 *منصة SAM - تنبيه تعليق خدمة الشبكة*\n━━━━━━━━━━━━━━━━━━\nعزيزي *{$n}*،\n⚠️ تم *تعليق* خدمة شبكتكم (*{$netName}*) مؤقتاً.\nيرجى التواصل مع إدارة المنظومة للاستفسار.";
            }
            $wa->sendMessage($p, $msg, 'net_status_' . $netId . '_' . time(), (int)$currentAdminId, 'network_status_alert');
        }
    } catch (Throwable $e) {}

    samOwnerLogActivity($db, $service ?? null, 'owner_network_toggle', 'networks', 'تغيير حالة شبكة عميل', "معرف الشبكة: $netId، الحالة الجديدة: $targetStatus", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => ($targetStatus === 'active') ? 'تم تفعيل شبكة العميل بنجاح وإرسال الإشعار لمديرها' : 'تم تعليق شبكة العميل بنجاح وإرسال الإشعار لمديرها'
    ]);
}

if ($action === 'owner_system_delete_network') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $netId = (int)($in['network_id'] ?? 0);
    if ($netId <= 1) throw new Exception('لا يمكن حذف الشبكة الأساسية للنظام');

    $netName = (string)$db->query("SELECT name FROM um_networks WHERE id = $netId")->fetchColumn();

    $db->prepare("DELETE FROM um_admin_network_roles WHERE network_id = ?")->execute([$netId]);
    $db->prepare("DELETE FROM um_admin_network_access WHERE network_id = ?")->execute([$netId]);
    $db->prepare("DELETE FROM um_network_subscriptions WHERE network_id = ?")->execute([$netId]);
    $db->prepare("DELETE FROM um_network_channels WHERE network_id = ?")->execute([$netId]);
    $db->prepare("DELETE FROM um_notifications WHERE network_id = ?")->execute([$netId]);
    $db->prepare("DELETE FROM um_networks WHERE id = ?")->execute([$netId]);

    samOwnerLogActivity($db, $service ?? null, 'owner_network_delete', 'networks', 'حذف شبكة عميل', "تم حذف الشبكة $netName (ID: $netId)", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => "تم حذف شبكة العميل ($netName) بنجاح"
    ]);
}

if ($action === 'owner_system_server_backup') {
    require_once __DIR__ . '/includes/RadiusService.php';
    $rs = new RadiusService($db);
    $res = $rs->createDatabaseBackup(0, true);
    if (!empty($res['success']) && !empty($res['filename'])) {
        $res['download_url'] = 'api.php?action=owner_system_download_backup&file=' . urlencode($res['filename']);
    }
    samOwnerLogActivity($db, $service ?? null, 'owner_backup_create', 'server', 'إنشاء نسخة احتياطية للنظام', 'تم إنشاء نسخة احتياطية شاملة لقاعدة البيانات', 'success', (int)$currentAdminId);
    jsonResponse($res);
}

if ($action === 'owner_system_download_backup') {
    $file = basename((string)($_GET['file'] ?? ''));
    if (empty($file) || !preg_match('/^[a-zA-Z0-9_\.-]+\.sql\.gz$/', $file)) {
        http_response_code(400);
        exit('اسم ملف النسخة الاحتياطية غير صالح');
    }
    $path = '/var/backups/mikrotik-usermanager/' . $file;
    if (!is_file($path)) {
        http_response_code(404);
        exit('ملف النسخة الاحتياطية غير موجود');
    }
    header('Content-Type: application/gzip');
    header('Content-Disposition: attachment; filename="' . $file . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

if ($action === 'owner_system_clear_cache') {
    $cleared = [];
    if (function_exists('opcache_reset')) {
        $cleared['opcache'] = @opcache_reset();
    }
    $tmpDir = sys_get_temp_dir();
    $count = 0;
    foreach (glob($tmpDir . '/sam_*') ?: [] as $f) {
        if (is_file($f)) { @unlink($f); $count++; }
    }
    $cleared['temp_files_deleted'] = $count;

    samOwnerLogActivity($db, $service ?? null, 'owner_cache_clear', 'server', 'تنظيف التخزين المؤقت', "تم حذف $count ملفات مؤقتة وتحديث الذاكرة", 'success', (int)$currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم تفريغ التخزين المؤقت وتنظيف ملفات النظام بنجاح',
        'details' => $cleared
    ]);
}

if ($action === 'owner_system_diagnostics') {
    $t_start = microtime(true);

    // 1. Database Connection & Speed Benchmark
    $t_db = microtime(true);
    $dbOk = false;
    $dbVer = '';
    $dbStatus = [];
    try {
        $row = $db->query("SELECT VERSION() AS ver")->fetch();
        $dbVer = $row['ver'] ?? 'Unknown';
        $dbOk = true;
        $dbStatus = $db->query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Questions', 'Slow_queries', 'Uptime', 'Innodb_buffer_pool_reads')")->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
    } catch (Throwable $e) {}
    $dbLatency = round((microtime(true) - $t_db) * 1000, 2);

    // 2. Redis Benchmark
    $t_redis = microtime(true);
    $redisOk = false;
    $redisInfo = [];
    try {
        if (class_exists('Redis')) {
            $r = new Redis();
            if (@$r->connect('127.0.0.1', 6379, 0.5)) {
                $redisOk = true;
                $redisInfo = @$r->info() ?: [];
            }
        }
    } catch (Throwable $e) {}
    $redisLatency = round((microtime(true) - $t_redis) * 1000, 2);

    // 3. Disk Space
    $diskFree = @disk_free_space('/');
    $diskTotal = @disk_total_space('/');
    $freeGb = round($diskFree / (1024*1024*1024), 2);
    $totalGb = round($diskTotal / (1024*1024*1024), 2);
    $usedGb = round($totalGb - $freeGb, 2);
    $diskPercent = $diskTotal > 0 ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1) : 0;
    $diskStatus = ($diskPercent < 85) ? 'pass' : ($diskPercent < 92 ? 'warn' : 'fail');

    // 4. RAM Memory
    $meminfo = @file_get_contents('/proc/meminfo') ?: '';
    preg_match('/MemTotal:\s+(\d+)/', $meminfo, $mt);
    preg_match('/MemAvailable:\s+(\d+)/', $meminfo, $ma);
    preg_match('/SwapTotal:\s+(\d+)/', $meminfo, $st);
    preg_match('/SwapFree:\s+(\d+)/', $meminfo, $sf);
    $totMem = (int)($mt[1] ?? 0);
    $availMem = (int)($ma[1] ?? 0);
    $swapTot = (int)($st[1] ?? 0);
    $swapFree = (int)($sf[1] ?? 0);
    $usedMemMb = round(($totMem - $availMem) / 1024, 1);
    $totMemMb = round($totMem / 1024, 1);
    $memPercent = $totMem > 0 ? round((($totMem - $availMem) / $totMem) * 100, 1) : 0;
    $memStatus = ($memPercent < 85) ? 'pass' : ($memPercent < 95 ? 'warn' : 'fail');

    // 5. CPU & System Load
    $load = sys_getloadavg() ?: [0, 0, 0];
    $cpuCores = (int)trim((string)shell_exec('nproc 2>/dev/null')) ?: 1;
    $cpuModel = '';
    foreach (@file('/proc/cpuinfo') ?: [] as $line) {
        if (str_starts_with($line, 'model name')) {
            $cpuModel = trim(explode(':', $line, 2)[1] ?? '');
            break;
        }
    }
    $cpuPercent = min(100, round(($load[0] / max(1, $cpuCores)) * 100, 1));
    $cpuStatus = ($cpuPercent < 80) ? 'pass' : ($cpuPercent < 92 ? 'warn' : 'fail');

    // 6. PHP-FPM Detailed Metrics
    $phpState = trim((string)shell_exec('/bin/systemctl is-active php8.3-fpm 2>/dev/null || /bin/systemctl is-active php8.2-fpm 2>/dev/null || /bin/systemctl is-active php-fpm 2>/dev/null'));
    $fpmPs = shell_exec("ps -eo pid,user,%cpu,%mem,rss,command | grep 'php-fpm: pool www' | grep -v grep 2>/dev/null") ?: '';
    $fpmWorkers = [];
    $fpmTotalRss = 0;
    foreach (explode("\n", trim($fpmPs)) as $line) {
        if (!$line) continue;
        $cols = preg_split('/\s+/', trim($line));
        if (count($cols) >= 5) {
            $rssKb = (int)$cols[4];
            $fpmTotalRss += $rssKb;
            $fpmWorkers[] = [
                'pid' => (int)$cols[0],
                'user' => $cols[1],
                'cpu' => (float)$cols[2],
                'mem' => (float)$cols[3],
                'rss_mb' => round($rssKb / 1024, 1)
            ];
        }
    }
    $fpmAvgMb = count($fpmWorkers) > 0 ? round(($fpmTotalRss / count($fpmWorkers)) / 1024, 1) : 0;
    $fpmTotalMb = round($fpmTotalRss / 1024, 1);
    $fpmConf = @file_get_contents('/etc/php/8.3/fpm/pool.d/www.conf') ?: (@file_get_contents('/etc/php/8.2/fpm/pool.d/www.conf') ?: '');
    preg_match('/^\s*pm\.max_children\s*=\s*(\d+)/m', $fpmConf, $pmMc);
    preg_match('/^\s*pm\.start_servers\s*=\s*(\d+)/m', $fpmConf, $pmSs);
    $maxChildren = (int)($pmMc[1] ?? 5);
    $startServers = (int)($pmSs[1] ?? 2);

    // 7. FreeRADIUS & Active Sessions
    $radiusState = trim((string)shell_exec('/bin/systemctl is-active freeradius 2>/dev/null'));
    $radiusActiveSessions = 0;
    $radiusTodaySessions = 0;
    $radiusTotalUsers = 0;
    try {
        $radiusActiveSessions = (int)$db->query("SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL")->fetchColumn();
        $radiusTodaySessions = (int)$db->query("SELECT COUNT(*) FROM radacct WHERE acctstarttime >= CURDATE()")->fetchColumn();
        $radiusTotalUsers = (int)$db->query("SELECT COUNT(*) FROM radcheck")->fetchColumn();
    } catch (Throwable $e) {}

    // 8. Routers & SSTP
    $sstpState = trim((string)shell_exec('/bin/systemctl is-active accel-ppp 2>/dev/null'));
    $routersTotal = 0;
    $routersOnline = 0;
    try {
        $routersTotal = (int)$db->query("SELECT COUNT(*) FROM nas")->fetchColumn();
        $rMon = $db->query("SELECT COUNT(*) as total, SUM(CASE WHEN last_status='online' THEN 1 ELSE 0 END) as online FROM um_router_status_monitor")->fetch(PDO::FETCH_ASSOC);
        if ($rMon && (int)$rMon['total'] > 0) {
            $routersOnline = (int)($rMon['online'] ?? 0);
        } else {
            $routersOnline = (int)$db->query("SELECT COUNT(*) FROM nas WHERE is_active=1")->fetchColumn();
        }
    } catch (Throwable $e) {}
    $routersOffline = max(0, $routersTotal - $routersOnline);

    // 9. Live Connections Count
    $httpConns = (int)shell_exec("ss -Hnt state established '( sport = :80 or sport = :443 or sport = :8099 )' | wc -l 2>/dev/null");
    $telemetryConns = (int)shell_exec("ss -Hnt state established sport = :8088 | wc -l 2>/dev/null");
    $sstpConns = (int)shell_exec("ss -Hnt state established sport = :443 | wc -l 2>/dev/null");

    // 10. Services List
    $servicesList = samOwnerServices();

    // 11. Cron Jobs & Failures
    $cronState = trim((string)shell_exec('/bin/systemctl is-active cron 2>/dev/null'));
    $cronLogRaw = shell_exec("journalctl -u cron -n 40 --no-pager 2>/dev/null || grep -i CRON /var/log/syslog | tail -n 40 2>/dev/null") ?: '';
    $cronFailures = [];
    $cronLines = explode("\n", trim($cronLogRaw));
    foreach ($cronLines as $cline) {
        if (!$cline) continue;
        if (preg_match('/(bad minute|failed|FAILED|exit status [1-9]|CRON.*error)/i', $cline)) {
            $cronFailures[] = trim($cline);
        }
    }
    $dbCronFailures = [];
    try {
        $dbCronFailures = $db->query("SELECT action_type, action_title, details, created_at FROM um_activity_logs WHERE status IN ('failed', 'error') AND (action_type LIKE '%cron%' OR action_category='cron' OR details LIKE '%disconnect failed%') ORDER BY created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {}

    // 12. Running Processes & Stuck Tasks
    $psHead = shell_exec("ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu | head -n 15 2>/dev/null") ?: '';
    $processList = [];
    $psRows = explode("\n", trim($psHead));
    if (count($psRows) > 1) {
        array_shift($psRows);
        foreach ($psRows as $prow) {
            $pcols = preg_split('/\s+/', trim($prow));
            if (count($pcols) >= 6) {
                $pPid = (int)$pcols[0];
                $pUser = $pcols[1];
                $pCpu = (float)$pcols[2];
                $pMem = (float)$pcols[3];
                $pEtime = $pcols[4];
                $pComm = implode(' ', array_slice($pcols, 5));
                $isStuck = ($pCpu > 40.0) || (str_contains($pComm, 'php') && !str_starts_with($pEtime, '00:0') && !str_starts_with($pEtime, '00:1') && !str_starts_with($pEtime, '00:2'));
                $processList[] = [
                    'pid' => $pPid,
                    'user' => $pUser,
                    'cpu' => $pCpu,
                    'mem' => $pMem,
                    'etime' => $pEtime,
                    'comm' => $pComm,
                    'is_stuck' => $isStuck
                ];
            }
        }
    }

    // 13. API Errors (Last 24h & Last 1h)
    $apiErrors24h = 0;
    $apiErrors1h = 0;
    $recentErrorsList = [];
    try {
        $apiErrors24h = (int)$db->query("SELECT COUNT(*) FROM um_activity_logs WHERE status IN ('failed', 'error') AND created_at >= NOW() - INTERVAL 24 HOUR")->fetchColumn();
        $apiErrors1h = (int)$db->query("SELECT COUNT(*) FROM um_activity_logs WHERE status IN ('failed', 'error') AND created_at >= NOW() - INTERVAL 1 HOUR")->fetchColumn();
        $recentErrorsList = $db->query("SELECT id, action_type, action_category, action_title, details, status, created_at FROM um_activity_logs WHERE status IN ('failed', 'error') ORDER BY created_at DESC LIMIT 15")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {}

    // 14. Last Backup Status
    $lastBackup = null;
    try {
        $lastBackup = $db->query("SELECT action_title, details, status, created_at FROM um_activity_logs WHERE action_type LIKE '%backup%' ORDER BY created_at DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $e) {}
    $backupOk = true;
    if ($lastBackup && $lastBackup['status'] === 'failed') {
        $backupOk = false;
    }

    // 15. WhatsApp Gateway Port 3388
    $waOk = false;
    $waStatusText = 'غير متصل';
    try {
        $ch = curl_init('http://127.0.0.1:3388/status?network_id=0');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2, CURLOPT_CONNECTTIMEOUT => 1]);
        $r = curl_exec($ch);
        curl_close($ch);
        if ($r) {
            $j = json_decode($r, true);
            if (isset($j['status'])) {
                $waOk = true;
                $waStatusText = ($j['connected'] ? 'متصل ومقترن 🟢' : ($j['status'] === 'QR_READY' ? 'جاهز لمسح QR 🟡' : $j['status']));
            }
        }
    } catch (Throwable $e) {}

    // 16. Thresholds & Alerting Engine Evaluation
    $threshCpu = (float)samOwnerSetting($db, 'owner_alert_cpu_thresh', '85');
    $threshRam = (float)samOwnerSetting($db, 'owner_alert_ram_thresh', '90');
    $threshDisk = (float)samOwnerSetting($db, 'owner_alert_disk_thresh', '90');
    $threshLatency = (float)samOwnerSetting($db, 'owner_alert_latency_thresh', '1500');
    $alertWhatsapp = samOwnerSetting($db, 'owner_alert_whatsapp_enabled', '1') === '1';
    $alertTelegram = samOwnerSetting($db, 'owner_alert_telegram_enabled', '1') === '1';

    $activeAlerts = [];
    foreach ($servicesList as $srv) {
        if ($srv['state'] !== 'active') {
            $activeAlerts[] = [
                'type' => 'service_down',
                'severity' => 'critical',
                'title' => 'توقف خدمة: ' . $srv['label'],
                'message' => "الخدمة [{$srv['label']}] متوقفة أو غير نشطة ({$srv['state']})."
            ];
        }
    }
    if ($cpuPercent >= $threshCpu) {
        $activeAlerts[] = [
            'type' => 'high_cpu',
            'severity' => 'warning',
            'title' => 'ارتفاع استهلاك المعالج',
            'message' => "استهلاك المعالج وصل إلى {$cpuPercent}% (تجاوز الحد المسموح {$threshCpu}%)."
        ];
    }
    if ($diskPercent >= $threshDisk || $freeGb < 1.0) {
        $activeAlerts[] = [
            'type' => 'high_disk',
            'severity' => 'critical',
            'title' => 'امتلاء مساحة القرص الصلب',
            'message' => "مساحة القرص مستخدمة بنسبة {$diskPercent}%، والمتبقي {$freeGb} GB فقط."
        ];
    }
    if ($memPercent >= $threshRam) {
        $activeAlerts[] = [
            'type' => 'high_ram',
            'severity' => 'warning',
            'title' => 'ارتفاع استهلاك الذاكرة',
            'message' => "استهلاك الذاكرة RAM وصل إلى {$memPercent}%."
        ];
    }
    if (!$backupOk) {
        $activeAlerts[] = [
            'type' => 'backup_failed',
            'severity' => 'critical',
            'title' => 'فشل النسخ الاحتياطي للنظام',
            'message' => "آخر محاولة لإنشاء نسخة احتياطية للنظام فشلت: " . ($lastBackup['details'] ?? '')
        ];
    }
    $samErrorsCount = 0;
    foreach ($recentErrorsList as $errItem) {
        if (stripos($errItem['details'] ?? '', 'disconnect failed') !== false || stripos($errItem['action_type'] ?? '', 'sam') !== false) {
            $samErrorsCount++;
        }
    }
    if ($samErrorsCount >= 3) {
        $activeAlerts[] = [
            'type' => 'sam_errors',
            'severity' => 'warning',
            'title' => 'تكرار أخطاء SAM وجلسات الانتهاء',
            'message' => "تم رصد {$samErrorsCount} أخطاء متكررة في مهام SAM expiry disconnect."
        ];
    }

    $totalLatency = round((microtime(true) - $t_start) * 1000, 2);

    $tests = [
        [
            'name' => 'قاعدة البيانات (MariaDB / MySQL)',
            'status' => $dbOk ? 'pass' : 'fail',
            'value' => $dbOk ? "متصل ({$dbVer}) - زمن الاستجابة {$dbLatency}ms - الاتصالات النشطة " . ($dbStatus['Threads_connected'] ?? 0) : 'فشل الاتصال بقاعدة البيانات',
            'recommendation' => $dbOk ? 'الحالة ممتازة ومستقرة' : 'يرجى مراجعة خدمة mariadb والاتصال'
        ],
        [
            'name' => 'خادم الذاكرة السريعة (Redis Cache)',
            'status' => $redisOk ? 'pass' : 'warn',
            'value' => $redisOk ? "متصل (PONG) - زمن {$redisLatency}ms - الذاكرة: " . ($redisInfo['used_memory_human'] ?? '1MB') : 'غير متصل أو الإضافة غير مفعلة',
            'recommendation' => $redisOk ? 'الكاش السريع يعمل بكفاءة' : 'تشغيل redis-server يسرع الواجهات'
        ],
        [
            'name' => 'معالج بي إتش بي (PHP-FPM)',
            'status' => ($phpState === 'active' || PHP_VERSION) ? 'pass' : 'warn',
            'value' => "PHP " . PHP_VERSION . ($phpState === 'active' ? ' (نشط FPM 🟢)' : '') . " - عمال: " . count($fpmWorkers) . " - ذاكرة: {$fpmAvgMb}MB/عامل",
            'recommendation' => 'معالج الطلبات يعمل بصورة طبيعية'
        ],
        [
            'name' => 'خدمة المصادقة (FreeRADIUS)',
            'status' => ($radiusState === 'active') ? 'pass' : 'fail',
            'value' => "الخدمة " . ($radiusState === 'active' ? 'نشطة 🟢' : 'متوقفة 🔴') . " | {$radiusActiveSessions} جلسة نشطة أونلاين",
            'recommendation' => ($radiusState === 'active') ? 'مصادقة الكروت والراوترات تعمل بنجاح' : 'يرجى فحص freeradius'
        ],
        [
            'name' => 'مساحة القرص الصلب (Server Storage)',
            'status' => $diskStatus,
            'value' => "متبقي {$freeGb} GB من إجمالي {$totalGb} GB ({$diskPercent}% مستخدم)",
            'recommendation' => $diskStatus === 'pass' ? 'المساحة آمنة وكافية' : 'المساحة قاربت على الامتلاء'
        ],
        [
            'name' => 'الذاكرة العشوائية (RAM Memory)',
            'status' => $memStatus,
            'value' => "مستخدم {$usedMemMb} MB من {$totMemMb} MB ({$memPercent}%)",
            'recommendation' => $memStatus === 'pass' ? 'استهلاك الذاكرة طبيعي' : 'استهلاك الذاكرة مرتفع'
        ],
        [
            'name' => 'خادم نفق الراوترات (SSTP VPN)',
            'status' => ($sstpState === 'active') ? 'pass' : 'warn',
            'value' => $sstpState === 'active' ? 'نشط ويعمل 🟢' : ($sstpState ?: 'غير نشط'),
            'recommendation' => ($sstpState === 'active') ? 'أنفاق الراوترات متصلة' : 'تحقق من تشغيل accel-ppp'
        ],
        [
            'name' => 'خدمة واتساب المالك (Port 3388)',
            'status' => $waOk ? 'pass' : 'warn',
            'value' => $waStatusText,
            'recommendation' => $waOk ? 'الخدمة جاهزة لإرسال التنبيهات' : 'تأكد من تشغيل sam-whatsapp.service'
        ],
        [
            'name' => 'مهام الجدولة الدورية (Cron Daemon)',
            'status' => ($cronState === 'active' && count($cronFailures) === 0) ? 'pass' : (count($cronFailures) > 0 ? 'warn' : 'fail'),
            'value' => "حالة Cron: " . ($cronState === 'active' ? 'نشط 🟢' : 'متوقف 🔴') . " (المهام الفاشلة: " . count($cronFailures) . ")",
            'recommendation' => count($cronFailures) === 0 ? 'كافة مهام الصيانة والمزامنة تنفذ بنجاح' : 'توجد مهام واجهت أخطاء'
        ]
    ];

    jsonResponse([
        'success' => true,
        'tests' => $tests,
        'server_time' => date('Y-m-d H:i:s'),
        'php_version' => PHP_VERSION,
        'os' => php_uname('s') . ' ' . php_uname('r'),
        'telemetry' => [
            'api_latency_ms' => $totalLatency,
            'db_latency_ms' => $dbLatency,
            'redis_latency_ms' => $redisLatency,
            'cpu' => [
                'model' => $cpuModel,
                'cores' => $cpuCores,
                'percent' => $cpuPercent,
                'load_avg' => $load,
                'status' => $cpuStatus
            ],
            'ram' => [
                'total_mb' => $totMemMb,
                'used_mb' => $usedMemMb,
                'available_mb' => round($availMem / 1024, 1),
                'percent' => $memPercent,
                'swap_total_mb' => round($swapTot / 1024, 1),
                'swap_used_mb' => round(($swapTot - $swapFree) / 1024, 1),
                'status' => $memStatus
            ],
            'disk' => [
                'total_gb' => $totalGb,
                'free_gb' => $freeGb,
                'used_gb' => $usedGb,
                'percent' => $diskPercent,
                'status' => $diskStatus
            ],
            'php_fpm' => [
                'state' => $phpState,
                'max_children' => $maxChildren,
                'start_servers' => $startServers,
                'workers_count' => count($fpmWorkers),
                'avg_memory_mb' => $fpmAvgMb,
                'total_memory_mb' => $fpmTotalMb,
                'workers' => $fpmWorkers
            ],
            'mariadb' => [
                'state' => $dbOk ? 'active' : 'inactive',
                'version' => $dbVer,
                'threads_connected' => (int)($dbStatus['Threads_connected'] ?? 0),
                'threads_running' => (int)($dbStatus['Threads_running'] ?? 0),
                'questions' => (int)($dbStatus['Questions'] ?? 0),
                'slow_queries' => (int)($dbStatus['Slow_queries'] ?? 0),
                'uptime_seconds' => (int)($dbStatus['Uptime'] ?? 0),
                'latency_ms' => $dbLatency
            ],
            'redis' => [
                'state' => $redisOk ? 'active' : 'inactive',
                'ping' => $redisOk ? 'PONG' : 'FAIL',
                'used_memory_human' => $redisInfo['used_memory_human'] ?? '0B',
                'connected_clients' => (int)($redisInfo['connected_clients'] ?? 0),
                'total_commands' => (int)($redisInfo['total_commands_processed'] ?? 0),
                'latency_ms' => $redisLatency
            ],
            'freeradius' => [
                'state' => $radiusState,
                'active_sessions' => $radiusActiveSessions,
                'today_sessions' => $radiusTodaySessions,
                'total_users' => $radiusTotalUsers
            ],
            'routers' => [
                'sstp_state' => $sstpState,
                'total' => $routersTotal,
                'online' => $routersOnline,
                'offline' => $routersOffline
            ],
            'active_connections' => [
                'radius_sessions' => $radiusActiveSessions,
                'http_conns' => $httpConns,
                'telemetry_conns' => $telemetryConns,
                'sstp_conns' => $sstpConns
            ],
            'cron' => [
                'state' => $cronState,
                'failed_count' => count($cronFailures) + count($dbCronFailures),
                'failed_logs' => array_slice(array_merge($cronFailures, array_map(fn($f) => "[DB Cron {$f['created_at']}] {$f['action_title']}: {$f['details']}", $dbCronFailures)), 0, 10)
            ],
            'processes' => [
                'total_running' => count($processList),
                'items' => $processList
            ],
            'errors' => [
                'count_24h' => $apiErrors24h,
                'count_1h' => $apiErrors1h,
                'recent' => $recentErrorsList
            ],
            'backup' => [
                'last_status' => $lastBackup['status'] ?? 'unknown',
                'last_time' => $lastBackup['created_at'] ?? 'لم ينفذ بعد',
                'last_title' => $lastBackup['action_title'] ?? '-'
            ],
            'alerts' => [
                'overall_status' => count($activeAlerts) === 0 ? 'healthy' : (count(array_filter($activeAlerts, fn($a) => $a['severity'] === 'critical')) > 0 ? 'critical' : 'warning'),
                'active_count' => count($activeAlerts),
                'items' => $activeAlerts,
                'thresholds' => [
                    'cpu_thresh' => $threshCpu,
                    'ram_thresh' => $threshRam,
                    'disk_thresh' => $threshDisk,
                    'latency_thresh' => $threshLatency,
                    'whatsapp_enabled' => $alertWhatsapp,
                    'telegram_enabled' => $alertTelegram
                ]
            ],
            'services' => $servicesList
        ]
    ]);
}

if ($action === 'owner_system_save_alert_settings') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    if (isset($in['cpu_thresh'])) samOwnerSet($db, 'owner_alert_cpu_thresh', (string)(int)$in['cpu_thresh']);
    if (isset($in['ram_thresh'])) samOwnerSet($db, 'owner_alert_ram_thresh', (string)(int)$in['ram_thresh']);
    if (isset($in['disk_thresh'])) samOwnerSet($db, 'owner_alert_disk_thresh', (string)(int)$in['disk_thresh']);
    if (isset($in['latency_thresh'])) samOwnerSet($db, 'owner_alert_latency_thresh', (string)(int)$in['latency_thresh']);
    if (isset($in['whatsapp_enabled'])) samOwnerSet($db, 'owner_alert_whatsapp_enabled', $in['whatsapp_enabled'] ? '1' : '0');
    if (isset($in['telegram_enabled'])) samOwnerSet($db, 'owner_alert_telegram_enabled', $in['telegram_enabled'] ? '1' : '0');
    if (isset($in['phone'])) samOwnerSet($db, 'owner_alert_phone', trim((string)$in['phone']));

    samOwnerLogActivity($db, $service ?? null, 'owner_alert_settings_saved', 'system', 'تحديث إعدادات التنبيهات', 'تم تحديث عتبات التنبيهات وإعدادات الإرسال', 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ حدود وقواعد التنبيهات الذكية بنجاح'
    ]);
}

if ($action === 'owner_system_send_test_alert') {
    if (!function_exists('samOwnerSendWhatsApp')) {
        @require_once __DIR__ . '/system_owner_notifications_api.php';
    }
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $targetPhone = trim((string)($in['phone'] ?? ''));
    if ($targetPhone === '') {
        $targetPhone = samOwnerSetting($db, 'owner_alert_phone', samOwnerSetting($db, 'system_owner_whatsapp_owner_phone', '967770283515'));
    }
    
    $load = sys_getloadavg() ?: [0,0,0];
    $diskFree = @disk_free_space('/');
    $diskTotal = @disk_total_space('/');
    $diskPercent = $diskTotal > 0 ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1) : 0;
    $meminfo = @file_get_contents('/proc/meminfo') ?: '';
    preg_match('/MemTotal:\s+(\d+)/', $meminfo, $mt);
    preg_match('/MemAvailable:\s+(\d+)/', $meminfo, $ma);
    $totMem = (int)($mt[1] ?? 0);
    $availMem = (int)($ma[1] ?? 0);
    $memPercent = $totMem > 0 ? round((($totMem - $availMem) / $totMem) * 100, 1) : 0;
    $radiusSessions = 0;
    try {
        $radiusSessions = (int)$db->query("SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL")->fetchColumn();
    } catch (Throwable $e) {}
    $sysName = samOwnerSetting($db, 'system_name', 'SAM User Manager');

    $msg = "🩺 *تقرير فحص وتنبيهات النظام - {$sysName}*\n"
         . "📅 *التاريخ والوقت:* " . date('Y-m-d H:i:s') . "\n"
         . "━━━━━━━━━━━━━━━━━━━━\n"
         . "⚡ *حمل المعالج CPU:* " . round($load[0], 2) . " (Load Avg)\n"
         . "🧠 *استهلاك الذاكرة RAM:* {$memPercent}%\n"
         . "💾 *مساحة القرص الصلب:* {$diskPercent}%\n"
         . "👥 *الجلسات النشطة أونلاين:* {$radiusSessions} جلسة\n"
         . "⚙️ *معالج PHP-FPM:* نشط 🟢\n"
         . "🗄️ *قاعدة البيانات MariaDB:* متصلة 🟢\n"
         . "⚡ *خادم الكاش Redis:* نشط 🟢\n"
         . "━━━━━━━━━━━━━━━━━━━━\n"
         . "✅ هذا تنبيه تجريبي للتأكد من ربط نظام المراقبة والإشعارات التلقائية بالواتساب وتليجرام.";

    $waRes = ['success' => false, 'error' => 'الواتساب غير مفعل'];
    if (function_exists('samOwnerSendWhatsApp') && !empty($targetPhone)) {
        $waRes = samOwnerSendWhatsApp($db, $targetPhone, $msg);
    }
    
    $tgRes = ['success' => false, 'error' => 'تليجرام غير مفعل'];
    if (function_exists('samOwnerSendTelegram')) {
        $tgRes = samOwnerSendTelegram($db, $msg);
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_test_alert', 'system', 'إرسال تنبيه تجريبي', 'تم إرسال تقرير تشخيصي تجريبي لهاتف المالك', ($waRes['success'] || $tgRes['success']) ? 'success' : 'failed', $currentAdminId);

    jsonResponse([
        'success' => ($waRes['success'] || $tgRes['success']),
        'message' => ($waRes['success'] || $tgRes['success']) ? 'تم إرسال تقرير المراقبة والتنبيهات بنجاح' : ('فشل الإرسال: ' . ($waRes['error'] ?? '') . ' | ' . ($tgRes['error'] ?? '')),
        'whatsapp' => $waRes,
        'telegram' => $tgRes
    ]);
}

if ($action === 'owner_system_kill_process') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $pid = (int)($in['pid'] ?? 0);
    if ($pid <= 1) throw new Exception('معرف العملية (PID) غير صالح');

    $procCheck = shell_exec("ps -p " . $pid . " -o user,comm= 2>/dev/null") ?: '';
    if (empty(trim($procCheck))) throw new Exception('العملية غير موجودة أو توقفت بالفعل');
    
    $cols = preg_split('/\s+/', trim($procCheck));
    $user = $cols[0] ?? '';
    $comm = $cols[1] ?? '';
    
    if (in_array($comm, ['systemd', 'init', 'sshd', 'mariadbd', 'mysqld', 'apache2'], true)) {
        throw new Exception('غير مسموح بإنهاء خدمات النظام الأساسية من خلال هذه الأداة');
    }

    $kCode = -1;
    if (function_exists('posix_kill')) {
        @posix_kill($pid, SIGKILL);
        $kCode = 0;
    } else {
        $cmd = '/usr/bin/sudo -n /bin/kill -9 ' . $pid . ' 2>&1';
        exec($cmd, $kOut, $kCode);
    }
    
    samOwnerLogActivity($db, $service ?? null, 'owner_kill_process', 'system', 'إنهاء عملية عالقة', "تم إنهاء العملية PID {$pid} ({$comm})", $kCode === 0 ? 'success' : 'failed', $currentAdminId);

    jsonResponse([
        'success' => ($kCode === 0),
        'message' => ($kCode === 0) ? "تم إرسال إشارة الإنهاء للعملية {$pid} بنجاح" : "تعذر إنهاء العملية"
    ]);
}

if ($action === 'owner_system_error_logs') {
    $lines = [];
    $logPaths = [
        '/var/log/php8.3-fpm.log',
        '/var/log/apache2/error.log',
        '/var/www/mikrotik-usermanager/error_log'
    ];
    $foundLog = '';
    foreach ($logPaths as $lp) {
        if (is_file($lp) && is_readable($lp)) {
            $foundLog = $lp;
            $raw = shell_exec('tail -n 60 ' . escapeshellarg($lp) . ' 2>/dev/null');
            if ($raw) {
                $lines = explode("\n", trim($raw));
                break;
            }
        }
    }
    jsonResponse([
        'success' => true,
        'log_file' => $foundLog ?: 'No error log readable',
        'lines' => $lines
    ]);
}

if ($action === 'owner_system_get') {
    $disk=@disk_free_space('/'); $total=@disk_total_space('/');
    $load=sys_getloadavg();
    $mem=[]; foreach(@file('/proc/meminfo')?:[] as $line){if(preg_match('/^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+)/',$line,$m))$mem[$m[1]]=(int)$m[2]*1024;}
    $ports=[]; $ss=(string)shell_exec('ss -lntH 2>/dev/null'); foreach(explode("\n",$ss) as $line){$parts=preg_split('/\s+/',trim($line));$addr=$parts[3]??'';if(preg_match('/:(\d+)$/',$addr,$m))$ports[]=(int)$m[1];} $ports=array_values(array_unique($ports));sort($ports);
    $cpu=''; foreach(@file('/proc/cpuinfo')?:[] as $line){if(str_starts_with($line,'model name')){$cpu=trim(explode(':',$line,2)[1]??'');break;}}
    jsonResponse(['success'=>true,'settings'=>[
        'system_name'=>samOwnerSetting($db,'system_name',samOwnerSetting($db,'ui_app_title','SAM - نظام الإدارة الذكي')),
        'system_short_name'=>samOwnerSetting($db,'ui_app_short_title','SAM'),
        'public_domain'=>samOwnerSetting($db,'system_public_domain','http://palapox.ddns.net:8099'),
        'app_port'=>(int)samOwnerSetting($db,'application_port','8099'),
        'contact_phone'=>samOwnerSetting($db,'contact_phone',''),
        'system_address'=>samOwnerSetting($db,'system_address',''),
        'logo_url'=>samOwnerSetting($db,'system_logo_url','assets/img/log.png'),
        'maintenance_mode'=>samOwnerSetting($db,'system_maintenance_mode','0')==='1',
        'primary_color'=>samOwnerSetting($db,'ui_owner_primary_color','#0078d7'),
        'header_color'=>samOwnerSetting($db,'ui_owner_header_color','#1c2b39'),
        'sidebar_color'=>samOwnerSetting($db,'ui_owner_sidebar_color','#22313f'),
        'sidebar_active'=>samOwnerSetting($db,'ui_owner_sidebar_active','#0078d7'),
        'success_color'=>samOwnerSetting($db,'ui_owner_success_color','#10b981'),
        'danger_color'=>samOwnerSetting($db,'ui_owner_danger_color','#ef4444'),
        'system_template'=>samOwnerSetting($db,'ui_owner_system_template','modern_clean'),
        'layout_density'=>samOwnerSetting($db,'ui_owner_layout_density','normal'),
        'table_view_mode'=>samOwnerSetting($db,'ui_owner_table_view_mode','standard')
    ],'resources'=>['hostname'=>gethostname(),'php'=>PHP_VERSION,'load'=>$load,'memory_total'=>$mem['MemTotal']??0,'memory_available'=>$mem['MemAvailable']??0,'swap_total'=>$mem['SwapTotal']??0,'swap_free'=>$mem['SwapFree']??0,'disk_total'=>$total?:0,'disk_free'=>$disk?:0,'uptime'=>trim((string)shell_exec('uptime -p 2>/dev/null')),'cpu'=>$cpu,'listening_ports'=>$ports],'services'=>samOwnerServices(),'factory'=>samOwnerFactoryInfo()]);
}

if($action==='owner_system_build_factory'){
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST;
    $q=$db->prepare('SELECT password_hash FROM um_admins WHERE id=?');$q->execute([$currentAdminId]);
    if(!password_verify((string)($in['password']??''),(string)$q->fetchColumn()))throw new Exception('كلمة مرور مالك النظام غير صحيحة');
    if(($in['confirmation']??'')!=='إنشاء صورة المصنع')throw new Exception('عبارة التأكيد غير صحيحة');
    $info=samOwnerBuildFactory($db);
    if (isset($service) && method_exists($service, 'logActivity')) {
        $service->logActivity('owner_factory_build','security','إنشاء صورة مصنع نظيفة','تم إنشاء صورة مخطط نظيفة مع المالك والإعدادات المرجعية فقط','success',$currentAdminId);
    }
    jsonResponse(['success'=>true,'message'=>'تم إنشاء صورة المصنع النظيفة بنجاح','factory'=>$info]);
}

if($action==='owner_system_factory_reset'){
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST;
    $q=$db->prepare('SELECT password_hash FROM um_admins WHERE id=?');$q->execute([$currentAdminId]);
    if(!password_verify((string)($in['password']??''),(string)$q->fetchColumn()))throw new Exception('كلمة مرور مالك النظام غير صحيحة');
    if(($in['confirmation']??'')!=='إعادة المصنع وحذف البيانات')throw new Exception('عبارة التأكيد غير صحيحة');
    
    // Preventive full backup
    $rs = isset($service) && method_exists($service, 'createDatabaseBackup') ? $service : (new RadiusService($db));
    $backup = $rs->createDatabaseBackup();
    if(empty($backup['success']))throw new Exception($backup['error']??'فشل إنشاء النسخة الاحتياطية الوقائية');
    samOwnerApplyFactory($db);
    $newDb=getDB();$newDb->prepare("INSERT INTO um_activity_logs(admin_id,admin_name,action_type,action_category,action_title,details,status,created_at) VALUES(1,'مالك النظام','owner_factory_reset','security','إعادة المصنع','تم إنشاء نسخة كاملة ثم استعادة صورة المصنع النظيفة','success',NOW())")->execute();
    jsonResponse(['success'=>true,'message'=>'اكتملت إعادة المصنع. تم حفظ نسخة كاملة قبل الحذف.','backup'=>$backup,'services'=>samOwnerServices()]);
}

if($action==='owner_system_maintenance_rebuild'){
    $report=[];$tests=['apache2'=>'/usr/sbin/apache2ctl configtest 2>&1','freeradius'=>'/usr/sbin/freeradius -XC 2>&1'];
    foreach($tests as $unit=>$cmd){exec($cmd,$out,$code);$report[]=['service'=>$unit,'valid'=>$code===0,'output'=>implode("\n",array_slice($out,-8))];$out=[];}
    $port=(int)samOwnerSetting($db,'application_port','8099');
    if($port>=1024&&$port<=65535){exec('/usr/bin/sudo -n /usr/local/sbin/sam-system-control port '.escapeshellarg((string)$port).' 2>&1',$out,$code);$report[]=['service'=>'apache2-port','valid'=>$code===0,'output'=>implode("\n",$out)];}
    $routerCount=0;foreach($db->query('SELECT id FROM nas WHERE id BETWEEN 2 AND 250') as $row){$rr=$service->generateMikrotikScript((int)$row['id']);if(empty($rr['error']))$routerCount++;}
    $report[]=['service'=>'sstp-router-identities','valid'=>true,'output'=>'تمت مطابقة '.$routerCount.' حساب راوتر SSTP من جداول nas/radcheck'];
    foreach(['freeradius','accel-ppp','sam-whatsapp','mikrotik-usermanager-api-worker'] as $unit){exec('/usr/bin/sudo -n /usr/local/sbin/sam-system-control service '.escapeshellarg($unit).' restart 2>&1',$out,$code);$report[]=['service'=>$unit.'-restart','valid'=>$code===0,'output'=>implode("\n",$out)];$out=[];}
    jsonResponse(['success'=>!in_array(false,array_column($report,'valid'),true),'message'=>'اكتملت صيانة وإعادة فحص الخدمات','report'=>$report,'settings_source'=>'um_settings']);
}

if ($action==='owner_system_save') {
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST;
    $name=trim((string)($in['system_name']??$in['network_name']??'')); if($name===''||mb_strlen($name)>120) throw new Exception('اسم النظام / الشبكة غير صالح');
    $shortName=trim((string)($in['system_short_name']??''));
    $phone=trim((string)($in['contact_phone']??$in['phone']??''));
    $address=trim((string)($in['system_address']??$in['address']??''));
    $logoUrl=trim((string)($in['logo_url']??''));
    $domain=rtrim(trim((string)($in['public_domain']??'')),'/');
    if ($domain !== '' && !filter_var($domain,FILTER_VALIDATE_URL)) {
        throw new Exception('رابط الدومين غير صالح ويجب أن يبدأ بـ http أو https');
    }
    $publicHost=$domain!==''?(string)(parse_url($domain,PHP_URL_HOST)?:''):'';

    $saveMap = [
        'system_name'=>$name,
        'organization_name'=>$name,
        'network_name'=>$name,
        'ui_app_title'=>$name,
        'ui_app_short_title'=>$shortName,
        'contact_phone'=>$phone,
        'system_address'=>$address
    ];
    if ($logoUrl !== '') {
        $saveMap['system_logo_url'] = $logoUrl;
        $saveMap['logo_url'] = $logoUrl;
    }
    if ($domain !== '') {
        $saveMap['system_public_domain'] = $domain;
        if ($publicHost !== '') {
            $saveMap['public_server_name'] = $publicHost;
            $saveMap['sstp_server_vpn_host'] = $publicHost;
        }
    }
    if (isset($in['maintenance_mode'])) {
        $saveMap['system_maintenance_mode'] = !empty($in['maintenance_mode']) ? '1' : '0';
    }

    foreach($saveMap as $k=>$v) samOwnerSet($db,$k,$v);

    foreach([
        'primary_color'=>'ui_owner_primary_color',
        'header_color'=>'ui_owner_header_color',
        'sidebar_color'=>'ui_owner_sidebar_color',
        'sidebar_active'=>'ui_owner_sidebar_active',
        'success_color'=>'ui_owner_success_color',
        'danger_color'=>'ui_owner_danger_color',
        'system_template'=>'ui_owner_system_template',
        'layout_density'=>'ui_owner_layout_density',
        'table_view_mode'=>'ui_owner_table_view_mode'
    ] as $src=>$key){
        if(isset($in[$src]) && (string)$in[$src]!==''){
            samOwnerSet($db,$key,(string)$in[$src]);
        }
    }

    // Sync active network row in um_networks
    try {
        $activeNetId = (int)($_SESSION['active_network_id'] ?? 0);
        if ($activeNetId > 0) {
            $db->prepare("UPDATE um_networks SET name = COALESCE(NULLIF(?,''), name), location = COALESCE(NULLIF(?,''), location), logo_url = COALESCE(NULLIF(?,''), logo_url) WHERE id = ?")
               ->execute([$name, $address, $logoUrl, $activeNetId]);

            $pKey = "print_settings_net_{$activeNetId}";
            $rawP = samOwnerSetting($db, $pKey, null);
            $pArr = $rawP ? json_decode($rawP, true) : [];
            if (!is_array($pArr)) $pArr = [];
            $pArr['header_title'] = $name;
            if ($phone !== '') $pArr['phone'] = $phone;
            if ($address !== '') $pArr['address'] = $address;
            if ($logoUrl !== '') $pArr['logo_url'] = $logoUrl;
            samOwnerSet($db, $pKey, json_encode($pArr, JSON_UNESCAPED_UNICODE));
        }
    } catch (Throwable $e) {}

    if (isset($service) && method_exists($service, 'logActivity')) {
        $service->logActivity('owner_system_settings','system','تحديث إعدادات النظام والشبكة','تم تعديل الهوية والدومين والقالب والألوان ورقم التواصل','success',$currentAdminId);
    }
    jsonResponse(['success'=>true,'message'=>'تم حفظ إعدادات الهوية والشبكة والقالب بنجاح ✓']);
}

if ($action==='owner_system_logo') {
    if (empty($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) throw new InvalidArgumentException('لم يتم استلام ملف الشعار');
    if ((int)$_FILES['logo']['size'] > 5 * 1024 * 1024) throw new InvalidArgumentException('حجم الشعار يجب ألا يتجاوز 5MB');
    $raw = file_get_contents($_FILES['logo']['tmp_name']);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($raw);
    $allowed = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
    if (!isset($allowed[$mime]) || !getimagesizefromstring($raw)) throw new InvalidArgumentException('الملف المرفوع يجب أن يكون صورة صحيحة');
    $image = imagecreatefromstring($raw);
    if (!$image) throw new InvalidArgumentException('تعذر قراءة الصورة');
    $sourceW=imagesx($image); $sourceH=imagesy($image); $maxW=775; $maxH=409;
    $scale=min(1.0,$maxW/max(1,$sourceW),$maxH/max(1,$sourceH));
    $targetW=max(1,(int)round($sourceW*$scale)); $targetH=max(1,(int)round($sourceH*$scale));
    if($targetW!==$sourceW||$targetH!==$sourceH){$resized=imagecreatetruecolor($targetW,$targetH);if($mime!=='image/jpeg'){imagealphablending($resized,false);imagesavealpha($resized,true);$tr=imagecolorallocatealpha($resized,0,0,0,127);imagefilledrectangle($resized,0,0,$targetW,$targetH,$tr);}imagecopyresampled($resized,$image,0,0,0,0,$targetW,$targetH,$sourceW,$sourceH);imagedestroy($image);$image=$resized;}
    $dir=__DIR__.'/uploads/system-logos';if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir))throw new RuntimeException('مجلد شعارات النظام غير قابل للإنشاء');
    $activeNetId=(int)($_SESSION['active_network_id']??0);$oldUrls=[];
    $oldGlobal=samOwnerSetting($db,'system_logo_url','');if($oldGlobal)$oldUrls[]=$oldGlobal;
    if($activeNetId>0){$q=$db->prepare('SELECT logo_url FROM um_networks WHERE id=?');$q->execute([$activeNetId]);$oldNet=(string)$q->fetchColumn();if($oldNet)$oldUrls[]=$oldNet;}
    $filename='network-logo-'.($currentAdminId??1).'-'.bin2hex(random_bytes(6)).'.'.$allowed[$mime];$dest=$dir.'/'.$filename;
    $saved=$mime==='image/jpeg'?imagejpeg($image,$dest,90):($mime==='image/png'?imagepng($image,$dest,6):imagewebp($image,$dest,90));imagedestroy($image);if(!$saved)throw new RuntimeException('تعذر حفظ الشعار');chmod($dest,0644);
    $logoUrl='uploads/system-logos/'.$filename;
    samOwnerSet($db,'system_logo_url',$logoUrl);samOwnerSet($db,'logo_url',$logoUrl);
    if($activeNetId>0){$db->prepare('UPDATE um_networks SET logo_url=? WHERE id=?')->execute([$logoUrl,$activeNetId]);$pKey="print_settings_net_{$activeNetId}";$rawP=samOwnerSetting($db,$pKey,'');$pArr=$rawP?json_decode($rawP,true):[];if(!is_array($pArr))$pArr=[];$pArr['logo_url']=$logoUrl;samOwnerSet($db,$pKey,json_encode($pArr,JSON_UNESCAPED_UNICODE));}
    foreach(array_unique($oldUrls) as $oldUrl){$oldUrl=ltrim((string)$oldUrl,'/');if(str_starts_with($oldUrl,'uploads/system-logos/')&&$oldUrl!==$logoUrl){$oldPath=__DIR__.'/'.$oldUrl;if(is_file($oldPath))@unlink($oldPath);}}
    jsonResponse(['success'=>true,'message'=>'تم رفع وتحجيم وتحديث شعار الشبكة وحذف الشعار السابق ✓','logo_url'=>$logoUrl,'width'=>$targetW,'height'=>$targetH]);
}
if(in_array($action,['owner_system_install_service','owner_system_install_service_status'],true)) {
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'استخدم POST'],405);
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST;$op=$action==='owner_system_install_service'?'install':'status';$value=(string)($in[$op==='install'?'unit':'job_id']??'');
    $cmd='/usr/bin/sudo -n /usr/local/sbin/sam-system-control service-manager '.escapeshellarg($op).' '.escapeshellarg($value).' 2>&1';exec($cmd,$out,$code);$r=json_decode(implode("\n",$out),true);
    if(!is_array($r))$r=['success'=>false,'error'=>'أداة تثبيت المتطلبات غير مهيأة. شغّل tools/service-manager/bootstrap.sh بصلاحية root على هذا السيرفر.'];
    if($op==='install')samOwnerLogActivity($db,$service,'owner_install_service','system','تثبيت متطلبات '.$value,$r['message']??$r['error']??'تم طلب التثبيت',!empty($r['success'])?'success':'failed',$currentAdminId);
    jsonResponse($r);
}
if ($action==='owner_system_service') {
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'استخدم POST لإدارة الخدمات'],405);
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST;$unit=(string)($in['unit']??'');$op=(string)($in['operation']??'');
    $allowed=['apache2','freeradius','mariadb','accel-ppp','sam-telemetry','sam-whatsapp','mikrotik-whatsapp','mikrotik-usermanager-api-worker','redis-server','cron','php'.PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION.'-fpm'];
    if(!in_array($unit,$allowed,true)||!in_array($op,['start','stop','restart'],true))throw new Exception('عملية خدمة غير مسموحة');
    if($unit==='apache2'&&$op==='stop')throw new Exception('لا يمكن إيقاف واجهة النظام من داخلها');
    $out=[];exec('/usr/bin/sudo -n /usr/local/sbin/sam-system-control service '.escapeshellarg($unit).' '.escapeshellarg($op).' 2>&1',$out,$code);
    $state=trim((string)shell_exec('/bin/systemctl is-active '.escapeshellarg($unit).' 2>/dev/null'));$verified=$code===0&&($op==='stop'?in_array($state,['inactive','failed'],true):$state==='active');
    samOwnerLogActivity($db,$service,'owner_service_'.$op,'system','إدارة خدمة '.$unit,'الحالة بعد العملية: '.$state,$verified?'success':'failed',$currentAdminId);
    jsonResponse(['success'=>$verified,'message'=>$verified?'تم تنفيذ العملية والتحقق من الحالة الفعلية':'لم تصل الخدمة إلى الحالة المطلوبة: '.$state,'state'=>$state,'services'=>samOwnerServices(),'output'=>implode("\n",$out)]);
}

if ($action==='owner_system_port') {
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST; $port=(int)($in['port']??0);
    if(($in['confirmation']??'')!=='تغيير المنفذ') throw new Exception('اكتب عبارة التأكيد: تغيير المنفذ');
    if($port<1024||$port>65535||in_array($port,[3306,1812,1813],true)) throw new Exception('رقم المنفذ غير مسموح');
    exec('/usr/bin/sudo -n /usr/local/sbin/sam-system-control port '.escapeshellarg((string)$port).' 2>&1',$out,$code);
    if($code!==0) throw new Exception('فشل تغيير المنفذ: '.implode(' ',$out)); samOwnerSet($db,'application_port',(string)$port);
    jsonResponse(['success'=>true,'message'=>'تم تغيير منفذ النظام إلى '.$port.'. افتح الرابط على المنفذ الجديد.']);
}

if ($action==='owner_system_reset_ui') {
    $in=json_decode(file_get_contents('php://input'),true)?:$_POST; if(($in['confirmation']??'')!=='استعادة إعدادات الواجهات') throw new Exception('عبارة التأكيد غير صحيحة');
    $db->beginTransaction(); $db->exec('DELETE FROM um_admin_ui_settings'); $db->exec('DELETE FROM um_ui_default_layouts'); $db->exec("DELETE FROM um_settings WHERE setting_key LIKE 'ui_%'"); $db->commit();
    $service->logActivity('owner_reset_ui','system','استعادة إعدادات الواجهات','حذف تخصيصات الواجهات فقط دون البيانات التشغيلية','success',$currentAdminId);
    jsonResponse(['success'=>true,'message'=>'تمت استعادة إعدادات الواجهات الافتراضية دون حذف البيانات']);
}

if ($action === 'owner_system_jobs') {
    $stats = $db->query("SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) as queued,
        SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
        FROM um_api_jobs")->fetch(PDO::FETCH_ASSOC);

    $stmt = $db->query("SELECT j.*, a.username as owner_username, a.fullname as owner_fullname 
        FROM um_api_jobs j 
        LEFT JOIN um_admins a ON a.id = j.created_by 
        ORDER BY j.created_at DESC LIMIT 50");
    $jobs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($jobs as &$job) {
        $job['payload'] = json_decode((string)($job['payload'] ?? '{}'), true);
        $job['result'] = json_decode((string)($job['result'] ?? '{}'), true);
    }
    jsonResponse([
        'success' => true,
        'stats' => [
            'total' => (int)($stats['total'] ?? 0),
            'queued' => (int)($stats['queued'] ?? 0),
            'running' => (int)($stats['running'] ?? 0),
            'completed' => (int)($stats['completed'] ?? 0),
            'failed' => (int)($stats['failed'] ?? 0),
        ],
        'jobs' => $jobs
    ]);
}

if ($action === 'owner_system_job_retry') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = trim((string)($in['job_id'] ?? ''));
    if ($id === '') throw new Exception('معرف المهمة مطلوب');
    $stmt = $db->prepare("UPDATE um_api_jobs SET status='queued', progress=0, attempts=0, error_message=NULL, started_at=NULL, finished_at=NULL WHERE id=?");
    $stmt->execute([$id]);
    jsonResponse(['success' => true, 'message' => 'تمت إعادة جدولة المهمة بنجاح']);
}

if ($action === 'owner_system_job_purge') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $mode = (string)($in['mode'] ?? 'completed_failed');
    if ($mode === 'single') {
        $id = trim((string)($in['job_id'] ?? ''));
        $stmt = $db->prepare("DELETE FROM um_api_jobs WHERE id=?");
        $stmt->execute([$id]);
    } else {
        $stmt = $db->query("DELETE FROM um_api_jobs WHERE status IN ('completed', 'failed')");
    }
    jsonResponse(['success' => true, 'message' => 'تم تنظيف المهام المحددة بنجاح']);
}

if ($action === 'owner_system_logs') {
    $target = (string)($_GET['target'] ?? 'worker');
    $lines = min(200, max(10, (int)($_GET['lines'] ?? 50)));
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control logs ' . escapeshellarg($target) . ' ' . $lines . ' 2>&1';
    exec($cmd, $out, $code);
    jsonResponse([
        'success' => true,
        'target' => $target,
        'lines' => $lines,
        'log' => implode("\n", $out)
    ]);
}

function samOwnerParseUfwRules(string $raw): array {
    $rules = [];
    $lines = explode("\n", $raw);
    $pattern = '/^\s*\[\s*(\d+)\]\s+([^\s]+(?:\s+\(v6\))?)\s+([A-Z]+(?:\s+[A-Z]+)?)\s+([^\s#]+(?:\s+\(v6\))?)(?:\s+#\s*(.*))?$/';
    
    foreach ($lines as $line) {
        $line = trim($line);
        if (preg_match($pattern, $line, $m)) {
            $to = trim($m[2]);
            $action = trim($m[3]);
            $from = trim($m[4]);
            $comment = trim($m[5] ?? '');
            $isV6 = str_contains($to, '(v6)') || str_contains($from, '(v6)');
            $isSsh = (str_starts_with($to, '22/') || $to === '22' || stripos($comment, 'ssh') !== false);
            $rules[] = [
                'num' => (int)$m[1],
                'to' => $to,
                'action' => $action,
                'from' => $from,
                'comment' => $comment,
                'is_v6' => $isV6,
                'is_ssh' => $isSsh
            ];
        }
    }

    if (empty($rules) && strpos($raw, '=== SHOW ADDED ===') !== false) {
        $addedPart = explode('=== SHOW ADDED ===', $raw, 2)[1] ?? '';
        $pseudoNum = 1;
        foreach (explode("\n", $addedPart) as $line) {
            $line = trim($line);
            if (!str_starts_with($line, 'ufw ')) continue;
            $comment = '';
            if (preg_match("/comment\s+['\"]?([^'\"]+)['\"]?/", $line, $cm)) {
                $comment = trim($cm[1]);
            }
            $action = str_contains($line, 'deny') ? 'DENY IN' : 'ALLOW IN';
            $from = 'Anywhere';
            $to = 'Anywhere';
            if (preg_match('/from\s+([^\s]+)/', $line, $fm)) {
                $from = trim($fm[1]);
            }
            if (preg_match('/port\s+(\d+(?::\d+)?)(?:\s+proto\s+(\w+))?/', $line, $pm)) {
                $to = $pm[1] . (isset($pm[2]) && $pm[2] !== 'any' ? '/' . $pm[2] : '');
            } elseif (preg_match('/(?:allow|deny)\s+([0-9]+(?:\/[a-z0-9]+)?)/', $line, $pm2)) {
                $to = $pm2[1];
            }
            $isSsh = (str_starts_with($to, '22/') || $to === '22' || stripos($comment, 'ssh') !== false);
            $rules[] = [
                'num' => $pseudoNum++,
                'to' => $to,
                'action' => $action,
                'from' => $from,
                'comment' => $comment,
                'is_v6' => false,
                'is_ssh' => $isSsh
            ];
        }
    }

    return $rules;
}

function samGetCountryFlagEmoji(string $code): string {
    $code = strtoupper(trim($code));
    if (strlen($code) !== 2 || !ctype_alpha($code)) return '🌐';
    $first = 0x1F1E6 + ord($code[0]) - ord('A');
    $second = 0x1F1E6 + ord($code[1]) - ord('A');
    return mb_chr($first, 'UTF-8') . mb_chr($second, 'UTF-8');
}

function samOwnerLookupGeoIp(string $ip): array {
    $ip = trim($ip);
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        throw new Exception('عنوان IPv4 غير صالح أو غير مدعوم');
    }

    $long = ip2long($ip);
    $uLong = sprintf('%u', $long);

    $isPrivate = false;
    $privateType = '';
    if ($ip === '127.0.0.1' || str_starts_with($ip, '127.')) {
        $isPrivate = true;
        $privateType = 'الخادم المحلي (Loopback)';
    } elseif (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        $isPrivate = true;
        if (str_starts_with($ip, '192.168.')) $privateType = 'شبكة محلية خاصة (LAN 192.168.x.x)';
        elseif (str_starts_with($ip, '10.')) $privateType = 'نطاق داخلي / نفق VPN (10.x.x.x)';
        elseif (str_starts_with($ip, '172.')) $privateType = 'نطاق شبكة خاصة (Private 172.16-31.x.x)';
        else $privateType = 'عنوان شبكة محلي أو محجوز';
    }

    if ($isPrivate) {
        return [
            'ip' => $ip,
            'is_private' => true,
            'private_type' => $privateType,
            'country_code' => 'LAN',
            'country_name' => 'شبكة داخلية خاصة',
            'flag' => '🏠',
            'continent' => 'محلي',
            'network' => $ip . '/32',
            'asn' => 'LOCAL',
            'as_name' => $privateType,
            'as_domain' => 'local'
        ];
    }

    $dbCandidates = [
        '/var/lib/mikrotik-usermanager/sam_geoip.db',
        '/var/www/mikrotik-usermanager/sam_geoip.db',
        'D:\\hsn\\data\\sam_geoip.db',
        __DIR__ . '/sam_geoip.db'
    ];

    $foundDb = null;
    foreach ($dbCandidates as $candidate) {
        if (file_exists($candidate)) {
            $foundDb = $candidate;
            break;
        }
    }

    if (!$foundDb) {
        return [
            'ip' => $ip,
            'is_private' => false,
            'country_code' => '??',
            'country_name' => 'غير محدد (قاعدة GeoIP غير موجودة بالمسار)',
            'flag' => '🌐',
            'continent' => '-',
            'network' => '-',
            'asn' => '-',
            'as_name' => 'GeoIP Database not loaded',
            'as_domain' => ''
        ];
    }

    try {
        $sqlite = new PDO('sqlite:' . $foundDb, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
        $stmt = $sqlite->prepare("SELECT country_code, country_name, network, asn, as_name, as_domain, continent_name, start_int, end_int 
                                  FROM sam_geoip 
                                  WHERE start_int <= :ip_int 
                                  ORDER BY start_int DESC LIMIT 1");
        $stmt->execute([':ip_int' => $uLong]);
        $row = $stmt->fetch();

        if ($row && $uLong <= (int)$row['end_int']) {
            return [
                'ip' => $ip,
                'is_private' => false,
                'country_code' => $row['country_code'] ?: '??',
                'country_name' => $row['country_name'] ?: 'غير معروف',
                'flag' => samGetCountryFlagEmoji($row['country_code'] ?: ''),
                'continent' => $row['continent_name'] ?: '-',
                'network' => $row['network'] ?: '-',
                'asn' => $row['asn'] ?: '-',
                'as_name' => $row['as_name'] ?: '-',
                'as_domain' => $row['as_domain'] ?: ''
            ];
        }
    } catch (Throwable $e) {
        return [
            'ip' => $ip,
            'is_private' => false,
            'country_code' => '??',
            'country_name' => 'خطأ أثناء الاستعلام: ' . $e->getMessage(),
            'flag' => '⚠️',
            'continent' => '-',
            'network' => '-',
            'asn' => '-',
            'as_name' => 'Database Error',
            'as_domain' => ''
        ];
    }

    return [
        'ip' => $ip,
        'is_private' => false,
        'country_code' => '??',
        'country_name' => 'غير موجود في قاعدة البيانات',
        'flag' => '🌐',
        'continent' => '-',
        'network' => '-',
        'asn' => '-',
        'as_name' => 'Unknown Provider',
        'as_domain' => ''
    ];
}

require_once __DIR__ . '/includes/PortForwardingRuntime.php';

function samOwnerApplyGeoRules(PDO $db): array {
    $stmt = $db->query("SELECT * FROM um_firewall_geo_rules WHERE is_enabled = 1 ORDER BY priority DESC, id ASC");
    $rules = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    if (empty($rules)) {
        $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control geo-rule clear 2>&1';
        exec($cmd, $out, $code);
        return [
            'code' => $code,
            'output' => implode("\n", $out),
            'active_count' => 0
        ];
    }

    $dbCandidates = [
        '/var/lib/mikrotik-usermanager/sam_geoip.db',
        '/var/www/mikrotik-usermanager/sam_geoip.db',
        'D:\\hsn\\data\\sam_geoip.db',
        __DIR__ . '/sam_geoip.db'
    ];
    $foundDb = null;
    foreach ($dbCandidates as $candidate) {
        if (file_exists($candidate)) {
            $foundDb = $candidate;
            break;
        }
    }

    $sqlite = null;
    if ($foundDb) {
        try {
            $sqlite = new PDO('sqlite:' . $foundDb, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
        } catch (Throwable $e) {
            $sqlite = null;
        }
    }

    $restoreLines = [];
    $confLines = [];

    foreach ($rules as $r) {
        $id = (int)$r['id'];
        $type = $r['rule_type'];
        $val = trim($r['target_value']);
        $action = strtolower($r['action']) === 'allow' ? 'allow' : 'deny';
        $prio = strtolower($r['priority']) === 'high' ? 'high' : 'normal';
        $port = trim($r['port']) ?: 'all';
        $proto = strtolower($r['protocol']) ?: 'all';
        $ipVer = strtolower($r['ip_version'] ?? 'both');
        if (!in_array($ipVer, ['v4', 'v6', 'both'], true)) $ipVer = 'both';

        $v4Cidrs = [];
        $v6Cidrs = [];

        if ($type === 'country' && $sqlite) {
            $countryCode = strtoupper($val);
            $q = $sqlite->prepare("SELECT network, ip_type FROM sam_geoip WHERE country_code = ?");
            $q->execute([$countryCode]);
            while ($row = $q->fetch()) {
                $net = trim($row['network']);
                if (!$net || $net === '-') continue;
                if ($row['ip_type'] === 'IPv6') {
                    $v6Cidrs[] = $net;
                } else {
                    $v4Cidrs[] = $net;
                }
            }
        } elseif ($type === 'asn' && $sqlite) {
            $cleanAsnNum = preg_replace('/[^0-9]/', '', $val);
            $asnFormatted = 'AS' . $cleanAsnNum;
            $q = $sqlite->prepare("SELECT network, ip_type FROM sam_geoip WHERE asn = ? OR asn = ?");
            $q->execute([$asnFormatted, $val]);
            while ($row = $q->fetch()) {
                $net = trim($row['network']);
                if (!$net || $net === '-') continue;
                if ($row['ip_type'] === 'IPv6') {
                    $v6Cidrs[] = $net;
                } else {
                    $v4Cidrs[] = $net;
                }
            }
        } elseif ($type === 'local') {
            $localKey = strtolower($val);
            if ($localKey === 'lan' || str_contains($localKey, '192.168.3.')) {
                $v4Cidrs[] = '192.168.3.0/24';
            } elseif ($localKey === 'sstp' || str_contains($localKey, '10.10.')) {
                $v4Cidrs[] = '10.10.0.0/16';
            } elseif ($localKey === 'loopback' || $localKey === '127') {
                $v4Cidrs[] = '127.0.0.0/8';
                $v6Cidrs[] = '::1/128';
            } elseif ($localKey === 'rfc1918' || $localKey === 'private') {
                $v4Cidrs = array_merge($v4Cidrs, ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']);
                $v6Cidrs = array_merge($v6Cidrs, ['fc00::/7', 'fe80::/10']);
            } else {
                $v4Cidrs = array_merge($v4Cidrs, ['192.168.3.0/24', '10.10.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8']);
                $v6Cidrs = array_merge($v6Cidrs, ['::1/128', 'fc00::/7', 'fe80::/10']);
            }
        } elseif ($type === 'custom') {
            $rawList = preg_split('/[\r\n,;\s]+/', $val);
            foreach ($rawList as $c) {
                $c = trim($c);
                if (!$c) continue;
                if (!str_contains($c, '/')) {
                    $c .= (str_contains($c, ':') ? '/128' : '/32');
                }
                if (str_contains($c, ':')) {
                    $v6Cidrs[] = $c;
                } else {
                    $v4Cidrs[] = $c;
                }
            }
        }

        $v4Cidrs = array_unique($v4Cidrs);
        $v6Cidrs = array_unique($v6Cidrs);

        $setV4Name = 'none';
        $setV6Name = 'none';

        if (($ipVer === 'v4' || $ipVer === 'both') && !empty($v4Cidrs)) {
            $setV4Name = "sam_geo_{$id}_v4";
            $maxElem = max(65536, count($v4Cidrs) + 1000);
            $restoreLines[] = "create {$setV4Name} hash:net family inet hashsize 16384 maxelem {$maxElem} -exist";
            foreach ($v4Cidrs as $cidr) {
                $restoreLines[] = "add {$setV4Name} {$cidr} -exist";
            }
        }

        if (($ipVer === 'v6' || $ipVer === 'both') && !empty($v6Cidrs)) {
            $setV6Name = "sam_geo_{$id}_v6";
            $maxElem = max(65536, count($v6Cidrs) + 1000);
            $restoreLines[] = "create {$setV6Name} hash:net family inet6 hashsize 16384 maxelem {$maxElem} -exist";
            foreach ($v6Cidrs as $cidr) {
                $restoreLines[] = "add {$setV6Name} {$cidr} -exist";
            }
        }

        if ($setV4Name !== 'none' || $setV6Name !== 'none') {
            $confLines[] = "{$id} {$action} {$prio} {$port} {$proto} {$ipVer} {$setV4Name} {$setV6Name}";
        }
    }

    $tmpDir = sys_get_temp_dir();
    $restoreFile = $tmpDir . '/sam_geo_sets.restore';
    $confFile = $tmpDir . '/sam_geo_rules.conf';

    file_put_contents($restoreFile, implode("\n", $restoreLines) . "\n");
    file_put_contents($confFile, implode("\n", $confLines) . "\n");

    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control geo-rule apply ' . escapeshellarg($restoreFile) . ' ' . escapeshellarg($confFile) . ' 2>&1';
    exec($cmd, $out, $code);

    return [
        'code' => $code,
        'output' => implode("\n", $out),
        'active_count' => count($confLines)
    ];
}

if ($action === 'owner_system_firewall') {
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw status 2>&1';
    exec($cmd, $out, $code);
    $raw = implode("\n", $out);
    $active = stripos($raw, 'Status: active') !== false;
    $rules = samOwnerParseUfwRules($raw);

    $v6Cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw ipv6-status 2>&1';
    exec($v6Cmd, $v6Out);
    $ipv6Enabled = stripos(implode("\n", $v6Out), 'IPV6=yes') !== false;

    $geoCount = 0;
    try {
        $geoStmt = $db->query("SELECT COUNT(*) FROM um_firewall_geo_rules WHERE is_enabled = 1");
        $geoCount = (int)($geoStmt ? $geoStmt->fetchColumn() : 0);
    } catch (Throwable $ignored) {}

    jsonResponse([
        'success' => true,
        'active' => $active,
        'ipv6_enabled' => $ipv6Enabled,
        'geo_rules_count' => $geoCount,
        'rules' => $rules,
        'raw' => $raw,
        'default_ports' => [
            ['port' => '80/tcp', 'label' => 'Web HTTP', 'status' => 'allowed'],
            ['port' => '443/tcp', 'label' => 'Web HTTPS', 'status' => 'allowed'],
            ['port' => '8099/tcp', 'label' => 'Web Custom Port', 'status' => 'allowed'],
            ['port' => '4406/tcp', 'label' => 'SSTP VPN Concentrator', 'status' => 'allowed'],
            ['port' => '1812/udp', 'label' => 'FreeRADIUS Authentication', 'status' => 'allowed'],
            ['port' => '1813/udp', 'label' => 'FreeRADIUS Accounting', 'status' => 'allowed'],
            ['port' => '3799/udp', 'label' => 'FreeRADIUS CoA / Disconnect', 'status' => 'allowed'],
            ['port' => '8088/tcp', 'label' => 'Live Telemetry WebSocket', 'status' => 'allowed'],
            ['port' => '3388/tcp', 'label' => 'WhatsApp Gateway', 'status' => 'allowed'],
            ['port' => '22/tcp', 'label' => 'SSH Remote Access', 'status' => 'allowed']
        ]
    ]);
}

if ($action === 'owner_system_firewall_add_rule') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $port = trim((string)($in['port'] ?? ''));
    $proto = strtolower(trim((string)($in['protocol'] ?? 'tcp')));
    $fromIp = trim((string)($in['from_ip'] ?? ''));
    $comment = trim((string)($in['comment'] ?? ''));
    $ipVersion = strtolower(trim((string)($in['ip_version'] ?? 'both')));

    if (!preg_match('/^[0-9]+(:[0-9]+)?$/', $port)) {
        throw new Exception('رقم المنفذ غير صحيح (مثال: 8099 أو 60000:61000)');
    }
    if (!in_array($proto, ['tcp', 'udp', 'any'], true)) {
        throw new Exception('نوع البروتوكول غير صحيح');
    }
    if ($fromIp !== '' && !in_array(strtolower($fromIp), ['any', 'anywhere', '0.0.0.0/0', '::/0'], true)) {
        if (!preg_match('/^[0-9a-fA-F.:\/]+$/', $fromIp)) {
            throw new Exception('عنوان IP أو قناع الشبكة (CIDR) غير صحيح');
        }
    } else {
        if ($ipVersion === 'v4') {
            $fromIp = '0.0.0.0/0';
        } elseif ($ipVersion === 'v6') {
            $fromIp = '::/0';
        } else {
            $fromIp = 'any';
        }
    }

    $cleanComment = preg_replace('/[\'"`$\\\]/u', '', $comment);
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw allow ' . escapeshellarg($port) . ' ' . escapeshellarg($proto) . ' ' . escapeshellarg($fromIp) . ' ' . escapeshellarg($cleanComment) . ' 2>&1';
    exec($cmd, $out, $code);

    if ($code !== 0) {
        throw new Exception('فشلت إضافة القاعدة: ' . implode(' ', $out));
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_add', 'security', 'إضافة قاعدة جدار ناري', "منفذ: $port, بروتوكول: $proto, آيبي: $fromIp, نسخة: $ipVersion, وصف: $comment", 'success', $currentAdminId);
    jsonResponse(['success' => true, 'message' => 'تمت إضافة وسماح القاعدة بنجاح!', 'output' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_delete_rule') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $num = (int)($in['num'] ?? 0);
    $isSsh = !empty($in['is_ssh']);
    $to = trim((string)($in['to'] ?? ''));

    if ($num <= 0) throw new Exception('رقم القاعدة غير صحيح');

    if ($isSsh || str_starts_with($to, '22/') || $to === '22') {
        $statusCmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw status 2>&1';
        exec($statusCmd, $statusOut);
        $rules = samOwnerParseUfwRules(implode("\n", $statusOut));
        $sshRules = array_filter($rules, fn($r) => !empty($r['is_ssh']) && str_contains($r['action'], 'ALLOW'));
        if (count($sshRules) <= 1) {
            throw new Exception('🔒 لا يمكن حذف قاعدة منفذ SSH (22) لضمان عدم قفل اتصالك بالسيرفر.');
        }
    }

    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw delete-num ' . $num . ' 2>&1';
    exec($cmd, $out, $code);

    if ($code !== 0) {
        throw new Exception('فشل حذف القاعدة: ' . implode(' ', $out));
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_del', 'security', 'حذف قاعدة جدار ناري', "رقم القاعدة: $num, الهدف: $to", 'success', $currentAdminId);
    jsonResponse(['success' => true, 'message' => 'تم حذف القاعدة بنجاح', 'output' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_ban_ip') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $ip = trim((string)($in['ip'] ?? ''));
    $comment = trim((string)($in['comment'] ?? 'حظر IP مشبوه'));

    if (!preg_match('/^[0-9a-fA-F.:\/]+$/', $ip) || strlen($ip) < 7) {
        throw new Exception('عنوان IP أو قناع الشبكة غير صالح');
    }
    if (in_array($ip, ['127.0.0.1', '::1', 'localhost'], true)) {
        throw new Exception('لا يمكن حظر الخادم المحلي (Loopback)');
    }

    $cleanComment = preg_replace('/[\'"`$\\\]/u', '', $comment);
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw deny-ip ' . escapeshellarg($ip) . ' ' . escapeshellarg($cleanComment) . ' 2>&1';
    exec($cmd, $out, $code);

    if ($code !== 0) {
        throw new Exception('فشل حظر الآي بي: ' . implode(' ', $out));
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_ban', 'security', 'حظر عنوان IP في الجدار الناري', "IP: $ip, وصف: $comment", 'success', $currentAdminId);
    jsonResponse(['success' => true, 'message' => 'تم حظر العنوان ' . $ip . ' فورياً في مقدمة الجدار الناري.', 'output' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_defaults') {
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw defaults 2>&1';
    exec($cmd, $out, $code);
    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_defaults', 'security', 'تطبيق قواعد الجدار الناري الافتراضية', implode("\n", $out), $code === 0 ? 'success' : 'failed', $currentAdminId);
    jsonResponse(['success' => $code === 0, 'message' => 'تم تطبيق كافة القواعد الافتراضية لمنظومة SAM بنجاح', 'output' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_toggle') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $enable = !empty($in['enable']);
    $op = $enable ? 'enable' : 'disable';
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw ' . $op . ' 2>&1';
    exec($cmd, $out, $code);
    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_' . $op, 'security', 'تعديل الجدار الناري', implode("\n", $out), $code === 0 ? 'success' : 'failed', $currentAdminId);
    jsonResponse(['success' => $code === 0, 'message' => $enable ? 'تم تفعيل الجدار الناري بنجاح' : 'تم تعطيل الجدار الناري', 'output' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_ipv6_status') {
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw ipv6-status 2>&1';
    exec($cmd, $out, $code);
    $enabled = stripos(implode("\n", $out), 'IPV6=yes') !== false;
    jsonResponse(['success' => true, 'ipv6_enabled' => $enabled, 'raw' => implode("\n", $out)]);
}

if ($action === 'owner_system_firewall_ipv6_toggle') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $enable = !empty($in['enable']);
    $op = $enable ? 'enable' : 'disable';
    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control ufw ipv6-toggle ' . $op . ' 2>&1';
    exec($cmd, $out, $code);
    samOwnerLogActivity($db, $service ?? null, 'owner_firewall_ipv6_' . $op, 'security', ($enable ? 'تفعيل' : 'تعطيل') . ' بروتوكول IPv6 في جدار الحماية', implode("\n", $out), $code === 0 ? 'success' : 'failed', $currentAdminId);
    jsonResponse(['success' => $code === 0, 'message' => $enable ? 'تم تفعيل بروتوكول IPv6 بنجاح' : 'تم تعطيل بروتوكول IPv6 بنجاح', 'output' => implode("\n", $out), 'ipv6_enabled' => $enable]);
}

if ($action === 'owner_system_port_forwarding') {
    $stmt = $db->query("SELECT * FROM um_port_forwarding ORDER BY id DESC");
    $list = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $cmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control port-forward list 2>&1';
    exec($cmd, $out, $code);

    jsonResponse([
        'success' => true,
        'forwards' => $list,
        'active_iptables' => implode("\n", $out),
        'reserved_ports' => [22, 8099, 3306, 1812, 1813, 3799, 4406, 8088, 3388]
    ]);
}

if ($action === 'owner_system_port_forwarding_save') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $listenPort = (int)($in['listen_port'] ?? 0);
    $protocol = strtolower(trim((string)($in['protocol'] ?? 'tcp')));
    $targetIp = trim((string)($in['target_ip'] ?? ''));
    $targetPort = (int)($in['target_port'] ?? 0);
    $comment = trim((string)($in['comment'] ?? ''));
    $isEnabled = isset($in['is_enabled']) ? (int)!empty($in['is_enabled']) : 1;

    if ($listenPort < 1 || $listenPort > 65535) {
        throw new Exception('منفذ الاستماع الخارجي (Listen Port) غير صحيح. يجب أن يكون بين 1 و 65535');
    }
    if ($targetPort < 1 || $targetPort > 65535) {
        throw new Exception('منفذ الهدف الداخلي (Target Port) غير صحيح. يجب أن يكون بين 1 و 65535');
    }
    if (!filter_var($targetIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        throw new Exception('عنوان IP الهدف (Target IP) غير صالح');
    }
    if (!in_array($protocol, ['tcp', 'udp', 'both'], true)) {
        throw new Exception('نوع البروتوكول غير صحيح (يجب أن يكون TCP أو UDP أو كلاهما)');
    }

    $reservedPorts = [
        22 => 'SSH Remote Access',
        8099 => 'منفذ لوحة تحكم النظام الحالية',
        3306 => 'خادم قاعدة البيانات MySQL/MariaDB',
        1812 => 'FreeRADIUS Authentication',
        1813 => 'FreeRADIUS Accounting',
        3799 => 'FreeRADIUS CoA / Disconnect',
        4406 => 'مجمّع نفق SSTP VPN',
        8088 => 'بث التليمتري الحي WebSocket',
        3388 => 'بوابة واتساب الذكية'
    ];

    if (isset($reservedPorts[$listenPort])) {
        throw new Exception("🔒 لا يمكن توجيه المنفذ {$listenPort} لأنه محجوز لخدمة حيوية بالنظام ({$reservedPorts[$listenPort]}) لمنع انقطاع الاتصال.");
    }

    // Check conflict
    $chkStmt = $db->prepare("SELECT id FROM um_port_forwarding WHERE listen_port = ? AND (protocol = ? OR protocol = 'both' OR ? = 'both') AND id != ?");
    $chkStmt->execute([$listenPort, $protocol, $protocol, $id]);
    if ($chkStmt->fetch()) {
        throw new Exception("يوجد بالفعل توجيه نشط أو مسجل للمنفذ {$listenPort} لنفس البروتوكول");
    }

    [$id,$applyRes] = samPortForwardTransaction($db, function() use ($db,$id,$listenPort,$protocol,$targetIp,$targetPort,$comment,$isEnabled) {
    if ($id > 0) {
        $stmt = $db->prepare("UPDATE um_port_forwarding SET listen_port = ?, protocol = ?, target_ip = ?, target_port = ?, comment = ?, is_enabled = ? WHERE id = ?");
        $stmt->execute([$listenPort, $protocol, $targetIp, $targetPort, $comment, $isEnabled, $id]);
    } else {
        $stmt = $db->prepare("INSERT INTO um_port_forwarding (listen_port, protocol, target_ip, target_port, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$listenPort, $protocol, $targetIp, $targetPort, $comment, $isEnabled]);
        $id = (int)$db->lastInsertId();
    }

    $applyRes = samOwnerApplyPortForwarding($db);
        return [$id,$applyRes];
    });
    samOwnerLogActivity($db, $service ?? null, 'owner_port_forward_save', 'firewall', 'حفظ توجيه منفذ', "منفذ {$listenPort}/{$protocol} -> {$targetIp}:{$targetPort} ({$comment})", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ وتطبيق توجيه المنفذ بنجاح في نواة النظام وجدار الحماية!',
        'id' => $id,
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_port_forwarding_toggle') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $enable = !empty($in['enable']) ? 1 : 0;

    if ($id <= 0) throw new Exception('معرف التوجيه غير صحيح');

    $applyRes = samPortForwardTransaction($db, function() use ($db,$id,$enable) {
    $stmt = $db->prepare("UPDATE um_port_forwarding SET is_enabled = ? WHERE id = ?");
    $stmt->execute([$enable, $id]);

    $applyRes = samOwnerApplyPortForwarding($db);
        return $applyRes;
    });
    samOwnerLogActivity($db, $service ?? null, 'owner_port_forward_toggle', 'firewall', ($enable ? 'تفعيل' : 'تعطيل') . ' توجيه منفذ', "معرف التوجيه: {$id}", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => $enable ? 'تم تفعيل التوجيه بنجاح' : 'تم تعطيل التوجيه بنجاح',
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_port_forwarding_delete') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);

    if ($id <= 0) throw new Exception('معرف التوجيه غير صحيح');

    $applyRes = samPortForwardTransaction($db, function() use ($db,$id) {
    $delStmt = $db->prepare("DELETE FROM um_port_forwarding WHERE id = ?");
    $delStmt->execute([$id]);

    $applyRes = samOwnerApplyPortForwarding($db);
        return $applyRes;
    });
    samOwnerLogActivity($db, $service ?? null, 'owner_port_forward_del', 'firewall', 'حذف توجيه منفذ', "معرف التوجيه: {$id}", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حذف قاعدة توجيه المنفذ وتحديث إعدادات NAT بنجاح',
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_geo_rules') {
    $stmt = $db->query("SELECT * FROM um_firewall_geo_rules ORDER BY priority DESC, id ASC");
    $list = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $listCmd = '/usr/bin/sudo -n /usr/local/sbin/sam-system-control geo-rule list 2>&1';
    exec($listCmd, $listOut);

    $presetCountries = [
        ['code' => 'YE', 'name_ar' => 'اليمن', 'name_en' => 'Yemen', 'flag' => '🇾🇪'],
        ['code' => 'SA', 'name_ar' => 'المملكة العربية السعودية', 'name_en' => 'Saudi Arabia', 'flag' => '🇸🇦'],
        ['code' => 'EG', 'name_ar' => 'جمهورية مصر العربية', 'name_en' => 'Egypt', 'flag' => '🇪🇬'],
        ['code' => 'AE', 'name_ar' => 'الإمارات العربية المتحدة', 'name_en' => 'United Arab Emirates', 'flag' => '🇦🇪'],
        ['code' => 'OM', 'name_ar' => 'سلطنة عُمان', 'name_en' => 'Oman', 'flag' => '🇴🇲'],
        ['code' => 'JO', 'name_ar' => 'المملكة الأردنية الهاشمية', 'name_en' => 'Jordan', 'flag' => '🇯🇴'],
        ['code' => 'US', 'name_ar' => 'الولايات المتحدة الأمريكية', 'name_en' => 'United States', 'flag' => '🇺🇸'],
        ['code' => 'CN', 'name_ar' => 'الصين', 'name_en' => 'China', 'flag' => '🇨🇳'],
        ['code' => 'RU', 'name_ar' => 'روسيا الاتحادية', 'name_en' => 'Russia', 'flag' => '🇷🇺'],
        ['code' => 'DE', 'name_ar' => 'ألمانيا', 'name_en' => 'Germany', 'flag' => '🇩🇪'],
        ['code' => 'GB', 'name_ar' => 'المملكة المتحدة (بريطانيا)', 'name_en' => 'United Kingdom', 'flag' => '🇬🇧'],
        ['code' => 'TR', 'name_ar' => 'تركيا', 'name_en' => 'Turkey', 'flag' => '🇹🇷'],
        ['code' => 'IN', 'name_ar' => 'الهند', 'name_en' => 'India', 'flag' => '🇮🇳'],
        ['code' => 'FR', 'name_ar' => 'فرنسا', 'name_en' => 'France', 'flag' => '🇫🇷'],
        ['code' => 'NL', 'name_ar' => 'هولندا', 'name_en' => 'Netherlands', 'flag' => '🇳🇱'],
        ['code' => 'IR', 'name_ar' => 'إيران', 'name_en' => 'Iran', 'flag' => '🇮🇷'],
        ['code' => 'IL', 'name_ar' => 'الكيان الصهيوني', 'name_en' => 'Israel', 'flag' => '🇮🇱'],
        ['code' => 'BR', 'name_ar' => 'البرازيل', 'name_en' => 'Brazil', 'flag' => '🇧🇷'],
        ['code' => 'SG', 'name_ar' => 'سنغافورة', 'name_en' => 'Singapore', 'flag' => '🇸🇬'],
        ['code' => 'CA', 'name_ar' => 'كندا', 'name_en' => 'Canada', 'flag' => '🇨🇦']
    ];

    $presetAsns = [
        ['asn' => 'AS30873', 'name' => 'يمن نت - المؤسسة العامة للاتصالات (YemenNet PTC)', 'country' => 'YE', 'badge' => '🇾🇪 YemenNet'],
        ['asn' => 'AS204317', 'name' => 'عدن نت - الاتصالات وتقنية المعلومات (AdenNet)', 'country' => 'YE', 'badge' => '🇾🇪 AdenNet'],
        ['asn' => 'AS12486', 'name' => 'تيليمن - الشركة اليمنية للاتصالات الدولية (TeleYemen)', 'country' => 'YE', 'badge' => '🇾🇪 TeleYemen'],
        ['asn' => 'AS37497', 'name' => 'سبأفون - الهاتف النقال (Sabafon)', 'country' => 'YE', 'badge' => '🇾🇪 Sabafon'],
        ['asn' => 'AS37521', 'name' => 'يو - الشركة العمانية اليمنية للاتصالات (YOU / MTN)', 'country' => 'YE', 'badge' => '🇾🇪 YOU Telecom'],
        ['asn' => 'AS37092', 'name' => 'يمن موبايل للهاتف النقال (Yemen Mobile)', 'country' => 'YE', 'badge' => '🇾🇪 Yemen Mobile'],
        ['asn' => 'AS13335', 'name' => 'كلاود فلير - حماية وشبكة توزيع (Cloudflare CDN)', 'country' => 'US', 'badge' => '☁️ Cloudflare'],
        ['asn' => 'AS15169', 'name' => 'جوجل - شبكة وخدمات جوجل السحابية (Google LLC)', 'country' => 'US', 'badge' => '🔍 Google'],
        ['asn' => 'AS8075', 'name' => 'مايكروسوفت - أزور والحوسبة السحابية (Microsoft Azure)', 'country' => 'US', 'badge' => '🪟 Microsoft'],
        ['asn' => 'AS16509', 'name' => 'أمازون - خدمات الحوسبة السحابية (Amazon AWS)', 'country' => 'US', 'badge' => '📦 Amazon AWS'],
        ['asn' => 'AS62041', 'name' => 'تليجرام ماسنجر (Telegram Messenger Inc)', 'country' => 'AE', 'badge' => '✈️ Telegram'],
        ['asn' => 'AS32934', 'name' => 'ميتا - فيسبوك وإنستغرام وواتساب (Meta Platforms)', 'country' => 'US', 'badge' => '💬 Meta/Facebook'],
        ['asn' => 'AS20940', 'name' => 'أكاماي تكنولوجيز (Akamai Technologies)', 'country' => 'NL', 'badge' => '⚡ Akamai CDN'],
        ['asn' => 'AS54113', 'name' => 'فاستلي لخدمات المحتوى (Fastly Inc)', 'country' => 'US', 'badge' => '🛡️ Fastly']
    ];

    $presetLocals = [
        ['key' => 'lan', 'label' => 'الشبكة المحلية الخاصة بالسيرفر (LAN 192.168.3.0/24)', 'badge' => '🏠 Server LAN'],
        ['key' => 'sstp', 'label' => 'شبكة نفق راوترات الميكروتك (SSTP VPN 10.10.0.0/16)', 'badge' => '🛡️ SSTP Concentrator'],
        ['key' => 'rfc1918', 'label' => 'كافة الشبكات الخاصة القياسية (RFC1918: 10/8, 172.16/12, 192.168/16)', 'badge' => '🌐 All Private RFC1918'],
        ['key' => 'loopback', 'label' => 'الخادم المحلي الداخلي (Loopback 127.0.0.1, ::1)', 'badge' => '🔄 Loopback'],
        ['key' => 'all', 'label' => 'جميع النطاقات والشبكات المحلية والأنفاق معاً', 'badge' => '🏠 All Local & VPN']
    ];

    jsonResponse([
        'success' => true,
        'rules' => $list,
        'active_count' => count(array_filter($list, fn($r) => (int)$r['is_enabled'] === 1)),
        'kernel_status' => implode("\n", $listOut),
        'preset_countries' => $presetCountries,
        'preset_asns' => $presetAsns,
        'preset_locals' => $presetLocals
    ]);
}

if ($action === 'owner_system_geo_rule_save') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $ruleType = strtolower(trim((string)($in['rule_type'] ?? 'country')));
    $targetValue = trim((string)($in['target_value'] ?? ''));
    $targetLabel = trim((string)($in['target_label'] ?? ''));
    $ruleAction = strtolower(trim((string)($in['action'] ?? 'deny'))) === 'allow' ? 'allow' : 'deny';
    $port = trim((string)($in['port'] ?? 'all'));
    $protocol = strtolower(trim((string)($in['protocol'] ?? 'all')));
    $ipVersion = strtolower(trim((string)($in['ip_version'] ?? 'both')));
    $priority = strtolower(trim((string)($in['priority'] ?? 'high'))) === 'normal' ? 'normal' : 'high';
    $comment = trim((string)($in['comment'] ?? ''));
    $isEnabled = isset($in['is_enabled']) ? (int)!empty($in['is_enabled']) : 1;

    if (!in_array($ruleType, ['country', 'asn', 'local', 'custom'], true)) {
        throw new Exception('نوع قاعدة الحماية غير صالح');
    }
    if ($targetValue === '') {
        throw new Exception('يرجى تحديد الهدف أو إدخال القيمة المطلوبة');
    }
    if ($port !== 'all' && !preg_match('/^[0-9]+(:[0-9]+)?$/', $port)) {
        throw new Exception('رقم المنفذ غير صحيح (مثال: all أو 8099)');
    }
    if (!in_array($protocol, ['all', 'tcp', 'udp'], true)) {
        throw new Exception('نوع البروتوكول غير صحيح');
    }
    if (!in_array($ipVersion, ['v4', 'v6', 'both'], true)) {
        $ipVersion = 'both';
    }

    if ($targetLabel === '') {
        $targetLabel = $targetValue;
    }

    if ($id > 0) {
        $stmt = $db->prepare("UPDATE um_firewall_geo_rules SET rule_type=?, target_value=?, target_label=?, action=?, port=?, protocol=?, ip_version=?, priority=?, comment=?, is_enabled=? WHERE id=?");
        $stmt->execute([$ruleType, $targetValue, $targetLabel, $ruleAction, $port, $protocol, $ipVersion, $priority, $comment, $isEnabled, $id]);
    } else {
        $stmt = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$ruleType, $targetValue, $targetLabel, $ruleAction, $port, $protocol, $ipVersion, $priority, $comment, $isEnabled]);
        $id = (int)$db->lastInsertId();
    }

    $applyRes = samOwnerApplyGeoRules($db);
    samOwnerLogActivity($db, $service ?? null, 'owner_geo_rule_save', 'firewall', 'حفظ وتطبيق قاعدة حماية جغرافية/مؤسسية', "النوع: $ruleType, الهدف: $targetLabel, الإجراء: $ruleAction, الأسبقية: $priority", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حفظ وتطبيق قاعدة الحماية الجغرافية/المؤسسية في نواة النظام بنجاح!',
        'id' => $id,
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_geo_rule_toggle') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);
    $enable = !empty($in['enable']) ? 1 : 0;

    if ($id <= 0) throw new Exception('معرف القاعدة غير صحيح');

    $stmt = $db->prepare("UPDATE um_firewall_geo_rules SET is_enabled = ? WHERE id = ?");
    $stmt->execute([$enable, $id]);

    $applyRes = samOwnerApplyGeoRules($db);
    samOwnerLogActivity($db, $service ?? null, 'owner_geo_rule_toggle', 'firewall', ($enable ? 'تفعيل' : 'تعطيل') . ' قاعدة حماية جغرافية', "معرف القاعدة: $id", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => $enable ? 'تم تفعيل القاعدة وتطبيقها بنجاح' : 'تم تعطيل القاعدة بنجاح',
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_geo_rule_delete') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $id = (int)($in['id'] ?? 0);

    if ($id <= 0) throw new Exception('معرف القاعدة غير صحيح');

    $delStmt = $db->prepare("DELETE FROM um_firewall_geo_rules WHERE id = ?");
    $delStmt->execute([$id]);

    $applyRes = samOwnerApplyGeoRules($db);
    samOwnerLogActivity($db, $service ?? null, 'owner_geo_rule_del', 'firewall', 'حذف قاعدة حماية جغرافية', "معرف القاعدة: $id", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => 'تم حذف القاعدة وتحديث نواة النظام بنجاح',
        'apply_result' => $applyRes
    ]);
}

if ($action === 'owner_system_geoip_lookup') {
    $ip = trim((string)($_GET['ip'] ?? $_POST['ip'] ?? ''));
    if ($ip === '') {
        throw new Exception('الرجاء إدخال عنوان IP للفحص');
    }
    $info = samOwnerLookupGeoIp($ip);
    jsonResponse([
        'success' => true,
        'data' => $info
    ]);
}

if ($action === 'owner_system_armor_preset') {
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $preset = trim((string)($in['preset'] ?? ''));

    if ($preset === 'owner_gateway_local') {
        $db->exec("DELETE FROM um_firewall_geo_rules WHERE port = '8099'");
        
        $stmt1 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt1->execute(['local', 'all', '🏠 كافة الشبكات المحلية ونفق الراوترات (LAN & SSTP VPN)', 'allow', '8099', 'tcp', 'both', 'high', 'درع حماية بوابة المالك: سماح بالوصول المحلي فقط', 1]);

        $stmt2 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt2->execute(['custom', '0.0.0.0/0', '🌐 كافة عناوين الإنترنت الخارجية (Global Internet)', 'deny', '8099', 'tcp', 'both', 'normal', 'درع حماية بوابة المالك: حظر كافة المصادر الخارجية عن منفذ 8099', 1]);

        $applyRes = samOwnerApplyGeoRules($db);
        samOwnerLogActivity($db, $service ?? null, 'owner_armor_preset', 'firewall', 'تطبيق درع حماية بوابة المالك (تقييد محلي)', 'حصر المنفذ 8099 على الشبكة المحلية ونفق SSTP وحظر الإنترنت الخارجي', 'success', $currentAdminId);

        jsonResponse([
            'success' => true,
            'message' => '🛡️ تم تحصين بوابة مالك النظام بنجاح! تم حصر المنفذ 8099 على الشبكة المحلية وأنفاق الراوترات وحظر الوصول الخارجي.',
            'apply_result' => $applyRes
        ]);
    } elseif ($preset === 'owner_gateway_yemen') {
        $db->exec("DELETE FROM um_firewall_geo_rules WHERE port = '8099'");

        $stmt1 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt1->execute(['local', 'all', '🏠 كافة الشبكات المحلية ونفق الراوترات (LAN & SSTP VPN)', 'allow', '8099', 'tcp', 'both', 'high', 'درع حماية بوابة المالك: سماح بالوصول المحلي', 1]);

        $stmt2 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt2->execute(['country', 'YE', '🇾🇪 الجمهورية اليمنية (Yemen)', 'allow', '8099', 'tcp', 'both', 'high', 'درع حماية بوابة المالك: سماح بالنطاق الجغرافي لليمن ومزوداتها', 1]);

        $stmt3 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt3->execute(['custom', '0.0.0.0/0', '🌐 باقي دول العالم والإنترنت الخارجي (International Scanners)', 'deny', '8099', 'tcp', 'both', 'normal', 'درع حماية بوابة المالك: حظر كافة المصادر الدولية عن منفذ 8099', 1]);

        $applyRes = samOwnerApplyGeoRules($db);
        samOwnerLogActivity($db, $service ?? null, 'owner_armor_preset', 'firewall', 'تطبيق درع حماية بوابة المالك (حصر باليمن)', 'حصر المنفذ 8099 على نطاق اليمن والشبكات المحلية وحظر الدول الأخرى', 'success', $currentAdminId);

        jsonResponse([
            'success' => true,
            'message' => '🛡️ تم تحصين بوابة المالك بحصرها على نطاق اليمن والشبكات المحلية وحظر الهجمات الدولية!',
            'apply_result' => $applyRes
        ]);
    } elseif ($preset === 'telemetry_shield') {
        $db->exec("DELETE FROM um_firewall_geo_rules WHERE port = '8088'");

        $stmt1 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt1->execute(['local', 'all', '🏠 الشبكات المحلية ونفق الراوترات (LAN & SSTP VPN)', 'allow', '8088', 'tcp', 'both', 'high', 'حصر خدمة التليمتري والبث الحي محلياً', 1]);

        $stmt2 = $db->prepare("INSERT INTO um_firewall_geo_rules (rule_type, target_value, target_label, action, port, protocol, ip_version, priority, comment, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt2->execute(['custom', '0.0.0.0/0', '🌐 كافة عناوين الإنترنت الخارجية (Global Internet)', 'deny', '8088', 'tcp', 'both', 'normal', 'حظر الوصول الخارجي غير المصرح به لمنفذ التليمتري 8088', 1]);

        $applyRes = samOwnerApplyGeoRules($db);
        jsonResponse([
            'success' => true,
            'message' => '🛡️ تم تحصين منفذ البث والتليمتري 8088 وحصره على الشبكات المحلية والأنفاق فقط.',
            'apply_result' => $applyRes
        ]);
    } else {
        throw new Exception('نوع درع الحماية غير معروف');
    }
}

// =========================================================================
// SOVEREIGN MASTER FINANCIAL & ACCOUNTING SUITE FOR SYSTEM OWNER
// =========================================================================

if ($action === 'owner_get_master_finance_summary') {
    $reqNet = $_GET['network_id'] ?? 'all';
    $netFilter = ($reqNet !== 'all' && (int)$reqNet > 0) ? "WHERE network_id = " . (int)$reqNet : "";
    $netJoinFilter = ($reqNet !== 'all' && (int)$reqNet > 0) ? "WHERE n.id = " . (int)$reqNet : "";

    // 1. Total Sales from um_card_sales
    $salesSql = "SELECT 
                    COALESCE(SUM(sale_price), 0) as total_sales,
                    COALESCE(SUM(CASE WHEN DATE(sold_at) = CURDATE() THEN sale_price ELSE 0 END), 0) as today_sales,
                    COALESCE(SUM(CASE WHEN sold_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN sale_price ELSE 0 END), 0) as month_sales,
                    COUNT(*) as total_cards_sold
                 FROM um_card_sales $netFilter";
    $salesStats = $db->query($salesSql)->fetch(PDO::FETCH_ASSOC) ?: [];

    // 2. Total Expenses / Payments from um_financial_vouchers
    $expSql = "SELECT 
                  COALESCE(SUM(amount), 0) as total_expenses,
                  COALESCE(SUM(CASE WHEN voucher_date = CURDATE() THEN amount ELSE 0 END), 0) as today_expenses,
                  COALESCE(SUM(CASE WHEN voucher_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) as month_expenses,
                  COUNT(*) as total_expense_vouchers
               FROM um_financial_vouchers " . ($reqNet !== 'all' && (int)$reqNet > 0 ? "WHERE network_id = " . (int)$reqNet . " AND voucher_type = 'payment' AND is_posted = 1" : "WHERE voucher_type = 'payment' AND is_posted = 1");
    $expStats = $db->query($expSql)->fetch(PDO::FETCH_ASSOC) ?: [];

    // 3. Total Receipts from um_financial_vouchers
    $recSql = "SELECT 
                  COALESCE(SUM(amount), 0) as total_receipts,
                  COALESCE(SUM(CASE WHEN voucher_date = CURDATE() THEN amount ELSE 0 END), 0) as today_receipts
               FROM um_financial_vouchers " . ($reqNet !== 'all' && (int)$reqNet > 0 ? "WHERE network_id = " . (int)$reqNet . " AND voucher_type = 'receipt' AND is_posted = 1" : "WHERE voucher_type = 'receipt' AND is_posted = 1");
    $recStats = $db->query($recSql)->fetch(PDO::FETCH_ASSOC) ?: [];

    // 4. Total Cashbox balances
    $cashboxSql = "SELECT 
                      COALESCE(SUM(cashbox_impact), 0) as total_cashbox_balance,
                      COALESCE(SUM(CASE WHEN cashbox_impact > 0 AND DATE(created_at) = CURDATE() THEN cashbox_impact ELSE 0 END), 0) as today_cash_in,
                      COALESCE(SUM(CASE WHEN cashbox_impact < 0 AND DATE(created_at) = CURDATE() THEN ABS(cashbox_impact) ELSE 0 END), 0) as today_cash_out
                   FROM um_financial_transactions $netFilter";
    $cashStats = $db->query($cashboxSql)->fetch(PDO::FETCH_ASSOC) ?: [];

    // 5. Total Distributor Receivables / Debts
    $debtsSql = "SELECT 
                    COALESCE(SUM(CASE WHEN b.balance > 0 THEN b.balance ELSE 0 END), 0) as total_distributor_debts,
                    COALESCE(SUM(CASE WHEN b.balance < 0 THEN ABS(b.balance) ELSE 0 END), 0) as total_distributor_credits,
                    COUNT(DISTINCT b.admin_id) as total_distributors_count
                 FROM um_admin_network_balances b
                 JOIN um_admins a ON a.id = b.admin_id
                 WHERE a.is_active = 1 " . ($reqNet !== 'all' && (int)$reqNet > 0 ? "AND b.network_id = " . (int)$reqNet : "");
    $debtStats = $db->query($debtsSql)->fetch(PDO::FETCH_ASSOC) ?: [];

    // 6. Network-by-Network Financial Breakdown
    $networksBreakdownSql = "
        SELECT 
            n.id as network_id,
            n.name as network_name,
            n.code as network_code,
            COALESCE(n.currency_code, 'YER') as currency_code,
            n.is_active,
            COALESCE(s.total_sales, 0) as total_sales,
            COALESCE(s.today_sales, 0) as today_sales,
            COALESCE(s.cards_count, 0) as cards_count,
            COALESCE(e.total_expenses, 0) as total_expenses,
            COALESCE(e.today_expenses, 0) as today_expenses,
            (COALESCE(s.total_sales, 0) - COALESCE(e.total_expenses, 0)) as net_profit,
            COALESCE(c.cashbox_balance, 0) as cashbox_balance,
            COALESCE(d.total_debts, 0) as distributor_debts
        FROM um_networks n
        LEFT JOIN (
            SELECT network_id, SUM(sale_price) as total_sales,
                   SUM(CASE WHEN DATE(sold_at) = CURDATE() THEN sale_price ELSE 0 END) as today_sales,
                   COUNT(*) as cards_count
            FROM um_card_sales GROUP BY network_id
        ) s ON s.network_id = n.id
        LEFT JOIN (
            SELECT network_id, SUM(amount) as total_expenses,
                   SUM(CASE WHEN voucher_date = CURDATE() THEN amount ELSE 0 END) as today_expenses
            FROM um_financial_vouchers WHERE voucher_type = 'payment' AND is_posted = 1 GROUP BY network_id
        ) e ON e.network_id = n.id
        LEFT JOIN (
            SELECT network_id, SUM(cashbox_impact) as cashbox_balance
            FROM um_financial_transactions GROUP BY network_id
        ) c ON c.network_id = n.id
        LEFT JOIN (
            SELECT network_id, SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) as total_debts
            FROM um_admin_network_balances GROUP BY network_id
        ) d ON d.network_id = n.id
        $netJoinFilter
        ORDER BY n.id ASC
    ";
    $networksBreakdown = $db->query($networksBreakdownSql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // 7. Recent Transactions Across All Networks
    $recentTxSql = "
        SELECT t.*, n.name as network_name, n.code as network_code, a.fullname as creator_name
        FROM um_financial_transactions t
        LEFT JOIN um_networks n ON t.network_id = n.id
        LEFT JOIN um_admins a ON t.created_by = a.id
        $netFilter
        ORDER BY t.id DESC
        LIMIT 25
    ";
    $recentTx = $db->query($recentTxSql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // 8. Networks List for Selector
    $networksList = $db->query("SELECT id, name, code, is_active FROM um_networks ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $totalSales = (float)($salesStats['total_sales'] ?? 0);
    $totalExpenses = (float)($expStats['total_expenses'] ?? 0);
    $netProfit = $totalSales - $totalExpenses;

    jsonResponse([
        'success' => true,
        'filter_network_id' => $reqNet,
        'kpis' => [
            'total_sales' => $totalSales,
            'today_sales' => (float)($salesStats['today_sales'] ?? 0),
            'month_sales' => (float)($salesStats['month_sales'] ?? 0),
            'total_cards_sold' => (int)($salesStats['total_cards_sold'] ?? 0),
            'total_expenses' => $totalExpenses,
            'today_expenses' => (float)($expStats['today_expenses'] ?? 0),
            'month_expenses' => (float)($expStats['month_expenses'] ?? 0),
            'total_receipts' => (float)($recStats['total_receipts'] ?? 0),
            'today_receipts' => (float)($recStats['today_receipts'] ?? 0),
            'net_profit' => $netProfit,
            'total_cashbox_balance' => (float)($cashStats['total_cashbox_balance'] ?? 0),
            'today_cash_in' => (float)($cashStats['today_cash_in'] ?? 0),
            'today_cash_out' => (float)($cashStats['today_cash_out'] ?? 0),
            'total_distributor_debts' => (float)($debtStats['total_distributor_debts'] ?? 0),
            'total_distributors_count' => (int)($debtStats['total_distributors_count'] ?? 0),
            'networks_count' => count($networksList)
        ],
        'networks_breakdown' => $networksBreakdown,
        'recent_transactions' => $recentTx,
        'networks' => $networksList
    ]);
}

if ($action === 'owner_get_master_chart_of_accounts') {
    $reqNet = $_GET['network_id'] ?? 'all';
    $where = ["c.is_active = 1"];
    $params = [];
    if ($reqNet !== 'all' && (int)$reqNet > 0) {
        $where[] = "c.network_id = ?";
        $params[] = (int)$reqNet;
    }
    $whereSql = implode(' AND ', $where);

    $sql = "
        SELECT c.*, 
               p.name_ar as parent_name,
               adm.fullname as linked_admin_name,
               adm.username as linked_admin_username,
               adm.role as linked_admin_role,
               net.name as network_name,
               net.code as network_code,
               (SELECT COUNT(*) FROM um_chart_of_accounts ch WHERE ch.network_id = c.network_id AND ch.parent_id = c.id) as children_count
        FROM um_chart_of_accounts c
        LEFT JOIN um_chart_of_accounts p ON c.parent_id = p.id
        LEFT JOIN um_admins adm ON c.linked_admin_id = adm.id
        LEFT JOIN um_networks net ON c.network_id = net.id
        WHERE $whereSql
        ORDER BY c.network_id ASC, c.account_code ASC
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Recalculate dynamic balance from posted journal lines
    $balSql = "
        SELECT l.account_id, l.network_id,
               COALESCE(SUM(l.debit), 0) as total_debit, 
               COALESCE(SUM(l.credit), 0) as total_credit
        FROM um_journal_entry_lines l
        JOIN um_journal_entries e ON l.journal_entry_id = e.id
        WHERE e.is_posted = 1 " . ($reqNet !== 'all' && (int)$reqNet > 0 ? "AND l.network_id = " . (int)$reqNet : "") . "
        GROUP BY l.account_id, l.network_id
    ";
    $balRows = $db->query($balSql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $balancesMap = [];
    foreach ($balRows as $b) {
        $balancesMap[$b['network_id'] . '_' . $b['account_id']] = [
            'debit' => (float)$b['total_debit'],
            'credit' => (float)$b['total_credit']
        ];
    }

    foreach ($accounts as &$a) {
        $key = ($a['network_id'] ?? 0) . '_' . $a['id'];
        $deb = $balancesMap[$key]['debit'] ?? 0;
        $crd = $balancesMap[$key]['credit'] ?? 0;
        $isDebitNature = in_array($a['account_type'], ['asset', 'expense']);
        $a['calculated_balance'] = $isDebitNature ? ($deb - $crd) : ($crd - $deb);
        $a['balance'] = $a['calculated_balance'];
        $a['total_debit'] = $deb;
        $a['total_credit'] = $crd;
        $a['debit_credit_nature'] = $isDebitNature ? 'debit' : 'credit';
        $a['code'] = $a['account_code'];
        $a['name'] = $a['name_ar'];
        $a['is_leaf'] = ((int)$a['children_count'] === 0) ? 1 : 0;
    }
    unset($a);

    $networksList = $db->query("SELECT id, name, code FROM um_networks ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];

    jsonResponse([
        'success' => true,
        'filter_network_id' => $reqNet,
        'accounts' => $accounts,
        'networks' => $networksList
    ]);
}

if ($action === 'owner_get_master_vouchers') {
    $reqNet = $_GET['network_id'] ?? 'all';
    $type = trim((string)($_GET['type'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $cat = trim((string)($_GET['category'] ?? ''));
    $pm = trim((string)($_GET['payment_method'] ?? ''));
    $sDate = trim((string)($_GET['start_date'] ?? ''));
    $eDate = trim((string)($_GET['end_date'] ?? ''));
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    $where = ["1=1"];
    $params = [];

    if ($reqNet !== 'all' && (int)$reqNet > 0) {
        $where[] = "v.network_id = ?";
        $params[] = (int)$reqNet;
    }
    if ($type !== '' && $type !== 'all') {
        $where[] = "v.voucher_type = ?";
        $params[] = $type;
    }
    if ($cat !== '' && $cat !== 'all') {
        $where[] = "v.category = ?";
        $params[] = $cat;
    }
    if ($pm !== '' && $pm !== 'all') {
        $where[] = "v.payment_method = ?";
        $params[] = $pm;
    }
    if ($sDate !== '') {
        $where[] = "v.voucher_date >= ?";
        $params[] = $sDate;
    }
    if ($eDate !== '') {
        $where[] = "v.voucher_date <= ?";
        $params[] = $eDate;
    }
    if ($search !== '') {
        $where[] = "(v.voucher_no LIKE ? OR v.party_name LIKE ? OR v.description LIKE ? OR v.notes LIKE ?)";
        $s = '%' . $search . '%';
        $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s;
    }

    $whereSql = implode(' AND ', $where);

    // Summary query
    $sumSql = "
        SELECT 
            COUNT(*) as total_records,
            COALESCE(SUM(CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END), 0) as total_receipts,
            COALESCE(SUM(CASE WHEN v.voucher_type = 'payment' THEN v.amount ELSE 0 END), 0) as total_payments,
            (COALESCE(SUM(CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN v.voucher_type = 'payment' THEN v.amount ELSE 0 END), 0)) as net_cashflow
        FROM um_financial_vouchers v
        WHERE $whereSql
    ";
    $sumStmt = $db->prepare($sumSql);
    $sumStmt->execute($params);
    $summary = $sumStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    // Vouchers list query
    $listSql = "
        SELECT v.*, 
               net.name as network_name, 
               net.code as network_code,
               a.fullname as created_by_name,
               c.name_ar as account_name,
               c.account_code,
               cc.name as cost_center_name
        FROM um_financial_vouchers v
        LEFT JOIN um_networks net ON v.network_id = net.id
        LEFT JOIN um_admins a ON v.created_by = a.id
        LEFT JOIN um_chart_of_accounts c ON v.account_id = c.id
        LEFT JOIN um_cost_centers cc ON v.cost_center_id = cc.id
        WHERE $whereSql
        ORDER BY v.voucher_date DESC, v.id DESC
        LIMIT $limit OFFSET $offset
    ";
    $listStmt = $db->prepare($listSql);
    $listStmt->execute($params);
    $vouchers = $listStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $networksList = $db->query("SELECT id, name, code FROM um_networks ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];

    jsonResponse([
        'success' => true,
        'vouchers' => $vouchers,
        'data' => $vouchers,
        'summary' => $summary,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => (int)($summary['total_records'] ?? 0),
            'total_pages' => ceil(((int)($summary['total_records'] ?? 0)) / $limit)
        ],
        'networks' => $networksList
    ]);
}

if ($action === 'owner_get_master_journal_entries') {
    $reqNet = $_GET['network_id'] ?? 'all';
    $search = trim((string)($_GET['search'] ?? ''));
    $sDate = trim((string)($_GET['start_date'] ?? ''));
    $eDate = trim((string)($_GET['end_date'] ?? ''));
    $source = trim((string)($_GET['source_module'] ?? ''));
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    $where = ["1=1"];
    $params = [];

    if ($reqNet !== 'all' && (int)$reqNet > 0) {
        $where[] = "e.network_id = ?";
        $params[] = (int)$reqNet;
    }
    if ($sDate !== '') {
        $where[] = "e.entry_date >= ?";
        $params[] = $sDate;
    }
    if ($eDate !== '') {
        $where[] = "e.entry_date <= ?";
        $params[] = $eDate;
    }
    if ($source !== '' && $source !== 'all') {
        $where[] = "e.source_module = ?";
        $params[] = $source;
    }
    if ($search !== '') {
        $where[] = "(e.entry_no LIKE ? OR e.description LIKE ? OR e.reference_no LIKE ?)";
        $s = '%' . $search . '%';
        $params[] = $s; $params[] = $s; $params[] = $s;
    }

    $whereSql = implode(' AND ', $where);

    $sql = "
        SELECT e.*, 
               net.name as network_name, 
               net.code as network_code,
               a.fullname as creator_name
        FROM um_journal_entries e
        LEFT JOIN um_networks net ON e.network_id = net.id
        LEFT JOIN um_admins a ON e.created_by = a.id
        WHERE $whereSql
        ORDER BY e.entry_date DESC, e.id DESC
        LIMIT $limit OFFSET $offset
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $entries = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Fetch lines for each entry
    if (!empty($entries)) {
        $entryIds = array_column($entries, 'id');
        $inPlaceholders = implode(',', array_fill(0, count($entryIds), '?'));
        $linesSql = "
            SELECT l.*, c.account_code, c.name_ar as account_name, c.account_type,
                   cc.name as cost_center_name
            FROM um_journal_entry_lines l
            JOIN um_chart_of_accounts c ON l.account_id = c.id
            LEFT JOIN um_cost_centers cc ON l.cost_center_id = cc.id
            WHERE l.journal_entry_id IN ($inPlaceholders)
            ORDER BY l.journal_entry_id ASC, l.line_index ASC
        ";
        $linesStmt = $db->prepare($linesSql);
        $linesStmt->execute($entryIds);
        $allLines = $linesStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $linesByEntry = [];
        foreach ($allLines as $line) {
            $linesByEntry[$line['journal_entry_id']][] = $line;
        }
        foreach ($entries as &$ent) {
            $ent['lines'] = $linesByEntry[$ent['id']] ?? [];
        }
        unset($ent);
    }

    $networksList = $db->query("SELECT id, name, code FROM um_networks ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];

    jsonResponse([
        'success' => true,
        'entries' => $entries,
        'data' => $entries,
        'networks' => $networksList
    ]);
}

if ($action === 'owner_get_master_cashboxes') {
    $reqNet = $_GET['network_id'] ?? 'all';
    $where = ["c.is_active = 1 AND c.account_type = 'asset' AND (c.account_code LIKE '1101%' OR c.account_code LIKE '1102%' OR c.name_ar LIKE '%صندوق%' OR c.name_ar LIKE '%خزينة%' OR c.name_ar LIKE '%بنك%' OR c.name_ar LIKE '%كاش%')"];
    $params = [];
    if ($reqNet !== 'all' && (int)$reqNet > 0) {
        $where[] = "c.network_id = ?";
        $params[] = (int)$reqNet;
    }
    $whereSql = implode(' AND ', $where);

    $sql = "
        SELECT c.id as account_id, c.account_code, c.name_ar as account_name, c.network_id,
               net.name as network_name, net.code as network_code,
               adm.fullname as custodian_name, adm.username as custodian_user
        FROM um_chart_of_accounts c
        LEFT JOIN um_networks net ON c.network_id = net.id
        LEFT JOIN um_admins adm ON c.linked_admin_id = adm.id
        WHERE $whereSql
        ORDER BY c.network_id ASC, c.account_code ASC
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $cashboxes = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Calculate balances for each cashbox
    foreach ($cashboxes as &$cb) {
        $cid = (int)$cb['account_id'];
        $cnet = (int)$cb['network_id'];
        $balSql = "
            SELECT 
                COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as balance,
                COALESCE(SUM(CASE WHEN e.entry_date = CURDATE() THEN l.debit ELSE 0 END), 0) as today_in,
                COALESCE(SUM(CASE WHEN e.entry_date = CURDATE() THEN l.credit ELSE 0 END), 0) as today_out
            FROM um_journal_entry_lines l
            JOIN um_journal_entries e ON l.journal_entry_id = e.id
            WHERE l.account_id = $cid AND l.network_id = $cnet AND e.is_posted = 1
        ";
        $b = $db->query($balSql)->fetch(PDO::FETCH_ASSOC) ?: [];
        $cb['balance'] = (float)($b['balance'] ?? 0);
        $cb['today_in'] = (float)($b['today_in'] ?? 0);
        $cb['today_out'] = (float)($b['today_out'] ?? 0);
    }
    unset($cb);

    jsonResponse([
        'success' => true,
        'cashboxes' => $cashboxes
    ]);
}

if ($action === 'owner_save_master_voucher') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $netId = (int)($input['network_id'] ?? 0);
    if ($netId <= 0) throw new Exception('يرجى تحديد الشبكة التابع لها السند');

    $type = trim((string)($input['voucher_type'] ?? 'receipt'));
    if (!in_array($type, ['receipt', 'payment'], true)) {
        throw new InvalidArgumentException('نوع السند غير صالح');
    }
    $amount = (float)($input['amount'] ?? 0);
    if ($amount <= 0) throw new Exception('المبلغ يجب أن يكون أكبر من الصفر');

    $partyName = trim((string)($input['party_name'] ?? ''));
    $category = trim((string)($input['category'] ?? 'عام'));
    $pm = trim((string)($input['payment_method'] ?? 'cash'));
    $date = !empty($input['voucher_date']) ? $input['voucher_date'] : date('Y-m-d');
    $desc = trim((string)($input['description'] ?? ''));
    $currency = trim((string)($input['currency_code'] ?? 'YER'));
    $accId = !empty($input['account_id']) ? (int)$input['account_id'] : null;
    $partyId = !empty($input['party_id']) ? (int)$input['party_id'] : null;

    $networkStmt = $db->prepare("SELECT id FROM um_networks WHERE id = ? AND status = 'active' LIMIT 1");
    $networkStmt->execute([$netId]);
    if (!$networkStmt->fetchColumn()) {
        throw new DomainException('الشبكة غير موجودة أو غير نشطة');
    }

    if ($accId !== null) {
        $accountStmt = $db->prepare('SELECT id FROM um_chart_of_accounts WHERE id = ? AND network_id = ? AND is_active = 1 LIMIT 1');
        $accountStmt->execute([$accId, $netId]);
        if (!$accountStmt->fetchColumn()) {
            throw new DomainException('الحساب لا يتبع الشبكة المحددة أو غير فعال');
        }
    }

    $db->beginTransaction();
    try {

    // Generate a collision-resistant voucher number without COUNT(*) races.
    $prefix = ($type === 'receipt') ? 'RV' : 'PV';
    $vNo = $prefix . '-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));

    $stmt = $db->prepare("
        INSERT INTO um_financial_vouchers 
        (network_id, voucher_no, voucher_type, voucher_date, party_type, party_id, party_name, amount, currency_code, payment_method, category, description, account_id, is_posted, created_by, created_at)
        VALUES (?, ?, ?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
    ");
    $stmt->execute([$netId, $vNo, $type, $date, $partyId, $partyName, $amount, $currency, $pm, $category, $desc, $accId, $currentAdminId]);
    $vId = (int)$db->lastInsertId();

    // Record in um_financial_transactions
    $impact = ($type === 'receipt') ? $amount : -$amount;
    $txStmt = $db->prepare("
        INSERT INTO um_financial_transactions
        (network_id, tx_type, reference_type, reference_id, party_id, debit, credit, cashbox_impact, description, created_by, created_at)
        VALUES (?, 'voucher', 'voucher', ?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    $deb = ($type === 'receipt') ? $amount : 0;
    $crd = ($type === 'payment') ? $amount : 0;
    $txStmt->execute([$netId, $vId, $partyId, $deb, $crd, $impact, $desc ?: ("سند " . ($type === 'receipt' ? 'قبض' : 'صرف') . " $vNo"), $currentAdminId]);
    $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('owner_save_master_voucher failed: ' . get_class($e) . ': ' . $e->getMessage());
        throw $e;
    }

    samOwnerLogActivity($db, $service ?? null, 'owner_create_voucher', 'finance', "إنشاء سند $type لشبكة $netId", "سند رقم $vNo بمبلغ $amount $currency", 'success', $currentAdminId);

    jsonResponse([
        'success' => true,
        'message' => "تم حفظ السند $vNo بنجاح لشبكة رقم $netId! 🎉",
        'voucher_id' => $vId,
        'voucher_no' => $vNo
    ]);
}

jsonResponse(['success'=>false,'error'=>'إجراء مالك النظام غير معروف'],404);

