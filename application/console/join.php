<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <meta name="theme-color" content="#10251f">
    <title>SAM — إكمال الانضمام</title>
    <link rel="stylesheet" href="../assets/css/arabic-fonts-local.css">
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="join-page">
    <main class="join-card">
        <a class="brand join-brand" href="../index.php" aria-label="SAM">
            <span class="brand-mark">S</span>
            <span class="brand-copy"><strong>SAM</strong><small>إدارة الشبكات</small></span>
        </a>
        <div class="eyebrow"><span class="live-dot" aria-hidden="true"></span> دعوة آمنة</div>
        <h1>إكمال الانضمام</h1>
        <div class="notice" id="joinNotice" role="status" hidden></div>
        <div class="loading-state join-loading" id="joinLoading" role="status"><span class="spinner" aria-hidden="true"></span><span>جارٍ التحقق من الدعوة...</span></div>
        <section id="joinDetails" hidden>
            <p class="join-intro">أنت مدعو للانضمام إلى الشبكة التالية. فتح الرابط لا يستهلك الدعوة.</p>
            <dl class="join-summary">
                <div><dt>الاسم</dt><dd id="inviteName"></dd></div>
                <div><dt>اسم الدخول</dt><dd id="inviteUsername" dir="ltr"></dd></div>
                <div><dt>الشبكة</dt><dd id="inviteNetwork"></dd></div>
                <div><dt>الدور</dt><dd id="inviteRole"></dd></div>
                <div><dt>ينتهي الرابط</dt><dd id="inviteExpiry"></dd></div>
            </dl>
            <form id="acceptForm" class="join-form">
                <label>كلمة المرور الجديدة<input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required><small>من 12 إلى 72 بايتًا عند الإرسال.</small></label>
                <label>تأكيد كلمة المرور<input name="password_confirm" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
                <button class="primary-button" id="acceptButton" type="submit">تأكيد الانضمام</button>
            </form>
        </section>
        <a class="join-login" id="loginLink" href="../login.html" hidden>الانتقال إلى تسجيل الدخول</a>
    </main>
    <script src="assets/join.js" defer></script>
</body>
</html>
