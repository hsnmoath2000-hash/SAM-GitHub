<?php
declare(strict_types=1);

require_once __DIR__ . '/MessageQueueManager.php';

class InteractiveChatbotEngine {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function handleIncomingMessage(string $fromPhone, string $incomingText): string {
        $cleanPhone = preg_replace('/[^0-9]/', '', $fromPhone);
        $text = trim(mb_strtolower($incomingText, 'UTF-8'));

        $session = $this->getOrCreateSession($cleanPhone);
        if ($session['status'] === 'human_support') {
            if (in_array($text, ['إنهاء', 'انهاء', 'exit', 'خروج'], true)) {
                $this->updateSessionStatus($cleanPhone, 'bot');
                return "🤖 تم إنهاء المحادثة مع الدعم الفني وإعادتك للرد الآلي. كيف يمكنني مساعدتك الآن؟";
            }
            return ""; 
        }

        switch ($text) {
            case 'رصيدي':
            case 'الرصيد':
            case 'حسابي':
                return $this->queryCustomerBalance($cleanPhone);

            case 'فاتورة':
            case 'فواتيري':
            case 'الفاتورة':
                return $this->queryLastInvoiceDetails($cleanPhone);

            case 'تفعيل':
            case 'كرت':
            case 'باقات':
                return "💳 *تفعيل وشحن الكروت:*\nلتفعيل كرت جديد أرسل: (تفعيل * رقم الكرت).\n\n📱 *الباقات المتاحة:*\n• باقة 1000 ريال (10 جيجا - 7 أيام)\n• باقة 2000 ريال (25 جيجا - 30 يوم)";

            case 'دعم':
            case 'مواجه مشكلة':
            case 'تحدث مع موظف':
            case 'موظف':
                $this->updateSessionStatus($cleanPhone, 'human_support');
                $this->notifySupportTeam($cleanPhone);
                return "👨‍💻 *تم تحويل محادثتك الآن إلى قسم الدعم الفني البشري.*\nسيتواصل معك أحد الموظفين في أقرب وقت.\n(لإغلاق المحادثة وإعادة البوت أرسل كلمة: *إنهاء*)";

            default:
                if (str_starts_with($text, 'تفعيل*')) {
                    $cardPin = trim(str_replace('تفعيل*', '', $text));
                    return "🔄 جاري فحص ومعالجة الكرت رقم ({$cardPin})... يرجى الانتظار.";
                }
                return "أهلاً بك في نظام الخدمة الآلية للشبكة. يرجى اختيار أحد الخيارات بكتابة الكلمة:\n\n 🟢 *(رصيدي)* - لمعرفة رصيدك المالي الحالي.\n 🧾 *(فاتورة)* - لاستعراض تفاصيل آخر فاتورة.\n 💳 *(كرت)* - لمعرفة طريقة شحن الكروت الباقات.\n 🛠️ *(دعم)* - للتحدث مباشرة مع الدعم الفني البشري.";
        }
    }

    private function queryCustomerBalance(string $phone): string {
        $stmt = $this->db->prepare("SELECT COALESCE(fullname, username) as name, balance FROM um_admins WHERE phone LIKE ? OR phone LIKE ? LIMIT 1");
        $likePhone = '%' . substr($phone, -9);
        $stmt->execute([$likePhone, $likePhone]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return "⚠️ رقم هاتفك هذا غير مسجل كعميل أو موزع في النظام.";
        }

        $bal = (float)$user['balance'];
        $statusText = $bal >= 0 ? "مدين (مطلوب منك): " . number_format($bal, 2) : "دائن (لك): " . number_format(abs($bal), 2);
        return "👤 *الأخ:* {$user['name']}\n📊 *رصيد حسابكم الحالي في النظام:* {$statusText} ريال.";
    }

    private function queryLastInvoiceDetails(string $phone): string {
        $stmt = $this->db->prepare("
            SELECT si.* 
            FROM um_sales_invoices si
            JOIN um_admins a ON si.buyer_id = a.id
            WHERE a.phone LIKE ?
            ORDER BY si.id DESC LIMIT 1
        ");
        $likePhone = '%' . substr($phone, -9);
        $stmt->execute([$likePhone]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            return "لا توجد فواتير مبيعات مسجلة برقم هاتفك مؤخراً.";
        }

        return "🧾 *تفاصيل آخر فاتورة مبيعات:*\n• *رقم الفاتورة:* {$inv['invoice_no']}\n• *الإجمالي:* " . number_format((float)$inv['total_amount'], 2) . " ر.ي\n• *المسدد:* " . number_format((float)$inv['paid_amount'], 2) . " ر.ي\n• *المتبقي:* " . number_format((float)$inv['remaining_amount'], 2) . " ر.ي\n• *التاريخ:* {$inv['created_at']}";
    }

    private function getOrCreateSession(string $phone): array {
        $stmt = $this->db->prepare("SELECT * FROM um_chatbot_sessions WHERE phone = ? LIMIT 1");
        $stmt->execute([$phone]);
        $session = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$session) {
            $this->db->prepare("INSERT INTO um_chatbot_sessions (phone, status) VALUES (?, 'bot')")->execute([$phone]);
            return ['phone' => $phone, 'status' => 'bot'];
        }

        return $session;
    }

    private function updateSessionStatus(string $phone, string $status): void {
        $stmt = $this->db->prepare("UPDATE um_chatbot_sessions SET status = ? WHERE phone = ?");
        $stmt->execute([$status, $phone]);
    }

    private function notifySupportTeam(string $customerPhone): void {
        $queue = new MessageQueueManager($this->db);
        $queue->enqueue('system', 'support_request', '967770000000', 'فريق الدعم', "🔔 *طلب دعم بشري جديد*\nالعميل صاحب الرقم: {$customerPhone} طلب التحدث مع موظف.");
    }
}
