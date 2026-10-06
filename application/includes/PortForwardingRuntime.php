<?php
declare(strict_types=1);

/** Serialize mutations across networks and roll back database rows on apply failure. */
function samPortForwardTransaction(PDO $db, callable $mutation): mixed {
    $lock = $db->query("SELECT GET_LOCK('sam_port_forward_runtime',15)")->fetchColumn();
    if ((int)$lock !== 1) throw new RuntimeException('تعذر الحصول على قفل تحديث توجيه المنافذ؛ أعد المحاولة');
    $ownsTransaction = !$db->inTransaction();
    if ($ownsTransaction) $db->beginTransaction();
    try {
        $result = $mutation();
        if ($ownsTransaction) $db->commit();
        return $result;
    } catch (Throwable $e) {
        if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
        throw $e;
    } finally {
        $db->query("SELECT RELEASE_LOCK('sam_port_forward_runtime')");
    }
}

function samOwnerApplyPortForwarding(PDO $db): array {
    $dir='/var/lib/mikrotik-usermanager/firewall';
    if (!is_dir($dir) || !is_writable($dir)) throw new RuntimeException('مجلد تشغيل توجيه المنافذ غير قابل للكتابة');
    $lock=fopen($dir.'/compile.lock','c');
    if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('تعذر قفل ملف تشغيل توجيه المنافذ');
    $path=$dir.'/port-forwards.conf';
    $old=is_file($path)?file_get_contents($path):null;
    $tmp=null;
    try {
        $rules=$db->query('SELECT id,listen_port,protocol,target_ip,target_port,comment,source_type,priority FROM um_port_forwarding WHERE is_enabled=1 ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
        $lines=[];$expected=0;
        foreach($rules as $r){
            $protocol=strtolower((string)($r['protocol']?:'tcp'));
            $sourceType=strtolower((string)($r['source_type']??'all'));
            $source=in_array($sourceType,['','all','none'],true)?'none':'sam_pf_'.(int)$r['id'].'_src';
            $priority=in_array($r['priority']??'normal',['normal','high'],true)?$r['priority']:'normal';
            $comment=preg_replace('/[^a-zA-Z0-9_.-]/u','_',trim((string)($r['comment']?:'forward')));
            $lines[]=(int)$r['listen_port'].' '.$protocol.' '.trim((string)$r['target_ip']).' '.(int)$r['target_port'].' '.$source.' '.$priority.' '.$comment;
            $expected+=($protocol==='both'?2:1);
        }
        $contents=implode("\n",$lines).($lines?"\n":'');
        $tmp=tempnam($dir,'.candidate-');
        if ($tmp===false || file_put_contents($tmp,$contents,LOCK_EX)!==strlen($contents)) throw new RuntimeException('تعذر كتابة ملف تشغيل توجيه المنافذ');
        chmod($tmp,0640);
        if (!rename($tmp,$path)) throw new RuntimeException('تعذر استبدال ملف تشغيل توجيه المنافذ');
        $tmp=null;
        $cmd='/usr/bin/sudo -n /usr/local/sbin/sam-system-control port-forward apply /dev/null '.escapeshellarg($path).' 2>&1';
        exec($cmd,$out,$code);
        $raw=implode("\n",$out);$result=json_decode($raw,true);
        if($code!==0 || !is_array($result) || empty($result['verified']) || (int)($result['active_count']??-1)!==$expected){
            throw new RuntimeException('فشل تطبيق توجيه المنافذ أو التحقق من القواعد الفعلية: '.($result['error']??mb_substr($raw,0,500)));
        }
        return ['code'=>0,'verified'=>true,'active_count'=>$expected,'output'=>$raw,'runtime_path'=>$path];
    } catch(Throwable $e){
        if($old!==null){
            $restore=tempnam($dir,'.previous-');
            if($restore!==false){file_put_contents($restore,$old,LOCK_EX);chmod($restore,0640);rename($restore,$path);}
        } elseif(is_file($path)){unlink($path);}
        throw $e;
    } finally {
        if($tmp!==null && is_file($tmp))unlink($tmp);
        flock($lock,LOCK_UN);fclose($lock);
    }
}
