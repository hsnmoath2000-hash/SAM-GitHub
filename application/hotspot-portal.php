<?php
declare(strict_types=1);

/**
 * SAM User Manager — Centralized External Captive Portal & Card Status
 * صفحة تسجيل الدخول وحالة الكرت المركزية الموحدة لشبكة الهوتسبوت
 * Hosted directly on SAM Server for real-time updates across all MikroTik routers.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/HotspotTemplateService.php';
require_once __DIR__ . '/includes/VoucherService.php';

try {
    $db = getDB();
    $service = new HotspotTemplateService($db);
    $voucherService = new VoucherService($db);

    // MikroTik Hotspot Inbound Parameters
    $mode = trim((string)($_GET['mode'] ?? $_POST['mode'] ?? ''));
    $linkLogin = trim((string)($_GET['link-login'] ?? $_POST['link-login'] ?? ''));
    $linkLoginOnly = trim((string)($_GET['link-login-only'] ?? $_POST['link-login-only'] ?? ''));
    $linkOrig = trim((string)($_GET['link-orig'] ?? $_POST['link-orig'] ?? ''));
    $linkStatus = trim((string)($_GET['link-status'] ?? $_POST['link-status'] ?? ''));
    $linkLogout = trim((string)($_GET['link-logout'] ?? $_POST['link-logout'] ?? ''));
    $mac = trim((string)($_GET['mac'] ?? $_POST['mac'] ?? ''));
    $ip = trim((string)($_GET['ip'] ?? $_POST['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? '')));
    $username = trim((string)($_GET['username'] ?? $_POST['username'] ?? ''));
    $error = trim((string)($_GET['error'] ?? $_POST['error'] ?? ''));
    $serverName = trim((string)($_GET['server-name'] ?? $_POST['server-name'] ?? ''));
    $hostname = trim((string)($_GET['hostname'] ?? $_POST['hostname'] ?? 's.net'));
    $networkId = (int)($_GET['network_id'] ?? $_POST['network_id'] ?? 0);

    // Determine mode: login vs status
    if ($mode === '') {
        if (isset($_GET['status']) || isset($_GET['link-status']) || (!empty($linkLogout) && !empty($username))) {
            $mode = 'status';
        } else {
            $mode = 'login';
        }
    }

    // Fallback linkLogin if not provided
    if ($linkLogin === '' && $linkLoginOnly !== '') $linkLogin = $linkLoginOnly;
    if ($linkLogin === '') {
        $linkLogin = 'http://' . ($hostname ?: '172.16.0.1') . '/login';
    }

    // Resolve network_id
    if ($networkId <= 0) {
        if ($serverName !== '') {
            $stmt = $db->prepare("SELECT network_id FROM nas WHERE shortname = ? OR nasname = ? LIMIT 1");
            $stmt->execute([$serverName, $serverName]);
            $networkId = (int)$stmt->fetchColumn();
        }
        if ($networkId <= 0) {
            $stmt = $db->query("SELECT id FROM um_networks ORDER BY id ASC LIMIT 1");
            $networkId = (int)$stmt->fetchColumn();
        }
    }

    $studioData = $service->getStudioData($networkId);
    $s = $studioData['settings'] ?? $service->getDefaultSettings($networkId);

    $theme = $s['theme'] ?? [];
    $brand = $s['brand'] ?? [];
    $contacts = $s['contacts'] ?? [];
    $packages = $s['packages_config']['package_items'] ?? [];
    $ads = $s['ads']['items'] ?? [];
    $shortcuts = $s['shortcuts']['items'] ?? [];
    $logOpt = $s['login_options'] ?? [];

    $netName = htmlspecialchars((string)($brand['network_name'] ?? 'سام'));
    $slogan = htmlspecialchars((string)($brand['slogan'] ?? 'إنترنت فائق السرعة'));
    $welcome = htmlspecialchars((string)($brand['welcome_message'] ?? 'أهلاً بك! أدخل رقم الكرت للاتصال بالإنترنت'));
    $logoUrl = htmlspecialchars((string)($brand['logo_url'] ?? ''));
    $logoIcon = htmlspecialchars((string)($brand['logo_icon'] ?? '📶'));
    $primaryColor = htmlspecialchars((string)($theme['primary_color'] ?? '#0284c7'));
    $accentColor = htmlspecialchars((string)($theme['accent_color'] ?? '#10b981'));
    $bgStart = htmlspecialchars((string)($theme['bg_gradient_start'] ?? '#0b1120'));
    $bgEnd = htmlspecialchars((string)($theme['bg_gradient_end'] ?? '#151f32'));
    $cardBg = htmlspecialchars((string)($theme['card_bg'] ?? '#151f32'));
    $cardBorder = htmlspecialchars((string)($theme['card_border'] ?? '#23334d'));
    $textMain = htmlspecialchars((string)($theme['text_color'] ?? '#f8fafc'));
    $textMuted = htmlspecialchars((string)($theme['text_muted'] ?? '#94a3b8'));
    $radius = htmlspecialchars((string)($theme['border_radius'] ?? '16px'));
    $whatsapp = htmlspecialchars((string)($contacts['whatsapp'] ?? ''));

    // Filter active ads, shortcuts, packages and POS locations
    $activeAds = array_values(array_filter($ads, fn($x) => !empty($x['enabled']) && (!empty($x['show_on_login']) || $mode === 'status')));
    $activeShortcuts = array_values(array_filter($shortcuts, fn($x) => !empty($x['enabled']) && (!empty($x['show_on_login']) || $mode === 'status')));
    $activePackages = array_values(array_filter($packages, fn($x) => !empty($x['enabled'])));

    $posConfig = $s['pos_config'] ?? [];
    $posItems = $posConfig['items'] ?? [];
    $activePos = array_values(array_filter($posItems, fn($x) => !empty($x['enabled']) && (!empty($x['show_on_login']) || $mode === 'status')));
    if (empty($activePos) && $networkId > 0) {
        $autoPos = $service->getNetworkPosAdmins($networkId);
        if (!empty($autoPos)) {
            $activePos = $autoPos;
        }
    }

    // If in status mode, load card status data
    $cardData = null;
    $statusError = '';
    if ($mode === 'status') {
        $lookupCode = $username;
        $statusRes = $voucherService->subscriberGetCardStatus($lookupCode);
        if (!empty($statusRes['success']) && !empty($statusRes['card'])) {
            $cardData = $statusRes['card'];
        } else {
            $statusError = $statusRes['error'] ?? 'لا يوجد كرت نشط متصل حالياً بهذا الجهاز';
        }
    }

    // Translate common MikroTik errors to friendly Arabic
    $friendlyError = '';
    if ($error !== '') {
        $errLower = strtolower($error);
        if (str_contains($errLower, 'invalid user') || str_contains($errLower, 'user not found') || str_contains($errLower, 'not valid')) {
            $friendlyError = 'عذراً، رقم الكرت غير صحيح أو غير موجود بالشبكة';
        } elseif (str_contains($errLower, 'uptime limit') || str_contains($errLower, 'expired') || str_contains($errLower, 'time limit')) {
            $friendlyError = 'انتهى وقت صلاحية هذا الكرت، يرجى التجديد';
        } elseif (str_contains($errLower, 'traffic limit') || str_contains($errLower, 'quota limit') || str_contains($errLower, 'transfer limit')) {
            $friendlyError = 'انتهى رصيد البيانات لهذا الكرت، يرجى شحن باقة جديدة';
        } elseif (str_contains($errLower, 'simultaneous') || str_contains($errLower, 'already logged') || str_contains($errLower, 'session limit')) {
            $friendlyError = 'هذا الكرت متصل بالفعل من جهاز آخر وصل للحد الأقصى';
        } elseif (str_contains($errLower, 'mac') || str_contains($errLower, 'lock')) {
            $friendlyError = 'هذا الكرت مقفل على جهاز آخر ولا يمكن استخدامه من هذا الجهاز';
        } else {
            $friendlyError = htmlspecialchars($error);
        }
    }
} catch (Throwable $e) {
    die('Error loading captive portal: ' . htmlspecialchars($e->getMessage()));
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="<?= $bgStart ?>">
    <title><?= $netName ?> | <?= ($mode === 'status') ? 'حالة الكرت والاتصال' : 'تسجيل الدخول' ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: <?= $primaryColor ?>;
            --accent: <?= $accentColor ?>;
            --bg-start: <?= $bgStart ?>;
            --bg-end: <?= $bgEnd ?>;
            --card-bg: <?= $cardBg ?>;
            --card-border: <?= $cardBorder ?>;
            --card-inner: #0b1322;
            --radius: <?= $radius ?>;
            --text-main: <?= $textMain ?>;
            --text-muted: <?= $textMuted ?>;
            --danger: #ef4444;
            --danger-hover: #dc2626;
            --purple: #8b5cf6;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Cairo', system-ui, -apple-system, sans-serif;
            background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg-end) 100%);
            min-height: 100vh;
            color: var(--text-main);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 16px 12px 30px;
        }
        .portal-container {
            width: 100%;
            max-width: 440px;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .brand-header {
            text-align: center;
            padding: 6px 0 2px;
        }
        .brand-logo-wrap {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--card-border);
            margin-bottom: 6px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }
        .brand-logo-img { max-width: 50px; max-height: 50px; object-fit: contain; }
        .brand-logo-icon { font-size: 30px; }
        .brand-title { font-size: 21px; font-weight: 900; color: #fff; line-height: 1.3; }
        .brand-slogan { font-size: 12.5px; color: var(--text-muted); font-weight: 600; margin-top: 2px; }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 999px;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #34d399;
            font-size: 11px;
            font-weight: 700;
            margin-top: 6px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 8px #10b981;
            animation: pulse-dot 1.8s infinite;
        }
        @keyframes pulse-dot {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.6; }
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
            padding: 18px 16px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.25);
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.4), transparent);
        }
        .card-title {
            font-size: 14.5px;
            font-weight: 800;
            color: var(--text-main);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        /* Form Controls */
        .form-group { margin-bottom: 14px; position: relative; }
        .form-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; }
        .input-wrap { position: relative; display: flex; align-items: center; }
        .form-input {
            width: 100%;
            height: 48px;
            background: rgba(0, 0, 0, 0.35);
            border: 1.5px solid var(--card-border);
            border-radius: 12px;
            padding: 0 14px 0 44px;
            color: #fff;
            font-size: 16px;
            font-weight: 700;
            font-family: monospace, 'Cairo';
            letter-spacing: 1px;
            transition: all 0.2s ease;
        }
        .form-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.25);
        }
        .input-icon-btn {
            position: absolute;
            left: 8px;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(255,255,255,0.08);
            border: none;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
        }

        .btn-submit {
            width: 100%;
            height: 48px;
            background: linear-gradient(135deg, var(--primary) 0%, #0284c7 100%);
            border: none;
            border-radius: 12px;
            color: #fff;
            font-size: 16px;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 8px 20px rgba(2, 132, 199, 0.35);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .btn-submit:active { transform: scale(0.98); }

        .btn {
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 10px 16px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            transition: 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-decoration: none;
        }
        .btn-danger { background: var(--danger); }
        .btn-danger:hover { background: var(--danger-hover); }
        .btn-success { background: var(--accent); }
        .btn-outline {
            background: rgba(255,255,255,0.04);
            border: 1px solid var(--card-border);
            color: var(--text-main);
        }
        .btn-outline:hover {
            background: rgba(255,255,255,0.08);
            border-color: #38bdf8;
        }

        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 10.5px;
            font-weight: 800;
        }

        /* Circular Balance Progress */
        .balance-circle-wrap {
            position: relative;
            width: 155px;
            height: 155px;
            margin: 10px auto;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .balance-svg {
            transform: rotate(-90deg);
            width: 155px;
            height: 155px;
        }
        .balance-bg-ring {
            fill: none;
            stroke: #1e293b;
            stroke-width: 10;
        }
        .balance-prog-ring {
            fill: none;
            stroke: url(#balance-grad);
            stroke-width: 10;
            stroke-linecap: round;
            stroke-dasharray: 440;
            stroke-dashoffset: 0;
            transition: stroke-dashoffset 1s ease;
        }
        .balance-inner-content {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
        }
        .balance-val {
            font-size: 23px;
            font-weight: 900;
            color: #38bdf8;
            letter-spacing: -0.5px;
            direction: ltr;
        }
        .balance-lbl {
            font-size: 11px;
            color: var(--text-muted);
            font-weight: 600;
        }
        .balance-pct {
            font-size: 11px;
            color: #34d399;
            font-weight: 800;
            margin-top: 2px;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid rgba(255,255,255,0.06);
        }
        .stat-box {
            background: var(--card-inner);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 8px 6px;
            text-align: center;
        }
        .stat-box span {
            display: block;
            font-size: 10px;
            color: var(--text-muted);
            margin-bottom: 2px;
        }
        .stat-box b {
            font-size: 12px;
            font-weight: 700;
            color: #fff;
            word-break: break-word;
        }

        /* Speed Tiers Grid */
        .speed-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }
        .speed-btn {
            background: var(--card-inner);
            border: 1.5px solid rgba(56, 189, 248, 0.15);
            border-radius: 12px;
            padding: 8px 6px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            color: #fff;
        }
        .speed-btn:hover {
            border-color: #38bdf8;
            transform: translateY(-2px);
        }
        .speed-btn.active {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.18);
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
        }
        .speed-btn i { font-size: 16px; display: block; margin-bottom: 2px; font-style: normal; }
        .speed-btn b { font-size: 11px; display: block; font-weight: 800; }
        .speed-btn small { font-size: 9px; color: var(--text-muted); }

        /* Devices List */
        .device-item {
            background: var(--card-inner);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 9px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            font-size: 12px;
        }

        .actions-toolbar {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .alert-box {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.35);
            border-radius: 12px;
            padding: 10px 14px;
            color: #fca5a5;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.5;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* Recent Cards Chips */
        .recent-cards-box { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
        .recent-cards-title { font-size: 12px; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; display: flex; justify-content: space-between; }
        .cards-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .card-chip {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 5px 10px;
            font-size: 12px;
            font-family: monospace;
            font-weight: 700;
            color: #38bdf8;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }
        .card-chip:hover { background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; }

        /* Ads Slider */
        .ad-slider { position: relative; border-radius: 14px; overflow: hidden; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); min-height: 95px; }
        .ad-slide { display: none; padding: 14px; }
        .ad-slide.active { display: block; animation: fadeIn 0.4s ease; }
        .ad-badge { font-size: 11px; background: var(--accent); color: #022c22; padding: 2px 8px; border-radius: 6px; font-weight: 800; display: inline-block; margin-bottom: 6px; }
        .ad-heading { font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 4px; }
        .ad-text { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
        .ad-dots { display: flex; justify-content: center; gap: 6px; padding: 6px 0 10px; }
        .ad-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.2); cursor: pointer; transition: all 0.2s ease; }
        .ad-dot.active { width: 18px; border-radius: 4px; background: var(--accent); }

        /* Packages Grid */
        .pkg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .pkg-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 12px 10px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
        }
        .pkg-card.featured { border-color: var(--accent); background: rgba(16, 185, 129, 0.05); }
        .pkg-name { font-size: 13px; font-weight: 800; color: #fff; margin-bottom: 4px; }
        .pkg-price { font-size: 15px; font-weight: 900; color: var(--accent); margin-bottom: 6px; }
        .pkg-meta { font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        .pkg-btn {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 8px;
            padding: 6px 4px;
            color: #10b981;
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            cursor: pointer;
            text-decoration: none;
            display: block;
        }

        /* Shortcuts */
        .sc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .sc-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 10px;
            text-decoration: none;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .sc-icon { font-size: 20px; }
        .sc-title { font-size: 12px; font-weight: 800; display: block; }
        .sc-desc { font-size: 10px; color: var(--text-muted); display: block; }

        /* POS Points of Sale Grid */
        .pos-section { margin-top: 2px; }
        .pos-search-input {
            width: 100%;
            height: 40px;
            background: var(--card-inner);
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 0 12px;
            font-size: 12.5px;
            color: var(--text-main);
            margin-bottom: 12px;
            font-family: inherit;
            transition: all 0.2s ease;
        }
        .pos-search-input:focus {
            border-color: #38bdf8;
            outline: none;
            box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
        }
        .pos-grid {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .pos-item-card {
            background: var(--card-inner);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 12px 14px;
            transition: all 0.2s ease;
        }
        .pos-item-card:hover {
            border-color: rgba(56, 189, 248, 0.35);
            background: rgba(255, 255, 255, 0.02);
        }
        .pos-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
        }
        .pos-name {
            font-size: 13.5px;
            font-weight: 800;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .pos-badge {
            font-size: 10px;
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.35);
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 700;
        }
        .pos-address {
            font-size: 11.5px;
            color: var(--text-muted);
            line-height: 1.4;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .pos-meta-row {
            font-size: 10.5px;
            color: #94a3b8;
            margin-bottom: 10px;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        .pos-actions {
            display: flex;
            gap: 8px;
        }
        .pos-btn {
            flex: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 7px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.2s ease;
        }
        .pos-btn-call {
            background: rgba(2, 132, 199, 0.15);
            color: #38bdf8;
            border: 1px solid rgba(2, 132, 199, 0.35);
        }
        .pos-btn-call:hover {
            background: rgba(2, 132, 199, 0.3);
        }
        .pos-btn-wa {
            background: rgba(37, 211, 102, 0.15);
            color: #25d366;
            border: 1px solid rgba(37, 211, 102, 0.35);
        }
        .pos-btn-wa:hover {
            background: rgba(37, 211, 102, 0.3);
        }
        .pos-btn-map {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.35);
            flex: 0 0 auto;
            padding: 7px 12px;
        }
        .need-card-notice {
            background: linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(16, 185, 129, 0.08));
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 12px;
            padding: 10px 14px;
            margin-top: 14px;
            text-align: center;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .need-card-notice a {
            color: #38bdf8;
            font-weight: 800;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .need-card-notice a:hover {
            text-decoration: underline;
        }

        .footer-note { text-align: center; font-size: 11px; color: #64748b; margin-top: 4px; }
        .toast {
            position: fixed;
            bottom: 24px;
            right: 50%;
            transform: translateX(50%);
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            color: #fff;
            border: 1px solid #38bdf8;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            display: none;
            z-index: 10000;
            text-align: center;
            white-space: nowrap;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
<div class="portal-container">

    <!-- Brand Header -->
    <header class="brand-header">
        <div class="brand-logo-wrap">
            <?php if ($logoUrl): ?>
                <img src="<?= $logoUrl ?>" alt="<?= $netName ?>" class="brand-logo-img">
            <?php else: ?>
                <span class="brand-logo-icon"><?= $logoIcon ?></span>
            <?php endif; ?>
        </div>
        <h1 class="brand-title"><?= $netName ?></h1>
        <p class="brand-slogan"><?= $slogan ?></p>
        <?php if ($mode === 'status'): ?>
            <div class="status-pill">
                <span class="status-dot"></span>
                <span>متصل بالإنترنت بنجاح</span>
            </div>
        <?php endif; ?>
    </header>

    <?php if ($mode === 'status'): ?>
        <!-- ========================================== -->
        <!-- 1. STATUS MODE (Direct Live Card View)    -->
        <!-- ========================================== -->
        <?php if ($cardData): 
            $c = $cardData;
            $remainingMb = (string)($c['remaining_mb'] ?? '0 MB');
            $pct = max(0, min(100, (int)($c['remaining_percent'] ?? 0)));
            $circumference = 440; // 2 * PI * 70 ≈ 440
            $offset = $circumference - ($pct / 100) * $circumference;
            $pkgName = htmlspecialchars((string)($c['name_for_users'] ?: ($c['profile_name'] ?: 'الباقة الأساسية')));
            $cardUser = htmlspecialchars((string)($c['username'] ?? ''));
            $consumedMb = htmlspecialchars((string)($c['total_consumed_mb'] ?? '0 MB'));
            $validityLabel = htmlspecialchars((string)($c['effective_validity'] ?: ($c['validity'] ?? 'غير محددة')));
            $uptimeLabel = !empty($c['uptime_limit_seconds']) ? round($c['uptime_limit_seconds'] / 3600) . ' ساعة' : 'غير محدود';
            $isSpeedChangeAllowed = !empty($c['allow_speed_change']);
            $macLockEnabled = !empty($c['mac_lock_enabled']);
            $maxDevices = max(1, (int)($c['max_shared_users'] ?? 1));
            $curAllowedDev = max(1, (int)($c['current_allowed_devices'] ?? 1));
        ?>
            <!-- Balance & Package Card -->
            <main class="card" style="text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="badge" style="background:rgba(2, 132, 199, 0.25); border:1px solid var(--primary); color:#38bdf8;" id="p-package"><?= $pkgName ?></span>
                    <span style="font-size:12px; color:var(--text-muted); font-weight:700;" id="p-card-num">كرت: <?= $cardUser ?></span>
                    <span class="badge" style="background:rgba(16, 185, 129, 0.25); border:1px solid var(--accent); color:#34d399;" id="p-status">نشط 🟢</span>
                </div>

                <!-- Circular Progress Ring -->
                <div class="balance-circle-wrap">
                    <svg class="balance-svg" viewBox="0 0 160 160">
                        <defs>
                            <linearGradient id="balance-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#38bdf8" />
                                <stop offset="100%" stop-color="var(--accent)" />
                            </linearGradient>
                        </defs>
                        <circle class="balance-bg-ring" cx="80" cy="80" r="70" />
                        <circle id="balance-ring" class="balance-prog-ring" cx="80" cy="80" r="70" style="stroke-dashoffset: <?= $offset ?>;" />
                    </svg>
                    <div class="balance-inner-content">
                        <div class="balance-val" id="p-remaining"><?= $remainingMb ?></div>
                        <div class="balance-lbl">الرصيد المتبقي</div>
                        <div class="balance-pct" id="p-percent"><?= $pct ?>% متبقي</div>
                    </div>
                </div>

                <!-- Stats Grid -->
                <div class="stats-grid">
                    <div class="stat-box">
                        <span>الاستهلاك</span>
                        <b id="p-consumed"><?= $consumedMb ?></b>
                    </div>
                    <div class="stat-box">
                        <span>الصلاحية</span>
                        <b id="p-validity"><?= $validityLabel ?></b>
                    </div>
                    <div class="stat-box">
                        <span>الوقت المتبقي</span>
                        <b id="p-uptime"><?= $uptimeLabel ?></b>
                    </div>
                </div>
            </main>

            <!-- Speed Control Card -->
            <section class="card">
                <div class="card-title">
                    <span>⚡ سرعة الكرت (CoA)</span>
                    <span class="badge" style="background:var(--primary); color:#fff;" id="p-current-speed"><?= htmlspecialchars((string)($c['effective_speed'] ?? 'قياسية')) ?></span>
                </div>

                <?php if (!$isSpeedChangeAllowed): ?>
                    <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); border-radius:10px; padding:10px; text-align:center;">
                        <div style="font-size:12px; font-weight:700; color:#f87171;">🔒 السرعة محددة بالباقة</div>
                        <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">سرعة ثابتة (<?= htmlspecialchars((string)($c['effective_speed'] ?? 'قياسية')) ?>) وفق اشتراك الباقة</div>
                    </div>
                <?php else: ?>
                    <p style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">انقر على السرعة لتطبيقها فوراً على الراوتر:</p>
                    <div class="speed-grid" id="speed-buttons-container">
                        <?php 
                        $speeds = $c['available_speeds'] ?? [];
                        foreach ($speeds as $t): 
                            $isCur = ($c['effective_speed'] === $t['rate'] || $c['effective_speed'] === $t['key']);
                            $icon = '🚀';
                            if ($t['mbps'] <= 1) $icon = '🐢';
                            elseif ($t['mbps'] <= 3) $icon = '📱';
                            elseif ($t['mbps'] <= 10) $icon = '⚡';
                            elseif ($t['mbps'] <= 50) $icon = '👑';
                            else $icon = '🔥';
                        ?>
                            <div class="speed-btn <?= $isCur ? 'active' : '' ?>" onclick="changeSpeed('<?= htmlspecialchars($t['key']) ?>')">
                                <i><?= $icon ?></i>
                                <b><?= htmlspecialchars($t['label']) ?></b>
                                <small><?= htmlspecialchars($t['rate']) ?></small>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>

            <!-- Multi-Device Limit Control -->
            <section class="card">
                <div class="card-title">
                    <span>📶 عدد الأجهزة المسموح بها</span>
                    <span class="badge" style="background:var(--purple); color:#fff;">الحد: <?= $maxDevices ?></span>
                </div>
                <p style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">حدد كم جهاز يُسمح له بالاتصال في نفس الوقت:</p>
                <div style="display:flex; gap:8px; align-items:center;">
                    <select id="device-limit-select" class="form-input" style="height:38px; padding:0 10px; font-size:13px; flex:1;">
                        <?php for ($i = 1; $i <= $maxDevices; $i++): ?>
                            <option value="<?= $i ?>" <?= $i === $curAllowedDev ? 'selected' : '' ?>>
                                <?= $i === 1 ? 'جهاز واحد فقط (1)' : "{$i} أجهزة متصلة" ?>
                            </option>
                        <?php endfor; ?>
                    </select>
                    <button class="btn btn-success" style="white-space:nowrap; height:38px; padding:0 14px;" onclick="saveDeviceLimit()">💾 حفظ</button>
                </div>
            </section>

            <!-- MAC Lock Card -->
            <section class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div>
                        <h3 style="font-size:14px; margin:0;">🔒 تثبيت الجهاز لمنع السرقة</h3>
                        <p style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">يربط الكرت بجهازك الأول لمنع مشاركته مع غيرك.</p>
                        <div id="mac-lock-value" style="font-size:10.5px; color:#38bdf8; margin-top:4px;">
                            <?= $macLockEnabled ? (!empty($c['locked_mac']) ? 'MAC المثبت: ' . htmlspecialchars($c['locked_mac']) : 'بانتظار أول دخول لتثبيت MAC تلقائيًا') : 'التثبيت غير مفعل' ?>
                        </div>
                    </div>
                    <button id="mac-lock-toggle" class="btn <?= $macLockEnabled ? 'btn-danger' : 'btn-success' ?>" data-enabled="<?= $macLockEnabled ? '1' : '0' ?>" style="min-width:95px; padding:8px 12px; font-size:12px;" onclick="toggleMacLock()">
                        <?= $macLockEnabled ? '🔓 تعطيل' : '🔒 تفعيل' ?>
                    </button>
                </div>
            </section>

            <!-- Connected Devices List -->
            <section class="card">
                <div class="card-title">
                    <span>👥 الأجهزة المتصلة حالياً (<span id="dev-count">0</span>)</span>
                    <button class="btn btn-outline" style="padding:4px 8px; font-size:11px;" onclick="loadDevices()">⟳ تحديث</button>
                </div>
                <div id="devices-list">
                    <div style="text-align:center; padding:10px; font-size:11.5px; color:var(--text-muted);">جاري فحص الأجهزة المتصلة...</div>
                </div>
            </section>

            <!-- Actions Toolbar: Refresh & Logout -->
            <div class="actions-toolbar">
                <button class="btn btn-outline" style="width:100%;" onclick="refreshStatus(true)">
                    🔄 تحديث الرصيد
                </button>
                <button class="btn btn-danger" style="width:100%;" onclick="doHotspotLogout()">
                    🚪 تسجيل الخروج
                </button>
            </div>

        <?php else: ?>
            <!-- Card Not Found / Offline State -->
            <main class="card" style="text-align:center; padding:24px 16px;">
                <div style="font-size:36px; margin-bottom:8px;">⚠️</div>
                <h2 style="font-size:16px; font-weight:800; color:#f87171; margin-bottom:6px;">لا توجد جلسة نشطة متصلة</h2>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;"><?= htmlspecialchars($statusError) ?></p>
                <a href="hotspot-portal.php?mode=login&link-login=<?= urlencode($linkLogin) ?>" class="btn-submit" style="text-decoration:none;">
                    <span>🔑</span>
                    <span>تسجيل الدخول للشبكة</span>
                </a>
            </main>
        <?php endif; ?>

    <?php else: ?>
        <!-- ========================================== -->
        <!-- 2. LOGIN MODE (Enter Voucher PIN)         -->
        <!-- ========================================== -->
        <main class="card">
            <h2 class="card-title">
                <span>🔑 تسجيل الدخول للشبكة</span>
            </h2>

            <?php if ($friendlyError): ?>
                <div class="alert-box">
                    <span>⚠️</span>
                    <span><?= $friendlyError ?></span>
                </div>
            <?php endif; ?>

            <form name="loginForm" id="loginForm" action="<?= htmlspecialchars($linkLogin) ?>" method="post">
                <input type="hidden" name="dst" value="<?= htmlspecialchars($linkOrig) ?>">
                <input type="hidden" name="popup" value="true">

                <div class="form-group">
                    <label class="form-label" for="card_number">رقم الكرت / كود الاشتراك:</label>
                    <div class="input-wrap">
                        <input type="text" id="card_number" name="username" class="form-input" placeholder="أدخل رقم الكرت هنا" value="<?= htmlspecialchars($username) ?>" required autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                        <button type="button" class="input-icon-btn" onclick="pasteCard()" title="لصق الكرت">📋</button>
                    </div>
                </div>

                <input type="hidden" id="card_password" name="password" value="<?= htmlspecialchars($username) ?>">

                <button type="submit" class="btn-submit" id="submitBtn">
                    <span>⚡</span>
                    <span>دخول للإنترنت</span>
                </button>
            </form>

            <!-- Saved Cards History -->
            <div class="recent-cards-box" id="recentCardsBox" style="display:none;">
                <div class="recent-cards-title">
                    <span>💳 آخر الكروت المستخدمة:</span>
                    <span style="cursor:pointer; font-size:10px; color:#ef4444;" onclick="clearRecentCards()">مسح</span>
                </div>
                <div class="cards-chip-list" id="recentCardsList"></div>
            </div>

            <!-- Need a card? Jump to POS -->
            <div class="need-card-notice">
                <span>🛒 لا تملك كرتاً للاتصال بالإنترنت؟</span>
                <a href="#pos-section">مراكز ونقاط البيع ⬇️</a>
            </div>
        </main>
    <?php endif; ?>

    <!-- Authorized Points of Sale / Retailers (Visible Before & After Login) -->
    <?php if (!empty($activePos)): ?>
    <section class="card pos-section" id="pos-section">
        <h2 class="card-title">
            <span>🏪 مراكز ونقاط بيع وتوزيع الكروت</span>
            <span class="badge" style="background:rgba(56, 189, 248, 0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);"><?= count($activePos) ?> مركز</span>
        </h2>
        <p style="font-size:11.5px; color:var(--text-muted); margin-bottom:12px;">
            تفضل بزيارة أقرب نقطة بيع معتمدة لشراء وتجديد باقات وكروت الإنترنت أو اطلبها مباشرة عبر الواتساب:
        </p>

        <?php if (count($activePos) > 2): ?>
            <input type="text" id="posSearchInput" class="pos-search-input" placeholder="🔍 ابحث عن اسم المحل، الحي، أو الشارع..." onkeyup="filterPosLocations()">
        <?php endif; ?>

        <div class="pos-grid" id="posListContainer">
            <?php foreach ($activePos as $pos): 
                $posName = htmlspecialchars((string)($pos['name'] ?? 'نقطة بيع معتمدة'));
                $posPhone = htmlspecialchars((string)($pos['phone'] ?? ''));
                $posWa = htmlspecialchars((string)($pos['whatsapp'] ?? $posPhone));
                $posAddress = htmlspecialchars((string)($pos['address'] ?? ''));
                $posHours = htmlspecialchars((string)($pos['working_hours'] ?? ''));
                $posBadge = htmlspecialchars((string)($pos['badge'] ?? 'نقطة معتمدة'));
                $posNotes = htmlspecialchars((string)($pos['notes'] ?? ''));
                $posMap = htmlspecialchars((string)($pos['map_url'] ?? ''));
                $cleanPhone = preg_replace('/[^0-9]/', '', $posPhone);
                $cleanWa = preg_replace('/[^0-9]/', '', $posWa);
            ?>
                <div class="pos-item-card" data-search="<?= mb_strtolower($posName . ' ' . $posAddress . ' ' . $posNotes) ?>">
                    <div class="pos-header">
                        <div class="pos-name">
                            <span>🏬</span>
                            <span><?= $posName ?></span>
                        </div>
                        <?php if ($posBadge): ?>
                            <span class="pos-badge"><?= $posBadge ?></span>
                        <?php endif; ?>
                    </div>

                    <?php if ($posAddress): ?>
                        <div class="pos-address">
                            <span>📍</span>
                            <span><?= $posAddress ?></span>
                        </div>
                    <?php endif; ?>

                    <?php if ($posHours || $posNotes): ?>
                        <div class="pos-meta-row">
                            <?php if ($posHours): ?>
                                <span>⏰ <?= $posHours ?></span>
                            <?php endif; ?>
                            <?php if ($posNotes): ?>
                                <span>💳 <?= $posNotes ?></span>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>

                    <div class="pos-actions">
                        <?php if ($cleanPhone): ?>
                            <a href="tel:<?= $cleanPhone ?>" class="pos-btn pos-btn-call">
                                <span>📞</span>
                                <span>اتصال (<?= $posPhone ?>)</span>
                            </a>
                        <?php endif; ?>

                        <?php if ($cleanWa): 
                            $waMsg = 'مرحباً، أود شراء كرت إنترنت من شبكة ' . $netName . ' عبر مركز ' . ($pos['name'] ?? '');
                        ?>
                            <a href="https://wa.me/<?= $cleanWa ?>?text=<?= urlencode($waMsg) ?>" target="_blank" class="pos-btn pos-btn-wa">
                                <span>💬</span>
                                <span>طلب بالواتساب</span>
                            </a>
                        <?php endif; ?>

                        <?php if ($posMap): ?>
                            <a href="<?= $posMap ?>" target="_blank" class="pos-btn pos-btn-map" title="الموقع على الخريطة">
                                <span>🗺️</span>
                            </a>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Network Ads Slider (Unified across login & status) -->
    <?php if (!empty($activeAds)): ?>
    <section class="card" style="padding:10px;">
        <div class="ad-slider" id="adSlider">
            <?php foreach ($activeAds as $idx => $ad): ?>
                <div class="ad-slide <?= $idx === 0 ? 'active' : '' ?>" data-idx="<?= $idx ?>">
                    <span class="ad-badge"><?= htmlspecialchars((string)($ad['badge'] ?? 'عرض مميز')) ?></span>
                    <h3 class="ad-heading"><?= htmlspecialchars((string)($ad['title'] ?? '')) ?></h3>
                    <p class="ad-text"><?= htmlspecialchars((string)($ad['desc'] ?? '')) ?></p>
                </div>
            <?php endforeach; ?>
        </div>
        <div class="ad-dots" id="adDots">
            <?php foreach ($activeAds as $idx => $ad): ?>
                <span class="ad-dot <?= $idx === 0 ? 'active' : '' ?>" onclick="goToAdSlide(<?= $idx ?>)"></span>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Packages Grid -->
    <?php if (!empty($activePackages)): ?>
    <section class="card">
        <h2 class="card-title">💎 باقات وعروض الشبكة</h2>
        <div class="pkg-grid">
            <?php foreach ($activePackages as $pkg): 
                $isFree = (($pkg['package_type'] ?? '') === 'free') || ((float)($pkg['price'] ?? 0) <= 0);
                $pPrice = $isFree ? 0.0 : (float)($pkg['price'] ?? 0);
            ?>
                <div class="pkg-card <?= !empty($pkg['featured']) ? 'featured' : ($isFree ? 'free-pkg' : '') ?>">
                    <div>
                        <div class="pkg-name"><?= htmlspecialchars((string)($pkg['name'] ?? '')) ?></div>
                        <div class="pkg-price"><?= $isFree ? 'مجاناً 🎁' : htmlspecialchars((string)$pPrice) . ' ريال' ?></div>
                        <div class="pkg-meta">
                            <span>⏳ <?= htmlspecialchars((string)($pkg['validity'] ?? '30 يوم')) ?></span>
                            <span>📊 <?= htmlspecialchars((string)($pkg['quota_label'] ?? 'غير محدود')) ?></span>
                            <?php if (!empty($pkg['rate_limit']) && $pkg['rate_limit'] !== 'سرعة قياسية'): ?>
                                <span>⚡ <?= htmlspecialchars((string)$pkg['rate_limit']) ?></span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php if ($whatsapp): 
                        $waText = $isFree 
                            ? 'مرحباً، أود الحصول على الباقة المجانية ' . ($pkg['name'] ?? '') . ' من شبكة ' . $netName
                            : 'مرحباً، أود الاشتراك في باقة ' . ($pkg['name'] ?? '') . ' بسعر ' . $pPrice . ' ريال من شبكة ' . $netName;
                    ?>
                        <a href="https://wa.me/<?= preg_replace('/[^0-9]/', '', $whatsapp) ?>?text=<?= urlencode($waText) ?>" target="_blank" class="pkg-btn <?= $isFree ? 'pkg-btn-free' : '' ?>">
                            <?= $isFree ? 'طلب الباقة المجانية 🎁' : 'طلب الباقة ⚡' ?>
                        </a>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Shortcuts & Internal Services -->
    <?php if (!empty($activeShortcuts)): ?>
    <section class="card">
        <h2 class="card-title">🌟 خدمات وروابط سريعة</h2>
        <div class="sc-grid">
            <?php foreach ($activeShortcuts as $sc): ?>
                <a href="<?= htmlspecialchars((string)($sc['url'] ?? '#')) ?>" target="_blank" class="sc-item">
                    <span class="sc-icon"><?= htmlspecialchars((string)($sc['icon'] ?? '🔗')) ?></span>
                    <div>
                        <span class="sc-title"><?= htmlspecialchars((string)($sc['title'] ?? 'رابط')) ?></span>
                        <span class="sc-desc"><?= htmlspecialchars((string)($sc['badge'] ?? 'خدمة')) ?></span>
                    </div>
                </a>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Apps & Downloads Banner -->
    <section class="card" style="border:1px solid rgba(56, 189, 248, 0.3); background:linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:28px;">📲</span>
                <div>
                    <h3 style="font-size:14px; font-weight:800; color:#fff;">تطبيقات منظومة SAM الرسمية</h3>
                    <p style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">حمل تطبيق المشتركين أو تطبيق الإدارة ونقاط البيع مباشرة على هاتفك</p>
                </div>
            </div>
            <a href="apps.html" class="btn btn-outline" style="border-color:#38bdf8; color:#38bdf8; font-weight:800; text-decoration:none; padding:8px 16px;">
                <span>📥</span>
                <span>مركز التحميل والتثبيت</span>
            </a>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer-note">
        <p><?= htmlspecialchars((string)($brand['footer_text'] ?? 'SAM User Manager | جميع الحقوق محفوظة')) ?></p>
        <p style="margin-top:4px; font-size:10px;">IP: <?= htmlspecialchars($ip) ?> | MAC: <?= htmlspecialchars($mac) ?></p>
    </footer>

</div>

<!-- Toast -->
<div id="toast" class="toast"></div>

<script>
const CURRENT_CARD = '<?= !empty($cardData['username']) ? htmlspecialchars($cardData['username']) : '' ?>';
const LOGOUT_URL = '<?= !empty($linkLogout) ? htmlspecialchars($linkLogout) : ('http://' . ($hostname ?: 's.net') . '/logout?erase-cookie=on') ?>';

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3200);
}

// ==========================================
// STATUS MODE JAVASCRIPT FUNCTIONS
// ==========================================
async function refreshStatus(showMsg = false) {
    if (!CURRENT_CARD) {
        window.location.reload();
        return;
    }
    if (showMsg) showToast('جاري تحديث الرصيد...');
    try {
        const res = await fetch(`api.php?action=subscriber_get_status&code=${encodeURIComponent(CURRENT_CARD)}`).then(r => r.json());
        if (res && res.success && res.card) {
            const c = res.card;
            document.getElementById('p-package').innerText = c.name_for_users || c.profile_name || 'الباقة الأساسية';
            document.getElementById('p-remaining').innerText = (typeof c.remaining_mb === 'number') ? `${c.remaining_mb} MB` : c.remaining_mb;
            const pct = Math.max(0, Math.min(100, Number(c.remaining_percent) || 0));
            document.getElementById('p-percent').innerText = `${pct}% متبقي`;
            document.getElementById('p-consumed').innerText = `${c.total_consumed_mb} MB`;
            document.getElementById('p-uptime').innerText = c.uptime_limit_seconds ? `${Math.round(c.uptime_limit_seconds / 3600)} ساعة` : 'غير محدود';

            const ring = document.getElementById('balance-ring');
            if (ring) {
                const circumference = 440;
                ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;
            }
            if (showMsg) showToast('تم تحديث الرصيد بنجاح');
            loadDevices();
        }
    } catch (e) {
        if (showMsg) showToast('تعذر تحديث البيانات');
    }
}

async function changeSpeed(tierKey) {
    if (!CURRENT_CARD) return;
    showToast('جاري تطبيق السرعة على الراوتر...');
    try {
        const res = await fetch('api.php?action=subscriber_change_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: CURRENT_CARD, speed: tierKey })
        }).then(r => r.json());

        if (res && res.success) {
            showToast(res.message || 'تم تطبيق السرعة الجديدة');
            setTimeout(() => refreshStatus(false), 500);
        } else {
            showToast(res?.error || 'تعذر تغيير السرعة');
        }
    } catch (err) {
        showToast('خطأ في الاتصال بالخادم');
    }
}

async function saveDeviceLimit() {
    if (!CURRENT_CARD) return;
    const sel = document.getElementById('device-limit-select');
    const count = parseInt(sel?.value) || 1;

    showToast('جاري حفظ حد الأجهزة...');
    try {
        const res = await fetch('api.php?action=subscriber_set_max_devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: CURRENT_CARD, max_devices: count })
        }).then(r => r.json());

        if (res && res.success) {
            showToast(res.message || 'تم حفظ عدد الأجهزة');
        } else {
            showToast(res?.error || 'تعذر حفظ عدد الأجهزة');
        }
    } catch (err) {
        showToast('خطأ في الاتصال بالخادم');
    }
}

async function toggleMacLock() {
    if (!CURRENT_CARD) return;
    const btn = document.getElementById('mac-lock-toggle');
    const enable = btn?.dataset.enabled !== '1';
    if (!enable && !confirm('سيتم إزالة MAC المثبت والسماح للكرت بالدخول من جهاز آخر. هل تريد المتابعة؟')) return;
    if (btn) btn.disabled = true;
    showToast(enable ? 'جاري تفعيل تثبيت MAC...' : 'جاري تعطيل تثبيت MAC...');
    try {
        const res = await fetch('api.php?action=subscriber_set_mac_lock', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({code: CURRENT_CARD, enabled: enable})
        }).then(r => r.json());
        if (!res?.success) {
            showToast(res?.error || 'تعذر تحديث تثبيت MAC');
        } else {
            showToast(res.message || 'تم التحديث بنجاح');
            setTimeout(() => window.location.reload(), 400);
        }
    } catch (e) { 
        showToast('خطأ في الاتصال بالخادم'); 
    } finally { 
        if (btn) btn.disabled = false; 
    }
}

async function loadDevices() {
    if (!CURRENT_CARD) return;
    const container = document.getElementById('devices-list');
    if (!container) return;
    try {
        const res = await fetch(`api.php?action=subscriber_get_devices&code=${encodeURIComponent(CURRENT_CARD)}`).then(r => r.json());
        const devices = res?.devices || [];
        const countEl = document.getElementById('dev-count');
        if (countEl) countEl.innerText = devices.length;

        if (devices.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:10px; font-size:11.5px; color:var(--text-muted);">لا توجد أجهزة متصلة حالياً بهذا الكرت</div>';
            return;
        }

        container.innerHTML = devices.map(d => `
            <div class="device-item">
                <div>
                    <div style="font-weight:700; color:#38bdf8;">📱 ${escapeHtml(d.callingstationid || 'جهاز متصل')}</div>
                    <div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">IP: ${escapeHtml(d.framedipaddress || '-')} | استهلاك: ${d.session_mb} MB</div>
                </div>
                <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="kickDevice('${escapeHtml(d.callingstationid)}')">
                    🚫 فصل
                </button>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function kickDevice(mac) {
    if (!confirm(`هل تريد بالتأكيد فصل وطرد هذا الجهاز (${mac}) من الكرت؟`)) return;
    showToast('جاري إرسال أمر فصل الجهاز...');
    try {
        const res = await fetch('api.php?action=subscriber_disconnect_device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: CURRENT_CARD, mac: mac })
        }).then(r => r.json());

        if (res && res.success) {
            showToast(res.message || 'تم فصل الجهاز بنجاح');
            loadDevices();
        } else {
            showToast(res?.error || 'تعذر فصل الجهاز');
        }
    } catch (err) {
        showToast('خطأ في إرسال أمر الفصل');
    }
}

async function doHotspotLogout() {
    if (!confirm('هل تريد تسجيل الخروج وقطع اتصال الإنترنت عن هذا الجهاز؟')) return;
    showToast('جاري تسجيل الخروج وفصل الاتصال...');

    // Disconnect server-side
    try {
        await fetch('api.php?action=subscriber_disconnect_device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: CURRENT_CARD })
        });
    } catch (e) {}

    // Navigate to router logout URL
    setTimeout(() => {
        window.location.href = LOGOUT_URL;
    }, 300);
}

// ==========================================
// LOGIN MODE JAVASCRIPT FUNCTIONS
// ==========================================
const cardInput = document.getElementById('card_number');
const passInput = document.getElementById('card_password');
const form = document.getElementById('loginForm');

if (cardInput && passInput) {
    cardInput.addEventListener('input', function() {
        passInput.value = this.value;
    });
}

const STORAGE_KEY = 'sam_hotspot_recent_cards_<?= $networkId ?>';

function getRecentCards() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch(e) {
        return [];
    }
}

function saveCard(card) {
    if (!card || !card.trim()) return;
    card = card.trim();
    let cards = getRecentCards().filter(c => c !== card);
    cards.unshift(card);
    if (cards.length > 3) cards = cards.slice(0, 3);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch(e) {}
}

function renderRecentCards() {
    const cards = getRecentCards();
    const box = document.getElementById('recentCardsBox');
    const list = document.getElementById('recentCardsList');
    if (!box || !list) return;
    if (!cards || cards.length === 0) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    list.innerHTML = cards.map(c => `
        <span class="card-chip" onclick="useCard('${escapeHtml(c)}')">💳 ${escapeHtml(c)}</span>
    `).join('');
}

function useCard(card) {
    if (!cardInput || !passInput || !form) return;
    cardInput.value = card;
    passInput.value = card;
    form.submit();
}

function clearRecentCards() {
    localStorage.removeItem(STORAGE_KEY);
    renderRecentCards();
}

function pasteCard() {
    if (!cardInput || !passInput) return;
    navigator.clipboard.readText().then(text => {
        if (text) {
            cardInput.value = text.trim();
            passInput.value = text.trim();
        }
    }).catch(() => {
        const manual = prompt('أدخل رقم الكرت:');
        if (manual) {
            cardInput.value = manual.trim();
            passInput.value = manual.trim();
        }
    });
}

if (form) {
    form.addEventListener('submit', function() {
        const val = cardInput.value.trim();
        if (val) {
            saveCard(val);
            passInput.value = val;
        }
    });
}

function filterPosLocations() {
    const q = (document.getElementById('posSearchInput')?.value || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.pos-item-card');
    cards.forEach(c => {
        const text = (c.dataset.search || '').toLowerCase();
        if (!q || text.includes(q)) {
            c.style.display = '';
        } else {
            c.style.display = 'none';
        }
    });
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Ads Slider Auto-Rotation
let currentAdIdx = 0;
const slides = document.querySelectorAll('.ad-slide');
const dots = document.querySelectorAll('.ad-dot');

function goToAdSlide(idx) {
    if (!slides.length) return;
    currentAdIdx = (idx + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === currentAdIdx));
    dots.forEach((d, i) => d.classList.toggle('active', i === currentAdIdx));
}

if (slides.length > 1) {
    setInterval(() => goToAdSlide(currentAdIdx + 1), 4000);
}

// Init on load
<?php if ($mode === 'status' && $cardData): ?>
    loadDevices();
    setInterval(() => refreshStatus(false), 25000);
<?php else: ?>
    renderRecentCards();
<?php endif; ?>
</script>
</body>
</html>
