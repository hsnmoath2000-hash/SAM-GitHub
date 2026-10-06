<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/RouterOSApi.php';
require_once __DIR__ . '/NetworkSubscriptionService.php';

/**
 * RouterRadiusService - Specialized Domain Service for FreeRADIUS, MikroTik RouterOS API, CoA, Hotspot & Subscribers
 */
class RouterRadiusService extends BaseService {

    /** Normalize the router's operational responsibilities.  The value is
     * stored as a stable comma-separated set so one MikroTik can serve one or
     * more roles without making the RADIUS/NAS type column ambiguous.
     */
    private function normalizeWorkTypes($value): string {
        $raw = is_array($value) ? $value : preg_split('/[,|\s]+/', (string)$value, -1, PREG_SPLIT_NO_EMPTY);
        $aliases = [
            'hotspot' => 'hotspot', 'hotspot_users' => 'hotspot', 'هوتسبوت' => 'hotspot',
            'usermanager' => 'usermanager', 'user_manager' => 'usermanager', 'user-manager' => 'usermanager', 'يوزرمانجر' => 'usermanager',
            'line_bonding' => 'line_bonding', 'line-bonding' => 'line_bonding', 'load_balance' => 'line_bonding', 'دمج' => 'line_bonding', 'دمج_خطوط' => 'line_bonding'
        ];
        $out = [];
        foreach ($raw as $item) {
            $key = strtolower(trim((string)$item));
            if (isset($aliases[$key])) $out[$aliases[$key]] = true;
        }
        // A missing selection is safe Hotspot-only.  User Manager is a
        // network-wide singleton and must be chosen explicitly in the UI.
        if (!$out) {
            $out = ['hotspot' => true];
        }
        return implode(',', array_keys($out));
    }

    /** Return true when a normalized work-type set owns the network User Manager role. */
    private function hasUserManagerWorkType(string $workTypes): bool {
        return in_array('usermanager', array_filter(array_map('trim', explode(',', strtolower($workTypes)))), true);
    }

