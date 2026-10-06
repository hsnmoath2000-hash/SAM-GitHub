<?php
declare(strict_types=1);
/** Reject/cancel draft transfers only; never moves cards or posts accounting. */
final class StockTransferStateService {
 public function __construct(private PDO $db,private AuthorizationContext $auth){}
 public function change(int $id,string $operation,array $data=[]):array{
  $this->auth->assertCan(['warehouse_stock_transfer','card_warehouses']);$net=$this->auth->activeNetworkId();if($net<=0||!$this->auth->canAccessNetwork($net)||isset($data['network_id'])&&(int)$data['network_id']!==$net)throw new DomainException('FORBIDDEN_NETWORK');
  if(!in_array($operation,['reject','delete'],true))throw new InvalidArgumentException('INVALID_OPERATION');if(isset($data['reason'])&&!is_string($data['reason']))throw new InvalidArgumentException('INVALID_REASON');$reason=trim($data['reason']??'');if(mb_strlen($reason)>1000)throw new InvalidArgumentException('REASON_TOO_LONG');
  $this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT * FROM um_stock_transfers WHERE id=? AND network_id=? FOR UPDATE');$q->execute([$id,$net]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row)throw new DomainException('FORBIDDEN_NETWORK');
   $manager=in_array($this->auth->role(),['system_owner','superadmin','network_manager','admin'],true);
   if(!$manager&&($operation==='reject'?(int)$row['receiver_admin_id']!==$this->auth->id():!in_array($this->auth->id(),[(int)$row['sender_admin_id'],(int)$row['created_by']],true)))throw new DomainException('FORBIDDEN_SCOPE');
   if($manager){$this->auth->assertCanAccessAdmin((int)$row['sender_admin_id']);$this->auth->assertCanAccessAdmin((int)$row['receiver_admin_id']);}
   // References also protect legacy records whose immutable/status flags are inconsistent.
   if($row['status']==='posted'||!empty($row['financial_tx_id'])||!empty($row['journal_entry_id']))throw new DomainException('IMMUTABLE_RECORD');
   if($operation==='reject'&&$row['status']==='rejected'){$this->db->commit();return ['success'=>true,'status'=>'rejected','replayed'=>true,'no_financial_effect'=>true];}
   if((int)$row['is_immutable']===1||!in_array($row['status'],['draft','pending_approval'],true))throw new DomainException('IMMUTABLE_RECORD');
   if($operation==='reject'){$q=$this->db->prepare("UPDATE um_stock_transfers SET status='rejected',is_immutable=1,notes=CONCAT(COALESCE(notes,''),' | سبب الرفض: ',?),approved_by=?,approved_at=NOW() WHERE id=? AND network_id=?");$q->execute([$reason?:'رفض المستلم العهدة',$this->auth->id(),$id,$net]);}
   else{$q=$this->db->prepare('DELETE FROM um_stock_transfers WHERE id=? AND network_id=?');$q->execute([$id,$net]);}
   $this->auth->audit('stock.transfer.'.$operation,'allow','stock_transfer',$id,'no stock or financial effect');$this->db->commit();return ['success'=>true,'status'=>$operation==='reject'?'rejected':'deleted','no_financial_effect'=>true,'message'=>$operation==='reject'?'تم رفض التحويل دون تغيير المخزون أو الأرصدة':'تم حذف مسودة التحويل غير المرحّلة'];
  }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
 }
}
