<?php





final class RecurringExpensesApi


{

    private static function activeNetworkId(PDO $db): int
    {
        $id=(int)$db->query("SELECT COALESCE(@sam_active_network_id,0)")->fetchColumn();
        if($id<=0 && session_status()===PHP_SESSION_ACTIVE)$id=(int)($_SESSION['active_network_id']??0);
        if($id<=0)throw new Exception('لم يتم تحديد شبكة نشطة');
        $db->exec("SET @sam_active_network_id=".$id);
        return $id;
    }


    public static function migrate(PDO $db): void


    {


        static $done = false;


        if ($done) return;

        $networkId=self::activeNetworkId($db);


        $db->exec("CREATE TABLE IF NOT EXISTS um_recurring_expenses (


            id INT AUTO_INCREMENT PRIMARY KEY,


            expense_type ENUM('internet','rent','fuel','maintenance_parts','maintenance_labor','electricity') NOT NULL,


            title VARCHAR(160) NOT NULL,


            provider_name VARCHAR(160) NULL,


            contract_number VARCHAR(100) NULL,


            network_id INT NOT NULL,


            router_id INT NULL,


            node_id INT NULL,


            responsible_admin_id INT NULL,


            package_name VARCHAR(160) NULL,


            line_identifier VARCHAR(160) NULL,


            speed VARCHAR(80) NULL,


            amount DECIMAL(15,2) NOT NULL DEFAULT 0,


            billing_cycle ENUM('monthly','custom') NOT NULL DEFAULT 'monthly',


            custom_period_days INT NULL,


            start_date DATE NOT NULL,


            next_due_date DATE NOT NULL,


            end_date DATE NULL,


            payment_account_id INT NULL,


            expense_account_id INT NOT NULL,


            cost_center_id INT NULL,


            is_active TINYINT(1) NOT NULL DEFAULT 1,


            notes TEXT NULL,


            created_by INT NULL,


            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,


            INDEX idx_re_type (expense_type), INDEX idx_re_network (network_id),


            INDEX idx_re_router (router_id), INDEX idx_re_node (node_id), INDEX idx_re_due (next_due_date), INDEX idx_re_active (is_active)


        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");


        


        $db->exec("CREATE TABLE IF NOT EXISTS um_recurring_expense_payments (


            id INT AUTO_INCREMENT PRIMARY KEY,


            payment_no VARCHAR(64) NOT NULL UNIQUE,


            recurring_expense_id INT NULL,


            expense_type ENUM('internet','rent','fuel','maintenance_parts','maintenance_labor','electricity') NOT NULL,


            title_snapshot VARCHAR(160) NOT NULL,


            period_start DATE NOT NULL,


            period_end DATE NOT NULL,


            payment_date DATE NOT NULL,


            amount DECIMAL(15,2) NOT NULL,


            payment_account_id INT NOT NULL,


            expense_account_id INT NOT NULL,


            cost_center_id INT NULL,


            journal_entry_id INT NULL,


            reference_no VARCHAR(100) NULL,


            notes TEXT NULL,


            created_by INT NULL,


            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


            INDEX idx_rep_parent (recurring_expense_id), INDEX idx_rep_date (payment_date),


            INDEX idx_rep_journal (journal_entry_id)


        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");





        try {


            $db->exec("ALTER TABLE um_recurring_expense_payments MODIFY recurring_expense_id INT NULL");


        } catch (Throwable $t) {}





        $stParent=$db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_type='expense' AND parent_id IS NULL ORDER BY id LIMIT 1");$stParent->execute([$networkId]);$parent=$stParent->fetchColumn();


        if (!$parent){$stParent=$db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_type='expense' ORDER BY level,id LIMIT 1");$stParent->execute([$networkId]);$parent=$stParent->fetchColumn();}


        


        foreach ([


            ['5401','مصروف اشتراكات وخطوط الإنترنت','Internet subscriptions'],


            ['5402','مصروف الإيجارات','Rent expense'],


            ['5403','مصروف المحروقات','Fuel expense'],


            ['5404','مشتريات مواد وقطع الصيانة','Maintenance parts'],


            ['5405','أجور الصيانة والتصليح','Maintenance labor'],


            ['5406','مصروف الكهرباء','Electricity expense']


        ] as $a) {


            $st = $db->prepare("INSERT IGNORE INTO um_chart_of_accounts(network_id,account_code,name_ar,name_en,account_type,parent_id,level,is_system,is_active) VALUES(?,?,?,?,'expense',?,2,1,1)");


            $st->execute([$networkId,$a[0], $a[1], $a[2], $parent ?: null]);


        }


        $done = true;


    }





    /**


     * Get or create admin's personal ledger account in Chart of Accounts


     */


    public static function getOrCreateAdminAccount(PDO $db, int $adminId): array


    {

        $networkId=self::activeNetworkId($db);


        $st = $db->prepare("SELECT id,account_code,name_ar,account_type,balance FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND is_active=1 ORDER BY id LIMIT 1");


        $st->execute([$networkId,$adminId]);


        $acc = $st->fetch(PDO::FETCH_ASSOC);


        if ($acc) return $acc;





        $st=$db->prepare("SELECT a.id,a.username,a.fullname,r.role_key AS role FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 WHERE a.id=?");$st->execute([$networkId,$adminId]);$adm=$st->fetch(PDO::FETCH_ASSOC);


        if (!$adm) {


            $adm = ['id' => $adminId, 'username' => 'admin', 'fullname' => 'مالك النظام', 'role' => 'system_owner'];


        }





        $name = !empty($adm['fullname']) ? $adm['fullname'] : $adm['username'];


        $isPartner = in_array($adm['role'] ?? 'system_owner', ['system_owner', 'superadmin', 'partner'], true);


        $parentCode = $isPartner ? '3201' : '1302';


        $accType = $isPartner ? 'equity' : 'asset';





        $st=$db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=? LIMIT 1");$st->execute([$networkId,$parentCode]);$parentId=(int)$st->fetchColumn();


        if (!$parentId) {


            $st=$db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_type=? ORDER BY level,id LIMIT 1");$st->execute([$networkId,$accType]);$parentId=(int)$st->fetchColumn();


        }





        $subCode = $parentCode . str_pad((string)$adminId, 2, '0', STR_PAD_LEFT);


        


        // Ensure subCode is unique


        $st=$db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=?");$st->execute([$networkId,$subCode]);$exists=(int)$st->fetchColumn();


        if ($exists) {


            $subCode = $parentCode . '-' . $adminId;


        }





        $prefix = $isPartner ? 'جاري الشريك/المدير: ' : 'عهدة وسلف: ';


        $accName = $prefix . $name;





        $ins = $db->prepare("INSERT INTO um_chart_of_accounts (network_id,owner_admin_id,account_code,name_ar,account_type,parent_id,linked_admin_id,level,is_system,is_active,balance) VALUES (?,?, ?, ?, ?, ?, ?,3,0,1,0.00)");


        $ins->execute([$networkId,$adminId,$subCode, $accName, $accType, $parentId ?: null, $adminId]);


        $accId = (int)$db->lastInsertId();





        return [


            'id' => $accId,


            'account_code' => $subCode,


            'name_ar' => $accName,


            'account_type' => $accType,


            'balance' => 0.00


        ];


    }





    public static function list(PDO $db, int $adminId = 1): array


    {


        self::migrate($db);

        $networkId=self::activeNetworkId($db);


        $sql = "SELECT r.*, n.name network_name, COALESCE(NULLIF(nas.shortname,''),nas.nasname) router_name, nn.node_name, nn.node_type, a.fullname responsible_name,


                     pa.name_ar payment_account_name, ea.name_ar expense_account_name,


                     (SELECT MAX(p.payment_date) FROM um_recurring_expense_payments p WHERE p.network_id=r.network_id AND p.recurring_expense_id=r.id) last_payment_date,


                     (SELECT COUNT(*) FROM um_recurring_expense_payments p WHERE p.network_id=r.network_id AND p.recurring_expense_id=r.id) payments_count


              FROM um_recurring_expenses r


              LEFT JOIN um_networks n ON n.id=r.network_id LEFT JOIN nas ON nas.id=r.router_id


              LEFT JOIN um_network_nodes nn ON nn.network_id=r.network_id AND (nn.node_name=r.node_id OR nn.id=r.node_id)


              LEFT JOIN um_admins a ON a.id=r.responsible_admin_id


              LEFT JOIN um_chart_of_accounts pa ON pa.network_id=r.network_id AND pa.id=r.payment_account_id


              LEFT JOIN um_chart_of_accounts ea ON ea.network_id=r.network_id AND ea.id=r.expense_account_id


              WHERE r.network_id=? ORDER BY r.is_active DESC, r.next_due_date, r.id";


        $st=$db->prepare($sql);$st->execute([$networkId]);$items=$st->fetchAll(PDO::FETCH_ASSOC);


        


        $st=$db->prepare("SELECT n.id,n.name FROM um_networks n JOIN um_admin_network_access x ON x.network_id=n.id AND x.admin_id=? AND x.is_active=1 WHERE n.status='active' ORDER BY n.name");$st->execute([$adminId]);$nets=$st->fetchAll(PDO::FETCH_ASSOC);


        $st=$db->prepare("SELECT nas.id,COALESCE(NULLIF(nas.shortname,''),nas.nasname) name,nas.nasname,nas.network_id FROM nas WHERE nas.network_id=? ORDER BY name");$st->execute([$networkId]);$routers=$st->fetchAll(PDO::FETCH_ASSOC);


        $st=$db->prepare("SELECT nn.id,nn.node_name name,nn.node_type,nn.parent_id,nn.nas_ip,nas.id router_id,nn.network_id FROM um_network_nodes nn LEFT JOIN nas ON nas.network_id=nn.network_id AND nas.nasname=nn.nas_ip WHERE nn.network_id=? AND nn.is_active=1 ORDER BY nn.nas_ip,nn.parent_id,nn.id");$st->execute([$networkId]);$nodes=$st->fetchAll(PDO::FETCH_ASSOC);


        $st=$db->prepare("SELECT a.id,COALESCE(NULLIF(a.fullname,''),a.username) name,r.role_key AS role,b.balance FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 JOIN um_admin_network_roles r ON r.admin_id=a.id AND r.network_id=x.network_id AND r.is_active=1 LEFT JOIN um_admin_network_balances b ON b.admin_id=a.id AND b.network_id=x.network_id WHERE a.is_active=1 ORDER BY name");$st->execute([$networkId]);$admins=$st->fetchAll(PDO::FETCH_ASSOC);


        


        // Fetch ALL accounts for flexible spending


        $st=$db->prepare("SELECT id,account_code,name_ar,account_type,balance FROM um_chart_of_accounts WHERE network_id=? AND is_active=1 ORDER BY account_code");$st->execute([$networkId]);$accounts=$st->fetchAll(PDO::FETCH_ASSOC);





        // Find main cashbox account (1101)


        $cashboxAccount = null;


        foreach ($accounts as $acc) {


            if ($acc['account_code'] === '1101' || strpos($acc['name_ar'], 'الصندوق الرئيسي') !== false) {


                $cashboxAccount = $acc;


                break;


            }


        }


        if (!$cashboxAccount && !empty($accounts)) {


            $cashboxAccount = $accounts[0];


        }





        // Current admin account


        $currentAdminAccount = self::getOrCreateAdminAccount($db, $adminId);


        


        // Direct operational payment history


        $st=$db->prepare("SELECT p.*, j.entry_no, pa.name_ar payment_account_name, ea.name_ar expense_account_name, ea.account_code expense_account_code, adm.fullname creator_name 


            FROM um_recurring_expense_payments p 


            LEFT JOIN um_journal_entries j ON j.id = p.journal_entry_id 


            LEFT JOIN um_chart_of_accounts pa ON pa.id = p.payment_account_id 


            LEFT JOIN um_chart_of_accounts ea ON ea.id = p.expense_account_id 


            LEFT JOIN um_admins adm ON adm.id = p.created_by


            WHERE p.network_id=? ORDER BY p.payment_date DESC, p.id DESC LIMIT 150");$st->execute([$networkId]);$directPayments=$st->fetchAll(PDO::FETCH_ASSOC);





        $summary = ['monthly' => 0, 'due' => 0, 'internet' => 0, 'rent' => 0, 'fuel' => 0, 'maintenance_parts' => 0, 'maintenance_labor' => 0, 'electricity' => 0, 'direct_total' => 0];


        $today = date('Y-m-d');


        


        foreach ($items as $x) {


            $v = (float)$x['amount'];


            if ($x['billing_cycle'] === 'monthly') $summary['monthly'] += $v;


            $summary[$x['expense_type']] += $v;


            if ($x['next_due_date'] <= $today) $summary['due'] += $v;


        }





        foreach ($directPayments as $dp) {


            $summary['direct_total'] += (float)$dp['amount'];


        }





        return [


            'success' => true,


            'items' => $items,


            'recurring_expenses' => $items,


            'direct_payments' => $directPayments,


            'networks' => $nets,


            'routers' => $routers,


            'nodes' => $nodes,


            'admins' => $admins,


            'accounts' => $accounts,


            'cashbox_account' => $cashboxAccount,


            'current_admin_account' => $currentAdminAccount,


            'summary' => $summary


        ];


    }





    public static function save(PDO $db, array $d, int $adminId): array


    {


        self::migrate($db);

        $activeNetworkId=self::activeNetworkId($db);


        $id = (int)($d['id'] ?? 0);

        $rawType = $d['expense_type'] ?? '';

        if ($rawType === 'isp_line') $rawType = 'internet';

        if ($rawType === 'site_rent') $rawType = 'rent';

        $allowed = ['internet', 'rent'];

        $type = in_array($rawType, $allowed, true) ? $rawType : 'internet';


        


        $title = trim((string)($d['title'] ?? ($d['item_desc'] ?? ($d['provider_name'] ?? ($d['subtype_details'] ?? ($d['notes'] ?? 'مصروف تشغيلي مباشر'))))));
        if ($title === '') $title = 'مصروف تشغيلي مباشر';


        $network = $activeNetworkId;


        $baseCurrencyRow = $db->query("SELECT currency_code FROM um_exchange_rates WHERE is_base_currency=1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $baseCode = !empty($baseCurrencyRow['currency_code']) ? $baseCurrencyRow['currency_code'] : 'YER_SANAA';
        $currencyCode = strtoupper(trim((string)($d['currency_code'] ?? $baseCode)));
        $exchangeRate = (float)($d['exchange_rate'] ?? 1.0);
        if ($exchangeRate <= 0) $exchangeRate = 1.0;
        $currencyAmount = (float)($d['currency_amount'] ?? ($d['amount'] ?? 0));
        $amount = ($currencyCode !== $baseCode && $exchangeRate > 0) ? round($currencyAmount * $exchangeRate, 2) : $currencyAmount;


        $cycle = ($d['billing_cycle'] ?? 'monthly') === 'custom' ? 'custom' : 'monthly';


        $days = $cycle === 'custom' ? (int)($d['custom_period_days'] ?? 0) : null;


        $start = $d['start_date'] ?? date('Y-m-d');


        $due = $d['next_due_date'] ?? $start;


        $expense = (int)($d['expense_account_id'] ?? 0);





        if ($title === '' || $network < 1 || $amount <= 0 || $expense < 1) {


            throw new Exception('الاسم والشبكة والمبلغ وحساب المصروف مطلوبة');


        }


        if ($cycle === 'custom' && $days < 1) {


            throw new Exception('حدد عدد أيام الدورة المخصصة');


        }





        $router = (int)($d['router_id'] ?? 0) ?: null;


        $node = (int)($d['node_id'] ?? 0) ?: null;

        if($router){$st=$db->prepare("SELECT 1 FROM nas WHERE network_id=? AND id=?");$st->execute([$network,$router]);if(!$st->fetchColumn())throw new Exception('الراوتر لا يتبع الشبكة النشطة');}
        if($node){$st=$db->prepare("SELECT 1 FROM um_network_nodes WHERE network_id=? AND id=?");$st->execute([$network,$node]);if(!$st->fetchColumn())throw new Exception('العقدة لا تتبع الشبكة النشطة');}
        foreach(['payment_account_id','expense_account_id'] as $accountField){$accountId=(int)($d[$accountField]??0);if($accountId){$st=$db->prepare("SELECT 1 FROM um_chart_of_accounts WHERE network_id=? AND id=? AND is_active=1");$st->execute([$network,$accountId]);if(!$st->fetchColumn())throw new Exception('حساب مالي خارج الشبكة النشطة');}}
        $responsible=(int)($d['responsible_admin_id']??0);if($responsible){$st=$db->prepare("SELECT 1 FROM um_admin_network_access WHERE network_id=? AND admin_id=? AND is_active=1");$st->execute([$network,$responsible]);if(!$st->fetchColumn())throw new Exception('المسؤول ليس عضوًا في الشبكة النشطة');}





        $vals = [
            $type, $title, trim((string)($d['provider_name'] ?? '')) ?: null, trim((string)($d['contract_number'] ?? '')) ?: null,
            $network, $router, $node, $responsible ?: null,
            trim((string)($d['package_name'] ?? '')) ?: null, trim((string)($d['line_identifier'] ?? '')) ?: null,
            trim((string)($d['speed'] ?? '')) ?: null, $amount, $currencyCode, $exchangeRate, $currencyAmount, $cycle, $days, $start, $due,
            !empty($d['end_date']) ? $d['end_date'] : null, (int)($d['payment_account_id'] ?? 0) ?: null,
            $expense, null, trim((string)($d['notes'] ?? '')) ?: null
        ];

        if ($id) {
            $st = $db->prepare("UPDATE um_recurring_expenses SET expense_type=?,title=?,provider_name=?,contract_number=?,network_id=?,router_id=?,node_id=?,responsible_admin_id=?,package_name=?,line_identifier=?,speed=?,amount=?,currency_code=?,exchange_rate=?,currency_amount=?,billing_cycle=?,custom_period_days=?,start_date=?,next_due_date=?,end_date=?,payment_account_id=?,expense_account_id=?,cost_center_id=?,notes=? WHERE network_id=? AND id=?");
            $vals[] = $network;
            $vals[] = $id;
            $st->execute($vals);
            if($st->rowCount()===0){$chk=$db->prepare("SELECT 1 FROM um_recurring_expenses WHERE network_id=? AND id=?");$chk->execute([$network,$id]);if(!$chk->fetchColumn())throw new Exception('الالتزام غير موجود في الشبكة النشطة');}
        } else {
            $st = $db->prepare("INSERT INTO um_recurring_expenses(expense_type,title,provider_name,contract_number,network_id,router_id,node_id,responsible_admin_id,package_name,line_identifier,speed,amount,currency_code,exchange_rate,currency_amount,billing_cycle,custom_period_days,start_date,next_due_date,end_date,payment_account_id,expense_account_id,cost_center_id,notes,created_by) VALUES(" . implode(',', array_fill(0, 25, '?')) . ")");
            $vals[] = $adminId;
            $st->execute($vals);
            $id = (int)$db->lastInsertId();
        }

        return ['success' => true, 'id' => $id, 'message' => 'تم حفظ الالتزام الدوري بنجاح'];


    }





    /**


     * Direct Operating Expense Voucher (سند صرف تشغيلي فوري ومباشر)


     * Supports:


     * 1. 'admin_funding' (Default): Funds cashbox [1101] from current admin's account, then disburses to expense.


     * 2. 'cashbox_direct': Disburses directly from cashbox [1101].


     * 3. 'custom_account': Disburses directly from another financial account.


     */


    public static function createDirectExpenseVoucher(PDO $db, $service, array $d, int $adminId): array


    {


        self::migrate($db);


        $baseCurrencyRow = $db->query("SELECT currency_code FROM um_exchange_rates WHERE is_base_currency=1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $baseCode = !empty($baseCurrencyRow['currency_code']) ? $baseCurrencyRow['currency_code'] : 'YER_SANAA';
        $currencyCode = strtoupper(trim((string)($d['currency_code'] ?? $baseCode)));
        $exchangeRate = (float)($d['exchange_rate'] ?? 1.0);
        if ($exchangeRate <= 0) $exchangeRate = 1.0;
        $currencyAmount = (float)($d['currency_amount'] ?? ($d['amount'] ?? 0));
        $amount = ($currencyCode !== 'YER_SANAA' && $currencyCode !== 'YER' && $exchangeRate > 0) ? round($currencyAmount * $exchangeRate, 2) : $currencyAmount;


        $expAcc = (int)($d['expense_account_id'] ?? 0);


        $expenseType = in_array($d['expense_type'] ?? '', ['fuel', 'maintenance_parts', 'maintenance_labor', 'electricity', 'general'], true) ? $d['expense_type'] : 'fuel';


        $title = trim((string)($d['title'] ?? ($d['item_desc'] ?? ($d['provider_name'] ?? ($d['subtype_details'] ?? ($d['notes'] ?? 'مصروف تشغيلي مباشر'))))));
        if ($title === '') $title = 'مصروف تشغيلي مباشر';


        $beneficiary = trim((string)($d['beneficiary'] ?? ''));


        $date = $d['payment_date'] ?? date('Y-m-d');


        $refNo = trim((string)($d['reference_no'] ?? ''));


        $notes = trim((string)($d['notes'] ?? ''));


        $paymentMode = $d['payment_mode'] ?? 'admin_funding'; // admin_funding | cashbox_direct | custom_account


        $payAcc = (int)($d['payment_account_id'] ?? 0);





        if ($amount <= 0) throw new Exception('يرجى تحديد مبلغ الصرف');


        if ($expAcc < 1) throw new Exception('يرجى تحديد حساب المصروف في شجرة الحسابات');


        if ($title === '') throw new Exception('يرجى كتابة بيان أو مسمى المصروف');





        $labels = [


            'fuel' => 'وقود ومحروقات',


            'maintenance_parts' => 'مواد وقطع صيانة',


            'maintenance_labor' => 'أجور صيانة وتصليح',


            'electricity' => 'كهرباء وطاقة',


            'general' => 'مصروف تشغيلي عام'


        ];





        $typeLabel = $labels[$expenseType] ?? 'مصروف تشغيلي';


        $no = 'VOP-' . date('YmdHis') . '-' . random_int(10, 99);


        $desc = "سند صرف تشغيلي ($typeLabel) - $title " . ($beneficiary ? " - المدفوع له: $beneficiary" : "");





        // Find main cashbox account [1101]


        $stCash=$db->prepare("SELECT id,account_code,name_ar FROM um_chart_of_accounts WHERE network_id=? AND (account_code='1101' OR name_ar LIKE '%الصندوق الرئيسي%') ORDER BY CASE WHEN account_code='1101' THEN 0 ELSE 1 END LIMIT 1");$stCash->execute([$networkId]);$cashbox=$stCash->fetch(PDO::FETCH_ASSOC);


        if (!$cashbox) throw new Exception('حساب الصندوق الرئيسي [1101] غير معرف في شجرة الحسابات');


        $cashboxId = (int)$cashbox['id'];





        // Get or create current admin's personal account


        $adminAcc = self::getOrCreateAdminAccount($db, $adminId);


        $adminAccId = (int)$adminAcc['id'];


        $adminName = $adminAcc['name_ar'];





        $db->beginTransaction();


        try {


            $journalLines = [];


            $effectivePayAccountId = $cashboxId;





            if ($paymentMode === 'admin_funding') {


                // Compound 4-line Journal Entry:


                // Step 1: Debit Cashbox [1101], Credit Admin Personal Account (Funding)


                // Step 2: Debit Expense Account, Credit Cashbox [1101] (Disbursement)


                $journalLines = [


                    [


                        'account_id' => $cashboxId,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => "تغذية الصندوق الرئيسي من $adminName لصالح صرف ($title)"


                    ],


                    [


                        'account_id' => $adminAccId,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "تمويل نفقات من $adminName لصالح الصندوق الرئيسي"


                    ],


                    [


                        'account_id' => $expAcc,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => $desc


                    ],


                    [


                        'account_id' => $cashboxId,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "صرف السند نقداً من الصندوق الرئيسي ($typeLabel)"


                    ]


                ];


                $effectivePayAccountId = $cashboxId;


            } elseif ($paymentMode === 'cashbox_direct') {


                // Direct disbursement from cashbox


                $journalLines = [


                    [


                        'account_id' => $expAcc,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => $desc


                    ],


                    [


                        'account_id' => $cashboxId,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "صرف مباشر من الصندوق الرئيسي [1101]"


                    ]


                ];


                $effectivePayAccountId = $cashboxId;


            } else {


                // Custom financial account


                if ($payAcc < 1) throw new Exception('يرجى تحديد الحساب المالي المخصوم منه');


                $journalLines = [


                    [


                        'account_id' => $expAcc,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => $desc


                    ],


                    [


                        'account_id' => $payAcc,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "صرف من الحساب المالي المحدد"


                    ]


                ];


                $effectivePayAccountId = $payAcc;


            }





            // 1. Create Double-Entry Journal Entry


            $j = $service->createJournalEntry([


                'entry_date' => $date,


                'source_module' => 'payment',


                'reference_no' => $no,


                'description' => $desc . ($paymentMode === 'admin_funding' ? " (تمويل من $adminName وتغذية الصندوق)" : ""),


                'lines' => $journalLines


            ], $adminId);





            // 2. Insert into um_recurring_expense_payments for history tracking


            $ins = $db->prepare("INSERT INTO um_recurring_expense_payments(network_id,payment_no, recurring_expense_id, expense_type, title_snapshot, period_start, period_end, payment_date, amount, currency_code, exchange_rate, currency_amount, payment_account_id, expense_account_id, cost_center_id, journal_entry_id, reference_no, notes, created_by) VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)");
            $ins->execute([
                $networkId,
                $no,
                ($expenseType === 'general' ? 'fuel' : $expenseType),
                $title . ($beneficiary ? " ($beneficiary)" : ""),
                $date,
                $date,
                $date,
                $amount,
                $currencyCode,
                $exchangeRate,
                $currencyAmount,
                $effectivePayAccountId,
                $expAcc,
                $j['entry_id'],
                $refNo ?: null,
                $notes ?: ($paymentMode === 'admin_funding' ? "تم التمويل من $adminName وتغذية الصندوق ثم الصرف" : null),
                $adminId
            ]);





            // 3. Also record in um_financial_vouchers so it displays in General Vouchers


            try {


                $db->prepare("INSERT INTO um_vouchers_financial(network_id,voucher_no,voucher_type,source_account_id,destination_account_id,party_name,category,amount,payment_method,notes,reference_id,created_by,created_at) VALUES(?,?,'payment',?,?,?,?,?,'cash',?,?,?,NOW())")
                   ->execute([$networkId,$no,$effectivePayAccountId,$expAcc,$beneficiary ?: $title,$typeLabel,$amount,$notes ?: ($desc . ($paymentMode === 'admin_funding' ? " [تمويل المشرف وتغذية الصندوق]" : "")),$no,$adminId]);


            } catch (Throwable $ve) {}





            $db->commit();


            return [


                'success' => true,


                'payment_no' => $no,


                'journal_entry_no' => $j['entry_no'],


                'message' => 'تم تمويل الصندوق من حسابك وصرف السند وترحيل القيد المحاسبي المزدوج بنجاح'


            ];


        } catch (Throwable $e) {


            if ($db->inTransaction()) $db->rollBack();


            throw $e;


        }


    }





    public static function deactivate(PDO $db, int $id): array


    {


        self::migrate($db);

        $networkId=self::activeNetworkId($db);

        $networkId=self::activeNetworkId($db);


        $st=$db->prepare("UPDATE um_recurring_expenses SET is_active=0 WHERE network_id=? AND id=?");$st->execute([$networkId,$id]);
        if($st->rowCount()!==1)throw new Exception('الالتزام غير موجود في الشبكة النشطة');


        return ['success' => true, 'message' => 'تم إيقاف الالتزام مع الاحتفاظ بسجل دفعاته'];


    }





    public static function payments(PDO $db, int $id = 0): array


    {


        self::migrate($db);

        $networkId=self::activeNetworkId($db);


        $w = 'WHERE p.network_id='.(int)$networkId.($id ? ' AND p.recurring_expense_id=' . (int)$id : '');


        return [


            'success' => true,


            'payments' => $db->query("SELECT p.*,j.entry_no,pa.name_ar payment_account_name, ea.name_ar expense_account_name FROM um_recurring_expense_payments p LEFT JOIN um_journal_entries j ON j.network_id=p.network_id AND j.id=p.journal_entry_id LEFT JOIN um_chart_of_accounts pa ON pa.network_id=p.network_id AND pa.id=p.payment_account_id LEFT JOIN um_chart_of_accounts ea ON ea.network_id=p.network_id AND ea.id=p.expense_account_id $w ORDER BY p.payment_date DESC,p.id DESC LIMIT 300")->fetchAll(PDO::FETCH_ASSOC)


        ];


    }





    public static function pay(PDO $db, $service, array $d, int $adminId): array


    {


        self::migrate($db);

        $networkId=self::activeNetworkId($db);


        $id = (int)($d['id'] ?? 0);


        $st = $db->prepare("SELECT * FROM um_recurring_expenses WHERE network_id=? AND id=? AND is_active=1 FOR UPDATE");


        $db->beginTransaction();


        try {


            $st->execute([$networkId,$id]);


            $r = $st->fetch(PDO::FETCH_ASSOC);


            if (!$r) throw new Exception('الالتزام غير موجود');





            $currencyCode = strtoupper(trim((string)($d['currency_code'] ?? ($r['currency_code'] ?? 'YER_SANAA'))));
            $exchangeRate = (float)($d['exchange_rate'] ?? ($r['exchange_rate'] ?? 1.0));
            if ($exchangeRate <= 0) $exchangeRate = 1.0;
            $currencyAmount = (float)($d['currency_amount'] ?? ($d['amount'] ?? ($r['currency_amount'] ?? $r['amount'])));
            $amount = ($currencyCode !== 'YER_SANAA' && $currencyCode !== 'YER' && $exchangeRate > 0) ? round($currencyAmount * $exchangeRate, 2) : $currencyAmount;


            $payAcc = (int)($d['payment_account_id'] ?? $r['payment_account_id']);


            $expAcc = (int)($d['expense_account_id'] ?? $r['expense_account_id']);


            $from = $d['period_start'] ?? $r['next_due_date'];


            $to = $d['period_end'] ?? ($r['billing_cycle'] === 'monthly' ? date('Y-m-d', strtotime($from . ' +1 month -1 day')) : date('Y-m-d', strtotime($from . ' +' . max(1, (int)$r['custom_period_days']) . ' days -1 day')));


            $date = $d['payment_date'] ?? date('Y-m-d');


            $paymentMode = $d['payment_mode'] ?? 'admin_funding'; // admin_funding | cashbox_direct | custom_account





            if ($amount <= 0) throw new Exception('المبلغ مطلوب');





            $labels = ['internet' => 'اشتراك إنترنت', 'rent' => 'إيجار موقع/برج'];


            $no = 'RXP-' . date('YmdHis') . '-' . random_int(10, 99);


            $desc = 'سداد تجديد دورة ' . ($labels[$r['expense_type']] ?? 'التزام دوري') . ' - ' . $r['title'] . ' للفترة ' . $from . ' إلى ' . $to;





            // Find main cashbox account [1101]


            $stCash=$db->prepare("SELECT id,account_code,name_ar FROM um_chart_of_accounts WHERE network_id=? AND (account_code='1101' OR name_ar LIKE '%الصندوق الرئيسي%') ORDER BY CASE WHEN account_code='1101' THEN 0 ELSE 1 END LIMIT 1");$stCash->execute([$networkId]);$cashbox=$stCash->fetch(PDO::FETCH_ASSOC);


            if (!$cashbox) throw new Exception('حساب الصندوق الرئيسي [1101] غير معرف في شجرة الحسابات');


            $cashboxId = (int)$cashbox['id'];





            // Get or create current admin's personal account


            $adminAcc = self::getOrCreateAdminAccount($db, $adminId);


            $adminAccId = (int)$adminAcc['id'];


            $adminName = $adminAcc['name_ar'];





            $journalLines = [];


            $effectivePayAccountId = $cashboxId;





            if ($paymentMode === 'admin_funding') {


                // Compound 4-line Journal Entry


                $journalLines = [


                    [


                        'account_id' => $cashboxId,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => "تغذية الصندوق الرئيسي من $adminName لسداد {$r['title']}"


                    ],


                    [


                        'account_id' => $adminAccId,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "تمويل التزام دوري من $adminName لصالح الصندوق الرئيسي"


                    ],


                    [


                        'account_id' => $expAcc,


                        'debit' => $amount,


                        'credit' => 0,


                        'cost_center_id' => null,


                        'line_description' => $desc


                    ],


                    [


                        'account_id' => $cashboxId,


                        'debit' => 0,


                        'credit' => $amount,


                        'cost_center_id' => null,


                        'line_description' => "سداد التزام دوري من الصندوق الرئيسي"


                    ]


                ];


                $effectivePayAccountId = $cashboxId;


            } elseif ($paymentMode === 'cashbox_direct') {


                $journalLines = [


                    ['account_id' => $expAcc, 'debit' => $amount, 'credit' => 0, 'cost_center_id' => null, 'line_description' => $desc],


                    ['account_id' => $cashboxId, 'debit' => 0, 'credit' => $amount, 'cost_center_id' => null, 'line_description' => 'سداد التزام دوري من الصندوق الرئيسي']


                ];


                $effectivePayAccountId = $cashboxId;


            } else {


                if ($payAcc < 1) throw new Exception('يرجى تحديد حساب الصرف');


                $journalLines = [


                    ['account_id' => $expAcc, 'debit' => $amount, 'credit' => 0, 'cost_center_id' => null, 'line_description' => $desc],


                    ['account_id' => $payAcc, 'debit' => 0, 'credit' => $amount, 'cost_center_id' => null, 'line_description' => 'سداد التزام دوري من الحساب المالي المحدد']


                ];


                $effectivePayAccountId = $payAcc;


            }





            $j = $service->createJournalEntry([


                'entry_date' => $date,


                'source_module' => 'payment',


                'reference_no' => $no,


                'description' => $desc . ($paymentMode === 'admin_funding' ? " (تمويل من $adminName وتغذية الصندوق)" : ""),


                'lines' => $journalLines


            ], $adminId);





            $ins = $db->prepare("INSERT INTO um_recurring_expense_payments(network_id,payment_no, recurring_expense_id, expense_type, title_snapshot, period_start, period_end, payment_date, amount, currency_code, exchange_rate, currency_amount, payment_account_id, expense_account_id, cost_center_id, journal_entry_id, reference_no, notes, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)");
            $ins->execute([
                $networkId,
                $no,
                $id,
                $r['expense_type'],
                $r['title'],
                $from,
                $to,
                $date,
                $amount,
                $currencyCode,
                $exchangeRate,
                $currencyAmount,
                $effectivePayAccountId,
                $expAcc,
                $j['entry_id'],
                trim((string)($d['reference_no'] ?? '')) ?: null,
                trim((string)($d['notes'] ?? '')) ?: null,
                $adminId
            ]);





            $next = !empty($to) ? date('Y-m-d', strtotime($to . ' +1 day')) : ($r['billing_cycle'] === 'monthly' ? date('Y-m-d', strtotime($from . ' +1 month')) : date('Y-m-d', strtotime($from . ' +' . max(1, (int)$r['custom_period_days']) . ' days')));
            $updateBaseSql = "";
            $updateParams = [$next, $effectivePayAccountId];
            if (!empty($d['update_base_amount'])) {
                $updateBaseSql = ", amount=?, currency_amount=?, currency_code=?, exchange_rate=?";
                $updateParams[] = $amount;
                $updateParams[] = $currencyAmount;
                $updateParams[] = $currencyCode;
                $updateParams[] = $exchangeRate;
            }
            $updateParams[] = $networkId;
            $updateParams[] = $id;
            $db->prepare("UPDATE um_recurring_expenses SET next_due_date=?,payment_account_id=? $updateBaseSql WHERE network_id=? AND id=?")->execute($updateParams);





            $db->commit();


            return ['success' => true, 'payment_no' => $no, 'journal_entry_no' => $j['entry_no'], 'message' => 'تم تجديد الاشتراك وترحيل القيد المحاسبي بنجاح'];


        } catch (Throwable $e) {


            if ($db->inTransaction()) $db->rollBack();


            throw $e;


        }


    }


}


