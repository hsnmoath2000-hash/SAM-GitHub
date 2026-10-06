<?php

final class InstantBalanceService
{
    private PDO $db;
    private RadiusService $radius;

    private static bool $schemaEnsured = false;

    public function __construct(PDO $db, RadiusService $radius)
    {
        $this->db = $db;
        $this->radius = $radius;
        if (!self::$schemaEnsured) {
            $this->ensureSchema();
            self::$schemaEnsured = true;
        }
    }

    private function ensureSchema(): void
    {
        try {
            $this->db->exec("ALTER TABLE um_journal_entries MODIFY source_module VARCHAR(64) NOT NULL DEFAULT 'manual'");
        } catch (Throwable $e) {}
    }

    private function context(): array
    {
        $id = (int)($_SESSION['admin_id'] ?? 0);
        $role = (string)($_SESSION['role'] ?? $_SESSION['admin_role'] ?? '');
        if ($id <= 0 || $role === '') {
            throw new RuntimeException('انتهت جلسة الدخول');
        }
        return ['id' => $id, 'role' => $role, 'network_id' => $this->networkId()];
    }

    private function networkId(): int
    {
        $adminId = (int)($_SESSION['admin_id'] ?? 0);
        $networkId = (int)($_SESSION['active_network_id'] ?? $_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? 0);
        if ($adminId <= 0 || $networkId <= 0) throw new RuntimeException('لم يتم تحديد شبكة نشطة');
        $q = $this->db->prepare("SELECT 1 FROM um_admin_network_access WHERE admin_id=? AND network_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1");
        $q->execute([$adminId,$networkId]);
        if (!$q->fetchColumn()) throw new RuntimeException('غير مصرح بالوصول إلى الشبكة المطلوبة');
        $this->db->exec('SET @sam_active_network_id=' . $networkId);
        return $networkId;
    }

