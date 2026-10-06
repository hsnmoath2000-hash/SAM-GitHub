/* SAM UI Studio: presentation-only customization layer & navigation organizer. */
(function () {
    if (!window.App || window.__samUiStudioLoaded) return;
    window.__samUiStudioLoaded = true;

    function esc(v) { return App.escape ? App.escape(v == null ? '' : String(v)) : String(v == null ? '' : v); }
    function byOrder(a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); }

    // Inject Studio CSS styles dynamically
    if (!document.getElementById('sam-studio-styles')) {
        var styleEl = document.createElement('style');
        styleEl.id = 'sam-studio-styles';
        styleEl.textContent = `
.sam-nav-studio-card { background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:18px; margin:14px 0; box-shadow:0 4px 14px rgba(15,23,42,0.06); }
.sam-global-notice { background:#f0fdf4; border:1px solid #86efac; border-radius:10px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; color:#166534; font-size:12.5px; }
.sam-studio-search-bar { margin-bottom:14px; }
.sam-studio-search-bar input { width:100%; border-radius:8px; border:1px solid #cbd5e1; padding:8px 12px; font-size:13px; background:#f8fafc; box-sizing:border-box; }
.sam-studio-sections-list { display:flex; flex-direction:column; gap:12px; }
.sam-dept-card { background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; transition:box-shadow 0.2s, border-color 0.2s; }
.sam-dept-card:hover { border-color:#94a3b8; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
.sam-dept-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:10px 14px; background:#f1f5f9; border-bottom:1px solid #e2e8f0; }
.sam-dept-info { display:flex; align-items:center; gap:8px; flex:1 1 300px; }
.sam-dept-order-badge { background:#0f172a; color:#fff; font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; min-width:26px; text-align:center; }
.sam-dept-icon { font-size:18px; }
.sam-dept-title-wrap { display:flex; align-items:center; gap:8px; flex:1; }
.sam-dept-input { font-weight:700; font-size:13px; color:#0f172a; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; flex:1; max-width:280px; box-sizing:border-box; }
.sam-dept-count-badge { background:#e2e8f0; color:#475569; font-size:11px; padding:2px 8px; border-radius:10px; white-space:nowrap; }
.sam-dept-actions { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.sam-dept-items-list { padding:8px 12px 12px; display:flex; flex-direction:column; gap:6px; background:#ffffff; }
.sam-dept-collapsed .sam-dept-items-list { display:none !important; }
.sam-dept-collapsed .sam-dept-chevron { transform:rotate(180deg); }
.sam-dept-chevron { display:inline-block; transition:transform 0.2s; font-size:11px; }
.sam-item-row { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:7px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; transition:all 0.2s ease; }
.sam-item-row:hover { background:#f1f5f9; border-color:#cbd5e1; }
.sam-item-row.sam-item-first { background:#eff6ff; border-color:#bfdbfe; }
.sam-item-col-main { display:flex; align-items:center; gap:8px; flex:1 1 260px; }
.sam-item-order-badge { background:#64748b; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; min-width:22px; text-align:center; }
.sam-item-first .sam-item-order-badge { background:#0284c7; }
.sam-item-icon { font-size:15px; }
.sam-item-input-wrap { display:flex; align-items:center; gap:6px; flex:1; max-width:320px; }
.sam-item-input { font-size:12.5px; padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; flex:1; box-sizing:border-box; }
.sam-item-id-tag { font-size:10px; color:#64748b; background:#e2e8f0; padding:1px 5px; border-radius:4px; font-family:monospace; }
.sam-item-first-star { font-size:10.5px; font-weight:700; color:#d97706; background:#fef3c7; border:1px solid #fde68a; padding:1px 6px; border-radius:10px; align-items:center; gap:3px; }
.sam-item-col-actions { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.sam-btn-to-top { background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important; color:#fff !important; font-size:11px !important; font-weight:700 !important; padding:3px 9px !important; border-radius:6px !important; border:none !important; cursor:pointer; }
.sam-btn-to-top:hover { filter:brightness(1.1); transform:translateY(-1px); }
.sam-btn-dept-top { background:linear-gradient(135deg, #0f172a 0%, #334155 100%) !important; color:#fff !important; font-size:11px !important; font-weight:700 !important; padding:3px 9px !important; border-radius:6px !important; border:none !important; cursor:pointer; }
.sam-btn-dept-top:hover { filter:brightness(1.15); transform:translateY(-1px); }
.sam-btn-move { background:#e2e8f0 !important; color:#1e293b !important; font-size:11px !important; padding:3px 7px !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; cursor:pointer; }
.sam-btn-move:hover { background:#cbd5e1 !important; }
.sam-btn-collapse { background:#e2e8f0 !important; color:#475569 !important; font-size:11px !important; padding:3px 7px !important; border-radius:6px !important; border:1px solid #cbd5e1 !important; }
.sam-pulse-highlight { animation:samPulse 0.8s ease; }
@keyframes samPulse {
  0% { background:#fef08a; transform:scale(1.02); }
  50% { background:#fef08a; transform:scale(1.01); }
  100% { transform:scale(1); }
}
@media (max-width:768px) {
  .sam-dept-header { flex-direction:column; align-items:stretch; }
  .sam-dept-info { width:100%; }
  .sam-dept-actions { width:100%; justify-content:space-between; }
  .sam-item-row { flex-direction:column; align-items:stretch; }
  .sam-item-col-main { width:100%; }
  .sam-item-col-actions { width:100%; justify-content:space-between; }
  .sam-btn-to-top { flex:1; text-align:center; }
}
`;
        document.head.appendChild(styleEl);
    }

    // Master registered list of all departments
    App.getBaseDepartments = function () {
        var isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        if (!this._masterDepartments || this._masterDepartments.length === 0) {
            var src = (this.departments || []).filter(function (d) {
                if (!isOwnerPortal && (d.id === 'system_owner' || d.id === 'sovereign_core' || d.id === 'sovereign_server' || d.ownerOnly)) return false;
                return true;
            });
            this._masterDepartments = JSON.parse(JSON.stringify(src));
        } else if (Array.isArray(this.departments)) {
            this.departments.forEach(function (dept) {
                if (!isOwnerPortal && (dept.id === 'system_owner' || dept.id === 'sovereign_core' || dept.id === 'sovereign_server' || dept.ownerOnly)) return;
                var mDept = App._masterDepartments.find(function (d) { return d.id === dept.id; });
                if (!mDept) {
                    mDept = { id: dept.id, name: dept.name, icon: dept.icon, items: [] };
                    App._masterDepartments.push(mDept);
                }
                if (Array.isArray(dept.items)) {
                    dept.items.forEach(function (item) {
                        if (!isOwnerPortal && ['owner_portal_overview', 'owner_network_admins', 'owner_alerts', 'sstp_vpn', 'system_settings', 'network_subscriptions'].includes(item.id)) return;
                        if (!mDept.items.find(function (i) { return i.id === item.id; })) {
                            mDept.items.push(JSON.parse(JSON.stringify(item)));
                        }
                    });
                }
            });
        }
        return this._masterDepartments.filter(function (d) {
            if (!isOwnerPortal && (d.id === 'system_owner' || d.id === 'sovereign_core' || d.id === 'sovereign_server' || d.ownerOnly)) return false;
            return true;
        });
    };

    var oldHasAccessForUi = App.hasAccess;
    App.hasAccess = function (tab) {
        if (tab === 'ui_customizer' || tab === 'hotspot_designer') return true;
        return oldHasAccessForUi ? oldHasAccessForUi.call(this, tab) : true;
    };

    App.getConfiguredDepartments = function () {
        var isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        if (isOwnerPortal) {
            return [
                {
                    id: 'sovereign_core',
                    name: 'القيادة وشبكات العملاء',
                    icon: '👑',
                    color: '#d97706',
                    items: [
                        { id: 'owner_portal_overview', name: 'لوحة القيادة السيادية (Sovereign Hub)', icon: '👑' },
                        { id: 'owner_clients_networks', name: 'إدارة شبكات العملاء (Clients Hub)', icon: '🏢' },
                        { id: 'network_subscriptions', name: 'باقات واشتراكات العملاء', icon: '💎' },
                        { id: 'owner_network_admins', name: 'إدارة مدراء وتفويض الشبكات', icon: '👥' },
                        { id: 'owner_master_finance', name: 'المركز المالي الشامل للمنظومة', icon: '💰' }
                    ]
                },
                {
                    id: 'sovereign_server',
                    name: 'إدارة السيرفر والمنظومة الشاملة',
                    icon: '🛡️',
                    color: '#0f172a',
                    items: [
                        { id: 'owner_firewall', name: 'جدار الحماية والأمان السيادي', icon: '🛡️' },
                        { id: 'system_settings', name: 'التحكم بالسيرفر والخدمات', icon: '🖥️' },
                        { id: 'owner_diagnostics', name: 'الفحص التشخيصي وصحة النظام', icon: '🩺' },
                        { id: 'owner_logs', name: 'سجلات النظام والأخطاء', icon: '📋' },
                        { id: 'owner_broadcast', name: 'التنبيهات والبث العام للعملاء', icon: '📢' }
                    ]
                },
                {
                    id: 'sovereign_channels',
                    name: 'قنوات المالك السيادية',
                    icon: '📡',
                    color: '#16a34a',
                    items: [
                        { id: 'owner_whatsapp', name: 'واتساب مالك المنظومة (Sovereign WA)', icon: '📱' },
                        { id: 'owner_telegram', name: 'بوت تلغرام مالك المنظومة', icon: '✈️' }
                    ]
                }
            ];
        }

        var ui = this.uiSettings || {};
        var labels = ui.module_labels || {};
        var layout = ui.sidebar_layout || {};
        var sections = Array.isArray(layout.sections) ? layout.sections : [];
        var map = {};
        sections.forEach(function (s) { map[s.id] = s; });

        var base = this.getBaseDepartments();
        var self = this;
        var sovereignTabIds = ['owner_portal_overview', 'owner_network_admins', 'owner_alerts', 'sstp_vpn', 'owner_firewall', 'system_settings', 'network_subscriptions'];

        return base.filter(function (dept) {
            if (dept.id === 'system_owner' || dept.id === 'sovereign_core' || dept.id === 'sovereign_server' || dept.ownerOnly) return false;
            return true;
        }).map(function (dept, di) {
            var conf = map[dept.id] || {};
            var itemsMap = {};
            (conf.items || []).forEach(function (i) { itemsMap[i.id] = i; });
            var cloned = JSON.parse(JSON.stringify(dept));
            var rawDeptName = labels['dept:' + dept.id] || conf.label || dept.name;
            cloned.name = self.cleanTitle ? self.cleanTitle(rawDeptName, dept.icon) : rawDeptName;
            cloned.order = conf.order != null ? Number(conf.order) : di;
            cloned.hidden = conf.visible === false;
            cloned.items = (cloned.items || []).filter(function (item) {
                if (sovereignTabIds.includes(item.id)) return false;
                return true;
            }).map(function (item, ii) {
                var itemConf = itemsMap[item.id] || {};
                var rawItemName = labels['tab:' + item.id] || itemConf.label || item.name;
                item.name = self.cleanTitle ? self.cleanTitle(rawItemName, item.icon) : rawItemName;
                item.order = itemConf.order != null ? Number(itemConf.order) : ii;
                item.hidden = itemConf.visible === false;
                return item;
            }).filter(function (item) { return !item.hidden; }).sort(byOrder);
            return cloned;
        }).filter(function (dept) { return !dept.hidden && dept.items && dept.items.length > 0; }).sort(byOrder);
    };

    App.applyThemePalette = function () {
        var ui = this.uiSettings || {};
        var p = ui.theme_palette || {};
        var root = document.documentElement;
        var map = {
            primary: '--accent-blue',
            header: '--bg-header',
            sidebar: '--bg-sidebar',
            sidebar_active: '--sidebar-active',
            success: '--accent-green',
            danger: '--accent-red'
        };
        Object.keys(map).forEach(function (key) {
            if (/^#[0-9a-fA-F]{6}$/.test(String(p[key] || ''))) root.style.setProperty(map[key], p[key]);
        });
        document.body.classList.remove('sam-density-compact', 'sam-density-comfortable');
        if (ui.layout_density === 'compact') document.body.classList.add('sam-density-compact');
        if (ui.layout_density === 'comfortable') document.body.classList.add('sam-density-comfortable');
    };

    App.applyConfiguredBrand = function () {
        var isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        var ui = this.uiSettings || {};
        var full = document.querySelector('.brand-title-full');
        var short = document.querySelector('.brand-title-short');
        
        var nav = document.getElementById('mt-mobile-nav');
        if (nav) {
            var items = [];
            if (isOwnerPortal) {
                items = [
                    { tab: 'owner_portal_overview', title: 'السيادية', icon: '👑' },
                    { tab: 'network_subscriptions', title: 'الشبكات', icon: '💎' },
                    { tab: 'owner_network_admins', title: 'المدراء', icon: '👥' },
                    { tab: 'routers', title: 'الراوترات', icon: '📡' },
                    { tab: 'active_sessions', title: 'الجلسات', icon: '⚡' },
                    { tab: 'system_settings', title: 'السيرفر', icon: '🛡️' },
                    { tab: 'owner_alerts', title: 'التنبيهات', icon: '🔔' },
                    { tab: 'admins_roles', title: 'الصلاحيات', icon: '🔐' },
                    { tab: 'notifications_logs', title: 'السجلات', icon: '📋' }
                ];
            } else {
                // Complete list of ALL main system departments for tenant users / admins
                var defaultItems = [
                    { tab: 'dashboard', title: 'الرئيسية', icon: '📊' },
                    { tab: 'users', title: 'الكروت', icon: '👥' },
                    { tab: 'sales', title: 'المبيعات', icon: '💳' },
                    { tab: 'cashbox_accounts', title: 'المالية', icon: '💰' },
                    { tab: 'operating_expenses', title: 'المصروفات التشغيلية', icon: '💸' },
                    { tab: 'chart_of_accounts', title: 'الحسابات', icon: '📑' },
                    { tab: 'reports_center', title: 'التقارير', icon: '📈' },
                    { tab: 'admins_agents', title: 'المستخدمين', icon: '👥' },
                    { tab: 'whatsapp_manager', title: 'الواتساب', icon: '💬' },
                    { tab: 'card_warehouses', title: 'المخازن', icon: '🏬' },
                    { tab: 'routers', title: 'الراوترات', icon: '📡' },
                    { tab: 'active_sessions', title: 'الجلسات', icon: '⚡' },
                    { tab: 'assets_inventory', title: 'الأصول', icon: '📦' },
                    { tab: 'hotspot_designer', title: 'الهوتسبوت', icon: '🎨' }
                ];

                if (Array.isArray(ui.mobile_bottom_nav) && ui.mobile_bottom_nav.length > 0) {
                    var mappedNav = ui.mobile_bottom_nav.map(function(x) {
                        if (x.tab === 'finance_accounting' || x.tab === 'cashbox' || x.tab === 'finance') return { tab: 'cashbox_accounts', title: 'المالية', icon: '💰' };
                        if (x.tab === 'networks_partnerships' || x.tab === 'partners_equity' || x.tab === 'partners') return { tab: 'operating_expenses', title: 'المصروفات التشغيلية', icon: '💸' };
                        if (x.tab === 'templates_designer' || x.tab === 'templates') return { tab: 'reports_center', title: 'التقارير', icon: '📈' };
                        if (x.tab === 'chart_of_accounts') return { tab: 'chart_of_accounts', title: 'الحسابات', icon: '📑' };
                        if (x.tab === 'admins_roles' || x.tab === 'admins') return { tab: 'admins_agents', title: 'المستخدمين', icon: '👥' };
                        if (x.tab === 'system_settings' || x.tab === 'settings' || x.tab === 'notifications_logs' || x.tab === 'notifications') return { tab: 'whatsapp_manager', title: 'الواتساب', icon: '💬' };
                        if (x.tab === 'users' || x.tab === 'cards') return { tab: 'users', title: 'الكروت', icon: '👥' };
                        if (x.tab === 'sales') return { tab: 'sales', title: 'المبيعات', icon: '💳' };
                        return x;
                    });
                    var configuredTabs = new Set(mappedNav.map(function(x) { return x.tab; }));
                    items = mappedNav.concat(defaultItems.filter(function(d) { return !configuredTabs.has(d.tab); }));
                } else {
                    items = defaultItems;
                }
            }

            var allowed = items.filter(function (item) { 
                return typeof App.hasAccess === 'function' ? App.hasAccess(item.tab) : true; 
            });

            if (allowed.length) {
                nav.innerHTML = allowed.map(function (item) {
                    var titleClean = App.cleanTitle ? App.cleanTitle(item.title || item.tab, item.icon) : (item.title || item.tab);
                    var isAct = App.currentTab === item.tab ? ' active' : '';
                    return '<button type="button" class="mt-mobile-nav-btn' + isAct + '" id="mob-nav-' + esc(item.tab) + '" onclick="App.switchTab(\'' + esc(item.tab) + '\')"><span class="icon">' + esc(item.icon || '📊') + '</span><span>' + esc(titleClean) + '</span></button>';
                }).join('');

                // Auto-scroll active item into view
                setTimeout(function() {
                    var act = nav.querySelector('.mt-mobile-nav-btn.active');
                    if (act && typeof act.scrollIntoView === 'function') {
                        act.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                }, 80);
            }
        }
    };

    var originalShowMainApp = App.showMainApp;
    App.showMainApp = function () {
        var self = this;
        if (!this.uiSettings && !this.__samUiLoading) {
            originalShowMainApp.call(this);
            this.__samUiLoading = true;
            this.loadUISettings(true).catch(function (err) {
                console.error('تعذر تحميل إعدادات الواجهة؛ سيتم استخدام الإعدادات الافتراضية:', err);
                App.toast?.('تعذر تحميل إعدادات الواجهة؛ تم استخدام الإعدادات الافتراضية.', 'warning');
            }).finally(function () {
                self.__samUiLoading = false;
                self.showMainApp();
                const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
                self.switchTab(self.currentTab || (isOwnerPortal ? 'owner_portal_overview' : 'dashboard'));
            });
            return;
        }
        var previous = this.departments;
        this.departments = this.getConfiguredDepartments();
        originalShowMainApp.call(this);
        this.departments = previous;
        this.applyThemePalette();
        this.applyConfiguredBrand();
        if (window.SamTableManager && typeof window.SamTableManager.enhanceAllTables === 'function') {
            setTimeout(function () { window.SamTableManager.enhanceAllTables(); }, 150);
        }
    };

    App.updateBreadcrumb = function (tab) {
        if (tab === 'wallet_sales') tab = 'instant_balance';
        var departments = this.getConfiguredDepartments();
        for (var d = 0; d < departments.length; d++) {
            var dept = departments[d];
            var found = (dept.items || []).find(function (it) { return it.id === tab; });
            if (!found) continue;
            var deptEl = document.getElementById('bc-dept-name');
            var tabEl = document.getElementById('bc-tab-name');
            var dClean = this.cleanTitle ? this.cleanTitle(dept.name, dept.icon) : dept.name;
            var fClean = this.cleanTitle ? this.cleanTitle(found.name, found.icon) : found.name;
            if (deptEl) deptEl.innerHTML = (dept.icon || '📁') + ' ' + esc(dClean);
            if (tabEl) tabEl.innerHTML = (found.icon || '📄') + ' ' + esc(fClean);
            var holder = document.getElementById('dept-' + dept.id);
            if (holder && holder.classList.contains('collapsed')) holder.classList.remove('collapsed');
            if (window.SamTableManager && typeof window.SamTableManager.enhanceAllTables === 'function') {
                setTimeout(function () { window.SamTableManager.enhanceAllTables(); }, 120);
            }
            return;
        }
    };

    App.getStudioSections = function () {
        var ui = this.uiSettings || {};
        var layout = ui.sidebar_layout || {};
        var saved = {};
        (layout.sections || []).forEach(function (s) { saved[s.id] = s; });
        var base = this.getBaseDepartments();
        return base.map(function (dept, di) {
            var s = saved[dept.id] || {};
            var children = {};
            (s.items || []).forEach(function (i) { children[i.id] = i; });
            return {
                id: dept.id,
                icon: dept.icon || '📁',
                label: (ui.module_labels || {})['dept:' + dept.id] || s.label || dept.name,
                visible: s.visible !== false,
                order: s.order != null ? Number(s.order) : di,
                items: (dept.items || []).map(function (item, ii) {
                    var x = children[item.id] || {};
                    return {
                        id: item.id,
                        icon: item.icon || '📄',
                        label: (ui.module_labels || {})['tab:' + item.id] || x.label || item.name,
                        visible: x.visible !== false,
                        order: x.order != null ? Number(x.order) : ii
                    };
                }).filter(function (it) { return App.hasAccess(it.id); }).sort(byOrder)
            };
        }).filter(function (sec) { return sec.items.length > 0; }).sort(byOrder);
    };

    App.moveStudioDeptToTop = function (deptId) {
        var container = document.getElementById('sam-studio-sections-list');
        var card = document.getElementById('sam-dept-card-' + deptId);
        if (!container || !card) return;
        container.insertBefore(card, container.firstElementChild);
        this.reindexStudioOrders();
        card.classList.add('sam-pulse-highlight');
        setTimeout(function () { card.classList.remove('sam-pulse-highlight'); }, 800);
    };

    App.moveStudioDept = function (deptId, direction) {
        var container = document.getElementById('sam-studio-sections-list');
        var card = document.getElementById('sam-dept-card-' + deptId);
        if (!container || !card) return;
        if (direction < 0) {
            var prev = card.previousElementSibling;
            if (prev) container.insertBefore(card, prev);
        } else {
            var next = card.nextElementSibling;
            if (next) container.insertBefore(next, card);
        }
        this.reindexStudioOrders();
    };

    App.moveStudioItemToTop = function (deptId, itemId) {
        var list = document.getElementById('sam-dept-items-' + deptId);
        var row = document.getElementById('sam-item-row-' + itemId);
        if (!list || !row) return;
        list.insertBefore(row, list.firstElementChild);
        this.reindexStudioOrders();
        row.classList.add('sam-pulse-highlight');
        setTimeout(function () { row.classList.remove('sam-pulse-highlight'); }, 800);
    };

    App.moveStudioItem = function (deptId, itemId, direction) {
        var list = document.getElementById('sam-dept-items-' + deptId);
        var row = document.getElementById('sam-item-row-' + itemId);
        if (!list || !row) return;
        if (direction < 0) {
            var prev = row.previousElementSibling;
            if (prev) list.insertBefore(row, prev);
        } else {
            var next = row.nextElementSibling;
            if (next) list.insertBefore(next, row);
        }
        this.reindexStudioOrders();
    };

    App.toggleStudioDeptCollapse = function (deptId) {
        var card = document.getElementById('sam-dept-card-' + deptId);
        if (card) card.classList.toggle('sam-dept-collapsed');
    };

    App.toggleAllStudioDepts = function (expand) {
        document.querySelectorAll('.sam-dept-card').forEach(function (card) {
            card.classList.toggle('sam-dept-collapsed', !expand);
        });
    };

    App.filterStudioItems = function (query) {
        query = (query || '').toLowerCase().trim();
        document.querySelectorAll('.sam-dept-card').forEach(function (card) {
            var deptMatch = (card.getAttribute('data-search') || '').toLowerCase().indexOf(query) !== -1;
            var itemMatches = 0;
            card.querySelectorAll('.sam-item-row').forEach(function (row) {
                var rowMatch = !query || (row.getAttribute('data-search') || '').toLowerCase().indexOf(query) !== -1;
                row.style.display = rowMatch ? '' : 'none';
                if (rowMatch) itemMatches++;
            });
            card.style.display = (!query || deptMatch || itemMatches > 0) ? '' : 'none';
            if (query && itemMatches > 0) card.classList.remove('sam-dept-collapsed');
        });
    };

    App.reindexStudioOrders = function () {
        document.querySelectorAll('.sam-dept-card').forEach(function (card, dIdx) {
            var dOrderInput = card.querySelector('[data-sam-order^="dept:"]');
            var dBadge = card.querySelector('.sam-dept-order-badge');
            if (dOrderInput) dOrderInput.value = dIdx + 1;
            if (dBadge) dBadge.textContent = '#' + (dIdx + 1);

            card.querySelectorAll('.sam-item-row').forEach(function (row, iIdx) {
                var iOrderInput = row.querySelector('[data-sam-order^="tab:"]');
                var iBadge = row.querySelector('.sam-item-order-badge');
                var iStar = row.querySelector('.sam-item-first-star');
                if (iOrderInput) iOrderInput.value = iIdx + 1;
                if (iBadge) iBadge.textContent = '#' + (iIdx + 1);
                if (iStar) {
                    iStar.style.display = (iIdx === 0) ? 'inline-flex' : 'none';
                }
                if (iIdx === 0) {
                    row.classList.add('sam-item-first');
                } else {
                    row.classList.remove('sam-item-first');
                }
            });
        });
    };

    App.renderNavigationStudio = function () {
        var host = document.getElementById('sam-navigation-studio');
        if (!host) return;
        var sections = this.getStudioSections();
        var palette = (this.uiSettings || {}).theme_palette || {};
        var isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');

        var sectionCards = sections.map(function (s, sIdx) {
            var itemRows = s.items.map(function (it, iIdx) {
                var isFirst = (iIdx === 0);
                return '<div class="sam-item-row ' + (isFirst ? 'sam-item-first' : '') + '" id="sam-item-row-' + esc(it.id) + '" data-item-id="' + esc(it.id) + '" data-parent-dept="' + esc(s.id) + '" data-search="' + esc((it.label + ' ' + it.id).toLowerCase()) + '">' +
                    '<div class="sam-item-col-main">' +
                        '<span class="sam-item-order-badge">#' + (iIdx + 1) + '</span>' +
                        '<span class="sam-item-icon">' + esc(it.icon) + '</span>' +
                        '<div class="sam-item-input-wrap">' +
                            '<input class="mt-input sam-item-input" data-sam-label="tab:' + esc(it.id) + '" value="' + esc(it.label) + '" placeholder="' + esc(it.label) + '" title="تعديل اسم القائمة/العملية" />' +
                            '<span class="sam-item-id-tag">' + esc(it.id) + '</span>' +
                        '</div>' +
                        '<span class="sam-item-first-star" title="هذه العملية في مقدمة القسم" style="display:' + (isFirst ? 'inline-flex' : 'none') + ';">⭐ في المقدمة</span>' +
                    '</div>' +
                    '<div class="sam-item-col-actions">' +
                        '<button type="button" class="mt-btn sam-btn-to-top" onclick="App.moveStudioItemToTop(\'' + esc(s.id) + '\', \'' + esc(it.id) + '\')" title="نقل هذه العملية إلى المقدمة مباشرة (الأولى في القسم)">🔝 إلى المقدمة</button>' +
                        '<button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioItem(\'' + esc(s.id) + '\', \'' + esc(it.id) + '\', -1)" title="تحريك لأعلى">⬆️</button>' +
                        '<button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioItem(\'' + esc(s.id) + '\', \'' + esc(it.id) + '\', 1)" title="تحريك لأسفل">⬇️</button>' +
                        '<input type="hidden" data-sam-order="tab:' + esc(it.id) + '" value="' + (iIdx + 1) + '" />' +
                        '<label class="sam-switch" title="إظهار أو إخفاء من القائمة"><input type="checkbox" data-sam-visible="tab:' + esc(it.id) + '" ' + (it.visible ? 'checked' : '') + '><span>ظاهر</span></label>' +
                    '</div>' +
                '</div>';
            }).join('');

            return '<div class="sam-dept-card" id="sam-dept-card-' + esc(s.id) + '" data-dept-id="' + esc(s.id) + '" data-search="' + esc((s.label + ' ' + s.id).toLowerCase()) + '">' +
                '<div class="sam-dept-header">' +
                    '<div class="sam-dept-info">' +
                        '<span class="sam-dept-order-badge">#' + (sIdx + 1) + '</span>' +
                        '<span class="sam-dept-icon">' + esc(s.icon) + '</span>' +
                        '<div class="sam-dept-title-wrap">' +
                            '<input class="mt-input sam-dept-input" data-sam-label="dept:' + esc(s.id) + '" value="' + esc(s.label) + '" placeholder="' + esc(s.label) + '" title="تعديل اسم القسم" />' +
                            '<span class="sam-dept-count-badge">' + s.items.length + ' عملية</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sam-dept-actions">' +
                        '<button type="button" class="mt-btn sam-btn-dept-top" onclick="App.moveStudioDeptToTop(\'' + esc(s.id) + '\')" title="نقل هذا القسم بالكامل إلى أعلى القائمة الجانبية">🔝 القسم إلى المقدمة</button>' +
                        '<button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioDept(\'' + esc(s.id) + '\', -1)" title="تحريك القسم لأعلى">⬆️</button>' +
                        '<button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioDept(\'' + esc(s.id) + '\', 1)" title="تحريك القسم لأسفل">⬇️</button>' +
                        '<input type="hidden" data-sam-order="dept:' + esc(s.id) + '" value="' + (sIdx + 1) + '" />' +
                        '<label class="sam-switch" title="إظهار أو إخفاء القسم"><input type="checkbox" data-sam-visible="dept:' + esc(s.id) + '" ' + (s.visible ? 'checked' : '') + '><span>ظاهر</span></label>' +
                        '<button type="button" class="mt-btn sam-btn-collapse" onclick="App.toggleStudioDeptCollapse(\'' + esc(s.id) + '\')" title="طي / توسيع"><span class="sam-dept-chevron">▼</span></button>' +
                    '</div>' +
                '</div>' +
                '<div class="sam-dept-items-list" id="sam-dept-items-' + esc(s.id) + '">' + itemRows + '</div>' +
            '</div>';
        }).join('');

        var globalBanner = isSuperAdmin ?
            '<div class="sam-global-notice">' +
                '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:20px;">👑</span><div><b>الواجهات العامة والافتراضية للنظام:</b> يمكنك حفظ هذا الترتيب لحسابك أو تعميمه كقالب افتراضي عام لكافة المشرفين والمستخدمين الجدد.</div></div>' +
                '<label style="display:flex; align-items:center; gap:8px; font-weight:bold; cursor:pointer; color:#15803d; background:#fff; padding:6px 12px; border-radius:6px; border:1px solid #86efac;">' +
                    '<input type="checkbox" id="cust-save-as-global-nav" onchange="var g = document.getElementById(\'cust-save-as-global\'); if(g) g.checked = this.checked;" />' +
                    '<span>🌐 تعميم كإعداد افتراضي عام للنظام</span>' +
                '</label>' +
            '</div>' : '';

        host.innerHTML =
            '<div class="sam-customizer-card sam-nav-studio-card">' +
                '<div class="sam-customizer-card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">' +
                    '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:20px;">🧭</span><div><div style="font-weight:800; font-size:15px; color:#0f172a;">استوديو ترتيب وتخصيص القوائم والأقسام</div><div style="font-size:12px; color:var(--text-muted); font-weight:normal;">رتب الأقسام والعمليات الأكثر استخداماً (مثل كروت النت، الشحن الفوري، المصروفات، المبيعات) لتظهر أولاً في القائمة الجانبية عبر زر <b>🔝 إلى المقدمة</b>.</div></div></div>' +
                    '<div style="display:flex; gap:8px; align-items:center;"><button type="button" class="mt-btn" onclick="App.toggleAllStudioDepts(true)" style="font-size:11px; padding:4px 8px;">➕ فتح الكل</button><button type="button" class="mt-btn" onclick="App.toggleAllStudioDepts(false)" style="font-size:11px; padding:4px 8px;">➖ طي الكل</button><button type="button" class="mt-btn mt-btn-success" onclick="App.saveCustomizerSettings()" style="font-size:12px; font-weight:bold; padding:5px 14px;">💾 حفظ وتطبيق التعديلات ✓</button></div>' +
                '</div>' +
                globalBanner +
                '<div class="sam-studio-search-bar"><input type="text" class="mt-input" placeholder="🔎 بحث وتصفية في القوائم والعمليات..." oninput="App.filterStudioItems(this.value)" /></div>' +
                '<div id="sam-studio-sections-list" class="sam-studio-sections-list">' + sectionCards + '</div>' +
            '</div>' +
            '<div class="sam-customizer-card">' +
                '<div class="sam-customizer-card-title">🎨 الهوية والألوان وكثافة العرض</div>' +
                '<div class="sam-brand-grid">' +
                    '<label>اللون الرئيسي<input type="color" data-sam-color="primary" value="' + esc(palette.primary || '#0078d7') + '"></label>' +
                    '<label>لون الترويسة<input type="color" data-sam-color="header" value="' + esc(palette.header || '#1c2b39') + '"></label>' +
                    '<label>لون القائمة<input type="color" data-sam-color="sidebar" value="' + esc(palette.sidebar || '#22313f') + '"></label>' +
                    '<label>لون التحديد<input type="color" data-sam-color="sidebar_active" value="' + esc(palette.sidebar_active || '#0078d7') + '"></label>' +
                    '<label>لون النجاح<input type="color" data-sam-color="success" value="' + esc(palette.success || '#10b981') + '"></label>' +
                    '<label>لون التنبيه<input type="color" data-sam-color="danger" value="' + esc(palette.danger || '#ef4444') + '"></label>' +
                    '<label>كثافة الواجهة<select class="mt-select" id="sam-layout-density"><option value="compact">مضغوطة</option><option value="normal">متوازنة</option><option value="comfortable">مريحة</option></select></label>' +
                '</div>' +
                '<p class="sam-customizer-help" style="margin-top:10px;">تطبق الألوان والسمات على النظام كله، والنوافذ والجداول تتكيف تلقائيًا مع أبعاد الشاشة والهواتف.</p>' +
            '</div>';

        var density = document.getElementById('sam-layout-density');
        if (density) density.value = (this.uiSettings || {}).layout_density || 'normal';
    };

    App.readStudioSettings = function () {
        var labels = {}, palette = {};
        document.querySelectorAll('[data-sam-label]').forEach(function (el) {
            var key = el.getAttribute('data-sam-label');
            labels[key] = el.value.trim();
        });
        document.querySelectorAll('[data-sam-color]').forEach(function (el) {
            palette[el.getAttribute('data-sam-color')] = el.value;
        });

        var sections = [];
        document.querySelectorAll('#sam-studio-sections-list .sam-dept-card').forEach(function (card, dIdx) {
            var deptId = card.getAttribute('data-dept-id');
            var dVis = card.querySelector('[data-sam-visible="dept:' + deptId + '"]');
            var dLabel = labels['dept:' + deptId] || '';
            var isVisible = dVis ? dVis.checked : true;

            var items = [];
            card.querySelectorAll('.sam-item-row').forEach(function (row, iIdx) {
                var itemId = row.getAttribute('data-item-id');
                var iVis = row.querySelector('[data-sam-visible="tab:' + itemId + '"]');
                var iLabel = labels['tab:' + itemId] || '';
                items.push({
                    id: itemId,
                    label: iLabel,
                    order: iIdx,
                    visible: iVis ? iVis.checked : true
                });
            });

            sections.push({
                id: deptId,
                label: dLabel,
                order: dIdx,
                visible: isVisible,
                items: items
            });
        });

        var globalNavChk = document.getElementById('cust-save-as-global-nav');
        var globalChk = document.getElementById('cust-save-as-global');
        var isGlobal = (globalNavChk && globalNavChk.checked) || (globalChk && globalChk.checked) || false;

        var result = {
            layout_density: (document.getElementById('sam-layout-density') || {}).value || (this.uiSettings?.layout_density || 'normal'),
            save_as_system_default: isGlobal
        };
        if (Object.keys(labels).length > 0) result.module_labels = labels;
        else if (this.uiSettings?.module_labels) result.module_labels = this.uiSettings.module_labels;

        if (sections.length > 0) result.sidebar_layout = { sections: sections };
        else if (this.uiSettings?.sidebar_layout) result.sidebar_layout = this.uiSettings.sidebar_layout;

        if (Object.keys(palette).length > 0) result.theme_palette = palette;
        else if (this.uiSettings?.theme_palette) result.theme_palette = this.uiSettings.theme_palette;

        return result;
    };

    var originalCustomizer = App.renderUICustomizer;
    App.renderUICustomizer = async function () {
        await originalCustomizer.call(this);
        var wrapper = document.querySelector('#main-view .max-w-6xl') || document.querySelector('#main-view > div:last-child') || document.querySelector('#main-view');
        if (!wrapper || document.getElementById('sam-navigation-studio')) return;
        var studio = document.createElement('div');
        studio.id = 'sam-navigation-studio';
        var submit = wrapper.lastElementChild;
        if (submit && submit.querySelector('button[onclick*="saveCustomizerSettings"]')) {
            wrapper.insertBefore(studio, submit);
        } else {
            wrapper.appendChild(studio);
        }
        this.renderNavigationStudio();

        if (this.userRole !== 'system_owner' && this.userRole !== 'superadmin') {
            document.querySelectorAll('#bottom-nav-slot-0,#bottom-nav-slot-1,#bottom-nav-slot-2,#bottom-nav-slot-3,#bottom-nav-slot-4').forEach(function (select) {
                Array.from(select.options).forEach(function (option) {
                    if (!App.hasAccess((option.value || '').split('|')[0])) option.remove();
                });
            });
            document.querySelectorAll('.customizer-box').forEach(function (box) {
                var text = (box.textContent || '');
                if (text.indexOf('تخصيص الترويسة والشريط العلوي') !== -1) box.style.display = 'none';
            });
        }
    };

    var originalSave = App.saveCustomizerSettings;
    App.saveCustomizerSettings = async function () {
        var extras = this.readStudioSettings();
        var originalApi = this.api;
        this.api = async function (action, params, method, body) {
            if (action === 'save_ui_settings') {
                if (body && typeof body === 'object') Object.assign(body, extras);
                else if (params && typeof params === 'object') Object.assign(params, extras);
            }
            return originalApi.call(this, action, params, method, body);
        };
        try {
            var res = await originalSave.call(this);
            this.uiSettings = Object.assign({}, this.uiSettings || {}, extras);
            this.applyThemePalette();
            this.applyConfiguredBrand();
            this.departments = this.getConfiguredDepartments();
            if (typeof this.renderSidebar === 'function') this.renderSidebar();
            if (typeof this.renderMobileBottomNav === 'function') this.renderMobileBottomNav();
            return res;
        } finally {
            this.api = originalApi;
        }
    };

    var originalLive = App.applyLiveUIUpdates;
    App.applyLiveUIUpdates = function () {
        originalLive.call(this);
        this.applyThemePalette();
        this.applyConfiguredBrand();
    };
})();


/* Mobile page shell: keep summary first, reveal actions and filters on demand. */
(function () {
    if (!window.App || window.__samMobileShellLoaded) return;
    window.__samMobileShellLoaded = true;

    App.toggleMobileToolbarPanel = function (toolbarId, panel) {
        var toolbar = document.getElementById(toolbarId);
        if (!toolbar) return;
        var actions = toolbar.querySelector('.sam-mobile-actions');
        var filters = toolbar.querySelector('.sam-mobile-filters');
        var target = panel === 'actions' ? actions : filters;
        var shouldOpen = target ? target.hidden : false;
        if (actions) actions.hidden = true;
        if (filters) filters.hidden = true;
        if (target) target.hidden = !shouldOpen;
        toolbar.querySelectorAll('[data-sam-panel]').forEach(function (button) {
            button.classList.toggle('active', button.getAttribute('data-sam-panel') === panel && shouldOpen);
        });
    };

    function nearestControlHolder(el, toolbar) {
        var holder = el.closest('.form-group, .filter-group, .input-group, .mt-toolbar-left, .mt-toolbar-right');
        return holder && holder !== toolbar ? holder : el;
    }

    App.organizeMobilePage = function () {
        if (window.innerWidth > 768) return;
        var main = document.getElementById('main-view');
        if (!main) return;

        /* Keep KPI cards first and preserve user's persistent show/hide preference. */
        main.querySelectorAll('.kpi-grid, .stats-grid, .summary-grid, .dashboard-kpi-grid, .sam-ui-kpis').forEach(function (grid, gridIndex) {
            var toolbar = grid.parentElement && grid.parentElement.querySelector ? grid.parentElement.querySelector('.mt-toolbar') : null;
            if (toolbar && toolbar.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_PRECEDING) {
                toolbar.parentElement.insertBefore(grid, toolbar);
            }
            if (grid.dataset.samStatsReady === '1') return;
            grid.dataset.samStatsReady = '1';
            grid.classList.add('sam-mobile-stats-collapsible');

            var currentTab = App.currentTab || 'default';
            var storageKey = 'sam_stats_expanded_' + currentTab;
            
            // Read stored state (per tab or global)
            var isStoredExpanded = false;
            try {
                var localVal = localStorage.getItem(storageKey);
                if (localVal !== null) {
                    isStoredExpanded = (localVal === 'true');
                } else {
                    var globalVal = localStorage.getItem('sam_stats_global_expanded');
                    if (globalVal !== null) {
                        isStoredExpanded = (globalVal === 'true');
                    }
                }
            } catch (e) {}

            grid.hidden = !isStoredExpanded;
            var statsId = grid.id || ('sam-mobile-stats-' + Date.now() + '-' + gridIndex);
            grid.id = statsId;
            var count = grid.querySelectorAll('.kpi-card, .stat-card, .summary-card, .sam-ui-kpi').length;

            // Remove any existing toggle button right before this grid to prevent duplicates
            var prevEl = grid.previousElementSibling;
            if (prevEl && prevEl.classList && prevEl.classList.contains('sam-mobile-stats-toggle')) {
                prevEl.remove();
            }

            var statsButton = document.createElement('button');
            statsButton.type = 'button';
            statsButton.className = 'sam-mobile-stats-toggle' + (isStoredExpanded ? ' active' : '');
            statsButton.innerHTML = isStoredExpanded ? '📊 إخفاء الإحصائيات' : ('📊 إظهار الإحصائيات <span>' + (count || '') + '</span>');
            
            statsButton.onclick = function () {
                var willOpen = grid.hidden; // if currently hidden, it will open
                grid.hidden = !willOpen;
                try {
                    localStorage.setItem(storageKey, willOpen ? 'true' : 'false');
                    localStorage.setItem('sam_stats_global_expanded', willOpen ? 'true' : 'false');
                } catch (e) {}
                statsButton.classList.toggle('active', willOpen);
                statsButton.innerHTML = willOpen ? '📊 إخفاء الإحصائيات' : ('📊 إظهار الإحصائيات <span>' + (count || '') + '</span>');
            };
            grid.parentElement.insertBefore(statsButton, grid);
        });

        main.querySelectorAll('.mt-toolbar').forEach(function (toolbar, index) {
            if (toolbar.dataset.samMobileReady === '1') return;
            var controls = Array.from(toolbar.querySelectorAll('button, .mt-btn, a.mt-btn')).filter(function (el) {
                return el.closest('.mt-toolbar') === toolbar && !el.classList.contains('sam-mobile-toggle-button');
            });
            var fields = Array.from(toolbar.querySelectorAll('input, select, textarea')).filter(function (el) {
                return el.closest('.mt-toolbar') === toolbar && el.type !== 'hidden';
            });
            if (!controls.length && !fields.length) return;

            toolbar.dataset.samMobileReady = '1';
            toolbar.id = toolbar.id || ('sam-mobile-toolbar-' + Date.now() + '-' + index);
            toolbar.classList.add('sam-mobile-toolbar');

            var switcher = document.createElement('div');
            switcher.className = 'sam-mobile-toolbar-switcher';
            switcher.innerHTML =
                '<button type="button" class="sam-mobile-toggle-button" data-sam-panel="actions" onclick="App.toggleMobileToolbarPanel(\'' + toolbar.id + '\',\'actions\')">⚡ العمليات <span>' + controls.length + '</span></button>' +
                '<button type="button" class="sam-mobile-toggle-button" data-sam-panel="filters" onclick="App.toggleMobileToolbarPanel(\'' + toolbar.id + '\',\'filters\')">🔎 بحث وتصفية <span>' + fields.length + '</span></button>';

            var actionBox = document.createElement('div');
            actionBox.className = 'sam-mobile-actions sam-mobile-collapsible';
            actionBox.hidden = true;
            var filterBox = document.createElement('div');
            filterBox.className = 'sam-mobile-filters sam-mobile-collapsible';
            filterBox.hidden = true;

            var moved = new Set();
            controls.forEach(function (control) {
                if (moved.has(control) || !control.isConnected) return;
                actionBox.appendChild(control);
                moved.add(control);
            });
            fields.forEach(function (field) {
                if (!field.isConnected) return;
                var holder = nearestControlHolder(field, toolbar);
                if (moved.has(holder) || !holder.isConnected) return;
                filterBox.appendChild(holder);
                moved.add(holder);
            });

            toolbar.insertBefore(switcher, toolbar.firstChild);
            toolbar.appendChild(actionBox);
            toolbar.appendChild(filterBox);

            Array.from(toolbar.children).forEach(function (child) {
                if (child === switcher || child === actionBox || child === filterBox) return;
                if (!child.querySelector('button, .mt-btn, input, select, textarea')) child.classList.add('sam-mobile-toolbar-context');
                if (!child.textContent.trim() && !child.children.length) child.remove();
            });
        });
    };

    var originalSwitchTabForMobileShell = App.switchTab;
    App.switchTab = function () {
        var out = originalSwitchTabForMobileShell.apply(this, arguments);
        [80, 450, 1100].forEach(function (delay) {
            window.setTimeout(function () { App.organizeMobilePage(); }, delay);
        });
        return out;
    };

    var originalShowForMobileShell = App.showMainApp;
    App.showMainApp = function () {
        var out = originalShowForMobileShell.call(this);
        window.setTimeout(function () { App.organizeMobilePage(); }, 120);
        return out;
    };
})();

/* Re-apply the mobile shell after any renderer replaces table, filters or grouping controls. */
(function () {
    if (!window.App || window.__samMobileObserverLoaded) return;
    window.__samMobileObserverLoaded = true;
    App.ensureMobileShellObserver = function () {
        var main = document.getElementById('main-view');
        if (!main || main.__samMobileObserver || typeof MutationObserver === 'undefined') return;
        var timer = null;
        var observer = new MutationObserver(function () {
            if (window.innerWidth > 768) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(function () { App.organizeMobilePage(); }, 80);
        });
        observer.observe(main, { childList: true, subtree: true });
        main.__samMobileObserver = observer;
    };
    var previousShowMainAppForObserver = App.showMainApp;
    App.showMainApp = function () {
        var out = previousShowMainAppForObserver.call(this);
        window.setTimeout(function () {
            App.ensureMobileShellObserver();
            App.organizeMobilePage();
        }, 160);
        return out;
    };
    App.ensureMobileShellObserver();
})();

/* Network inventory: present devices and registered nodes as independent pages. */
(function () {
    if (!window.App || window.__samNetworkTablePagesLoaded) return;
    window.__samNetworkTablePagesLoaded = true;

    App.setNetworkTablePage = function (page) {
        this.ndTablePage = page === 'nodes' ? 'nodes' : 'devices';
        var main = document.getElementById('main-view');
        if (main) this.installNetworkTablePages(main);
    };

    App.installNetworkTablePages = function (main) {
        if (!main || this.currentTab !== 'network_nodes') return;
        var devices = main.querySelector('#nd-main-content-view');
        if (!devices) return;
        var nodes = devices.nextElementSibling;
        if (!nodes || nodes.tagName !== 'SECTION') return;

        var page = this.ndTablePage || 'devices';
        var tabs = main.querySelector('#sam-network-table-pages');
        if (!tabs) {
            tabs = document.createElement('div');
            tabs.id = 'sam-network-table-pages';
            tabs.className = 'sam-network-table-pages';
            devices.parentElement.insertBefore(tabs, devices);
        }
        tabs.innerHTML =
            '<button class="sam-network-page-tab ' + (page === 'devices' ? 'active' : '') + '" onclick="App.setNetworkTablePage(\'devices\')">📋 الأجهزة والمعدات</button>' +
            '<button class="sam-network-page-tab ' + (page === 'nodes' ? 'active' : '') + '" onclick="App.setNetworkTablePage(\'nodes\')">🗼 النقاط الأساسية والفرعية</button>';

        devices.hidden = page !== 'devices';
        nodes.hidden = page !== 'nodes';
        devices.classList.add('sam-network-table-page');
        nodes.classList.add('sam-network-table-page');
    };

    var oldOrganizerForNetworkPages = App.organizeMobilePage;
    App.organizeMobilePage = function () {
        oldOrganizerForNetworkPages.call(this);
        this.installNetworkTablePages(document.getElementById('main-view'));
    };

    var oldNetworkSwitchForPages = App.switchTab;
    App.switchTab = function (tab) {
        var out = oldNetworkSwitchForPages.apply(this, arguments);
        if (tab === 'network_nodes') {
            window.setTimeout(function () { App.installNetworkTablePages(document.getElementById('main-view')); }, 700);
        }
        return out;
    };
})();

/* Sidebar accordion: only the department of the active page stays open. */
(function () {
    if (!window.App || window.__samSidebarAccordionLoaded) return;
    window.__samSidebarAccordionLoaded = true;

    App.openActiveNavigationDepartment = function (tab) {
        var activeItem = document.getElementById('nav-' + tab);
        var activeDepartment = activeItem ? activeItem.closest('.mt-nav-dept') : null;
        document.querySelectorAll('.mt-nav-dept').forEach(function (department) {
            department.classList.toggle('collapsed', department !== activeDepartment);
        });
    };

    var oldToggleDepartmentForAccordion = App.toggleDepartment;
    App.toggleDepartment = function (deptId) {
        var target = document.getElementById('dept-' + deptId);
        if (!target) return;
        var willOpen = target.classList.contains('collapsed');
        if (willOpen) {
            document.querySelectorAll('.mt-nav-dept').forEach(function (department) {
                department.classList.toggle('collapsed', department !== target);
            });
        } else {
            oldToggleDepartmentForAccordion.call(this, deptId);
        }
    };

    var oldSwitchTabForAccordion = App.switchTab;
    App.switchTab = function (tab) {
        var out = oldSwitchTabForAccordion.apply(this, arguments);
        window.setTimeout(function () { App.openActiveNavigationDepartment(tab); }, 0);
        return out;
    };

    var oldShowForAccordion = App.showMainApp;
    App.showMainApp = function () {
        var out = oldShowForAccordion.call(this);
        window.setTimeout(function () { App.openActiveNavigationDepartment(App.currentTab || 'dashboard'); }, 30);
        return out;
    };
})();

/* Complete shortcut action catalog & delegation. */
(function () {
    // Shortcuts catalog is now natively maintained and grouped in dashboard.js
})();
/* Integrated Reports & Print Center */
(function () {
    const labels = {
        group_label: 'التجميع', invoices: 'الفواتير', cards: 'الكروت', sales: 'إجمالي المبيعات', collected: 'النقد المحصل', wallet_settled: 'المسدد من المحفظة', balance: 'الرصد المتبقي',
        sold: 'مباع', used: 'مستخدم', active: 'نشط', value: 'القيمة', movements: 'الحركات', sheets: 'الأوراق',
        vouchers: 'السندات', receipts: 'القبض', payments: 'الصرف', net: 'الصافي', sessions: 'الجلسات', hours: 'الساعات', mb: 'الاستهلاك MB',
        assets: 'الأصول', purchase_cost: 'تكلفة الشراء', current_value: 'القيمة الحالية', in_service: 'في الخدمة', maintenance: 'تحت الصيانة', damaged: 'تالف', cards_used: 'الكروت المستخدمة', paid_cards: 'كروت مدفوعة', free_cards: 'كروت مجانية', total_mb: 'إجمالي الاستهلاك MB', paid_mb: 'استهلاك المدفوع MB', free_mb: 'استهلاك المجاني MB', allocated_sales: 'قيمة المبيعات المستهلكة', value_per_mb: 'القيمة لكل ميجابايت', share_percent: 'النسبة من الإجمالي %', rows: 'صفوف التقرير'
    };
    const formats = new Set(['sales','collected','balance','value','receipts','payments','net','purchase_cost','current_value','allocated_sales','value_per_mb','share_percent']);
    App.reportResult = null;
    App.renderReportsCenter = async function () {
        const profilesRes = await this.api('get_profiles');
        const profiles = Array.isArray(profilesRes) ? profilesRes : (profilesRes.profiles || []);
        const pOpts = profiles.map(p => `<option value="${this.escape(p.name || p.profile_name || '')}">${this.escape(p.name || p.profile_name || '')}</option>`).join('');
        const contentHtml = `
          <div class="mt-card" style="margin-bottom:14px"><div class="mt-card-header">🔎 إعداد التقرير</div><div class="mt-card-body"><div class="sam-report-grid">
            <div><label>نوع التقرير</label><select id="report-type" class="mt-select" onchange="App.reportUpdateGrouping()"><option value="sales">المبيعات</option><option value="cards">الكروت والمشتركين</option><option value="stock">المخزون والعهد</option><option value="finance">السندات والحركة المالية</option><option value="sessions">الجلسات والاستخدام</option><option value="topology">تحليل الشبكات والراوترات والنقاط</option><option value="assets">الأصول والمعدات</option><option value="topology_assets">أصول الشبكات والراوترات والنقاط</option></select></div>
            <div><label>التجميع حسب</label><select id="report-group" class="mt-select"></select></div>
            <div><label>من تاريخ</label><input id="report-from" type="date" class="mt-input" value="${new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10)}"></div>
            <div><label>إلى تاريخ</label><input id="report-to" type="date" class="mt-input" value="${new Date().toISOString().slice(0,10)}"></div>
            <div id="report-profile-wrap"><label>الباقة (اختياري)</label><select id="report-profile" class="mt-select"><option value="">كل الباقات</option>${pOpts}</select></div>
          </div><div class="mt-toolbar" style="margin-top:14px"><button class="mt-btn mt-btn-primary" onclick="App.runIntegratedReport()">📊 عرض التقرير</button><button class="mt-btn" onclick="App.printIntegratedReport()">🖨️ طباعة A4</button><button class="mt-btn mt-btn-success" onclick="App.exportIntegratedReportCSV()">📥 تصدير CSV</button><button class="mt-btn mt-btn-warning" onclick="App.exportIntegratedReportPDF()">📄 تصدير PDF</button></div></div></div>
          <div id="report-output" class="mt-card"><div class="mt-card-body" style="text-align:center;color:#64748b;padding:38px">اختر نوع التقرير وخيارات التجميع ثم اضغط «عرض التقرير».</div></div>`;

        const shellOpts = {
            id: 'reports-center',
            archetype: 'ledger',
            icon: '🖨️',
            title: 'مركز التقارير والطباعة',
            eyebrow: 'التقارير الموحدة والذكاء الإداري',
            subtitle: 'استعلام موحّد من بيانات المبيعات والكروت والمخزون والمالية والجلسات والأصول',
            actions: [
                { label: 'عرض التقرير', icon: '📊', variant: 'primary', onclick: 'App.runIntegratedReport()' },
                { label: 'طباعة A4', icon: '🖨️', variant: 'secondary', onclick: 'App.printIntegratedReport()' },
                { label: 'تصدير CSV', icon: '📥', variant: 'success', onclick: 'App.exportIntegratedReportCSV()' },
                { label: 'تصدير PDF', icon: '📄', variant: 'warning', onclick: 'App.exportIntegratedReportPDF()' }
            ],
            content: contentHtml
        };

        if (window.SamUI?.PageBuilder) {
            document.getElementById('main-view').innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            document.getElementById('main-view').innerHTML = `
              <div class="mt-page-header"><div><h2>🖨️ مركز التقارير والطباعة</h2><p>استعلام موحّد من بيانات المبيعات والكروت والمخزون والمالية والجلسات والأصول.</p></div></div>
              ${contentHtml}`;
        }
        this.reportUpdateGrouping();
    };
    App.reportUpdateGrouping = function () {
        const type = document.getElementById('report-type')?.value || 'sales';
        const opts = {
            sales:[['day','التاريخ'],['profile','الباقة'],['agent','المشتري / الوكيل'],['payment','طريقة الدفع']],
            cards:[['profile','الباقة'],['day','التاريخ'],['status','الحالة'],['agent','المالك / الوكيل']],
            stock:[['day','التاريخ'],['profile','الباقة'],['agent','المستلم'],['transfer','نوع الحركة']],
            finance:[['day','التاريخ'],['category','التصنيف'],['party','الجهة'],['voucher','نوع السند']],
            sessions:[['day','التاريخ'],['router','الراوتر'],['profile','الباقة']],
            topology:[['network','الشبكة'],['router','الراوتر'],['node','النقطة / المنفذ'],['agent','الموزع أو الوكيل']],
            assets:[['category','التصنيف'],['status','الحالة'],['location','الموقع']],
            topology_assets:[['network','الشبكة'],['router','الراوتر'],['node','النقطة'],['agent','المستخدم / المسؤول'],['category','التصنيف'],['status','الحالة']]
        }[type] || [];
        document.getElementById('report-group').innerHTML = opts.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('');
        document.getElementById('report-profile-wrap').style.display = ['sales','cards','stock','sessions','topology'].includes(type) ? '' : 'none';
    };
    App.runIntegratedReport = async function () {
        const payload = {type:document.getElementById('report-type').value, group_by:document.getElementById('report-group').value, from:document.getElementById('report-from').value, to:document.getElementById('report-to').value, profile:document.getElementById('report-profile').value};
        const out = document.getElementById('report-output'); out.innerHTML = '<div class="mt-card-body" style="text-align:center;padding:32px">⏳ جارٍ إعداد التقرير من قاعدة البيانات…</div>';
        try {
            const res = await this.api('get_integrated_report', {}, 'POST', payload);
            if (!res || res.success === false) throw new Error(res?.error || 'تعذر إعداد التقرير');
            this.reportResult = res;
            const headers = res.columns.map(c=>`<th>${this.escape(labels[c] || c)}</th>`).join('');
            const cell = (key,val) => formats.has(key) ? Number(val || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : this.escape(String(val ?? '0'));
            const body = res.rows.length ? res.rows.map(row=>`<tr>${res.columns.map(c=>`<td>${cell(c,row[c])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${res.columns.length}" style="text-align:center;padding:25px">لا توجد بيانات ضمن الفترة المحددة</td></tr>`;
            const totals = res.columns.filter(c=>c!=='group_label').map(c=>`<span class="sam-report-total"><b>${this.escape(labels[c]||c)}:</b> ${cell(c,res.totals[c])}</span>`).join('');
            const rankKey = ['topology','topology_assets'].includes(res.type) ? (res.type === 'topology' ? 'total_mb' : 'assets') : null;
            const ranked = rankKey ? [...res.rows].sort((a,b)=>Number(b[rankKey]||0)-Number(a[rankKey]||0)) : [];
            const rankHtml = ranked.length ? `<div class="sam-report-ranking"><div>🔝 <b>الأعلى:</b> ${this.escape(String(ranked[0].group_label||''))} — ${cell(rankKey,ranked[0][rankKey])}</div><div>🔻 <b>الأقل:</b> ${this.escape(String(ranked[ranked.length-1].group_label||''))} — ${cell(rankKey,ranked[ranked.length-1][rankKey])}</div></div>` : '';
            out.innerHTML = `<div id="integrated-report-print" class="mt-card-body"><div class="sam-report-heading"><div><h3>${this.escape(res.title)}</h3><small>من ${this.escape(res.from)} إلى ${this.escape(res.to)} · تم إنشاؤه ${new Date().toLocaleString('ar-YE')}</small></div><div class="sam-report-badge">${res.rows.length} صف</div></div>${rankHtml}<div class="sam-report-totals">${totals}</div><div class="mt-table-wrap"><table class="mt-table"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div></div>`;
        } catch (e) { out.innerHTML = `<div class="mt-card-body" style="color:#dc2626;padding:28px;text-align:center">تعذر إعداد التقرير: ${this.escape(e.message || '')}</div>`; }
    };
    App.printIntegratedReport = function () {
        if (!this.reportResult) return this.toast('اعرض التقرير أولاً', 'warning');
        const r=this.reportResult, headers=r.columns.map(c=>this.escape(labels[c]||c)), rows=(r.rows||[]).map(row=>`<tr>${r.columns.map(c=>`<td style="padding:6px;border:1px solid #cbd5e1">${formats.has(c)?Number(row[c]||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):this.escape(String(row[c]??''))}</td>`).join('')}</tr>`).join('');
        this.printUniversalReport(r.title, headers, rows, `الفترة: ${this.escape(r.from)} — ${this.escape(r.to)} | عدد صفوف التجميع: ${r.rows.length}`);
    };
    App.exportIntegratedReportCSV = function () {
        const r=this.reportResult; if(!r) return this.toast('اعرض التقرير أولاً','warning');
        const lines=[r.columns.map(c=>labels[c]||c), ...(r.rows||[]).map(row=>r.columns.map(c=>row[c]??''))];
        this.downloadCSV(lines, `report-${r.type}-${r.from}-${r.to}.csv`);
    };
    App.exportIntegratedReportPDF = function () {
        if(!this.reportResult) return this.toast('اعرض التقرير أولاً','warning');
        const node=document.getElementById('integrated-report-print'); if(!node || !window.html2pdf) return this.printIntegratedReport();
        window.html2pdf().set({margin:8,filename:`report-${this.reportResult.type}-${this.reportResult.from}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}}).from(node).save();
    };
})();

/* ==========================================================================
   SAM Wallet & Electronic Vouchers / Instant Balance (Archetype 2 / POS)
   ========================================================================== */
(function(){
    App._walletActiveTab = App._walletActiveTab || 'vouchers';

    App.renderWalletSales = async function() {
        const view = document.getElementById('main-view');
        if (!view) return;

        const PB = window.SamUI?.PageBuilder;

        const [walletRes, profilesRes, deliveryRes, instantRes, accountsRes] = await Promise.all([
            this.api('get_agent_wallet').catch(() => ({})),
            this.api('get_profiles').catch(() => []),
            this.api('get_paid_voucher_deliveries').catch(() => ({})),
            this.api('get_instant_balance_inventory').catch(() => ({})),
            this.api('get_sales_eligible_accounts').catch(() => ({}))
        ]);

        const w = walletRes?.wallet || {};
        const profiles = Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || []);
        const ds = deliveryRes?.deliveries || [];
        const r = instantRes || {};
        const ac = accountsRes?.accounts || [];

        const activeTab = App._walletActiveTab || 'vouchers';

        const actions = [
            { 
                label: '📲 كروت واتساب الإلكترونية', 
                variant: activeTab === 'vouchers' ? 'primary' : 'secondary', 
                onclick: "App._walletActiveTab='vouchers'; App.renderWalletSales();" 
            },
            { 
                label: '🔄 الرصيد الفوري والمخازن', 
                variant: activeTab === 'instant' ? 'primary' : 'secondary', 
                onclick: "App._walletActiveTab='instant'; App.renderWalletSales();" 
            },
            { 
                label: '🛒 نقطة البيع (POS)', 
                variant: 'secondary', 
                onclick: "App.switchTab('pos');" 
            },
            { 
                label: '🏬 مخازن الكروت', 
                variant: 'secondary', 
                onclick: "App.switchTab('card_warehouses');" 
            }
        ];

        const stats = [
            { label: 'رصيد المحفظة', value: App.formatMoney(w.balance || 0), icon: '💳', tone: 'blue' },
            { label: 'الرصيد الفوري المتبقي', value: App.formatMoney(r.available || 0), icon: '⚡', tone: 'emerald' },
            { label: 'الحساب النشط', value: this.escape(w.fullname || w.username || App.user || 'المسؤول'), icon: '👤', tone: 'amber' },
            { label: 'عمليات الكروت', value: `${ds.length} عملية`, icon: '✉️', tone: 'purple' }
        ];

        let contentHtml = '';

        if (activeTab === 'vouchers') {
            contentHtml = `
            <div style="max-width: 960px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px;">
                <div class="sam-card mt-card" style="background:var(--sam-bg-surface, var(--bg-window, #fff)); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:20px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                    <div style="font-weight:700; font-size:15px; margin-bottom:14px; color:var(--text-primary, #1e293b); display:flex; align-items:center; gap:8px;">
                        <span>📲</span> <span>إصدار كرت وإرساله مباشرة إلى واتساب العميل</span>
                    </div>
                    <button class="mt-btn" type="button" onclick="App.showPosRetailBook()">دفاتر نقطة البيع والقبض المنفصلة</button>${["system_owner","superadmin","network_manager","admin","accountant","finance"].includes(this.userRole)?`<button class="mt-btn" type="button" onclick="App.showWalletFunding()">قبض تمويل محفظة</button>`:""}<form onsubmit="App.walletVoucherSubmit(event)">
                        <div class="sam-report-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">الباقة المستهدفة *</label>
                                <select id="wv-profile" class="mt-select sam-select" style="width:100%;" required>
                                    ${profiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-'))).map(p => `
                                        <option value="${this.escape(p.name)}">
                                            ${this.escape(p.name_for_users || p.name)} — توزيع: ${Number(p.cost_price || 0).toLocaleString()} / بيع: ${Number(p.retail_price || p.price || 0).toLocaleString()}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">رقم واتساب يمني *</label>
                                <input id="wv-phone" class="mt-input sam-input" inputmode="numeric" maxlength="9" placeholder="777123456" required style="width:100%; font-weight:bold; letter-spacing:1px;" />
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">اسم العميل (اختياري)</label>
                                <label>خصم من سعر التوزيع (حسب صلاحياتك)</label><input id="wv-discount" class="mt-input" type="number" min="0" step="0.01" value="0" /><input id="wv-name" class="mt-input sam-input" placeholder="عميل مستمر أو عميل نقدي" style="width:100%;" />
                            </div>
                        </div>
                        <div class="mt-toolbar" style="margin-top:16px; display:flex; justify-content:flex-end;">
                            <button class="mt-btn mt-btn-success sam-btn sam-btn--primary" type="submit" style="padding:8px 22px; font-weight:bold;">
                                🏢 إصدار وإرسال عبر واتساب النظام
                            </button>
                        </div>
                    </form>
                </div>

                <div class="sam-card mt-card" style="background:var(--sam-bg-surface, var(--bg-window, #fff)); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:20px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                    <div style="font-weight:700; font-size:15px; margin-bottom:14px; color:var(--text-primary, #1e293b); display:flex; align-items:center; gap:8px;">
                        <span>✉️</span> <span>سجل رسائل الكروت الإلكترونية وتأكيدات التسليم</span>
                    </div>
                    <div class="mt-table-wrap">
                        <table class="mt-table sam-table">
                            <thead>
                                <tr>
                                    <th>الباقة</th>
                                    <th>الهاتف</th>
                                    <th>العميل</th>
                                    <th>تكلفة الشراء الفعلية</th>
                                    <th>سعر التوزيع للشبكة</th>
                                    <th>الحالة</th>
                                    <th>الإجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ds.map(d => `
                                    <tr>
                                        <td><b>${this.escape(d.profile_name)}</b></td>
                                        <td dir="ltr" style="text-align:right;">${this.escape(d.buyer_phone)}</td>
                                        <td>${this.escape(d.buyer_name || 'عميل نقدي')}</td>
                                        <td>${Number(d.purchase_cost || 0).toLocaleString()}</td>
                                        <td><b>${Number(d.sale_price || 0).toLocaleString()}</b></td>
                                        <td>
                                            ${d.delivery_status === 'sent' 
                                                ? '<span class="mt-badge" style="background:#10b981; color:#fff;">✅ قبلت البوابة الإرسال</span>' 
                                                : d.delivery_status === 'failed' 
                                                ? '<span class="mt-badge" style="background:#ef4444; color:#fff;">🔴 فشل الإرسال</span>' 
                                                : d.delivery_status === 'refunded' 
                                                ? '<span class="mt-badge" style="background:#64748b; color:#fff;">↩️ مسترجع</span>' 
                                                : '<span class="mt-badge" style="background:#f59e0b; color:#fff;">⏳ التسليم غير مؤكد — تحقق قبل الاسترداد</span>'}
                                        </td>
                                        <td>
                                            ${d.delivery_status === 'failed' 
                                                ? `<div style="display:flex; gap:6px;">
                                                    <button class="mt-btn sam-btn sam-btn--secondary" style="font-size:11px; padding:3px 8px;" onclick="App.resendWalletVoucher(${d.id})">🔁 إعادة الإرسال</button>
                                                    <button class="mt-btn mt-btn-danger sam-btn" style="font-size:11px; padding:3px 8px;" onclick="App.refundWalletVoucher(${d.id})">↩️ استرجاع</button>
                                                   </div>` 
                                                : '—'}
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:24px;">لا توجد رسائل كروت إلكترونية بعد</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        } else {
            contentHtml = `
            <div style="max-width: 960px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px;">
                <div class="sam-card mt-card" style="background:var(--sam-bg-surface, var(--bg-window, #fff)); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:20px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                    <div style="font-weight:700; font-size:15px; margin-bottom:14px; color:var(--text-primary, #1e293b); display:flex; align-items:center; gap:8px;">
                        <span>🔄</span> <span>تحويل رصيد شحن فوري إلى مستخدم / وكيل تابع</span>
                    </div>
                    <form onsubmit="App.instantTransfer(event)">
                        <div class="sam-report-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">المستلم التابع *</label>
                                <select id="ib-to" class="mt-select sam-select" style="width:100%;" required>
                                    ${ac.map(x => `<option value="${x.id}">${this.escape(x.fullname || x.username)}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">المبلغ المطلوب تحويله *</label>
                                <input id="ib-amount" class="mt-input sam-input" type="number" min="1" required style="width:100%; font-weight:bold;" />
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">ملاحظات التحويل</label>
                                <input id="ib-notes" class="mt-input sam-input" placeholder="اختياري" style="width:100%;" />
                            </div>
                        </div>
                        <div class="mt-toolbar" style="margin-top:16px; display:flex; justify-content:flex-end;">
                            <button class="mt-btn mt-btn-primary sam-btn sam-btn--primary" type="submit" style="padding:8px 22px; font-weight:bold;">
                                تحويل الرصيد الفوري
                            </button>
                        </div>
                    </form>
                </div>

                <div class="sam-card mt-card" style="background:var(--sam-bg-surface, var(--bg-window, #fff)); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:20px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                    <div style="font-weight:700; font-size:15px; margin-bottom:14px; color:var(--text-primary, #1e293b); display:flex; align-items:center; gap:8px;">
                        <span>🧾</span> <span>فاتورة بيع رصيد شحن فوري لعميل</span>
                    </div>
                    <form onsubmit="App.instantSale(event)">
                        <div class="sam-report-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">مبلغ الفاتورة *</label>
                                <input id="ibs-amount" type="number" class="mt-input sam-input" min="1" required style="width:100%; font-weight:bold;" />
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">اسم العميل</label>
                                <input id="ibs-name" class="mt-input sam-input" placeholder="عميل نقدي" style="width:100%;" />
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:13px; margin-bottom:6px; display:block;">رقم الهاتف (اختياري)</label>
                                <input id="ibs-phone" class="mt-input sam-input" maxlength="9" placeholder="777123456" style="width:100%;" />
                            </div>
                        </div>
                        <div class="mt-toolbar" style="margin-top:16px; display:flex; justify-content:flex-end;">
                            <button class="mt-btn mt-btn-success sam-btn sam-btn--primary" type="submit" style="padding:8px 22px; font-weight:bold;">
                                إصدار فاتورة بيع الرصيد
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;
        }

        if (PB) {
            view.innerHTML = PB.renderShell({
                id: 'wallet-sales',
                archetype: 'pos',
                title: 'محفظة الوكيل والرصيد الفوري',
                subtitle: 'إصدار الكروت الإلكترونية عبر واتساب، تحويل المخازن، وفواتير بيع الرصيد الفوري',
                eyebrow: 'إدارة المبيعات والعمليات',
                icon: '💳',
                actions,
                stats,
                content: contentHtml
            });
            window.SamPageShell?.sync();
        } else {
            view.innerHTML = contentHtml;
        }
    };

    App.walletVoucherSubmit = async function(e) {
        e.preventDefault();if(this.walletSaleBusy)return;const network=Number(this.activeNetworkId);
        const payload={network_id:network,discount_amount:document.getElementById('wv-discount')?.value||'0',profile_name:document.getElementById('wv-profile')?.value,phone:document.getElementById('wv-phone')?.value.replace(/\D/g,'')||'',buyer_name:document.getElementById('wv-name')?.value.trim()||''};
        if(!/^[0-9]{9}$/.test(payload.phone))return this.toast('أدخل رقم العميل من 9 أرقام','warning');
        const signature=JSON.stringify(payload);if(this.walletSaleRequest?.signature!==signature)this.walletSaleRequest={signature,key:crypto.randomUUID()};this.walletSaleBusy=true;
        try{
            const quote=await this.api('get_wallet_sale_quote',{network_id:network,profile_name:payload.profile_name,discount_amount:payload.discount_amount});if(network!==Number(this.activeNetworkId))return;if(!quote?.success)return this.toast(quote?.error||'تعذر تحميل الأسعار','error');
            if(!confirm(`سيخصم سعر التوزيع ${this.formatMoney(quote.distribution_price)} من المحفظة ويسجل إيرادًا للشبكة.\nسيُسجل قبض ${this.formatMoney(quote.retail_price)} من العميل في دفاتر نقطة البيع المنفصلة.\nهل قبضت هذا المبلغ فعلًا وتريد إصدار الكرت؟`))return;
            const r=await this.api('sell_voucher_from_wallet',{},'POST',{...payload,request_key:this.walletSaleRequest.key,quote_token:quote.quote_token,customer_cash_received:true});if(network!==Number(this.activeNetworkId))return;
            const errors={WALLET_RECONCILIATION_REQUIRED:'رصيد المحفظة لا يطابق دفعاتها المرحّلة؛ يلزم مراجعتها قبل البيع',INSUFFICIENT_WALLET:'رصيد المحفظة لا يكفي لسعر التوزيع',QUOTE_CHANGED:'تغير السعر أو انتهت المعاينة؛ راجع الأسعار وأعد التأكيد',CHART_ACCOUNT_INVALID:'راجع تفعيل حسابات التوزيع والمحفظة',PRICES_REQUIRED:'حدد سعر التوزيع وسعر البيع للعميل في الباقة'};
            if(!r?.success)return this.toast(errors[r?.error]||r?.error||'تعذر إصدار الكرت','error');this.walletSaleRequest=null;this.toast('سُجل بيع الشبكة وقبض العميل في دفاتر منفصلة؛ جارٍ طلب التسليم','success');await this.resendWalletVoucher(r.voucher_id);
        }catch(error){this.toast('تعذر تأكيد الإصدار؛ أعد نفس الطلب للتحقق دون خصم مكرر','error');}finally{this.walletSaleBusy=false;}
    };

    App.resendWalletVoucher = async function(id) {
        const network=Number(this.activeNetworkId),requestId=network+':'+id;this.voucherResendRequests ||= {};this.voucherResendBusy ||= {};if(this.voucherResendBusy[requestId])return;
        this.voucherResendRequests[requestId] ||= crypto.randomUUID();this.voucherResendBusy[requestId]=true;
        try{
            const r=await this.api('resend_paid_voucher_whatsapp',{},'POST',{network_id:network,voucher_id:id,request_key:this.voucherResendRequests[requestId]});
            if(network!==Number(this.activeNetworkId))return;
            const errors={DELIVERY_UNCERTAIN:'لم يُؤكد التسليم؛ تحقق من البوابة والعميل قبل إعادة الإرسال أو الاسترداد',DELIVERY_RATE_LIMIT:'انتظر دقيقة قبل إرسال محاولة جديدة',WHATSAPP_UNAVAILABLE:'واتساب الشبكة غير مفعّل؛ أصلح الربط ثم أعد المحاولة',CARD_PASSWORD_REQUIRED:'تعريف كلمة مرور الكرت ناقص أو مكرر؛ يلزم مراجعته',DELIVERY_NOT_ALLOWED:'لا يمكن إرسال كرت مسترد أو غير صالح'};
            this.toast(r?.success?'قبلت البوابة الإرسال؛ وصوله لهاتف العميل غير مؤكد':(errors[r?.error]||r?.error||'تعذر تأكيد الإرسال'),r?.success?'success':'error');
            if(r?.success||r?.dispatch_state==='failed')delete this.voucherResendRequests[requestId];this.renderWalletSales();
        }catch(error){this.toast('تعذر تأكيد الإرسال؛ أعد نفس الطلب للاستعلام دون إرسال مكرر','error');}finally{delete this.voucherResendBusy[requestId];}
    };

    App.refundWalletVoucher = async function(id) {
        if (!confirm('سيعاد المبلغ المخصوم فعليًا من المحفظة، إذا كان الكرت غير مستخدم وفشل إرساله. سيُعطّل الكرت نهائيًا.')) return;
        const r = await this.api('refund_failed_wallet_voucher', {}, 'POST', { voucher_id: id });
        const errors={VOUCHER_ALREADY_USED:'الكرت مستخدم ولا يمكن استرداده',WALLET_DEBIT_REQUIRED:'لا توجد حركة خصم أصلية واحدة صالحة؛ يلزم مراجعة العملية',REFUND_INCOMPLETE:'سجل استرداد قديم غير متطابق؛ يحتاج مراجعة محاسبية',REFUND_NOT_ALLOWED:'الاسترداد متاح للكرت غير المستخدم الذي فشل إرساله فقط',INVOICE_REVERSAL_REQUIRED:'الكرت مرتبط بفاتورة؛ يلزم عكسها محاسبيًا'};this.toast(r?.success ? 'تم الاسترجاع وتعطيل الكرت' : (errors[r?.error] || r?.error || 'تعذر الاسترجاع'), r?.success ? 'success' : 'error');
        this.renderWalletSales();
    };

    App.instantTransfer = async function(e) {
        e.preventDefault();if(this.instantTransferBusy)return;
        const network=Number(this.activeNetworkId);const payload={network_id:network,receiver_admin_id:document.getElementById('ib-to')?.value,amount:document.getElementById('ib-amount')?.value,notes:document.getElementById('ib-notes')?.value||''};
        const signature=JSON.stringify(payload);if(this.instantTransferRequest?.signature!==signature)this.instantTransferRequest={signature,key:crypto.randomUUID()};
        this.instantTransferBusy=true;
        try{
            const r=await this.api('transfer_instant_balance',{},'POST',{...payload,request_key:this.instantTransferRequest.key});
            if(network!==Number(this.activeNetworkId))return;
            const errors={INSUFFICIENT_BALANCE:'الرصيد الصالح لا يكفي؛ الدفعات المنتهية لا تُستخدم',TRANSFER_BATCH_REQUIRED:'التحويل يحتاج أكثر من 500 دفعة؛ قسّمه إلى مبالغ أصغر',IDEMPOTENCY_CONFLICT:'تغيرت بيانات طلب سبق تنفيذه؛ راجع سجل التحويلات',FORBIDDEN_SCOPE:'التحويل مسموح للحساب التابع لك بالرتبة المسموحة فقط',FORBIDDEN_NETWORK:'المستلم خارج الشبكة أو غير نشط',INVALID_AMOUNT:'أدخل مبلغًا موجبًا بخانتين عشريتين كحد أقصى',SAME_ACCOUNT:'لا يمكن التحويل للحساب نفسه'};
            this.toast(r?.success?'تم التحويل: '+r.transfer_no:(errors[r?.error]||r?.error||'فشل التحويل'),r?.success?'success':'error');
            if(r?.success){this.instantTransferRequest=null;this.renderWalletSales();}
        }catch(error){this.toast(error.message||'تعذر تأكيد التحويل؛ أعد نفس الطلب للتحقق دون تكراره','error');}finally{this.instantTransferBusy=false;}
    };

    App.instantSale = async function(e) {
        e.preventDefault();
        const r = await this.api('sell_instant_balance', {}, 'POST', {
            amount: document.getElementById('ibs-amount')?.value,
            buyer_name: document.getElementById('ibs-name')?.value,
            buyer_phone: document.getElementById('ibs-phone')?.value,
            payment_type: 'cash'
        });
        this.toast(r?.success ? 'تمت الفاتورة: ' + r.invoice_no : (r?.error || 'فشل البيع'), r?.success ? 'success' : 'error');
        if (r?.success) this.renderWalletSales();
    };
})();

/* ==========================================================================
   SAM Mobile Modal Optimizer & Touch Field Enhancer
   ========================================================================== */
(function () {
    if (!window.App) return;

    function applyMobileModalDecorations(modalRoot) {
        if (!modalRoot) return;
        
        // 1. Label all table cells for card-view on mobile
        const tables = modalRoot.querySelectorAll('table.mt-table');
        tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim().replace(/\s+/g, ' '));
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(tr => {
                const cells = tr.querySelectorAll('td');
                cells.forEach((td, idx) => {
                    if (!td.getAttribute('data-label')) {
                        const lbl = headers[idx] || '';
                        if (lbl && lbl !== '✕' && lbl !== 'حذف' && lbl !== 'الإجراء') {
                            td.setAttribute('data-label', lbl);
                        }
                    }
                });
            });
        });

        // 2. Style sheet checkboxes for touch ergonomics
        const sheetLabels = modalRoot.querySelectorAll('.tr-sheet-cb, label input[type="checkbox"]');
        sheetLabels.forEach(cb => {
            const parentLabel = cb.closest('label');
            if (parentLabel && !parentLabel.classList.contains('sam-sheet-touch-label')) {
                parentLabel.classList.add('sam-sheet-touch-label');
            }
        });

        // 3. Scroll focused inputs smoothly into view on mobile
        const inputs = modalRoot.querySelectorAll('input, select, textarea');
        inputs.forEach(inp => {
            if (!inp.__samFocusBound) {
                inp.__samFocusBound = true;
                inp.addEventListener('focus', function () {
                    setTimeout(() => {
                        this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }, { passive: true });
            }
        });
    }

    // Hook into openModal & showModal for real-time modal optimization
    const originalOpenModal = App.openModal;
    if (originalOpenModal) {
        App.openModal = function (content, customWidth = null) {
            const res = originalOpenModal.apply(this, arguments);
            setTimeout(() => {
                const container = document.getElementById('modal-container');
                if (container) applyMobileModalDecorations(container);
            }, 60);
            return res;
        };
    }

    // Observe modal-container DOM mutations
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length > 0) {
                const container = document.getElementById('modal-container');
                if (container && container.children.length > 0) {
                    applyMobileModalDecorations(container);
                }
            }
        }
    });

    function initObserver() {
        const container = document.getElementById('modal-container');
        if (container) {
            observer.observe(container, { childList: true, subtree: true });
        } else {
            setTimeout(initObserver, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

    App.decorateMobileModal = applyMobileModalDecorations;
})();

    App.showPosRetailBook = async function(before=0,admin=null) {
        const network=Number(this.activeNetworkId);if(admin!==null)this.posBookAccount={network,id:Number(admin)};const account=this.posBookAccount?.network===network?this.posBookAccount.id:0,scope=account>0?{admin_id:account}:{};
        const [book,sales,people]=await Promise.all([this.api('get_pos_retail_book',{before_id:before,limit:100,...scope}),this.api('get_wallet_distribution_sales',{limit:100,...scope}),this.api('get_sales_eligible_accounts').catch(()=>({accounts:[]}))]);
        if(network!==Number(this.activeNetworkId))return;
        if(!book?.success||!sales?.success)return this.toast(book?.error||sales?.error||'تعذر تحميل الدفاتر','error');
        this.posRefundSales=new Map(sales.data.map(s=>[Number(s.id),s]));
        const names={POS_CASH:'نقد نقطة البيع',POS_PREPAID:'رصيدها لدى الشبكة',POS_RETAIL_REVENUE:'بيع العميل النهائي',POS_COST:'سعر التوزيع',POS_CUSTOMER_REFUND_DUE:'مبالغ واجبة الرد للعملاء'};
        this.openModal(`<div dir="rtl"><h3>دفاتر نقطة البيع المستقلة</h3><label>الحساب المسموح عرضه</label><select class="mt-select" onchange="App.showPosRetailBook(0,this.value)"><option value="0" ${!account?"selected":""}>حسابي</option>${(people?.accounts||[]).map(a=>`<option value="${Number(a.id)}" ${Number(a.id)===account?"selected":""}>${this.escape(a.fullname||a.username)}</option>`).join('')}</select><p>هذه القيود منفصلة عن إيراد الشبكة. تعرض حركات النقد، ولا تفترض رصيدًا افتتاحيًا للصندوق.</p><div class="mt-table-wrap"><table class="mt-table"><thead><tr><th>المرجع والتاريخ</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>${book.data.flatMap(j=>j.lines.map(l=>`<tr><td>${this.escape(j.reference_no)}<br>${this.escape(j.created_at)}</td><td>${this.escape(names[l.account_code]||l.account_code)}</td><td>${this.formatMoney(l.debit)}</td><td>${this.formatMoney(l.credit)}</td></tr>`)).join('')||'<tr><td colspan="4">لا توجد قيود</td></tr>'}</tbody></table></div>${book.has_more?`<button class="mt-btn" onclick="App.showPosRetailBook(${Number(book.next_cursor)})">القيود الأقدم</button>`:''}<h4>عمليات التوزيع وقبض العميل — أحدث 100 عملية</h4><div class="mt-table-wrap"><table class="mt-table"><thead><tr><th>المرجع</th><th>إيراد الشبكة</th><th>قبض العميل</th><th>الرد المستحق</th><th>الإجراء</th></tr></thead><tbody>${sales.data.map(s=>`<tr><td>${this.escape(s.invoice_no)}</td><td>${this.formatMoney(s.distribution_amount)}</td><td>${this.formatMoney(s.retail_amount)}</td><td>${this.formatMoney(s.customer_refund_due)}</td><td>${s.status==='refunded'&&!s.customer_refund_paid_at&&Number(s.customer_refund_due)>0?`<button class="mt-btn" onclick="App.confirmPosCustomerRefund(${Number(s.id)})">تأكيد رد نقد العميل</button>`:s.customer_refund_paid_at?'تم رد النقد':s.status==='refunded'?'مسترجع':'مكتمل'}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد عمليات</td></tr>'}</tbody></table></div></div>`,'1000px');
    };
    App.confirmPosCustomerRefund = async function(id) {
        if(this.posRefundBusy)return;const sale=this.posRefundSales?.get(Number(id));if(!sale)return;const network=Number(this.activeNetworkId);
        if(!confirm(`هل رددت نقد العميل فعليًا بمبلغ ${this.formatMoney(sale.customer_refund_due)}؟\nسيسجل الصرف في دفاتر نقطة البيع وحدها.`))return;
        this.posRefundBusy=true;
        try{const r=await this.api('pay_pos_customer_refund',{},'POST',{network_id:network,sale_id:Number(id),amount:sale.customer_refund_due,customer_refund_paid:true});if(network!==Number(this.activeNetworkId))return;if(!r?.success)return this.toast(r?.error||'تعذر تأكيد الرد','error');this.toast('سُجل رد نقد العميل في دفاتر نقطة البيع','success');await this.showPosRetailBook();}catch(e){this.toast('تعذر تأكيد النتيجة؛ أعد التحقق دون صرف جديد','error');}finally{this.posRefundBusy=false;}
    };
    App.showWalletFunding = async function() {
        const network=Number(this.activeNetworkId),[people,chart]=await Promise.all([this.api('get_sales_eligible_accounts'),this.api('get_chart_of_accounts')]);if(network!==Number(this.activeNetworkId))return;
        if(!people?.success||!chart?.success)return this.toast(people?.error||chart?.error||'تعذر تحميل الحسابات','error');
        const cash=chart.accounts.filter(a=>a.is_active==1&&a.account_type==='asset'&&String(a.account_code).startsWith('1101')&&String(a.account_code)!=='1101');
        if(!cash.length)return this.toast('حدد صندوقًا فعّالًا في شجرة الحسابات قبل تمويل المحفظة','warning');
        this.openModal(`<form dir="rtl" onsubmit="App.walletFundingSubmit(event)"><h3>قبض تمويل محفظة نقطة البيع</h3><p>يُسجل المبلغ المقبوض دفعةً مقدمة في محاسبة الشبكة. إيراد التوزيع يُسجل عند إصدار الكرت.</p><label>نقطة البيع</label><select id="wf-pos" class="mt-select" required>${people.accounts.map(a=>`<option value="${Number(a.id)}">${this.escape(a.fullname||a.username)}</option>`).join('')}</select><label>الصندوق الذي قبض المبلغ</label><select id="wf-cash" class="mt-select" required>${cash.map(a=>`<option value="${Number(a.id)}">${this.escape(a.name_ar)}</option>`).join('')}</select><label>المبلغ المقبوض فعلًا</label><input id="wf-amount" class="mt-input" type="number" min="0.01" step="0.01" required><button class="mt-btn" type="submit">تأكيد القبض وتمويل المحفظة</button></form>`,'600px');
    };
    App.walletFundingSubmit = async function(e) {
        e.preventDefault();if(this.walletFundingBusy)return;const network=Number(this.activeNetworkId),payload={network_id:network,admin_id:Number(document.getElementById('wf-pos').value),cashbox_account_id:Number(document.getElementById('wf-cash').value),amount:document.getElementById('wf-amount').value,cash_received:true};
        if(!confirm(`هل استلمت من نقطة البيع مبلغ ${this.formatMoney(payload.amount)} فعلًا في الصندوق المحدد؟`))return;
        const signature=JSON.stringify(payload);if(this.walletFundingRequest?.signature!==signature)this.walletFundingRequest={signature,key:crypto.randomUUID()};this.walletFundingBusy=true;
        try{const r=await this.api('credit_agent_wallet',{},'POST',{...payload,request_key:this.walletFundingRequest.key});if(network!==Number(this.activeNetworkId))return;if(!r?.success)return this.toast(r?.error||'تعذر التمويل','error');this.walletFundingRequest=null;this.toast('سُجل القبض وتمويل المحفظة دون تسجيل إيراد بيع','success');await this.renderWalletSales();}catch(e){this.toast('تعذر تأكيد التمويل؛ أعد نفس الطلب للتحقق دون قبض مكرر','error');}finally{this.walletFundingBusy=false;}
    };
