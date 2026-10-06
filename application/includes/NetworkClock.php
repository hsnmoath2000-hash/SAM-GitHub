<?php
declare(strict_types=1);
final class NetworkClock
{
    public static function timezone(PDO $db, int $networkId): string
    {
        $q=$db->prepare("SELECT setting_value FROM um_network_settings WHERE network_id=? AND setting_key='timezone'");
        $q->execute([$networkId]); $zone=(string)($q->fetchColumn() ?: '');
        if ($zone==='') {
            $q=$db->prepare('SELECT timezone FROM um_network_subscriptions WHERE network_id=?');
            $q->execute([$networkId]); $zone=(string)($q->fetchColumn() ?: date_default_timezone_get());
        }
        return in_array($zone,DateTimeZone::listIdentifiers(),true)?$zone:'Asia/Aden';
    }
    public static function set(PDO $db,int $networkId,int $adminId,string $zone): void
    {
        if (!in_array($zone,DateTimeZone::listIdentifiers(),true)) throw new InvalidArgumentException('اختر منطقة زمنية صحيحة.');
        $db->beginTransaction();
        try {
            $q=$db->prepare("INSERT INTO um_network_settings(network_id,setting_key,setting_value,is_secret,updated_by_admin_id) VALUES(?,'timezone',?,0,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_admin_id=VALUES(updated_by_admin_id)");
            $q->execute([$networkId,$zone,$adminId]);
            $db->prepare('UPDATE um_network_subscriptions SET timezone=? WHERE network_id=?')->execute([$zone,$networkId]);
            $db->commit();
        } catch(Throwable $e) {if($db->inTransaction())$db->rollBack();throw $e;}
    }
}
