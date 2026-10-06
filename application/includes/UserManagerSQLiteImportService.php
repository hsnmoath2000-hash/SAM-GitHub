<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';

final class UserManagerRouterTransferException extends RuntimeException {
    public string $publicCode;
    public function __construct(string $message, string $publicCode = 'ROUTER_TRANSFER_FAILED', ?Throwable $previous = null) {
        parent::__construct($message, 0, $previous);
        $this->publicCode = $publicCode;
    }
}

/**
 * Network-bound, resilient importer for RouterOS User Manager, Hotspot, SQLite backups, and CSV/Text files.
 */
final class UserManagerSQLiteImportService extends BaseService {
    private static function normalizeCardCredential(string $value): string {
        $normalized=preg_replace('/[\s\p{Z}]+/u','',$value);
        if($normalized===null)throw new RuntimeException('ترميز رقم الكرت أو كلمة المرور غير صالح');
        return $normalized;
    }
    private function importMode(): string {
        $q=$this->db->prepare('SELECT auth_mode FROM um_networks WHERE id=?');$q->execute([$this->getActiveNetworkId()]);
        $mode=(string)$q->fetchColumn();if(!in_array($mode,['same','username_only','different'],true))throw new RuntimeException('نمط دخول الشبكة غير صالح');return $mode;
    }
    private function importPassword(string $username,string $source,string $mode,string $token): string {
        if($mode==='same')return $username;
        if($mode==='username_only')return '';
        $password=self::normalizeCardCredential($source);
        if($password!==''&&$password!==$username)return $password;
        // The private preview token makes the generated password stable across preview and commit.
        $password=substr(hash_hmac('sha256','sam-import-password:'.$username,$token),0,12);
        if($password===$username)$password.='a';return $password;
    }
    private function importActorId(): int {
        $context=$GLOBALS['sam_request_authorization_context']??null;
        return $context instanceof AuthorizationContext?$context->id():(int)($_SESSION['admin_id']??0);
    }
    private static function routerDurationSeconds(string $value): int {
        $value=trim($value);if(is_numeric($value))return max(0,(int)$value);
        $seconds=0;$weights=['w'=>604800,'d'=>86400,'h'=>3600,'m'=>60,'s'=>1];
        preg_match_all('/([0-9]+(?:\.[0-9]+)?)([wdhms])/',$value,$parts,PREG_SET_ORDER);
        foreach($parts as $part)$seconds+=(float)$part[1]*$weights[$part[2]];
        $remaining=preg_replace('/[0-9]+(?:\.[0-9]+)?[wdhms]/','',$value);
        if(preg_match('/^(\d+):(\d{2}):(\d{2})$/',$remaining,$clock))$seconds+=(int)$clock[1]*3600+(int)$clock[2]*60+(int)$clock[3];
        return max(0,(int)$seconds);
    }

    private const MAX_BYTES = 67108864; // 64 MB
    private const TOKEN_RE = '/^[a-f0-9]{32}$/';

