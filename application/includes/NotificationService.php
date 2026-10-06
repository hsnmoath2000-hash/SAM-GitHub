<?php
/**
 * NotificationService - Unified Notification Engine (WhatsApp + Telegram)
 */
require_once __DIR__ . '/NetworkChannelService.php';
require_once __DIR__ . '/TelegramService.php';
require_once __DIR__ . '/WhatsAppService.php';
require_once __DIR__ . '/FirebaseService.php';

class NotificationService {
    private $db;
    private $telegram;
    private $whatsapp;
    private $firebase;

    public function __construct($db) {
        $this->db = $db;
        // AuthorizationContext binds the validated active network to the
        // PDO connection before notification methods are called. Do not trust
        // a raw browser header here, otherwise a token/session could cross tenants.
        $networkId = (int)$this->db->query("SELECT COALESCE(@sam_active_network_id,0)")->fetchColumn();
        if ($networkId <= 0 && session_status() === PHP_SESSION_ACTIVE) {
            $networkId = (int)($_SESSION['active_network_id'] ?? 0);
        }
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        $this->telegram = new TelegramService($db, $networkId);
        $this->whatsapp = new WhatsAppService($db, null, $networkId);
        $this->firebase = new FirebaseService($db, $networkId);
    }

    private function networkId(): int {
        $id = (int)$this->db->query("SELECT COALESCE(@sam_active_network_id,0)")->fetchColumn();
        if ($id <= 0 && session_status() === PHP_SESSION_ACTIVE) {
            $id = (int)($_SESSION['active_network_id'] ?? 0);
        }
        if ($id <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        $this->db->exec("SET @sam_active_network_id=" . $id);
        return $id;
    }

    public function getFirebaseService(): FirebaseService {
        return $this->firebase;
    }

    public function getWhatsAppService() {
        return $this->whatsapp;
    }

    public function getTelegramService() {
        return $this->telegram;
    }

    // =========================================================================
    // 1. SETTINGS MANAGEMENT
    // =========================================================================
    public function getSettings() {
        $networkId = $this->networkId();
        $channels = new NetworkChannelService($this->db);
        $waChannel = $channels->getChannel($networkId, 'whatsapp');
        $tgSettings = $this->telegram->getSettings();
        $networkSettings = $channels->getNotificationSettings($networkId);
        $fbSettings = $this->firebase->getSettings();
        $waStatus = $this->whatsapp->getStatus();

        return [
            'network_id' => $networkId,
            'firebase' => $fbSettings,
            'whatsapp' => [
                'enabled' => !empty($waChannel['is_enabled']),
                'api_url' => $waChannel['api_url'] ?? 'http://127.0.0.1:3388',
                'notify_sales' => !empty($networkSettings['notify_sales']),
                'notify_receipts' => !empty($networkSettings['notify_receipts']),
                'notify_transfers' => !empty($networkSettings['notify_transfers']),
                'notify_routers' => !empty($networkSettings['notify_routers']),
                'notify_low_stock' => !empty($networkSettings['notify_inventory']),
                'status' => $waStatus['status'] ?? 'DISCONNECTED',
                'connected' => !empty($waStatus['connected']),
                'info' => $waStatus['info'] ?? null
            ],
            'telegram' => [
                'enabled' => !empty($tgSettings['enabled']) && !empty($networkSettings['telegram_enabled']),
                'bot_token' => '',
                'chat_id' => '',
                'has_bot_token' => !empty($tgSettings['bot_token']),
                'has_chat_id' => !empty($tgSettings['chat_id']),
                'notify_sales' => !empty($networkSettings['notify_sales']),
                'notify_receipts' => !empty($networkSettings['notify_receipts']),
                'notify_transfers' => !empty($networkSettings['notify_transfers']),
                'notify_routers' => !empty($networkSettings['notify_routers']),
                'notify_low_stock' => !empty($networkSettings['notify_inventory'])
            ],
            'network_settings' => $networkSettings,
            'channels' => [
                'whatsapp' => $channels->publicChannelStatus($networkId, 'whatsapp'),
                'telegram' => $channels->publicChannelStatus($networkId, 'telegram')
            ]
        ];
    }

    public function saveSettings($data) {
        $networkId = $this->networkId();
        $actorId = (int)($_SESSION['admin_id'] ?? 0);
        $channels = new NetworkChannelService($this->db);

        $whatsappData = ['api_url' => trim((string)($data['whatsapp_api_url'] ?? 'http://127.0.0.1:3388'))];
        if (array_key_exists('whatsapp_enabled', $data)) $whatsappData['enabled'] = !empty($data['whatsapp_enabled']);
        if (array_key_exists('whatsapp_enabled', $data)) $whatsappData['status'] = 'CONFIGURED';
        $channels->saveChannel($networkId, 'whatsapp', $whatsappData, $actorId);
        $telegramData = [];
        if (array_key_exists('telegram_enabled', $data)) {
            $telegramData['enabled'] = !empty($data['telegram_enabled']);
            $telegramData['status'] = 'CONFIGURED';
        }
        $telegramToken = trim((string)($data['telegram_bot_token'] ?? $data['bot_token'] ?? ''));
        $telegramChatId = trim((string)($data['telegram_chat_id'] ?? $data['chat_id'] ?? ''));
        $telegramWebhookSecret = trim((string)($data['telegram_webhook_secret'] ?? $data['webhook_secret'] ?? ''));
        if ($telegramToken !== '') $telegramData['bot_token'] = $telegramToken;
        if ($telegramChatId !== '') $telegramData['chat_id'] = $telegramChatId;
        if ($telegramWebhookSecret !== '') $telegramData['webhook_secret'] = $telegramWebhookSecret;
        $channels->saveChannel($networkId, 'telegram', $telegramData, $actorId);

        $notificationChanges = [];
        foreach (['whatsapp_enabled' => 'whatsapp_enabled', 'telegram_enabled' => 'telegram_enabled', 'firebase_enabled' => 'fcm_enabled'] as $inputKey => $settingKey) {
            if (array_key_exists($inputKey, $data)) $notificationChanges[$settingKey] = !empty($data[$inputKey]);
        }
        foreach ([
            'notify_sales' => ['whatsapp_notify_sales', 'telegram_notify_sales'],
            'notify_receipts' => ['whatsapp_notify_receipts', 'telegram_notify_receipts'],
            'notify_transfers' => ['whatsapp_notify_transfers', 'telegram_notify_transfers'],
            'notify_inventory' => ['whatsapp_notify_low_stock', 'telegram_notify_low_stock'],
            'notify_routers' => ['whatsapp_notify_routers', 'telegram_notify_routers'],
            'notify_finance' => ['whatsapp_notify_expenses', 'telegram_notify_expenses']
        ] as $settingKey => $inputKeys) {
            $found = false;
            $enabled = false;
            foreach ($inputKeys as $inputKey) {
                if (!array_key_exists($inputKey, $data)) continue;
                $found = true;
                $enabled = $enabled || !empty($data[$inputKey]);
            }
            if ($found) $notificationChanges[$settingKey] = $enabled;
        }
        if ($notificationChanges) $channels->saveNotificationSettings($networkId, $notificationChanges, $actorId);

        if (isset($data['firebase_enabled']) || isset($data['firebase_project_id']) || isset($data['firebase_service_account_json']) || isset($data['firebase_server_key'])) {
            // Firebase credentials are a shared project credential; device
            // tokens and the enabled flag remain network-scoped.
            $firebaseData = $data;
            $owner = $this->db->prepare('SELECT 1 FROM um_system_owners WHERE admin_id=? LIMIT 1');
            $owner->execute([$actorId]);
            if (!$owner->fetchColumn()) {
                unset($firebaseData['firebase_project_id'], $firebaseData['firebase_service_account_json'], $firebaseData['firebase_server_key']);
            }
            $this->firebase->saveSettings($firebaseData);
        }

        return ['success' => true, 'network_id' => $networkId, 'message' => 'تم حفظ إعدادات الرسائل والتنبيهات للشبكة الحالية بنجاح'];
    }

    // =========================================================================
    // 2. LOGS & HISTORY
    // =========================================================================
    public function getLogs($filters = [], $page = 1, $limit = 50) {
        $page = max(1, (int)$page);
        $limit = max(10, min(200, (int)$limit));
        $offset = ($page - 1) * $limit;

        $where = ["l.network_id=?"];
        $params = [$this->networkId()];

        if (!empty($filters['channel'])) {
            $where[] = "l.channel = ?";
            $params[] = $filters['channel'];
        }
        if (!empty($filters['event_type'])) {
            $where[] = "l.event_type = ?";
            $params[] = $filters['event_type'];
        }
        if (!empty($filters['status'])) {
            $where[] = "l.status = ?";
            $params[] = $filters['status'];
        }
        if (!empty($filters['search'])) {
            $where[] = "(l.recipient_phone LIKE ? OR l.recipient_name LIKE ? OR l.message_text LIKE ? OR l.reference_id LIKE ?)";
            $s = '%' . trim($filters['search']) . '%';
            $params = array_merge($params, [$s, $s, $s, $s]);
        }

        $whereSql = implode(' AND ', $where);

        $totalStmt = $this->db->prepare("SELECT COUNT(*) FROM um_notification_logs l WHERE $whereSql");
        $totalStmt->execute($params);
        $total = (int)$totalStmt->fetchColumn();

        $sql = "
            SELECT l.*, u.fullname as creator_name, n.name as network_name
            FROM um_notification_logs l
            LEFT JOIN um_networks n ON n.id = l.network_id
            LEFT JOIN um_admins u ON l.created_by = u.id
            WHERE $whereSql
            ORDER BY l.id DESC
            LIMIT $limit OFFSET $offset
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'success' => true,
            'logs' => $logs,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => ceil($total / $limit)
        ];
    }

    
    // =========================================================================
    // 2.1 NOTIFICATION STATS & RESEND ENGINE
    // =========================================================================
    public function getNotificationStats() {
        $networkId=$this->networkId();
        $st=$this->db->prepare("SELECT COUNT(*),SUM(status='sent'),SUM(status='failed'),SUM(channel='whatsapp'),SUM(channel='telegram') FROM um_notification_logs WHERE network_id=?");$st->execute([$networkId]);
        $row=$st->fetch(PDO::FETCH_NUM) ?: [0,0,0,0,0];
        [$total,$sent,$failed,$whatsapp,$telegram]=array_map('intval',$row);

        return [
            'success' => true,
            'stats' => [
                'total' => $total,
                'sent' => $sent,
                'failed' => $failed,
                'whatsapp' => $whatsapp,
                'telegram' => $telegram,
            ]
        ];
    }

