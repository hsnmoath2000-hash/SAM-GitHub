<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/FinancialAccountingService.php';

/**
 * EWalletPaymentService - Integrates Local Yemeni E-Wallets with SAM Double-Entry Accounting
 * Supports: Kuraimi (حاسب/مميز), OneCash, Jawali, Floosak, Cash, Qutaibi Bank
 */
class EWalletPaymentService extends BaseService {
    public const SUPPORTED_WALLETS = [
        'kuraimi' => [
            'code' => '110201',
            'name_ar' => 'بنك الكريمي / محفظة حاسب',
            'name_en' => 'Al-Kuraimi Haseb Wallet',
            'short_name' => 'الكريمي'
        ],
        'onecash' => [
            'code' => '110202',
            'name_ar' => 'محفظة ون كاش (OneCash)',
            'name_en' => 'OneCash Wallet',
            'short_name' => 'ون كاش'
        ],
        'jawali' => [
            'code' => '110203',
            'name_ar' => 'محفظة جوالي (Jawali)',
            'name_en' => 'Jawali Wallet',
            'short_name' => 'جوالي'
        ],
        'floosak' => [
            'code' => '110204',
            'name_ar' => 'محفظة فلوسك (Floosak)',
            'name_en' => 'Floosak Wallet',
            'short_name' => 'فلوسك'
        ],
        'cash_wallet' => [
            'code' => '110205',
            'name_ar' => 'محفظة كاش (Cash)',
            'name_en' => 'Cash Wallet',
            'short_name' => 'كاش'
        ],
        'qutaibi' => [
            'code' => '110206',
            'name_ar' => 'بنك القطيبي الإسلامي',
            'name_en' => 'Al-Qutaibi Islamic Bank',
            'short_name' => 'القطيبي'
        ]
    ];

