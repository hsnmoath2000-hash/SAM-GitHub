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
    <title>SAM — دعوات الانضمام</title>
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
                <a class="nav-link active" href="invitations.php" aria-current="page"><span class="nav-icon" aria-hidden="true">✉</span><span>دعوات الانضمام</span></a>
                <button class="nav-link future-link" type="button" disabled><span class="nav-icon" aria-hidden="true">▤</span><span>المتاجر ونقاط البيع</span><small>لاحقًا</small></button>
                <button class="nav-link future-link" type="button" disabled><span class="nav-icon" aria-hidden="true">▦</span><span>الكروت والمخزون</span><small>لاحقًا</small></button>
                <button class="nav-link future-link" type="button" disabled><span class="nav-icon" aria-hidden="true">◷</span><span>المبيعات والمحاسبة</span><small>لاحقًا</small></button>
                <button class="nav-link future-link" type="button" disabled><span class="nav-icon" aria-hidden="true">⌁</span><span>أجهزة الشبكة</span><small>لاحقًا</small></button>
            </nav>
            <div class="sidebar-bottom">
                <div class="security-note"><span class="security-dot" aria-hidden="true"></span><span><strong>وصول مقيّد</strong><small>تُحمى البيانات بصلاحيات حسابك</small></span></div>
                <a class="back-link" href="../index.php"><span aria-hidden="true">↩</span> العودة إلى SAM الحالي</a>
            </div>
        </aside>

        <main class="main-area">
            <header class="topbar">
                <button class="icon-button menu-button" id="menuButton" type="button" aria-label="فتح قائمة التنقل" aria-controls="sidebar" aria-expanded="false">☰</button>
                <div class="breadcrumb"><a href="index.php">SAM</a><span class="crumb-separator">/</span><strong>دعوات الانضمام</strong></div>
                <div class="topbar-actions">
                    <label class="network-picker"><span class="picker-label">الشبكة</span><select id="networkSelect" aria-label="اختر شبكة"></select></label>
                    <button class="icon-button refresh-button" id="refreshButton" type="button" aria-label="تحديث الدعوات" title="تحديث الدعوات">↻</button>
                    <div class="user-chip"><span class="avatar" id="userAvatar">س</span><span class="user-copy"><strong id="userName">...</strong><small id="userRole">...</small></span></div>
                </div>
            </header>
            <section class="page-content">
                <div class="page-heading">
                    <div><div class="eyebrow"><span class="live-dot" aria-hidden="true"></span> المرحلة الثالثة</div><h1>دعوات الانضمام</h1><p>إصدار دعوة محدودة المدة لإضافة عضو إداري إلى الشبكة المحددة.</p></div>
                    <div class="date-chip"><span aria-hidden="true">✉</span><span id="selectedNetworkName">جارٍ التحقق من الشبكة</span></div>
                </div>
                <div class="notice" id="pageNotice" role="status" hidden></div>
                <div class="loading-state" id="loadingState" role="status"><span class="spinner" aria-hidden="true"></span><span>جارٍ التحقق من صلاحيات الوصول...</span></div>

                <div class="invitation-workspace" id="invitationWorkspace" hidden>
                    <section class="panel invite-form-panel" aria-labelledby="inviteFormTitle">
                        <div class="panel-heading"><div><h2 id="inviteFormTitle">إنشاء دعوة جديدة</h2><p>لا يُفعّل الحساب ولا تُمنح العضوية حتى يختار المدعو كلمة مرور ويكمل الدعوة.</p></div></div>
                        <form id="invitationForm" class="invitation-form">
                            <label>الاسم الكامل<input name="fullname" type="text" maxlength="128" autocomplete="name" required></label>
                            <label>اسم الدخول<input name="username" type="text" maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" autocomplete="username" required><small>3–64 حرفًا أو رقمًا؛ النقطة والشرطة مسموحتان.</small></label>
                            <label>رقم الهاتف اليمني<input name="phone" type="tel" maxlength="24" autocomplete="tel" placeholder="9677xxxxxxx" required></label>
                            <label>البريد الإلكتروني <span class="optional-label">(اختياري)</span><input name="email" type="email" maxlength="128" autocomplete="email"></label>
                            <label>الدور<select name="role_key" id="roleSelect" required></select></label>
                            <label>صلاحية الرابط<select name="expires_hours"><option value="24">24 ساعة</option><option value="72" selected>3 أيام</option><option value="168">7 أيام</option><option value="336">14 يومًا</option></select></label>
                            <button class="primary-button" id="createButton" type="submit">إنشاء الدعوة</button>
                        </form>
                        <div class="invite-result" id="inviteResult" hidden></div>
                    </section>
                    <section class="panel invitations-panel" aria-labelledby="invitationsTitle">
                        <div class="panel-heading"><div><h2 id="invitationsTitle">سجل الدعوات</h2><p>آخر 100 دعوة في هذه الشبكة</p></div><span id="invitationCount" class="panel-period"></span></div>
                        <div class="table-scroll">
                            <table class="members-table invitations-table">
                                <thead><tr><th>الحساب</th><th>الدور</th><th>مُصدر الدعوة</th><th>تاريخ الإنشاء</th><th>الانتهاء</th><th>الحالة</th><th>إجراء</th></tr></thead>
                                <tbody id="invitationBody"></tbody>
                            </table>
                            <div class="empty-state" id="invitationEmpty" hidden>لا توجد دعوات بعد.</div>
                        </div>
                    </section>
                </div>
                <footer class="page-footer"><span>منظومة SAM</span><span id="updatedAt"></span></footer>
            </section>
        </main>
    </div>
    <div class="sidebar-scrim" id="sidebarScrim" hidden></div>
    <script src="assets/invitations.js" defer></script>
</body>
</html>
