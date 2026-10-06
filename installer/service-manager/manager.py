#!/usr/bin/python3
"""Root-owned, fixed-catalog service installation; no arbitrary commands."""
import os,sys,json,re,secrets,subprocess,fcntl,time,shutil,tempfile
from pathlib import Path
APP=Path('/var/www/mikrotik-usermanager');BUNDLE=Path('/usr/local/share/sam-service-manager');JOBS=Path('/var/lib/mikrotik-usermanager/service-install-jobs')
PACKAGES={'apache2':['apache2'],'mariadb':['mariadb-server'],'freeradius':['freeradius','freeradius-mysql','freeradius-utils'],'redis-server':['redis-server'],'cron':['cron']}
CUSTOM={'sam-whatsapp':'services/whatsapp/server.js','sam-telemetry':'services/telemetry/server.js','mikrotik-usermanager-api-worker':'api/v1/worker.php','accel-ppp':None}
def catalog(unit):
 if unit in PACKAGES or unit in CUSTOM:return
 if re.fullmatch(r'php8\.[1-9]-fpm',unit):return
 raise ValueError('Unsupported service')
def command(args,timeout=1800):
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive','NEEDRESTART_MODE':'l'})
 if r.returncode:raise RuntimeError('Command failed: '+args[0]+'; '+r.stdout[-1200:])
 return r.stdout
def probe(unit):
 catalog(unit);r=subprocess.run(['/bin/systemctl','show',unit,'--property=LoadState,ActiveState,SubState','--no-pager'],capture_output=True,text=True)
 data=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
 reasons=[]
 if unit in CUSTOM and CUSTOM[unit] and not (APP/CUSTOM[unit]).is_file():reasons.append('ملفات الخدمة غير موجودة في نسخة التطبيق')
 if unit=='accel-ppp' and not Path('/etc/accel-ppp/accel-ppp.conf').is_file():reasons.append('يلزم إعداد SSTP والشهادة وRADIUS من إعدادات السيرفر أو استعادتها من نسخته')
 return {'unit':unit,'installed':data.get('LoadState')=='loaded','state':data.get('ActiveState','unknown'),'sub_state':data.get('SubState','unknown'),'configuration_required':reasons}
def write_job(job,data):
 target=JOBS/(job+'.json');tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False));os.chmod(tmp,0o600);os.replace(tmp,target)
