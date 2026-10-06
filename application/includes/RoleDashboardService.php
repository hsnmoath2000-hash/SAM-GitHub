<?php
declare(strict_types=1);

/** Fast, session-scoped dashboard payload; never trusts client role/admin ids. */
final class RoleDashboardService
{
    public function __construct(private PDO $db, private ?RadiusService $radius = null) {}

    public function summary(int $adminId, string $ignoredRole = '', array $permissions = []): array
    {
        $networkId=$this->activeNetworkId();
        $admin = $this->admin($adminId);
        if (!$admin || !(int)$admin['is_active']) throw new DomainException('ACCOUNT_DISABLED');
        $role = (string)$admin['role'];
        $global = in_array($role, ['system_owner','superadmin','admin','superadmin'], true);
        $m = $this->baseMetrics($adminId, $global, $admin);
        $payload = [
            'success'=>true,
            'generated_at'=>date(DATE_ATOM),
            'active_network_id'=>$networkId,
            'actor'=>[
                'admin_id'=>$adminId,'fullname'=>(string)$admin['fullname'],'role'=>$role,
                'role_name'=>(string)($admin['role_name_ar'] ?: $role),
                'data_scope'=>(string)($admin['data_scope'] ?: 'own'),
                'permissions'=>array_values($permissions),
            ],
            'metrics'=>$m,
            'trend'=>$this->salesTrend($adminId, $global),
            'activities'=>$this->recentActivities($adminId, $global),
            'network'=>$this->networkMetrics($global || in_array($role,['supervisor','maintenance','technician','main_node_owner','sub_node_owner','regular_node_owner'],true), $role==='system_owner'),
        ];
        if (in_array($role, ['maintenance','technician'], true)) $payload['maintenance'] = $this->maintenance($adminId);
        if ($role === 'partner') $payload['partner'] = $this->partner($adminId);
        if (in_array($role,['main_node_owner','sub_node_owner','regular_node_owner'],true)) $payload['node'] = $this->node($adminId);
        return $payload;
    }

    private function baseMetrics(int $id, bool $global, array $admin): array
    {
        $n=$this->activeNetworkId();
        $wallet = $this->nullableScalar('SELECT balance FROM um_agent_wallets WHERE admin_id=? AND network_id=?',[$id,$n]);
        $scopeInvoices = $global ? ' WHERE network_id=?' : ' WHERE network_id=? AND (buyer_id=? OR seller_id=?)';
        $salesParams = $global ? [$n] : [$n,$id];
        $invoiceParams = $global ? [$n] : [$n,$id,$id];
        $debt = (float)$this->scalar($global
            ? "SELECT COALESCE(SUM(remaining_amount),0) FROM um_sales_invoices WHERE network_id=? AND invoice_status='completed'"
            : "SELECT COALESCE(SUM(remaining_amount),0) FROM um_sales_invoices WHERE network_id=? AND buyer_id=? AND invoice_status='completed'", $global?[$n]:[$n,$id]);
        $vWhere = $global ? '' : ' AND (created_by=? OR party_id=?)';
        $vParams = $global ? [$n] : [$n,$id,$id];
        return [
            'account_balance'=>(float)$admin['balance'],
            'wallet_balance'=>(float)($wallet ?? 0),
            'available_balance'=>(float)($wallet ?? $admin['balance']),
            'debt'=>$debt,
            'credit_limit'=>(float)$admin['credit_limit'],
            'credit_available'=>max(0,(float)$admin['credit_limit']-$debt),
            'cashbox_balance'=>$global ? (float)$this->scalar('SELECT COALESCE(SUM(cashbox_impact),0) FROM um_financial_transactions WHERE network_id=?',[$n]) : (float)$admin['balance'],
            'today_sales'=>(float)$this->scalar('SELECT COALESCE(SUM(total_amount),0) FROM um_sales_invoices WHERE network_id=?'.($global?' AND':' AND seller_id=? AND').' DATE(created_at)=CURDATE()', $salesParams),
            'today_receipts'=>(float)$this->scalar("SELECT COALESCE(SUM(CASE WHEN voucher_type='receipt' THEN amount ELSE 0 END),0) FROM um_vouchers_financial WHERE network_id=? AND DATE(created_at)=CURDATE(){$vWhere}",$vParams),
            'today_payments'=>(float)$this->scalar("SELECT COALESCE(SUM(CASE WHEN voucher_type='payment' THEN amount ELSE 0 END),0) FROM um_vouchers_financial WHERE network_id=? AND DATE(created_at)=CURDATE(){$vWhere}",$vParams),
            'today_invoices'=>(int)$this->scalar('SELECT COUNT(*) FROM um_sales_invoices WHERE network_id=?'.($global?' AND':' AND (buyer_id=? OR seller_id=?) AND').' DATE(created_at)=CURDATE()',$invoiceParams),
            'total_invoices'=>(int)$this->scalar('SELECT COUNT(*) FROM um_sales_invoices'.$scopeInvoices,$invoiceParams),
            'warehouse_stock'=>(int)$this->scalar($global
                ? "SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND is_sold=0 AND status='active' AND (expires_at IS NULL OR expires_at>NOW())"
                : "SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND owner_admin_id=? AND is_sold=0 AND status='active' AND (expires_at IS NULL OR expires_at>NOW())",$global?[$n]:[$n,$id]),
            'active_sessions'=>$global ? (int)$this->scalar('SELECT COUNT(*) FROM radacct WHERE network_id=? AND acctstoptime IS NULL',[$n]) : 0,
            'instant_balance'=>(float)$this->scalar("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW())",[$n,$id]),
            'children_count'=>(int)$this->scalar('SELECT COUNT(*) FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 WHERE a.parent_id=? AND a.is_active=1',[$n,$id]),
            'free_cards_used'=>(int)$this->scalar('SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND free_recipient_id=? AND is_free_quota=1',[$n,$id]),
            'free_cards_quota'=>(int)$admin['free_cards_quota'],
        ];
    }

