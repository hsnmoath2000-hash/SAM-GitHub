<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/api/v1/lib/AuthorizationContext.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    header('Allow: GET');
    jsonResponse(['success' => false, 'error' => 'طريقة الطلب غير مدعومة.'], 405);
}

requireAuth();

$requestedNetwork = filter_input(INPUT_GET, 'network_id', FILTER_VALIDATE_INT);
if ($requestedNetwork === false || ($requestedNetwork !== null && $requestedNetwork < 0)) {
    jsonResponse(['success' => false, 'error' => 'رقم الشبكة غير صالح.'], 400);
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
    $networkId = $authorization->activeNetworkId();
    $access = [
        'routers' => $authorization->can(['routers', 'network.routers.view.assigned']),
        'nodes' => $authorization->can(['network_nodes', 'noc']),
        'assets' => $authorization->can(['assets', 'network.assets.view.assigned']),
    ];
    $view = (string) ($_GET['view'] ?? 'bootstrap');

    if ($view === 'bootstrap') {
        jsonResponse([
            'success' => true,
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
            'access' => $access,
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    if (!in_array($view, ['routers', 'nodes', 'assets'], true)) {
        jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
    }
    if (!$access[$view]) {
        jsonResponse(['success' => false, 'error' => 'لا تملك صلاحية عرض هذا القسم.'], 403);
    }

    $page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
    $page = $page === false || $page === null ? 1 : max(1, $page);
    if ($page > 10000) {
        jsonResponse(['success' => false, 'error' => 'رقم الصفحة خارج النطاق.'], 400);
    }
    $perPage = 25;
    $offset = ($page - 1) * $perPage;
    $search = trim((string) ($_GET['search'] ?? ''));
    if (mb_strlen($search) > 100) {
        jsonResponse(['success' => false, 'error' => 'عبارة البحث أطول من الحد المسموح.'], 400);
    }

    $scopeIds = $authorization->scopeAdminIds();
    if (!$authorization->isGlobal() && !$scopeIds) {
        jsonResponse([
            'success' => true,
            'view' => $view,
            'network_id' => $networkId,
            'page' => $page,
            'per_page' => $perPage,
            'total' => 0,
            'data' => [],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    $where = ['d.network_id=?'];
    $parameters = [$networkId];
    if (!$authorization->isGlobal()) {
        $scopeColumn = [
            'routers' => 'd.created_by_admin_id',
            'nodes' => 'd.responsible_admin_id',
            'assets' => 'd.assigned_to_user_id',
        ][$view];
        $marks = implode(',', array_fill(0, count($scopeIds), '?'));
        $where[] = "{$scopeColumn} IN ({$marks})";
        array_push($parameters, ...$scopeIds);
    }

    if ($view === 'routers') {
        $from = 'FROM nas d LEFT JOIN um_admins owner ON owner.id=d.created_by_admin_id';
        if ($search !== '') {
            $where[] = '(d.nasname LIKE ? OR d.shortname LIKE ? OR d.description LIKE ? OR owner.fullname LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern);
        }
        $select = "SELECT d.id,d.nasname,d.shortname,d.type,d.ports,d.is_active,d.description,d.work_types,
                    d.last_sync_time,d.last_bootstrap_at,d.server,owner.fullname AS owner_name";
    } elseif ($view === 'nodes') {
        $from = 'FROM um_network_nodes d
            LEFT JOIN um_network_nodes parent ON parent.id=d.parent_id AND parent.network_id=d.network_id
            LEFT JOIN um_admins responsible ON responsible.id=d.responsible_admin_id';
        if ($search !== '') {
            $where[] = '(d.node_name LIKE ? OR d.display_name LIKE ? OR d.code LIKE ? OR d.nas_ip LIKE ? OR d.location LIKE ? OR responsible.fullname LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern, $pattern);
        }
        $select = "SELECT d.id,d.node_type,d.parent_id,d.nas_ip,d.nas_port_id,d.node_name,d.display_name,d.code,
                    d.location,d.is_active,d.created_at,parent.node_name AS parent_name,
                    responsible.fullname AS responsible_name";
    } else {
        $from = 'FROM um_assets d LEFT JOIN um_network_nodes node ON node.id=d.node_id AND node.network_id=d.network_id';
        if ($search !== '') {
            $where[] = '(d.asset_code LIKE ? OR d.name LIKE ? OR d.category LIKE ? OR d.model LIKE ? OR d.ip_address LIKE ? OR d.location LIKE ? OR node.node_name LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern, $pattern, $pattern);
        }
        $select = "SELECT d.id,d.asset_code,d.name,d.category,d.model,d.status,d.location,d.ip_address,d.mac_address,
                    d.platform,d.version,d.last_seen,d.last_ping_status,d.first_discovered_at,d.last_disconnect_at,
                    d.last_reconnect_at,node.node_name";
    }

    $whereSql = implode(' AND ', $where);
    $count = $db->prepare("SELECT COUNT(*) {$from} WHERE {$whereSql}");
    $count->execute($parameters);
    $total = (int) $count->fetchColumn();
    $orderBy = $view === 'routers' ? 'd.id DESC' : ($view === 'nodes' ? 'd.nas_ip,d.node_type,d.id' : 'd.id DESC');
    $query = $db->prepare("{$select} {$from} WHERE {$whereSql} ORDER BY {$orderBy} LIMIT {$perPage} OFFSET {$offset}");
    $query->execute($parameters);
    jsonResponse([
        'success' => true,
        'view' => $view,
        'network_id' => $networkId,
        'page' => $page,
        'per_page' => $perPage,
        'total' => $total,
        'data' => $query->fetchAll(PDO::FETCH_ASSOC),
        'generated_at' => date(DATE_ATOM),
    ]);
} catch (DomainException $exception) {
    $message = match ($exception->getMessage()) {
        'AUTH_REQUIRED', 'ACCOUNT_DISABLED' => 'انتهت جلسة الدخول. سجّل الدخول مجددًا.',
        'FORBIDDEN_NETWORK', 'NETWORK_ACCESS_REQUIRED', 'NETWORK_CONTEXT_REQUIRED' => 'لا تملك صلاحية الوصول إلى هذه الشبكة.',
        default => 'لا تملك صلاحية عرض أجهزة الشبكة.',
    };
    $status = in_array($exception->getMessage(), ['AUTH_REQUIRED', 'ACCOUNT_DISABLED'], true) ? 401 : 403;
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (Throwable $exception) {
    error_log('SAM network devices read failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل بيانات أجهزة الشبكة. حاول مرة أخرى لاحقًا.'], 500);
}
