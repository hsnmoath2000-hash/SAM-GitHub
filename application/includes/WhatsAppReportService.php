<?php
/**
 * WhatsAppReportService — نظام تقارير واتساب لـ SAM User Manager
 *
 * التقارير المتاحة:
 *  - التقرير اليومي الصباحي  (daily_morning)
 *  - تقرير الصندوق المسائي  (daily_cashbox)
 *  - التقرير الأسبوعي        (weekly_summary)
 *  - تنبيه نفاد الكروت       (low_stock_check)
 *
 * الاستخدام:
 *   $svc = new WhatsAppReportService($pdo);
 *   $svc->sendDailyMorningReport();
 */

declare(strict_types=1);

require_once __DIR__ . '/WhatsAppService.php';
require_once __DIR__ . '/TelegramService.php';

class WhatsAppReportService
{
    private PDO $db;
    private WhatsAppService $wa;
    private TelegramService $telegram;
    private string $systemName;
    private string $networkName;
    private int $networkId;

    public function __construct(PDO $db, int $networkId = 0)
    {
        $this->db        = $db;
        $channels = new NetworkChannelService($db);
        $this->networkId = $channels->normalizeNetworkId($networkId);
        $db->exec("SET @sam_active_network_id=".$this->networkId);
        $this->wa        = new WhatsAppService($db, null, $this->networkId);
        $this->telegram  = new TelegramService($db, $this->networkId);
        $this->systemName  = $this->getSetting('system_name', 'SAM');
        $st=$db->prepare("SELECT name FROM um_networks WHERE id=?");$st->execute([$this->networkId]);
        $this->networkName = (string)($st->fetchColumn() ?: $this->getSetting('network_name', 'سام'));
    }

    // =========================================================================
    // PUBLIC REPORT METHODS
    // =========================================================================

    /**
     * التقرير اليومي الصباحي — يُرسل لجميع superadmins
     */
    public function sendDailyMorningReport(): array
    {
        $data = $this->collectDailyData();
        $msg  = $this->formatDailyMorningMessage($data);
        return $this->sendToAllSuperAdmins($msg, 'daily_morning_report');
    }

    /**
     * تقرير الصندوق المسائي — يُرسل لجميع superadmins
     */
    public function sendDailyCashboxReport(): array
    {
        $data = $this->collectCashboxData();
        $msg  = $this->formatCashboxMessage($data);
        return $this->sendToAllSuperAdmins($msg, 'daily_cashbox_report');
    }

    /**
     * التقرير الأسبوعي — يُرسل لجميع superadmins
     */
    public function sendWeeklySummaryReport(): array
    {
        $data = $this->collectWeeklyData();
        $msg  = $this->formatWeeklyMessage($data);
        return $this->sendToAllSuperAdmins($msg, 'weekly_summary_report');
    }

    /**
     * فحص نفاد الكروت وإرسال التنبيهات
     */
    public function checkAndSendLowStockAlerts(): array
    {
        $alerts = $this->getLowStockData();
        if (empty($alerts)) {
            return ['sent' => 0, 'alerts' => []];
        }

        $results = [];
        foreach ($alerts as $alert) {
            // تنبيه لمالك المستودع (الوكيل)
            if (!empty($alert['owner_phone'])) {
                $msgAgent = $this->formatLowStockAgentMessage($alert);
                $this->sendWhatsApp($alert['owner_phone'], $msgAgent, 'low_stock_alert');
            }
        }

        // ملخص كل التنبيهات لمالك النظام
        $msgOwner = $this->formatLowStockOwnerMessage($alerts);
        $ownerResults = $this->sendToAllSuperAdmins($msgOwner, 'low_stock_summary');

        return [
            'sent'   => count($alerts),
            'alerts' => $alerts,
            'owner'  => $ownerResults,
        ];
    }

    // =========================================================================
    // DATA COLLECTION
    // =========================================================================