    private function admin(int $id): array|false
    {
        $n=$this->activeNetworkId();$s=$this->db->prepare('SELECT a.id,a.fullname,COALESCE(nr.role_key,a.role) role,COALESCE(nr.data_scope,a.data_scope) data_scope,COALESCE(nb.balance,0) balance,COALESCE(nb.credit_limit,a.credit_limit) credit_limit,a.free_cards_quota,a.is_active,r.role_name_ar FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id AND nx.network_id=? AND nx.is_active=1 LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1 LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=? LEFT JOIN um_roles_def r ON r.role_key=COALESCE(nr.role_key,a.role) WHERE a.id=? LIMIT 1');
        $s->execute([$n,$n,$n,$id]); return $s->fetch(PDO::FETCH_ASSOC);
    }

    private function salesTrend(int $id,bool $global): array
    {
        $sql="SELECT DATE(created_at) day,COALESCE(SUM(total_amount),0) sales,COALESCE(SUM(remaining_amount),0) credit FROM um_sales_invoices WHERE network_id=? AND created_at>=CURDATE()-INTERVAL 6 DAY".($global?'':' AND seller_id=?')." GROUP BY DATE(created_at)";
        $s=$this->db->prepare($sql); $s->execute($global?[$this->activeNetworkId()]:[$this->activeNetworkId(),$id]); $map=[];
        foreach($s->fetchAll(PDO::FETCH_ASSOC) as $r)$map[$r['day']]=$r;
        $out=[]; for($i=6;$i>=0;$i--){$day=date('Y-m-d',strtotime("-{$i} days"));$out[]=['day'=>$day,'sales'=>(float)($map[$day]['sales']??0),'credit'=>(float)($map[$day]['credit']??0)];} return $out;
    }

    private function recentActivities(int $id,bool $global): array
    {
        $sql='SELECT action_title,action_category,status,created_at FROM um_activity_logs WHERE network_id=?'.($global?'':' AND admin_id=?').' ORDER BY id DESC LIMIT 6';
        $s=$this->db->prepare($sql);$s->execute($global?[$this->activeNetworkId()]:[$this->activeNetworkId(),$id]);return $s->fetchAll(PDO::FETCH_ASSOC);
    }

