<?php
declare(strict_types=1);

$settingsFile = getenv('UM_CONFIG_FILE') ?: '/etc/mikrotik-usermanager/app-config.php';
if (!is_file($settingsFile) || !is_readable($settingsFile)) {
    error_log('User Manager protected configuration is unavailable');
    http_response_code(500);
    exit('Service configuration error');
}

$settings = require $settingsFile;
if (!is_array($settings)) {
    error_log('User Manager protected configuration is invalid');
    http_response_code(500);
    exit('Service configuration error');
}

$required = ['db_host', 'db_port', 'db_name', 'db_user', 'db_pass'];
foreach ($required as $key) {
    if (!array_key_exists($key, $settings) || $settings[$key] === '') {
        error_log('User Manager protected configuration is incomplete');
        http_response_code(500);
        exit('Service configuration error');
    }
}

define('DB_HOST', (string) $settings['db_host']);
define('DB_PORT', (int) $settings['db_port']);
define('DB_NAME', (string) $settings['db_name']);
define('DB_USER', (string) $settings['db_user']);
define('DB_PASS', (string) $settings['db_pass']);
define('APP_NAME', (string) ($settings['app_name'] ?? 'MikroTik User Manager'));
define('APP_VERSION', (string) ($settings['app_version'] ?? '1.0.0'));
define('DEFAULT_COA_PORT', (int) ($settings['default_coa_port'] ?? 3799));
define('RADCLIENT_PATH', (string) ($settings['radclient_path'] ?? '/usr/bin/radclient'));

date_default_timezone_set((string) ($settings['timezone'] ?? 'Asia/Aden'));

if (!function_exists('normalizeYemenPhone')) {
    /** Normalize Yemeni mobile numbers used by account and WhatsApp records. */
    function normalizeYemenPhone(string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', $phone) ?? '';
        if (str_starts_with($digits, '00967')) $digits = substr($digits, 5);
        elseif (str_starts_with($digits, '967') && strlen($digits) === 12) $digits = substr($digits, 3);
        elseif (str_starts_with($digits, '07')) $digits = substr($digits, 1);
        elseif (str_starts_with($digits, '0') && (strlen($digits) === 10 || strlen($digits) === 9)) $digits = substr($digits, 1);

        if (strlen($digits) === 9) {
            return '967' . $digits;
        }
        if (str_starts_with($digits, '967') && strlen($digits) === 12) {
            return $digits;
        }
        return $digits;
    }
}

if (!function_exists('isValidYemenPhone')) {
    /** Validate 9-digit Yemeni mobile number (77, 78, 70, 71, 73) */
    function isValidYemenPhone(string $phone): bool
    {
        $digits = preg_replace('/[^0-9]/', '', $phone) ?? '';
        if (str_starts_with($digits, '00967')) $digits = substr($digits, 5);
        elseif (str_starts_with($digits, '967') && strlen($digits) === 12) $digits = substr($digits, 3);
        elseif (str_starts_with($digits, '0')) $digits = substr($digits, 1);
        return (bool) preg_match('/^(77|78|70|71|73)\d{7}$/', $digits);
    }
}

if (!function_exists('samGenerateUniqueNetworkCode')) {
    /**
     * Generate a guaranteed unique network code (e.g. NET-016) avoiding duplicate key collisions.
     */
    function samGenerateUniqueNetworkCode(PDO $db, ?string $preferredCode = null): string
    {
        $preferredCode = trim((string)$preferredCode);
        if ($preferredCode !== '') {
            $clean = strtoupper($preferredCode);
            $chk = $db->prepare("SELECT id FROM um_networks WHERE code = ? LIMIT 1");
            $chk->execute([$clean]);
            if (!$chk->fetch()) {
                return $clean;
            }
        }

        // Find the maximum numeric suffix among existing NET-XXX codes
        $stmt = $db->query("SELECT code FROM um_networks WHERE code LIKE 'NET-%'");
        $maxNum = 0;
        if ($stmt) {
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (preg_match('/^NET-(\d+)$/i', (string)$row['code'], $m)) {
                    $n = (int)$m[1];
                    if ($n > $maxNum) {
                        $maxNum = $n;
                    }
                }
            }
        }

        $maxId = (int)$db->query("SELECT MAX(id) FROM um_networks")->fetchColumn();
        $nextNum = max($maxNum + 1, $maxId + 1, 1);

        $chkStmt = $db->prepare("SELECT id FROM um_networks WHERE code = ? LIMIT 1");
        do {
            $candidate = 'NET-' . str_pad((string)$nextNum, 3, '0', STR_PAD_LEFT);
            $chkStmt->execute([$candidate]);
            if (!$chkStmt->fetch()) {
                return $candidate;
            }
            $nextNum++;
        } while (true);
    }
}