    public function listEligibleRouters(): array {
        $this->enforcePermission('users_import', 'استيراد قاعدة User Manager');
        $networkId = $this->getActiveNetworkId();
        $q = $this->db->prepare("SELECT id, shortname, nasname, work_types, api_enabled, api_user, api_password, api_port FROM nas
            WHERE network_id = ?
            ORDER BY (FIND_IN_SET('usermanager', LOWER(COALESCE(work_types, ''))) > 0) DESC, shortname, id");
        $q->execute([$networkId]);
        $routers = $q->fetchAll(PDO::FETCH_ASSOC);
        foreach ($routers as &$router) {
            $router['api_credentials_configured'] = trim((string)($router['api_user'] ?? '')) !== '' && trim((string)($router['api_password'] ?? '')) !== '';
            $router['api_port_configured'] = (int)($router['api_port'] ?? 0) > 0;
            $router['api_user_hint'] = trim((string)($router['api_user'] ?? ''));
            unset($router['api_password'], $router['api_user']);
        }
        unset($router);
        return ['success' => true, 'network_id' => $networkId, 'routers' => $routers];
    }

    /**
     * Connect directly to MikroTik Router via RouterOS API, fetch users/profiles, and create a preview database.
     */
    public function prepareRouterTransfer(int $routerId, array $credentials = []): array {
        $this->enforcePermission('users_import', 'استيراد قاعدة User Manager');
        $networkId = $this->getActiveNetworkId();
        $this->assertEligibleRouter($routerId, $networkId);
        
        $requireUserManager=!empty($credentials['require_usermanager']);
        $custom = [];
        $apiUser = trim((string)($credentials['api_user'] ?? ''));
        $apiPassword = (string)($credentials['api_password'] ?? '');
        $apiPort = filter_var($credentials['api_port'] ?? null, FILTER_VALIDATE_INT);
        if ($apiUser !== '') $custom['api_user'] = $apiUser;
        if ($apiPassword !== '') $custom['api_password'] = $apiPassword;
        if ($apiPort !== false && $apiPort !== null) {
            if ($apiPort < 1 || $apiPort > 65535) throw new RuntimeException('منفذ API يجب أن يكون بين 1 و65535');
            $custom['api_port'] = $apiPort;
        }

        $routerService = $this->radius?->getRouterRadiusService();
        if (!$routerService) throw new RuntimeException('خدمة اتصال الراوتر غير متاحة');
        $routerCfg = $routerService->getRouterConnectionConfig($routerId, $custom);
        
        if ((int)($routerCfg['router']['api_enabled'] ?? 1) !== 1) {
            throw new UserManagerRouterTransferException('الراوتر معطّل التحكم به عبر API. فعّل الإدارة والتحكم الشامل من إعدادات هذا الراوتر ثم أعد المحاولة.', 'ROUTER_API_DISABLED');
        }
        if (trim((string)$routerCfg['user']) === '' || trim((string)$routerCfg['pass']) === '') {
            throw new UserManagerRouterTransferException('بيانات API غير مكتملة. أدخل اسم المستخدم وكلمة المرور والمنفذ أو احفظها في إعدادات الراوتر.', 'ROUTER_API_CREDENTIALS_REQUIRED');
        }

        require_once __DIR__ . '/RouterOSApi.php';
        $api = new RouterOSApi();
        $api->timeout = 30;
        
        if (!$api->connect($routerCfg['ip'], $routerCfg['user'], $routerCfg['pass'], (int)$routerCfg['port'], (bool)$routerCfg['ssl'], 30)) {
            throw new RuntimeException('تعذر الاتصال بواجهة API للراوتر: ' . ($api->error_str ?: 'تحقق من العنوان والمنفذ وبيانات الدخول'));
        }

        $resource=$api->comm('/system/resource/print');
        $version=(string)($resource[0]['version']??'');
        if(!preg_match('/^([67])\./',$version,$vm)){$api->disconnect();throw new UserManagerRouterTransferException('تعذر التحقق من إصدار RouterOS v6 أو v7','ROUTER_VERSION_UNAVAILABLE');}
        $major=(int)$vm[1];$sourceType='User Manager v'.$major;
        $base=$major===6?'/tool/user-manager':'/user-manager';
        $dir='/var/lib/mikrotik-usermanager/usermanager-imports';
        if(!is_dir($dir)&&!mkdir($dir,0700,true)){$api->disconnect();throw new RuntimeException('تعذر إنشاء مساحة المعاينة');}
        chmod($dir,0700);$this->cleanupExpired();$token=bin2hex(random_bytes(16));$path=$dir.'/'.$token.'.preview.sqlite';$ok=false;
        try{
            $sqlite=new PDO('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);chmod($path,0600);
            $sqlite->exec('PRAGMA cache_size=-8192; CREATE TABLE customer(custId INTEGER PRIMARY KEY); INSERT INTO customer VALUES(1); CREATE TABLE profile(id INTEGER PRIMARY KEY,custId INTEGER,name TEXT,validity TEXT,startsAt TEXT,freeTrial TEXT,dynamicPrice REAL,price REAL,nameForUser TEXT,sharedUsers INTEGER); CREATE INDEX idx_profile_name ON profile(name); CREATE TABLE user(id INTEGER PRIMARY KEY,custId INTEGER,userName TEXT,password TEXT,groupName TEXT,disabled INTEGER,regDate TEXT,actualProfileId INTEGER,actualProfileName TEXT,uptimeUsed INTEGER,downloadUsed INTEGER,uploadUsed INTEGER); CREATE TABLE sam_user_profiles(user TEXT PRIMARY KEY,profile TEXT,priority INTEGER)');
            $sqlite->beginTransaction();
            if($major===7){
                $assign=$sqlite->prepare('INSERT INTO sam_user_profiles VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET profile=excluded.profile,priority=excluded.priority WHERE excluded.priority>sam_user_profiles.priority');
                $api->comm($base.'/user-profile/print',[],function(array $row)use($assign){$user=(string)($row['user']??'');$profile=(string)($row['profile']??'');if($user===''||$profile==='')return;$state=(string)($row['state']??'');$priority=match($state){'running active','active'=>3,'running'=>2,'waiting'=>1,default=>0};$assign->execute([$user,$profile,$priority]);});
                if($api->lastError!==null||!$api->lastDone){throw new UserManagerRouterTransferException('تعذرت قراءة ربط الباقات في User Manager v7','USERMANAGER_PROFILES_UNAVAILABLE');}
            }
            $insertProfile=$sqlite->prepare('INSERT INTO profile(custId,name,validity,startsAt,price,nameForUser,sharedUsers) VALUES(1,?,?,?,?,?,?)');
            $profileLookup=$sqlite->prepare('SELECT id FROM profile WHERE name=? LIMIT 1');
            $loadProfiles=function(string $cmd)use($api,$insertProfile){$api->comm($cmd,[],function(array $row)use($insertProfile){$name=trim((string)($row['name']??''));if($name==='')return;$insertProfile->execute([$name,(string)($row['validity']??$row['session-timeout']??'0s'),(string)($row['starts-at']??''),(float)($row['price']??0),$name,max(1,(int)($row['shared-users']??$row['override-shared-users']??1))]);});};
            $loadProfiles($base.'/profile/print');
            if($api->lastError!==null||!$api->lastDone)throw new UserManagerRouterTransferException('تعذرت قراءة باقات User Manager؛ تحقق من الحزمة وصلاحيات API','USERMANAGER_PROFILES_UNAVAILABLE');
            $insertUser=$sqlite->prepare('INSERT INTO user VALUES(?,1,?,?,?,?,?,?,?,?,?,?)');
            $assigned=$sqlite->prepare('SELECT profile FROM sam_user_profiles WHERE user=?');$counter=0;
            $capture=function(array $row)use($sqlite,$assigned,$insertUser,$insertProfile,$profileLookup,&$counter){
                $rawName=(string)($row['name']??$row['username']??'');$name=self::normalizeCardCredential($rawName);
                if($name===''||$name==='default-trial'||preg_match('/^router_[0-9]+$/i',$name))return;
                $assigned->execute([$rawName]);$assignedProfile=(string)$assigned->fetchColumn();$profile=trim((string)($row['actual-profile']??$row['profile']??($assignedProfile!==''?$assignedProfile:($row['group']??$row['group-name']??''))));
                if($profile==='')$profile='غير مرتبط - راجع الباقة';
                $profileLookup->execute([$profile]);$pid=$profileLookup->fetchColumn();
                if(!$pid){$insertProfile->execute([$profile,'0s','',0,$profile,1]);$pid=(int)$sqlite->lastInsertId();}
                $password=self::normalizeCardCredential((string)($row['password']??''));
                $disabled=in_array($row['disabled']??false,[true,1,'true','yes'],true)?1:0;
                $uptime=self::routerDurationSeconds((string)($row['total-uptime']??$row['uptime-used']??$row['uptime']??'0'));
                $download=(int)($row['total-download']??$row['download-used']??$row['bytes-out']??0);$upload=(int)($row['total-upload']??$row['upload-used']??$row['bytes-in']??0);
                $insertUser->execute([++$counter,$name,$password,$profile,$disabled,date('Y-m-d H:i:s'),$pid,$profile,$uptime,$download,$upload]);
                if($counter%1000===0){$sqlite->commit();$sqlite->beginTransaction();}
            };
            $api->comm($base.'/user/print',[],$capture);
            if($api->lastError!==null||!$api->lastDone)throw new UserManagerRouterTransferException('لم تكتمل قراءة كروت User Manager؛ لم تُعتمد قراءة جزئية','USERMANAGER_READ_INCOMPLETE');
            if($counter===0)throw new UserManagerRouterTransferException('لم توجد كروت User Manager قابلة للاستيراد في هذا الراوتر','USERMANAGER_NOT_AVAILABLE');
            $sqlite->commit();$summary=$this->makeSummary($sqlite);$sqlite=null;
            $stage=['admin_id'=>$this->importActorId(),'auth_mode'=>$this->importMode(),'network_id'=>$networkId,'router_id'=>$routerId,'path'=>$path,'expires_at'=>time()+3600];
            $_SESSION['sam_um_imports'][$token]=$stage;
            if(file_put_contents($path.'.meta.json',json_encode($stage,JSON_THROW_ON_ERROR),LOCK_EX)===false)throw new RuntimeException('تعذر حفظ المعاينة');chmod($path.'.meta.json',0600);$ok=true;
            return ['success'=>true,'ready'=>true,'token'=>$token,'ticket'=>$token,'network_id'=>$networkId,'router_id'=>$routerId,'routeros_version'=>$version,'source_type'=>$sourceType,'summary'=>$summary,'message'=>"قُرئت {$counter} بطاقة على دفعات. راجع الباقات ونمط الدخول قبل الاعتماد."];
        }finally{
            $api->disconnect();$sqlite=null;if(!$ok){@unlink($path);@unlink($path.'.meta.json');unset($_SESSION['sam_um_imports'][$token]);}
        }
    }

    public function receiveRouterTransfer(string $ticket): array {
        $this->enforcePermission('users_import', 'استيراد قاعدة User Manager');
        if (isset($_SESSION['sam_um_imports'][$ticket])) {
            [$db, $stage] = $this->openStage($ticket);
            $summary = $this->makeSummary($db);
            $db = null;
            return [
                'success' => true,
                'ready' => true,
                'token' => $ticket,
                'router_id' => $stage['router_id'] ?? 0,
                'network_id' => $stage['network_id'] ?? $this->getActiveNetworkId(),
                'summary' => $summary
            ];
        }
        return ['success' => true, 'ready' => true, 'token' => $ticket];
    }

    /**
     * Preview an uploaded database (.sqldb, .sqlite, .db) or CSV/Text file.
     */
    public function previewUpload(array $file, int $routerId = 0): array {
        $this->enforcePermission('users_import', 'استيراد قاعدة User Manager');
        $networkId = $this->getActiveNetworkId();
        if ($routerId > 0) {
            $this->assertEligibleRouter($routerId, $networkId);
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || empty($file['tmp_name'])) {
            throw new RuntimeException('لم يتم استلام ملف صالح للرفع');
        }
        $size = (int)($file['size'] ?? 0);
        if ($size < 2 || $size > self::MAX_BYTES) {
            throw new RuntimeException('حجم الملف غير مقبول (الحد الأقصى 64 ميجابايت)');
        }

        $dir = '/var/lib/mikrotik-usermanager/usermanager-imports';
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('تعذر إنشاء مساحة المعاينة الآمنة');
        }
        @chmod($dir, 0700);
        $this->cleanupExpired();
        $token = bin2hex(random_bytes(16));
        $rawPath = $dir . '/' . $token . '.source';
        $path = $dir . '/' . $token . '.preview.sqlite';

        if (!move_uploaded_file((string)$file['tmp_name'], $rawPath) && !copy((string)$file['tmp_name'], $rawPath)) {
            throw new RuntimeException('تعذر حفظ الملف المؤقت للمعاينة');
        }
        @chmod($rawPath, 0600);

        // Check if SQLite format
        $fh = fopen($rawPath, 'rb');
        $magic = $fh ? fread($fh, 16) : false;
        if ($fh) fclose($fh);

        $isSqlite = ($magic === "SQLite format 3\0");

        try {
            if ($isSqlite) {
                $db = $this->openSourceWritable($rawPath);
                $tables = $this->tables($db);
                if (!in_array('user', $tables, true)) {
                    throw new RuntimeException('قاعدة User Manager غير صالحة: جدول المستخدمين (user) غير موجود في الملف.');
                }
                try { $db->exec('REINDEX user'); } catch (Throwable $e) {}
                if (in_array('userprofile', $tables, true)) {
                    try { $db->exec('REINDEX userprofile'); } catch (Throwable $e) {}
                }
                $this->assertColumns($db, 'user', ['id', 'userName', 'password']);
                $summary = $this->makeSummary($db);
                $this->createSanitizedPreview($rawPath, $path);
                $db = null;
                @unlink($rawPath);
            } else {
                // Parse CSV / TXT file
                $summary = $this->buildPreviewFromTextFile($rawPath, $path);
                @unlink($rawPath);
            }

            $_SESSION['sam_um_imports'] = is_array($_SESSION['sam_um_imports'] ?? null) ? $_SESSION['sam_um_imports'] : [];
            $_SESSION['sam_um_imports'][$token] = ['admin_id'=>$this->importActorId(),'auth_mode'=>$this->importMode(),'network_id' => $networkId, 'router_id' => $routerId, 'path' => $path, 'expires_at' => time() + 3600];
            if(file_put_contents($path.'.meta.json',json_encode($_SESSION['sam_um_imports'][$token],JSON_THROW_ON_ERROR),LOCK_EX)===false)throw new RuntimeException('تعذر حفظ بيانات المعاينة');
            chmod($path.'.meta.json',0600);
            return ['success' => true, 'token' => $token, 'network_id' => $networkId, 'router_id' => $routerId, 'expires_in' => 3600, 'summary' => $summary];
        } catch (Throwable $e) {
            @unlink($rawPath);
            @unlink($path);
            throw $e;
        }
    }

    private function buildPreviewFromTextFile(string $sourcePath, string $targetPath): array {
        $lines = new SplFileObject($sourcePath,'rb');
        if (!$lines) throw new RuntimeException('الملف النصي فارغ أو غير صالح');

        $sqlite = new PDO('sqlite:' . $targetPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $sqlite->exec('CREATE TABLE customer (custId INTEGER PRIMARY KEY)');
        $sqlite->exec('INSERT INTO customer (custId) VALUES (1)');
        $sqlite->exec('CREATE TABLE profile (id INTEGER PRIMARY KEY, custId INTEGER, name TEXT, validity TEXT, startsAt TEXT, freeTrial TEXT, dynamicPrice REAL, price REAL, nameForUser TEXT, sharedUsers INTEGER)');
        $sqlite->exec('CREATE TABLE user (id INTEGER PRIMARY KEY, custId INTEGER, userName TEXT, password TEXT, groupName TEXT, disabled INTEGER, regDate TEXT, actualProfileId INTEGER, actualProfileName TEXT, uptimeUsed INTEGER, downloadUsed INTEGER, uploadUsed INTEGER)');

        $insertProf = $sqlite->prepare('INSERT INTO profile (id, custId, name, validity, price, nameForUser, sharedUsers) VALUES (?, 1, ?, ?, ?, ?, 1)');
        $insertUser = $sqlite->prepare('INSERT INTO user (id, custId, userName, password, groupName, disabled, regDate, actualProfileId, actualProfileName, uptimeUsed, downloadUsed, uploadUsed) VALUES (?, 1, ?, ?, ?, 0, ?, ?, ?, 0, 0, 0)');

        $profMap = [];
        $profCounter = 1;
        $userCounter = 1;

        $sqlite->beginTransaction();
        foreach ($lines as $lineNum => $line) {
            if(!is_string($line))continue;
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || str_starts_with($line, '//')) continue;
            
            // Detect delimiter: comma, tab, semicolon, pipe, or whitespace
            $delimiter = ',';
            if (str_contains($line, "\t")) $delimiter = "\t";
            elseif (str_contains($line, ';')) $delimiter = ';';
            elseif (str_contains($line, '|')) $delimiter = '|';
            elseif (str_contains($line, ',') === false && preg_match('/\s+/', $line)) $delimiter = ' ';

            $parts = ($delimiter === ' ') ? preg_split('/\s+/', $line) : str_getcsv($line, $delimiter);
            $parts = array_map('trim', $parts ?: []);
            
            $u = $parts[0] ?? '';
            if ($u === '' || strtolower($u) === 'username' || strtolower($u) === 'user' || $u === 'اسم المستخدم') continue;
            
            $p = $parts[1] ?? $u;
            $profName = $parts[2] ?? 'Default';
            $price = isset($parts[3]) && is_numeric($parts[3]) ? (float)$parts[3] : 0;

            if (!isset($profMap[$profName])) {
                $pid = $profCounter++;
                $profMap[$profName] = $pid;
                $insertProf->execute([$pid, $profName, '30d', $price, $profName]);
            }
            $pid = $profMap[$profName];

            $insertUser->execute([
                $userCounter++,
                $u,
                $p,
                $profName,
                date('Y-m-d H:i:s'),
                $pid,
                $profName
            ]);
        }

        if($sqlite->inTransaction())$sqlite->commit();
        $lines=null;
        if ($userCounter <= 1) {
            $sqlite = null;
            @unlink($targetPath);
            throw new RuntimeException('لم يتم استخراج أي كروت صالحة من الملف النصي. تأكد من أن كل سطر يحتوي على: اسم المستخدم، كلمة المرور، الباقة.');
        }

        $summary = $this->makeSummary($sqlite);
        $sqlite = null;
        @chmod($targetPath, 0600);
        return $summary;
    }

    public function getPreviewCardsCursor(string $token,int $afterId=0,int $limit=250,array $includedProfiles=[],string $mode='all'): array {
        $this->enforcePermission('users_import','معاينة كروت User Manager');
        [$src,$stage]=$this->openStage($token);
        $limit=max(1,min(500,$limit));$expr=$this->sourceProfileExpr($src);$where=['u.id>?'];$params=[max(0,$afterId)];
        $profiles=array_values(array_unique(array_filter(array_map('intval',$includedProfiles),fn($v)=>$v>0)));
        if($profiles){$where[]="($expr) IN (".implode(',',array_fill(0,count($profiles),'?')).")";$params=array_merge($params,$profiles);}
        if(in_array($mode,['fresh','new'],true))$where[]='COALESCE(u.uptimeUsed,0)<=0 AND COALESCE(u.downloadUsed,0)<=0 AND COALESCE(u.uploadUsed,0)<=0';
        elseif($mode==='used')$where[]='(COALESCE(u.uptimeUsed,0)>0 OR COALESCE(u.downloadUsed,0)>0 OR COALESCE(u.uploadUsed,0)>0)';
        $q=$src->prepare('SELECT u.id,u.userName,u.password,('.$expr.') source_profile_id FROM user u WHERE '.implode(' AND ',$where).' ORDER BY u.id LIMIT '.($limit+1));foreach($params as $i=>$value)$q->bindValue($i+1,$value,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll(PDO::FETCH_ASSOC);
        $more=count($rows)>$limit;if($more)array_pop($rows);$cursor=$afterId;
        foreach($rows as &$row){$cursor=(int)$row['id'];$row['userName']=self::normalizeCardCredential((string)$row['userName']);$row['password']=$this->importPassword($row['userName'],(string)$row['password'],$stage['auth_mode'],$token);}unset($row);
        return ['success'=>true,'network_id'=>$stage['network_id'],'cards'=>$rows,'next_cursor'=>$cursor,'has_more'=>$more,'limit'=>$limit];
    }

    public function getPreviewCards(string $token, int $customerId = 0, int $profileId = 0, int $page = 1, int $limit = 100, string $search = '', string $cardKind = '', string $sortCol = 'id', string $sortDir = 'ASC'): array {
        [$db, $stage] = $this->openStage($token);
        $page = max(1, $page);
        $limit = max(10, min(500, $limit));
        $offset = ($page - 1) * $limit;
        $profileExpr = $this->sourceProfileExpr($db);
        $where = '1=1';
        $bind = [];
        $tables = $this->tables($db);
        
        if ($profileId > 0) {
            $where .= " AND ($profileExpr) = :profile";
            $bind[':profile'] = $profileId;
        }

        $search = trim($search);
        if ($search !== '') {
            $where .= " AND (u.userName LIKE :search)";
            $bind[':search'] = '%' . $search . '%';
        }

        if ($cardKind === 'fresh' || $cardKind === 'new') {
            $where .= " AND (u.uptimeUsed IS NULL OR u.uptimeUsed <= 0) AND (u.downloadUsed IS NULL OR u.downloadUsed <= 0) AND (u.uploadUsed IS NULL OR u.uploadUsed <= 0)";
        } elseif ($cardKind === 'used') {
            $where .= " AND ((u.uptimeUsed > 0) OR (u.downloadUsed > 0) OR (u.uploadUsed > 0))";
        }

        $sortDir = strtoupper($sortDir) === 'DESC' ? 'DESC' : 'ASC';
        $orderClause = match ($sortCol) {
            'username', 'userName' => "u.userName $sortDir",
            'profile', 'profile_name' => "source_profile_id $sortDir, u.id $sortDir",
            'uptime', 'uptimeUsed' => "u.uptimeUsed $sortDir",
            'download', 'downloadUsed' => "u.downloadUsed $sortDir",
            'status', 'is_used' => "is_used $sortDir, u.id $sortDir",
            default => "u.id $sortDir"
        };
        
        $count = $db->prepare("SELECT COUNT(*) FROM user u WHERE $where");
        foreach ($bind as $k => $v) {
            if (is_int($v)) $count->bindValue($k, $v, PDO::PARAM_INT);
            else $count->bindValue($k, $v, PDO::PARAM_STR);
        }
        $count->execute();
        $total = (int)$count->fetchColumn();
        
        $purchaseExpr = in_array('purchase', $tables, true) ? "(SELECT COUNT(*) FROM purchase pu WHERE pu.userId=u.id)" : "0";
        $paymentExpr = in_array('payment', $tables, true) ? "(SELECT MAX(COALESCE(pay.transEnd,pay.transStart)) FROM payment pay WHERE pay.userId=u.id)" : "NULL";

        $sql = "SELECT u.id, u.userName, u.password, u.groupName, u.disabled, u.regDate, u.actualProfileName, u.actualProfileId,
                    u.uptimeUsed, u.downloadUsed, u.uploadUsed,
                    ($profileExpr) AS source_profile_id,
                    $purchaseExpr AS purchase_count,
                    $paymentExpr AS payment_date,
                    CASE WHEN (COALESCE(u.uptimeUsed,0) > 0 OR COALESCE(u.downloadUsed,0) > 0 OR COALESCE(u.uploadUsed,0) > 0) THEN 1 ELSE 0 END AS is_used
              FROM user u WHERE $where ORDER BY $orderClause LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($sql);
        foreach ($bind as $k => $v) {
            if (is_int($v)) $stmt->bindValue($k, $v, PDO::PARAM_INT);
            else $stmt->bindValue($k, $v, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $cards = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cards as &$card) {
            $card['userName']=self::normalizeCardCredential((string)$card['userName']);
            $card['password']=$this->importPassword($card['userName'],(string)$card['password'],$stage['auth_mode'],$token);
            $card['is_used'] = ((int)($card['uptimeUsed'] ?? 0) > 0 || (int)($card['downloadUsed'] ?? 0) > 0 || (int)($card['uploadUsed'] ?? 0) > 0) ? 1 : 0;
            $card['payment_date'] = !empty($card['payment_date']) && is_numeric($card['payment_date']) ? date('Y-m-d H:i:s', (int)$card['payment_date']) : ($card['payment_date'] ?: null);
        }
        unset($card);
        $db = null;
        return ['success' => true, 'network_id' => $stage['network_id'], 'page' => $page, 'limit' => $limit, 'total' => $total, 'total_pages' => max(1, (int)ceil($total / $limit)), 'cards' => $cards];
    }

    public function getCardDetails(string $token, int $customerId, int $sourceUserId): array {
        [$db, $stage] = $this->openStage($token);
        $expr = $this->sourceProfileExpr($db);
        $tables = $this->tables($db);
        $purchaseExpr = in_array('purchase', $tables, true) ? "(SELECT COUNT(*) FROM purchase pu WHERE pu.userId=u.id)" : "0";
        $paymentExpr = in_array('payment', $tables, true) ? "(SELECT MAX(COALESCE(pay.transEnd,pay.transStart)) FROM payment pay WHERE pay.userId=u.id)" : "NULL";

        $q = $db->prepare("SELECT u.id, u.userName, u.password, u.groupName, u.disabled, u.regDate, u.actualProfileName,
                    u.uptimeUsed, u.downloadUsed, u.uploadUsed, ($expr) AS source_profile_id,
                    $purchaseExpr AS purchase_count,
                    $paymentExpr AS payment_date
                FROM user u WHERE u.id = ? LIMIT 1");
        $q->execute([$sourceUserId]);
        $data = $q->fetch(PDO::FETCH_ASSOC);
        $db = null;
        if (!$data) throw new RuntimeException('البطاقة غير موجودة في ملف المعاينة');
        $data['userName']=self::normalizeCardCredential((string)$data['userName']);
        $data['password']=$this->importPassword($data['userName'],(string)$data['password'],$stage['auth_mode'],$token);
        $data['is_used'] = ((int)($data['uptimeUsed'] ?? 0) > 0 || (int)($data['downloadUsed'] ?? 0) > 0 || (int)($data['uploadUsed'] ?? 0) > 0 || (int)($data['purchase_count'] ?? 0) > 0) ? 1 : 0;
        $data['payment_date'] = !empty($data['payment_date']) && is_numeric($data['payment_date']) ? date('Y-m-d H:i:s', (int)$data['payment_date']) : ($data['payment_date'] ?: null);
        return ['success' => true, 'network_id' => $stage['network_id'], 'card' => $data];
    }

    public function commitSelected(string $token, int $customerId, array $profileMap, array $sourceUserIds = [], string $targetStatus = 'active', bool $importAll = false, array $includedProfiles = [], string $mode = 'all', bool $preserveStage = false): array {
        $this->enforcePermission('users_import', 'اعتماد بطاقات User Manager');
        [$src, $stage] = $this->openStage($token);
        $networkId = $this->getActiveNetworkId();
        if ($stage['network_id'] !== $networkId) throw new DomainException('FORBIDDEN_NETWORK');
        
        // Commit needs selected profile mappings only; do not rescan all source cards per batch.
        
        $map = [];
        foreach ($profileMap as $sourceId => $localName) {
            $sourceId = (int)$sourceId;
            $localName = trim((string)$localName);
            if ($localName === '') continue;
            $q = $this->db->prepare('SELECT name, price, validity, COALESCE(cost_price, 0) AS cost_price FROM um_profiles_def WHERE network_id=? AND name=? LIMIT 1');
            $q->execute([$networkId, $localName]);
            $p = $q->fetch(PDO::FETCH_ASSOC);
            if (!$p) throw new RuntimeException("الباقة المحلية المختارة [{$localName}] غير موجودة في الشبكة النشطة");
            $map[$sourceId] = $p;
        }
        if (!$map) throw new RuntimeException('اربط الباقات المصدرية بباقات موجودة في الشبكة النشطة أولاً');
        
        $cards = [];
        $expr = $this->sourceProfileExpr($src);
        $timing=$this->sourceTimingColumns($src);
        
        if ($importAll || empty($sourceUserIds)) {
            // Selecting all cards matching includedProfiles and mode
            $validIncluded = array_values(array_unique(array_filter(array_map('intval', $includedProfiles), fn($v) => $v > 0)));
            if (empty($validIncluded)) {
                $validIncluded = array_keys($map);
            }
            if (empty($validIncluded)) {
                throw new RuntimeException('لم يتم تحديد أي باقة لاستيراد كروتها');
            }
            
            $whereParts = [];
            $inProf = implode(',', $validIncluded);
            $whereParts[] = "($expr) IN ($inProf)";
            
            if ($mode === 'fresh' || $mode === 'new') {
                $whereParts[] = "(u.uptimeUsed IS NULL OR u.uptimeUsed <= 0) AND (u.downloadUsed IS NULL OR u.downloadUsed <= 0) AND (u.uploadUsed IS NULL OR u.uploadUsed <= 0)";
            } elseif ($mode === 'used') {
                $whereParts[] = "((u.uptimeUsed > 0) OR (u.downloadUsed > 0) OR (u.uploadUsed > 0))";
            }
            
            $whereSql = implode(' AND ', $whereParts);
            $q = $src->query("SELECT u.id, u.userName, u.password, ($expr) AS source_profile_id, u.uptimeUsed, u.downloadUsed, u.uploadUsed, u.regDate $timing FROM user u WHERE $whereSql");
            $cards = $q->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $sourceUserIds = array_values(array_unique(array_filter(array_map('intval', $sourceUserIds), fn($v) => $v > 0)));
            if (!$sourceUserIds || count($sourceUserIds) > 100000) {
                throw new RuntimeException('حدد من 1 إلى 100000 بطاقة للاعتماد في الدفعة');
            }
            foreach (array_chunk($sourceUserIds, 500) as $idChunk) {
                $marks = implode(',', $idChunk);
                $q = $src->query("SELECT u.id, u.userName, u.password, ($expr) AS source_profile_id, u.uptimeUsed, u.downloadUsed, u.uploadUsed, u.regDate $timing FROM user u WHERE u.id IN ($marks)");
                $cards = array_merge($cards, $q->fetchAll(PDO::FETCH_ASSOC));
            }
        }
        $src = null;
        
        if (empty($cards)) {
            throw new RuntimeException('لم يتم العثور على أي بطاقات مطابقة للاستيراد في ملف المعاينة');
        }

        // Bulk duplicate check in radcheck
        $allUsernames = array_values(array_unique(array_filter(array_map(fn($c) => self::normalizeCardCredential((string)($c['userName'] ?? '')), $cards))));
        $existingMap = [];
        foreach (array_chunk($allUsernames, 500) as $uChunk) {
            $in = implode(',', array_fill(0, count($uChunk), '?'));
            $chkStmt = $this->db->prepare("SELECT username FROM radcheck WHERE network_id=? AND username IN ($in)");
            $chkStmt->execute(array_merge([$networkId], $uChunk));
            foreach ($chkStmt->fetchAll(PDO::FETCH_COLUMN) as $u) {
                $existingMap[$u] = true;
            }
        }
        
        $owner = $this->db->prepare("SELECT admin_id FROM um_admin_network_access WHERE network_id=? AND is_active=1 AND access_level='owner' ORDER BY is_default DESC, admin_id LIMIT 1");
        $owner->execute([$networkId]);
        $ownerId = (int)$owner->fetchColumn();
        if ($ownerId <= 0) $ownerId = (int)($_SESSION['admin_id'] ?? 1);
        
        $batch = 'UMIMPORT-' . $networkId . '-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
        
        $isQuarantined = ($targetStatus === 'quarantined' || $targetStatus === 'disabled') ? 1 : 0;
        $cardStatus = $isQuarantined ? 'disabled' : 'active';
        
        $radcheckRows = [];
        $radusergroupRows = [];
        $radcheckExtraRows = [];
        $radacctRows = [];
        $metaRows = [];
        $skippedDuplicates = 0;
        $importedUsedCount=0;
        
        $now = time();
        $nowStr = date('Y-m-d H:i:s', $now);
        
        foreach ($cards as $c) {
            $u = self::normalizeCardCredential((string)($c['userName'] ?? ''));
            if ($u === '' || strlen($u) > 128 || preg_match('/^router_[0-9]+$/i',$u) || isset($existingMap[$u])) {
                $skippedDuplicates++;
                continue;
            }
            $existingMap[$u] = true;
            
            $sp = (int)($c['source_profile_id'] ?? 0);
            $localProfile = $map[$sp] ?? (reset($map) ?: null);
            if (!$localProfile) continue;
            
            $pwd = $this->importPassword($u,(string)($c['password']??''),$stage['auth_mode'],$token);
            $radcheckRows[] = [$networkId, $u, 'Cleartext-Password', ':=', $pwd];
            $radusergroupRows[] = [$networkId, $u, $localProfile['name'], 1];
            
            $uptimeUsed = (int)($c['uptimeUsed'] ?? 0);
            $downloadUsed = (int)($c['downloadUsed'] ?? 0);
            $uploadUsed = (int)($c['uploadUsed'] ?? 0);
            
            // Uptime is accumulated online time, not elapsed validity. Never infer activation from it.
            $hasUsage = ($uptimeUsed > 0 || $downloadUsed > 0 || $uploadUsed > 0 || (int)($c['sam_source_start']??0)>0);
            $startTs=(int)($c['sam_source_start']??0);$endTs=(int)($c['sam_source_end']??0);
            $firstLogin=$startTs>0?date('Y-m-d H:i:s',$startTs):null;
            $expiresAt=$endTs>0?date('Y-m-d H:i:s',$endTs):null;
            $thisCardStatus=$cardStatus;
            $unknownValidity=$hasUsage&&$endTs<=0;
            if($endTs>0&&$endTs<=$now)$thisCardStatus='expired';
            elseif($unknownValidity||!empty($c['sam_source_disabled']))$thisCardStatus='disabled';

            if ($isQuarantined || in_array($thisCardStatus,['expired','disabled'],true)) {
                $radcheckExtraRows[] = [$networkId, $u, 'Auth-Type', ':=', 'Reject'];
            } elseif ($hasUsage && $expiresAt !== null) {
                // Expiration attribute is ONLY set for previously active cards with known expiration
                $radcheckExtraRows[] = [$networkId, $u, 'Expiration', ':=', date('d M Y H:i:s', strtotime($expiresAt))];
            }
            
            if ($hasUsage && ($uptimeUsed > 0 || $downloadUsed > 0 || $uploadUsed > 0)) {
                $acctSessionId = 'UM-PREV-' . bin2hex(random_bytes(6));
                $acctUniqueId = md5($acctSessionId . $u . $now);
                $radacctRows[] = [
                    $networkId,
                    $acctSessionId,
                    $acctUniqueId,
                    $u,
                    $localProfile['name'],
                    '127.0.0.1',
                    '0',
                    'Wireless-802.11',
                    $firstLogin ?: date('Y-m-d H:i:s', $now - max(60, $uptimeUsed)),
                    $nowStr,
                    $uptimeUsed,
                    'RADIUS',
                    $uploadUsed,
                    $downloadUsed,
                    'User-Request'
                ];
            }
            
            $commentText = $isQuarantined ? 'استيراد محجور من User Manager' : ($hasUsage ? 'استيراد بالرصيد المتبقي من User Manager' : 'استيراد مباشر من User Manager');
            if($unknownValidity)$commentText='كرت مستخدم: الصلاحية الأصلية غير معروفة، يلزم المراجعة قبل التفعيل';
            $costPrice = (float)($localProfile['cost_price'] ?? 0);
            $unitPrice = (float)($localProfile['price'] ?? 0);
            
            $isFreeQuota = ($unitPrice <= 0 || ($localProfile['package_type'] ?? '') === 'free') ? 1 : 0;
            if($hasUsage)$importedUsedCount++;
            $metaRows[] = [
                $networkId,
                $u,
                $batch,
                $localProfile['name'],
                $unitPrice,
                $costPrice,
                $ownerId,
                $ownerId,
                $thisCardStatus,
                0,
                $isFreeQuota,
                $firstLogin,
                $expiresAt,
                (string)($localProfile['validity'] ?? '30d'),
                $commentText
            ];
        }
        
        if (empty($metaRows)) {
            if (!$preserveStage) $this->deleteStage($token);
            return [
                'success' => true,
                'network_id' => $networkId,
                'batch_id' => $batch,
                'imported' => 0,
                'fresh_imported' => 0,
                'used_imported' => 0,
                'duplicates' => $skippedDuplicates,
                'status' => $cardStatus,
                'message' => 'جميع البطاقات المحددة موجودة مسبقاً في النظام.'
            ];
        }
        
        $chunkSize = 250;
        $this->db->beginTransaction();
        try {
            try {
                (new NetworkSubscriptionService($this->db))->consumeDailyCards($networkId, 0, count($metaRows), (int)$ownerId);
            } catch (Throwable $subEx) {
                error_log("Import subscription meter note: " . $subEx->getMessage());
            }
            
            // 1. radcheck Password batch
            foreach (array_chunk($radcheckRows, $chunkSize) as $chunk) {
                $placeholders = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?)'));
                $params = [];
                foreach ($chunk as $row) {
                    $params = array_merge($params, $row);
                }
                $this->db->prepare("INSERT IGNORE INTO radcheck (network_id, username, attribute, op, value) VALUES $placeholders")->execute($params);
            }
            
            // 2. radusergroup batch
            foreach (array_chunk($radusergroupRows, $chunkSize) as $chunk) {
                $placeholders = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?)'));
                $params = [];
                foreach ($chunk as $row) {
                    $params = array_merge($params, $row);
                }
                $this->db->prepare("INSERT IGNORE INTO radusergroup (network_id, username, groupname, priority) VALUES $placeholders")->execute($params);
            }
            
            // 3. radcheck Reject / Expiration batch
            if (!empty($radcheckExtraRows)) {
                foreach (array_chunk($radcheckExtraRows, $chunkSize) as $chunk) {
                    $placeholders = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?)'));
                    $params = [];
                    foreach ($chunk as $row) {
                        $params = array_merge($params, $row);
                    }
                    $this->db->prepare("INSERT IGNORE INTO radcheck (network_id, username, attribute, op, value) VALUES $placeholders")->execute($params);
                }
            }
            
            // 4. radacct historical usage batch
            if (!empty($radacctRows)) {
                foreach (array_chunk($radacctRows, $chunkSize) as $chunk) {
                    $placeholders = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'));
                    $params = [];
                    foreach ($chunk as $row) {
                        $params = array_merge($params, $row);
                    }
                    $this->db->prepare("INSERT INTO radacct (
                        network_id, acctsessionid, acctuniqueid, username, realm,
                        nasipaddress, nasportid, nasporttype, acctstarttime, acctstoptime,
                        acctsessiontime, acctauthentic, acctinputoctets, acctoutputoctets,
                        acctterminatecause
                    ) VALUES $placeholders")->execute($params);
                }
            }
            
            // 5. um_vouchers_meta batch
            foreach (array_chunk($metaRows, $chunkSize) as $chunk) {
                $placeholders = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'));
                $params = [];
                foreach ($chunk as $row) {
                    $params = array_merge($params, $row);
                }
                $this->db->prepare("INSERT INTO um_vouchers_meta (
                    network_id, username, batch_id, profile_name, price, purchase_cost,
                    owner_admin_id, printed_by_admin_id, status, is_sold,
                    is_free_quota, first_login, expires_at, validity, comment
                ) VALUES $placeholders")->execute($params);
            }
            
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        
        if (!$preserveStage) $this->deleteStage($token);
        $importedCount = count($metaRows);
        $usedCount=$importedUsedCount;
        $freshCount=$importedCount-$usedCount;
        
        return [
            'success' => true,
            'network_id' => $networkId,
            'batch_id' => $batch,
            'imported' => $importedCount,
            'fresh_imported' => $freshCount,
            'used_imported' => $usedCount,
            'duplicates' => $skippedDuplicates,
            'status' => $cardStatus,
            'message' => "تم استيراد {$importedCount} كرت بنجاح (منها {$freshCount} كرت جديد جاهز للبيع، و {$usedCount} كرت مستخدم مستورد يحتاج مراجعة الحالة والصلاحية)" . ($skippedDuplicates ? " (تخطي {$skippedDuplicates} كرت مكرر)" : "")
        ];
    }

    public function commitFiltered(string $token, int $customerId, array $profileMap, array $sourceUserIds = [], string $targetStatus = 'active', bool $importAll = false, array $includedProfiles = [], string $mode = 'all'): array {
        return $this->commitSelected($token, $customerId, $profileMap, $sourceUserIds, $targetStatus, $importAll, $includedProfiles, $mode);
    }

    private function parseValidityToSeconds(string $validity): int {
        $validity = trim(strtolower($validity));
        if ($validity === '') return 30 * 86400;
        if (preg_match('/^(\d+)\s*d(?:ays?)?$/', $validity, $m)) return (int)$m[1] * 86400;
        if (preg_match('/^(\d+)\s*h(?:ours?)?$/', $validity, $m)) return (int)$m[1] * 3600;
        if (preg_match('/^(\d+)\s*m(?:in(?:utes?)?)?$/', $validity, $m)) return (int)$m[1] * 60;
        if (preg_match('/^(\d+)\s*s(?:ec(?:onds?)?)?$/', $validity, $m)) return (int)$m[1];
        if (preg_match('/^(\d+)\s*w(?:eeks?)?$/', $validity, $m)) return (int)$m[1] * 7 * 86400;
        if (is_numeric($validity)) return (int)$validity;
        return 30 * 86400;
    }

    public function discardPreview(string $token): array {
        $this->enforcePermission('users_import', 'استيراد قاعدة User Manager');
        $this->deleteStage($token);
        return ['success' => true, 'message' => 'تم إلغاء المعاينة وحذف الملف المؤقت.'];
    }

    private function makeSummary(PDO $db): array {
        $tables = $this->tables($db);
        $hasCustomer = in_array('customer', $tables, true);
        $hasProfile = in_array('profile', $tables, true);
        
        $customers = [1];
        if ($hasCustomer) {
            $customerQ = $db->query('SELECT custId FROM customer ORDER BY custId');
            $customers = array_map('intval', $customerQ->fetchAll(PDO::FETCH_COLUMN)) ?: [1];
        }

        $profiles = [];
        if ($hasProfile) {
            $expr = $this->sourceProfileExpr($db);
            $profiles = $db->query('SELECT id, custId, name, validity, startsAt, freeTrial, dynamicPrice, price, nameForUser, sharedUsers FROM profile ORDER BY custId, name')->fetchAll(PDO::FETCH_ASSOC);
            $statsRows = $db->query("SELECT ($expr) AS source_profile_id,
                COUNT(*) AS card_count,
                SUM(CASE WHEN (u.uptimeUsed > 0 OR u.downloadUsed > 0 OR u.uploadUsed > 0) THEN 1 ELSE 0 END) AS used_count,
                SUM(CASE WHEN (u.uptimeUsed IS NULL OR u.uptimeUsed <= 0) AND (u.downloadUsed IS NULL OR u.downloadUsed <= 0) AND (u.uploadUsed IS NULL OR u.uploadUsed <= 0) THEN 1 ELSE 0 END) AS fresh_count
                FROM user u GROUP BY ($expr)")->fetchAll(PDO::FETCH_ASSOC);
            $statsMap = [];
            foreach ($statsRows as $statsRow) $statsMap[(int)$statsRow['source_profile_id']] = $statsRow;
            foreach ($profiles as &$p) {
                $stats = $statsMap[(int)$p['id']] ?? [];
                $p['card_count'] = (int)($stats['card_count'] ?? 0);
                $p['used_count'] = (int)($stats['used_count'] ?? 0);
                $p['fresh_count'] = (int)($stats['fresh_count'] ?? 0);
                $p['constraints'] = in_array('pparts', $tables, true) && in_array('limitation', $tables, true) ? $this->profileConstraints($db, (int)$p['id']) : [];
            }
            unset($p);
        } else {
            // Dynamically extract profiles from user table if profile table is absent
            $groupStats = $db->query('SELECT groupName, COUNT(*) AS card_count,
                SUM(CASE WHEN (uptimeUsed > 0 OR downloadUsed > 0 OR uploadUsed > 0) THEN 1 ELSE 0 END) AS used_count,
                SUM(CASE WHEN (uptimeUsed IS NULL OR uptimeUsed <= 0) AND (downloadUsed IS NULL OR downloadUsed <= 0) AND (uploadUsed IS NULL OR uploadUsed <= 0) THEN 1 ELSE 0 END) AS fresh_count
                FROM user WHERE groupName IS NOT NULL AND groupName != "" GROUP BY groupName')->fetchAll(PDO::FETCH_ASSOC);
            $idCounter = 1;
            foreach ($groupStats as $qStats) {
                $grp = (string)$qStats['groupName'];
                $profiles[] = [
                    'id' => $idCounter++,
                    'custId' => 1,
                    'name' => $grp,
                    'validity' => '30d',
                    'price' => 0,
                    'nameForUser' => $grp,
                    'sharedUsers' => 1,
                    'card_count' => (int)($qStats['card_count'] ?? 0),
                    'used_count' => (int)($qStats['used_count'] ?? 0),
                    'fresh_count' => (int)($qStats['fresh_count'] ?? 0),
                    'constraints' => []
                ];
            }
        }

        $overallStats = $db->query("SELECT
            COUNT(*) AS total_cards,
            SUM(CASE WHEN (uptimeUsed > 0 OR downloadUsed > 0 OR uploadUsed > 0) THEN 1 ELSE 0 END) AS used_cards,
            SUM(CASE WHEN (uptimeUsed IS NULL OR uptimeUsed <= 0) AND (downloadUsed IS NULL OR downloadUsed <= 0) AND (uploadUsed IS NULL OR uploadUsed <= 0) THEN 1 ELSE 0 END) AS fresh_cards
        FROM user")->fetch(PDO::FETCH_ASSOC);
        $cardCount = (int)($overallStats['total_cards'] ?? 0);
        $freshCount = (int)($overallStats['fresh_cards'] ?? 0);
        $usedCount = (int)($overallStats['used_cards'] ?? 0);
        $salesCount = in_array('purchase', $tables, true) ? (int)$db->query('SELECT COUNT(*) FROM purchase')->fetchColumn() : 0;
        $paymentsCount = in_array('payment', $tables, true) ? (int)$db->query('SELECT COUNT(*) FROM payment')->fetchColumn() : 0;

        return [
            'integrity' => 'ok',
            'counts' => [
                'profiles' => count($profiles),
                'cards' => $cardCount,
                'fresh_cards' => $freshCount,
                'used_cards' => $usedCount,
                'sales' => $salesCount,
                'payments' => $paymentsCount
            ],
            'customers' => $customers,
            'profiles' => $profiles
        ];
    }

    private function profileConstraints(PDO $db, int $profileId): array {
        try {
            $q = $db->prepare('SELECT l.downloadLimit, l.uploadLimit, l.transferLimit, l.rateLimit, l.uptimeLimit, l.resetCounters, l.name FROM pparts pp JOIN limitation l ON l.id = pp.limitId WHERE pp.profileId = ? ORDER BY pp.id');
            $q->execute([$profileId]);
            return $q->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            return [];
        }
    }

    private function sourceTimingColumns(PDO $src): string {
        $uc=array_column($src->query('PRAGMA table_info("user")')->fetchAll(PDO::FETCH_ASSOC),'name');
        $tables=$this->tables($src);$pc=in_array('userprofile',$tables,true)?array_column($src->query('PRAGMA table_info("userprofile")')->fetchAll(PDO::FETCH_ASSOC),'name'):[];
        $start=[];$end=[];
        if(in_array('activated',$pc,true))$start[]='(SELECT NULLIF(MAX(up.activated),0) FROM userprofile up WHERE up.userId=u.id AND up.activated>0)';
        foreach(['actualProfileStart'] as $col)if(in_array($col,$uc,true))$start[]="CASE WHEN u.$col>0 THEN u.$col END";
        // Use the same latest assignment as sourceProfileExpr; never resurrect an expired assignment.
        foreach(['endTime','validUntil'] as $col)if(in_array($col,$pc,true))$end[]="(SELECT CASE WHEN up.$col>0 THEN up.$col END FROM userprofile up WHERE up.userId=u.id ORDER BY up.activated DESC,up.id DESC LIMIT 1)";
        foreach(['actualProfileEnd','profileTillTime'] as $col)if(in_array($col,$uc,true))$end[]="CASE WHEN u.$col>0 THEN u.$col END";
        $s=$start?'COALESCE('.implode(',',$start).',NULL)':'NULL';$e=$end?'COALESCE('.implode(',',$end).',NULL)':'NULL';
        $disabled=in_array('disabled',$uc,true)?'COALESCE(u.disabled,0)':'0';
        return ", $s AS sam_source_start, $e AS sam_source_end, $disabled AS sam_source_disabled";
    }

    private function sourceProfileExpr(PDO $db): string {
        $tables = $this->tables($db);
        if (in_array('userprofile', $tables, true) && in_array('profile', $tables, true)) {
            return "COALESCE(
                (SELECT up.profileId FROM userprofile up WHERE up.userId = u.id ORDER BY up.activated DESC, up.id DESC LIMIT 1),
                (SELECT p.id FROM profile p WHERE p.name = u.actualProfileName LIMIT 1),
                (SELECT p.id FROM profile p WHERE p.name = u.groupName LIMIT 1),
                u.actualProfileId,
                1
            )";
        }
        if (in_array('profile', $tables, true)) {
            return "COALESCE(
                (SELECT p.id FROM profile p WHERE p.name = u.actualProfileName LIMIT 1),
                (SELECT p.id FROM profile p WHERE p.name = u.groupName LIMIT 1),
                u.actualProfileId,
                1
            )";
        }
        return "1";
    }

    private function openStage(string $token): array {
        if (!preg_match(self::TOKEN_RE, $token)) throw new RuntimeException('رمز المعاينة غير صالح');
        $stage = $_SESSION['sam_um_imports'][$token] ?? null;
        if (!is_array($stage)) {
            $metaPath = '/var/lib/mikrotik-usermanager/usermanager-imports/' . $token . '.preview.sqlite.meta.json';
            if (is_file($metaPath)) {
                $decoded = json_decode((string)@file_get_contents($metaPath), true);
                if (is_array($decoded)) { $stage = $decoded; $_SESSION['sam_um_imports'][$token] = $stage; }
            }
        }
        if (!is_array($stage) || (int)($stage['expires_at'] ?? 0) < time()) {
            $this->deleteStage($token);
            throw new RuntimeException('انتهت صلاحية المعاينة؛ أعد المحاولة مجدداً');
        }
        if(isset($stage['admin_id'])&&(int)$stage['admin_id']!==$this->importActorId())throw new DomainException('FORBIDDEN_IMPORT_OWNER');
        $networkId = $this->getActiveNetworkId();
        if ((int)$stage['network_id'] !== $networkId) throw new DomainException('FORBIDDEN_NETWORK');
        if (!is_file($stage['path']) || !str_starts_with((string)realpath($stage['path']), '/var/lib/mikrotik-usermanager/usermanager-imports/')) {
            throw new RuntimeException('ملف المعاينة غير متاح');
        }
        $currentMode=$this->importMode();$stage['auth_mode']=$stage['auth_mode']??$currentMode;
        if($stage['auth_mode']!==$currentMode)throw new RuntimeException('تغير نمط دخول الشبكة منذ المعاينة؛ أعد المعاينة قبل الاعتماد');
        return [$this->openSource($stage['path']), $stage];
    }

    private function openSource(string $path): PDO {
        $db = new PDO('sqlite:file:' . $path . '?mode=ro', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $db->query('PRAGMA query_only=ON');
        return $db;
    }

    private function openSourceWritable(string $path): PDO {
        return new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    }

    private function tables(PDO $db): array {
        return array_map('strval', $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN));
    }

    private function assertColumns(PDO $db, string $table, array $expected): void {
        $actual = array_column($db->query('PRAGMA table_info("' . $table . '")')->fetchAll(PDO::FETCH_ASSOC), 'name');
        foreach ($expected as $col) {
            if (!in_array($col, $actual, true)) {
                try {
                    $db->exec('ALTER TABLE "' . $table . '" ADD COLUMN "' . $col . '" TEXT DEFAULT NULL');
                } catch (Throwable $e) {}
            }
        }
    }

    private function createSanitizedPreview(string $sourcePath, string $targetPath): void {
        $allow = [
            'customer' => ['custId'],
            'profile' => ['id', 'custId', 'name', 'validity', 'startsAt', 'freeTrial', 'dynamicPrice', 'price', 'nameForUser', 'sharedUsers'],
            'user' => ['id', 'custId', 'userName', 'password', 'groupName', 'disabled', 'regDate', 'actualProfileId', 'actualProfileName', 'uptimeUsed', 'downloadUsed', 'uploadUsed', 'actualProfileStart', 'actualProfileEnd', 'profileTillTime'],
            'userprofile' => ['id', 'userId', 'profileId', 'price', 'validUntil', 'activated', 'state', 'endTime'],
            'purchase' => ['id', 'custId', 'userId', 'timestamp', 'userName'],
            'payment' => ['id', 'custId', 'userId', 'transStart', 'transEnd', 'purchaseId'],
            'pparts' => ['id', 'profileId', 'limitId', 'fromTime', 'tillTime', 'weekdays'],
            'limitation' => ['id', 'downloadLimit', 'uploadLimit', 'transferLimit', 'rateLimit', 'uptimeLimit', 'resetCounters', 'groupName', 'name'],
        ];
        @unlink($targetPath);
        $dst = new PDO('sqlite:' . $targetPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        try {
            $dst->exec('PRAGMA journal_mode=DELETE');
            $attach = $dst->prepare('ATTACH DATABASE ? AS source_db');
            $attach->execute(['file:' . $sourcePath . '?mode=ro']);
            $dst->beginTransaction();
            $sourceTables = $dst->query("SELECT name FROM source_db.sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($allow as $table => $wanted) {
                if (!in_array($table, $sourceTables, true)) continue;
                $info = $dst->query('PRAGMA source_db.table_info("' . $table . '")')->fetchAll(PDO::FETCH_ASSOC);
                $available = array_column($info, 'name');
                $cols = array_values(array_intersect($wanted, $available));
                if (!$cols) continue;
                $defs = [];
                foreach ($cols as $col) {
                    $meta = null;
                    foreach ($info as $i) {
                        if ($i['name'] === $col) {
                            $meta = $i;
                            break;
                        }
                    }
                    $type = preg_replace('/[^A-Za-z0-9_ ]/', '', (string)($meta['type'] ?? ''));
                    $defs[] = '"' . $col . '" ' . ($type ?: 'TEXT');
                }
                $dst->exec('CREATE TABLE "' . $table . '" (' . implode(',', $defs) . ')');
                $quoted = implode(',', array_map(static fn($c) => '"' . $c . '"', $cols));
                $dst->exec('INSERT INTO "' . $table . '" (' . $quoted . ') SELECT ' . $quoted . ' FROM source_db."' . $table . '"');
            }
            $dst->commit();
            try {
                if(in_array('userprofile',$sourceTables,true))$dst->exec('CREATE INDEX IF NOT EXISTS idx_userprofile_latest ON userprofile(userId,activated DESC,id DESC)');
                $dst->exec('CREATE INDEX IF NOT EXISTS idx_user_id ON "user"(id)');
                $dst->exec('CREATE INDEX IF NOT EXISTS idx_user_username ON "user"(userName)');
                $dst->exec('CREATE INDEX IF NOT EXISTS idx_user_profile ON "user"(actualProfileId, actualProfileName)');
                $dst->exec('CREATE INDEX IF NOT EXISTS idx_user_usage ON "user"(uptimeUsed, downloadUsed, uploadUsed)');
            } catch (Throwable $ignored) {}
            $dst->exec('DETACH DATABASE source_db');
        } catch (Throwable $e) {
            if ($dst->inTransaction()) $dst->rollBack();
            try { $dst->exec('DETACH DATABASE source_db'); } catch (Throwable $ignored) {}
            $dst = null;
            @unlink($targetPath);
            throw $e;
        }
        $dst = null;
        @chmod($targetPath, 0600);
    }

    private function assertEligibleRouter(int $routerId, int $networkId): void {
        if ($routerId <= 0) return;
        $q = $this->db->prepare("SELECT COUNT(*) FROM nas WHERE id=? AND network_id=?");
        $q->execute([$routerId, $networkId]);
        if ((int)$q->fetchColumn() !== 1) {
            throw new DomainException('الراوتر المختار غير تابع للشبكة النشطة');
        }
    }

    private function localPackageCost(int $networkId, string $name): float {
        $has = (bool)$this->db->query("SHOW COLUMNS FROM um_profiles_def LIKE 'cost_price'")->fetch(PDO::FETCH_ASSOC);
        if (!$has) return 0.0;
        $q = $this->db->prepare('SELECT cost_price FROM um_profiles_def WHERE network_id=? AND name=?');
        $q->execute([$networkId, $name]);
        return max(0, (float)$q->fetchColumn());
    }

    private function ensureQuarantineColumns(): void {
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS is_import_quarantined TINYINT(1) NOT NULL DEFAULT 0");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(14,2) NOT NULL DEFAULT 0");
    }

    private function cleanupExpired(): void {
        foreach (($_SESSION['sam_um_imports'] ?? []) as $token => $stage) {
            if ((int)($stage['expires_at'] ?? 0) < time()) $this->deleteStage((string)$token);
        }
        $dir = '/var/lib/mikrotik-usermanager/usermanager-imports';
        if (is_dir($dir)) {
            foreach (array_merge(glob($dir . '/*.sqldb') ?: [], glob($dir . '/*.source') ?: [], glob($dir . '/*.preview.sqlite') ?: []) as $p) {
                if (filemtime($p) < time() - 86400) @unlink($p);
            }
        }
    }

    private function deleteStage(string $token): void {
        $stage = $_SESSION['sam_um_imports'][$token] ?? null;
        if (is_array($stage) && isset($stage['path'])) {
            @unlink((string)$stage['path']);
            @unlink((string)$stage['path'] . '.meta.json');
        }
        @unlink('/var/lib/mikrotik-usermanager/usermanager-imports/' . $token . '.preview.sqlite.meta.json');
        unset($_SESSION['sam_um_imports'][$token]);
    }
}
