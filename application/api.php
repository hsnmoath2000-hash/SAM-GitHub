<?php

require_once __DIR__ . '/config.php';
require __DIR__.'/api/v1/integration-cors.php';
if(($_SERVER['REQUEST_METHOD']??'')==='OPTIONS'){http_response_code(204);exit;}

require_once __DIR__ . '/includes/RadiusService.php';
require_once __DIR__ . '/includes/RoleDashboardService.php';
require_once __DIR__ . '/includes/PosDistributorService.php';
require_once __DIR__ . '/api/v1/lib/AuthorizationContext.php';
require_once __DIR__ . '/api/v1/lib/ApiJobs.php';
require_once __DIR__ . '/includes/NetworkChannelService.php';
require_once __DIR__ . '/includes/NetworkFederationService.php';



header('Content-Type: application/json; charset=utf-8');



$action = $_GET['action'] ?? '';

$service = new RadiusService();

require_once __DIR__ . '/instant_balance_api.php';

$temporarilyDisabledActions = [

    'distributor_login',

    'distributor_get_dashboard',

    'distributor_get_statement',

];

if (in_array($action, $temporarilyDisabledActions, true)) {
    jsonResponse(['success' => false, 'error' => 'Temporarily unavailable during security maintenance'], 503);
}

    if ($action === 'bootstrap_router') {
        require_once __DIR__ . '/includes/MikroTikFleetService.php';
        $key = (string)($_GET['key'] ?? ($_POST['key'] ?? ''));
        $ver = (string)($_GET['version'] ?? ($_POST['version'] ?? 'v7'));
        $fleetService = new MikroTikFleetService(getDB());
        $script = $fleetService->handleRouterBootstrap($key, $ver);
        header('Content-Type: text/plain; charset=utf-8');
        echo $script;
        exit;
    }

    if ($action === 'get_subscriber_announcements') {
        $code = trim((string)($_GET['code'] ?? $_POST['code'] ?? ''));
        if ($code === '') {
            jsonResponse(['success' => false, 'error' => 'VOUCHER_CODE_REQUIRED'], 400);
        }
        $db = getDB();
        $requestedSubscriberNetworkId = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_GET['network_id'] ?? ($_POST['network_id'] ?? 0)));
        if ($requestedSubscriberNetworkId > 0) {
            $networkStmt = $db->prepare(
                'SELECT network_id FROM um_vouchers_meta WHERE network_id=? AND username=?
                 UNION
                 SELECT network_id FROM radcheck WHERE network_id=? AND username=?
                 LIMIT 1'
            );
            $networkStmt->execute([$requestedSubscriberNetworkId,$code,$requestedSubscriberNetworkId,$code]);
            $subscriberNetworkId = (int)$networkStmt->fetchColumn();
        } else {
            $networkStmt = $db->prepare(
                'SELECT network_id FROM um_vouchers_meta WHERE username=?
                 UNION
                 SELECT network_id FROM radcheck WHERE username=?'
            );
            $networkStmt->execute([$code,$code]);
            $subscriberNetworkIds = array_values(array_unique(array_map('intval',$networkStmt->fetchAll(PDO::FETCH_COLUMN))));
            if (count($subscriberNetworkIds) > 1) {
                jsonResponse(['success'=>false,'error'=>'NETWORK_CONTEXT_REQUIRED','message'=>'اختر الشبكة أولاً'],409);
            }
            $subscriberNetworkId = (int)($subscriberNetworkIds[0] ?? 0);
        }
        if ($subscriberNetworkId <= 0) {
            jsonResponse(['success' => false, 'error' => 'VOUCHER_NOT_FOUND'], 404);
        }
        $stmt = $db->prepare(
            "SELECT id, title, message, category, created_at
             FROM um_notifications
             WHERE network_id=?
               AND target_admin_id IS NULL
               AND target_role IN ('all','subscriber')
             ORDER BY id DESC LIMIT 5"
        );
        $stmt->execute([$subscriberNetworkId]);
        jsonResponse(['success' => true, 'announcements' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

    }



    if ($action === 'subscriber_card_query') {

        $code = $_GET['code'] ?? $_POST['code'] ?? '';

        jsonResponse($service->getSubscriberCardInfo($code));

    }



    if ($action === 'preview_hotspot_page') {
        require_once __DIR__ . '/includes/HotspotTemplateService.php';
        $db = getDB();
        $hsService = new HotspotTemplateService($db);
        $netId = (int)($_GET['network_id'] ?? 1);
        $type = (string)($_GET['type'] ?? 'login');
        $bundle = $hsService->generateHotspotBundle($netId);
        $html = $bundle[$type === 'status' ? 'status.html' : 'login.html'] ?? $bundle['login.html'];
        
        // Strip or resolve raw RouterOS template directives for clean browser preview
        $html = preg_replace('/\$\(if error\).*?\$\(endif\)/s', '', $html);
        $html = preg_replace('/\$\(if [a-zA-Z0-9_-]+\)(.*?)\$\(endif\)/s', '$1', $html);
        $html = str_replace(
            ['$(link-login-only)', '$(link-login)', '$(link-orig)', '$(mac)', '$(ip)', '$(username)'],
            ['#', '#', '#', 'AA:BB:CC:DD:EE:FF', '192.168.88.100', '123456'],
            $html
        );
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }

    if ($action === 'distributor_login') {

        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        jsonResponse($service->distributorLogin($input['username'] ?? '', $input['password'] ?? ''));

    }

    if ($action === 'distributor_get_dashboard') {

        $distId = (int)($_SESSION['distributor_id'] ?? 0);

        if (!$distId) { jsonResponse(['success' => false, 'error' => 'Unauthorized: no distributor session']); }

        jsonResponse($service->getDistributorDashboard($distId));

    }

    if ($action === 'distributor_get_statement') {

        $distId = (int)($_SESSION['distributor_id'] ?? 0);

        if (!$distId) { jsonResponse(['success' => false, 'error' => 'Unauthorized: no distributor session']); }

        jsonResponse($service->getDistributorStatement($distId));

    }



    // ==========================================

    // SUBSCRIBER PORTAL & PWA PUBLIC ENDPOINTS (Voucher Authenticated)

    // ==========================================

    if ($action === 'subscriber_get_status') {

        $code = $_GET['code'] ?? $_POST['code'] ?? '';

        jsonResponse($service->subscriberGetCardStatus($code));

    }

    if ($action === 'subscriber_change_speed') {

        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $code = $input['code'] ?? $_GET['code'] ?? '';

        $speed = $input['speed'] ?? $input['speed_mode'] ?? $_GET['speed'] ?? '2M';

        jsonResponse($service->subscriberChangeSpeed($code, $speed));

    }

    if ($action === 'subscriber_set_max_devices') {

        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $code = $input['code'] ?? $_GET['code'] ?? '';

        $count = (int)($input['max_devices'] ?? $input['devices'] ?? $_GET['max_devices'] ?? 1);

        jsonResponse($service->subscriberSetMaxDevices($code, $count));

    }

    if ($action === 'subscriber_set_mac_lock') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $code = $input['code'] ?? $_GET['code'] ?? '';
        $enabled = !empty($input['enabled']);
        jsonResponse($service->subscriberSetMacLock($code, $enabled));
    }

    if ($action === 'subscriber_get_devices') {

        $code = $_GET['code'] ?? $_POST['code'] ?? '';

        jsonResponse($service->subscriberGetDevices($code));

    }

    if ($action === 'subscriber_disconnect_device') {

        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $code = $input['code'] ?? $_GET['code'] ?? '';

        $mac = $input['callingstationid'] ?? $input['mac'] ?? '';

        jsonResponse($service->subscriberDisconnectDevice($code, $mac));

    }

    

    if ($action === 'handle_chatbot_message') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $msg = $input['message'] ?? ($input['body'] ?? ($input['query'] ?? ($input['text']['body'] ?? ($_GET['message'] ?? ''))));
        $phone = $input['phone'] ?? ($input['from'] ?? ($_GET['phone'] ?? ''));
        $platform = $input['platform'] ?? ($_GET['platform'] ?? 'whatsapp');
        $networkId = (int)($input['network_id'] ?? ($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_GET['network_id'] ?? 0)));
        $hasAdminSession = (int)($_SESSION['admin_id'] ?? 0) > 0;
        $isLocalWebhook = in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
        if (!$hasAdminSession && !$isLocalWebhook) {
            jsonResponse(['success' => false, 'error' => 'CHATBOT_WEBHOOK_FORBIDDEN'], 403);
        }
        $res = $service->handleChatbotMessage($msg, $phone, $platform, $networkId);
        if (isset($res['response']) && !isset($res['reply'])) {
            $res['reply'] = $res['response'];
        }
        jsonResponse(array_merge(['success' => true], $res));
    }



    if ($action === 'get_predefined_speed_tiers') {

        jsonResponse(['success' => true, 'tiers' => $service->getSpeedTiers(true)]);

    }



    if ($action === 'login') {
        require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $user = trim((string)($input['username'] ?? $input['user'] ?? $input['phone'] ?? ''));
        $pass = trim((string)($input['password'] ?? ''));
        $deviceName = trim((string)($input['device_name'] ?? 'SAM Client'));
        $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        // Trust the forwarded address only from the local 8098 proxy.
        if (in_array($clientIp, ['127.0.0.1', '::1'], true) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $clientIp = trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        }
        $userAgent = (string)($_SERVER['HTTP_USER_AGENT'] ?? 'SAM App');

        $db = getDB();
        $auth = new ApiAuth($db);

        // 1. Rate Limiting Check (5 attempts max, 3x exponential lockout)
        try {
            $auth->checkRateLimit($user, $clientIp, 5);
        } catch (DomainException $de) {
            $errMsg = $de->getMessage();
            if (strpos($errMsg, 'RATE_LIMITED:') === 0) {
                $errMsg = substr($errMsg, strlen('RATE_LIMITED:'));
            } else {
                $errMsg = '🔒 تم قفل الحساب مؤقتاً لتجاوز الحد المسموح من محاولات الدخول الخاطئة (5 محاولات). يرجى الانتظار بضع دقائق قبل المحاولة مجدداً.';
            }
            jsonResponse([
                'success' => false,
                'error' => $errMsg,
                'code' => 'RATE_LIMITED'
            ], 429);
        }

        require_once __DIR__ . '/includes/WhatsAppService.php';
        $normalizedUser = WhatsAppService::normalizePhone($user);
        $suffix9 = strlen($normalizedUser) >= 9 ? substr($normalizedUser, -9) : $user;

        $stmt = $db->prepare("
            SELECT * FROM um_admins 
            WHERE (username = ? OR phone = ? OR phone = ? OR phone LIKE ?) AND is_active = 1 
            ORDER BY id ASC LIMIT 1
        ");
        $stmt->execute([$user, $user, $normalizedUser, "%" . $suffix9]);
        $adminUser = $stmt->fetch();

        if ($adminUser && password_verify($pass, (string)($adminUser['password_hash'] ?? ''))) {
            // Check if login request came from sovereign owner portal
            $isOwner = ((int)$adminUser['id'] === 1 || (string)$adminUser['role'] === 'system_owner');
            if (!empty($input['portal_type']) && $input['portal_type'] === 'owner' && !$isOwner) {
                jsonResponse([
                    'success' => false,
                    'error' => '⛔ وصول مقيد: هذا المنفذ والبوابة مخصصان حصرياً لمالك النظام والتحكم السيادي. يرجى تسجيل الدخول عبر البوابة القياسية للمنظومة.',
                    'code' => 'SOVEREIGN_OWNER_REQUIRED'
                ], 403);
            }

            // Clear failed attempts upon successful authentication
            $auth->clearLoginAttempts($user, $clientIp);
            $auth->clearLoginAttempts($adminUser['username'], $clientIp);
            if (!empty($adminUser['phone'])) {
                $auth->clearLoginAttempts($adminUser['phone'], $clientIp);
            }

            // Establish Legacy Session
            if (session_status() === PHP_SESSION_NONE) {
                @session_start();
            }
            session_regenerate_id(true);
            $_SESSION['_created_at'] = time();
            $_SESSION['_last_activity'] = time();
            $_SESSION['logged_in'] = true;
            $_SESSION['admin_id'] = $adminUser['id'];
            $_SESSION['user'] = $adminUser['username'];
            $_SESSION['fullname'] = $adminUser['fullname'];
            $_SESSION['role'] = $adminUser['role'];
            $_SESSION['admin_role'] = $adminUser['role'];
            $_SESSION['data_scope'] = $adminUser['data_scope'] ?? (in_array((string)$adminUser['role'], ['system_owner', 'superadmin'], true) ? 'all' : 'own');
            $_SESSION['delegated_admin_ids'] = json_decode($adminUser['delegated_admin_ids'] ?: '[]', true) ?: [];

            $networkActor = AuthorizationContext::loadActor($db, (int)$adminUser['id']);
            $adminUser['role'] = $networkActor['role'];
            $_SESSION['active_network_id'] = (int)$networkActor['active_network_id'];
            $_SESSION['role'] = $networkActor['role'];
            $_SESSION['admin_role'] = $networkActor['role'];
            $_SESSION['data_scope'] = $networkActor['data_scope'];
            $effectivePerms = $networkActor['effective_permissions'];

            $_SESSION['permissions'] = $effectivePerms;
            $_SESSION['discount_rate'] = (float)($adminUser['discount_rate'] ?? 0);
            $_SESSION['credit_limit'] = (float)($adminUser['credit_limit'] ?? 0);
            $_SESSION['_account_verified_at'] = time();

            // Issue Bearer Access & Refresh Tokens for Mobile App
            $adminUser['effective_permissions'] = $effectivePerms;
            $tokenPair = $auth->issuePair($adminUser, $deviceName, $clientIp, $userAgent);

            $service->logActivity('admin_login', 'auth', 'تسجيل دخول ناجح: ' . $adminUser['fullname'], 'تم تسجيل الدخول بنجاح إلى لوحة التحكم والتطبيق', 'success', $adminUser['id'], null, (int)$networkActor['active_network_id']);

            jsonResponse([
                'success' => true,
                'token_type' => 'Bearer',
                'access_token' => $tokenPair['access_token'],
                'expires_in' => $tokenPair['expires_in'],
                'refresh_token' => $tokenPair['refresh_token'],
                'refresh_expires_in' => $tokenPair['refresh_expires_in'],
                'user' => $adminUser['username'],
                'fullname' => $adminUser['fullname'],
                'role' => $adminUser['role'],
                'admin_id' => $adminUser['id'],
                'is_system_owner' => ((string)$adminUser['role'] === 'system_owner'),
                'must_change_password' => (int)($adminUser['must_change_password'] ?? 0),
                'discount_rate' => $_SESSION['discount_rate'],
                'credit_limit' => $_SESSION['credit_limit'],
                'data_scope' => $_SESSION['data_scope'],
                'delegated_admin_ids' => $_SESSION['delegated_admin_ids'],
                'permissions' => $effectivePerms
                ,'networks' => $networkActor['networks']
                ,'active_network' => $networkActor['active_network']
                ,'active_network_id' => (int)$networkActor['active_network_id']
            ]);
        } else {
            // Record failed attempt for rate limiting
            $auth->recordFailedLogin($user, $clientIp, $userAgent);
            $failedNetId = 1;
            try {
                $chkAdminStmt = $db->prepare("SELECT id FROM um_admins WHERE username = ? LIMIT 1");
                $chkAdminStmt->execute([$user]);
                $chkAdminId = (int)$chkAdminStmt->fetchColumn();
                if ($chkAdminId > 0) {
                    $stNet = $db->prepare("SELECT network_id FROM um_admin_network_access WHERE admin_id = ? AND is_active = 1 ORDER BY is_default DESC, network_id ASC LIMIT 1");
                    $stNet->execute([$chkAdminId]);
                    $fNet = (int)$stNet->fetchColumn();
                    if ($fNet > 0) $failedNetId = $fNet;
                }
            } catch (Throwable $e) {}
            $service->logActivity('admin_login_failed', 'auth', 'محاولة تسجيل دخول فاشلة: ' . $user, 'تم إدخال كلمة مرور أو اسم مستخدم غير صحيح', 'failed', null, null, $failedNetId);
            jsonResponse(['success' => false, 'error' => 'اسم المستخدم أو كلمة المرور غير صحيحة', 'code' => 'INVALID_CREDENTIALS'], 401);
        }
    }

    if ($action === 'refresh_token') {
        require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $refreshToken = trim((string)($input['refresh_token'] ?? ''));
        if (empty($refreshToken)) {
            jsonResponse(['success' => false, 'error' => 'Refresh token is required', 'code' => 'REFRESH_TOKEN_REQUIRED'], 400);
        }
        $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $userAgent = (string)($_SERVER['HTTP_USER_AGENT'] ?? 'SAM App');

        $auth = new ApiAuth(getDB());
        try {
            $pair = $auth->refresh($refreshToken, $clientIp, $userAgent);
            jsonResponse(array_merge(['success' => true], $pair));
        } catch (DomainException $de) {
            jsonResponse(['success' => false, 'error' => 'Invalid or expired refresh token', 'code' => $de->getMessage()], 401);
        } catch (Throwable $e) {
            jsonResponse(['success' => false, 'error' => 'Failed to refresh token: ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'logout') {
        require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
        $bearerToken = ApiAuth::extractBearerToken();
        if ($bearerToken !== null) {
            try {
                $auth = new ApiAuth(getDB());
                $actor = $auth->authenticateToken($bearerToken);
                $auth->logout($actor);
            } catch (Throwable $e) {}
        }
        destroySessionState();
        jsonResponse(['success' => true]);
    }

    // ==========================================
    // FORGOT PASSWORD VIA WHATSAPP OTP
    // ==========================================
    if ($action === 'forgot_password_request_otp') {
        require_once __DIR__ . '/includes/WhatsAppService.php';
        $rawInput = file_get_contents('php://input');
        $jsonInput = json_decode($rawInput, true);
        $input = is_array($jsonInput) ? array_merge($_GET, $_POST, $jsonInput) : array_merge($_GET, $_POST);
        $phoneInput = trim((string)($input['phone'] ?? $input['username'] ?? ''));
        if (empty($phoneInput)) {
            jsonResponse(['success' => false, 'error' => 'يرجى إدخال رقم الهاتف أو اسم المستخدم'], 400);
        }

        $db = getDB();

        // Ensure um_password_resets table exists
        $db->exec("CREATE TABLE IF NOT EXISTS `um_password_resets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `admin_id` INT NOT NULL,
            `phone` VARCHAR(32) NOT NULL,
            `otp_code` VARCHAR(16) NOT NULL,
            `attempts` INT DEFAULT 0,
            `is_used` TINYINT(1) DEFAULT 0,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`phone`),
            INDEX (`admin_id`),
            INDEX (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $normalized = WhatsAppService::normalizePhone($phoneInput);
        $suffix9 = strlen($normalized) >= 9 ? substr($normalized, -9) : $normalized;

        // Find matching admin
        $stmt = $db->prepare("
            SELECT id, username, fullname, phone, is_active 
            FROM um_admins 
            WHERE (username = ? OR phone = ? OR phone LIKE ? OR phone LIKE ?) AND is_active = 1 
            ORDER BY id ASC LIMIT 1
        ");
        $stmt->execute([$phoneInput, $normalized, "%$suffix9", "%$phoneInput%"]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$admin) {
            jsonResponse(['success' => false, 'error' => 'لم يتم العثور على أي حساب مسجل بهذا الرقم أو اسم المستخدم'], 404);
        }

        $adminPhone = trim((string)($admin['phone'] ?? ''));
        if (empty($adminPhone)) {
            $adminPhone = $normalized;
        }
        $targetPhone = WhatsAppService::normalizePhone($adminPhone);
        if (empty($targetPhone) || strlen($targetPhone) < 8) {
            jsonResponse(['success' => false, 'error' => 'الحساب لا يحتوي على رقم هاتف صالح لإرسال رمز التأكيد. يرجى التواصل مع مسؤول النظام.'], 400);
        }

        // Rate limit: max 4 requests in 10 minutes
        $limitStmt = $db->prepare("
            SELECT COUNT(*) FROM um_password_resets 
            WHERE admin_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        ");
        $limitStmt->execute([(int)$admin['id']]);
        if ((int)$limitStmt->fetchColumn() >= 4) {
            jsonResponse(['success' => false, 'error' => 'تم تجاوز الحد المسموح لطلب الرموز. يرجى الانتظار بضع دقائق قبل المحاولة مجدداً.'], 429);
        }

        // Generate 6-digit OTP
        $otp = sprintf('%06d', random_int(100000, 999999));

        // Invalidate previous unused codes for this admin
        $db->prepare("UPDATE um_password_resets SET is_used = 1 WHERE admin_id = ? AND is_used = 0")->execute([(int)$admin['id']]);

        // Insert new reset record
        $ins = $db->prepare("
            INSERT INTO um_password_resets (admin_id, phone, otp_code, attempts, is_used, expires_at, created_at)
            VALUES (?, ?, ?, 0, 0, DATE_ADD(NOW(), INTERVAL 10 MINUTE), NOW())
        ");
        $ins->execute([(int)$admin['id'], $targetPhone, $otp]);

        // Find primary active network for admin
        $netStmt = $db->prepare("SELECT network_id FROM um_admin_network_access WHERE admin_id = ? AND is_active = 1 ORDER BY is_default DESC LIMIT 1");
        $netStmt->execute([(int)$admin['id']]);
        $networkId = (int)$netStmt->fetchColumn();
        if ($networkId <= 0) {
            $networkId = 1;
        }

        // Mask phone for privacy in UI: e.g. 96777***343
        $maskedPhone = (strlen($targetPhone) > 7)
            ? substr($targetPhone, 0, 5) . '****' . substr($targetPhone, -3)
            : $targetPhone;

        $whatsappMsg = "🔐 *رمز استعادة كلمة المرور - نظام SAM*\n\n"
                     . "مرحباً عزيزي *" . ($admin['fullname'] ?: $admin['username']) . "*،\n"
                     . "رمز التحقق الخاص بك لإعادة تعيين كلمة المرور هو:\n\n"
                     . "🔢 *" . $otp . "*\n\n"
                     . "⏳ هذا الرمز صالح لمدة *10 دقائق* فقط.\n"
                     . "⚠️ تنبيه: لا تشارك هذا الرمز مع أي شخص. إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.";

        $waService = new WhatsAppService($db, null, $networkId);
        $waResult = $waService->sendMessage($targetPhone, $whatsappMsg, 'pwd_reset_' . $admin['id'], (int)$admin['id'], 'password_reset_otp');

        $isSent = !empty($waResult['success']);

        jsonResponse([
            'success' => true,
            'message' => 'تم إرسال رمز التأكيد إلى واتساب على الرقم (' . $maskedPhone . ') بنجاح! تفقد رسائل الواتساب الآن.',
            'phone' => $targetPhone,
            'masked_phone' => $maskedPhone,
            'username' => $admin['username'],
            'whatsapp_sent' => $isSent,
            'wa_error' => $isSent ? null : ($waResult['error'] ?? null)
        ]);
    }

    if ($action === 'forgot_password_verify_and_reset') {
        $rawInput = file_get_contents('php://input');
        $jsonInput = json_decode($rawInput, true);
        $input = is_array($jsonInput) ? array_merge($_GET, $_POST, $jsonInput) : array_merge($_GET, $_POST);

        $phoneInput = trim((string)($input['phone'] ?? $input['username'] ?? ''));
        $otpCode = trim((string)($input['otp_code'] ?? $input['otp'] ?? ''));
        $newPass = (string)($input['new_password'] ?? '');
        $confirmPass = (string)($input['confirm_password'] ?? '');

        if (empty($phoneInput) || empty($otpCode) || empty($newPass)) {
            jsonResponse(['success' => false, 'error' => 'يرجى ملء جميع الحقول المطلوبة'], 400);
        }
        if (strlen($newPass) < 6) {
            jsonResponse(['success' => false, 'error' => 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام'], 400);
        }
        if ($confirmPass !== '' && $newPass !== $confirmPass) {
            jsonResponse(['success' => false, 'error' => 'كلمتا المرور غير متطابقتين'], 400);
        }

        require_once __DIR__ . '/includes/WhatsAppService.php';
        $db = getDB();
        $normalized = WhatsAppService::normalizePhone($phoneInput);
        $suffix9 = strlen($normalized) >= 9 ? substr($normalized, -9) : $normalized;

        // Find active OTP record
        $stmt = $db->prepare("
            SELECT r.*, a.username, a.fullname, a.phone as admin_phone, a.id as user_admin_id
            FROM um_password_resets r
            JOIN um_admins a ON a.id = r.admin_id
            WHERE (r.phone = ? OR a.username = ? OR r.phone LIKE ? OR a.phone = ? OR a.phone LIKE ?) AND r.is_used = 0 AND r.expires_at > NOW()
            ORDER BY r.id DESC LIMIT 1
        ");
        $stmt->execute([$normalized, $phoneInput, "%" . $suffix9, $normalized, "%" . $suffix9]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            jsonResponse(['success' => false, 'error' => 'رمز التحقق منتهي الصلاحية أو غير صالح. يرجى طلب رمز جديد.'], 400);
        }

        if ((int)$record['attempts'] >= 5) {
            $db->prepare("UPDATE um_password_resets SET is_used = 1 WHERE id = ?")->execute([(int)$record['id']]);
            jsonResponse(['success' => false, 'error' => 'تم استنفاد الحد الأقصى للمحاولات الخاطئة. يرجى طلب رمز جديد.'], 429);
        }

        if ($record['otp_code'] !== $otpCode) {
            $db->prepare("UPDATE um_password_resets SET attempts = attempts + 1 WHERE id = ?")->execute([(int)$record['id']]);
            $remaining = 4 - (int)$record['attempts'];
            jsonResponse(['success' => false, 'error' => "رمز التحقق غير صحيح. متبقي لديك {$remaining} محاولات."], 400);
        }

        // Mark OTP as used
        $db->prepare("UPDATE um_password_resets SET is_used = 1 WHERE id = ?")->execute([(int)$record['id']]);

        // Update password hash
        $newHash = password_hash($newPass, PASSWORD_DEFAULT);
        $upd = $db->prepare("UPDATE um_admins SET password_hash = ?, must_change_password = 0, updated_at = NOW() WHERE id = ?");
        $upd->execute([$newHash, (int)$record['admin_id']]);

        // Reset/clear failed login attempts and rate limit lockouts for this admin upon verification
        try {
            require_once __DIR__ . '/api/v1/lib/ApiAuth.php';
            $auth = new ApiAuth($db);
            $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
            if (in_array($clientIp, ['127.0.0.1', '::1'], true) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                $clientIp = trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
            }
            $auth->clearLoginAttempts($record['username'], $clientIp);
            if (!empty($record['phone'])) {
                $auth->clearLoginAttempts($record['phone'], $clientIp);
            }
        } catch (Throwable $clearErr) {}

        // Log activity
        $service->logActivity('password_reset_whatsapp', 'auth', 'استعادة كلمة المرور عبر واتساب', 'تم تغيير كلمة المرور بنجاح للمستخدم: ' . $record['fullname'], 'success', (int)$record['admin_id']);

        // Send confirmation WhatsApp message
        try {
            $netStmt = $db->prepare("SELECT network_id FROM um_admin_network_access WHERE admin_id = ? AND is_active = 1 ORDER BY is_default DESC LIMIT 1");
            $netStmt->execute([(int)$record['admin_id']]);
            $networkId = (int)$netStmt->fetchColumn() ?: 1;

            $waService = new WhatsAppService($db, null, $networkId);
            $confirmMsg = "✅ *تم تغيير كلمة المرور بنجاح - نظام SAM*\n\n"
                        . "مرحباً *" . ($record['fullname'] ?: $record['username']) . "*،\n"
                        . "تم تحديث كلمة المرور الخاصة بحسابك (`" . $record['username'] . "`) بنجاح.\n"
                        . "يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.\n"
                        . "إذا لم تكن أنت من قام بهذا الإجراء، يرجى التواصل مع الإدارة فوراً.";
            $waService->sendMessage($record['phone'], $confirmMsg, 'pwd_changed_' . $record['admin_id'], (int)$record['admin_id'], 'password_reset_confirmed');
        } catch (Throwable $e) {}

        jsonResponse([
            'success' => true,
            'message' => '🎉 تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
            'username' => $record['username']
        ]);
    }

    // ==========================================
    // SELF-SERVICE USER / POS / NETWORK REGISTRATION
    // ==========================================
    if ($action === 'registration_get_init_data') {
        $db = getDB();
        // 1. Available active networks for customer/POS registration
        $netsStmt = $db->query("SELECT id, code, name, location, theme_color, logo_url FROM um_networks WHERE status = 'active' ORDER BY name ASC");
        $networks = $netsStmt ? ($netsStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        // 2. Available visible subscription plans for new network owner registration
        $plansStmt = $db->query("SELECT id, plan_code, name, description, monthly_price, annual_price, currency_code, max_routers, max_active_users, daily_card_limit, allow_whatsapp, allow_api FROM um_network_plans WHERE is_active = 1 AND is_visible = 1 ORDER BY monthly_price ASC, id ASC");
        $plans = $plansStmt ? ($plansStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        jsonResponse([
            'success' => true,
            'networks' => $networks,
            'plans' => $plans
        ]);
    }

    if ($action === 'registration_request_otp') {
        require_once __DIR__ . '/includes/WhatsAppService.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $accountType = trim((string)($input['account_type'] ?? 'customer')); // 'customer' | 'pos_agent' | 'network_owner'
        if (!in_array($accountType, ['customer', 'pos_agent', 'network_owner'], true)) {
            jsonResponse(['success' => false, 'error' => 'نوع الحساب غير صالح'], 400);
        }

        $fullname = trim((string)($input['fullname'] ?? ''));
        $phoneInput = trim((string)($input['phone'] ?? ''));
        $username = trim((string)($input['username'] ?? ''));
        $password = (string)($input['password'] ?? '');

        if (empty($fullname) || empty($phoneInput) || empty($username) || empty($password)) {
            jsonResponse(['success' => false, 'error' => 'يرجى استكمال جميع الحقول الأساسية المطلوبة'], 400);
        }
        if (strlen($password) < 6) {
            jsonResponse(['success' => false, 'error' => 'كلمة المرور يجب أن لا تقل عن 6 خانات'], 400);
        }

        $normalizedPhone = WhatsAppService::normalizePhone($phoneInput);
        if (empty($normalizedPhone) || strlen($normalizedPhone) < 8) {
            jsonResponse(['success' => false, 'error' => 'رقم الهاتف / الواتساب غير صالح'], 400);
        }
        if (str_starts_with($normalizedPhone, '967')) {
            $yemenLocal = substr($normalizedPhone, 3);
            if (!preg_match('/^(77|78|70|71|73)\d{7}$/', $yemenLocal)) {
                jsonResponse(['success' => false, 'error' => 'رقم الهاتف اليمني غير صحيح. يجب أن يتكون من 9 أرقام ويبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)'], 400);
            }
        }

        $db = getDB();

        // Ensure um_registration_otps table exists
        $db->exec("CREATE TABLE IF NOT EXISTS `um_registration_otps` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `phone` VARCHAR(32) NOT NULL,
            `otp_code` VARCHAR(16) NOT NULL,
            `account_type` VARCHAR(32) NOT NULL,
            `payload_json` LONGTEXT NOT NULL,
            `attempts` INT DEFAULT 0,
            `is_verified` TINYINT(1) DEFAULT 0,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`phone`),
            INDEX (`otp_code`),
            INDEX (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Specific Account Validations
        if ($accountType === 'customer' || $accountType === 'pos_agent') {
            $networkId = (int)($input['network_id'] ?? 0);
            if ($networkId <= 0) {
                // If only 1 network exists in DB, default to it
                $netCount = $db->query("SELECT id FROM um_networks WHERE status='active' LIMIT 2")->fetchAll(PDO::FETCH_COLUMN);
                if (count($netCount) === 1) {
                    $networkId = (int)$netCount[0];
                    $input['network_id'] = $networkId;
                } else {
                    jsonResponse(['success' => false, 'error' => 'يرجى اختيار الشبكة التابع لها'], 400);
                }
            }

            // Check username uniqueness in um_admins and radcheck
            $chkAdm = $db->prepare("SELECT COUNT(*) FROM um_admins WHERE username = ?");
            $chkAdm->execute([$username]);
            if ((int)$chkAdm->fetchColumn() > 0) {
                jsonResponse(['success' => false, 'error' => 'اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر'], 400);
            }

            if ($accountType === 'customer') {
                $chkRad = $db->prepare("SELECT COUNT(*) FROM radcheck WHERE username = ? AND network_id = ?");
                $chkRad->execute([$username, $networkId]);
                if ((int)$chkRad->fetchColumn() > 0) {
                    jsonResponse(['success' => false, 'error' => 'اسم المستخدم مسجل بالفعل في هذه الشبكة'], 400);
                }
            }
        } elseif ($accountType === 'network_owner') {
            $networkName = trim((string)($input['network_name'] ?? ''));
            $networkCode = trim((string)($input['network_code'] ?? ''));
            $planId = (int)($input['plan_id'] ?? 0);

            if (empty($networkName)) {
                jsonResponse(['success' => false, 'error' => 'اسم الشبكة مطلوب'], 400);
            }
            if ($planId <= 0) {
                jsonResponse(['success' => false, 'error' => 'يرجى اختيار باقة الاشتراك المطلوبة للشبكة'], 400);
            }

            // Check username in um_admins
            $chkAdm = $db->prepare("SELECT COUNT(*) FROM um_admins WHERE username = ? OR phone = ?");
            $chkAdm->execute([$username, $normalizedPhone]);
            if ((int)$chkAdm->fetchColumn() > 0) {
                jsonResponse(['success' => false, 'error' => 'اسم المستخدم أو رقم الهاتف مسجل بالفعل كمدير في النظام'], 400);
            }

            // Check network code / name if provided
            if (!empty($networkCode)) {
                $chkNet = $db->prepare("SELECT COUNT(*) FROM um_networks WHERE code = ?");
                $chkNet->execute([$networkCode]);
                if ((int)$chkNet->fetchColumn() > 0) {
                    jsonResponse(['success' => false, 'error' => 'رمز/كود الشبكة مستخدم مسبقاً، يرجى اختيار رمز آخر'], 400);
                }
            }
        }

        // Rate limit: max 4 requests per phone in 10 minutes
        $limitStmt = $db->prepare("SELECT COUNT(*) FROM um_registration_otps WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
        $limitStmt->execute([$normalizedPhone]);
        if ((int)$limitStmt->fetchColumn() >= 4) {
            jsonResponse(['success' => false, 'error' => 'تم تجاوز الحد المسموح لطلب الرموز، يرجى الانتظار بضع دقائق'], 429);
        }

        // Generate 6-digit OTP
        $otp = sprintf('%06d', random_int(100000, 999999));

        // Invalidate older unused OTPs for this phone
        $db->prepare("UPDATE um_registration_otps SET is_verified = 2 WHERE phone = ? AND is_verified = 0")->execute([$normalizedPhone]);

        // Insert pending OTP record
        $ins = $db->prepare("INSERT INTO um_registration_otps (phone, otp_code, account_type, payload_json, attempts, is_verified, expires_at, created_at) VALUES (?, ?, ?, ?, 0, 0, DATE_ADD(NOW(), INTERVAL 10 MINUTE), NOW())");
        $ins->execute([$normalizedPhone, $otp, $accountType, json_encode($input, JSON_UNESCAPED_UNICODE)]);
        $requestId = (int)$db->lastInsertId();

        // Mask phone for UI
        $maskedPhone = (strlen($normalizedPhone) > 7)
            ? substr($normalizedPhone, 0, 5) . '****' . substr($normalizedPhone, -3)
            : $normalizedPhone;

        $typeLabels = [
            'customer' => 'حساب مشترك / عميل',
            'pos_agent' => 'حساب وكيل / نقطة بيع',
            'network_owner' => 'حساب مالك شبكة جديد'
        ];
        $typeLabel = $typeLabels[$accountType] ?? 'حساب جديد';

        $whatsappMsg = "🔐 *رمز التحقق لتسجيل حساب جديد - نظام SAM*\n\n"
                     . "مرحباً بك عزيزي *" . $fullname . "*،\n"
                     . "طلب إنشاء: *" . $typeLabel . "*\n\n"
                     . "رمز التأكيد الخاص بك لتفعيل الحساب هو:\n"
                     . "🔢 *" . $otp . "*\n\n"
                     . "⏳ هذا الرمز صالح لمدة *10 دقائق* فقط.\n"
                     . "⚠️ تنبيه: لا تشارك هذا الرمز مع أي شخص.";

        // Determine sending gateway:
        // For network_owner -> send via system owner gateway (network_id = 0)
        // For customer/pos_agent -> send via network gateway or fallback
        $sendNetworkId = ($accountType === 'network_owner') ? 0 : (int)($input['network_id'] ?? 0);
        
        $waService = new WhatsAppService($db, null, $sendNetworkId);
        $waResult = $waService->sendMessage($normalizedPhone, $whatsappMsg, 'reg_otp_' . $requestId, 1, 'registration_otp');

        $isSent = !empty($waResult['success']);

        if (!$isSent) {
            try {
                $db->prepare("INSERT INTO um_notifications (network_id, title, message, category, target_role, metadata, created_at) VALUES (0, '🔐 رمز تأكيد تسجيل جديد', ?, 'system', 'system_owner', '', NOW())")
                   ->execute(["رمز التحقق (OTP) للرقم {$normalizedPhone} هو: {$otp} (ملاحظة: تعذر الإرسال عبر الواتساب لعدم اتصال الجلسة)."]);
            } catch (Throwable $e) {}
        }

        $resMessage = $isSent
            ? 'تم إرسال رمز التحقق إلى واتساب على الرقم (' . $maskedPhone . ') بنجاح!'
            : 'تم إصدار رمز التحقق للرقم (' . $maskedPhone . '). (ملاحظة: جلسة واتساب المالك بانتظار مسح رمز QR للتوصيل).';

        jsonResponse([
            'success' => true,
            'message' => $resMessage,
            'request_id' => $requestId,
            'phone' => $normalizedPhone,
            'masked_phone' => $maskedPhone,
            'account_type' => $accountType,
            'whatsapp_sent' => $isSent,
            'wa_error' => $isSent ? null : ($waResult['error'] ?? null)
        ]);
    }

    if ($action === 'registration_verify_and_create') {
        require_once __DIR__ . '/includes/WhatsAppService.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $requestId = (int)($input['request_id'] ?? 0);
        $phoneInput = trim((string)($input['phone'] ?? ''));
        $otpCode = trim((string)($input['otp_code'] ?? $input['otp'] ?? ''));

        if (empty($otpCode) || ($requestId <= 0 && empty($phoneInput))) {
            jsonResponse(['success' => false, 'error' => 'يرجى إدخال رمز التحقق'], 400);
        }

        $db = getDB();
        $normalizedPhone = WhatsAppService::normalizePhone($phoneInput);

        if ($requestId > 0) {
            $stmt = $db->prepare("SELECT * FROM um_registration_otps WHERE id = ? AND is_verified = 0 AND expires_at > NOW() LIMIT 1");
            $stmt->execute([$requestId]);
        } else {
            $stmt = $db->prepare("SELECT * FROM um_registration_otps WHERE phone = ? AND is_verified = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1");
            $stmt->execute([$normalizedPhone]);
        }
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            jsonResponse(['success' => false, 'error' => 'رمز التحقق منتهي الصلاحية أو غير موجود. يرجى طلب رمز جديد.'], 400);
        }

        if ((int)$record['attempts'] >= 5) {
            $db->prepare("UPDATE um_registration_otps SET is_verified = 2 WHERE id = ?")->execute([(int)$record['id']]);
            jsonResponse(['success' => false, 'error' => 'تم استنفاد الحد الأقصى للمحاولات الخاطئة. يرجى طلب رمز جديد.'], 429);
        }

        if (trim($record['otp_code']) !== $otpCode) {
            $db->prepare("UPDATE um_registration_otps SET attempts = attempts + 1 WHERE id = ?")->execute([(int)$record['id']]);
            $rem = 4 - (int)$record['attempts'];
            jsonResponse(['success' => false, 'error' => "رمز التحقق غير صحيح. متبقي لديك {$rem} محاولات."], 400);
        }

        $payload = json_decode($record['payload_json'], true) ?: [];
        $accountType = $record['account_type'];
        $fullname = trim((string)($payload['fullname'] ?? ''));
        $username = trim((string)($payload['username'] ?? ''));
        $rawPass = (string)($payload['password'] ?? '');
        $phone = $record['phone'];

        $db->beginTransaction();
        try {
            // Mark OTP as verified within transaction
            $db->prepare("UPDATE um_registration_otps SET is_verified = 1 WHERE id = ?")->execute([(int)$record['id']]);

            if ($accountType === 'customer') {
                $networkId = (int)($payload['network_id'] ?? 1);
                
                // 1. Insert into radcheck
                $rc = $db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, 'Cleartext-Password', ':=', ?)");
                $rc->execute([$networkId, $username, $rawPass]);

                // 2. Insert into um_vouchers_meta
                $vm = $db->prepare("INSERT INTO um_vouchers_meta (network_id, username, profile_name, price, comment, status, owner_admin_id, created_at) VALUES (?, ?, 'مباشر - تسجيل ذاتي', 0, ?, 'active', 1, NOW())");
                $vm->execute([$networkId, $username, 'تسجيل ذاتي للعميل: ' . $fullname . ' (' . $phone . ')']);

                $db->commit();

                // Send welcome message
                try {
                    $welcomeMsg = "🎉 *أهلاً بك في شبكتنا - تم تفعيل حسابك بنجاح!*\n\n"
                                . "👤 *اسم المستخدم:* `{$username}`\n"
                                . "🔑 *كلمة المرور:* `{$rawPass}`\n"
                                . "📱 يمكنك الآن تسجيل الدخول مباشرة والاستمتاع بالخدمة.";
                    $waService = new WhatsAppService($db, null, $networkId);
                    $waService->sendMessage($phone, $welcomeMsg, 'welcome_cust_' . $username);
                } catch (Throwable $e) {}

                jsonResponse([
                    'success' => true,
                    'account_type' => 'customer',
                    'username' => $username,
                    'message' => 'تم تفعيل وتأكيد حساب المشترك بنجاح! يمكنك الآن تسجيل الدخول.'
                ]);

            } elseif ($accountType === 'pos_agent') {
                $networkId = (int)($payload['network_id'] ?? 1);
                $shopName = trim((string)($payload['shop_name'] ?? ''));
                $agentFullname = $fullname . ($shopName ? " ({$shopName})" : '');
                $passHash = password_hash($rawPass, PASSWORD_DEFAULT);

                // Insert into um_admins
                $insAdm = $db->prepare("INSERT INTO um_admins (fullname, username, phone, role, data_scope, is_active, password_hash, created_at) VALUES (?, ?, ?, 'pos_agent', 'network', 1, ?, NOW())");
                $insAdm->execute([$agentFullname, $username, $phone, $passHash]);
                $newAdminId = (int)$db->lastInsertId();

                // Link to um_admin_network_access
                $insAcc = $db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (?, ?, 'agent', 1, 1, 1)");
                $insAcc->execute([$newAdminId, $networkId]);

                // Link role
                $insRole = $db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, data_scope, is_active, assigned_by_admin_id) VALUES (?, ?, 'pos_agent', 'network', 1, 1)");
                $insRole->execute([$newAdminId, $networkId]);

                // Balance
                $insBal = $db->prepare("INSERT INTO um_admin_network_balances (admin_id, network_id, balance, credit_limit, currency_code) VALUES (?, ?, 0, 0, 'YER_SANAA')");
                $insBal->execute([$newAdminId, $networkId]);

                // In-app notification for network manager
                $insNotif = $db->prepare("INSERT INTO um_notifications (network_id, title, message, category, target_role, created_at) VALUES (?, '🏪 نقطة بيع جديدة مسجلة', ?, 'system', 'admin', NOW())");
                $insNotif->execute([$networkId, "تم تسجيل نقطة بيع جديدة بنجاح: {$agentFullname} (مستخدم: {$username}, هاتف: {$phone})"]);

                $db->commit();

                // Send welcome message
                try {
                    $welcomeMsg = "🏪 *تم تفعيل حساب نقطة البيع بنجاح - نظام SAM*\n\n"
                                . "مرحباً بك *" . $fullname . "*،\n"
                                . "👤 *اسم المستخدم:* `{$username}`\n"
                                . "🔑 *كلمة المرور:* `{$rawPass}`\n"
                                . "📌 *الرتبة:* نقطة بيع / كاشير معتمد\n\n"
                                . "يمكنك الآن تسجيل الدخول إلى لوحة المبيعات ونقاط البيع.";
                    $waService = new WhatsAppService($db, null, $networkId);
                    $waService->sendMessage($phone, $welcomeMsg, 'welcome_pos_' . $newAdminId);
                } catch (Throwable $e) {}

                jsonResponse([
                    'success' => true,
                    'account_type' => 'pos_agent',
                    'username' => $username,
                    'message' => 'تم تفعيل حساب نقطة البيع بنجاح! يمكنك الآن تسجيل الدخول مباشرة.'
                ]);

            } elseif ($accountType === 'network_owner') {
                $networkName = trim((string)($payload['network_name'] ?? ''));
                $networkCode = trim((string)($payload['network_code'] ?? ''));
                $email = trim((string)($payload['email'] ?? ''));
                $city = trim((string)($payload['city'] ?? ''));
                $currency = trim((string)($payload['currency'] ?? 'YER'));
                $planId = (int)($payload['plan_id'] ?? 0);

                // Guaranteed unique network code without collision
                $networkCode = samGenerateUniqueNetworkCode($db, $networkCode);

                // 1. Create Network immediately active!
                $insNet = $db->prepare("INSERT INTO um_networks (code, name, location, status, notes, created_by, created_at) VALUES (?, ?, ?, 'active', ?, 1, NOW())");
                $insNet->execute([$networkCode, $networkName, $city ?: null, 'تسجيل وتفعيل شبكة جديد تلقائياً']);
                $newNetworkId = (int)$db->lastInsertId();

                // 2. Create Network Subscription immediately active and enabled!
                $planStmt = $db->prepare("SELECT * FROM um_network_plans WHERE id = ? LIMIT 1");
                $planStmt->execute([$planId]);
                $plan = $planStmt->fetch(PDO::FETCH_ASSOC) ?: [];
                $planName = $plan['name'] ?? 'باقة اشتراك';

                $insSub = $db->prepare("INSERT INTO um_network_subscriptions (network_id, plan_id, status, is_enabled, starts_at, price_snapshot, currency_code, created_at) VALUES (?, ?, 'active', 1, NOW(), ?, ?, NOW())");
                $insSub->execute([$newNetworkId, $planId, (float)($plan['monthly_price'] ?? 0), $currency]);

                // 3. Create Network Owner Admin Account immediately active!
                $passHash = password_hash($rawPass, PASSWORD_DEFAULT);
                $insAdm = $db->prepare("INSERT INTO um_admins (fullname, username, phone, email, role, data_scope, is_active, password_hash, created_at) VALUES (?, ?, ?, ?, 'admin', 'network', 1, ?, NOW())");
                $insAdm->execute([$fullname, $username, $phone, $email ?: null, $passHash]);
                $newAdminId = (int)$db->lastInsertId();

                // 4. Link admin to network as active manager
                $insAcc = $db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (?, ?, 'manager', 1, 1, 1)");
                $insAcc->execute([$newAdminId, $newNetworkId]);

                $insRole = $db->prepare("INSERT INTO um_admin_network_roles (admin_id, network_id, role_key, data_scope, is_active, assigned_by_admin_id) VALUES (?, ?, 'superadmin', 'network', 1, 1)");
                $insRole->execute([$newAdminId, $newNetworkId]);

                // Balance
                $insBal = $db->prepare("INSERT INTO um_admin_network_balances (admin_id, network_id, balance, credit_limit, currency_code) VALUES (?, ?, 0, 0, ?) ON DUPLICATE KEY UPDATE currency_code = VALUES(currency_code)");
                $insBal->execute([$newAdminId, $newNetworkId, $currency]);

                // 5. Initialize Network WhatsApp channel & Notification Settings
                $insChan = $db->prepare("INSERT INTO um_network_channels (network_id, channel_type, label, api_url, is_enabled, status, created_by, created_at) VALUES (?, 'whatsapp', 'بوابة واتساب الشبكة', 'http://127.0.0.1:3388', 1, 'DISCONNECTED', ?, NOW()) ON DUPLICATE KEY UPDATE is_enabled=1");
                $insChan->execute([$newNetworkId, $newAdminId]);

                $insNotifSettings = $db->prepare("INSERT INTO um_network_notification_settings (network_id, whatsapp_enabled, telegram_enabled, fcm_enabled, chatbot_enabled, notify_sales, notify_receipts, notify_transfers, notify_inventory, notify_routers, notify_finance, chatbot_network_name, created_at) VALUES (?, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, ?, NOW()) ON DUPLICATE KEY UPDATE whatsapp_enabled=1");
                $insNotifSettings->execute([$newNetworkId, $networkName]);

                // 6. Link System Owner ID 1 as sovereign access to this new network
                $insOwnAcc = $db->prepare("INSERT INTO um_admin_network_access (admin_id, network_id, access_level, is_default, is_active, granted_by_admin_id) VALUES (1, ?, 'owner', 0, 1, 1)");
                $insOwnAcc->execute([$newNetworkId]);

                // 7. Push Sovereign Notification to System Owner Console
                $notifTitle = "👑 تم تسجيل وتفعيل شبكة جديدة: {$networkName} ({$networkCode})";
                $notifMsg = "تم تسجيل وتفعيل شبكة جديدة بنجاح للمالك: {$fullname} ({$phone}) على باقة: {$planName}. حالة الشبكة والحساب: نشط ومفعل.";
                $metaJson = json_encode([
                    'scope' => 'platform_owner',
                    'type' => 'new_network_registered',
                    'network_id' => $newNetworkId,
                    'admin_id' => $newAdminId,
                    'plan_id' => $planId,
                    'phone' => $phone
                ], JSON_UNESCAPED_UNICODE);

                $insNotif = $db->prepare("INSERT INTO um_notifications (network_id, title, message, category, target_role, metadata, created_at) VALUES (?, ?, ?, 'system', 'system_owner', ?, NOW())");
                $insNotif->execute([$newNetworkId, $notifTitle, $notifMsg, $metaJson]);

                $db->commit();

                // Dispatch WhatsApp alert to System Owner phone if configured
                try {
                    require_once __DIR__ . '/system_owner_notifications_api.php';
                    if (function_exists('samOwnerSetting') && function_exists('samOwnerSendWhatsApp')) {
                        $ownerAlertPhone = samOwnerSetting($db, 'system_owner_whatsapp_owner_phone', '967770283515');
                        if (!empty($ownerAlertPhone)) {
                            $ownerAlertMsg = "👑 *تنبيه منصة SAM - شبكة جديدة مفعلة*\n"
                                           . "━━━━━━━━━━━━━━━━━━\n"
                                           . "🏷️ *اسم الشبكة:* {$networkName} ({$networkCode})\n"
                                           . "👤 *مالك الشبكة:* {$fullname}\n"
                                           . "📱 *رقم الهاتف:* {$phone}\n"
                                           . "📦 *الباقة:* {$planName}\n"
                                           . "✅ *الحالة:* تم إنشاء الشبكة وتفعيل الحساب بنجاح.";
                            samOwnerSendWhatsApp($db, $ownerAlertPhone, $ownerAlertMsg);
                        }
                    }
                } catch (Throwable $e) {}

                // Send confirmation and welcome message to the applicant
                try {
                    $applicantMsg = "🎉 *أهلاً بك - تم تفعيل شبكتك وحسابك بنجاح!*\n\n"
                                  . "مرحباً بك عزيزي *" . $fullname . "*،\n"
                                  . "🏷️ *اسم الشبكة:* {$networkName} ({$networkCode})\n"
                                  . "📦 *الباقة:* {$planName}\n"
                                  . "👤 *اسم المستخدم:* `{$username}`\n"
                                  . "🔑 *كلمة المرور:* `{$rawPass}`\n\n"
                                  . "✅ حسابك وشبكتك الآن *نشطة ومفعلة*. يمكنك تسجيل الدخول إلى لوحة التحكم فوراً.";
                    $waService = new WhatsAppService($db, null, 0);
                    $waService->sendMessage($phone, $applicantMsg, 'net_req_' . $newNetworkId);
                } catch (Throwable $e) {}

                jsonResponse([
                    'success' => true,
                    'account_type' => 'network_owner',
                    'network_id' => $newNetworkId,
                    'network_name' => $networkName,
                    'network_code' => $networkCode,
                    'plan_name' => $planName,
                    'status' => 'active',
                    'message' => 'تم إنشاء وتفعيل شبكتك وحسابك بنجاح! يمكنك الآن تسجيل الدخول مباشرة والبدء بإدارة شبكتك.'
                ]);
            }
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'فشل إنشاء الحساب: ' . $e->getMessage()], 500);
        }
    }

    // ==========================================
    // SUBSCRIBER / CUSTOMER PORTAL ACTIONS (Public / Phone-based)
    // ==========================================
    if ($action === 'customer_get_portal_data') {
        try {
            $db = getDB();
            $posService = new PosDistributorService($db);
            $phone = trim((string)($_GET['phone'] ?? ($_POST['phone'] ?? '')));
            if (empty($phone) && !empty($_SESSION['phone'])) $phone = (string)$_SESSION['phone'];
            if (empty($phone) && !empty($_SESSION['user'])) $phone = (string)$_SESSION['user'];
            $netId = (int)($_GET['network_id'] ?? ($_POST['network_id'] ?? 0));
            jsonResponse($posService->customerGetPortalData($phone, $netId > 0 ? $netId : null));
        } catch (Throwable $e) {
            jsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    if ($action === 'customer_submit_request') {
        try {
            $db = getDB();
            $posService = new PosDistributorService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($posService->customerSubmitRequest($input));
        } catch (Throwable $e) {
            jsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

if ($action === 'check_auth') {
    syncAuthFromBearer();

    $isLoggedIn = !empty($_SESSION['logged_in']) && !empty($_SESSION['admin_id']);
    if (!$isLoggedIn) {
        jsonResponse([
            'logged_in' => false,
            'user' => null,
            'fullname' => null,
            'role' => '',
            'admin_id' => 0,
            'is_system_owner' => false,
            'discount_rate' => 0,
            'credit_limit' => 0,
            'data_scope' => 'own',
            'permissions' => []
        ]);
    }

    $adminId = (int)($_SESSION['admin_id'] ?? 1);
    $authContext = new AuthorizationContext(getDB(), AuthorizationContext::loadActor(getDB(), $adminId));
    $authActor = $authContext->actor();
    $currentRole = $authContext->role();
    $_SESSION['active_network_id'] = $authContext->activeNetworkId();
    $_SESSION['role'] = $currentRole;
    $_SESSION['admin_role'] = $currentRole;
    $_SESSION['data_scope'] = $authContext->scope();

    // Fetch live discount rate from DB
    $admStmt = getDB()->prepare("SELECT discount_rate, credit_limit, data_scope, allowed_networks FROM um_admins WHERE id = ? LIMIT 1");
    $admStmt->execute([$adminId]);
    $admRow = $admStmt->fetch(PDO::FETCH_ASSOC);
    $liveDisc = (float)($admRow['discount_rate'] ?? ($_SESSION['discount_rate'] ?? 0));
    $_SESSION['discount_rate'] = $liveDisc;

    $effectivePerms = $authActor['effective_permissions'] ?? [];
    $_SESSION['permissions'] = $effectivePerms;

    $isOwnerCheck = getDB()->prepare('SELECT COUNT(*) FROM um_system_owners WHERE admin_id = ?');
    $isOwnerCheck->execute([(int)$adminId]);
    $isOwnerAuth = ((int)$adminId === 1 || (bool)$isOwnerCheck->fetchColumn());

    jsonResponse([
        'logged_in' => true,
        'user' => $_SESSION['user'] ?? null,
        'fullname' => $_SESSION['fullname'] ?? null,
        'role' => $currentRole,
        'admin_id' => $adminId,
        'is_system_owner' => $isOwnerAuth,
        'discount_rate' => $liveDisc,
        'credit_limit' => (float)($admRow['credit_limit'] ?? 0),
        'data_scope' => $authContext->scope(),
        'permissions' => $effectivePerms,
        'networks' => $authActor['networks'] ?? [],
        'active_network' => $authContext->activeNetwork(),
        'active_network_id' => $authContext->activeNetworkId()
    ]);
}

requireAuth();

$requestedNetworkHeader = (int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? 0);
if ($action === 'switch_active_network') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
    if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $targetNetworkId = (int)($input['network_id'] ?? ($_GET['network_id'] ?? 0));
    $adminId = (int)($_SESSION['admin_id'] ?? 0);
    if ($adminId <= 0) jsonResponse(['success'=>false,'error'=>'AUTH_REQUIRED'], 401);

    $switchActor = AuthorizationContext::loadActor(getDB(), $adminId, $targetNetworkId);
    $_SESSION['active_network_id'] = (int)$switchActor['active_network_id'];
    $_SESSION['role'] = (string)$switchActor['role'];
    $_SESSION['admin_role'] = (string)$switchActor['role'];
    $_SESSION['data_scope'] = (string)$switchActor['data_scope'];
    $_SESSION['permissions'] = $switchActor['effective_permissions'];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    jsonResponse([
        'success'=>true,
        'active_network'=>$switchActor['active_network'],
        'active_network_id'=>(int)$switchActor['active_network_id'],
        'role'=>$switchActor['role'],
        'data_scope'=>$switchActor['data_scope'],
        'permissions'=>$switchActor['effective_permissions'],
        'networks'=>$switchActor['networks'] ?? []
    ]);
}

$requestAuthorizationContext = new AuthorizationContext(
    getDB(),
    AuthorizationContext::loadActor(getDB(), (int)($_SESSION['admin_id'] ?? 0), $requestedNetworkHeader > 0 ? $requestedNetworkHeader : null)
);
if($requestedNetworkHeader>0&&$requestedNetworkHeader!==$requestAuthorizationContext->activeNetworkId())jsonResponse(['success'=>false,'error'=>'FORBIDDEN_NETWORK'],403);
$isOwnerAction = str_starts_with((string)$action, 'owner_system_') || str_starts_with((string)$action, 'owner_');
if ($isOwnerAction && $currentAdminId > 0 && !in_array($requestAuthorizationContext->role(), ['system_owner'], true)) {
    $ownerCheck = getDB()->prepare('SELECT 1 FROM um_system_owners WHERE admin_id=? LIMIT 1');
    $ownerCheck->execute([$currentAdminId]);
    if (!$ownerCheck->fetchColumn()) {
        jsonResponse(['success'=>false,'error'=>'FORBIDDEN_OWNER_SCOPE'],403);
    }
}

$isGlobalAction = str_starts_with((string)$action, 'owner_system_') || 
                  str_starts_with((string)$action, 'owner_') || 
                  in_array((string)$action, [
                      'get_network_manager_candidates',
                      'get_exchange_rates',
                      'get_notifications',
                      'get_ui_settings',
                      'check_auth',
                      'get_subscriber_announcements',
                      'subscriber_card_query'
                  ], true);

if (!$isGlobalAction && !$requestAuthorizationContext->isGlobal()) {
    $requestAuthorizationContext->assertActiveNetwork();
}
$GLOBALS['sam_request_authorization_context'] = $requestAuthorizationContext;
$_SESSION['active_network_id'] = $requestAuthorizationContext->activeNetworkId();
$_SESSION['role'] = $requestAuthorizationContext->role();
$_SESSION['admin_role'] = $requestAuthorizationContext->role();
$_SESSION['data_scope'] = $requestAuthorizationContext->scope();
$_SESSION['permissions'] = $requestAuthorizationContext->actor()['effective_permissions'] ?? [];

if ($action === 'get_network_context') {
    jsonResponse([
        'success'=>true,
        'networks'=>$requestAuthorizationContext->actor()['networks'] ?? [],
        'active_network'=>$requestAuthorizationContext->activeNetwork(),
        'active_network_id'=>$requestAuthorizationContext->activeNetworkId(),
        'role'=>$requestAuthorizationContext->role(),
        'data_scope'=>$requestAuthorizationContext->scope(),
        'permissions'=>$requestAuthorizationContext->actor()['effective_permissions'] ?? []
    ]);
}

$currentAdminId = (int)($_SESSION['admin_id'] ?? 1);
$currentAdminRole = $requestAuthorizationContext->role();
$currentDataScope = $requestAuthorizationContext->scope();

/** Bind every legacy resource ID to the authenticated session scope. */
function legacyAuthorizationContext(): AuthorizationContext {
    if (($GLOBALS['sam_request_authorization_context'] ?? null) instanceof AuthorizationContext) {
        return $GLOBALS['sam_request_authorization_context'];
    }
    static $context = null;
    if ($context instanceof AuthorizationContext) return $context;
    $adminId = (int)($_SESSION['admin_id'] ?? 0);
    if ($adminId <= 0) throw new DomainException('AUTH_REQUIRED');
    $db = getDB();
    return $context = new AuthorizationContext($db, AuthorizationContext::loadActor($db, $adminId));
}

// =========================================================================
// SYSTEM OWNER DELETION LOCK POLICY (سياسة قفل الحذف لمالك النظام فقط)
// =========================================================================
$isSystemOwner = ($currentAdminId === 1);
if (!$isSystemOwner) {
    try {
        $ownerChk = getDB()->prepare("SELECT COUNT(*) FROM um_system_owners WHERE admin_id = ?");
        $ownerChk->execute([$currentAdminId]);
        $isSystemOwner = (bool)$ownerChk->fetchColumn();
    } catch (Throwable $e) {
        $isSystemOwner = false;
    }
}

$isDeleteAction = (
    str_starts_with((string)$action, 'delete_') ||
    str_starts_with((string)$action, 'remove_') ||
    str_starts_with((string)$action, 'purge_') ||
    str_starts_with((string)$action, 'clear_') ||
    str_starts_with((string)$action, 'destroy_') ||
    in_array((string)$action, [
        'reset_financial_system',
        'reset_ui_settings',
        'truncate_logs',
        'delete_all_vouchers'
    ], true)
);

if ($isDeleteAction && !$isSystemOwner) {
    jsonResponse([
        'success' => false,
        'error' => '🔒 عذراً، عمليات الحذف مقفلة بقرار الأمان ومحصورة بحساب مالك النظام فقط (System Owner).',
        'code' => 'SYSTEM_OWNER_DELETE_ONLY'
    ], 403);
}

try {
    require __DIR__ . '/wallet_commerce_api.php';
    require __DIR__ . '/wallet_operations_api.php';
    require __DIR__ . '/stock_operations_api.php';
    require __DIR__ . '/commerce_api.php';
    require __DIR__ . '/stock_drafts_api.php';
    require __DIR__ . '/network_reads_api.php';
    require __DIR__ . '/network_configuration_api.php';
    require __DIR__ . '/network_onboarding_api.php';
    require __DIR__ . '/system_owner_api.php';
    require_once __DIR__ . '/recurring_expenses_api.php';


    require_once __DIR__ . '/purchases_api.php';

    if ($action === 'get_integrated_report') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;
        $reportType = (string)($input['type'] ?? 'sales');
        $reportPermissions = $reportType === 'finance'
            ? ['finance.reports.view.all']
            : ['sales_reports.view.all'];
        legacyAuthorizationContext()->assertCan($reportPermissions);
        jsonResponse($service->getIntegratedReport($input));
    }

    $financialCoreActions = [
        'get_chart_of_accounts', 'save_chart_account', 'get_journal_entries',
        'create_journal_entry', 'get_trial_balance', 'get_general_ledger',
        'get_comprehensive_financial_statements', 'get_cost_centers',
        'get_cost_centers_report', 'save_cost_center', 'delete_cost_center',
        'delete_chart_account', 'get_partners_equity', 'distribute_profits',
        'save_partner', 'delete_partner', 'record_opening_balance',
        'deposit_partner_capital', 'get_employee_salaries', 'save_employee_salary',
        'delete_employee_salary', 'get_salary_payments', 'pay_employee_salary',
        'pay_batch_salaries', 'get_financial_report'
    ];
    if (in_array((string)$action, $financialCoreActions, true)) {
        $financialContext = legacyAuthorizationContext();
        if (!in_array($financialContext->role(), ['system_owner', 'superadmin', 'finance', 'accountant'], true)) {
            throw new DomainException('FORBIDDEN');
        }
        $financialContext->assertCan(['vouchers_fin', 'accounting_reports', 'cashbox_accounts']);
    }

    switch ($action) {

        case 'get_suppliers':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $q = trim((string)($_GET['q'] ?? $_POST['q'] ?? ''));

            $sups = $ps->getSuppliers($q);

            jsonResponse(['success' => true, 'data' => $sups, 'suppliers' => $sups]);

            break;

        case 'save_supplier':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($ps->saveSupplier($input, $currentAdminId));

            break;

        case 'delete_supplier':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? $_GET['id'] ?? 0);

            jsonResponse($ps->deleteSupplier($id));

            break;

        case 'get_supplier_statement':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $id = (int)($_GET['id'] ?? $_POST['id'] ?? $_GET['supplier_id'] ?? 0);

            $startDate = (string)($_GET['start_date'] ?? $_POST['start_date'] ?? '');

            $endDate = (string)($_GET['end_date'] ?? $_POST['end_date'] ?? '');

            jsonResponse($ps->getSupplierStatement($id, $startDate, $endDate));

            break;

        case 'get_purchase_lookups':

        case 'get_purchase_modal_data':

        case 'get_purchase_form_data':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $currentAdminId = (int)($_SESSION['admin_id'] ?? ($_SESSION['user_id'] ?? 1));
            $lookups = $ps->getPurchaseLookups($currentAdminId);

            jsonResponse(array_merge(['success' => true, 'data' => $lookups], $lookups));

            break;

        case 'get_purchases_list':

        case 'get_purchase_invoices':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $filters = json_decode(file_get_contents('php://input'), true) ?: $_GET ?: $_POST;

            jsonResponse($ps->listPurchaseInvoices((array)$filters));

            break;

        case 'get_purchase_details':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $id = (int)($_GET['id'] ?? $_POST['id'] ?? 0);

            jsonResponse(['success' => true, 'data' => $ps->getPurchaseInvoiceDetails($id)]);

            break;

        case 'post_purchase_invoice':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($ps->postPurchaseInvoice($input, $currentAdminId));

            break;

        case 'pay_supplier_invoice':

        case 'pay_supplier':

            require_once __DIR__ . '/includes/PurchasesService.php';

            $ps = new PurchasesService(getDB());

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($ps->paySupplier($input, $currentAdminId));

            break;

        case 'get_recurring_expenses':

            jsonResponse(RecurringExpensesApi::list(getDB(), $currentAdminId));

            break;

        case 'save_recurring_expense':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse(RecurringExpensesApi::save(getDB(), $input, $currentAdminId));

            break;

        case 'delete_recurring_expense':
        case 'toggle_recurring_expense_status':
        case 'toggle_recurring_expense':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse(RecurringExpensesApi::deactivate(getDB(), (int)($input['id'] ?? 0)));

            break;

        case 'get_recurring_expense_payments':

            jsonResponse(RecurringExpensesApi::payments(getDB(), (int)($_GET['id'] ?? 0)));

            break;

        case 'create_direct_expense_voucher':

        case 'create_direct_operating_expense':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse(RecurringExpensesApi::createDirectExpenseVoucher(getDB(), $service, $input, $currentAdminId));

            break;

        case 'pay_recurring_expense':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse(RecurringExpensesApi::pay(getDB(), $service, $input, $currentAdminId));

            break;

        case 'get_next_username':

            $role = $_GET['role'] ?? 'pos_agent';

            jsonResponse(['success' => true, 'username' => $service->getNextUsername($role)]);

            break;

        case 'change_own_password':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $currPass = $input['current_password'] ?? '';

            $newPass = $input['new_password'] ?? '';

            $adminId = (int)($_SESSION['admin_id'] ?? 0);

            jsonResponse($service->changeOwnPassword($currPass, $newPass, $adminId));

            break;

        case 'evaluate_widget_metric':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $widget = $input['widget'] ?? $input;

            jsonResponse($service->computeWidgetMetric($widget));

            break;

        case 'sales_channel_report':
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan(['sales_reports.view.own','sales_reports.view.children','sales_reports.view.all']);
            $posService = new PosDistributorService($db);
            jsonResponse($posService->salesReport((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $_GET));
            break;
        case 'pending_topup_alerts':
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan(['instant_balance.topup.own','instant_balance.topup.children','instant_balance.topup.all']);
            $posService = new PosDistributorService($db);
            jsonResponse($posService->pendingTopupAlerts((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;
        case 'pos_dashboard_details':
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan('pos.dashboard.view.own');
            $posService = new PosDistributorService($db);
            jsonResponse($posService->posDashboard((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;
        case 'distributors_wallets_overview':
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan(['distributors.view.children','instant_balance.topup.all']);
            $posService = new PosDistributorService($db);
            jsonResponse($posService->distributors((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;
        case 'balance_topup_requests':
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan(['instant_balance.topup.own','instant_balance.topup.children','instant_balance.topup.all']);
            $posService = new PosDistributorService($db);
            jsonResponse($posService->topupRequests((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;
        case 'balance_topup_request_create':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan(['instant_balance.topup.own','instant_balance.topup.children','instant_balance.topup.all']);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->createTopupRequest((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;
        case 'balance_topup_request_review':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            $accessContext = new AuthorizationContext($db, AuthorizationContext::loadActor($db, (int)($_SESSION['admin_id'] ?? 0)));
            $accessContext->assertCan('instant_balance.topup.all');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->reviewTopup((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;

        case 'pos_get_networks_catalog':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->getNetworksCatalog((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;

        case 'pos_submit_network_join_request':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->submitNetworkJoinRequest((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;

        case 'pos_get_pending_invitations':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->getPendingInvitations((int)($_SESSION['admin_id'] ?? 0)));
            break;

        case 'pos_confirm_network_invitation':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->confirmNetworkInvitation((int)($_SESSION['admin_id'] ?? 0), $input));
            break;

        case 'pos_request_card_batch':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->requestCardBatch((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;

        case 'pos_get_card_requests':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->getPosCardRequests((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;

        case 'admin_get_pos_requests':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminGetPosRequests((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;

        case 'admin_review_pos_request':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminReviewPosRequest((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;

        case 'admin_invite_pos_agent':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminInvitePosAgent((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;

        case 'admin_get_card_requests':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminGetCardRequests((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;

        case 'admin_review_card_request':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminReviewCardRequest((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input, $service));
            break;

        case 'admin_get_customer_requests':
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminGetCustomerRequests((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;

        case 'admin_review_customer_request':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $posService = new PosDistributorService($db);
            jsonResponse($posService->adminReviewCustomerRequest((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? ''), $input));
            break;
        case 'role_dashboard_summary':
            $aid = (int)($_SESSION['admin_id'] ?? 0);
            if ($aid <= 0) jsonResponse(['success' => false, 'error' => 'غير مصادق'], 401);
            $roleDashboard = new RoleDashboardService($db, $service);
            jsonResponse($roleDashboard->summary($aid, (string)($_SESSION['role'] ?? ''), (array)($_SESSION['permissions'] ?? [])));
            break;
        case 'dashboard_stats':

            jsonResponse($service->getDashboardStats());

            break;

        case 'get_current_network_subscription':
            require_once __DIR__ . '/includes/NetworkSubscriptionService.php';
            $subService = new NetworkSubscriptionService(getDB());
            $activeNetId = (int)($_SESSION['active_network_id'] ?? 1);
            jsonResponse($subService->getNetworkDetail($activeNetId));
            break;

        case 'get_ui_settings':

            jsonResponse($service->getUISettings());

            break;

        case 'save_ui_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveUISettings($input));

            break;

        case 'reset_ui_settings':

            jsonResponse($service->resetUserUISettings());

            break;



        // --- MULTI-TIER USERS / RBAC ---

        case 'get_admins':

            $role = $_GET['role'] ?? '';

            $search = $_GET['search'] ?? '';

            jsonResponse($service->getAdmins($role, $search));

            break;

        case 'get_admin_details':

            $id = (int)($_GET['id'] ?? 0);

            jsonResponse($service->getAdminById($id));

            break;

        case 'save_admin':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            if (!is_array($input)) {
                throw new InvalidArgumentException('INVALID_ADMIN_PAYLOAD');
            }

            jsonResponse($service->saveAdmin($input));

            break;

        case 'save_node_responsible':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            if (!is_array($input)) {
                throw new InvalidArgumentException('INVALID_NODE_RESPONSIBLE_PAYLOAD');
            }

            jsonResponse($service->saveNodeResponsible($input));

            break;

        case 'update_admin_hierarchy':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->updateAdminHierarchy($input));

            break;

        case 'delete_admin':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = $input['id'] ?? ($_GET['id'] ?? 0);

            jsonResponse($service->deleteAdmin($id));

            break;



        // --- SALES & WHOLESALE ---

        case 'get_sales_invoices':

            $filters = [

                'buyer_id' => !empty($_GET['buyer_id']) ? (int)$_GET['buyer_id'] : null,

                'trade_type' => $_GET['trade_type'] ?? '',

                'profile' => $_GET['profile'] ?? '',

                'pay_status' => $_GET['pay_status'] ?? '',

                'pay_method' => $_GET['pay_method'] ?? '',

                'start_date' => $_GET['start_date'] ?? '',

                'end_date' => $_GET['end_date'] ?? '',

                'search' => $_GET['search'] ?? ''

            ];

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            jsonResponse($service->getSalesInvoices($filters, $page, $limit));

            break;

        case 'get_sales_eligible_accounts':

            $adminId = (int)($_SESSION['admin_id'] ?? 1);

            $adminRole = (string)($_SESSION['role'] ?? 'superadmin');

            jsonResponse($service->getSalesEligibleAccounts($adminId, $adminRole));

            break;



        case 'get_available_sheets':

            $adminId = (int)($_GET['admin_id'] ?? ($_SESSION['admin_id'] ?? 0));

            jsonResponse($service->getAvailableSheets($adminId));

            break;



        case 'transfer_sheets':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $currentAdminId = (int)($_SESSION['admin_id'] ?? 1);

$currentAdminRole = (string)($_SESSION['role'] ?? 'admin');

            jsonResponse($service->transferSheets($input, $currentAdminId));

            break;



                case 'get_low_stock_alerts':

            $adminId = (int)($_SESSION['admin_id'] ?? 1);

            jsonResponse(['success' => true, 'alerts' => $service->getLowStockAlerts($adminId)]);

            break;



        

        // --- MULTI-TIER CARD WAREHOUSES & STOCK OPERATIONS ---

        case 'get_card_warehouses':

            jsonResponse($service->getCardWarehousesSummary($currentAdminId));

            break;



        case 'get_warehouse_details':

            $whId = (int)($_GET['admin_id'] ?? $currentAdminId);
            legacyAuthorizationContext()->assertCanAccessAdmin($whId);

            jsonResponse($service->getWarehouseStockDetails($whId));

            break;



        case 'transfer_warehouse_stock':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $sourceAdminId = (int)($input['source_admin_id'] ?? $currentAdminId);
            $targetAdminId = (int)($input['target_admin_id'] ?? 0);
            $scopeContext->assertCanAccessAdmin($sourceAdminId);
            if ($targetAdminId <= 0) throw new DomainException('INVALID_TARGET');
            $scopeContext->assertCanAccessAdmin($targetAdminId);

            jsonResponse($service->transferWarehouseStock($input, $currentAdminId));

            break;



        case 'return_warehouse_stock':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $sourceAdminId = (int)($input['source_admin_id'] ?? 0);
            $targetAdminId = (int)($input['target_admin_id'] ?? 0);
            if ($targetAdminId <= 0) {
                $ownerStmt = getDB()->prepare("SELECT so.admin_id
                    FROM um_system_owners so
                    JOIN um_admin_network_access na ON na.admin_id=so.admin_id AND na.network_id=? AND na.is_active=1
                    ORDER BY so.admin_id ASC LIMIT 1");
                $ownerStmt->execute([legacyAuthorizationContext()->activeNetworkId()]);
                $targetAdminId = (int)$ownerStmt->fetchColumn();
                if ($targetAdminId <= 0) throw new DomainException('SYSTEM_OWNER_REQUIRED');
                $input['target_admin_id'] = $targetAdminId;
            }
            $scopeContext->assertCanAccessAdmin($sourceAdminId);
            $scopeContext->assertCanAccessAdmin($targetAdminId);

            jsonResponse($service->returnWarehouseStock($input, $currentAdminId));

            break;



        case 'get_stock_transfers_log':

            $filters = [

                'type' => $_GET['type'] ?? '',

                'admin_id' => (int)($_GET['admin_id'] ?? 0),

                'search' => $_GET['search'] ?? ''

            ];

            jsonResponse(['success' => true, 'data' => $service->getStockTransfersLog($filters, $currentAdminId)]);

            break;



        case 'get_warehouse_audit_report':

            $whId = (int)($_GET['admin_id'] ?? $currentAdminId);
            legacyAuthorizationContext()->assertCanAccessAdmin($whId);

            jsonResponse(['success' => true, 'report' => $service->getWarehouseAuditReport($whId, $currentAdminId)]);

            break;



        case 'get_sale_invoice_details':

            $invId = (int)($_GET['invoice_id'] ?? 0);
            legacyAuthorizationContext()->assertCanAccessSaleInvoice($invId);

            jsonResponse(['success' => true, 'invoice' => $service->getSaleInvoiceDetails($invId)]);

            break;



        case 'create_sale_invoice':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->createSaleInvoice($input, $currentAdminId));

            break;



        case 'pay_sale_invoice':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            legacyAuthorizationContext()->assertCanAccessSaleInvoice((int)($input['invoice_id'] ?? 0));

            jsonResponse($service->paySaleInvoice($input, $currentAdminId));

            break;



        case 'return_sale_invoice':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            legacyAuthorizationContext()->assertCanAccessSaleInvoice((int)($input['invoice_id'] ?? 0));

            jsonResponse($service->returnSaleInvoice($input, $currentAdminId));

            break;



        case 'get_sales_returns':

            $filters = ['invoice_id' => (int)($_GET['invoice_id'] ?? 0), 'buyer_id' => (int)($_GET['buyer_id'] ?? 0)];
            $scopeContext = legacyAuthorizationContext();
            if ($filters['invoice_id'] > 0) $scopeContext->assertCanAccessSaleInvoice($filters['invoice_id']);
            if ($filters['buyer_id'] > 0) $scopeContext->assertCanAccessAdmin($filters['buyer_id']);
            if (!$scopeContext->isGlobal() && $filters['invoice_id'] <= 0 && $filters['buyer_id'] <= 0) {
                $filters['buyer_id'] = $currentAdminId;
            }

            jsonResponse(['success' => true, 'data' => $service->getSalesReturns($filters)]);

            break;



        case 'get_financial_voucher_details':

            $vId = (int)($_GET['voucher_id'] ?? 0);
            legacyAuthorizationContext()->assertCanAccessFinancialVoucher($vId);

            jsonResponse(['success' => true, 'voucher' => $service->getFinancialVoucherDetails($vId)]);

            break;



        case 'get_voucher_audit_logs':

            $vId = (int)($_GET['voucher_id'] ?? 0);
            legacyAuthorizationContext()->assertCanAccessFinancialVoucher($vId);

            jsonResponse(['success' => true, 'logs' => $service->getVoucherAuditLogs($vId)]);

            break;



        // --- ENTERPRISE DOUBLE-ENTRY ACCOUNTING ENGINE (ERP) ---

        case 'get_chart_of_accounts':
            jsonResponse(['success' => true, 'accounts' => $service->getChartOfAccounts($_GET['network_id'] ?? null)]);
            break;



        case 'save_chart_account':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            jsonResponse($service->saveChartAccount($input, $currentAdminId));

            break;



        case 'get_journal_entries':

            $filters = [

                'start_date' => $_GET['start_date'] ?? '',

                'end_date' => $_GET['end_date'] ?? '',

                'source_module' => $_GET['source_module'] ?? '',

                'search' => $_GET['search'] ?? ''

            ];

            jsonResponse(['success' => true, 'entries' => $service->getJournalEntries($filters)]);

            break;



        case 'create_journal_entry':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            jsonResponse($service->createJournalEntry($input, $currentAdminId));

            break;



        case 'get_trial_balance':

            $asOf = $_GET['as_of_date'] ?? date('Y-m-d');

            $tb = $service->getTrialBalance($asOf);

            jsonResponse([

                'success' => true,

                'trial_balance' => $tb['rows'] ?? [],

                'rows' => $tb['rows'] ?? [],

                'totals' => $tb['totals'] ?? [

                    'debit' => $tb['grand_ending_debit'] ?? 0,

                    'credit' => $tb['grand_ending_credit'] ?? 0,

                    'is_balanced' => $tb['is_balanced'] ?? true,

                    'diff' => abs(($tb['grand_ending_debit'] ?? 0) - ($tb['grand_ending_credit'] ?? 0))

                ],

                'as_of_date' => $tb['as_of_date'] ?? $asOf

            ]);

            break;



        case 'get_general_ledger':

            $accId = (int)($_GET['account_id'] ?? 0);

            $start = $_GET['start_date'] ?? '';

            $end = $_GET['end_date'] ?? '';

            $gl = $service->getGeneralLedger($accId, $start, $end);

            jsonResponse(array_merge(['success' => true, 'ledger' => $gl], $gl));

            break;



        case 'get_comprehensive_financial_statements':

            $period = $_GET['period'] ?? 'month';

            $start = $_GET['start_date'] ?? null;

            $end = $_GET['end_date'] ?? null;

            $fs = $service->getComprehensiveFinancialStatements($period, $start, $end);

            jsonResponse(array_merge(['success' => true, 'statements' => $fs], $fs));

            break;



        case 'get_cost_centers':

            $cc = $service->getCostCentersReport();

            jsonResponse($cc);

            break;



        case 'get_cost_centers_report':

            $start = $_GET['start_date'] ?? null;

            $end = $_GET['end_date'] ?? null;

            $cc = $service->getCostCentersReport($start, $end);

            jsonResponse(array_merge(['success' => true, 'report' => $cc], $cc));

            break;



        case 'save_cost_center':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            jsonResponse($service->saveCostCenter($input, $currentAdminId));

            break;



        case 'delete_cost_center':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            $ccId = (int)($input['id'] ?? $_GET['id'] ?? 0);

            jsonResponse($service->deleteCostCenter($ccId, $currentAdminId));

            break;



        case 'delete_chart_account':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            $accId = (int)($input['id'] ?? $_GET['id'] ?? 0);

            jsonResponse($service->deleteChartAccount($accId, $currentAdminId));

            break;



        case 'get_partners_equity':

            $pe = $service->getPartnersEquitySummary();

            jsonResponse(array_merge(['success' => true, 'data' => $pe], $pe));

            break;



        case 'distribute_profits':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->distributeProfits($input, $currentAdminId));

            break;



        case 'save_partner':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->savePartner($input, $currentAdminId));

            break;



        case 'delete_partner':

            $input = json_decode(file_get_contents('php://input'), true);

            $pId = (int)($input['id'] ?? $_GET['id'] ?? 0);

            jsonResponse($service->deletePartner($pId));

            break;



        case 'record_opening_balance':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->recordOpeningBalance($input, $currentAdminId));
            break;

        case 'deposit_partner_capital':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $pId = (int)($input['partner_id'] ?? 0);

            $amt = (float)($input['amount'] ?? 0);

            $payAcc = (int)($input['payment_account_id'] ?? 0);

            $notes = $input['notes'] ?? '';

            $curCode = $input['currency_code'] ?? 'YER_SANAA';

            $exRate = (float)($input['exchange_rate'] ?? 1.0);

            jsonResponse($service->depositPartnerCapital($pId, $amt, $payAcc, $notes, $currentAdminId, $curCode, $exRate));

            break;



        // --- EMPLOYEE SALARIES & PAYROLL ---

        case 'get_employee_salaries':

            $monthYear = $_GET['month_year'] ?? date('Y-m');

            jsonResponse($service->getEmployeeSalaries($monthYear));

            break;



        case 'save_employee_salary':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveEmployeeSalary($input));

            break;



        case 'delete_employee_salary':

            $input = json_decode(file_get_contents('php://input'), true);

            $salId = (int)($input['id'] ?? $_GET['id'] ?? 0);

            jsonResponse($service->deleteEmployeeSalary($salId));

            break;



        case 'get_salary_payments':

            $filters = [

                'employee_id' => (int)($_GET['employee_id'] ?? 0),

                'month_year' => $_GET['month_year'] ?? '',

                'limit' => (int)($_GET['limit'] ?? 100)

            ];

            jsonResponse($service->getSalaryPayments($filters));

            break;



        case 'pay_employee_salary':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->payEmployeeSalary($input, $currentAdminId));

            break;



        case 'pay_batch_salaries':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->payBatchSalaries($input, $currentAdminId));

            break;



        // --- FINANCIAL ACCOUNTING & CASHBOX ---

        case 'get_cashbox_summary':

            jsonResponse($service->getCashboxSummary($currentAdminId, $currentAdminRole));

            break;

        case 'get_account_statement':

            $accId = (int)($_GET['account_id'] ?? $currentAdminId);
            $statementContext = legacyAuthorizationContext();
            $statementContext->assertCan(['cashbox_accounts', 'vouchers_fin', 'statement.view.own', 'statement.view.children']);
            if (!in_array($statementContext->role(), ['system_owner', 'superadmin', 'finance', 'accountant'], true)) {
                $statementContext->assertCanAccessAdmin($accId);
            }

            $start = $_GET['start_date'] ?? '';

            $end = $_GET['end_date'] ?? '';

            jsonResponse($service->getAccountStatement($accId, $start, $end));

            break;

        case 'get_print_settings':

            $netId = (int)($_GET['network_id'] ?? 0);
            if ($netId <= 0 && method_exists($service, 'getActiveNetworkId')) {
                $netId = (int)$service->getActiveNetworkId();
            }
            $settingKey = $netId > 0 ? "print_settings_net_{$netId}" : "print_settings";
            $raw = $service->getSettingValue($settingKey, null);
            if (!$raw && $netId > 0) {
                $raw = $service->getSettingValue('print_settings', null);
            }
            $settings = $raw ? json_decode($raw, true) : null;
            if (!is_array($settings)) {
                $settings = [];
            }

            $sysName = $service->getSettingValue('system_name', 'شبكة إنترنت اللاسلكية');
            $sysPhone = $service->getSettingValue('contact_phone', '');
            $sysAddress = $service->getSettingValue('system_address', '');
            $sysLogo = $service->getSettingValue('logo_url', 'assets/img/log.png');

            if ($netId > 0) {
                try {
                    $stmtNet = $service->db->prepare("SELECT name, logo_url, hotspot_title FROM um_networks WHERE id = ? LIMIT 1");
                    $stmtNet->execute([$netId]);
                    $netRow = $stmtNet->fetch(PDO::FETCH_ASSOC);
                    if ($netRow) {
                        if (!empty($netRow['name'])) $sysName = $netRow['name'];
                        if (!empty($netRow['logo_url'])) $sysLogo = $netRow['logo_url'];
                    }
                } catch (Throwable $e) {}
            }

            $defaults = [
                'header_title' => $sysName,
                'header_subtitle' => 'نظام الإدارة المحاسبية والشبكات المتقدم',
                'phone' => $sysPhone,
                'address' => $sysAddress,
                'tax_no' => '',
                'logo_url' => $sysLogo,
                'primary_color' => '#0f172a',
                'accent_color' => '#0284c7',
                'footer_notes' => 'تعتبر كافة الفواتير والكشوفات الصادرة نهائية ورسمية ما لم يقدم اعتراض كتابي خلال 7 أيام.',
                'signature_roles' => ['المحاسب / المنظم', 'المستلم / العميل', 'المدير العام / الاعتماد'],
                'paper_format' => 'a4',
                'show_qr' => true,
                'show_watermark' => true
            ];

            $merged = array_merge($defaults, $settings);
            jsonResponse(['success' => true, 'settings' => $merged, 'network_id' => $netId]);

            break;

        case 'save_print_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $netId = (int)($input['network_id'] ?? 0);
            if ($netId <= 0 && method_exists($service, 'getActiveNetworkId')) {
                $netId = (int)$service->getActiveNetworkId();
            }
            $settingKey = $netId > 0 ? "print_settings_net_{$netId}" : "print_settings";

            $sigRoles = $input['signature_roles'] ?? null;
            if (!is_array($sigRoles)) {
                $sigStr = (string)($sigRoles ?? '');
                $sigRoles = array_values(array_filter(array_map('trim', explode(',', $sigStr))));
            }
            if (empty($sigRoles)) {
                $sigRoles = ['المحاسب / المنظم', 'المستلم / العميل', 'المدير العام / الاعتماد'];
            }

            $settings = [
                'header_title'    => trim((string)($input['header_title'] ?? '')),
                'header_subtitle' => trim((string)($input['header_subtitle'] ?? '')),
                'phone'           => trim((string)($input['phone'] ?? '')),
                'address'         => trim((string)($input['address'] ?? '')),
                'tax_no'          => trim((string)($input['tax_no'] ?? '')),
                'logo_url'        => trim((string)($input['logo_url'] ?? '')),
                'primary_color'   => trim((string)($input['primary_color'] ?? '#0f172a')),
                'accent_color'    => trim((string)($input['accent_color'] ?? '#0284c7')),
                'footer_notes'    => trim((string)($input['footer_notes'] ?? '')),
                'signature_roles' => $sigRoles,
                'paper_format'    => in_array($input['paper_format'] ?? '', ['a4', 'thermal'], true) ? $input['paper_format'] : 'a4',
                'show_qr'         => !empty($input['show_qr']),
                'show_watermark'  => !empty($input['show_watermark'])
            ];

            $jsonStr = json_encode($settings, JSON_UNESCAPED_UNICODE);
            $service->setSettingValue($settingKey, $jsonStr);
            if ($netId > 0) {
                if (!$service->getSettingValue('print_settings', null)) {
                    $service->setSettingValue('print_settings', $jsonStr);
                }
            }

            jsonResponse(['success' => true, 'message' => 'تم حفظ وتخصيص طباعة المستندات والترويسة بنجاح ✓', 'settings' => $settings]);

            break;

        case 'set_account_opening_balance':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $financialContext = legacyAuthorizationContext();
            if (!in_array($financialContext->role(), ['system_owner', 'superadmin', 'finance', 'accountant', 'network_manager', 'distributor', 'admin', 'supervisor'], true)) {
                throw new DomainException('FORBIDDEN');
            }
            $financialContext->assertCan(['vouchers_fin', 'cashbox_accounts']);
            $targetAdminId = (int)($input['admin_id'] ?? $input['account_id'] ?? 0);
            if ($targetAdminId > 0 && !$financialContext->isGlobal() && !in_array($financialContext->role(), ['finance', 'accountant'], true)) {
                $financialContext->assertCanAccessAdmin($targetAdminId);
            }

            jsonResponse($service->setAccountOpeningBalance($input, $currentAdminId));

            break;

        case 'save_financial_voucher':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $financialContext = legacyAuthorizationContext();
            $financialContext->assertCan('vouchers_fin');
            $isFinanceOperator = in_array($financialContext->role(), ['system_owner', 'superadmin', 'finance', 'accountant'], true);
            if (!$isFinanceOperator) {
                foreach (['party_id', 'source_account_id', 'destination_account_id'] as $partyField) {
                    if (!empty($input[$partyField])) $financialContext->assertCanAccessAdmin((int)$input[$partyField]);
                }
                if (!empty($input['network_id'])) $financialContext->assertCanAccessNetwork((int)$input['network_id']);
            }

            jsonResponse($service->saveFinancialVoucher($input, $currentAdminId));

            break;

        case 'delete_financial_voucher':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
            legacyAuthorizationContext()->assertCanAccessFinancialVoucher($id);

            jsonResponse($service->deleteFinancialVoucher($id, $currentAdminId));

            break;

        case 'get_financial_vouchers':

            $type = $_GET['type'] ?? '';

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            $search = $_GET['search'] ?? '';

            $netId = !empty($_GET['network_id']) ? (int)$_GET['network_id'] : null;

            $partyId = !empty($_GET['party_id']) ? (int)$_GET['party_id'] : null;

            $pm = $_GET['payment_method'] ?? '';

            $cat = $_GET['category'] ?? '';

            $sDate = $_GET['start_date'] ?? '';

            $eDate = $_GET['end_date'] ?? '';
            $financialContext = legacyAuthorizationContext();
            $financialContext->assertCan('vouchers_fin');
            $voucherScopeRole = $currentAdminRole;
            if (in_array($financialContext->role(), ['finance', 'accountant'], true)) {
                $voucherScopeRole = 'admin';
            } else {
                if ($partyId) $financialContext->assertCanAccessAdmin($partyId);
                if ($netId) $financialContext->assertCanAccessNetwork($netId);
            }

            jsonResponse($service->getFinancialVouchers($type, $page, $limit, $search, $netId, $currentAdminId, $voucherScopeRole, $partyId, $pm, $cat, $sDate, $eDate));

            break;

        case 'get_asset_outages':

            $assetId = (int)($_GET['asset_id'] ?? ($_GET['id'] ?? 0));
            legacyAuthorizationContext()->assertCanAccessAsset($assetId);

            jsonResponse($service->getAssetOutages($assetId));

            break;

        case 'get_whatsapp_settings':

            require_once __DIR__ . '/includes/WhatsAppService.php';

            $wa = new WhatsAppService(getDB());

            jsonResponse(['success' => true, 'settings' => $wa->getSettings()]);

            break;

        case 'save_whatsapp_settings':

            require_once __DIR__ . '/includes/WhatsAppService.php';

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $wa = new WhatsAppService(getDB());

            jsonResponse($wa->saveSettings($input));

            break;

        case 'send_whatsapp_message':

            require_once __DIR__ . '/includes/WhatsAppService.php';

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $phone = (string)($input['phone'] ?? $input['to'] ?? '');

            $message = (string)($input['message'] ?? $input['text'] ?? '');

            $wa = new WhatsAppService(getDB());

            jsonResponse($wa->sendMessage($phone, $message));

            break;

case 'send_whatsapp_report':

            require_once __DIR__ . '/includes/WhatsAppReportService.php';

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

            $reportType = (string)($input['type'] ?? 'daily_morning');

            $repService = new WhatsAppReportService(getDB());

            switch ($reportType) {

                case 'daily_morning':

                    jsonResponse(['success' => true, 'result' => $repService->sendDailyMorningReport()]);

                    break;

                case 'daily_cashbox':

                    jsonResponse(['success' => true, 'result' => $repService->sendDailyCashboxReport()]);

                    break;

                case 'weekly_summary':

                    jsonResponse(['success' => true, 'result' => $repService->sendWeeklySummaryReport()]);

                    break;

                case 'low_stock':

                    jsonResponse(['success' => true, 'result' => $repService->checkAndSendLowStockAlerts()]);

                    break;

                default:

                    jsonResponse(['success' => false, 'error' => 'نوع التقرير غير مدعوم'], 400);

            }

            break;

            require_once __DIR__ . '/includes/WhatsAppService.php';

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $phone = (string)($input['phone'] ?? $input['to'] ?? '');

            $message = (string)($input['message'] ?? $input['text'] ?? '');

            $wa = new WhatsAppService(getDB());

            jsonResponse($wa->sendMessage($phone, $message));

            break;

        case 'get_financial_report':

            $period = $_GET['period'] ?? 'month';
            legacyAuthorizationContext()->assertCan(['accounting_reports', 'vouchers_fin']);

            jsonResponse($service->getFinancialReport($period));

            break;



        // --- ASSETS ---

        case 'get_asset_details':

        case 'get_asset':

            $id = (int)($_GET['id'] ?? ($_POST['id'] ?? 0));
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'assets', 'network_topology']);
            $scopeContext->assertCanAccessAsset($id);

            jsonResponse($service->getAssetById($id));

            break;

        case 'get_assets_list':

            $cat = $_GET['category'] ?? '';

            $stat = $_GET['status'] ?? '';

            $search = $_GET['search'] ?? '';

            $nodeId = (int)($_GET['node_id'] ?? 0);

            $userId = (int)($_GET['user_id'] ?? 0);
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'assets', 'network_topology']);
            if ($userId > 0) {
                $scopeContext->assertCanAccessAdmin($userId);
            } elseif (!$scopeContext->isGlobal()) {
                $userId = $currentAdminId;
            }

            $res = $service->getAssets($cat, $stat, $search, $nodeId, $userId);

            $list = $res['data'] ?? (is_array($res) ? $res : []);

            jsonResponse(['success' => true, 'assets' => $list, 'data' => $list]);

            break;



        case 'get_assets':

            $cat = $_GET['category'] ?? '';

            $stat = $_GET['status'] ?? '';

            $search = $_GET['search'] ?? '';

            $nodeId = (int)($_GET['node_id'] ?? 0);

            $userId = (int)($_GET['user_id'] ?? 0);

            $networkId = (int)($_GET['network_id'] ?? 0);
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'assets', 'network_topology']);
            if ($userId > 0) $scopeContext->assertCanAccessAdmin($userId);
            if ($networkId > 0) $scopeContext->assertCanAccessNetwork($networkId);
            if (!$scopeContext->isGlobal() && $userId <= 0 && $networkId <= 0) $userId = $currentAdminId;

            jsonResponse($service->getAssets($cat, $stat, $search, $nodeId, $userId, $networkId));

            break;

        case 'save_asset':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['assets', 'network_topology']);
            if (!empty($input['id'])) $scopeContext->assertCanAccessAsset((int)$input['id']);
            if (!empty($input['assigned_to_user_id'])) $scopeContext->assertCanAccessAdmin((int)$input['assigned_to_user_id']);
            if (!empty($input['network_id'])) $scopeContext->assertCanAccessNetwork((int)$input['network_id']);
            if (!$scopeContext->isGlobal() && empty($input['id']) && empty($input['assigned_to_user_id']) && empty($input['network_id'])) {
                throw new DomainException('FORBIDDEN_SCOPE');
            }

            jsonResponse($service->saveAsset($input));

            break;

        case 'delete_asset':

            $id = (int)($_GET['id'] ?? 0);
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['assets', 'network_topology']);
            $scopeContext->assertCanAccessAsset($id);

            jsonResponse($service->deleteAsset($id));

            break;

        case 'batch_update_asset_prices':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $items = $input['items'] ?? $input['updates'] ?? (is_array($input) ? $input : []);
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['assets', 'network_topology']);
            foreach ($items as $assetUpdate) {
                $scopeContext->assertCanAccessAsset((int)($assetUpdate['id'] ?? $assetUpdate['asset_id'] ?? 0));
            }

            jsonResponse($service->batchUpdateAssetPrices($items));

            break;



        // --- ROUTERS ---

        case 'get_routers':

            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'network_monitor']);
            $routers = [];
            foreach ($service->getRouters() as $router) {
                if (!$scopeContext->canAccessRouter((int)($router['id'] ?? 0))) continue;
                if (!in_array($scopeContext->role(), ['system_owner', 'superadmin'], true)) {
                    foreach (['community', 'api_user', 'api_password', 'um_proxy_secret', 'sstp_password'] as $secretField) {
                        unset($router[$secretField]);
                    }
                }
                $routers[] = $router;
            }
            jsonResponse($routers);

            break;

        case 'save_router':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan('routers');
            if (!empty($input['id'])) $scopeContext->assertCanAccessRouter((int)$input['id']);

            if (!empty($input['id'])) {

                jsonResponse($service->updateRouter($input['id'], $input));

            } else {

                jsonResponse($service->addRouter($input));

            }

            break;

        case 'delete_router':

            if (!in_array((string)($_SESSION['role'] ?? ($_SESSION['admin_role'] ?? '')), ['system_owner', 'superadmin'], true)) {

                jsonResponse(['error' => 'عذراً، صلاحية حذف الأجهزة والراوترات مخصصة فقط للمسؤول المالك للنظام (Super Admin)']);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = $input['id'] ?? ($_GET['id'] ?? 0);
            legacyAuthorizationContext()->assertCanAccessRouter((int)$id);

            jsonResponse($service->deleteRouter($id));

            break;



        case 'test_router_api':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->testRouterApiConnection($id, $input));

            break;



        case 'fetch_router_neighbors':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($input['nas_id'] ?? ($_GET['id'] ?? ($_GET['nas_id'] ?? 0))));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->fetchRouterNeighbors($id, $input));

            break;



        case 'parse_raw_neighbors':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            legacyAuthorizationContext()->assertCan(['maintenance.view.assigned', 'routers', 'network_monitor']);

            $rawText = (string)($input['raw_text'] ?? '');

            $routerIp = (string)($input['router_ip'] ?? '');

            jsonResponse($service->parseRawNeighborsText($rawText, $routerIp));

            break;



        case 'import_router_neighbors':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($input['nas_id'] ?? 0));

            $items = is_array($input['items'] ?? null) ? $input['items'] : [];

            $options = is_array($input['options'] ?? null) ? $input['options'] : $input;

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->importNeighborsBatch($id, $items, $options));

            break;



        case 'ping_router_device':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($input['nas_id'] ?? ($_GET['id'] ?? 0)));

            $targetIp = (string)($input['target_ip'] ?? ($_GET['target_ip'] ?? ''));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->pingRouterDevice($id, $targetIp));

            break;

        case 'generate_smart_router_script':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_REQUEST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'routers_view', 'routers_edit', 'network_monitor']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $rosVersion = (string)($input['version'] ?? 'v7');
            $activeNetId = (int)$scopeContext->activeNetworkId();
            $res = $fleetService->generateSmartMikrotikScript($routerId, $activeNetId, $rosVersion);
            try {
                $pack = $fleetService->generateTelegramBotPackage($routerId, $activeNetId, $rosVersion);
                $vKey = ($rosVersion === 'v6') ? 'v6' : 'v7';
                $res['whatsapp_script'] = $pack[$vKey]['TLGRM/send_whatsapp.rsc'] ?? '';
                $res['telemetry_script'] = $pack[$vKey]['TLGRM/send_telemetry.rsc'] ?? '';
            } catch (Throwable $e) {}
            jsonResponse($res);
            break;

        case 'get_router_provision_info':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_REQUEST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'routers_view', 'routers_edit', 'network_monitor']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $activeNetId = (int)$scopeContext->activeNetworkId();
            jsonResponse($fleetService->getRouterProvisionInfo($routerId, $activeNetId));
            break;

        case 'regenerate_router_token':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['routers', 'routers_edit', 'routers_manage']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $activeNetId = (int)$scopeContext->activeNetworkId();
            jsonResponse($fleetService->regenerateProvisionToken($routerId, $activeNetId));
            break;

        case 'toggle_router_license':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['routers', 'routers_edit', 'routers_manage']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $isActive = !empty($input['is_active']);
            $activeNetId = (int)$scopeContext->activeNetworkId();
            jsonResponse($fleetService->toggleRouterLicenseStatus($routerId, $isActive, $activeNetId));
            break;

        case 'download_custom_tlgrm_pack':
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'routers_view', 'routers_edit', 'network_monitor']);
            $routerId = (int)($_GET['router_id'] ?? ($_GET['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $rosVersion = (string)($_GET['version'] ?? 'v7');
            $activeNetId = (int)$scopeContext->activeNetworkId();
            $zipPath = $fleetService->generateCustomizedTlgrmZip($routerId, $activeNetId, $rosVersion);
            if (file_exists($zipPath)) {
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="TLGRM_Router_' . $routerId . '_' . $rosVersion . '.zip"');
                header('Content-Length: ' . filesize($zipPath));
                readfile($zipPath);
                @unlink($zipPath);
                exit;
            } else {
                jsonResponse(['success' => false, 'error' => 'تعذر تجهيز ملف الحزمة'], 500);
            }
            break;

        case 'diagnose_router_fleet':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_REQUEST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'routers_view', 'routers_edit', 'network_monitor']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $scopeContext->assertCanAccessRouter($routerId);
            require_once __DIR__ . '/includes/MikroTikFleetService.php';
            $fleetService = new MikroTikFleetService(getDB());
            $activeNetId = (int)$scopeContext->activeNetworkId();
            $diag = $fleetService->diagnoseRouter($routerId, $activeNetId);
            $isOnline = ($diag['ping_status'] === 'online');
            jsonResponse([
                'success' => true,
                'diagnostics' => [
                    'router_id' => $routerId,
                    'router_name' => $diag['name'],
                    'nas_ip' => $diag['ip_address'],
                    'sstp_status' => [
                        'online' => $isOnline,
                        'vpn_ip' => $diag['ip_address']
                    ],
                    'api_service' => [
                        'accessible' => !empty($diag['api_connected']),
                        'latency_ms' => $diag['latency_ms']
                    ],
                    'radius_status' => [
                        'active' => true
                    ],
                    'system_health' => [
                        'ros_version' => $diag['version'] ?: ('RouterOS ' . $diag['detected_ros_version']),
                        'board_name' => $diag['board_name'] ?: 'MikroTik RouterBOARD',
                        'cpu_load' => $diag['cpu_load'],
                        'free_memory' => $diag['free_memory_mb'] !== null ? ($diag['free_memory_mb'] * 1024 * 1024) : null,
                        'total_memory' => $diag['total_memory_mb'] !== null ? ($diag['total_memory_mb'] * 1024 * 1024) : null,
                        'free_hdd_space' => $diag['free_hdd_mb'] !== null ? ($diag['free_hdd_mb'] * 1024 * 1024) : null,
                        'uptime' => $diag['uptime']
                    ]
                ]
            ]);
            break;

        case 'test_router_coa':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_REQUEST;
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['maintenance.view.assigned', 'routers', 'routers_view', 'routers_manage', 'routers_edit', 'network_monitor']);
            $routerId = (int)($input['router_id'] ?? ($input['id'] ?? 0));
            $nasIp = trim((string)($input['nas_ip'] ?? ($input['nasname'] ?? '')));
            $db = getDB();
            $activeNetId = (int)$scopeContext->activeNetworkId();
            $nas = null;
            if ($routerId > 0) {
                $scopeContext->assertCanAccessRouter($routerId);
                $stmt = $db->prepare("SELECT id, nasname, shortname, secret, ports, network_id FROM nas WHERE id = ? LIMIT 1");
                $stmt->execute([$routerId]);
                $nas = $stmt->fetch(PDO::FETCH_ASSOC);
            } elseif ($nasIp !== '') {
                $stmt = $db->prepare("SELECT id, nasname, shortname, secret, ports, network_id FROM nas WHERE (nasname = ? OR shortname = ?) AND network_id = ? LIMIT 1");
                $stmt->execute([$nasIp, $nasIp, $activeNetId]);
                $nas = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$nas) {
                jsonResponse(['success' => false, 'error' => 'الراوتر غير مسجل أو لا يتبع هذه الشبكة'], 404);
            }
            if (!in_array($scopeContext->role(), ['system_owner', 'superadmin'], true) && (int)$nas['network_id'] !== $activeNetId) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: الراوتر لا يتبع الشبكة النشطة'], 403);
            }

            $targetIp = trim((string)$nas['nasname']);
            if (empty($targetIp) || $targetIp === '127.0.0.1' || $targetIp === 'localhost') {
                $targetIp = '10.101.0.' . $nas['id'];
            }
            $coaPort = !empty($nas['ports']) ? (int)$nas['ports'] : 3799;
            $secret = (string)($nas['secret'] ?: '123456');

            // Probe with radclient disconnect packet
            $probeUser = 'sam-coa-probe-' . time();
            $packet = "User-Name = \"{$probeUser}\"\nAcct-Session-Id = \"probe-000\"\n";
            $radclientBin = file_exists('/usr/bin/radclient') ? '/usr/bin/radclient' : (defined('RADCLIENT_PATH') ? RADCLIENT_PATH : 'radclient');
            $cmd = sprintf(
                'echo %s | %s -r 2 -t 3 %s:%d disconnect %s 2>&1',
                escapeshellarg($packet),
                $radclientBin,
                escapeshellarg($targetIp),
                $coaPort,
                escapeshellarg($secret)
            );
            $startTime = microtime(true);
            $output = shell_exec($cmd) ?: '';
            $latencyMs = round((microtime(true) - $startTime) * 1000, 1);

            $isAck = (strpos($output, 'Disconnect-ACK') !== false || strpos($output, 'CoA-ACK') !== false);
            $isNak = (strpos($output, 'Disconnect-NAK') !== false || strpos($output, 'CoA-NAK') !== false);
            $isSecretMismatch = (strpos($output, 'Invalid-Authenticator') !== false || strpos($output, 'Authentication-Failure') !== false);
            $isTimeout = (strpos($output, 'no response') !== false || strpos($output, 'Timeout') !== false || empty($output));

            $status = 'unknown';
            $message = '';
            $healthy = false;

            if ($isAck || ($isNak && !$isSecretMismatch)) {
                $status = 'listening_and_ready';
                $healthy = true;
                $message = "منفذ CoA ({$coaPort}) نشط ومتصل في الراوتر ويستقبل أوامر فصل وتعديل المستخدمين بنجاح.";
            } elseif ($isSecretMismatch) {
                $status = 'secret_mismatch';
                $message = "منفذ CoA متاح ولكن تم رفض الطلب بسبب عدم تطابق كلمة السر (RADIUS Secret) بين السيرفر والراوتر.";
            } elseif ($isTimeout) {
                $status = 'timeout_unreachable';
                $message = "تعذر الوصول لمنفذ CoA ({$coaPort}). يرجى التأكد من تفعيل Incoming RADIUS بالراوتر (/radius incoming set accept=yes port=3799) وسلامة نفق SSTP.";
            } else {
                $status = 'error';
                $message = "نتيجة الفحص: " . trim($output);
            }

            jsonResponse([
                'success' => true,
                'healthy' => $healthy,
                'status' => $status,
                'router_id' => (int)$nas['id'],
                'router_name' => $nas['shortname'],
                'nas_ip' => $targetIp,
                'coa_port' => $coaPort,
                'latency_ms' => $latencyMs,
                'message' => $message,
                'raw_output' => trim($output),
                'command' => "radclient {$targetIp}:{$coaPort} disconnect"
            ]);
            break;

                // --- ENTERPRISE SNMP FLEET MONITORING SUITE ---
        case 'get_snmp_devices':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_view', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse(['success' => true, 'devices' => $snmp->getDevices($netId)]);
            break;

        case 'add_snmp_device':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_manage', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse($snmp->addDevice($input, $netId));
            break;

        case 'update_snmp_device':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_manage', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse($snmp->updateDevice($id, $input, $netId));
            break;

        case 'delete_snmp_device':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_manage', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse($snmp->deleteDevice($id, $netId));
            break;

        case 'poll_snmp_device':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_view', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse($snmp->pollDevice($id, $netId));
            break;

        case 'test_snmp_device':
            require_once __DIR__ . '/includes/SnmpFleetMonitorService.php';
            $scopeContext = legacyAuthorizationContext();
            $scopeContext->assertCan(['network_monitor', 'routers_manage', 'routers', 'settings']);
            $netId = (int)$scopeContext->activeNetworkId();
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $snmp = new SnmpFleetMonitorService($db);
            jsonResponse($snmp->testDevice($input, $netId));
            break;

        // --- ROUTER CONTROL SUITE & HOTSPOT MANAGER ---

        case 'get_router_comprehensive_status':

            $id = (int)($_GET['id'] ?? ($_POST['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->getRouterComprehensiveStatus($id));

            break;



        case 'get_router_interfaces_traffic':

            $id = (int)($_GET['id'] ?? ($_POST['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->getRouterInterfacesTraffic($id));

            break;



        case 'set_router_interface_state':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? 0);

            $iface = (string)($input['interface'] ?? '');

            $enabled = !empty($input['enabled']);

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->setRouterInterfaceState($id, $iface, $enabled));

            break;



        case 'get_router_hotspot_active':

            $id = (int)($_GET['id'] ?? ($_POST['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->getRouterHotspotActive($id));

            break;



        case 'kick_router_hotspot_user':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? 0);

            $userOrId = (string)($input['user'] ?? ($input['id_val'] ?? ''));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->kickRouterHotspotUser($id, $userOrId));

            break;



        case 'get_router_files_list':

            $id = (int)($_GET['id'] ?? ($_POST['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->getRouterFilesList($id));

            break;



        case 'deploy_hotspot_template':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? 0);

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->deployHotspotLoginTemplate($id));

            break;

        case 'get_hotspot_studio_data':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? $service->getActiveNetworkId());
            jsonResponse($hsService->getStudioData($netId));
            break;

        case 'save_hotspot_studio_data':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $netId = (int)($input['network_id'] ?? $service->getActiveNetworkId());
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
            jsonResponse($hsService->saveStudioData($netId, $input, $adminId));
            break;

        case 'deploy_hotspot_to_router':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $nasId = (int)($input['nas_id'] ?? ($input['id'] ?? 0));
            $netId = (int)($input['network_id'] ?? $service->getActiveNetworkId());
            legacyAuthorizationContext()->assertCanAccessRouter($nasId);
            jsonResponse($hsService->deployToRouter($nasId, $netId));
            break;

        case 'download_hotspot_bundle':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? $service->getActiveNetworkId());
            $zipFile = $hsService->createZipBundle($netId);
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="hotspot_bundle_net_' . $netId . '.zip"');
            header('Content-Length: ' . filesize($zipFile));
            readfile($zipFile);
            @unlink($zipFile);
            exit;

        case 'preview_hotspot_page':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? $service->getActiveNetworkId());
            $type = (string)($_GET['type'] ?? 'login');
            $bundle = $hsService->generateHotspotBundle($netId);
            header('Content-Type: text/html; charset=utf-8');
            echo $bundle[$type === 'status' ? 'status.html' : 'login.html'] ?? $bundle['login.html'];
            exit;



        case 'execute_router_terminal_command':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? 0);

            $cmd = (string)($input['command'] ?? '');

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->executeRouterTerminalCommand($id, $cmd));

            break;



        case 'reboot_router':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->rebootRouterHardware($id));

            break;



        case 'create_router_backup':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));

            $name = (string)($input['name'] ?? '');

            legacyAuthorizationContext()->assertCanAccessRouter($id);

            jsonResponse($service->createRouterBackupFile($id, $name));

            break;







        // --- PROFILES ---

        case 'get_profiles':

            jsonResponse($service->getProfiles());

            break;

        case 'save_profile':

            $input = json_decode(file_get_contents('php://input'), true);

            try {
                jsonResponse($service->saveProfile($input));
            } catch (InvalidArgumentException $e) {
                jsonResponse(['success'=>false,'error'=>$e->getMessage(),'code'=>'PROFILE_VALIDATION'], 400);
            }

            break;

        case 'delete_profile':

            if (!in_array((string)($_SESSION['role'] ?? ($_SESSION['admin_role'] ?? '')), ['system_owner', 'superadmin'], true)) {

                jsonResponse(['error' => 'عذراً، صلاحية حذف الباقات مخصصة فقط للمسؤول المالك للنظام (Super Admin)']);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $id = $input['id'] ?? ($_GET['id'] ?? 0);

            jsonResponse($service->deleteProfile($id, $_SESSION['role'] ?? 'superadmin'));

            break;



        // --- TEMPLATES ---

        case 'get_templates':

            jsonResponse($service->getTemplates());

            break;

        case 'get_template_for_profile':

            $p = $_GET['profile'] ?? '';

            jsonResponse($service->getTemplateForProfile($p));

            break;

        case 'save_template':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->saveTemplate($input));

            break;

        case 'delete_template':

            $input = json_decode(file_get_contents('php://input'), true);

            $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));

            jsonResponse($service->deleteTemplate($id));

            break;

        case 'duplicate_template':

            $input = json_decode(file_get_contents('php://input'), true);

            $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));

            jsonResponse($service->duplicateTemplate($id));

            break;

        case 'upload_bg':

            if (isset($_FILES['image'])) {

                jsonResponse($service->uploadBgImage($_FILES['image']));

            } else {

                jsonResponse(['error' => 'No file uploaded'], 400);

            }

            break;

        case 'upload_template_icon':

            if (isset($_FILES['image'])) {

                jsonResponse($service->uploadTemplateIcon($_FILES['image']));

            } else {

                jsonResponse(['error' => 'لم يتم اختيار صورة PNG'], 400);

            }

            break;



        // --- USERS ---

        case 'get_users':

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            $search = $_GET['search'] ?? '';

            $profile = $_GET['profile'] ?? '';

            $status = $_GET['status'] ?? '';

            $ownerId = !empty($_GET['owner_id']) ? (int)$_GET['owner_id'] : null;

            $batchId = $_GET['batch_id'] ?? '';
            $cardKind = $_GET['card_kind'] ?? '';

            $sortBy = $_GET['sort_by'] ?? 'id';

            $sortDir = $_GET['sort_dir'] ?? 'DESC';

            jsonResponse($service->getUsers($page, $limit, $search, $profile, $status, $ownerId, $batchId, $sortBy, $sortDir, $cardKind));

            break;

        case 'get_user_details':

            $u = $_GET['username'] ?? '';

            jsonResponse($service->getUserDetails($u));

            break;

        case 'get_user_usage':

            $u = $_GET['username'] ?? '';

            jsonResponse($service->getUserUsageDetails($u));

            break;

        case 'save_user':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->saveUser($input));

            break;

        case 'set_user_status':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->setUserStatus($input['username'], $input['enable']));

            break;

        case 'delete_user':

            if (!in_array((string)($_SESSION['role'] ?? ($_SESSION['admin_role'] ?? '')), ['system_owner', 'superadmin'], true)) {

                jsonResponse(['error' => 'عذراً، صلاحية حذف الكروت والمشتركين مخصصة فقط للمسؤول المالك للنظام (Super Admin)']);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $u = $input['username'] ?? ($_GET['username'] ?? '');

            jsonResponse($service->deleteUser($u));

            break;

        case 'delete_users_batch':

        case 'delete_users':

            if (!in_array((string)($_SESSION['role'] ?? ($_SESSION['admin_role'] ?? '')), ['system_owner', 'superadmin'], true) && !in_array('users', $_SESSION['permissions'] ?? []) && !in_array('*', $_SESSION['permissions'] ?? [])) {

                jsonResponse(['error' => 'عذراً، صلاحية حذف الكروت والمشتركين مخصصة فقط للمسؤول المالك للنظام (Super Admin)']);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->deleteUsersBatch(is_array($input['usernames'] ?? null) ? $input['usernames'] : (isset($_GET['usernames']) ? explode(',', $_GET['usernames']) : [])));
            break;

        case 'get_central_subscribers':
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;
            $search = trim($_GET['search'] ?? '');
            $netFilter = (int)($_GET['network_id'] ?? 0);
            $where = ['1=1'];
            $params = [];
            if (!empty($search)) {
                $where[] = "(s.full_name LIKE ? OR s.phone LIKE ? OR s.national_id LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }
            if ($netFilter > 0) {
                $where[] = "EXISTS(SELECT 1 FROM um_subscriber_network_memberships m WHERE m.subscriber_id = s.id AND m.network_id = ?)";
                $params[] = $netFilter;
            }
            $whereSql = implode(' AND ', $where);
            $cntStmt = getDB()->prepare("SELECT COUNT(*) FROM um_subscribers s WHERE $whereSql");
            $cntStmt->execute($params);
            $total = (int)$cntStmt->fetchColumn();

            $stmt = getDB()->prepare("SELECT s.* FROM um_subscribers s WHERE $whereSql ORDER BY s.id DESC LIMIT $limit OFFSET $offset");
            $stmt->execute($params);
            $subscribers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($subscribers)) {
                $subIds = array_column($subscribers, 'id');
                $inClause = implode(',', array_fill(0, count($subIds), '?'));
                $memStmt = getDB()->prepare("
                    SELECT m.*, n.name AS network_name, n.code AS network_code
                    FROM um_subscriber_network_memberships m
                    LEFT JOIN um_networks n ON n.id = m.network_id
                    WHERE m.subscriber_id IN ($inClause)
                    ORDER BY m.network_id ASC
                ");
                $memStmt->execute($subIds);
                $memberships = $memStmt->fetchAll(PDO::FETCH_ASSOC);
                $memMap = [];
                foreach ($memberships as $mem) {
                    $memMap[$mem['subscriber_id']][] = $mem;
                }
                foreach ($subscribers as &$sub) {
                    $sub['memberships'] = $memMap[$sub['id']] ?? [];
                    $sub['networks_count'] = count($sub['memberships']);
                }
                unset($sub);
            }
            jsonResponse(['success' => true, 'data' => $subscribers, 'total' => $total, 'page' => $page, 'limit' => $limit]);
            break;

        case 'save_central_subscriber':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $subId = !empty($input['id']) ? (int)$input['id'] : 0;
            $fullName = trim($input['full_name'] ?? '');
            $phone = normalizeYemenPhone(trim($input['phone'] ?? ''));
            $nationalId = trim($input['national_id'] ?? '');
            $email = trim($input['email'] ?? '');
            $address = trim($input['address'] ?? '');
            $notes = trim($input['notes'] ?? '');

            if (empty($fullName)) jsonResponse(['success' => false, 'error' => 'اسم المشترك مطلوب'], 400);
            if (empty($phone)) jsonResponse(['success' => false, 'error' => 'رقم الهاتف مطلوب'], 400);

            $chkPhone = getDB()->prepare("SELECT id FROM um_subscribers WHERE phone = ? AND id != ? LIMIT 1");
            $chkPhone->execute([$phone, $subId]);
            if ($chkPhone->fetch()) {
                jsonResponse(['success' => false, 'error' => 'رقم الهاتف مسجل مسبقاً لمشترك آخر'], 400);
            }

            if ($subId > 0) {
                $upd = getDB()->prepare("UPDATE um_subscribers SET full_name = ?, phone = ?, national_id = ?, email = ?, address = ?, notes = ? WHERE id = ?");
                $upd->execute([$fullName, $phone, $nationalId, $email, $address, $notes, $subId]);
            } else {
                $ins = getDB()->prepare("INSERT INTO um_subscribers (full_name, phone, national_id, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)");
                $ins->execute([$fullName, $phone, $nationalId, $email, $address, $notes]);
                $subId = (int)getDB()->lastInsertId();
            }

            if (isset($input['memberships']) && is_array($input['memberships'])) {
                foreach ($input['memberships'] as $mem) {
                    $netId = (int)($mem['network_id'] ?? 0);
                    if ($netId <= 0) continue;
                    $uName = trim($mem['username'] ?? '');
                    $status = in_array($mem['status'] ?? '', ['active', 'suspended', 'expired']) ? $mem['status'] : 'active';
                    $profId = !empty($mem['profile_id']) ? (int)$mem['profile_id'] : null;
                    $debtLimit = (float)($mem['debt_limit'] ?? 0);
                    $expiresAt = !empty($mem['expires_at']) ? $mem['expires_at'] : null;

                    $memIns = getDB()->prepare("
                        INSERT INTO um_subscriber_network_memberships (subscriber_id, network_id, username, profile_id, debt_limit, status, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            profile_id = VALUES(profile_id),
                            debt_limit = VALUES(debt_limit),
                            status = VALUES(status),
                            expires_at = VALUES(expires_at)
                    ");
                    $memIns->execute([$subId, $netId, $uName, $profId, $debtLimit, $status, $expiresAt]);
                }
            }

            jsonResponse(['success' => true, 'id' => $subId, 'message' => 'تم حفظ بيانات المشترك بنجاح']);
            break;

        case 'get_subscriber_memberships':
            $subId = (int)($_GET['subscriber_id'] ?? 0);
            $phone = trim($_GET['phone'] ?? '');
            $where = '';
            $param = null;
            if ($subId > 0) {
                $where = 'm.subscriber_id = ?';
                $param = $subId;
            } elseif (!empty($phone)) {
                $where = 's.phone = ?';
                $param = normalizeYemenPhone($phone);
            } else {
                jsonResponse(['success' => false, 'error' => 'معرف المشترك أو رقم هاتفه مطلوب'], 400);
            }
            $stmt = getDB()->prepare("
                SELECT m.*, s.full_name, s.phone, s.national_id, n.name AS network_name, n.code AS network_code
                FROM um_subscriber_network_memberships m
                JOIN um_subscribers s ON s.id = m.subscriber_id
                LEFT JOIN um_networks n ON n.id = m.network_id
                WHERE $where
                ORDER BY m.network_id ASC
            ");
            $stmt->execute([$param]);
            $memberships = $stmt->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(['success' => true, 'data' => $memberships]);
            break;



        // --- BATCH GENERATOR ---

        



        // --- PROFILES IMPORT & EXPORT ---

        case 'export_profiles':

            $profiles = $service->exportProfiles();

            $filename = "profiles_" . date('Ymd_His') . ".csv";

            header('Content-Type: text/csv; charset=UTF-8');

            header('Content-Disposition: attachment; filename="' . $filename . '"');

            header('Pragma: no-cache');

            echo "\xEF\xBB\xBF";

            $out = fopen('php://output', 'w');

            fputcsv($out, ['name','name_for_users','validity','starts_at','price','shared_users','rate_limit','burst_rate','burst_threshold','burst_time','priority','transfer_limit','uptime_limit','address_list']);

            foreach ($profiles as $p) {

                fputcsv($out, [$p['name'],$p['name_for_users'],$p['validity'],$p['starts_at'],$p['price'],$p['shared_users'],$p['rate_limit'],$p['burst_rate'],$p['burst_threshold'],$p['burst_time'],$p['priority'],$p['transfer_limit'],$p['uptime_limit'],$p['address_list']]);

            }

            fclose($out);

            exit;



        case 'import_profiles':

            $input = json_decode(file_get_contents('php://input'), true);

            if (!is_array($input) || empty($input['rows'])) jsonResponse(['error' => 'بيانات غير صالحة'], 400);

            jsonResponse($service->importProfiles($input['rows'], $input['overwrite'] ?? false));

            break;



        // --- ASSETS IMPORT & EXPORT ---

        case 'export_assets':

            $assets = $service->exportAssets($_GET['category'] ?? '', $_GET['status'] ?? '');

            $filename = "assets_" . date('Ymd_His') . ".csv";

            header('Content-Type: text/csv; charset=UTF-8');

            header('Content-Disposition: attachment; filename="' . $filename . '"');

            header('Pragma: no-cache');

            echo "\xEF\xBB\xBF";

            $out = fopen('php://output', 'w');

            fputcsv($out, ['asset_code','name','category','model','serial_number','purchase_date','purchase_cost','current_value','location','status','responsible_person','notes']);

            foreach ($assets as $a) {

                fputcsv($out, [$a['asset_code'],$a['name'],$a['category'],$a['model'],$a['serial_number'],$a['purchase_date'],$a['purchase_cost'],$a['current_value'],$a['location'],$a['status'],$a['responsible_person'],$a['notes']]);

            }

            fclose($out);

            exit;



        case 'import_assets':

            $input = json_decode(file_get_contents('php://input'), true);

            if (!is_array($input) || empty($input['rows'])) jsonResponse(['error' => 'بيانات غير صالحة'], 400);

            jsonResponse($service->importAssets($input['rows'], $input['overwrite'] ?? false));

            break;



        // --- CARDS IMPORT & EXPORT ---

        case 'export_vouchers':

            $exportInput = $_GET;

            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {

                $postedExport = json_decode(file_get_contents('php://input'), true);

                if (is_array($postedExport)) $exportInput = array_merge($exportInput, $postedExport);

            }



            $specific = [];

            if (isset($exportInput['usernames']) && is_array($exportInput['usernames'])) {

                $specific = array_values(array_filter(array_map(static function ($value) {

                    return trim((string)$value);

                }, $exportInput['usernames'])));

            } elseif (!empty($exportInput['usernames'])) {

                $specific = array_values(array_filter(array_map('trim', explode(',', (string)$exportInput['usernames']))));

            }

            $filters = [

                'search' => trim((string)($exportInput['search'] ?? '')),

                'profile' => trim((string)($exportInput['profile'] ?? '')),

                'status' => trim((string)($exportInput['status'] ?? '')),

                'batch' => trim((string)($exportInput['batch'] ?? ''))

            ];



            $vouchers = $service->exportVouchers($filters, $specific);



            $profLabel = !empty($filters['profile']) ? '_' . preg_replace('/[^a-zA-Z0-9_-]/', '', $filters['profile']) : '';

            $batchLabel = !empty($filters['batch']) ? '_' . preg_replace('/[^a-zA-Z0-9_-]/', '', $filters['batch']) : '';

            $filename = "cards" . $profLabel . $batchLabel . "_" . date('Ymd_His') . ".csv";



            header('Content-Type: text/csv; charset=UTF-8');

            header('Content-Disposition: attachment; filename="' . $filename . '"');

            header('Pragma: no-cache');

            header('Cache-Control: no-store, no-cache, must-revalidate');

            header('Expires: 0');



            // UTF-8 BOM for Microsoft Excel compatibility

            echo "\xEF\xBB\xBF";



            $out = fopen('php://output', 'w');

            fputcsv($out, [

                'اسم المستخدم (Username)',

                'كلمة المرور (Password)',

                'الباقة (Profile)',

                'الدفعة (Batch ID)',

                'السعر (Price)',

                'الحالة (Status)',

                'تاريخ الإنشاء (Created At)',

                'أول تسجيل دخول (First Login)',

                'تاريخ الانتهاء (Expires At)',

                'ملاحظات (Comment)'

            ]);



            foreach ($vouchers as $v) {

                fputcsv($out, [

                    $v['username'],

                    $v['password'],

                    $v['profile_name'],

                    $v['batch_id'],

                    $v['price'],

                    $v['status'],

                    $v['created_at'],

                    $v['first_login'] ?: '-',

                    $v['expires_at'] ?: '-',

                    $v['comment'] ?: ''

                ]);

            }

            fclose($out);

            exit;



        case 'import_vouchers':
            $input = json_decode(file_get_contents('php://input'), true);
            if (!is_array($input) || empty($input['cards'])) {
                jsonResponse(['error' => 'البيانات المرسلة غير صالحة'], 400);
            }
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
            @set_time_limit(300);
            @ini_set('memory_limit', '256M');
            $res = $service->importVouchers(
                $input['cards'],
                $input['profile'] ?? '',
                $input['batch_id'] ?? '',
                $currentAdminId
            );
            jsonResponse($res);
            break;

        case 'get_usermanager_import_routers':
            jsonResponse($service->listEligibleRouters());
            break;

        case 'preview_usermanager_sqlite':
            jsonResponse($service->previewUpload($_FILES['sqldb'] ?? [], (int)($_POST['router_id'] ?? 0)));
            break;

        case 'prepare_usermanager_router_transfer':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $networkId = (int)$service->getActiveNetworkId();
            $job = (new ApiJobs($db))->create($currentAdminId, 'router_import_prepare', [
                'network_id' => $networkId,
                'router_id' => (int)($input['router_id'] ?? 0),
                'credentials' => ['api_user' => (string)($input['api_user'] ?? ''), 'api_password' => (string)($input['api_password'] ?? ''), 'api_port' => $input['api_port'] ?? null, 'require_usermanager' => !empty($input['require_usermanager'])]
            ]);
            jsonResponse(['success' => true, 'queued' => true, 'job_id' => $job['id'], 'network_id' => $networkId, 'message' => 'بدأ سحب الكروت في الخلفية']);
            break;

        case 'receive_usermanager_router_transfer':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->receiveRouterTransfer((string)($input['ticket'] ?? '')));
            break;

        case 'get_usermanager_import_cards':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            jsonResponse($service->getPreviewCards(
                (string)($input['token'] ?? ''),
                (int)($input['customer_id'] ?? 0),
                (int)($input['profile_id'] ?? 0),
                (int)($input['page'] ?? 1),
                (int)($input['limit'] ?? 100),
                (string)($input['search'] ?? ''),
                (string)($input['card_kind'] ?? ''),
                (string)($input['sort_col'] ?? 'id'),
                (string)($input['sort_dir'] ?? 'ASC')
            ));
            break;

        case 'get_usermanager_import_card_details':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            jsonResponse($service->getCardDetails((string)($input['token'] ?? ''), (int)($input['customer_id'] ?? 0), (int)($input['source_user_id'] ?? 0)));
            break;

        case 'commit_usermanager_sqlite_import':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $networkId = (int)$service->getActiveNetworkId();
            $job = (new ApiJobs($db))->create($currentAdminId, 'router_import_commit', [
                'network_id' => $networkId, 'token' => (string)($input['token'] ?? ''), 'customer_id' => (int)($input['customer_id'] ?? 0),
                'profile_map' => is_array($input['profile_map'] ?? null) ? $input['profile_map'] : [],
                'source_user_ids' => is_array($input['source_user_ids'] ?? null) ? $input['source_user_ids'] : [],
                'target_status' => (string)($input['target_status'] ?? 'active'), 'import_all' => !empty($input['import_all']),
                'included_profiles' => is_array($input['included_profiles'] ?? null) ? $input['included_profiles'] : [], 'mode' => (string)($input['mode'] ?? 'all')
            ]);
            jsonResponse(['success' => true, 'queued' => true, 'job_id' => $job['id'], 'message' => 'تم وضع عملية الاستيراد في قائمة المعالجة الخلفية']);
            break;
        case 'get_router_import_job_status':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            $jobId = trim((string)($input['job_id'] ?? ''));
            if (!preg_match('/^[a-f0-9-]{36}$/i', $jobId)) jsonResponse(['success' => false, 'error' => 'معرف المهمة غير صالح'], 400);
            $networkId = (int)$service->getActiveNetworkId();
            $q = $db->prepare('SELECT id,type,status,progress,result,error_message,created_at,started_at,finished_at FROM um_api_jobs WHERE id=? AND network_id=? AND created_by=? LIMIT 1');
            $q->execute([$jobId, $networkId, $currentAdminId]);
            $job = $q->fetch(PDO::FETCH_ASSOC);
            if (!$job) jsonResponse(['success' => false, 'error' => 'المهمة غير موجودة'], 404);
            jsonResponse(['success' => true, 'job_id' => $job['id'], 'status' => $job['status'], 'progress' => (int)$job['progress'], 'result' => json_decode((string)($job['result'] ?? 'null'), true), 'error' => $job['error_message'], 'created_at' => $job['created_at'], 'started_at' => $job['started_at'], 'finished_at' => $job['finished_at']]);
            break;
        case 'discard_usermanager_sqlite_preview':
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            jsonResponse($service->discardPreview((string)($input['token'] ?? '')));
            break;

        // --- NETWORK FEDERATION, MERGING & ROAMING ---
        case 'reassign_router_network':
            $scopeContext = legacyAuthorizationContext();
            $canReassign = in_array($scopeContext->role(), ['system_owner', 'superadmin', 'admin'], true) 
                || $scopeContext->hasAnyPermission(['routers_transfer', 'routers_edit', 'routers', 'networks_manage']);
            if (!$canReassign) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: ليس لديك صلاحية نقل الراوترات بين الشبكات'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $routerId = (int)($input['router_id'] ?? 0);
            $targetNetworkId = (int)($input['target_network_id'] ?? 0);
            if ($routerId <= 0 || $targetNetworkId <= 0) {
                jsonResponse(['success' => false, 'error' => 'بيانات الراوتر أو الشبكة المستهدفة غير مكتملة'], 400);
            }
            if (!in_array($scopeContext->role(), ['system_owner', 'superadmin'], true)) {
                $scopeContext->assertCanAccessRouter($routerId);
                $allowedIds = $scopeContext->allowedNetworkIds();
                if (!empty($allowedIds) && !in_array($targetNetworkId, $allowedIds, true)) {
                    jsonResponse(['success' => false, 'error' => 'غير مصرح لك بنقل الراوتر إلى هذه الشبكة المستهدفة'], 403);
                }
            }
            require_once __DIR__ . '/includes/NetworkFederationService.php';
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->reassignRouterNetwork(
                $routerId,
                $targetNetworkId,
                (int)$currentAdminId
            ));
            break;

        case 'preview_network_merge':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: دمج الشبكات مخصص للمدير العام'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->previewNetworkMerge(
                (int)($input['source_network_id'] ?? 0),
                (int)($input['target_network_id'] ?? 0)
            ));
            break;

        case 'execute_network_merge':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: دمج الشبكات مخصص للمدير العام'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->executeNetworkMerge(
                (int)($input['source_network_id'] ?? 0),
                (int)($input['target_network_id'] ?? 0),
                is_array($input['options'] ?? null) ? $input['options'] : [],
                (int)$currentAdminId
            ));
            break;

        case 'get_roaming_peers':
            $netId = (int)($_GET['network_id'] ?? $_POST['network_id'] ?? $activeNetworkId);
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->getRoamingPeers($netId));
            break;

        case 'add_roaming_peer':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: إدارة تحالفات التجوال مخصص للمدير العام'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->addRoamingPeer(
                (int)($input['network_id'] ?? $activeNetworkId),
                (int)($input['peer_network_id'] ?? 0),
                (string)($input['roaming_type'] ?? 'two_way'),
                is_array($input['allowed_profiles'] ?? null) ? $input['allowed_profiles'] : null,
                (float)($input['clearing_rate'] ?? 0.0),
                (int)$currentAdminId
            ));
            break;

        case 'toggle_roaming_peer':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: تعديل حالة التجوال مخصص للمدير العام'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->toggleRoamingPeerStatus(
                (int)($input['id'] ?? 0),
                (string)($input['status'] ?? 'active'),
                (int)$currentAdminId
            ));
            break;

        case 'delete_roaming_peer':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: حذف شراكة التجوال مخصص للمدير العام'], 403);
            }
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->deleteRoamingPeer(
                (int)($input['id'] ?? 0),
                (int)$currentAdminId
            ));
            break;

        case 'get_roaming_clearing_report':
            $netId = (int)($_GET['network_id'] ?? $_POST['network_id'] ?? $activeNetworkId);
            $from = !empty($_GET['from']) ? (string)$_GET['from'] : null;
            $to = !empty($_GET['to']) ? (string)$_GET['to'] : null;
            $fedService = new NetworkFederationService();
            jsonResponse($fedService->getRoamingClearingReport($netId, $from, $to));
            break;

        case 'get_roaming_summary':
            $from = !empty($_GET['from']) ? (string)$_GET['from'] : null;
            $to = !empty($_GET['to']) ? (string)$_GET['to'] : null;
            $netId = isset($_GET['network_id']) ? (int)$_GET['network_id'] : null;
            jsonResponse($service->getRoamingUsageSummary($from, $to, $netId));
            break;

        case 'settle_roaming':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $srcNet = (int)($input['source_network_id'] ?? 0);
            $tgtNet = (int)($input['target_network_id'] ?? 0);
            $amount = (float)($input['amount'] ?? 0);
            $notes = isset($input['notes']) ? (string)$input['notes'] : null;
            jsonResponse($service->settleRoamingBalances($srcNet, $tgtNet, $amount, $notes));
            break;

        case 'get_system_health':
            jsonResponse($service->checkServicesHealth());
            break;

        case 'generate_batch':
            $input = json_decode(file_get_contents('php://input'), true);
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
            @set_time_limit(300);
            @ini_set('memory_limit', '256M');
            jsonResponse($service->generateBatch($input, $currentAdminId));
            break;

        // --- SESSIONS & ACCOUNTING ---

        case 'cleanup_stale_sessions':
            $timeout = isset($_GET['timeout']) ? (int)$_GET['timeout'] : 86400;
            jsonResponse($service->cleanupStaleSessions($timeout));
            break;

        case 'get_active_sessions':

            $search = $_GET['search'] ?? '';

            $nasIp = $_GET['nas_ip'] ?? '';

            jsonResponse($service->getActiveSessions($search, $nasIp));

            break;

        

        // ==========================================

        // RBAC, NETWORK NODES & FREE VOUCHERS ROUTES

        // ==========================================

        case 'get_permission_matrix':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'هذه الشاشة مخصصة لمالك النظام'], 403);
            }
            $catalog = $db->query("SELECT permission_key,module_key,action_key,scope_key,permission_name_ar,description,is_sensitive FROM um_permission_catalog WHERE is_active=1 ORDER BY module_key,action_key,permission_key")->fetchAll(PDO::FETCH_ASSOC);
            $roles = $db->query("SELECT role_key,role_name_ar,description,default_data_scope,is_system FROM um_roles_def ORDER BY is_system DESC, role_name_ar")->fetchAll(PDO::FETCH_ASSOC);
            $assignments = $db->query("SELECT role_key,permission_key,effect FROM um_role_permissions")->fetchAll(PDO::FETCH_ASSOC);
            $matrix = [];
            foreach ($roles as $role) $matrix[$role['role_key']] = [];
            foreach ($assignments as $assignment) {
                if (isset($matrix[$assignment['role_key']])) $matrix[$assignment['role_key']][$assignment['permission_key']] = $assignment['effect'];
            }
            jsonResponse(['success' => true, 'catalog' => $catalog, 'roles' => $roles, 'matrix' => $matrix]);
            break;
        case 'save_permission_matrix':
            if (!$isSystemOwner) {
                jsonResponse(['success' => false, 'error' => 'تعديل صلاحيات الرتب المخصصة محصور بمالك النظام'], 403);
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $roleKey = trim((string)($data['role_key'] ?? ''));
            $changes = is_array($data['changes'] ?? null) ? $data['changes'] : [];
            if ($roleKey === '') jsonResponse(['success' => false, 'error' => 'حدد الرتبة'], 422);
            $valid = $db->prepare('SELECT permission_key FROM um_permission_catalog WHERE is_active=1');
            $valid->execute();
            $validKeys = array_flip($valid->fetchAll(PDO::FETCH_COLUMN));
            $roleCheck = $db->prepare('SELECT is_system FROM um_roles_def WHERE role_key=? LIMIT 1');
            $roleCheck->execute([$roleKey]);
            $roleRow = $roleCheck->fetch(PDO::FETCH_ASSOC);
            if (!$roleRow) jsonResponse(['success' => false, 'error' => 'الرتبة غير موجودة'], 404);
            if ((int)$roleRow['is_system'] === 1) {
                jsonResponse(['success' => false, 'error' => 'الرتبة الأساسية محمية ولا يمكن تعديل صلاحياتها'], 403);
            }
            $db->beginTransaction();
            try {
                $db->prepare('DELETE FROM um_role_permissions WHERE role_key=?')->execute([$roleKey]);
                $insert = $db->prepare('INSERT INTO um_role_permissions(role_key,permission_key,effect) VALUES(?,?,?)');
                foreach ($changes as $change) {
                    $permission = trim((string)($change['permission_key'] ?? ''));
                    $effect = (string)($change['effect'] ?? 'grant');
                    if (!isset($validKeys[$permission]) || !in_array($effect, ['grant','deny'], true)) continue;
                    $insert->execute([$roleKey, $permission, $effect]);
                }
                $db->commit();
                jsonResponse(['success' => true, 'role_key' => $roleKey, 'saved' => count($changes)]);
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }
            break;
        // ==========================================
        // RBAC, NETWORK NODES & FREE VOUCHERS ROUTES
        // ==========================================
        case 'get_roles':

            jsonResponse($service->getRoles());

            break;

                case 'save_admin_scope':

            if (!in_array((string)($_SESSION['role'] ?? ''), ['system_owner', 'superadmin'], true)) {

                jsonResponse(['success' => false, 'error' => 'غير مصرح: تعديل نطاق الرؤية والصلاحيات مخصص فقط للمدير العام المالك للنظام'], 403);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveAdminScope($input['admin_id'] ?? 0, $input['data_scope'] ?? 'own', $input['delegated_admin_ids'] ?? []));

            break;



        case 'save_role':

            if (!$isSystemOwner) {

                jsonResponse(['success' => false, 'error' => 'إدارة الرتب المخصصة محصورة بمالك النظام'], 403);

            }

            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveRole($data));

            break;

        case 'delete_role':

            if (!$isSystemOwner) {

                jsonResponse(['success' => false, 'error' => 'حذف الرتب المخصصة محصور بمالك النظام'], 403);

            }

            $key = $_GET['role_key'] ?? $_POST['role_key'] ?? '';

            jsonResponse($service->deleteRole($key));

            break;

        case 'get_admins_with_roles':

            jsonResponse($service->getAdminsWithRoles($currentAdminId, $currentAdminRole, $currentDataScope));

            break;



        

        // --- NETWORK NODES & DETAILED CONNECTED DEVICES SUITE ---

        case 'get_network_devices_table':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;

            jsonResponse($service->getNetworkDevicesTable($input));

            break;



        case 'batch_update_network_devices':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $assetIds = $input['asset_ids'] ?? ($input['ids'] ?? []);

            $updates = $input['updates'] ?? $input;

            jsonResponse($service->batchUpdateNetworkDevices($assetIds, $updates));

            break;



        case 'get_neighbor_scan_settings':

            jsonResponse($service->getNeighborScanSettings());

            break;



        case 'save_neighbor_scan_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveNeighborScanSettings($input));

            break;



        case 'run_all_routers_neighbor_scan':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $force = !empty($input['force']);

            jsonResponse($service->autoScanAllRoutersNeighbors($force));

            break;



        case 'get_network_nodes':

            $nas = $_GET['nas'] ?? '';

            jsonResponse($service->getNetworkNodes($nas));

            break;

        case 'save_network_node':

            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveNetworkNode($data));

            break;

        case 'delete_network_node':

            $id = (int)($_GET['id'] ?? $_POST['id'] ?? 0);

            jsonResponse($service->deleteNetworkNode($id));

            break;

        case 'get_network_topology':

            $nas = $_GET['nas'] ?? '';

            jsonResponse($service->getNetworkTopologyTree($nas));

            break;



        case 'get_free_vouchers_quotas':

            jsonResponse($service->getFreeVouchersQuotas($currentAdminId, $currentAdminRole, $currentDataScope));

            break;

        

        case 'save_free_vouchers_schedule':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->saveFreeVouchersSchedule($data));
            break;

        case 'toggle_free_voucher_schedule':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $id = (int)($data['id'] ?? ($_GET['id'] ?? 0));
            $isActive = isset($data['is_active']) ? (int)$data['is_active'] : null;
            jsonResponse($service->toggleFreeVoucherSchedule($id, $isActive));
            break;

        case 'delete_free_voucher_schedule':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $id = (int)($data['id'] ?? ($_GET['id'] ?? 0));
            jsonResponse($service->deleteFreeVoucherSchedule($id));
            break;

        

        // ==========================================

        // SUBSCRIBER PORTAL & MOBILE APP ROUTES

        // ==========================================

        case 'subscriber_get_status':

            $code = $_GET['code'] ?? $_POST['code'] ?? '';

            jsonResponse($service->subscriberGetCardStatus($code));

            break;

        case 'subscriber_change_speed':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $code = $input['code'] ?? $_GET['code'] ?? '';

            $speed = $input['speed'] ?? $input['speed_mode'] ?? $_GET['speed'] ?? '2M';

            jsonResponse($service->subscriberChangeSpeed($code, $speed));

            break;

        case 'subscriber_set_max_devices':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $code = $input['code'] ?? $_GET['code'] ?? '';

            $count = (int)($input['max_devices'] ?? $input['devices'] ?? $_GET['max_devices'] ?? 1);

            jsonResponse($service->subscriberSetMaxDevices($code, $count));

            break;

        case 'get_predefined_speed_tiers':

            jsonResponse(['success' => true, 'tiers' => $service->getSpeedTiers(true)]);

            break;

        case 'get_speed_tiers':

            jsonResponse(['success' => true, 'tiers' => $service->getSpeedTiers()]);

            break;

        case 'save_speed_tier':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveSpeedTier($input));

            break;

        case 'delete_speed_tier':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->deleteSpeedTier((int)($input['id'] ?? $_GET['id'] ?? 0)));

            break;

        case 'reset_speed_tiers':

            if (!in_array((string)($_SESSION['role'] ?? ''), ['system_owner', 'superadmin'], true)) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح'], 403);
            }

            jsonResponse($service->resetSpeedTiers());

            break;

        case 'subscriber_get_devices':

            $code = $_GET['code'] ?? $_POST['code'] ?? '';

            jsonResponse($service->subscriberGetDevices($code));

            break;

        case 'subscriber_disconnect_device':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $code = $input['code'] ?? $_GET['code'] ?? '';

            $mac = $input['callingstationid'] ?? $input['mac'] ?? '';

            jsonResponse($service->subscriberDisconnectDevice($code, $mac));

            break;



        case 'create_notification':
            if (!in_array((string)($_SESSION['role'] ?? ''), ['system_owner','superadmin'], true)) jsonResponse(['success'=>false,'error'=>'غير مصرح بهذه العملية'],403);
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $category = trim((string)($input['category'] ?? 'system'));
            $title = trim((string)($input['title'] ?? 'إشعار إداري'));
            $message = trim((string)($input['message'] ?? ''));
            $targetRole = !empty($input['target_role']) ? trim((string)$input['target_role']) : 'all';
            $targetAdminId = !empty($input['target_admin_id']) ? (int)$input['target_admin_id'] : null;
            jsonResponse($service->createNotification($category, $title, $message, $targetRole, $targetAdminId));
            break;
        case 'get_notifications':
            jsonResponse($service->getNotifications((int)($_SESSION['admin_id'] ?? 0), (string)($_SESSION['role'] ?? '')));
            break;
        case 'mark_notification_read':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->markNotificationRead((int)($input['id'] ?? 0),(int)($_SESSION['admin_id'] ?? 0),(string)($_SESSION['role'] ?? '')));
            break;
        case 'mark_all_notifications_read':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            jsonResponse($service->markAllNotificationsRead((int)($_SESSION['admin_id'] ?? 0),(string)($_SESSION['role'] ?? '')));
            break;
        case 'delete_notification':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->deleteNotification((int)($input['id'] ?? 0),(int)($_SESSION['admin_id'] ?? 0),(string)($_SESSION['role'] ?? '')));
            break;
        case 'clear_all_notifications':
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') jsonResponse(['success'=>false,'error'=>'METHOD_NOT_ALLOWED'],405);
            if (!hash_equals('XMLHttpRequest', (string)($_SERVER['HTTP_X_SAM_REQUEST'] ?? ''))) jsonResponse(['success'=>false,'error'=>'CSRF_GUARD_FAILED'],403);
            jsonResponse($service->clearAllNotifications((int)($_SESSION['admin_id'] ?? 0),(string)($_SESSION['role'] ?? '')));
            break;
        case 'get_mobile_dashboard':

            $aid = (int)($_SESSION['admin_id'] ?? $_GET['admin_id'] ?? 1);

            $role = $_SESSION['role'] ?? $_GET['role'] ?? 'superadmin';

            jsonResponse($service->getMobileDashboardData($aid, $role));

            break;

    

        case 'dispatch_scheduled_free_vouchers':

            jsonResponse($service->dispatchScheduledFreeVouchers());

            break;

        case 'get_free_vouchers_analytics':

            jsonResponse($service->getFreeVouchersAnalytics($currentAdminId, $currentAdminRole, $currentDataScope));

            break;

    

        case 'save_free_vouchers_quota':

            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveFreeVouchersQuota($data));

            break;

                case 'resend_free_voucher_whatsapp':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $code = $input['voucher_code'] ?? ($input['username'] ?? '');

            $phone = $input['phone'] ?? null;

            jsonResponse($service->resendFreeVoucherWhatsApp($code, $phone));

            break;

        case 'grant_free_vouchers':

            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->grantFreeVouchers($data, $currentAdminId, $currentAdminRole));

            break;

        case 'get_free_vouchers_list':

            $recip = (int)($_GET['recipient_id'] ?? 0);

            jsonResponse($service->getFreeVouchersList($recip, $currentAdminId, $currentAdminRole, $currentDataScope));

            break;

        case 'get_pos_free_voucher_rules':
            jsonResponse($service->getPosFreeVoucherRules());
            break;

        case 'save_pos_free_voucher_rule':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->savePosFreeVoucherRule($data));
            break;

        case 'delete_pos_free_voucher_rule':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $ruleId = (int)($data['id'] ?? ($_GET['id'] ?? 0));
            jsonResponse($service->deletePosFreeVoucherRule($ruleId));
            break;

        case 'get_pos_free_voucher_eligibility':
            $ruleId = (int)($_GET['rule_id'] ?? 0);
            $posId = (int)($_GET['pos_admin_id'] ?? 0);
            jsonResponse($service->getPosFreeVoucherEligibility($ruleId, $posId));
            break;

        case 'grant_pos_free_vouchers':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->grantPosFreeVouchers($data));
            break;

        case 'grant_all_eligible_pos_free_vouchers':
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->grantAllEligiblePosFreeVouchers($data));
            break;

        case 'delete_unassigned_free_vouchers':
        case 'cleanup_unassigned_free_vouchers':
        case 'delete_all_free_vouchers':
            $reqData = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $all = !empty($_GET['all']) || !empty($reqData['all']) || $action === 'delete_all_free_vouchers';
            jsonResponse($service->deleteUnassignedFreeVouchers($all));
            break;

        case 'hide_free_voucher':
            $reqData = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $username = trim((string)($reqData['username'] ?? ($_GET['username'] ?? '')));
            jsonResponse($service->hideFreeVoucher($username));
            break;

        case 'hide_expired_free_vouchers':
            jsonResponse($service->hideAllExpiredFreeVouchers());
            break;



        case 'get_node_detail_report':

            $nas = $_GET['nas'] ?? '';

            $port = $_GET['port'] ?? '';

            $period = $_GET['period'] ?? 'all';

            jsonResponse($service->getNodeDetailReport($nas, $port, $period));

            break;

    

        case 'get_port_router_analytics':

            $nas = $_GET['nas'] ?? '';

            $period = $_GET['period'] ?? 'all';

            jsonResponse($service->getPortAndRouterAnalytics($nas, $period));

            break;

        case 'get_accounting_history':

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            $search = $_GET['search'] ?? '';

            $nasIp = $_GET['nas_ip'] ?? '';

            jsonResponse($service->getAccountingHistory($page, $limit, $search, $nasIp));

            break;

        case 'disconnect_session':

            $input = json_decode(file_get_contents('php://input'), true);

            jsonResponse($service->disconnectSession($input));

            break;



        // --- LOGS ---

        case 'get_auth_logs':

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            $search = $_GET['search'] ?? '';

            $reply = $_GET['reply'] ?? '';

            jsonResponse($service->getAuthLogs($page, $limit, $search, $reply));

            break;

        case 'clear_auth_logs':

            $days = (int)($_REQUEST['days'] ?? 0);

            jsonResponse($service->clearAuthLogs($days));

            break;



        // --- SERVICE CONTROL ---

        case 'restart_radius':

            jsonResponse($service->restartRadius());

            break;



        

        case 'get_print_batches':

            jsonResponse(['success' => true, 'data' => $service->getPrintBatches($_GET)]);

            break;



        case 'confirm_print_batch':

            $batchId = $input['batch_id'] ?? ($_GET['batch_id'] ?? '');

            $adminId = $_SESSION['admin_id'] ?? 1;

            jsonResponse($service->confirmPrintBatch($batchId, $adminId));

            break;



        case 'get_users_for_print':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $usernames = $input['usernames'] ?? ($_GET['usernames'] ?? []);

            if (is_string($usernames)) {

                $usernames = array_filter(explode(',', $usernames));

            }

            jsonResponse(['success' => true, 'data' => $service->getUsersForPrint($usernames)]);

            break;



        case 'get_batch_for_print':

            $batchId = $_GET['batch_id'] ?? '';

            $templateId = !empty($_GET['template_id']) ? (int)$_GET['template_id'] : null;

            jsonResponse(['success' => true, 'data' => $service->getBatchForPrint($batchId, $templateId)]);

            break;



        case 'get_unsold_inventory':

            jsonResponse(['success' => true, 'data' => $service->getUnsoldInventory()]);

            break;



        

        // --- ACCEL-PPP SSTP / RADIUS MANAGEMENT ---

        case 'get_sstp_status':

            jsonResponse(['success' => true, 'data' => $service->getSstpStatus()]);

            break;

        case 'restart_sstp':

            jsonResponse($service->restartSstpServer());

            break;

        case 'generate_mikrotik_script':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_GET;

            $routerId = (int)($input['id'] ?? 0);

            $options = [

                'backup_ip' => isset($input['backup_ip']) ? trim($input['backup_ip']) : null,

                'backup_enabled' => isset($input['backup_enabled']) ? ($input['backup_enabled'] === 'true' || $input['backup_enabled'] === '1' || $input['backup_enabled'] === true) : null,

                'server_vpn_enabled' => isset($input['server_vpn_enabled']) ? ($input['server_vpn_enabled'] === 'true' || $input['server_vpn_enabled'] === '1' || $input['server_vpn_enabled'] === true) : null,

                'server_vpn_host' => isset($input['server_vpn_host']) ? trim($input['server_vpn_host']) : null,

                'server_vpn_port' => isset($input['server_vpn_port']) ? (int)$input['server_vpn_port'] : null,

                'server_vpn_user' => isset($input['server_vpn_user']) ? trim($input['server_vpn_user']) : null,

                'server_vpn_pass' => isset($input['server_vpn_pass']) ? trim($input['server_vpn_pass']) : null,

                'server_vpn_comment' => isset($input['server_vpn_comment']) ? trim($input['server_vpn_comment']) : null,

            ];

            jsonResponse($service->generateMikrotikScript($routerId, $options));

            break;



        case 'get_sstp_server_vpn_settings':

            jsonResponse(['success' => true, 'data' => $service->getSstpServerVpnSettings()]);

            break;



        case 'save_sstp_server_vpn_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveSstpServerVpnSettings($input));

            break;

        case 'get_um_proxy_settings':

            jsonResponse(['success' => true, 'data' => $service->getUmProxySettings()]);

            break;

        case 'save_um_proxy_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveUmProxySettings($input));

            break;

        case 'get_backup_radius_settings':

            jsonResponse(['success' => true, 'data' => $service->getBackupRadiusSettings()]);

            break;

        case 'save_backup_radius_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveBackupRadiusSettings($input));

            break;



        

        

        // --- UNIFIED NOTIFICATIONS & MESSAGING (WhatsApp + Telegram) ---

        // --- MULTI-CURRENCY & EXCHANGE RATES ---
        case 'get_exchange_rates':
            jsonResponse($service->getFinancialAccountingService()->getExchangeRates());
            break;

                case 'set_base_currency':
            $service->enforcePermission('finance_settings', 'تعديل العملة الأساسية');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $code = (string)($input['currency_code'] ?? ($input['code'] ?? ''));
            $recalc = !empty($input['recalculate_rates']) || !empty($input['auto_recalculate']);
            jsonResponse($service->getFinancialService()->setBaseCurrency($code, $recalc));
            break;

        case 'save_exchange_rate':
            $service->enforcePermission('finance_settings', 'تعديل أسعار الصرف');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->getFinancialAccountingService()->saveExchangeRate($input));
            break;

        case 'convert_currency':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;
            $amount = (float)($input['amount'] ?? 0);
            $from = (string)($input['from'] ?? ($input['from_currency'] ?? 'YER_SANAA'));
            $to = (string)($input['to'] ?? ($input['to_currency'] ?? 'YER_SANAA'));
            jsonResponse($service->getFinancialAccountingService()->convertCurrency($amount, $from, $to));
            break;

        // --- FIREBASE CLOUD MESSAGING (FCM) ---
        case 'get_firebase_settings':
            $service->enforcePermission('notifications_settings', 'مشاهدة إعدادات فايربيس');
            jsonResponse($service->getNotificationService()->getFirebaseService()->getSettings());
            break;

        case 'save_firebase_settings':
            $service->enforcePermission('notifications_settings', 'تعديل إعدادات فايربيس');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->getNotificationService()->getFirebaseService()->saveSettings($input));
            break;

        case 'test_firebase_push':
            $service->enforcePermission('notifications_settings', 'إرسال تنبيه فايربيس تجريبي');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $fb = $service->getNotificationService()->getFirebaseService();
            $title = $input['title'] ?? '🔔 تنبيه تجريبي من SAM';
            $body = $input['body'] ?? 'تم فحص الاتصال بسحابة Firebase واستقبال الإشعار الفوري بنجاح 🌐';
            $token = !empty($input['token']) ? $input['token'] : null;

            if ($token) {
                $res = $fb->sendSinglePush($token, $title, $body, ['event_type' => 'test_push']);
                jsonResponse($res);
            } else {
                $activeTokens = $fb->getAllActiveTokens();
                if (empty($activeTokens)) {
                    $verify = $fb->verifyCredentials();
                    if ($verify['success']) {
                        jsonResponse([
                            'success' => true,
                            'sent_count' => 0,
                            'authenticated' => true,
                            'message' => '✅ الاتصال بسحابة Firebase ومصادقة Google OAuth2 ناجحة 100%!' . "\n" . '📱 ملاحظة: لا توجد أجهزة هواتف نشطة مسجلة حالياً لإرسال الإشعار إليها. قم بفتح تطبيق الأندرويد أو تسجيل الجهاز لتصلك الإشعارات فوراً.',
                            'details' => $verify
                        ]);
                    } else {
                        jsonResponse($verify);
                    }
                } else {
                    $res = $fb->broadcast($title, $body, ['event_type' => 'test_push'], 'test_push', 'test_' . time(), (int)($_SESSION['admin_id'] ?? 1));
                    jsonResponse($res);
                }
            }
            break;

        case 'get_fcm_devices':
            $service->enforcePermission('notifications_settings', 'مشاهدة أجهزة التطبيق');
            $fb = $service->getNotificationService()->getFirebaseService();
            jsonResponse(['devices' => $fb->getDevicesList()]);
            break;

        case 'register_fcm_token':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $token = $input['fcm_token'] ?? ($input['token'] ?? '');
            if (empty($token)) {
                jsonResponse(['success' => false, 'error' => 'FCM_TOKEN_REQUIRED'], 400);
            }
            $fcmContext = legacyAuthorizationContext();
            $adminId = $fcmContext->id();
            $networkId = $fcmContext->activeNetworkId();
            if ($adminId <= 0 || $networkId <= 0) {
                jsonResponse(['success' => false, 'error' => 'AUTH_REQUIRED'], 401);
            }
            $deviceName = $input['device_name'] ?? 'Android Device';
            $platform = $input['platform'] ?? 'android';
            $appVer = $input['app_version'] ?? '1.0';
            $fb = $service->getNotificationService()->getFirebaseService();
            jsonResponse($fb->registerToken($adminId, $token, $deviceName, $platform, $appVer, $networkId));
            break;

        case 'unregister_fcm_token':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $token = $input['fcm_token'] ?? ($input['token'] ?? '');
            $fcmContext = legacyAuthorizationContext();
            $networkId = $fcmContext->activeNetworkId();
            $fb = $service->getNotificationService()->getFirebaseService();
            jsonResponse($fb->unregisterToken($token, $networkId));
            break;

        case 'get_notification_settings':

            $service->enforcePermission('notifications_settings', 'مشاهدة إعدادات الرسائل');

            jsonResponse($service->getNotificationSettings());

            break;

        case 'save_notification_settings':

            $service->enforcePermission('notifications_settings', 'تعديل إعدادات الرسائل');

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveNotificationSettings($input));

            break;

        case 'get_whatsapp_qr':

            jsonResponse($service->getWhatsAppQr());

            break;

        case 'get_whatsapp_status':

            jsonResponse($service->getWhatsAppStatus());

            break;

        case 'logout_whatsapp':

            jsonResponse($service->logoutWhatsApp());

            break;

        case 'send_custom_notification':

            $service->enforcePermission('notifications_send', 'إرسال رسالة مخصصة');

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->sendCustomNotification($input));

            break;

        case 'get_notification_stats':
            $service->enforcePermission('notifications_logs_view', 'مشاهدة إحصائيات الرسائل');
            jsonResponse($service->getNotificationStats());
            break;

        case 'resend_notification_log':
            $service->enforcePermission('notifications_send', 'إعادة إرسال الرسائل');
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $logId = (int)($input['log_id'] ?? ($_GET['log_id'] ?? 0));
            jsonResponse($service->resendNotificationLog($logId));
            break;

        case 'get_notification_logs':

            $service->enforcePermission('notifications_logs_view', 'مشاهدة سجل الرسائل');

            $filters = [

                'channel' => $_GET['channel'] ?? '',

                'event_type' => $_GET['event_type'] ?? '',

                'status' => $_GET['status'] ?? '',

                'search' => $_GET['search'] ?? ''

            ];

            $page = (int)($_GET['page'] ?? 1);

            $limit = (int)($_GET['limit'] ?? 50);

            jsonResponse($service->getNotificationLogs($filters, $page, $limit));

            break;

        case 'test_whatsapp_message':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $phone = $input['phone'] ?? ($_GET['phone'] ?? '');

            $msg = $input['message'] ?? 'رسالة اختبارية من منظومة ميكروتك مانجر 🌐';

            jsonResponse($service->testWhatsAppMessage($phone, $msg));

            break;



        case 'get_telegram_settings':

            $tgData = $service->getTelegramSettings();

            jsonResponse(array_merge(['success' => true, 'data' => $tgData, 'settings' => $tgData], $tgData));

            break;

        case 'save_telegram_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveTelegramSettings($input));

            break;

        case 'test_telegram_alert':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $token = $input['bot_token'] ?? ($input['telegram_bot_token'] ?? null);

            $chatId = $input['chat_id'] ?? ($input['telegram_chat_id'] ?? null);

            jsonResponse($service->testTelegramAlert($token, $chatId));

            break;

        case 'set_telegram_webhook':
            $service->enforcePermission('notifications_settings', 'ضبط webhook تليجرام');
            require_once __DIR__ . '/includes/TelegramService.php';
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $ctx = legacyAuthorizationContext();
            $url = trim((string)($input['url'] ?? ''));
            if ($url === '') jsonResponse(['success' => false, 'error' => 'TELEGRAM_WEBHOOK_URL_REQUIRED'], 400);
            $tg = new TelegramService(getDB(), $ctx->activeNetworkId());
            jsonResponse($tg->setWebhook($url, $input['secret_token'] ?? ($input['webhook_secret'] ?? null)));
            break;



        // --- CHATBOT & INTERACTIVE AUTO-RESPONDER ---

        case 'get_chatbot_settings':

            jsonResponse(['success' => true, 'settings' => $service->getChatbotSettings()]);

            break;

        case 'save_chatbot_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveChatbotSettings($input));

            break;

        case 'handle_chatbot_message':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $msg = $input['message'] ?? ($input['body'] ?? ($input['query'] ?? ($input['text']['body'] ?? ($_GET['message'] ?? ''))));
            $phone = $input['phone'] ?? ($input['from'] ?? ($_GET['phone'] ?? ''));
            $platform = $input['platform'] ?? ($_GET['platform'] ?? 'whatsapp');
            $networkId = (int)($input['network_id'] ?? ($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_GET['network_id'] ?? 0)));
            $res = $service->handleChatbotMessage($msg, $phone, $platform, $networkId);
            if (isset($res['response']) && !isset($res['reply'])) {
                $res['reply'] = $res['response'];
            }
            jsonResponse(array_merge(['success' => true], $res));
            break;

        case 'get_chatbot_rules':
            jsonResponse(['success' => true, 'rules' => $service->getChatbotRules()]);
            break;

        case 'save_chatbot_rule':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->saveChatbotRule($input));
            break;

        case 'delete_chatbot_rule':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->deleteChatbotRule((int)($input['id'] ?? $_GET['id'] ?? 0)));
            break;

        case 'toggle_chatbot_rule':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            jsonResponse($service->toggleChatbotRule((int)($input['id'] ?? 0), !empty($input['is_active'])));
            break;

        case 'dispatch_queue_now':
            jsonResponse($service->dispatchQueueNow());
            break;

        case 'approve_all_queue':
            jsonResponse($service->approveAllQueue());
            break;

        case 'test_chatbot_query':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $msg = $input['message'] ?? ($input['query'] ?? ($_GET['message'] ?? ''));

            $phone = $input['phone'] ?? ($_GET['phone'] ?? '');

            $res = $service->handleChatbotMessage($msg, $phone, 'simulator');

            jsonResponse(array_merge(['success' => true], $res));

            break;





        

        // --- NOC MONITORING ---

        case 'get_noc_dashboard':

            jsonResponse($service->getNocDashboard());

            break;



        // --- BACKUPS & RESTORE ---

        
        case 'get_cloud_backup_settings':
            require_once __DIR__ . '/includes/CloudBackupService.php';
            $cbs = new CloudBackupService(getDB(), $service);
            jsonResponse(['success' => true, 'settings' => $cbs->getSettings()]);
            break;

        case 'save_cloud_backup_settings':
            require_once __DIR__ . '/includes/CloudBackupService.php';
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $cbs = new CloudBackupService(getDB(), $service);
            jsonResponse($cbs->saveSettings($input));
            break;

        case 'test_cloud_backup_telegram':
            require_once __DIR__ . '/includes/CloudBackupService.php';
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $cbs = new CloudBackupService(getDB(), $service);
            jsonResponse($cbs->testTelegramConnection(!empty($input['telegram']) ? $input['telegram'] : null));
            break;

        case 'test_cloud_backup_sftp':
            require_once __DIR__ . '/includes/CloudBackupService.php';
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $cbs = new CloudBackupService(getDB(), $service);
            jsonResponse($cbs->testSftpConnection(!empty($input['sftp']) ? $input['sftp'] : null));
            break;

        case 'upload_backup_to_cloud':
            require_once __DIR__ . '/includes/CloudBackupService.php';
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $filename = basename((string)($input['file'] ?? $_GET['file'] ?? ''));
            $filepath = "/var/backups/mikrotik-usermanager/{$filename}";
            $cbs = new CloudBackupService(getDB(), $service);
            jsonResponse($cbs->syncBackupToCloud($filepath, $filename));
            break;

        case 'create_backup':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $targetNetId = isset($input['network_id']) ? (int)$input['network_id'] : (isset($_GET['network_id']) ? (int)$_GET['network_id'] : null);
            $forceFull = !empty($input['force_full']) || !empty($_GET['force_full']);
            jsonResponse($service->createDatabaseBackup($targetNetId, $forceFull));
            break;

        case 'list_backups':
            $targetNetId = isset($_GET['network_id']) ? (int)$_GET['network_id'] : null;
            jsonResponse($service->listBackups($targetNetId));
            break;

        case 'download_backup':
            $file = basename($_GET['file'] ?? '');
            $path = "/var/backups/mikrotik-usermanager/{$file}";
            if (file_exists($path) && is_file($path)) {
                $ctx = $service->getActiveAdminContext();
                $callerRole = (string)($ctx['role'] ?? '');
                $isSystemOwner = !empty($_SESSION['system_owner_authenticated']) || $callerRole === 'system_owner' || (int)$ctx['id'] === 1;
                $activeNetId = (int)($ctx['active_network_id'] ?? 0);

                if (preg_match('/^network_(\d+)_backup_/', $file, $m)) {
                    $fileNetId = (int)$m[1];
                    if (!$isSystemOwner && $fileNetId !== $activeNetId) {
                        http_response_code(403);
                        die("غير مصرح بتحميل نسخة شبكة أخرى");
                    }
                } elseif (!$isSystemOwner) {
                    http_response_code(403);
                    die("تحميل النسخة الشاملة متاح لمالك النظام فقط");
                }

                while (ob_get_level()) { ob_end_clean(); }
                header('Content-Description: File Transfer');
                header('Content-Type: application/x-gzip');
                header('Content-Disposition: attachment; filename="' . $file . '"');
                header('Content-Transfer-Encoding: binary');
                header('Expires: 0');
                header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
                header('Pragma: public');
                header('Content-Length: ' . filesize($path));
                readfile($path);
                exit;
            }
            header("HTTP/1.0 404 Not Found");
            echo "الملف غير موجود على السيرفر";
            exit;

        case 'restore_backup':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $file = (string)($input['file'] ?? ($_GET['file'] ?? ''));

            jsonResponse($service->restoreDatabaseBackup($file));

            break;

        case 'delete_backup':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $file = (string)($input['file'] ?? ($_GET['file'] ?? ''));

            jsonResponse($service->deleteBackupFile($file));

            break;

        case 'upload_backup':

            if (!isset($_FILES['backup_file']) || $_FILES['backup_file']['error'] !== UPLOAD_ERR_OK) {

                jsonResponse(['success' => false, 'error' => 'يرجى اختيار ملف نسخة احتياطية صالح']);

                break;

            }

            $origName = basename($_FILES['backup_file']['name']);

            if (!preg_match('/\.(sql|sql\.gz|gz)$/i', $origName)) {

                jsonResponse(['success' => false, 'error' => 'نوع الملف غير مدعوم. يجب أن يكون .sql أو .sql.gz']);

                break;

            }

            $backupDir = '/var/backups/mikrotik-usermanager';

            if (!is_dir($backupDir)) @mkdir($backupDir, 0775, true);

            $dest = $backupDir . '/' . $origName;

            if (move_uploaded_file($_FILES['backup_file']['tmp_name'], $dest)) {

                jsonResponse(['success' => true, 'message' => 'تم رفع ملف النسخة الاحتياطية بنجاح', 'filename' => $origName]);

            } else {

                jsonResponse(['success' => false, 'error' => 'فشل حفظ الملف على السيرفر']);

            }

            break;



        // --- ALERTS & SYSTEM ACTIVITY LOGS ---

        case 'get_system_alerts_summary':

            jsonResponse($service->getSystemAlertsSummary());

            break;

        case 'get_alert_settings':

            jsonResponse($service->getAlertSettings());

            break;

                case 'reset_financial_system':

            $ownerCheck = getDB()->prepare('SELECT COUNT(*) FROM um_system_owners WHERE admin_id = ?');

            $ownerCheck->execute([$currentAdminId]);

            if (!(bool)$ownerCheck->fetchColumn()) throw new Exception('تصفير الحسابات متاح لمالك النظام فقط');

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            if (($input['confirmation'] ?? '') !== 'تصفير الحسابات') throw new Exception('عبارة تأكيد تصفير الحسابات غير صحيحة');

            $adminId = (int)($_SESSION['admin_id'] ?? 1);

            jsonResponse($service->resetFinancialSystem($input, $adminId));

            break;

        case 'save_alert_settings':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveAlertSettings($input));

            break;

        case 'get_activity_logs':

            jsonResponse($service->getActivityLogs($_GET ?: $_POST));

            break;

        case 'export_activity_logs':

            $res = $service->getActivityLogs(['limit' => 2000]);

            $logs = $res['logs'] ?? [];

            header('Content-Type: text/csv; charset=utf-8');

            header('Content-Disposition: attachment; filename="system_activity_logs_' . date('Y-m-d_H-i') . '.csv"');

            $out = fopen('php://output', 'w');

            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($out, ['#', 'المستخدم المنفذ', 'نوع العملية', 'التصنيف', 'عنوان العملية', 'التفاصيل', 'عنوان IP', 'الحالة', 'الوقت والتاريخ']);

            foreach ($logs as $l) {

                fputcsv($out, [

                    $l['id'],

                    $l['admin_name'] ?: 'System',

                    $l['action_type'],

                    $l['action_category'],

                    $l['action_title'],

                    $l['details'],

                    $l['ip_address'],

                    $l['status'],

                    $l['created_at']

                ]);

            }

            fclose($out);

            exit;



        

        // --- USERS & CARDS BULK ACTIONS ---

        case 'get_batches':

            jsonResponse(['success' => true, 'data' => $service->getBatches()]);

            break;

        case 'get_user_kpis':

            $search = $_GET['search'] ?? '';

            $profile = $_GET['profile'] ?? '';

            $ownerId = $_GET['owner_id'] ?? null;

            $batchId = $_GET['batch_id'] ?? '';
            $cardKind = $_GET['card_kind'] ?? '';

            jsonResponse(['success' => true, 'data' => $service->getUserStatsKPIs($search, $profile, $ownerId, $batchId, $cardKind)]);

            break;

        case 'reset_users_usage':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->resetUsersUsage(is_array($input['usernames'] ?? null) ? $input['usernames'] : (isset($_GET['usernames']) ? explode(',', $_GET['usernames']) : [])));

            break;

        case 'change_users_profile':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->changeUsersProfile(is_array($input['usernames'] ?? null) ? $input['usernames'] : (isset($_GET['usernames']) ? explode(',', $_GET['usernames']) : []), $input['profile'] ?? ($_GET['profile'] ?? ''), !empty($input['reset_usage'])));

            break;

        case 'renew_users_validity':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->renewUsersValidity(is_array($input['usernames'] ?? null) ? $input['usernames'] : (isset($_GET['usernames']) ? explode(',', $_GET['usernames']) : []), (int)($input['days'] ?? ($_GET['days'] ?? 30))));

            break;

        case 'set_users_batch_status':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->setUsersBatchStatus(is_array($input['usernames'] ?? null) ? $input['usernames'] : (isset($_GET['usernames']) ? explode(',', $_GET['usernames']) : []), $input['status'] ?? ($_GET['status'] ?? 'active')));

            break;





        // ========== NETWORKS & MULTI-PARTNERSHIP CAPITAL ==========

        case 'get_networks':
            $statusFilter = $_GET['status'] ?? 'all';
            $networkScope = (string)($_GET['scope'] ?? '');
            $networkContext = legacyAuthorizationContext();
            $userRole = (string)$networkContext->role();

            if ($userRole === 'system_owner') {
                if ($networkScope === 'active') {
                    $networkScopeId = $networkContext->activeNetworkId();
                } else {
                    $networkScopeId = 0;
                }
            } else {
                $allowedIds = $networkContext->allowedNetworkIds();
                if (empty($allowedIds) && $networkContext->activeNetworkId() > 0) {
                    $allowedIds = [$networkContext->activeNetworkId()];
                }
                if ($networkScope === 'active') {
                    $activeId = $networkContext->activeNetworkId();
                    $networkScopeId = in_array($activeId, $allowedIds, true) ? [$activeId] : $allowedIds;
                } else {
                    $networkScopeId = $allowedIds;
                }
            }

            jsonResponse($service->getNetworks($statusFilter, $networkScopeId));
            break;

        case 'get_network_manager_candidates':
            $isOwner = ((int)($_SESSION['admin_id'] ?? 0) === 1 || (string)($_SESSION['role'] ?? '') === 'system_owner');
            if (!$isOwner) {
                jsonResponse(['success' => false, 'error' => 'غير مصرح: اختيار مدير الشبكة مخصص لمالك النظام'], 403);
            }
            $candidateStmt = $db->query("SELECT a.id, a.username, a.fullname, a.role
                FROM um_admins a
                WHERE a.is_active=1
                ORDER BY (a.id = 1 OR a.role = 'system_owner') DESC, a.fullname ASC, a.id ASC");
            $candidates = $candidateStmt ? ($candidateStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            jsonResponse(['success' => true, 'admins' => $candidates]);
            break;

        case 'save_network':
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $targetNetworkId = (int)($input['id'] ?? 0);
            if (!$isSystemOwner) {
                if ($targetNetworkId <= 0) {
                    jsonResponse(['success' => false, 'error' => 'إنشاء شبكة جديدة مخصص لمالك النظام فقط'], 403);
                }
                if (!in_array($requestAuthorizationContext->role(), ['network_manager','admin','superadmin'], true)) {
                    jsonResponse(['success' => false, 'error' => 'غير مصرح بتعديل بيانات الشبكة'], 403);
                }
                $requestAuthorizationContext->assertCanAccessNetwork($targetNetworkId);
                if ($targetNetworkId !== $requestAuthorizationContext->activeNetworkId()) {
                    jsonResponse(['success' => false, 'error' => 'FORBIDDEN_NETWORK'], 403);
                }
                $input['manager_admin_id'] = (int)($input['manager_admin_id'] ?? $currentAdminId);
            }
            jsonResponse($service->saveNetwork($input, $currentAdminId));

            break;

        case 'delete_network':

            if (!$isSystemOwner) {

                jsonResponse(['success' => false, 'error' => 'غير مصرح: حذف الشبكات والفروع مخصص فقط للمدير العام المالك للنظام'], 403);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->deleteNetwork((int)($input['id'] ?? $_GET['id'] ?? 0)));

            break;

        case 'save_network_partner':

            if (!$isSystemOwner) {

                jsonResponse(['success' => false, 'error' => 'غير مصرح: إضافة وتعديل شركاء الشبكة مخصص فقط للمدير العام'], 403);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->saveNetworkPartner($input));

            break;

        case 'remove_network_partner':

            if (!$isSystemOwner) {

                jsonResponse(['success' => false, 'error' => 'غير مصرح: إزالة شركاء الشبكة مخصص فقط للمدير العام'], 403);

            }

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            jsonResponse($service->removeNetworkPartner(

                (int)($input['network_id'] ?? 0),

                (int)($input['partner_id'] ?? 0)

            ));

            break;

        case 'assign_asset_network':

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $assetContext = legacyAuthorizationContext();
            if (!$isSystemOwner || $assetContext->role() !== 'system_owner') {
                $assetContext->audit('asset.network.assign', 'deny', 'asset', (int)($input['asset_id'] ?? 0), 'owner_only');
                throw new DomainException('FORBIDDEN');
            }
            $assetId = (int)($input['asset_id'] ?? 0);
            if ($assetId <= 0) throw new DomainException('INVALID_ASSET');
            $assetContext->assertCanAccessAsset($assetId);
            $targetNetworkId = $assetContext->activeNetworkId();
            if (isset($input['network_id']) && $input['network_id'] !== '' && (int)$input['network_id'] !== $targetNetworkId) {
                throw new DomainException('FORBIDDEN_NETWORK');
            }

            jsonResponse($service->assignAssetToNetwork(

                $assetId,

                $targetNetworkId

            ));

            break;

        case 'get_partner_capital_summary':
            if (!$isSystemOwner) throw new DomainException('FORBIDDEN');
            jsonResponse($service->getPartnerCapitalSummary());
            break;

        // ========== HOTSPOT STUDIO & CENTRAL CAPTIVE PORTAL ==========
        case 'get_hotspot_studio_data':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? $_POST['network_id'] ?? ($_SESSION['network_id'] ?? 1));
            jsonResponse(array_merge(['success' => true], $hsService->getStudioData($netId)));
            break;

        case 'save_hotspot_studio_settings':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $netId = (int)($input['network_id'] ?? ($_SESSION['network_id'] ?? 1));
            $adminId = (int)($_SESSION['admin_id'] ?? 1);
            jsonResponse($hsService->saveStudioSettings($netId, $input, $adminId));
            break;

        case 'deploy_hotspot_template':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $routerId = (int)($input['router_id'] ?? 0);
            $netId = (int)($input['network_id'] ?? 0);
            $isRedirect = !empty($input['is_external_redirect']);
            $portalUrl = trim((string)($input['server_portal_url'] ?? ''));

            if ($routerId <= 0) {
                jsonResponse(['success' => false, 'error' => 'يرجى تحديد الراوتر المراد تثبيت القالب عليه'], 400);
            }

            if ($isRedirect) {
                $stmt = $db->prepare("SELECT * FROM nas WHERE id = ?");
                $stmt->execute([$routerId]);
                $r = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$r) jsonResponse(['success' => false, 'error' => 'الراوتر غير موجود'], 404);
                $rNetId = (int)$r['network_id'];
                $bundle = $hsService->buildExternalRedirectBundle($rNetId, $portalUrl);
                jsonResponse($hsService->deployBundleToRouter($routerId, $bundle));
            } else {
                jsonResponse($hsService->deployToRouter($routerId, $netId));
            }
            break;

        case 'fast_sync_router_hotspot_settings':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $routerId = (int)($input['router_id'] ?? 0);
            if ($routerId <= 0) {
                jsonResponse(['success' => false, 'error' => 'يرجى تحديد الراوتر لتحديث الإعدادات'], 400);
            }
            jsonResponse($hsService->deploySettingApiOnly($routerId));
            break;

        case 'get_hotspot_walled_garden_script':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $serverHost = trim((string)($_GET['host'] ?? ($_SERVER['HTTP_HOST'] ?? '192.168.3.2')));
            $serverIp = trim((string)($_GET['ip'] ?? ''));
            $script = $hsService->generateWalledGardenScript($serverHost, $serverIp);
            jsonResponse(['success' => true, 'script' => $script]);
            break;

        case 'get_hotspot_sync_script':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? ($_SESSION['network_id'] ?? 1));
            $serverHost = trim((string)($_GET['host'] ?? ($_SERVER['HTTP_HOST'] ?? '192.168.3.2')));
            $hotspotDir = trim((string)($_GET['hotspot_dir'] ?? 'hotspot'));
            $script = $hsService->generateRouterSyncScript($netId, $serverHost, $hotspotDir);
            jsonResponse(['success' => true, 'script' => $script]);
            break;

        case 'download_hotspot_bundle':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? ($_SESSION['network_id'] ?? 1));
            $isRedirect = !empty($_GET['is_external_redirect']);
            $portalUrl = trim((string)($_GET['server_portal_url'] ?? ''));
            try {
                $zipPath = $hsService->createZipBundle($netId, $isRedirect, $portalUrl);
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="hotspot_bundle_net' . $netId . '.zip"');
                header('Content-Length: ' . filesize($zipPath));
                readfile($zipPath);
                @unlink($zipPath);
                exit;
            } catch (Throwable $e) {
                jsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
            }
            break;

        case 'preview_hotspot_page':
            require_once __DIR__ . '/includes/HotspotTemplateService.php';
            $hsService = new HotspotTemplateService($db);
            $netId = (int)($_GET['network_id'] ?? ($_SESSION['network_id'] ?? 1));
            $pageType = (string)($_GET['type'] ?? 'login');
            $data = $hsService->getStudioData($netId);
            $settings = $data['settings'];
            $packages = !empty($settings['packages_config']['package_items']) 
                ? $settings['packages_config']['package_items'] 
                : $data['db_packages'];

            header('Content-Type: text/html; charset=utf-8');
            if ($pageType === 'status') {
                echo $hsService->buildStatusHtml($settings);
            } else {
                echo $hsService->buildLoginHtml($settings, $packages);
            }
            exit;

        default:

            jsonResponse(['error' => 'Unknown action: ' . $action], 400);

    }

} catch (UserManagerRouterTransferException $e) {
    $requestId = bin2hex(random_bytes(6));
    error_log('API router transfer error request_id=' . $requestId . ' action=' . (string)$action . ' message=' . $e->getMessage());
    jsonResponse(['success'=>false,'error'=>'فشل النقل من الراوتر: ' . $e->getMessage(),'code'=>$e->publicCode,'request_id'=>$requestId], 502);
} catch (\NetworkSubscriptionException $e) {
    jsonResponse($e->payload(), $e->httpStatus());
} catch (\DomainException $e) {
    $key = $e->getMessage();
    $authErrors = ['AUTH_REQUIRED','ACCOUNT_DISABLED','TOKEN_INVALID','TOKEN_REVOKED','TOKEN_EXPIRED','TOKEN_MISSING'];
    $forbiddenErrors = ['FORBIDDEN','FORBIDDEN_SCOPE','FORBIDDEN_NETWORK','NETWORK_CONTEXT_REQUIRED','PERMISSION_DENIED'];
    $status = in_array($key, $authErrors, true) ? 401 : (in_array($key, $forbiddenErrors, true) ? 403 : 409);
    $message = $status === 401 ? 'يلزم تسجيل الدخول' : ($status === 403 ? 'غير مصرح بهذه العملية' : 'تعذر تنفيذ العملية بالحالة الحالية');
    jsonResponse(['success'=>false,'error'=>$message,'code'=>$key], $status);
} catch (\InvalidArgumentException $e) {
    jsonResponse(['success'=>false,'error'=>'بيانات الطلب غير صحيحة','code'=>$e->getMessage()], 400);
} catch (\Exception $e) {
    $msg = $e->getMessage();
    if ($msg !== '' && !str_starts_with($msg, 'SQLSTATE') && !str_contains($msg, 'PDOException') && !str_contains($msg, 'Call to undefined')) {
        jsonResponse(['success' => false, 'error' => $msg, 'code' => 'OPERATION_FAILED'], 400);
    }
    $requestId = bin2hex(random_bytes(6));
    error_log('API Exception request_id=' . $requestId . ' action=' . (string)$action . ' message=' . $msg . ' file=' . $e->getFile() . ':' . $e->getLine());
    jsonResponse(['success' => false, 'error' => 'تعذر تنفيذ العملية. رقم المرجع: ' . $requestId, 'code' => 'INTERNAL_ERROR', 'request_id' => $requestId], 500);
} catch (\Throwable $e) {
    $requestId = bin2hex(random_bytes(6));
    error_log('API internal error request_id=' . $requestId . ' action=' . (string)$action . ' class=' . get_class($e) . ' message=' . $e->getMessage() . ' file=' . $e->getFile() . ':' . $e->getLine());
    jsonResponse(['success'=>false,'error'=>'تعذر تنفيذ العملية. رقم المرجع: ' . $requestId,'code'=>'INTERNAL_ERROR','request_id'=>$requestId], 500);
}
