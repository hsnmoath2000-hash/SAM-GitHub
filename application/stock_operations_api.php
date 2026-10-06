<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['get_stock_transfer_quote','approve_stock_transfer','create_stock_adjustment'],true))return;
$read=$action==='get_stock_transfer_quote';
if(($_SERVER['REQUEST_METHOD']??'')!==($read?'GET':'POST'))jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
if(!$read&&($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
require_once __DIR__.'/includes/StockTransferApprovalService.php';
require_once __DIR__.'/includes/DirectStockAdjustmentService.php';
try{
 $ctx=legacyAuthorizationContext();$db=getDB();
 if($read)jsonResponse((new StockTransferApprovalService($db,$ctx))->quote((int)($_GET['transfer_id']??0)));
 $raw=file_get_contents('php://input');if(strlen($raw)>262144)throw new InvalidArgumentException('REQUEST_TOO_LARGE');$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($data)||array_is_list($data))throw new InvalidArgumentException('INVALID_JSON');
 jsonResponse($action==='approve_stock_transfer'?(new StockTransferApprovalService($db,$ctx))->approve((int)($data['transfer_id']??0),$data):(new DirectStockAdjustmentService($db,$ctx))->create($data));
}catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],str_starts_with($e->getMessage(),'FORBIDDEN')?403:409);}catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
