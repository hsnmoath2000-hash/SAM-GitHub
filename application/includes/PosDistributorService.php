<?php
declare(strict_types=1);

final class PosDistributorService
{
    public function __construct(private PDO $db) {}

    public function posDashboard(int $actorId, string $actorRole): array
    {
        $networkId=$this->activeNetworkId();
        if (!in_array($actorRole, ['pos_agent','distributor','system_owner','superadmin'], true)) throw new DomainException('FORBIDDEN');
        $admin = $this->admin($actorId);
        $parent = !empty($admin['parent_id']) ? $this->admin((int)$admin['parent_id']) : null;
        $wallet = $this->nullableScalar('SELECT balance FROM um_agent_wallets WHERE admin_id=? AND network_id=?', [$actorId,$networkId]);
        $instant = (float)$this->scalar("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE owner_admin_id=? AND network_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW())", [$actorId,$networkId]);
        $debt = (float)$this->scalar("SELECT COALESCE(SUM(remaining_amount),0) FROM um_sales_invoices WHERE buyer_id=? AND network_id=? AND invoice_status='completed'", [$actorId,$networkId]);
        $stock = (int)$this->scalar("SELECT COUNT(*) FROM um_vouchers_meta WHERE owner_admin_id=? AND network_id=? AND is_sold=0 AND status='active' AND (expires_at IS NULL OR expires_at>NOW())", [$actorId,$networkId]);
        $soldToday = (int)$this->scalar('SELECT COUNT(*) FROM um_vouchers_meta WHERE sold_by_admin_id=? AND network_id=? AND DATE(sold_at)=CURDATE()', [$actorId,$networkId]);
        $salesToday = (float)$this->scalar("SELECT COALESCE(SUM(total_amount),0) FROM um_sales_invoices WHERE seller_id=? AND network_id=? AND invoice_status='completed' AND DATE(created_at)=CURDATE()", [$actorId,$networkId]);
        $networkBalance=$this->networkBalance($actorId,$networkId,$admin);
        $network = $this->network($actorId, $parent ? (int)$parent['id'] : 0);
        return [
            'success'=>true,
            'account'=>[
                'id'=>$actorId,'fullname'=>$admin['fullname'],'username'=>$admin['username'],'role'=>$admin['role'],
                'balance'=>(float)$networkBalance['balance'],'wallet_balance'=>(float)($wallet ?? 0),
                'available_balance'=>(float)($wallet ?? $networkBalance['balance']),'debt'=>$debt,
                'credit_limit'=>(float)$networkBalance['credit_limit'],'credit_available'=>max(0,(float)$networkBalance['credit_limit']-$debt),
                'discount_rate'=>(float)$admin['discount_rate'],
            ],
            'parent'=>$parent ? ['id'=>(int)$parent['id'],'fullname'=>$parent['fullname'],'phone'=>$parent['phone']] : null,
            'network'=>$network,
            'cards'=>['stock'=>$stock,'sold_today'=>$soldToday,'sales_today'=>$salesToday],
            'instant_balance'=>$instant,
            'statement'=>$this->statement($actorId),
            'recent_cards'=>$this->recentCards($actorId),
        ];
    }

