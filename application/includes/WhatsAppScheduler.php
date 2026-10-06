<?php
declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';

/**
 * Queue-based finance reminders. Every query, recipient and queued message is
 * bound to the same validated active network.
 */
final class WhatsAppScheduler
{
    private PDO $db;
    private MessageQueueManager $queueManager;
    private int $networkId;
    private string $networkName;

    public function __construct(PDO $db, MessageQueueManager $queueManager, int $networkId = 0)
    {
        $this->db = $db;
        $this->queueManager = $queueManager;
        $this->networkId = (new NetworkChannelService($db))->normalizeNetworkId($networkId);
        $db->exec('SET @sam_active_network_id=' . $this->networkId);
        $stmt = $db->prepare('SELECT name FROM um_networks WHERE id=? AND status=\'active\' LIMIT 1');
        $stmt->execute([$this->networkId]);
        $this->networkName = (string)($stmt->fetchColumn() ?: ('Network ' . $this->networkId));
    }

    public function checkImpendingSubscriptions(): void
    {
        $stmt = $this->db->prepare("SELECT re.id,re.title,re.amount,re.next_due_date,re.beneficiary_phone,re.beneficiary_name
            FROM um_recurring_expenses re
            WHERE re.network_id=? AND re.is_active=1
              AND re.next_due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 48 HOUR)
              AND (re.last_notified_date IS NULL OR re.last_notified_date<CURDATE())");
        $stmt->execute([$this->networkId]);
        $dueItems = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $adminPhones = $this->getAdminPhones();

        foreach ($dueItems as $item) {
            $formattedAmount = number_format((float)$item['amount'], 2);
            if (!empty($item['beneficiary_phone'])) {
                $clientMsg = 'عزيزي ' . ($item['beneficiary_name'] ?: 'المشترك')
                    . '، نذكّركم بأن الالتزام الدوري (' . $item['title'] . ') يستحق بتاريخ '
                    . $item['next_due_date'] . '. المبلغ: ' . $formattedAmount . ' ريال.';
                $this->queueManager->enqueue('finance', 'subscription_renewal_notice', $item['beneficiary_phone'],
                    $item['beneficiary_name'] ?: 'مشترك', $clientMsg, (string)$item['id'], false);
            }

            $adminMsg = "⚠️ تنبيه استحقاق مالي خلال 48 ساعة\n"
                . '🌐 الشبكة: ' . $this->networkName . "\n"
                . '📌 الالتزام: ' . $item['title'] . "\n"
                . '💰 المبلغ: ' . $formattedAmount . " ر.ي\n"
                . '📅 تاريخ الاستحقاق: ' . $item['next_due_date'];
            foreach ($adminPhones as $admin) {
                $this->queueManager->enqueue('finance', 'impending_obligation_admin_alert', $admin['phone'],
                    $admin['fullname'] ?: 'إدارة الشبكة', $adminMsg, (string)$item['id'], false);
            }

            $update = $this->db->prepare('UPDATE um_recurring_expenses SET last_notified_date=CURDATE() WHERE network_id=? AND id=?');
            $update->execute([$this->networkId, $item['id']]);
        }
    }

    public function sendDueReports(string $period = 'daily'): void
    {
        $isWeekly = strtolower($period) === 'weekly';
        $dateStart = $isWeekly ? date('Y-m-d', strtotime('monday this week')) : date('Y-m-d');
        $dateEnd = date('Y-m-d');

        $salesStmt = $this->db->prepare("SELECT COALESCE(SUM(total_amount),0) AS total_sales,COUNT(*) AS invoice_count
            FROM um_sales_invoices
            WHERE network_id=? AND DATE(created_at) BETWEEN ? AND ? AND invoice_status<>'refunded'");
        $salesStmt->execute([$this->networkId, $dateStart, $dateEnd]);
        $sales = $salesStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_sales' => 0, 'invoice_count' => 0];

        $cashStmt = $this->db->prepare("SELECT balance FROM um_chart_of_accounts
            WHERE network_id=? AND account_code='1101' LIMIT 1");
        $cashStmt->execute([$this->networkId]);
        $cashBalance = (float)($cashStmt->fetchColumn() ?: 0);

        $cardsStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta
            WHERE network_id=? AND status='active' AND is_sold=0 AND is_free_quota=0");
        $cardsStmt->execute([$this->networkId]);
        $availableCards = (int)$cardsStmt->fetchColumn();

        $assetsStmt = $this->db->prepare("SELECT COUNT(*) FROM um_assets
            WHERE network_id=? AND (status='in_service' OR status IS NULL)");
        $assetsStmt->execute([$this->networkId]);
        $activeAssets = (int)$assetsStmt->fetchColumn();

        $periodTitle = $isWeekly ? 'الأسبوعي' : 'اليومي';
        $salesLabel = $isWeekly ? 'مبيعات الفترة' : 'مبيعات اليوم';
        $msg = "📊 التقرير {$periodTitle} لشبكة {$this->networkName}\n"
            . 'تاريخ التوليد: ' . date('Y-m-d H:i') . "\n"
            . $salesLabel . ': ' . number_format((float)$sales['total_sales'], 2) . ' ر.ي (' . (int)$sales['invoice_count'] . " فاتورة)\n"
            . 'رصيد الصندوق: ' . number_format($cashBalance, 2) . " ر.ي\n"
            . 'الكروت المتوفرة: ' . number_format($availableCards) . " كرت\n"
            . 'الأصول النشطة: ' . number_format($activeAssets) . ' جهاز';

        foreach ($this->getAdminPhones() as $admin) {
            $this->queueManager->enqueue('system', 'executive_summary_report', $admin['phone'],
                $admin['fullname'] ?: 'إدارة الشبكة', $msg,
                'REP-' . $this->networkId . '-' . date('YmdHis'), false);
        }
    }

    /** @return array<int,array{fullname:string,phone:string}> */
    private function getAdminPhones(): array
    {
        $stmt = $this->db->prepare("SELECT DISTINCT a.fullname,a.phone
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            WHERE r.role_key IN ('system_owner','superadmin','admin','finance','accountant')
              AND a.is_active=1 AND a.phone IS NOT NULL AND a.phone<>''");
        $stmt->execute([$this->networkId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}
