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
    <title>SAM — أجهزة الشبكة</title>
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
                <a class="nav-link" href="inventory.php"><span class="nav-icon" aria-hidden="true">▦</span><span>الكروت والمخزون</span></a>
                <a class="nav-link" href="commerce.php"><span class="nav-icon" aria-hidden="true">◷</span><span>المبيعات والمحاسبة</span></a>
                <a class="nav-link active" href="network-devices.php" aria-current="page"><span class="nav-icon" aria-hidden="true">⌁</span><span>أجهزة الشبكة</span></a>
            </nav>
            <div class="sidebar-bottom">
                <div class="security-note"><span class="security-dot" aria-hidden="true"></span><span><strong>وصول مقيّد</strong><small>تُحمى البيانات بصلاحيات حسابك</small></span></div>
                <a class="back-link" href="../index.php"><span aria-hidden="true">↩</span> العودة إلى SAM الحالي</a>
            </div>
        </aside>
        <main class="main-area">
            <header class="topbar">
                <button class="icon-button menu-button" id="menuButton" type="button" aria-label="فتح قائمة التنقل" aria-controls="sidebar" aria-expanded="false">☰</button>
                <div class="breadcrumb"><a href="index.php">SAM</a><span class="crumb-separator">/</span><strong>أجهزة الشبكة</strong></div>
                <div class="topbar-actions">
                    <label class="network-picker"><span class="picker-label">الشبكة</span><select id="networkSelect" aria-label="اختر شبكة"></select></label>
                    <button class="icon-button refresh-button" id="refreshButton" type="button" aria-label="تحديث البيانات" title="تحديث البيانات">↻</button>
                    <div class="user-chip"><span class="avatar" id="userAvatar">س</span><span class="user-copy"><strong id="userName">...</strong><small id="userRole">...</small></span></div>
                </div>
            </header>
            <section class="page-content">
                <div class="page-heading">
                    <div><div class="eyebrow"><span class="live-dot" aria-hidden="true"></span> المرحلة السابعة</div><h1>أجهزة الشبكة</h1><p>أجهزة NAS ونقاط التوزيع وأصول الشبكة وحالتها المسجلة، ضمن نطاق صلاحيتك.</p></div>
                    <div class="date-chip"><span aria-hidden="true">⌁</span><span id="selectedNetworkName">جارٍ التحقق من الشبكة</span></div>
                </div>
                <div class="notice" id="pageNotice" role="status" hidden></div>
                <div class="loading-state" id="loadingState" role="status"><span class="spinner" aria-hidden="true"></span><span>جارٍ التحقق من صلاحيات الوصول...</span></div>
                <section class="pos-workspace" id="devicesWorkspace" hidden>
                    <div class="pos-toolbar">
                        <div class="members-tabs" role="tablist" aria-label="أقسام أجهزة الشبكة">
                            <button class="member-tab selected" id="tab-routers" type="button" role="tab" aria-selected="true" aria-controls="devicesPanel" data-view="routers">أجهزة NAS</button>
                            <button class="member-tab" id="tab-nodes" type="button" role="tab" aria-selected="false" aria-controls="devicesPanel" data-view="nodes">نقاط الشبكة</button>
                            <button class="member-tab" id="tab-assets" type="button" role="tab" aria-selected="false" aria-controls="devicesPanel" data-view="assets">أصول الشبكة</button>
                        </div>
                        <div class="member-filters">
                            <label class="search-field"><span aria-hidden="true">⌕</span><input id="searchInput" type="search" maxlength="100" placeholder="ابحث بالاسم أو العنوان أو الموقع" autocomplete="off"></label>
                        </div>
                    </div>
                    <div class="view-explainer" id="viewExplainer"></div>
                    <div class="table-scroll" id="devicesPanel" role="tabpanel" aria-labelledby="tab-routers">
                        <table class="members-table">
                            <thead id="devicesHead"></thead>
                            <tbody id="devicesBody"></tbody>
                        </table>
                        <div class="loading-state table-loading" id="tableLoading" hidden><span class="spinner" aria-hidden="true"></span><span>جارٍ تحميل السجلات...</span></div>
                        <div class="empty-state" id="tableEmpty" hidden></div>
                    </div>
                    <div class="pagination-bar"><span id="pageStatus"></span><div><button class="page-button" id="previousPage" type="button">السابق</button><button class="page-button" id="nextPage" type="button">التالي</button></div></div>
                    <p class="pos-readonly-note">هذه المرحلة للعرض فقط. لا تُعرض أسرار RADIUS أو كلمات مرور API أو مفاتيح Wi-Fi، ولا يمكن تعديل الأجهزة أو إرسال أوامر للراوترات.</p>
                </section>
                <footer class="page-footer"><span>منظومة SAM</span><span id="updatedAt"></span></footer>
            </section>
        </main>
    </div>
    <div class="sidebar-scrim" id="sidebarScrim" hidden></div>
    <script src="assets/network-devices.js" defer></script>
</body>
</html>
