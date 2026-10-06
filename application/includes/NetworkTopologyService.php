<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';

/**
 * NetworkTopologyService - Specialized Domain Service for Network Nodes, Topology Discovery, Assets, Outages & SSTP VPN
 */
class NetworkTopologyService extends BaseService {

    /**
     * Resolve the platform-owned hostname used by router RADIUS/SSTP scripts.
     * The public domain setting may contain a URL and an HTTP port; only the
     * hostname is valid for RouterOS connect-to and the SSTP port stays a
     * server-side value.
     */
    private function getSystemRadiusHost(): string {
        $candidates = [
            trim((string)$this->getSettingValue('system_public_domain', '')),
            trim((string)$this->getSettingValue('public_server_name', '')),
            trim((string)$this->getSettingValue('sstp_server_vpn_host', '')),
            trim((string)($_SERVER['SERVER_NAME'] ?? '')),
            trim((string)($_SERVER['HTTP_HOST'] ?? '')),
        ];
        foreach ($candidates as $raw) {
            if ($raw === '') continue;
            $host = $raw;
            if (preg_match('/^[a-z][a-z0-9+.-]*:\/\//i', $raw)) {
                $parsed = parse_url($raw);
                $host = is_array($parsed) ? (string)($parsed['host'] ?? '') : '';
            } else {
                $host = preg_replace('#/.*$#', '', $raw) ?? $raw;
                $host = preg_replace('/:\d+$/', '', $host) ?? $host;
            }
            $host = trim($host, " []\t\r\n");
            if ($host !== '' && (filter_var($host, FILTER_VALIDATE_IP) || preg_match('/^[a-z0-9.-]+$/i', $host))) {
                return $host;
            }
        }
        $fallback = gethostbyname(gethostname());
        return ($fallback && $fallback !== gethostname()) ? $fallback : '127.0.0.1';
    }

    /** Read the actual accel-ppp listener port; never trust a browser value. */
    private function getInternalSstpPort(): int {
        $configFile = '/etc/accel-ppp/accel-ppp.conf';
        if (is_readable($configFile)) {
            $contents = (string)@file_get_contents($configFile);
            if (preg_match('/^\s*port\s*=\s*(\d+)\s*$/mi', $contents, $m)) {
                $port = (int)$m[1];
                if ($port > 0 && $port <= 65535) return $port;
            }
        }
        $port = (int)$this->getSettingValue('sstp_radius_port', '4406');
        return ($port > 0 && $port <= 65535) ? $port : 4406;
    }

    // ==========================================
    // METHOD: getNetworkNodes
    // ==========================================
    public function getNetworkNodes($nasIp = '', $networkId = 0) {
        $where = ["1=1"];
        $params = [];
        $activeNetworkId = (int)$this->getActiveNetworkId();
        $requestedNetworkId = (int)$networkId;
        if ($requestedNetworkId > 0 && $requestedNetworkId !== $activeNetworkId) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        $networkId = $activeNetworkId;
        if ($networkId > 0) { $where[] = "n.network_id = :network"; $params[':network'] = $networkId; }
        if (!empty($nasIp)) {
            $where[] = "n.nas_ip = :nas";
            $params[':nas'] = $nasIp;
        }
        $whereClause = implode(' AND ', $where);
        $sql = "
            SELECT n.*, 
                   p.node_name AS parent_name,
                   p.display_name AS parent_display_name,
                   p.node_type AS parent_type,
                   COALESCE(adm.fullname, n.responsible_name) AS responsible_display,
                   COALESCE(adm.phone, n.responsible_phone) AS responsible_phone_display,
                   (SELECT COUNT(*) FROM um_assets a_scope WHERE a_scope.node_id = n.id AND a_scope.network_id = n.network_id) AS assets_count,
                   (SELECT COUNT(*) FROM um_network_nodes n_scope WHERE n_scope.parent_id = n.id AND n_scope.network_id = n.network_id) AS sub_nodes_count,
                   ROUND(COALESCE((
                       SELECT SUM(a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024)
                       FROM radacct a 
                       WHERE a.network_id = n.network_id AND a.nasipaddress = n.nas_ip AND a.nasportid = n.nas_port_id
                   ), 0), 2) AS current_consumption_mb
            FROM um_network_nodes n
            LEFT JOIN um_network_nodes p ON n.parent_id = p.id AND p.network_id = n.network_id
            LEFT JOIN um_admins adm ON n.responsible_admin_id = adm.id
            WHERE $whereClause
            ORDER BY n.nas_ip ASC, n.node_type ASC, n.id ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return ['success' => true, 'nodes' => $stmt->fetchAll()];
    }

    // ==========================================
    // METHOD: saveNetworkNode
    // ==========================================
    public function saveNetworkNode($data) {
        $id = (int)($data['id'] ?? 0);
        $type = in_array($data['node_type'] ?? '', ['main_node', 'sub_node', 'regular']) ? $data['node_type'] : 'main_node';
        $parentId = !empty($data['parent_id']) ? (int)$data['parent_id'] : null;
        $nasIp = trim($data['nas_ip'] ?? '');
        $nasPortId = trim($data['nas_port_id'] ?? '');
        $name = trim($data['node_name'] ?? '');
        $displayName = trim($data['display_name'] ?? '') ?: null;
        $code = trim($data['code'] ?? '') ?: null;
        $adminId = !empty($data['responsible_admin_id']) ? (int)$data['responsible_admin_id'] : null;
        $respName = trim($data['responsible_name'] ?? '');
        $respPhone = normalizeYemenPhone(trim($data['responsible_phone'] ?? ''));
        if ($adminId > 0 && (empty($respName) || empty($respPhone))) {
            $admStmt = $this->db->prepare("SELECT fullname, phone FROM um_admins WHERE id = ?");
            $admStmt->execute([$adminId]);
            $admRow = $admStmt->fetch();
            if ($admRow) {
                if (empty($respName)) $respName = $admRow['fullname'];
                if (empty($respPhone)) $respPhone = $admRow['phone'];
            }
        }
        $location = trim($data['location'] ?? '');
        $coords = trim($data['coordinates'] ?? '');
        $notes = trim($data['notes'] ?? '');
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $networkId = (int)($data['network_id'] ?? 0) ?: (int)$this->getActiveNetworkId();
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        if (empty($nasIp) || empty($name)) {
            return ['error' => 'يرجى إدخال IP الراوتر واسم النقطة'];
        }
        if ($id > 0) {
            $stmt = $this->db->prepare("
                UPDATE um_network_nodes 
                SET node_type = ?, parent_id = ?, nas_ip = ?, nas_port_id = ?, node_name = ?, display_name = ?, code = ?,
                    responsible_admin_id = ?, responsible_name = ?, responsible_phone = ?, location = ?,
                    coordinates = ?, notes = ?, is_active = ?, network_id = ?
                WHERE id = ? AND network_id = ?
            ");
            $stmt->execute([$type, $parentId, $nasIp, $nasPortId, $name, $displayName, $code, $adminId, $respName, $respPhone, $location, $coords, $notes, $isActive, $networkId, $id, $networkId]);
            return ['success' => true, 'id' => $id, 'message' => 'تم تحديث بيانات النقطة بنجاح'];
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_network_nodes (node_type, parent_id, nas_ip, nas_port_id, node_name, display_name, code, responsible_admin_id, responsible_name, responsible_phone, location, coordinates, notes, is_active, network_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$type, $parentId, $nasIp, $nasPortId, $name, $displayName, $code, $adminId, $respName, $respPhone, $location, $coords, $notes, $isActive, $networkId]);
            return ['success' => true, 'id' => (int)$this->db->lastInsertId(), 'message' => 'تم إضافة النقطة بنجاح'];
        }
    }

    // ==========================================
    // METHOD: deleteNetworkNode
    // ==========================================
    public function deleteNetworkNode($id) {
        $id = (int)$id;
        // Detach children
        $this->db->prepare("UPDATE um_network_nodes SET parent_id = NULL WHERE parent_id = ?")->execute([$id]);
        $this->db->prepare("UPDATE um_assets SET node_id = NULL WHERE node_id = ?")->execute([$id]);
        $stmt = $this->db->prepare("DELETE FROM um_network_nodes WHERE id = ?");
        $stmt->execute([$id]);
        return ['success' => true, 'message' => 'تم حذف النقطة بنجاح'];
    }