    private function networkMetrics(bool $allowed, bool $isSystemOwner = false): array
    {
        if(!$allowed)return ['radius_status'=>'hidden','total_networks'=>0,'total_routers'=>0,'active_routers'=>0,'total_assets'=>0,'online_assets'=>0,'offline_assets'=>0];
        $totalNets = $isSystemOwner ? (int)$this->scalar('SELECT COUNT(*) FROM um_networks WHERE is_active=1') : 1;
        return [
            'radius_status'=>'running',
            'total_networks'=>$totalNets,
            'total_routers'=>(int)$this->scalar('SELECT COUNT(*) FROM nas WHERE network_id=?',[$this->activeNetworkId()]),
            'active_routers'=>(int)$this->scalar('SELECT COUNT(DISTINCT nasipaddress) FROM radacct WHERE network_id=? AND acctstoptime IS NULL',[$this->activeNetworkId()]),
            'total_assets'=>(int)$this->scalar('SELECT COUNT(*) FROM um_assets WHERE network_id=?',[$this->activeNetworkId()]),
            'online_assets'=>(int)$this->scalar("SELECT COUNT(*) FROM um_assets WHERE network_id=? AND status='in_service'",[$this->activeNetworkId()]),
            'offline_assets'=>(int)$this->scalar("SELECT COUNT(*) FROM um_assets WHERE network_id=? AND status IN ('damaged','retired')",[$this->activeNetworkId()]),
        ];
    }

    private function maintenance(int $id): array { $n=$this->activeNetworkId();return ['assigned_assets'=>(int)$this->scalar('SELECT COUNT(*) FROM um_assets WHERE network_id=? AND assigned_to_user_id=?',[$n,$id]),'under_maintenance'=>(int)$this->scalar("SELECT COUNT(*) FROM um_assets WHERE network_id=? AND assigned_to_user_id=? AND status='maintenance'",[$n,$id]),'assigned_nodes'=>(int)$this->scalar('SELECT COUNT(*) FROM um_network_nodes WHERE network_id=? AND responsible_admin_id=? AND is_active=1',[$n,$id])]; }
    private function partner(int $id): array { $n=$this->activeNetworkId();$s=$this->db->prepare('SELECT capital_amount,profit_share_percent,currency_code FROM um_partners_equity WHERE network_id=? AND admin_id=? LIMIT 1');$s->execute([$n,$id]);return $s->fetch(PDO::FETCH_ASSOC)?:['capital_amount'=>0,'profit_share_percent'=>0,'currency_code'=>'YER_SANAA']; }
    private function node(int $id): array { $network=$this->activeNetworkId();$s=$this->db->prepare('SELECT id,node_name,node_type,nas_ip,nas_port_id FROM um_network_nodes WHERE network_id=? AND responsible_admin_id=? AND is_active=1 ORDER BY id LIMIT 1');$s->execute([$network,$id]);$n=$s->fetch(PDO::FETCH_ASSOC)?:[];if($n){$n['assets_count']=(int)$this->scalar('SELECT COUNT(*) FROM um_assets WHERE network_id=? AND node_id=?',[$network,(int)$n['id']]);$n['active_sessions']=(int)$this->scalar('SELECT COUNT(*) FROM radacct WHERE network_id=? AND nasipaddress=? AND nasportid=? AND acctstoptime IS NULL',[$network,$n['nas_ip'],$n['nas_port_id']]);}return $n; }
    private function activeNetworkId(): int { $id=(int)($_SERVER['HTTP_X_SAM_NETWORK_ID']??($_SESSION['active_network_id']??0));if($id<=0)throw new DomainException('NETWORK_CONTEXT_REQUIRED');$this->db->exec('SET @sam_active_network_id='.$id);return $id; }
    private function nullableScalar(string $sql,array $p=[]): mixed { try{$s=$this->db->prepare($sql);$s->execute($p);$v=$s->fetchColumn();return $v===false?null:$v;}catch(Throwable){return null;} }
    private function scalar(string $sql,array $p=[]): int|float { try{$s=$this->db->prepare($sql);$s->execute($p);$v=$s->fetchColumn();return is_numeric($v)?$v+0:0;}catch(Throwable){return 0;} }
}
