<?php
declare(strict_types=1);
if (basename((string)($_SERVER['SCRIPT_FILENAME']??'')) === basename(__FILE__)) { http_response_code(404); exit; }
if (!in_array($action,['network_setup_status','network_setup_save'],true)) return;
require_once __DIR__.'/includes/NetworkOnboardingService.php';
require_once __DIR__.'/includes/onboarding-release.php';
$setup=new NetworkOnboardingService(getDB(),legacyAuthorizationContext());
try {
    if($action==='network_setup_status')jsonResponse($setup->status());
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
    if(($_SERVER['HTTP_X_SAM_REQUEST']??'')!=='XMLHttpRequest')jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
    $raw=file_get_contents('php://input');if(strlen($raw)>16384)jsonResponse(['success'=>false,'error'=>'REQUEST_TOO_LARGE'],413);
    $input=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($input))throw new InvalidArgumentException('INVALID_JSON');
    jsonResponse($setup->save($input));
} catch(DomainException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],$e->getMessage()==='SETUP_CONFLICT'?409:403);
} catch(InvalidArgumentException|JsonException $e){jsonResponse(['success'=>false,'error'=>$e->getMessage()],422);}
