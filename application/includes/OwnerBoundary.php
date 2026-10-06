<?php
/** Platform accounts administer customers, never operate a customer's network. */
final class OwnerBoundary {
    public static function isOwner(PDO $db, int $id): bool {
        $q=$db->prepare('SELECT a.id FROM um_admins a LEFT JOIN um_system_owners o ON o.admin_id=a.id WHERE a.id=? AND a.is_active=1 AND (o.admin_id IS NOT NULL OR a.role="system_owner" OR a.id=1)');
        $q->execute([$id]); return (bool)$q->fetchColumn();
    }
    public static function allows(string $action): bool {
        return str_starts_with($action,'owner_') || in_array($action,[
            // These boot the platform shell and are not tenant operations.
            'check_auth','logout','change_own_password','get_ui_settings','save_ui_settings',
            'get_exchange_rates','get_notifications',
            'get_network_manager_candidates','save_network','delete_network',
            'get_sstp_status','restart_sstp','get_sstp_server_vpn_settings','save_sstp_server_vpn_settings',
            'get_um_proxy_settings','save_um_proxy_settings','reset_financial_system',
            // إدارة المنصّة على مستوى النظام (لا تطلب شبكة نشطة)
            'get_networks','get_admins','get_admins_with_roles','get_admin_details',
            'save_admin','delete_admin','update_admin_hierarchy',
            'get_roles','save_role','delete_role','get_next_username',
            'get_network_ui_settings','save_network_ui_settings','reset_network_ui_settings'
        ],true);
    }
    public static function enforce(PDO $db, int $id, string $action): void {
        if (self::isOwner($db,$id) && !self::allows($action)) {
            jsonResponse(['success'=>false,'code'=>'OWNER_TENANT_ACCESS_FORBIDDEN',
                'error'=>'حساب المالك لإدارة المنصة فقط. استخدم حساب مدير الشبكة لتشغيلها.'],403);
        }
    }
}
