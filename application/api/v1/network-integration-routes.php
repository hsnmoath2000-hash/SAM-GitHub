<?php
declare(strict_types=1);
if(!isset($authorizationContext,$actor,$method,$path)){http_response_code(404);exit;}
require_once dirname(__DIR__,2).'/includes/NetworkOnboardingService.php';
require_once dirname(__DIR__,2).'/includes/onboarding-release.php';
if(in_array($path,['/network/commerce/wallet/quote','/network/commerce/wallet/sales','/network/commerce/wallet/credits','/network/commerce/pos/book'],true)||preg_match('#^/network/commerce/wallet/sales/([0-9]+)/customer-refund$#',$path,$retailRefund)){
 require_once dirname(__DIR__,2).'/includes/WalletCommerceService.php';$walletCommerce=new WalletCommerceService($db,$authorizationContext);
 if($method==='GET'&&$path==='/network/commerce/wallet/quote'){try{ApiResponse::ok($walletCommerce->quote($_GET));}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'راجع سعر التوزيع والخصم المسموح',409);throw $e;}}
 if($method==='GET'&&in_array($path,['/network/commerce/wallet/sales','/network/commerce/pos/book'],true))ApiResponse::ok($walletCommerce->records($_GET,$path==='/network/commerce/pos/book'));
 if($method!=='POST'||in_array($path,['/network/commerce/wallet/quote','/network/commerce/pos/book'],true))ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');
 try{ApiResponse::ok(match($path){'/network/commerce/wallet/sales'=>$walletCommerce->sell(apiBody()),'/network/commerce/wallet/credits'=>$walletCommerce->fund(apiBody()),default=>$walletCommerce->payCustomerRefund((int)($retailRefund[1]??0),apiBody())});}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'تعذر التنفيذ؛ راجع الأسعار والمحفظة والحسابات وحالة العملية',409);throw $e;}
}
if(preg_match('#^/network/commerce/vouchers/([0-9]+)/resend$#',$path,$deliveryMatch)){
 if($method!=='POST')ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
 if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');require_once dirname(__DIR__,2).'/includes/VoucherDeliveryService.php';
 try{ApiResponse::ok((new VoucherDeliveryService($db,$authorizationContext))->resend((int)$deliveryMatch[1],apiBody()));}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'تعذر الإرسال؛ راجع حالة التسليم والكرت',409);throw $e;}
}
if($path==='/network/commerce/instant-balance/transfers'){
 if($method!=='POST')ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
 if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');require_once dirname(__DIR__,2).'/includes/InstantBalanceTransferService.php';
 try{ApiResponse::ok((new InstantBalanceTransferService($db,$authorizationContext))->transfer(apiBody()));}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'تعذر التحويل؛ راجع الرصيد والصلاحيات وبيانات الطلب',409);throw $e;}
}
if(preg_match('#^/network/commerce/vouchers/([0-9]+)/refund$#',$path,$refundMatch)){
 if($method!=='POST')ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
 if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');require_once dirname(__DIR__,2).'/includes/WalletRefundService.php';
 try{ApiResponse::ok((new WalletRefundService($db,$authorizationContext))->refund((int)$refundMatch[1],apiBody()));}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'تعذر الاسترداد؛ راجع الاستخدام وحركة الخصم الأصلية وسجل التسليم',409);throw $e;}
}
if(preg_match('#^/network/stock/transfers/([0-9]+)/(quote|approve)$#',$path,$operationMatch)||$path==='/network/stock/adjustments'&&$method!=='GET'){
 $quote=($operationMatch[2]??'')==='quote';if($method!==($quote?'GET':'POST'))ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
 require_once dirname(__DIR__,2).'/includes/StockTransferApprovalService.php';require_once dirname(__DIR__,2).'/includes/DirectStockAdjustmentService.php';
 if((int)($_SERVER['CONTENT_LENGTH']??0)>262144)throw new InvalidArgumentException('REQUEST_TOO_LARGE');
 try{ApiResponse::ok($quote?(new StockTransferApprovalService($db,$authorizationContext))->quote((int)$operationMatch[1]):($path==='/network/stock/adjustments'?(new DirectStockAdjustmentService($db,$authorizationContext))->create(apiBody()):(new StockTransferApprovalService($db,$authorizationContext))->approve((int)$operationMatch[1],apiBody())));}catch(DomainException $e){if(!str_starts_with($e->getMessage(),'FORBIDDEN'))ApiResponse::error($e->getMessage(),'تعذر الاعتماد؛ راجع المعاينة وحالة المخزون والصلاحيات والحسابات',409);throw $e;}
}
if($method==='POST'&&preg_match('#^/network/stock/inventories/([0-9]+)/post$#',$path,$postingMatch)){
 require_once dirname(__DIR__,2).'/includes/StockInventoryPostingService.php';if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');
 try{ApiResponse::ok((new StockInventoryPostingService($db,$authorizationContext))->post((int)$postingMatch[1],apiBody()));}catch(DomainException $e){if(in_array($e->getMessage(),['INVENTORY_LOCKED','INVENTORY_STALE','SURPLUS_REQUIRES_CARD_IMPORT','POSTED_INVENTORY_INCOMPLETE','POSTING_BATCH_REQUIRED','CHART_ACCOUNT_INVALID'],true))ApiResponse::error($e->getMessage(),'تعذر الترحيل؛ يلزم مراجعة حالة الجرد والكروت والحسابات',409);throw $e;}
}
if($method==='GET'&&in_array($path,['/network/commerce/wallet','/network/commerce/instant-balance','/network/commerce/deliveries'],true)){
 require_once dirname(__DIR__,2).'/includes/CommerceReadService.php';$commerce=new CommerceReadService($db,$authorizationContext);
 ApiResponse::ok(match($path){'/network/commerce/wallet'=>$commerce->wallet($_GET),'/network/commerce/instant-balance'=>$commerce->instant($_GET),'/network/commerce/deliveries'=>$commerce->deliveries($_GET)});
}
if(($method==='POST'&&preg_match('#^/network/stock/transfers/([0-9]+)/reject$#',$path,$transferMatch))||($method==='DELETE'&&preg_match('#^/network/stock/transfers/([0-9]+)$#',$path,$transferMatch))){
 require_once dirname(__DIR__,2).'/includes/StockTransferStateService.php';if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('REQUEST_TOO_LARGE');
 try{ApiResponse::ok((new StockTransferStateService($db,$authorizationContext))->change((int)$transferMatch[1],$method==='DELETE'?'delete':'reject',apiBody()));}catch(DomainException $e){if($e->getMessage()==='IMMUTABLE_RECORD')ApiResponse::error('IMMUTABLE_RECORD','المستند مقفل أو له أثر مالي ولا يمكن تعديله',409);throw $e;}
}
if(($method==='POST'&&$path==='/network/stock/inventories')||($method==='PATCH'&&preg_match('#^/network/stock/inventories/([0-9]+)$#',$path,$draftMatch))){
 require_once dirname(__DIR__,2).'/includes/StockDraftService.php';$drafts=new StockDraftService($db,$authorizationContext);
 if((int)($_SERVER['CONTENT_LENGTH']??0)>262144)throw new InvalidArgumentException('REQUEST_TOO_LARGE');
 try{ApiResponse::ok($method==='POST'?$drafts->start(apiBody()):$drafts->save((int)$draftMatch[1],apiBody()));}catch(DomainException $e){if($e->getMessage()==='INVENTORY_LOCKED')ApiResponse::error('INVENTORY_LOCKED','الجرد مغلق ولا يقبل التعديل',409);if($e->getMessage()==='FORBIDDEN_LINE')ApiResponse::error('FORBIDDEN_LINE','صنف الجرد خارج نطاق المستند',403);throw $e;}
}
if($method==='GET'&&(in_array($path,['/network/admins','/network/stock/inventories','/network/stock/adjustments'],true)||preg_match('#^/network/(admins|accounts|stock/inventories)/([0-9]+)(?:/(statement))?$#',$path,$readMatch))){
 require_once dirname(__DIR__,2).'/includes/NetworkReadService.php';$reads=new NetworkReadService($db,$authorizationContext);
 if($path==='/network/admins')ApiResponse::ok($reads->admins($_GET));
 if($path==='/network/stock/inventories')ApiResponse::ok($reads->inventoryList('inventories',$_GET));
 if($path==='/network/stock/adjustments')ApiResponse::ok($reads->inventoryList('adjustments',$_GET));
 if(($readMatch[1]??'')==='admins'&&empty($readMatch[3]))ApiResponse::ok($reads->admin((int)$readMatch[2]));
 if(($readMatch[1]??'')==='accounts'&&($readMatch[3]??'')==='statement')ApiResponse::ok($reads->statement((int)$readMatch[2],$_GET));
 if(($readMatch[1]??'')==='stock/inventories'&&empty($readMatch[3]))ApiResponse::ok($reads->inventory((int)$readMatch[2],$_GET));
 ApiResponse::error('NOT_FOUND','المسار غير موجود',404);
}
if(in_array($path,['/network/clock','/network/appearance'],true)){
 require_once dirname(__DIR__,2).'/includes/NetworkConfigurationService.php';$configuration=new NetworkConfigurationService($db,$authorizationContext);
 if($method==='GET')ApiResponse::ok($path==='/network/clock'?$configuration->clock():$configuration->appearance());
 if(in_array($method,['POST','PATCH','DELETE'],true)){
  if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)throw new InvalidArgumentException('SETTINGS_TOO_LARGE');$body=apiBody();
  if($path==='/network/clock'&&$method!=='DELETE')ApiResponse::ok($configuration->saveClock($body));
  if($path==='/network/appearance')ApiResponse::ok($method==='DELETE'?$configuration->resetAppearance($body):$configuration->saveAppearance($body));
 }
 ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
}
if($path==='/integration/origins'){
 if($authorizationContext->role()!=='system_owner'&&$authorizationContext->id()!==1)throw new DomainException('FORBIDDEN');
 if($method==='GET'){$q=$db->query("SELECT setting_value FROM um_settings WHERE setting_key='integration_allowed_origins'");ApiResponse::ok(['origins'=>json_decode((string)$q->fetchColumn(),true)?:[]]);}
 if($method==='PATCH'){
  $origins=apiBody()['origins']??null;if(!is_array($origins)||count($origins)>25)throw new InvalidArgumentException('INVALID_ORIGINS');
  foreach($origins as $origin)if(!is_string($origin)||!preg_match('#^https://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$#',$origin))throw new InvalidArgumentException('HTTPS_ORIGIN_REQUIRED');
  $origins=array_values(array_unique($origins));$db->prepare("INSERT INTO um_settings(setting_key,setting_value) VALUES('integration_allowed_origins',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)")->execute([json_encode($origins,JSON_THROW_ON_ERROR)]);
  $authorizationContext->audit('integration.origins','allow','system',null,'updated');ApiResponse::ok(['origins'=>$origins]);
 }
 ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
}
if($path==='/network/setup'){
 $setup=new NetworkOnboardingService($db,$authorizationContext);
 if($method==='GET')ApiResponse::ok($setup->status());
 if(in_array($method,['POST','PATCH'],true)){
  if((int)($_SERVER['CONTENT_LENGTH']??0)>16384)ApiResponse::error('REQUEST_TOO_LARGE','حجم الطلب كبير',413);
  try{ApiResponse::ok($setup->save(apiBody()));}catch(DomainException $e){ApiResponse::error($e->getMessage(),$e->getMessage(),$e->getMessage()==='SETUP_CONFLICT'?409:403);}
 }
 ApiResponse::error('METHOD_NOT_ALLOWED','طريقة الطلب غير مسموحة',405);
}
if($method==='GET'&&$path==='/integration/catalog'){
 $catalog=json_decode(file_get_contents(__DIR__.'/integration-catalog.json'),true,512,JSON_THROW_ON_ERROR);
 ApiResponse::ok($catalog);
}
if($method==='GET'&&$path==='/integration/ui'){
 $definition=json_decode(file_get_contents(__DIR__.'/integration-ui.json'),true,512,JSON_THROW_ON_ERROR);
 $role=$authorizationContext->role();$owner=$role==='system_owner'||$authorizationContext->id()===1;
 $allowed=[];
 foreach($definition['menus'] as $menu){
  if(in_array($menu['id'],['sstp_vpn','network_subscriptions','system_settings'],true)&&!$owner)continue;
  if($menu['id']==='roles_permissions'&&!$owner&&$role!=='superadmin')continue;
  if($menu['id']==='network_setup'){if(!in_array($role,['system_owner','superadmin','network_manager','admin'],true))continue;}
  elseif(!$owner&&$role!=='superadmin'&&!$authorizationContext->can($menu['id']))continue;
  $allowed[]=$menu;
 }
 ApiResponse::ok(['network_id'=>$authorizationContext->activeNetworkId(),'role'=>$role,'permissions'=>$actor['effective_permissions']??[],'menus'=>$allowed,'authentication_modes'=>['same','username_only','different'],'api_base'=>'/api/v1','operations_base'=>'/api.php','server_enforces_permissions'=>true]);
}
if(str_starts_with($path,'/network/imports')){
 $authorizationContext->assertCan('users_import');
 // In-memory legacy identity only: no PHP session cookie is created for bearer clients.
 $_SESSION=['admin_id'=>$authorizationContext->id(),'admin_role'=>$authorizationContext->role(),'active_network_id'=>$authorizationContext->activeNetworkId(),'permissions'=>$actor['effective_permissions']??[]];
 $importer=$service->userManagerImport;
 if($method==='GET'&&$path==='/network/imports/routers')ApiResponse::ok($importer->listEligibleRouters());
 if($method==='POST'&&$path==='/network/imports/file-preview')ApiResponse::ok($importer->previewUpload($_FILES['file']??[],(int)($_POST['router_id']??0)));
 if($method==='POST'&&$path==='/network/imports/router-preview'){
  $input=apiBody();$id=(int)($input['router_id']??0);if($id<=0)throw new InvalidArgumentException('ROUTER_REQUIRED');
  $authorizationContext->assertRecordInActiveNetwork('nas',$id);
  $job=$jobs->create($authorizationContext->id(),'router_import_prepare',['network_id'=>$authorizationContext->activeNetworkId(),'router_id'=>$id,'credentials'=>['api_user'=>(string)($input['api_user']??''),'api_password'=>(string)($input['api_password']??''),'api_port'=>$input['api_port']??null,'require_usermanager'=>true]]);
  ApiResponse::ok($job,['poll_url'=>'/api/v1/jobs/'.$job['id']],202);
 }
 if(preg_match('#^/network/imports/([a-f0-9]{32})(?:/(cards)(?:/([0-9]+))?|/(commit))?$#',$path,$match)){
  $token=$match[1];
  if($method==='GET'&&($match[2]??'')==='cards'){
   if(!empty($match[3]))ApiResponse::ok($importer->getCardDetails($token,(int)($_GET['customer_id']??0),(int)$match[3]));
   if(isset($_GET['after_id']))ApiResponse::ok($importer->getPreviewCardsCursor($token,(int)$_GET['after_id'],(int)($_GET['limit']??100),[],(string)($_GET['card_kind']??'all')));
   ApiResponse::ok($importer->getPreviewCards($token,(int)($_GET['customer_id']??0),(int)($_GET['profile_id']??0),(int)($_GET['page']??1),(int)($_GET['limit']??100),(string)($_GET['search']??''),(string)($_GET['card_kind']??'')));
  }
  if($method==='DELETE'&&empty($match[2])&&empty($match[4]))ApiResponse::ok($importer->discardPreview($token));
  if($method==='POST'&&($match[4]??'')==='commit'){
   $input=apiBody();$ids=$input['source_user_ids']??[];$map=$input['profile_map']??[];$all=($input['import_all']??false)===true;
   if(!is_array($ids)||!is_array($map)||!$map||(!$all&&!$ids)||count($ids)>100000)throw new InvalidArgumentException('IMPORT_SELECTION_REQUIRED');
   if(!in_array($input['target_status']??'disabled',['active','disabled'],true))throw new InvalidArgumentException('INVALID_STATUS');
   $importer->getPreviewCards($token,0,0,1,10);
   $job=$jobs->create($authorizationContext->id(),'router_import_commit',['network_id'=>$authorizationContext->activeNetworkId(),'token'=>$token,'customer_id'=>(int)($input['customer_id']??0),'profile_map'=>$map,'source_user_ids'=>$ids,'import_all'=>$all,'included_profiles'=>$input['included_profiles']??[],'mode'=>$input['mode']??'all','target_status'=>$input['target_status']??'disabled']);
   ApiResponse::ok($job,['poll_url'=>'/api/v1/jobs/'.$job['id']],202);
  }
 }
 ApiResponse::error('NOT_FOUND','مسار الاستيراد غير موجود',404);
}
