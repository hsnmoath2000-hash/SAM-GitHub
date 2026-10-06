<?php
declare(strict_types=1);

/**
 * Central authorization context for API and service layers.
 * Backward compatible with um_admins.permissions and um_roles_def.permissions.
 */
final class AuthorizationContext
{
    private PDO $db;
    private array $actor;
    private array $permissions;
    private ?array $scopeIds = null;
    private int $activeNetworkId = 0;

    public function __construct(PDO $db, array $actor)
    {
        $this->db = $db;
        $this->actor = $actor;
        $this->activeNetworkId = (int)($actor['active_network_id'] ?? 0);
        $this->permissions = $this->loadPermissions($actor);
        if ($this->activeNetworkId > 0) {
            $this->db->exec('SET @sam_active_network_id = ' . $this->activeNetworkId);
        }
    }

    public static function fromSession(PDO $db): self
    {
        $adminId = (int)($_SESSION['admin_id'] ?? 0);
        if ($adminId <= 0) {
            throw new DomainException('AUTH_REQUIRED');
        }
        return new self($db, self::loadActor($db, $adminId));
    }

    public static function loadActor(PDO $db, int $adminId, ?int $requestedNetworkId = null): array
    {
        $stmt = $db->prepare(
            'SELECT a.id AS admin_id, a.username, a.fullname, a.role, a.parent_id, a.account_id,
                    a.data_scope, a.allowed_networks, a.delegated_admin_ids, a.permissions,
                    a.credit_limit, a.balance, a.is_active
             FROM um_admins a
             WHERE a.id = ? LIMIT 1'
        );
        $stmt->execute([$adminId]);
        $actor = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$actor || !(int)$actor['is_active']) {
            throw new DomainException('ACCOUNT_DISABLED');
        }
        if ($requestedNetworkId === null) {
            $requestedNetworkId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_SESSION['active_network_id'] ?? 0));
        }
        $isSystemOwner = ($adminId === 1 || (string)($actor['role'] ?? '') === 'system_owner');

        $networkStmt = $db->prepare(
            'SELECT a.network_id,a.access_level,a.is_default,n.code,n.name
             FROM um_admin_network_access a
             JOIN um_networks n ON n.id=a.network_id AND n.status IN ("active", "trial", "pending_approval", "grace")
             WHERE a.admin_id=? AND a.is_active=1
               AND (a.starts_at IS NULL OR a.starts_at<=NOW())
               AND (a.expires_at IS NULL OR a.expires_at>NOW())
             ORDER BY a.is_default DESC,a.network_id'
        );
        $networkStmt->execute([$adminId]);
        $networkRows = $networkStmt->fetchAll(PDO::FETCH_ASSOC);

        if ($isSystemOwner) {
            $allNetsStmt = $db->query('SELECT id AS network_id, "full" AS access_level, (id=1) AS is_default, code, name FROM um_networks WHERE status IN ("active", "trial", "pending_approval", "grace") ORDER BY id ASC');
            $networkRows = $allNetsStmt ? $allNetsStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        }
        if (empty($networkRows)) {
            throw new DomainException('NETWORK_ACCESS_REQUIRED');
        }

        $allowedNetworkIds = array_map('intval', array_column($networkRows, 'network_id'));
        if ($requestedNetworkId <= 0) {
            $requestedNetworkId = (int)$networkRows[0]['network_id'];
        }
        if (!in_array($requestedNetworkId, $allowedNetworkIds, true)) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }

        $networkRoleStmt = $db->prepare(
            'SELECT nr.role_key,nr.data_scope,r.permissions AS role_permissions,r.default_data_scope
             FROM um_admin_network_roles nr
             JOIN um_roles_def r ON r.role_key=nr.role_key
             WHERE nr.admin_id=? AND nr.network_id=? AND nr.is_active=1 LIMIT 1'
        );
        $networkRoleStmt->execute([$adminId, $requestedNetworkId]);
        $networkRole = $networkRoleStmt->fetch(PDO::FETCH_ASSOC);
        if (!$networkRole) {
            $fallbackRole = $db->prepare('SELECT role_key,permissions AS role_permissions,default_data_scope FROM um_roles_def WHERE role_key=? LIMIT 1');
            $fallbackRole->execute([(string)$actor['role']]);
            $networkRole = $fallbackRole->fetch(PDO::FETCH_ASSOC) ?: [];
            $networkRole['data_scope'] = $actor['data_scope'] ?? ($networkRole['default_data_scope'] ?? 'own');
        }
        $actor['base_role'] = $actor['role'];
        $actor['role'] = (string)($networkRole['role_key'] ?? $actor['role']);
        $actor['data_scope'] = (string)($networkRole['data_scope'] ?? $actor['data_scope'] ?? 'own');
        $actor['role_permissions'] = $networkRole['role_permissions'] ?? '[]';
        $actor['default_data_scope'] = $networkRole['default_data_scope'] ?? 'own';
        $actor['active_network_id'] = $requestedNetworkId;
        $actor['allowed_network_ids'] = $allowedNetworkIds;
        $actor['networks'] = $networkRows;
        foreach ($networkRows as $networkRow) {
            if ((int)$networkRow['network_id'] === $requestedNetworkId) {
                $actor['active_network'] = $networkRow;
                break;
            }
        }

        $actor['effective_permissions'] = self::decodeList($actor['role_permissions'] ?? null);
        $actor['effective_permissions'] = array_values(array_unique(array_merge(
            $actor['effective_permissions'], self::decodeList($actor['permissions'] ?? null)
        )));
        $actor['delegated_admin_ids'] = self::decodeIntList($actor['delegated_admin_ids'] ?? null);
        return $actor;
    }

    public function actor(): array { return $this->actor; }
    public function id(): int { return (int)($this->actor['admin_id'] ?? $this->actor['id'] ?? 0); }
    public function role(): string { return (string)($this->actor['role'] ?? ''); }
    public function activeNetworkId(): int { return $this->activeNetworkId; }
    public function networkId(): int { return $this->activeNetworkId; }
    public function activeNetwork(): array { return (array)($this->actor['active_network'] ?? []); }
    public function scope(): string
    {
        $scope = (string)($this->actor['data_scope'] ?? $this->actor['default_data_scope'] ?? 'own');
        return in_array($scope, ['all', 'own', 'children', 'assigned', 'delegated', 'network'], true) ? $scope : 'own';
    }

    public function can(string|array $required): bool
    {
        $required = is_array($required) ? $required : [$required];
        if (in_array('*', $this->permissions, true)) return true;
        foreach ($required as $permission) {
            if (in_array((string)$permission, $this->permissions, true)) return true;
        }
        return false;
    }

    public function assertCan(string|array $required, string $message = 'FORBIDDEN'): void
    {
        if (!$this->can($required)) {
            $this->audit($required, 'deny', null, null, 'permission_missing');
            throw new DomainException($message);
        }
    }

    public function ownsAdmin(int $adminId): bool
    {
        return $adminId === $this->id() || in_array($adminId, $this->scopeAdminIds(), true);
    }

    public function canAccessAdmin(int $adminId): bool
    {
        if ($adminId <= 0 || !$this->adminBelongsToActiveNetwork($adminId)) return false;
        if (in_array($this->role(), ['system_owner', 'superadmin'], true) || $this->scope() === 'all') return true;
        return $this->ownsAdmin($adminId);
    }

    public function scopeAdminIds(): array
    {
        if ($this->scopeIds !== null) return $this->scopeIds;
        if ($this->isGlobal()) return $this->scopeIds = $this->allAdminIds();

        $ids = [$this->id()];
        $scope = $this->scope();
        $hasChildrenPermission = false;
        foreach ($this->permissions as $permission) {
            if (str_ends_with((string)$permission, '.children')) {
                $hasChildrenPermission = true;
                break;
            }
        }

        $includeChildren = in_array($scope, ['children', 'assigned'], true) || $hasChildrenPermission;
        $includeDelegated = in_array($scope, ['children', 'assigned', 'delegated'], true) || $hasChildrenPermission;
        $queue = [];
        if ($includeDelegated) {
            $queue = array_merge($queue, self::decodeIntList($this->actor['delegated_admin_ids'] ?? null));
        }
        if ($includeChildren) {
            $queue = array_merge($queue, $this->childrenOf($this->id()));
        }
        $queue = array_values(array_unique(array_map('intval', $queue)));

        while ($queue) {
            $id = (int)array_shift($queue);
            if ($id <= 0 || in_array($id, $ids, true)) continue;
            $ids[] = $id;
            if ($includeChildren) {
                foreach ($this->childrenOf($id) as $child) {
                    if (!in_array($child, $ids, true)) $queue[] = $child;
                }
            }
        }
        return $this->scopeIds = array_values(array_unique($ids));
    }

    public function assertCanAccessAdmin(int $adminId): void
    {
        if (!$this->canAccessAdmin($adminId)) {
            $this->audit('admin.read', 'deny', 'admin', $adminId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function allowedAdminPlaceholders(string $column = 'admin_id'): array
    {
        $ids = $this->scopeAdminIds();
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        return [$column . ' IN (' . $placeholders . ')', $ids];
    }

    public function isGlobal(): bool
    {
        return in_array($this->role(), ['system_owner', 'superadmin'], true) || $this->scope() === 'all';
    }

    public function allowedNetworkIds(): array
    {
        return self::decodeIntList($this->actor['allowed_network_ids'] ?? null);
    }

    public function canAccessNetwork(int $networkId): bool
    {
        if ($networkId <= 0) return false;
        if ($this->isGlobal()) {
            return in_array($networkId, $this->allowedNetworkIds(), true) || in_array($this->role(), ['system_owner', 'superadmin'], true);
        }
        return $networkId === $this->activeNetworkId && in_array($networkId, $this->allowedNetworkIds(), true);
    }

    public function assertCanAccessNetwork(int $networkId): void
    {
        if (!$this->canAccessNetwork($networkId)) {
            $this->audit('network.read', 'deny', 'network', $networkId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function assertActiveNetwork(): void
    {
        if ($this->isGlobal()) return;
        if ($this->activeNetworkId <= 0 || !$this->canAccessNetwork($this->activeNetworkId)) {
            throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        }
    }

    public function assertRecordInActiveNetwork(string $table, int $id, string $idColumn = 'id'): void
    {
        $allowed = [
            'nas','radacct','um_assets','um_network_nodes','um_sales_invoices','um_stock_transfers',
            'um_vouchers_financial','um_financial_transactions','um_vouchers_meta','um_purchase_invoices',
            'um_balance_topup_requests','um_instant_balance_lots','um_journal_entries','um_chart_of_accounts'
        ];
        if (!in_array($table, $allowed, true) || !preg_match('/^[a-zA-Z0-9_]+$/', $idColumn)) {
            throw new InvalidArgumentException('INVALID_NETWORK_RESOURCE');
        }
        $stmt = $this->db->prepare("SELECT network_id FROM {$table} WHERE {$idColumn}=? LIMIT 1");
        $stmt->execute([$id]);
        $networkId = (int)$stmt->fetchColumn();
        if ($networkId <= 0 || !$this->canAccessNetwork($networkId)) {
            $this->audit('network.resource.read', 'deny', $table, $id, 'outside_active_network');
            throw new DomainException('FORBIDDEN_NETWORK');
        }
    }

    public function canAccessAsset(int $assetId): bool
    {
        if ($assetId <= 0) return false;
        if ($this->isGlobal()) return $this->recordNetworkMatches('um_assets', $assetId);
        $stmt = $this->db->prepare('SELECT assigned_to_user_id, created_by_admin_id, network_id FROM um_assets WHERE id = ? LIMIT 1');
        $stmt->execute([$assetId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !$this->canAccessNetwork((int)($row['network_id'] ?? 0))) return false;
        $allowedAdmins = $this->scopeAdminIds();
        if ((int)($row['assigned_to_user_id'] ?? 0) === $this->id()) return true;
        if (in_array((int)($row['assigned_to_user_id'] ?? 0), $allowedAdmins, true)) return true;
        if (in_array((int)($row['created_by_admin_id'] ?? 0), $allowedAdmins, true)) return true;
        return $this->canAccessNetwork((int)($row['network_id'] ?? 0));
    }

    public function assertCanAccessAsset(int $assetId): void
    {
        if (!$this->canAccessAsset($assetId)) {
            $this->audit('asset.read', 'deny', 'asset', $assetId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function canAccessRouter(int $routerId): bool
    {
        if ($routerId <= 0) return false;
        if ($this->isGlobal()) return $this->recordNetworkMatches('nas', $routerId);
        $stmt = $this->db->prepare(
            "SELECT COALESCE(n.network_id,a.network_id) AS network_id, a.assigned_to_user_id
             FROM nas n
             LEFT JOIN um_assets a ON a.nas_ip = n.nasname AND a.category = 'routers'
             WHERE n.id = ? LIMIT 1"
        );
        $stmt->execute([$routerId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !$this->canAccessNetwork((int)($row['network_id'] ?? 0))) return false;
        if ((int)($row['assigned_to_user_id'] ?? 0) === $this->id()) return true;
        if (in_array((int)($row['assigned_to_user_id'] ?? 0), $this->scopeAdminIds(), true)) return true;
        return $this->canAccessNetwork((int)($row['network_id'] ?? 0));
    }

    public function assertCanAccessRouter(int $routerId): void
    {
        if (!$this->canAccessRouter($routerId)) {
            $this->audit('router.read', 'deny', 'router', $routerId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function canAccessSaleInvoice(int $invoiceId): bool
    {
        if ($invoiceId <= 0) return false;
        if ($this->isGlobal()) return $this->recordNetworkMatches('um_sales_invoices', $invoiceId);
        $stmt = $this->db->prepare('SELECT seller_id, buyer_id, network_id FROM um_sales_invoices WHERE id = ? LIMIT 1');
        $stmt->execute([$invoiceId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !$this->canAccessNetwork((int)($row['network_id'] ?? 0))) return false;
        return $this->canAccessAdmin((int)($row['seller_id'] ?? 0))
            || $this->canAccessAdmin((int)($row['buyer_id'] ?? 0));
    }

    public function assertCanAccessSaleInvoice(int $invoiceId): void
    {
        if (!$this->canAccessSaleInvoice($invoiceId)) {
            $this->audit('sales.invoice.read', 'deny', 'sales_invoice', $invoiceId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function canAccessFinancialVoucher(int $voucherId): bool
    {
        if ($voucherId <= 0) return false;
        if ($this->isGlobal()) return $this->recordNetworkMatches('um_vouchers_financial', $voucherId);
        $stmt = $this->db->prepare('SELECT created_by, party_id, source_account_id, destination_account_id, network_id FROM um_vouchers_financial WHERE id = ? LIMIT 1');
        $stmt->execute([$voucherId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !$this->canAccessNetwork((int)($row['network_id'] ?? 0))) return false;
        if (in_array($this->role(), ['finance', 'accountant'], true) && $this->can('vouchers_fin')) return true;
        foreach (['created_by', 'party_id', 'source_account_id', 'destination_account_id'] as $column) {
            if ($this->canAccessAdmin((int)($row[$column] ?? 0))) return true;
        }
        return false;
    }

    public function assertCanAccessFinancialVoucher(int $voucherId): void
    {
        if (!$this->canAccessFinancialVoucher($voucherId)) {
            $this->audit('financial.voucher.read', 'deny', 'financial_voucher', $voucherId, 'outside_scope');
            throw new DomainException('FORBIDDEN_SCOPE');
        }
    }

    public function audit(string|array $permission, string $decision, ?string $resourceType = null, ?int $resourceId = null, ?string $reason = null): void
    {
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO um_authorization_audit
                 (admin_id, permission_key, decision, resource_type, resource_id, scope_key, reason, request_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $this->id(), is_array($permission) ? implode('|', $permission) : $permission,
                $decision, $resourceType, $resourceId, $this->scope(), $reason,
                $_SERVER['HTTP_X_REQUEST_ID'] ?? null
            ]);
        } catch (Throwable $e) {
            error_log('Authorization audit failed: ' . $e->getMessage());
        }
    }

    private function loadPermissions(array $actor): array
    {
        $legacy = self::decodeList($actor['effective_permissions'] ?? null);
        if (!$legacy) $legacy = array_merge(self::decodeList($actor['role_permissions'] ?? null), self::decodeList($actor['permissions'] ?? null));
        $normalized = [];
        try {
            $stmt = $this->db->prepare(
                'SELECT permission_key FROM um_role_permissions WHERE role_key = ? AND effect = "grant"
                 UNION SELECT permission_key FROM um_admin_permissions WHERE admin_id = ? AND effect = "grant"
                 ORDER BY permission_key'
            );
            $stmt->execute([$this->role(), $this->id()]);
            $normalized = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'permission_key');
            $deny = $this->db->prepare(
                'SELECT permission_key FROM um_role_permissions WHERE role_key = ? AND effect = "deny"
                 UNION SELECT permission_key FROM um_admin_permissions WHERE admin_id = ? AND effect = "deny"'
            );
            $deny->execute([$this->role(), $this->id()]);
            $denied = array_flip(array_column($deny->fetchAll(PDO::FETCH_ASSOC), 'permission_key'));
            $normalized = array_values(array_filter($normalized, static fn($p) => !isset($denied[$p])));
        } catch (Throwable $e) {
            // Migration may not have run yet; legacy JSON permissions remain usable.
        }
        return array_values(array_unique(array_merge($legacy, $normalized)));
    }

    private function childrenOf(int $parentId): array
    {
        $stmt = $this->db->prepare('SELECT a.id FROM um_admins a JOIN um_admin_network_access n ON n.admin_id=a.id AND n.network_id=? AND n.is_active=1 WHERE a.parent_id = ? AND a.is_active = 1');
        $stmt->execute([$this->activeNetworkId, $parentId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    private function allAdminIds(): array
    {
        $stmt = $this->db->prepare('SELECT a.id FROM um_admins a JOIN um_admin_network_access n ON n.admin_id=a.id AND n.network_id=? AND n.is_active=1 WHERE a.is_active = 1');
        $stmt->execute([$this->activeNetworkId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    private function adminBelongsToActiveNetwork(int $adminId): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1');
        $stmt->execute([$adminId, $this->activeNetworkId]);
        return (bool)$stmt->fetchColumn();
    }

    private function recordNetworkMatches(string $table, int $id): bool
    {
        $stmt = $this->db->prepare("SELECT network_id FROM {$table} WHERE id=? LIMIT 1");
        $stmt->execute([$id]);
        return $this->canAccessNetwork((int)$stmt->fetchColumn());
    }

    private static function decodeList(mixed $value): array
    {
        if (is_array($value)) return array_values(array_filter(array_map('strval', $value)));
        $decoded = json_decode((string)$value, true);
        return is_array($decoded) ? array_values(array_filter(array_map('strval', $decoded))) : [];
    }

    private static function decodeIntList(mixed $value): array
    {
        return array_values(array_filter(array_map('intval', self::decodeList($value)), static fn($id) => $id > 0));
    }
}
