<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['get_agent_wallet','get_instant_balance_inventory','get_paid_voucher_deliveries','reject_stock_transfer','delete_stock_transfer'],true))return;
$ctx=legacyAuthorizationContext();
if(str_starts_with($action,'get_')){
 if(($_SERVER['REQUEST_METHOD']??'')!=='GET')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
 require_once __DIR__.'/includes/CommerceReadService.php';$reads=new CommerceReadService(getDB(),$ctx);
 jsonResponse(match($action){'get_agent_wallet'=>$reads->wallet($_GET),'get_instant_balance_inventory'=>$reads->instant($_GET),'get_paid_voucher_deliveries'=>$reads->deliveries($_GET)});
}
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
if(($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
require_once __DIR__.'/includes/StockTransferStateService.php';
try{
 $raw=file_get_contents('php://input');if(strlen($raw)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($data))throw new InvalidArgumentException('INVALID_JSON');
 jsonResponse((new StockTransferStateService(getDB(),$ctx))->change((int)($data['transfer_id']??0),$action==='reject_stock_transfer'?'reject':'delete',$data));
}catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],$e->getMessage()==='IMMUTABLE_RECORD'?409:403);}catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
