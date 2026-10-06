<?php
declare(strict_types=1);

/** Network-scoped setup state. Reading this service never probes or changes routers. */
final class NetworkOnboardingService {
    private const KEY = 'onboarding_v1';
    public const MODES = ['cards', 'distribution', 'mixed'];
    public const QUICK = ['generate','sell','print','subscriber','renew','receipt','payment','sessions','router','message'];
    public function __construct(private PDO $db, private AuthorizationContext $auth) {}
    private function network(): array {
        $id=$this->auth->activeNetworkId();
        if($id<=0 || !$this->auth->canAccessNetwork($id)) throw new DomainException('FORBIDDEN_NETWORK');
        $q=$this->db->prepare('SELECT id,name,code,status,auth_mode,created_at FROM um_networks WHERE id=?');$q->execute([$id]);
        $n=$q->fetch(PDO::FETCH_ASSOC);if(!$n)throw new DomainException('NETWORK_NOT_FOUND');return $n;
    }
    public function manager(): bool {
        return in_array($this->auth->role(),['system_owner','superadmin','network_manager','admin'],true);
    }
    private function settings(int $id): array {
        $q=$this->db->prepare("SELECT setting_key,setting_value FROM um_network_settings WHERE network_id=? AND (setting_key=? OR setting_key='timezone')");$q->execute([$id,self::KEY]);
        $s=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)$s[$r['setting_key']]=$r['setting_value'];return $s;
    }
    public function status(): array {
        $n=$this->network();$id=(int)$n['id'];$s=$this->settings($id);$m=json_decode($s[self::KEY]??'{}',true)?:[];
        $sql="SELECT
          (SELECT COUNT(*) FROM um_routers WHERE network_id=? AND disabled=0) routers,
          (SELECT MAX(last_checked_at) FROM um_router_status_monitor WHERE network_id=? AND last_status='online' AND last_checked_at>=NOW()-INTERVAL 5 MINUTE) router_seen,
          (SELECT MAX(authdate) FROM radpostauth WHERE network_id=? AND reply='Access-Accept' AND authdate>=NOW()-INTERVAL 20 MINUTE) radius_seen,
          (SELECT COUNT(*) FROM um_profiles_def WHERE network_id=? AND name<>'' AND validity<>'' AND shared_users>0) packages,
          (SELECT COUNT(*) FROM um_card_templates WHERE network_id=?) templates,
          (SELECT COUNT(*) FROM um_card_templates WHERE network_id=? AND id=?) default_template,
          (SELECT COUNT(*) FROM um_hotspot_settings WHERE network_id=? AND (theme_json IS NOT NULL OR brand_json IS NOT NULL)) hotspot,
          (SELECT COUNT(*) FROM um_network_cashboxes c JOIN um_chart_of_accounts a ON a.id=c.account_id AND a.network_id=c.network_id WHERE c.network_id=? AND c.is_active=1) cashboxes,
          (SELECT COUNT(*) FROM um_whatsapp_templates WHERE network_id=? AND is_active=1) message_templates,
          (SELECT COUNT(*) FROM um_network_channels WHERE network_id=? AND channel_type='whatsapp' AND is_enabled=1 AND status='CONNECTED') channels,
          (SELECT MAX(acctupdatetime) FROM radacct WHERE network_id=? AND acctstoptime IS NULL AND username NOT REGEXP '^router_[0-9]+$' AND acctupdatetime>=NOW()-INTERVAL 20 MINUTE) card_seen";
        $q=$this->db->prepare($sql);$q->execute([$id,$id,$id,$id,$id,$id,(int)($m['default_template_id']??0),$id,$id,$id,$id,$id]);$e=$q->fetch(PDO::FETCH_ASSOC);
        $p=$m['users'][(string)$this->auth->id()]??[];
        $defs=[
          ['identity','تعريف الشبكة ونمط التشغيل','required','networks_partnerships',!empty($m['mode'])&&!empty($s['timezone']),'اختر طريقة عمل الشبكة وراجع هويتها.'],
          ['connection','الراوتر والربط','required','routers',(int)$e['routers']>0&&!empty($e['router_seen'])&&!empty($e['radius_seen']),'أضف الراوتر ونفّذ سكربت الربط. آخر فحص اتصال ونجاح RADIUS دليلان منفصلان؛ نسخ السكربت لا يثبت الاتصال.'],
          ['packages','الباقات وسياسة الاستخدام','required','profiles',(int)$e['packages']>0,'أنشئ باقة بالمدة والسرعة وعدد الأجهزة. سعر التوزيع منفصل عن سعر العميل وتكلفة الشراء الفعلية.'],
          ['hotspot','الهوتسبوت وشروط الشبكة','required','hotspot_designer',(int)$e['hotspot']>0&&isset($m['policy']),'احفظ تصميم الصفحة والشروط، ثم جهز ملفات النشر. حفظ التصميم لا يثبت نشره على الراوتر.'],
          ['cards','قالب الكروت والتجربة','required','templates',(int)$e['default_template']>0&&!empty($e['card_seen']),'اعتمد قالبًا افتراضيًا، ثم جرّب كرتًا على الراوتر. إنشاء الكرت لا يكفي لاعتبار الاختبار ناجحًا.'],
          ['finance','البيع والمحاسبة','before_sale','cashbox_accounts',(int)$e['cashboxes']>0,'راجع الصناديق والحسابات ونقاط البيع قبل العمليات المالية.'],
          ['messaging','الرسائل والتنبيهات','optional','whatsapp_manager',(int)$e['channels']>0&&(int)$e['message_templates']>0,'اربط قناة الشبكة وراجع قوالب الرسائل. توصيل الهاتف لا يثبت تسليم الرسائل.'],
          ['customize','الواجهة والتقارير والإدارة','optional','ui_customizer',!empty($m['customization_reviewed']),'راجع الواجهة والتقارير والصلاحيات والنسخ الاحتياطية؛ حفظ التفضيلات لا يثبت استعادة نسخة احتياطية.']
        ];
        $steps=[];$done=0;$skipped=0;
        foreach($defs as [$key,$title,$required,$tab,$complete,$hint]){
            $skip=in_array($key,$m['skipped']??[],true)&&$required!=='required';
            if($complete)$done++;elseif($skip)$skipped++;
            $steps[]=['id'=>$key,'title'=>$title,'requirement'=>$required,'tab'=>$tab,'state'=>$complete?'complete':($skip?'skipped':'pending'),'hint'=>$hint];
        }
        $next=null;foreach($steps as $st)if($st['state']==='pending'){$next=$st['id'];break;}
        $t=$this->db->prepare('SELECT id,name FROM um_card_templates WHERE network_id=? ORDER BY id LIMIT 100');$t->execute([$id]);
        $cutoff=defined('SAM_ONBOARDING_RELEASE_AT')?SAM_ONBOARDING_RELEASE_AT:'2099-01-01 00:00:00';
        return ['success'=>true,'network'=>$n,'network_id'=>$id,'eligible'=>$this->manager(),'active'=>$n['status']==='active',
          'revision'=>(int)($m['revision']??0),'mode'=>$m['mode']??'cards','timezone'=>$s['timezone']??'Asia/Aden',
          'policy'=>$m['policy']??['text'=>'','required'=>false],'default_template_id'=>(int)($m['default_template_id']??0),
          'templates'=>$t->fetchAll(PDO::FETCH_ASSOC),'preferences'=>$p,'steps'=>$steps,'complete'=>$done,'skipped'=>$skipped,'total'=>8,'next'=>$next,
          'auto_open'=>$this->manager()&&$n['status']==='active'&&empty($p['seen'])&&empty($p['dismissed'])&&($n['created_at']>=$cutoff||!empty($m['auto_pending'])),
          'evidence'=>['routers'=>(int)$e['routers'],'router_seen'=>$e['router_seen'],'radius_seen'=>$e['radius_seen'],'packages'=>(int)$e['packages'],'hotspot_saved'=>(bool)$e['hotspot'],'card_seen'=>$e['card_seen'],'cashboxes'=>(int)$e['cashboxes'],'channels'=>(int)$e['channels'],'message_templates'=>(int)$e['message_templates']],
          'limitations'=>['لا توجد قناة SMS مهيأة في هذه النسخة.','نشر الهوتسبوت وتسليم الرسائل واستعادة النسخ تحتاج اختبارًا فعليًا منفصلًا.']];
    }
    private function put(int $id,string $key,string $value): void {
        $q=$this->db->prepare('INSERT INTO um_network_settings(network_id,setting_key,setting_value,updated_by_admin_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_admin_id=VALUES(updated_by_admin_id)');
        $q->execute([$id,$key,$value,$this->auth->id()]);
    }
    public function save(array $input): array {
        $n=$this->network();$id=(int)$n['id'];
        if(!$this->manager())throw new DomainException('FORBIDDEN_SETUP_WRITE');
        if($n['status']!=='active')throw new DomainException('NETWORK_NOT_ACTIVE');
        if(isset($input['network_id'])&&(int)$input['network_id']!==$id)throw new DomainException('FORBIDDEN_NETWORK');
        $op=(string)($input['operation']??'');
        if(!in_array($op,['identity','policy','template','preferences','skip','review'],true))throw new InvalidArgumentException('INVALID_OPERATION');
        if(!isset($input['revision'])||!is_int($input['revision']))throw new InvalidArgumentException('REVISION_REQUIRED');
        $this->db->beginTransaction();
        try {
            // Serialize network setup updates; the existing network row is always present.
            $q=$this->db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$q->execute([$id]);
            $s=$this->settings($id);$m=json_decode($s[self::KEY]??'{}',true)?:[];
            if((int)($m['revision']??0)!==$input['revision'])throw new DomainException('SETUP_CONFLICT');
            if($op==='identity'){
                $name=trim((string)($input['name']??''));$mode=(string)($input['mode']??'');$tz=(string)($input['timezone']??'');$authMode=(string)($input['auth_mode']??'');
                if($name===''||mb_strlen($name)>128||!in_array($mode,self::MODES,true)||!in_array($authMode,['same','username_only','different'],true)||!in_array($tz,timezone_identifiers_list(),true))throw new InvalidArgumentException('INVALID_IDENTITY');
                // Only the default for future generation changes; existing credentials are never rewritten.
                $this->db->prepare('UPDATE um_networks SET name=?,auth_mode=? WHERE id=?')->execute([$name,$authMode,$id]);$m['mode']=$mode;$this->put($id,'timezone',$tz);
            } elseif($op==='policy'){
                if(!is_string($input['text']??null)||!is_bool($input['required']??null)||mb_strlen($input['text'])>5000)throw new InvalidArgumentException('INVALID_POLICY');
                $text=trim($input['text']);if($input['required']&&$text==='')throw new InvalidArgumentException('POLICY_TEXT_REQUIRED');
                $m['policy']=['text'=>$text,'required'=>$input['required']];
            } elseif($op==='template'){
                $tid=(int)($input['template_id']??0);$q=$this->db->prepare('SELECT 1 FROM um_card_templates WHERE network_id=? AND id=?');$q->execute([$id,$tid]);
                if(!$q->fetchColumn())throw new DomainException('FORBIDDEN_TEMPLATE');$m['default_template_id']=$tid;
            } elseif($op==='skip'){
                $key=(string)($input['step']??'');if(!in_array($key,['finance','messaging','customize'],true))throw new InvalidArgumentException('STEP_REQUIRED');
                $list=$m['skipped']??[];$list=array_values(array_diff($list,[$key]));if(!empty($input['skip']))$list[]=$key;$m['skipped']=$list;
            } elseif($op==='review'){$m['customization_reviewed']=true;
            } else {
                $pref=$m['users'][(string)$this->auth->id()]??[];
                if(isset($input['step'])){if(!in_array($input['step'],['identity','connection','packages','hotspot','cards','finance','messaging','customize'],true))throw new InvalidArgumentException('INVALID_STEP');$pref['step']=$input['step'];}
                foreach(['seen','dismissed','hide_hints'] as $k)if(isset($input[$k])){if(!is_bool($input[$k]))throw new InvalidArgumentException('INVALID_PREFERENCE');$pref[$k]=$input[$k];}
                if(isset($input['shortcuts'])){
                    $list=$input['shortcuts'];if(!is_array($list)||count($list)>10||count($list)!==count(array_unique($list)))throw new InvalidArgumentException('INVALID_SHORTCUTS');
                    foreach($list as $key)if(!is_string($key)||!in_array($key,self::QUICK,true))throw new InvalidArgumentException('INVALID_SHORTCUTS');$pref['shortcuts']=$list;
                }
                $m['users'][(string)$this->auth->id()]=$pref;
            }
            $m['revision']=(int)($m['revision']??0)+1;
            $json=json_encode($m,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);if(strlen($json)>65536)throw new InvalidArgumentException('SETUP_TOO_LARGE');
            $this->put($id,self::KEY,$json);$this->db->commit();
        } catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
        return $this->status();
    }
}
