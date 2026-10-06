<?php
declare(strict_types=1);

require_once '/var/www/mikrotik-usermanager/config.php';

// 🔒 حماية الشاشة واشتراط تسجيل الدخول المحمي من داخل النظام
requireAuth();

try {
    $db = getDB();
} catch (Exception $e) {
    die("فشل الاتصال بقاعدة البيانات: " . $e->getMessage());
}

$toastMessage = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $queueId = (int)($_POST['queue_id'] ?? 0);
    $action = (string)$_POST['action'];

    if ($queueId > 0) {
        if ($action === 'approve') {
            $stmt = $db->prepare("UPDATE um_notification_queue SET status = 'approved' WHERE id = ? AND status = 'pending'");
            $stmt->execute([$queueId]);
            $toastMessage = ['type' => 'success', 'text' => 'تم اعتماد الرسالة وإرسالها للطابور فوراً!'];
        } 
        elseif ($action === 'cancel') {
            $stmt = $db->prepare("UPDATE um_notification_queue SET status = 'cancelled' WHERE id = ?");
            $stmt->execute([$queueId]);
            $toastMessage = ['type' => 'warning', 'text' => 'تم إلغاء إرسال الرسالة بنجاح.'];
        } 
        elseif ($action === 'edit_approve' && isset($_POST['message_text'])) {
            $newText = trim((string)$_POST['message_text']);
            $stmt = $db->prepare("UPDATE um_notification_queue SET message_text = ?, status = 'approved' WHERE id = ?");
            $stmt->execute([$newText, $queueId]);
            $toastMessage = ['type' => 'success', 'text' => 'تم حفظ التعديلات واعتماد إرسال الرسالة!'];
        }
    }
}

$stmt = $db->query("SELECT * FROM um_notification_queue WHERE status = 'pending' ORDER BY scheduled_at ASC");
$pendingMessages = $stmt->fetchAll(PDO::FETCH_ASSOC);

$totalPending = count($pendingMessages);
$sentToday = $db->query("SELECT COUNT(*) FROM um_notification_queue WHERE status = 'sent' AND DATE(sent_at) = CURDATE()")->fetchColumn();
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة التحكم برسائل الواتساب</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; }
        .card { border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-radius: 10px; }
        .table-responsive { background: #fff; border-radius: 10px; padding: 15px; }
        .badge-dept { font-size: 0.8rem; padding: 6px 10px; border-radius: 6px; }
        .kpi-card { background: #fff; padding: 20px; border-radius: 10px; border-right: 4px solid #198754; }
    </style>
</head>
<body>

<div class="container my-4">
    
    <?php if ($toastMessage): ?>
        <div class="alert alert-<?php echo $toastMessage['type']; ?> alert-dismissible fade show mb-4" role="alert">
            <i class="fa-solid fa-circle-check me-2"></i> <?php echo $toastMessage['text']; ?>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    <?php endif; ?>

    <div class="row align-items-center mb-4">
        <div class="col-md-7">
            <h2 class="fw-bold text-dark"><i class="fab fa-whatsapp text-success me-2"></i> مركز فحص والتحكم برسائل الواتساب</h2>
            <p class="text-muted mb-0">مراجعة، تعديل، واعتماد الرسائل المعلقة الصادرة من واجهات النظام.</p>
        </div>
        <div class="col-md-5 d-flex gap-3 justify-content-md-end mt-3 mt-md-0">
            <div class="kpi-card text-center flex-fill">
                <small class="text-muted d-block mb-1">الرسائل المعلقة حالياً</small>
                <span class="fs-4 fw-bold text-warning"><?php echo number_format($totalPending); ?></span>
            </div>
            <div class="kpi-card text-center flex-fill" style="border-right-color: #0d6efd;">
                <small class="text-muted d-block mb-1">تم إرسالها اليوم</small>
                <span class="fs-4 fw-bold text-primary"><?php echo number_format((int)$sentToday); ?></span>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>المرجع</th>
                            <th>القسم المصدر</th>
                            <th>المستلم</th>
                            <th>نص الرسالة الحالي (قابل للتعديل)</th>
                            <th>تاريخ الجدولة</th>
                            <th class="text-center">إجراءات التحكم للعملية</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($pendingMessages)): ?>
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted fs-5">
                                    <i class="fa-solid fa-circle-check text-success fs-1 mb-3 d-block"></i>
                                    لا توجد رسائل معلقة تنتظر الفحص حالياً. جميع الرسائل منطلقة!
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($pendingMessages as $msg): ?>
                                <tr>
                                    <td><span class="fw-bold text-secondary">#<?php echo htmlspecialchars((string)($msg['reference_id'] ?? $msg['id'])); ?></span></td>
                                    <td>
                                        <?php
                                        $deptClasses = [
                                            'sales' => 'bg-info text-dark', 
                                            'inventory' => 'bg-warning text-dark', 
                                            'finance' => 'bg-success text-white', 
                                            'network' => 'bg-danger text-white', 
                                            'system' => 'bg-secondary text-white'
                                        ];
                                        $class = $deptClasses[$msg['department']] ?? 'bg-dark text-white';
                                        ?>
                                        <span class="badge badge-dept <?php echo $class; ?>"><?php echo strtoupper($msg['department']); ?></span>
                                    </td>
                                    <td>
                                        <div class="fw-bold"><?php echo htmlspecialchars($msg['recipient_name'] ?? 'عميل غير معروف'); ?></div>
                                        <small class="text-muted"><i class="fa fa-phone fa-sm me-1"></i><?php echo htmlspecialchars($msg['recipient_phone']); ?></small>
                                    </td>
                                    <td style="min-width: 300px;">
                                        <form action="whatsapp_dashboard.php" method="POST" id="form-<?php echo $msg['id']; ?>">
                                            <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                            <textarea name="message_text" class="form-control form-control-sm" rows="2" required><?php echo htmlspecialchars($msg['message_text']); ?></textarea>
                                        </form>
                                    </td>
                                    <td><small class="text-muted fw-semibold"><?php echo htmlspecialchars($msg['scheduled_at']); ?></small></td>
                                    <td class="text-center">
                                        <div class="d-flex justify-content-center gap-2">
                                            <button type="submit" name="action" value="edit_approve" form="form-<?php echo $msg['id']; ?>" class="btn btn-sm btn-success" title="حفظ التعديل وإرسال">
                                                <i class="fa fa-save me-1"></i> حفظ واعتماد
                                            </button>
                                            <form action="whatsapp_dashboard.php" method="POST" class="d-inline">
                                                <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                <button type="submit" name="action" value="approve" class="btn btn-sm btn-primary" title="اعتماد النص الحالي">
                                                    <i class="fa fa-paper-plane me-1"></i> إرسال
                                                </button>
                                            </form>
                                            <form action="whatsapp_dashboard.php" method="POST" class="d-inline">
                                                <input type="hidden" name="queue_id" value="<?php echo $msg['id']; ?>">
                                                <button type="submit" name="action" value="cancel" class="btn btn-sm btn-outline-danger" onclick="return confirm('هل أنت متأكد من إلغاء إرسال هذه الرسالة؟')" title="إلغاء">
                                                    <i class="fa fa-trash"></i>
                                                </button>
                                            </form>
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

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
