<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Hotspot-Request, X-SAM-Network-ID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeMac(string $mac): string {
    $hex = strtoupper(preg_replace('/[^0-9A-Fa-f]/', '', rawurldecode($mac)) ?? '');
    if (strlen($hex) !== 12) return '';
    return implode(':', str_split($hex, 2));
}

function rateToBps(string $value): ?int {
    $value = trim($value);
    if (!preg_match('/^(\d+(?:\.\d+)?)([kKmMgG]?)$/', $value, $m)) return null;
    $multiplier = match (strtolower($m[2])) {
        'k' => 1000,
        'm' => 1000000,
        'g' => 1000000000,
        default => 1,
    };
    return (int)round((float)$m[1] * $multiplier);
}

function bpsToRate(int $bps): string {
    $bps = max(1000, $bps);
    if ($bps % 1000000 === 0) return (string)($bps / 1000000) . 'M';
    return (string)max(1, (int)round($bps / 1000)) . 'k';
}

function simpleRatePair(string $rate): ?array {
    $base = preg_split('/\s+/', trim($rate))[0] ?? '';
    $parts = explode('/', $base);
    if (count($parts) === 1) $parts[] = $parts[0];
    if (count($parts) !== 2) return null;
    $up = rateToBps($parts[0]);
    $down = rateToBps($parts[1]);
    return ($up && $down) ? [$up, $down] : null;
}

function speedOptions(string $maxRate): array {
    $pair = simpleRatePair($maxRate);
    if (!$pair) return [];
    $options = [];
    foreach ([25, 50, 75, 100] as $percent) {
        $up = max(64000, (int)floor($pair[0] * $percent / 100));
        $down = max(128000, (int)floor($pair[1] * $percent / 100));
        $value = bpsToRate($up) . '/' . bpsToRate($down);
        $options[$value] = ['value' => $value, 'label' => $percent . '% — ' . $value, 'percent' => $percent];
    }
    return array_values($options);
}

function verifyActiveCard(PDO $db, string $username, string $ip, string $mac, int $requestedNetworkId = 0): array {
    if ($username === '' || preg_match('/^router_[0-9]+$/', $username)) {
        respond(['success' => false, 'error' => 'invalid_card'], 400);
    }
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        respond(['success' => false, 'error' => 'invalid_ip'], 400);
    }
    $normalizedMac = normalizeMac($mac);
    if ($normalizedMac === '') respond(['success' => false, 'error' => 'invalid_mac'], 400);

    $networkSql = $requestedNetworkId > 0 ? ' AND a.network_id = ?' : '';
    $stmt = $db->prepare("SELECT a.* FROM radacct a WHERE a.username = ? AND a.framedipaddress = ? AND a.acctstoptime IS NULL{$networkSql} ORDER BY a.radacctid DESC");
    $stmt->execute($requestedNetworkId > 0 ? [$username, $ip, $requestedNetworkId] : [$username, $ip]);
    $sessions = $stmt->fetchAll();
    if (!$sessions) respond(['success' => false, 'error' => 'active_session_not_found'], 403);
    $matches = [];
    foreach ($sessions as $candidate) {
        $sessionMac = normalizeMac((string)($candidate['callingstationid'] ?? ''));
        if ($sessionMac !== '' && hash_equals($sessionMac, $normalizedMac)) {
            $matches[] = $candidate;
        }
    }
    if (count(array_unique(array_map(static fn(array $row): int => (int)$row['network_id'], $matches))) > 1) {
        respond(['success' => false, 'error' => 'NETWORK_CONTEXT_REQUIRED'], 409);
    }
    $session = $matches[0] ?? null;
    if ($session === null && count($sessions) === 1 && normalizeMac((string)($sessions[0]['callingstationid'] ?? '')) === '') $session = $sessions[0];
    if ($session === null) respond(['success' => false, 'error' => 'session_identity_mismatch'], 403);
    if ((int)($session['network_id'] ?? 0) <= 0) respond(['success' => false, 'error' => 'network_context_missing'], 403);
    $session['normalized_mac'] = $normalizedMac;
    return $session;
}

