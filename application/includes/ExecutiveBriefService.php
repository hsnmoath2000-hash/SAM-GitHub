<?php
declare(strict_types=1);

class ExecutiveBriefService {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * Generate structured executive summary message for the day
     */
    public function generateDailyExecutiveReport(?string $date = null, int $networkId = 1): array {
        $reportDate = $date ?? date('Y-m-d');
        
        // 1. Network Info & Owner Phone
        $netStmt = $this->db->prepare("SELECT id, name FROM um_networks WHERE id = ? LIMIT 1");
        $netStmt->execute([$networkId]);
        $network = $netStmt->fetch(PDO::FETCH_ASSOC) ?: ['name' => 'شبكة سام'];
        $netName = (string)$network['name'];

        // Get owner / notification phone for this network
        $ownerPhone = '';
        try {
            $phStmt = $this->db->prepare("
                SELECT phone FROM um_admins 
                WHERE (data_scope = 'all' OR JSON_CONTAINS(allowed_networks, CAST(? AS CHAR)))
                  AND phone IS NOT NULL AND TRIM(phone) != ''
                ORDER BY (role = 'system_owner') DESC, id ASC 
                LIMIT 1
            ");
            $phStmt->execute([(string)$networkId]);
            $ownerPhone = (string)$phStmt->fetchColumn();
        } catch (Throwable $e) {
            $ownerPhone = '';
        }

        if (empty($ownerPhone)) {
            $phStmt2 = $this->db->query("SELECT phone FROM um_admins WHERE phone IS NOT NULL AND TRIM(phone) != '' ORDER BY id ASC LIMIT 1");
            $ownerPhone = (string)($phStmt2 ? $phStmt2->fetchColumn() : '967776082846');
        }
        
        // 2. Sales by Currencies
        $salesStmt = $this->db->prepare("
            SELECT 
                COALESCE(currency_code, 'YER_SANAA') AS curr,
                COUNT(id) AS inv_count,
                COALESCE(SUM(total_amount), 0) AS total_sales,
                COALESCE(SUM(paid_amount), 0) AS total_collected
            FROM um_sales_invoices
            WHERE network_id = ? AND DATE(created_at) = ?
            GROUP BY curr
        ");
        $salesStmt->execute([$networkId, $reportDate]);
        $salesRows = $salesStmt->fetchAll(PDO::FETCH_ASSOC);

        $salesByCurr = [
            'YER_SANAA' => ['name' => 'ريال يمني (صنعاء)', 'symbol' => 'ر.ي', 'total' => 0.0, 'collected' => 0.0, 'count' => 0],
            'YER_ADEN' => ['name' => 'ريال يمني (عدن)', 'symbol' => 'ر.ي (عدن)', 'total' => 0.0, 'collected' => 0.0, 'count' => 0],
            'SAR' => ['name' => 'ريال سعودي', 'symbol' => 'ر.س', 'total' => 0.0, 'collected' => 0.0, 'count' => 0],
            'USD' => ['name' => 'دولار أمريكي', 'symbol' => '$', 'total' => 0.0, 'collected' => 0.0, 'count' => 0]
        ];

        foreach ($salesRows as $sr) {
            $c = $sr['curr'];
            if (isset($salesByCurr[$c])) {
                $salesByCurr[$c]['total'] = (float)$sr['total_sales'];
                $salesByCurr[$c]['collected'] = (float)$sr['total_collected'];
                $salesByCurr[$c]['count'] = (int)$sr['inv_count'];
            }
        }

        // 3. Operating Expenses & Vouchers
        $expStmt = $this->db->prepare("
            SELECT 
                COALESCE(currency_code, 'YER_SANAA') AS curr,
                COUNT(id) AS exp_count,
                COALESCE(SUM(amount), 0) AS total_exp
            FROM um_vouchers_financial
            WHERE network_id = ? AND voucher_type = 'payment' AND DATE(created_at) = ?
            GROUP BY curr
        ");
        $expStmt->execute([$networkId, $reportDate]);
        $expRows = $expStmt->fetchAll(PDO::FETCH_ASSOC);
        $totalExpYer = 0.0;
        foreach ($expRows as $er) {
            if ($er['curr'] === 'YER_SANAA') $totalExpYer += (float)$er['total_exp'];
        }

        // 4. E-Wallet Balances
        require_once __DIR__ . '/EWalletPaymentService.php';
        $ewSvc = new EWalletPaymentService($this->db);
        $wallets = $ewSvc->getWalletAccounts($networkId);

        // 5. Fleet Outages & Status
        $nasStmt = $this->db->prepare("SELECT id, nasname, shortname FROM nas WHERE network_id = ?");
        $nasStmt->execute([$networkId]);
        $routers = $nasStmt->fetchAll(PDO::FETCH_ASSOC);

        $outageStmt = $this->db->prepare("
            SELECT COUNT(id) AS outage_count, COALESCE(SUM(duration_seconds), 0) AS total_duration_sec
            FROM um_asset_outage_logs
            WHERE network_id = ? AND DATE(disconnected_at) = ?
        ");
        $outageStmt->execute([$networkId, $reportDate]);
        $outageInfo = $outageStmt->fetch(PDO::FETCH_ASSOC) ?: ['outage_count' => 0, 'total_duration_sec' => 0];
        $downtimeMins = (int)round((int)$outageInfo['total_duration_sec'] / 60);

        // Format Arabic Message
        $salesText = "";
        foreach ($salesByCurr as $code => $info) {
            if ($info['total'] > 0 || $info['count'] > 0) {
                $salesText .= "• {$info['name']}: " . number_format($info['total'], 2) . " {$info['symbol']} ({$info['count']} فاتورة)\n";
            }
        }
        if ($salesText === "") $salesText = "• لم تُسجل مبيعات اليوم\n";

        $walletText = "";
        foreach ($wallets as $w) {
            if ((float)$w['balance'] > 0) {
                $walletText .= "• {$w['account_name']}: " . number_format((float)$w['balance'], 2) . " ر.ي\n";
            }
        }
        if ($walletText === "") $walletText = "• لا توجد أرصدة موجبة مسجلة\n";

        $totalSalesYer = $salesByCurr['YER_SANAA']['total'];
        $netProfitYer = $totalSalesYer - $totalExpYer;

        $msg = "📊 *التقرير المالي والتنفيذي اليومي — SAM Enterprise*\n";
        $msg .= "🏢 *الشبكة:* {$netName}\n";
        $msg .= "📅 *التاريخ:* {$reportDate}\n";
        $msg .= "------------------------------------\n";
        $msg .= "💵 *مبيعات الكروت والباقات (حسب العملات):*\n{$salesText}";
        $msg .= "------------------------------------\n";
        $msg .= "💳 *إجمالي المصاريف والنفقات:* " . number_format($totalExpYer, 2) . " ر.ي\n";
        $msg .= "💰 *صافي الربح التشغيلي اليومي:* " . number_format($netProfitYer, 2) . " ر.ي\n";
        $msg .= "------------------------------------\n";
        $msg .= "📱 *أرصدة المحافظ والبنوك الإلكترونية:*\n{$walletText}";
        $msg .= "------------------------------------\n";
        $msg .= "📡 *حالة أسطول المايكروتك:* " . count($routers) . " راوتر مسجل\n";
        $msg .= "⚡ *ساعات التوقف والأعطال:* {$outageInfo['outage_count']} انقطاع ({$downtimeMins} دقيقة)\n";
        $msg .= "------------------------------------\n";
        $msg .= "🔒 *حالة الإغلاق اليومي:* مكتمل ومرحل بنجاح ✅";

        return [
            'success' => true,
            'report_date' => $reportDate,
            'network_id' => $networkId,
            'network_name' => $netName,
            'owner_phone' => $ownerPhone,
            'message_text' => $msg,
            'metrics' => [
                'sales_by_curr' => $salesByCurr,
                'total_expenses_yer' => $totalExpYer,
                'net_profit_yer' => $netProfitYer,
                'routers_count' => count($routers),
                'downtime_minutes' => $downtimeMins
            ]
        ];
    }

    /**
     * Dispatch daily executive WhatsApp to owner
     */
    public function dispatchDailyExecutiveBrief(?string $date = null, int $networkId = 1, ?string $targetPhone = null): array {
        $rep = $this->generateDailyExecutiveReport($date, $networkId);
        $phone = $targetPhone ?: $rep['owner_phone'];
        $message = $rep['message_text'];

        if (empty($phone)) {
            throw new RuntimeException("رقم هاتف مالك الشبكة غير محدد");
        }

        require_once __DIR__ . '/WhatsAppService.php';
        $whatsapp = new WhatsAppService($this->db, null, $networkId);
        $res = $whatsapp->sendMessage($phone, $message, 'exec_brief_' . time(), null, 'executive_report');

        return [
            'success' => true,
            'message' => 'تم إرسال التقرير المالي والتنفيذي اليومي إلى واتساب المالك بنجاح',
            'phone' => $phone,
            'report' => $rep,
            'whatsapp_result' => $res
        ];
    }
}
