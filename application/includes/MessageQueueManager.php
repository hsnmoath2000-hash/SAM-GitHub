<?php
declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';

final class NotificationSettingsGuard
{
    private PDO $db;

    public function __construct(PDO $db) { $this->db = $db; }

    public function isEnabled(string $department, string $eventType, int $networkId = 0): bool
    {
        if ($networkId <= 0) return false;
        $networkField = [
            'sales' => 'notify_sales', 'receipt' => 'notify_receipts', 'payment' => 'notify_finance',
            'transfer' => 'notify_transfers', 'inventory' => 'notify_inventory', 'router' => 'notify_routers',
            'finance' => 'notify_finance', 'system' => 'notify_finance'
        ][strtolower($department)] ?? null;
        $sql = 'SELECT s.whatsapp_enabled,c.is_enabled' . ($networkField ? ',s.' . $networkField : '') . '
            FROM um_network_notification_settings s
            JOIN um_network_channels c ON c.network_id=s.network_id AND c.channel_type=\'whatsapp\'
            WHERE s.network_id=? LIMIT 1';
        $network = $this->db->prepare($sql);
        $network->execute([$networkId]);
        $row = $network->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['whatsapp_enabled'] !== 1 || (int)$row['is_enabled'] !== 1) return false;
        return !$networkField || (int)$row[$networkField] === 1;
    }
}

final class MessageQueueManager
{
    private PDO $db;
    private NotificationSettingsGuard $guard;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->guard = new NotificationSettingsGuard($db);
    }

    private function networkId(int $networkId = 0): int
    {
        $contextNetworkId = 0;
        try { $contextNetworkId = (int)$this->db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn(); } catch (Throwable $e) {}
        if ($contextNetworkId <= 0 && session_status() === PHP_SESSION_ACTIVE) $contextNetworkId = (int)($_SESSION['active_network_id'] ?? 0);
        if ($networkId <= 0) $networkId = $contextNetworkId;
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        if ($contextNetworkId > 0 && $contextNetworkId !== $networkId) throw new DomainException('FORBIDDEN_NETWORK');
        return (new NetworkChannelService($this->db))->normalizeNetworkId($networkId);
    }

    public function enqueue(
        string $department,
        string $eventType,
        string $phone,
        string $name,
        string $messageText,
        ?string $refId = null,
        bool $requiresApproval = false,
        ?string $scheduledAt = null,
        int $networkId = 0
    ): bool {
        $networkId = $this->networkId($networkId);
        if (!$this->guard->isEnabled($department, $eventType, $networkId)) return false;

        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        $scheduledAt = $scheduledAt ?? date('Y-m-d H:i:s');
        // Approval requirements must not be bypassed by a system-global
        // switch shared with other networks.
        $status = $requiresApproval ? 'pending' : 'approved';

        $stmt = $this->db->prepare("INSERT INTO um_notification_queue
            (network_id,department,event_type,recipient_phone,recipient_name,message_text,status,requires_approval,reference_id,scheduled_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)");
        $ok = $stmt->execute([$networkId,$department,$eventType,$cleanPhone,$name,$messageText,$status,$requiresApproval ? 1 : 0,$refId,$scheduledAt]);

        if ($ok && $status === 'approved') {
            try {
                if (class_exists('WhatsAppService')) $this->dispatchApprovedQueue(new WhatsAppService($this->db, null, $networkId), 10, $networkId);
            } catch (Throwable $e) {}
        }
        return $ok;
    }

    public function approveMessage(int $queueId): bool
    {
        $stmt = $this->db->prepare("UPDATE um_notification_queue SET status='approved' WHERE network_id=? AND id=? AND status='pending'");
        return $stmt->execute([$this->networkId(),$queueId]);
    }

    public function approveAllPending(): int
    {
        $stmt = $this->db->prepare("UPDATE um_notification_queue SET status='approved' WHERE network_id=? AND status='pending'");
        $stmt->execute([$this->networkId()]);
        return $stmt->rowCount();
    }

    public function updateAndApprove(int $queueId, string $newText): bool
    {
        $stmt = $this->db->prepare("UPDATE um_notification_queue SET message_text=?,status='approved' WHERE network_id=? AND id=?");
        return $stmt->execute([$newText,$this->networkId(),$queueId]);
    }

    public function cancelMessage(int $queueId): bool
    {
        $stmt = $this->db->prepare("UPDATE um_notification_queue SET status='cancelled' WHERE network_id=? AND id=?");
        return $stmt->execute([$this->networkId(),$queueId]);
    }

    public function retryMessage(int $queueId): bool
    {
        $stmt = $this->db->prepare("UPDATE um_notification_queue SET status='approved',error_message=NULL WHERE network_id=? AND id=?");
        return $stmt->execute([$this->networkId(),$queueId]);
    }

    public function dispatchApprovedQueue(WhatsAppService $apiService, int $limit = 50, ?int $networkFilter = null): int
    {
        $limit = max(1, min(500, $limit));
        $sql = "SELECT * FROM um_notification_queue WHERE status='approved' AND scheduled_at<=NOW()";
        if ($networkFilter !== null && $networkFilter > 0) $sql .= ' AND network_id=?';
        $sql .= ' ORDER BY id ASC LIMIT ?';
        $stmt = $this->db->prepare($sql);
        if ($networkFilter !== null && $networkFilter > 0) {
            $stmt->bindValue(1, $networkFilter, PDO::PARAM_INT);
            $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        }
        $stmt->execute();
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $sentCount = 0;

        foreach ($messages as $message) {
            $networkId = (int)($message['network_id'] ?? 0);
            try {
                $service = class_exists('WhatsAppService')
                    ? new WhatsAppService($this->db, null, $networkId)
                    : $apiService;
                $sent = $service->sendDirectMessage($message['recipient_phone'], $message['message_text']);
            } catch (Throwable $e) {
                $sent = ['success' => false, 'error' => $e->getMessage()];
            }

            if (!empty($sent['success'])) {
                $update = $this->db->prepare("UPDATE um_notification_queue SET status='sent',sent_at=NOW() WHERE network_id=? AND id=?");
                $update->execute([$networkId,$message['id']]);
                $sentCount++;
            } else {
                $update = $this->db->prepare("UPDATE um_notification_queue SET status='failed',error_message=? WHERE network_id=? AND id=?");
                $update->execute([$sent['error'] ?? 'API Error',$networkId,$message['id']]);
            }
        }
        return $sentCount;
    }
}
