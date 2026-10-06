<?php
declare(strict_types=1);
final class NetworkConfigurationService {
    public function __construct(private PDO $db,private AuthorizationContext $auth){}
    private function network():array {
        $id=$this->auth->activeNetworkId();if($id<=0||!$this->auth->canAccessNetwork($id))throw new DomainException('FORBIDDEN_NETWORK');
        $q=$this->db->prepare('SELECT id,name,status,auth_mode FROM um_networks WHERE id=?');$q->execute([$id]);$r=$q->fetch(PDO::FETCH_ASSOC);
        if(!$r||$r['status']!=='active')throw new DomainException('FORBIDDEN_NETWORK');return $r;
    }
    public function canEdit():bool{return in_array($this->auth->role(),['system_owner','superadmin','network_manager','admin'],true);}
    private function writeAccess(array $body):array {
        if(!$this->canEdit())throw new DomainException('FORBIDDEN');$r=$this->network();
        if(isset($body['network_id'])&&(int)$body['network_id']!==(int)$r['id'])throw new DomainException('FORBIDDEN_NETWORK');return $r;
    }
    public function clock():array {
        $r=$this->network();$q=$this->db->prepare("SELECT setting_value FROM um_network_settings WHERE network_id=? AND setting_key='timezone'");$q->execute([$r['id']]);$zone=(string)($q->fetchColumn()?:'Asia/Aden');$zones=DateTimeZone::listIdentifiers();
        if(!in_array($zone,$zones,true))$zone='Asia/Aden';
        return ['success'=>true,'network_id'=>(int)$r['id'],'timezone'=>$zone,'epoch_ms'=>(int)round(microtime(true)*1000),'can_edit'=>$this->canEdit(),'timezones'=>$this->canEdit()?$zones:[$zone]];
    }
    public function saveClock(array $body):array {
        $r=$this->writeAccess($body);$zone=$body['timezone']??null;
        if(!is_string($zone)||!in_array($zone,DateTimeZone::listIdentifiers(),true))throw new InvalidArgumentException('INVALID_TIMEZONE');
        $this->db->prepare("INSERT INTO um_network_settings(network_id,setting_key,setting_value,updated_by_admin_id) VALUES(?,'timezone',?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_admin_id=VALUES(updated_by_admin_id)")->execute([$r['id'],$zone,$this->auth->id()]);
        $this->auth->audit('network.clock','allow','network',(int)$r['id'],'updated');return $this->clock();
    }
    public function appearance():array {
        $r=$this->network();$q=$this->db->prepare("SELECT setting_value FROM um_network_settings WHERE network_id=? AND setting_key='network_ui_v1'");$q->execute([$r['id']]);$stored=json_decode((string)$q->fetchColumn(),true);$stored=is_array($stored)?$stored:[];$stored['password_mode']=$r['auth_mode'];
        return ['success'=>true,'network_id'=>(int)$r['id'],'can_edit'=>$this->canEdit(),'settings'=>is_array($stored)?$stored:[]];
    }
    private function lockedAppearanceMutation(array $body,bool $reset):array {
        $r=$this->writeAccess($body);$this->db->beginTransaction();
        try{$q=$this->db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$q->execute([$r['id']]);$result=$reset?$this->writeAppearanceReset($body):$this->writeAppearance($body);$this->db->commit();return $result;}
        catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    public function saveAppearance(array $body):array{return $this->lockedAppearanceMutation($body,false);}
    public function resetAppearance(array $body):array{return $this->lockedAppearanceMutation($body,true);}
    private function writeAppearance(array $body):array {
        $r=$this->writeAccess($body);if(strlen(json_encode($body,JSON_THROW_ON_ERROR))>16384)throw new InvalidArgumentException('SETTINGS_TOO_LARGE');
        $settings=$this->appearance()['settings'];
        $text=['system_name'=>120,'network_name'=>120,'system_short_name'=>40,'contact_phone'=>40,'system_address'=>300,'slogan'=>240,'direct_phones'=>300,'whatsapp_phone'=>40,'character_set'=>30,'password_mode'=>30,'base_currency'=>20];
        foreach($text as $key=>$max)if(array_key_exists($key,$body)){if(!is_string($body[$key])||mb_strlen($body[$key])>$max||preg_match('/[<>\x00-\x1f]/u',$body[$key]))throw new InvalidArgumentException('INVALID_'.$key);$settings[$key]=trim($body[$key]);}
        if(isset($body['logo_url'])){
            $v=$body['logo_url'];if(!is_string($v)||strlen($v)>500||preg_match('/["\x27<>\s\\\\]/u',$v)||($v!==''&&!preg_match('#^(https://[a-zA-Z0-9.-]+(?::[0-9]+)?/[^?\#]*\.(?:png|jpg|jpeg|webp|svg)|/?assets/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg))$#i',$v))||str_contains($v,'..'))throw new InvalidArgumentException('INVALID_LOGO');$settings['logo_url']=$v;
        }
        $enums=['layout_density'=>['normal','compact','comfortable'],'table_view_mode'=>['standard','compact','cards'],'system_template'=>['modern_clean','winbox_compact','mobile_pos','enterprise_dark','gold_luxury'],'character_set'=>['mixed','letters','numbers','uppercase'],'password_mode'=>['different','same','username_only']];
        foreach($enums as $key=>$values)if(isset($body[$key])){if(!is_string($body[$key])||!in_array($body[$key],$values,true))throw new InvalidArgumentException('INVALID_'.$key);$settings[$key]=$body[$key];}
        if(isset($body['theme_palette'])){
            if(!is_array($body['theme_palette'])||count($body['theme_palette'])>20)throw new InvalidArgumentException('INVALID_PALETTE');
            $palette=[];foreach($body['theme_palette'] as $key=>$value){if(!preg_match('/^[a-z_]{1,40}$/',(string)$key)||!is_string($value)||!preg_match('/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/',$value))throw new InvalidArgumentException('INVALID_PALETTE');$palette[$key]=$value;}$settings['theme_palette']=$palette;
        }
        if (isset($body['wallet_accounts'])) {
            if (!is_array($body['wallet_accounts']) || count($body['wallet_accounts']) > 20) throw new InvalidArgumentException('INVALID_WALLET_ACCOUNTS');
            $wallets=[];
            foreach ($body['wallet_accounts'] as $wallet) {
                if (!is_array($wallet)) throw new InvalidArgumentException('INVALID_WALLET_ACCOUNT');
                $account=trim((string)($wallet['account']??'')); $currencies=$wallet['currencies']??[];
                if ($account==='' || mb_strlen($account)>80 || !is_array($currencies) || count($currencies)>10) throw new InvalidArgumentException('INVALID_WALLET_ACCOUNT');
                $currencies=array_values(array_filter(array_map(static fn($v)=>strtoupper(trim((string)$v)), $currencies), static fn($v)=>preg_match('/^[A-Z0-9_ -]{2,20}$/',$v)));
                if (!$currencies) throw new InvalidArgumentException('INVALID_WALLET_CURRENCIES');
                $wallets[]=['account'=>$account,'currencies'=>$currencies];
            }
            $settings['wallet_accounts']=$wallets;
        }

        if(isset($body['password_mode']))$this->db->prepare('UPDATE um_networks SET auth_mode=? WHERE id=?')->execute([$body['password_mode'],$r['id']]);
        foreach(['module_labels','sidebar_layout','mobile_bottom_nav'] as $key)if(isset($body[$key])){
            if(!is_array($body[$key])||count($body[$key])>100)throw new InvalidArgumentException('INVALID_'.$key);
            array_walk_recursive($body[$key],static function($v){if(is_string($v)&&(mb_strlen($v)>200||preg_match('/[<>\x00-\x1f]/u',$v)))throw new InvalidArgumentException('INVALID_UI_TEXT');if(!is_scalar($v)&&$v!==null)throw new InvalidArgumentException('INVALID_UI_VALUE');});$settings[$key]=$body[$key];
        }
        $this->db->prepare("INSERT INTO um_network_settings(network_id,setting_key,setting_value,updated_by_admin_id) VALUES(?,'network_ui_v1',?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_admin_id=VALUES(updated_by_admin_id)")->execute([$r['id'],json_encode($settings,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$this->auth->id()]);
        $this->auth->audit('network.appearance','allow','network',(int)$r['id'],'updated');return $this->appearance();
    }
    private function writeAppearanceReset(array $body):array {
        $r=$this->writeAccess($body);if(($body['confirmation']??'')!=='استعادة إعدادات الواجهات')throw new InvalidArgumentException('CONFIRMATION_REQUIRED');
        $this->db->prepare("DELETE FROM um_network_settings WHERE network_id=? AND setting_key='network_ui_v1'")->execute([$r['id']]);$this->auth->audit('network.appearance','allow','network',(int)$r['id'],'reset');return $this->appearance();
    }
    public function applyAppearance(array $base):array {
        $s=$this->appearance()['settings'];$map=['system_name'=>'app_title','system_short_name'=>'app_short_title','contact_phone'=>'contact_phone','system_address'=>'system_address','logo_url'=>'logo_url','slogan'=>'slogan','direct_phones'=>'direct_phones','whatsapp_phone'=>'whatsapp_phone','character_set'=>'character_set','password_mode'=>'password_mode','base_currency'=>'base_currency','wallet_accounts'=>'wallet_accounts','layout_density'=>'layout_density','system_template'=>'system_template','theme_palette'=>'theme_palette','module_labels'=>'module_labels','sidebar_layout'=>'sidebar_layout','mobile_bottom_nav'=>'mobile_bottom_nav'];
        foreach($map as $from=>$to)if(array_key_exists($from,$s))$base[$to]=$s[$from];
        if(isset($s['table_view_mode']))$base['table_defaults']['view_mode']=$s['table_view_mode'];
        if($s)$base['settings_source']='network';return $base;
    }
}