    public function distributors(int $actorId, string $actorRole): array
    {
        $networkId=$this->activeNetworkId();$params=[$networkId,$networkId,$networkId,$networkId,$networkId];
        if (in_array($actorRole,['system_owner','superadmin','superadmin'],true)) {
            $where="a.role IN ('distributor','pos_agent')";
        } elseif ($actorRole==='distributor') {
            $where="(a.id=? OR a.parent_id=?) AND COALESCE(nr.role_key,a.role) IN ('distributor','pos_agent')"; $params=array_merge($params,[$actorId,$actorId]);
        } else throw new DomainException('FORBIDDEN');
        $where=str_replace("a.role IN ('distributor','pos_agent')","COALESCE(nr.role_key,a.role) IN ('distributor','pos_agent')",$where);
        $sql="SELECT a.id,a.username,a.fullname,a.phone,COALESCE(nr.role_key,a.role) role,a.parent_id,COALESCE(nb.balance,0) balance,COALESCE(nb.credit_limit,a.credit_limit) credit_limit,a.discount_rate,a.is_active,
            COALESCE(w.balance,0) wallet_balance,
            COALESCE((SELECT SUM(l.remaining_amount) FROM um_instant_balance_lots l WHERE l.owner_admin_id=a.id AND l.network_id=? AND l.status='active' AND l.remaining_amount>0 AND (l.expires_at IS NULL OR l.expires_at>NOW())),0) instant_balance,
            COALESCE((SELECT SUM(i.remaining_amount) FROM um_sales_invoices i WHERE i.buyer_id=a.id AND i.network_id=? AND i.invoice_status='completed'),0) debt,
            COALESCE((SELECT COUNT(*) FROM um_vouchers_meta v WHERE v.owner_admin_id=a.id AND v.network_id=? AND v.is_sold=0 AND v.status='active'),0) cards_stock
            FROM um_admins a
            JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1
            LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1
            LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=nx.network_id
            LEFT JOIN um_agent_wallets w ON w.admin_id=a.id AND w.network_id=nx.network_id
            WHERE {$where} ORDER BY role,a.fullname";
        $s=$this->db->prepare($sql);$s->execute($params);
        return ['success'=>true,'distributors'=>$s->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function topupRequests(int $actorId, string $actorRole): array
    {
        $networkId=$this->activeNetworkId();
        if (in_array($actorRole,['system_owner','superadmin','superadmin'],true)) {$where='1=1';$params=[];}
        elseif ($actorRole==='distributor') {$where='(r.requester_admin_id=? OR r.target_admin_id=? OR t.parent_id=?)';$params=[$actorId,$actorId,$actorId];}
        else {$where='(r.requester_admin_id=? OR r.target_admin_id=?)';$params=[$actorId,$actorId];}
        $s=$this->db->prepare("SELECT r.*,q.fullname requester_name,t.fullname target_name,rv.fullname reviewer_name FROM um_balance_topup_requests r JOIN um_admins q ON q.id=r.requester_admin_id JOIN um_admins t ON t.id=r.target_admin_id LEFT JOIN um_admins rv ON rv.id=r.reviewed_by_admin_id WHERE r.network_id=? AND {$where} ORDER BY r.id DESC LIMIT 100");
        $s->execute(array_merge([$networkId],$params));return ['success'=>true,'requests'=>$s->fetchAll(PDO::FETCH_ASSOC)];
    }

    public function createTopupRequest(int $actorId,string $actorRole,array $data): array
    {
        $networkId=$this->activeNetworkId();
        $target=(int)($data['target_admin_id']??$actorId);$amount=round((float)($data['amount']??0),2);
        if($amount<=0)throw new InvalidArgumentException('INVALID_AMOUNT');
        $this->assertTarget($actorId,$actorRole,$target,false);
        $requestNo='TOP-'.date('YmdHis').'-'.random_int(100,999);
        $this->db->beginTransaction();
        try {
            $s=$this->db->prepare("INSERT INTO um_balance_topup_requests(network_id,request_no,requester_admin_id,target_admin_id,requested_amount,currency_code,payment_method,payment_reference,expires_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?)");
            $s->execute([$networkId,$requestNo,$actorId,$target,$amount,(string)($data['currency_code']??'YER_SANAA'),(string)($data['payment_method']??'cash'),trim((string)($data['payment_reference']??''))?:null,trim((string)($data['expires_at']??''))?:null,trim((string)($data['notes']??''))?:null]);
            $id=(int)$this->db->lastInsertId();
            $this->event($id,'created',$actorId,$amount,null,'إنشاء طلب شحن');
            $targetAdmin=$this->admin($target);
            $message="طلب {$requestNo} لشحن ".number_format($amount,2)." ر.ي إلى {$targetAdmin['fullname']}";
            $metadata=['topup_request_id'=>$id,'target_admin_id'=>$target,'status'=>'pending'];
            $this->notify('financial','طلب شحن رصيد معلق',$message,'system_owner',null,$metadata);
            $this->notify('financial','طلب شحن رصيد معلق',$message,'superadmin',null,$metadata);
            $this->notify('financial','طلب شحن رصيد معلق',$message,'superadmin',null,$metadata);
            if($actorRole==='distributor')$this->notify('financial','تم إرسال طلب الشحن',"تم إرسال {$requestNo} للاعتماد",null,$actorId,$metadata);
            $this->db->commit();
            return ['success'=>true,'request_id'=>$id,'request_no'=>$requestNo];
        } catch(Throwable $e) { if($this->db->inTransaction())$this->db->rollBack(); throw $e; }
    }

    public function reviewTopup(int $actorId,string $actorRole,array $data): array
    {
        $networkId=$this->activeNetworkId();
        if(!in_array($actorRole,['system_owner','superadmin','superadmin'],true))throw new DomainException('FORBIDDEN');
        $id=(int)($data['request_id']??0);$decision=(string)($data['decision']??'');
        if(!in_array($decision,['approved','rejected'],true))throw new InvalidArgumentException('INVALID_DECISION');
        $this->db->beginTransaction();
        try{
            $s=$this->db->prepare('SELECT * FROM um_balance_topup_requests WHERE id=? AND network_id=? FOR UPDATE');$s->execute([$id,$networkId]);$r=$s->fetch(PDO::FETCH_ASSOC);
            if(!$r||$r['status']!=='pending')throw new DomainException('REQUEST_NOT_PENDING');
            $amount=round((float)($data['approved_amount']??$r['requested_amount']),2);if($decision==='approved'&&$amount<=0)throw new InvalidArgumentException('INVALID_AMOUNT');
            if($decision==='approved'){
                $expires=trim((string)($data['expires_at']??$r['expires_at']??''))?:null;
                $this->db->prepare('INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,original_amount,remaining_amount,expires_at,granted_by_admin_id) VALUES(?,?,?,?,?,?)')->execute([$networkId,(int)$r['target_admin_id'],$amount,$amount,$expires,$actorId]);
                $this->db->prepare("UPDATE um_balance_topup_requests SET status='approved',approved_amount=?,expires_at=?,reviewed_by_admin_id=?,reviewed_at=NOW() WHERE id=?")->execute([$amount,$expires,$actorId,$id]);
                $balance=(float)$this->scalar("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE owner_admin_id=? AND network_id=? AND status='active'",[(int)$r['target_admin_id'],$networkId]);
                $this->event($id,'approved',$actorId,$amount,$balance,'اعتماد وشحن الرصيد الفوري');
                $this->notify('financial','تم اعتماد طلب الشحن',"تم شحن ".number_format($amount,2)." ر.ي؛ الرصيد الحالي ".number_format($balance,2)." ر.ي",null,(int)$r['target_admin_id'],['topup_request_id'=>$id,'status'=>'approved']);
                if((int)$r['requester_admin_id']!==(int)$r['target_admin_id'])$this->notify('financial','تم اعتماد طلب الشحن','تم اعتماد طلب الشحن الخاص بك',null,(int)$r['requester_admin_id'],['topup_request_id'=>$id,'status'=>'approved']);
            }else{
                $this->db->prepare("UPDATE um_balance_topup_requests SET status='rejected',approved_amount=NULL,reviewed_by_admin_id=?,reviewed_at=NOW() WHERE id=?")->execute([$actorId,$id]);
                $this->event($id,'rejected',$actorId,null,null,trim((string)($data['notes']??''))?:'رفض الطلب');
                $this->notify('alert','تم رفض طلب الشحن',"تم رفض طلب الشحن رقم {$r['request_no']}",null,(int)$r['requester_admin_id'],['topup_request_id'=>$id,'status'=>'rejected']);
            }
            $this->db->commit();return ['success'=>true,'status'=>$decision];
        }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    public function salesReport(int $actorId,string $actorRole,array $filters): array
    {
        $networkId=$this->activeNetworkId();
        if(!in_array($actorRole,['system_owner','superadmin','superadmin','distributor','pos_agent'],true))throw new DomainException('FORBIDDEN');
        $period=(string)($filters['period']??'day');
        if(!in_array($period,['day','month'],true))throw new InvalidArgumentException('INVALID_PERIOD');
        if($period==='day'){
            $raw=(string)($filters['date']??date('Y-m-d'));$date=DateTimeImmutable::createFromFormat('!Y-m-d',$raw);
            if(!$date||$date->format('Y-m-d')!==$raw)throw new InvalidArgumentException('INVALID_DATE');
            $start=$date;$end=$date->modify('+1 day');$previousStart=$date->modify('-1 day');$previousEnd=$date;
        }else{
            $raw=(string)($filters['month']??date('Y-m'));$date=DateTimeImmutable::createFromFormat('!Y-m',$raw);
            if(!$date||$date->format('Y-m')!==$raw)throw new InvalidArgumentException('INVALID_MONTH');
            $start=$date;$end=$date->modify('+1 month');$previousStart=$date->modify('-1 month');$previousEnd=$date;
        }
        $sellerIds=$this->sellerScope($actorId,$actorRole);
        $requested=(int)($filters['seller_id']??0);
        if($requested>0){if(!in_array($requested,$sellerIds,true))throw new DomainException('FORBIDDEN_SCOPE');$sellerIds=[$requested];}
        $summary=$this->salesSummary($sellerIds,$start,$end);$previous=$this->salesSummary($sellerIds,$previousStart,$previousEnd);
        $ph=implode(',',array_fill(0,count($sellerIds),'?'));$params=array_merge([$networkId],$sellerIds,[$start->format('Y-m-d H:i:s'),$end->format('Y-m-d H:i:s')]);
        $bucket=$period==='day'?"LPAD(HOUR(i.created_at),2,'0')":"DATE_FORMAT(i.created_at,'%Y-%m-%d')";
        $s=$this->db->prepare("SELECT {$bucket} bucket,COUNT(*) invoices,COALESCE(SUM(i.total_amount),0) total,CASE WHEN SUM(i.sale_kind='cards' AND i.cost_amount=0)>0 THEN NULL ELSE COALESCE(SUM(i.profit_amount),0) END profit FROM um_sales_invoices i WHERE i.network_id=? AND i.seller_id IN ({$ph}) AND i.created_at>=? AND i.created_at<? AND i.invoice_status='completed' GROUP BY {$bucket} ORDER BY bucket");$s->execute($params);$series=$s->fetchAll(PDO::FETCH_ASSOC);
        $s=$this->db->prepare("SELECT a.id,a.fullname,a.role,COUNT(i.id) invoices,COALESCE(SUM(i.total_amount),0) total,COALESCE(SUM(i.paid_amount),0) paid,COALESCE(SUM(i.remaining_amount),0) remaining,CASE WHEN SUM(i.sale_kind='cards' AND i.cost_amount=0)>0 THEN NULL ELSE COALESCE(SUM(i.profit_amount),0) END profit FROM um_sales_invoices i JOIN um_admins a ON a.id=i.seller_id WHERE i.network_id=? AND i.seller_id IN ({$ph}) AND i.created_at>=? AND i.created_at<? AND i.invoice_status='completed' GROUP BY a.id,a.fullname,a.role ORDER BY total DESC");$s->execute($params);$sellers=$s->fetchAll(PDO::FETCH_ASSOC);
        $s=$this->db->prepare("SELECT i.sale_kind,COUNT(*) invoices,COALESCE(SUM(i.quantity),0) quantity,COALESCE(SUM(i.total_amount),0) total,CASE WHEN SUM(i.sale_kind='cards' AND i.cost_amount=0)>0 THEN NULL ELSE COALESCE(SUM(i.profit_amount),0) END profit FROM um_sales_invoices i WHERE i.network_id=? AND i.seller_id IN ({$ph}) AND i.created_at>=? AND i.created_at<? AND i.invoice_status='completed' GROUP BY i.sale_kind ORDER BY total DESC");$s->execute($params);$kinds=$s->fetchAll(PDO::FETCH_ASSOC);
        $s=$this->db->prepare("SELECT i.invoice_no,i.sale_kind,i.seller_id,a.fullname seller_name,i.buyer_name,i.quantity,i.total_amount,i.paid_amount,i.remaining_amount,CASE WHEN i.sale_kind='cards' AND i.cost_amount=0 THEN NULL ELSE i.profit_amount END profit_amount,i.created_at FROM um_sales_invoices i JOIN um_admins a ON a.id=i.seller_id WHERE i.network_id=? AND i.seller_id IN ({$ph}) AND i.created_at>=? AND i.created_at<? AND i.invoice_status='completed' ORDER BY i.created_at DESC LIMIT 100");$s->execute($params);$invoices=$s->fetchAll(PDO::FETCH_ASSOC);
        $change=(float)$previous['total']>0?round((((float)$summary['total']-(float)$previous['total'])/(float)$previous['total'])*100,2):((float)$summary['total']>0?100:0);
        return ['success'=>true,'period'=>$period,'start'=>$start->format('Y-m-d'),'end'=>$end->format('Y-m-d'),'summary'=>$summary,'previous'=>$previous,'change_percent'=>$change,'series'=>$series,'sellers'=>$sellers,'kinds'=>$kinds,'invoices'=>$invoices,'available_sellers'=>$this->sellerNames($sellerIds)];
    }

    public function pendingTopupAlerts(int $actorId,string $actorRole): array
    {
        $networkId=$this->activeNetworkId();
        if(in_array($actorRole,['system_owner','superadmin','superadmin'],true)){$where='1=1';$p=[];}
        elseif($actorRole==='distributor'){$where='(r.requester_admin_id=? OR r.target_admin_id=? OR t.parent_id=?)';$p=[$actorId,$actorId,$actorId];}
        else{$where='(r.requester_admin_id=? OR r.target_admin_id=?)';$p=[$actorId,$actorId];}
        $s=$this->db->prepare("SELECT r.id,r.request_no,r.requested_amount,r.created_at,t.fullname target_name,q.fullname requester_name,TIMESTAMPDIFF(MINUTE,r.created_at,NOW()) waiting_minutes FROM um_balance_topup_requests r JOIN um_admins t ON t.id=r.target_admin_id JOIN um_admins q ON q.id=r.requester_admin_id WHERE r.network_id=? AND r.status='pending' AND {$where} ORDER BY r.id DESC LIMIT 20");$s->execute(array_merge([$networkId],$p));$rows=$s->fetchAll(PDO::FETCH_ASSOC);
        return ['success'=>true,'pending_count'=>count($rows),'pending_total'=>array_sum(array_map(fn($r)=>(float)$r['requested_amount'],$rows)),'alerts'=>$rows];
    }

    private function assertTarget(int $actorId,string $role,int $target,bool $approval): void
    {
        if(in_array($role,['system_owner','superadmin','superadmin'],true))return;
        if($target===$actorId)return;
        if($role==='distributor'&&(int)$this->scalar('SELECT COUNT(*) FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 WHERE a.id=? AND a.parent_id=? AND a.is_active=1',[$this->activeNetworkId(),$target,$actorId])===1)return;
        throw new DomainException('FORBIDDEN_SCOPE');
    }

    private function sellerScope(int $actorId,string $role): array
    {
        $networkId=$this->activeNetworkId();
        if(in_array($role,['system_owner','superadmin','superadmin'],true)){$s=$this->db->prepare("SELECT a.id FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1 WHERE COALESCE(nr.role_key,a.role) IN ('distributor','pos_agent') AND a.is_active=1");$s->execute([$networkId,$networkId]);}
        elseif($role==='distributor'){$s=$this->db->prepare("SELECT a.id FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1 WHERE (a.id=? OR a.parent_id=?) AND COALESCE(nr.role_key,a.role) IN ('distributor','pos_agent') AND a.is_active=1");$s->execute([$networkId,$networkId,$actorId,$actorId]);}
        else return [$actorId];
        $ids=array_map('intval',$s->fetchAll(PDO::FETCH_COLUMN));return $ids?:[$actorId];
    }

    private function sellerNames(array $ids): array
    {
        $ph=implode(',',array_fill(0,count($ids),'?'));$s=$this->db->prepare("SELECT id,fullname,role FROM um_admins WHERE id IN ({$ph}) ORDER BY fullname");$s->execute($ids);return $s->fetchAll(PDO::FETCH_ASSOC);
    }

    private function salesSummary(array $ids,DateTimeImmutable $start,DateTimeImmutable $end): array
    {
        $ph=implode(',',array_fill(0,count($ids),'?'));$p=array_merge([$this->activeNetworkId()],$ids,[$start->format('Y-m-d H:i:s'),$end->format('Y-m-d H:i:s')]);
        $s=$this->db->prepare("SELECT COUNT(*) invoices,COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(total_amount),0) total,COALESCE(SUM(paid_amount),0) paid,COALESCE(SUM(remaining_amount),0) remaining,CASE WHEN SUM(sale_kind='cards' AND cost_amount=0)>0 THEN NULL ELSE COALESCE(SUM(cost_amount),0) END cost,CASE WHEN SUM(sale_kind='cards' AND cost_amount=0)>0 THEN NULL ELSE COALESCE(SUM(profit_amount),0) END profit FROM um_sales_invoices WHERE network_id=? AND seller_id IN ({$ph}) AND created_at>=? AND created_at<? AND invoice_status='completed'");$s->execute($p);return $s->fetch(PDO::FETCH_ASSOC)?:[];
    }

    private function activeNetworkId(): int
    {
        $id = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_SESSION['active_network_id'] ?? 1));
        if ($id <= 0) $id = 1;
        try {
            $this->db->exec('SET @sam_active_network_id=' . $id);
        } catch (\Throwable $e) {}
        return $id;
    }

    private function notify(string $category, string $title, string $message, ?string $targetRole, ?int $targetAdminId, array $metadata): void
    {
        try {
            $stmt = $this->db->prepare("INSERT INTO um_notifications (category, title, message, target_role, target_admin_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([$category, $title, $message, $targetRole, $targetAdminId, json_encode($metadata, JSON_UNESCAPED_UNICODE)]);
        } catch (\Throwable $e) {
            // Non-blocking notification
        }
    }

    // ==========================================
    // MULTI-NETWORK AFFILIATION & JOIN REQUESTS FOR POS
    // ==========================================

    public function getNetworksCatalog(int $actorId, string $actorRole): array
    {
        $admin = $this->db->query("SELECT phone, fullname FROM um_admins WHERE id = " . (int)$actorId)->fetch(PDO::FETCH_ASSOC);
        $phone = $admin['phone'] ?? '';
        $activeNetId = (int)($_SESSION['active_network_id'] ?? 0);

        $netsStmt = $this->db->query("SELECT id, code, name, location, theme_color, logo_url FROM um_networks WHERE status = 'active' ORDER BY name ASC");
        $networks = $netsStmt ? ($netsStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $result = [];
        foreach ($networks as $net) {
            $nid = (int)$net['id'];
            // Check connected
            $accStmt = $this->db->prepare("SELECT access_level, is_active FROM um_admin_network_access WHERE admin_id = ? AND network_id = ? LIMIT 1");
            $accStmt->execute([$actorId, $nid]);
            $acc = $accStmt->fetch(PDO::FETCH_ASSOC);
            $isConnected = $acc && (int)$acc['is_active'] === 1;

            // Check balances
            $balStmt = $this->db->prepare("SELECT balance, credit_limit, currency_code FROM um_admin_network_balances WHERE admin_id = ? AND network_id = ? LIMIT 1");
            $balStmt->execute([$actorId, $nid]);
            $bal = $balStmt->fetch(PDO::FETCH_ASSOC) ?: ['balance' => 0, 'credit_limit' => 0, 'currency_code' => 'YER_SANAA'];

            // Check debt
            $debt = (float)$this->scalar("SELECT COALESCE(SUM(remaining_amount),0) FROM um_sales_invoices WHERE buyer_id = ? AND network_id = ? AND invoice_status = 'completed'", [$actorId, $nid]);

            // Check pending requests
            $reqStmt = $this->db->prepare("SELECT * FROM um_pos_network_requests WHERE (pos_admin_id = ? OR phone = ?) AND network_id = ? ORDER BY id DESC LIMIT 1");
            $reqStmt->execute([$actorId, $phone, $nid]);
            $pendingReq = $reqStmt->fetch(PDO::FETCH_ASSOC);

            $result[] = [
                'id' => $nid,
                'code' => $net['code'],
                'name' => $net['name'],
                'location' => $net['location'],
                'theme_color' => $net['theme_color'],
                'is_connected' => $isConnected,
                'is_active_context' => ($nid === $activeNetId),
                'access_level' => $acc['access_level'] ?? null,
                'balance' => (float)$bal['balance'],
                'credit_limit' => (float)$bal['credit_limit'],
                'debt' => $debt,
                'currency_code' => $bal['currency_code'] ?? 'YER_SANAA',
                'latest_request' => $pendingReq ?: null
            ];
        }

        return [
            'success' => true,
            'networks' => $result,
            'active_network_id' => $activeNetId
        ];
    }

    public function submitNetworkJoinRequest(int $actorId, string $actorRole, array $data): array
    {
        $networkId = (int)($data['network_id'] ?? 0);
        if ($networkId <= 0) throw new InvalidArgumentException('INVALID_NETWORK');

        $admin = $this->db->query("SELECT fullname, phone, username FROM um_admins WHERE id = " . (int)$actorId)->fetch(PDO::FETCH_ASSOC);
        if (!$admin) throw new DomainException('ACCOUNT_DISABLED');

        $shopName = trim((string)($data['shop_name'] ?? ''));
        $phone = $admin['phone'];
        $notes = trim((string)($data['location_notes'] ?? ($data['notes'] ?? '')));

        // Check if already connected
        $chkAcc = $this->db->prepare("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id = ? AND network_id = ? AND is_active = 1");
        $chkAcc->execute([$actorId, $networkId]);
        if ((int)$chkAcc->fetchColumn() > 0) {
            throw new DomainException('ALREADY_CONNECTED');
        }

        // Check if already has pending request
        $chkReq = $this->db->prepare("SELECT COUNT(*) FROM um_pos_network_requests WHERE pos_admin_id = ? AND network_id = ? AND status = 'pending'");
        $chkReq->execute([$actorId, $networkId]);
        if ((int)$chkReq->fetchColumn() > 0) {
            throw new DomainException('REQUEST_ALREADY_PENDING');
        }

        $requestNo = 'POS-REQ-' . date('YmdHis') . '-' . random_int(100, 999);
        $ins = $this->db->prepare("INSERT INTO um_pos_network_requests (request_no, pos_admin_id, network_id, shop_name, phone, location_notes, status, is_confirmed_by_pos, initiated_by) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, 'pos_agent')");
        $ins->execute([$requestNo, $actorId, $networkId, $shopName ?: null, $phone, $notes ?: null]);
        $reqId = (int)$this->db->lastInsertId();

        // Notify Network Manager
        $netName = $this->db->query("SELECT name FROM um_networks WHERE id = {$networkId}")->fetchColumn() ?: 'الشبكة';
        $notifMsg = "طلب انضمام واعتماد نقطة بيع جديدة: {$admin['fullname']} (" . ($shopName ? "محل: {$shopName}, " : '') . "هاتف: {$phone})";
        $this->notify('pos_request', "🏪 طلب اعتماد نقطة بيع جديدة (#{$requestNo})", $notifMsg, 'admin', null, [
            'pos_request_id' => $reqId,
            'pos_admin_id' => $actorId,
            'network_id' => $networkId,
            'status' => 'pending'
        ]);

        return [
            'success' => true,
            'message' => 'تم إرسال طلب الانضمام والاعتماد للشبكة بنجاح، بانتظار موافقة مدير الشبكة.',
            'request_id' => $reqId,
            'request_no' => $requestNo
        ];
    }

    public function getPendingInvitations(int $actorId): array
    {
        $admin = $this->db->query("SELECT phone, fullname FROM um_admins WHERE id = " . (int)$actorId)->fetch(PDO::FETCH_ASSOC);
        $phone = $admin['phone'] ?? '';

        $sql = "SELECT r.*, n.name AS network_name, n.code AS network_code, n.location AS network_location
                FROM um_pos_network_requests r
                JOIN um_networks n ON n.id = r.network_id
                WHERE (r.pos_admin_id = ? OR r.phone = ?)
                  AND r.is_confirmed_by_pos = 0
                  AND r.status IN ('pending', 'approved')
                ORDER BY r.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$actorId, $phone]);
        $invitations = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'invitations' => $invitations
        ];
    }

