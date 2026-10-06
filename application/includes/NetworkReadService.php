<?php
declare(strict_types=1);
/** Bounded, tenant-scoped reads shared by legacy and native API clients. */
final class NetworkReadService {
 public function __construct(private PDO $db,private AuthorizationContext $auth){}
 private function net():int{$id=$this->auth->activeNetworkId();if($id<=0||!$this->auth->canAccessNetwork($id))throw new DomainException('FORBIDDEN_NETWORK');return $id;}
 public function admin(int $id):array {
  $this->auth->assertCan(['admins_view','admins_agents','network_nodes']);$this->auth->assertCanAccessAdmin($id);
  $q=$this->db->prepare('SELECT a.id,a.username,a.fullname,a.phone,a.email,a.parent_id,a.is_active,COALESCE(nr.role_key,a.role) role,COALESCE(nb.balance,0) balance,COALESCE(nb.credit_limit,a.credit_limit) credit_limit FROM um_admins a LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=? AND nr.is_active=1 LEFT JOIN um_admin_network_balances nb ON nb.admin_id=a.id AND nb.network_id=? WHERE a.id=?');$q->execute([$this->net(),$this->net(),$id]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r)throw new DomainException('USER_NOT_FOUND');return ['success'=>true,'admin'=>$r];
 }
 public function admins(array $input):array {
  $this->auth->assertCan(['admins_view','admins_agents','network_nodes']);$net=$this->net();$limit=max(1,min(500,(int)($input['limit']??100)));$after=max(0,(int)($input['after_id']??0));
  $where=['nx.network_id=?','nx.is_active=1','(nx.starts_at IS NULL OR nx.starts_at<=NOW())','(nx.expires_at IS NULL OR nx.expires_at>NOW())','a.id>?'];$params=[$net,$after];
  if(!$this->auth->isGlobal()){[$scope,$ids]=$this->auth->allowedAdminPlaceholders('a.id');$where[]=$scope;$params=array_merge($params,$ids);}
  $search=trim((string)($input['search']??''));if(mb_strlen($search)>100)throw new InvalidArgumentException('INVALID_SEARCH');if($search!==''){$where[]='(a.username LIKE ? OR a.fullname LIKE ?)';$params[]='%'.$search.'%';$params[]='%'.$search.'%';}
  $q=$this->db->prepare('SELECT a.id,a.username,a.fullname,COALESCE(nr.role_key,a.role) role,a.parent_id,a.is_active FROM um_admins a JOIN um_admin_network_access nx ON nx.admin_id=a.id LEFT JOIN um_admin_network_roles nr ON nr.admin_id=a.id AND nr.network_id=nx.network_id AND nr.is_active=1 WHERE '.implode(' AND ',$where).' ORDER BY a.id LIMIT '.($limit+1));$q->execute($params);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);
  return ['success'=>true,'admins'=>$rows,'data'=>$rows,'has_more'=>$more,'next_cursor'=>$rows?(int)end($rows)['id']:$after,'limit'=>$limit];
 }
 public function inventoryList(string $kind,array $input):array {
  $this->auth->assertCan(['card_warehouses','warehouse_stock_transfer']);$net=$this->net();$table=$kind==='inventories'?'um_stock_inventories':'um_stock_adjustments';$limit=max(1,min(500,(int)($input['limit']??200)));$before=max(0,(int)($input['before_id']??0));$where=['i.network_id=?'];$params=[$net];
  if(!$this->auth->isGlobal()){[$scope,$ids]=$this->auth->allowedAdminPlaceholders('i.warehouse_admin_id');$where[]=$scope;$params=array_merge($params,$ids);}
  if($before){$where[]='i.id<?';$params[]=$before;}
  $search=trim((string)($input['search']??''));if(mb_strlen($search)>100)throw new InvalidArgumentException('INVALID_SEARCH');if($search!==''){$column=$kind==='inventories'?'inventory_no':'adjustment_no';$where[]="(i.$column LIKE ? OR w.fullname LIKE ? OR w.username LIKE ?)";foreach(range(1,3) as $unused)$params[]='%'.$search.'%';}
  $role=(string)($input['role_filter']??'');if($role!==''){if(!preg_match('/^[a-z_]{1,40}$/',$role))throw new InvalidArgumentException('INVALID_ROLE');$where[]='w.role=?';$params[]=$role;}
  if(!empty($input['warehouse_id'])){$id=(int)$input['warehouse_id'];$this->auth->assertCanAccessAdmin($id);$where[]='i.warehouse_admin_id=?';$params[]=$id;}
  $q=$this->db->prepare('SELECT i.*,w.fullname warehouse_name,w.username warehouse_username,w.role warehouse_role,c.fullname creator_name,a.fullname approver_name FROM '.$table.' i LEFT JOIN um_admins w ON w.id=i.warehouse_admin_id LEFT JOIN um_admins c ON c.id=i.created_by LEFT JOIN um_admins a ON a.id=i.approved_by WHERE '.implode(' AND ',$where).' ORDER BY i.id DESC LIMIT '.($limit+1));$q->execute($params);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);
  return ['success'=>true,'data'=>$rows,'has_more'=>$more,'next_cursor'=>$rows?(int)end($rows)['id']:$before,'limit'=>$limit];
 }
 public function inventory(int $id,array $input=[]):array {
  $this->auth->assertCan(['card_warehouses','warehouse_stock_transfer']);$q=$this->db->prepare('SELECT i.*,w.fullname warehouse_name,w.username warehouse_username,w.role warehouse_role,c.fullname creator_name,a.fullname approver_name FROM um_stock_inventories i LEFT JOIN um_admins w ON w.id=i.warehouse_admin_id LEFT JOIN um_admins c ON c.id=i.created_by LEFT JOIN um_admins a ON a.id=i.approved_by WHERE i.id=? AND i.network_id=?');$q->execute([$id,$this->net()]);$inv=$q->fetch(PDO::FETCH_ASSOC);if(!$inv)throw new DomainException('FORBIDDEN_NETWORK');$this->auth->assertCanAccessAdmin((int)$inv['warehouse_admin_id']);
  $after=max(0,(int)($input['after_id']??0));$limit=max(1,min(500,(int)($input['limit']??500)));$q=$this->db->prepare('SELECT * FROM um_stock_inventory_lines WHERE inventory_id=? AND id>? ORDER BY id LIMIT '.($limit+1));$q->execute([$id,$after]);$lines=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($lines)>$limit;if($more)array_pop($lines);$inv['lines']=$lines;
  return ['success'=>true,'data'=>$inv,'has_more'=>$more,'next_cursor'=>$lines?(int)end($lines)['id']:$after];
 }
 private static function cents(string $amount):int {
  if(!preg_match('/^(-?)(\d+)(?:\.(\d{1,2}))?$/',$amount,$m)||strlen(ltrim($m[2],'0'))>15)throw new InvalidArgumentException('MONEY_RANGE');
  $v=(int)$m[2]*100+(int)str_pad($m[3]??'',2,'0');return $m[1]==='-'?-$v:$v;
 }
 private static function money(int $v):string{return ($v<0?'-':'').intdiv(abs($v),100).'.'.str_pad((string)(abs($v)%100),2,'0',STR_PAD_LEFT);}
 private function sign(array $state):string{
  $nonce=random_bytes(12);$tag='';$cipher=openssl_encrypt(json_encode($state,JSON_THROW_ON_ERROR),'aes-256-gcm',hash('sha256','sam-statement-cursor-v1'.DB_PASS,true),OPENSSL_RAW_DATA,$nonce,$tag,'sam-statement-cursor-v1');if($cipher===false)throw new RuntimeException('Cursor encoding failed');return rtrim(strtr(base64_encode($nonce.$tag.$cipher),'+/','-_'),'=');
 }
 private function cursor(string $cursor):array {
  if(strlen($cursor)>4096||!preg_match('/^[A-Za-z0-9_-]+$/',$cursor))throw new InvalidArgumentException('INVALID_CURSOR');$raw=base64_decode(strtr($cursor,'-_','+/'),true);if($raw===false||strlen($raw)<29)throw new InvalidArgumentException('INVALID_CURSOR');
  $plain=openssl_decrypt(substr($raw,28),'aes-256-gcm',hash('sha256','sam-statement-cursor-v1'.DB_PASS,true),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16),'sam-statement-cursor-v1');if($plain===false)throw new InvalidArgumentException('INVALID_CURSOR');
  $state=json_decode($plain,true,32,JSON_THROW_ON_ERROR);if(!is_array($state)||($state['expires']??0)<time())throw new InvalidArgumentException('CURSOR_EXPIRED');return $state;
 }
 public function statement(int $id,array $input):array {
  $this->auth->assertCan(['cashbox_accounts','vouchers_fin','statement.view.own','statement.view.children']);$this->auth->assertCanAccessAdmin($id);$net=$this->net();$limit=max(1,min(500,(int)($input['limit']??250)));
  $where='network_id=? AND account_id=?';$params=[$net,$id];$dates=[];
  foreach(['start_date','end_date'] as $key){$v=(string)($input[$key]??'');if($v!==''&&(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$v)||!checkdate((int)substr($v,5,2),(int)substr($v,8,2),(int)substr($v,0,4))))throw new InvalidArgumentException('INVALID_DATE');$dates[$key]=$v;}
  if($dates['start_date']!==''&&$dates['end_date']!==''&&$dates['start_date']>$dates['end_date'])throw new InvalidArgumentException('INVALID_DATE_RANGE');
  if($dates['start_date']!==''){$where.=' AND created_at>=?';$params[]=$dates['start_date'].' 00:00:00';}if($dates['end_date']!==''){$where.=' AND created_at<=?';$params[]=$dates['end_date'].' 23:59:59';}
  if(!empty($input['cursor'])){$state=$this->cursor((string)$input['cursor']);if($state['actor']!==$this->auth->id()||$state['network']!==$net||$state['account']!==$id||$state['dates']!==$dates)throw new InvalidArgumentException('CURSOR_SCOPE_MISMATCH');}
  else{
   $q=$this->db->prepare('SELECT id FROM um_financial_transactions FORCE INDEX(idx_fin_tx_cursor) WHERE '.$where.' ORDER BY id DESC LIMIT 1');$q->execute($params);$snapshot=(int)$q->fetchColumn();$summary=null;
   if(in_array($input['include_summary']??false,[true,1,'1','true'],true)){$q=$this->db->prepare('SELECT COUNT(*) count,COALESCE(SUM(debit),0) total_debit,COALESCE(SUM(credit),0) total_credit,COALESCE(SUM(cashbox_impact),0) total_cashbox FROM um_financial_transactions WHERE '.$where.' AND id<=?');$q->execute(array_merge($params,[$snapshot]));$summary=$q->fetch(PDO::FETCH_ASSOC);}
   $state=['actor'=>$this->auth->id(),'network'=>$net,'account'=>$id,'dates'=>$dates,'snapshot'=>$snapshot,'after'=>0,'balance'=>0,'summary'=>$summary,'expires'=>time()+3600];
  }
  $q=$this->db->prepare('SELECT * FROM um_financial_transactions FORCE INDEX(idx_fin_tx_cursor) WHERE '.$where.' AND id>? AND id<=? ORDER BY id LIMIT '.($limit+1));$q->execute(array_merge($params,[$state['after'],$state['snapshot']]));$rows=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);
  foreach($rows as &$row){$state['balance']+=self::cents((string)$row['debit'])-self::cents((string)$row['credit']);$row['running_balance']=self::money($state['balance']);$row['balance_after']=$row['running_balance'];$state['after']=(int)$row['id'];}unset($row);
  return ['success'=>true,'network_id'=>$net,'account_id'=>$id,'data'=>$rows,'transactions'=>$rows,'summary'=>$state['summary'],'has_more'=>$more,'next_cursor'=>$more?$this->sign($state):null,'limit'=>$limit,'order'=>'id_ascending','snapshot_id'=>$state['snapshot'],'read_only'=>true];
 }
}
