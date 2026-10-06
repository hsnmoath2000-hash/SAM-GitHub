<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/FinancialPostingAccounts.php';

/**
 * FinancialAccountingService - Specialized Domain Service for Double-Entry Accounting, Invoices, Vouchers, Cashboxes & Ledgers
 */
class FinancialAccountingService extends BaseService {

    // ==========================================
    // MULTI-CURRENCY & EXCHANGE RATES ENGINE
    // ==========================================

    public function getExchangeRates(): array {
        $this->ensureExchangeRatesTable();
        $stmt = $this->db->query("SELECT * FROM um_exchange_rates ORDER BY display_order ASC, id ASC");
        $rates = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        if (empty($rates)) {
            $this->seedDefaultExchangeRates();
            $stmt = $this->db->query("SELECT * FROM um_exchange_rates ORDER BY display_order ASC, id ASC");
            $rates = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        }
        return ['success' => true, 'rates' => $rates];
    }

    public function saveExchangeRate(array $data): array {
        $this->enforcePermission('finance_settings', 'تعديل أسعار الصرف');
        $code = strtoupper(trim((string)($data['currency_code'] ?? '')));
        if (empty($code)) {
            throw new InvalidArgumentException('CURRENCY_CODE_REQUIRED');
        }
        $name = trim((string)($data['currency_name'] ?? $code));
        $symbol = trim((string)($data['currency_symbol'] ?? 'ر.ي'));
        $rate = (float)($data['exchange_rate'] ?? 1.0);
        $buyRate = isset($data['buy_rate']) ? (float)$data['buy_rate'] : $rate;
        $sellRate = isset($data['sell_rate']) ? (float)$data['sell_rate'] : $rate;
        $isBase = !empty($data['is_base_currency']) ? 1 : 0;
        $isActive = isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1;
        $order = (int)($data['display_order'] ?? 0);
        $adminId = (int)($_SESSION['admin_id'] ?? 1);

        $this->ensureExchangeRatesTable();

        // If setting this as base currency, unset other base currencies
        if ($isBase === 1) {
            $this->db->exec("UPDATE um_exchange_rates SET is_base_currency = 0");
            $rate = 1.0;
        }

        $stmt = $this->db->prepare("
            INSERT INTO um_exchange_rates 
            (currency_code, currency_name, currency_symbol, is_base_currency, exchange_rate, buy_rate, sell_rate, is_active, display_order, last_updated_at, updated_by_admin_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            ON DUPLICATE KEY UPDATE
                currency_name = VALUES(currency_name),
                currency_symbol = VALUES(currency_symbol),
                is_base_currency = VALUES(is_base_currency),
                exchange_rate = VALUES(exchange_rate),
                buy_rate = VALUES(buy_rate),
                sell_rate = VALUES(sell_rate),
                is_active = VALUES(is_active),
                display_order = VALUES(display_order),
                last_updated_at = NOW(),
                updated_by_admin_id = VALUES(updated_by_admin_id)
        ");
        $stmt->execute([$code, $name, $symbol, $isBase, $rate, $buyRate, $sellRate, $isActive, $order, $adminId]);

        $this->logActivity('exchange_rate_update', 'finance', "تحديث سعر صرف العملة: {$name} ({$code})", [
            'currency_code' => $code,
            'rate' => $rate,
            'is_base' => $isBase
        ]);

        return ['success' => true, 'message' => "تم تحديث سعر صرف {$name} بنجاح"];
    }

        public function setBaseCurrency(string $currencyCode, bool $autoRecalculate = true): array {
        $this->enforcePermission('finance_settings', 'تعديل العملة الأساسية');
        $code = strtoupper(trim($currencyCode));
        $this->ensureExchangeRatesTable();

        $stmt = $this->db->prepare("SELECT * FROM um_exchange_rates WHERE currency_code = ?");
        $stmt->execute([$code]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$target) {
            throw new InvalidArgumentException("العملة المطلوبة غير موجودة في النظام: {$code}");
        }

        // Find current base currency
        $currentBaseStmt = $this->db->query("SELECT * FROM um_exchange_rates WHERE is_base_currency = 1 LIMIT 1");
        $currentBase = $currentBaseStmt ? $currentBaseStmt->fetch(PDO::FETCH_ASSOC) : null;

        $oldRate = (float)($target['exchange_rate'] ?? 1.0);
        if ($oldRate <= 0) {
            $oldRate = 1.0;
        }

        $adminId = (int)($_SESSION['admin_id'] ?? 1);

        if ($autoRecalculate && $currentBase && $currentBase['currency_code'] !== $code) {
            // Recalculate all rates relative to the new base
            $allStmt = $this->db->query("SELECT * FROM um_exchange_rates");
            $allRates = $allStmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($allRates as $curr) {
                $cCode = $curr['currency_code'];
                if ($cCode === $code) {
                    $newRate = 1.0;
                    $isBase = 1;
                } else {
                    $cOldRate = (float)($curr['exchange_rate'] ?? 1.0);
                    $newRate = $oldRate > 0 ? ($cOldRate / $oldRate) : 1.0;
                    $isBase = 0;
                }
                $upStmt = $this->db->prepare("
                    UPDATE um_exchange_rates 
                    SET exchange_rate = ?, is_base_currency = ?, is_active = 1, last_updated_at = NOW(), updated_by_admin_id = ?
                    WHERE currency_code = ?
                ");
                $upStmt->execute([$newRate, $isBase, $adminId, $cCode]);
            }
        } else {
            $this->db->exec("UPDATE um_exchange_rates SET is_base_currency = 0");
            $upStmt = $this->db->prepare("
                UPDATE um_exchange_rates 
                SET exchange_rate = 1.00000000, is_base_currency = 1, is_active = 1, last_updated_at = NOW(), updated_by_admin_id = ?
                WHERE currency_code = ?
            ");
            $upStmt->execute([$adminId, $code]);
        }

        $this->logActivity('base_currency_change', 'finance', "تغيير العملة الأساسية للنظام إلى: {$target['currency_name']} ({$code})", [
            'new_base' => $code,
            'old_base' => $currentBase['currency_code'] ?? null,
            'auto_recalculated' => $autoRecalculate
        ]);

        return [
            'success' => true,
            'message' => "تم تعيين [ {$target['currency_name']} ({$code}) ] كعملة أساسية للنظام بنجاح",
            'base_currency' => $code
        ];
    }

    public function convertCurrency(float $amount, string $fromCurrency, string $toCurrency = 'YER_SANAA'): array {
        $from = strtoupper(trim($fromCurrency));
        $to = strtoupper(trim($toCurrency));

        if ($from === $to || $amount == 0) {
            return [
                'success' => true,
                'from' => $from,
                'to' => $to,
                'amount' => $amount,
                'converted_amount' => $amount,
                'rate' => 1.0
            ];
        }

        $this->ensureExchangeRatesTable();
        $stmt = $this->db->query("SELECT currency_code, exchange_rate, is_base_currency FROM um_exchange_rates WHERE is_active = 1");
        $ratesMap = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $ratesMap[$r['currency_code']] = (float)$r['exchange_rate'];
        }

        $fromRate = $ratesMap[$from] ?? 1.0;
        $toRate = $ratesMap[$to] ?? 1.0;

        // Amount in Base Currency = Amount * FromRate
        $amountInBase = $amount * $fromRate;
        // Amount in Target Currency = AmountInBase / ToRate
        $converted = $toRate > 0 ? ($amountInBase / $toRate) : $amountInBase;
        $effectiveRate = $toRate > 0 ? ($fromRate / $toRate) : 1.0;

        return [
            'success' => true,
            'from' => $from,
            'to' => $to,
            'amount' => $amount,
            'amount_in_base' => round($amountInBase, 2),
            'converted_amount' => round($converted, 2),
            'rate' => round($effectiveRate, 4)
        ];
    }

    private function ensureExchangeRatesTable(): void {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS `um_exchange_rates` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `currency_code` VARCHAR(16) NOT NULL UNIQUE,
                    `currency_name` VARCHAR(64) NOT NULL,
                    `currency_symbol` VARCHAR(16) NOT NULL,
                    `is_base_currency` TINYINT(1) DEFAULT 0,
                    `exchange_rate` DECIMAL(18, 8) NOT NULL DEFAULT 1.00000000,
                    `buy_rate` DECIMAL(18, 8) DEFAULT NULL,
                    `sell_rate` DECIMAL(18, 8) DEFAULT NULL,
                    `is_active` TINYINT(1) DEFAULT 1,
                    `display_order` INT DEFAULT 0,
                    `last_updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    `updated_by_admin_id` INT DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (Throwable $e) {}
    }

    private function seedDefaultExchangeRates(): void {
        try {
            $this->db->exec("
                INSERT INTO `um_exchange_rates` (`currency_code`, `currency_name`, `currency_symbol`, `is_base_currency`, `exchange_rate`, `buy_rate`, `sell_rate`, `is_active`, `display_order`) VALUES
                ('YER_SANAA', 'ريال يمني (صنعاء)', 'ر.ي', 1, 1.0000, 1.0000, 1.0000, 1, 1),
                ('YER_ADEN', 'ريال يمني (عدن)', 'ر.ي', 0, 0.2857, 0.2800, 0.2900, 1, 2),
                ('SAR', 'ريال سعودي', 'ر.س', 0, 141.5000, 140.5000, 142.0000, 1, 3),
                ('USD', 'دولار أمريكي', '$', 0, 535.0000, 532.0000, 537.0000, 1, 4)
                ON DUPLICATE KEY UPDATE currency_name = VALUES(currency_name);
            ");
        } catch (Throwable $e) {}
    }


    // ==========================================
    // METHOD: getSalesInvoices
    // ==========================================
    public function getSalesInvoices($filters = [], $page = 1, $limit = 50) {
        if (!is_array($filters)) {
            $filters = ['buyer_id' => $filters];
        }
        $ctx = $this->getActiveAdminContext();
        $callerId = (int)$ctx['id'];
        $callerRole = (string)$ctx['role'];
        $buyerId = !empty($filters['buyer_id']) ? (int)$filters['buyer_id'] : null;
        $profile = trim($filters['profile'] ?? '');
        $payStatus = trim($filters['pay_status'] ?? '');
        $payMethod = trim($filters['pay_method'] ?? '');
        $startDate = trim($filters['start_date'] ?? '');
        $endDate = trim($filters['end_date'] ?? '');
        $search = trim($filters['search'] ?? '');
        $where = ["1=1"];
        $params = [':active_network'=>$this->getActiveNetworkId()];
        $where[] = 'inv.network_id = :active_network';
        $tradeType = $filters['trade_type'] ?? '';
        // Global administration and finance roles see all invoices; request filters remain optional.
        if (in_array($callerRole, ['system_owner', 'superadmin', 'finance', 'accountant'], true)) {
            // No actor filter: these roles are authorized for system-wide financial oversight.
        } else {
            if ($callerRole === 'admin') {
                if ($tradeType === 'purchases') {
                    $where[] = "inv.buyer_id = $callerId";
                } elseif ($tradeType === 'all') {
                    $where[] = "(inv.seller_id = $callerId OR inv.buyer_id = $callerId)";
                } else {
                    $where[] = "inv.seller_id = $callerId";
                }
            } elseif ($callerRole === 'pos_agent') {
                if ($tradeType === 'purchases') {
                    $where[] = "inv.buyer_id = $callerId";
                } elseif ($tradeType === 'all') {
                    $where[] = "(inv.seller_id = $callerId OR inv.buyer_id = $callerId)";
                } else {
                    // Default POS view is its own retail sales, never another POS account.
                    $where[] = "inv.seller_id = $callerId";
                }
            } elseif ($callerRole === 'distributor') {
                if ($tradeType === 'purchases') {
                    // Invoices purchased by this distributor from the Superadmin/GM
                    $where[] = "inv.buyer_id = $callerId";
                } elseif ($tradeType === 'all') {
                    $where[] = "(inv.seller_id = $callerId OR inv.buyer_id = $callerId OR inv.buyer_id IN (SELECT id FROM um_admins WHERE parent_id = $callerId OR created_by_admin_id = $callerId))";
                } else {
                    // Default in Sales Screen: Invoices sold by distributor to POS points / customers
                    $where[] = "(inv.seller_id = $callerId OR (inv.seller_id IS NULL AND inv.buyer_id IN (SELECT id FROM um_admins WHERE parent_id = $callerId OR created_by_admin_id = $callerId)))";
                }
            } else {
                $where[] = "(inv.buyer_id = $callerId OR inv.seller_id = $callerId)";
            }
        }
        if (!empty($buyerId)) {
            $where[] = "inv.buyer_id = :buyer";
            $params[':buyer'] = (int)$buyerId;
        }
        if (!empty($payMethod)) {
            $where[] = "inv.payment_type = :pay_method";
            $params[':pay_method'] = $payMethod;
        }
        if (!empty($payStatus)) {
            if ($payStatus === 'paid') {
                $where[] = "inv.remaining_amount <= 0";
            } elseif ($payStatus === 'partial') {
                $where[] = "inv.paid_amount > 0 AND inv.remaining_amount > 0";
            } elseif ($payStatus === 'unpaid') {
                $where[] = "inv.paid_amount <= 0 AND inv.remaining_amount > 0";
            }
        }
        if (!empty($startDate)) {
            $where[] = "inv.created_at >= :start_date";
            $params[':start_date'] = $startDate . ' 00:00:00';
        }
        if (!empty($endDate)) {
            $where[] = "inv.created_at <= :end_date";
            $params[':end_date'] = $endDate . ' 23:59:59';
        }
        if (!empty($search)) {
            $where[] = "(inv.invoice_no LIKE :invoice_search OR b.fullname LIKE :buyer_fullname_search OR b.username LIKE :buyer_username_search OR inv.buyer_name LIKE :buyer_name_search OR inv.buyer_phone LIKE :buyer_phone_search)";
            $params[':invoice_search'] = '%' . $search . '%';
            $params[':buyer_fullname_search'] = '%' . $search . '%';
            $params[':buyer_username_search'] = '%' . $search . '%';
            $params[':buyer_name_search'] = '%' . $search . '%';
            $params[':buyer_phone_search'] = '%' . $search . '%';
        }
        if (!empty($profile)) {
            $where[] = "EXISTS (SELECT 1 FROM um_sales_invoice_items it WHERE it.invoice_id = inv.id AND it.profile_name = :profile)";
            $params[':profile'] = $profile;
        }
        $whereClause = implode(' AND ', $where);
        // 1. Calculate Summary KPIs
        $sumSql = "
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(inv.total_amount), 0) as total_net,
                COALESCE(SUM(inv.paid_amount), 0) as total_paid,
                COALESCE(SUM(inv.remaining_amount), 0) as total_remaining,
                COALESCE(SUM(inv.discount_amount), 0) as total_discount,
                CASE WHEN SUM(inv.sale_kind='cards' AND inv.cost_amount=0 AND COALESCE(inv.invoice_status,'completed')='completed')>0 THEN NULL ELSE COALESCE(SUM(inv.cost_amount),0) END as total_cost,
                CASE WHEN SUM(inv.sale_kind='cards' AND inv.cost_amount=0 AND COALESCE(inv.invoice_status,'completed')='completed')>0 THEN NULL ELSE COALESCE(SUM(inv.profit_amount),0) END as total_profit,
                COALESCE(SUM(CASE WHEN inv.sale_kind IN ('cards','wallet_distribution') THEN inv.quantity WHEN inv.sale_kind='digital_voucher' THEN 1 ELSE 0 END), 0) as total_qty
            FROM um_sales_invoices inv
            LEFT JOIN um_admins b ON inv.buyer_id = b.id
            WHERE $whereClause
        ";
        $sumStmt = $this->db->prepare($sumSql);
        $sumStmt->execute($params);
        $summary = $sumStmt->fetch(PDO::FETCH_ASSOC);
        $total = (int)($summary['total_count'] ?? 0);
        $summary['total_net'] = (float)($summary['total_net'] ?? 0);
        $summary['total_paid'] = (float)($summary['total_paid'] ?? 0);
        $summary['total_remaining'] = (float)($summary['total_remaining'] ?? 0);
        $summary['total_discount'] = (float)($summary['total_discount'] ?? 0);
        $summary['total_cost'] = $summary['total_cost']===null?null:(float)$summary['total_cost'];
        $summary['total_profit'] = $summary['total_profit']===null?null:(float)$summary['total_profit'];
        $summary['profit_policy']='تكلفة شراء الكروت غير مسجلة؛ سعر التوزيع لا يمثل تكلفة شراء';
        $summary['total_qty'] = (int)($summary['total_qty'] ?? 0);
        $summary['total_count'] = $total;
        // 2. Fetch Invoices with Paging
        $offset = ($page - 1) * $limit;
        $sql = "
            SELECT inv.*, 
                   s.fullname as seller_name, 
                   b.fullname as buyer_name,
                   b.phone as buyer_phone,
                   b.role as buyer_role,
                   r.role_name_ar as buyer_role_ar
            FROM um_sales_invoices inv
            LEFT JOIN um_admins s ON inv.seller_id = s.id
            LEFT JOIN um_admins b ON inv.buyer_id = b.id
            LEFT JOIN um_roles_def r ON b.role = r.role_key
            WHERE $whereClause
            ORDER BY inv.id DESC
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // 3. Fetch items for each invoice
        if (!empty($invoices)) {
            $invIds = array_column($invoices, 'id');
            $inClause = implode(',', array_fill(0, count($invIds), '?'));
            $itemsStmt = $this->db->prepare("SELECT * FROM um_sales_invoice_items WHERE network_id=? AND invoice_id IN ($inClause) ORDER BY id ASC");
            $itemsStmt->execute(array_merge([$this->getActiveNetworkId()],$invIds));
            $allItems = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
            $itemsByInv = [];
            foreach ($allItems as $it) {
                $itemsByInv[$it['invoice_id']][] = $it;
            }
            foreach ($invoices as &$inv) {
                $inv['items'] = $itemsByInv[$inv['id']] ?? [];
                $inv['cost_status']=(($inv['sale_kind']??'cards')==='cards' && (float)$inv['cost_amount']===0.0)?'unknown':'recorded';
                if($inv['cost_status']==='unknown'){$inv['cost_amount']=null;$inv['profit_amount']=null;}
            }
        }
        // 4. Calculate Grouped by Buyer
        $grpBuyerSql = "
            SELECT 
                inv.buyer_id,
                b.fullname as buyer_name,
                b.role as buyer_role,
                r.role_name_ar as buyer_role_ar,
                COUNT(inv.id) as invoices_count,
                COALESCE(SUM(CASE WHEN inv.sale_kind IN ('cards','wallet_distribution') THEN inv.quantity WHEN inv.sale_kind='digital_voucher' THEN 1 ELSE 0 END), 0) as total_qty,
                COALESCE(SUM(inv.total_amount), 0) as total_amount,
                COALESCE(SUM(inv.paid_amount), 0) as total_paid,
                COALESCE(SUM(inv.remaining_amount), 0) as total_remaining
            FROM um_sales_invoices inv
            LEFT JOIN um_admins b ON inv.buyer_id = b.id
            LEFT JOIN um_roles_def r ON b.role = r.role_key
            WHERE $whereClause
            GROUP BY inv.buyer_id, b.fullname, b.role, r.role_name_ar
            ORDER BY total_amount DESC
        ";
        $grpBuyerStmt = $this->db->prepare($grpBuyerSql);
        $grpBuyerStmt->execute($params);
        $groupedByBuyer = $grpBuyerStmt->fetchAll(PDO::FETCH_ASSOC);
        // 5. Calculate Grouped by Profile
        $grpProfSql = "
            SELECT 
                it.profile_name,
                COUNT(DISTINCT inv.id) as invoices_count,
                COALESCE(SUM(it.cards_count), 0) as total_qty,
                COALESCE(SUM(it.sheets_count), 0) as total_sheets,
                COALESCE(SUM(it.net_amount), 0) as total_amount
            FROM um_sales_invoice_items it
            INNER JOIN um_sales_invoices inv ON it.invoice_id = inv.id
            LEFT JOIN um_admins b ON inv.buyer_id = b.id
            WHERE $whereClause
            GROUP BY it.profile_name
            ORDER BY total_amount DESC
        ";
        $grpProfStmt = $this->db->prepare($grpProfSql);
        $grpProfStmt->execute($params);
        $groupedByProfile = $grpProfStmt->fetchAll(PDO::FETCH_ASSOC);
        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => ceil($total / max(1, $limit)),
            'summary' => $summary,
            'grouped_by_buyer' => $groupedByBuyer,
            'grouped_by_profile' => $groupedByProfile,
            'data' => $invoices
        ];
    }

    // ==========================================
    // METHOD: getSalesEligibleAccounts
    // ==========================================
    public function getSalesEligibleAccounts($currentAdminId = null, $userRole = null) {
        $networkId = $this->getActiveNetworkId();
        if ($currentAdminId === null) {
            $ctx = $this->getActiveAdminContext();
            $callerId = (int)$ctx['id'];
            $callerRole = (string)$ctx['role'];
        } else {
            $callerId = (int)$currentAdminId;
            $caller = $this->getAdminById($callerId);
            $callerRole = $userRole ?: ($caller['role'] ?? 'distributor');
        }
        $roles = ['system_owner', 'superadmin', 'distributor', 'pos_agent', 'partner', 'customer', 'retailer'];
        $inRoles = implode(',', array_fill(0, count($roles), '?'));
        $where = ["a.is_active = 1", "nx.network_id = ?", "nx.is_active = 1", "COALESCE(nr.role_key,a.role) IN ($inRoles)"];
        $params = array_merge([$networkId],$roles);
        // Never allow seller to buy from himself
        $where[] = "a.id != ?";
        $params[] = $callerId;
        if (!in_array($callerRole, ['system_owner', 'superadmin', 'admin'], true)) {
            if ($callerRole === 'distributor') {
                $where[] = "(a.parent_id = ? OR a.created_by_admin_id = ?)";
                $params[] = $callerId;
                $params[] = $callerId;
            } elseif ($callerRole === 'pos_agent') {
                $where[] = "a.parent_id = ?";
                $params[] = $callerId;
            }
        }
        $whereClause = implode(' AND ', $where);
        $sql = "SELECT a.id, a.username, a.fullname, COALESCE(nr.role_key,a.role) role, a.parent_id, COALESCE(nb.credit_limit,a.credit_limit,0) credit_limit, a.discount_rate, COALESCE(nb.balance,0) balance, a.max_cards_quota, a.phone, r.role_name_ar 
                FROM um_admins a
                JOIN um_admin_network_access nx ON nx.admin_id=a.id
                LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1
                LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=nx.network_id
                LEFT JOIN um_roles_def r ON COALESCE(nr.role_key,a.role) = r.role_key 
                WHERE $whereClause
                ORDER BY a.role ASC, a.fullname ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return [
            'success' => true,
            'accounts' => $stmt->fetchAll()
        ];
    }

    // ==========================================
    // METHOD: createSaleInvoice
    // ==========================================
    public function createSaleInvoice($data, $currentAdminId = 1) {
        $this->enforcePermission('sales_sell_paper_cards', 'بيع كروت وصفحات ورقية', (int)$currentAdminId);
        $networkId = $this->getActiveNetworkId();
        $buyerId = (int)($data['buyer_id'] ?? 0);
        $paidAmount = (float)($data['paid_amount'] ?? 0);
        $paymentType = $data['payment_type'] ?? 'cash';
        $notes = trim($data['notes'] ?? '');
        $items = $data['items'] ?? [];
        if (!$buyerId) throw new Exception('يجب تحديد المشتري (موزع أو نقطة بيع أو عميل)');
        if ($buyerId === (int)$currentAdminId) {
            throw new Exception('غير مصرح: لا يمكن بيع كروت لنفس الحساب (المشتري والبائع متطابقان)');
        }
        $buyer = $this->getAdminById($buyerId);
        if (!$buyer) throw new Exception('المشتري غير موجود');
        $seller = $this->getAdminById($currentAdminId);
        $sellerDiscountRate = (float)($seller['discount_rate'] ?? 0);
        $isSuper = ($seller && in_array($seller['role'], ['system_owner', 'superadmin'], true));
        // Check if single item passed (backwards compatibility) or multi items
        if (empty($items)) {
            $sheetNos = [];
            if (!empty($data['sheet_numbers'])) {
                $sheetNos = is_array($data['sheet_numbers']) ? $data['sheet_numbers'] : array_map('intval', explode(',', $data['sheet_numbers']));
            }
            $items = [[
                'profile_name' => trim($data['profile_name'] ?? ''),
                'batch_id' => trim($data['batch_id'] ?? ''),
                'sheet_numbers' => $sheetNos,
                'sheets_count' => (int)($data['sheets_count'] ?? count($sheetNos)),
                'quantity' => (int)($data['quantity'] ?? 0),
                'unit_price' => (float)($data['unit_price'] ?? 0),
                'discount_amount' => (float)($data['discount_amount'] ?? 0)
            ]];
        }
        $processedItems = [];
        $allCardsToActivate = [];
        $selectedProfilesCheck = [];
        $totalGross = 0;
        $totalDiscount = 0;
        $totalCardsCount = 0;
        $totalSheetsCount = 0;
        foreach ($items as $item) {
            $pNameCheck = trim($item['profile_name'] ?? '');
            if (!empty($pNameCheck)) {
                if (in_array($pNameCheck, $selectedProfilesCheck, true)) {
                    throw new Exception("تكرار غير مسموح: الباقة ($pNameCheck) مكررة في أكثر من بند في نفس الفاتورة. يرجى دمج الكمية المطلوبة في بند واحد.");
                }
                $selectedProfilesCheck[] = $pNameCheck;
            }
            $pName = trim($item['profile_name'] ?? '');
            if (stripos($pName, 'Free-') === 0 || (float)($item['unit_price'] ?? 0) <= 0) {
                throw new Exception('لا يمكن بيع أو فوترة الكروت المجانية. الكروت المجانية مخصصة للمنح فقط وليست للبيع التجاري.');
            }
            $profCheck = $this->db->prepare("SELECT package_type, price, cost_price FROM um_profiles_def WHERE network_id=? AND name = ?");
            $profCheck->execute([$networkId,$pName]);
            $pDef = $profCheck->fetch(PDO::FETCH_ASSOC);
            if ($pDef && (($pDef['package_type'] ?? '') === 'free' || (float)$pDef['price'] <= 0)) {
                throw new Exception('لا يمكن بيع أو فوترة الكروت المجانية. الكروت المجانية مخصصة للمنح فقط وليست للبيع التجاري.');
            }
            $profile = trim($item['profile_name'] ?? '');
            $batchId = trim($item['batch_id'] ?? '');
            $sheetNos = is_array($item['sheet_numbers'] ?? null) ? $item['sheet_numbers'] : [];
            if (is_string($item['sheet_numbers'] ?? null) && !empty($item['sheet_numbers'])) {
                $sheetNos = array_values(array_filter(array_map('intval', explode(',', $item['sheet_numbers']))));
            }
            $requestedSheetsCount = (int)($item['sheets_count'] ?? count($sheetNos));
            // Auto-allocation of sequential sheets if sheet_numbers is empty but sheets_count is provided
            if (empty($sheetNos) && $requestedSheetsCount > 0 && !empty($profile)) {
                $sSql = "SELECT DISTINCT sheet_no FROM um_vouchers_meta WHERE network_id=? AND is_sold = 0 AND COALESCE(comment,'') NOT LIKE 'استيراد محجور من User Manager%' AND profile_name = ? AND owner_admin_id = ? ORDER BY sheet_no ASC LIMIT ?";
                $sParams = [$networkId,$profile, $currentAdminId, $requestedSheetsCount];
                $sStmt = $this->db->prepare($sSql);
                $sStmt->execute($sParams);
                $sheetNos = $sStmt->fetchAll(PDO::FETCH_COLUMN);
                if (count($sheetNos) < $requestedSheetsCount) {
                    $availCnt = count($sheetNos);
                    throw new Exception("الكمية المطلوبة ($requestedSheetsCount ورقة) غير متوفرة في مخزنك للباقة $profile (المتوفر حالياً: $availCnt ورقة)");
                }
            }
            if (empty($sheetNos)) {
                throw new Exception("يجب تحديد أوراق للبيع في الباقة $profile");
            }
            $vWhere = ["m.network_id=?", "m.is_sold = 0", "COALESCE(m.comment,'') NOT LIKE 'استيراد محجور من User Manager%'", "m.owner_admin_id = ?"];
            $vParams = [$networkId,$currentAdminId];
            $inS = implode(',', array_fill(0, count($sheetNos), '?'));
            $vWhere[] = "m.sheet_no IN ($inS)";
            foreach ($sheetNos as $s) $vParams[] = (int)$s;
            if (!empty($profile)) {
                $vWhere[] = "m.profile_name = ?";
                $vParams[] = $profile;
                if (!empty($batchId)) {
                    $vWhere[] = "m.batch_id = ?";
                    $vParams[] = $batchId;
                }
            }
            $vWhereSql = implode(' AND ', $vWhere);
            $vSql = "SELECT m.id, m.username, m.batch_id, m.profile_name, m.price, m.sheet_no, m.owner_admin_id 
                     FROM um_vouchers_meta m 
                     WHERE $vWhereSql 
                     ORDER BY m.sheet_no ASC, m.id ASC";
            $vStmt = $this->db->prepare($vSql);
            $vStmt->execute($vParams);
            $cards = $vStmt->fetchAll();
            if (empty($cards)) {
                throw new Exception("لم يتم العثور على أوراق/كروت متاحة في مخزنك للباقة: $profile");
            }
            $itemCardsCount = count($cards);
            $itemUnitPrice = (float)((isset($item['unit_price']) && (float)$item['unit_price'] > 0) ? $item['unit_price'] : ($pDef['cost_price'] ?? 0));
            if($itemUnitPrice<=0)throw new DomainException('لم يحدد سعر توزيع لهذه الباقة');
            $itemGross = $itemCardsCount * $itemUnitPrice;
            // Compute discount from rate (percentage), max 5%
        $itemDiscRate = min(5.0, max(0.0, (float)($item['discount_rate'] ?? 0)));
        if ($itemDiscRate <= 0) {
            // Fallback to legacy discount_amount if rate not provided
            $itemDiscount = (float)($item['discount_amount'] ?? 0);
        } else {
            $itemGross = $itemCardsCount * $itemUnitPrice;
            $itemDiscount = round($itemGross * $itemDiscRate / 100, 2);
        }
        $itemDiscountRate = $itemDiscRate;
            if($itemDiscount<0 || $itemDiscount>$itemGross)throw new DomainException('الخصم يجب أن يكون بين صفر وإجمالي سعر التوزيع');
            $itemNet = round($itemGross - $itemDiscount,2);
            $itemSheetNumbers = array_values(array_unique(array_column($cards, 'sheet_no')));
            $sheetsCount = count($itemSheetNumbers);
            $processedItems[] = [
                'profile_name' => $profile ?: ($cards[0]['profile_name'] ?: 'General'),
                'batch_id' => $cards[0]['batch_id'] ?? null,
                'sheets_count' => $sheetsCount,
                'sheet_numbers' => implode(',', $itemSheetNumbers),
                'cards_count' => $itemCardsCount,
                'unit_price' => $itemUnitPrice,
                'gross_amount' => $itemGross,
                'discount_amount' => $itemDiscount,
                'net_amount' => $itemNet,
                'cards' => $cards
            ];
            $totalGross += $itemGross;
            $totalDiscount += $itemDiscount;
            $totalCardsCount += $itemCardsCount;
            $totalSheetsCount += $sheetsCount;
            foreach ($cards as $c) {
                $allCardsToActivate[] = $c;
            }
        }
        // Validate overall discount rate and per-item discount against seller limit
        if (!$isSuper && $sellerDiscountRate >= 0) {
            if ($totalGross > 0) {
                $discountPct = ($totalDiscount / $totalGross) * 100;
                if ($discountPct > ($sellerDiscountRate + 0.05)) {
                    throw new Exception("نسبة الخصم الإجمالية (" . round($discountPct, 1) . "%) تتجاوز الحد الأقصى المسموح لك به (" . round($sellerDiscountRate, 1) . "%)");
                }
            }
            foreach ($processedItems as $pItem) {
                if ($pItem['gross_amount'] > 0 && $pItem['discount_amount'] > 0) {
                    $itemDiscPct = ($pItem['discount_amount'] / $pItem['gross_amount']) * 100;
                    if ($itemDiscPct > ($sellerDiscountRate + 0.05)) {
                        throw new Exception("نسبة الخصم للباقة {$pItem['profile_name']} (" . round($itemDiscPct, 1) . "%) تتجاوز سقف الخصم المسموح لك (" . round($sellerDiscountRate, 1) . "%)");
                    }
                }
            }
        }
        // Check buyer max cards quota
        $buyerMaxQuota = (int)($buyer['max_cards_quota'] ?? 0);
        if ($buyerMaxQuota > 0) {
            $curBuyerCardsStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND owner_admin_id = ? AND is_sold = 0 AND COALESCE(comment,'') NOT LIKE 'استيراد محجور من User Manager%'");
            $curBuyerCardsStmt->execute([$networkId,$buyerId]);
            $curBuyerHolding = (int)$curBuyerCardsStmt->fetchColumn();
            if ($curBuyerHolding + $totalCardsCount > $buyerMaxQuota) {
                throw new Exception("كمية الفاتورة ($totalCardsCount كرت) ستتجاوز سقف حيازة الكروت المحدد للمشتري {$buyer['fullname']} (السقف: $buyerMaxQuota كرت، لديه حالياً: $curBuyerHolding كرت)");
            }
        }
        $totalNet = max(0, $totalGross - $totalDiscount);
        // Auto-normalize paidAmount based on paymentType
        if ($paymentType === 'cash') {
            $paidAmount = $totalNet;
        } else if ($paymentType === 'credit') {
            $paidAmount = 0.0;
        } else {
            $paidAmount = array_key_exists('paid_amount', $data)
                ? min($totalNet, max(0, (float)$paidAmount))
                : round($totalNet / 2, 2);
        }
        $remainingAmount = max(0, $totalNet - $paidAmount);
        // ==========================================
        // STRICT CREDIT LIMIT ENFORCEMENT (سقف الائتمان والمديونية)
        // ==========================================
        if ($remainingAmount > 0 && !in_array($buyer['role'], ['system_owner', 'superadmin'], true)) {
            $buyerCreditLimit = (float)($buyer['credit_limit'] ?? 0);
            $buyerCurBalance = (float)($buyer['balance'] ?? 0);
            // If a credit limit is defined (> 0), strictly enforce it!
            if ($buyerCreditLimit > 0) {
                $projectedDebt = $buyerCurBalance + $remainingAmount;
                if ($projectedDebt > $buyerCreditLimit) {
                    $curDebtFmt = number_format($buyerCurBalance, 2);
                    $limitFmt = number_format($buyerCreditLimit, 2);
                    $remFmt = number_format($remainingAmount, 2);
                    $projDebtFmt = number_format($projectedDebt, 2);
                    $excessFmt = number_format($projectedDebt - $buyerCreditLimit, 2);
                    $maxAllowedCredit = max(0, $buyerCreditLimit - $buyerCurBalance);
                    $allowFmt = number_format($maxAllowedCredit, 2);
                    throw new Exception("⛔ تم رفض العملية: تجاوز السقف الائتماني المحدد للعميل ({$buyer['fullname']})!\n• سقف الائتمان المسموح: {$limitFmt} ر.ي\n• المديونية الحالية: {$curDebtFmt} ر.ي\n• المبلغ الآجل المطلوب: {$remFmt} ر.ي\n• المديونية المتوقعة: {$projDebtFmt} ر.ي (تجاوز بمقدار {$excessFmt} ر.ي)\n• الحد الأقصى المتاح للشراء بالآجل: {$allowFmt} ر.ي. يرجى سداد دفعة نقدية أولاً.");
                }
            }
        }
        $invoiceNo = 'INV-' . date('Ymd') . '-' . rand(1000, 9999);
        $this->db->beginTransaction();
        try {
            // 1. Insert Master Invoice
            $mainProfile = count($processedItems) === 1 ? $processedItems[0]['profile_name'] : 'متعدد الباقات (' . count($processedItems) . ')';
            $mainBatch = count($processedItems) === 1 ? $processedItems[0]['batch_id'] : null;
            $invStmt = $this->db->prepare("
                INSERT INTO um_sales_invoices (network_id,invoice_no, seller_id, buyer_id, batch_id, profile_name, quantity, unit_price, discount_amount, total_amount, paid_amount, remaining_amount, payment_type, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $invStmt->execute([
                $networkId,$invoiceNo, $currentAdminId, $buyerId, $mainBatch, $mainProfile, $totalCardsCount, ($totalCardsCount > 0 ? $totalGross / $totalCardsCount : 0), $totalDiscount, $totalNet, $paidAmount, $remainingAmount, $paymentType, $notes
            ]);
            $invoiceId = (int)$this->db->lastInsertId();
            // 2. Insert Invoice Items
            $itemStmt = $this->db->prepare("
                INSERT INTO um_sales_invoice_items (network_id,invoice_id, profile_name, batch_id, sheets_count, sheet_numbers, cards_count, unit_price, gross_amount, discount_amount, net_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($processedItems as $pItem) {
                $itemStmt->execute([
                    $networkId,$invoiceId, $pItem['profile_name'], $pItem['batch_id'], $pItem['sheets_count'], $pItem['sheet_numbers'], $pItem['cards_count'], $pItem['unit_price'], $pItem['gross_amount'], $pItem['discount_amount'], $pItem['net_amount']
                ]);
            }
            // 3. ACTIVATE CARDS in FreeRADIUS & Update Metadata
            $allUsernames = array_column($allCardsToActivate, 'username');
            $chunkSize = 250;
            for ($c = 0; $c < count($allUsernames); $c += $chunkSize) {
                $slice = array_slice($allUsernames, $c, $chunkSize);
                $inU = implode(',', array_fill(0, count($slice), '?'));
                // Remove Reject in radcheck so cards become active!
                $delReject = $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username IN ($inU) AND attribute = 'Auth-Type' AND value = 'Reject'");
                $delReject->execute(array_merge([$networkId],$slice));
                // All cards sold via a sales invoice are marked as SOLD (is_sold = 1)
                $cardSoldFlag = 1;
                // Update um_vouchers_meta
                $updMeta = $this->db->prepare("
                    UPDATE um_vouchers_meta 
                    SET status = 'active', is_sold = ?, sold_by_admin_id = ?, sold_at = NOW(), owner_admin_id = ?, invoice_id = ?
                    WHERE network_id=? AND username IN ($inU)
                ");
                $updMeta->execute(array_merge([$cardSoldFlag, $currentAdminId, $buyerId, $invoiceId,$networkId], $slice));
            }
            // 4. Update Financial Balances & Cashbox
            if ($remainingAmount > 0) {
                $this->db->prepare("UPDATE um_admin_network_balances SET balance = balance + ? WHERE network_id=? AND admin_id = ?")->execute([$remainingAmount,$networkId,$buyerId]);
            }
            // 5. Insert financial transaction records (Invoice Debit + Cash Payment Credit)
            $txNo = 'TX-' . date('Ymd') . '-' . rand(1000, 9999);
            $payTypeLabel = ($paymentType === 'cash' ? ' [نقداً بالكامل]' : ($paymentType === 'credit' ? ' [آجل بالكامل]' : " [دفعة $paidAmount ومتبقي $remainingAmount]"));
            $txDesc = "فاتورة مبيعات كروت رقم $invoiceNo ($totalCardsCount كرت)$payTypeLabel";
            // A) Master Invoice Debit (قيمة الفاتورة المطلوبة - مدين عليه)
            $insTx = $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no, account_id, tx_type, reference_id, debit, credit, cashbox_impact, payment_method, description, created_by) VALUES (?, ?, ?, 'sale_invoice', ?, ?, 0.00, 0.00, ?, ?, ?)");
            $insTx->execute([$networkId,$txNo, $buyerId, $invoiceNo, $totalNet, $paymentType, $txDesc, $currentAdminId]);
            // B) Cash Payment Credit (السداد النقدي الفوري - دائن له / سداد)
            if ($paidAmount > 0) {
                $voucherNo = 'RV-' . date('Ymd') . '-' . rand(1000, 9999);
                $payDesc = "سداد نقدي مباشر لفاتورة مبيعات رقم $invoiceNo" . ($paymentType === 'cash' ? ' (نقداً بالكامل)' : ' (دفعة مقدمة)');
                // Insert into um_vouchers_financial linked to invoice
                $insVoucher = $this->db->prepare("
                    INSERT INTO um_vouchers_financial (network_id,voucher_no, voucher_type, party_id, party_name, amount, payment_method, category, invoice_id, reference_id, notes, created_by, created_at)
                    VALUES (?, ?, 'receipt', ?, ?, ?, 'cash', 'سداد مبيعات كروت', ?, ?, ?, ?, NOW())
                ");
                $insVoucher->execute([
                    $networkId,$voucherNo, $buyerId, $buyer['fullname'] ?? 'عميل مبيعات', $paidAmount, $invoiceId, $invoiceNo, $payDesc, $currentAdminId
                ]);
                $payTxNo = 'TX-' . date('Ymd') . '-' . rand(1000, 9999);
                $insPayTx = $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no, account_id, tx_type, reference_id, debit, credit, cashbox_impact, payment_method, description, created_by) VALUES (?, ?, ?, 'receipt_voucher', ?, 0.00, ?, ?, 'cash', ?, ?)");
                $insPayTx->execute([$networkId,$payTxNo, $buyerId, $invoiceNo, $paidAmount, $paidAmount, $payDesc, $currentAdminId]);
            }
            // Log sale invoice in um_stock_transfers so all sales appear in movement log
            try {
                $allSheetNos = [];
                foreach ($processedItems as $pItm) {
                    if (!empty($pItm['sheet_numbers'])) {
                        $allSheetNos = array_merge($allSheetNos, explode(',', $pItm['sheet_numbers']));
                    }
                }
                $insSaleLog = $this->db->prepare("
                    INSERT INTO um_stock_transfers 
                    (network_id,transfer_no, transfer_type, sender_admin_id, receiver_admin_id, profile_name, sheets_count, sheet_numbers, cards_count, unit_price, total_value, financial_tx_id, notes)
                    VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $avgPrice = $totalCardsCount > 0 ? ($totalNet / $totalCardsCount) : 0;
                $insSaleLog->execute([
                    $networkId,$invoiceNo,
                    $currentAdminId,
                    $buyerId,
                    $mainProfile,
                    $totalSheetsCount,
                    implode(',', array_unique(array_filter($allSheetNos))),
                    $totalCardsCount,
                    $avgPrice,
                    $totalNet,
                    null,
                    "فاتورة مبيعات كروت" . (!empty($notes) ? ": $notes" : '')
                ]);
            } catch (Throwable $eLog) {}

            $this->postSaleInvoiceJournal((int)$invoiceId,(int)$currentAdminId);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }

        // Auto-grant free vouchers if sales invoice is fully settled (remainingAmount <= 0)
        if ($remainingAmount <= 0.001) {
            try {
                $this->getVoucherService()->processInvoiceFreeVouchersGrant($invoiceId, (int)$currentAdminId);
            } catch (Throwable $eGrant) {
                error_log("processInvoiceFreeVouchersGrant error in createSaleInvoice: " . $eGrant->getMessage());
            }
        }
        // Check low stock alert for each sold profile in seller inventory
        $lowStockAlerts = [];
        foreach ($processedItems as $pItm) {
            $prof = $pItm['profile_name'];
            $remStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND owner_admin_id = ? AND is_sold = 0 AND COALESCE(comment,'') NOT LIKE 'استيراد محجور من User Manager%' AND profile_name = ?");
            $remStmt->execute([$networkId,$currentAdminId, $prof]);
            $remCards = (int)$remStmt->fetchColumn();
            if ($remCards < 50) {
                $lowStockAlerts[] = [
                    'profile_name' => $prof,
                    'remaining_cards' => $remCards
                ];
                $notifMsg = "⚠️ تنبيه نقص مخزون: باقة ($prof) المتبقي منها في مخزنك $remCards كرت فقط. يرجى توليد كروت جديدة لتغذية المخزون.";
                $this->db->prepare("INSERT INTO um_notifications (category, title, message, target_role, target_admin_id, is_read, created_at) VALUES ('voucher', 'تنبيه نقص مخزون الكروت', ?, 'all', ?, 0, NOW())")->execute([$notifMsg, $currentAdminId]);
            }
        }
        // Format WhatsApp Dispatch Message
        $buyerPhone = preg_replace('/[^0-9]/', '', (string)($buyer['phone'] ?? ''));
        if (str_starts_with($buyerPhone, '0')) {
            $buyerPhone = '967' . substr($buyerPhone, 1);
        } elseif (strlen($buyerPhone) === 9 && !str_starts_with($buyerPhone, '967')) {
            $buyerPhone = '967' . $buyerPhone;
        }
        $itemsText = "";
        foreach ($processedItems as $idx => $pItm) {
            $num = $idx + 1;
            $sheetsArr = explode(',', $pItm['sheet_numbers']);
            $firstS = str_pad((string)reset($sheetsArr), 6, '0', STR_PAD_LEFT);
            $lastS = str_pad((string)end($sheetsArr), 6, '0', STR_PAD_LEFT);
            $sheetRangeStr = (count($sheetsArr) > 1) ? "$firstS إلى $lastS" : $firstS;
            $itemsText .= "🔹 *بند $num:* باقة {$pItm['profile_name']}\n";
            $itemsText .= "   • الكمية: {$pItm['sheets_count']} ورقة ({$pItm['cards_count']} كرت)\n";
            $itemsText .= "   • أرقام الأوراق: $sheetRangeStr\n";
            $itemsText .= "   • السعر: " . number_format($pItm['gross_amount'], 2) . " YER\n";
            if ($pItm['discount_amount'] > 0) {
                $itemsText .= "   • الخصم: " . number_format($pItm['discount_amount'], 2) . " YER\n";
            }
        }
        $waMessage = "🧾 *فاتورة مبيعات كروت إنترنت رسمية*\n";
        $waMessage .= "------------------------------------\n";
        $waMessage .= "📋 *رقم الفاتورة:* $invoiceNo\n";
        $waMessage .= "📅 *التاريخ:* " . date('Y-m-d H:i') . "\n";
        $waMessage .= "👤 *العميل:* {$buyer['fullname']}\n";
        $waMessage .= "🏢 *البائع:* {$seller['fullname']}\n";
        $waMessage .= "------------------------------------\n";
        $waMessage .= $itemsText;
        $waMessage .= "------------------------------------\n";
        $waMessage .= "💰 *الإجمالي:* " . number_format($totalGross, 2) . " YER\n";
        if ($totalDiscount > 0) {
            $waMessage .= "🏷️ *الخصم الممنوح:* " . number_format($totalDiscount, 2) . " YER\n";
        }
        $waMessage .= "💵 *الصافي المطلوب:* " . number_format($totalNet, 2) . " YER\n";
        $waMessage .= "✅ *المسدد نقدياً:* " . number_format($paidAmount, 2) . " YER\n";
        if ($remainingAmount > 0) {
            $waMessage .= "🔴 *المتبقي آجل على الحساب:* " . number_format($remainingAmount, 2) . " YER\n";
        }
        $waMessage .= "------------------------------------\n";
        $waMessage .= "⚡ *حالة الكروت:* تم تفعيل كافة الكروت ($totalCardsCount كرت) بنجاح وتعمل الآن فوراً.\n";
        $waMessage .= "🙏 شكراً لتعاملكم معنا!";
        // Auto send to Telegram if configured
        try {
            require_once __DIR__ . '/TelegramService.php';
            $tg = new TelegramService($this->db);
            if (method_exists($tg, 'notifySalesInvoice')) {
                $tg->notifySalesInvoice([
                'invoice_no' => $invoiceNo,
                'buyer_name' => $buyer['fullname'],
                'profile_name' => $mainProfile,
                'quantity' => $totalCardsCount,
                'total_amount' => $totalNet,
                'paid_amount' => $paidAmount,
                'remaining_amount' => $remainingAmount
                ]);
            }
        } catch (Throwable $tge) {
            error_log('Telegram sales notification skipped: ' . $tge->getMessage());
        }
        try {
            $this->getNotificationService()->notifySaleInvoice($invoiceId, $currentAdminId);
        } catch (Throwable $ne) {
            error_log('Sales notification skipped: ' . $ne->getMessage());
        }
        $this->logActivity('sales', 'vouchers', "إصدار فاتورة مبيعات $invoiceNo", "تم بيع $totalCardsCount كرت للعميل {$buyer['fullname']} بقيمة " . number_format($totalNet, 2) . " ر.ي", 'success', $currentAdminId);
        $waUrl = !empty($buyerPhone) ? "https://api.whatsapp.com/send?phone=$buyerPhone&text=" . rawurlencode($waMessage) : "https://api.whatsapp.com/send?text=" . rawurlencode($waMessage);
        return [
            'success' => true,
            'invoice_id' => $invoiceId,
            'invoice_no' => $invoiceNo,
            'buyer_name' => $buyer['fullname'],
            'buyer_phone' => $buyer['phone'] ?? '',
            'seller_name' => $seller['fullname'],
            'total_cards' => $totalCardsCount,
            'total_sheets' => $totalSheetsCount,
            'total_gross' => $totalGross,
            'total_discount' => $totalDiscount,
            'total_amount' => $totalNet,
            'paid_amount' => $paidAmount,
            'remaining_amount' => $remainingAmount,
            'payment_type' => $paymentType,
            'whatsapp_message' => $waMessage,
            'whatsapp_url' => $waUrl,
            'low_stock_alerts' => $lowStockAlerts,
            'message' => "تم إنشاء الفاتورة بنجاح وتفعيل كافة الكروت ($totalCardsCount كرت) للمشتركين"
        ];
    }

    // ==========================================
    // METHOD: deleteSaleInvoice
    // ==========================================
    public function deleteSaleInvoice($id, $isSystemMaintenance = false) {
        $walletGuard=$this->db->prepare("SELECT sale_kind FROM um_sales_invoices WHERE id=? AND network_id=?");$walletGuard->execute([$id,$this->getActiveNetworkId()]);if($walletGuard->fetchColumn()==='wallet_distribution')throw new DomainException('WALLET_INVOICE_USE_REFUND_FLOW');

        if (!$isSystemMaintenance) {
            throw new Exception('حذف الفواتير الفردية محظور لضمان تدقيق الحسابات والنزاهة المالية. يُسمح فقط بتصفير القيود في صيانة النظام');
        }
        $networkId=$this->getActiveNetworkId();
        $this->db->prepare("DELETE FROM um_sales_invoice_items WHERE network_id=? AND invoice_id = ?")->execute([$networkId,(int)$id]);
        $this->db->prepare("DELETE FROM um_sales_invoices WHERE network_id=? AND id = ?")->execute([$networkId,(int)$id]);
        return ['success' => true];
    }
// ==========================================
        // ==========================================
    // FINANCIAL SYSTEM PURGE & FRESH START (تصفير وبدء الحسابات من جديد)
    // ==========================================

    // ==========================================
    // METHOD: getSaleInvoiceDetails
    // ==========================================
    public function getSaleInvoiceDetails($invoiceId) {
        $networkId=$this->getActiveNetworkId();
        $invStmt = $this->db->prepare("
            SELECT inv.*, 
                   s.fullname as seller_name, s.phone as seller_phone,
                   b.fullname as buyer_name, b.phone as buyer_phone, b.role as buyer_role
            FROM um_sales_invoices inv
            LEFT JOIN um_admins s ON inv.seller_id = s.id
            LEFT JOIN um_admins b ON inv.buyer_id = b.id
            WHERE inv.network_id=? AND inv.id = ?
        ");
        $invStmt->execute([$networkId,(int)$invoiceId]);
        $inv = $invStmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) throw new Exception('الفاتورة غير موجودة');
        $itStmt = $this->db->prepare("SELECT * FROM um_sales_invoice_items WHERE network_id=? AND invoice_id = ? ORDER BY id ASC");
        $itStmt->execute([$networkId,(int)$invoiceId]);
        $inv['items'] = $itStmt->fetchAll(PDO::FETCH_ASSOC);
        $returnState = $this->buildSaleReturnOptions($inv, $inv['items']);
        $inv['return_options'] = $returnState['options'];
        $inv['return_unavailable_reason'] = $returnState['reason'];
        $inv['original_total_amount'] = $returnState['original_total_cents'] / 100;
        $inv['original_quantity'] = $returnState['original_quantity'];
        if (!$inv['items'] && $returnState['legacy_items']) {
            $inv['items'] = $returnState['legacy_items'];
        }
        // Attached Vouchers (Receipts for this invoice)
        $vStmt = $this->db->prepare("
            SELECT v.*, a.fullname as creator_name 
            FROM um_vouchers_financial v 
            LEFT JOIN um_admins a ON v.created_by = a.id
            WHERE v.network_id=? AND (v.invoice_id = ? OR (v.reference_id = ? AND v.voucher_type = 'receipt'))
            ORDER BY v.id ASC
        ");
        $vStmt->execute([$networkId,(int)$invoiceId, $inv['invoice_no']]);
        $inv['vouchers'] = $vStmt->fetchAll(PDO::FETCH_ASSOC);
        $inv['cost_status']=(($inv['sale_kind']??'cards')==='cards' && (float)$inv['cost_amount']===0.0)?'unknown':'recorded';
        if($inv['cost_status']==='unknown'){$inv['cost_amount']=null;$inv['profit_amount']=null;}
        return $inv;
    }
    // ==========================================
    // PAY SALE INVOICE (سداد نقدي مباشر لفاتورة مبيعات للمحصل الفعلي)
    // ==========================================

    // ==========================================
    // METHOD: paySaleInvoice
    // ==========================================
    public function paySaleInvoice($data, $currentAdminId = 1) {
        $walletGuard=$this->db->prepare("SELECT sale_kind FROM um_sales_invoices WHERE id=? AND network_id=?");$walletGuard->execute([$data['invoice_id']??0,$this->getActiveNetworkId()]);if($walletGuard->fetchColumn()==='wallet_distribution')throw new DomainException('WALLET_INVOICE_USE_REFUND_FLOW');

        $this->enforcePermission(['sales_invoice_pay','sales'],'سداد فاتورة مبيعات',(int)$currentAdminId);
        $n=$this->getActiveNetworkId();$id=(int)($data['invoice_id']??0);$raw=$data['amount']??0;
        if(!$id||!is_numeric($raw)||!is_finite((float)$raw)||round((float)$raw,2)<=0)throw new DomainException('حدد الفاتورة ومبلغ السداد الصحيح');
        $amount=round((float)$raw,2);$method=(string)($data['payment_method']??'cash');
        if(!in_array($method,['cash','bank','kareemi','onecash','other'],true))throw new DomainException('طريقة السداد غير صحيحة');
        $collector=(int)($data['collector_id']??$currentAdminId);$actor=$this->getAdminById((int)$currentAdminId);
        $super=in_array($actor['role']??'', ['system_owner','superadmin','admin'],true);
        if($collector!==(int)$currentAdminId&&!$super)throw new DomainException('لا تملك تسجيل تحصيل باسم مسؤول آخر');
        $collectorInfo=$this->getAdminById($collector);if(!$collectorInfo)throw new DomainException('المحصل غير تابع للشبكة');
        $own=!$this->db->inTransaction();if($own)$this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT * FROM um_sales_invoices WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$n,$id]);$i=$q->fetch(PDO::FETCH_ASSOC);
            if(!$i||($i['sale_kind']??'cards')!=='cards'||($i['invoice_status']??'completed')!=='completed'||!(int)$i['buyer_id'])throw new DomainException('الفاتورة غير قابلة لتحصيل الكروت');
            if(!$super&&(int)$i['buyer_id']===(int)$currentAdminId)throw new DomainException('لا يمكن للمشتري تسجيل تحصيل من نفسه');
            if($amount>(float)$i['remaining_amount']+0.001||(float)$i['remaining_amount']<=0)throw new DomainException('مبلغ السداد يتجاوز المتبقي');
            $buyer=$this->getAdminById((int)$i['buyer_id']);if(!$buyer)throw new DomainException('طرف الفاتورة غير موجود في الشبكة');
            $q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND is_active=1 AND account_type='asset' AND (account_code LIKE '130%' OR account_code LIKE '1103%') FOR UPDATE");$q->execute([$n,$i['buyer_id']]);$ar=$q->fetchAll(PDO::FETCH_COLUMN);
            if(count($ar)!==1)throw new DomainException('حساب ذمم العميل غير محدد أو مكرر؛ لم يسجل السداد');
            $cash=in_array($method,['bank','kareemi','onecash'],true)?FinancialPostingAccounts::standard($this->db,$n,'1102'):FinancialPostingAccounts::cashForAdmin($this->db,$n,$collector);
            $vno='RV-'.date('Ymd').'-N'.$n.'-'.bin2hex(random_bytes(6));$description=trim((string)($data['notes']??''))?:'تحصيل فاتورة '.$i['invoice_no'];
            $rate=max(0.0001,(float)$i['exchange_rate']);$currency=$i['currency_code']?:'YER_SANAA';$foreign=round($amount/$rate,2);
            $this->db->prepare("INSERT INTO um_vouchers_financial (network_id,voucher_no,voucher_type,source_account_id,destination_account_id,party_id,party_name,amount,payment_method,category,invoice_id,reference_id,notes,created_by,currency_code,exchange_rate,currency_amount) VALUES (?,?,'receipt',?,?,?,?,?,?,'سداد مبيعات كروت',?,?,?,?,?,?,?)")->execute([$n,$vno,$cash,$ar[0],$i['buyer_id'],$buyer['fullname']?:$buyer['username'],$amount,$method,$id,$i['invoice_no'],$description,$collector,$currency,$rate,$foreign]);$vid=(int)$this->db->lastInsertId();
            $this->db->prepare('INSERT IGNORE INTO um_admin_network_balances (network_id,admin_id,balance) VALUES (?,?,0)')->execute([$n,$i['buyer_id']]);
            $q=$this->db->prepare('SELECT balance FROM um_admin_network_balances WHERE network_id=? AND admin_id=? FOR UPDATE');$q->execute([$n,$i['buyer_id']]);$balance=round((float)$q->fetchColumn()-$amount,2);
            $this->db->prepare('UPDATE um_admin_network_balances SET balance=? WHERE network_id=? AND admin_id=?')->execute([$balance,$n,$i['buyer_id']]);
            $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no,account_id,tx_type,reference_id,debit,credit,balance_after,cashbox_impact,payment_method,description,created_by,currency_code,exchange_rate,currency_amount) VALUES (?,?,?,'receipt_voucher',?,0,?,?,?,?,?,?,?,?,?)")->execute([$n,'TX-'.$vno,$i['buyer_id'],$vno,$amount,$balance,$amount,$method,$description,$collector,$currency,$rate,$foreign]);
            $this->createJournalEntry(['entry_date'=>date('Y-m-d'),'source_module'=>'receipt','reference_no'=>$vno,'description'=>$description,'lines'=>[['account_id'=>$cash,'debit'=>$amount,'credit'=>0],['account_id'=>(int)$ar[0],'debit'=>0,'credit'=>$amount]]],$collector);
            $paid=round((float)$i['paid_amount']+$amount,2);$remaining=round((float)$i['remaining_amount']-$amount,2);
            $this->db->prepare('UPDATE um_sales_invoices SET paid_amount=?,remaining_amount=?,payment_type=? WHERE network_id=? AND id=?')->execute([$paid,$remaining,$remaining<=0?'cash':'partial',$n,$id]);
            if((float)$i['currency_total_amount']>0)$this->db->prepare('UPDATE um_sales_invoices SET currency_paid_amount=currency_paid_amount+?,currency_remaining_amount=currency_remaining_amount-? WHERE network_id=? AND id=?')->execute([$foreign,$foreign,$n,$id]);
            if($own)$this->db->commit();
        }catch(Throwable $e){if($own&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
        if($own && $remaining<=0){try{$this->getVoucherService()->processInvoiceFreeVouchersGrant($id,$collector);}catch(Throwable $e){error_log('Invoice settlement grant failed');}}
        if($own){try{$this->getNotificationService()->notifyVoucher($vid,$collector);}catch(Throwable $e){}}
        return ['success'=>true,'message'=>'تم ترحيل السداد وإيداعه في حساب المحصل','voucher_no'=>$vno,'voucher_id'=>$vid,'collector_name'=>$collectorInfo['fullname']?:$collectorInfo['username'],'paid_amount'=>$paid,'remaining_amount'=>$remaining,'is_fully_paid'=>$remaining<=0];
    }

    private function saleReturnCents($value) {
        return (int)round((float)$value * 100, 0, PHP_ROUND_HALF_UP);
    }

    // ==========================================
    // METHOD: saleReturnSheetNumbers
    // ==========================================
    private function saleReturnSheetNumbers($value) {
        if ($value === null || is_string($value) && trim($value) === '') return [];
        if (is_string($value)) $value = preg_split('/[,\s]+/', trim($value));
        if (!is_array($value)) return [];
        $numbers = [];
        foreach ($value as $number) {
            if (!is_scalar($number) || !preg_match('/^[0-9]+$/D', (string)$number) || (int)$number < 1) {
                throw new Exception('أرقام الأوراق يجب أن تكون أعداداً صحيحة موجبة');
            }
            $numbers[(int)$number] = (int)$number;
        }
        sort($numbers, SORT_NUMERIC);
        return array_values($numbers);
    }

    // ==========================================
    // METHOD: buildSaleReturnOptions
    // ==========================================
    private function buildSaleReturnOptions($invoice, $items, $lock = false) {
        $invoiceId = (int)$invoice['id'];
        $networkId = (int)($invoice['network_id'] ?? $this->getActiveNetworkId());
        $historyStmt = $this->db->prepare("SELECT ri.* FROM um_sales_return_items ri JOIN um_sales_returns r ON r.id = ri.return_id AND r.network_id=ri.network_id WHERE r.network_id=? AND r.invoice_id = ? ORDER BY ri.id");
        $historyStmt->execute([$networkId,$invoiceId]);
        $history = $historyStmt->fetchAll(PDO::FETCH_ASSOC);
        $totalsStmt = $this->db->prepare("SELECT COALESCE(SUM(returned_amount),0) amount, COALESCE(SUM(returned_cards_count),0) cards FROM um_sales_returns WHERE network_id=? AND invoice_id = ?");
        $totalsStmt->execute([$networkId,$invoiceId]);
        $totals = $totalsStmt->fetch(PDO::FETCH_ASSOC);
        $originalTotal = $this->saleReturnCents($invoice['total_amount']) + $this->saleReturnCents($totals['amount']);
        $originalQuantity = (int)$invoice['quantity'] + (int)$totals['cards'];
        if (($invoice['sale_kind'] ?? '') === 'instant_balance' || ($items[0]['item_type'] ?? '') === 'instant_balance') {
            $returnedAmount = (float)($totals['amount'] ?? 0);
            $availableAmount = max(0, (float)$invoice['total_amount']);
            $options = [[
                'return_key' => 'item:' . ($items[0]['id'] ?? $invoiceId),
                'invoice_item_id' => $items[0]['id'] ?? 0,
                'item_type' => 'instant_balance',
                'is_instant_balance' => true,
                'profile_name' => 'رصيد شحن فوري',
                'profile_label' => 'رصيد شحن فوري',
                'batch_id' => 'INSTANT',
                'original_amount' => (float)$invoice['total_amount'] + $returnedAmount,
                'returned_amount' => $returnedAmount,
                'available_amount' => $availableAmount,
                'net_unit_price' => 1,
                'effective_unit_price' => 1,
                'effective_net_amount' => (float)$invoice['total_amount'],
                'original_cards_count' => 1,
                'available_cards_count' => 1,
                'available_sheets' => [],
                'selection_version' => hash('sha256', json_encode([$returnedAmount, $availableAmount, $invoiceId]))
            ]];
            return [
                'options' => $options,
                'cards_by_key' => ['item:' . ($items[0]['id'] ?? $invoiceId) => []],
                'reason' => ($availableAmount <= 0 ? 'تم استرجاع كامل رصيد هذه الفاتورة مسبقاً' : ''),
                'original_total_cents' => $originalTotal,
                'original_quantity' => 1,
                'legacy_items' => []
            ];
        }
        $reason = '';
        if ($this->saleReturnCents($invoice['paid_amount']) + $this->saleReturnCents($invoice['remaining_amount']) !== $this->saleReturnCents($invoice['total_amount'])) {
            $reason = 'أرصدة هذه الفاتورة غير متطابقة: المدفوع والمتبقي لا يساويان صافي الفاتورة. يلزم تصحيح التسوية السابقة قبل تسجيل مرتجع جديد.';
        }
        $sql = "SELECT m.id, m.username, m.profile_name, m.batch_id, m.sheet_no, m.is_sold, m.owner_admin_id, m.status, m.first_login,
                    (m.expires_at IS NOT NULL AND m.expires_at <= NOW()) AS has_expired,
                    EXISTS(SELECT 1 FROM radacct a WHERE a.network_id=m.network_id AND a.username = m.username LIMIT 1) AS has_usage
                FROM um_vouchers_meta m WHERE m.network_id=? AND m.invoice_id = ?
                ORDER BY CASE WHEN m.sheet_no IS NULL OR m.sheet_no <= 0 THEN 1 ELSE 0 END, m.sheet_no, m.id";
        if ($lock) $sql .= " FOR UPDATE";
        $cardStmt = $this->db->prepare($sql);
        $cardStmt->execute([$networkId,$invoiceId]);
        $cards = $cardStmt->fetchAll(PDO::FETCH_ASSOC);
        $activeCards = array_values(array_filter($cards, function ($c) { return (int)$c['is_sold'] === 1; }));
        $legacyItems = [];
        if (!$items && $activeCards) {
            $profiles = array_values(array_unique(array_column($activeCards, 'profile_name')));
            if (count($profiles) === 1 && $profiles[0] === $invoice['profile_name'] && $originalQuantity > 0) {
                $sheetNumbers = array_values(array_unique(array_filter(array_map('intval', array_column($activeCards, 'sheet_no')), function ($n) { return $n > 0; })));
                sort($sheetNumbers, SORT_NUMERIC);
                $items = [[
                    'id' => null, 'profile_name' => $profiles[0], 'batch_id' => $invoice['batch_id'],
                    'sheet_numbers' => implode(',', $sheetNumbers), 'sheets_count' => count($sheetNumbers),
                    'cards_count' => $originalQuantity, 'unit_price' => (float)$invoice['unit_price'],
                    'gross_amount' => (float)$invoice['unit_price'] * $originalQuantity,
                    'discount_amount' => max(0, (float)$invoice['unit_price'] * $originalQuantity - $originalTotal / 100),
                    'net_amount' => $originalTotal / 100, 'legacy_reconstructed' => true
                ]];
                $legacyItems = $items;
            } else {
                $reason = $reason ?: 'الفاتورة القديمة بلا تفاصيل باقات كافية لتحديد سعر الكرت الأصلي؛ يلزم مطابقة بنودها قبل الإرجاع.';
            }
        }
        if (!$activeCards && (int)$invoice['quantity'] > 0) {
            $reason = $reason ?: 'لا توجد كروت مرتبطة فعلياً بهذه الفاتورة. لا يمكن تحديد أوراق أو إنشاء مرتجع حتى تتم مطابقة الكروت الأصلية مع الفاتورة.';
        }
        $itemWeights = [];
        $sumWeights = 0;
        foreach ($items as $index => $item) {
            $weight = max(0, $this->saleReturnCents($item['net_amount']));
            $itemWeights[$index] = $weight;
            $sumWeights += $weight;
        }
        if ($items && array_sum(array_map(function ($i) { return (int)$i['cards_count']; }, $items)) !== $originalQuantity) {
            $reason = $reason ?: 'عدد الكروت في بنود الفاتورة لا يطابق أصل الفاتورة ومرتجعاتها السابقة؛ يلزم مطابقة البيانات.';
        }
        if ($originalTotal > 0 && $sumWeights <= 0) {
            $reason = $reason ?: 'قيم بنود الفاتورة الأصلية لا تسمح بحساب الخصم وسعر المرتجع بصورة صحيحة.';
        }
        $options = [];
        $cardsByKey = [];
        $memberships = [];
        $allocated = 0;
        $cumulativeWeight = 0;
        foreach ($items as $index => $item) {
            $key = !empty($item['id']) ? 'item:' . (int)$item['id'] : 'legacy:' . substr(hash('sha256', $invoiceId . '|' . $item['profile_name']), 0, 20);
            $cumulativeWeight += $itemWeights[$index];
            $targetAllocation = $sumWeights > 0 ? (int)round($originalTotal * $cumulativeWeight / $sumWeights) : 0;
            $netCents = $targetAllocation - $allocated;
            $allocated = $targetAllocation;
            $returnedCount = 0;
            $returnedCents = 0;
            foreach ($history as $old) {
                $matches = !empty($item['id']) ? (int)$old['invoice_item_id'] === (int)$item['id']
                    : empty($old['invoice_item_id']) && $old['profile_name'] === $item['profile_name'];
                if ($matches) {
                    $returnedCount += (int)$old['cards_count'];
                    $returnedCents += $this->saleReturnCents($old['return_amount']);
                }
            }
            $quantity = (int)$item['cards_count'];
            if ($quantity <= 0 || $returnedCount > $quantity || $returnedCents > $netCents ||
                ($quantity > 0 && abs($returnedCents - (int)round($netCents * $returnedCount / $quantity)) > 1)) {
                $reason = $reason ?: 'تفاصيل المرتجعات السابقة لا تطابق كمية أو سعر الفاتورة الأصلي بعد الخصم؛ يلزم مطابقتها قبل مرتجع جديد.';
            }
            $sheetNumbers = $this->saleReturnSheetNumbers($item['sheet_numbers'] ?? '');
            $memberships[$key] = ['profile_name' => $item['profile_name'], 'batch_id' => $item['batch_id'], 'sheets' => $sheetNumbers, 'legacy' => empty($item['id'])];
            $options[$key] = [
                'return_key' => $key, 'invoice_item_id' => !empty($item['id']) ? (int)$item['id'] : null,
                'profile_name' => $item['profile_name'], 'batch_id' => $item['batch_id'],
                'original_cards_count' => $quantity, 'returned_cards_count' => $returnedCount,
                'available_cards_count' => 0, 'blocked_cards_count' => 0, 'unnumbered_cards_count' => 0,
                'unit_price' => (float)$item['unit_price'],
                'net_unit_price' => $quantity > 0 ? $netCents / 100 / $quantity : 0,
                'effective_unit_price' => $quantity > 0 ? $netCents / 100 / $quantity : 0,
                'effective_net_amount' => $netCents / 100, 'returned_amount' => $returnedCents / 100,
                'available_amount' => 0, 'available_sheets' => []
            ];
            $cardsByKey[$key] = [];
        }
        foreach ($activeCards as $card) {
            $matches = [];
            foreach ($memberships as $key => $membership) {
                if ($card['profile_name'] !== $membership['profile_name']) continue;
                if (!$membership['legacy'] && $membership['sheets'] && !in_array((int)$card['sheet_no'], $membership['sheets'], true)) continue;
                $matches[] = $key;
            }
            if (count($matches) > 1) {
                $matches = array_values(array_filter($matches, function ($key) use ($memberships, $card) {
                    return (string)$memberships[$key]['batch_id'] === (string)$card['batch_id'];
                }));
            }
            if (count($matches) !== 1) {
                $reason = $reason ?: 'يوجد تداخل أو نقص في ربط الكروت ببنود الفاتورة؛ يلزم مطابقة الأوراق والباقات قبل الإرجاع.';
                continue;
            }
            $key = $matches[0];
            $used = (int)$card['has_usage'] > 0 || (int)$card['has_expired'] > 0 || !empty($card['first_login']) && $card['first_login'] !== '0000-00-00 00:00:00'
                || in_array($card['status'], ['used', 'expired'], true);
            $eligible = !$used && (int)$card['owner_admin_id'] === (int)$invoice['buyer_id'];
            $sheetNo = (int)$card['sheet_no'];
            if ($sheetNo > 0) {
                if (!isset($options[$key]['available_sheets'][$sheetNo])) {
                    $options[$key]['available_sheets'][$sheetNo] = ['sheet_no' => $sheetNo, 'cards_count' => 0, 'available_cards_count' => 0, 'blocked_cards_count' => 0, 'can_return_whole_sheet' => true];
                }
                $page =& $options[$key]['available_sheets'][$sheetNo];
                $page['cards_count']++;
                $page[$eligible ? 'available_cards_count' : 'blocked_cards_count']++;
                $page['can_return_whole_sheet'] = $page['blocked_cards_count'] === 0;
                unset($page);
            } elseif ($eligible) {
                $options[$key]['unnumbered_cards_count']++;
            }
            $options[$key][$eligible ? 'available_cards_count' : 'blocked_cards_count']++;
            if ($eligible) $cardsByKey[$key][] = $card;
        }
        foreach ($options as $key => &$option) {
            $option['available_sheets'] = array_values($option['available_sheets']);
            if ($option['available_cards_count'] + $option['returned_cards_count'] > $option['original_cards_count']) {
                $reason = $reason ?: 'الكروت المرتبطة تتجاوز الكمية الأصلية بعد احتساب المرتجعات؛ يلزم مطابقة البيانات.';
            }
            $option['available_amount'] = $this->saleReturnOptionAmount($option, $option['available_cards_count']) / 100;
            $option['selection_version'] = hash('sha256', json_encode([
                $option['returned_cards_count'], $option['returned_amount'], $option['effective_net_amount'],
                array_column($cardsByKey[$key], 'id')
            ]));
        }
        unset($option);
        return [
            'options' => array_values($options), 'cards_by_key' => $cardsByKey, 'reason' => $reason,
            'original_total_cents' => $originalTotal, 'original_quantity' => $originalQuantity, 'legacy_items' => $legacyItems
        ];
    }

    // ==========================================
    // METHOD: saleReturnOptionAmount
    // ==========================================
    private function saleReturnOptionAmount($option, $count) {
        if ((int)$option['original_cards_count'] <= 0 || $count <= 0) return 0;
        $net = $this->saleReturnCents($option['effective_net_amount']);
        $oldAmount = $this->saleReturnCents($option['returned_amount']);
        $target = (int)round($net * ((int)$option['returned_cards_count'] + $count) / (int)$option['original_cards_count']);
        return max(0, min($net - $oldAmount, $target - $oldAmount));
    }

    // ==========================================
    // METHOD: returnSaleInvoice
    // ==========================================
    public function returnSaleInvoice($data, $currentAdminId = 1) {
        $walletGuard=$this->db->prepare("SELECT sale_kind FROM um_sales_invoices WHERE id=? AND network_id=?");$walletGuard->execute([$data['invoice_id']??0,$this->getActiveNetworkId()]);if($walletGuard->fetchColumn()==='wallet_distribution')throw new DomainException('WALLET_INVOICE_USE_REFUND_FLOW');

        $this->enforcePermission(["sales_invoice_return", "sales"], "مرتجع فاتورة مبيعات", (int)$currentAdminId);
        $networkId=$this->getActiveNetworkId();
        $invoiceId = (int)($data['invoice_id'] ?? 0);
        $refundMethod = (string)($data['refund_method'] ?? 'deduct_debt');
        $reason = trim((string)($data['reason'] ?? ''));
        $requestedItems = $data['items'] ?? [];
        if (!$invoiceId || !$reason || !is_array($requestedItems) || !$requestedItems) {
            throw new Exception('حدد الفاتورة والكروت أو أرقام الأوراق وأدخل سبب الإرجاع');
        }
        if (!in_array($refundMethod, ['deduct_debt', 'cash_refund', 'credit_balance'], true)) {
            throw new Exception('طريقة تسوية المرتجع غير صحيحة');
        }
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("SELECT * FROM um_sales_invoices WHERE network_id=? AND id = ? FOR UPDATE");
            $stmt->execute([$networkId,$invoiceId]);
            $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$invoice) throw new Exception('الفاتورة غير موجودة');
            $caller = $this->getAdminById((int)$currentAdminId);
            $isSuper = ($caller && in_array($caller['role'], ['system_owner', 'superadmin', 'admin'], true));
            if (!$isSuper && (int)$invoice['seller_id'] !== (int)$currentAdminId) {
                throw new Exception('غير مصرح: لا يمكن إرجاع فاتورة مشتريات. طلبات الإرجاع يقوم بها البائع أو الإدارة العامة');
            }
            $stmt = $this->db->prepare("SELECT * FROM um_sales_invoice_items WHERE network_id=? AND invoice_id = ? ORDER BY id FOR UPDATE");
            $stmt->execute([$networkId,$invoiceId]);
            $state = $this->buildSaleReturnOptions($invoice, $stmt->fetchAll(PDO::FETCH_ASSOC), true);
            if ($state['reason']) throw new Exception($state['reason']);
            $options = [];
            foreach ($state['options'] as $option) $options[$option['return_key']] = $option;
            $selectedKeys = [];
            $selectedIds = [];
            $processedItems = [];
            $totalCards = 0;
            $totalSheets = 0;
            $totalCents = 0;
            if (($invoice['sale_kind'] ?? '') === 'instant_balance') {
                $reqFirst = $requestedItems[0] ?? [];
                $returnAmount = round((float)($reqFirst['return_amount'] ?? ($reqFirst['amount'] ?? $invoice['total_amount'])), 2);
                if ($returnAmount <= 0) throw new Exception('حدد مبلغ الاسترجاع المطلوب للرصيد');
                $availMax = (float)$invoice['total_amount'];
                if ($returnAmount > $availMax + 0.001) throw new Exception('المبلغ المسترجع يتجاوز صافي الفاتورة المتبقي (' . number_format($availMax, 2) . ' YER)');
                $amountCents = $this->saleReturnCents($returnAmount);
                $totalCents = $amountCents;
                $totalCards = 0;
                $totalSheets = 0;
                // Lot restoration
                $costPortion = 0;
                if ((float)$invoice['total_amount'] > 0 && (float)$invoice['cost_amount'] > 0) {
                    $costPortion = round((float)$invoice['cost_amount'] * ($returnAmount / (float)$invoice['total_amount']), 2);
                }
                // Restore seller lot
                $parts = $this->db->prepare("SELECT * FROM um_instant_balance_consumptions WHERE network_id=? AND reference_no = ? FOR UPDATE");
                $parts->execute([$networkId,$invoice['invoice_no']]);
                $consumed = $parts->fetchAll(PDO::FETCH_ASSOC);
                $leftToRestore = $returnAmount;
                $leftCostToRestore = $costPortion;
                foreach ($consumed as $c) {
                    if ($leftToRestore <= 0) break;
                    $rAmt = min($leftToRestore, (float)$c['amount']);
                    $rCost = min($leftCostToRestore, (float)$c['cost_amount']);
                    $this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount = remaining_amount + ?, remaining_cost = remaining_cost + ?, status = 'active' WHERE network_id=? AND id = ?")
                        ->execute([$rAmt, $rCost,$networkId, $c['lot_id']]);
                    $leftToRestore -= $rAmt;
                    $leftCostToRestore -= $rCost;
                }
                // Deduct from buyer lot if exists
                if (!empty($invoice['buyer_id'])) {
                    $this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount = GREATEST(0, remaining_amount - ?), remaining_cost = GREATEST(0, remaining_cost - ?) WHERE network_id=? AND invoice_id = ? AND owner_admin_id = ?")
                        ->execute([$returnAmount, $costPortion,$networkId, $invoiceId, (int)$invoice['buyer_id']]);
                }
                $processedItems[] = [
                    'invoice_item_id' => $items[0]['id'] ?? null,
                    'profile_name' => 'رصيد شحن فوري',
                    'batch_id' => 'INSTANT',
                    'sheet_numbers' => [],
                    'sheet_card_counts' => [],
                    'sheets_count' => 0,
                    'cards_count' => 0,
                    'unit_price' => 1,
                    'return_amount' => $returnAmount,
                    'card_ids' => [],
                    '_cards' => []
                ];
            } else {
            foreach ($requestedItems as $requested) {
                $key = (string)($requested['return_key'] ?? '');
                if (!$key && !empty($requested['invoice_item_id'])) $key = 'item:' . (int)$requested['invoice_item_id'];
                if (!isset($options[$key]) || isset($selectedKeys[$key])) {
                    throw new Exception('بند المرتجع غير تابع لهذه الفاتورة أو تم اختياره أكثر من مرة');
                }
                $selectedKeys[$key] = true;
                $option = $options[$key];
                if (isset($requested['selection_version']) && !hash_equals($option['selection_version'], (string)$requested['selection_version'])) {
                    throw new Exception('تغير رصيد الكروت أو سُجل مرتجع لهذه الفاتورة منذ فتحها؛ حدّث بيانات الفاتورة قبل اعتماد مرتجع جديد');
                }
                if (!empty($requested['invoice_item_id']) && (int)$requested['invoice_item_id'] !== (int)$option['invoice_item_id']) {
                    throw new Exception('رقم بند المرتجع لا يطابق الفاتورة');
                }
                $mode = (string)($requested['mode'] ?? 'sheets');
                if (!in_array($mode, ['sheets', 'cards'], true)) throw new Exception('حدد الإرجاع بالأوراق أو بعدد الكروت');
                $sheetNumbers = $this->saleReturnSheetNumbers($requested['sheet_numbers'] ?? []);
                $available = $state['cards_by_key'][$key];
                if ($sheetNumbers) {
                    $pages = [];
                    foreach ($option['available_sheets'] as $page) $pages[$page['sheet_no']] = $page;
                    foreach ($sheetNumbers as $number) {
                        if (!isset($pages[$number]) || !$pages[$number]['available_cards_count'] ||
                            ($mode === 'sheets' && !$pages[$number]['can_return_whole_sheet'])) {
                            throw new Exception("الورقة رقم $number غير متاحة بالكامل لهذه الفاتورة؛ حدّث البيانات أو استخدم الإرجاع بعدد الكروت غير المستخدمة");
                        }
                    }
                    $available = array_values(array_filter($available, function ($c) use ($sheetNumbers) { return in_array((int)$c['sheet_no'], $sheetNumbers, true); }));
                } elseif ($mode === 'sheets') {
                    throw new Exception('حدد أرقام الأوراق المراد إرجاعها');
                }
                if ($mode === 'cards') {
                    $count = $requested['cards_count'] ?? 0;
                    if (!is_scalar($count) || !preg_match('/^[1-9][0-9]*$/D', (string)$count) || (int)$count > count($available)) {
                        throw new Exception('عدد الكروت المطلوب يتجاوز المتاح غير المستخدم أو ليس عدداً صحيحاً موجباً');
                    }
                    $available = array_slice($available, 0, (int)$count);
                }
                if (!$available) throw new Exception('لا توجد كروت متاحة للإرجاع في البند المحدد');
                $sheetCounts = [];
                $cardIds = [];
                foreach ($available as $card) {
                    $cardId = (int)$card['id'];
                    if (isset($selectedIds[$cardId])) throw new Exception('لا يمكن إرجاع الكرت نفسه ضمن أكثر من بند');
                    $selectedIds[$cardId] = true;
                    $cardIds[] = $cardId;
                    $sheet = (int)$card['sheet_no'];
                    $sheetCounts[$sheet] = ($sheetCounts[$sheet] ?? 0) + 1;
                }
                $actualSheets = array_values(array_filter(array_map('intval', array_keys($sheetCounts)), function ($n) { return $n > 0; }));
                sort($actualSheets, SORT_NUMERIC);
                $amountCents = $this->saleReturnOptionAmount($option, count($available));
                $processedItems[] = [
                    'invoice_item_id' => $option['invoice_item_id'], 'profile_name' => $option['profile_name'], 'batch_id' => $option['batch_id'],
                    'sheet_numbers' => $actualSheets, 'sheet_card_counts' => $sheetCounts, 'sheets_count' => count($actualSheets),
                    'cards_count' => count($available), 'unit_price' => $option['effective_unit_price'],
                    'return_amount' => $amountCents / 100, 'card_ids' => $cardIds, '_cards' => $available
                ];
                $totalCards += count($available);
                $totalSheets += count($actualSheets);
                $totalCents += $amountCents;
            }
            }
            $oldTotal = $this->saleReturnCents($invoice['total_amount']);
            $oldPaid = $this->saleReturnCents($invoice['paid_amount']);
            $oldRemaining = $this->saleReturnCents($invoice['remaining_amount']);
            if ($totalCards > (int)$invoice['quantity'] || $totalCents > $oldTotal) throw new Exception('المرتجع يتجاوز الرصيد المتبقي من الفاتورة');
            if ($refundMethod === 'deduct_debt' && $totalCents > $oldRemaining) throw new Exception('مبلغ المرتجع يتجاوز المتبقي الآجل؛ اختر رصيداً دائناً أو تسوية نقدية مناسبة');
            if ($refundMethod === 'cash_refund' && $totalCents > $oldPaid) throw new Exception('الاسترداد النقدي لا يمكن أن يتجاوز المبلغ المسدد؛ اختر تسوية الرصيد');
            $debtReduction = $refundMethod === 'cash_refund' ? 0 : min($oldRemaining, $totalCents);
            $paidReduction = $totalCents - $debtReduction;
            $newPaid = $oldPaid - $paidReduction;
            $newRemaining = $oldRemaining - $debtReduction;
            $newTotal = $oldTotal - $totalCents;
            if ($newPaid < 0 || $newRemaining < 0 || $newPaid + $newRemaining !== $newTotal) throw new Exception('تعذر مطابقة تسوية الفاتورة بعد المرتجع');
            $buyerId = (int)$invoice['buyer_id'];
            $sellerId = (int)$invoice['seller_id'];
            $buyer = $this->getAdminById($buyerId);
            if (!$buyer) throw new Exception('حساب مشتري الفاتورة غير موجود');
            $returnNo = 'RET-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $amount = $totalCents / 100;
            $stmt = $this->db->prepare("INSERT INTO um_sales_returns (network_id,return_no,invoice_id,invoice_no,seller_id,buyer_id,returned_cards_count,returned_sheets_count,returned_amount,refund_method,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())");
            $stmt->execute([$networkId,$returnNo,$invoiceId,$invoice['invoice_no'],$sellerId,$buyerId,$totalCards,$totalSheets,$amount,$refundMethod,$reason,$currentAdminId]);
            $returnId = (int)$this->db->lastInsertId();
            $itemStmt = $this->db->prepare("INSERT INTO um_sales_return_items (network_id,return_id,invoice_item_id,profile_name,batch_id,sheet_numbers,sheets_count,cards_count,unit_price,return_amount,card_ids,sheet_card_counts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
            foreach ($processedItems as $item) {
                $itemStmt->execute([$networkId,$returnId,$item['invoice_item_id'],$item['profile_name'],$item['batch_id'],implode(',',$item['sheet_numbers']),$item['sheets_count'],$item['cards_count'],$item['unit_price'],$item['return_amount'],json_encode($item['card_ids']),json_encode($item['sheet_card_counts'], JSON_FORCE_OBJECT)]);
                foreach (array_chunk($item['_cards'], 250) as $chunk) {
                    $ids = array_column($chunk, 'id');
                    $names = array_column($chunk, 'username');
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $update = $this->db->prepare("UPDATE um_vouchers_meta SET is_sold=0, owner_admin_id=?, sold_at=NULL, sold_by_admin_id=NULL, invoice_id=NULL, sale_price=NULL, status='disabled' WHERE network_id=? AND id IN ($placeholders) AND invoice_id=? AND owner_admin_id=? AND is_sold=1");
                    $update->execute(array_merge([$sellerId,$networkId], $ids, [$invoiceId,$buyerId]));
                    if ($update->rowCount() !== count($ids)) throw new Exception('تغيرت ملكية بعض الكروت أثناء العملية؛ حدّث البيانات وأعد المحاولة');
                    $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username IN ($placeholders) AND attribute='Auth-Type'")->execute(array_merge([$networkId],$names));
                    $reject = $this->db->prepare("INSERT INTO radcheck (network_id,username,attribute,op,value) VALUES (?, ?, 'Auth-Type', ':=', 'Reject')");
                    foreach ($names as $name) $reject->execute([$networkId,$name]);
                }
            }
            $paymentType = $newRemaining === 0 ? 'cash' : ($newPaid > 0 ? 'partial' : 'credit');
            $this->db->prepare("UPDATE um_sales_invoices SET quantity=?,total_amount=?,paid_amount=?,remaining_amount=?,payment_type=? WHERE network_id=? AND id=?")
                ->execute([(int)$invoice['quantity']-$totalCards,$newTotal/100,$newPaid/100,$newRemaining/100,$paymentType,$networkId,$invoiceId]);
            if ($refundMethod !== 'cash_refund') {
                $this->db->prepare("UPDATE um_admin_network_balances SET balance=balance-? WHERE network_id=? AND admin_id=?")->execute([$amount,$networkId,$buyerId]);
            }
            try {
                $allReturnSheets = [];
                foreach ($processedItems as $pItm) {
                    if (!empty($pItm['sheet_numbers'])) {
                        $allReturnSheets = array_merge($allReturnSheets, is_array($pItm['sheet_numbers']) ? $pItm['sheet_numbers'] : explode(',', $pItm['sheet_numbers']));
                    }
                }
                $insReturnLog = $this->db->prepare("
                    INSERT INTO um_stock_transfers 
                    (network_id,transfer_no, transfer_type, sender_admin_id, receiver_admin_id, profile_name, sheets_count, sheet_numbers, cards_count, unit_price, total_value, financial_tx_id, notes)
                    VALUES (?, ?, 'sale_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $mainProf = $processedItems[0]['profile_name'] ?? 'كروت متنوعة';
                $insReturnLog->execute([
                    $networkId,$returnNo,
                    $buyerId ?: null,
                    $sellerId ?: null,
                    $mainProf,
                    $totalSheets,
                    implode(',', array_unique(array_filter($allReturnSheets))),
                    $totalCards,
                    $totalCards > 0 ? ($amount / $totalCards) : 0,
                    $amount,
                    null,
                    "مرتجع فاتورة مبيعات #{$invoice['invoice_no']}" . ($reason ? ": $reason" : '')
                ]);
            } catch (Throwable $eLog) {}

            $description = "مرتجع مبيعات رقم $returnNo لفاتورة {$invoice['invoice_no']}";
            $txStmt = $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no,account_id,tx_type,reference_id,debit,credit,cashbox_impact,payment_method,description,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
            $txStmt->execute([$networkId,'TX-'.$returnNo,$buyerId,'adjustment',$returnNo,0,$amount,0,$refundMethod,$description,$currentAdminId]);
            if ($refundMethod === 'cash_refund' && $totalCents > 0) {
                $txStmt->execute([$networkId,'TX-CASH-'.$returnNo,$buyerId,'payment_voucher',$returnNo,$amount,0,-$amount,'cash',"استرداد نقدي: $description",$currentAdminId]);
                $this->db->prepare("INSERT INTO um_vouchers_financial (network_id,voucher_no,voucher_type,party_id,party_name,amount,payment_method,category,invoice_id,reference_id,notes,created_by,created_at) VALUES (?,?,'payment',?,?,?,'cash','مرتجع مبيعات',?,?,?,?,NOW())")
                    ->execute([$networkId,'PV-'.$returnNo,$buyerId,$buyer['fullname'] ?: $buyer['username'],$amount,$invoiceId,$returnNo,$description,$currentAdminId]);
            }
            if ($totalCents > 0) {
                $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('4102','4101') ORDER BY CASE WHEN account_code='4102' THEN 0 ELSE 1 END LIMIT 1");$aq->execute([$networkId]);$debitAccount=(int)$aq->fetchColumn();
                if ($refundMethod === 'cash_refund') {
                    $accountStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? LIMIT 1");
                    $accountStmt->execute([$networkId,(int)$currentAdminId]);
                    $creditAccount = (int)$accountStmt->fetchColumn();
                    if (!$creditAccount) {$accountStmt=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='1101' LIMIT 1");$accountStmt->execute([$networkId]);$creditAccount=(int)$accountStmt->fetchColumn();}
                } else {
                    $creditAccount = 0;
                    if (!$creditAccount) {
                        $accountStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? LIMIT 1");
                        $accountStmt->execute([$networkId,$buyerId]);
                        $creditAccount = (int)$accountStmt->fetchColumn();
                    }
                    if (!$creditAccount) {$accountStmt=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='1301' LIMIT 1");$accountStmt->execute([$networkId]);$creditAccount=(int)$accountStmt->fetchColumn();}
                }
                if (!$debitAccount || !$creditAccount) throw new Exception('حساب المردودات أو حساب تسوية العميل/الصندوق غير معرف في دليل الحسابات');
                $this->db->prepare("INSERT INTO um_journal_entries (network_id,entry_no,entry_date,source_module,reference_no,description,total_debit,total_credit,is_posted,created_by,created_at) VALUES (?,?,CURDATE(),'sales',?,?,?,?,1,?,NOW())")
                    ->execute([$networkId,'JV-'.$returnNo,$returnNo,$description,$amount,$amount,$currentAdminId]);
                $entryId = (int)$this->db->lastInsertId();
                $lineStmt = $this->db->prepare("INSERT INTO um_journal_entry_lines (journal_entry_id,account_id,debit,credit,line_description,line_index) VALUES (?,?,?,?,?,?)");
                $lineStmt->execute([$entryId,$debitAccount,$amount,0,$description,1]);
                $lineStmt->execute([$entryId,$creditAccount,0,$amount,$description,2]);
            }
            $this->db->prepare("INSERT INTO um_notifications (category,title,message,target_role,target_admin_id,is_read,created_at) VALUES ('alert',?,?,'all',0,0,NOW())")
                ->execute(["تسجيل مرتجع مبيعات [$returnNo]","تم إرجاع $totalCards كرت من $totalSheets ورقة بقيمة ".number_format($amount,2)." ر.ي. السبب: $reason"]);
            $this->db->commit();
            foreach ($processedItems as &$item) unset($item['_cards'], $item['card_ids']);
            unset($item);
            return [
                'success'=>true,'message'=>"تم تسجيل المرتجع [$returnNo] وإعادة الكروت المحددة إلى المخزن",
                'return_no'=>$returnNo,'return_id'=>$returnId,'returned_cards'=>$totalCards,'returned_sheets'=>$totalSheets,
                'returned_amount'=>$amount,'items'=>$processedItems,'debt_reduction'=>$debtReduction/100,
                'cash_refund'=>$refundMethod==='cash_refund' ? $amount : 0,
                'credit_balance'=>$refundMethod==='credit_balance' ? $paidReduction/100 : 0
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: getSalesReturns
    // ==========================================
    public function getSalesReturns($filters = []) {
        $networkId=$this->getActiveNetworkId();
        $invoiceId = !empty($filters['invoice_id']) ? (int)$filters['invoice_id'] : null;
        $buyerId = !empty($filters['buyer_id']) ? (int)$filters['buyer_id'] : null;
        $where = ["r.network_id=?"];
        $params = [$networkId];
        if ($invoiceId) {
            $where[] = "r.invoice_id = ?";
            $params[] = $invoiceId;
        }
        if ($buyerId) {
            $where[] = "r.buyer_id = ?";
            $params[] = $buyerId;
        }
        $whereClause = implode(' AND ', $where);
        $sql = "
            SELECT r.*, 
                   b.fullname as buyer_name, b.username as buyer_username,
                   s.fullname as seller_name,
                   c.fullname as creator_name
            FROM um_sales_returns r
            LEFT JOIN um_admins b ON r.buyer_id = b.id
            LEFT JOIN um_admins s ON r.seller_id = s.id
            LEFT JOIN um_admins c ON r.created_by = c.id
            WHERE $whereClause
            ORDER BY r.id DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $returns = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($returns as &$ret) {
            $itStmt = $this->db->prepare("SELECT * FROM um_sales_return_items WHERE network_id=? AND return_id = ?");
            $itStmt->execute([$networkId,(int)$ret['id']]);
            $ret['items'] = $itStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($ret['items'] as &$item) {
                $item['sheet_card_counts'] = json_decode($item['sheet_card_counts'] ?? '{}', true) ?: [];
                unset($item['card_ids']);
            }
            unset($item);
        }
        return $returns;
    }
    // ==========================================
    // CHATBOT & INTERACTIVE AUTO-RESPONDER
    // ==========================================

    // ==========================================
    // METHOD: resetFinancialSystem
    // ==========================================
    public function resetFinancialSystem($options = [], $currentAdminId = 1) {
        $this->enforceOwnerOnly('تصفير النظام المالي للشبكة النشطة',(int)$currentAdminId);
        $networkId=$this->getActiveNetworkId();
        // 1. Always create automatic backup before reset
        $backupRes = $this->createDatabaseBackup();
        $backupName = $backupRes['filename'] ?? 'auto_backup.sql.gz';
        try {
            // 2. Clear Sales Invoices & Items
            $this->db->prepare("DELETE FROM um_sales_return_items WHERE network_id=?")->execute([$networkId]);
            $this->db->prepare("DELETE FROM um_sales_returns WHERE network_id=?")->execute([$networkId]);
            $this->db->prepare("DELETE FROM um_sales_invoice_items WHERE network_id=?")->execute([$networkId]);
            $this->db->prepare("DELETE FROM um_sales_invoices WHERE network_id=?")->execute([$networkId]);
            // 3. Clear Financial Vouchers & Transactions (Cashbox, Receipts, Payments)
            $this->db->prepare("DELETE FROM um_vouchers_financial WHERE network_id=?")->execute([$networkId]);
            $this->db->prepare("DELETE FROM um_financial_transactions WHERE network_id=?")->execute([$networkId]);
            // 4. Clear Accounting Journal Entries & Ledger
            $this->db->prepare("DELETE FROM um_journal_entry_lines WHERE network_id=?")->execute([$networkId]);
            $this->db->prepare("DELETE FROM um_journal_entries WHERE network_id=?")->execute([$networkId]);
            // 5. Clear Stock Transfers & Salaries & Profits
            if ($this->tableExists('um_stock_transfer_items')) {
                $this->db->prepare("DELETE i FROM um_stock_transfer_items i JOIN um_stock_transfers t ON t.id=i.transfer_id WHERE t.network_id=?")->execute([$networkId]);
            }
            if ($this->tableExists('um_stock_transfers')) {
                $this->db->prepare("DELETE FROM um_stock_transfers WHERE network_id=?")->execute([$networkId]);
            }
            if ($this->tableExists('um_salary_payments')) {
                $this->db->prepare("DELETE FROM um_salary_payments WHERE network_id=?")->execute([$networkId]);
            }
            if ($this->tableExists('um_profit_distributions')) {
                $this->db->prepare("DELETE FROM um_profit_distributions WHERE network_id=?")->execute([$networkId]);
            }
            // 6. Reset all Admin / Agent / Distributor / Partner Balances to 0.00
            $this->db->prepare("UPDATE um_admin_network_balances SET balance=0.00 WHERE network_id=?")->execute([$networkId]);
            // 7. Reset Voucher Sales Metadata if requested (Default: true)
            $resetVouchers = !isset($options['reset_vouchers']) || !empty($options['reset_vouchers']);
            if ($resetVouchers) {
                $this->db->prepare("UPDATE um_vouchers_meta SET is_sold=0,sold_by_admin_id=NULL,sold_at=NULL,invoice_id=NULL,owner_admin_id=? WHERE network_id=?")->execute([(int)$currentAdminId,$networkId]);
            }
            // 8. Log the critical action
            $this->logActivity('financial_reset', 'financial', 'تصفير الحسابات والبدء من جديد', "تم تصفير كافة الفواتير والسندات وقيود اليومية وأرصدة الحسابات بنجاح. تم حفظ نسخة احتياطية مسبقة: {$backupName}", 'success', $currentAdminId);
            return [
                'success' => true,
                'message' => 'تم تصفير وتطهير النظام المالي بنجاح! جميع الحسابات والفواتير والسندات أصبحت مصفّرة ونظيفة للبدء من جديد.',
                'backup_created' => $backupName
            ];
        } catch (Exception $e) {
            return ['success' => false, 'error' => 'فشلت عملية التصفير: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: transferCashboxRemittance
    // ==========================================
    public function transferCashboxRemittance($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $amount = (float)($data['amount'] ?? 0);
        $sourceAccId = (int)($data['source_account_id'] ?? 0);
        $destinationAccId = (int)($data['destination_account_id'] ?? 21); // Default to Main Cashbox 1101
        $notes = trim((string)($data['notes'] ?? ''));
        if ($amount <= 0) throw new Exception('يجب إدخال مبلغ توريد صحيح أكبر من الصفر');
        if (!$sourceAccId || !$destinationAccId) throw new Exception('يجب تحديد صندوق المصدر وصندوق/بنك الوجهة');
        if ($sourceAccId === $destinationAccId) throw new Exception('لا يمكن التوريد لنفس الصندوق');
        $q=$this->db->prepare("SELECT * FROM um_chart_of_accounts WHERE network_id=? AND id=?");$q->execute([$networkId,$sourceAccId]);$sourceAcc=$q->fetch(PDO::FETCH_ASSOC);
        $q->execute([$networkId,$destinationAccId]);$destAcc=$q->fetch(PDO::FETCH_ASSOC);
        if (!$sourceAcc || !$destAcc) throw new Exception('أحد الحسابات المحددة غير موجود في شجرة الحسابات');
        $remitNo = 'REM-' . date('Ymd') . '-' . rand(100, 999);
        $desc = "توريد وترحيل نقدية ($remitNo) من [{$sourceAcc['account_code']}] {$sourceAcc['name_ar']} إلى [{$destAcc['account_code']}] {$destAcc['name_ar']}";
        if (!empty($notes)) $desc .= " - ملاحظة: $notes";
        $jvLines = [
            ['account_id' => $destinationAccId, 'debit' => $amount, 'credit' => 0, 'line_description' => "استلام توريد نقدية من ({$sourceAcc['name_ar']}) سند رقم $remitNo"],
            ['account_id' => $sourceAccId, 'debit' => 0, 'credit' => $amount, 'line_description' => "تسليم وتوريد نقدية إلى ({$destAcc['name_ar']}) سند رقم $remitNo"]
        ];
        $res = $this->createJournalEntry([
            'entry_date' => date('Y-m-d'),
            'source_module' => 'cashbox_remittance',
            'reference_no' => $remitNo,
            'description' => $desc,
            'lines' => $jvLines
        ], $currentAdminId);
        $this->logActivity('cashbox', 'remittance', "توريد نقدية $remitNo", $desc, 'success', $currentAdminId);
        return [
            'success' => true,
            'remittance_no' => $remitNo,
            'amount' => $amount,
            'journal_entry_id' => $res['entry_id'] ?? null,
            'message' => "تم توريد وترحيل النقدية بنجاح من عهدة المحصل إلى الصندوق الرئيسي/البنك وتوليد القيد المحاسبي"
        ];
    }

    // ==========================================
    // METHOD: getCashboxSummary
    // ==========================================
        public function getCashboxSummary(?int $adminId = null, string $role = 'admin') {
        $networkId = $this->getActiveNetworkId();
        if (!in_array($role, ['system_owner', 'superadmin', 'finance', 'accountant'], true) && !empty($adminId)) {
            $aid = (int)$adminId;
            $sql = "
                SELECT 
                    COALESCE(SUM(cashbox_impact), 0) as cashbox_balance,
                    COALESCE(SUM(CASE WHEN cashbox_impact > 0 AND created_at >= CURDATE() THEN cashbox_impact ELSE 0 END), 0) as today_cash_in,
                    COALESCE(SUM(CASE WHEN cashbox_impact < 0 AND created_at >= CURDATE() THEN ABS(cashbox_impact) ELSE 0 END), 0) as today_cash_out,
                    COALESCE(SUM(CASE WHEN tx_type = 'sale_invoice' AND created_at >= CURDATE() THEN debit ELSE 0 END), 0) as today_sales
                FROM um_financial_transactions
                WHERE network_id = $networkId AND (created_by = $aid OR account_id = $aid)
            ";
            $summary = $this->db->query($sql)->fetch(PDO::FETCH_ASSOC);
            $admin = $this->getAdminById($aid);
            $balanceStmt = $this->db->prepare('SELECT balance,credit_limit FROM um_admin_network_balances WHERE admin_id=? AND network_id=? LIMIT 1');
            $balanceStmt->execute([$aid,$networkId]);
            $networkBalance = $balanceStmt->fetch(PDO::FETCH_ASSOC) ?: ['balance'=>0,'credit_limit'=>0];
            $summary['total_distributor_debt'] = (float)$networkBalance['balance'];
            $summary['credit_limit'] = (float)$networkBalance['credit_limit'];
            $summary['my_balance'] = (float)$networkBalance['balance'];
            $summary['is_scoped'] = true;
            return $summary;
        }
        $sql = "
            SELECT 
                COALESCE(SUM(cashbox_impact), 0) as cashbox_balance,
                COALESCE(SUM(CASE WHEN cashbox_impact > 0 AND created_at >= CURDATE() THEN cashbox_impact ELSE 0 END), 0) as today_cash_in,
                COALESCE(SUM(CASE WHEN cashbox_impact < 0 AND created_at >= CURDATE() THEN ABS(cashbox_impact) ELSE 0 END), 0) as today_cash_out,
                COALESCE(SUM(CASE WHEN tx_type = 'sale_invoice' AND created_at >= CURDATE() THEN debit ELSE 0 END), 0) as today_sales
            FROM um_financial_transactions
            WHERE network_id = $networkId
        ";
        $summary = $this->db->query($sql)->fetch(PDO::FETCH_ASSOC);
        $debtSql = "SELECT COALESCE(SUM(CASE WHEN b.balance > 0 THEN b.balance ELSE 0 END), 0) as total_debt FROM um_admin_network_balances b JOIN um_admins a ON a.id=b.admin_id WHERE b.network_id=$networkId AND a.is_active = 1";
        $debt = $this->db->query($debtSql)->fetch(PDO::FETCH_ASSOC);
        $summary['total_distributor_debt'] = (float)($debt['total_debt'] ?? 0);
        $summary['is_scoped'] = false;
        return $summary;
    }

    // ==========================================
    // METHOD: getAccountStatement
    // ==========================================
    public function getAccountStatement($accountId, $startDate = '', $endDate = '', $scope = 'auto') {
        $networkId = $this->getActiveNetworkId();
        $accountId = (int)$accountId;
        $admin = $this->getAdminById($accountId);
        if (!$admin) throw new Exception('الحساب غير موجود');
        $balanceStmt = $this->db->prepare('SELECT balance,credit_limit,currency_code FROM um_admin_network_balances WHERE admin_id=? AND network_id=? LIMIT 1');
        $balanceStmt->execute([$accountId,$networkId]);
        $networkBalance = $balanceStmt->fetch(PDO::FETCH_ASSOC) ?: ['balance'=>0,'credit_limit'=>0,'currency_code'=>'YER_SANAA'];
        $admin['balance'] = (float)$networkBalance['balance'];
        $admin['credit_limit'] = (float)$networkBalance['credit_limit'];
        $admin['currency_code'] = $networkBalance['currency_code'];
        $isSuper = in_array($admin['role'], ['system_owner', 'superadmin'], true);
        if ($scope === 'auto' || empty($scope)) {
            $scope = $isSuper ? 'operations' : 'account';
        }
        $where = [];
        $params = [];
        if ($scope === 'operations') {
            $where[] = "t.network_id = ?";
            $params[] = $networkId;
            $where[] = "(t.account_id = ? OR t.created_by = ?)";
            $params[] = $accountId;
            $params[] = $accountId;
        } else {
            $where[] = "t.network_id = ?";
            $params[] = $networkId;
            $where[] = "t.account_id = ?";
            $params[] = $accountId;
        }
        if (!empty($startDate)) {
            $where[] = "t.created_at >= ?";
            $params[] = $startDate . ' 00:00:00';
        }
        if (!empty($endDate)) {
            $where[] = "t.created_at <= ?";
            $params[] = $endDate . ' 23:59:59';
        }
        $whereClause = implode(' AND ', $where);
        $sql = "
            SELECT t.*, 
                   COALESCE(a.fullname, 'عميل مباشر') as target_fullname, 
                   COALESCE(a.username, '') as target_username, 
                   COALESCE(a.role, '') as target_role,
                   COALESCE(cb.fullname, 'النظام') as creator_fullname, 
                   COALESCE(cb.username, '') as creator_username
            FROM um_financial_transactions t
            LEFT JOIN um_admins a ON a.id = t.account_id
            LEFT JOIN um_admins cb ON cb.id = t.created_by
            WHERE $whereClause 
            ORDER BY t.created_at ASC, t.id ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $txs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $runningBalance = 0.0;
        $totalDebit = 0.0;
        $totalCredit = 0.0;
        $totalCashbox = 0.0;
        foreach ($txs as &$tx) {
            $debit = (float)$tx['debit'];
            $credit = (float)$tx['credit'];
            $cashImpact = (float)$tx['cashbox_impact'];
            $totalDebit += $debit;
            $totalCredit += $credit;
            $totalCashbox += $cashImpact;
            $runningBalance += ($debit - $credit);
            $tx['balance_after'] = $runningBalance;
            $tx['running_balance'] = $runningBalance;
        }
        unset($tx);
        $netBalance = $totalDebit - $totalCredit;
        // A report must never rewrite balances; expose reconciliation separately.
        $balanceConsistency=($scope==='account'&&empty($startDate)&&empty($endDate))?['stored_balance'=>(float)$admin['balance'],'ledger_balance'=>$netBalance,'matches'=>abs((float)$admin['balance']-$netBalance)<=0.01]:null;
        $networkStmt = $this->db->prepare('SELECT id,code,name FROM um_networks WHERE id=?');
        $networkStmt->execute([$networkId]);
        return [
            'account' => $admin,
            'network' => $networkStmt->fetch(PDO::FETCH_ASSOC) ?: ['id'=>$networkId],
            'scope' => $scope,
            'total_debit' => $totalDebit,
            'total_credit' => $totalCredit,
            'total_cashbox' => $totalCashbox,
            'net_balance' => $netBalance,
            'balance_consistency' => $balanceConsistency,
            'transactions' => $txs
        ];
    }

    // ==========================================
    // METHOD: setAccountOpeningBalance
    // ==========================================
    public function setAccountOpeningBalance($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $adminId = !empty($data['admin_id']) ? (int)$data['admin_id'] : null;
        $accountId = !empty($data['account_id']) ? (int)$data['account_id'] : null;
        $amount = (float)($data['amount'] ?? 0);
        $balanceType = trim((string)($data['balance_type'] ?? 'debt')); // debt (مديونية سابقة عليه - مدين) | credit (رصيد سابق له - دائن)
        $date = !empty($data['date']) ? $data['date'] : date('Y-m-d');
        $notes = trim((string)($data['notes'] ?? ''));
        if ($amount <= 0) {
            return ['success' => false, 'error' => 'يرجى إدخال مبلغ صحيح أكبر من الصفر'];
        }
        if (!$adminId && !$accountId) {
            return ['success' => false, 'error' => 'يرجى تحديد الحساب أو الوكيل المستهدف'];
        }
        $admin = null;
        if ($adminId) {
            $admin = $this->getAdminById($adminId);
            if (!$admin) return ['success' => false, 'error' => 'حساب الوكيل/المشرف غير موجود'];
        }
        $this->db->beginTransaction();
        try {
            // 1. Ensure or find linked chart of account for admin
            $targetAccount = null;
            if ($accountId) {
                $stmtAcc = $this->db->prepare("SELECT * FROM um_chart_of_accounts WHERE network_id=? AND id = ?");
                $stmtAcc->execute([$networkId,$accountId]);
                $targetAccount = $stmtAcc->fetch(PDO::FETCH_ASSOC);
            } elseif ($admin) {
                $stmtAcc = $this->db->prepare("SELECT * FROM um_chart_of_accounts WHERE network_id=? AND (linked_admin_id = ? OR account_code = ?)");
                $stmtAcc->execute([$networkId,$adminId, '1102-' . $adminId]);
                $targetAccount = $stmtAcc->fetch(PDO::FETCH_ASSOC);
                if (!$targetAccount) {
                    $subCode = '1102-' . $adminId;
                    $accName = 'ذمم ووكلاء: ' . $admin['fullname'];
                    $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code, name_ar, account_type, level, is_system, is_active, linked_admin_id,owner_admin_id,balance) VALUES (?, ?, ?, 'asset', 3, 0, 1, ?, ?, 0.00)");
                    $ins->execute([$networkId,$subCode, $accName, $adminId,$adminId]);
                    $targetAccountId = (int)$this->db->lastInsertId();
                    $targetAccount = ['id' => $targetAccountId, 'name_ar' => $accName, 'account_code' => $subCode];
                }
            }
            // 2. Find or create Opening Balance Equity Account [3102]
            $stmtOpenAcc = $this->db->prepare("SELECT id,name_ar FROM um_chart_of_accounts WHERE network_id=? AND (account_code='3102' OR name_ar LIKE '%أرصدة افتتاحية%') ORDER BY id LIMIT 1");
            $stmtOpenAcc->execute([$networkId]);
            $openBalAccount = $stmtOpenAcc->fetch(PDO::FETCH_ASSOC);
            if (!$openBalAccount) {
                $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code, name_ar, account_type, level, is_system, is_active, balance) VALUES (?,'3102', 'الأرصدة الافتتاحية والتسويات', 'equity', 2, 1, 1, 0.00)");
                $ins->execute([$networkId]);
                $openBalAccountId = (int)$this->db->lastInsertId();
                $openBalAccount = ['id' => $openBalAccountId, 'name_ar' => 'الأرصدة الافتتاحية والتسويات', 'account_code' => '3102'];
            }
            $partyName = $admin ? $admin['fullname'] : ($targetAccount['name_ar'] ?? 'حساب مالي');
            $entryNo = 'JV-OPEN-' . date('Ymd') . '-' . str_pad((string)random_int(100, 9999), 4, '0', STR_PAD_LEFT);
            $cleanNotes = trim($notes ?? '');
            if ($cleanNotes !== '' && $partyName !== '') {
                $cleanNotes = preg_replace('/\s*\(\s*' . preg_quote($partyName, '/') . '\s*\)/u', '', $cleanNotes);
                $cleanNotes = trim($cleanNotes);
            }
            $prefix = ($balanceType === 'debt' ? 'تسجيل مديونية سابقة (رصيد مدين)' : 'تسجيل رصيد افتتاحي دائن');
            if ($cleanNotes !== '') {
                $desc = $prefix . ': ' . $cleanNotes;
            } else {
                $desc = $prefix;
            }
            // 3. Create Journal Entry
            $jeStmt = $this->db->prepare("INSERT INTO um_journal_entries (network_id,entry_no, entry_date, source_module, reference_no, description, total_debit, total_credit, is_posted, created_by, created_at) VALUES (?, ?, ?, 'opening_balance', ?, ?, ?, ?, 1, ?, NOW())");
            $jeStmt->execute([$networkId,$entryNo, $date, $entryNo, $desc, $amount, $amount, $currentAdminId]);
            $journalEntryId = (int)$this->db->lastInsertId();
            $lineStmt = $this->db->prepare("INSERT INTO um_journal_entry_lines (journal_entry_id, account_id, debit, credit, line_description, line_index) VALUES (?, ?, ?, ?, ?, ?)");
            if ($balanceType === 'debt') {
                $lineStmt->execute([$journalEntryId, $targetAccount['id'], $amount, 0.00, $desc, 1]);
                $lineStmt->execute([$journalEntryId, $openBalAccount['id'], 0.00, $amount, $desc, 2]);
                $this->db->prepare("UPDATE um_chart_of_accounts SET balance = balance + ? WHERE network_id=? AND id = ?")->execute([$amount,$networkId,$targetAccount['id']]);
                $this->db->prepare("UPDATE um_chart_of_accounts SET balance = balance + ? WHERE network_id=? AND id = ?")->execute([$amount,$networkId,$openBalAccount['id']]);
            } else {
                $lineStmt->execute([$journalEntryId, $openBalAccount['id'], $amount, 0.00, $desc, 1]);
                $lineStmt->execute([$journalEntryId, $targetAccount['id'], 0.00, $amount, $desc, 2]);
                $this->db->prepare("UPDATE um_chart_of_accounts SET balance = balance - ? WHERE network_id=? AND id = ?")->execute([$amount,$networkId,$openBalAccount['id']]);
                $this->db->prepare("UPDATE um_chart_of_accounts SET balance = balance + ? WHERE network_id=? AND id = ?")->execute([$amount,$networkId,$targetAccount['id']]);
            }
            // 4. Create record in um_vouchers_financial
            $vNo = 'V-OPEN-' . ($balanceType === 'debt' ? 'DR-' : 'CR-') . date('Ymd') . '-' . ($adminId ?: $targetAccount['id']);
            $stVoucher = $this->db->prepare("INSERT INTO um_vouchers_financial (network_id,voucher_no, voucher_type, source_account_id, destination_account_id, party_id, party_name, amount, payment_method, category, reference_id, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'other', 'مديونية سابقة ورصيد افتتاحي', ?, ?, ?, ?)");
            $stVoucher->execute([
                $networkId,
                $vNo,
                $balanceType === 'debt' ? 'receipt' : 'payment',
                $balanceType === 'debt' ? $targetAccount['id'] : $openBalAccount['id'],
                $balanceType === 'debt' ? $openBalAccount['id'] : $targetAccount['id'],
                $adminId,
                $partyName,
                $amount,
                $entryNo,
                $desc,
                $currentAdminId,
                $date . ' ' . date('H:i:s')
            ]);
            // 5. Create transaction in um_financial_transactions for account statement & sync admin balance
            $effectiveAccountId = $adminId ?: ($targetAccount['linked_admin_id'] ?? 0);
            if ($effectiveAccountId > 0) {
                $txNo = 'TX-OPEN-' . date('Ymd') . '-' . str_pad((string)random_int(100, 9999), 4, '0', STR_PAD_LEFT);
                $txType = 'adjustment';
                $debitVal = ($balanceType === 'debt') ? $amount : 0.00;
                $creditVal = ($balanceType === 'debt') ? 0.00 : $amount;

                $bq = $this->db->prepare("SELECT balance FROM um_admin_network_balances WHERE network_id=? AND admin_id=?");
                $bq->execute([$networkId, $effectiveAccountId]);
                $curBalRow = $bq->fetch(PDO::FETCH_ASSOC);
                $curBal = $curBalRow ? (float)$curBalRow['balance'] : 0.0;
                $newBal = $curBal + ($debitVal - $creditVal);

                if ($curBalRow) {
                    $this->db->prepare("UPDATE um_admin_network_balances SET balance = ? WHERE network_id=? AND admin_id=?")->execute([$newBal, $networkId, $effectiveAccountId]);
                } else {
                    $this->db->prepare("INSERT INTO um_admin_network_balances (network_id, admin_id, balance, currency_code) VALUES (?, ?, ?, 'YER_SANAA')")->execute([$networkId, $effectiveAccountId, $newBal]);
                }

                $txStmt = $this->db->prepare("
                    INSERT INTO um_financial_transactions 
                    (network_id, tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, 'other', ?, ?, ?, ?)
                ");
                $txStmt->execute([
                    $networkId,
                    $txNo,
                    $effectiveAccountId,
                    $txType,
                    $debitVal,
                    $creditVal,
                    $newBal,
                    $entryNo,
                    $desc,
                    $currentAdminId,
                    $date . ' ' . date('H:i:s')
                ]);
            }
            $this->db->commit();
            return [
                'success' => true,
                'message' => '✅ تم تسجيل ' . ($balanceType === 'debt' ? 'المديونية السابقة' : 'الرصيد الافتتاحي') . ' بنجاح وتحديث الرصيد والقيد المحاسبي برقم [' . $entryNo . '] ✓'
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            return ['success' => false, 'error' => 'فشل تسجيل المديونية/الرصيد: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: saveFinancialVoucher
    // ==========================================
    public function saveFinancialVoucher($data, $currentAdminId = 1) {
        if(!empty($data['id'])) {
            $creator=$this->getAdminById((int)$currentAdminId);
            if(!in_array($creator['role']??'', ['system_owner','superadmin'],true))throw new DomainException('تعديل السندات للإدارة العامة فقط');
            $n=$this->getActiveNetworkId();
            $own=!$this->db->inTransaction();
            if($own)$this->db->beginTransaction();
            try {
                $q=$this->db->prepare('SELECT * FROM um_vouchers_financial WHERE network_id=? AND id=? FOR UPDATE');
                $q->execute([$n,(int)$data['id']]);
                $old=$q->fetch(PDO::FETCH_ASSOC);
                if(!$old || (int)$old['is_void'])throw new DomainException('السند غير موجود أو ملغى');
                if(!empty($old['invoice_id'])||str_starts_with((string)$old['reference_id'],'JV-OPEN-'))throw new DomainException('للسند المرتبط بفاتورة أو افتتاحية استخدم الإجراء الأصلي');
                $oldId=(int)$old['id'];
                $oldNo=(string)$old['voucher_no'];
                // The old voucher is permanently canceled; the recursive save creates a new number.
                $this->deleteFinancialVoucher($oldId,$currentAdminId);
                unset($data['id']);
                $data['notes']=trim(($data['notes']??'').' | بديل السند الملغى '.$oldNo);
                $r=$this->saveFinancialVoucher($data,$currentAdminId);
                if(empty($r['success']))throw new DomainException($r['error']??'تعذر حفظ السند الجديد');
                $newId=(int)($r['id']??$r['voucher_id']??0);
                $newNo=(string)($r['voucher_no']??'');
                if($newId<=0||$newNo==='')throw new DomainException('تعذر تحديد رقم السند الجديد');
                $this->db->prepare("UPDATE um_vouchers_financial SET notes=CONCAT(COALESCE(notes,''),' | تم الإلغاء والتعديل بسند جديد رقم ',?) WHERE network_id=? AND id=?")->execute([$newNo,$n,$oldId]);
                $this->db->prepare("INSERT INTO um_voucher_audit_logs (network_id,voucher_id,voucher_no,modified_by,action_type,old_amount,new_amount,old_party_id,new_party_id,edit_reason,diff_summary,created_at) VALUES (?,?,?,?,'replace',?,?,?,?,?,?,NOW())")->execute([$n,$oldId,$oldNo,$currentAdminId,$old['amount'],$r['amount']??$data['amount']??0,$old['party_id'],$data['party_id']??null,'تعديل السند','السند القديم ملغى؛ السند الجديد رقم '.$newNo]);
                if($own)$this->db->commit();
                return ['success'=>true,'id'=>$newId,'voucher_id'=>$newId,'voucher_no'=>$newNo,'canceled_voucher_id'=>$oldId,'canceled_voucher_no'=>$oldNo,'message'=>'تم إلغاء السند القديم وإنشاء سند جديد رقم '.$newNo];
            } catch(Throwable $e) {
                if($own&&$this->db->inTransaction())$this->db->rollBack();
                throw $e;
            }
        }

        $vType = ($data['type'] ?? ($data['voucher_type'] ?? 'receipt')) === 'payment' ? 'vouchers_payment_create' : 'vouchers_receipt_create';
        $vTypeName = $vType === 'vouchers_payment_create' ? 'سند صرف' : 'سند قبض';
        $this->enforcePermission([$vType, 'vouchers_fin'], $vTypeName, (int)$currentAdminId);
        $id = !empty($data['id']) ? (int)$data['id'] : null;
        $type = $data['type'] ?? ($data['voucher_type'] ?? 'receipt'); // receipt | payment
        $partyId = !empty($data['party_id']) ? (int)$data['party_id'] : null;
        $partyName = trim((string)($data['party_name'] ?? ''));
        $amount = (float)($data['amount'] ?? 0);
        $paymentMethod = (string)($data['payment_method'] ?? 'cash');
        $category = (string)($data['category'] ?? ($type === 'receipt' ? 'مقبوضات' : 'مصاريف عامة'));
        $costCenterId = !empty($data['cost_center_id']) ? (int)$data['cost_center_id'] : null;
        $sourceAccountId = !empty($data['source_account_id']) ? (int)$data['source_account_id'] : null;
        $destinationAccountId = !empty($data['destination_account_id']) ? (int)$data['destination_account_id'] : null;
        $networkId = $this->getActiveNetworkId();
        $notes = trim((string)($data['notes'] ?? ''));
        if ($amount <= 0) {
            return ['error' => 'يرجى إدخال مبلغ صحيح أكبر من الصفر'];
        }
        if ($partyId && !$this->getAdminById($partyId)) return ['error'=>'الطرف المالي غير تابع للشبكة النشطة'];
        foreach (array_filter([$sourceAccountId,$destinationAccountId]) as $chartId) {
            $cq=$this->db->prepare('SELECT 1 FROM um_chart_of_accounts WHERE network_id=? AND id=? AND is_active=1');
            $cq->execute([$networkId,(int)$chartId]);
            if (!$cq->fetchColumn()) return ['error'=>'الحساب المالي المحدد لا يتبع الشبكة النشطة'];
        }
        if ($costCenterId) {
            $cq=$this->db->prepare('SELECT 1 FROM um_cost_centers WHERE network_id=? AND id=? AND is_active=1');
            $cq->execute([$networkId,$costCenterId]);
            if (!$cq->fetchColumn()) return ['error'=>'مركز التكلفة لا يتبع الشبكة النشطة'];
        }
        // Fetch caller identity
        $creator = $this->getAdminById((int)$currentAdminId);
        $creatorRole = $creator['role'] ?? 'pos_agent';
        $isSuper = (in_array($creatorRole, ['system_owner', 'superadmin'], true) || (int)$currentAdminId === 1);
        // Prevent self-receipt / self-paying vouchers
        if ($type === 'receipt') {
            if ($partyId === (int)$currentAdminId || ($sourceAccountId && $destinationAccountId && $sourceAccountId === $destinationAccountId)) {
                return ['error' => 'غير مصرح: لا يمكن إنشاء سند قبض لحسابك من نفسك (الطرف المسدد والطرف القابض متطابقان)'];
            }
        }
        $oldVoucher = null;
        if ($id) {
            if (!$isSuper) {
                return ['error' => 'غير مصرح: لا يمكن تعديل السندات المالية إلا بواسطة الإدارة العامة (Superadmin)'];
            }
            $oldStmt = $this->db->prepare("SELECT * FROM um_vouchers_financial WHERE network_id=? AND id = ?");
            $oldStmt->execute([$networkId,$id]);
            $oldVoucher = $oldStmt->fetch(PDO::FETCH_ASSOC);
            if (!$oldVoucher) {
                return ['error' => 'السند المالي المطلوب تعديله غير موجود'];
            }
        }
        // STRICT CASHBOX & CREDIT LIMIT CHECKS FOR NON-SUPERADMIN
        if (!$isSuper) {
            if ($type === 'payment') {
                if (empty($sourceAccountId)) {
                    $sourceAccountId = (int)$currentAdminId;
                }
                // Calculate available cash in creator's personal cashbox
                $cbStmt = $this->db->prepare("
                    SELECT COALESCE(SUM(cashbox_impact), 0) 
                    FROM um_financial_transactions 
                    WHERE network_id=? AND created_by = ?
                ");
                $cbStmt->execute([$networkId,(int)$currentAdminId]);
                $userCashbox = (float)$cbStmt->fetchColumn();
                // If editing, credit back old payment amount for calculation
                if ($oldVoucher && $oldVoucher['voucher_type'] === 'payment') {
                    $userCashbox += (float)$oldVoucher['amount'];
                }
                $creditLimit = (float)($creator['credit_limit'] ?? 0);
                $currentDebt = (float)($creator['balance'] ?? 0);
                if ($paymentMethod === 'cash') {
                    if ($amount > $userCashbox) {
                        $deficit = $amount - $userCashbox;
                        if ($creditLimit <= 0) {
                            throw new Exception("عذراً، الرصيد النقدي المتوفر في صندوقك حالياً (" . number_format($userCashbox, 2) . " ر.ي) لا يكفي لصرف هذا المبلغ (" . number_format($amount, 2) . " ر.ي)، ولا يوجد سقف ائتماني مسموح به لحسابك.");
                        } else {
                            $projectedDebt = $currentDebt + $deficit;
                            if ($projectedDebt > $creditLimit) {
                                throw new Exception("عذراً، المبلغ المطلوب صرفه (" . number_format($amount, 2) . " ر.ي) يتجاوز الرصيد المتوفر في صندوقك (" . number_format($userCashbox, 2) . " ر.ي) وسيتجاوز السقف الائتماني المسموح به لحسابك (" . number_format($creditLimit, 2) . " ر.ي). المديونية المتوقعة: " . number_format($projectedDebt, 2) . " ر.ي.");
                            }
                        }
                    }
                } else {
                    // Non-cash (bank, account transfer)
                    $projectedDebt = $currentDebt + $amount;
                    if ($creditLimit > 0 && $projectedDebt > $creditLimit) {
                        throw new Exception("عذراً، عملية الصرف هذه ستتجاوز السقف الائتماني المحدد لحسابك (" . number_format($creditLimit, 2) . " ر.ي). المديونية الحالية: " . number_format($currentDebt, 2) . " ر.ي، والمبلغ المطلوب: " . number_format($amount, 2) . " ر.ي.");
                    } elseif ($creditLimit <= 0 && $projectedDebt > 0 && $userCashbox < $amount) {
                        throw new Exception("عذراً، ليس لديك رصيد مالي كافٍ لإتمام عملية الصرف (" . number_format($amount, 2) . " ر.ي)، وحسابك لا يمتلك سقف ائتماني مسموح به.");
                    }
                }
            }
        }
        if (empty($partyName) && $partyId) {
            $pRow=$this->getAdminById($partyId);
            if ($pRow) {
                $partyName = $pRow['fullname'] ?: $pRow['username'];
            }
        }
        if (empty($partyName) && $destinationAccountId) {
            $pRow=$this->getAdminById($destinationAccountId);
            if ($pRow) {
                $partyName = $pRow['fullname'] ?: $pRow['username'];
            }
        }
        if (empty($partyName)) {
            $partyName = ($type === 'receipt') ? 'عميل نقدي' : 'مصروف عام';
        }

        $currencyCode = strtoupper(trim((string)($data['currency_code'] ?? 'YER_SANAA')));
        $exchangeRate = (float)($data['exchange_rate'] ?? 1.0);
        if ($exchangeRate <= 0) $exchangeRate = 1.0;
        $currencyAmount = (float)($data['currency_amount'] ?? $amount);

        // Convert to base currency for accounting ledger if foreign currency
        if ($currencyCode !== 'YER_SANAA' && $exchangeRate > 0) {
            $baseAmount = round($currencyAmount * $exchangeRate, 2);
            $auditNote = sprintf(" [💱 بالعملة: %s %s | سعر الصرف بتاريخه: %s | المعادل: %s ر.ي]", number_format($currencyAmount, 2), $currencyCode, $exchangeRate, number_format($baseAmount, 2));
            if (!str_contains($notes, 'بالعملة:')) {
                $notes = trim($notes . $auditNote);
            }
            $amount = $baseAmount;
        } else {
            $currencyAmount = $amount;
            $exchangeRate = 1.0;
        }

        $ownVoucherTx=!$this->db->inTransaction();
        if($ownVoucherTx)$this->db->beginTransaction();
        try {
            $oldVoucher = null;
            {
                // New voucher
                $prefix = ($type === 'receipt') ? 'REC-' : 'PAY-';
                $todayStr = date('Ymd');
                $seqStmt=$this->db->prepare("SELECT COUNT(*) FROM um_vouchers_financial WHERE network_id=? AND voucher_no LIKE ?");$seqStmt->execute([$networkId,$prefix.$todayStr.'-%']);$seq=(int)$seqStmt->fetchColumn()+1;
                $voucherNo = $prefix.$todayStr.'-N'.$networkId.'-'.bin2hex(random_bytes(6));
                $vStmt = $this->db->prepare("
                    INSERT INTO um_vouchers_financial 
                    (network_id,voucher_no, voucher_type, source_account_id, destination_account_id, party_id, party_name, amount, payment_method, category, cost_center_id, notes, created_by, currency_code, exchange_rate, currency_amount, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ");
                $vStmt->execute([
                    $networkId,$voucherNo, $type, $sourceAccountId, $destinationAccountId, $partyId, $partyName, $amount, $paymentMethod, $category, $costCenterId,$notes, $currentAdminId, $currencyCode, $exchangeRate, $currencyAmount
                ]);
                $id = (int)$this->db->lastInsertId();
            }
            // Apply new balance and create transaction
            $txNo = 'TX-' . date('YmdHis') . '-' . rand(1000, 9999);
            if ($type === 'receipt') {
                $newBalance = 0;
                if ($partyId) {
                    $bq=$this->db->prepare("SELECT balance FROM um_admin_network_balances WHERE network_id=? AND admin_id=? FOR UPDATE");$bq->execute([$networkId,(int)$partyId]);$curBal=(float)$bq->fetchColumn();
                    $newBalance = $curBal - $amount;
                    $this->db->prepare("UPDATE um_admin_network_balances SET balance=? WHERE network_id=? AND admin_id=?")->execute([$newBalance,$networkId,(int)$partyId]);
                }
                $txStmt = $this->db->prepare("
                    INSERT INTO um_financial_transactions (network_id,tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'receipt_voucher', 0.00, ?, ?, ?, ?, ?, ?, ?)
                ");
                $txStmt->execute([
                    $networkId,$txNo, $partyId ?: 0, $amount, $newBalance, $amount, $paymentMethod, $voucherNo, "سند قبض نقدية رقم $voucherNo من $partyName", $currentAdminId
                ]);
            } else {
                $newBalance = 0;
                $effectiveTargetId = $partyId ?: 0;
                if ($partyId) {
                    $bq=$this->db->prepare("SELECT balance FROM um_admin_network_balances WHERE network_id=? AND admin_id=? FOR UPDATE");$bq->execute([$networkId,(int)$partyId]);$curBal=(float)$bq->fetchColumn();
                    $newBalance = $curBal + $amount;
                    $this->db->prepare("UPDATE um_admin_network_balances SET balance=? WHERE network_id=? AND admin_id=?")->execute([$newBalance,$networkId,(int)$partyId]);
                }
                $txStmt = $this->db->prepare("
                    INSERT INTO um_financial_transactions (network_id,tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'payment_voucher', ?, 0.00, ?, ?, ?, ?, ?, ?)
                ");
                $txStmt->execute([
                    $networkId,$txNo, $effectiveTargetId ?: 0, $amount, $newBalance, -$amount, $paymentMethod, $voucherNo, "سند صرف مصاريف رقم $voucherNo - $category ($partyName)", $currentAdminId
                ]);
            }
            // Auto-post balanced journal entry (ERP Double-Entry to Party's Specific Sub-Account)
            try {
                $aq=$this->db->prepare("SELECT id,account_code FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('1101','1102')");$aq->execute([$networkId]);$cashMap=[];foreach($aq->fetchAll(PDO::FETCH_ASSOC) as $ar)$cashMap[$ar['account_code']]=(int)$ar['id'];$accCashId=$cashMap['1101']??0;$accBankId=$cashMap['1102']??0;
                $accTreasury = in_array($paymentMethod, ['bank', 'kareemi', 'onecash']) ? ($accBankId ?: $accCashId) : $accCashId;
                // Resolve party dedicated chart account
                $targetAccountId = $destinationAccountId ?: $sourceAccountId;
                if (!$targetAccountId && $partyId) {
                    $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? LIMIT 1");$aq->execute([$networkId,(int)$partyId]);$targetAccountId=(int)$aq->fetchColumn();
                }
                if (!$targetAccountId) {
                    $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='1301' LIMIT 1");$aq->execute([$networkId]);$targetAccountId=(int)$aq->fetchColumn();
                }
                $jvLines = [];
                if ($type === 'receipt') {
                    $jvLines[] = ['account_id' => $accTreasury, 'cost_center_id' => $costCenterId, 'debit' => $amount, 'credit' => 0, 'line_description' => "قبض نقدية سند رقم $voucherNo من ($partyName)"];
                    $jvLines[] = ['account_id' => $targetAccountId, 'cost_center_id' => $costCenterId, 'debit' => 0, 'credit' => $amount, 'line_description' => "سداد مديونية / دفعة من ($partyName) سند رقم $voucherNo"];
                } else {
                    $expCode = '5305';
                    if (str_contains($category, 'رواتب') || str_contains($category, 'أجور')) $expCode = '5301';
                    elseif (str_contains($category, 'إيجار') || str_contains($category, 'موقع') || str_contains($category, 'برج')) $expCode = '5201';
                    elseif (str_contains($category, 'وقود') || str_contains($category, 'ديزل') || str_contains($category, 'كهرباء')) $expCode = '5202';
                    elseif (str_contains($category, 'صيانة') || str_contains($category, 'معدات')) $expCode = '5203';
                    elseif (str_contains($category, 'إنترنت') || str_contains($category, 'خطوط')) $expCode = '5101';
                    elseif (str_contains($category, 'أصل') || str_contains($category, 'شراء')) $expCode = '1501';
                    $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND (account_code=? OR account_type='expense') ORDER BY account_code=? DESC LIMIT 1");$aq->execute([$networkId,$expCode,$expCode]);$accExpId=(int)$aq->fetchColumn();
                    $jvLines[] = ['account_id' => $accExpId, 'cost_center_id' => $costCenterId, 'debit' => $amount, 'credit' => 0, 'line_description' => "مصروف $category سند صرف رقم $voucherNo ($partyName)"];
                    $jvLines[] = ['account_id' => $accTreasury, 'cost_center_id' => $costCenterId, 'debit' => 0, 'credit' => $amount, 'line_description' => "صرف نقدية من الصندوق سند رقم $voucherNo ($partyName)"];
                }
                $this->createJournalEntry([
                    'entry_date' => date('Y-m-d'),
                    'source_module' => ($type === 'receipt' ? 'receipt' : 'payment'),
                    'reference_no' => $voucherNo,
                    'description' => ($type === 'receipt' ? "سند قبض نقدية رقم $voucherNo - $partyName" : "سند صرف مصاريف رقم $voucherNo - $category ($partyName)"),
                    'lines' => $jvLines
                ], $currentAdminId);
            } catch (Throwable $jve) {
                throw new RuntimeException("تعذر ترحيل السند محاسبيًا؛ لم يتم حفظ السند أو تغيير الرصيد", 0, $jve);
            }
            if($ownVoucherTx)$this->db->commit();
            if($ownVoucherTx) {
            // Auto send notifications (Telegram & WhatsApp)
            try {
                require_once __DIR__ . '/TelegramService.php';
                $tg = new TelegramService($this->db);
                $tg->notifyFinancialVoucher([
                    'voucher_no' => $voucherNo,
                    'voucher_type' => $type,
                    'party_name' => $partyName,
                    'amount' => $amount,
                    'payment_method' => $paymentMethod,
                    'description' => $notes
                ]);
            } catch (\Throwable $tge) {}
            try {
                $this->getNotificationService()->notifyVoucher($id, $currentAdminId);
            } catch (Exception $ne) {}
            }
            $actionText = $oldVoucher ? "تعديل سند $voucherNo" : ($type === 'receipt' ? "سند قبض نقدية $voucherNo" : "سند صرف مصاريف $voucherNo");
            $this->logActivity('financial', 'vouchers', $actionText, "مبلغ: " . number_format($amount, 2) . " ر.ي من/إلى $partyName", 'success', $currentAdminId);
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return ['success' => true, 'voucher_no' => $voucherNo, 'id' => $id, 'voucher_id' => $id, 'message' => 'تم حفظ السند بنجاح'];
    }

    // ==========================================
    // METHOD: deleteFinancialVoucher
    // ==========================================
    public function deleteFinancialVoucher($voucherId, $currentAdminId = 1) {
        $fundGuard=$this->db->prepare('SELECT 1 FROM um_vouchers_financial v JOIN um_journal_entries j ON j.network_id=v.network_id AND j.reference_no=v.reference_id JOIN um_wallet_funding f ON f.network_id=j.network_id AND f.journal_entry_id=j.id WHERE v.id=? AND v.network_id=? LIMIT 1');$fundGuard->execute([$voucherId,$this->getActiveNetworkId()]);if($fundGuard->fetchColumn())throw new DomainException('WALLET_FUNDING_IMMUTABLE');

        $this->enforcePermission(['vouchers_delete','vouchers_fin'], 'إلغاء السند المالي', (int)$currentAdminId);
        $n=$this->getActiveNetworkId(); $own=!$this->db->inTransaction();
        if($own)$this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT * FROM um_vouchers_financial WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$n,(int)$voucherId]);$v=$q->fetch(PDO::FETCH_ASSOC);
            if(!$v)throw new DomainException('السند غير موجود في الشبكة النشطة');
            if((int)$v['is_void']){if($own)$this->db->commit();return ['success'=>true,'already_void'=>true,'message'=>'السند ملغى مسبقًا'];}
            $ref=$v['voucher_no'];$opening=str_starts_with((string)$v['reference_id'],'JV-OPEN-');
            $supplierPayment=empty($v['party_id']) && $v['category']==='مشتريات وموردين';
            $txref=($opening||$supplierPayment)?$v['reference_id']:$ref;
            $q=$this->db->prepare('SELECT * FROM um_financial_transactions WHERE network_id=? AND reference_id=? FOR UPDATE');$q->execute([$n,$txref]);$tx=$q->fetchAll(PDO::FETCH_ASSOC);
            $lines=[];
            if(!empty($v['invoice_id'])) {
                $q=$this->db->prepare('SELECT * FROM um_sales_invoices WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$n,(int)$v['invoice_id']]);$i=$q->fetch(PDO::FETCH_ASSOC);
                if(!$i || ($i['sale_kind']??'cards')!=='cards' || empty($i['buyer_id']) || ($i['invoice_status']??'completed')!=='completed')throw new DomainException('هذا السند مرتبط بعملية تتطلب مرتجع الفاتورة؛ لا يجوز إلغاء التحصيل مستقلاً');
                $cashRef=$ref;$cashSource='receipt';
                if(!$tx){$cashRef=$i['invoice_no'];$cashSource='sales';$q=$this->db->prepare("SELECT * FROM um_financial_transactions WHERE network_id=? AND reference_id=? AND tx_type='receipt_voucher' AND credit=? AND created_at=? FOR UPDATE");$q->execute([$n,$i['invoice_no'],$v['amount'],$v['created_at']]);$tx=$q->fetchAll(PDO::FETCH_ASSOC);}
                if(count($tx)!==1 || (float)$tx[0]['credit']!==(float)$v['amount'] || (float)$tx[0]['cashbox_impact']!==(float)$v['amount'])throw new DomainException('حركة التحصيل القديمة تحتاج مطابقة منفصلة؛ لم يتغير السند');
                $q=$this->db->prepare("SELECT l.account_id FROM um_journal_entry_lines l JOIN um_journal_entries j ON j.id=l.journal_entry_id JOIN um_chart_of_accounts a ON a.id=l.account_id AND a.network_id=j.network_id WHERE j.network_id=? AND j.reference_no=? AND j.source_module=? AND j.is_posted=1 AND l.debit>0 AND (a.account_code LIKE '1101%' OR a.account_code LIKE '1102%')");$q->execute([$n,$cashRef,$cashSource]);$cash=$q->fetchAll(PDO::FETCH_COLUMN);
                $q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND is_active=1 AND (account_code LIKE '130%' OR account_code LIKE '1103%')");$q->execute([$n,(int)$i['buyer_id']]);$ar=$q->fetchAll(PDO::FETCH_COLUMN);
                if(count($ar)===0){
                    $q=$this->db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$q->execute([$n]);
                    $q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND is_active=1 AND (account_code LIKE '130%' OR account_code LIKE '1103%')");$q->execute([$n,(int)$i['buyer_id']]);$ar=$q->fetchAll(PDO::FETCH_COLUMN);
                    if(!$ar){$q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='1301' AND account_type='asset' AND is_active=1 FOR UPDATE");$q->execute([$n]);$parent=(int)$q->fetchColumn();if(!$parent)throw new DomainException('حساب ذمم العملاء غير موجود');
                        $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance,linked_admin_id) VALUES (?,?,?,'asset',?,4,0,1,0,?)")->execute([$n,'1301'.str_pad((string)$i['buyer_id'],6,'0',STR_PAD_LEFT),'ذمم العميل رقم '.$i['buyer_id'],$parent,$i['buyer_id']]);$ar=[(int)$this->db->lastInsertId()];}
                }
                if(count($cash)!==1||count($ar)!==1||(float)$i['paid_amount']<(float)$v['amount'])throw new DomainException('تعذر مطابقة حساب التحصيل أو المبلغ المسدد؛ لم يتغير السند');
                $lines=[['account_id'=>(int)$ar[0],'debit'=>(float)$v['amount'],'credit'=>0],['account_id'=>(int)$cash[0],'debit'=>0,'credit'=>(float)$v['amount']]];
                $newPaid=round((float)$i['paid_amount']-(float)$v['amount'],2);$newRemaining=round((float)$i['remaining_amount']+(float)$v['amount'],2);
                $this->db->prepare('UPDATE um_sales_invoices SET paid_amount=?,remaining_amount=?,payment_type=? WHERE network_id=? AND id=?')->execute([$newPaid,$newRemaining,$newPaid<=0?'credit':'partial',$n,$i['id']]);
                if((float)$i['currency_total_amount']>0){$delta=round((float)$v['amount']/max(0.0001,(float)$i['exchange_rate']),2);if($delta>(float)$i['currency_paid_amount']+0.01)throw new DomainException('مبلغ التحصيل بالعملة لا يطابق الفاتورة');$this->db->prepare('UPDATE um_sales_invoices SET currency_paid_amount=currency_paid_amount-?,currency_remaining_amount=currency_remaining_amount+? WHERE network_id=? AND id=?')->execute([$delta,$delta,$n,$i['id']]);}
            } elseif($supplierPayment && str_starts_with((string)$txref,'PINV-')) {
                $q=$this->db->prepare('SELECT * FROM um_purchase_invoices WHERE network_id=? AND invoice_no=? AND status=\'posted\' FOR UPDATE');$q->execute([$n,$txref]);$i=$q->fetch(PDO::FETCH_ASSOC);
                if(!$i||(float)$i['paid_amount']<(float)$v['amount'] || (int)$i['payment_account_id']!==(int)$v['source_account_id'] || (int)$i['payable_account_id']!==(int)$v['destination_account_id'])throw new DomainException('تعذر مطابقة سند دفع المشتريات');
                $lines=[['account_id'=>(int)$i['payment_account_id'],'debit'=>(float)$v['amount'],'credit'=>0],['account_id'=>(int)$i['payable_account_id'],'debit'=>0,'credit'=>(float)$v['amount']]];
                $newPaid=round((float)$i['paid_amount']-(float)$v['amount'],2);
                $this->db->prepare('UPDATE um_purchase_invoices SET paid_amount=paid_amount-?,remaining_amount=remaining_amount+?,currency_paid_amount=currency_paid_amount-?,currency_remaining_amount=currency_remaining_amount+?,payment_type=? WHERE network_id=? AND id=?')->execute([$v['amount'],$v['amount'],$v['currency_amount'],$v['currency_amount'],$newPaid<=0?'credit':'partial',$n,$i['id']]);
            } else {
                $q=$this->db->prepare('SELECT id FROM um_journal_entries WHERE network_id=? AND reference_no=? AND is_posted=1 FOR UPDATE');$q->execute([$n,$txref]);$ids=$q->fetchAll(PDO::FETCH_COLUMN);
                if(count($ids)!==1)throw new DomainException('تعذر مطابقة قيد مستقل للسند؛ يلزم عكس العملية الأصلية المرتبطة به');
                $q=$this->db->prepare('SELECT account_id,cost_center_id,credit AS debit,debit AS credit FROM um_journal_entry_lines WHERE journal_entry_id=? ORDER BY line_index');$q->execute([$ids[0]]);$lines=$q->fetchAll(PDO::FETCH_ASSOC);
            }
            if(count($tx)!==1||count($lines)<2)throw new DomainException('تعذر مطابقة الحركة المالية الأصلية للسند؛ لم تتغير الأرصدة');
            $t=$tx[0];$party=(int)$t['account_id'];
            if($party && $party!==(int)$v['party_id'])throw new DomainException('طرف الحركة الأصلية لا يطابق طرف السند');
            $balance=0;
            if($party && !empty($v['invoice_id']))$this->db->prepare('INSERT IGNORE INTO um_admin_network_balances (network_id,admin_id,balance) VALUES (?,?,0)')->execute([$n,$party]);
            if($party){$q=$this->db->prepare('SELECT balance FROM um_admin_network_balances WHERE network_id=? AND admin_id=? FOR UPDATE');$q->execute([$n,$party]);$b=$q->fetchColumn();if($b===false)throw new DomainException('رصيد الطرف غير موجود');$balance=round((float)$b+(float)$t['credit']-(float)$t['debit'],2);$this->db->prepare('UPDATE um_admin_network_balances SET balance=? WHERE network_id=? AND admin_id=?')->execute([$balance,$n,$party]);}
            $reverse='VREV-'.$n.'-'.$v['id'];
            $this->createJournalEntry(['entry_date'=>date('Y-m-d'),'source_module'=>'voucher_reversal','reference_no'=>$reverse,'description'=>'إلغاء سند '.$ref.' مع حفظ القيد الأصلي','lines'=>$lines],$currentAdminId);
            $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no,account_id,tx_type,debit,credit,balance_after,cashbox_impact,payment_method,reference_id,description,created_by,currency_code,exchange_rate,currency_amount) VALUES (?,?,?,'adjustment',?,?,?,?,?,?,?,?,?,?,?)")->execute([$n,$reverse,$party,$t['credit'],$t['debit'],$balance,-(float)$t['cashbox_impact'],$t['payment_method'],$reverse,'عكس سند '.$ref.' بواسطة المسؤول '.$currentAdminId,$t['created_by'],$v['currency_code'],$v['exchange_rate'],$v['currency_amount']]);
            $this->db->prepare('UPDATE um_vouchers_financial SET is_void=1,voided_at=NOW(),updated_by=?,updated_at=NOW() WHERE network_id=? AND id=?')->execute([$currentAdminId,$n,$v['id']]);
            $this->db->prepare("INSERT INTO um_voucher_audit_logs (network_id,voucher_id,voucher_no,modified_by,action_type,old_amount,new_amount,old_party_id,new_party_id,edit_reason,diff_summary,created_at) VALUES (?,?,?,?,'reverse',?,0,?,?,?, ?,NOW())")->execute([$n,$v['id'],$ref,$currentAdminId,$v['amount'],$v['party_id'],$v['party_id'],'إلغاء السند','قيد عكسي '.$reverse.'؛ حفظ أصل السند والحركة والقيد']);
            if($own)$this->db->commit();
            return ['success'=>true,'message'=>'تم إلغاء السند بقيد عكسي مع حفظ السجل الأصلي','reversal_reference'=>$reverse];
        } catch(Throwable $e){if($own&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
    }


    // ==========================================
    // METHOD: getFinancialVouchers
    // ==========================================
        public function getFinancialVouchers($type = '', $page = 1, $limit = 50, $search = '', $networkId = null, $adminId = null, $role = 'admin', $partyId = null, $paymentMethod = '', $category = '', $startDate = '', $endDate = '') {
        $activeNetworkId = $this->getActiveNetworkId();
        $offset = ($page - 1) * $limit;
        $where = ["v.network_id = :active_network"];
        $params = [':active_network'=>$activeNetworkId];
        if (!empty($type)) {
            $where[] = "v.voucher_type = :type";
            $params[':type'] = $type;
        }
        if (!empty($partyId)) {
            $where[] = "(v.party_id = :party_id OR v.destination_account_id = :destination_account_id OR v.source_account_id = :source_account_id)";
            $params[':party_id'] = (int)$partyId;
            $params[':destination_account_id'] = (int)$partyId;
            $params[':source_account_id'] = (int)$partyId;
        }
        if (!empty($paymentMethod)) {
            $where[] = "v.payment_method = :pm";
            $params[':pm'] = $paymentMethod;
        }
        if (!empty($category)) {
            $where[] = "v.category = :cat";
            $params[':cat'] = $category;
        }
        if (!empty($startDate)) {
            $where[] = "v.created_at >= :start_date";
            $params[':start_date'] = $startDate . ' 00:00:00';
        }
        if (!empty($endDate)) {
            $where[] = "v.created_at <= :end_date";
            $params[':end_date'] = $endDate . ' 23:59:59';
        }
        if (!empty($search)) {
            $where[] = "(v.voucher_no LIKE :voucher_no_search OR v.party_name LIKE :party_name_search OR v.notes LIKE :voucher_notes_search OR v.category LIKE :voucher_category_search)";
            $params[':voucher_no_search'] = "%$search%";
            $params[':party_name_search'] = "%$search%";
            $params[':voucher_notes_search'] = "%$search%";
            $params[':voucher_category_search'] = "%$search%";
        }
        if (!empty($networkId)) {
            if ((int)$networkId !== $activeNetworkId) throw new DomainException('FORBIDDEN_NETWORK');
            $where[] = "v.network_id = :net_id";
            $params[':net_id'] = (int)$networkId;
        }
        // Role Data Scope Isolation
        if (!in_array($role, ['system_owner', 'superadmin', 'admin', 'finance', 'accountant'], true) && !empty($adminId)) {
            $aid = (int)$adminId;
            $where[] = "(v.created_by = $aid OR v.party_id = $aid OR v.source_account_id = $aid OR v.destination_account_id = $aid)";
        }
        $whereClause = implode(' AND ', $where);
        $cStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_financial v WHERE $whereClause");
        $cStmt->execute($params);
        $total = (int)$cStmt->fetchColumn();
        // Summary calculation
        $sumSql = "
            SELECT 
                COALESCE(SUM(CASE WHEN COALESCE(v.is_void,0)=0 AND v.voucher_type = 'receipt' THEN v.amount ELSE 0 END), 0) as total_receipts,
                COALESCE(SUM(CASE WHEN COALESCE(v.is_void,0)=0 AND v.voucher_type = 'payment' THEN v.amount ELSE 0 END), 0) as total_payments,
                COALESCE(COUNT(CASE WHEN COALESCE(v.is_void,0)=0 AND v.voucher_type = 'receipt' THEN 1 END), 0) as count_receipts,
                COALESCE(COUNT(CASE WHEN COALESCE(v.is_void,0)=0 AND v.voucher_type = 'payment' THEN 1 END), 0) as count_payments
            FROM um_vouchers_financial v 
            WHERE $whereClause
        ";
        $sumStmt = $this->db->prepare($sumSql);
        $sumStmt->execute($params);
        $sumRow = $sumStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_receipts' => 0, 'total_payments' => 0, 'count_receipts' => 0, 'count_payments' => 0];
        $totalReceipts = (float)($sumRow['total_receipts'] ?? 0);
        $totalPayments = (float)($sumRow['total_payments'] ?? 0);
        $countReceipts = (int)($sumRow['count_receipts'] ?? 0);
        $countPayments = (int)($sumRow['count_payments'] ?? 0);
        // Grouped by Category
        $catSql = "
            SELECT v.category, COALESCE(SUM(CASE WHEN COALESCE(v.is_void,0)=0 THEN v.amount ELSE 0 END), 0) as total_amount, COUNT(*) as count 
            FROM um_vouchers_financial v 
            WHERE $whereClause 
            GROUP BY v.category 
            ORDER BY total_amount DESC
        ";
        $catStmt = $this->db->prepare($catSql);
        $catStmt->execute($params);
        $groupedByCategory = $catStmt->fetchAll(PDO::FETCH_ASSOC);
        // Grouped by Party
        $ptySql = "
            SELECT COALESCE(v.party_name, 'غير محدد') as party_name, v.party_id,
                   COALESCE(SUM(CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END), 0) as total_receipts,
                   COALESCE(SUM(CASE WHEN v.voucher_type = 'payment' THEN v.amount ELSE 0 END), 0) as total_payments,
                   COALESCE(SUM(CASE WHEN COALESCE(v.is_void,0)=1 THEN 0 WHEN v.voucher_type = 'receipt' THEN v.amount ELSE -v.amount END), 0) as net_amount,
                   COUNT(*) as count
            FROM um_vouchers_financial v 
            WHERE $whereClause 
            GROUP BY v.party_id, v.party_name 
            ORDER BY count DESC 
            LIMIT 50
        ";
        $ptyStmt = $this->db->prepare($ptySql);
        $ptyStmt->execute($params);
        $groupedByParty = $ptyStmt->fetchAll(PDO::FETCH_ASSOC);
        $sql = "SELECT v.*, u.fullname as creator_name, cc.name as cost_center_name, cc.center_code as cost_center_code,
                       src_adm.fullname as source_account_name, dst_adm.fullname as destination_account_name
                FROM um_vouchers_financial v 
                LEFT JOIN um_admins u ON v.created_by = u.id 
                LEFT JOIN um_cost_centers cc ON v.cost_center_id = cc.id 
                LEFT JOIN um_admins src_adm ON v.source_account_id = src_adm.id
                LEFT JOIN um_admins dst_adm ON v.destination_account_id = dst_adm.id
                WHERE $whereClause 
                ORDER BY v.id DESC 
                LIMIT :limit OFFSET :offset";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        return [
            'success' => true,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => ceil($total / max(1, $limit)),
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'summary' => [
                'total_receipts' => $totalReceipts,
                'total_payments' => $totalPayments,
                'net_flow' => ($totalReceipts - $totalPayments),
                'count_receipts' => $countReceipts,
                'count_payments' => $countPayments,
                'total_count' => $total
            ],
            'grouped_by_category' => $groupedByCategory,
            'grouped_by_party' => $groupedByParty
        ];
    }

    // ==========================================
    // METHOD: getFinancialVoucherDetails
    // ==========================================
    public function getFinancialVoucherDetails($voucherId) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("
            SELECT v.*, 
                   c.fullname as creator_name, c.username as creator_user,
                   u.fullname as updater_name, u.username as updater_user,
                   p.fullname as party_fullname, p.username as party_username, COALESCE(pb.balance,0) as party_balance
            FROM um_vouchers_financial v
            LEFT JOIN um_admins c ON v.created_by = c.id
            LEFT JOIN um_admins u ON v.updated_by = u.id
            LEFT JOIN um_admins p ON v.party_id = p.id
            LEFT JOIN um_admin_network_balances pb ON pb.admin_id=p.id AND pb.network_id=v.network_id
            WHERE v.network_id=? AND v.id = ?
        ");
        $stmt->execute([$networkId,(int)$voucherId]);
        $voucher = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$voucher) {
            throw new Exception('السند غير موجود');
        }
        $voucher['audit_logs'] = $this->getVoucherAuditLogs($voucherId);
        return $voucher;
    }

    // ==========================================
    // METHOD: getVoucherAuditLogs
    // ==========================================
    public function getVoucherAuditLogs($voucherId = null) {
        $networkId=$this->getActiveNetworkId();
        $sql = "
            SELECT l.*, a.fullname as modifier_name, a.username as modifier_user
            FROM um_voucher_audit_logs l
            LEFT JOIN um_admins a ON l.modified_by = a.id
        ";
        $params = [$networkId];
        $sql .= " WHERE l.network_id=?";
        if ($voucherId) {
            $sql .= " AND (l.voucher_id = ? OR l.voucher_no = ?)";
            $params[]=(int)$voucherId;$params[]=(string)$voucherId;
        }
        $sql .= " ORDER BY l.id DESC LIMIT 100";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    // ==========================================
    // SALES RETURNS ENGINE (نظام مردودات ومرتجعات المبيعات والكروت)
    // ==========================================
    // Monetary allocations use integer cents and cumulative rounding, so splitting
    // a discounted invoice into several returns never creates or loses a cent.

    // ==========================================
    // METHOD: getFinancialReport
    // ==========================================
    public function getFinancialReport($period = 'month') {
        $networkId=$this->getActiveNetworkId();
        $dateFilter = "created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
        if ($period === 'today') $dateFilter = "created_at >= CURDATE()";
        if ($period === 'year') $dateFilter = "created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)";
        $salesSql = "SELECT COALESCE(SUM(total_amount),0) net_sales,COALESCE(SUM(discount_amount),0) total_discounts,COALESCE(SUM(CASE WHEN payment_type='wallet' THEN 0 ELSE paid_amount END),0) total_cash_collected FROM um_sales_invoices WHERE network_id=? AND COALESCE(invoice_status,'completed')='completed' AND $dateFilter";
        $q=$this->db->prepare($salesSql);$q->execute([$networkId]);$sales=$q->fetch();
        $expensesSql = "SELECT COALESCE(SUM(amount),0) total_expenses FROM um_vouchers_financial WHERE network_id=? AND voucher_type='payment' AND is_void=0 AND (category IS NULL OR category!='رصيد افتتاحي / مديونية سابقة') AND $dateFilter";
        $q=$this->db->prepare($expensesSql);$q->execute([$networkId]);$expenses=$q->fetch();
        $totDiscounts = (float)$sales['total_discounts'];
        $netSales = (float)$sales['net_sales'];
        $grossSales = $netSales + $totDiscounts;
        $totExp = (float)$expenses['total_expenses'];
        $netProfit = $netSales - $totExp;
        return [
            'gross_revenue' => $grossSales,
            'net_sales' => $netSales,
            'total_discounts' => $totDiscounts,
            'total_cash_collected' => (float)$sales['total_cash_collected'],
            'total_expenses' => $totExp,
            'net_profit' => $netProfit
        ];
    }
    // ==========================================
    // ROUTERS / NAS
    // ==========================================

    // ==========================================
    // METHOD: getChartOfAccounts
    // ==========================================
    public function getChartOfAccounts($networkId = null) {
        $adminId = (int)($_SESSION['admin_id'] ?? 0);
        $isOwner = ($adminId === 1 || !empty($_SESSION['is_system_owner']) || !empty($_SESSION['system_owner_authenticated']));
        
        $scopedNetId = null;
        if ($networkId !== null && $networkId !== 'all' && (int)$networkId > 0) {
            $scopedNetId = (int)$networkId;
        } elseif (!$isOwner || $networkId === null) {
            $scopedNetId = $this->getActiveNetworkId();
        }

        $whereNet = $scopedNetId !== null ? "c.network_id = $scopedNetId AND" : "";
        $whereLineNet = $scopedNetId !== null ? "e.network_id = $scopedNetId AND l.network_id = $scopedNetId AND" : "";

        $sql = "
            SELECT c.*, 
                   p.name_ar as parent_name,
                   adm.fullname as linked_admin_name,
                   adm.username as linked_admin_username,
                   adm.role as linked_admin_role,
                   (SELECT COUNT(*) FROM um_chart_of_accounts ch WHERE ch.network_id=c.network_id AND ch.parent_id = c.id) as children_count
            FROM um_chart_of_accounts c
            LEFT JOIN um_chart_of_accounts p ON c.parent_id = p.id
            LEFT JOIN um_admins adm ON c.linked_admin_id = adm.id
            WHERE $whereNet c.is_active = 1
            ORDER BY c.network_id ASC, c.account_code ASC
        ";
        $accounts = $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        if (empty($accounts) && $scopedNetId !== null) {
            $this->seedStandardChartOfAccounts($scopedNetId);
            $accounts = $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        }
        // Recalculate dynamic balance from posted journal lines for accuracy
        $balStmt = $this->db->query("
            SELECT l.account_id, l.network_id,
                   COALESCE(SUM(l.debit), 0) as total_debit, 
                   COALESCE(SUM(l.credit), 0) as total_credit
            FROM um_journal_entry_lines l
            JOIN um_journal_entries e ON l.journal_entry_id = e.id
            WHERE $whereLineNet e.is_posted = 1
            GROUP BY l.account_id, l.network_id
        ")->fetchAll(PDO::FETCH_ASSOC);
        $balancesMap = [];
        foreach ($balStmt as $b) {
            $balancesMap[$b['account_id']] = [
                'debit' => (float)$b['total_debit'],
                'credit' => (float)$b['total_credit']
            ];
        }
        foreach ($accounts as &$a) {
            $aid = $a['id'];
            $deb = $balancesMap[$aid]['debit'] ?? 0;
            $crd = $balancesMap[$aid]['credit'] ?? 0;
            $isDebitNature = in_array($a['account_type'], ['asset', 'expense']);
            $a['calculated_balance'] = $isDebitNature ? ($deb - $crd) : ($crd - $deb);
            $a['balance'] = $a['calculated_balance'];
            $a['total_debit'] = $deb;
            $a['total_credit'] = $crd;
            $a['debit_credit_nature'] = $isDebitNature ? 'debit' : 'credit';
            // Aliases for frontend compatibility
            $a['code'] = $a['account_code'];
            $a['name'] = $a['name_ar'];
            $a['is_leaf'] = ((int)$a['children_count'] === 0) ? 1 : 0;
        }
        unset($a);
        // Rollup leaf balances to parents (levels 2 and 1)
        $accById = [];
        foreach ($accounts as &$a) {
            $accById[$a['id']] = &$a;
        }
        unset($a);
        for ($lvl = 3; $lvl >= 2; $lvl--) {
            foreach ($accounts as &$a) {
                if ($a['level'] == $lvl && !empty($a['parent_id']) && isset($accById[$a['parent_id']])) {
                    $accById[$a['parent_id']]['balance'] += $a['balance'];
                    $accById[$a['parent_id']]['calculated_balance'] = $accById[$a['parent_id']]['balance'];
                }
            }
            unset($a);
        }
        return $accounts;
    }

    // ==========================================
    // METHOD: saveChartAccount
    // ==========================================
    public function saveChartAccount($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)($data['id'] ?? 0);
        $code = trim($data['account_code'] ?? $data['code'] ?? '');
        $nameAr = trim($data['name_ar'] ?? $data['name'] ?? '');
        $rawType = strtolower(trim($data['account_type'] ?? $data['type'] ?? 'asset'));
        $typeMap = [
            'assets' => 'asset', 'asset' => 'asset',
            'liabilities' => 'liability', 'liability' => 'liability',
            'equity' => 'equity',
            'revenues' => 'revenue', 'revenue' => 'revenue',
            'expenses' => 'expense', 'expense' => 'expense'
        ];
        $type = $typeMap[$rawType] ?? 'asset';
        $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : null;
        $linkedAdminId = !empty($data['linked_admin_id']) ? (int)$data['linked_admin_id'] : null;
        if ($linkedAdminId && !$this->getAdminById($linkedAdminId)) throw new Exception('المستخدم المرتبط لا يتبع الشبكة النشطة');
        if (empty($code) || empty($nameAr)) {
            throw new Exception('يجب إدخال رمز الحساب واسمه باللغة العربية');
        }
        if (!in_array($type, ['asset', 'liability', 'equity', 'revenue', 'expense'])) {
            throw new Exception('نوع الحساب غير صالح');
        }
        $level = 1;
        if ($parentId) {
            $pq=$this->db->prepare("SELECT level FROM um_chart_of_accounts WHERE network_id=? AND id=?");$pq->execute([$networkId,$parentId]);$p=$pq->fetch();
            if ($p) $level = (int)$p['level'] + 1;
        }
        if ($id > 0) {
            $chk = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code = ? AND id != ?");
            $chk->execute([$networkId,$code, $id]);
            if ($chk->fetch()) throw new Exception("رمز الحساب ($code) مسجل مسبقاً، يرجى اختيار رمز آخر");
            $stmt = $this->db->prepare("UPDATE um_chart_of_accounts SET account_code = ?, name_ar = ?, account_type = ?, parent_id = ?, linked_admin_id = ?,owner_admin_id=?, level = ? WHERE network_id=? AND id = ?");
            $stmt->execute([$code, $nameAr, $type, $parentId, $linkedAdminId,$linkedAdminId,$level,$networkId,$id]);
        } else {
            $chk = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code = ?");
            $chk->execute([$networkId,$code]);
            if ($chk->fetch()) throw new Exception("رمز الحساب ($code) مسجل مسبقاً، يرجى اختيار رمز آخر");
            $stmt = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code, name_ar, account_type, parent_id, linked_admin_id,owner_admin_id,level,is_system,is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?,0,1)");
            $stmt->execute([$networkId,$code,$nameAr,$type,$parentId,$linkedAdminId,$linkedAdminId,$level]);
            $id = (int)$this->db->lastInsertId();
        }
        if ($linkedAdminId > 0) {
            $this->db->prepare("UPDATE um_admins SET account_id = ? WHERE id = ?")->execute([$id, $linkedAdminId]);
        }
        return ['success' => true, 'id' => $id, 'message' => 'تم حفظ الحساب في شجرة الحسابات بنجاح'];
    }

    // ==========================================
    // METHOD: deleteChartAccount
    // ==========================================
    public function deleteChartAccount($id, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)$id;
        if ($id <= 0) throw new Exception('معرف الحساب غير صالح');
        $stmt = $this->db->prepare("SELECT * FROM um_chart_of_accounts WHERE network_id=? AND id = ?");
        $stmt->execute([$networkId,$id]);
        $acc = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$acc) throw new Exception('الحساب غير موجود في دليل الحسابات');
        if (!empty($acc['is_system']) && $acc['is_system'] == 1) {
            throw new Exception("لا يمكن حذف الحساب القياسي الأساسي للنظام ({$acc['name_ar']})");
        }
        // Check children
        $chkChild = $this->db->prepare("SELECT COUNT(*) FROM um_chart_of_accounts WHERE network_id=? AND parent_id = ?");
        $chkChild->execute([$networkId,$id]);
        if ($chkChild->fetchColumn() > 0) {
            throw new Exception("لا يمكن حذف الحساب ({$acc['name_ar']}) لأنه يحتوي على حسابات فرعية تحته. يرجى حذف الحسابات الفرعية أولاً.");
        }
        // Check journal lines
        $chkLines = $this->db->prepare("SELECT COUNT(*) FROM um_journal_entry_lines WHERE network_id=? AND account_id = ?");
        $chkLines->execute([$networkId,$id]);
        $linesCount = (int)$chkLines->fetchColumn();
        if ($linesCount > 0) {
            $upd = $this->db->prepare("UPDATE um_chart_of_accounts SET is_active = 0 WHERE network_id=? AND id = ?");
            $upd->execute([$networkId,$id]);
            return [
                'success' => true,
                'action' => 'deactivated',
                'message' => "تم تعطيل الحساب ({$acc['name_ar']}) بنجاح. نظراً لوجود $linesCount قيد محاسبي مسجل عليه، تم إيقاف تنشيطه للحفاظ على توازن اليومية والقوائم المالية."
            ];
        } else {
            $del = $this->db->prepare("DELETE FROM um_chart_of_accounts WHERE network_id=? AND id = ?");
            $del->execute([$networkId,$id]);
            return [
                'success' => true,
                'action' => 'deleted',
                'message' => "تم حذف الحساب ({$acc['name_ar']}) نهائياً بنجاح لعدم وجود حركات مالية عليه."
            ];
        }
    }

    // ==========================================
    // METHOD: createJournalEntry
    // ==========================================
    public function createJournalEntry($data, $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        $entryDate = trim((string)($data['entry_date'] ?? date('Y-m-d')));
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $entryDate);
        if (!$date || $date->format('Y-m-d') !== $entryDate) throw new InvalidArgumentException('تاريخ القيد غير صحيح');
        $sourceModule = trim((string)($data['source_module'] ?? 'manual'));
        $refNo = trim((string)($data['reference_no'] ?? ''));
        $desc = trim((string)($data['description'] ?? ''));
        $lines = $data['lines'] ?? [];
        if ($desc === '') throw new InvalidArgumentException('يجب كتابة البيان أو الوصف للقيد المحاسبي');
        if (!is_array($lines) || count($lines) < 2) throw new InvalidArgumentException('القيد المحاسبي يجب أن يحتوي على طرفين على الأقل');
        $needTx = !$this->db->inTransaction();
        $savepoint = 'sam_journal_' . bin2hex(random_bytes(6));
        if ($needTx) $this->db->beginTransaction();
        else $this->db->exec('SAVEPOINT ' . $savepoint);
        try {
            // Resolve and validate every line before creating the journal header.
            $normalized = [];
            $debitCents = 0; $creditCents = 0;
            foreach ($lines as $ln) {
                if (!is_array($ln)) throw new InvalidArgumentException('سطر القيد غير صحيح');
                $rawDebit = $ln['debit'] ?? 0; $rawCredit = $ln['credit'] ?? 0;
                if (!is_numeric($rawDebit) || !is_numeric($rawCredit) || !is_finite((float)$rawDebit) || !is_finite((float)$rawCredit) || (float)$rawDebit < 0 || (float)$rawCredit < 0 || (float)$rawDebit > 9999999999999.99 || (float)$rawCredit > 9999999999999.99) throw new InvalidArgumentException('مبلغ سطر القيد غير صحيح');
                $d = (int)round((float)$rawDebit * 100); $c = (int)round((float)$rawCredit * 100);
                if ($d === 0 && $c === 0) continue;
                if ($d > 0 && $c > 0) throw new InvalidArgumentException('يجب أن يكون سطر القيد مدينًا أو دائنًا فقط');
                $accId = (int)($ln['account_id'] ?? 0);
                if ($accId <= 0 && !empty($ln['account_code'])) {
                    $aq = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=? AND is_active=1');
                    $aq->execute([$networkId,$ln['account_code']]); $accId = (int)$aq->fetchColumn();
                }
                if ($accId <= 0) throw new DomainException('أحد سطور القيد يفتقر إلى تحديد الحساب المحاسبي');
                $aq = $this->db->prepare('SELECT account_type,account_code,name_ar FROM um_chart_of_accounts WHERE network_id=? AND id=? AND is_active=1 FOR UPDATE');
                $aq->execute([$networkId,$accId]); $acc = $aq->fetch(PDO::FETCH_ASSOC);
                if (!$acc) throw new DomainException('أحد حسابات القيد لا يتبع الشبكة النشطة أو غير فعال');
                $costCenterId = !empty($ln['cost_center_id']) ? (int)$ln['cost_center_id'] : null;
                if ($costCenterId) {
                    $cq = $this->db->prepare('SELECT 1 FROM um_cost_centers WHERE network_id=? AND id=? AND is_active=1');
                    $cq->execute([$networkId,$costCenterId]); if (!$cq->fetchColumn()) throw new DomainException('مركز التكلفة لا يتبع الشبكة النشطة');
                }
                $normalized[] = ['account_id'=>$accId,'account_type'=>$acc['account_type'],'account_code'=>$acc['account_code'],'account_name'=>$acc['name_ar'],'cost_center_id'=>$costCenterId,'debit'=>$d/100,'credit'=>$c/100,'description'=>trim((string)($ln['line_description'] ?? $desc))];
                $debitCents += $d; $creditCents += $c;
            }
            if (count($normalized) < 2 || $debitCents <= 0 || $debitCents !== $creditCents) throw new DomainException('القيد المحاسبي غير متوازن أو لا يحتوي على طرفين فعليين');
            $totalDebit = $debitCents/100; $totalCredit = $creditCents/100;
            $entryNo = 'JV-' . date('Ymd') . '-' . bin2hex(random_bytes(4));
            // A journal remains draft until all details and balances are written.
            $stmt = $this->db->prepare('INSERT INTO um_journal_entries (network_id,entry_no,entry_date,source_module,reference_no,description,total_debit,total_credit,is_posted,created_by) VALUES (?,?,?,?,?,?,?,?,0,?)');
            $stmt->execute([$networkId,$entryNo,$entryDate,$sourceModule,$refNo,$desc,$totalDebit,$totalCredit,$currentAdminId]);
            $entryId = (int)$this->db->lastInsertId();
            $lineStmt = $this->db->prepare('INSERT INTO um_journal_entry_lines (network_id,journal_entry_id,account_id,cost_center_id,debit,credit,line_description,line_index) VALUES (?,?,?,?,?,?,?,?)');
            $balanceStmt = $this->db->prepare('UPDATE um_chart_of_accounts SET balance=balance+? WHERE network_id=? AND id=?');
            foreach ($normalized as $idx=>$ln) {
                $lineStmt->execute([$networkId,$entryId,$ln['account_id'],$ln['cost_center_id'],$ln['debit'],$ln['credit'],$ln['description'],$idx]);
                $delta = in_array($ln['account_type'],['asset','expense'],true) ? $ln['debit']-$ln['credit'] : $ln['credit']-$ln['debit'];
                $balanceStmt->execute([$delta,$networkId,$ln['account_id']]);
            }
            $verify = $this->db->prepare('SELECT COUNT(*) line_count,COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit FROM um_journal_entry_lines WHERE network_id=? AND journal_entry_id=?');
            $verify->execute([$networkId,$entryId]); $totals = $verify->fetch(PDO::FETCH_ASSOC);
            if ((int)$totals['line_count'] !== count($normalized) || (int)round((float)$totals['debit']*100) !== $debitCents || (int)round((float)$totals['credit']*100) !== $creditCents) throw new RuntimeException('فشل التحقق من تفاصيل القيد');
            $this->db->prepare('UPDATE um_journal_entries SET is_posted=1 WHERE network_id=? AND id=? AND is_posted=0')->execute([$networkId,$entryId]);
            if ($needTx) $this->db->commit();
            else $this->db->exec('RELEASE SAVEPOINT ' . $savepoint);
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                if ($needTx) $this->db->rollBack();
                else { $this->db->exec('ROLLBACK TO SAVEPOINT ' . $savepoint); $this->db->exec('RELEASE SAVEPOINT ' . $savepoint); }
            }
            throw $e;
        }
        // Parent workflows deliver their own notifications after committing.
        if ($needTx) {
            try {
                require_once __DIR__ . '/TelegramService.php';
                $tg = new TelegramService($this->db);
                $tg->notifyJournalEntry(['entry_no'=>$entryNo,'entry_date'=>$entryDate,'source_module'=>$sourceModule,'description'=>$desc,'total_debit'=>$totalDebit],$normalized,$currentAdminId);
            } catch (Throwable $e) { error_log('Telegram journal alert skipped: ' . get_class($e)); }
        }
        return ['success'=>true,'entry_id'=>$entryId,'entry_no'=>$entryNo,'total_amount'=>$totalDebit,'message'=>"تم ترحيل القيد المحاسبي المتوازن ($entryNo) بنجاح"];
    }

    // ==========================================
    // METHOD: getJournalEntries
    // ==========================================
    public function getJournalEntries($filters = []) {
        $networkId=$this->getActiveNetworkId();
        $where = ["e.network_id=?"];
        $params = [$networkId];
        if (!empty($filters['start_date'])) {
            $where[] = "e.entry_date >= ?";
            $params[] = $filters['start_date'];
        }
        if (!empty($filters['end_date'])) {
            $where[] = "e.entry_date <= ?";
            $params[] = $filters['end_date'];
        }
        if (!empty($filters['source_module'])) {
            $where[] = "e.source_module = ?";
            $params[] = $filters['source_module'];
        }
        if (!empty($filters['search'])) {
            $where[] = "(e.entry_no LIKE ? OR e.description LIKE ? OR e.reference_no LIKE ?)";
            $s = '%' . $filters['search'] . '%';
            $params[] = $s; $params[] = $s; $params[] = $s;
        }
        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT e.*, e.source_module as source, a.fullname as creator_name
            FROM um_journal_entries e
            LEFT JOIN um_admins a ON e.created_by = a.id
            WHERE $whereSql
            ORDER BY e.entry_date DESC, e.id DESC
            LIMIT 150
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Fetch lines for each entry
        foreach ($entries as &$entry) {
            $eid = $entry['id'];
            $linesSql = "
                SELECT l.*, c.account_code, c.name_ar as account_name, c.account_type,
                       cc.name as cost_center_name
                FROM um_journal_entry_lines l
                JOIN um_chart_of_accounts c ON l.account_id = c.id
                LEFT JOIN um_cost_centers cc ON l.cost_center_id = cc.id
                WHERE l.network_id=$networkId AND c.network_id=$networkId AND l.journal_entry_id = $eid
                ORDER BY l.line_index ASC
            ";
            $entry['lines'] = $this->db->query($linesSql)->fetchAll(PDO::FETCH_ASSOC);
        }
        return $entries;
    }

    // ==========================================
    // METHOD: getTrialBalance
    // ==========================================
    public function getTrialBalance($asOfDate = null) {
        $networkId=$this->getActiveNetworkId();
        $asOf = $asOfDate ?: date('Y-m-d');
        $sql = "
            SELECT c.id, 
                   c.account_code, c.account_code as code,
                   c.name_ar as account_name, c.name_ar as name,
                   c.account_type, c.level,
                   COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit ELSE 0 END), 0) as total_debit,
                   COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit ELSE 0 END), 0) as total_credit
            FROM um_chart_of_accounts c
            LEFT JOIN um_journal_entry_lines l ON c.id = l.account_id AND l.network_id=c.network_id
            LEFT JOIN um_journal_entries e ON l.journal_entry_id = e.id AND e.network_id=c.network_id AND e.entry_date <= ? AND e.is_posted = 1
            WHERE c.network_id=? AND c.is_active = 1
            GROUP BY c.id, c.account_code, c.name_ar, c.account_type, c.level
            ORDER BY c.account_code ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$asOf,$networkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $grandDebit = 0.00;
        $grandCredit = 0.00;
        $grandEndingDebit = 0.00;
        $grandEndingCredit = 0.00;
        $trialRows = [];
        foreach ($rows as $r) {
            $deb = (float)$r['total_debit'];
            $crd = (float)$r['total_credit'];
            $type = $r['account_type'];
            $endingDebit = 0.00;
            $endingCredit = 0.00;
            if (in_array($type, ['asset', 'expense'])) {
                $net = $deb - $crd;
                if ($net >= 0) {
                    $endingDebit = $net;
                } else {
                    $endingCredit = abs($net);
                }
            } else {
                $net = $crd - $deb;
                if ($net >= 0) {
                    $endingCredit = $net;
                } else {
                    $endingDebit = abs($net);
                }
            }
            $r['ending_debit'] = $endingDebit;
            $r['ending_credit'] = $endingCredit;
            $trialRows[] = $r;
            $grandDebit += $deb;
            $grandCredit += $crd;
            $grandEndingDebit += $endingDebit;
            $grandEndingCredit += $endingCredit;
        }
        $isBal = abs($grandEndingDebit - $grandEndingCredit) < 0.01;
        return [
            'as_of_date' => $asOf,
            'trial_balance' => $trialRows,
            'rows' => $trialRows,
            'totals' => [
                'debit' => $grandEndingDebit,
                'credit' => $grandEndingCredit,
                'is_balanced' => $isBal,
                'diff' => abs($grandEndingDebit - $grandEndingCredit)
            ],
            'grand_total_debit' => $grandDebit,
            'grand_total_credit' => $grandCredit,
            'grand_ending_debit' => $grandEndingDebit,
            'grand_ending_credit' => $grandEndingCredit,
            'is_balanced' => $isBal
        ];
    }

    // ==========================================
    // METHOD: getGeneralLedger
    // ==========================================
    public function getGeneralLedger($accountId, $startDate = null, $endDate = null) {
        $networkId=$this->getActiveNetworkId();
        $aq=$this->db->prepare("SELECT * FROM um_chart_of_accounts WHERE network_id=? AND id=?");$aq->execute([$networkId,(int)$accountId]);$acc=$aq->fetch(PDO::FETCH_ASSOC);
        if (!$acc) throw new Exception('الحساب غير موجود');
        $start = $startDate ?: date('Y-m-01');
        $end = $endDate ?: date('Y-m-d');
        // Calculate opening balance before start_date
        $opSql = "
            SELECT COALESCE(SUM(l.debit), 0) as op_debit, COALESCE(SUM(l.credit), 0) as op_credit
            FROM um_journal_entry_lines l
            JOIN um_journal_entries e ON l.journal_entry_id = e.id
            WHERE l.network_id=? AND e.network_id=? AND l.account_id = ? AND e.entry_date < ? AND e.is_posted = 1
        ";
        $opStmt = $this->db->prepare($opSql);
        $opStmt->execute([$networkId,$networkId,(int)$accountId, $start]);
        $op = $opStmt->fetch();
        $opDeb = (float)$op['op_debit'];
        $opCrd = (float)$op['op_credit'];
        $isAssetOrExpense = in_array($acc['account_type'], ['asset', 'expense']);
        $openingBalance = $isAssetOrExpense ? ($opDeb - $opCrd) : ($opCrd - $opDeb);
        // Fetch movements during period
        $movSql = "
            SELECT l.*, e.entry_no, e.entry_date, e.source_module, e.reference_no, e.description as main_desc,
                   cc.name as cost_center_name
            FROM um_journal_entry_lines l
            JOIN um_journal_entries e ON l.journal_entry_id = e.id
            LEFT JOIN um_cost_centers cc ON l.cost_center_id = cc.id
            WHERE l.network_id=? AND e.network_id=? AND l.account_id = ? AND e.entry_date BETWEEN ? AND ? AND e.is_posted = 1
            ORDER BY e.entry_date ASC, e.id ASC, l.line_index ASC
        ";
        $movStmt = $this->db->prepare($movSql);
        $movStmt->execute([$networkId,$networkId,(int)$accountId, $start, $end]);
        $movements = $movStmt->fetchAll(PDO::FETCH_ASSOC);
        $running = $openingBalance;
        $periodDebit = 0.00;
        $periodCredit = 0.00;
        foreach ($movements as &$m) {
            $d = (float)$m['debit'];
            $c = (float)$m['credit'];
            $periodDebit += $d;
            $periodCredit += $c;
            $running += $isAssetOrExpense ? ($d - $c) : ($c - $d);
            $m['running_balance'] = $running;
        }
        return [
            'account' => $acc,
            'start_date' => $start,
            'end_date' => $end,
            'opening_balance' => $openingBalance,
            'movements' => $movements,
            'lines' => $movements,
            'period_total_debit' => $periodDebit,
            'period_total_credit' => $periodCredit,
            'closing_balance' => $running
        ];
    }

    // ==========================================
    // METHOD: getComprehensiveFinancialStatements
    // ==========================================
    public function getComprehensiveFinancialStatements($period = 'month', $startDate = null, $endDate = null) {
        $networkId=$this->getActiveNetworkId();
        if ($startDate && $endDate) {
            $start = $startDate;
            $end = $endDate;
        } else {
            if ($period === 'today') {
                $start = date('Y-m-d');
                $end = date('Y-m-d');
            } elseif ($period === 'year') {
                $start = date('Y-01-01');
                $end = date('Y-12-31');
            } else {
                $start = date('Y-m-01');
                $end = date('Y-m-d');
            }
        }
        // Fetch Income Statement balances for the period
        $incSql = "
            SELECT c.account_code, c.name_ar, c.account_type,
                   COALESCE(SUM(l.debit), 0) as deb,
                   COALESCE(SUM(l.credit), 0) as crd
            FROM um_chart_of_accounts c
            LEFT JOIN um_journal_entry_lines l ON c.id = l.account_id AND l.network_id=c.network_id
            LEFT JOIN um_journal_entries e ON l.journal_entry_id = e.id AND e.network_id=c.network_id AND e.entry_date BETWEEN ? AND ? AND e.is_posted = 1
            WHERE c.network_id=? AND c.account_type IN ('revenue', 'expense') AND c.is_active = 1
            GROUP BY c.id, c.account_code, c.name_ar, c.account_type
            ORDER BY c.account_code ASC
        ";
        $incStmt = $this->db->prepare($incSql);
        $incStmt->execute([$start, $end,$networkId]);
        $incRows = $incStmt->fetchAll(PDO::FETCH_ASSOC);
        $revenues = [];
        $cogs = [];
        $operatingExpenses = [];
        $generalExpenses = [];
        $totalRevenue = 0.00;
        $totalCogs = 0.00;
        $totalOperating = 0.00;
        $totalGeneral = 0.00;
        foreach ($incRows as $r) {
            $code = $r['account_code'];
            $type = $r['account_type'];
            $val = $type === 'revenue' ? ((float)$r['crd'] - (float)$r['deb']) : ((float)$r['deb'] - (float)$r['crd']);
            $item = ['code' => $code, 'name' => $r['name_ar'], 'amount' => $val];
            if ($type === 'revenue') {
                $revenues[] = $item;
                $totalRevenue += $val;
            } elseif (str_starts_with($code, '51')) {
                $cogs[] = $item;
                $totalCogs += $val;
            } elseif (str_starts_with($code, '52')) {
                $operatingExpenses[] = $item;
                $totalOperating += $val;
            } else {
                $generalExpenses[] = $item;
                $totalGeneral += $val;
            }
        }
        $grossProfit = $totalRevenue - $totalCogs;
        $totalExpenses = $totalOperating + $totalGeneral;
        $netProfit = $grossProfit - $totalExpenses;
        // Balance Sheet as of $end
        $bsSql = "
            SELECT c.account_code, c.name_ar, c.account_type,
                   COALESCE(SUM(l.debit), 0) as deb,
                   COALESCE(SUM(l.credit), 0) as crd
            FROM um_chart_of_accounts c
            LEFT JOIN um_journal_entry_lines l ON c.id = l.account_id AND l.network_id=c.network_id
            LEFT JOIN um_journal_entries e ON l.journal_entry_id = e.id AND e.network_id=c.network_id AND e.entry_date <= ? AND e.is_posted = 1
            WHERE c.network_id=? AND c.account_type IN ('asset', 'liability', 'equity') AND c.is_active = 1
            GROUP BY c.id, c.account_code, c.name_ar, c.account_type
            ORDER BY c.account_code ASC
        ";
        $bsStmt = $this->db->prepare($bsSql);
        $bsStmt->execute([$end,$networkId]);
        $bsRows = $bsStmt->fetchAll(PDO::FETCH_ASSOC);
        $currentAssets = [];
        $fixedAssets = [];
        $currentLiabilities = [];
        $equity = [];
        $totalCurrentAssets = 0.00;
        $totalFixedAssets = 0.00;
        $totalLiabilities = 0.00;
        $totalEquity = 0.00;
        foreach ($bsRows as $r) {
            $code = $r['account_code'];
            $type = $r['account_type'];
            $val = ($type === 'asset') ? ((float)$r['deb'] - (float)$r['crd']) : ((float)$r['crd'] - (float)$r['deb']);
            $item = ['code' => $code, 'name' => $r['name_ar'], 'amount' => $val];
            if ($type === 'asset') {
                if (str_starts_with($code, '15')) {
                    $fixedAssets[] = $item;
                    $totalFixedAssets += $val;
                } else {
                    $currentAssets[] = $item;
                    $totalCurrentAssets += $val;
                }
            } elseif ($type === 'liability') {
                $currentLiabilities[] = $item;
                $totalLiabilities += $val;
            } elseif ($type === 'equity') {
                $equity[] = $item;
                $totalEquity += $val;
            }
        }
        $totalAssets = $totalCurrentAssets + $totalFixedAssets;
        // Total Equity including current period net profit
        $totalEquityWithNet = $totalEquity + $netProfit;
        $totalLiabAndEquity = $totalLiabilities + $totalEquityWithNet;
        $allExpenses = array_merge($operatingExpenses, $generalExpenses);
        $allAssets = array_merge($currentAssets, $fixedAssets);
        $diff = abs($totalAssets - $totalLiabAndEquity);
        $isBal = $diff < 0.05;
        return [
            'success' => true,
            'period' => [
                'name' => $period,
                'start_date' => $start,
                'end_date' => $end
            ],
            'start_date' => $start,
            'end_date' => $end,
            'income_statement' => [
                'revenues' => $revenues,
                'total_revenue' => $totalRevenue,
                'total_revenues' => $totalRevenue,
                'net_revenues' => $totalRevenue,
                'discounts' => [],
                'total_discounts' => 0.00,
                'cogs' => $cogs,
                'total_cogs' => $totalCogs,
                'cost_of_sales' => $cogs,
                'total_cost_of_sales' => $totalCogs,
                'gross_profit' => $grossProfit,
                'operating_expenses' => $operatingExpenses,
                'total_operating_expenses' => $totalOperating,
                'general_expenses' => $generalExpenses,
                'total_general_expenses' => $totalGeneral,
                'expenses' => $allExpenses,
                'total_expenses' => $totalExpenses,
                'net_profit' => $netProfit,
                'net_operating_income' => $netProfit
            ],
            'balance_sheet' => [
                'as_of_date' => $end,
                'assets' => $allAssets,
                'current_assets' => $currentAssets,
                'total_current_assets' => $totalCurrentAssets,
                'fixed_assets' => $fixedAssets,
                'total_fixed_assets' => $totalFixedAssets,
                'total_assets' => $totalAssets,
                'liabilities' => $currentLiabilities,
                'current_liabilities' => $currentLiabilities,
                'total_liabilities' => $totalLiabilities,
                'equity' => $equity,
                'current_period_net_profit' => $netProfit,
                'total_equity' => $totalEquityWithNet,
                'total_liabilities_and_equity' => $totalLiabAndEquity,
                'is_balanced' => $isBal,
                'diff' => $diff
            ]
        ];
    }

    // ==========================================
    // METHOD: getCostCentersReport
    // ==========================================
    public function getCostCentersReport($startDate = null, $endDate = null) {
        $networkId=$this->getActiveNetworkId();
        $start = $startDate ?: date('Y-m-01');
        $end = $endDate ?: date('Y-m-d');
        $sql = "
            SELECT cc.id, cc.center_code, cc.name, cc.center_type,
                   COALESCE(SUM(CASE WHEN c.account_type = 'revenue' THEN (l.credit - l.debit) ELSE 0 END), 0) as revenue,
                   COALESCE(SUM(CASE WHEN c.account_type = 'expense' THEN (l.debit - l.credit) ELSE 0 END), 0) as expense
            FROM um_cost_centers cc
            LEFT JOIN um_journal_entry_lines l ON cc.id = l.cost_center_id AND l.network_id=cc.network_id
            LEFT JOIN um_journal_entries e ON l.journal_entry_id = e.id AND e.network_id=cc.network_id AND e.entry_date BETWEEN ? AND ? AND e.is_posted = 1
            LEFT JOIN um_chart_of_accounts c ON l.account_id = c.id AND c.network_id=cc.network_id
            WHERE cc.network_id=? AND cc.is_active = 1
            GROUP BY cc.id, cc.center_code, cc.name, cc.center_type
            ORDER BY revenue DESC, expense DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$start, $end,$networkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $rev = (float)$r['revenue'];
            $exp = (float)$r['expense'];
            $net = $rev - $exp;
            $marginPct = $rev > 0 ? round(($net / $rev) * 100, 1) : 0;
            $r['total_revenue'] = $rev;
            $r['total_expense'] = $exp;
            $r['net_profit'] = $net;
            $r['net_margin'] = $net;
            $r['code'] = $r['center_code'];
            $r['type'] = $r['center_type'];
            $r['margin_percent'] = $marginPct;
            $r['margin_percentage'] = $marginPct;
        }
        return [
            'success' => true,
            'start_date' => $start,
            'end_date' => $end,
            'centers' => $rows,
            'cost_centers' => $rows
        ];
    }

    // ==========================================
    // METHOD: saveCostCenter
    // ==========================================
    public function saveCostCenter($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)($data['id'] ?? 0);
        $name = trim($data['name'] ?? '');
        $type = trim($data['center_type'] ?? $data['type'] ?? 'general');
        $code = trim($data['center_code'] ?? $data['code'] ?? '');
        $refId = !empty($data['ref_id']) ? (int)$data['ref_id'] : null;
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        if (empty($name)) {
            throw new Exception('يجب إدخال اسم مركز التكلفة');
        }
        $validTypes = ['router', 'tower_node', 'branch', 'project', 'general'];
        if (!in_array($type, $validTypes)) {
            $type = 'general';
        }
        if (empty($code)) {
            $prefix = 'CC-' . strtoupper(substr($type, 0, 3));
            $rnd = rand(100, 999);
            $code = $prefix . '-' . $rnd;
            $chk = $this->db->prepare("SELECT COUNT(*) FROM um_cost_centers WHERE network_id=? AND center_code = ?");
            $chk->execute([$networkId,$code]);
            while ($chk->fetchColumn() > 0) {
                $rnd = rand(100, 999);
                $code = $prefix . '-' . $rnd;
                $chk->execute([$networkId,$code]);
            }
        } else {
            $chk = $this->db->prepare("SELECT id FROM um_cost_centers WHERE network_id=? AND center_code = ? AND id != ?");
            $chk->execute([$networkId,$code, $id]);
            if ($chk->fetch()) {
                throw new Exception("رمز مركز التكلفة ($code) مستخدم مسبقاً، يرجى اختيار رمز آخر");
            }
        }
        if ($id > 0) {
            $stmt = $this->db->prepare("
                UPDATE um_cost_centers 
                SET name = ?, center_code = ?, center_type = ?, ref_id = ?, is_active = ?
                WHERE network_id=? AND id = ?
            ");
            $stmt->execute([$name, $code, $type, $refId, $isActive,$networkId,$id]);
            $msg = 'تم تحديث بيانات مركز التكلفة بنجاح';
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_cost_centers (network_id,center_code, name, center_type, ref_id, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$networkId,$code, $name, $type, $refId, $isActive]);
            $id = (int)$this->db->lastInsertId();
            $msg = 'تم إضافة مركز التكلفة الجديد بنجاح';
        }
        return [
            'success' => true,
            'id' => $id,
            'code' => $code,
            'name' => $name,
            'type' => $type,
            'message' => $msg
        ];
    }

    // ==========================================
    // METHOD: deleteCostCenter
    // ==========================================
    public function deleteCostCenter($id, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)$id;
        if ($id <= 0) throw new Exception('معرف مركز التكلفة غير صالح');
        $stmt = $this->db->prepare("SELECT * FROM um_cost_centers WHERE network_id=? AND id = ?");
        $stmt->execute([$networkId,$id]);
        $center = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$center) throw new Exception('مركز التكلفة غير موجود');
        // Check if referenced in journal entry lines
        $chkLines = $this->db->prepare("SELECT COUNT(*) FROM um_journal_entry_lines WHERE network_id=? AND cost_center_id = ?");
        $chkLines->execute([$networkId,$id]);
        $refCount = (int)$chkLines->fetchColumn();
        if ($refCount > 0) {
            // Soft delete to protect financial audit trail
            $upd = $this->db->prepare("UPDATE um_cost_centers SET is_active = 0 WHERE network_id=? AND id = ?");
            $upd->execute([$networkId,$id]);
            return [
                'success' => true,
                'action' => 'deactivated',
                'message' => "تم تعطيل وتجميد مركز التكلفة ({$center['name']}) بنجاح؛ نظراً لوجود $refCount قيد وحركة محاسبية مسجلة عليه للحفاظ على السجلات المالية."
            ];
        } else {
            // Hard delete
            $del = $this->db->prepare("DELETE FROM um_cost_centers WHERE network_id=? AND id = ?");
            $del->execute([$networkId,$id]);
            return [
                'success' => true,
                'action' => 'deleted',
                'message' => "تم حذف مركز التكلفة ({$center['name']}) نهائياً بنجاح لعدم وجود حركات مالية مرتبطة به."
            ];
        }
    }

    // ==========================================
    // METHOD: getPartnersEquitySummary
    // ==========================================
    public function getPartnersEquitySummary() {
        $networkId=$this->getActiveNetworkId();
        $sql = "
            SELECT p.*, a.fullname as admin_name, a.phone, COALESCE(ab.balance,0) as admin_debt,
                   coa.account_code as current_account_code, coa.name_ar as current_account_name
            FROM um_partners_equity p
            LEFT JOIN um_admins a ON p.admin_id = a.id
            LEFT JOIN um_admin_network_balances ab ON ab.admin_id=a.id AND ab.network_id=p.network_id
            LEFT JOIN um_chart_of_accounts coa ON p.current_account_id = coa.id AND coa.network_id=p.network_id
            WHERE p.network_id=$networkId
            ORDER BY p.profit_share_percent DESC
        ";
        $partners = $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        // Fetch recent distributions
        $distSql = "SELECT * FROM um_profit_distributions WHERE network_id=$networkId ORDER BY created_at DESC LIMIT 10";
        $distributions = $this->db->query($distSql)->fetchAll(PDO::FETCH_ASSOC);
        $totalCapital = 0.00;
        foreach ($partners as &$p) {
            $cap = (float)($p['capital_share'] ?? $p['capital_amount'] ?? 0);
            $totalCapital += $cap;
            $p['share_percentage'] = (float)($p['profit_share_percent'] ?? $p['share_percent'] ?? 0);
            // Calculate actual balance of partner current account from general ledger
            $curBal = 0;
            if (!empty($p['current_account_id'])) {
                $bStmt = $this->db->prepare("
                    SELECT COALESCE(SUM(credit) - SUM(debit), 0) as balance,
                           COALESCE(SUM(credit), 0) as total_credits,
                           COALESCE(SUM(debit), 0) as total_debits
                    FROM um_journal_entry_lines
                    WHERE network_id=? AND account_id = ?
                ");
                $bStmt->execute([$networkId,$p['current_account_id']]);
                $balRow = $bStmt->fetch(PDO::FETCH_ASSOC);
                $curBal = (float)($balRow['balance'] ?? 0);
                $p['total_profits_received'] = (float)($balRow['total_credits'] ?? 0);
                $p['total_drawings'] = (float)($balRow['total_debits'] ?? 0);
            } else {
                $p['total_drawings'] = 0;
                $p['total_profits_received'] = 0;
            }
            $p['current_account_balance'] = $curBal;
        }
        return [
            'success' => true,
            'partners' => $partners,
            'total_capital' => $totalCapital,
            'distributions' => $distributions
        ];
    }

    // ==========================================
    // METHOD: distributeProfits
    // ==========================================
    public function distributeProfits($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $start = trim($data['start_date'] ?? $data['period_start'] ?? date('Y-m-01'));
        $end = trim($data['end_date'] ?? $data['period_end'] ?? date('Y-m-d'));
        $notes = trim($data['notes'] ?? 'توزيع أرباح دورية للشركاء');
        $periodName = trim($data['period_name'] ?? ('أرباح الفترة ' . $start . ' إلى ' . $end));
        $fin = $this->getComprehensiveFinancialStatements('custom', $start, $end);
        if (!empty($data['total_net_profit']) && (float)$data['total_net_profit'] > 0) {
            $netProfit = (float)$data['total_net_profit'];
        } else {
            $netProfit = (float)($fin['income_statement']['net_profit'] ?? $fin['income_statement']['net_operating_income'] ?? 0);
        }
        if ($netProfit <= 0) {
            throw new Exception("صافي الربح للفترة المحددة (" . number_format($netProfit, 2) . " ر.ي) لا يسمح بإجراء توزيع أرباح");
        }
        $partners = $this->db->query("SELECT * FROM um_partners_equity WHERE network_id=$networkId ORDER BY profit_share_percent DESC")->fetchAll(PDO::FETCH_ASSOC);
        if (empty($partners)) throw new Exception('لا يوجد شركاء مسجلون في منظومة حقوق الملكية');
        $distNo = 'DIST-' . date('YmdHis') . '-' . rand(100, 999);
        $partnerLines = [];
        $totalDistributed = 0.00;
        $journalLines = [];
        // Debit Retained/Current profit account 3302
        $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND (account_code='3302' OR account_type='equity') ORDER BY account_code='3302' DESC LIMIT 1");$aq->execute([$networkId]);$accProfitId=(int)$aq->fetchColumn();
        $journalLines[] = [
            'account_id' => $accProfitId,
            'debit' => $netProfit,
            'credit' => 0,
            'line_description' => "إثبات الأرباح الصافية المعتمدة للتوزيع للفترة من $start إلى $end"
        ];
        // Credit each partner current account
        $aq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='3201'");$aq->execute([$networkId]);$accPartnerGeneral=(int)$aq->fetchColumn();
        foreach ($partners as $p) {
            $sharePct = (float)$p['profit_share_percent'];
            $shareAmount = round($netProfit * ($sharePct / 100), 2);
            $totalDistributed += $shareAmount;
            $partnerLines[] = [
                'partner_id' => $p['id'],
                'partner_name' => $p['partner_name'],
                'share_percent' => $sharePct,
                'share_amount' => $shareAmount
            ];
            $targetAcc = !empty($p['current_account_id']) ? (int)$p['current_account_id'] : $accPartnerGeneral;
            $journalLines[] = [
                'account_id' => $targetAcc,
                'debit' => 0,
                'credit' => $shareAmount,
                'line_description' => "نصيب الشريك ({$p['partner_name']}) بنسبة {$sharePct}% من أرباح الفترة"
            ];
        }
        // Create journal entry
        $jvRes = $this->createJournalEntry([
            'entry_date' => date('Y-m-d'),
            'source_module' => 'profit_distribution',
            'reference_no' => $distNo,
            'description' => "توزيع أرباح دورية معتمدة للفترة من $start إلى $end بإجمالي " . number_format($netProfit, 2) . " ر.ي",
            'lines' => $journalLines
        ], $currentAdminId);
        // Record profit distribution header
        $insDist = $this->db->prepare("
            INSERT INTO um_profit_distributions
            (network_id,distribution_no, period_start, period_end, gross_revenue, cogs_amount, expenses_amount, net_profit, distribution_status, journal_entry_id, details_json, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)
        ");
        $totRev = (float)($fin['income_statement']['total_revenue'] ?? $fin['income_statement']['total_revenues'] ?? 0);
        $totCogs = (float)($fin['income_statement']['total_cogs'] ?? $fin['income_statement']['total_cost_of_sales'] ?? 0);
        $totExp = (float)($fin['income_statement']['total_expenses'] ?? 0);
        $insDist->execute([
            $networkId,$distNo,
            $start,
            $end,
            $totRev,
            $totCogs,
            $totExp,
            $netProfit,
            $jvRes['entry_id'],
            json_encode($partnerLines, JSON_UNESCAPED_UNICODE),
            $currentAdminId
        ]);
        $distId = (int)$this->db->lastInsertId();
        return [
            'success' => true,
            'distribution_id' => $distId,
            'distribution_no' => $distNo,
            'net_profit' => $netProfit,
            'journal_entry_id' => $jvRes['entry_id'],
            'journal_entry_no' => $jvRes['entry_no'],
            'partner_shares' => $partnerLines,
            'message' => "تم اعتماد وتوزيع أرباح الفترة بقيمة (" . number_format($netProfit, 2) . " ر.ي) وترحيل القيد المحاسبي المزدوج بنجاح"
        ];
    }
    // ==========================================
    // PARTNERS MANAGEMENT & CAPITAL CONTRIBUTION
    // ==========================================

    // ==========================================
    // METHOD: savePartner
    // ==========================================
    public function savePartner($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)($data['id'] ?? 0);
        $name = trim((string)($data['partner_name'] ?? ''));
        $adminId = !empty($data['admin_id']) ? (int)$data['admin_id'] : null;
        $sharePct = (float)($data['share_percentage'] ?? $data['profit_share_percent'] ?? 0);
        $capital = (float)($data['capital_share'] ?? $data['capital_amount'] ?? 0);
        $currentAccId = !empty($data['current_account_id']) ? (int)$data['current_account_id'] : null;
        $phone = normalizeYemenPhone(trim((string)($data['phone'] ?? '')));
        $email = trim((string)($data['email'] ?? ''));
        $notes = trim((string)($data['notes'] ?? ''));
        $depositCapital = !empty($data['deposit_capital']);
        $paymentAccId = (int)($data['payment_account_id'] ?? 21);
        if($adminId && !$this->getAdminById($adminId)) return ['success'=>false,'error'=>'حساب الشريك لا يتبع الشبكة النشطة'];
        if (empty($name)) {
            return ['success' => false, 'error' => 'يرجى إدخال اسم الشريك بشكل صحيح'];
        }
        if ($sharePct < 0 || $sharePct > 100) {
            return ['success' => false, 'error' => 'نسبة المساهمة/الأرباح يجب أن تكون بين 0% و 100%'];
        }
        $this->db->beginTransaction();
        try {
            if ($id > 0 && empty($currentAccId)) {
                $chkStmt = $this->db->prepare("SELECT current_account_id FROM um_partners_equity WHERE network_id=? AND id = ?");
                $chkStmt->execute([$networkId,$id]);
                $currentAccId = (int)$chkStmt->fetchColumn();
            }
            if (empty($currentAccId)) {
                $pq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('3202','3200') ORDER BY account_code='3202' DESC LIMIT 1");$pq->execute([$networkId]);$parentAcc=$pq->fetch();
                if(!$parentAcc) throw new Exception('حساب حقوق الشركاء غير موجود في الشبكة النشطة');
                $parentAccId = (int)$parentAcc['id'];
                $idx = 1;
                do {
                    $subCode = '3202-' . sprintf('%02d', $idx++);
                    $eq=$this->db->prepare("SELECT COUNT(*) FROM um_chart_of_accounts WHERE network_id=? AND account_code=?");$eq->execute([$networkId,$subCode]);$exists=(int)$eq->fetchColumn();
                } while ($exists > 0);
                $insAcc = $this->db->prepare("
                    INSERT INTO um_chart_of_accounts 
                    (network_id,account_code, name_ar, name_en, account_type, level, parent_id, linked_admin_id,owner_admin_id,is_system,is_active)
                    VALUES (?, ?, ?, ?, 'equity', 3, ?, ?, ?, 1, 1)
                ");
                $insAcc->execute([$networkId,$subCode,'جاري الشريك - '.$name,'Partner Current - '.$name,$parentAccId,$adminId,$adminId]);
                $currentAccId = (int)$this->db->lastInsertId();
            }
            if ($id > 0) {
                $upd = $this->db->prepare("
                    UPDATE um_partners_equity 
                    SET admin_id = ?, partner_name = ?, profit_share_percent = ?, 
                        capital_amount = ?, current_account_id = ?, notes = ?
                    WHERE network_id=? AND id = ?
                ");
                $upd->execute([$adminId, $name, $sharePct, $capital, $currentAccId, $notes,$networkId,$id]);
                $partnerId = $id;
            } else {
                $ins = $this->db->prepare("
                    INSERT INTO um_partners_equity 
                    (network_id,admin_id, partner_name, profit_share_percent, capital_amount, current_account_id, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $ins->execute([$networkId,$adminId, $name, $sharePct, $capital, $currentAccId, $notes]);
                $partnerId = (int)$this->db->lastInsertId();
            }
            if ($depositCapital && $capital > 0 && $id == 0) {
                $cq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='3101' LIMIT 1");$cq->execute([$networkId]);$capAccId=(int)$cq->fetchColumn();if(!$capAccId)throw new Exception('حساب رأس المال غير موجود في الشبكة النشطة');
                $this->createJournalEntry([
                    'entry_date' => date('Y-m-d'),
                    'source_module' => 'manual',
                    'reference_no' => 'CAP-' . date('Ymd') . '-' . sprintf('%03d', $partnerId),
                    'description' => "إيداع حصة مساهمة رأس مال الشريك ($name) بمبلغ " . number_format($capital, 2) . " ر.ي",
                    'lines' => [
                        [
                            'account_id' => $paymentAccId,
                            'debit' => $capital,
                            'credit' => 0,
                            'line_description' => "استلام مساهمة رأس مال الشريك ($name) نقداً"
                        ],
                        [
                            'account_id' => $capAccId,
                            'debit' => 0,
                            'credit' => $capital,
                            'line_description' => "قيد رأس مال الشريك ($name) في حقوق الملكية"
                        ]
                    ]
                ], $currentAdminId);
            }
            $this->db->commit();
            return [
                'success' => true,
                'id' => $partnerId,
                'message' => 'تم حفظ بيانات الشريك وحصة المساهمة بنجاح'
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['success' => false, 'error' => 'فشل حفظ الشريك: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: deletePartner
    // ==========================================
    public function deletePartner($id) {
        $n=$this->getActiveNetworkId();$id=(int)$id;$own=!$this->db->inTransaction();if($own)$this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$q->execute([$n]);
            $q=$this->db->prepare('SELECT id FROM um_partners_equity WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$n,$id]);if(!$q->fetchColumn())throw new DomainException('الشريك غير موجود في الشبكة');
            $q=$this->db->prepare('SELECT details_json FROM um_profit_distributions WHERE network_id=?');$q->execute([$n]);
            foreach($q->fetchAll(PDO::FETCH_COLUMN) as $json){$details=json_decode((string)$json,true);$scan=function($v)use(&$scan,$id){if(!is_array($v))return false;if(isset($v['partner_id'])&&(int)$v['partner_id']===$id)return true;foreach($v as $x)if(is_array($x)&&$scan($x))return true;return false;};if($scan($details))throw new DomainException('لا يمكن حذف شريك له دورات توزيع أرباح');}
            $this->db->prepare('DELETE FROM um_network_partners WHERE network_id=? AND partner_id=?')->execute([$n,$id]);
            $this->db->prepare('DELETE FROM um_partners_equity WHERE network_id=? AND id=?')->execute([$n,$id]);
            if($own)$this->db->commit();return ['success'=>true,'message'=>'تم حذف الشريك وإزالة ارتباطاته بالشبكة'];
        }catch(Throwable $e){if($own&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    // ==========================================
    // METHOD: depositPartnerCapital
    // ==========================================
    public function depositPartnerCapital($partnerId, $amount, $paymentAccId, $notes = '', $currentAdminId = 1, $currencyCode = 'YER_SANAA', $exchangeRate = 1.0) {
        $networkId=$this->getActiveNetworkId();
        $partnerId = (int)$partnerId;
        $amount = (float)$amount;
        $paymentAccId = (int)$paymentAccId ?: 21;
        $currencyCode = strtoupper(trim((string)$currencyCode));
        $exchangeRate = (float)$exchangeRate;
        if ($exchangeRate <= 0) $exchangeRate = 1.0;
        $currencyAmount = $amount;

        if ($amount <= 0) return ['success' => false, 'error' => 'المبلغ يجب أن يكون أكبر من الصفر'];
        $pq=$this->db->prepare("SELECT * FROM um_partners_equity WHERE network_id=? AND id=?");$pq->execute([$networkId,$partnerId]);$p=$pq->fetch(PDO::FETCH_ASSOC);
        if (!$p) return ['success' => false, 'error' => 'الشريك غير موجود'];

        if ($currencyCode !== 'YER_SANAA' && $exchangeRate > 0) {
            $amount = round($currencyAmount * $exchangeRate, 2);
            $auditNote = sprintf(" [💱 بالعملة: %s %s | سعر الصرف بتاريخه: %s | معادل الأساس: %s ر.ي]", number_format($currencyAmount, 2), $currencyCode, $exchangeRate, number_format($amount, 2));
            if (!str_contains($notes, 'بالعملة:')) {
                $notes = trim($notes . $auditNote);
            }
        }

        $this->db->beginTransaction();
        try {
            $newCap = (float)$p['capital_amount'] + $amount;
            $this->db->prepare("UPDATE um_partners_equity SET capital_amount = ? WHERE network_id=? AND id = ?")->execute([$newCap,$networkId,$partnerId]);
            $cq=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='3101' LIMIT 1");$cq->execute([$networkId]);$capAccId=(int)$cq->fetchColumn();if(!$capAccId)throw new Exception('حساب رأس المال غير موجود في الشبكة النشطة');
            $refNo = 'CAP-DEP-' . date('Ymd') . '-' . rand(100, 999);
            $jv = $this->createJournalEntry([
                'entry_date' => date('Y-m-d'),
                'source_module' => 'manual',
                'reference_no' => $refNo,
                'description' => "إيداع رأس مال إضافي للشريك ({$p['partner_name']}) بمبلغ " . number_format($amount, 2) . " ر.ي - $notes",
                'lines' => [
                    [
                        'account_id' => $paymentAccId,
                        'debit' => $amount,
                        'credit' => 0,
                        'line_description' => "إيداع نقدي / بنكي لحصة رأس مال إضافية"
                    ],
                    [
                        'account_id' => $capAccId,
                        'debit' => 0,
                        'credit' => $amount,
                        'line_description' => "زيادة رأس مال الشريك ({$p['partner_name']})"
                    ]
                ]
            ], $currentAdminId);
            $this->db->commit();
            return [
                'success' => true,
                'new_capital' => $newCap,
                'journal_entry_no' => $jv['entry_no'],
                'message' => "تم بنجاح إيداع رأس المال الإضافي بمبلغ (" . number_format($amount, 2) . " ر.ي) وترحيل القيد المحاسبي المتوازن!"
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['success' => false, 'error' => 'فشل إيداع رأس المال: ' . $e->getMessage()];
        }
    }
    // ==========================================
    // SALARIES & PAYROLL MANAGEMENT
    // ==========================================

    // ==========================================
    // METHOD: getPartnerCapitalSummary
    // ==========================================
    public function getPartnerCapitalSummary() {
        $networkId=$this->getActiveNetworkId();
        // جلب جميع الشركاء
        $partners = $this->db->query("SELECT * FROM um_partners_equity WHERE network_id=$networkId ORDER BY partner_name")->fetchAll(PDO::FETCH_ASSOC);
        // جلب إجمالي أصول كل شبكة
        $assetsByNet = [];
        $rows = $this->db->query("SELECT network_id,SUM(purchase_cost) total_cost,SUM(current_value) total_value,COUNT(*) cnt FROM um_assets WHERE network_id=$networkId GROUP BY network_id")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $assetsByNet[$r['network_id']] = $r;
        }
        // جلب جميع شبكات الشراكة
        $networks = $this->db->query("SELECT * FROM um_networks WHERE id=$networkId")->fetchAll(PDO::FETCH_ASSOC);
        // جلب جميع صفوف um_network_partners
        $npRows = $this->db->query("SELECT * FROM um_network_partners WHERE network_id=$networkId")->fetchAll(PDO::FETCH_ASSOC);
        // بناء فهرس: partner_id => [network contributions]
        $partnerNetworks = [];
        foreach ($npRows as $np) {
            $netId        = $np['network_id'];
            $netAssets    = $assetsByNet[$netId] ?? ['total_cost' => 0, 'total_value' => 0];
            $sharePct     = (float)$np['share_percent'];
            $assetShareCost  = round((float)$netAssets['total_cost']  * $sharePct / 100, 2);
            $assetShareValue = round((float)$netAssets['total_value'] * $sharePct / 100, 2);
            $netName = 'شبكة غير معروفة';
            foreach ($networks as $n) {
                if ($n['id'] == $netId) { $netName = $n['name']; break; }
            }
            $partnerNetworks[$np['partner_id']][] = [
                'network_id'          => $netId,
                'network_name'        => $netName,
                'share_percent'       => $sharePct,
                'capital_contrib'     => (float)$np['capital_contrib'],
                'network_total_cost'  => (float)$netAssets['total_cost'],
                'asset_share_cost'    => $assetShareCost,
                'asset_share_value'   => $assetShareValue,
            ];
        }
        // بناء ملخص كل شريك
        $summary = [];
        foreach ($partners as $p) {
            $contributions = $partnerNetworks[$p['id']] ?? [];
            $totalAssetShareCost  = array_sum(array_column($contributions, 'asset_share_cost'));
            $totalAssetShareValue = array_sum(array_column($contributions, 'asset_share_value'));
            $totalCapContrib      = array_sum(array_column($contributions, 'capital_contrib'));
            $summary[] = [
                'partner_id'              => $p['id'],
                'partner_name'            => $p['partner_name'],
                'global_profit_share'     => (float)$p['profit_share_percent'],
                'direct_capital'          => (float)$p['capital_amount'],
                'network_contributions'   => $contributions,
                'total_capital_contrib'   => $totalCapContrib,
                'total_asset_share_cost'  => $totalAssetShareCost,
                'total_asset_share_value' => $totalAssetShareValue,
                'grand_total_capital'     => round((float)$p['capital_amount'] + $totalAssetShareCost, 2),
                'networks_count'          => count($contributions),
            ];
        }
        // إجماليات عامة
        $grandTotal = array_sum(array_column($summary, 'grand_total_capital'));
        foreach ($summary as &$s) {
            $s['capital_percent_of_total'] = $grandTotal > 0 ? round($s['grand_total_capital'] / $grandTotal * 100, 2) : 0;
        }
        return [
            'success'        => true,
            'partners'       => $summary,
            'networks'       => $networks,
            'grand_total'    => $grandTotal,
            'assets_by_net'  => $assetsByNet,
        ];
    }
    // ==========================================
    // SYSTEM AUDIT & ACTIVITY LOGS (سجل العمليات والتدقيق الشامل)
    // ==========================================

    // ==========================================
    // METHOD: getEmployeeSalaries
    // ==========================================
    public function getEmployeeSalaries($monthYear = '') {
        $networkId=$this->getActiveNetworkId();
        $month = !empty($monthYear) ? $monthYear : date('Y-m');
        $sql = "
            SELECT s.*, 
                   COALESCE(cc.name, 'عام') as cost_center_name,
                   p.id as last_payment_id,
                   p.payment_no as last_payment_no,
                   p.net_salary as last_paid_amount,
                   p.payment_date as last_payment_date,
                   (p.id IS NOT NULL) as is_paid_this_month
            FROM um_employee_salaries s
            LEFT JOIN um_cost_centers cc ON s.cost_center_id = cc.id AND cc.network_id=s.network_id
            LEFT JOIN um_salary_payments p ON s.id = p.employee_id AND p.network_id=s.network_id AND p.month_year = ? AND p.status = 'paid'
            WHERE s.network_id=? AND s.is_active = 1
            ORDER BY s.id ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$month,$networkId]);
        $employees = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $totalBudget = 0;
        $totalPaid = 0;
        $paidCount = 0;
        foreach ($employees as &$emp) {
            $basic = (float)$emp['basic_salary'];
            $allowances = (float)$emp['housing_allowance'] + (float)$emp['transport_allowance'] + (float)$emp['other_allowances'];
            $deductions = (float)$emp['default_deductions'];
            $netEst = max(0, $basic + $allowances - $deductions);
            $emp['total_allowances'] = $allowances;
            $emp['estimated_net'] = $netEst;
            $totalBudget += $netEst;
            if (!empty($emp['is_paid_this_month'])) {
                $totalPaid += (float)$emp['last_paid_amount'];
                $paidCount++;
            }
        }
        return [
            'success' => true,
            'month_year' => $month,
            'employees' => $employees,
            'summary' => [
                'total_employees' => count($employees),
                'total_budget' => $totalBudget,
                'total_paid' => $totalPaid,
                'total_remaining' => max(0, $totalBudget - $totalPaid),
                'paid_count' => $paidCount,
                'unpaid_count' => count($employees) - $paidCount
            ]
        ];
    }

    // ==========================================
    // METHOD: saveEmployeeSalary
    // ==========================================
        public function saveEmployeeSalary($data) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)($data['id'] ?? 0);
        $name = trim((string)($data['employee_name'] ?? ''));
        $adminId = !empty($data['admin_id']) ? (int)$data['admin_id'] : null;
        $title = trim((string)($data['job_title'] ?? ''));
        $phone = normalizeYemenPhone(trim((string)($data['phone'] ?? '')));
        $basic = (float)($data['basic_salary'] ?? 0);
        $housing = (float)($data['housing_allowance'] ?? 0);
        $transport = (float)($data['transport_allowance'] ?? 0);
        $other = (float)($data['other_allowances'] ?? 0);
        $deductions = (float)($data['default_deductions'] ?? 0);
        $costCenterId = !empty($data['cost_center_id']) ? (int)$data['cost_center_id'] : null;
        $method = trim((string)($data['payment_method'] ?? 'cash'));
        $notes = trim((string)($data['notes'] ?? ''));
        if (empty($name)) {
            return ['success' => false, 'error' => 'يرجى إدخال اسم الموظف'];
        }
        if ($basic <= 0) {
            return ['success' => false, 'error' => 'الراتب الأساسي يجب أن يكون أكبر من الصفر'];
        }
        // 1. Check duplicate by linked admin account (admin_id)
        if ($adminId > 0) {
            if(!$this->getAdminById($adminId))return ['success'=>false,'error'=>'الموظف لا يتبع الشبكة النشطة'];
            $chkAdmin = $this->db->prepare("SELECT id, employee_name FROM um_employee_salaries WHERE network_id=? AND admin_id = ? AND is_active = 1 AND id != ?");
            $chkAdmin->execute([$networkId,$adminId, $id]);
            $existingAdmin = $chkAdmin->fetch();
            if ($existingAdmin) {
                return [
                    'success' => false,
                    'error' => "المستخدم ({$existingAdmin['employee_name']}) مسجل مسبقاً في سلم الرواتب برقم (#{$existingAdmin['id']})! يرجى تعديل بيانات راتبه القائم بدلاً من تكرار إضافته."
                ];
            }
        }
        // 2. Check duplicate by employee name
        $chkName = $this->db->prepare("SELECT id, employee_name FROM um_employee_salaries WHERE network_id=? AND TRIM(LOWER(employee_name)) = TRIM(LOWER(?)) AND is_active = 1 AND id != ?");
        $chkName->execute([$networkId,$name, $id]);
        $existingName = $chkName->fetch();
        if ($existingName) {
            return [
                'success' => false,
                'error' => "الموظف ({$existingName['employee_name']}) مسجل مسبقاً في سلم الرواتب برقم (#{$existingName['id']})! يرجى تعديل بيانات راتبه القائم بدلاً من تكرار إضافته."
            ];
        }
        if ($id > 0) {
            $stmt = $this->db->prepare("
                UPDATE um_employee_salaries 
                SET admin_id = ?, employee_name = ?, job_title = ?, phone = ?, basic_salary = ?, 
                    housing_allowance = ?, transport_allowance = ?, other_allowances = ?, 
                    default_deductions = ?, cost_center_id = ?, payment_method = ?, notes = ?, is_active = 1
                WHERE network_id=? AND id = ?
            ");
            $stmt->execute([$adminId, $name, $title, $phone, $basic, $housing, $transport, $other, $deductions, $costCenterId, $method, $notes,$networkId,$id]);
            return ['success' => true, 'id' => $id, 'message' => 'تم تحديث بيانات راتب الموظف بنجاح'];
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_employee_salaries 
                (network_id,admin_id, employee_name, job_title, phone, basic_salary, housing_allowance, transport_allowance, other_allowances, default_deductions, cost_center_id, payment_method, notes, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$networkId,$adminId, $name, $title, $phone, $basic, $housing, $transport, $other, $deductions, $costCenterId, $method, $notes]);
            return ['success' => true, 'id' => (int)$this->db->lastInsertId(), 'message' => 'تم إضافة الموظف لسلم الرواتب بنجاح'];
        }
    }

    // ==========================================
    // METHOD: deleteEmployeeSalary
    // ==========================================
    public function deleteEmployeeSalary($id) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)$id;
        $this->db->prepare("UPDATE um_employee_salaries SET is_active = 0 WHERE network_id=? AND id = ?")->execute([$networkId,$id]);
        return ['success' => true, 'message' => 'تم إيقاف/حذف الموظف من سلم الرواتب'];
    }

    // ==========================================
    // METHOD: getSalaryPayments
    // ==========================================
    public function getSalaryPayments($filters = []) {
        $networkId=$this->getActiveNetworkId();
        $where = ["p.network_id=?"];
        $params = [$networkId];
        if (!empty($filters['month_year'])) {
            $where[] = "p.month_year = ?";
            $params[] = $filters['month_year'];
        }
        if (!empty($filters['employee_id'])) {
            $where[] = "p.employee_id = ?";
            $params[] = (int)$filters['employee_id'];
        }
        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT p.*, e.entry_no as journal_entry_no,
                   acc.name_ar as payment_account_name,
                   adm.fullname as payer_name
            FROM um_salary_payments p
            LEFT JOIN um_journal_entries e ON p.journal_entry_id = e.id
            LEFT JOIN um_chart_of_accounts acc ON p.payment_account_id = acc.id
            LEFT JOIN um_admins adm ON p.created_by = adm.id
            WHERE $whereSql
            ORDER BY p.payment_date DESC, p.id DESC
            LIMIT 200
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return ['success' => true, 'payments' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    }

    // ==========================================
    // METHOD: payEmployeeSalary
    // ==========================================
    public function payEmployeeSalary($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $empId = (int)($data['employee_id'] ?? 0);
        $month = trim((string)($data['month_year'] ?? date('Y-m')));
        $payDate = !empty($data['payment_date']) ? $data['payment_date'] : date('Y-m-d');
        $basic = (float)($data['basic_salary'] ?? 0);
        $allowances = (float)($data['total_allowances'] ?? 0);
        $advances = (float)($data['advances_deduction'] ?? 0);
        $penalties = (float)($data['penalties_deduction'] ?? 0);
        $payAccId = (int)($data['payment_account_id'] ?? 21);
        $notes = trim((string)($data['notes'] ?? ''));
        $eq=$this->db->prepare("SELECT * FROM um_employee_salaries WHERE network_id=? AND id=?");$eq->execute([$networkId,$empId]);$emp=$eq->fetch(PDO::FETCH_ASSOC);
        if (!$emp) return ['success' => false, 'error' => 'الموظف غير موجود'];
        $chk = $this->db->prepare("SELECT id, payment_no FROM um_salary_payments WHERE network_id=? AND employee_id = ? AND month_year = ? AND status = 'paid' LIMIT 1");
        $chk->execute([$networkId,$empId, $month]);
        if ($chkRow = $chk->fetch()) {
            return ['success' => false, 'error' => "تم صرف راتب شهر ($month) لهذا الموظف مسبقاً برقم السند ({$chkRow['payment_no']})"];
        }
        $gross = $basic + $allowances;
        $net = max(0, $gross - $advances - $penalties);
        if ($net <= 0) {
            return ['success' => false, 'error' => 'صافي الراتب يجب أن يكون أكبر من الصفر'];
        }
        $this->db->beginTransaction();
        try {
            $paymentNo = 'PAY-' . str_replace('-', '', $month) . '-' . sprintf('%03d', $empId) . '-' . rand(10, 99);
            $aq=$this->db->prepare("SELECT id,account_code FROM um_chart_of_accounts WHERE network_id=? AND account_code IN ('5301','1302')");$aq->execute([$networkId]);$am=[];foreach($aq->fetchAll(PDO::FETCH_ASSOC) as $ar)$am[$ar['account_code']]=(int)$ar['id'];$expAccId=$am['5301']??0;$advAccId=$am['1302']??0;
            if(!$expAccId||($advances>0&&!$advAccId))throw new Exception('حسابات الرواتب أو السلف غير معرفة في الشبكة النشطة');
            $lines = [];
            $lines[] = [
                'account_id' => $expAccId,
                'debit' => $gross - $penalties,
                'credit' => 0,
                'cost_center_id' => $emp['cost_center_id'] ?: null,
                'line_description' => "استحقاق راتب وبدلات شهر ($month) - للموظف {$emp['employee_name']}"
            ];
            if ($advances > 0) {
                $lines[] = [
                    'account_id' => $advAccId,
                    'debit' => 0,
                    'credit' => $advances,
                    'cost_center_id' => $emp['cost_center_id'] ?: null,
                    'line_description' => "استقطاع سلفة سابقة من راتب شهر ($month) - {$emp['employee_name']}"
                ];
            }
            $lines[] = [
                'account_id' => $payAccId,
                'debit' => 0,
                'credit' => $net,
                'line_description' => "صرف صافي راتب شهر ($month) نقداً/بنك للموظف {$emp['employee_name']}"
            ];
            $jv = $this->createJournalEntry([
                'entry_date' => $payDate,
                'source_module' => 'salary',
                'reference_no' => $paymentNo,
                'description' => "صرف راتب شهر ($month) للموظف ({$emp['employee_name']}) - صافي: " . number_format($net, 2) . " ر.ي",
                'lines' => $lines
            ], $currentAdminId);
            $ins = $this->db->prepare("
                INSERT INTO um_salary_payments 
                (network_id,payment_no, employee_id, employee_name, month_year, payment_date, basic_salary, total_allowances, advances_deduction, penalties_deduction, net_salary, payment_account_id, expense_account_id, cost_center_id, journal_entry_id, status, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)
            ");
            $ins->execute([
                $networkId,$paymentNo, $empId, $emp['employee_name'], $month, $payDate,
                $basic, $allowances, $advances, $penalties, $net,
                $payAccId, $expAccId, $emp['cost_center_id'] ?: null,
                $jv['entry_id'], $notes, $currentAdminId
            ]);
            $payId = (int)$this->db->lastInsertId();
            $this->db->commit();
            return [
                'success' => true,
                'payment_id' => $payId,
                'payment_no' => $paymentNo,
                'net_salary' => $net,
                'journal_entry_no' => $jv['entry_no'],
                'message' => "تم بنجاح صرف راتب شهر ($month) للموظف ({$emp['employee_name']}) وترحيل القيد المحاسبي المزدوج!"
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['success' => false, 'error' => 'فشل صرف الراتب: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: payBatchSalaries
    // ==========================================
    public function payBatchSalaries($data, $currentAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        $month = trim((string)($data['month_year'] ?? date('Y-m')));
        $payAccId = (int)($data['payment_account_id'] ?? 21);
        $payDate = !empty($data['payment_date']) ? $data['payment_date'] : date('Y-m-d');
        $notes = trim((string)($data['notes'] ?? 'اعتماد وصرف المسير الشهري العام'));
        $unpaid = $this->db->prepare("
            SELECT s.* FROM um_employee_salaries s
            WHERE s.network_id=? AND s.is_active = 1
            AND s.id NOT IN (
                SELECT employee_id FROM um_salary_payments WHERE network_id=? AND month_year = ? AND status = 'paid'
            )
        ");
        $unpaid->execute([$networkId,$networkId,$month]);
        $list = $unpaid->fetchAll(PDO::FETCH_ASSOC);
        if (empty($list)) {
            return ['success' => false, 'error' => "كافة رواتب الموظفين لشهر ($month) تم صرفها مسبقاً"];
        }
        $paidCount = 0;
        $totalBatchNet = 0;
        foreach ($list as $emp) {
            $basic = (float)$emp['basic_salary'];
            $allowances = (float)$emp['housing_allowance'] + (float)$emp['transport_allowance'] + (float)$emp['other_allowances'];
            $deductions = (float)$emp['default_deductions'];
            $res = $this->payEmployeeSalary([
                'employee_id' => $emp['id'],
                'month_year' => $month,
                'payment_date' => $payDate,
                'basic_salary' => $basic,
                'total_allowances' => $allowances,
                'advances_deduction' => 0,
                'penalties_deduction' => $deductions,
                'payment_account_id' => $payAccId,
                'notes' => $notes
            ], $currentAdminId);
            if (!empty($res['success'])) {
                $paidCount++;
                $totalBatchNet += (float)$res['net_salary'];
            }
        }
        return [
            'success' => true,
            'paid_count' => $paidCount,
            'total_net' => $totalBatchNet,
            'message' => "تم بنجاح اعتماد وصرف رواتب ($paidCount) موظف لشهر ($month) بإجمالي (" . number_format($totalBatchNet, 2) . " ر.ي) وترحيل القيود المحاسبية"
        ];
    }
    // ============================================================
    //  NETWORKS & MULTI-PARTNERSHIP CAPITAL SYSTEM
    //  نظام الشبكات وحصص رأس المال المتعددة
    // ============================================================
    /** إنشاء أو تحديث شبكة */

    // ==========================================
    // METHOD: getIntegratedReport
    // ==========================================
    public function getIntegratedReport($filters = []) {
        $networkId=$this->getActiveNetworkId();
        $type = (string)($filters['type'] ?? 'sales');
        $allowed = ['sales', 'cards', 'stock', 'finance', 'sessions', 'assets', 'topology', 'topology_assets'];
        if (!in_array($type, $allowed, true)) throw new InvalidArgumentException('نوع التقرير غير معروف');
        $dateValue = function ($value, $fallback) {
            $value = trim((string)$value);
            return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : $fallback;
        };
        $from = $dateValue($filters['from'] ?? '', date('Y-m-01'));
        $to = $dateValue($filters['to'] ?? '', date('Y-m-d'));
        if ($from > $to) [$from, $to] = [$to, $from];
        $groupBy = (string)($filters['group_by'] ?? 'day');
        $profile = trim((string)($filters['profile'] ?? ''));
        $params = [':network'=>$networkId,':from' => $from . ' 00:00:00', ':to' => $to . ' 23:59:59'];
        $map = [];
        $where = [];
        $sql = '';
        $columns = [];
        $title = '';
        if ($type === 'topology') {
            $groupMap = ['network' => "COALESCE(net.name, 'غير مرتبط بشبكة')", 'router' => "COALESCE(router.shortname, usage_data.nasipaddress, 'راوتر غير محدد')", 'node' => "COALESCE(node.node_name, CONCAT('منفذ ', NULLIF(usage_data.nasportid, '')), 'نقطة غير محددة')", 'agent' => "COALESCE(adm.fullname, adm.username, 'غير محدد')"];
            $field = $groupMap[$groupBy] ?? $groupMap['network'];
            $profileWhere = $profile !== '' ? ' AND vm.profile_name = :profile' : '';
            if ($profile !== '') $params[':profile'] = $profile;
            $sql = "WITH usage_data AS (SELECT r.username,r.nasipaddress,COALESCE(NULLIF(r.nasportid,''),'0') nasportid,COUNT(*) sessions,SUM(COALESCE(r.acctsessiontime,0))/3600 hours,SUM(COALESCE(r.acctinputoctets,0)+COALESCE(r.acctoutputoctets,0))/1048576 mb FROM radacct r WHERE r.network_id=:network AND r.acctstarttime BETWEEN :from AND :to GROUP BY r.username,r.nasipaddress,COALESCE(NULLIF(r.nasportid,''),'0')), card_total AS (SELECT username,SUM(mb) total_mb FROM usage_data GROUP BY username) SELECT $field group_label,COUNT(DISTINCT usage_data.username) cards_used,COUNT(DISTINCT CASE WHEN COALESCE(vm.is_free_quota,0)=0 THEN usage_data.username END) paid_cards,COUNT(DISTINCT CASE WHEN COALESCE(vm.is_free_quota,0)=1 THEN usage_data.username END) free_cards,SUM(usage_data.sessions) sessions,ROUND(SUM(usage_data.hours),2) hours,ROUND(SUM(usage_data.mb),2) total_mb,ROUND(SUM(CASE WHEN COALESCE(vm.is_free_quota,0)=0 THEN usage_data.mb ELSE 0 END),2) paid_mb,ROUND(SUM(CASE WHEN COALESCE(vm.is_free_quota,0)=1 THEN usage_data.mb ELSE 0 END),2) free_mb,ROUND(SUM(CASE WHEN COALESCE(vm.is_free_quota,0)=0 THEN COALESCE(NULLIF(vm.sale_price,0),vm.price,0)*usage_data.mb/NULLIF(card_total.total_mb,0) ELSE 0 END),2) allocated_sales,ROUND(SUM(CASE WHEN COALESCE(vm.is_free_quota,0)=0 THEN COALESCE(NULLIF(vm.sale_price,0),vm.price,0)*usage_data.mb/NULLIF(card_total.total_mb,0) ELSE 0 END)/NULLIF(SUM(CASE WHEN COALESCE(vm.is_free_quota,0)=0 THEN usage_data.mb ELSE 0 END),0),4) value_per_mb FROM usage_data INNER JOIN card_total ON card_total.username=usage_data.username LEFT JOIN um_vouchers_meta vm ON vm.network_id=$networkId AND vm.username=usage_data.username LEFT JOIN um_admins adm ON adm.id=vm.owner_admin_id LEFT JOIN nas router ON router.network_id=$networkId AND router.nasname=usage_data.nasipaddress LEFT JOIN um_network_nodes node ON node.network_id=$networkId AND node.nas_ip=usage_data.nasipaddress AND node.nas_port_id=usage_data.nasportid LEFT JOIN um_assets router_asset ON router_asset.network_id=$networkId AND router_asset.nas_ip=usage_data.nasipaddress AND router_asset.category='routers' LEFT JOIN um_networks net ON net.id=router_asset.network_id WHERE 1=1 $profileWhere GROUP BY $field ORDER BY total_mb DESC LIMIT 500";
            $columns = ['group_label','cards_used','paid_cards','free_cards','sessions','hours','total_mb','paid_mb','free_mb','allocated_sales','value_per_mb','share_percent']; $title = 'تحليل الاستهلاك والمبيعات حسب الهيكل التشغيلي';
        } elseif ($type === 'topology_assets') {
            $groupMap = ['network'=>"COALESCE(net.name, 'غير مرتبط بشبكة')",'router'=>"COALESCE(router.shortname, a.nas_ip, 'راوتر غير محدد')",'node'=>"COALESCE(node.node_name, 'نقطة غير محددة')",'agent'=>"COALESCE(adm.fullname, adm.username, a.responsible_person, 'غير محدد')",'category'=>'a.category','status'=>'a.status'];
            $field = $groupMap[$groupBy] ?? $groupMap['network'];
            $sql = "SELECT $field group_label,COUNT(*) assets,SUM(a.status='in_service') in_service,SUM(a.status='maintenance') maintenance,SUM(a.status='damaged') damaged,COALESCE(SUM(a.purchase_cost),0) purchase_cost,COALESCE(SUM(a.current_value),0) current_value FROM um_assets a LEFT JOIN um_networks net ON net.id=a.network_id LEFT JOIN nas router ON router.network_id=a.network_id AND router.nasname=a.nas_ip LEFT JOIN um_network_nodes node ON node.network_id=a.network_id AND node.id=a.node_id LEFT JOIN um_admins adm ON adm.id=a.assigned_to_user_id WHERE a.network_id=:network AND a.created_at BETWEEN :from AND :to GROUP BY $field ORDER BY assets DESC LIMIT 500";
            $columns=['group_label','assets','in_service','maintenance','damaged','purchase_cost','current_value','share_percent']; $title='تحليل الأصول حسب الشبكات والراوترات والنقاط';
        } elseif ($type === 'sales') {
            $map = ['day' => 'DATE(inv.created_at)', 'profile' => "COALESCE(inv.profile_name, 'غير محدد')", 'agent' => "COALESCE(b.fullname, b.username, 'غير محدد')", 'payment' => "COALESCE(inv.payment_type, 'غير محدد')"];
            $where = ['inv.network_id=:network','inv.created_at BETWEEN :from AND :to'];
            if ($profile !== '') { $where[] = 'inv.profile_name = :profile'; $params[':profile'] = $profile; }
            $field = $map[$groupBy] ?? $map['day'];
            $where[] = "COALESCE(inv.invoice_status,'completed') = 'completed'";
            $sql = "SELECT $field AS group_label, COUNT(*) invoices, COALESCE(SUM(CASE WHEN inv.sale_kind IN ('cards','wallet_distribution') THEN inv.quantity ELSE 0 END),0) cards, COALESCE(SUM(inv.total_amount),0) sales, CASE WHEN SUM(inv.sale_kind='cards' AND inv.cost_amount=0)>0 THEN NULL ELSE SUM(inv.cost_amount) END cost, CASE WHEN SUM(inv.sale_kind='cards' AND inv.cost_amount=0)>0 THEN NULL ELSE SUM(inv.profit_amount) END profit, COALESCE(SUM(CASE WHEN inv.payment_type='wallet' THEN 0 ELSE inv.paid_amount END),0) collected,COALESCE(SUM(CASE WHEN inv.payment_type='wallet' THEN inv.paid_amount ELSE 0 END),0) wallet_settled, COALESCE(SUM(inv.remaining_amount),0) balance FROM um_sales_invoices inv LEFT JOIN um_admins b ON b.id = inv.buyer_id WHERE " . implode(' AND ', $where) . " GROUP BY $field ORDER BY sales DESC LIMIT 500";
            $columns = ['group_label','invoices','cards','sales','cost','profit','collected','wallet_settled','balance']; $title = 'تقرير المبيعات';
        } elseif ($type === 'cards') {
            $map = ['day' => 'DATE(v.created_at)', 'profile' => "COALESCE(v.profile_name, 'غير محدد')", 'status' => "COALESCE(v.status, 'غير محدد')", 'agent' => "COALESCE(a.fullname, a.username, 'غير محدد')"];
            $where = ['v.network_id=:network','v.created_at BETWEEN :from AND :to'];
            if ($profile !== '') { $where[] = 'v.profile_name = :profile'; $params[':profile'] = $profile; }
            $field = $map[$groupBy] ?? $map['profile'];
            $sql = "SELECT $field AS group_label, COUNT(*) cards, SUM(v.is_sold = 1) sold, SUM(v.status = 'used') used, SUM(v.status = 'active') active, COALESCE(SUM(CASE WHEN v.sale_price > 0 THEN v.sale_price ELSE v.price END),0) value FROM um_vouchers_meta v LEFT JOIN um_admins a ON a.id = v.owner_admin_id WHERE " . implode(' AND ', $where) . " GROUP BY $field ORDER BY cards DESC LIMIT 500";
            $columns = ['group_label','cards','sold','used','active','value']; $title = 'تقرير الكروت والمشتركين';
        } elseif ($type === 'stock') {
            $map = ['day' => 'DATE(t.created_at)', 'profile' => 't.profile_name', 'agent' => "COALESCE(r.fullname, r.username, 'غير محدد')", 'transfer' => 't.transfer_type'];
            $where = ['t.network_id=:network','t.created_at BETWEEN :from AND :to'];
            if ($profile !== '') { $where[] = 't.profile_name = :profile'; $params[':profile'] = $profile; }
            $field = $map[$groupBy] ?? $map['day'];
            $sql = "SELECT $field AS group_label, COUNT(*) movements, COALESCE(SUM(t.cards_count),0) cards, COALESCE(SUM(t.sheets_count),0) sheets, COALESCE(SUM(t.total_value),0) value FROM um_stock_transfers t LEFT JOIN um_admins r ON r.id = t.receiver_admin_id WHERE " . implode(' AND ', $where) . " GROUP BY $field ORDER BY cards DESC LIMIT 500";
            $columns = ['group_label','movements','cards','sheets','value']; $title = 'تقرير المخزون والعهد';
        } elseif ($type === 'finance') {
            $map = ['day' => 'DATE(v.created_at)', 'category' => "COALESCE(v.category, 'غير محدد')", 'party' => "COALESCE(v.party_name, 'لا يوجد')", 'voucher' => 'v.voucher_type'];
            $field = $map[$groupBy] ?? $map['day'];
            $sql = "SELECT $field AS group_label, COUNT(*) vouchers, COALESCE(SUM(CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END),0) receipts, COALESCE(SUM(CASE WHEN v.voucher_type = 'payment' THEN v.amount ELSE 0 END),0) payments, COALESCE(SUM(CASE WHEN COALESCE(v.is_void,0)=1 THEN 0 WHEN v.voucher_type = 'receipt' THEN v.amount ELSE -v.amount END),0) net FROM um_vouchers_financial v WHERE v.network_id=:network AND COALESCE(v.is_void,0)=0 AND v.created_at BETWEEN :from AND :to GROUP BY $field ORDER BY net DESC LIMIT 500";
            $columns = ['group_label','vouchers','receipts','payments','net']; $title = 'تقرير السندات والحركة المالية';
        } elseif ($type === 'sessions') {
            $map = ['day' => 'DATE(r.acctstarttime)', 'router' => "COALESCE(r.nasipaddress, 'لا يوجد')", 'profile' => "COALESCE(vm.profile_name, 'غير محدد')"];
            $where = ['r.network_id=:network','r.acctstarttime BETWEEN :from AND :to'];
            if ($profile !== '') { $where[] = 'vm.profile_name = :profile'; $params[':profile'] = $profile; }
            $field = $map[$groupBy] ?? $map['day'];
            $sql = "SELECT $field AS group_label, COUNT(*) sessions, ROUND(COALESCE(SUM(r.acctsessiontime),0)/3600,2) hours, ROUND(COALESCE(SUM(r.acctinputoctets + r.acctoutputoctets),0)/1048576,2) mb, SUM(r.acctstoptime IS NULL) active FROM radacct r LEFT JOIN um_vouchers_meta vm ON vm.network_id=r.network_id AND vm.username = r.username WHERE " . implode(' AND ', $where) . " GROUP BY $field ORDER BY hours DESC LIMIT 500";
            $columns = ['group_label','sessions','hours','mb','active']; $title = 'تقرير الجلسات والاستخدام';
        } else {
            $map = ['category' => 'a.category', 'status' => 'a.status', 'location' => "COALESCE(a.location, 'لا يوجد')"];
            $field = $map[$groupBy] ?? $map['category'];
            $sql = "SELECT $field AS group_label, COUNT(*) assets, COALESCE(SUM(a.purchase_cost),0) purchase_cost, COALESCE(SUM(a.current_value),0) current_value, SUM(a.status = 'in_service') in_service FROM um_assets a WHERE a.network_id=:network AND a.created_at BETWEEN :from AND :to GROUP BY $field ORDER BY assets DESC LIMIT 500";
            $columns = ['group_label','assets','purchase_cost','current_value','in_service']; $title = 'تقرير الأصول ومعدات الشبكة';
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $trafficTotal = array_sum(array_map(fn($row) => (float)($row['total_mb'] ?? $row['assets'] ?? 0), $rows));
        foreach ($rows as &$reportRow) { $basis = (float)($reportRow['total_mb'] ?? $reportRow['assets'] ?? 0); $reportRow['share_percent'] = $trafficTotal > 0 ? round(($basis / $trafficTotal) * 100, 2) : 0; } unset($reportRow);
        $totals = ['rows' => count($rows)];
        foreach ($columns as $column) {
            if ($column !== 'group_label') $totals[$column] = array_sum(array_map(fn($row) => (float)($row[$column] ?? 0), $rows));
        }
        return ['success' => true, 'title' => $title, 'type' => $type, 'from' => $from, 'to' => $to, 'columns' => $columns, 'rows' => $rows, 'totals' => $totals];
    }

    // ==========================================
    // METHOD: distributorLogin
    // ==========================================
    public function distributorLogin($username, $password) {
        $username = trim($username);
        $password = trim($password);
        if (empty($username) || empty($password)) {
            return ['error' => 'يرجى إدخال اسم المستخدم وكلمة المرور'];
        }
        // Search in um_admins by username or phone
        $stmt = $this->db->prepare("SELECT * FROM um_admins WHERE (username = ? OR phone = ?) AND is_active = 1 LIMIT 1");
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch();
        if (!$user) {
            return ['error' => 'عذراً، اسم المستخدم أو رقم الهاتف غير موجود'];
        }
        // Verify password hash or standard fallback
        $pwdMatch = password_verify($password, $user['password_hash']);
        if (!$pwdMatch) {
            return ['error' => 'كلمة المرور غير صحيحة'];
        }
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        session_regenerate_id(true);
        $_SESSION['_created_at'] = time();
        $_SESSION['_last_activity'] = time();
        $_SESSION['distributor_id'] = (int)$user['id'];
        $_SESSION['distributor_name'] = $user['fullname'] ?: $user['username'];
        $_SESSION['distributor_role'] = $user['role'];
        return [
            'success' => true,
            'distributor' => [
                'id' => (int)$user['id'],
                'name' => $user['fullname'] ?: $user['username'],
                'username' => $user['username'],
                'phone' => $user['phone'],
                'role' => $user['role'],
                'balance' => (float)$user['balance']
            ]
        ];
    }

    // ==========================================
    // METHOD: getDistributorDashboard
    // ==========================================
    public function getDistributorDashboard($distId) {
        $networkId=$this->getActiveNetworkId();
        $distId = (int)$distId;
        $dist=$this->getAdminById($distId);
        if (!$dist) return ['error' => 'الموزع غير موجود'];
        // Total allocated vouchers (where owner_admin_id = distId)
        $stmt = $this->db->prepare("SELECT COUNT(*) total_cards,COALESCE(SUM(is_sold),0) sold_cards FROM um_vouchers_meta WHERE network_id=? AND owner_admin_id = ?");
        $stmt->execute([$networkId,$distId]);
        $cardsAgg = $stmt->fetch();
        $totalCards = (int)($cardsAgg['total_cards'] ?? 0);
        $soldCards = (int)($cardsAgg['sold_cards'] ?? 0);
        $unsoldCards = $totalCards - $soldCards;
        // Recent sales invoices where buyer_id = distId
        $stmt = $this->db->prepare("SELECT * FROM um_sales_invoices WHERE network_id=? AND buyer_id = ? ORDER BY id DESC LIMIT 10");
        $stmt->execute([$networkId,$distId]);
        $recentOrders = $stmt->fetchAll();
        return [
            'success' => true,
            'distributor' => [
                'id' => $dist['id'],
                'name' => $dist['fullname'] ?: $dist['username'],
                'username' => $dist['username'],
                'phone' => $dist['phone'],
                'role' => $dist['role'],
                'balance' => (float)$dist['balance']
            ],
            'balance' => (float)$dist['balance'],
            'total_cards' => $totalCards,
            'sold_cards' => $soldCards,
            'unsold_cards' => $unsoldCards,
            'recent_orders' => $recentOrders
        ];
    }

    // ==========================================
    // METHOD: getDistributorStatement
    // ==========================================
    public function getDistributorStatement($distId) {
        $networkId=$this->getActiveNetworkId();
        $distId = (int)$distId;
        $dist=$this->getAdminById($distId);
        if (!$dist) return ['error' => 'الموزع غير موجود'];
        // Use the append-only subledger, including opening debits and reversals.
        $stmt=$this->db->prepare('SELECT id,reference_id AS ref_no,description AS type,debit,credit,created_at FROM um_financial_transactions WHERE network_id=? AND account_id=? ORDER BY created_at DESC,id DESC LIMIT 50');
        $stmt->execute([$networkId,$distId]);
        $statement = $stmt->fetchAll();
        return [
            'success' => true,
            'distributor' => [
                'id' => $dist['id'],
                'name' => $dist['fullname'] ?: $dist['username'],
                'balance' => (float)$dist['balance']
            ],
            'statement' => $statement
        ];
    }

    public function resolveCashAccountForAdmin(int $adminId): int {
        return FinancialPostingAccounts::cashForAdmin($this->db,(int)$this->getActiveNetworkId(),$adminId);
    }

    /** Journal only: does not repeat collection, voucher activation or party balances. */
    public function postSaleInvoiceJournal(int $invoiceId, int $currentAdminId = 1): array {
        $walletGuard=$this->db->prepare("SELECT sale_kind FROM um_sales_invoices WHERE id=? AND network_id=?");$walletGuard->execute([$invoiceId,$this->getActiveNetworkId()]);if($walletGuard->fetchColumn()==='wallet_distribution')throw new DomainException('WALLET_INVOICE_USE_REFUND_FLOW');

        $networkId=(int)$this->getActiveNetworkId();$own=!$this->db->inTransaction();if($own)$this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT * FROM um_sales_invoices WHERE id=? AND network_id=? FOR UPDATE');$q->execute([$invoiceId,$networkId]);$i=$q->fetch(PDO::FETCH_ASSOC);
            if(!$i||$i['invoice_status']!=='completed'||$i['sale_kind']!=='cards')throw new DomainException('INVALID_SALE_FOR_POSTING');
            $q=$this->db->prepare('SELECT id,is_posted FROM um_journal_entries WHERE network_id=? AND reference_no=? FOR UPDATE');$q->execute([$networkId,$i['invoice_no']]);$existing=$q->fetchAll(PDO::FETCH_ASSOC);
            if($existing){if(count($existing)!==1||!(int)$existing[0]['is_posted'])throw new DomainException('AMBIGUOUS_SALE_POSTING');if($own)$this->db->commit();return ['success'=>true,'entry_id'=>(int)$existing[0]['id'],'already_posted'=>true];}
            $total=(int)round((float)$i['total_amount']*100);$paid=(int)round((float)$i['paid_amount']*100);$remaining=(int)round((float)$i['remaining_amount']*100);
            if($total<=0||$paid<0||$remaining<0||$total!==$paid+$remaining)throw new DomainException('INVALID_SALE_TOTALS');
            $lines=[];
            if($paid>0)$lines[]=['account_id'=>$this->resolveCashAccountForAdmin((int)$i['seller_id']),'debit'=>$paid/100,'credit'=>0,'line_description'=>'تحصيل الفاتورة '.$i['invoice_no'].' دون قبض جديد'];
            if($remaining>0){
                $q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND account_type='asset' AND is_active=1 AND (account_code LIKE '130%' OR account_code LIKE '1103%') FOR UPDATE");$q->execute([$networkId,(int)$i['buyer_id']]);$accounts=$q->fetchAll(PDO::FETCH_COLUMN);
                if(count($accounts)!==1)throw new DomainException('BUYER_RECEIVABLE_ACCOUNT_REQUIRED');
                $lines[]=['account_id'=>(int)$accounts[0],'debit'=>$remaining/100,'credit'=>0,'line_description'=>'ذمة الفاتورة '.$i['invoice_no']];
            }
            $q=$this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='4101' AND account_type='revenue' AND is_active=1");$q->execute([$networkId]);$revenue=(int)$q->fetchColumn();if(!$revenue)throw new DomainException('SALES_REVENUE_ACCOUNT_REQUIRED');
            $lines[]=['account_id'=>$revenue,'debit'=>0,'credit'=>$total/100,'line_description'=>'إيراد مبيعات الفاتورة '.$i['invoice_no']];
            $r=$this->createJournalEntry(['entry_date'=>substr($i['created_at'],0,10),'source_module'=>'sales','reference_no'=>$i['invoice_no'],'description'=>'ترحيل فاتورة بيع '.$i['invoice_no'].'؛ لا يمثل بيعًا أو تحصيلًا إضافيًا','lines'=>$lines],$currentAdminId);
            if($own)$this->db->commit();return $r;
        }catch(Throwable $e){if($own&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    public function seedStandardChartOfAccounts(int $networkId = 1): void
    {
        $accounts = [
            ['code' => '1', 'name_ar' => 'الأصول', 'type' => 'asset', 'parent' => null, 'level' => 1, 'is_sys' => 1],
            ['code' => '11', 'name_ar' => 'الأصول المتداولة', 'type' => 'asset', 'parent' => '1', 'level' => 2, 'is_sys' => 1],
            ['code' => '12', 'name_ar' => 'الأصول الثابتة', 'type' => 'asset', 'parent' => '1', 'level' => 2, 'is_sys' => 1],
            ['code' => '1101', 'name_ar' => 'النقدية وما في حكمها', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
            ['code' => '1102', 'name_ar' => 'البنوك ومحافظ الصرافة', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
            ['code' => '1103', 'name_ar' => 'المدينون والعملاء والوكلاء', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
            ['code' => '1104', 'name_ar' => 'مخزون الكروت والمعدات', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
            ['code' => '1105', 'name_ar' => 'عهد وسلف ومصروفات مدفوعة مقدماً', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
            ['code' => '110101', 'name_ar' => 'الصندوق الرئيسي / الخزينة العامة', 'type' => 'asset', 'parent' => '1101', 'level' => 4, 'is_sys' => 1],
            ['code' => '110102', 'name_ar' => 'صناديق الفروع والمحصلين', 'type' => 'asset', 'parent' => '1101', 'level' => 4, 'is_sys' => 0],
            ['code' => '110201', 'name_ar' => 'بنك الكريمي للتمويل الأصغر', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
            ['code' => '110202', 'name_ar' => 'بنك التضامن الإسلامي', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
            ['code' => '110203', 'name_ar' => 'محفظة جايبي (Jawali / Jayebe)', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
            ['code' => '110204', 'name_ar' => 'محفظة ون كاش (OneCash)', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
            ['code' => '110205', 'name_ar' => 'محفظة فلوسك / كاش', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
            ['code' => '110301', 'name_ar' => 'حسابات الوكلاء والموزعين', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 1],
            ['code' => '110302', 'name_ar' => 'حسابات نقاط البيع (POS)', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 0],
            ['code' => '110303', 'name_ar' => 'مشتركو الخطوط والاشتراكات الشهرية', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 0],
            ['code' => '110401', 'name_ar' => 'مخزون كروت المايكروتك الجاهزة', 'type' => 'asset', 'parent' => '1104', 'level' => 4, 'is_sys' => 1],
            ['code' => '110402', 'name_ar' => 'مخزون أجهزة ومعدات للبيع', 'type' => 'asset', 'parent' => '1104', 'level' => 4, 'is_sys' => 0],
            ['code' => '1201', 'name_ar' => 'أبراج ومواقع البث', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1202', 'name_ar' => 'أجهزة الراوترات والسيرفرات (MikroTik / CCR)', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1203', 'name_ar' => 'الهوائيات والصحون والسكترات (Antennas)', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1204', 'name_ar' => 'كابلات الألياف والشبكة', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1205', 'name_ar' => 'منظومة الطاقة الشمسية والبطاريات والمولدات', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1206', 'name_ar' => 'أجهزة المكاتب والكمبيوتر', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
            ['code' => '1209', 'name_ar' => 'مجمع إهلاك الأصول الثابتة', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 1],

            ['code' => '2', 'name_ar' => 'الخصوم والالتزامات', 'type' => 'liability', 'parent' => null, 'level' => 1, 'is_sys' => 1],
            ['code' => '21', 'name_ar' => 'الخصوم المتداولة', 'type' => 'liability', 'parent' => '2', 'level' => 2, 'is_sys' => 1],
            ['code' => '2101', 'name_ar' => 'الموردون وحسابات الدائنين', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 1],
            ['code' => '210101', 'name_ar' => 'مزودو سعات وخطوط الإنترنت (ISP Providers)', 'type' => 'liability', 'parent' => '2101', 'level' => 4, 'is_sys' => 1],
            ['code' => '210102', 'name_ar' => 'موردو الأجهزة والمعدات وقطع الغيار', 'type' => 'liability', 'parent' => '2101', 'level' => 4, 'is_sys' => 0],
            ['code' => '2102', 'name_ar' => 'مستحقات الرواتب والأجور', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 1],
            ['code' => '2103', 'name_ar' => 'تأمينات وأمانات الوكلاء', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 0],
            ['code' => '2104', 'name_ar' => 'إيرادات اشتراكات مقبوضة مقدماً', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 0],

            ['code' => '3', 'name_ar' => 'حقوق الملكية', 'type' => 'equity', 'parent' => null, 'level' => 1, 'is_sys' => 1],
            ['code' => '31', 'name_ar' => 'رأس المال', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
            ['code' => '3101', 'name_ar' => 'رأس المال المدفوع', 'type' => 'equity', 'parent' => '31', 'level' => 3, 'is_sys' => 1],
            ['code' => '3102', 'name_ar' => 'الأرصدة الافتتاحية والتسويات', 'type' => 'equity', 'parent' => '31', 'level' => 3, 'is_sys' => 1],
            ['code' => '32', 'name_ar' => 'جاري الشركاء والمساهمين', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
            ['code' => '3201', 'name_ar' => 'جاري الشركاء والمساهمين', 'type' => 'equity', 'parent' => '32', 'level' => 3, 'is_sys' => 1],
            ['code' => '33', 'name_ar' => 'الأرباح المبقاة والمرحلة', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
            ['code' => '3301', 'name_ar' => 'أرباح مرحلة من سنوات سابقة', 'type' => 'equity', 'parent' => '33', 'level' => 3, 'is_sys' => 1],
            ['code' => '3302', 'name_ar' => 'أرباح وخسائر الفترة الحالية', 'type' => 'equity', 'parent' => '33', 'level' => 3, 'is_sys' => 1],

            ['code' => '4', 'name_ar' => 'الإيرادات', 'type' => 'revenue', 'parent' => null, 'level' => 1, 'is_sys' => 1],
            ['code' => '41', 'name_ar' => 'إيرادات النشاط الرئيسي', 'type' => 'revenue', 'parent' => '4', 'level' => 2, 'is_sys' => 1],
            ['code' => '4101', 'name_ar' => 'إيرادات مبيعات كروت المايكروتك', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
            ['code' => '4102', 'name_ar' => 'إيرادات الاشتراكات الشهرية والخطوط', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
            ['code' => '4103', 'name_ar' => 'إيرادات الشحن الفوري والرصيد المباشر', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
            ['code' => '4104', 'name_ar' => 'إيرادات كروت VIP والخدمات الخاصة', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 0],
            ['code' => '42', 'name_ar' => 'إيرادات خدمات وأرباح أخرى', 'type' => 'revenue', 'parent' => '4', 'level' => 2, 'is_sys' => 1],
            ['code' => '4201', 'name_ar' => 'إيرادات تركيب وصيانة شبكات للغير', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 0],
            ['code' => '4202', 'name_ar' => 'أرباح مبيعات أجهزة ومعدات شبكية', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 0],
            ['code' => '4203', 'name_ar' => 'إيرادات فروق أسعار الصرف', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 1],

            ['code' => '5', 'name_ar' => 'المصروفات', 'type' => 'expense', 'parent' => null, 'level' => 1, 'is_sys' => 1],
            ['code' => '51', 'name_ar' => 'تكاليف التشغيل المباشرة', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
            ['code' => '5101', 'name_ar' => 'تكلفة سعات وخطوط الإنترنت الرئيسية (Bandwidth)', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
            ['code' => '5102', 'name_ar' => 'إيجارات مواقع وأبراج البث', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
            ['code' => '5103', 'name_ar' => 'وقود ومحروقات المولدات وكهرباء الأبراج', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
            ['code' => '5104', 'name_ar' => 'صيانة دورية لشبكات التوزيع والأبراج', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
            ['code' => '52', 'name_ar' => 'الرواتب والأجور والمكافآت', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
            ['code' => '5201', 'name_ar' => 'رواتب المهندسين والفنيين', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 1],
            ['code' => '5202', 'name_ar' => 'رواتب الإدارة والمحاسبة والمبيعات', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 1],
            ['code' => '5203', 'name_ar' => 'مكافآت وحوافز وبدلات إضافية', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 0],
            ['code' => '53', 'name_ar' => 'المصروفات الإدارية والعمومية', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
            ['code' => '5301', 'name_ar' => 'إيجار المقر والمكاتب', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
            ['code' => '5302', 'name_ar' => 'فواتير المياه والكهرباء والاتصالات للمكاتب', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
            ['code' => '5303', 'name_ar' => 'مطبوعات وقرطاسية وتغليف كروت', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
            ['code' => '5304', 'name_ar' => 'ضيافة ونظافة ومصاريف بوفيه', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
            ['code' => '5305', 'name_ar' => 'عمولات بنكية ومصاريف تحويل صرافة', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
            ['code' => '54', 'name_ar' => 'مصاريف التسويق والترويج', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
            ['code' => '5401', 'name_ar' => 'رسائل SMS وتنبيهات WhatsApp', 'type' => 'expense', 'parent' => '54', 'level' => 3, 'is_sys' => 0],
            ['code' => '5402', 'name_ar' => 'إعلانات وبنرات ولافتات ترويجية', 'type' => 'expense', 'parent' => '54', 'level' => 3, 'is_sys' => 0],
            ['code' => '55', 'name_ar' => 'الإهلاك والخسائر', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
            ['code' => '5501', 'name_ar' => 'إهلاك الأجهزة والمعدات والأبراج', 'type' => 'expense', 'parent' => '55', 'level' => 3, 'is_sys' => 1],
            ['code' => '5502', 'name_ar' => 'ديون معدومة وخسائر فروق صرف', 'type' => 'expense', 'parent' => '55', 'level' => 3, 'is_sys' => 1],
        ];

        $codeToId = [];
        foreach ($accounts as $a) {
            $parentDbId = null;
            if (!empty($a['parent']) && isset($codeToId[$a['parent']])) {
                $parentDbId = $codeToId[$a['parent']];
            }
            $chk = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=?");
            $chk->execute([$networkId, $a['code']]);
            $existingId = $chk->fetchColumn();

            if ($existingId) {
                $upd = $this->db->prepare("UPDATE um_chart_of_accounts SET name_ar=?, account_type=?, parent_id=?, level=?, is_system=? WHERE id=?");
                $upd->execute([$a['name_ar'], $a['type'], $parentDbId, $a['level'], $a['is_sys'], $existingId]);
                $codeToId[$a['code']] = (int)$existingId;
            } else {
                $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id, account_code, name_ar, account_type, parent_id, level, is_system, is_active, balance) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0.00)");
                $ins->execute([$networkId, $a['code'], $a['name_ar'], $a['type'], $parentDbId, $a['level'], $a['is_sys']]);
                $codeToId[$a['code']] = (int)$this->db->lastInsertId();
            }
        }
        foreach ($accounts as $a) {
            if (!empty($a['parent']) && isset($codeToId[$a['parent']]) && isset($codeToId[$a['code']])) {
                $pId = $codeToId[$a['parent']];
                $cId = $codeToId[$a['code']];
                $this->db->prepare("UPDATE um_chart_of_accounts SET parent_id=? WHERE id=?")->execute([$pId, $cId]);
            }
        }
    }
}
