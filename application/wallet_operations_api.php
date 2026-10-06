<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['refund_failed_wallet_voucher','transfer_instant_balance','resend_paid_voucher_whatsapp'],true))return;
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
if(($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
require_once __DIR__.'/includes/WalletRefundService.php';
require_once __DIR__.'/includes/InstantBalanceTransferService.php';
try{$raw=file_get_contents('php://input');if(strlen($raw)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');$data=json_decode($raw,true,16,JSON_THROW_ON_ERROR);if(!is_array($data)||array_is_list($data))throw new InvalidArgumentException('INVALID_JSON');if($action==='transfer_instant_balance')jsonResponse((new InstantBalanceTransferService(getDB(),legacyAuthorizationContext()))->transfer($data));$id=$data['voucher_id']??null;if((!is_int($id)&&!is_string($id))||!preg_match('/^[1-9][0-9]{0,17}$/',(string)$id))throw new InvalidArgumentException('INVALID_VOUCHER_ID');if($action==='resend_paid_voucher_whatsapp'){require_once __DIR__.'/includes/VoucherDeliveryService.php';jsonResponse((new VoucherDeliveryService(getDB(),legacyAuthorizationContext()))->resend((int)$id,$data));}jsonResponse((new WalletRefundService(getDB(),legacyAuthorizationContext()))->refund((int)$id,$data));}
catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],str_starts_with($e->getMessage(),'FORBIDDEN')?403:409);}catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
