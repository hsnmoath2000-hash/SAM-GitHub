<?php
declare(strict_types=1);
/** Draft counts only. No voucher ownership, wallet, or ledger mutations. */
final class StockDraftService {
 public function __construct(private PDO $db,private AuthorizationContext $auth){}
 private function scope(array $data):int {
  $this->auth->assertCan(['card_warehouses','warehouse_stock_transfer']);$net=$this->auth->activeNetworkId();
  if($net<=0||!$this->auth->canAccessNetwork($net)||isset($data['network_id'])&&(int)$data['network_id']!==$net)throw new DomainException('FORBIDDEN_NETWORK');
  return $net;
 }
 private function text(mixed $value,int $limit):string{if(!is_string($value))throw new InvalidArgumentException('INVALID_TEXT');$value=trim($value);if(mb_strlen($value)>$limit)throw new InvalidArgumentException('TEXT_TOO_LONG');return $value;}
 private function count(mixed $value):int{if(!is_int($value)&&!(is_string($value)&&preg_match('/^\d{1,9}$/',$value)))throw new InvalidArgumentException('INVALID_COUNT');$v=(int)$value;if($v<0||$v>999999999)throw new InvalidArgumentException('INVALID_COUNT');return $v;}
 public function start(array $data):array {
  $net=$this->scope($data);$warehouse=(int)($data['warehouse_admin_id']??$data['admin_id']??$this->auth->id());$this->auth->assertCanAccessAdmin($warehouse);
  $date=(string)($data['inventory_date']??date('Y-m-d'));if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)||!checkdate((int)substr($date,5,2),(int)substr($date,8,2),(int)substr($date,0,4)))throw new InvalidArgumentException('INVALID_DATE');
  $notes=$this->text($data['notes']??'',2000);$title=$this->text($data['title']??'',128);if($title!=='')$notes=$this->text($title."\n".$notes,2000);$key=$this->text($data['request_key']??'',100);
  $number='INV-'.($key!==''?substr(hash('sha256',"$net:$warehouse:".$this->auth->id().':'.$key),0,32):bin2hex(random_bytes(16)));
  $this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT id FROM um_admins WHERE id=? FOR UPDATE');$q->execute([$warehouse]);if(!$q->fetchColumn())throw new DomainException('FORBIDDEN_NETWORK');
   $q=$this->db->prepare('SELECT id,total_book_cards FROM um_stock_inventories WHERE inventory_no=? AND network_id=? AND warehouse_admin_id=?');$q->execute([$number,$net,$warehouse]);
   if($old=$q->fetch(PDO::FETCH_ASSOC)){$this->db->commit();return ['success'=>true,'inventory_id'=>(int)$old['id'],'inventory_no'=>$number,'replayed'=>true,'draft_only'=>true];}
   $q=$this->db->prepare("INSERT INTO um_stock_inventories(inventory_no,network_id,warehouse_admin_id,inventory_date,status,notes,created_by) VALUES(?,?,?,?,'draft',?,?)");$q->execute([$number,$net,$warehouse,$date,$notes,$this->auth->id()]);$id=(int)$this->db->lastInsertId();
   // Recorded acquisition cost, including literal zero, never distribution/retail fallback.
   $q=$this->db->prepare("INSERT INTO um_stock_inventory_lines(inventory_id,profile_name,book_sheets_count,book_cards_count,actual_sheets_count,actual_cards_count,cost_price,retail_price)
    SELECT ?,m.profile_name,COUNT(DISTINCT m.sheet_no),COUNT(*),COUNT(DISTINCT m.sheet_no),COUNT(*),ROUND(AVG(m.purchase_cost),2),MAX(COALESCE(p.retail_price,m.price,0))
    FROM um_vouchers_meta m LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND p.name=m.profile_name
    WHERE m.network_id=? AND m.owner_admin_id=? AND m.is_sold=0 AND m.invoice_id IS NULL AND m.first_login IS NULL AND (m.status IS NULL OR m.status NOT IN ('used','expired','damaged','lost')) GROUP BY m.profile_name");$q->execute([$id,$net,$warehouse]);$lineCount=$q->rowCount();
   $q=$this->db->prepare('UPDATE um_stock_inventories SET total_book_cards=(SELECT COALESCE(SUM(book_cards_count),0) FROM um_stock_inventory_lines WHERE inventory_id=?),total_actual_cards=(SELECT COALESCE(SUM(actual_cards_count),0) FROM um_stock_inventory_lines WHERE inventory_id=?) WHERE id=?');$q->execute([$id,$id,$id]);
   $this->auth->audit('stock.inventory.start','allow','stock_inventory',$id,'draft counts only');$this->db->commit();
   return ['success'=>true,'inventory_id'=>$id,'inventory_no'=>$number,'lines_count'=>$lineCount,'draft_only'=>true,'cost_basis'=>'recorded_purchase_cost_average','message'=>'تم فتح مسودة الجرد دون تعديل الكروت أو القيود المالية'];
  }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
 public function save(int $id,array $data):array {
  $net=$this->scope($data);$lines=$data['lines']??null;if(!is_array($lines)||count($lines)>500)throw new InvalidArgumentException('INVALID_LINES');
  $seen=[];$changes=[];foreach($lines as $line){if(!is_array($line))throw new InvalidArgumentException('INVALID_LINES');$lineId=(int)($line['id']??0);if($lineId<=0||isset($seen[$lineId]))throw new InvalidArgumentException('INVALID_LINE_ID');$seen[$lineId]=true;$changes[]=[$lineId,$this->count($line['actual_sheets_count']??0),$this->count($line['actual_cards_count']??0),$this->text($line['notes']??'',255)];}
  $this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT * FROM um_stock_inventories WHERE id=? AND network_id=? FOR UPDATE');$q->execute([$id,$net]);$inv=$q->fetch(PDO::FETCH_ASSOC);if(!$inv)throw new DomainException('FORBIDDEN_NETWORK');$this->auth->assertCanAccessAdmin((int)$inv['warehouse_admin_id']);
   if(!in_array($inv['status'],['draft','in_progress'],true))throw new DomainException('INVENTORY_LOCKED');
   $notes=array_key_exists('notes',$data)?$this->text($data['notes'],2000):$inv['notes'];
   $find=$this->db->prepare('SELECT id FROM um_stock_inventory_lines WHERE inventory_id=? AND id=? FOR UPDATE');
   $update=$this->db->prepare('UPDATE um_stock_inventory_lines SET actual_sheets_count=?,actual_cards_count=?,variance_cards=?-book_cards_count,variance_cost_value=(?-book_cards_count)*cost_price,variance_retail_value=(?-book_cards_count)*retail_price,notes=? WHERE inventory_id=? AND id=?');
   foreach($changes as [$lineId,$sheets,$cards,$lineNotes]){$find->execute([$id,$lineId]);if(!$find->fetchColumn())throw new DomainException('FORBIDDEN_LINE');$update->execute([$sheets,$cards,$cards,$cards,$cards,$lineNotes,$id,$lineId]);}
   $q=$this->db->prepare("UPDATE um_stock_inventories i JOIN (SELECT COALESCE(SUM(actual_cards_count),0) actual,COALESCE(SUM(variance_cards),0) variance,COALESCE(SUM(variance_cost_value),0) cost,COALESCE(SUM(variance_retail_value),0) retail FROM um_stock_inventory_lines WHERE inventory_id=?) t SET i.total_actual_cards=t.actual,i.total_variance_cards=t.variance,i.total_cost_variance=t.cost,i.total_retail_variance=t.retail,i.status='in_progress',i.notes=? WHERE i.id=? AND i.network_id=?");$q->execute([$id,$notes,$id,$net]);
   $q=$this->db->prepare('SELECT id inventory_id,total_actual_cards,total_variance_cards,total_cost_variance,total_retail_variance FROM um_stock_inventories WHERE id=?');$q->execute([$id]);$result=$q->fetch(PDO::FETCH_ASSOC);
   $this->auth->audit('stock.inventory.save','allow','stock_inventory',$id,'draft counts only');$this->db->commit();return ['success'=>true,'draft_only'=>true,'message'=>'تم حفظ العد الميداني دون ترحيل مالي']+$result;
  }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
}