def install(unit):
 if probe(unit)['installed']:return {'message':'الخدمة مثبتة بالفعل؛ لم تُعد تشغيلها','service':probe(unit)}
 if not Path('/usr/bin/apt-get').exists():raise RuntimeError('التثبيت يدعم Debian وUbuntu باستخدام apt')
 if unit in CUSTOM and CUSTOM[unit] and not (APP/CUSTOM[unit]).is_file():raise RuntimeError('انسخ ملفات التطبيق الكاملة أولاً؛ ملفات الخدمة غير موجودة')
 packages=PACKAGES.get(unit)
 if re.fullmatch(r'php8\.[1-9]-fpm',unit):packages=[unit]
 if unit in ['sam-whatsapp','sam-telemetry']:packages=['nodejs'] if shutil.which('npm') else ['nodejs','npm']
 if unit=='mikrotik-usermanager-api-worker':packages=['php-cli','php-mysql']
 if unit=='accel-ppp':packages=['cmake','make','gcc','g++','pkg-config','libssl-dev','libpcre3-dev','libpcre2-dev','libreadline-dev','libnl-3-dev','libnl-genl-3-dev','libnl-route-3-dev','libmnl-dev','libnetfilter-conntrack-dev','ppp']
 command(['/usr/bin/apt-get','update'])
 command(['/usr/bin/apt-get','install','-y','--no-upgrade','--no-install-recommends',*packages])
 if unit=='accel-ppp' and not Path('/usr/sbin/accel-pppd').is_file():
  src=BUNDLE/'accel-ppp-1.14.0.tar.gz'
  if not src.is_file():raise RuntimeError('حزمة مصدر SSTP غير موجودة؛ أعد تشغيل تهيئة أدوات الإدارة')
  with tempfile.TemporaryDirectory(prefix='sam-accel-') as tmp:
   command(['/bin/tar','-xzf',str(src),'-C',tmp,'--strip-components=1'])
   command(['cmake','-S',tmp,'-B',tmp+'/build','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_INSTALL_PREFIX=/usr','-DCMAKE_INSTALL_SYSCONFDIR=/etc/accel-ppp','-DSHAPER=FALSE','-DLUA=FALSE','-DBUILD_IPOE_DRIVER=FALSE','-DBUILD_VLAN_MON_DRIVER=FALSE','-DBUILD_PPTP_DRIVER=FALSE'])
   command(['cmake','--build',tmp+'/build','-j2'])
   config=Path('/etc/accel-ppp/accel-ppp.conf');saved=config.read_bytes() if config.exists() else None
   try:command(['cmake','--install',tmp+'/build'])
   finally:
    if saved is not None:config.write_bytes(saved);os.chmod(config,0o600)
   command(['/usr/sbin/ldconfig'])
 if unit in ['sam-whatsapp','sam-telemetry']:
  directory=(APP/CUSTOM[unit]).parent
  if not (directory/'node_modules').is_dir():
   if not (directory/'package-lock.json').is_file():raise RuntimeError('ملف تثبيت مكتبات Node المقفل غير موجود')
   # Install dependencies as the application user, never execute package scripts as root.
   deps=Path('/var/lib/mikrotik-usermanager/service-dependencies')/unit;deps.mkdir(parents=True,exist_ok=True);shutil.chown(deps,user='www-data',group='www-data')
   for filename in ['package.json','package-lock.json']:shutil.copyfile(directory/filename,deps/filename);shutil.chown(deps/filename,user='www-data',group='www-data')
   command(['/usr/sbin/runuser','-u','www-data','--','npm','ci','--omit=dev','--ignore-scripts','--prefix',str(deps)])
   (directory/'node_modules').symlink_to(deps/'node_modules',target_is_directory=True)
 if unit in CUSTOM:
  template=BUNDLE/(unit+'.service');dest=Path('/etc/systemd/system')/(unit+'.service')
  if not template.is_file():raise RuntimeError('تعريف الخدمة غير موجود في حزمة الإدارة')
  if not dest.exists():shutil.copyfile(template,dest);os.chmod(dest,0o644)
 command(['/bin/systemctl','daemon-reload']);p=probe(unit)
 if not p['installed']:raise RuntimeError('لم يظهر تعريف الخدمة بعد التثبيت')
 return {'message':'تم تثبيت الخدمة؛ استخدم تشغيل بعد مراجعة إعداداتها','service':p}
def main(args):
 if os.geteuid()!=0:raise RuntimeError('Root helper required')
 op=args[0] if args else '';unit=args[1] if len(args)>1 else ''
 if op=='probe':print(json.dumps(probe(unit),ensure_ascii=False));return
 if op=='status':
  if not re.fullmatch('[a-f0-9]{32}',unit):raise ValueError('Invalid job id')
  path=JOBS/(unit+'.json');print(path.read_text() if path.is_file() else json.dumps({'success':False,'message':'مهمة التثبيت غير موجودة'}));return
 catalog(unit);JOBS.mkdir(mode=0o700,parents=True,exist_ok=True)
 if op=='install':
  job=secrets.token_hex(16);write_job(job,{'success':True,'job_id':job,'state':'queued','unit':unit,'message':'في انتظار التثبيت'})
  subprocess.Popen(['/usr/bin/python3',__file__,'_run',unit,job],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)
  print(json.dumps({'success':True,'job_id':job,'state':'queued'}));return
 if op=='_run' and len(args)==3 and re.fullmatch('[a-f0-9]{32}',args[2]):
  job=args[2]
  try:
   with (JOBS/'installation.lock').open('w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);write_job(job,{'success':True,'state':'running','unit':unit,'message':'يجري تثبيت المتطلبات'})
    result=install(unit);write_job(job,{'success':True,'state':'completed','unit':unit,**result})
  except Exception as e:write_job(job,{'success':False,'state':'failed','unit':unit,'message':str(e)})
  return
 raise ValueError('Invalid operation')
if __name__=='__main__':
 try:main(sys.argv[1:])
 except Exception as e:print(json.dumps({'success':False,'message':str(e)},ensure_ascii=False));sys.exit(1)
