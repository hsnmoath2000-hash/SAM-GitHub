<?php
declare(strict_types=1);
ini_set('session.cookie_secure','1');ini_set('session.cookie_httponly','1');ini_set('session.cookie_samesite','Strict');
session_start();
header('Cache-Control: no-store');header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
$_SESSION['csrf']??=bin2hex(random_bytes(24));
$error='';
if($_SERVER['REQUEST_METHOD']==='POST'){
 if(!hash_equals($_SESSION['csrf'],(string)($_POST['csrf']??'')))http_response_code(403);
 elseif(isset($_POST['token'])){
  if(hash_equals(trim(file_get_contents('/etc/sam-web-installer/token.hash')),hash('sha256',(string)$_POST['token']))) {session_regenerate_id(true);$_SESSION['auth']=time();}
  else $error='رمز الدخول غير صحيح';
 } elseif(isset($_SESSION['auth']) && time()-$_SESSION['auth']<3600){
  $v=[];foreach(['domain','username','password','name','network','timezone']as$k)$v[$k]=(string)($_POST[$k]??'');
  $p=proc_open(['/usr/bin/sudo','-n','/usr/bin/php','/usr/local/share/sam-web-installer/setup-helper.php','start'],[0=>['pipe','r'],1=>['pipe','w'],2=>['file','/dev/null','a']],$pipes);
  if(is_resource($p)){fwrite($pipes[0],json_encode($v));fclose($pipes[0]);$r=json_decode(stream_get_contents($pipes[1]),true);fclose($pipes[1]);proc_close($p);$error=$r['error']??'بدأ التثبيت. حدّث الحالة لمتابعة النتيجة.';}else $error='تعذر تشغيل المثبت';
 }
}
function esc(string $s):string{return htmlspecialchars($s,ENT_QUOTES,'UTF-8');}
$auth=isset($_SESSION['auth'])&&time()-$_SESSION['auth']<3600;
$status=$auth&&is_file('/var/lib/sam-web-installer/status.json')?json_decode(file_get_contents('/var/lib/sam-web-installer/status.json'),true):['state'=>'ready'];
?><!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>تثبيت SAM</title><style>body{font-family:Arial;background:#eef3f8;color:#123;padding:24px}main{max-width:650px;margin:auto;background:white;padding:28px;border-radius:16px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0}button{background:#008e86;color:white;border:0;border-radius:8px}p{line-height:1.7}</style><main><h1>تثبيت SAM على سيرفر جديد</h1><p>هذه نسخة نظيفة بلا مشتركين أو بيانات السيرفر الأصلي. يمنع المثبت العمل عند وجود تثبيت سابق.</p><p><?=esc($error)?></p>
<form method="post"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>">
<?php if(!$auth):?><label>رمز التثبيت المعروض في الطرفية<input type="password" name="token" required></label><button>دخول</button>
<?php elseif(($status['state']??'')==='ready'):?>
<label>اسم النطاق<input name="domain" placeholder="sam.example.com" required></label>
<label>اسم مستخدم المالك<input name="username" value="owner" required></label>
<label>كلمة مرور جديدة (12 حرفًا فأكثر)<input type="password" name="password" minlength="12" required autocomplete="new-password"></label>
<label>اسم المالك<input name="name" required></label><label>اسم الشبكة الأولى<input name="network" required></label>
<label>المنطقة الزمنية<input name="timezone" value="Asia/Aden" required></label>
<p>سيثبت قواعد البيانات وRADIUS وSSTP والخدمات المطلوبة على هذا السيرفر الجديد. شهادة HTTPS الأولية ذاتية التوقيع وتحتاج استبدالًا بشهادة موثوقة.</p><button>تثبيت النظام والخدمات</button>
<?php else:?><p>الحالة: <?=esc((string)$status['state'])?></p><p><?=esc((string)($status['message']??'التثبيت جارٍ، استخدم تحديث الحالة.'))?></p>
<?php if(isset($status['url'])):?><a href="<?=esc($status['url'])?>">فتح النظام</a><?php endif;?>
<?php endif;?></form><?php if($auth):?><a href="./">تحديث الحالة</a><?php endif;?></main></html>
