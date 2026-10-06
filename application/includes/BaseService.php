<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/NotificationService.php';
require_once __DIR__ . '/FirebaseService.php';

/**
 * BaseService - Core Foundation for all Domain Services in SAM MikroTik Manager
 */
abstract class BaseService {
    protected PDO $db;
    protected ?RadiusService $radius = null;
    protected ?NotificationService $notificationService = null;
    protected ?FirebaseService $firebaseService = null;

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

    public function __construct(PDO $db, ?RadiusService $radius = null) {
        $this->db = $db;
        $this->radius = $radius;
    }

    public function getActiveNetworkId(bool $strict = false): int {
        $networkId = (int)(
            $_SERVER['HTTP_X_SAM_NETWORK_ID'] 
            ?? ($_REQUEST['network_id'] 
            ?? ($_GET['network_id'] 
            ?? ($_POST['network_id'] 
            ?? ($_SESSION['active_network_id'] 
            ?? ($_SESSION['network_id'] 
            ?? 0)))))
        );
        $adminId = (int)($_SESSION['admin_id'] ?? 0);
        if ($networkId <= 0) {
            if ($adminId > 0) {
                try {
                    $stmt = $this->db->prepare('SELECT network_id FROM um_admin_network_access WHERE admin_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY is_default DESC,network_id LIMIT 1');
                    $stmt->execute([$adminId]);
                    $networkId = (int)$stmt->fetchColumn();
                } catch (Throwable $e) {}
            }
        }
        if ($networkId <= 0) {
            try {
                $stmt = $this->db->query("SELECT id FROM um_networks WHERE status='active' ORDER BY id ASC LIMIT 1");
                $networkId = (int)$stmt->fetchColumn();
                if ($networkId <= 0) {
                    $stmt2 = $this->db->query('SELECT id FROM um_networks ORDER BY id ASC LIMIT 1');
                    $networkId = (int)$stmt2->fetchColumn();
                }
            } catch (Throwable $e) {}
            if ($networkId <= 0) {
                $networkId = 1;
            }
        }
        if ($networkId <= 0 && $strict) {
            throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        }
        if ($adminId > 0 && $strict) {
            $adminRole = $_SESSION['admin_role'] ?? '';
            $isSuper = in_array($adminRole, ['system_owner', 'superadmin'], true);
            if (!$isSuper) {
                $stmt = $this->db->prepare('SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW())');
                $stmt->execute([$adminId, $networkId]);
                if (!(bool)$stmt->fetchColumn()) throw new DomainException('FORBIDDEN_NETWORK');
            }
        }
        try {
            $this->db->exec('SET @sam_active_network_id = ' . $networkId);
        } catch (Throwable $e) {}
        return $networkId;
    }

    public function getFirebaseService(): FirebaseService {
        if (!$this->firebaseService) {
            $this->firebaseService = new FirebaseService($this->db);
        }
        return $this->firebaseService;
    }

    public function getNotificationService(): NotificationService {
        if (!$this->notificationService) {
            $this->notificationService = new NotificationService($this->db);
        }
        return $this->notificationService;
    }

    public function getVoucherService(): VoucherService {
        if ($this->radius !== null) {
            return $this->radius->getVoucherService();
        }
        require_once __DIR__ . '/VoucherService.php';
        return new VoucherService($this->db, $this->radius);
    }

