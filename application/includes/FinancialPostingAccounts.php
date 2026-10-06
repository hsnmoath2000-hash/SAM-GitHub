<?php
declare(strict_types=1);
/** Resolve posting accounts by tenant, code and type; never by global row ids. */
final class FinancialPostingAccounts {
    private const STANDARD = [
        '1'=>['الأصول','asset',null], '11'=>['الأصول المتداولة','asset','1'], '12'=>['الأصول الثابتة','asset','1'],
        '1101'=>['النقدية وما في حكمها','asset','11'], '1102'=>['البنوك ومحافظ الصرافة','asset','11'],
        '1104'=>['مخزون الكروت والأجهزة','asset','11'], '110402'=>['مخزون المعدات وقطع الغيار','asset','1104'],
        '1201'=>['أبراج ومواقع البث','asset','12'], '1202'=>['أجهزة الراوترات والسيرفرات','asset','12'],
        '1203'=>['الهوائيات والصحون والسكترات','asset','12'], '1204'=>['كابلات الألياف والشبكة','asset','12'],
        '1205'=>['منظومة الطاقة والبطاريات','asset','12'], '1206'=>['أجهزة ومعدات أخرى','asset','12'],
        '1207'=>['وسائل النقل','asset','12'], '1208'=>['أصول ومعدات أخرى','asset','12'], '2'=>['الخصوم والالتزامات','liability',null],
        '21'=>['الخصوم المتداولة','liability','2'], '2101'=>['الموردون وحسابات الدائنين','liability','21']
    ];
    public static function standard(PDO $db,int $networkId,string $code): int {
        if ($networkId<=0 || !isset(self::STANDARD[$code])) throw new DomainException('INVALID_POSTING_ACCOUNT');
        $own=!$db->inTransaction(); if($own)$db->beginTransaction();
        try {
            $lock=$db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$lock->execute([$networkId]);
            if(!$lock->fetchColumn())throw new DomainException('FORBIDDEN_NETWORK');
            $q=$db->prepare('SELECT id,account_type,is_active FROM um_chart_of_accounts WHERE network_id=? AND account_code=? FOR UPDATE');$q->execute([$networkId,$code]);$a=$q->fetch(PDO::FETCH_ASSOC);
            [$name,$type,$parentCode]=self::STANDARD[$code];
            if($a){if($a['account_type']!==$type || !(int)$a['is_active'])throw new DomainException('INVALID_POSTING_ACCOUNT');$id=(int)$a['id'];}
            else {
                $parent=$parentCode?self::standard($db,$networkId,$parentCode):null;
                $q=$db->prepare('INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,account_type,parent_id,level,is_system,is_active,balance) VALUES (?,?,?,?,?,?,1,1,0)');
                $level=strlen($code)===1?1:(strlen($code)===2?2:(strlen($code)===4?3:4));
                $q->execute([$networkId,$code,$name,$type,$parent,$level]);$id=(int)$db->lastInsertId();
            }
            if($own)$db->commit();return $id;
        }catch(Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
    }
    public static function validate(PDO $db,int $networkId,int $id,string $type,bool $cashOnly=false): array {
        $q=$db->prepare('SELECT id,account_code,account_type,is_active,parent_id,linked_admin_id,name_ar FROM um_chart_of_accounts WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$networkId,$id]);$a=$q->fetch(PDO::FETCH_ASSOC);
        if(!$a||$a['account_type']!==$type||!(int)$a['is_active'])throw new DomainException('INVALID_POSTING_ACCOUNT');
        if($cashOnly && !str_starts_with($a['account_code'],'1101')&&!str_starts_with($a['account_code'],'1102'))throw new DomainException('PAYMENT_ACCOUNT_MUST_BE_CASH_OR_BANK');
        return $a;
    }
    public static function cashForAdmin(PDO $db,int $networkId,int $adminId): int {
        if($adminId<=0)return self::standard($db,$networkId,'1101');
        $own=!$db->inTransaction();if($own)$db->beginTransaction();
        try {
            $parent=self::standard($db,$networkId,'1101');
            $q=$db->prepare('SELECT a.id,a.username,a.fullname FROM um_admins a JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=? AND x.is_active=1 AND (x.starts_at IS NULL OR x.starts_at<=NOW()) AND (x.expires_at IS NULL OR x.expires_at>NOW()) WHERE a.id=? AND a.is_active=1');$q->execute([$networkId,$adminId]);$admin=$q->fetch(PDO::FETCH_ASSOC);
            if(!$admin)throw new DomainException('FORBIDDEN_NETWORK_ADMIN');
            $q=$db->prepare("SELECT id,parent_id,account_code FROM um_chart_of_accounts WHERE network_id=? AND linked_admin_id=? AND account_type='asset' AND is_active=1 AND (parent_id=? OR name_ar LIKE 'صندوق:%') ORDER BY id FOR UPDATE");$q->execute([$networkId,$adminId,$parent]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);
            if(count($rows)>1)throw new DomainException('AMBIGUOUS_CASH_ACCOUNT');
            $code='1101'.str_pad((string)$adminId,6,'0',STR_PAD_LEFT);
            if($rows){$id=(int)$rows[0]['id'];if((int)$rows[0]['parent_id']!==$parent){$q=$db->prepare('UPDATE um_chart_of_accounts SET parent_id=?,account_code=? WHERE id=? AND network_id=?');$q->execute([$parent,$code,$id,$networkId]);}}
            else {$q=$db->prepare("INSERT INTO um_chart_of_accounts (network_id,account_code,name_ar,name_en,account_type,parent_id,linked_admin_id,owner_admin_id,level,is_system,is_active,balance) VALUES (?,?,?,?,'asset',?,?,?,4,0,1,0)");$q->execute([$networkId,$code,'صندوق: '.($admin['fullname']?:$admin['username']),'Cashbox: '.$admin['username'],$parent,$adminId,$adminId]);$id=(int)$db->lastInsertId();}
            if($own)$db->commit();return $id;
        }catch(Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
    }
}