    public function confirmNetworkInvitation(int $actorId, array $data): array
    {
        $requestId = (int)($data['request_id'] ?? 0);
        $decision = (string)($data['decision'] ?? 'accept'); // 'accept' | 'reject'
        $notes = trim((string)($data['notes'] ?? ''));

        $admin = $this->db->query("SELECT phone, fullname FROM um_admins WHERE id = " . (int)$actorId)->fetch(PDO::FETCH_ASSOC);
        $phone = $admin['phone'] ?? '';

        $stmt = $this->db->prepare("SELECT * FROM um_pos_network_requests WHERE id = ? AND (pos_admin_id = ? OR phone = ?) LIMIT 1");
        $stmt->execute([$requestId, $actorId, $phone]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req) throw new DomainException('REQUEST_NOT_FOUND');

        $networkId = (int)$req['network_id'];

        $this->db->beginTransaction();
        try {
            if ($decision === 'accept') {
                // Update request
                $upd = $this->db->prepare("UPDATE um_pos_network_requests SET is_confirmed_by_pos = 1, status = 'approved', pos_admin_id = ?, confirmation_notes = ? WHERE id = ?");
                $upd->execute([$actorId, $notes ?: 'تم التأكيد والموافقة من قبل نقطة البيع', $requestId]);

                // 1. Grant Network Access
                $insAcc = $this->db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (?, ?, 'agent', 0, 1, 1) ON DUPLICATE KEY UPDATE is_active = 1");
                $insAcc->execute([$actorId, $networkId]);

                // 2. Link Role
                $insRole = $this->db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, data_scope, is_active, assigned_by_admin_id) VALUES (?, ?, 'pos_agent', 'network', 1, 1) ON DUPLICATE KEY UPDATE is_active = 1");
                $insRole->execute([$actorId, $networkId]);

                // 3. Link Assignment
                $insAsg = $this->db->prepare("INSERT INTO um_pos_network_assignments (pos_admin_id, network_id, is_primary) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE is_primary = is_primary");
                $insAsg->execute([$actorId, $networkId]);

                // 4. Balances & Opening Debt
                $bal = (float)$req['opening_balance'];
                $credit = (float)$req['credit_limit'];
                $curr = $req['currency_code'] ?: 'YER_SANAA';

                $insBal = $this->db->prepare("INSERT INTO um_admin_network_balances (admin_id, network_id, balance, credit_limit, currency_code) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE credit_limit = ?");
                $insBal->execute([$actorId, $networkId, 0.0, $credit, $curr, $credit]);

                $openingDebt = (float)$req['opening_debt'];
                $openingBalance = (float)$req['opening_balance'];
                if ($openingDebt > 0 || $openingBalance > 0) {
                    require_once __DIR__ . '/FinancialAccountingService.php';
                    $faService = new FinancialAccountingService($this->db);
                    if ($openingDebt > 0) {
                        $faService->setAccountOpeningBalance([
                            'admin_id' => $actorId,
                            'amount' => $openingDebt,
                            'balance_type' => 'debt',
                            'notes' => 'مديونية سابقة مثبتة عند تأكيد نقطة البيع'
                        ], $actorId);
                    }
                    if ($openingBalance > 0) {
                        $faService->setAccountOpeningBalance([
                            'admin_id' => $actorId,
                            'amount' => $openingBalance,
                            'balance_type' => 'credit',
                            'notes' => 'رصيد افتتاحي مثبت عند تأكيد نقطة البيع'
                        ], $actorId);
                    }
                }

                // Notify network manager
                $this->notify('pos_request', '✅ تأكيد انضمام نقطة البيع', "أكدت نقطة البيع {$admin['fullname']} ارتباطها بالشبكة والمديونية السابقة بنجاح.", 'admin', null, [
                    'pos_admin_id' => $actorId,
                    'network_id' => $networkId
                ]);

            } else {
                $upd = $this->db->prepare("UPDATE um_pos_network_requests SET is_confirmed_by_pos = 2, status = 'rejected', confirmation_notes = ? WHERE id = ?");
                $upd->execute([$notes ?: 'تم رفض الدعوة من قبل نقطة البيع', $requestId]);
            }

            $this->db->commit();
            return [
                'success' => true,
                'message' => $decision === 'accept' ? 'تم تأكيد الارتباط بالشبكة بنجاح! يمكنك الآن التبديل إليها وتنفيذ العمليات.' : 'تم رفض الدعوة.'
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // POS CARD BATCH / PRINT PAGES REQUESTS
    // ==========================================

    public function requestCardBatch(int $actorId, string $actorRole, array $data): array
    {
        $networkId = $this->activeNetworkId();
        $profileName = trim((string)($data['profile_name'] ?? ''));
        $pageCount = max(1, (int)($data['page_count'] ?? 1));
        $cardsPerPage = max(1, (int)($data['cards_per_page'] ?? 10));
        $paymentMethod = (string)($data['payment_method'] ?? 'credit_balance');
        $notes = trim((string)($data['notes'] ?? ''));

        if (empty($profileName)) throw new InvalidArgumentException('PROFILE_REQUIRED');

        // Look up profile retail price
        $profStmt = $this->db->prepare("SELECT * FROM um_profiles_def WHERE network_id = ? AND name = ? LIMIT 1");
        $profStmt->execute([$networkId, $profileName]);
        $prof = $profStmt->fetch(PDO::FETCH_ASSOC);
        $cardPrice = (float)($prof['retail_price'] ?? ($prof['price'] ?? 0));
        if ($cardPrice <= 0) $cardPrice = (float)($data['card_price'] ?? 100);

        $totalCards = $pageCount * $cardsPerPage;
        $totalAmount = round($totalCards * $cardPrice, 2);

        // Fetch POS discount rate
        $admin = $this->admin($actorId);
        $discountRate = (float)($admin['discount_rate'] ?? 0);
        $discountAmount = round($totalAmount * ($discountRate / 100), 2);
        $netAmount = round($totalAmount - $discountAmount, 2);

        $requestNo = 'CARD-REQ-' . date('YmdHis') . '-' . random_int(100, 999);

        $ins = $this->db->prepare("INSERT INTO um_pos_card_requests (request_no, network_id, pos_admin_id, profile_name, card_price, page_count, cards_per_page, total_cards, total_amount, discount_rate, net_amount, payment_method, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
        $ins->execute([$requestNo, $networkId, $actorId, $profileName, $cardPrice, $pageCount, $cardsPerPage, $totalCards, $totalAmount, $discountRate, $netAmount, $paymentMethod, $notes ?: null]);
        $reqId = (int)$this->db->lastInsertId();

        // Notify Network Manager
        $msg = "طلب طباعة كروت جديد (#{$requestNo}): {$totalCards} كرت (باقة: {$profileName}) لنقطة البيع {$admin['fullname']} بقيمة صافية: " . number_format($netAmount, 2) . " ر.ي";
        $this->notify('card_request', "🎟️ طلب كروت جديد من نقطة بيع", $msg, 'admin', null, [
            'card_request_id' => $reqId,
            'pos_admin_id' => $actorId,
            'network_id' => $networkId
        ]);

        return [
            'success' => true,
            'message' => 'تم إرسال طلب طباعة الكروت بنجاح! سيتم إشعارك فور اعتماد الطلب وتوليد الكروت.',
            'request_id' => $reqId,
            'request_no' => $requestNo,
            'total_cards' => $totalCards,
            'net_amount' => $netAmount
        ];
    }

    public function getPosCardRequests(int $actorId, string $actorRole): array
    {
        $networkId = $this->activeNetworkId();
        $stmt = $this->db->prepare("SELECT r.*, p.name_for_users FROM um_pos_card_requests r LEFT JOIN um_profiles_def p ON p.network_id = r.network_id AND p.name = r.profile_name WHERE r.pos_admin_id = ? AND r.network_id = ? ORDER BY r.id DESC LIMIT 50");
        $stmt->execute([$actorId, $networkId]);
        $requests = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'requests' => $requests
        ];
    }

    // ==========================================
    // NETWORK MANAGER / ADMIN REVIEW POS REQUESTS
    // ==========================================

    public function adminGetPosRequests(int $actorId, string $actorRole): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $stmt = $this->db->prepare("SELECT r.*, a.fullname AS agent_name, a.username AS agent_username, a.phone AS agent_phone
                                    FROM um_pos_network_requests r
                                    LEFT JOIN um_admins a ON a.id = r.pos_admin_id
                                    WHERE r.network_id = ?
                                    ORDER BY r.id DESC LIMIT 50");
        $stmt->execute([$networkId]);
        $requests = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'requests' => $requests
        ];
    }

    public function adminReviewPosRequest(int $actorId, string $actorRole, array $data): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $requestId = (int)($data['request_id'] ?? 0);
        $decision = (string)($data['decision'] ?? ''); // 'approved' | 'rejected'
        $discountRate = max(0, min(100, (float)($data['discount_rate'] ?? 0)));
        $creditLimit = max(0, (float)($data['credit_limit'] ?? 0));
        $openingDebt = max(0, (float)($data['opening_debt'] ?? 0));
        $openingBalance = max(0, (float)($data['opening_balance'] ?? 0));
        $notes = trim((string)($data['notes'] ?? ''));

        $stmt = $this->db->prepare("SELECT * FROM um_pos_network_requests WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$requestId, $networkId]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req) throw new DomainException('REQUEST_NOT_FOUND');

        $posAdminId = (int)$req['pos_admin_id'];

        $this->db->beginTransaction();
        try {
            if ($decision === 'approved') {
                $upd = $this->db->prepare("UPDATE um_pos_network_requests SET status = 'approved', discount_rate = ?, credit_limit = ?, opening_debt = ?, opening_balance = ?, reviewed_by_admin_id = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?");
                $upd->execute([$discountRate, $creditLimit, $openingDebt, $openingBalance, $actorId, $notes ?: null, $requestId]);

                if ($posAdminId > 0) {
                    // Update POS discount rate in um_admins
                    $this->db->prepare("UPDATE um_admins SET discount_rate = ? WHERE id = ?")->execute([$discountRate, $posAdminId]);

                    // Grant network access
                    $this->db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (?, ?, 'agent', 0, 1, ?) ON DUPLICATE KEY UPDATE is_active = 1")->execute([$posAdminId, $networkId, $actorId]);

                    $this->db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, data_scope, is_active, assigned_by_admin_id) VALUES (?, ?, 'pos_agent', 'network', 1, ?) ON DUPLICATE KEY UPDATE is_active = 1")->execute([$posAdminId, $networkId, $actorId]);

                    $this->db->prepare("INSERT INTO um_pos_network_assignments (pos_admin_id, network_id, is_primary, assigned_by_admin_id) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE is_primary = is_primary")->execute([$posAdminId, $networkId, $actorId]);

                    $this->db->prepare("INSERT INTO um_admin_network_balances (admin_id, network_id, balance, credit_limit, currency_code) VALUES (?, ?, ?, ?, 'YER_SANAA') ON DUPLICATE KEY UPDATE credit_limit = ?")->execute([$posAdminId, $networkId, 0.0, $creditLimit, $creditLimit]);

                    if ($openingDebt > 0 || $openingBalance > 0) {
                        require_once __DIR__ . '/FinancialAccountingService.php';
                        $faService = new FinancialAccountingService($this->db);
                        if ($openingDebt > 0) {
                            $faService->setAccountOpeningBalance([
                                'admin_id' => $posAdminId,
                                'amount' => $openingDebt,
                                'balance_type' => 'debt',
                                'notes' => 'مديونية سابقة مثبتة عند اعتماد نقطة البيع'
                            ], $actorId);
                        }
                        if ($openingBalance > 0) {
                            $faService->setAccountOpeningBalance([
                                'admin_id' => $posAdminId,
                                'amount' => $openingBalance,
                                'balance_type' => 'credit',
                                'notes' => 'رصيد افتتاحي عند اعتماد نقطة البيع'
                            ], $actorId);
                        }
                    }

                    // Send notification to POS
                    $this->notify('pos_request', '🎉 تم قبول واعتماد نقطة البيع بنجاح', "تمت الموافقة على طلب اعتماد نقطة البيع الخاصة بك في الشبكة. نسبة الخصم: {$discountRate}% والحد الائتماني: " . number_format($creditLimit, 2) . " ر.ي", null, $posAdminId, [
                        'network_id' => $networkId,
                        'status' => 'approved'
                    ]);
                }
            } else {
                $upd = $this->db->prepare("UPDATE um_pos_network_requests SET status = 'rejected', reviewed_by_admin_id = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?");
                $upd->execute([$actorId, $notes ?: 'تم رفض الطلب', $requestId]);

                if ($posAdminId > 0) {
                    $this->notify('pos_request', 'تم رفض طلب الانضمام للشبكة', "نعتذر، تم رفض طلب اعتماد نقطة البيع من قبل إدارة الشبكة. ملاحظات: " . ($notes ?: '—'), null, $posAdminId, [
                        'network_id' => $networkId,
                        'status' => 'rejected'
                    ]);
                }
            }

            $this->db->commit();
            return ['success' => true, 'message' => $decision === 'approved' ? 'تمت الموافقة على طلب نقطة البيع بنجاح وتفعيل الربط.' : 'تم رفض الطلب.'];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function adminInvitePosAgent(int $actorId, string $actorRole, array $data): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'distributor', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $fullname = trim((string)($data['fullname'] ?? ''));
        $shopName = trim((string)($data['shop_name'] ?? ''));
        $phoneInput = trim((string)($data['phone'] ?? ''));
        $openingDebt = max(0, (float)($data['opening_debt'] ?? 0));
        $openingBalance = max(0, (float)($data['opening_balance'] ?? 0));
        $discountRate = max(0, min(100, (float)($data['discount_rate'] ?? 0)));
        $creditLimit = max(0, (float)($data['credit_limit'] ?? 0));
        $notes = trim((string)($data['notes'] ?? ''));

        if (empty($fullname) || empty($phoneInput)) {
            throw new InvalidArgumentException('FULLNAME_AND_PHONE_REQUIRED');
        }

        require_once __DIR__ . '/WhatsAppService.php';
        $phone = WhatsAppService::normalizePhone($phoneInput);

        // Check if admin already exists with this phone
        $chkAdm = $this->db->prepare("SELECT id, username, fullname FROM um_admins WHERE phone = ? LIMIT 1");
        $chkAdm->execute([$phone]);
        $existingAdmin = $chkAdm->fetch(PDO::FETCH_ASSOC);

        $posAdminId = $existingAdmin ? (int)$existingAdmin['id'] : 0;

        $requestNo = 'POS-INV-' . date('YmdHis') . '-' . random_int(100, 999);

        // Insert invitation into um_pos_network_requests with is_confirmed_by_pos = 0
        $ins = $this->db->prepare("INSERT INTO um_pos_network_requests (request_no, pos_admin_id, network_id, shop_name, phone, location_notes, status, discount_rate, credit_limit, opening_debt, opening_balance, is_confirmed_by_pos, initiated_by, reviewed_by_admin_id, reviewed_at, review_notes) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, 0, 'network_manager', ?, NOW(), ?)");
        $ins->execute([$requestNo, $posAdminId, $networkId, $shopName ?: null, $phone, $notes ?: null, $discountRate, $creditLimit, $openingDebt, $openingBalance, $actorId, 'دعوة مباشرة من مدير الشبكة']);
        $reqId = (int)$this->db->lastInsertId();

        if ($posAdminId > 0 && ($openingDebt > 0 || $openingBalance > 0)) {
            require_once __DIR__ . '/FinancialAccountingService.php';
            $faService = new FinancialAccountingService($this->db);
            if ($openingDebt > 0) {
                $faService->setAccountOpeningBalance([
                    'admin_id' => $posAdminId,
                    'amount' => $openingDebt,
                    'balance_type' => 'debt',
                    'notes' => 'مديونية سابقة مثبتة عند إرسال الدعوة لنقطة البيع'
                ], $actorId);
            }
            if ($openingBalance > 0) {
                $faService->setAccountOpeningBalance([
                    'admin_id' => $posAdminId,
                    'amount' => $openingBalance,
                    'balance_type' => 'credit',
                    'notes' => 'رصيد افتتاحي مثبت عند إرسال الدعوة لنقطة البيع'
                ], $actorId);
            }
        }

        // Send WhatsApp Invitation to POS Phone
        $netName = $this->db->query("SELECT name FROM um_networks WHERE id = {$networkId}")->fetchColumn() ?: 'الشبكة';
        try {
            $waMsg = "🏪 *دعوة اعتماد نقطة بيع جديدة - شبكة {$netName}*\n\n"
                   . "مرحباً بك *" . $fullname . "*،\n"
                   . "تمت إضافتك كنقطة بيع معتمدة لدى *{$netName}*.\n"
                   . "📌 *البيانات المسجلة:*\n"
                   . "- نسبة الخصم: {$discountRate}%\n"
                   . "- الحد الائتماني: " . number_format($creditLimit, 2) . " ر.ي\n"
                   . ($openingDebt > 0 ? "- المديونية السابقة المثبتة: " . number_format($openingDebt, 2) . " ر.ي\n" : "")
                   . ($openingBalance > 0 ? "- الرصيد الافتتاحي: " . number_format($openingBalance, 2) . " ر.ي\n" : "")
                   . "\nيرجى تسجيل الدخول أو إنشاء حسابك لتأكيد البيانات وتفعيل نقطة البيع.";
            $wa = new WhatsAppService($this->db, null, $networkId);
            $wa->sendMessage($phone, $waMsg, 'pos_invite_' . $reqId);
        } catch (Throwable $e) {}

        return [
            'success' => true,
            'message' => 'تمت إضافة ودعوة نقطة البيع بنجاح! تم إرسال رسالة واتساب لتأكيد البيانات والمديونية.',
            'request_id' => $reqId,
            'request_no' => $requestNo
        ];
    }

    public function adminGetCardRequests(int $actorId, string $actorRole): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $stmt = $this->db->prepare("SELECT r.*, a.fullname AS pos_name, a.phone AS pos_phone, p.name_for_users
                                    FROM um_pos_card_requests r
                                    JOIN um_admins a ON a.id = r.pos_admin_id
                                    LEFT JOIN um_profiles_def p ON p.network_id = r.network_id AND p.name = r.profile_name
                                    WHERE r.network_id = ?
                                    ORDER BY r.id DESC LIMIT 50");
        $stmt->execute([$networkId]);
        $requests = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'requests' => $requests
        ];
    }