    /**
     * Find the single User Manager router assigned to a network.  The caller
     * may exclude the router currently being edited because a router cannot be
     * its own failover target.
     */
    private function findNetworkUserManagerRouter(int $networkId, int $excludeRouterId = 0): ?array {
        $sql = "SELECT id, nasname, secret, shortname
                FROM nas
                WHERE network_id = :network_id
                  AND id <> :exclude_id
                  AND FIND_IN_SET('usermanager', COALESCE(work_types, 'hotspot')) > 0
                ORDER BY id ASC
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':network_id' => $networkId, ':exclude_id' => $excludeRouterId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$router || !filter_var((string)$router['nasname'], FILTER_VALIDATE_IP)) return null;
        return $router;
    }

    /** Enforce the one-User-Manager-router-per-network invariant server-side. */
    private function assertSingleUserManagerRouter(int $networkId, int $currentRouterId, string $workTypes): void {
        if (!$this->hasUserManagerWorkType($workTypes)) return;
        $stmt = $this->db->prepare("SELECT id, shortname FROM nas
            WHERE network_id = ? AND id <> ?
              AND FIND_IN_SET('usermanager', COALESCE(work_types, 'hotspot')) > 0
            ORDER BY id ASC LIMIT 1");
        $stmt->execute([$networkId, $currentRouterId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            $name = trim((string)($existing['shortname'] ?? ''));
            throw new InvalidArgumentException('لا يمكن تعيين أكثر من راوتر User Manager واحد داخل الشبكة نفسها' . ($name !== '' ? '؛ الراوتر المعيّن حاليًا هو: ' . $name : ''));
        }
    }

    private function resolveProxyRouter(int $routerId, int $networkId, int $currentRouterId = 0): ?array {
        if ($routerId <= 0) return null;
        if ($routerId === $currentRouterId) throw new InvalidArgumentException('لا يمكن اختيار الراوتر نفسه كيوزرمانجر احتياطي');
        $stmt = $this->db->prepare("SELECT id, nasname, secret, shortname FROM nas
            WHERE id=? AND network_id=?
              AND FIND_IN_SET('usermanager', COALESCE(work_types, 'hotspot')) > 0
            LIMIT 1");
        $stmt->execute([$routerId, $networkId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$router || !filter_var((string)$router['nasname'], FILTER_VALIDATE_IP)) {
            throw new InvalidArgumentException('اختر راوتر User Manager صالحًا من الشبكة النشطة فقط للـUser Manager الاحتياطي');
        }
        return $router;
    }

    public function generateMikrotikScript($routerId, array $options = []): array {
        if ($this->radius && isset($this->radius->networkTopology)) {
            return $this->radius->networkTopology->generateMikrotikScript($routerId, $options);
        }
        return ['success' => true, 'script' => null, 'warning' => 'تم إنشاء الراوتر، وخدمة توليد السكربت غير مهيأة في هذا السياق'];
    }

    private function writeSstpIdentityRows(int $networkId, string $username, string $password, string $vpnIp): void {
        $attributes = ['Framed-IP-Address', 'Framed-IP-Netmask', 'Service-Type', 'Framed-Protocol'];
        $deleteCheck = $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username=? AND attribute IN ('Cleartext-Password','Auth-Type')");
        $deleteCheck->execute([$networkId, $username]);
        $insertCheck = $this->db->prepare("INSERT INTO radcheck (network_id,username,attribute,op,value) VALUES (?,?,'Cleartext-Password',':=',?)");
        $insertCheck->execute([$networkId, $username, $password]);
        $marks = implode(',', array_fill(0, count($attributes), '?'));
        $deleteReply = $this->db->prepare("DELETE FROM radreply WHERE network_id=? AND username=? AND attribute IN ($marks)");
        $deleteReply->execute(array_merge([$networkId, $username], $attributes));
        $insertReply = $this->db->prepare("INSERT INTO radreply (network_id,username,attribute,op,value) VALUES (?,?,?,':=',?)");
        foreach ([
            'Framed-IP-Address' => $vpnIp,
            'Framed-IP-Netmask' => '255.255.255.255',
            'Service-Type' => 'Framed-User',
            'Framed-Protocol' => 'PPP',
        ] as $attribute => $value) {
            $insertReply->execute([$networkId, $username, $attribute, $value]);
        }
    }

    // ==========================================
    // METHOD: getRouters
    // ==========================================
    public function getRouters() {
        $this->ensureNasProxyColumns();
        $networkId = $this->getActiveNetworkId();
        $sql = "SELECT n.id, n.nasname, n.shortname, n.type, n.ports, n.server, n.community,
                       n.description, n.api_user, n.api_password, n.api_port, n.www_port, n.winbox_port, n.winbox_listen_port, n.api_listen_port, n.api_ssl, n.api_enabled, n.ftp_port, n.hotspot_dir, n.last_sync_time,
                       COALESCE(n.work_types, 'hotspot') AS work_types,
                       CASE WHEN proxy_router.id IS NULL THEN 0 ELSE COALESCE(n.um_proxy_enabled, 0) END AS um_proxy_enabled,
                       proxy_router.id AS um_proxy_router_id,
                       CASE WHEN proxy_router.id IS NULL THEN NULL ELSE n.um_proxy_ip END AS um_proxy_ip,
                       CASE WHEN proxy_router.id IS NULL THEN NULL ELSE n.um_proxy_secret END AS um_proxy_secret,
                       COALESCE(n.um_proxy_auth_port, 1812) AS um_proxy_auth_port,
                       COALESCE(n.um_proxy_acct_port, 1813) AS um_proxy_acct_port,
                       CONCAT('router_', n.id) AS sstp_username,
                       CONCAT('10.101.0.', n.id) AS sstp_ip,
                       (SELECT value FROM radcheck rc WHERE rc.username = CONCAT('router_', n.id) AND rc.network_id=n.network_id AND rc.attribute = 'Cleartext-Password' ORDER BY id DESC LIMIT 1) AS sstp_password,
                       EXISTS(
                           SELECT 1 FROM radcheck rc
                           WHERE rc.username = CONCAT('router_', n.id) AND rc.network_id=n.network_id
                             AND rc.attribute = 'Cleartext-Password'
                       ) AS sstp_ready,
                       COALESCE(act.active_sessions, 0) AS active_sessions,
                       COALESCE(act.today_bytes, 0) AS today_bytes,
                       COALESCE(act.today_download, 0) AS today_download,
                       COALESCE(act.today_upload, 0) AS today_upload,
                       COALESCE(act.total_bytes, 0) AS total_bytes,
                       COALESCE(act.total_sessions, 0) AS total_sessions,
                       act.last_activity
                FROM nas n
                LEFT JOIN nas proxy_router
                  ON proxy_router.id = n.um_proxy_router_id
                 AND proxy_router.network_id = n.network_id
                 AND proxy_router.id <> n.id
                 AND FIND_IN_SET('usermanager', COALESCE(proxy_router.work_types, 'hotspot')) > 0
                LEFT JOIN (
                    SELECT nasipaddress,
                           COUNT(CASE WHEN acctstoptime IS NULL THEN 1 END) AS active_sessions,
                           SUM(CASE WHEN DATE(acctstarttime) = CURDATE() OR DATE(acctstoptime) = CURDATE() OR (acctstoptime IS NULL AND acctupdatetime >= CURDATE()) THEN (acctinputoctets + acctoutputoctets) ELSE 0 END) AS today_bytes,
                           SUM(CASE WHEN DATE(acctstarttime) = CURDATE() OR DATE(acctstoptime) = CURDATE() OR (acctstoptime IS NULL AND acctupdatetime >= CURDATE()) THEN acctoutputoctets ELSE 0 END) AS today_download,
                           SUM(CASE WHEN DATE(acctstarttime) = CURDATE() OR DATE(acctstoptime) = CURDATE() OR (acctstoptime IS NULL AND acctupdatetime >= CURDATE()) THEN acctinputoctets ELSE 0 END) AS today_upload,
                           SUM(acctinputoctets + acctoutputoctets) AS total_bytes,
                           COUNT(*) AS total_sessions,
                           MAX(COALESCE(acctstoptime, acctupdatetime, acctstarttime)) AS last_activity
                    FROM radacct
                    WHERE network_id = :activity_network
                    GROUP BY nasipaddress
                ) act ON (n.nasname = act.nasipaddress OR act.nasipaddress = CONCAT('10.101.0.', n.id))
                WHERE n.network_id = :router_network
                ORDER BY n.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':activity_network'=>$networkId, ':router_network'=>$networkId]);
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: addRouter
    // ==========================================
    public function addRouter($data) {
        $this->ensureNasProxyColumns();
        $shortname = trim((string)($data['shortname'] ?? ''));
        if ($shortname === '') throw new InvalidArgumentException('اسم الجهاز مطلوب');
        if (mb_strlen($shortname) > 64) throw new InvalidArgumentException('اسم الجهاز طويل جدًا');
        $networkId = $this->getActiveNetworkId();
        $exists = $this->db->prepare('SELECT id FROM nas WHERE shortname = ? AND network_id=? LIMIT 1');
        $exists->execute([$shortname,$networkId]);
        if ($exists->fetchColumn()) throw new InvalidArgumentException('يوجد جهاز بنفس الاسم');
        // CoA, SSTP password and the RADIUS shared secret are platform-owned
        // values.  Never accept browser-provided replacements.
        $ports = DEFAULT_COA_PORT;
        $sstpPass = bin2hex(random_bytes(16));
        $secret = bin2hex(random_bytes(24));
        $workTypes = $this->normalizeWorkTypes($data['work_types'] ?? null);
        $isUserManager = $this->hasUserManagerWorkType($workTypes);
        $this->assertSingleUserManagerRouter($networkId, 0, $workTypes);
        $description = trim((string)($data['description'] ?? 'MikroTik via accel-ppp SSTP'));
        $pendingNas = 'pending-' . bin2hex(random_bytes(8));

        $umProxyEnabled = !empty($data['um_proxy_enabled']) && $data['um_proxy_enabled'] !== 'false' && $data['um_proxy_enabled'] !== '0' ? 1 : 0;
        $umProxyRouterId = (int)($data['um_proxy_router_id'] ?? 0);
        // The User Manager router is the primary node, not its own failover.
        // For every other router, an empty selection resolves to the network's
        // single User Manager router automatically.
        if ($isUserManager) {
            $umProxyEnabled = 0;
            $umProxyRouterId = 0;
        } elseif ($umProxyEnabled && $umProxyRouterId <= 0) {
            $autoProxy = $this->findNetworkUserManagerRouter($networkId);
            $umProxyRouterId = (int)($autoProxy['id'] ?? 0);
        }
        $proxyRouter = $umProxyEnabled ? $this->resolveProxyRouter($umProxyRouterId, $networkId) : null;
        if ($umProxyEnabled && !$proxyRouter) throw new InvalidArgumentException('اختر راوترًا من الشبكة نفسها للـUser Manager الاحتياطي');
        $umProxyIp = $proxyRouter ? (string)$proxyRouter['nasname'] : null;
        $umProxySecret = $proxyRouter ? (string)$proxyRouter['secret'] : null;
        $umProxyAuthPort = !empty($data['um_proxy_auth_port']) ? (int)$data['um_proxy_auth_port'] : 1812;
        $umProxyAcctPort = !empty($data['um_proxy_acct_port']) ? (int)$data['um_proxy_acct_port'] : 1813;

        require_once __DIR__ . '/RadiusClientRuntime.php';
        samRadiusClientRuntime('probe');
        $this->db->beginTransaction();
        try {
            $subscriptionUsage = (new NetworkSubscriptionService($this->db))->lockRouterCapacity($networkId, (int)($_SESSION['admin_id'] ?? 0));
            $stmt = $this->db->prepare("INSERT INTO nas (network_id, nasname, shortname, type, work_types, ports, secret, server, community, description, api_user, api_password, api_port, www_port, api_ssl, api_enabled, ftp_port, hotspot_dir, um_proxy_enabled, um_proxy_router_id, um_proxy_ip, um_proxy_secret, um_proxy_auth_port, um_proxy_acct_port) VALUES (:network_id, :nasname, :shortname, 'mikrotik', :work_types, :ports, :secret, NULL, NULL, :description, :api_user, :api_password, :api_port, :www_port, :api_ssl, :api_enabled, :ftp_port, :hotspot_dir, :um_proxy_enabled, :um_proxy_router_id, :um_proxy_ip, :um_proxy_secret, :um_proxy_auth_port, :um_proxy_acct_port)");
            $apiUser = trim((string)($data['api_user'] ?? 'admin')) ?: 'admin';
            $apiPass = (string)($data['api_password'] ?? '');
            $apiPort = (int)($data['api_port'] ?? 8728) ?: 8728;
            $wwwPort = (int)($data['www_port'] ?? $apiPort) ?: $apiPort;
            $apiSsl = !empty($data['api_ssl']) ? 1 : 0;
            $apiEnabled = isset($data['api_enabled']) ? (int)$data['api_enabled'] : 1;
            $ftpPort = (int)($data['ftp_port'] ?? 21) ?: 21;
            $hotspotDir = trim((string)($data['hotspot_dir'] ?? 'hotspot')) ?: 'hotspot';
            $stmt->execute([
                ':network_id'=>$networkId, ':nasname'=>$pendingNas, ':shortname'=>$shortname,
                ':work_types'=>$workTypes, ':ports'=>$ports, ':secret'=>$secret,
                ':description'=>$description, ':api_user'=>$apiUser, ':api_password'=>$apiPass,
                ':api_port'=>$apiPort, ':www_port'=>$wwwPort, ':api_ssl'=>$apiSsl, ':api_enabled'=>$apiEnabled,
                ':ftp_port'=>$ftpPort, ':hotspot_dir'=>$hotspotDir, ':um_proxy_enabled'=>$umProxyEnabled,
                ':um_proxy_router_id'=>$umProxyRouterId ?: null, ':um_proxy_ip'=>$umProxyIp,
                ':um_proxy_secret'=>$umProxySecret, ':um_proxy_auth_port'=>$umProxyAuthPort,
                ':um_proxy_acct_port'=>$umProxyAcctPort
            ]);
            $id = (int)$this->db->lastInsertId();
            if ($id < 2 || $id > 250) {
                throw new RuntimeException('لا يمكن تخصيص عنوان SSTP: رقم الجهاز خارج النطاق 2-250');
            }
            $vpnUser = 'router_' . $id;
            $vpnIp = '10.101.0.' . $id;
            $vpnPassword = $sstpPass;
            $winboxPort = !empty($data['winbox_port']) ? (int)$data['winbox_port'] : 8291;
            $winboxListenPort = !empty($data['winbox_listen_port']) ? (int)$data['winbox_listen_port'] : (8220 + $id);
            $apiListenPort = !empty($data['api_listen_port']) ? (int)$data['api_listen_port'] : (8720 + $id);

            $updateNas = $this->db->prepare('UPDATE nas SET nasname = ?, winbox_port = ?, winbox_listen_port = ?, api_listen_port = ? WHERE id = ? AND network_id=?');
            $updateNas->execute([$vpnIp, $winboxPort, $winboxListenPort, $apiListenPort, $id, $networkId]);
            $this->writeSstpIdentityRows($networkId, $vpnUser, $vpnPassword, $vpnIp);
            $this->db->commit();
            $radiusClient = samRadiusClientRuntime('sync', $id);

            // Sync dual port forwarding rules in iptables
            $this->syncRouterPortForwardingRules($id, $shortname, $networkId, $winboxListenPort, $winboxPort, $apiListenPort, $wwwPort);

            if ($umProxyEnabled) {
                $this->rebuildProxyConfiguration();
            }

            $result = $this->generateMikrotikScript($id);
            $result['id'] = $id;
            $result['created'] = true;
            $result['radius_client_verified'] = !empty($radiusClient['verified']);
            $result['subscription_usage'] = $subscriptionUsage;
            $result['message'] = 'تم إنشاء NAS وحساب SSTP والتحقق من تحميل تعريف RADIUS وتجهيز سكربت MikroTik';
            return $result;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: updateRouter
    // ==========================================
    public function updateRouter($id, $data) {
        $this->ensureNasProxyColumns();
        $id = (int)$id;
        $shortname = trim((string)($data['shortname'] ?? ''));
        if ($shortname === '') throw new InvalidArgumentException('اسم الجهاز مطلوب');
        // The CoA port is generated/managed by the platform and is not an
        // editable router attribute.
        $description = trim((string)($data['description'] ?? ''));
        $networkId=$this->getActiveNetworkId();
        $duplicate = $this->db->prepare('SELECT id FROM nas WHERE shortname = ? AND id <> ? AND network_id=? LIMIT 1');
        $duplicate->execute([$shortname, $id, $networkId]);
        if ($duplicate->fetchColumn()) throw new InvalidArgumentException('يوجد جهاز آخر بنفس الاسم');
        $currentStmt = $this->db->prepare("SELECT api_user, api_password, api_port, www_port, winbox_port, winbox_listen_port, api_listen_port, um_proxy_enabled, um_proxy_router_id, um_proxy_ip, um_proxy_auth_port, um_proxy_acct_port, COALESCE(work_types, 'hotspot') AS work_types FROM nas WHERE id=? AND network_id=? LIMIT 1");
        $currentStmt->execute([$id, $networkId]);
        $currentRouter = $currentStmt->fetch(PDO::FETCH_ASSOC);
        if (!$currentRouter) throw new DomainException('FORBIDDEN_NETWORK');

        $workTypes = $this->normalizeWorkTypes(array_key_exists('work_types', $data) ? $data['work_types'] : ($currentRouter['work_types'] ?? null));
        $wasUserManager = $this->hasUserManagerWorkType((string)($currentRouter['work_types'] ?? ''));
        $isUserManager = $this->hasUserManagerWorkType($workTypes);
        $this->assertSingleUserManagerRouter($networkId, $id, $workTypes);

        $umProxyEnabled = isset($data['um_proxy_enabled']) ? (!empty($data['um_proxy_enabled']) && $data['um_proxy_enabled'] !== 'false' && $data['um_proxy_enabled'] !== '0' ? 1 : 0) : null;
        $proxyRouterIdProvided = array_key_exists('um_proxy_router_id', $data);
        $umProxyRouterId = $proxyRouterIdProvided ? (int)$data['um_proxy_router_id'] : (int)($currentRouter['um_proxy_router_id'] ?? 0);
        if ($isUserManager) {
            $umProxyEnabled = 0;
            $umProxyRouterId = 0;
        } elseif ($umProxyEnabled === 1 && $umProxyRouterId <= 0) {
            $autoProxy = $this->findNetworkUserManagerRouter($networkId, $id);
            $umProxyRouterId = (int)($autoProxy['id'] ?? 0);
        }
        $proxyRouter = $umProxyRouterId > 0 ? $this->resolveProxyRouter($umProxyRouterId, $networkId, $id) : null;
        if ($umProxyEnabled === 1 && !$proxyRouter) throw new InvalidArgumentException('اختر راوترًا من الشبكة نفسها للـUser Manager الاحتياطي');
        if ($umProxyEnabled === 0) { $umProxyRouterId = 0; $proxyRouter = null; }
        $umProxyIp = $proxyRouter ? (string)$proxyRouter['nasname'] : null;
        $umProxySecret = $proxyRouter ? (string)$proxyRouter['secret'] : null;
        $umProxyAuthPort = !empty($data['um_proxy_auth_port']) ? (int)$data['um_proxy_auth_port'] : null;
        $umProxyAcctPort = !empty($data['um_proxy_acct_port']) ? (int)$data['um_proxy_acct_port'] : null;

        $apiUser = trim((string)($data['api_user'] ?? '')) ?: trim((string)($currentRouter['api_user'] ?? 'admin')) ?: 'admin';
        // API passwords are intentionally not returned to the browser. A blank
        // edit therefore means keep the stored credential, never erase it.
        $apiPass = array_key_exists('api_password', $data) && (string)$data['api_password'] !== ''
            ? (string)$data['api_password'] : (string)($currentRouter['api_password'] ?? '');
        $apiPort = (int)($data['api_port'] ?? ($currentRouter['api_port'] ?? 8728)) ?: 8728;
        $wwwPort = (int)($data['www_port'] ?? ($currentRouter['www_port'] ?? $apiPort)) ?: $apiPort;
        $apiSsl = !empty($data['api_ssl']) ? 1 : 0;
        $apiEnabled = isset($data['api_enabled']) ? (int)$data['api_enabled'] : 1;
        $ftpPort = (int)($data['ftp_port'] ?? 21) ?: 21;
        $hotspotDir = trim((string)($data['hotspot_dir'] ?? 'hotspot')) ?: 'hotspot';

        $winboxPort = !empty($data['winbox_port']) ? (int)$data['winbox_port'] : (!empty($currentRouter['winbox_port']) ? (int)$currentRouter['winbox_port'] : 8291);
        $winboxListenPort = !empty($data['winbox_listen_port']) ? (int)$data['winbox_listen_port'] : (!empty($currentRouter['winbox_listen_port']) ? (int)$currentRouter['winbox_listen_port'] : (8220 + $id));
        $apiListenPort = !empty($data['api_listen_port']) ? (int)$data['api_listen_port'] : (!empty($currentRouter['api_listen_port']) ? (int)$currentRouter['api_listen_port'] : (8720 + $id));

        require_once __DIR__ . '/PortForwardingRuntime.php';
        samPortForwardTransaction($this->db, function() use ($id,$networkId,$shortname,$workTypes,$description,$apiUser,$apiPass,$apiPort,$wwwPort,$winboxPort,$winboxListenPort,$apiListenPort,$apiSsl,$apiEnabled,$ftpPort,$hotspotDir,$umProxyEnabled,$umProxyRouterId,$umProxyIp,$umProxySecret,$umProxyAuthPort,$umProxyAcctPort) {
        $stmt = $this->db->prepare("UPDATE nas SET shortname = ?, type = 'mikrotik', work_types = ?, description = ?, api_user = ?, api_password = ?, api_port = ?, www_port = ?, winbox_port = ?, winbox_listen_port = ?, api_listen_port = ?, api_ssl = ?, api_enabled = ?, ftp_port = ?, hotspot_dir = ?, um_proxy_enabled = COALESCE(?, um_proxy_enabled), um_proxy_router_id = ?, um_proxy_ip = ?, um_proxy_secret = ?, um_proxy_auth_port = COALESCE(?, um_proxy_auth_port), um_proxy_acct_port = COALESCE(?, um_proxy_acct_port) WHERE id = ? AND network_id=?");
        $stmt->execute([$shortname, $workTypes, $description, $apiUser, $apiPass, $apiPort, $wwwPort, $winboxPort, $winboxListenPort, $apiListenPort, $apiSsl, $apiEnabled, $ftpPort, $hotspotDir, $umProxyEnabled, $umProxyRouterId ?: null, $umProxyIp, $umProxySecret, $umProxyAuthPort, $umProxyAcctPort, $id, $networkId]);

        // Sync dual port forwarding rules in iptables
        $this->syncRouterPortForwardingRules($id, $shortname, $networkId, $winboxListenPort, $winboxPort, $apiListenPort, $wwwPort);

        });

        // If the previous primary User Manager role is removed, invalidate
        // every stale per-router reference to it.  A future primary router can
        // then be selected explicitly and cannot inherit a dead target.
        if ($wasUserManager && !$isUserManager) {
            $clearReferences = $this->db->prepare('UPDATE nas SET um_proxy_enabled=0, um_proxy_router_id=NULL, um_proxy_ip=NULL, um_proxy_secret=NULL WHERE network_id=? AND um_proxy_router_id=?');
            $clearReferences->execute([$networkId, $id]);
        }

        $this->rebuildProxyConfiguration();

        return ['success' => true, 'id' => $id, 'message' => 'تم تحديث الجهاز وإعدادات التوجيه بنجاح'];
    }

    public function syncRouterPortForwardingRules($routerId, $shortname, $networkId, $winboxListenPort, $winboxPort, $apiListenPort, $wwwPort) {
        $routerId = (int)$routerId;
        $networkId = (int)$networkId;
        $winboxListenPort = (int)$winboxListenPort;
        $winboxPort = (int)$winboxPort ?: 8291;
        $apiListenPort = (int)$apiListenPort;
        $wwwPort = (int)$wwwPort ?: 80;
        $targetIp = '10.101.0.' . $routerId;

        require_once __DIR__ . '/PortForwardingRuntime.php';
        samPortForwardTransaction($this->db, function() use ($routerId,$shortname,$networkId,$winboxListenPort,$winboxPort,$apiListenPort,$wwwPort,$targetIp) {
            // Delete existing router rules in um_port_forwarding
            $del = $this->db->prepare("DELETE FROM um_port_forwarding WHERE router_id = ? OR (target_ip = ? AND network_id = ?)");
            $del->execute([$routerId, $targetIp, $networkId]);

            // Insert Winbox rule if listen port is valid
            if ($winboxListenPort > 0) {
                $stmtW = $this->db->prepare("INSERT INTO um_port_forwarding (network_id, router_id, listen_port, protocol, target_ip, target_port, comment, is_enabled, source_type, priority) 
                    VALUES (?, ?, ?, 'tcp', ?, ?, ?, 1, 'all', 'normal')
                    ON DUPLICATE KEY UPDATE target_ip=VALUES(target_ip), target_port=VALUES(target_port), comment=VALUES(comment), is_enabled=1, router_id=VALUES(router_id), network_id=VALUES(network_id)");
                $stmtW->execute([$networkId, $routerId, $winboxListenPort, $targetIp, $winboxPort, "Winbox: {$shortname}"]);
            }

            // Insert API rule if listen port is valid
            if ($apiListenPort > 0) {
                $stmtA = $this->db->prepare("INSERT INTO um_port_forwarding (network_id, router_id, listen_port, protocol, target_ip, target_port, comment, is_enabled, source_type, priority) 
                    VALUES (?, ?, ?, 'tcp', ?, ?, ?, 1, 'all', 'normal')
                    ON DUPLICATE KEY UPDATE target_ip=VALUES(target_ip), target_port=VALUES(target_port), comment=VALUES(comment), is_enabled=1, router_id=VALUES(router_id), network_id=VALUES(network_id)");
                $stmtA->execute([$networkId, $routerId, $apiListenPort, $targetIp, $wwwPort, "WWW: {$shortname}"]);
            }

            samOwnerApplyPortForwarding($this->db);
        });
    }

    // ==========================================
    // METHOD: deleteRouter
    // ==========================================
    public function deleteRouter($id) {
        $id = (int)$id;
        $networkId=$this->getActiveNetworkId();
        $exists=$this->db->prepare('SELECT COUNT(*) FROM nas WHERE id=? AND network_id=?');$exists->execute([$id,$networkId]);
        if(!(int)$exists->fetchColumn())throw new DomainException('FORBIDDEN_NETWORK');
        $username = 'router_' . $id;
        $this->db->beginTransaction();
        try {
            $this->db->prepare('UPDATE nas SET um_proxy_enabled=0, um_proxy_router_id=NULL, um_proxy_ip=NULL, um_proxy_secret=NULL WHERE network_id=? AND um_proxy_router_id=?')->execute([$networkId, $id]);
            $this->db->prepare('DELETE FROM radcheck WHERE username = ? AND network_id=?')->execute([$username,$networkId]);
            $this->db->prepare('DELETE FROM radreply WHERE username = ? AND network_id=?')->execute([$username,$networkId]);
            $this->db->prepare('DELETE FROM nas WHERE id = ? AND network_id=?')->execute([$id,$networkId]);
            $this->db->prepare("DELETE FROM um_port_forwarding WHERE router_id = ? OR target_ip = ?")->execute([$id, '10.101.0.' . $id]);
            $this->db->commit();
            require_once __DIR__ . '/../system_owner_api.php';
            if (function_exists('samOwnerApplyPortForwarding')) {
                @samOwnerApplyPortForwarding($this->db);
            }
            $this->rebuildProxyConfiguration();
            return ['success' => true];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
    // ==========================================
    // PROFILES / LIMITATIONS
    // ==========================================

    // ==========================================
    // METHOD: getRouterConnectionConfig
    // ==========================================
    public function getRouterConnectionConfig($nasId, $customCreds = null) {
        $stmt = $this->db->prepare("SELECT * FROM nas WHERE id = ? AND network_id=?");
        $stmt->execute([(int)$nasId,$this->getActiveNetworkId()]);
        $router = $stmt->fetch();
        if (!$router) throw new Exception("لم يتم العثور على الراوتر المحدد");
        $ip = !empty($customCreds['ip']) ? trim($customCreds['ip']) : $router['nasname'];
        $user = !empty($customCreds['api_user']) ? trim($customCreds['api_user']) : ($router['api_user'] ?: 'admin');
        $pass = isset($customCreds['api_password']) ? $customCreds['api_password'] : ($router['api_password'] ?: '');
        $port = !empty($customCreds['api_port']) ? (int)$customCreds['api_port'] : ((int)$router['api_port'] ?: 8728);
        $ssl = isset($customCreds['api_ssl']) ? !empty($customCreds['api_ssl']) : (!empty($router['api_ssl']));
        return [
            'router' => $router,
            'ip' => $ip,
            'user' => $user,
            'pass' => $pass,
            'port' => $port,
            'ssl' => $ssl
        ];
    }

    // ==========================================
    // METHOD: testRouterApiConnection
    // ==========================================
    public function testRouterApiConnection($nasId, $customCreds = null) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId, $customCreds);
        $api = new RouterOSApi();
        $api->timeout = 4;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            $err = $api->error_str ?: 'تعذر الاتصال بمنفذ API الراوتر (تأكد من تفعيل /ip service enable api وصحة الـ IP واسم المستخدم)';
            return ['success' => false, 'error' => $err, 'config' => ['ip' => $cfg['ip'], 'port' => $cfg['port']]];
        }
        $identityRes = $api->comm('/system/identity/print');
        $resourceRes = $api->comm('/system/resource/print');
        $api->disconnect();
        $identity = $identityRes[0]['name'] ?? ($cfg['router']['shortname'] ?: 'MikroTik');
        $res = $resourceRes[0] ?? [];
        return [
            'success' => true,
            'identity' => $identity,
            'version' => $res['version'] ?? 'N/A',
            'platform' => $res['platform'] ?? ($res['board-name'] ?? 'RouterBOARD'),
            'uptime' => $res['uptime'] ?? 'N/A',
            'cpu_load' => ($res['cpu-load'] ?? '0') . '%',
            'free_memory' => isset($res['free-memory']) ? round($res['free-memory'] / 1048576, 1) . ' MB' : 'N/A',
            'router_ip' => $cfg['ip']
        ];
    }

    // ==========================================
    // METHOD: getRouterComprehensiveStatus
    // ==========================================
    public function getRouterComprehensiveStatus($nasId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return [
                'success' => false,
                'connected' => false,
                'error' => $api->error_str ?: 'تعذر الاتصال بـ API الراوتر. تأكد من تفعيل خدمة API وصحة كلمة المرور.',
                'router' => $cfg['router']
            ];
        }
        $identity = $api->comm('/system/identity/print');
        $resource = $api->comm('/system/resource/print');
        $clock = $api->comm('/system/clock/print');
        $health = $api->comm('/system/health/print');
        $api->disconnect();
        $res = $resource[0] ?? [];
        $clk = $clock[0] ?? [];
        $hlth = [];
        if (is_array($health)) {
            foreach ($health as $h) {
                if (isset($h['name']) && isset($h['value'])) {
                    $hlth[$h['name']] = $h['value'];
                }
            }
        }
        $totalMem = isset($res['total-memory']) ? (int)$res['total-memory'] : 0;
        $freeMem = isset($res['free-memory']) ? (int)$res['free-memory'] : 0;
        $usedMem = $totalMem > 0 ? ($totalMem - $freeMem) : 0;
        $memPct = $totalMem > 0 ? round(($usedMem / $totalMem) * 100, 1) : 0;
        $totalHdd = isset($res['total-hdd-space']) ? (int)$res['total-hdd-space'] : 0;
        $freeHdd = isset($res['free-hdd-space']) ? (int)$res['free-hdd-space'] : 0;
        $usedHdd = $totalHdd > 0 ? ($totalHdd - $freeHdd) : 0;
        $hddPct = $totalHdd > 0 ? round(($usedHdd / $totalHdd) * 100, 1) : 0;
        // Update last_sync_time
        $this->db->prepare("UPDATE nas SET last_sync_time = NOW() WHERE id = ? AND network_id=?")->execute([(int)$nasId,$this->getActiveNetworkId()]);
        return [
            'success' => true,
            'connected' => true,
            'identity' => $identity[0]['name'] ?? ($cfg['router']['shortname'] ?: 'MikroTik'),
            'router_ip' => $cfg['ip'],
            'version' => $res['version'] ?? 'N/A',
            'board_name' => $res['board-name'] ?? ($res['platform'] ?? 'RouterBOARD'),
            'architecture' => $res['architecture-name'] ?? 'N/A',
            'cpu' => $res['cpu'] ?? 'MIPS',
            'cpu_count' => (int)($res['cpu-count'] ?? 1),
            'cpu_frequency' => ($res['cpu-frequency'] ?? 'N/A') . ' MHz',
            'cpu_load' => (int)($res['cpu-load'] ?? 0),
            'uptime' => $res['uptime'] ?? 'N/A',
            'memory' => [
                'total' => $totalMem,
                'free' => $freeMem,
                'used' => $usedMem,
                'percent' => $memPct,
                'total_formatted' => round($totalMem / 1048576, 1) . ' MB',
                'free_formatted' => round($freeMem / 1048576, 1) . ' MB'
            ],
            'hdd' => [
                'total' => $totalHdd,
                'free' => $freeHdd,
                'used' => $usedHdd,
                'percent' => $hddPct,
                'total_formatted' => round($totalHdd / 1048576, 1) . ' MB',
                'free_formatted' => round($freeHdd / 1048576, 1) . ' MB'
            ],
            'clock' => [
                'time' => $clk['time'] ?? date('H:i:s'),
                'date' => $clk['date'] ?? date('Y-m-d'),
                'timezone' => $clk['time-zone-name'] ?? 'Asia/Aden'
            ],
            'health' => $hlth,
            'resource' => $res,
            'resources' => $res,
            'router' => $cfg['router']
        ];
    }

    // ==========================================
    // METHOD: getRouterInterfacesTraffic
    // ==========================================
    public function getRouterInterfacesTraffic($nasId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => $api->error_str ?: 'تعذر الاتصال بـ API الراوتر لقراءة المنافذ.'];
        }
        $interfaces = $api->comm('/interface/print');
        $api->disconnect();
        if (!is_array($interfaces)) $interfaces = [];
        // Fetch nodes attached to this router's ports
        $nodeStmt = $this->db->prepare("SELECT id, node_name, node_type, nas_port_id FROM um_network_nodes WHERE nas_ip = ?");
        $nodeStmt->execute([$cfg['ip']]);
        $nodes = $nodeStmt->fetchAll();
        $nodeMap = [];
        foreach ($nodes as $n) {
            $p = strtolower(trim($n['nas_port_id']));
            if (!isset($nodeMap[$p])) $nodeMap[$p] = [];
            $nodeMap[$p][] = $n;
        }
        $result = [];
        foreach ($interfaces as $iface) {
            $name = $iface['name'] ?? '';
            $pKey = strtolower(trim($name));
            $rxBytes = (float)($iface['rx-byte'] ?? 0);
            $txBytes = (float)($iface['tx-byte'] ?? 0);
            $running = ($iface['running'] ?? 'false') === 'true';
            $disabled = ($iface['disabled'] ?? 'false') === 'true';
            $result[] = [
                'name' => $name,
                'default_name' => $iface['default-name'] ?? $name,
                'type' => $iface['type'] ?? 'ether',
                'mac_address' => $iface['mac-address'] ?? '',
                'running' => $running,
                'disabled' => $disabled,
                'comment' => $iface['comment'] ?? '',
                'rx_bytes' => $rxBytes,
                'tx_bytes' => $txBytes,
                'total_bytes' => $rxBytes + $txBytes,
                'rx_formatted' => $this->formatBytesHelper($rxBytes),
                'tx_formatted' => $this->formatBytesHelper($txBytes),
                'total_formatted' => $this->formatBytesHelper($rxBytes + $txBytes),
                'rx_packets' => (int)($iface['rx-packet'] ?? 0),
                'tx_packets' => (int)($iface['tx-packet'] ?? 0),
                'attached_nodes' => $nodeMap[$pKey] ?? []
            ];
        }
        return [
            'success' => true,
            'router_ip' => $cfg['ip'],
            'count' => count($result),
            'interfaces' => $result
        ];
    }

    // ==========================================
    // METHOD: setRouterInterfaceState
    // ==========================================
    public function setRouterInterfaceState($nasId, $interfaceName, $enabled) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر'];
        }
        $disableVal = $enabled ? 'no' : 'yes';
        $res = $api->comm('/interface/set', [
            '=.id=' . trim($interfaceName),
            '=disabled=' . $disableVal
        ]);
        $api->disconnect();
        return [
            'success' => true,
            'interface' => $interfaceName,
            'enabled' => (bool)$enabled,
            'message' => $enabled ? "تم تفعيل المنفذ ({$interfaceName}) بنجاح" : "تم تعطيل المنفذ ({$interfaceName}) بنجاح"
        ];
    }

    // ==========================================
    // METHOD: getRouterHotspotActive
    // ==========================================
    public function getRouterHotspotActive($nasId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر لقراءة جلسات الهوتسبوت'];
        }
        $active = $api->comm('/ip/hotspot/active/print');
        $api->disconnect();
        if (!is_array($active)) $active = [];
        $list = [];
        foreach ($active as $a) {
            $bytesIn = (float)($a['bytes-in'] ?? 0);
            $bytesOut = (float)($a['bytes-out'] ?? 0);
            $list[] = [
                'id' => $a['.id'] ?? '',
                '.id' => $a['.id'] ?? '',
                'user' => $a['user'] ?? '',
                'username' => $a['user'] ?? '',
                'name' => $a['user'] ?? '',
                'address' => $a['address'] ?? '',
                'ip' => $a['address'] ?? '',
                'mac_address' => $a['mac-address'] ?? '',
                'mac-address' => $a['mac-address'] ?? '',
                'server' => $a['server'] ?? '',
                'domain' => $a['domain'] ?? '',
                'uptime' => $a['uptime'] ?? '',
                'session_time_left' => $a['session-time-left'] ?? '-',
                'session-time-left' => $a['session-time-left'] ?? '-',
                'idle_time' => $a['idle-time'] ?? '-',
                'idle-time' => $a['idle-time'] ?? '-',
                'bytes_in' => $bytesIn,
                'bytes-in' => $bytesIn,
                'bytes_out' => $bytesOut,
                'bytes-out' => $bytesOut,
                'total_bytes' => $bytesIn + $bytesOut,
                'in_formatted' => $this->formatBytesHelper($bytesIn),
                'out_formatted' => $this->formatBytesHelper($bytesOut),
                'total_formatted' => $this->formatBytesHelper($bytesIn + $bytesOut),
                'login_by' => $a['login-by'] ?? 'http-chap',
                'login-by' => $a['login-by'] ?? 'http-chap',
                'radius' => $a['radius'] ?? 'false',
                'comment' => $a['comment'] ?? ''
            ];
        }
        return [
            'success' => true,
            'router_ip' => $cfg['ip'],
            'count' => count($list),
            'sessions' => $list,
            'active_users' => $list,
            'data' => $list
        ];
    }

    // ==========================================
    // METHOD: kickRouterHotspotUser
    // ==========================================
    public function kickRouterHotspotUser($nasId, $userOrId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر'];
        }
        // If userOrId starts with *, remove by .id; else find by username
        if (strpos($userOrId, '*') === 0) {
            $api->comm('/ip/hotspot/active/remove', ['=.id=' . $userOrId]);
        } else {
            $items = $api->comm('/ip/hotspot/active/print', ['?user=' . trim($userOrId)]);
            if (is_array($items) && !empty($items)) {
                foreach ($items as $item) {
                    if (!empty($item['.id'])) {
                        $api->comm('/ip/hotspot/active/remove', ['=.id=' . $item['.id']]);
                    }
                }
            }
        }
        $api->disconnect();
        return [
            'success' => true,
            'message' => "تم بنجاح فصل وطرد المشترك ({$userOrId}) من الراوتر"
        ];
    }

    // ==========================================
    // METHOD: getRouterFilesList
    // ==========================================
    public function getRouterFilesList($nasId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر'];
        }
        $files = $api->comm('/file/print');
        $api->disconnect();
        if (!is_array($files)) $files = [];
        $list = [];
        foreach ($files as $f) {
            $name = $f['name'] ?? '';
            $type = $f['type'] ?? 'file';
            $size = (int)($f['size'] ?? 0);
            $date = $f['creation-time'] ?? '';
            $list[] = [
                'name' => $name,
                'type' => $type,
                'size' => $size,
                'size_formatted' => $size > 0 ? $this->formatBytesHelper($size) : ($type === 'directory' ? 'مجلد' : '0 B'),
                'creation_time' => $date
            ];
        }
        return [
            'success' => true,
            'router_ip' => $cfg['ip'],
            'hotspot_dir' => $cfg['router']['hotspot_dir'] ?? 'hotspot',
            'count' => count($list),
            'files' => $list
        ];
    }

    // ==========================================
    // METHOD: deployHotspotLoginTemplate
    // ==========================================
    public function deployHotspotLoginTemplate($nasId, $customHtml = null) {
        $cfg = $this->getRouterConnectionConfig($nasId);
        $router = $cfg['router'];
        $routerName = htmlspecialchars($router['shortname'] ?: 'شبكة الواي فاي');
        $targetDir = trim($router['hotspot_dir'] ?: 'hotspot');
        // Build Modern, Professional Hotspot Login Bundle
        require_once __DIR__ . '/HotspotTemplateService.php';
        $htService = new HotspotTemplateService($this->db);
        $filesToUpload = $htService->generateHotspotBundle((int)$router['network_id']);

        $statusHtml = $this->generateModernHotspotStatusHtml($routerName);
        $aloginHtml = $this->generateModernHotspotAloginHtml();
        $logoutHtml = $this->generateModernHotspotLogoutHtml($routerName);
        $legacyFiles = [
            'login.html' => $loginHtml,
            'status.html' => $statusHtml,
            'alogin.html' => $aloginHtml,
            'logout.html' => $logoutHtml
        ];
        // 1. Try Upload via Native PHP FTP
        $ftpPort = (int)($router['ftp_port'] ?: 21);
        $ftpUser = $cfg['user'];
        $ftpPass = $cfg['pass'];
        $ftpIp = $cfg['ip'];
        $ftpSuccess = false;
        $ftpError = '';
        if (function_exists('ftp_connect')) {
            $conn = @ftp_connect($ftpIp, $ftpPort, 5);
            if ($conn) {
                if (@ftp_login($conn, $ftpUser, $ftpPass)) {
                    @ftp_pasv($conn, true);
                    // Ensure target directory exists
                    $dirParts = explode('/', $targetDir);
                    $currDir = '';
                    foreach ($dirParts as $dp) {
                        if (empty($dp)) continue;
                        $currDir .= ($currDir ? '/' : '') . $dp;
                        @ftp_mkdir($conn, $currDir);
                    }
                    $allPushed = true;
                    foreach ($filesToUpload as $fName => $content) {
                        $tempFile = tempnam(sys_get_temp_dir(), 'hs_');
                        file_put_contents($tempFile, $content);
                        $remotePath = $targetDir . '/' . $fName;
                        if (!@ftp_put($conn, $remotePath, $tempFile, FTP_BINARY)) {
                            $allPushed = false;
                        }
                        @unlink($tempFile);
                    }
                    @ftp_close($conn);
                    if ($allPushed) {
                        $ftpSuccess = true;
                    } else {
                        $ftpError = 'تعذر كتابة بعض الملفات عبر FTP';
                    }
                } else {
                    $ftpError = 'بيانات تسجيل دخول FTP غير صحيحة';
                    @ftp_close($conn);
                }
            } else {
                $ftpError = "تعذر الاتصال بمنفذ FTP ({$ftpPort})";
            }
        }
        // 2. Fallback: Upload via RouterOS API /file/add if FTP not available
        if (!$ftpSuccess) {
            require_once __DIR__ . '/RouterOSApi.php';
            $api = new RouterOSApi();
            $api->timeout = 6;
            if ($api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl'])) {
                foreach ($filesToUpload as $fName => $content) {
                    $filePath = $targetDir . '/' . $fName;
                    $api->comm('/file/add', [
                        '=name=' . $filePath,
                        '=contents=' . $content
                    ]);
                }
                $api->disconnect();
                $ftpSuccess = true;
            }
        }
        if ($ftpSuccess) {
            return [
                'success' => true,
                'target_directory' => $targetDir,
                'uploaded_files' => array_keys($filesToUpload),
                'message' => "تم بنجاح رفع وتثبيت صفحة تسجيل دخول الهوتسبوت الكاملة في مجلد ({$targetDir}) بالراوتر!"
            ];
        } else {
            return [
                'success' => false,
                'error' => "فشل رفع القالب إلى الذاكرة الداخلية للراوتر: {$ftpError}. تأكد من تفعيل خدمة FTP عبر أمر: /ip service enable ftp"
            ];
        }
    }

    // ==========================================
    // METHOD: executeRouterTerminalCommand
    // ==========================================
    public function executeRouterTerminalCommand($nasId, $cmdString) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 8;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر لتنفيذ الأمر'];
        }
        $cmdString = trim($cmdString);
        if (empty($cmdString)) return ['success' => false, 'error' => 'الأمر فارغ'];
        // Split into command and arguments
        $parts = preg_split('/\s+/', $cmdString);
        $cmd = array_shift($parts);
        if (strpos($cmd, '/') !== 0) $cmd = '/' . $cmd;
        $res = $api->comm($cmd, $parts);
        $api->disconnect();
        return [
            'success' => true,
            'command' => $cmdString,
            'output' => $res,
            'count' => is_array($res) ? count($res) : 0
        ];
    }

    // ==========================================
    // METHOD: rebootRouterHardware
    // ==========================================
    public function rebootRouterHardware($nasId) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر'];
        }
        $api->comm('/system/reboot');
        $api->disconnect();
        return [
            'success' => true,
            'message' => "تم إرسال أمر إعادة التشغيل (Reboot) إلى الراوتر بنجاح!"
        ];
    }

    // ==========================================
    // METHOD: createRouterBackupFile
    // ==========================================
    public function createRouterBackupFile($nasId, $backupName = '') {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 8;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر'];
        }
        if (empty($backupName)) {
            $backupName = 'backup_' . preg_replace('/[^a-zA-Z0-9_]/', '_', $cfg['router']['shortname']) . '_' . date('Ymd_His');
        }
        $res = $api->comm('/system/backup/save', ['=name=' . $backupName]);
        $api->disconnect();
        return [
            'success' => true,
            'backup_name' => $backupName . '.backup',
            'message' => "تم إنشاء وحفظ النسخة الاحتياطية ({$backupName}.backup) في ذاكرة الراوتر بنجاح!"
        ];
    }

    // ==========================================
    // METHOD: generateModernHotspotHtml
    // ==========================================
    private function generateModernHotspotHtml($netName) {
        $html = <<<'EOD'
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__NET_NAME__ - تسجيل الدخول</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif; }
        body { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #ffffff; color: #1e293b; border-radius: 16px; padding: 28px; width: 100%; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: center; }
        .logo { font-size: 42px; margin-bottom: 8px; }
        .title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
        .subtitle { font-size: 13px; color: #64748b; margin-bottom: 22px; }
        .form-group { margin-bottom: 16px; text-align: right; }
        .form-group label { display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px; }
        .input-field { width: 100%; padding: 12px 14px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; text-align: center; font-weight: 700; color: #0f172a; outline: none; transition: 0.2s; direction: ltr; }
        .input-field:focus { border-color: #0284c7; box-shadow: 0 0 0 3px rgba(2,132,199,0.2); }
        .btn-submit { width: 100%; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border: none; padding: 13px; font-size: 16px; font-weight: 800; border-radius: 10px; cursor: pointer; transition: 0.2s; margin-top: 6px; }
        .btn-submit:hover { opacity: 0.95; transform: translateY(-1px); }
        .alert-error { background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 8px; font-size: 12px; margin-bottom: 15px; font-weight: 600; }
        .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">📶</div>
        <div class="title">__NET_NAME__</div>
        <div class="subtitle">أهلاً بك! أدخل رقم الكرت للاتصال بالإنترنت</div>
        $(if error)
        <div class="alert-error">$(error)</div>
        $(endif)
        <form name="login" action="$(link-login-only)" method="post" $(if chap-id) onSubmit="return doLogin()" $(endif)>
            <input type="hidden" name="dst" value="$(link-orig)" />
            <input type="hidden" name="popup" value="true" />
            <div class="form-group">
                <label>رقم الكرت / كود المشترك:</label>
                <input type="text" name="username" class="input-field" placeholder="أدخل رقم الكرت هنا" value="$(username)" required autofocus oninput="document.getElementById('pass-field').value=this.value;" />
            </div>
            <div class="form-group" style="display:none;">
                <label>كلمة المرور:</label>
                <input type="password" id="pass-field" name="password" class="input-field" value="" />
            </div>
            <button type="submit" class="btn-submit">⚡ تسجيل الدخول الآن</button>
        </form>
        <div class="footer">
            خدمة الإنترنت السريع والآمن<br>
            للحصول على كروت أو الدعم الفني يرجى التواصل مع الإدارة
        </div>
    </div>
</body>
</html>
EOD;
        return str_replace('__NET_NAME__', $netName, $html);
    }

    // ==========================================
    // METHOD: generateModernHotspotStatusHtml
    // ==========================================
    private function generateModernHotspotStatusHtml($netName) {
        $html = <<<'EOD'
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__NET_NAME__ - حالة الاتصال</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif; }
        body { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #ffffff; color: #1e293b; border-radius: 16px; padding: 26px; width: 100%; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: center; }
        .status-badge { display: inline-block; background: #dcfce7; color: #166534; padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 13px; margin-bottom: 15px; }
        .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; text-align: right; }
        .info-table tr { border-bottom: 1px solid #f1f5f9; }
        .info-table td { padding: 10px 4px; }
        .info-table td:first-child { color: #64748b; font-weight: 600; }
        .info-table td:last-child { text-align: left; font-weight: 800; color: #0f172a; direction: ltr; }
        .btn-logout { width: 100%; background: #ef4444; color: #fff; border: none; padding: 12px; font-size: 15px; font-weight: 800; border-radius: 10px; cursor: pointer; text-decoration: none; display: block; }
    </style>
</head>
<body>
    <div class="card">
        <div class="status-badge">🟢 متصل بالإنترنت بنجاح</div>
        <div style="font-weight:800; font-size:20px; margin-bottom:15px; color:#0f172a;">__NET_NAME__</div>
        <table class="info-table">
            <tr><td>اسم الكرت / المستخدم:</td><td>$(username)</td></tr>
            <tr><td>عنوان IP:</td><td>$(ip)</td></tr>
            <tr><td>عنوان الماك (MAC):</td><td>$(mac)</td></tr>
            <tr><td>مدة الاتصال:</td><td>$(uptime)</td></tr>
            $(if session-time-left)<tr><td>الوقت المتبقي:</td><td>$(session-time-left)</td></tr>$(endif)
            <tr><td>إجمالي الاستهلاك:</td><td>$(bytes-in-nice) / $(bytes-out-nice)</td></tr>
            $(if remain-bytes-total)<tr><td>الرصيد المتبقي:</td><td>$(remain-bytes-total-nice)</td></tr>$(endif)
        </table>
        <a href="$(link-logout)" class="btn-logout">🔴 تسجيل الخروج وفصل الاتصال</a>
    </div>
</body>
</html>
EOD;
        return str_replace('__NET_NAME__', $netName, $html);
    }

    // ==========================================
    // METHOD: generateModernHotspotAloginHtml
    // ==========================================
    private function generateModernHotspotAloginHtml() {
        return <<<'EOD'
<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1; url=$(link-redirect)"><meta charset="utf-8"><title>جارٍ التحويل...</title><style>body{background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px;}</style></head><body><h2>جارٍ تسجيل الدخول وتوصيل الإنترنت...</h2><p>إذا لم يتم التحويل اضغط <a href="$(link-redirect)" style="color:#38bdf8;">هنا</a></p></body></html>
EOD;
    }

    // ==========================================
    // METHOD: generateModernHotspotLogoutHtml
    // ==========================================
    private function generateModernHotspotLogoutHtml($netName) {
        $html = <<<'EOD'
<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تم تسجيل الخروج</title><style>body{background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding-top:80px;}.box{background:#fff;color:#1e293b;border-radius:12px;padding:30px;max-width:380px;margin:0 auto;box-shadow:0 10px 20px rgba(0,0,0,0.3);}.btn{background:#0284c7;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:15px;font-weight:bold;}</style></head><body><div class="box"><h2>تم تسجيل الخروج بنجاح</h2><p style="color:#64748b;margin:10px 0;">شكراً لاستخدامك شبكة __NET_NAME__</p><a href="$(link-login)" class="btn">تسجيل الدخول مجدداً</a></div></body></html>
EOD;
        return str_replace('__NET_NAME__', $netName, $html);
    }
    // =========================================================================
    // ENHANCED NETWORK DEVICES TABLE & TOPOLOGY BACKEND METHODS
    // =========================================================================

    // ==========================================
    // METHOD: getProfiles
    // ==========================================
    public function getProfiles() {
        $this->ensureMikrotikGroupColumn();
        $networkId = $this->getActiveNetworkId();
        
        // 1. Fetch base profiles and template info
        $stmt = $this->db->prepare("
            SELECT p.*, t.name as template_name
            FROM um_profiles_def p
            LEFT JOIN um_card_templates t ON p.template_id = t.id AND t.network_id=p.network_id
            WHERE p.network_id=?
            ORDER BY p.id DESC
        ");
        $stmt->execute([$networkId]);
        $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($profiles)) return [];

        // 2. Fetch user counts per profile (ultra-fast indexed group by in 1-2ms)
        $uStmt = $this->db->prepare("
            SELECT profile_name, COUNT(*) as cnt
            FROM um_vouchers_meta
            WHERE network_id=? AND profile_name IS NOT NULL AND profile_name != ''
            GROUP BY profile_name
        ");
        $uStmt->execute([$networkId]);
        $userCountMap = [];
        foreach ($uStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $userCountMap[$r['profile_name']] = (int)$r['cnt'];
        }

        // 3. Fetch active online counts per profile (only for currently active sessions)
        $oStmt = $this->db->prepare("
            SELECT ug.groupname, COUNT(DISTINCT act.username) as online_cnt
            FROM radacct act
            INNER JOIN radusergroup ug ON ug.username=act.username AND ug.network_id=act.network_id
            WHERE act.network_id=? AND act.acctstoptime IS NULL
            GROUP BY ug.groupname
        ");
        $oStmt->execute([$networkId]);
        $onlineCountMap = [];
        foreach ($oStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $onlineCountMap[$r['groupname']] = (int)$r['online_cnt'];
        }

        // 4. Merge counts
        foreach ($profiles as &$p) {
            $pName = $p['name'];
            $pGroup = $p['mikrotik_group'] ?? $pName;
            $cnt = ($userCountMap[$pName] ?? 0);
            if ($pGroup !== $pName && isset($userCountMap[$pGroup])) {
                $cnt = max($cnt, $userCountMap[$pGroup]);
            }
            $online = ($onlineCountMap[$pName] ?? 0);
            if ($pGroup !== $pName && isset($onlineCountMap[$pGroup])) {
                $online = max($online, $onlineCountMap[$pGroup]);
            }
            $p['user_count'] = $cnt;
            $p['online_count'] = $online;
        }
        unset($p);

        return $profiles;
    }

    // ==========================================
    // METHOD: saveProfile
    // ==========================================
    private function parseRateLimitPair(string $rate): ?array {
        if (!preg_match('/^([0-9]+(?:\.[0-9]+)?)\s*([kmg]?)\s*(?:\/\s*([0-9]+(?:\.[0-9]+)?)\s*([kmg]?))?$/i', trim($rate), $m)) return null;
        $factor = static function(string $unit): float { return ['' => 1.0, 'k' => 1_000.0, 'm' => 1_000_000.0, 'g' => 1_000_000_000.0][strtolower($unit)] ?? 1.0; };
        $rx = (float)$m[1] * $factor((string)($m[2] ?? ''));
        $tx = isset($m[3]) ? (float)$m[3] * $factor((string)($m[4] ?? '')) : $rx;
        return is_finite($rx) && is_finite($tx) ? [$rx, $tx] : null;
    }

    public function saveProfile($data) {
        $this->ensureMikrotikGroupColumn();
        $this->ensurePackageTypeColumn();
        $name = trim((string)($data['name'] ?? ''));
        if (empty($name)) throw new InvalidArgumentException('يجب إدخال اسم الباقة');
        $nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : preg_match_all('/./us', $name);
        if ($nameLength === false) throw new InvalidArgumentException('اسم الباقة يحتوي على ترميز نصي غير صالح');
        if ($nameLength > 64) throw new InvalidArgumentException('اسم الباقة يجب ألا يتجاوز 64 حرفاً لأنه يطابق اسم MikroTik Group / User Profile');
        $mikrotikGroup = $name;
        $networkId = $this->getActiveNetworkId();
        $packageType = (($data['package_type'] ?? 'paid') === 'free') ? 'free' : 'paid';
        $templateId = filter_var($data['template_id'] ?? null, FILTER_VALIDATE_INT);
        if ($packageType === 'free') {
            if ($templateId !== false && $templateId !== null && $templateId > 0) {
                $templateStmt = $this->db->prepare('SELECT id FROM um_card_templates WHERE network_id=? AND id=? LIMIT 1');
                $templateStmt->execute([$networkId, $templateId]);
                if (!$templateStmt->fetchColumn()) {
                    $templateId = null;
                }
            } else {
                $templateId = null;
            }
        } else {
            if ($templateId === false || $templateId === null || $templateId < 1) {
                throw new InvalidArgumentException('يجب اختيار قالب طباعة مخصص لهذه الباقة');
            }
            $templateStmt = $this->db->prepare('SELECT id FROM um_card_templates WHERE network_id=? AND id=? LIMIT 1');
            $templateStmt->execute([$networkId, $templateId]);
            if (!$templateStmt->fetchColumn()) {
                throw new InvalidArgumentException('قالب الطباعة المحدد غير موجود ضمن الشبكة النشطة');
            }
        }

        $rateLimit = trim((string)($data['rate_limit'] ?? $data['default_speed'] ?? ''));
        if ($rateLimit === '') throw new InvalidArgumentException('يجب تحديد السرعة الافتراضية للباقة');
        $allowSpeedChange = (int)($data['allow_speed_change'] ?? 0);
        if (!in_array($allowSpeedChange, [0, 1], true)) throw new InvalidArgumentException('قيمة خيار تغيير السرعة غير صالحة');
        $defaultSpeed = $rateLimit;
        $maxSpeed = $defaultSpeed;
        if ($allowSpeedChange === 1) {
            $maxSpeed = trim((string)($data['max_speed'] ?? ''));
            $defaultPair = $this->parseRateLimitPair($defaultSpeed);
            $maxPair = $this->parseRateLimitPair($maxSpeed);
            if (!$defaultPair || !$maxPair) throw new InvalidArgumentException('تعذر التحقق من السرعة؛ استخدم صيغة مثل 512k/1M أو 2M/4M');
            if ($maxPair[0] < $defaultPair[0] || $maxPair[1] < $defaultPair[1] || ($maxPair[0] <= $defaultPair[0] && $maxPair[1] <= $defaultPair[1])) {
                throw new InvalidArgumentException('أقصى سرعة مسموحة يجب أن تكون أعلى من السرعة الافتراضية في اتجاه واحد على الأقل، وألا تقل عنها في الاتجاه الآخر');
            }
        }
        $price = $packageType === 'free' ? 0.0 : max(0, (float)($data['price'] ?? 0));
        $retailPrice = $packageType === 'free' ? 0.0 : max(0, (float)($data['retail_price'] ?? $data['price'] ?? 0));
        $costPrice = $packageType === 'free' ? 0.0 : max(0, (float)($data['cost_price'] ?? 0));
        if ($packageType !== 'free' && $costPrice > $retailPrice) {
            throw new InvalidArgumentException("سعر التوزيع ({$costPrice}) لا يمكن أن يكون أكبر من سعر البيع للجمهور ({$retailPrice})");
        }

        $exists = $this->db->prepare("SELECT id FROM um_profiles_def WHERE name = :name AND network_id=:network_id");
        $exists->execute([':name' => $name, ':network_id'=>$networkId]);
        $row = $exists->fetch();
        $params = [
            ':name' => $name,
            ':mikrotik_group' => $mikrotikGroup,
            ':name_for_users' => $data['name_for_users'] ?? $name,
            ':package_type' => $packageType,
            ':validity' => $data['validity'] ?? '30d',
            ':starts_at' => $data['starts_at'] ?? 'first-logon',
            ':price' => $price,
            ':cost_price' => $costPrice,
            ':retail_price' => $retailPrice,
            ':shared_users' => (int)($data['shared_users'] ?? 1),
            ':rate_limit' => $rateLimit,
            ':burst_rate' => $data['burst_rate'] ?? null,
            ':burst_threshold' => $data['burst_threshold'] ?? null,
            ':burst_time' => $data['burst_time'] ?? null,
            ':priority' => (int)($data['priority'] ?? 8),
            ':transfer_limit' => (int)($data['transfer_limit'] ?? 0),
            ':uptime_limit' => $data['uptime_limit'] ?? null,
            ':address_list' => $data['address_list'] ?? null,
            ':template_id' => $templateId,
            ':allow_speed_change' => $allowSpeedChange,
            ':default_speed' => $defaultSpeed,
            ':max_speed' => $maxSpeed
        ];
        if ($row) {
            $stmt = $this->db->prepare("UPDATE um_profiles_def SET mikrotik_group=:mikrotik_group, name_for_users=:name_for_users, package_type=:package_type, validity=:validity, starts_at=:starts_at, price=:price, cost_price=:cost_price, retail_price=:retail_price, shared_users=:shared_users, rate_limit=:rate_limit, burst_rate=:burst_rate, burst_threshold=:burst_threshold, burst_time=:burst_time, priority=:priority, transfer_limit=:transfer_limit, uptime_limit=:uptime_limit, address_list=:address_list, template_id=:template_id, allow_speed_change=:allow_speed_change, default_speed=:default_speed, max_speed=:max_speed WHERE name=:name AND network_id=:network_id");
            $params[':network_id']=$networkId;
            $stmt->execute($params);
        } else {
            $stmt = $this->db->prepare("INSERT INTO um_profiles_def (network_id, name, mikrotik_group, name_for_users, package_type, validity, starts_at, price, cost_price, retail_price, shared_users, rate_limit, burst_rate, burst_threshold, burst_time, priority, transfer_limit, uptime_limit, address_list, template_id, allow_speed_change, default_speed, max_speed) VALUES (:network_id, :name, :mikrotik_group, :name_for_users, :package_type, :validity, :starts_at, :price, :cost_price, :retail_price, :shared_users, :rate_limit, :burst_rate, :burst_threshold, :burst_time, :priority, :transfer_limit, :uptime_limit, :address_list, :template_id, :allow_speed_change, :default_speed, :max_speed)");
            $params[':network_id']=$networkId;
            $stmt->execute($params);
        }
        $data['mikrotik_group'] = $mikrotikGroup;
        $this->syncProfileToRadius($name, $data);
        return ['success' => true];
    }

    // ==========================================
    // METHOD: deleteProfile
    // ==========================================
    public function deleteProfile($id, $adminRole = 'superadmin') {
        if (!in_array($adminRole, ['system_owner', 'superadmin'], true)) {
            return ['success' => false, 'error' => 'عذراً، صلاحية حذف الباقات مخصصة فقط لمالك النظام'];
        }
        $networkId = $this->getActiveNetworkId();
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('SELECT id,name,mikrotik_group FROM um_profiles_def WHERE network_id=? AND (id=? OR name=?) LIMIT 1 FOR UPDATE');
            $stmt->execute([$networkId, (int)$id, (string)$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) { $this->db->rollBack(); return ['success' => false, 'error' => 'الباقة غير موجودة']; }
            $groupNames = array_values(array_unique(array_filter([(string)$row['name'], (string)($row['mikrotik_group'] ?? '')], static fn($v) => $v !== '')));
            $marks = implode(',', array_fill(0, count($groupNames), '?'));
            $cardStmt = $this->db->prepare("SELECT COUNT(*) FROM (
                SELECT username FROM radusergroup WHERE network_id=? AND groupname IN ($marks)
                UNION
                SELECT username FROM um_vouchers_meta WHERE network_id=? AND profile_name=?
            ) linked_cards");
            $cardStmt->execute(array_merge([$networkId], $groupNames, [$networkId, (string)$row['name']]));
            $cardCount = (int)$cardStmt->fetchColumn();
            if ($cardCount > 0) {
                $this->db->rollBack();
                return ['success' => false, 'card_count' => $cardCount, 'error' => "لا يمكن حذف الباقة لأنها مرتبطة بـ {$cardCount} كرت. انقل أو احذف الكروت أولاً وفق إجراءات إدارة الكروت."];
            }
            $this->db->prepare('DELETE FROM radgroupreply WHERE network_id=? AND groupname=?')->execute([$networkId, (string)$row['name']]);
            $this->db->prepare('DELETE FROM radgroupcheck WHERE network_id=? AND groupname=?')->execute([$networkId, (string)$row['name']]);
            $this->db->prepare('DELETE FROM um_profiles_def WHERE network_id=? AND id=?')->execute([$networkId, (int)$row['id']]);
            $this->db->commit();
            return ['success' => true, 'message' => "تم حذف تعريف الباقة الفارغة «{$row['name']}» دون المساس بأي كروت أو جلسات"];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
    // ==========================================
    // CARD PRINT TEMPLATES & VISUAL DESIGNER
    // ==========================================

    // ==========================================
    // METHOD: exportProfiles
    // ==========================================
    public function exportProfiles() {
        $stmt = $this->db->prepare("SELECT name, name_for_users, validity, starts_at, price, cost_price, retail_price, shared_users, rate_limit, burst_rate, burst_threshold, burst_time, priority, transfer_limit, uptime_limit, address_list FROM um_profiles_def WHERE network_id=? ORDER BY name");$stmt->execute([$this->getActiveNetworkId()]);
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: importProfiles
    // ==========================================
    public function importProfiles($rows, $overwriteExisting = false) {
        if (empty($rows) || !is_array($rows)) throw new Exception('لا توجد بيانات صالحة للاستيراد');
        $inserted = 0; $updated = 0; $skipped = 0; $errors = [];
        foreach ($rows as $i => $r) {
            $name = trim($r['name'] ?? '');
            if (empty($name)) { $skipped++; continue; }
            try {
                $exists = $this->db->prepare("SELECT id FROM um_profiles_def WHERE name = ? AND network_id=?");
                $exists->execute([$name,$this->getActiveNetworkId()]);
                $existingRow = $exists->fetch();
                if ($existingRow && !$overwriteExisting) { $skipped++; continue; }
                $this->saveProfile($r);
                if ($existingRow) $updated++; else $inserted++;
            } catch (Exception $e) {
                $errors[] = "سطر " . ($i + 1) . " ({$name}): " . $e->getMessage();
            }
        }
        return [
            'success' => true,
            'inserted' => $inserted,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
            'message' => "تمت المعالجة: {$inserted} باقة جديدة، {$updated} تم تحديثها، {$skipped} تم تخطيها"
        ];
    }
    // ==========================================
    // ASSETS IMPORT & EXPORT
    // ==========================================

    // ==========================================
    // METHOD: syncProfileToRadius
    // ==========================================
    private function syncProfileToRadius($groupname, $data) {
        $networkId=$this->getActiveNetworkId();
        $this->db->prepare("DELETE FROM radgroupreply WHERE network_id=:network_id AND groupname = :g")->execute([':network_id'=>$networkId,':g' => $groupname]);
        $this->db->prepare("DELETE FROM radgroupcheck WHERE network_id=:network_id AND groupname = :g")->execute([':network_id'=>$networkId,':g' => $groupname]);
        $shared = (int)($data['shared_users'] ?? 1);
        if ($shared > 0) {
            $stmt = $this->db->prepare("INSERT INTO radgroupcheck (network_id,groupname, attribute, op, value) VALUES (:network_id,:g, 'Simultaneous-Use', ':=', :val)");
            $stmt->execute([':network_id'=>$networkId,':g' => $groupname, ':val' => (string)$shared]);
        }
        $mikrotikGroup = trim((string)($data['mikrotik_group'] ?? $groupname));
        $stmt = $this->db->prepare("INSERT INTO radgroupreply (network_id,groupname, attribute, op, value) VALUES (:network_id,:g, 'Mikrotik-Group', ':=', :val)");
        $stmt->execute([':network_id'=>$networkId,':g' => $groupname, ':val' => $mikrotikGroup]);
        // 1. Rate Limit (Rx/Tx)
        if (!empty($data['rate_limit'])) {
            $rateStr = trim($data['rate_limit']);
            if (!empty($data['burst_rate'])) {
                $rateStr .= ' ' . trim($data['burst_rate']);
                if (!empty($data['burst_threshold'])) {
                    $rateStr .= ' ' . trim($data['burst_threshold']);
                    if (!empty($data['burst_time'])) {
                        $rateStr .= ' ' . trim($data['burst_time']);
                        if (!empty($data['priority'])) {
                            $rateStr .= ' ' . (int)$data['priority'];
                        }
                    }
                }
            }
            $stmt = $this->db->prepare("INSERT INTO radgroupreply (network_id,groupname, attribute, op, value) VALUES (:network_id,:g, 'Mikrotik-Rate-Limit', ':=', :val)");
            $stmt->execute([':network_id'=>$networkId,':g' => $groupname, ':val' => $rateStr]);
        }
        // Note: Transfer-Limit and Session-Timeout are computed DYNAMICALLY per user session
        // in FreeRADIUS authorize_reply_query to ensure each reconnect receives ONLY remaining balance & time.
        // 4. Force Live Interim Accounting from MikroTik every 60 seconds
        $stmt = $this->db->prepare("INSERT INTO radgroupreply (network_id,groupname, attribute, op, value) VALUES (:network_id,:g, 'Acct-Interim-Interval', ':=', '60')");
        $stmt->execute([':network_id'=>$networkId,':g' => $groupname]);
        // 5. Address List
        if (!empty($data['address_list'])) {
            $stmt = $this->db->prepare("INSERT INTO radgroupreply (network_id,groupname, attribute, op, value) VALUES (:network_id,:g, 'Mikrotik-Address-List', ':=', :val)");
            $stmt->execute([':network_id'=>$networkId,':g' => $groupname, ':val' => trim($data['address_list'])]);
        }
    }

    // ==========================================
    // METHOD: ensurePackageTypeColumn
    // ==========================================
    private function ensurePackageTypeColumn() {
        $exists = $this->db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'um_profiles_def' AND COLUMN_NAME = 'package_type'");
        $exists->execute();
        if (!(int)$exists->fetchColumn()) {
            $this->db->exec("ALTER TABLE um_profiles_def ADD COLUMN package_type ENUM('paid','free') NOT NULL DEFAULT 'paid' AFTER name_for_users");
        }
    }

    // ==========================================
    // METHOD: ensureMikrotikGroupColumn
    // ==========================================
    private function ensureMikrotikGroupColumn() {
        $exists = $this->db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'um_profiles_def' AND COLUMN_NAME = 'mikrotik_group'");
        $exists->execute();
        if (!(int)$exists->fetchColumn()) {
            $this->db->exec("ALTER TABLE um_profiles_def ADD COLUMN mikrotik_group VARCHAR(64) NULL AFTER name");
        }
    }

    // ==========================================
    // METHOD: ensurePerformanceIndexes
    // ==========================================
    private static bool $perfIndexesEnsured = false;
    private function ensurePerformanceIndexes(): void {
        if (self::$perfIndexesEnsured) return;
        self::$perfIndexesEnsured = true;
        try {
            $existing = $this->db->query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'um_vouchers_meta'")->fetchAll(PDO::FETCH_COLUMN) ?: [];
            $existingSet = array_flip($existing);
            if (!isset($existingSet['idx_vm_net_id'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_id (network_id, id DESC)");
            }
            if (!isset($existingSet['idx_vm_net_batch_id'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_batch_id (network_id, batch_id, id DESC)");
            }
            if (!isset($existingSet['idx_vm_net_prof_id'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_prof_id (network_id, profile_name, id DESC)");
            }
            if (!isset($existingSet['idx_vm_net_status_id'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_status_id (network_id, status, id DESC)");
            }
            if (!isset($existingSet['idx_vm_net_first_exp'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_first_exp (network_id, first_login, expires_at)");
            }
            if (!isset($existingSet['idx_vm_net_kpi_covering'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_kpi_covering (network_id, status, is_free_quota, price, first_login, expires_at)");
            }
            if (!isset($existingSet['idx_vm_net_free_recip'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_free_recip (network_id, is_free_quota, free_recipient_id, status)");
            }
            if (!isset($existingSet['idx_vm_net_free_status'])) {
                $this->db->exec("ALTER TABLE um_vouchers_meta ADD INDEX idx_vm_net_free_status (network_id, is_free_quota, status, id DESC)");
            }
        } catch (Throwable $e) {
            // Ignore if index already exists or background DDL locked
        }
    }

    // ==========================================
    // METHOD: getPredefinedSpeedTiers
    // ==========================================
    // ==========================================
    // METHOD: getPredefinedSpeedTiers
    // ==========================================
    public static function getPredefinedSpeedTiers(): array {
        return [
            ['key' => '1M',   'rate' => '512K/1M',   'mbps' => 1,   'label' => 'اقتصادي (1 Mbps)'],
            ['key' => '2M',   'rate' => '1M/2M',     'mbps' => 2,   'label' => 'عادي (2 Mbps)'],
            ['key' => '2MS',  'rate' => '2M/2M',     'mbps' => 2,   'label' => 'متماثل (2 Mbps)'],
            ['key' => '3M',   'rate' => '1M/3M',     'mbps' => 3,   'label' => 'أساسي (3 Mbps)'],
            ['key' => '3MS',  'rate' => '3M/3M',     'mbps' => 3,   'label' => 'مستحسن (3 Mbps)'],
            ['key' => '5M',   'rate' => '2M/5M',     'mbps' => 5,   'label' => 'سريع (5 Mbps)'],
            ['key' => '5MS',  'rate' => '5M/5M',     'mbps' => 5,   'label' => 'متوسط (5 Mbps)'],
            ['key' => '10M',  'rate' => '3M/10M',    'mbps' => 10,  'label' => 'متقدم (10 Mbps)'],
            ['key' => '10MS', 'rate' => '10M/10M',   'mbps' => 10,  'label' => 'فائق (10 Mbps)'],
            ['key' => '20M',  'rate' => '5M/20M',    'mbps' => 20,  'label' => 'مميز (20 Mbps)'],
            ['key' => '20MS', 'rate' => '20M/20M',   'mbps' => 20,  'label' => 'أعمال (20 Mbps)'],
            ['key' => '30M',  'rate' => '10M/30M',   'mbps' => 30,  'label' => 'توربو (30 Mbps)'],
            ['key' => '30MS', 'rate' => '30M/30M',   'mbps' => 30,  'label' => 'توربو بلس (30 Mbps)'],
            ['key' => '50M',  'rate' => '15M/50M',   'mbps' => 50,  'label' => 'VIP فائق (50 Mbps)'],
            ['key' => '50MS', 'rate' => '50M/50M',   'mbps' => 50,  'label' => 'VIP برو (50 Mbps)'],
            ['key' => '100M', 'rate' => '25M/100M',  'mbps' => 100, 'label' => 'صاروخي (100 Mbps)'],
            ['key' => '100MS','rate' => '100M/100M', 'mbps' => 100, 'label' => 'صاروخي متماثل (100 Mbps)'],
            ['key' => '500M', 'rate' => '100M/500M', 'mbps' => 500, 'label' => 'ألياف ضوئية (500 Mbps)'],
            ['key' => '500MS','rate' => '500M/500M', 'mbps' => 500, 'label' => 'ألياف فائقة (500 Mbps)']
        ];
    }

    public static function parseRateToKbps(string $raw): int {
        $raw = strtoupper(trim($raw));
        if (preg_match('/^(\d+(?:\.\d+)?)\s*G$/i', $raw, $m)) return (int)(floatval($m[1]) * 1024 * 1024);
        if (preg_match('/^(\d+(?:\.\d+)?)\s*M$/i', $raw, $m)) return (int)(floatval($m[1]) * 1024);
        if (preg_match('/^(\d+(?:\.\d+)?)\s*K$/i', $raw, $m)) return (int)(floatval($m[1]));
        return (int)$raw;
    }

    public static function formatRatePart(string $raw): string {
        $raw = strtoupper(trim($raw));
        if (preg_match('/^(\d+(?:\.\d+)?)\s*G$/i', $raw, $m)) return $m[1] . ' Gbps';
        if (preg_match('/^(\d+(?:\.\d+)?)\s*M$/i', $raw, $m)) return $m[1] . ' Mbps';
        if (preg_match('/^(\d+(?:\.\d+)?)\s*K$/i', $raw, $m)) return $m[1] . ' Kbps';
        return $raw;
    }

    // ==========================================
    // METHOD: getSpeedTiers
    // ==========================================
    public function getSpeedTiers(bool $activeOnly = false): array {
        $this->ensureSpeedTiersTable();
        $networkId = $this->getActiveNetworkId();
        $sql = "SELECT id, label, rate_limit, sort_order, is_active FROM um_speed_tiers WHERE network_id=?" . ($activeOnly ? " AND is_active = 1" : "") . " ORDER BY sort_order ASC, id ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$networkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch used rate limits by profiles in this network
        $usedRates = [];
        try {
            $usedStmt = $this->db->prepare("SELECT rate_limit, default_speed, max_speed FROM um_profiles_def WHERE network_id=?");
            $usedStmt->execute([$networkId]);
            foreach ($usedStmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
                foreach (['rate_limit', 'default_speed', 'max_speed'] as $col) {
                    $val = strtoupper(trim((string)($p[$col] ?? '')));
                    if ($val !== '') {
                        $usedRates[$val] = ($usedRates[$val] ?? 0) + 1;
                    }
                }
            }
        } catch (Throwable $e) {}

        foreach ($rows as &$row) {
            $row['rate_limit'] = strtoupper(trim($row['rate_limit']));
            $row['key'] = $row['rate_limit'];
            $row['rate'] = $row['rate_limit'];
            $parts = explode('/', $row['rate_limit']);
            $rxRaw = trim($parts[0] ?? '1M');
            $txRaw = trim($parts[1] ?? ($parts[0] ?? '1M'));
            $rxKbps = self::parseRateToKbps($rxRaw);
            $txKbps = self::parseRateToKbps($txRaw);
            $row['rx_rate'] = $rxRaw;
            $row['tx_rate'] = $txRaw;
            $row['rx_label'] = self::formatRatePart($rxRaw);
            $row['tx_label'] = self::formatRatePart($txRaw);
            $row['rx_kbps'] = $rxKbps;
            $row['tx_kbps'] = $txKbps;
            $row['is_symmetric'] = ($rxKbps === $txKbps);
            $row['usage_count'] = (int)($usedRates[$row['rate_limit']] ?? 0);
            $row['is_used'] = ($row['usage_count'] > 0);
            $row['mbps'] = round($txKbps / 1024, 1);
        }
        return $rows;
    }

    // ==========================================
    // METHOD: saveSpeedTier
    // ==========================================
    public function saveSpeedTier(array $data): array {
        $this->ensureSpeedTiersTable();
        $networkId = $this->getActiveNetworkId();
        $id = (int)($data['id'] ?? 0);
        $rate = strtoupper(trim((string)($data['rate_limit'] ?? '')));
        $label = trim((string)($data['label'] ?? ''));

        if (!preg_match('/^\d+(?:\.\d+)?[KMG]\/\d+(?:\.\d+)?[KMG]$/i', $rate)) {
            return ['error' => 'صيغة السرعة غير صحيحة. الصيغة المعتمدة: الرفع/التحميل مثل 2M/5M أو 512K/1M'];
        }

        if ($label === '') {
            $parts = explode('/', $rate);
            $txFormatted = self::formatRatePart($parts[1] ?? ($parts[0] ?? ''));
            $label = "سرعة ({$txFormatted})";
        }

        $active = !empty($data['is_active']) ? 1 : 0;
        $sort = max(0, (int)($data['sort_order'] ?? 0));

        if ($id > 0) {
            $q = $this->db->prepare("UPDATE um_speed_tiers SET label=?, rate_limit=?, sort_order=?, is_active=? WHERE id=? AND network_id=?");
            $q->execute([$label, $rate, $sort, $active, $id, $networkId]);
        } else {
            // Check if exact rate already exists for this network
            $check = $this->db->prepare("SELECT id FROM um_speed_tiers WHERE network_id=? AND rate_limit=?");
            $check->execute([$networkId, $rate]);
            $existingId = (int)$check->fetchColumn();
            if ($existingId > 0) {
                $q = $this->db->prepare("UPDATE um_speed_tiers SET label=?, sort_order=?, is_active=? WHERE id=? AND network_id=?");
                $q->execute([$label, $sort, $active, $existingId, $networkId]);
                $id = $existingId;
            } else {
                $q = $this->db->prepare("INSERT INTO um_speed_tiers (network_id, label, rate_limit, sort_order, is_active) VALUES (?, ?, ?, ?, ?)");
                $q->execute([$networkId, $label, $rate, $sort, $active]);
                $id = (int)$this->db->lastInsertId();
            }
        }
        return ['success' => true, 'id' => $id, 'message' => 'تم حفظ السرعة بنجاح'];
    }

    // ==========================================
    // METHOD: deleteSpeedTier
    // ==========================================
    public function deleteSpeedTier(int $id): array {
        $this->ensureSpeedTiersTable();
        $networkId = $this->getActiveNetworkId();
        $q = $this->db->prepare("SELECT rate_limit, label FROM um_speed_tiers WHERE id=? AND network_id=?");
        $q->execute([$id, $networkId]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if (!$row) return ['error' => 'السرعة غير موجودة'];
        $rate = $row['rate_limit'];

        $pStmt = $this->db->prepare("SELECT name FROM um_profiles_def WHERE network_id=? AND (rate_limit=? OR default_speed=? OR max_speed=?)");
        $pStmt->execute([$networkId, $rate, $rate, $rate]);
        $usedProfiles = $pStmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($usedProfiles) > 0) {
            return [
                'error' => "لا يمكن حذف هذه السرعة لأنها مرتبطة بالباقات: (" . implode('، ', array_slice($usedProfiles, 0, 4)) . (count($usedProfiles) > 4 ? ' وغيرها...' : '') . ")؛ يرجى تعديل الباقات أولاً."
            ];
        }
        $this->db->prepare("DELETE FROM um_speed_tiers WHERE id=? AND network_id=?")->execute([$id, $networkId]);
        return ['success' => true, 'message' => 'تم حذف السرعة بنجاح'];
    }

    // ==========================================
    // METHOD: resetSpeedTiers
    // ==========================================
    public function resetSpeedTiers(): array {
        $networkId = $this->getActiveNetworkId();
        $this->ensureSpeedTiersTable();

        $profileStmt = $this->db->prepare("SELECT DISTINCT rate_limit, default_speed, max_speed FROM um_profiles_def WHERE network_id=?");
        $profileStmt->execute([$networkId]);
        $usedRates = [];
        foreach ($profileStmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
            foreach (['rate_limit', 'default_speed', 'max_speed'] as $col) {
                $val = strtoupper(trim((string)($p[$col] ?? '')));
                if ($val !== '') $usedRates[$val] = true;
            }
        }

        $this->db->prepare("DELETE FROM um_speed_tiers WHERE network_id=?")->execute([$networkId]);

        $insert = $this->db->prepare("INSERT INTO um_speed_tiers (network_id, label, rate_limit, sort_order, is_active) VALUES (?, ?, ?, ?, 1)");
        $predefined = self::getPredefinedSpeedTiers();
        $order = 1;
        $seenRates = [];
        foreach ($predefined as $tier) {
            $rate = strtoupper(trim($tier['rate']));
            if (isset($seenRates[$rate])) continue;
            $seenRates[$rate] = true;
            $insert->execute([$networkId, $tier['label'], $rate, $order++]);
        }

        foreach (array_keys($usedRates) as $rate) {
            if (!isset($seenRates[$rate])) {
                $seenRates[$rate] = true;
                $parts = explode('/', $rate);
                $tx = self::formatRatePart($parts[1] ?? ($parts[0] ?? ''));
                $label = "مخصص ({$tx})";
                $insert->execute([$networkId, $label, $rate, $order++]);
            }
        }

        return ['success' => true, 'message' => 'تم إعادة تنظيم وترتيب سرعات الشبكة بنجاح وفق المعايير القياسية'];
    }

    // ==========================================
    // METHOD: ensureSpeedTiersTable
    // ==========================================
    private function ensureSpeedTiersTable(): void {
        $this->db->exec("CREATE TABLE IF NOT EXISTS um_speed_tiers (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            network_id INT NOT NULL DEFAULT 1,
            label VARCHAR(80) NOT NULL,
            rate_limit VARCHAR(64) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_speed_tier_net (network_id, sort_order),
            KEY idx_speed_tier_rate (network_id, rate_limit)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $networkId = $this->getActiveNetworkId();
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM um_speed_tiers WHERE network_id=?");
        $countStmt->execute([$networkId]);
        $count = (int)$countStmt->fetchColumn();

        if ($count === 0) {
            $insert = $this->db->prepare("INSERT INTO um_speed_tiers (network_id, label, rate_limit, sort_order, is_active) VALUES (?, ?, ?, ?, 1)");
            foreach (self::getPredefinedSpeedTiers() as $index => $tier) {
                $insert->execute([$networkId, $tier['label'], strtoupper($tier['rate']), $index + 1]);
            }
            $profileStmt = $this->db->prepare("SELECT DISTINCT rate_limit FROM um_profiles_def WHERE network_id=? AND rate_limit IS NOT NULL AND rate_limit <> ''");
            $profileStmt->execute([$networkId]);
            $profileRates = $profileStmt->fetchAll(PDO::FETCH_COLUMN);
            $checkRate = $this->db->prepare("SELECT id FROM um_speed_tiers WHERE network_id=? AND rate_limit=?");
            foreach ($profileRates as $rate) {
                $rate = strtoupper(trim((string)$rate));
                $checkRate->execute([$networkId, $rate]);
                if (!$checkRate->fetchColumn()) {
                    $insert->execute([$networkId, $rate, $rate, 999]);
                }
            }
        }
    }

    // ==========================================
    // METHOD: getUsers
    // ==========================================
    public function getUsers($page = 1, $limit = 50, $search = '', $profile = '', $status = '', $ownerId = null, $batchId = '', $sortBy = 'id', $sortDir = 'DESC', $cardKind = '') {
        $this->ensurePerformanceIndexes();
        $networkId = $this->getActiveNetworkId();
        $page = max(1, (int)$page);
        $limit = max(10, min(1000, (int)$limit));
        $offset = ($page - 1) * $limit;
        
        $where = ["m.network_id=:active_network"];
        $params = [':active_network' => $networkId];
        
        // Exclude VIP free vouchers assigned to specific registered system recipients (they belong exclusively to Free Vouchers Granted tab)
        $where[] = "(COALESCE(m.is_free_quota, 0) = 0 OR m.free_recipient_id IS NULL OR m.free_recipient_id = 0)";
        
        if (!empty($search)) {
            $where[] = "(m.username LIKE :s_user OR m.comment LIKE :s_comment OR m.batch_id LIKE :s_batch OR m.locked_mac LIKE :s_mac OR m.buyer_phone LIKE :s_phone OR m.buyer_name LIKE :s_name)";
            $params[':s_user'] = "%$search%";
            $params[':s_comment'] = "%$search%";
            $params[':s_batch'] = "%$search%";
            $params[':s_mac'] = "%$search%";
            $params[':s_phone'] = "%$search%";
            $params[':s_name'] = "%$search%";
        }
        if (!empty($profile)) {
            $where[] = "m.profile_name = :p";
            $params[':p'] = $profile;
        }
        if (!empty($ownerId)) {
            $where[] = "(m.owner_admin_id = :owner_id OR m.printed_by_admin_id = :printed_by_id OR m.sold_by_admin_id = :sold_by_id)";
            $params[':owner_id'] = (int)$ownerId;
            $params[':printed_by_id'] = (int)$ownerId;
            $params[':sold_by_id'] = (int)$ownerId;
        } else {
            $ctx = $this->getActiveAdminContext();
            $callerRole = (string)($ctx['role'] ?? '');
            $dataScope = (string)($ctx['data_scope'] ?? 'all');
            $callerId = (int)($ctx['id'] ?? 0);
            if (!in_array($callerRole, ['system_owner', 'superadmin'], true) && $dataScope !== 'all' && $callerId > 0) {
                $where[] = "(m.owner_admin_id = :auto_owner_id OR m.printed_by_admin_id = :auto_printed_by_id OR m.sold_by_admin_id = :auto_sold_by_id)";
                $params[':auto_owner_id'] = $callerId;
                $params[':auto_printed_by_id'] = $callerId;
                $params[':auto_sold_by_id'] = $callerId;
            }
        }
        if (!empty($batchId)) {
            $where[] = "m.batch_id = :batch_filter";
            $params[':batch_filter'] = $batchId;
        }
        
        // Pre-fetch free profiles for fast IN/NOT IN without joining table across whole dataset
        $freeProfilesStmt = $this->db->prepare("SELECT name FROM um_profiles_def WHERE network_id=? AND package_type='free'");
        $freeProfilesStmt->execute([$networkId]);
        $freeProfiles = $freeProfilesStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $freeProfSql = '';
        $paidProfSql = '';
        if (!empty($freeProfiles)) {
            $escaped = "'" . implode("','", array_map(function($v) { return addslashes((string)$v); }, $freeProfiles)) . "'";
            $freeProfSql = " OR m.profile_name IN ($escaped)";
            $paidProfSql = " AND (m.profile_name NOT IN ($escaped) OR m.profile_name IS NULL)";
        }

        if ($cardKind === 'free') {
            $where[] = "(COALESCE(m.is_free_quota, 0) = 1 OR COALESCE(m.price, 0) = 0$freeProfSql)";
        } elseif ($cardKind === 'paid') {
            $where[] = "(COALESCE(m.is_free_quota, 0) = 0 AND COALESCE(m.price, 0) > 0$paidProfSql)";
        }

        if ($status === 'online') {
            $where[] = "m.username IN (SELECT act.username FROM radacct act WHERE act.network_id=:active_network AND act.acctstoptime IS NULL)";
        } elseif ($status === 'disabled') {
            $where[] = "m.status = 'disabled'";
        } elseif ($status === 'expired') {
            $where[] = "(m.expires_at IS NOT NULL AND m.expires_at <= NOW())";
        } elseif ($status === 'fresh') {
            $where[] = "m.first_login IS NULL";
        } elseif ($status === 'used') {
            $where[] = "m.first_login IS NOT NULL";
        } elseif ($status === 'active') {
            $where[] = "(m.status = 'active' OR m.status IS NULL) AND (m.expires_at IS NULL OR m.expires_at > NOW())";
        }
        $whereClause = implode(' AND ', $where);

        // Allowed sort columns
        $sortMap = [
            'id' => 'm.id',
            'username' => 'm.username',
            'profile_name' => 'm.profile_name',
            'first_login' => 'm.first_login',
            'expires_at' => 'm.expires_at'
        ];
        $sortColumn = $sortMap[$sortBy] ?? 'm.id';
        $sortDir = strtoupper($sortDir) === 'ASC' ? 'ASC' : 'DESC';

        // 1. Fast Indexed Count Query
        $countSql = "SELECT COUNT(*) FROM um_vouchers_meta m WHERE $whereClause";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // 2. High-speed Paginated Data Query directly on um_vouchers_meta
        $sql = "SELECT m.id, m.username, 'Cleartext-Password' as pass_attr,
                       m.profile_name,
                       m.batch_id, COALESCE(NULLIF(m.sale_price,0),m.price,0) AS price, m.price AS list_price, m.sale_price, m.validity, m.comment, m.first_login, m.expires_at,
                       m.created_at, m.sheet_no, (CASE WHEN (COALESCE(m.is_free_quota, 0) = 1 OR COALESCE(m.price, 0) = 0$freeProfSql) THEN 1 ELSE 0 END) AS is_free_quota, m.source_balance_invoice_id,
                       m.is_sold, m.invoice_id, m.printed_by_admin_id,
                       CASE
                           WHEN m.source_balance_invoice_id IS NOT NULL OR m.batch_id LIKE 'DIGITAL-%' THEN 'digital'
                           WHEN m.sheet_no IS NOT NULL THEN 'paper'
                           ELSE 'individual'
                       END AS card_type,
                       m.status as voucher_status,
                       m.owner_admin_id, m.sold_at, adm.fullname as owner_name,
                       (CASE WHEN m.status = 'disabled' THEN 1 ELSE 0 END) as is_disabled,
                       0 as is_online,
                       p.uptime_limit as profile_uptime_limit
                FROM um_vouchers_meta m
                LEFT JOIN um_profiles_def p ON p.name = m.profile_name AND p.network_id=m.network_id
                LEFT JOIN um_admins adm ON m.owner_admin_id = adm.id
                WHERE $whereClause
                ORDER BY $sortColumn $sortDir
                LIMIT :limit OFFSET :offset";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll();

        // 3. Attach traffic stats for the fetched page users in a single ultra-fast indexed query
        if (!empty($users)) {
            $usernames = array_values(array_unique(array_column($users, 'username')));
            $trafficMap = [];
            if (!empty($usernames)) {
                $placeholders = implode(',', array_fill(0, count($usernames), '?'));
                $tStmt = $this->db->prepare("
                    SELECT username,
                           SUM(acctsessiontime) as total_time,
                           SUM(acctinputoctets) as download_bytes,
                           SUM(acctoutputoctets) as upload_bytes,
                           SUM(acctinputoctets + acctoutputoctets) as total_bytes,
                           MAX(CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END) as is_online
                    FROM radacct
                    WHERE network_id=? AND username IN ($placeholders)
                    GROUP BY username
                ");
                $tStmt->execute(array_merge([$networkId], $usernames));
                foreach ($tStmt->fetchAll() as $tRow) {
                    $trafficMap[$tRow['username']] = $tRow;
                }
            }

            $now = time();
            foreach ($users as &$u) {
                $un = $u['username'];
                $t = $trafficMap[$un] ?? null;
                $totalTime = (int)($t['total_time'] ?? 0);
                $u['total_uptime'] = $totalTime;
                $u['is_online'] = (int)($t['is_online'] ?? 0);
                $u['total_download'] = (float)($t['download_bytes'] ?? 0);
                $u['total_upload'] = (float)($t['upload_bytes'] ?? 0);
                $u['total_bytes'] = (float)($t['total_bytes'] ?? 0);

                // Compute can_delete_card efficiently without SQL subquery
                $hasTraffic = !empty($t);
                $isSold = (int)($u['is_sold'] ?? 0);
                $hasFirstLogin = !empty($u['first_login']);
                $vStatus = (string)($u['voucher_status'] ?? '');
                $ownerMatches = (empty($u['owner_admin_id']) || $u['owner_admin_id'] == ($u['printed_by_admin_id'] ?? null));
                $u['can_delete_card'] = (!$isSold && empty($u['invoice_id']) && !$hasFirstLogin && !in_array($vStatus, ['used', 'expired'], true) && $ownerMatches && !$hasTraffic) ? 1 : 0;

                $uptimeLimit = (int)($u['profile_uptime_limit'] ?? 0);
                $u['remaining_uptime'] = ($uptimeLimit > 0) ? max(0, $uptimeLimit - $totalTime) : null;

                $expSeconds = (!empty($u['expires_at'])) ? max(0, strtotime($u['expires_at']) - $now) : null;
                if ($expSeconds !== null && $u['remaining_uptime'] !== null) {
                    $u['remaining_time'] = min($expSeconds, $u['remaining_uptime']);
                } elseif ($expSeconds !== null) {
                    $u['remaining_time'] = $expSeconds;
                } elseif ($u['remaining_uptime'] !== null) {
                    $u['remaining_time'] = $u['remaining_uptime'];
                } else {
                    $u['remaining_time'] = null;
                }
            }
            unset($u);
        }

        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => ceil($total / $limit) ?: 1,
            'data' => $users
        ];
    }

    // ==========================================
    // METHOD: getUserDetails
    // ==========================================
    public function getUserDetails($username) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT c.username, c.value as password, c.attribute as pass_attr,
                                           ug.groupname as profile_name,
                                           m.batch_id, m.price, m.validity, m.comment, m.first_login, m.expires_at
                                    FROM radcheck c
                                    LEFT JOIN (SELECT username,network_id,MAX(groupname) as groupname FROM radusergroup GROUP BY username,network_id) ug ON c.username = ug.username AND ug.network_id=c.network_id
                                    LEFT JOIN um_vouchers_meta m ON c.username = m.username AND m.network_id=c.network_id
                                    WHERE c.username = ? AND c.network_id=? AND c.attribute IN ('Cleartext-Password', 'User-Password')
                                    LIMIT 1");
        $stmt->execute([$username,$networkId]);
        $user = $stmt->fetch();
        if (!$user) return null;
        $checks = $this->db->prepare("SELECT attribute, op, value FROM radcheck WHERE username = ? AND network_id=?");
        $checks->execute([$username,$networkId]);
        $user['check_attributes'] = $checks->fetchAll();
        $replies = $this->db->prepare("SELECT attribute, op, value FROM radreply WHERE username = ? AND network_id=?");
        $replies->execute([$username,$networkId]);
        $user['reply_attributes'] = $replies->fetchAll();
        $user['rate_limit'] = '';
        $user['shared_users'] = 0;
        $user['mac_lock'] = '';
        foreach ($user['reply_attributes'] as $attr) {
            if ($attr['attribute'] === 'Mikrotik-Rate-Limit') $user['rate_limit'] = (string)$attr['value'];
        }
        foreach ($user['check_attributes'] as $attr) {
            if ($attr['attribute'] === 'Simultaneous-Use') $user['shared_users'] = (int)$attr['value'];
            if ($attr['attribute'] === 'Calling-Station-Id') $user['mac_lock'] = (string)$attr['value'];
        }
        $user['is_disabled'] = false;
        foreach ($user['check_attributes'] as $attr) {
            if ($attr['attribute'] === 'Auth-Type' && $attr['value'] === 'Reject') {
                $user['is_disabled'] = true;
            }
        }
        return $user;
    }

    // ==========================================
    // METHOD: getUserUsageDetails
    // ==========================================
    public function getUserUsageDetails($username) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT c.username, c.value as password, c.attribute as pass_attr,
                                           COALESCE(m.profile_name, ug.groupname) as profile_name,
                                           p.validity as profile_validity, p.price as profile_price,
                                           COALESCE((SELECT rr.value FROM radreply rr WHERE rr.username = c.username AND rr.network_id=c.network_id AND rr.attribute = 'Mikrotik-Rate-Limit' ORDER BY rr.id DESC LIMIT 1), p.rate_limit) AS rate_limit,
                                           p.transfer_limit, p.uptime_limit as profile_uptime_limit,
                                           m.batch_id, m.price, m.validity, m.comment, m.first_login, m.expires_at, m.status, m.created_at,
                                           m.sheet_no, (CASE WHEN (COALESCE(m.is_free_quota, 0) = 1 OR COALESCE(m.price, 0) = 0 OR COALESCE(p.package_type, '') = 'free') THEN 1 ELSE 0 END) AS is_free_quota, m.source_balance_invoice_id,
                                           CASE
                                               WHEN m.source_balance_invoice_id IS NOT NULL OR m.batch_id LIKE 'DIGITAL-%' THEN 'digital'
                                               WHEN m.sheet_no IS NOT NULL THEN 'paper'
                                               ELSE 'individual'
                                           END AS card_type
                                    FROM radcheck c
                                    LEFT JOIN um_vouchers_meta m ON c.username = m.username AND m.network_id=c.network_id
                                    LEFT JOIN (SELECT username,network_id,MAX(groupname) as groupname FROM radusergroup GROUP BY username,network_id) ug ON c.username = ug.username AND ug.network_id=c.network_id
                                    LEFT JOIN um_profiles_def p ON p.name = COALESCE(m.profile_name, ug.groupname) AND p.network_id=c.network_id
                                    WHERE c.username = ? AND c.network_id=?
                                    ORDER BY (c.attribute = 'Cleartext-Password') DESC
                                    LIMIT 1");
        $stmt->execute([$username,$networkId]);
        $user = $stmt->fetch();
        if (!$user) return null;
        $aggStmt = $this->db->prepare("
            SELECT 
                COUNT(*) as total_sessions,
                COALESCE(SUM(acctsessiontime), 0) as total_uptime,
                COALESCE(SUM(acctinputoctets), 0) as total_upload,
                COALESCE(SUM(acctoutputoctets), 0) as total_download,
                MIN(acctstarttime) as first_connection,
                MAX(COALESCE(acctstoptime, acctstarttime)) as last_connection
            FROM radacct 
            WHERE username = ? AND network_id=?
        ");
        $aggStmt->execute([$username,$networkId]);
        $agg = $aggStmt->fetch();
        $user['total_sessions'] = (int)$agg['total_sessions'];
        $user['total_uptime'] = (int)$agg['total_uptime'];
        $uptimeLimit = max(0, (int)($user['profile_uptime_limit'] ?? 0));
        $user['remaining_uptime'] = $uptimeLimit > 0 ? max(0, $uptimeLimit - $user['total_uptime']) : null;
        $user['uptime_unlimited'] = $uptimeLimit <= 0;
        $expiryRemaining = !empty($user['expires_at']) ? max(0, strtotime($user['expires_at']) - time()) : null;
        if ($user['remaining_uptime'] !== null && $expiryRemaining !== null) {
            $user['remaining_time'] = min($user['remaining_uptime'], $expiryRemaining);
            $user['remaining_time_source'] = 'uptime_and_expiry';
        } elseif ($user['remaining_uptime'] !== null) {
            $user['remaining_time'] = $user['remaining_uptime'];
            $user['remaining_time_source'] = 'uptime';
        } elseif ($expiryRemaining !== null) {
            $user['remaining_time'] = $expiryRemaining;
            $user['remaining_time_source'] = 'expiry';
        } else {
            $user['remaining_time'] = null;
            $user['remaining_time_source'] = 'unlimited';
        }
        $user['total_upload'] = (float)$agg['total_upload'];
        $user['total_download'] = (float)$agg['total_download'];
        $user['total_bytes'] = $user['total_upload'] + $user['total_download'];
        $user['first_connection'] = $agg['first_connection'];
        $user['last_connection'] = $agg['last_connection'];
        $actStmt = $this->db->prepare("
            SELECT radacctid, acctsessionid, username, nasipaddress, nasportid, framedipaddress, callingstationid, acctstarttime, acctsessiontime, acctinputoctets, acctoutputoctets
            FROM radacct 
            WHERE username = ? AND network_id=? AND acctstoptime IS NULL 
            LIMIT 1
        ");
        $actStmt->execute([$username,$networkId]);
        $user['active_session'] = $actStmt->fetch();
        if ($user['active_session']) {
            $user['active_session']['username'] = $username;
        }
        $user['is_online'] = !empty($user['active_session']);
        $histStmt = $this->db->prepare("
            SELECT a.radacctid, a.acctsessionid, a.nasipaddress, a.nasportid, COALESCE(n.shortname, a.nasipaddress) as nas_name,
                   a.framedipaddress, a.callingstationid,
                   a.acctstarttime, a.acctstoptime, a.acctsessiontime,
                   a.acctinputoctets, a.acctoutputoctets,
                   (a.acctinputoctets + a.acctoutputoctets) as total_bytes,
                   a.acctterminatecause
            FROM radacct a
            LEFT JOIN nas n ON a.nasipaddress = n.nasname AND n.network_id=a.network_id
            WHERE a.username = ? AND a.network_id=?
            ORDER BY a.radacctid DESC
            LIMIT 20
        ");
        $histStmt->execute([$username,$networkId]);
        $user['sessions_history'] = $histStmt->fetchAll();
        $limitBytes = (float)($user['transfer_limit'] ?? 0);
        if ($limitBytes > 0) {
            $user['remaining_bytes'] = max(0, $limitBytes - $user['total_bytes']);
            $user['quota_percent'] = min(100, round(($user['total_bytes'] / $limitBytes) * 100, 1));
        } else {
            $user['remaining_bytes'] = null;
            $user['quota_percent'] = 0;
        }
        return $user;
    }

    // ==========================================
    // METHOD: getUserStatsKPIs
    // ==========================================
    public function getUserStatsKPIs($search = '', $profile = '', $ownerId = null, $batchId = '', $cardKind = '') {
        $this->ensurePerformanceIndexes();
        $networkId = $this->getActiveNetworkId();
        $where = ["m.network_id=:kpi_network"];
        $params = [':kpi_network' => $networkId];
        
        // Exclude VIP free vouchers assigned to specific registered system recipients
        $where[] = "(COALESCE(m.is_free_quota, 0) = 0 OR m.free_recipient_id IS NULL OR m.free_recipient_id = 0)";
        if (!empty($search)) {
            $where[] = "(m.username LIKE :s_user OR m.comment LIKE :s_comment OR m.batch_id LIKE :s_batch)";
            $params[':s_user'] = "%$search%";
            $params[':s_comment'] = "%$search%";
            $params[':s_batch'] = "%$search%";
        }
        if (!empty($profile)) {
            $where[] = "m.profile_name = :p";
            $params[':p'] = $profile;
        }
        if (!empty($ownerId)) {
            $where[] = "(m.owner_admin_id = :owner_id OR m.printed_by_admin_id = :printed_by_id OR m.sold_by_admin_id = :sold_by_id)";
            $params[':owner_id'] = (int)$ownerId;
            $params[':printed_by_id'] = (int)$ownerId;
            $params[':sold_by_id'] = (int)$ownerId;
        } else {
            $ctx = $this->getActiveAdminContext();
            $callerRole = (string)($ctx['role'] ?? '');
            $dataScope = (string)($ctx['data_scope'] ?? 'all');
            $callerId = (int)($ctx['id'] ?? 0);
            if (!in_array($callerRole, ['system_owner', 'superadmin'], true) && $dataScope !== 'all' && $callerId > 0) {
                $where[] = "(m.owner_admin_id = :auto_owner_id OR m.printed_by_admin_id = :auto_printed_by_id OR m.sold_by_admin_id = :auto_sold_by_id)";
                $params[':auto_owner_id'] = $callerId;
                $params[':auto_printed_by_id'] = $callerId;
                $params[':auto_sold_by_id'] = $callerId;
            }
        }
        if (!empty($batchId)) {
            $where[] = "m.batch_id = :batch_filter";
            $params[':batch_filter'] = $batchId;
        }
        
        // Pre-fetch free profiles for fast IN/NOT IN without joining table across whole dataset
        $freeProfilesStmt = $this->db->prepare("SELECT name FROM um_profiles_def WHERE network_id=? AND package_type='free'");
        $freeProfilesStmt->execute([$networkId]);
        $freeProfiles = $freeProfilesStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $freeProfSql = '';
        $paidProfSql = '';
        if (!empty($freeProfiles)) {
            $escaped = "'" . implode("','", array_map(function($v) { return addslashes((string)$v); }, $freeProfiles)) . "'";
            $freeProfSql = " OR m.profile_name IN ($escaped)";
            $paidProfSql = " AND (m.profile_name NOT IN ($escaped) OR m.profile_name IS NULL)";
        }

        if ($cardKind === 'free') {
            $where[] = "(COALESCE(m.is_free_quota, 0) = 1 OR COALESCE(m.price, 0) = 0$freeProfSql)";
        } elseif ($cardKind === 'paid') {
            $where[] = "(COALESCE(m.is_free_quota, 0) = 0 AND COALESCE(m.price, 0) > 0$paidProfSql)";
        }
        $whereClause = implode(' AND ', $where);

        // 1. High-speed single-table indexed aggregation on um_vouchers_meta
        $sql = "SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN m.status = 'disabled' THEN 1 ELSE 0 END) as disabled,
                    SUM(CASE WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW() THEN 1 ELSE 0 END) as expired,
                    SUM(CASE WHEN m.first_login IS NULL THEN 1 ELSE 0 END) as fresh,
                    SUM(CASE WHEN m.first_login IS NOT NULL THEN 1 ELSE 0 END) as used,
                    SUM(CASE WHEN (COALESCE(m.is_free_quota, 0) = 0 AND COALESCE(m.price, 0) > 0$paidProfSql) THEN 1 ELSE 0 END) as paid,
                    SUM(CASE WHEN (COALESCE(m.is_free_quota, 0) = 1 OR COALESCE(m.price, 0) = 0$freeProfSql) THEN 1 ELSE 0 END) as free
                FROM um_vouchers_meta m
                WHERE $whereClause";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        // 2. High-speed online count from active radacct sessions (indexed on idx_acctstop_user)
        $onlineSql = "SELECT COUNT(DISTINCT act.username) FROM radacct act WHERE act.network_id=:online_network AND act.acctstoptime IS NULL";
        if (!empty($profile) || !empty($batchId) || !empty($ownerId) || $cardKind !== '' || !empty($search)) {
            $onlineSql .= " AND EXISTS (SELECT 1 FROM um_vouchers_meta m WHERE m.username = act.username AND m.network_id=act.network_id AND $whereClause)";
            $onlineParams = $params;
            $onlineParams[':online_network'] = $networkId;
            $onlineStmt = $this->db->prepare($onlineSql);
            $onlineStmt->execute($onlineParams);
        } else {
            $onlineStmt = $this->db->prepare($onlineSql);
            $onlineStmt->execute([':online_network' => $networkId]);
        }
        $online = (int)$onlineStmt->fetchColumn();

        $total = (int)($row['total'] ?? 0);
        $disabled = (int)($row['disabled'] ?? 0);
        $expired = (int)($row['expired'] ?? 0);
        $fresh = (int)($row['fresh'] ?? 0);
        $used = (int)($row['used'] ?? 0);
        $paid = (int)($row['paid'] ?? 0);
        $free = (int)($row['free'] ?? 0);
        $active = max(0, $total - $disabled - $expired);

        return [
            'total' => $total,
            'online' => $online,
            'active' => $active,
            'fresh' => $fresh,
            'used' => $used,
            'paid' => $paid,
            'free' => $free,
            'expired' => $expired,
            'disabled' => $disabled
        ];
    }

    // ==========================================
    // METHOD: saveUser
    // ==========================================
    public function saveUser($data) {
        $networkId=$this->getActiveNetworkId();
        $username = trim((string)($data['username'] ?? ''));
        // An empty value is intentional: voucher authentication without a password.
        $password = trim((string)($data['password'] ?? ''));
        $profile = trim($data['profile'] ?? '');
        $comment = trim($data['comment'] ?? '');
        $macLock = trim($data['mac_lock'] ?? '');
        $staticIp = trim($data['static_ip'] ?? '');
        $rateLimit = trim($data['rate_limit'] ?? '');
        $sharedUsers = (int)($data['shared_users'] ?? 0);
        $isDisabled = !empty($data['is_disabled']);
        if (empty($username)) throw new Exception('Username is required');
        if (preg_match('/^router_[0-9]+$/', $username)) throw new Exception('هذا الاسم محجوز لحسابات SSTP؛ اختر اسم كرت مختلفًا');

        // Check if adding new card/user: only system_owner / superadmin is authorized
        $chk = $this->db->prepare("SELECT 1 FROM radcheck WHERE username = ? AND network_id = ? LIMIT 1");
        $chk->execute([$username, $networkId]);
        $exists = $chk->fetchColumn();
        $callerRole = (string)($_SESSION['role'] ?? ($_SESSION['admin_role'] ?? ''));
        if (!$exists && !empty($callerRole) && !in_array($callerRole, ['system_owner', 'superadmin'], true)) {
            return ['error' => 'عذراً، إضافة كرت أو مشترك جديد مخصصة لمالك النظام فقط'];
        }

        $this->db->prepare("DELETE FROM radcheck WHERE username = ? AND network_id=?")->execute([$username,$networkId]);
        $this->db->prepare("DELETE FROM radreply WHERE username = ? AND network_id=?")->execute([$username,$networkId]);
        $this->db->prepare("DELETE FROM radusergroup WHERE username = ? AND network_id=?")->execute([$username,$networkId]);
        $stmt = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Cleartext-Password', ':=', ?)");
        $stmt->execute([$networkId,$username, $password]);
        if ($isDisabled) {
            $stmt = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Auth-Type', ':=', 'Reject')");
            $stmt->execute([$networkId,$username]);
        }
        if (!empty($macLock)) {
            $stmt = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Calling-Station-Id', '==', ?)");
            $stmt->execute([$networkId,$username, $macLock]);
        }
        if ($sharedUsers > 0) {
            $stmt = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Simultaneous-Use', ':=', ?)");
            $stmt->execute([$networkId,$username, (string)$sharedUsers]);
        }
        if (!empty($staticIp)) {
            $stmt = $this->db->prepare("INSERT INTO radreply (network_id,username, attribute, op, value) VALUES (?, ?, 'Framed-IP-Address', ':=', ?)");
            $stmt->execute([$networkId,$username, $staticIp]);
        }
        if (!empty($rateLimit)) {
            $stmt = $this->db->prepare("INSERT INTO radreply (network_id,username, attribute, op, value) VALUES (?, ?, 'Mikrotik-Rate-Limit', ':=', ?)");
            $stmt->execute([$networkId,$username, $rateLimit]);
        }
        if (!empty($profile)) {
            $stmt = $this->db->prepare("INSERT INTO radusergroup (network_id,username, groupname, priority) VALUES (?, ?, ?, 1)");
            $stmt->execute([$networkId,$username, $profile]);
        }
        $isFree = 0;
        $profPrice = 0;
        if (!empty($profile)) {
            $pRow = $this->db->query("SELECT price, package_type FROM um_profiles_def WHERE network_id=$networkId AND name=" . $this->db->quote($profile))->fetch();
            if ($pRow) {
                $profPrice = (float)($pRow['price'] ?? 0);
                if (($pRow['package_type'] ?? '') === 'free' || $profPrice <= 0) {
                    $isFree = 1;
                }
            }
        }
        $metaStmt = $this->db->prepare("INSERT INTO um_vouchers_meta (network_id,username, profile_name, price, comment, is_free_quota) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE profile_name = VALUES(profile_name), comment = VALUES(comment), is_free_quota = VALUES(is_free_quota)");
        $metaStmt->execute([$networkId,$username, $profile, $profPrice, $comment, $isFree]);
        return ['success' => true];
    }

    // ==========================================
    // METHOD: setUserStatus
    // ==========================================
        public function setUserStatus($username, $enable = true) {
        if (preg_match('/^router_[0-9]+$/', (string)$username)) throw new Exception('حساب SSTP يُدار من صفحة الراوترات');
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork([(string)$username]);
        if ($enable) {
            $this->assertNotQuarantined([(string)$username],$networkId);
            // STRICT SECURITY: Prevent manual activation of unsold cards
            $mStmt = $this->db->prepare("SELECT is_sold, status FROM um_vouchers_meta WHERE username = ? AND network_id=?");
            $mStmt->execute([$username,$networkId]);
            $meta = $mStmt->fetch();
            if ($meta && (int)$meta['is_sold'] === 0) {
                throw new Exception('لا يمكن تفعيل الكروت غير المباعة إلا من خلال فاتورة بيع نظامية في قسم المبيعات');
            }
            $this->db->prepare("DELETE FROM radcheck WHERE username = ? AND network_id=? AND attribute = 'Auth-Type' AND value = 'Reject'")->execute([$username,$networkId]);
            $this->db->prepare("UPDATE um_vouchers_meta SET status = 'active' WHERE username = ? AND network_id=?")->execute([$username,$networkId]);
        } else {
            $this->db->prepare("DELETE FROM radcheck WHERE username = ? AND network_id=? AND attribute = 'Auth-Type'")->execute([$username,$networkId]);
            $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Auth-Type', ':=', 'Reject')")->execute([$networkId,$username]);
            $this->db->prepare("UPDATE um_vouchers_meta SET status = 'disabled' WHERE username = ? AND network_id=?")->execute([$username,$networkId]);
        }
        return ['success' => true];
    }

    // ==========================================
    // METHOD: deleteUser
    // ==========================================
    public function deleteUser($username, $isSystemMaintenance = false) {
        if (preg_match('/^router_[0-9]+$/', (string)$username)) throw new Exception('لا يمكن حذف حساب SSTP من صفحة الكروت');
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork([(string)$username]);
        $this->db->beginTransaction();
        try {
            $stmt=$this->db->prepare("SELECT m.id,m.is_sold,m.invoice_id,m.first_login,m.status,m.owner_admin_id,m.printed_by_admin_id,
                EXISTS(SELECT 1 FROM radacct ra WHERE ra.network_id=m.network_id AND ra.username=m.username) has_sessions
                FROM um_vouchers_meta m WHERE m.network_id=? AND m.username=? FOR UPDATE");
            $stmt->execute([$networkId,(string)$username]); $card=$stmt->fetch(PDO::FETCH_ASSOC);
            if (!$card) throw new Exception('لا يمكن حذف مستخدم غير مسجل كبطاقة مخزنية');
            $unassigned=empty($card['owner_admin_id']) || (int)$card['owner_admin_id']===(int)($card['printed_by_admin_id']??0);
            $unused=empty($card['first_login']) && empty($card['has_sessions']) && !in_array((string)$card['status'],['used','expired'],true);
            if ((int)$card['is_sold']===1 || !empty($card['invoice_id']) || !$unused || !$unassigned) throw new Exception('الحذف مسموح فقط لبطاقة جديدة غير مستخدمة وغير مباعة وغير محولة إلى مخزن آخر');
            foreach (['radreply','radusergroup','radcheck'] as $table) $this->db->prepare("DELETE FROM $table WHERE network_id=? AND username=?")->execute([$networkId,(string)$username]);
            $this->db->prepare("DELETE FROM um_vouchers_meta WHERE network_id=? AND username=? AND id=?")->execute([$networkId,(string)$username,$card['id']]);
            $this->db->commit(); return ['success'=>true];
        } catch(Throwable $e) { if($this->db->inTransaction())$this->db->rollBack(); throw $e; }
    }

    // ==========================================
    // METHOD: deleteUsersBatch
    // ==========================================
    public function deleteUsersBatch($usernames, $isSystemMaintenance = false) {
        if (!$isSystemMaintenance) {
            throw new Exception('حذف الكروت الفردية محظور للحفاظ على النزاهة المالية وتسلسل العمليات. يُسمح فقط بتصفير السجلات من شاشة صيانة النظام');
        }
        $usernames = array_values(array_filter((array)$usernames, fn($u) => !preg_match('/^router_[0-9]+$/', (string)$u)));
        if (empty($usernames)) return ['success' => true];
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork($usernames);
        $in = str_repeat('?,', count($usernames) - 1) . '?';
        $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username IN ($in)")->execute(array_merge([$networkId],$usernames));
        $this->db->prepare("DELETE FROM radreply WHERE network_id=? AND username IN ($in)")->execute(array_merge([$networkId],$usernames));
        $this->db->prepare("DELETE FROM radusergroup WHERE network_id=? AND username IN ($in)")->execute(array_merge([$networkId],$usernames));
        $this->db->prepare("DELETE FROM um_vouchers_meta WHERE network_id=? AND username IN ($in)")->execute(array_merge([$networkId],$usernames));
        return ['success' => true];
    }
    // ==========================================
    // FAST BATCH GENERATION (WITH SEQUENTIAL SHEET NUMBERING 000001 & INACTIVE BY DEFAULT)
    // ==========================================

    // ==========================================
    // METHOD: resetUsersUsage
    // ==========================================
    public function resetUsersUsage($usernames) {
        if (!is_array($usernames) || empty($usernames)) return ['error' => 'لم يتم تحديد أي كروت'];
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork($usernames);
        $this->assertNotQuarantined($usernames,$networkId);
        $inClause = implode(',', array_fill(0, count($usernames), '?'));
        // 1. Delete radacct sessions
        $stmt = $this->db->prepare("DELETE FROM radacct WHERE network_id=? AND username IN ($inClause)");
        $stmt->execute(array_merge([$networkId],$usernames));
        // 2. Reset um_vouchers_meta
        $stmt = $this->db->prepare("UPDATE um_vouchers_meta SET first_login = NULL, expires_at = NULL, status = 'active' WHERE network_id=? AND username IN ($inClause)");
        $stmt->execute(array_merge([$networkId],$usernames));
        // 3. Remove Auth-Type Reject so the reset card is immediately usable
        $stmt = $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username IN ($inClause) AND attribute = 'Auth-Type' AND value = 'Reject'");
        $stmt->execute(array_merge([$networkId],$usernames));
        // 4. Disconnect active sessions via CoA
        foreach ($usernames as $u) {
            $this->disconnectUser($u);
        }
        return ['success' => true, 'message' => 'تم تصفير استهلاك الكروت المحددة وإعادتها جديدة بنجاح (' . count($usernames) . ' كرت)'];
    }

    // ==========================================
    // METHOD: changeUsersProfile
    // ==========================================
    public function changeUsersProfile($usernames, $newProfile, $resetUsage = false) {
        if (!is_array($usernames) || empty($usernames)) return ['error' => 'لم يتم تحديد أي كروت'];
        $newProfile = trim($newProfile);
        if (empty($newProfile)) return ['error' => 'يرجى تحديد الباقة الجديدة'];
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork($usernames);
        $this->assertNotQuarantined($usernames,$networkId);

        // 1. Fetch profile definition for validity, price, and attributes
        $pStmt = $this->db->prepare("SELECT name, validity, price, package_type, rate_limit FROM um_profiles_def WHERE name = ? AND network_id=? LIMIT 1");
        $pStmt->execute([$newProfile,$networkId]);
        $newProf = $pStmt->fetch(PDO::FETCH_ASSOC);
        if (!$newProf) {
            return ['error' => 'الباقة المحددة غير موجودة في النظام'];
        }
        $newValidity = $newProf['validity'] ?? '30d';
        $newPrice = (float)($newProf['price'] ?? 0);
        $isFree = (($newProf['package_type'] ?? '') === 'free' || $newPrice <= 0) ? 1 : 0;

        $inClause = implode(',', array_fill(0, count($usernames), '?'));

        // 2. Update radusergroup cleanly and safely without duplicates
        $this->db->prepare("DELETE FROM radusergroup WHERE network_id=? AND username IN ($inClause)")->execute(array_merge([$networkId],$usernames));
        $insRug = $this->db->prepare("INSERT INTO radusergroup (network_id,username, groupname, priority) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)");
        foreach ($usernames as $u) {
            $insRug->execute([$networkId,$u, $newProfile]);
        }

        // 3. Update um_vouchers_meta (profile_name, validity, price, sale_price, is_free_quota)
        // Pricing rule:
        // - If card is UNUSED (no first_login, not used/expired, no radacct sessions): price is updated to the new profile price
        // - If card is USED (has logged in or consumed sessions): new profile price is added to previous price
        $stmt = $this->db->prepare("
            UPDATE um_vouchers_meta 
            SET profile_name = ?,
                validity = ?,
                custom_speed = NULL,
                speed_mode = NULL,
                is_free_quota = CASE 
                    WHEN (first_login IS NULL AND (status IS NULL OR status NOT IN ('used', 'expired')) AND NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id = um_vouchers_meta.network_id AND ra.username = um_vouchers_meta.username))
                    THEN ?
                    ELSE CASE WHEN (COALESCE(price, 0) + ?) <= 0 THEN 1 ELSE 0 END
                END,
                price = CASE 
                    WHEN (first_login IS NULL AND (status IS NULL OR status NOT IN ('used', 'expired')) AND NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id = um_vouchers_meta.network_id AND ra.username = um_vouchers_meta.username))
                    THEN ?
                    ELSE COALESCE(price, 0) + ?
                END,
                sale_price = CASE 
                    WHEN (first_login IS NULL AND (status IS NULL OR status NOT IN ('used', 'expired')) AND NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id = um_vouchers_meta.network_id AND ra.username = um_vouchers_meta.username))
                    THEN CASE WHEN (COALESCE(sale_price, 0) > 0 OR COALESCE(is_sold, 0) = 1) THEN ? ELSE sale_price END
                    ELSE CASE WHEN (COALESCE(sale_price, 0) > 0 OR COALESCE(is_sold, 0) = 1) THEN COALESCE(sale_price, 0) + ? ELSE CASE WHEN COALESCE(sale_price, 0) > 0 THEN COALESCE(sale_price, 0) + ? ELSE sale_price END END
                END
            WHERE network_id = ? AND username IN ($inClause)
        ");
        $stmt->execute(array_merge([
            $newProfile,
            $newValidity,
            $isFree,
            $newPrice,
            $newPrice,
            $newPrice,
            $newPrice,
            $newPrice,
            $newPrice,
            $networkId
        ], $usernames));

        // 4. Handle reset usage OR recalculate expiry
        if ($resetUsage) {
            $stmt = $this->db->prepare("DELETE FROM radacct WHERE network_id=? AND username IN ($inClause)");
            $stmt->execute(array_merge([$networkId],$usernames));
            $stmt = $this->db->prepare("UPDATE um_vouchers_meta SET first_login = NULL, expires_at = NULL, status = 'active' WHERE network_id=? AND username IN ($inClause)");
            $stmt->execute(array_merge([$networkId],$usernames));
            // Remove any Auth-Type := Reject from radcheck so the reset card is ready to login
            $stmt = $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username IN ($inClause) AND attribute = 'Auth-Type' AND value = 'Reject'");
            $stmt->execute(array_merge([$networkId],$usernames));
            // Reset custom rate limit from radreply so new profile rate limit applies
            $stmt = $this->db->prepare("DELETE FROM radreply WHERE network_id=? AND username IN ($inClause) AND attribute = 'Mikrotik-Rate-Limit'");
            $stmt->execute(array_merge([$networkId],$usernames));
        } else {
            // Recalculate expires_at for cards that have already logged in
            $seconds = 0;
            if (preg_match('/^([0-9]+)\s*([dhm])$/i', $newValidity, $m)) {
                $val = (int)$m[1];
                $unit = strtolower($m[2]);
                if ($unit === 'd') $seconds = $val * 86400;
                elseif ($unit === 'h') $seconds = $val * 3600;
                elseif ($unit === 'm') $seconds = $val * 60;
            }
            if ($seconds > 0) {
                $updExp = $this->db->prepare("
                    UPDATE um_vouchers_meta 
                    SET expires_at = DATE_ADD(first_login, INTERVAL ? SECOND),
                        status = CASE WHEN DATE_ADD(first_login, INTERVAL ? SECOND) > NOW() THEN 'active' ELSE 'expired' END
                    WHERE network_id=? AND username IN ($inClause) AND first_login IS NOT NULL
                ");
                $updExp->execute(array_merge([$seconds, $seconds,$networkId], $usernames));
            }
        }

        // 5. Disconnect sessions to apply new profile/speed immediately
        foreach ($usernames as $u) {
            $this->disconnectUser($u);
        }
        return ['success' => true, 'message' => 'تم تغيير باقة الكروت المحددة إلى (' . $newProfile . ') بنجاح'];
    }

    // ==========================================
    // METHOD: renewUsersValidity
    // ==========================================
    public function renewUsersValidity($usernames, $days = 30) {
        if (!is_array($usernames) || empty($usernames)) return ['error' => 'لم يتم تحديد أي كروت'];
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork($usernames);
        $this->assertNotQuarantined($usernames,$networkId);
        $days = (int)$days;
        $inClause = implode(',', array_fill(0, count($usernames), '?'));
        $stmt = $this->db->prepare("
            UPDATE um_vouchers_meta 
            SET expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ? DAY),
                status = 'active'
            WHERE network_id=? AND username IN ($inClause)
        ");
        $stmt->execute(array_merge([$days,$networkId], $usernames));
        return ['success' => true, 'message' => 'تم تجديد وتمديد صلاحية الكروت المحددة بمقدار ' . $days . ' يوم بنجاح'];
    }

    // ==========================================
    // METHOD: setUsersBatchStatus
    // ==========================================
    public function setUsersBatchStatus($usernames, $status = 'active') {
        if (!is_array($usernames) || empty($usernames)) return ['error' => 'لم يتم تحديد أي كروت'];
        $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork($usernames);
        if ($status === 'active') $this->assertNotQuarantined($usernames,$networkId);
        $inClause = implode(',', array_fill(0, count($usernames), '?'));
        if ($status === 'active') {
            // Check if any card is unsold
            $mStmt = $this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND username IN ($inClause) AND is_sold = 0");
            $mStmt->execute(array_merge([$networkId],$usernames));
            $unsoldCnt = (int)$mStmt->fetchColumn();
            if ($unsoldCnt > 0) {
                throw new Exception("يوجد $unsoldCnt كرت غير مباع ضمن التحديد. لا يمكن تفعيل الكروت إلا من خلال فاتورة بيع نظامية في قسم المبيعات");
            }
        }
        $stmt = $this->db->prepare("UPDATE um_vouchers_meta SET status = ? WHERE network_id=? AND username IN ($inClause)");
        $stmt->execute(array_merge([$status,$networkId], $usernames));
        if ($status === 'disabled') {
            // Add Auth-Type Reject to radcheck
            foreach ($usernames as $u) {
                $stmt = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Auth-Type', ':=', 'Reject') ON DUPLICATE KEY UPDATE value = 'Reject'");
                $stmt->execute([$networkId,$u]);
                $this->disconnectUser($u);
            }
        } else {
            // Remove Auth-Type Reject
            $stmt = $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND attribute = 'Auth-Type' AND value = 'Reject' AND username IN ($inClause)");
            $stmt->execute(array_merge([$networkId],$usernames));
        }
        return ['success' => true, 'message' => 'تم ' . ($status === 'disabled' ? 'تعطيل' : 'تفعيل') . ' الكروت المحددة بنجاح (' . count($usernames) . ' كرت)'];
    }

    // ==========================================
    // METHOD: cleanupStaleSessions
    // ==========================================
    // ==========================================
    // METHOD: cleanupStaleSessions
    // ==========================================
    public function cleanupStaleSessions() {
        $networkId = $this->getActiveNetworkId();
        // 1. Mark dead sessions as stopped (no interim update in 90 seconds)
        $stmt = $this->db->prepare("
            UPDATE radacct 
            SET acctstoptime = COALESCE(acctupdatetime, DATE_ADD(acctstarttime, INTERVAL acctsessiontime SECOND), NOW()),
                acctterminatecause = 'Lost-Carrier'
            WHERE network_id=? AND acctstoptime IS NULL 
              AND (
                  (acctupdatetime IS NOT NULL AND acctupdatetime < NOW() - INTERVAL 90 SECOND)
                  OR (acctupdatetime IS NULL AND acctstarttime < NOW() - INTERVAL 90 SECOND)
              )
        ");
        $stmt->execute([$networkId]);
        $closed = $stmt ? $stmt->rowCount() : 0;

        // 2. Close duplicate/older ghost sessions for the same user/MAC where a newer active session exists
        try {
            $stmtDup = $this->db->prepare("
                UPDATE radacct r1 
                JOIN (
                    SELECT username, network_id, MAX(radacctid) AS max_id 
                    FROM radacct 
                    WHERE network_id=? AND acctstoptime IS NULL 
                    GROUP BY username, network_id
                ) r2 ON r1.username = r2.username AND r1.network_id = r2.network_id 
                SET r1.acctstoptime = COALESCE(r1.acctupdatetime, DATE_ADD(r1.acctstarttime, INTERVAL r1.acctsessiontime SECOND), NOW()),
                    r1.acctterminatecause = 'Replaced-By-New-Session' 
                WHERE r1.network_id=? AND r1.acctstoptime IS NULL AND r1.radacctid < r2.max_id
            ");
            $stmtDup->execute([$networkId, $networkId]);
            $closed += $stmtDup ? $stmtDup->rowCount() : 0;
        } catch (Throwable $e) {}

        // 3. Also close disconnected SSTP routers
        try {
            $output = @shell_exec('accel-cmd show sessions 2>/dev/null') ?: '';
            $activeIps = [];
            foreach (explode("\n", $output) as $line) {
                if (preg_match('/(10\.101\.\d+\.\d+)/', $line, $m)) {
                    $activeIps[] = $m[1];
                }
            }
            if (!empty($activeIps)) {
                $quoted = "'" . implode("','", $activeIps) . "'";
                $this->db->query("
                    UPDATE radacct 
                    SET acctstoptime = NOW(), acctterminatecause = 'Lost-Carrier' 
                    WHERE network_id=".(int)$networkId." AND username REGEXP '^router_[0-9]+$' 
                      AND acctstoptime IS NULL 
                      AND framedipaddress NOT IN ($quoted)
                ");
            }
        } catch (Throwable $e) {}
        return ['success' => true, 'message' => "تم تصفية وتنظيف $closed جلسة معلقة بنجاح!", 'closed_count' => $closed];
    }

    // ==========================================
    // METHOD: getActiveSessions
    // ==========================================
    public function getActiveSessions($search = '', $nasIp = '') {
        $networkId = $this->getActiveNetworkId();
        
        // Auto-clean ghost duplicates throttled to once every 5 minutes to prevent blocking read queries
        static $lastGhostCleanup = 0;
        if (time() - $lastGhostCleanup > 300) {
            $lastGhostCleanup = time();
            try {
                $this->db->exec("
                    UPDATE radacct r1 
                    JOIN (
                        SELECT username, network_id, MAX(radacctid) AS max_id 
                        FROM radacct 
                        WHERE network_id=".(int)$networkId." AND acctstoptime IS NULL 
                        GROUP BY username, network_id
                    ) r2 ON r1.username = r2.username AND r1.network_id = r2.network_id 
                    SET r1.acctstoptime = COALESCE(r1.acctupdatetime, DATE_ADD(r1.acctstarttime, INTERVAL r1.acctsessiontime SECOND), NOW()),
                        r1.acctterminatecause = 'Replaced-By-New-Session' 
                    WHERE r1.network_id=".(int)$networkId." AND r1.acctstoptime IS NULL AND r1.radacctid < r2.max_id
                ");
            } catch (Throwable $e) {}
        }

        $where = ["a.acctstoptime IS NULL", "a.username NOT REGEXP '^router_[0-9]+$'", "a.network_id=:active_network"];
        $params = [':active_network'=>$networkId];
        if (!empty($search)) {
            $where[] = "(a.username LIKE :s_user OR a.framedipaddress LIKE :s_ip OR a.callingstationid LIKE :s_mac)";
            $params[':s_user'] = "%$search%";
            $params[':s_ip'] = "%$search%";
            $params[':s_mac'] = "%$search%";
        }
        if (!empty($nasIp)) {
            $where[] = "a.nasipaddress = :nas";
            $params[':nas'] = $nasIp;
        }
        $whereClause = implode(' AND ', $where);
        $sql = "SELECT a.radacctid, a.acctsessionid, a.username, a.nasipaddress, a.nasportid,
                       COALESCE(n.shortname, a.nasipaddress) as nas_shortname, n.secret as nas_secret, n.ports as coa_port,
                       a.framedipaddress, a.callingstationid,
                       a.acctstarttime, a.acctsessiontime,
                       a.acctinputoctets, a.acctoutputoctets,
                       (a.acctinputoctets + a.acctoutputoctets) as total_octets,
                       TIMESTAMPDIFF(SECOND, a.acctstarttime, NOW()) as live_duration,
                       COALESCE(p.name, m.profile_name, ug.groupname, 'باقة عامة') as profile_name,
                       m.price as voucher_price, m.sale_price, m.status as voucher_status,
                       m.expires_at, m.created_at as card_created_at,
                       p.price as profile_price, p.validity as profile_validity, p.transfer_limit,
                       ROUND(
                           ((a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024)) * 
                           COALESCE(
                               NULLIF(m.sale_price, 0) / NULLIF(p.transfer_limit / (1024 * 1024), 0),
                               NULLIF(m.price, 0) / NULLIF(p.transfer_limit / (1024 * 1024), 0),
                               NULLIF(p.price, 0) / NULLIF(p.transfer_limit / (1024 * 1024), 0),
                               0.5
                           ), 2
                       ) as live_sales
                FROM radacct a
                LEFT JOIN nas n ON a.nasipaddress = n.nasname AND n.network_id=a.network_id
                LEFT JOIN um_vouchers_meta m ON a.username = m.username AND m.network_id=a.network_id
                LEFT JOIN radusergroup ug ON a.username = ug.username AND ug.network_id=a.network_id
                LEFT JOIN um_profiles_def p ON (m.profile_name = p.name OR ug.groupname = p.name) AND p.network_id=a.network_id
                WHERE $whereClause
                ORDER BY a.radacctid DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // Fetch all active network nodes with responsible admin info
        $nodesStmt = $this->db->prepare("
            SELECT n.id, n.node_type, n.parent_id, n.nas_ip, n.nas_port_id, n.node_name, n.display_name,
                   n.location, n.coordinates,
                   COALESCE(adm.fullname, n.responsible_name) AS responsible_name,
                   COALESCE(adm.phone, n.responsible_phone) AS responsible_phone,
                   p.node_name AS parent_name, p.display_name AS parent_display_name
            FROM um_network_nodes n
            LEFT JOIN um_network_nodes p ON n.parent_id = p.id AND p.network_id = n.network_id
            LEFT JOIN um_admins adm ON n.responsible_admin_id = adm.id
            WHERE n.network_id = ? AND n.is_active = 1
        ");
        $nodesStmt->execute([$networkId]);
        $allNodes = $nodesStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // Match helper function: matches session NAS IP and Port to the network node
        $matchNode = function($nasIp, $nasPortId, &$nodesList) {
            if (empty($nasPortId)) return null;
            $nasIp = trim((string)$nasIp);
            $rawPort = trim((string)$nasPortId);
            $decodedPort = str_ireplace('=3D', '=', $rawPort);
            $prefixPort = '';
            if (preg_match('/^([^=\(\s]+)/', $rawPort, $m)) {
                $prefixPort = trim($m[1]);
            }

            $candidates = [];
            $fallbackCandidates = [];
            foreach ($nodesList as $node) {
                $nodeNasIp = trim((string)($node['nas_ip'] ?? ''));
                if ($nodeNasIp === $nasIp) {
                    $candidates[] = $node;
                } elseif ($nodeNasIp === '' || $nodeNasIp === '0.0.0.0') {
                    $fallbackCandidates[] = $node;
                }
            }
            $toSearch = !empty($candidates) ? $candidates : $fallbackCandidates;
            if (empty($toSearch)) $toSearch = $nodesList;

            // 1. Exact match on raw port or decoded port
            foreach ($toSearch as $node) {
                $nPort = trim((string)($node['nas_port_id'] ?? ''));
                if ($nPort === '' || strtolower($nPort) === 'all') continue;
                if (strcasecmp($nPort, $rawPort) === 0 || strcasecmp($nPort, $decodedPort) === 0) {
                    return $node;
                }
            }

            // 2. Exact match on prefixPort
            if ($prefixPort !== '') {
                foreach ($toSearch as $node) {
                    $nPort = trim((string)($node['nas_port_id'] ?? ''));
                    if ($nPort === '' || strtolower($nPort) === 'all') continue;
                    if (strcasecmp($nPort, $prefixPort) === 0) {
                        return $node;
                    }
                }
            }

            // 3. Substring match
            foreach ($toSearch as $node) {
                $nPort = trim((string)($node['nas_port_id'] ?? ''));
                if ($nPort === '' || strtolower($nPort) === 'all') continue;
                if (stripos($rawPort, $nPort) !== false || stripos($decodedPort, $nPort) !== false || ($prefixPort !== '' && stripos($nPort, $prefixPort) !== false)) {
                    return $node;
                }
            }

            return null;
        };

        foreach ($sessions as &$s) {
            $matchedNode = $matchNode($s['nasipaddress'], $s['nasportid'], $allNodes);
            if ($matchedNode) {
                $s['node_id'] = (int)$matchedNode['id'];
                $s['node_name'] = $matchedNode['node_name'];
                $s['node_display_name'] = $matchedNode['display_name'] ?: $matchedNode['node_name'];
                $s['node_type'] = $matchedNode['node_type'];
                $s['node_location'] = $matchedNode['location'] ?? '';
                $s['node_coordinates'] = $matchedNode['coordinates'] ?? '';
                $s['responsible_name'] = $matchedNode['responsible_name'] ?? '';
                $s['responsible_phone'] = $matchedNode['responsible_phone'] ?? '';
                $s['parent_node_name'] = $matchedNode['parent_name'] ?? '';
                $s['parent_node_display_name'] = $matchedNode['parent_display_name'] ?? '';
            } else {
                $s['node_id'] = null;
                $s['node_name'] = null;
                $s['node_display_name'] = null;
                $s['node_type'] = null;
                $s['node_location'] = null;
                $s['node_coordinates'] = null;
                $s['responsible_name'] = null;
                $s['responsible_phone'] = null;
                $s['parent_node_name'] = null;
                $s['parent_node_display_name'] = null;
            }
        }
        unset($s);

        return $sessions;
    }
    // ==========================================
    // PORT & ROUTER SALES & BANDWIDTH ANALYTICS
    // ==========================================

    // ==========================================
    // METHOD: disconnectUser
    // ==========================================
        public function disconnectUser($username) {
        try {
            $networkId=$this->getActiveNetworkId();$this->assertUsernamesInActiveNetwork([(string)$username]);
            $stmt = $this->db->prepare("SELECT * FROM radacct WHERE username = ? AND network_id=? AND acctstoptime IS NULL");
            $stmt->execute([$username,$networkId]);
            $sessions = $stmt->fetchAll();
            foreach ($sessions as $s) {
                $this->disconnectSession($s);
            }
        } catch (Throwable $e) {}
    }

    // ==========================================
    // METHOD: disconnectSession
    // ==========================================
    public function disconnectSession($sessionData) {
        $networkId=$this->getActiveNetworkId();
        $username = trim($sessionData['username'] ?? '');
        $nasIp = trim($sessionData['nasipaddress'] ?? ($sessionData['nas_ip'] ?? ''));
        $sessionId = trim($sessionData['acctsessionid'] ?? ($sessionData['session_id'] ?? ''));
        $framedIp = trim($sessionData['framedipaddress'] ?? ($sessionData['framed_ip'] ?? ''));
        $callingStation = trim($sessionData['callingstationid'] ?? ($sessionData['mac'] ?? ''));

        // Auto-lookup active session if nasIp is missing
        if (empty($nasIp) && !empty($username)) {
            $sStmt = $this->db->prepare("SELECT nasipaddress, acctsessionid, framedipaddress, callingstationid FROM radacct WHERE username = ? AND network_id=? AND acctstoptime IS NULL ORDER BY radacctid DESC LIMIT 1");
            $sStmt->execute([$username,$networkId]);
            $foundS = $sStmt->fetch(PDO::FETCH_ASSOC);
            if ($foundS) {
                $nasIp = trim($foundS['nasipaddress'] ?? '');
                if (empty($sessionId)) $sessionId = trim($foundS['acctsessionid'] ?? '');
                if (empty($framedIp)) $framedIp = trim($foundS['framedipaddress'] ?? '');
                if (empty($callingStation)) $callingStation = trim($foundS['callingstationid'] ?? '');
            }
        }

        if (empty($nasIp)) throw new Exception('NAS IP is missing');
        $stmt = $this->db->prepare("SELECT secret, ports FROM nas WHERE nasname = ? AND network_id=? LIMIT 1");
        $stmt->execute([$nasIp,$networkId]);
        $nas = $stmt->fetch();
        if(!$nas)throw new DomainException('FORBIDDEN_NETWORK');
        $secret = $nas ? $nas['secret'] : ($sessionData['secret'] ?? '123456');
        $port = ($nas && !empty($nas['ports'])) ? (int)$nas['ports'] : DEFAULT_COA_PORT;
        $packet = [];
        if (!empty($username)) $packet[] = 'User-Name = "' . $username . '"';
        if (!empty($sessionId)) $packet[] = 'Acct-Session-Id = "' . $sessionId . '"';
        if (!empty($framedIp) && $framedIp !== '0.0.0.0') $packet[] = 'Framed-IP-Address = ' . $framedIp;
        if (!empty($callingStation)) $packet[] = 'Calling-Station-Id = "' . $callingStation . '"';
        $inputStr = implode("
", $packet) . "
";
        $cmd = sprintf(
            'echo %s | %s -r 2 -t 2 %s:%d disconnect %s 2>&1',
            escapeshellarg($inputStr),
            RADCLIENT_PATH,
            escapeshellarg($nasIp),
            $port,
            escapeshellarg($secret)
        );
        $output = shell_exec($cmd);
        $isSuccess = strpos($output, 'Received Disconnect-ACK') !== false || strpos($output, 'Disconnect-ACK') !== false || strpos($output, 'CoA-ACK') !== false;
        return [
            'success' => $isSuccess,
            'raw_output' => trim($output),
            'command' => "radclient to $nasIp:$port",
            'is_ack' => $isSuccess
        ];
    }
    // ==========================================
    // AUTH LOGS & POST-AUTH
    // ==========================================

    // ==========================================
    // METHOD: getAuthLogs
    // ==========================================
    public function getAuthLogs($page = 1, $limit = 50, $search = '', $reply = '') {
        $limit = max(1, min(500, (int)$limit));
        $page = max(1, (int)$page);
        $offset = ($page - 1) * $limit;
        $where = ["network_id=:active_network"];
        $params = [':active_network'=>$this->getActiveNetworkId()];
        if (!empty($search)) {
            $where[] = "(username LIKE :username_search OR pass LIKE :password_search)";
            $params[':username_search'] = "%$search%";
            $params[':password_search'] = "%$search%";
        }
        if (!empty($reply)) {
            $where[] = "reply = :r";
            $params[':r'] = $reply;
        }
        $whereClause = implode(' AND ', $where);
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM radpostauth WHERE $whereClause");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
        $sql = "SELECT id, username, pass, reply, authdate 
                FROM radpostauth 
                WHERE $whereClause 
                ORDER BY id DESC 
                LIMIT :limit OFFSET :offset";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return [
            'success' => true,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => max(1, ceil($total / $limit)),
            'logs' => $logs,
            'data' => $logs
        ];
    }

    // ==========================================
    // METHOD: clearAuthLogs
    // ==========================================
    public function clearAuthLogs($olderThanDays = 0) {
        $networkId=$this->getActiveNetworkId();
        if ($olderThanDays > 0) {
            $stmt = $this->db->prepare("DELETE FROM radpostauth WHERE network_id=? AND authdate < DATE_SUB(NOW(), INTERVAL ? DAY)");
            $stmt->execute([$networkId,(int)$olderThanDays]);
        } else {
            $stmt=$this->db->prepare("DELETE FROM radpostauth WHERE network_id=?");$stmt->execute([$networkId]);
        }
        return ['success' => true, 'message' => 'تم تنظيف ومسح سجلات المصادقة بنجاح'];
    }
    // ==========================================
    // DASHBOARD STATS
    // ==========================================
// ==========================================
    // ENHANCED COMPREHENSIVE DASHBOARD STATS & UI SETTINGS
    // ==========================================
    // ==========================================
    // DYNAMIC WIDGET METRIC ENGINE (محرك إحصائيات وبطاقات لوحة التحكم المخصصة)
    // ==========================================

    // ==========================================
    // METHOD: getPortAndRouterAnalytics
    // ==========================================
    public function getPortAndRouterAnalytics($filterNas = '', $period = 'all') {
        $where = ["a.username NOT REGEXP '^router_[0-9]+$'","a.network_id=:active_network"];
        $params = [':active_network'=>$this->getActiveNetworkId()];
        if (!empty($filterNas)) {
            $where[] = "a.nasipaddress = :nas";
            $params[':nas'] = $filterNas;
        }
        if ($period === 'today') {
            $where[] = "a.acctstarttime >= CURDATE()";
        } elseif ($period === 'week') {
            $where[] = "a.acctstarttime >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        } elseif ($period === 'month') {
            $where[] = "a.acctstarttime >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        }
        $whereClause = implode(' AND ', $where);
        // 1. Port Analytics (Enhanced with Commercial vs Free Vouchers)
        // 1. Port Analytics (Enhanced with Commercial vs Free Vouchers)
        $sqlPorts = "
            SELECT 
                COALESCE(NULLIF(a.nasportid, ''), 'المنفذ الرئيسي (Default)') AS port_id,
                a.nasipaddress,
                COALESCE(n.shortname, a.nasipaddress) AS router_name,
                COUNT(a.radacctid) AS total_sessions,
                COUNT(DISTINCT a.username) AS unique_users,
                SUM(a.acctinputoctets) AS rx_bytes,
                SUM(a.acctoutputoctets) AS tx_bytes,
                SUM(a.acctinputoctets + a.acctoutputoctets) AS total_bytes,
                ROUND(SUM(a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024), 2) AS total_mb,
                -- Commercial (Paid) Consumption & Revenue
                ROUND(SUM(CASE WHEN COALESCE(m.is_free_quota, 0) = 0 THEN (a.acctinputoctets + a.acctoutputoctets) ELSE 0 END) / (1024 * 1024), 2) AS comm_mb,
                ROUND(SUM(
                    CASE 
                        WHEN COALESCE(m.is_free_quota, 0) = 1 THEN 0
                        WHEN p.transfer_limit IS NOT NULL AND p.transfer_limit > 0 THEN
                            ((a.acctinputoctets + a.acctoutputoctets) / p.transfer_limit) * COALESCE(NULLIF(m.sale_price, 0), NULLIF(m.price, 0), NULLIF(p.price, 0), 0)
                        ELSE 0
                    END
                ), 2) AS total_sales,
                -- Free / VIP Vouchers Consumption (Zero Revenue, Tracked Separately)
                COUNT(CASE WHEN m.is_free_quota = 1 THEN 1 END) AS free_sessions,
                ROUND(SUM(CASE WHEN m.is_free_quota = 1 THEN (a.acctinputoctets + a.acctoutputoctets) ELSE 0 END) / (1024 * 1024), 2) AS free_mb,
                0.00 AS free_cost,
                -- Linked Nodes & Equipment Counts
                (SELECT COUNT(*) FROM um_network_nodes nn WHERE nn.network_id=a.network_id AND nn.nas_ip = a.nasipaddress AND (nn.nas_port_id = a.nasportid OR (a.nasportid IS NULL AND (nn.nas_port_id IS NULL OR nn.nas_port_id = '')))) AS nodes_count,
                (SELECT COUNT(*) FROM um_assets ast WHERE ast.network_id=a.network_id AND ast.nas_ip = a.nasipaddress AND (ast.nas_port_id = a.nasportid OR (a.nasportid IS NULL AND (ast.nas_port_id IS NULL OR ast.nas_port_id = '')))) AS assets_count
            FROM radacct a
            LEFT JOIN nas n ON a.nasipaddress = n.nasname AND n.network_id=a.network_id
            LEFT JOIN um_vouchers_meta m ON a.username = m.username AND m.network_id=a.network_id
            LEFT JOIN radusergroup ug ON a.username = ug.username AND ug.network_id=a.network_id
            LEFT JOIN um_profiles_def p ON (m.profile_name = p.name OR ug.groupname = p.name) AND p.network_id=a.network_id
            WHERE $whereClause
            GROUP BY a.nasipaddress, port_id
            ORDER BY total_bytes DESC
        ";
        $stmt = $this->db->prepare($sqlPorts);
        $stmt->execute($params);
        $ports = $stmt->fetchAll();
        // 2. Router Analytics (Separating Paid Sales vs Free Usage)
        $sqlRouters = "
            SELECT 
                a.nasipaddress,
                COALESCE(n.shortname, a.nasipaddress) AS router_name,
                COUNT(DISTINCT COALESCE(NULLIF(a.nasportid, ''), 'default')) AS active_ports,
                COUNT(a.radacctid) AS total_sessions,
                COUNT(DISTINCT a.username) AS unique_users,
                SUM(a.acctinputoctets) AS rx_bytes,
                SUM(a.acctoutputoctets) AS tx_bytes,
                SUM(a.acctinputoctets + a.acctoutputoctets) AS total_bytes,
                ROUND(SUM(a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024), 2) AS total_mb,
                -- Commercial (Paid) Consumption & Revenue
                ROUND(SUM(CASE WHEN COALESCE(m.is_free_quota, 0) = 0 THEN (a.acctinputoctets + a.acctoutputoctets) ELSE 0 END) / (1024 * 1024), 2) AS comm_mb,
                ROUND(SUM(
                    CASE 
                        WHEN COALESCE(m.is_free_quota, 0) = 1 THEN 0
                        WHEN p.transfer_limit IS NOT NULL AND p.transfer_limit > 0 THEN
                            ((a.acctinputoctets + a.acctoutputoctets) / p.transfer_limit) * COALESCE(NULLIF(m.sale_price, 0), NULLIF(m.price, 0), NULLIF(p.price, 0), 0)
                        ELSE 0
                    END
                ), 2) AS total_sales,
                -- Free / VIP Vouchers Consumption
                COUNT(CASE WHEN m.is_free_quota = 1 THEN 1 END) AS free_sessions,
                ROUND(SUM(CASE WHEN m.is_free_quota = 1 THEN (a.acctinputoctets + a.acctoutputoctets) ELSE 0 END) / (1024 * 1024), 2) AS free_mb
            FROM radacct a
            LEFT JOIN nas n ON a.nasipaddress = n.nasname AND n.network_id=a.network_id
            LEFT JOIN um_vouchers_meta m ON a.username = m.username AND m.network_id=a.network_id
            LEFT JOIN radusergroup ug ON a.username = ug.username AND ug.network_id=a.network_id
            LEFT JOIN um_profiles_def p ON (m.profile_name = p.name OR ug.groupname = p.name) AND p.network_id=a.network_id
            WHERE $whereClause
            GROUP BY a.nasipaddress
            ORDER BY total_sales DESC
        ";
        $stmt2 = $this->db->prepare($sqlRouters);
        $stmt2->execute($params);
        $routers = $stmt2->fetchAll();
        // Totals & KPIs
        $totalSales = 0;
        $totalBytes = 0;
        foreach ($routers as $r) {
            $totalSales += (float)$r['total_sales'];
            $totalBytes += (float)$r['total_bytes'];
        }
        $topPort = !empty($ports) ? $ports[0]['port_id'] . ' (' . $ports[0]['router_name'] . ')' : 'لا يوجد';
        $topRouter = !empty($routers) ? $routers[0]['router_name'] : 'لا يوجد';
        return [
            'success' => true,
            'ports' => $ports,
            'routers' => $routers,
            'summary' => [
                'total_sales' => round($totalSales, 2),
                'total_bytes' => $totalBytes,
                'total_mb' => round($totalBytes / (1024 * 1024), 2),
                'total_gb' => round($totalBytes / (1024 * 1024 * 1024), 2),
                'active_ports_count' => count($ports),
                'routers_count' => count($routers),
                'top_port' => $topPort,
                'top_router' => $topRouter
            ]
        ];
    }

    // ==========================================
    // METHOD: getAccountingHistory
    // ==========================================
    public function getAccountingHistory($page = 1, $limit = 50, $search = '', $nasIp = '') {
        $offset = ($page - 1) * $limit;
        $where = ["a.acctstoptime IS NOT NULL", "a.username NOT REGEXP '^router_[0-9]+$'","a.network_id=:active_network"];
        $params = [':active_network'=>$this->getActiveNetworkId()];
        if (!empty($search)) {
            $where[] = "(a.username LIKE :s_user OR a.framedipaddress LIKE :s_ip OR a.callingstationid LIKE :s_mac)";
            $params[':s_user'] = "%$search%";
            $params[':s_ip'] = "%$search%";
            $params[':s_mac'] = "%$search%";
        }
        if (!empty($nasIp)) {
            $where[] = "a.nasipaddress = :nas";
            $params[':nas'] = $nasIp;
        }
        $whereClause = implode(' AND ', $where);
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM radacct a WHERE $whereClause");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
        $sql = "SELECT a.radacctid, a.acctsessionid, a.username, a.nasipaddress, a.nasportid,
                       n.shortname as nas_shortname,
                       a.framedipaddress, a.callingstationid,
                       a.acctstarttime, a.acctstoptime, a.acctsessiontime,
                       a.acctinputoctets, a.acctoutputoctets,
                       a.acctterminatecause
                FROM radacct a
                LEFT JOIN nas n ON a.nasipaddress = n.nasname AND n.network_id=a.network_id
                WHERE $whereClause
                ORDER BY a.radacctid DESC
                LIMIT :limit OFFSET :offset";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        return [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'total_pages' => ceil($total / $limit),
            'data' => $stmt->fetchAll()
        ];
    }
    // ==========================================
    // DISCONNECT / KICK (RFC 3576 / CoA)
    // ==========================================

    // ==========================================
    // METHOD: restartRadius
    // ==========================================
    public function restartRadius() {
        $out = shell_exec('/usr/bin/sudo -n /bin/systemctl restart freeradius 2>&1');
        $status = shell_exec('systemctl is-active freeradius');
        return [
            'success' => trim($status) === 'active',
            'status' => trim($status),
            'output' => trim($out)
        ];
    }
    // ==========================================
    // PRINT BATCHES & NUMBERED SHEETS MANAGEMENT
    // ==========================================

    // ==========================================
    // METHOD: getBackupRadiusSettings
    // ==========================================
    /**
     * Failover settings are tenant-scoped.  Keep a legacy global fallback so
     * older installations continue working, but every new read/write is keyed
     * by the active network and can never leak a router from another network.
     */
    private function readNetworkSettings(array $keys, int $networkId): array {
        if ($networkId <= 0 || !$keys) return [];
        $scoped = [];
        foreach ($keys as $key) $scoped[$key] = $key . '_network_' . $networkId;
        $all = array_values(array_unique(array_merge(array_values($scoped), array_keys($scoped))));
        $marks = implode(',', array_fill(0, count($all), '?'));
        $stmt = $this->db->prepare("SELECT setting_key, setting_value FROM um_settings WHERE setting_key IN ($marks)");
        $stmt->execute($all);
        $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
        $out = [];
        foreach ($scoped as $base => $scopedKey) {
            if (array_key_exists($scopedKey, $rows)) $out[$base] = $rows[$scopedKey];
            elseif (array_key_exists($base, $rows)) $out[$base] = $rows[$base];
        }
        return $out;
    }

    private function writeNetworkSettings(array $settings, int $networkId): void {
        if ($networkId <= 0 || !$settings) return;
        $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()");
        foreach ($settings as $key => $value) {
            $stmt->execute([(string)$key . '_network_' . $networkId, (string)$value]);
        }
    }

    public function getBackupRadiusSettings() {
        $networkId = (int)$this->getActiveNetworkId();
        try {
            $rows = $this->readNetworkSettings([
                'backup_radius_enabled', 'backup_radius_ip', 'backup_radius_secret',
                'backup_radius_router_id', 'backup_radius_auth_port', 'backup_radius_acct_port'
            ], $networkId);
        } catch (Throwable $e) { $rows = []; }
        return [
            'enabled' => ($rows['backup_radius_enabled'] ?? '0') === '1' && (int)($rows['backup_radius_router_id'] ?? 0) > 0,
            'ip' => $rows['backup_radius_ip'] ?? '127.0.0.1',
            // Consumed only by the server-side script generator; API strips it.
            'secret' => $rows['backup_radius_secret'] ?? '',
            'router_id' => (int)($rows['backup_radius_router_id'] ?? 0),
            'secret_managed_by_system' => true,
            'auth_port' => (int)($rows['backup_radius_auth_port'] ?? 1812),
            'acct_port' => (int)($rows['backup_radius_acct_port'] ?? 1813),
        ];
    }

    // ==========================================
    // METHOD: saveBackupRadiusSettings
    // ==========================================
    public function saveBackupRadiusSettings($data) {
        $enabled = !empty($data['enabled']) && $data['enabled'] !== 'false' && $data['enabled'] !== '0' ? '1' : '0';
        $networkId = $this->getActiveNetworkId();
        $routerId = (int)($data['router_id'] ?? 0);
        $proxyRouter = $enabled === '1' ? $this->resolveProxyRouter($routerId, $networkId) : null;
        if ($enabled === '1' && !$proxyRouter) return ['success'=>false, 'error'=>'اختر راوترًا من الشبكة النشطة للـUser Manager الاحتياطي'];
        $ip = $proxyRouter ? (string)$proxyRouter['nasname'] : '127.0.0.1';
        $secret = $proxyRouter ? (string)$proxyRouter['secret'] : '';
        if ($enabled !== '1') $routerId = 0;
        $authPort = (int)($data['auth_port'] ?? 1812);
        $acctPort = (int)($data['acct_port'] ?? 1813);
        $settings = [
            'backup_radius_enabled' => $enabled,
            'backup_radius_ip' => $ip,
            'backup_radius_secret' => $secret,
            'backup_radius_router_id' => (string)$routerId,
            'backup_radius_auth_port' => (string)$authPort,
            'backup_radius_acct_port' => (string)$acctPort,
        ];
        $this->writeNetworkSettings($settings, $networkId);
        return ['success' => true, 'message' => 'تم حفظ إعدادات سيرفر RADIUS الاحتياطي بنجاح', 'ip' => $ip, 'router_id' => $routerId, 'enabled' => $enabled === '1', 'secret_managed_by_system'=>true];
    }
    // ==========================================
    // USER MANAGER PROXY FAILOVER SETTINGS
    // ==========================================

    // ==========================================
    // METHOD: getUmProxySettings
    // ==========================================
    public function getUmProxySettings() {
        $proxyFile = '/etc/freeradius/3.0/proxy.conf';
        $ip = '';
        $secret = '';
        $authPort = 1812;
        $acctPort = 1813;
        $enabled = false;
        $routerId = 0;
        try {
            $rows = $this->readNetworkSettings([
                'um_proxy_ip', 'um_proxy_secret', 'um_proxy_auth_port',
                'um_proxy_acct_port', 'um_proxy_enabled', 'um_proxy_router_id'
            ], (int)$this->getActiveNetworkId());
            $routerId = (int)($rows['um_proxy_router_id'] ?? 0);
            if (!empty($rows['um_proxy_ip'])) {
                $ip = $rows['um_proxy_ip'];
                $secret = $rows['um_proxy_secret'] ?? $secret;
                $authPort = (int)($rows['um_proxy_auth_port'] ?? $authPort);
                $acctPort = (int)($rows['um_proxy_acct_port'] ?? $acctPort);
                $enabled = ($rows['um_proxy_enabled'] ?? '0') === '1' && $routerId > 0;
                return ['ip'=>$ip, 'secret'=>$secret, 'authPort'=>$authPort, 'acctPort'=>$acctPort, 'enabled'=>$enabled, 'router_id'=>$routerId];
            }
        } catch (Throwable $e) {}
        if (file_exists($proxyFile) && is_readable($proxyFile)) {
            $content = @file_get_contents($proxyFile) ?: '';
            if (preg_match('/home_server\s+sam_um_auth\s*\{[^}]*ipaddr\s*=\s*([0-9.]+)/s', $content, $m)) {
                $ip = trim($m[1]);
            }
            if (preg_match('/home_server\s+sam_um_auth\s*\{[^}]*secret\s*=\s*["\']?([^"\'\s]+)/s', $content, $m)) {
                $secret = trim($m[1]);
            }
        }
        return ['ip'=>$ip, 'secret'=>$secret, 'authPort'=>$authPort, 'acctPort'=>$acctPort, 'enabled'=>$enabled, 'router_id'=>$routerId];
    }

    // ==========================================
    // METHOD: ensureNasProxyColumns
    // ==========================================
    public function ensureNasProxyColumns(): void {
        static $checked = false;
        if ($checked) return;
        try {
            // Add each compatibility column independently. Older installations
            // may already have only part of the proxy schema; one combined ALTER
            // would then skip the missing columns and fail at runtime later.
            $columns = [
                'www_port' => "INT(11) NULL DEFAULT NULL",
                'um_proxy_enabled' => "TINYINT(1) NOT NULL DEFAULT 0",
                'um_proxy_router_id' => "INT(11) NULL DEFAULT NULL",
                'um_proxy_ip' => "VARCHAR(45) NULL DEFAULT NULL",
                'um_proxy_secret' => "VARCHAR(128) NULL DEFAULT NULL",
                'um_proxy_auth_port' => "INT(11) NOT NULL DEFAULT 1812",
                'um_proxy_acct_port' => "INT(11) NOT NULL DEFAULT 1813",
                'work_types' => "VARCHAR(128) NOT NULL DEFAULT 'hotspot'"
            ];
            $wwwPortAdded = false;
            foreach ($columns as $name => $definition) {
                $stmt = $this->db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nas' AND COLUMN_NAME = ?");
                $stmt->execute([$name]);
                if (!(int)$stmt->fetchColumn()) {
                    $this->db->exec("ALTER TABLE nas ADD COLUMN `{$name}` {$definition}");
                    if ($name === 'www_port') $wwwPortAdded = true;
                }
            }
            if ($wwwPortAdded) {
                // Preserve existing forwarding behavior until each router's WWW port is edited.
                $this->db->exec("UPDATE nas SET www_port = COALESCE(NULLIF(api_port, 0), 80) WHERE www_port IS NULL OR www_port = 0");
            }
            $checked = true;
        } catch (Throwable $e) {
            // ignore if exists
        }
    }

    // ==========================================
    // METHOD: rebuildProxyConfiguration
    // ==========================================
    public function rebuildProxyConfiguration(): array {
        $serverIp = $_SERVER['SERVER_ADDR'] ?? '127.0.0.1';
        if ($serverIp === '127.0.0.1' || $serverIp === '::1') {
            $serverIp = trim(exec("hostname -I | awk '{print $1}'") ?: '127.0.0.1');
        }

        $blocks = [];

        // 1. Per-Router User Manager Proxies
        $this->ensureNasProxyColumns();
        $stmt = $this->db->query("SELECT n.id, n.network_id, n.shortname, n.nasname, n.um_proxy_enabled, n.um_proxy_router_id, target.nasname AS target_nasname, target.secret AS target_secret, n.um_proxy_ip, n.um_proxy_secret, n.um_proxy_auth_port, n.um_proxy_acct_port FROM nas n LEFT JOIN nas target ON target.id=n.um_proxy_router_id AND target.network_id=n.network_id AND FIND_IN_SET('usermanager', COALESCE(target.work_types, 'hotspot')) > 0 WHERE n.um_proxy_enabled = 1 ORDER BY n.network_id ASC, n.id ASC");
        $routers = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $sharedProxyTargets = [];
        foreach ($routers as $r) {
            $rid = (int)$r['id'];
            // A per-router proxy is valid only when it references a concrete
            // target NAS from the same network. Legacy free-text IP fallbacks
            // are intentionally ignored until the owner chooses a target.
            if (empty($r['target_nasname'])) {
                continue;
            }
            $ip = trim((string)$r['target_nasname']);
            if (empty($ip) || !filter_var($ip, FILTER_VALIDATE_IP)) {
                continue;
            }
            $secret = trim((string)($r['target_secret'] ?? ''));
            if (empty($secret)) $secret = trim((string)($r['um_proxy_secret'] ?? ''));
            if (empty($secret)) continue;
            $authPort = (int)($r['um_proxy_auth_port'] ?? 1812) ?: 1812;
            $acctPort = (int)($r['um_proxy_acct_port'] ?? 1813) ?: 1813;

            // Several routers in one network may share the same designated
            // User Manager target.  FreeRADIUS rejects duplicate home_server
            // addresses, so define the target once and give each source router
            // its own realm that references the shared pools.
            $targetId = (int)($r['um_proxy_router_id'] ?? 0);
            $targetKey = $targetId . '|' . $ip . '|' . $authPort . '|' . $acctPort . '|' . $secret;
            if (!isset($sharedProxyTargets[$targetKey])) {
                $targetToken = 'sam_um_target_' . ($targetId > 0 ? $targetId : count($sharedProxyTargets) + 1);
                $sharedProxyTargets[$targetKey] = [
                    'auth' => $targetToken . '_auth',
                    'auth_pool' => $targetToken . '_auth_pool',
                    'acct' => $targetToken . '_acct',
                    'acct_pool' => $targetToken . '_acct_pool',
                ];
                $targetNames = $sharedProxyTargets[$targetKey];
                $blocks[] = "
# Shared User Manager Proxy target {$targetId}
home_server {$targetNames['auth']} {
    type = auth
    ipaddr = {$ip}
    port = {$authPort}
    src_ipaddr = {$serverIp}
    secret = \"{$secret}\"
    response_window = 5
    zombie_period = 30
    revive_interval = 60
    status_check = none
}
home_server_pool {$targetNames['auth_pool']} {
    type = fail-over
    home_server = {$targetNames['auth']}
}
home_server {$targetNames['acct']} {
    type = acct
    ipaddr = {$ip}
    port = {$acctPort}
    src_ipaddr = {$serverIp}
    secret = \"{$secret}\"
    response_window = 5
    zombie_period = 30
    revive_interval = 60
    status_check = none
}
home_server_pool {$targetNames['acct_pool']} {
    type = fail-over
    home_server = {$targetNames['acct']}
}
";
            }
            $targetNames = $sharedProxyTargets[$targetKey];
            $blocks[] = "
# Router #{$rid} ({$r['shortname']}) User Manager Proxy realm
realm router_realm_{$rid} {
    auth_pool = {$targetNames['auth_pool']}
    acct_pool = {$targetNames['acct_pool']}
    nostrip
}
";
        }

        // 2. Global Fallback User Manager Proxy (if enabled)
        $globalProxy = $this->getUmProxySettings();
        if (!empty($globalProxy['enabled']) && !empty($globalProxy['ip'])) {
            $gIp = $globalProxy['ip'];
            $gSecret = $globalProxy['secret'];
            $gAuthPort = $globalProxy['authPort'];
            $gAcctPort = $globalProxy['acctPort'];

            $blocks[] = "
# Global SAM User Manager Fallback Proxy
home_server sam_um_auth {
    type = auth
    ipaddr = {$gIp}
    port = {$gAuthPort}
    src_ipaddr = {$serverIp}
    secret = \"{$gSecret}\"
    response_window = 5
    zombie_period = 30
    revive_interval = 60
    status_check = none
}
home_server_pool sam_um_auth_pool {
    type = fail-over
    home_server = sam_um_auth
}
home_server sam_um_acct {
    type = acct
    ipaddr = {$gIp}
    port = {$gAcctPort}
    src_ipaddr = {$serverIp}
    secret = \"{$gSecret}\"
    response_window = 5
    zombie_period = 30
    revive_interval = 60
    status_check = none
}
home_server_pool sam_um_acct_pool {
    type = fail-over
    home_server = sam_um_acct
}
realm sam_usermanager {
    auth_pool = sam_um_auth_pool
    acct_pool = sam_um_acct_pool
    nostrip
}
";
        }

        $stagedProxy = '/var/lib/mikrotik-usermanager/proxy/proxy-block.new';
        $fullBlock = trim(implode("\n", $blocks));
        $stagedContent = $fullBlock !== '' ? "# BEGIN SAM USERMANAGER PROXY\n" . $fullBlock . "\n# END SAM USERMANAGER PROXY\n" : '';

        @mkdir('/var/lib/mikrotik-usermanager/proxy', 0755, true);

        if (file_put_contents($stagedProxy, $stagedContent, LOCK_EX) === false) {
            return ['error' => 'تعذر تجهيز إعدادات Proxy في المسار المؤقت'];
        }
        chmod($stagedProxy, 0640);

        $applyOutput = [];
        $applyCode = 1;
        exec('/usr/bin/sudo -n /usr/local/sbin/sam-apply-proxy 2>&1', $applyOutput, $applyCode);
        if ($applyCode !== 0) {
            return ['error' => 'رفض FreeRADIUS تطبيق إعدادات البروكسي: ' . trim(implode("\n", $applyOutput))];
        }

        return ['success' => true, 'message' => 'تم تطبيق إعدادات FreeRADIUS Proxy بنجاح.'];
    }

    // ==========================================
    // METHOD: saveUmProxySettings
    // ==========================================
    public function saveUmProxySettings($data) {
        $enabled = !empty($data['enabled']) && $data['enabled'] !== 'false' && $data['enabled'] !== '0';
        $networkId = $this->getActiveNetworkId();
        $routerId = (int)($data['router_id'] ?? 0);
        $proxyRouter = $enabled ? $this->resolveProxyRouter($routerId, $networkId) : null;
        if ($enabled && !$proxyRouter) return ['error' => 'اختر راوترًا من الشبكة النشطة للـUser Manager الاحتياطي'];
        $ip = $proxyRouter ? (string)$proxyRouter['nasname'] : '';
        $secret = $proxyRouter ? (string)$proxyRouter['secret'] : '';
        if (!$enabled) $routerId = 0;
        $authPort = (int)($data['auth_port'] ?? 1812) ?: 1812;
        $acctPort = (int)($data['acct_port'] ?? 1813) ?: 1813;

        // 1. Save to database
        $settings = [
            'um_proxy_ip' => $ip,
            'um_proxy_secret' => $secret,
            'um_proxy_router_id' => (string)$routerId,
            'um_proxy_auth_port' => (string)$authPort,
            'um_proxy_acct_port' => (string)$acctPort,
            'um_proxy_enabled' => $enabled ? '1' : '0'
        ];
        $this->writeNetworkSettings($settings, $networkId);

        // 2. Rebuild combined FreeRADIUS proxy configuration
        $res = $this->rebuildProxyConfiguration();
        if (!empty($res['error'])) {
            return $res;
        }

        return ['success' => true, 'message' => "تم تحديث إعدادات User Manager بنجاح وتطبيقها على FreeRADIUS!", 'data' => ['ip'=>$ip, 'authPort'=>$authPort, 'acctPort'=>$acctPort, 'enabled'=>$enabled, 'router_id'=>$routerId, 'secret_managed_by_system'=>true]];
    }

    private function assertNotQuarantined(array $usernames,int $networkId): void {
        $usernames=array_values(array_unique(array_filter(array_map(static fn($v)=>trim((string)$v),$usernames),static fn($v)=>$v!=='')));
        if (!$usernames) return;
        $ph=implode(',',array_fill(0,count($usernames),'?'));
        $q=$this->db->prepare("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id=? AND username IN ($ph) AND COALESCE(comment,'') LIKE 'استيراد محجور من User Manager%'");
        $q->execute(array_merge([$networkId],$usernames));
        if ((int)$q->fetchColumn()>0) throw new RuntimeException('البطاقة ما زالت في حجر الاستيراد ولا يمكن تفعيلها أو تعديلها');
    }

    /** Require every requested identifier to exist inside the active network. */
    private function assertUsernamesInActiveNetwork(array $usernames): void {
        $usernames=array_values(array_unique(array_filter(array_map(static fn($v)=>trim((string)$v),$usernames),static fn($v)=>$v!=='')));
        if(!$usernames)throw new InvalidArgumentException('INVALID_USER_SCOPE');
        $networkId=$this->getActiveNetworkId();
        $ph=implode(',',array_fill(0,count($usernames),'?'));
        $sql="SELECT username FROM um_vouchers_meta WHERE network_id=? AND username IN ($ph)
              UNION SELECT username FROM radcheck WHERE network_id=? AND username IN ($ph)";
        $stmt=$this->db->prepare($sql);
        $stmt->execute(array_merge([$networkId],$usernames,[$networkId],$usernames));
        $seen=[];
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row){
            $seen[(string)$row['username']]=true;
        }
        foreach($usernames as $username)if(!isset($seen[$username]))throw new DomainException('FORBIDDEN_NETWORK');
    }
}

