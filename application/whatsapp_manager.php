<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/WhatsAppTemplateEngine.php';
require_once __DIR__ . '/includes/MessageQueueManager.php';
require_once __DIR__ . '/includes/ChatbotService.php';
require_once __DIR__ . '/includes/WhatsAppService.php';

// 🔒 حماية الشاشة واشتراط تسجيل الدخول المحمي من داخل النظام
requireAuth();

try {
    $db = getDB();
    $templateEngine = new WhatsAppTemplateEngine($db);
    $queueManager = new MessageQueueManager($db);
    $chatbotService = new ChatbotService($db);
    $waService = new WhatsAppService($db);
} catch (Exception $e) {
    die("فشل الاتصال بقاعدة البيانات: " . $e->getMessage());
}

$toastMessage = null;
$activeTab = $_GET['tab'] ?? 'queue';
$statusFilter = $_GET['status'] ?? 'all';

// معالجة الأوامر من الشاشة الداخليّة (اعتماد / تعديل / إلغاء / إعادة إرسال / إضافة قالب / حفظ قالب / حفظ إعدادات البوت / قواعد البوت)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = (string)$_POST['action'];

    // 1. معالجة رسائل طابور الانتظار وإعادة الإرسال
    if (in_array($action, ['approve', 'cancel', 'edit_approve', 'retry'], true)) {
        $queueId = (int)($_POST['queue_id'] ?? 0);
        if ($queueId > 0) {
            if ($action === 'approve') {
                $queueManager->approveMessage($queueId);
                $queueManager->dispatchApprovedQueue($waService, 10);
                $toastMessage = ['type' => 'success', 'text' => 'تم اعتماد الرسالة وإرسالها عبر الواتساب فوراً!'];
            } 
            elseif ($action === 'cancel') {
                $queueManager->cancelMessage($queueId);
                $toastMessage = ['type' => 'warning', 'text' => 'تم إلغاء إرسال الرسالة بنجاح.'];
            } 
            elseif ($action === 'retry') {
                $queueManager->retryMessage($queueId);
                $queueManager->dispatchApprovedQueue($waService, 10);
                $toastMessage = ['type' => 'info', 'text' => 'تمت إعادة إرسال الرسالة بنجاح عبر الواتساب!'];
            }
            elseif ($action === 'edit_approve' && isset($_POST['message_text'])) {
                $newText = trim((string)$_POST['message_text']);
                $queueManager->updateAndApprove($queueId, $newText);
                $queueManager->dispatchApprovedQueue($waService, 10);
                $toastMessage = ['type' => 'success', 'text' => 'تم حفظ التعديلات وإرسال الرسالة عبر الواتساب!'];
            }
        }
    }

    // 2. اعتماد كافة الرسائل المعلقة دفعة واحدة
    if ($action === 'approve_all_pending') {
        $activeTab = 'queue';
        $approvedCount = $queueManager->approveAllPending();
        $sentCount = $queueManager->dispatchApprovedQueue($waService, 100);
        $toastMessage = ['type' => 'success', 'text' => "تم اعتماد {$approvedCount} رسالة معلقة وإرسال {$sentCount} رسالة عبر الواتساب فوراً!"];
    }

    // 3. إرسال الطابور المعتمد فوراً
    if ($action === 'dispatch_queue_now') {
        $activeTab = 'queue';
        $sentCount = $queueManager->dispatchApprovedQueue($waService, 100);
        $toastMessage = ['type' => 'info', 'text' => "تم تنفيذ إرسال {$sentCount} رسالة من طابور الانتظار بنجاح!"];
    }

    // 4. حفظ إعدادات الرد الآلي العامة
    if ($action === 'save_chatbot_settings') {
        $activeTab = 'chatbot';
        $botInput = [
            'enabled' => !empty($_POST['chatbot_enabled']),
            'allow_subscribers' => !empty($_POST['chatbot_allow_subscribers']),
            'allow_pos' => !empty($_POST['chatbot_allow_pos']),
            'allow_admins' => !empty($_POST['chatbot_allow_admins']),
            'welcome_msg' => trim((string)($_POST['chatbot_welcome_msg'] ?? '')),
            'support_phone' => trim((string)($_POST['chatbot_support_phone'] ?? '')),
            'network_name' => trim((string)($_POST['chatbot_network_name'] ?? ''))
        ];
        $chatbotService->saveSettings($botInput);

        // Instant dispatch toggle
        $instVal = !empty($_POST['whatsapp_instant_dispatch']) ? '1' : '0';
        $stmtInst = $db->prepare("INSERT INTO um_settings (setting_key, setting_value, updated_at) VALUES ('whatsapp_instant_dispatch', ?, NOW()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()");
        $stmtInst->execute([$instVal]);

        $toastMessage = ['type' => 'success', 'text' => 'تم حفظ إعدادات الرد الآلي وضوابط الإرسال الفوري بنجاح!'];
    }

    // 5. إضافة/تعديل قاعدة رد آلي مخصصة (Custom Keyword Rule)
    if ($action === 'save_chatbot_rule' && isset($_POST['trigger_keyword'], $_POST['response_text'])) {
        $activeTab = 'chatbot';
        $ruleData = [
            'id' => (int)($_POST['rule_id'] ?? 0),
            'trigger_keyword' => trim((string)$_POST['trigger_keyword']),
            'match_type' => (string)($_POST['match_type'] ?? 'contains'),
            'target_role' => (string)($_POST['target_role'] ?? 'all'),
            'response_text' => trim((string)$_POST['response_text']),
            'is_active' => !empty($_POST['is_active']) ? 1 : 0
        ];
        $res = $chatbotService->saveCustomRule($ruleData);
        $toastMessage = ['type' => $res['success'] ? 'success' : 'danger', 'text' => $res['message'] ?? $res['error']];
    }

    // 6. حذف قاعدة رد آلي مخصصة
    if ($action === 'delete_chatbot_rule' && isset($_POST['rule_id'])) {
        $activeTab = 'chatbot';
        $ruleId = (int)$_POST['rule_id'];
        $res = $chatbotService->deleteCustomRule($ruleId);
        $toastMessage = ['type' => 'warning', 'text' => $res['message']];
    }

    // 7. تفعيل/تعطيل قاعدة رد آلي
    if ($action === 'toggle_chatbot_rule' && isset($_POST['rule_id'])) {
        $activeTab = 'chatbot';
        $ruleId = (int)$_POST['rule_id'];
        $currState = (int)($_POST['current_state'] ?? 1);
        $res = $chatbotService->toggleCustomRule($ruleId, $currState === 0);
        $toastMessage = ['type' => 'info', 'text' => $res['message']];
    }

    // 8. معالجة إضافة قالب رسالة جديد
    if ($action === 'add_template' && isset($_POST['template_code'], $_POST['template_name'], $_POST['template_text'])) {
        $activeTab = 'templates';
        $code = preg_replace('/[^a-z0-9_]/', '', strtolower(trim((string)$_POST['template_code'])));
        $name = trim((string)$_POST['template_name']);
        $dept = (string)($_POST['department'] ?? 'sales');
        $recType = (string)($_POST['recipient_type'] ?? 'buyer');
        $text = trim((string)$_POST['template_text']);
        $placeholders = trim((string)($_POST['available_placeholders'] ?? '{invoice_no}, {created_at}, {buyer_name}, {total_amount}, {system_name}'));
        $reqApproval = !empty($_POST['requires_approval']) ? 1 : 0;

        if (!empty($code) && !empty($name) && !empty($text)) {
            $stmt = $db->prepare("
                INSERT INTO um_whatsapp_templates 
                (template_code, template_name, department, recipient_type, template_text, available_placeholders, requires_approval, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE 
                    template_name = VALUES(template_name),
                    department = VALUES(department),
                    recipient_type = VALUES(recipient_type),
                    template_text = VALUES(template_text),
                    available_placeholders = VALUES(available_placeholders),
                    requires_approval = VALUES(requires_approval)
            ");
            if ($stmt->execute([$code, $name, $dept, $recType, $text, $placeholders, $reqApproval])) {
                $toastMessage = ['type' => 'success', 'text' => "تم إضافة/تحديث القالب [{$name}] بنجاح وربطه بالرمز البرمجي ({$code})!"];
            } else {
                $toastMessage = ['type' => 'danger', 'text' => 'تعذر إضافة القالب، يرجى التأكد من البيانات.'];
            }
        }
    }

    // 9. معالجة حفظ وتعديل قوالب رسائل العمليات
    if ($action === 'save_template' && isset($_POST['template_code'], $_POST['template_text'])) {
        $activeTab = 'templates';
        $tmplCode = (string)$_POST['template_code'];
        $tmplText = trim((string)$_POST['template_text']);
        $reqApproval = !empty($_POST['requires_approval']);
        $isActive = !empty($_POST['is_active']);

        $saved = $templateEngine->saveTemplate($tmplCode, $tmplText, $reqApproval, $isActive);
        if ($saved) {
            $toastMessage = ['type' => 'success', 'text' => 'تم حفظ قالب الرسالة وتفاصيل المتغيرات بنجاح!'];
        } else {
            $toastMessage = ['type' => 'danger', 'text' => 'تعذر حفظ القالب. يرجى المحاولة لاحقاً.'];
        }
    }
}

// جلب رسائل الطابور بحسب الفلتر المحكوم
if ($statusFilter === 'all') {
    $stmtQueue = $db->query("SELECT * FROM um_notification_queue ORDER BY id DESC LIMIT 100");
} else {
    $stmtQueue = $db->prepare("SELECT * FROM um_notification_queue WHERE status = ? ORDER BY id DESC LIMIT 100");
    $stmtQueue->execute([$statusFilter]);
}
$queueMessages = $stmtQueue->fetchAll(PDO::FETCH_ASSOC);

// جلب قوالب الرسائل المسجلة
$templates = $templateEngine->getAllTemplates();

// جلب إعدادات وقواعد الرد الآلي
$botSettings = $chatbotService->getSettings();
$customRules = $chatbotService->getCustomRules();
$stmtInst = $db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'whatsapp_instant_dispatch' LIMIT 1");
$isInstantDispatch = $stmtInst ? ($stmtInst->fetchColumn() === '1') : true;

// إحصائيات سريعة
$totalPending = $db->query("SELECT COUNT(*) FROM um_notification_queue WHERE status = 'pending'")->fetchColumn();
$totalSent = $db->query("SELECT COUNT(*) FROM um_notification_queue WHERE status = 'sent'")->fetchColumn();
$totalFailed = $db->query("SELECT COUNT(*) FROM um_notification_queue WHERE status = 'failed'")->fetchColumn();
$totalApproved = $db->query("SELECT COUNT(*) FROM um_notification_queue WHERE status = 'approved'")->fetchColumn();
$totalAll = $db->query("SELECT COUNT(*) FROM um_notification_queue")->fetchColumn();
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مركز إدارة الواتساب والرد الآلي الذكي - SAM ERP</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; color: #1e293b; }
        .card { border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-radius: 12px; }
        .table-responsive { background: #fff; border-radius: 10px; padding: 15px; }
        .badge-dept { font-size: 0.8rem; padding: 6px 10px; border-radius: 6px; }
        .kpi-card { background: #fff; padding: 16px; border-radius: 10px; border-right: 4px solid #198754; cursor: pointer; transition: transform 0.2s; }
        .kpi-card:hover { transform: translateY(-2px); }
        .nav-pills .nav-link { font-weight: 700; color: #475569; border-radius: 8px; padding: 10px 18px; }
        .nav-pills .nav-link.active { background-color: #198754; color: #fff; box-shadow: 0 4px 10px rgba(25, 135, 84, 0.3); }
        .placeholder-tag { display: inline-block; background: #e2e8f0; color: #334155; font-size: 11px; font-weight: bold; padding: 4px 8px; border-radius: 4px; margin: 2px; cursor: pointer; transition: all 0.2s; }
        .placeholder-tag:hover { background: #198754; color: #fff; }
        .chat-container { background: #efeae2; border-radius: 12px; padding: 16px; min-height: 380px; max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .chat-bubble { max-width: 80%; padding: 10px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .chat-bubble.inbound { background: #fff; align-self: flex-start; border-top-right-radius: 0; }
        .chat-bubble.outbound { background: #d9fdd3; align-self: flex-end; border-top-left-radius: 0; }
    </style>
</head>
<body>

<div class="container my-4">
    
    <!-- التنبيهات علوية -->
    <?php if ($toastMessage): ?>
        <div class="alert alert-<?php echo $toastMessage['type']; ?> alert-dismissible fade show mb-4 shadow-sm" role="alert">
            <i class="fa-solid fa-circle-check me-2"></i> <?php echo $toastMessage['text']; ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    <?php endif; ?>

    <!-- الهيدر والأزرار السريعة -->
    <div class="row align-items-center mb-4">
        <div class="col-md-6">
            <h2 class="fw-bold text-dark"><i class="fab fa-whatsapp text-success me-2"></i> مركز إدارة وتخصيص رسائل الواتساب والرد الآلي</h2>
            <p class="text-muted mb-0">تحكم كامل بالإرسال الفوري، قوالب العمليات، وقواعد البوت الذكي التفاعلية.</p>
        </div>
        <div class="col-md-6 d-flex gap-2 justify-content-md-end align-items-center mt-3 mt-md-0 flex-wrap">
            <?php if ((int)$totalPending > 0): ?>
                <form action="whatsapp_manager.php?tab=queue" method="POST" class="d-inline">
                    <input type="hidden" name="action" value="approve_all_pending">
                    <button type="submit" class="btn btn-warning fw-bold text-dark shadow-sm">
                        <i class="fa-solid fa-bolt me-1"></i> اعتماد وإرسال المعلق (<?php echo $totalPending; ?>)
                    </button>
                </form>
            <?php endif; ?>
            <form action="whatsapp_manager.php?tab=queue" method="POST" class="d-inline">
                <input type="hidden" name="action" value="dispatch_queue_now">
                <button type="submit" class="btn btn-primary fw-bold shadow-sm">
                    <i class="fa-solid fa-paper-plane me-1"></i> إرسال الطابور فوراً
                </button>
            </form>
            <button class="btn btn-success fw-bold shadow-sm" data-bs-toggle="modal" data-bs-target="#addTemplateModal">
                <i class="fa fa-plus-circle me-1"></i> إضافة قالب عملية
            </button>
        </div>
    </div>

    <!-- بطاقات الفلاتر السريعة -->
    <div class="row mb-4">
        <div class="col-md-3 mb-2">
            <a href="whatsapp_manager.php?tab=queue&status=all" class="text-decoration-none">
                <div class="kpi-card text-center <?php echo $statusFilter === 'all' ? 'shadow-sm border-dark' : ''; ?>" style="border-right-color: #212529;">
                    <small class="text-muted d-block mb-1">كافة السجلات والرسائل</small>
                    <span class="fs-4 fw-bold text-dark"><?php echo number_format((int)$totalAll); ?></span>
                </div>
            </a>
        </div>
        <div class="col-md-3 mb-2">
            <a href="whatsapp_manager.php?tab=queue&status=pending" class="text-decoration-none">
                <div class="kpi-card text-center <?php echo $statusFilter === 'pending' ? 'shadow-sm border-warning' : ''; ?>" style="border-right-color: #ffc107;">
                    <small class="text-muted d-block mb-1">بانتظار المراجعة والاعتماد</small>
                    <span class="fs-4 fw-bold text-warning"><?php echo number_format((int)$totalPending); ?></span>
                </div>
            </a>
        </div>
        <div class="col-md-3 mb-2">
            <a href="whatsapp_manager.php?tab=queue&status=sent" class="text-decoration-none">
                <div class="kpi-card text-center <?php echo $statusFilter === 'sent' ? 'shadow-sm border-primary' : ''; ?>" style="border-right-color: #0d6efd;">
                    <small class="text-muted d-block mb-1">الرسائل المرسلة بنجاح</small>
                    <span class="fs-4 fw-bold text-primary"><?php echo number_format((int)$totalSent); ?></span>
                </div>
            </a>
        </div>
        <div class="col-md-3 mb-2">
            <a href="whatsapp_manager.php?tab=queue&status=failed" class="text-decoration-none">
                <div class="kpi-card text-center <?php echo $statusFilter === 'failed' ? 'shadow-sm border-danger' : ''; ?>" style="border-right-color: #dc3545;">
                    <small class="text-muted d-block mb-1">الرسائل الفاشلة / ملغاة</small>
                    <span class="fs-4 fw-bold text-danger"><?php echo number_format((int)$totalFailed); ?></span>
                </div>
            </a>
        </div>
    </div>

    <!-- تبويبات النظام الثلاثية -->
    <ul class="nav nav-pills mb-4" id="pills-tab" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link <?php echo $activeTab === 'queue' ? 'active' : ''; ?> fw-bold" id="pills-queue-tab" data-bs-toggle="pill" data-bs-target="#pills-queue" type="button">
                <i class="fa-solid fa-list-check me-2"></i> سجل وطابور الرسائل (<?php echo strtoupper($statusFilter); ?>)
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link <?php echo $activeTab === 'templates' ? 'active' : ''; ?> fw-bold" id="pills-templates-tab" data-bs-toggle="pill" data-bs-target="#pills-templates" type="button">
                <i class="fa-solid fa-sliders me-2"></i> قوالب رسائل العمليات الـ 26 (<?php echo count($templates); ?>)
            </button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link <?php echo $activeTab === 'chatbot' ? 'active' : ''; ?> fw-bold" id="pills-chatbot-tab" data-bs-toggle="pill" data-bs-target="#pills-chatbot" type="button">
                <i class="fa-solid fa-robot me-2"></i> 🤖 إدارة وقواعد الرد الآلي الذكي (Chatbot)
            </button>
        </li>
    </ul>

    <div class="tab-content" id="pills-tabContent">
        
        <!-- التبويب الأول: سجل وطابور الرسائل -->
        <div class="tab-pane fade <?php echo $activeTab === 'queue' ? 'show active' : ''; ?>" id="pills-queue">
            <div class="card shadow-sm">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>المرجع</th>
                                    <th>القسم والحدث</th>
                                    <th>المستلم</th>
                                    <th>نص الرسالة الحالي</th>
                                    <th>التاريخ والوقت</th>
                                    <th class="text-center">إجراءات التحكم وإعادة الإرسال</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if (empty($queueMessages)): ?>
                                    <tr>
                                        <td colspan="6" class="text-center py-5 text-muted fs-5">
                                            <i class="fa-solid fa-circle-check text-success fs-1 mb-3 d-block"></i>
                                            لا توجد رسائل بحالة (<?php echo htmlspecialchars($statusFilter); ?>) حالياً.
                                        </td>
                                    </tr>
                                <?php else: ?>
                                    <?php foreach ($queueMessages as $msg): ?>
                                        <tr>
                                            <td><span class="fw-bold text-secondary">#<?php echo htmlspecialchars((string)($msg['reference_id'] ?? $msg['id'])); ?></span></td>
                                            <td>
                                                <?php
                                                $deptClasses = ['sales' => 'bg-info text-dark', 'inventory' => 'bg-warning text-dark', 'finance' => 'bg-success text-white', 'network' => 'bg-danger text-white', 'system' => 'bg-secondary text-white'];
                                                $class = $deptClasses[$msg['department']] ?? 'bg-dark text-white';
                                                ?>
                                                <span class="badge badge-dept <?php echo $class; ?>"><?php echo strtoupper($msg['department']); ?></span>
                                                <small class="d-block text-muted mt-1"><?php echo htmlspecialchars($msg['event_type']); ?></small>
                                            </td>
                                            <td>
                                                <div class="fw-bold"><?php echo htmlspecialchars($msg['recipient_name'] ?? 'عميل غير معروف'); ?></div>
                                                <small class="text-muted"><i class="fa fa-phone fa-sm me-1"></i><?php echo htmlspecialchars($msg['recipient_phone']); ?></small>
                                            </td>
                                            <td style="min-width: 320px;">
                                                <?php if ($msg['status'] === 'pending'): ?>
                                                    <form action="whatsapp_manager.php?tab=queue&status=pending" method="POST" id="form-<?php echo $msg['id']; ?>">
                                                        <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                        <textarea name="message_text" class="form-control form-control-sm" rows="3" required><?php echo htmlspecialchars($msg['message_text']); ?></textarea>
                                                    </form>
                                                <?php else: ?>
                                                    <div class="bg-light p-2 rounded text-dark" style="white-space: pre-wrap; font-size: 13px; max-height: 120px; overflow-y: auto;"><?php echo htmlspecialchars($msg['message_text']); ?></div>
                                                    <?php if (!empty($msg['error_message'])): ?>
                                                        <small class="text-danger d-block mt-1"><i class="fa fa-exclamation-triangle me-1"></i><?php echo htmlspecialchars($msg['error_message']); ?></small>
                                                    <?php endif; ?>
                                                <?php endif; ?>
                                            </td>
                                            <td><small class="text-muted fw-semibold"><?php echo htmlspecialchars($msg['scheduled_at']); ?></small></td>
                                            <td class="text-center">
                                                <div class="d-flex justify-content-center gap-2">
                                                    <?php if ($msg['status'] === 'pending'): ?>
                                                        <button type="submit" name="action" value="edit_approve" form="form-<?php echo $msg['id']; ?>" class="btn btn-sm btn-success" title="حفظ التعديل وإرسال">
                                                            <i class="fa fa-save me-1"></i> حفظ واعتماد
                                                        </button>
                                                        <form action="whatsapp_manager.php?tab=queue&status=pending" method="POST" class="d-inline">
                                                            <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                            <button type="submit" name="action" value="approve" class="btn btn-sm btn-primary" title="اعتماد النص الحالي">
                                                                <i class="fa fa-paper-plane me-1"></i> إرسال
                                                            </button>
                                                        </form>
                                                        <form action="whatsapp_manager.php?tab=queue&status=pending" method="POST" class="d-inline">
                                                            <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                            <button type="submit" name="action" value="cancel" class="btn btn-sm btn-outline-danger" onclick="return confirm('هل أنت متأكد من إلغاء إرسال هذه الرسالة؟')" title="إلغاء">
                                                                <i class="fa fa-trash"></i>
                                                            </button>
                                                        </form>
                                                    <?php else: ?>
                                                        <form action="whatsapp_manager.php?tab=queue&status=<?php echo $statusFilter; ?>" method="POST" class="d-inline">
                                                            <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                            <button type="submit" name="action" value="retry" class="btn btn-sm btn-warning fw-bold text-dark" title="إعادة إرسال هذه الرسالة فوراً">
                                                                <i class="fa fa-rotate-right me-1"></i> إعادة إرسال
                                                            </button>
                                                        </form>
                                                    <?php endif; ?>
                                                </div>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- التبويب الثاني: إدارة وتخصيص قوالب ومتغيرات العمليات -->
        <div class="tab-pane fade <?php echo $activeTab === 'templates' ? 'show active' : ''; ?>" id="pills-templates">
            <div class="row">
                <?php foreach ($templates as $tmpl): ?>
                    <div class="col-md-6 mb-4">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                                <div>
                                    <h5 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-file-lines text-success me-2"></i> <?php echo htmlspecialchars($tmpl['template_name']); ?></h5>
                                    <small class="text-muted">الرمز البرمجي: <code><?php echo htmlspecialchars($tmpl['template_code']); ?></code></small>
                                </div>
                                <span class="badge bg-light text-dark border"><?php echo strtoupper($tmpl['department']); ?></span>
                            </div>
                            <div class="card-body">
                                <form action="whatsapp_manager.php?tab=templates" method="POST">
                                    <input type="hidden" name="action" value="save_template">
                                    <input type="hidden" name="template_code" value="<?php echo htmlspecialchars($tmpl['template_code']); ?>">

                                    <div class="mb-3">
                                        <label class="form-label fw-bold text-secondary">صيغة ونص الرسالة للعملية:</label>
                                        <textarea name="template_text" class="form-control" rows="8" required><?php echo htmlspecialchars($tmpl['template_text']); ?></textarea>
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label fw-bold text-secondary d-block">المتغيرات المتاحة لهذه العملية (اضغط للنسخ):</label>
                                        <div>
                                            <?php 
                                             $placeholders = explode(',', $tmpl['available_placeholders'] ?? '');
                                            foreach ($placeholders as $ph): 
                                                $ph = trim($ph);
                                                if (empty($ph)) continue;
                                            ?>
                                                <span class="placeholder-tag" onclick="navigator.clipboard.writeText('<?php echo $ph; ?>'); alert('تم نسخ المتغير: <?php echo $ph; ?>');"><?php echo htmlspecialchars($ph); ?></span>
                                            <?php endforeach; ?>
                                        </div>
                                    </div>

                                    <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" name="requires_approval" value="1" id="req-<?php echo $tmpl['id']; ?>" <?php echo $tmpl['requires_approval'] ? 'checked' : ''; ?>>
                                            <label class="form-check-label fw-bold text-dark" for="req-<?php echo $tmpl['id']; ?>">حجز الرسالة للمراجعة يدوياً</label>
                                        </div>
                                        <button type="submit" class="btn btn-success btn-sm fw-bold">
                                            <i class="fa fa-save me-1"></i> حفظ وتحديث القالب
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- التبويب الثالث: إدارة الرد الآلي الذكي (Chatbot Management) -->
        <div class="tab-pane fade <?php echo $activeTab === 'chatbot' ? 'show active' : ''; ?>" id="pills-chatbot">
            <div class="row">
                
                <!-- 1. نموذج الإعدادات العامة للبوت وضوابط الإرسال الفوري -->
                <div class="col-lg-5 mb-4">
                    <div class="card h-100 shadow-sm">
                        <div class="card-header bg-white py-3">
                            <h5 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-sliders text-primary me-2"></i> إعدادات الرد الآلي وضوابط الإرسال</h5>
                        </div>
                        <div class="card-body">
                            <form action="whatsapp_manager.php?tab=chatbot" method="POST">
                                <input type="hidden" name="action" value="save_chatbot_settings">

                                <div class="mb-3 p-3 bg-light rounded border">
                                    <div class="form-check form-switch mb-2">
                                        <input class="form-check-input" type="checkbox" name="chatbot_enabled" value="1" id="bot-en" <?php echo $botSettings['enabled'] ? 'checked' : ''; ?>>
                                        <label class="form-check-label fw-bold text-dark" for="bot-en">تفعيل محرك الرد الآلي التفاعلي (Chatbot)</label>
                                    </div>
                                    <small class="text-muted d-block">يقوم بالرد الفوري على رسائل الواتساب الواردة واستعلامات الكروت والكشوفات.</small>
                                </div>

                                <div class="mb-3 p-3 bg-light rounded border">
                                    <div class="form-check form-switch mb-2">
                                        <input class="form-check-input" type="checkbox" name="whatsapp_instant_dispatch" value="1" id="inst-disp" <?php echo $isInstantDispatch ? 'checked' : ''; ?>>
                                        <label class="form-check-label fw-bold text-dark" for="inst-disp">الإرسال الفوري المباشر (تجاوز الانتظار)</label>
                                    </div>
                                    <small class="text-muted d-block">عند التفعيل، تُرسل رسائل الفواتير والسندات مباشرة دون الحاجة للدخول واعتمادها يدوياً.</small>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-bold">اسم الشبكة في الردود:</label>
                                    <input type="text" name="chatbot_network_name" class="form-control" value="<?php echo htmlspecialchars($botSettings['network_name'] ?? 'شبكة سام'); ?>" required>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-bold">رقم الدعم الفني وخدمة العملاء:</label>
                                    <input type="text" name="chatbot_support_phone" class="form-control" value="<?php echo htmlspecialchars($botSettings['support_phone'] ?? '776082846'); ?>" required style="direction: ltr; text-align: right;">
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-bold">رسالة الترحيب وقائمة الخيارات الرئيسية:</label>
                                    <textarea name="chatbot_welcome_msg" class="form-control" rows="3" required><?php echo htmlspecialchars($botSettings['welcome_msg'] ?? 'مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐'); ?></textarea>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-bold d-block text-secondary">صلاحيات الاستعلام التفاعلية:</label>
                                    <div class="form-check mb-1">
                                        <input class="form-check-input" type="checkbox" name="chatbot_allow_subscribers" value="1" id="perm-sub" <?php echo $botSettings['allow_subscribers'] ? 'checked' : ''; ?>>
                                        <label class="form-check-label" for="perm-sub">السماح للمشتركين (استعلام الكروت، الباقات، نقاط البيع)</label>
                                    </div>
                                    <div class="form-check mb-1">
                                        <input class="form-check-input" type="checkbox" name="chatbot_allow_pos" value="1" id="perm-pos" <?php echo $botSettings['allow_pos'] ? 'checked' : ''; ?>>
                                        <label class="form-check-label" for="perm-pos">السماح لنقاط البيع (كشف الحساب، رصيد المخزن، فواتير المشتريات)</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" name="chatbot_allow_admins" value="1" id="perm-adm" <?php echo $botSettings['allow_admins'] ? 'checked' : ''; ?>>
                                        <label class="form-check-label" for="perm-adm">السماح للمدراء (كشف الأرصدة، جرد المخزون، مبيعات اليوم، السيرفرات)</label>
                                    </div>
                                </div>

                                <button type="submit" class="btn btn-primary w-100 fw-bold">
                                    <i class="fa fa-save me-1"></i> حفظ إعدادات الرد الآلي
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                <!-- 2. جدول الكلمات المفتاحية والقواعد المخصصة + محاكي الرد الآلي -->
                <div class="col-lg-7 mb-4">
                    
                    <!-- جدول الكلمات المفتاحية -->
                    <div class="card shadow-sm mb-4">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                            <div>
                                <h5 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-bolt text-warning me-2"></i> الكلمات المفتاحية والردود التلقائية المخصصة</h5>
                                <small class="text-muted">أضف كلمات مفتاحية (مثال: الموقع، الأسعار، حساب بنكي) مع الردود التلقائية المخصصة لها.</small>
                            </div>
                            <button class="btn btn-success btn-sm fw-bold" data-bs-toggle="modal" data-bs-target="#addRuleModal">
                                <i class="fa fa-plus me-1"></i> إضافة كلمة مفتاحية
                            </button>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>الكلمة المفتاحية</th>
                                            <th>نوع المطابقة</th>
                                            <th>نص الرد المخصص</th>
                                            <th>الجمهور</th>
                                            <th>الحالة</th>
                                            <th class="text-center">إجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php if (empty($customRules)): ?>
                                            <tr>
                                                <td colspan="6" class="text-center py-4 text-muted">لا توجد كلمات مفتاحية مخصصة حتى الآن.</td>
                                            </tr>
                                        <?php else: ?>
                                            <?php foreach ($customRules as $r): ?>
                                                <tr>
                                                    <td><b class="text-dark">«<?php echo htmlspecialchars($r['trigger_keyword']); ?>»</b></td>
                                                    <td><span class="badge bg-light text-secondary border"><?php echo $r['match_type'] === 'exact' ? 'مطابقة تامة' : ($r['match_type'] === 'starts_with' ? 'تبدأ بـ' : 'تحتوي على'); ?></span></td>
                                                    <td style="max-width: 200px;">
                                                        <div class="text-truncate" style="max-width: 200px;" title="<?php echo htmlspecialchars($r['response_text']); ?>">
                                                            <?php echo htmlspecialchars($r['response_text']); ?>
                                                        </div>
                                                    </td>
                                                    <td><span class="badge bg-secondary"><?php echo strtoupper($r['target_role']); ?></span></td>
                                                    <td>
                                                        <form action="whatsapp_manager.php?tab=chatbot" method="POST" class="d-inline">
                                                            <input type="hidden" name="action" value="toggle_chatbot_rule">
                                                            <input type="hidden" name="rule_id" value="<?php echo $r['id']; ?>">
                                                            <input type="hidden" name="current_state" value="<?php echo $r['is_active']; ?>">
                                                            <button type="submit" class="btn btn-sm <?php echo $r['is_active'] ? 'btn-outline-success' : 'btn-outline-secondary'; ?>" style="font-size: 11px; padding: 2px 8px;">
                                                                <?php echo $r['is_active'] ? '🟢 نشط' : '⚪ معطل'; ?>
                                                            </button>
                                                        </form>
                                                    </td>
                                                    <td class="text-center">
                                                        <form action="whatsapp_manager.php?tab=chatbot" method="POST" class="d-inline">
                                                            <input type="hidden" name="action" value="delete_chatbot_rule">
                                                            <input type="hidden" name="rule_id" value="<?php echo $r['id']; ?>">
                                                            <button type="submit" class="btn btn-sm btn-outline-danger" onclick="return confirm('هل أنت متأكد من حذف هذه القاعدة؟')" title="حذف">
                                                                <i class="fa fa-trash"></i>
                                                            </button>
                                                        </form>
                                                    </td>
                                                </tr>
                                            <?php endforeach; ?>
                                        <?php endif; ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- محاكي الرد الآلي المباشر -->
                    <div class="card shadow-sm">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                            <h5 class="fw-bold mb-0 text-dark"><i class="fa-solid fa-comments text-success me-2"></i> محاكي واختبار الرد الآلي الحي (Live Simulator)</h5>
                            <span class="badge bg-success">متصل بالمحرك</span>
                        </div>
                        <div class="card-body">
                            <div class="row g-2 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-semibold small">تجربة الإرسال بصفتك:</label>
                                    <select id="sim-role-phone" class="form-select form-select-sm">
                                        <option value="967776082846">👑 المدير العام (967776082846)</option>
                                        <option value="967771332256">🏪 وكيل / نقطة بيع (967771332256)</option>
                                        <option value="96777123456">👤 مشترك / عميل عادي (96777123456)</option>
                                    </select>
                                </div>
                                <div class="col-md-6 d-flex align-items-end">
                                    <button type="button" class="btn btn-sm btn-outline-secondary w-100" onclick="document.getElementById('sim-chat-box').innerHTML=''; addChatBubble('bot', 'مرحباً! أرسل رسالة لتجربة الرد الآلي.');">
                                        🧹 مسح سجل المحادثة
                                    </button>
                                </div>
                            </div>

                            <div id="sim-chat-box" class="chat-container mb-3">
                                <div class="chat-bubble inbound">🤖 مرحباً بك في محاكي الرد الآلي للواتساب! يمكنك تجربة إرسال أرقام الكروت، الكلمات مثل «الموقع» أو «كشف حساب» أو «الباقات».</div>
                            </div>

                            <div class="input-group">
                                <input type="text" id="sim-input-msg" class="form-control" placeholder="اكتب رسالة تجريبية (مثلاً: كشف حساب، الموقع، رصيدي، 1)..." onkeydown="if(event.key==='Enter') sendSimMessage();">
                                <button class="btn btn-success fw-bold" type="button" onclick="sendSimMessage()">
                                    <i class="fa fa-paper-plane me-1"></i> إرسال
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>

    </div>
</div>

<!-- مودال إضافة قاعدة كلمة مفتاحية جديدة -->
<div class="modal fade" id="addRuleModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <form action="whatsapp_manager.php?tab=chatbot" method="POST">
                <input type="hidden" name="action" value="save_chatbot_rule">
                <div class="modal-header bg-warning text-dark">
                    <h5 class="modal-title fw-bold"><i class="fa fa-plus-circle me-2"></i> إضافة كلمة مفتاحية ورد آلي مخصص</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold">الكلمة أو العبارة المفتاحية:</label>
                        <input type="text" name="trigger_keyword" class="form-control" placeholder="مثال: الموقع، أسعار، حساب بنكي، طريقة التفعيل" required>
                    </div>

                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">نوع المطابقة:</label>
                            <select name="match_type" class="form-select">
                                <option value="contains" selected>تحتوي على الكلمة (Contains)</option>
                                <option value="exact">مطابقة تامة (Exact Match)</option>
                                <option value="starts_with">تبدأ بالكلمة (Starts With)</option>
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">الجمهور المستهدف:</label>
                            <select name="target_role" class="form-select">
                                <option value="all" selected>الجميع (All Users)</option>
                                <option value="subscriber">المشتركون فقط (Subscribers)</option>
                                <option value="pos">نقاط البيع والوكلاء (POS Agents)</option>
                                <option value="admin">المدراء فقط (Admins)</option>
                            </select>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-bold">نص الرد التلقائي المخصص:</label>
                        <textarea name="response_text" class="form-control" rows="5" placeholder="أدخل نص الرد الذي سيقوم البوت بإرساله فوراً عند استقبال الكلمة المفتاحية..." required></textarea>
                    </div>

                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" name="is_active" value="1" id="rule-act" checked>
                        <label class="form-check-label fw-bold" for="rule-act">تفعيل القاعدة مباشرة</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                    <button type="submit" class="btn btn-warning fw-bold"><i class="fa fa-save me-1"></i> حفظ القاعدة</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- مودال إضافة قالب رسالة جديد -->
<div class="modal fade" id="addTemplateModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <form action="whatsapp_manager.php?tab=templates" method="POST">
                <input type="hidden" name="action" value="add_template">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title fw-bold"><i class="fa fa-plus-circle me-2"></i> إضافة قالب رسالة جديد لعملية في النظام</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">اسم القالب والعملية:</label>
                            <input type="text" name="template_name" class="form-control" placeholder="مثال: فاتورة مرتجع مبيعات" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">الرمز البرمجي للعملية (English Code):</label>
                            <input type="text" name="template_code" class="form-control" placeholder="مثال: sale_return" required pattern="[a-z0-9_]+">
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">القسم المصدر:</label>
                            <select name="department" class="form-select">
                                <option value="sales">المبيعات (Sales)</option>
                                <option value="inventory">المخازن والعهد (Inventory)</option>
                                <option value="finance">المالية والخزائن (Finance)</option>
                                <option value="network">الشبكة والأجهزة (Network)</option>
                                <option value="system">الإدارة والنظام (System)</option>
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-bold">نوع المستلم:</label>
                            <select name="recipient_type" class="form-select">
                                <option value="buyer">العميل / المشتري (Buyer)</option>
                                <option value="seller">البائع / الموظف (Seller)</option>
                                <option value="beneficiary">المستفيد (Beneficiary)</option>
                                <option value="admin">المدراء التنفيذيين (Admins)</option>
                            </select>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-bold">نص وعنوان الرسالة:</label>
                        <textarea name="template_text" class="form-control" rows="5" placeholder="أدخل نص الرسالة واستخدم المتغيرات مثل {invoice_no}, {buyer_name}, {total_amount}" required></textarea>
                    </div>

                    <div class="mb-3">
                        <label class="form-label fw-bold">المتغيرات المتاحة لهذا القالب (مفصولة بفواصل):</label>
                        <input type="text" name="available_placeholders" class="form-control" value="{invoice_no}, {created_at}, {buyer_name}, {total_amount}, {current_balance}, {system_name}">
                    </div>

                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" name="requires_approval" value="1" id="add-req-app">
                        <label class="form-check-label fw-bold" for="add-req-app">تطلب مراجعة بشرية في الطابور قبل الإرسال</label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                    <button type="submit" class="btn btn-success fw-bold"><i class="fa fa-save me-1"></i> حفظ وتفعيل القالب</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script>
function addChatBubble(type, text) {
    const box = document.getElementById('sim-chat-box');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (type === 'user' ? 'outbound' : 'inbound');
    bubble.innerText = text;
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
}

async function sendSimMessage() {
    const input = document.getElementById('sim-input-msg');
    const msg = input.value.trim();
    if (!msg) return;

    const phone = document.getElementById('sim-role-phone').value;
    addChatBubble('user', msg);
    input.value = '';

    const typing = document.createElement('div');
    typing.className = 'chat-bubble inbound text-muted';
    typing.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i> جاري كتابة الرد...';
    document.getElementById('sim-chat-box').appendChild(typing);
    document.getElementById('sim-chat-box').scrollTop = document.getElementById('sim-chat-box').scrollHeight;

    try {
        const res = await fetch('api.php?action=handle_chatbot_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, body: msg, phone: phone, from: phone })
        });
        const data = await res.json();
        typing.remove();

        const reply = data.reply || data.response || data.message || '⚠️ لم يتم إرجاع رد من المحرك.';
        addChatBubble('bot', reply);
    } catch(err) {
        typing.remove();
        addChatBubble('bot', '❌ تعذر الاتصال بمحرك الرد الآلي: ' + err.message);
    }
}
</script>
</body>
</html>
