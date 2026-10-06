<?php
declare(strict_types=1);

class HotspotTemplateService {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->ensureSchema();
    }

    private function ensureSchema(): void {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS `um_hotspot_settings` (
                    `network_id` INT NOT NULL PRIMARY KEY,
                    `theme_json` LONGTEXT NULL,
                    `brand_json` LONGTEXT NULL,
                    `contacts_json` LONGTEXT NULL,
                    `packages_json` LONGTEXT NULL,
                    `ads_json` LONGTEXT NULL,
                    `shortcuts_json` LONGTEXT NULL,
                    `login_options_json` LONGTEXT NULL,
                    `status_options_json` LONGTEXT NULL,
                    `updated_by_admin_id` INT NULL,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            // Check if shortcuts_json column exists
            $colCheck = $this->db->query("SHOW COLUMNS FROM `um_hotspot_settings` LIKE 'shortcuts_json'")->fetch();
            if (!$colCheck) {
                $this->db->exec("ALTER TABLE `um_hotspot_settings` ADD COLUMN `shortcuts_json` LONGTEXT NULL AFTER `ads_json`");
            }

            // Check if pos_json column exists
            $posCheck = $this->db->query("SHOW COLUMNS FROM `um_hotspot_settings` LIKE 'pos_json'")->fetch();
            if (!$posCheck) {
                $this->db->exec("ALTER TABLE `um_hotspot_settings` ADD COLUMN `pos_json` LONGTEXT NULL AFTER `shortcuts_json`");
            }
        } catch (Throwable $e) {
            error_log('HotspotTemplateService ensureSchema: ' . $e->getMessage());
        }
    }

    /**
     * Get default hotspot configuration for a network
     */
    public function getDefaultSettings(int $networkId = 0): array {
        $netName = 'شبكة الواي فاي';
        if ($networkId > 0) {
            $stmt = $this->db->prepare("SELECT name FROM um_networks WHERE id = ?");
            $stmt->execute([$networkId]);
            $found = $stmt->fetchColumn();
            if ($found) $netName = (string)$found;
        }

        return [
            'theme' => [
                'primary_color' => '#0284c7',
                'accent_color' => '#10b981',
                'bg_type' => 'gradient', // dark, gradient, solid, light
                'bg_gradient_start' => '#0b1120',
                'bg_gradient_end' => '#0c4a6e',
                'card_bg' => '#151f32',
                'card_border' => '#23334d',
                'text_color' => '#f8fafc',
                'text_muted' => '#94a3b8',
                'border_radius' => '16px',
                'theme_preset' => 'ocean_blue',
                'font_family' => 'Cairo'
            ],
            'brand' => [
                'network_name' => $netName,
                'slogan' => 'إنترنت فائق السرعة واستقرار عالي',
                'welcome_message' => 'أهلاً بك! أدخل رقم الكرت للاتصال بالإنترنت فوراً',
                'logo_url' => '',
                'logo_icon' => '📶',
                'server_api_url' => '', // API host URL e.g. http://192.168.3.2/
                'footer_text' => 'خدمة الإنترنت السريع والآمن | جميع الحقوق محفوظة'
            ],
            'contacts' => [
                'phones' => ['770000000'],
                'whatsapp' => '770000000',
                'whatsapp_message' => 'مرحباً، أود الاستفسار عن كروت وباقات الإنترنت في شبكة ' . $netName,
                'telegram' => '',
                'support_hours' => '24/7 على مدار الساعة',
                'pos_locations' => 'متوفر في جميع البقالات ومراكز التسوق ونقاط البيع المعتمدة'
            ],
            'packages_config' => [
                'enabled' => true,
                'title' => '💎 باقات وعروض الشبكة',
                'subtitle' => 'اختر الباقة المناسبة لاحتياجك واستمتع بأقصى سرعة',
                'show_order_btn' => true,
                'order_btn_text' => 'طلب الباقة ⚡',
                'whatsapp_msg_template' => 'مرحباً، أود الاشتراك في باقة {name} بسعر {price} من شبكة {network}',
                'package_items' => []
            ],
            'ads' => [
                'enabled' => true,
                'title' => '📢 العروض والإعلانات المتحركة',
                'rotation_speed' => 4, // seconds
                'animation' => 'slide', // slide or fade
                'items' => [
                    [
                        'id' => 1,
                        'title' => '⚡ باقات مميزة وسرعات مضاعفة',
                        'desc' => 'تصفح غير محدود وسرعات فائقة تناسب الألعاب ومقاطع الفيديو بدقة عالية.',
                        'badge' => 'عرض حصري',
                        'image_url' => '',
                        'link_url' => '',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ],
                    [
                        'id' => 2,
                        'title' => '💳 كروت متوفرة في جميع نقاط البيع',
                        'desc' => 'يمكنك شراء وتجديد رصيدك من أقرب نقطة بيع أو عبر الواتساب مباشرة.',
                        'badge' => 'جديد',
                        'image_url' => '',
                        'link_url' => '',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ]
                ]
            ],
            'shortcuts' => [
                'enabled' => true,
                'title' => '🌟 خدمات وروابط الشبكة الترفيهية',
                'subtitle' => 'بث مباشر، خدمات الاستراحات، وسيرفرات ترفيهية داخلية بدون استهلاك رصيد',
                'items' => [
                    [
                        'id' => 1,
                        'title' => '⚽ بث مباشر للمباريات',
                        'desc' => 'مشاهدة مباريات اليوم بجودة عالية وبث مباشر سريع بدون تقطيع',
                        'badge' => 'مباشر',
                        'icon' => '⚽',
                        'url' => 'http://192.168.88.254:8080/live',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ],
                    [
                        'id' => 2,
                        'title' => '🌴 استراحة وشاليهات',
                        'desc' => 'حجز وخدمات الاستراحات والشاليهات والمرافق الترفيهية',
                        'badge' => 'استراحة',
                        'icon' => '🌴',
                        'url' => 'http://192.168.88.254/lounge',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ],
                    [
                        'id' => 3,
                        'title' => '📺 سيرفر الأفلام والمسلسلات',
                        'desc' => 'تصفح مكتبة الأفلام والمسلسلات والبرامج المحلية بسرعة فائقة',
                        'badge' => 'سيرفر محلي',
                        'icon' => '📺',
                        'url' => 'http://192.168.88.254:8096',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ],
                    [
                        'id' => 4,
                        'title' => '🎮 ألعاب وبطولات الشبكة',
                        'desc' => 'سيرفر الألعاب المحلية والبطولات التنافسية بين المشتركين',
                        'badge' => 'ألعاب',
                        'icon' => '🎮',
                        'url' => 'http://192.168.88.254:3000',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ]
                ]
            ],
            'pos_config' => [
                'enabled' => true,
                'auto_sync_admins' => true,
                'title' => '🏪 مراكز ونقاط بيع وتوزيع الكروت المعتمدة',
                'subtitle' => 'تفضل بزيارة أقرب موزع أو مركز بيع معتمد لشراء وتجديد باقات وكروت الإنترنت فوراً',
                'search_placeholder' => '🔍 ابحث عن أقرب مركز بيع، حي، شارع أو رقم هاتف...',
                'items' => [
                    [
                        'id' => 1,
                        'name' => 'مركز الأمل للخدمات والاتصالات',
                        'phone' => '770000001',
                        'whatsapp' => '770000001',
                        'address' => 'الشارع العام - بجوار بنك التضامن',
                        'working_hours' => '8:00 ص - 11:30 م',
                        'badge' => 'مركز رئيسي ⭐',
                        'map_url' => '',
                        'notes' => 'متوفر جميع فئات الكروت والباقات والشحن الفوري',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ],
                    [
                        'id' => 2,
                        'name' => 'سوبر ماركت النور والبركة',
                        'phone' => '770000002',
                        'whatsapp' => '770000002',
                        'address' => 'حي السلام - جوار مدرسة النجاح',
                        'working_hours' => '24 ساعة (خدمة متواصلة)',
                        'badge' => 'نقطة بيع معتمدة',
                        'map_url' => '',
                        'notes' => 'خدمة متواصلة على مدار الساعة',
                        'show_on_login' => true,
                        'show_on_status' => true,
                        'enabled' => true
                    ]
                ]
            ],
            'login_options' => [
                'mode' => 'pin_only', // pin_only or user_pass
                'allow_trial' => false,
                'trial_uptime' => '5m',
                'show_qr_scanner' => true,
                'show_packages' => true,
                'show_contacts' => true,
                'show_ads' => true,
                'show_shortcuts' => true,
                'show_pos' => true,
                'remember_cards' => true, // Save up to 3 previous cards
                'max_recent_cards' => 3,
                'auto_login' => true,    // Auto login via saved card cookie
                'auto_login_delay' => 2  // seconds
            ],
            'status_options' => [
                'show_quota_circle' => true,
                'show_time_remaining' => true,
                'show_traffic_meter' => true,
                'show_speed_selector' => true,
                'show_device_limit' => true,
                'show_mac_lock' => true,
                'show_connected_devices' => true,
                'show_ads' => true,
                'show_shortcuts' => true,
                'show_pos' => true,
                'show_support' => true,
                'allow_logout' => true,
                'auto_refresh_enabled' => true,
                'auto_refresh_interval' => 15,
                'allow_user_toggle_refresh' => true
            ]
        ];
    }

    /**
     * Get active network packages from um_profiles_def
     */
    public function getNetworkPackages(int $networkId): array {
        $stmt = $this->db->prepare("
            SELECT id, name, name_for_users, package_type, price, retail_price, validity, rate_limit, shared_users, transfer_limit
            FROM um_profiles_def
            WHERE network_id = ?
            ORDER BY (package_type = 'free') DESC, COALESCE(retail_price, price) ASC, id ASC
        ");
        $stmt->execute([$networkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $list = [];
        foreach ($rows as $r) {
            $quotaMb = 0;
            if (!empty($r['transfer_limit']) && is_numeric($r['transfer_limit'])) {
                $quotaMb = (int)round((float)$r['transfer_limit'] / (1024 * 1024));
            }
            $isFree = (($r['package_type'] ?? 'paid') === 'free') || ((float)($r['retail_price'] ?? $r['price'] ?? 0) <= 0);
            $finalPrice = $isFree ? 0.0 : (float)(!empty($r['retail_price']) && (float)$r['retail_price'] > 0 ? $r['retail_price'] : ($r['price'] ?? 0));
            $list[] = [
                'id' => (int)$r['id'],
                'name' => (string)($r['name_for_users'] ?: $r['name']),
                'code' => (string)$r['name'],
                'package_type' => $isFree ? 'free' : 'paid',
                'price' => $finalPrice,
                'validity' => (string)($r['validity'] ?: '30 يوم'),
                'rate_limit' => (string)($r['rate_limit'] ?: 'سرعة قياسية'),
                'quota_mb' => $quotaMb,
                'quota_label' => $quotaMb > 0 ? ($quotaMb >= 1024 ? round($quotaMb / 1024, 1) . ' GB' : $quotaMb . ' MB') : 'غير محدود',
                'shared_users' => (int)($r['shared_users'] ?: 1),
                'badge' => $isFree ? 'مجاني 🎁' : '',
                'description' => ''
            ];
        }
        return $list;
    }

    /**
     * Get Studio Data for a network
     */
    public function getStudioData(int $networkId): array {
        $defaults = $this->getDefaultSettings($networkId);
        
        $stmt = $this->db->prepare("SELECT * FROM um_hotspot_settings WHERE network_id = ?");
        $stmt->execute([$networkId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $settings = $defaults;
        if ($row) {
            if (!empty($row['theme_json'])) $settings['theme'] = array_merge($defaults['theme'], json_decode($row['theme_json'], true) ?: []);
            if (!empty($row['brand_json'])) $settings['brand'] = array_merge($defaults['brand'], json_decode($row['brand_json'], true) ?: []);
            if (!empty($row['contacts_json'])) $settings['contacts'] = array_merge($defaults['contacts'], json_decode($row['contacts_json'], true) ?: []);
            if (!empty($row['packages_json'])) $settings['packages_config'] = array_merge($defaults['packages_config'], json_decode($row['packages_json'], true) ?: []);
            if (!empty($row['ads_json'])) $settings['ads'] = array_merge($defaults['ads'], json_decode($row['ads_json'], true) ?: []);
            if (!empty($row['shortcuts_json'])) $settings['shortcuts'] = array_merge($defaults['shortcuts'], json_decode($row['shortcuts_json'], true) ?: []);
            if (!empty($row['pos_json'])) $settings['pos_config'] = array_merge($defaults['pos_config'], json_decode($row['pos_json'], true) ?: []);
            if (!empty($row['login_options_json'])) $settings['login_options'] = array_merge($defaults['login_options'], json_decode($row['login_options_json'], true) ?: []);
            if (!empty($row['status_options_json'])) $settings['status_options'] = array_merge($defaults['status_options'], json_decode($row['status_options_json'], true) ?: []);
        }

        // Setup policy is scoped to this network; generated files are the only output changed.
        $policyQuery=$this->db->prepare("SELECT setting_value FROM um_network_settings WHERE network_id=? AND setting_key='onboarding_v1'");
        $policyQuery->execute([$networkId]);$setupMeta=json_decode((string)$policyQuery->fetchColumn(),true)?:[];
        $authQuery=$this->db->prepare('SELECT auth_mode FROM um_networks WHERE id=?');$authQuery->execute([$networkId]);
        $settings['login_options']['network_auth_mode']=$authQuery->fetchColumn()?:'same';
        if($settings['login_options']['network_auth_mode']==='different')$settings['login_options']['auto_login']=false;
        if(isset($setupMeta['policy'])) {
            $settings['login_options']['network_terms_text']=(string)($setupMeta['policy']['text']??'');
            $settings['login_options']['network_terms_required']=!empty($setupMeta['policy']['required']);
            if(!empty($setupMeta['policy']['required']))$settings['login_options']['auto_login']=false;
        }

        // Auto-sync admins if enabled
        if (!empty($settings['pos_config']['auto_sync_admins']) && $networkId > 0) {
            $adminPos = $this->getNetworkPosAdmins($networkId);
            if (!empty($adminPos)) {
                $existing = $settings['pos_config']['items'] ?? [];
                $existingKeys = [];
                foreach ($existing as $it) {
                    $n = mb_strtolower(trim((string)($it['name'] ?? '')));
                    if ($n !== '') $existingKeys[$n] = true;
                }
                foreach ($adminPos as $ap) {
                    $n = mb_strtolower(trim((string)($ap['name'] ?? '')));
                    if (!isset($existingKeys[$n])) {
                        $existing[] = $ap;
                        $existingKeys[$n] = true;
                    }
                }
                $settings['pos_config']['items'] = $existing;
            }
        }

        // Fetch network routers
        $rStmt = $this->db->prepare("
            SELECT id, nasname, shortname, description, hotspot_dir, ftp_port, api_port, api_user, api_ssl, work_types, last_sync_time
            FROM nas
            WHERE network_id = ?
            ORDER BY id ASC
        ");
        $rStmt->execute([$networkId]);
        $routers = $rStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch network profiles/packages
        $dbPackages = $this->getNetworkPackages($networkId);

        // Merge saved package_items with dbPackages
        $savedItems = $settings['packages_config']['package_items'] ?? ($settings['packages_config']['custom_packages'] ?? []);
        $finalItems = [];
        $existingMap = [];

        if (is_array($savedItems)) {
            foreach ($savedItems as $it) {
                $key = (string)($it['id'] ?? $it['code'] ?? $it['name'] ?? '');
                if ($key !== '') {
                    $existingMap[$key] = $it;
                }
            }
        }

        // Add / merge db packages
        foreach ($dbPackages as $dp) {
            $key = (string)$dp['id'];
            $codeKey = (string)($dp['code'] ?? '');
            $matchedSaved = $existingMap[$key] ?? ($codeKey !== '' ? ($existingMap[$codeKey] ?? null) : null);
            $isFree = (($dp['package_type'] ?? '') === 'free') || ($dp['price'] == 0);

            if ($matchedSaved) {
                $finalItems[] = array_merge($dp, [
                    'enabled' => !isset($matchedSaved['enabled']) || $matchedSaved['enabled'] !== false,
                    'featured' => !empty($matchedSaved['featured']),
                    'name' => !empty($matchedSaved['name']) ? (string)$matchedSaved['name'] : $dp['name'],
                    'package_type' => $isFree ? 'free' : 'paid',
                    'price' => $isFree ? 0.0 : (isset($matchedSaved['price']) && $matchedSaved['price'] !== '' ? (float)$matchedSaved['price'] : $dp['price']),
                    'validity' => !empty($matchedSaved['validity']) ? (string)$matchedSaved['validity'] : $dp['validity'],
                    'rate_limit' => !empty($matchedSaved['rate_limit']) ? (string)$matchedSaved['rate_limit'] : $dp['rate_limit'],
                    'quota_label' => !empty($matchedSaved['quota_label']) ? (string)$matchedSaved['quota_label'] : $dp['quota_label'],
                    'badge' => (string)($matchedSaved['badge'] ?? ($isFree ? 'مجاني 🎁' : $dp['badge'])),
                    'badge_color' => (string)($matchedSaved['badge_color'] ?? ''),
                    'description' => (string)($matchedSaved['description'] ?? ''),
                    'custom_order_msg' => (string)($matchedSaved['custom_order_msg'] ?? ''),
                    'is_custom' => false
                ]);
                unset($existingMap[$key]);
                if ($codeKey !== '') unset($existingMap[$codeKey]);
            } else {
                $finalItems[] = array_merge($dp, [
                    'enabled' => true,
                    'featured' => false,
                    'package_type' => $isFree ? 'free' : 'paid',
                    'badge' => $isFree ? 'مجاني 🎁' : '',
                    'badge_color' => '',
                    'description' => '',
                    'custom_order_msg' => '',
                    'is_custom' => false
                ]);
            }
        }

        // Add remaining custom packages that were created manually
        foreach ($existingMap as $remKey => $customPkg) {
            if (!empty($customPkg['is_custom'])) {
                $finalItems[] = $customPkg;
            }
        }

        $settings['packages_config']['package_items'] = $finalItems;

        return [
            'success' => true,
            'network_id' => $networkId,
            'settings' => $settings,
            'routers' => $routers,
            'db_packages' => $dbPackages
        ];
    }

    /**
     * Get active POS / distributors assigned to a network
     */
    public function getNetworkPosAdmins(int $networkId): array {
        try {
            $stmt = $this->db->prepare("
                SELECT a.id, a.fullname, a.phone, a.notes, a.role
                FROM um_admins a
                INNER JOIN um_pos_network_assignments pna ON pna.pos_admin_id = a.id
                WHERE pna.network_id = ? AND a.is_active = 1
                ORDER BY pna.is_primary DESC, a.fullname ASC
            ");
            $stmt->execute([$networkId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $stmt2 = $this->db->prepare("
                    SELECT id, fullname, phone, notes, role
                    FROM um_admins
                    WHERE is_active = 1
                      AND role IN ('pos_seller', 'pos_agent', 'distributor', 'agent', 'reseller', 'pos')
                      AND (allowed_networks IS NULL OR allowed_networks = '' OR allowed_networks LIKE ? OR allowed_networks LIKE '%all%')
                    ORDER BY fullname ASC
                    LIMIT 20
                ");
                $stmt2->execute(['%' . $networkId . '%']);
                $rows = $stmt2->fetchAll(PDO::FETCH_ASSOC);
            }

            $list = [];
            foreach ($rows as $r) {
                $name = trim((string)($r['fullname'] ?: 'نقطة بيع معتمدة'));
                $phone = trim((string)($r['phone'] ?? ''));
                $notes = trim((string)($r['notes'] ?? ''));
                $role = (string)($r['role'] ?? '');
                $badge = ($role === 'distributor' || $role === 'reseller') ? 'موزع معتمد ⭐' : 'نقطة بيع معتمدة';

                $list[] = [
                    'id' => 'admin_' . $r['id'],
                    'name' => $name,
                    'phone' => $phone,
                    'whatsapp' => $phone,
                    'address' => $notes ?: 'نقطة توزيع معتمدة',
                    'working_hours' => 'متوفر يومياً',
                    'badge' => $badge,
                    'map_url' => '',
                    'notes' => 'متوفر جميع فئات الكروت وباقات الإنترنت',
                    'show_on_login' => true,
                    'show_on_status' => true,
                    'enabled' => true,
                    'is_admin_sync' => true
                ];
            }
            return $list;
        } catch (Throwable $e) {
            error_log('getNetworkPosAdmins error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Save Studio Settings for a network
     */
    public function saveStudioData(int $networkId, array $data, int $adminId = 1): array {
        $theme = json_encode($data['theme'] ?? [], JSON_UNESCAPED_UNICODE);
        $brand = json_encode($data['brand'] ?? [], JSON_UNESCAPED_UNICODE);
        $contacts = json_encode($data['contacts'] ?? [], JSON_UNESCAPED_UNICODE);
        $packages = json_encode($data['packages_config'] ?? [], JSON_UNESCAPED_UNICODE);
        $ads = json_encode($data['ads'] ?? [], JSON_UNESCAPED_UNICODE);
        $shortcuts = json_encode($data['shortcuts'] ?? [], JSON_UNESCAPED_UNICODE);
        $pos = json_encode($data['pos_config'] ?? [], JSON_UNESCAPED_UNICODE);
        $loginOpts = json_encode($data['login_options'] ?? [], JSON_UNESCAPED_UNICODE);
        $statusOpts = json_encode($data['status_options'] ?? [], JSON_UNESCAPED_UNICODE);

        $stmt = $this->db->prepare("
            INSERT INTO um_hotspot_settings (
                network_id, theme_json, brand_json, contacts_json, packages_json, ads_json, shortcuts_json, pos_json, login_options_json, status_options_json, updated_by_admin_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                theme_json = VALUES(theme_json),
                brand_json = VALUES(brand_json),
                contacts_json = VALUES(contacts_json),
                packages_json = VALUES(packages_json),
                ads_json = VALUES(ads_json),
                shortcuts_json = VALUES(shortcuts_json),
                pos_json = VALUES(pos_json),
                login_options_json = VALUES(login_options_json),
                status_options_json = VALUES(status_options_json),
                updated_by_admin_id = VALUES(updated_by_admin_id),
                updated_at = NOW()
        ");
        $stmt->execute([$networkId, $theme, $brand, $contacts, $packages, $ads, $shortcuts, $pos, $loginOpts, $statusOpts, $adminId]);

        return [
            'success' => true,
            'message' => 'تم حفظ إعدادات وتخصيصات صفحة الهوتسبوت وبوابة المشترك بنجاح!'
        ];
    }

    /**
     * Build the entire hotspot files bundle array
     */
    public function generateHotspotBundle(int $networkId): array {
        $data = $this->getStudioData($networkId);
        $settings = $data['settings'];
        $packages = !empty($settings['packages_config']['package_items']) 
            ? $settings['packages_config']['package_items'] 
            : (!empty($settings['packages_config']['custom_packages']) 
                ? $settings['packages_config']['custom_packages'] 
                : $data['db_packages']);

        $loginHtml = $this->buildLoginHtml($settings, $packages);
        $statusHtml = $this->buildStatusHtml($settings);
        $aloginHtml = $this->buildAloginHtml($settings);
        $logoutHtml = $this->buildLogoutHtml($settings);
        $radvertHtml = $this->buildRadvertHtml($settings);
        $errorsTxt = $this->buildErrorsTxt();

        $statusApiHtml = $this->buildStatusApiHtml($settings);
        $settingApiHtml = $this->buildSettingApiHtml($settings);
        $samBridgeJs = $this->buildSamBridgeJs();

        return [
            'login.html' => $loginHtml,
            'status.html' => $statusHtml,
            'alogin.html' => $aloginHtml,
            'logout.html' => $logoutHtml,
            'radvert.html' => $radvertHtml,
            'status-api.html' => $statusApiHtml,
            'setting-api.html' => $settingApiHtml,
            'app/status-api.html' => $statusApiHtml,
            'app/setting-api.html' => $settingApiHtml,
            'sam-app-bridge.js' => $samBridgeJs,
            'js/sam-app-bridge.js' => $samBridgeJs,
            'errors.txt' => $errorsTxt
        ];
    }

    /**
     * Build status-api.html JSON template for MikroTik Hotspot & SAM Android App
     */
    public function buildStatusApiHtml(array $s): string {
        $brand = $s['brand'] ?? [];
        $netName = addslashes((string)($brand['network_name'] ?? 'سام'));
        
        return <<<HTML
{
  "app": "SAM-سام",
  "الرابط": "$(hostname)",
  "الشبكة": "{$netName}",
  "النقطة": "$(server-name)",
  "المنفذ": "$(interface-name)",
  "domain": "$(domain)",
  "hostname": "$(hostname)",
  "identity": "$(identity)",
  "server_name": "$(server-name)",
  "interface_name": "$(interface-name)",
  "logged_in": "$(logged-in)",
  "username": "$(username)",
  "ip": "$(ip)",
  "mac": "$(mac)",
  "uptime": "$(uptime)",
  "speed": "$(domain)",
  "session_time_left": "$(session-time-left)",
  "idle_timeout": "$(idle-timeout)",
  "refresh_timeout": "$(refresh-timeout)",
  "bytes_in": "$(bytes-in)",
  "bytes_out": "$(bytes-out)",
  "bytes_in_nice": "$(bytes-in-nice)",
  "bytes_out_nice": "$(bytes-out-nice)",
  "packets_in": "$(packets-in)",
  "packets_out": "$(packets-out)",
  "remain_bytes_total": "$(remain-bytes-total)",
  "quota_left": "$(remain-bytes-total)",
  "limit_bytes_total": "$(limit-bytes-total)",
  "link_login": "$(link-login)",
  "link_status": "$(link-status)",
  "link_logout": "$(link-logout)",
  "link_orig": "$(link-orig)",
  "error": "$(error)"
}
HTML;
    }

    /**
     * Build setting-api.html JSON template for MikroTik Hotspot & SAM Android App
     */
    public function buildSettingApiHtml(array $s): string {
        $brand = $s['brand'] ?? [];
        $contacts = $s['contacts'] ?? [];
        $shortcuts = $s['shortcuts']['items'] ?? [];
        $ads = $s['ads']['items'] ?? [];
        $packages = $s['packages_config']['package_items'] ?? [];
        $stOpt = $s['status_options'] ?? [];

        $netName = addslashes((string)($brand['network_name'] ?? 'سام'));
        $logoUrl = addslashes((string)($brand['logo_url'] ?: 'http://$(hostname)/img/log.png'));
        $serverApiUrl = addslashes((string)($brand['server_api_url'] ?? ''));
        $whatsapp = addslashes((string)($contacts['whatsapp'] ?? ''));
        $refreshSec = (int)($stOpt['auto_refresh_interval'] ?? 30);

        $linksList = [
            ["title" => "تسجيل الدخول", "url" => "http://$(hostname)/login.html"],
            ["title" => "الحالة", "url" => "http://$(hostname)/status.html"],
            ["title" => "بيانات الحالة JSON", "url" => "http://$(hostname)/app/status-api.html"]
        ];

        foreach ($shortcuts as $sc) {
            if (!empty($sc['enabled'])) {
                $linksList[] = [
                    "title" => (string)($sc['title'] ?? 'رابط'),
                    "url" => (string)($sc['url'] ?? '#'),
                    "icon" => (string)($sc['icon'] ?? '🔗'),
                    "badge" => (string)($sc['badge'] ?? '')
                ];
            }
        }

        $linksJson = json_encode($linksList, JSON_UNESCAPED_UNICODE);
        $shortcutsJson = json_encode($shortcuts, JSON_UNESCAPED_UNICODE);
        $adsJson = json_encode($ads, JSON_UNESCAPED_UNICODE);
        $packagesJson = json_encode($packages, JSON_UNESCAPED_UNICODE);

        return <<<HTML
{
  "app": "SAM-سام",
  "الرابط": "$(hostname)",
  "الشبكة": "{$netName}",
  "النقطة": "$(server-name)",
  "المنفذ": "$(interface-name)",
  "domain": "s.net",
  "icon": "{$logoUrl}",
  "status_api": "http://$(hostname)/app/status-api.html",
  "login_url": "http://$(hostname)/login.html",
  "server_api_url": "{$serverApiUrl}",
  "whatsapp": "{$whatsapp}",
  "auto_refresh": true,
  "refresh_seconds": {$refreshSec},
  "auto_login": true,
  "links": {$linksJson},
  "shortcuts": {$shortcutsJson},
  "ads": {$adsJson},
  "packages": {$packagesJson}
}
HTML;
    }

    /**
     * Build sam-app-bridge.js
     */
    public function buildSamBridgeJs(): string {
        return <<<JAVASCRIPT
/**
 * SAM App Bridge JavaScript Interface
 * Allows Hotspot portal pages to communicate with the SAM Android Native Application.
 */
(function(window) {
    'use strict';
    window.SAMBridge = {
        isApp: function() {
            return typeof window.SAMApp !== 'undefined';
        },
        playVideo: function(url, title) {
            if (this.isApp() && typeof window.SAMApp.playVideo === 'function') {
                window.SAMApp.playVideo(url, title || '');
                return true;
            }
            return false;
        },
        showToast: function(msg) {
            if (this.isApp() && typeof window.SAMApp.showToast === 'function') {
                window.SAMApp.showToast(msg);
                return true;
            }
            return false;
        },
        refreshStatus: function() {
            if (this.isApp() && typeof window.SAMApp.refreshStatus === 'function') {
                window.SAMApp.refreshStatus();
                return true;
            }
            return false;
        }
    };
})(window);
JAVASCRIPT;
    }

    /**
     * Helper to render Animated Ads Carousel HTML
     */
    public function renderAdsCarouselHtml(array $ads, string $pageType = 'login', string $accentColor = '#10b981', string $radius = '16px'): string {
        if (empty($ads['enabled']) || empty($ads['items'])) return '';

        $activeAds = array_values(array_filter($ads['items'], function($a) use ($pageType) {
            if (empty($a['enabled'])) return false;
            if ($pageType === 'login' && isset($a['show_on_login']) && !$a['show_on_login']) return false;
            if ($pageType === 'status' && isset($a['show_on_status']) && !$a['show_on_status']) return false;
            return true;
        }));

        if (empty($activeAds)) return '';

        $slidesHtml = '';
        $dotsHtml = '';
        $sliderId = 'hs-ad-slider-' . $pageType;

        foreach ($activeAds as $idx => $ad) {
            $adTitle = htmlspecialchars((string)($ad['title'] ?? ''));
            $adDesc = htmlspecialchars((string)($ad['desc'] ?? ''));
            $adBadge = htmlspecialchars((string)($ad['badge'] ?? 'إعلان مميز'));
            $adImg = htmlspecialchars((string)($ad['image_url'] ?? ''));
            $adLink = htmlspecialchars((string)($ad['link_url'] ?? ''));

            $imgTag = $adImg ? "<div class=\"ad-img-box\"><img src=\"{$adImg}\" alt=\"{$adTitle}\" class=\"ad-img\" /></div>" : "";
            $descTag = $adDesc ? "<p class=\"ad-desc\">{$adDesc}</p>" : "";
            $linkOpen = $adLink ? "<a href=\"{$adLink}\" target=\"_blank\" class=\"ad-link-wrapper\">" : "<div class=\"ad-link-wrapper\">";
            $linkClose = $adLink ? "</a>" : "</div>";

            $activeClass = ($idx === 0) ? 'active' : '';
            $slidesHtml .= "
            <div class=\"ad-slide-item {$activeClass}\" data-slide-index=\"{$idx}\">
                {$linkOpen}
                    {$imgTag}
                    <div class=\"ad-content-box\">
                        <div class=\"ad-badge-row\">
                            <span class=\"ad-badge\">{$adBadge}</span>
                            <span class=\"ad-title\">{$adTitle}</span>
                        </div>
                        {$descTag}
                    </div>
                {$linkClose}
            </div>";

            $dotsHtml .= "<span class=\"ad-dot {$activeClass}\" onclick=\"goToSlide('{$sliderId}', {$idx})\"></span>";
        }

        $speedSec = (int)($ads['rotation_speed'] ?? 4);
        if ($speedSec < 2) $speedSec = 4;
        $navHtml = count($activeAds) > 1 ? "<div class=\"ads-dots-nav\">{$dotsHtml}</div>" : "";

        return <<<HTML
        <!-- Animated Ads Carousel -->
        <div id="{$sliderId}" class="ads-carousel-container" data-speed="{$speedSec}">
            <div class="ads-slides-track">
                {$slidesHtml}
            </div>
            {$navHtml}
        </div>
HTML;
    }

    /**
     * Helper to render Shortcuts & Live Streams Links HTML
     */
    public function renderShortcutsHtml(array $shortcuts, string $pageType = 'login', string $accentColor = '#10b981', string $radius = '16px'): string {
        if (empty($shortcuts['enabled']) || empty($shortcuts['items'])) return '';

        $activeItems = array_values(array_filter($shortcuts['items'], function($s) use ($pageType) {
            if (empty($s['enabled'])) return false;
            if ($pageType === 'login' && isset($s['show_on_login']) && !$s['show_on_login']) return false;
            if ($pageType === 'status' && isset($s['show_on_status']) && !$s['show_on_status']) return false;
            return true;
        }));

        if (empty($activeItems)) return '';

        $secTitle = htmlspecialchars($shortcuts['title'] ?: '🌟 خدمات وروابط الشبكة السريعة');
        $secSub = htmlspecialchars($shortcuts['subtitle'] ?: 'بث مباشر، استراحات، وسيرفرات ترفيهية');

        $cardsHtml = '';
        foreach ($activeItems as $item) {
            $title = htmlspecialchars((string)($item['title'] ?? 'رابط سريع'));
            $desc = htmlspecialchars((string)($item['desc'] ?? ''));
            $badge = htmlspecialchars((string)($item['badge'] ?? ''));
            $icon = htmlspecialchars((string)($item['icon'] ?? '🔗'));
            $url = htmlspecialchars((string)($item['url'] ?? '#'));

            $cardsHtml .= "
            <a href=\"{$url}\" target=\"_blank\" class=\"shortcut-card\">
                <div class=\"sc-icon-col\">{$icon}</div>
                <div class=\"sc-info-col\">
                    <div class=\"sc-title-row\">
                        <span class=\"sc-title\">{$title}</span>
                        " . ($badge ? "<span class=\"sc-badge\">{$badge}</span>" : "") . "
                    </div>
                    " . ($desc ? "<div class=\"sc-desc\">{$desc}</div>" : "") . "
                </div>
                <div class=\"sc-arrow\">➜</div>
            </a>";
        }

        return <<<HTML
        <!-- Custom Shortcuts & Entertainment Links -->
        <div class="card shortcuts-card-box">
            <div class="card-section-title">{$secTitle}</div>
            " . ($secSub ? "<div class=\"card-section-subtitle\">{$secSub}</div>" : "") . "
            <div class="shortcuts-grid">
                {$cardsHtml}
            </div>
        </div>
HTML;
    }

    /**
     * Helper to render POS & Card Selling Locations HTML
     */
    public function renderPosPointsHtml(array $posConfig, string $pageType = 'login', string $accentColor = '#10b981', string $radius = '16px'): string {
        if (empty($posConfig['enabled']) || empty($posConfig['items'])) return '';

        $activeItems = array_values(array_filter($posConfig['items'], function($it) use ($pageType) {
            if (empty($it['enabled'])) return false;
            if ($pageType === 'login' && isset($it['show_on_login']) && !$it['show_on_login']) return false;
            if ($pageType === 'status' && isset($it['show_on_status']) && !$it['show_on_status']) return false;
            return true;
        }));

        if (empty($activeItems)) return '';

        $secTitle = htmlspecialchars((string)($posConfig['title'] ?: '🏪 مراكز ونقاط بيع وتوزيع الكروت المعتمدة'));
        $secSub = htmlspecialchars((string)($posConfig['subtitle'] ?: 'تفضل بزيارة أقرب موزع أو مركز بيع معتمد لشراء وتجديد باقات الإنترنت'));
        $searchPlaceholder = htmlspecialchars((string)($posConfig['search_placeholder'] ?: '🔍 ابحث عن أقرب مركز بيع، حي، أو شارع...'));

        $cardsHtml = '';
        foreach ($activeItems as $item) {
            $name = htmlspecialchars((string)($item['name'] ?? 'مركز بيع معتمد'));
            $phone = preg_replace('/[^0-9]/', '', (string)($item['phone'] ?? ''));
            $whatsapp = preg_replace('/[^0-9]/', '', (string)($item['whatsapp'] ?? ($item['phone'] ?? '')));
            $address = htmlspecialchars((string)($item['address'] ?? ''));
            $workingHours = htmlspecialchars((string)($item['working_hours'] ?? ''));
            $badge = htmlspecialchars((string)($item['badge'] ?? 'نقطة معتمدة'));
            $mapUrl = htmlspecialchars((string)($item['map_url'] ?? ''));
            $notes = htmlspecialchars((string)($item['notes'] ?? ''));

            $searchText = htmlspecialchars(mb_strtolower($name . ' ' . $address . ' ' . $phone . ' ' . $notes . ' ' . $workingHours));

            $badgeClass = (strpos($badge, 'رئيسي') !== false || strpos($badge, 'موزع') !== false) ? 'pos-badge-vip' : 'pos-badge-std';
            $badgeTag = $badge ? "<span class=\"pos-badge {$badgeClass}\">{$badge}</span>" : "";

            $addrRow = $address ? "<div class=\"pos-info-item\"><span class=\"pos-info-icon\">📍</span><span class=\"pos-info-text\">{$address}</span></div>" : "";
            $hoursRow = $workingHours ? "<div class=\"pos-info-item\"><span class=\"pos-info-icon\">⏰</span><span class=\"pos-info-text\">{$workingHours}</span></div>" : "";
            $notesRow = $notes ? "<div class=\"pos-info-item pos-info-notes\"><span class=\"pos-info-icon\">ℹ️</span><span class=\"pos-info-text\">{$notes}</span></div>" : "";

            $waMsg = urlencode("مرحباً، أود الاستفسار عن كروت وباقات الإنترنت المتوفرة لديكم في {$name}");
            $btnWa = $whatsapp ? "<a href=\"https://wa.me/{$whatsapp}?text={$waMsg}\" target=\"_blank\" class=\"btn-pos-act btn-pos-wa\"><span>💬</span> واتساب</a>" : "";
            $btnCall = $phone ? "<a href=\"tel:{$phone}\" class=\"btn-pos-act btn-pos-call\"><span>📞</span> اتصال</a>" : "";
            $btnMap = $mapUrl ? "<a href=\"{$mapUrl}\" target=\"_blank\" class=\"btn-pos-act btn-pos-map\"><span>🗺️</span> الموقع</a>" : "";

            $cardsHtml .= "
            <div class=\"pos-card\" data-search=\"{$searchText}\">
                <div class=\"pos-card-head\">
                    <div class=\"pos-name-group\">
                        <span class=\"pos-store-icon\">🏪</span>
                        <div class=\"pos-title-wrap\">
                            <span class=\"pos-store-name\">{$name}</span>
                        </div>
                    </div>
                    {$badgeTag}
                </div>
                <div class=\"pos-card-body\">
                    {$addrRow}
                    {$hoursRow}
                    {$notesRow}
                </div>
                <div class=\"pos-card-actions\">
                    {$btnCall}
                    {$btnWa}
                    {$btnMap}
                </div>
            </div>";
        }

        return <<<HTML
        <!-- Points of Sale & Card Distribution Grid -->
        <div class="card pos-section-card" id="pos-section-box-{$pageType}">
            <div class="card-section-title">{$secTitle}</div>
            <div class="card-section-subtitle">{$secSub}</div>
            
            <!-- Live Search Bar -->
            <div class="pos-search-wrapper">
                <input type="text" class="pos-search-input" placeholder="{$searchPlaceholder}" oninput="filterPosList(this.value, '{$pageType}')" />
                <span class="pos-search-icon">🔍</span>
            </div>

            <!-- POS Grid -->
            <div class="pos-grid" id="pos-grid-{$pageType}">
                {$cardsHtml}
            </div>
            
            <div id="pos-no-results-{$pageType}" class="pos-no-results" style="display:none;">
                🔍 لم يتم العثور على مراكز بيع مطابقة لبحثك
            </div>
        </div>
HTML;
    }

    /**
     * Build login.html template
     */
    public function buildLoginHtml(array $s, array $packages): string {
        $theme = $s['theme'];
        $brand = $s['brand'];
        $contacts = $s['contacts'];
        $ads = $s['ads'];
        $shortcuts = $s['shortcuts'] ?? [];
        $posConfig = $s['pos_config'] ?? [];
        $loginOpts = $s['login_options'];
        $networkAuthMode=in_array(($loginOpts['network_auth_mode']??'same'),['same','username_only','different'],true)?$loginOpts['network_auth_mode']:'same';
        $networkPasswordStyle=$networkAuthMode==='different'?'':'display:none;';
        $networkTermsHtml='';
        $terms=trim((string)($loginOpts['network_terms_text']??''));
        if($terms!=='') {
            $networkTermsHtml='<details style="margin:12px 0;text-align:right"><summary>شروط استخدام الشبكة</summary><div style="white-space:pre-wrap;padding:12px">'.htmlspecialchars($terms,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'</div></details>';
            if(!empty($loginOpts['network_terms_required']))$networkTermsHtml.='<label style="display:flex;gap:8px;margin:12px 0"><input type="checkbox" id="sam-network-terms" required> أوافق على شروط استخدام الشبكة</label>';
        }
        $pkgCfg = $s['packages_config'];

        $netName = htmlspecialchars($brand['network_name'] ?: 'شبكة الواي فاي');
        $slogan = htmlspecialchars($brand['slogan'] ?: 'إنترنت فائق السرعة');
        $welcome = htmlspecialchars($brand['welcome_message'] ?: 'أهلاً بك! أدخل رقم الكرت للاتصال بالإنترنت');
        $footerText = htmlspecialchars($brand['footer_text'] ?: 'خدمة الإنترنت السريع والآمن');
        $primaryColor = htmlspecialchars($theme['primary_color'] ?: '#0284c7');
        $accentColor = htmlspecialchars($theme['accent_color'] ?: '#10b981');
        $bgStart = htmlspecialchars($theme['bg_gradient_start'] ?: '#0b1120');
        $bgEnd = htmlspecialchars($theme['bg_gradient_end'] ?: '#0c4a6e');
        $cardBg = htmlspecialchars($theme['card_bg'] ?: '#151f32');
        $cardBorder = htmlspecialchars($theme['card_border'] ?: '#23334d');
        $textColor = htmlspecialchars($theme['text_color'] ?: '#f8fafc');
        $textMuted = htmlspecialchars($theme['text_muted'] ?: '#94a3b8');
        $radius = htmlspecialchars($theme['border_radius'] ?: '16px');
        $logoUrl = htmlspecialchars($brand['logo_url'] ?: '');
        $logoIcon = htmlspecialchars($brand['logo_icon'] ?: '📶');

        // Render Ads Carousel
        $adsHtml = '';
        if (!empty($loginOpts['show_ads'])) {
            $adsHtml = $this->renderAdsCarouselHtml($ads, 'login', $accentColor, $radius);
        }

        // Render Shortcuts
        $shortcutsHtml = '';
        if (!empty($loginOpts['show_shortcuts'])) {
            $shortcutsHtml = $this->renderShortcutsHtml($shortcuts, 'login', $accentColor, $radius);
        }

        // Render POS Selling Points
        $posHtml = '';
        if (!empty($loginOpts['show_pos'])) {
            $posHtml = $this->renderPosPointsHtml($posConfig, 'login', $accentColor, $radius);
        }

        // Build Packages HTML
        $packagesHtml = '';
        if (!empty($loginOpts['show_packages']) && !empty($pkgCfg['enabled']) && !empty($packages)) {
            $activePackages = array_values(array_filter($packages, function($p) {
                return !isset($p['enabled']) || $p['enabled'] !== false;
            }));

            if (!empty($activePackages)) {
                $secTitle = htmlspecialchars((string)($pkgCfg['title'] ?: '💎 باقات وعروض الشبكة'));
                $secSub = htmlspecialchars((string)($pkgCfg['subtitle'] ?: 'اختر باقتك المفضلة واستمتع باتصال مستقر وسريع'));
                $orderBtnText = htmlspecialchars((string)($pkgCfg['order_btn_text'] ?: 'طلب الباقة ⚡'));
                $showOrderBtn = !isset($pkgCfg['show_order_btn']) || $pkgCfg['show_order_btn'] !== false;
                $msgTemplate = (string)($pkgCfg['whatsapp_msg_template'] ?: 'مرحباً، أود الاشتراك في باقة {name} بسعر {price} من شبكة {network}');
                $waNum = preg_replace('/[^0-9]/', '', (string)($contacts['whatsapp'] ?? ''));

                $pkgCards = '';
                foreach ($activePackages as $pkg) {
                    $pName = htmlspecialchars((string)($pkg['name'] ?? 'باقة إنترنت'));
                    $isFree = (($pkg['package_type'] ?? '') === 'free') || ((float)($pkg['price'] ?? 0) <= 0);
                    $pPrice = $isFree ? 0.0 : (float)($pkg['price'] ?? 0);
                    $pQuota = htmlspecialchars((string)($pkg['quota_label'] ?? ''));
                    $pValidity = htmlspecialchars((string)($pkg['validity'] ?? ''));
                    $pSpeed = htmlspecialchars((string)($pkg['rate_limit'] ?? ''));
                    $pBadge = htmlspecialchars((string)($pkg['badge'] ?? ($isFree ? 'مجاني 🎁' : '')));
                    $pDesc = htmlspecialchars((string)($pkg['description'] ?? ''));
                    $isFeatured = !empty($pkg['featured']);

                    $priceFormatted = $pPrice > 0 ? number_format($pPrice) : '0';
                    $priceTag = $isFree 
                        ? "<span class=\"pkg-price-num free\" style=\"color:{$accentColor}; font-weight:900;\">مجاناً 🎁</span>" 
                        : "<span class=\"pkg-price-num\">{$priceFormatted}</span> <span class=\"pkg-currency\">ريال</span>";

                    $badgeHtml = '';
                    if ($pBadge) {
                        $badgeHtml = "<span class=\"pkg-badge " . ($isFree ? 'free-badge' : '') . "\">{$pBadge}</span>";
                    } elseif ($isFeatured) {
                        $badgeHtml = "<span class=\"pkg-badge featured-badge\">⭐ الأكثر طلباً</span>";
                    }

                    // Build WhatsApp message
                    if ($isFree) {
                        $pkgMsg = !empty($pkg['custom_order_msg']) ? $pkg['custom_order_msg'] : "مرحباً، أود الحصول على الباقة المجانية {name} من شبكة {network}";
                    } else {
                        $pkgMsg = !empty($pkg['custom_order_msg']) ? $pkg['custom_order_msg'] : $msgTemplate;
                    }
                    $pkgMsg = str_replace(
                        ['{name}', '{price}', '{validity}', '{quota}', '{network}'],
                        [$pkg['name'] ?? '', ($pPrice > 0 ? number_format($pPrice) . ' ريال' : 'مجانية'), $pkg['validity'] ?? '', $pkg['quota_label'] ?? '', $brand['network_name'] ?? ''],
                        $pkgMsg
                    );
                    $waOrderUrl = "https://wa.me/{$waNum}?text=" . urlencode($pkgMsg);

                    $btnText = $isFree ? 'طلب الباقة المجانية 🎁' : $orderBtnText;
                    $orderBtn = ($showOrderBtn && $waNum) 
                        ? "<a href=\"{$waOrderUrl}\" target=\"_blank\" class=\"btn-pkg-order " . ($isFree ? 'btn-pkg-free' : '') . "\"><span>" . ($isFree ? '🎁' : '💬') . "</span> {$btnText}</a>" 
                        : "";

                    $featuredClass = $isFeatured ? 'featured-pkg' : ($isFree ? 'free-pkg' : '');

                    $pkgCards .= "
                    <div class=\"pkg-card {$featuredClass}\">
                        {$badgeHtml}
                        <div class=\"pkg-name\">{$pName}</div>
                        <div class=\"pkg-price\">{$priceTag}</div>
                        
                        <div class=\"pkg-features-list\">
                            " . ($pQuota ? "<div class=\"pkg-feat-item\"><span class=\"feat-icon\">📊</span><span class=\"feat-label\">الرصيد:</span> <b class=\"feat-val\">{$pQuota}</b></div>" : "") . "
                            " . ($pValidity ? "<div class=\"pkg-feat-item\"><span class=\"feat-icon\">⏳</span><span class=\"feat-label\">الصلاحية:</span> <b class=\"feat-val\">{$pValidity}</b></div>" : "") . "
                            " . ($pSpeed && $pSpeed !== 'سرعة قياسية' ? "<div class=\"pkg-feat-item\"><span class=\"feat-icon\">⚡</span><span class=\"feat-label\">السرعة:</span> <b class=\"feat-val\">{$pSpeed}</b></div>" : "") . "
                            " . ($pDesc ? "<div class=\"pkg-desc-note\">{$pDesc}</div>" : "") . "
                        </div>
                        
                        {$orderBtn}
                    </div>";
                }

                $packagesHtml = "
                <div class=\"card packages-section-card\" style=\"margin-top:16px;\">
                    <div class=\"card-section-title\">{$secTitle}</div>
                    <div class=\"card-section-subtitle\">{$secSub}</div>
                    <div class=\"packages-grid\">
                        {$pkgCards}
                    </div>
                </div>";
            }
        }

        // Build Contacts HTML
        $contactsHtml = '';
        if (!empty($loginOpts['show_contacts'])) {
            $waNum = preg_replace('/[^0-9]/', '', (string)($contacts['whatsapp'] ?? ''));
            $waMsg = urlencode((string)($contacts['whatsapp_message'] ?: 'مرحباً، أود الاستفسار عن كروت شبكة ' . $netName));
            $phones = (array)($contacts['phones'] ?? []);
            $firstPhone = reset($phones);
            $tgUser = trim(ltrim((string)($contacts['telegram'] ?? ''), '@'));
            $pos = htmlspecialchars((string)($contacts['pos_locations'] ?? ''));

            $btnWa = $waNum ? "<a href=\"https://wa.me/{$waNum}?text={$waMsg}\" target=\"_blank\" class=\"contact-btn wa-btn\"><span>💬</span> واتساب الإدارة والمبيعات</a>" : "";
            $btnCall = $firstPhone ? "<a href=\"tel:{$firstPhone}\" class=\"contact-btn call-btn\"><span>📞</span> اتصال فوري للدعم ({$firstPhone})</a>" : "";
            $btnTg = $tgUser ? "<a href=\"https://t.me/{$tgUser}\" target=\"_blank\" class=\"contact-btn tg-btn\"><span>✈️</span> قناة التليجرام الرسمية</a>" : "";

            $contactsHtml = "
            <div class=\"card contacts-box\" style=\"margin-top:16px;\">
                <div class=\"card-section-title\">📞 أرقام التواصل ونقاط البيع</div>
                <div class=\"contact-buttons-row\">
                    {$btnWa}
                    {$btnCall}
                    {$btnTg}
                </div>
                " . ($pos && !empty($loginOpts['show_pos']) ? "<div class=\"pos-notice\">📍 <b>أماكن بيع الكروت:</b> {$pos}</div>" : "") . "
            </div>";
        }

        // Logo element
        $logoEl = $logoUrl 
            ? "<img src=\"{$logoUrl}\" alt=\"{$netName}\" class=\"brand-logo-img\" />" 
            : "<div class=\"brand-logo-icon\">{$logoIcon}</div>";

        $rememberCardsOpt = ($loginOpts['remember_cards'] !== false) ? 'true' : 'false';
        $autoLoginOpt = ($loginOpts['auto_login'] !== false) ? 'true' : 'false';
        $autoDelay = (int)($loginOpts['auto_login_delay'] ?? 2);
        if ($autoDelay < 1) $autoDelay = 1;

        return <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$netName} - تسجيل الدخول</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: {$primaryColor};
            --accent: {$accentColor};
            --bg-start: {$bgStart};
            --bg-end: {$bgEnd};
            --card: {$cardBg};
            --card-border: {$cardBorder};
            --text: {$textColor};
            --text-muted: {$textMuted};
            --radius: {$radius};
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', 'Tajawal', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body {
            background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg-end) 100%);
            background-attachment: fixed;
            color: var(--text);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 16px 12px 30px;
        }
        .app-container {
            width: 100%;
            max-width: 480px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .brand-header {
            text-align: center;
            padding: 10px 0 4px 0;
        }
        .brand-logo-img {
            max-height: 70px;
            max-width: 180px;
            object-fit: contain;
            margin-bottom: 8px;
            filter: drop-shadow(0 4px 10px rgba(0,0,0,0.4));
        }
        .brand-logo-icon {
            font-size: 42px;
            margin-bottom: 4px;
            display: inline-block;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
        }
        .brand-title {
            font-size: 22px;
            font-weight: 900;
            color: #38bdf8;
            text-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .brand-slogan {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 2px;
            font-weight: 600;
        }
        
        .card {
            background: var(--card);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
            padding: 18px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .card-section-title {
            font-size: 15px;
            font-weight: 800;
            color: #fff;
            margin-bottom: 2px;
            text-align: center;
        }
        .card-section-subtitle {
            font-size: 11px;
            color: var(--text-muted);
            margin-bottom: 12px;
            text-align: center;
        }

        .welcome-text {
            font-size: 13px;
            color: #cbd5e1;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.5;
            text-align: center;
        }
        .alert-error {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
            border: 1px solid #ef4444;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 12px;
            margin-bottom: 15px;
            font-weight: 700;
            text-align: right;
        }
        .input-group {
            margin-bottom: 14px;
            text-align: right;
        }
        .input-label {
            display: block;
            font-size: 12px;
            font-weight: 700;
            color: #cbd5e1;
            margin-bottom: 6px;
        }
        .input-box {
            width: 100%;
            padding: 13px 14px;
            background: #090e1a;
            border: 2px solid var(--card-border);
            border-radius: 10px;
            font-size: 18px;
            text-align: center;
            font-weight: 800;
            color: #fff;
            outline: none;
            transition: all 0.2s ease;
            letter-spacing: 1px;
            direction: ltr;
        }
        .input-box:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
            background: #0d1527;
        }
        .btn-login {
            width: 100%;
            background: linear-gradient(135deg, var(--primary) 0%, #0369a1 100%);
            color: #ffffff;
            border: none;
            padding: 14px;
            font-size: 16px;
            font-weight: 800;
            border-radius: 10px;
            cursor: pointer;
            transition: transform 0.15s ease, opacity 0.2s ease;
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .btn-login:hover {
            opacity: 0.95;
            transform: translateY(-1px);
        }

        /* Auto-Login Notification Banner */
        .auto-login-box {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid #38bdf8;
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 14px;
            text-align: center;
            animation: fadeIn 0.3s ease;
        }
        .auto-login-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #38bdf8;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Recent Cards Chips */
        .recent-card-chip {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 5px 10px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 700;
            transition: all 0.2s;
        }
        .recent-card-chip:hover {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.08);
        }
        .recent-card-chip .card-num {
            color: #38bdf8;
            cursor: pointer;
            direction: ltr;
        }
        .recent-card-chip .btn-del-card {
            color: #f87171;
            cursor: pointer;
            font-size: 11px;
            padding: 0 2px;
        }

        /* Animated Ads Carousel Styles */
        .ads-carousel-container {
            position: relative;
            overflow: hidden;
            background: rgba(255,255,255,0.04);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        .ads-slides-track {
            position: relative;
            min-height: 90px;
        }
        .ad-slide-item {
            display: none;
            padding: 14px;
            animation: fadeIn 0.5s ease-in-out;
        }
        .ad-slide-item.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .ad-link-wrapper {
            text-decoration: none;
            color: inherit;
            display: block;
        }
        .ad-img-box {
            width: 100%;
            max-height: 130px;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .ad-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .ad-content-box {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .ad-badge-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ad-badge {
            background: var(--accent);
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
        }
        .ad-title {
            font-size: 13px;
            font-weight: 800;
            color: #38bdf8;
        }
        .ad-desc {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.5;
            margin: 0;
        }
        .ads-dots-nav {
            display: flex;
            justify-content: center;
            gap: 6px;
            padding-bottom: 10px;
        }
        .ad-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: rgba(255,255,255,0.25);
            cursor: pointer;
            transition: 0.2s;
        }
        .ad-dot.active {
            background: #38bdf8;
            width: 20px;
            border-radius: 4px;
        }

        /* Shortcuts / Live Links */
        .shortcuts-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 10px;
        }
        .shortcut-card {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 12px 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: inherit;
            transition: 0.2s;
        }
        .shortcut-card:hover {
            border-color: #38bdf8;
            transform: translateX(-3px);
            background: rgba(56, 189, 248, 0.06);
        }
        .sc-icon-col {
            font-size: 26px;
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .sc-info-col {
            flex: 1;
        }
        .sc-title-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .sc-title {
            font-size: 13px;
            font-weight: 800;
            color: #fff;
        }
        .sc-badge {
            background: #0284c7;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 4px;
        }
        .sc-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
            line-height: 1.4;
        }
        .sc-arrow {
            color: #38bdf8;
            font-size: 14px;
            font-weight: 800;
        }

        /* Packages Grid & Cards */
        .packages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 12px;
            margin-top: 12px;
        }
        .pkg-card {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 14px;
            padding: 16px 14px 14px;
            text-align: center;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.25s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .pkg-card:hover {
            transform: translateY(-3px);
            border-color: var(--accent);
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        }
        .pkg-card.featured-pkg {
            border: 2px solid #38bdf8;
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, #090e1a 100%);
            box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
        }
        .pkg-badge {
            position: absolute;
            top: -10px;
            left: 10px;
            background: linear-gradient(135deg, var(--accent) 0%, #059669 100%);
            color: #fff;
            font-size: 10px;
            font-weight: 900;
            padding: 2px 10px;
            border-radius: 20px;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
            letter-spacing: 0.3px;
        }
        .pkg-badge.featured-badge {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        }
        .pkg-name {
            font-size: 14px;
            font-weight: 800;
            color: #ffffff;
            margin-top: 4px;
            margin-bottom: 6px;
            line-height: 1.3;
        }
        .pkg-price {
            margin-bottom: 10px;
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 4px;
        }
        .pkg-price-num {
            font-size: 22px;
            font-weight: 900;
            color: #38bdf8;
            letter-spacing: -0.5px;
        }
        .pkg-price-num.free {
            font-size: 18px;
        }
        .pkg-currency {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 700;
        }
        .pkg-features-list {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            text-align: right;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .pkg-feat-item {
            font-size: 11px;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .feat-icon { font-size: 12px; }
        .feat-label { color: var(--text-muted); }
        .feat-val { color: #fff; margin-right: auto; }
        .pkg-desc-note {
            font-size: 10px;
            color: #94a3b8;
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed var(--card-border);
            line-height: 1.4;
        }
        .btn-pkg-order {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: linear-gradient(135deg, var(--accent) 0%, #059669 100%);
            color: #ffffff;
            text-decoration: none;
            font-size: 12px;
            font-weight: 800;
            padding: 9px 12px;
            border-radius: 8px;
            transition: all 0.2s ease;
            box-shadow: 0 3px 10px rgba(16, 185, 129, 0.3);
        }
        .btn-pkg-order:hover {
            opacity: 0.95;
            transform: translateY(-1px);
            box-shadow: 0 5px 14px rgba(16, 185, 129, 0.45);
        }

        /* Contacts */
        .contact-buttons-row {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 10px;
        }
        .contact-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 800;
            text-decoration: none;
            color: #ffffff;
            transition: opacity 0.2s;
        }
        .contact-btn:hover { opacity: 0.9; }
        .wa-btn { background: #16a34a; }
        .call-btn { background: #0284c7; }
        .tg-btn { background: #0ea5e9; }
        .pos-notice {
            margin-top: 10px;
            font-size: 11px;
            color: var(--text-muted);
            background: #090e1a;
            border: 1px solid var(--card-border);
            padding: 8px 10px;
            border-radius: 6px;
            text-align: center;
            line-height: 1.5;
        }
        /* POS & Card Selling Centers */
        .pos-section-card {
            margin-top: 16px;
        }
        .pos-search-wrapper {
            position: relative;
            margin-top: 12px;
            margin-bottom: 14px;
        }
        .pos-search-input {
            width: 100%;
            padding: 10px 38px 10px 14px;
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 10px;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            outline: none;
            transition: all 0.2s ease;
        }
        .pos-search-input:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
            background: #0d1527;
        }
        .pos-search-icon {
            position: absolute;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            font-size: 14px;
            color: var(--text-muted);
            pointer-events: none;
        }
        .pos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
        }
        .pos-card {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 14px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 10px;
            transition: all 0.25s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            position: relative;
        }
        .pos-card:hover {
            transform: translateY(-2px);
            border-color: #38bdf8;
            box-shadow: 0 6px 16px rgba(0,0,0,0.35);
        }
        .pos-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 6px;
        }
        .pos-name-group {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }
        .pos-store-icon {
            font-size: 20px;
            background: rgba(255,255,255,0.06);
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .pos-store-name {
            font-size: 13px;
            font-weight: 800;
            color: #fff;
            line-height: 1.3;
        }
        .pos-badge {
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 20px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .pos-badge-vip {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #fff;
            box-shadow: 0 2px 6px rgba(245, 158, 11, 0.35);
        }
        .pos-badge-std {
            background: rgba(56, 189, 248, 0.15);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.4);
        }
        .pos-card-body {
            display: flex;
            flex-direction: column;
            gap: 6px;
            text-align: right;
            border-top: 1px dashed var(--card-border);
            padding-top: 8px;
        }
        .pos-info-item {
            font-size: 11px;
            color: #cbd5e1;
            display: flex;
            align-items: flex-start;
            gap: 6px;
            line-height: 1.4;
        }
        .pos-info-icon { font-size: 12px; flex-shrink: 0; margin-top: 1px; }
        .pos-info-text { flex: 1; }
        .pos-info-notes { color: #94a3b8; font-size: 10.5px; }
        .pos-card-actions {
            display: flex;
            gap: 6px;
            margin-top: 4px;
        }
        .btn-pos-act {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 7px 8px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s ease;
        }
        .btn-pos-act:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-pos-call { background: #0284c7; }
        .btn-pos-wa { background: #16a34a; }
        .btn-pos-map { background: #8b5cf6; }
        .pos-no-results {
            text-align: center;
            padding: 20px 10px;
            font-size: 12px;
            color: #94a3b8;
            background: rgba(255,255,255,0.02);
            border-radius: 8px;
            border: 1px dashed var(--card-border);
            margin-top: 10px;
        }

        .footer-note {
            text-align: center;
            margin-top: 10px;
            font-size: 11px;
            color: #64748b;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Brand Header -->
        <header class="brand-header">
            {$logoEl}
            <h1 class="brand-title">{$netName}</h1>
            <p class="brand-slogan">{$slogan}</p>
        </header>

        <!-- Animated Ads Carousel Banner -->
        {$adsHtml}

        <!-- Main Login Box -->
        <div class="card login-card">
            <div class="welcome-text">{$welcome}</div>

            <!-- Auto-Login Countdown Overlay/Banner -->
            <div id="auto-login-banner" class="auto-login-box" style="display:none;">
                <div style="font-size:13px; font-weight:800; color:#38bdf8; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span class="auto-login-spinner"></span>
                    <span>جاري الدخول التلقائي بالكرت (<b id="auto-card-code" style="direction:ltr;"></b>)...</span>
                </div>
                <div style="margin-top:6px;">
                    <button type="button" onclick="cancelAutoLogin()" style="background:#ef4444; color:#fff; border:none; padding:4px 12px; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer;">
                        إلغاء الدخول التلقائي ✕
                    </button>
                </div>
            </div>

            \$(if error)
            <div class="alert-error" id="error-box">⚠️ \$(error)</div>
            \$(endif)

            <form name="login" action="\$(link-login-only)" method="post" onsubmit="if(document.getElementById('sam-network-terms') &amp;&amp; !document.getElementById('sam-network-terms').checked) return false; return handleFormSubmit(event)" \$(if chap-id) data-chap="1" \$(endif)>
                {$networkTermsHtml}
                <input type="hidden" name="dst" value="\$(link-orig)" />
                <input type="hidden" name="popup" value="true" />
                
                <div class="input-group">
                    <label class="input-label">رقم الكرت / كود المشترك:</label>
                    <input type="text" id="username-field" name="username" class="input-box" placeholder="أدخل رقم الكرت هنا" value="\$(username)" required autofocus oninput="if(NETWORK_AUTH_MODE!=='different')document.getElementById('password-field').value=NETWORK_AUTH_MODE==='username_only'?'':this.value;" />
                </div>
                
                <div class="input-group" style="{$networkPasswordStyle}"><label class="input-label">كلمة المرور:</label>
                    <input type="password" id="password-field" name="password" class="input-box" value="" />
                </div>

                <!-- Remember & Auto-Login Checkbox -->
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; font-size:12px; color:#cbd5e1;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700;">
                        <input type="checkbox" id="remember-card-checkbox" checked />
                        حفظ الكرت وتسجيل الدخول تلقائياً
                    </label>
                </div>

                <button type="submit" id="btn-submit-login" class="btn-login">⚡ تسجيل الدخول الآن</button>

                \$(if trial == 'yes')
                <div class="trial-box" style="margin-top:10px; text-align:center;">
                    <a href="\$(link-login-only)?dst=\$(link-orig-esc)&amp;username=T-\$(mac-esc)" class="btn-trial" style="display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#ffffff; padding:11px 16px; border-radius:10px; font-weight:800; text-decoration:none; font-size:13px; box-shadow:0 4px 12px rgba(16,185,129,0.35);">
                        <span>🎁</span>
                        <span>دخول للتجربة المجانية (Free Trial)</span>
                    </a>
                </div>
                \$(endif)

                <!-- Recent 3 Cards Chips Container -->
                <div id="recent-cards-box" style="display:none; margin-top:14px; border-top:1px dashed var(--card-border); padding-top:10px; text-align:right;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:11px; font-weight:800; color:var(--text-muted);">💳 الكروت السابقة على هذا الجهاز (3 كروت):</span>
                        <button type="button" onclick="clearAllRecentCards()" style="background:none; border:none; color:#f87171; font-size:11px; cursor:pointer; font-weight:700;">مسح الكل ✕</button>
                    </div>
                    <div id="recent-cards-list" style="display:flex; flex-wrap:wrap; gap:6px;">
                        <!-- Injected via JavaScript -->
                    </div>
                </div>
            </form>
        </div>

        <!-- Custom Shortcuts & Live Streaming Links -->
        {$shortcutsHtml}

        <!-- Packages Showcase -->
        {$packagesHtml}

        <!-- Points of Sale & Card Selling Centers -->
        {$posHtml}

        <!-- Contacts and Points of Sale -->
        {$contactsHtml}

        <!-- Footer -->
        <div class="footer-note">
            {$footerText}<br>
            <small>بوابة مصادقة MikroTik Hotspot & RADIUS</small>
        </div>
    </div>

    \$(if chap-id)
    <form name="sendin" action="\$(link-login-only)" method="post" style="display:none">
        <input type="hidden" name="username" />
        <input type="hidden" name="password" />
        <input type="hidden" name="dst" value="\$(link-orig)" />
        <input type="hidden" name="popup" value="true" />
    </form>
    <script type="text/javascript" src="/md5.js"></script>
    \$(endif)

    <script>
        const ALLOW_REMEMBER = {$rememberCardsOpt};
        const NETWORK_AUTH_MODE = "{$networkAuthMode}";
        const ALLOW_AUTO_LOGIN = {$autoLoginOpt};
        const AUTO_LOGIN_DELAY_SEC = {$autoDelay};
        const MAX_RECENT_CARDS = 3;

        \$(if error)
        const HAS_ROUTER_ERROR = true;
        \$(else)
        const HAS_ROUTER_ERROR = false;
        \$(endif)

        let autoLoginTimer = null;

        // Cookie Helpers
        function setCookie(name, value, days = 30) {
            const expires = new Date(Date.now() + days * 864e5).toUTCString();
            document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
        }
        function getCookie(name) {
            return document.cookie.split('; ').reduce((r, v) => {
                const parts = v.split('=');
                return parts[0] === name ? decodeURIComponent(parts[1]) : r;
            }, '');
        }
        function deleteCookie(name) {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }

        // Recent cards management
        function getRecentCards() {
            try {
                const raw = localStorage.getItem('hs_recent_cards') || getCookie('hs_recent_cards');
                return raw ? JSON.parse(raw) : [];
            } catch(e) { return []; }
        }

        function saveCardToStorage(code, autoLogin = true) {
            if (!code || !ALLOW_REMEMBER) return;
            code = String(code).replace(/^#+/, '').trim();
            if (!code) return;

            let list = getRecentCards().filter(c => c !== code);
            list.unshift(code);
            if (list.length > MAX_RECENT_CARDS) list = list.slice(0, MAX_RECENT_CARDS);

            try { localStorage.setItem('hs_recent_cards', JSON.stringify(list)); } catch(e){}
            setCookie('hs_recent_cards', JSON.stringify(list), 60);

            if (autoLogin && ALLOW_AUTO_LOGIN) {
                try { localStorage.setItem('hs_auto_card', code); } catch(e){}
                setCookie('hs_auto_card', code, 30);
            }
        }

        function removeRecentCard(code) {
            let list = getRecentCards().filter(c => c !== code);
            try { localStorage.setItem('hs_recent_cards', JSON.stringify(list)); } catch(e){}
            setCookie('hs_recent_cards', JSON.stringify(list), 60);

            const autoCard = getCookie('hs_auto_card') || localStorage.getItem('hs_auto_card');
            if (autoCard === code) {
                deleteCookie('hs_auto_card');
                try { localStorage.removeItem('hs_auto_card'); } catch(e){}
            }
            renderRecentCards();
        }

        function clearAllRecentCards() {
            try { localStorage.removeItem('hs_recent_cards'); localStorage.removeItem('hs_auto_card'); } catch(e){}
            deleteCookie('hs_recent_cards');
            deleteCookie('hs_auto_card');
            renderRecentCards();
        }

        function renderRecentCards() {
            if (!ALLOW_REMEMBER) return;
            const list = getRecentCards();
            const box = document.getElementById('recent-cards-box');
            const container = document.getElementById('recent-cards-list');
            if (!box || !container) return;

            if (list.length === 0) {
                box.style.display = 'none';
                return;
            }

            box.style.display = 'block';
            container.innerHTML = list.map(card => `
                <div class="recent-card-chip">
                    <span class="card-num" onclick="useCard('\${card}')" title="تسجيل الدخول بهذا الكرت">💳 \${card}</span>
                    <span class="btn-del-card" onclick="removeRecentCard('\${card}')" title="حذف من السجل">✕</span>
                </div>
            `).join('');
        }

        function useCard(cardCode) {
            cancelAutoLogin();
            document.getElementById('username-field').value = cardCode;
            if(NETWORK_AUTH_MODE==='different'){document.getElementById('password-field').focus();return;}
            document.getElementById('password-field').value = NETWORK_AUTH_MODE==='username_only'?'':cardCode;
            doActualSubmit();
        }

        function handleFormSubmit(e) {
            cancelAutoLogin();
            const u = document.getElementById('username-field').value.trim();
            const chk = document.getElementById('remember-card-checkbox');
            saveCardToStorage(u, chk ? chk.checked : true);
            return doActualSubmit();
        }

        function doActualSubmit() {
            const terms=document.getElementById('sam-network-terms');if(terms&&!terms.checked){terms.reportValidity();return false;}
            if(NETWORK_AUTH_MODE!=='different')document.login.password.value=NETWORK_AUTH_MODE==='username_only'?'':document.login.username.value;
            \$(if chap-id)
            if (document.sendin && typeof hexMD5 === 'function') {
                document.sendin.username.value = document.login.username.value;
                document.sendin.password.value = hexMD5('\$(chap-id)' + document.login.password.value + '\$(chap-challenge)');
                document.sendin.submit();
                return false;
            }
            \$(endif)
            return true;
        }

        function cancelAutoLogin() {
            if (autoLoginTimer) {
                clearTimeout(autoLoginTimer);
                autoLoginTimer = null;
            }
            const banner = document.getElementById('auto-login-banner');
            if (banner) banner.style.display = 'none';
        }

        function checkAutoLogin() {
            if (!ALLOW_AUTO_LOGIN || HAS_ROUTER_ERROR) {
                // If there is an error, clear auto card so it doesn't loop
                if (HAS_ROUTER_ERROR) {
                    deleteCookie('hs_auto_card');
                    try { localStorage.removeItem('hs_auto_card'); } catch(e){}
                }
                return;
            }

            const autoCard = getCookie('hs_auto_card') || localStorage.getItem('hs_auto_card');
            if (!autoCard) return;

            // Fill the input
            const uField = document.getElementById('username-field');
            const pField = document.getElementById('password-field');
            if (uField) uField.value = autoCard;
            if (pField) pField.value = NETWORK_AUTH_MODE==='username_only'?'':autoCard;

            // Show countdown banner
            const banner = document.getElementById('auto-login-banner');
            const codeEl = document.getElementById('auto-card-code');
            if (banner && codeEl) {
                codeEl.innerText = autoCard;
                banner.style.display = 'block';
            }

            autoLoginTimer = setTimeout(() => {
                if(doActualSubmit()!==false)document.login.submit();
            }, AUTO_LOGIN_DELAY_SEC * 1000);
        }

        // Ads carousel rotation
        function setupAdSlider(sliderId) {
            const container = document.getElementById(sliderId);
            if (!container) return;
            const slides = container.querySelectorAll('.ad-slide-item');
            const dots = container.querySelectorAll('.ad-dot');
            if (slides.length <= 1) return;

            let current = 0;
            const speed = (parseInt(container.dataset.speed) || 4) * 1000;

            function showSlide(idx) {
                slides.forEach((s, i) => s.classList.toggle('active', i === idx));
                dots.forEach((d, i) => d.classList.toggle('active', i === idx));
                current = idx;
            }

            window.goToSlide = function(sId, idx) {
                if (sId === sliderId) showSlide(idx);
            };

            setInterval(() => {
                showSlide((current + 1) % slides.length);
            }, speed);
        }

        function filterPosList(q, pageType) {
            q = (q || '').toLowerCase().trim();
            const grid = document.getElementById('pos-grid-' + pageType);
            const noRes = document.getElementById('pos-no-results-' + pageType);
            if (!grid) return;
            const cards = grid.querySelectorAll('.pos-card');
            let count = 0;
            cards.forEach(c => {
                const txt = (c.getAttribute('data-search') || '').toLowerCase();
                if (!q || txt.includes(q)) {
                    c.style.display = 'flex';
                    count++;
                } else {
                    c.style.display = 'none';
                }
            });
            if (noRes) noRes.style.display = (count === 0 && q !== '') ? 'block' : 'none';
        }

        window.addEventListener('DOMContentLoaded', () => {
            setupAdSlider('hs-ad-slider-login');
            renderRecentCards();
            checkAutoLogin();
        });
    </script>
</body>
</html>
HTML;
    }

    /**
     * Build status.html template (Matches Cards Portal UI from media_1790192550646.png WITHOUT card search)
     */
    public function buildStatusHtml(array $s): string {
        $theme = $s['theme'];
        $brand = $s['brand'];
        $contacts = $s['contacts'];
        $ads = $s['ads'];
        $shortcuts = $s['shortcuts'] ?? [];
        $posConfig = $s['pos_config'] ?? [];
        $statusOpts = $s['status_options'];

        $netName = htmlspecialchars($brand['network_name'] ?: 'شبكتنا لخدمات الإنترنت');
        $serverApiUrl = htmlspecialchars($brand['server_api_url'] ?? '');
        $primaryColor = htmlspecialchars($theme['primary_color'] ?: '#0284c7');
        $accentColor = htmlspecialchars($theme['accent_color'] ?: '#10b981');
        $bgStart = htmlspecialchars($theme['bg_gradient_start'] ?: '#0b1120');
        $bgEnd = htmlspecialchars($theme['bg_gradient_end'] ?: '#0c4a6e');
        $cardBg = htmlspecialchars($theme['card_bg'] ?: '#151f32');
        $cardBorder = htmlspecialchars($theme['card_border'] ?: '#23334d');
        $textColor = htmlspecialchars($theme['text_color'] ?: '#f8fafc');
        $textMuted = htmlspecialchars($theme['text_muted'] ?: '#94a3b8');
        $radius = htmlspecialchars($theme['border_radius'] ?: '16px');

        $waNum = preg_replace('/[^0-9]/', '', (string)($contacts['whatsapp'] ?? ''));
        $phones = (array)($contacts['phones'] ?? []);
        $firstPhone = !empty($phones) ? (string)reset($phones) : '';

        // Ads Carousel
        $adsHtml = '';
        if (!empty($statusOpts['show_ads'])) {
            $adsHtml = $this->renderAdsCarouselHtml($ads, 'status', $accentColor, $radius);
        }

        // Shortcuts
        $shortcutsHtml = '';
        if (!empty($statusOpts['show_shortcuts'])) {
            $shortcutsHtml = $this->renderShortcutsHtml($shortcuts, 'status', $accentColor, $radius);
        }

        // POS Selling Points
        $posHtml = '';
        if (!empty($statusOpts['show_pos'])) {
            $posHtml = $this->renderPosPointsHtml($posConfig, 'status', $accentColor, $radius);
        }

        $refreshInterval = (int)($statusOpts['auto_refresh_interval'] ?? 15);
        if ($refreshInterval < 5) $refreshInterval = 15;
        $autoRefreshEnabled = !empty($statusOpts['auto_refresh_enabled']) ? 'true' : 'false';

        return <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$netName} - بوابة رصيد وتحكم الكرت</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: {$primaryColor};
            --primary-hover: color-mix(in srgb, var(--primary) 85%, black);
            --accent: {$accentColor};
            --bg-start: {$bgStart};
            --bg-end: {$bgEnd};
            --card: {$cardBg};
            --card-border: {$cardBorder};
            --text: {$textColor};
            --text-muted: {$textMuted};
            --danger: #ef4444;
            --warning: #f59e0b;
            --purple: #8b5cf6;
            --radius: {$radius};
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', 'Tajawal', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body {
            background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg-end) 100%);
            background-attachment: fixed;
            color: var(--text);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 16px 12px 30px;
        }
        .app-container {
            width: 100%;
            max-width: 480px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .app-header {
            text-align: center;
            padding: 10px 0 4px 0;
        }
        .app-header h1 {
            font-size: 20px;
            font-weight: 800;
            color: #38bdf8;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .app-header p {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 4px;
        }
        
        .card {
            background: var(--card);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
            padding: 18px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        }
        .card-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        .card-title {
            font-size: 15px;
            font-weight: 800;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .card-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 4px;
            line-height: 1.5;
        }

        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
        }
        .btn {
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 10px 18px;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            transition: 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-decoration: none;
        }
        .btn:hover { opacity: 0.92; }
        .btn-danger { background: var(--danger); }
        .btn-success { background: var(--accent); }
        .btn-success:hover { background: #059669; }

        /* Glowing Circular Quota Meter */
        .balance-circle {
            width: 155px;
            height: 155px;
            border-radius: 50%;
            border: 7px solid var(--primary);
            margin: 14px auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: radial-gradient(circle, var(--card) 0%, rgba(0,0,0,0.4) 100%);
            box-shadow: 0 0 25px color-mix(in srgb, var(--primary) 40%, transparent);
        }
        .balance-val {
            font-size: 20px;
            font-weight: 800;
            color: var(--primary);
            direction: ltr;
        }
        .balance-lbl {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
        }
        .balance-percent {
            font-size: 12px;
            color: #38bdf8;
            margin-top: 3px;
            font-weight: 800;
            direction: ltr;
        }

        .stats-3col-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 12px;
            border-top: 1px solid var(--card-border);
            padding-top: 10px;
            text-align: center;
        }
        .stats-3col-grid b {
            display: block;
            color: #fff;
            font-size: 12px;
            margin-top: 2px;
            direction: ltr;
        }

        /* Speed Control Grid */
        .speed-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(125px, 1fr));
            gap: 10px;
            margin-top: 12px;
        }
        .speed-btn {
            background: #090e1a;
            border: 2px solid var(--card-border);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            cursor: pointer;
            transition: 0.2s;
            color: #fff;
        }
        .speed-btn:hover {
            border-color: #38bdf8;
            transform: translateY(-2px);
        }
        .speed-btn.active {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.18);
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
        }
        .speed-btn i {
            font-size: 20px;
            display: block;
            margin-bottom: 4px;
        }
        .speed-btn b {
            font-size: 12px;
            display: block;
        }
        .speed-btn small {
            font-size: 10px;
            color: var(--text-muted);
        }

        /* Device Limit Select */
        .device-action-row {
            display: flex;
            gap: 10px;
            margin-top: 12px;
            align-items: center;
        }
        .select-input {
            flex: 1;
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 11px 14px;
            color: #fff;
            font-size: 14px;
            font-weight: 700;
            outline: none;
        }

        /* Device Item */
        .device-item {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 12px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            font-size: 12px;
        }

        /* Animated Ads Carousel */
        .ads-carousel-container {
            position: relative;
            overflow: hidden;
            background: rgba(255,255,255,0.04);
            border: 1px solid var(--card-border);
            border-radius: var(--radius);
        }
        .ads-slides-track {
            position: relative;
            min-height: 85px;
        }
        .ad-slide-item {
            display: none;
            padding: 14px;
            animation: fadeIn 0.4s ease-in-out;
        }
        .ad-slide-item.active {
            display: block;
        }
        .ad-link-wrapper {
            text-decoration: none;
            color: inherit;
            display: block;
        }
        .ad-img-box {
            width: 100%;
            max-height: 120px;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .ad-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .ad-badge-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ad-badge {
            background: var(--accent);
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
        }
        .ad-title {
            font-size: 13px;
            font-weight: 800;
            color: #38bdf8;
        }
        .ad-desc {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.5;
            margin: 4px 0 0;
        }
        .ads-dots-nav {
            display: flex;
            justify-content: center;
            gap: 6px;
            padding-bottom: 10px;
        }
        .ad-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: rgba(255,255,255,0.25);
            cursor: pointer;
            transition: 0.2s;
        }
        .ad-dot.active {
            background: #38bdf8;
            width: 20px;
            border-radius: 4px;
        }

        /* Shortcuts / Live Links */
        .shortcuts-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 10px;
        }
        .shortcut-card {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 12px 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: inherit;
            transition: 0.2s;
        }
        .shortcut-card:hover {
            border-color: #38bdf8;
            transform: translateX(-3px);
            background: rgba(56, 189, 248, 0.06);
        }
        .sc-icon-col {
            font-size: 26px;
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .sc-info-col {
            flex: 1;
        }
        .sc-title-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .sc-title {
            font-size: 13px;
            font-weight: 800;
            color: #fff;
        }
        .sc-badge {
            background: #0284c7;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 4px;
        }
        .sc-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
            line-height: 1.4;
        }
        .sc-arrow {
            color: #38bdf8;
            font-size: 14px;
            font-weight: 800;
        }

        /* Auto-Update & Telemetry Controls Box */
        .update-controls-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 10px 14px;
            margin-top: 10px;
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 46px;
            height: 24px;
        }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background-color: #334155; transition: .3s; border-radius: 24px;
        }
        .toggle-slider:before {
            position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
            background-color: white; transition: .3s; border-radius: 50%;
        }
        input:checked + .toggle-slider { background-color: var(--accent); }
        input:checked + .toggle-slider:before { transform: translateX(22px); }

        .btn-logout {
            width: 100%;
            background: var(--danger);
            color: #ffffff;
            border: none;
            padding: 13px;
            font-size: 15px;
            font-weight: 800;
            border-radius: 10px;
            cursor: pointer;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
            transition: opacity 0.2s;
        }
        .btn-logout:hover { opacity: 0.9; }

        /* POS & Card Selling Centers */
        .pos-section-card {
            margin-top: 4px;
        }
        .pos-search-wrapper {
            position: relative;
            margin-top: 12px;
            margin-bottom: 14px;
        }
        .pos-search-input {
            width: 100%;
            padding: 10px 38px 10px 14px;
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 10px;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            outline: none;
            transition: all 0.2s ease;
        }
        .pos-search-input:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
            background: #0d1527;
        }
        .pos-search-icon {
            position: absolute;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            font-size: 14px;
            color: var(--text-muted);
            pointer-events: none;
        }
        .pos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
        }
        .pos-card {
            background: #090e1a;
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 14px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 10px;
            transition: all 0.25s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            position: relative;
        }
        .pos-card:hover {
            transform: translateY(-2px);
            border-color: #38bdf8;
            box-shadow: 0 6px 16px rgba(0,0,0,0.35);
        }
        .pos-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 6px;
        }
        .pos-name-group {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }
        .pos-store-icon {
            font-size: 20px;
            background: rgba(255,255,255,0.06);
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .pos-store-name {
            font-size: 13px;
            font-weight: 800;
            color: #fff;
            line-height: 1.3;
        }
        .pos-badge {
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 20px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .pos-badge-vip {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #fff;
            box-shadow: 0 2px 6px rgba(245, 158, 11, 0.35);
        }
        .pos-badge-std {
            background: rgba(56, 189, 248, 0.15);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.4);
        }
        .pos-card-body {
            display: flex;
            flex-direction: column;
            gap: 6px;
            text-align: right;
            border-top: 1px dashed var(--card-border);
            padding-top: 8px;
        }
        .pos-info-item {
            font-size: 11px;
            color: #cbd5e1;
            display: flex;
            align-items: flex-start;
            gap: 6px;
            line-height: 1.4;
        }
        .pos-info-icon { font-size: 12px; flex-shrink: 0; margin-top: 1px; }
        .pos-info-text { flex: 1; }
        .pos-info-notes { color: #94a3b8; font-size: 10.5px; }
        .pos-card-actions {
            display: flex;
            gap: 6px;
            margin-top: 4px;
        }
        .btn-pos-act {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 7px 8px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
            color: #fff;
            transition: all 0.2s ease;
        }
        .btn-pos-act:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-pos-call { background: #0284c7; }
        .btn-pos-wa { background: #16a34a; }
        .btn-pos-map { background: #8b5cf6; }
        .pos-no-results {
            text-align: center;
            padding: 20px 10px;
            font-size: 12px;
            color: #94a3b8;
            background: rgba(255,255,255,0.02);
            border-radius: 8px;
            border: 1px dashed var(--card-border);
            margin-top: 10px;
        }

        .support-box {
            text-align: center;
            font-size: 12px;
            color: var(--text-muted);
            line-height: 1.6;
        }
        .support-box a {
            color: #38bdf8;
            font-weight: 800;
            text-decoration: none;
        }

        .toast {
            position: fixed;
            bottom: 20px;
            right: 50%;
            transform: translateX(50%);
            background: #1e293b;
            color: #fff;
            border: 1px solid #38bdf8;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 13px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.5);
            display: none;
            z-index: 1000;
            text-align: center;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- 1. Top Balance Dashboard Card (Matched Strictly to Reference Image) -->
        <div class="card" style="text-align:center;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="badge" style="background:#16a34a; color:#fff;" id="p-status">active</span>
                <span class="badge" style="background:#0284c7; color:#fff;" id="p-package">\$(username)</span>
            </div>

            <!-- Glowing Circular Meter -->
            <div class="balance-circle">
                <div class="balance-val" id="p-remaining">\$(if remain-bytes-total)\$(remain-bytes-total-nice)\$(else)\$(bytes-in-nice)\$(endif)</div>
                <div class="balance-lbl">\$(if remain-bytes-total)الرصيد المتبقي\$(else)استهلاك الجلسة\$(endif)</div>
                <div class="balance-percent" id="p-percent">--% متبقي</div>
            </div>

            <!-- 3 Column Stats Row -->
            <div class="stats-3col-grid">
                <div>الاستهلاك الكلي: <b id="p-consumed">\$(bytes-out-nice)</b></div>
                <div>الصلاحية: <b id="p-validity">غير محددة</b></div>
                <div>وقت الاستخدام المتبقي: <b id="p-uptime">\$(if session-time-left)\$(session-time-left)\$(else)غير محدود\$(endif)</b></div>
            </div>
        </div>

        <!-- 2. Device Limit Control Card -->
        <div class="card" id="device-limit-card">
            <div class="card-header-row">
                <div class="card-title">📊 تحديد عدد المتصلين المسموح به</div>
                <span class="badge" style="background:var(--purple); color:#fff;" id="p-max-profile-limit">الحد الأقصى للباقة: 1</span>
            </div>
            <p class="card-desc">يمكنك تحديد كم جهاز يُسمح له بالاتصال بالكرت بنفس الوقت (لا يتجاوز حد الباقة):</p>
            <div class="device-action-row">
                <select id="device-limit-select" class="select-input">
                    <option value="1">جهاز واحد فقط (1)</option>
                </select>
                <button class="btn btn-success" style="white-space:nowrap;" onclick="saveDeviceLimit()">💾 حفظ التحديد</button>
            </div>
        </div>

        <!-- 3. MAC Lock Card -->
        <div class="card" id="mac-lock-card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div>
                    <div class="card-title">🔒 تثبيت الجهاز عند أول دخول</div>
                    <p class="card-desc">عند التفعيل يُربط الكرت تلقائياً بعنوان MAC لأول جهاز يدخل، ويمكن تعطيله لإزالة الربط.</p>
                    <div id="mac-lock-value" style="font-size:11px; color:#38bdf8; margin-top:6px; font-weight:700;">التثبيت غير مفعل</div>
                </div>
                <button id="mac-lock-toggle" class="btn btn-success" style="min-width:115px;" onclick="toggleMacLock()">🔒 تفعيل التثبيت</button>
            </div>
        </div>

        <!-- 4. Speed Control Card -->
        <div class="card" id="speed-card">
            <div class="card-header-row">
                <div class="card-title">⚡ سرعة الكرت</div>
                <span class="badge" style="background:#0284c7; color:#fff;" id="p-current-speed">السرعة القياسية</span>
            </div>

            <!-- Notice if speed change is locked -->
            <div id="speed-locked-notice" style="display:none; margin-top:10px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:12px; text-align:center;">
                <div style="font-size:13px; font-weight:700; color:#f87171;">🔒 السرعة ثابتة ومحددة بالباقة</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:3px;" id="speed-locked-desc">هذه الباقة سرعة ثابتة ولا يمكن تغييرها</div>
            </div>

            <!-- If speed change is unlocked -->
            <div id="speed-unlocked-container" style="display:none; margin-top:8px;">
                <p class="card-desc">اختر السرعة المطلوبة وسيتم تطبيقها على الراوتر فوراً:</p>
                <div class="speed-grid" id="speed-buttons-container">
                    <!-- Injected via JavaScript -->
                </div>
            </div>
        </div>

        <!-- 5. Connected Devices & Kick Out Card -->
        <div class="card" id="devices-card">
            <div class="card-header-row">
                <div class="card-title">👥 الأجهزة المتصلة حالياً (<span id="dev-count">0</span>)</div>
                <button class="btn" style="padding:4px 10px; font-size:11px;" onclick="loadDevices()">⟳ تحديث</button>
            </div>
            <p class="card-desc">افصل أي جهاز غير مرغوب فيه بضغطة زر لحماية رصيدك:</p>
            <div id="devices-list" style="margin-top:10px;">
                <div style="text-align:center; padding:12px; font-size:12px; color:var(--text-muted);">جاري فحص الأجهزة المتصلة...</div>
            </div>
        </div>

        <!-- 6. Custom Shortcuts & Live Streaming Hub -->
        {$shortcutsHtml}

        <!-- 7. Animated Image Ads Slider -->
        {$adsHtml}

        <!-- 8. Points of Sale & Card Distribution Grid -->
        {$posHtml}

        <!-- 9. Auto-Update / Telemetry Polling Controls -->
        <div class="card">
            <div class="card-header-row">
                <div class="card-title">⚙️ التحديث التلقائي للبيانات والسرعة</div>
                <span id="update-status-badge" class="badge" style="background:#16a34a; color:#fff;">نشط 🟢</span>
            </div>
            <p class="card-desc">يمكنك إيقاف التحديث التلقائي في الخلفية لتوفير استهلاك بيانات الكرت والبطارية:</p>
            
            <div class="update-controls-box">
                <div style="font-size:12px; font-weight:700; color:#fff;">
                    التحديث الدوري التلقائي (كل {$refreshInterval} ثانية):
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="auto-refresh-toggle" checked onchange="toggleAutoRefresh(this.checked)" />
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div style="display:flex; gap:8px; margin-top:10px;">
                <button class="btn" style="flex:1; background:#1e293b; border:1px solid var(--card-border); color:#38bdf8;" onclick="refreshDataManually()">
                    ⟳ تحديث البيانات والسرعة فوراً
                </button>
            </div>
        </div>

        <!-- 9. Disconnect & Support Card -->
        <div class="card" style="display:flex; flex-direction:column; gap:12px;">
            <a href="\$(link-logout)" class="btn-logout">🔴 تسجيل الخروج وفصل الاتصال</a>
            
            <div class="support-box">
                للتجديد أو الدعم الفني:
                " . ($waNum ? "<a href=\"https://wa.me/{$waNum}\" target=\"_blank\">💬 واتساب الإدارة</a>" : "") . "
                " . ($firstPhone ? " | <a href=\"tel:{$firstPhone}\">📞 اتصال ({$firstPhone})</a>" : "") . "
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        const CURRENT_CARD = '\$(username)'.replace(/^#+/, '').trim();
        const API_BASE = '{$serverApiUrl}';
        const AUTO_REFRESH_INTERVAL_SEC = {$refreshInterval};
        let isAutoRefreshActive = {$autoRefreshEnabled};
        let refreshTimer = null;
        let cardData = null;

        // Save card to recent history and auto-cookie on status page
        (function() {
            if (CURRENT_CARD && !CURRENT_CARD.includes('\$(')) {
                try {
                    let raw = localStorage.getItem('hs_recent_cards');
                    let list = raw ? JSON.parse(raw) : [];
                    list = list.filter(c => c !== CURRENT_CARD);
                    list.unshift(CURRENT_CARD);
                    if (list.length > 3) list = list.slice(0, 3);
                    localStorage.setItem('hs_recent_cards', JSON.stringify(list));
                    localStorage.setItem('hs_auto_card', CURRENT_CARD);

                    // Set Cookie
                    const expires = new Date(Date.now() + 30 * 864e5).toUTCString();
                    document.cookie = 'hs_auto_card=' + encodeURIComponent(CURRENT_CARD) + '; expires=' + expires + '; path=/; SameSite=Lax';
                    document.cookie = 'hs_recent_cards=' + encodeURIComponent(JSON.stringify(list)) + '; expires=' + expires + '; path=/; SameSite=Lax';
                } catch(e) {}
            }
        })();

        function showToast(msg) {
            const t = document.getElementById('toast');
            if (!t) return;
            t.innerText = msg;
            t.style.display = 'block';
            setTimeout(() => t.style.display = 'none', 3500);
        }

        function getApiUrl(action, extraParams = '') {
            let base = API_BASE ? API_BASE.replace(/\/+$/, '') + '/' : '';
            return base + 'api.php?action=' + action + extraParams;
        }

        function formatValidity(value, expiresAt) {
            const raw = String(value || '').trim().toLowerCase();
            const match = raw.match(/^(\d+)\s*(mo|[mhdy])$/i);
            if (match) {
                const labels = { m: 'دقيقة', h: 'ساعة', d: 'يوم', mo: 'شهر', y: 'سنة' };
                return match[1] + ' ' + (labels[match[2].toLowerCase()] || raw);
            }
            if (raw) return raw;
            if (expiresAt) return 'ينتهي ' + expiresAt;
            return 'غير محددة';
        }

        async function fetchCardData(quiet = false) {
            if (!CURRENT_CARD || CURRENT_CARD.includes('\$(')) {
                // In demo / simulator mode without real session
                return;
            }

            try {
                const res = await fetch(getApiUrl('subscriber_get_status', '&code=' + encodeURIComponent(CURRENT_CARD))).then(r => r.json());
                if (res && res.success && res.card) {
                    cardData = res.card;
                    renderCardDetails(cardData);
                } else if (!quiet) {
                    console.warn('Card status response:', res);
                }
            } catch (err) {
                if (!quiet) console.error('fetchCardData error:', err);
            }
        }

        function renderCardDetails(c) {
            if (!c) return;

            // Package & Status
            const pkgEl = document.getElementById('p-package');
            if (pkgEl) pkgEl.innerText = c.name_for_users || c.profile_name || CURRENT_CARD;
            const stEl = document.getElementById('p-status');
            if (stEl) stEl.innerText = c.status || 'active';

            // Remaining MB & Percentage
            if (c.remaining_mb !== undefined) {
                const remEl = document.getElementById('p-remaining');
                if (remEl) remEl.innerText = (typeof c.remaining_mb === 'number') ? (c.remaining_mb + ' MB') : c.remaining_mb;
            }
            if (c.remaining_percent !== undefined) {
                const pctEl = document.getElementById('p-percent');
                if (pctEl) pctEl.innerText = c.remaining_percent + '% متبقي';
            }
            if (c.total_consumed_mb !== undefined) {
                const consEl = document.getElementById('p-consumed');
                if (consEl) consEl.innerText = c.total_consumed_mb + ' MB';
            }
            if (c.validity || c.effective_validity) {
                const valEl = document.getElementById('p-validity');
                if (valEl) valEl.innerText = formatValidity(c.effective_validity || c.validity, c.expires_at);
            }

            // MAC Lock
            const macBtn = document.getElementById('mac-lock-toggle');
            const macValue = document.getElementById('mac-lock-value');
            if (macBtn && macValue) {
                const macEnabled = Number(c.mac_lock_enabled) === 1;
                macBtn.dataset.enabled = macEnabled ? '1' : '0';
                macBtn.innerText = macEnabled ? '🔓 تعطيل التثبيت' : '🔒 تفعيل التثبيت';
                macBtn.className = macEnabled ? 'btn btn-danger' : 'btn btn-success';
                macValue.innerText = macEnabled ? (c.locked_mac ? ('MAC المثبت: ' + c.locked_mac) : 'بانتظار الدخول لتثبيت MAC تلقائياً') : 'التثبيت غير مفعل';
            }

            // Device Limit
            const maxAllowed = parseInt(c.max_shared_users) || 1;
            const currentDevices = parseInt(c.current_allowed_devices) || 1;
            const maxLimitBadge = document.getElementById('p-max-profile-limit');
            if (maxLimitBadge) maxLimitBadge.innerText = 'الحد الأقصى للباقة: ' + maxAllowed + ' أجهزة';

            const sel = document.getElementById('device-limit-select');
            if (sel) {
                sel.innerHTML = '';
                for (let i = 1; i <= maxAllowed; i++) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.innerText = (i === 1) ? 'جهاز واحد فقط (1)' : (i + ' أجهزة متصلة');
                    if (i === currentDevices) opt.selected = true;
                    sel.appendChild(opt);
                }
            }

            // Speed Control
            const curSpeedBadge = document.getElementById('p-current-speed');
            if (curSpeedBadge) curSpeedBadge.innerText = c.effective_speed || 'السرعة القياسية';

            const isSpeedChangeAllowed = (c.allow_speed_change == 1 || c.allow_speed_change === true);
            const lockedNotice = document.getElementById('speed-locked-notice');
            const unlockedContainer = document.getElementById('speed-unlocked-container');
            const speedBtnsContainer = document.getElementById('speed-buttons-container');

            if (!isSpeedChangeAllowed) {
                if (lockedNotice) lockedNotice.style.display = 'block';
                if (unlockedContainer) unlockedContainer.style.display = 'none';
                const descEl = document.getElementById('speed-locked-desc');
                if (descEl) descEl.innerText = 'هذه الباقة سرعة ثابتة (' + (c.effective_speed || 'محددة') + ') ولا يمكن للمشترك تغييرها يدوياً';
            } else {
                if (lockedNotice) lockedNotice.style.display = 'none';
                if (unlockedContainer) unlockedContainer.style.display = 'block';
                if (speedBtnsContainer) {
                    speedBtnsContainer.innerHTML = '';
                    const availableTiers = (c.available_speeds && c.available_speeds.length > 0) ? c.available_speeds : [];
                    availableTiers.forEach(tier => {
                        const btn = document.createElement('div');
                        btn.className = 'speed-btn';
                        
                        const isCur = (c.effective_speed === tier.rate || c.effective_speed === tier.key || c.effective_speed.startsWith(tier.key + '/'));
                        if (isCur) btn.classList.add('active');

                        let icon = '🚀';
                        if (tier.mbps <= 1) icon = '🐢';
                        else if (tier.mbps <= 3) icon = '📱';
                        else if (tier.mbps <= 10) icon = '⚡';
                        else if (tier.mbps <= 50) icon = '👑';
                        else icon = '🔥';

                        btn.innerHTML = '<i>' + icon + '</i><b>' + tier.label + '</b><small>' + tier.rate + '</small>';
                        btn.onclick = () => changeSpeed(tier.key);
                        speedBtnsContainer.appendChild(btn);
                    });
                }
            }

            loadDevices();
        }

        async function saveDeviceLimit() {
            if (!CURRENT_CARD) return;
            const sel = document.getElementById('device-limit-select');
            const count = parseInt(sel?.value) || 1;

            showToast('جاري حفظ حد الأجهزة المتصلة...');
            try {
                const res = await fetch(getApiUrl('subscriber_set_max_devices'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: CURRENT_CARD, max_devices: count })
                }).then(r => r.json());

                if (res && res.success) {
                    showToast(res.message || 'تم حفظ حد الأجهزة بنجاح');
                } else {
                    showToast(res?.error || 'تعذر حفظ عدد الأجهزة');
                }
            } catch (err) {
                showToast('خطأ في الاتصال بالخادم');
            }
        }

        async function changeSpeed(tierKey) {
            if (!CURRENT_CARD) return;
            showToast('جاري تطبيق السرعة على الراوتر...');
            try {
                const res = await fetch(getApiUrl('subscriber_change_speed'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: CURRENT_CARD, speed: tierKey })
                }).then(r => r.json());

                if (res && res.success) {
                    showToast(res.message || 'تم تطبيق السرعة فوراً!');
                    const curSpeedBadge = document.getElementById('p-current-speed');
                    if (curSpeedBadge) curSpeedBadge.innerText = res.speed_label || res.effective_speed || tierKey;
                    fetchCardData(true);
                } else {
                    showToast(res?.error || 'تعذر تغيير السرعة');
                }
            } catch (err) {
                showToast('خطأ في تطبيق السرعة');
            }
        }

        async function toggleMacLock() {
            if (!CURRENT_CARD) return;
            const btn = document.getElementById('mac-lock-toggle');
            const enable = btn.dataset.enabled !== '1';
            if (!enable && !confirm('سيتم إزالة MAC المثبت والسماح للكرت بالدخول من جهاز آخر. هل تريد المتابعة؟')) return;
            btn.disabled = true;
            showToast(enable ? 'جاري تفعيل تثبيت MAC...' : 'جاري تعطيل تثبيت MAC...');
            try {
                const res = await fetch(getApiUrl('subscriber_set_mac_lock'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: CURRENT_CARD, enabled: enable })
                }).then(r => r.json());

                if (res && res.success) {
                    showToast(res.message || 'تم تحديث تثبيت MAC');
                    await fetchCardData(true);
                } else {
                    showToast(res?.error || 'تعذر تحديث تثبيت MAC');
                }
            } catch (e) {
                showToast('خطأ في الاتصال بالخادم');
            } finally {
                btn.disabled = false;
            }
        }

        async function loadDevices() {
            if (!CURRENT_CARD) return;
            try {
                const res = await fetch(getApiUrl('subscriber_get_devices', '&code=' + encodeURIComponent(CURRENT_CARD))).then(r => r.json());
                const devices = res?.devices || [];
                const devCountEl = document.getElementById('dev-count');
                if (devCountEl) devCountEl.innerText = devices.length;

                const container = document.getElementById('devices-list');
                if (!container) return;

                if (devices.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding:12px; font-size:12px; color:var(--text-muted);">لا توجد أجهزة أخرى متصلة حالياً بهذا الكرت</div>';
                    return;
                }

                container.innerHTML = devices.map(d => `
                    <div class="device-item">
                        <div>
                            <div style="font-weight:700; color:#38bdf8;">📱 \${d.callingstationid || 'جهاز متصل'}</div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">IP: \${d.framedipaddress || '-'} | استهلاك: \${d.session_mb || 0} MB</div>
                        </div>
                        <button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="kickDevice('\${d.callingstationid}')">
                            🚫 فصل
                        </button>
                    </div>
                `).join('');
            } catch (err) {
                console.error(err);
            }
        }

        async function kickDevice(mac) {
            if (!confirm('هل تريد بالتأكيد فصل وطرد هذا الجهاز (' + mac + ') من الكرت؟')) return;
            showToast('جاري إرسال أمر فصل الجهاز...');
            try {
                const res = await fetch(getApiUrl('subscriber_disconnect_device'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: CURRENT_CARD, mac: mac })
                }).then(r => r.json());

                if (res && res.success) {
                    showToast(res.message || 'تم فصل الجهاز بنجاح');
                    loadDevices();
                } else {
                    showToast(res?.error || 'تعذر فصل الجهاز');
                }
            } catch (err) {
                showToast('خطأ في إرسال أمر الفصل');
            }
        }

        // Auto-refresh and Telemetry control
        function toggleAutoRefresh(enabled) {
            isAutoRefreshActive = !!enabled;
            const badge = document.getElementById('update-status-badge');
            if (badge) {
                badge.innerText = isAutoRefreshActive ? 'نشط 🟢' : 'متوقف ⏸️';
                badge.style.background = isAutoRefreshActive ? '#16a34a' : '#64748b';
            }
            if (isAutoRefreshActive) {
                startAutoRefresh();
                showToast('تم تفعيل التحديث التلقائي للبيانات');
            } else {
                stopAutoRefresh();
                showToast('تم إيقاف التحديث التلقائي لحفظ الرصيد');
            }
        }

        function startAutoRefresh() {
            stopAutoRefresh();
            if (!isAutoRefreshActive) return;
            refreshTimer = setInterval(() => {
                fetchCardData(true);
            }, AUTO_REFRESH_INTERVAL_SEC * 1000);
        }

        function stopAutoRefresh() {
            if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }

        function refreshDataManually() {
            showToast('جاري تحديث البيانات والسرعة...');
            fetchCardData(false);
        }

        // Ads carousel setup
        function setupAdSlider(sliderId) {
            const container = document.getElementById(sliderId);
            if (!container) return;
            const slides = container.querySelectorAll('.ad-slide-item');
            const dots = container.querySelectorAll('.ad-dot');
            if (slides.length <= 1) return;

            let current = 0;
            const speed = (parseInt(container.dataset.speed) || 4) * 1000;

            function showSlide(idx) {
                slides.forEach((s, i) => s.classList.toggle('active', i === idx));
                dots.forEach((d, i) => d.classList.toggle('active', i === idx));
                current = idx;
            }

            window.goToSlide = function(sId, idx) {
                if (sId === sliderId) showSlide(idx);
            };

            setInterval(() => {
                showSlide((current + 1) % slides.length);
            }, speed);
        }

        function filterPosList(q, pageType) {
            q = (q || '').toLowerCase().trim();
            const grid = document.getElementById('pos-grid-' + pageType);
            const noRes = document.getElementById('pos-no-results-' + pageType);
            if (!grid) return;
            const cards = grid.querySelectorAll('.pos-card');
            let count = 0;
            cards.forEach(c => {
                const txt = (c.getAttribute('data-search') || '').toLowerCase();
                if (!q || txt.includes(q)) {
                    c.style.display = 'flex';
                    count++;
                } else {
                    c.style.display = 'none';
                }
            });
            if (noRes) noRes.style.display = (count === 0 && q !== '') ? 'block' : 'none';
        }

        window.addEventListener('DOMContentLoaded', () => {
            setupAdSlider('hs-ad-slider-status');
            fetchCardData(false);
            if (isAutoRefreshActive) startAutoRefresh();
        });
    </script>
</body>
</html>
HTML;
    }

    /**
     * Build alogin.html redirector
     */
    public function buildAloginHtml(array $s): string {
        $netName = htmlspecialchars($s['brand']['network_name'] ?: 'شبكتنا');
        $primaryColor = htmlspecialchars($s['theme']['primary_color'] ?: '#0284c7');
        $bgStart = htmlspecialchars($s['theme']['bg_gradient_start'] ?: '#0b1120');
        $bgEnd = htmlspecialchars($s['theme']['bg_gradient_end'] ?: '#0c4a6e');
        $cardBg = htmlspecialchars($s['theme']['card_bg'] ?: '#151f32');
        $cardBorder = htmlspecialchars($s['theme']['card_border'] ?: '#23334d');
        $textColor = htmlspecialchars($s['theme']['text_color'] ?: '#f8fafc');
        $textMuted = htmlspecialchars($s['theme']['text_muted'] ?: '#94a3b8');

        return <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="1; url=\$(link-redirect)">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$netName} - جاري التحويل...</title>
    <style>
        body { background: linear-gradient(180deg, {$bgStart} 0%, {$bgEnd} 100%); color: {$textColor}; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; text-align: center; padding-top: 90px; min-height: 100vh; }
        .box { background: {$cardBg}; border: 1px solid {$cardBorder}; border-radius: 14px; padding: 24px; max-width: 380px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .spinner { width: 44px; height: 44px; border: 4px solid {$cardBorder}; border-top-color: {$primaryColor}; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        a { color: {$primaryColor}; text-decoration: none; font-weight: bold; }
    </style>
</head>
<body>
    <div class="box">
        <div class="spinner"></div>
        <h3 style="margin-bottom:8px; font-size:18px;">تم تسجيل الدخول بنجاح! 🚀</h3>
        <p style="font-size:13px; color:{$textMuted};">جاري تحويلك إلى صفحة الرصيد والإنترنت...</p>
        <p style="margin-top:14px; font-size:12px;">إذا لم يتم التحويل تلقائياً <a href="\$(link-redirect)">اضغط هنا للدخول</a></p>
    </div>
</body>
</html>
HTML;
    }

    /**
     * Build logout.html
     */
    public function buildLogoutHtml(array $s): string {
        $netName = htmlspecialchars($s['brand']['network_name'] ?: 'شبكتنا');
        $primaryColor = htmlspecialchars($s['theme']['primary_color'] ?: '#0284c7');
        $bgStart = htmlspecialchars($s['theme']['bg_gradient_start'] ?: '#0b1120');
        $bgEnd = htmlspecialchars($s['theme']['bg_gradient_end'] ?: '#0c4a6e');
        $cardBg = htmlspecialchars($s['theme']['card_bg'] ?: '#151f32');
        $cardBorder = htmlspecialchars($s['theme']['card_border'] ?: '#23334d');
        $textColor = htmlspecialchars($s['theme']['text_color'] ?: '#f8fafc');
        $textMuted = htmlspecialchars($s['theme']['text_muted'] ?: '#94a3b8');

        return <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$netName} - تم تسجيل الخروج</title>
    <style>
        body { background: linear-gradient(180deg, {$bgStart} 0%, {$bgEnd} 100%); color: {$textColor}; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; text-align: center; padding-top: 80px; min-height: 100vh; }
        .box { background: {$cardBg}; border: 1px solid {$cardBorder}; border-radius: 14px; padding: 28px 20px; max-width: 380px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .btn { background: {$primaryColor}; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin-top: 18px; font-weight: bold; font-size:14px; }
    </style>
</head>
<body>
    <div class="box">
        <div style="font-size:42px; margin-bottom:10px;">🔒</div>
        <h2 style="font-size:19px; margin-bottom:8px;">تم تسجيل الخروج وإيقاف الرصيد</h2>
        <p style="color:{$textMuted}; font-size:13px; line-height:1.6;">شكراً لاستخدامك شبكة {$netName}. تم حفظ رصيدك ووقتك المتبقي بأمان.</p>
        <a href="\$(link-login)" class="btn">⚡ تسجيل الدخول مجدداً</a>
    </div>
</body>
</html>
HTML;
    }

    /**
     * Build radvert.html
     */
    public function buildRadvertHtml(array $s): string {
        return <<<HTML
<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="2; url=\$(link-orig)"><meta charset="utf-8"></head><body><p>جاري التحويل...</p></body></html>
HTML;
    }

    /**
     * Build errors.txt with Arabic localized MikroTik errors
     */
    public function buildErrorsTxt(): string {
        return <<<'TXT'
internal-error = خطأ داخلي في نظام الهوتسبوت
config-error = خطأ في إعدادات الخادم
not-logged-in = لم يتم تسجيل الدخول بعد
invalid-username = رقم الكرت أو اسم المستخدم غير صحيح
wrong-password = كلمة المرور غير صحيحة
card-disabled = هذا الكرت معطل حالياً، يرجى مراجعة إدارة الشبكة
card-expired = انتهت صلاحية هذا الكرت
traffic-limit = لقد استنفدت كامل رصيد البيانات المخصص للكرت
uptime-limit = لقد انتهى الوقت المسموح به لهذا الكرت
simultaneous-limit = لقد اكتمل الحد الأقصى لعدد الأجهزة المتصلة بهذا الكرت
cannot-login = تعذر تسجيل الدخول، يرجى المحاولة لاحقاً
session-timeout = انتهت مهلة الجلسة
TXT;
    }

    /**
     * Deploy the compiled hotspot bundle directly to a router via FTP / API
     */
    public function deployToRouter(int $nasId, int $networkId = 0): array {
        if ($networkId <= 0) {
            $stmt = $this->db->prepare("SELECT network_id FROM nas WHERE id = ?");
            $stmt->execute([$nasId]);
            $networkId = (int)$stmt->fetchColumn();
        }
        $bundle = $this->generateHotspotBundle($networkId);
        return $this->deployBundleToRouter($nasId, $bundle);
    }

    /**
     * Deploy any custom hotspot bundle to a router
     */
    public function deployBundleToRouter(int $nasId, array $bundle): array {
        $rStmt = $this->db->prepare("SELECT * FROM nas WHERE id = ?");
        $rStmt->execute([$nasId]);
        $router = $rStmt->fetch(PDO::FETCH_ASSOC);
        if (!$router) {
            return ['success' => false, 'error' => 'الراوتر المحدد غير موجود'];
        }

        $targetDir = trim((string)($router['hotspot_dir'] ?: 'hotspot'));
        $ftpPort = (int)($router['ftp_port'] ?: 21);
        $ftpUser = (string)($router['api_user'] ?: 'admin');
        $ftpPass = (string)($router['api_password'] ?? '');
        $ftpIp = (string)$router['nasname'];

        $ftpSuccess = false;
        $ftpError = '';

        // 1. Try FTP
        if (function_exists('ftp_connect')) {
            $conn = @ftp_connect($ftpIp, $ftpPort, 6);
            if ($conn) {
                if (@ftp_login($conn, $ftpUser, $ftpPass)) {
                    @ftp_pasv($conn, true);
                    $dirParts = explode('/', $targetDir);
                    $currDir = '';
                    foreach ($dirParts as $dp) {
                        if (empty($dp)) continue;
                        $currDir .= ($currDir ? '/' : '') . $dp;
                        @ftp_mkdir($conn, $currDir);
                    }
                    $allPushed = true;
                    foreach ($bundle as $fName => $content) {
                        $tempFile = tempnam(sys_get_temp_dir(), 'hs_');
                        file_put_contents($tempFile, $content);
                        if (strpos($fName, '/') !== false) {
                            $subFolder = $targetDir . '/' . dirname($fName);
                            @ftp_mkdir($conn, $subFolder);
                        }
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
                        $ftpError = 'تعذر رفع بعض ملفات القالب عبر FTP';
                    }
                } else {
                    $ftpError = 'بيانات تسجيل دخول FTP غير صحيحة';
                    @ftp_close($conn);
                }
            } else {
                $ftpError = "تعذر الاتصال بمنفذ FTP ({$ftpPort}) بالراوتر ({$ftpIp})";
            }
        }

        // 2. Fallback: RouterOS API
        if (!$ftpSuccess) {
            require_once __DIR__ . '/RouterOSApi.php';
            $api = new RouterOSApi();
            $api->timeout = 8;
            $apiPort = (int)($router['api_port'] ?: 8728);
            $apiSsl = !empty($router['api_ssl']);
            if ($api->connect($ftpIp, $ftpUser, $ftpPass, $apiPort, $apiSsl)) {
                foreach ($bundle as $fName => $content) {
                    $filePath = $targetDir . '/' . $fName;
                    $api->comm('/file/add', [
                        '=name=' . $filePath,
                        '=contents=' . $content
                    ]);
                }
                $api->disconnect();
                $ftpSuccess = true;
            } else {
                $ftpError .= ' | وفشل الاتصال عبر API: ' . ($api->error_str ?: 'مهلة الاتصال انتهت');
            }
        }

        if ($ftpSuccess) {
            return [
                'success' => true,
                'target_directory' => $targetDir,
                'router_name' => $router['shortname'] ?: $router['nasname'],
                'uploaded_files' => array_keys($bundle),
                'message' => "تم بنجاح تثبيت ورفع ملفات الهوتسبوت وبوابة المشترك المخصصة إلى الراوتر ({$router['shortname']}) في مجلد ({$targetDir})!"
            ];
        } else {
            return [
                'success' => false,
                'error' => "فشل رفع القالب إلى الراوتر: {$ftpError}. تأكد من تفعيل خدمة FTP أو API في الراوتر."
            ];
        }
    }

    /**
     * Fast Push: Deploy ONLY setting-api.html to router via FTP / API (Takes < 1s)
     */
    public function deploySettingApiOnly(int $routerId): array {
        $stmt = $this->db->prepare("SELECT * FROM nas WHERE id = ?");
        $stmt->execute([$routerId]);
        $router = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$router) {
            return ['success' => false, 'error' => 'الراوتر المحدد غير موجود في قاعدة البيانات'];
        }

        $networkId = (int)$router['network_id'];
        $studioData = $this->getStudioData($networkId);
        $settings = $studioData['settings'];
        $settingApiHtml = $this->buildSettingApiHtml($settings);

        $targetDir = trim((string)($router['hotspot_dir'] ?: 'hotspot'));
        $ftpIp = $router['nasname'];
        $ftpPort = (int)($router['ftp_port'] ?: 21);
        $ftpUser = $router['api_user'] ?: 'admin';
        $ftpPass = $router['api_password'] ?: '';

        $filesToPush = [
            'setting-api.html' => $settingApiHtml,
            'app/setting-api.html' => $settingApiHtml
        ];

        $ftpSuccess = false;
        $ftpError = '';

        // 1. Try FTP
        if (function_exists('ftp_connect')) {
            $conn = @ftp_connect($ftpIp, $ftpPort, 5);
            if ($conn) {
                if (@ftp_login($conn, $ftpUser, $ftpPass)) {
                    @ftp_pasv($conn, true);
                    @ftp_mkdir($conn, $targetDir);
                    @ftp_mkdir($conn, $targetDir . '/app');
                    $allPushed = true;
                    foreach ($filesToPush as $fName => $content) {
                        $tempFile = tempnam(sys_get_temp_dir(), 'hs_set_');
                        file_put_contents($tempFile, $content);
                        $remotePath = $targetDir . '/' . $fName;
                        if (!@ftp_put($conn, $remotePath, $tempFile, FTP_BINARY)) {
                            $allPushed = false;
                        }
                        @unlink($tempFile);
                    }
                    @ftp_close($conn);
                    if ($allPushed) $ftpSuccess = true;
                    else $ftpError = 'تعذر رفع ملف الإعدادات عبر FTP';
                } else {
                    $ftpError = 'بيانات تسجيل دخول FTP غير صحيحة';
                    @ftp_close($conn);
                }
            } else {
                $ftpError = "تعذر الاتصال بمنفذ FTP ({$ftpPort})";
            }
        }

        // 2. Fallback: RouterOS API
        if (!$ftpSuccess) {
            require_once __DIR__ . '/RouterOSApi.php';
            $api = new RouterOSApi();
            $api->timeout = 6;
            $apiPort = (int)($router['api_port'] ?: 8728);
            $apiSsl = !empty($router['api_ssl']);
            if ($api->connect($ftpIp, $ftpUser, $ftpPass, $apiPort, $apiSsl)) {
                foreach ($filesToPush as $fName => $content) {
                    $api->comm('/file/add', [
                        '=name=' . $targetDir . '/' . $fName,
                        '=contents=' . $content
                    ]);
                }
                $api->disconnect();
                $ftpSuccess = true;
            } else {
                $ftpError .= ' | وفشل الاتصال عبر API: ' . ($api->error_str ?: 'مهلة الاتصال انتهت');
            }
        }

        if ($ftpSuccess) {
            return [
                'success' => true,
                'message' => "تم بنجاح تحديث إعدادات وهوية وباقات الشبكة في الراوتر ({$router['shortname']}) فورياً!"
            ];
        } else {
            return [
                'success' => false,
                'error' => "فشل تحديث الإعدادات في الراوتر: {$ftpError}"
            ];
        }
    }

    /**
     * Build External Captive Portal Redirect Bundle
     */
    public function buildExternalRedirectBundle(int $networkId, string $serverPortalUrl = ''): array {
        if ($serverPortalUrl === '') {
            $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? '192.168.3.2';
            $serverPortalUrl = "{$proto}://{$host}/hotspot-portal.php";
        }

        $data = $this->getStudioData($networkId);
        $settings = $data['settings'];

        $redirectHtml = <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="pragma" content="no-cache">
<meta http-equiv="expires" content="-1">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>جاري التحويل إلى بوابة SAM...</title>
<meta http-equiv="refresh" content="0; url={$serverPortalUrl}?link-login=$(link-login)&link-login-only=$(link-login-only)&link-orig=$(link-orig)&link-status=$(link-status)&mac=$(mac)&ip=$(ip)&username=$(username)&error=$(error)&server-name=$(server-name)&hostname=$(hostname)&network_id={$networkId}">
<script>
window.location.replace("{$serverPortalUrl}?link-login=" + encodeURIComponent("$(link-login)") + "&link-login-only=" + encodeURIComponent("$(link-login-only)") + "&link-orig=" + encodeURIComponent("$(link-orig)") + "&link-status=" + encodeURIComponent("$(link-status)") + "&mac=" + encodeURIComponent("$(mac)") + "&ip=" + encodeURIComponent("$(ip)") + "&username=" + encodeURIComponent("$(username)") + "&error=" + encodeURIComponent("$(error)") + "&server-name=" + encodeURIComponent("$(server-name)") + "&hostname=" + encodeURIComponent("$(hostname)") + "&network_id={$networkId}");
</script>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#0b1120;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px}
.box{background:#151f32;border:1px solid #23334d;border-radius:16px;padding:30px 20px;max-width:380px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,0.4)}
.spinner{width:36px;height:36px;border:3px solid rgba(56,189,248,0.2);border-top-color:#38bdf8;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
a{color:#38bdf8;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;margin-top:12px}
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <p style="font-size:15px;font-weight:700;margin:0 0 8px">جاري تحويلك إلى صفحة تسجيل الدخول...</p>
  <a href="{$serverPortalUrl}?link-login=$(link-login)&link-login-only=$(link-login-only)&mac=$(mac)&ip=$(ip)&network_id={$networkId}">اضغط هنا إذا لم يتم التحويل تلقائياً</a>
</div>
</body>
</html>
HTML;

        $statusApiHtml = $this->buildStatusApiHtml($settings);
        $settingApiHtml = $this->buildSettingApiHtml($settings);
        $samBridgeJs = $this->buildSamBridgeJs();
        $errorsTxt = $this->buildErrorsTxt();

        return [
            'login.html' => $redirectHtml,
            'rlogin.html' => $redirectHtml,
            'redirect.html' => $redirectHtml,
            'status.html' => $this->buildStatusHtml($settings),
            'alogin.html' => $this->buildAloginHtml($settings),
            'logout.html' => $this->buildLogoutHtml($settings),
            'status-api.html' => $statusApiHtml,
            'setting-api.html' => $settingApiHtml,
            'app/status-api.html' => $statusApiHtml,
            'app/setting-api.html' => $settingApiHtml,
            'sam-app-bridge.js' => $samBridgeJs,
            'js/sam-app-bridge.js' => $samBridgeJs,
            'errors.txt' => $errorsTxt
        ];
    }

    /**
     * Generate MikroTik RouterOS Walled Garden Script
     */
    public function generateWalledGardenScript(string $serverHost, string $serverIp = ''): string {
        $host = trim($serverHost);
        $ip = trim($serverIp);
        if ($ip === '' && filter_var($host, FILTER_VALIDATE_IP)) {
            $ip = $host;
        }

        $script = "# ====================================================\n";
        $script .= "# SAM User Manager — Walled Garden Configuration for External Captive Portal\n";
        $script .= "# يسمح هذا السكربت للمشتركين بالوصول لصفحة السيرفر الخارجية قبل تسجيل الدخول\n";
        $script .= "# ====================================================\n\n";

        if ($ip !== '') {
            $script .= "/ip hotspot walled-garden ip add dst-address={$ip} action=accept comment=\"SAM Central Captive Portal Server IP\"\n";
        }
        if ($host !== '' && !filter_var($host, FILTER_VALIDATE_IP)) {
            $script .= "/ip hotspot walled-garden add dst-host=\"{$host}\" action=allow comment=\"SAM Central Portal Domain\"\n";
            $script .= "/ip hotspot walled-garden add dst-host=\"*.{$host}\" action=allow comment=\"SAM Wildcard Domain\"\n";
        }
        $script .= "/ip hotspot walled-garden add dst-host=\"fonts.googleapis.com\" action=allow comment=\"Google Fonts\"\n";
        $script .= "/ip hotspot walled-garden add dst-host=\"fonts.gstatic.com\" action=allow comment=\"Google Fonts CDN\"\n";
        $script .= "/ip hotspot walled-garden add dst-host=\"wa.me\" action=allow comment=\"WhatsApp Direct Order\"\n";
        $script .= "/ip hotspot walled-garden add dst-host=\"api.whatsapp.com\" action=allow comment=\"WhatsApp API\"\n";

        return $script;
    }

    /**
     * Generate MikroTik RouterOS Auto-Sync Script & Scheduler
     */
    public function generateRouterSyncScript(int $networkId, string $serverHost, string $hotspotDir = 'hotspot'): string {
        $cleanDir = trim($hotspotDir, '/');
        if ($cleanDir === '') $cleanDir = 'hotspot';

        $apiUrl = "http://{$serverHost}/hotspot-settings-api.php?network_id={$networkId}";

        $script = "# ====================================================\n";
        $script .= "# SAM User Manager — Auto-Sync Hotspot Settings Script & Scheduler\n";
        $script .= "# يقوم هذا السكربت بجلب أحدث إعدادات وباقات وهوية الشبكة من السيرفر دورياً\n";
        $script .= "# ====================================================\n\n";
        $script .= "/system script add name=\"sam-sync-hotspot-settings\" policy=ftp,read,write,policy,test source=\"/tool fetch url=\\\"{$apiUrl}\\\" dst-path=\\\"{$cleanDir}/app/setting-api.html\\\" mode=http; /tool fetch url=\\\"{$apiUrl}\\\" dst-path=\\\"{$cleanDir}/setting-api.html\\\" mode=http;\"\n\n";
        $script .= "/system scheduler add name=\"sam-sync-hotspot-sched\" interval=10m on-event=\"sam-sync-hotspot-settings\" start-time=startup comment=\"SAM Settings Auto-Sync\"\n";

        return $script;
    }

    /**
     * Create downloadable ZIP bundle
     */
    public function createZipBundle(int $networkId, bool $isExternalRedirect = false, string $serverPortalUrl = ''): string {
        $bundle = $isExternalRedirect 
            ? $this->buildExternalRedirectBundle($networkId, $serverPortalUrl)
            : $this->generateHotspotBundle($networkId);

        $zipFile = tempnam(sys_get_temp_dir(), 'hs_zip_');
        $zip = new ZipArchive();
        if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new Exception('تعذر إنشاء ملف ZIP للقالب');
        }

        foreach ($bundle as $fName => $content) {
            $zip->addFromString($fName, $content);
        }
        $zip->close();
        return $zipFile;
    }
}

