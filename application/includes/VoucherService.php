<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';
require_once __DIR__ . '/NetworkSubscriptionService.php';

/**
 * VoucherService - Specialized Domain Service for Cards, Warehouses, Stock Transfers, Templates & Free Vouchers
 */
class VoucherService extends BaseService {

    // ==========================================
    // METHOD: getAvailableSheets
    // ==========================================
    public function getAvailableSheets($adminId = null) {
        $networkId=$this->getActiveNetworkId();
        $where = [
            "m.network_id = :network_id",
            "m.is_sold = 0",
            "COALESCE(m.comment,'') NOT LIKE 'استيراد محجور من User Manager%'",
            "m.invoice_id IS NULL",
            "m.first_login IS NULL",
            "(m.status IS NULL OR m.status NOT IN ('used', 'expired'))",
            "COALESCE(m.is_free_quota, 0) = 0",
            "COALESCE(m.price, 0) > 0",
            "COALESCE(p.package_type, 'paid') != 'free'",
            "m.profile_name NOT LIKE 'Free-%'",
            "NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id=m.network_id AND ra.username = m.username)",
            "NOT EXISTS (
                SELECT 1 FROM um_vouchers_meta m2 
                WHERE m2.network_id=m.network_id AND m2.sheet_no = m.sheet_no 
                  AND (m2.is_sold = 1 
                       OR m2.invoice_id IS NOT NULL 
                       OR m2.first_login IS NOT NULL 
                       OR m2.status IN ('used', 'expired') 
                       OR EXISTS (SELECT 1 FROM radacct ra2 WHERE ra2.network_id=m2.network_id AND ra2.username = m2.username))
            )"
        ];
        $params = [':network_id'=>$networkId];
        if (!empty($adminId)) {
            $where[] = "m.owner_admin_id = :adm";
            $params[':adm'] = (int)$adminId;
        }
        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT m.profile_name,
                   m.sheet_no,
                   m.batch_id,
                   COUNT(*) as cards_count,
                   MAX(m.price) as retail_price,
                   COALESCE(p.cost_price, 0) as cost_price,
                   COALESCE(NULLIF(p.retail_price, 0), NULLIF(p.price, 0), MAX(m.price)) as profile_retail_price,
                   m.owner_admin_id,
                   COALESCE(u.fullname, 'الإدارة العامة') as owner_name,
                   p.name_for_users
            FROM um_vouchers_meta m
            LEFT JOIN um_admins u ON m.owner_admin_id = u.id
            LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
            WHERE $whereSql
            GROUP BY m.profile_name, m.sheet_no, m.batch_id, m.owner_admin_id, u.fullname, p.name_for_users, p.cost_price, p.retail_price, p.price
            ORDER BY m.sheet_no ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $byProfile = [];
        foreach ($rows as $r) {
            $prof = $r['profile_name'] ?: 'General';
            $costPrice = (float)$r['cost_price'];
            $retailPrice = (float)($r['profile_retail_price'] > 0 ? $r['profile_retail_price'] : $r['retail_price']);
            if (!isset($byProfile[$prof])) {
                $byProfile[$prof] = [
                    'profile_name' => $prof,
                    'display_name' => $r['name_for_users'] ?: $prof,
                    'unit_price' => $costPrice,
                    'cost_price' => $costPrice, // legacy API key: distribution price
                    'distribution_price' => $costPrice,
                    'retail_price' => $retailPrice,
                    'profit_margin' => max(0, $retailPrice - $costPrice),
                    'total_sheets' => 0,
                    'total_cards' => 0,
                    'sheets' => []
                ];
            }
            $sFormatted = str_pad((string)$r['sheet_no'], 6, '0', STR_PAD_LEFT);
            $byProfile[$prof]['total_sheets']++;
            $byProfile[$prof]['total_cards'] += (int)$r['cards_count'];
            $byProfile[$prof]['sheets'][] = [
                'sheet_no' => (int)$r['sheet_no'],
                'sheet_no_formatted' => $sFormatted,
                'batch_id' => $r['batch_id'],
                'cards_count' => (int)$r['cards_count'],
                'unit_price' => $costPrice,
                'cost_price' => $costPrice, // legacy API key: distribution price
                    'distribution_price' => $costPrice,
                'retail_price' => $retailPrice,
                'owner_admin_id' => $r['owner_admin_id'],
                'owner_name' => $r['owner_name']
            ];
        }
        return [
            'success' => true,
            'profiles' => array_values($byProfile),
            'total_available_sheets' => count($rows)
        ];
    }

    // ==========================================
    // METHOD: transferSheets
    // ==========================================
    public function transferSheets($data, $currentAdminId = 1) {
        $this->enforcePermission(["sales_transfer_sheets", "sales", "warehouse_stock_transfer"], "أمر تحويل مخزني / توزيع صفحات", (int)$currentAdminId);
        $sourceId = (int)($data['source_admin_id'] ?? $currentAdminId);
        $targetId = (int)($data['target_admin_id'] ?? 0);
        $sheetNumbers = $data['sheet_numbers'] ?? [];
        $notes = trim($data['notes'] ?? '');

        // Delegate directly to transferWarehouseStock so it writes to um_stock_transfers and updates financial balances
        $res = $this->transferWarehouseStock([
            'source_admin_id' => $sourceId,
            'target_admin_id' => $targetId,
            'sheet_numbers' => $sheetNumbers,
            'notes' => $notes
        ], $currentAdminId);

        $res['message'] = "تم تحويل " . ($res['sheets_count'] ?? 0) . " صفحة بإجمالي " . ($res['cards_count'] ?? 0) . " كرت بنجاح";
        return $res;
    }

    // ==========================================
    // METHOD: getBatches
    // ==========================================
            public function getBatches($limit = 100) {
        $networkId=$this->getActiveNetworkId();
        // High performance query from um_print_batches (0.001s instead of table scan)
        $stmt = $this->db->prepare("
            SELECT b.batch_id, b.total_cards as quantity, b.created_at, 
                   b.profile_name, adm.fullname as owner_name
            FROM um_print_batches b
            LEFT JOIN um_admins adm ON b.printed_by_admin_id = adm.id
            WHERE b.network_id=? ORDER BY b.id DESC
            LIMIT ?
        ");
        $stmt->bindValue(1,$networkId,PDO::PARAM_INT);
        $stmt->bindValue(2, (int)$limit, PDO::PARAM_INT);
        $stmt->execute();
        $batches = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($batches)) {
            $stmt = $this->db->query("
                SELECT m.batch_id, COUNT(*) as quantity, MIN(m.created_at) as created_at, 
                       MAX(m.profile_name) as profile_name, MAX(adm.fullname) as owner_name
                FROM um_vouchers_meta m
                LEFT JOIN um_admins adm ON m.owner_admin_id = adm.id
                WHERE m.network_id=$networkId AND m.batch_id IS NOT NULL AND m.batch_id != ''
                GROUP BY m.batch_id
                ORDER BY MIN(m.id) DESC
                LIMIT 50
            ");
            $batches = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        return $batches;
    }

    // ==========================================
    // METHOD: getPrintBatches
    // ==========================================
    public function getPrintBatches($params = []) {
        $networkId=$this->getActiveNetworkId();
        $where = ["b.network_id=:network_id"];
        $binds = [':network_id'=>$networkId];
        if (!empty($params['profile'])) {
            $where[] = "b.profile_name = :p";
            $binds[':p'] = $params['profile'];
        }
        if (!empty($params['status'])) {
            $where[] = "b.print_status = :st";
            $binds[':st'] = $params['status'];
        }
        $whereSql = implode(' AND ', $where);
        $sql = "SELECT b.*, 
                       u.fullname as printer_name,
                       t.name as template_name,
                       (SELECT COUNT(*) FROM um_vouchers_meta v WHERE v.network_id=b.network_id AND v.batch_id = b.batch_id AND (v.owner_admin_id IS NULL OR v.owner_admin_id = 0)) as unsold_cards,
                       (SELECT COUNT(*) FROM um_vouchers_meta v WHERE v.network_id=b.network_id AND v.batch_id = b.batch_id AND v.owner_admin_id > 0) as sold_cards
                FROM um_print_batches b
                LEFT JOIN um_admins u ON b.printed_by_admin_id = u.id
                LEFT JOIN um_card_templates t ON b.template_id = t.id
                WHERE $whereSql
                ORDER BY b.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($binds);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $cps = max(1, (int)$r['cards_per_sheet']);
            $r['unsold_sheets'] = ceil((int)$r['unsold_cards'] / $cps);
            $r['sold_sheets'] = floor((int)$r['sold_cards'] / $cps);
        }
        return $rows;
    }

    // ==========================================
    // METHOD: confirmPrintBatch
    // ==========================================
    public function confirmPrintBatch($batchId, $adminId) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("UPDATE um_print_batches SET print_status='confirmed_printed',printed_by_admin_id=:adm,confirmed_at=NOW() WHERE network_id=:network_id AND batch_id=:b");
        $stmt->execute([':adm'=>$adminId,':network_id'=>$networkId,':b'=>$batchId]);
        $stmt2 = $this->db->prepare("UPDATE um_vouchers_meta SET is_printed=1,printed_by_admin_id=:adm,printed_at=NOW() WHERE network_id=:network_id AND batch_id=:b");
        $stmt2->execute([':adm'=>$adminId,':network_id'=>$networkId,':b'=>$batchId]);
        return ['success' => true, 'batch_id' => $batchId, 'confirmed_at' => date('Y-m-d H:i:s')];
    }

    // ==========================================
    // METHOD: getUsersForPrint
    // ==========================================
    public function getUsersForPrint(array $usernames) {
        $networkId=$this->getActiveNetworkId();
        if (empty($usernames)) return ['cards' => [], 'template' => null];
        $cleanUsers = array_values(array_filter(array_map('trim', $usernames)));
        if (empty($cleanUsers)) return ['cards' => [], 'template' => null];
        $placeholders = implode(',', array_fill(0, count($cleanUsers), '?'));
        // Query metadata and cleartext password while strictly blocking used cards
        // Rule: If a card is in a sheet, and any card in that sheet is used, the whole sheet is blocked
        $sql = "SELECT m.*, rc.value as password, ug.groupname as profile_name,
                       (m.first_login IS NOT NULL OR m.status IN ('used', 'expired') OR EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id=m.network_id AND ra.username = m.username)) as is_used,
                       EXISTS (
                           SELECT 1 FROM um_vouchers_meta sm 
                           WHERE sm.network_id=m.network_id AND sm.batch_id = m.batch_id AND sm.sheet_no = m.sheet_no AND sm.sheet_no IS NOT NULL
                             AND (sm.first_login IS NOT NULL OR sm.status IN ('used', 'expired') OR EXISTS (SELECT 1 FROM radacct ra2 WHERE ra2.network_id=sm.network_id AND ra2.username = sm.username))
                       ) as sheet_has_used_card
                FROM radcheck rc
                LEFT JOIN um_vouchers_meta m ON m.network_id=rc.network_id AND rc.username = m.username
                LEFT JOIN radusergroup ug ON ug.network_id=rc.network_id AND rc.username = ug.username
                WHERE rc.network_id=? AND rc.username IN ($placeholders)
                  AND rc.attribute IN ('Cleartext-Password', 'User-Password')
                ORDER BY m.sheet_no ASC, m.id ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_merge([$networkId],$cleanUsers));
        $allFetched = $stmt->fetchAll();
        $printableCards = [];
        $blockedCount = 0;
        foreach ($allFetched as $c) {
            if (!empty($c['is_used']) || !empty($c['sheet_has_used_card'])) {
                $blockedCount++;
                continue;
            }
            $printableCards[] = $c;
        }
        $template = null;
        if (!empty($printableCards[0]['profile_name'])) {
            $template = $this->getTemplateForProfile($printableCards[0]['profile_name']);
        }
        if (!$template) {
            $templates = $this->getTemplates();
            $template = !empty($templates) ? $templates[0] : null;
        }
        return [
            'cards' => $printableCards,
            'blocked_used_count' => $blockedCount,
            'template' => $template,
            'total_cards' => count($printableCards)
        ];
    }

    // ==========================================
    // METHOD: getBatchForPrint
    // ==========================================
    public function getBatchForPrint($batchId, $templateId = null) {
        $networkId=$this->getActiveNetworkId();
        // Fetch batch meta
        $stmt = $this->db->prepare("SELECT * FROM um_print_batches WHERE network_id=? AND batch_id = ?");
        $stmt->execute([$networkId,$batchId]);
        $batch = $stmt->fetch();
        // Fetch cards (Excluding any sheets that have used/active session cards)
        // Rule: Used cards cannot be printed, and sheets containing any used card are fully excluded from printing
        $stmt2 = $this->db->prepare("SELECT m.*, rc.value as password, ug.groupname as profile_name 
                                      FROM um_vouchers_meta m
                                      LEFT JOIN radcheck rc ON rc.network_id=m.network_id AND m.username = rc.username AND rc.attribute = 'Cleartext-Password'
                                      LEFT JOIN radusergroup ug ON ug.network_id=m.network_id AND m.username = ug.username
                                      WHERE m.network_id=? AND m.batch_id = ?
                                        AND m.sheet_no NOT IN (
                                            SELECT DISTINCT sub_m.sheet_no 
                                            FROM um_vouchers_meta sub_m 
                                            WHERE sub_m.network_id=m.network_id AND sub_m.batch_id = ?
                                              AND sub_m.sheet_no IS NOT NULL
                                              AND (
                                                  sub_m.first_login IS NOT NULL 
                                                  OR sub_m.status IN ('used', 'expired') 
                                                  OR EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id=sub_m.network_id AND ra.username = sub_m.username)
                                              )
                                        )
                                        AND (
                                            m.first_login IS NULL 
                                            AND m.status NOT IN ('used', 'expired') 
                                            AND NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id=m.network_id AND ra.username = m.username)
                                        )
                                      ORDER BY m.sheet_no ASC, m.id ASC");
        $stmt2->execute([$networkId,$batchId, $batchId]);
        $cards = $stmt2->fetchAll();
        // Fetch Template (either specified or batch's or default)
        $template = null;
        if ($templateId) {
            $template = $this->getTemplateById($templateId);
        } elseif (!empty($batch['template_id'])) {
            $template = $this->getTemplateById($batch['template_id']);
        }
        if (!$template && !empty($cards[0]['profile_name'])) {
            $template = $this->getTemplateForProfile($cards[0]['profile_name']);
        }
        if (!$template) {
            $templates = $this->getTemplates();
            $template = !empty($templates) ? $templates[0] : null;
        }
        return [
            'batch' => $batch,
            'cards' => $cards,
            'template' => $template,
            'total_cards' => count($cards)
        ];
    }

    // ==========================================
    // METHOD: getUnsoldInventory
    // ==========================================
    public function getUnsoldInventory() {
        $networkId=$this->getActiveNetworkId();
        $sql = "SELECT 
                    m.profile_name,
                    p.price as unit_price,
                    COUNT(m.id) as unsold_cards,
                    CEIL(COUNT(m.id) / 60) as unsold_sheets,
                    COUNT(DISTINCT m.batch_id) as batches_count,
                    COALESCE(SUM(m.price), 0) as total_inventory_value
                FROM um_vouchers_meta m
                LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
                WHERE m.network_id=$networkId AND m.is_sold = 0 AND COALESCE(m.comment,'') NOT LIKE 'استيراد محجور من User Manager%'
                GROUP BY m.profile_name";
        return $this->db->query($sql)->fetchAll();
    }
    // ==========================================
    // ACCEL-PPP SSTP / RADIUS / COA MANAGEMENT
    // ==========================================

    // ==========================================
    // METHOD: generateBatch
    // ==========================================
    public function generateBatch($params, $creatorAdminId = 1) {
        $networkId = $this->getActiveNetworkId();
        $cols = !empty($params['grid_cols']) ? (int)$params['grid_cols'] : 4;
        $rows = !empty($params['grid_rows']) ? (int)$params['grid_rows'] : 15;
        $cardsPerSheet = !empty($params['cards_per_sheet']) ? (int)$params['cards_per_sheet'] : max(1, $cols * $rows);
        if ($cardsPerSheet <= 0) $cardsPerSheet = 60;

        $count = min(max((int)($params['count'] ?? 10), 1), 50000);
        $requestedSheets = (int)ceil($count / $cardsPerSheet);
        if ($requestedSheets > 100) {
            throw new Exception('عدد الصفحات المراد طباعتها لا يمكن أن يزيد عن 100 ورقة A4 في الدفعة الواحدة');
        }

        $length = min(max((int)($params['length'] ?? 8), 3), 16);
        $rawPrefix = trim((string)($params['prefix'] ?? ''));
        $prefix = substr(preg_replace('/[^0-9]/', '', $rawPrefix), 0, 4);
        $charType = $params['char_type'] ?? 'digits';
        $passMode = $params['pass_mode'] ?? '';
        // The network policy is authoritative for newly generated cards.
        {
            $netAuthMode = (string)$this->db->query("SELECT auth_mode FROM um_networks WHERE id=$networkId")->fetchColumn();
            if ($netAuthMode === 'username_only') {
                $passMode = 'empty';
            } elseif ($netAuthMode === 'same') {
                $passMode = 'same';
            } else {
                $passMode = 'different';
            }
        }
        $passLength = min(max((int)($params['pass_length'] ?? $length), 3), 16);
        $profile = trim($params['profile'] ?? '');

        $adminId = !empty($creatorAdminId) ? (int)$creatorAdminId : (!empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : 1);
        $comment = trim((string)($params['comment'] ?? ''));
        if (empty($comment)) {
            $admStmt = $this->db->prepare("SELECT fullname, username FROM um_admins WHERE id = ?");
            $admStmt->execute([$adminId]);
            $adminRow = $admStmt->fetch(PDO::FETCH_ASSOC);
            $adminName = !empty($adminRow['fullname']) ? $adminRow['fullname'] : (!empty($adminRow['username']) ? $adminRow['username'] : 'المسؤول');
            $comment = "تم التوليد بواسطة $adminName";
        }

        $templateId = !empty($params['template_id']) ? (int)$params['template_id'] : null;
        $batchId = 'BATCH-' . date('Ymd-His') . '-' . rand(100, 999);
        $digits = '0123456789';
        $charset = $digits;
        if ($charType === 'alphanumeric') {
            $charset = '23456789abcdefghjkmnpqrstuvwxyz';
        } elseif ($charType === 'uppercase') {
            $charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        } elseif ($charType === 'mixed') {
            $charset = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
        }
        if (empty($profile)) {
            throw new Exception('يجب تحديد الباقة المستهدفة لتوليد الدفعة');
        }
        $pStmt = $this->db->prepare("SELECT price, package_type FROM um_profiles_def WHERE network_id=? AND name = ?");
        $pStmt->execute([$networkId,$profile]);
        $profRow = $pStmt->fetch(PDO::FETCH_ASSOC);
        if (!$profRow) {
            throw new Exception('الباقة المحددة غير موجودة في النظام');
        }
        if (($profRow['package_type'] ?? 'paid') === 'free' || (float)$profRow['price'] <= 0) {
            throw new Exception('الباقات المجانية مخصصة فقط لمنح المستخدمين و VIP عبر واجهة الكروت المجانية، ولا يمكن توليد كروت دفعات منها.');
        }
        $price = (float)$profRow['price'];
        // 1. Get next global unique sequential sheet number across the whole system
        $maxSheetStmt = $this->db->query("SELECT COALESCE(MAX(sheet_no),0) FROM um_vouchers_meta WHERE network_id=$networkId");
        $globalStartSheetNo = (int)$maxSheetStmt->fetchColumn();
        $generated = [];
        $existingCodes = [];
        $charsLen = strlen($charset);
        // Fetch existing usernames starting with prefix to avoid collisions with DB
        $dbExisting = [];
        if (!empty($prefix)) {
            $exStmt = $this->db->prepare("SELECT username FROM radcheck WHERE network_id=? AND username LIKE ?");
            $exStmt->execute([$networkId,$prefix . '%']);
            $dbExisting = array_flip($exStmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
        }
        for ($i = 0; $i < $count; $i++) {
            $attempts = 0;
            do {
                $userPart = '';
                for ($j = 0; $j < $length; $j++) {
                    $userPart .= $charset[random_int(0, $charsLen - 1)];
                }
                $username = $prefix . $userPart;
                $attempts++;
                if ($attempts > 50) {
                    $username .= (string)random_int(10, 99);
                }
            } while (isset($existingCodes[$username]) || isset($dbExisting[$username]) || preg_match('/^router_[0-9]+$/', $username));
            $existingCodes[$username] = true;
            $dbExisting[$username] = true;
            if ($passMode === 'same') {
                $password = $username;
            } elseif ($passMode === 'empty') {
                $password = '';
            } else {
                $password = '';
                $pCharset = ($charType === 'digits') ? $digits : $charset;
                $pLen = strlen($pCharset);
                for ($k = 0; $k < $passLength; $k++) {
                    $password .= $pCharset[random_int(0, $pLen - 1)];
                }
                if ($password === $username) $password[0] = $pCharset[(strpos($pCharset,$password[0])+1)%$pLen];
            }
            $sheetNo = $globalStartSheetNo + (int)floor($i / $cardsPerSheet) + 1;
            $generated[] = [
                'username' => $username,
                'password' => $password,
                'profile' => $profile,
                'price' => $price,
                'batch_id' => $batchId,
                'sheet_no' => $sheetNo
            ];
        }
        $totalSheets = (int)ceil(count($generated) / $cardsPerSheet);
        $startSheetNo = $globalStartSheetNo + 1;
        $endSheetNo = $globalStartSheetNo + $totalSheets;
        $adminId = !empty($creatorAdminId) ? (int)$creatorAdminId : (!empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : 1);
        $this->db->beginTransaction();
        try {
            $subscriptionUsage = (new NetworkSubscriptionService($this->db))->consumeDailyCards($networkId, count($generated), 0, $adminId);
            $chunkSize = 250;
            // Insert Passwords in radcheck
            for ($c = 0; $c < count($generated); $c += $chunkSize) {
                $slice = array_slice($generated, $c, $chunkSize);
                $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, "Cleartext-Password", ":=", ?)'));
                $pParams = [];
                foreach ($slice as $item) {
                    $pParams[] = $networkId;
                    $pParams[] = $item['username'];
                    $pParams[] = $item['password'];
                }
                $stmt = $this->db->prepare("INSERT IGNORE INTO radcheck (network_id,username, attribute, op, value) VALUES $placeholders");
                $stmt->execute($pParams);
            }
            // Insert (Auth-Type := Reject) in radcheck to KEEP CARDS INACTIVE / DISABLED UNTIL SOLD
            for ($c = 0; $c < count($generated); $c += $chunkSize) {
                $slice = array_slice($generated, $c, $chunkSize);
                $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, "Auth-Type", ":=", "Reject")'));
                $pParams = [];
                foreach ($slice as $item) {
                    $pParams[] = $networkId;
                    $pParams[] = $item['username'];
                }
                $stmt = $this->db->prepare("INSERT IGNORE INTO radcheck (network_id,username, attribute, op, value) VALUES $placeholders");
                $stmt->execute($pParams);
            }
            // Insert Profiles in radusergroup
            if (!empty($profile)) {
                for ($c = 0; $c < count($generated); $c += $chunkSize) {
                    $slice = array_slice($generated, $c, $chunkSize);
                    $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, ?, 1)'));
                    $pParams = [];
                    foreach ($slice as $item) {
                        $pParams[] = $networkId;
                        $pParams[] = $item['username'];
                        $pParams[] = $profile;
                    }
                    $stmt = $this->db->prepare("INSERT IGNORE INTO radusergroup (network_id,username, groupname, priority) VALUES $placeholders");
                    $stmt->execute($pParams);
                }
            }
            // Insert Vouchers in um_vouchers_meta (status='disabled', is_sold=0, owner_admin_id=$adminId, printed_by_admin_id=$adminId)
            for ($c = 0; $c < count($generated); $c += $chunkSize) {
                $slice = array_slice($generated, $c, $chunkSize);
                $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, ?, ?, ?, ?, ?, ?, ?, "disabled", 0, 0)'));
                $pParams = [];
                foreach ($slice as $item) {
                    $pParams[] = $networkId;
                    $pParams[] = $item['username'];
                    $pParams[] = $batchId;
                    $pParams[] = $profile;
                    $pParams[] = $price;
                    $pParams[] = $comment;
                    $pParams[] = $item['sheet_no'];
                    $pParams[] = $adminId; // owner_admin_id
                    $pParams[] = $adminId; // printed_by_admin_id
                }
                $stmt = $this->db->prepare("INSERT INTO um_vouchers_meta (network_id,username, batch_id, profile_name, price, comment, sheet_no, owner_admin_id, printed_by_admin_id, status, is_printed, is_sold) VALUES $placeholders");
                $stmt->execute($pParams);
            }
            $totalGrossAmount = count($generated) * $price;
            // Record Print Batch with start/end sheet numbers, pricing and custody
            $insBatch = $this->db->prepare("INSERT INTO um_print_batches 
                (network_id,batch_id, profile_name, template_id, cards_per_sheet, total_cards, total_sheets, start_sheet_no, end_sheet_no, unit_price, total_amount, printed_by_admin_id, assigned_to_admin_id, print_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')");
            $insBatch->execute([$networkId,$batchId, $profile, $templateId, $cardsPerSheet, count($generated), $totalSheets, $startSheetNo, $endSheetNo, $price, $totalGrossAmount, $adminId, $adminId]);


            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        $totalGrossAmount = count($generated) * $price;
        return [
            'success' => true,
            'batch_id' => $batchId,
            'count' => count($generated),
            'total_sheets' => $totalSheets,
            'start_sheet_no' => $startSheetNo,
            'end_sheet_no' => $endSheetNo,
            'start_sheet_formatted' => str_pad((string)$startSheetNo, 6, '0', STR_PAD_LEFT),
            'end_sheet_formatted' => str_pad((string)$endSheetNo, 6, '0', STR_PAD_LEFT),
            'unit_price' => $price,
            'total_amount' => $totalGrossAmount,
            'status' => 'disabled',
            'subscription_usage' => $subscriptionUsage,
            'vouchers' => $generated,
            'message' => "تم توليد الدفعة بنجاح بالأوراق المرقمة تسلسلياً من (" . str_pad((string)$startSheetNo, 6, '0', STR_PAD_LEFT) . ") إلى (" . str_pad((string)$endSheetNo, 6, '0', STR_PAD_LEFT) . ") بإجمالي قيمة " . number_format($totalGrossAmount, 2) . " ريال وهي مقيدة في عهدتك بحالة معطلة حتى البيع"
        ];
    }
    // ==========================================
    // ACTIVE SESSIONS & RADACCT
    // ==========================================
    // ==========================================
    // STALE / HANGING SESSIONS CLEANUP
    // ==========================================

    // ==========================================
    // METHOD: exportVouchers
    // ==========================================
    public function exportVouchers($filters = [], $specificUsernames = []) {
        $networkId=$this->getActiveNetworkId();
        $where = [
            "c.network_id=?",
            "c.attribute IN ('Cleartext-Password', 'User-Password')",
            "(COALESCE(m.is_free_quota, 0) = 0 OR m.free_recipient_id IS NULL OR m.free_recipient_id = 0)"
        ];
        $params = [$networkId];
        if (!empty($specificUsernames) && is_array($specificUsernames)) {
            $in = implode(',', array_fill(0, count($specificUsernames), '?'));
            $where[] = "c.username IN ($in)";
            $params = array_merge($params, $specificUsernames);
        } else {
            if (!empty($filters['search'])) {
                $where[] = "(c.username LIKE ? OR m.comment LIKE ?)";
                $params[] = '%' . $filters['search'] . '%';
                $params[] = '%' . $filters['search'] . '%';
            }
            if (!empty($filters['profile'])) {
                $where[] = "(ug.groupname = ? OR m.profile_name = ?)";
                $params[] = $filters['profile'];
                $params[] = $filters['profile'];
            }
            if (!empty($filters['batch'])) {
                $where[] = "m.batch_id = ?";
                $params[] = $filters['batch'];
            }
            if (!empty($filters['status'])) {
                if ($filters['status'] === 'active') {
                    $where[] = "(m.status = 'active' OR m.status IS NULL)";
                } else {
                    $where[] = "m.status = ?";
                    $params[] = $filters['status'];
                }
            }
        }
        $whereClause = implode(' AND ', $where);
        $sql = "SELECT c.username, c.value as password, 
                       COALESCE(ug.groupname, m.profile_name, '') as profile_name,
                       COALESCE(m.batch_id, '') as batch_id,
                       COALESCE(m.price, 0) as price,
                       COALESCE(m.status, 'active') as status,
                       COALESCE(m.created_at, NOW()) as created_at,
                       m.first_login, m.expires_at, m.comment
                FROM radcheck c
                LEFT JOIN um_vouchers_meta m ON m.network_id=c.network_id AND c.username = m.username
                LEFT JOIN radusergroup ug ON ug.network_id=c.network_id AND c.username = ug.username
                WHERE $whereClause
                ORDER BY c.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: importVouchers
    // ==========================================
    public function importVouchers($cards, $defaultProfile = '', $batchId = '', $creatorAdminId = 1) {
        $networkId=$this->getActiveNetworkId();
        if (empty($cards) || !is_array($cards)) {
            throw new Exception('لا توجد بيانات كروت صالحة للاستيراد');
        }
        if (empty($batchId)) {
            $batchId = 'IMPORT-' . date('Ymd-His') . '-' . rand(100, 999);
        }
        // Get profile price if profile given
        $defaultPrice = 0.00;
        if (!empty($defaultProfile)) {
            $pStmt = $this->db->prepare("SELECT price FROM um_profiles_def WHERE network_id=? AND name = ?");
            $pStmt->execute([$networkId,$defaultProfile]);
            $defaultPrice = (float)($pStmt->fetchColumn() ?: 0);
        }
        // 1. Check existing usernames to skip duplicates
        $usernames = array_unique(array_filter(array_map(function($c) {
            return trim($c['username'] ?? '');
        }, $cards)));
        if (empty($usernames)) {
            throw new Exception('لم يتم العثور على أي أسماء مستخدمين في الملف');
        }
        $existingUsernames = [];
        $checkChunks = array_chunk($usernames, 500);
        foreach ($checkChunks as $chunk) {
            $in = implode(',', array_fill(0, count($chunk), '?'));
            $cStmt = $this->db->prepare("SELECT username FROM radcheck WHERE network_id=? AND username IN ($in)");
            $cStmt->execute(array_merge([$networkId],$chunk));
            $existingUsernames = array_merge($existingUsernames, $cStmt->fetchAll(PDO::FETCH_COLUMN));
        }
        $existingMap = array_flip($existingUsernames);
        $validCards = [];
        $skippedDuplicates = 0;
        foreach ($cards as $c) {
            $u = trim($c['username'] ?? '');
            if (empty($u) || isset($existingMap[$u])) {
                $skippedDuplicates++;
                continue;
            }
            $existingMap[$u] = true; // Prevent duplicate within same file
            $p = !empty($c['password']) ? trim($c['password']) : $u;
            $prof = !empty($c['profile']) ? trim($c['profile']) : $defaultProfile;
            $price = isset($c['price']) && is_numeric($c['price']) ? (float)$c['price'] : $defaultPrice;
            $comment = !empty($c['comment']) ? trim($c['comment']) : 'Imported from file';
            $validCards[] = [
                'username' => $u,
                'password' => $p,
                'profile' => $prof,
                'price' => $price,
                'comment' => $comment
            ];
        }
        if (empty($validCards)) {
            return [
                'success' => true,
                'count' => 0,
                'duplicates' => $skippedDuplicates,
                'batch_id' => $batchId,
                'message' => 'جميع الكروت في الملف موجودة مسبقاً في النظام (تم تخطيها بالكامل)'
            ];
        }
        // 2. Perform chunked insertion in transaction
        $this->db->beginTransaction();
        try {
            $subscriptionUsage = (new NetworkSubscriptionService($this->db))->consumeDailyCards($networkId, 0, count($validCards), (int)$creatorAdminId);
            $chunkSize = 250;
            $cardsPerSheet = 20;
            // Insert radcheck
            for ($c = 0; $c < count($validCards); $c += $chunkSize) {
                $slice = array_slice($validCards, $c, $chunkSize);
                $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, "Cleartext-Password", ":=", ?)'));
                $params = [];
                foreach ($slice as $item) {
                    $params[] = $networkId;
                    $params[] = $item['username'];
                    $params[] = $item['password'];
                }
                $this->db->prepare("INSERT IGNORE INTO radcheck (network_id,username, attribute, op, value) VALUES $placeholders")->execute($params);
            }
            // Insert radusergroup
            for ($c = 0; $c < count($validCards); $c += $chunkSize) {
                $slice = array_slice($validCards, $c, $chunkSize);
                $groupRows = array_filter($slice, function($item) { return !empty($item['profile']); });
                if (!empty($groupRows)) {
                    $placeholders = implode(',', array_fill(0, count($groupRows), '(?, ?, ?, 1)'));
                    $params = [];
                    foreach ($groupRows as $item) {
                        $params[] = $networkId;
                        $params[] = $item['username'];
                        $params[] = $item['profile'];
                    }
                    $this->db->prepare("INSERT IGNORE INTO radusergroup (network_id,username, groupname, priority) VALUES $placeholders")->execute($params);
                }
            }
            // Insert um_vouchers_meta
            for ($c = 0; $c < count($validCards); $c += $chunkSize) {
                $slice = array_slice($validCards, $c, $chunkSize);
                $placeholders = implode(',', array_fill(0, count($slice), '(?, ?, ?, ?, ?, ?, ?, 0, 0, ?, "active")'));
                $params = [];
                foreach ($slice as $k => $item) {
                    $idx = $c + $k;
                    $sheetNo = (int)floor($idx / $cardsPerSheet) + 1;
                    $params[] = $networkId;
                    $params[] = $item['username'];
                    $params[] = $batchId;
                    $params[] = $item['profile'];
                    $params[] = $item['price'];
                    $params[] = $item['comment'];
                    $params[] = $sheetNo;
                    $params[] = $creatorAdminId;
                }
                $this->db->prepare("INSERT INTO um_vouchers_meta (network_id,username, batch_id, profile_name, price, comment, sheet_no, is_printed, is_sold, owner_admin_id, status) VALUES $placeholders")->execute($params);
            }
            // Insert print batch entry for this import
            $totalSheets = (int)ceil(count($validCards) / $cardsPerSheet);
            $insBatch = $this->db->prepare("INSERT INTO um_print_batches 
                (network_id,batch_id, profile_name, cards_per_sheet, total_cards, total_sheets, printed_by_admin_id, print_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')");
            $insBatch->execute([$networkId,$batchId, $defaultProfile, $cardsPerSheet, count($validCards), $totalSheets, $creatorAdminId]);


            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return [
            'success' => true,
            'count' => count($validCards),
            'duplicates' => $skippedDuplicates,
            'batch_id' => $batchId,
            'subscription_usage' => $subscriptionUsage,
            'message' => "تم استيراد " . count($validCards) . " كرت بنجاح (وتم تخطي {$skippedDuplicates} كرت مكرر)"
        ];
    }
    // ==========================================
    // PROFILES IMPORT & EXPORT
    // ==========================================

    // ==========================================
    // METHOD: getTemplates
    // ==========================================
    public function getTemplates() {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->query("SELECT * FROM um_card_templates WHERE network_id=$networkId ORDER BY id DESC");
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: getTemplateById
    // ==========================================
    public function getTemplateById($id) {
        $networkId=$this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT * FROM um_card_templates WHERE network_id=? AND id = ?");
        $stmt->execute([$networkId,(int)$id]);
        return $stmt->fetch();
    }

    // ==========================================
    // METHOD: getTemplateForProfile
    // ==========================================
    public function getTemplateForProfile($profileName) {
        $networkId=$this->getActiveNetworkId();
        if (!empty($profileName)) {
            $pStmt = $this->db->prepare("SELECT template_id FROM um_profiles_def WHERE network_id=? AND name = ?");
            $pStmt->execute([$networkId,$profileName]);
            $tmplId = $pStmt->fetchColumn();
            if ($tmplId) {
                return $this->getTemplateById($tmplId);
            }
            $tStmt = $this->db->prepare("SELECT * FROM um_card_templates WHERE network_id=? AND profile_name = ? LIMIT 1");
            $tStmt->execute([$networkId,$profileName]);
            $t = $tStmt->fetch();
            if ($t) return $t;
        }
        return $this->db->query("SELECT * FROM um_card_templates WHERE network_id=$networkId ORDER BY id ASC LIMIT 1")->fetch();
    }

    // ==========================================
    // METHOD: saveTemplate
    // ==========================================
    public function saveTemplate($data) {
        $networkId=$this->getActiveNetworkId();
        $name = trim($data['name'] ?? '');
        if (empty($name)) throw new Exception('Template name is required');
        $cols = max(1, min(10, (int)($data['grid_cols'] ?? 3)));
        $rows = max(1, min(50, (int)($data['grid_rows'] ?? 10)));
        $cardsPerPage = $cols * $rows;
        $elementsJson = is_array($data['elements_json'] ?? null) ? json_encode($data['elements_json'], JSON_UNESCAPED_UNICODE) : ($data['elements_json'] ?? null);
        $params = [
            ':name' => $name,
            ':profile_name' => !empty($data['profile_name']) ? trim($data['profile_name']) : null,
            ':cards_per_page' => $cardsPerPage,
            ':grid_cols' => $cols,
            ':grid_rows' => $rows,
            ':card_width_mm' => (float)($data['card_width_mm'] ?? 63.0),
            ':card_height_mm' => (float)($data['card_height_mm'] ?? 33.0),
            ':page_margin_mm' => (float)($data['page_margin_mm'] ?? 5.0),
            ':card_gap_mm' => (float)($data['card_gap_mm'] ?? 1.5),
            ':bg_image' => $data['bg_image'] ?? null,
            ':elements_json' => $elementsJson,
            ':network_name' => trim($data['network_name'] ?? 'شبكة واي فاي'),
            ':network_sub' => trim($data['network_sub'] ?? ''),
            ':header_bg' => trim($data['header_bg'] ?? '#0078d7'),
            ':header_color' => trim($data['header_color'] ?? '#ffffff'),
            ':border_color' => trim($data['border_color'] ?? '#0078d7'),
            ':card_bg' => trim($data['card_bg'] ?? '#ffffff'),
            ':show_qr' => !empty($data['show_qr']) ? 1 : 0,
            ':show_price' => !empty($data['show_price']) ? 1 : 0,
            ':show_profile' => !empty($data['show_profile']) ? 1 : 0,
            ':show_validity' => !empty($data['show_validity']) ? 1 : 0,
            ':show_serial' => !empty($data['show_serial']) ? 1 : 0,
            ':footer_text' => trim($data['footer_text'] ?? ''),
            ':hotspot_url' => trim($data['hotspot_url'] ?? 'http://192.168.88.1/login')
        ];
        $params[':network_id']=$networkId;
        if (!empty($data['id'])) {
            $params[':id'] = (int)$data['id'];
            $sql = "UPDATE um_card_templates SET name=:name, profile_name=:profile_name, cards_per_page=:cards_per_page, grid_cols=:grid_cols, grid_rows=:grid_rows, card_width_mm=:card_width_mm, card_height_mm=:card_height_mm, page_margin_mm=:page_margin_mm, card_gap_mm=:card_gap_mm, bg_image=:bg_image, elements_json=:elements_json, network_name=:network_name, network_sub=:network_sub, header_bg=:header_bg, header_color=:header_color, border_color=:border_color, card_bg=:card_bg, show_qr=:show_qr, show_price=:show_price, show_profile=:show_profile, show_validity=:show_validity, show_serial=:show_serial, footer_text=:footer_text, hotspot_url=:hotspot_url WHERE network_id=:network_id AND id=:id";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
        } else {
            $sql = "INSERT INTO um_card_templates (network_id,name, profile_name, cards_per_page, grid_cols, grid_rows, card_width_mm, card_height_mm, page_margin_mm, card_gap_mm, bg_image, elements_json, network_name, network_sub, header_bg, header_color, border_color, card_bg, show_qr, show_price, show_profile, show_validity, show_serial, footer_text, hotspot_url) VALUES (:network_id,:name, :profile_name, :cards_per_page, :grid_cols, :grid_rows, :card_width_mm, :card_height_mm, :page_margin_mm, :card_gap_mm, :bg_image, :elements_json, :network_name, :network_sub, :header_bg, :header_color, :border_color, :card_bg, :show_qr, :show_price, :show_profile, :show_validity, :show_serial, :footer_text, :hotspot_url)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
        }
        return ['success' => true];
    }

    // ==========================================
    // METHOD: deleteTemplate
    // ==========================================
    public function deleteTemplate($id) {
        $networkId=$this->getActiveNetworkId();
        $id = (int)$id;
        // Protect both the current FK-style association and the legacy profile_name mapping.
        $usage = $this->db->prepare("SELECT DISTINCT p.name
            FROM um_profiles_def p
            WHERE p.network_id=? AND (
                p.template_id=?
                OR EXISTS (
                    SELECT 1 FROM um_card_templates t
                    WHERE t.network_id=p.network_id AND t.id=?
                      AND NULLIF(TRIM(t.profile_name), '') = p.name
                )
            )
            ORDER BY p.name");
        $usage->execute([$networkId,$id,$id]);
        $linkedProfiles = $usage->fetchAll(PDO::FETCH_COLUMN);
        $profileCount = count($linkedProfiles);
        if ($profileCount > 0) {
            return ['success'=>false,'error'=>"تعذر حذف قالب الطباعة: ما زال مرتبطاً بـ {$profileCount} باقة. عيّن قالباً آخر لهذه الباقات أولاً.",'profile_count'=>$profileCount];
        }
        $stmt = $this->db->prepare("DELETE FROM um_card_templates WHERE network_id=? AND id = ?");
        $stmt->execute([$networkId,$id]);
        return $stmt->rowCount() > 0 ? ['success' => true, 'deleted_id' => $id] : ['success'=>false,'error'=>'قالب الطباعة غير موجود ضمن الشبكة النشطة'];
    }

    // ==========================================
    // METHOD: duplicateTemplate
    // ==========================================
    public function duplicateTemplate($id) {
        $id = (int)$id;
        $t = $this->getTemplateById($id);
        if (!$t) throw new Exception('القالب غير موجود');
        $t['name'] = $t['name'] . ' (نسخة ' . date('H:i') . ')';
        unset($t['id']);
        return $this->saveTemplate($t);
    }

    // ==========================================
    // METHOD: uploadBgImage
    // ==========================================
    public function uploadBgImage($file) {
        if (empty($file) || empty($file['tmp_name'])) {
            throw new Exception('No image file uploaded');
        }
        $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!in_array($file['type'], $allowed)) {
            throw new Exception('Invalid file type. Allowed: JPG, PNG, WEBP');
        }
        $uploadDir = __DIR__ . '/../uploads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = 'bg_' . date('Ymd_His') . '_' . rand(1000, 9999) . '.' . $ext;
        $targetPath = $uploadDir . $filename;
        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            return ['success' => true, 'url' => 'uploads/' . $filename];
        } else {
            throw new Exception('Failed to save uploaded image');
        }
    }

    // ==========================================
    // METHOD: uploadTemplateIcon
    // ==========================================
    public function uploadTemplateIcon($file) {
        if (empty($file) || !isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK || empty($file['tmp_name'])) {
            throw new Exception('تعذر استلام صورة الأيقونة');
        }
        $maxBytes = 2 * 1024 * 1024;
        if (empty($file['size']) || (int)$file['size'] > $maxBytes) {
            throw new Exception('حجم الأيقونة يجب ألا يتجاوز 2 ميجابايت');
        }
        $imageInfo = @getimagesize($file['tmp_name']);
        if (!$imageInfo || ($imageInfo[2] ?? null) !== IMAGETYPE_PNG || ($imageInfo['mime'] ?? '') !== 'image/png') {
            throw new Exception('الأيقونة يجب أن تكون صورة PNG حقيقية');
        }
        $width = (int)($imageInfo[0] ?? 0);
        $height = (int)($imageInfo[1] ?? 0);
        if ($width < 1 || $height < 1 || $width > 2048 || $height > 2048) {
            throw new Exception('أبعاد الأيقونة غير صالحة أو تتجاوز 2048×2048');
        }
        $uploadDir = __DIR__ . '/../uploads/template-icons/';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            throw new Exception('تعذر إنشاء مجلد أيقونات النظام');
        }
        $filename = 'icon_' . date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.png';
        $targetPath = $uploadDir . $filename;
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            throw new Exception('تعذر حفظ صورة الأيقونة');
        }
        @chmod($targetPath, 0644);
        return [
            'success' => true,
            'url' => 'uploads/template-icons/' . $filename,
            'width' => $width,
            'height' => $height,
        ];
    }
    // ==========================================
    // USERS & VOUCHERS + USAGE METRICS
    // ==========================================
    // ==========================================
    // ADVANCED USERS & CARDS MANAGEMENT
    // ==========================================

    // ==========================================
    // METHOD: getFreeVouchersQuotas
    // ==========================================
    public function getFreeVouchersQuotas($adminId = 0, $role = 'superadmin', $dataScope = 'own') {
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $callerId = $adminId ?: (int)$ctx['id'];
        $callerRole = $role ?: (string)$ctx['role'];
        $scope = $dataScope ?: (string)$ctx['data_scope'];
        $where = ["q.network_id = :network_id"];
        $params = [':network_id' => $networkId];
        if (!in_array($callerRole, ['system_owner', 'superadmin'], true)) {
            $cId = (int)$callerId;
            if ($scope === 'assigned') {
                $delegated = array_merge([$cId], $ctx['delegated_ids'] ?: []);
                $cleanIds = array_filter(array_map('intval', $delegated));
                $placeholders = !empty($cleanIds) ? implode(',', $cleanIds) : (string)$cId;
                $where[] = "(q.admin_id IN ($placeholders) OR a.parent_id IN ($placeholders))";
            } else {
                $where[] = "(q.admin_id = $cId OR a.parent_id = $cId)";
            }
        }
        $whereClause = implode(' AND ', $where);
        $stmt = $this->db->prepare("
            SELECT q.*, a.username, a.fullname, a.role,
                   COALESCE(r.role_name_ar, a.role) AS role_name_ar,
                   COALESCE(p.name_for_users, p.name, q.profile_name) AS profile_label,
                   COALESCE(p.rate_limit, '') AS profile_rate_limit,
                   COALESCE(p.transfer_limit, 0) AS transfer_limit,
                   COALESCE(a.phone, q.phone, '') AS recipient_phone,
                   COALESCE(creator.fullname, creator.username, 'النظام') AS creator_name,
                   COALESCE(q.start_date, DATE(q.created_at), CURDATE()) AS start_date,
                   COALESCE(counts.total_granted_cards, 0) AS total_granted_cards,
                   COALESCE(counts.active_cards, 0) AS active_cards
            FROM um_free_vouchers_quota q
            JOIN um_admins a ON q.admin_id = a.id
            LEFT JOIN um_admins creator ON q.created_by = creator.id
            LEFT JOIN um_roles_def r ON a.role = r.role_key
            LEFT JOIN um_profiles_def p ON p.network_id=q.network_id AND q.profile_name = p.name
            LEFT JOIN (
                SELECT free_recipient_id, network_id,
                       COUNT(*) AS total_granted_cards,
                       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_cards
                FROM um_vouchers_meta
                WHERE is_free_quota = 1
                GROUP BY free_recipient_id, network_id
            ) counts ON counts.free_recipient_id = q.admin_id AND counts.network_id = q.network_id
            WHERE $whereClause
            ORDER BY q.id DESC
        ");
        $stmt->execute($params);
        return ['success' => true, 'quotas' => $stmt->fetchAll()];
    }

    // ==========================================
    // METHOD: saveFreeVouchersQuota
    // ==========================================
    public function saveFreeVouchersQuota($data) {
        $networkId = $this->getActiveNetworkId();
        $adminId = (int)($data['admin_id'] ?? 0);
        $roleKey = trim($data['role_key'] ?? '');
        $quota = (int)($data['monthly_cards_quota'] ?? 5);
        $profile = trim($data['profile_name'] ?? '');
        $notes = trim($data['notes'] ?? '');
        if ($adminId <= 0 || empty($profile)) {
            return ['error' => 'يرجى اختيار المستفيد والباقة المحددة'];
        }
        if(!$this->getAdminById($adminId)) return ['error'=>'المستفيد لا يتبع الشبكة النشطة'];
        $profileCheck = $this->db->prepare("SELECT 1 FROM um_profiles_def WHERE network_id=? AND name=?");
        $profileCheck->execute([$networkId,$profile]);
        if (!$profileCheck->fetchColumn()) return ['error' => 'الباقة غير موجودة في الشبكة النشطة'];
        $stmt = $this->db->prepare("
            INSERT INTO um_free_vouchers_quota (network_id,admin_id, role_key, monthly_cards_quota, profile_name, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE monthly_cards_quota = VALUES(monthly_cards_quota), notes = VALUES(notes)
        ");
        $stmt->execute([$networkId,$adminId, $roleKey, $quota, $profile, $notes]);
        return ['success' => true, 'message' => 'تم حفظ حصة الكروت المجانية بنجاح'];
    }

    // ==========================================
    // HELPER: parseValidityToDays
    // ==========================================
    public static function parseValidityToDays($validity, $uptimeLimitSeconds = 0): int {
        $val = strtolower(trim((string)$validity));
        if (preg_match('/^(\d+)\s*d(ays?)?$/i', $val, $m)) {
            return max(1, (int)$m[1]);
        }
        if (preg_match('/^(\d+)\s*w(eeks?)?$/i', $val, $m)) {
            return max(1, (int)$m[1] * 7);
        }
        if (preg_match('/^(\d+)\s*m(onths?)?$/i', $val, $m)) {
            return max(1, (int)$m[1] * 30);
        }
        if (preg_match('/^(\d+)\s*y(ears?)?$/i', $val, $m)) {
            return max(1, (int)$m[1] * 365);
        }
        if (preg_match('/^(\d+)\s*h(ours?)?$/i', $val, $m)) {
            return max(1, (int)ceil((int)$m[1] / 24));
        }
        if ($uptimeLimitSeconds > 0) {
            return max(1, (int)ceil($uptimeLimitSeconds / 86400));
        }
        return 30; // default 30 days
    }

    // ==========================================
    // METHOD: deleteUnassignedFreeVouchers
    // ==========================================
    public function deleteUnassignedFreeVouchers($deleteAll = false) {
        $this->enforcePermission(["free_vouchers_grant", "free_vouchers"], "حذف الكروت المجانية");
        $networkId = $this->getActiveNetworkId();
        $ctx = $this->getActiveAdminContext();
        $isSuperAdmin = in_array($ctx['role'] ?? '', ['system_owner', 'superadmin', 'admin'], true) || (($ctx['data_scope'] ?? '') === 'all');
        
        if ($deleteAll) {
            $sql = "SELECT username FROM um_vouchers_meta WHERE is_free_quota = 1";
        } else {
            $sql = "SELECT username FROM um_vouchers_meta WHERE is_free_quota = 1 AND (free_recipient_id IS NULL OR free_recipient_id = 0) AND first_login IS NULL";
        }
        $params = [];
        if (!$isSuperAdmin && $networkId > 0) {
            $sql .= " AND network_id = ?";
            $params[] = $networkId;
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $voucherCodes = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $count = count($voucherCodes);
        if ($count > 0) {
            $chunks = array_chunk($voucherCodes, 500);
            foreach ($chunks as $chunk) {
                $inClause = implode(',', array_fill(0, count($chunk), '?'));
                $this->db->prepare("DELETE FROM radcheck WHERE username IN ($inClause)")->execute($chunk);
                $this->db->prepare("DELETE FROM radusergroup WHERE username IN ($inClause)")->execute($chunk);
                $this->db->prepare("DELETE FROM radreply WHERE username IN ($inClause)")->execute($chunk);
                $this->db->prepare("DELETE FROM um_vouchers_meta WHERE username IN ($inClause)")->execute($chunk);
            }
        }
        return [
            'success' => true,
            'message' => $deleteAll ? "تم حذف وتصفية كافة ($count) الكروت المجانية السابقة بنجاح 🗑️" : "تم حذف $count كرت مجاني سابق غير مخصص بنجاح 🗑️",
            'deleted_count' => $count
        ];
    }

    // ==========================================
    // METHOD: hideFreeVoucher (Soft-hide single expired voucher from granted UI)
    // ==========================================
    public function hideFreeVoucher(string $username): array {
        $this->enforcePermission(["free_vouchers_delete", "free_vouchers"], "إخفاء كرت مجاني من الواجهة");
        $networkId = $this->getActiveNetworkId();
        $cleanUser = trim($username);
        if (empty($cleanUser)) {
            return ['error' => 'اسم المستخدم / الكرت غير محدد'];
        }
        $stmt = $this->db->prepare("
            UPDATE um_vouchers_meta 
            SET is_hidden_from_free_list = 1 
            WHERE network_id = ? AND username = ? AND is_free_quota = 1
        ");
        $stmt->execute([$networkId, $cleanUser]);
        if ($stmt->rowCount() > 0) {
            return ['success' => true, 'message' => 'تم إخفاء الكرت المنتهي من الجدول بنجاح 👁️‍🗨️'];
        }
        return ['error' => 'تعذر إخفاء الكرت أو تم إخفاؤه مسبقاً'];
    }

    // ==========================================
    // METHOD: hideAllExpiredFreeVouchers (Soft-hide all expired vouchers in active network)
    // ==========================================
    public function hideAllExpiredFreeVouchers(): array {
        $this->enforcePermission(["free_vouchers_delete", "free_vouchers"], "إخفاء الكروت المنتهية");
        $networkId = $this->getActiveNetworkId();
        
        // 1. Direct status = 'expired' or expires_at <= NOW()
        $sql = "
            UPDATE um_vouchers_meta 
            SET is_hidden_from_free_list = 1 
            WHERE network_id = ? 
              AND is_free_quota = 1 
              AND (
                  status = 'expired' 
                  OR (expires_at IS NOT NULL AND expires_at <= NOW())
              )
              AND COALESCE(is_hidden_from_free_list, 0) = 0
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$networkId]);
        $hiddenCount = $stmt->rowCount();
        
        // 2. Also check vouchers where quota or uptime limit has been fully exhausted
        $vSql = "
            SELECT m.username, m.first_login, m.expires_at, p.transfer_limit, p.uptime_limit
            FROM um_vouchers_meta m
            LEFT JOIN um_profiles_def p ON p.network_id = m.network_id AND m.profile_name = p.name
            WHERE m.network_id = ? 
              AND m.is_free_quota = 1 
              AND COALESCE(m.is_hidden_from_free_list, 0) = 0
              AND (m.first_login IS NOT NULL OR p.transfer_limit > 0)
        ";
        $vStmt = $this->db->prepare($vSql);
        $vStmt->execute([$networkId]);
        $candidates = $vStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($candidates)) {
            $cUsernames = array_column($candidates, 'username');
            $cMap = [];
            foreach ($candidates as $c) {
                $cMap[$c['username']] = $c;
            }
            $chunks = array_chunk($cUsernames, 500);
            $toHide = [];
            foreach ($chunks as $chunk) {
                $inPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
                $qAcct = $this->db->prepare("
                    SELECT username, 
                           SUM(acctinputoctets + acctoutputoctets) AS total_bytes,
                           SUM(acctsessiontime) AS total_uptime
                    FROM radacct
                    WHERE network_id = ? AND username IN ($inPlaceholders)
                    GROUP BY username
                ");
                $qAcct->execute(array_merge([$networkId], $chunk));
                while ($row = $qAcct->fetch(PDO::FETCH_ASSOC)) {
                    $u = $row['username'];
                    $meta = $cMap[$u] ?? null;
                    if ($meta) {
                        $tLimit = (float)($meta['transfer_limit'] ?? 0);
                        $uLimit = (int)($meta['uptime_limit'] ?? 0);
                        if (($tLimit > 0 && (float)$row['total_bytes'] >= $tLimit) ||
                            ($uLimit > 0 && (int)$row['total_uptime'] >= $uLimit)) {
                            $toHide[] = $u;
                        }
                    }
                }
            }
            if (!empty($toHide)) {
                $hideChunks = array_chunk($toHide, 500);
                foreach ($hideChunks as $hChunk) {
                    $inP = implode(',', array_fill(0, count($hChunk), '?'));
                    $hStmt = $this->db->prepare("UPDATE um_vouchers_meta SET is_hidden_from_free_list = 1 WHERE network_id = ? AND username IN ($inP)");
                    $hStmt->execute(array_merge([$networkId], $hChunk));
                    $hiddenCount += $hStmt->rowCount();
                }
            }
        }
        
        return [
            'success' => true,
            'message' => $hiddenCount > 0 
                ? "تم إخفاء $hiddenCount كرت منتهي من الواجهة بنجاح 🧹" 
                : "لا توجد كروت مجانية منتهية إضافية لإخفائها في هذه الشبكة",
            'hidden_count' => $hiddenCount
        ];
    }

    // ==========================================
    // METHOD: grantFreeVouchers (SUPER-FAST & VIP CAPABLE)
    // ==========================================
    public function grantFreeVouchers($data, $callerAdminId = 0, $callerAdminRole = 'superadmin') {
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $grantorId = $callerAdminId ?: (int)$ctx['id'];
        $grantorRole = $callerAdminRole ?: (string)$ctx['role'];
        $recipientId = (int)($data['recipient_id'] ?? 0);
        $profileName = trim((string)($data['profile_name'] ?? ''));
        $count = max(1, min(20, (int)($data['count'] ?? 1)));
        $notes = trim((string)($data['notes'] ?? ''));
        $phoneInput = trim((string)($data['phone'] ?? ''));
        $speedBoost = trim((string)($data['speed_boost'] ?? $data['custom_speed'] ?? $data['speed'] ?? ''));
        $simultaneousUse = max(1, min(10, (int)($data['simultaneous_use'] ?? $data['shared_users'] ?? 1)));
        $forceOverride = !empty($data['force_override']);

        if ($recipientId <= 0 || empty($profileName)) {
            return ['error' => 'يرجى تحديد المستلم والباقة'];
        }

        if (empty($notes)) {
            $notes = 'منح كرت مجاني/VIP للمستفيد';
        }

        // Get admin details
        try { $admin = $this->getAdminById($recipientId); } catch (Throwable $e) { $admin = false; }
        if (!$admin) return ['error' => 'المستخدم المستفيد غير موجود'];

        $isPrivileged = in_array($grantorRole, ['system_owner', 'superadmin'], true);

        // Security Guard 1: Cannot grant free vouchers to oneself (unless superadmin)
        if ($recipientId === $grantorId && !$isPrivileged) {
            return ['error' => 'غير مصرح: لا يمكنك منح كروت مجانية لحسابك الشخصي'];
        }

        // Security Guard 2: Non-superadmin subordination check
        if (!$isPrivileged) {
            if ((int)$admin['parent_id'] !== $grantorId && !in_array($recipientId, $ctx['delegated_ids'] ?: [])) {
                return ['error' => 'غير مصرح لك بمنح كروت مجانية لهذا الحساب'];
            }
        }

        // Fetch profile definition
        $pStmt = $this->db->prepare("SELECT * FROM um_profiles_def WHERE network_id=? AND name = ?");
        $pStmt->execute([$networkId, $profileName]);
        $profile = $pStmt->fetch(PDO::FETCH_ASSOC);
        $validity = '30d';
        $transferLimit = 0;
        $uptimeLimitSeconds = 0;
        $rateLimit = $speedBoost;

        if ($profile) {
            $validity = $profile['validity'] ?: ($profile['uptime_limit'] ?: '30d');
            $transferLimit = (float)($profile['transfer_limit'] ?? 0);
            $uptimeLimitSeconds = (int)($profile['uptime_limit'] ?? 0);
            if (empty($rateLimit)) {
                $rateLimit = trim((string)($profile['rate_limit'] ?? ''));
            }
        }

        // Check network authentication mode (username_only / same / different)
        $netAuthMode = 'same';
        try {
            $namStmt = $this->db->prepare("SELECT auth_mode FROM um_networks WHERE id = ?");
            $namStmt->execute([$networkId]);
            $netAuthMode = (string)$namStmt->fetchColumn() ?: 'same';
        } catch (Throwable $e) {
            $netAuthMode = 'same';
        }

        // Cooldown check for regular admins (superadmin can bypass)
        if (!$isPrivileged && !$forceOverride) {
            $prevStmt = $this->db->prepare("
                SELECT m.id, m.profile_name, m.free_granted_at, m.validity, p.uptime_limit, p.transfer_limit
                FROM um_vouchers_meta m
                LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name=p.name
                WHERE m.network_id=? AND m.free_recipient_id=? AND m.is_free_quota=1
                ORDER BY m.free_granted_at DESC, m.id DESC
                LIMIT 1
            ");
            $prevStmt->execute([$networkId, $recipientId]);
            $prevVoucher = $prevStmt->fetch(PDO::FETCH_ASSOC);

            if ($prevVoucher && !empty($prevVoucher['free_granted_at'])) {
                $prevValDays = self::parseValidityToDays($prevVoucher['validity'] ?: '30d', (int)($prevVoucher['uptime_limit'] ?? 0));
                $cooldownDays = max(30, $prevValDays);
                $lastGrantedTime = strtotime($prevVoucher['free_granted_at']);
                $daysPassed = (time() - $lastGrantedTime) / 86400;

                if ($daysPassed < $cooldownDays) {
                    $daysRemaining = max(1, (int)ceil($cooldownDays - $daysPassed));
                    $prevDateStr = date('Y-m-d', $lastGrantedTime);
                    return [
                        'error' => "عذراً، تم منح كرت مجاني سابق لهذا المستفيد بتاريخ ($prevDateStr) بصلاحية ($cooldownDays يوم). متبقي $daysRemaining يوم لانتهاء المدة."
                    ];
                }
            }
        }

        // High-Speed Batch Card Generation
        $createdCards = [];
        $createdCardDetails = [];
        $batchId = 'FREE-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -4));

        $grantType = trim((string)($data['grant_type'] ?? ''));
        if (empty($grantType)) {
            if (mb_strpos($notes, 'مجدول') !== false || mb_strpos($notes, 'جدولة') !== false) {
                $grantType = 'schedule';
            } elseif (mb_strpos($notes, 'مكافأة') !== false || mb_strpos($notes, 'ورق') !== false || mb_strpos($notes, 'نقطة') !== false) {
                $grantType = 'pos_reward';
            } else {
                $grantType = 'instant';
            }
        }

        $this->db->beginTransaction();
        try {
            $insRadCheck = $this->db->prepare("INSERT INTO radcheck (network_id, username, attribute, op, value) VALUES (?, ?, ?, ':=', ?)");
            $insRadGroup = $this->db->prepare("INSERT INTO radusergroup (network_id, username, groupname, priority) VALUES (?, ?, ?, 1)");
            $insRadReply = $this->db->prepare("INSERT INTO radreply (network_id, username, attribute, op, value) VALUES (?, ?, ?, ':=', ?)");
            $insMeta = $this->db->prepare("
                INSERT INTO um_vouchers_meta 
                (network_id, username, batch_id, profile_name, price, sale_price, validity, status, comment, is_free_quota, is_sold, free_recipient_id, owner_admin_id, free_granted_at, grant_type)
                VALUES (?, ?, ?, ?, 0.00, 0.00, ?, 'active', ?, 1, 1, ?, ?, NOW(), ?)
            ");

            for ($i = 0; $i < $count; $i++) {
                $code = (string)random_int(10000000, 99999999);
                // Check collision
                $chk = $this->db->prepare("SELECT 1 FROM radcheck WHERE network_id=? AND username=?");
                $chk->execute([$networkId, $code]);
                if ($chk->fetchColumn()) {
                    $code = (string)random_int(10000000, 99999999);
                }

                $password = ($netAuthMode === 'username_only') ? '' : $code;
                if ($netAuthMode === 'different') {do {$password=(string)random_int(10000000,99999999);} while($password===$code);}

                // 1. Password in radcheck
                $insRadCheck->execute([$networkId, $code, 'Cleartext-Password', $password]);

                // 2. Multi-device support if simultaneous_use > 1
                if ($simultaneousUse > 1) {
                    $insRadCheck->execute([$networkId, $code, 'Simultaneous-Use', (string)$simultaneousUse]);
                }

                // 3. Profile group in radusergroup
                $insRadGroup->execute([$networkId, $code, $profileName]);

                // 4. Rate-Limit directly in radreply for instant VIP bandwidth speed
                if (!empty($rateLimit)) {
                    $insRadReply->execute([$networkId, $code, 'Mikrotik-Rate-Limit', $rateLimit]);
                }
                $insRadReply->execute([$networkId, $code, 'Acct-Interim-Interval', '60']);

                // 5. Metadata in um_vouchers_meta (marked active, is_sold=1, is_free_quota=1, grant_type)
                $insMeta->execute([$networkId, $code, $batchId, $profileName, $validity, $notes, $recipientId, $grantorId, $grantType]);

                $createdCards[] = $code;
                $createdCardDetails[] = [
                    'code' => $code,
                    'password' => $password,
                    'profile' => $profileName,
                    'speed' => $rateLimit ?: 'حسب الباقة',
                    'validity' => $validity,
                    'devices' => $simultaneousUse,
                    'grant_type' => $grantType
                ];
            }

            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            return ['error' => 'فشل توليد الكروت: ' . $e->getMessage()];
        }

        // WhatsApp Non-Blocking Instant Dispatch
        $recipientPhone = $phoneInput ?: ($admin['phone'] ?? '');
        $cleanPhone = WhatsAppService::normalizePhone($recipientPhone);
        $waResult = ['sent' => false, 'phone' => $cleanPhone, 'error' => null];

        if (!empty($cleanPhone)) {
            $speedText = !empty($rateLimit) ? " ⚡ سرعة: $rateLimit" : "";
            $devicesText = ($simultaneousUse > 1) ? " (متعدد الأجهزة: $simultaneousUse)" : "";
            $cardsBlock = implode("\n", array_map(function($c) use ($netAuthMode) { 
                $passPart = ($netAuthMode === 'username_only') ? " (بدون كلمة سر)" : "";
                return "• 🎫 الكرت: *`{$c['code']}`*{$passPart}"; 
            }, $createdCardDetails));

            $msg = "🎁 *كروت إنترنت مجانية / VIP مخصصة لك - شبكة ميكروتك مانجر*\n";
            $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
            $msg .= "👤 *المستفيد:* {$admin['fullname']}\n";
            $msg .= "📦 *الباقة:* $profileName{$speedText}{$devicesText}\n";
            $msg .= "🔢 *عدد الكروت:* $count كرت\n\n";
            $msg .= "🎫 *بيانات الكروت:*\n$cardsBlock\n\n";
            $msg .= "⏳ *الصلاحية:* $validity\n";
            if (!empty($notes)) {
                $msg .= "📝 *البيان:* $notes\n";
            }
            $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
            $msg .= "🌐 نتمنى لك تصفحاً فائق السرعة وممتعاً!";

            try {
                $waService = $this->getNotificationService()->getWhatsAppService();
                $sendRes = $waService->sendMessage($cleanPhone, $msg, $batchId, $grantorId);
                $isSent = !empty($sendRes['success']);
                $errMsg = $sendRes['error'] ?? null;
                
                foreach ($createdCards as $cCode) {
                    $logStmt = $this->db->prepare("
                        INSERT INTO um_notification_logs 
                        (network_id, channel, event_type, recipient_phone, recipient_name, message_text, status, error_message, reference_id, created_by)
                        VALUES (?, 'whatsapp', 'free_voucher', ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $logStmt->execute([$networkId, $cleanPhone, $admin['fullname'], $msg, $isSent ? 'sent' : 'failed', $errMsg, $cCode, $grantorId]);
                }

                $waResult = [
                    'sent' => $isSent,
                    'phone' => $cleanPhone,
                    'error' => $errMsg
                ];
            } catch (Throwable $waEx) {
                $waResult = [
                    'sent' => false,
                    'phone' => $cleanPhone,
                    'error' => $waEx->getMessage()
                ];
            }
        }

        $this->logActivity('free_vouchers', 'grant', "منح كروت مجانية: {$admin['fullname']}", "تم منح عدد {$count} كرت مجاني/VIP للمستفيد بنجاح", 'success', $grantorId);
        
        $successMsg = "تم توليد وتخصيص {$count} كرت مجاني/VIP للمستفيد [{$admin['fullname']}] بنجاح!";
        if ($waResult['sent']) {
            $successMsg .= " وتم إرسالها إلى واتساب ({$cleanPhone}) بنجاح 🟢";
        } elseif (!empty($cleanPhone)) {
            $successMsg .= " (يمكنك إرسالها أو نسخها يدوياً) ⚠️";
        }

        return [
            'success' => true,
            'message' => $successMsg,
            'cards' => $createdCards,
            'card_details' => $createdCardDetails,
            'batch_id' => $batchId,
            'recipient_name' => $admin['fullname'],
            'profile_name' => $profileName,
            'speed' => $rateLimit ?: 'حسب الباقة',
            'phone' => $cleanPhone,
            'whatsapp_delivery' => $waResult
        ];
    }

    // ==========================================
    // METHOD: resendFreeVoucherWhatsApp
    // ==========================================
    public function resendFreeVoucherWhatsApp($voucherCode, $customPhone = null) {
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $callerId = (int)$ctx['id'];
        $code = trim($voucherCode);
        if (empty($code)) return ['error' => 'رقم الكرت مطلوب'];
        // Get voucher details
        $stmt = $this->db->prepare("
            SELECT m.*, COALESCE(adm.fullname, 'المستفيد') as recipient_name, adm.phone as admin_phone, p.validity as profile_validity
            FROM um_vouchers_meta m
            LEFT JOIN um_admins adm ON m.free_recipient_id = adm.id
            LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
            WHERE m.network_id=? AND m.username = ? AND m.is_free_quota = 1
            LIMIT 1
        ");
        $stmt->execute([$networkId,$code]);
        $v = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$v) return ['error' => 'الكرت المجاني غير موجود'];
        $phone = trim($customPhone ?: ($v['admin_phone'] ?? ''));
        $cleanPhone = WhatsAppService::normalizePhone($phone);
        if (empty($cleanPhone)) {
            return ['error' => 'يرجى إدخال رقم هاتف صحيح للمستلم'];
        }
        $recipName = $v['recipient_name'];
        $prof = $v['profile_name'];
        $val = $v['validity'] ?: ($v['profile_validity'] ?: '30d');
        $msg = "🎁 *إشعار كرت إنترنت مجاني - شبكة ميكروتك مانجر*\n";
        $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
        $msg .= "👤 *المستفيد:* $recipName\n";
        $msg .= "🎫 *رقم الكرت:* `{$v['username']}`\n";
        $msg .= "📦 *الباقة:* $prof\n";
        $msg .= "⏳ *الصلاحية:* $val\n";
        $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
        $msg .= "🌐 نتمنى لك تصفحاً ممتعاً وسريعاً!";
        $waService = $this->getNotificationService()->getWhatsAppService();
        $sendRes = $waService->sendMessage($cleanPhone, $msg, $v['username'], $callerId);
        $status = !empty($sendRes['success']) ? 'sent' : 'failed';
        $errMsg = $sendRes['error'] ?? null;
        $logStmt = $this->db->prepare("
            INSERT INTO um_notification_logs (network_id,channel, event_type, recipient_phone, recipient_name, message_text, status, error_message, reference_id, created_by)
            VALUES (?,'whatsapp', 'free_voucher', ?, ?, ?, ?, ?, ?, ?)
        ");
        $logStmt->execute([$networkId,$cleanPhone, $recipName, $msg, $status, $errMsg, $v['username'], $callerId]);
        if (!empty($sendRes['success'])) {
            return [
                'success' => true,
                'message' => "تم إرسال الكرت ({$v['username']}) بنجاح عبر واتساب إلى الرقم (+{$cleanPhone})! 🟢",
                'phone' => $cleanPhone
            ];
        } else {
            return [
                'success' => false,
                'error' => "فشل إرسال الواتساب: " . ($sendRes['error'] ?? 'خدمة الواتساب غير متصلة'),
                'phone' => $cleanPhone
            ];
        }
    }

    // ==========================================
    // METHOD: getFreeVouchersList
    // ==========================================
    public function getFreeVouchersList($recipientId = 0, $callerAdminId = 0, $callerAdminRole = 'superadmin', $dataScope = 'own') {
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $callerId = $callerAdminId ?: (int)$ctx['id'];
        $callerRole = $callerAdminRole ?: (string)$ctx['role'];
        $scope = $dataScope ?: (string)$ctx['data_scope'];
        $where = [
            "m.network_id = :network_id",
            "m.is_free_quota = 1",
            "m.free_recipient_id IS NOT NULL",
            "m.free_recipient_id > 0",
            "COALESCE(m.is_hidden_from_free_list, 0) = 0",
            "adm.id IS NOT NULL"
        ];
        $params = [':network_id'=>$networkId];
        if ($recipientId > 0) {
            $where[] = "m.free_recipient_id = :recip";
            $params[':recip'] = $recipientId;
        }
        if (!in_array($callerRole, ['system_owner', 'superadmin'], true)) {
            $cId = (int)$callerId;
            if ($scope === 'assigned') {
                $delegated = array_merge([$cId], $ctx['delegated_ids'] ?: []);
                $cleanIds = array_filter(array_map('intval', $delegated));
                $placeholders = !empty($cleanIds) ? implode(',', $cleanIds) : (string)$cId;
                $where[] = "(m.free_recipient_id IN ($placeholders) OR m.owner_admin_id IN ($placeholders) OR adm.parent_id IN ($placeholders))";
            } else {
                $where[] = "(m.free_recipient_id = $cId OR m.owner_admin_id = $cId OR adm.parent_id = $cId)";
            }
        }
        $whereClause = implode(' AND ', $where);
        
        // Fast base query
        $sql = "
            SELECT m.*, 
                   adm.fullname AS recipient_fullname,
                   COALESCE(adm.username, '') AS recipient_username,
                   COALESCE(adm.phone, '') AS recipient_default_phone,
                   COALESCE(adm.role, 'vip') AS recipient_role,
                   COALESCE(r.role_name_ar, adm.role) AS recipient_role_ar,
                   COALESCE(granter.fullname, 'الإدارة') AS granter_fullname,
                   COALESCE(granter.username, 'admin') AS granter_username,
                   COALESCE(p.name_for_users, p.name, m.profile_name) AS profile_label,
                   COALESCE(p.rate_limit, rr.value, '') AS profile_rate_limit,
                   p.transfer_limit,
                   p.uptime_limit
            FROM um_vouchers_meta m
            JOIN um_admins adm ON m.free_recipient_id = adm.id
            LEFT JOIN um_admins granter ON m.owner_admin_id = granter.id
            LEFT JOIN um_roles_def r ON adm.role = r.role_key
            LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
            LEFT JOIN radreply rr ON rr.network_id=m.network_id AND rr.username=m.username AND rr.attribute='Mikrotik-Rate-Limit'
            WHERE $whereClause
            ORDER BY m.id DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $vouchers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($vouchers)) {
            $usernames = array_values(array_filter(array_unique(array_column($vouchers, 'username'))));
            
            // 1. Batch fetch accounting consumption (indexed, super fast)
            $acctMap = [];
            if (!empty($usernames)) {
                $chunks = array_chunk($usernames, 500);
                foreach ($chunks as $chunk) {
                    $inPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
                    $qAcct = $this->db->prepare("
                        SELECT username, 
                               SUM(acctinputoctets + acctoutputoctets) AS total_bytes,
                               SUM(acctsessiontime) AS total_uptime,
                               MAX(CASE WHEN acctstoptime IS NULL THEN 1 ELSE 0 END) AS is_online
                        FROM radacct
                        WHERE network_id = ? AND username IN ($inPlaceholders)
                        GROUP BY username
                    ");
                    $qAcct->execute(array_merge([$networkId], $chunk));
                    while ($row = $qAcct->fetch(PDO::FETCH_ASSOC)) {
                        $acctMap[$row['username']] = $row;
                    }
                }
            }

            // 2. Batch fetch latest WhatsApp delivery status
            $waMap = [];
            if (!empty($usernames)) {
                $chunks = array_chunk($usernames, 500);
                foreach ($chunks as $chunk) {
                    $inPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
                    $qWa = $this->db->prepare("
                        SELECT nl.reference_id, nl.status, nl.recipient_phone, nl.error_message
                        FROM um_notification_logs nl
                        JOIN (
                            SELECT MAX(id) AS max_id 
                            FROM um_notification_logs 
                            WHERE network_id = ? AND channel = 'whatsapp' AND reference_id IN ($inPlaceholders)
                            GROUP BY reference_id
                        ) latest ON latest.max_id = nl.id
                    ");
                    $qWa->execute(array_merge([$networkId], $chunk));
                    while ($row = $qWa->fetch(PDO::FETCH_ASSOC)) {
                        $waMap[$row['reference_id']] = $row;
                    }
                }
            }

            // Populate joined details in memory
            $nowTime = time();
            foreach ($vouchers as &$v) {
                $u = $v['username'];
                $acct = $acctMap[$u] ?? null;
                $totalBytes = (float)($acct['total_bytes'] ?? 0);
                $totalUptime = (int)($acct['total_uptime'] ?? 0);
                $v['total_consumed_bytes'] = $totalBytes;
                $v['total_consumed_mb'] = round($totalBytes / (1024 * 1024), 2);
                $v['total_uptime'] = $totalUptime;
                $v['is_online'] = (int)($acct['is_online'] ?? 0);

                $wa = $waMap[$u] ?? null;
                $v['whatsapp_status'] = $wa['status'] ?? 'none';
                $v['whatsapp_phone'] = $wa['recipient_phone'] ?? ($v['recipient_default_phone'] ?? '');
                $v['whatsapp_error'] = $wa['error_message'] ?? '';

                // Operation/Grant Type detection
                $gType = (string)($v['grant_type'] ?? '');
                $notes = (string)($v['comment'] ?? '');
                if (empty($gType)) {
                    if (mb_strpos($notes, 'مجدول') !== false || mb_strpos($notes, 'جدولة') !== false) {
                        $gType = 'schedule';
                    } elseif (mb_strpos($notes, 'مكافأة') !== false || mb_strpos($notes, 'ورق') !== false || mb_strpos($notes, 'نقطة') !== false) {
                        $gType = 'pos_reward';
                    } else {
                        $gType = 'instant';
                    }
                }
                $v['grant_type'] = $gType;
                $v['grant_type_label'] = ($gType === 'schedule') ? '⏰ جدولة آلية' : (($gType === 'pos_reward') ? '🏪 مكافأة مبيعات' : '🎁 منح فوري');

                // Expired determination
                $isExpired = false;
                if (($v['status'] ?? '') === 'expired') {
                    $isExpired = true;
                } elseif (!empty($v['expires_at']) && strtotime($v['expires_at']) <= $nowTime) {
                    $isExpired = true;
                } elseif (!empty($v['transfer_limit']) && (float)$v['transfer_limit'] > 0 && $totalBytes >= (float)$v['transfer_limit']) {
                    $isExpired = true;
                } elseif (!empty($v['uptime_limit']) && (int)$v['uptime_limit'] > 0 && $totalUptime >= (int)$v['uptime_limit']) {
                    $isExpired = true;
                }
                $v['is_expired'] = $isExpired ? 1 : 0;
            }
            unset($v);
        }

        return ['success' => true, 'free_vouchers' => $vouchers];
    }

    // ==========================================
    // METHOD: saveFreeVouchersSchedule
    // ==========================================
    public function saveFreeVouchersSchedule($data) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "إضافة / تعديل جدولة كروت مجانية");
        $scheduleId = (int)($data['id'] ?? 0);
        $networkId = !empty($data['network_id']) ? (int)$data['network_id'] : 0;
        if ($networkId <= 0 && $scheduleId > 0) {
            $chkRow = $this->db->prepare("SELECT network_id FROM um_free_vouchers_quota WHERE id = ?");
            $chkRow->execute([$scheduleId]);
            $networkId = (int)$chkRow->fetchColumn();
        }
        if ($networkId <= 0) {
            $networkId = $this->getActiveNetworkId();
        }

        $adminId = (int)($data['admin_id'] ?? 0);
        $profile = trim($data['profile_name'] ?? '');
        $type = in_array($data['schedule_type'] ?? '', ['weekly', 'monthly', 'yearly', 'custom_days']) ? $data['schedule_type'] : 'monthly';
        $startDate = !empty($data['start_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['start_date']) ? $data['start_date'] : date('Y-m-d');
        $phone = normalizeYemenPhone(trim($data['phone'] ?? ''));
        $method = in_array($data['send_method'] ?? '', ['whatsapp', 'sms', 'both', 'none']) ? $data['send_method'] : 'whatsapp';
        $notes = trim($data['notes'] ?? '');
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $createdBy = (int)($_SESSION['admin_id'] ?? 1);

        if ($adminId <= 0 || empty($profile)) {
            return ['error' => 'يرجى اختيار المستفيد والباقة المحددة'];
        }

        // Notes is optional
        if (empty($notes)) {
            $notes = 'جدولة كروت مجانية دورية';
        }

        // Uniqueness check: Prevent duplicate recipient in this network by updating existing if present
        if ($scheduleId > 0) {
            $chkDup = $this->db->prepare("SELECT id FROM um_free_vouchers_quota WHERE network_id=? AND admin_id=? AND id != ? LIMIT 1");
            $chkDup->execute([$networkId, $adminId, $scheduleId]);
            $dupId = (int)$chkDup->fetchColumn();
            if ($dupId > 0) {
                $scheduleId = $dupId;
            }
        } else {
            $chkDup = $this->db->prepare("SELECT id FROM um_free_vouchers_quota WHERE network_id=? AND admin_id=? LIMIT 1");
            $chkDup->execute([$networkId, $adminId]);
            $dupId = (int)$chkDup->fetchColumn();
            if ($dupId > 0) {
                $scheduleId = $dupId;
            }
        }

        // Validate Profile and enforce card count limits based on profile transfer_limit
        $chkP = $this->db->prepare("SELECT price, transfer_limit, validity, uptime_limit, rate_limit, name_for_users FROM um_profiles_def WHERE network_id=? AND name COLLATE utf8mb4_unicode_ci = ?");
        $chkP->execute([$networkId, $profile]);
        $pRow = $chkP->fetch(PDO::FETCH_ASSOC);
        if (!$pRow) {
            return ['error' => 'الباقة المحددة غير موجودة في الشبكة الحالية'];
        }

        $limitBytes = (int)($pRow['transfer_limit'] ?? 0);
        $isSmall = ($limitBytes > 0 && $limitBytes < 10737418240); // Less than 10GB
        $maxAllowedCards = $isSmall ? 4 : 1;
        $requestedCards = (int)($data['cards_count'] ?? 1);
        $cardsCount = max(1, min($maxAllowedCards, $requestedCards));

        $intervalDays = 30;
        if ($type === 'weekly') $intervalDays = 7;
        elseif ($type === 'yearly') $intervalDays = 365;
        elseif ($type === 'custom_days') $intervalDays = max(1, (int)($data['interval_days'] ?? 10));

        // Get admin info
        try { $adminUser = $this->getAdminById($adminId, $networkId); } catch (Throwable $e) { $adminUser = false; }
        if (!$adminUser) return ['error' => 'المستخدم المستفيد غير موجود في الشبكة'];
        if (empty($phone) && !empty($adminUser['phone'])) $phone = $adminUser['phone'];
        $roleKey = $adminUser['role'];

        if ($scheduleId > 0) {
            $oldSchedStmt = $this->db->prepare("SELECT * FROM um_free_vouchers_quota WHERE network_id=? AND id=?");
            $oldSchedStmt->execute([$networkId, $scheduleId]);
            $oldSched = $oldSchedStmt->fetch(PDO::FETCH_ASSOC);
            $oldProfileName = $oldSched['profile_name'] ?? '';
            $isProfileChanged = ($oldSched && $oldProfileName !== $profile);

            $stmt = $this->db->prepare("
                UPDATE um_free_vouchers_quota 
                SET admin_id = ?, role_key = ?, monthly_cards_quota = ?, profile_name = ?, schedule_type = ?, 
                    interval_days = ?, cards_count = ?, phone = ?, send_method = ?, 
                    is_active = ?, notes = ?
                WHERE network_id = ? AND id = ?
            ");
            $stmt->execute([$adminId, $roleKey, $cardsCount, $profile, $type, $intervalDays, $cardsCount, $phone, $method, $isActive, $notes, $networkId, $scheduleId]);

            // When package profile is changed in the schedule, at the next scheduled dispatch date, 
            // a new free card with this newly chosen package will be generated and dispatched with a notification to the recipient.
            $updatedVouchers = [];
            if ($isProfileChanged) {
                $vStmt = $this->db->prepare("
                    SELECT m.* 
                    FROM um_vouchers_meta m
                    WHERE m.network_id = ? 
                      AND m.free_recipient_id = ? 
                      AND m.is_free_quota = 1 
                      AND m.status = 'active'
                      AND (m.expires_at IS NULL OR m.expires_at > NOW())
                    ORDER BY m.id DESC
                ");
                $vStmt->execute([$networkId, $adminId]);
                $activeVouchers = $vStmt->fetchAll(PDO::FETCH_ASSOC);

                $newRateLimit = $pRow['rate_limit'] ?? '';
                $newValidity = $pRow['validity'] ?? '30d';

                foreach ($activeVouchers as $av) {
                    $uCode = $av['username'];
                    $updatedVouchers[] = $uCode;

                    // 1. Update um_vouchers_meta without zeroing radacct or session data
                    $this->db->prepare("
                        UPDATE um_vouchers_meta 
                        SET profile_name = ?, validity = ? 
                        WHERE network_id = ? AND username = ?
                    ")->execute([$profile, $newValidity, $networkId, $uCode]);

                    // 2. Update radusergroup
                    $this->db->prepare("
                        UPDATE radusergroup 
                        SET groupname = ? 
                        WHERE network_id = ? AND username = ?
                    ")->execute([$profile, $networkId, $uCode]);

                    // 3. Update Mikrotik-Rate-Limit in radreply if profile has rate_limit
                    $this->db->prepare("DELETE FROM radreply WHERE network_id=? AND username=? AND attribute='Mikrotik-Rate-Limit'")->execute([$networkId, $uCode]);
                    if (!empty($newRateLimit)) {
                        $this->db->prepare("INSERT INTO radreply (network_id, username, attribute, op, value) VALUES (?, ?, 'Mikrotik-Rate-Limit', ':=', ?)")->execute([$networkId, $uCode, $newRateLimit]);
                    }
                }

                // Send profile modification message to recipient
                $recipName = $adminUser['fullname'] ?? 'عزيزنا المشترك';
                $profileLabel = $pRow['name_for_users'] ?: $profile;
                $cardsStr = !empty($updatedVouchers) ? implode(', ', $updatedVouchers) : '';
                $cleanPhone = !empty($phone) ? WhatsAppService::normalizePhone($phone) : '';

                $notifMsg = "مرحباً *{$recipName}* 🌸\nتم تحديث باقة اشتراكك المجاني بنجاح إلى:\n🎁 *{$profileLabel}*\n" . (!empty($cardsStr) ? "💳 رقم الكرت: `{$cardsStr}`\n" : "") . "نتمنى لك تجربة ممتعة وسريعة 🚀";

                if (!empty($cleanPhone)) {
                    if (in_array($method, ['whatsapp', 'both'])) {
                        try {
                            $waService = $this->getNotificationService()->getWhatsAppService();
                            $waService->sendMessage($cleanPhone, $notifMsg, 'schedule_change_' . $scheduleId, $createdBy);
                        } catch (Throwable $e) {}
                    }
                    if (in_array($method, ['sms', 'both'])) {
                        try {
                            $this->sendSmsGateway($cleanPhone, $notifMsg);
                        } catch (Throwable $e) {}
                    }
                }
            }

            return [
                'success' => true, 
                'message' => 'تم تعديل وتحديث جدولة الكروت بنجاح 🚀 (سيتم إصدار وإرسال الكرت بالباقة المختارة تلقائياً في موعد الإرسال القادم)',
                'profile_changed' => $isProfileChanged,
                'updated_cards' => $updatedVouchers
            ];
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_free_vouchers_quota 
                (network_id, admin_id, role_key, monthly_cards_quota, profile_name, schedule_type, start_date, interval_days, cards_count, phone, send_method, next_dispatch_date, is_active, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$networkId, $adminId, $roleKey, $cardsCount, $profile, $type, $startDate, $intervalDays, $cardsCount, $phone, $method, $startDate, $isActive, $notes, $createdBy]);
        }
    }

    public function toggleFreeVoucherSchedule(int $id, ?int $isActive = null) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "تعديل حالة الجدولة الدورية");
        $networkId = $this->getActiveNetworkId();
        if ($id <= 0) return ['error' => 'معرف الجدولة غير صالح'];
        if ($isActive === null) {
            $stmt = $this->db->prepare("UPDATE um_free_vouchers_quota SET is_active = IF(is_active=1, 0, 1) WHERE network_id=? AND id=?");
            $stmt->execute([$networkId, $id]);
        } else {
            $stmt = $this->db->prepare("UPDATE um_free_vouchers_quota SET is_active = ? WHERE network_id=? AND id=?");
            $stmt->execute([(int)$isActive, $networkId, $id]);
        }
        return ['success' => true, 'message' => 'تم تغيير حالة الجدولة بنجاح'];
    }

    public function deleteFreeVoucherSchedule(int $id) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "حذف جدولة كروت دورية");
        $networkId = $this->getActiveNetworkId();
        if ($id <= 0) return ['error' => 'معرف الجدولة غير صالح'];
        $stmt = $this->db->prepare("DELETE FROM um_free_vouchers_quota WHERE network_id=? AND id=?");
        $stmt->execute([$networkId, $id]);
        return ['success' => true, 'message' => 'تم حذف الجدولة الدورية بنجاح'];
    }

    // ==========================================
    // METHOD: dispatchScheduledFreeVouchers
    // ==========================================
    public function dispatchScheduledFreeVouchers() {
        $this->enforcePermission(["free_vouchers_schedule_run", "free_vouchers"], "تنفيذ الجدولة الدورية للكروت المجانية");
        $networkId = $this->getActiveNetworkId();
        $stmt = $this->db->prepare("
            SELECT q.*, a.fullname, a.username AS admin_username,
                   COALESCE(p.name_for_users, q.profile_name) AS profile_label
            FROM um_free_vouchers_quota q
            JOIN um_admins a ON q.admin_id = a.id
            LEFT JOIN um_profiles_def p ON p.network_id = q.network_id AND p.name COLLATE utf8mb4_unicode_ci = q.profile_name COLLATE utf8mb4_unicode_ci
            WHERE q.network_id=? AND q.is_active = 1 AND (q.next_dispatch_date IS NULL OR q.next_dispatch_date <= CURDATE())
        ");
        $stmt->execute([$networkId]);
        $dueQuotas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $dispatched = [];
        foreach ($dueQuotas as $q) {
            $grantRes = $this->grantFreeVouchers([
                'recipient_id' => $q['admin_id'],
                'profile_name' => $q['profile_name'],
                'count' => $q['cards_count'],
                'phone' => $q['phone'],
                'notes' => (!empty($q['notes']) ? $q['notes'] . ' - ' : '') . 'توليد آلي مجدول (' . $q['schedule_type'] . ')',
                'grant_type' => 'schedule',
                'force_override' => true
            ]);
            if (!empty($grantRes['success'])) {
                // Calculate next dispatch
                $interval = (int)$q['interval_days'];
                if ($interval < 1) $interval = 30;
                $upd = $this->db->prepare("
                    UPDATE um_free_vouchers_quota 
                    SET last_dispatched_at = NOW(), next_dispatch_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
                    WHERE network_id=? AND id = ?
                ");
                $upd->execute([$interval, $networkId, $q['id']]);

                // Format dispatched summary
                $cardsList = implode(', ', $grantRes['cards'] ?? []);
                $dispatched[] = [
                    'recipient' => $q['fullname'],
                    'phone' => $q['phone'],
                    'cards' => $grantRes['cards'],
                    'profile' => $q['profile_name'],
                    'profile_label' => $q['profile_label']
                ];
                // Attempt SMS if enabled
                if (in_array($q['send_method'], ['sms', 'both']) && !empty($q['phone'])) {
                    $smsText = "تم تخصيص كروت مجانية لحسابك: " . $cardsList . " باقة: " . ($q['profile_label'] ?: $q['profile_name']);
                    $this->sendSmsGateway($q['phone'], $smsText);
                }
            }
        }
        return ['success' => true, 'dispatched_count' => count($dispatched), 'items' => $dispatched];
    }

    // ==========================================
    // METHOD: getFreeVouchersAnalytics
    // ==========================================
    public function getFreeVouchersAnalytics($adminId = 0, $role = 'superadmin', $dataScope = 'own') {
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $callerId = $adminId ?: (int)$ctx['id'];
        $callerRole = $role ?: (string)$ctx['role'];
        $scope = $dataScope ?: (string)$ctx['data_scope'];
        $scopeFilter = "";
        if (!in_array($callerRole, ['system_owner', 'superadmin'], true)) {
            $cId = (int)$callerId;
            if ($scope === 'assigned') {
                $delegated = array_merge([$cId], $ctx['delegated_ids'] ?: []);
                $cleanIds = array_filter(array_map('intval', $delegated));
                $placeholders = !empty($cleanIds) ? implode(',', $cleanIds) : (string)$cId;
                $scopeFilter = " AND (m.free_recipient_id IN ($placeholders) OR m.owner_admin_id IN ($placeholders)) ";
            } else {
                $scopeFilter = " AND (m.free_recipient_id = $cId OR m.owner_admin_id = $cId) ";
            }
        }
        $netIdInt = (int)$networkId;
        // 1. By Profile (Fast grouped query with pre-filtered radacct join)
        $sqlProfiles = "
            SELECT 
                m.profile_name,
                COALESCE(p.name_for_users, m.profile_name) AS profile_label,
                COUNT(m.id) AS total_cards,
                COUNT(CASE WHEN m.status = 'active' THEN 1 END) AS active_cards,
                ROUND(COALESCE(SUM(ra.octets), 0) / (1024 * 1024), 2) AS total_consumed_mb,
                ROUND(COALESCE(SUM(ra.octets), 0) / (1024 * 1024 * 1024), 2) AS total_consumed_gb,
                ROUND(COUNT(m.id) * COALESCE(NULLIF(p.price, 0), 500), 2) AS estimated_cost
            FROM um_vouchers_meta m
            LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
            LEFT JOIN (
                SELECT ra.username, SUM(ra.acctinputoctets + ra.acctoutputoctets) AS octets
                FROM radacct ra
                JOIN um_vouchers_meta vm ON vm.username = ra.username AND vm.network_id = ra.network_id
                WHERE ra.network_id = $netIdInt AND vm.is_free_quota = 1
                GROUP BY ra.username
            ) ra ON ra.username = m.username
            WHERE m.network_id=$netIdInt AND m.is_free_quota = 1 $scopeFilter
            GROUP BY m.profile_name
            ORDER BY total_consumed_mb DESC
        ";
        $stmtP = $this->db->query($sqlProfiles);
        $profiles = $stmtP ? $stmtP->fetchAll(PDO::FETCH_ASSOC) : [];

        // 2. By Recipient
        $sqlRecipients = "
            SELECT 
                adm.id AS admin_id,
                adm.fullname,
                adm.role,
                COALESCE(r.role_name_ar, adm.role) AS role_name_ar,
                adm.phone,
                COUNT(m.id) AS total_free_cards,
                ROUND(COALESCE(SUM(ra.octets), 0) / (1024 * 1024), 2) AS free_consumed_mb,
                ROUND(COALESCE(SUM(ra.octets), 0) / (1024 * 1024) * 0.5, 2) AS free_consumed_cost,
                nn.node_name AS linked_node_name,
                nn.node_type AS linked_node_type,
                nn.nas_ip AS linked_nas_ip,
                nn.nas_port_id AS linked_port_id,
                0 AS node_commercial_sales
            FROM um_admins adm
            JOIN um_vouchers_meta m ON m.network_id=$netIdInt AND m.free_recipient_id = adm.id
            LEFT JOIN (
                SELECT ra.username, SUM(ra.acctinputoctets + ra.acctoutputoctets) AS octets
                FROM radacct ra
                JOIN um_vouchers_meta vm ON vm.username = ra.username AND vm.network_id = ra.network_id
                WHERE ra.network_id = $netIdInt AND vm.is_free_quota = 1
                GROUP BY ra.username
            ) ra ON ra.username = m.username
            LEFT JOIN um_roles_def r ON adm.role = r.role_key
            LEFT JOIN um_network_nodes nn ON nn.network_id = $netIdInt AND nn.responsible_admin_id = adm.id
            WHERE m.is_free_quota = 1 $scopeFilter
            GROUP BY adm.id
            ORDER BY free_consumed_mb DESC
        ";
        $stmtR = $this->db->query($sqlRecipients);
        $recipients = $stmtR ? $stmtR->fetchAll(PDO::FETCH_ASSOC) : [];
        foreach ($recipients as &$rcp) {
            $cost = (float)$rcp['free_consumed_cost'];
            $sales = (float)$rcp['node_commercial_sales'];
            $rcp['free_to_sales_ratio'] = ($sales > 0) ? round(($cost / $sales) * 100, 1) : ($cost > 0 ? 100 : 0);
        }
        unset($rcp);
        return [
            'success' => true,
            'profiles' => $profiles,
            'recipients' => $recipients
        ];
    }
    // ==========================================
    // ==========================================
    // 10. SUBSCRIBER PORTAL: SPEED & DEVICE CONTROL
    // ==========================================

    // ==========================================
    // METHOD: sendSmsGateway
    // ==========================================
    public function sendSmsGateway($phone, $message) {
        $enabled = (int)($this->db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'sms_enabled'")->fetchColumn() ?: 0);
        if (!$enabled) return ['error' => 'خدمة رسائل SMS غير مفعلة'];
        $urlTpl = trim($this->db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'sms_gateway_url'")->fetchColumn() ?: '');
        if (empty($urlTpl)) return ['error' => 'رابط بوابة SMS غير محدد'];
        $phone = preg_replace('/[^0-9]/', '', $phone);
        $encodedMsg = urlencode($message);
        $targetUrl = str_replace(['{phone}', '{message}'], [$phone, $encodedMsg], $urlTpl);
        $method = strtoupper($this->db->query("SELECT setting_value FROM um_settings WHERE setting_key = 'sms_gateway_method'")->fetchColumn() ?: 'GET');
        try {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $targetUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            if ($method === 'POST') curl_setopt($ch, CURLOPT_POST, true);
            $res = curl_exec($ch);
            curl_close($ch);
            return ['success' => true, 'raw' => $res];
        } catch (Throwable $e) {
            return ['error' => $e->getMessage()];
        }
    }

    // ==========================================
    // METHOD: getSubscriberCardInfo
    // ==========================================
    private function bindSubscriberNetwork(string $code): int {
        $arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        $standardDigits = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
        $code = str_replace($arabicDigits, $standardDigits, $code);
        $code = trim(preg_replace('/^#+/','', $code));
        if ($code === '') return 0;
        $requestedNetworkId=(int)($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($_GET['network_id'] ?? ($_POST['network_id'] ?? 0)));
        if($requestedNetworkId>0){
            $stmt=$this->db->prepare("SELECT network_id FROM um_vouchers_meta WHERE network_id=? AND username=? UNION SELECT network_id FROM radcheck WHERE network_id=? AND username=? LIMIT 1");
            $stmt->execute([$requestedNetworkId,$code,$requestedNetworkId,$code]);
            $networkId=(int)$stmt->fetchColumn();
        }else{
            $stmt=$this->db->prepare("SELECT network_id FROM um_vouchers_meta WHERE username=? UNION SELECT network_id FROM radcheck WHERE username=?");
            $stmt->execute([$code,$code]);
            $networkIds=array_values(array_unique(array_map('intval',$stmt->fetchAll(PDO::FETCH_COLUMN))));
            if(count($networkIds)>1)return -1;
            $networkId=(int)($networkIds[0]??0);
        }
        if($networkId<=0)return 0;
        $_SERVER['HTTP_X_SAM_NETWORK_ID']=(string)$networkId;
        $_SESSION['active_network_id']=$networkId;
        $this->db->exec("SET @sam_active_network_id=".$networkId);
        return $networkId;
    }

    public function getSubscriberCardInfo($code) {
        $code = trim($code);
        if (empty($code)) return ['error' => 'يرجى إدخال رقم الكرت'];
        $networkId=$this->bindSubscriberNetwork($code);
        if($networkId===-1)return ['error'=>'NETWORK_CONTEXT_REQUIRED','message'=>'هذا الرقم موجود في أكثر من شبكة؛ اختر الشبكة أولاً'];
        if($networkId<=0)return ['error'=>'عذراً، رقم الكرت غير موجود في النظام'];
        $user = $this->getUserUsageDetails($code);
        if (!$user) {
            $stmt = $this->db->prepare("SELECT username FROM radcheck WHERE network_id=? AND username = ? LIMIT 1");
            $stmt->execute([$networkId,$code]);
            $u = $stmt->fetchColumn();
            if ($u) {
                $user = $this->getUserUsageDetails($u);
            }
        }
        if (!$user) {
            return ['error' => 'عذراً، رقم الكرت غير موجود في النظام'];
        }
        $now = new DateTime();
        $isExpired = false;
        $expFormatted = 'يبدأ عند أول استخدام';
        $remTimeStr = 'غير محدد';
        if (!empty($user['expires_at'])) {
            $expDate = new DateTime($user['expires_at']);
            $expFormatted = $expDate->format('Y-m-d h:i A');
            if ($now >= $expDate) {
                $isExpired = true;
                $remTimeStr = 'منتهي الصلاحية';
            } else {
                $diff = $now->diff($expDate);
                $remTimeStr = $diff->format('%a يوم و %h ساعة و %i دقيقة');
                if ($diff->days == 0 && $diff->h == 0) {
                    $remTimeStr = $diff->i . ' دقيقة';
                }
            }
        }
        $isQuotaDepleted = ($user['remaining_bytes'] !== null && $user['remaining_bytes'] <= 0);
        return [
            'success' => true,
            'username' => $user['username'],
            'profile_name' => $user['profile_name'] ?? 'باقة إنترنت',
            'validity' => $user['validity'] ?? $user['profile_validity'] ?? '30d',
            'rate_limit' => $user['rate_limit'] ?: 'سرعة مفتوحة',
            'transfer_limit' => $user['transfer_limit'],
            'remaining_bytes' => $user['remaining_bytes'],
            'total_bytes' => $user['total_bytes'],
            'quota_percent' => $user['quota_percent'],
            'total_download' => $user['total_download'],
            'total_upload' => $user['total_upload'],
            'total_uptime' => $user['total_uptime'],
            'first_login' => $user['first_login'] ?: 'لم يستخدم بعد',
            'expires_at' => $expFormatted,
            'rem_time_str' => $remTimeStr,
            'is_expired' => $isExpired,
            'is_depleted' => $isQuotaDepleted,
            'is_online' => $user['is_online']
        ];
    }
    // ==========================================
    // DISTRIBUTOR / RESELLER PORTAL API
    // ==========================================

    // ==========================================
    // METHOD: subscriberGetCardStatus
    // ==========================================
    public function subscriberGetCardStatus($code) {
        $this->ensureSubscriberMacLockSchema();
        $code = trim((string)$code);
        // Normalize Arabic-Indic and Persian digits to Western digits
        $arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        $standardDigits = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
        $code = str_replace($arabicDigits, $standardDigits, $code);
        $code = trim(preg_replace('/^#+/','', $code));

        if (empty($code) || str_starts_with($code, '$') || str_contains($code, '$(') || str_contains($code, ')') || strtolower($code) === 'username') {
            $code = '';
        }

        if (empty($code)) {
            $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
            if (!empty($clientIp)) {
                $ips = explode(',', $clientIp);
                $clientIp = trim($ips[0]);
                $st = $this->db->prepare("SELECT username FROM radacct WHERE (framedipaddress = ? OR callingstationid = ?) AND acctstoptime IS NULL ORDER BY radacctid DESC LIMIT 1");
                $st->execute([$clientIp, $clientIp]);
                $foundUser = (string)$st->fetchColumn();
                if ($foundUser !== '') {
                    $code = $foundUser;
                }
            }
        }

        if (empty($code)) return ['success' => false, 'error' => 'يرجى إدخال رقم الكرت'];
        $networkId=$this->bindSubscriberNetwork($code);
        if($networkId===-1)return ['success'=>false,'error'=>'NETWORK_CONTEXT_REQUIRED','message'=>'هذا الرقم موجود في أكثر من شبكة؛ اختر الشبكة أولاً'];
        if($networkId<=0)return ['success'=>false,'error'=>'رقم الكرت غير موجود'];
        $stmt = $this->db->prepare("
            SELECT m.*, 
                   p.name_for_users,
                   p.transfer_limit,
                   p.uptime_limit,
                   p.validity AS profile_validity,
                   p.shared_users AS profile_shared_users,
                   p.allow_speed_change,
                   p.default_speed,
                   p.max_speed,
                   m.mac_lock_enabled,
                   m.locked_mac,
                   (SELECT value FROM radgroupreply WHERE network_id=m.network_id AND groupname = m.profile_name AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1) AS profile_rate_limit,
                   (SELECT value FROM radreply WHERE network_id=m.network_id AND username = m.username AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1) AS user_custom_rate_limit,
                   (SELECT value FROM radcheck WHERE network_id=m.network_id AND username = m.username AND attribute = 'Simultaneous-Use' LIMIT 1) AS custom_simultaneous_use,
                   (SELECT COUNT(*) FROM radacct WHERE network_id=m.network_id AND username = m.username AND acctstoptime IS NULL) AS active_sessions_count,
                   COALESCE((SELECT SUM(acctinputoctets + acctoutputoctets) FROM radacct WHERE network_id=m.network_id AND username = m.username), 0) AS total_consumed_bytes,
                   COALESCE((SELECT SUM(CASE WHEN acctstoptime IS NULL THEN TIMESTAMPDIFF(SECOND, acctstarttime, NOW()) ELSE acctsessiontime END) FROM radacct WHERE network_id=m.network_id AND username = m.username), 0) AS total_uptime_seconds
            FROM um_vouchers_meta m
            LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND m.profile_name = p.name
            WHERE m.network_id=? AND m.username = ?
            LIMIT 1
        ");
        $stmt->execute([$networkId,$code]);
        $card = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$card) {
            $rc = $this->db->prepare("
                SELECT r.username,
                       r.network_id,
                       (SELECT groupname FROM radusergroup WHERE network_id=r.network_id AND username = r.username LIMIT 1) AS profile_name,
                       (SELECT COUNT(*) FROM radacct WHERE network_id=r.network_id AND username = r.username AND acctstoptime IS NULL) AS active_sessions_count,
                       COALESCE((SELECT SUM(acctinputoctets + acctoutputoctets) FROM radacct WHERE network_id=r.network_id AND username = r.username), 0) AS total_consumed_bytes,
                       COALESCE((SELECT SUM(CASE WHEN acctstoptime IS NULL THEN TIMESTAMPDIFF(SECOND, acctstarttime, NOW()) ELSE acctsessiontime END) FROM radacct WHERE network_id=r.network_id AND username = r.username), 0) AS total_uptime_seconds
                FROM radcheck r 
                WHERE r.network_id=? AND r.username = ? 
                LIMIT 1
            ");
            $rc->execute([$networkId,$code]);
            $radUser = $rc->fetch(PDO::FETCH_ASSOC);
            if ($radUser) {
                $profName = $radUser['profile_name'] ?: 'افتراضي';
                $pStmt = $this->db->prepare("SELECT * FROM um_profiles_def WHERE network_id=? AND name = ? LIMIT 1");
                $pStmt->execute([$networkId,$profName]);
                $pDef = $pStmt->fetch(PDO::FETCH_ASSOC) ?: [];

                $consumedBytes = (float)$radUser['total_consumed_bytes'];
                $transferLimit = (float)($pDef['transfer_limit'] ?? 0);
                $remainingBytes = max(0, $transferLimit - $consumedBytes);

                return [
                    'success' => true,
                    'card' => [
                        'username' => $code,
                        'network_id' => $networkId,
                        'status' => 'active',
                        'profile_name' => $profName,
                        'name_for_users' => $pDef['name_for_users'] ?? $profName,
                        'transfer_limit' => $transferLimit,
                        'total_consumed_mb' => round($consumedBytes / (1024 * 1024), 2),
                        'remaining_mb' => ($transferLimit > 0) ? round($remainingBytes / (1024 * 1024), 2) : 'غير محدود',
                        'remaining_percent' => ($transferLimit > 0) ? max(0, min(100, round(($remainingBytes / $transferLimit) * 100, 1))) : 100,
                        'active_sessions_count' => (int)$radUser['active_sessions_count'],
                        'allow_speed_change' => (int)($pDef['allow_speed_change'] ?? 0),
                        'max_shared_users' => (int)($pDef['shared_users'] ?? 1),
                        'current_allowed_devices' => (int)($pDef['shared_users'] ?? 1),
                        'effective_speed' => $pDef['rate_limit'] ?? ($pDef['default_speed'] ?? '2M/2M'),
                        'available_speeds' => $this->getSpeedTiers(true),
                        'validity' => $pDef['validity'] ?? '',
                        'mac_lock_enabled' => 0,
                        'locked_mac' => null
                    ]
                ];
            }
            return ['success' => false, 'error' => 'رقم الكرت غير موجود'];
        }
        // Old cards may not have their own validity in metadata; use their package.
        $card['effective_validity'] = trim((string)($card['validity'] ?: ($card['profile_validity'] ?: '')));
        $card['uptime_limit_seconds'] = max(0, (int)($card['uptime_limit'] ?? 0));
        $card['remaining_uptime_seconds'] = $card['uptime_limit_seconds'] > 0 ? max(0, $card['uptime_limit_seconds'] - (int)$card['total_uptime_seconds']) : null;
        $consumedBytes = (float)$card['total_consumed_bytes'];
        $transferLimit = (float)$card['transfer_limit'];
        $remainingBytes = max(0, $transferLimit - $consumedBytes);
        $card['total_consumed_mb'] = round($consumedBytes / (1024 * 1024), 2);
        $card['remaining_mb'] = ($transferLimit > 0) ? round($remainingBytes / (1024 * 1024), 2) : 'غير محدود';
        $card['remaining_percent'] = ($transferLimit > 0) ? max(0, min(100, round(($remainingBytes / $transferLimit) * 100, 1))) : 100;
        $effectiveSpeed = $card['user_custom_rate_limit'] ?: ($card['custom_speed'] ?: ($card['profile_rate_limit'] ?: ($card['default_speed'] ?: '2M/2M')));
        $card['effective_speed'] = $effectiveSpeed;
        $maxProfileUsers = (int)($card['profile_shared_users'] ?: 1);
        $card['max_shared_users'] = $maxProfileUsers;
        $currentAllowed = !empty($card['custom_simultaneous_use']) ? (int)$card['custom_simultaneous_use'] : (!empty($card['max_devices']) ? (int)$card['max_devices'] : $maxProfileUsers);
        $card['current_allowed_devices'] = min($currentAllowed, $maxProfileUsers);
        $allowChange = (int)($card['allow_speed_change'] ?? 0);
        $card['allow_speed_change'] = $allowChange;
        // Parse max_speed mbps
        $maxSpeedStr = $card['max_speed'] ?: ($card['profile_rate_limit'] ?: '2M/2M');
        $card['max_speed_str'] = $maxSpeedStr;
        $maxMbps = 2;
        if (preg_match('/^([0-9]+)M/i', $maxSpeedStr, $m)) {
            $maxMbps = (int)$m[1];
        } elseif (preg_match('/^([0-9]+)k/i', $maxSpeedStr, $k)) {
            $maxMbps = max(1, round((int)$k[1] / 1024));
        }
        $allTiers = $this->getSpeedTiers(true);
        $availableTiers = [];
        if ($allowChange === 1) {
            foreach ($allTiers as $tier) {
                if ($tier['mbps'] <= $maxMbps) {
                    $availableTiers[] = $tier;
                }
            }
        }
        $card['available_speeds'] = $availableTiers;
        return ['success' => true, 'card' => $card];
    }

    // ==========================================
    // METHOD: subscriberChangeSpeed
    // ==========================================
    public function subscriberChangeSpeed($code, $requestedSpeed) {
        $code = trim($code);
        $requestedSpeed = trim($requestedSpeed);
        $statusRes = $this->subscriberGetCardStatus($code);
        if (empty($statusRes['success'])) return $statusRes;
        $card = $statusRes['card'];
        $networkId=(int)$card['network_id'];
        if (empty($card['allow_speed_change'])) {
            return ['success' => false, 'error' => 'عذراً، هذه الباقة لا تتيح تغيير السرعة (السرعة محددة بالباقة ولا يمكن تعديلها)'];
        }

        // Handle aliases
        if ($requestedSpeed === 'eco') $requestedSpeed = '1M/1M';
        if ($requestedSpeed === 'normal') $requestedSpeed = $card['default_speed'] ?: ($card['profile_rate_limit'] ?: '2M/2M');
        if ($requestedSpeed === 'boost') $requestedSpeed = $card['max_speed'] ?: '10M/10M';

        $allTiers = $this->getSpeedTiers(true);
        $targetTier = null;
        foreach ($allTiers as $t) {
            if (strcasecmp($t['key'], $requestedSpeed) === 0 || strcasecmp($t['rate'], $requestedSpeed) === 0 || strcasecmp($t['label'], $requestedSpeed) === 0) {
                $targetTier = $t;
                break;
            }
        }
        // Check if numeric mbps requested or single rate like "2M" -> "2M/2M"
        if (!$targetTier && is_numeric($requestedSpeed)) {
            $mbps = (int)$requestedSpeed;
            foreach ($allTiers as $t) {
                if ($t['mbps'] === $mbps) {
                    $targetTier = $t;
                    break;
                }
            }
            if (!$targetTier) {
                $targetTier = ['key' => "{$mbps}M/{$mbps}M", 'rate' => "{$mbps}M/{$mbps}M", 'mbps' => $mbps, 'label' => "{$mbps} Mbps"];
            }
        }
        if (!$targetTier && preg_match('/^\d+(?:\.\d+)?[KMG]$/i', $requestedSpeed)) {
            $r = strtoupper($requestedSpeed);
            $targetTier = ['key' => "{$r}/{$r}", 'rate' => "{$r}/{$r}", 'mbps' => (int)$r, 'label' => "{$r}"];
        } elseif (!$targetTier && preg_match('/^\d+(?:\.\d+)?[KMG]\/\d+(?:\.\d+)?[KMG]$/i', $requestedSpeed)) {
            $r = strtoupper($requestedSpeed);
            $mbps = (int)preg_replace('/[^0-9]/', '', explode('/', $r)[0] ?? '2');
            $targetTier = ['key' => $r, 'rate' => $r, 'mbps' => $mbps, 'label' => $r];
        }

        if (!$targetTier) {
            return ['success' => false, 'error' => 'السرعة المحددة غير معروفة. يرجى اختيار سرعة من القائمة المتاحة'];
        }
        // Check against max_speed
        $maxSpeedStr = $card['max_speed_str'] ?? '2M/2M';
        $maxMbps = 1000;
        if (preg_match('/^([0-9]+)M/i', $maxSpeedStr, $m)) {
            $maxMbps = (int)$m[1];
        }
        if ($targetTier['mbps'] > $maxMbps && $maxMbps > 0) {
            return ['success' => false, 'error' => 'السرعة المطلوبة (' . $targetTier['label'] . ') تتجاوز أقصى سرعة مسموحة لباقاتك (' . $maxSpeedStr . ')'];
        }
        $newSpeedRate = $targetTier['rate'];
        // Update radreply
        $this->db->prepare("DELETE FROM radreply WHERE network_id=? AND username = ? AND attribute = 'Mikrotik-Rate-Limit'")->execute([$networkId,$code]);
        $ins = $this->db->prepare("INSERT INTO radreply (network_id,username, attribute, op, value) VALUES (?, ?, 'Mikrotik-Rate-Limit', ':=', ?)");
        $ins->execute([$networkId,$code, $newSpeedRate]);
        // Update um_vouchers_meta
        $upd = $this->db->prepare("UPDATE um_vouchers_meta SET speed_mode = ?, custom_speed = ? WHERE network_id=? AND username = ?");
        $upd->execute([$targetTier['key'], $newSpeedRate,$networkId,$code]);
        // Send CoA if currently active
        $activeStmt = $this->db->prepare("
            SELECT a.nasipaddress, a.framedipaddress, a.acctsessionid, n.id AS nas_id, n.secret,
                   COALESCE(r.coa_port, 1700) AS coa_port
            FROM radacct a
            LEFT JOIN nas n ON n.network_id=a.network_id AND a.nasipaddress = n.nasname
            LEFT JOIN um_routers r ON r.network_id=a.network_id AND r.ip_address = a.nasipaddress
            WHERE a.network_id=? AND a.username = ? AND a.acctstoptime IS NULL
            LIMIT 1
        ");
        $activeStmt->execute([$networkId,$code]);
        $active = $activeStmt->fetch();
        $coaSucceeded = false;
        $sessionReconnected = false;
        if ($active && !empty($active['nasipaddress'])) {
            $nasIp = $active['nasipaddress'];
            $secret = $active['secret'] ?: '123456';
            $coaPort = (int)($active['coa_port'] ?: 1700);
            $framedIp = $active['framedipaddress'] ?: '';
            $coaPacket = 'User-Name = "' . $code . '"' . "\n";
            if (!empty($active['acctsessionid'])) $coaPacket .= 'Acct-Session-Id = "' . $active['acctsessionid'] . '"' . "\n";
            if (!empty($framedIp)) $coaPacket .= 'Framed-IP-Address = ' . $framedIp . "\n";
            $coaPacket .= 'Mikrotik-Rate-Limit := "' . $newSpeedRate . '"' . "\n";
            $cmd = 'echo ' . escapeshellarg($coaPacket) . ' | /usr/bin/radclient -r 2 -t 3 ' . escapeshellarg($nasIp . ':' . $coaPort) . ' coa ' . escapeshellarg($secret) . ' 2>&1';
            exec($cmd, $out, $ret);
            if ($ret === 0) $coaSucceeded = true;
            if (!$coaSucceeded && !empty($active['nas_id'])) {
                try {
                    $kick = $this->kickRouterHotspotUser((int)$active['nas_id'], $code);
                    $sessionReconnected = !empty($kick['success']);
                } catch (Throwable $e) {
                    $sessionReconnected = false;
                }
            }
        }
        return [
            'success' => true,
            'speed_tier' => $targetTier['key'],
            'effective_speed' => $newSpeedRate,
            'speed_label' => $targetTier['label'],
            'coa_sent' => !empty($active),
            'coa_success' => $coaSucceeded,
            'session_reconnected' => $sessionReconnected,
            'coa_port' => !empty($active) ? (int)($active['coa_port'] ?: 1700) : null,
            'message' => $sessionReconnected
                ? 'تم حفظ السرعة الجديدة وفصل الجلسة القديمة؛ ستُطبق السرعة عند إعادة اتصال الجهاز تلقائياً'
                : 'تم تغيير سرعة الكرت بنجاح إلى [' . $targetTier['label'] . ']'
        ];
    }

    // ==========================================
    // METHOD: subscriberSetMaxDevices
    // ==========================================
    public function subscriberSetMaxDevices($code, $devicesCount) {
        $code = trim($code);
        $devicesCount = (int)$devicesCount;
        if ($devicesCount < 1) {
            return ['error' => 'يجب أن يكون عدد الأجهزة المسموحة 1 على الأقل'];
        }
        $statusRes = $this->subscriberGetCardStatus($code);
        if (empty($statusRes['success'])) return $statusRes;
        $card = $statusRes['card'];
        $networkId=(int)$card['network_id'];
        $maxProfileUsers = (int)($card['max_shared_users'] ?: 1);
        if ($devicesCount > $maxProfileUsers) {
            return ['error' => 'عذراً، لا يمكنك تحديد عدد أجهزة (' . $devicesCount . ') يتجاوز الحد الأقصى المسموح به لباقاتك وهو (' . $maxProfileUsers . ') جهاز'];
        }
        // Insert or update radcheck for Simultaneous-Use
        $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username = ? AND attribute = 'Simultaneous-Use'")->execute([$networkId,$code]);
        $ins = $this->db->prepare("INSERT INTO radcheck (network_id,username, attribute, op, value) VALUES (?, ?, 'Simultaneous-Use', ':=', ?)");
        $ins->execute([$networkId,$code, (string)$devicesCount]);
        // Update um_vouchers_meta
        $this->db->prepare("UPDATE um_vouchers_meta SET max_devices = ? WHERE network_id=? AND username = ?")->execute([$devicesCount,$networkId,$code]);
        return [
            'success' => true,
            'allowed_devices' => $devicesCount,
            'max_allowed_by_profile' => $maxProfileUsers,
            'message' => 'تم تحديث عدد الأجهزة المتصلة المسموح بها إلى (' . $devicesCount . ') جهاز بنجاح'
        ];
    }

    // ==========================================
    // METHOD: subscriberSetMacLock
    // ==========================================
    public function subscriberSetMacLock($code, $enabled) {
        $this->ensureSubscriberMacLockSchema();
        $code = trim((string)$code);
        $enabled = (int)!!$enabled;
        $status = $this->subscriberGetCardStatus($code);
        if (empty($status['success'])) return $status;
        $networkId=(int)$status['card']['network_id'];
        if (!$enabled) {
            $this->db->beginTransaction();
            try {
                $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username=? AND attribute='Calling-Station-Id'")->execute([$networkId,$code]);
                $this->db->prepare("UPDATE um_vouchers_meta SET mac_lock_enabled=0,locked_mac=NULL WHERE network_id=? AND username=?")->execute([$networkId,$code]);
                $this->db->commit();
                return ['success'=>true,'enabled'=>false,'locked_mac'=>null,'message'=>'تم تعطيل تثبيت MAC وإزالة الماك المثبت من الكرت'];
            } catch (Throwable $e) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $e; }
        }
        $q=$this->db->prepare("SELECT callingstationid FROM radacct WHERE network_id=? AND username=? AND acctstoptime IS NULL AND callingstationid IS NOT NULL AND callingstationid<>'' ORDER BY acctstarttime ASC LIMIT 1");
        $q->execute([$networkId,$code]);
        $mac=strtoupper(trim((string)($q->fetchColumn() ?: '')));
        $this->db->beginTransaction();
        try {
            $this->db->prepare("UPDATE um_vouchers_meta SET mac_lock_enabled=1,locked_mac=? WHERE network_id=? AND username=?")->execute([$mac ?: null,$networkId,$code]);
            $this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username=? AND attribute='Calling-Station-Id'")->execute([$networkId,$code]);
            if ($mac !== '') $this->db->prepare("INSERT INTO radcheck(network_id,username,attribute,op,value) VALUES(?,?,'Calling-Station-Id','==',?)")->execute([$networkId,$code,$mac]);
            $this->db->commit();
            return ['success'=>true,'enabled'=>true,'locked_mac'=>$mac ?: null,'waiting_first_login'=>$mac==='', 'message'=>$mac!==''?'تم تفعيل تثبيت MAC وربط الكرت بالجهاز المتصل حاليًا':'تم تفعيل تثبيت MAC وسيُحفظ جهاز أول دخول تلقائيًا'];
        } catch (Throwable $e) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $e; }
    }

    // ==========================================
    // METHOD: subscriberGetDevices
    // ==========================================
    public function subscriberGetDevices($code) {
        $code = trim($code);
        $networkId=$this->bindSubscriberNetwork($code);
        if($networkId===-1)return ['success'=>false,'error'=>'NETWORK_CONTEXT_REQUIRED','message'=>'اختر الشبكة أولاً'];
        if($networkId<=0)return ['success'=>false,'error'=>'رقم الكرت غير موجود'];
        $stmt = $this->db->prepare("
            SELECT a.radacctid, a.username, a.callingstationid, a.framedipaddress, a.nasipaddress, a.nasportid,
                   a.acctstarttime, a.acctsessiontime,
                   ROUND((a.acctinputoctets + a.acctoutputoctets) / (1024 * 1024), 2) AS session_mb
            FROM radacct a
            WHERE a.network_id=? AND a.username = ? AND a.acctstoptime IS NULL
            ORDER BY a.radacctid DESC
        ");
        $stmt->execute([$networkId,$code]);
        $devices = $stmt->fetchAll();
        return ['success' => true, 'devices' => $devices];
    }

    public function subscriberDisconnectDevice($code, $callingStationId = '') {
        $code = trim((string)$code);
        $arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩','۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
        $standardDigits = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
        $code = str_replace($arabicDigits, $standardDigits, $code);
        $code = trim(preg_replace('/^#+/','', $code));

        if (empty($code) || str_starts_with($code, '$') || str_contains($code, '$(') || str_contains($code, ')') || strtolower($code) === 'username') {
            $code = '';
        }

        $mac = trim((string)$callingStationId);
        $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        if (!empty($clientIp)) {
            $ips = explode(',', $clientIp);
            $clientIp = trim($ips[0]);
        }

        if (empty($code)) {
            if (!empty($mac) || !empty($clientIp)) {
                $st = $this->db->prepare("SELECT username FROM radacct WHERE (callingstationid = ? OR framedipaddress = ?) AND acctstoptime IS NULL ORDER BY radacctid DESC LIMIT 1");
                $st->execute([$mac ?: $clientIp, $clientIp ?: $mac]);
                $code = (string)$st->fetchColumn();
            }
        }

        if (empty($code)) {
            return ['success' => true, 'message' => 'تم تسجيل الخروج بنجاح'];
        }

        $networkId = $this->bindSubscriberNetwork($code);
        if ($networkId <= 0) {
            return ['success' => true, 'message' => 'تم تسجيل الخروج بنجاح'];
        }

        $sql = "SELECT a.radacctid, a.nasipaddress, a.framedipaddress, a.callingstationid, n.secret
                FROM radacct a
                LEFT JOIN nas n ON n.network_id=a.network_id AND a.nasipaddress = n.nasname
                WHERE a.network_id=? AND a.username = ? " . ($mac !== '' ? "AND a.callingstationid = ? " : "") . "AND a.acctstoptime IS NULL
                ORDER BY a.radacctid DESC";
        $stmt = $this->db->prepare($sql);
        $params = ($mac !== '') ? [$networkId, $code, $mac] : [$networkId, $code];
        $stmt->execute($params);
        $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $radclientBin = file_exists('/usr/bin/radclient') ? '/usr/bin/radclient' : 'radclient';

        foreach ($sessions as $sess) {
            $nasIp = $sess['nasipaddress'];
            $secret = $sess['secret'] ?: '123456';
            $callingMac = $sess['callingstationid'];
            $discPacket = 'User-Name = "' . $code . '"' . "\n";
            if (!empty($callingMac)) $discPacket .= 'Calling-Station-Id = "' . $callingMac . '"' . "\n";
            if (!empty($sess['framedipaddress'])) $discPacket .= 'Framed-IP-Address = ' . $sess['framedipaddress'] . "\n";
            $cmd = 'echo ' . escapeshellarg($discPacket) . ' | ' . escapeshellcmd($radclientBin) . ' -r 2 ' . escapeshellarg($nasIp . ':3799') . ' disconnect ' . escapeshellarg($secret) . ' 2>&1';
            @exec($cmd, $out, $ret);
            $this->db->prepare("
                UPDATE radacct 
                SET acctstoptime = NOW(), acctterminatecause = 'User-Request' 
                WHERE network_id=? AND radacctid = ?
            ")->execute([$networkId, $sess['radacctid']]);
            if ($mac !== '') break;
        }

        return ['success' => true, 'message' => 'تم تسجيل الخروج وفصل الاتصال بنجاح'];
    }

    // ==========================================
    // METHOD: getSpeedTiers
    // ==========================================
    public function getSpeedTiers(bool $activeOnly = false): array {
        if ($this->radius !== null && isset($this->radius->routerRadius)) {
            return $this->radius->routerRadius->getSpeedTiers($activeOnly);
        }
        $r = new RouterRadiusService($this->db, $this->radius);
        return $r->getSpeedTiers($activeOnly);
    }

    public function saveSpeedTier(array $data): array {
        if ($this->radius !== null && isset($this->radius->routerRadius)) {
            return $this->radius->routerRadius->saveSpeedTier($data);
        }
        $r = new RouterRadiusService($this->db, $this->radius);
        return $r->saveSpeedTier($data);
    }

    public function deleteSpeedTier(int $id): array {
        if ($this->radius !== null && isset($this->radius->routerRadius)) {
            return $this->radius->routerRadius->deleteSpeedTier($id);
        }
        $r = new RouterRadiusService($this->db, $this->radius);
        return $r->deleteSpeedTier($id);
    }

    public function resetSpeedTiers(): array {
        if ($this->radius !== null && isset($this->radius->routerRadius)) {
            return $this->radius->routerRadius->resetSpeedTiers();
        }
        $r = new RouterRadiusService($this->db, $this->radius);
        return $r->resetSpeedTiers();
    }

    // ==========================================
    // 11. NOTIFICATIONS & ALERTS SYSTEM
    // ==========================================

    // ==========================================
    // METHOD: ensureSubscriberMacLockSchema
    // ==========================================
    private function ensureSubscriberMacLockSchema() {
        static $ready = false;
        if ($ready) return;
        $cols = $this->db->query("SHOW COLUMNS FROM um_vouchers_meta")->fetchAll(PDO::FETCH_COLUMN);
        $adds = [];
        if (!in_array('mac_lock_enabled', $cols, true)) $adds[] = "ADD mac_lock_enabled TINYINT(1) NOT NULL DEFAULT 0";
        if (!in_array('locked_mac', $cols, true)) $adds[] = "ADD locked_mac VARCHAR(32) NULL";
        if ($adds) $this->db->exec("ALTER TABLE um_vouchers_meta " . implode(',', $adds));
        $triggerSql=(string)$this->db->query("SELECT ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='trg_radacct_first_mac_lock'")->fetchColumn();
        if ($triggerSql!=='' && !str_contains($triggerSql,'network_id')) {$this->db->exec("DROP TRIGGER trg_radacct_first_mac_lock");$triggerSql='';}
        if ($triggerSql==='') {
            $this->db->exec("CREATE TRIGGER trg_radacct_first_mac_lock AFTER INSERT ON radacct FOR EACH ROW BEGIN
                UPDATE um_vouchers_meta SET locked_mac=UPPER(NEW.callingstationid)
                WHERE network_id=NEW.network_id AND username=NEW.username AND mac_lock_enabled=1 AND (locked_mac IS NULL OR locked_mac='') AND NEW.callingstationid IS NOT NULL AND NEW.callingstationid<>'';
                INSERT INTO radcheck(network_id,username,attribute,op,value)
                SELECT NEW.network_id,NEW.username,'Calling-Station-Id','==',m.locked_mac FROM um_vouchers_meta m
                WHERE m.network_id=NEW.network_id AND m.username=NEW.username AND m.mac_lock_enabled=1 AND m.locked_mac IS NOT NULL AND m.locked_mac<>''
                  AND NOT EXISTS(SELECT 1 FROM radcheck r WHERE r.network_id=NEW.network_id AND r.username=NEW.username AND r.attribute='Calling-Station-Id');
            END");
        }
        $ready = true;
    }

    // ==========================================
    // METHOD: getCardWarehousesSummary
    // ==========================================
    public function getCardWarehousesSummary($currentAdminId = 1) {
        $this->enforcePermission(["card_warehouses", "warehouse_stock_transfer"], "عرض مخازن الكروت", (int)$currentAdminId);
        $networkId = $this->getActiveNetworkId();
        $admin = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($admin && in_array($admin['role'], ['system_owner', 'superadmin', 'admin'], true));
        // Superadmin views all accounts with warehouses; others view themselves and descendants
        $accountsQuery = "SELECT a.id, a.username, a.fullname, a.role, a.parent_id, a.phone, COALESCE(b.balance,0) balance
                          FROM um_admins a
                          JOIN um_admin_network_access x ON x.admin_id=a.id AND x.network_id=$networkId AND x.is_active=1
                          LEFT JOIN um_admin_network_balances b ON b.admin_id=a.id AND b.network_id=x.network_id
                          WHERE a.is_active = 1";
        if (!$isSuper) {
            $descendants = $this->getAdminDescendantIds((int)$currentAdminId);
            $descendants[] = (int)$currentAdminId;
            $inList = implode(',', $descendants);
            $accountsQuery .= " AND a.id IN ($inList)";
        }
        $accountsQuery .= " ORDER BY CASE WHEN a.role IN ('system_owner', 'superadmin', 'admin') THEN 1 WHEN a.role = 'distributor' THEN 2 ELSE 3 END, a.id ASC";
        $accounts = $this->db->query($accountsQuery)->fetchAll(PDO::FETCH_ASSOC);
        $warehouses = [];
        $grandTotalCards = 0;
        $grandUnsoldCards = 0;
        $grandSoldCards = 0;
        $grandTotalSheets = 0;
        $grandCustodySheets = 0;
        $grandSoldSheets = 0;
        $grandTotalValue = 0.00;
        $grandCustodyBalance = 0.00;
        $grandSoldBalance = 0.00;
        foreach ($accounts as $acc) {
            $accId = (int)$acc['id'];
            $inventory = $this->getWarehouseSheetInventory($accId);
            $profileList = [];
            $accTotalCards = 0;
            $accUnsoldCards = 0;
            $accSoldCards = 0;
            $accTotalSheets = 0;
            $accCustodySheets = 0;
            $accSoldSheets = 0;
            $accTotalVal = 0.00;
            foreach ($inventory['profiles'] as $profile) {
                if ($profile['total_cards'] <= 0) continue;
                $activeSheets = array_values(array_filter($profile['sheets'], fn($sheet) => $sheet['remaining_cards'] > 0));
                $allNumbers = array_values(array_unique(array_column($activeSheets, 'sheet_no')));
                sort($allNumbers, SORT_NUMERIC);
                $custodySheetsList = array_values(array_filter($activeSheets, fn($s) => empty($s['is_sold'])));
                $soldSheetsList = array_values(array_filter($activeSheets, fn($s) => !empty($s['is_sold'])));
                $custodyNumbers = array_values(array_unique(array_column($custodySheetsList, 'sheet_no')));
                sort($custodyNumbers, SORT_NUMERIC);
                $soldNumbers = array_values(array_unique(array_column($soldSheetsList, 'sheet_no')));
                sort($soldNumbers, SORT_NUMERIC);
                $pCustodyCards = (int)$profile['available_cards'];
                $pSoldCards = (int)$profile['sold_cards'];
                $pCustodySheetsCount = count($custodySheetsList);
                $pSoldSheetsCount = count($soldSheetsList);
                $profileList[] = [
                    'profile_name' => $profile['profile_name'],
                    'display_profile' => $profile['profile_label'],
                    'profile_label' => $profile['profile_label'],
                    'unit_price' => $profile['total_cards'] > 0 ? round($profile['total_value'] / $profile['total_cards'], 2) : 0,
                    'unit_cost' => (float)($profile['unit_cost'] ?? $profile['cost_price'] ?? ($profile['total_cards'] > 0 ? round($profile['total_value'] / $profile['total_cards'], 2) : 0)),
                    'cost_price' => (float)($profile['unit_cost'] ?? $profile['cost_price'] ?? ($profile['total_cards'] > 0 ? round($profile['total_value'] / $profile['total_cards'], 2) : 0)),
                    'total_cards' => $profile['total_cards'],
                    'unsold_cards' => $pCustodyCards,
                    'custody_cards' => $pCustodyCards,
                    'sold_cards' => $pSoldCards,
                    'total_sheets' => count($activeSheets),
                    'unsold_sheets' => $pCustodySheetsCount,
                    'custody_sheets' => $pCustodySheetsCount,
                    'sold_sheets' => $pSoldSheetsCount,
                    'min_sheet' => $allNumbers ? min($allNumbers) : 0,
                    'max_sheet' => $allNumbers ? max($allNumbers) : 0,
                    'sheet_numbers' => $allNumbers,
                    'sheet_range_formatted' => $this->formatInventorySheetRanges($allNumbers),
                    'custody_sheet_numbers' => $custodyNumbers,
                    'custody_sheet_ranges' => $this->formatInventorySheetRanges($custodyNumbers),
                    'sold_sheet_numbers' => $soldNumbers,
                    'sold_sheet_ranges' => $this->formatInventorySheetRanges($soldNumbers),
                    'unnumbered_cards' => $profile['unnumbered_cards'],
                    'total_value' => $profile['total_value'],
                    'available_value' => $profile['available_value'],
                ];
                $accTotalCards += $profile['total_cards'];
                $accUnsoldCards += $pCustodyCards;
                $accSoldCards += $pSoldCards;
                $accTotalSheets += count($activeSheets);
                $accCustodySheets += $pCustodySheetsCount;
                $accSoldSheets += $pSoldSheetsCount;
                $accTotalVal += $profile['total_value'];
            }
            $acc['total_cards'] = $accTotalCards;
            $acc['unsold_cards'] = $accUnsoldCards;
            $acc['custody_cards'] = $accUnsoldCards;
            $acc['sold_cards'] = $accSoldCards;
            $acc['total_sheets'] = $accTotalSheets;
            $acc['custody_sheets'] = $accCustodySheets;
            $acc['sold_sheets'] = $accSoldSheets;
            $acc['total_stock_value'] = $accTotalVal;
            // Instant Balance breakdown: Custody vs Sold
            $custodyBalStmt = $this->db->prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW()) AND COALESCE(is_sold, 0) = 0");
            $custodyBalStmt->execute([$networkId,$accId]);
            $acc['custody_balance'] = (float)$custodyBalStmt->fetchColumn();
            $soldBalStmt = $this->db->prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW()) AND is_sold = 1");
            $soldBalStmt->execute([$networkId,$accId]);
            $acc['sold_balance'] = (float)$soldBalStmt->fetchColumn();
            $acc['instant_balance'] = $acc['custody_balance'] + $acc['sold_balance'];
            $instantExpiryStmt = $this->db->prepare("SELECT MIN(expires_at) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND expires_at>NOW()");
            $instantExpiryStmt->execute([$networkId,$accId]);
            $acc['instant_balance_nearest_expiry'] = $instantExpiryStmt->fetchColumn() ?: null;
            $acc['profiles_stock'] = $profileList;
            $acc['remaining_cards'] = $inventory['total_cards'];
            $acc['remaining_sheets'] = $inventory['total_sheets'];
            $acc['sold_in_custody_cards'] = $inventory['sold_cards'];
            $acc['remaining_profiles'] = $profileList;
            // Sales stats
            $salesStats = $this->db->prepare("
                SELECT COUNT(DISTINCT invoice_no) as total_invoices, 
                       COALESCE(SUM(quantity), 0) as sold_cards,
                       COALESCE(SUM(total_amount), 0) as total_sales_amount
                FROM um_sales_invoices 
                WHERE network_id=? AND seller_id = ?
            ");
            $salesStats->execute([$networkId,$accId]);
            $acc['sales_stats'] = $salesStats->fetch(PDO::FETCH_ASSOC);
            $warehouses[] = $acc;
            $grandTotalCards += $accTotalCards;
            $grandUnsoldCards += $accUnsoldCards;
            $grandSoldCards += $accSoldCards;
            $grandTotalSheets += $accTotalSheets;
            $grandCustodySheets += $accCustodySheets;
            $grandSoldSheets += $accSoldSheets;
            $grandTotalValue += $accTotalVal;
            $grandCustodyBalance += $acc['custody_balance'];
            $grandSoldBalance += $acc['sold_balance'];
        }
        return [
            'warehouses' => $warehouses,
            'summary' => [
                'total_warehouses' => count($warehouses),
                'grand_total_cards' => $grandTotalCards,
                'grand_unsold_cards' => $grandUnsoldCards,
                'grand_custody_cards' => $grandUnsoldCards,
                'grand_sold_cards' => $grandSoldCards,
                'grand_total_sheets' => $grandTotalSheets,
                'grand_custody_sheets' => $grandCustodySheets,
                'grand_sold_sheets' => $grandSoldSheets,
                'grand_total_value' => $grandTotalValue,
                'grand_custody_balance' => $grandCustodyBalance,
                'grand_sold_balance' => $grandSoldBalance,
                'grand_instant_balance' => $grandCustodyBalance + $grandSoldBalance,
                'current_admin_id' => (int)$currentAdminId,
                'is_super' => $isSuper
            ]
        ];
    }

    // ==========================================
    // METHOD: getWarehouseStockDetails
    // ==========================================
    public function getWarehouseStockDetails($adminId) {
        $admin = $this->getAdminById((int)$adminId);
        if (!$admin) throw new Exception('الحساب / المخزن غير موجود');
        $inventory = $this->getWarehouseSheetInventory((int)$adminId);
        $sheets = [];
        foreach ($inventory['profiles'] as $profile) {
            foreach ($profile['sheets'] as $sheet) {
                if ($sheet['remaining_cards'] <= 0) continue;
                $sheets[] = array_merge($sheet, [
                    'profile_name' => $profile['profile_name'],
                    'display_profile' => $profile['profile_label'],
                    'cards_in_sheet' => $sheet['remaining_cards'],
                    'unit_price' => $sheet['remaining_cards'] > 0 ? round($sheet['total_value'] / $sheet['remaining_cards'], 2) : 0,
                    'sheet_total_value' => $sheet['total_value'],
                ]);
            }
        }
        usort($sheets, fn($a, $b) => $a['sheet_no'] <=> $b['sheet_no']);
        return [
            'account' => $admin,
            'sheets' => $sheets,
            'total_sheets' => count($sheets),
            'total_cards' => $inventory['total_cards'],
            'unsold_cards' => $inventory['available_cards'],
            'sold_cards' => $inventory['sold_cards'],
            'total_value' => $inventory['total_value'],
            'available_value' => $inventory['available_value'],
            'sheet_inventory' => $inventory,
        ];
    }
    // Physical, unused cards in custody include purchased stock as well as unsold stock.
    // A sheet is counted from its identity, never estimated by dividing card counts.

    // ==========================================
    // METHOD: getWarehouseSheetInventory
    // ==========================================
    private function getWarehouseSheetInventory($adminId) {
        $networkId = $this->getActiveNetworkId();
        $sql = "SELECT owned.sheet_no, owned.profile_name, owned.batch_id,
                    COALESCE(NULLIF(p.name_for_users, ''), NULLIF(owned.profile_name, ''), 'بدون باقة') AS profile_label,
                    COUNT(*) AS owned_cards,
                    SUM(owned.unused) AS remaining_cards,
                    SUM(owned.unused AND COALESCE(owned.is_sold, 0) = 0 AND owned.invoice_id IS NULL) AS available_cards,
                    SUM(owned.unused AND (owned.is_sold = 1 OR owned.invoice_id IS NOT NULL)) AS sold_cards,
                    SUM(NOT owned.unused) AS used_cards,
                    SUM(CASE WHEN owned.unused AND COALESCE(owned.is_sold, 0) = 0 AND owned.invoice_id IS NULL THEN COALESCE(owned.price, 0) ELSE 0 END) AS available_value,
                    SUM(CASE WHEN owned.unused THEN COALESCE(owned.price, 0) ELSE 0 END) AS total_value,
                    MAX(COALESCE(p.cost_price, 0)) AS unit_cost,
                    MAX(COALESCE(owned.price, p.price, 0)) AS unit_price,
                    COALESCE(MAX(pb.cards_per_sheet), COUNT(*)) AS total_cards,
                    MAX(pb.cards_per_sheet) AS cards_per_sheet,
                    MIN(owned.created_at) AS created_at,
                    MAX(owned.invoice_id) AS invoice_id,
                    MAX(inv.invoice_no) AS invoice_no
                FROM (
                    SELECT m.*, (m.first_login IS NULL
                        AND COALESCE(m.status, 'active') NOT IN ('used', 'expired')
                        AND (m.expires_at IS NULL OR m.expires_at > NOW())) AS unused
                    FROM um_vouchers_meta m 
                    WHERE m.owner_admin_id = ? AND m.network_id=?
                      AND COALESCE(m.is_free_quota, 0) = 0 
                      AND COALESCE(m.price, 0) > 0 
                      AND m.profile_name NOT LIKE 'Free-%'
                ) owned
                LEFT JOIN um_profiles_def p ON p.name = owned.profile_name AND p.network_id=owned.network_id
                LEFT JOIN um_print_batches pb ON pb.batch_id = owned.batch_id
                LEFT JOIN um_sales_invoices inv ON inv.id = owned.invoice_id AND inv.network_id=owned.network_id
                GROUP BY owned.profile_name, owned.batch_id, owned.sheet_no, p.name_for_users
                HAVING remaining_cards > 0
                ORDER BY owned.profile_name, owned.sheet_no, owned.batch_id";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([(int)$adminId,$networkId]);
        $profiles = [];
        $result = [
            'profiles' => [],
            'total_cards' => 0,
            'total_sheets' => 0,
            'custody_sheets' => 0,
            'sold_sheets' => 0,
            'available_cards' => 0,
            'custody_cards' => 0,
            'sold_cards' => 0,
            'unnumbered_cards' => 0,
            'available_value' => 0.0,
            'total_value' => 0.0
        ];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = (string)$row['profile_name'];
            if (!isset($profiles[$key])) {
                $profiles[$key] = [
                    'profile_name' => $key,
                    'profile_label' => $row['profile_label'],
                    'unit_cost' => (float)$row['unit_cost'],
                    'cost_price' => (float)$row['unit_cost'],
                    'unit_price' => (float)$row['unit_price'],
                    'total_cards' => 0,
                    'total_sheets' => 0,
                    'complete_sheets' => 0,
                    'partial_sheets' => 0,
                    'available_cards' => 0,
                    'custody_cards' => 0,
                    'sold_cards' => 0,
                    'custody_sheets' => 0,
                    'sold_sheets' => 0,
                    'unnumbered_cards' => 0,
                    'unnumbered_available_cards' => 0,
                    'available_value' => 0.0,
                    'total_value' => 0.0,
                    'sheet_numbers' => [],
                    'custody_sheet_numbers' => [],
                    'sold_sheet_numbers' => [],
                    'sheets' => []
                ];
            }
            $profile =& $profiles[$key];
            $remaining = (int)$row['remaining_cards'];
            $available = (int)$row['available_cards'];
            $sold = (int)$row['sold_cards'];
            $number = (int)$row['sheet_no'];
            $profile['total_cards'] += $remaining;
            $profile['available_cards'] += $available;
            $profile['custody_cards'] += $available;
            $profile['sold_cards'] += $sold;
            $profile['available_value'] += (float)$row['available_value'];
            $profile['total_value'] += (float)$row['total_value'];
            $result['total_cards'] += $remaining;
            $result['available_cards'] += $available;
            $result['custody_cards'] += $available;
            $result['sold_cards'] += $sold;
            $result['available_value'] += (float)$row['available_value'];
            $result['total_value'] += (float)$row['total_value'];
            if ($number <= 0) {
                $profile['unnumbered_cards'] += $remaining;
                $profile['unnumbered_available_cards'] += $available;
                $result['unnumbered_cards'] += $remaining;
                unset($profile);
                continue;
            }
            $physicalCount = (int)$row['total_cards'];
            $capacity = max($physicalCount, (int)$row['cards_per_sheet']);
            $partial = $remaining < $capacity;
            $isSheetSold = ($sold > 0 && $available === 0) ? 1 : ($sold > 0 ? 2 : 0);
            $profile['sheets'][] = [
                'sheet_no' => $number,
                'sheet_no_formatted' => str_pad((string)$number, 6, '0', STR_PAD_LEFT),
                'batch_id' => $row['batch_id'],
                'remaining_cards' => $remaining,
                'total_cards' => $physicalCount,
                'available_cards' => $available,
                'sold_cards' => $sold,
                'is_sold' => $isSheetSold,
                'invoice_id' => $row['invoice_id'] ? (int)$row['invoice_id'] : null,
                'invoice_no' => $row['invoice_no'] ?: null,
                'is_transferrable' => ($available > 0 && $sold === 0),
                'used_cards' => (int)$row['used_cards'],
                'cards_per_sheet' => $capacity,
                'is_partial' => $partial,
                'available_value' => (float)$row['available_value'],
                'total_value' => (float)$row['total_value'],
                'created_at' => $row['created_at'],
            ];
            $profile['sheet_numbers'][] = $number;
            $profile['total_sheets']++;
            if ($isSheetSold) {
                $profile['sold_sheets']++;
                $profile['sold_sheet_numbers'][] = $number;
                $result['sold_sheets']++;
            } else {
                $profile['custody_sheets']++;
                $profile['custody_sheet_numbers'][] = $number;
                $result['custody_sheets']++;
            }
            $profile[$partial ? 'partial_sheets' : 'complete_sheets']++;
            $result['total_sheets']++;
            unset($profile);
        }
        foreach ($profiles as &$p) {
            $p['custody_sheet_ranges'] = $this->formatInventorySheetRanges($p['custody_sheet_numbers']);
            $p['sold_sheet_ranges'] = $this->formatInventorySheetRanges($p['sold_sheet_numbers']);
            $p['sheet_range_formatted'] = $this->formatInventorySheetRanges($p['sheet_numbers']);
        }
        unset($p);
        $result['profiles'] = array_values($profiles);
        return $result;
    }

    // ==========================================
    // METHOD: formatInventorySheetRanges
    // ==========================================
    private function formatInventorySheetRanges($numbers) {
        if (!$numbers) return 'لا توجد أوراق مرقمة';
        $numbers = array_values(array_unique(array_map('intval', $numbers)));
        sort($numbers, SORT_NUMERIC);
        $ranges = [];
        $start = $end = array_shift($numbers);
        foreach ($numbers as $number) {
            if ($number === $end + 1) { $end = $number; continue; }
            $ranges[] = [$start, $end];
            $start = $end = $number;
        }
        $ranges[] = [$start, $end];
        return implode('، ', array_map(function ($range) {
            $start = str_pad((string)$range[0], 6, '0', STR_PAD_LEFT);
            return $range[0] === $range[1] ? $start : $start . '–' . str_pad((string)$range[1], 6, '0', STR_PAD_LEFT);
        }, $ranges));
    }

    // ==========================================
    // METHOD: transferWarehouseStock
    // ==========================================
    public function transferWarehouseStock($data, $currentAdminId = 1) {
        $this->enforcePermission(["warehouse_stock_transfer", "card_warehouses"], "تحويل المخزون بين المستودعات", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $sourceId = (int)($data['source_admin_id'] ?? $currentAdminId);
        $targetId = (int)($data['target_admin_id'] ?? 0);
        $profileName = trim($data['profile_name'] ?? '');
        $sheetsCount = (int)($data['sheets_count'] ?? 0);
        $sheetNumbers = $data['sheet_numbers'] ?? null;
        $notes = trim($data['notes'] ?? '');
        $requireApproval = !empty($data['require_approval']) || ($data['status'] ?? '') === 'pending_approval';

        if (!$targetId) throw new Exception('يجب تحديد المستلم / المخزن الوجهة');
        if ($sourceId === $targetId) throw new Exception('لا يمكن التحويل لنفس المخزن');
        $source = $this->getAdminById($sourceId);
        $target = $this->getAdminById($targetId);
        if (!$source) throw new Exception('المخزن المصدر غير موجود');
        if (!$target) throw new Exception('المخزن المستلم غير موجود');

        $membershipStmt = $this->db->prepare("SELECT COUNT(*) FROM um_admin_network_access WHERE admin_id IN (?,?) AND network_id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW())");
        $membershipStmt->execute([$sourceId, $targetId, $networkId]);
        if ((int)$membershipStmt->fetchColumn() !== 2) {
            throw new DomainException('FORBIDDEN_NETWORK');
        }

        $allowedRoles = ['system_owner', 'superadmin', 'admin', 'distributor', 'pos_agent', 'partner', 'accountant', 'supervisor'];
        if (!in_array($source['role'] ?? '', $allowedRoles) || !in_array($target['role'] ?? '', $allowedRoles)) {
            throw new Exception('غير مصرح: المخزن المصدر أو المستلم غير مسموح له بإدارة عهدة الكروت');
        }
        $sender = $this->getAdminById($currentAdminId);
        $isSuper = ($sender && in_array($sender['role'], ['system_owner', 'superadmin', 'admin'], true));
        if (!$isSuper && $sourceId !== (int)$currentAdminId) {
            throw new Exception('ليس لديك صلاحية التحويل من هذا المخزن');
        }

        $sheetsList = [];
        $safeUnsoldCondition = "network_id = ? AND owner_admin_id = ? AND is_sold = 0 AND COALESCE(comment,'') NOT LIKE 'استيراد محجور من User Manager%' AND invoice_id IS NULL AND first_login IS NULL AND (status IS NULL OR status NOT IN ('used', 'expired')) AND NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.network_id=um_vouchers_meta.network_id AND ra.username = um_vouchers_meta.username)";
        $items = $data['items'] ?? [];
        if (!empty($items) && is_array($items)) {
            foreach ($items as $it) {
                $pName = trim($it['profile_name'] ?? '');
                $sCnt = (int)($it['sheets_count'] ?? 0);
                $itSheetNos = $it['sheet_numbers'] ?? null;
                
                if (!empty($itSheetNos)) {
                    $itemSheets = [];
                    if (is_array($itSheetNos)) {
                        $itemSheets = array_map('intval', $itSheetNos);
                    } elseif (is_string($itSheetNos)) {
                        $parts = explode(',', $itSheetNos);
                        foreach ($parts as $p) {
                            $p = trim($p);
                            if (strpos($p, '-') !== false) {
                                [$start, $end] = explode('-', $p, 2);
                                $s = (int)trim($start);
                                $e = (int)trim($end);
                                for ($x = min($s, $e); $x <= max($s, $e); $x++) $itemSheets[] = $x;
                            } elseif (!empty($p)) {
                                $itemSheets[] = (int)$p;
                            }
                        }
                    }
                    $itemSheets = array_values(array_unique(array_filter($itemSheets, fn($x) => $x > 0)));
                    foreach ($itemSheets as $ps) $sheetsList[] = (int)$ps;
                } elseif ($sCnt > 0 && !empty($pName)) {
                    $autoSql = "SELECT sheet_no FROM um_vouchers_meta WHERE network_id = ? AND owner_admin_id = ? AND profile_name = ? AND sheet_no IS NOT NULL AND sheet_no > 0 GROUP BY sheet_no HAVING SUM(COALESCE(is_sold, 0)) = 0 AND SUM(CASE WHEN invoice_id IS NOT NULL THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN first_login IS NOT NULL THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN status IN ('used', 'expired') THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN username IN (SELECT username FROM radacct WHERE network_id = ?)) THEN 1 ELSE 0 END) = 0 ORDER BY sheet_no ASC LIMIT $sCnt";
                    $autoStmt = $this->db->prepare($autoSql);
                    $autoStmt->execute([$networkId, $sourceId, $pName, $networkId]);
                    $pSheets = $autoStmt->fetchAll(PDO::FETCH_COLUMN);
                    if (count($pSheets) < $sCnt) {
                        throw new Exception("الرصيد المتاح للباقة ($pName) في المخزن المصدر هو " . count($pSheets) . " ورقة فقط، والمطلوب تحويل $sCnt ورقة");
                    }
                    foreach ($pSheets as $ps) $sheetsList[] = (int)$ps;
                }
            }
        } elseif (!empty($sheetNumbers)) {
            if (is_array($sheetNumbers)) {
                $sheetsList = array_map('intval', $sheetNumbers);
            } elseif (is_string($sheetNumbers)) {
                $parts = explode(',', $sheetNumbers);
                foreach ($parts as $p) {
                    $p = trim($p);
                    if (strpos($p, '-') !== false) {
                        [$start, $end] = explode('-', $p, 2);
                        $s = (int)trim($start);
                        $e = (int)trim($end);
                        for ($x = min($s, $e); $x <= max($s, $e); $x++) {
                            $sheetsList[] = $x;
                        }
                    } elseif (!empty($p)) {
                        $sheetsList[] = (int)$p;
                    }
                }
            }
        } elseif ($sheetsCount > 0) {
            $paramsAuto = [$networkId, $sourceId];
            $extraProf = "";
            if (!empty($profileName)) {
                $extraProf = " AND profile_name = ?";
                $paramsAuto[] = $profileName;
            }
            $autoSql = "SELECT DISTINCT sheet_no FROM um_vouchers_meta WHERE $safeUnsoldCondition $extraProf ORDER BY sheet_no ASC LIMIT " . $sheetsCount;
            $autoStmt = $this->db->prepare($autoSql);
            $autoStmt->execute($paramsAuto);
            $sheetsList = $autoStmt->fetchAll(PDO::FETCH_COLUMN);
            if (count($sheetsList) < $sheetsCount) {
                throw new Exception("الرصيد المتاح في المخزن المصدر لا يكفي لتحويل ($sheetsCount) ورقة (المتاح فقط " . count($sheetsList) . " ورقة)");
            }
        } else {
            throw new Exception('يجب تحديد عدد الأوراق أو أرقام الأوراق المراد تحويلها');
        }
        $sheetsList = array_values(array_unique(array_filter($sheetsList, fn($x) => $x > 0)));
        if (empty($sheetsList)) throw new Exception('لم يتم تحديد أية أوراق صالحة للتحويل');
        $inSheets = implode(',', array_fill(0, count($sheetsList), '?'));
        $chkSql = "SELECT m.id, m.username, m.sheet_no, m.profile_name, m.price,
                          COALESCE(p.cost_price, 0) AS card_cost,
                          COALESCE(NULLIF(p.retail_price, 0), m.price, 0) AS card_retail,
                          m.owner_admin_id, m.is_sold, m.invoice_id, m.first_login, m.status,
                          (SELECT COUNT(*) FROM radacct ra WHERE ra.network_id = m.network_id AND ra.username = m.username) as radacct_cnt
                   FROM um_vouchers_meta m
                   LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND p.name = m.profile_name
                   WHERE m.network_id=? AND m.sheet_no IN ($inSheets)";
        $chkStmt = $this->db->prepare($chkSql);
        $chkStmt->execute(array_merge([$networkId], $sheetsList));
        $cards = $chkStmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($cards)) throw new Exception('لم يتم العثور على أية كروت مطابقة لأرقام الصفحات المحددة');
        $totalVal = 0.00;
        $totalCostVal = 0.00;
        $totalRetailVal = 0.00;
        $actualCardsCount = count($cards);
        $profilesDetected = [];
        foreach ($cards as $c) {
            $sFmt = str_pad((string)$c['sheet_no'], 6, '0', STR_PAD_LEFT);
            if ((int)$c['is_sold'] === 1 || !empty($c['invoice_id'])) {
                throw new Exception("⛔ الورقة رقم {$sFmt} تم بيعها بموجب فاتورة مبيعات معتمدة ولا يمكن تحويلها مخزنياً.");
            }
            if (!empty($c['first_login']) || in_array($c['status'], ['used', 'expired']) || (int)$c['radacct_cnt'] > 0) {
                throw new Exception("⛔ الورقة رقم {$sFmt} تحتوي على كروت مستخدمة على الشبكة وتعتبر مباعة، ولا يمكن تحويلها مخزنياً.");
            }
            if ((int)$c['owner_admin_id'] !== $sourceId) {
                throw new Exception("الصفحة رقم $sFmt ليست في عهدة المخزن المصدر المحدد ({$source['fullname']})");
            }
            $cCost = (float)($c['card_cost'] ?? $c['price']);
            $cRetail = (float)($c['card_retail'] ?? $c['price']);
            $totalCostVal += $cCost;
            $totalRetailVal += $cRetail;
            $totalVal += (float)$c['price'];
            $profilesDetected[$c['profile_name']] = true;
        }
        $detectedProfile = count($profilesDetected) === 1 ? array_key_first($profilesDetected) : implode(', ', array_keys($profilesDetected));
        sort($sheetsList);
        $minS = str_pad((string)min($sheetsList), 6, '0', STR_PAD_LEFT);
        $maxS = str_pad((string)max($sheetsList), 6, '0', STR_PAD_LEFT);
        $sheetRangeStr = (count($sheetsList) === 1) ? $minS : "$minS إلى $maxS (" . count($sheetsList) . " ورقة)";
        $transferNo = 'TRF-' . date('YmdHis') . '-' . rand(100, 999);
        $transferType = !empty($data['transfer_type']) ? $data['transfer_type'] : 'transfer';

        $this->db->beginTransaction();
        try {
            // Case A: PENDING APPROVAL (Draft / Waiting for recipient confirmation)
            if ($requireApproval) {
                $insLog = $this->db->prepare("
                    INSERT INTO um_stock_transfers 
                    (network_id, transfer_no, transfer_type, status, sender_admin_id, receiver_admin_id, profile_name, sheets_count, sheet_numbers, cards_count, unit_price, total_value, cost_value, retail_value, financial_tx_id, journal_entry_id, notes, created_by, is_immutable)
                    VALUES (?, ?, ?, 'pending_approval', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0)
                ");
                $unitPriceAvg = $actualCardsCount > 0 ? ($totalVal / $actualCardsCount) : 0;
                $insLog->execute([
                    $networkId,
                    $transferNo,
                    $transferType,
                    $sourceId,
                    $targetId,
                    $detectedProfile,
                    count($sheetsList),
                    implode(',', $sheetsList),
                    $actualCardsCount,
                    $unitPriceAvg,
                    $totalVal,
                    $totalCostVal,
                    $totalRetailVal,
                    $notes,
                    $currentAdminId
                ]);
                $transferId = (int)$this->db->lastInsertId();
                $this->db->commit();

                try {
                    $this->getNotificationService()->notifyTransfer([
                        'transfer_no' => $transferNo,
                        'source_admin_id' => $sourceId,
                        'target_admin_id' => $targetId,
                        'sheets_count' => count($sheetsList),
                        'cards_count' => $actualCardsCount,
                        'total_value' => $totalVal,
                        'profile_name' => $detectedProfile,
                        'notes' => $notes . " (بانتظار الاعتماد والاستلام)"
                    ], $currentAdminId);
                } catch (\Throwable $ne) {}

                return [
                    'success' => true,
                    'status' => 'pending_approval',
                    'transfer_id' => $transferId,
                    'transfer_no' => $transferNo,
                    'sheets_count' => count($sheetsList),
                    'cards_count' => $actualCardsCount,
                    'total_value' => $totalVal,
                    'cost_value' => $totalCostVal,
                    'retail_value' => $totalRetailVal,
                    'source_name' => $source['fullname'],
                    'target_name' => $target['fullname'],
                    'message' => "تم إنشاء أمر التحويل المخزني رقم $transferNo بنجاح (بانتظار اعتماد واستلام الطرف المستلم قبل التأثير على الأرصدة والعهدة)."
                ];
            }

            // Case B: DIRECT EXECUTION & POSTING (Confirmed immediately)
            $chunkSize = 250;
            $chunks = array_chunk($sheetsList, $chunkSize);
            foreach ($chunks as $chunk) {
                $inChunk = implode(',', array_fill(0, count($chunk), '?'));
                $upSql = "UPDATE um_vouchers_meta SET owner_admin_id = ? WHERE network_id=? AND sheet_no IN ($inChunk)";
                $upStmt = $this->db->prepare($upSql);
                $upStmt->execute(array_merge([$targetId, $networkId], $chunk));
            }
            $finTxId = null;
            if (!in_array($target['role'], ['system_owner', 'superadmin'], true)) {
                $balanceStmt = $this->db->prepare("SELECT balance,credit_limit FROM um_admin_network_balances WHERE admin_id=? AND network_id=? FOR UPDATE");
                $balanceStmt->execute([$targetId, $networkId]);
                $targetNetworkBalance = $balanceStmt->fetch(PDO::FETCH_ASSOC);
                if (!$targetNetworkBalance) throw new DomainException('FORBIDDEN_NETWORK');
                $targetCreditLimit = (float)($targetNetworkBalance['credit_limit'] ?? 0);
                $currentTargetBal = (float)($targetNetworkBalance['balance'] ?? 0);
                $newTargetBal = $currentTargetBal + $totalVal;
                if ($targetCreditLimit > 0 && $newTargetBal > $targetCreditLimit) {
                    $curDebtFmt = number_format($currentTargetBal, 2);
                    $limitFmt = number_format($targetCreditLimit, 2);
                    $valFmt = number_format($totalVal, 2);
                    $excessFmt = number_format($newTargetBal - $targetCreditLimit, 2);
                    $maxAllow = max(0, $targetCreditLimit - $currentTargetBal);
                    $allowFmt = number_format($maxAllow, 2);
                    throw new Exception("⛔ تم رفض تحويل العهدة: المستلم ({$target['fullname']}) سيتجاوز سقف المديونية الائتماني المحدد له!
• سقف الائتمان المسموح: {$limitFmt} ر.ي
• المديونية الحالية: {$curDebtFmt} ر.ي
• قيمة العهدة المحولة: {$valFmt} ر.ي
• مقدار التجاوز المرفوض: {$excessFmt} ر.ي
• الحد الأقصى المتاح للتحويل: {$allowFmt} ر.ي");
                }
                $upTarget = $this->db->prepare("UPDATE um_admin_network_balances SET balance = ? WHERE admin_id = ? AND network_id=?");
                $upTarget->execute([$newTargetBal, $targetId, $networkId]);
                $txNo = 'TX-' . date('YmdHis') . '-' . rand(100, 999);
                $insTx = $this->db->prepare("
                    INSERT INTO um_financial_transactions 
                    (network_id, tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'transfer', ?, 0, ?, 0, 'credit', ?, ?, ?)
                ");
                $desc = "استلام عهدة كروت تسلسل أوراق ({$sheetRangeStr}) من ({$source['fullname']}) بقيمة " . number_format($totalVal, 2) . " ر.ي";
                if (!empty($notes)) $desc .= " - ملاحظة: $notes";
                $insTx->execute([$networkId, $txNo, $targetId, $totalVal, $newTargetBal, $transferNo, $desc, $currentAdminId]);
                $finTxId = (int)$this->db->lastInsertId();
            }

            // Source Accounting: If source is NOT superadmin, credit the source!
            if (!in_array($source['role'], ['system_owner', 'superadmin'], true)) {
                $balanceStmt = $this->db->prepare("SELECT balance FROM um_admin_network_balances WHERE admin_id=? AND network_id=? FOR UPDATE");
                $balanceStmt->execute([$sourceId, $networkId]);
                $currentSourceBal = $balanceStmt->fetchColumn();
                if ($currentSourceBal === false) throw new DomainException('FORBIDDEN_NETWORK');
                $currentSourceBal = (float)$currentSourceBal;
                $newSourceBal = max(0, $currentSourceBal - $totalVal);
                $upSource = $this->db->prepare("UPDATE um_admin_network_balances SET balance = ? WHERE admin_id = ? AND network_id=?");
                $upSource->execute([$newSourceBal, $sourceId, $networkId]);

                $txNoSrc = 'TX-' . date('YmdHis') . '-' . rand(100, 999);
                $insTxSrc = $this->db->prepare("
                    INSERT INTO um_financial_transactions 
                    (network_id, tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'transfer', 0, ?, ?, 0, 'credit', ?, ?, ?)
                ");
                $descSrc = "إخلاء/تحويل عهدة كروت تسلسل أوراق ({$sheetRangeStr}) إلى ({$target['fullname']}) بقيمة " . number_format($totalVal, 2) . " ر.ي";
                if (!empty($notes)) $descSrc .= " - ملاحظة: $notes";
                $insTxSrc->execute([$networkId, $txNoSrc, $sourceId, $totalVal, $newSourceBal, $transferNo, $descSrc, $currentAdminId]);
            }

            // Post Automatic Accounting Double-Entry Journal Entry
            $movementJvDesc = ($transferType === 'return' ? "إرجاع عهدة كروت من " : "تحويل عهدة كروت إلى ") . "({$target['fullname']}) - مستند $transferNo";
            $jvType = ($transferType === 'return') ? 'return_from_custody' : 'transfer_to_custody';
            $journalEntryId = $this->postStockMovementJournalEntry($networkId, $jvType, $transferNo, $movementJvDesc, $totalVal, $currentAdminId);

            $insLog = $this->db->prepare("
                INSERT INTO um_stock_transfers 
                (network_id, transfer_no, transfer_type, status, sender_admin_id, receiver_admin_id, profile_name, sheets_count, sheet_numbers, cards_count, unit_price, total_value, cost_value, retail_value, financial_tx_id, approved_by, approved_at, journal_entry_id, notes, created_by, is_immutable)
                VALUES (?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 1)
            ");
            $unitPriceAvg = $actualCardsCount > 0 ? ($totalVal / $actualCardsCount) : 0;
            $insLog->execute([
                $networkId,
                $transferNo,
                $transferType,
                $sourceId,
                $targetId,
                $detectedProfile,
                count($sheetsList),
                implode(',', $sheetsList),
                $actualCardsCount,
                $unitPriceAvg,
                $totalVal,
                $totalCostVal,
                $totalRetailVal,
                $finTxId,
                $currentAdminId,
                $journalEntryId,
                $notes,
                $currentAdminId
            ]);
            $transferId = (int)$this->db->lastInsertId();
            $this->db->commit();

            try {
                $this->getNotificationService()->notifyTransfer([
                    'transfer_no' => $transferNo,
                    'source_admin_id' => $sourceId,
                    'target_admin_id' => $targetId,
                    'sheets_count' => count($sheetsList),
                    'cards_count' => $actualCardsCount,
                    'total_value' => $totalVal,
                    'profile_name' => $detectedProfile,
                    'notes' => $notes
                ], $currentAdminId);
            } catch (\Throwable $ne) {}

            return [
                'success' => true,
                'status' => 'posted',
                'transfer_id' => $transferId,
                'transfer_no' => $transferNo,
                'sheets_count' => count($sheetsList),
                'cards_count' => $actualCardsCount,
                'total_value' => $totalVal,
                'cost_value' => $totalCostVal,
                'retail_value' => $totalRetailVal,
                'journal_entry_id' => $journalEntryId,
                'source_name' => $source['fullname'],
                'target_name' => $target['fullname'],
                'message' => "تم تنفيذ حركة التحويل المخزني $transferNo واعتمادها وترحيل القيد المحاسبي المزدوج بنجاح ✓"
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: approveStockTransfer (اعتماد مستند الحركة المخزنية وتأثيره)
    // ==========================================
    public function approveStockTransfer($transferId, $currentAdminId = 1) {
        $this->enforcePermission(["warehouse_stock_transfer", "card_warehouses"], "اعتماد استلام العهدة والمخزون", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $transferId = (int)$transferId;

        $stmt = $this->db->prepare("SELECT * FROM um_stock_transfers WHERE id = ? AND network_id = ? FOR UPDATE");
        $stmt->execute([$transferId, $networkId]);
        $transfer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$transfer) throw new Exception('مستند التحويل المخزني غير موجود');
        if ($transfer['status'] === 'posted') {
            throw new Exception('مستند التحويل معتمد ومنفذ مسبقاً');
        }
        if ($transfer['status'] !== 'pending_approval' && $transfer['status'] !== 'draft') {
            throw new Exception('لا يمكن اعتماد مستند في حالة: ' . $transfer['status']);
        }

        $sourceId = (int)$transfer['sender_admin_id'];
        $targetId = (int)$transfer['receiver_admin_id'];
        $source = $this->getAdminById($sourceId);
        $target = $this->getAdminById($targetId);
        $approver = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($approver && in_array($approver['role'], ['system_owner', 'superadmin', 'admin'], true));

        // Approver must be the receiver or superadmin
        if (!$isSuper && $targetId !== (int)$currentAdminId) {
            throw new Exception('غير مصرح: يجب أن يتم اعتماد واستلام العهدة من قبل الطرف المستلم أو مالك النظام.');
        }

        $sheetNumbersStr = trim($transfer['sheet_numbers'] ?? '');
        $sheetNumbers = array_values(array_unique(array_filter(array_map('intval', explode(',', $sheetNumbersStr)), fn($x) => $x > 0)));
        if (empty($sheetNumbers)) throw new Exception('بيانات أوراق الكروت في مستند التحويل غير صالحة');

        $inSheets = implode(',', array_fill(0, count($sheetNumbers), '?'));
        $totalVal = (float)$transfer['total_value'];
        $transferNo = $transfer['transfer_no'];
        $transferType = $transfer['transfer_type'] ?? 'transfer';
        $sheetRangeStr = (count($sheetNumbers) === 1) ? str_pad((string)$sheetNumbers[0], 6, '0', STR_PAD_LEFT) : str_pad((string)min($sheetNumbers), 6, '0', STR_PAD_LEFT) . " إلى " . str_pad((string)max($sheetNumbers), 6, '0', STR_PAD_LEFT) . " (" . count($sheetNumbers) . " ورقة)";

        $this->db->beginTransaction();
        try {
            // 1. Move card ownership in um_vouchers_meta
            $chunks = array_chunk($sheetNumbers, 250);
            foreach ($chunks as $chunk) {
                $inChunk = implode(',', array_fill(0, count($chunk), '?'));
                $upSql = "UPDATE um_vouchers_meta SET owner_admin_id = ? WHERE network_id=? AND sheet_no IN ($inChunk)";
                $upStmt = $this->db->prepare($upSql);
                $upStmt->execute(array_merge([$targetId, $networkId], $chunk));
            }

            // 2. Financial Balances & Debt Enforcement for Target
            $finTxId = null;
            if (!in_array($target['role'], ['system_owner', 'superadmin'], true)) {
                $balanceStmt = $this->db->prepare("SELECT balance,credit_limit FROM um_admin_network_balances WHERE admin_id=? AND network_id=? FOR UPDATE");
                $balanceStmt->execute([$targetId, $networkId]);
                $targetNetworkBalance = $balanceStmt->fetch(PDO::FETCH_ASSOC);
                if (!$targetNetworkBalance) throw new DomainException('FORBIDDEN_NETWORK');
                $targetCreditLimit = (float)($targetNetworkBalance['credit_limit'] ?? 0);
                $currentTargetBal = (float)($targetNetworkBalance['balance'] ?? 0);
                $newTargetBal = $currentTargetBal + $totalVal;
                if ($targetCreditLimit > 0 && $newTargetBal > $targetCreditLimit) {
                    throw new Exception("⛔ تم رفض اعتماد العهدة: المستلم سيتجاوز سقف الائتمان المسموح له ({$targetCreditLimit} ر.ي) بمقدار " . ($newTargetBal - $targetCreditLimit) . " ر.ي");
                }
                $upTarget = $this->db->prepare("UPDATE um_admin_network_balances SET balance = ? WHERE admin_id = ? AND network_id=?");
                $upTarget->execute([$newTargetBal, $targetId, $networkId]);

                $txNo = 'TX-' . date('YmdHis') . '-' . rand(100, 999);
                $insTx = $this->db->prepare("
                    INSERT INTO um_financial_transactions 
                    (network_id, tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'transfer', ?, 0, ?, 0, 'credit', ?, ?, ?)
                ");
                $desc = "اعتماد استلام عهدة كروت تسلسل أوراق ({$sheetRangeStr}) من ({$source['fullname']}) بقيمة " . number_format($totalVal, 2) . " ر.ي";
                $insTx->execute([$networkId, $txNo, $targetId, $totalVal, $newTargetBal, $transferNo, $desc, $currentAdminId]);
                $finTxId = (int)$this->db->lastInsertId();
            }

            // 3. Source Account Credit (if not superadmin)
            if (!in_array($source['role'], ['system_owner', 'superadmin'], true)) {
                $balanceStmt = $this->db->prepare("SELECT balance FROM um_admin_network_balances WHERE admin_id=? AND network_id=? FOR UPDATE");
                $balanceStmt->execute([$sourceId, $networkId]);
                $currentSourceBal = (float)$balanceStmt->fetchColumn();
                $newSourceBal = max(0, $currentSourceBal - $totalVal);
                $upSource = $this->db->prepare("UPDATE um_admin_network_balances SET balance = ? WHERE admin_id = ? AND network_id=?");
                $upSource->execute([$newSourceBal, $sourceId, $networkId]);

                $txNoSrc = 'TX-' . date('YmdHis') . '-' . rand(100, 999);
                $insTxSrc = $this->db->prepare("
                    INSERT INTO um_financial_transactions 
                    (network_id, tx_no, account_id, tx_type, debit, credit, balance_after, cashbox_impact, payment_method, reference_id, description, created_by)
                    VALUES (?, ?, ?, 'transfer', 0, ?, ?, 0, 'credit', ?, ?, ?)
                ");
                $descSrc = "اعتماد تسليم عهدة كروت تسلسل أوراق ({$sheetRangeStr}) إلى ({$target['fullname']}) بقيمة " . number_format($totalVal, 2) . " ر.ي";
                $insTxSrc->execute([$networkId, $txNoSrc, $sourceId, $totalVal, $newSourceBal, $transferNo, $descSrc, $currentAdminId]);
            }

            // 4. Double-Entry Journal Entry
            $movementJvDesc = ($transferType === 'return' ? "اعتماد إرجاع عهدة كروت من " : "اعتماد تحويل عهدة كروت إلى ") . "({$target['fullname']}) - مستند $transferNo";
            $jvType = ($transferType === 'return') ? 'return_from_custody' : 'transfer_to_custody';
            $journalEntryId = $this->postStockMovementJournalEntry($networkId, $jvType, $transferNo, $movementJvDesc, $totalVal, $currentAdminId);

            // 5. Update Stock Transfer Status to POSTED and lock it (is_immutable = 1)
            $upLog = $this->db->prepare("
                UPDATE um_stock_transfers 
                SET status = 'posted', financial_tx_id = ?, approved_by = ?, approved_at = NOW(), journal_entry_id = ?, is_immutable = 1 
                WHERE id = ? AND network_id = ?
            ");
            $upLog->execute([$finTxId, $currentAdminId, $journalEntryId, $transferId, $networkId]);

            $this->db->commit();

            return [
                'success' => true,
                'transfer_no' => $transferNo,
                'status' => 'posted',
                'journal_entry_id' => $journalEntryId,
                'message' => "تم اعتماد واستلام العهدة بنجاح وتحديث الأرصدة المالية والقيود المحاسبية المقفلة ✓"
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: rejectStockTransfer (رفض أمر تحويل العهدة المعلق)
    // ==========================================
    public function rejectStockTransfer($transferId, $reason = '', $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT * FROM um_stock_transfers WHERE id = ? AND network_id = ?");
        $stmt->execute([(int)$transferId, $networkId]);
        $t = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$t) throw new Exception('مستند التحويل المخزني غير موجود');
        if ($t['status'] === 'posted') {
            throw new Exception('لا يمكن رفض حركة مخزنية تم اعتمادها وتنفيذها مسبقاً. يجب عمل مستند إرجاع عهدة.');
        }

        $reason = trim($reason ?: 'تم رفض استلام العهدة من قبل المستلم');
        $up = $this->db->prepare("UPDATE um_stock_transfers SET status = 'rejected', notes = CONCAT(COALESCE(notes,''), ' | سبب الرفض: ', ?), approved_by = ?, approved_at = NOW(), is_immutable = 1 WHERE id = ? AND network_id = ?");
        $up->execute([$reason, (int)$currentAdminId, (int)$transferId, $networkId]);

        return ['success' => true, 'message' => 'تم رفض مستند التحويل وإلغاؤه بنجاح دون التأثير على المخزون أو الأرصدة.'];
    }

    // ==========================================
    // METHOD: deleteStockTransfer (منع تعديل أو حذف الحركة المنفذة)
    // ==========================================
    public function deleteStockTransfer($transferId, $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $stmt = $this->db->prepare("SELECT * FROM um_stock_transfers WHERE id = ? AND network_id = ?");
        $stmt->execute([(int)$transferId, $networkId]);
        $t = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$t) throw new Exception('مستند التحويل غير موجود');

        if ($t['status'] === 'posted' || (int)$t['is_immutable'] === 1) {
            throw new Exception('⛔ غير مسموح (IMMUTABLE_RECORD): الحركة المخزنية معتمدة ومنفذة دفترياً ومحاسبياً ولا يمكن حذفها أو تعديلها. للحفاظ على سلامة الرقابة المحاسبية والجرد، يجب إنشاء مستند إرجاع عهدة أو تسوية جردية.');
        }

        $del = $this->db->prepare("DELETE FROM um_stock_transfers WHERE id = ? AND network_id = ?");
        $del->execute([(int)$transferId, $networkId]);
        return ['success' => true, 'message' => 'تم حذف مسودة التحويل غير المعتمدة بنجاح.'];
    }

    // ==========================================
    // METHOD: startStockInventory (بدء جلسة جرد مخزني)
    // ==========================================
    public function startStockInventory($data, $currentAdminId = 1) {
        $this->enforcePermission(["card_warehouses", "warehouse_stock_transfer"], "بدء جلسة جرد مخزني", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $warehouseAdminId = (int)($data['warehouse_admin_id'] ?? $currentAdminId);
        $wh = $this->getAdminById($warehouseAdminId);
        if (!$wh) throw new Exception('المخزن المطلوب جرده غير موجود');

        $inventoryDate = !empty($data['inventory_date']) ? trim($data['inventory_date']) : date('Y-m-d');
        $notes = trim($data['notes'] ?? '');
        $invNo = 'INV-' . date('YmdHis') . '-' . rand(100, 999);

        // Fetch book inventory per profile
        $sql = "SELECT m.profile_name,
                       COUNT(DISTINCT m.sheet_no) as book_sheets,
                       COUNT(m.id) as book_cards,
                       COALESCE(NULLIF(p.cost_price, 0), m.price, 0) as cost_price,
                       COALESCE(NULLIF(p.retail_price, 0), m.price, 0) as retail_price
                FROM um_vouchers_meta m
                LEFT JOIN um_profiles_def p ON p.network_id=m.network_id AND p.name=m.profile_name
                WHERE m.network_id = ? AND m.owner_admin_id = ? AND m.is_sold = 0 
                  AND m.invoice_id IS NULL AND m.first_login IS NULL 
                  AND (m.status IS NULL OR m.status NOT IN ('used', 'expired', 'damaged', 'lost'))
                GROUP BY m.profile_name";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$networkId, $warehouseAdminId]);
        $lines = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalBookCards = 0;
        foreach ($lines as $l) $totalBookCards += (int)$l['book_cards'];

        $this->db->beginTransaction();
        try {
            $insInv = $this->db->prepare("
                INSERT INTO um_stock_inventories 
                (inventory_no, network_id, warehouse_admin_id, inventory_date, status, total_book_cards, total_actual_cards, total_variance_cards, total_cost_variance, notes, created_by)
                VALUES (?, ?, ?, ?, 'draft', ?, 0, 0, 0, ?, ?)
            ");
            $insInv->execute([$invNo, $networkId, $warehouseAdminId, $inventoryDate, $totalBookCards, $notes, $currentAdminId]);
            $invId = (int)$this->db->lastInsertId();

            $insLine = $this->db->prepare("
                INSERT INTO um_stock_inventory_lines 
                (inventory_id, profile_name, book_sheets_count, book_cards_count, actual_sheets_count, actual_cards_count, variance_cards, cost_price, retail_price, variance_cost_value)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
            ");
            foreach ($lines as $l) {
                $insLine->execute([
                    $invId,
                    $l['profile_name'],
                    (int)$l['book_sheets'],
                    (int)$l['book_cards'],
                    (int)$l['book_sheets'],
                    (int)$l['book_cards'],
                    (float)$l['cost_price'],
                    (float)$l['retail_price']
                ]);
            }

            $this->db->commit();
            return [
                'success' => true,
                'inventory_id' => $invId,
                'inventory_no' => $invNo,
                'warehouse_name' => $wh['fullname'],
                'total_book_cards' => $totalBookCards,
                'lines_count' => count($lines),
                'message' => "تم فتح محضر جلسة الجرد المخزني رقم $invNo بنجاح."
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: getStockInventoryDetails (تفاصيل محضر الجرد)
    // ==========================================
    public function getStockInventoryDetails($inventoryId, $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $stmt = $this->db->prepare("
            SELECT i.*, w.fullname as warehouse_name, w.username as warehouse_username, w.role as warehouse_role,
                   c.fullname as creator_name, a.fullname as approver_name
            FROM um_stock_inventories i
            LEFT JOIN um_admins w ON i.warehouse_admin_id = w.id
            LEFT JOIN um_admins c ON i.created_by = c.id
            LEFT JOIN um_admins a ON i.approved_by = a.id
            WHERE i.id = ? AND i.network_id = ?
        ");
        $stmt->execute([(int)$inventoryId, $networkId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) throw new Exception('جلسة الجرد غير موجودة');

        $lStmt = $this->db->prepare("SELECT * FROM um_stock_inventory_lines WHERE inventory_id = ? ORDER BY id ASC");
        $lStmt->execute([(int)$inventoryId]);
        $inv['lines'] = $lStmt->fetchAll(PDO::FETCH_ASSOC);

        return $inv;
    }

    // ==========================================
    // METHOD: saveStockInventory (حفظ نتائج العد الفعلي للجرد)
    // ==========================================
    public function saveStockInventory($data, $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $invId = (int)($data['inventory_id'] ?? $data['id'] ?? 0);

        $stmt = $this->db->prepare("SELECT * FROM um_stock_inventories WHERE id = ? AND network_id = ?");
        $stmt->execute([$invId, $networkId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) throw new Exception('جلسة الجرد غير موجودة');
        if ($inv['status'] === 'completed') {
            throw new Exception('لا يمكن تعديل جلسة جرد مكتملة ومعتمدة');
        }

        $lines = $data['lines'] ?? [];
        if (!is_array($lines)) throw new Exception('بيانات أصناف الجرد غير صالحة');

        $totalActualCards = 0;
        $totalVarianceCards = 0;
        $totalCostVariance = 0.00;
        $totalRetailVariance = 0.00;

        $this->db->beginTransaction();
        try {
            $upLine = $this->db->prepare("
                UPDATE um_stock_inventory_lines 
                SET actual_sheets_count = ?, actual_cards_count = ?, variance_cards = ?, variance_cost_value = ?, variance_retail_value = ?, notes = ?
                WHERE id = ? AND inventory_id = ?
            ");

            foreach ($lines as $l) {
                $lineId = (int)($l['id'] ?? 0);
                $actSheets = (int)($l['actual_sheets_count'] ?? 0);
                $actCards = (int)($l['actual_cards_count'] ?? 0);
                $bCards = (int)($l['book_cards_count'] ?? 0);
                $cPrice = (float)($l['cost_price'] ?? 0);
                $rPrice = (float)($l['retail_price'] ?? 0);
                $lineNotes = trim($l['notes'] ?? '');

                $varCards = $actCards - $bCards;
                $varCost = $varCards * $cPrice;
                $varRetail = $varCards * $rPrice;

                $totalActualCards += $actCards;
                $totalVarianceCards += $varCards;
                $totalCostVariance += $varCost;
                $totalRetailVariance += $varRetail;

                $upLine->execute([$actSheets, $actCards, $varCards, $varCost, $varRetail, $lineNotes, $lineId, $invId]);
            }

            $upInv = $this->db->prepare("
                UPDATE um_stock_inventories 
                SET total_actual_cards = ?, total_variance_cards = ?, total_cost_variance = ?, total_retail_variance = ?, status = 'in_progress', notes = ?
                WHERE id = ? AND network_id = ?
            ");
            $upInv->execute([$totalActualCards, $totalVarianceCards, $totalCostVariance, $totalRetailVariance, trim($data['notes'] ?? $inv['notes']), $invId, $networkId]);

            $this->db->commit();
            return [
                'success' => true,
                'inventory_id' => $invId,
                'total_actual_cards' => $totalActualCards,
                'total_variance_cards' => $totalVarianceCards,
                'total_cost_variance' => $totalCostVariance,
                'message' => 'تم حفظ نتائج العد الميداني للجرد واحتساب الفروقات بنجاح ✓'
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: postStockInventoryAdjustment (اعتماد محضر الجرد وترحيل التسويات)
    // ==========================================
    public function postStockInventoryAdjustment($inventoryId, $currentAdminId = 1) {
        $this->enforcePermission(["card_warehouses", "warehouse_stock_transfer"], "اعتماد الجرد والتسويات المخزنية", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $invId = (int)$inventoryId;

        $stmt = $this->db->prepare("SELECT * FROM um_stock_inventories WHERE id = ? AND network_id = ? FOR UPDATE");
        $stmt->execute([$invId, $networkId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$inv) throw new Exception('جلسة الجرد غير موجودة');
        if ($inv['status'] === 'completed') {
            throw new Exception('جلسة الجرد معتمدة ومقفلة مسبقاً');
        }

        $lStmt = $this->db->prepare("SELECT * FROM um_stock_inventory_lines WHERE inventory_id = ?");
        $lStmt->execute([$invId]);
        $lines = $lStmt->fetchAll(PDO::FETCH_ASSOC);

        $whId = (int)$inv['warehouse_admin_id'];
        $wh = $this->getAdminById($whId);
        $invNo = $inv['inventory_no'];

        $this->db->beginTransaction();
        try {
            $adjustmentsCreated = [];

            foreach ($lines as $l) {
                $varCards = (int)$l['variance_cards'];
                if ($varCards === 0) continue;

                $pName = $l['profile_name'];
                $costVal = abs((float)$l['variance_cost_value']);
                $retailVal = abs((float)$l['variance_retail_value']);
                $absCards = abs($varCards);

                // Case 1: Deficit (عجز مخزني / كروت مفقودة أو تالفة)
                if ($varCards < 0) {
                    $adjNo = 'ADJ-DEF-' . date('YmdHis') . '-' . rand(100, 999);
                    $reason = "عجز جرد مخزني بموجب محضر رقم $invNo - باقة $pName (نقص $absCards كرت)";

                    // Mark difference cards as damaged/lost in um_vouchers_meta
                    $cardStmt = $this->db->prepare("
                        SELECT id FROM um_vouchers_meta 
                        WHERE network_id = ? AND owner_admin_id = ? AND profile_name = ? 
                          AND is_sold = 0 AND invoice_id IS NULL AND first_login IS NULL 
                          AND (status IS NULL OR status = 'active')
                        LIMIT $absCards
                    ");
                    $cardStmt->execute([$networkId, $whId, $pName]);
                    $cardIds = $cardStmt->fetchAll(PDO::FETCH_COLUMN);

                    if (!empty($cardIds)) {
                        $inCards = implode(',', array_fill(0, count($cardIds), '?'));
                        $upCards = $this->db->prepare("UPDATE um_vouchers_meta SET status = 'damaged', comment = ? WHERE network_id = ? AND id IN ($inCards)");
                        $upCards->execute(array_merge([$reason, $networkId], $cardIds));
                    }

                    // Post Journal Entry (Dr. 5104 عجز وتلف المخزون, Cr. 110401 مخزون الكروت)
                    $jvId = $this->postStockMovementJournalEntry($networkId, 'deficit_adjustment', $adjNo, $reason, $costVal, $currentAdminId);

                    $insAdj = $this->db->prepare("
                        INSERT INTO um_stock_adjustments 
                        (adjustment_no, network_id, inventory_id, warehouse_admin_id, adjustment_type, status, total_cards, cost_value, retail_value, journal_entry_id, is_immutable, reason, created_by, approved_by, approved_at)
                        VALUES (?, ?, ?, ?, 'deficit', 'posted', ?, ?, ?, ?, 1, ?, ?, ?, NOW())
                    ");
                    $insAdj->execute([$adjNo, $networkId, $invId, $whId, $absCards, $costVal, $retailVal, $jvId, $reason, $currentAdminId, $currentAdminId]);
                    $adjustmentsCreated[] = $adjNo;
                }
                // Case 2: Surplus (زيادة غير مسجلة في الجرد)
                elseif ($varCards > 0) {
                    $adjNo = 'ADJ-SUR-' . date('YmdHis') . '-' . rand(100, 999);
                    $reason = "زيادة جرد مخزني بموجب محضر رقم $invNo - باقة $pName (فائض $absCards كرت)";

                    // Post Journal Entry (Dr. 110401 مخزون الكروت, Cr. 4201 أرباح وفروقات الجرد)
                    $jvId = $this->postStockMovementJournalEntry($networkId, 'surplus_adjustment', $adjNo, $reason, $costVal, $currentAdminId);

                    $insAdj = $this->db->prepare("
                        INSERT INTO um_stock_adjustments 
                        (adjustment_no, network_id, inventory_id, warehouse_admin_id, adjustment_type, status, total_cards, cost_value, retail_value, journal_entry_id, is_immutable, reason, created_by, approved_by, approved_at)
                        VALUES (?, ?, ?, ?, 'surplus', 'posted', ?, ?, ?, ?, 1, ?, ?, ?, NOW())
                    ");
                    $insAdj->execute([$adjNo, $networkId, $invId, $whId, $absCards, $costVal, $retailVal, $jvId, $reason, $currentAdminId, $currentAdminId]);
                    $adjustmentsCreated[] = $adjNo;
                }
            }

            // Close Inventory Session
            $closeStmt = $this->db->prepare("
                UPDATE um_stock_inventories 
                SET status = 'completed', approved_by = ?, approved_at = NOW() 
                WHERE id = ? AND network_id = ?
            ");
            $closeStmt->execute([(int)$currentAdminId, $invId, $networkId]);

            $this->db->commit();
            return [
                'success' => true,
                'inventory_no' => $invNo,
                'status' => 'completed',
                'adjustments_count' => count($adjustmentsCreated),
                'adjustments' => $adjustmentsCreated,
                'message' => "تم اعتماد محضر الجرد $invNo وإصدار القيود والتسويات المحاسبية بنجاح ✓"
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: createDirectStockAdjustment (تسوية جردية / إتلاف مباشر)
    // ==========================================
    public function createDirectStockAdjustment($data, $currentAdminId = 1) {
        $this->enforcePermission(["card_warehouses", "warehouse_stock_transfer"], "إجراء تسوية جردية", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $whId = (int)($data['warehouse_admin_id'] ?? $currentAdminId);
        $adjType = trim($data['adjustment_type'] ?? 'damaged');
        $reason = trim($data['reason'] ?? 'تسوية وإتلاف كروت تالفة/مفقودة');
        $profileName = trim($data['profile_name'] ?? '');
        $sheetNumbers = $data['sheet_numbers'] ?? [];
        $cardsCount = (int)($data['cards_count'] ?? 0);

        if (!$whId) throw new Exception('يجب تحديد المخزن');
        if (empty($reason)) throw new Exception('يجب تدوين سبب التسوية الجردية');

        $adjNo = 'ADJ-DIR-' . date('YmdHis') . '-' . rand(100, 999);
        $this->db->beginTransaction();
        try {
            $costVal = 0.00;
            $retailVal = 0.00;
            $totalCardsAdjusted = 0;

            if (!empty($sheetNumbers)) {
                $sheetArr = is_array($sheetNumbers) ? $sheetNumbers : array_map('intval', explode(',', $sheetNumbers));
                $sheetArr = array_values(array_unique(array_filter($sheetArr, fn($x) => $x > 0)));
                $inSheets = implode(',', array_fill(0, count($sheetArr), '?'));

                $cardStmt = $this->db->prepare("
                    SELECT m.id, m.price, COALESCE(NULLIF(m.purchase_cost, 0), p.cost_price, m.price, 0) as cost_price
                    FROM um_vouchers_meta m
                    LEFT JOIN um_profiles_def p ON p.network_id = m.network_id AND p.name = m.profile_name
                    WHERE m.network_id = ? AND m.owner_admin_id = ? AND m.sheet_no IN ($inSheets)
                      AND m.is_sold = 0 AND m.invoice_id IS NULL AND m.first_login IS NULL
                ");
                $cardStmt->execute(array_merge([$networkId, $whId], $sheetArr));
                $cards = $cardStmt->fetchAll(PDO::FETCH_ASSOC);

                if (empty($cards)) throw new Exception('لم يتم العثور على أوراق متاحة للتسوية بالأرقام المحددة');

                foreach ($cards as $c) {
                    $costVal += (float)$c['cost_price'];
                    $retailVal += (float)$c['price'];
                    $totalCardsAdjusted++;
                }

                $up = $this->db->prepare("UPDATE um_vouchers_meta SET status = ?, comment = ? WHERE network_id = ? AND sheet_no IN ($inSheets)");
                $up->execute(array_merge([$adjType === 'surplus' ? 'active' : 'damaged', $reason, $networkId], $sheetArr));
            } elseif ($cardsCount > 0 && !empty($profileName)) {
                $cardStmt = $this->db->prepare("
                    SELECT m.id, m.price, COALESCE(NULLIF(m.purchase_cost, 0), p.cost_price, m.price, 0) as cost_price
                    FROM um_vouchers_meta m
                    LEFT JOIN um_profiles_def p ON p.network_id = m.network_id AND p.name = m.profile_name
                    WHERE m.network_id = ? AND m.owner_admin_id = ? AND m.profile_name = ?
                      AND m.is_sold = 0 AND m.invoice_id IS NULL AND m.first_login IS NULL
                      AND (m.status IS NULL OR m.status = 'active')
                    LIMIT $cardsCount
                ");
                $cardStmt->execute([$networkId, $whId, $profileName]);
                $cards = $cardStmt->fetchAll(PDO::FETCH_ASSOC);
                if (count($cards) < $cardsCount) throw new Exception("الرصيد المتاح غير كافٍ لإجراء التسوية على ($cardsCount) كرت");

                $cIds = array_column($cards, 'id');
                foreach ($cards as $c) {
                    $costVal += (float)$c['cost_price'];
                    $retailVal += (float)$c['price'];
                    $totalCardsAdjusted++;
                }
                $inCards = implode(',', array_fill(0, count($cIds), '?'));
                $up = $this->db->prepare("UPDATE um_vouchers_meta SET status = ?, comment = ? WHERE network_id = ? AND id IN ($inCards)");
                $up->execute(array_merge([$adjType === 'surplus' ? 'active' : 'damaged', $reason, $networkId], $cIds));
            } else {
                throw new Exception('يجب تحديد أرقام الأوراق أو اسم الباقة وعدد الكروت');
            }

            // Post double-entry journal entry
            $jvType = ($adjType === 'surplus') ? 'surplus_adjustment' : 'deficit_adjustment';
            $jvId = $this->postStockMovementJournalEntry($networkId, $jvType, $adjNo, $reason, $costVal, $currentAdminId);

            $insAdj = $this->db->prepare("
                INSERT INTO um_stock_adjustments 
                (adjustment_no, network_id, warehouse_admin_id, adjustment_type, status, total_cards, cost_value, retail_value, journal_entry_id, is_immutable, reason, created_by, approved_by, approved_at)
                VALUES (?, ?, ?, ?, 'posted', ?, ?, ?, ?, 1, ?, ?, ?, NOW())
            ");
            $insAdj->execute([$adjNo, $networkId, $whId, $adjType, $totalCardsAdjusted, $costVal, $retailVal, $jvId, $reason, $currentAdminId, $currentAdminId]);
            $adjId = (int)$this->db->lastInsertId();

            $this->db->commit();
            return [
                'success' => true,
                'adjustment_id' => $adjId,
                'adjustment_no' => $adjNo,
                'total_cards' => $totalCardsAdjusted,
                'cost_value' => $costVal,
                'retail_value' => $retailVal,
                'journal_entry_id' => $jvId,
                'message' => "تم تنفيذ التسوية الجردية رقم $adjNo وترحيل القيد المحاسبي بنجاح ✓"
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    // ==========================================
    // METHOD: getStockInventoriesList (استعراض جلسات الجرد)
    // ==========================================
    public function getStockInventoriesList($filters = [], $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $admin = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($admin && in_array($admin['role'], ['system_owner', 'superadmin', 'admin'], true));

        $where = ["i.network_id = ?"];
        $params = [$networkId];

        if (!$isSuper) {
            $descendants = $this->getAdminDescendantIds((int)$currentAdminId);
            $descendants[] = (int)$currentAdminId;
            $inList = implode(',', array_map('intval', array_unique($descendants)));
            $where[] = "i.warehouse_admin_id IN ($inList)";
        }
        if (!empty($filters['warehouse_id'])) {
            $where[] = "i.warehouse_admin_id = ?";
            $params[] = (int)$filters['warehouse_id'];
        }
        if (!empty($filters['status'])) {
            $where[] = "i.status = ?";
            $params[] = $filters['status'];
        }

        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT i.*, w.fullname as warehouse_name, w.username as warehouse_username, w.role as warehouse_role,
                   c.fullname as creator_name, a.fullname as approver_name
            FROM um_stock_inventories i
            LEFT JOIN um_admins w ON i.warehouse_admin_id = w.id
            LEFT JOIN um_admins c ON i.created_by = c.id
            LEFT JOIN um_admins a ON i.approved_by = a.id
            WHERE $whereSql
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT 200
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ==========================================
    // METHOD: getStockAdjustmentsList (استعراض التسويات الجردية)
    // ==========================================
    public function getStockAdjustmentsList($filters = [], $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $admin = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($admin && in_array($admin['role'], ['system_owner', 'superadmin', 'admin'], true));

        $where = ["a.network_id = ?"];
        $params = [$networkId];

        if (!$isSuper) {
            $descendants = $this->getAdminDescendantIds((int)$currentAdminId);
            $descendants[] = (int)$currentAdminId;
            $inList = implode(',', array_map('intval', array_unique($descendants)));
            $where[] = "a.warehouse_admin_id IN ($inList)";
        }
        if (!empty($filters['type'])) {
            $where[] = "a.adjustment_type = ?";
            $params[] = $filters['type'];
        }
        if (!empty($filters['warehouse_id'])) {
            $where[] = "a.warehouse_admin_id = ?";
            $params[] = (int)$filters['warehouse_id'];
        }

        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT a.*, w.fullname as warehouse_name, w.username as warehouse_username,
                   c.fullname as creator_name, app.fullname as approver_name
            FROM um_stock_adjustments a
            LEFT JOIN um_admins w ON a.warehouse_admin_id = w.id
            LEFT JOIN um_admins c ON a.created_by = c.id
            LEFT JOIN um_admins app ON a.approved_by = app.id
            WHERE $whereSql
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 200
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ==========================================
    // METHOD: getInventoryReports (تقارير المخزون والعهد والتحويلات)
    // ==========================================
    public function getInventoryReports($reportType = 'valuation', $filters = [], $currentAdminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        $admin = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($admin && in_array($admin['role'], ['system_owner', 'superadmin', 'admin'], true));

        // 1. Valuation Report (تقييم المخزون والتكلفة وسعر البيع والأرباح المتوقعة)
        if ($reportType === 'valuation') {
            $where = ["m.network_id = ? AND m.is_sold = 0 AND m.invoice_id IS NULL AND m.first_login IS NULL AND (m.status IS NULL OR m.status = 'active')"];
            $params = [$networkId];

            if (!$isSuper) {
                $descendants = $this->getAdminDescendantIds((int)$currentAdminId);
                $descendants[] = (int)$currentAdminId;
                $inList = implode(',', array_map('intval', array_unique($descendants)));
                $where[] = "m.owner_admin_id IN ($inList)";
            }
            if (!empty($filters['warehouse_id'])) {
                $where[] = "m.owner_admin_id = ?";
                $params[] = (int)$filters['warehouse_id'];
            }

            $whereSql = implode(' AND ', $where);
            $sql = "
                SELECT 
                    m.profile_name,
                    COALESCE(p.name_for_users, m.profile_name) as profile_label,
                    COUNT(DISTINCT m.sheet_no) as sheets_count,
                    COUNT(m.id) as cards_count,
                    COALESCE(NULLIF(p.cost_price, 0), m.price, 0) as unit_cost,
                    COALESCE(NULLIF(p.retail_price, 0), m.price, 0) as unit_retail,
                    SUM(COALESCE(NULLIF(m.purchase_cost, 0), p.cost_price, m.price, 0)) as total_cost_value,
                    SUM(COALESCE(NULLIF(p.retail_price, 0), m.price, 0)) as total_retail_value
                FROM um_vouchers_meta m
                LEFT JOIN um_profiles_def p ON p.network_id = m.network_id AND p.name = m.profile_name
                WHERE $whereSql
                GROUP BY m.profile_name, p.name_for_users, p.cost_price, p.retail_price
                ORDER BY total_retail_value DESC
            ";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $grandCost = 0.00;
            $grandRetail = 0.00;
            $grandCards = 0;
            $grandSheets = 0;

            foreach ($rows as &$r) {
                $r['cost_value'] = (float)$r['total_cost_value'];
                $r['retail_value'] = (float)$r['total_retail_value'];
                $r['profit_margin'] = $r['retail_value'] - $r['cost_value'];
                $r['profit_percent'] = $r['cost_value'] > 0 ? round(($r['profit_margin'] / $r['cost_value']) * 100, 1) : 0;
                $grandCost += $r['cost_value'];
                $grandRetail += $r['retail_value'];
                $grandCards += (int)$r['cards_count'];
                $grandSheets += (int)$r['sheets_count'];
            }

            return [
                'report_type' => 'valuation',
                'items' => $rows,
                'summary' => [
                    'total_profiles' => count($rows),
                    'grand_sheets' => $grandSheets,
                    'grand_cards' => $grandCards,
                    'grand_cost_value' => $grandCost,
                    'grand_retail_value' => $grandRetail,
                    'grand_expected_profit' => $grandRetail - $grandCost,
                    'grand_profit_percent' => $grandCost > 0 ? round((($grandRetail - $grandCost) / $grandCost) * 100, 1) : 0
                ]
            ];
        }

        // 2. Custody Aging & Balances Report (أعمار عهد الكروت لدى الموزعين والوكلاء)
        if ($reportType === 'custody_aging') {
            $summary = $this->getCardWarehousesSummary($currentAdminId);
            $warehouses = $summary['warehouses'] ?? [];
            return [
                'report_type' => 'custody_aging',
                'warehouses' => $warehouses,
                'summary' => $summary['summary'] ?? []
            ];
        }

        // 3. Stock Transfers Audit Report
        if ($reportType === 'transfers_audit') {
            return [
                'report_type' => 'transfers_audit',
                'transfers' => $this->getStockTransfersLog($filters, $currentAdminId)
            ];
        }

        return ['success' => true, 'data' => []];
    }

    // ==========================================
    // HELPER: postStockMovementJournalEntry (الربط المحاسبي المزدوج التلقائي)
    // ==========================================
    private function postStockMovementJournalEntry($networkId, $type, $refNo, $desc, $amount, $adminId, $sourceAccountCode = null, $targetAccountCode = null): ?int {
        if ($amount <= 0) return null;
        try {
            require_once __DIR__ . '/FinancialAccountingService.php';
            $fa = new FinancialAccountingService($this->db);
            $invAccId = $this->getOrCreateChartAccount($networkId, $sourceAccountCode ?: '110401', 'مخزون كروت المايكروتك الجاهزة', 'asset', '1104');
            $custodyAccId = $this->getOrCreateChartAccount($networkId, $targetAccountCode ?: '110301', 'حسابات الوكلاء والموزعين والعهد', 'asset', '1103');

            $lines = [];
            if ($type === 'transfer_to_custody') {
                $lines = [
                    ['account_id' => $custodyAccId, 'debit' => $amount, 'credit' => 0, 'description' => $desc],
                    ['account_id' => $invAccId, 'debit' => 0, 'credit' => $amount, 'description' => $desc]
                ];
            } elseif ($type === 'return_from_custody') {
                $lines = [
                    ['account_id' => $invAccId, 'debit' => $amount, 'credit' => 0, 'description' => $desc],
                    ['account_id' => $custodyAccId, 'debit' => 0, 'credit' => $amount, 'description' => $desc]
                ];
            } elseif ($type === 'deficit_adjustment' || $type === 'damaged_loss') {
                $lossAccId = $this->getOrCreateChartAccount($networkId, '5104', 'عجز وتلفيات المخزون والجرد', 'expense', '51');
                $lines = [
                    ['account_id' => $lossAccId, 'debit' => $amount, 'credit' => 0, 'description' => $desc],
                    ['account_id' => $invAccId, 'debit' => 0, 'credit' => $amount, 'description' => $desc]
                ];
            } elseif ($type === 'surplus_adjustment') {
                $surplusAccId = $this->getOrCreateChartAccount($networkId, '4201', 'أرباح وفروقات جرد المخزون', 'revenue', '42');
                $lines = [
                    ['account_id' => $invAccId, 'debit' => $amount, 'credit' => 0, 'description' => $desc],
                    ['account_id' => $surplusAccId, 'debit' => 0, 'credit' => $amount, 'description' => $desc]
                ];
            }

            if (empty($lines)) return null;

            $jv = $fa->createJournalEntry([
                'entry_date' => date('Y-m-d'),
                'source_module' => 'stock_movement',
                'reference_no' => $refNo,
                'description' => $desc,
                'lines' => $lines
            ], (int)$adminId);

            return (int)($jv['entry_id'] ?? $jv['id'] ?? null);
        } catch (\Throwable $e) {
            error_log("Failed to post stock movement journal: " . $e->getMessage());
            throw $e; // A failed journal must abort its enclosing stock transaction.
        }
    }

    // ==========================================
    // HELPER: getOrCreateChartAccount
    // ==========================================
    private function getOrCreateChartAccount($networkId, $code, $nameAr, $type, $parentCode = null): int {
        $stmt = $this->db->prepare("SELECT id FROM um_chart_of_accounts WHERE network_id = ? AND account_code = ? LIMIT 1");
        $stmt->execute([$networkId, $code]);
        $id = $stmt->fetchColumn();
        if ($id) return (int)$id;

        $parentId=null;
        if($parentCode!==null){$parent=$this->db->prepare('SELECT id FROM um_chart_of_accounts WHERE network_id=? AND account_code=?');$parent->execute([$networkId,$parentCode]);$parentId=$parent->fetchColumn()?:null;}
        $ins = $this->db->prepare("INSERT INTO um_chart_of_accounts (network_id, account_code, name_ar, account_type, parent_id, level, is_active, is_system, created_at) VALUES (?, ?, ?, ?, ?, 4, 1, 1, NOW())");
        $ins->execute([$networkId, $code, $nameAr, $type, $parentId]);
        return (int)$this->db->lastInsertId();
    }

    // ==========================================
    // METHOD: returnWarehouseStock
    // ==========================================
    public function returnWarehouseStock($data, $currentAdminId = 1) {
        $this->enforcePermission(["warehouse_stock_return", "warehouse_stock_transfer", "card_warehouses"], "إرجاع المخزون والعهدة", (int)$currentAdminId);
        $networkId = (int)$this->getActiveNetworkId();
        $sourceId = (int)($data['source_admin_id'] ?? 0);
        $targetId = (int)($data['target_admin_id'] ?? 0);
        if ($targetId <= 0) {
            $ownerStmt = $this->db->prepare("SELECT so.admin_id
                FROM um_system_owners so
                JOIN um_admin_network_access na ON na.admin_id=so.admin_id AND na.network_id=? AND na.is_active=1
                ORDER BY so.admin_id ASC LIMIT 1");
            $ownerStmt->execute([$networkId]);
            $targetId = (int)$ownerStmt->fetchColumn();
        }
        if ($targetId <= 0) throw new DomainException('SYSTEM_OWNER_REQUIRED');
        if (!$sourceId) throw new Exception('يجب تحديد المخزن المرجع للعهدة');
        if ($sourceId === $targetId) throw new Exception('لا يمكن إرجاع العهدة لنفس المخزن');

        $notes = trim($data['notes'] ?? 'إرجاع عهدة كروت للإدارة وتخفيض المديونية');
        $payload = [
            'source_admin_id' => $sourceId,
            'target_admin_id' => $targetId,
            'sheet_numbers' => $data['sheet_numbers'] ?? [],
            'transfer_type' => 'return',
            'notes' => $notes
        ];
        $res = $this->transferWarehouseStock($payload, $currentAdminId);
        $res['message'] = "تم إرجاع " . ($res['sheets_count'] ?? 0) . " صفحة كروت بقيمة " . number_format($res['total_value'] ?? 0, 2) . " ر.ي وتخفيض مديونية الحساب بنجاح";
        return $res;
    }

    // ==========================================
    // METHOD: getStockTransfersLog
    // ==========================================
    public function getStockTransfersLog($filters = [], $currentAdminId = 1) {
        $networkId = $this->getActiveNetworkId();
        $admin = $this->getAdminById((int)$currentAdminId);
        $isSuper = ($admin && in_array($admin['role'], ['system_owner', 'superadmin', 'admin'], true));
        $where = ["t.network_id=?"];
        $params = [$networkId];
        if (!$isSuper) {
            $descendants = $this->getAdminDescendantIds((int)$currentAdminId);
            $descendants[] = (int)$currentAdminId;
            $inList = implode(',', array_map('intval', array_unique($descendants)));
            $where[] = "(t.sender_admin_id IN ($inList) OR t.receiver_admin_id IN ($inList))";
        }
        if (!empty($filters['type'])) {
            $where[] = "t.transfer_type = ?";
            $params[] = $filters['type'];
        }
        if (!empty($filters['status'])) {
            $where[] = "t.status = ?";
            $params[] = $filters['status'];
        }
        if (!empty($filters['profile_name'])) {
            $where[] = "t.profile_name = ?";
            $params[] = $filters['profile_name'];
        }
        if (!empty($filters['admin_id'])) {
            $where[] = "(t.sender_admin_id = ? OR t.receiver_admin_id = ?)";
            $params[] = (int)$filters['admin_id'];
            $params[] = (int)$filters['admin_id'];
        }
        if (!empty($filters['role'])) {
            $where[] = "(s.role = ? OR r.role = ?)";
            $params[] = $filters['role'];
            $params[] = $filters['role'];
        }
        if (!empty($filters['search'])) {
            $where[] = "(t.transfer_no LIKE ? OR s.fullname LIKE ? OR s.username LIKE ? OR r.fullname LIKE ? OR r.username LIKE ? OR t.profile_name LIKE ? OR t.sheet_numbers LIKE ? OR t.notes LIKE ?)";
            $s = '%' . $filters['search'] . '%';
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
        }
        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT 
                t.*,
                s.fullname as sender_name, s.role as sender_role, s.username as sender_username,
                r.fullname as receiver_name, r.role as receiver_role, r.username as receiver_username,
                app.fullname as approver_name
            FROM um_stock_transfers t
            LEFT JOIN um_admins s ON t.sender_admin_id = s.id
            LEFT JOIN um_admins r ON t.receiver_admin_id = r.id
            LEFT JOIN um_admins app ON t.approved_by = app.id
            WHERE $whereSql
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT 500
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ==========================================
    // METHOD: getWarehouseAuditReport
    // ==========================================
    public function getWarehouseAuditReport($adminId, $currentAdminId = 1) {
        $admin = $this->getAdminById((int)$adminId);
        if (!$admin) throw new Exception('المخزن / الحساب غير موجود');
        $auditor = $this->getAdminById((int)$currentAdminId);
        $stock = $this->getWarehouseStockDetails((int)$adminId);
        $summary = $this->getCardWarehousesSummary((int)$currentAdminId);
        $accWh = null;
        foreach ($summary['warehouses'] as $wh) {
            if ((int)$wh['id'] === (int)$adminId) {
                $accWh = $wh;
                break;
            }
        }
        $custodySheets = array_values(array_filter($stock['sheets'], fn($s) => empty($s['is_sold'])));
        $soldSheets = array_values(array_filter($stock['sheets'], fn($s) => !empty($s['is_sold'])));
        return [
            'account' => $admin,
            'auditor' => $auditor,
            'audit_date' => date('Y-m-d H:i:s'),
            'profiles_stock' => $accWh['profiles_stock'] ?? [],
            'sheets' => $stock['sheets'],
            'custody_sheets' => $custodySheets,
            'sold_sheets' => $soldSheets,
            'total_sheets' => $stock['total_sheets'],
            'total_cards' => $stock['total_cards'],
            'unsold_cards' => $stock['unsold_cards'],
            'custody_cards' => $stock['unsold_cards'],
            'sold_cards' => $stock['sold_cards'],
            'total_value' => $stock['total_value'],
            'custody_balance' => $accWh['custody_balance'] ?? 0.0,
            'sold_balance' => $accWh['sold_balance'] ?? 0.0,
            'instant_balance' => $accWh['instant_balance'] ?? 0.0
        ];
    }
    // ==========================================
    // ENTERPRISE DOUBLE-ENTRY ACCOUNTING ENGINE (ERP)
    // ==========================================

    // ==========================================
    // METHOD: getLowStockAlerts
    // ==========================================
    public function getLowStockAlerts($adminId = 1) {
        $networkId = (int)$this->getActiveNetworkId();
        if ($networkId <= 0) throw new DomainException('NETWORK_CONTEXT_REQUIRED');
        $excludeFree = $this->getSettingValue('alert_exclude_free_cards', '1') === '1';
        $threshold = (int)$this->getSettingValue('alert_low_stock_threshold', '50');
        if ($threshold <= 0) $threshold = 50;
        $where = ["m.network_id = :network_id", "m.is_sold = 0", "COALESCE(m.is_free_quota, 0) = 0", "COALESCE(m.price, 0) > 0", "m.profile_name NOT LIKE 'Free-%'"];
        $params = [':network_id' => $networkId, ':threshold' => $threshold];
        if (!empty($adminId)) {
            $adm = $this->getAdminById($adminId);
            if ($adm && !in_array($adm['role'], ['system_owner', 'superadmin'], true)) {
                $where[] = "m.owner_admin_id = :adm";
                $params[':adm'] = (int)$adminId;
            }
        }
        if ($excludeFree) {
            $where[] = "(COALESCE(p.price, 0) > 0)";
            $where[] = "(COALESCE(p.name, '') NOT LIKE '%مجان%' AND COALESCE(p.name, '') NOT LIKE '%free%' AND COALESCE(p.name, '') NOT LIKE '%trial%')";
            $where[] = "(COALESCE(p.name_for_users, '') NOT LIKE '%مجان%' AND COALESCE(p.name_for_users, '') NOT LIKE '%free%' AND COALESCE(p.name_for_users, '') NOT LIKE '%trial%')";
        }
        $whereSql = implode(' AND ', $where);
        $sql = "
            SELECT 
                m.profile_name,
                p.name_for_users,
                p.price,
                COUNT(m.id) as unsold_cards,
                CEIL(COUNT(m.id) / 20) as unsold_sheets
            FROM um_vouchers_meta m
            LEFT JOIN um_profiles_def p ON p.network_id = m.network_id AND m.profile_name = p.name
            WHERE $whereSql
            GROUP BY m.profile_name, p.name_for_users, p.price
            HAVING unsold_cards < :threshold
            ORDER BY unsold_cards ASC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // ==========================================
    // METHOD: ensureVoucherCommerceSchema
    // ==========================================
    private function ensureVoucherCommerceSchema(): void {
        $this->db->exec("ALTER TABLE um_profiles_def ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER price");
        $this->db->exec("ALTER TABLE um_profiles_def ADD COLUMN IF NOT EXISTS retail_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER cost_price");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER sale_price");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER purchase_cost");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS buyer_phone VARCHAR(16) NULL AFTER profit_amount");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(128) NULL AFTER buyer_phone");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending' AFTER buyer_name");
        $this->db->exec("ALTER TABLE um_vouchers_meta ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL AFTER delivery_status");
        $this->db->exec("ALTER TABLE um_vouchers_meta MODIFY delivery_status ENUM('pending', 'sent', 'failed', 'refunded') NOT NULL DEFAULT 'pending'");
        $this->db->exec("CREATE TABLE IF NOT EXISTS um_agent_wallets (admin_id INT PRIMARY KEY, balance DECIMAL(14,2) NOT NULL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_wallet_admin FOREIGN KEY (admin_id) REFERENCES um_admins(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $this->db->exec("CREATE TABLE IF NOT EXISTS um_wallet_transactions (id BIGINT AUTO_INCREMENT PRIMARY KEY, admin_id INT NOT NULL, transaction_type ENUM('credit','voucher_sale','adjustment','refund') NOT NULL, amount DECIMAL(14,2) NOT NULL, balance_after DECIMAL(14,2) NOT NULL, reference_type VARCHAR(32) NULL, reference_id VARCHAR(64) NULL, notes VARCHAR(255) NULL, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_wallet_admin_date(admin_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    // ==========================================
    // METHOD: getAgentWallet
    // ==========================================
    public function getAgentWallet($adminId = null): array {
        $this->ensureVoucherCommerceSchema();
        $ctx = $this->getActiveAdminContext();
        $networkId = $this->getActiveNetworkId();
        $id = $adminId ? (int)$adminId : (int)$ctx['id'];
        if ($id !== (int)$ctx['id'] && !in_array($ctx['role'], ['system_owner', 'superadmin'], true)) throw new Exception('غير مصرح بعرض محفظة حساب آخر');
        if(!$this->getAdminById($id)) throw new DomainException('FORBIDDEN_NETWORK');
        $this->db->prepare("INSERT IGNORE INTO um_agent_wallets (network_id,admin_id,balance) VALUES (?,?,0)")->execute([$networkId,$id]);
        $st = $this->db->prepare("SELECT w.admin_id,w.balance,w.updated_at,a.fullname,a.username FROM um_agent_wallets w JOIN um_admins a ON a.id=w.admin_id WHERE w.network_id=? AND w.admin_id=?"); $st->execute([$networkId,$id]);
        $wallet = $st->fetch(PDO::FETCH_ASSOC);
        $tx = $this->db->prepare("SELECT id,transaction_type,amount,balance_after,reference_type,reference_id,notes,created_at FROM um_wallet_transactions WHERE network_id=? AND admin_id=? ORDER BY id DESC LIMIT 100"); $tx->execute([$networkId,$id]);
        return ['success'=>true,'wallet'=>$wallet,'transactions'=>$tx->fetchAll(PDO::FETCH_ASSOC)];
    }

    // ==========================================
    // METHOD: creditAgentWallet
    // ==========================================
    public function creditAgentWallet(array $data): array {
        $this->ensureVoucherCommerceSchema(); $ctx=$this->getActiveAdminContext(); $networkId=$this->getActiveNetworkId();
        if (!in_array($ctx['role'], ['system_owner', 'superadmin'], true)) throw new Exception('شحن محافظ الوكلاء مخصص للمسؤول');
        $adminId=(int)($data['admin_id']??0); $amount=round((float)($data['amount']??0),2); $notes=trim((string)($data['notes']??'شحن رصيد'));
        if($adminId<=0 || $amount<=0) throw new Exception('حدد الوكيل ومبلغ شحن صحيح');
        if(!$this->getAdminById($adminId)) throw new DomainException('FORBIDDEN_NETWORK');
        $this->db->beginTransaction(); try { $this->db->prepare("INSERT IGNORE INTO um_agent_wallets (network_id,admin_id,balance) VALUES (?,?,0)")->execute([$networkId,$adminId]); $this->db->prepare("UPDATE um_agent_wallets SET balance=balance+? WHERE network_id=? AND admin_id=?")->execute([$amount,$networkId,$adminId]); $q=$this->db->prepare("SELECT balance FROM um_agent_wallets WHERE network_id=? AND admin_id=?");$q->execute([$networkId,$adminId]);$balance=(float)$q->fetchColumn(); $this->db->prepare("INSERT INTO um_wallet_transactions(network_id,admin_id,transaction_type,amount,balance_after,reference_type,notes,created_by) VALUES(?,?,'credit',?,?, 'wallet_credit',?,?)")->execute([$networkId,$adminId,$amount,$balance,$notes,$ctx['id']]); $this->db->commit(); return ['success'=>true,'balance'=>$balance]; } catch(Throwable $e){$this->db->rollBack();throw $e;}
    }

    // ==========================================
    // METHOD: sellVoucherFromWallet
    // ==========================================
    public function sellVoucherFromWallet(array $data): array {
        $this->ensureVoucherCommerceSchema(); $ctx=$this->getActiveAdminContext(); $networkId=$this->getActiveNetworkId(); $adminId=(int)$ctx['id'];
        $profileName=trim((string)($data['profile_name']??'')); $phone=preg_replace('/\D/','',(string)($data['phone']??'')); $buyerName=trim((string)($data['buyer_name']??''));
        if(!preg_match('/^\d{9}$/',$phone)) throw new Exception('رقم واتساب يمني يجب أن يتكون من 9 أرقام دون مفتاح الدولة');
        $p=$this->db->prepare("SELECT name,validity,cost_price,retail_price,price FROM um_profiles_def WHERE network_id=? AND name=? LIMIT 1");$p->execute([$networkId,$profileName]);$profile=$p->fetch(PDO::FETCH_ASSOC); if(!$profile) throw new Exception('الباقة غير موجودة في الشبكة النشطة');
        $cost=round((float)$profile['cost_price'],2); $retail=round((float)($profile['retail_price']>0?$profile['retail_price']:$profile['price']),2); if($cost<=0) throw new Exception('يجب تحديد تكلفة الكرت في الباقة قبل البيع من المحفظة');
        $this->db->beginTransaction(); try { $this->db->prepare("INSERT IGNORE INTO um_agent_wallets(network_id,admin_id,balance) VALUES(?,?,0)")->execute([$networkId,$adminId]); $debit=$this->db->prepare("UPDATE um_agent_wallets SET balance=balance-? WHERE network_id=? AND admin_id=? AND balance>=?");$debit->execute([$cost,$networkId,$adminId,$cost]);if($debit->rowCount()!==1) throw new Exception('رصيد المحفظة غير كافٍ لإصدار هذا الكرت');
            do {$code=(string)random_int(10000000,99999999);$c=$this->db->prepare("SELECT 1 FROM um_vouchers_meta WHERE network_id=? AND username=?");$c->execute([$networkId,$code]);} while($c->fetchColumn());
            $this->db->prepare("INSERT INTO radcheck(network_id,username,attribute,op,value) VALUES(?,?,'Cleartext-Password',':=',?)")->execute([$networkId,$code,$code]); $this->db->prepare("INSERT INTO radusergroup(network_id,username,groupname,priority) VALUES(?,?,?,1)")->execute([$networkId,$code,$profileName]);
            $profit=$retail-$cost; $this->db->prepare("INSERT INTO um_vouchers_meta(network_id,username,batch_id,profile_name,price,validity,status,comment,owner_admin_id,sold_by_admin_id,sold_at,sale_price,purchase_cost,profit_amount,buyer_phone,buyer_name,is_sold,delivery_status) VALUES(?, ?, ?, ?, ?, ?, 'active', 'بيع إلكتروني بالمحفظة', ?, ?, NOW(), ?, ?, ?, ?, ?, 1, 'pending')")->execute([$networkId,$code,'WALLET-'.date('Ymd'),$profileName,$retail,$profile['validity'],$adminId,$adminId,$retail,$cost,$profit,$phone,$buyerName?:null]);
            $q=$this->db->prepare("SELECT balance FROM um_agent_wallets WHERE network_id=? AND admin_id=?");$q->execute([$networkId,$adminId]);$balance=(float)$q->fetchColumn(); $this->db->prepare("INSERT INTO um_wallet_transactions(network_id,admin_id,transaction_type,amount,balance_after,reference_type,reference_id,notes,created_by) VALUES(?,?,'voucher_sale',?,?,?,?,?)")->execute([$networkId,$adminId,-$cost,$balance,'voucher',$code,'إصدار كرت '.$profileName,$adminId]); $this->db->commit();
        } catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
        // Generate Template-Matched Card Image and Dispatch via WhatsApp
        $sent = false;
        $err = null;
        try {
            require_once __DIR__ . '/CardImageService.php';
            $imgService = new CardImageService($this->db);
            $cardBase64 = $imgService->generateCardImageBase64([
                'username' => $code,
                'password' => $code,
                'profile_name' => $profile['name'],
                'price' => number_format($retail, 2),
                'validity' => $profile['validity']
            ], $networkId);

            $wa = $this->getNotificationService()->getWhatsAppService()->sendMedia(
                '967' . $phone,
                $cardBase64,
                $message,
                'image/png',
                "card_{$code}.png",
                'voucher_' . $code,
                $adminId,
                'paid_voucher'
            );
            $sent = !empty($wa['success']);
            $err = $wa['error'] ?? null;
        } catch (Throwable $imgEx) {
            error_log("CardImage generation error: " . $imgEx->getMessage());
        }

        if (!$sent) {
            $wa = $this->getNotificationService()->getWhatsAppService()->sendMessage('967' . $phone, $message, 'voucher_' . $code, $adminId);
            $sent = !empty($wa['success']);
            $err = $wa['error'] ?? $err;
        }

        $this->db->prepare("UPDATE um_vouchers_meta SET delivery_status=?,delivered_at=? WHERE network_id=? AND username=?")->execute([$sent?'sent':'failed',$sent?date('Y-m-d H:i:s'):null,$networkId,$code]);
        $this->db->prepare("INSERT INTO um_notification_logs(network_id,channel,event_type,recipient_phone,recipient_name,message_text,status,error_message,reference_id,created_by) VALUES(?,'whatsapp','paid_voucher',?,?,?,?,?,?,?)")->execute([$networkId,$phone,$buyerName?:'عميل نقدي',$message,$sent?'sent':'failed',$err,$code,$adminId]);
        return ['success'=>true,'wallet_balance'=>$balance,'phone'=>$phone,'delivery_status'=>$sent?'sent':'failed','message'=>$sent?'تم إرسال صورة وبيانات الكرت إلى واتساب العميل بنجاح':'تم إصدار الكرت لكن تعذر إرساله إلى واتساب؛ استخدم إعادة الإرسال من سجل التسليم'];
    }

    // ==========================================
    // METHOD: getPaidVoucherDeliveries
    // ==========================================
    public function getPaidVoucherDeliveries(): array {
        $this->ensureVoucherCommerceSchema(); $ctx=$this->getActiveAdminContext(); $networkId=$this->getActiveNetworkId(); $where='network_id=?'; $params=[$networkId];
        if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true)){ $where.=' AND sold_by_admin_id=?';$params[]=$ctx['id']; }
        $st=$this->db->prepare("SELECT id,profile_name,buyer_phone,buyer_name,sale_price,purchase_cost,profit_amount,delivery_status,delivered_at,sold_at FROM um_vouchers_meta WHERE $where AND comment='بيع إلكتروني بالمحفظة' ORDER BY id DESC LIMIT 200");$st->execute($params);
        return ['success'=>true,'deliveries'=>$st->fetchAll(PDO::FETCH_ASSOC)];
    }

    // ==========================================
    // METHOD: resendPaidVoucherWhatsApp
    // ==========================================
    public function resendPaidVoucherWhatsApp($voucherId): array {
        $this->ensureVoucherCommerceSchema();$ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();$st=$this->db->prepare("SELECT * FROM um_vouchers_meta WHERE network_id=? AND id=? LIMIT 1");$st->execute([$networkId,(int)$voucherId]);$v=$st->fetch(PDO::FETCH_ASSOC);if(!$v)throw new Exception('الكرت غير موجود في الشبكة النشطة');if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true) && (int)$v['sold_by_admin_id']!==(int)$ctx['id'])throw new Exception('غير مصرح');if($v['delivery_status']==='refunded')throw new Exception('تم استرجاع هذه الفاتورة ولا يمكن إرسال الكرت');
        $message="🏢 *SAM | كرت إنترنت مدفوع*\n━━━━━━━━━━━━━━━━━━━━\n🎫 *رقم الكرت:* `{$v['username']}`\n📦 *الباقة:* {$v['profile_name']}\n💰 *سعر البيع:* ".number_format((float)$v['sale_price'],2)." YER\n⏳ *الصلاحية:* {$v['validity']}\n━━━━━━━━━━━━━━━━━━━━\nشكراً لاستخدامكم خدمتنا.";

        $sent = false;
        $err = null;
        try {
            require_once __DIR__ . '/CardImageService.php';
            $imgService = new CardImageService($this->db);
            $cardBase64 = $imgService->generateCardImageBase64([
                'username' => $v['username'],
                'password' => $v['username'],
                'profile_name' => $v['profile_name'],
                'price' => number_format((float)$v['sale_price'], 2),
                'validity' => $v['validity'] ?? ''
            ], $networkId);

            $wa = $this->getNotificationService()->getWhatsAppService()->sendMedia(
                '967' . $v['buyer_phone'],
                $cardBase64,
                $message,
                'image/png',
                "card_{$v['username']}.png",
                'voucher_' . $v['username'],
                $ctx['id'],
                'paid_voucher'
            );
            $sent = !empty($wa['success']);
            $err = $wa['error'] ?? null;
        } catch (Throwable $imgEx) {
            error_log("CardImage generation error: " . $imgEx->getMessage());
        }

        if (!$sent) {
            $wa = $this->getNotificationService()->getWhatsAppService()->sendMessage('967' . $v['buyer_phone'], $message, 'voucher_' . $v['username'], $ctx['id']);
            $sent = !empty($wa['success']);
            $err = $wa['error'] ?? $err;
        }

        $this->db->prepare("UPDATE um_vouchers_meta SET delivery_status=?,delivered_at=? WHERE network_id=? AND id=?")->execute([$sent?'sent':'failed',$sent?date('Y-m-d H:i:s'):null,$networkId,$v['id']]);
        $this->db->prepare("INSERT INTO um_notification_logs(network_id,channel,event_type,recipient_phone,recipient_name,message_text,status,error_message,reference_id,created_by) VALUES(?,'whatsapp','paid_voucher',?,?,?,?,?,?,?)")->execute([$networkId,$v['buyer_phone'],$v['buyer_name']?:'عميل نقدي',$message,$sent?'sent':'failed',$err,$v['username'],$ctx['id']]);
        return ['success'=>$sent,'delivery_status'=>$sent?'sent':'failed','phone'=>$v['buyer_phone'],'error'=>$err];
    }

    // ==========================================
    // METHOD: refundFailedWalletVoucher
    // ==========================================
    public function refundFailedWalletVoucher($voucherId): array {
        $this->ensureVoucherCommerceSchema();$ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();$this->db->beginTransaction();try{$st=$this->db->prepare("SELECT * FROM um_vouchers_meta WHERE network_id=? AND id=? FOR UPDATE");$st->execute([$networkId,(int)$voucherId]);$v=$st->fetch(PDO::FETCH_ASSOC);if(!$v)throw new Exception('الفاتورة غير موجودة في الشبكة النشطة');if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true) && (int)$v['sold_by_admin_id']!==(int)$ctx['id'])throw new Exception('غير مصرح');if($v['delivery_status']!=='failed')throw new Exception('لا يمكن الاسترجاع إلا عندما تكون رسالة واتساب فاشلة');$exists=$this->db->prepare("SELECT 1 FROM um_wallet_transactions WHERE network_id=? AND reference_type='voucher_refund' AND reference_id=?");$exists->execute([$networkId,$v['username']]);if($exists->fetchColumn())throw new Exception('تم استرجاع هذه العملية مسبقًا');$adminId=(int)$v['sold_by_admin_id'];$refund=(float)$v['purchase_cost'];$this->db->prepare("UPDATE um_agent_wallets SET balance=balance+? WHERE network_id=? AND admin_id=?")->execute([$refund,$networkId,$adminId]);$q=$this->db->prepare("SELECT balance FROM um_agent_wallets WHERE network_id=? AND admin_id=?");$q->execute([$networkId,$adminId]);$balance=(float)$q->fetchColumn();$this->db->prepare("INSERT INTO um_wallet_transactions(network_id,admin_id,transaction_type,amount,balance_after,reference_type,reference_id,notes,created_by) VALUES(?,?,'refund',?,?,?,?,?)")->execute([$networkId,$adminId,$refund,$balance,'voucher_refund',$v['username'],'استرجاع كرت فشل إرساله',$ctx['id']]);$this->db->prepare("UPDATE um_vouchers_meta SET status='disabled',is_sold=0,delivery_status='refunded',comment='مسترجع بسبب فشل إرسال واتساب' WHERE network_id=? AND id=?")->execute([$networkId,$v['id']]);$this->db->prepare("DELETE FROM radcheck WHERE network_id=? AND username=?")->execute([$networkId,$v['username']]);$this->db->prepare("DELETE FROM radusergroup WHERE network_id=? AND username=?")->execute([$networkId,$v['username']]);$this->db->commit();return ['success'=>true,'wallet_balance'=>$balance,'message'=>'تم استرجاع تكلفة الكرت إلى المحفظة وتعطيل الكرت'];}catch(Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }

    // ==========================================
    // METHOD: getInstantBalanceInventory
    // ==========================================
    public function getInstantBalanceInventory(): array { $ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();$id=(int)$ctx['id'];$q=$this->db->prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())");$q->execute([$networkId,$id]);return ['success'=>true,'available'=>(float)$q->fetchColumn()]; }

    // ==========================================
    // METHOD: grantInstantBalance
    // ==========================================
    public function grantInstantBalance(array $d): array { $ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true))throw new Exception('المنح الأولي للرصيد مخصص للمدير');$to=(int)($d['receiver_admin_id']??0);$amt=(float)($d['amount']??0);$exp=trim($d['expires_at']??'');if($to<=0||$amt<=0)throw new Exception('حدد المستلم والمبلغ');if(!$this->getAdminById($to))throw new DomainException('FORBIDDEN_NETWORK');$this->db->prepare("INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,original_amount,remaining_amount,expires_at,granted_by_admin_id) VALUES(?,?,?,?,?,?)")->execute([$networkId,$to,$amt,$amt,$exp?:null,$ctx['id']]);return ['success'=>true]; }

    // ==========================================
    // METHOD: transferInstantBalance
    // ==========================================
    public function transferInstantBalance(array $d): array { $ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();$from=(int)$ctx['id'];$to=(int)($d['receiver_admin_id']??0);$amt=round((float)($d['amount']??0),2);if($to<=0||$amt<=0)throw new Exception('حدد المستلم والمبلغ');$target=$this->getAdminById($to);if(!$target)throw new DomainException('FORBIDDEN_NETWORK');$parent=(int)$target['parent_id'];if(!in_array($ctx['role'], ['system_owner', 'superadmin'], true)&&$parent!==$from)throw new Exception('يمكن التحويل للوكيل التابع لك فقط');$this->db->beginTransaction();try{$left=$amt;$lots=$this->db->prepare("SELECT * FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY COALESCE(expires_at,'9999-12-31'),id FOR UPDATE");$lots->execute([$networkId,$from]);foreach($lots->fetchAll(PDO::FETCH_ASSOC) as $lot){if($left<=0)break;$take=min($left,(float)$lot['remaining_amount']);$this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount=remaining_amount-?,status=IF(remaining_amount-?<=0,'depleted','active') WHERE network_id=? AND id=?")->execute([$take,$take,$networkId,$lot['id']]);$this->db->prepare("INSERT INTO um_instant_balance_lots(network_id,owner_admin_id,source_lot_id,original_amount,remaining_amount,expires_at,granted_by_admin_id) VALUES(?,?,?,?,?,?,?)")->execute([$networkId,$to,$lot['id'],$take,$take,$lot['expires_at'],$from]);$left-=$take;}if($left>0)throw new Exception('الرصيد الصالح غير كافٍ');$no='IBT-'.date('YmdHis').'-'.random_int(10,99);$this->db->prepare("INSERT INTO um_instant_balance_transfers(network_id,transfer_no,sender_admin_id,receiver_admin_id,amount,expires_at,notes) VALUES(?,?,?,?,?,?,?)")->execute([$networkId,$no,$from,$to,$amt,$d['expires_at']??null,$d['notes']??null]);$this->db->commit();return ['success'=>true,'transfer_no'=>$no];}catch(Throwable $e){$this->db->rollBack();throw $e;} }

    // ==========================================
    // METHOD: sellInstantBalance
    // ==========================================
    public function sellInstantBalance(array $d): array { $ctx=$this->getActiveAdminContext();$networkId=$this->getActiveNetworkId();$seller=(int)$ctx['id'];$amt=round((float)($d['amount']??0),2);if($amt<=0)throw new Exception('حدد مبلغ البيع');$phone=preg_replace('/\D/','',(string)($d['buyer_phone']??''));if($phone!==''&&!preg_match('/^\d{9}$/',$phone))throw new Exception('رقم الهاتف اليمني 9 أرقام');$buyerId=!empty($d['buyer_admin_id'])?(int)$d['buyer_admin_id']:null;if($buyerId)$this->getAdminById($buyerId);$this->db->beginTransaction();try{$left=$amt;$q=$this->db->prepare("SELECT * FROM um_instant_balance_lots WHERE network_id=? AND owner_admin_id=? AND status='active' AND remaining_amount>0 AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY COALESCE(expires_at,'9999-12-31'),id FOR UPDATE");$q->execute([$networkId,$seller]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $l){if($left<=0)break;$x=min($left,(float)$l['remaining_amount']);$this->db->prepare("UPDATE um_instant_balance_lots SET remaining_amount=remaining_amount-?,status=IF(remaining_amount-?<=0,'depleted','active') WHERE network_id=? AND id=?")->execute([$x,$x,$networkId,$l['id']]);$left-=$x;}if($left>0)throw new Exception('الرصيد الفوري الصالح غير كافٍ');$no='IBS-'.date('YmdHis').'-'.random_int(10,99);$discRate=min(5.0,max(0.0,(float)($d['discount_rate']??0)));$disc=$discRate>0?round($amt*$discRate/100,2):max(0,(float)($d['discount_amount']??0));$paid=max(0,(float)($d['paid_amount']??$amt-$disc));$this->db->prepare("INSERT INTO um_instant_balance_invoices(network_id,invoice_no,seller_admin_id,buyer_admin_id,buyer_phone,buyer_name,amount,discount_amount,paid_amount,remaining_amount,expires_at,payment_type,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")->execute([$networkId,$no,$seller,$buyerId,$phone?:null,trim($d['buyer_name']??'')?:null,$amt,$disc,$paid,max(0,$amt-$disc-$paid),$d['expires_at']??null,$d['payment_type']??'cash',$d['notes']??null]);$this->db->commit();return ['success'=>true,'invoice_no'=>$no];}catch(Throwable $e){$this->db->rollBack();throw $e;}}

    // ==========================================
    // SECTION: POS FREE VOUCHER RULES & SALES-BASED GRANTS
    // ==========================================

    /**
     * Get configured POS Free Voucher Rules for the active network
     */
    public function getPosFreeVoucherRules($callerAdminId = 0, $callerAdminRole = 'superadmin', $dataScope = 'all') {
        $networkId = $this->getActiveNetworkId();
        $this->enforcePermission(["free_vouchers", "distributors", "warehouses"], "عرض قواعد منح الكروت المجانية لنقاط البيع");
        
        $sql = "
            SELECT r.*,
                   COALESCE(a.fullname, 'جميع نقاط البيع بالشبكة (عامة)') AS pos_name,
                   COALESCE(a.username, '') AS pos_username,
                   COALESCE(a.phone, '') AS pos_phone,
                   COALESCE(r_def.role_name_ar, a.role) AS pos_role_ar,
                   a.parent_id AS pos_parent_id,
                   parent.fullname AS parent_pos_name,
                   COALESCE(p_paid.name_for_users, r.paid_profile_name) AS paid_profile_label,
                   p_paid.price AS paid_profile_price,
                   COALESCE(p.name_for_users, r.profile_name) AS profile_label,
                   p.price AS profile_price,
                   p.transfer_limit,
                   p.validity AS profile_validity,
                   (SELECT COUNT(*) FROM um_pos_free_voucher_grants g WHERE g.network_id = r.network_id AND g.rule_id = r.id) AS total_grants_count,
                   (SELECT COALESCE(SUM(g.granted_cards_count), 0) FROM um_pos_free_voucher_grants g WHERE g.network_id = r.network_id AND g.rule_id = r.id) AS total_granted_cards
            FROM um_pos_free_voucher_rules r
            LEFT JOIN um_admins a ON a.id = r.pos_admin_id
            LEFT JOIN um_admins parent ON a.parent_id = parent.id
            LEFT JOIN um_roles_def r_def ON a.role COLLATE utf8mb4_unicode_ci = r_def.role_key COLLATE utf8mb4_unicode_ci
            LEFT JOIN um_profiles_def p_paid ON p_paid.network_id = r.network_id AND p_paid.name COLLATE utf8mb4_unicode_ci = r.paid_profile_name COLLATE utf8mb4_unicode_ci
            LEFT JOIN um_profiles_def p ON p.network_id = r.network_id AND p.name COLLATE utf8mb4_unicode_ci = r.profile_name COLLATE utf8mb4_unicode_ci
            WHERE r.network_id = :network_id
            ORDER BY r.pos_admin_id ASC, r.id DESC
        ";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':network_id' => $networkId]);
        $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['success' => true, 'rules' => $rules];
    }

    /**
     * Save or update a POS Free Voucher Rule
     */
    public function savePosFreeVoucherRule(array $data) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "إضافة أو تعديل قاعدة منح الكروت لنقاط البيع");
        $ruleId = (int)($data['id'] ?? 0);
        $networkId = !empty($data['network_id']) ? (int)$data['network_id'] : 0;
        if ($networkId <= 0 && $ruleId > 0) {
            $chkRule = $this->db->prepare("SELECT network_id FROM um_pos_free_voucher_rules WHERE id = ?");
            $chkRule->execute([$ruleId]);
            $networkId = (int)$chkRule->fetchColumn();
        }
        if ($networkId <= 0) {
            $networkId = $this->getActiveNetworkId();
        }

        $ctx = $this->getActiveAdminContext();
        $actorId = (int)$ctx['id'];

        $posAdminId = (int)($data['pos_admin_id'] ?? 0);
        $paidProfileName = trim((string)($data['paid_profile_name'] ?? ''));
        $includeSubPos = !empty($data['include_sub_pos']) ? 1 : 0;
        $ruleType = in_array($data['rule_type'] ?? '', ['sheets_sales', 'revenue_sales', 'data_consumption'], true) ? $data['rule_type'] : 'sheets_sales';
        $thresholdValue = max(0.01, (float)($data['threshold_value'] ?? 1.0));
        $freeCardsCount = max(1, min(4, (int)($data['free_cards_count'] ?? 1)));
        $profileName = trim((string)($data['profile_name'] ?? ''));
        $sendMethod = in_array($data['send_method'] ?? '', ['whatsapp', 'sms', 'both', 'none'], true) ? $data['send_method'] : 'whatsapp';
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $notes = trim((string)($data['notes'] ?? ''));

        if (empty($paidProfileName)) {
            return ['error' => 'يرجى اختيار نوع الباقة المدفوعة المشتراة'];
        }

        if (empty($profileName)) {
            return ['error' => 'يرجى اختيار الباقة المجانية الممنوحة'];
        }

        // Strict Requirement: In sheet-based sales, cards per sheet cannot exceed 4 cards
        if ($ruleType === 'sheets_sales') {
            $maxAllowedCards = round(4 * $thresholdValue);
            if ($freeCardsCount > $maxAllowedCards) {
                return ['error' => "الحد الأقصى لعدد الكروت المجانية الممنوحة هو (4 كروت كحد أقصى لكل 1 ورقة مباعة). لقد حددت $freeCardsCount كرت لـ $thresholdValue ورقة."];
            }
        }

        // Validate Free Profile Existence in this network
        $chkP = $this->db->prepare("SELECT price, transfer_limit, validity, uptime_limit FROM um_profiles_def WHERE network_id=? AND name COLLATE utf8mb4_unicode_ci = ?");
        $chkP->execute([$networkId, $profileName]);
        $pRow = $chkP->fetch(PDO::FETCH_ASSOC);
        if (!$pRow) {
            return ['error' => 'الباقة المجانية المحددة غير موجودة في هذه الشبكة'];
        }

        // Validate Paid Profile Existence in this network
        $chkPaid = $this->db->prepare("SELECT price, transfer_limit, validity FROM um_profiles_def WHERE network_id=? AND name COLLATE utf8mb4_unicode_ci = ?");
        $chkPaid->execute([$networkId, $paidProfileName]);
        if (!$chkPaid->fetch(PDO::FETCH_ASSOC)) {
            return ['error' => 'الباقة المدفوعة المحددة غير موجودة في هذه الشبكة'];
        }

        // Uniqueness check: If a rule already exists for the same scope and paid profile, update it smoothly
        $chkDup = $this->db->prepare("
            SELECT id FROM um_pos_free_voucher_rules 
            WHERE network_id = ? AND pos_admin_id = ? AND paid_profile_name COLLATE utf8mb4_unicode_ci = ? AND id != ?
        ");
        $chkDup->execute([$networkId, $posAdminId, $paidProfileName, $ruleId]);
        $existingRuleId = (int)$chkDup->fetchColumn();
        if ($existingRuleId > 0 && $ruleId <= 0) {
            $ruleId = $existingRuleId;
        } elseif ($existingRuleId > 0 && $ruleId > 0) {
            $this->db->prepare("DELETE FROM um_pos_free_voucher_rules WHERE id = ? AND network_id = ?")->execute([$existingRuleId, $networkId]);
        }

        // Validate POS Admin if specific
        if ($posAdminId > 0) {
            $chkAdm = $this->db->prepare("
                SELECT a.id, a.fullname, a.role 
                FROM um_admins a
                JOIN um_admin_network_access na ON na.admin_id = a.id AND na.network_id = ? AND na.is_active = 1
                WHERE a.id = ?
            ");
            $chkAdm->execute([$networkId, $posAdminId]);
            if (!$chkAdm->fetch()) {
                return ['error' => 'نقطة البيع المختارة غير صالحة أو غير مسجلة في هذه الشبكة'];
            }
        }

        if ($ruleId > 0) {
            $stmt = $this->db->prepare("
                UPDATE um_pos_free_voucher_rules
                SET pos_admin_id = ?,
                    paid_profile_name = ?,
                    include_sub_pos = ?,
                    rule_type = ?,
                    threshold_value = ?,
                    free_cards_count = ?,
                    profile_name = ?,
                    send_method = ?,
                    is_active = ?,
                    notes = ?
                WHERE network_id = ? AND id = ?
            ");
            $stmt->execute([
                $posAdminId, $paidProfileName, $includeSubPos, $ruleType, $thresholdValue, $freeCardsCount,
                $profileName, $sendMethod, $isActive, $notes,
                $networkId, $ruleId
            ]);
            $msg = 'تم تحديث قاعدة المنح بنجاح';
        } else {
            $stmt = $this->db->prepare("
                INSERT INTO um_pos_free_voucher_rules
                (network_id, pos_admin_id, paid_profile_name, include_sub_pos, rule_type, threshold_value, free_cards_count, profile_name, send_method, is_active, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $networkId, $posAdminId, $paidProfileName, $includeSubPos, $ruleType, $thresholdValue, $freeCardsCount,
                $profileName, $sendMethod, $isActive, $notes, $actorId
            ]);
            $ruleId = (int)$this->db->lastInsertId();
            $msg = 'تمت إضافة قاعدة المنح لنقاط البيع بنجاح';
        }

        return ['success' => true, 'rule_id' => $ruleId, 'message' => $msg];
    }

    public function deletePosFreeVoucherRule(int $ruleId, int $networkId = 0) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "حذف قاعدة منح الكروت");
        if ($networkId <= 0) {
            $chk = $this->db->prepare("SELECT network_id FROM um_pos_free_voucher_rules WHERE id = ?");
            $chk->execute([$ruleId]);
            $networkId = (int)$chk->fetchColumn();
        }
        if ($networkId <= 0) {
            $networkId = $this->getActiveNetworkId();
        }
        
        $stmt = $this->db->prepare("DELETE FROM um_pos_free_voucher_rules WHERE id = ?");
        $stmt->execute([$ruleId]);

        return ['success' => true, 'message' => 'تم حذف قاعدة المنح بنجاح'];
    }

    /**
     * Calculate Eligibility of Points of Sale for Free Vouchers based on their sales/consumption rules
     */
    public function getPosFreeVoucherEligibility(int $filterRuleId = 0, int $filterPosId = 0) {
        $networkId = $this->getActiveNetworkId();
        $this->enforcePermission(["free_vouchers", "distributors", "warehouses"], "حساب استحقاق نقاط البيع للكروت المجانية");

        // Fetch active rules
        $ruleWhere = "r.network_id = :network_id AND r.is_active = 1";
        $ruleParams = [':network_id' => $networkId];
        if ($filterRuleId > 0) {
            $ruleWhere .= " AND r.id = :rule_id";
            $ruleParams[':rule_id'] = $filterRuleId;
        }
        if ($filterPosId > 0) {
            $ruleWhere .= " AND (r.pos_admin_id = :pos_id OR r.pos_admin_id = 0)";
            $ruleParams[':pos_id'] = $filterPosId;
        }

        $rulesStmt = $this->db->prepare("
            SELECT r.*,
                   COALESCE(p_paid.name_for_users, r.paid_profile_name) AS paid_profile_label,
                   COALESCE(p.name_for_users, r.profile_name) AS profile_label
            FROM um_pos_free_voucher_rules r
            LEFT JOIN um_profiles_def p_paid ON p_paid.network_id = r.network_id AND p_paid.name COLLATE utf8mb4_unicode_ci = r.paid_profile_name COLLATE utf8mb4_unicode_ci
            LEFT JOIN um_profiles_def p ON p.network_id = r.network_id AND p.name COLLATE utf8mb4_unicode_ci = r.profile_name COLLATE utf8mb4_unicode_ci
            WHERE $ruleWhere
            ORDER BY r.pos_admin_id DESC, r.id ASC
        ");
        $rulesStmt->execute($ruleParams);
        $rules = $rulesStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch all POS, distributors, and agents in this network
        $posStmt = $this->db->prepare("
            SELECT a.id, a.fullname, a.username, a.phone, COALESCE(nr.role_key, a.role) AS role,
                   COALESCE(r_def.role_name_ar, a.role) AS role_name_ar,
                   a.parent_id,
                   parent.fullname AS parent_name
            FROM um_admins a
            JOIN um_admin_network_access na ON na.admin_id = a.id AND na.network_id = ? AND na.is_active = 1
            LEFT JOIN um_admin_network_roles nr ON nr.admin_id = a.id AND nr.network_id = na.network_id AND nr.is_active = 1
            LEFT JOIN um_roles_def r_def ON COALESCE(nr.role_key, a.role) COLLATE utf8mb4_unicode_ci = r_def.role_key COLLATE utf8mb4_unicode_ci
            LEFT JOIN um_admins parent ON a.parent_id = parent.id
            WHERE COALESCE(nr.role_key, a.role) NOT IN ('superadmin')
            ORDER BY parent_name ASC, a.fullname ASC
        ");
        $posStmt->execute([$networkId]);
        $allPos = $posStmt->fetchAll(PDO::FETCH_ASSOC);

        $eligibilityList = [];

        foreach ($allPos as $pos) {
            $posId = (int)$pos['id'];
            if ($filterPosId > 0 && $posId !== $filterPosId) continue;

            // Find applicable rules for this POS: specific rule first, or global network rule (pos_admin_id = 0)
            $matchedRules = array_filter($rules, function($r) use ($posId) {
                return (int)$r['pos_admin_id'] === $posId || (int)$r['pos_admin_id'] === 0;
            });

            if (empty($matchedRules)) continue;

            // Sub-POS IDs under this master POS
            $childPosIds = [];
            foreach ($allPos as $sub) {
                if ((int)$sub['parent_id'] === $posId) {
                    $childPosIds[] = (int)$sub['id'];
                }
            }

            foreach ($matchedRules as $rule) {
                $ruleId = (int)$rule['id'];
                $includeSub = (int)$rule['include_sub_pos'] === 1;
                $targetPosIds = $includeSub ? array_merge([$posId], $childPosIds) : [$posId];
                $posPlaceholders = implode(',', $targetPosIds);

                $threshold = max(0.01, (float)$rule['threshold_value']);
                $grantRate = max(1, (int)$rule['free_cards_count']);
                $ruleType = $rule['rule_type'];

                $achievedUnits = 0.0;
                $soldSheetsCount = 0;
                $soldCardsCount = 0;
                $totalRevenue = 0.0;
                $consumedMB = 0.0;

                // Build paid profile filter if defined
                $profFilter = "";
                if (!empty($rule['paid_profile_name'])) {
                    $profFilter = " AND profile_name COLLATE utf8mb4_unicode_ci = " . $this->db->quote($rule['paid_profile_name']);
                }

                // 1. Calculate Sold Sheets and Sales Metrics
                $qSales = $this->db->query("
                    SELECT 
                        COUNT(DISTINCT CASE WHEN sheet_no > 0 THEN sheet_no END) AS sold_sheets,
                        COUNT(id) AS sold_cards,
                        COALESCE(SUM(sale_price), 0) AS total_revenue
                    FROM um_vouchers_meta
                    WHERE network_id = $networkId
                      AND is_free_quota = 0
                      $profFilter
                      AND (
                          is_sold = 1 
                          OR invoice_id IS NOT NULL 
                          OR first_login IS NOT NULL 
                          OR status IN ('used', 'expired') 
                          OR owner_admin_id IN ($posPlaceholders)
                      )
                      AND (sold_by_admin_id IN ($posPlaceholders) OR owner_admin_id IN ($posPlaceholders))
                ");
                if ($qSales) {
                    $salesRow = $qSales->fetch(PDO::FETCH_ASSOC);
                    $soldSheetsCount = (int)($salesRow['sold_sheets'] ?? 0);
                    $soldCardsCount = (int)($salesRow['sold_cards'] ?? 0);
                    $totalRevenue = (float)($salesRow['total_revenue'] ?? 0);
                }

                // 2. Calculate Consumed Traffic if rule is data_consumption
                if ($ruleType === 'data_consumption') {
                    $vmProfFilter = !empty($rule['paid_profile_name']) ? " AND vm.profile_name COLLATE utf8mb4_unicode_ci = " . $this->db->quote($rule['paid_profile_name']) : "";
                    $qAcct = $this->db->query("
                        SELECT COALESCE(SUM(ra.acctinputoctets + ra.acctoutputoctets), 0) AS total_octets
                        FROM radacct ra
                        JOIN um_vouchers_meta vm ON vm.network_id = ra.network_id AND vm.username = ra.username
                        WHERE ra.network_id = $networkId
                          AND vm.is_free_quota = 0
                          $vmProfFilter
                          AND (vm.sold_by_admin_id IN ($posPlaceholders) OR vm.owner_admin_id IN ($posPlaceholders))
                    ");
                    $octets = $qAcct ? (float)$qAcct->fetchColumn() : 0.0;
                    $consumedMB = round($octets / (1024 * 1024), 2);
                    $consumedGB = round($octets / (1024 * 1024 * 1024), 2);
                    $achievedUnits = $consumedGB;
                } elseif ($ruleType === 'revenue_sales') {
                    $achievedUnits = $totalRevenue;
                } else { // sheets_sales
                    $achievedUnits = (float)$soldSheetsCount;
                }

                // Total earned free cards based on rule
                $earnedCards = (int)(floor($achievedUnits / $threshold) * $grantRate);

                // Already granted cards for this POS and rule
                $qGranted = $this->db->query("
                    SELECT COALESCE(SUM(granted_cards_count), 0)
                    FROM um_pos_free_voucher_grants
                    WHERE network_id = $networkId AND pos_admin_id = $posId AND rule_id = $ruleId
                ");
                $alreadyGranted = $qGranted ? (int)$qGranted->fetchColumn() : 0;

                // Pending eligible cards
                $pendingCards = max(0, $earnedCards - $alreadyGranted);

                $eligibilityList[] = [
                    'rule_id' => $ruleId,
                    'rule_type' => $ruleType,
                    'rule_type_label' => ($ruleType === 'sheets_sales' ? 'مبيعات الأوراق (Sheets)' : ($ruleType === 'revenue_sales' ? 'المبيعات النقدية (YER)' : 'استهلاك البيانات (GB)')),
                    'paid_profile_name' => $rule['paid_profile_name'] ?? '',
                    'paid_profile_label' => $rule['paid_profile_label'] ?? $rule['paid_profile_name'] ?? 'كافة الباقات',
                    'threshold_value' => $threshold,
                    'free_cards_rate' => $grantRate,
                    'profile_name' => $rule['profile_name'],
                    'profile_label' => $rule['profile_label'] ?: $rule['profile_name'],
                    'include_sub_pos' => $includeSub,
                    'sub_pos_count' => count($childPosIds),
                    'pos_id' => $posId,
                    'pos_name' => $pos['fullname'],
                    'pos_username' => $pos['username'],
                    'pos_phone' => $pos['phone'],
                    'pos_role' => $pos['role'],
                    'pos_role_ar' => $pos['role_name_ar'] ?: $pos['role'],
                    'parent_id' => $pos['parent_id'],
                    'parent_name' => $pos['parent_name'],
                    'sold_sheets' => $soldSheetsCount,
                    'sold_cards' => $soldCardsCount,
                    'total_revenue' => $totalRevenue,
                    'consumed_mb' => $consumedMB,
                    'achieved_units' => $achievedUnits,
                    'earned_cards' => $earnedCards,
                    'already_granted_cards' => $alreadyGranted,
                    'pending_eligible_cards' => $pendingCards,
                    'can_grant' => ($pendingCards > 0)
                ];
            }
        }

        return [
            'success' => true,
            'eligibility' => $eligibilityList,
            'total_pending_cards' => array_sum(array_column($eligibilityList, 'pending_eligible_cards')),
            'total_eligible_pos' => count(array_filter($eligibilityList, fn($e) => $e['pending_eligible_cards'] > 0))
        ];
    }

    /**
     * Execute Free Voucher Grant to POS owner based on Sales / Sheets Eligibility
     */
    public function grantPosFreeVouchers(array $data) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "صرف الكروت المجانية المستحقة لنقاط البيع");
        $networkId = $this->getActiveNetworkId();
        $ctx = $this->getActiveAdminContext();
        $actorId = (int)$ctx['id'];

        $ruleId = (int)($data['rule_id'] ?? 0);
        $posAdminId = (int)($data['pos_admin_id'] ?? 0);
        $requestedCount = isset($data['cards_count']) ? (int)$data['cards_count'] : 0;
        $customNotes = trim((string)($data['notes'] ?? ''));

        if ($ruleId <= 0 || $posAdminId <= 0) {
            return ['error' => 'يرجى تحديد القاعدة ونقطة البيع المستهدفة'];
        }

        // Calculate current eligibility
        $eligRes = $this->getPosFreeVoucherEligibility($ruleId, $posAdminId);
        $matched = array_values(array_filter($eligRes['eligibility'] ?? [], function($e) use ($ruleId, $posAdminId) {
            return (int)$e['rule_id'] === $ruleId && (int)$e['pos_id'] === $posAdminId;
        }));

        if (empty($matched)) {
            return ['error' => 'لم يتم العثور على قاعدة استحقاق مطابقة لنقطة البيع المحددة'];
        }

        $posInfo = $matched[0];
        $pending = (int)$posInfo['pending_eligible_cards'];

        if ($pending <= 0) {
            return ['error' => 'لا توجد كروت مجانية مستحقة حالياً لصالح ' . $posInfo['pos_name'] . ' (تم صرف كافة المستحقات أو لم يتحقق شرط الورق/المبيعات)'];
        }

        $countToGrant = ($requestedCount > 0) ? min($requestedCount, $pending) : $pending;

        // Generate free vouchers
        $grantNote = "مكافأة مبيعات نقطة البيع [{$posInfo['pos_name']}] - استحقاق {$posInfo['sold_sheets']} ورقة مباعة";
        if (!empty($customNotes)) $grantNote .= " ($customNotes)";

        $grantPayload = [
            'recipient_id' => $posAdminId,
            'profile_name' => $posInfo['profile_name'],
            'count' => $countToGrant,
            'notes' => $grantNote,
            'grant_type' => 'pos_reward'
        ];

        $grantRes = $this->grantFreeVouchers($grantPayload, $actorId, $ctx['role'] ?? 'superadmin');
        if (empty($grantRes['success'])) {
            return ['error' => $grantRes['error'] ?? 'فشل توليد الكروت المجانية'];
        }

        $generatedCards = $grantRes['cards'] ?? [];

        // Log the grant in um_pos_free_voucher_grants
        $stmtLog = $this->db->prepare("
            INSERT INTO um_pos_free_voucher_grants
            (network_id, rule_id, pos_admin_id, beneficiary_admin_id, basis_type, basis_units, granted_cards_count, profile_name, voucher_codes, granted_by_admin_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmtLog->execute([
            $networkId,
            $ruleId,
            $posAdminId,
            $posAdminId,
            $posInfo['rule_type'],
            $posInfo['achieved_units'],
            $countToGrant,
            $posInfo['profile_name'],
            json_encode($generatedCards, JSON_UNESCAPED_UNICODE),
            $actorId,
            $grantNote
        ]);

        return [
            'success' => true,
            'granted_count' => $countToGrant,
            'cards' => $generatedCards,
            'pos_name' => $posInfo['pos_name'],
            'phone' => $posInfo['pos_phone'],
            'profile_name' => $posInfo['profile_name'],
            'message' => "تم بنجاح صرف $countToGrant كرت مجاني لصاحب نقطة البيع ({$posInfo['pos_name']})"
        ];
    }

    /**
     * Batch Grant All Eligible Free Vouchers to All Qualified Points of Sale
     */
    public function grantAllEligiblePosFreeVouchers(array $data = []) {
        $this->enforcePermission(["free_vouchers_schedule_add", "free_vouchers"], "صرف الكروت المستحقة لجميع نقاط البيع");
        $eligRes = $this->getPosFreeVoucherEligibility();
        $items = $eligRes['eligibility'] ?? [];
        $dispatched = [];
        $totalGranted = 0;

        foreach ($items as $item) {
            if ($item['pending_eligible_cards'] > 0) {
                $res = $this->grantPosFreeVouchers([
                    'rule_id' => $item['rule_id'],
                    'pos_admin_id' => $item['pos_id'],
                    'cards_count' => $item['pending_eligible_cards'],
                    'notes' => 'صرف كلي آلي للمستحقات'
                ]);
                if (!empty($res['success'])) {
                    $totalGranted += (int)$res['granted_count'];
                    $dispatched[] = $res;
                }
            }
        }

        return [
            'success' => true,
            'total_granted_cards' => $totalGranted,
            'points_count' => count($dispatched),
            'details' => $dispatched,
            'message' => "تم صرف $totalGranted كرت مجاني مستحق لـ " . count($dispatched) . " نقطة بيع بنجاح"
        ];
    }

    /**
     * Automatically Process Free Voucher Grants when a sales invoice is fully settled
     */
    public function processInvoiceFreeVouchersGrant(int $invoiceId, int $actorId = 1): array {
        if ($invoiceId <= 0) {
            return ['success' => false, 'error' => 'معرف الفاتورة غير صحيح'];
        }
        $networkId = $this->getActiveNetworkId();

        // 1. Fetch invoice
        $stmtInv = $this->db->prepare("SELECT * FROM um_sales_invoices WHERE id = ? AND network_id = ?");
        $stmtInv->execute([$invoiceId, $networkId]);
        $inv = $stmtInv->fetch(PDO::FETCH_ASSOC);
        if (!$inv) {
            return ['success' => false, 'error' => 'الفاتورة غير موجودة'];
        }

        // 2. Strict condition: Must be fully paid / remaining_amount <= 0
        if ((float)$inv['remaining_amount'] > 0.001) {
            return ['success' => false, 'status' => 'pending_payment', 'message' => 'الفاتورة غير مسددة بالكامل بعد'];
        }

        // 3. Prevent double granting for the same invoice
        $stmtChk = $this->db->prepare("SELECT COUNT(*) FROM um_pos_free_voucher_grants WHERE invoice_id = ? AND network_id = ?");
        $stmtChk->execute([$invoiceId, $networkId]);
        if ((int)$stmtChk->fetchColumn() > 0) {
            return ['success' => false, 'status' => 'already_granted', 'message' => 'تم صرف الكروت المجانية لهذه الفاتورة مسبقاً'];
        }

        $buyerId = (int)$inv['buyer_id'];
        $buyer = $this->getAdminById($buyerId);
        if (!$buyer) {
            return ['success' => false, 'error' => 'المشتري غير موجود'];
        }

        // 4. Fetch invoice items
        $stmtItems = $this->db->prepare("SELECT * FROM um_sales_invoice_items WHERE invoice_id = ? AND network_id = ?");
        $stmtItems->execute([$invoiceId, $networkId]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        if (empty($items)) {
            $items = [[
                'profile_name' => $inv['profile_name'],
                'sheets_count' => (int)($inv['sheets_count'] ?? 1),
                'cards_count' => (int)$inv['quantity']
            ]];
        }

        // 5. Fetch all active rules in this network
        $stmtRules = $this->db->prepare("SELECT * FROM um_pos_free_voucher_rules WHERE network_id = ? AND is_active = 1 ORDER BY pos_admin_id DESC, id ASC");
        $stmtRules->execute([$networkId]);
        $allRules = $stmtRules->fetchAll(PDO::FETCH_ASSOC);

        if (empty($allRules)) {
            return ['success' => false, 'status' => 'no_rules', 'message' => 'لا توجد قواعد منح كروت مجانية مفعلة بالشبكة'];
        }

        $totalGrantedCards = 0;
        $allGeneratedCards = [];
        $grantsSummary = [];

        foreach ($items as $item) {
            $paidProfile = trim((string)$item['profile_name']);
            if (empty($paidProfile)) continue;

            $sheetsCount = (int)($item['sheets_count'] ?? 0);
            if ($sheetsCount <= 0) {
                $cardsCount = (int)($item['cards_count'] ?? 0);
                $sheetsCount = $cardsCount > 0 ? max(1, (int)ceil($cardsCount / 20)) : 1;
            }

            // Priority matching (Specific POS Agent exemption overrides General Network Rule):
            // Priority 1: Specific rule for this buyer matching paid_profile_name
            // Priority 2: General rule (pos_admin_id = 0) matching paid_profile_name
            // Priority 3: Specific rule for this buyer with empty paid_profile_name (catch-all)
            // Priority 4: General rule with empty paid_profile_name (catch-all)
            $matchedRule = null;
            foreach ($allRules as $r) {
                if ((int)$r['pos_admin_id'] === $buyerId && !empty($r['paid_profile_name']) && strcasecmp($r['paid_profile_name'], $paidProfile) === 0) {
                    $matchedRule = $r;
                    break;
                }
            }
            if (!$matchedRule) {
                foreach ($allRules as $r) {
                    if ((int)$r['pos_admin_id'] === 0 && !empty($r['paid_profile_name']) && strcasecmp($r['paid_profile_name'], $paidProfile) === 0) {
                        $matchedRule = $r;
                        break;
                    }
                }
            }
            if (!$matchedRule) {
                foreach ($allRules as $r) {
                    if ((int)$r['pos_admin_id'] === $buyerId && empty($r['paid_profile_name'])) {
                        $matchedRule = $r;
                        break;
                    }
                }
            }
            if (!$matchedRule) {
                foreach ($allRules as $r) {
                    if ((int)$r['pos_admin_id'] === 0 && empty($r['paid_profile_name'])) {
                        $matchedRule = $r;
                        break;
                    }
                }
            }

            if (!$matchedRule) {
                continue; // No matching rule for this purchased package
            }

            $freeCardsPerSheet = max(1, min(4, (int)$matchedRule['free_cards_count']));
            $cardsToGrant = $sheetsCount * $freeCardsPerSheet;
            if ($cardsToGrant <= 0) continue;

            $grantNote = "مكافأة مبيعات ورقية مسددة بالكامل - فاتورة [{$inv['invoice_no']}] (باقة {$paidProfile} - {$sheetsCount} ورقة)";
            $grantPayload = [
                'recipient_id' => $buyerId,
                'profile_name' => $matchedRule['profile_name'],
                'count' => $cardsToGrant,
                'notes' => $grantNote
            ];

            $grantRes = $this->grantFreeVouchers($grantPayload, $actorId, 'superadmin');
            if (empty($grantRes['success'])) {
                error_log("processInvoiceFreeVouchersGrant: Failed to generate cards: " . ($grantRes['error'] ?? 'Unknown error'));
                continue;
            }

            $createdCards = $grantRes['cards'] ?? [];
            $totalGrantedCards += count($createdCards);
            $allGeneratedCards = array_merge($allGeneratedCards, $createdCards);

            // Log grant record
            $stmtLog = $this->db->prepare("
                INSERT INTO um_pos_free_voucher_grants
                (network_id, rule_id, invoice_id, paid_profile_name, pos_admin_id, beneficiary_admin_id, basis_type, basis_units, granted_cards_count, profile_name, voucher_codes, granted_by_admin_id, notes)
                VALUES (?, ?, ?, ?, ?, ?, 'sheets_sales', ?, ?, ?, ?, ?, ?)
            ");
            $stmtLog->execute([
                $networkId,
                (int)$matchedRule['id'],
                $invoiceId,
                $paidProfile,
                $buyerId,
                $buyerId,
                $sheetsCount,
                count($createdCards),
                $matchedRule['profile_name'],
                json_encode($createdCards, JSON_UNESCAPED_UNICODE),
                $actorId,
                $grantNote
            ]);

            $grantsSummary[] = [
                'rule_id' => $matchedRule['id'],
                'paid_profile' => $paidProfile,
                'free_profile' => $matchedRule['profile_name'],
                'sheets_count' => $sheetsCount,
                'granted_cards_count' => count($createdCards),
                'cards' => $createdCards,
                'send_method' => $matchedRule['send_method']
            ];
        }

        if (empty($allGeneratedCards)) {
            return ['success' => true, 'total_granted' => 0, 'message' => 'لم تطابق أصناف الفاتورة أي باقة لها قاعدة كروت مجانية'];
        }

        // Deliver to POS Agent via WhatsApp if phone exists
        $buyerPhone = preg_replace('/\D/', '', (string)($buyer['phone'] ?? ''));
        if (!empty($buyerPhone)) {
            $msg = "🎁 *مبروك! تم صرف كروت مجانية لمبيعاتك الورقية*\n";
            $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
            $msg .= "📋 *رقم الفاتورة:* {$inv['invoice_no']}\n";
            $msg .= "👤 *الوكيل / نقطة البيع:* {$buyer['fullname']}\n";
            $msg .= "✅ *حالة السداد:* مسددة بالكامل\n";
            $msg .= "🔢 *إجمالي الكروت المجانية:* {$totalGrantedCards} كرت\n";
            $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
            $msg .= "🎫 *تفاصيل الكروت الممنوحة:*\n";
            foreach ($allGeneratedCards as $idx => $c) {
                $num = $idx + 1;
                $msg .= "$num) كود: `{$c['username']}` (باقة: {$c['profile_name']})\n";
            }
            $msg .= "━━━━━━━━━━━━━━━━━━━━\n";
            $msg .= "🙏 شكراً لتعاملكم ونتمنى لكم مبيعات وفيرة!";

            try {
                $formattedPhone = str_starts_with($buyerPhone, '967') ? $buyerPhone : ('967' . ltrim($buyerPhone, '0'));
                $this->getNotificationService()->getWhatsAppService()->sendMessage(
                    $formattedPhone,
                    $msg,
                    'invoice_free_' . $invoiceId,
                    $actorId
                );
            } catch (Throwable $we) {
                error_log("processInvoiceFreeVouchersGrant WhatsApp delivery skipped: " . $we->getMessage());
            }
        }

        // In-App Notification
        try {
            $notifTitle = "🎁 صرف {$totalGrantedCards} كرت مجاني لمبيعات الفاتورة [{$inv['invoice_no']}]";
            $notifMsg = "تم آلياً توليد وتسليم {$totalGrantedCards} كرت مجاني لصالح الوكيل ({$buyer['fullname']}) نظير سداد الفاتورة [{$inv['invoice_no']}].";
            $this->db->prepare("
                INSERT INTO um_notifications (category, title, message, target_role, target_admin_id, is_read, created_at) 
                VALUES ('voucher', ?, ?, 'all', ?, 0, NOW())
            ")->execute([$notifTitle, $notifMsg, $buyerId]);
        } catch (Throwable $ne) {}

        return [
            'success' => true,
            'total_granted' => $totalGrantedCards,
            'grants' => $grantsSummary,
            'message' => "تم بنجاح توليد وصرف $totalGrantedCards كرت مجاني لصالح الوكيل ({$buyer['fullname']})"
        ];
    }

}