function cardState(PDO $db, string $username, array $session): array {
    $networkId = (int)$session['network_id'];
    $networkStmt = $db->prepare("SELECT id, name, logo_url, hotspot_title, theme_color, description FROM um_networks WHERE id = ? LIMIT 1");
    $networkStmt->execute([$networkId]);
    $network = $networkStmt->fetch(PDO::FETCH_ASSOC) ?: ['id' => $networkId, 'name' => '', 'logo_url' => '', 'hotspot_title' => '', 'theme_color' => '', 'description' => ''];
    $profileStmt = $db->prepare("SELECT ug.groupname, m.status, m.first_login, m.expires_at, m.validity,
                                       p.name_for_users, p.rate_limit AS package_rate_limit,
                                       p.shared_users AS package_shared_users
                                FROM radusergroup ug
                                LEFT JOIN um_vouchers_meta m ON m.network_id = ug.network_id AND m.username = ug.username
                                LEFT JOIN um_profiles_def p ON p.network_id = ug.network_id AND p.name = ug.groupname
                                WHERE ug.network_id = ? AND ug.username = ? ORDER BY ug.priority ASC LIMIT 1");
    $profileStmt->execute([$networkId, $username]);
    $profile = $profileStmt->fetch() ?: [];
    $profileName = (string)($profile['groupname'] ?? '');

    $packageRate = trim((string)($profile['package_rate_limit'] ?? ''));
    if ($packageRate === '' && $profileName !== '') {
        $groupRate = $db->prepare("SELECT value FROM radgroupreply WHERE network_id = ? AND groupname = ? AND attribute = 'Mikrotik-Rate-Limit' ORDER BY id DESC LIMIT 1");
        $groupRate->execute([$networkId, $profileName]);
        $packageRate = trim((string)($groupRate->fetchColumn() ?: ''));
    }

    $rateStmt = $db->prepare("SELECT value FROM radreply WHERE network_id = ? AND username = ? AND attribute = 'Mikrotik-Rate-Limit' ORDER BY id DESC LIMIT 1");
    $rateStmt->execute([$networkId, $username]);
    $selectedRate = trim((string)($rateStmt->fetchColumn() ?: $packageRate));

    $packageShared = max(1, (int)($profile['package_shared_users'] ?? 1));
    $sharedStmt = $db->prepare("SELECT value FROM radcheck WHERE network_id = ? AND username = ? AND attribute = 'Simultaneous-Use' ORDER BY id DESC LIMIT 1");
    $sharedStmt->execute([$networkId, $username]);
    $selectedShared = (int)($sharedStmt->fetchColumn() ?: $packageShared);
    $selectedShared = min(max(1, $selectedShared), $packageShared);

    $sessionsStmt = $db->prepare("SELECT COUNT(*) FROM radacct WHERE network_id = ? AND username = ? AND acctstoptime IS NULL");
    $sessionsStmt->execute([$networkId, $username]);
    $connected = (int)$sessionsStmt->fetchColumn();

    $disabledStmt = $db->prepare("SELECT COUNT(*) FROM radcheck WHERE network_id = ? AND username = ? AND attribute = 'Auth-Type' AND value = 'Reject'");
    $disabledStmt->execute([$networkId, $username]);
    $disabled = (int)$disabledStmt->fetchColumn() > 0;

    return [
        'success' => true,
        'network_id' => $networkId,
        'network' => [
            'id' => (int)($network['id'] ?? $networkId),
            'name' => (string)($network['name'] ?? ''),
            'logo_url' => (string)($network['logo_url'] ?? ''),
            'hotspot_title' => (string)($network['hotspot_title'] ?? ''),
            'theme_color' => (string)($network['theme_color'] ?? ''),
            'description' => (string)($network['description'] ?? ''),
        ],
        'username' => $username,
        'profile' => $profileName,
        'package_name' => (string)($profile['name_for_users'] ?: $profileName),
        'package_max_speed' => $packageRate,
        'selected_speed' => $selectedRate,
        'speed_options' => speedOptions($packageRate),
        'can_change_speed' => count(speedOptions($packageRate)) > 0,
        'package_max_devices' => $packageShared,
        'selected_devices' => $selectedShared,
        'connected_devices' => $connected,
        'device_options' => range(1, $packageShared),
        'first_login' => $profile['first_login'] ?? null,
        'expires_at' => $profile['expires_at'] ?? null,
        'validity' => $profile['validity'] ?? null,
        'account_status' => $disabled ? 'disabled' : (string)($profile['status'] ?? 'active'),
        'session' => [
            'id' => (string)$session['acctsessionid'],
            'ip' => (string)$session['framedipaddress'],
            'mac' => (string)$session['normalized_mac'],
            'nas_ip' => (string)$session['nasipaddress'],
            'started_at' => $session['acctstarttime'],
            'upload_bytes' => (int)($session['acctinputoctets'] ?? 0),
            'download_bytes' => (int)($session['acctoutputoctets'] ?? 0),
        ],
        'server_time' => date(DATE_ATOM),
    ];
}

function applyRateCoa(PDO $db, string $username, string $rate, int $networkId): array {
    $stmt = $db->prepare("SELECT a.acctsessionid, a.framedipaddress, a.nasipaddress, n.secret, n.ports
                          FROM radacct a LEFT JOIN nas n ON n.nasname = a.nasipaddress
                          WHERE a.network_id = ? AND n.network_id = a.network_id AND a.username = ? AND a.acctstoptime IS NULL AND n.secret IS NOT NULL");
    $stmt->execute([$networkId, $username]);
    $attempted = 0;
    $accepted = 0;
    while ($row = $stmt->fetch()) {
        $attempted++;
        $packet = 'User-Name = "' . addcslashes($username, "\\\"") . "\n" .
                  'Acct-Session-Id = "' . addcslashes((string)$row['acctsessionid'], "\\\"") . "\n" .
                  'Framed-IP-Address = ' . $row['framedipaddress'] . "\n" .
                  'Mikrotik-Rate-Limit := "' . addcslashes($rate, "\\\"") . "\n";
        $cmd = ['/usr/bin/radclient', '-r', '1', '-t', '2', $row['nasipaddress'] . ':' . ((int)$row['ports'] ?: 3799), 'coa', (string)$row['secret']];
        $pipes = [];
        $proc = proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) continue;
        fwrite($pipes[0], $packet);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        if (str_contains($stdout . $stderr, 'CoA-ACK')) $accepted++;
    }
    return ['attempted' => $attempted, 'accepted' => $accepted];
}

try {
    $db = getDB();
    $input = $_SERVER['REQUEST_METHOD'] === 'POST'
        ? (json_decode(file_get_contents('php://input'), true) ?: [])
        : $_GET;

    $username = trim((string)($input['username'] ?? ''));
    $ip = trim((string)($input['ip'] ?? ''));
    $mac = trim((string)($input['mac'] ?? ''));
    $requestedNetworkId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($input['network_id'] ?? 0));
    $session = verifyActiveCard($db, $username, $ip, $mac, $requestedNetworkId);
    $networkId = (int)$session['network_id'];

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        respond(cardState($db, $username, $session));
    }

    if (($_SERVER['HTTP_X_HOTSPOT_REQUEST'] ?? '') !== '1') {
        respond(['success' => false, 'error' => 'missing_hotspot_header'], 400);
    }
    $action = (string)($input['action'] ?? '');
    if ($action !== 'update_preferences') respond(['success' => false, 'error' => 'unsupported_action'], 400);

    $state = cardState($db, $username, $session);
    $allowedRates = array_column($state['speed_options'], 'value');
    $requestedRate = trim((string)($input['speed'] ?? $state['selected_speed']));
    $requestedDevices = (int)($input['devices'] ?? $state['selected_devices']);
    if ($state['can_change_speed'] && !in_array($requestedRate, $allowedRates, true)) {
        respond(['success' => false, 'error' => 'speed_exceeds_package'], 422);
    }
    if (!$state['can_change_speed']) $requestedRate = '';
    if ($requestedDevices < 1 || $requestedDevices > (int)$state['package_max_devices']) {
        respond(['success' => false, 'error' => 'devices_exceed_package'], 422);
    }

    $db->beginTransaction();
    try {
        $db->prepare("DELETE FROM radreply WHERE network_id = ? AND username = ? AND attribute = 'Mikrotik-Rate-Limit'")->execute([$networkId, $username]);
        if ($requestedRate !== '') {
            $db->prepare("INSERT INTO radreply (network_id, username, attribute, op, value) VALUES (?, ?, 'Mikrotik-Rate-Limit', ':=', ?)")->execute([$networkId, $username, $requestedRate]);
        }
        $db->prepare("DELETE FROM radcheck WHERE network_id = ? AND username = ? AND attribute = 'Simultaneous-Use'")->execute([$networkId, $username]);
        $db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, 'Simultaneous-Use', ':=', ?)")->execute([$networkId, $username, (string)$requestedDevices]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }

    $coa = $requestedRate !== '' ? applyRateCoa($db, $username, $requestedRate, $networkId) : ['attempted' => 0, 'accepted' => 0];
    $updated = cardState($db, $username, $session);
    $updated['message'] = 'تم حفظ إعداداتك ضمن حدود الباقة';
    $updated['coa'] = $coa;
    $updated['reconnect_required_for_device_limit'] = $updated['connected_devices'] > $requestedDevices;
    respond($updated);
} catch (Throwable $e) {
    error_log('hotspot-status-api: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'server_error'], 500);
}

