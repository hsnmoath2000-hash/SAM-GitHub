<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') exit(1);
function required(string $name): string { $v=getenv($name);if($v===false||$v==='')throw new RuntimeException('Missing '.$name);return $v; }
$config=[
 'db_host'=>'127.0.0.1','db_port'=>(int)(getenv('SAM_DB_PORT')?:3306),'db_name'=>'radius','db_user'=>'sam_app','db_pass'=>required('SAM_DB_PASSWORD'),
 'app_name'=>'SAM — إدارة الشبكات','app_version'=>'2026.10.06-onboarding-api-v3','timezone'=>required('SAM_TIMEZONE'),
 'default_coa_port'=>3799,'radclient_path'=>'/usr/bin/radclient','https_only'=>true,
 'session_idle_seconds'=>3600,'session_absolute_seconds'=>43200,
 'registration_payload_key'=>bin2hex(random_bytes(32))
];
date_default_timezone_set($config['timezone']);
$path=getenv('SAM_CONFIG_OUTPUT')?:'/etc/mikrotik-usermanager/app-config.php';
if(file_exists($path))throw new RuntimeException('Protected config already exists');
$db=new PDO('mysql:host=127.0.0.1;port='.$config['db_port'].';dbname=radius;charset=utf8mb4','sam_app',$config['db_pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
function insertRows(PDO $db,string $table,array $rows): void {
 foreach($rows as $row){$cols=array_keys($row);$q=$db->prepare('INSERT INTO `'.$table.'` (`'.implode('`,`',$cols).'`) VALUES('.implode(',',array_fill(0,count($cols),'?')).')');$q->execute(array_map(static fn($v)=>is_array($v)?json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE):$v,array_values($row)));}
}
$db->beginTransaction();
try {
 foreach(['permissions'=>'um_permission_catalog','roles'=>'um_roles_def','role-permissions'=>'um_role_permissions'] as $file=>$table){
  $rows=json_decode(file_get_contents(__DIR__.'/database/'.$file.'.json'),true,512,JSON_THROW_ON_ERROR);
  insertRows($db,$table,$rows);
 }
 insertRows($db,'um_admins',[[
  'id'=>1,'username'=>required('SAM_OWNER_USER'),'fullname'=>required('SAM_OWNER_NAME'),
  'password_hash'=>password_hash(required('SAM_OWNER_PASSWORD'),PASSWORD_DEFAULT),'role'=>'system_owner',
  'permissions'=>'["*"]','is_active'=>1,'data_scope'=>'all','must_change_password'=>0,
  'phone'=>getenv('SAM_OWNER_PHONE')?:null
 ]]);
 insertRows($db,'um_system_owners',[['admin_id'=>1]]);
 insertRows($db,'um_networks',[['id'=>1,'code'=>'NET-001','name'=>required('SAM_NETWORK_NAME'),'status'=>'active','created_by'=>1]]);
 insertRows($db,'um_admin_network_access',[['admin_id'=>1,'network_id'=>1,'access_level'=>'owner','is_default'=>1,'is_active'=>1,'granted_by_admin_id'=>1]]);
 insertRows($db,'um_admin_network_roles',[['admin_id'=>1,'network_id'=>1,'role_key'=>'system_owner','data_scope'=>'all','is_active'=>1,'assigned_by_admin_id'=>1]]);
 insertRows($db,'um_admin_network_balances',[['admin_id'=>1,'network_id'=>1,'balance'=>0,'credit_limit'=>0,'currency_code'=>'YER']]);
 insertRows($db,'um_network_plans',[['id'=>1,'plan_code'=>'starter','name'=>'الخطة الافتراضية','monthly_price'=>0,'annual_price'=>0,'currency_code'=>'YER','is_active'=>1,'allow_api'=>1,'allow_whatsapp'=>1,'allow_advanced_reports'=>1,'allow_manual_backup'=>1,'allow_download'=>1]]);
 insertRows($db,'um_network_subscriptions',[['network_id'=>1,'plan_id'=>1,'status'=>'active','is_enabled'=>1,'starts_at'=>date('Y-m-d H:i:s'),'timezone'=>$config['timezone']]]);
 insertRows($db,'um_network_settings',[['network_id'=>1,'setting_key'=>'timezone','setting_value'=>$config['timezone'],'is_secret'=>0,'updated_by_admin_id'=>1]]);
 $currency=['currency_code'=>'YER','currency_name'=>'ريال يمني','currency_symbol'=>'ر.ي','is_base_currency'=>1,'exchange_rate'=>1,'is_active'=>1];
 insertRows($db,'um_exchange_rates',[$currency]);
 insertRows($db,'um_network_exchange_rates',[['network_id'=>1]+$currency]);
 insertRows($db,'um_speed_tiers',[
  ['network_id'=>1,'label'=>'اقتصادي 1 ميجابت','rate_limit'=>'512K/1M','sort_order'=>1],
  ['network_id'=>1,'label'=>'عادي 2 ميجابت','rate_limit'=>'1M/2M','sort_order'=>2],
  ['network_id'=>1,'label'=>'سريع 5 ميجابت','rate_limit'=>'2M/5M','sort_order'=>3]
 ]);
 insertRows($db,'um_card_templates',[['network_id'=>1,'name'=>'قالب الطباعة الافتراضي','network_name'=>required('SAM_NETWORK_NAME'),'cards_per_page'=>24,'hotspot_url'=>'http://10.5.50.1/login']]);
 $accountIds=[];
 foreach(json_decode(file_get_contents(__DIR__.'/database/chart.json'),true,512,JSON_THROW_ON_ERROR) as $account){
  $parent=$account['parent_code'];unset($account['parent_code']);
  $account['parent_id']=$parent!==null?($accountIds[$parent]??null):null;
  insertRows($db,'um_chart_of_accounts',[$account+['network_id'=>1,'is_active'=>1,'balance'=>0,'owner_admin_id'=>1]]);
  $accountIds[$account['account_code']]=(int)$db->lastInsertId();
 }
 $settings=[
  'system_name'=>'SAM','organization_name'=>'SAM','ui_app_title'=>'SAM — إدارة الشبكات','ui_app_short_title'=>'SAM',
  'network_name'=>required('SAM_NETWORK_NAME'),'system_public_domain'=>'https://'.required('SAM_DOMAIN'),
  'public_server_name'=>required('SAM_DOMAIN'),'application_port'=>'8099','currency_code'=>'YER',
  'whatsapp_api_url'=>'http://127.0.0.1:3388','whatsapp_enabled'=>'0','telegram_enabled'=>'0','telegram_bot_token'=>'','telegram_chat_id'=>'',
  'sstp_server_vpn_enabled'=>'0','sstp_server_vpn_host'=>required('SAM_DOMAIN'),'sstp_server_vpn_port'=>'4406',
  'sstp_radius_host'=>required('SAM_DOMAIN'),'sstp_radius_port'=>'4406','sstp_radius_gateway'=>'10.101.0.1',
  'backup_radius_enabled'=>'0','um_proxy_enabled'=>'0','system_owner_whatsapp_owner_phone'=>getenv('SAM_OWNER_PHONE')?:''
 ];
 foreach($settings as $key=>$value)insertRows($db,'um_settings',[['setting_key'=>$key,'setting_value'=>$value]]);
 $db->commit();
} catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
file_put_contents($path,"<?php\ndeclare(strict_types=1);\nreturn ".var_export($config,true).";\n",LOCK_EX);
chmod($path,0640);
echo "Default catalog, one network, and a new system owner created. No operational records copied.\n";
