<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/VoucherService.php';
require_once __DIR__ . '/RouterRadiusService.php';
require_once __DIR__ . '/FinancialAccountingService.php';
require_once __DIR__ . '/NetworkTopologyService.php';
require_once __DIR__ . '/NotificationService.php';
require_once __DIR__ . '/PurchasesService.php';
require_once __DIR__ . '/ChatbotService.php';
require_once __DIR__ . '/WhatsAppService.php';
require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/CloudBackupService.php';
require_once __DIR__ . '/UserManagerSQLiteImportService.php';

/**
 * RadiusService - Unified Master Facade and Core RBAC & System Engine
 * Encapsulates and delegates domain operations with 100% backward compatibility.
 */
class RadiusService extends BaseService {
    public VoucherService $vouchers;
    public RouterRadiusService $routerRadius;
    public FinancialAccountingService $financial;
    public NetworkTopologyService $networkTopology;
    public ?NotificationService $notifications = null;
    public PurchasesService $purchases;
    public ChatbotService $chatbot;
    public CloudBackupService $cloudBackup;
    public UserManagerSQLiteImportService $userManagerImport;

    public function __construct(?PDO $db = null) {
        $pdo = $db ?: getDB();
        parent::__construct($pdo, $this);
        $this->vouchers = new VoucherService($pdo, $this);
        $this->routerRadius = new RouterRadiusService($pdo, $this);
        $this->financial = new FinancialAccountingService($pdo, $this);
        $this->networkTopology = new NetworkTopologyService($pdo, $this);
        $this->purchases = new PurchasesService($pdo);
        $this->chatbot = new ChatbotService($pdo);
        $this->cloudBackup = new CloudBackupService($pdo, $this);
        $this->userManagerImport = new UserManagerSQLiteImportService($pdo, $this);
    }

    public function getVoucherService(): VoucherService { return $this->vouchers; }
    public function getRouterRadiusService(): RouterRadiusService { return $this->routerRadius; }
    public function getFinancialService(): FinancialAccountingService { return $this->financial; }
    public function getFinancialAccountingService(): FinancialAccountingService { return $this->financial; }
    public function getNetworkTopologyService(): NetworkTopologyService { return $this->networkTopology; }
    public function getPurchasesService(): PurchasesService { return $this->purchases; }
    public function getChatbotService(): ChatbotService { return $this->chatbot; }
    public function getCloudBackupService(): CloudBackupService { return $this->cloudBackup; }
    public function getNotificationService(): NotificationService {
        return $this->notifications ??= new NotificationService($this->db);
    }

    public function getSpeedTiers(bool $activeOnly = false): array {
        return $this->routerRadius->getSpeedTiers($activeOnly);
    }
    public function saveSpeedTier(array $data): array {
        return $this->routerRadius->saveSpeedTier($data);
    }
    public function deleteSpeedTier(int $id): array {
        return $this->routerRadius->deleteSpeedTier($id);
    }
    public function resetSpeedTiers(): array {
        return $this->routerRadius->resetSpeedTiers();
    }

    /**
     * Automatic Delegation to Domain Services for 100% Backward Compatibility
     */
    public function __call(string $name, array $arguments) {
        if (method_exists($this->vouchers, $name)) {
            return $this->vouchers->$name(...$arguments);
        }
        if (method_exists($this->userManagerImport, $name)) {
            return $this->userManagerImport->$name(...$arguments);
        }
        if (method_exists($this->routerRadius, $name)) {
            return $this->routerRadius->$name(...$arguments);
        }
        if (method_exists($this->financial, $name)) {
            return $this->financial->$name(...$arguments);
        }
        if (method_exists($this->networkTopology, $name)) {
            return $this->networkTopology->$name(...$arguments);
        }
        if (method_exists($this->purchases, $name)) {
            return $this->purchases->$name(...$arguments);
        }
        if (method_exists(NotificationService::class, $name)) {
            return $this->getNotificationService()->$name(...$arguments);
        }
        if (method_exists($this->chatbot, $name)) {
            return $this->chatbot->$name(...$arguments);
        }
        throw new BadMethodCallException("Method '$name' does not exist on RadiusService or any of its domain services.");
    }

    // ==========================================
    // METHOD: getNextUsername
    // ==========================================
    public function getNextUsername($role = 'pos_agent') {
        $prefixes = [
            'pos_agent' => 'pos_',
            'distributor' => 'dist_',
            'partner' => 'partner_',
            'supervisor' => 'sup_',
            'accountant' => 'acc_',
            'agent' => 'cust_',
            'system_owner' => 'owner_',
            'superadmin' => 'adm_',
            'regular_node_owner' => 'node_',
            'vip' => 'vip_'
        ];
        $prefix = $prefixes[$role] ?? 'user_';
        $stmt = $this->db->prepare("SELECT username FROM um_admins WHERE username LIKE ?");
        $stmt->execute([$prefix . '%']);
        $maxNum = 0;
        while ($u = $stmt->fetchColumn()) {
            $sub = substr($u, strlen($prefix));
            if (is_numeric($sub)) {
                $num = (int)$sub;
                if ($num > $maxNum) $maxNum = $num;
            }
        }
        $nextNum = $maxNum + 1;
        return sprintf("%s%04d", $prefix, $nextNum);
    }

    // ==========================================
    // METHOD: resolveSystemAccessUrl
    // ==========================================
    public function resolveSystemAccessUrl($customUrl = null) {
        // The configured public domain is authoritative for messages and links.
        // Browser origin may be a private LAN address and must never replace it.
        $settingHost = trim((string)($this->getSettingValue('system_public_domain') ?: $this->getSettingValue('sstp_server_vpn_host')));
        if ($settingHost !== '') {
            if (!str_starts_with($settingHost, 'http://') && !str_starts_with($settingHost, 'https://')) {
                $settingHost = 'http://' . $settingHost;
            }
            $parsedSetting = parse_url($settingHost);
            if (empty($parsedSetting['port']) && ($parsedSetting['scheme'] ?? 'http') === 'http') {
                $settingHost = rtrim($settingHost, '/') . ':8099';
            }
            return rtrim($settingHost, '/');
        }
        if (!empty($customUrl) && filter_var($customUrl, FILTER_VALIDATE_URL)) {
            $parsed = parse_url($customUrl);
            $host = $parsed['host'] ?? '';
            // If customUrl is localhost/127.0.0.1, fallback to VPN/public host
            if (!in_array($host, ['localhost', '127.0.0.1'])) {
                return rtrim($customUrl, '/');
            }
        }
        $reqHost = $_SERVER['HTTP_HOST'] ?? '';
        $reqPort = $_SERVER['SERVER_PORT'] ?? '';
        if (!empty($reqHost) && !in_array(explode(':', $reqHost)[0], ['localhost', '127.0.0.1'])) {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            if (!str_contains($reqHost, ':') && $reqPort && $reqPort !== '80' && $reqPort !== '443') {
                $reqHost .= ':' . $reqPort;
            }
            return "$scheme://$reqHost";
        }
        $host = gethostname() ?: 'localhost';
        if (!str_contains($host, ':')) {
            $host .= ':8099';
        }
        if (!str_starts_with($host, 'http://') && !str_starts_with($host, 'https://')) {
            $host = 'http://' . $host;
        }
        return rtrim($host, '/');
    }

    // ==========================================
    // METHOD: changeOwnPassword
    // ==========================================
    public function changeOwnPassword($currentPassword, $newPassword, $currentAdminId) {
        $currentAdminId = (int)$currentAdminId;
        if ($currentAdminId <= 0) {
            throw new Exception('جلسة المستخدم غير صالحة');
        }
        $stmt = $this->db->prepare("SELECT id, username, fullname, password_hash, must_change_password FROM um_admins WHERE id = ? AND is_active = 1 LIMIT 1");
        $stmt->execute([$currentAdminId]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$admin) throw new Exception('الحساب غير موجود أو معطل');

        $mustChange = (int)($admin['must_change_password'] ?? 0);
        // If not forced change, require valid current password
        if ($mustChange === 0) {
            if (empty($currentPassword) || !password_verify($currentPassword, (string)($admin['password_hash'] ?? ''))) {
                throw new Exception('كلمة المرور الحالية غير صحيحة');
            }
        }
        self::validatePasswordStrength($newPassword);
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $this->db->prepare("UPDATE um_admins SET password_hash = ?, must_change_password = 0 WHERE id = ?");
        $stmt->execute([$newHash, $currentAdminId]);
        try {
            $this->logActivity('change_password', 'auth', 'تغيير كلمة المرور: ' . $admin['fullname'], 'قام المستخدم بتغيير كلمة المرور الخاصة به بنجاح', 'success', $currentAdminId);
        } catch (Throwable $e) {}
        return ['success' => true, 'message' => 'تم تغيير كلمة المرور بنجاح'];
    }
    public const ROLE_HIERARCHY = [
        'system_owner' => 1000,
        'superadmin' => 100,
        'partner' => 80,
        'accountant' => 60,
        'finance' => 60,
        'supervisor' => 60,
        'main_node_owner' => 50,
        'distributor' => 40,
        'sub_node_owner' => 30,
        'pos_agent' => 20,
        'regular_node_owner' => 20,
        'technician' => 20,
        'maintenance' => 20,
        'vip' => 10,
        'agent' => 5,
        'user' => 10
    ];

    // ==========================================
    // METHOD: validatePasswordStrength
    // ==========================================
    public static function validatePasswordStrength($password) {
        $password = (string)$password;
        if (mb_strlen($password) < 8) {
            throw new Exception('كلمة المرور ضعيفة: يجب ألا تقل عن 8 خانات/حروف.');
        }
        if (!preg_match('/[A-Z]/', $password)) {
            throw new Exception('كلمة المرور ضعيفة: يجب أن تحتوي على حرف كبير واحد على الأقل (A-Z).');
        }
        if (!preg_match('/[a-z]/', $password)) {
            throw new Exception('كلمة المرور ضعيفة: يجب أن تحتوي على حرف صغير واحد على الأقل (a-z).');
        }
        if (!preg_match('/[0-9]/', $password)) {
            throw new Exception('كلمة المرور ضعيفة: يجب أن تحتوي على رقم واحد على الأقل (0-9).');
        }
        if (!preg_match('/[^A-Za-z0-9]/', $password)) {
            throw new Exception('كلمة المرور ضعيفة: يجب أن تحتوي على رمز خاص واحد على الأقل مثل (@ # $ % ! ^ & * _ - +).');
        }
        return true;
    }

    // ==========================================
    // METHOD: getActiveAdminContext
    // ==========================================
    public function getActiveAdminContext(?int $adminId = null) {
        if ($adminId === null) {
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
        }
        $stmt = $this->db->prepare("SELECT id, username, fullname, role, parent_id, data_scope, delegated_admin_ids, allowed_networks, credit_limit, discount_rate, permissions, is_active FROM um_admins WHERE id = ? LIMIT 1");
        $stmt->execute([$adminId]);
        $admin = $stmt->fetch();
        if ($admin) {
            $activeNetworkId = $this->getActiveNetworkId();
            $networkRoleStmt = $this->db->prepare('SELECT role_key,data_scope FROM um_admin_network_roles WHERE admin_id=? AND network_id=? AND is_active=1 LIMIT 1');
            $networkRoleStmt->execute([(int)$admin['id'], $activeNetworkId]);
            $networkRole = $networkRoleStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $role = (string)($networkRole['role_key'] ?? $admin['role'] ?? 'pos_agent');
            $dataScope = $networkRole['data_scope'] ?? $admin['data_scope'] ?? (in_array($role, ['system_owner', 'superadmin'], true) ? 'all' : 'own');
            $delegatedIds = json_decode((string)$admin['delegated_admin_ids'], true) ?: [];
            $allowedStmt = $this->db->prepare('SELECT network_id FROM um_admin_network_access WHERE admin_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY network_id');
            $allowedStmt->execute([(int)$admin['id']]);
            $allowedNetworks = array_map('intval', $allowedStmt->fetchAll(PDO::FETCH_COLUMN));
            $rolePerms = [];
            if (!empty($role)) {
                $roleStmt = $this->db->prepare("SELECT permissions FROM um_roles_def WHERE role_key = ? LIMIT 1");
                $roleStmt->execute([$role]);
                $rolePerms = json_decode($roleStmt->fetchColumn() ?: '[]', true) ?: [];
            }
            $userPerms = json_decode((string)$admin['permissions'], true) ?: [];
            $effectivePerms = in_array($role, ['system_owner', 'superadmin'], true) ? ['*'] : array_values(array_unique(array_merge($rolePerms, $userPerms)));
            return [
                'id' => (int)$admin['id'],
                'username' => $admin['username'],
                'fullname' => $admin['fullname'],
                'role' => $role,
                'parent_id' => $admin['parent_id'] ? (int)$admin['parent_id'] : null,
                'data_scope' => $dataScope,
                'delegated_ids' => $delegatedIds,
                'allowed_networks' => $allowedNetworks,
                'active_network_id' => $activeNetworkId,
                'credit_limit' => (float)$admin['credit_limit'],
                'discount_rate' => (float)$admin['discount_rate'],
                'permissions' => $effectivePerms,
                'is_active' => (int)$admin['is_active']
            ];
        }
        return [
            'id' => 1,
            'username' => 'admin',
            'fullname' => 'المدير العام',
            'role' => 'system_owner',
            'parent_id' => null,
            'data_scope' => 'all',
            'delegated_ids' => [],
            'allowed_networks' => null,
            'active_network_id' => (int)($_SESSION['active_network_id'] ?? 0),
            'credit_limit' => 0,
            'discount_rate' => 0,
            'permissions' => ['*'],
            'is_active' => 1
        ];
    }

