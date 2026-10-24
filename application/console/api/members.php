<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/api/v1/lib/AuthorizationContext.php';

header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    jsonResponse(['success' => false, 'error' => 'طريقة الطلب غير مدعومة'], 405);
}

requireAuth();

$requestedNetwork = filter_input(INPUT_GET, 'network_id', FILTER_VALIDATE_INT);
if ($requestedNetwork === false || ($requestedNetwork !== null && $requestedNetwork < 0)) {
    jsonResponse(['success' => false, 'error' => 'رقم الشبكة غير صالح'], 400);
}

try {
    $db = getDB();
    $actor = AuthorizationContext::loadActor(
        $db,
        (int) ($_SESSION['admin_id'] ?? 0),
        $requestedNetwork !== null && $requestedNetwork > 0 ? $requestedNetwork : null
    );
    $authorization = new AuthorizationContext($db, $actor);
    $authorization->assertActiveNetwork();

    $canTeam = $authorization->can(['admins_agents', 'admins_view']);
    $canCustomers = $authorization->can(['customers_view', 'customer_management', 'subscribers_view']);
    $canPermissions = $canTeam || $authorization->can(['permissions_manage', 'roles_permissions_manage']);
    $view = (string) ($_GET['view'] ?? 'bootstrap');
    $networkId = $authorization->activeNetworkId();
    if (!in_array($view, ['bootstrap', 'team', 'customers', 'permissions'], true)) {
        jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
    }

    if ($view === 'bootstrap') {
        jsonResponse([
            'success' => true,
            'view' => 'bootstrap',
            'actor' => [
                'name' => (string) $actor['fullname'],
                'role' => (string) $actor['role'],
            ],
            'network' => [
                'id' => $networkId,
                'name' => (string) ($actor['active_network']['name'] ?? ''),
                'code' => (string) ($actor['active_network']['code'] ?? ''),
            ],
            'networks' => array_map(
                static fn (array $network): array => [
                    'id' => (int) $network['network_id'],
                    'name' => (string) $network['name'],
                    'code' => (string) $network['code'],
                ],
                $actor['networks']
            ),
            'access' => [
                'team' => $canTeam,
                'customers' => $canCustomers,
                'permissions' => $canPermissions,
            ],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    $permission = match ($view) {
        'team' => $canTeam,
        'customers' => $canCustomers,
        'permissions' => $canPermissions,
        default => false,
    };
    if (!$permission) {
        jsonResponse(['success' => false, 'error' => 'لا تملك صلاحية عرض هذا القسم.'], 403);
    }

    if ($view === 'permissions') {
        $roleKey = trim((string) ($_GET['role'] ?? ''));
        if (strlen($roleKey) > 64) {
            jsonResponse(['success' => false, 'error' => 'معرّف الدور غير صالح.'], 400);
        }
        $rolesQuery = $db->prepare(
            'SELECT role_key, role_name_ar, description, default_data_scope, is_system
             FROM um_roles_def WHERE network_id IS NULL OR network_id = ?
             ORDER BY role_name_ar, role_key'
        );
        $rolesQuery->execute([$networkId]);
        $roles = $rolesQuery->fetchAll(PDO::FETCH_ASSOC);
        if ($roleKey === '' && $roles) {
            $roleKey = (string) $roles[0]['role_key'];
        }
        $knownRole = false;
        foreach ($roles as $role) {
            if ((string) $role['role_key'] === $roleKey) {
                $knownRole = true;
                break;
            }
        }
        if (!$knownRole) {
            jsonResponse(['success' => false, 'error' => 'الدور المطلوب غير موجود ضمن هذه الشبكة.'], 404);
        }

        $legacyQuery = $db->prepare('SELECT permissions FROM um_roles_def WHERE role_key = ? LIMIT 1');
        $legacyQuery->execute([$roleKey]);
        $legacyPermissions = json_decode((string) ($legacyQuery->fetchColumn() ?: '[]'), true);
        if (!is_array($legacyPermissions)) {
            $legacyPermissions = [];
        }
        $legacyPermissions = array_values(array_filter($legacyPermissions, 'is_string'));

        $permissionQuery = $db->prepare(
            'SELECT p.permission_key, p.module_key, p.action_key, p.scope_key,
                    p.permission_name_ar, p.description, p.is_sensitive,
                    COALESCE(rp.effect, \'none\') AS role_effect
             FROM um_permission_catalog p
             LEFT JOIN um_role_permissions rp
               ON rp.permission_key = p.permission_key AND rp.role_key = ?
             WHERE p.is_active = 1
             ORDER BY p.module_key, p.action_key, p.permission_name_ar'
        );
        $permissionQuery->execute([$roleKey]);
        $permissionRows = $permissionQuery->fetchAll(PDO::FETCH_ASSOC);
        foreach ($permissionRows as &$permissionRow) {
            $key = (string) $permissionRow['permission_key'];
            $effect = (string) $permissionRow['role_effect'];
            if ($effect === 'none' && (in_array($key, $legacyPermissions, true) || in_array('*', $legacyPermissions, true))) {
                $effect = 'grant';
            }
            $permissionRow['role_effect'] = $effect;
            $permissionRow['is_sensitive'] = (bool) $permissionRow['is_sensitive'];
        }
        unset($permissionRow);

        jsonResponse([
            'success' => true,
            'view' => 'permissions',
            'roles' => $roles,
            'selected_role' => $roleKey,
            'permissions' => $permissionRows,
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    $page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
    $page = $page === false || $page === null ? 1 : max(1, $page);
    if ($page > 10000) {
        jsonResponse(['success' => false, 'error' => 'رقم الصفحة خارج النطاق.'], 400);
    }
    $perPage = filter_input(INPUT_GET, 'per_page', FILTER_VALIDATE_INT);
    $perPage = $perPage === false || $perPage === null ? 25 : min(50, max(10, $perPage));
    $offset = ($page - 1) * $perPage;
    $search = trim((string) ($_GET['search'] ?? ''));
    if (strlen($search) > 300) {
        jsonResponse(['success' => false, 'error' => 'عبارة البحث أطول من الحد المسموح.'], 400);
    }
    $status = trim((string) ($_GET['status'] ?? ''));
    $validStatuses = $view === 'team'
        ? ['', 'active', 'inactive', 'expired']
        : ['', 'active', 'suspended', 'expired', 'disabled', 'locked'];
    if (!in_array($status, $validStatuses, true)) {
        jsonResponse(['success' => false, 'error' => 'حالة العضوية غير صالحة لهذا القسم.'], 400);
    }
    $searchPattern = '%' . $search . '%';

    if ($view === 'team') {
        $where = ['nx.network_id = ?'];
        $parameters = [$networkId];
        if (!$authorization->isGlobal()) {
            $scopeIds = $authorization->scopeAdminIds();
            if (!$scopeIds) {
                $where[] = '1 = 0';
            } else {
                $where[] = 'a.id IN (' . implode(',', array_fill(0, count($scopeIds), '?')) . ')';
                array_push($parameters, ...$scopeIds);
            }
        }
        if ($search !== '') {
            $where[] = '(a.username LIKE ? OR a.fullname LIKE ? OR a.phone LIKE ? OR COALESCE(nr.role_key, a.role) LIKE ? OR COALESCE(r.role_name_ar, nr.role_key, a.role) LIKE ?)';
            array_push($parameters, $searchPattern, $searchPattern, $searchPattern, $searchPattern, $searchPattern);
        }
        $statusSql = "CASE
            WHEN a.is_active <> 1 OR nx.is_active <> 1 THEN 'inactive'
            WHEN nx.expires_at IS NOT NULL AND nx.expires_at <= NOW() THEN 'expired'
            WHEN nx.starts_at IS NOT NULL AND nx.starts_at > NOW() THEN 'inactive'
            ELSE 'active' END";
        if ($status !== '') {
            $where[] = $statusSql . ' = ?';
            $parameters[] = $status;
        }
        $whereSql = implode(' AND ', $where);
        $countQuery = $db->prepare(
            'SELECT COUNT(*) FROM um_admin_network_access nx
             JOIN um_admins a ON a.id = nx.admin_id
             LEFT JOIN um_admin_network_roles nr ON nr.admin_id = nx.admin_id AND nr.network_id = nx.network_id AND nr.is_active = 1
            LEFT JOIN um_roles_def r ON r.role_key = COALESCE(nr.role_key, a.role) AND (r.network_id IS NULL OR r.network_id = nx.network_id)
             WHERE ' . $whereSql
        );
        $countQuery->execute($parameters);
        $total = (int) $countQuery->fetchColumn();
        $dataSql = "SELECT a.id, a.fullname AS display_name, a.username, a.phone,
                           COALESCE(nr.role_key, a.role) AS role_key,
                           COALESCE(r.role_name_ar, nr.role_key, a.role) AS role_name,
                           COALESCE(nr.data_scope, a.data_scope, 'own') AS data_scope,
                           nx.access_level, {$statusSql} AS membership_status
                    FROM um_admin_network_access nx
                    JOIN um_admins a ON a.id = nx.admin_id
                    LEFT JOIN um_admin_network_roles nr ON nr.admin_id = nx.admin_id AND nr.network_id = nx.network_id AND nr.is_active = 1
                    LEFT JOIN um_roles_def r ON r.role_key = COALESCE(nr.role_key, a.role) AND (r.network_id IS NULL OR r.network_id = nx.network_id)
                    WHERE {$whereSql}
                    ORDER BY a.fullname, a.id LIMIT {$perPage} OFFSET {$offset}";
        $dataQuery = $db->prepare($dataSql);
        $dataQuery->execute($parameters);
        $rows = $dataQuery->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $where = ['m.network_id = ?'];
        $parameters = [$networkId];
        if (!$authorization->isGlobal()) {
            $scopeIds = $authorization->scopeAdminIds();
            if (!$scopeIds) {
                $where[] = '1 = 0';
            } else {
                $where[] = 'm.owner_admin_id IN (' . implode(',', array_fill(0, count($scopeIds), '?')) . ')';
                array_push($parameters, ...$scopeIds);
            }
        }
        if ($search !== '') {
            $where[] = "(i.display_name LIKE ? OR i.phone LIKE ? OR m.network_username LIKE ? OR COALESCE(m.profile_name, '') LIKE ?)";
            array_push($parameters, $searchPattern, $searchPattern, $searchPattern, $searchPattern);
        }
        if ($status !== '') {
            $where[] = "CASE WHEN i.is_active <> 1 THEN 'disabled' ELSE m.membership_status END = ?";
            $parameters[] = $status;
        }
        $whereSql = implode(' AND ', $where);
        $fromSql = ' FROM um_customer_network_memberships m
                     JOIN um_customer_identities i ON i.id = m.customer_id
                     LEFT JOIN um_admin_network_access owner_membership
                       ON owner_membership.admin_id = m.owner_admin_id AND owner_membership.network_id = m.network_id
                     LEFT JOIN um_admins owner ON owner.id = owner_membership.admin_id
                     WHERE ' . $whereSql;
        $countQuery = $db->prepare('SELECT COUNT(*)' . $fromSql);
        $countQuery->execute($parameters);
        $total = (int) $countQuery->fetchColumn();
        $dataSql = "SELECT i.id AS identity_id, i.display_name, i.phone, i.is_active AS identity_active,
                           m.id AS membership_id, m.network_username AS username, m.profile_name,
                           m.membership_status,
                           CASE WHEN i.is_active <> 1 THEN 'disabled' ELSE m.membership_status END AS display_status,
                           m.valid_until, owner.fullname AS owner_name{$fromSql}
                    ORDER BY i.display_name, m.id LIMIT {$perPage} OFFSET {$offset}";
        $dataQuery = $db->prepare($dataSql);
        $dataQuery->execute($parameters);
        $rows = $dataQuery->fetchAll(PDO::FETCH_ASSOC);
    }

    jsonResponse([
        'success' => true,
        'view' => $view,
        'data' => $rows,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'generated_at' => date(DATE_ATOM),
    ]);
} catch (DomainException $exception) {
    $statusCode = in_array($exception->getMessage(), ['AUTH_REQUIRED', 'ACCOUNT_DISABLED'], true) ? 401 : 403;
    $message = match ($exception->getMessage()) {
        'AUTH_REQUIRED' => 'يلزم تسجيل الدخول.',
        'ACCOUNT_DISABLED' => 'الحساب غير نشط.',
        'NETWORK_ACCESS_REQUIRED' => 'لا توجد شبكة مرتبطة بحسابك.',
        'FORBIDDEN_NETWORK' => 'ليس لديك صلاحية الوصول إلى هذه الشبكة.',
        default => 'تعذر التحقق من صلاحيات الشبكة.',
    };
    jsonResponse(['success' => false, 'error' => $message], $statusCode);
} catch (Throwable $exception) {
    error_log('SAM console members failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل سجلات العضوية. حاول مرة أخرى لاحقًا.'], 500);
}
