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
    $canView = $authorization->can(['card_warehouses', 'warehouse_stock_transfer', 'inventory.view.own']);
    $view = (string) ($_GET['view'] ?? 'bootstrap');

    if ($view === 'bootstrap') {
        jsonResponse([
            'success' => true,
            'actor' => [
                'id' => $authorization->id(),
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
                'inventory' => $canView,
                'transfer_approval' => $authorization->can(['warehouse_stock_transfer', 'card_warehouses']),
                'inventory_draft' => $authorization->can(['card_warehouses', 'warehouse_stock_transfer']),
                'inventory_post' => $authorization->can(['stock_inventory', 'card_warehouses', 'warehouse_stock_transfer'])
                    && in_array((string) $actor['role'], ['system_owner', 'superadmin', 'network_manager', 'admin', 'admin2', 'accountant', 'finance'], true),
            ],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    if (!in_array($view, ['stock', 'inventories', 'adjustments', 'transfers'], true)) {
        jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
    }
    if (!$canView) {
        jsonResponse(['success' => false, 'error' => 'لا تملك صلاحية عرض مخزون الكروت.'], 403);
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
    $scopeMarks = $authorization->isGlobal() ? '' : implode(',', array_fill(0, count($scopeIds), '?'));

    if ($view === 'stock') {
        $scopeSql = $authorization->isGlobal() ? '' : " AND v.owner_admin_id IN ({$scopeMarks})";
        $aggregateSql = "SELECT v.owner_admin_id,v.profile_name,COUNT(*) AS total_cards,
                SUM(CASE WHEN v.status='active' AND v.is_sold=0 AND (v.expires_at IS NULL OR v.expires_at>NOW()) THEN 1 ELSE 0 END) AS available_cards,
                SUM(CASE WHEN v.is_sold=1 THEN 1 ELSE 0 END) AS sold_cards,
                SUM(CASE WHEN v.status='used' THEN 1 ELSE 0 END) AS used_cards,
                SUM(CASE WHEN v.status='expired' OR (v.status='active' AND v.expires_at IS NOT NULL AND v.expires_at<=NOW()) THEN 1 ELSE 0 END) AS expired_cards,
                SUM(CASE WHEN v.status='disabled' THEN 1 ELSE 0 END) AS disabled_cards,
                SUM(CASE WHEN v.is_free_quota=1 THEN 1 ELSE 0 END) AS free_cards
            FROM um_vouchers_meta v
            WHERE v.network_id=?{$scopeSql}";
        $aggregateParams = [$networkId, ...($authorization->isGlobal() ? [] : $scopeIds)];
        if ($search !== '') {
            $aggregateSql .= ' AND (v.profile_name LIKE ? OR EXISTS (SELECT 1 FROM um_admins search_admin WHERE search_admin.id=v.owner_admin_id AND (search_admin.fullname LIKE ? OR search_admin.username LIKE ?)))';
            $pattern = '%' . $search . '%';
            array_push($aggregateParams, $pattern, $pattern, $pattern);
        }
        $aggregateSql .= ' GROUP BY v.owner_admin_id,v.profile_name';
        $count = $db->prepare("SELECT COUNT(*) FROM ({$aggregateSql}) stock_groups");
        $count->execute($aggregateParams);
        $total = (int) $count->fetchColumn();
        $query = $db->prepare(
            "SELECT stock_groups.*,COALESCE(a.fullname,a.username,'غير معيّن') AS owner_name
             FROM ({$aggregateSql}) stock_groups
             LEFT JOIN um_admins a ON a.id=stock_groups.owner_admin_id
             ORDER BY a.fullname,stock_groups.profile_name
             LIMIT {$perPage} OFFSET {$offset}"
        );
        $query->execute($aggregateParams);
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
    }

    if ($view === 'inventories') {
        $where = ['i.network_id=?'];
        $parameters = [$networkId];
        if (!$authorization->isGlobal()) {
            $where[] = "i.warehouse_admin_id IN ({$scopeMarks})";
            array_push($parameters, ...$scopeIds);
        }
        if ($search !== '') {
            $where[] = '(i.inventory_no LIKE ? OR w.fullname LIKE ? OR w.username LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern);
        }
        $whereSql = implode(' AND ', $where);
        $fromSql = 'FROM um_stock_inventories i LEFT JOIN um_admins w ON w.id=i.warehouse_admin_id';
        $count = $db->prepare("SELECT COUNT(*) {$fromSql} WHERE {$whereSql}");
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();
        $query = $db->prepare(
            "SELECT i.id,i.inventory_no,i.inventory_date,i.status,i.total_book_cards,i.total_actual_cards,
                    i.total_variance_cards,i.created_at,w.fullname AS warehouse_name,w.username AS warehouse_username
             {$fromSql}
             WHERE {$whereSql}
             ORDER BY i.id DESC LIMIT {$perPage} OFFSET {$offset}"
        );
    } elseif ($view === 'adjustments') {
        $where = ['i.network_id=?'];
        $parameters = [$networkId];
        if (!$authorization->isGlobal()) {
            $where[] = "i.warehouse_admin_id IN ({$scopeMarks})";
            array_push($parameters, ...$scopeIds);
        }
        if ($search !== '') {
            $where[] = '(i.adjustment_no LIKE ? OR w.fullname LIKE ? OR w.username LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern);
        }
        $whereSql = implode(' AND ', $where);
        $fromSql = 'FROM um_stock_adjustments i LEFT JOIN um_admins w ON w.id=i.warehouse_admin_id';
        $count = $db->prepare("SELECT COUNT(*) {$fromSql} WHERE {$whereSql}");
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();
        $query = $db->prepare(
            "SELECT i.id,i.adjustment_no,i.adjustment_type,i.status,i.total_cards,i.created_at,
                    i.is_immutable,w.fullname AS warehouse_name,w.username AS warehouse_username
             {$fromSql}
             WHERE {$whereSql}
             ORDER BY i.id DESC LIMIT {$perPage} OFFSET {$offset}"
        );
    } else {
        $where = ['t.network_id=?'];
        $parameters = [$networkId];
        if (!$authorization->isGlobal()) {
            $where[] = "(t.sender_admin_id IN ({$scopeMarks}) OR t.receiver_admin_id IN ({$scopeMarks}))";
            array_push($parameters, ...$scopeIds, ...$scopeIds);
        }
        if ($search !== '') {
            $where[] = '(t.transfer_no LIKE ? OR t.profile_name LIKE ? OR sender.fullname LIKE ? OR receiver.fullname LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern);
        }
        $whereSql = implode(' AND ', $where);
        $fromSql = 'FROM um_stock_transfers t
            LEFT JOIN um_admins sender ON sender.id=t.sender_admin_id
            LEFT JOIN um_admins receiver ON receiver.id=t.receiver_admin_id';
        $count = $db->prepare("SELECT COUNT(*) {$fromSql} WHERE {$whereSql}");
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();
        $query = $db->prepare(
            "SELECT t.id,t.transfer_no,t.transfer_type,t.status,t.sender_admin_id,t.receiver_admin_id,t.profile_name,t.sheets_count,
                    t.cards_count,t.created_at,sender.fullname AS sender_name,receiver.fullname AS receiver_name
             {$fromSql}
             WHERE {$whereSql}
             ORDER BY t.id DESC LIMIT {$perPage} OFFSET {$offset}"
        );
    }

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
        default => 'لا تملك صلاحية عرض المخزون.',
    };
    $status = in_array($exception->getMessage(), ['AUTH_REQUIRED', 'ACCOUNT_DISABLED'], true) ? 401 : 403;
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (Throwable $exception) {
    error_log('SAM inventory read failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل بيانات المخزون. حاول مرة أخرى لاحقًا.'], 500);
}
