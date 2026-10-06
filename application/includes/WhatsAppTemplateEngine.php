<?php
declare(strict_types=1);

class WhatsAppTemplateEngine {
    private PDO $db;
    private int $networkId = 1;

    public function __construct(PDO $db, int $networkId = 0) {
        $this->db = $db;
        if ($networkId <= 0) {
            try { $networkId = (int)$db->query('SELECT COALESCE(@sam_active_network_id,0)')->fetchColumn(); } catch (Throwable $e) {}
        }
        if ($networkId <= 0 && session_status() === PHP_SESSION_ACTIVE) $networkId = (int)($_SESSION['active_network_id'] ?? 0);
        $this->networkId = $networkId > 0 ? $networkId : 1;
    }

    /**
     * Render message text for a template code using key-value data replacements
     */
    public function render(string $templateCode, array $data): array {
        $stmt = $this->db->prepare("SELECT * FROM um_whatsapp_templates WHERE network_id = ? AND template_code = ? AND is_active = 1 LIMIT 1");
        $stmt->execute([$this->networkId, $templateCode]);
        $tmpl = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tmpl) {
            return [
                'success' => false,
                'message' => '',
                'requires_approval' => false
            ];
        }

        // Auto-fill fallback system name
        if (!isset($data['system_name'])) {
            $data['system_name'] = defined('APP_NAME') ? APP_NAME : 'شبكة سام اللاسلكية';
        }

        // Smart Beneficiary & Recipient Alias Resolution
        $primaryName = $data['beneficiary_name'] ?? $data['beneficiary'] ?? $data['name'] ?? $data['buyer_name'] ?? $data['target_name'] ?? $data['fullname'] ?? $data['recipient_name'] ?? 'المستفيد';
        
        $aliasMap = [
            'beneficiary' => $primaryName,
            'beneficiary_name' => $primaryName,
            'recipient_name' => $primaryName,
            'target_name' => $primaryName,
            'name' => $primaryName,
            'buyer_name' => $primaryName,
            'fullname' => $primaryName
        ];

        foreach ($aliasMap as $aliasKey => $aliasVal) {
            if (!isset($data[$aliasKey])) {
                $data[$aliasKey] = $aliasVal;
            }
        }

        $text = $tmpl['template_text'];

        foreach ($data as $key => $val) {
            $placeholder = '{' . $key . '}';
            $text = str_replace($placeholder, (string)$val, $text);
        }

        return [
            'success' => true,
            'message' => $text,
            'requires_approval' => (bool)$tmpl['requires_approval'],
            'department' => $tmpl['department'],
            'recipient_type' => $tmpl['recipient_type']
        ];
    }

    /**
     * Save/Update a template text and approval status
     */
    public function saveTemplate(string $templateCode, string $newText, bool $requiresApproval, bool $isActive = true): bool {
        $stmt = $this->db->prepare("
            UPDATE um_whatsapp_templates 
            SET template_text = ?, requires_approval = ?, is_active = ? 
            WHERE network_id = ? AND template_code = ?
        ");
        return $stmt->execute([$newText, $requiresApproval ? 1 : 0, $isActive ? 1 : 0, $this->networkId, $templateCode]);
    }

    /**
     * Get all available templates for management UI
     */
    public function getAllTemplates(): array {
        $stmt = $this->db->query("SELECT * FROM um_whatsapp_templates WHERE network_id = ? ORDER BY department ASC, id ASC");
        $stmt->execute([$this->networkId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
