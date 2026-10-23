<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

if (empty($_SESSION['logged_in']) || empty($_SESSION['admin_id'])) {
    header('Location: ../login.html');
    exit;
}
?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10251f">
    <title>SAM — الكروت والمخزون</title>
    <link rel="stylesheet" href="../assets/css/arabic-fonts-local.css">
    <link rel="stylesheet" href="assets/app.css">
</head>
<body>
    <div class="app-shell">
        <aside class="sidebar" id="sidebar">
            <a class="brand" href="index.php" aria-label="SAM، الصفحة الرئيسية">
                <span class="brand-mark">S</span>
                <span class="brand-copy"><strong>SAM</strong><small>إدارة الشبكات</small></span>
            </a>
            <div class="sidebar-caption">مساحة العمل</div>
            <nav class="main-nav" aria-label="التنقل الرئيسي">
                <a class="nav-link" href="index.php"><span class="nav-icon" aria-hidden="true">◫</span><span>لوحة التحكم</span></a>
                <div class="nav-group-label">إدارة الأعمال</div>
                <a class="nav-link" href="members.php"><span class="nav-icon" aria-hidden="true">◎</span><span>الهويات والعضويات</span></a>
                <a class="nav-link" href="invitations.php"><span class="nav-icon" aria-hidden="true">✉</span><span>دعوات الانضمام</span></a>
                <a class="nav-link" href="pos.php"><span class="nav-icon" aria-hidden="true">▤</span><span>المتاجر ونقاط البيع</span></a>
                <a class="nav-link active" href="inventory.php" aria-current="page"><span class="nav-icon" aria-hidden="true">▦</span><span>الكروت والمخزون</span></a>
                <a class="nav-link" href="commerce.php"><span class="nav-icon" aria-hidden="true">◷</span><span>المبيعات والمحاسبة</span></a>
                <a class="nav-link" href="network-devices.php"><span class="nav-icon" aria-hidden="true">⌁</span><span>أجهزة الشبكة</span></a>
            </nav>
            <div class="sidebar-bottom">
                <div class="security-note"><span class="security-dot" aria-hidden="true"></span><span><strong>وصول مقيّد</strong><small>تُحمى البيانات بصلاحيات حسابك</small></span></div>
                <a class="back-link" href="../index.php"><span aria-hidden="true">↩</span> العودة إلى SAM الحالي</a>
            </div>
        </aside>
        <main class="main-area">
            <header class="topbar">
                <button class="icon-button menu-button" id="menuButton" type="button" aria-label="فتح قائمة التنقل" aria-controls="sidebar" aria-expanded="false">☰</button>
                <div class="breadcrumb"><a href="index.php">SAM</a><span class="crumb-separator">/</span><strong>الكروت والمخزون</strong></div>
                <div class="topbar-actions">
                    <label class="network-picker"><span class="picker-label">الشبكة</span><select id="networkSelect" aria-label="اختر شبكة"></select></label>
                    <button class="icon-button refresh-button" id="refreshButton" type="button" aria-label="تحديث البيانات" title="تحديث البيانات">↻</button>
                    <div class="user-chip"><span class="avatar" id="userAvatar">س</span><span class="user-copy"><strong id="userName">...</strong><small id="userRole">...</small></span></div>
                </div>
            </header>
            <section class="page-content">
                <div class="page-heading">
                    <div><div class="eyebrow"><span class="live-dot" aria-hidden="true"></span> المرحلة الخامسة</div><h1>الكروت والمخزون</h1><p>ملخص مخزون الكروت وسجلات الجرد والتسويات والتحويلات في الشبكة المحددة.</p></div>
                    <div class="date-chip"><span aria-hidden="true">▦</span><span id="selectedNetworkName">جارٍ التحقق من الشبكة</span></div>
                </div>
                <div class="notice" id="pageNotice" role="status" hidden></div>
                <div class="loading-state" id="loadingState" role="status"><span class="spinner" aria-hidden="true"></span><span>جارٍ التحقق من صلاحيات الوصول...</span></div>
                <section class="pos-workspace" id="inventoryWorkspace" hidden>
                    <div class="pos-toolbar">
                        <div class="members-tabs" role="tablist" aria-label="أقسام الكروت والمخزون">
                            <button class="member-tab selected" id="tab-stock" type="button" role="tab" aria-selected="true" aria-controls="inventoryPanel" data-view="stock">رصيد الكروت</button>
                            <button class="member-tab" id="tab-inventories" type="button" role="tab" aria-selected="false" aria-controls="inventoryPanel" data-view="inventories">الجرد</button>
                            <button class="member-tab" id="tab-adjustments" type="button" role="tab" aria-selected="false" aria-controls="inventoryPanel" data-view="adjustments">التسويات</button>
                            <button class="member-tab" id="tab-transfers" type="button" role="tab" aria-selected="false" aria-controls="inventoryPanel" data-view="transfers">التحويلات</button>
                        </div>
                        <div class="member-filters">
                            <label class="search-field"><span aria-hidden="true">⌕</span><input id="searchInput" type="search" maxlength="100" placeholder="ابحث في السجلات" autocomplete="off"></label>
                            <button class="primary-button inventory-create-button" id="createInventoryButton" type="button" hidden>بدء جرد</button>
                        </div>
                    </div>
                    <div class="view-explainer" id="viewExplainer"></div>
                    <div class="table-scroll" id="inventoryPanel" role="tabpanel" aria-labelledby="tab-stock">
                        <table class="members-table">
                            <thead id="inventoryHead"></thead>
                            <tbody id="inventoryBody"></tbody>
                        </table>
                        <div class="loading-state table-loading" id="tableLoading" hidden><span class="spinner" aria-hidden="true"></span><span>جارٍ تحميل السجلات...</span></div>
                        <div class="empty-state" id="tableEmpty" hidden></div>
                    </div>
                    <div class="pagination-bar"><span id="pageStatus"></span><div><button class="page-button" id="previousPage" type="button">السابق</button><button class="page-button" id="nextPage" type="button">التالي</button></div></div>
                    <p class="pos-readonly-note">يمكن بدء جرد وحفظه كمسودة. الترحيل يقفل المحضر وقد يعطّل كروت العجز ويسجل قيودًا محاسبية؛ الفائض يحتاج استيراد الكروت الفعلية. اعتماد التحويلات يتطلب مراجعة قيمتها وتأكيدها.</p>
                </section>
                <footer class="page-footer"><span>منظومة SAM</span><span id="updatedAt"></span></footer>
            </section>
        </main>
    </div>
    <div class="sidebar-scrim" id="sidebarScrim" hidden></div>
    <dialog class="transfer-quote-dialog" id="transferQuoteDialog" aria-labelledby="transferQuoteTitle">
        <div class="transfer-quote-content">
            <h2 id="transferQuoteTitle">معاينة اعتماد التحويل</h2>
            <p id="transferQuoteSummary"></p>
            <p class="transfer-quote-warning">سيُنقل مالك الكروت للمستلم، ويُسجّل أثر قيمة التوزيع وتكلفة الشراء، ثم يُقفل المستند نهائيًا.</p>
            <dl class="transfer-quote-values">
                <div><dt>عدد الكروت</dt><dd id="quoteCardsCount"></dd></div>
                <div><dt>قيمة التوزيع / المديونية</dt><dd id="quoteDistributionValue"></dd></div>
                <div><dt>تكلفة الشراء المنقولة محاسبيًا</dt><dd id="quotePurchaseCost"></dd></div>
                <div><dt>قيمة البيع بالتجزئة</dt><dd id="quoteRetailValue"></dd></div>
                <div id="previousValueRow" hidden><dt>قيمة المستند السابقة</dt><dd id="quotePreviousValue"></dd></div>
            </dl>
            <p class="notice notice-error" id="transferQuoteError" role="alert" hidden></p>
            <div class="transfer-quote-actions">
                <button class="page-button" id="cancelTransferApproval" type="button">إلغاء</button>
                <button class="primary-button" id="confirmTransferApproval" type="button">تأكيد الاعتماد النهائي</button>
            </div>
        </div>
    </dialog>
    <dialog class="inventory-dialog" id="startInventoryDialog" aria-labelledby="startInventoryTitle">
        <form class="inventory-dialog-content" id="startInventoryForm">
            <h2 id="startInventoryTitle">بدء جرد مخزون</h2>
            <p>سيُنشأ محضر مسودة من الرصيد الحالي لحسابك في الشبكة النشطة. لا تغيّر المسودة ملكية الكروت أو أرصدتها.</p>
            <label>تاريخ الجرد<input id="inventoryDateInput" name="inventory_date" type="date" required></label>
            <label>عنوان / ملاحظات<textarea id="inventoryNotesInput" name="notes" maxlength="2000" rows="3"></textarea></label>
            <p class="notice notice-error" id="startInventoryError" role="alert" hidden></p>
            <div class="transfer-quote-actions">
                <button class="page-button" id="cancelStartInventory" type="button">إلغاء</button>
                <button class="primary-button" id="submitStartInventory" type="submit">إنشاء المسودة</button>
            </div>
        </form>
    </dialog>
    <dialog class="inventory-dialog inventory-lines-dialog" id="inventoryLinesDialog" aria-labelledby="inventoryLinesTitle">
        <div class="inventory-dialog-content">
            <h2 id="inventoryLinesTitle">تفاصيل الجرد</h2>
            <p id="inventoryLinesSummary"></p>
            <div class="inventory-lines-scroll">
                <table class="members-table">
                    <thead><tr><th>الملف</th><th>دفترية</th><th>عدد الكروت الفعلي</th><th>عدد الأوراق الفعلي</th><th>الفارق</th><th>قيمة الفرق التقديرية</th><th>ملاحظة</th></tr></thead>
                    <tbody id="inventoryLinesBody"></tbody>
                </table>
            </div>
            <label id="inventoryAdjustmentTypeWrap" hidden>تصنيف الكروت عند العجز
                <select id="inventoryAdjustmentType">
                    <option value="deficit">عجز مخزني</option>
                    <option value="lost">مفقود</option>
                    <option value="damaged">تالف</option>
                </select>
            </label>
            <p class="inventory-post-warning" id="inventoryPostWarning">تقدير قيمة الفرق يستند إلى متوسط تكلفة المحضر. عند الترحيل تُحسب قيمة القيد من تكلفة الشراء المسجلة للكروت التي تعطلها خدمة SAM.</p>
            <p class="notice notice-error" id="inventoryLinesError" role="alert" hidden></p>
            <div class="transfer-quote-actions">
                <button class="page-button" id="closeInventoryLines" type="button">إغلاق</button>
                <button class="page-button" id="saveInventoryDraft" type="button" hidden>حفظ المسودة</button>
                <button class="primary-button" id="postInventoryButton" type="button" hidden>ترحيل الجرد نهائيًا</button>
            </div>
        </div>
    </dialog>
    <script src="assets/inventory.js" defer></script>
</body>
</html>