    // ==========================================
    // METHOD: checkPermission
    // ==========================================
    public function checkPermission(string|array $requiredPerm, ?int $adminId = null): bool {
        $ctx = $this->getActiveAdminContext($adminId);
        $role = $ctx['role'] ?? 'pos_agent';
        $reqList = is_array($requiredPerm) ? $requiredPerm : [$requiredPerm];
        if (in_array((string)$role, ['system_owner', 'superadmin', 'admin', 'superadmin'], true)) {
            return true;
        }
        $perms = $ctx['permissions'] ?? [];
        if (in_array('*', $perms, true)) {
            return true;
        }
        foreach ($reqList as $req) {
            if (in_array($req, $perms, true)) {
                return true;
            }
        }
        // Role-based defaults fallback
        $roleActionDefaults = [
            'distributor' => ['dashboard', 'sales', 'sales_create_invoice', 'sales_sell_paper_cards', 'sales_transfer_sheets', 'sales_invoice_pay', 'sales_invoice_return', 'card_warehouses', 'warehouse_stock_transfer', 'admins_agents', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'cashbox_accounts', 'subscriber_portal'],
            'pos_agent' => ['dashboard', 'sales', 'sales_create_invoice', 'sales_sell_paper_cards', 'sales_transfer_sheets', 'card_warehouses', 'warehouse_stock_transfer', 'subscriber_portal'],
            'partner' => ['dashboard', 'financial_reports', 'partners_equity', 'networks_partnerships', 'cost_centers', 'port_analytics', 'routers', 'sstp_vpn', 'network_nodes', 'assets', 'logs', 'subscriber_portal'],
            'finance' => ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'vouchers_delete', 'financial_reports', 'sales', 'sales_invoice_pay', 'subscriber_portal'],
            'accountant' => ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'financial_reports', 'sales', 'sales_invoice_pay', 'subscriber_portal'],
            'maintenance' => ['dashboard', 'network_nodes', 'assets', 'routers', 'noc', 'subscriber_portal'],
            'vip' => ['dashboard', 'free_vouchers', 'free_vouchers_grant', 'subscriber_portal']
        ];
        $defaults = $roleActionDefaults[$role] ?? [];
        foreach ($reqList as $req) {
            if (in_array($req, $defaults, true)) {
                return true;
            }
        }
        return false;
    }

    // ==========================================
    // METHOD: enforcePermission
    // ==========================================
    public function enforcePermission(string|array $requiredPerm, string $actionName = 'هذه العملية', ?int $adminId = null): void {
        if (!$this->checkPermission($requiredPerm, $adminId)) {
            $msg = is_array($requiredPerm) ? implode(' أو ', $requiredPerm) : $requiredPerm;
            throw new Exception("عذراً، ليس لديك الصلاحية الكافية لتنفيذ {$actionName} [{$msg}]");
        }
    }

    // ==========================================
    // METHOD: getAdmins
    // ==========================================
    public function getAdmins($role = '', $search = '') {
        $this->enforcePermission('admins_view', 'مشاهدة المستخدمين والوكلاء');
        $ctx = $this->getActiveAdminContext();
        $networkId = (int)($ctx['active_network_id'] ?? 0);
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        $where = [];
        $params = [];

        // This screen is network-scoped even for system_owner: the active network
        // selected in the session/header is the only network whose hierarchy may be listed.
        // Switching networks explicitly is the supported way to view another hierarchy.
        if ($networkId > 0) {
            $where[] = "nx.network_id = :active_network AND nx.is_active = 1";
            $params[':active_network'] = $networkId;
        }

        if (!in_array((string)$callerRole, ['system_owner', 'superadmin'], true) && ($ctx['data_scope'] ?? '') !== 'all') {
            if ($ctx['data_scope'] === 'assigned') {
                $delegated = array_merge([$callerId], $ctx['delegated_ids'] ?: []);
                $cleanIds = array_filter(array_map('intval', $delegated));
                $placeholders = !empty($cleanIds) ? implode(',', $cleanIds) : (string)$callerId;
                $where[] = "(a.id IN ($placeholders) OR a.parent_id = $callerId OR a.created_by_admin_id = $callerId)";
            } else {
                $where[] = "(a.id = $callerId OR a.parent_id = $callerId OR a.created_by_admin_id = $callerId)";
            }
        }
        if (!empty($role)) {
            $where[] = "COALESCE(nr.role_key, a.role) = :role";
            $params[':role'] = $role;
        }
        if (!empty($search)) {
            $where[] = "(a.username LIKE :admin_username_search OR a.fullname LIKE :admin_fullname_search OR a.phone LIKE :admin_phone_search)";
            $params[':admin_username_search'] = "%$search%";
            $params[':admin_fullname_search'] = "%$search%";
            $params[':admin_phone_search'] = "%$search%";
        }
        $whereClause = !empty($where) ? "WHERE " . implode(' AND ', $where) : "";
        $netCond = $networkId > 0 ? " AND nx.network_id = " . (int)$networkId : "";
        $roleNetCond = $networkId > 0 ? " AND nr.network_id = " . (int)$networkId : "";
        $balNetCond = $networkId > 0 ? " AND nb.network_id = " . (int)$networkId : "";
        $coaNetCond = $networkId > 0 ? " AND coa.network_id = " . (int)$networkId : "";

        $sql = "SELECT a.*, COALESCE(nr.role_key, a.role) role, COALESCE(nr.data_scope, a.data_scope) data_scope,
                       COALESCE(nb.balance, 0) balance, COALESCE(nb.credit_limit, a.credit_limit) credit_limit, p.fullname as parent_name,
                       coa.account_code,
                       coa.name_ar as account_name,
                       coa.balance as account_balance,
                       (SELECT GROUP_CONCAT(DISTINCT na.network_id ORDER BY na.network_id SEPARATOR ',')
                          FROM um_admin_network_access na
                         WHERE na.admin_id = a.id AND na.is_active = 1
                           AND (na.starts_at IS NULL OR na.starts_at <= NOW())
                           AND (na.expires_at IS NULL OR na.expires_at > NOW())) AS network_ids_csv
                FROM um_admins a 
                LEFT JOIN um_admin_network_access nx ON nx.admin_id = a.id $netCond
                LEFT JOIN um_admin_network_roles nr ON nr.admin_id = a.id $roleNetCond AND nr.is_active = 1
                LEFT JOIN um_admin_network_balances nb ON nb.admin_id = a.id $balNetCond
                LEFT JOIN um_admins p ON a.parent_id = p.id 
                LEFT JOIN um_chart_of_accounts coa ON a.account_id = coa.id $coaNetCond
                $whereClause 
                GROUP BY a.id
                ORDER BY a.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $admins = $stmt->fetchAll();
        foreach ($admins as &$adm) {
            unset($adm['password_hash']);
            $adm['network_ids'] = array_values(array_filter(array_map('intval', explode(',', (string)($adm['network_ids_csv'] ?? '')))));
            unset($adm['network_ids_csv']);
            if (!empty($adm['permissions']) && is_string($adm['permissions'])) {
                $adm['permissions'] = json_decode($adm['permissions'], true);
            }
        }
        return $admins;
    }

    // ==========================================
    // METHOD: getAdminDescendantIds
    // ==========================================
    public function getAdminDescendantIds($adminId) {
        $networkId = $this->getActiveNetworkId();
        $descendants = [];
        $queue = [(int)$adminId];
        while (!empty($queue)) {
            $parentId = array_shift($queue);
            $stmt = $this->db->prepare("SELECT a.id FROM um_admins a LEFT JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 WHERE a.parent_id = ? AND a.is_active = 1");
            $stmt->execute([$networkId,$parentId]);
            $children = $stmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($children as $childId) {
                $cId = (int)$childId;
                if (!in_array($cId, $descendants, true) && $cId !== (int)$adminId) {
                    $descendants[] = $cId;
                    $queue[] = $cId;
                }
            }
        }
        return $descendants;
    }

    // ==========================================
    // METHOD: getAdminById
    // ==========================================
    public function getAdminById($id, ?int $networkId = null) {
        $this->enforcePermission('admins_view', 'مشاهدة بيانات المستخدم');
        $id = (int)$id;
        $ctx = $this->getActiveAdminContext();
        if ($networkId === null || $networkId <= 0) {
            $networkId = (int)($ctx['active_network_id'] ?? 0);
        }
        if ($networkId <= 0) {
            $networkId = $this->getActiveNetworkId();
        }

        if (!in_array((string)$ctx['role'], ['system_owner', 'superadmin'], true) && $networkId > 0) {
            $membership = $this->db->prepare('SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1');
            $membership->execute([$id, $networkId]);
            if (!(int)$membership->fetchColumn()) throw new DomainException('FORBIDDEN_NETWORK');
        }

        // Security check: non-superadmin cannot inspect arbitrary admins outside scope
        if (!in_array((string)$ctx['role'], ['system_owner', 'superadmin'], true)) {
            $stmtChk = $this->db->prepare("SELECT id, parent_id FROM um_admins WHERE id = ?");
            $stmtChk->execute([$id]);
            $chk = $stmtChk->fetch();
            if (!$chk) throw new Exception('الحساب غير موجود');
            $allowed = ($chk['id'] == $ctx['id']) || ($chk['parent_id'] == $ctx['id']) || in_array($chk['id'], $ctx['delegated_ids'] ?: []);
            if (!$allowed) {
                throw new Exception('غير مصرح: ليس لديك صلاحية لعرض بيانات هذا الحساب');
            }
        }

        $roleNetCond = $networkId > 0 ? " AND nr.network_id = " . (int)$networkId : "";
        $balNetCond = $networkId > 0 ? " AND nb.network_id = " . (int)$networkId : "";
        $coaNetCond = $networkId > 0 ? " AND coa.network_id = " . (int)$networkId : "";

        $stmt = $this->db->prepare("SELECT a.*, COALESCE(nr.role_key, a.role) role, COALESCE(nr.data_scope, a.data_scope) data_scope, COALESCE(nb.balance, 0) balance, COALESCE(nb.credit_limit, a.credit_limit) credit_limit, p.fullname as parent_name,
                          coa.account_code,
                          coa.name_ar as account_name,
                          coa.balance as account_balance,
                          (SELECT GROUP_CONCAT(DISTINCT na.network_id ORDER BY na.network_id SEPARATOR ',')
                             FROM um_admin_network_access na
                            WHERE na.admin_id = a.id AND na.is_active = 1
                              AND (na.starts_at IS NULL OR na.starts_at <= NOW())
                              AND (na.expires_at IS NULL OR na.expires_at > NOW())) AS network_ids_csv
                 FROM um_admins a 
                 LEFT JOIN um_admin_network_roles nr ON nr.admin_id = a.id $roleNetCond AND nr.is_active = 1
                 LEFT JOIN um_admin_network_balances nb ON nb.admin_id = a.id $balNetCond
                 LEFT JOIN um_admins p ON a.parent_id = p.id 
                 LEFT JOIN um_chart_of_accounts coa ON a.account_id = coa.id $coaNetCond
                 WHERE a.id = ? LIMIT 1");
        $stmt->execute([$id]);
        $adm = $stmt->fetch();
        if ($adm) {
            unset($adm['password_hash']);
            $adm['network_ids'] = array_values(array_filter(array_map('intval', explode(',', (string)($adm['network_ids_csv'] ?? '')))));
            unset($adm['network_ids_csv']);
            if (!empty($adm['permissions']) && is_string($adm['permissions'])) {
                $adm['permissions'] = json_decode($adm['permissions'], true);
            }
        }
        return $adm;
    }

    // ==========================================
    // METHOD: saveAdmin
    // ==========================================
    public function saveAdmin($data) {
        $username = trim($data['username'] ?? '');
        $fullname = trim($data['fullname'] ?? '');
        $phone = normalizeYemenPhone(trim($data['phone'] ?? ''));
        $email = trim($data['email'] ?? '');
        $targetRole = $data['role'] ?? 'pos_agent';
        $ctx = $this->getActiveAdminContext();
        $activeNetworkId = (int)($ctx['active_network_id'] ?? $this->getActiveNetworkId());
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        $callerLevel = self::ROLE_HIERARCHY[$callerRole] ?? 0;
        $targetRoleLevel = self::ROLE_HIERARCHY[$targetRole] ?? 0;
        $isEdit = !empty($data['id']);
        $targetId = $isEdit ? (int)$data['id'] : 0;
        $isSelf = ($isEdit && $targetId === $callerId);
        $systemOwnerId = (int)$this->db->query("SELECT MIN(admin_id) FROM um_system_owners")->fetchColumn();
        $isGlobalSystemOwner = ((string)$callerRole === 'system_owner' || $callerId === $systemOwnerId);
        $canAssignNetworkMemberships = true;
        if ($targetRole === 'system_owner' && (!$isEdit || $targetId !== $systemOwnerId)) {
            throw new Exception('رتبة مالك النظام فريدة ومحجوزة لصاحب النظام فقط');
        }
        if ($isEdit && $targetId === $systemOwnerId && $callerId !== $systemOwnerId) {
            throw new Exception('لا يمكن لأي حساب آخر تعديل حساب مالك النظام');
        }
        if ($isEdit && $targetId === $systemOwnerId && $targetRole !== 'system_owner') {
            throw new Exception('لا يمكن تغيير رتبة مالك النظام أو تخفيضها');
        }
        if (!$isSelf) {
            $this->enforcePermission($isEdit ? 'admins_edit' : 'admins_add', $isEdit ? 'تعديل المستخدم' : 'إضافة مستخدم');
        }
        // 1. Mandatory Validations
        if (empty($fullname)) {
            throw new Exception('الاسم الكامل / اسم المحل إجباري');
        }
        if (empty($phone)) {
            throw new Exception('رقم الهاتف / الواتساب إجباري');
        }
        // Auto-fill fallback email if not provided for quick POS/agents
        if (empty($email)) {
            $cleanU = preg_replace('/[^a-zA-Z0-9_\.]/', '', strtolower($username ?: 'pos_user'));
            if (!$cleanU) $cleanU = 'user_' . ($targetId ?: time());
            $email = $cleanU . '@pos.local';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('يرجى إدخال بريد إلكتروني صحيح');
        }
        // 2. Uniqueness Validations across all users
        $chkName = $this->db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?)) AND id != ? AND fullname != '' LIMIT 1");
        $chkName->execute([$fullname, $targetId]);
        if ($chkName->fetch()) {
            throw new Exception('الاسم الكامل / اسم المحل مسجل مسبقاً لمستخدم آخر. يرجى إدخال اسم فريد وغير مكرر.');
        }
        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        $chkPhone = $this->db->prepare("SELECT id FROM um_admins WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?) AND id != ? AND phone != '' AND phone IS NOT NULL LIMIT 1");
        $chkPhone->execute([$phone, $cleanPhone, $targetId]);
        if ($chkPhone->fetch()) {
            throw new Exception('رقم الهاتف مسجل مسبقاً لمستخدم آخر في المنظومة. يجب أن يكون رقم الهاتف فريداً.');
        }
        // Uniqueness check for email (exclude system generated fallback domain if shared)
        if (!str_ends_with($email, '@pos.local')) {
            $chkEmail = $this->db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ? AND email != '' AND email IS NOT NULL LIMIT 1");
            $chkEmail->execute([$email, $targetId]);
            if ($chkEmail->fetch()) {
                throw new Exception('البريد الإلكتروني مسجل مسبقاً لمستخدم آخر. يرجى إدخال بريد إلكتروني فريد.');
            }
        }
        // Auto-generate sequential username if empty on new user
        if (!$isEdit && empty($username)) {
            $username = $this->getNextUsername($targetRole);
        }
        if (empty($username)) {
            throw new Exception('اسم المستخدم مطلوب');
        }
        // Check username uniqueness
        $chkUser = $this->db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) AND id != ? LIMIT 1");
        $chkUser->execute([$username, $targetId]);
        if ($chkUser->fetch()) {
            throw new Exception('اسم المستخدم مسجل مسبقاً في النظام. يرجى اختيار اسم مستخدم آخر.');
        }
        // =========================================================================
        // SECURITY RULE 1: SELF-MODIFICATION TAMPERING PROTECTION
        // =========================================================================
        if ($isSelf) {
            $currentRecord = $this->db->query("SELECT * FROM um_admins WHERE id = $callerId")->fetch(PDO::FETCH_ASSOC);
            if (!$currentRecord) throw new Exception('الحساب غير موجود');
            $accountId = $currentRecord['account_id'] ? (int)$currentRecord['account_id'] : null;
            $params = [
                ':fullname' => $fullname,
                ':phone' => $phone,
                ':email' => $email,
                ':notes' => trim($data['notes'] ?? ''),
                ':id' => $callerId
            ];
            $sql = "UPDATE um_admins SET fullname=:fullname, phone=:phone, email=:email, notes=:notes";
            if (!empty($data['password'])) {
                $pass = trim($data['password']);
                self::validatePasswordStrength($pass);
                $sql .= ", password_hash=:pass, must_change_password=0";
                $params[':pass'] = password_hash($pass, PASSWORD_BCRYPT);
            }
            $sql .= " WHERE id=:id";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return ['success' => true, 'id' => $callerId, 'account_id' => $accountId, 'message' => 'تم تحديث بياناتك الشخصية بنجاح'];
        }
        // =========================================================================
        // SECURITY RULE 2: PRIVILEGE ESCALATION PREVENTION
        // =========================================================================
        if (!in_array((string)$callerRole, ['system_owner', 'superadmin'], true)) {
            if ($targetRoleLevel >= $callerLevel) {
                throw new Exception("غير مصرح: رتبتك ({$callerRole}) لا تسمح لك بتعيين أو تعديل رتبة ({$targetRole}) مساوية لك أو أعلى منك في الهيكل الإداري");
            }
        }
        // =========================================================================
        // SECURITY RULE 3: SUBORDINATION & BRANCH SCOPE ENFORCEMENT
        // =========================================================================
        if (!in_array((string)$callerRole, ['system_owner', 'superadmin'], true)) {
            if ($isEdit) {
                $targetRecord = $this->db->query("SELECT id, role, parent_id, account_id FROM um_admins WHERE id = $targetId")->fetch(PDO::FETCH_ASSOC);
                if (!$targetRecord) throw new Exception('الحساب المراد تعديله غير موجود');
                $isSubordinate = ((int)$targetRecord['parent_id'] === $callerId) || in_array($targetId, $ctx['delegated_ids'] ?: []);
                if (!$isSubordinate) {
                    throw new Exception('غير مصرح: لا تملك صلاحية تعديل هذا الحساب لأنه خارج نطاق تبعيتك وفرعك الإداري');
                }
                $existingLevel = self::ROLE_HIERARCHY[$targetRecord['role']] ?? 0;
                if ($existingLevel >= $callerLevel) {
                    throw new Exception('غير مصرح: لا يمكنك تعديل حساب مسؤول يملك رتبة مساوية لك أو أعلى منك');
                }
                $parentId = (int)$targetRecord['parent_id'];
            } else {
                $parentId = $callerId;
            }
        } else {
            $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : null;
        }
        // =========================================================================
        // SECURITY RULE 4: NETWORK & DATA SCOPE ISOLATION
        // =========================================================================
        $allowedNetworks = null;
        if (isset($data['allowed_networks'])) {
            if (is_array($data['allowed_networks'])) {
                $cleanNets = array_values(array_filter(array_map('intval', $data['allowed_networks'])));
                $allowedNetworks = !empty($cleanNets) ? json_encode($cleanNets) : null;
            } else if (is_string($data['allowed_networks'])) {
                $t = trim($data['allowed_networks']);
                $allowedNetworks = ($t === '' || $t === 'all' || $t === 'null') ? null : $t;
            }
        }
        $dataScope = $isGlobalSystemOwner ? (in_array($data['data_scope'] ?? '', ['all','own','children','assigned','delegated','network']) ? $data['data_scope'] : 'own') : (in_array($data['data_scope'] ?? '', ['own','children','assigned','delegated','network']) ? $data['data_scope'] : 'own');

        // Membership is explicit and anchored to the active network.
        $hasNetworksKey = array_key_exists('allowed_networks', $data);
        $replaceNetworkAssignments=$hasNetworksKey||!$isEdit;
        if(!$replaceNetworkAssignments){
            $membershipStmt=$this->db->prepare('SELECT network_id FROM um_admin_network_access WHERE admin_id=? AND is_active=1 ORDER BY is_default DESC,network_id');
            $membershipStmt->execute([$targetId]);$membershipNetworkIds=array_map('intval',$membershipStmt->fetchAll(PDO::FETCH_COLUMN));
        }elseif($allowedNetworks!==null){
            $membershipNetworkIds=array_values(array_unique(array_map('intval',json_decode((string)$allowedNetworks,true)?:[])));
        }else{
            if ($isEdit && !$isSelf) {
                throw new DomainException('NETWORK_CONTEXT_REQUIRED');
            }
            $membershipNetworkIds=[(int)$ctx['active_network_id']];
        }
        if(!$membershipNetworkIds)$membershipNetworkIds=[(int)$ctx['active_network_id']];
        $callerNetworkIds=array_map('intval',(array)($ctx['allowed_network_ids'] ?? $ctx['allowed_networks'] ?? []));
        if(empty($callerNetworkIds) && !empty($ctx['active_network_id'])) $callerNetworkIds = [(int)$ctx['active_network_id']];
        if(!$isGlobalSystemOwner && array_diff($membershipNetworkIds,$callerNetworkIds)) throw new Exception('غير مصرح: لا يمكنك تخصيص أو نقل حساب إلى شبكة خارج نطاق صلاحياتك الإدارية');
        $delegatedIds = is_array($data['delegated_admin_ids'] ?? null) ? json_encode(array_map('intval', $data['delegated_admin_ids'])) : ($data['delegated_admin_ids'] ?? null);
        // =========================================================================
        // SECURITY RULE 5: FINANCIAL CEILINGS (DISCOUNT & CREDIT LIMITS)
        // =========================================================================
        $discountRate = min(5.0, max(0.0, (float)($data['discount_rate'] ?? 0)));
        $creditLimit = (float)($data['credit_limit'] ?? 0);
        if (!in_array((string)$callerRole, ['system_owner', 'superadmin'], true)) {
            $callerDiscount = (float)($ctx['discount_rate'] ?? 0);
            if ($discountRate > $callerDiscount) {
                throw new Exception("تجاوز سقف الخصم: أقصى نسبة خصم يمكنك منحها لمرؤوسيك هي ({$callerDiscount}%)");
            }
        }
        // =========================================================================
        // SECURITY RULE 6: PERMISSIONS INHERITANCE / DRIFT PROTECTION
        // =========================================================================
        $permissions = null;
        if (isset($data['permissions'])) {
            $permsArray = is_array($data['permissions']) ? $data['permissions'] : (json_decode((string)$data['permissions'], true) ?: []);
            if (!in_array((string)$callerRole, ['system_owner', 'superadmin'], true)) {
                $callerPerms = is_array($ctx['permissions']) ? $ctx['permissions'] : [];
                $invalidPerms = array_diff($permsArray, $callerPerms);
                if (!empty($invalidPerms)) {
                    throw new Exception('غير مصرح: لا يمكنك منح صلاحيات لا يمتلكها حسابك في المنظومة');
                }
            }
            $permissions = json_encode(array_values($permsArray));
        }
        // Profile Quotas
        $freeProf = !empty($data['free_profile']) ? trim($data['free_profile']) : null;
        if ($freeProf) {
            $chkProf = $this->db->prepare("SELECT price FROM um_profiles_def WHERE network_id=? AND name = ?");
            $chkProf->execute([$activeNetworkId,$freeProf]);
            $profRow = $chkProf->fetch(PDO::FETCH_ASSOC);
            if ($profRow && (float)$profRow['price'] > 0 && !str_starts_with($freeProf, 'Free-')) {
                throw new Exception('لا يمكن تعيين باقة غير مجانية (مدفوعة) كباقة مجانية افتراضية للحساب');
            }
        }
        // =========================================================================
        // 7. CHART OF ACCOUNTS (شجرة الحسابات المالية)
        // =========================================================================
        $accountId = null;
        // A newly created network may not have its accounting roots yet. Create
        // the minimal network-local parents before linking the user's account;
        // otherwise adding the first user in that network fails with an internal
        // error even though the user data is valid.
        $rootAccounts = [
            ['1300', 'المدينون والذمم المدينة', 'asset'],
            ['1301', 'ذمم الموزعين والوكلاء', 'asset'],
            ['1302', 'عهد الموظفين وسلف العمل', 'asset'],
            ['3200', 'الحسابات الجارية للشركاء', 'equity'],
            ['3202', 'جاري الشركاء الآخرين', 'equity']
        ];
        $rootCheck = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=? LIMIT 1');
        $rootInsert = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance) VALUES (?,?,?,?,NULL,1,1,1,0.00)");
        foreach ($rootAccounts as [$rootCode, $rootName, $rootType]) {
            $rootCheck->execute([$activeNetworkId, $rootCode]);
            if (!$rootCheck->fetchColumn()) $rootInsert->execute([$activeNetworkId, $rootCode, $rootName, $rootType]);
        }
        if ($isEdit) {
            $existing=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? ORDER BY id LIMIT 1");
            $existing->execute([$activeNetworkId,$targetId]);
            $accountId=(int)$existing->fetchColumn() ?: null;
        }
        if (!$accountId) {
            $parentsQ=$this->db->prepare("SELECT id,account_code FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('1301','1300','3202','3200','1302')");$parentsQ->execute([$activeNetworkId]);$pm=[];foreach($parentsQ->fetchAll(PDO::FETCH_ASSOC) as $pr)$pm[$pr['account_code']]=(int)$pr['id'];
            $parentReceivables=$pm['1301']??$pm['1300']??0;$parentPartners=$pm['3202']??$pm['3200']??0;$parentEmployees=$pm['1302']??0;
            $parentIdCOA = $parentReceivables;
            $pCode = '1301';
            $type = 'asset';
            $level = 3;
            $roleParentStmt = $this->db->prepare("SELECT parent_account_id FROM um_roles_def WHERE role_key = ?");
            $roleParentStmt->execute([$targetRole]);
            $customParentId = (int)$roleParentStmt->fetchColumn();
            if ($customParentId) {
                $parentAccQ=$this->db->prepare("SELECT account_code,account_type,level FROM um_chart_of_accounts WHERE network_id=? AND id=?");$parentAccQ->execute([$activeNetworkId,$customParentId]);$parentAccRow=$parentAccQ->fetch(PDO::FETCH_ASSOC);
                if ($parentAccRow) {
                    $parentIdCOA = $customParentId;
                    $pCode = $parentAccRow['account_code'];
                    $type = $parentAccRow['account_type'];
                    $level = ((int)$parentAccRow['level']) + 1;
                }
            } else if ($targetRole === 'partner') {
                $parentIdCOA = $parentPartners ?: $parentReceivables;
                $pCode = '3202';
                $type = 'equity';
            } elseif (in_array($targetRole, ['accountant', 'supervisor', 'technician', 'employee'])) {
                $parentIdCOA = $parentEmployees ?: $parentReceivables;
                $pCode = '1302';
                $type = 'asset';
            }
            if (!$parentIdCOA) {
                throw new Exception('الحساب الأب للذمم غير موجود في الشبكة النشطة');
            }
            $sq=$this->db->prepare("SELECT COUNT(*) FROM um_chart_of_accounts WHERE network_id=? AND parent_id=?");$sq->execute([$activeNetworkId,$parentIdCOA]);$siblings=(int)$sq->fetchColumn();
            $next = $siblings + 1;
            $code = $pCode . ($next < 10 ? '0' . $next : $next);
            $accName = ($targetRole === 'partner' ? 'جاري الشريك: ' : 'ذمة: ') . $fullname;
            $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance) VALUES (?,?,?,?,?,?,0,1,0.00)");
            $ins->execute([$activeNetworkId,$code,$accName,$type,$parentIdCOA,$level]);
            $accountId = (int)$this->db->lastInsertId();
        }
        $params = [
            ':fullname' => $fullname,
            ':phone' => $phone,
            ':email' => $email,
            ':role' => $targetRole,
            ':parent_id' => $parentId,
            ':account_id' => $accountId,
            ':credit_limit' => $creditLimit,
            ':discount_rate' => $discountRate,
            ':max_cards_quota' => (int)($data['max_cards_quota'] ?? 0),
            ':free_profile' => $freeProf,
            ':free_cards_quota' => (int)($data['free_cards_quota'] ?? 0),
            ':data_scope' => $dataScope,
            ':delegated_admin_ids' => $delegatedIds,
            ':allowed_networks' => $allowedNetworks,
            ':permissions' => $permissions,
            ':is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1,
            ':notes' => trim($data['notes'] ?? '')
        ];
        if ($isEdit) {
            $sql = "UPDATE um_admins SET fullname=:fullname, phone=:phone, email=:email, role=:role, parent_id=:parent_id, account_id=:account_id, credit_limit=:credit_limit, discount_rate=:discount_rate, max_cards_quota=:max_cards_quota, free_profile=:free_profile, free_cards_quota=:free_cards_quota, data_scope=:data_scope, delegated_admin_ids=:delegated_admin_ids, allowed_networks=:allowed_networks, permissions=:permissions, is_active=:is_active, notes=:notes";
            if (!empty($data['password'])) {
                $pass = trim($data['password']);
                self::validatePasswordStrength($pass);
                $sql .= ", password_hash=:pass";
                $params[':pass'] = password_hash($pass, PASSWORD_BCRYPT);
            }
            $sql .= " WHERE id=:id";
            $params[':id'] = $targetId;
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            if ($accountId) {
                $this->db->prepare("UPDATE um_chart_of_accounts SET linked_admin_id=?,owner_admin_id=? WHERE network_id=? AND id=?")->execute([$targetId,$targetId,$activeNetworkId,$accountId]);
            }
            $this->syncAdminNetworkAssignments($targetId,$membershipNetworkIds,$targetRole,$dataScope,$creditLimit,$callerId,$replaceNetworkAssignments);
            if (!empty($phone)) {
                try {
                    require_once __DIR__ . '/WhatsAppService.php';
                    WhatsAppService::sendAccountNotification($this->db, [
                        'fullname' => $fullname,
                        'username' => $username,
                        'phone' => $phone,
                        'role' => $targetRole
                    ], true, !empty($data['password']) ? trim($data['password']) : null, $activeNetworkId);
                } catch (Throwable $waErr) {}
            }
            return ['success' => true, 'id' => $targetId, 'account_id' => $accountId];
        } else {
            if (empty($data['password'])) throw new Exception('كلمة المرور مطلوبة للمستخدم الجديد');
            $pass = trim($data['password']);
            self::validatePasswordStrength($pass);
            $params[':username'] = $username;
            $params[':pass'] = password_hash($pass, PASSWORD_BCRYPT);
            $params[':created_by_admin_id'] = $callerId;
            $params[':created_by_name'] = $ctx['fullname'];
            $sql = "INSERT INTO um_admins (username, password_hash, fullname, phone, email, role, parent_id, account_id, credit_limit, discount_rate, max_cards_quota, free_profile, free_cards_quota, data_scope, delegated_admin_ids, allowed_networks, created_by_admin_id, created_by_name, permissions, is_active, notes, must_change_password)
                    VALUES (:username, :pass, :fullname, :phone, :email, :role, :parent_id, :account_id, :credit_limit, :discount_rate, :max_cards_quota, :free_profile, :free_cards_quota, :data_scope, :delegated_admin_ids, :allowed_networks, :created_by_admin_id, :created_by_name, :permissions, :is_active, :notes, 1)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $newAdminId = (int)$this->db->lastInsertId();
            if ($accountId) {
                $this->db->prepare("UPDATE um_chart_of_accounts SET linked_admin_id=?,owner_admin_id=? WHERE network_id=? AND id=?")->execute([$newAdminId,$newAdminId,$activeNetworkId,$accountId]);
            }
            $this->syncAdminNetworkAssignments($newAdminId,$membershipNetworkIds,$targetRole,$dataScope,$creditLimit,$callerId,true);
            // =======================================================================            // =========================================================================
            // AUTO-DISPATCH CREDENTIALS & ENQUEUE NOTIFICATION VIA TEMPLATE ENGINE
            // =========================================================================
            $waSent = false;
            $waError = null;
            if (!empty($phone)) {
                try {
                    $cleanPhone = WhatsAppService::normalizePhone($phone);
                    if (!empty($cleanPhone)) {
                        require_once __DIR__ . '/WhatsAppTemplateEngine.php';
                        require_once __DIR__ . '/MessageQueueManager.php';

                        $systemUrl = $this->resolveSystemAccessUrl($data['system_url'] ?? null);
                        $appTitle = $this->getSettingValue('ui_app_title') ?: 'شبكة سام اللاسلكية';
                        $roleAr = [
                            'pos_agent' => 'نقطة بيع الكروت (POS)',
                            'distributor' => 'وكيل معتمد / موزع',
                            'partner' => 'شريك مساهم',
                            'supervisor' => 'مشرف نظام',
                            'accountant' => 'محاسب مالي',
                            'system_owner' => 'مالك النظام',
                            'superadmin' => 'مدير نظام عام'
                        ][$targetRole] ?? $targetRole;

                        $tmplEngine = new WhatsAppTemplateEngine($this->db);
                        $queueMgr = new MessageQueueManager($this->db);

                        $tmplData = [
                            'name' => $fullname,
                            'username' => $username,
                            'password' => $pass,
                            'role_ar' => $roleAr,
                            'credit_limit' => number_format((float)$creditLimit, 2),
                            'system_url' => $systemUrl,
                            'system_name' => $appTitle
                        ];

                        $rendered = $tmplEngine->render('user_add', $tmplData);
                        if ($rendered['success']) {
                            $msgText = $rendered['message'];
                            $requiresApproval = $rendered['requires_approval'];
                            $department = $rendered['department'];
                        } else {
                            $msgText = "مرحباً بك عزيزي *{$fullname}* 🌹\n"
                                     . "تم إنشاء وتفعيل حسابك بنجاح في منظومة *{$appTitle}* ({$roleAr}) 🚀\n"
                                     . "📋 *بيانات تسجيل الدخول الخاصة بك:*\n"
                                     . "👤 *اسم المستخدم:* `{$username}`\n"
                                     . "🔑 *كلمة المرور:* `{$pass}`\n"
                                     . "🔗 *رابط المنظومة:* {$systemUrl}\n"
                                     . "🌐 يمكنك الآن تسجيل الدخول مباشرة والبدء بإدارة عملياتك ومبيعاتك بكل سهولة.\n"
                                     . "⚠️ *يرجى الحفاظ على سرية بيانات حسابك وعدم مشاركتها مع أي شخص.*";
                            $requiresApproval = false;
                            $department = 'system';
                        }

                        // Credentials for newly-created POS/distributor accounts must reach
                        // the phone entered in the form immediately, not wait in an approval queue.
                        if (in_array($targetRole, ['pos_agent', 'distributor'], true)) {
                            $requiresApproval = false;

                            // Keep the credentials and system link in a plainly copyable
                            // block even when a customized WhatsApp template omits fields.
                            $hasCopyableCredentials =
                                strpos($msgText, $username) !== false &&
                                strpos($msgText, $pass) !== false &&
                                strpos($msgText, $systemUrl) !== false &&
                                preg_match('/اسم المستخدم|username/i', $msgText) === 1 &&
                                preg_match('/كلمة المرور|password/i', $msgText) === 1 &&
                                preg_match('/رابط النظام|رابط المنظومة|system url/i', $msgText) === 1;

                            if (!$hasCopyableCredentials) {
                                $msgText = rtrim($msgText) . "\n\n"
                                    . "📋 *بيانات الدخول — انسخ كل سطر كما هو:*\n"
                                    . "اسم المستخدم: {$username}\n"
                                    . "كلمة المرور: {$pass}\n"
                                    . "رابط النظام: {$systemUrl}";
                            }
                        }

                        $queueMgr->enqueue(
                            $department,
                            'user_add',
                            $cleanPhone,
                            $fullname,
                            $msgText,
                            (string)$newAdminId,
                            $requiresApproval
                        );

                        $waService = $this->getNotificationService()->getWhatsAppService();
                        $dispatched = $queueMgr->dispatchApprovedQueue($waService, 10);
                        $waSent = ($dispatched > 0);
                    }
                } catch (Exception $e) {
                    $waError = $e->getMessage();
                }
            }
return [
                'success' => true, 
                'id' => $newAdminId, 
                'account_id' => $accountId,
                'whatsapp_sent' => $waSent,
                'whatsapp_error' => $waError,
                'username' => $username,
                'phone' => $phone
            ];
        }
    }

    // ==========================================
    // METHOD: saveNodeResponsible
    // ==========================================
    public function saveNodeResponsible($data) {
        $fullname = trim((string)($data['fullname'] ?? ''));
        $phone = normalizeYemenPhone(trim((string)($data['phone'] ?? '')));
        $targetRole = trim((string)($data['role'] ?? 'main_node_owner'));
        if (!in_array($targetRole, ['main_node_owner', 'sub_node_owner', 'regular_node_owner'], true)) {
            $targetRole = 'main_node_owner';
        }

        $ctx = $this->getActiveAdminContext();
        $activeNetworkId = (int)($ctx['active_network_id'] ?? $this->getActiveNetworkId());
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];

        $isEdit = !empty($data['id']);
        $targetId = $isEdit ? (int)$data['id'] : 0;

        if ($targetRole === 'system_owner') {
            throw new Exception('رتبة غير صالحة لمسؤول النقطة');
        }

        $this->enforcePermission($isEdit ? 'admins_edit' : 'admins_add', $isEdit ? 'تعديل مسؤول النقطة' : 'إضافة مسؤول النقطة');

        // Validation
        if (empty($fullname)) {
            throw new Exception('اسم مسؤول النقطة الكامل إجباري');
        }
        if (empty($phone)) {
            throw new Exception('رقم الهاتف / الواتساب إجباري');
        }

        // Uniqueness check for fullname
        $chkName = $this->db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(fullname)) = LOWER(TRIM(?)) AND id != ? AND fullname != '' LIMIT 1");
        $chkName->execute([$fullname, $targetId]);
        if ($chkName->fetch()) {
            throw new Exception('اسم مسؤول النقطة مسجل مسبقاً لمستخدم آخر. يرجى إدخال اسم فريد.');
        }

        // Uniqueness check for phone
        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        $chkPhone = $this->db->prepare("SELECT id FROM um_admins WHERE (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?) AND id != ? AND phone != '' AND phone IS NOT NULL LIMIT 1");
        $chkPhone->execute([$phone, $cleanPhone, $targetId]);
        if ($chkPhone->fetch()) {
            throw new Exception('رقم الهاتف مسجل مسبقاً لمستخدم آخر في المنظومة.');
        }

        // Parent Distributor handling
        if (!in_array($callerRole, ['system_owner', 'superadmin'], true)) {
            if ($isEdit) {
                $targetRecord = $this->db->query("SELECT id, role, parent_id, account_id FROM um_admins WHERE id = $targetId")->fetch(PDO::FETCH_ASSOC);
                if (!$targetRecord) throw new Exception('الحساب المراد تعديله غير موجود');
                $parentId = (int)$targetRecord['parent_id'];
            } else {
                $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : $callerId;
            }
        } else {
            $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : $callerId;
        }

        // Combine address and notes
        $rawAddress = trim((string)($data['address'] ?? ''));
        $rawNotes = trim((string)($data['notes'] ?? ''));
        $notesCombined = $rawNotes;
        if (!empty($rawAddress)) {
            $notesCombined = "العنوان: " . $rawAddress . (!empty($rawNotes) ? " | " . $rawNotes : "");
        }

        // Standard permissions for node roles
        $defaultPermsMap = [
            'main_node_owner' => ['dashboard', 'network_nodes', 'assets', 'port_analytics', 'free_vouchers', 'subscriber_portal'],
            'sub_node_owner' => ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'port_analytics', 'free_vouchers', 'subscriber_portal'],
            'regular_node_owner' => ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'free_vouchers', 'subscriber_portal']
        ];
        $permissions = json_encode($defaultPermsMap[$targetRole] ?? ['dashboard', 'network_nodes', 'assets', 'free_vouchers', 'subscriber_portal']);

        // Ensure role exists in um_roles_def
        $roleCheck = $this->db->prepare("SELECT id FROM um_roles_def WHERE role_key = ? LIMIT 1");
        $roleCheck->execute([$targetRole]);
        if (!$roleCheck->fetchColumn()) {
            $roleNameAr = [
                'main_node_owner' => 'مسؤول نقطة أساسي',
                'sub_node_owner' => 'مسؤول نقطة فرعي',
                'regular_node_owner' => 'مسؤول نقطة عادي'
            ][$targetRole] ?? $targetRole;
            $this->db->prepare("INSERT INTO um_roles_def (role_key, role_name_ar, description, permissions, is_system, default_data_scope) VALUES (?, ?, 'متابعة النقطة والجلسات والكروت المجانية', ?, 0, 'own')")
                ->execute([$targetRole, $roleNameAr, $permissions]);
        }

        // Minimal Chart of Accounts linking
        $accountId = null;
        $rootAccounts = [
            ['1300', 'المدينون والذمم المدينة', 'asset'],
            ['1301', 'ذمم الموزعين والوكلاء', 'asset'],
            ['1302', 'عهد الموظفين وسلف العمل', 'asset']
        ];
        $rootCheck = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=? LIMIT 1');
        $rootInsert = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance) VALUES (?,?,?,?,NULL,1,1,1,0.00)");
        foreach ($rootAccounts as [$rootCode, $rootName, $rootType]) {
            $rootCheck->execute([$activeNetworkId, $rootCode]);
            if (!$rootCheck->fetchColumn()) $rootInsert->execute([$activeNetworkId, $rootCode, $rootName, $rootType]);
        }

        if ($isEdit) {
            $existing = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? ORDER BY id LIMIT 1");
            $existing->execute([$activeNetworkId, $targetId]);
            $accountId = (int)$existing->fetchColumn() ?: null;
        }

        if (!$accountId) {
            $parentsQ = $this->db->prepare("SELECT id,account_code FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('1301','1300')");
            $parentsQ->execute([$activeNetworkId]);
            $pm = [];
            foreach ($parentsQ->fetchAll(PDO::FETCH_ASSOC) as $pr) $pm[$pr['account_code']] = (int)$pr['id'];
            $parentIdCOA = $pm['1301'] ?? $pm['1300'] ?? 0;
            if ($parentIdCOA > 0) {
                $sq = $this->db->prepare("SELECT COUNT(*) FROM um_chart_of_accounts WHERE network_id=? AND parent_id=?");
                $sq->execute([$activeNetworkId, $parentIdCOA]);
                $siblings = (int)$sq->fetchColumn();
                $next = $siblings + 1;
                $code = '1301' . ($next < 10 ? '0' . $next : (string)$next);
                $accName = 'ذمة مسؤول نقطة: ' . $fullname;
                $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance) VALUES (?,?,?,?,?,?,0,1,0.00)");
                $ins->execute([$activeNetworkId, $code, $accName, 'asset', $parentIdCOA, 3]);
                $accountId = (int)$this->db->lastInsertId();
            }
        }

        if ($isEdit) {
            $sql = "UPDATE um_admins SET fullname=:fullname, phone=:phone, role=:role, parent_id=:parent_id, account_id=:account_id, data_scope='own', permissions=:permissions, notes=:notes WHERE id=:id";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                ':fullname' => $fullname,
                ':phone' => $phone,
                ':role' => $targetRole,
                ':parent_id' => $parentId,
                ':account_id' => $accountId,
                ':permissions' => $permissions,
                ':notes' => $notesCombined,
                ':id' => $targetId
            ]);
            $this->syncAdminNetworkAssignments($targetId, [$activeNetworkId], $targetRole, 'own', 0.00, $callerId, false);
            $newAdminId = $targetId;
        } else {
            // Auto generate unique username
            $prefix = ($targetRole === 'main_node_owner') ? 'node_m_' : (($targetRole === 'sub_node_owner') ? 'node_s_' : 'node_');
            $suffixPhone = strlen($cleanPhone) >= 9 ? substr($cleanPhone, -9) : $cleanPhone;
            $candidateUser = $prefix . $suffixPhone;
            $username = $candidateUser;
            $counter = 1;
            while (true) {
                $chkU = $this->db->prepare("SELECT id FROM um_admins WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) LIMIT 1");
                $chkU->execute([$username]);
                if (!$chkU->fetchColumn()) break;
                $username = $candidateUser . '_' . $counter++;
            }

            $passHash = password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT);
            $email = $username . '@pos.local';

            $sql = "INSERT INTO um_admins (username, password_hash, fullname, phone, email, role, parent_id, account_id, credit_limit, discount_rate, max_cards_quota, free_profile, free_cards_quota, data_scope, created_by_admin_id, created_by_name, permissions, is_active, notes, must_change_password)
                    VALUES (:username, :pass, :fullname, :phone, :email, :role, :parent_id, :account_id, 0.00, 0.00, 0, NULL, 0, 'own', :created_by_admin_id, :created_by_name, :permissions, 1, :notes, 0)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                ':username' => $username,
                ':pass' => $passHash,
                ':fullname' => $fullname,
                ':phone' => $phone,
                ':email' => $email,
                ':role' => $targetRole,
                ':parent_id' => $parentId,
                ':account_id' => $accountId,
                ':created_by_admin_id' => $callerId,
                ':created_by_name' => $ctx['fullname'] ?? '',
                ':permissions' => $permissions,
                ':notes' => $notesCombined
            ]);
            $newAdminId = (int)$this->db->lastInsertId();
            if ($accountId) {
                $this->db->prepare("UPDATE um_chart_of_accounts SET linked_admin_id=?,owner_admin_id=? WHERE network_id=? AND id=?")->execute([$newAdminId, $newAdminId, $activeNetworkId, $accountId]);
            }
            $this->syncAdminNetworkAssignments($newAdminId, [$activeNetworkId], $targetRole, 'own', 0.00, $callerId, true);
        }

        // Link with network node if provided
        $linkedNodeId = !empty($data['linked_node_id']) ? (int)$data['linked_node_id'] : 0;
        if ($linkedNodeId > 0) {
            $nodeUpd = $this->db->prepare("
                UPDATE um_network_nodes 
                SET responsible_admin_id = ?,
                    responsible_name = ?,
                    responsible_phone = ?,
                    location = CASE WHEN ? != '' THEN ? ELSE location END,
                    notes = CASE WHEN ? != '' THEN ? ELSE notes END
                WHERE id = ? AND network_id = ?
            ");
            $nodeUpd->execute([
                $newAdminId,
                $fullname,
                $phone,
                $rawAddress,
                $rawAddress,
                $rawNotes,
                $rawNotes,
                $linkedNodeId,
                $activeNetworkId
            ]);
        }

        return [
            'success' => true,
            'id' => $newAdminId,
            'fullname' => $fullname,
            'phone' => $phone,
            'role' => $targetRole,
            'parent_id' => $parentId,
            'linked_node_id' => $linkedNodeId,
            'message' => $isEdit ? 'تم تحديث بيانات مسؤول النقطة بنجاح' : 'تم إضافة مسؤول النقطة بنجاح وربطه بالشبكة'
        ];
    }

    // ==========================================
    // METHOD: updateAdminHierarchy
    // ==========================================
    public function updateAdminHierarchy($data) {
        $id = (int)($data['id'] ?? 0);
        if (!$id) throw new Exception('معرف الحساب مطلوب');
        $ctx = $this->getActiveAdminContext();
        $networkId=$this->getActiveNetworkId();
        if (!in_array((string)$ctx['role'], ['system_owner', 'superadmin'], true)) {
            throw new Exception('عذراً، صلاحية إعادة هيكلة التبعية وتغيير الفروع مخصصة فقط للمدير العام للنظام (Super Admin)');
        }
        $target=$this->getAdminById($id);
        if (!$target) throw new Exception('الحساب غير موجود');
        $systemOwnerId = (int)$this->db->query("SELECT MIN(admin_id) FROM um_system_owners")->fetchColumn();
        $canAssignNetworkMemberships = ((int)$ctx['id'] === $systemOwnerId);
        if ($id === $systemOwnerId) {
            throw new Exception('لا يمكن تعديل رتبة مالك النظام أو نطاقه أو تبعيته');
        }
        if (!$canAssignNetworkMemberships && array_key_exists('allowed_networks', $data)) {
            throw new DomainException('NETWORK_ASSIGNMENT_OWNER_ONLY');
        }
        $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : null;
        if ($parentId === $id) throw new Exception('لا يمكن تعيين الحساب مشرفاً على نفسه');
        if($parentId && !$this->getAdminById($parentId))throw new Exception('الحساب الأب لا يتبع الشبكة النشطة');
        $allowedNetworks = null;
        if (isset($data['allowed_networks'])) {
            if (is_array($data['allowed_networks'])) {
                $cleanNets = array_values(array_filter(array_map('intval', $data['allowed_networks'])));
                $allowedNetworks = !empty($cleanNets) ? json_encode($cleanNets) : null;
            } else if (is_string($data['allowed_networks'])) {
                $t = trim($data['allowed_networks']);
                $allowedNetworks = ($t === '' || $t === 'all' || $t === 'null') ? null : $t;
            }
        }
        $dataScope = in_array($data['data_scope'] ?? '', ['all','own','children','assigned','delegated','network'],true) ? $data['data_scope'] : 'own';
        $role = !empty($data['role']) ? trim($data['role']) : $target['role'];
        $roleCheck=$this->db->prepare("SELECT 1 FROM um_roles_def WHERE role_key=?");$roleCheck->execute([$role]);if(!$roleCheck->fetchColumn())throw new Exception('الرتبة المطلوبة غير موجودة');
        $this->db->beginTransaction();
        try{
            $up=$this->db->prepare("UPDATE um_admins SET parent_id=? WHERE id=?");$up->execute([$parentId,$id]);
            $up=$this->db->prepare("INSERT INTO um_admin_network_roles(admin_id,network_id,role_key,data_scope,is_active,granted_by_admin_id) VALUES(?,?,?,?,1,?) ON DUPLICATE KEY UPDATE role_key=VALUES(role_key),data_scope=VALUES(data_scope),is_active=1,granted_by_admin_id=VALUES(granted_by_admin_id)");
            $up->execute([$id,$networkId,$role,$dataScope,(int)$ctx['id']]);
            if($allowedNetworks!==null){
                $ids=json_decode($allowedNetworks,true)?:[];
                foreach($ids as $nid){$a=$this->db->prepare("INSERT INTO um_admin_network_access(admin_id,network_id,access_level,is_default,is_active,granted_by_admin_id) VALUES(?,?,'member',0,1,?) ON DUPLICATE KEY UPDATE is_active=1,granted_by_admin_id=VALUES(granted_by_admin_id)");$a->execute([$id,(int)$nid,(int)$ctx['id']]);}
            }
            $this->db->commit();
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
        return [
            'success' => true,
            'message' => 'تم تحديث التبعية والهيكل الإداري والشبكي للحساب بنجاح',
            'id' => $id,
            'parent_id' => $parentId,
            'role' => $role
        ];
    }

    // ==========================================
    // METHOD: deleteAdmin
    // ==========================================
    public function deleteAdmin($id) {
        $this->enforcePermission('admins_delete', 'حذف المستخدم أو الوكيل');
        $id = (int)$id;
        if ($id === 1) throw new Exception('لا يمكن حذف المدير الرئيسي للنظام');
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        if ($id === $ctx['id']) {
            throw new Exception('لا يمكنك حذف حسابك الشخصي');
        }

        $target = $this->getAdminById($id);
        if (!$target) throw new Exception('الحساب المطلوب غير موجود أو تم حذفه مسبقاً');

        if (!in_array((string)$ctx['role'], ['system_owner', 'superadmin'], true)) {
            if ((int)$target['parent_id'] !== $ctx['id']) {
                throw new Exception('غير مصرح: لا يمكنك حذف حساب لا يتبع فرعك الإداري المباشر');
            }
            $targetLevel = self::ROLE_HIERARCHY[$target['role']] ?? 0;
            $callerLevel = self::ROLE_HIERARCHY[$ctx['role']] ?? 0;
            if ($targetLevel >= $callerLevel) {
                throw new Exception('غير مصرح: لا يمكنك حذف حساب يملك رتبة مساوية لك أو أعلى منك');
            }
        }

        // 1. Check Financial Balance & Debt
        $balance = (float)($target['balance'] ?? 0);
        if (abs($balance) > 0.001) {
            $type = ($balance > 0) ? 'مديونية مستحقة عليه (رصيد مدين)' : 'رصيد دائن متبقي له';
            $formattedBal = number_format(abs($balance), 2);
            throw new Exception("⚠️ تعذر حذف الحساب ({$target['fullname']}): يوجد {$type} بمبلغ ({$formattedBal} ر.ي). يجب تسوية وتصفية الحساب المالي كلياً وإجراء كشف حساب قبل الحذف.");
        }

        // 2. Check Instant Balance / Agent Wallet
        try {
            $walletStmt = $this->db->prepare("SELECT balance FROM um_agent_wallets WHERE admin_id = ?");
            $walletStmt->execute([$id]);
            $walletBal = (float)($walletStmt->fetchColumn() ?: 0);
            if (abs($walletBal) > 0.001) {
                $formattedInst = number_format(abs($walletBal), 2);
                throw new Exception("⚠️ تعذر حذف الحساب ({$target['fullname']}): يوجد رصيد محفظة / شحن فوري قائم للحساب بمبلغ ({$formattedInst} ر.ي). يرجى استرجاع أو تسوية الرصيد كلياً.");
            }
        } catch (Exception $e) {
            if (strpos($e->getMessage(), '⚠️ تعذر حذف الحساب') !== false) throw $e;
        }

        // 3. Check Unsold Cards / Inventory Stock
        try {
            $cardsStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta WHERE (owner_admin_id = ? OR sold_by_admin_id = ?) AND is_sold = 0 AND status = 'active'");
            $cardsStmt->execute([$id, $id]);
            $stockCount = (int)$cardsStmt->fetchColumn();
            if ($stockCount > 0) {
                throw new Exception("⚠️ تعذر حذف الحساب ({$target['fullname']}): يوجد في مخزنه وعهدة حسابه ({$stockCount}) كارت غير مباع. يرجى إلغاء تخصيص واسترجاع مخزون الكروت أولاً.");
            }
        } catch (Exception $e) {
            if (strpos($e->getMessage(), '⚠️ تعذر حذف الحساب') !== false) throw $e;
        }

        // 4. Check Subordinate POS Agents / Child Accounts
        $subStmt = $this->db->prepare("SELECT COUNT(*) FROM um_admins WHERE parent_id = ? AND is_active = 1");
        $subStmt->execute([$id]);
        $subCount = (int)$subStmt->fetchColumn();
        if ($subCount > 0) {
            throw new Exception("⚠️ تعذر حذف الحساب ({$target['fullname']}): توجد ({$subCount}) نقاط بيع أو وكلاء تابعين له إدارياً. يرجى إعادة نقل تبعيتهم لمشرف آخر قبل الحذف.");
        }

        // 5. Cleanup node and asset assignments and chart of accounts if linked
        try {
            $this->db->prepare("UPDATE um_network_nodes SET custodian_admin_id = NULL WHERE custodian_admin_id = ?")->execute([$id]);
            $this->db->prepare("UPDATE um_network_nodes SET manager_admin_id = NULL WHERE manager_admin_id = ?")->execute([$id]);
            $this->db->prepare("DELETE FROM um_network_node_admins WHERE admin_id = ?")->execute([$id]);
            $this->db->prepare("UPDATE um_network_assets SET assigned_to_user_id = NULL WHERE assigned_to_user_id = ?")->execute([$id]);
            if (!empty($target['account_id'])) {
                $this->db->prepare("UPDATE um_chart_of_accounts SET is_active = 0 WHERE id = ? AND linked_admin_id = ?")->execute([$target['account_id'], $id]);
            }
        } catch (\Throwable $e) {}

        // Perform Soft Delete / Deactivation
        $stmt = $this->db->prepare("UPDATE um_admin_network_access SET is_active=0 WHERE admin_id=? AND network_id=?");
        $stmt->execute([$id, $networkId]);
        $this->db->prepare("UPDATE um_admin_network_roles SET is_active=0 WHERE admin_id=? AND network_id=?")->execute([$id, $networkId]);
        $left = $this->db->prepare("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=? AND is_active=1");
        $left->execute([$id]);
        if ((int)$left->fetchColumn() === 0) {
            $this->db->prepare("UPDATE um_admins SET is_active=0 WHERE id=?")->execute([$id]);
        }

        // Send Deletion Audit Notification to Managers and Deleted User
        try {
            $nowStr = date('Y-m-d h:i:s A');
            $parentName = 'الإدارة العامة';
            if (!empty($target['parent_id'])) {
                $p = $this->db->prepare("SELECT fullname FROM um_admins WHERE id = ?");
                $p->execute([$target['parent_id']]);
                $parentName = $p->fetchColumn() ?: 'الإدارة العامة';
            }
            $roleName = $target['role_name_ar'] ?? $target['role'];

            $auditMsg = "🚨 *إشعار إداري: عملية حذف حساب مالي / وكيل*\n\n";
            $auditMsg .= "👤 *اسم الحساب:* {$target['fullname']} (@{$target['username']})\n";
            $auditMsg .= "📞 *الهاتف:* " . ($target['phone'] ?: 'غير مسجل') . "\n";
            $auditMsg .= "👔 *الرتبة:* {$roleName}\n";
            $auditMsg .= "👔 *المشرف الإداري:* {$parentName}\n";
            $auditMsg .= "💰 *الرصيد المالي وقت الحذف:* 0.00 ر.ي (مصفى بالكامل)\n";
            $auditMsg .= "⚡ *الرصيد الفوري:* 0.00 ر.ي\n";
            $auditMsg .= "📦 *المخزون:* 0 كروت\n";
            $auditMsg .= "📅 *التاريخ:* {$nowStr}\n";
            $auditMsg .= "🛡️ *المنفذ:* {$ctx['fullname']} (@{$ctx['username']})";

            if (class_exists('NotificationService')) {
                $notifSrv = new NotificationService($this->db, null, $networkId);
                $mgrStmt = $this->db->prepare("SELECT phone FROM um_admins WHERE role IN ('system_owner', 'superadmin') AND is_active = 1");
                $mgrStmt->execute();
                $managers = $mgrStmt->fetchAll(PDO::FETCH_COLUMN);

                $phonesToNotify = array_unique(array_filter(array_merge($managers, [$target['phone'] ?? ''])));
                foreach ($phonesToNotify as $phoneNum) {
                    if (!empty($phoneNum)) {
                        try {
                            $notifSrv->getWhatsAppService()->sendMessage($phoneNum, $auditMsg, 'DEL-' . $id, $ctx['id']);
                        } catch (\Throwable $e) {}
                    }
                }
            }
        } catch (\Throwable $e) {}

        return [
            'success' => true,
            'message' => "✅ تم حذف وإلغاء حساب ({$target['fullname']}) وتوثيق العملية مع إرسال الإشعارات بنجاح"
        ];
    }
    // ==========================================
    // SALES INVOICES, WHOLESALE & MULTI-SHEET DISTRIBUTION
    // ==========================================

    // ==========================================
    // METHOD: saveAdminScope
    // ==========================================
    public function saveAdminScope($adminId, $dataScope, $delegatedIds) {
        $adminId = (int)$adminId;
        if ($adminId <= 0) return ['error' => 'معرف المستخدم غير صالح'];
        $systemOwnerId = (int)$this->db->query("SELECT MIN(admin_id) FROM um_system_owners")->fetchColumn();
        if ($adminId === $systemOwnerId) return ['error' => 'نطاق مالك النظام ثابت ولا يمكن تعديله'];
        $networkId=$this->getActiveNetworkId();
        if(!$this->getAdminById($adminId))return ['error'=>'المستخدم لا يتبع الشبكة النشطة'];
        $scope = in_array($dataScope, ['all','own','children','assigned','delegated','network'],true) ? $dataScope : 'own';
        $delegatedJson = is_array($delegatedIds) ? json_encode(array_map('intval', $delegatedIds)) : '[]';
        $stmt = $this->db->prepare("UPDATE um_admin_network_roles SET data_scope=? WHERE admin_id=? AND network_id=? AND is_active=1");
        $stmt->execute([$scope,$adminId,$networkId]);
        $this->db->prepare("UPDATE um_admins SET delegated_admin_ids=? WHERE id=?")->execute([$delegatedJson,$adminId]);
        return ['success' => true, 'message' => 'تم حفظ نطاق رؤية البيانات والتفويضات بنجاح'];
    }

    // ==========================================
    // METHOD: getRoles
    // ==========================================
    public function getRoles() {
        $ctx = $this->getActiveAdminContext();
        $stmt = $this->db->query("
            SELECT r.id, r.role_key, r.role_name_ar, r.description, r.permissions, r.is_system, r.created_at, r.default_data_scope, r.parent_account_id,
                   coa.account_code as parent_account_code, coa.name_ar as parent_account_name
            FROM um_roles_def r
            LEFT JOIN um_chart_of_accounts coa ON r.parent_account_id = coa.id
            ORDER BY r.is_system DESC, r.id ASC
        ");
        $roles = $stmt->fetchAll();
        $callerLevel = self::ROLE_HIERARCHY[$ctx['role']] ?? 0;
        $filteredRoles = [];
        foreach ($roles as $r) {
            $r['permissions'] = !empty($r['permissions']) ? json_decode($r['permissions'], true) : [];
            $rLevel = self::ROLE_HIERARCHY[$r['role_key']] ?? 20;
            if (in_array((string)$ctx['role'], ['system_owner', 'superadmin'], true) || $rLevel < $callerLevel) {
                $filteredRoles[] = $r;
            }
        }
        return ['success' => true, 'roles' => $filteredRoles];
    }

    // ==========================================
    // METHOD: saveRole
    // ==========================================
    public function saveRole($data) {
        $this->enforceOwnerOnly('إنشاء وتعديل الرتب المخصصة');
        $key = strtolower(trim((string)($data['role_key'] ?? '')));
        $nameAr = trim((string)($data['role_name_ar'] ?? ''));
        $desc = trim((string)($data['description'] ?? ''));
        $allowedScopes = ['all', 'own', 'children', 'assigned', 'delegated', 'network'];
        $scope = in_array($data['default_data_scope'] ?? '', $allowedScopes, true) ? $data['default_data_scope'] : 'own';
        $permissions = is_array($data['permissions'] ?? null) ? array_values(array_unique(array_filter(array_map('strval', $data['permissions'])))) : [];
        if (!preg_match('/^[a-z][a-z0-9_]{2,63}$/', $key)) {
            return ['error' => 'رمز الرتبة يجب أن يبدأ بحرف إنجليزي ويحتوي أحرفاً وأرقاماً وشرطة سفلية فقط'];
        }
        if ($nameAr === '') return ['error' => 'يرجى إدخال اسم الرتبة باللغة العربية'];
        $existing = $this->db->prepare('SELECT is_system FROM um_roles_def WHERE role_key = ? LIMIT 1');
        $existing->execute([$key]);
        $row = $existing->fetch(PDO::FETCH_ASSOC);
        if ($row && (int)$row['is_system'] === 1) {
            return ['error' => 'هذه رتبة أساسية محمية ولا يمكن تعديل اسمها أو صلاحياتها أو نطاقها'];
        }
        if (in_array('*', $permissions, true)) {
            return ['error' => 'لا يمكن منح الصلاحية الشاملة للرتب المخصصة'];
        }
        $perms = json_encode($permissions, JSON_UNESCAPED_UNICODE);
        $stmt = $this->db->prepare("
            INSERT INTO um_roles_def (role_key, role_name_ar, description, permissions, default_data_scope, is_system)
            VALUES (?, ?, ?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE role_name_ar = VALUES(role_name_ar), description = VALUES(description),
                permissions = VALUES(permissions), default_data_scope = VALUES(default_data_scope), is_system = 0
        ");
        $stmt->execute([$key, $nameAr, $desc, $perms, $scope]);
        return ['success' => true, 'message' => 'تم حفظ الرتبة المخصصة وصلاحياتها بنجاح'];
    }
    // ==========================================
    // METHOD: deleteRole
    // ==========================================
    public function deleteRole($roleKey) {
        $this->enforceOwnerOnly('حذف الرتب المخصصة');
        $stmt = $this->db->prepare("SELECT is_system FROM um_roles_def WHERE role_key = ?");
        $stmt->execute([$roleKey]);
        $role = $stmt->fetch();
        if (!$role) return ['error' => 'الدور غير موجود'];
        if (!empty($role['is_system'])) return ['error' => 'لا يمكن حذف الأدوار الأساسية للنظام'];
        // Check if any admin uses it
        $stmt2 = $this->db->prepare("SELECT COUNT(*) FROM um_admins WHERE role = ?");
        $stmt2->execute([$roleKey]);
        if ($stmt2->fetchColumn() > 0) {
            return ['error' => 'لا يمكن حذف الدور لوجود مستخدمين مرتبطين به حالياً'];
        }
        $del = $this->db->prepare("DELETE FROM um_roles_def WHERE role_key = ?");
        $del->execute([$roleKey]);
        return ['success' => true, 'message' => 'تم حذف الدور بنجاح'];
    }

    // ==========================================
    // METHOD: getAdminsWithRoles
    // ==========================================
    public function getAdminsWithRoles($callerAdminId = 0, $callerRole = 'superadmin', $dataScope = 'own') {
        $ctx = $this->getActiveAdminContext();
        $callerId = $callerAdminId ?: (int)$ctx['id'];
        $role = $callerRole ?: (string)$ctx['role'];
        $scope = $dataScope ?: (string)$ctx['data_scope'];
        $networkId=$this->getActiveNetworkId();
        $where = ["nx.network_id=$networkId","nx.is_active=1"];
        if (!in_array((string)$role, ['system_owner', 'superadmin'], true) && (string)$scope !== 'all') {
            $cId = (int)$callerId;
            if ($scope === 'assigned') {
                $delegated = array_merge([$cId], $ctx['delegated_ids'] ?: []);
                $cleanIds = array_filter(array_map('intval', $delegated));
                $placeholders = !empty($cleanIds) ? implode(',', $cleanIds) : (string)$cId;
                $where[] = "(a.id IN ($placeholders) OR a.parent_id IN ($placeholders))";
            } else {
                $where[] = "(a.id = $cId OR a.parent_id = $cId)";
            }
        }
        $whereClause = implode(' AND ', $where);
        $stmt = $this->db->query("
            SELECT a.id, a.username, a.fullname, a.phone, a.email, COALESCE(nr.role_key,a.role) role, a.is_active, a.created_at,
                   COALESCE(nr.data_scope,a.data_scope) data_scope, a.delegated_admin_ids, a.created_by_admin_id, a.created_by_name,
                   COALESCE(r.role_name_ar,COALESCE(nr.role_key,a.role)) AS role_name_ar,
                   COALESCE(r.permissions, '[]') AS role_permissions,
                   a.permissions AS custom_permissions,
                   a.free_profile, a.free_cards_quota
            FROM um_admins a
            JOIN um_admin_network_access nx ON nx.admin_id=a.id
            LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1
            LEFT JOIN um_roles_def r ON COALESCE(nr.role_key,a.role) = r.role_key
            WHERE $whereClause
            ORDER BY a.id ASC
        ");
        $admins = $stmt->fetchAll();
        foreach ($admins as &$adm) {
            $adm['role_permissions'] = json_decode($adm['role_permissions'], true) ?: [];
            $adm['custom_permissions'] = json_decode($adm['custom_permissions'] ?? '[]', true) ?: [];
        }
        return ['success' => true, 'admins' => $admins];
    }
    // ==========================================
    // 2. NETWORK NODES & HIERARCHY (TOPOLOGY)
    // ==========================================

    // ==========================================
    // METHOD: tableExists
    // ==========================================
    public function tableExists($tableName) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'radius' AND TABLE_NAME = ?");
        $stmt->execute([$tableName]);
        return (int)$stmt->fetchColumn() > 0;
    }
    // FINANCIAL ACCOUNTING & CASHBOX (الصندوق والمحاسبة)
    // ==========================================

    // ==========================================
    // METHOD: formatBytesHelper
    // ==========================================
    public function formatBytesHelper($bytes, $precision = 2) {
        if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' GB';
        if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' MB';
        if ($bytes >= 1024) return round($bytes / 1024, 2) . ' KB';
        return $bytes . ' B';
    }

    // ==========================================
    // METHOD: getSettingValue
    // ==========================================
    public function getSettingValue($key, $default = null) {
        try {
            $stmt = $this->db->prepare("SELECT setting_value FROM um_settings WHERE setting_key = ?");
            $stmt->execute([$key]);
            $val = $stmt->fetchColumn();
            return $val !== false ? $val : $default;
        } catch (Exception $e) {
            return $default;
        }
    }

    // ==========================================
    // METHOD: setSettingValue
    // ==========================================
    public function setSettingValue($key, $value) {
        try {
            $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()");
            return $stmt->execute([$key, $value]);
        } catch (Exception $e) {
            return false;
        }
    }

    // ==========================================
    // METHOD: logActivity
    // ==========================================
    public function logActivity($actionType, $category, $title, $details = '', $status = 'success', $adminId = null, $ip = null, ?int $networkId = null) {
        try {
            $ipAddr = $ip ?: ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
            $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? 'Web/System', 0, 255);
            $aid = $adminId;
            $adminName = 'System';
            if (empty($aid)) {
                $aid = $_SESSION['admin_id'] ?? null;
            }
            $netId = $networkId;
            if ($netId === null || $netId <= 0) {
                try {
                    $netId = $this->getActiveNetworkId();
                } catch (Throwable $e) {
                    $netId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_SESSION['active_network_id'] ?? 0));
                }
            }
            if (!empty($aid)) {
                if ($netId <= 0) {
                    try {
                        $st = $this->db->prepare("SELECT network_id FROM um_admin_network_access WHERE admin_id = ? AND is_active = 1 ORDER BY is_default DESC, network_id ASC LIMIT 1");
                        $st->execute([(int)$aid]);
                        $netId = (int)$st->fetchColumn();
                    } catch (Throwable $e) {}
                }
                try {
                    $adm = $this->getAdminById($aid);
                    if ($adm) {
                        $adminName = $adm['fullname'] ?: $adm['username'];
                    } else {
                        $st = $this->db->prepare("SELECT fullname, username FROM um_admins WHERE id = ? LIMIT 1");
                        $st->execute([(int)$aid]);
                        $admRow = $st->fetch(PDO::FETCH_ASSOC);
                        if ($admRow) {
                            $adminName = $admRow['fullname'] ?: $admRow['username'];
                        }
                    }
                } catch (Throwable $e) {}
            }
            if ($netId <= 0) {
                $netId = 1;
            }
            $detailsStr = is_array($details) ? json_encode($details, JSON_UNESCAPED_UNICODE) : (string)$details;
            $stmt = $this->db->prepare("
                INSERT INTO um_activity_logs (network_id, admin_id, admin_name, action_type, action_category, action_title, details, ip_address, user_agent, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            return $stmt->execute([$netId, $aid, $adminName, $actionType, $category, $title, $detailsStr, $ipAddr, $ua, $status]);
        } catch (Exception $e) {
            error_log("logActivity Error: " . $e->getMessage());
            return false;
        }
    }

    // ==========================================
    // METHOD: getActivityLogs
    // ==========================================
    public function getActivityLogs($filters = []) {
        $page = max(1, (int)($filters['page'] ?? 1));
        $limit = max(10, min(200, (int)($filters['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;
        $where = [];
        $params = [];

        // 1. Resolve Multi-Tenant Context
        $callerContext = null;
        $activeNetworkId = 0;
        try {
            $activeNetworkId = $this->getActiveNetworkId();
            $callerContext = $this->getActiveAdminContext();
        } catch (Throwable $e) {
            $activeNetworkId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_SESSION['active_network_id'] ?? 0));
        }

        $callerRole = (string)($callerContext['role'] ?? ($_SESSION['role'] ?? $_SESSION['admin_role'] ?? ''));
        $isSystemOwner = ($callerRole === 'system_owner');

        if ($isSystemOwner) {
            // System Owner can view all networks, or filter by specific network_id if supplied
            if (!empty($filters['network_id']) && $filters['network_id'] !== 'all') {
                $where[] = "l.network_id = :network_id";
                $params[':network_id'] = (int)$filters['network_id'];
            }
        } else {
            // Non-system-owner callers MUST be strictly isolated to their active network
            if ($activeNetworkId <= 0) {
                return [
                    'success' => true,
                    'logs' => [],
                    'total' => 0,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => 1
                ];
            }
            $where[] = "l.network_id = :active_network_id";
            $params[':active_network_id'] = $activeNetworkId;

            // Enforce data_scope if restricted (e.g., 'own')
            $dataScope = (string)($callerContext['data_scope'] ?? ($_SESSION['data_scope'] ?? ''));
            $callerId = (int)($callerContext['id'] ?? ($_SESSION['admin_id'] ?? 0));
            if ($dataScope === 'own' && !in_array($callerRole, ['system_owner', 'superadmin', 'partner', 'supervisor', 'accountant'], true)) {
                $where[] = "l.admin_id = :scoped_admin_id";
                $params[':scoped_admin_id'] = $callerId;
            }
        }

        if (empty($where)) {
            $where[] = "1=1";
        }

        if (!empty($filters['category'])) {
            $where[] = "l.action_category = :category";
            $params[':category'] = $filters['category'];
        }
        if (!empty($filters['action_type'])) {
            $where[] = "l.action_type = :action_type";
            $params[':action_type'] = $filters['action_type'];
        }
        if (!empty($filters['status'])) {
            $where[] = "l.status = :status";
            $params[':status'] = $filters['status'];
        }
        if (!empty($filters['admin_id'])) {
            $where[] = "l.admin_id = :admin_id";
            $params[':admin_id'] = (int)$filters['admin_id'];
        }
        if (!empty($filters['start_date'])) {
            $where[] = "l.created_at >= :start_date";
            $params[':start_date'] = $filters['start_date'] . ' 00:00:00';
        }
        if (!empty($filters['end_date'])) {
            $where[] = "l.created_at <= :end_date";
            $params[':end_date'] = $filters['end_date'] . ' 23:59:59';
        }
        if (!empty($filters['search'])) {
            $search = '%' . trim($filters['search']) . '%';
            $where[] = "(l.action_title LIKE :srch1 OR l.details LIKE :srch2 OR l.admin_name LIKE :srch3 OR l.ip_address LIKE :srch4 OR n.name LIKE :srch5)";
            $params[':srch1'] = $search;
            $params[':srch2'] = $search;
            $params[':srch3'] = $search;
            $params[':srch4'] = $search;
            $params[':srch5'] = $search;
        }

        $whereSql = implode(' AND ', $where);
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM um_activity_logs l LEFT JOIN um_networks n ON n.id = l.network_id WHERE $whereSql");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "
            SELECT l.*, n.name AS network_name, COALESCE(l.admin_name, a.fullname, a.username, 'النظام') AS admin_display_name
            FROM um_activity_logs l
            LEFT JOIN um_networks n ON n.id = l.network_id
            LEFT JOIN um_admins a ON a.id = l.admin_id
            WHERE $whereSql
            ORDER BY l.id DESC
            LIMIT $limit OFFSET $offset
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'success' => true,
            'logs' => $logs,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => (int)(ceil($total / $limit) ?: 1)
        ];
    }
    // ==========================================
    // ALERT SETTINGS & SYSTEM ALERTS SUMMARY
    // ==========================================

    // ==========================================
    // METHOD: getUISettings
    // ==========================================
    public function getUISettings($adminId = null) {
        $ctx = $this->getActiveAdminContext();
        $callerId = $adminId ? (int)$adminId : (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        // 1. Check if user has personal custom UI settings saved
        $userSettings = null;
        try {
            $this->db->exec("CREATE TABLE IF NOT EXISTS um_admin_ui_settings (
                admin_id INT(11) NOT NULL PRIMARY KEY,
                ui_settings LONGTEXT NOT NULL,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
            $uStmt = $this->db->prepare("SELECT ui_settings FROM um_admin_ui_settings WHERE admin_id = ? LIMIT 1");
            $uStmt->execute([$callerId]);
            $raw = $uStmt->fetchColumn();
            if ($raw) {
                $userSettings = json_decode($raw, true);
            }
        } catch (\Exception $e) {}
        // 2. Fetch global system settings as fallback / base
        $sysSettings = [];
        try {
            $stmt = $this->db->query("SELECT setting_key, setting_value FROM um_settings WHERE setting_key LIKE 'ui_%'");
            while ($row = $stmt->fetch()) {
                $sysSettings[$row['setting_key']] = $row['setting_value'];
            }
        } catch (\Exception $e) {}
        // 3. Database-backed default UI profile: global (*) then role-specific.
        $defaultSettings = [];
        try {
            $this->db->exec("CREATE TABLE IF NOT EXISTS um_ui_default_layouts (
                role_key VARCHAR(64) NOT NULL PRIMARY KEY,
                ui_settings LONGTEXT NOT NULL,
                updated_by_admin_id INT NULL,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
            $dStmt = $this->db->prepare("SELECT role_key, ui_settings FROM um_ui_default_layouts WHERE role_key IN ('*', ?) ORDER BY CASE WHEN role_key='*' THEN 0 ELSE 1 END");
            $dStmt->execute([$callerRole]);
            while ($dRow = $dStmt->fetch()) {
                $decoded = json_decode($dRow['ui_settings'], true);
                if (is_array($decoded)) $defaultSettings = array_replace_recursive($defaultSettings, $decoded);
            }
        } catch (\Exception $e) {}
        // 4. Pool of all available dynamic KPI widgets
        $allWidgetsPool = [
            'today_sales' => ['id' => 'today_sales', 'title' => 'مبيعات وإيراد اليوم', 'icon' => '🛒', 'color' => '#059669', 'tab' => 'sales', 'metric_key' => 'today_sales', 'enabled' => true],
            'cashbox' => ['id' => 'cashbox', 'title' => 'رصيد الصندوق / الحساب', 'icon' => '💵', 'color' => '#d97706', 'tab' => 'cashbox_accounts', 'metric_key' => 'cashbox', 'enabled' => true],
            'warehouses' => ['id' => 'warehouses', 'title' => 'مخزون الكروت والعهد', 'icon' => '🏢', 'color' => '#0891b2', 'tab' => 'card_warehouses', 'metric_key' => 'warehouses', 'enabled' => true],
            'cards_users' => ['id' => 'cards_users', 'title' => 'الكروت والمشتركون', 'icon' => '🎫', 'color' => '#8b5cf6', 'tab' => 'users', 'metric_key' => 'cards_users', 'enabled' => true],
            'active_sessions' => ['id' => 'active_sessions', 'title' => 'المتصلون أونلاين', 'icon' => '⚡', 'color' => '#16a34a', 'tab' => 'active_sessions', 'metric_key' => 'active_sessions', 'enabled' => true],
            'distributor_debt' => ['id' => 'distributor_debt', 'title' => 'مديونيات الموزعين والوكلاء', 'icon' => '💳', 'color' => '#dc2626', 'tab' => 'admins_agents', 'metric_key' => 'distributor_debt', 'enabled' => true],
            'vouchers_today' => ['id' => 'vouchers_today', 'title' => 'سندات القبض والصرف', 'icon' => '📑', 'color' => '#4f46e5', 'tab' => 'vouchers_fin', 'metric_key' => 'vouchers_today', 'enabled' => true],
            'assets' => ['id' => 'assets', 'title' => 'المعدات والأجهزة', 'icon' => '📡', 'color' => '#0284c7', 'tab' => 'assets', 'metric_key' => 'assets', 'enabled' => true],
            'networks' => ['id' => 'networks', 'title' => 'الشبكات والراوترات', 'icon' => '🌐', 'color' => '#2563eb', 'tab' => 'routers', 'metric_key' => 'networks', 'enabled' => true],
            'traffic_today' => ['id' => 'traffic_today', 'title' => 'حركة ترافيك اليوم', 'icon' => '📊', 'color' => '#7c3aed', 'tab' => 'noc', 'metric_key' => 'traffic_today', 'enabled' => true],
            'partners_capital' => ['id' => 'partners_capital', 'title' => 'رأس مال الشركاء', 'icon' => '🤝', 'color' => '#0d9488', 'tab' => 'partners_equity', 'metric_key' => 'partners_capital', 'enabled' => true],
            'security_alerts' => ['id' => 'security_alerts', 'title' => 'الأمان والتنبيهات', 'icon' => '🛡️', 'color' => '#e11d48', 'tab' => 'network_nodes', 'metric_key' => 'security_alerts', 'enabled' => true],
        ];
        // Role-based smart defaults if user has not customized yet
        $roleWidgetKeys = [
            'pos_agent' => ['today_sales', 'cashbox', 'warehouses', 'cards_users'],
            'distributor' => ['today_sales', 'cashbox', 'warehouses', 'distributor_debt', 'vouchers_today'],
            'finance' => ['cashbox', 'today_sales', 'vouchers_today', 'distributor_debt', 'partners_capital'],
            'accountant' => ['cashbox', 'today_sales', 'vouchers_today', 'distributor_debt', 'partners_capital'],
            'partner' => ['partners_capital', 'networks', 'assets', 'traffic_today'],
            'regular_node_owner' => ['assets', 'active_sessions', 'networks'],
            'sub_node_owner' => ['assets', 'active_sessions', 'networks'],
            'main_node_owner' => ['assets', 'active_sessions', 'networks', 'traffic_today'],
            'maintenance' => ['assets', 'networks', 'traffic_today', 'security_alerts', 'active_sessions'],
        ];
        $defaultShortcutsByRole = [
            'pos_agent' => [
                ['id' => 'sc_sales', 'title' => 'فاتورة بيع كروت جديدة', 'icon' => '🛒', 'action_type' => 'tab', 'target' => 'sales'],
                ['id' => 'sc_warehouses', 'title' => 'عرض كروت عهدتي ومخزني', 'icon' => '🏢', 'action_type' => 'tab', 'target' => 'card_warehouses'],
                ['id' => 'sc_portal', 'title' => 'بوابة فحص كرت المشترك', 'icon' => '📱', 'action_type' => 'tab', 'target' => 'subscriber_portal'],
            ],
            'distributor' => [
                ['id' => 'sc_transfer', 'title' => 'توزيع صفحات للموزعين', 'icon' => '📦', 'action_type' => 'modal', 'target' => 'transfer_sheets'],
                ['id' => 'sc_sales', 'title' => 'فاتورة بيع كروت جديدة', 'icon' => '🛒', 'action_type' => 'tab', 'target' => 'sales'],
                ['id' => 'sc_receipt', 'title' => 'سند قبض نقدية', 'icon' => '💵', 'action_type' => 'modal', 'target' => 'receipt_voucher'],
                ['id' => 'sc_warehouses', 'title' => 'مخازن الكروت والعهد', 'icon' => '🏢', 'action_type' => 'tab', 'target' => 'card_warehouses'],
            ],
        ];
        $defaultBottomNavByRole = [
            'pos_agent' => [
                ['tab' => 'dashboard', 'title' => 'الرئيسية', 'icon' => '📊'],
                ['tab' => 'sales', 'title' => 'المبيعات', 'icon' => '🛒'],
                ['tab' => 'card_warehouses', 'title' => 'مخزني', 'icon' => '🏢'],
                ['tab' => 'subscriber_portal', 'title' => 'البوابة', 'icon' => '📱'],
            ],
            'distributor' => [
                ['tab' => 'dashboard', 'title' => 'الرئيسية', 'icon' => '📊'],
                ['tab' => 'sales', 'title' => 'المبيعات', 'icon' => '🛒'],
                ['tab' => 'card_warehouses', 'title' => 'المخازن', 'icon' => '🏢'],
                ['tab' => 'vouchers_fin', 'title' => 'السندات', 'icon' => '🧾'],
            ],
        ];
        // 4. Resolve default or user-customized widgets
        $keysForRole = $roleWidgetKeys[$callerRole] ?? array_keys($allWidgetsPool);
        $roleDefaultWidgets = array_values(array_intersect_key($allWidgetsPool, array_flip($keysForRole)));
        $finalWidgets = $userSettings['dashboard_widgets'] ?? ($defaultSettings['dashboard_widgets'] ?? (
            isset($sysSettings['ui_dashboard_widgets']) && (in_array((string)$callerRole, ['system_owner', 'superadmin', 'admin'], true))
                ? json_decode($sysSettings['ui_dashboard_widgets'], true)
                : $roleDefaultWidgets
        ));
        $finalShortcuts = $userSettings['quick_shortcuts'] ?? ($defaultSettings['quick_shortcuts'] ?? (
            $defaultShortcutsByRole[$callerRole] ?? (
                isset($sysSettings['ui_quick_shortcuts']) 
                    ? json_decode($sysSettings['ui_quick_shortcuts'], true) 
                    : [
                        ['id' => 'sc_sales', 'title' => 'فاتورة بيع جديدة', 'icon' => '🛒', 'action_type' => 'tab', 'target' => 'sales'],
                        ['id' => 'sc_receipt', 'title' => 'سند قبض نقدية', 'icon' => '💵', 'action_type' => 'modal', 'target' => 'receipt_voucher'],
                        ['id' => 'sc_payment', 'title' => 'سند صرف مصاريف', 'icon' => '💳', 'action_type' => 'modal', 'target' => 'payment_voucher'],
                        ['id' => 'sc_assets', 'title' => 'فحص المعدات والأصول', 'icon' => '📡', 'action_type' => 'tab', 'target' => 'assets'],
                    ]
            )
        ));
        $finalBottomNav = $userSettings['mobile_bottom_nav'] ?? ($defaultSettings['mobile_bottom_nav'] ?? (
            $defaultBottomNavByRole[$callerRole] ?? (
                isset($sysSettings['ui_mobile_bottom_nav']) 
                    ? json_decode($sysSettings['ui_mobile_bottom_nav'], true) 
                    : [
                        ['tab' => 'dashboard', 'title' => 'الرئيسية', 'icon' => '📊'],
                        ['tab' => 'users', 'title' => 'الكروت', 'icon' => '👥'],
                        ['tab' => 'sales', 'title' => 'المبيعات', 'icon' => '💳'],
                        ['tab' => 'cashbox_accounts', 'title' => 'المالية', 'icon' => '💰'],
                        ['tab' => 'operating_expenses', 'title' => 'المصروفات التشغيلية', 'icon' => '💸'],
                        ['tab' => 'chart_of_accounts', 'title' => 'الحسابات', 'icon' => '📑'],
                        ['tab' => 'reports_center', 'title' => 'التقارير', 'icon' => '📈'],
                        ['tab' => 'admins_agents', 'title' => 'المستخدمين', 'icon' => '👥'],
                        ['tab' => 'whatsapp_manager', 'title' => 'الواتساب', 'icon' => '💬'],
                    ]
            )
        ));
        $result = [
            'is_user_customized' => !empty($userSettings),
            'admin_id' => $callerId,
            'role' => $callerRole,
            'settings_source' => !empty($userSettings) ? 'personal' : (!empty($defaultSettings) ? 'default' : 'built_in'),
            'app_title' => $sysSettings['ui_app_title'] ?? 'MikroTik User Manager ERP',
            'app_short_title' => $sysSettings['ui_app_short_title'] ?? 'SAM ERP',
            'header_buttons' => $userSettings['header_buttons'] ?? ($defaultSettings['header_buttons'] ?? (isset($sysSettings['ui_header_buttons']) ? json_decode($sysSettings['ui_header_buttons'], true) : ['network_switcher', 'notif', 'whatsapp', 'portal', 'lang', 'theme', 'logout'])),
            'dashboard_widgets' => $finalWidgets,
            'quick_shortcuts' => $finalShortcuts,
            'mobile_bottom_nav' => $finalBottomNav,
            'default_theme' => $userSettings['default_theme'] ?? ($defaultSettings['default_theme'] ?? ($sysSettings['ui_default_theme'] ?? 'light')),
            'layout_density' => $userSettings['layout_density'] ?? ($defaultSettings['layout_density'] ?? ($sysSettings['ui_layout_density'] ?? 'normal')),
            'system_template' => $userSettings['system_template'] ?? ($defaultSettings['system_template'] ?? ($sysSettings['ui_system_template'] ?? ($sysSettings['ui_owner_system_template'] ?? 'modern_clean'))),
            'table_defaults' => $userSettings['table_defaults'] ?? ($defaultSettings['table_defaults'] ?? (isset($sysSettings['ui_table_defaults']) ? json_decode($sysSettings['ui_table_defaults'], true) : ['view_mode' => 'standard', 'density' => 'normal'])),
            'module_labels' => $userSettings['module_labels'] ?? ($defaultSettings['module_labels'] ?? (isset($sysSettings['ui_module_labels']) ? json_decode($sysSettings['ui_module_labels'], true) : [])),
            'sidebar_layout' => $userSettings['sidebar_layout'] ?? ($defaultSettings['sidebar_layout'] ?? (isset($sysSettings['ui_sidebar_layout']) ? json_decode($sysSettings['ui_sidebar_layout'], true) : [])),
            'theme_palette' => $userSettings['theme_palette'] ?? ($defaultSettings['theme_palette'] ?? (isset($sysSettings['ui_theme_palette']) ? json_decode($sysSettings['ui_theme_palette'], true) : [])),
        ];
        if(($GLOBALS['sam_request_authorization_context']??null) instanceof AuthorizationContext){
            require_once __DIR__.'/NetworkConfigurationService.php';
            try{$result=(new NetworkConfigurationService($this->db,$GLOBALS['sam_request_authorization_context']))->applyAppearance($result);}catch(DomainException $e){/* Platform-only accounts may have no active network. */}
        }
        return $result;
    }

    // ==========================================
    // METHOD: saveUISettings
    // ==========================================
    public function saveUISettings($data) {
        $ctx = $this->getActiveAdminContext();
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        $userSettings = [
            'header_buttons' => $data['header_buttons'] ?? null,
            'dashboard_widgets' => $data['dashboard_widgets'] ?? null,
            'quick_shortcuts' => $data['quick_shortcuts'] ?? null,
            'mobile_bottom_nav' => $data['mobile_bottom_nav'] ?? null,
            'default_theme' => trim((string)($data['default_theme'] ?? 'light')),
            'layout_density' => trim((string)($data['layout_density'] ?? 'normal')),
            'system_template' => trim((string)($data['system_template'] ?? 'modern_clean')),
            'table_defaults' => is_array($data['table_defaults'] ?? null) ? $data['table_defaults'] : ['view_mode' => 'standard', 'density' => 'normal'],
            'module_labels' => is_array($data['module_labels'] ?? null) ? $data['module_labels'] : [],
            'sidebar_layout' => is_array($data['sidebar_layout'] ?? null) ? $data['sidebar_layout'] : [],
            'theme_palette' => is_array($data['theme_palette'] ?? null) ? $data['theme_palette'] : [],
        ];
        // Save into per-user table um_admin_ui_settings
        try {
            $this->db->exec("CREATE TABLE IF NOT EXISTS um_admin_ui_settings (
                admin_id INT(11) NOT NULL PRIMARY KEY,
                ui_settings LONGTEXT NOT NULL,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
        } catch (\Throwable $e) {}
        $stmtUser = $this->db->prepare("REPLACE INTO um_admin_ui_settings (admin_id, ui_settings, updated_at) VALUES (?, ?, NOW())");
        $stmtUser->execute([$callerId, json_encode($userSettings, JSON_UNESCAPED_UNICODE)]);
        // If SuperAdmin requested to save as system default, persist a full default profile.
        $isSystemOwner = false;
        try {
            $ownerStmt = $this->db->prepare("SELECT COUNT(*) FROM um_system_owners WHERE admin_id = ?");
            $ownerStmt->execute([$callerId]);
            $isSystemOwner = (bool)$ownerStmt->fetchColumn();
        } catch (\Throwable $e) {}
        if ((in_array($callerRole, ['system_owner', 'superadmin'], true) || $isSystemOwner) && !empty($data['save_as_system_default'])) {
            $this->db->exec("CREATE TABLE IF NOT EXISTS um_ui_default_layouts (
                role_key VARCHAR(64) NOT NULL PRIMARY KEY,
                ui_settings LONGTEXT NOT NULL,
                updated_by_admin_id INT NULL,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
            $defaultStmt = $this->db->prepare("INSERT INTO um_ui_default_layouts (role_key, ui_settings, updated_by_admin_id) VALUES ('*', ?, ?) ON DUPLICATE KEY UPDATE ui_settings=VALUES(ui_settings), updated_by_admin_id=VALUES(updated_by_admin_id), updated_at=NOW()");
            $defaultStmt->execute([json_encode($userSettings, JSON_UNESCAPED_UNICODE), $callerId]);
            $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()");
            if (!empty($userSettings['app_title'])) $stmt->execute([':k' => 'ui_app_title', ':v' => $userSettings['app_title']]);
            if (!empty($userSettings['app_short_title'])) $stmt->execute([':k' => 'ui_app_short_title', ':v' => $userSettings['app_short_title']]);
            if ($userSettings['header_buttons']) $stmt->execute([':k' => 'ui_header_buttons', ':v' => json_encode($userSettings['header_buttons'], JSON_UNESCAPED_UNICODE)]);
            if ($userSettings['dashboard_widgets']) $stmt->execute([':k' => 'ui_dashboard_widgets', ':v' => json_encode($userSettings['dashboard_widgets'], JSON_UNESCAPED_UNICODE)]);
            if ($userSettings['quick_shortcuts']) $stmt->execute([':k' => 'ui_quick_shortcuts', ':v' => json_encode($userSettings['quick_shortcuts'], JSON_UNESCAPED_UNICODE)]);
            if ($userSettings['mobile_bottom_nav']) $stmt->execute([':k' => 'ui_mobile_bottom_nav', ':v' => json_encode($userSettings['mobile_bottom_nav'], JSON_UNESCAPED_UNICODE)]);
            if (!empty($userSettings['default_theme'])) $stmt->execute([':k' => 'ui_default_theme', ':v' => $userSettings['default_theme']]);
            if (!empty($userSettings['system_template'])) {
                $stmt->execute([':k' => 'ui_system_template', ':v' => $userSettings['system_template']]);
                $stmt->execute([':k' => 'ui_owner_system_template', ':v' => $userSettings['system_template']]);
            }
            if (!empty($userSettings['table_defaults'])) $stmt->execute([':k' => 'ui_table_defaults', ':v' => json_encode($userSettings['table_defaults'], JSON_UNESCAPED_UNICODE)]);
            $stmt->execute([':k' => 'ui_layout_density', ':v' => $userSettings['layout_density']]);
            $stmt->execute([':k' => 'ui_owner_layout_density', ':v' => $userSettings['layout_density']]);
            $stmt->execute([':k' => 'ui_module_labels', ':v' => json_encode($userSettings['module_labels'], JSON_UNESCAPED_UNICODE)]);
            $stmt->execute([':k' => 'ui_sidebar_layout', ':v' => json_encode($userSettings['sidebar_layout'], JSON_UNESCAPED_UNICODE)]);
            $stmt->execute([':k' => 'ui_theme_palette', ':v' => json_encode($userSettings['theme_palette'], JSON_UNESCAPED_UNICODE)]);
        }
        return ['success' => true, 'message' => 'تم حفظ تخصيص واجهتك ولوحتك الشخصية بنجاح ✓'];
    }

    // ==========================================
    // METHOD: resetUserUISettings
    // ==========================================
    public function resetUserUISettings() {
        $ctx = $this->getActiveAdminContext();
        $callerId = (int)$ctx['id'];
        $this->db->prepare("DELETE FROM um_admin_ui_settings WHERE admin_id = ?")->execute([$callerId]);
        return ['success' => true, 'message' => 'تمت استعادة الإعدادات الافتراضية لرتبتك بنجاح'];
    }

    // ==========================================
    // METHOD: computeWidgetMetric
    // ==========================================
    public function computeWidgetMetric($widget) {
        $source = $widget['source'] ?? $widget['metric_key'] ?? 'assets';
        $agg = $widget['aggregation'] ?? 'count_all';
        $filters = $widget['filters'] ?? [];
        if (is_string($filters)) {
            $filters = json_decode($filters, true) ?: [];
        }
        $timeframe = $filters['timeframe'] ?? 'all';
        $status = $filters['status'] ?? 'all';
        // Never trust a dashboard widget's network filter; metrics are always bound
        // to the server-validated active network.
        $networkId = $this->getActiveNetworkId();
        $profile = !empty($filters['profile']) ? trim($filters['profile']) : null;
        $nodeId = !empty($filters['node_id']) ? (int)$filters['node_id'] : null;
        $partyId = !empty($filters['party_id']) ? (int)$filters['party_id'] : null;
        $dateCond = function($col) use ($timeframe) {
            switch ($timeframe) {
                case 'today': return "DATE($col) = CURDATE()";
                case 'yesterday': return "DATE($col) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
                case 'this_week': return "YEARWEEK($col, 1) = YEARWEEK(CURDATE(), 1)";
                case 'this_month': return "YEAR($col) = YEAR(CURDATE()) AND MONTH($col) = MONTH(CURDATE())";
                case 'last_month': return "YEAR($col) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH($col) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))";
                case 'this_year': return "YEAR($col) = YEAR(CURDATE())";
                default: return "1=1";
            }
        };
        $fmtMoney = function($n) {
            return number_format((float)$n, 2) . ' ر.ي';
        };
        $result = [
            'value' => '0',
            'raw_value' => 0,
            'sub_text' => '',
            'count' => 0,
            'source' => $source,
            'aggregation' => $agg
        ];
        try {
            switch ($source) {
                case 'assets':
                    $where = ["network_id = :active_network"];
                    $params = [':active_network'=>$networkId];
                    if ($status === 'in_service') {
                        $where[] = "status = 'in_service'";
                    } elseif ($status === 'offline') {
                        $where[] = "(status = 'offline' OR status = 'out_of_service')";
                    } elseif ($status === 'maintenance') {
                        $where[] = "status = 'maintenance'";
                    } elseif ($status === 'in_stock') {
                        $where[] = "status = 'in_stock'";
                    } elseif ($status !== 'all' && !empty($status)) {
                        $where[] = "status = :st";
                        $params[':st'] = $status;
                    }
                    if ($nodeId) {
                        $where[] = "node_id = :node";
                        $params[':node'] = $nodeId;
                    }
                    if ($timeframe !== 'all') {
                        $where[] = $dateCond('created_at');
                    }
                    $whereStr = implode(' AND ', $where);
                    if ($agg === 'count_all' || $agg === 'count_online' || $agg === 'count_offline' || $agg === 'count_maintenance') {
                        if ($agg === 'count_online') $whereStr .= " AND status = 'in_service'";
                        if ($agg === 'count_offline') $whereStr .= " AND (status = 'offline' OR status = 'out_of_service')";
                        if ($agg === 'count_maintenance') $whereStr .= " AND status = 'maintenance'";
                        $sql = "SELECT COUNT(*) FROM um_assets WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $cnt = (int)$stmt->fetchColumn();
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' جهاز';
                        $result['count'] = $cnt;
                    } elseif ($agg === 'sum_outages') {
                        $sql = "SELECT COALESCE(SUM(outage_count), 0), COUNT(*) FROM um_assets WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $outages = (int)$row[0];
                        $result['raw_value'] = $outages;
                        $result['value'] = number_format($outages) . ' انقطاع';
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'sum_cost') {
                        $sql = "SELECT COALESCE(SUM(purchase_cost), 0), COUNT(*) FROM um_assets WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $cost = (float)$row[0];
                        $result['raw_value'] = $cost;
                        $result['value'] = $fmtMoney($cost);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'sum_value') {
                        $sql = "SELECT COALESCE(SUM(current_value), 0), COUNT(*) FROM um_assets WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    }
                    break;
                case 'sales':
                    $where = ["network_id = :active_network"];
                    $params = [':active_network'=>$networkId];
                    if ($status === 'paid') {
                        $where[] = "remaining_amount <= 0";
                    } elseif ($status === 'unpaid') {
                        $where[] = "paid_amount <= 0";
                    } elseif ($status === 'partial') {
                        $where[] = "(paid_amount > 0 AND remaining_amount > 0)";
                    }
                    if ($profile) {
                        $where[] = "profile_name = :prof";
                        $params[':prof'] = $profile;
                    }
                    if ($partyId) {
                        $where[] = "buyer_id = :buyer";
                        $params[':buyer'] = $partyId;
                    }
                    if ($timeframe !== 'all') {
                        $where[] = $dateCond('created_at');
                    }
                    $whereStr = implode(' AND ', $where);
                    if ($agg === 'sum_total') {
                        $sql = "SELECT COALESCE(SUM(total_amount), 0), COUNT(*) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'sum_paid') {
                        $sql = "SELECT COALESCE(SUM(paid_amount), 0), COUNT(*) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'sum_remaining') {
                        $sql = "SELECT COALESCE(SUM(remaining_amount), 0), COUNT(*) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'count_invoices') {
                        $sql = "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $cnt = (int)$row[0];
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' فاتورة';
                        $result['count'] = $cnt;
                    } elseif ($agg === 'sum_quantity') {
                        $sql = "SELECT COALESCE(SUM(quantity), 0), COUNT(*) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (int)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = number_format($val) . ' كرت';
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'avg_invoice') {
                        $sql = "SELECT COALESCE(AVG(total_amount), 0), COUNT(*) FROM um_sales_invoices WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    }
                    break;
                case 'vouchers_fin':
                    $where = ["network_id = :active_network"];
                    $params = [':active_network'=>$networkId];
                    if ($status === 'receipt' || $agg === 'sum_receipts') {
                        $where[] = "voucher_type = 'receipt'";
                    } elseif ($status === 'payment' || $agg === 'sum_payments') {
                        $where[] = "voucher_type = 'payment'";
                    }
                    if ($partyId) {
                        $where[] = "party_id = :party";
                        $params[':party'] = $partyId;
                    }
                    if ($timeframe !== 'all') {
                        $where[] = $dateCond('created_at');
                    }
                    $whereStr = implode(' AND ', $where);
                    if ($agg === 'sum_receipts' || $agg === 'sum_payments' || $agg === 'sum_amount') {
                        $sql = "SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM um_vouchers_financial WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'net_cashflow') {
                        $sql = "SELECT 
                            COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN amount ELSE -amount END), 0) as net,
                            COUNT(*) as cnt
                            FROM um_vouchers_financial WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'count_vouchers') {
                        $sql = "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM um_vouchers_financial WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $cnt = (int)$row[0];
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' سند';
                        $result['count'] = $cnt;
                    }
                    break;
                case 'users':
                    $where = ["network_id = :active_network"];
                    $params = [':active_network'=>$networkId];
                    if ($status === 'active') {
                        $where[] = "disabled = 0";
                    } elseif ($status === 'disabled') {
                        $where[] = "disabled = 1";
                    }
                    if ($profile) {
                        $where[] = "group_name = :prof";
                        $params[':prof'] = $profile;
                    }
                    if ($timeframe !== 'all') {
                        $where[] = $dateCond('created_at');
                    }
                    $whereStr = implode(' AND ', $where);
                    if ($agg === 'count_all' || $agg === 'count_active' || $agg === 'count_disabled') {
                        $sql = "SELECT COUNT(*) FROM um_users WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $cnt = (int)$stmt->fetchColumn();
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' كرت / مشترك';
                        $result['count'] = $cnt;
                    } elseif ($agg === 'sum_money_paid') {
                        $sql = "SELECT COALESCE(SUM(money_paid), 0), COUNT(*) FROM um_users WHERE $whereStr";
                        $stmt = $this->db->prepare($sql);
                        $stmt->execute($params);
                        $row = $stmt->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } elseif ($agg === 'count_warehouse') {
                        $sql = "SELECT COUNT(*) FROM um_users WHERE network_id=? AND status = 'active' AND (distributor_id IS NULL OR distributor_id = 0)";
                        $st=$this->db->prepare($sql);$st->execute([$networkId]);$cnt = (int)$st->fetchColumn();
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' كرت جاهز بالمخزن';
                        $result['count'] = $cnt;
                    }
                    break;
                case 'active_sessions':
                    $where = ["network_id=".(int)$networkId, "acctstoptime IS NULL", "username NOT REGEXP '^router_[0-9]+$'"];
                    $whereStr = implode(' AND ', $where);
                    if ($agg === 'count_sessions' || $agg === 'count_all') {
                        $sql = "SELECT COUNT(*) FROM radacct WHERE $whereStr";
                        $cnt = (int)$this->db->query($sql)->fetchColumn();
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' متصل أونلاين';
                        $result['count'] = $cnt;
                    } elseif ($agg === 'sum_traffic_total' || $agg === 'sum_traffic_in' || $agg === 'sum_traffic_out') {
                        $sql = "SELECT COALESCE(SUM(acctinputoctets), 0) as up, COALESCE(SUM(acctoutputoctets), 0) as down FROM radacct WHERE $whereStr";
                        $traffic = $this->db->query($sql)->fetch(PDO::FETCH_ASSOC);
                        $up = (float)($traffic['up'] ?? 0);
                        $down = (float)($traffic['down'] ?? 0);
                        if ($agg === 'sum_traffic_in') {
                            $result['raw_value'] = $down;
                            $result['value'] = $this->formatBytes($down);
                        } elseif ($agg === 'sum_traffic_out') {
                            $result['raw_value'] = $up;
                            $result['value'] = $this->formatBytes($up);
                        } else {
                            $tot = $up + $down;
                            $result['raw_value'] = $tot;
                            $result['value'] = $this->formatBytes($tot);
                        }
                    }
                    break;
                case 'cashbox':
                    $cash = $this->getCashboxSummary();
                    if ($agg === 'balance' || $agg === 'cashbox_balance') {
                        $val = (float)($cash['cashbox_balance'] ?? 0);
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                    } elseif ($agg === 'distributor_debt') {
                        $val = (float)($cash['total_distributor_debt'] ?? 0);
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                    }
                    break;
                case 'routers':
                    $sql = "SELECT COUNT(*) FROM nas WHERE network_id=?";
                    $st=$this->db->prepare($sql);$st->execute([$networkId]);$cnt = (int)$st->fetchColumn();
                    $result['raw_value'] = $cnt;
                    $result['value'] = number_format($cnt) . ' راوتر';
                    $result['count'] = $cnt;
                    break;
                case 'card_warehouses':
                    $sql = "SELECT COUNT(*) FROM um_users WHERE network_id=? AND status = 'active' AND (distributor_id IS NULL OR distributor_id = 0)";
                    $st=$this->db->prepare($sql);$st->execute([$networkId]);$cnt = (int)$st->fetchColumn();
                    $result['raw_value'] = $cnt;
                    $result['value'] = number_format($cnt) . ' كرت بالمستودع';
                    $result['count'] = $cnt;
                    break;
                case 'partners':
                    if ($agg === 'sum_capital') {
                        $sql = "SELECT COALESCE(SUM(capital_amount), 0), COUNT(*) FROM um_network_partners WHERE network_id=?";
                        $st=$this->db->prepare($sql);$st->execute([$networkId]);$row = $st->fetch(PDO::FETCH_NUM);
                        $val = (float)$row[0];
                        $result['raw_value'] = $val;
                        $result['value'] = $fmtMoney($val);
                        $result['count'] = (int)$row[1];
                    } else {
                        $sql = "SELECT COUNT(*) FROM um_network_partners WHERE network_id=?";
                        $st=$this->db->prepare($sql);$st->execute([$networkId]);$cnt = (int)$st->fetchColumn();
                        $result['raw_value'] = $cnt;
                        $result['value'] = number_format($cnt) . ' شريك';
                        $result['count'] = $cnt;
                    }
                    break;
                case 'network_nodes':
                    $sql = "SELECT COUNT(*) FROM um_network_nodes WHERE network_id=?";
                    $st=$this->db->prepare($sql);$st->execute([$networkId]);$cnt = (int)$st->fetchColumn();
                    $result['raw_value'] = $cnt;
                    $result['value'] = number_format($cnt) . ' عقدة ونقطة';
                    $result['count'] = $cnt;
                    break;
                default:
                    $result['value'] = '---';
                    break;
            }
        } catch (\Exception $e) {
            $result['error'] = $e->getMessage();
        }
        return $result;
    }

    // ==========================================
    // METHOD: getDashboardStats
    // ==========================================
    public function getDashboardStats() {
        $ctx = $this->getActiveAdminContext();
        $networkId=$this->getActiveNetworkId();
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        // Strict role scoping for non-admin users (POS agents, distributors, etc.)
        if (!in_array($callerRole, ['system_owner', 'superadmin', 'admin'], true)) {
            $stats = [];
            $stats['total_assets'] = 0;
            $stats['online_assets'] = 0;
            $stats['offline_assets'] = 0;
            $stats['outages_count'] = 0;
            $stats['total_networks'] = 0;
            $stats['total_routers'] = 0;
            $stats['active_routers'] = 0;
            $stats['sstp_tunnels'] = 0;
            $stats['total_partners'] = 0;
            $stats['total_partner_capital'] = 0;
            $stats['unregistered_devices_count'] = 0;
            $stats['duplicate_macs_count'] = 0;
            $stats['total_distributors'] = 0;
            $stats['radius_status'] = 'running';
            $stats['top_routers'] = [];
            $stats['today_upload_bytes'] = 0;
            $stats['today_download_bytes'] = 0;
            $stats['today_total_bytes'] = 0;
            $stats['total_profiles'] = (int)$this->db->query("SELECT COUNT(*) FROM um_profiles_def WHERE network_id=$networkId")->fetchColumn();
            $stats['total_templates'] = (int)$this->db->query("SELECT COUNT(*) FROM um_card_templates WHERE network_id=$networkId")->fetchColumn();
            // Personal warehouse custody stock
            $whInv = $this->getWarehouseSheetInventory($callerId);
            $stats['warehouse_stock'] = (int)($whInv['total_cards'] ?? 0);
            $stats['total_users'] = (int)($whInv['total_cards'] ?? 0) + (int)($whInv['sold_cards'] ?? 0);
            $stats['expired_cards'] = 0;
            // Active sessions for cards created or owned by this seller
            try {
                $sessStmt = $this->db->prepare("
                    SELECT COUNT(*) 
                    FROM radacct r 
                    JOIN um_users u ON r.username = u.username AND u.network_id=r.network_id
                    WHERE r.network_id=? AND r.acctstoptime IS NULL AND (u.distributor_id = ? OR u.creator_admin_id = ?)
                ");
                $sessStmt->execute([$networkId,$callerId, $callerId]);
                $stats['active_sessions'] = (int)$sessStmt->fetchColumn();
            } catch (\Exception $e) {
                $stats['active_sessions'] = 0;
            }
            // Cashbox & Financial Balance for this user
            $adminRec=$this->getAdminById($callerId);
            $stats['cashbox_balance'] = (float)($adminRec['balance'] ?? 0);
            $stats['credit_limit'] = (float)($adminRec['credit_limit'] ?? 0);
            $stats['discount_rate'] = (float)($adminRec['discount_rate'] ?? 0);
            // Today's Sales by this user
            $sStmt = $this->db->prepare("SELECT COALESCE(SUM(total_amount), 0) FROM um_sales_invoices WHERE network_id=? AND seller_id = ? AND DATE(created_at) = CURDATE()");
            $sStmt->execute([$networkId,$callerId]);
            $stats['today_sales'] = (float)$sStmt->fetchColumn();
            // Remaining Debt (Money owed on purchases)
            $dStmt = $this->db->prepare("SELECT COALESCE(SUM(remaining_amount), 0) FROM um_sales_invoices WHERE network_id=? AND buyer_id = ?");
            $dStmt->execute([$networkId,$callerId]);
            $stats['total_debt'] = (float)$dStmt->fetchColumn();
            // Invoices count for this user
            $invTodayStmt = $this->db->prepare("SELECT COUNT(*) FROM um_sales_invoices WHERE network_id=? AND (buyer_id = ? OR seller_id = ?) AND DATE(created_at) = CURDATE()");
            $invTodayStmt->execute([$networkId,$callerId, $callerId]);
            $stats['today_invoices_count'] = (int)$invTodayStmt->fetchColumn();
            $invTotStmt = $this->db->prepare("SELECT COUNT(*) FROM um_sales_invoices WHERE network_id=? AND (buyer_id = ? OR seller_id = ?)");
            $invTotStmt->execute([$networkId,$callerId, $callerId]);
            $stats['total_invoices'] = (int)$invTotStmt->fetchColumn();
            // Vouchers for this user
            $vStmt = $this->db->prepare("SELECT 
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN amount ELSE 0 END), 0) as receipts,
                COALESCE(SUM(CASE WHEN voucher_type = 'payment' THEN amount ELSE 0 END), 0) as payments
                FROM um_vouchers_financial 
                WHERE network_id=? AND (created_by = ? OR party_id = ?) AND DATE(created_at) = CURDATE()");
            $vStmt->execute([$networkId,$callerId, $callerId]);
            $vToday = $vStmt->fetch(PDO::FETCH_ASSOC);
            $stats['today_vouchers_count'] = (int)($vToday['count'] ?? 0);
            $stats['today_receipts_amount'] = (float)($vToday['receipts'] ?? 0);
            $stats['today_payments_amount'] = (float)($vToday['payments'] ?? 0);
            return $stats;
        }
        $stats = [];
        // 1. Assets & Equipment
        try {
            $stats['total_assets'] = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$networkId")->fetchColumn();
            $stats['online_assets'] = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$networkId AND status = 'in_service'")->fetchColumn();
            $stats['offline_assets'] = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$networkId AND (status = 'offline' OR status = 'out_of_service')")->fetchColumn();
            $stats['outages_count'] = (int)$this->db->query("SELECT COUNT(*) FROM um_asset_outage_logs WHERE network_id=$networkId")->fetchColumn();
        } catch (\Exception $e) {
            $stats['total_assets'] = 0;
            $stats['online_assets'] = 0;
            $stats['offline_assets'] = 0;
            $stats['outages_count'] = 0;
        }
        // 2. Networks & Routers & SSTP
        try {
            $stats['total_networks'] = 1;
            $stats['total_routers'] = (int)$this->db->query("SELECT COUNT(*) FROM nas WHERE network_id=$networkId")->fetchColumn();
            $stats['active_routers'] = (int)$this->db->query("SELECT COUNT(DISTINCT nasipaddress) FROM radacct WHERE network_id=$networkId AND acctstoptime IS NULL AND username NOT REGEXP '^router_[0-9]+$'")->fetchColumn();
            $stats['sstp_tunnels'] = 0;
        } catch (\Exception $e) {
            $stats['total_networks'] = 0;
            $stats['total_routers'] = 0;
            $stats['active_routers'] = 0;
            $stats['sstp_tunnels'] = 0;
        }
        // 3. Hotspot Cards & Online Sessions
        try {
            $stats['total_users'] = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=$networkId AND username NOT REGEXP '^router_[0-9]+$'")->fetchColumn();
            $stats['active_sessions'] = (int)$this->db->query("SELECT COUNT(DISTINCT username) FROM radacct WHERE network_id=$networkId AND acctstoptime IS NULL AND username NOT REGEXP '^router_[0-9]+$'")->fetchColumn();
            $stats['total_profiles'] = (int)$this->db->query("SELECT COUNT(*) FROM um_profiles_def WHERE network_id=$networkId")->fetchColumn();
            $stats['total_templates'] = (int)$this->db->query("SELECT COUNT(*) FROM um_card_templates WHERE network_id=$networkId")->fetchColumn();
            // Physical ready stock in the current voucher/warehouse schema.
            $stats['warehouse_stock'] = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta m WHERE m.network_id=$networkId AND COALESCE(m.is_free_quota,0)=0 AND COALESCE(m.price,0)>0 AND m.profile_name NOT LIKE 'Free-%' AND m.first_login IS NULL AND COALESCE(m.status,'') NOT IN ('used','expired','depleted') AND (m.expires_at IS NULL OR m.expires_at>NOW()) AND NOT EXISTS (SELECT 1 FROM radacct a WHERE a.network_id=m.network_id AND a.username=m.username)")->fetchColumn();
            $stats['expired_cards'] = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=$networkId AND (status IN ('expired','depleted') OR (expires_at IS NOT NULL AND expires_at<=NOW()))")->fetchColumn();
        } catch (\Exception $e) {
            $stats['total_users'] = 0;
            $stats['active_sessions'] = 0;
            $stats['total_profiles'] = 0;
            $stats['total_templates'] = 0;
            $stats['warehouse_stock'] = 0;
            $stats['expired_cards'] = 0;
        }
        // 4. Traffic & Bandwidth
        try {
            $todaySql = "SELECT COALESCE(SUM(acctinputoctets), 0) as upload, COALESCE(SUM(acctoutputoctets), 0) as download 
                         FROM radacct 
                         WHERE network_id=$networkId AND acctstarttime >= CURDATE() AND username NOT REGEXP '^router_[0-9]+$'";
            $traffic = $this->db->query($todaySql)->fetch();
            $stats['today_upload_bytes'] = (float)($traffic['upload'] ?? 0);
            $stats['today_download_bytes'] = (float)($traffic['download'] ?? 0);
            $stats['today_total_bytes'] = $stats['today_upload_bytes'] + $stats['today_download_bytes'];
        } catch (\Exception $e) {
            $stats['today_upload_bytes'] = 0;
            $stats['today_download_bytes'] = 0;
            $stats['today_total_bytes'] = 0;
        }
        // 5. Cashbox, Financial Accounts & Sales
        try {
            $cash = $this->getCashboxSummary();
            $stats['cashbox_balance'] = $cash['cashbox_balance'] ?? 0;
            $stats['today_sales'] = $cash['today_sales'] ?? 0;
            $stats['total_debt'] = $cash['total_distributor_debt'] ?? 0;
            // Invoices count today
            $stats['today_invoices_count'] = (int)$this->db->query("SELECT COUNT(*) FROM um_sales_invoices WHERE network_id=$networkId AND DATE(created_at)=CURDATE()")->fetchColumn();
            $stats['total_invoices'] = (int)$this->db->query("SELECT COUNT(*) FROM um_sales_invoices WHERE network_id=$networkId")->fetchColumn();
            // Vouchers today
            $vToday = $this->db->query("SELECT 
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN amount ELSE 0 END), 0) as receipts,
                COALESCE(SUM(CASE WHEN voucher_type = 'payment' THEN amount ELSE 0 END), 0) as payments
                FROM um_vouchers_financial 
                WHERE network_id=$networkId AND DATE(created_at) = CURDATE()")->fetch();
            $stats['today_vouchers_count'] = (int)($vToday['count'] ?? 0);
            $stats['today_receipts_amount'] = (float)($vToday['receipts'] ?? 0);
            $stats['today_payments_amount'] = (float)($vToday['payments'] ?? 0);
        } catch (\Exception $e) {
            $stats['cashbox_balance'] = 0;
            $stats['today_sales'] = 0;
            $stats['total_debt'] = 0;
            $stats['today_invoices_count'] = 0;
            $stats['total_invoices'] = 0;
            $stats['today_vouchers_count'] = 0;
            $stats['today_receipts_amount'] = 0;
            $stats['today_payments_amount'] = 0;
        }
        // 6. Partners & Equity
        try {
            $stats['total_partners'] = (int)$this->db->query("SELECT COUNT(*) FROM um_network_partners WHERE network_id=$networkId")->fetchColumn();
            $stats['total_partner_capital'] = (float)$this->db->query("SELECT COALESCE(SUM(capital_amount),0) FROM um_network_partners WHERE network_id=$networkId")->fetchColumn();
        } catch (\Exception $e) {
            $stats['total_partners'] = 0;
            $stats['total_partner_capital'] = 0;
        }
        // 7. Security & Topology Alerts
        try {
            $stats['unregistered_devices_count'] = (int)$this->db->query("SELECT COUNT(*) FROM um_network_nodes WHERE network_id=$networkId AND node_type='unregistered'")->fetchColumn();
            $stats['duplicate_macs_count'] = (int)$this->db->query("SELECT COUNT(*) FROM (SELECT mac_address FROM um_assets WHERE network_id=$networkId AND mac_address IS NOT NULL AND mac_address!='' GROUP BY mac_address HAVING COUNT(*)>1) dup")->fetchColumn();
        } catch (\Exception $e) {
            $stats['unregistered_devices_count'] = 0;
            $stats['duplicate_macs_count'] = 0;
        }
        $stats['total_distributors'] = (int)$this->db->query("SELECT COUNT(*) FROM um_admin_network_roles WHERE network_id=$networkId AND is_active=1 AND role_key IN ('distributor','pos_agent')")->fetchColumn();
        $serviceStatus = shell_exec('systemctl is-active freeradius 2>/dev/null');
        $stats['radius_status'] = trim($serviceStatus) === 'active' ? 'running' : 'stopped';
        try {
            $topRoutersSql = "SELECT a.nasipaddress, COALESCE(n.shortname, a.nasipaddress) as name, COUNT(*) as sessions 
                              FROM radacct a 
                              LEFT JOIN nas n ON n.network_id=a.network_id AND a.nasipaddress = n.nasname 
                              WHERE a.network_id=$networkId AND a.acctstoptime IS NULL AND a.username NOT REGEXP '^router_[0-9]+$' 
                              GROUP BY a.nasipaddress 
                              ORDER BY sessions DESC 
                              LIMIT 5";
            $stats['top_routers'] = $this->db->query($topRoutersSql)->fetchAll();
        } catch (\Exception $e) {
            $stats['top_routers'] = [];
        }
                // Compute dynamic metrics for all configured dashboard widgets
        try {
            $ui = $this->getUISettings();
            $computed = [];
            foreach (($ui['dashboard_widgets'] ?? []) as $w) {
                if (!empty($w['id'])) {
                    $computed[$w['id']] = $this->computeWidgetMetric($w);
                }
            }
            $stats['computed_widgets'] = $computed;
        } catch (\Exception $e) {
            $stats['computed_widgets'] = [];
        }
        return $stats;
    }

    // ==========================================
    // METHOD: getNotifications
    // ==========================================
    public function getNotifications($adminId = 0, $role = '') {
        $adminId = (int)$adminId;
        if ($adminId <= 0) throw new DomainException('AUTH_REQUIRED');
        $sql = "SELECT n.*, CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS is_read
                FROM um_notifications n
                LEFT JOIN um_notification_receipts r ON r.network_id=n.network_id AND r.notification_id=n.id AND r.admin_id=:receipt_admin_id
                WHERE n.network_id=:network_id AND (n.target_role IS NULL OR n.target_role='all' OR n.target_role=:target_role)
                  AND (n.target_admin_id IS NULL OR n.target_admin_id=:target_admin_id)
                  AND r.deleted_at IS NULL
                ORDER BY n.id DESC LIMIT 50";
        $stmt=$this->db->prepare($sql);$stmt->execute([
            ':receipt_admin_id'=>$adminId,
            ':network_id'=>$this->getActiveNetworkId(),
            ':target_role'=>$role ?: 'superadmin',
            ':target_admin_id'=>$adminId,
        ]);$notifs=$stmt->fetchAll();
        return ['success'=>true,'unread_count'=>count(array_filter($notifs,fn($n)=>!(int)$n['is_read'])),'notifications'=>$notifs];
    }
    public function markNotificationRead($id, $adminId = 0, $role = '') {
        $adminId=(int)$adminId;if($adminId<=0)throw new DomainException('AUTH_REQUIRED');
        $networkId=$this->getActiveNetworkId();
        $stmt=$this->db->prepare("INSERT INTO um_notification_receipts(network_id,notification_id,admin_id,read_at)
            SELECT n.network_id,n.id,?,NOW() FROM um_notifications n WHERE n.network_id=? AND n.id=? AND (n.target_role IS NULL OR n.target_role='all' OR n.target_role=?) AND (n.target_admin_id IS NULL OR n.target_admin_id=?)
            ON DUPLICATE KEY UPDATE read_at=NOW(),deleted_at=NULL");$stmt->execute([$adminId,$networkId,(int)$id,$role ?: 'superadmin',$adminId]);
        if($stmt->rowCount()===0)throw new DomainException('FORBIDDEN_SCOPE');return ['success'=>true];
    }
    public function markAllNotificationsRead($adminId = 0, $role = '') {
        $adminId=(int)$adminId;if($adminId<=0)throw new DomainException('AUTH_REQUIRED');
        $networkId=$this->getActiveNetworkId();
        $stmt=$this->db->prepare("INSERT INTO um_notification_receipts(network_id,notification_id,admin_id,read_at)
            SELECT n.network_id,n.id,?,NOW() FROM um_notifications n WHERE n.network_id=? AND (n.target_role IS NULL OR n.target_role='all' OR n.target_role=?) AND (n.target_admin_id IS NULL OR n.target_admin_id=?)
            ON DUPLICATE KEY UPDATE read_at=NOW(),deleted_at=NULL");$stmt->execute([$adminId,$networkId,$role ?: 'superadmin',$adminId]);return ['success'=>true];
    }
    public function deleteNotification($id, $adminId = 0, $role = '') {
        $adminId=(int)$adminId;if($adminId<=0)throw new DomainException('AUTH_REQUIRED');
        $networkId=$this->getActiveNetworkId();
        $stmt=$this->db->prepare("INSERT INTO um_notification_receipts(network_id,notification_id,admin_id,deleted_at)
            SELECT n.network_id,n.id,?,NOW() FROM um_notifications n WHERE n.network_id=? AND n.id=? AND (n.target_role IS NULL OR n.target_role='all' OR n.target_role=?) AND (n.target_admin_id IS NULL OR n.target_admin_id=?)
            ON DUPLICATE KEY UPDATE deleted_at=NOW()");$stmt->execute([$adminId,$networkId,(int)$id,$role ?: 'superadmin',$adminId]);
        if($stmt->rowCount()===0)throw new DomainException('FORBIDDEN_SCOPE');return ['success'=>true];
    }
    public function clearAllNotifications($adminId = 0, $role = '') {
        $adminId=(int)$adminId;if($adminId<=0)throw new DomainException('AUTH_REQUIRED');
        $networkId=$this->getActiveNetworkId();
        $stmt=$this->db->prepare("INSERT INTO um_notification_receipts(network_id,notification_id,admin_id,deleted_at)
            SELECT n.network_id,n.id,?,NOW() FROM um_notifications n WHERE n.network_id=? AND (n.target_role IS NULL OR n.target_role='all' OR n.target_role=?) AND (n.target_admin_id IS NULL OR n.target_admin_id=?)
            ON DUPLICATE KEY UPDATE deleted_at=NOW()");$stmt->execute([$adminId,$networkId,$role ?: 'superadmin',$adminId]);return ['success'=>true];
    }
    // ==========================================
    // METHOD: createNotification
    // ==========================================
    public function createNotification($category, $title, $message, $targetRole = null, $targetAdminId = null) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("
            INSERT INTO um_notifications (network_id,category, title, message, target_role, target_admin_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$networkId,$category, $title, $message, $targetRole, $targetAdminId]);
        return ['success' => true, 'notification_id' => $this->db->lastInsertId()];
    }
    // ==========================================
    // 12. ROLE-BASED MOBILE WORKSPACE DASHBOARD
    // ==========================================

    // ==========================================
    // METHOD: getMobileDashboardData
    // ==========================================
    public function getMobileDashboardData($adminId = 1, $role = 'superadmin') {
        $networkId=$this->getActiveNetworkId();
        $adminId = (int)$adminId;
        $role = trim($role);
        $data = ['role' => $role, 'timestamp' => time()];
        $notifRes = $this->getNotifications($adminId, $role);
        $data['unread_notifications'] = $notifRes['unread_count'] ?? 0;
        if (in_array((string)$role, ['system_owner', 'superadmin'], true)) {
            $data['active_sessions'] = (int)$this->db->query("SELECT COUNT(*) FROM radacct WHERE network_id=$networkId AND acctstoptime IS NULL AND username NOT REGEXP '^router_[0-9]+$'")->fetchColumn();
            $data['today_sales'] = round((float)$this->db->query("SELECT COALESCE(SUM(total_amount),0) FROM um_sales_invoices WHERE network_id=$networkId AND DATE(created_at)=CURDATE()")->fetchColumn(), 2);
            $data['total_routers'] = (int)$this->db->query("SELECT COUNT(*) FROM nas WHERE network_id=$networkId")->fetchColumn();
            $data['active_routers'] = (int)$this->db->query("SELECT COUNT(*) FROM radacct WHERE network_id=$networkId AND acctstoptime IS NULL AND username REGEXP '^router_[0-9]+$'")->fetchColumn();
        } elseif ($role === 'partner') {
            $data['total_sales'] = round((float)$this->db->query("SELECT COALESCE(SUM(total_amount),0) FROM um_sales_invoices WHERE network_id=$networkId")->fetchColumn(), 2);
            $data['partner_share_est'] = round($data['total_sales'] * 0.3, 2);
        } elseif ($role === 'main_node_owner' || $role === 'sub_node_owner') {
            $nodeStmt = $this->db->prepare("SELECT * FROM um_network_nodes WHERE network_id=? AND responsible_admin_id = ? LIMIT 1");
            $nodeStmt->execute([$networkId,$adminId]);
            $node = $nodeStmt->fetch();
            $data['node'] = $node;
            if ($node) {
                $p = $this->db->prepare("SELECT COUNT(*) FROM radacct WHERE network_id=? AND nasipaddress = ? AND nasportid = ? AND acctstoptime IS NULL");
                $p->execute([$networkId,$node['nas_ip'], $node['nas_port_id']]);
                $data['node_active_sessions'] = (int)$p->fetchColumn();
            }
            $data['free_vouchers'] = $this->getFreeVouchersList($adminId)['free_vouchers'] ?? [];
        } elseif ($role === 'distributor' || $role === 'pos_agent') {
            $balanceStmt = $this->db->prepare("SELECT balance,credit_limit FROM um_admin_network_balances WHERE network_id=? AND admin_id=?");
            $balanceStmt->execute([$networkId,$adminId]);
            $adm = $balanceStmt->fetch();
            $data['balance'] = (float)($adm['balance'] ?? 0);
            $data['credit_limit'] = (float)($adm['credit_limit'] ?? 0);
        } elseif ($role === 'maintenance') {
            $data['total_assets'] = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$networkId")->fetchColumn();
            $data['maintenance_assets'] = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$networkId AND status='maintenance'")->fetchColumn();
        }
        return ['success' => true, 'mobile_dashboard' => $data];
    }
    // ==========================================
    // MIKROTIK ROUTEROS API & NEIGHBORS DISCOVERY
    // ==========================================

    // ==========================================
    // METHOD: getNocDashboard
    // ==========================================
    public function getNocDashboard() {
        $networkId = $this->getActiveNetworkId();
        $routers = $this->db->query("SELECT * FROM nas WHERE network_id=$networkId ORDER BY id ASC")->fetchAll();
        $nocRouters = [];
        $totalOnline = 0;
        $totalBandwidth = 0;
        $latencies = [];

        // Fetch live SSTP sessions from accel-ppp
        $sstpStatus = $this->getSstpStatus();
        $sstpSessions = $sstpStatus['sessions'] ?? [];
        $activeSstpIps = [];
        $activeSstpUsers = [];
        foreach ($sstpSessions as $s) {
            if (($s['state'] ?? '') === 'active') {
                if (!empty($s['ip'])) $activeSstpIps[$s['ip']] = $s;
                if (!empty($s['username'])) $activeSstpUsers[$s['username']] = $s;
            }
        }

        // Fast single batch aggregation for all active users and bandwidth across all routers
        $radStatsStmt = $this->db->prepare("
            SELECT nasipaddress, COUNT(*) as active_users, COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) as total_traffic 
            FROM radacct 
            WHERE network_id = ? AND acctstoptime IS NULL AND username NOT REGEXP '^router_[0-9]+$' 
            GROUP BY nasipaddress
        ");
        $radStatsStmt->execute([$networkId]);
        $radStatsByNas = [];
        while ($row = $radStatsStmt->fetch(PDO::FETCH_ASSOC)) {
            $radStatsByNas[$row['nasipaddress']] = $row;
        }

        foreach ($routers as $r) {
            $ip = $r['nasname'];
            $routerUser = 'router_' . $r['id'];
            $vpnIp = '10.101.0.' . $r['id'];
            $hasSstp = isset($activeSstpIps[$ip]) || isset($activeSstpIps[$vpnIp]) || isset($activeSstpUsers[$routerUser]);
            
            $isOnline = false;
            $latency = null;

            if ($hasSstp) {
                $isOnline = true;
                // Active SSTP VPN tunnel - near-zero latency
                $latency = 2.5;
                $latencies[] = $latency;
            } else {
                // Non-blocking fast socket probe (150ms timeout)
                $checkIp = (filter_var($ip, FILTER_VALIDATE_IP) && $ip !== '127.0.0.1') ? $ip : $vpnIp;
                $apiPort = !empty($r['api_port']) ? (int)$r['api_port'] : 8728;
                
                $t0 = microtime(true);
                $fp = @fsockopen($checkIp, $apiPort, $errno, $errstr, 0.15);
                if ($fp) {
                    $isOnline = true;
                    $latency = round((microtime(true) - $t0) * 1000, 1);
                    $latencies[] = $latency;
                    fclose($fp);
                } else {
                    // Fallback to quick ping
                    $pingOut = shell_exec("ping -c 1 -W 1 " . escapeshellarg($checkIp) . " 2>&1");
                    if ($pingOut && (strpos($pingOut, '1 received') !== false || strpos($pingOut, '1 packets received') !== false)) {
                        $isOnline = true;
                        if (preg_match('/time=([\d\.]+)\s*ms/', $pingOut, $m)) {
                            $latency = (float)$m[1];
                            $latencies[] = $latency;
                        }
                    }
                }
            }

            // Get active users and bandwidth from our pre-aggregated radacct data
            $nasStats = $radStatsByNas[$ip] ?? ($radStatsByNas[$vpnIp] ?? null);
            $activeUsers = (int)($nasStats['active_users'] ?? 0);
            $traffic = (float)($nasStats['total_traffic'] ?? 0);

            $totalOnline += $activeUsers;
            $totalBandwidth += $traffic;

            $nocRouters[] = [
                'id' => $r['id'],
                'name' => $r['shortname'] ?: $r['nasname'],
                'shortname' => $r['shortname'] ?: $r['nasname'],
                'nasname' => $r['nasname'],
                'ip_address' => $r['nasname'],
                'is_up' => $isOnline,
                'is_online' => $isOnline,
                'latency' => $latency,
                'active_users' => $activeUsers,
                'hotspot_users' => $activeUsers,
                'total_traffic' => $traffic,
                'sstp_status' => $hasSstp ? '🟢 متصل (نشط)' : ($isOnline ? '🟡 متصل مباشر' : '🔴 غير متصل'),
                'has_sstp' => $hasSstp,
                'coa_port' => $r['ports'] ?: 3799,
                'api_port' => $r['api_port'] ?: 8722,
                'secret' => $r['secret'] ?: '123456'
            ];
        }

        $onlineCount = count(array_filter($nocRouters, fn($x) => $x['is_online']));
        $avgLat = !empty($latencies) ? round(array_sum($latencies) / count($latencies), 1) : '< 10';

        return [
            'success' => true,
            'total_routers' => count($routers),
            'online_routers' => $onlineCount,
            'total_online_users' => $totalOnline,
            'total_bandwidth' => $totalBandwidth,
            'summary' => [
                'total_routers' => count($routers),
                'online_count' => $onlineCount,
                'total_active_sessions' => $totalOnline,
                'avg_latency' => $avgLat,
                'total_bandwidth' => $totalBandwidth,
            ],
            'routers' => $nocRouters
        ];
    }
        // ==========================================
    // AUTOMATED BACKUP & EXPORT SYSTEM
    // ==========================================

    // ==========================================
    // METHOD: getAlertSettings
    // ==========================================
    public function getAlertSettings() {
        $keys = [
            'alert_exclude_free_cards',
            'alert_low_stock_enabled',
            'alert_low_stock_threshold',
            'alert_outage_enabled',
            'alert_credit_limit_enabled',
            'alert_credit_threshold_pct',
            'alert_payments_enabled',
            'alert_high_resource_enabled',
            'alert_cpu_threshold',
            'alert_sound_enabled'
        ];
        $res = [];
        foreach ($keys as $k) {
            $res[$k] = $this->getSettingValue($k, '1');
        }
        $res['alert_low_stock_threshold'] = (int)($res['alert_low_stock_threshold'] ?: 50);
        $res['alert_credit_threshold_pct'] = (int)($res['alert_credit_threshold_pct'] ?: 90);
        $res['alert_cpu_threshold'] = (int)($res['alert_cpu_threshold'] ?: 85);
        return ['success' => true, 'settings' => $res];
    }

    // ==========================================
    // METHOD: saveAlertSettings
    // ==========================================
    public function saveAlertSettings($data) {
        $allowed = [
            'alert_exclude_free_cards',
            'alert_low_stock_enabled',
            'alert_low_stock_threshold',
            'alert_outage_enabled',
            'alert_credit_limit_enabled',
            'alert_credit_threshold_pct',
            'alert_payments_enabled',
            'alert_high_resource_enabled',
            'alert_cpu_threshold',
            'alert_sound_enabled'
        ];
        foreach ($allowed as $k) {
            if (isset($data[$k])) {
                $this->setSettingValue($k, (string)$data[$k]);
            }
        }
        $this->logActivity('settings_update', 'system', 'تحديث إعدادات التنبيهات المركزية', $data, 'success');
        return ['success' => true, 'message' => 'تم حفظ إعدادات التنبيهات بنجاح'];
    }

    // ==========================================
    // METHOD: getSystemAlertsSummary
    // ==========================================
    public function getSystemAlertsSummary() {
        $settings = $this->getAlertSettings()['settings'];
        $alerts = [];
        // 1. Router & Link Outages
        if ($settings['alert_outage_enabled'] == '1') {
            try {
                $routers = $this->db->query("SELECT id, shortname, nasname, is_disabled FROM nas WHERE is_disabled = 0")->fetchAll();
                foreach ($routers as $r) {
                    $ip = $r['nasname'];
                    $pingRes = shell_exec("ping -c 1 -W 1 " . escapeshellarg($ip));
                    if (strpos($pingRes, '1 received') === false && strpos($pingRes, '1 packets received') === false) {
                        $alerts[] = [
                            'type' => 'outage',
                            'level' => 'danger',
                            'title' => "انقطاع اتصال الراوتر: {$r['shortname']}",
                            'message' => "الراوتر ({$r['shortname']} - {$ip}) لا يستجيب لـ Ping أو نفق SSTP متوقف",
                            'timestamp' => date('Y-m-d H:i:s'),
                            'link' => 'routers'
                        ];
                    }
                }
            } catch (Exception $e) {}
        }
        // 2. Credit Limit & Receivables
        if ($settings['alert_credit_limit_enabled'] == '1') {
            try {
                $pct = (float)($settings['alert_credit_threshold_pct'] ?: 90) / 100.0;
                $admins = $this->db->query("SELECT id, fullname, username, balance, credit_limit FROM um_admins WHERE credit_limit > 0 AND is_active = 1")->fetchAll();
                foreach ($admins as $adm) {
                    $bal = (float)$adm['balance'];
                    $lim = (float)$adm['credit_limit'];
                    if ($bal >= $lim) {
                        $alerts[] = [
                            'type' => 'credit_limit',
                            'level' => 'danger',
                            'title' => "تجاوز السقف الائتماني: {$adm['fullname']}",
                            'message' => "وصل رصيد المديونية إلى " . number_format($bal, 2) . " وتجاوز السقف المسموح (" . number_format($lim, 2) . ")",
                            'timestamp' => date('Y-m-d H:i:s'),
                            'link' => 'admins_agents'
                        ];
                    } elseif ($bal >= ($lim * $pct)) {
                        $alerts[] = [
                            'type' => 'credit_limit',
                            'level' => 'warning',
                            'title' => "اقتراب من سقف المديونية: {$adm['fullname']}",
                            'message' => "بلغت مديونية العميل " . number_format($bal, 2) . " (أكثر من " . round(($bal/$lim)*100) . "% من السقف)",
                            'timestamp' => date('Y-m-d H:i:s'),
                            'link' => 'admins_agents'
                        ];
                    }
                }
            } catch (Exception $e) {}
        }
        // 3. Paid Card Low Stock (Excluding Free)
        if ($settings['alert_low_stock_enabled'] == '1') {
            try {
                $lowStock = $this->getLowStockAlerts(1);
                foreach ($lowStock as $ls) {
                    $alerts[] = [
                        'type' => 'low_stock',
                        'level' => 'warning',
                        'title' => "نقص مخزون الكروت: " . ($ls['name_for_users'] ?: $ls['profile_name']),
                        'message' => "المتبقي في المخزن فقط ({$ls['unsold_cards']} كرت / {$ls['unsold_sheets']} ورقة)",
                        'timestamp' => date('Y-m-d H:i:s'),
                        'link' => 'batch_gen'
                    ];
                }
            } catch (Exception $e) {}
        }
        return [
            'success' => true,
            'total_alerts' => count($alerts),
            'danger_count' => count(array_filter($alerts, fn($a) => $a['level'] === 'danger')),
            'warning_count' => count(array_filter($alerts, fn($a) => $a['level'] === 'warning')),
            'alerts' => $alerts
        ];
    }
    // ==========================================
    // BACKUP RESTORE & DELETE (الاستعادة وإدارة النسخ)
    // ==========================================

    // ==========================================
    // ==========================================
    // METHOD: createNetworkBackup (النسخة المعزولة الخاصة بالشبكة الحالية فقط)
    // ==========================================
    public function createNetworkBackup(int $networkId) {
        $backupDir = '/var/backups/mikrotik-usermanager';
        if (!is_dir($backupDir)) @mkdir($backupDir, 0775, true);

        $stmtNet = $this->db->prepare("SELECT * FROM um_networks WHERE id = ?");
        $stmtNet->execute([$networkId]);
        $network = $stmtNet->fetch();
        if (!$network) {
            return ['success' => false, 'error' => "الشبكة المطلوبة [{$networkId}] غير موجودة"];
        }

        $netName = preg_replace('/[^\p{L}\p{N}_-]+/u', '_', trim($network['name'] ?: 'network_' . $networkId));
        $dateStr = date('Y-m-d_H-i-s');
        $filename = "network_{$networkId}_backup_{$netName}_{$dateStr}.sql.gz";
        $filepath = "{$backupDir}/{$filename}";

        $gz = gzopen($filepath, 'w9');
        if (!$gz) {
            return ['success' => false, 'error' => 'تعذر إنشاء ملف النسخة الاحتياطية للشبكة'];
        }

        $header = "-- ========================================================\n"
                . "-- SAM User Manager - Dedicated Network Backup\n"
                . "-- Network ID: {$networkId}\n"
                . "-- Network Name: {$network['name']}\n"
                . "-- Generated At: " . date('Y-m-d H:i:s') . "\n"
                . "-- System Version: 2.0\n"
                . "-- ========================================================\n\n"
                . "SET FOREIGN_KEY_CHECKS=0;\n"
                . "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n"
                . "SET NAMES utf8mb4;\n"
                . "START TRANSACTION;\n\n";
        gzwrite($gz, $header);

        // 1. Export um_networks definition for this network
        $netCols = array_keys($network);
        $escapedCols = array_map(fn($c) => "`$c`", $netCols);
        $values = array_map(function($v) {
            if ($v === null) return "NULL";
            return $this->db->quote((string)$v);
        }, array_values($network));
        $netSql = "-- Network Definition\n"
                . "INSERT INTO `um_networks` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $values) . ")\n"
                . "ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `slug` = VALUES(`slug`), `is_active` = VALUES(`is_active`);\n\n";
        gzwrite($gz, $netSql);

        // 2. Discover all tables having `network_id` column
        $tablesStmt = $this->db->query("SHOW TABLES");
        $allTables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

        $exportedTablesCount = 0;
        $totalRowsCount = 0;

        foreach ($allTables as $table) {
            try {
                $colStmt = $this->db->query("SHOW COLUMNS FROM `{$table}`");
                $cols = $colStmt->fetchAll(PDO::FETCH_COLUMN);
                if (!in_array('network_id', $cols, true)) {
                    continue;
                }

                $q = $this->db->prepare("SELECT * FROM `{$table}` WHERE `network_id` = ?");
                $q->execute([$networkId]);
                $rows = $q->fetchAll(PDO::FETCH_ASSOC);
                $rowCount = count($rows);

                if ($rowCount === 0) {
                    $delSql = "-- Table `{$table}` (0 rows)\n"
                            . "DELETE FROM `{$table}` WHERE `network_id` = {$networkId};\n\n";
                    gzwrite($gz, $delSql);
                    continue;
                }

                $exportedTablesCount++;
                $totalRowsCount += $rowCount;

                $tableHeader = "-- Table `{$table}` ({$rowCount} rows)\n"
                             . "DELETE FROM `{$table}` WHERE `network_id` = {$networkId};\n";
                gzwrite($gz, $tableHeader);

                $escapedTableCols = array_map(fn($c) => "`$c`", $cols);
                $colsClause = implode(', ', $escapedTableCols);

                $chunks = array_chunk($rows, 100);
                foreach ($chunks as $chunk) {
                    $valuesRows = [];
                    foreach ($chunk as $row) {
                        $rowVals = [];
                        foreach ($cols as $colName) {
                            $val = $row[$colName] ?? null;
                            if ($val === null) {
                                $rowVals[] = "NULL";
                            } else {
                                $rowVals[] = $this->db->quote((string)$val);
                            }
                        }
                        $valuesRows[] = "(" . implode(', ', $rowVals) . ")";
                    }
                    $insertSql = "INSERT INTO `{$table}` ({$colsClause}) VALUES\n" . implode(",\n", $valuesRows) . ";\n";
                    gzwrite($gz, $insertSql);
                }
                gzwrite($gz, "\n");
            } catch (Exception $e) {
                error_log("Network backup table error [{$table}]: " . $e->getMessage());
            }
        }

        $footer = "COMMIT;\n"
                . "SET FOREIGN_KEY_CHECKS=1;\n"
                . "-- ========================================================\n"
                . "-- End of Dedicated Network Backup [Network ID: {$networkId}]\n"
                . "-- ========================================================\n";
        gzwrite($gz, $footer);
        gzclose($gz);

        $filesize = filesize($filepath);
        $sizeMB = round($filesize / (1024 * 1024), 2);
        $sizeFormatted = $sizeMB >= 1 ? "{$sizeMB} MB" : round($filesize / 1024, 2) . " KB";

        $this->logActivity('backup_create', 'network', "نسخة احتياطية لشبكة {$network['name']}", "تم إنشاء نسخة احتياطية خاصة بشبكة {$network['name']} ({$sizeFormatted}, {$totalRowsCount} سجل)", 'success');

        // Auto send to Telegram if enabled
        try {
            require_once __DIR__ . '/TelegramService.php';
            require_once __DIR__ . '/CloudBackupService.php';
            $tg = new TelegramService($this->db);
            $settings = $tg->getSettings();
            if ($settings['enabled'] && !empty($settings['bot_token']) && !empty($settings['chat_id'])) {
                $msg = "🌐 <b>نسخة احتياطية معزولة لشبكة: {$network['name']}</b>\n"
                     . "📁 <b>الملف:</b> <code>{$filename}</code>\n"
                     . "📊 <b>الحجم:</b> {$sizeFormatted} (" . number_format($filesize) . " بايت)\n"
                     . "📋 <b>إجمالي السجلات:</b> " . number_format($totalRowsCount) . " سجل\n"
                     . "⏱️ <b>التاريخ:</b> " . date('Y-m-d h:i:s A');
                $tg->sendMessage($msg);
            }
        } catch (Exception $e) {}

        return [
            'success' => true,
            'type' => 'network',
            'network_id' => $networkId,
            'network_name' => $network['name'],
            'message' => "تم إنشاء النسخة الاحتياطية الخاصة بشبكة [{$network['name']}] بنجاح ({$sizeFormatted})",
            'filename' => $filename,
            'filesize' => $filesize,
            'size' => $sizeFormatted,
            'size_formatted' => $sizeFormatted,
            'tables_count' => $exportedTablesCount,
            'rows_count' => $totalRowsCount,
            'created_at' => date('Y-m-d H:i:s')
        ];
    }

    // ==========================================
    // METHOD: createDatabaseBackup (النسخة الشاملة لمالك النظام أو نسخة الشبكة حسب السياق)
    // ==========================================
    public function createDatabaseBackup(?int $targetNetworkId = null, bool $forceFull = false) {
        $ctx = $this->getActiveAdminContext();
        $callerRole = (string)($ctx['role'] ?? '');
        $isSystemOwner = !empty($_SESSION['system_owner_authenticated']) || $callerRole === 'system_owner' || (int)$ctx['id'] === 1;
        $networkId = $targetNetworkId !== null ? $targetNetworkId : (int)($ctx['active_network_id'] ?? 0);

        // If in a network context and not forced full by sovereign owner:
        if (!$forceFull && $networkId > 0) {
            return $this->createNetworkBackup($networkId);
        }

        // Full Sovereign Database Backup (كافة الشبكات والمنظومة الشاملة)
        if (!$isSystemOwner) {
            if ($networkId > 0) {
                return $this->createNetworkBackup($networkId);
            }
            throw new Exception('عذراً، النسخة الاحتياطية الشاملة لكافة الشبكات مخصصة لمالك المنظومة فقط');
        }

        $backupDir = '/var/backups/mikrotik-usermanager';
        if (!is_dir($backupDir)) @mkdir($backupDir, 0775, true);
        $dateStr = date('Y-m-d_H-i-s');
        $filename = "system_full_backup_{$dateStr}.sql.gz";
        $filepath = "{$backupDir}/{$filename}";

        $defaultsFile = tempnam(sys_get_temp_dir(), 'sam_db_');
        $errorFile = tempnam(sys_get_temp_dir(), 'sam_dump_');
        if ($defaultsFile === false || $errorFile === false) {
            return ['success' => false, 'error' => 'تعذر إنشاء ملفات العمل المؤقتة للنسخة الاحتياطية'];
        }
        $defaults = "[client]\n"
            . 'host=' . DB_HOST . "\n"
            . 'port=' . DB_PORT . "\n"
            . 'user=' . DB_USER . "\n"
            . 'password=' . str_replace(["\\", "\n", "\r"], ["\\\\", '', ''], DB_PASS) . "\n";
        file_put_contents($defaultsFile, $defaults, LOCK_EX);
        chmod($defaultsFile, 0600);
        $pipeline = 'mysqldump --defaults-extra-file=' . escapeshellarg($defaultsFile)
            . ' --single-transaction --quick --routines --triggers ' . escapeshellarg(DB_NAME)
            . ' 2>' . escapeshellarg($errorFile)
            . ' | gzip -c > ' . escapeshellarg($filepath);
        $cmdOutput = [];
        $exitCode = 1;
        exec('/bin/bash -o pipefail -c ' . escapeshellarg($pipeline), $cmdOutput, $exitCode);
        $dumpError = trim((string) @file_get_contents($errorFile));
        @unlink($defaultsFile);
        @unlink($errorFile);
        if ($exitCode !== 0 || !file_exists($filepath) || filesize($filepath) < 1000) {
            @unlink($filepath);
            error_log('Database full backup failed: ' . $dumpError);
            return ['success' => false, 'error' => 'فشل إنشاء ملف النسخة الاحتياطية الشاملة. تحقق من صلاحيات السيرفر والسجل'];
        }
        $filesize = filesize($filepath);
        $sizeMB = round($filesize / (1024 * 1024), 2);
        $sizeFormatted = $sizeMB >= 1 ? "{$sizeMB} MB" : round($filesize / 1024, 2) . " KB";
        $this->logActivity('backup_create', 'system', "إنشاء نسخة احتياطية شاملة: {$filename}", "تم إنشاء نسخة احتياطية شاملة لكافة الشبكات بحجم {$sizeFormatted}", 'success');
        
        // Auto send to Telegram if enabled
        try {
            require_once __DIR__ . '/TelegramService.php';
            require_once __DIR__ . '/CloudBackupService.php';
            $tg = new TelegramService($this->db);
            $settings = $tg->getSettings();
            if ($settings['enabled'] && !empty($settings['bot_token']) && !empty($settings['chat_id'])) {
                $msg = "👑 <b>نسخة احتياطية شاملة لكامل المنظومة (كافة الشبكات)</b>\n"
                     . "📁 <b>الملف:</b> <code>{$filename}</code>\n"
                     . "📊 <b>الحجم:</b> {$sizeFormatted} (" . number_format($filesize) . " بايت)\n"
                     . "⏱️ <b>التاريخ:</b> " . date('Y-m-d h:i:s A');
                $tg->sendMessage($msg);
            }
        } catch (Exception $e) {}

        return [
            'success' => true,
            'type' => 'full',
            'message' => "تم إنشاء النسخة الاحتياطية الشاملة لكامل المنظومة بنجاح ({$sizeFormatted})",
            'filename' => $filename,
            'filesize' => $filesize,
            'size' => $sizeFormatted,
            'size_formatted' => $sizeFormatted,
            'created_at' => date('Y-m-d H:i:s')
        ];
    }

    // ==========================================
    // METHOD: listBackups
    // ==========================================
    public function listBackups(?int $targetNetworkId = null) {
        $ctx = $this->getActiveAdminContext();
        $callerRole = (string)($ctx['role'] ?? '');
        $isSystemOwner = !empty($_SESSION['system_owner_authenticated']) || $callerRole === 'system_owner' || (int)$ctx['id'] === 1;
        $activeNetId = (int)($ctx['active_network_id'] ?? 0);
        $filterNetId = $targetNetworkId !== null ? $targetNetworkId : $activeNetId;

        $backupDir = '/var/backups/mikrotik-usermanager';
        $patternGz = glob("{$backupDir}/*.sql.gz") ?: [];
        $patternSql = glob("{$backupDir}/*.sql") ?: [];
        $files = array_unique(array_merge($patternGz, $patternSql));

        $nets = $this->db->query("SELECT id, name FROM um_networks")->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

        $list = [];
        foreach ($files as $f) {
            $bn = basename($f);
            $size = filesize($f);
            $sizeMB = round($size / (1024 * 1024), 2);
            $sizeFormatted = $sizeMB >= 1 ? "{$sizeMB} MB" : round($size / 1024, 2) . " KB";
            $created = date('Y-m-d H:i:s', filemtime($f));

            if (preg_match('/^network_(\d+)_backup_(.*?)_(\d{4}-\d{2}-\d{2}.*)\.sql(?:\.gz)?$/', $bn, $m)) {
                $netId = (int)$m[1];
                $netName = $nets[$netId] ?? ('شبكة #' . $netId);
                $type = 'network';
            } else {
                $netId = 0;
                $netName = 'المنظومة الشاملة (كافة الشبكات)';
                $type = 'full';
            }

            // If non-owner or filtering for specific network:
            if (!$isSystemOwner || ($filterNetId > 0 && empty($_GET['all_networks']))) {
                if ($type !== 'network' || $netId !== $filterNetId) {
                    continue;
                }
            }

            $list[] = [
                'filename' => $bn,
                'filesize' => $size,
                'size' => $sizeFormatted,
                'size_formatted' => $sizeFormatted,
                'created_at' => $created,
                'type' => $type,
                'network_id' => $netId,
                'network_name' => $netName,
                'is_full' => ($type === 'full')
            ];
        }

        usort($list, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        return [
            'success' => true,
            'active_network_id' => $filterNetId,
            'is_system_owner' => $isSystemOwner,
            'backups' => $list
        ];
    }

    // ==========================================
    // METHOD: restoreDatabaseBackup
    // ==========================================
    public function restoreDatabaseBackup($filename) {
        $filename = basename($filename);
        $backupDir = '/var/backups/mikrotik-usermanager';
        $filepath = "{$backupDir}/{$filename}";
        if (!file_exists($filepath) || filesize($filepath) < 50) {
            return ['success' => false, 'error' => 'ملف النسخة الاحتياطية غير موجود أو تالف'];
        }

        $ctx = $this->getActiveAdminContext();
        $callerRole = (string)($ctx['role'] ?? '');
        $isSystemOwner = !empty($_SESSION['system_owner_authenticated']) || $callerRole === 'system_owner' || (int)$ctx['id'] === 1;
        $activeNetId = (int)($ctx['active_network_id'] ?? 0);

        $isNetworkBackup = (bool)preg_match('/^network_(\d+)_backup_/', $filename, $m);
        $fileNetId = $isNetworkBackup ? (int)$m[1] : 0;

        if ($isNetworkBackup) {
            if (!$isSystemOwner && $fileNetId !== $activeNetId) {
                return ['success' => false, 'error' => 'غير مصرح باستعادة نسخة احتياطية تخص شبكة أخرى'];
            }

            $defaultsFile = tempnam(sys_get_temp_dir(), 'sam_db_');
            $errorFile = tempnam(sys_get_temp_dir(), 'sam_restore_');
            if ($defaultsFile === false || $errorFile === false) {
                return ['success' => false, 'error' => 'تعذر إنشاء ملفات العمل المؤقتة للاستعادة'];
            }
            $defaults = "[client]\n"
                . 'host=' . DB_HOST . "\n"
                . 'port=' . DB_PORT . "\n"
                . 'user=' . DB_USER . "\n"
                . 'password=' . str_replace(["\\", "\n", "\r"], ["\\\\", '', ''], DB_PASS) . "\n";
            file_put_contents($defaultsFile, $defaults, LOCK_EX);
            chmod($defaultsFile, 0600);

            $mysql = 'mysql --defaults-extra-file=' . escapeshellarg($defaultsFile) . ' ' . escapeshellarg(DB_NAME);
            if (substr($filename, -7) === '.sql.gz') {
                $pipeline = 'gzip -dc ' . escapeshellarg($filepath) . ' | ' . $mysql . ' 2>' . escapeshellarg($errorFile);
            } elseif (substr($filename, -4) === '.sql') {
                $pipeline = $mysql . ' < ' . escapeshellarg($filepath) . ' 2>' . escapeshellarg($errorFile);
            } else {
                @unlink($defaultsFile);
                @unlink($errorFile);
                return ['success' => false, 'error' => 'صيغة ملف النسخة الاحتياطية غير معتمدة'];
            }

            $cmdOutput = [];
            $exitCode = 1;
            exec('/bin/bash -o pipefail -c ' . escapeshellarg($pipeline), $cmdOutput, $exitCode);
            $restoreError = trim((string) @file_get_contents($errorFile));
            @unlink($defaultsFile);
            @unlink($errorFile);

            if ($exitCode !== 0) {
                error_log("Network {$fileNetId} restore failed: " . $restoreError);
                return ['success' => false, 'error' => 'فشلت استعادة بيانات الشبكة: ' . ($restoreError ?: 'خطأ في تنفيذ SQL')];
            }

            $this->logActivity('backup_restore', 'network', "استعادة نسخة شبكة #{$fileNetId}", "تمت استعادة بيانات الشبكة بنجاح من الملف {$filename}", 'success');
            return [
                'success' => true,
                'type' => 'network',
                'network_id' => $fileNetId,
                'message' => "تمت استعادة بيانات الشبكة بنجاح من النسخة [{$filename}] دون المساس بأي شبكة أخرى"
            ];
        }

        // Full System Backup Restore
        if (!$isSystemOwner) {
            return ['success' => false, 'error' => 'استعادة النسخة الاحتياطية الشاملة لكامل المنظومة مخصصة لمالك النظام فقط من البوابة السيادية (Port 8099)'];
        }

        $defaultsFile = tempnam(sys_get_temp_dir(), 'sam_db_');
        $errorFile = tempnam(sys_get_temp_dir(), 'sam_restore_');
        if ($defaultsFile === false || $errorFile === false) {
            return ['success' => false, 'error' => 'تعذر إنشاء ملفات العمل المؤقتة للاستعادة'];
        }
        $defaults = "[client]\n"
            . 'host=' . DB_HOST . "\n"
            . 'port=' . DB_PORT . "\n"
            . 'user=' . DB_USER . "\n"
            . 'password=' . str_replace(["\\", "\n", "\r"], ["\\\\", '', ''], DB_PASS) . "\n";
        file_put_contents($defaultsFile, $defaults, LOCK_EX);
        chmod($defaultsFile, 0600);
        $mysql = 'mysql --defaults-extra-file=' . escapeshellarg($defaultsFile) . ' ' . escapeshellarg(DB_NAME);
        if (substr($filename, -7) === '.sql.gz') {
            $pipeline = 'gzip -dc ' . escapeshellarg($filepath) . ' | ' . $mysql . ' 2>' . escapeshellarg($errorFile);
        } elseif (substr($filename, -4) === '.sql') {
            $pipeline = $mysql . ' < ' . escapeshellarg($filepath) . ' 2>' . escapeshellarg($errorFile);
        } else {
            @unlink($defaultsFile);
            @unlink($errorFile);
            return ['success' => false, 'error' => 'صيغة ملف النسخة الاحتياطية غير معتمدة'];
        }
        $cmdOutput = [];
        $exitCode = 1;
        exec('/bin/bash -o pipefail -c ' . escapeshellarg($pipeline), $cmdOutput, $exitCode);
        $restoreError = trim((string) @file_get_contents($errorFile));
        @unlink($defaultsFile);
        @unlink($errorFile);
        if ($exitCode !== 0) {
            error_log('Database full restore failed: ' . $restoreError);
            return ['success' => false, 'error' => 'فشلت استعادة قاعدة البيانات الكاملة. راجع سجل الخدمة'];
        }
        $this->logActivity('backup_restore', 'system', "استعادة نسخة احتياطية شاملة: {$filename}", "تمت استعادة كافة قواعد بيانات المنظومة من الملف {$filename} بنجاح", 'success');
        return [
            'success' => true,
            'type' => 'full',
            'message' => "تمت استعادة قاعدة البيانات الشاملة بنجاح من الملف {$filename}"
        ];
    }

    // ==========================================
    // METHOD: deleteBackupFile
    // ==========================================
    public function deleteBackupFile($filename) {
        $filename = basename($filename);
        $backupDir = '/var/backups/mikrotik-usermanager';
        $filepath = "{$backupDir}/{$filename}";
        if (!file_exists($filepath)) {
            return ['success' => false, 'error' => 'الملف المراد حذفه غير موجود'];
        }

        $ctx = $this->getActiveAdminContext();
        $callerRole = (string)($ctx['role'] ?? '');
        $isSystemOwner = !empty($_SESSION['system_owner_authenticated']) || $callerRole === 'system_owner' || (int)$ctx['id'] === 1;
        $activeNetId = (int)($ctx['active_network_id'] ?? 0);

        if (preg_match('/^network_(\d+)_backup_/', $filename, $m)) {
            $fileNetId = (int)$m[1];
            if (!$isSystemOwner && $fileNetId !== $activeNetId) {
                return ['success' => false, 'error' => 'غير مصرح بحذف نسخة احتياطية تخص شبكة أخرى'];
            }
        } else {
            if (!$isSystemOwner) {
                return ['success' => false, 'error' => 'حذف النسخة الاحتياطية الشاملة مخصص لمالك المنظومة فقط'];
            }
        }

        @unlink($filepath);
        $this->logActivity('backup_delete', 'system', "حذف نسخة احتياطية: {$filename}", "تم حذف الملف {$filename}", 'info');
        return [
            'success' => true,
            'message' => "تم حذف ملف النسخة الاحتياطية بنجاح"
        ];
    }
    // ==========================================
    // VOUCHER DETAILS & AUDIT LOGS (تفاصيل وسجل تدقيق السندات)
    // ==========================================


    // ==========================================
    // METHOD: getNotificationSettings
    // ==========================================
    public function getNotificationSettings() {
        return $this->getNotificationService()->getSettings();
    }

    // ==========================================
    // METHOD: saveNotificationSettings
    // ==========================================
    public function saveNotificationSettings($data) {
        $res = $this->getNotificationService()->saveSettings($data);
        if (!empty($res['success'])) {
            $this->logActivity('settings', 'notifications', 'تحديث إعدادات التنبيهات والرسائل', 'تم تحديث إعدادات رسائل واتساب وبوت تليجرام في المنظومة', 'success', 1);
        }
        return $res;
    }

    // ==========================================
    // METHOD: getWhatsAppQr
    // ==========================================
    public function getWhatsAppQr() {
        return $this->getNotificationService()->getWhatsAppService()->getQr();
    }

    // ==========================================
    // METHOD: getWhatsAppStatus
    // ==========================================
    public function getWhatsAppStatus() {
        return $this->getNotificationService()->getWhatsAppService()->getStatus();
    }

    // ==========================================
    // METHOD: logoutWhatsApp
    // ==========================================
    public function logoutWhatsApp() {
        return $this->getNotificationService()->getWhatsAppService()->logout();
    }

    // ==========================================
    // METHOD: sendCustomNotification
    // ==========================================
    public function sendCustomNotification($data) {
        $ctx = $this->getActiveAdminContext();
        return $this->getNotificationService()->sendCustomMessage($data, (int)$ctx['id']);
    }

    // ==========================================
    // METHOD: getNotificationLogs
    // ==========================================
    public function getNotificationLogs($filters = [], $page = 1, $limit = 50) {
        return $this->getNotificationService()->getLogs($filters, $page, $limit);
    }

    // ==========================================
    // METHOD: testWhatsAppMessage
    // ==========================================
    public function testWhatsAppMessage($phone, $message) {
        $ctx = $this->getActiveAdminContext();
        return $this->getNotificationService()->getWhatsAppService()->sendMessage($phone, $message, 'test_' . time(), (int)$ctx['id']);
    }

    // ==========================================
    // METHOD: getTelegramSettings
    // ==========================================
    public function getTelegramSettings() {
        require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/CloudBackupService.php';
        $tg = new TelegramService($this->db);
        return $tg->getSettings();
    }

    // ==========================================
    // METHOD: saveTelegramSettings
    // ==========================================
    public function saveTelegramSettings($data) {
        require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/CloudBackupService.php';
        $tg = new TelegramService($this->db);
        $res = $tg->saveSettings($data);
        if (!empty($res['success'])) {
            $this->logActivity('settings', 'telegram', 'تحديث إعدادات بوت تليجرام', 'تم تعديل وتحديث إعدادات وتنبيهات بوت تليجرام في النظام', 'success', 1);
        }
        return $res;
    }

    // ==========================================
    // METHOD: testTelegramAlert
    // ==========================================
    public function testTelegramAlert($customToken = null, $customChatId = null) {
        require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/CloudBackupService.php';
        $tg = new TelegramService($this->db);
        return $tg->testAlert($customToken, $customChatId);
    }
    // ==========================================
    // NOC & LIVE NETWORK MONITORING
    // ==========================================


    // ==========================================
    // METHOD: getChatbotSettings
    // ==========================================
    public function getChatbotSettings() {
        return $this->getChatbotService()->getSettings();
    }

    // ==========================================
    // METHOD: saveChatbotSettings
    // ==========================================
    public function saveChatbotSettings($data) {
        $res = $this->getChatbotService()->saveSettings($data);
        if (!empty($res['success'])) {
            $this->logActivity('settings', 'chatbot', 'تحديث إعدادات الرد الآلي والبوت الذكي', 'تم حفظ إعدادات الرد الآلي والبوت', 'success', 1);
        }
        return $res;
    }

    // ==========================================
    // METHOD: handleChatbotMessage
    // ==========================================
    public function handleChatbotMessage($message, $phone = '', $platform = 'whatsapp', $networkId = 0) {
        return $this->getChatbotService()->handleMessage($message, $phone, $platform, (int)$networkId);
    }

    public function getChatbotRules() {
        return $this->getChatbotService()->getCustomRules();
    }

    public function saveChatbotRule($data) {
        $res = $this->getChatbotService()->saveCustomRule($data);
        if (!empty($res['success'])) {
            $this->logActivity('settings', 'chatbot', 'تحديث قواعد الرد الآلي', 'تم حفظ قاعدة رد آلي: ' . ($data['trigger_keyword'] ?? ''), 'success', 1);
        }
        return $res;
    }

    public function deleteChatbotRule($id) {
        $res = $this->getChatbotService()->deleteCustomRule((int)$id);
        if (!empty($res['success'])) {
            $this->logActivity('settings', 'chatbot', 'حذف قاعدة رد آلي', 'تم حذف قاعدة الرد الآلي رقم: ' . $id, 'success', 1);
        }
        return $res;
    }

    public function toggleChatbotRule($id, $isActive) {
        return $this->getChatbotService()->toggleCustomRule((int)$id, (bool)$isActive);
    }

    public function dispatchQueueNow() {
        require_once __DIR__ . '/MessageQueueManager.php';
        require_once __DIR__ . '/WhatsAppService.php';
        $qm = new MessageQueueManager($this->db);
        $ws = new WhatsAppService($this->db);
        $cnt = $qm->dispatchApprovedQueue($ws, 100);
        return ['success' => true, 'dispatched' => $cnt, 'message' => "تم إرسال {$cnt} رسالة من طابور الانتظار بنجاح!"];
    }

    public function approveAllQueue() {
        require_once __DIR__ . '/MessageQueueManager.php';
        require_once __DIR__ . '/WhatsAppService.php';
        $qm = new MessageQueueManager($this->db);
        $approved = $qm->approveAllPending();
        $ws = new WhatsAppService($this->db);
        $dispatched = $qm->dispatchApprovedQueue($ws, 100);
        return ['success' => true, 'approved' => $approved, 'dispatched' => $dispatched, 'message' => "تم اعتماد {$approved} رسالة وإرسال {$dispatched} رسالة بنجاح!"];
    }


    // ==========================================
    // METHOD: getNotificationStats
    // ==========================================
    public function getNotificationStats() {
        return $this->getNotificationService()->getNotificationStats();
    }

    // ==========================================
    // METHOD: resendNotificationLog
    // ==========================================
    public function resendNotificationLog($logId) {
        $ctx = $this->getActiveAdminContext();
        return $this->getNotificationService()->resendNotificationLog((int)$logId, (int)$ctx['id']);
    }

    // ==========================================
    // METHOD: cleanupStaleSessions (تنظيف الجلسات المعلقة)
    // ==========================================
    public function cleanupStaleSessions(?int $timeoutSeconds = 86400, ?int $networkId = null) {
        $timeout = $timeoutSeconds ?: 86400; // default 24h
        $params = [(int)$timeout];
        $netWhere = "";
        if ($networkId !== null && $networkId > 0) {
            $netWhere = " AND network_id = ?";
            $params[] = (int)$networkId;
        }

        // Close stale sessions that have no acctstoptime and acctstarttime is older than timeout
        $sql = "UPDATE radacct 
                   SET acctstoptime = NOW(),
                       acctterminatecause = 'Admin-Reset-Stale'
                 WHERE acctstoptime IS NULL 
                   AND acctstarttime < NOW() - INTERVAL ? SECOND
                   $netWhere";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $closedCount = $stmt->rowCount();

        // Close duplicate/older ghost sessions for the same user where a newer session exists
        try {
            $dupParams = [];
            $dupNetWhere = "";
            if ($networkId !== null && $networkId > 0) {
                $dupNetWhere = " WHERE network_id = ?";
                $dupParams[] = (int)$networkId;
                $dupParams[] = (int)$networkId;
            }
            $dupSql = "UPDATE radacct r1 
                       JOIN (
                           SELECT username, network_id, MAX(radacctid) AS max_id 
                           FROM radacct 
                           $dupNetWhere
                           WHERE acctstoptime IS NULL 
                           GROUP BY username, network_id
                       ) r2 ON r1.username = r2.username AND r1.network_id = r2.network_id 
                       SET r1.acctstoptime = COALESCE(r1.acctupdatetime, DATE_ADD(r1.acctstarttime, INTERVAL r1.acctsessiontime SECOND), NOW()),
                           r1.acctterminatecause = 'Replaced-By-New-Session' 
                       WHERE r1.acctstoptime IS NULL AND r1.radacctid < r2.max_id" . ($networkId ? " AND r1.network_id = ?" : "");
            $stmtDup = $this->db->prepare($dupSql);
            $stmtDup->execute($dupParams);
            $closedCount += $stmtDup->rowCount();
        } catch (Throwable $e) {}

        if ($closedCount > 0) {
            $this->logActivity('session_cleanup', 'system', 'تنظيف الجلسات العالقة', "تم إغلاق {$closedCount} جلسة RADIUS معلقة تلقائياً", 'success');
        }

        return [
            'success' => true,
            'closed_count' => $closedCount,
            'message' => "تم إغلاق {$closedCount} جلسة معلقة بنجاح"
        ];
    }

    // ==========================================
    // METHOD: checkServicesHealth (فحص ومراقبة صحة الخادم والخدمات)
    // ==========================================
    public function checkServicesHealth() {
        $services = [
            'freeradius' => ['name' => 'خادم RADIUS', 'unit' => 'freeradius'],
            'apache2' => ['name' => 'خادم الويب Apache', 'unit' => 'apache2'],
            'mysql' => ['name' => 'قاعدة البيانات MySQL', 'unit' => 'mysql'],
            'sam-whatsapp' => ['name' => 'خادم واتساب Web', 'unit' => 'sam-whatsapp']
        ];

        $results = [];
        $hasErrors = false;

        foreach ($services as $key => $s) {
            $out = [];
            $code = 1;
            exec("systemctl is-active " . escapeshellarg($s['unit']) . " 2>&1", $out, $code);
            $status = trim(implode('', $out));
            $isActive = ($status === 'active');
            if (!$isActive) $hasErrors = true;

            $results[$key] = [
                'name' => $s['name'],
                'unit' => $s['unit'],
                'status' => $status,
                'active' => $isActive
            ];
        }

        // Disk space check
        $diskFree = @disk_free_space('/');
        $diskTotal = @disk_total_space('/');
        $diskUsedPercent = ($diskTotal > 0) ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1) : 0;
        $diskHealthy = $diskUsedPercent < 90;

        // Memory check
        $memFree = 0; $memTotal = 0;
        if (is_readable('/proc/meminfo')) {
            $meminfo = @file_get_contents('/proc/meminfo');
            if ($meminfo) {
                if (preg_match('/MemTotal:\s+(\d+)/', $meminfo, $m1)) $memTotal = (int)$m1[1];
                if (preg_match('/MemAvailable:\s+(\d+)/', $meminfo, $m2)) $memFree = (int)$m2[1];
            }
        }
        $memUsedPercent = ($memTotal > 0) ? round((($memTotal - $memFree) / $memTotal) * 100, 1) : 0;

        $report = [
            'success' => true,
            'is_healthy' => !$hasErrors && $diskHealthy,
            'services' => $results,
            'disk' => [
                'total_gb' => round($diskTotal / (1024*1024*1024), 2),
                'free_gb' => round($diskFree / (1024*1024*1024), 2),
                'used_percent' => $diskUsedPercent,
                'healthy' => $diskHealthy
            ],
            'memory' => [
                'total_mb' => round($memTotal / 1024, 1),
                'free_mb' => round($memFree / 1024, 1),
                'used_percent' => $memUsedPercent
            ],
            'checked_at' => date('Y-m-d H:i:s')
        ];

        return $report;
    }

    // ==========================================
    // METHOD: getRoamingUsageSummary (تقرير مقاصة التجوال بين الشبكات)
    // ==========================================
    public function getRoamingUsageSummary(?string $from = null, ?string $to = null, ?int $networkId = null) {
        $where = ["vm.network_id != ra.network_id"];
        $params = [];

        if ($networkId !== null && $networkId > 0) {
            $where[] = "(vm.network_id = :net1 OR ra.network_id = :net2)";
            $params[':net1'] = $networkId;
            $params[':net2'] = $networkId;
        }

        if ($from) {
            $where[] = "ra.acctstarttime >= :from_date";
            $params[':from_date'] = $from . ' 00:00:00';
        }
        if ($to) {
            $where[] = "ra.acctstarttime <= :to_date";
            $params[':to_date'] = $to . ' 23:59:59';
        }

        $whereClause = implode(' AND ', $where);

        $sql = "SELECT 
                    vm.network_id AS home_network_id,
                    n_home.name AS home_network_name,
                    ra.network_id AS visited_network_id,
                    n_vis.name AS visited_network_name,
                    COUNT(ra.radacctid) AS total_sessions,
                    COUNT(DISTINCT ra.username) AS unique_users,
                    SUM(COALESCE(ra.acctsessiontime, 0)) AS total_seconds,
                    SUM(COALESCE(ra.acctinputoctets, 0) + COALESCE(ra.acctoutputoctets, 0)) AS total_bytes,
                    SUM(COALESCE(vm.price, 0)) AS total_voucher_value
                FROM radacct ra
                JOIN um_vouchers_meta vm ON vm.username = ra.username
                LEFT JOIN um_networks n_home ON n_home.id = vm.network_id
                LEFT JOIN um_networks n_vis ON n_vis.id = ra.network_id
                WHERE {$whereClause}
                GROUP BY vm.network_id, ra.network_id
                ORDER BY total_sessions DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$r) {
            $bytes = (float)($r['total_bytes'] ?? 0);
            $gb = round($bytes / (1024 * 1024 * 1024), 2);
            $mb = round($bytes / (1024 * 1024), 2);
            $r['data_formatted'] = $gb >= 1 ? "{$gb} GB" : "{$mb} MB";
            $hours = round((float)($r['total_seconds'] ?? 0) / 3600, 1);
            $r['time_formatted'] = "{$hours} ساعة";
        }

        return [
            'success' => true,
            'count' => count($rows),
            'roaming_pairs' => $rows
        ];
    }

    // ==========================================
    // METHOD: settleRoamingBalances (تسوية المقاصة المالية للتجوال بين شبكتين)
    // ==========================================
    public function settleRoamingBalances(int $sourceNetworkId, int $targetNetworkId, float $amount, ?string $notes = null) {
        if ($amount <= 0) {
            throw new InvalidArgumentException('مبلغ التسوية يجب أن يكون أكبر من الصفر');
        }

        $ctx = $this->getActiveAdminContext();
        $adminId = (int)$ctx['id'];

        $this->db->beginTransaction();
        try {
            $stmtN = $this->db->prepare("SELECT id, name FROM um_networks WHERE id IN (?, ?)");
            $stmtN->execute([$sourceNetworkId, $targetNetworkId]);
            $nets = $stmtN->fetchAll(PDO::FETCH_KEY_PAIR);

            $sourceName = $nets[$sourceNetworkId] ?? "شبكة #{$sourceNetworkId}";
            $targetName = $nets[$targetNetworkId] ?? "شبكة #{$targetNetworkId}";

            $ref = 'ROAM-SETTLE-' . date('Ymd-His');

            $this->logActivity('roaming_settle', 'financial', 'تسوية تجوال مالي بين الشبكات', "تسوية مبلغ " . number_format($amount, 2) . " بين [{$sourceName}] و [{$targetName}] - {$ref}", 'success', $adminId);

            $this->db->commit();
            return [
                'success' => true,
                'reference' => $ref,
                'amount' => $amount,
                'source_network' => $sourceName,
                'target_network' => $targetName,
                'message' => "تم تسجيل تسوية المقاصة بنجاح بمبلغ " . number_format($amount, 2)
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    private function syncAdminNetworkAssignments(int $adminId,array $networkIds,string $role,string $scope,float $creditLimit,int $grantedBy,bool $replace): void {
        $networkIds=array_values(array_unique(array_filter(array_map('intval',$networkIds),static fn($id)=>$id>0)));
        if(!$networkIds)throw new InvalidArgumentException('NETWORK_CONTEXT_REQUIRED');
        $validScope=in_array($scope,['all','own','children','assigned','delegated','network'],true)?$scope:'own';
        $this->db->beginTransaction();
        try{
            if($replace){
                $ph=implode(',',array_fill(0,count($networkIds),'?'));
                $this->db->prepare("UPDATE um_admin_network_access SET is_active=0,is_default=0 WHERE admin_id=? AND network_id NOT IN ($ph)")->execute(array_merge([$adminId],$networkIds));
                $this->db->prepare("UPDATE um_admin_network_roles SET is_active=0 WHERE admin_id=? AND network_id NOT IN ($ph)")->execute(array_merge([$adminId],$networkIds));
            }
            $access=$this->db->prepare("INSERT INTO um_admin_network_access(admin_id,network_id,access_level,is_default,is_active,granted_by_admin_id) VALUES(?,?,?,?,1,?) ON DUPLICATE KEY UPDATE access_level=VALUES(access_level),is_default=VALUES(is_default),is_active=1,granted_by_admin_id=VALUES(granted_by_admin_id)");
            $networkRole=$this->db->prepare("INSERT INTO um_admin_network_roles(admin_id,network_id,role_key,data_scope,is_active,assigned_by_admin_id) VALUES(?,?,?,?,1,?) ON DUPLICATE KEY UPDATE role_key=VALUES(role_key),data_scope=VALUES(data_scope),is_active=1,assigned_by_admin_id=VALUES(assigned_by_admin_id)");
            $balance=$this->db->prepare("INSERT INTO um_admin_network_balances(admin_id,network_id,balance,credit_limit,currency_code) VALUES(?,?,0,?,'YER_SANAA') ON DUPLICATE KEY UPDATE credit_limit=VALUES(credit_limit)");
            $defaultId=(int)$networkIds[0];
            foreach($networkIds as $networkId){
                $level=$role==='system_owner'?'owner':(in_array($role,['superadmin','partner','distributor'],true)?'manager':'operator');
                $access->execute([$adminId,$networkId,$level,$networkId===$defaultId?1:0,$grantedBy]);
                $networkRole->execute([$adminId,$networkId,$role,$validScope,$grantedBy]);
                $balance->execute([$adminId,$networkId,$creditLimit]);
            }
            $this->db->commit();
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

}