    // ==========================================
    // METHOD: getRouterPortsList
    // ==========================================
    public function getRouterPortsList($nasIp = '') {
        $networkId = (int)$this->getActiveNetworkId();
        $nasIp = trim($nasIp);
        $ports = [];
        $seen = [];

        // 1. Try to fetch live interfaces from router via RouterOS API if router exists
        if (!empty($nasIp)) {
            try {
                $rStmt = $this->db->prepare("SELECT id FROM nas WHERE (nasname = ? OR server = ?) AND network_id = ? LIMIT 1");
                $rStmt->execute([$nasIp, $nasIp, $networkId]);
                $nasId = (int)$rStmt->fetchColumn();
                if ($nasId > 0) {
                    require_once __DIR__ . '/RouterOSApi.php';
                    $cfg = $this->getRouterConnectionConfig($nasId);
                    $api = new RouterOSApi();
                    $api->timeout = 4;
                    if ($api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl'])) {
                        $interfaces = $api->comm('/interface/print');
                        $api->disconnect();
                        if (is_array($interfaces)) {
                            foreach ($interfaces as $iface) {
                                $pName = trim($iface['name'] ?? '');
                                if ($pName !== '' && !isset($seen[$pName])) {
                                    $seen[$pName] = true;
                                    $comment = !empty($iface['comment']) ? " - " . $iface['comment'] : "";
                                    $type = !empty($iface['type']) ? $iface['type'] : 'ether';
                                    $running = ($iface['running'] ?? 'false') === 'true';
                                    $disabled = ($iface['disabled'] ?? 'false') === 'true';
                                    $statusBadge = $disabled ? '🔴 معطل' : ($running ? '🟢 متصل' : '⚪ خامل');
                                    $ports[] = [
                                        'name' => $pName,
                                        'label' => "$pName ($type$comment) [$statusBadge]",
                                        'type' => $type,
                                        'comment' => $iface['comment'] ?? '',
                                        'running' => $running,
                                        'source' => 'live_router'
                                    ];
                                }
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
                // Silently fallback to DB recorded ports
            }

            // 2. Fetch distinct ports from um_assets, radacct, um_network_nodes
            try {
                $dbPortsStmt = $this->db->prepare("
                    SELECT DISTINCT nas_port_id FROM um_network_nodes WHERE nas_ip = ? AND network_id = ? AND nas_port_id IS NOT NULL AND nas_port_id != ''
                    UNION
                    SELECT DISTINCT nas_port_id FROM um_assets WHERE nas_ip = ? AND network_id = ? AND nas_port_id IS NOT NULL AND nas_port_id != ''
                    UNION
                    SELECT DISTINCT nasportid FROM radacct WHERE nasipaddress = ? AND network_id = ? AND nasportid IS NOT NULL AND nasportid != ''
                ");
                $dbPortsStmt->execute([$nasIp, $networkId, $nasIp, $networkId, $nasIp, $networkId]);
                $dbPorts = $dbPortsStmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($dbPorts as $dp) {
                    $dp = trim($dp);
                    if ($dp !== '' && !isset($seen[$dp])) {
                        $seen[$dp] = true;
                        $ports[] = [
                            'name' => $dp,
                            'label' => "$dp (منفذ مسجل بالنظام)",
                            'type' => 'recorded',
                            'running' => false,
                            'source' => 'recorded_port'
                        ];
                    }
                }
            } catch (\Throwable $e) {}
        }

        // 3. Fallback standard default ports
        $defaults = ['bridge1', 'ether1', 'ether2', 'ether3', 'ether4', 'ether5', 'ether6', 'ether7', 'ether8', 'wlan1', 'wlan2', 'sfp-sfpplus1', 'vlan10', 'vlan20'];
        foreach ($defaults as $def) {
            if (!isset($seen[$def])) {
                $seen[$def] = true;
                $ports[] = [
                    'name' => $def,
                    'label' => "$def (منفذ قياسي)",
                    'type' => 'default',
                    'running' => false,
                    'source' => 'default'
                ];
            }
        }

        return ['success' => true, 'ports' => $ports];
    }

    // ==========================================
    // METHOD: getNetworkTopologyTree
    // ==========================================
    public function getNetworkTopologyTree($nasIp = '') {
        $nodesRes = $this->getNetworkNodes($nasIp);
        $nodes = $nodesRes['nodes'] ?? [];
        // Build Tree: Group by Router (nas_ip) -> Port (nas_port_id) -> Main Nodes -> Sub Nodes
        $tree = [];
        $mainNodesById = [];
        foreach ($nodes as $n) {
            $rIp = $n['nas_ip'];
            $pId = !empty($n['nas_port_id']) ? $n['nas_port_id'] : 'default_port';
            if (!isset($tree[$rIp])) {
                $tree[$rIp] = ['router_ip' => $rIp, 'ports' => []];
            }
            if (!isset($tree[$rIp]['ports'][$pId])) {
                $tree[$rIp]['ports'][$pId] = ['port_id' => $pId, 'main_nodes' => [], 'sub_nodes' => []];
            }
            if ($n['node_type'] === 'main_node') {
                $n['sub_nodes'] = [];
                $tree[$rIp]['ports'][$pId]['main_nodes'][$n['id']] = $n;
                $mainNodesById[$n['id']] = ['router_ip' => $rIp, 'port_id' => $pId];
            }
        }
        // Place sub nodes under their main parents across ports
        foreach ($nodes as $n) {
            if ($n['node_type'] === 'sub_node') {
                $rIp = $n['nas_ip'];
                $pParent = $n['parent_id'];
                $placed = false;
                if (!empty($pParent) && isset($mainNodesById[$pParent])) {
                    $parentRouter = $mainNodesById[$pParent]['router_ip'];
                    $parentPort = $mainNodesById[$pParent]['port_id'];
                    if (isset($tree[$parentRouter]['ports'][$parentPort]['main_nodes'][$pParent])) {
                        $tree[$parentRouter]['ports'][$parentPort]['main_nodes'][$pParent]['sub_nodes'][] = $n;
                        $placed = true;
                    }
                }
                if (!$placed) {
                    $pId = !empty($n['nas_port_id']) ? $n['nas_port_id'] : 'default_port';
                    if (isset($tree[$rIp]['ports'][$pId])) {
                        $tree[$rIp]['ports'][$pId]['sub_nodes'][] = $n;
                    }
                }
            }
        }
        // Convert associative keys to clean indexed arrays for JSON
        $result = [];
        foreach ($tree as $r) {
            $portsArr = [];
            foreach ($r['ports'] as $p) {
                $p['main_nodes'] = array_values($p['main_nodes']);
                $p['sub_nodes'] = array_values($p['sub_nodes'] ?? []);
                $portsArr[] = $p;
            }
            $r['ports'] = $portsArr;
            $result[] = $r;
        }
        return ['success' => true, 'topology' => $result];
    }
    // ==========================================
    // 3. FREE / VIP VOUCHERS MANAGEMENT
    // ==========================================

    // ==========================================
    // METHOD: getNodeDetailReport
    // ==========================================
    public function getNodeDetailReport($nasIp = '', $portId = '', $period = 'all', $dateFrom = '', $dateTo = '', $nodeId = 0) {
        $networkId = (int)$this->getActiveNetworkId();
        $nasIp = trim((string)$nasIp);
        $portId = trim((string)$portId);
        $nodeId = (int)$nodeId;

        $targetNode = null;
        $targetPorts = [];
        if ($nodeId > 0) {
            $nStmt = $this->db->prepare("
                SELECT n.*, adm.fullname AS responsible_fullname, adm.phone AS responsible_admin_phone,
                       (SELECT GROUP_CONCAT(sub.nas_port_id) FROM um_network_nodes sub WHERE sub.parent_id = n.id) AS sub_ports
                FROM um_network_nodes n 
                LEFT JOIN um_admins adm ON n.responsible_admin_id = adm.id 
                WHERE n.id = ? AND (n.network_id = ? OR n.network_id IS NULL OR n.network_id = 0) LIMIT 1
            ");
            $nStmt->execute([$nodeId, $networkId]);
            $targetNode = $nStmt->fetch(PDO::FETCH_ASSOC);
            if ($targetNode) {
                if (empty($nasIp)) $nasIp = $targetNode['nas_ip'] ?: '';
                if (!empty($targetNode['nas_port_id'])) $targetPorts[] = $targetNode['nas_port_id'];
                if (!empty($targetNode['sub_ports'])) {
                    $targetPorts = array_merge($targetPorts, explode(',', $targetNode['sub_ports']));
                }
            }
        }

        if (!empty($portId) && $portId !== 'المنفذ الرئيسي (Default)' && $portId !== 'default' && $portId !== '0') {
            $targetPorts[] = $portId;
        }

        $where = ["a.username NOT REGEXP '^router_[0-9]+$'"];
        $params = [];
        if ($networkId > 0) {
            $where[] = "(a.network_id = :network_id OR a.network_id IS NULL OR a.network_id = 0)";
            $params[':network_id'] = $networkId;
        }

        if (!empty($nasIp)) {
            $where[] = "a.nasipaddress = :nas";
            $params[':nas'] = $nasIp;
        }

        if (!empty($targetPorts)) {
            $portVars = $this->getPortCandidateVariations($targetPorts);
            if (!empty($portVars)) {
                $pPh = [];
                foreach ($portVars as $idx => $pv) {
                    $pk = ":dt_pv_$idx";
                    $pPh[] = $pk;
                    $params[$pk] = $pv;
                }
                $where[] = "a.nasportid IN (" . implode(',', $pPh) . ")";
            }
        } elseif ($portId === 'default' || $portId === '0' || $portId === 'المنفذ الرئيسي (Default)') {
            $where[] = "(a.nasportid IS NULL OR a.nasportid = '' OR a.nasportid = 'default' OR a.nasportid = '0')";
        }

        // Date range filtering
        $dateFrom = trim((string)$dateFrom);
        $dateTo = trim((string)$dateTo);
        if (!empty($dateFrom) && !empty($dateTo)) {
            $where[] = "a.acctstarttime >= :d_from AND a.acctstarttime <= :d_to";
            $params[':d_from'] = strlen($dateFrom) === 10 ? ($dateFrom . ' 00:00:00') : $dateFrom;
            $params[':d_to'] = strlen($dateTo) === 10 ? ($dateTo . ' 23:59:59') : $dateTo;
        } elseif (!empty($dateFrom)) {
            $where[] = "a.acctstarttime >= :d_from";
            $params[':d_from'] = strlen($dateFrom) === 10 ? ($dateFrom . ' 00:00:00') : $dateFrom;
        } elseif (!empty($dateTo)) {
            $where[] = "a.acctstarttime <= :d_to";
            $params[':d_to'] = strlen($dateTo) === 10 ? ($dateTo . ' 23:59:59') : $dateTo;
        } else {
            if ($period === 'today') {
                $where[] = "a.acctstarttime >= CURDATE()";
            } elseif ($period === 'yesterday') {
                $where[] = "a.acctstarttime >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND a.acctstarttime < CURDATE()";
            } elseif ($period === 'week') {
                $where[] = "a.acctstarttime >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
            } elseif ($period === 'month') {
                $where[] = "a.acctstarttime >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
            } elseif ($period === 'this_month') {
                $where[] = "a.acctstarttime >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')";
            } elseif ($period === 'last_month') {
                $where[] = "a.acctstarttime >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m-01 00:00:00') AND a.acctstarttime < DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')";
            }
        }

        $whereClause = implode(' AND ', $where);
        // 1. All Sessions on this port with Commercial vs Free split
        $sqlSessions = "
            SELECT a.radacctid, a.username, a.framedipaddress, a.callingstationid,
                   a.acctstarttime, a.acctstoptime, a.acctsessiontime,
                   (a.acctinputoctets + a.acctoutputoctets) AS total_bytes,
                   ROUND((a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024), 2) AS total_mb,
                   ROUND(a.acctoutputoctets / (1024 * 1024), 2) AS download_mb,
                   ROUND(a.acctinputoctets / (1024 * 1024), 2) AS upload_mb,
                   COALESCE(m.is_free_quota, 0) AS is_free_quota,
                   COALESCE(adm.fullname, '') AS free_recipient_name,
                   COALESCE(NULLIF(m.sale_price, 0), NULLIF(m.price, 0), NULLIF(p.price, 0), 0) AS card_price,
                   ROUND(
                       CASE 
                           WHEN m.is_free_quota = 1 THEN 0.00
                           WHEN p.transfer_limit > 0 THEN
                               ((a.acctinputoctets + a.acctoutputoctets) / p.transfer_limit) * COALESCE(NULLIF(m.sale_price, 0), NULLIF(m.price, 0), NULLIF(p.price, 0), 500)
                           ELSE
                               ((a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024)) * 0.5
                       END, 2
                   ) AS calculated_sales
            FROM radacct a
            LEFT JOIN um_vouchers_meta m ON (m.network_id = a.network_id OR m.network_id IS NULL OR m.network_id = 0) AND a.username = m.username
            LEFT JOIN um_admins adm ON m.free_recipient_id = adm.id
            LEFT JOIN radusergroup ug ON (ug.network_id = a.network_id OR ug.network_id IS NULL OR ug.network_id = 0) AND a.username = ug.username
            LEFT JOIN um_profiles_def p ON (p.network_id = a.network_id OR p.network_id IS NULL OR p.network_id = 0) AND (m.profile_name = p.name OR ug.groupname = p.name)
            WHERE $whereClause
            ORDER BY a.radacctid DESC
            LIMIT 150
        ";
        $stmt = $this->db->prepare($sqlSessions);
        $stmt->execute($params);
        $sessions = $stmt->fetchAll();

        // 2. Installed Assets / Equipment on this Port / Node
        $assetParams = [];
        $assetWhere = ["(ast.network_id = :anetid OR ast.network_id IS NULL OR ast.network_id = 0)"];
        $assetParams[':anetid'] = $networkId;
        if ($nodeId > 0) {
            $assetWhere[] = "(ast.node_id = :anodeid OR (ast.nas_ip = :anas AND ast.nas_port_id = :aport))";
            $assetParams[':anodeid'] = $nodeId;
            $assetParams[':anas'] = $nasIp;
            $assetParams[':aport'] = $portId;
        } elseif (!empty($nasIp)) {
            $assetWhere[] = "(ast.nas_ip = :anas AND (ast.nas_port_id = :aport OR (ast.nas_port_id IS NULL AND :aport = '')))";
            $assetParams[':anas'] = $nasIp;
            $assetParams[':aport'] = $portId;
        }

        $assetSql = "
            SELECT ast.*, COALESCE(adm.fullname, ast.responsible_person) AS responsible_display,
                   COALESCE(n.node_name, 'المنفذ العام') AS node_display
            FROM um_assets ast
            LEFT JOIN um_admins adm ON ast.assigned_to_user_id = adm.id
            LEFT JOIN um_network_nodes n ON ast.node_id = n.id
            WHERE " . implode(' AND ', $assetWhere) . "
            ORDER BY ast.id DESC
        ";
        $aStmt = $this->db->prepare($assetSql);
        $aStmt->execute($assetParams);
        $assets = $aStmt->fetchAll();

        // 3. Linked Nodes on this Port
        $nodeSql = "
            SELECT n.*, COALESCE(adm.fullname, n.responsible_name) AS responsible_display,
                   adm.phone AS responsible_admin_phone
            FROM um_network_nodes n
            LEFT JOIN um_admins adm ON n.responsible_admin_id = adm.id
            WHERE (n.network_id = ? OR n.network_id IS NULL OR n.network_id = 0) 
              AND (n.id = ? OR (n.nas_ip = ? AND (n.nas_port_id = ? OR (n.nas_port_id IS NULL AND ? = ''))))
        ";
        $nStmt = $this->db->prepare($nodeSql);
        $nStmt->execute([$networkId, $nodeId, $nasIp, $portId, $portId]);
        $nodes = $nStmt->fetchAll();

        // Totals
        $commMb = 0; $commSales = 0; $freeMb = 0; $totalDl = 0; $totalUl = 0;
        foreach ($sessions as $s) {
            $totalDl += (float)($s['download_mb'] ?? 0);
            $totalUl += (float)($s['upload_mb'] ?? 0);
            if (!empty($s['is_free_quota'])) {
                $freeMb += (float)$s['total_mb'];
            } else {
                $commMb += (float)$s['total_mb'];
                $commSales += (float)$s['calculated_sales'];
            }
        }
        return [
            'success' => true,
            'nas_ip' => $nasIp,
            'port_id' => $portId ?: 'الرئيسي',
            'node_id' => $nodeId,
            'node_info' => $targetNode,
            'summary' => [
                'total_sessions' => count($sessions),
                'commercial_mb' => round($commMb, 2),
                'commercial_sales' => round($commSales, 2),
                'free_mb' => round($freeMb, 2),
                'total_mb' => round($commMb + $freeMb, 2),
                'download_mb' => round($totalDl, 2),
                'upload_mb' => round($totalUl, 2),
                'assets_count' => count($assets),
                'nodes_count' => count($nodes)
            ],
            'sessions' => $sessions,
            'assets' => $assets,
            'nodes' => $nodes
        ];
    }
    // ==========================================
    // 9. FREE VOUCHERS SCHEDULING & ROI ANALYTICS
    // ==========================================

    // ==========================================
    // METHOD: getNetworkDevicesTable
    // ==========================================
    public function getNetworkDevicesTable(array $filters = []) {
        // The active network is authoritative. A posted network_id is only a
        // consistency assertion; it must never widen the result set.
        $activeNetworkId = (int)$this->getActiveNetworkId();
        $requestedNetworkId = (int)($filters['network_id'] ?? 0);
        if ($requestedNetworkId > 0 && $requestedNetworkId !== $activeNetworkId) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        $filters['network_id'] = $activeNetworkId;

        // Normalize array filters if passed as comma-separated strings
        foreach (['routers', 'ports', 'nodes', 'node_types', 'custodians', 'locations', 'platforms', 'statuses'] as $k) {
            if (isset($filters[$k]) && is_string($filters[$k])) {
                $filters[$k] = array_filter(array_map('trim', explode(',', $filters[$k])));
            }
        }
        // 1. Detect duplicate MACs inside the active network only. The same
        // physical address may legitimately exist in another isolated network.
        $dupMacStmt = $this->db->prepare("
            SELECT mac_address, COUNT(*) as cnt 
            FROM um_assets 
            WHERE network_id = :dup_network
              AND mac_address IS NOT NULL AND TRIM(mac_address) != '' 
            GROUP BY mac_address 
            HAVING cnt > 1
        ");
        $dupMacStmt->execute([':dup_network' => $activeNetworkId]);
        $duplicateMacs = [];
        while ($r = $dupMacStmt->fetch()) {
            $duplicateMacs[strtoupper(trim($r['mac_address']))] = (int)$r['cnt'];
        }
        // 2. Build WHERE clauses
        $where = ["a.network_id = :network_id"];
        $params = [':network_id' => $activeNetworkId];
        // Filter: Routers (Multi-select)
        if (!empty($filters['routers']) && is_array($filters['routers'])) {
            $rIn = [];
            foreach ($filters['routers'] as $i => $rip) {
                if (trim($rip) !== '') {
                    $key = ":r_ip_$i";
                    $rIn[] = $key;
                    $params[$key] = trim($rip);
                }
            }
            if (!empty($rIn)) {
                $where[] = "a.nas_ip IN (" . implode(',', $rIn) . ")";
            }
        } elseif (!empty($filters['router_ip'])) {
            $where[] = "a.nas_ip = :r_ip_single";
            $params[':r_ip_single'] = trim($filters['router_ip']);
        }
        // Filter: Ports (Multi-select)
        if (!empty($filters['ports']) && is_array($filters['ports'])) {
            $pIn = [];
            foreach ($filters['ports'] as $i => $p) {
                if (trim($p) !== '') {
                    $key = ":p_id_$i";
                    $pIn[] = $key;
                    $params[$key] = trim($p);
                }
            }
            if (!empty($pIn)) {
                $where[] = "a.nas_port_id IN (" . implode(',', $pIn) . ")";
            }
        }
        // Filter: Nodes (Multi-select)
        if (!empty($filters['nodes']) && is_array($filters['nodes'])) {
            $nIn = [];
            $includeUnassigned = false;
            foreach ($filters['nodes'] as $i => $nid) {
                if ($nid === 'unassigned' || $nid === '0' || $nid === 0) {
                    $includeUnassigned = true;
                } elseif (is_numeric($nid) && (int)$nid > 0) {
                    $key = ":n_id_$i";
                    $nIn[] = $key;
                    $params[$key] = (int)$nid;
                }
            }
            $nodeConditions = [];
            if (!empty($nIn)) $nodeConditions[] = "a.node_id IN (" . implode(',', $nIn) . ")";
            if ($includeUnassigned) $nodeConditions[] = "a.node_id IS NULL OR a.node_id = 0";
            if (!empty($nodeConditions)) {
                $where[] = "(" . implode(' OR ', $nodeConditions) . ")";
            }
        }
        // Filter: Node Types (main_node / sub_node)
        if (!empty($filters['node_types']) && is_array($filters['node_types'])) {
            $ntIn = [];
            foreach ($filters['node_types'] as $i => $nt) {
                if (in_array($nt, ['main_node', 'sub_node', 'regular'])) {
                    $key = ":nt_$i";
                    $ntIn[] = $key;
                    $params[$key] = $nt;
                }
            }
            if (!empty($ntIn)) {
                $where[] = "n.node_type IN (" . implode(',', $ntIn) . ")";
            }
        }
        // Filter: Custodians / Responsibles (Multi-select)
        if (!empty($filters['custodians']) && is_array($filters['custodians'])) {
            $cIn = [];
            $includeUnassignedCust = false;
            foreach ($filters['custodians'] as $i => $cid) {
                if ($cid === 'unassigned' || $cid === '0' || $cid === 0) {
                    $includeUnassignedCust = true;
                } elseif (is_numeric($cid) && (int)$cid > 0) {
                    $key = ":c_id_$i";
                    $cIn[] = $key;
                    $params[$key] = (int)$cid;
                }
            }
            $custConditions = [];
            if (!empty($cIn)) $custConditions[] = "a.assigned_to_user_id IN (" . implode(',', $cIn) . ")";
            if ($includeUnassignedCust) $custConditions[] = "a.assigned_to_user_id IS NULL OR a.assigned_to_user_id = 0";
            if (!empty($custConditions)) {
                $where[] = "(" . implode(' OR ', $custConditions) . ")";
            }
        }
        // Filter: Locations (Multi-select)
        if (!empty($filters['locations']) && is_array($filters['locations'])) {
            $lIn = [];
            foreach ($filters['locations'] as $i => $loc) {
                if (trim($loc) !== '') {
                    $key = ":loc_$i";
                    $lIn[] = $key;
                    $params[$key] = trim($loc);
                }
            }
            if (!empty($lIn)) {
                $where[] = "(a.location IN (" . implode(',', $lIn) . ") OR n.location IN (" . implode(',', $lIn) . "))";
            }
        }
        // Filter: Platforms / Device Types (Multi-select)
        if (!empty($filters['platforms']) && is_array($filters['platforms'])) {
            $platIn = [];
            foreach ($filters['platforms'] as $i => $plat) {
                if (trim($plat) !== '') {
                    $key = ":plat_$i";
                    $platIn[] = $key;
                    $params[$key] = trim($plat);
                }
            }
            if (!empty($platIn)) {
                $where[] = "a.platform IN (" . implode(',', $platIn) . ")";
            }
        }
        // Filter: Statuses (Multi-select)
        if (!empty($filters['statuses']) && is_array($filters['statuses'])) {
            $sIn = [];
            foreach ($filters['statuses'] as $i => $st) {
                if (trim($st) !== '') {
                    $key = ":st_$i";
                    $sIn[] = $key;
                    $params[$key] = trim($st);
                }
            }
            if (!empty($sIn)) {
                $where[] = "a.status IN (" . implode(',', $sIn) . ")";
            }
        }
        // Filter: Date Range (Last seen or created_at)
        if (!empty($filters['date_from'])) {
            $where[] = "COALESCE(a.last_seen, a.created_at) >= :d_from";
            $params[':d_from'] = $filters['date_from'] . ' 00:00:00';
        }
        if (!empty($filters['date_to'])) {
            $where[] = "COALESCE(a.last_seen, a.created_at) <= :d_to";
            $params[':d_to'] = $filters['date_to'] . ' 23:59:59';
        }
        // Filter: Duplicate MACs Only
        if (!empty($filters['is_duplicate_mac_only'])) {
            if (empty($duplicateMacs)) {
                $where[] = "1=0"; // No duplicates exist
            } else {
                $dupKeys = [];
                foreach (array_keys($duplicateMacs) as $idx => $dmac) {
                    $k = ":dup_mac_$idx";
                    $dupKeys[] = $k;
                    $params[$k] = $dmac;
                }
                $where[] = "UPPER(TRIM(a.mac_address)) IN (" . implode(',', $dupKeys) . ")";
            }
        }
        // Column-Specific Search with Unique Parameter Keys
        $searchQuery = trim($filters['search_query'] ?? ($filters['search'] ?? ''));
        $searchCol = trim($filters['search_column'] ?? 'all');
        if (!empty($searchQuery)) {
            $qLike = "%$searchQuery%";
            switch ($searchCol) {
                case 'identity':
                case 'name':
                    $where[] = "(a.name LIKE :sq_id1 OR a.neighbor_identity LIKE :sq_id2)";
                    $params[':sq_id1'] = $qLike;
                    $params[':sq_id2'] = $qLike;
                    break;
                case 'mac_address':
                case 'mac':
                    $where[] = "a.mac_address LIKE :sq_mac";
                    $params[':sq_mac'] = $qLike;
                    break;
                case 'ip_address':
                case 'ip':
                    $where[] = "a.ip_address LIKE :sq_ip";
                    $params[':sq_ip'] = $qLike;
                    break;
                case 'nas_port_id':
                case 'port':
                case 'interface':
                    $where[] = "(a.nas_port_id LIKE :sq_p1 OR n.nas_port_id LIKE :sq_p2)";
                    $params[':sq_p1'] = $qLike;
                    $params[':sq_p2'] = $qLike;
                    break;
                case 'location':
                    $where[] = "(a.location LIKE :sq_loc1 OR n.location LIKE :sq_loc2)";
                    $params[':sq_loc1'] = $qLike;
                    $params[':sq_loc2'] = $qLike;
                    break;
                case 'version':
                    $where[] = "a.version LIKE :sq_ver";
                    $params[':sq_ver'] = $qLike;
                    break;
                case 'platform':
                case 'model':
                    $where[] = "(a.platform LIKE :sq_plat1 OR a.model LIKE :sq_plat2)";
                    $params[':sq_plat1'] = $qLike;
                    $params[':sq_plat2'] = $qLike;
                    break;
                case 'responsible':
                case 'custodian':
                    $where[] = "(a.responsible_person LIKE :sq_resp1 OR adm.fullname LIKE :sq_resp2 OR n.responsible_name LIKE :sq_resp3)";
                    $params[':sq_resp1'] = $qLike;
                    $params[':sq_resp2'] = $qLike;
                    $params[':sq_resp3'] = $qLike;
                    break;
                case 'serial_number':
                case 'code':
                    $where[] = "(a.serial_number LIKE :sq_sn1 OR a.asset_code LIKE :sq_sn2 OR n.code LIKE :sq_sn3)";
                    $params[':sq_sn1'] = $qLike;
                    $params[':sq_sn2'] = $qLike;
                    $params[':sq_sn3'] = $qLike;
                    break;
                case 'all':
                default:
                    $cols = [
                        'a.name' => ':sq_all_name',
                        'a.mac_address' => ':sq_all_mac',
                        'a.ip_address' => ':sq_all_ip',
                        'a.nas_port_id' => ':sq_all_port',
                        'a.platform' => ':sq_all_plat',
                        'a.model' => ':sq_all_model',
                        'a.version' => ':sq_all_ver',
                        'a.location' => ':sq_all_loc',
                        'a.responsible_person' => ':sq_all_resp',
                        'a.serial_number' => ':sq_all_sn',
                        'a.asset_code' => ':sq_all_code',
                        'n.node_name' => ':sq_all_nname',
                        'adm.fullname' => ':sq_all_aname'
                    ];
                    $subConds = [];
                    foreach ($cols as $colName => $pKey) {
                        $subConds[] = "$colName LIKE $pKey";
                        $params[$pKey] = $qLike;
                    }
                    $where[] = "(" . implode(' OR ', $subConds) . ")";
                    break;
            }
        }
        $whereClause = implode(' AND ', $where);
        $sql = "
            SELECT a.*,
                   n.node_name,
                   n.node_type,
                   n.code AS node_code,
                   n.parent_id AS node_parent_id,
                   p.node_name AS parent_node_name,
                   p.node_type AS parent_node_type,
                   r.shortname AS router_name,
                   COALESCE(adm.fullname, a.responsible_person, n.responsible_name) AS custodian_name,
                   COALESCE(adm.phone, n.responsible_phone) AS custodian_phone
            FROM um_assets a
            LEFT JOIN um_networks net ON a.network_id = net.id
            LEFT JOIN um_network_nodes n ON a.node_id = n.id AND n.network_id = a.network_id
            LEFT JOIN um_network_nodes p ON n.parent_id = p.id AND p.network_id = a.network_id
            LEFT JOIN um_admins adm ON a.assigned_to_user_id = adm.id
            LEFT JOIN nas r ON a.nas_ip = r.nasname AND r.network_id = a.network_id
            WHERE $whereClause
            ORDER BY a.nas_ip ASC, a.nas_port_id ASC, a.id DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rawDevices = $stmt->fetchAll();
        // 3. Post-process stats & enrich duplicate MAC flags
        $devices = [];
        $activeDevicesCount = 0;
        $maintenanceDevicesCount = 0;
        $inStockDevicesCount = 0;
        $damagedDevicesCount = 0;
        $duplicateMacDevicesCount = 0;
        foreach ($rawDevices as $dev) {
            $mac = strtoupper(trim($dev['mac_address'] ?? ''));
            $isDup = !empty($mac) && isset($duplicateMacs[$mac]) && $duplicateMacs[$mac] > 1;
            $dev['is_duplicate_mac'] = $isDup;
            $dev['duplicate_count'] = $isDup ? $duplicateMacs[$mac] : 1;
            if ($dev['status'] === 'in_service') {
                $activeDevicesCount++;
            } elseif ($dev['status'] === 'maintenance') {
                $maintenanceDevicesCount++;
            } elseif ($dev['status'] === 'in_stock') {
                $inStockDevicesCount++;
            } elseif ($dev['status'] === 'damaged') {
                $damagedDevicesCount++;
            }
            if ($isDup) {
                $duplicateMacDevicesCount++;
            }
            $devices[] = $dev;
        }
        // 4. Grouping logic
        $groupBy = trim($filters['group_by'] ?? 'flat');
        $groups = [];
        if ($groupBy !== 'flat' && $groupBy !== 'tree' && !empty($groupBy)) {
            $groupMap = [];
            foreach ($devices as $d) {
                $gKey = '';
                $gLabel = '';
                switch ($groupBy) {
                    case 'router':
                        $gKey = $d['nas_ip'] ?: 'unknown_router';
                        $gLabel = ($d['router_name'] ? $d['router_name'] . ' (' . $d['nas_ip'] . ')' : ($d['nas_ip'] ?: 'راوتر غير محدد'));
                        break;
                    case 'port':
                        $gKey = ($d['nas_ip'] ?: 'no_router') . '___' . ($d['nas_port_id'] ?: 'no_port');
                        $gLabel = ($d['nas_ip'] ? $d['nas_ip'] . ' ➔ ' : '') . ($d['nas_port_id'] ?: 'منفذ عام');
                        break;
                    case 'node':
                        $gKey = (string)($d['node_id'] ?: 'unassigned_node');
                        $gLabel = $d['node_name'] ? ($d['node_name'] . ' (' . ($d['node_type'] === 'main_node' ? 'أساسية' : 'فرعية') . ')') : 'أجهزة غير مرتبطة بنقطة';
                        break;
                    case 'platform':
                        $gKey = strtolower(trim($d['platform'] ?: 'unknown_platform'));
                        $gLabel = $d['platform'] ?: 'منصة / موديل غير محدد';
                        break;
                    case 'status':
                        $gKey = $d['status'] ?: 'in_service';
                        $gLabel = $d['status'] === 'in_service' ? '🟢 يعمل / بالخدمة (in_service)' :
                                 ($d['status'] === 'maintenance' ? '🟠 تحت الصيانة (maintenance)' :
                                 ($d['status'] === 'in_stock' ? '📦 في المخزن (in_stock)' :
                                 ($d['status'] === 'damaged' ? '🔴 تالف / معطوب (damaged)' : '⚪ غير موجود / مفصول (retired)')));
                        break;
                    case 'custodian':
                        $gKey = (string)($d['assigned_to_user_id'] ?: 'unassigned_cust');
                        $gLabel = $d['custodian_name'] ?: 'المخزن العام (بدون عهدة محددة)';
                        break;
                    default:
                        $gKey = 'all';
                        $gLabel = 'كافة الأجهزة';
                        break;
                }
                if (!isset($groupMap[$gKey])) {
                    $groupMap[$gKey] = [
                        'group_key' => $gKey,
                        'group_label' => $gLabel,
                        'group_type' => $groupBy,
                        'total_count' => 0,
                        'active_count' => 0,
                        'duplicate_count' => 0,
                        'devices' => []
                    ];
                }
                $groupMap[$gKey]['total_count']++;
                if ($d['status'] === 'in_service') $groupMap[$gKey]['active_count']++;
                if ($d['is_duplicate_mac']) $groupMap[$gKey]['duplicate_count']++;
                $groupMap[$gKey]['devices'][] = $d;
            }
            $groups = array_values($groupMap);
        }
        // 5. Unique Filter Options for Dropdowns
        $uniqueRoutersStmt = $this->db->prepare("SELECT DISTINCT nas_ip FROM um_assets WHERE network_id = :network_id AND nas_ip IS NOT NULL AND nas_ip != '' UNION SELECT nasname FROM nas WHERE network_id = :nas_network_id");
        $uniqueRoutersStmt->execute([':network_id' => $activeNetworkId, ':nas_network_id' => $activeNetworkId]);
        $uniqueRouters = $uniqueRoutersStmt->fetchAll(PDO::FETCH_COLUMN);
        $uniquePortsStmt = $this->db->prepare("SELECT DISTINCT nas_port_id FROM um_assets WHERE network_id = :network_id AND nas_port_id IS NOT NULL AND nas_port_id != '' UNION SELECT DISTINCT nas_port_id FROM um_network_nodes WHERE network_id = :node_network_id AND nas_port_id IS NOT NULL AND nas_port_id != ''");
        $uniquePortsStmt->execute([':network_id' => $activeNetworkId, ':node_network_id' => $activeNetworkId]);
        $uniquePorts = $uniquePortsStmt->fetchAll(PDO::FETCH_COLUMN);
        $uniquePlatformsStmt = $this->db->prepare("SELECT DISTINCT platform FROM um_assets WHERE network_id = :network_id AND platform IS NOT NULL AND platform != ''");
        $uniquePlatformsStmt->execute([':network_id' => $activeNetworkId]);
        $uniquePlatforms = $uniquePlatformsStmt->fetchAll(PDO::FETCH_COLUMN);
        $uniqueLocationsStmt = $this->db->prepare("SELECT DISTINCT location FROM um_assets WHERE network_id = :network_id AND location IS NOT NULL AND location != '' UNION SELECT DISTINCT location FROM um_network_nodes WHERE network_id = :node_network_id AND location IS NOT NULL AND location != ''");
        $uniqueLocationsStmt->execute([':network_id' => $activeNetworkId, ':node_network_id' => $activeNetworkId]);
        $uniqueLocations = $uniqueLocationsStmt->fetchAll(PDO::FETCH_COLUMN);
        return [
            'success' => true,
            'summary' => [
                'total_devices' => count($devices),
                'active_devices' => $activeDevicesCount,
                'maintenance_devices' => $maintenanceDevicesCount,
                'in_stock_devices' => $inStockDevicesCount,
                'damaged_devices' => $damagedDevicesCount,
                'duplicate_mac_count' => $duplicateMacDevicesCount,
            ],
            'devices' => $devices,
            'groups' => $groups,
            'filter_options' => [
                'routers' => array_values(array_filter(array_unique($uniqueRouters))),
                'ports' => array_values(array_filter(array_unique($uniquePorts))),
                'platforms' => array_values(array_filter(array_unique($uniquePlatforms))),
                'locations' => array_values(array_filter(array_unique($uniqueLocations))),
                'statuses' => [
                    ['id' => 'in_service', 'label' => '🟢 يعمل / بالخدمة (in_service)'],
                    ['id' => 'maintenance', 'label' => '🟠 تحت الصيانة (maintenance)'],
                    ['id' => 'in_stock', 'label' => '📦 في المخزن (in_stock)'],
                    ['id' => 'damaged', 'label' => '🔴 تالف / معطوب (damaged)'],
                    ['id' => 'retired', 'label' => '⚪ غير موجود / مفصول (retired)']
                ]
            ]
        ];
    }

    // ==========================================
    // METHOD: batchUpdateNetworkDevices
    // ==========================================
    public function batchUpdateNetworkDevices(array $assetIds, array $updates) {
        $activeNetworkId = (int)$this->getActiveNetworkId();
        if ($activeNetworkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        if (empty($assetIds)) {
            return ['success' => false, 'error' => 'لم يتم تحديد أي أجهزة للتعديل'];
        }
        $ids = array_map('intval', array_filter($assetIds));
        if (empty($ids)) {
            return ['success' => false, 'error' => 'معرفات الأجهزة غير صالحة'];
        }
        $inPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        $scopeStmt = $this->db->prepare("SELECT COUNT(*) FROM um_assets WHERE network_id = ? AND id IN ($inPlaceholders)");
        $scopeStmt->execute(array_merge([$activeNetworkId], $ids));
        if ((int)$scopeStmt->fetchColumn() !== count($ids)) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        if (array_key_exists('network_id', $updates)) {
            throw new DomainException('NETWORK_ASSIGNMENT_OWNER_ONLY');
        }
        $this->db->beginTransaction();
        try {
            if (!empty($updates['bulk_delete'])) {
                $stmt = $this->db->prepare("DELETE FROM um_assets WHERE network_id = ? AND id IN ($inPlaceholders)");
                $stmt->execute(array_merge([$activeNetworkId], $ids));
                $deletedCount = $stmt->rowCount();
                $this->db->commit();
                return ['success' => true, 'message' => "تم حذف $deletedCount جهاز بنجاح", 'affected' => $deletedCount];
            }
            $fields = [];
            $params = [];
            if (array_key_exists('node_id', $updates)) {
                $nodeId = !empty($updates['node_id']) ? (int)$updates['node_id'] : null;
                $fields[] = "node_id = ?";
                $params[] = $nodeId;
                // Sync router/port from node if moving to node
                if ($nodeId) {
                    $nStmt = $this->db->prepare("SELECT nas_ip, nas_port_id FROM um_network_nodes WHERE id = ? AND network_id = ?");
                    $nStmt->execute([$nodeId, $activeNetworkId]);
                    $nodeRow = $nStmt->fetch();
                    if ($nodeRow) {
                        $fields[] = "nas_ip = COALESCE(?, nas_ip)";
                        $params[] = $nodeRow['nas_ip'];
                        if (!empty($nodeRow['nas_port_id'])) {
                            $fields[] = "nas_port_id = ?";
                            $params[] = $nodeRow['nas_port_id'];
                        }
                    }
                }
            }
            if (array_key_exists('location', $updates) && $updates['location'] !== null) {
                $fields[] = "location = ?";
                $params[] = trim((string)$updates['location']);
            }
            if (array_key_exists('assigned_to_user_id', $updates)) {
                $adminId = !empty($updates['assigned_to_user_id']) ? (int)$updates['assigned_to_user_id'] : null;
                $fields[] = "assigned_to_user_id = ?";
                $params[] = $adminId;
                if ($adminId) {
                    $aStmt = $this->db->prepare("SELECT fullname FROM um_admins WHERE id = ?");
                    $aStmt->execute([$adminId]);
                    $admName = $aStmt->fetchColumn() ?: null;
                    $fields[] = "responsible_person = ?";
                    $params[] = $admName;
                } else {
                    $fields[] = "responsible_person = NULL";
                }
            }
            if (array_key_exists('status', $updates)) {
                $status = trim((string)$updates['status']);
                if (in_array($status, ['in_service', 'maintenance', 'in_stock', 'damaged', 'retired'])) {
                    $fields[] = "status = ?";
                    $params[] = $status;
                }
            }
            if (empty($fields)) {
                $this->db->rollBack();
                return ['success' => false, 'error' => 'لم يتم تحديد أي حقول لتحديثها'];
            }
            $fields[] = "updated_by_name = 'مدير النظام (تعديل جماعي)'";
            $sql = "UPDATE um_assets SET " . implode(', ', $fields) . " WHERE network_id = ? AND id IN ($inPlaceholders)";
            $allParams = array_merge($params, $ids);
            array_splice($allParams, count($params), 0, [$activeNetworkId]);
            $stmt = $this->db->prepare($sql);
            $stmt->execute($allParams);
            $affected = $stmt->rowCount();
            $this->db->commit();
            return [
                'success' => true,
                'message' => "تم بنجاح تحديث بيانات $affected جهاز من الأجهزة المحددة",
                'affected' => $affected
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['success' => false, 'error' => 'فشل التعديل الجماعي: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: getNeighborScanSettings
    // ==========================================
    public function getNeighborScanSettings() {
        $stmt = $this->db->query("SELECT setting_key, setting_value FROM um_settings WHERE setting_key LIKE 'neighbor_%'");
        $settings = [];
        while ($r = $stmt->fetch()) {
            $settings[$r['setting_key']] = $r['setting_value'];
        }
        return [
            'success' => true,
            'enabled' => ($settings['neighbor_auto_scan_enabled'] ?? '0') === '1',
            'interval_min' => (int)($settings['neighbor_auto_scan_interval_min'] ?? 15),
            'auto_create' => ($settings['neighbor_auto_scan_auto_create'] ?? '1') === '1',
            'last_run' => $settings['neighbor_auto_scan_last_run'] ?? null
        ];
    }

    // ==========================================
    // METHOD: saveNeighborScanSettings
    // ==========================================
    public function saveNeighborScanSettings(array $input) {
        $enabled = !empty($input['enabled']) ? '1' : '0';
        $interval = max(1, min(1440, (int)($input['interval_min'] ?? 15)));
        $autoCreate = !empty($input['auto_create']) ? '1' : '0';
        $stmt = $this->db->prepare("
            INSERT INTO um_settings (setting_key, setting_value) VALUES 
            ('neighbor_auto_scan_enabled', :e),
            ('neighbor_auto_scan_interval_min', :i),
            ('neighbor_auto_scan_auto_create', :c)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        ");
        $stmt->execute([':e' => $enabled, ':i' => (string)$interval, ':c' => $autoCreate]);
        return ['success' => true, 'message' => 'تم حفظ إعدادات الفحص المجدول لجيران الميكروتك بنجاح'];
    }

    // ==========================================
    // METHOD: autoScanAllRoutersNeighbors
    // ==========================================
    public function autoScanAllRoutersNeighbors($force = false) {
        require_once __DIR__ . '/RouterOSApi.php';
        $networkId = (int)$this->getActiveNetworkId();
        $routerStmt = $this->db->prepare("SELECT * FROM nas WHERE network_id=? ORDER BY id ASC");
        $routerStmt->execute([$networkId]);
        $routers = $routerStmt->fetchAll();
        $totalRouters = count($routers);
        $scannedRouters = 0;
        $totalNeighborsFound = 0;
        $totalUpdated = 0;
        $totalCreated = 0;
        $logs = [];
        $settings = $this->getNeighborScanSettings();
        $autoCreate = $settings['auto_create'];
        foreach ($routers as $router) {
            $nasId = (int)$router['id'];
            $rIp = $router['nasname'];
            $rName = $router['shortname'] ?: $rIp;
            try {
                $cfg = $this->getRouterConnectionConfig($nasId);
                $api = new RouterOSApi();
                $api->timeout = 5;
                $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
                if (!$connected) {
                    $logs[] = "⚠️ فشل الاتصال براوتر $rName ($rIp): " . ($api->error_str ?: 'مهلة الاتصال');
                    continue;
                }
                $raw = $api->comm('/ip/neighbor/print');
                $api->disconnect();
                if (!is_array($raw)) $raw = [];
                $count = count($raw);
                $totalNeighborsFound += $count;
                $scannedRouters++;
                // Process neighbors
                foreach ($raw as $item) {
                    $iface = trim((string)($item['interface'] ?? ''));
                    $ident = trim((string)($item['identity'] ?? ''));
                    $mac = strtoupper(trim((string)($item['mac-address'] ?? '')));
                    $ip = trim((string)($item['address'] ?? ($item['address4'] ?? ($item['ipv4-address'] ?? ''))));
                    $plat = trim((string)($item['platform'] ?? ($item['board'] ?? '')));
                    $ver = trim((string)($item['version'] ?? ''));
                    if (empty($mac) && empty($ip) && empty($ident)) continue;
                    // Match existing asset by MAC or IP
                    $findStmt = $this->db->prepare("SELECT id FROM um_assets WHERE network_id=? AND ((mac_address != '' AND mac_address = ?) OR (ip_address != '' AND ip_address = ?)) LIMIT 1");
                    $findStmt->execute([$networkId, $mac, $ip]);
                    $existingAssetId = $findStmt->fetchColumn();
                    // Check / create port node (The Node IS the Port)
                    $nodeId = null;
                    if (!empty($iface)) {
                        $isEther = (stripos($iface, 'ether') !== false);
                        $nodeType = $isEther ? 'main_node' : 'sub_node';
                        $findNode = $this->db->prepare("
                            SELECT id FROM um_network_nodes 
                            WHERE nas_ip = ? AND (nas_port_id = ? OR node_name = ?) 
                            LIMIT 1
                        ");
                        $findNode->execute([$rIp, $iface, $iface]);
                        $nodeId = $findNode->fetchColumn();
                        if (!$nodeId && $autoCreate) {
                            $parentId = null;
                            if ($nodeType === 'sub_node') {
                                $findP = $this->db->prepare("SELECT id FROM um_network_nodes WHERE nas_ip = ? AND node_type = 'main_node' ORDER BY id ASC LIMIT 1");
                                $findP->execute([$rIp]);
                                $parentId = $findP->fetchColumn() ?: null;
                            }
                            $insN = $this->db->prepare("
                                INSERT INTO um_network_nodes 
                                (node_type, parent_id, nas_ip, nas_port_id, node_name, location, notes, is_active, network_id) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                            ");
                            $insN->execute([$nodeType, $parentId, $rIp, $iface, $iface, 'منفذ ' . $iface, $isEther ? 'نقطة أساسية (منفذ ether)' : 'نقطة فرعية', $networkId]);
                            $nodeId = (int)$this->db->lastInsertId();
                            $ccCode = 'CC-PORT-' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $iface) . '-' . $nodeId;
                            $this->db->prepare("INSERT INTO um_cost_centers (center_code, name, center_type, ref_id, is_active) VALUES (?, ?, 'tower_node', ?, 1)")
                                ->execute([$ccCode, ($isEther ? 'منفذ رئيسي: ' : 'منفذ فرعي: ') . $iface, $nodeId]);
                        }
                    }
                    // Find Parent Router Asset to inherit ownership, responsible person & network
                    $parentRouterAssetStmt = $this->db->prepare("SELECT * FROM um_assets WHERE network_id=? AND (ip_address = ? OR (category = 'routers' AND name LIKE ?)) LIMIT 1");
                    $parentRouterAssetStmt->execute([$networkId, $rIp, "%$rName%"]);
                    $parentRouterAsset = $parentRouterAssetStmt->fetch(PDO::FETCH_ASSOC);
                    $inheritedRespPerson = $parentRouterAsset['responsible_person'] ?? ($router['created_by_name'] ?? 'إدارة الشبكة');
                    $inheritedAssignedUserId = !empty($parentRouterAsset['assigned_to_user_id']) ? (int)$parentRouterAsset['assigned_to_user_id'] : (!empty($router['created_by_admin_id']) ? (int)$router['created_by_admin_id'] : 1);
                    $inheritedNetworkId = !empty($parentRouterAsset['network_id']) ? (int)$parentRouterAsset['network_id'] : $networkId;
                    $inheritedLocation = !empty($parentRouterAsset['location']) ? ($parentRouterAsset['location'] . ' - منفذ ' . $iface) : ("موقع راوتر {$rName} - منفذ {$iface}");
                    if ($existingAssetId) {
                        $upd = $this->db->prepare("
                            UPDATE um_assets 
                            SET node_id = COALESCE(?, node_id),
                                nas_ip = ?, nas_port_id = COALESCE(NULLIF(?, ''), nas_port_id),
                                ip_address = COALESCE(NULLIF(?, ''), ip_address),
                                mac_address = COALESCE(NULLIF(?, ''), mac_address),
                                platform = COALESCE(NULLIF(?, ''), platform),
                                version = COALESCE(NULLIF(?, ''), version),
                                responsible_person = COALESCE(NULLIF(responsible_person, ''), ?),
                                assigned_to_user_id = COALESCE(assigned_to_user_id, ?),
                                network_id = COALESCE(network_id, ?),
                                last_seen = NOW(), status = 'in_service'
                            WHERE id = ? AND network_id = ?
                        ");
                        $upd->execute([$nodeId, $rIp, $iface, $ip, $mac, $plat, $ver, $inheritedRespPerson, $inheritedAssignedUserId, $inheritedNetworkId, (int)$existingAssetId, $networkId]);
                        $totalUpdated++;
                    } elseif ($autoCreate) {
                        if (empty($ident)) $ident = ($plat ?: 'جهاز') . ' (' . substr($mac, -5) . ')';
                        $assetCode = 'AST-' . strtoupper(substr(md5($mac . $ident . time()), 0, 8));
                        $cat = (stripos($plat, 'router') !== false || stripos($plat, 'ccr') !== false || stripos($plat, 'rb') !== false) ? 'routers' : 'antennas_dishes';
                        $insA = $this->db->prepare("
                            INSERT INTO um_assets (asset_code, name, category, model, serial_number, purchase_cost, current_value, location, status, node_id, nas_ip, nas_port_id, ip_address, mac_address, platform, version, responsible_person, assigned_to_user_id, network_id, source_type, created_by_admin_id, created_by_name, last_seen, notes)
                            VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'in_service', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'router_discovery', ?, ?, NOW(), 'مكتشف ومستورد آلياً بالفحص الدوري للجيران ومرتبط بمسؤول الراوتر')
                        ");
                        $insA->execute([
                            $assetCode, $ident . ' - ' . ($plat ?: 'جهاز لاسلكي'),
                            $cat, $plat, $mac, $inheritedLocation, (int)$nodeId, $rIp, $iface, $ip, $mac, $plat, $ver,
                            $inheritedRespPerson, $inheritedAssignedUserId, $inheritedNetworkId, $inheritedAssignedUserId, $inheritedRespPerson
                        ]);
                        $totalCreated++;
                    }
                }
                $logs[] = "✅ راوتر $rName ($rIp): تم فحص $count أجهزة جيران بنجاح";
            } catch (Throwable $e) {
                $logs[] = "❌ خطأ في فحص راوتر $rName ($rIp): " . $e->getMessage();
            }
        }
        $this->db->prepare("UPDATE um_assets SET source_type='router_discovery' WHERE network_id=? AND (first_discovered_at IS NOT NULL OR notes LIKE '%جيران%')")->execute([$networkId]);
        // Update last run in um_settings
        $now = date('Y-m-d H:i:s');
        $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value) VALUES ('neighbor_auto_scan_last_run', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")->execute([$now]);
        return [
            'success' => true,
            'timestamp' => $now,
            'scanned_routers' => $scannedRouters,
            'total_routers' => $totalRouters,
            'neighbors_found' => $totalNeighborsFound,
            'updated_devices' => $totalUpdated,
            'created_devices' => $totalCreated,
            'logs' => $logs,
            'message' => "اكتمل الفحص الشامل لـ ($scannedRouters/$totalRouters) راوتر: تم اكتشاف ($totalNeighborsFound) جهاز، وتحديث ($totalUpdated)، وإضافة ($totalCreated) جهاز جديد!"
        ];
    }

    // ==========================================
    // METHOD: fetchRouterNeighbors
    // ==========================================
    public function fetchRouterNeighbors($nasId, $customCreds = null) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId, $customCreds);
        $api = new RouterOSApi();
        $api->timeout = 6;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            $err = $api->error_str ?: 'تعذر الاتصال بـ API الراوتر لجلب الجيران. تأكد من تفعيل منفذ 8728 وصحة البيانات.';
            return ['success' => false, 'error' => $err];
        }
        $rawNeighbors = $api->comm('/ip/neighbor/print');
        $api->disconnect();
        if (!is_array($rawNeighbors)) {
            $rawNeighbors = [];
        }
        return $this->enrichNeighborsData($cfg['ip'], $rawNeighbors);
    }

    // ==========================================
    // METHOD: enrichNeighborsData
    // ==========================================
    public function enrichNeighborsData($routerIp, array $rawNeighbors) {
        // Fetch existing nodes and assets to detect already imported items
        $nodeStmt = $this->db->prepare("SELECT id, node_name, nas_port_id, nas_ip, node_type FROM um_network_nodes WHERE nas_ip = ?");
        $nodeStmt->execute([$routerIp]);
        $existingNodes = $nodeStmt->fetchAll();
        $assetStmt = $this->db->prepare("SELECT id, name, serial_number, mac_address, ip_address, node_id, nas_port_id FROM um_assets WHERE nas_ip = ? OR serial_number != ''");
        $assetStmt->execute([$routerIp]);
        $existingAssets = $assetStmt->fetchAll();
        $portNodeMap = [];
        foreach ($existingNodes as $n) {
            if (!empty($n['nas_port_id'])) {
                $portNodeMap[strtolower(trim($n['nas_port_id']))] = $n;
            }
            if (!empty($n['node_name'])) {
                $portNodeMap[strtolower(trim($n['node_name']))] = $n;
            }
        }
        $assetMapByMac = [];
        $assetMapByIp = [];
        foreach ($existingAssets as $a) {
            if (!empty($a['mac_address'])) $assetMapByMac[strtolower(trim($a['mac_address']))] = $a;
            if (!empty($a['serial_number'])) $assetMapByMac[strtolower(trim($a['serial_number']))] = $a;
            if (!empty($a['ip_address'])) $assetMapByIp[trim($a['ip_address'])] = $a;
        }
        $parsed = [];
        foreach ($rawNeighbors as $item) {
            $iface = trim((string)($item['interface'] ?? ''));
            $addr = trim((string)($item['address'] ?? ($item['address4'] ?? ($item['ipv4-address'] ?? ''))));
            $mac = strtoupper(trim((string)($item['mac-address'] ?? '')));
            $ident = trim((string)($item['identity'] ?? ''));
            $plat = trim((string)($item['platform'] ?? ($item['board-name'] ?? '')));
            $ver = trim((string)($item['version'] ?? ''));
            $up = trim((string)($item['uptime'] ?? ''));
            $age = trim((string)($item['age'] ?? ''));
            if (empty($iface) && empty($mac) && empty($ident)) continue;
            $matchedNode = !empty($iface) ? ($portNodeMap[strtolower($iface)] ?? null) : null;
            $matchedAsset = !empty($mac) ? ($assetMapByMac[strtolower($mac)] ?? null) : (!empty($addr) ? ($assetMapByIp[$addr] ?? null) : null);
            $isEther = (stripos($iface, 'ether') !== false);
            $parsed[] = [
                'interface' => $iface,
                'address' => $addr,
                'mac_address' => $mac,
                'identity' => $ident ?: ($plat ?: $mac),
                'platform' => $plat ?: 'Wireless/Network Device',
                'version' => $ver,
                'uptime' => $up,
                'age' => $age,
                'is_ether' => $isEther,
                'suggested_node_type' => $isEther ? 'main_node' : 'sub_node',
                'already_node' => !empty($matchedNode),
                'existing_node_id' => $matchedNode['id'] ?? null,
                'already_asset' => !empty($matchedAsset),
                'existing_asset_id' => $matchedAsset['id'] ?? null
            ];
        }
        return [
            'success' => true,
            'router_ip' => $routerIp,
            'count' => count($parsed),
            'neighbors' => $parsed
        ];
    }

    // ==========================================
    // METHOD: parseRawNeighborsText
    // ==========================================
    public function parseRawNeighborsText($rawText, $routerIp = '') {
        if (empty($routerIp)) {
            $firstRouter = $this->db->query("SELECT nasname FROM nas LIMIT 1")->fetch();
            $routerIp = $firstRouter['nasname'] ?? '10.101.0.25';
        }
        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", trim($rawText)));
        $rawNeighbors = [];
        // Check format: 1. Winbox tab-separated or column copy
        // Format typically: Interface, IP Address, MAC Address, Identity, Platform, Version
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || strpos($line, '---') === 0 || strpos($line, '#') === 0) continue;
            if (stripos($line, 'Interface') !== false && stripos($line, 'MAC') !== false) continue; // header
            // Handle tab-separated (standard copy from WinBox table)
            if (strpos($line, "\t") !== false) {
                $cols = explode("\t", $line);
                if (count($cols) >= 3) {
                    $rawNeighbors[] = [
                        'interface' => trim($cols[0] ?? ''),
                        'address' => trim($cols[1] ?? ''),
                        'mac-address' => trim($cols[2] ?? ''),
                        'identity' => trim($cols[3] ?? ''),
                        'platform' => trim($cols[4] ?? ''),
                        'version' => trim($cols[5] ?? '')
                    ];
                    continue;
                }
            }
            // Handle CLI /ip neighbor print detail format (0 interface=ether12 address=... mac-address=...)
            if (strpos($line, '=') !== false) {
                $parts = preg_split('/\s+/', $line);
                $entry = [];
                foreach ($parts as $p) {
                    if (strpos($p, '=') !== false) {
                        list($k, $v) = explode('=', $p, 2);
                        $entry[trim($k)] = trim($v, '";');
                    }
                }
                if (!empty($entry['interface']) || !empty($entry['mac-address'])) {
                    $rawNeighbors[] = $entry;
                    continue;
                }
            }
            // Handle space-separated tabular format
            $cols = preg_split('/\s{2,}/', $line);
            if (count($cols) >= 3) {
                $rawNeighbors[] = [
                    'interface' => trim($cols[0] ?? ''),
                    'address' => trim($cols[1] ?? ''),
                    'mac-address' => trim($cols[2] ?? ''),
                    'identity' => trim($cols[3] ?? ''),
                    'platform' => trim($cols[4] ?? ''),
                    'version' => trim($cols[5] ?? '')
                ];
            }
        }
        return $this->enrichNeighborsData($routerIp, $rawNeighbors);
    }

    // ==========================================
    // METHOD: importNeighborsBatch
    // ==========================================
    public function importNeighborsBatch($nasId, array $items, array $options = []) {
        $cfg = $this->getRouterConnectionConfig($nasId);
        $routerIp = $cfg['ip'];
        $networkId = (int)$this->getActiveNetworkId();
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        $createNodes = isset($options['create_nodes']) ? !empty($options['create_nodes']) : true;
        $createAssets = isset($options['create_assets']) ? !empty($options['create_assets']) : true;
        $assignedAdminId = !empty($options['assigned_admin_id']) ? (int)$options['assigned_admin_id'] : null;
        $nodesImported = 0;
        $assetsImported = 0;
        $errors = [];
        $createdNodeIds = [];
        $this->db->beginTransaction();
        try {
            foreach ($items as $item) {
                $iface = trim((string)($item['interface'] ?? ''));
                $ident = trim((string)($item['identity'] ?? ''));
                $mac = strtoupper(trim((string)($item['mac_address'] ?? '')));
                $ip = trim((string)($item['address'] ?? ''));
                $plat = trim((string)($item['platform'] ?? ''));
                if (empty($iface)) {
                    $iface = 'default_port';
                }
                if (empty($ident)) {
                    $ident = !empty($plat) ? ($plat . ' (' . substr($mac, -5) . ')') : ('جهاز ' . $iface);
                }
                // Classification rule (User Rule):
                // If interface name contains 'ether' -> Main Node (نقطة أساسية)
                // Otherwise -> Sub-Node (نقطة فرعية)
                $isEther = (stripos($iface, 'ether') !== false);
                $nodeType = $isEther ? 'main_node' : 'sub_node';
                $portKey = $routerIp . '___' . $iface;
                $nodeId = null;
                // 1. Create or Find Port Network Node (The Node IS the Port)
                if ($createNodes) {
                    if (isset($createdNodeIds[$portKey])) {
                        $nodeId = $createdNodeIds[$portKey];
                    } else {
                        // Find existing node for this port on this router
                        $findNode = $this->db->prepare("
                            SELECT id, node_type, parent_id 
                            FROM um_network_nodes 
                            WHERE network_id=? AND nas_ip = ? AND (nas_port_id = ? OR node_name = ?) 
                            ORDER BY id ASC 
                            LIMIT 1
                        ");
                        $findNode->execute([$networkId, $routerIp, $iface, $iface]);
                        $existingNode = $findNode->fetch();
                        if ($existingNode) {
                            $nodeId = (int)$existingNode['id'];
                            $updNode = $this->db->prepare("
                                UPDATE um_network_nodes 
                                SET node_name = ?, nas_port_id = ?, node_type = ?, 
                                    location = COALESCE(NULLIF(location, ''), ?) 
                                WHERE id = ?
                            ");
                            $updNode->execute([$iface, $iface, $nodeType, 'منفذ ' . $iface, $nodeId]);
                        } else {
                            // Sub-node: auto-link to primary main_node on the same router
                            $parentId = null;
                            if ($nodeType === 'sub_node') {
                                $findParent = $this->db->prepare("
                                    SELECT id FROM um_network_nodes 
                                    WHERE network_id=? AND nas_ip = ? AND node_type = 'main_node' 
                                    ORDER BY id ASC 
                                    LIMIT 1
                                ");
                                $findParent->execute([$networkId, $routerIp]);
                                $parentId = $findParent->fetchColumn() ?: null;
                            }
                            $ins = $this->db->prepare("
                                INSERT INTO um_network_nodes 
                                (node_type, parent_id, nas_ip, nas_port_id, node_name, responsible_admin_id, location, notes, is_active, network_id) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                            ");
                            $ins->execute([
                                $nodeType,
                                $parentId,
                                $routerIp,
                                $iface,
                                $iface,
                                $assignedAdminId,
                                'منفذ ' . $iface,
                                $isEther ? 'نقطة أساسية (منفذ ether)' : 'نقطة فرعية (منفذ لاسلكي/افتراضي)',
                                $networkId
                            ]);
                            $nodeId = (int)$this->db->lastInsertId();
                            $nodesImported++;
                        }
                        // Ensure cost center exists for this port node
                        $findCc = $this->db->prepare("SELECT id FROM um_cost_centers WHERE ref_id = ? AND center_type = 'tower_node' LIMIT 1");
                        $findCc->execute([$nodeId]);
                        if (!$findCc->fetchColumn()) {
                            $ccCode = 'CC-PORT-' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $iface) . '-' . $nodeId;
                            $ccName = ($isEther ? 'منفذ رئيسي: ' : 'منفذ فرعي: ') . $iface;
                            $insCc = $this->db->prepare("INSERT INTO um_cost_centers (center_code, name, center_type, ref_id, is_active) VALUES (?, ?, 'tower_node', ?, 1)");
                            $insCc->execute([$ccCode, $ccName, $nodeId]);
                        }
                        $createdNodeIds[$portKey] = $nodeId;
                    }
                } else {
                    if (isset($createdNodeIds[$portKey])) {
                        $nodeId = $createdNodeIds[$portKey];
                    } else {
                        $findNode = $this->db->prepare("
                            SELECT id FROM um_network_nodes 
                            WHERE network_id=? AND nas_ip = ? AND (nas_port_id = ? OR node_name = ?) 
                            LIMIT 1
                        ");
                        $findNode->execute([$networkId, $routerIp, $iface, $iface]);
                        $nodeId = $findNode->fetchColumn() ?: null;
                        if ($nodeId) $createdNodeIds[$portKey] = (int)$nodeId;
                    }
                }
                // 2. Create or Update Asset / Equipment
                // All devices on this port gather under $nodeId!
                if ($createAssets) {
                    $cat = 'antennas_dishes';
                    $platUpper = strtoupper($plat);
                    if (strpos($platUpper, 'ROUTERBOARD') !== false || strpos($platUpper, 'CCR') !== false || strpos($platUpper, 'RB') !== false) {
                        $cat = 'routers';
                    } elseif (strpos($platUpper, 'POWERBEAM') !== false || strpos($platUpper, 'LITEBEAM') !== false || strpos($platUpper, 'NANO') !== false || strpos($platUpper, 'ROCKET') !== false) {
                        $cat = 'antennas_dishes';
                    }
                    $assetName = $ident . ' - ' . ($plat ?: 'جهاز لاسلكي');
                    $findAsset = null;
                    if (!empty($mac)) {
                        $chk = $this->db->prepare("SELECT id FROM um_assets WHERE network_id=? AND (serial_number = ? OR mac_address = ?) LIMIT 1");
                        $chk->execute([$networkId, $mac, $mac]);
                        $findAsset = $chk->fetchColumn();
                    }
                    if (!$findAsset && !empty($ip)) {
                        $chkIp = $this->db->prepare("SELECT id FROM um_assets WHERE network_id=? AND ip_address = ? LIMIT 1");
                        $chkIp->execute([$networkId, $ip]);
                        $findAsset = $chkIp->fetchColumn();
                    }
                    if ($findAsset) {
                        $upd = $this->db->prepare("
                            UPDATE um_assets 
                            SET node_id = COALESCE(?, node_id), 
                                nas_ip = ?, 
                                nas_port_id = ?, 
                                ip_address = ?, 
                                mac_address = ?, 
                                platform = ?, 
                                version = COALESCE(NULLIF(?, ''), version), 
                                model = COALESCE(NULLIF(model, ''), ?), 
                                last_seen = NOW(), 
                                status = 'in_service' 
                            WHERE id = ? AND network_id = ?
                        ");
                        $upd->execute([$nodeId, $routerIp, $iface, $ip, $mac, $plat, trim((string)($item['version'] ?? '')), $plat, (int)$findAsset, $networkId]);
                    } else {
                        $assetCode = 'AST-' . strtoupper(substr(md5($mac . $ident . time()), 0, 8));
                        $insA = $this->db->prepare("
                            INSERT INTO um_assets 
                            (asset_code, name, category, model, serial_number, purchase_cost, current_value, location, status, node_id, nas_ip, nas_port_id, assigned_to_user_id, ip_address, mac_address, platform, version, last_seen, network_id, source_type, notes) 
                            VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'in_service', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'router_discovery', ?)
                        ");
                        $insA->execute([
                            $assetCode, $assetName, $cat, $plat, $mac, 'منفذ ' . $iface,
                            $nodeId, $routerIp, $iface, $assignedAdminId,
                            $ip, $mac, $plat, trim((string)($item['version'] ?? '')), $networkId, 'مستورد آلياً عبر فحص جيران الميكروتك'
                        ]);
                    }
                    $assetsImported++;
                }
            }
            $this->db->commit();
            return [
                'success' => true,
                'imported_nodes' => $nodesImported,
                'imported_assets' => $assetsImported,
                'total_processed' => count($items),
                'message' => "تم بنجاح استيراد وتحديث الأجهزة وربطها بنقاط المنافذ ($nodesImported نقطة و $assetsImported جهاز)!"
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['success' => false, 'error' => 'فشلت عملية الاستيراد: ' . $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: pingRouterDevice
    // ==========================================
    public function pingRouterDevice($nasId, $targetIp) {
        require_once __DIR__ . '/RouterOSApi.php';
        $cfg = $this->getRouterConnectionConfig($nasId);
        $api = new RouterOSApi();
        $api->timeout = 5;
        $connected = $api->connect($cfg['ip'], $cfg['user'], $cfg['pass'], $cfg['port'], $cfg['ssl']);
        if (!$connected) {
            return ['success' => false, 'error' => 'تعذر الاتصال بـ API الراوتر لإجراء اختبار الـ Ping'];
        }
        $res = $api->comm('/ping', [
            'address' => trim($targetIp),
            'count' => '3'
        ]);
        $api->disconnect();
        if (!is_array($res) || empty($res)) {
            return ['success' => false, 'error' => 'لم يستجب الجهاز المستهدف لاختبار Ping من الراوتر'];
        }
        $received = 0;
        $totalTime = 0;
        $times = [];
        foreach ($res as $r) {
            if (isset($r['received']) && (int)$r['received'] > 0) $received++;
            elseif (isset($r['time'])) {
                $received++;
                $ms = (float)str_replace('ms', '', $r['time']);
                $times[] = $ms;
                $totalTime += $ms;
            }
        }
        $avgMs = !empty($times) ? round(array_sum($times) / count($times), 1) : null;
        $minMs = !empty($times) ? min($times) : null;
        $maxMs = !empty($times) ? max($times) : null;
        return [
            'success' => true,
            'target_ip' => $targetIp,
            'router_ip' => $cfg['ip'],
            'packets_sent' => 3,
            'packets_received' => $received,
            'packet_loss' => round((1 - ($received / 3)) * 100) . '%',
            'avg_ms' => $avgMs,
            'min_ms' => $minMs,
            'max_ms' => $maxMs,
            'raw' => $res
        ];
    }
    // ==========================================
    // MIKROTIK ROUTER CONTROL SUITE & HOTSPOT MANAGER
    // ==========================================

    // ==========================================
    // METHOD: getAssets
    // ==========================================
    public function getAssets($category = '', $status = '', $search = '', $nodeId = 0, $userId = 0, $networkId = 0) {
        $activeNetworkId = 0;
        try {
            $activeNetworkId = (int)$this->getActiveNetworkId();
        } catch (Throwable $e) {
            $activeNetworkId = 0;
        }
        $requestedNetworkId = (int)$networkId;
        if ($requestedNetworkId > 0) {
            $networkId = $requestedNetworkId;
        } else {
            $networkId = $activeNetworkId;
        }

        $where = [];
        $params = [];
        if ($networkId > 0) {
            $where[] = "(a.network_id = :netid OR a.network_id IS NULL OR a.network_id = 0)";
            $params[':netid'] = $networkId;
        }
        if (!empty($category)) {
            $where[] = "a.category = :cat";
            $params[':cat'] = $category;
        }
        if (!empty($status)) {
            $where[] = "a.status = :stat";
            $params[':stat'] = $status;
        }
        if (!empty($nodeId)) {
            $where[] = "a.node_id = :nid";
            $params[':nid'] = (int)$nodeId;
        }
        if (!empty($userId)) {
            $where[] = "a.assigned_to_user_id = :uid";
            $params[':uid'] = (int)$userId;
        }
        if (!empty($search)) {
            $where[] = "(a.name LIKE :s1 OR a.asset_code LIKE :s2 OR a.location LIKE :s3 OR a.serial_number LIKE :s4 OR a.mac_address LIKE :s5 OR a.ip_address LIKE :s6 OR adm.fullname LIKE :s7 OR n.node_name LIKE :s8)";
            $term = "%$search%";
            $params[':s1'] = $term;
            $params[':s2'] = $term;
            $params[':s3'] = $term;
            $params[':s4'] = $term;
            $params[':s5'] = $term;
            $params[':s6'] = $term;
            $params[':s7'] = $term;
            $params[':s8'] = $term;
        }
        $whereClause = implode(' AND ', $where);
        $sql = "
            SELECT a.*, 
                   net.name AS network_name,
                   n.node_name, 
                   n.node_type, 
                   n.nas_ip AS node_nas_ip, 
                   n.nas_port_id AS node_nas_port,
                   adm.fullname AS custodian_fullname,
                   COALESCE(adm.fullname, a.responsible_person) AS responsible_display,
                   adm.phone AS custodian_phone,
                   adm.role AS custodian_role,
                   adm.username AS custodian_username,
                   r.role_name_ar AS custodian_role_ar
            FROM um_assets a
            LEFT JOIN um_networks net ON a.network_id = net.id
            LEFT JOIN um_network_nodes n ON a.node_id = n.id
            LEFT JOIN um_admins adm ON a.assigned_to_user_id = adm.id
            LEFT JOIN um_roles_def r ON adm.role = r.role_key
            WHERE $whereClause
            ORDER BY a.id DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $assets = $stmt->fetchAll();
        $totalCost = 0;
        $currentVal = 0;
        $inService = 0;
        $maintenance = 0;
        $inStock = 0;
        $damaged = 0;
        $retired = 0;
        $catGroups = [];
        $nodeGroups = [];
        $statusGroups = [];
        $custodianGroups = [];
        foreach ($assets as $a) {
            $cost = (float)$a['purchase_cost'];
            $val = (float)$a['current_value'];
            $totalCost += $cost;
            $currentVal += $val;
            $st = $a['status'] ?: 'in_service';
            if ($st === 'in_service') $inService++;
            elseif ($st === 'maintenance') $maintenance++;
            elseif ($st === 'in_stock') $inStock++;
            elseif ($st === 'damaged') $damaged++;
            elseif ($st === 'retired') $retired++;
            // 1. By Category
            $catKey = $a['category'] ?: 'other';
            if (!isset($catGroups[$catKey])) {
                $catGroups[$catKey] = [
                    'category' => $catKey,
                    'count' => 0,
                    'total_cost' => 0,
                    'total_val' => 0,
                    'devices' => []
                ];
            }
            $catGroups[$catKey]['count']++;
            $catGroups[$catKey]['total_cost'] += $cost;
            $catGroups[$catKey]['total_val'] += $val;
            $catGroups[$catKey]['devices'][] = $a;
            // 2. By Node
            $nodeKey = $a['node_id'] ? (int)$a['node_id'] : 0;
            $nodeName = $a['node_name'] ?: ($nodeKey ? "نقطة #$nodeKey" : 'بدون نقطة محددة');
            if (!isset($nodeGroups[$nodeKey])) {
                $nodeGroups[$nodeKey] = [
                    'node_id' => $nodeKey,
                    'node_name' => $nodeName,
                    'node_type' => $a['node_type'] ?? '',
                    'count' => 0,
                    'total_cost' => 0,
                    'total_val' => 0,
                    'devices' => []
                ];
            }
            $nodeGroups[$nodeKey]['count']++;
            $nodeGroups[$nodeKey]['total_cost'] += $cost;
            $nodeGroups[$nodeKey]['total_val'] += $val;
            $nodeGroups[$nodeKey]['devices'][] = $a;
            // 3. By Status
            if (!isset($statusGroups[$st])) {
                $statusGroups[$st] = [
                    'status' => $st,
                    'count' => 0,
                    'total_cost' => 0,
                    'total_val' => 0,
                    'devices' => []
                ];
            }
            $statusGroups[$st]['count']++;
            $statusGroups[$st]['total_cost'] += $cost;
            $statusGroups[$st]['total_val'] += $val;
            $statusGroups[$st]['devices'][] = $a;
            // 4. By Custodian
            $custKey = $a['assigned_to_user_id'] ? (int)$a['assigned_to_user_id'] : 0;
            $custName = $a['custodian_fullname'] ?: ($a['responsible_person'] ?: 'المخزن العام / بدون مستلم');
            if (!isset($custodianGroups[$custKey])) {
                $custodianGroups[$custKey] = [
                    'assigned_to_user_id' => $custKey,
                    'custodian_name' => $custName,
                    'custodian_phone' => $a['custodian_phone'] ?? '',
                    'custodian_role' => $a['custodian_role_ar'] ?? ($a['custodian_role'] ?? ''),
                    'count' => 0,
                    'total_cost' => 0,
                    'total_val' => 0,
                    'devices' => []
                ];
            }
            $custodianGroups[$custKey]['count']++;
            $custodianGroups[$custKey]['total_cost'] += $cost;
            $custodianGroups[$custKey]['total_val'] += $val;
            $custodianGroups[$custKey]['devices'][] = $a;
        }
        uasort($catGroups, fn($x, $y) => $y['count'] <=> $x['count']);
        uasort($nodeGroups, fn($x, $y) => $y['count'] <=> $x['count']);
        uasort($statusGroups, fn($x, $y) => $y['count'] <=> $x['count']);
        uasort($custodianGroups, fn($x, $y) => $y['count'] <=> $x['count']);
        return [
            'total_assets_cost' => $totalCost,
            'total_current_valuation' => $currentVal,
            'count' => count($assets),
            'summary' => [
                'total_count' => count($assets),
                'total_cost' => $totalCost,
                'total_valuation' => $currentVal,
                'in_service_count' => $inService,
                'maintenance_count' => $maintenance,
                'in_stock_count' => $inStock,
                'damaged_count' => $damaged,
                'retired_count' => $retired
            ],
            'grouped_by_category' => array_values($catGroups),
            'grouped_by_node' => array_values($nodeGroups),
            'grouped_by_status' => array_values($statusGroups),
            'grouped_by_custodian' => array_values($custodianGroups),
            'data' => $assets
        ];
    }

    // ==========================================
    // METHOD: getAssetById
    // ==========================================
    public function getAssetById($id) {
        $networkId = (int)$this->getActiveNetworkId();
        $sql = "
            SELECT a.*, 
                   net.name AS network_name,
                   n.node_name, 
                   n.node_type, 
                   n.nas_ip AS node_nas_ip, 
                   n.nas_port_id AS node_nas_port,
                   adm.fullname AS custodian_fullname,
                   COALESCE(adm.fullname, a.responsible_person) AS responsible_display,
                   adm.phone AS custodian_phone,
                   adm.role AS custodian_role,
                   adm.username AS custodian_username,
                   r.role_name_ar AS custodian_role_ar
            FROM um_assets a
            LEFT JOIN um_networks net ON a.network_id = net.id
            LEFT JOIN um_network_nodes n ON a.node_id = n.id
            LEFT JOIN um_admins adm ON a.assigned_to_user_id = adm.id
            LEFT JOIN um_roles_def r ON adm.role = r.role_key
            WHERE a.id = ? AND (a.network_id = ? OR a.network_id IS NULL OR a.network_id = 0)
            LIMIT 1
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([(int)$id, $networkId]);
        return $stmt->fetch() ?: null;
    }

    // ==========================================
    // METHOD: saveAsset
    // ==========================================
    public function saveAsset($data, string $creationSourceType = 'manual') {
        $activeNetworkId = (int)$this->getActiveNetworkId();
        $requestedNetworkId = (int)($data['network_id'] ?? 0);
        if ($requestedNetworkId > 0 && $requestedNetworkId !== $activeNetworkId) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        $networkId = $activeNetworkId;
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        // The caller selects the creation path; a browser field cannot claim
        // that a manually entered asset came from discovery or an invoice.
        if (!in_array($creationSourceType, ['router_discovery','manual','purchase_invoice','file_import'], true)) {
            throw new InvalidArgumentException('INVALID_ASSET_SOURCE');
        }
        $sourceType = $creationSourceType;
        $purchaseCost = (float)($data['purchase_cost'] ?? 0);
        $currentVal = (float)($data['current_value'] ?? $purchaseCost);

        if (!empty($data['id'])) {
            $priceCheck = $this->db->prepare('SELECT purchase_cost, current_value, cost_locked, purchase_invoice_id, source_type FROM um_assets WHERE id = ? AND network_id = ?');
            $priceCheck->execute([(int)$data['id'], $networkId]);
            $oldPrice = $priceCheck->fetch(PDO::FETCH_ASSOC);
            if (!$oldPrice) {
                throw new DomainException('FORBIDDEN_NETWORK');
            }
            if ($oldPrice) {
                // Settle price: cannot be modified after addition
                $purchaseCost = (float)$oldPrice['purchase_cost'];
                $currentVal = (float)$oldPrice['current_value'];
                // Editing or importing over an existing asset does not rewrite
                // its provenance.  Invoice/discovery paths own their own writes.
                $sourceType = trim((string)($oldPrice['source_type'] ?? '')) ?: 'manual';
            }
        }
        $name = trim($data['name'] ?? '');
        if (empty($name)) throw new Exception('اسم الأصل / الجهاز مطلوب');
        $code = trim($data['asset_code'] ?? '');
        if (empty($code)) {
            $code = 'AST-' . strtoupper(substr($data['category'] ?? 'EQP', 0, 3)) . '-' . rand(1000, 9999);
        }
        $nodeId = !empty($data['node_id']) ? (int)$data['node_id'] : null;
        $assignedUserId = !empty($data['assigned_to_user_id']) ? (int)$data['assigned_to_user_id'] : null;
        $handoverDate = !empty($data['handover_date']) ? $data['handover_date'] : null;
        $nasIp = trim($data['nas_ip'] ?? '');
        $nasPortId = trim($data['nas_port_id'] ?? '');
        // Auto derive nas_ip and nas_port_id from network node if node_id given
        if ($nodeId > 0) {
            $nodeStmt = $this->db->prepare("SELECT nas_ip, nas_port_id FROM um_network_nodes WHERE id = ? AND network_id = ?");
            $nodeStmt->execute([$nodeId, $networkId]);
            $nodeRow = $nodeStmt->fetch();
            if (!$nodeRow) throw new DomainException('FORBIDDEN_NETWORK_NODE');
            if (empty($nasIp)) $nasIp = $nodeRow['nas_ip'];
            if (empty($nasPortId)) $nasPortId = $nodeRow['nas_port_id'];
        }
        $respPerson = trim($data['responsible_person'] ?? '');
        if ($assignedUserId > 0 && empty($respPerson)) {
            $uStmt = $this->db->prepare("SELECT fullname FROM um_admins WHERE id = ?");
            $uStmt->execute([$assignedUserId]);
            $respPerson = $uStmt->fetchColumn() ?: '';
        }
        $mac = strtoupper(trim($data['mac_address'] ?? ($data['mac'] ?? '')));
        $ip = trim($data['ip_address'] ?? ($data['ip'] ?? ''));
        $platform = trim($data['platform'] ?? '');
        $version = trim($data['version'] ?? '');
        $model = trim($data['model'] ?? '');
        $params = [
            ':code' => $code,
            ':name' => $name,
            ':category' => $data['category'] ?? 'routers',
            ':model' => $model,
            ':serial_number' => trim($data['serial_number'] ?? ''),
            ':mac_address' => $mac ?: null,
            ':ip_address' => $ip ?: null,
            ':platform' => $platform ?: null,
            ':version' => $version ?: null,
            ':purchase_date' => !empty($data['purchase_date']) ? $data['purchase_date'] : null,
            ':purchase_cost' => $purchaseCost,
            ':current_value' => $currentVal,
            ':location' => trim($data['location'] ?? ''),
            ':status' => in_array($data['status'] ?? '', ['in_service', 'maintenance', 'in_stock', 'damaged', 'retired']) ? $data['status'] : 'in_service',
            ':responsible_person' => $respPerson,
            ':notes' => trim($data['notes'] ?? ''),
            ':node_id' => $nodeId,
            ':nas_ip' => $nasIp ?: null,
            ':nas_port_id' => $nasPortId ?: null,
            ':assigned_to_user_id' => $assignedUserId,
            ':handover_date' => $handoverDate,
            ':network_id' => $networkId,
            ':source_type' => $sourceType
        ];
        if (!empty($data['id'])) {
            $params[':id'] = (int)$data['id'];
            $params[':scope_network_id'] = $networkId;
            $sql = "UPDATE um_assets 
                    SET asset_code=:code, name=:name, category=:category, model=:model, serial_number=:serial_number, 
                        mac_address=:mac_address, ip_address=:ip_address, platform=:platform, version=:version,
                        purchase_date=:purchase_date, purchase_cost=:purchase_cost, current_value=:current_value, 
                        location=:location, status=:status, responsible_person=:responsible_person, notes=:notes,
                        node_id=:node_id, nas_ip=:nas_ip, nas_port_id=:nas_port_id, 
                        assigned_to_user_id=:assigned_to_user_id, handover_date=:handover_date, network_id=:network_id, source_type=:source_type 
                    WHERE id=:id AND network_id=:scope_network_id";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return ['success' => true, 'id' => (int)$data['id']];
        } else {
            $sql = "INSERT INTO um_assets (asset_code, name, category, model, serial_number, mac_address, ip_address, platform, version, purchase_date, purchase_cost, current_value, location, status, responsible_person, notes, node_id, nas_ip, nas_port_id, assigned_to_user_id, handover_date, network_id, source_type)
                    VALUES (:code, :name, :category, :model, :serial_number, :mac_address, :ip_address, :platform, :version, :purchase_date, :purchase_cost, :current_value, :location, :status, :responsible_person, :notes, :node_id, :nas_ip, :nas_port_id, :assigned_to_user_id, :handover_date, :network_id, :source_type)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            return ['success' => true, 'id' => (int)$this->db->lastInsertId()];
        }
    }

    // ==========================================
    // METHOD: deleteAsset
    // ==========================================
    public function deleteAsset($id) {
        $networkId = (int)$this->getActiveNetworkId();
        $stmt = $this->db->prepare("DELETE FROM um_assets WHERE id = ? AND (network_id = ? OR network_id IS NULL OR network_id = 0)");
        $stmt->execute([(int)$id, $networkId]);
        return ['success' => true];
    }
    // ==========================================
    // FINANCIAL REPORTS & P&L (تقارير الأرباح والخسائر)
    // ==========================================

    // ==========================================
    // METHOD: batchUpdateAssetPrices
    // ==========================================
    public function batchUpdateAssetPrices($updates) {
        if (!is_array($updates) || empty($updates)) {
            return ['success' => false, 'error' => 'لا توجد بيانات أصناف لتحديثها'];
        }
        $networkId = (int)$this->getActiveNetworkId();
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        // Validate all target scopes before performing any writes.
        foreach ($updates as $item) {
            if (!is_array($item) || (int)($item['id'] ?? $item['asset_id'] ?? 0) <= 0) throw new InvalidArgumentException('INVALID_ASSET');
            if (array_key_exists('network_id', $item) && (int)$item['network_id'] !== $networkId) throw new DomainException('FORBIDDEN_NETWORK');
        }
        $needTx = !$this->db->inTransaction();
        if ($needTx) $this->db->beginTransaction();
        try {
            $check = $this->db->prepare('SELECT purchase_cost,current_value FROM um_assets WHERE id=? AND network_id=? FOR UPDATE');
            $stmt = $this->db->prepare('UPDATE um_assets SET purchase_cost=?,current_value=? WHERE id=? AND network_id=?');
            $updatedCount = 0;
            foreach ($updates as $item) {
                $id = (int)($item['id'] ?? $item['asset_id']);
                $check->execute([$id,$networkId]);
                $old = $check->fetch(PDO::FETCH_ASSOC);
                if (!$old) throw new DomainException('FORBIDDEN_NETWORK');
                $cost = array_key_exists('purchase_cost',$item) ? $item['purchase_cost'] : $old['purchase_cost'];
                $val = array_key_exists('current_value',$item) ? $item['current_value'] : $old['current_value'];
                if (!is_numeric($cost) || !is_numeric($val) || !is_finite((float)$cost) || !is_finite((float)$val) || (float)$cost < 0 || (float)$val < 0) throw new InvalidArgumentException('INVALID_ASSET_PRICE');
                $stmt->execute([(float)$cost,(float)$val,$id,$networkId]);
                $updatedCount++;
            }
            if ($needTx) $this->db->commit();
            return ['success'=>true,'message'=>"تم تحديث أسعار {$updatedCount} أصل / صنف بنجاح",'updated_count'=>$updatedCount];
        } catch (Throwable $e) {
            if ($needTx && $this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    public function getAssetOutages($assetId) {
        $asset = $this->getAssetById($assetId);
        if (!$asset) {
            return ['error' => 'الأصل غير موجود'];
        }
        $stmt = $this->db->prepare("
            SELECT * FROM um_asset_outage_logs 
            WHERE asset_id = ? 
            ORDER BY id DESC 
            LIMIT 100
        ");
        $stmt->execute([(int)$assetId]);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return [
            'success' => true,
            'asset' => $asset,
            'outages' => $logs
        ];
    }

    // ==========================================
    // METHOD: exportAssets
    // ==========================================
    public function exportAssets($category = '', $status = '') {
        $networkId = (int)$this->getActiveNetworkId();
        $where = ['(network_id = ? OR network_id IS NULL OR network_id = 0)']; 
        $params = [$networkId];
        if (!empty($category)) { $where[] = 'category = ?'; $params[] = $category; }
        if (!empty($status)) { $where[] = 'status = ?'; $params[] = $status; }
        $sql = "SELECT asset_code, name, category, model, serial_number, purchase_date, purchase_cost, current_value, location, status, responsible_person, notes FROM um_assets WHERE " . implode(' AND ', $where) . " ORDER BY category, name";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: importAssets
    // ==========================================
    public function importAssets($rows, $overwriteExisting = false) {
        if (empty($rows) || !is_array($rows)) throw new Exception('لا توجد بيانات أصول صالحة للاستيراد');
        $inserted = 0; $updated = 0; $skipped = 0; $errors = [];
        foreach ($rows as $i => $r) {
            $name = trim($r['name'] ?? '');
            if (empty($name)) { $skipped++; continue; }
            try {
                $code = trim($r['asset_code'] ?? '');
                $existingRow = null;
                if (!empty($code)) {
                    $ex = $this->db->prepare("SELECT id FROM um_assets WHERE network_id = ? AND asset_code = ?");
                    $ex->execute([(int)$this->getActiveNetworkId(), $code]);
                    $existingRow = $ex->fetch();
                }
                if ($existingRow && !$overwriteExisting) { $skipped++; continue; }
                if ($existingRow) { $r['id'] = $existingRow['id']; }
                else { unset($r['id']); }
                $r['network_id'] = (int)$this->getActiveNetworkId();
                $this->saveAsset($r, 'file_import');
                if ($existingRow) $updated++;
                else $inserted++;
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
            'message' => "تمت المعالجة: {$inserted} أصل جديد، {$updated} تم تحديثه، {$skipped} تم تخطيه"
        ];
    }
    // ==========================================
    // 1. RBAC & ROLES MANAGEMENT
    // ==========================================
    // ==========================================
    // DATA SCOPING & AUDIT TRAIL HELPERS
    // ==========================================

    // ==========================================
    // METHOD: getNetworks
    // ==========================================
    public function getNetworks($status = 'all', $networkId = 0) {
        $conditions = [];
        if ($status !== 'all') $conditions[] = "n.status = " . $this->db->quote($status);
        // Accept either one network id or an explicit allow-list. The latter
        // is used by non-owner callers so this legacy listing cannot disclose
        // network metadata outside their authenticated memberships.
        $networkIds = is_array($networkId)
            ? array_values(array_unique(array_filter(array_map('intval', $networkId), static fn($id) => $id > 0)))
            : (((int)$networkId > 0) ? [(int)$networkId] : []);
        if ($networkIds) $conditions[] = "n.id IN (" . implode(',', $networkIds) . ")";
        $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';
        $sql = "
            SELECT n.*,
                COALESCE(np.partner_count, 0)                 AS partner_count,
                COALESCE(a.asset_count, 0)                    AS asset_count,
                COALESCE(a.total_assets_cost, 0)             AS total_assets_cost,
                COALESCE(a.total_assets_value, 0)            AS total_assets_value,
                COALESCE(np.total_capital_contrib, 0)        AS total_capital_contrib
            FROM um_networks n
            LEFT JOIN (
                SELECT np.network_id, COUNT(*) AS partner_count,
                       SUM(np.capital_contrib) AS total_capital_contrib
                FROM um_network_partners np JOIN um_partners_equity pe ON pe.id=np.partner_id AND pe.network_id=np.network_id GROUP BY np.network_id
            ) np ON np.network_id = n.id
            LEFT JOIN (
                SELECT network_id, COUNT(*) AS asset_count,
                       SUM(purchase_cost) AS total_assets_cost,
                       SUM(current_value) AS total_assets_value
                FROM um_assets GROUP BY network_id
            ) a ON a.network_id = n.id
            $where
            ORDER BY n.created_at DESC
        ";
        $networks = $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        $managerStmt = $this->db->prepare("SELECT a.id,a.fullname,a.username
            FROM um_admin_network_access x
            JOIN um_admin_network_roles r ON r.admin_id=x.admin_id AND r.network_id=x.network_id AND r.is_active=1 AND r.role_key='superadmin'
            JOIN um_admins a ON a.id=x.admin_id AND a.is_active=1
            WHERE x.network_id=? AND x.is_active=1
            ORDER BY x.is_default DESC,a.id ASC LIMIT 1");
        foreach ($networks as &$net) {
            $net['partners'] = $this->getNetworkPartners($net['id']);
            $managerStmt->execute([(int)$net['id']]);
            $manager = $managerStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            $net['network_manager_id'] = $manager ? (int)$manager['id'] : null;
            $net['network_manager_name'] = $manager['fullname'] ?? null;
            $net['network_manager_username'] = $manager['username'] ?? null;
        }
        return ['success' => true, 'networks' => $networks];
    }
    /** جلب شركاء شبكة معينة مع حصصهم المحسوبة */

    // ==========================================
    // METHOD: saveNetwork
    // ==========================================
    public function saveNetwork($data, $currentAdminId = 1) {
        $id   = (int)($data['id'] ?? 0);
        $code = trim((string)($data['code'] ?? ''));
        $name = trim((string)($data['name'] ?? ''));
        $managerAdminId = (int)($data['manager_admin_id'] ?? 0);
        $isCreate = $id <= 0;
        if (empty($name)) throw new Exception('اسم الشبكة مطلوب');
        if ($isCreate && $managerAdminId <= 0) {
            throw new DomainException('NETWORK_MANAGER_REQUIRED');
        }
        // Auto-generate unique collision-free code if missing
        if (empty($code)) {
            $code = function_exists('samGenerateUniqueNetworkCode') 
                ? samGenerateUniqueNetworkCode($this->db) 
                : ('NET-' . str_pad((string)((int)$this->db->query("SELECT MAX(id) FROM um_networks")->fetchColumn() + 1), 3, '0', STR_PAD_LEFT));
        }
        $founded = !empty($data['founded_date']) ? $data['founded_date'] : null;
        $loc     = trim((string)($data['location']    ?? ''));
        $desc    = trim((string)($data['description'] ?? ''));
        $notes   = trim((string)($data['notes']       ?? ''));
        $status  = in_array($data['status'] ?? '', ['active','dissolved','merged']) ? $data['status'] : 'active';
        $logoUrl = trim((string)($data['logo_url'] ?? ''));
        $authMode = in_array($data['auth_mode'] ?? '', ['username_only', 'same', 'different'], true) ? $data['auth_mode'] : 'different';
        $hotspotTitle = trim((string)($data['hotspot_title'] ?? ''));
        $themeColor = trim((string)($data['theme_color'] ?? '#0284c7'));
        $ownerId = (int)$this->db->query("SELECT MIN(admin_id) FROM um_system_owners")->fetchColumn();
        if ($ownerId <= 0) throw new DomainException('SYSTEM_OWNER_REQUIRED');
        if ($managerAdminId > 0) {
            $managerCheck = $this->db->prepare("SELECT id,is_active FROM um_admins WHERE id=? LIMIT 1");
            $managerCheck->execute([$managerAdminId]);
            $managerRow = $managerCheck->fetch(PDO::FETCH_ASSOC);
            if (!$managerRow || !(int)$managerRow['is_active']) throw new DomainException('NETWORK_MANAGER_NOT_FOUND');
            if ($managerAdminId === $ownerId) throw new DomainException('NETWORK_MANAGER_CANNOT_BE_SYSTEM_OWNER');
        }
        $this->db->beginTransaction();
        try {
            if ($isCreate) {
                $this->db->prepare("INSERT INTO um_networks (code,name,logo_url,auth_mode,hotspot_title,theme_color,description,founded_date,location,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
                         ->execute([$code, $name, $logoUrl ?: null, $authMode, $hotspotTitle ?: null, $themeColor, $desc ?: null, $founded, $loc ?: null, $status, $notes ?: null, $currentAdminId]);
                $id = (int)$this->db->lastInsertId();
            } else {
                $this->db->prepare("UPDATE um_networks SET code=?, name=?, logo_url=?, auth_mode=?, hotspot_title=?, theme_color=?, description=?, founded_date=?, location=?, status=?, notes=? WHERE id=?")
                         ->execute([$code, $name, $logoUrl ?: null, $authMode, $hotspotTitle ?: null, $themeColor, $desc ?: null, $founded, $loc ?: null, $status, $notes ?: null, $id]);
                if (!$id || !$this->db->query("SELECT COUNT(*) FROM um_networks WHERE id=" . (int)$id)->fetchColumn()) throw new DomainException('NETWORK_NOT_FOUND');
            }

            // The system owner is always an explicit member of every network.
            $ownerDefault = (int)$this->db->query("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=" . $ownerId . " AND is_active=1 AND is_default=1")->fetchColumn() ? 0 : 1;
            $ownerAccess = $this->db->prepare("INSERT INTO um_admin_network_access(admin_id,network_id,access_level,is_default,is_active,granted_by_admin_id) VALUES(?,?, 'owner', ?,1,?) ON DUPLICATE KEY UPDATE access_level='owner',is_default=VALUES(is_default),is_active=1,granted_by_admin_id=VALUES(granted_by_admin_id)");
            $ownerAccess->execute([$ownerId,$id,$ownerDefault,(int)$currentAdminId]);
            $ownerRole = $this->db->prepare("INSERT INTO um_admin_network_roles(admin_id,network_id,role_key,data_scope,is_active,assigned_by_admin_id) VALUES(?,?, 'system_owner','all',1,?) ON DUPLICATE KEY UPDATE role_key='system_owner',data_scope='all',is_active=1,assigned_by_admin_id=VALUES(assigned_by_admin_id)");
            $ownerRole->execute([$ownerId,$id,(int)$currentAdminId]);
            $ownerBalance = $this->db->prepare("INSERT INTO um_admin_network_balances(admin_id,network_id,balance,credit_limit,currency_code) VALUES(?,?,0,0,'YER_SANAA') ON DUPLICATE KEY UPDATE network_id=VALUES(network_id)");
            $ownerBalance->execute([$ownerId,$id]);

            // A new network must have one network manager. On edit, supplying
            // another user retires the previous network-specific superadmin role
            // without deleting that user's account or global role.
            if ($managerAdminId > 0) {
                $this->db->prepare("UPDATE um_admin_network_roles
                    SET is_active=0
                    WHERE network_id=? AND role_key='superadmin' AND admin_id<>?")->execute([$id, $managerAdminId]);
                $managerDefault = (int)$this->db->query("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id=" . $managerAdminId . " AND is_active=1 AND is_default=1")->fetchColumn() ? 0 : 1;
                $managerAccess = $this->db->prepare("INSERT INTO um_admin_network_access(admin_id,network_id,access_level,is_default,is_active,granted_by_admin_id) VALUES(?,?, 'manager', ?,1,?) ON DUPLICATE KEY UPDATE access_level='manager',is_default=VALUES(is_default),is_active=1,granted_by_admin_id=VALUES(granted_by_admin_id)");
                $managerAccess->execute([$managerAdminId,$id,$managerDefault,(int)$currentAdminId]);
                $managerRole = $this->db->prepare("INSERT INTO um_admin_network_roles(admin_id,network_id,role_key,data_scope,is_active,assigned_by_admin_id) VALUES(?,?, 'superadmin','all',1,?) ON DUPLICATE KEY UPDATE role_key='superadmin',data_scope='all',is_active=1,assigned_by_admin_id=VALUES(assigned_by_admin_id)");
                $managerRole->execute([$managerAdminId,$id,(int)$currentAdminId]);
                $managerBalance = $this->db->prepare("INSERT INTO um_admin_network_balances(admin_id,network_id,balance,credit_limit,currency_code) VALUES(?,?,0,0,'YER_SANAA') ON DUPLICATE KEY UPDATE network_id=VALUES(network_id)");
                $managerBalance->execute([$managerAdminId,$id]);
            }

            if ($isCreate) {
                try {
                    require_once __DIR__ . '/NetworkSubscriptionService.php';
                    (new NetworkSubscriptionService($this->db))->getEffectiveSubscription($id);
                } catch (Throwable $e) {}
            }
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return ['success' => true, 'id' => $id, 'network_id' => $id, 'manager_admin_id' => $managerAdminId ?: null, 'system_owner_id' => $ownerId, 'message' => $isCreate ? 'تم إنشاء الشبكة وإضافة مالك النظام ومدير الشبكة بنجاح' : 'تم حفظ بيانات الشبكة وتحديث عضوية المالك ومدير الشبكة'];
    }
    /** حذف شبكة */

    // ==========================================
    // METHOD: deleteNetwork
    // ==========================================
    public function deleteNetwork($id) {
        $id = (int)$id;
        $assetCount = (int)$this->db->query("SELECT COUNT(*) FROM um_assets WHERE network_id=$id")->fetchColumn();
        if ($assetCount > 0) throw new Exception("لا يمكن حذف الشبكة لأن بها ($assetCount) أصل مرتبط بها. قم بفك الارتباط أولاً.");
        $this->db->prepare("DELETE FROM um_network_partners WHERE network_id=?")->execute([$id]);
        $this->db->prepare("DELETE FROM um_networks WHERE id=?")->execute([$id]);
        return ['success' => true, 'message' => 'تم حذف الشبكة وشركاؤها'];
    }
    /** جلب قائمة الشبكات مع ملخص الأصول والشركاء */

    // ==========================================
    // METHOD: getNetworkPartners
    // ==========================================
    public function getNetworkPartners($networkId) {
        $networkId = (int)$networkId;
        $sql = "
            SELECT np.*,
                   pe.partner_name,
                   pe.profit_share_percent AS global_profit_share,
                   pe.capital_amount AS global_capital,
                   COALESCE(a.total_assets_cost, 0) AS network_total_assets,
                   ROUND(COALESCE(a.total_assets_cost, 0) * np.share_percent / 100, 2) AS partner_asset_share_value
            FROM um_network_partners np
            JOIN um_partners_equity pe ON pe.id = np.partner_id AND pe.network_id = np.network_id
            LEFT JOIN (
                SELECT network_id, SUM(purchase_cost) AS total_assets_cost
                FROM um_assets WHERE network_id = $networkId
                GROUP BY network_id
            ) a ON a.network_id = np.network_id
            WHERE np.network_id = $networkId
            ORDER BY np.share_percent DESC
        ";
        return $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    }
    /** إضافة أو تحديث شريك في شبكة */

    // ==========================================
    // METHOD: saveNetworkPartner
    // ==========================================
    public function saveNetworkPartner($data) {
        $n=(int)($data['network_id']??0);$p=(int)($data['partner_id']??0);
        $raw=$data['share_percent']??0;$capital=$data['capital_contrib']??0;
        if($n<=0||$p<=0||!is_numeric($raw)||!is_finite((float)$raw)||!is_numeric($capital)||!is_finite((float)$capital))throw new DomainException('بيانات الشريك أو الحصة غير صحيحة');
        $units=(int)round((float)$raw*1000);$capital=round((float)$capital,2);
        if($units<=0||$units>100000||$capital<0)throw new DomainException('الحصة بين صفر و100% والمساهمة لا تكون سالبة');
        $date=trim((string)($data['join_date']??''))?:date('Y-m-d');$d=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
        if(!$d||$d->format('Y-m-d')!==$date)throw new DomainException('تاريخ الانضمام غير صحيح');
        $own=!$this->db->inTransaction();if($own)$this->db->beginTransaction();
        try {
            $q=$this->db->prepare('SELECT id FROM um_networks WHERE id=? FOR UPDATE');$q->execute([$n]);if(!$q->fetchColumn())throw new DomainException('الشبكة غير موجودة');
            $q=$this->db->prepare('SELECT id FROM um_partners_equity WHERE network_id=? AND id=? FOR UPDATE');$q->execute([$n,$p]);if(!$q->fetchColumn())throw new DomainException('الشريك غير تابع لهذه الشبكة');
            $q=$this->db->prepare('SELECT COALESCE(SUM(np.share_percent),0) FROM um_network_partners np JOIN um_partners_equity pe ON pe.id=np.partner_id AND pe.network_id=np.network_id WHERE np.network_id=? AND np.partner_id<>?');$q->execute([$n,$p]);$total=(int)round((float)$q->fetchColumn()*1000);
            if($total+$units>100000)throw new DomainException('مجموع الحصص سيتجاوز 100%. المتبقي: '.round((100000-$total)/1000,3).'%');
            $q=$this->db->prepare('SELECT id FROM um_network_partners WHERE network_id=? AND partner_id=? FOR UPDATE');$q->execute([$n,$p]);$exists=$q->fetchColumn();$notes=trim((string)($data['notes']??''))?:null;
            if($exists)$this->db->prepare('UPDATE um_network_partners SET share_percent=?,capital_contrib=?,join_date=?,notes=? WHERE network_id=? AND partner_id=?')->execute([$units/1000,$capital,$date,$notes,$n,$p]);
            else $this->db->prepare('INSERT INTO um_network_partners(network_id,partner_id,share_percent,capital_contrib,join_date,notes) VALUES(?,?,?,?,?,?)')->execute([$n,$p,$units/1000,$capital,$date,$notes]);
            if($own)$this->db->commit();return ['success'=>true,'message'=>'تم حفظ بيانات الشريك في الشبكة بنجاح'];
        }catch(Throwable $e){if($own&&$this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    /** حذف شريك من شبكة */

    // ==========================================
    // METHOD: removeNetworkPartner
    // ==========================================
    public function removeNetworkPartner($networkId, $partnerId) {
        $this->db->prepare("DELETE FROM um_network_partners WHERE network_id=? AND partner_id=?")
                 ->execute([(int)$networkId, (int)$partnerId]);
        return ['success' => true, 'message' => 'تم إزالة الشريك من الشبكة'];
    }
    /** ربط/فك ربط أصل بشبكة */

    // ==========================================
    // METHOD: assignAssetToNetwork
    // ==========================================
    public function assignAssetToNetwork($assetId, $networkId) {
        $assetId   = (int)$assetId;
        $networkId = $networkId ? (int)$networkId : null;
        if ($assetId <= 0 || !$networkId) throw new DomainException('INVALID_NETWORK_RESOURCE');
        $activeNetworkId = (int)$this->getActiveNetworkId();
        if ($networkId !== $activeNetworkId) throw new DomainException('FORBIDDEN_NETWORK');
        $check = $this->db->prepare('SELECT network_id FROM um_assets WHERE id=? LIMIT 1');
        $check->execute([$assetId]);
        $currentNetworkId = $check->fetchColumn();
        if ($currentNetworkId === false) throw new DomainException('ASSET_NOT_FOUND');
        // An asset may only be assigned inside the active tenant.  Null is
        // accepted for legacy/unassigned rows; a populated foreign tenant is
        // never silently moved by a legacy endpoint.
        if ($currentNetworkId !== null && (int)$currentNetworkId > 0 && (int)$currentNetworkId !== $activeNetworkId) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }
        $stmt = $this->db->prepare('UPDATE um_assets SET network_id=? WHERE id=? AND (network_id=? OR network_id IS NULL)');
        $stmt->execute([$activeNetworkId, $assetId, $activeNetworkId]);
        if ($stmt->rowCount() < 1) throw new DomainException('ASSET_ASSIGNMENT_FAILED');
        return ['success' => true, 'message' => $networkId ? 'تم ربط الأصل بالشبكة' : 'تم فك ربط الأصل من الشبكة'];
    }
    /**
     * تقرير رأس المال التجميعي لكل شريك عبر جميع الشبكات
     * يجمع حصة كل شريك من كل شبكة تتضمنه ويُظهر الإجمالي
     */

    // ==========================================
    // METHOD: getSstpStatus
    // ==========================================
    public function getSstpStatus() {
        $sstpPort = $this->getInternalSstpPort();
        $serviceOutput = [];
        $serviceCode = 1;
        exec('/bin/systemctl is-active accel-ppp 2>&1', $serviceOutput, $serviceCode);
        $radiusOutput = [];
        $radiusCode = 1;
        exec('/bin/systemctl is-active freeradius 2>&1', $radiusOutput, $radiusCode);
        $socketOutput = [];
        exec('/usr/bin/ss -lnt "sport = :' . $sstpPort . '" 2>/dev/null', $socketOutput);
        $listenerActive = (bool)array_filter($socketOutput, fn($line) => str_contains($line, 'LISTEN'));
        $cliOutput = [];
        $cliCode = 1;
        $cmd = '/usr/bin/accel-cmd -H 127.0.0.1 -p 2001 show sessions 2>&1';
        if (!file_exists('/usr/bin/accel-cmd') && file_exists('/usr/sbin/accel-cmd')) {
            $cmd = '/usr/sbin/accel-cmd -H 127.0.0.1 -p 2001 show sessions 2>&1';
        }
        exec($cmd, $cliOutput, $cliCode);
        $headers = [];
        $sessions = [];
        foreach ($cliOutput as $line) {
            if (!str_contains($line, '|') || str_contains($line, '---')) continue;
            $parts = array_map('trim', explode('|', trim($line)));
            if (empty($headers)) {
                $headers = array_map('strtolower', $parts);
                continue;
            }
            $row = [];
            foreach ($headers as $idx => $name) {
                $row[$name] = $parts[$idx] ?? '';
            }
            $sessions[] = [
                'interface' => $row['ifname'] ?? '',
                'username'  => $row['username'] ?? '',
                'ip'        => $row['ip'] ?? '',
                'type'      => $row['type'] ?? '',
                'state'     => $row['state'] ?? 'active',
                'uptime'    => $row['uptime'] ?? '',
                'source_ip' => $row['calling-sid'] ?? '',
                'session_id'=> $row['sid'] ?? '',
                'rx'        => $row['rx-bytes'] ?? ($row['rx'] ?? '0 B'),
                'tx'        => $row['tx-bytes'] ?? ($row['tx'] ?? '0 B'),
            ];
        }
        $serverHost = $this->getSystemRadiusHost();
        return [
            'is_active' => $serviceCode === 0 && $listenerActive && $cliCode === 0,
            'service_active' => $serviceCode === 0,
            'listener_active' => $listenerActive,
            'radius_active' => $radiusCode === 0,
            'backend' => 'accel-ppp 1.14.0',
            'server_host' => $serverHost,
            'port_managed_by_system' => true,
            'vpn_gateway' => '10.101.0.1',
            'vpn_subnet' => '10.101.0.0/24',
            'session_count' => count($sessions),
            'sessions' => $sessions,
        ];
    }

    // ==========================================
    // METHOD: restartSstpServer
    // ==========================================
    public function restartSstpServer() {
        $output = [];
        $code = 1;
        exec('/usr/bin/sudo -n /bin/systemctl restart accel-ppp 2>&1', $output, $code);
        usleep(500000);
        exec('/bin/systemctl is-active --quiet accel-ppp', $unused, $activeCode);
        $success = $code === 0 && $activeCode === 0;
        return [
            'success' => $success,
            'message' => $success ? 'تمت إعادة تشغيل خادم SSTP بنجاح' : 'فشلت إعادة تشغيل accel-ppp؛ راجع سجل الخدمة',
        ];
    }

    // ==========================================
    // METHOD: writeSstpIdentityRows
    // ==========================================
    private function writeSstpIdentityRows(int $networkId, string $username, string $password, string $vpnIp): void {
        $attributes = ['Framed-IP-Address', 'Framed-IP-Netmask', 'Service-Type', 'Framed-Protocol'];
        $deleteCheck = $this->db->prepare("DELETE FROM radcheck WHERE network_id = ? AND username = ? AND attribute IN ('Cleartext-Password','Auth-Type')");
        $deleteCheck->execute([$networkId, $username]);
        $insertCheck = $this->db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, 'Cleartext-Password', ':=', ?)");
        $insertCheck->execute([$networkId, $username, $password]);
        $marks = implode(',', array_fill(0, count($attributes), '?'));
        $deleteReply = $this->db->prepare("DELETE FROM radreply WHERE network_id = ? AND username = ? AND attribute IN ($marks)");
        $deleteReply->execute(array_merge([$networkId, $username], $attributes));
        $insertReply = $this->db->prepare("INSERT INTO radreply (network_id, username, attribute, op, value) VALUES (?, ?, ?, ':=', ?)");
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
    // METHOD: provisionSstpIdentity
    // ==========================================
    private function provisionSstpIdentity(int $networkId, string $username, string $password, string $vpnIp): void {
        $this->db->beginTransaction();
        try {
            $this->writeSstpIdentityRows($networkId, $username, $password, $vpnIp);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: getSstpServerVpnSettings
    // ==========================================
    public function getSstpServerVpnSettings() {
        try {
            $stmt = $this->db->query("SELECT setting_key, setting_value FROM um_settings WHERE setting_key LIKE 'sstp_server_%'");
            $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        } catch (Throwable $e) {
            $rows = [];
        }
        return [
            'enabled' => ($rows['sstp_server_vpn_enabled'] ?? '0') === '1',
            'host' => $rows['sstp_server_vpn_host'] ?? '',
            'port' => (int)($rows['sstp_server_vpn_port'] ?? 4406),
            'user' => $rows['sstp_server_vpn_user'] ?? '',
            'pass' => $rows['sstp_server_vpn_pass'] ?? '',
            'comment' => $rows['sstp_server_vpn_comment'] ?? 'SSTP SERVER SAM',
        ];
    }

    // ==========================================
    // METHOD: saveSstpServerVpnSettings
    // ==========================================
    public function saveSstpServerVpnSettings($data) {
        $enabled = !empty($data['enabled']) && $data['enabled'] !== 'false' && $data['enabled'] !== '0' ? '1' : '0';
        $host = trim($data['host'] ?? '');
        $port = (int)($data['port'] ?? 4406);
        if ($port <= 0 || $port > 65535) $port = 4406;
        $user = trim($data['user'] ?? '');
        $pass = trim($data['pass'] ?? '');
        // A blank browser field means keep the server-managed tunnel password;
        // it must not erase a valid credential or force the user to view it.
        if ($pass === '') {
            try {
                $existingPass = $this->db->prepare("SELECT setting_value FROM um_settings WHERE setting_key='sstp_server_vpn_pass' LIMIT 1");
                $existingPass->execute();
                $pass = trim((string)($existingPass->fetchColumn() ?: ''));
            } catch (Throwable $e) {}
        }
        if ($enabled === '1' && ($host === '' || $user === '' || $pass === '')) {
            return ['error' => 'عنوان خادم SSTP واسم المستخدم وكلمة المرور مطلوبة عند تفعيل الاتصال الخارجي'];
        }
        $comment = trim($data['comment'] ?? 'SSTP SERVER SAM');
        if (empty($comment)) $comment = 'SSTP SERVER SAM';
        $settings = [
            'sstp_server_vpn_enabled' => $enabled,
            'sstp_server_vpn_host' => $host,
            'sstp_server_vpn_port' => (string)$port,
            'sstp_server_vpn_user' => $user,
            'sstp_server_vpn_pass' => $pass,
            'sstp_server_vpn_comment' => $comment,
        ];
        $stmt = $this->db->prepare("INSERT INTO um_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()");
        foreach ($settings as $k => $v) {
            $stmt->execute([$k, $v]);
        }
        return [
            'success' => true,
            'message' => 'تم حفظ إعدادات اتصال SSTP الخادم وDDNS بنجاح',
            'settings' => $this->getSstpServerVpnSettings()
        ];
    }

    // ==========================================
    // METHOD: getBackupRadiusSettings
    // ==========================================
    public function getBackupRadiusSettings() {
        try {
            $networkId = (int)$this->getActiveNetworkId();
            $baseKeys = ['backup_radius_enabled','backup_radius_ip','backup_radius_secret','backup_radius_router_id','backup_radius_auth_port','backup_radius_acct_port'];
            $scopedKeys = array_map(static fn($key) => $key . '_network_' . $networkId, $baseKeys);
            $allKeys = array_values(array_unique(array_merge($scopedKeys, $baseKeys)));
            $marks = implode(',', array_fill(0, count($allKeys), '?'));
            $stmt = $this->db->prepare("SELECT setting_key, setting_value FROM um_settings WHERE setting_key IN ($marks)");
            $stmt->execute($allKeys);
            $raw = $stmt->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];
            $rows = [];
            foreach ($baseKeys as $key) {
                $scopedKey = $key . '_network_' . $networkId;
                $rows[$key] = array_key_exists($scopedKey, $raw) ? $raw[$scopedKey] : ($raw[$key] ?? null);
            }
        } catch (Throwable $e) {
            $rows = [];
        }
        return [
            'enabled' => ($rows['backup_radius_enabled'] ?? '0') === '1' && (int)($rows['backup_radius_router_id'] ?? 0) > 0,
            'ip' => $rows['backup_radius_ip'] ?? '127.0.0.1',
            'secret' => $rows['backup_radius_secret'] ?? '',
            'auth_port' => (int)($rows['backup_radius_auth_port'] ?? 1812),
            'acct_port' => (int)($rows['backup_radius_acct_port'] ?? 1813),
        ];
    }

    // ==========================================
    // METHOD: ensureMikrotikGroupColumn
    // ==========================================
    private function ensureMikrotikGroupColumn(): void {
        $exists = $this->db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'um_profiles_def' AND COLUMN_NAME = 'mikrotik_group'");
        $exists->execute();
        if (!(int)$exists->fetchColumn()) {
            $this->db->exec("ALTER TABLE um_profiles_def ADD COLUMN mikrotik_group VARCHAR(64) NULL AFTER name");
        }
    }

    // ==========================================
    // METHOD: generateMikrotikScript
    // ==========================================
    public function generateMikrotikScript($routerId, $options = []) {
        if (!is_array($options)) {
            $args = func_get_args();
            $options = [
                'backup_ip' => $args[1] ?? null,
                'backup_enabled' => $args[2] ?? null
            ];
        }
        $networkId = $this->getActiveNetworkId();
        $routerId = (int)$routerId;
        if ($routerId < 2 || $routerId > 250) return ['error' => 'رقم الراوتر خارج نطاق عناوين SSTP المسموح'];
        $stmt = $this->db->prepare('SELECT * FROM nas WHERE network_id = ? AND id = ?');
        $stmt->execute([$networkId, $routerId]);
        $r = $stmt->fetch();
        if (!$r) return ['error' => 'الراوتر غير موجود'];
        $workTypes = array_filter(array_map('trim', explode(',', strtolower((string)($r['work_types'] ?? 'hotspot')))));
        $hasHotspot = in_array('hotspot', $workTypes, true);
        $radiusServices = $hasHotspot ? 'hotspot,ppp' : 'ppp';
        $radiusHost = $this->getSystemRadiusHost();
        $vpnUser = 'router_' . $routerId;
        $vpnIp = '10.101.0.' . $routerId;
        $vpnGateway = '10.101.0.1';
        $sstpPort = $this->getInternalSstpPort();
        $radiusSecret = trim((string)($r['secret'] ?? ''));
        if ($radiusSecret === '' || $radiusSecret === '123456') {
            $radiusSecret = bin2hex(random_bytes(24));
            $rotateSecret = $this->db->prepare('UPDATE nas SET secret=? WHERE id=? AND network_id=?');
            $rotateSecret->execute([$radiusSecret, $routerId, $networkId]);
        }
        $coaPort = (int)($r['ports'] ?: 3799);
        $passwordStmt = $this->db->prepare("SELECT value FROM radcheck WHERE network_id = ? AND username = ? AND attribute = 'Cleartext-Password' ORDER BY id DESC LIMIT 1");
        $passwordStmt->execute([$networkId, $vpnUser]);
        $vpnPass = trim((string)($passwordStmt->fetchColumn() ?: ''));
        // SSTP tunnel credentials and the RADIUS shared secret must never be
        // equal.  Regenerate only the SSTP password so an existing RADIUS
        // secret remains stable until the new script is applied on the router.
        if ($vpnPass === '' || hash_equals($vpnPass, $radiusSecret)) {
            $vpnPass = bin2hex(random_bytes(16));
        }
        $this->provisionSstpIdentity($networkId, $vpnUser, $vpnPass, $vpnIp);
        // 1. Optional public DDNS SSTP.  It is deliberately excluded from a
        // normal router script unless the owner explicitly enables it in the
        // generated-script request; the internal RADIUS tunnel is sufficient.
        $serverVpnSettings = $this->getSstpServerVpnSettings();
        $serverVpnEnabled = isset($options['server_vpn_enabled']) &&
            !empty($options['server_vpn_enabled']) &&
            $options['server_vpn_enabled'] !== 'false' &&
            $options['server_vpn_enabled'] !== '0';
        $serverVpnHost = !empty($options['server_vpn_host']) ? trim($options['server_vpn_host']) : $serverVpnSettings['host'];
        $serverVpnPort = !empty($options['server_vpn_port']) ? (int)$options['server_vpn_port'] : $serverVpnSettings['port'];
        $serverVpnUser = array_key_exists('server_vpn_user', $options) && $options['server_vpn_user'] !== null ? trim($options['server_vpn_user']) : $serverVpnSettings['user'];
        $serverVpnPass = array_key_exists('server_vpn_pass', $options) && $options['server_vpn_pass'] !== null ? trim($options['server_vpn_pass']) : $serverVpnSettings['pass'];
        $serverVpnComment = !empty($options['server_vpn_comment']) ? trim($options['server_vpn_comment']) : $serverVpnSettings['comment'];
        $serverVpnSection = '';
        if ($serverVpnEnabled) {
            $serverVpnSection = <<<ROS
# إنشاء اتصال SSTP (الخادم العام / الإدارة)
/interface sstp-client
:do { remove [find name="sstp-server-vpn"] } on-error={}
add name="sstp-server-vpn" connect-to={$serverVpnHost} port={$serverVpnPort} user="{$serverVpnUser}" password="{$serverVpnPass}" profile=default disabled=no verify-server-certificate=no verify-server-address-from-certificate=no comment="{$serverVpnComment}"
ROS;
        }
        // 2. Backup RADIUS Settings (Dedicated Per-Router UM Proxy or Global Fallback)
        $routerProxyEnabled = !empty($r['um_proxy_enabled']) && $r['um_proxy_enabled'] !== '0' && !empty($r['um_proxy_router_id']);
        $routerProxyIp = '';
        $routerProxySecret = '';
        if ($routerProxyEnabled) {
            $proxyStmt = $this->db->prepare('SELECT nasname, secret FROM nas WHERE id=? AND network_id=? AND id<>? LIMIT 1');
            $proxyStmt->execute([(int)$r['um_proxy_router_id'], (int)$networkId, $routerId]);
            $proxy = $proxyStmt->fetch(PDO::FETCH_ASSOC);
            if (!$proxy || !filter_var((string)$proxy['nasname'], FILTER_VALIDATE_IP)) {
                $routerProxyEnabled = false;
            } else {
                $routerProxyIp = trim((string)$proxy['nasname']);
                $routerProxySecret = trim((string)$proxy['secret']);
            }
        }
        $routerProxyAuthPort = !empty($r['um_proxy_auth_port']) ? (int)$r['um_proxy_auth_port'] : 1812;
        $routerProxyAcctPort = !empty($r['um_proxy_acct_port']) ? (int)$r['um_proxy_acct_port'] : 1813;

        $backupSettings = $this->getBackupRadiusSettings();
        $overrideBackupEnabled = $options['backup_enabled'] ?? null;
        // The target IP is always resolved from a same-network router and the
        // persisted server-side setting. A browser/API override is deliberately
        // ignored to prevent cross-network or arbitrary RADIUS destinations.
        $overrideBackupIp = null;

        if ($routerProxyEnabled) {
            $backupEnabled = true;
            $backupIp = $routerProxyIp;
            $backupSecret = $routerProxySecret;
            $backupAuthPort = $routerProxyAuthPort;
            $backupAcctPort = $routerProxyAcctPort;
        } else {
            $backupEnabled = $overrideBackupEnabled !== null ? (!empty($overrideBackupEnabled) && $overrideBackupEnabled !== 'false' && $overrideBackupEnabled !== '0') : $backupSettings['enabled'];
            $backupIp = $backupSettings['ip'];
            if (empty($backupIp)) $backupIp = '127.0.0.1';
            $backupSecret = !empty($backupSettings['secret']) ? $backupSettings['secret'] : $radiusSecret;
            $backupAuthPort = $backupSettings['auth_port'] ?: 1812;
            $backupAcctPort = $backupSettings['acct_port'] ?: 1813;
        }

        if ($overrideBackupEnabled !== null) {
            $backupEnabled = (!empty($overrideBackupEnabled) && $overrideBackupEnabled !== 'false' && $overrideBackupEnabled !== '0');
        }
        $backupRadiusSection = '';
        if ($backupEnabled) {
            $backupComment = $routerProxyEnabled ? "Dedicated Router User Manager Failover" : "Backup User Manager RADIUS";
            $backupRadiusSection = "\n# ربط سيرفر RADIUS الاحتياطي (User Manager)\n" .
                ":do { remove [find comment=\"{$backupComment}\"] } on-error={}\n" .
                ":do { remove [find comment=\"Backup User Manager RADIUS\"] } on-error={}\n" .
                "add address={$backupIp} service={$radiusServices} secret=\"{$backupSecret}\" authentication-port={$backupAuthPort} accounting-port={$backupAcctPort} timeout=3s comment=\"{$backupComment}\"\n";
        }
        // A line-bonding or User Manager-only router must not have its Hotspot
        // configuration changed.  Profiles control device count only; speeds
        // and limits remain dynamic in RADIUS.
        $hotspotProfilesSection = '';
        if ($hasHotspot) {
            $this->ensureMikrotikGroupColumn();
            $profileStmt = $this->db->prepare("SELECT name, COALESCE(NULLIF(mikrotik_group, ''), name) AS mikrotik_group, shared_users FROM um_profiles_def WHERE network_id=? ORDER BY id ASC");
            $profileStmt->execute([$networkId]);
            $profileRows = $profileStmt->fetchAll();
            $hotspotProfilesSection = "# تفعيل RADIUS والتقارير المرحلية للـ Hotspot\n/ip hotspot profile\nset [find] use-radius=yes radius-interim-update=00:01:00\n"
                . "# مزامنة User Profiles للباقات (السرعة ديناميكية من RADIUS)\n/ip hotspot user profile\n";
            foreach ($profileRows as $profile) {
                $profileName = str_replace(['\\', '"'], ['\\\\', '\\"'], (string)$profile['mikrotik_group']);
                $sharedUsers = max(1, (int)$profile['shared_users']);
                $hotspotProfilesSection .= ":local samProfileName \"{$profileName}\"\n";
                $hotspotProfilesSection .= ":if ([:len [find where name=\$samProfileName]] = 0) do={ add name=\$samProfileName shared-users={$sharedUsers} comment=\"SAM managed package profile\" } else={ set [find where name=\$samProfileName] shared-users={$sharedUsers} }\n";
            }
            $hotspotProfilesSection .= "# Mikrotik-Group من RADIUS يربط كل كرت بالـUser Profile المناسب.\n";
        }
        $script = <<<ROS
# ====================================================================
# ربط MikroTik مع FreeRADIUS عبر accel-ppp SSTP
# الراوتر: {$r['shortname']} | دومين النظام مُدار من إعدادات النظام
# عنوان النفق الثابت: {$vpnIp}
# ====================================================================
{$serverVpnSection}# إنشاء اتصال SSTP (FreeRADIUS المصادقة والمحاسبة)
/interface sstp-client
:do { remove [find name="sstp-radius-vpn"] } on-error={}
add name="sstp-radius-vpn" connect-to={$radiusHost} port={$sstpPort} user="{$vpnUser}" password="{$vpnPass}" profile=default disabled=no verify-server-certificate=no verify-server-address-from-certificate=no comment="accel-ppp SSTP RADIUS"
# ربط خدمات المشتركين بـ FreeRADIUS عبر النفق
/radius
:do { remove [find comment="FreeRADIUS VPN Direct"] } on-error={}
:do { remove [find comment="FreeRADIUS over SSTP"] } on-error={}
add address={$vpnGateway} service={$radiusServices} secret="{$radiusSecret}" authentication-port=1812 accounting-port=1813 timeout=3s comment="FreeRADIUS over SSTP" place-before=0
{$backupRadiusSection}
# استقبال Disconnect/CoA من الخادم
/radius incoming
set accept=yes port={$coaPort}
# السماح بـ CoA من بوابة SSTP فقط
/ip firewall filter
:do { remove [find comment="Allow RADIUS CoA over SSTP"] } on-error={}
add chain=input action=accept in-interface="sstp-radius-vpn" src-address={$vpnGateway} protocol=udp dst-port={$coaPort},1700 comment="Allow RADIUS CoA over SSTP" place-before=0
{$hotspotProfilesSection}
# تحقق بعد التنفيذ
/interface sstp-client monitor [find name="sstp-radius-vpn"] once
ROS;
        // Never return platform credentials or generated addresses as editable
        // metadata.  The one-time MikroTik script above already contains the
        // server-rendered values required to configure the device.
        $publicRouter = $r;
        foreach (['secret', 'ports', 'community', 'api_user', 'api_password', 'um_proxy_secret', 'sstp_password'] as $sensitiveField) {
            unset($publicRouter[$sensitiveField]);
        }
        return [
            'success' => true,
            'router' => $publicRouter,
            'server_vpn_enabled' => $serverVpnEnabled,
            'backup_radius_enabled' => $backupEnabled,
            'script' => $script,
        ];
    }

}
