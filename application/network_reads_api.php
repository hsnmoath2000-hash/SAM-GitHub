<?php
declare(strict_types=1);
if(basename((string)($_SERVER['SCRIPT_FILENAME']??''))===basename(__FILE__)){http_response_code(404);exit;}
if(!in_array($action,['get_admin','get_distributors','get_stock_inventories','get_stock_adjustments','get_stock_inventory_details','get_cashbox_statement','get_router_ports'],true))return;
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
require_once __DIR__.'/includes/NetworkReadService.php';$ctx=legacyAuthorizationContext();$reads=new NetworkReadService(getDB(),$ctx);
switch($action){
 case 'get_admin':jsonResponse($reads->admin((int)($_GET['id']??0)));
 case 'get_distributors':jsonResponse($reads->admins($_GET));
 case 'get_stock_inventories':jsonResponse($reads->inventoryList('inventories',$_GET));
 case 'get_stock_adjustments':jsonResponse($reads->inventoryList('adjustments',$_GET));
 case 'get_stock_inventory_details':jsonResponse($reads->inventory((int)($_GET['inventory_id']??0),$_GET));
 case 'get_cashbox_statement':jsonResponse($reads->statement((int)($_GET['party_id']??0),$_GET));
 case 'get_router_ports':
  $ctx->assertCan(['network_nodes','routers','network_monitor']);$nas=trim((string)($_GET['nas']??''));
  if($nas!==''){$q=getDB()->prepare('SELECT id FROM nas WHERE network_id=? AND (nasname=? OR server=?) LIMIT 1');$q->execute([$ctx->activeNetworkId(),$nas,$nas]);$id=(int)$q->fetchColumn();if(!$id)throw new DomainException('FORBIDDEN_NETWORK');$ctx->assertCanAccessRouter($id);}
  jsonResponse($service->getRouterPortsList($nas));
}