    public function resendNotificationLog($logId, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("SELECT * FROM um_notification_logs WHERE network_id=? AND id = ?");
        $stmt->execute([$networkId,(int)$logId]);
        $log = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$log) {
            return ['success' => false, 'error' => 'سجل الرسالة غير موجود'];
        }

        $channel = $log['channel'];
        $msgText = $log['message_text'];
        $refId = $log['reference_id'] ?? ('retry_' . time());
        $res = false;
        $errMsg = null;

        if ($channel === 'whatsapp') {
            $phone = $log['recipient_phone'];
            if (empty($phone)) {
                return ['success' => false, 'error' => 'رقم هاتف المستلم غير متوفر في السجل'];
            }
            $res = $this->whatsapp->sendMessage($phone, $msgText, $refId, $currentAdminId);
            if (!$res) {
                $statusInfo = $this->whatsapp->getStatus();
                $errMsg = $statusInfo['status'] ?? 'فشل الاتصال بخدمة الواتساب';
            }
        } elseif ($channel === 'telegram') {
            $chatId = $log['recipient_chat_id'] ?: ($this->telegram->getSettings()['chat_id'] ?? '');
            if (empty($chatId)) {
                return ['success' => false, 'error' => 'معرف محادثة تليجرام غير محدد'];
            }
            $res = $this->telegram->sendMessage($msgText, $chatId, 'HTML');
            if (!$res) {
                $errMsg = 'فشل الإرسال عبر بوت تليجرام، يرجى فحص رمز البوت والـ chat_id';
            }
        } elseif ($channel === 'fcm' || $channel === 'system') {
            $adminId = (int)($log['created_by'] ?? 1);
            $res = $this->firebase->sendToAdmin($adminId, 'إشعار معاد إرساله', $msgText, [], $log['event_type'], $refId, $currentAdminId);
        }

        if ($res) {
            $this->db->prepare("UPDATE um_notification_logs SET status = 'sent', error_message = NULL, created_at = NOW() WHERE network_id=? AND id = ?")->execute([$networkId,(int)$logId]);
            return ['success' => true, 'message' => 'تمت إعادة إرسال الرسالة بنجاح عبر ' . ($channel === 'whatsapp' ? 'الواتساب' : 'تليجرام') . '!'];
        } else {
            $this->db->prepare("UPDATE um_notification_logs SET status = 'failed', error_message = ?, created_at = NOW() WHERE network_id=? AND id = ?")->execute([$errMsg ?: 'تعذر تسليم الرسالة',$networkId,(int)$logId]);
            return ['success' => false, 'error' => 'فشلت إعادة الإرسال: ' . ($errMsg ?: 'تأكد من اتصال خدمة الواتساب/تليجرام')];
        }
    }

