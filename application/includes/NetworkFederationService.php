<?php
/**
 * SAM Network Federation, Merging & Roaming Service
 * Manages Router multi-assignment, full network merging with conflict resolution,
 * and FreeRADIUS multi-tenant roaming & federation.
 */
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/NetworkSubscriptionService.php';
require_once __DIR__ . '/RouterRadiusService.php';

class NetworkFederationService extends BaseService {

    public function __construct(?PDO $db = null, ?RadiusService $radius = null) {
        if ($db === null) {
            $db = new PDO("mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
        }
        parent::__construct($db, $radius);
    }

    // =========================================================================
    // 1. FAST ROUTER REASSIGNMENT (نقل الراوتر السريع بين الشبكات)
    // =========================================================================

    /**
     * Reassign a NAS / Router to a different network instantly.
     */
    public function reassignRouterNetwork(int $routerId, int $targetNetworkId, int $adminId = 1): array {
        if ($routerId <= 0) throw new InvalidArgumentException('معرف الراوتر غير صالح');
        if ($targetNetworkId <= 0) throw new InvalidArgumentException('معرف الشبكة المستهدفة غير صالح');

        $router = $this->db->query("SELECT * FROM nas WHERE id = {$routerId}")->fetch(PDO::FETCH_ASSOC);
        if (!$router) throw new RuntimeException('الراوتر المطلوب غير موجود');

        $currentNetworkId = (int)$router['network_id'];
        if ($currentNetworkId === $targetNetworkId) {
            return ['success' => true, 'message' => 'الراوتر يتبع هذه الشبكة بالفعل'];
        }

        $targetNet = $this->db->query("SELECT id, name, status FROM um_networks WHERE id = {$targetNetworkId}")->fetch(PDO::FETCH_ASSOC);
        if (!$targetNet || $targetNet['status'] !== 'active') {
            throw new RuntimeException('الشبكة المستهدفة غير موجودة أو معطلة');
        }

        $this->db->beginTransaction();
        try {
            // Check capacity in target network subscription
            (new NetworkSubscriptionService($this->db))->lockRouterCapacity($targetNetworkId, $adminId);

            // Update NAS record
            $updateNas = $this->db->prepare("UPDATE nas SET network_id = :target_id WHERE id = :id");
            $updateNas->execute([':target_id' => $targetNetworkId, ':id' => $routerId]);

            // Update SSTP identity rows in radcheck / radreply
            $vpnUser = 'router_' . $routerId;
            $this->db->prepare("UPDATE radcheck SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);
            $this->db->prepare("UPDATE radreply SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);
            $this->db->prepare("UPDATE radusergroup SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);

            // Update linked assets if any
            $this->db->prepare("UPDATE um_assets SET network_id = ? WHERE nas_ip = ?")->execute([$targetNetworkId, $router['nasname']]);

            // Audit log
            $this->recordAuditLog($currentNetworkId, $adminId, 'ROUTER_REASSIGN', "نقل الراوتر [{$router['shortname']}] من الشبكة #{$currentNetworkId} إلى الشبكة #{$targetNetworkId} [{$targetNet['name']}]");

            $this->db->commit();
            return [
                'success' => true,
                'router_id' => $routerId,
                'previous_network_id' => $currentNetworkId,
                'new_network_id' => $targetNetworkId,
                'target_network_name' => $targetNet['name'],
                'message' => "تم نقل الراوتر [{$router['shortname']}] إلى الشبكة [{$targetNet['name']}] بنجاح!"
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // =========================================================================
    // 2. FULL NETWORK MERGING WIZARD (معالج دمج شبكتين أو أكثر بالكامل)
    // =========================================================================

    /**
     * Preview network merge statistics, profile mappings, and username collisions.
     */
    public function previewNetworkMerge(int $sourceNetworkId, int $targetNetworkId): array {
        if ($sourceNetworkId <= 0 || $targetNetworkId <= 0 || $sourceNetworkId === $targetNetworkId) {
            throw new InvalidArgumentException('يرجى تحديد شبكة مصدر وشبكة هدف مختلفتين');
        }

        $sourceNet = $this->db->query("SELECT id, name, code, status FROM um_networks WHERE id = {$sourceNetworkId}")->fetch(PDO::FETCH_ASSOC);
        $targetNet = $this->db->query("SELECT id, name, code, status FROM um_networks WHERE id = {$targetNetworkId}")->fetch(PDO::FETCH_ASSOC);
        if (!$sourceNet || !$targetNet) throw new RuntimeException('إحدى الشبكات المحددة غير موجودة');

        // Source network counts
        $routerCount = (int)$this->db->query("SELECT COUNT(*) FROM nas WHERE network_id = {$sourceNetworkId}")->fetchColumn();
        $sourceProfiles = $this->db->query("SELECT p.*, (SELECT COUNT(*) FROM um_vouchers_meta v WHERE v.network_id = {$sourceNetworkId} AND v.profile_name = p.name) AS card_count FROM um_profiles_def p WHERE p.network_id = {$sourceNetworkId}")->fetchAll(PDO::FETCH_ASSOC);
        $targetProfiles = $this->db->query("SELECT * FROM um_profiles_def WHERE network_id = {$targetNetworkId}")->fetchAll(PDO::FETCH_ASSOC);

        $totalCards = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = {$sourceNetworkId}")->fetchColumn();
        $activeCards = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = {$sourceNetworkId} AND status = 'active'")->fetchColumn();
        $usedCards = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = {$sourceNetworkId} AND status = 'used'")->fetchColumn();
        $expiredCards = (int)$this->db->query("SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = {$sourceNetworkId} AND status = 'expired'")->fetchColumn();
        $acctSessions = (int)$this->db->query("SELECT COUNT(*) FROM radacct WHERE network_id = {$sourceNetworkId}")->fetchColumn();

        // Check Username Collisions between source and target
        $collisionStmt = $this->db->prepare("
            SELECT s.username, s.profile_name AS source_profile, t.profile_name AS target_profile
            FROM um_vouchers_meta s
            JOIN um_vouchers_meta t ON t.username = s.username AND t.network_id = ?
            WHERE s.network_id = ?
            LIMIT 100
        ");
        $collisionStmt->execute([$targetNetworkId, $sourceNetworkId]);
        $collisions = $collisionStmt->fetchAll(PDO::FETCH_ASSOC);
        $totalCollisions = (int)$this->db->query("
            SELECT COUNT(*)
            FROM um_vouchers_meta s
            JOIN um_vouchers_meta t ON t.username = s.username AND t.network_id = {$targetNetworkId}
            WHERE s.network_id = {$sourceNetworkId}
        ")->fetchColumn();

        // Auto map profiles with matching names
        $profileMap = [];
        foreach ($sourceProfiles as $sp) {
            $match = null;
            foreach ($targetProfiles as $tp) {
                if (trim(strtolower($sp['name'])) === trim(strtolower($tp['name']))) {
                    $match = $tp['name'];
                    break;
                }
            }
            $profileMap[$sp['name']] = $match ?: ($targetProfiles[0]['name'] ?? $sp['name']);
        }

        return [
            'success' => true,
            'source_network' => $sourceNet,
            'target_network' => $targetNet,
            'counts' => [
                'routers' => $routerCount,
                'profiles' => count($sourceProfiles),
                'total_cards' => $totalCards,
                'active_cards' => $activeCards,
                'used_cards' => $usedCards,
                'expired_cards' => $expiredCards,
                'acct_sessions' => $acctSessions,
                'collisions' => $totalCollisions
            ],
            'source_profiles' => $sourceProfiles,
            'target_profiles' => $targetProfiles,
            'profile_map' => $profileMap,
            'collision_samples' => $collisions
        ];
    }

    /**
     * Execute atomic merge of source network into target network.
     */
    public function executeNetworkMerge(int $sourceNetworkId, int $targetNetworkId, array $options = [], int $adminId = 1): array {
        $preview = $this->previewNetworkMerge($sourceNetworkId, $targetNetworkId);
        $profileMap = $options['profile_map'] ?? $preview['profile_map'];
        $collisionStrategy = $options['collision_strategy'] ?? 'prefix'; // 'prefix', 'skip', 'overwrite'
        $prefix = trim((string)($options['prefix'] ?? ('N' . $sourceNetworkId . '_')));
        $moveRouters = !isset($options['move_routers']) || (bool)$options['move_routers'];
        $archiveSource = !isset($options['archive_source']) || (bool)$options['archive_source'];

        $this->db->beginTransaction();
        try {
            // 1. Ensure all mapped profiles exist in target network
            $targetProfiles = $this->db->query("SELECT name FROM um_profiles_def WHERE network_id = {$targetNetworkId}")->fetchAll(PDO::FETCH_COLUMN);
            $targetProfilesSet = array_flip($targetProfiles);

            $sourceProfiles = $this->db->query("SELECT * FROM um_profiles_def WHERE network_id = {$sourceNetworkId}")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($sourceProfiles as $sp) {
                $targetName = $profileMap[$sp['name']] ?? $sp['name'];
                if (!isset($targetProfilesSet[$targetName])) {
                    // Create missing profile in target network
                    $insProf = $this->db->prepare("
                        INSERT INTO um_profiles_def (
                            network_id, name, name_for_users, price, retail_price, cost_price, validity,
                            transfer_limit, uptime_limit, rate_limit, shared_users, template_id, allow_speed_change, default_speed, max_speed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $insProf->execute([
                        $targetNetworkId, $targetName, $sp['name_for_users'] ?: $targetName,
                        $sp['price'], $sp['retail_price'], $sp['cost_price'], $sp['validity'],
                        $sp['transfer_limit'], $sp['uptime_limit'], $sp['rate_limit'],
                        $sp['shared_users'], $sp['template_id'], $sp['allow_speed_change'],
                        $sp['default_speed'], $sp['max_speed']
                    ]);
                    $targetProfilesSet[$targetName] = true;
                }
            }

            // 2. Fetch all vouchers from source network
            $vouchers = $this->db->query("SELECT * FROM um_vouchers_meta WHERE network_id = {$sourceNetworkId}")->fetchAll(PDO::FETCH_ASSOC);
            $targetUsernames = $this->db->query("SELECT username FROM um_vouchers_meta WHERE network_id = {$targetNetworkId}")->fetchAll(PDO::FETCH_COLUMN);
            $targetUsernamesSet = array_flip($targetUsernames);

            $migratedCount = 0;
            $renamedCount = 0;
            $skippedCount = 0;

            $updateMeta = $this->db->prepare("UPDATE um_vouchers_meta SET network_id = ?, username = ?, profile_name = ? WHERE id = ?");
            $updateCheck = $this->db->prepare("UPDATE radcheck SET network_id = ?, username = ? WHERE network_id = ? AND username = ?");
            $updateReply = $this->db->prepare("UPDATE radreply SET network_id = ?, username = ? WHERE network_id = ? AND username = ?");
            $updateGroup = $this->db->prepare("UPDATE radusergroup SET network_id = ?, username = ?, groupname = ? WHERE network_id = ? AND username = ?");
            $updateAcct = $this->db->prepare("UPDATE radacct SET network_id = ?, username = ? WHERE network_id = ? AND username = ?");

            foreach ($vouchers as $v) {
                $oldUser = $v['username'];
                $targetProfile = $profileMap[$v['profile_name']] ?? $v['profile_name'];
                $newUser = $oldUser;

                if (isset($targetUsernamesSet[$oldUser])) {
                    if ($collisionStrategy === 'skip') {
                        $skippedCount++;
                        continue;
                    } elseif ($collisionStrategy === 'prefix') {
                        $newUser = $prefix . $oldUser;
                        $renamedCount++;
                    }
                }

                // Update voucher meta
                $updateMeta->execute([$targetNetworkId, $newUser, $targetProfile, $v['id']]);

                // Update FreeRADIUS tables
                $updateCheck->execute([$targetNetworkId, $newUser, $sourceNetworkId, $oldUser]);
                $updateReply->execute([$targetNetworkId, $newUser, $sourceNetworkId, $oldUser]);
                $updateGroup->execute([$targetNetworkId, $newUser, $targetProfile, $sourceNetworkId, $oldUser]);
                $updateAcct->execute([$targetNetworkId, $newUser, $sourceNetworkId, $oldUser]);

                $targetUsernamesSet[$newUser] = true;
                $migratedCount++;
            }

            // 3. Move Routers (NAS) if selected
            $movedRoutersCount = 0;
            if ($moveRouters) {
                $routers = $this->db->query("SELECT id, shortname, nasname FROM nas WHERE network_id = {$sourceNetworkId}")->fetchAll(PDO::FETCH_ASSOC);
                foreach ($routers as $r) {
                    $this->db->prepare("UPDATE nas SET network_id = ? WHERE id = ?")->execute([$targetNetworkId, $r['id']]);
                    $vpnUser = 'router_' . $r['id'];
                    $this->db->prepare("UPDATE radcheck SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);
                    $this->db->prepare("UPDATE radreply SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);
                    $this->db->prepare("UPDATE radusergroup SET network_id = ? WHERE username = ?")->execute([$targetNetworkId, $vpnUser]);
                    $this->db->prepare("UPDATE um_assets SET network_id = ? WHERE nas_ip = ?")->execute([$targetNetworkId, $r['nasname']]);
                    $movedRoutersCount++;
                }
            }

            // 4. Archive or Mark Source Network as merged
            if ($archiveSource) {
                $this->db->prepare("UPDATE um_networks SET status = 'merged', notes = CONCAT(COALESCE(notes,''), '\n[تم الدمج بالكامل في الشبكة #', ?, ' بتاريخ ', NOW(), ']') WHERE id = ?")
                         ->execute([$targetNetworkId, $sourceNetworkId]);
            }

            // 5. Audit Log
            $this->recordAuditLog($targetNetworkId, $adminId, 'NETWORK_MERGE', "تم دمج الشبكة المصدر #{$sourceNetworkId} بالكامل في الشبكة #{$targetNetworkId} (الكروت المنقولة: {$migratedCount}، المعدلة بالبادئة: {$renamedCount}، الراوترات: {$movedRoutersCount})");

            $this->db->commit();
            return [
                'success' => true,
                'source_network_id' => $sourceNetworkId,
                'target_network_id' => $targetNetworkId,
                'migrated_cards' => $migratedCount,
                'renamed_cards' => $renamedCount,
                'skipped_cards' => $skippedCount,
                'moved_routers' => $movedRoutersCount,
                'message' => "تم دمج الشبكة بنجاح! تم نقل {$migratedCount} كرت و {$movedRoutersCount} راوتر إلى الشبكة المستهدفة."
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // =========================================================================
    // 3. NETWORK ROAMING & FEDERATION (تحالف وتجوال الشبكات الشقيقة)
    // =========================================================================

    /**
     * List all roaming peers for a given network.
     */
    public function getRoamingPeers(int $networkId): array {
        if ($networkId <= 0) return ['success' => true, 'peers' => []];

        $stmt = $this->db->prepare("
            SELECT p.*, n.name AS peer_name, n.code AS peer_code, n.location AS peer_location, n.status AS peer_status,
                   (SELECT COUNT(*) FROM nas WHERE network_id = p.peer_network_id) AS peer_routers_count,
                   (SELECT COUNT(*) FROM um_vouchers_meta WHERE network_id = p.peer_network_id AND status = 'active') AS peer_active_cards
            FROM um_network_roaming_peers p
            JOIN um_networks n ON n.id = p.peer_network_id
            WHERE p.network_id = ?
            ORDER BY p.id DESC
        ");
        $stmt->execute([$networkId]);
        $peers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['success' => true, 'network_id' => $networkId, 'peers' => $peers];
    }

    /**
     * Add a new roaming peer relationship (one-way or two-way).
     */
    public function addRoamingPeer(int $networkId, int $peerNetworkId, string $roamingType = 'two_way', ?array $allowedProfiles = null, float $clearingRate = 0.0, int $adminId = 1): array {
        if ($networkId <= 0 || $peerNetworkId <= 0 || $networkId === $peerNetworkId) {
            throw new InvalidArgumentException('حدد شبكة شريكة صالحة ومختلفة عن الشبكة الحالية');
        }

        $peerNet = $this->db->query("SELECT id, name FROM um_networks WHERE id = {$peerNetworkId} AND status = 'active'")->fetch(PDO::FETCH_ASSOC);
        if (!$peerNet) throw new RuntimeException('الشبكة الشريكة غير موجودة أو غير نشطة');

        $profilesJson = ($allowedProfiles && count($allowedProfiles)) ? json_encode(array_values($allowedProfiles), JSON_UNESCAPED_UNICODE) : null;
        $roamingType = in_array($roamingType, ['two_way', 'one_way']) ? $roamingType : 'two_way';

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO um_network_roaming_peers (network_id, peer_network_id, roaming_type, allowed_profiles, accounting_clearing_rate, status, created_by)
                VALUES (?, ?, ?, ?, ?, 'active', ?)
                ON DUPLICATE KEY UPDATE roaming_type = VALUES(roaming_type), allowed_profiles = VALUES(allowed_profiles), accounting_clearing_rate = VALUES(accounting_clearing_rate), status = 'active'
            ");
            $stmt->execute([$networkId, $peerNetworkId, $roamingType, $profilesJson, $clearingRate, $adminId]);

            // If two-way, also ensure the reverse link is created
            if ($roamingType === 'two_way') {
                $stmt->execute([$peerNetworkId, $networkId, 'two_way', $profilesJson, $clearingRate, $adminId]);
            }

            $this->recordAuditLog($networkId, $adminId, 'ROAMING_PEER_ADD', "تم تفعيل تحالف وتجوال مع الشبكة #{$peerNetworkId} [{$peerNet['name']}] بنوع [{$roamingType}]");

            $this->db->commit();
            return ['success' => true, 'message' => "تم تفعيل التحالف والتجوال المشترك مع [{$peerNet['name']}] بنجاح!"];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Pause, Resume, or Disable Roaming peer link.
     */
    public function toggleRoamingPeerStatus(int $peerId, string $status, int $adminId = 1): array {
        if (!in_array($status, ['active', 'paused', 'disabled'])) throw new InvalidArgumentException('حالة غير صالحة');
        $peer = $this->db->query("SELECT * FROM um_network_roaming_peers WHERE id = {$peerId}")->fetch(PDO::FETCH_ASSOC);
        if (!$peer) throw new RuntimeException('علاقة التجوال غير موجودة');

        $this->db->prepare("UPDATE um_network_roaming_peers SET status = ? WHERE id = ?")->execute([$status, $peerId]);
        if ($peer['roaming_type'] === 'two_way') {
            $this->db->prepare("UPDATE um_network_roaming_peers SET status = ? WHERE network_id = ? AND peer_network_id = ?")
                     ->execute([$status, $peer['peer_network_id'], $peer['network_id']]);
        }

        $statusAr = ['active' => 'مفعل', 'paused' => 'موقوف مؤقتاً', 'disabled' => 'معطل'][$status];
        return ['success' => true, 'status' => $status, 'message' => "تم تغيير حالة التجوال إلى [{$statusAr}]"];
    }

    /**
     * Delete Roaming peer relationship.
     */
    public function deleteRoamingPeer(int $peerId, int $adminId = 1): array {
        $peer = $this->db->query("SELECT * FROM um_network_roaming_peers WHERE id = {$peerId}")->fetch(PDO::FETCH_ASSOC);
        if (!$peer) throw new RuntimeException('علاقة التجوال غير موجودة');

        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM um_network_roaming_peers WHERE id = ?")->execute([$peerId]);
            if ($peer['roaming_type'] === 'two_way') {
                $this->db->prepare("DELETE FROM um_network_roaming_peers WHERE network_id = ? AND peer_network_id = ?")
                         ->execute([$peer['peer_network_id'], $peer['network_id']]);
            }
            $this->db->commit();
            return ['success' => true, 'message' => 'تم حذف شراكة التجوال بنجاح'];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Generate Roaming clearing & inter-network accounting consumption report.
     */
    public function getRoamingClearingReport(int $networkId, ?string $from = null, ?string $to = null): array {
        $from = $from ?: date('Y-m-01 00:00:00');
        $to = $to ?: date('Y-m-d 23:59:59');

        // Sessions of OUR network users connected on OTHER (peer) network routers
        $outboundStmt = $this->db->prepare("
            SELECT 
                r.nasipaddress, n_nas.network_id AS host_network_id, host_net.name AS host_network_name,
                COUNT(DISTINCT r.username) AS roaming_users_count,
                COUNT(*) AS total_sessions,
                ROUND(SUM(COALESCE(r.acctsessiontime, 0)) / 3600, 2) AS total_hours,
                ROUND(SUM(COALESCE(r.acctinputoctets, 0) + COALESCE(r.acctoutputoctets, 0)) / 1048576, 2) AS total_mb
            FROM radacct r
            JOIN nas n_nas ON n_nas.nasname = r.nasipaddress AND n_nas.network_id <> ?
            JOIN um_networks host_net ON host_net.id = n_nas.network_id
            WHERE r.network_id = ? AND r.acctstarttime BETWEEN ? AND ?
            GROUP BY n_nas.network_id, host_net.name
        ");
        $outboundStmt->execute([$networkId, $networkId, $from, $to]);
        $outbound = $outboundStmt->fetchAll(PDO::FETCH_ASSOC);

        // Sessions of GUEST users from OTHER networks connected on OUR network routers
        $inboundStmt = $this->db->prepare("
            SELECT 
                r.network_id AS guest_network_id, guest_net.name AS guest_network_name,
                COUNT(DISTINCT r.username) AS guest_users_count,
                COUNT(*) AS total_sessions,
                ROUND(SUM(COALESCE(r.acctsessiontime, 0)) / 3600, 2) AS total_hours,
                ROUND(SUM(COALESCE(r.acctinputoctets, 0) + COALESCE(r.acctoutputoctets, 0)) / 1048576, 2) AS total_mb
            FROM radacct r
            JOIN nas our_nas ON our_nas.nasname = r.nasipaddress AND our_nas.network_id = ?
            JOIN um_networks guest_net ON guest_net.id = r.network_id
            WHERE r.network_id <> ? AND r.acctstarttime BETWEEN ? AND ?
            GROUP BY r.network_id, guest_net.name
        ");
        $inboundStmt->execute([$networkId, $networkId, $from, $to]);
        $inbound = $inboundStmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'success' => true,
            'network_id' => $networkId,
            'date_from' => $from,
            'date_to' => $to,
            'outbound_roaming' => $outbound, // استهلاك مشتركينا في شبكات أخرى
            'inbound_roaming' => $inbound     // استهلاك مشتركي الشبكات الأخرى على راوتراتنا
        ];
    }

    public function recordAuditLog(int $networkId, int $adminId, string $action, string $details): void {
        try {
            $stmt = $this->db->prepare("INSERT INTO um_activity_logs (network_id, admin_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
            $stmt->execute([$networkId, $adminId, $action, $details, $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']);
        } catch (Throwable $e) {
            // Non-blocking log failure
        }
    }
}
