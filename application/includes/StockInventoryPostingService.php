<?php
declare(strict_types=1);
final class StockInventoryPostingService {
 public function __construct(private PDO $db,private AuthorizationContext $auth){}
 private function cents(string $v):int{if(!preg_match('/^(\d{1,12})(?:\.(\d{1,2}))?$/',$v,$m))throw new InvalidArgumentException('INVALID_COST');return (int)$m[1]*100+(int)str_pad($m[2]??'',2,'0');}
 private function money(int $v):string{return intdiv($v,100).'.'.str_pad((string)($v%100),2,'0',STR_PAD_LEFT);}
 private function account(int $net,string $code,string $name,string $type):int{
  $q=$this->db->prepare('INSERT INTO um_chart_of_accounts(network_id,account_code,name_ar,account_type,level,is_system,is_active) VALUES(?,?,?,?,4,1,1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)');$q->execute([$net,$code,$name,$type]);
  $q=$this->db->prepare('SELECT id,account_type,is_active FROM um_chart_of_accounts WHERE network_id=? AND account_code=? FOR UPDATE');$q->execute([$net,$code]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row||!(int)$row['is_active']||$row['account_type']!==$type)throw new DomainException('CHART_ACCOUNT_INVALID');return (int)$row['id'];
 }
 public function post(int $id,array $input=[]):array{
  $this->auth->assertCan(['stock_inventory','card_warehouses','warehouse_stock_transfer']);if(!in_array($this->auth->role(),['system_owner','superadmin','network_manager','admin','accountant','finance'],true))throw new DomainException('FORBIDDEN');
  $net=$this->auth->activeNetworkId();if($net<=0||!$this->auth->canAccessNetwork($net)||isset($input['network_id'])&&(int)$input['network_id']!==$net)throw new DomainException('FORBIDDEN_NETWORK');
  $owns=!$this->db->inTransaction();if($owns)$this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT * FROM um_stock_inventories WHERE id=? AND network_id=? FOR UPDATE');$q->execute([$id,$net]);$inv=$q->fetch(PDO::FETCH_ASSOC);if(!$inv)throw new DomainException('FORBIDDEN_NETWORK');$warehouse=(int)$inv['warehouse_admin_id'];$this->auth->assertCanAccessAdmin($warehouse);
   if($inv['status']==='completed'){
    $q=$this->db->prepare('SELECT COUNT(*) count,SUM(cost_value>0 AND journal_entry_id IS NULL) missing FROM um_stock_adjustments WHERE network_id=? AND inventory_id=?');$q->execute([$net,$id]);$done=$q->fetch(PDO::FETCH_ASSOC);if((int)$done['missing']>0||((int)$inv['total_variance_cards']!==0&&(int)$done['count']===0))throw new DomainException('POSTED_INVENTORY_INCOMPLETE');
    if($owns)$this->db->commit();return ['success'=>true,'status'=>'completed','replayed'=>true,'inventory_no'=>$inv['inventory_no']];
   }
   if(!in_array($inv['status'],['draft','in_progress'],true))throw new DomainException('INVENTORY_LOCKED');
   $q=$this->db->prepare('SELECT * FROM um_stock_inventory_lines WHERE inventory_id=? ORDER BY id LIMIT 501 FOR UPDATE');$q->execute([$id]);$lines=$q->fetchAll(PDO::FETCH_ASSOC);if(count($lines)>500)throw new DomainException('POSTING_BATCH_REQUIRED');
   $lossCount=0;foreach($lines as $line){$variance=(int)$line['actual_cards_count']-(int)$line['book_cards_count'];if($variance>0)throw new DomainException('SURPLUS_REQUIRES_CARD_IMPORT');$lossCount-=$variance;}
   if($lossCount>5000)throw new DomainException('POSTING_BATCH_REQUIRED');
   require_once __DIR__.'/FinancialAccountingService.php';$finance=new FinancialAccountingService($this->db);$adjustments=[];
   $safe="network_id=? AND owner_admin_id=? AND profile_name=? AND is_sold=0 AND invoice_id IS NULL AND first_login IS NULL AND (status IS NULL OR status NOT IN ('used','expired','damaged','lost')) AND username NOT LIKE 'router\\_%' AND COALESCE(comment,'') NOT LIKE 'استيراد محجور من User Manager%' AND NOT EXISTS(SELECT 1 FROM radacct r WHERE r.network_id=um_vouchers_meta.network_id AND r.username=um_vouchers_meta.username)";
   foreach($lines as $line){
    $q=$this->db->prepare('SELECT COUNT(*) FROM um_vouchers_meta WHERE '.$safe.' FOR UPDATE');$q->execute([$net,$warehouse,$line['profile_name']]);if((int)$q->fetchColumn()!==(int)$line['book_cards_count'])throw new DomainException('INVENTORY_STALE');
    $missing=(int)$line['book_cards_count']-(int)$line['actual_cards_count'];if($missing===0)continue;
    $selection=$input['selected_card_ids'][$line['profile_name']]??null;$selectWhere=$safe;$selectParams=[$net,$warehouse,$line['profile_name']];
    if($selection!==null){if(!is_array($selection)||count($selection)!==$missing||count(array_unique($selection,SORT_REGULAR))!==$missing)throw new InvalidArgumentException('INVALID_SELECTION');foreach($selection as $selectedId)if(!is_int($selectedId)||$selectedId<=0)throw new InvalidArgumentException('INVALID_SELECTION');$selectWhere.=' AND id IN ('.implode(',',array_fill(0,count($selection),'?')).')';$selectParams=array_merge($selectParams,$selection);}
    $q=$this->db->prepare('SELECT id,username,purchase_cost,price FROM um_vouchers_meta WHERE '.$selectWhere.' ORDER BY id LIMIT '.$missing.' FOR UPDATE');$q->execute($selectParams);$cards=$q->fetchAll(PDO::FETCH_ASSOC);if(count($cards)!==$missing)throw new DomainException('INVENTORY_STALE');
    $cost=0;$retail=0;foreach($cards as $card){$cost+=$this->cents((string)$card['purchase_cost']);$retail+=$this->cents((string)$card['price']);}if($cost>999999999999||$retail>999999999999)throw new InvalidArgumentException('MONEY_RANGE');
    $type=(string)($input['adjustment_type']??'deficit');if(!in_array($type,['deficit','damaged','lost'],true))throw new InvalidArgumentException('INVALID_ADJUSTMENT_TYPE');$status=$type==='damaged'?'damaged':'lost';$number='ADJ-'.bin2hex(random_bytes(16));$reason='عجز جرد '.$inv['inventory_no'].' - '.$line['profile_name'];if(!empty($input['reason'])){if(!is_string($input['reason'])||mb_strlen($input['reason'])>1000)throw new InvalidArgumentException('INVALID_REASON');$reason.=' - '.$input['reason'];}$journal=null;
    if($cost>0){$inventoryAccount=$this->account($net,'110401','مخزون الكروت','asset');$lossAccount=$this->account($net,'5104','عجز وتلف المخزون','expense');$amount=$this->money($cost);$journal=$finance->createJournalEntry(['source_module'=>'stock_movement','reference_no'=>$number,'description'=>$reason,'lines'=>[['account_id'=>$lossAccount,'debit'=>$amount,'credit'=>0],['account_id'=>$inventoryAccount,'debit'=>0,'credit'=>$amount]]],$this->auth->id())['entry_id'];if(!$journal)throw new RuntimeException('JOURNAL_REQUIRED');}
    foreach(array_chunk($cards,250) as $chunk){$ids=array_column($chunk,'id');$marks=implode(',',array_fill(0,count($ids),'?'));$q=$this->db->prepare("UPDATE um_vouchers_meta SET status=?,comment=? WHERE network_id=? AND owner_admin_id=? AND id IN ($marks)");$q->execute(array_merge([$status,mb_substr($reason,0,255),$net,$warehouse],$ids));if($q->rowCount()!==count($ids))throw new DomainException('INVENTORY_STALE');}
    $reject=$this->db->prepare("INSERT INTO radcheck(network_id,username,attribute,op,value) VALUES(?,?,'Auth-Type',':=','Reject') ON DUPLICATE KEY UPDATE op=':=',value='Reject'");foreach($cards as $card)$reject->execute([$net,$card['username']]);
    $q=$this->db->prepare("INSERT INTO um_stock_adjustments(adjustment_no,network_id,inventory_id,warehouse_admin_id,adjustment_type,status,total_cards,cost_value,retail_value,journal_entry_id,is_immutable,reason,created_by,approved_by,approved_at) VALUES(?,?,?,?,?,'posted',?,?,?,?,1,?,?,?,NOW())");$q->execute([$number,$net,$id,$warehouse,$type,$missing,$this->money($cost),$this->money($retail),$journal,$reason,$this->auth->id(),$this->auth->id()]);$adjustments[]=['number'=>$number,'cards'=>$missing,'cost'=>$this->money($cost),'journal_entry_id'=>$journal];
    $q=$this->db->prepare('UPDATE um_stock_inventory_lines SET variance_cards=?,variance_cost_value=?,variance_retail_value=? WHERE id=? AND inventory_id=?');$q->execute([-$missing,'-'.$this->money($cost),'-'.$this->money($retail),$line['id'],$id]);
   }
   $q=$this->db->prepare("UPDATE um_stock_inventories i JOIN (SELECT COALESCE(SUM(actual_cards_count),0) actual,COALESCE(SUM(variance_cards),0) variance,COALESCE(SUM(variance_cost_value),0) cost,COALESCE(SUM(variance_retail_value),0) retail FROM um_stock_inventory_lines WHERE inventory_id=?) t SET i.total_actual_cards=t.actual,i.total_variance_cards=t.variance,i.total_cost_variance=t.cost,i.total_retail_variance=t.retail,i.status='completed',i.approved_by=?,i.approved_at=NOW() WHERE i.id=? AND i.network_id=?");$q->execute([$id,$this->auth->id(),$id,$net]);$this->auth->audit('stock.inventory.post','allow','stock_inventory',$id,'atomic stock and journal');if($owns)$this->db->commit();
   return ['success'=>true,'status'=>'completed','inventory_no'=>$inv['inventory_no'],'adjustments'=>$adjustments,'adjustments_count'=>count($adjustments),'cost_basis'=>'exact_recorded_purchase_cost','message'=>'تم ترحيل الجرد والكروت والقيود داخل معاملة واحدة'];
  }catch(Throwable $e){if($owns&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
}
