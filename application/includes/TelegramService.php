<?php
declare(strict_types=1);

require_once __DIR__ . '/NetworkChannelService.php';

class TelegramService {
    private PDO $db;
    private NetworkChannelService $channels;
    private int $networkId;

    public function __construct(PDO $db, int $networkId = 0) {
        $this->db = $db;
        $this->channels = new NetworkChannelService($db);
        // Never silently route a notification to network 1.  A caller must
        // provide an explicit tenant or have an authenticated active context.
        $this->networkId = $this->channels->normalizeNetworkId($networkId);
    }

    public function getNetworkId(): int { return $this->networkId; }

    public function getSettings(int $networkId = 0): array {
        $networkId = $this->channels->normalizeNetworkId($networkId > 0 ? $networkId : $this->networkId);
        if ($networkId !== $this->networkId) throw new DomainException('FORBIDDEN_NETWORK');
        $channel = $this->channels->getChannel($networkId, 'telegram');
        $network = $this->channels->getNotificationSettings($networkId);
        return [
            'network_id' => $networkId,
            'bot_token' => $channel['bot_token'] ?? '',
            'chat_id' => $channel['chat_id'] ?? '',
            'config_json' => $channel['config_json'] ?? [],
            'enabled' => !empty($channel['is_enabled']) && !empty($network['telegram_enabled']),
            'status' => $channel['status'] ?? 'NOT_CONFIGURED',
            'notify_journals' => true,
            'notify_orders' => true,
            'notify_sales' => !empty($network['notify_sales']),
            'notify_receipts' => !empty($network['notify_receipts']),
            'notify_vouchers' => true,
            'notify_expenses' => !empty($network['notify_finance']),
            'notify_transfers' => !empty($network['notify_transfers']),
            'notify_routers' => !empty($network['notify_routers']),
            'notify_low_stock' => !empty($network['notify_inventory'])
        ];
    }

    public function saveSettings($data, int $networkId = 0): array {
        $networkId = $this->channels->normalizeNetworkId($networkId > 0 ? $networkId : $this->networkId);
        if ($networkId !== $this->networkId) throw new DomainException('FORBIDDEN_NETWORK');
        $channelData = [
            // Secret is optional; when omitted NetworkChannelService preserves the existing value.
            'label' => $data['label'] ?? 'Telegram Network Bot',
            'status' => $data['status'] ?? 'CONFIGURED'
        ];
        $enabledProvided = array_key_exists('enabled', $data) || array_key_exists('telegram_enabled', $data);
        $enabled = array_key_exists('enabled', $data) ? !empty($data['enabled']) : !empty($data['telegram_enabled']);
        if ($enabledProvided) $channelData['is_enabled'] = $enabled;
        $token = trim((string)($data['bot_token'] ?? $data['telegram_bot_token'] ?? ''));
        $chatId = trim((string)($data['chat_id'] ?? $data['telegram_chat_id'] ?? ''));
        if ($token !== '') $channelData['bot_token'] = $token;
        elseif (!empty($data['clear_bot_token'])) $channelData['bot_token'] = '';
        if ($chatId !== '') $channelData['chat_id'] = $chatId;
        elseif (!empty($data['clear_chat_id'])) $channelData['chat_id'] = '';
        if (array_key_exists('webhook_secret', $data) || array_key_exists('telegram_webhook_secret', $data)) {
            $channelData['webhook_secret'] = $data['webhook_secret'] ?? $data['telegram_webhook_secret'];
        }
        $result = $this->channels->saveChannel($networkId, 'telegram', $channelData, (int)($_SESSION['admin_id'] ?? 0));
        $notificationChanges = [];
        if ($enabledProvided) $notificationChanges['telegram_enabled'] = $enabled;
        foreach ([
            'notify_sales' => ['notify_sales', 'telegram_notify_sales'],
            'notify_receipts' => ['notify_receipts', 'telegram_notify_receipts'],
            'notify_transfers' => ['notify_transfers', 'telegram_notify_transfers'],
            'notify_routers' => ['notify_routers', 'telegram_notify_routers'],
            'notify_inventory' => ['notify_low_stock', 'telegram_notify_low_stock'],
            'notify_finance' => ['notify_expenses', 'telegram_notify_expenses']
        ] as $settingKey => $inputKeys) {
            foreach ($inputKeys as $inputKey) {
                if (!array_key_exists($inputKey, $data)) continue;
                $notificationChanges[$settingKey] = !empty($data[$inputKey]);
                break;
            }
        }
        $this->channels->saveNotificationSettings($networkId, $notificationChanges, (int)($_SESSION['admin_id'] ?? 0));
        return array_merge($result, ['message' => 'تم حفظ إعدادات بوت تليجرام للشبكة بنجاح']);
    }

