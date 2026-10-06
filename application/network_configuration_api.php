<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['get_network_clock','save_network_clock','get_network_ui_settings','save_network_ui_settings','reset_network_ui_settings'],true))return;
require_once __DIR__.'/includes/NetworkConfigurationService.php';
$configuration=new NetworkConfigurationService(getDB(),legacyAuthorizationContext());
try{
 if($action==='get_network_clock')jsonResponse($configuration->clock());
 if($action==='get_network_ui_settings')jsonResponse($configuration->appearance());
 if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
 if(($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
 $raw=file_get_contents('php://input');if(strlen($raw)>16384)throw new InvalidArgumentException('SETTINGS_TOO_LARGE');
 $input=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($input))throw new InvalidArgumentException('INVALID_JSON');
 jsonResponse(match($action){'save_network_clock'=>$configuration->saveClock($input),'save_network_ui_settings'=>$configuration->saveAppearance($input),'reset_network_ui_settings'=>$configuration->resetAppearance($input)});
}catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],403);}catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
