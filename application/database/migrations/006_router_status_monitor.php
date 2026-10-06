<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';

$db = getDB();
$db->exec("CREATE TABLE IF NOT EXISTS um_router_status_monitor (
    network_id INT NOT NULL,
    router_id INT NOT NULL,
    last_status ENUM('online','offline') NULL,
    last_notified_status ENUM('online','offline') NULL,
    pending_status ENUM('online','offline') NULL,
    pending_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    last_checked_at DATETIME NULL,
    changed_at DATETIME NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (network_id,router_id),
    KEY idx_router_monitor_pending (network_id,last_status,last_notified_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

echo "router_status_monitor_migration_ok\n";
