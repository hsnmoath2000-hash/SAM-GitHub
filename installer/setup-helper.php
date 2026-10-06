<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || posix_geteuid() !== 0) exit(1);
const BASE='/var/lib/sam-web-installer';
const BUNDLE='/usr/local/share/sam-web-installer';
function output(array $v): never {echo json_encode($v,JSON_UNESCAPED_UNICODE);exit;}
function fresh(): bool {return !file_exists('/var/www/mikrotik-usermanager') && !file_exists('/etc/mikrotik-usermanager') && !file_exists('/etc/accel-ppp/accel-ppp.conf');}
function state(array $v): void {
 $p=BASE.'/status.json';$tmp=$p.'.tmp';
 file_put_contents($tmp,json_encode($v,JSON_UNESCAPED_UNICODE));chown($tmp,'root');chgrp($tmp,'www-data');chmod($tmp,0640);rename($tmp,$p);
}
$op=$argv[1]??'';
if ($op==='status') {echo is_file(BASE.'/status.json')?file_get_contents(BASE.'/status.json'):'{"state":"ready"}';exit;}
if ($op==='start') {
 $lock=fopen(BASE.'/private/lock','c');if(!flock($lock,LOCK_EX|LOCK_NB)) output(['error'=>'Installer busy']);
 if (!fresh() || file_exists(BASE.'/private/job.json') || file_exists(BASE.'/private/attempted')) output(['error'=>'Existing or attempted installation; refused']);
 $v=json_decode(stream_get_contents(STDIN,16384),true);
 if (!is_array($v)) output(['error'=>'Invalid request']);
 foreach(['domain','username','password','name','network','timezone'] as $k) if(!isset($v[$k])||!is_string($v[$k])||strlen($v[$k])>256) output(['error'=>'Invalid fields']);
 if (!preg_match('/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i',$v['domain']) || !str_contains($v['domain'],'.') || !preg_match('/^[a-z0-9_.-]{3,64}$/i',$v['username']) || strlen($v['password'])<12 || !in_array($v['timezone'],timezone_identifiers_list(),true)) output(['error'=>'Invalid domain, username, password or timezone']);
 file_put_contents(BASE.'/private/job.json',json_encode($v));chmod(BASE.'/private/job.json',0600);
 state(['state'=>'running','step'=>'preflight']);
 exec('/usr/bin/nohup /usr/bin/php '.escapeshellarg(__FILE__).' run >/dev/null 2>&1 < /dev/null &');
 output(['state'=>'running']);
}
if ($op!=='run') exit(1);
$lock=fopen(BASE.'/private/run.lock','c');if(!flock($lock,LOCK_EX|LOCK_NB))exit(1);
if(!fresh()){state(['state'=>'failed','message'=>'Existing installation detected']);exit(1);}
$v=json_decode(file_get_contents(BASE.'/private/job.json'),true);
$env=getenv();
foreach(['domain'=>'SAM_DOMAIN','username'=>'SAM_OWNER_USER','password'=>'SAM_OWNER_PASSWORD','name'=>'SAM_OWNER_NAME','network'=>'SAM_NETWORK_NAME','timezone'=>'SAM_TIMEZONE'] as $k=>$e)$env[$e]=$v[$k];
$log=BASE.'/private/install.log';
$proc=proc_open(['/usr/bin/bash',BUNDLE.'/install.sh','--install'],[0=>['file','/dev/null','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes,BUNDLE,$env);
if(!is_resource($proc)){state(['state'=>'failed','message'=>'Unable to launch installer']);exit(1);}
chmod($log,0600);
do {
 $st=proc_get_status($proc);$phase='preflight';
 foreach(file($log,FILE_IGNORE_NEW_LINES)?:[] as $line)if(preg_match('/^SAM_STEP: ([a-z-]+)$/',$line,$m))$phase=$m[1];
 state(['state'=>'running','step'=>$phase]);if($st['running'])sleep(2);
}while($st['running']);
$rc=$st['exitcode'];proc_close($proc);
unlink(BASE.'/private/job.json');
file_put_contents(BASE.'/private/attempted','1');chmod(BASE.'/private/attempted',0600);
state($rc===0?['state'=>'complete','url'=>'https://'.$v['domain'],'message'=>'Replace self-signed TLS with a trusted certificate before public use']:['state'=>'failed','step'=>$phase,'message'=>'Installation stopped at '.$phase.'. Review private install.log.']);
if($rc===0)file_put_contents(BASE.'/private/completed','1');
