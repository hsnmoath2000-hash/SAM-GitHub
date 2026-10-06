<?php

// Maintenance and diagnostics are available only through CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}
require_once "/var/www/mikrotik-usermanager/config.php";

if (php_sapi_name() !== 'cli' && empty($_SESSION['admin_id']) && empty($_SESSION['system_owner_authenticated'])) {
    http_response_code(403);
    die('Forbidden: CLI or authenticated session required');
}

$pdo = new PDO("mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8mb4", DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

// 1. Ensure Multi-Network Admin Tables
$pdo->exec("
CREATE TABLE IF NOT EXISTS `um_admin_network_access` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `admin_id` INT NOT NULL,
    `network_id` INT NOT NULL,
    `access_level` ENUM('owner', 'manager', 'staff', 'pos', 'viewer') NOT NULL DEFAULT 'staff',
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `starts_at` DATETIME DEFAULT NULL,
    `expires_at` DATETIME DEFAULT NULL,
    `granted_by_admin_id` INT DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_admin_network` (`admin_id`, `network_id`),
    KEY `idx_ana_network` (`network_id`),
    KEY `idx_ana_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_admin_network_roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `admin_id` INT NOT NULL,
    `network_id` INT NOT NULL,
    `role_key` VARCHAR(64) NOT NULL,
    `data_scope` ENUM('all', 'own', 'branch', 'assigned') NOT NULL DEFAULT 'own',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_admin_network_role` (`admin_id`, `network_id`),
    KEY `idx_anr_role` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_admin_network_balances` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `admin_id` INT NOT NULL,
    `network_id` INT NOT NULL,
    `balance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `credit_limit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `discount_rate` DECIMAL(8, 4) NOT NULL DEFAULT 0.0000,
    `last_updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_admin_net_bal` (`admin_id`, `network_id`),
    KEY `idx_anb_network` (`network_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_subscribers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `full_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NOT NULL UNIQUE,
    `email` VARCHAR(128) DEFAULT NULL,
    `national_id` VARCHAR(64) DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_by_admin_id` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_sub_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_subscriber_network_memberships` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `subscriber_id` INT NOT NULL,
    `network_id` INT NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `profile_id` INT DEFAULT NULL,
    `balance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `debt_limit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `status` ENUM('active', 'suspended', 'expired', 'locked') NOT NULL DEFAULT 'active',
    `mac_lock` VARCHAR(32) DEFAULT NULL,
    `ip_address` VARCHAR(64) DEFAULT NULL,
    `expires_at` DATETIME DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_sub_net_username` (`network_id`, `username`),
    KEY `idx_snm_sub` (`subscriber_id`),
    KEY `idx_snm_network` (`network_id`),
    KEY `idx_snm_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");

// 2. Ensure Superadmin has Owner access to all networks
$superadminId = 1;
$networks = $pdo->query("SELECT id FROM um_networks")->fetchAll(PDO::FETCH_COLUMN) ?: [1];
foreach ($networks as $idx => $nid) {
    $isDefault = ($idx === 0) ? 1 : 0;
    $pdo->prepare("
        INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active)
        VALUES (?, ?, 'owner', ?, 1)
        ON DUPLICATE KEY UPDATE access_level='owner', is_active=1
    ")->execute([$superadminId, (int)$nid, $isDefault]);

    $pdo->prepare("
        INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, data_scope, is_active)
        VALUES (?, ?, 'superadmin', 'all', 1)
        ON DUPLICATE KEY UPDATE role_key='superadmin', data_scope='all', is_active=1
    ")->execute([$superadminId, (int)$nid]);
}

// 3. Populate subscriber identities from existing users if any
try {
    $existingUsers = $pdo->query("
        SELECT DISTINCT username, phone, comment as full_name, network_id 
        FROM um_vouchers_meta 
        WHERE phone IS NOT NULL AND phone != '' AND phone != '0'
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($existingUsers as $u) {
        $phone = preg_replace('/[^0-9]/', '', (string)$u['phone']);
        if (strlen($phone) < 7) continue;
        $name = trim((string)($u['full_name'] ?: ('مشترك ' . $u['username'])));
        
        $chk = $pdo->prepare("SELECT id FROM um_subscribers WHERE phone = ?");
        $chk->execute([$phone]);
        $subId = $chk->fetchColumn();
        if (!$subId) {
            $ins = $pdo->prepare("INSERT INTO um_subscribers (full_name, phone) VALUES (?, ?)");
            $ins->execute([$name, $phone]);
            $subId = (int)$pdo->lastInsertId();
        }

        $nid = (int)($u['network_id'] ?: 1);
        $chkMem = $pdo->prepare("SELECT id FROM um_subscriber_network_memberships WHERE network_id=? AND username=?");
        $chkMem->execute([$nid, $u['username']]);
        if (!$chkMem->fetchColumn()) {
            $pdo->prepare("
                INSERT INTO um_subscriber_network_memberships (subscriber_id, network_id, username, status)
                VALUES (?, ?, ?, 'active')
            ")->execute([$subId, $nid, $u['username']]);
        }
    }
} catch (Throwable $e) {}

echo "Multi-network schema and default memberships initialized successfully.\n";
?>
