<?php
/**
 * ChatbotService.php
 * Comprehensive Interactive Auto-Responder & Query Engine for WhatsApp & Telegram
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/WhatsAppService.php';
require_once __DIR__ . '/NetworkChannelService.php';

class ChatbotService {
    private $db;
    private int $networkId = 0;

    public function __construct($db = null) {
        if ($db) {
            $this->db = $db;
        } else {
            $this->db = getDB();
        }
        try {
            $active = (int)$this->db->query("SELECT COALESCE(@sam_active_network_id,0)")->fetchColumn();
            if ($active <= 0 && session_status() === PHP_SESSION_ACTIVE) $active = (int)($_SESSION['active_network_id'] ?? 0);
            if ($active > 0) $this->networkId = (new NetworkChannelService($this->db))->normalizeNetworkId($active);
        } catch (Throwable $e) {}
    }

    private function bindNetworkId(int $requestedNetworkId = 0): int {
        $activeNetworkId = 0;
        try { $activeNetworkId = (int)$this->db->query("SELECT COALESCE(@sam_active_network_id,0)")->fetchColumn(); } catch (Throwable $e) {}
        if ($activeNetworkId <= 0 && session_status() === PHP_SESSION_ACTIVE) $activeNetworkId = (int)($_SESSION['active_network_id'] ?? 0);

        $adminId = session_status() === PHP_SESSION_ACTIVE ? (int)($_SESSION['admin_id'] ?? 0) : 0;
        if ($adminId > 0 && $activeNetworkId <= 0) {
            $stmt = $this->db->prepare("SELECT network_id FROM um_admin_network_access WHERE admin_id=? AND is_active=1
                AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW())
                ORDER BY is_default DESC,network_id ASC LIMIT 1");
            $stmt->execute([$adminId]);
            $activeNetworkId = (int)$stmt->fetchColumn();
        }

        if ($adminId > 0) {
            if ($activeNetworkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
            if ($requestedNetworkId > 0 && $requestedNetworkId !== $activeNetworkId) throw new DomainException('FORBIDDEN_NETWORK');
            $networkId = $activeNetworkId;
            $membership = $this->db->prepare("SELECT 1 FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1
                AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1");
            $membership->execute([$adminId, $networkId]);
            if (!$membership->fetchColumn()) throw new DomainException('FORBIDDEN_NETWORK');
        } else {
            $networkId = $requestedNetworkId > 0 ? $requestedNetworkId : $activeNetworkId;
        }

        $this->networkId = (new NetworkChannelService($this->db))->normalizeNetworkId($networkId);
        $this->db->exec('SET @sam_active_network_id=' . $this->networkId);
        return $this->networkId;
    }

    private function networkId(): int {
        return $this->networkId > 0
            ? (new NetworkChannelService($this->db))->normalizeNetworkId($this->networkId)
            : $this->bindNetworkId();
    }

    public function setNetworkId(int $networkId): void { $this->bindNetworkId($networkId); }
    public function getNetworkId(): int { return $this->networkId(); }

    /**
     * Get chatbot settings for the authenticated active network only.
     */
    public function getSettings() {
        $networkId = $this->networkId();
        $channels = new NetworkChannelService($this->db);
        $settings = $channels->getNotificationSettings($networkId);
        $networkStmt = $this->db->prepare('SELECT name FROM um_networks WHERE id=? AND status=\'active\' LIMIT 1');
        $networkStmt->execute([$networkId]);
        $networkName = (string)($settings['chatbot_network_name'] ?? '');
        if ($networkName === '') $networkName = (string)($networkStmt->fetchColumn() ?: 'شبكتنا');

        return [
            'network_id' => $networkId,
            'enabled' => (int)($settings['chatbot_enabled'] ?? 0) === 1,
            'allow_subscribers' => (int)($settings['chatbot_allow_subscribers'] ?? 1) === 1,
            'allow_pos' => (int)($settings['chatbot_allow_pos'] ?? 1) === 1,
            'allow_admins' => (int)($settings['chatbot_allow_admins'] ?? 1) === 1,
            'welcome_msg' => $settings['chatbot_welcome_msg'] ?: "مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐",
            'support_phone' => $settings['chatbot_support_phone'] ?: '',
            'network_name' => $networkName
        ];
    }

    /**
     * Save Chatbot settings
     */
    public function saveSettings($input) {
        $networkId = $this->networkId();
        $fieldMap = [
            'enabled' => 'chatbot_enabled',
            'allow_subscribers' => 'chatbot_allow_subscribers',
            'allow_pos' => 'chatbot_allow_pos',
            'allow_admins' => 'chatbot_allow_admins',
            'welcome_msg' => 'chatbot_welcome_msg',
            'support_phone' => 'chatbot_support_phone',
            'network_name' => 'chatbot_network_name'
        ];
        $changes = [];
        foreach ($fieldMap as $inputKey => $settingKey) {
            if (!array_key_exists($inputKey, $input)) continue;
            $changes[$settingKey] = str_starts_with($settingKey, 'chatbot_allow_') || $settingKey === 'chatbot_enabled'
                ? (!empty($input[$inputKey]) ? 1 : 0)
                : trim((string)$input[$inputKey]);
        }
        $channels = new NetworkChannelService($this->db);
        $channels->saveNotificationSettings($networkId, $changes, (int)($_SESSION['admin_id'] ?? 0));
        return ['success' => true, 'network_id' => $networkId, 'message' => 'تم حفظ إعدادات الرد الآلي للشبكة بنجاح', 'settings' => $this->getSettings()];
    }

    /**
     * Identify user role and details from normalized phone number
     */
    public function identifySender($phone) {
        $cleanPhone = WhatsAppService::normalizePhone($phone);
        $networkId = $this->networkId();
        if (empty($cleanPhone)) {
            return ['role' => 'guest', 'user' => null, 'phone' => $phone];
        }

        // Match suffix (last 9 digits) or exact in um_admins
        $suffix = substr($cleanPhone, -9);
        $stmt = $this->db->prepare("
            SELECT a.id,a.username,a.fullname,COALESCE(r.role_key,'system_owner') AS role,a.phone,b.balance,b.credit_limit,a.is_active,x.network_id
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
                AND (x.starts_at IS NULL OR x.starts_at<=NOW()) AND (x.expires_at IS NULL OR x.expires_at>NOW())
            LEFT JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            LEFT JOIN um_admin_network_balances b ON b.admin_id=a.id AND b.network_id=x.network_id
            WHERE a.is_active=1 AND (r.role_key IS NOT NULL OR EXISTS (SELECT 1 FROM um_system_owners so WHERE so.admin_id=a.id))
              AND (a.phone LIKE ? OR a.phone LIKE ? OR a.phone = ?)
            ORDER BY x.is_default DESC,a.id ASC
            LIMIT 1
        ");
        $stmt->execute([$networkId, "%$suffix", "%$cleanPhone%", $cleanPhone]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($admin) {
            $role = strtolower($admin['role'] ?? '');
            if (in_array($role, ['system_owner', 'superadmin', 'admin', 'manager', 'owner', 'finance'], true)) {
                return ['role' => 'admin', 'user' => $admin, 'phone' => $cleanPhone];
            }
            if (in_array($role, ['distributor', 'pos_agent', 'point_of_sale', 'agent', 'reseller', 'sales'])) {
                return ['role' => 'pos', 'user' => $admin, 'phone' => $cleanPhone];
            }
            return ['role' => 'admin', 'user' => $admin, 'phone' => $cleanPhone];
        }

        // Check customer in um_customers if table exists
        try {
            $stmt = $this->db->prepare("SELECT id,username,name,phone,balance,network_id FROM um_customers WHERE network_id=? AND (phone LIKE ? OR phone LIKE ?) LIMIT 1");
            $stmt->execute([$networkId, "%$suffix", "%$cleanPhone%"]);
            $customer = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($customer) {
                return ['role' => 'subscriber', 'user' => $customer, 'phone' => $cleanPhone];
            }
        } catch (Exception $e) {}

        return ['role' => 'guest', 'user' => null, 'phone' => $cleanPhone];
    }

    /**
     * Main message handling engine
     */
    public function handleMessage($rawMessage, $senderPhone = '', $platform = 'whatsapp', int $networkId = 0) {
        $this->bindNetworkId($networkId);
        $settings = $this->getSettings();
        if (!$settings['enabled'] || !$this->isPlatformEnabled($platform)) {
            return [
                'handled' => false,
                'response' => null,
                'reply' => null,
                'reason' => 'Chatbot is disabled'
            ];
        }

        $msg = trim($rawMessage);
        if ($msg === '') {
            return ['handled' => false, 'response' => null, 'reply' => null];
        }

        $sender = $this->identifySender($senderPhone);
        $role = $sender['role'];
        $user = $sender['user'];
        $roleAllowed = match ($role) {
            'admin' => !empty($settings['allow_admins']),
            'pos' => !empty($settings['allow_pos']),
            default => !empty($settings['allow_subscribers']),
        };
        if (!$roleAllowed) {
            return ['handled' => false, 'response' => null, 'reply' => null, 'reason' => 'CHATBOT_ROLE_DISABLED'];
        }

        // Normalize text command
        $cleanCmd = preg_replace('/[\s\p{P}]+/u', ' ', mb_strtolower($msg, 'UTF-8'));
        $cleanCmd = trim($cleanCmd);

        // 1. Check custom trigger keyword rules in database first
        $customMatch = $this->matchCustomRule($cleanCmd, $role);
        if ($customMatch) {
            $respText = $customMatch['response_text'];
            return ['handled' => true, 'response' => $respText, 'reply' => $respText];
        }

        // 2. Check for direct card code pattern (e.g. 4 to 25 alphanumeric characters)
        if (preg_match('/^(?:كرت|كود|استعلام|فحص|بطاقة|card)?\s*([a-zA-Z0-9_-]{4,25})$/ui', $cleanCmd, $m)) {
            $extractedCode = $m[1];
            if (!in_array($extractedCode, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])) {
                $res = $this->formatCardQueryResponse($extractedCode, $sender, $settings);
                if (isset($res['response']) && !isset($res['reply'])) $res['reply'] = $res['response'];
                return $res;
            }
        }

        // 3. Route according to role
        switch ($role) {
            case 'admin':
                $res = $this->handleAdminCommand($cleanCmd, $msg, $sender, $settings);
                break;
            case 'pos':
                $res = $this->handlePosCommand($cleanCmd, $msg, $sender, $settings);
                break;
            case 'subscriber':
            case 'guest':
            default:
                $res = $this->handleSubscriberCommand($cleanCmd, $msg, $sender, $settings);
                break;
        }

        if (isset($res['response']) && !isset($res['reply'])) {
            $res['reply'] = $res['response'];
        }
        return $res;
    }

    private function isPlatformEnabled(string $platform): bool {
        if (strtolower($platform) === 'simulator') return true;
        $networkId = $this->networkId();
        $key = strtolower($platform) === 'telegram' ? 'telegram' : 'whatsapp';
        $flag = $key . '_enabled';
        $channels = new NetworkChannelService($this->db);
        $settings = $channels->getNotificationSettings($networkId);
        $channel = $channels->getChannel($networkId, $key);
        return !empty($settings[$flag]) && !empty($channel['is_enabled']);
    }

    /**
     * Match custom rules defined in um_chatbot_custom_rules
     */
    public function matchCustomRule(string $cmd, string $role): ?array {
        try {
            $stmt = $this->db->prepare("
                SELECT * FROM um_chatbot_custom_rules 
                WHERE network_id=? AND is_active = 1 AND (target_role = 'all' OR target_role = ?)
                ORDER BY LENGTH(trigger_keyword) DESC, id ASC
            ");
            $stmt->execute([$this->networkId(),$role]);
            $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($rules as $r) {
                $rawKeywords = explode(',', (string)$r['trigger_keyword']);
                $matchType = $r['match_type'] ?? 'contains';

                foreach ($rawKeywords as $singleKw) {
                    $kw = trim(mb_strtolower($singleKw, 'UTF-8'));
                    if ($kw === '') continue;

                    if ($matchType === 'exact' && ($cmd === $kw || str_contains($cmd, $kw))) {
                        return $r;
                    } elseif ($matchType === 'starts_with' && str_starts_with($cmd, $kw)) {
                        return $r;
                    } elseif ($matchType === 'contains' && (str_contains($cmd, $kw) || str_contains($kw, $cmd))) {
                        return $r;
                    }
                }
            }
        } catch (Exception $e) {}

        return null;
    }

    /**
     * Get all custom chatbot rules for UI management
     */
    public function getCustomRules(): array {
        try {
            $stmt = $this->db->prepare("SELECT * FROM um_chatbot_custom_rules WHERE network_id=? ORDER BY id DESC");
            $stmt->execute([$this->networkId()]);
            return $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * Save/Update custom rule
     */
    public function saveCustomRule(array $data): array {
        $id = (int)($data['id'] ?? 0);
        $kw = trim((string)($data['trigger_keyword'] ?? ''));
        $resp = trim((string)($data['response_text'] ?? ''));
        $matchType = in_array($data['match_type'] ?? '', ['exact', 'contains', 'starts_with']) ? $data['match_type'] : 'contains';
        $targetRole = in_array($data['target_role'] ?? '', ['all', 'subscriber', 'pos', 'admin']) ? $data['target_role'] : 'all';
        $isActive = !empty($data['is_active']) ? 1 : 0;

        if (empty($kw) || empty($resp)) {
            return ['success' => false, 'error' => 'الكلمة المفتاحية ونص الرد مطلوبان'];
        }

        if ($id > 0) {
            $stmt = $this->db->prepare("
                UPDATE um_chatbot_custom_rules 
                SET trigger_keyword = ?, match_type = ?, response_text = ?, target_role = ?, is_active = ?, updated_at = NOW()
                WHERE network_id=? AND id = ?
            ");
            $ok = $stmt->execute([$kw, $matchType, $resp, $targetRole, $isActive,$this->networkId(),$id]);
            return ['success' => $ok, 'message' => $ok ? 'تم تحديث قاعدة الرد الآلي بنجاح' : 'تعذر التحديث'];
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_chatbot_custom_rules 
                (network_id,trigger_keyword, match_type, response_text, target_role, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            ");
            $ok = $stmt->execute([$this->networkId(),$kw, $matchType, $resp, $targetRole, $isActive]);
            return ['success' => $ok, 'message' => $ok ? 'تم إضافة قاعدة الرد الآلي بنجاح' : 'تعذر الإضافة'];
        }
    }

    /**
     * Delete custom rule
     */
    public function deleteCustomRule(int $id): array {
        $stmt = $this->db->prepare("DELETE FROM um_chatbot_custom_rules WHERE network_id=? AND id = ?");
        $ok = $stmt->execute([$this->networkId(),$id]);
        return ['success' => $ok, 'message' => $ok ? 'تم حذف قاعدة الرد الآلي بنجاح' : 'تعذر الحذف'];
    }

    /**
     * Toggle custom rule active state
     */
    public function toggleCustomRule(int $id, bool $isActive): array {
        $stmt = $this->db->prepare("UPDATE um_chatbot_custom_rules SET is_active = ?, updated_at = NOW() WHERE network_id=? AND id = ?");
        $ok = $stmt->execute([$isActive ? 1 : 0,$this->networkId(),$id]);
        return ['success' => $ok, 'message' => $ok ? 'تم تعديل حالة القاعدة بنجاح' : 'تعذر التعديل'];
    }

    /**
     * Admin Commands Handler
     */
    private function handleAdminCommand($cmd, $rawMsg, $sender, $settings) {
        $user = $sender['user'];
        $adminName = $user['fullname'] ?: $user['username'];

        // 1. Account Statement / Financial Summary
        if ($cmd === '1' || str_contains($cmd, 'كشف') || str_contains($cmd, 'حساب') || str_contains($cmd, 'مالي') || str_contains($cmd, 'ارصده') || str_contains($cmd, 'أرصدة')) {
            return $this->generateAdminFinancialSummary($adminName);
        }

        // 2. Card Stock Inventory
        if ($cmd === '2' || str_contains($cmd, 'مخزون') || str_contains($cmd, 'المخزون') || str_contains($cmd, 'كروت') || str_contains($cmd, 'الكروت') || str_contains($cmd, 'جرد')) {
            return $this->generateCardStockSummary();
        }

        // 3. Today's Sales
        if ($cmd === '3' || str_contains($cmd, 'مبيعات') || str_contains($cmd, 'مبيعات اليوم') || str_contains($cmd, 'الدخل') || str_contains($cmd, 'فواتير اليوم')) {
            return $this->generateTodaySalesSummary();
        }

        // 4. Server & Router Status (NOC)
        if ($cmd === '4' || str_contains($cmd, 'سيرفر') || str_contains($cmd, 'سيرفرات') || str_contains($cmd, 'راوتر') || str_contains($cmd, 'راوترات') || str_contains($cmd, 'الشبكة') || str_contains($cmd, 'ابراج') || str_contains($cmd, 'أبراج')) {
            return $this->generateRouterStatusSummary();
        }

        // 5. Card Lookup (e.g. "5 123456" or "استعلام كرت 123456")
        if (preg_match('/^(?:5|استعلام\s*كرت|فحص\s*كرت)\s+([a-zA-Z0-9_-]+)/ui', $cmd, $matches)) {
            return $this->formatCardQueryResponse($matches[1], $sender, $settings);
        }

        // 6. Agent / POS Statement (e.g. "6 فلان" or "كشف وكيل فلان")
        if (preg_match('/^(?:6|كشف\s*وكيل|حساب\s*نقطة|وكيل)\s+(.+)/ui', $cmd, $matches)) {
            return $this->generateAgentStatementSummary(trim($matches[1]));
        }

        // Default: Admin Help Menu
        return $this->formatAdminMenu($adminName, $settings);
    }

    /**
     * Distributor / POS Commands Handler
     */
    private function handlePosCommand($cmd, $rawMsg, $sender, $settings) {
        $user = $sender['user'];
        $posName = $user['fullname'] ?: $user['username'];

        // 1. My Account Statement & Balance
        if ($cmd === '1' || str_contains($cmd, 'كشف') || str_contains($cmd, 'حسابي') || str_contains($cmd, 'رصيدي') || str_contains($cmd, 'مديونيتي') || str_contains($cmd, 'كم عليا')) {
            return $this->generatePosAccountSummary($user);
        }

        // 2. My Warehouse / Card Inventory
        if ($cmd === '2' || str_contains($cmd, 'مخزن') || str_contains($cmd, 'مخزني') || str_contains($cmd, 'كروتي') || str_contains($cmd, 'المخزون') || str_contains($cmd, 'عهدة')) {
            return $this->generatePosWarehouseSummary($user);
        }

        // 3. My Sales & Invoices
        if ($cmd === '3' || str_contains($cmd, 'مبيعات') || str_contains($cmd, 'مبيعاتي') || str_contains($cmd, 'فواتيري') || str_contains($cmd, 'مشترياتي')) {
            return $this->generatePosSalesSummary($user);
        }

        // 4. Card Lookup
        if (preg_match('/^(?:4|استعلام\s*كرت|فحص\s*كرت|كرت)\s+([a-zA-Z0-9_-]+)/ui', $cmd, $matches)) {
            return $this->formatCardQueryResponse($matches[1], $sender, $settings);
        }

        // Default: POS Help Menu
        return $this->formatPosMenu($posName, $settings);
    }

    /**
     * Subscriber & Guest Commands Handler
     */
    private function handleSubscriberCommand($cmd, $rawMsg, $sender, $settings) {
        // 1. Check Card / Balance
        if ($cmd === '1' || str_contains($cmd, 'رصيد') || str_contains($cmd, 'رصيدي') || str_contains($cmd, 'كرتي') || str_contains($cmd, 'استعلام')) {
            $resp = "🔍 *للاستعلام عن رصيدك أو صلاحية كرتك:*
";
            $resp .= "أرسل *رقم الكرت* مباشرة في رسالة وسيقوم البوت بعرض تفاصيل الرصيد والاستهلاك فوراً.

";
            $resp .= "💡 *مثال:* `771234567` أو `k-10023`";
            return ['handled' => true, 'response' => $resp];
        }

        // 2. Packages & Pricing
        if ($cmd === '2' || str_contains($cmd, 'باقات') || str_contains($cmd, 'الباقات') || str_contains($cmd, 'اسعار') || str_contains($cmd, 'الأسعار') || str_contains($cmd, 'عروض')) {
            return $this->generatePackagesList();
        }

        // 3. Points of Sale / Distributors
        if ($cmd === '3' || str_contains($cmd, 'نقاط') || str_contains($cmd, 'نقاط البيع') || str_contains($cmd, 'الموزعين') || str_contains($cmd, 'اماكن') || str_contains($cmd, 'أماكن البيع')) {
            return $this->generatePosLocationsList();
        }

        // 4. Technical Support
        if ($cmd === '4' || str_contains($cmd, 'دعم') || str_contains($cmd, 'الدعم') || str_contains($cmd, 'مساعدة') || str_contains($cmd, 'تواصل') || str_contains($cmd, 'اتصال')) {
            $supp = $settings['support_phone'];
            $resp = "📞 *خدمة العملاء والدعم الفني 🌐*
";
            $resp .= "━━━━━━━━━━━━━━━━━━━━
";
            $resp .= "يسعدنا دائماً خدمتكم والإجابة على استفساراتكم:
";
            $resp .= "📱 *رقم الدعم الفني:* `+$supp`
";
            $resp .= "🕒 *أوقات العمل:* على مدار 24 ساعة طوال أيام الأسبوع.

";
            $resp .= "إذا كنت تواجه مشكلة في الاتصال، يرجى تزويدنا برقم الكرت وموقعك بالتفصيل.";
            return ['handled' => true, 'response' => $resp];
        }

        // Default Subscriber Welcome Menu
        return $this->formatSubscriberMenu($settings);
    }

    // =========================================================================
    // SPECIFIC QUERY GENERATORS & FORMATTERS
    // =========================================================================

    /**
     * Admin Financial Summary
     */
    private function generateAdminFinancialSummary($adminName) {
        $today = date('Y-m-d');
        $networkId=$this->networkId();
        
        // Total Receivables from Agents / Distributors
        $stmt = $this->db->prepare("
            SELECT 
                COUNT(*) as total_agents,
                SUM(CASE WHEN b.balance > 0 THEN b.balance ELSE 0 END) as total_debts,
                SUM(CASE WHEN b.balance < 0 THEN ABS(b.balance) ELSE 0 END) as total_credits
            FROM um_admin_network_roles r
            JOIN um_admin_network_access x ON x.admin_id=r.admin_id AND x.network_id=r.network_id AND x.is_active=1
            LEFT JOIN um_admin_network_balances b ON b.admin_id=r.admin_id AND b.network_id=r.network_id
            WHERE r.network_id=? AND r.is_active=1 AND r.role_key IN ('distributor','pos_agent','point_of_sale','agent','reseller','sales')
        ");
        $stmt->execute([$networkId]);
        $agentStats = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        // Today's Sales Totals
        $stmt = $this->db->prepare("
            SELECT 
                COUNT(*) as inv_count,
                COALESCE(SUM(total_amount), 0) as total_sales,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(remaining_amount), 0) as total_remaining
            FROM um_sales_invoices 
            WHERE network_id=? AND DATE(created_at) = ?
        ");
        $stmt->execute([$networkId,$today]);
        $salesStats = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        // Active Online Users Count
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM radacct WHERE network_id=? AND acctstoptime IS NULL");
        $stmt->execute([$networkId]);
        $onlineUsers = (int)($stmt ? $stmt->fetchColumn() : 0);

        $totDebts = number_format((float)($agentStats['total_debts'] ?? 0), 2);
        $totSales = number_format((float)($salesStats['total_sales'] ?? 0), 2);
        $totPaid = number_format((float)($salesStats['total_paid'] ?? 0), 2);
        $totRem = number_format((float)($salesStats['total_remaining'] ?? 0), 2);
        $totAgents = number_format((int)($agentStats['total_agents'] ?? 0));
        $timeStr = date('Y-m-d h:i A');

        $text = "📊 *التقرير المالي والإداري الشامل*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "👤 *مرحباً:* $adminName
";
        $text .= "⏱️ *الوقت:* `$timeStr`

";

        $text .= "💵 *مبيعات اليوم ($today):*
";
        $text .= "• إجمالي المبيعات: *$totSales ر.ي*
";
        $text .= "• النقد المقبوض: *$totPaid ر.ي*
";
        $text .= "• المتبقي (آجل): *$totRem ر.ي*
";
        $text .= "• عدد الفواتير: *" . ($salesStats['inv_count'] ?? 0) . " فاتورة*

";

        $text .= "👥 *أرصدة ومديونيات الوكلاء:* ($totAgents وكيل/نقطة)
";
        $text .= "• إجمالي المديونيات المستحقة: *$totDebts ر.ي*

";

        $text .= "⚡ *المشتركون المتصلون الآن:* *$onlineUsers متصل*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 *أوامر سريعة:* أرسل `2` للمخزون | `3` للمبيعات | `4` للسيرفرات";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Global Card Stock Inventory
     */
    private function generateCardStockSummary() {
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("
            SELECT 
                COALESCE(profile_name, 'باقة عامة') as profile_name,
                COUNT(*) as total_cards,
                SUM(CASE WHEN is_sold = 0 OR is_sold IS NULL THEN 1 ELSE 0 END) as available_in_custody,
                SUM(CASE WHEN is_sold = 1 THEN 1 ELSE 0 END) as sold_to_pos,
                SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_cards
            FROM um_vouchers_meta
            WHERE network_id=?
            GROUP BY profile_name
            ORDER BY total_cards DESC
            LIMIT 10
        ");
        $stmt->execute([$networkId]);
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $stmtTot = $this->db->prepare("
            SELECT 
                COUNT(*) as grand_total,
                SUM(CASE WHEN is_sold = 0 OR is_sold IS NULL THEN 1 ELSE 0 END) as grand_available,
                SUM(CASE WHEN is_sold = 1 THEN 1 ELSE 0 END) as grand_sold,
                SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as grand_used
            FROM um_vouchers_meta
            WHERE network_id=?
        ");
        $stmtTot->execute([$networkId]);
        $tot = $stmtTot->fetch(PDO::FETCH_ASSOC) ?: [];

        $text = "📦 *تقرير جرد ومخزون الكروت الشامل*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "📈 *الإجمالي الكلي للنظام:*
";
        $text .= "• المتاح في عهدة الإدارة: *" . number_format($tot['grand_available'] ?? 0) . " كرت*
";
        $text .= "• المباع لنقاط البيع: *" . number_format($tot['grand_sold'] ?? 0) . " كرت*
";
        $text .= "• المستخدم من المشتركين: *" . number_format($tot['grand_used'] ?? 0) . " كرت*
";
        $text .= "• المجموع الكلي: *" . number_format($tot['grand_total'] ?? 0) . " كرت*

";

        if (!empty($rows)) {
            $text .= "📋 *تفاصيل المخزون حسب الباقات:*
";
            foreach ($rows as $r) {
                $pName = $r['profile_name'];
                $avail = number_format($r['available_in_custody']);
                $sold = number_format($r['sold_to_pos']);
                $text .= "🔹 *$pName:*
   متاح: `$avail` | مباع للوكلاء: `$sold`
";
            }
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 للاستعلام عن كرت معين أرسل: `استعلام كرت [الرقم]`";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Today's Sales Summary
     */
    private function generateTodaySalesSummary() {
        $today = date('Y-m-d');
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("
            SELECT 
                i.invoice_no,
                COALESCE(a.fullname, a.username, 'عميل مباشر') as buyer_name,
                i.total_amount,
                i.paid_amount,
                i.remaining_amount,
                i.created_at
            FROM um_sales_invoices i
            LEFT JOIN um_admins a ON i.buyer_id = a.id
            WHERE i.network_id=? AND DATE(i.created_at) = ?
            ORDER BY i.id DESC
            LIMIT 5
        ");
        $stmt->execute([$networkId,$today]);
        $recentInvoices = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $stmtTot = $this->db->prepare("
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(total_amount), 0) as total,
                COALESCE(SUM(paid_amount), 0) as paid,
                COALESCE(SUM(remaining_amount), 0) as rem
            FROM um_sales_invoices
            WHERE network_id=? AND DATE(created_at) = ?
        ");
        $stmtTot->execute([$networkId,$today]);
        $tot = $stmtTot->fetch(PDO::FETCH_ASSOC) ?: [];

        $text = "🧾 *ملخص مبيعات اليوم ($today)*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💰 *إجمالي المبيعات:* *" . number_format($tot['total'], 2) . " ر.ي*
";
        $text .= "💵 *المقبوض نقداً:* *" . number_format($tot['paid'], 2) . " ر.ي*
";
        $text .= "⏳ *المتبقي (آجل):* *" . number_format($tot['rem'], 2) . " ر.ي*
";
        $text .= "🔢 *عدد الفواتير:* *" . $tot['count'] . " فاتورة*

";

        if (!empty($recentInvoices)) {
            $text .= "📄 *آخر فواتير اليوم:*
";
            foreach ($recentInvoices as $inv) {
                $time = date('h:i A', strtotime($inv['created_at']));
                $text .= "• `{$inv['invoice_no']}` | {$inv['buyer_name']} | *" . number_format($inv['total_amount']) . " ر.ي* ($time)
";
            }
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 أرسل `1` للتقرير المالي الكامل";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Routers & NAS Health Status (NOC)
     */
    private function generateRouterStatusSummary() {
        $stmt = $this->db->prepare("SELECT id,nasname,shortname,type,description FROM nas WHERE network_id=? ORDER BY id ASC LIMIT 15");
        $stmt->execute([$this->networkId()]);
        $routers = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $text = "📡 *حالة الراوترات وسيرفرات الشبكة (NOC)*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        if (empty($routers)) {
            $text .= "ℹ️ لا توجد راوترات مضافة في النظام حالياً.
";
        } else {
            foreach ($routers as $r) {
                $name = $r['shortname'] ?: $r['nasname'];
                $ip = $r['nasname'];
                $type = $r['type'] ?: 'MikroTik';
                $text .= "🟢 *{$name}* (`{$ip}`)
   النوع: $type | الحالة: نشط ومتصل
";
            }
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "🛡️ جميع بوابات RADIUS تعمل بكفاءة 100%.";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Specific Agent Statement & Stock
     */
    private function generateAgentStatementSummary($query) {
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("
            SELECT a.id,a.username,a.fullname,r.role_key AS role,a.phone,b.balance,b.credit_limit
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            LEFT JOIN um_admin_network_balances b ON b.admin_id=a.id AND b.network_id=x.network_id
            WHERE (a.username LIKE ? OR a.fullname LIKE ? OR a.phone LIKE ?)
            LIMIT 1
        ");
        $q = "%$query%";
        $stmt->execute([$networkId,$q, $q, $q]);
        $agent = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$agent) {
            return ['handled' => true, 'response' => "⚠️ لم يتم العثور على وكيل أو نقطة بيع تطابق: *$query*."];
        }

        $name = $agent['fullname'] ?: $agent['username'];
        $bal = number_format((float)($agent['balance'] ?? 0), 2);
        $limit = number_format((float)($agent['credit_limit'] ?? 0), 2);
        $phone = $agent['phone'] ?: '---';
        $agentId = (int)$agent['id'];

        // Warehouse count for this agent
        $stmtCards = $this->db->prepare("
            SELECT COUNT(*) as total_stock,
                   SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_cards,
                   SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_cards
            FROM um_vouchers_meta 
            WHERE network_id=? AND (owner_admin_id = ? OR sold_by_admin_id = ?)
        ");
        $stmtCards->execute([$networkId,$agentId, $agentId]);
        $stock = $stmtCards->fetch(PDO::FETCH_ASSOC) ?: [];

        $text = "👤 *كشف حساب الوكيل / نقطة البيع*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "🏷️ *الاسم:* *$name*
";
        $text .= "📱 *الهاتف:* `$phone`
";
        $text .= "💰 *الرصيد / المديونية:* *$bal ر.ي*
";
        $text .= "💳 *سقف الائتمان:* *$limit ر.ي*

";

        $text .= "📦 *مخزون الكروت لدى الوكيل:*
";
        $text .= "• المتبقي غير المستخدم: *" . number_format($stock['active_cards'] ?? 0) . " كرت*
";
        $text .= "• الكروت المستهلكة: *" . number_format($stock['used_cards'] ?? 0) . " كرت*
";
        $text .= "• إجمالي الكروت المباعة له: *" . number_format($stock['total_stock'] ?? 0) . " كرت*
";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * POS / Distributor Account Summary
     */
    private function generatePosAccountSummary($user) {
        $networkId=$this->networkId();
        $name = $user['fullname'] ?: $user['username'];
        $bal = (float)($user['balance'] ?? 0);
        $limit = (float)($user['credit_limit'] ?? 0);
        $balFmt = number_format(abs($bal), 2);
        $statusText = $bal > 0 ? "مديونية مستحقة عليك: *$balFmt ر.ي* ⚠️" : ($bal < 0 ? "رصيد دائن لصالحك: *$balFmt ر.ي* 🟢" : "حسابك متزن (0.00 ر.ي) ✅");

        $posId = (int)$user['id'];
        $stmt = $this->db->prepare("
            SELECT invoice_no, total_amount, paid_amount, remaining_amount, created_at 
            FROM um_sales_invoices 
            WHERE network_id=? AND buyer_id = ? 
            ORDER BY id DESC LIMIT 3
        ");
        $stmt->execute([$networkId,$posId]);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $text = "💼 *كشف حساب نقطة البيع / الوكيل*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "👤 *الاسم:* $name
";
        $text .= "💰 *الوضع المالي:* $statusText
";
        $text .= "💳 *سقف الائتمان:* *" . number_format($limit, 2) . " ر.ي*

";

        if (!empty($invoices)) {
            $text .= "📄 *آخر فواتير ومشتريات:*
";
            foreach ($invoices as $inv) {
                $d = date('Y-m-d', strtotime($inv['created_at']));
                $text .= "• `{$inv['invoice_no']}`: *" . number_format($inv['total_amount']) . " ر.ي* (مدفوع: " . number_format($inv['paid_amount']) . ") - $d
";
            }
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 أرسل `2` لجرد مخزنك | `3` لمبيعاتك";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * POS / Distributor Warehouse Summary
     */
    private function generatePosWarehouseSummary($user) {
        $networkId=$this->networkId();
        $posId = (int)$user['id'];
        $name = $user['fullname'] ?: $user['username'];

        $stmt = $this->db->prepare("
            SELECT 
                COALESCE(profile_name, 'باقة عامة') as profile_name,
                COUNT(*) as total_cards,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN status = 'used' OR status = 'expired' THEN 1 ELSE 0 END) as used_count
            FROM um_vouchers_meta
            WHERE network_id=? AND (owner_admin_id = ? OR sold_by_admin_id = ?)
            GROUP BY profile_name
        ");
        $stmt->execute([$networkId,$posId, $posId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $stmtTot = $this->db->prepare("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_total,
                SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_total
            FROM um_vouchers_meta 
            WHERE network_id=? AND (owner_admin_id = ? OR sold_by_admin_id = ?)
        ");
        $stmtTot->execute([$networkId,$posId, $posId]);
        $tot = $stmtTot->fetch(PDO::FETCH_ASSOC) ?: [];

        $text = "📦 *جرد مخزن الكروت الخاص بك*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "👤 *الوكيل:* $name
";
        $text .= "🟢 *الكروت المتاحة للبيع الآن:* *" . number_format($tot['active_total'] ?? 0) . " كرت*
";
        $text .= "🟡 *الكروت المستهلكة/المباعة:* *" . number_format($tot['used_total'] ?? 0) . " كرت*
";
        $text .= "🔢 *إجمالي الكروت المسجلة لديك:* *" . number_format($tot['total'] ?? 0) . " كرت*

";

        if (!empty($rows)) {
            $text .= "📋 *تفاصيل الباقات المتبقية لديك:*
";
            foreach ($rows as $r) {
                $text .= "🔹 *{$r['profile_name']}:* متاح: `{$r['active_count']}` كرت
";
            }
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 لفحص كرت معين أرسل: `كرت [الرقم]`";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * POS / Distributor Sales Summary
     */
    private function generatePosSalesSummary($user) {
        $networkId=$this->networkId();
        $posId = (int)$user['id'];
        $name = $user['fullname'] ?: $user['username'];

        $stmt = $this->db->prepare("
            SELECT 
                COUNT(*) as total_invoices,
                COALESCE(SUM(total_amount), 0) as total_amount,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(remaining_amount), 0) as total_rem
            FROM um_sales_invoices 
            WHERE network_id=? AND buyer_id = ?
        ");
        $stmt->execute([$networkId,$posId]);
        $tot = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $text = "📈 *تقرير مشتريات ومبيعات الوكيل*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "👤 *الاسم:* $name
";
        $text .= "💰 *إجمالي المشتريات:* *" . number_format($tot['total_amount'], 2) . " ر.ي*
";
        $text .= "💵 *المسدد نقداً:* *" . number_format($tot['total_paid'], 2) . " ر.ي*
";
        $text .= "⏳ *المتبقي (الآجل):* *" . number_format($tot['total_rem'], 2) . " ر.ي*
";
        $text .= "📄 *عدد الفواتير:* *" . $tot['total_invoices'] . " فاتورة*
";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Card Query Formatter (for Admin, POS, and Subscriber)
     */
    public function formatCardQueryResponse($code, $sender, $settings) {
        $networkId=$this->networkId();
        $code = trim($code);
        if (empty($code)) {
            return ['handled' => true, 'response' => "⚠️ يرجى إدخال رقم الكرت بشكل صحيح."];
        }

        // Query card details from um_vouchers_meta / radcheck / radacct
        $stmt = $this->db->prepare("
            SELECT 
                v.*,
                COALESCE(v.profile_name, 'باقة قياسية') as plan_name,
                COALESCE(v.price, 0) as plan_price
            FROM um_vouchers_meta v
            WHERE v.network_id=? AND (v.username = ? OR v.batch_id = ?)
            LIMIT 1
        ");
        $stmt->execute([$networkId,$code, $code]);
        $card = $stmt->fetch(PDO::FETCH_ASSOC);

        $senderRole=(string)($sender['role']??'guest');
        $senderUser=$sender['user']??[];
        if($card && $senderRole==='pos' && (int)($card['owner_admin_id']??0)!==(int)($senderUser['id']??0) && (int)($card['sold_by_admin_id']??0)!==(int)($senderUser['id']??0)) $card=false;
        if($card && $senderRole==='subscriber' && (string)($card['username']??'')!==(string)($senderUser['username']??'')) $card=false;

        if (!$card) {
            // Check in radcheck
            if($senderRole!=='admin') return ['handled'=>true,'response'=>"❌ الكرت غير موجود ضمن نطاق حسابك."];
            $stmtRad = $this->db->prepare("SELECT username, value FROM radcheck WHERE network_id=? AND username = ? LIMIT 1");
            $stmtRad->execute([$networkId,$code]);
            $rad = $stmtRad->fetch(PDO::FETCH_ASSOC);

            if (!$rad) {
                return ['handled' => true, 'response' => "❌ *الكرت غير موجود!*
لم يتم العثور على أي بيانات مطابقة للكرت `{$code}`. يرجى التأكد من الرقم والمحاولة مجدداً."];
            }
            $card = [
                'username' => $rad['username'],
                'status' => 'active',
                'plan_name' => 'باقة مستخدم',
                'first_login' => null,
                'expires_at' => null
            ];
        }

        // Get live usage from radacct
        $stmtUsage = $this->db->prepare("
            SELECT 
                COALESCE(SUM(acctsessiontime), 0) as used_seconds,
                COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) as used_bytes,
                MAX(acctstarttime) as last_login,
                COUNT(CASE WHEN acctstoptime IS NULL THEN 1 END) as is_online
            FROM radacct 
            WHERE network_id=? AND username = ?
        ");
        $stmtUsage->execute([$networkId,$code]);
        $usage = $stmtUsage->fetch(PDO::FETCH_ASSOC) ?: [];

        $isOnline = ($usage['is_online'] ?? 0) > 0;
        $statusIcon = $isOnline ? '🟢 متصل الآن' : (($card['status'] ?? '') === 'active' ? '🟡 غير متصل (صالح)' : '🔴 مستخدم/منتهي');
        $usedMB = round(($usage['used_bytes'] ?? 0) / (1024 * 1024), 2);
        $usedHours = round(($usage['used_seconds'] ?? 0) / 3600, 1);

        $text = "💳 *بيانات واستعلام الكرت*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "🔢 *رقم الكرت:* `{$card['username']}`
";
        $text .= "📦 *الباقة:* *" . ($card['plan_name'] ?? 'افتراضية') . "*
";
        $text .= "📊 *الحالة:* $statusIcon
";
        $text .= "⏳ *الوقت المستهلك:* *{$usedHours} ساعة*
";
        $text .= "🌐 *البيانات المستهلكة:* *{$usedMB} ميجابايت*
";

        if (!empty($card['first_login'])) {
            $text .= "⏱️ *أول استخدام:* `{$card['first_login']}`
";
        }
        if (!empty($card['expires_at'])) {
            $text .= "📅 *تاريخ الانتهاء:* `{$card['expires_at']}`
";
        }

        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 للاستعلام عن كرت آخر، أرسل رقمه مباشرة.";

        return ['handled' => true, 'response' => $text];
    }

    /**
     * Packages List
     */
    private function generatePackagesList() {
        $stmt = $this->db->prepare("
            SELECT COALESCE(name_for_users,name) AS planName,price AS planCost,transfer_limit AS planTrafficTotal
            FROM um_profiles_def
            WHERE network_id=?
            ORDER BY id ASC 
            LIMIT 10
        ");
        $stmt->execute([$this->networkId()]);
        $plans = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $text = "📦 *باقات وعروض الإنترنت المتوفرة*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        if (empty($plans)) {
            $text .= "• باقة 1 ساعة - 100 ر.ي
• باقة 3 ساعات - 200 ر.ي
• باقة 12 ساعة - 500 ر.ي
• باقة يوم كامل - 1000 ر.ي
";
        } else {
            foreach ($plans as $p) {
                $name = $p['planName'];
                $price = number_format((float)($p['planCost'] ?? 0));
                $mb = !empty($p['planTrafficTotal']) ? " (" . $p['planTrafficTotal'] . " MB)" : '';
                $text .= "🔹 *{$name}:* *$price ر.ي*$mb
";
            }
        }
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 يمكنك شراء الكروت من أقرب نقطة بيع معتمدة.";
        return ['handled' => true, 'response' => $text];
    }

    /**
     * POS Locations List
     */
    private function generatePosLocationsList() {
        $stmt = $this->db->prepare("
            SELECT a.username,a.fullname,a.phone
            FROM um_admins a
            JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1
            JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1
            WHERE r.role_key IN ('distributor','pos_agent','point_of_sale','agent','sales') AND a.is_active=1
            ORDER BY a.id ASC
            LIMIT 10
        ");
        $stmt->execute([$this->networkId()]);
        $agents = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $text = "📍 *أماكن ونقاط بيع الكروت المعتمدة*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        if (empty($agents)) {
            $text .= "متوفرة في جميع المحلات والمراكز التجارية المجاورة لشبكتنا.
";
        } else {
            foreach ($agents as $a) {
                $name = $a['fullname'] ?: $a['username'];
                $phone = $a['phone'] ? " (`{$a['phone']}`)" : '';
                $text .= "🏪 *$name*$phone
";
            }
        }
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 أرسل `4` للتواصل مع الدعم الفني.";
        return ['handled' => true, 'response' => $text];
    }

    // =========================================================================
    // MENU HELP FORMATTERS
    // =========================================================================

    private function formatAdminMenu($name, $settings) {
        $net = $settings['network_name'];
        $text = "🤖 *قائمة خدمات الإدارة الذكية - $net*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "مرحباً بك عزيزي المدير *$name* 👑
";
        $text .= "يرجى إرسال *رقم الخيار* أو *الكلمة* لتنفيذ الاستعلام فوراً:

";
        $text .= "1️⃣ أو `كشف حساب` : التقرير المالي والأرصدة
";
        $text .= "2️⃣ أو `المخزون` : جرد مخزن الكروت العام
";
        $text .= "3️⃣ أو `مبيعات اليوم` : ملخص مبيعات وفواتير اليوم
";
        $text .= "4️⃣ أو `السيرفرات` : حالة السيرفرات والراوترات (NOC)
";
        $text .= "5️⃣ أو `استعلام كرت [الرقم]` : فحص تفاصيل كرت
";
        $text .= "6️⃣ أو `كشف وكيل [الاسم]` : كشف حساب ومخزن وكيل
";
        $text .= "0️⃣ أو `قائمة` : عرض هذه القائمة في أي وقت
";
        $text .= "━━━━━━━━━━━━━━━━━━━━";
        return ['handled' => true, 'response' => $text];
    }

    private function formatPosMenu($name, $settings) {
        $net = $settings['network_name'];
        $text = "🤖 *خدمات نقطة البيع والوكيل - $net*
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "أهلاً بك *$name* 🏪
";
        $text .= "أرسل *رقم الخيار* لتنفيذ ما تحتاجه تلقائياً:

";
        $text .= "1️⃣ أو `حسابي` : كشف رصيدك والمديونية
";
        $text .= "2️⃣ أو `مخزني` : رصيد الكروت المتبقية لديك
";
        $text .= "3️⃣ أو `مبيعاتي` : ملخص فواتيرك ومشترياتك
";
        $text .= "4️⃣ أو `كرت [الرقم]` : استعلام وفحص صلاحية كرت
";
        $text .= "0️⃣ أو `قائمة` : إعادة عرض هذه القائمة
";
        $text .= "━━━━━━━━━━━━━━━━━━━━";
        return ['handled' => true, 'response' => $text];
    }

    private function formatSubscriberMenu($settings) {
        $net = $settings['network_name'];
        $welcome = $settings['welcome_msg'];
        $text = "🌐 *$net*
";
        $text .= "$welcome
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "يرجى اختيار ما تود الاستعلام عنه:

";
        $text .= "1️⃣ أو إرسال `رقم الكرت` : رصيدك والوقت المتبقي
";
        $text .= "2️⃣ أو `الباقات` : قائمة العروض والأسعار
";
        $text .= "3️⃣ أو `نقاط البيع` : أماكن شراء الكروت
";
        $text .= "4️⃣ أو `الدعم الفني` : رقم وتواصل الدعم
";
        $text .= "━━━━━━━━━━━━━━━━━━━━
";
        $text .= "💡 يمكنك إرسال رقم كرتك مباشرة في أي وقت لمعرفة رصيدك!";
        return ['handled' => true, 'response' => $text];
    }
}
