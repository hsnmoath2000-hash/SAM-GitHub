<?php
require_once __DIR__ . '/config.php';

// Keep the sign-in shell public, but deny an authenticated non-owner server-side.
if (!empty($_SESSION['admin_id'])) {
    requireAuth();
    $ownerAccess = getDB()->prepare('SELECT 1 FROM um_system_owners o JOIN um_admins a ON a.id=o.admin_id WHERE o.admin_id=? AND a.is_active=1 LIMIT 1');
    $ownerAccess->execute([(int)$_SESSION['admin_id']]);
    if (!$ownerAccess->fetchColumn()) {
        http_response_code(403);
        header('Cache-Control: no-store');
        exit('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>وصول غير مسموح</title><p>هذه البوابة مخصصة لمالك النظام.</p><a href="/index.php">العودة إلى لوحة الشبكة</a></html>');
    }
}
header('Cache-Control: no-store');

$appTitle = htmlspecialchars(defined('APP_NAME') ? APP_NAME : 'SAM', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$v = (string)(filemtime(__DIR__ . '/assets/js/modules/app-core.js') ?: time());
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="dark" data-portal="sovereign">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $appTitle ?> — 👑 بوابة مالك النظام والتحكم السيادي (Sovereign Console)</title>
    <meta name="application-name" content="<?= $appTitle ?> Sovereign Console">
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#d97706">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="icon" type="image/png" href="assets/img/log.png">
    <link rel="apple-touch-icon" href="assets/img/log.png">
    
    <!-- Core Unified Design System & Tokens -->
    <link rel="stylesheet" href="assets/css/sam-design-tokens.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/sam-design-system.css?v=<?= $v ?>">

    <!-- Base & Module Stylesheets -->
    <link rel="stylesheet" href="assets/css/winbox.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/sam-responsive.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/material-dashboard-prototype.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/material-dashboard-global.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/mobile-tables-forms.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/keyboard-shortcuts.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/radius-reference-theme.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/channel-settings-ui.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/dashboard-interactive.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/instant-balance.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/system-owner-console.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/roles-permissions-matrix.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/role-dashboard.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/pos-dashboard.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/distributor-wallets.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/sales-channel-reports.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/sam-page-shell.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/sam-ui-components.css?v=<?= $v ?>">
    <link rel="stylesheet" href="assets/css/topup-live-alerts.css?v=<?= $v ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@500;700;800&family=Roboto+Mono:wght@600;700&display=swap" rel="stylesheet">
    
    <script>
        window.__SAM_IS_OWNER_PORTAL = true;
        window.__SAM_OWNER_PORT = 443;
        window.__SAM_MAIN_PORT = (location.protocol === 'https:' ? 443 : 80);
    </script>

    <!-- PDF/Canvas libraries are loaded on-demand by SamPrintEngine when export is requested. -->
</head>
<body class="sam-owner-portal-shell">
    <div id="app-root">
        <!-- Application SPA loads here -->
    </div>
    <div id="modal-container"></div>

    <!-- 1. SAM Modular Frontend Engine (Core & UI) -->
    <script src="assets/js/modules/app-core.js?v=<?= (filemtime(__DIR__ . '/assets/js/modules/app-core.js') ?: time()) ?>"></script>
    <script src="assets/js/sam-ui-components.js?v=<?= (filemtime(__DIR__ . '/assets/js/sam-ui-components.js') ?: time()) ?>"></script>
    <script src="assets/js/sam-page-builder.js?v=<?= (filemtime(__DIR__ . '/assets/js/sam-page-builder.js') ?: time()) ?>"></script>
    <script src="assets/js/modules/admins-roles.js?v=<?= (filemtime(__DIR__ . '/assets/js/modules/admins-roles.js') ?: time()) ?>"></script>
    <script src="assets/js/modules/network-subscriptions.js?v=<?= (filemtime(__DIR__ . '/assets/js/modules/network-subscriptions.js') ?: time()) ?>"></script>

    <!-- 2. Sovereign Console Master Engine (Networks, Subscriptions, Admins, Server Control, Diagnostics, WhatsApp & Telegram) -->
    <script src="assets/js/system-owner-console.js?v=<?= (filemtime(__DIR__ . '/assets/js/system-owner-console.js') ?: time()) ?>"></script>
    <script src="assets/js/sam-customization.js?v=<?= (filemtime(__DIR__ . '/assets/js/sam-customization.js') ?: time()) ?>"></script>

    <!-- 3. Main Bootstrapper & Lifecycle -->
    <script src="assets/js/app.js?v=<?= $v ?>"></script>
    <script src="assets/js/material-dashboard-prototype.js?v=<?= $v ?>"></script>
    <script src="assets/js/material-dashboard-global.js?v=<?= $v ?>"></script>
    <script src="assets/js/dashboard-interactive.js?v=<?= $v ?>"></script>
    <script src="assets/js/mobile-table-cards.js?v=<?= $v ?>"></script>
    <script src="assets/js/toolbar-controls.js?v=<?= $v ?>"></script>
    <script src="assets/js/keyboard-shortcuts.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-page-shell.js?v=<?= $v ?>"></script>
</body>
</html>
