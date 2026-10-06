<?php
declare(strict_types=1);
/** A send acceptance is not a handset delivery receipt. Ambiguous sends cannot be retried blindly. */
final class VoucherDeliveryService {
 public function __construct(private PDO $db,private AuthorizationContext $auth,private mixed $transport=null){}
 public function resend(int $id,array $input):array{
  if($id<=0)throw new InvalidArgumentException('INVALID_VOUCHER_ID');
  $this->auth->assertCan(['wallet_sales','distributor_wallets']);$net=$this->auth->activeNetworkId();if($net<=0||!$this->auth->canAccessNetwork($net)||isset($input['network_id'])&&(int)$input['network_id']!==$net)throw new DomainException('FORBIDDEN_NETWORK');
  $key=$input['request_key']??'';if(!is_string($key)||!preg_match('/^[A-Za-z0-9_.:-]{8,100}$/',$key))throw new InvalidArgumentException('REQUEST_KEY_REQUIRED');
  $this->db->beginTransaction();
  try{
   $q=$this->db->prepare('SELECT * FROM um_vouchers_meta WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$net,$id]);$v=$q->fetch(PDO::FETCH_ASSOC);if(!$v)throw new DomainException('FORBIDDEN_NETWORK');$this->auth->assertCanAccessAdmin((int)$v['sold_by_admin_id']);if(!$this->auth->isGlobal()&&(int)$v['sold_by_admin_id']!==$this->auth->id())throw new DomainException('FORBIDDEN_SCOPE');
   if($v['comment']!=='بيع إلكتروني بالمحفظة'||$v['delivery_status']==='refunded'||!(int)$v['is_sold']||$v['status']!=='active'||str_starts_with($v['username'],'router_'))throw new DomainException('DELIVERY_NOT_ALLOWED');
   $q=$this->db->prepare('SELECT voucher_id,state FROM um_voucher_delivery_attempts WHERE network_id=? AND created_by=? AND request_key=? FOR UPDATE');$q->execute([$net,$this->auth->id(),$key]);if($old=$q->fetch(PDO::FETCH_ASSOC)){if((int)$old['voucher_id']!==$id)throw new DomainException('IDEMPOTENCY_CONFLICT');$this->db->commit();return $this->result($old['state'],true);}
   $q=$this->db->prepare("SELECT state,created_at>NOW()-INTERVAL 60 SECOND recent FROM um_voucher_delivery_attempts WHERE network_id=? AND voucher_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE");$q->execute([$net,$id]);if($old=$q->fetch(PDO::FETCH_ASSOC)){if(in_array($old['state'],['sending','uncertain'],true))throw new DomainException('DELIVERY_UNCERTAIN');if((int)$old['recent'])throw new DomainException('DELIVERY_RATE_LIMIT');}
   if(!is_string($v['buyer_phone'])||!preg_match('/^[0-9]{9}$/',$v['buyer_phone']))throw new InvalidArgumentException('INVALID_PHONE');
   $q=$this->db->prepare("SELECT value FROM radcheck WHERE network_id=? AND username=? AND attribute='Cleartext-Password' ORDER BY id LIMIT 2 FOR UPDATE");$q->execute([$net,$v['username']]);$passwords=$q->fetchAll(PDO::FETCH_COLUMN);if(count($passwords)!==1)throw new DomainException('CARD_PASSWORD_REQUIRED');$password=(string)$passwords[0];
   $q=$this->db->prepare("INSERT INTO um_voucher_delivery_attempts(network_id,voucher_id,created_by,request_key,state) VALUES(?,?,?,?,'sending')");$q->execute([$net,$id,$this->auth->id(),$key]);$attempt=(int)$this->db->lastInsertId();$q=$this->db->prepare("UPDATE um_vouchers_meta SET delivery_status='pending',delivered_at=NULL WHERE network_id=? AND id=?");$q->execute([$net,$id]);$this->db->commit();
  }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
  $message="كرت الإنترنت\nرقم الكرت: ".$v['username']."\nكلمة المرور: ".($password===''?'فارغة — اترك الحقل فارغًا':$password)."\nالباقة: ".$v['profile_name']."\nالصلاحية: ".($v['validity']??'');
  $payload=['network_id'=>$net,'phone'=>'967'.$v['buyer_phone'],'username'=>$v['username'],'password'=>$password,'profile_name'=>$v['profile_name'],'validity'=>$v['validity']??'','price'=>$v['price'],'message'=>$message,'reference'=>'voucher_'.$v['id'],'created_by'=>$this->auth->id()];
  try{$sent=$this->transport!==null?($this->transport)($payload):$this->send($payload);$state=!empty($sent['success'])?'accepted':(!empty($sent['definitive_failure'])?'failed':'uncertain');}catch(Throwable $e){$state='uncertain';}
  $this->db->beginTransaction();try{
   $q=$this->db->prepare("SELECT delivery_status FROM um_vouchers_meta WHERE network_id=? AND id=? FOR UPDATE");$q->execute([$net,$id]);if($q->fetchColumn()==='refunded')throw new DomainException('DELIVERY_NOT_ALLOWED');
   $q=$this->db->prepare('UPDATE um_voucher_delivery_attempts SET state=?,finished_at=NOW() WHERE id=? AND network_id=? AND state=\'sending\'');$q->execute([$state,$attempt,$net]);$q=$this->db->prepare('UPDATE um_vouchers_meta SET delivery_status=?,delivered_at=NULL WHERE network_id=? AND id=?');$q->execute([$state==='accepted'?'sent':($state==='failed'?'failed':'pending'),$net,$id]);$this->db->commit();
  }catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
  return $this->result($state,false);
 }
 private function result(string $state,bool $replayed):array{return ['success'=>$state==='accepted','replayed'=>$replayed,'delivery_status'=>$state==='accepted'?'sent':($state==='failed'?'failed':'pending'),'dispatch_state'=>$state,'error'=>$state==='accepted'?null:($state==='failed'?'WHATSAPP_UNAVAILABLE':'DELIVERY_UNCERTAIN'),'message'=>$state==='accepted'?'قبلت البوابة الإرسال؛ هذا لا يؤكد وصوله إلى هاتف العميل':'لم يُؤكد التسليم؛ راجع حالة الإرسال قبل الاسترداد أو إعادة المحاولة'];}
 private function send(array $p):array{
  require_once __DIR__.'/WhatsAppService.php';$wa=new WhatsAppService($this->db,null,$p['network_id']);if(!$wa->isEnabled())return ['success'=>false,'definitive_failure'=>true];
  $image=null;try{require_once __DIR__.'/CardImageService.php';$image=(new CardImageService($this->db))->generateCardImageBase64($p,$p['network_id']);}catch(Throwable $e){}
  if($image)return $wa->sendMedia($p['phone'],$image,$p['message'],'image/png','card.png',$p['reference'],$p['created_by'],'paid_voucher');
  return $wa->sendMessage($p['phone'],$p['message'],$p['reference'],$p['created_by'],'paid_voucher');
 }
}
