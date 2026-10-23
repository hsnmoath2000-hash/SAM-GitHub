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

$adminId = (int) ($_SESSION['admin_id'] ?? 0);
$requestedNetwork = filter_input(INPUT_GET, 'network_id', FILTER_VALIDATE_INT);
if ($requestedNetwork === false || ($requestedNetwork !== null && $requestedNetwork < 0)) {
    jsonResponse(['success' => false, 'error' => 'رقم الشبكة غير صالح'], 400);
}

try {
    $db = getDB();
    $actor = AuthorizationContext::loadActor(
        $db,
        $adminId,
        $requestedNetwork !== null && $requestedNetwork > 0 ? $requestedNetwork : null
    );
    $authorization = new AuthorizationContext($db, $actor);
    $authorization->assertActiveNetwork();

    $networkId = $authorization->activeNetworkId();
    $isGlobal = $adminId === 1 || in_array(
        (string) ($actor['base_role'] ?? $actor['role'] ?? ''),
        ['system_owner', 'superadmin'],
        true
    );
    $financeRoles = ['system_owner', 'superadmin', 'network_owner', 'finance_manager', 'chief_accountant', 'finance', 'accountant'];
    $canViewSales = $isGlobal
        || in_array((string) ($actor['role'] ?? ''), $financeRoles, true)
        || $authorization->can(['finance_dashboard_view', 'sales_reports_view']);
    $canViewAllActivity = $isGlobal || $authorization->can('activity_logs_view');

    $metrics = [
        'active_sessions' => (int) scalarValue(
            $db,
            'SELECT COUNT(*) FROM radacct WHERE network_id = ? AND acctstoptime IS NULL',
            [$networkId]
        ),
        'active_routers' => (int) scalarValue(
            $db,
            'SELECT COUNT(*) FROM nas WHERE network_id = ? AND is_active = 1',
            [$networkId]
        ),
        'available_cards' => (int) scalarValue(
            $db,
            "SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = ? AND status = 'active' AND is_sold = 0 AND (expires_at IS NULL OR expires_at > NOW())",
            [$networkId]
        ),
        'network_members' => (int) scalarValue(
            $db,
            'SELECT COUNT(*) FROM um_admin_network_access nx JOIN um_admins a ON a.id = nx.admin_id WHERE nx.network_id = ? AND nx.is_active = 1 AND a.is_active = 1 AND (nx.starts_at IS NULL OR nx.starts_at <= NOW()) AND (nx.expires_at IS NULL OR nx.expires_at > NOW())',
            [$networkId]
        ),
        'today_invoice_count' => null,
        'sales_trend' => [],
    ];

    if ($canViewSales) {
        $todayInvoices = $db->prepare(
            "SELECT COUNT(*) AS invoice_count
             FROM um_sales_invoices
             WHERE network_id = ? AND invoice_status = 'completed'
               AND created_at >= CURRENT_DATE() AND created_at < CURRENT_DATE() + INTERVAL 1 DAY"
        );
        $todayInvoices->execute([$networkId]);
        $metrics['today_invoice_count'] = (int) $todayInvoices->fetchColumn();

        $trendQuery = $db->prepare(
            "SELECT DATE(created_at) AS sale_day, COUNT(*) AS invoice_count
             FROM um_sales_invoices
             WHERE network_id = ? AND invoice_status = 'completed'
               AND created_at >= CURRENT_DATE() - INTERVAL 6 DAY
               AND created_at < CURRENT_DATE() + INTERVAL 1 DAY
             GROUP BY DATE(created_at)"
        );
        $trendQuery->execute([$networkId]);
        $trendByDate = [];
        foreach ($trendQuery->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $trendByDate[(string) $row['sale_day']] = (int) $row['invoice_count'];
        }
        for ($daysAgo = 6; $daysAgo >= 0; $daysAgo--) {
            $day = date('Y-m-d', strtotime('-' . $daysAgo . ' days'));
            $metrics['sales_trend'][] = [
                'date' => $day,
                'invoice_count' => $trendByDate[$day] ?? 0,
            ];
        }
    }

    $activitySql = 'SELECT action_title, action_category, status, created_at
                    FROM um_activity_logs WHERE network_id = ?';
    $activityParams = [$networkId];
    if (!$canViewAllActivity) {
        $activitySql .= ' AND admin_id = ?';
        $activityParams[] = $adminId;
    }
    $activitySql .= ' ORDER BY id DESC LIMIT 6';
    $activityQuery = $db->prepare($activitySql);
    $activityQuery->execute($activityParams);
    $roleNameQuery = $db->prepare('SELECT role_name_ar FROM um_roles_def WHERE role_key = ? LIMIT 1');
    $roleNameQuery->execute([(string) $actor['role']]);

    $networks = array_map(
        static fn (array $network): array => [
            'id' => (int) $network['network_id'],
            'name' => (string) $network['name'],
            'code' => (string) $network['code'],
        ],
        $actor['networks']
    );

    jsonResponse([
        'success' => true,
        'actor' => [
            'name' => (string) $actor['fullname'],
            'role' => (string) $actor['role'],
            'role_name' => (string) ($roleNameQuery->fetchColumn() ?: $actor['role']),
        ],
        'network' => [
            'id' => $networkId,
            'name' => (string) ($actor['active_network']['name'] ?? ''),
            'code' => (string) ($actor['active_network']['code'] ?? ''),
        ],
        'networks' => $networks,
        'metrics' => $metrics,
        'activities' => $activityQuery->fetchAll(PDO::FETCH_ASSOC),
        'generated_at' => date(DATE_ATOM),
    ]);
} catch (DomainException $exception) {
    $status = in_array($exception->getMessage(), ['AUTH_REQUIRED', 'ACCOUNT_DISABLED'], true) ? 401 : 403;
    $message = match ($exception->getMessage()) {
        'AUTH_REQUIRED' => 'يلزم تسجيل الدخول.',
        'ACCOUNT_DISABLED' => 'الحساب غير نشط.',
        'NETWORK_ACCESS_REQUIRED' => 'لا توجد شبكة مرتبطة بحسابك.',
        'FORBIDDEN_NETWORK' => 'ليس لديك صلاحية الوصول إلى هذه الشبكة.',
        default => 'تعذر التحقق من صلاحيات الشبكة.',
    };
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (Throwable $exception) {
    error_log('SAM console dashboard failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تحميل لوحة التحكم. حاول مرة أخرى لاحقًا.'], 500);
}

function scalarValue(PDO $db, string $sql, array $parameters): mixed
{
    $statement = $db->prepare($sql);
    $statement->execute($parameters);
    return $statement->fetchColumn();
}
