<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/api/v1/lib/AuthorizationContext.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (!in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    jsonResponse(['success' => false, 'error' => 'طريقة الطلب غير مدعومة.'], 405);
}

requireAuth();

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'POST' && !hash_equals('XMLHttpRequest', (string) ($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) {
    jsonResponse(['success' => false, 'error' => 'تعذر التحقق من مصدر الطلب.'], 403);
}

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
    $canView = $authorization->can(['admins_agents', 'admins_view']);
    if ($method === 'POST') {
        $authorization->assertCan('admins_agents', 'POS_REVIEW_PERMISSION_REQUIRED');
        $input = json_decode(file_get_contents('php://input') ?: '', true);
        if (!is_array($input)) {
            jsonResponse(['success' => false, 'error' => 'محتوى الطلب غير صالح.'], 400);
        }
        $requestId = filter_var($input['request_id'] ?? null, FILTER_VALIDATE_INT);
        $decision = (string) ($input['decision'] ?? '');
        $notes = trim((string) ($input['notes'] ?? ''));
        if ($requestId === false || $requestId <= 0 || !in_array($decision, ['approved', 'rejected'], true)) {
            jsonResponse(['success' => false, 'error' => 'بيانات مراجعة الطلب غير صالحة.'], 400);
        }
        if (mb_strlen($notes) > 500) {
            jsonResponse(['success' => false, 'error' => 'الملاحظات تتجاوز الحد المسموح.'], 400);
        }

        $requestQuery = $db->prepare(
            "SELECT pos_admin_id FROM um_pos_network_requests
             WHERE id=? AND network_id=? AND status='pending' LIMIT 1"
        );
        $requestQuery->execute([$requestId, $networkId]);
        $posAdminId = (int) $requestQuery->fetchColumn();
        if ($posAdminId <= 0) {
            jsonResponse(['success' => false, 'error' => 'الطلب غير موجود أو سبق مراجعته.'], 404);
        }
        if (!$authorization->isGlobal() && !in_array($posAdminId, $authorization->scopeAdminIds(), true)) {
            jsonResponse(['success' => false, 'error' => 'الطلب خارج نطاق الحسابات المسموح بها.'], 403);
        }

        $amount = static function (mixed $value, string $field, float $maximum): float {
            if (!is_string($value) && !is_int($value) && !is_float($value)) {
                throw new InvalidArgumentException($field);
            }
            $raw = trim((string) $value);
            if (!preg_match('/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/', $raw)) {
                throw new InvalidArgumentException($field);
            }
            $result = (float) $raw;
            if (!is_finite($result) || $result > $maximum) {
                throw new InvalidArgumentException($field);
            }
            return $result;
        };
        $review = [
            'request_id' => $requestId,
            'decision' => $decision,
            'notes' => $notes,
        ];
        if ($decision === 'approved') {
            foreach (['discount_rate', 'credit_limit', 'opening_debt', 'opening_balance'] as $field) {
                if (!array_key_exists($field, $input)) {
                    jsonResponse(['success' => false, 'error' => 'أدخل جميع شروط اعتماد نقطة البيع.'], 400);
                }
            }
            try {
                $review['discount_rate'] = $amount($input['discount_rate'], 'discount_rate', 100);
                $review['credit_limit'] = $amount($input['credit_limit'], 'credit_limit', 999999999);
                $review['opening_debt'] = $amount($input['opening_debt'], 'opening_debt', 999999999);
                $review['opening_balance'] = $amount($input['opening_balance'], 'opening_balance', 999999999);
            } catch (InvalidArgumentException) {
                jsonResponse(['success' => false, 'error' => 'أحد شروط الاعتماد غير صالح. استخدم أرقامًا موجبة بحد أقصى منزلتين عشريتين.'], 400);
            }
        }

        require_once dirname(__DIR__, 2) . '/includes/PosDistributorService.php';
        $service = new PosDistributorService($db);
        $result = $service->adminReviewPosRequest(
            (int) ($_SESSION['admin_id'] ?? 0),
            (string) ($actor['role'] ?? $_SESSION['role'] ?? ''),
            $review,
            $authorization->isGlobal() ? null : $authorization->scopeAdminIds()
        );
        jsonResponse(['success' => true, 'result' => $result, 'network_id' => $networkId]);
    }

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
            'access' => [
                'pos' => $canView,
                'review' => $authorization->can('admins_agents')
                    && in_array((string) $actor['role'], ['system_owner', 'superadmin', 'network_manager', 'admin', 'admin2'], true),
            ],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    if (!in_array($view, ['directory', 'requests'], true)) {
        jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
    }
    if (!$canView) {
        jsonResponse(['success' => false, 'error' => 'لا تملك صلاحية عرض حسابات الشبكة ونقاط البيع.'], 403);
    }

    $scopeIds = $authorization->scopeAdminIds();
    if (!$authorization->isGlobal() && !$scopeIds) {
        jsonResponse([
            'success' => true,
            'view' => $view,
            'network_id' => $networkId,
            'total' => 0,
            'data' => [],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    [$scopeSql, $scopeParameters] = $authorization->isGlobal()
        ? ['1=1', []]
        : ['a.id IN (' . implode(',', array_fill(0, count($scopeIds), '?')) . ')', $scopeIds];

    if ($view === 'directory') {
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

        $where = [
            'nx.network_id = ?',
            'nx.is_active = 1',
            '(nx.starts_at IS NULL OR nx.starts_at <= NOW())',
            '(nx.expires_at IS NULL OR nx.expires_at > NOW())',
            'a.is_active = 1',
            "COALESCE(nr.role_key,a.role) IN ('pos_agent','point_of_sale','pos')",
            $scopeSql,
        ];
        $parameters = [$networkId, ...$scopeParameters];
        if ($search !== '') {
            $where[] = '(a.username LIKE ? OR a.fullname LIKE ? OR a.phone LIKE ? OR shop.shop_name LIKE ? OR node.display_name LIKE ? OR node.node_name LIKE ?)';
            $pattern = '%' . $search . '%';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern, $pattern);
        }
        $whereSql = implode(' AND ', $where);
        $joinSql = "FROM um_admin_network_access nx
            JOIN um_admins a ON a.id=nx.admin_id
            LEFT JOIN um_admin_network_roles nr ON nr.admin_id=nx.admin_id AND nr.network_id=nx.network_id AND nr.is_active=1
            LEFT JOIN um_pos_network_assignments assignment ON assignment.pos_admin_id=a.id AND assignment.network_id=nx.network_id
            LEFT JOIN um_network_nodes node ON node.id=assignment.node_id AND node.network_id=nx.network_id
            LEFT JOIN um_pos_network_requests shop ON shop.id=(
                SELECT r.id FROM um_pos_network_requests r
                WHERE r.pos_admin_id=a.id AND r.network_id=nx.network_id AND r.status='approved'
                ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1
            )";
        $count = $db->prepare("SELECT COUNT(DISTINCT a.id) {$joinSql} WHERE {$whereSql}");
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();
        $query = $db->prepare(
            "SELECT a.username,a.fullname,a.phone,
                    nx.access_level,nx.starts_at,
                    shop.shop_name,node.display_name AS node_name
             {$joinSql}
             WHERE {$whereSql}
             ORDER BY a.fullname,a.id
             LIMIT {$perPage} OFFSET {$offset}"
        );
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
    }

    $where = ["r.network_id=?", "r.status='pending'", $scopeSql];
    $parameters = [$networkId, ...$scopeParameters];
    $search = trim((string) ($_GET['search'] ?? ''));
    if (mb_strlen($search) > 100) {
        jsonResponse(['success' => false, 'error' => 'عبارة البحث أطول من الحد المسموح.'], 400);
    }
    if ($search !== '') {
        $where[] = '(r.request_no LIKE ? OR r.shop_name LIKE ? OR r.phone LIKE ? OR a.fullname LIKE ? OR a.username LIKE ?)';
        $pattern = '%' . $search . '%';
        array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern);
    }
    $whereSql = implode(' AND ', $where);
    $joinSql = 'FROM um_pos_network_requests r LEFT JOIN um_admins a ON a.id=r.pos_admin_id';
    $count = $db->prepare("SELECT COUNT(*) {$joinSql} WHERE {$whereSql}");
    $count->execute($parameters);
    $total = (int) $count->fetchColumn();
    $page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT);
    $page = $page === false || $page === null ? 1 : max(1, $page);
    if ($page > 10000) {
        jsonResponse(['success' => false, 'error' => 'رقم الصفحة خارج النطاق.'], 400);
    }
    $perPage = 25;
    $offset = ($page - 1) * $perPage;
    $query = $db->prepare(
        "SELECT r.id,r.request_no,r.pos_admin_id,r.shop_name,r.phone,r.location_notes,r.initiated_by,r.created_at,
                a.fullname AS account_name,a.username
         {$joinSql}
         WHERE {$whereSql}
         ORDER BY r.created_at DESC,r.id DESC
         LIMIT {$perPage} OFFSET {$offset}"
    );
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
        'REQUEST_ALREADY_REVIEWED' => 'تمت مراجعة هذا الطلب مسبقًا. حدّث القائمة.',
        'REQUEST_NOT_FOUND' => 'الطلب غير موجود ضمن هذه الشبكة.',
        'REQUEST_OUT_OF_SCOPE' => 'الطلب خارج نطاق الحسابات المسموح بها.',
        'INVALID_REVIEW', 'INVALID_POS_ACCOUNT' => 'بيانات مراجعة الطلب غير صالحة.',
        'FORBIDDEN' => 'لا تملك صلاحية مراجعة طلبات نقاط البيع.',
        default => 'لا تملك صلاحية تنفيذ هذا الإجراء.',
    };
    $status = match ($exception->getMessage()) {
        'AUTH_REQUIRED', 'ACCOUNT_DISABLED' => 401,
        'REQUEST_NOT_FOUND' => 404,
        'REQUEST_ALREADY_REVIEWED' => 409,
        default => 403,
    };
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (InvalidArgumentException $exception) {
    jsonResponse(['success' => false, 'error' => 'قيمة أحد شروط الاعتماد غير صالحة.'], 400);
} catch (Throwable $exception) {
    error_log('SAM POS directory request failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل بيانات نقاط البيع أو مراجعة الطلب. حاول مرة أخرى لاحقًا.'], 500);
}