    /**
     * Ensure chart of account entries exist for all supported wallets in a network
     */
    public function ensureWalletAccounts(int $networkId = 1): void {
        // First verify parent account 1102 exists
        $parentStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = '1102' AND network_id = ? LIMIT 1");
        $parentStmt->execute([$networkId]);
        $parent = $parentStmt->fetch(PDO::FETCH_ASSOC);

        $parentId = $parent ? (int)$parent['id'] : null;
        if (!$parentId) {
            $insParent = $this->db->prepare("
                INSERT INTO um_chart_of_accounts (account_code, name_ar, name_en, account_type, parent_id, level, is_system, is_active, network_id)
                VALUES ('1102', 'البنوك والمحافظ الإلكترونية', 'Banks and E-Wallets', 'asset', NULL, 2, 1, 1, ?)
            ");
            $insParent->execute([$networkId]);
            $parentId = (int)$this->db->lastInsertId();
        }

        $checkStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = ? AND network_id = ? LIMIT 1");
        $insStmt = $this->db->prepare("
            INSERT INTO um_chart_of_accounts (account_code, name_ar, name_en, account_type, parent_id, level, is_system, is_active, network_id)
            VALUES (?, ?, ?, 'asset', ?, 3, 1, 1, ?)
        ");

        foreach (self::SUPPORTED_WALLETS as $key => $w) {
            $checkStmt->execute([$w['code'], $networkId]);
            if (!$checkStmt->fetch()) {
                $insStmt->execute([$w['code'], $w['name_ar'], $w['name_en'], $parentId, $networkId]);
            }
        }
    }

    /**
     * Get list of all wallet accounts with their current balances
     */
    public function getWalletAccounts(int $networkId = 1): array {
        $this->ensureWalletAccounts($networkId);
        $stmt = $this->db->prepare("
            SELECT 
                a.id,
                a.account_code,
                a.name_ar,
                a.name_en,
                COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS current_balance
            FROM um_chart_of_accounts a
            LEFT JOIN um_journal_entry_lines l ON l.account_id = a.id AND l.network_id = a.network_id
            WHERE a.network_id = ? AND a.account_code LIKE '11020%' AND a.is_active = 1
            GROUP BY a.id, a.account_code, a.name_ar, a.name_en
            ORDER BY a.account_code ASC
        ");
        $stmt->execute([$networkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $result = [];
        foreach ($rows as $row) {
            $walletKey = 'other';
            foreach (self::SUPPORTED_WALLETS as $k => $w) {
                if ($w['code'] === $row['account_code']) {
                    $walletKey = $k;
                    break;
                }
            }
            $result[] = [
                'account_id' => (int)$row['id'],
                'wallet_key' => $walletKey,
                'account_code' => $row['account_code'],
                'account_name' => $row['name_ar'],
                'name_en' => $row['name_en'],
                'balance' => (float)$row['current_balance']
            ];
        }
        return $result;
    }

    /**
     * Process E-Wallet deposit or recharge transaction and create double-entry journal entry
     */
    public function processWalletDeposit(array $data, int $adminId = 1): array {
        $walletKey = (string)($data['wallet_key'] ?? 'kuraimi');
        $amount = (float)($data['amount'] ?? 0);
        $transferRef = trim((string)($data['transfer_reference'] ?? ''));
        $targetType = (string)($data['target_type'] ?? 'agent'); // 'agent' | 'customer' | 'direct_sale'
        $targetId = (int)($data['target_id'] ?? $adminId);
        $notes = trim((string)($data['notes'] ?? ''));
        $networkId = (int)($data['network_id'] ?? 1);
        $currency = (string)($data['currency_code'] ?? 'YER_SANAA');

        if ($amount <= 0) {
            throw new InvalidArgumentException('مبلغ الإيداع يجب أن يكون أكبر من الصفر');
        }

        if ($transferRef === '') {
            throw new InvalidArgumentException('رقم الحوالة أو المرجع مطلوب لتأكيد العملية');
        }

        $walletInfo = self::SUPPORTED_WALLETS[$walletKey] ?? null;
        if (!$walletInfo) {
            throw new InvalidArgumentException('نوع المحفظة غير مدعوم');
        }

        $this->ensureWalletAccounts($networkId);

        // Find wallet account ID
        $accStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = ? AND network_id = ? LIMIT 1");
        $accStmt->execute([$walletInfo['code'], $networkId]);
        $walletAcc = $accStmt->fetch(PDO::FETCH_ASSOC);
        if (!$walletAcc) {
            throw new RuntimeException('حساب المحفظة غير موجود في دليل الحسابات');
        }
        $walletAccountId = (int)$walletAcc['id'];

        // Determine destination account (Credit)
        $creditAccountId = null;
        if ($targetType === 'agent') {
            // Credit Agent Wallet / Accounts Payable
            $agAccStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = '2101' AND network_id = ? LIMIT 1");
            $agAccStmt->execute([$networkId]);
            $agAcc = $agAccStmt->fetch(PDO::FETCH_ASSOC);
            $creditAccountId = $agAcc ? (int)$agAcc['id'] : $walletAccountId;
        } else {
            // Direct Revenue
            $revStmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE account_code = '4101' AND network_id = ? LIMIT 1");
            $revStmt->execute([$networkId]);
            $revAcc = $revStmt->fetch(PDO::FETCH_ASSOC);
            $creditAccountId = $revAcc ? (int)$revAcc['id'] : $walletAccountId;
        }

        $this->db->beginTransaction();
        try {
            // 1. Create Journal Entry
            $entryNo = 'JV-WAL-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $desc = "إيداع عبر محفظة {$walletInfo['short_name']} - مرجع: {$transferRef} - " . ($notes ?: 'شحن رصيد');

            $jvStmt = $this->db->prepare("
                INSERT INTO um_journal_entries (
                    entry_no, entry_date, source_module, reference_no, description, 
                    total_debit, total_credit, is_posted, created_by, network_id, currency_code
                ) VALUES (?, CURDATE(), 'ewallet_deposit', ?, ?, ?, ?, 1, ?, ?, ?)
            ");
            $jvStmt->execute([$entryNo, $transferRef, $desc, $amount, $amount, $adminId, $networkId, $currency]);
            $jvId = (int)$this->db->lastInsertId();

            // 2. Debit Wallet Account
            $lineStmt = $this->db->prepare("
                INSERT INTO um_journal_entry_lines (journal_entry_id, account_id, debit, credit, line_description, line_index, network_id)
                VALUES (?, ?, ?, 0.00, ?, 0, ?)
            ");
            $lineStmt->execute([$jvId, $walletAccountId, $amount, "إيداع محفظة {$walletInfo['short_name']}", $networkId]);

            // 3. Credit Target Account
            $lineStmt->execute([$jvId, $creditAccountId, 0.00, $amount, "رصيد دائن: " . $desc, $networkId]);

            // 4. Update Agent Balance if agent
            if ($targetType === 'agent') {
                $checkW = $this->db->prepare("SELECT balance FROM um_agent_wallets WHERE admin_id = ? AND network_id = ?");
                $checkW->execute([$targetId, $networkId]);
                $curRow = $checkW->fetch(PDO::FETCH_ASSOC);

                if ($curRow) {
                    $newBalance = (float)$curRow['balance'] + $amount;
                    $updW = $this->db->prepare("UPDATE um_agent_wallets SET balance = ? WHERE admin_id = ? AND network_id = ?");
                    $updW->execute([$newBalance, $targetId, $networkId]);
                } else {
                    $newBalance = $amount;
                    $insW = $this->db->prepare("INSERT INTO um_agent_wallets (admin_id, balance, network_id) VALUES (?, ?, ?)");
                    $insW->execute([$targetId, $newBalance, $networkId]);
                }

                // Log wallet transaction
                $txStmt = $this->db->prepare("
                    INSERT INTO um_wallet_transactions (admin_id, transaction_type, amount, balance_after, reference_type, reference_id, notes, created_by, network_id)
                    VALUES (?, 'credit', ?, ?, 'ewallet_deposit', ?, ?, ?, ?)
                ");
                $txStmt->execute([$targetId, $amount, $newBalance, $transferRef, $desc, $adminId, $networkId]);
            }

            // 5. Send Notification
            if ($this->notificationService) {
                try {
                    $this->notificationService->createNotification(
                        $networkId,
                        'financial',
                        'إيداع محفظة جديد',
                        "تم تسجيل إيداع بمبلغ " . number_format($amount, 2) . " عبر {$walletInfo['short_name']} (مرجع: {$transferRef})",
                        $adminId
                    );
                } catch (Throwable $e) {
                    // Non-critical notification failure
                }
            }

            $this->db->commit();

            return [
                'success' => true,
                'message' => 'تم تسجيل العملية وترحيل القيد المحاسبي بنجاح',
                'entry_no' => $entryNo,
                'journal_entry_id' => $jvId,
                'amount' => $amount,
                'wallet' => $walletInfo['short_name'],
                'reference' => $transferRef
            ];
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}