    public function adminReviewCardRequest(int $actorId, string $actorRole, array $data, ?RadiusService $radService = null): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $requestId = (int)($data['request_id'] ?? 0);
        $decision = (string)($data['decision'] ?? ''); // 'approved' | 'rejected'
        $reviewNotes = trim((string)($data['review_notes'] ?? ''));

        $stmt = $this->db->prepare("SELECT * FROM um_pos_card_requests WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$requestId, $networkId]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req || $req['status'] !== 'pending') {
            throw new DomainException('REQUEST_NOT_PENDING');
        }

        $posAdminId = (int)$req['pos_admin_id'];
        $totalCards = (int)$req['total_cards'];
        $profileName = $req['profile_name'];
        $cardPrice = (float)$req['card_price'];

        $this->db->beginTransaction();
        try {
            if ($decision === 'approved') {
                // Auto generate cards for this POS agent
                $batchComment = 'طلب كروت نقطة بيع #' . $req['request_no'];
                $sheetNo = 'POS-SHT-' . date('ymd-His');

                for ($i = 0; $i < $totalCards; $i++) {
                    $voucherCode = random_int(10000000, 99999999);
                    $voucherPass = random_int(1000, 9999);

                    // Insert to radcheck
                    $insRc = $this->db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, 'Cleartext-Password', ':=', ?)");
                    $insRc->execute([$networkId, (string)$voucherCode, (string)$voucherPass]);

                    // Insert to radusergroup
                    $insGrp = $this->db->prepare("INSERT INTO radusergroup (network_id, username, groupname, priority) VALUES (?, ?, ?, 1)");
                    $insGrp->execute([$networkId, (string)$voucherCode, $profileName]);

                    // Insert to um_vouchers_meta
                    $insVm = $this->db->prepare("INSERT INTO um_vouchers_meta (network_id, username, profile_name, price, sale_price, sheet_no, comment, status, is_sold, owner_admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, NOW())");
                    $insVm->execute([$networkId, (string)$voucherCode, $profileName, $cardPrice, $cardPrice, $sheetNo, $batchComment, $posAdminId]);
                }

                $upd = $this->db->prepare("UPDATE um_pos_card_requests SET status = 'generated', reviewed_by_admin_id = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?");
                $upd->execute([$actorId, $reviewNotes ?: 'تم توليد الكروت في عهدة نقطة البيع', $requestId]);

                // Notify POS agent
                $this->notify('card_request', '🎟️ تم توليد طلب الكروت بنجاح', "تم اعتماد طلبك رقم {$req['request_no']} وتوليد {$totalCards} كرت (باقة: {$profileName}) في عهدتك جاهزة للطباعة والبيع.", null, $posAdminId, [
                    'card_request_id' => $requestId,
                    'network_id' => $networkId,
                    'status' => 'generated'
                ]);

            } else {
                $upd = $this->db->prepare("UPDATE um_pos_card_requests SET status = 'rejected', reviewed_by_admin_id = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?");
                $upd->execute([$actorId, $reviewNotes ?: 'تم رفض الطلب', $requestId]);

                $this->notify('card_request', 'تم رفض طلب الكروت', "تم رفض طلب الكروت رقم {$req['request_no']}. ملاحظات: " . ($reviewNotes ?: '—'), null, $posAdminId, [
                    'card_request_id' => $requestId,
                    'network_id' => $networkId,
                    'status' => 'rejected'
                ]);
            }

