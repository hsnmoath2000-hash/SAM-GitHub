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
    $salesAccess = $authorization->can([
        'sales_reports.view.all',
        'sales_reports.view.children',
        'sales_reports.view.own',
        'sales.view.own',
    ]);
    $financeAccess = $authorization->can([
        'cashbox_accounts',
        'vouchers_fin',
        'statement.view.own',
        'statement.view.children',
    ]);
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
            'access' => ['sales' => $salesAccess, 'finance' => $financeAccess],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    if (!in_array($view, ['sales', 'finance'], true)) {
        jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
    }
    if (($view === 'sales' && !$salesAccess) || ($view === 'finance' && !$financeAccess)) {
        jsonResponse(['success' => false, 'error' => 'لا تملك صلاحية عرض هذه البيانات.'], 403);
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
            'summary' => [],
            'data' => [],
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    $where = ['i.network_id=?'];
    $parameters = [$networkId];
    if (!$authorization->isGlobal()) {
        $marks = implode(',', array_fill(0, count($scopeIds), '?'));
        $where[] = ($view === 'sales' ? 'i.seller_id' : 'i.account_id') . " IN ({$marks})";
        array_push($parameters, ...$scopeIds);
    }
    if ($search !== '') {
        $pattern = '%' . $search . '%';
        if ($view === 'sales') {
            $where[] = '(i.invoice_no LIKE ? OR i.profile_name LIKE ? OR i.sale_kind LIKE ? OR seller.fullname LIKE ? OR seller.username LIKE ?)';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern);
        } else {
            $where[] = '(i.tx_no LIKE ? OR i.tx_type LIKE ? OR i.description LIKE ? OR account.fullname LIKE ? OR account.username LIKE ?)';
            array_push($parameters, $pattern, $pattern, $pattern, $pattern, $pattern);
        }
    }
    $whereSql = implode(' AND ', $where);

    if ($view === 'sales') {
        $fromSql = 'FROM um_sales_invoices i JOIN um_admins seller ON seller.id=i.seller_id';
        $summaryQuery = $db->prepare(
            "SELECT COUNT(*) AS invoice_count,
                    COALESCE(SUM(CASE WHEN i.invoice_status='completed' THEN i.total_amount ELSE 0 END),0) AS completed_amount,
                    COALESCE(SUM(CASE WHEN i.invoice_status='completed' THEN i.paid_amount ELSE 0 END),0) AS paid_amount,
                    COALESCE(SUM(CASE WHEN i.invoice_status='completed' THEN i.remaining_amount ELSE 0 END),0) AS remaining_amount
             {$fromSql} WHERE {$whereSql}"
        );
        $summaryQuery->execute($parameters);
        $summary = $summaryQuery->fetch(PDO::FETCH_ASSOC);
        $query = $db->prepare(
            "SELECT i.invoice_no,i.sale_kind,i.profile_name,i.quantity,i.total_amount,i.paid_amount,
                    i.remaining_amount,i.payment_type,i.invoice_status,i.created_at,
                    seller.fullname AS seller_name,seller.username AS seller_username
             {$fromSql}
             WHERE {$whereSql}
             ORDER BY i.id DESC LIMIT {$perPage} OFFSET {$offset}"
        );
    } else {
        $fromSql = 'FROM um_financial_transactions i JOIN um_admins account ON account.id=i.account_id';
        $summaryQuery = $db->prepare(
            "SELECT COUNT(*) AS transaction_count,
                    COALESCE(SUM(i.debit),0) AS total_debit,
                    COALESCE(SUM(i.credit),0) AS total_credit,
                    COALESCE(SUM(i.cashbox_impact),0) AS cashbox_impact
             {$fromSql} WHERE {$whereSql}"
        );
        $summaryQuery->execute($parameters);
        $summary = $summaryQuery->fetch(PDO::FETCH_ASSOC);
        $query = $db->prepare(
            "SELECT i.tx_no,i.tx_type,i.debit,i.credit,i.cashbox_impact,i.payment_method,
                    i.description,i.reference_id,i.created_at,
                    account.fullname AS account_name,account.username AS account_username
             {$fromSql}
             WHERE {$whereSql}
             ORDER BY i.id DESC LIMIT {$perPage} OFFSET {$offset}"
        );
    }

    $total = (int) ($summary[$view === 'sales' ? 'invoice_count' : 'transaction_count'] ?? 0);
    $query->execute($parameters);
    jsonResponse([
        'success' => true,
        'view' => $view,
        'network_id' => $networkId,
        'page' => $page,
        'per_page' => $perPage,
        'total' => $total,
        'summary' => $summary,
        'data' => $query->fetchAll(PDO::FETCH_ASSOC),
        'generated_at' => date(DATE_ATOM),
    ]);
} catch (InvalidArgumentException $exception) {
    jsonResponse(['success' => false, 'error' => 'قيمة أحد المرشحات غير صالحة.'], 400);
} catch (DomainException $exception) {
    $message = match ($exception->getMessage()) {
        'AUTH_REQUIRED', 'ACCOUNT_DISABLED' => 'انتهت جلسة الدخول. سجّل الدخول مجددًا.',
        'FORBIDDEN_NETWORK', 'NETWORK_ACCESS_REQUIRED', 'NETWORK_CONTEXT_REQUIRED' => 'لا تملك صلاحية الوصول إلى هذه الشبكة.',
        default => 'لا تملك صلاحية عرض البيانات المالية.',
    };
    $status = in_array($exception->getMessage(), ['AUTH_REQUIRED', 'ACCOUNT_DISABLED'], true) ? 401 : 403;
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (Throwable $exception) {
    error_log('SAM commerce read failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل بيانات المبيعات والمحاسبة. حاول مرة أخرى لاحقًا.'], 500);
}