$requestedAction = (string) ($_GET['action'] ?? '');
$scriptName = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
if (str_starts_with($requestedAction, 'distributor_') || str_contains($scriptName, 'distributor')) {
    $sessionCookieName = 'UMDISTSESSID';
} elseif (str_starts_with($requestedAction, 'subscriber_') || str_contains($scriptName, 'subscriber')) {
    $sessionCookieName = 'UMSUBSESSID';
} else {
    $sessionCookieName = 'UMADMINSESSID';
}

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (!empty($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
$httpsOnly = (bool) ($settings['https_only'] ?? $isHttps);
$sessionCookieLifetime = (int) ($settings['session_cookie_lifetime'] ?? (30 * 86400));
$sessionIdleSeconds = (int) ($settings['session_idle_seconds'] ?? (86400 * 7));
$sessionAbsoluteSeconds = max($sessionIdleSeconds, (int) ($settings['session_absolute_seconds'] ?? (86400 * 30)));

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.gc_maxlifetime', (string) $sessionAbsoluteSeconds);
ini_set('session.cookie_lifetime', (string) $sessionCookieLifetime);
session_name($sessionCookieName);
session_set_cookie_params([
    'lifetime' => $sessionCookieLifetime,
    'path' => '/',
    'domain' => '',
    'secure' => $httpsOnly,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$sessionNow = time();
$sessionCreated = (int) ($_SESSION['_created_at'] ?? $sessionNow);
$sessionLastActivity = (int) ($_SESSION['_last_activity'] ?? $sessionNow);
if (($sessionNow - $sessionLastActivity) > $sessionIdleSeconds || ($sessionNow - $sessionCreated) > $sessionAbsoluteSeconds) {
    $_SESSION = [];
    session_regenerate_id(true);
    $sessionCreated = $sessionNow;
}
$_SESSION['_created_at'] = $sessionCreated;
$_SESSION['_last_activity'] = $sessionNow;

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+03:00'",
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $exception) {
            error_log('User Manager database connection failed: ' . $exception->getCode());
            http_response_code(500);
            exit('Service temporarily unavailable');
        }
    }
    return $pdo;
}

function jsonResponse(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function destroySessionState(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => (bool) $params['secure'],
            'httponly' => (bool) $params['httponly'],
            'samesite' => $params['samesite'] ?: 'Lax',
        ]);
    }
    session_destroy();
}

function syncAuthFromBearer(): bool
{
    require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
    $bearerToken = ApiAuth::extractBearerToken();
    if ($bearerToken !== null) {
        try {
            $auth = new ApiAuth(getDB());
            $actor = $auth->authenticateToken($bearerToken);
            if (session_status() === PHP_SESSION_NONE) {
                @session_start();
            }
            if (empty($_SESSION['logged_in']) || (int)($_SESSION['admin_id'] ?? 0) !== (int)$actor['id']) {
                $_SESSION['logged_in'] = true;
                $_SESSION['admin_id'] = (int)$actor['id'];
                $_SESSION['user'] = $actor['username'];
                $_SESSION['fullname'] = $actor['fullname'];
                $_SESSION['role'] = $actor['role'];
                $_SESSION['admin_role'] = $actor['role'];
                $_SESSION['data_scope'] = $actor['data_scope'] ?? 'own';
                $_SESSION['permissions'] = $actor['permissions'] ?? [];
                $_SESSION['discount_rate'] = (float)($actor['discount_rate'] ?? 0);
                $_SESSION['credit_limit'] = (float)($actor['credit_limit'] ?? 0);
                $_SESSION['_created_at'] = time();
                $_SESSION['_last_activity'] = time();
            }
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }
    return false;
}

function requireAuth(): void
{
    // 1. Check for Bearer Token (Mobile App & External API clients)
    require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
    $bearerToken = ApiAuth::extractBearerToken();
    if ($bearerToken !== null) {
        try {
            $auth = new ApiAuth(getDB());
            $actor = $auth->authenticateToken($bearerToken);
            if (session_status() === PHP_SESSION_NONE) {
                @session_start();
            }
            if (empty($_SESSION['logged_in']) || (int)($_SESSION['admin_id'] ?? 0) !== (int)$actor['id']) {
                $_SESSION['logged_in'] = true;
                $_SESSION['admin_id'] = (int)$actor['id'];
                $_SESSION['user'] = $actor['username'];
                $_SESSION['fullname'] = $actor['fullname'];
                $_SESSION['role'] = $actor['role'];
                $_SESSION['admin_role'] = $actor['role'];
                $_SESSION['data_scope'] = $actor['data_scope'] ?? 'own';
                $_SESSION['permissions'] = $actor['permissions'] ?? [];
                $_SESSION['discount_rate'] = (float)($actor['discount_rate'] ?? 0);
                $_SESSION['credit_limit'] = (float)($actor['credit_limit'] ?? 0);
                $_SESSION['_created_at'] = time();
                $_SESSION['_last_activity'] = time();
            }
            return; // Authenticated successfully via Bearer Token!
        } catch (DomainException $de) {
            $code = $de->getMessage();
            $msg = match ($code) {
                'TOKEN_EXPIRED' => 'Token has expired',
                'TOKEN_REVOKED' => 'Token has been revoked',
                'TOKEN_INVALID' => 'Invalid token',
                default => 'Unauthorized'
            };
            jsonResponse(['success' => false, 'error' => $msg, 'code' => $code], 401);
        } catch (Throwable $e) {
            jsonResponse(['success' => false, 'error' => 'Unauthorized', 'code' => 'AUTH_FAILED'], 401);
        }
    }

    // 2. Legacy Session Cookie Authentication (Web Dashboard)
    if (empty($_SESSION['logged_in']) || empty($_SESSION['admin_id'])) {
        jsonResponse(['success' => false, 'error' => 'Unauthorized', 'code' => 'SESSION_UNAUTHORIZED'], 401);
    }

    $lastVerified = (int) ($_SESSION['_account_verified_at'] ?? 0);
    if ((time() - $lastVerified) >= 60) {
        $stmt = getDB()->prepare('SELECT role, is_active FROM um_admins WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $_SESSION['admin_id']]);
        $account = $stmt->fetch();
        if (!$account || (int) $account['is_active'] !== 1) {
            destroySessionState();
            jsonResponse(['success' => false, 'error' => 'Unauthorized', 'code' => 'ACCOUNT_INACTIVE'], 401);
        }
        $_SESSION['role'] = (string) $account['role'];
        $_SESSION['admin_role'] = (string) $account['role'];
        $_SESSION['_account_verified_at'] = time();
    }
}

