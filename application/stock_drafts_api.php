<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['start_stock_inventory','save_stock_inventory','post_stock_inventory_adjustment'],true))return;
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
if(($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
require_once __DIR__.'/includes/StockDraftService.php';$drafts=new StockDraftService(getDB(),legacyAuthorizationContext());
try{
 $raw=file_get_contents('php://input');if(strlen($raw)>262144)throw new InvalidArgumentException('REQUEST_TOO_LARGE');$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($data))throw new InvalidArgumentException('INVALID_JSON');
 if($action==='post_stock_inventory_adjustment'){require_once __DIR__.'/includes/StockInventoryPostingService.php';jsonResponse((new StockInventoryPostingService(getDB(),legacyAuthorizationContext()))->post((int)($data['inventory_id']??0),$data));}
 jsonResponse($action==='start_stock_inventory'?$drafts->start($data):$drafts->save((int)($data['inventory_id']??0),$data));
}catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],in_array($e->getMessage(),['INVENTORY_LOCKED','INVENTORY_STALE','SURPLUS_REQUIRES_CARD_IMPORT','POSTED_INVENTORY_INCOMPLETE','POSTING_BATCH_REQUIRED','CHART_ACCOUNT_INVALID'],true)?409:403);}catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
