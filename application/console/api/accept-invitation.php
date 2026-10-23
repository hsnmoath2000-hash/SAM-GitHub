<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/api/v1/lib/AuthorizationContext.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
    header('Allow: POST');
    jsonResponse(['success' => false, 'error' => 'طريقة الطلب غير مدعومة.'], 405);
}

try {
    $db = getDB();
    assertPublicInvitationSchema($db);

    if (!hash_equals('XMLHttpRequest', (string) ($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) {
        jsonResponse(['success' => false, 'error' => 'تعذر التحقق من مصدر الطلب.'], 403);
    }
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        jsonResponse(['success' => false, 'error' => 'محتوى الطلب غير صالح.'], 400);
    }
    $token = trim((string) ($input['token'] ?? ''));
    if (($input['action'] ?? '') === 'preview') {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            jsonResponse(['success' => false, 'error' => 'رابط الدعوة غير صالح.'], 400);
        }
        jsonResponse(['success' => true, 'invitation' => loadInvitationPreview($db, $token)]);
    }
    $password = (string) ($input['password'] ?? '');
    $passwordConfirm = (string) ($input['password_confirm'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        jsonResponse(['success' => false, 'error' => 'رابط الدعوة غير صالح.'], 400);
    }
    if (strlen($password) < 12 || strlen($password) > 72) {
        jsonResponse(['success' => false, 'error' => 'يجب أن تتكون كلمة المرور من 12 إلى 72 بايتًا.'], 400);
    }
    if (!hash_equals($password, $passwordConfirm)) {
        jsonResponse(['success' => false, 'error' => 'تأكيد كلمة المرور غير مطابق.'], 400);
    }

    $tokenHash = hash('sha256', $token);
    $db->beginTransaction();
    try {
        $inviteQuery = $db->prepare(
            'SELECT id,admin_id,state,expires_at,created_by,issuer_network_id,membership_json
             FROM um_user_invitations WHERE token_hash=? FOR UPDATE'
        );
        $inviteQuery->execute([$tokenHash]);
        $invite = $inviteQuery->fetch(PDO::FETCH_ASSOC);
        if (!$invite || (string) $invite['state'] !== 'issued' || (string) $invite['expires_at'] <= date('Y-m-d H:i:s')) {
            throw new DomainException('INVITATION_UNAVAILABLE');
        }
        $networkId = (int) $invite['issuer_network_id'];
        $invitedAdminId = (int) $invite['admin_id'];
        $issuerId = (int) $invite['created_by'];
        $membership = json_decode((string) ($invite['membership_json'] ?: ''), true);
        if (!is_array($membership)
            || (int) ($membership['network_id'] ?? 0) !== $networkId
            || ($membership['access_level'] ?? '') !== 'member'
            || ($membership['data_scope'] ?? '') !== 'own') {
            throw new DomainException('INVITATION_CONFIGURATION_INVALID');
        }
        $roleKey = (string) ($membership['role_key'] ?? '');
        if ($networkId <= 0 || $invitedAdminId <= 0 || $issuerId <= 0 || $roleKey === '') {
            throw new DomainException('INVITATION_CONFIGURATION_INVALID');
        }

        $issuer = AuthorizationContext::loadActor($db, $issuerId, $networkId);
        $issuerAuthorization = new AuthorizationContext($db, $issuer);
        $issuerAuthorization->assertActiveNetwork();
        $issuerAuthorization->assertCan('admins_agents', 'INVITATION_ISSUER_REVOKED');
        if (!invitationRoleStillAssignable($db, $issuerAuthorization, $roleKey)) {
            throw new DomainException('INVITATION_ROLE_NO_LONGER_ALLOWED');
        }

        $accountQuery = $db->prepare(
            'SELECT id,username,is_active,onboarding_state FROM um_admins WHERE id=? FOR UPDATE'
        );
        $accountQuery->execute([$invitedAdminId]);
        $account = $accountQuery->fetch(PDO::FETCH_ASSOC);
        if (!$account || (int) $account['is_active'] !== 0 || (string) $account['onboarding_state'] !== 'invited') {
            throw new DomainException('INVITATION_ACCOUNT_INVALID');
        }
        $existingMembership = $db->prepare(
            'SELECT 1 FROM um_admin_network_access WHERE admin_id=? AND network_id=? LIMIT 1'
        );
        $existingMembership->execute([$invitedAdminId, $networkId]);
        if ($existingMembership->fetchColumn()) {
            throw new DomainException('INVITATION_MEMBERSHIP_EXISTS');
        }

        $db->exec('SET @sam_active_network_id=' . $networkId);
        $activate = $db->prepare(
            "UPDATE um_admins
             SET password_hash=?,is_active=1,must_change_password=0,onboarding_state='active',
                 identity_completed_at=NOW()
             WHERE id=? AND is_active=0 AND onboarding_state='invited'"
        );
        $activate->execute([password_hash($password, PASSWORD_DEFAULT), $invitedAdminId]);
        if ($activate->rowCount() !== 1) {
            throw new DomainException('INVITATION_ACCOUNT_INVALID');
        }

        $addMembership = $db->prepare(
            "INSERT INTO um_admin_network_access
                (admin_id,network_id,access_level,is_default,is_active,starts_at,granted_by_admin_id)
             SELECT a.id,?,'member',NOT EXISTS(
                 SELECT 1 FROM um_admin_network_access WHERE admin_id=a.id AND is_default=1 AND is_active=1
             ),1,NOW(),?
             FROM um_admins a WHERE a.id=?"
        );
        $addMembership->execute([$networkId, $issuerId, $invitedAdminId]);

        $assignRole = $db->prepare(
            "INSERT INTO um_admin_network_roles
                (admin_id,network_id,role_key,data_scope,is_active,assigned_by_admin_id)
             VALUES (?,?,?,'own',1,?)"
        );
        $assignRole->execute([$invitedAdminId, $networkId, $roleKey, $issuerId]);

        $complete = $db->prepare(
            "UPDATE um_user_invitations SET state='completed',completed_at=NOW()
             WHERE id=? AND state='issued'"
        );
        $complete->execute([(int) $invite['id']]);
        if ($complete->rowCount() !== 1) {
            throw new DomainException('INVITATION_UNAVAILABLE');
        }

        recordInvitationAcceptance($db, $invitedAdminId, $issuerId, $networkId);
        $db->commit();
        jsonResponse(['success' => true, 'username' => (string) $account['username']]);
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }
} catch (DomainException $exception) {
    $message = match ($exception->getMessage()) {
        'INVITATION_UNAVAILABLE' => 'الدعوة غير متاحة؛ قد تكون منتهية أو مستخدمة أو مبطلة.',
        'INVITATION_ISSUER_REVOKED' => 'لم يعد مُصدر الدعوة مخولًا لإضافة أعضاء لهذه الشبكة.',
        'INVITATION_ROLE_NO_LONGER_ALLOWED' => 'لم يعد الدور المحدد مسموحًا به. اطلب دعوة جديدة بدور آخر.',
        'INVITATION_ACCOUNT_INVALID' => 'حساب الدعوة لم يعد في حالة انتظار صالحة.',
        'INVITATION_MEMBERSHIP_EXISTS' => 'هذا الحساب عضو بالفعل في الشبكة.',
        'INVITATION_CONFIGURATION_INVALID' => 'إعدادات الدعوة غير مكتملة أو تغيرت.',
        default => 'تعذر إكمال الدعوة.',
    };
    $status = in_array($exception->getMessage(), ['INVITATION_UNAVAILABLE', 'INVITATION_ACCOUNT_INVALID', 'INVITATION_MEMBERSHIP_EXISTS'], true) ? 410 : 403;
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (PDOException $exception) {
    error_log('SAM invitation acceptance database operation failed: ' . $exception->getCode());
    jsonResponse(['success' => false, 'error' => 'تعذر إكمال الدعوة. تحقق من بيانات الحساب أو اطلب دعوة جديدة.'], 409);
} catch (Throwable $exception) {
    error_log('SAM invitation acceptance failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر إكمال الدعوة. حاول مرة أخرى لاحقًا.'], 500);
}

function assertPublicInvitationSchema(PDO $db): void
{
    $columns = $db->prepare(
        "SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations'
           AND COLUMN_NAME IN ('id','admin_id','token_hash','state','expires_at','created_by','opened_at','completed_at','membership_json','issuer_network_id','revoked_at','revoked_by')"
    );
    $columns->execute();
    if ((int) $columns->fetchColumn() !== 12) {
        jsonResponse(['success' => false, 'error' => 'خدمة الدعوات غير مهيأة. يرجى تشغيل ترحيل قاعدة البيانات 007_user_invitations.php.'], 503);
    }
}

function loadInvitationPreview(PDO $db, string $token): array
{
    $query = $db->prepare(
        "SELECT i.id,i.admin_id,i.state,i.expires_at,i.issuer_network_id,
                target.username,target.fullname,network.name AS network_name,
                JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key')) AS role_key,
                COALESCE(role.role_name_ar, JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key'))) AS role_name
         FROM um_user_invitations i
         JOIN um_admins target ON target.id=i.admin_id
          AND target.is_active=0 AND target.onboarding_state='invited'
         LEFT JOIN um_networks network ON network.id=i.issuer_network_id
         LEFT JOIN um_roles_def role
           ON role.role_key=JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key'))
         WHERE i.token_hash=? LIMIT 1"
    );
    $query->execute([hash('sha256', $token)]);
    $invite = $query->fetch(PDO::FETCH_ASSOC);
    if (!$invite || (string) $invite['state'] !== 'issued' || (string) $invite['expires_at'] <= date('Y-m-d H:i:s')) {
        jsonResponse(['success' => false, 'error' => 'الدعوة غير متاحة؛ قد تكون منتهية أو مستخدمة أو مبطلة.'], 410);
    }
    if ((int) $invite['issuer_network_id'] <= 0 || (int) $invite['admin_id'] <= 0) {
        jsonResponse(['success' => false, 'error' => 'بيانات الدعوة غير مكتملة.'], 410);
    }
    $opened = $db->prepare("UPDATE um_user_invitations SET opened_at=COALESCE(opened_at,NOW()) WHERE id=? AND state='issued'");
    $opened->execute([(int) $invite['id']]);
    return [
        'username' => (string) $invite['username'],
        'fullname' => (string) $invite['fullname'],
        'network_name' => (string) ($invite['network_name'] ?? ''),
        'role_name' => (string) ($invite['role_name'] ?? ''),
        'expires_at' => (string) $invite['expires_at'],
    ];
}

function invitationRoleStillAssignable(PDO $db, AuthorizationContext $authorization, string $roleKey): bool
{
    $roleQuery = $db->prepare(
        "SELECT role_key,permissions FROM um_roles_def
        WHERE role_key=? AND role_key NOT IN ('system_owner','superadmin','system_admin','admin')
        LIMIT 1"
    );
    $roleQuery->execute([$roleKey]);
    $role = $roleQuery->fetch(PDO::FETCH_ASSOC);
    if (!$role) {
        return false;
    }
    $permissions = json_decode((string) ($role['permissions'] ?: '[]'), true);
    $permissions = is_array($permissions) ? array_values(array_filter($permissions, 'is_string')) : [];
    $grantQuery = $db->prepare('SELECT permission_key FROM um_role_permissions WHERE role_key=? AND effect="grant"');
    $grantQuery->execute([$roleKey]);
    $permissions = array_values(array_unique(array_merge($permissions, $grantQuery->fetchAll(PDO::FETCH_COLUMN))));
    $denyQuery = $db->prepare('SELECT permission_key FROM um_role_permissions WHERE role_key=? AND effect="deny"');
    $denyQuery->execute([$roleKey]);
    $denied = array_flip($denyQuery->fetchAll(PDO::FETCH_COLUMN));
    foreach ($permissions as $permission) {
        if (isset($denied[$permission])) {
            continue;
        }
        if ($permission === '*' || !$authorization->can($permission)) {
            return false;
        }
    }
    return true;
}

function recordInvitationAcceptance(PDO $db, int $adminId, int $issuerId, int $networkId): void
{
    $nameQuery = $db->prepare('SELECT fullname FROM um_admins WHERE id=? LIMIT 1');
    $nameQuery->execute([$adminId]);
    $name = mb_substr((string) ($nameQuery->fetchColumn() ?: ''), 0, 100);
    $log = $db->prepare(
        "INSERT INTO um_activity_logs
            (admin_id,admin_name,action_type,action_category,action_title,details,status,network_id)
         VALUES (?,?, 'invitation_accepted','membership','اكتمال دعوة انضمام',?,'success',?)"
    );
    $log->execute([$adminId, $name, 'اكتمل الانضمام بدعوة صادرة من الحساب رقم ' . $issuerId . '.', $networkId]);
}