    public function getAdminById($adminId, ?int $networkId = null) {
        if ($networkId === null || $networkId <= 0) {
            $networkId = $this->getActiveNetworkId();
        }
        $stmt = $this->db->prepare("SELECT a.*,
                    COALESCE(nr.role_key,a.role) AS role,
                    COALESCE(nr.data_scope,a.data_scope) AS data_scope,
                    COALESCE(nb.balance,0) AS balance,
                    COALESCE(nb.credit_limit,a.credit_limit,0) AS credit_limit,
                    nb.currency_code AS network_currency_code
                FROM um_admins a
                INNER JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1
                    AND (nx.starts_at IS NULL OR nx.starts_at<=NOW()) AND (nx.expires_at IS NULL OR nx.expires_at>NOW())
                LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1
                LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=nx.network_id
                WHERE a.id=? LIMIT 1");
        $stmt->execute([$networkId,(int)$adminId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return $row;
        }

        // Fallback: check directly in um_admins
        $stmt2 = $this->db->prepare("SELECT a.*, a.role AS role, a.data_scope AS data_scope, 0 AS balance, COALESCE(a.credit_limit,0) AS credit_limit FROM um_admins a WHERE a.id=? LIMIT 1");
        $stmt2->execute([(int)$adminId]);
        return $stmt2->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function getActiveAdminContext(?int $adminId = null) {
        if ($adminId === null) {
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
        }
        $networkId = $this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT a.id, a.username, a.fullname,
                    COALESCE(nr.role_key, a.role) AS role,
                    a.parent_id, COALESCE(nr.data_scope, a.data_scope) AS data_scope,
                    a.delegated_admin_ids, a.allowed_networks, a.credit_limit,
                    a.discount_rate, a.permissions, a.is_active
                FROM um_admins a
                INNER JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1
                LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1
                WHERE a.id = ? LIMIT 1");
        $stmt->execute([$networkId, $networkId, $adminId]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($admin) {
            $admin['delegated_admin_ids'] = json_decode($admin['delegated_admin_ids'] ?: '[]', true) ?: [];
            $admin['allowed_networks'] = json_decode($admin['allowed_networks'] ?: '[]', true) ?: [];
            $admin['permissions'] = json_decode($admin['permissions'] ?: '[]', true) ?: [];
            $admin['active_network_id'] = $networkId;
        }
        return $admin;
    }

    public function checkPermission(string|array $requiredPerm, ?int $adminId = null): bool {
        if ($adminId === null) {
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
        }
        $admin = $this->getActiveAdminContext($adminId);
        if (!$admin || empty($admin['is_active'])) {
            return false;
        }
        if (in_array((string)$admin['role'], ['system_owner', 'superadmin'], true)) {
            return true;
        }
        $roleStmt = $this->db->prepare("SELECT permissions FROM um_roles_def WHERE role_key = ? LIMIT 1");
        $roleStmt->execute([$admin['role']]);
        $rolePerms = json_decode($roleStmt->fetchColumn() ?: '[]', true) ?: [];
        $userPerms = is_array($admin['permissions']) ? $admin['permissions'] : (json_decode($admin['permissions'] ?: '[]', true) ?: []);
        $allPerms = array_unique(array_merge($rolePerms, $userPerms));
        $reqs = is_array($requiredPerm) ? $requiredPerm : [$requiredPerm];
        foreach ($reqs as $p) {
            if (in_array($p, $allPerms, true) || in_array('*', $allPerms, true)) {
                return true;
            }
        }
        return false;
    }

    public function isSystemOwner(?int $adminId = null): bool {
        if ($adminId === null) {
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
        }
        if ($adminId === 1) {
            return true;
        }
        try {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM um_system_owners WHERE admin_id = ?");
            $stmt->execute([$adminId]);
            return (bool)$stmt->fetchColumn();
        } catch (Throwable $e) {
            return $adminId === 1;
        }
    }

    public function enforceOwnerOnly(string $actionName = 'هذه العملية الحساسة', ?int $adminId = null): void {
        if (!$this->isSystemOwner($adminId)) {
            throw new Exception("🔒 عذراً، عملية $actionName مقفلة ومحصورة بحساب مالك النظام فقط (System Owner).");
        }
    }

    public function enforcePermission(string|array $requiredPerm, string $actionName = 'هذه العملية', ?int $adminId = null): void {
        if (!$this->checkPermission($requiredPerm, $adminId)) {
            $pStr = is_array($requiredPerm) ? implode('/', $requiredPerm) : (string)$requiredPerm;
            $msg = !empty($actionName) ? "غير مصرح لك بتنفيذ هذه العملية ($actionName)." : "غير مصرح لك بتنفيذ هذه العملية (الصلاحية المطلوبة: $pStr).";
            throw new Exception($msg);
        }
    }

    public function logActivity($action, $category, $title, $details = '', $status = 'success', $adminId = null, $ip = null, ?int $networkId = null) {
        try {
            $ipAddr = $ip ?: ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
            $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? 'Web/System', 0, 255);
            $aid = $adminId ?: ($_SESSION['admin_id'] ?? null);
            $adminName = 'System';
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
                    $st = $this->db->prepare("SELECT fullname, username FROM um_admins WHERE id = ? LIMIT 1");
                    $st->execute([(int)$aid]);
                    $admRow = $st->fetch(PDO::FETCH_ASSOC);
                    if ($admRow) {
                        $adminName = $admRow['fullname'] ?: $admRow['username'];
                    }
                } catch (Throwable $e) {}
            }
            if ($netId <= 0) $netId = 1;
            $detailsStr = is_array($details) ? json_encode($details, JSON_UNESCAPED_UNICODE) : (string)$details;
            $stmt = $this->db->prepare("
                INSERT INTO um_activity_logs (network_id, admin_id, admin_name, action_type, action_category, action_title, details, ip_address, user_agent, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$netId, $aid, $adminName, (string)$action, (string)$category, (string)$title, $detailsStr, $ipAddr, $ua, (string)$status]);
        } catch (Throwable $e) {}
    }

    public function getSettingValue($key, $default = null) {
        try {
            $stmt = $this->db->prepare("SELECT setting_value FROM um_settings WHERE setting_key = ? LIMIT 1");
            $stmt->execute([$key]);
            $val = $stmt->fetchColumn();
            return $val !== false ? $val : $default;
        } catch (Throwable $e) {
            return $default;
        }
    }

    public function setSettingValue($key, $value) {
        try {
            $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
            return $stmt->execute([$key, (string)$value]);
        } catch (Throwable $e) {
            return false;
        }
    }

    public function tableExists($tableName) {
        try {
            $stmt = $this->db->prepare("SHOW TABLES LIKE ?");
            $stmt->execute([$tableName]);
            return (bool)$stmt->fetchColumn();
        } catch (Throwable $e) {
            return false;
        }
    }

    public function formatBytesHelper($bytes, $precision = 2) {
        $bytes = (float)$bytes;
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * (int)$pow));
        return round($bytes, $precision) . ' ' . $units[(int)$pow];
    }

    public function createDatabaseBackup() {
        if ($this->radius && method_exists($this->radius, 'createDatabaseBackup')) {
            return $this->radius->createDatabaseBackup();
        }
        if (!class_exists('RadiusService', false)) {
            require_once __DIR__ . '/RadiusService.php';
        }
        $rs = new RadiusService($this->db);
        return $rs->createDatabaseBackup();
    }

    public function decodeMikrotikPort(?string $port): string {
        if ($port === null || $port === '' || $port === '0' || $port === 'default') {
            return 'default';
        }
        $p = trim((string)$port);
        $p = preg_replace('/=3D28|=28/i', '(', $p);
        $p = preg_replace('/=3D29|=29/i', ')', $p);
        $p = str_ireplace('=3D', '=', $p);
        return trim($p);
    }

    public function canonicalPort(?string $port): string {
        $decoded = $this->decodeMikrotikPort($port);
        if ($decoded === 'default' || $decoded === '') {
            return 'default';
        }
        $clean = preg_replace('/[,_\-\s]+(out|in|lan|wan|trunk|vlan|main|sub)$/i', '', $decoded);
        return strtolower(str_replace(' ', '', $clean));
    }

    public function getPortCandidateVariations(string|array $ports): array {
        if (!is_array($ports)) {
            $ports = [$ports];
        }
        $candidates = [];
        foreach ($ports as $port) {
            if ($port === null || $port === '') continue;
            $port = trim((string)$port);
            if ($port === '' || $port === 'default' || $port === '0') {
                $candidates[] = '';
                $candidates[] = '0';
                $candidates[] = 'default';
                continue;
            }
            $candidates[] = $port;
            $dec = $this->decodeMikrotikPort($port);
            $candidates[] = $dec;
            $candidates[] = str_replace(['(', ')'], ['=3D28', '=3D29'], $port);
            $candidates[] = str_replace(['(', ')'], ['=28', '=29'], $port);
            $candidates[] = str_replace(['(', ')'], ['=3D28', '=3D29'], $dec);
            $candidates[] = str_replace(['(', ')'], ['=28', '=29'], $dec);
            
            $clean = preg_replace('/[,_\-\s]+(out|in|lan|wan|trunk|vlan|main|sub)$/i', '', $port);
            $candidates[] = $clean;
            $cleanDec = preg_replace('/[,_\-\s]+(out|in|lan|wan|trunk|vlan|main|sub)$/i', '', $dec);
            $candidates[] = $cleanDec;
            $candidates[] = str_replace(['(', ')'], ['=3D28', '=3D29'], $cleanDec);
            $candidates[] = str_replace(['(', ')'], ['=28', '=29'], $cleanDec);
        }
        return array_values(array_unique(array_filter($candidates, fn($v) => $v !== null && $v !== '')));
    }

    public function __call(string $name, array $arguments) {
        if ($this->radius !== null) {
            return $this->radius->__call($name, $arguments);
        }
        throw new BadMethodCallException("Method '$name' does not exist on " . get_class($this));
    }
}

