<?php
declare(strict_types=1);
final class CommerceReadService {
 public function __construct(private PDO $db,private AuthorizationContext $auth){}
 private function net():int{$this->auth->assertCan(['wallet_sales','instant_balance','distributor_wallets','cashbox_accounts']);$net=$this->auth->activeNetworkId();if($net<=0||!$this->auth->canAccessNetwork($net))throw new DomainException('FORBIDDEN_NETWORK');return $net;}
 private function account(array $input):int{$id=(int)($input['admin_id']??$this->auth->id());$this->auth->assertCanAccessAdmin($id);return $id;}
 private function page(array $input):array{return [max(1,min(500,(int)($input['limit']??100))),max(0,(int)($input['before_id']??0))];}
 public function wallet(array $input=[]):array{
  $net=$this->net();$id=$this->account($input);[$limit,$before]=$this->page($input);
  $q=$this->db->prepare('SELECT a.id admin_id,a.fullname,a.username,COALESCE(w.balance,0) balance,w.updated_at FROM um_admins a LEFT JOIN um_agent_wallets w ON w.admin_id=a.id AND w.network_id=? WHERE a.id=?');$q->execute([$net,$id]);$wallet=$q->fetch(PDO::FETCH_ASSOC);if(!$wallet)throw new DomainException('FORBIDDEN_SCOPE');
  $sql='SELECT id,transaction_type,amount,balance_after,reference_type,reference_id,notes,created_at FROM um_wallet_transactions FORCE INDEX(idx_wallet_cursor) WHERE network_id=? AND admin_id=?';$params=[$net,$id];if($before>0){$sql.=' AND id<?';$params[]=$before;}$sql.=' ORDER BY id DESC LIMIT '.($limit+1);$q=$this->db->prepare($sql);$q->execute($params);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);
  return ['success'=>true,'wallet'=>$wallet,'transactions'=>$rows,'has_more'=>$more,'next_cursor'=>$rows?(int)end($rows)['id']:null,'limit'=>$limit,'read_only'=>true];
 }
 public function instant(array $input=[]):array{
  $net=$this->net();$id=$this->account($input);$q=$this->db->prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())");$q->execute([$net,$id]);return ['success'=>true,'admin_id'=>$id,'available'=>(string)$q->fetchColumn(),'read_only'=>true];
 }
 public function deliveries(array $input=[]):array{
  $net=$this->net();[$limit,$before]=$this->page($input);$index=(!$this->auth->isGlobal()||isset($input['admin_id']))?'idx_paid_delivery_actor_cursor':'idx_paid_delivery_cursor';$where="network_id=? AND comment='بيع إلكتروني بالمحفظة'";$params=[$net];
  if(!$this->auth->isGlobal()||isset($input['admin_id'])){$where.=' AND sold_by_admin_id=?';$params[]=$this->account($input);}
  if($before>0){$where.=' AND id<?';$params[]=$before;}
  $q=$this->db->prepare('SELECT id,profile_name,buyer_phone,buyer_name,sale_price,purchase_cost,profit_amount,delivery_status,delivered_at,sold_at,(SELECT a.state FROM um_voucher_delivery_attempts a WHERE a.network_id=um_vouchers_meta.network_id AND a.voucher_id=um_vouchers_meta.id ORDER BY a.id DESC LIMIT 1) dispatch_state FROM um_vouchers_meta FORCE INDEX('.$index.') WHERE '.$where.' ORDER BY id DESC LIMIT '.($limit+1));$q->execute($params);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);
  return ['success'=>true,'deliveries'=>$rows,'has_more'=>$more,'next_cursor'=>$rows?(int)end($rows)['id']:null,'limit'=>$limit,'read_only'=>true];
 }
}
