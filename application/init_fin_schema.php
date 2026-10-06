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

// 1. Ensure Schema
$pdo->exec("
CREATE TABLE IF NOT EXISTS `um_exchange_rates` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `currency_code` VARCHAR(16) NOT NULL UNIQUE,
    `currency_name` VARCHAR(64) NOT NULL,
    `currency_symbol` VARCHAR(16) NOT NULL,
    `is_base_currency` TINYINT(1) DEFAULT 0,
    `exchange_rate` DECIMAL(18, 8) NOT NULL DEFAULT 1.00000000,
    `buy_rate` DECIMAL(18, 8) DEFAULT NULL,
    `sell_rate` DECIMAL(18, 8) DEFAULT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `display_order` INT DEFAULT 0,
    `last_updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `updated_by_admin_id` INT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_cost_centers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `center_code` VARCHAR(32) NOT NULL,
    `name_ar` VARCHAR(128) NOT NULL,
    `name_en` VARCHAR(128) DEFAULT NULL,
    `parent_id` INT DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `created_by` INT DEFAULT NULL,
    UNIQUE KEY `uk_network_center` (`network_id`, `center_code`),
    KEY `idx_cost_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_chart_of_accounts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `account_code` VARCHAR(32) NOT NULL,
    `name_ar` VARCHAR(128) NOT NULL,
    `name_en` VARCHAR(128) DEFAULT NULL,
    `account_type` ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
    `parent_id` INT DEFAULT NULL,
    `linked_admin_id` INT DEFAULT NULL,
    `owner_admin_id` INT DEFAULT NULL,
    `level` INT NOT NULL DEFAULT 1,
    `is_system` TINYINT(1) NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `balance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_net_account_code` (`network_id`, `account_code`),
    KEY `idx_coa_parent` (`parent_id`),
    KEY `idx_coa_type` (`account_type`),
    KEY `idx_coa_admin` (`linked_admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_journal_entries` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `entry_number` VARCHAR(64) NOT NULL,
    `entry_date` DATE NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `reference_type` VARCHAR(32) DEFAULT 'manual',
    `reference_id` INT DEFAULT NULL,
    `total_debit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `total_credit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `exchange_rate` DECIMAL(18, 8) DEFAULT 1.00000000,
    `is_posted` TINYINT(1) NOT NULL DEFAULT 1,
    `created_by` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_je_net_date` (`network_id`, `entry_date`),
    KEY `idx_je_ref` (`reference_type`, `reference_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_journal_entry_lines` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `journal_entry_id` INT NOT NULL,
    `account_id` INT NOT NULL,
    `cost_center_id` INT DEFAULT NULL,
    `description` VARCHAR(500) DEFAULT NULL,
    `debit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `credit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `exchange_rate` DECIMAL(18, 8) DEFAULT 1.00000000,
    `debit_base` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `credit_base` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_jel_entry` (`journal_entry_id`),
    KEY `idx_jel_account` (`account_id`),
    KEY `idx_jel_cost` (`cost_center_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_vouchers_financial` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `voucher_number` VARCHAR(64) NOT NULL,
    `voucher_type` ENUM('receipt', 'payment', 'journal') NOT NULL,
    `voucher_date` DATE NOT NULL,
    `party_type` VARCHAR(32) DEFAULT 'other',
    `party_id` INT DEFAULT NULL,
    `party_name` VARCHAR(128) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `exchange_rate` DECIMAL(18, 8) DEFAULT 1.00000000,
    `payment_method` VARCHAR(32) DEFAULT 'cash',
    `category` VARCHAR(64) DEFAULT NULL,
    `source_account_id` INT DEFAULT NULL,
    `destination_account_id` INT DEFAULT NULL,
    `cost_center_id` INT DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `status` VARCHAR(32) DEFAULT 'approved',
    `is_printed` TINYINT(1) DEFAULT 0,
    `created_by` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_vf_net_type` (`network_id`, `voucher_type`),
    KEY `idx_vf_date` (`voucher_date`),
    KEY `idx_vf_party` (`party_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_voucher_audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `voucher_id` INT NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `changed_by` INT DEFAULT NULL,
    `previous_state` TEXT DEFAULT NULL,
    `new_state` TEXT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_employee_salaries` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `admin_id` INT DEFAULT NULL,
    `employee_name` VARCHAR(128) NOT NULL,
    `job_title` VARCHAR(128) DEFAULT NULL,
    `basic_salary` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `housing_allowance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `transport_allowance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `other_allowances` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `social_insurance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `other_deductions` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `net_salary` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `payment_frequency` VARCHAR(32) DEFAULT 'monthly',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_es_admin` (`admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_salary_payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `salary_id` INT DEFAULT NULL,
    `admin_id` INT DEFAULT NULL,
    `period_month` INT NOT NULL,
    `period_year` INT NOT NULL,
    `basic_salary` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `total_allowances` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `total_deductions` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `net_paid` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `payment_date` DATE NOT NULL,
    `payment_method` VARCHAR(32) DEFAULT 'cash',
    `source_account_id` INT DEFAULT NULL,
    `voucher_id` INT DEFAULT NULL,
    `journal_entry_id` INT DEFAULT NULL,
    `status` VARCHAR(32) DEFAULT 'paid',
    `notes` TEXT DEFAULT NULL,
    `paid_by` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_partners_equity` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `partner_id` INT DEFAULT NULL,
    `partner_name` VARCHAR(128) NOT NULL,
    `capital_share_percentage` DECIMAL(8, 4) NOT NULL DEFAULT 0.0000,
    `initial_capital` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `current_capital` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `total_withdrawn` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `total_profits_earned` DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `um_profit_distributions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `network_id` INT NOT NULL DEFAULT 1,
    `distribution_date` DATE NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `total_net_profit` DECIMAL(18, 4) NOT NULL,
    `distributed_amount` DECIMAL(18, 4) NOT NULL,
    `retained_amount` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(16) DEFAULT 'YER',
    `journal_entry_id` INT DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_by` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
");

// 2. Default Currencies
$pdo->exec("
INSERT INTO `um_exchange_rates` (`currency_code`, `currency_name`, `currency_symbol`, `is_base_currency`, `exchange_rate`, `buy_rate`, `sell_rate`, `is_active`, `display_order`) VALUES
('YER', 'ريال يمني', 'ر.ي', 1, 1.00000000, 1.00000000, 1.00000000, 1, 1),
('SAR', 'ريال سعودي', 'ر.س', 0, 141.50000000, 140.50000000, 142.00000000, 1, 2),
('USD', 'دولار أمريكي', '$', 0, 535.00000000, 532.00000000, 537.00000000, 1, 3)
ON DUPLICATE KEY UPDATE currency_name = VALUES(currency_name);
");

// 3. Function to seed Chart of Accounts for a network
function seedStandardCoA(PDO $pdo, int $networkId = 1) {
    $accounts = [
        // Level 1: Assets
        ['code' => '1', 'name_ar' => 'الأصول', 'type' => 'asset', 'parent' => null, 'level' => 1, 'is_sys' => 1],
        // Level 2: Current & Fixed Assets
        ['code' => '11', 'name_ar' => 'الأصول المتداولة', 'type' => 'asset', 'parent' => '1', 'level' => 2, 'is_sys' => 1],
        ['code' => '12', 'name_ar' => 'الأصول الثابتة', 'type' => 'asset', 'parent' => '1', 'level' => 2, 'is_sys' => 1],
        // Level 3: Current Assets children
        ['code' => '1101', 'name_ar' => 'النقدية وما في حكمها', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
        ['code' => '1102', 'name_ar' => 'البنوك ومحافظ الصرافة', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
        ['code' => '1103', 'name_ar' => 'المدينون والعملاء والوكلاء', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
        ['code' => '1104', 'name_ar' => 'مخزون الكروت والمعدات', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
        ['code' => '1105', 'name_ar' => 'عهد وسلف ومصروفات مدفوعة مقدماً', 'type' => 'asset', 'parent' => '11', 'level' => 3, 'is_sys' => 1],
        // Level 4: Cashbox sub-accounts
        ['code' => '110101', 'name_ar' => 'الصندوق الرئيسي / الخزينة العامة', 'type' => 'asset', 'parent' => '1101', 'level' => 4, 'is_sys' => 1],
        ['code' => '110102', 'name_ar' => 'صناديق الفروع والمحصلين', 'type' => 'asset', 'parent' => '1101', 'level' => 4, 'is_sys' => 0],
        // Level 4: Bank & Wallet sub-accounts
        ['code' => '110201', 'name_ar' => 'بنك الكريمي للتمويل الأصغر', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
        ['code' => '110202', 'name_ar' => 'بنك التضامن الإسلامي', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
        ['code' => '110203', 'name_ar' => 'محفظة جايبي (Jawali / Jayebe)', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
        ['code' => '110204', 'name_ar' => 'محفظة ون كاش (OneCash)', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
        ['code' => '110205', 'name_ar' => 'محفظة فلوسك / كاش', 'type' => 'asset', 'parent' => '1102', 'level' => 4, 'is_sys' => 0],
        // Level 4: Receivables sub-accounts
        ['code' => '110301', 'name_ar' => 'حسابات الوكلاء والموزعين', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 1],
        ['code' => '110302', 'name_ar' => 'حسابات نقاط البيع (POS)', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 0],
        ['code' => '110303', 'name_ar' => 'مشتركو الخطوط والاشتراكات الشهرية', 'type' => 'asset', 'parent' => '1103', 'level' => 4, 'is_sys' => 0],
        // Level 4: Inventory sub-accounts
        ['code' => '110401', 'name_ar' => 'مخزون كروت المايكروتك الجاهزة', 'type' => 'asset', 'parent' => '1104', 'level' => 4, 'is_sys' => 1],
        ['code' => '110402', 'name_ar' => 'مخزون أجهزة ومعدات للبيع', 'type' => 'asset', 'parent' => '1104', 'level' => 4, 'is_sys' => 0],
        // Level 3: Fixed Assets
        ['code' => '1201', 'name_ar' => 'أبراج ومواقع البث', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1202', 'name_ar' => 'أجهزة الراوترات والسيرفرات (MikroTik / CCR)', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1203', 'name_ar' => 'الهوائيات والصحون والسكترات (Antennas)', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1204', 'name_ar' => 'كابلات الألياف والشبكة', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1205', 'name_ar' => 'منظومة الطاقة الشمسية والبطاريات والمولدات', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1206', 'name_ar' => 'أجهزة المكاتب والكمبيوتر', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 0],
        ['code' => '1209', 'name_ar' => 'مجمع إهلاك الأصول الثابتة', 'type' => 'asset', 'parent' => '12', 'level' => 3, 'is_sys' => 1],

        // Level 1: Liabilities
        ['code' => '2', 'name_ar' => 'الخصوم والالتزامات', 'type' => 'liability', 'parent' => null, 'level' => 1, 'is_sys' => 1],
        ['code' => '21', 'name_ar' => 'الخصوم المتداولة', 'type' => 'liability', 'parent' => '2', 'level' => 2, 'is_sys' => 1],
        ['code' => '2101', 'name_ar' => 'الموردون وحسابات الدائنين', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 1],
        ['code' => '210101', 'name_ar' => 'مزودو سعات وخطوط الإنترنت (ISP Providers)', 'type' => 'liability', 'parent' => '2101', 'level' => 4, 'is_sys' => 1],
        ['code' => '210102', 'name_ar' => 'موردو الأجهزة والمعدات وقطع الغيار', 'type' => 'liability', 'parent' => '2101', 'level' => 4, 'is_sys' => 0],
        ['code' => '2102', 'name_ar' => 'مستحقات الرواتب والأجور', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 1],
        ['code' => '2103', 'name_ar' => 'تأمينات وأمانات الوكلاء', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 0],
        ['code' => '2104', 'name_ar' => 'إيرادات اشتراكات مقبوضة مقدماً', 'type' => 'liability', 'parent' => '21', 'level' => 3, 'is_sys' => 0],

        // Level 1: Equity
        ['code' => '3', 'name_ar' => 'حقوق الملكية', 'type' => 'equity', 'parent' => null, 'level' => 1, 'is_sys' => 1],
        ['code' => '31', 'name_ar' => 'رأس المال', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
        ['code' => '3101', 'name_ar' => 'رأس المال المدفوع', 'type' => 'equity', 'parent' => '31', 'level' => 3, 'is_sys' => 1],
        ['code' => '3102', 'name_ar' => 'الأرصدة الافتتاحية والتسويات', 'type' => 'equity', 'parent' => '31', 'level' => 3, 'is_sys' => 1],
        ['code' => '32', 'name_ar' => 'جاري الشركاء والمساهمين', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
        ['code' => '3201', 'name_ar' => 'جاري الشركاء والمساهمين', 'type' => 'equity', 'parent' => '32', 'level' => 3, 'is_sys' => 1],
        ['code' => '33', 'name_ar' => 'الأرباح المبقاة والمرحلة', 'type' => 'equity', 'parent' => '3', 'level' => 2, 'is_sys' => 1],
        ['code' => '3301', 'name_ar' => 'أرباح مرحلة من سنوات سابقة', 'type' => 'equity', 'parent' => '33', 'level' => 3, 'is_sys' => 1],
        ['code' => '3302', 'name_ar' => 'أرباح وخسائر الفترة الحالية', 'type' => 'equity', 'parent' => '33', 'level' => 3, 'is_sys' => 1],

        // Level 1: Revenues
        ['code' => '4', 'name_ar' => 'الإيرادات', 'type' => 'revenue', 'parent' => null, 'level' => 1, 'is_sys' => 1],
        ['code' => '41', 'name_ar' => 'إيرادات النشاط الرئيسي', 'type' => 'revenue', 'parent' => '4', 'level' => 2, 'is_sys' => 1],
        ['code' => '4101', 'name_ar' => 'إيرادات مبيعات كروت المايكروتك', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
        ['code' => '4102', 'name_ar' => 'إيرادات الاشتراكات الشهرية والخطوط', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
        ['code' => '4103', 'name_ar' => 'إيرادات الشحن الفوري والرصيد المباشر', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 1],
        ['code' => '4104', 'name_ar' => 'إيرادات كروت VIP والخدمات الخاصة', 'type' => 'revenue', 'parent' => '41', 'level' => 3, 'is_sys' => 0],
        ['code' => '42', 'name_ar' => 'إيرادات خدمات وأرباح أخرى', 'type' => 'revenue', 'parent' => '4', 'level' => 2, 'is_sys' => 1],
        ['code' => '4201', 'name_ar' => 'إيرادات تركيب وصيانة شبكات للغير', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 0],
        ['code' => '4202', 'name_ar' => 'أرباح مبيعات أجهزة ومعدات شبكية', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 0],
        ['code' => '4203', 'name_ar' => 'إيرادات فروق أسعار الصرف', 'type' => 'revenue', 'parent' => '42', 'level' => 3, 'is_sys' => 1],

        // Level 1: Expenses
        ['code' => '5', 'name_ar' => 'المصروفات', 'type' => 'expense', 'parent' => null, 'level' => 1, 'is_sys' => 1],
        ['code' => '51', 'name_ar' => 'تكاليف التشغيل المباشرة', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
        ['code' => '5101', 'name_ar' => 'تكلفة سعات وخطوط الإنترنت الرئيسية (Bandwidth)', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
        ['code' => '5102', 'name_ar' => 'إيجارات مواقع وأبراج البث', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
        ['code' => '5103', 'name_ar' => 'وقود ومحروقات المولدات وكهرباء الأبراج', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
        ['code' => '5104', 'name_ar' => 'صيانة دورية لشبكات التوزيع والأبراج', 'type' => 'expense', 'parent' => '51', 'level' => 3, 'is_sys' => 1],
        ['code' => '52', 'name_ar' => 'الرواتب والأجور والمكافآت', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
        ['code' => '5201', 'name_ar' => 'رواتب المهندسين والفنيين', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 1],
        ['code' => '5202', 'name_ar' => 'رواتب الإدارة والمحاسبة والمبيعات', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 1],
        ['code' => '5203', 'name_ar' => 'مكافآت وحوافز وبدلات إضافية', 'type' => 'expense', 'parent' => '52', 'level' => 3, 'is_sys' => 0],
        ['code' => '53', 'name_ar' => 'المصروفات الإدارية والعمومية', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
        ['code' => '5301', 'name_ar' => 'إيجار المقر والمكاتب', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
        ['code' => '5302', 'name_ar' => 'فواتير المياه والكهرباء والاتصالات للمكاتب', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
        ['code' => '5303', 'name_ar' => 'مطبوعات وقرطاسية وتغليف كروت', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
        ['code' => '5304', 'name_ar' => 'ضيافة ونظافة ومصاريف بوفيه', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
        ['code' => '5305', 'name_ar' => 'عمولات بنكية ومصاريف تحويل صرافة', 'type' => 'expense', 'parent' => '53', 'level' => 3, 'is_sys' => 0],
        ['code' => '54', 'name_ar' => 'مصاريف التسويق والترويج', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
        ['code' => '5401', 'name_ar' => 'رسائل SMS وتنبيهات WhatsApp', 'type' => 'expense', 'parent' => '54', 'level' => 3, 'is_sys' => 0],
        ['code' => '5402', 'name_ar' => 'إعلانات وبنرات ولافتات ترويجية', 'type' => 'expense', 'parent' => '54', 'level' => 3, 'is_sys' => 0],
        ['code' => '55', 'name_ar' => 'الإهلاك والخسائر', 'type' => 'expense', 'parent' => '5', 'level' => 2, 'is_sys' => 1],
        ['code' => '5501', 'name_ar' => 'إهلاك الأجهزة والمعدات والأبراج', 'type' => 'expense', 'parent' => '55', 'level' => 3, 'is_sys' => 1],
        ['code' => '5502', 'name_ar' => 'ديون معدومة وخسائر فروق صرف', 'type' => 'expense', 'parent' => '55', 'level' => 3, 'is_sys' => 1],
    ];

    $codeToId = [];
    // First pass: insert / update accounts
    foreach ($accounts as $a) {
        $parentDbId = null;
        if (!empty($a['parent']) && isset($codeToId[$a['parent']])) {
            $parentDbId = $codeToId[$a['parent']];
        }

        $chk = $pdo->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=?");
        $chk->execute([$networkId, $a['code']]);
        $existingId = $chk->fetchColumn();

        if ($existingId) {
            $upd = $pdo->prepare("UPDATE um_chart_of_accounts SET name_ar=?, account_type=?, parent_id=?, level=?, is_system=? WHERE id=?");
            $upd->execute([$a['name_ar'], $a['type'], $parentDbId, $a['level'], $a['is_sys'], $existingId]);
            $codeToId[$a['code']] = (int)$existingId;
        } else {
            $ins = $pdo->prepare("INSERT INTO um_chart_of_accounts (network_id, account_code, name_ar, account_type, parent_id, level, is_system, is_active, balance) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0.00)");
            $ins->execute([$networkId, $a['code'], $a['name_ar'], $a['type'], $parentDbId, $a['level'], $a['is_sys']]);
            $codeToId[$a['code']] = (int)$pdo->lastInsertId();
        }
    }

    // Second pass to ensure parent IDs are properly wired
    foreach ($accounts as $a) {
        if (!empty($a['parent']) && isset($codeToId[$a['parent']]) && isset($codeToId[$a['code']])) {
            $pId = $codeToId[$a['parent']];
            $cId = $codeToId[$a['code']];
            $pdo->prepare("UPDATE um_chart_of_accounts SET parent_id=? WHERE id=?")->execute([$pId, $cId]);
        }
    }

    // Default Cost Centers
    $costCenters = [
        ['code' => 'CC-MAIN', 'name' => 'المركز الرئيسي والإدارة العامة', 'type' => 'general'],
        ['code' => 'CC-TOWERS', 'name' => 'أبراج ومواقع البث اللاسلكي', 'type' => 'tower_node'],
        ['code' => 'CC-FIBER', 'name' => 'شبكة الألياف الضوئية (FTTH)', 'type' => 'project'],
        ['code' => 'CC-SALES', 'name' => 'قسم المبيعات ونقاط التوزيع', 'type' => 'branch']
    ];
    foreach ($costCenters as $cc) {
        $chk = $pdo->prepare("SELECT id FROM um_cost_centers WHERE network_id=? AND center_code=?");
        $chk->execute([$networkId, $cc['code']]);
        if (!$chk->fetchColumn()) {
            $pdo->prepare("INSERT INTO um_cost_centers (network_id, center_code, name, center_type, is_active) VALUES (?, ?, ?, ?, 1)")
                ->execute([$networkId, $cc['code'], $cc['name'], $cc['type']]);
        }
    }

    echo "Chart of accounts seeded successfully for network #$networkId. (" . count($accounts) . " accounts)\n";
}

// Run for active networks
$networks = $pdo->query("SELECT id FROM um_networks")->fetchAll(PDO::FETCH_COLUMN) ?: [1];
foreach ($networks as $nid) {
    seedStandardCoA($pdo, (int)$nid);
}

echo "Financial initialization complete!\n";
?>