    private function collectDailyData(): array
    {
        $today = date('Y-m-d');
        $data  = [];

        // ─── مبيعات اليوم ───────────────────────────────────────────────────
        $stmt = $this->db->prepare("
            SELECT
                COUNT(*)                                              AS invoice_count,
                COALESCE(SUM(total_amount), 0)                        AS total_sales,
                COALESCE(SUM(paid_amount), 0)                         AS total_paid,
                COALESCE(SUM(remaining_amount), 0)                    AS total_deferred,
                COALESCE(SUM(quantity), 0)                            AS cards_sold
            FROM um_sales_invoices
            WHERE network_id=? AND DATE(created_at) = ?
              AND invoice_status != 'refunded'
        ");
        $stmt->execute([$this->networkId,$today]);
        $data['sales'] = $stmt->fetch(PDO::FETCH_ASSOC);

        // ─── مبيعات كل وكيل اليوم ──────────────────────────────────────────
        $stmt2 = $this->db->prepare("
            SELECT
                a.fullname                          AS agent_name,
                COUNT(i.id)                         AS invoice_count,
                COALESCE(SUM(i.total_amount), 0)    AS total_amount,
                COALESCE(SUM(i.quantity), 0)        AS cards_count
            FROM um_sales_invoices i
            JOIN um_admins a ON a.id = i.seller_id
            WHERE i.network_id=? AND DATE(i.created_at) = ?
              AND i.invoice_status != 'refunded'
            GROUP BY i.seller_id, a.fullname
            ORDER BY total_amount DESC
        ");
        $stmt2->execute([$this->networkId,$today]);
        $data['agents_today'] = $stmt2->fetchAll(PDO::FETCH_ASSOC);

        // ─── إجمالي الكروت ──────────────────────────────────────────────────
        $stmt3 = $this->db->prepare("
            SELECT
                COUNT(*)                                            AS total_cards,
                SUM(CASE WHEN is_sold=1 THEN 1 ELSE 0 END)         AS sold_cards,
                SUM(CASE WHEN is_free_quota=1 THEN 1 ELSE 0 END)   AS free_cards,
                SUM(CASE WHEN is_sold=0 AND is_free_quota=0 AND status='active' THEN 1 ELSE 0 END) AS available_cards,
                SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END)  AS expired_cards
            FROM um_vouchers_meta
            WHERE network_id=?
        ");
        $stmt3->execute([$this->networkId]);
        $data['cards'] = $stmt3->fetch(PDO::FETCH_ASSOC);

        // ─── جلسات RADIUS النشطة ────────────────────────────────────────────
        $stmt4 = $this->db->prepare("
            SELECT COUNT(*) AS active_sessions
            FROM radacct
            WHERE network_id=? AND acctstoptime IS NULL
        ");
        $stmt4->execute([$this->networkId]);
        $data['sessions'] = $stmt4->fetch(PDO::FETCH_ASSOC);

        // ─── حالة الراوترات ──────────────────────────────────────────────────
        $stmt5 = $this->db->prepare("
            SELECT shortname, nasname, api_enabled FROM nas WHERE network_id=? ORDER BY id
        ");
        $stmt5->execute([$this->networkId]);
        $data['routers'] = $stmt5->fetchAll(PDO::FETCH_ASSOC);

        // ─── أرصدة الوكلاء الدائنة (الديون) ────────────────────────────────
        $stmt6 = $this->db->prepare("
            SELECT a.fullname,b.balance,r.role_key AS role
            FROM um_admins a
            JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=? AND r.is_active=1
            JOIN um_admin_network_balances b ON b.admin_id=a.id AND b.network_id=r.network_id
            WHERE r.role_key IN ('distributor','pos_agent') AND b.balance>0
            ORDER BY b.balance DESC
            LIMIT 5
        ");
        $stmt6->execute([$this->networkId]);
        $data['top_debtors'] = $stmt6->fetchAll(PDO::FETCH_ASSOC);

        $data['date']       = $today;
        $data['day_name']   = $this->arabicDayName(date('N'));
        $data['system']     = $this->systemName;
        $data['network']    = $this->networkName;

        return $data;
    }

    private function collectCashboxData(): array
    {
        $today = date('Y-m-d');

        $stmt = $this->db->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN cashbox_impact > 0 AND DATE(created_at)=CURDATE() THEN cashbox_impact ELSE 0 END),0)   AS today_in,
                COALESCE(SUM(CASE WHEN cashbox_impact < 0 AND DATE(created_at)=CURDATE() THEN ABS(cashbox_impact) ELSE 0 END),0) AS today_out,
                COALESCE(SUM(cashbox_impact), 0)  AS cashbox_balance,
                COALESCE(SUM(CASE WHEN tx_type='sale_invoice' AND DATE(created_at)=CURDATE() THEN debit ELSE 0 END),0) AS today_sales
            FROM um_financial_transactions
            WHERE network_id=?
        ");
        $stmt->execute([$this->networkId]);
        $cashbox = $stmt->fetch(PDO::FETCH_ASSOC);

        // إجمالي ديون الوكلاء
        $debtStmt=$this->db->prepare("
            SELECT COALESCE(SUM(CASE WHEN b.balance>0 THEN b.balance ELSE 0 END),0) AS total_debt
            FROM um_admin_network_roles r JOIN um_admin_network_balances b ON b.network_id=r.network_id AND b.admin_id=r.admin_id
            WHERE r.network_id=? AND r.is_active=1 AND r.role_key IN ('distributor','pos_agent')
        ");$debtStmt->execute([$this->networkId]);$debt=$debtStmt->fetch(PDO::FETCH_ASSOC);

        // مبيعات اليوم حسب باقة
        $byProfile = $this->db->prepare("
            SELECT profile_name, COUNT(*) AS cnt, COALESCE(SUM(sale_price),0) AS revenue
            FROM um_vouchers_meta
            WHERE network_id=? AND DATE(sold_at) = ?
            GROUP BY profile_name
            ORDER BY revenue DESC
            LIMIT 5
        ");
        $byProfile->execute([$this->networkId,$today]);
        $topProfiles = $byProfile->fetchAll(PDO::FETCH_ASSOC);

        return [
            'date'         => $today,
            'day_name'     => $this->arabicDayName(date('N')),
            'network'      => $this->networkName,
            'cashbox'      => $cashbox,
            'total_debt'   => (float)($debt['total_debt'] ?? 0),
            'top_profiles' => $topProfiles,
        ];
    }

    private function collectWeeklyData(): array
    {
        $weekStart = date('Y-m-d', strtotime('monday this week'));
        $weekEnd   = date('Y-m-d');

        // إجمالي مبيعات الأسبوع
        $stmt = $this->db->prepare("
            SELECT
                COUNT(*)                                    AS invoice_count,
                COALESCE(SUM(total_amount), 0)              AS total_sales,
                COALESCE(SUM(paid_amount), 0)               AS total_paid,
                COALESCE(SUM(quantity), 0)                  AS cards_sold
            FROM um_sales_invoices
            WHERE network_id=? AND DATE(created_at) BETWEEN ? AND ?
              AND invoice_status != 'refunded'
        ");
        $stmt->execute([$this->networkId,$weekStart, $weekEnd]);
        $weekly = $stmt->fetch(PDO::FETCH_ASSOC);

        // مبيعات كل وكيل الأسبوع
        $stmt2 = $this->db->prepare("
            SELECT
                a.fullname,
                COUNT(i.id)                      AS invoice_count,
                COALESCE(SUM(i.total_amount),0)  AS total_amount,
                COALESCE(SUM(i.quantity),0)      AS cards_count
            FROM um_sales_invoices i
            JOIN um_admins a ON a.id = i.seller_id
            WHERE i.network_id=? AND DATE(i.created_at) BETWEEN ? AND ?
              AND i.invoice_status != 'refunded'
            GROUP BY i.seller_id, a.fullname
            ORDER BY total_amount DESC
        ");
        $stmt2->execute([$this->networkId,$weekStart, $weekEnd]);
        $agentWeekly = $stmt2->fetchAll(PDO::FETCH_ASSOC);

        // أكثر الباقات مبيعاً
        $stmt3 = $this->db->prepare("
            SELECT profile_name, COUNT(*) AS cnt, COALESCE(SUM(sale_price),0) AS revenue
            FROM um_vouchers_meta
            WHERE network_id=? AND DATE(sold_at) BETWEEN ? AND ?
            GROUP BY profile_name
            ORDER BY cnt DESC
            LIMIT 5
        ");
        $stmt3->execute([$this->networkId,$weekStart, $weekEnd]);
        $topProfiles = $stmt3->fetchAll(PDO::FETCH_ASSOC);

        return [
            'week_start'   => $weekStart,
            'week_end'     => $weekEnd,
            'network'      => $this->networkName,
            'weekly'       => $weekly,
            'agents'       => $agentWeekly,
            'top_profiles' => $topProfiles,
        ];
    }

    private function getLowStockData(): array
    {
        // جلب التنبيهات الموجودة في النظام
        $stmt = $this->db->prepare("
            SELECT
                a.id         AS admin_id,
                a.fullname   AS owner_name,
                a.phone      AS owner_phone,
                a.role,
                vm.profile_name,
                COUNT(*)     AS stock_count,
                20           AS threshold
            FROM um_vouchers_meta vm
            JOIN um_admins a ON a.id = vm.owner_admin_id
            JOIN um_admin_network_access na ON na.admin_id=a.id AND na.network_id=vm.network_id AND na.is_active=1
            WHERE vm.network_id=? AND vm.is_sold = 0
              AND vm.is_free_quota = 0
              AND vm.status = 'active'
            GROUP BY a.id, a.fullname, a.phone, a.role, vm.profile_name
            HAVING stock_count <= 20
            ORDER BY stock_count ASC
        ");
        $stmt->execute([$this->networkId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // =========================================================================
    // MESSAGE FORMATTERS
    // =========================================================================

    private function formatDailyMorningMessage(array $d): string
    {
        $sales   = $d['sales'];
        $cards   = $d['cards'];
        $sess    = $d['sessions'];
        $date    = $d['date'];
        $dayName = $d['day_name'];
        $net     = $d['network'];

        $invoiceCount = (int)$sales['invoice_count'];
        $totalSales   = $this->formatMoney((float)$sales['total_sales']);
        $totalPaid    = $this->formatMoney((float)$sales['total_paid']);
        $totalDeferred= $this->formatMoney((float)$sales['total_deferred']);
        $cardsSold    = number_format((int)$sales['cards_sold']);

        $totalCards    = number_format((int)$cards['total_cards']);
        $availCards    = number_format((int)$cards['available_cards']);
        $expiredCards  = number_format((int)$cards['expired_cards']);
        $activeSess    = (int)$sess['active_sessions'];

        $routers = '';
        foreach ($d['routers'] as $r) {
            $routers .= "   • {$r['shortname']} ({$r['nasname']}): ✅\n";
        }
        if (!$routers) $routers = "   • لا توجد راوترات مسجلة\n";

        $agentsLine = '';
        foreach ($d['agents_today'] as $ag) {
            $amt = $this->formatMoney((float)$ag['total_amount']);
            $agentsLine .= "   • {$ag['agent_name']}: {$ag['invoice_count']} فاتورة — {$amt} ر.ي\n";
        }
        if (!$agentsLine) $agentsLine = "   • لا توجد مبيعات اليوم\n";

        $debtLine = '';
        foreach ($d['top_debtors'] as $deb) {
            $bal = $this->formatMoney((float)$deb['balance']);
            $debtLine .= "   • {$deb['fullname']}: {$bal} ر.ي\n";
        }
        if (!$debtLine) $debtLine = "   • لا توجد ديون مستحقة\n";

        return <<<MSG
📊 *التقرير اليومي — {$dayName} {$date}*
🌐 شبكة *{$net}*
━━━━━━━━━━━━━━━━━━━━

💰 *مبيعات اليوم:*
   • عدد الفواتير: {$invoiceCount}
   • الإجمالي: {$totalSales} ر.ي
   • المحصّل: {$totalPaid} ر.ي
   • الآجل: {$totalDeferred} ر.ي
   • الكروت المباعة: {$cardsSold} كرت

🎫 *مخزون الكروت:*
   • الإجمالي: {$totalCards}
   • المتاح: {$availCards}
   • المنتهية: {$expiredCards}

⚡ *الشبكة:*
   • الجلسات المتصلة: {$activeSess}
{$routers}
👥 *نشاط الوكلاء اليوم:*
{$agentsLine}
⚠️ *أعلى الديون:*
{$debtLine}
━━━━━━━━━━━━━━━━━━━━
📅 {$date} | {$this->systemName}
MSG;
    }

    private function formatCashboxMessage(array $d): string
    {
        $c       = $d['cashbox'];
        $dayName = $d['day_name'];
        $date    = $d['date'];
        $net     = $d['network'];

        $cashIn      = $this->formatMoney((float)$c['today_in']);
        $cashOut     = $this->formatMoney((float)$c['today_out']);
        $netToday    = $this->formatMoney((float)$c['today_in'] - (float)$c['today_out']);
        $balance     = $this->formatMoney((float)$c['cashbox_balance']);
        $totalDebt   = $this->formatMoney($d['total_debt']);

        $profileLines = '';
        foreach ($d['top_profiles'] as $p) {
            $rev = $this->formatMoney((float)$p['revenue']);
            $profileLines .= "   • {$p['profile_name']}: {$p['cnt']} كرت — {$rev} ر.ي\n";
        }
        if (!$profileLines) $profileLines = "   • لا توجد مبيعات اليوم\n";

        return <<<MSG
💵 *تقرير الصندوق المسائي — {$dayName} {$date}*
🌐 شبكة *{$net}*
━━━━━━━━━━━━━━━━━━━━

📥 *مقبوضات اليوم:* {$cashIn} ر.ي
📤 *مصروفات اليوم:* {$cashOut} ر.ي
📊 *صافي اليوم:* {$netToday} ر.ي

💰 *رصيد الصندوق الإجمالي:* {$balance} ر.ي
🔴 *إجمالي ديون الوكلاء:* {$totalDebt} ر.ي

🏆 *أكثر الباقات مبيعاً اليوم:*
{$profileLines}
━━━━━━━━━━━━━━━━━━━━
📅 {$date} | {$this->systemName}
MSG;
    }

    private function formatWeeklyMessage(array $d): string
    {
        $w   = $d['weekly'];
        $net = $d['network'];

        $totalSales  = $this->formatMoney((float)$w['total_sales']);
        $totalPaid   = $this->formatMoney((float)$w['total_paid']);
        $cardsSold   = number_format((int)$w['cards_sold']);
        $invoiceCnt  = (int)$w['invoice_count'];

        $agentLines = '';
        $rank = 1;
        foreach ($d['agents'] as $ag) {
            $amt = $this->formatMoney((float)$ag['total_amount']);
            $medal = match($rank) { 1 => '🥇', 2 => '🥈', 3 => '🥉', default => "#{$rank}" };
            $agentLines .= "   {$medal} {$ag['fullname']}: {$ag['invoice_count']} فاتورة — {$amt} ر.ي\n";
            $rank++;
        }
        if (!$agentLines) $agentLines = "   • لا توجد مبيعات هذا الأسبوع\n";

        $profileLines = '';
        foreach ($d['top_profiles'] as $p) {
            $rev = $this->formatMoney((float)$p['revenue']);
            $profileLines .= "   • {$p['profile_name']}: {$p['cnt']} كرت — {$rev} ر.ي\n";
        }
        if (!$profileLines) $profileLines = "   • لا توجد بيانات\n";

        return <<<MSG
📅 *التقرير الأسبوعي*
🗓 {$d['week_start']} إلى {$d['week_end']}
🌐 شبكة *{$net}*
━━━━━━━━━━━━━━━━━━━━

💰 *إجمالي المبيعات:*
   • الفواتير: {$invoiceCnt}
   • الإجمالي: {$totalSales} ر.ي
   • المحصّل: {$totalPaid} ر.ي
   • الكروت: {$cardsSold} كرت

🏆 *ترتيب الوكلاء:*
{$agentLines}
📦 *أكثر الباقات مبيعاً:*
{$profileLines}
━━━━━━━━━━━━━━━━━━━━
📅 {$d['week_end']} | {$this->systemName}
MSG;
    }

    private function formatLowStockAgentMessage(array $alert): string
    {
        $stock = (int)$alert['stock_count'];
        return <<<MSG
⚠️ *تنبيه: كروتك توشك على النفاد!*
━━━━━━━━━━━━━━━━━━━━
📦 الباقة: *{$alert['profile_name']}*
🎫 المتبقي: *{$stock} كرت فقط*
━━━━━━━━━━━━━━━━━━━━
🔔 يرجى التواصل مع الإدارة لتجديد المخزون.
MSG;
    }

    private function formatLowStockOwnerMessage(array $alerts): string
    {
        $lines = '';
        foreach ($alerts as $a) {
            $lines .= "   • {$a['owner_name']} / {$a['profile_name']}: *{$a['stock_count']} كرت*\n";
        }

        $count = count($alerts);
        return <<<MSG
🔴 *تنبيه نفاد الكروت — {$count} تحذير*
━━━━━━━━━━━━━━━━━━━━
المستودعات التي وصلت للحد الأدنى:
{$lines}
━━━━━━━━━━━━━━━━━━━━
⚡ يرجى إعادة تعبئة المخزون فوراً!
MSG;
    }

    // =========================================================================
    // SEND HELPERS
    // =========================================================================

    /**
     * إرسال رسالة لجميع superadmins الذين لديهم رقم هاتف
     */
    private function sendToAllSuperAdmins(string $message, string $eventType): array
    {
        $stmt = $this->db->prepare(" 
            SELECT DISTINCT a.id,a.fullname,a.phone
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            LEFT JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            WHERE (r.role_key IN ('system_owner','superadmin')
                OR EXISTS (SELECT 1 FROM um_system_owners so WHERE so.admin_id=a.id))
              AND a.is_active=1 AND a.phone IS NOT NULL AND a.phone!=''
        ");
        $stmt->execute([$this->networkId]);
        $admins  = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $whatsappEnabled = $this->wa->isEnabled();
        $whatsapp = ['enabled' => $whatsappEnabled, 'sent_count' => 0, 'failed_count' => 0, 'results' => []];
        if ($whatsappEnabled) {
            foreach ($admins as $admin) {
                $reference = $eventType . ':' . $this->networkId . ':' . date('Ymd') . ':' . (int)$admin['id'];
                $success = $this->sendWhatsApp($admin['phone'], $message, $eventType, (int)$admin['id'], $reference);
                $whatsapp['sent_count'] += $success ? 1 : 0;
                $whatsapp['failed_count'] += $success ? 0 : 1;
                $whatsapp['results'][] = ['admin_id' => (int)$admin['id'], 'success' => $success];
            }
        }

        $telegramSettings = $this->telegram->getSettings();
        $telegram = !empty($telegramSettings['enabled'])
            ? $this->telegram->sendMessage(
                $this->toTelegramHtml($message),
                null,
                'HTML',
                $eventType,
                $eventType . ':' . $this->networkId . ':' . date('Ymd'),
                1
            )
            : ['success' => false, 'skipped' => true, 'network_id' => $this->networkId, 'error' => 'TELEGRAM_DISABLED_FOR_NETWORK'];

        $sentCount = (int)$whatsapp['sent_count'] + (!empty($telegram['success']) ? 1 : 0);
        return [
            'network_id' => $this->networkId,
            'success' => $sentCount > 0,
            'whatsapp' => $whatsapp,
            'telegram' => $telegram,
            'sent_count' => $sentCount,
        ];
    }

    /**
     * إرسال رسالة واتساب وتسجيلها في um_notification_logs
     * WhatsAppService::sendMessage() يُعيد ['success'=>bool, ...]
     */
    private function sendWhatsApp(string $phone, string $message, string $eventType, ?int $adminId = null, ?string $referenceId = null): bool
    {
        $result = $this->wa->sendMessage($phone, $message, $referenceId, $adminId, $eventType);
        return is_array($result) && !empty($result['success']);
    }

    private function toTelegramHtml(string $message): string
    {
        $escaped = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $formatted = preg_replace('/\*(.+?)\*/us', '<b>$1</b>', $escaped) ?? $escaped;
        if (mb_strlen($formatted, 'UTF-8') > 3800) $formatted = mb_substr($formatted, 0, 3780, 'UTF-8') . "\n…";
        return $formatted;
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    private function getSetting(string $key, string $default = ''): string
    {
        $stmt = $this->db->prepare("SELECT setting_value FROM um_settings WHERE setting_key = ? LIMIT 1");
        $stmt->execute([$key]);
        return (string)($stmt->fetchColumn() ?: $default);
    }

    private function formatMoney(float $amount): string
    {
        return number_format($amount, 0, '.', ',');
    }

    private function arabicDayName(string $iso): string
    {
        return match((int)$iso) {
            1 => 'الاثنين',
            2 => 'الثلاثاء',
            3 => 'الأربعاء',
            4 => 'الخميس',
            5 => 'الجمعة',
            6 => 'السبت',
            7 => 'الأحد',
            default => '',
        };
    }
}
