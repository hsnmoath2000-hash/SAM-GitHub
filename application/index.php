<?php
require_once __DIR__ . '/config.php';
$appTitle = htmlspecialchars(defined('APP_NAME') ? APP_NAME : 'SAM', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$v = (string)max(
    filemtime(__DIR__ . '/assets/js/modules/app-core.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/modules/users-cards.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/system-owner-console.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/sam-customization.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/modules/networks-partnerships.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/modules/sales-pos.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/sales-channel-reports.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/modules/card-warehouses.js') ?: 0,
    filemtime(__DIR__ . '/assets/js/sam-print-engine.js') ?: 0
);
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $appTitle ?> — SAM</title>
    <meta name="application-name" content="<?= $appTitle ?>">
    <link rel="manifest" href="manifest.json">
    <link rel="stylesheet" href="assets/css/network-onboarding.css?v=<?= filemtime(__DIR__.'/assets/css/network-onboarding.css') ?>">
    <meta name="theme-color" content="#0078d7">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="icon" type="image/png" href="assets/img/log.png">
    <link rel="apple-touch-icon" href="assets/img/icon-192.png">
    
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
    <!-- Arabic Fonts - Local (Google Fonts fallback for blocked regions) -->
    <link rel="stylesheet" href="assets/css/arabic-fonts-local.css?v=<?= $v ?>">
    <!-- Google Fonts fallback for Roboto Mono (LTR/code font) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@600;700&display=swap" rel="stylesheet">
    

    <!-- PDF and heavy rendering modules are loaded on-demand via SamPrintEngine -->
</head>
<body>
    <div id="app-root">
        <!-- Application SPA loads here -->
    </div>

    <!-- 1. SAM Modular Frontend Engine -->
    <script src="assets/js/modules/app-core.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-product-catalog.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-ui-components.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-page-builder.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/dashboard.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/admins-roles.js?v=<?= $v ?>"></script>
    <script src="assets/js/roles-permissions-matrix.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/users-cards.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/card-warehouses.js?v=<?= (filemtime(__DIR__ . '/assets/js/modules/card-warehouses.js') ?: time()) ?>"></script>
    <script src="assets/js/modules/sales-pos.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/finance-accounting.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/assets-inventory.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/network-routers.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/templates-designer.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/hotspot-designer.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/networks-partnerships.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/network-subscriptions.js?v=<?= $v ?>"></script>
    <script src="assets/js/modules/notifications-logs.js?v=<?= $v ?>"></script>

    <!-- 2. Integrated Feature Plugins & Enhancements -->
    <script src="assets/js/system-owner-console.js?v=<?= (filemtime(__DIR__ . '/assets/js/system-owner-console.js') ?: time()) ?>"></script>
    <script src="assets/js/recurring-expenses.js?v=<?= $v ?>"></script>
    <script src="assets/js/purchases.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-customization.js?v=<?= $v ?>"></script>
    <script src="assets/js/instant-balance.js?v=<?= $v ?>"></script>
    <script src="assets/js/print-layout-controls.js?v=<?= $v ?>"></script>
    <script src="assets/js/sales-availability.js?v=<?= $v ?>"></script>
    <script src="assets/js/table-customizer.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-print-engine.js?v=<?= $v ?>"></script>

    <!-- 3. Main Bootstrapper & Lifecycle -->
    <script src="assets/js/app.js?v=<?= $v ?>"></script>
    <script src="assets/js/material-dashboard-prototype.js?v=<?= $v ?>"></script>
    <script src="assets/js/material-dashboard-global.js?v=<?= $v ?>"></script>
    <script src="assets/js/dashboard-interactive.js?v=<?= $v ?>"></script>
    <script src="assets/js/mobile-table-cards.js?v=<?= $v ?>"></script>
    <script src="assets/js/toolbar-controls.js?v=<?= $v ?>"></script>
    <script src="assets/js/keyboard-shortcuts.js?v=<?= $v ?>"></script>
    <script src="assets/js/mobile-table-labels.js?v=<?= $v ?>"></script>
    <script src="assets/js/channel-settings-ui.js?v=<?= $v ?>"></script>
    <script src="assets/js/samui-module-adapters.js?v=<?= $v ?>"></script>
    <script src="assets/js/sam-page-shell.js?v=<?= $v ?>"></script>

    <script src="assets/js/role-dashboard.js?v=<?= $v ?>"></script>
    <script src="assets/js/pos-dashboard.js?v=<?= $v ?>"></script>
    <script src="assets/js/distributor-wallets.js?v=<?= $v ?>"></script>
    <script src="assets/js/sales-channel-reports.js?v=<?= $v ?>"></script>
    <script src="assets/js/topup-live-alerts.js?v=<?= $v ?>"></script>
    <script src="assets/js/network-onboarding.js?v=<?= filemtime(__DIR__ . '/assets/js/network-onboarding.js') ?>"></script>
    <script src="assets/js/pwa-install.js?v=<?= filemtime(__DIR__.'/assets/js/pwa-install.js') ?>"></script>
</body>
</html>
