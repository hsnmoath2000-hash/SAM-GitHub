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
    <title>SAM — لوحة الإدارة</title>
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
                <a class="nav-link active" href="index.php" aria-current="page">
                    <span class="nav-icon" aria-hidden="true">◫</span><span>لوحة التحكم</span>
                </a>
                <div class="nav-group-label">إدارة الأعمال</div>
                <a class="nav-link" href="members.php">
                    <span class="nav-icon" aria-hidden="true">◎</span><span>الهويات والعضويات</span>
                </a>
                <a class="nav-link" href="invitations.php">
                    <span class="nav-icon" aria-hidden="true">✉</span><span>دعوات الانضمام</span>
                </a>
                <a class="nav-link" href="pos.php">
                    <span class="nav-icon" aria-hidden="true">▤</span><span>المتاجر ونقاط البيع</span>
                </a>
                <a class="nav-link" href="inventory.php">
                    <span class="nav-icon" aria-hidden="true">▦</span><span>الكروت والمخزون</span>
                </a>
                <a class="nav-link" href="commerce.php">
                    <span class="nav-icon" aria-hidden="true">◷</span><span>المبيعات والمحاسبة</span>
                </a>
                <a class="nav-link" href="network-devices.php">
                    <span class="nav-icon" aria-hidden="true">⌁</span><span>أجهزة الشبكة</span>
                </a>
            </nav>

            <div class="sidebar-bottom">
                <div class="security-note">
                    <span class="security-dot" aria-hidden="true"></span>
                    <span><strong>وصول مقيّد</strong><small>تُحمى البيانات بصلاحيات حسابك</small></span>
                </div>
                <a class="back-link" href="../index.php"><span aria-hidden="true">↩</span> العودة إلى SAM الحالي</a>
            </div>
        </aside>

        <main class="main-area">
            <header class="topbar">
                <button class="icon-button menu-button" id="menuButton" type="button" aria-label="فتح قائمة التنقل" aria-controls="sidebar" aria-expanded="false">☰</button>
                <div class="breadcrumb"><span>SAM</span><span class="crumb-separator">/</span><strong>لوحة التحكم</strong></div>
                <div class="topbar-actions">
                    <label class="network-picker">
                        <span class="picker-label">الشبكة</span>
                        <select id="networkSelect" aria-label="اختر شبكة"></select>
                    </label>
                    <button class="icon-button refresh-button" id="refreshButton" type="button" aria-label="تحديث البيانات" title="تحديث البيانات">↻</button>
                    <div class="user-chip">
                        <span class="avatar" id="userAvatar">س</span>
                        <span class="user-copy"><strong id="userName">...</strong><small id="userRole">...</small></span>
                    </div>
                </div>
            </header>

            <section class="page-content">
                <div class="page-heading">
                    <div>
                        <div class="eyebrow"><span class="live-dot" aria-hidden="true"></span> نظرة عامة</div>
                        <h1>مرحبًا، <span id="welcomeName">...</span></h1>
                        <p>ملخص تشغيلي محدث للشبكة المحددة.</p>
                    </div>
                    <div class="date-chip"><span aria-hidden="true">◷</span><span id="todayLabel"></span></div>
                </div>

                <div class="notice" id="pageNotice" role="status" hidden></div>
                <div class="loading-state" id="loadingState" role="status">
                    <span class="spinner" aria-hidden="true"></span>
                    <span>جارٍ تحميل بيانات الشبكة...</span>
                </div>

                <section class="stats-grid" id="statsGrid" aria-label="مؤشرات الشبكة" hidden></section>

                <div class="content-grid" id="dashboardContent" hidden>
                    <section class="panel trend-panel" id="trendPanel">
                        <div class="panel-heading">
                            <div><h2>حركة الفواتير</h2><p>عدد الفواتير المكتملة خلال آخر 7 أيام</p></div>
                            <span class="panel-period">آخر 7 أيام</span>
                        </div>
                        <div class="chart" id="salesChart" aria-label="مخطط المبيعات لآخر سبعة أيام"></div>
                    </section>

                    <section class="panel activity-panel">
                        <div class="panel-heading">
                            <div><h2>آخر النشاطات</h2><p>سجل النشاط المسموح لحسابك</p></div>
                            <span class="activity-mark" aria-hidden="true">↗</span>
                        </div>
                        <div class="activity-list" id="activityList"></div>
                    </section>
                </div>
                <footer class="page-footer"><span>منظومة SAM</span><span id="updatedAt"></span></footer>
            </section>
        </main>
    </div>
    <div class="sidebar-scrim" id="sidebarScrim" hidden></div>
    <script src="assets/app.js" defer></script>
</body>
</html>
