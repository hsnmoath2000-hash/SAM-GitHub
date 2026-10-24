<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';

$db = getDB();
$adminColumns = [
    'onboarding_state' => "VARCHAR(32) NOT NULL DEFAULT 'active'",
    'identity_completed_at' => 'DATETIME NULL',
];
foreach ($adminColumns as $column => $definition) {
    $check = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_admins' AND COLUMN_NAME=?");
    $check->execute([$column]);
    if (!(int) $check->fetchColumn()) {
        $db->exec("ALTER TABLE um_admins ADD COLUMN {$column} {$definition}");
    }
}

$db->exec("CREATE TABLE IF NOT EXISTS um_user_invitations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    state ENUM('issued','completed','revoked') NOT NULL DEFAULT 'issued',
    expires_at DATETIME NOT NULL,
    created_by INT NOT NULL,
    request_key VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    opened_at DATETIME NULL,
    completed_at DATETIME NULL,
    membership_json TEXT NULL,
    issuer_network_id INT NULL,
    revoked_at DATETIME NULL,
    revoked_by INT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_inv_token (token_hash),
    UNIQUE KEY uq_inv_request (created_by,request_key),
    KEY idx_inv_person (admin_id,state),
    KEY idx_inv_network_state_expiry (issuer_network_id,state,expires_at),
    KEY idx_inv_revoker (revoked_by),
    CONSTRAINT fk_um_inv_actor FOREIGN KEY (created_by) REFERENCES um_admins (id),
    CONSTRAINT fk_um_inv_person FOREIGN KEY (admin_id) REFERENCES um_admins (id),
    CONSTRAINT fk_um_inv_revoker FOREIGN KEY (revoked_by) REFERENCES um_admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

foreach ([
    'revoked_at' => 'DATETIME NULL',
    'revoked_by' => 'INT NULL',
] as $column => $definition) {
    $check = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations' AND COLUMN_NAME=?");
    $check->execute([$column]);
    if (!(int) $check->fetchColumn()) {
        $db->exec("ALTER TABLE um_user_invitations ADD COLUMN {$column} {$definition}");
    }
}

$indexCheck = $db->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations'
      AND INDEX_NAME='idx_inv_network_state_expiry'");
$indexCheck->execute();
if (!(int) $indexCheck->fetchColumn()) {
    $db->exec('ALTER TABLE um_user_invitations ADD KEY idx_inv_network_state_expiry (issuer_network_id,state,expires_at)');
}

$requestIndexCheck = $db->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations'
      AND INDEX_NAME='uq_inv_request' AND NON_UNIQUE=0");
$requestIndexCheck->execute();
if (!(int) $requestIndexCheck->fetchColumn()) {
    $db->exec('ALTER TABLE um_user_invitations ADD UNIQUE KEY uq_inv_request (created_by,request_key)');
}

$constraintCheck = $db->prepare("SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations'
      AND COLUMN_NAME='revoked_by' AND REFERENCED_TABLE_NAME='um_admins'
      AND REFERENCED_COLUMN_NAME='id'");
$constraintCheck->execute();
if (!(int) $constraintCheck->fetchColumn()) {
    $db->exec('ALTER TABLE um_user_invitations ADD CONSTRAINT fk_um_inv_revoker FOREIGN KEY (revoked_by) REFERENCES um_admins (id) ON DELETE SET NULL');
}

echo "user_invitations_migration_ok\n";
