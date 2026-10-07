<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/RadiusService.php';

if (session_status() === PHP_SESSION_NONE) { session_start(); }
// Security: require authenticated session
if (empty($_SESSION['admin_id']) && empty($_SESSION['distributor_id'])) {
    http_response_code(403);
    die('<h2 style="text-align:center;margin-top:50px;font-family:Arial">403 - Unauthorized</h2>');
}

$service = new RadiusService(getDB());
$networkId = $service->getActiveNetworkId(); // SAM_PRINT_NETWORK_SCOPE_V1

$batchId = trim($_GET['batch_id'] ?? '');
$templateId = !empty($_GET['template_id']) ? (int)$_GET['template_id'] : null;
$isThermal = (isset($_GET['format']) && $_GET['format'] === 'thermal');
$usernamesRaw = trim($_GET['usernames'] ?? '');

$vouchers = [];
$template = null;
$batchMeta = null;

if (!empty($batchId)) {
    $data = $service->getBatchForPrint($batchId, $templateId);
    $vouchers = $data['cards'] ?? [];
    $template = $data['template'] ?? null;
    $batchMeta = $data['batch'] ?? null;
} elseif (!empty($usernamesRaw)) {
    $usernames = array_filter(array_map('trim', explode(',', $usernamesRaw)));
    if (!empty($usernames)) {
        $db = getDB();
        $in = implode(',', array_fill(0, count($usernames), '?'));
        $stmt = $db->prepare("
            SELECT m.*, rc.value as password, ug.groupname as profile_name 
            FROM radcheck rc
            LEFT JOIN um_vouchers_meta m ON m.network_id = rc.network_id AND rc.username = m.username
            LEFT JOIN radusergroup ug ON ug.network_id = rc.network_id AND rc.username = ug.username
            WHERE rc.network_id = ? AND rc.username IN ($in) AND rc.attribute = 'Cleartext-Password'
        ");
        $stmt->execute(array_merge([$networkId], $usernames));
        $vouchers = $stmt->fetchAll();
        if ($templateId) {
            $template = $service->getTemplateById($templateId);
        } elseif (!empty($vouchers[0]['profile_name'])) {
            $template = $service->getTemplateForProfile($vouchers[0]['profile_name']);
        }
    }
}

if (!$template) {
    $templates = $service->getTemplates();
    $template = !empty($templates) ? $templates[0] : [
        'id' => 1,
        'name' => 'الافتراضي',
        'grid_cols' => 4,
        'grid_rows' => 5,
        'page_margin_mm' => 5.0,
        'card_gap_mm' => 1.5,
        'network_name' => 'شبكتي اللاسلكية',
        'hotspot_url' => 'http://192.168.88.1/login',
        'border_color' => '#0078d7',
        'bg_image' => null,
        'elements_json' => null
    ];
}

$cols = max(1, (int)($template['grid_cols'] ?? 4));
$rows = max(1, (int)($template['grid_rows'] ?? 5));
$pMargin = isset($_GET['margin']) ? (float)$_GET['margin'] : (float)($template['page_margin_mm'] ?? 5.0);
$cGap = isset($_GET['gap']) ? (float)$_GET['gap'] : (float)($template['card_gap_mm'] ?? 1.5);

$a4W = 210.0;
$a4H = 297.0;
$availW = $a4W - (2 * $pMargin) - (($cols - 1) * $cGap);
$availH = $a4H - (2 * $pMargin) - (($rows - 1) * $cGap);
$cardW = round($availW / $cols, 2);
$cardH = round($availH / $rows, 2);

$perPage = $cols * $rows;
$totalPages = max(1, (int)ceil(count($vouchers) / $perPage));

$elements = [
    'title' => ['enabled' => true, 'x' => 50, 'y' => 16, 'size' => 13, 'weight' => 'bold', 'color' => '#000000', 'prefix' => ''],
    'username' => ['enabled' => true, 'x' => 50, 'y' => 42, 'size' => 15, 'weight' => 'bold', 'color' => '#000000', 'prefix' => ''],
    'password' => ['enabled' => true, 'x' => 50, 'y' => 62, 'size' => 13, 'weight' => 'normal', 'color' => '#222222', 'prefix' => 'كلمة المرور: '],
    'qr_code' => ['enabled' => true, 'x' => 84, 'y' => 50, 'size' => 45],
    'price' => ['enabled' => true, 'x' => 20, 'y' => 84, 'size' => 11, 'weight' => 'bold', 'color' => '#e74c3c', 'prefix' => ''],
    'profile' => ['enabled' => true, 'x' => 75, 'y' => 84, 'size' => 11, 'weight' => 'bold', 'color' => '#0078d7', 'prefix' => '']
];

if (!empty($template['elements_json'])) {
    $parsed = json_decode($template['elements_json'], true);
    if (is_array($parsed)) $elements = array_merge($elements, $parsed);
}

$bgImg = !empty($template['bg_image']) ? $template['bg_image'] : '';
$borderColor = !empty($template['border_color']) ? $template['border_color'] : '#0078d7';

// Filename components
$batchName = !empty($batchId) ? $batchId : 'Selected_Cards';
$profName = !empty($vouchers[0]['profile_name']) ? $vouchers[0]['profile_name'] : ($batchMeta['profile_name'] ?? 'باقة');
$countStr = count($vouchers) . ' كرت';
$dateStr = date('Y-m-d');
$adminName = $_SESSION['fullname'] ?? ($_SESSION['user'] ?? 'admin');

$docTitle = "$batchName - $profName - $countStr - $dateStr - $adminName";

require_once __DIR__ . '/includes/QrCodeGenerator.php';

// Helper for dynamic compliant QR code SVG
function renderQR(string $text, int $size = 48): string {
    return QrCodeGenerator::svg($text, $size);
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title><?= htmlspecialchars($docTitle) ?></title>
    <style>
        @page {
            size: A4 portrait;
            margin: 0mm;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Cairo", "Tajawal", "Segoe UI", Roboto, sans-serif;
            width: 210mm;
            margin: 0 auto;
            padding: 0;
        }
        .a4-page {
            width: 210mm;
            height: 297mm;
            max-height: 297mm;
            box-sizing: border-box;
            padding: <?= $pMargin ?>mm;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }
        .cards-grid {
            display: grid;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            grid-template-columns: repeat(<?= $cols ?>, 1fr);
            grid-template-rows: repeat(<?= $rows ?>, 1fr);
            gap: <?= $cGap ?>mm;
        }
        .card-box {
            position: relative;
            height: <?= $cardH ?>mm;
            width: 100%;
            box-sizing: border-box;
            border: 1px dashed <?= $borderColor ?>;
            border-radius: 4px;
            overflow: hidden;
            background-color: #ffffff;
            <?php if (!empty($bgImg)): ?>
            background-image: url('<?= htmlspecialchars($bgImg) ?>');
            background-size: 100% 100%;
            background-position: center;
            background-repeat: no-repeat;
            <?php else: ?>
            background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%);
            <?php endif; ?>
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .elem-pos {
            position: absolute;
            white-space: nowrap;
            line-height: 1.1;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        @media screen {
            body {
                background: #475569 !important;
                padding: 20px 0;
            }
            .a4-page {
                box-shadow: 0 8px 25px rgba(0,0,0,0.4);
                margin: 0 auto 25px auto;
            }
            .no-print-bar {
                position: fixed;
                top: 15px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                background: #1e293b;
                color: #fff;
                padding: 10px 20px;
                border-radius: 30px;
                display: flex;
                gap: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                align-items: center;
            }
            .no-print-bar button {
                background: #10b981;
                color: #fff;
                border: none;
                padding: 8px 18px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 13px;
                cursor: pointer;
            }
            .no-print-bar button:hover {
                background: #059669;
            }
        }
        @media print {
            .no-print-bar {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <span>📄 <?= count($vouchers) ?> كرت (<?= $totalPages ?> صفحة A4) — <?= htmlspecialchars($docTitle) ?></span>
        <div style="display:flex; gap:8px;">
            <button id="btn-bt-print" style="display:none; background:#2563eb;" onclick="printViaBluetooth()">📱 طباعة حرارية (بلوتوث)</button>
            <button onclick="window.print()">🖨️ طباعة الآن (A4 / PDF)</button>
        </div>
    </div>

    <?php for ($p = 0; $p < $totalPages; $p++): 
        $pageVouchers = array_slice($vouchers, $p * $perPage, $perPage);
    ?>
    <div class="a4-page">
        <div class="cards-grid">
            <?php foreach ($pageVouchers as $v): 
                $u = (string)$v['username'];
                $pass = isset($v['password']) ? (string)$v['password'] : '';
                $loginUrl = ($template['hotspot_url'] ?? 'http://192.168.88.1/login') . "?username=" . urlencode($u) . ($pass !== '' ? ('&password=' . urlencode($pass)) : '');
                $prof = $v['profile_name'] ?? ($v['profile'] ?? '');
                $price = !empty($v['price']) ? $v['price'] . ' YER' : '';
            ?>
            <div class="card-box">
                <?php if (!empty($elements['title']['enabled'])): ?>
                <div class="elem-pos" style="left:<?= $elements['title']['x'] ?>%; top:<?= $elements['title']['y'] ?>%; transform:translate(-50%,-50%); font-size:<?= $elements['title']['size'] ?>px; font-weight:<?= $elements['title']['weight'] ?>; color:<?= $elements['title']['color'] ?>;">
                    <?= htmlspecialchars($template['network_name'] ?? 'شبكتي') ?>
                </div>
                <?php endif; ?>

                <?php if (!empty($elements['username']['enabled'])): ?>
                <div class="elem-pos" style="left:<?= $elements['username']['x'] ?>%; top:<?= $elements['username']['y'] ?>%; transform:translate(-50%,-50%); font-size:<?= $elements['username']['size'] ?>px; font-weight:<?= $elements['username']['weight'] ?>; color:<?= $elements['username']['color'] ?>; font-family:monospace;">
                    <?= htmlspecialchars($u) ?>
                </div>
                <?php endif; ?>

                <?php if (!empty($elements['password']['enabled']) && $pass !== '' && $pass !== $u): ?>
                <div class="elem-pos" style="left:<?= $elements['password']['x'] ?>%; top:<?= $elements['password']['y'] ?>%; transform:translate(-50%,-50%); font-size:<?= $elements['password']['size'] ?>px; font-weight:<?= $elements['password']['weight'] ?>; color:<?= $elements['password']['color'] ?>; font-family:monospace;">
                    كلمة المرور: <?= htmlspecialchars($pass) ?>
                </div>
                <?php endif; ?>

                <?php if (!empty($elements['qr_code']['enabled'])): ?>
                <div class="elem-pos" style="left:<?= $elements['qr_code']['x'] ?>%; top:<?= $elements['qr_code']['y'] ?>%; transform:translate(-50%,-50%);">
                    <?= renderQR($loginUrl, (int)($elements['qr_code']['size'] ?? 45)) ?>
                </div>
                <?php endif; ?>

                <?php if (!empty($elements['price']['enabled']) && !empty($price)): ?>
                <div class="elem-pos" style="left:<?= $elements['price']['x'] ?>%; top:<?= $elements['price']['y'] ?>%; transform:translate(-50%,-50%); font-size:<?= $elements['price']['size'] ?>px; font-weight:<?= $elements['price']['weight'] ?>; color:<?= $elements['price']['color'] ?>;">
                    <?= htmlspecialchars($price) ?>
                </div>
                <?php endif; ?>

                <?php if (!empty($elements['profile']['enabled']) && !empty($prof)): ?>
                <div class="elem-pos" style="left:<?= $elements['profile']['x'] ?>%; top:<?= $elements['profile']['y'] ?>%; transform:translate(-50%,-50%); font-size:<?= $elements['profile']['size'] ?>px; font-weight:<?= $elements['profile']['weight'] ?>; color:<?= $elements['profile']['color'] ?>;">
                    <?= htmlspecialchars($prof) ?>
                </div>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endfor; ?>

    <script>
        const vouchersData = <?= json_encode(array_map(function($v) use ($template) {
            $passVal = isset($v['password']) ? (string)$v['password'] : '';
            return [
                'network_name' => $template['network_name'] ?? 'شبكتي',
                'username' => $v['username'] ?? '',
                'password' => $passVal,
                'login_url' => ($template['hotspot_url'] ?? 'http://192.168.88.1/login') . "?username=" . urlencode((string)($v['username'] ?? '')) . ($passVal !== '' ? ('&password=' . urlencode($passVal)) : ''),
                'profile' => $v['profile_name'] ?? ($v['profile'] ?? ''),
                'price' => $v['price'] ?? '',
                'login_url' => $template['hotspot_url'] ?? 'http://192.168.88.1/login'
            ];
        }, $vouchers), JSON_UNESCAPED_UNICODE) ?>;

        function printViaBluetooth() {
            if (!window.AndroidBridge) {
                alert('الطباعة المباشرة للبلوتوث تتطلب فتح الصفحة من داخل تطبيق الأندرويد');
                return;
            }
            if (!vouchersData || vouchersData.length === 0) {
                alert('لا توجد بيانات كروت');
                return;
            }
            if (confirm('هل تريد طباعة ' + vouchersData.length + ' كرت عبر طابعة البلوتوث؟')) {
                vouchersData.forEach((card, idx) => {
                    setTimeout(() => {
                        window.AndroidBridge.printCard(JSON.stringify(card));
                    }, idx * 1200);
                });
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            if (window.AndroidBridge && window.AndroidBridge.isAndroidApp && window.AndroidBridge.isAndroidApp()) {
                const btBtn = document.getElementById('btn-bt-print');
                if (btBtn) btBtn.style.display = 'inline-block';
            }
            if (window.location.search.includes('autoprint=1')) {
                setTimeout(() => { window.print(); }, 400);
            }
        });
    </script>
</body>
</html>