            $this->db->commit();
            return [
                'success' => true,
                'message' => $decision === 'approved' ? 'تم اعتماد الطلب وتوليد الكروت في عهدة نقطة البيع بنجاح!' : 'تم رفض الطلب.'
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // CUSTOMER / SUBSCRIBER PORTAL & REQUESTS
    // ==========================================

    public function customerGetPortalData(string $phoneOrUser, ?int $networkId = null): array
    {
        require_once __DIR__ . '/WhatsAppService.php';
        $phoneOrUser = trim($phoneOrUser);
        if (empty($phoneOrUser)) {
            return ['success' => false, 'error' => 'PHONE_REQUIRED'];
        }
        $normPhone = WhatsAppService::normalizePhone($phoneOrUser);
        $searchKey = $normPhone ?: $phoneOrUser;

        // 1. Customer Identity
        $idStmt = $this->db->prepare("SELECT * FROM um_customer_identities WHERE phone = ? OR central_customer_key = ? LIMIT 1");
        $idStmt->execute([$searchKey, $phoneOrUser]);
        $customer = $idStmt->fetch(PDO::FETCH_ASSOC);

        // 2. Active Vouchers belonging to this phone or username
        $vouchersSql = "SELECT v.username, v.profile_name, v.price, v.status, v.created_at, v.sold_at, v.first_login,
                               n.name AS network_name, n.code AS network_code, rc.value AS password_pin
                        FROM um_vouchers_meta v
                        JOIN um_networks n ON n.id = v.network_id
                        LEFT JOIN radcheck rc ON rc.network_id = v.network_id AND rc.username = v.username AND rc.attribute = 'Cleartext-Password'
                        WHERE (v.comment LIKE ? OR v.username = ? OR v.username = ?) " . ($networkId ? "AND v.network_id = " . (int)$networkId : "") . "
                        ORDER BY v.id DESC LIMIT 30";
        $vStmt = $this->db->prepare($vouchersSql);
        $vStmt->execute(['%' . $searchKey . '%', $searchKey, $phoneOrUser]);
        $vouchers = $vStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // 3. Network Memberships & Balances / Debts
        $memberships = [];
        if ($customer) {
            $memSql = "SELECT m.*, n.name AS network_name, n.code AS network_code, n.theme_color
                       FROM um_customer_network_memberships m
                       JOIN um_networks n ON n.id = m.network_id
                       WHERE m.customer_id = ? " . ($networkId ? "AND m.network_id = " . (int)$networkId : "");
            $mStmt = $this->db->prepare($memSql);
            $mStmt->execute([(int)$customer['id']]);
            $memberships = $mStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        // Totals
        $totalBalance = !empty($memberships) ? array_sum(array_map(fn($m) => (float)$m['balance'], $memberships)) : 0;
        $totalDebt = !empty($memberships) ? array_sum(array_map(fn($m) => (float)$m['debt'], $memberships)) : 0;

        // 4. Available profiles for purchasing cards
        $profSql = "SELECT p.name, p.name_for_users, p.retail_price, p.price, p.uptime_limit, p.transfer_limit, p.network_id, n.name AS network_name
                    FROM um_profiles_def p
                    JOIN um_networks n ON n.id = p.network_id
                    WHERE n.status = 'active' " . ($networkId ? "AND p.network_id = " . (int)$networkId : "") . "
                    ORDER BY p.network_id, COALESCE(p.retail_price, p.price) ASC";
        $profiles = $this->db->query($profSql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // 5. Recent Customer Requests
        $reqSql = "SELECT r.*, n.name AS network_name
                   FROM um_customer_requests r
                   JOIN um_networks n ON n.id = r.network_id
                   WHERE (r.phone = ? OR r.phone = ?) " . ($networkId ? "AND r.network_id = " . (int)$networkId : "") . "
                   ORDER BY r.id DESC LIMIT 20";
        $rStmt = $this->db->prepare($reqSql);
        $rStmt->execute([$searchKey, $phoneOrUser]);
        $requests = $rStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'customer' => $customer ?: [
                'display_name' => 'مشترك',
                'phone' => $searchKey
            ],
            'vouchers' => $vouchers,
            'memberships' => $memberships,
            'financials' => [
                'total_balance' => $totalBalance,
                'total_debt' => $totalDebt,
                'net_balance' => $totalBalance - $totalDebt
            ],
            'available_profiles' => $profiles,
            'requests' => $requests
        ];
    }

    public function customerSubmitRequest(array $data): array
    {
        require_once __DIR__ . '/WhatsAppService.php';
        $phoneInput = trim((string)($data['phone'] ?? ''));
        $normPhone = WhatsAppService::normalizePhone($phoneInput);
        if (empty($normPhone)) throw new InvalidArgumentException('PHONE_REQUIRED');

        $networkId = (int)($data['network_id'] ?? 1);
        $requestType = (string)($data['request_type'] ?? 'voucher_purchase'); // 'voucher_purchase' | 'balance_topup'
        $customerName = trim((string)($data['customer_name'] ?? 'مشترك'));
        $profileName = trim((string)($data['profile_name'] ?? ''));
        $amount = (float)($data['amount'] ?? 0);
        $paymentMethod = trim((string)($data['payment_method'] ?? 'cash'));
        $paymentRef = trim((string)($data['payment_reference'] ?? ''));
        $notes = trim((string)($data['notes'] ?? ''));

        $requestNo = 'CUST-REQ-' . date('YmdHis') . '-' . random_int(100, 999);

        $ins = $this->db->prepare("INSERT INTO um_customer_requests (request_no, phone, customer_name, network_id, request_type, profile_name, requested_amount, payment_method, payment_reference, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
        $ins->execute([$requestNo, $normPhone, $customerName, $networkId, $requestType, $profileName ?: null, $amount, $paymentMethod, $paymentRef ?: null, $notes ?: null]);
        $reqId = (int)$this->db->lastInsertId();

        // Notify Network Manager
        $msg = "طلب عميل جديد (#{$requestNo}): " . ($requestType === 'voucher_purchase' ? "شراء كرت باقة ({$profileName})" : "شحن رصيد ({$amount} ر.ي)") . " للعميل {$customerName} ({$normPhone})";
        $this->notify('customer_request', "👤 طلب جديد من مشترك", $msg, 'admin', null, [
            'customer_request_id' => $reqId,
            'phone' => $normPhone,
            'network_id' => $networkId
        ]);

        return [
            'success' => true,
            'message' => 'تم استلام طلبك بنجاح! سيصلك إشعار بالكرت أو الرصيد فور اعتماده.',
            'request_id' => $reqId,
            'request_no' => $requestNo
        ];
    }

    public function adminGetCustomerRequests(int $actorId, string $actorRole): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'distributor', 'pos_agent', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $stmt = $this->db->prepare("SELECT r.*, n.name AS network_name FROM um_customer_requests r JOIN um_networks n ON n.id = r.network_id WHERE r.network_id = ? ORDER BY r.id DESC LIMIT 50");
        $stmt->execute([$networkId]);
        $requests = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return [
            'success' => true,
            'requests' => $requests
        ];
    }

    public function adminReviewCustomerRequest(int $actorId, string $actorRole, array $data): array
    {
        $networkId = $this->activeNetworkId();
        if (!in_array($actorRole, ['system_owner', 'superadmin', 'superadmin', 'distributor', 'pos_agent', 'network_manager', 'admin'], true)) {
            throw new DomainException('FORBIDDEN');
        }

        $requestId = (int)($data['request_id'] ?? 0);
        $decision = (string)($data['decision'] ?? ''); // 'approved' | 'rejected'
        $notes = trim((string)($data['notes'] ?? ''));

        $stmt = $this->db->prepare("SELECT * FROM um_customer_requests WHERE id = ? AND network_id = ? LIMIT 1");
        $stmt->execute([$requestId, $networkId]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req || $req['status'] !== 'pending') {
            throw new DomainException('REQUEST_NOT_PENDING');
        }

        $phone = $req['phone'];
        $requestType = $req['request_type'];
        $profileName = $req['profile_name'];
        $amount = (float)$req['requested_amount'];

        $this->db->beginTransaction();
        try {
            if ($decision === 'approved') {
                $voucherUser = null;
                $voucherPass = null;

                if ($requestType === 'voucher_purchase') {
                    // Try to pick an available unsold voucher for this profile or generate a fresh one
                    $pickStmt = $this->db->prepare("SELECT username FROM um_vouchers_meta WHERE network_id = ? AND profile_name = ? AND is_sold = 0 AND status = 'active' LIMIT 1 FOR UPDATE");
                    $pickStmt->execute([$networkId, $profileName]);
                    $existingCode = $pickStmt->fetchColumn();

                    if ($existingCode) {
                        $voucherUser = (string)$existingCode;
                        $passStmt = $this->db->prepare("SELECT value FROM radcheck WHERE network_id = ? AND username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
                        $passStmt->execute([$networkId, $voucherUser]);
                        $voucherPass = (string)$passStmt->fetchColumn();

                        // Mark as sold
                        $this->db->prepare("UPDATE um_vouchers_meta SET is_sold = 1, sold_at = NOW(), sold_by_admin_id = ?, comment = ? WHERE network_id = ? AND username = ?")->execute([$actorId, 'بيع للمشترك: ' . $phone, $networkId, $voucherUser]);
                    } else {
                        // Generate a fresh voucher
                        $voucherUser = (string)random_int(10000000, 99999999);
                        $voucherPass = (string)random_int(1000, 9999);

                        $this->db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, 'Cleartext-Password', ':=', ?)")->execute([$networkId, $voucherUser, $voucherPass]);
                        $this->db->prepare("INSERT INTO radusergroup (network_id, username, groupname, priority) VALUES (?, ?, ?, 1)")->execute([$networkId, $voucherUser, $profileName]);
                        $this->db->prepare("INSERT INTO um_vouchers_meta (network_id, username, profile_name, price, sale_price, status, is_sold, sold_at, sold_by_admin_id, comment, created_at) VALUES (?, ?, ?, ?, ?, 'active', 1, NOW(), ?, ?, NOW())")->execute([$networkId, $voucherUser, $profileName, $amount, $amount, $actorId, 'طلب شراء كرت: ' . $phone]);
                    }

                    $upd = $this->db->prepare("UPDATE um_customer_requests SET status = 'completed', voucher_username = ?, voucher_password = ?, reviewed_by_admin_id = ?, reviewed_at = NOW(), notes = ? WHERE id = ?");
                    $upd->execute([$voucherUser, $voucherPass, $actorId, $notes ?: null, $requestId]);

                    // Send WhatsApp with Voucher credentials
                    try {
                        require_once __DIR__ . '/WhatsAppService.php';
                        $netName = $this->db->query("SELECT name FROM um_networks WHERE id = {$networkId}")->fetchColumn() ?: 'الشبكة';
                        $waMsg = "🎟️ *تم تسليم كرت الإنترنت الخاص بك - شبكة {$netName}*\n\n"
                               . "👤 *اسم المستخدم / الكرت:* `{$voucherUser}`\n"
                               . "🔑 *كلمة المرور / الرمز:* `{$voucherPass}`\n"
                               . "📦 *الباقة:* {$profileName}\n\n"
                               . "نتمنى لك تصفحاً ممتعاً وسريعاً!";
                        $wa = new WhatsAppService($this->db, null, $networkId);
                        $wa->sendMessage($phone, $waMsg, 'voucher_deliv_' . $requestId);
                    } catch (Throwable $e) {}

                } else {
                    // Balance top-up
                    $upd = $this->db->prepare("UPDATE um_customer_requests SET status = 'completed', reviewed_by_admin_id = ?, reviewed_at = NOW(), notes = ? WHERE id = ?");
                    $upd->execute([$actorId, $notes ?: null, $requestId]);

                    // Send WhatsApp confirmation
                    try {
                        require_once __DIR__ . '/WhatsAppService.php';
                        $waMsg = "💰 *تم شحن رصيد حسابك بنجاح*\n\n"
                               . "تم إضافة مبلغ: *" . number_format($amount, 2) . " ر.ي* إلى حسابك بنجاح.";
                        $wa = new WhatsAppService($this->db, null, $networkId);
                        $wa->sendMessage($phone, $waMsg, 'topup_deliv_' . $requestId);
                    } catch (Throwable $e) {}
                }

            } else {
                $upd = $this->db->prepare("UPDATE um_customer_requests SET status = 'rejected', reviewed_by_admin_id = ?, reviewed_at = NOW(), notes = ? WHERE id = ?");
                $upd->execute([$actorId, $notes ?: 'تم رفض الطلب', $requestId]);
            }

            $this->db->commit();
            return [
                'success' => true,
                'message' => $decision === 'approved' ? 'تم اعتماد الطلب وتسليمه بنجاح!' : 'تم رفض الطلب.'
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
}
