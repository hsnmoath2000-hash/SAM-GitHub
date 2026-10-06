#!/usr/bin/env php
<?php
declare(strict_types=1);
$lock = fopen('/run/sam-expire-vouchers.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
$config = require '/etc/mikrotik-usermanager/app-config.php';
$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_port'], $config['db_name']);
$db = new PDO($dsn, $config['db_user'], $config['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec("UPDATE um_vouchers_meta SET status = 'expired' WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND status IN ('active','used')");
$db->exec("INSERT INTO radcheck (network_id, username, attribute, op, value)
           SELECT m.network_id, m.username, 'Auth-Type', ':=', 'Reject'
           FROM um_vouchers_meta m
           WHERE m.expires_at IS NOT NULL AND m.expires_at <= NOW()
           AND NOT EXISTS (SELECT 1 FROM radcheck r WHERE r.network_id=m.network_id AND r.username=m.username AND r.attribute='Auth-Type' AND r.value='Reject')");
$sql = "SELECT a.username,a.acctsessionid,a.framedipaddress,a.nasipaddress,n.secret FROM radacct a JOIN um_vouchers_meta m ON m.network_id=a.network_id AND m.username=a.username JOIN nas n ON n.network_id=a.network_id AND n.nasname=a.nasipaddress WHERE a.acctstoptime IS NULL AND m.expires_at IS NOT NULL AND m.expires_at<=NOW() AND a.username NOT REGEXP '^router_[0-9]+$'";
foreach ($db->query($sql) as $row) {
    $attrs = ['User-Name := '.$row['username']];
    if (!empty($row['acctsessionid'])) $attrs[] = 'Acct-Session-Id := '.$row['acctsessionid'];
    if (!empty($row['framedipaddress'])) $attrs[] = 'Framed-IP-Address := '.$row['framedipaddress'];
    $command = ['/usr/bin/radclient','-r','1','-t','2',$row['nasipaddress'].':'.(string)($config['default_coa_port'] ?? 3799),'disconnect',(string)$row['secret']];
    $spec = [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
    $proc = proc_open($command,$spec,$pipes);
    if (!is_resource($proc)) { syslog(LOG_WARNING,'SAM expiry disconnect could not start for '.$row['username']); continue; }
    fwrite($pipes[0],implode(PHP_EOL,$attrs).PHP_EOL); fclose($pipes[0]);
    stream_get_contents($pipes[1]); fclose($pipes[1]);
    $error=trim(stream_get_contents($pipes[2])); fclose($pipes[2]);
    if (proc_close($proc)!==0) syslog(LOG_WARNING,'SAM expiry disconnect failed for '.$row['username'].': '.substr($error,0,180));
}
