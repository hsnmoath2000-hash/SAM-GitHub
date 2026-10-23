<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/api/v1/lib/AuthorizationContext.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    jsonResponse(['success' => false, 'error' => 'طريقة الطلب غير مدعومة.'], 405);
}

requireAuth();

if ($method === 'POST' && !hash_equals('XMLHttpRequest', (string) ($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) {
    jsonResponse(['success' => false, 'error' => 'تعذر التحقق من مصدر الطلب.'], 403);
}

$requestedNetwork = filter_input(INPUT_GET, 'network_id', FILTER_VALIDATE_INT);
if ($requestedNetwork === false || ($requestedNetwork !== null && $requestedNetwork < 0)) {
    jsonResponse(['success' => false, 'error' => 'رقم الشبكة غير صالح.'], 400);
}

try {
    $db = getDB();
    assertInvitationSchema($db);
    $actorId = (int) ($_SESSION['admin_id'] ?? 0);
    $actor = AuthorizationContext::loadActor(
        $db,
        $actorId,
        $requestedNetwork !== null && $requestedNetwork > 0 ? $requestedNetwork : null
    );
    $authorization = new AuthorizationContext($db, $actor);
    $authorization->assertActiveNetwork();
    $networkId = $authorization->activeNetworkId();
    $authorization->assertCan('admins_agents', 'INVITATION_PERMISSION_REQUIRED');

    if ($method === 'GET') {
        $view = (string) ($_GET['view'] ?? 'list');
        if ($view === 'roles') {
            $roles = listAssignableRoles($db, $authorization);
            jsonResponse(['success' => true, 'roles' => $roles]);
        }
        if ($view !== 'list') {
            jsonResponse(['success' => false, 'error' => 'القسم المطلوب غير معروف.'], 400);
        }

        $query = $db->prepare(
            "SELECT i.id, i.state, i.created_at, i.expires_at, i.opened_at, i.completed_at,
                    i.revoked_at, created.fullname AS issuer_name, target.fullname AS target_name,
                    target.username, target.phone,
                    JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key')) AS role_key,
                    COALESCE(role.role_name_ar, JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key'))) AS role_name,
                    CASE WHEN i.state = 'issued' AND i.expires_at <= NOW() THEN 'expired' ELSE i.state END AS display_state
             FROM um_user_invitations i
             JOIN um_admins target ON target.id = i.admin_id
             JOIN um_admins created ON created.id = i.created_by
             LEFT JOIN um_roles_def role
               ON role.role_key = JSON_UNQUOTE(JSON_EXTRACT(i.membership_json, '$.role_key'))
             WHERE i.issuer_network_id = ?
             ORDER BY i.id DESC LIMIT 100"
        );
        $query->execute([$networkId]);
        jsonResponse([
            'success' => true,
            'network_id' => $networkId,
            'invitations' => $query->fetchAll(PDO::FETCH_ASSOC),
            'generated_at' => date(DATE_ATOM),
        ]);
    }

    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        jsonResponse(['success' => false, 'error' => 'محتوى الطلب غير صالح.'], 400);
    }
    $action = (string) ($input['action'] ?? '');

    if ($action === 'create') {
        $username = trim((string) ($input['username'] ?? ''));
        $fullname = trim((string) ($input['fullname'] ?? ''));
        $phoneInput = trim((string) ($input['phone'] ?? ''));
        $email = trim((string) ($input['email'] ?? ''));
        $roleKey = trim((string) ($input['role_key'] ?? ''));
        $expiresHours = filter_var($input['expires_hours'] ?? 72, FILTER_VALIDATE_INT);
        $requestKey = trim((string) ($input['request_key'] ?? ''));

        if ($roleKey === '' || strlen($roleKey) > 64) {
            jsonResponse(['success' => false, 'error' => 'الدور المحدد غير صالح.'], 400);
        }
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/', $username)) {
            jsonResponse(['success' => false, 'error' => 'اسم الدخول يجب أن يتكون من 3 إلى 64 حرفًا أو رقمًا، ويمكن استخدام النقطة والشرطة السفلية والشرطة.'], 400);
        }
        if ($fullname === '' || mb_strlen($fullname) > 128) {
            jsonResponse(['success' => false, 'error' => 'الاسم الكامل مطلوب وبحد أقصى 128 حرفًا.'], 400);
        }
        if ($phoneInput === '' || !isValidYemenPhone($phoneInput)) {
            jsonResponse(['success' => false, 'error' => 'أدخل رقم هاتف يمنيًا صالحًا.'], 400);
        }
        if ($email !== '' && (strlen($email) > 128 || !filter_var($email, FILTER_VALIDATE_EMAIL))) {
            jsonResponse(['success' => false, 'error' => 'البريد الإلكتروني غير صالح.'], 400);
        }
        if ($expiresHours === false || !in_array($expiresHours, [24, 72, 168, 336], true)) {
            jsonResponse(['success' => false, 'error' => 'مدة الدعوة غير صالحة.'], 400);
        }
        if (!preg_match('/^[A-Za-z0-9-]{16,100}$/', $requestKey)) {
            jsonResponse(['success' => false, 'error' => 'مفتاح الطلب غير صالح.'], 400);
        }

        $normalizedPhone = normalizeYemenPhone($phoneInput);
        $role = assignableRole($db, $authorization, $roleKey);
        if (!$role) {
            jsonResponse(['success' => false, 'error' => 'لا يمكن إسناد هذا الدور إلى دعوة ضمن صلاحياتك.'], 403);
        }

        $db->beginTransaction();
        try {
            $requestCheck = $db->prepare('SELECT id FROM um_user_invitations WHERE created_by = ? AND request_key = ? LIMIT 1');
            $requestCheck->execute([$actorId, $requestKey]);
            if ($requestCheck->fetchColumn()) {
                throw new DomainException('INVITATION_REQUEST_REUSED');
            }

            $existingQuery = $db->prepare(
                'SELECT id, fullname, phone, email, created_by_admin_id, is_active, onboarding_state
                 FROM um_admins WHERE username = ? LIMIT 1 FOR UPDATE'
            );
            $existingQuery->execute([$username]);
            $existing = $existingQuery->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                $isOwnPendingAccount = (int) $existing['is_active'] === 0
                    && (int) $existing['created_by_admin_id'] === $actorId
                    && in_array((string) $existing['onboarding_state'], ['invited', 'invite_revoked'], true);
                if (!$isOwnPendingAccount) {
                    throw new DomainException('INVITATION_USERNAME_UNAVAILABLE');
                }
                if ((string) $existing['phone'] !== $normalizedPhone) {
                    throw new DomainException('INVITATION_PHONE_MISMATCH');
                }
                $adminId = (int) $existing['id'];
                $restorePending = $db->prepare(
                    "UPDATE um_admins SET fullname=?,email=?,onboarding_state='invited'
                     WHERE id=? AND is_active=0 AND onboarding_state IN ('invited','invite_revoked')"
                );
                $restorePending->execute([$fullname, $email !== '' ? $email : null, $adminId]);
            } else {
                $placeholderPassword = bin2hex(random_bytes(32));
                $insertAdmin = $db->prepare(
                    "INSERT INTO um_admins
                        (username,password_hash,fullname,phone,email,role,parent_id,is_active,
                         created_by_admin_id,created_by_name,must_change_password,data_scope,onboarding_state)
                     VALUES (?,?,?,?,?,'distributor',?,0,?,?,1,'own','invited')"
                );
                $insertAdmin->execute([
                    $username,
                    password_hash($placeholderPassword, PASSWORD_DEFAULT),
                    $fullname,
                    $normalizedPhone,
                    $email !== '' ? $email : null,
                    $actorId,
                    $actorId,
                    (string) ($actor['fullname'] ?? ''),
                ]);
                $adminId = (int) $db->lastInsertId();
            }

            $otherPending = $db->prepare(
                "SELECT issuer_network_id FROM um_user_invitations
                 WHERE admin_id=? AND state='issued' AND expires_at>NOW() FOR UPDATE"
            );
            $otherPending->execute([$adminId]);
            foreach ($otherPending->fetchAll(PDO::FETCH_COLUMN) as $pendingNetworkId) {
                if ((int) $pendingNetworkId !== $networkId) {
                    throw new DomainException('INVITATION_PENDING_OTHER_NETWORK');
                }
            }

            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $membership = json_encode([
                'role_key' => $roleKey,
                'network_id' => $networkId,
                'data_scope' => 'own',
                'access_level' => 'member',
            ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

            $revokePrevious = $db->prepare(
                "UPDATE um_user_invitations
                 SET state='revoked', revoked_at=NOW(), revoked_by=?
                 WHERE admin_id=? AND issuer_network_id=? AND state='issued' AND expires_at>NOW()"
            );
            $revokePrevious->execute([$actorId, $adminId, $networkId]);

            $insertInvitation = $db->prepare(
                "INSERT INTO um_user_invitations
                    (admin_id,token_hash,state,expires_at,created_by,request_key,membership_json,issuer_network_id)
                 VALUES (?,?,'issued',DATE_ADD(NOW(), INTERVAL ? HOUR),?,?,?,?)"
            );
            $insertInvitation->execute([
                $adminId,
                $tokenHash,
                $expiresHours,
                $actorId,
                $requestKey,
                $membership,
                $networkId,
            ]);
            $invitationId = (int) $db->lastInsertId();

            recordInvitationActivity(
                $db,
                $actorId,
                $networkId,
                'invitation_issued',
                'إصدار دعوة انضمام',
                'تم إصدار دعوة لمستخدم ' . $username
            );
            $db->commit();

            jsonResponse([
                'success' => true,
                'invitation_id' => $invitationId,
                'username' => $username,
                'expires_at' => date(DATE_ATOM, time() + ($expiresHours * 3600)),
                'invitation_url' => 'join.php#token=' . rawurlencode($token),
            ], 201);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    if ($action === 'revoke') {
        $invitationId = filter_var($input['invitation_id'] ?? null, FILTER_VALIDATE_INT);
        if ($invitationId === false || $invitationId === null || $invitationId <= 0) {
            jsonResponse(['success' => false, 'error' => 'رقم الدعوة غير صالح.'], 400);
        }
        $db->beginTransaction();
        try {
            $find = $db->prepare(
                "SELECT id,admin_id,state,expires_at FROM um_user_invitations
                 WHERE id=? AND issuer_network_id=? FOR UPDATE"
            );
            $find->execute([$invitationId, $networkId]);
            $invitation = $find->fetch(PDO::FETCH_ASSOC);
            if (!$invitation) {
                throw new DomainException('INVITATION_NOT_FOUND');
            }
            if ((string) $invitation['state'] !== 'issued' || (string) $invitation['expires_at'] <= date('Y-m-d H:i:s')) {
                throw new DomainException('INVITATION_NOT_REVOCABLE');
            }
            $revoke = $db->prepare(
                "UPDATE um_user_invitations SET state='revoked',revoked_at=NOW(),revoked_by=?
                 WHERE id=? AND state='issued'"
            );
            $revoke->execute([$actorId, $invitationId]);
            if ($revoke->rowCount() !== 1) {
                throw new DomainException('INVITATION_NOT_REVOCABLE');
            }
            $inactive = $db->prepare(
                "UPDATE um_admins SET onboarding_state='invite_revoked'
                 WHERE id=? AND is_active=0 AND onboarding_state='invited'"
            );
            $inactive->execute([(int) $invitation['admin_id']]);
            recordInvitationActivity($db, $actorId, $networkId, 'invitation_revoked', 'إبطال دعوة انضمام', 'تم إبطال الدعوة رقم ' . $invitationId);
            $db->commit();
            jsonResponse(['success' => true, 'invitation_id' => $invitationId]);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    jsonResponse(['success' => false, 'error' => 'العملية المطلوبة غير معروفة.'], 400);
} catch (DomainException $exception) {
    $message = match ($exception->getMessage()) {
        'INVITATION_PERMISSION_REQUIRED' => 'لا تملك صلاحية إدارة أعضاء الشبكة.',
        'INVITATION_REQUEST_REUSED' => 'استُخدم مفتاح الطلب من قبل. أعد إرسال الطلب بمفتاح جديد.',
        'INVITATION_USERNAME_UNAVAILABLE' => 'اسم الدخول مستخدم أو لا يمكن إعادة دعوته بهذا الحساب.',
        'INVITATION_PHONE_MISMATCH' => 'رقم الهاتف لا يطابق الحساب المعلّق. استخدم رقم الهاتف المسجل عند إنشاء الدعوة الأولى.',
        'INVITATION_PENDING_OTHER_NETWORK' => 'للحساب دعوة معلّقة لشبكة أخرى. أكملها أو أبطِلها قبل إصدار دعوة جديدة.',
        'INVITATION_NOT_FOUND' => 'الدعوة غير موجودة في هذه الشبكة.',
        'INVITATION_NOT_REVOCABLE' => 'الدعوة منتهية أو مستخدمة أو مبطلة مسبقًا.',
        default => 'تعذر إتمام عملية الدعوة.',
    };
    $status = match ($exception->getMessage()) {
        'AUTH_REQUIRED', 'ACCOUNT_DISABLED' => 401,
        'INVITATION_USERNAME_UNAVAILABLE', 'INVITATION_PHONE_MISMATCH', 'INVITATION_PENDING_OTHER_NETWORK', 'INVITATION_REQUEST_REUSED' => 409,
        'INVITATION_NOT_FOUND' => 404,
        'INVITATION_PERMISSION_REQUIRED', 'NETWORK_CONTEXT_REQUIRED', 'FORBIDDEN_NETWORK', 'NETWORK_ACCESS_REQUIRED' => 403,
        default => 422,
    };
    jsonResponse(['success' => false, 'error' => $message], $status);
} catch (PDOException $exception) {
    error_log('SAM invitation database operation failed: ' . $exception->getCode());
    jsonResponse(['success' => false, 'error' => 'تعذر حفظ الدعوة. تحقق من عدم تكرار اسم الدخول أو رقم الهاتف.'], 409);
} catch (Throwable $exception) {
    error_log('SAM invitation operation failed: ' . $exception->getMessage());
    jsonResponse(['success' => false, 'error' => 'تعذر تنفيذ العملية. حاول مرة أخرى لاحقًا.'], 500);
}

function assertInvitationSchema(PDO $db): void
{
    $columns = $db->prepare(
        "SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='um_user_invitations'
           AND COLUMN_NAME IN ('id','admin_id','token_hash','state','expires_at','created_by','request_key','created_at','opened_at','completed_at','membership_json','issuer_network_id','revoked_at','revoked_by')"
    );
    $columns->execute();
    if ((int) $columns->fetchColumn() !== 14) {
        jsonResponse(['success' => false, 'error' => 'يتطلب نظام الدعوات تشغيل ترحيل قاعدة البيانات 007_user_invitations.php أولًا.'], 503);
    }
}

function listAssignableRoles(PDO $db, AuthorizationContext $authorization): array
{
    $query = $db->prepare(
        "SELECT role_key,role_name_ar,description,default_data_scope,is_system
         FROM um_roles_def
        WHERE role_key NOT IN ('system_owner','superadmin','system_admin','admin')
         ORDER BY role_name_ar,role_key"
    );
    $query->execute();
    $roles = [];
    foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $role) {
        if (assignableRole($db, $authorization, (string) $role['role_key'])) {
            $roles[] = $role;
        }
    }
    return $roles;
}

function assignableRole(PDO $db, AuthorizationContext $authorization, string $roleKey): ?array
{
    $query = $db->prepare(
        "SELECT role_key,role_name_ar,description,default_data_scope,is_system,permissions
        FROM um_roles_def
        WHERE role_key=? AND role_key NOT IN ('system_owner','superadmin','system_admin','admin')
        LIMIT 1"
    );
    $query->execute([$roleKey]);
    $role = $query->fetch(PDO::FETCH_ASSOC);
    if (!$role) {
        return null;
    }

    $permissions = json_decode((string) ($role['permissions'] ?: '[]'), true);
    $permissions = is_array($permissions) ? array_values(array_filter($permissions, 'is_string')) : [];
    $grants = $db->prepare('SELECT permission_key FROM um_role_permissions WHERE role_key=? AND effect="grant"');
    $grants->execute([$roleKey]);
    $permissions = array_values(array_unique(array_merge($permissions, $grants->fetchAll(PDO::FETCH_COLUMN))));
    $denies = $db->prepare('SELECT permission_key FROM um_role_permissions WHERE role_key=? AND effect="deny"');
    $denies->execute([$roleKey]);
    $denied = array_flip($denies->fetchAll(PDO::FETCH_COLUMN));
    $permissions = array_values(array_filter($permissions, static fn (string $permission): bool => !isset($denied[$permission])));

    foreach ($permissions as $permission) {
        if ($permission === '*') {
            return null;
        }
        if (!$authorization->can($permission)) {
            return null;
        }
    }
    return $role;
}

function recordInvitationActivity(PDO $db, int $actorId, int $networkId, string $action, string $title, string $details): void
{
    $actorQuery = $db->prepare('SELECT fullname FROM um_admins WHERE id=? LIMIT 1');
    $actorQuery->execute([$actorId]);
    $actorName = mb_substr((string) ($actorQuery->fetchColumn() ?: ''), 0, 100);
    $log = $db->prepare(
        "INSERT INTO um_activity_logs
            (admin_id,admin_name,action_type,action_category,action_title,details,status,network_id)
         VALUES (?,?,?,'membership',?,?,'success',?)"
    );
    $log->execute([$actorId, $actorName, $action, $title, $details, $networkId]);
}
