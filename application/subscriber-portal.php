<?php
declare(strict_types=1);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$initial = [
    'username' => trim((string)($_GET['username'] ?? '')),
    'ip' => trim((string)($_GET['ip'] ?? '')),
    'mac' => trim((string)($_GET['mac'] ?? '')),
    'network_id' => (int)($_GET['network_id'] ?? 0),
];
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>بوابة المشترك</title>
<style>
:root{color-scheme:dark;--bg:#08111f;--panel:#101d31;--panel2:#14243b;--text:#eef6ff;--muted:#9db0c9;--primary:#38bdf8;--ok:#34d399;--warn:#fbbf24;--bad:#fb7185;--line:#263a55}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 10% 0,#12335a 0,#08111f 42%,#050a12 100%);font-family:Tahoma,"Segoe UI",sans-serif;color:var(--text);padding:20px}
.wrap{max-width:760px;margin:0 auto}.brand{display:flex;justify-content:space-between;align-items:center;margin:8px 0 18px}.brand h1{font-size:24px;margin:0}.brandIdentity{display:flex;align-items:center;gap:12px}.networkLogo{width:42px;height:42px;object-fit:contain;border-radius:10px;background:#fff;padding:4px;display:none}.brand span{color:var(--muted);font-size:13px}.card{background:rgba(16,29,49,.94);border:1px solid var(--line);border-radius:22px;padding:24px;box-shadow:0 20px 60px #0005;backdrop-filter:blur(10px)}
.status{display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:18px}.dot{width:11px;height:11px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 5px #ffffff0d}.dot.ok{background:var(--ok);box-shadow:0 0 0 5px #34d39922}.dot.bad{background:var(--bad)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric{background:var(--panel2);border:1px solid var(--line);border-radius:15px;padding:15px}.metric label{display:block;color:var(--muted);font-size:12px;margin-bottom:8px}.metric strong{font-size:17px;word-break:break-word}.wide{grid-column:1/-1}.session{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}.notice{padding:15px;border-radius:14px;background:#1b2b43;color:var(--muted);line-height:1.8}.notice.bad{background:#3b1827;color:#fecdd3}.notice.warn{background:#3b2c12;color:#fde68a}.hidden{display:none!important}.loader{color:var(--muted);text-align:center;padding:35px}.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}.btn{border:0;border-radius:12px;padding:12px 17px;background:var(--primary);color:#062033;font-weight:800;cursor:pointer}.btn.secondary{background:#223653;color:var(--text)}.tiny{font-size:11px;color:var(--muted);margin-top:14px;line-height:1.7}.ltr{direction:ltr;text-align:left} @media(max-width:560px){body{padding:12px}.card{padding:17px;border-radius:18px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.brand h1{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="brandIdentity"><img id="networkLogo" class="networkLogo" alt="شعار الشبكة"><h1 id="networkTitle">بوابة المشترك</h1></div><span id="networkSubtitle">استعلام آمن عن الجلسة الحالية</span></div>
  <main class="card">
    <div id="status" class="status"><i id="dot" class="dot"></i><span id="statusText">جارٍ التحقق من جلسة الراوتر...</span></div>
    <div id="loading" class="loader">يرجى الانتظار...</div>
    <div id="message" class="notice hidden"></div>
    <section id="data" class="hidden">
      <div class="grid">
        <div class="metric"><label>اسم المستخدم / الكرت</label><strong id="username">-</strong></div>
        <div class="metric"><label>الباقة</label><strong id="package">-</strong></div>
        <div class="metric"><label>السرعة</label><strong id="speed">-</strong></div>
        <div class="metric"><label>الحالة</label><strong id="accountStatus">-</strong></div>
        <div class="metric"><label>الوقت المتبقي</label><strong id="expires">-</strong></div>
        <div class="metric"><label>الأجهزة المتصلة</label><strong id="devices">-</strong></div>
        <div class="metric wide"><label>الجلسة الحالية</label><strong id="session" class="ltr">-</strong></div>
        <div class="metric"><label>عنوان IP</label><strong id="ip" class="ltr">-</strong></div>
        <div class="metric"><label>MAC</label><strong id="mac" class="ltr">-</strong></div>
        <div class="metric"><label>الرفع / التنزيل</label><strong id="traffic" class="ltr">-</strong></div>
      </div>
      <div class="actions"><button class="btn secondary" id="refresh">تحديث البيانات</button></div>
    </section>
    <div id="hint" class="tiny">لا يتم استخدام جلسة الإدارة في هذه البوابة. يجب فتحها من صفحة حالة الراوتر مع username وIP وMAC.</div>
  </main>
</div>
<script>
const initial = <?php echo json_encode($initial, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); ?>;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '-');
function bytes(n){n=Number(n||0);if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB'}
function showMessage(text, kind=''){ $('loading').classList.add('hidden');$('data').classList.add('hidden');$('message').className='notice '+kind;$('message').textContent=text;$('message').classList.remove('hidden');$('dot').className='dot '+(kind==='bad'?'bad':'');$('statusText').textContent=kind==='bad'?'تعذر التحقق من الجلسة':'بانتظار بيانات جلسة الراوتر'; }
async function load(){
  $('loading').classList.remove('hidden');$('message').classList.add('hidden');$('data').classList.add('hidden');$('statusText').textContent='جارٍ التحقق من جلسة الراوتر...';$('dot').className='dot';
  if(!initial.username||!initial.ip||!initial.mac){showMessage('افتح البوابة من صفحة حالة الراوتر. الرابط يجب أن يتضمن username وip وmac، ولا يتم طلب تسجيل دخول إداري هنا.','warn');return}
  const q=new URLSearchParams({username:initial.username,ip:initial.ip,mac:initial.mac});if(initial.network_id)q.set('network_id',initial.network_id);
  try{
    const r=await fetch('hotspot-status-api.php?'+q.toString(),{credentials:'omit',cache:'no-store'});const d=await r.json();
    if(!r.ok||!d.success){showMessage(d.error==='no_active_session'?'لا توجد جلسة نشطة مطابقة لهذا الجهاز. أعد فتح الصفحة من حالة الراوتر.':'تعذر التحقق من الكرت أو أن بيانات الجلسة غير متطابقة.','bad');return}
    const n=d.network||{}; if(n.hotspot_title){$('networkTitle').textContent=n.hotspot_title} else if(n.name){$('networkTitle').textContent=n.name+' — بوابة المشترك'} if(n.description){$('networkSubtitle').textContent=n.description} if(/^#[0-9a-f]{3,8}$/i.test(n.theme_color||'')){document.documentElement.style.setProperty('--primary',n.theme_color)} if(n.logo_url){$('networkLogo').src=n.logo_url;$('networkLogo').style.display='block'} const s=d.session||{};$('username').textContent=esc(d.username);$('package').textContent=esc(d.package_name||d.profile);$('speed').textContent=esc(d.selected_speed||d.package_max_speed);$('accountStatus').textContent=esc(d.account_status);$('expires').textContent=esc(d.expires_at||'غير محدد');$('devices').textContent=esc(d.connected_devices)+' / '+esc(d.package_max_devices);$('session').textContent=esc(s.started_at);$('ip').textContent=esc(s.ip||initial.ip);$('mac').textContent=esc(s.mac||initial.mac);$('traffic').textContent=bytes(s.upload_bytes)+' / '+bytes(s.download_bytes);$('loading').classList.add('hidden');$('message').classList.add('hidden');$('data').classList.remove('hidden');$('dot').className='dot ok';$('statusText').textContent='متصل — تم التحقق من جلسة الراوتر';
  }catch(e){showMessage('تعذر الاتصال بخدمة الاستعلام. حاول التحديث بعد لحظات.','bad')}
}
$('refresh').addEventListener('click',load);load();setInterval(load,30000);
</script>
</body></html>
