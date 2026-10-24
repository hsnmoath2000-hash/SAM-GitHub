/*M!999999\- enable the sandbox mode */ 

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `billing_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `billing_plans` (
  `id` int(8) NOT NULL AUTO_INCREMENT,
  `planName` varchar(128) DEFAULT NULL,
  `planId` varchar(128) DEFAULT NULL,
  `planType` varchar(128) DEFAULT NULL,
  `planTimeBank` varchar(128) DEFAULT NULL,
  `planTimeType` varchar(128) DEFAULT NULL,
  `planTimeRefillCost` varchar(128) DEFAULT NULL,
  `planBandwidthUp` varchar(128) DEFAULT NULL,
  `planBandwidthDown` varchar(128) DEFAULT NULL,
  `planTrafficTotal` varchar(128) DEFAULT NULL,
  `planTrafficUp` varchar(128) DEFAULT NULL,
  `planTrafficDown` varchar(128) DEFAULT NULL,
  `planTrafficRefillCost` varchar(128) DEFAULT NULL,
  `planRecurring` varchar(128) DEFAULT NULL,
  `planRecurringPeriod` varchar(128) DEFAULT NULL,
  `planRecurringBillingSchedule` varchar(128) NOT NULL DEFAULT 'Fixed',
  `planCost` varchar(128) DEFAULT NULL,
  `planSetupCost` varchar(128) DEFAULT NULL,
  `planTax` varchar(128) DEFAULT NULL,
  `planCurrency` varchar(128) DEFAULT NULL,
  `planGroup` varchar(128) DEFAULT NULL,
  `planActive` varchar(32) NOT NULL DEFAULT 'yes',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `planName` (`planName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dictionary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dictionary` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `Type` varchar(30) DEFAULT NULL,
  `Attribute` varchar(64) DEFAULT NULL,
  `Value` varchar(64) DEFAULT NULL,
  `Format` varchar(20) DEFAULT NULL,
  `Vendor` varchar(32) DEFAULT NULL,
  `RecommendedOP` varchar(32) DEFAULT NULL,
  `RecommendedTable` varchar(32) DEFAULT NULL,
  `RecommendedHelper` varchar(32) DEFAULT NULL,
  `RecommendedTooltip` varchar(512) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice` (
  `id` int(32) NOT NULL AUTO_INCREMENT,
  `user_id` int(32) DEFAULT NULL COMMENT 'user id of the userbillinfo table',
  `batch_id` int(32) DEFAULT NULL COMMENT 'batch id of the batch_history table',
  `date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `status_id` int(10) NOT NULL DEFAULT 1 COMMENT 'the status of the invoice from invoice_status',
  `type_id` int(10) NOT NULL DEFAULT 1 COMMENT 'the type of the invoice from invoice_type',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int(32) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(32) NOT NULL COMMENT 'invoice id of the invoices table',
  `plan_id` int(32) DEFAULT NULL COMMENT 'the plan_id of the billing_plans table',
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'the amount cost of an item',
  `tax_amount` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'the tax amount for an item',
  `total` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'the total amount',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoice_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_status` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `value` varchar(32) NOT NULL DEFAULT '' COMMENT 'status value',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoice_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_type` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `value` varchar(32) NOT NULL DEFAULT '' COMMENT 'type value',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('login','support','dashboard') NOT NULL,
  `content` longtext NOT NULL,
  `created_on` datetime DEFAULT NULL,
  `created_by` varchar(32) DEFAULT NULL,
  `modified_on` datetime DEFAULT NULL,
  `modified_by` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `nas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `nas` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `nasname` varchar(128) NOT NULL,
  `shortname` varchar(32) DEFAULT NULL,
  `type` varchar(30) DEFAULT 'other',
  `ports` int(5) DEFAULT NULL,
  `secret` varchar(60) NOT NULL DEFAULT 'secret',
  `provision_token` varchar(64) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_bootstrap_at` datetime DEFAULT NULL,
  `bootstrap_ip` varchar(45) DEFAULT NULL,
  `server` varchar(64) DEFAULT NULL,
  `community` varchar(50) DEFAULT NULL,
  `description` varchar(200) DEFAULT 'RADIUS Client',
  `api_user` varchar(64) DEFAULT 'admin',
  `api_password` varchar(128) DEFAULT '',
  `api_port` int(11) DEFAULT 8728,
  `www_port` int(11) DEFAULT NULL,
  `winbox_port` int(11) NOT NULL DEFAULT 8291,
  `winbox_listen_port` int(11) DEFAULT NULL,
  `api_listen_port` int(11) DEFAULT NULL,
  `api_ssl` tinyint(1) DEFAULT 0,
  `api_enabled` tinyint(1) DEFAULT 1,
  `ftp_port` int(11) DEFAULT 21,
  `hotspot_dir` varchar(64) DEFAULT 'hotspot',
  `last_sync_time` datetime DEFAULT NULL,
  `created_by_admin_id` int(11) DEFAULT NULL,
  `created_by_name` varchar(128) DEFAULT NULL,
  `um_proxy_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `um_proxy_ip` varchar(45) DEFAULT NULL,
  `um_proxy_secret` varchar(64) DEFAULT NULL,
  `um_proxy_auth_port` int(11) NOT NULL DEFAULT 1812,
  `um_proxy_acct_port` int(11) NOT NULL DEFAULT 1813,
  `network_id` int(11) NOT NULL,
  `um_proxy_router_id` int(11) DEFAULT NULL,
  `work_types` varchar(128) NOT NULL DEFAULT 'hotspot,usermanager',
  PRIMARY KEY (`id`),
  UNIQUE KEY `provision_token` (`provision_token`),
  KEY `nasname` (`nasname`),
  KEY `idx_nas_network` (`network_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `node`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `node` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `time` datetime NOT NULL DEFAULT '0000-00-00 00:00:00' COMMENT 'Time of last checkin',
  `netid` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(100) NOT NULL,
  `latitude` varchar(20) NOT NULL,
  `longitude` varchar(20) NOT NULL,
  `owner_name` varchar(50) NOT NULL COMMENT 'node owner''s name',
  `owner_email` varchar(50) NOT NULL COMMENT 'node owner''s email address',
  `owner_phone` varchar(25) NOT NULL COMMENT 'node owner''s phone number',
  `owner_address` varchar(100) NOT NULL COMMENT 'node owner''s address',
  `approval_status` varchar(1) NOT NULL COMMENT 'approval status: A (accepted), R (rejected), P (pending)',
  `ip` varchar(20) NOT NULL COMMENT 'ROBIN',
  `mac` varchar(20) NOT NULL COMMENT 'ROBIN',
  `uptime` varchar(100) NOT NULL COMMENT 'ROBIN',
  `robin` varchar(20) NOT NULL COMMENT 'ROBIN: robin version',
  `batman` varchar(20) NOT NULL COMMENT 'ROBIN: batman version',
  `memfree` varchar(20) NOT NULL COMMENT 'ROBIN',
  `nbs` mediumtext NOT NULL COMMENT 'ROBIN: neighbor list',
  `gateway` varchar(20) NOT NULL COMMENT 'ROBIN: nearest gateway',
  `gw-qual` varchar(20) NOT NULL COMMENT 'ROBIN: quality of nearest gateway',
  `routes` mediumtext NOT NULL COMMENT 'ROBIN: route to nearest gateway',
  `users` char(3) NOT NULL COMMENT 'ROBIN: current number of users',
  `kbdown` varchar(20) NOT NULL COMMENT 'ROBIN: downloaded kb',
  `kbup` varchar(20) NOT NULL COMMENT 'ROBIN: uploaded kb',
  `hops` varchar(3) NOT NULL COMMENT 'ROBIN: hops to gateway',
  `rank` varchar(3) NOT NULL COMMENT 'ROBIN: ???, not currently used for anything',
  `ssid` varchar(20) NOT NULL COMMENT 'ROBIN: ssid, not currently used for anything',
  `pssid` varchar(20) NOT NULL COMMENT 'ROBIN: pssid, not currently used for anything',
  `gateway_bit` tinyint(1) NOT NULL COMMENT 'ROBIN derivation: is this node a gateway?',
  `memlow` varchar(20) NOT NULL COMMENT 'ROBIN derivation: lowest reported memory on the node',
  `usershi` char(3) NOT NULL COMMENT 'ROBIN derivation: highest number of users',
  `cpu` float NOT NULL DEFAULT 0,
  `wan_iface` varchar(128) DEFAULT NULL,
  `wan_ip` varchar(128) DEFAULT NULL,
  `wan_mac` varchar(128) DEFAULT NULL,
  `wan_gateway` varchar(128) DEFAULT NULL,
  `wifi_iface` varchar(128) DEFAULT NULL,
  `wifi_ip` varchar(128) DEFAULT NULL,
  `wifi_mac` varchar(128) DEFAULT NULL,
  `wifi_ssid` varchar(128) DEFAULT NULL,
  `wifi_key` varchar(128) DEFAULT NULL,
  `wifi_channel` varchar(128) DEFAULT NULL,
  `lan_iface` varchar(128) DEFAULT NULL,
  `lan_mac` varchar(128) DEFAULT NULL,
  `lan_ip` varchar(128) DEFAULT NULL,
  `wan_bup` varchar(128) DEFAULT NULL,
  `wan_bdown` varchar(128) DEFAULT NULL,
  `firmware` varchar(128) DEFAULT NULL,
  `firmware_revision` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mac` (`mac`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='node database';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment` (
  `id` int(32) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(32) NOT NULL COMMENT 'invoice id of the invoices table',
  `amount` decimal(10,2) NOT NULL COMMENT 'the amount paid',
  `date` datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  `type_id` int(10) NOT NULL DEFAULT 1 COMMENT 'the type of the payment from payment_type',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_type` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `value` varchar(32) NOT NULL DEFAULT '' COMMENT 'type value',
  `notes` varchar(128) NOT NULL COMMENT 'general notes/description',
  `creationdate` datetime DEFAULT '0000-00-00 00:00:00',
  `creationby` varchar(128) DEFAULT NULL,
  `updatedate` datetime DEFAULT '0000-00-00 00:00:00',
  `updateby` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radacct`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radacct` (
  `radacctid` bigint(21) NOT NULL AUTO_INCREMENT,
  `acctsessionid` varchar(64) NOT NULL DEFAULT '',
  `acctuniqueid` varchar(32) NOT NULL DEFAULT '',
  `username` varchar(64) NOT NULL DEFAULT '',
  `groupname` varchar(64) DEFAULT NULL,
  `realm` varchar(64) DEFAULT '',
  `nasipaddress` varchar(15) NOT NULL DEFAULT '',
  `nasportid` varchar(32) DEFAULT NULL,
  `nasporttype` varchar(32) DEFAULT NULL,
  `acctstarttime` datetime NOT NULL DEFAULT '1970-01-01 00:00:00',
  `acctupdatetime` datetime DEFAULT NULL,
  `acctstoptime` datetime DEFAULT NULL,
  `acctinterval` int(12) DEFAULT NULL,
  `acctsessiontime` int(12) unsigned DEFAULT NULL,
  `acctauthentic` varchar(32) DEFAULT NULL,
  `connectinfo_start` varchar(50) DEFAULT NULL,
  `connectinfo_stop` varchar(50) DEFAULT NULL,
  `acctinputoctets` bigint(20) DEFAULT NULL,
  `acctoutputoctets` bigint(20) DEFAULT NULL,
  `calledstationid` varchar(50) NOT NULL DEFAULT '',
  `callingstationid` varchar(50) NOT NULL DEFAULT '',
  `acctterminatecause` varchar(32) NOT NULL DEFAULT '',
  `servicetype` varchar(32) DEFAULT NULL,
  `framedprotocol` varchar(32) DEFAULT NULL,
  `framedipaddress` varchar(15) NOT NULL DEFAULT '',
  `framedipv6address` varchar(45) NOT NULL DEFAULT '',
  `framedipv6prefix` varchar(45) NOT NULL DEFAULT '',
  `framedinterfaceid` varchar(44) NOT NULL DEFAULT '',
  `delegatedipv6prefix` varchar(45) NOT NULL DEFAULT '',
  `network_id` int(11) NOT NULL,
  PRIMARY KEY (`radacctid`,`acctstarttime`),
  UNIQUE KEY `acctuniqueid` (`acctuniqueid`,`acctstarttime`),
  KEY `username` (`username`),
  KEY `framedipaddress` (`framedipaddress`),
  KEY `framedipv6address` (`framedipv6address`),
  KEY `framedipv6prefix` (`framedipv6prefix`),
  KEY `framedinterfaceid` (`framedinterfaceid`),
  KEY `delegatedipv6prefix` (`delegatedipv6prefix`),
  KEY `acctsessionid` (`acctsessionid`),
  KEY `acctsessiontime` (`acctsessiontime`),
  KEY `acctstarttime` (`acctstarttime`),
  KEY `acctinterval` (`acctinterval`),
  KEY `acctstoptime` (`acctstoptime`),
  KEY `nasipaddress` (`nasipaddress`),
  KEY `idx_user_stop` (`username`,`acctstoptime`),
  KEY `idx_active_nas` (`nasipaddress`,`acctstoptime`),
  KEY `idx_user_nas_start` (`username`,`nasipaddress`,`acctstarttime`),
  KEY `idx_acctstop_user` (`acctstoptime`,`username`),
  KEY `idx_radacct_network_time` (`network_id`,`acctstarttime`),
  KEY `idx_radacct_network_user` (`network_id`,`username`),
  KEY `idx_radacct_net_stop_start` (`network_id`,`acctstoptime`,`acctstarttime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
 PARTITION BY RANGE (to_days(`acctstarttime`))
(PARTITION `p_past` VALUES LESS THAN (739251) ENGINE = InnoDB,
 PARTITION `p_2024_01` VALUES LESS THAN (739282) ENGINE = InnoDB,
 PARTITION `p_2024_02` VALUES LESS THAN (739311) ENGINE = InnoDB,
 PARTITION `p_2024_03` VALUES LESS THAN (739342) ENGINE = InnoDB,
 PARTITION `p_2024_04` VALUES LESS THAN (739372) ENGINE = InnoDB,
 PARTITION `p_2024_05` VALUES LESS THAN (739403) ENGINE = InnoDB,
 PARTITION `p_2024_06` VALUES LESS THAN (739433) ENGINE = InnoDB,
 PARTITION `p_2024_07` VALUES LESS THAN (739464) ENGINE = InnoDB,
 PARTITION `p_2024_08` VALUES LESS THAN (739495) ENGINE = InnoDB,
 PARTITION `p_2024_09` VALUES LESS THAN (739525) ENGINE = InnoDB,
 PARTITION `p_2024_10` VALUES LESS THAN (739556) ENGINE = InnoDB,
 PARTITION `p_2024_11` VALUES LESS THAN (739586) ENGINE = InnoDB,
 PARTITION `p_2024_12` VALUES LESS THAN (739617) ENGINE = InnoDB,
 PARTITION `p_2025_01` VALUES LESS THAN (739648) ENGINE = InnoDB,
 PARTITION `p_2025_02` VALUES LESS THAN (739676) ENGINE = InnoDB,
 PARTITION `p_2025_03` VALUES LESS THAN (739707) ENGINE = InnoDB,
 PARTITION `p_2025_04` VALUES LESS THAN (739737) ENGINE = InnoDB,
 PARTITION `p_2025_05` VALUES LESS THAN (739768) ENGINE = InnoDB,
 PARTITION `p_2025_06` VALUES LESS THAN (739798) ENGINE = InnoDB,
 PARTITION `p_2025_07` VALUES LESS THAN (739829) ENGINE = InnoDB,
 PARTITION `p_2025_08` VALUES LESS THAN (739860) ENGINE = InnoDB,
 PARTITION `p_2025_09` VALUES LESS THAN (739890) ENGINE = InnoDB,
 PARTITION `p_2025_10` VALUES LESS THAN (739921) ENGINE = InnoDB,
 PARTITION `p_2025_11` VALUES LESS THAN (739951) ENGINE = InnoDB,
 PARTITION `p_2025_12` VALUES LESS THAN (739982) ENGINE = InnoDB,
 PARTITION `p_2026_01` VALUES LESS THAN (740013) ENGINE = InnoDB,
 PARTITION `p_2026_02` VALUES LESS THAN (740041) ENGINE = InnoDB,
 PARTITION `p_2026_03` VALUES LESS THAN (740072) ENGINE = InnoDB,
 PARTITION `p_2026_04` VALUES LESS THAN (740102) ENGINE = InnoDB,
 PARTITION `p_2026_05` VALUES LESS THAN (740133) ENGINE = InnoDB,
 PARTITION `p_2026_06` VALUES LESS THAN (740163) ENGINE = InnoDB,
 PARTITION `p_2026_07` VALUES LESS THAN (740194) ENGINE = InnoDB,
 PARTITION `p_2026_08` VALUES LESS THAN (740225) ENGINE = InnoDB,
 PARTITION `p_2026_09` VALUES LESS THAN (740255) ENGINE = InnoDB,
 PARTITION `p_2026_10` VALUES LESS THAN (740286) ENGINE = InnoDB,
 PARTITION `p_2026_11` VALUES LESS THAN (740316) ENGINE = InnoDB,
 PARTITION `p_2026_12` VALUES LESS THAN (740347) ENGINE = InnoDB,
 PARTITION `p_2027_01` VALUES LESS THAN (740378) ENGINE = InnoDB,
 PARTITION `p_2027_02` VALUES LESS THAN (740406) ENGINE = InnoDB,
 PARTITION `p_2027_03` VALUES LESS THAN (740437) ENGINE = InnoDB,
 PARTITION `p_2027_04` VALUES LESS THAN (740467) ENGINE = InnoDB,
 PARTITION `p_2027_05` VALUES LESS THAN (740498) ENGINE = InnoDB,
 PARTITION `p_2027_06` VALUES LESS THAN (740528) ENGINE = InnoDB,
 PARTITION `p_2027_07` VALUES LESS THAN (740559) ENGINE = InnoDB,
 PARTITION `p_2027_08` VALUES LESS THAN (740590) ENGINE = InnoDB,
 PARTITION `p_2027_09` VALUES LESS THAN (740620) ENGINE = InnoDB,
 PARTITION `p_2027_10` VALUES LESS THAN (740651) ENGINE = InnoDB,
 PARTITION `p_2027_11` VALUES LESS THAN (740681) ENGINE = InnoDB,
 PARTITION `p_2027_12` VALUES LESS THAN (740712) ENGINE = InnoDB,
 PARTITION `p_max` VALUES LESS THAN MAXVALUE ENGINE = InnoDB);
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radcheck`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radcheck` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL DEFAULT '',
  `attribute` varchar(64) NOT NULL DEFAULT '',
  `op` char(2) NOT NULL DEFAULT '==',
  `value` varchar(253) NOT NULL DEFAULT '',
  `network_id` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_radcheck_network_user_attr` (`network_id`,`username`,`attribute`),
  KEY `username` (`username`(32)),
  KEY `idx_user_attr` (`username`,`attribute`),
  KEY `idx_radcheck_network_user` (`network_id`,`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radgroupcheck`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radgroupcheck` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `groupname` varchar(64) NOT NULL DEFAULT '',
  `attribute` varchar(64) NOT NULL DEFAULT '',
  `op` char(2) NOT NULL DEFAULT '==',
  `value` varchar(253) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_radgroupcheck_network_group_attr` (`network_id`,`groupname`,`attribute`),
  KEY `groupname` (`groupname`(32)),
  KEY `idx_radgroupcheck_network_group` (`network_id`,`groupname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radgroupreply`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radgroupreply` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `groupname` varchar(64) NOT NULL DEFAULT '',
  `attribute` varchar(64) NOT NULL DEFAULT '',
  `op` char(2) NOT NULL DEFAULT '=',
  `value` varchar(253) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_radgroupreply_network_group_attr` (`network_id`,`groupname`,`attribute`),
  KEY `groupname` (`groupname`(32)),
  KEY `idx_radgroupreply_network_group` (`network_id`,`groupname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radpostauth`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radpostauth` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL DEFAULT '',
  `pass` varchar(64) NOT NULL DEFAULT '',
  `reply` varchar(32) NOT NULL DEFAULT '',
  `authdate` timestamp(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `network_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `username` (`username`(32)),
  KEY `idx_radpostauth_network_date` (`network_id`,`authdate`),
  KEY `idx_radpostauth_network_user` (`network_id`,`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radreply`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radreply` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL DEFAULT '',
  `attribute` varchar(64) NOT NULL DEFAULT '',
  `op` char(2) NOT NULL DEFAULT '=',
  `value` varchar(253) NOT NULL DEFAULT '',
  `network_id` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `username` (`username`(32)),
  KEY `idx_radreply_network_user` (`network_id`,`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `radusergroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `radusergroup` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL DEFAULT '',
  `groupname` varchar(64) NOT NULL DEFAULT '',
  `priority` int(11) NOT NULL DEFAULT 1,
  `network_id` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_radusergroup_network_user_group` (`network_id`,`username`,`groupname`),
  KEY `username` (`username`(32)),
  KEY `idx_user_grp` (`username`,`groupname`),
  KEY `idx_radusergroup_network_user` (`network_id`,`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_accounting_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_accounting_periods` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('open','closed','reopened') NOT NULL DEFAULT 'open',
  `closed_by` int(11) DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `reopened_by` int(11) DEFAULT NULL,
  `reopened_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period` (`network_id`,`period_start`,`period_end`),
  KEY `idx_period_status` (`network_id`,`status`,`period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_activity_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) DEFAULT NULL,
  `admin_name` varchar(100) DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `action_category` varchar(50) NOT NULL DEFAULT 'system',
  `action_title` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `status` enum('success','failed','warning','info') NOT NULL DEFAULT 'success',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_action_category` (`action_category`),
  KEY `idx_status` (`status`),
  KEY `idx_activity_network_date` (`network_id`,`created_at`),
  KEY `idx_act_net_type_date` (`network_id`,`action_type`,`created_at`),
  KEY `idx_act_net_admin` (`network_id`,`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admin_network_access`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admin_network_access` (
  `admin_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `access_level` varchar(32) NOT NULL DEFAULT 'operator',
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `granted_by_admin_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`admin_id`,`network_id`),
  KEY `idx_ana_network` (`network_id`,`is_active`,`admin_id`),
  KEY `idx_ana_default` (`admin_id`,`is_default`,`is_active`),
  KEY `fk_ana_granter` (`granted_by_admin_id`),
  CONSTRAINT `fk_ana_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ana_granter` FOREIGN KEY (`granted_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ana_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admin_network_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admin_network_balances` (
  `admin_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT 0.00,
  `credit_limit` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(16) NOT NULL DEFAULT 'YER_SANAA',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`admin_id`,`network_id`),
  CONSTRAINT `fk_anb_access` FOREIGN KEY (`admin_id`, `network_id`) REFERENCES `um_admin_network_access` (`admin_id`, `network_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admin_network_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admin_network_roles` (
  `admin_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `role_key` varchar(64) NOT NULL,
  `data_scope` enum('all','own','children','assigned','delegated','network') NOT NULL DEFAULT 'own',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `assigned_by_admin_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`admin_id`,`network_id`),
  KEY `idx_anr_network_role` (`network_id`,`role_key`,`is_active`),
  KEY `fk_anr_role` (`role_key`),
  KEY `fk_anr_assigner` (`assigned_by_admin_id`),
  CONSTRAINT `fk_anr_access` FOREIGN KEY (`admin_id`, `network_id`) REFERENCES `um_admin_network_access` (`admin_id`, `network_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anr_assigner` FOREIGN KEY (`assigned_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_anr_role` FOREIGN KEY (`role_key`) REFERENCES `um_roles_def` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admin_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admin_permissions` (
  `admin_id` int(11) NOT NULL,
  `permission_key` varchar(128) NOT NULL,
  `effect` enum('grant','deny') NOT NULL DEFAULT 'grant',
  `expires_at` datetime DEFAULT NULL,
  `granted_by_admin_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`admin_id`,`permission_key`),
  KEY `idx_admin_effect` (`admin_id`,`effect`,`expires_at`),
  KEY `fk_ap_permission` (`permission_key`),
  KEY `fk_ap_granted_by` (`granted_by_admin_id`),
  CONSTRAINT `fk_ap_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ap_granted_by` FOREIGN KEY (`granted_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ap_permission` FOREIGN KEY (`permission_key`) REFERENCES `um_permission_catalog` (`permission_key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admin_ui_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admin_ui_settings` (
  `admin_id` int(11) NOT NULL,
  `ui_settings` longtext NOT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`admin_id`),
  CONSTRAINT `fk_ui_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_admins` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `fullname` varchar(128) NOT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `email` varchar(128) DEFAULT NULL,
  `role` varchar(64) NOT NULL DEFAULT 'distributor',
  `parent_id` int(11) DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `credit_limit` decimal(12,2) DEFAULT 0.00,
  `discount_rate` decimal(5,2) DEFAULT 0.00,
  `balance` decimal(12,2) DEFAULT 0.00,
  `permissions` longtext DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `free_profile` varchar(64) DEFAULT NULL,
  `free_cards_quota` int(11) DEFAULT 0,
  `data_scope` enum('all','own','children','assigned','delegated','network') DEFAULT 'own',
  `allowed_networks` text DEFAULT NULL,
  `delegated_admin_ids` text DEFAULT NULL,
  `created_by_admin_id` int(11) DEFAULT NULL,
  `created_by_name` varchar(128) DEFAULT NULL,
  `max_cards_quota` int(11) NOT NULL DEFAULT 0,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `system_owner_guard` tinyint(4) GENERATED ALWAYS AS (case when `role` = 'system_owner' then 1 else NULL end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uq_um_admins_single_system_owner` (`system_owner_guard`),
  KEY `idx_role` (`role`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_admins_account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_agent_wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_agent_wallets` (
  `admin_id` int(11) NOT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`admin_id`,`network_id`),
  CONSTRAINT `fk_wallet_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_api_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_api_access_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `family_id` varchar(64) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `device_name` varchar(100) DEFAULT NULL,
  `abilities` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`abilities`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_aat_admin` (`admin_id`),
  KEY `idx_aat_family` (`family_id`),
  KEY `idx_aat_expires` (`expires_at`),
  KEY `idx_aat_revoked` (`revoked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_api_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_api_jobs` (
  `id` char(36) NOT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  `type` varchar(64) NOT NULL,
  `status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `progress` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `error_message` text DEFAULT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_um_api_jobs_queue` (`status`,`created_at`),
  KEY `idx_um_api_jobs_owner` (`created_by`,`created_at`),
  KEY `idx_api_job_network` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_api_login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_api_login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `attempted_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ala_ip_time` (`ip_address`,`attempted_at`),
  KEY `idx_ala_user_time` (`username`,`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_api_refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_api_refresh_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `access_token_id` int(11) DEFAULT NULL,
  `family_id` varchar(64) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `device_name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_art_admin` (`admin_id`),
  KEY `idx_art_family` (`family_id`),
  KEY `idx_art_expires` (`expires_at`),
  KEY `idx_art_revoked` (`revoked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_api_uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_api_uploads` (
  `id` char(32) NOT NULL,
  `network_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'general',
  `original_name` varchar(255) NOT NULL,
  `stored_path` varchar(500) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL DEFAULT 0,
  `sha256` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_api_upload_network` (`network_id`,`admin_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_app_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_app_migrations` (
  `migration_key` varchar(190) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_asset_outage_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_asset_outage_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_id` int(11) NOT NULL,
  `disconnected_at` datetime NOT NULL,
  `reconnected_at` datetime DEFAULT NULL,
  `duration_seconds` int(11) DEFAULT 0,
  `nas_ip` varchar(64) DEFAULT NULL,
  `nas_port_id` varchar(64) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `disconnected_at` (`disconnected_at`),
  KEY `reconnected_at` (`reconnected_at`),
  KEY `idx_asset_outage_network` (`network_id`,`disconnected_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_assets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `category` enum('routers','servers','antennas_dishes','solar_batteries','cables_fiber','towers','vehicles','other') DEFAULT 'routers',
  `model` varchar(128) DEFAULT NULL,
  `serial_number` varchar(128) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `current_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `location` varchar(128) DEFAULT NULL,
  `status` enum('in_service','maintenance','in_stock','damaged','retired') DEFAULT 'in_service',
  `responsible_person` varchar(128) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  `source_type` varchar(32) NOT NULL DEFAULT 'manual',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `first_discovered_at` datetime DEFAULT NULL,
  `last_disconnect_at` datetime DEFAULT NULL,
  `last_reconnect_at` datetime DEFAULT NULL,
  `outage_count` int(11) NOT NULL DEFAULT 0,
  `total_uptime_minutes` int(11) NOT NULL DEFAULT 0,
  `last_seen` datetime DEFAULT NULL,
  `last_ping_status` varchar(16) DEFAULT NULL,
  `node_id` int(11) DEFAULT NULL,
  `nas_ip` varchar(64) DEFAULT NULL,
  `nas_port_id` varchar(64) DEFAULT NULL,
  `neighbor_mac` varchar(32) DEFAULT NULL,
  `neighbor_identity` varchar(128) DEFAULT NULL,
  `assigned_to_user_id` int(11) DEFAULT NULL,
  `handover_date` date DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `mac_address` varchar(32) DEFAULT NULL,
  `platform` varchar(64) DEFAULT NULL,
  `version` varchar(64) DEFAULT NULL,
  `created_by_admin_id` int(11) DEFAULT NULL,
  `created_by_name` varchar(128) DEFAULT NULL,
  `updated_by_admin_id` int(11) DEFAULT NULL,
  `updated_by_name` varchar(128) DEFAULT NULL,
  `purchase_invoice_id` int(11) DEFAULT NULL,
  `purchase_item_id` int(11) DEFAULT NULL,
  `purchased_quantity` decimal(12,3) NOT NULL DEFAULT 1.000,
  `quantity_unit` varchar(32) NOT NULL DEFAULT 'قطعة',
  `cost_locked` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_code` (`asset_code`),
  KEY `idx_asset_cat` (`category`),
  KEY `idx_asset_status` (`status`),
  KEY `idx_assets_mac` (`mac_address`),
  KEY `idx_assets_nas_ip` (`nas_ip`),
  KEY `idx_assets_node_id` (`node_id`),
  KEY `idx_assets_platform` (`platform`),
  KEY `idx_assets_status` (`status`),
  KEY `idx_asset_network_status` (`network_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_authorization_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_authorization_audit` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) DEFAULT NULL,
  `permission_key` varchar(512) NOT NULL,
  `decision` enum('allow','deny') NOT NULL,
  `resource_type` varchar(64) DEFAULT NULL,
  `resource_id` bigint(20) DEFAULT NULL,
  `scope_key` varchar(32) DEFAULT NULL,
  `reason` varchar(128) DEFAULT NULL,
  `request_id` varchar(128) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_auth_audit_admin_date` (`admin_id`,`created_at`),
  KEY `idx_auth_audit_decision_date` (`decision`,`created_at`),
  KEY `idx_auth_audit_permission` (`permission_key`(191)),
  KEY `idx_auth_audit_network` (`network_id`,`created_at`),
  CONSTRAINT `fk_auth_audit_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_balance_topup_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_balance_topup_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `event_type` enum('created','approved','rejected','cancelled','credited') NOT NULL,
  `actor_admin_id` int(11) NOT NULL,
  `amount` decimal(14,2) DEFAULT NULL,
  `balance_after` decimal(14,2) DEFAULT NULL,
  `details` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_topup_event_request` (`request_id`,`created_at`),
  KEY `fk_topup_event_actor` (`actor_admin_id`),
  KEY `idx_topup_event_network` (`network_id`,`request_id`),
  CONSTRAINT `fk_topup_event_actor` FOREIGN KEY (`actor_admin_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `fk_topup_event_request` FOREIGN KEY (`request_id`) REFERENCES `um_balance_topup_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_balance_topup_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_balance_topup_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_no` varchar(64) NOT NULL,
  `requester_admin_id` int(11) NOT NULL,
  `target_admin_id` int(11) NOT NULL,
  `requested_amount` decimal(14,2) NOT NULL,
  `approved_amount` decimal(14,2) DEFAULT NULL,
  `currency_code` varchar(16) NOT NULL DEFAULT 'YER_SANAA',
  `payment_method` enum('cash','bank','credit','adjustment') NOT NULL DEFAULT 'cash',
  `payment_reference` varchar(128) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `notes` varchar(255) DEFAULT NULL,
  `reviewed_by_admin_id` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_topup_request_no` (`request_no`),
  KEY `idx_topup_requester` (`requester_admin_id`,`created_at`),
  KEY `idx_topup_target_status` (`target_admin_id`,`status`,`created_at`),
  KEY `fk_topup_reviewer` (`reviewed_by_admin_id`),
  KEY `idx_topup_network_status` (`network_id`,`status`,`created_at`),
  CONSTRAINT `fk_topup_requester` FOREIGN KEY (`requester_admin_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `fk_topup_reviewer` FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_topup_target` FOREIGN KEY (`target_admin_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `chk_topup_positive` CHECK (`requested_amount` > 0),
  CONSTRAINT `chk_topup_approved_positive` CHECK (`approved_amount` is null or `approved_amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_bank_reconciliations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_bank_reconciliations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `account_id` int(11) NOT NULL,
  `reconciliation_date` date NOT NULL,
  `book_balance` decimal(15,2) NOT NULL,
  `statement_balance` decimal(15,2) NOT NULL,
  `difference_amount` decimal(15,2) NOT NULL,
  `currency_code` varchar(16) NOT NULL,
  `status` enum('draft','approved','posted') NOT NULL DEFAULT 'draft',
  `notes` varchar(500) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bank_recon` (`network_id`,`account_id`,`reconciliation_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_card_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_card_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `profile_name` varchar(64) DEFAULT NULL,
  `cards_per_page` int(11) DEFAULT 24,
  `network_name` varchar(128) DEFAULT 'شبكة واي فاي',
  `network_sub` varchar(128) DEFAULT 'أهلاً بكم في شبكتنا',
  `header_bg` varchar(32) DEFAULT '#0078d7',
  `header_color` varchar(32) DEFAULT '#ffffff',
  `border_color` varchar(32) DEFAULT '#4b6584',
  `card_bg` varchar(32) DEFAULT '#ffffff',
  `show_qr` tinyint(1) DEFAULT 1,
  `show_price` tinyint(1) DEFAULT 1,
  `show_profile` tinyint(1) DEFAULT 1,
  `show_validity` tinyint(1) DEFAULT 1,
  `show_serial` tinyint(1) DEFAULT 1,
  `footer_text` varchar(255) DEFAULT 'للتسجيل: اتصل بالشبكة وافتح المتصفح',
  `hotspot_url` varchar(255) DEFAULT 'http://192.168.88.1/login',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `bg_image` longtext DEFAULT NULL,
  `grid_cols` int(11) DEFAULT 3,
  `grid_rows` int(11) DEFAULT 8,
  `card_width_mm` decimal(6,2) DEFAULT 63.00,
  `card_height_mm` decimal(6,2) DEFAULT 33.00,
  `elements_json` longtext DEFAULT NULL,
  `page_margin_mm` decimal(4,1) DEFAULT 5.0,
  `card_gap_mm` decimal(4,1) DEFAULT 1.5,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_card_template_network` (`network_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_cashbox_reconciliations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_cashbox_reconciliations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `cashbox_id` int(11) NOT NULL,
  `reconciliation_date` date NOT NULL,
  `system_balance` decimal(15,2) NOT NULL,
  `actual_balance` decimal(15,2) NOT NULL,
  `difference_amount` decimal(15,2) NOT NULL,
  `currency_code` varchar(16) NOT NULL,
  `status` enum('draft','approved','posted') NOT NULL DEFAULT 'draft',
  `notes` varchar(500) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cash_recon` (`network_id`,`cashbox_id`,`reconciliation_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_chart_of_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_chart_of_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_code` varchar(32) NOT NULL,
  `name_ar` varchar(128) NOT NULL,
  `name_en` varchar(128) DEFAULT NULL,
  `account_type` enum('asset','liability','equity','revenue','expense') NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `linked_admin_id` int(11) DEFAULT NULL,
  `level` int(11) NOT NULL DEFAULT 1,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `balance` decimal(15,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  `owner_admin_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chart_network_code` (`network_id`,`account_code`),
  KEY `account_code_2` (`account_code`),
  KEY `account_type` (`account_type`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_chart_linked_admin` (`linked_admin_id`),
  KEY `idx_chart_network` (`network_id`,`is_active`),
  KEY `idx_chart_owner` (`network_id`,`owner_admin_id`),
  CONSTRAINT `fk_coa_admin` FOREIGN KEY (`linked_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_coa_parent` FOREIGN KEY (`parent_id`) REFERENCES `um_chart_of_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_chatbot_custom_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_chatbot_custom_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `trigger_keyword` varchar(150) NOT NULL,
  `match_type` enum('exact','contains','starts_with') DEFAULT 'contains',
  `response_text` text NOT NULL,
  `target_role` enum('all','subscriber','pos','admin') DEFAULT 'all',
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_cb_kw` (`trigger_keyword`,`is_active`),
  KEY `idx_chatbot_rule_network` (`network_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_chatbot_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_chatbot_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `phone` varchar(32) NOT NULL,
  `status` enum('bot','human_support') DEFAULT 'bot',
  `assigned_admin_id` int(11) DEFAULT NULL,
  `last_interaction` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chatbot_session_network_phone` (`network_id`,`phone`),
  UNIQUE KEY `uq_chatbot_network_phone` (`network_id`,`phone`),
  KEY `idx_chatbot_session_network` (`network_id`,`last_interaction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_cost_centers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_cost_centers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `center_code` varchar(32) NOT NULL,
  `name` varchar(128) NOT NULL,
  `center_type` enum('router','tower_node','branch','project','general') NOT NULL DEFAULT 'general',
  `ref_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cost_center_network_code` (`network_id`,`center_code`),
  KEY `center_code_2` (`center_code`),
  KEY `center_type` (`center_type`),
  KEY `idx_cost_center_network` (`network_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_currency_revaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_currency_revaluations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `revaluation_date` date NOT NULL,
  `currency_code` varchar(16) NOT NULL,
  `old_rate` decimal(18,8) NOT NULL,
  `new_rate` decimal(18,8) NOT NULL,
  `gain_loss_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `journal_entry_id` int(11) DEFAULT NULL,
  `status` enum('draft','posted') NOT NULL DEFAULT 'draft',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reval` (`network_id`,`revaluation_date`,`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_customer_identities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_customer_identities` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `central_customer_key` varchar(64) NOT NULL,
  `display_name` varchar(160) NOT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `contact_data` longtext DEFAULT NULL CHECK (`contact_data` is null or json_valid(`contact_data`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_central_key` (`central_customer_key`),
  UNIQUE KEY `uq_customer_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_customer_network_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_customer_network_memberships` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint(20) unsigned NOT NULL,
  `network_id` int(11) NOT NULL,
  `network_username` varchar(128) NOT NULL,
  `profile_id` int(11) DEFAULT NULL,
  `profile_name` varchar(64) DEFAULT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT 0.00,
  `debt` decimal(14,2) NOT NULL DEFAULT 0.00,
  `valid_until` datetime DEFAULT NULL,
  `membership_status` enum('active','suspended','expired','disabled') NOT NULL DEFAULT 'active',
  `network_settings` longtext DEFAULT NULL CHECK (`network_settings` is null or json_valid(`network_settings`)),
  `owner_admin_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_network` (`customer_id`,`network_id`),
  UNIQUE KEY `uq_network_username` (`network_id`,`network_username`),
  KEY `idx_membership_owner` (`network_id`,`owner_admin_id`),
  KEY `fk_cnm_owner` (`owner_admin_id`),
  CONSTRAINT `fk_cnm_customer` FOREIGN KEY (`customer_id`) REFERENCES `um_customer_identities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cnm_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cnm_owner` FOREIGN KEY (`owner_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_customer_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_customer_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `request_no` varchar(64) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `customer_name` varchar(160) NOT NULL,
  `network_id` int(11) NOT NULL,
  `request_type` enum('voucher_purchase','balance_topup') NOT NULL DEFAULT 'voucher_purchase',
  `profile_name` varchar(64) DEFAULT NULL,
  `requested_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(64) DEFAULT 'cash',
  `payment_reference` varchar(128) DEFAULT NULL,
  `status` enum('pending','approved','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `voucher_username` varchar(128) DEFAULT NULL,
  `voucher_password` varchar(128) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `reviewed_by_admin_id` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_no` (`request_no`),
  KEY `phone` (`phone`),
  KEY `network_id` (`network_id`),
  KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_customers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_id` bigint(20) DEFAULT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `username` varchar(128) NOT NULL,
  `password_secret` varbinary(255) DEFAULT NULL,
  `company` varchar(200) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `country` varchar(120) DEFAULT NULL,
  `currency` varchar(20) NOT NULL DEFAULT 'YER',
  `timezone_offset` int(11) NOT NULL DEFAULT 10800,
  `permissions` int(11) NOT NULL DEFAULT 0,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_customers_username` (`username`),
  UNIQUE KEY `uq_um_customers_source` (`source_id`),
  KEY `idx_legacy_customer_network` (`network_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_employee_salaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_employee_salaries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) DEFAULT NULL,
  `employee_name` varchar(128) NOT NULL,
  `job_title` varchar(128) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `basic_salary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `housing_allowance` decimal(15,2) NOT NULL DEFAULT 0.00,
  `transport_allowance` decimal(15,2) NOT NULL DEFAULT 0.00,
  `other_allowances` decimal(15,2) NOT NULL DEFAULT 0.00,
  `default_deductions` decimal(15,2) NOT NULL DEFAULT 0.00,
  `cost_center_id` int(11) DEFAULT NULL,
  `payment_method` varchar(32) DEFAULT 'cash',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `admin_id` (`admin_id`),
  KEY `cost_center_id` (`cost_center_id`),
  KEY `is_active` (`is_active`),
  KEY `idx_employee_salary_network` (`network_id`,`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_exchange_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_exchange_rates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `currency_code` varchar(16) NOT NULL,
  `currency_name` varchar(64) NOT NULL,
  `currency_symbol` varchar(16) NOT NULL,
  `is_base_currency` tinyint(1) DEFAULT 0,
  `exchange_rate` decimal(18,8) NOT NULL DEFAULT 1.00000000,
  `buy_rate` decimal(18,8) DEFAULT NULL,
  `sell_rate` decimal(18,8) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `display_order` int(11) DEFAULT 0,
  `last_updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by_admin_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `currency_code` (`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_fcm_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_fcm_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `network_id` int(11) DEFAULT NULL,
  `fcm_token` varchar(255) NOT NULL,
  `device_name` varchar(100) DEFAULT 'Android Device',
  `platform` varchar(20) DEFAULT 'android',
  `app_version` varchar(20) DEFAULT '1.0',
  `is_active` tinyint(1) DEFAULT 1,
  `last_used_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fcm_network_token` (`network_id`,`fcm_token`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_fcm_network` (`network_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_financial_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_financial_audit_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) DEFAULT NULL,
  `entity_type` varchar(64) NOT NULL,
  `entity_id` varchar(64) DEFAULT NULL,
  `action` varchar(64) NOT NULL,
  `before_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_json`)),
  `after_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_json`)),
  `reason` varchar(500) DEFAULT NULL,
  `actor_admin_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`network_id`,`entity_type`,`entity_id`),
  KEY `idx_audit_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_financial_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_financial_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tx_no` varchar(64) NOT NULL,
  `account_id` int(11) NOT NULL,
  `tx_type` enum('sale_invoice','receipt_voucher','payment_voucher','expense','transfer','adjustment') NOT NULL,
  `debit` decimal(12,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(12,2) NOT NULL DEFAULT 0.00,
  `balance_after` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cashbox_impact` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(32) DEFAULT 'cash',
  `reference_id` varchar(64) DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(14,4) DEFAULT 1.0000,
  `currency_amount` decimal(12,2) DEFAULT 0.00,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tx_no` (`tx_no`),
  KEY `idx_acc` (`account_id`),
  KEY `idx_type` (`tx_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_fin_tx_network_date` (`network_id`,`created_at`),
  KEY `idx_fin_tx_network_account` (`network_id`,`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_firewall_geo_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_firewall_geo_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rule_type` enum('country','asn','local','custom') NOT NULL,
  `target_value` varchar(100) NOT NULL,
  `target_label` varchar(255) NOT NULL,
  `action` enum('allow','deny') NOT NULL DEFAULT 'deny',
  `port` varchar(20) NOT NULL DEFAULT 'all',
  `protocol` enum('all','tcp','udp') NOT NULL DEFAULT 'all',
  `ip_version` enum('v4','v6','both') NOT NULL DEFAULT 'v4',
  `priority` enum('high','normal') NOT NULL DEFAULT 'high',
  `comment` varchar(255) DEFAULT '',
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_firewall_geo_network` (`network_id`,`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_free_vouchers_quota`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_free_vouchers_quota` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `role_key` varchar(64) NOT NULL,
  `monthly_cards_quota` int(11) NOT NULL DEFAULT 5,
  `profile_name` varchar(64) NOT NULL,
  `consumption_threshold_mb` bigint(20) DEFAULT 0,
  `notes` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `schedule_type` enum('weekly','monthly','yearly','custom_days') NOT NULL DEFAULT 'monthly',
  `start_date` date DEFAULT NULL,
  `interval_days` int(11) NOT NULL DEFAULT 30,
  `cards_count` int(11) NOT NULL DEFAULT 1,
  `phone` varchar(32) DEFAULT NULL,
  `send_method` enum('whatsapp','sms','both','none') NOT NULL DEFAULT 'whatsapp',
  `last_dispatched_at` datetime DEFAULT NULL,
  `next_dispatch_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_free_quota_network_admin_profile` (`network_id`,`admin_id`,`profile_name`),
  KEY `idx_free_quota_network` (`network_id`,`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_hotspot_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_hotspot_settings` (
  `network_id` int(11) NOT NULL,
  `theme_json` longtext DEFAULT NULL,
  `brand_json` longtext DEFAULT NULL,
  `contacts_json` longtext DEFAULT NULL,
  `packages_json` longtext DEFAULT NULL,
  `ads_json` longtext DEFAULT NULL,
  `shortcuts_json` longtext DEFAULT NULL,
  `pos_json` longtext DEFAULT NULL,
  `login_options_json` longtext DEFAULT NULL,
  `status_options_json` longtext DEFAULT NULL,
  `updated_by_admin_id` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`network_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_instant_balance_consumptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_instant_balance_consumptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lot_id` bigint(20) NOT NULL,
  `owner_admin_id` int(11) NOT NULL,
  `event_type` enum('transfer','sale','digital_voucher','refund') NOT NULL,
  `event_id` bigint(20) DEFAULT NULL,
  `reference_no` varchar(64) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `cost_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lot_event` (`lot_id`,`event_type`,`reference_no`),
  KEY `idx_consumption_owner` (`owner_admin_id`,`created_at`),
  KEY `idx_ib_consumption_network` (`network_id`,`owner_admin_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_instant_balance_customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_instant_balance_customers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `phone` varchar(9) NOT NULL,
  `name` varchar(128) DEFAULT NULL,
  `is_recurring` tinyint(1) NOT NULL DEFAULT 0,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ib_customer_network_phone` (`network_id`,`phone`),
  KEY `idx_ib_customer_network` (`network_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_instant_balance_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_instant_balance_invoices` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(64) NOT NULL,
  `seller_admin_id` int(11) NOT NULL,
  `buyer_admin_id` int(11) DEFAULT NULL,
  `buyer_phone` varchar(16) DEFAULT NULL,
  `buyer_name` varchar(128) DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `discount_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `paid_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `remaining_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `expires_at` datetime DEFAULT NULL,
  `payment_type` enum('cash','credit','partial') NOT NULL DEFAULT 'cash',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `idx_instant_invoice_seller` (`seller_admin_id`,`created_at`),
  KEY `idx_ib_invoice_network` (`network_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_instant_balance_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_instant_balance_lots` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `owner_admin_id` int(11) NOT NULL,
  `source_lot_id` bigint(20) DEFAULT NULL,
  `original_amount` decimal(14,2) NOT NULL,
  `original_cost` decimal(14,2) NOT NULL DEFAULT 0.00,
  `remaining_amount` decimal(14,2) NOT NULL,
  `remaining_cost` decimal(14,2) NOT NULL DEFAULT 0.00,
  `expires_at` datetime DEFAULT NULL,
  `status` enum('active','expired','depleted','cancelled') NOT NULL DEFAULT 'active',
  `granted_by_admin_id` int(11) DEFAULT NULL,
  `is_sold` tinyint(1) NOT NULL DEFAULT 0,
  `invoice_id` bigint(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_instant_lot_owner_expiry` (`owner_admin_id`,`status`,`expires_at`),
  KEY `idx_ib_lot_network_owner` (`network_id`,`owner_admin_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_instant_balance_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_instant_balance_transfers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `transfer_no` varchar(64) NOT NULL,
  `sender_admin_id` int(11) NOT NULL,
  `receiver_admin_id` int(11) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `status` enum('completed','cancelled') NOT NULL DEFAULT 'completed',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_no` (`transfer_no`),
  KEY `idx_instant_transfer_sender` (`sender_admin_id`,`created_at`),
  KEY `idx_instant_transfer_receiver` (`receiver_admin_id`,`created_at`),
  KEY `idx_ib_transfer_network` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_journal_approval_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_journal_approval_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `journal_entry_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `action` enum('submitted','approved','rejected','reversed') NOT NULL,
  `actor_admin_id` int(11) DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_approval_journal` (`journal_entry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_journal_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_journal_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entry_no` varchar(64) NOT NULL,
  `entry_date` date NOT NULL,
  `source_module` varchar(64) NOT NULL DEFAULT 'manual',
  `reference_no` varchar(64) DEFAULT NULL,
  `description` text NOT NULL,
  `total_debit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_credit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `is_posted` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `currency_total_amount` decimal(15,2) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `entry_no` (`entry_no`),
  KEY `entry_no_2` (`entry_no`),
  KEY `entry_date` (`entry_date`),
  KEY `source_module` (`source_module`),
  KEY `idx_journal_network_date` (`network_id`,`entry_date`),
  KEY `idx_je_net_source_date` (`network_id`,`source_module`,`entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_journal_entry_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_journal_entry_lines` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `journal_entry_id` int(11) NOT NULL,
  `account_id` int(11) NOT NULL,
  `cost_center_id` int(11) DEFAULT NULL,
  `debit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `line_description` varchar(255) DEFAULT NULL,
  `line_index` int(11) NOT NULL DEFAULT 0,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_entry_account_line` (`journal_entry_id`,`account_id`,`line_index`),
  KEY `journal_entry_id` (`journal_entry_id`),
  KEY `account_id` (`account_id`),
  KEY `cost_center_id` (`cost_center_id`),
  KEY `idx_journal_line_network` (`network_id`,`journal_entry_id`),
  KEY `idx_jel_net_acc` (`network_id`,`account_id`),
  KEY `idx_jel_net_cost` (`network_id`,`cost_center_id`),
  CONSTRAINT `um_journal_entry_lines_ibfk_1` FOREIGN KEY (`journal_entry_id`) REFERENCES `um_journal_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `um_journal_entry_lines_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `um_chart_of_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_audit_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) DEFAULT NULL,
  `actor_admin_id` int(11) DEFAULT NULL,
  `action_key` varchar(96) NOT NULL,
  `entity_type` varchar(64) DEFAULT NULL,
  `entity_id` varchar(96) DEFAULT NULL,
  `old_values` longtext DEFAULT NULL,
  `new_values` longtext DEFAULT NULL,
  `request_ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_um_network_audit_network` (`network_id`,`created_at`),
  KEY `idx_um_network_audit_action` (`action_key`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_backfill_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_backfill_audit` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `table_name` varchar(96) NOT NULL,
  `row_count` bigint(20) NOT NULL,
  `assigned_network_id` int(11) DEFAULT NULL,
  `assignment_rule` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_backfill_table` (`table_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_cashboxes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_cashboxes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `owner_admin_id` int(11) NOT NULL,
  `account_id` int(11) DEFAULT NULL,
  `cashbox_code` varchar(64) NOT NULL,
  `cashbox_name` varchar(128) NOT NULL,
  `balance` decimal(15,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_network_cashbox_code` (`network_id`,`cashbox_code`),
  KEY `idx_network_cashbox_owner` (`network_id`,`owner_admin_id`),
  KEY `fk_nc_owner` (`owner_admin_id`),
  CONSTRAINT `fk_nc_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_nc_owner` FOREIGN KEY (`owner_admin_id`) REFERENCES `um_admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_channels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_channels` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `channel_type` enum('whatsapp','telegram') NOT NULL,
  `label` varchar(128) DEFAULT NULL,
  `api_url` varchar(255) DEFAULT NULL,
  `auth_path` varchar(255) DEFAULT NULL,
  `bot_token_ciphertext` text DEFAULT NULL,
  `chat_id_ciphertext` text DEFAULT NULL,
  `webhook_secret_hash` char(64) DEFAULT NULL,
  `webhook_secret_ciphertext` text DEFAULT NULL,
  `config_json` text DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL DEFAULT 'DISCONNECTED',
  `last_connected_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_network_channel` (`network_id`,`channel_type`),
  KEY `idx_network_channels_network` (`network_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_exchange_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_exchange_rates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `currency_code` varchar(16) NOT NULL,
  `currency_name` varchar(64) NOT NULL,
  `currency_symbol` varchar(16) NOT NULL,
  `is_base_currency` tinyint(1) DEFAULT 0,
  `exchange_rate` decimal(18,8) NOT NULL DEFAULT 1.00000000,
  `buy_rate` decimal(18,8) DEFAULT NULL,
  `sell_rate` decimal(18,8) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `display_order` int(11) DEFAULT 0,
  `last_updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by_admin_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_network_currency` (`network_id`,`currency_code`),
  KEY `idx_network_base` (`network_id`,`is_base_currency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_feature_flags` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `feature_key` varchar(96) NOT NULL,
  `override_state` enum('inherit','enabled','disabled') NOT NULL DEFAULT 'inherit',
  `config` longtext DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_feature_flag` (`network_id`,`feature_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_limits` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `limit_key` varchar(96) NOT NULL,
  `limit_value` bigint(20) DEFAULT NULL COMMENT 'NULL means inherit; 0 means unlimited',
  `reason` varchar(255) DEFAULT NULL,
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_limit` (`network_id`,`limit_key`),
  KEY `idx_um_network_limits_window` (`starts_at`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_nodes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `node_type` enum('main_node','sub_node','regular') NOT NULL DEFAULT 'main_node',
  `parent_id` int(11) DEFAULT NULL,
  `nas_ip` varchar(64) NOT NULL,
  `nas_port_id` varchar(64) NOT NULL,
  `node_name` varchar(128) NOT NULL,
  `display_name` varchar(191) DEFAULT NULL,
  `code` varchar(64) DEFAULT NULL,
  `responsible_admin_id` int(11) DEFAULT NULL,
  `responsible_name` varchar(128) DEFAULT NULL,
  `responsible_phone` varchar(32) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `coordinates` varchar(64) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `created_by_admin_id` int(11) DEFAULT NULL,
  `created_by_name` varchar(128) DEFAULT NULL,
  `updated_by_admin_id` int(11) DEFAULT NULL,
  `updated_by_name` varchar(128) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `nas_ip` (`nas_ip`,`nas_port_id`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_node_network` (`network_id`,`id`),
  CONSTRAINT `um_network_nodes_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `um_network_nodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_notification_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_notification_settings` (
  `network_id` int(11) NOT NULL,
  `whatsapp_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `telegram_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `fcm_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `chatbot_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `notify_sales` tinyint(1) NOT NULL DEFAULT 1,
  `notify_receipts` tinyint(1) NOT NULL DEFAULT 1,
  `notify_transfers` tinyint(1) NOT NULL DEFAULT 1,
  `notify_inventory` tinyint(1) NOT NULL DEFAULT 1,
  `notify_routers` tinyint(1) NOT NULL DEFAULT 1,
  `notify_finance` tinyint(1) NOT NULL DEFAULT 1,
  `chatbot_welcome_msg` text DEFAULT NULL,
  `chatbot_support_phone` varchar(32) DEFAULT NULL,
  `chatbot_network_name` varchar(128) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `chatbot_allow_subscribers` tinyint(1) NOT NULL DEFAULT 1,
  `chatbot_allow_pos` tinyint(1) NOT NULL DEFAULT 1,
  `chatbot_allow_admins` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`network_id`),
  KEY `idx_network_notification_settings_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_partners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_partners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `partner_id` int(11) NOT NULL,
  `share_percent` decimal(6,3) NOT NULL DEFAULT 0.000,
  `capital_contrib` decimal(15,2) NOT NULL DEFAULT 0.00,
  `join_date` date DEFAULT NULL,
  `exit_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_network_partner` (`network_id`,`partner_id`),
  KEY `idx_network` (`network_id`),
  KEY `idx_partner` (`partner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_plan_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_plan_features` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `plan_id` int(11) NOT NULL,
  `feature_key` varchar(96) NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `feature_config` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_plan_feature` (`plan_id`,`feature_key`),
  KEY `idx_um_network_plan_features_plan` (`plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_plans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` text DEFAULT NULL,
  `monthly_price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `annual_price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(16) NOT NULL DEFAULT 'YER_SANAA',
  `max_routers` int(11) DEFAULT 0 COMMENT '0 or NULL means unlimited',
  `max_admins` int(11) DEFAULT 0 COMMENT '0 or NULL means unlimited',
  `max_distributors` int(11) DEFAULT 0 COMMENT '0 or NULL means unlimited',
  `max_pos_agents` int(11) DEFAULT 0 COMMENT '0 or NULL means unlimited',
  `daily_card_limit` int(11) DEFAULT 0 COMMENT '0 or NULL means unlimited',
  `daily_card_limit_mode` enum('generated_imported','printed','approved_print') NOT NULL DEFAULT 'generated_imported',
  `max_cards_per_print` int(11) NOT NULL DEFAULT 0,
  `max_daily_prints_per_profile` int(11) NOT NULL DEFAULT 0,
  `max_active_users` int(11) NOT NULL DEFAULT 0,
  `max_debt_limit` decimal(14,2) NOT NULL DEFAULT 0.00,
  `max_telegram_groups` int(11) NOT NULL DEFAULT 0,
  `monthly_invoice_limit` int(11) DEFAULT 0,
  `max_profiles` int(11) DEFAULT 0,
  `max_storage_bytes` bigint(20) unsigned DEFAULT 0,
  `max_backup_count` int(11) DEFAULT 0,
  `backup_retention_days` int(11) DEFAULT 0,
  `backup_frequency` enum('none','weekly','daily','custom') NOT NULL DEFAULT 'none',
  `allow_manual_backup` tinyint(1) NOT NULL DEFAULT 0,
  `allow_restore` tinyint(1) NOT NULL DEFAULT 0,
  `allow_download` tinyint(1) NOT NULL DEFAULT 0,
  `allow_whatsapp` tinyint(1) NOT NULL DEFAULT 0,
  `allow_api` tinyint(1) NOT NULL DEFAULT 0,
  `allow_advanced_reports` tinyint(1) NOT NULL DEFAULT 0,
  `warning_threshold_percent` tinyint(3) unsigned NOT NULL DEFAULT 80,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `is_visible` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_plans_code` (`plan_code`),
  KEY `idx_um_network_plans_active` (`is_active`,`is_visible`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_roaming_peers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_roaming_peers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `peer_network_id` int(11) NOT NULL,
  `roaming_type` enum('two_way','one_way') DEFAULT 'two_way',
  `allowed_profiles` text DEFAULT NULL COMMENT 'JSON list of allowed profile names or NULL for all',
  `accounting_clearing_rate` decimal(10,4) DEFAULT 0.0000,
  `status` enum('active','paused','disabled') DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_net_peer` (`network_id`,`peer_network_id`),
  KEY `idx_peer_net` (`peer_network_id`),
  CONSTRAINT `fk_roam_net` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_roam_peer` FOREIGN KEY (`peer_network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_settings` (
  `network_id` int(11) NOT NULL,
  `setting_key` varchar(96) NOT NULL,
  `setting_value` longtext DEFAULT NULL,
  `is_secret` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by_admin_id` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`network_id`,`setting_key`),
  KEY `fk_network_setting_admin` (`updated_by_admin_id`),
  CONSTRAINT `fk_network_setting_admin` FOREIGN KEY (`updated_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_network_setting_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_subscription_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_subscription_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subscription_id` bigint(20) NOT NULL,
  `network_id` int(11) NOT NULL,
  `event_type` varchar(64) NOT NULL,
  `old_status` varchar(24) DEFAULT NULL,
  `new_status` varchar(24) DEFAULT NULL,
  `old_plan_id` int(11) DEFAULT NULL,
  `new_plan_id` int(11) DEFAULT NULL,
  `details` longtext DEFAULT NULL,
  `actor_admin_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_um_subscription_events_network` (`network_id`,`created_at`),
  KEY `idx_um_subscription_events_subscription` (`subscription_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_subscriptions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `plan_id` int(11) NOT NULL,
  `status` enum('trial','active','grace','suspended','expired','cancelled','pending_payment') NOT NULL DEFAULT 'trial',
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `starts_at` datetime NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `trial_ends_at` datetime DEFAULT NULL,
  `grace_ends_at` datetime DEFAULT NULL,
  `billing_cycle` enum('monthly','annual','custom') NOT NULL DEFAULT 'monthly',
  `price_snapshot` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(16) NOT NULL DEFAULT 'YER_SANAA',
  `discount_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `next_invoice_at` datetime DEFAULT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'Asia/Aden',
  `business_day_start` time NOT NULL DEFAULT '00:00:00',
  `suspended_at` datetime DEFAULT NULL,
  `suspension_reason` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_subscriptions_network` (`network_id`),
  KEY `idx_um_network_subscriptions_plan_status` (`plan_id`,`status`),
  KEY `idx_um_network_subscriptions_expiry` (`expires_at`,`grace_ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_usage_daily`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_usage_daily` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `usage_date` date NOT NULL,
  `generated_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `imported_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `printed_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `sold_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `active_routers` int(10) unsigned NOT NULL DEFAULT 0,
  `active_admins` int(10) unsigned NOT NULL DEFAULT 0,
  `invoices_count` int(10) unsigned NOT NULL DEFAULT 0,
  `whatsapp_messages` int(10) unsigned NOT NULL DEFAULT 0,
  `api_requests` bigint(20) unsigned NOT NULL DEFAULT 0,
  `storage_bytes` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_usage_daily` (`network_id`,`usage_date`),
  KEY `idx_um_network_usage_date` (`usage_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_usage_monthly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_usage_monthly` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `usage_month` date NOT NULL COMMENT 'First day of month in network timezone',
  `generated_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `imported_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `printed_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `sold_cards` int(10) unsigned NOT NULL DEFAULT 0,
  `invoices_count` int(10) unsigned NOT NULL DEFAULT 0,
  `whatsapp_messages` int(10) unsigned NOT NULL DEFAULT 0,
  `api_requests` bigint(20) unsigned NOT NULL DEFAULT 0,
  `peak_storage_bytes` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_network_usage_monthly` (`network_id`,`usage_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_network_warehouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_network_warehouses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `owner_admin_id` int(11) NOT NULL,
  `warehouse_code` varchar(64) NOT NULL,
  `warehouse_name` varchar(128) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_network_warehouse_code` (`network_id`,`warehouse_code`),
  KEY `idx_network_warehouse_owner` (`network_id`,`owner_admin_id`),
  KEY `fk_nw_owner` (`owner_admin_id`),
  CONSTRAINT `fk_nw_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_nw_owner` FOREIGN KEY (`owner_admin_id`) REFERENCES `um_admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_networks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_networks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(128) NOT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `auth_mode` enum('username_only','same','different') NOT NULL DEFAULT 'different',
  `hotspot_title` varchar(128) DEFAULT NULL,
  `theme_color` varchar(32) NOT NULL DEFAULT '#0284c7',
  `description` text DEFAULT NULL,
  `founded_date` date DEFAULT NULL,
  `location` varchar(128) DEFAULT NULL,
  `status` enum('active','dissolved','merged','pending_approval') NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_notification_job_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_notification_job_runs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `job_name` varchar(64) NOT NULL,
  `run_key` varchar(40) NOT NULL,
  `status` enum('running','sent','partial','failed','skipped') NOT NULL DEFAULT 'running',
  `result_summary` varchar(512) DEFAULT NULL,
  `error_message` varchar(512) DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notification_job_run` (`network_id`,`job_name`,`run_key`),
  KEY `idx_notification_job_status` (`status`,`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_notification_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_notification_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel` enum('whatsapp','telegram','system') NOT NULL DEFAULT 'whatsapp',
  `event_type` varchar(64) NOT NULL DEFAULT 'custom_message',
  `recipient_phone` varchar(32) DEFAULT NULL,
  `sender_phone` varchar(32) DEFAULT NULL,
  `recipient_chat_id` varchar(64) DEFAULT NULL,
  `recipient_name` varchar(128) DEFAULT NULL,
  `message_text` text NOT NULL,
  `status` enum('sent','failed','pending') NOT NULL DEFAULT 'sent',
  `error_message` text DEFAULT NULL,
  `reference_id` varchar(64) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_channel` (`channel`),
  KEY `idx_event` (`event_type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`),
  KEY `idx_notification_log_network` (`network_id`,`id`),
  KEY `idx_net_chan_ref` (`network_id`,`channel`,`reference_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_notification_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_notification_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `channel` varchar(32) DEFAULT 'whatsapp',
  `department` enum('sales','inventory','finance','network','system') NOT NULL,
  `event_type` varchar(64) NOT NULL,
  `recipient_phone` varchar(32) NOT NULL,
  `recipient_name` varchar(128) DEFAULT NULL,
  `message_text` text NOT NULL,
  `status` enum('pending','approved','sent','failed','cancelled') DEFAULT 'pending',
  `requires_approval` tinyint(1) DEFAULT 0,
  `reference_id` varchar(64) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `scheduled_at` datetime DEFAULT current_timestamp(),
  `sent_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_status_schedule` (`status`,`scheduled_at`),
  KEY `idx_dept_event` (`department`,`event_type`),
  KEY `idx_notification_queue_network` (`network_id`,`id`),
  KEY `idx_notif_q_status_time` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_notification_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_notification_receipts` (
  `notification_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`notification_id`,`admin_id`),
  KEY `idx_notification_receipts_admin` (`admin_id`,`deleted_at`,`read_at`),
  KEY `idx_notification_receipt_network` (`network_id`,`admin_id`),
  CONSTRAINT `fk_notification_receipt_admin` FOREIGN KEY (`admin_id`) REFERENCES `um_admins` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notification_receipt_notification` FOREIGN KEY (`notification_id`) REFERENCES `um_notifications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` enum('alert','financial','performance','voucher','system') NOT NULL DEFAULT 'system',
  `title` varchar(128) NOT NULL,
  `message` text NOT NULL,
  `target_role` varchar(64) DEFAULT NULL,
  `target_admin_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `metadata` longtext DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `target_role` (`target_role`),
  KEY `target_admin_id` (`target_admin_id`),
  KEY `is_read` (`is_read`),
  KEY `created_at` (`created_at`),
  KEY `idx_notification_network_date` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_partners_equity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_partners_equity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) DEFAULT NULL,
  `partner_name` varchar(128) NOT NULL,
  `profit_share_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `capital_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `current_account_id` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_partner_equity_network_admin` (`network_id`,`admin_id`),
  KEY `admin_id_2` (`admin_id`),
  KEY `idx_partner_equity_network` (`network_id`,`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `otp_code` varchar(16) NOT NULL,
  `attempts` int(11) DEFAULT 0,
  `is_used` tinyint(1) DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `phone` (`phone`),
  KEY `admin_id` (`admin_id`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `purchase_id` bigint(20) unsigned DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(20) DEFAULT NULL,
  `method` smallint(6) DEFAULT NULL,
  `transaction_key` varchar(255) DEFAULT NULL,
  `transaction_status` smallint(6) DEFAULT NULL,
  `result_code` varchar(80) DEFAULT NULL,
  `result_message` varchar(300) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_network_source` (`network_id`,`source_id`),
  KEY `idx_um_payments_user` (`user_id`,`completed_at`),
  KEY `idx_um_payments_purchase` (`purchase_id`),
  KEY `fk_um_payments_customer` (`customer_id`),
  KEY `idx_payment_network` (`network_id`,`created_at`),
  CONSTRAINT `fk_um_payments_customer` FOREIGN KEY (`customer_id`) REFERENCES `um_customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_um_payments_purchase` FOREIGN KEY (`purchase_id`) REFERENCES `um_purchases` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_um_payments_user` FOREIGN KEY (`user_id`) REFERENCES `um_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_permission_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_permission_catalog` (
  `permission_key` varchar(128) NOT NULL,
  `module_key` varchar(64) NOT NULL,
  `action_key` varchar(64) NOT NULL,
  `scope_key` enum('all','own','children','assigned','delegated','network') NOT NULL DEFAULT 'own',
  `permission_name_ar` varchar(180) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_sensitive` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`permission_key`),
  KEY `idx_permission_module` (`module_key`,`action_key`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_port_forwarding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_port_forwarding` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `listen_port` int(11) NOT NULL,
  `protocol` enum('tcp','udp','both') NOT NULL DEFAULT 'tcp',
  `target_ip` varchar(45) NOT NULL,
  `target_port` int(11) NOT NULL,
  `source_type` enum('all','country','asn','cidr','mixed') NOT NULL DEFAULT 'all',
  `source_value` mediumtext DEFAULT NULL,
  `source_label` varchar(255) DEFAULT NULL,
  `priority` enum('high','normal') NOT NULL DEFAULT 'normal',
  `comment` varchar(255) DEFAULT '',
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  `router_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_port_proto` (`listen_port`,`protocol`),
  UNIQUE KEY `uq_pf_listen_port` (`listen_port`),
  KEY `idx_port_forward_network` (`network_id`,`is_enabled`),
  KEY `idx_pf_router` (`router_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_pos_card_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_pos_card_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `request_no` varchar(64) NOT NULL,
  `network_id` int(11) NOT NULL,
  `pos_admin_id` int(11) NOT NULL,
  `profile_name` varchar(64) NOT NULL,
  `card_price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `page_count` int(11) NOT NULL DEFAULT 1,
  `cards_per_page` int(11) NOT NULL DEFAULT 10,
  `total_cards` int(11) NOT NULL DEFAULT 10,
  `total_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `discount_rate` decimal(5,2) DEFAULT 0.00,
  `net_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `payment_method` enum('credit_balance','cash','debt','lot_balance') NOT NULL DEFAULT 'credit_balance',
  `status` enum('pending','approved','generated','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `batch_id` bigint(20) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `reviewed_by_admin_id` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_no` (`request_no`),
  KEY `network_id` (`network_id`),
  KEY `pos_admin_id` (`pos_admin_id`),
  KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_pos_free_voucher_grants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_pos_free_voucher_grants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `rule_id` int(11) DEFAULT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `paid_profile_name` varchar(64) DEFAULT '',
  `pos_admin_id` int(11) NOT NULL,
  `beneficiary_admin_id` int(11) NOT NULL,
  `basis_type` enum('sheets_sales','revenue_sales','data_consumption') NOT NULL,
  `basis_units` decimal(12,2) NOT NULL DEFAULT 0.00,
  `granted_cards_count` int(11) NOT NULL,
  `profile_name` varchar(64) NOT NULL,
  `voucher_codes` text DEFAULT NULL,
  `granted_by_admin_id` int(11) NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_network_pos_grant` (`network_id`,`pos_admin_id`),
  KEY `idx_rule_grant` (`rule_id`),
  KEY `idx_grant_inv` (`network_id`,`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_pos_free_voucher_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_pos_free_voucher_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL,
  `pos_admin_id` int(11) NOT NULL DEFAULT 0,
  `paid_profile_name` varchar(64) NOT NULL DEFAULT '',
  `include_sub_pos` tinyint(1) NOT NULL DEFAULT 1,
  `rule_type` enum('sheets_sales','revenue_sales','data_consumption') NOT NULL DEFAULT 'sheets_sales',
  `threshold_value` decimal(12,2) NOT NULL DEFAULT 1.00,
  `free_cards_count` int(11) NOT NULL DEFAULT 1,
  `profile_name` varchar(64) NOT NULL,
  `send_method` enum('whatsapp','sms','both','none') NOT NULL DEFAULT 'whatsapp',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_network_pos` (`network_id`,`pos_admin_id`),
  KEY `idx_rule_type` (`rule_type`),
  KEY `idx_pos_paid_prof` (`network_id`,`pos_admin_id`,`paid_profile_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_pos_network_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_pos_network_assignments` (
  `pos_admin_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `node_id` int(11) DEFAULT NULL,
  `assigned_by_admin_id` int(11) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`pos_admin_id`,`network_id`),
  KEY `idx_pos_network` (`network_id`,`pos_admin_id`),
  KEY `idx_pos_node` (`node_id`),
  KEY `fk_posna_assigner` (`assigned_by_admin_id`),
  CONSTRAINT `fk_posna_assigner` FOREIGN KEY (`assigned_by_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posna_network` FOREIGN KEY (`network_id`) REFERENCES `um_networks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_posna_node` FOREIGN KEY (`node_id`) REFERENCES `um_network_nodes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posna_pos` FOREIGN KEY (`pos_admin_id`) REFERENCES `um_admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_pos_network_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_pos_network_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `request_no` varchar(64) NOT NULL,
  `pos_admin_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `shop_name` varchar(160) DEFAULT NULL,
  `phone` varchar(32) NOT NULL,
  `location_notes` text DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `discount_rate` decimal(5,2) DEFAULT 0.00,
  `credit_limit` decimal(14,2) DEFAULT 0.00,
  `opening_debt` decimal(14,2) DEFAULT 0.00,
  `opening_balance` decimal(14,2) DEFAULT 0.00,
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `is_confirmed_by_pos` tinyint(1) DEFAULT 1,
  `confirmation_notes` text DEFAULT NULL,
  `initiated_by` enum('pos_agent','network_manager','distributor') NOT NULL DEFAULT 'pos_agent',
  `reviewed_by_admin_id` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_no` (`request_no`),
  KEY `pos_admin_id` (`pos_admin_id`),
  KEY `network_id` (`network_id`),
  KEY `status` (`status`),
  KEY `phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_print_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_print_batches` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `batch_id` varchar(64) NOT NULL,
  `profile_name` varchar(64) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `cards_per_sheet` int(11) NOT NULL DEFAULT 20,
  `total_cards` int(11) NOT NULL DEFAULT 0,
  `total_sheets` int(11) NOT NULL DEFAULT 0,
  `printed_by_admin_id` int(11) DEFAULT NULL,
  `print_status` enum('draft','confirmed_printed') DEFAULT 'draft',
  `confirmed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `start_sheet_no` int(11) DEFAULT NULL,
  `end_sheet_no` int(11) DEFAULT NULL,
  `unit_price` decimal(10,2) DEFAULT 0.00,
  `total_amount` decimal(15,2) DEFAULT 0.00,
  `assigned_to_admin_id` int(11) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_print_batch_network` (`network_id`,`batch_id`),
  KEY `batch_id_2` (`batch_id`),
  KEY `profile_name` (`profile_name`),
  KEY `print_status` (`print_status`),
  KEY `idx_batch_status` (`print_status`,`created_at`),
  KEY `idx_pb_owner` (`printed_by_admin_id`,`id`),
  KEY `idx_print_batch_network` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_profiles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `display_name` varchar(128) DEFAULT NULL,
  `price` decimal(14,2) NOT NULL DEFAULT 0.00,
  `validity_seconds` bigint(20) unsigned NOT NULL DEFAULT 0,
  `shared_users` smallint(5) unsigned NOT NULL DEFAULT 1,
  `starts_at_mode` int(11) NOT NULL DEFAULT 0,
  `dynamic_price` tinyint(1) NOT NULL DEFAULT 0,
  `free_trial` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_profiles_source` (`source_id`),
  KEY `idx_um_profiles_customer` (`customer_id`),
  KEY `idx_um_profiles_name` (`name`),
  KEY `idx_import_profile_network` (`network_id`,`name`),
  CONSTRAINT `fk_um_profiles_customer` FOREIGN KEY (`customer_id`) REFERENCES `um_customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_profiles_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_profiles_def` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `mikrotik_group` varchar(64) DEFAULT NULL,
  `name_for_users` varchar(255) DEFAULT NULL,
  `package_type` enum('paid','free') NOT NULL DEFAULT 'paid',
  `validity` varchar(32) DEFAULT '30d',
  `starts_at` varchar(32) DEFAULT 'first-logon',
  `price` decimal(10,2) DEFAULT 0.00,
  `cost_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `shared_users` int(11) DEFAULT 1,
  `rate_limit` varchar(64) DEFAULT NULL,
  `burst_rate` varchar(64) DEFAULT NULL,
  `burst_threshold` varchar(64) DEFAULT NULL,
  `burst_time` varchar(32) DEFAULT NULL,
  `priority` int(11) DEFAULT 8,
  `transfer_limit` bigint(20) DEFAULT 0,
  `uptime_limit` varchar(32) DEFAULT NULL,
  `address_list` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `template_id` int(11) DEFAULT NULL,
  `allow_speed_change` tinyint(1) NOT NULL DEFAULT 0,
  `default_speed` varchar(32) DEFAULT '2M/2M',
  `max_speed` varchar(32) DEFAULT '2M/2M',
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_profile_network_name` (`network_id`,`name`),
  KEY `idx_um_profiles_def_package_type` (`package_type`),
  KEY `idx_profile_network` (`network_id`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_profit_distributions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_profit_distributions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `distribution_no` varchar(64) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `gross_revenue` decimal(15,2) NOT NULL DEFAULT 0.00,
  `cogs_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `expenses_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `depreciation_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net_profit` decimal(15,2) NOT NULL DEFAULT 0.00,
  `distribution_status` enum('draft','posted') NOT NULL DEFAULT 'posted',
  `journal_entry_id` int(11) DEFAULT NULL,
  `details_json` longtext DEFAULT NULL,
  `created_by` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_profit_distribution_network_no` (`network_id`,`distribution_no`),
  KEY `distribution_no_2` (`distribution_no`),
  KEY `period_start` (`period_start`),
  KEY `period_end` (`period_end`),
  KEY `idx_profit_distribution_network` (`network_id`,`period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_purchase_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_purchase_invoice_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_invoice_id` int(11) NOT NULL,
  `asset_template_id` int(11) DEFAULT NULL,
  `item_name` varchar(160) NOT NULL,
  `model` varchar(128) DEFAULT NULL,
  `category` varchar(64) NOT NULL DEFAULT 'other',
  `quantity` decimal(12,3) NOT NULL,
  `unit_type` varchar(32) NOT NULL DEFAULT 'قطعة',
  `unit_price` decimal(15,2) NOT NULL,
  `line_total` decimal(15,2) NOT NULL,
  `asset_id` int(11) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_pii_invoice` (`purchase_invoice_id`),
  KEY `idx_pii_asset` (`asset_id`),
  KEY `idx_purchase_item_network` (`network_id`,`purchase_invoice_id`),
  CONSTRAINT `fk_pii_invoice` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `um_purchase_invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_purchase_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_purchase_invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(64) NOT NULL,
  `supplier_id` int(11) NOT NULL,
  `supplier_invoice_no` varchar(100) DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `network_id` int(11) NOT NULL,
  `warehouse_name` varchar(128) NOT NULL DEFAULT 'المخزن العام',
  `received_by_admin_id` int(11) DEFAULT NULL,
  `responsible_admin_id` int(11) DEFAULT NULL,
  `payment_type` enum('cash','credit','partial') NOT NULL DEFAULT 'cash',
  `payment_account_id` int(11) DEFAULT NULL,
  `inventory_account_id` int(11) NOT NULL,
  `payable_account_id` int(11) NOT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `paid_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `remaining_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `journal_entry_id` int(11) DEFAULT NULL,
  `status` enum('posted','cancelled') NOT NULL DEFAULT 'posted',
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `currency_total_amount` decimal(15,2) DEFAULT NULL,
  `currency_paid_amount` decimal(15,2) DEFAULT NULL,
  `currency_remaining_amount` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `idx_pi_supplier` (`supplier_id`),
  KEY `idx_pi_date` (`invoice_date`),
  KEY `idx_pi_network` (`network_id`),
  CONSTRAINT `fk_pi_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `um_suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_recurring_expense_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_recurring_expense_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_no` varchar(64) NOT NULL,
  `recurring_expense_id` int(11) DEFAULT NULL,
  `expense_type` enum('internet','rent','fuel','maintenance_parts','maintenance_labor','electricity') NOT NULL,
  `title_snapshot` varchar(160) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_account_id` int(11) NOT NULL,
  `expense_account_id` int(11) NOT NULL,
  `cost_center_id` int(11) DEFAULT NULL,
  `journal_entry_id` int(11) DEFAULT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `currency_amount` decimal(15,2) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recurring_payment_network_no` (`network_id`,`payment_no`),
  KEY `idx_rep_parent` (`recurring_expense_id`),
  KEY `idx_rep_date` (`payment_date`),
  KEY `idx_rep_journal` (`journal_entry_id`),
  KEY `idx_recurring_payment_network` (`network_id`,`payment_date`),
  CONSTRAINT `fk_rep_parent` FOREIGN KEY (`recurring_expense_id`) REFERENCES `um_recurring_expenses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_recurring_expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_recurring_expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `expense_type` enum('internet','rent','fuel','maintenance_parts','maintenance_labor','electricity') NOT NULL,
  `title` varchar(160) NOT NULL,
  `provider_name` varchar(160) DEFAULT NULL,
  `contract_number` varchar(100) DEFAULT NULL,
  `network_id` int(11) NOT NULL,
  `router_id` int(11) DEFAULT NULL,
  `node_id` int(11) DEFAULT NULL,
  `responsible_admin_id` int(11) DEFAULT NULL,
  `package_name` varchar(160) DEFAULT NULL,
  `line_identifier` varchar(160) DEFAULT NULL,
  `speed` varchar(80) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `billing_cycle` enum('monthly','custom') NOT NULL DEFAULT 'monthly',
  `custom_period_days` int(11) DEFAULT NULL,
  `start_date` date NOT NULL,
  `next_due_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `payment_account_id` int(11) DEFAULT NULL,
  `expense_account_id` int(11) NOT NULL,
  `cost_center_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `currency_amount` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_re_type` (`expense_type`),
  KEY `idx_re_network` (`network_id`),
  KEY `idx_re_router` (`router_id`),
  KEY `idx_re_node` (`node_id`),
  KEY `idx_re_due` (`next_due_date`),
  KEY `idx_re_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_registration_otps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_registration_otps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `phone` varchar(32) NOT NULL,
  `otp_code` varchar(16) NOT NULL,
  `account_type` varchar(32) NOT NULL,
  `payload_json` longtext NOT NULL,
  `attempts` int(11) DEFAULT 0,
  `is_verified` tinyint(1) DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `phone` (`phone`),
  KEY `otp_code` (`otp_code`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_role_permissions` (
  `role_key` varchar(64) NOT NULL,
  `permission_key` varchar(128) NOT NULL,
  `effect` enum('grant','deny') NOT NULL DEFAULT 'grant',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`role_key`,`permission_key`),
  KEY `idx_role_effect` (`role_key`,`effect`),
  KEY `fk_rp_permission` (`permission_key`),
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_key`) REFERENCES `um_permission_catalog` (`permission_key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_roles_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_roles_def` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_key` varchar(64) NOT NULL,
  `role_name_ar` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `permissions` longtext DEFAULT NULL CHECK (json_valid(`permissions`)),
  `is_system` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `default_data_scope` enum('all','own','children','assigned','delegated','network') DEFAULT 'own',
  `parent_account_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_router_status_monitor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_router_status_monitor` (
  `network_id` int(11) NOT NULL,
  `router_id` int(11) NOT NULL,
  `last_status` enum('online','offline') DEFAULT NULL,
  `last_notified_status` enum('online','offline') DEFAULT NULL,
  `pending_status` enum('online','offline') DEFAULT NULL,
  `pending_count` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `last_checked_at` datetime DEFAULT NULL,
  `changed_at` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`network_id`,`router_id`),
  KEY `idx_router_monitor_pending` (`network_id`,`last_status`,`last_notified_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_routers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_routers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `shared_secret` varbinary(255) DEFAULT NULL,
  `coa_port` smallint(5) unsigned NOT NULL DEFAULT 1700,
  `use_coa2` tinyint(1) NOT NULL DEFAULT 0,
  `log_events` tinyint(1) NOT NULL DEFAULT 0,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `description` varchar(300) DEFAULT NULL,
  `timezone_offset` int(11) NOT NULL DEFAULT 10800,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_routers_source` (`source_id`),
  KEY `idx_um_routers_customer` (`customer_id`),
  KEY `idx_import_router_network` (`network_id`,`id`),
  CONSTRAINT `fk_um_routers_customer` FOREIGN KEY (`customer_id`) REFERENCES `um_customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_salary_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_salary_payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_no` varchar(64) NOT NULL,
  `employee_id` int(11) NOT NULL,
  `employee_name` varchar(128) NOT NULL,
  `month_year` varchar(7) NOT NULL,
  `payment_date` date NOT NULL,
  `basic_salary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_allowances` decimal(15,2) NOT NULL DEFAULT 0.00,
  `advances_deduction` decimal(15,2) NOT NULL DEFAULT 0.00,
  `penalties_deduction` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net_salary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `payment_account_id` int(11) NOT NULL,
  `expense_account_id` int(11) NOT NULL DEFAULT 51,
  `cost_center_id` int(11) DEFAULT NULL,
  `journal_entry_id` int(11) DEFAULT NULL,
  `status` enum('paid','draft') NOT NULL DEFAULT 'paid',
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(18,8) DEFAULT 1.00000000,
  `currency_net_salary` decimal(15,2) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salary_payment_network_no` (`network_id`,`payment_no`),
  KEY `employee_id` (`employee_id`),
  KEY `month_year` (`month_year`),
  KEY `payment_date` (`payment_date`),
  KEY `journal_entry_id` (`journal_entry_id`),
  KEY `idx_salary_payment_network` (`network_id`,`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_sales_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_sales_invoice_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) NOT NULL,
  `item_type` enum('cards','instant_balance','digital_voucher') NOT NULL DEFAULT 'cards',
  `profile_name` varchar(64) NOT NULL,
  `batch_id` varchar(64) DEFAULT NULL,
  `sheets_count` int(11) NOT NULL DEFAULT 1,
  `sheet_numbers` text DEFAULT NULL,
  `cards_count` int(11) NOT NULL DEFAULT 0,
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `gross_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `net_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cost_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `profit_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `profile_name` (`profile_name`),
  KEY `idx_sales_item_network` (`network_id`,`invoice_id`),
  CONSTRAINT `fk_sii_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `um_sales_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_sales_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_sales_invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(64) NOT NULL,
  `sale_kind` enum('cards','instant_balance','digital_voucher') NOT NULL DEFAULT 'cards',
  `seller_id` int(11) NOT NULL,
  `buyer_id` int(11) DEFAULT NULL,
  `buyer_phone` varchar(16) DEFAULT NULL,
  `buyer_name` varchar(128) DEFAULT NULL,
  `batch_id` varchar(64) DEFAULT NULL,
  `profile_name` varchar(64) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cost_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `profit_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `paid_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `remaining_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_type` enum('cash','credit','partial') DEFAULT 'cash',
  `invoice_status` enum('completed','refunded','cancelled') NOT NULL DEFAULT 'completed',
  `refunded_at` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(14,4) DEFAULT 1.0000,
  `currency_total_amount` decimal(12,2) DEFAULT 0.00,
  `currency_paid_amount` decimal(12,2) DEFAULT 0.00,
  `currency_remaining_amount` decimal(12,2) DEFAULT 0.00,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `idx_seller` (`seller_id`),
  KEY `idx_buyer` (`buyer_id`),
  KEY `idx_inv_no` (`invoice_no`),
  KEY `idx_buyer_seller_date` (`buyer_id`,`seller_id`,`created_at`),
  KEY `idx_invoice_status_date` (`invoice_status`,`created_at`),
  KEY `idx_sales_network_date` (`network_id`,`created_at`),
  KEY `idx_sales_network_seller` (`network_id`,`seller_id`),
  KEY `idx_si_net_status_date` (`network_id`,`invoice_status`,`created_at`),
  KEY `idx_si_net_buyer_date` (`network_id`,`buyer_id`,`created_at`),
  CONSTRAINT `fk_si_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `fk_si_seller` FOREIGN KEY (`seller_id`) REFERENCES `um_admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_sales_return_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_sales_return_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_id` int(11) NOT NULL,
  `invoice_item_id` int(11) DEFAULT NULL,
  `profile_name` varchar(64) NOT NULL,
  `batch_id` varchar(64) DEFAULT NULL,
  `sheet_numbers` text DEFAULT NULL,
  `sheets_count` int(11) NOT NULL DEFAULT 0,
  `cards_count` int(11) NOT NULL DEFAULT 0,
  `unit_price` decimal(14,6) NOT NULL DEFAULT 0.000000,
  `return_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `card_ids` longtext DEFAULT NULL,
  `sheet_card_counts` longtext DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_ret_id` (`return_id`),
  KEY `idx_sales_return_item_network` (`network_id`,`return_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_sales_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_sales_returns` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `return_no` varchar(64) NOT NULL,
  `invoice_id` int(11) NOT NULL,
  `invoice_no` varchar(64) NOT NULL,
  `seller_id` int(11) NOT NULL,
  `buyer_id` int(11) NOT NULL,
  `returned_cards_count` int(11) NOT NULL DEFAULT 0,
  `returned_sheets_count` int(11) NOT NULL DEFAULT 0,
  `returned_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refund_method` enum('deduct_debt','cash_refund','credit_balance') DEFAULT 'deduct_debt',
  `reason` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `return_no` (`return_no`),
  KEY `idx_ret_inv` (`invoice_id`),
  KEY `idx_ret_seller` (`seller_id`),
  KEY `idx_ret_buyer` (`buyer_id`),
  KEY `idx_sales_return_network` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_settings` (
  `setting_key` varchar(64) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_speed_tiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_speed_tiers` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `label` varchar(80) NOT NULL,
  `rate_limit` varchar(64) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_speed_tier_network_rate` (`network_id`,`rate_limit`),
  KEY `idx_speed_tier_network` (`network_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_stock_adjustment_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_stock_adjustment_lines` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `adjustment_id` int(11) NOT NULL,
  `profile_name` varchar(64) NOT NULL,
  `sheet_numbers` text DEFAULT NULL,
  `cards_count` int(11) NOT NULL DEFAULT 0,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_retail` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_adj` (`adjustment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_stock_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_stock_adjustments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `adjustment_no` varchar(64) NOT NULL,
  `network_id` int(11) NOT NULL,
  `inventory_id` int(11) DEFAULT NULL,
  `warehouse_admin_id` int(11) NOT NULL,
  `adjustment_type` enum('deficit','surplus','damaged','lost','correction') NOT NULL,
  `status` enum('draft','pending_approval','posted','cancelled') NOT NULL DEFAULT 'draft',
  `total_cards` int(11) NOT NULL DEFAULT 0,
  `cost_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `retail_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `financial_tx_id` int(11) DEFAULT NULL,
  `journal_entry_id` int(11) DEFAULT NULL,
  `is_immutable` tinyint(1) NOT NULL DEFAULT 0,
  `reason` text NOT NULL,
  `created_by` int(11) NOT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `adjustment_no` (`adjustment_no`),
  KEY `idx_net_type` (`network_id`,`adjustment_type`),
  KEY `idx_wh` (`warehouse_admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_stock_inventories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_stock_inventories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inventory_no` varchar(64) NOT NULL,
  `network_id` int(11) NOT NULL,
  `warehouse_admin_id` int(11) NOT NULL,
  `inventory_date` date NOT NULL,
  `status` enum('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
  `total_book_cards` int(11) NOT NULL DEFAULT 0,
  `total_actual_cards` int(11) NOT NULL DEFAULT 0,
  `total_variance_cards` int(11) NOT NULL DEFAULT 0,
  `total_cost_variance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_retail_variance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_no` (`inventory_no`),
  KEY `idx_net_wh` (`network_id`,`warehouse_admin_id`),
  KEY `idx_date` (`inventory_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_stock_inventory_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_stock_inventory_lines` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inventory_id` int(11) NOT NULL,
  `profile_name` varchar(64) NOT NULL,
  `book_sheets_count` int(11) NOT NULL DEFAULT 0,
  `book_cards_count` int(11) NOT NULL DEFAULT 0,
  `actual_sheets_count` int(11) NOT NULL DEFAULT 0,
  `actual_cards_count` int(11) NOT NULL DEFAULT 0,
  `variance_cards` int(11) NOT NULL DEFAULT 0,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `retail_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `variance_cost_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `variance_retail_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inv` (`inventory_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_stock_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_stock_transfers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `transfer_no` varchar(64) NOT NULL,
  `transfer_type` enum('transfer','return','adjustment','sale','sale_return') NOT NULL DEFAULT 'transfer',
  `status` enum('draft','pending_approval','posted','rejected','cancelled') NOT NULL DEFAULT 'posted',
  `sender_admin_id` int(11) DEFAULT NULL,
  `receiver_admin_id` int(11) DEFAULT NULL,
  `profile_name` varchar(64) NOT NULL,
  `sheets_count` int(11) NOT NULL DEFAULT 1,
  `sheet_numbers` text DEFAULT NULL,
  `cards_count` int(11) NOT NULL DEFAULT 0,
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cost_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `retail_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_by` int(11) DEFAULT NULL,
  `is_immutable` tinyint(1) NOT NULL DEFAULT 1,
  `financial_tx_id` int(11) DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `journal_entry_id` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_no` (`transfer_no`),
  KEY `sender_admin_id` (`sender_admin_id`),
  KEY `receiver_admin_id` (`receiver_admin_id`),
  KEY `transfer_type` (`transfer_type`),
  KEY `profile_name` (`profile_name`),
  KEY `created_at` (`created_at`),
  KEY `idx_sender_receiver_type` (`sender_admin_id`,`receiver_admin_id`,`transfer_type`),
  KEY `idx_transfer_type_date` (`transfer_type`,`created_at`),
  KEY `idx_stock_network_date` (`network_id`,`created_at`),
  CONSTRAINT `fk_st_receiver` FOREIGN KEY (`receiver_admin_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `fk_st_sender` FOREIGN KEY (`sender_admin_id`) REFERENCES `um_admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_subscriber_network_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_subscriber_network_memberships` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscriber_id` int(11) NOT NULL,
  `network_id` int(11) NOT NULL,
  `username` varchar(64) NOT NULL,
  `profile_id` int(11) DEFAULT NULL,
  `balance` decimal(18,4) NOT NULL DEFAULT 0.0000,
  `debt_limit` decimal(18,4) NOT NULL DEFAULT 0.0000,
  `status` enum('active','suspended','expired','locked') NOT NULL DEFAULT 'active',
  `mac_lock` varchar(32) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sub_net_username` (`network_id`,`username`),
  KEY `idx_snm_sub` (`subscriber_id`),
  KEY `idx_snm_network` (`network_id`),
  KEY `idx_snm_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_subscribers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_subscribers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(128) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(128) DEFAULT NULL,
  `national_id` varchar(64) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by_admin_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_sub_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_code` varchar(32) NOT NULL,
  `name` varchar(160) NOT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `whatsapp` varchar(32) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `tax_no` varchar(80) DEFAULT NULL,
  `payable_account_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_network_code` (`network_id`,`supplier_code`),
  KEY `idx_supplier_name` (`name`),
  KEY `idx_supplier_phone` (`phone`),
  KEY `idx_payable_account` (`payable_account_id`),
  KEY `idx_supplier_network` (`network_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_system_owners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_system_owners` (
  `admin_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_ui_default_layouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_ui_default_layouts` (
  `role_key` varchar(64) NOT NULL,
  `ui_settings` longtext NOT NULL,
  `updated_by_admin_id` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_usermanager_import_daily`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_usermanager_import_daily` (
  `network_id` int(11) NOT NULL,
  `import_day` date NOT NULL,
  `router_id` int(11) NOT NULL,
  `batch_id` varchar(96) NOT NULL,
  `imported_count` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`network_id`,`import_day`),
  KEY `idx_um_usermanager_import_daily_router` (`router_id`,`import_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `username` varchar(128) NOT NULL,
  `radius_password` varbinary(255) DEFAULT NULL,
  `first_name` varchar(120) DEFAULT NULL,
  `last_name` varchar(120) DEFAULT NULL,
  `email` varchar(200) DEFAULT NULL,
  `phone` varchar(80) DEFAULT NULL,
  `location` varchar(200) DEFAULT NULL,
  `description` varchar(300) DEFAULT NULL,
  `group_name` varchar(128) DEFAULT NULL,
  `address_list` varchar(128) DEFAULT NULL,
  `ipv4_address` varchar(45) DEFAULT NULL,
  `ipv6_prefix` varchar(64) DEFAULT NULL,
  `pool_name` varchar(128) DEFAULT NULL,
  `caller_id` varchar(128) DEFAULT NULL,
  `shared_users` smallint(5) unsigned NOT NULL DEFAULT 1,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `registered_at` datetime DEFAULT NULL,
  `last_seen_at` datetime DEFAULT NULL,
  `last_ip` varchar(45) DEFAULT NULL,
  `last_mac` varchar(32) DEFAULT NULL,
  `money_paid` decimal(14,2) NOT NULL DEFAULT 0.00,
  `money_used` decimal(14,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_um_users_username` (`username`),
  UNIQUE KEY `uq_um_users_source` (`source_id`),
  KEY `idx_um_users_customer` (`customer_id`),
  KEY `idx_um_users_status` (`disabled`,`last_seen_at`),
  KEY `idx_import_user_network` (`network_id`,`username`),
  CONSTRAINT `fk_um_users_customer` FOREIGN KEY (`customer_id`) REFERENCES `um_customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_voucher_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_voucher_audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `voucher_id` int(11) NOT NULL,
  `voucher_no` varchar(64) NOT NULL,
  `modified_by` int(11) NOT NULL,
  `action_type` enum('edit','delete','reverse') DEFAULT 'edit',
  `old_amount` decimal(12,2) NOT NULL,
  `new_amount` decimal(12,2) NOT NULL,
  `old_party_id` int(11) DEFAULT NULL,
  `new_party_id` int(11) DEFAULT NULL,
  `old_party_name` varchar(128) DEFAULT NULL,
  `new_party_name` varchar(128) DEFAULT NULL,
  `old_payment_method` varchar(32) DEFAULT NULL,
  `new_payment_method` varchar(32) DEFAULT NULL,
  `edit_reason` text DEFAULT NULL,
  `diff_summary` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_v_id` (`voucher_id`),
  KEY `idx_v_no` (`voucher_no`),
  KEY `idx_mod_by` (`modified_by`),
  KEY `idx_voucher_audit_network` (`network_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_vouchers_financial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_vouchers_financial` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `voucher_no` varchar(64) NOT NULL,
  `voucher_type` enum('receipt','payment') NOT NULL,
  `source_account_id` int(11) DEFAULT NULL,
  `destination_account_id` int(11) DEFAULT NULL,
  `party_id` int(11) DEFAULT NULL,
  `party_name` varchar(128) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','bank','kareemi','onecash','other') DEFAULT 'cash',
  `category` varchar(64) DEFAULT 'general',
  `cost_center_id` int(11) DEFAULT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `reference_id` varchar(64) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `updated_by` int(11) DEFAULT NULL,
  `is_void` tinyint(1) NOT NULL DEFAULT 0,
  `voided_at` datetime DEFAULT NULL,
  `currency_code` varchar(16) DEFAULT 'YER_SANAA',
  `exchange_rate` decimal(14,4) DEFAULT 1.0000,
  `currency_amount` decimal(12,2) DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `voucher_no` (`voucher_no`),
  KEY `idx_v_type` (`voucher_type`),
  KEY `idx_v_party` (`party_id`),
  KEY `idx_invoice_id` (`invoice_id`),
  KEY `idx_ref_id` (`reference_id`),
  KEY `fk_vf_dest_acc` (`destination_account_id`),
  KEY `idx_party_type_date` (`party_id`,`voucher_type`,`created_at`),
  KEY `idx_src_dest_type` (`source_account_id`,`destination_account_id`,`voucher_type`),
  KEY `idx_vf_net_type_date` (`network_id`,`voucher_type`,`created_at`),
  KEY `idx_vf_net_party` (`network_id`,`party_id`),
  KEY `idx_vf_net_source_dest` (`network_id`,`source_account_id`,`destination_account_id`),
  CONSTRAINT `fk_vf_dest_acc` FOREIGN KEY (`destination_account_id`) REFERENCES `um_chart_of_accounts` (`id`),
  CONSTRAINT `fk_vf_party` FOREIGN KEY (`party_id`) REFERENCES `um_admins` (`id`),
  CONSTRAINT `fk_vf_source_acc` FOREIGN KEY (`source_account_id`) REFERENCES `um_chart_of_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_vouchers_meta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_vouchers_meta` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `batch_id` varchar(64) DEFAULT NULL,
  `profile_name` varchar(64) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT 0.00,
  `validity` varchar(32) DEFAULT NULL,
  `status` enum('active','disabled','expired','used') DEFAULT 'active',
  `first_login` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `comment` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `owner_admin_id` int(11) DEFAULT NULL,
  `sold_by_admin_id` int(11) DEFAULT NULL,
  `sold_at` datetime DEFAULT NULL,
  `sale_price` decimal(10,2) DEFAULT 0.00,
  `purchase_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `profit_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `buyer_phone` varchar(16) DEFAULT NULL,
  `buyer_name` varchar(128) DEFAULT NULL,
  `login_password_mode` enum('blank','same_as_username') NOT NULL DEFAULT 'blank',
  `delivery_status` enum('pending','sent','failed','refunded') NOT NULL DEFAULT 'pending',
  `delivered_at` datetime DEFAULT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `source_balance_invoice_id` int(11) DEFAULT NULL,
  `sheet_no` int(11) DEFAULT 1,
  `is_printed` tinyint(1) DEFAULT 0,
  `printed_by_admin_id` int(11) DEFAULT NULL,
  `printed_at` datetime DEFAULT NULL,
  `is_sold` tinyint(1) DEFAULT 0,
  `is_free_quota` tinyint(1) DEFAULT 0,
  `free_recipient_id` int(11) DEFAULT NULL,
  `free_granted_at` datetime DEFAULT NULL,
  `custom_speed` varchar(32) DEFAULT NULL,
  `max_devices` int(11) NOT NULL DEFAULT 1,
  `speed_mode` varchar(32) DEFAULT 'default',
  `mac_lock_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `locked_mac` varchar(32) DEFAULT NULL,
  `network_id` int(11) NOT NULL DEFAULT 1,
  `is_hidden_from_free_list` tinyint(1) DEFAULT 0,
  `grant_type` varchar(32) DEFAULT 'instant',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_voucher_network_username` (`network_id`,`username`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_profile` (`profile_name`),
  KEY `idx_status` (`status`),
  KEY `idx_sheet_print_sold` (`sheet_no`,`is_printed`,`is_sold`),
  KEY `idx_exp_first` (`first_login`,`expires_at`),
  KEY `is_free_quota` (`is_free_quota`),
  KEY `free_recipient_id` (`free_recipient_id`),
  KEY `sheet_no` (`sheet_no`),
  KEY `owner_admin_id` (`owner_admin_id`),
  KEY `is_sold` (`is_sold`),
  KEY `idx_dist_status_batch` (`owner_admin_id`,`status`,`batch_id`),
  KEY `idx_batch_status_sheet` (`batch_id`,`status`,`sheet_no`),
  KEY `idx_profile_status` (`profile_name`,`status`),
  KEY `idx_vouchers_kpi` (`status`,`is_free_quota`,`owner_admin_id`,`profile_name`,`batch_id`),
  KEY `idx_voucher_network_owner` (`network_id`,`owner_admin_id`),
  KEY `idx_voucher_network_username` (`network_id`,`username`),
  KEY `idx_voucher_username` (`username`),
  KEY `idx_voucher_net_created` (`network_id`,`created_at`),
  KEY `idx_vm_net_id` (`network_id`,`id` DESC),
  KEY `idx_vm_net_first_exp` (`network_id`,`first_login`,`expires_at`),
  KEY `idx_vm_net_free_price` (`network_id`,`is_free_quota`,`price`),
  KEY `idx_vm_net_batch_id` (`network_id`,`batch_id`,`id` DESC),
  KEY `idx_vm_net_prof_id` (`network_id`,`profile_name`,`id` DESC),
  KEY `idx_vm_net_status_id` (`network_id`,`status`,`id` DESC),
  KEY `idx_vm_net_kpi_covering` (`network_id`,`status`,`is_free_quota`,`price`,`first_login`,`expires_at`),
  KEY `idx_vm_net_free_recip` (`network_id`,`is_free_quota`,`free_recipient_id`,`status`),
  KEY `idx_vm_net_free_status` (`network_id`,`is_free_quota`,`status`,`id` DESC),
  KEY `idx_free_quota_recip` (`network_id`,`is_free_quota`,`free_recipient_id`),
  KEY `idx_um_vm_free_hidden` (`network_id`,`is_free_quota`,`is_hidden_from_free_list`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_wallet_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_wallet_transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) NOT NULL,
  `transaction_type` enum('credit','voucher_sale','adjustment','refund') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `balance_after` decimal(14,2) NOT NULL,
  `reference_type` varchar(32) DEFAULT NULL,
  `reference_id` varchar(64) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_wallet_admin_date` (`admin_id`,`created_at`),
  KEY `idx_wallet_tx_network_admin` (`network_id`,`admin_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `um_whatsapp_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `um_whatsapp_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `template_code` varchar(64) NOT NULL,
  `template_name` varchar(128) NOT NULL,
  `department` enum('sales','inventory','finance','network','system') NOT NULL,
  `recipient_type` enum('buyer','seller','beneficiary','admin','group') DEFAULT 'buyer',
  `template_text` text NOT NULL,
  `available_placeholders` text NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `requires_approval` tinyint(1) DEFAULT 0,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `network_id` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_whatsapp_network_code` (`network_id`,`template_code`),
  KEY `idx_whatsapp_template_network` (`network_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `v_roaming_networks`;
/*!50001 DROP VIEW IF EXISTS `v_roaming_networks`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `v_roaming_networks` AS SELECT
 1 AS `nas_ip`,
  1 AS `network_id` */;
SET character_set_client = @saved_cs_client;
/*!50001 DROP VIEW IF EXISTS `v_roaming_networks`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb3 */;
/*!50001 SET character_set_results     = utf8mb3 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_roaming_networks` AS select `n`.`nasname` AS `nas_ip`,`p`.`peer_network_id` AS `network_id` from (`nas` `n` join `um_network_roaming_peers` `p` on(`p`.`network_id` = `n`.`network_id` and `p`.`status` = 'active')) union select `n`.`nasname` AS `nas_ip`,`n`.`network_id` AS `network_id` from `nas` `n` union select '127.0.0.1' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '::1' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '192.168.3.1' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '192.168.3.2' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '172.16.0.1' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '10.1.0.1' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` union select '10.1.0.252' AS `nas_ip`,`um_networks`.`id` AS `network_id` from `um_networks` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- Run once during installation/upgrade, before activating NetworkReadService.
-- No schema alteration is performed from a web request.
-- The application already distinguishes damaged/lost inventory; baseline ENUM omitted both.
ALTER TABLE um_stock_inventories
    ADD COLUMN IF NOT EXISTS direct_request_key VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS direct_request_hash CHAR(64) DEFAULT NULL,
    ADD UNIQUE INDEX IF NOT EXISTS uq_direct_request(network_id,created_by,direct_request_key),
    ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_vouchers_meta
    MODIFY COLUMN status ENUM('active','disabled','expired','used','damaged','lost') DEFAULT 'active',
    ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_financial_transactions
    ADD INDEX IF NOT EXISTS idx_fin_tx_cursor(network_id,account_id,id),
    ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_wallet_transactions
    ADD INDEX IF NOT EXISTS idx_wallet_cursor(network_id,admin_id,id),
    ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_vouchers_meta
    ADD INDEX IF NOT EXISTS idx_paid_delivery_cursor(network_id,comment,id),
    ADD INDEX IF NOT EXISTS idx_paid_delivery_actor_cursor(network_id,sold_by_admin_id,comment,id),
    ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE um_wallet_transactions ADD INDEX IF NOT EXISTS idx_wallet_reference(network_id,reference_type,reference_id,id), ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE um_instant_balance_transfers
 ADD COLUMN IF NOT EXISTS request_key VARCHAR(100) DEFAULT NULL,
 ADD COLUMN IF NOT EXISTS request_hash CHAR(64) DEFAULT NULL,
 ADD COLUMN IF NOT EXISTS cost_value DECIMAL(14,2) DEFAULT NULL,
 ADD UNIQUE INDEX IF NOT EXISTS uq_ib_request(network_id,sender_admin_id,request_key),
 ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_instant_balance_lots ADD INDEX IF NOT EXISTS idx_ib_lot_transfer(network_id,owner_admin_id,status,expires_at,id), ALGORITHM=INPLACE, LOCK=NONE;

CREATE TABLE IF NOT EXISTS um_voucher_delivery_attempts (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 network_id INT NOT NULL,
 voucher_id BIGINT NOT NULL,
 created_by INT NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 state ENUM('sending','accepted','failed','uncertain') NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at DATETIME DEFAULT NULL,
 UNIQUE KEY uq_delivery_request(network_id,created_by,request_key),
 KEY idx_delivery_voucher(network_id,voucher_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS um_wallet_sales (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, network_id INT NOT NULL, pos_admin_id INT NOT NULL,
 voucher_id BIGINT NOT NULL, network_invoice_id INT DEFAULT NULL, invoice_no VARCHAR(64) NOT NULL,
 distribution_amount DECIMAL(14,2) NOT NULL, retail_amount DECIMAL(14,2) NOT NULL, customer_paid_amount DECIMAL(14,2) DEFAULT NULL,
 network_journal_id INT NOT NULL, pos_journal_id BIGINT NOT NULL, refund_journal_id INT DEFAULT NULL,
 customer_refund_due DECIMAL(14,2) NOT NULL DEFAULT 0, customer_refund_paid_at DATETIME DEFAULT NULL,
 status ENUM('completed','refunded') NOT NULL DEFAULT 'completed',
 request_key VARCHAR(100) NOT NULL, request_hash CHAR(64) NOT NULL, created_by INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_wallet_sale_request(network_id,pos_admin_id,request_key),
 UNIQUE KEY uq_wallet_sale_card(network_id,voucher_id), KEY idx_wallet_sales_book(network_id,pos_admin_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS um_wallet_funding (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, network_id INT NOT NULL, pos_admin_id INT NOT NULL,
 amount DECIMAL(14,2) NOT NULL, journal_entry_id INT NOT NULL, request_key VARCHAR(100) NOT NULL,
 request_hash CHAR(64) NOT NULL, created_by INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_wallet_fund_request(network_id,created_by,request_key), KEY idx_wallet_fund_book(network_id,pos_admin_id,id), KEY idx_wallet_fund_journal(network_id,journal_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS um_pos_journals (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, network_id INT NOT NULL, pos_admin_id INT NOT NULL,
 reference_no VARCHAR(64) NOT NULL, event_type VARCHAR(32) NOT NULL,
 total_debit DECIMAL(14,2) NOT NULL, total_credit DECIMAL(14,2) NOT NULL,
 created_by INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_pos_journal_event(network_id,pos_admin_id,reference_no,event_type),
 KEY idx_pos_book(network_id,pos_admin_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS um_pos_journal_lines (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, network_id INT NOT NULL, pos_admin_id INT NOT NULL,
 journal_id BIGINT NOT NULL, account_code VARCHAR(32) NOT NULL,
 debit DECIMAL(14,2) NOT NULL, credit DECIMAL(14,2) NOT NULL,
 KEY idx_pos_lines(network_id,pos_admin_id,journal_id), KEY idx_pos_account(network_id,pos_admin_id,account_code,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE um_vouchers_meta MODIFY COLUMN login_password_mode ENUM('blank','same_as_username','different') NOT NULL DEFAULT 'blank', ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE um_sales_invoices MODIFY COLUMN sale_kind ENUM('cards','instant_balance','digital_voucher','wallet_distribution') NOT NULL DEFAULT 'cards', MODIFY COLUMN payment_type ENUM('cash','credit','partial','wallet') DEFAULT 'cash', ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE um_sales_invoice_items MODIFY COLUMN item_type ENUM('cards','instant_balance','digital_voucher','wallet_distribution') NOT NULL DEFAULT 'cards', ALGORITHM=INPLACE, LOCK=NONE;



CREATE TABLE IF NOT EXISTS `um_network_devices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_id` int(11) NOT NULL DEFAULT 1,
  `device_name` varchar(128) NOT NULL,
  `device_type` enum('router','switch','antenna','server','ups','olt','other') NOT NULL DEFAULT 'router',
  `ip_address` varchar(45) NOT NULL,
  `snmp_version` enum('v1','v2c','v3') NOT NULL DEFAULT 'v2c',
  `snmp_community` varchar(64) NOT NULL DEFAULT 'public',
  `snmp_port` int(11) NOT NULL DEFAULT 161,
  `polling_interval_minutes` int(11) NOT NULL DEFAULT 5,
  `status` enum('online','offline','warning','unknown') NOT NULL DEFAULT 'unknown',
  `last_seen` datetime DEFAULT NULL,
  `last_latency_ms` decimal(6,2) DEFAULT NULL,
  `cpu_usage` tinyint(3) unsigned DEFAULT NULL,
  `memory_usage` tinyint(3) unsigned DEFAULT NULL,
  `uptime_seconds` bigint(20) unsigned DEFAULT NULL,
  `temperature_celsius` decimal(5,1) DEFAULT NULL,
  `voltage` decimal(5,2) DEFAULT NULL,
  `traffic_in_mbps` decimal(10,2) DEFAULT NULL,
  `traffic_out_mbps` decimal(10,2) DEFAULT NULL,
  `extra_metrics_json` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_dev_network` (`network_id`,`is_active`),
  KEY `idx_dev_status` (`network_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