    public function sendMessage($text, $customChatId = null, string $parseMode = 'HTML', ?string $eventType = null, ?string $referenceId = null, ?int $createdBy = null): array {
        $settings = $this->getSettings();
        $token = (string)($settings['bot_token'] ?? '');
        $chatId = $customChatId ?: ($settings['chat_id'] ?? '');
        if (empty($settings['enabled'])) return ['success' => false, 'error' => 'بوت تليجرام غير مفعّل لهذه الشبكة'];
        if ($token === '' || $chatId === '') return ['success' => false, 'error' => 'إعدادات تليجرام غير مكتملة لهذه الشبكة'];
        $url = 'https://api.telegram.org/bot' . urlencode($token) . '/sendMessage';
        $payload = ['chat_id'=>$chatId,'text'=>$text,'parse_mode'=>$parseMode,'disable_web_page_preview'=>true];
        $ch = curl_init($url);
        curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query($payload),CURLOPT_TIMEOUT=>8,CURLOPT_SSL_VERIFYPEER=>true]);
        $res = curl_exec($ch); $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); $err=curl_error($ch); curl_close($ch);
        $json=json_decode((string)$res,true) ?: [];
        if ($http===200 && !empty($json['ok'])) {
            if ($eventType !== null) $this->logNotification($eventType, (string)$chatId, (string)$text, 'sent', null, $referenceId, $createdBy);
            return ['success'=>true,'network_id'=>$this->networkId,'message'=>'تم إرسال الإشعار بنجاح'];
        }
        $error = 'فشل إرسال الإشعار إلى تليجرام: '.($json['description'] ?? ($err ?: "HTTP Code {$http}"));
        if ($eventType !== null) $this->logNotification($eventType, (string)$chatId, (string)$text, 'failed', $error, $referenceId, $createdBy);
        return ['success'=>false,'network_id'=>$this->networkId,'error'=>$error];
    }

    public function testAlert(): array {
        $message = "🤖 <b>فحص اتصال بوت تليجرام</b>\n📡 الشبكة: {$this->networkId}\n📅 " . date('Y-m-d H:i:s');
        return $this->sendMessage(
            $message,
            null,
            'HTML',
            'channel_test',
            'telegram_test:' . $this->networkId . ':' . date('YmdHis'),
            (int)($_SESSION['admin_id'] ?? 0)
        );
    }

    public function setWebhook(string $url, ?string $secretToken = null): array {
        $settings=$this->getSettings(); $token=(string)($settings['bot_token']??'');
        if($token==='') return ['success'=>false,'error'=>'TELEGRAM_BOT_NOT_CONFIGURED'];
        $payload=['url'=>$url]; if($secretToken) $payload['secret_token']=$secretToken;
        $ch=curl_init('https://api.telegram.org/bot'.urlencode($token).'/setWebhook');
        curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query($payload),CURLOPT_TIMEOUT=>8,CURLOPT_SSL_VERIFYPEER=>true]);
        $res=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);$json=json_decode((string)$res,true)?:[];
        if ($http===200 && !empty($json['ok'])) {
            // Keep the URL per network so the UI can show the active tenant's
            // endpoint after a refresh.  The secret itself remains encrypted
            // in um_network_channels by NetworkChannelService.
            $current = $this->channels->getChannel($this->networkId, 'telegram');
            $config = $current['config_json'] ?? [];
            if (is_string($config)) $config = json_decode($config, true) ?: [];
            $config['webhook_url'] = $url;
            $channelData = [
                'config' => $config,
                'status' => 'WEBHOOK_SET',
                'enabled' => !empty($current['is_enabled'])
            ];
            if ($secretToken !== null && $secretToken !== '') $channelData['webhook_secret'] = $secretToken;
            $this->channels->saveChannel($this->networkId, 'telegram', $channelData, (int)($_SESSION['admin_id'] ?? 0));
            return ['success'=>true,'network_id'=>$this->networkId,'webhook_url'=>$url];
        }
        return ['success'=>false,'error'=>$json['description']??"HTTP Code {$http}"];
    }

    private function logNotification(string $eventType, string $recipient, string $message, string $status, ?string $error, ?string $referenceId, ?int $createdBy): void {
        try {
            $stmt = $this->db->prepare("INSERT INTO um_notification_logs (network_id,channel,event_type,recipient_phone,message_text,status,error_message,reference_id,created_by,created_at) VALUES (?,'telegram',?,?,?,?,?,?,?,NOW())");
            $stmt->execute([$this->networkId, $eventType, $recipient, $message, $status, $error, $referenceId, $createdBy]);
        } catch (Throwable $e) {
            error_log('Telegram notification log write failed for network ' . $this->networkId . ': ' . $e->getMessage());
        }
    }

    /**
     * Notify New Double-Entry Journal Entry
     */
    public function notifyJournalEntry(array $data, array $lines, $adminId = 1) {
        $settings = $this->getSettings();
        if (!$settings['enabled']) return;

        $entryNo = $data['entry_no'] ?? 'JV';
        $desc = $data['description'] ?? 'قيد محاسبي آلي';
        $amount = number_format((float)($data['total_debit'] ?? 0), 2);
        $date = $data['entry_date'] ?? date('Y-m-d');
        $module = $data['source_module'] ?? 'عام';

        $moduleLabels = [
            'payment' => 'سند صرف / نفقات',
            'receipt' => 'سند قبض / إيداع',
            'sales' => 'مبيعات كروت جملة',
            'instant_balance' => 'شحن ورصيد فوري',
            'manual' => 'قيد تسوية يدوي',
            'purchase' => 'فاتورة مشتريات',
            'payroll' => 'رواتب وأجور'
        ];
        $moduleLabel = $moduleLabels[$module] ?? $module;

        $creator = $this->getAdminName($adminId);

        $msg = "⚖️ <b>قيد محاسبي جديد [{$entryNo}]</b>\n";
        $msg .= "━━━━━━━━━━━━━━━━━━\n";
        $msg .= "📝 <b>البيان:</b> {$desc}\n";
        $msg .= "💰 <b>إجمالي القيد:</b> <b>{$amount} YER</b>\n";
        $msg .= "📂 <b>المصدر:</b> {$moduleLabel}\n";
        $msg .= "👤 <b>المحرر:</b> {$creator}\n";
        $msg .= "📅 <b>التاريخ:</b> {$date} " . date('H:i') . "\n";
        $msg .= "━━━━━━━━━━━━━━━━━━\n";
        $msg .= "📊 <b>أطراف القيد:</b>\n";

        foreach ($lines as $ln) {
            $accName = $ln['account_name'] ?? ('حساب #' . ($ln['account_id'] ?? ''));
            $accCode = $ln['account_code'] ?? '';
            $d = (float)($ln['debit'] ?? 0);
            $c = (float)($ln['credit'] ?? 0);
            if ($d > 0) {
                $msg .= "• 🟢 <b>مدين (Dr):</b> [{$accCode}] {$accName} | " . number_format($d, 2) . " YER\n";
            }
            if ($c > 0) {
                $msg .= "• 🔴 <b>دائن (Cr):</b> [{$accCode}] {$accName} | " . number_format($c, 2) . " YER\n";
            }
        }
        $msg .= "━━━━━━━━━━━━━━━━━━\n";
        $msg .= "🌐 <i>SAM User Manager Accounting</i>";

        $this->sendMessage($msg);
    }

    /**
     * Notify Direct Operating Expense Voucher
     */
    public function notifyOperatingExpense(array $data, $adminId = 1) {
        $settings = $this->getSettings();
        if (!$settings['enabled']) return;

        $no = $data['payment_no'] ?? $data['voucher_no'] ?? 'VOP';
        $type = $data['expense_type'] ?? 'مصروف';
        $title = $data['title'] ?? '';
        $beneficiary = $data['beneficiary'] ?? '';
        $amount = number_format((float)($data['amount'] ?? 0), 2);
        $creator = $this->getAdminName($adminId);
        $mode = $data['payment_mode'] ?? 'admin_funding';

        $modeLabel = ($mode === 'admin_funding') ? '👤 تمويل شخصي من حساب المشرف (تغذية الصندوق ثم الصرف)' : '💵 صرف مباشر من رصيد الصندوق';

        $msg = "💳 <b>سند صرف تشغيلي جديد [{$no}]</b>\n";
        $msg .= "━━━━━━━━━━━━━━━━━━\n";
        $msg .= "🏷️ <b>النوع:</b> {$type}\n";
        $msg .= "📝 <b>البيان:</b> {$title}\n";
        if (!empty($beneficiary)) {
            $msg .= "👤 <b>المدفوع له:</b> {$beneficiary}\n";
        }
        $msg .= "💰 <b>المبلغ الصافي:</b> <b>{$amount} YER</b>\n";
        $msg .= "💼 <b>طريقة التمويل:</b> {$modeLabel}\n";
        $msg .= "👤 <b>المحرر:</b> {$creator}\n";
        $msg .= "📅 <b>التاريخ:</b> " . date('Y-m-d H:i') . "\n";
        $msg .= "━━━━━━━━━━━━━━━━━━";

        $this->sendMessage($msg);
    }

    /**
     * Notify Financial Voucher (Receipt / Payment)
     */
    public function notifyFinancialVoucher(array $data, $adminId = 1) {
        $settings = $this->getSettings();
        if (!$settings['enabled']) return;

        $vType = $data['voucher_type'] ?? $data['type'] ?? 'receipt';
        $isReceipt = ($vType === 'receipt');
        $no = $data['voucher_no'] ?? 'VCH';
        $party = $data['party_name'] ?? 'طرف مالي';
        $amount = number_format((float)($data['amount'] ?? 0), 2);
        $category = $data['category'] ?? 'عام';
        $method = $data['payment_method'] ?? 'cash';
        $notes = $data['notes'] ?? '';
        $creator = $this->getAdminName($adminId);

        $icon = $isReceipt ? '💵' : '💳';
        $title = $isReceipt ? 'سند قبض نقدية / توريد' : 'سند صرف مالي';

        $msg = "{$icon} <b>{$title} [{$no}]</b>\n";
        $msg .= "━━━━━━━━━━━━━━━━━━\n";
        $msg .= "👤 <b>الطرف / المستفيد:</b> {$party}\n";
        $msg .= "💰 <b>المبلغ:</b> <b>{$amount} YER</b>\n";
        $msg .= "🏷️ <b>التصنيف:</b> {$category}\n";
        $msg .= "💳 <b>طريقة الدفع:</b> {$method}\n";
        if (!empty($notes)) {
            $msg .= "📝 <b>البيان:</b> {$notes}\n";
        }
        $msg .= "👤 <b>المحرر:</b> {$creator}\n";
        $msg .= "📅 <b>التاريخ:</b> " . date('Y-m-d H:i') . "\n";
        $msg .= "━━━━━━━━━━━━━━━━━━";

        $this->sendMessage($msg);
    }

    private function getAdminName($adminId) {
        if (!$adminId) return 'النظام';
        $stmt = $this->db->prepare("SELECT COALESCE(NULLIF(fullname, ''), username) FROM um_admins WHERE id = ?");
        $stmt->execute([(int)$adminId]);
        return $stmt->fetchColumn() ?: ('المستخدم #' . $adminId);
    }
}
