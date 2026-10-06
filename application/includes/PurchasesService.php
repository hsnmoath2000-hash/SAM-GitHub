<?php
/**
 * PurchasesService — إدارة المشتريات والموردين والربط المحاسبي والأصول
 * SAM User Manager
 */

declare(strict_types=1);
require_once __DIR__ . '/FinancialPostingAccounts.php';
require_once __DIR__ . '/FinancialAccountingService.php';

class PurchasesService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->ensureSchema();
    }

    /**
     * Resolve the tenant selected by the authenticated request.  Purchase
     * invoices create assets and journal entries, so silently falling back to
     * network 1 would leak inventory and accounting data between networks.
     */
    private function activeNetworkId(): int
    {
        $context = $GLOBALS['sam_request_authorization_context'] ?? null;
        if (is_object($context) && method_exists($context, 'activeNetworkId')) {
            $id = (int)$context->activeNetworkId();
        } else {
            $id = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_SESSION['active_network_id'] ?? 0));
        }
        if ($id <= 0) {
            throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        }
        $this->db->exec('SET @sam_active_network_id=' . $id);
        return $id;
    }

    private function requestedNetworkId(array $data, int $activeNetworkId): int
    {
        $requested = (int)($data['network_id'] ?? 0);
        if ($requested > 0 && $requested !== $activeNetworkId) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        return $activeNetworkId;
    }

    private function ensureSchema(): void
    {
        try {
            $cols = $this->db->query("SHOW COLUMNS FROM um_purchase_invoices")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('currency_code', $cols, true)) {
                $this->db->exec("ALTER TABLE um_purchase_invoices ADD COLUMN currency_code VARCHAR(32) DEFAULT 'YER_SANAA' AFTER status");
            }
            if (!in_array('exchange_rate', $cols, true)) {
                $this->db->exec("ALTER TABLE um_purchase_invoices ADD COLUMN exchange_rate DECIMAL(12,4) DEFAULT 1.0000 AFTER currency_code");
            }
            if (!in_array('currency_total_amount', $cols, true)) {
                $this->db->exec("ALTER TABLE um_purchase_invoices ADD COLUMN currency_total_amount DECIMAL(15,2) DEFAULT NULL AFTER exchange_rate");
            }
            if (!in_array('currency_paid_amount', $cols, true)) {
                $this->db->exec("ALTER TABLE um_purchase_invoices ADD COLUMN currency_paid_amount DECIMAL(15,2) DEFAULT NULL AFTER currency_total_amount");
            }
            if (!in_array('currency_remaining_amount', $cols, true)) {
                $this->db->exec("ALTER TABLE um_purchase_invoices ADD COLUMN currency_remaining_amount DECIMAL(15,2) DEFAULT NULL AFTER currency_paid_amount");
            }
        } catch (Throwable $e) {
            // Ignore if tables or columns already exist
        }
    }

    // =========================================================================
    // 1. SUPPLIERS MANAGEMENT (إدارة الموردين)
    // =========================================================================

    public function getSuppliers(string $search = '', bool $activeOnly = false): array
    {
        $networkId = $this->activeNetworkId();
        $where = ['s.network_id = ?'];
        $params = [$networkId];

        if ($activeOnly) {
            $where[] = 's.is_active = 1';
        }
        if (!empty($search)) {
            $where[] = '(s.name LIKE ? OR s.supplier_code LIKE ? OR s.phone LIKE ?)';
            $term = '%' . trim($search) . '%';
            array_push($params, $term, $term, $term);
        }

        $sql = "
            SELECT 
                s.id,
                s.supplier_code,
                s.name,
                s.phone,
                s.whatsapp,
                s.address,
                s.tax_no,
                s.payable_account_id,
                s.is_active,
                s.notes,
                s.created_at,
                COALESCE(a.balance, 0) as current_balance,
                (SELECT COUNT(*) FROM um_purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.network_id = s.network_id) as total_invoices,
                COALESCE((SELECT SUM(pi.total_amount) FROM um_purchase_invoices pi WHERE pi.supplier_id = s.id AND pi.network_id = s.network_id AND pi.status = 'posted'), 0) as total_purchases
            FROM um_suppliers s
            LEFT JOIN um_chart_of_accounts a ON a.id = s.payable_account_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY s.id DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getSupplierById(int $id): ?array
    {
        $networkId = $this->activeNetworkId();
        $stmt = $this->db->prepare("
            SELECT s.*, COALESCE(a.balance, 0) as current_balance
            FROM um_suppliers s
            LEFT JOIN um_chart_of_accounts a ON a.id = s.payable_account_id
            WHERE s.id = ? AND s.network_id = ?
            LIMIT 1
        ");
        $stmt->execute([$id, $networkId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public function saveSupplier(array $data, int $adminId = 1): array
    {
        $id = (int)($data['id'] ?? 0);
        $name = trim((string)($data['name'] ?? ''));
        if (empty($name)) {
            return ['success' => false, 'error' => 'اسم المورد مطلوب'];
        }

        $phone = trim((string)($data['phone'] ?? ''));
        $whatsapp = trim((string)($data['whatsapp'] ?? $phone));
        $address = trim((string)($data['address'] ?? ''));
        $taxNo = trim((string)($data['tax_no'] ?? ''));
        $notes = trim((string)($data['notes'] ?? ''));
        $isActive = isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1;
        $networkId = $this->activeNetworkId();

        $this->db->beginTransaction();
        try {
            if ($id <= 0) {
                // 1. Generate Supplier Code
                $countStmt = $this->db->prepare("SELECT COUNT(*) FROM um_suppliers WHERE network_id=?");
                $countStmt->execute([$networkId]);
                $count = (int)$countStmt->fetchColumn();
                $code = 'SUP-' . str_pad((string)($count + 1), 4, '0', STR_PAD_LEFT);

                // 2. Find or create Chart of Accounts liability sub-account
                $parentStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = '2100' AND network_id=? LIMIT 1");
                $parentStmt->execute([$networkId]);
                $parentId = FinancialPostingAccounts::standard($this->db,$networkId,'2101');

                // Generate sub account code under 2100 e.g. 210101, 210102...
                $maxCodeStmt = $this->db->prepare("SELECT MAX(account_code) FROM um_chart_of_accounts WHERE parent_id = ? AND network_id=? AND account_code REGEXP '^[0-9]+$'");
                $maxCodeStmt->execute([$parentId, $networkId]);
                $maxCode = $maxCodeStmt->fetchColumn();
                $newAccCode = $maxCode ? (string)((int)$maxCode + 1) : '210101';

                $accStmt = $this->db->prepare("
                    INSERT INTO um_chart_of_accounts 
                        (network_id, account_code, name_ar, name_en, account_type, parent_id, level, is_system, is_active, balance)
                    VALUES 
                        (?, ?, ?, ?, 'liability', ?, 3, 0, 1, 0.00)
                ");
                $accStmt->execute([$networkId, $newAccCode, "ذمة مورد: " . $name, "Supplier: " . $name, $parentId]);
                $payableAccountId = (int)$this->db->lastInsertId();

                // 3. Insert Supplier
                $stmt = $this->db->prepare("
                    INSERT INTO um_suppliers 
                        (network_id, supplier_code, name, phone, whatsapp, address, tax_no, payable_account_id, is_active, notes, created_by)
                    VALUES 
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$networkId, $code, $name, $phone, $whatsapp, $address, $taxNo, $payableAccountId, $isActive, $notes, $adminId]);
                $newId = (int)$this->db->lastInsertId();

                $this->db->commit();
                return ['success' => true, 'id' => $newId, 'message' => 'تمت إضافة المورد وحسابه المحاسبي بنجاح'];
            } else {
                // Update
                $stmt = $this->db->prepare("
                    UPDATE um_suppliers 
                    SET name = ?, phone = ?, whatsapp = ?, address = ?, tax_no = ?, is_active = ?, notes = ?
                    WHERE id = ? AND network_id = ?
                ");
                $stmt->execute([$name, $phone, $whatsapp, $address, $taxNo, $isActive, $notes, $id, $networkId]);

                // Update CoA name if linked
                $sup = $this->getSupplierById($id);
                if (!empty($sup['payable_account_id'])) {
                    $this->db->prepare("UPDATE um_chart_of_accounts SET name_ar = ?, name_en = ? WHERE id = ? AND network_id = ?")
                             ->execute(["ذمة مورد: " . $name, "Supplier: " . $name, $sup['payable_account_id'], $networkId]);
                }

                $this->db->commit();
                return ['success' => true, 'id' => $id, 'message' => 'تم تحديث بيانات المورد بنجاح'];
            }
        } catch (Throwable $e) {
            $this->db->rollBack();
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function deleteSupplier(int $id): array
    {
        $sup = $this->getSupplierById($id);
        if (!$sup) {
            return ['success' => false, 'error' => 'المورد غير موجود'];
        }

        $networkId = $this->activeNetworkId();
        $invCountStmt = $this->db->prepare("SELECT COUNT(*) FROM um_purchase_invoices WHERE supplier_id = ? AND network_id=?");
        $invCountStmt->execute([$id, $networkId]);
        $invCount = (int)$invCountStmt->fetchColumn();
        if ($invCount > 0) {
            return ['success' => false, 'error' => "لا يمكن حذف المورد لوجود ($invCount) فاتورة مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك."];
        }

        if (abs((float)$sup['current_balance']) > 0.01) {
            return ['success' => false, 'error' => 'لا يمكن حذف المورد لأن رصيده الحسابي غير مصفّر'];
        }

        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM um_suppliers WHERE id = ? AND network_id=?")->execute([$id, $networkId]);
            if (!empty($sup['payable_account_id'])) {
                $this->db->prepare("DELETE FROM um_chart_of_accounts WHERE id = ? AND network_id=?")->execute([$sup['payable_account_id'], $networkId]);
            }
            $this->db->commit();
            return ['success' => true, 'message' => 'تم حذف المورد بنجاح'];
        } catch (Throwable $e) {
            $this->db->rollBack();
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getSupplierStatement(int $supplierId, string $startDate = '', string $endDate = ''): array
    {
        $networkId = $this->activeNetworkId();
        $supplier = $this->getSupplierById($supplierId);
        if (!$supplier) {
            return ['success' => false, 'error' => 'المورد غير موجود'];
        }

        $accId = (int)$supplier['payable_account_id'];
        $transactions = [];

        // Fetch all purchase invoices
        $invWhere = ["supplier_id = ? AND network_id = ? AND status = 'posted'"];
        $invParams = [$supplierId, $networkId];
        if (!empty($startDate)) { $invWhere[] = "invoice_date >= ?"; $invParams[] = $startDate; }
        if (!empty($endDate))   { $invWhere[] = "invoice_date <= ?"; $invParams[] = $endDate; }

        $invStmt = $this->db->prepare("
            SELECT id, invoice_no, invoice_date as tx_date, 'purchase_invoice' as tx_type, total_amount as credit, paid_amount as debit, remaining_amount, currency_code, exchange_rate, currency_total_amount, currency_paid_amount, notes
            FROM um_purchase_invoices
            WHERE " . implode(' AND ', $invWhere) . "
            ORDER BY invoice_date ASC, id ASC
        ");
        $invStmt->execute($invParams);
        $invoices = $invStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch payments made to supplier from journal entries
        $payWhere = ["e.network_id = ? AND l.account_id = ? AND e.source_module IN ('supplier_payment', 'payment')"];
        $payParams = [$networkId, $accId];
        if (!empty($startDate)) { $payWhere[] = "e.entry_date >= ?"; $payParams[] = $startDate; }
        if (!empty($endDate))   { $payWhere[] = "e.entry_date <= ?"; $payParams[] = $endDate; }

        $payStmt = $this->db->prepare("
            SELECT e.id, e.entry_no as invoice_no, e.entry_date as tx_date, 'supplier_payment' as tx_type, 0 as credit, l.debit as debit, 0 as remaining_amount, e.description as notes
            FROM um_journal_entry_lines l
            JOIN um_journal_entries e ON e.id = l.journal_entry_id
            WHERE " . implode(' AND ', $payWhere) . "
            ORDER BY e.entry_date ASC, e.id ASC
        ");
        $payStmt->execute($payParams);
        $payments = $payStmt->fetchAll(PDO::FETCH_ASSOC);

        $combined = array_merge($invoices, $payments);
        usort($combined, fn($a, $b) => strcmp((string)$a['tx_date'], (string)$b['tx_date']));

        $runningBalance = 0.0;
        $totalPurchases = 0.0;
        $totalPaid = 0.0;

        foreach ($combined as &$row) {
            $credit = (float)$row['credit']; // purchase increases liability
            $debit = (float)$row['debit'];   // payment reduces liability
            $totalPurchases += $credit;
            $totalPaid += $debit;
            $runningBalance += ($credit - $debit);
            $row['running_balance'] = $runningBalance;
        }
        unset($row);

        return [
            'success'          => true,
            'supplier'         => $supplier,
            'transactions'     => $combined,
            'total_purchases'  => $totalPurchases,
            'total_paid'       => $totalPaid,
            'current_balance'  => $runningBalance
        ];
    }

    // =========================================================================
    // 2. PURCHASE INVOICES (فواتير المشتريات)
    // =========================================================================

    public function getPurchaseLookups(?int $callerAdminId = null): array
    {
        $networkId = $this->activeNetworkId();
        if ($callerAdminId === null && session_status() === PHP_SESSION_ACTIVE) {
            $callerAdminId = (int)($_SESSION['admin_id'] ?? 1);
        }
        $callerAdminId = $callerAdminId ?: 1;

        // 1. Suppliers with active status
        $suppliers = $this->getSuppliers('', true);

        // 2. Ensure current admin has a personal ledger account
        $currentAdminAccId = FinancialPostingAccounts::cashForAdmin($this->db,$networkId,$callerAdminId);

        // 3. Payment Accounts (Personal Admin Accounts First + Treasuries / Banks)
        $accStmt = $this->db->prepare("
            SELECT id, account_code, name_ar, account_type, linked_admin_id, balance
            FROM um_chart_of_accounts
            WHERE network_id = ? AND is_active = 1
              AND account_type='asset' AND (account_code LIKE '1101%' OR account_code LIKE '1102%')
            ORDER BY 
              CASE WHEN linked_admin_id = ? THEN 0 
                   WHEN account_code = '1101' THEN 1 
                   WHEN account_type = 'equity' THEN 2
                   ELSE 3 END,
              account_code ASC
        ");
        $accStmt->execute([$networkId, $callerAdminId]);
        $treasuries = $accStmt->fetchAll(PDO::FETCH_ASSOC);

        // 4. Receivers / Responsible Users ONLY belonging to current active network
        $adminsStmt = $this->db->prepare("
            SELECT a.id, COALESCE(NULLIF(a.fullname,''), a.username) as fullname, a.username, COALESCE(r.role_key, a.role) as role, b.balance
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id = a.id AND x.network_id = ? AND x.is_active = 1
            LEFT JOIN um_admin_network_roles r ON r.admin_id = a.id AND r.network_id = x.network_id AND r.is_active = 1
            LEFT JOIN um_admin_network_balances b ON b.admin_id = a.id AND b.network_id = x.network_id
            WHERE a.is_active = 1
            ORDER BY 
              CASE WHEN a.id = ? THEN 0 ELSE 1 END,
              a.fullname ASC
        ");
        $adminsStmt->execute([$networkId, $callerAdminId]);
        $admins = $adminsStmt->fetchAll(PDO::FETCH_ASSOC);

        $roleLabels = [
            'system_owner'        => 'مالك النظام',
            'superadmin'          => 'المدير العام',
            'admin'               => 'مدير نظام',
            'partner'             => 'شريك',
            'supervisor'          => 'مشرف شبكة',
            'engineer'            => 'مهندس شبكة',
            'distributor'         => 'موزع رئيسي',
            'pos_agent'           => 'نقطة بيع / محل',
            'regular_node_owner'  => 'مالك برج / عقدة',
            'collector'           => 'محصل مالي',
            'viewer'              => 'مراقب'
        ];

        foreach ($admins as &$adm) {
            $rKey = (string)($adm['role'] ?? '');
            $adm['role_ar'] = $roleLabels[$rKey] ?? 'مستخدم شبكة';
        }
        unset($adm);

        // 5. Clean Catalog of Items & Models
        $cleanItemName = function($name, $model) {
            $name = trim((string)$name);
            $model = trim((string)$model);
            
            $genericModels = ['linux', 'wireless/network device', 'generic', 'device', 'routeros', 'other', 'undefined'];
            if (!empty($model) && !in_array(strtolower($model), $genericModels, true) && strlen($model) > 1) {
                return $model;
            }
            
            $clean = preg_replace('/\s*-\s*(Linux|Wireless\/Network Device|RouterOS|Generic|MikroTik)$/i', '', $name);
            $clean = preg_replace('/^[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}\s*-\s*/', '', $clean);
            $clean = preg_replace('/^(CP|AP|Node|Station)-[^\s-]+-[^\s-]+-\d+\s*-\s*/i', '', $clean);
            
            return trim($clean) ?: $name;
        };

        $previousItems = [];
        try {
            $stmt = $this->db->query("
                SELECT 
                    item_name,
                    model,
                    category,
                    unit_type,
                    unit_price,
                    COUNT(*) as usage_count,
                    MAX(created_at) as last_used
                FROM um_purchase_invoice_items
                WHERE item_name IS NOT NULL AND TRIM(item_name) != ''
                GROUP BY item_name, model, category, unit_type, unit_price
                ORDER BY last_used DESC, usage_count DESC
                LIMIT 150
            ");
            if ($stmt) {
                $rawItems = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rawItems as $ri) {
                    $cleanedName = $cleanItemName($ri['item_name'], $ri['model']);
                    $ri['item_name'] = $cleanedName;
                    $ri['model'] = $cleanedName;
                    $previousItems[] = $ri;
                }
            }
        } catch (Throwable $e) {
            $previousItems = [];
        }

        // Merge assets inventory from um_assets with clean names
        try {
            $stmtAssets = $this->db->query("
                SELECT 
                    name as item_name,
                    COALESCE(model, '') as model,
                    category,
                    COALESCE(quantity_unit, 'قطعة') as unit_type,
                    COALESCE(purchase_cost, 0) as unit_price,
                    COUNT(*) as usage_count,
                    MAX(created_at) as last_used
                FROM um_assets
                WHERE name IS NOT NULL AND TRIM(name) != ''
                GROUP BY name, model, category, quantity_unit, purchase_cost
                ORDER BY usage_count DESC, last_used DESC
                LIMIT 200
            ");
            if ($stmtAssets) {
                $assetsItems = $stmtAssets->fetchAll(PDO::FETCH_ASSOC);
                $existingNames = array_column($previousItems, 'item_name');
                foreach ($assetsItems as $ai) {
                    $cleanedName = $cleanItemName($ai['item_name'], $ai['model']);
                    if (!in_array($cleanedName, $existingNames, true)) {
                        $ai['item_name'] = $cleanedName;
                        $ai['model'] = $cleanedName;
                        $previousItems[] = $ai;
                        $existingNames[] = $cleanedName;
                    }
                }
            }
        } catch (Throwable $e) {
            // ignore
        }

        // Standard Default Network Equipment Catalog
        $defaultCatalog = [
            ['item_name' => 'راوتر ميكروتك RB750Gr3 (hEX)', 'model' => 'RB750Gr3', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 25000],
            ['item_name' => 'راوتر ميكروتك CCR2004-16G-2S+', 'model' => 'CCR2004', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 240000],
            ['item_name' => 'راوتر ميكروتك CCR1009-7G-1C-1S+', 'model' => 'CCR1009', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 195000],
            ['item_name' => 'راوتر ميكروتك RB1100AHx4', 'model' => 'RB1100AHx4', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 160000],
            ['item_name' => 'راوتر ميكروتك RB4011', 'model' => 'RB4011iGS+', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 125000],
            ['item_name' => 'راوتر ميكروتك RB3011', 'model' => 'RB3011UiAS', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 95000],
            ['item_name' => 'أنتينا سكتر ميمو 2.4GHz', 'model' => 'MIMO Sector 2.4', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 45000],
            ['item_name' => 'أنتينا سكتر ميمو 5GHz', 'model' => 'MIMO Sector 5GHz', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 55000],
            ['item_name' => 'أومني دبل 15dBi', 'model' => 'Omni 15dBi 2.4', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 28000],
            ['item_name' => 'أومني دبل 12dBi', 'model' => 'Omni 12dBi', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 22000],
            ['item_name' => 'ستيشن يوبيكويتي LiteBeam 5AC Gen2', 'model' => 'LBE-5AC-Gen2', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 38000],
            ['item_name' => 'ستيشن يوبيكويتي NanoStation 5AC Loco', 'model' => 'Loco5AC', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 32000],
            ['item_name' => 'ستيشن يوبيكويتي PowerBeam 5AC 400', 'model' => 'PBE-5AC-400', 'category' => 'antennas', 'unit_type' => 'قطعة', 'unit_price' => 68000],
            ['item_name' => 'كابل شبكة كات 6 شيلد خارجي (لفة 305 متر)', 'model' => 'Cat6 Outdoor Shielded', 'category' => 'cables', 'unit_type' => 'لفة', 'unit_price' => 48000],
            ['item_name' => 'كابل فايبر بصري 4 كور خارجي (لفة 1000م)', 'model' => 'Fiber 4-Core Armored', 'category' => 'cables', 'unit_type' => 'متر', 'unit_price' => 350],
            ['item_name' => 'كابل فايبر بصري 2 كور دروب (لفة 1000م)', 'model' => 'Drop Fiber 2-Core', 'category' => 'cables', 'unit_type' => 'متر', 'unit_price' => 200],
            ['item_name' => 'علبة رؤوس RJ45 كات 6 (100 حبة)', 'model' => 'RJ45 Cat6 Connectors', 'category' => 'maintenance_parts', 'unit_type' => 'علبة', 'unit_price' => 4500],
            ['item_name' => 'سويتش شبكة جيجابت 8 بورت', 'model' => 'Gigabit 8-Port', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 12000],
            ['item_name' => 'سويتش شبكة جيجابت 16 بورت', 'model' => 'Gigabit 16-Port', 'category' => 'routers', 'unit_type' => 'قطعة', 'unit_price' => 28000],
            ['item_name' => 'محول فايبر ميديا كونفرتر Gigabit (زوج A/B)', 'model' => 'MC Gigabit Pair', 'category' => 'routers', 'unit_type' => 'زوج', 'unit_price' => 14000],
            ['item_name' => 'محول طاقة PoE ميكروتك 24V 2.5A', 'model' => 'PoE 24V 2.5A', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 6500],
            ['item_name' => 'محول طاقة PoE ميكروتك 48V', 'model' => 'PoE 48V', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 8500],
            ['item_name' => 'بطارية جل ديب سايكل 100AH 12V', 'model' => 'Gel 100AH 12V', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 85000],
            ['item_name' => 'بطارية جل ديب سايكل 150AH 12V', 'model' => 'Gel 150AH 12V', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 120000],
            ['item_name' => 'بطارية جل ديب سايكل 200AH 12V', 'model' => 'Gel 200AH 12V', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 155000],
            ['item_name' => 'شاحن بطاريات ذكي 20A', 'model' => 'Smart Charger 20A', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 22000],
            ['item_name' => 'إنفرتر طاقة 1000W موجة جيبية نقية', 'model' => 'Pure Sine Inverter 1000W', 'category' => 'power_supplies', 'unit_type' => 'قطعة', 'unit_price' => 45000],
            ['item_name' => 'باتش كورد فايبر SC-SC (3 أمتار)', 'model' => 'Patch Cord SC-SC 3m', 'category' => 'cables', 'unit_type' => 'قطعة', 'unit_price' => 1200],
            ['item_name' => 'شطرطون عازل ولحام ماء 3M', 'model' => '3M Rubber Mastic Tape', 'category' => 'maintenance_parts', 'unit_type' => 'حبة', 'unit_price' => 2500]
        ];

        $existingNames = array_column($previousItems, 'item_name');
        foreach ($defaultCatalog as $dc) {
            if (!in_array($dc['item_name'], $existingNames, true)) {
                $previousItems[] = $dc;
                $existingNames[] = $dc['item_name'];
            }
        }

        return [
            'success'                  => true,
            'suppliers'                => $suppliers,
            'treasuries'               => $treasuries,
            'current_admin_account_id' => $currentAdminAccId,
            'admins'                   => $admins,
            'previous_items'           => $previousItems
        ];
    }

    public function listPurchaseInvoices(array $filters = []): array
    {
        $networkId = $this->activeNetworkId();
        $where = ['pi.network_id = ?'];
        $params = [$networkId];

        if (!empty($filters['supplier_id'])) {
            $where[] = 'pi.supplier_id = ?';
            $params[] = (int)$filters['supplier_id'];
        }
        if (!empty($filters['payment_type'])) {
            $where[] = 'pi.payment_type = ?';
            $params[] = $filters['payment_type'];
        }
        if (!empty($filters['network_id'])) {
            if ((int)$filters['network_id'] !== $networkId) {
                throw new DomainException('FORBIDDEN_NETWORK');
            }
        }
        if (!empty($filters['start_date'])) {
            $where[] = 'pi.invoice_date >= ?';
            $params[] = $filters['start_date'];
        }
        if (!empty($filters['end_date'])) {
            $where[] = 'pi.invoice_date <= ?';
            $params[] = $filters['end_date'];
        }
        if (!empty($filters['search'])) {
            $where[] = '(pi.invoice_no LIKE ? OR pi.supplier_invoice_no LIKE ? OR s.name LIKE ?)';
            $term = '%' . trim((string)$filters['search']) . '%';
            array_push($params, $term, $term, $term);
        }

        $page = max(1, (int)($filters['page'] ?? 1));
        $limit = max(10, min(100, (int)($filters['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $countSql = "
            SELECT COUNT(*)
            FROM um_purchase_invoices pi
            LEFT JOIN um_suppliers s ON s.id = pi.supplier_id
            WHERE " . implode(' AND ', $where) . "
        ";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $totalRows = (int)$countStmt->fetchColumn();

        $sql = "
            SELECT 
                pi.id,
                pi.invoice_no,
                pi.supplier_id,
                s.name as supplier_name,
                s.supplier_code,
                pi.supplier_invoice_no,
                pi.invoice_date,
                pi.network_id,
                net.name as network_name,
                pi.payment_type,
                pi.total_amount,
                pi.paid_amount,
                pi.remaining_amount,
                pi.currency_code,
                pi.exchange_rate,
                pi.currency_total_amount,
                pi.currency_paid_amount,
                COALESCE(pi.currency_remaining_amount, (COALESCE(pi.currency_total_amount, pi.total_amount) - COALESCE(pi.currency_paid_amount, pi.paid_amount))) as currency_remaining_amount,
                pi.status,
                pi.journal_entry_id,
                pi.notes,
                pi.created_at,
                adm.fullname as created_by_name,
                (SELECT COUNT(*) FROM um_purchase_invoice_items pii WHERE pii.purchase_invoice_id = pi.id) as items_count
            FROM um_purchase_invoices pi
            LEFT JOIN um_suppliers s ON s.id = pi.supplier_id
            LEFT JOIN um_networks net ON net.id = pi.network_id
            LEFT JOIN um_admins adm ON adm.id = pi.created_by
            WHERE " . implode(' AND ', $where) . "
            ORDER BY pi.invoice_date DESC, pi.id DESC
            LIMIT {$offset}, {$limit}
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'success'     => true,
            'data'        => $rows,
            'total'       => $totalRows,
            'page'        => $page,
            'limit'       => $limit,
            'total_pages' => ceil($totalRows / $limit)
        ];
    }

    public function getPurchaseInvoiceDetails(int $id): ?array
    {
        $networkId = $this->activeNetworkId();
        $stmt = $this->db->prepare("
            SELECT 
                pi.*,
                COALESCE(pi.currency_remaining_amount, (COALESCE(pi.currency_total_amount, pi.total_amount) - COALESCE(pi.currency_paid_amount, pi.paid_amount))) as currency_remaining_amount,
                s.name as supplier_name,
                s.phone as supplier_phone,
                s.supplier_code,
                s.payable_account_id as supplier_account_id,
                net.name as network_name,
                t.name_ar as payment_account_name,
                rec.fullname as receiver_name,
                res.fullname as responsible_name,
                cr.fullname as created_by_name
            FROM um_purchase_invoices pi
            LEFT JOIN um_suppliers s ON s.id = pi.supplier_id
            LEFT JOIN um_networks net ON net.id = pi.network_id
            LEFT JOIN um_chart_of_accounts t ON t.id = pi.payment_account_id
            LEFT JOIN um_admins rec ON rec.id = pi.received_by_admin_id
            LEFT JOIN um_admins res ON res.id = pi.responsible_admin_id
            LEFT JOIN um_admins cr ON cr.id = pi.created_by
            WHERE pi.id = ? AND pi.network_id = ?
            LIMIT 1
        ");
        $stmt->execute([$id, $networkId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) return null;

        // Fetch Items with line_total and total_price aliases
        $itemStmt = $this->db->prepare("
            SELECT *, COALESCE(line_total, total_price, quantity * unit_price) as line_total, COALESCE(line_total, total_price, quantity * unit_price) as total_price
            FROM um_purchase_invoice_items 
            WHERE purchase_invoice_id = ?
            ORDER BY id ASC
        ");
        $itemStmt->execute([$id]);
        $invoice['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch Journal Entry
        if (!empty($invoice['journal_entry_id'])) {
            $jeStmt = $this->db->prepare("SELECT * FROM um_journal_entries WHERE id = ? LIMIT 1");
            $jeStmt->execute([$invoice['journal_entry_id']]);
            $je = $jeStmt->fetch(PDO::FETCH_ASSOC);
            if ($je) {
                $linesStmt = $this->db->prepare("
                    SELECT l.*, ca.account_code, ca.name_ar as account_name
                    FROM um_journal_entry_lines l
                    LEFT JOIN um_chart_of_accounts ca ON ca.id = l.account_id
                    WHERE l.journal_entry_id = ?
                    ORDER BY l.line_index ASC
                ");
                $linesStmt->execute([$je['id']]);
                $je['lines'] = $linesStmt->fetchAll(PDO::FETCH_ASSOC);
                $invoice['journal_entry'] = $je;
            }
        }

        return $invoice;
    }

    public function postPurchaseInvoice(array $data, int $adminId = 1): array
    {
        $supplierId = (int)($data['supplier_id'] ?? 0);
        $networkId = $this->requestedNetworkId($data, $this->activeNetworkId());
        $supplier = $this->getSupplierById($supplierId);
        if (!$supplier) {
            return ['success' => false, 'error' => 'يرجى تحديد مورد صالح'];
        }

        $items = (array)($data['items'] ?? []);
        if (empty($items)) {
            return ['success' => false, 'error' => 'يجب إضافة بند واحد على الأقل في فاتورة المشتريات'];
        }

        $paymentType = (string)($data['payment_type'] ?? 'cash');
        if (!in_array($paymentType, ['cash', 'credit', 'partial'], true)) {
            $paymentType = 'cash';
        }

        $paymentAccountId = (int)($data['payment_account_id'] ?? 0);
        if (!$paymentAccountId) $paymentAccountId = FinancialPostingAccounts::standard($this->db,$networkId,'1101');
        FinancialPostingAccounts::validate($this->db,$networkId,$paymentAccountId,'asset',true);
        FinancialPostingAccounts::validate($this->db,$networkId,(int)$supplier['payable_account_id'],'liability');
        $invoiceDate = !empty($data['invoice_date']) ? $data['invoice_date'] : date('Y-m-d');
        $supplierInvoiceNo = trim((string)($data['supplier_invoice_no'] ?? ''));
        $receivedByAdminId = (int)($data['received_by_admin_id'] ?? $adminId);
        $responsibleAdminId = (int)($data['responsible_admin_id'] ?? $adminId);
        $notes = trim((string)($data['notes'] ?? ''));

        // Category Account Mapping (1500+ / 1202)
        $categoryAccountMap = ['servers'=>'1202','routers'=>'1202','antennas_dishes'=>'1203','antennas'=>'1203','towers'=>'1201','solar_batteries'=>'1205','power_supplies'=>'1205','cables_fiber'=>'1204','cables'=>'1204','maintenance_parts'=>'110402','other_assets'=>'1208','vehicles'=>'1207','other'=>'1208'];

        // 1. Calculate totals & prepare items
        $totalAmount = 0.0;
        $processedItems = [];

        foreach ($items as $idx => $item) {
            $name = trim((string)($item['item_name'] ?? ''));
            if (empty($name)) continue;

            $model = trim((string)($item['model'] ?? ''));
            $category = trim((string)($item['category'] ?? 'routers'));
            $quantity = max(0.001, (float)($item['quantity'] ?? 1));
            $unitType = trim((string)($item['unit_type'] ?? 'قطعة'));
            $unitPrice = max(0.0, (float)($item['unit_price'] ?? 0));
            $lineTotal = round($quantity * $unitPrice, 2);

            $totalAmount += $lineTotal;
            $processedItems[] = [
                'item_name'   => $name,
                'model'       => $model,
                'category'    => $category,
                'quantity'    => $quantity,
                'unit_type'   => $unitType,
                'unit_price'  => $unitPrice,
                'line_total'  => $lineTotal,
                'account_id'  => FinancialPostingAccounts::standard($this->db,$networkId,$categoryAccountMap[$category] ?? '1208')
            ];
        }

        if (empty($processedItems) || $totalAmount <= 0) {
            return ['success' => false, 'error' => 'إجمالي الفاتورة غير صالح أو لا توجد بنود'];
        }

        // 2. Compute Payment Amounts
        if ($paymentType === 'cash') {
            $paidAmount = $totalAmount;
            $remainingAmount = 0.0;
        } elseif ($paymentType === 'credit') {
            $paidAmount = 0.0;
            $remainingAmount = $totalAmount;
        } else { // partial
            $paidAmount = min($totalAmount, max(0.0, (float)($data['paid_amount'] ?? 0)));
            $remainingAmount = round($totalAmount - $paidAmount, 2);
        }

        $this->db->beginTransaction();
        try {
            $invNo = 'PINV-' . date('Ymd') . '-' . str_pad((string)random_int(100, 9999), 4, '0', STR_PAD_LEFT);
            $primaryInventoryAccount = $processedItems[0]['account_id'];
            FinancialPostingAccounts::validate($this->db,$networkId,$paymentAccountId,'asset',true);
            FinancialPostingAccounts::validate($this->db,$networkId,(int)$supplier['payable_account_id'],'liability');

            $currencyCode = strtoupper(trim((string)($data['currency_code'] ?? 'YER_SANAA')));
            $exchangeRate = (float)($data['exchange_rate'] ?? 1.0);
            if ($exchangeRate <= 0) $exchangeRate = 1.0;
            
            $currencyTotal = $totalAmount;
            $currencyPaid = $paidAmount;
            $currencyRemaining = $remainingAmount;

            // Convert to base currency for accounting ledger
            if ($currencyCode !== 'YER_SANAA' && $exchangeRate > 0) {
                $totalAmount = round($currencyTotal * $exchangeRate, 2);
                $paidAmount = round($currencyPaid * $exchangeRate, 2);
                $remainingAmount = round($totalAmount - $paidAmount, 2);
            }

            $baseSum=0;
            foreach($processedItems as &$pi){$pi['base_line_total']=round($pi['line_total']*($currencyCode==='YER_SANAA'?1:$exchangeRate),2);$baseSum+=$pi['base_line_total'];}unset($pi);
            $lastItem=count($processedItems)-1;$processedItems[$lastItem]['base_line_total']=round($processedItems[$lastItem]['base_line_total']+$totalAmount-$baseSum,2);
            $stmt = $this->db->prepare("
                INSERT INTO um_purchase_invoices 
                    (invoice_no, supplier_id, supplier_invoice_no, invoice_date, network_id, 
                     warehouse_name, received_by_admin_id, responsible_admin_id, payment_type, 
                     payment_account_id, inventory_account_id, payable_account_id, total_amount, paid_amount, 
                     remaining_amount, status, notes, created_by, currency_code, exchange_rate, currency_total_amount, currency_paid_amount, currency_remaining_amount, created_at)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $invNo, $supplierId, $supplierInvoiceNo, $invoiceDate, $networkId,
                'المستودع الرئيسي', $receivedByAdminId, $responsibleAdminId, $paymentType,
                $paymentAccountId, $primaryInventoryAccount, $supplier['payable_account_id'], $totalAmount, $paidAmount,
                $remainingAmount, $notes, $adminId, $currencyCode, $exchangeRate, $currencyTotal, $currencyPaid, $currencyRemaining
            ]);
            $invoiceId = (int)$this->db->lastInsertId();

            // 4. Insert Items & Auto-Create Assets in um_assets
            $categoryDebitTotals = []; // account_id => sum of line totals

            foreach ($processedItems as $item) {
                $itemStmt = $this->db->prepare("
                    INSERT INTO um_purchase_invoice_items 
                        (network_id, purchase_invoice_id, item_name, model, category, quantity, unit_type, unit_price, line_total)
                    VALUES 
                        (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $itemStmt->execute([
                    $networkId, $invoiceId, $item['item_name'], $item['model'], $item['category'],
                    $item['quantity'], $item['unit_type'], $item['unit_price'], $item['line_total']
                ]);
                $itemId = (int)$this->db->lastInsertId();

                // Aggregate debits by asset category account
                $accId = $item['account_id'];
                $categoryDebitTotals[$accId] = ($categoryDebitTotals[$accId] ?? 0.0) + $item['base_line_total'];

                // Insert into um_assets (As new stock assets, node/location editable after installation, price locked)
                $qty = (float)$item['quantity'];
                $unitPrice = ($currencyCode !== 'YER_SANAA') ? round((float)$item['unit_price']*$exchangeRate,2) : (float)$item['unit_price'];
                $cat = $item['category'];
                $assetCategory = in_array($cat, ['routers','servers','antennas_dishes','solar_batteries','cables_fiber','towers','vehicles','other']) ? $cat : (
                    ($cat === 'antennas') ? 'antennas_dishes' : (
                    ($cat === 'cables') ? 'cables_fiber' : (
                    ($cat === 'power_supplies') ? 'solar_batteries' : 'other'))
                );

                $isDiscretePiece = in_array(trim($item['unit_type']), ['قطعة', 'حبة', 'جهاز', 'راوتر', 'أنتينا']) && ($qty >= 1 && $qty <= 50 && $qty == floor($qty));

                if ($isDiscretePiece) {
                    for ($i = 1; $i <= (int)$qty; $i++) {
                        $assetCode = 'AST-' . date('Ym') . '-' . str_pad((string)$itemId, 4, '0', STR_PAD_LEFT) . ((int)$qty > 1 ? "-$i" : "");
                        $astName = $item['item_name'] . ((int)$qty > 1 ? " (#$i)" : "");
                        $assetCents=(int)round($item['base_line_total']*100);$pieceCents=intdiv($assetCents,(int)$qty)+($i<=($assetCents%(int)$qty)?1:0);$pieceCost=$pieceCents/100;
                        $astStmt = $this->db->prepare("
                            INSERT INTO um_assets 
                                (asset_code, name, category, model, purchase_date, purchase_cost, current_value, 
                                 location, status, network_id, node_id, purchase_invoice_id, purchase_item_id, 
                                 purchased_quantity, quantity_unit, cost_locked, notes, created_by_admin_id, created_by_name, created_at)
                            VALUES 
                                (?, ?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, NULL, ?, ?, 1, ?, 1, ?, ?, 'نظام المشتريات', NOW())
                        ");
                        $astStmt->execute([
                            $assetCode, $astName, $assetCategory, $item['model'] ?: null,
                            $invoiceDate, $pieceCost, $pieceCost,
                            'المستودع الرئيسي (بانتظار التركيب)', $networkId, $invoiceId, $itemId,
                            $item['unit_type'], "فاتورة مشتريات $invNo - المورد: {$supplier['name']}", $adminId
                        ]);
                    }
                } else {
                    $assetCode = 'AST-' . date('Ym') . '-' . str_pad((string)$itemId, 4, '0', STR_PAD_LEFT);
                    $astStmt = $this->db->prepare("
                        INSERT INTO um_assets 
                            (asset_code, name, category, model, purchase_date, purchase_cost, current_value, 
                             location, status, network_id, node_id, purchase_invoice_id, purchase_item_id, 
                             purchased_quantity, quantity_unit, cost_locked, notes, created_by_admin_id, created_by_name, created_at)
                        VALUES 
                            (?, ?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, NULL, ?, ?, ?, ?, 1, ?, ?, 'نظام المشتريات', NOW())
                    ");
                    $astStmt->execute([
                        $assetCode, $item['item_name'], $assetCategory, $item['model'] ?: null,
                        $invoiceDate, $item['base_line_total'], $item['base_line_total'],
                        'المستودع الرئيسي (بانتظار التركيب)', $networkId, $invoiceId, $itemId,
                        $qty, $item['unit_type'], "فاتورة مشتريات $invNo - المورد: {$supplier['name']}", $adminId
                    ]);
                }
            }

            $this->db->prepare("UPDATE um_assets SET source_type='purchase_invoice' WHERE purchase_invoice_id=? AND network_id=?")->execute([$invoiceId,$networkId]);

            $desc = "فاتورة مشتريات رقم $invNo";
            $lines=[];$baseDebits=[];$sum=0;
            foreach($categoryDebitTotals as $accId=>$value){FinancialPostingAccounts::validate($this->db,$networkId,(int)$accId,'asset');$baseDebits[$accId]=round($value,2);$sum+=$baseDebits[$accId];}
            // Allocate conversion rounding to the final category, keeping totals exact.
            $last=array_key_last($baseDebits);$baseDebits[$last]=round($baseDebits[$last]+$totalAmount-$sum,2);
            foreach($baseDebits as $accId=>$value)if($value>0)$lines[]=['account_id'=>(int)$accId,'debit'=>$value,'credit'=>0];
            if($paidAmount>0)$lines[]=['account_id'=>$paymentAccountId,'debit'=>0,'credit'=>$paidAmount];
            if($remainingAmount>0)$lines[]=['account_id'=>(int)$supplier['payable_account_id'],'debit'=>0,'credit'=>$remainingAmount];
            $journal=$this->journal(['entry_date'=>$invoiceDate,'source_module'=>'purchase','reference_no'=>$invNo,'description'=>$desc,'lines'=>$lines],$adminId,$networkId);
            $journalEntryId=(int)$journal['entry_id'];
            if($paidAmount>0)$this->recordSupplierPayment($networkId,$supplier,$paymentAccountId,$paidAmount,$invNo,$currencyCode,$exchangeRate,$currencyPaid,$adminId,$desc);

            // Link Journal Entry to Invoice
            $this->db->prepare("UPDATE um_purchase_invoices SET journal_entry_id = ? WHERE id = ? AND network_id=?")->execute([$journalEntryId, $invoiceId,$networkId]);

            $this->db->commit();
            return [
                'success'    => true,
                'invoice_id' => $invoiceId,
                'invoice_no' => $invNo,
                'message'    => "تم ترحيل فاتورة المشتريات ($invNo) والقيد المحاسبي والأصول بنجاح ✅"
            ];
        } catch (Throwable $e) {
            $this->db->rollBack();
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    private function journal(array $data,int $adminId,int $networkId): array {
        $writer=new FinancialAccountingService($this->db);
        if((int)$writer->getActiveNetworkId()!==$networkId)throw new DomainException('FORBIDDEN_NETWORK');
        return $writer->createJournalEntry($data,$adminId);
    }
    private function recordSupplierPayment(int $networkId,array $supplier,int $paymentAccountId,float $amount,string $reference,string $currency,float $rate,float $currencyAmount,int $adminId,string $description): void {
        $account=FinancialPostingAccounts::validate($this->db,$networkId,$paymentAccountId,'asset',true);
        $method=str_starts_with($account['account_code'],'1102')?'bank':'cash';
        // Supplier ids and chart ids are not administrator ids in the party subledger.
        $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no,account_id,tx_type,reference_id,debit,credit,cashbox_impact,payment_method,description,created_by,currency_code,exchange_rate,currency_amount) VALUES (?,?,0,'payment_voucher',?,0,?,?,?,?,?,?,?,?)")->execute([$networkId,'TX-PUR-'.bin2hex(random_bytes(8)),$reference,$amount,-$amount,$method,$description,$adminId,$currency,$rate,$currencyAmount]);
        $this->db->prepare("INSERT INTO um_vouchers_financial (network_id,voucher_no,voucher_type,source_account_id,destination_account_id,party_id,party_name,amount,currency_code,exchange_rate,currency_amount,payment_method,category,reference_id,notes,created_by) VALUES (?,?,'payment',?,?,NULL,?,?,?,?,?,?, 'مشتريات وموردين',?,?,?)")->execute([$networkId,'V-PUR-'.date('Ymd').'-'.bin2hex(random_bytes(6)),$paymentAccountId,(int)$supplier['payable_account_id'],'المورد: '.$supplier['name'],$amount,$currency,$rate,$currencyAmount,$method,$reference,$description,$adminId]);
    }
    public function paySupplier(array $data,int $adminId=1): array {
        $networkId=$this->requestedNetworkId($data,$this->activeNetworkId());$supplier=$this->getSupplierById((int)($data['supplier_id']??0));
        $raw=$data['amount']??$data['currency_amount']??0;
        if(!$supplier||!is_numeric($raw)||!is_finite((float)$raw)||(float)$raw<=0)return ['success'=>false,'error'=>'حدد المورد ومبلغ السداد'];
        $currency=strtoupper(trim((string)($data['currency_code']??'YER_SANAA')));$rate=(float)($data['exchange_rate']??1);
        if(!is_finite($rate)||$rate<=0)return ['success'=>false,'error'=>'سعر الصرف غير صحيح'];
        $foreign=round((float)$raw,2);$amount=$currency==='YER_SANAA'?$foreign:round($foreign*$rate,2);
        $date=(string)($data['payment_date']??date('Y-m-d'));
        $this->db->beginTransaction();
        try {
            $payment=(int)($data['payment_account_id']??0);if(!$payment)$payment=FinancialPostingAccounts::standard($this->db,$networkId,'1101');
            FinancialPostingAccounts::validate($this->db,$networkId,$payment,'asset',true);
            FinancialPostingAccounts::validate($this->db,$networkId,(int)$supplier['payable_account_id'],'liability');
            $ref='SPAY-'.date('Ymd').'-'.bin2hex(random_bytes(6));$description='سداد دفعة للمورد'.(!empty($data['notes'])?' - '.trim((string)$data['notes']):'');
            $r=$this->journal(['entry_date'=>$date,'source_module'=>'supplier_payment','reference_no'=>$ref,'description'=>$description,'lines'=>[['account_id'=>(int)$supplier['payable_account_id'],'debit'=>$amount,'credit'=>0],['account_id'=>$payment,'debit'=>0,'credit'=>$amount]]],$adminId,$networkId);
            $this->recordSupplierPayment($networkId,$supplier,$payment,$amount,$ref,$currency,$rate,$foreign,$adminId,$description);
            $this->db->commit();return ['success'=>true,'entry_no'=>$r['entry_no'],'message'=>'تم ترحيل سند صرف الدفعة للمورد'];
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();return ['success'=>false,'error'=>$e->getMessage()];}
    }

}