    private function normalizePhone(string $phone, bool $required = false): string
    {
        $phone = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($phone, '967')) {
            $phone = substr($phone, 3);
        }
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            $phone = substr($phone, 1);
        }
        if ($phone === '' && !$required) return '';
        if (!preg_match('/^(77|78|70|71|73)\d{7}$/', $phone)) {
            throw new InvalidArgumentException('رقم الهاتف اليمني يجب أن يتكون من 9 أرقام ويبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)');
        }
        return $phone;
    }

    private function account(int $id): array
    {
        $networkId = $this->networkId();
        $q = $this->db->prepare("SELECT a.id,a.username,a.fullname,a.phone,COALESCE(nr.role_key,a.role) role,a.parent_id,a.account_id,a.credit_limit,COALESCE(nb.balance,0) balance,a.is_active FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1 LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=nx.network_id WHERE a.id=?");
        $q->execute([$networkId,$id]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if (!$row || !(int)$row['is_active']) throw new RuntimeException('الحساب غير موجود أو غير نشط');
        return $row;
    }

    private function assertCanSupply(array $ctx, array $target): void
    {
        if ((int)$ctx['id'] === (int)$target['id']) throw new RuntimeException('لا يمكن تحويل الرصيد إلى الحساب نفسه');
        if (in_array($ctx['role'], ['system_owner', 'superadmin'], true)) return;
        if ((int)$target['parent_id'] !== (int)$ctx['id']) {
            throw new RuntimeException('يمكن تحويل الرصيد فقط إلى حساب تابع مباشرة لك');
        }
        $allowed = ['admin' => ['distributor'], 'distributor' => ['pos_agent','agent'], 'agent' => ['pos_agent']];
        if (!in_array($target['role'], $allowed[$ctx['role']] ?? [], true)) {
            throw new RuntimeException('رتبة المستلم غير مسموحة لهذا التحويل');
        }
    }

    private function available(int $ownerId): float
    {
        $networkId = $this->networkId();
        $this->db->prepare("UPDATE um_instant_balance_lots SET status='expired' WHERE network_id=? AND owner_admin_id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<=NOW()")
            ->execute([$networkId,$ownerId]);
        $q = $this->db->prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW())");
        $q->execute([$networkId,$ownerId]);
        return round((float)$q->fetchColumn(), 2);
    }

    private function consumeLots(int $ownerId, float $amount, string $eventType, string $referenceNo): array
    {
        $networkId = $this->networkId();
        $remaining = round($amount, 2);
        $used = [];
        $q = $this->db->prepare("SELECT id,remaining_amount,remaining_cost,expires_at FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY COALESCE(expires_at,'9999-12-31'),id FOR UPDATE");
        $q->execute([$networkId,$ownerId]);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $lot) {
            if ($remaining <= 0.0001) break;
            $take = min($remaining, (float)$lot['remaining_amount']);
            $cost = (float)$lot['remaining_amount'] > 0 ? round(((float)$lot['remaining_cost'] * $take) / (float)$lot['remaining_amount'], 2) : 0;
            $u = $this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount=remaining_amount-?,remaining_cost=GREATEST(0,remaining_cost-?),status=IF(remaining_amount-?<=0.0001,'depleted','active') WHERE network_id=? AND id=?");
            $u->execute([$take,$cost,$take,$networkId,$lot['id']]);
            $used[] = ['lot_id'=>(int)$lot['id'],'amount'=>$take,'cost'=>$cost,'expires_at'=>$lot['expires_at']];
            $remaining = round($remaining - $take, 2);
        }
        if ($remaining > 0.0001) throw new RuntimeException('الرصيد الفوري الصالح غير كافٍ');
        $log = $this->db->prepare("INSERT INTO um_instant_balance_consumptions(network_id,lot_id,owner_admin_id,event_type,reference_no,amount,cost_amount) VALUES(?,?,?,?,?,?,?)");
        foreach ($used as $part) $log->execute([$networkId,$part['lot_id'],$ownerId,$eventType,$referenceNo,$part['amount'],$part['cost']]);
        return $used;
    }

    private function nextNo(string $prefix): string
    {
        return $prefix . '-' . date('YmdHis') . '-' . random_int(100,999);
    }

    private function resolveAccount(string $code, ?int $linkedAdmin = null): int
    {
        $networkId = $this->networkId();
        if ($linkedAdmin) {
            $q = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND is_active=1 ORDER BY id LIMIT 1');
            $q->execute([$networkId,$linkedAdmin]);
            if ($id = (int)$q->fetchColumn()) return $id;
        }
        $q = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=? AND is_active=1 LIMIT 1');
        $q->execute([$networkId,$code]);
        $id = (int)$q->fetchColumn();
        if (!$id) throw new RuntimeException("الحساب المحاسبي $code غير موجود");
        return $id;
    }

    private function resolveCashAccount(int $sellerId): int
    {
        $networkId = $this->networkId();
        if ($sellerId <= 0) return $this->resolveAccount('1101');

        $pq = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code='1104' LIMIT 1");
        $pq->execute([$networkId]);
        $parentBoxId = (int)$pq->fetchColumn();
        if (!$parentBoxId) throw new RuntimeException('حساب صناديق المستخدمين غير موجود في الشبكة النشطة');
        $q = $this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND parent_id=? AND is_active=1 ORDER BY id LIMIT 1');
        $q->execute([$networkId,$sellerId,$parentBoxId]);
        $accId = (int)$q->fetchColumn();
        if ($accId > 0) return $accId;

        // Auto-provision dedicated cash box account under 1104 if admin exists
        $adminStmt = $this->db->prepare("SELECT id, username, fullname, role FROM um_admins WHERE id=?");
        $adminStmt->execute([$sellerId]);
        $admin = $adminStmt->fetch(PDO::FETCH_ASSOC);
        if ($admin) {
            $countQ = $this->db->prepare('SELECT COUNT(*) FROM um_chart_of_accounts WHERE network_id=? AND parent_id=?');
            $countQ->execute([$networkId,$parentBoxId]);
            $count = (int)$countQ->fetchColumn();
            $nextCode = '1104' . str_pad($count + 1, 2, '0', STR_PAD_LEFT);
            $chk = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=?");
            $chk->execute([$networkId,$nextCode]);
            if ($chk->fetchColumn()) {
                $nextCode = '1104' . str_pad($sellerId, 3, '0', STR_PAD_LEFT);
            }
            $boxName = 'صندوق: ' . ($admin['fullname'] ?: $admin['username']);
            $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code, name_ar, name_en, account_type, parent_id, linked_admin_id,owner_admin_id, level, is_system, is_active, balance) VALUES (?, ?, ?, ?, 'asset', ?, ?, ?, 3, 0, 1, 0.00)");
            $ins->execute([$networkId,$nextCode, $boxName, 'Cashbox: ' . $admin['username'], $parentBoxId, $sellerId,$sellerId]);
            return (int)$this->db->lastInsertId();
        }

        return $this->resolveAccount('1101');
    }

    private function recordFinancialInvoice(int $invoiceId, string $invoiceNo, int $sellerId, ?array $buyer, string $buyerName, float $net, float $paid, float $remaining, string $paymentType, string $category): void
    {
        $networkId = $this->networkId();
        if ($buyer && $remaining > 0) {
            $limit = (float)$buyer['credit_limit'];
            $debt = (float)$buyer['balance'];
            if ($limit > 0 && $debt + $remaining > $limit + 0.001) throw new RuntimeException('العملية تتجاوز سقف الائتمان للمشتري');
            $this->db->prepare('UPDATE um_admin_network_balances SET balance=balance+? WHERE network_id=? AND admin_id=?')->execute([$remaining,$networkId,$buyer['id']]);
        } elseif (!$buyer && $remaining > 0) {
            throw new RuntimeException('البيع الآجل أو الجزئي يتطلب اختيار حساب مشتري');
        }
        $accountId = $buyer ? (int)$buyer['id'] : $sellerId;
        $tx = $this->nextNo('TX');
        $this->db->prepare("INSERT INTO um_financial_transactions(network_id,tx_no,account_id,tx_type,reference_id,debit,credit,cashbox_impact,payment_method,description,created_by) VALUES(?,?,?,'sale_invoice',?,?,0,0,?,?,?)")
            ->execute([$networkId,$tx,$accountId,$invoiceNo,$net,$paymentType,"فاتورة $category رقم $invoiceNo",$sellerId]);
        if ($paid > 0) {
            $voucherNo = $this->nextNo('RV');
            $this->db->prepare("INSERT INTO um_vouchers_financial(network_id,voucher_no,voucher_type,party_id,party_name,amount,payment_method,category,invoice_id,reference_id,notes,created_by,created_at) VALUES(?,?,'receipt',?,?,?,?,?,?,?, ?,?,NOW())")
                ->execute([$networkId,$voucherNo,$buyer['id'] ?? null,$buyerName,$paid,'cash',$category,$invoiceId,$invoiceNo,"سداد فاتورة $invoiceNo",$sellerId]);
            $this->db->prepare("INSERT INTO um_financial_transactions(network_id,tx_no,account_id,tx_type,reference_id,debit,credit,cashbox_impact,payment_method,description,created_by) VALUES(?,?,?,'receipt_voucher',?,0,?,?, 'cash',?,?)")
                ->execute([$networkId,$this->nextNo('TX'),$accountId,$invoiceNo,$paid,$paid,"قبض فاتورة $invoiceNo",$sellerId]);
        }
    }

    private function postSaleJournal(int $sellerId, ?array $buyer, string $invoiceNo, float $net, float $paid, float $remaining, float $cost = 0): void
    {
        if ($net <= 0 && $paid <= 0 && $remaining <= 0 && $cost <= 0) {
            return; // Free promotional voucher - no accounting impact
        }
        $lines = [];
        if ($paid > 0) $lines[] = ['account_id'=>$this->resolveCashAccount($sellerId),'debit'=>$paid,'credit'=>0,'line_description'=>"تحصيل $invoiceNo"];
        if ($remaining > 0) $lines[] = ['account_id'=>$this->resolveAccount('1301',$buyer['id'] ?? null),'debit'=>$remaining,'credit'=>0,'line_description'=>"ذمة $invoiceNo"];
        $lines[] = ['account_id'=>$this->resolveAccount('4103'),'debit'=>0,'credit'=>$net,'line_description'=>"إيراد رصيد فوري $invoiceNo"];
        if ($cost > 0) {
            $lines[] = ['account_id'=>$this->resolveAccount('5101'),'debit'=>$cost,'credit'=>0,'line_description'=>"تكلفة $invoiceNo"];
            $lines[] = ['account_id'=>$this->resolveAccount('1204'),'debit'=>0,'credit'=>$cost,'line_description'=>"استهلاك مخزون رصيد فوري $invoiceNo"];
        }
        $this->radius->createJournalEntry(['entry_date'=>date('Y-m-d'),'source_module'=>'instant_balance','reference_no'=>$invoiceNo,'description'=>"قيد تلقائي لفاتورة الرصيد $invoiceNo",'lines'=>$lines],$sellerId);
    }

    public function summary(?int $adminId = null): array
    {
        $ctx = $this->context();
        $id = $adminId ?: $ctx['id'];
        if ($id !== $ctx['id'] && !in_array($ctx['role'], ['system_owner', 'superadmin'], true)) {
            $target = $this->account($id); $this->assertCanSupply($ctx,$target);
        }
        $lots = $this->db->prepare("SELECT id,original_amount,remaining_amount,expires_at,status,created_at FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? ORDER BY id DESC LIMIT 100");
        $lots->execute([$ctx['network_id'],$id]);
        return ['success'=>true,'admin_id'=>$id,'available'=>$this->available($id),'lots'=>$lots->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function warehouses(): array
    {
        $ctx = $this->context();
        $where = 'a.is_active=1 AND nx.network_id=? AND nx.is_active=1'; $params=[$ctx['network_id']];
        if (!in_array($ctx['role'], ['system_owner', 'superadmin'], true)) {
            $where .= ' AND (a.id=? OR a.parent_id=?)'; $params=[$ctx['id'],$ctx['id']];
            array_unshift($params,$ctx['network_id']);
        }
        $q = $this->db->prepare("SELECT a.id,a.fullname,a.username,COALESCE(nr.role_key,a.role) role,COALESCE(SUM(CASE WHEN l.status='active' AND l.remaining_amount>0 AND (l.expires_at IS NULL OR l.expires_at>NOW()) THEN l.remaining_amount ELSE 0 END),0) instant_balance,MIN(CASE WHEN l.status='active' AND l.remaining_amount>0 AND l.expires_at>NOW() THEN l.expires_at END) nearest_expiry FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1 LEFT JOIN um_instant_balance_lots l ON l.owner_admin_id=a.id AND l.network_id=nx.network_id WHERE $where GROUP BY a.id,nr.role_key ORDER BY a.id");
        $q->execute($params);
        return ['success'=>true,'warehouses'=>$q->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function grant(array $data): array
    {
        $this->radius->enforcePermission('instant_balance_initial_grant', 'منح رصيد فوري أولي');
        $ctx=$this->context(); if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true)) throw new RuntimeException('المنح الأولي مخصص للمسؤول الأعلى');
        $target=$this->account((int)($data['receiver_admin_id'] ?? ($data['target_admin_id'] ?? ($data['admin_id'] ?? 0)))); $amount=round((float)($data['amount']??0),2);
        $isMainWarehouse = in_array($target['role'], ['system_owner', 'superadmin'], true) && (int)$target['id'] === (int)$ctx['id'];
        if (!$isMainWarehouse) {
            throw new RuntimeException('المنح الأولي مخصص لمخزن المدير العام فقط؛ استخدم التحويل لتوزيعه');
        }
        $expiry=trim((string)($data['expires_at']??'')); if($amount<=0) throw new InvalidArgumentException('المبلغ غير صحيح');
        if($expiry!=='' && strtotime($expiry)<=time()) throw new InvalidArgumentException('تاريخ انتهاء الرصيد يجب أن يكون مستقبلًا');
        $this->db->beginTransaction();
        try {
            $cost=round(max(0,(float)($data['cost_amount']??$amount)),2);
            $this->db->prepare('INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,original_amount,original_cost,remaining_amount,remaining_cost,expires_at,granted_by_admin_id) VALUES(?,?,?,?,?,?,?,?)')->execute([$ctx['network_id'],$target['id'],$amount,$cost,$amount,$cost,$expiry?:null,$ctx['id']]);
            $no=$this->nextNo('IBG');
            $this->db->prepare("INSERT INTO um_instant_balance_transfers(network_id,transfer_no,sender_admin_id,receiver_admin_id,amount,expires_at,notes) VALUES(?,?,?,?,?,?,?)")->execute([$ctx['network_id'],$no,$ctx['id'],$target['id'],$amount,$expiry?:null,'منح أولي من الإدارة']);
            $this->db->commit();
            try {
                $this->radius->getNotificationService()->notifyInstantBalanceTransfer([
                    'transfer_no' => $no,
                    'sender_admin_id' => $ctx['id'],
                    'receiver_admin_id' => $target['id'],
                    'amount' => $amount,
                    'available' => $this->available($target['id']),
                    'expires_at' => $expiry ?: null,
                    'notes' => 'منح أولي من الإدارة'
                ], $ctx['id']);
            } catch (\Throwable $e) {}
            return ['success'=>true,'transfer_no'=>$no,'available'=>$this->available($target['id'])];
        } catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    public function transfer(array $data): array
    {
        $this->radius->enforcePermission('instant_balance_transfer', 'تحويل الرصيد الفوري');
        $ctx=$this->context(); $target=$this->account((int)($data['receiver_admin_id'] ?? ($data['target_admin_id'] ?? ($data['admin_id'] ?? 0)))); $this->assertCanSupply($ctx,$target);
        $amount=round((float)($data['amount']??0),2); if($amount<=0)throw new InvalidArgumentException('المبلغ غير صحيح'); $no=$this->nextNo('IBT');
        $this->db->beginTransaction();
        try {
            $parts=$this->consumeLots($ctx['id'],$amount,'transfer',$no);
            foreach($parts as $part)$this->db->prepare('INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,source_lot_id,original_amount,original_cost,remaining_amount,remaining_cost,expires_at,granted_by_admin_id) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$ctx['network_id'],$target['id'],$part['lot_id'],$part['amount'],$part['cost'],$part['amount'],$part['cost'],$part['expires_at'],$ctx['id']]);
            $nearest=null; foreach($parts as $p)if($p['expires_at']&&(!$nearest||$p['expires_at']<$nearest))$nearest=$p['expires_at'];
            $this->db->prepare("INSERT INTO um_instant_balance_transfers(network_id,transfer_no,sender_admin_id,receiver_admin_id,amount,expires_at,notes) VALUES(?,?,?,?,?,?,?)")->execute([$ctx['network_id'],$no,$ctx['id'],$target['id'],$amount,$nearest,trim((string)($data['notes']??''))]);
            $desc="تحويل رصيد فوري $no من {$ctx['id']} إلى {$target['fullname']}";
            $this->db->prepare("INSERT INTO um_financial_transactions(network_id,tx_no,account_id,tx_type,reference_id,debit,credit,cashbox_impact,payment_method,description,created_by) VALUES(?,?,?,'transfer',?,0,0,0,'balance',?,?)")
                ->execute([$ctx['network_id'],$this->nextNo('TX'),$target['id'],$no,$desc,$ctx['id']]);
            $this->db->commit();
            try {
                $this->radius->getNotificationService()->notifyInstantBalanceTransfer([
                    'transfer_no' => $no,
                    'sender_admin_id' => $ctx['id'],
                    'receiver_admin_id' => $target['id'],
                    'amount' => $amount,
                    'available' => $this->available($target['id']),
                    'expires_at' => $nearest,
                    'notes' => trim((string)($data['notes']??''))
                ], $ctx['id']);
            } catch (\Throwable $e) {}
            return ['success'=>true,'transfer_no'=>$no,'available'=>$this->available($ctx['id'])];
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    public function transfers(array $filters = []): array
    {
        $ctx = $this->context();
        $where = ['t.network_id=?']; $params = [$ctx['network_id']];
        if (!in_array($ctx['role'], ['system_owner', 'superadmin'], true)) {
            $where[] = '(t.sender_admin_id=? OR t.receiver_admin_id=?)';
            $params[] = $ctx['id']; $params[] = $ctx['id'];
        }
        $q = $this->db->prepare("SELECT t.*,s.fullname sender_name,s.role sender_role,r.fullname receiver_name,r.role receiver_role FROM um_instant_balance_transfers t LEFT JOIN um_admins s ON s.id=t.sender_admin_id LEFT JOIN um_admins r ON r.id=t.receiver_admin_id WHERE ".implode(' AND ',$where)." ORDER BY t.id DESC LIMIT 500");
        $q->execute($params);
        return ['success'=>true,'data'=>$q->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function sellBalance(array $data): array
    {
        $this->radius->enforcePermission('instant_balance_sell', 'بيع رصيد الشحن الفوري');
        $ctx=$this->context(); $amount=round((float)($data['amount']??0),2); $discount=round(max(0,(float)($data['discount_amount']??0)),2); $net=max(0,$amount-$discount);
        if($amount<=0||$discount>$amount)throw new InvalidArgumentException('قيمة البيع أو الخصم غير صحيحة');
        $capQ=$this->db->prepare('SELECT discount_rate FROM um_admins WHERE id=?');$capQ->execute([$ctx['id']]);
        $discountRate=in_array($ctx['role'], ['system_owner', 'superadmin'], true)?100:max(0,(float)$capQ->fetchColumn());
        $maxDiscount=round($amount*$discountRate/100,2);
        if($discount>$maxDiscount+0.001)throw new RuntimeException("الخصم يتجاوز سقف صلاحيتك ($discountRate%)");
        $buyer=null; if(!empty($data['buyer_admin_id'])){$buyer=$this->account((int)$data['buyer_admin_id']);$this->assertCanSupply($ctx,$buyer);}
        $phone=$this->normalizePhone((string)($data['buyer_phone']??($buyer['phone']??'')),false); $name=trim((string)($data['buyer_name']??($buyer['fullname']??'عميل نقدي')));
        if(!empty($data['save_customer'])&&$phone!=='')$this->db->prepare("INSERT INTO um_instant_balance_customers(network_id,phone,name,is_recurring,created_by) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE name=VALUES(name),is_recurring=1")->execute([$ctx['network_id'],$phone,$name,$ctx['id']]);
        $payment=in_array(($data['payment_type']??'cash'),['cash','credit','partial'],true)?$data['payment_type']:'cash';
        $paid=$payment==='cash'?$net:($payment==='credit'?0:min($net,max(0,array_key_exists('paid_amount',$data)?(float)$data['paid_amount']:$net/2)));
        $remaining=$net-$paid;$no=$this->nextNo('INV-IB');
        $this->db->beginTransaction();
        try {
            $parts=$this->consumeLots($ctx['id'],$amount,'sale',$no);
            $costAmount=round(array_sum(array_column($parts,'cost')),2);
            $ins=$this->db->prepare("INSERT INTO um_sales_invoices(network_id,invoice_no,sale_kind,seller_id,buyer_id,buyer_phone,buyer_name,batch_id,profile_name,quantity,unit_price,discount_amount,total_amount,cost_amount,profit_amount,paid_amount,remaining_amount,payment_type,notes) VALUES(?,?,'instant_balance',?,?,?,?,NULL,'رصيد شحن فوري',1,?,?,?,?,?,?,?,?,?)");
            $ins->execute([$ctx['network_id'],$no,$ctx['id'],$buyer['id']??null,$phone?:null,$name,$amount,$discount,$net,$costAmount,$net-$costAmount,$paid,$remaining,$payment,trim((string)($data['notes']??''))]);
            $invoiceId=(int)$this->db->lastInsertId();
            $this->db->prepare("INSERT INTO um_sales_invoice_items(network_id,invoice_id,item_type,profile_name,batch_id,sheets_count,sheet_numbers,cards_count,unit_price,gross_amount,discount_amount,net_amount,cost_amount,profit_amount) VALUES(?,?,'instant_balance','رصيد شحن فوري',NULL,0,NULL,0,?,?,?,?,?,?)")->execute([$ctx['network_id'],$invoiceId,$amount,$amount,$discount,$net,$costAmount,$net-$costAmount]);
            if($buyer){foreach($parts as $part){$buyerCost=$amount>0?round($net*((float)$part['amount']/$amount),2):0;$this->db->prepare('INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,source_lot_id,original_amount,original_cost,remaining_amount,remaining_cost,expires_at,granted_by_admin_id,is_sold,invoice_id) VALUES(?,?,?,?,?,?,?,?,?,1,?)')->execute([$ctx['network_id'],$buyer['id'],$part['lot_id'],$part['amount'],$buyerCost,$part['amount'],$buyerCost,$part['expires_at'],$ctx['id'],$invoiceId]);}}
            $this->recordFinancialInvoice($invoiceId,$no,$ctx['id'],$buyer,$name,$net,$paid,$remaining,$payment,'مبيعات رصيد فوري');
            $this->postSaleJournal($ctx['id'],$buyer,$no,$net,$paid,$remaining,$costAmount);
            $this->db->commit();
            try {
                $this->radius->getNotificationService()->notifyInstantBalanceSale($invoiceId, $ctx['id']);
            } catch (\Throwable $e) {}
            return ['success'=>true,'invoice_id'=>$invoiceId,'invoice_no'=>$no,'available'=>$this->available($ctx['id'])];
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    public function issueVoucher(array $data): array
    {
        $this->radius->enforcePermission('instant_balance_issue_voucher', 'إصدار كرت مدفوع من الرصيد');
        $ctx = $this->context();
        $buyer = !empty($data['buyer_admin_id']) ? $this->account((int)$data['buyer_admin_id']) : null;
        if ($buyer) $this->assertCanSupply($ctx, $buyer);
        $phone = $this->normalizePhone((string)($data['phone'] ?? ($data['buyer_phone'] ?? ($buyer['phone'] ?? ''))), true);
        $name = trim((string)($data['buyer_name'] ?? ($buyer['fullname'] ?? 'عميل نقدي')));
        
        $profileId = (int)($data['profile_id'] ?? 0);
        $profileName = trim((string)($data['profile_name'] ?? ''));

        if ($profileId > 0) {
            $q = $this->db->prepare('SELECT id, name, name_for_users, package_type, validity, cost_price, retail_price, price FROM um_profiles_def WHERE network_id=? AND id = ? LIMIT 1');
            $q->execute([$ctx['network_id'],$profileId]);
        } else {
            $q = $this->db->prepare('SELECT id, name, name_for_users, package_type, validity, cost_price, retail_price, price FROM um_profiles_def WHERE network_id=? AND (name = ? OR name_for_users = ?) LIMIT 1');
            $q->execute([$ctx['network_id'],$profileName, $profileName]);
        }
        $profile = $q->fetch(PDO::FETCH_ASSOC);
        if (!$profile) throw new RuntimeException('الباقة غير موجودة أو لم يتم تحديدها');
        if (($profile['package_type'] ?? 'paid') === 'free' || (float)($profile['retail_price'] ?: $profile['price']) <= 0) {
            throw new RuntimeException('الباقات المجانية مخصصة فقط لمنح المستخدمين و VIP عبر واجهة الكروت المجانية، ولا يمكن بيعها ككرت فوري.');
        }
        $profileName = $profile['name'];

        $passwordMode = (!empty($data['password_mode']) && in_array($data['password_mode'], ['blank', 'same_as_username'], true)) ? $data['password_mode'] : 'blank';
        if (!$buyer && !empty($data['save_customer'])) {
            $this->db->prepare("INSERT INTO um_instant_balance_customers(network_id,phone, name, is_recurring, created_by) VALUES(?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), is_recurring = 1")->execute([$ctx['network_id'],$phone, $name, $ctx['id']]);
        }

        $cost = round((float)($profile['cost_price'] > 0 ? $profile['cost_price'] : ($profile['retail_price'] > 0 ? $profile['retail_price'] : ($profile['price'] > 0 ? $profile['price'] : 0))), 2);
        $sale = round((float)($profile['retail_price'] > 0 ? $profile['retail_price'] : ($profile['price'] > 0 ? $profile['price'] : $cost)), 2);
        if ($cost < 0 || $sale < 0) throw new RuntimeException('سعر بيع الباقة غير صالح');

        $payment = in_array(($data['payment_type'] ?? 'cash'), ['cash', 'credit', 'partial'], true) ? $data['payment_type'] : 'cash';
        if ($payment === 'credit' && empty($buyer)) {
            throw new RuntimeException('لا يمكن إصدار كرت بنوع سداد (آجل) إلا باختيار حساب عميل / موزع مسجل');
        }
        $paid = $payment === 'cash' ? $sale : ($payment === 'credit' ? 0.00 : min($sale, max(0.00, (float)($data['paid_amount'] ?? $sale / 2))));
        $remaining = $sale - $paid;

        $no = $this->nextNo('INV-DV');
        $this->db->beginTransaction();
        try {
            // Deduct exactly the COST price from seller's instant balance (if not free)
            if ($cost > 0) {
                $parts = $this->consumeLots($ctx['id'], $cost, 'digital_voucher', $no);
                $costBasis = round(array_sum(array_column($parts, 'cost')), 2);
            } else {
                $parts = [];
                $costBasis = 0.00;
            }

            do {
                $code = (string)random_int(10000000, 99999999);
                $c = $this->db->prepare('SELECT 1 FROM um_vouchers_meta WHERE network_id=? AND username = ?');
                $c->execute([$ctx['network_id'],$code]);
            } while ($c->fetchColumn());

            $insInv = $this->db->prepare("INSERT INTO um_sales_invoices(network_id,invoice_no, sale_kind, seller_id, buyer_id, buyer_phone, buyer_name, batch_id, profile_name, quantity, unit_price, discount_amount, total_amount, cost_amount, profit_amount, paid_amount, remaining_amount, payment_type, notes) VALUES(?, ?, 'digital_voucher', ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?, 'إصدار كرت من الرصيد الفوري')");
            $insInv->execute([$ctx['network_id'],$no, $ctx['id'], $buyer['id'] ?? null, $phone, $name, 'DIGITAL-' . date('Ymd'), $profileName, $sale, $sale, $costBasis, $sale - $costBasis, $paid, $remaining, $payment]);
            $invoiceId = (int)$this->db->lastInsertId();

            $this->db->prepare("INSERT INTO um_sales_invoice_items(network_id,invoice_id, item_type, profile_name, batch_id, sheets_count, sheet_numbers, cards_count, unit_price, gross_amount, discount_amount, net_amount, cost_amount, profit_amount) VALUES(?, ?, 'digital_voucher', ?, ?, 0, NULL, 1, ?, ?, 0, ?, ?, ?)")
                ->execute([$ctx['network_id'],$invoiceId, $profileName, 'DIGITAL-' . date('Ymd'), $sale, $sale, $sale, $costBasis, $sale - $costBasis]);

            $radiusPassword = $passwordMode === 'blank' ? '' : $code;
            $this->db->prepare("INSERT INTO radcheck(network_id,username, attribute, op, value) VALUES(?, ?, 'Cleartext-Password', ':=', ?)")->execute([$ctx['network_id'],$code, $radiusPassword]);
            $this->db->prepare("INSERT INTO radusergroup(network_id,username, groupname, priority) VALUES(?, ?, ?, 1)")->execute([$ctx['network_id'],$code, $profileName]);

            $this->db->prepare("INSERT INTO um_vouchers_meta(network_id,username, batch_id, profile_name, price, validity, status, comment, owner_admin_id, sold_by_admin_id, sold_at, sale_price, purchase_cost, profit_amount, buyer_phone, buyer_name, login_password_mode, is_sold, delivery_status, invoice_id, source_balance_invoice_id) VALUES(?, ?, ?, ?, ?, ?, 'active', 'كرت إلكتروني من الرصيد الفوري', ?, ?, NOW(), ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)")
                ->execute([$ctx['network_id'],$code, 'DIGITAL-' . date('Ymd'), $profileName, $sale, $profile['validity'], $ctx['id'], $ctx['id'], $sale, $costBasis, $sale - $costBasis, $phone, $name, $passwordMode, $invoiceId, $invoiceId]);

            $this->recordFinancialInvoice($invoiceId, $no, $ctx['id'], $buyer, $name, $sale, $paid, $remaining, $payment, 'مبيعات كرت إلكتروني');
            $this->postSaleJournal($ctx['id'], $buyer, $no, $sale, $paid, $remaining, $costBasis);
            $this->db->commit();
            try {
                $this->radius->getNotificationService()->notifyDigitalVoucher($invoiceId, $ctx['id']);
            } catch (\Throwable $e) {}
            return ['success' => true, 'id' => $invoiceId, 'invoice_no' => $no, 'username' => $code, 'password' => $radiusPassword, 'profile_name' => $profileName, 'cost' => $costBasis, 'sale_price' => $sale, 'profit' => $sale - $costBasis, 'buyer_name' => $name, 'buyer_phone' => $phone];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function invoices(array $filters=[]): array
    {
        $ctx=$this->context();$where=["i.network_id=?","i.sale_kind IN ('instant_balance','digital_voucher')"];$params=[$ctx['network_id']];
        if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true)){
            $trade=(string)($filters['trade_type']??'all');
            if($trade==='sales'){$where[]='i.seller_id=?';$params[]=$ctx['id'];}
            elseif($trade==='purchases'){$where[]='i.buyer_id=?';$params[]=$ctx['id'];}
            else{$where[]='(i.seller_id=? OR i.buyer_id=?)';$params[]=$ctx['id'];$params[]=$ctx['id'];}
        }
        $q=$this->db->prepare("SELECT i.*,s.fullname seller_name,b.fullname buyer_account_name,v.delivery_status,v.delivered_at FROM um_sales_invoices i LEFT JOIN um_admins s ON s.id=i.seller_id LEFT JOIN um_admins b ON b.id=i.buyer_id LEFT JOIN um_vouchers_meta v ON v.invoice_id=i.id WHERE ".implode(' AND ',$where).' ORDER BY i.id DESC LIMIT 1000');$q->execute($params);
        return ['success'=>true,'invoices'=>$q->fetchAll(PDO::FETCH_ASSOC)];
    }

    private function voucherRecord(int $invoiceId): array
    {
        $ctx=$this->context();
        $q=$this->db->prepare("SELECT v.*,i.invoice_no,i.seller_id,i.invoice_status,i.paid_amount,i.cost_amount,i.total_amount FROM um_vouchers_meta v JOIN um_sales_invoices i ON i.id=v.invoice_id AND i.network_id=v.network_id WHERE i.network_id=? AND i.id=? AND i.sale_kind='digital_voucher' LIMIT 1");
        $q->execute([$ctx['network_id'],$invoiceId]); $row=$q->fetch(PDO::FETCH_ASSOC);
        if(!$row) throw new RuntimeException('فاتورة الكرت غير موجودة');
        if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true) && (int)$row['seller_id']!==$ctx['id']) throw new RuntimeException('غير مصرح');
        return $row;
    }

    public function resendVoucher(int $invoiceId): array
    {
        $ctx=$this->context();$v=$this->voucherRecord($invoiceId);
        if($v['invoice_status']!=='completed'||$v['delivery_status']==='refunded')throw new RuntimeException('الفاتورة مسترجعة أو ملغاة');
        $passwordLine=($v['login_password_mode']??'blank')==='blank'?"🔓 *كلمة المرور:* فارغة":"🔑 *كلمة المرور:* `{$v['username']}`";
        $message="🏢 *SAM | كرت إنترنت مدفوع*\n━━━━━━━━━━━━━━━━━━━━\n🎫 *رقم الكرت:* `{$v['username']}`\n$passwordLine\n📦 *الباقة:* {$v['profile_name']}\n💰 *سعر البيع:* ".number_format((float)$v['sale_price'],2)." YER\n⏳ *الصلاحية:* {$v['validity']}\n━━━━━━━━━━━━━━━━━━━━\nشكراً لاستخدامكم خدمتنا.";
        try{$wa=$this->radius->getNotificationService()->getWhatsAppService()->sendMessage('967'.$v['buyer_phone'],$message,'digital_voucher_'.$invoiceId.'_retry_'.time(),$ctx['id']);$sent=!empty($wa['success']);$error=$wa['error']??null;}catch(Throwable $e){$sent=false;$error=$e->getMessage();}
        $this->db->prepare('UPDATE um_vouchers_meta SET delivery_status=?,delivered_at=? WHERE network_id=? AND invoice_id=?')->execute([$sent?'sent':'failed',$sent?date('Y-m-d H:i:s'):null,$ctx['network_id'],$invoiceId]);
        $this->db->prepare("INSERT INTO um_notification_logs(network_id,channel,event_type,recipient_phone,recipient_name,message_text,status,error_message,reference_id,created_by) VALUES(?,'whatsapp','paid_voucher',?,?,?,?,?,?,?)")->execute([$ctx['network_id'],$v['buyer_phone'],$v['buyer_name']?:'عميل نقدي',$message,$sent?'sent':'failed',$error,$v['invoice_no'],$ctx['id']]);
        return ['success'=>$sent,'phone'=>$v['buyer_phone'],'delivery_status'=>$sent?'sent':'failed','error'=>$error];
    }

    public function refundFailedVoucher(int $invoiceId): array
    {
        $ctx = $this->context();
        $this->db->beginTransaction();
        try {
            $v = $this->voucherRecord($invoiceId);
            
            // 1. Check if already refunded
            if ($v['invoice_status'] === 'refunded' || $v['delivery_status'] === 'refunded') {
                throw new RuntimeException('هذه الفاتورة مسترجعة بالفعل مسبقاً');
            }

            // 2. Verify card has not been used or logged into FreeRADIUS
            if (!empty($v['first_login']) || $v['status'] === 'used') {
                throw new RuntimeException('لا يمكن استرجاع الكرت؛ تم تسجيل دخول بالكرت وبدء استهلاكه');
            }
            $used = $this->db->prepare('SELECT COUNT(*) FROM radacct WHERE network_id=? AND username = ?');
            $used->execute([$ctx['network_id'],$v['username']]);
            if ((int)$used->fetchColumn() > 0) {
                throw new RuntimeException('لا يمكن استرجاع الكرت؛ توجد جلسات استخدام فعلية مسجلة للكرت في السيرفر');
            }

            // 3. Restore balance and cost back into lot
            $parts = $this->db->prepare("SELECT * FROM um_instant_balance_consumptions WHERE network_id=? AND event_type='digital_voucher' AND reference_no=? FOR UPDATE");
            $parts->execute([$ctx['network_id'],$v['invoice_no']]);
            $consumedParts = $parts->fetchAll(PDO::FETCH_ASSOC);
            foreach ($consumedParts as $part) {
                $this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount = remaining_amount + ?, remaining_cost = remaining_cost + ?, status = 'active' WHERE network_id=? AND id = ?")
                         ->execute([$part['amount'], $part['cost_amount'],$ctx['network_id'], $part['lot_id']]);
            }

            // 4. Update sales invoice & meta status
            $this->db->prepare("UPDATE um_sales_invoices SET invoice_status = 'refunded', refunded_at = NOW() WHERE network_id=? AND id = ?")->execute([$ctx['network_id'],$invoiceId]);
            $this->db->prepare("UPDATE um_vouchers_meta SET status = 'disabled', is_sold = 0, delivery_status = 'refunded', comment = 'تم استرجاع الكرت وإلغاء الفاتورة وعكس القيد' WHERE network_id=? AND invoice_id = ?")->execute([$ctx['network_id'],$invoiceId]);

            // 5. Delete credentials from FreeRADIUS tables
            $this->db->prepare('DELETE FROM radcheck WHERE network_id=? AND username = ?')->execute([$ctx['network_id'],$v['username']]);
            $this->db->prepare('DELETE FROM radusergroup WHERE network_id=? AND username = ?')->execute([$ctx['network_id'],$v['username']]);
            $this->db->prepare('DELETE FROM radreply WHERE network_id=? AND username = ?')->execute([$ctx['network_id'],$v['username']]);

            // 6. Void receipt voucher
            $this->db->prepare('UPDATE um_vouchers_financial SET is_void = 1, voided_at = NOW() WHERE network_id=? AND invoice_id = ?')->execute([$ctx['network_id'],$invoiceId]);

            // 7. Insert reversal financial transaction
            $this->db->prepare("INSERT INTO um_financial_transactions (network_id,tx_no, account_id, tx_type, reference_id, debit, credit, cashbox_impact, payment_method, description, created_by) VALUES (?, ?, ?, 'adjustment', ?, ?, 0, ?, 'cash', ?, ?)")
                ->execute([$ctx['network_id'],$this->nextNo('TXR'), $ctx['id'], $v['invoice_no'], (float)$v['paid_amount'], -(float)$v['paid_amount'], "عكس فاتورة كرت فوري {$v['invoice_no']}", $ctx['id']]);

            // 8. Reversing Double-Entry Journal Entry
            $cash = $this->resolveCashAccount($ctx['id']);
            $rev = $this->resolveAccount('4103');
            $cogs = $this->resolveAccount('5101');
            $stock = $this->resolveAccount('1204');

            $lines = [
                ['account_id' => $rev, 'debit' => (float)$v['total_amount'], 'credit' => 0, 'line_description' => "عكس إيراد كرت فوري {$v['invoice_no']}"],
                ['account_id' => $cash, 'debit' => 0, 'credit' => (float)$v['paid_amount'], 'line_description' => "استرداد قيمة كرت فوري نقداً {$v['invoice_no']}"]
            ];
            if ((float)$v['cost_amount'] > 0) {
                $lines[] = ['account_id' => $stock, 'debit' => (float)$v['cost_amount'], 'credit' => 0, 'line_description' => "إعادة مخزون كرت فوري {$v['invoice_no']}"];
                $lines[] = ['account_id' => $cogs, 'debit' => 0, 'credit' => (float)$v['cost_amount'], 'line_description' => "عكس تكلفة مبيعات كرت فوري {$v['invoice_no']}"];
            }

            $this->radius->createJournalEntry([
                'entry_date' => date('Y-m-d'),
                'source_module' => 'instant_balance_refund',
                'reference_no' => $v['invoice_no'],
                'description' => "عكس فاتورة واسترجاع كرت فوري {$v['invoice_no']}",
                'lines' => $lines
            ], $ctx['id']);

            $this->db->commit();
            return [
                'success' => true,
                'available' => $this->available((int)$v['seller_id']),
                'message' => 'تم استرجاع الكرت بنجاح وإعادة رصيده للمخزن وعكس القيد المحاسبي وتعطيل الكرت في السيرفر'
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
}
