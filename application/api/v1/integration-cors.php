<?php
declare(strict_types=1);
// Explicit origins, bearer tokens only; never enable cookie credentials or a wildcard.
$samOrigin=(string)($_SERVER['HTTP_ORIGIN']??'');
if($samOrigin!==''){
 $samLocalOrigin=((!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')?'https://':'http://').($_SERVER['HTTP_HOST']??'');
 if($samOrigin!==$samLocalOrigin){
  $samOriginsQuery=getDB()->prepare("SELECT setting_value FROM um_settings WHERE setting_key='integration_allowed_origins'");$samOriginsQuery->execute();
  $samAllowedOrigins=json_decode((string)$samOriginsQuery->fetchColumn(),true)?:[];
  if(!in_array($samOrigin,$samAllowedOrigins,true)){
   if(class_exists('ApiResponse',false))ApiResponse::error('ORIGIN_NOT_ALLOWED','أصل الصفحة الخارجية غير مسموح',403);
   jsonResponse(['success'=>false,'error'=>'ORIGIN_NOT_ALLOWED'],403);
  }
 }
 header('Access-Control-Allow-Origin: '.$samOrigin);header('Vary: Origin');
 header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
 header('Access-Control-Allow-Headers: Authorization, Content-Type, X-SAM-Network-ID, X-SAM-Request, X-Request-ID');
 header('Access-Control-Expose-Headers: X-Request-ID');header('Access-Control-Max-Age: 600');
}