// =========================================================================
    // 3. EVENT NOTIFIERS (فواتير، سندات، تحويلات، أبراج، مخزون)
    // =========================================================================

    /**
     * Notify Sales Invoice via WhatsApp & Telegram
     */
    public function notifySaleInvoice($invoiceId, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $invStmt = $this->db->prepare("
            SELECT i.*, 
                   b.fullname as buyer_name, b.phone as buyer_phone, b.email as buyer_email,
                   s.fullname as seller_name, s.phone as seller_phone
            FROM um_sales_invoices i
            LEFT JOIN um_admins b ON i.buyer_id = b.id
            LEFT JOIN um_admins s ON i.seller_id = s.id
            WHERE i.network_id=? AND i.id = ?
        ");
        $invStmt->execute([$networkId,(int)$invoiceId]);
        $inv = $invStmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) return false;

        $settings = $this->getSettings();
        $invoiceNo = $inv['invoice_no'];
        $totalFmt = number_format((float)$inv['total_amount'], 2);
        $paidFmt = number_format((float)$inv['paid_amount'], 2);
        $remFmt = number_format((float)$inv['remaining_amount'], 2);
        $cardsCnt = (int)$inv['quantity'];
        $buyerName = $inv['buyer_name'] ?: 'العميل';
        $sellerName = $inv['seller_name'] ?: 'الإدارة العامة';
        $dateStr = date('Y-m-d H:i', strtotime((string)($inv['created_at'] ?? 'now')));
        $paymentStatus = (string)($inv['payment_status'] ?? ($inv['status'] ?? ''));

        $waMsg = "🧾 *فاتورة مبيعات كروت جديدة*\n";
        $waMsg .= "━━━━━━━━━━━━━━━━━━\n";
        $waMsg .= "📄 *رقم الفاتورة:* `{$invoiceNo}`\n";
        $waMsg .= "👤 *العميل / المشتري:* {$buyerName}\n";
        $waMsg .= "🏪 *البائع:* {$sellerName}\n";
        $waMsg .= "📦 *الكمية:* {$cardsCnt} كرت\n";
        $waMsg .= "💰 *الإجمالي الصافي:* {$totalFmt} ر.ي\n";
        $waMsg .= "💵 *المدفوع:* {$paidFmt} ر.ي\n";
        if ((float)$inv['remaining_amount'] > 0) {
            $waMsg .= "⏳ *المتبقي الآجل:* {$remFmt} ر.ي\n";
        }
        $waMsg .= "📅 *التاريخ:* {$dateStr}\n";
        $waMsg .= "━━━━━━━━━━━━━━━━━━\n";
        $waMsg .= "شكراً لتعاملكم معنا! 🌐";

        // 1. Send WhatsApp with Sheet/Invoice Image to Buyer if enabled and phone exists
        if (!empty($settings['whatsapp']['notify_sales']) && !empty($inv['buyer_phone'])) {
            $mediaSent = false;
            try {
                require_once __DIR__ . '/CardImageService.php';
                $imgService = new CardImageService($this->db);
                $sheetBase64 = $imgService->generateSheetSaleImageBase64([
                    'invoice_no' => $invoiceNo,
                    'buyer_name' => $buyerName,
                    'seller_name' => $sellerName,
                    'profile_name' => $inv['profile_name'] ?? 'كروت شبكة',
                    'sheets_count' => (int)($inv['sheets_count'] ?? max(1, (int)($cardsCnt / 30))),
                    'cards_count' => $cardsCnt,
                    'total_amount' => (float)$inv['total_amount'],
                    'paid_amount' => (float)$inv['paid_amount'],
                    'remaining_amount' => (float)$inv['remaining_amount']
                ], $networkId);

                $waRes = $this->whatsapp->sendMedia(
                    $inv['buyer_phone'],
                    $sheetBase64,
                    $waMsg,
                    'image/png',
                    "invoice_{$invoiceNo}.png",
                    $invoiceNo,
                    $currentAdminId,
                    'sale_invoice'
                );
                $mediaSent = !empty($waRes['success']);
            } catch (Throwable $imgE) {
                error_log("Sheet image error in notifySaleInvoice: " . $imgE->getMessage());
            }

            if (!$mediaSent) {
                $this->whatsapp->sendMessage($inv['buyer_phone'], $waMsg, $invoiceNo, $currentAdminId);
            }
        }

        // 2. Send Telegram Alert to Admin Channel
        if (!empty($settings['telegram']['notify_sales'])) {
            $tgMsg = "🧾 <b>فاتورة مبيعات كروت جديدة</b>\n";
            $tgMsg .= "• <b>رقم الفاتورة:</b> <code>{$invoiceNo}</code>\n";
            $tgMsg .= "• <b>المشتري:</b> {$buyerName}\n";
            $tgMsg .= "• <b>البائع:</b> {$sellerName}\n";
            $tgMsg .= "• <b>الكمية:</b> {$cardsCnt} كرت\n";
            $tgMsg .= "• <b>المبلغ:</b> {$totalFmt} ر.ي\n";
            $tgMsg .= "• <b>الحالة:</b> " . ($paymentStatus === 'paid' ? 'خالصة ومسددة' : 'آجلة / سداد جزئي') . "\n";
            $tgMsg .= "• <b>التاريخ:</b> {$dateStr}";

            $this->sendTelegramLog($tgMsg, 'sale_invoice', $invoiceNo, $currentAdminId);
        }

        // 3. Firebase Push Notification to Buyer and Admins
        if (!empty($settings['firebase']['notify_sales']) && !empty($settings['firebase']['enabled'])) {
            try {
                $pushTitle = "🧾 فاتورة مبيعات جديدة: {$invoiceNo}";
                $pushBody = "تم إصدار فاتورة بمبلغ {$totalFmt} ر.ي ({$cardsCnt} كرت) للعميل {$buyerName}.";
                $pushData = [
                    'event_type' => 'sale_invoice',
                    'invoice_no' => $invoiceNo,
                    'invoice_id' => (string)$invoiceId,
                    'amount' => (string)$inv['total_amount'],
                    'click_action' => 'OPEN_SALES_SCREEN'
                ];
                if (!empty($inv['buyer_id'])) {
                    $this->firebase->sendToAdmin((int)$inv['buyer_id'], $pushTitle, $pushBody, $pushData, 'sale_invoice', $invoiceNo, $currentAdminId);
                }
                $this->firebase->sendToRole('system_owner', $pushTitle, $pushBody, $pushData, 'sale_invoice', $invoiceNo, $currentAdminId);
                $this->firebase->sendToRole('superadmin', $pushTitle, $pushBody, $pushData, 'sale_invoice', $invoiceNo, $currentAdminId);
            } catch (Throwable $fe) {}
        }

        return true;
    }

    /**
     * Notify Voucher Receipt via WhatsApp & Telegram
     */
    public function notifyVoucher($voucherId, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("
            SELECT v.*, COALESCE(v.party_name,a.fullname) as party_name, a.phone as party_phone, nb.balance as current_balance,
                   COALESCE(dst.account_name,src.account_name) as cashbox_name, u.fullname as creator_name,
                   v.created_at AS voucher_date
            FROM um_vouchers_financial v
            LEFT JOIN um_admins a ON v.party_id = a.id
            LEFT JOIN um_admin_network_balances nb ON nb.network_id=v.network_id AND nb.admin_id=v.party_id
            LEFT JOIN um_chart_of_accounts src ON src.network_id=v.network_id AND src.id=v.source_account_id
            LEFT JOIN um_chart_of_accounts dst ON dst.network_id=v.network_id AND dst.id=v.destination_account_id
            LEFT JOIN um_admins u ON v.created_by = u.id
            WHERE v.network_id=? AND v.id = ?
        ");
        $stmt->execute([$networkId,(int)$voucherId]);
        $v = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$v) return false;

        $settings = $this->getSettings();
        $isReceipt = ($v['voucher_type'] === 'receipt');
        $vNo = $v['voucher_no'];
        $amtFmt = number_format((float)$v['amount'], 2);
        $partyName = $v['party_name'] ?: 'العميل';
        $title = $isReceipt ? 'سند قبض مالي' : 'سند صرف مالي';
        $icon = $isReceipt ? '💵' : '📤';
        $dateStr = date('Y-m-d H:i', strtotime($v['voucher_date'] ?: $v['created_at']));

        $waMsg = "{$icon} *{$title}*\n";
        $waMsg .= "━━━━━━━━━━━━━━━━━━\n";
        $waMsg .= "📄 *رقم السند:* `{$vNo}`\n";
        $waMsg .= "👤 *الاسم:* {$partyName}\n";
        $waMsg .= "💰 *المبلغ:* {$amtFmt} ر.ي\n";
        $waMsg .= "💳 *طريقة الدفع:* " . ($v['payment_method'] === 'cash' ? 'نقداً (كاش)' : 'حوالة بنكية') . "\n";
        if (!empty($v['notes'])) {
            $waMsg .= "📝 *البيان:* {$v['notes']}\n";
        }
        $waMsg .= "📅 *التاريخ:* {$dateStr}\n";
        $waMsg .= "━━━━━━━━━━━━━━━━━━\n";
        $waMsg .= "تم تقييد المبلغ بنجاح في حسابكم 🌐";

        if (!empty($settings['whatsapp']['notify_receipts']) && !empty($v['party_phone'])) {
            $this->whatsapp->sendMessage($v['party_phone'], $waMsg, $vNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_receipts'])) {
            $tgMsg = "{$icon} <b>{$title}</b>\n";
            $tgMsg .= "• <b>رقم السند:</b> <code>{$vNo}</code>\n";
            $tgMsg .= "• <b>الحساب:</b> {$partyName}\n";
            $tgMsg .= "• <b>المبلغ:</b> {$amtFmt} ر.ي\n";
            $tgMsg .= "• <b>الخزينة:</b> " . ($v['cashbox_name'] ?: 'الرئيسية') . "\n";
            $tgMsg .= "• <b>المسؤول:</b> " . ($v['creator_name'] ?: 'النظام');

            $this->sendTelegramLog($tgMsg, 'voucher', $vNo, $currentAdminId);
        }

        // 3. Firebase Push Notification for Financial Voucher
        if (!empty($settings['firebase']['notify_receipts']) && !empty($settings['firebase']['enabled'])) {
            try {
                $pushTitle = "{$icon} {$title}: {$vNo}";
                $pushBody = "تم قيد مبلغ {$amtFmt} ر.ي لحساب {$partyName}.";
                $pushData = [
                    'event_type' => 'voucher',
                    'voucher_no' => $vNo,
                    'voucher_id' => (string)$voucherId,
                    'amount' => (string)$v['amount'],
                    'voucher_type' => $v['voucher_type'],
                    'click_action' => 'OPEN_FINANCE_SCREEN'
                ];
                if (!empty($v['party_id'])) {
                    $this->firebase->sendToAdmin((int)$v['party_id'], $pushTitle, $pushBody, $pushData, 'voucher', $vNo, $currentAdminId);
                }
                $this->firebase->sendToRole('system_owner', $pushTitle, $pushBody, $pushData, 'voucher', $vNo, $currentAdminId);
                $this->firebase->sendToRole('superadmin', $pushTitle, $pushBody, $pushData, 'voucher', $vNo, $currentAdminId);
            } catch (Throwable $fe) {}
        }

        return true;
    }

    /**
     * Notify Warehouse Card Transfer
     */
    public function notifyTransfer($transferData, $currentAdminId = 1) {
        $settings = $this->getSettings();
        $networkId=$this->networkId();
        $targetId = (int)($transferData['target_admin_id'] ?? 0);
        $targetStmt = $this->db->prepare("SELECT a.fullname,a.phone,r.role_key AS role FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE a.id=?");
        $targetStmt->execute([$networkId,$targetId]);
        $target = $targetStmt->fetch(PDO::FETCH_ASSOC);

        $sourceId = (int)($transferData['source_admin_id'] ?? $currentAdminId);
        $srcStmt = $this->db->prepare("SELECT a.fullname,a.phone,r.role_key AS role FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE a.id=?");
        $srcStmt->execute([$networkId,$sourceId]);
        $source = $srcStmt->fetch(PDO::FETCH_ASSOC);

        $sheetsCnt = (int)($transferData['sheets_count'] ?? 0);
        $cardsCnt = (int)($transferData['cards_count'] ?? 0);
        $totalVal = number_format((float)($transferData['total_value'] ?? 0), 2);
        $transferNo = $transferData['transfer_no'] ?? ('TRF-' . time());
        $profName = $transferData['profile_name'] ?? 'متعدد الباقات';
        $notes = $transferData['notes'] ?? '';

        $targetName = !empty($target['fullname']) ? $target['fullname'] : (!empty($transferData['target_name']) ? $transferData['target_name'] : 'المستلم');
        $sourceName = !empty($source['fullname']) ? $source['fullname'] : (!empty($transferData['source_name']) ? $transferData['source_name'] : 'المصدر');

        $waMsg = "📦 *إشعار رسمـي: أمر تحويل عهدة كروت مخزنية*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "🔖 *رقم الحركة:* `{$transferNo}`
";
        $waMsg .= "👤 *المستلم:* {$targetName} (" . ($target['role'] ?? 'حساب') . ")
";
        $waMsg .= "🏢 *المصدر:* {$sourceName} (" . ($source['role'] ?? 'حساب') . ")
";
        $waMsg .= "📦 *الباقة / الصنف:* {$profName}
";
        $waMsg .= "📑 *عدد الأوراق:* {$sheetsCnt} ورقة
";
        $waMsg .= "🎴 *إجمالي الكروت:* {$cardsCnt} كرت
";
        $waMsg .= "💰 *إجمالي القيمة المالية:* {$totalVal} ر.ي
";
        if (!empty($notes)) $waMsg .= "📝 *ملاحظات:* {$notes}
";
        $waMsg .= "📅 *التاريخ والوقت:* " . date('Y-m-d H:i:s') . "
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "✅ تم التوثيق الآلي في السجلات وقيد الحسابات المالية 🌐";

        // 1. Send via System WhatsApp to Recipient
        if (!empty($target['phone'])) {
            try { $this->whatsapp->sendMessage($target['phone'], $waMsg, $transferNo, $currentAdminId); } catch (Throwable $e) {}
        }

        // 2. Send via System WhatsApp to Sender
        if (!empty($source['phone']) && (int)$sourceId !== (int)$targetId) {
            try { $this->whatsapp->sendMessage($source['phone'], $waMsg, $transferNo, $currentAdminId); } catch (Throwable $e) {}
        }

        // 3. Send Detailed Telegram Message to Group
        $tgMsg = "📦 <b>إشعار رسمي: تحويل عهدة كروت مخزنية</b>
";
        $tgMsg .= "━━━━━━━━━━━━━━━━━━━━━━
";
        $tgMsg .= "• <b>رقم الحركة:</b> <code>{$transferNo}</code>
";
        $tgMsg .= "• <b>المستلم:</b> {$targetName}
";
        $tgMsg .= "• <b>المصدر:</b> {$sourceName}
";
        $tgMsg .= "• <b>الباقة:</b> {$profName}
";
        $tgMsg .= "• <b>عدد الأوراق:</b> {$sheetsCnt} ورقة
";
        $tgMsg .= "• <b>إجمالي الكروت:</b> {$cardsCnt} كرت
";
        $tgMsg .= "• <b>القيمة المالية:</b> <b>{$totalVal} ر.ي</b>
";
        if (!empty($notes)) $tgMsg .= "• <b>ملاحظات:</b> {$notes}
";
        $tgMsg .= "• <b>التاريخ:</b> " . date('Y-m-d H:i:s');

        try {
            $this->sendTelegramLog($tgMsg, 'stock_transfer', $transferNo, $currentAdminId);
        } catch (Throwable $te) {}

        // 4. Firebase Push Notification for Card Transfer
        if (!empty($settings['firebase']['notify_transfers']) && !empty($settings['firebase']['enabled'])) {
            try {
                $pushTitle = "📦 تحويل عهدة كروت مخزنية: {$transferNo}";
                $pushBody = "تم تحويل {$cardsCnt} كرت ({$profName}) بقيمة {$totalVal} ر.ي من {$sourceName} إلى {$targetName}.";
                $pushData = [
                    'event_type' => 'stock_transfer',
                    'transfer_no' => $transferNo,
                    'cards_count' => (string)$cardsCnt,
                    'click_action' => 'OPEN_CARDS_SCREEN'
                ];
                if ($targetId > 0) {
                    $this->firebase->sendToAdmin($targetId, $pushTitle, $pushBody, $pushData, 'stock_transfer', $transferNo, $currentAdminId);
                }
                if ($sourceId > 0 && $sourceId !== $targetId) {
                    $this->firebase->sendToAdmin($sourceId, $pushTitle, $pushBody, $pushData, 'stock_transfer', $transferNo, $currentAdminId);
                }
            } catch (Throwable $fe) {}
        }

        return true;
    }

    /**
     * Notify Router Status (Online / Offline)
     */
    public function notifyRouterStatus($routerName, $nasIp, $status, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $settings = $this->getSettings();
        $isOnline = ($status === 'online' || $status === 'up');
        $icon = $isOnline ? '🟢' : '🔴';
        $title = $isOnline ? 'عودة السيرفر / البرج للخدمة' : '⚠️ تنبيه: انقطاع اتصال السيرفر / البرج!';

        $msg = "{$icon} <b>{$title}</b>\n";
        $msg .= "• <b>اسم البرج/السيرفر:</b> {$routerName}\n";
        $msg .= "• <b>عنوان IP:</b> <code>{$nasIp}</code>\n";
        $msg .= "• <b>الحالة:</b> " . ($isOnline ? 'متصل ونشط (Online)' : 'غير متصل (Offline)') . "\n";
        $msg .= "• <b>الوقت:</b> " . date('Y-m-d H:i:s');

        if (!empty($settings['telegram']['notify_routers'])) {
            $this->sendTelegramLog($msg, 'router_alert', $nasIp, $currentAdminId);
        }

        // 3. Firebase Push Notification to Admins / Supervisors
        if (!empty($settings['firebase']['notify_routers']) && !empty($settings['firebase']['enabled'])) {
            try {
                $pushTitle = $isOnline ? "🟢 عودة السيرفر للخدمة: {$routerName}" : "🚨 تنبيه طارئ: انقطاع اتصال {$routerName}!";
                $pushBody = $isOnline 
                    ? "السيرفر/البرج {$routerName} ({$nasIp}) عاد للاتصال والعمل بشكل طبيعي."
                    : "⚠️ انقطع اتصال السيرفر/البرج {$routerName} ({$nasIp}) عن النظام! يرجى التحقق فورا.";
                
                $pushData = [
                    'event_type' => 'router_alert',
                    'nas_ip' => $nasIp,
                    'router_name' => $routerName,
                    'status' => $status,
                    'click_action' => 'OPEN_ROUTERS_SCREEN'
                ];
                $pushOpts = [
                    'channel_id' => 'router_alerts',
                    'sound' => $isOnline ? 'default' : 'alarm',
                    'priority' => 'HIGH'
                ];
                $this->firebase->sendToRole('system_owner', $pushTitle, $pushBody, $pushData, 'router_alert', $nasIp, $currentAdminId);
                $this->firebase->sendToRole('superadmin', $pushTitle, $pushBody, $pushData, 'router_alert', $nasIp, $currentAdminId);
                $this->firebase->sendToRole('supervisor', $pushTitle, $pushBody, $pushData, 'router_alert', $nasIp, $currentAdminId);
            } catch (Throwable $fe) {}
        }

        // WhatsApp admin broadcast if configured
        if (!empty($settings['whatsapp']['notify_routers'])) {
            $adminPhoneStmt = $this->db->prepare("SELECT a.phone FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE r.role_key IN ('system_owner','superadmin') AND a.phone!='' ORDER BY FIELD(r.role_key,'system_owner','superadmin') LIMIT 1");
            $adminPhoneStmt->execute([$networkId]);
            $adminPhone = $adminPhoneStmt ? $adminPhoneStmt->fetchColumn() : null;
            if ($adminPhone) {
                $waMsg = str_replace(['<b>', '</b>', '<code>', '</code>'], ['*', '*', '`', '`'], $msg);
                $this->whatsapp->sendMessage($adminPhone, $waMsg, $nasIp, $currentAdminId);
            }
        }

        return true;
    }

    /**
     * Send Custom Notification / Broadcast from UI
     */

    /**
     * Notify Instant Balance Transfer
     */
    public function notifyInstantBalanceTransfer($transferData, $currentAdminId = 1) {
        $settings = $this->getSettings();
        $networkId=$this->networkId();
        $targetId = (int)($transferData['receiver_admin_id'] ?? ($transferData['target_admin_id'] ?? 0));
        $targetStmt = $this->db->prepare("SELECT a.fullname,a.phone,r.role_key AS role FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE a.id=?");
        $targetStmt->execute([$networkId,$targetId]);
        $target = $targetStmt->fetch(PDO::FETCH_ASSOC);

        $sourceId = (int)($transferData['sender_admin_id'] ?? $currentAdminId);
        $srcStmt = $this->db->prepare("SELECT a.fullname,r.role_key AS role FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE a.id=?");
        $srcStmt->execute([$networkId,$sourceId]);
        $source = $srcStmt->fetch(PDO::FETCH_ASSOC);

        $amount = number_format((float)($transferData['amount'] ?? 0), 2);
        $transferNo = $transferData['transfer_no'] ?? ('IBT-' . time());
        $targetName = $target['fullname'] ?? 'المستفيد';
        $sourceName = $source['fullname'] ?? 'الإدارة';
        $avail = isset($transferData['available']) ? number_format((float)$transferData['available'], 2) : null;
        $notes = trim((string)($transferData['notes'] ?? ''));

        $waMsg = "⚡ *إشعار تحويل رصيد فوري*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "📄 *رقم العملية:* `{$transferNo}`
";
        $waMsg .= "👤 *المستلم:* {$targetName}
";
        $waMsg .= "🏢 *المحول (المصدر):* {$sourceName}
";
        $waMsg .= "💰 *المبلغ المحول:* {$amount} ر.ي
";
        if ($avail !== null) {
            $waMsg .= "📊 *إجمالي رصيدك المتوفر الآن:* {$avail} ر.ي
";
        }
        if (!empty($transferData['expires_at'])) {
            $waMsg .= "⏳ *تاريخ الصلاحية:* {$transferData['expires_at']}
";
        }
        if (!empty($notes)) {
            $waMsg .= "📝 *البيان:* {$notes}
";
        }
        $waMsg .= "📅 *الوقت:* " . date('Y-m-d H:i') . "
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "تمت إضافة الرصيد لحسابكم بنجاح 🌐";

        if (!empty($settings['whatsapp']['notify_transfers']) && !empty($target['phone'])) {
            $this->whatsapp->sendMessage($target['phone'], $waMsg, $transferNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_transfers'])) {
            $tgMsg = "⚡ <b>تحويل رصيد فوري</b>
";
            $tgMsg .= "• <b>رقم العملية:</b> <code>{$transferNo}</code>
";
            $tgMsg .= "• <b>المستلم:</b> {$targetName}
";
            $tgMsg .= "• <b>المحول:</b> {$sourceName}
";
            $tgMsg .= "• <b>المبلغ:</b> {$amount} ر.ي";
            $this->sendTelegramLog($tgMsg, 'instant_balance_transfer', $transferNo, $currentAdminId);
        }

        return true;
    }

    /**
     * Notify Instant Balance Direct Sale Invoice
     */
    public function notifyInstantBalanceSale($invoiceId, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $stmt = $this->db->prepare("
            SELECT i.*, 
                   s.fullname as seller_name, s.phone as seller_phone,
                   b.fullname as buyer_account_name, b.phone as buyer_account_phone
            FROM um_instant_balance_invoices i
            LEFT JOIN um_admins s ON i.seller_id = s.id
            LEFT JOIN um_admins b ON i.buyer_id = b.id
            WHERE i.network_id=? AND i.id = ?
        ");
        $stmt->execute([$networkId,(int)$invoiceId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) return false;

        $settings = $this->getSettings();
        $invoiceNo = $inv['invoice_no'];
        $buyerName = $inv['buyer_name'] ?: ($inv['buyer_account_name'] ?: 'عميل نقدي');
        $targetPhone = !empty($inv['buyer_phone']) ? $inv['buyer_phone'] : ($inv['buyer_account_phone'] ?? '');
        $sellerName = $inv['seller_name'] ?: 'الإدارة';
        $grossFmt = number_format((float)$inv['total_amount'] + (float)$inv['discount_amount'], 2);
        $discFmt = number_format((float)$inv['discount_amount'], 2);
        $totalFmt = number_format((float)$inv['total_amount'], 2);
        $paidFmt = number_format((float)$inv['paid_amount'], 2);
        $remFmt = number_format((float)$inv['remaining_amount'], 2);
        $dateStr = date('Y-m-d H:i', strtotime($inv['created_at']));

        $waMsg = "⚡ *فاتورة مبيعات رصيد فوري*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "📄 *رقم الفاتورة:* `{$invoiceNo}`
";
        $waMsg .= "👤 *العميل / المشتري:* {$buyerName}
";
        $waMsg .= "🏪 *البائع:* {$sellerName}
";
        $waMsg .= "💰 *مبلغ الرصيد:* {$grossFmt} ر.ي
";
        if ((float)$inv['discount_amount'] > 0) {
            $waMsg .= "🏷️ *الخصم الممنوح:* {$discFmt} ر.ي
";
        }
        $waMsg .= "💵 *الإجمالي الصافي:* {$totalFmt} ر.ي
";
        $waMsg .= "💳 *المدفوع:* {$paidFmt} ر.ي
";
        if ((float)$inv['remaining_amount'] > 0) {
            $waMsg .= "⏳ *المتبقي الآجل:* {$remFmt} ر.ي
";
        }
        $waMsg .= "📅 *التاريخ:* {$dateStr}
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "شكراً لتعاملكم معنا! 🌐";

        if (!empty($settings['whatsapp']['notify_sales']) && !empty($targetPhone)) {
            $this->whatsapp->sendMessage($targetPhone, $waMsg, $invoiceNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_sales'])) {
            $tgMsg = "⚡ <b>فاتورة مبيعات رصيد فوري</b>
";
            $tgMsg .= "• <b>رقم الفاتورة:</b> <code>{$invoiceNo}</code>
";
            $tgMsg .= "• <b>المشتري:</b> {$buyerName}
";
            $tgMsg .= "• <b>المبلغ:</b> {$totalFmt} ر.ي
";
            $tgMsg .= "• <b>التاريخ:</b> {$dateStr}";
            $this->sendTelegramLog($tgMsg, 'instant_balance_sale', $invoiceNo, $currentAdminId);
        }

        return true;
    }

    /**
     * Notify Digital Voucher (Instant Voucher Creation & Delivery)
     */
    public function notifyDigitalVoucher($invoiceId, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $q = $this->db->prepare("
            SELECT v.*, i.invoice_no, i.paid_amount, i.remaining_amount, i.payment_type, i.created_at,
                   s.fullname as seller_name, b.phone as buyer_account_phone
            FROM um_vouchers_meta v
            JOIN um_sales_invoices i ON i.network_id=v.network_id AND i.id = v.invoice_id
            LEFT JOIN um_admins s ON i.seller_id = s.id
            LEFT JOIN um_admins b ON i.buyer_id = b.id
            WHERE i.network_id=? AND i.id = ? AND i.sale_kind = 'digital_voucher'
            LIMIT 1
        ");
        $q->execute([$networkId,(int)$invoiceId]);
        $v = $q->fetch(PDO::FETCH_ASSOC);
        if (!$v) return false;

        $targetPhone = !empty($v['buyer_phone']) ? $v['buyer_phone'] : ($v['buyer_account_phone'] ?? '');
        if (empty($targetPhone)) return false;

        $passwordLine = ($v['login_password_mode'] ?? 'blank') === 'blank' ? "🔓 *كلمة المرور:* فارغة" : "🔑 *كلمة المرور:* `{$v['username']}`";
        $priceFmt = number_format((float)$v['sale_price'], 2);

        $waMsg = "🏢 *كرت إنترنت مدفوع (فوري)*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "🎫 *رقم الكرت:* `{$v['username']}`
";
        $waMsg .= "{$passwordLine}
";
        $waMsg .= "📦 *الباقة:* {$v['profile_name']}
";
        $waMsg .= "💰 *سعر البيع:* {$priceFmt} ر.ي
";
        $waMsg .= "⏳ *الصلاحية:* {$v['validity']}
";
        $waMsg .= "📄 *رقم الفاتورة:* `{$v['invoice_no']}`
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "شكراً لاستخدامكم خدمتنا 🌐";

        $res = $this->whatsapp->sendMessage($targetPhone, $waMsg, 'digital_voucher_' . $invoiceId, $currentAdminId);
        $sent = !empty($res['success']);
        $error = $res['error'] ?? null;

        $this->db->prepare('UPDATE um_vouchers_meta SET delivery_status = ?, delivered_at = ? WHERE network_id=? AND invoice_id = ?')
                 ->execute([$sent ? 'sent' : 'failed', $sent ? date('Y-m-d H:i:s') : null,$networkId,$invoiceId]);

        return $res;
    }

    /**
     * Notify Sales Return / Refund
     */
    public function notifySaleReturn($returnData, $currentAdminId = 1) {
        $settings = $this->getSettings();
        $invoiceNo = $returnData['invoice_no'] ?? '';
        $buyerPhone = $returnData['buyer_phone'] ?? '';
        $buyerName = $returnData['buyer_name'] ?? 'العميل';
        $refundAmount = number_format((float)($returnData['refund_amount'] ?? 0), 2);
        $method = $returnData['refund_method'] ?? 'تسوية';

        $methodLabel = match($method) {
            'cash_refund' => 'استرداد نقدي (كاش)',
            'deduct_debt' => 'تخفيض المديونية الآجلة',
            'credit_balance' => 'إيداع رصيد بالحساب',
            default => 'تسوية مالية'
        };

        $waMsg = "↩️ *إشعار مرتجع مبيعات*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "📄 *رقم الفاتورة المرجعية:* `{$invoiceNo}`
";
        $waMsg .= "👤 *العميل:* {$buyerName}
";
        $waMsg .= "💰 *قيمة المرتجع:* {$refundAmount} ر.ي
";
        $waMsg .= "💳 *طريقة التسوية:* {$methodLabel}
";
        if (!empty($returnData['reason'])) {
            $waMsg .= "📝 *سبب الإرجاع:* {$returnData['reason']}
";
        }
        $waMsg .= "📅 *التاريخ:* " . date('Y-m-d H:i') . "
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "تمت معالجة المرتجع وتسوية الحساب بنجاح 🌐";

        if (!empty($settings['whatsapp']['notify_sales']) && !empty($buyerPhone)) {
            $this->whatsapp->sendMessage($buyerPhone, $waMsg, 'RET-' . $invoiceNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_sales'])) {
            $tgMsg = "↩️ <b>مرتجع مبيعات</b>
";
            $tgMsg .= "• <b>الفاتورة:</b> <code>{$invoiceNo}</code>
";
            $tgMsg .= "• <b>العميل:</b> {$buyerName}
";
            $tgMsg .= "• <b>القيمة:</b> {$refundAmount} ر.ي
";
            $tgMsg .= "• <b>التسوية:</b> {$methodLabel}";
            $this->sendTelegramLog($tgMsg, 'sale_return', 'RET-' . $invoiceNo, $currentAdminId);
        }

        return true;
    }


    /**
     * Notify Purchase Invoice
     */
    public function notifyPurchaseInvoice($invoiceData, $currentAdminId = 1) {
        $settings = $this->getSettings();
        $supplierName = $invoiceData['supplier_name'] ?? 'المورد';
        $supplierPhone = $invoiceData['supplier_phone'] ?? '';
        $invNo = $invoiceData['invoice_no'] ?? '';
        $total = number_format((float)($invoiceData['total_amount'] ?? 0), 2);
        $paid = number_format((float)($invoiceData['paid_amount'] ?? 0), 2);
        $rem = number_format((float)($invoiceData['remaining_amount'] ?? 0), 2);
        $itemsCount = (int)($invoiceData['items_count'] ?? 1);

        $waMsg = "🛒 *إشعار تسجيل فاتورة مشتريات*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "📄 *رقم الفاتورة:* `{$invNo}`
";
        $waMsg .= "🏢 *المورد:* {$supplierName}
";
        $waMsg .= "📦 *عدد البنود:* {$itemsCount}
";
        $waMsg .= "💰 *إجمالي الفاتورة:* {$total} ر.ي
";
        $waMsg .= "💵 *المسدد نقدًا:* {$paid} ر.ي
";
        if ((float)($invoiceData['remaining_amount'] ?? 0) > 0) {
            $waMsg .= "⏳ *المتبقي الآجل:* {$rem} ر.ي
";
        }
        $waMsg .= "📅 *التاريخ:* " . date('Y-m-d H:i') . "
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "تم قيد الفاتورة في الحسابات بنجاح 🌐";

        if (!empty($settings['whatsapp']['notify_sales']) && !empty($supplierPhone)) {
            $this->whatsapp->sendMessage($supplierPhone, $waMsg, $invNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_sales'])) {
            $tgMsg = "🛒 <b>فاتورة مشتريات جديدة</b>
";
            $tgMsg .= "• <b>رقم الفاتورة:</b> <code>{$invNo}</code>
";
            $tgMsg .= "• <b>المورد:</b> {$supplierName}
";
            $tgMsg .= "• <b>الإجمالي:</b> {$total} ر.ي";
            $this->sendTelegramLog($tgMsg, 'purchase_invoice', $invNo, $currentAdminId);
        }

        return true;
    }

    /**
     * Notify Supplier Payment
     */
    public function notifySupplierPayment($payData, $currentAdminId = 1) {
        $settings = $this->getSettings();
        $supplierName = $payData['supplier_name'] ?? 'المورد';
        $supplierPhone = $payData['supplier_phone'] ?? '';
        $payNo = $payData['payment_no'] ?? '';
        $amount = number_format((float)($payData['amount'] ?? 0), 2);
        $currentBalance = isset($payData['current_balance']) ? number_format((float)$payData['current_balance'], 2) : null;

        $waMsg = "📤 *إشعار سند صرف / سداد مورد*
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "📄 *رقم السند:* `{$payNo}`
";
        $waMsg .= "🏢 *المورد:* {$supplierName}
";
        $waMsg .= "💰 *المبلغ المسدد:* {$amount} ر.ي
";
        if ($currentBalance !== null) {
            $waMsg .= "📊 *رصيد حسابكم المتبقي:* {$currentBalance} ر.ي
";
        }
        if (!empty($payData['notes'])) {
            $waMsg .= "📝 *البيان:* {$payData['notes']}
";
        }
        $waMsg .= "📅 *التاريخ:* " . date('Y-m-d H:i') . "
";
        $waMsg .= "━━━━━━━━━━━━━━━━━━
";
        $waMsg .= "تم تسجيل السند وخصم المبلغ من الحسابات 🌐";

        if (!empty($settings['whatsapp']['notify_receipts']) && !empty($supplierPhone)) {
            $this->whatsapp->sendMessage($supplierPhone, $waMsg, $payNo, $currentAdminId);
        }

        if (!empty($settings['telegram']['notify_receipts'])) {
            $tgMsg = "📤 <b>سداد مورد / سند صرف</b>
";
            $tgMsg .= "• <b>رقم السند:</b> <code>{$payNo}</code>
";
            $tgMsg .= "• <b>المورد:</b> {$supplierName}
";
            $tgMsg .= "• <b>المبلغ:</b> {$amount} ر.ي";
            $this->sendTelegramLog($tgMsg, 'supplier_payment', $payNo, $currentAdminId);
        }

        return true;
    }

    public function sendCustomMessage($data, $currentAdminId = 1) {
        $networkId=$this->networkId();
        $channel = $data['channel'] ?? 'whatsapp';
        $recipientType = $data['recipient_type'] ?? 'custom';
        $message = trim($data['message'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $adminId = !empty($data['admin_id']) ? (int)$data['admin_id'] : null;

        if (empty($message)) {
            throw new Exception('نص الرسالة مطلوب');
        }

        if ($recipientType === 'admin' && $adminId) {
            $admStmt = $this->db->prepare("SELECT a.fullname,a.phone FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 WHERE a.id=?");
            $admStmt->execute([$networkId,$adminId]);
            $adm = $admStmt->fetch(PDO::FETCH_ASSOC);
            if (!$adm) throw new Exception('المستخدم المحدد غير موجود');
            $phone = $adm['phone'];
            $recipientName = $adm['fullname'];
        } else {
            $recipientName = $data['recipient_name'] ?? $phone;
        }

        $results = [];

        if ($channel === 'whatsapp' || $channel === 'all') {
            if (empty($phone)) throw new Exception('رقم الهاتف مطلوب للإرسال عبر واتساب');
            $waRes = $this->whatsapp->sendMessage($phone, $message, 'custom_' . time(), $currentAdminId);
            $results['whatsapp'] = $waRes;
        }

        if ($channel === 'telegram' || $channel === 'all') {
            $chatId = trim($data['chat_id'] ?? '');
            $tgRes = $this->sendTelegramLog($message, 'custom_message', 'custom_' . time(), $currentAdminId, $chatId);
            $results['telegram'] = $tgRes;
        }

        if ($channel === 'fcm' || $channel === 'push' || $channel === 'all') {
            $pushTitle = trim($data['title'] ?? '🔔 إشعار من الإدارة');
            $pushData = ['event_type' => 'custom_broadcast', 'click_action' => 'OPEN_NOTIFICATIONS'];
            if ($recipientType === 'admin' && $adminId) {
                $fcmRes = $this->firebase->sendToAdmin($adminId, $pushTitle, $message, $pushData, 'custom_push', 'custom_' . time(), $currentAdminId);
            } else {
                $fcmRes = $this->firebase->broadcast($pushTitle, $message, $pushData, 'custom_push', 'custom_' . time(), $currentAdminId);
            }
            $results['fcm'] = $fcmRes;
        }

        return [
            'success' => true,
            'message' => 'تم إرسال الرسالة بنجاح',
            'results' => $results
        ];
    }

    private function sendTelegramLog($messageHtml, $eventType, $refId = null, $createdBy = null, $customChatId = null) {
        $settings = $this->telegram->getSettings();
        $token = $settings['bot_token'];
        $chatId = $customChatId ?: $settings['chat_id'];

        if (empty($token) || empty($chatId)) {
            return ['success' => false, 'error' => 'إعدادات تليجرام غير مكتملة'];
        }

        $url = "https://api.telegram.org/bot{$token}/sendMessage";
        $payload = [
            'chat_id' => $chatId,
            'text' => $messageHtml,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true
        ];

        try {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $res = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $result = json_decode($res, true) ?: [];
            $isSent = ($httpCode === 200 && !empty($result['ok']));
            $status = $isSent ? 'sent' : 'failed';
            $errMsg = $isSent ? null : ($result['description'] ?? "HTTP Code $httpCode");

            $stmt = $this->db->prepare("
                INSERT INTO um_notification_logs 
                (network_id,channel, event_type, recipient_chat_id, message_text, status, error_message, reference_id, created_by)
                VALUES (?,'telegram', ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$this->networkId(),$eventType, $chatId, $messageHtml, $status, $errMsg, $refId, $createdBy]);

            return ['success' => $isSent, 'error' => $errMsg];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
