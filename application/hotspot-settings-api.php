<?php
declare(strict_types=1);

/**
 * SAM User Manager — Dynamic Hotspot Settings API
 * Serves real-time JSON configuration directly to MikroTik Routers (/tool fetch),
 * the SAM Android Native App, and External Captive Portals.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/HotspotTemplateService.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $db = getDB();
    $service = new HotspotTemplateService($db);

    $networkId = (int)($_GET['network_id'] ?? $_POST['network_id'] ?? 0);
    $routerId = (int)($_GET['router_id'] ?? $_POST['router_id'] ?? 0);
    $nasname = trim((string)($_GET['nasname'] ?? $_POST['nasname'] ?? ''));

    // Resolve network_id from router_id or nasname if not directly provided
    if ($networkId <= 0 && $routerId > 0) {
        $stmt = $db->prepare("SELECT network_id FROM nas WHERE id = ? LIMIT 1");
        $stmt->execute([$routerId]);
        $networkId = (int)$stmt->fetchColumn();
    } elseif ($networkId <= 0 && $nasname !== '') {
        $stmt = $db->prepare("SELECT network_id FROM nas WHERE nasname = ? OR shortname = ? LIMIT 1");
        $stmt->execute([$nasname, $nasname]);
        $networkId = (int)$stmt->fetchColumn();
    }

    if ($networkId <= 0) {
        // Fallback to the first active network in the system
        $stmt = $db->query("SELECT id FROM um_networks ORDER BY id ASC LIMIT 1");
        $networkId = (int)$stmt->fetchColumn();
    }

    $studioData = $service->getStudioData($networkId);
    $s = $studioData['settings'] ?? $service->getDefaultSettings($networkId);

    // Build the clean JSON format expected by MikroTik and Android App
    $brand = $s['brand'] ?? [];
    $contacts = $s['contacts'] ?? [];
    $shortcuts = $s['shortcuts']['items'] ?? [];
    $ads = $s['ads']['items'] ?? [];
    $packages = $s['packages_config']['package_items'] ?? [];
    $stOpt = $s['status_options'] ?? [];
    $logOpt = $s['login_options'] ?? [];

    $netName = (string)($brand['network_name'] ?? 'سام');
    $logoUrl = (string)($brand['logo_url'] ?: 'http://$(hostname)/img/log.png');
    $serverApiUrl = (string)($brand['server_api_url'] ?? '');
    $whatsapp = (string)($contacts['whatsapp'] ?? '');
    $refreshSec = (int)($stOpt['auto_refresh_interval'] ?? 15);

    $linksList = [
        ["title" => "تسجيل الدخول", "url" => "http://$(hostname)/login.html"],
        ["title" => "الحالة", "url" => "http://$(hostname)/status.html"],
        ["title" => "بيانات الحالة JSON", "url" => "http://$(hostname)/app/status-api.html"]
    ];

    foreach ($shortcuts as $sc) {
        if (!empty($sc['enabled'])) {
            $linksList[] = [
                "title" => (string)($sc['title'] ?? 'رابط'),
                "url" => (string)($sc['url'] ?? '#'),
                "icon" => (string)($sc['icon'] ?? '🔗'),
                "badge" => (string)($sc['badge'] ?? '')
            ];
        }
    }

    $response = [
        'app' => 'SAM-سام',
        'network_id' => $networkId,
        'الرابط' => '$(hostname)',
        'الشبكة' => $netName,
        'النقطة' => '$(server-name)',
        'المنفذ' => '$(interface-name)',
        'domain' => 's.net',
        'icon' => $logoUrl,
        'status_api' => 'http://$(hostname)/app/status-api.html',
        'login_url' => 'http://$(hostname)/login.html',
        'server_api_url' => $serverApiUrl,
        'whatsapp' => $whatsapp,
        'auto_refresh' => !empty($stOpt['auto_refresh_enabled']),
        'refresh_seconds' => max(10, $refreshSec),
        'auto_login' => !empty($logOpt['auto_login']),
        'remember_cards' => !empty($logOpt['remember_cards']),
        'max_recent_cards' => (int)($logOpt['max_recent_cards'] ?? 3),
        'links' => $linksList,
        'shortcuts' => array_values(array_filter($shortcuts, fn($x) => !empty($x['enabled']))),
        'ads' => array_values(array_filter($ads, fn($x) => !empty($x['enabled']))),
        'packages' => array_values(array_filter($packages, fn($x) => !empty($x['enabled']))),
        'theme' => $s['theme'] ?? [],
        'contacts' => $contacts,
        'synced_at' => date(DATE_ATOM)
    ];

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to generate hotspot settings: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
