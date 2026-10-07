<?php
declare(strict_types=1);

final class ApiAuthorization
{
    public static function requirePermission(array $actor, string $permission): void
    {
        // System owner and superadmin have unrestricted global permissions
        if (in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)) {
            return;
        }
        $permissions = $actor['effective_permissions'] ?? [];
        if (!in_array('*', $permissions, true) && !in_array($permission, $permissions, true)) {
            throw new DomainException('FORBIDDEN');
        }
    }

    public static function scopedAdminIds(PDO $db, array $actor): ?array
    {
        if (($actor['data_scope'] ?? 'own') === 'all' || in_array(($actor['role'] ?? ''), ['system_owner', 'superadmin'], true)) return null;
        $ids = [(int)$actor['admin_id']];
        if (($actor['data_scope'] ?? '') === 'assigned') {
            $ids = array_merge($ids, $actor['delegated_ids'] ?? []);
            $stmt = $db->prepare('SELECT id FROM um_admins WHERE parent_id=?');
            $stmt->execute([(int)$actor['admin_id']]);
            $ids = array_merge($ids, array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN)));
        }
        return array_values(array_unique(array_filter($ids)));
    }

    public static function canAccessAdmin(PDO $db, array $actor, int $targetId): bool
    {
        $ids = self::scopedAdminIds($db, $actor);
        return $ids === null || in_array($targetId, $ids, true);
    }
}
