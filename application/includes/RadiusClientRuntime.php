<?php
declare(strict_types=1);
function samRadiusClientRuntime(string $operation, int $id=0): array {
    if(!in_array($operation,['probe','sync'],true))throw new InvalidArgumentException('Invalid operation');
    $command='/usr/bin/sudo -n /usr/local/sbin/sam-system-control radius-client '.$operation;
    if($operation==='sync')$command.=' '.(int)$id;
    exec($command.' 2>&1',$output,$code);
    $result=json_decode(implode("\n",$output),true);
    if($code!==0||!is_array($result)||empty($result[$operation==='probe'?'ready':'verified'])) {
        throw new RuntimeException('تعذر التحقق من تحميل تعريف الراوتر داخل FreeRADIUS؛ لم يكتمل ربط RADIUS'.($id?' (NAS '.$id.')':''));
    }
    return $result;
}
