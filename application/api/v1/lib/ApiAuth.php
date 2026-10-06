<?php
declare(strict_types=1);

final class ApiAuth
{
    private static bool $schemaChecked = false;

    public function __construct(private PDO $db)
    {
        self::ensureSchema($this->db);
    }

    public static function ensureSchema(PDO $db): void
    {
        if (self::$schemaChecked) return;
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS um_api_access_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                family_id VARCHAR(64) NOT NULL,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                device_name VARCHAR(100) NULL,
                abilities JSON NULL,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                last_used_at DATETIME NULL,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_aat_admin (admin_id),
                INDEX idx_aat_family (family_id),
                INDEX idx_aat_expires (expires_at),
                INDEX idx_aat_revoked (revoked_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $db->exec("CREATE TABLE IF NOT EXISTS um_api_refresh_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                access_token_id INT NULL,
                family_id VARCHAR(64) NOT NULL,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                device_name VARCHAR(100) NULL,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_art_admin (admin_id),
                INDEX idx_art_family (family_id),
                INDEX idx_art_expires (expires_at),
                INDEX idx_art_revoked (revoked_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $db->exec("CREATE TABLE IF NOT EXISTS um_api_login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                user_agent VARCHAR(255) NULL,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ala_ip_time (ip_address, attempted_at),
                INDEX idx_ala_user_time (username, attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            self::$schemaChecked = true;
        } catch (Throwable $t) {
            error_log('ApiAuth ensureSchema failed: ' . $t->getMessage());
        }
    }

    private static function randomToken(string $prefix): string
    {
        return $prefix . rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function extractBearerToken(): ?string
    {
        $headers = [];
        if (function_exists('apache_request_headers')) {
            $h = apache_request_headers();
            if (is_array($h)) {
                foreach ($h as $k => $v) {
                    $headers[strtolower($k)] = $v;
                }
            }
        }
        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? $_SERVER['HTTP_X_AUTHORIZATION']
            ?? $headers['authorization']
            ?? $headers['x-authorization']
            ?? '';

        if (!empty($authHeader) && preg_match('/^Bearer\s+(.+)$/i', trim($authHeader), $m)) {
            return trim($m[1]);
        }
        return null;
    }

    public function checkRateLimit(string $username, string $ip, int $maxAttempts = 5): void
    {
        $username = trim($username);
        $ip = trim($ip);

        // Fetch count of failed login attempts and latest timestamp in last 24 hours
        $stmt = $this->db->prepare(
            'SELECT COUNT(*), MAX(attempted_at) FROM um_api_login_attempts 
             WHERE attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) 
               AND (ip_address = ? OR (username != "" AND username = ?))'
        );
        $stmt->execute([$ip, $username]);
        $row = $stmt->fetch(PDO::FETCH_NUM);
        $totalFailed = (int)($row[0] ?? 0);
        $lastAttemptTime = !empty($row[1]) ? strtotime((string)($row[1] ?? '')) : 0;

        if ($totalFailed >= $maxAttempts && $lastAttemptTime > 0) {
            // Lockout calculation:
            // 5-9 failed attempts -> Tier 0: 5 minutes (300s)
            // 10-14 failed attempts -> Tier 1: 15 minutes (900s)
            // 15-19 failed attempts -> Tier 2: 45 minutes (2700s)
            // 20+ failed attempts -> Tier 3+: 135 minutes (8100s)
            $tier = (int)floor(($totalFailed - $maxAttempts) / $maxAttempts);
            $tier = min(6, max(0, $tier));
            $lockoutSeconds = 300 * pow(3, $tier);

            $elapsedSeconds = time() - $lastAttemptTime;
            $remainingSeconds = $lockoutSeconds - $elapsedSeconds;

            if ($remainingSeconds > 0) {
                $remMinutes = (int)ceil($remainingSeconds / 60);
                $timeText = ($remMinutes > 1) ? "{$remMinutes} دقيقة" : "{$remainingSeconds} ثانية";
                throw new DomainException("RATE_LIMITED:🔒 تم قفل الحساب مؤقتاً لتجاوز الحد المسموح من محاولات الدخول الخاطئة (5 محاولات). يرجى الانتظار لمدة {$timeText} قبل المحاولة مجدداً.");
            }
        }
    }

    public function recordFailedLogin(string $username, string $ip, string $agent): void
    {
        $this->db->prepare(
            'INSERT INTO um_api_login_attempts (username, ip_address, user_agent, attempted_at) VALUES (?, ?, ?, NOW())'
        )->execute([
            mb_substr(trim($username), 0, 64),
            mb_substr(trim($ip), 0, 45),
            mb_substr(trim($agent), 0, 255)
        ]);
    }

    public function clearLoginAttempts(string $username, string $ip = ''): void
    {
        $username = trim($username);
        $ip = trim($ip);

        if (!empty($username) && !empty($ip)) {
            $stmt = $this->db->prepare('DELETE FROM um_api_login_attempts WHERE username = ? OR ip_address = ? OR attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
            $stmt->execute([$username, $ip]);
        } elseif (!empty($username)) {
            $stmt = $this->db->prepare('DELETE FROM um_api_login_attempts WHERE username = ? OR attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
            $stmt->execute([$username]);
        } elseif (!empty($ip)) {
            $stmt = $this->db->prepare('DELETE FROM um_api_login_attempts WHERE ip_address = ? OR attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
            $stmt->execute([$ip]);
        } else {
            $this->db->exec('DELETE FROM um_api_login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        }
    }

    public function login(string $username, string $password, string $deviceName, string $ip, string $agent): array
    {
        $username = trim($username);
        $this->checkRateLimit($username, $ip, 5);

        $stmt = $this->db->prepare('SELECT * FROM um_admins WHERE username = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$username]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$admin || !password_verify($password, (string)($admin['password_hash'] ?? ''))) {
            $this->recordFailedLogin($username, $ip, $agent);
            throw new DomainException('INVALID_CREDENTIALS');
        }

        $this->clearLoginAttempts($username, $ip);
        return $this->issuePair($admin, $deviceName, $ip, $agent);
    }

    public function authenticateToken(string $bearerToken): array
    {
        $hash = self::hash(trim($bearerToken));
        $stmt = $this->db->prepare(
            'SELECT t.id AS access_token_id, t.admin_id, t.family_id, t.device_name, t.expires_at AS token_expires_at, t.revoked_at,
                    a.id, a.username, a.fullname, a.phone, a.email, a.role, a.parent_id,
                    a.permissions AS user_permissions, a.data_scope, a.allowed_networks,
                    a.delegated_admin_ids, a.discount_rate, a.credit_limit, a.must_change_password,
                    r.permissions AS role_permissions
             FROM um_api_access_tokens t
             JOIN um_admins a ON a.id = t.admin_id AND a.is_active = 1
             LEFT JOIN um_roles_def r ON r.role_key = a.role
             WHERE t.token_hash = ? LIMIT 1'
        );
        $stmt->execute([$hash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) throw new DomainException('TOKEN_INVALID');
        if (!empty($row['revoked_at'])) throw new DomainException('TOKEN_REVOKED');
        if (strtotime($row['token_expires_at']) <= time()) throw new DomainException('TOKEN_EXPIRED');

        $this->db->prepare(
            'UPDATE um_api_access_tokens SET last_used_at = NOW() 
             WHERE id = ? AND (last_used_at IS NULL OR last_used_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE))'
        )->execute([$row['access_token_id']]);

        $rolePerms = json_decode((string)($row['role_permissions'] ?? '[]'), true) ?: [];
        $userPerms = json_decode((string)($row['user_permissions'] ?? '[]'), true) ?: [];
        $row['effective_permissions'] = in_array($row['role'], ['system_owner', 'superadmin'], true) ? ['*'] : array_values(array_unique(array_merge($rolePerms, $userPerms)));
        $row['delegated_ids'] = array_map('intval', json_decode((string)($row['delegated_admin_ids'] ?? '[]'), true) ?: []);
        $row['allowed_network_ids'] = array_map('intval', json_decode((string)($row['allowed_networks'] ?? '[]'), true) ?: []);
        
        $this->primeLegacyContext($row);
        return $row;
    }

    public function authenticate(): array
    {
        $token = self::extractBearerToken();
        if ($token === null) {
            throw new DomainException('TOKEN_MISSING');
        }
        return $this->authenticateToken($token);
    }

    public function refresh(string $refreshToken, string $ip, string $agent): array
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'SELECT r.id AS refresh_token_id, r.access_token_id, r.family_id, r.device_name, r.revoked_at, r.expires_at, a.* 
                 FROM um_api_refresh_tokens r
                 JOIN um_admins a ON a.id = r.admin_id AND a.is_active = 1
                 WHERE r.token_hash = ? FOR UPDATE'
            );
            $stmt->execute([self::hash(trim($refreshToken))]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$row) throw new DomainException('REFRESH_TOKEN_INVALID');
            if (!empty($row['revoked_at']) || strtotime($row['expires_at']) <= time()) {
                // If revoked refresh token is replayed outside 30s concurrent request grace window, revoke entire family
                $revokedTime = !empty($row['revoked_at']) ? strtotime((string)$row['revoked_at']) : 0;
                if (!empty($row['revoked_at']) && (time() - $revokedTime > 30)) {
                    $this->db->prepare('UPDATE um_api_access_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL')->execute([$row['family_id']]);
                    $this->db->prepare('UPDATE um_api_refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL')->execute([$row['family_id']]);
                }
                throw new DomainException('REFRESH_TOKEN_EXPIRED');
            }

            // Revoke the used refresh token and old access token (Token Rotation)
            $this->db->prepare('UPDATE um_api_refresh_tokens SET revoked_at = NOW() WHERE id = ?')->execute([$row['refresh_token_id']]);
            if (!empty($row['access_token_id'])) {
                $this->db->prepare('UPDATE um_api_access_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL')->execute([$row['access_token_id']]);
            }

            $pair = $this->issuePair($row, (string)($row['device_name'] ?? 'API client'), $ip, $agent, (string)$row['family_id'], false);
            $this->db->commit();
            return $pair;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function logout(array $actor): void
    {
        if (!empty($actor['access_token_id'])) {
            $this->db->prepare('UPDATE um_api_access_tokens SET revoked_at = NOW() WHERE id = ?')->execute([$actor['access_token_id']]);
        }
        if (!empty($actor['family_id'])) {
            $this->db->prepare('UPDATE um_api_refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL')->execute([$actor['family_id']]);
        }
    }

    public function revokeAllForAdmin(int $adminId): void
    {
        $this->db->prepare('UPDATE um_api_access_tokens SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL')->execute([$adminId]);
        $this->db->prepare('UPDATE um_api_refresh_tokens SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL')->execute([$adminId]);
    }

    public function issuePair(array $admin, string $deviceName, string $ip, string $agent, ?string $family = null, bool $transaction = true): array
    {
        $access = self::randomToken('uma_');
        $refresh = self::randomToken('umr_');
        $family ??= self::uuid();
        $accessExpiresSeconds = 3600; // 1 hour access token
        $refreshExpiresSeconds = 2592000; // 30 days refresh token

        $now = time();
        $accessExpiresAt = date('Y-m-d H:i:s', $now + $accessExpiresSeconds);
        $refreshExpiresAt = date('Y-m-d H:i:s', $now + $refreshExpiresSeconds);

        if ($transaction) $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO um_api_access_tokens (admin_id, family_id, token_hash, device_name, abilities, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                (int)$admin['id'], $family, self::hash($access),
                mb_substr($deviceName ?: 'Mobile Client', 0, 100),
                '["*"]',
                mb_substr($ip, 0, 45),
                mb_substr($agent, 0, 255),
                $accessExpiresAt
            ]);
            $accessId = (int)$this->db->lastInsertId();

            $stmt = $this->db->prepare(
                'INSERT INTO um_api_refresh_tokens (admin_id, access_token_id, family_id, token_hash, device_name, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                (int)$admin['id'], $accessId, $family, self::hash($refresh),
                mb_substr($deviceName ?: 'Mobile Client', 0, 100),
                mb_substr($ip, 0, 45),
                mb_substr($agent, 0, 255),
                $refreshExpiresAt
            ]);

            if ($transaction) $this->db->commit();
        } catch (Throwable $e) {
            if ($transaction && $this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }

        if (!isset($admin['effective_permissions'])) {
            $stmt = $this->db->prepare('SELECT permissions FROM um_roles_def WHERE role_key = ? LIMIT 1');
            $stmt->execute([(string)$admin['role']]);
            $rolePerms = json_decode((string)($stmt->fetchColumn() ?: '[]'), true) ?: [];
            $userPerms = json_decode((string)($admin['permissions'] ?? '[]'), true) ?: [];
            $admin['effective_permissions'] = in_array($admin['role'], ['system_owner', 'superadmin'], true) ? ['*'] : array_values(array_unique(array_merge($rolePerms, $userPerms)));
        }

        return [
            'token_type' => 'Bearer',
            'access_token' => $access,
            'expires_in' => $accessExpiresSeconds,
            'refresh_token' => $refresh,
            'refresh_expires_in' => $refreshExpiresSeconds,
            'user' => self::publicUser($admin),
        ];
    }

    public static function publicUser(array $row): array
    {
        return [
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'fullname' => $row['fullname'],
            'phone' => $row['phone'] ?? null,
            'email' => $row['email'] ?? null,
            'role' => $row['role'],
            'data_scope' => $row['data_scope'] ?? 'own',
            'permissions' => $row['effective_permissions'] ?? [],
            'discount_rate' => (float)($row['discount_rate'] ?? 0),
            'credit_limit' => (float)($row['credit_limit'] ?? 0),
            'must_change_password' => (bool)($row['must_change_password'] ?? false),
        ];
    }

    public function primeLegacyContext(array $actor): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        $_SESSION['logged_in'] = true;
        $_SESSION['admin_id'] = (int)$actor['admin_id'];
        $_SESSION['user'] = $actor['username'];
        $_SESSION['fullname'] = $actor['fullname'];
        $_SESSION['role'] = $actor['role'];
        $_SESSION['admin_role'] = $actor['role'];
        $_SESSION['data_scope'] = $actor['data_scope'] ?? 'own';
        $_SESSION['permissions'] = $actor['effective_permissions'] ?? [];
        $_SESSION['delegated_admin_ids'] = $actor['delegated_ids'] ?? [];
        $_SESSION['discount_rate'] = (float)($actor['discount_rate'] ?? 0);
        $_SESSION['credit_limit'] = (float)($actor['credit_limit'] ?? 0);
        $_SESSION['_account_verified_at'] = time();
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
