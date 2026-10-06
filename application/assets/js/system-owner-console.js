(function () {
    if (!window.App || window.__samOwnerConsole) return;
    window.__samOwnerConsole = true;

    function esc(v) { return App.escape ? App.escape(v == null ? '' : String(v)) : String(v == null ? '' : v); }

    const oldCheck = App.checkAuth;
    App.checkAuth = async function () {
        const r = await oldCheck.apply(this, arguments);
        this.isSystemOwner = Number(this.adminId) === 1 || Boolean(r?.is_system_owner);
        return r;
    };

    const oldApi = App.api;
    App.api = async function (action, params, method, body) {
        const isDel = typeof action === 'string' && (
            action.startsWith('delete_') ||
            action.startsWith('remove_') ||
            action.startsWith('purge_') ||
            action.startsWith('clear_') ||
            action.startsWith('destroy_') ||
            action === 'reset_financial_system'
        );
        if (isDel && !this.isSystemOwner) {
            this.toast('🔒 عذراً، عمليات الحذف مقفلة بقرار الأمان ومحصورة بمالك النظام فقط.', 'danger', 5000);
            return { success: false, error: 'عمليات الحذف مقفلة ومحصورة بمالك النظام فقط', code: 'SYSTEM_OWNER_DELETE_ONLY' };
        }
        return oldApi.apply(this, arguments);
    };

    const sys = App.departments.find(d => d.id === 'system');
    App.departments.forEach(d => { d.items = (d.items || []).filter(i => i.id !== 'notifications' && i.id !== 'whatsapp_manager'); });
    if (sys) {
        sys.name = 'إدارة النظام والأمن';
        sys.items.unshift(
            { id: 'notifications', name: 'رسائل وتنبيهات الشبكة النشطة', icon: '💬' },
            { id: 'whatsapp_manager', name: 'قوالب واتساب الشبكة النشطة', icon: '📱' },
            { id: 'system_ui_governance', name: '🎨 هوية وقالب الشبكة وتخصيص الواجهة', icon: '🎨' },
            { id: 'document_print_settings', name: '🖨️ تخصيص طباعة المستندات والترويسة', icon: '🖨️' }
        );
        // network-subscriptions.js adds this owner-only page to the legacy
        // system group; relocate it below to keep all owner-only pages in one
        // section and avoid exposing a misleading generic entry.
        sys.items = sys.items.filter(i => i.id !== 'network_subscriptions');
    }

    const isOwnerPortalEnv = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));

    // Keep every page that is intrinsically platform-owner-only in one
    // clearly marked section ONLY when running on the Sovereign Portal (Port 8099).
    // Port 80 (standard tenant/network portal) must NEVER include sovereign owner sections.
    App.departments = (App.departments || []).filter(d => d.id !== 'system_owner' && d.id !== 'sovereign_core' && d.id !== 'sovereign_server');
    if (isOwnerPortalEnv) {
        const ownerOnlyDepartment = {
            id: 'system_owner',
            name: '👑 بوابة مالك النظام (Sovereign Portal)',
            icon: '👑',
            color: '#0f172a',
            ownerOnly: true,
            items: [
                { id: 'owner_portal_overview', name: '👑 لوحة القيادة السيادية (Sovereign Hub)', icon: '👑' },
                { id: 'owner_clients_networks', name: '🏢 إدارة شبكات العملاء (Clients Hub)', icon: '🏢' },
                { id: 'network_subscriptions', name: '💎 مركز الشبكات والاشتراكات', icon: '💎' },
                { id: 'owner_network_admins', name: '👥 إدارة مدراء وتفويض الشبكات', icon: '👥' },
                { id: 'owner_master_finance', name: '💰 المركز المالي والمحاسبي الشامل', icon: '💰' },
                { id: 'owner_firewall', name: '🛡️ جدار الحماية والأمان السيادي', icon: '🛡️' },
                { id: 'system_settings', name: '🖥️ الخدمات وإدارة الخادم', icon: '🖥️' },
                { id: 'owner_diagnostics', name: '🩺 الفحص التشخيصي وصحة النظام', icon: '🩺' },
                { id: 'owner_logs', name: '📋 سجلات النظام والأخطاء', icon: '📋' },
                { id: 'owner_broadcast', name: '📢 التنبيهات والبث العام للعملاء', icon: '📢' },
                { id: 'owner_whatsapp', name: '📱 واتساب مالك المنظومة (Sovereign WA)', icon: '📱' },
                { id: 'owner_telegram', name: '✈️ بوت تلغرام مالك المنظومة', icon: '✈️' },
                { id: 'owner_alerts', name: '🔔 تنبيهات وسجلات المنصة للمالك', icon: '🔔' },
                { id: 'sstp_vpn', name: '🔒 SSTP VPN وأنفاق الراوترات', icon: '🔒' }
            ]
        };
        App.departments.unshift(ownerOnlyDepartment);
    }

    // SSTP is represented only in the owner section, never in the generic
    // network navigation. The API remains the authoritative guard.
    const networkDepartment = App.departments.find(d => d.id === 'network');
    if (networkDepartment) {
        networkDepartment.items = (networkDepartment.items || []).filter(i => i.id !== 'sstp_vpn');
    }

    const oldAccess = App.hasAccess;
    App.hasAccess = function (tab) {
        const sovereignTabs = [
            'owner_portal_overview',
            'owner_clients_networks',
            'network_subscriptions',
            'owner_network_admins',
            'owner_firewall',
            'system_settings',
            'owner_diagnostics',
            'owner_logs',
            'owner_broadcast',
            'owner_whatsapp',
            'owner_telegram',
            'owner_master_finance',
            'owner_alerts',
            'sstp_vpn'
        ];
        if (sovereignTabs.includes(tab)) {
            return Boolean(this.isSystemOwner) || this.userRole === 'system_owner' || Number(this.adminId) === 1;
        }
        if (tab === 'system_ui_governance') {
            return Boolean(this.isSystemOwner) || this.userRole === 'system_owner' || this.userRole === 'superadmin' || Number(this.adminId) === 1;
        }
        if (tab === 'admins' || tab === 'admins_agents') {
            return Boolean(this.isSystemOwner) || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin' || this.userRole === 'superadmin' || Number(this.adminId) === 1 || oldAccess.call(this, tab);
        }
        return oldAccess.call(this, tab);
    };

    App.activateOwnerTab = function (tab) {
        this.currentTab = tab;
        try {
            sessionStorage.setItem('sam_active_tab', tab);
            localStorage.setItem('sam_active_tab', tab);
            if (window.location.hash !== '#' + tab) {
                history.replaceState(null, '', '#' + tab);
            }
        } catch (e) {}
        if (this.updateBreadcrumb) {
            try { this.updateBreadcrumb(tab); } catch (e) {}
        }
        document.querySelectorAll('.mt-nav-item').forEach(el => el.classList.remove('active'));
        const nav = document.getElementById('nav-' + tab);
        if (nav) {
            nav.classList.add('active');
            const dept = nav.closest('.mt-nav-dept');
            if (dept) dept.classList.remove('collapsed');
        }
        document.querySelectorAll('.mt-mobile-nav-btn').forEach(el => el.classList.remove('active'));
        const mobNav = document.getElementById('mob-nav-' + tab);
        if (mobNav) mobNav.classList.add('active');
        if (typeof this.closeMobileSidebar === 'function') {
            this.closeMobileSidebar();
        }
    };

    const oldSwitch = App.switchTab;
    App.switchTab = function (tab) {
        const isOwnerEnv = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        const sovereignTabs = [
            'owner_portal_overview',
            'owner_clients_networks',
            'network_subscriptions',
            'owner_network_admins',
            'owner_firewall',
            'system_settings',
            'owner_diagnostics',
            'owner_logs',
            'owner_broadcast',
            'owner_whatsapp',
            'owner_telegram',
            'owner_master_finance',
            'owner_alerts',
            'sstp_vpn'
        ];
        if (!isOwnerEnv && sovereignTabs.includes(tab)) {
            this.toast('👑 هذه الأقسام السيادية مخصصة لبوابة مالك النظام الآمنة', 'info', 4000);
            return;
        }
        if (isOwnerEnv && !sovereignTabs.includes(tab)) {
            if (typeof this.showOwnerForbiddenNetworkAccessModal === 'function') {
                this.showOwnerForbiddenNetworkAccessModal(tab);
            } else {
                this.toast('⛔ تم حظر الوصول: واجهات تشغيل الشبكات مخصصة حصرياً لمدراء الشبكات عبر بوابتهم الخاصة.', 'danger', 6000);
            }
            return;
        }
        if (tab === 'owner_portal_overview') {
            if (!this.hasAccess(tab)) return this.toast('البوابة السيادية مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerPortalOverview();
            return;
        }
        if (tab === 'owner_clients_networks') {
            if (!this.hasAccess(tab)) return this.toast('إدارة شبكات العملاء مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerClientsNetworks();
            return;
        }
        if (tab === 'network_subscriptions') {
            if (!this.hasAccess(tab)) return this.toast('مركز الشبكات والاشتراكات مخصص لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderNetworkSubscriptionCenter();
            return;
        }
        if (tab === 'owner_network_admins') {
            if (!this.hasAccess(tab)) return this.toast('إدارة مدراء وتفويض الشبكات مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerNetworkAdmins();
            return;
        }
        if (tab === 'owner_firewall') {
            if (!this.hasAccess(tab)) return this.toast('مركز جدار الحماية والأمان السيادي مخصص لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerFirewallStandalone();
            return;
        }
        if (tab === 'system_settings') {
            if (!this.hasAccess(tab)) return this.toast('هذه الإدارة خاصة بمالك النظام', 'danger');
            this.activateOwnerTab(tab);
            this.renderSystemOwnerConsole();
            return;
        }
        if (tab === 'owner_diagnostics') {
            if (!this.hasAccess(tab)) return this.toast('الفحص التشخيصي مخصص لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerDiagnostics();
            return;
        }
        if (tab === 'owner_logs') {
            if (!this.hasAccess(tab)) return this.toast('سجلات النظام مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerSystemLogs();
            return;
        }
        if (tab === 'owner_broadcast' || tab === 'owner_alerts') {
            if (!this.hasAccess(tab)) return this.toast('التنبيهات والبث العام مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerBroadcast();
            return;
        }
        if (tab === 'owner_whatsapp') {
            if (!this.hasAccess(tab)) return this.toast('بوابة واتساب المالك مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerWhatsAppSettings();
            return;
        }
        if (tab === 'owner_telegram') {
            if (!this.hasAccess(tab)) return this.toast('بوت تلغرام المالك مخصص لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerTelegramSettings();
            return;
        }
        if (tab === 'sstp_vpn') {
            if (!this.hasAccess(tab)) return this.toast('صفحة SSTP VPN مخصصة لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderSstpVpn();
            return;
        }
        if (tab === 'owner_master_finance') {
            if (!this.hasAccess(tab)) return this.toast('المركز المالي والمحاسبي الشامل مخصص لمالك النظام فقط', 'danger');
            this.activateOwnerTab(tab);
            this.renderOwnerMasterFinance();
            return;
        }
        if (tab === 'document_print_settings') {
            this.openDocumentPrintSettingsModal();
            return;
        }
        if (tab === 'admins' || tab === 'admins_agents') {
            if (!this.hasAccess(tab)) return this.toast('ليس لديك صلاحية للوصول إلى إدارة المستخدمين والمدراء', 'danger');
            this.activateOwnerTab(tab);
            this.renderAdmins();
            return;
        }
        return oldSwitch.call(this, tab);
    };

    App.ownerActiveAlertSubTab = 'inbox';

    App.switchOwnerAlertSubTab = function (tab) {
        this.ownerActiveAlertSubTab = tab;
        document.querySelectorAll('.owner-alert-subtab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-subtab') === tab);
        });
        document.querySelectorAll('.owner-alert-panel').forEach(p => {
            p.style.display = (p.id === 'alert-panel-' + tab) ? 'block' : 'none';
        });
        if (tab === 'broadcast') this.renderOwnerBroadcastLogs();
    };

    App.renderOwnerSystemAlerts = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:22px;text-align:center;color:#64748b">جارٍ تحميل مركز التنبيهات والاتصالات السيادية للمالك…</div>';

        const data = await this.api('owner_system_notifications_get');
        if (this.currentTab !== 'owner_alerts') return;
        if (!data?.success) {
            view.innerHTML = `<div class="mt-card" style="padding:22px;color:#b91c1c">${esc(data?.error || 'تعذر تحميل مركز التنبيهات')}</div>`;
            return;
        }

        const alerts = Array.isArray(data.alerts) ? data.alerts : [];
        const settings = data.settings || {};
        const tg = settings.telegram || {};
        const wa = settings.whatsapp || {};
        const unread = Number(data.summary?.unread || 0);
        const currentSub = this.ownerActiveAlertSubTab || 'inbox';

        const rows = alerts.length ? alerts.map(item => {
            const isRead = Number(item.is_read) === 1;
            return `
            <article style="border:1px solid ${isRead ? '#e2e8f0' : '#bfdbfe'};border-right:4px solid ${isRead ? '#94a3b8' : '#2563eb'};border-radius:10px;padding:12px 14px;background:${isRead ? '#fff' : '#f8fbff'};margin-top:9px">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
                    <div style="min-width:220px;flex:1">
                        <div style="font-weight:700;color:#0f172a">${esc(item.title || 'تنبيه من النظام')}</div>
                        <div style="margin-top:5px;color:#475569;line-height:1.7">${esc(item.message || '')}</div>
                        <div style="margin-top:7px;font-size:11px;color:#64748b">${esc(item.network_name || 'منصة النظام')} · ${esc(item.created_at || '')}</div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center">
                        <span class="mt-badge" style="background:${isRead ? '#e2e8f0' : '#dbeafe'};color:${isRead ? '#475569' : '#1d4ed8'}">${isRead ? 'مقروء' : 'جديد'}</span>
                        ${isRead ? '' : `<button class="mt-btn" onclick="App.markOwnerSystemAlertRead(${Number(item.id) || 0})">تعليم كمقروء</button>`}
                    </div>
                </div>
            </article>`;
        }).join('') : '<div style="text-align:center;padding:28px;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px;margin-top:10px">لا توجد تنبيهات منصة مسجلة حاليًا.</div>';

        const content = `
            <!-- Top Header Banner -->
            <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; border-radius:12px; padding:20px; margin-bottom:18px; border:1px solid #334155; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:22px;">👑</span>
                            <h2 style="margin:0; font-size:19px; font-weight:800; color:#f8fafc;">مركز اتصالات وتنبيهات مالك النظام السيادي</h2>
                            <span class="mt-badge" style="background:#d97706; color:#fff; font-size:10px;">SOVEREIGN COMMS & ALERTS</span>
                        </div>
                        <div style="color:#94a3b8; font-size:12px; margin-top:4px;">
                            إدارة قنوات اتصالات المالك الخاصة: بوت تليجرام، خادم واتساب المالك، إرسال التعاميم لكافة الشبكات، وإشعارات المنصة الموحدة.
                        </div>
                    </div>
                    <button class="mt-btn" style="background:#334155; color:#f8fafc; border:1px solid #475569;" onclick="App.renderOwnerSystemAlerts()">🔄 تحديث</button>
                </div>
            </div>

            <!-- Subtab Navigation -->
            <div style="display:flex; gap:8px; margin-bottom:16px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; flex-wrap:wrap;">
                <button class="mt-btn owner-alert-subtab-btn ${currentSub === 'inbox' ? 'active' : ''}" data-subtab="inbox" onclick="App.switchOwnerAlertSubTab('inbox')" style="font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <span>🔔</span> تنبيهات المنصة والصندوق (${unread ? `<b style="color:#ef4444">${unread}</b>` : '0'})
                </button>
                <button class="mt-btn owner-alert-subtab-btn ${currentSub === 'telegram' ? 'active' : ''}" data-subtab="telegram" onclick="App.switchOwnerAlertSubTab('telegram')" style="font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <span>🤖</span> بوت تليجرام المالك السيادي
                    ${tg.enabled ? '<span style="background:#10b981; color:#fff; font-size:9px; padding:1px 5px; border-radius:8px;">مفعل</span>' : ''}
                </button>
                <button class="mt-btn owner-alert-subtab-btn ${currentSub === 'whatsapp' ? 'active' : ''}" data-subtab="whatsapp" onclick="App.switchOwnerAlertSubTab('whatsapp')" style="font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <span>📱</span> خادم واتساب المالك السيادي
                    ${wa.enabled ? '<span style="background:#10b981; color:#fff; font-size:9px; padding:1px 5px; border-radius:8px;">مفعل</span>' : ''}
                </button>
                <button class="mt-btn owner-alert-subtab-btn ${currentSub === 'broadcast' ? 'active' : ''}" data-subtab="broadcast" onclick="App.switchOwnerAlertSubTab('broadcast')" style="font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <span>📢</span> إرسال تعميم ورسائل المنظومة
                </button>
            </div>

            <!-- PANEL 1: INBOX & PLATFORM ALERTS -->
            <div id="alert-panel-inbox" class="owner-alert-panel" style="display:${currentSub === 'inbox' ? 'block' : 'none'};">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
                    <div class="mt-card" style="padding:15px; border-right:4px solid #ef4444;"><div style="color:#64748b;font-size:12px">تنبيهات غير مقروءة</div><strong style="font-size:24px; color:#ef4444;">${unread}</strong></div>
                    <div class="mt-card" style="padding:15px; border-right:4px solid #2563eb;"><div style="color:#64748b;font-size:12px">إجمالي التنبيهات المحفوظة</div><strong style="font-size:24px; color:#2563eb;">${Number(data.summary?.total || alerts.length)}</strong></div>
                    <div class="mt-card" style="padding:15px; border-right:4px solid #10b981;"><div style="color:#64748b;font-size:12px">أجهزة المالك المسجلة (FCM)</div><strong style="font-size:24px; color:#10b981;">${Number(data.summary?.owner_devices || 0)}</strong></div>
                </div>

                <div class="mt-card" style="padding:16px;margin-bottom:14px">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
                        <div>
                            <h3 style="margin:0; font-size:15px;">إعدادات إشعارات المالك الفورية</h3>
                            <div style="font-size:12px;color:#64748b;margin-top:4px">التنبيهات داخل لوحة المالك تبقى محفوظة دائماً. يمكنك تفعيل الإشعار الفوري على أجهزة المالك المسجلة.</div>
                        </div>
                        <label style="display:flex;gap:8px;align-items:center;font-weight:700; cursor:pointer;">
                            <input id="owner-system-push-enabled" type="checkbox" ${settings.push_enabled ? 'checked' : ''}> إشعارات التطبيق الفورية (Push/FCM)
                        </label>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="mt-btn mt-btn-primary" onclick="App.saveOwnerSystemAlertSettings()">💾 حفظ خيار الإشعارات</button>
                        <button class="mt-btn" onclick="App.showFirebaseDevicesModal()">📲 أجهزة المالك المسجلة</button>
                    </div>
                </div>

                <div class="mt-card" style="padding:16px">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                        <h3 style="margin:0; font-size:15px;">📜 سجل تنبيهات المنصة الموجهة للمالك</h3>
                        <div style="display:flex;gap:7px;flex-wrap:wrap">
                            ${unread ? '<button class="mt-btn" onclick="App.markAllOwnerSystemAlertsRead()">تعليم الكل كمقروء ✓</button>' : ''}
                            <button class="mt-btn" onclick="App.renderOwnerSystemAlerts()">🔄 تحديث السجل</button>
                        </div>
                    </div>
                    ${rows}
                </div>
            </div>

            <!-- PANEL 2: SOVEREIGN TELEGRAM BOT -->
            <div id="alert-panel-telegram" class="owner-alert-panel" style="display:${currentSub === 'telegram' ? 'block' : 'none'};">
                <div class="mt-card" style="padding:20px; margin-bottom:16px; border-right:4px solid #2563eb;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0 0 4px; font-size:16px;">🤖 بوت وقناة تليجرام مالك النظام السيادي</h3>
                            <div style="color:#64748b; font-size:12px; line-height:1.7;">
                                بوت تليجرام مخصص حصرياً لمالك النظام لإرسال النسخ الاحتياطية لقاعدة البيانات، تنبيهات صحة الخادم، أحداث الجدار الناري، وتنبيهات أمان المنصة.
                            </div>
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; background:#eff6ff; padding:6px 14px; border-radius:20px; font-weight:700; cursor:pointer; border:1px solid #bfdbfe;">
                            <input type="checkbox" id="owner-tg-enabled" ${tg.enabled ? 'checked' : ''}> تفعيل بوت تليجرام المالك
                        </label>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-bottom:16px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🔑 رمز توكن البوت (Bot Token):</label>
                            <input type="password" id="owner-tg-token" class="mt-input" value="${this.escape(tg.bot_token || '')}" placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" style="width:100%; font-family:monospace;" />
                            <small style="color:#64748b; font-size:11px;">يتم الحصول عليه من @BotFather على تليجرام</small>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">💬 معرف المحادثة / القناة (Chat ID):</label>
                            <input type="text" id="owner-tg-chat-id" class="mt-input" value="${this.escape(tg.chat_id || '')}" placeholder="مثال: 123456789 أو -1001234567890 للقنوات" style="width:100%; font-family:monospace;" />
                            <small style="color:#64748b; font-size:11px;">معرف حسابك الشخصي أو معرف القناة/المجموعة الخاصة بك</small>
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">
                        <b style="font-size:13px; color:#0f172a; display:block; margin-bottom:10px;">🔔 أحداث وتنبيهات المنظومة المرسلة تلقائياً إلى بوت المالك:</b>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; font-size:12px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-tg-notify-backups" ${tg.notify_backups ? 'checked' : ''}> 💾 إرسال ملف النسخة الاحتياطية</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-tg-notify-server" ${tg.notify_server_alerts ? 'checked' : ''}> 🖥️ تنبيهات صحة وتوقف الخادم والخدمات</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-tg-notify-sstp" ${tg.notify_sstp ? 'checked' : ''}> 🔒 تنبيهات انقطاع وعودة أنفاق SSTP</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-tg-notify-net" ${tg.notify_new_network ? 'checked' : ''}> 🌐 تنبيه إنشاء شبكة جديدة وتغيير الباقات</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-tg-notify-security" ${tg.notify_security ? 'checked' : ''}> 🛡️ تنبيهات الأمان ومحاولات الدخول</label>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="mt-btn mt-btn-primary" onclick="App.saveOwnerTelegramSettings()" style="font-weight:700; padding:8px 18px;">💾 حفظ إعدادات تليجرام المالك</button>
                        <button class="mt-btn" onclick="App.testOwnerTelegram()" style="font-weight:700; background:#2563eb; color:#fff; border:none;">🚀 فحص وإرسال إشعار تجريبي للبوت</button>
                    </div>
                </div>
            </div>

            <!-- PANEL 3: SOVEREIGN WHATSAPP GATEWAY -->
            <div id="alert-panel-whatsapp" class="owner-alert-panel" style="display:${currentSub === 'whatsapp' ? 'block' : 'none'};">
                <div class="mt-card" style="padding:20px; margin-bottom:16px; border-right:4px solid #10b981;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0 0 4px; font-size:16px;">📱 خادم وقناة واتساب مالك النظام السيادي</h3>
                            <div style="color:#64748b; font-size:12px; line-height:1.7;">
                                ربط جلسة واتساب خاصة بمالك النظام لإرسال التنبيهات المباشرة إلى هاتفه الشخصي وإرسال التعاميم الرسمية.
                            </div>
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; background:#f0fdf4; padding:6px 14px; border-radius:20px; font-weight:700; cursor:pointer; border:1px solid #bbf7d0;">
                            <input type="checkbox" id="owner-wa-enabled" ${wa.enabled ? 'checked' : ''}> تفعيل واتساب المالك
                        </label>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-bottom:16px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🌐 عنوان خادم بوابة واتساب (API URL):</label>
                            <input type="text" id="owner-wa-url" class="mt-input" value="${this.escape(wa.api_url || 'http://127.0.0.1:3388')}" placeholder="http://127.0.0.1:3388" style="width:100%; font-family:monospace;" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📱 رقم هاتف المالك لاستلام التنبيهات:</label>
                            <input type="text" id="owner-wa-phone" class="mt-input" value="${this.escape(wa.owner_phone || '')}" placeholder="مثال: 967771234567" style="width:100%;" />
                            <small style="color:#64748b; font-size:11px;">الرقم الذي ستصل إليه رسائل التنبيهات المباشرة من النظام</small>
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">
                        <b style="font-size:13px; color:#0f172a; display:block; margin-bottom:10px;">🔔 تنبيهات المنظومة المرسلة لواتساب المالك:</b>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; font-size:12px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-wa-notify-backups" ${wa.notify_backups ? 'checked' : ''}> 💾 تأكيد إتمام النسخ الاحتياطي</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-wa-notify-server" ${wa.notify_server_alerts ? 'checked' : ''}> 🖥️ تنبيهات توقف الخدمات والأعطال</label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="owner-wa-notify-security" ${wa.notify_security ? 'checked' : ''}> 🛡️ تنبيهات الأمان الحرجة</label>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="mt-btn mt-btn-success" onclick="App.saveOwnerWhatsAppSettings()" style="font-weight:700; padding:8px 18px;">💾 حفظ إعدادات واتساب المالك</button>
                        <button class="mt-btn" onclick="App.testOwnerWhatsApp()" style="font-weight:700; background:#059669; color:#fff; border:none;">📱 إرسال واتساب تجريبي لرقم المالك</button>
                        <button class="mt-btn" onclick="App.checkOwnerWhatsAppQr()" style="font-weight:700;">📷 فحص جلسة QR وربط الحساب</button>
                        <button class="mt-btn" onclick="App.switchTab('owner_whatsapp')" style="font-weight:700; background:#0284c7; color:#fff; border:none;">📬 فتح سجل وصندوق رسائل الواتساب الصادرة (Outbox & Retry)</button>
                    </div>
                </div>
            </div>

            <!-- PANEL 4: SOVEREIGN BROADCAST DISPATCH -->
            <div id="alert-panel-broadcast" class="owner-alert-panel" style="display:${currentSub === 'broadcast' ? 'block' : 'none'};">
                <div class="mt-card" style="padding:20px; margin-bottom:16px; border-right:4px solid #f59e0b;">
                    <h3 style="margin:0 0 6px; font-size:16px;">📢 إرسال تعميم وإشعارات المنظومة الشاملة</h3>
                    <div style="color:#64748b; font-size:12px; margin-bottom:16px; line-height:1.7;">
                        إرسال تعميم رسمي من مالك النظام لكافة حسابات الإدارة والموزعين عبر قنوات متعددة (إشعار داخل اللوحة، رسائل واتساب، أو تليجرام).
                    </div>

                    <form onsubmit="App.handleOwnerBroadcastSubmit(event)">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-bottom:14px;">
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📌 عنوان التعميم / الإشعار:</label>
                                <input type="text" id="owner-bc-title" class="mt-input" placeholder="مثال: تعميم هام بخصوص أعمال الصيانة والتحديث المجدول" style="width:100%; font-weight:700;" required />
                            </div>
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">👥 الفئة المستهدفة:</label>
                                <select id="owner-bc-audience" class="mt-input" style="width:100%; font-weight:700;" onchange="App.handleBroadcastAudienceChange(this.value)">
                                    <option value="all_admins">👥 كافة مدراء ومسؤولي المنظومة (All Admins)</option>
                                    <option value="network_managers">👔 مدراء الشبكات والفروع فقط (Network Managers)</option>
                                    <option value="distributors">📦 كافة موزعي الكروت (Distributors)</option>
                                    <option value="pos_agents">🛒 نقاط البيع (POS Agents)</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom:14px;">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">💬 نص التعميم والرسالة:</label>
                            <textarea id="owner-bc-message" class="mt-input" rows="4" style="width:100%; line-height:1.6;" placeholder="اكتب نص التعميم هنا بكامل التفاصيل والتعليمات..." required></textarea>
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:16px;">
                            <b style="font-size:12px; color:#0f172a; display:block; margin-bottom:8px;">📡 قنوات الإرسال المعتمدة للتعميم:</b>
                            <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:12px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700;"><input type="checkbox" id="owner-bc-ch-inapp" checked> 🔔 إشعار فوري داخل لوحة التحكم (In-App)</label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700;"><input type="checkbox" id="owner-bc-ch-wa"> 📱 إرسال عبر واتساب (WhatsApp)</label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700;"><input type="checkbox" id="owner-bc-ch-tg"> 🤖 نشر في قناة/بوت تليجرام (Telegram)</label>
                            </div>
                        </div>

                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; font-size:14px; padding:10px 24px;">
                            📢 اعتماد وإرسال التعميم فورياً ✓
                        </button>
                    </form>
                </div>

                <div class="mt-card" style="padding:16px;">
                    <h3 style="margin:0 0 10px; font-size:15px;">📜 سجل التعاميم والرسائل السيادية الصادرة</h3>
                    <div id="owner-broadcast-logs-container">
                        <div style="text-align:center; padding:16px; color:#64748b;">جاري تحميل سجل التعاميم...</div>
                    </div>
                </div>
            </div>
        `;

        const shell = window.SamUI?.PageBuilder?.renderShell;
        view.innerHTML = shell ? shell.call(window.SamUI.PageBuilder, {
            id: 'owner_alerts', archetype: 'dashboard', icon: '🔔', eyebrow: 'SYSTEM OWNER / PLATFORM COMMS',
            title: 'مركز اتصالات وتنبيهات مالك النظام', subtitle: 'إدارة قنوات تليجرام وواتساب المالك، إرسال التعاميم، وتنبيهات المنصة السيادية', content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    App.saveOwnerSystemAlertSettings = async function () {
        const pushEnabled = Boolean(document.getElementById('owner-system-push-enabled')?.checked);
        const result = await this.api('owner_system_notifications_save', {}, 'POST', { push_enabled: pushEnabled });
        if (!result?.success) return this.toast(result?.error || 'تعذر حفظ إعدادات تنبيهات المالك', 'danger');
        this.toast('تم حفظ إعدادات تنبيهات النظام الرئيسي بنجاح', 'success');
        this.renderOwnerSystemAlerts();
    };

    App.saveOwnerTelegramSettings = async function () {
        const payload = {
            enabled: Boolean(document.getElementById('owner-tg-enabled')?.checked),
            bot_token: document.getElementById('owner-tg-token')?.value?.trim() || '',
            chat_id: document.getElementById('owner-tg-chat-id')?.value?.trim() || '',
            notify_backups: Boolean(document.getElementById('owner-tg-notify-backups')?.checked),
            notify_server_alerts: Boolean(document.getElementById('owner-tg-notify-server')?.checked),
            notify_sstp: Boolean(document.getElementById('owner-tg-notify-sstp')?.checked),
            notify_new_network: Boolean(document.getElementById('owner-tg-notify-net')?.checked),
            notify_security: Boolean(document.getElementById('owner-tg-notify-security')?.checked)
        };
        const result = await this.api('owner_system_telegram_save', {}, 'POST', payload);
        if (!result?.success) return this.toast(result?.error || 'تعذر حفظ إعدادات تليجرام', 'danger');
        this.toast(result.message || 'تم حفظ إعدادات بوت تليجرام المالك بنجاح', 'success');
        this.renderOwnerSystemAlerts();
    };

    App.testOwnerTelegram = async function () {
        const chatId = document.getElementById('owner-tg-chat-id')?.value?.trim();
        this.toast('جارٍ فحص وإرسال إشعار تجريبي لبوت تليجرام…', 'info');
        const res = await this.api('owner_system_telegram_test', {}, 'POST', { chat_id: chatId });
        if (res?.success) {
            this.toast('✅ ' + (res.message || 'تم إرسال إشعار تليجرام بنجاح!'), 'success', 5000);
        } else {
            this.toast('❌ ' + (res?.error || 'فشل إرسال إشعار تليجرام'), 'danger', 7000);
        }
    };

    App.saveOwnerWhatsAppSettings = async function () {
        const payload = {
            enabled: Boolean(document.getElementById('owner-wa-enabled')?.checked),
            api_url: document.getElementById('owner-wa-url')?.value?.trim() || 'http://127.0.0.1:3388',
            owner_phone: document.getElementById('owner-wa-phone')?.value?.trim() || '',
            notify_backups: Boolean(document.getElementById('owner-wa-notify-backups')?.checked),
            notify_server_alerts: Boolean(document.getElementById('owner-wa-notify-server')?.checked),
            notify_security: Boolean(document.getElementById('owner-wa-notify-security')?.checked)
        };
        const result = await this.api('owner_system_whatsapp_save', {}, 'POST', payload);
        if (!result?.success) return this.toast(result?.error || 'تعذر حفظ إعدادات واتساب', 'danger');
        this.toast(result.message || 'تم حفظ إعدادات خادم واتساب المالك بنجاح', 'success');
        this.renderOwnerSystemAlerts();
    };

    App.testOwnerWhatsApp = async function () {
        const phone = document.getElementById('owner-wa-phone')?.value?.trim();
        if (!phone) return this.toast('يرجى كتابة رقم هاتف المالك أولاً', 'danger');
        this.toast('جارٍ إرسال رسالة واتساب تجريبية…', 'info');
        const res = await this.api('owner_system_whatsapp_test', {}, 'POST', { phone: phone });
        if (res?.success) {
            this.toast('✅ ' + (res.message || 'تم إرسال رسالة واتساب بنجاح!'), 'success', 5000);
        } else {
            this.toast('❌ ' + (res?.error || 'فشل إرسال واتساب'), 'danger', 7000);
        }
    };

    App.checkOwnerWhatsAppQr = async function () {
        this.toast('جارٍ فحص رمز QR لجلسة واتساب المالك…', 'info');
        const res = await this.api('owner_system_whatsapp_qr');
        if (res?.qr) {
            this.openModal(`
                <div class="mt-modal-header" style="background:#059669; color:#fff; padding:14px 20px;">
                    <b>📱 مسح رمز QR لجلسة واتساب مالك النظام</b>
                    <span onclick="App.closeModal()" style="cursor:pointer; font-size:18px;">✕</span>
                </div>
                <div class="mt-modal-body" style="text-align:center; padding:24px;">
                    <p style="color:#475569; font-size:13px; margin-bottom:16px;">افتح تطبيق WhatsApp على هاتفك > الأجهزة المرتبطة > ربط جهاز، ثم امسح الرمز أدناه:</p>
                    <img src="${this.escape(res.qr)}" alt="WhatsApp QR" style="width:260px; height:260px; border:2px solid #e2e8f0; border-radius:12px; margin:0 auto;" />
                </div>
            `);
        } else {
            this.toast(res?.status === 'CONNECTED' ? '✅ جلسة واتساب المالك متصلة بالفعل!' : (res?.error || 'رمز QR غير متاح حالياً، تحقق من تشغيل خدمة واتساب'), 'info', 5000);
        }
    };

    App.handleOwnerBroadcastSubmit = async function (e) {
        e.preventDefault();
        const title = document.getElementById('owner-bc-title')?.value?.trim();
        const message = document.getElementById('owner-bc-message')?.value?.trim();
        const audience = document.getElementById('owner-bc-audience')?.value;
        const channels = [];
        if (document.getElementById('owner-bc-ch-inapp')?.checked) channels.push('in_app');
        if (document.getElementById('owner-bc-ch-wa')?.checked) channels.push('whatsapp');
        if (document.getElementById('owner-bc-ch-tg')?.checked) channels.push('telegram');

        if (!channels.length) return this.toast('يرجى اختيار قناة إرسال واحدة على الأقل', 'danger');

        if (!confirm(`هل أنت متأكد من رغبتك في إرسال التعميم بعنوان:\n"${title}"\nإلى الفئة المستهدفة عبر القنوات المحددة؟`)) return;

        this.toast('جارٍ اعتماد وإرسال التعميم…', 'info');
        const res = await this.api('owner_system_broadcast_send', {}, 'POST', {
            title, message, target_audience: audience, channels
        });

        if (res?.success) {
            this.toast('✅ ' + (res.message || 'تم إرسال التعميم بنجاح!'), 'success', 6000);
            document.getElementById('owner-bc-title').value = '';
            document.getElementById('owner-bc-message').value = '';
            this.renderOwnerBroadcastLogs();
        } else {
            this.toast('❌ ' + (res?.error || 'فشل إرسال التعميم'), 'danger', 6000);
        }
    };

    App.renderOwnerBroadcastLogs = async function () {
        const host = document.getElementById('owner-broadcast-logs-container');
        if (!host) return;
        const res = await this.api('owner_system_broadcast_logs');
        const logs = Array.isArray(res?.logs) ? res.logs : [];
        if (!logs.length) {
            host.innerHTML = '<div style="text-align:center; padding:18px; color:#64748b; border:1px dashed #cbd5e1; border-radius:8px;">لا توجد تعاميم مرسلة مسجلة حتى الآن.</div>';
            return;
        }
        host.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="mt-table" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>القناة</th>
                            <th>المرسل منه / الشبكة</th>
                            <th>المستلم</th>
                            <th>نص الرسالة</th>
                            <th>الحالة والسبب</th>
                            <th>التاريخ</th>
                            <th style="text-align:center;">إجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map((l, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td><b>${l.channel === 'telegram' ? '🤖 تليجرام' : (l.channel === 'whatsapp' ? '📱 واتساب' : '🔔 النظام')}</b></td>
                            <td><small style="font-family:monospace; color:#334155; font-weight:700;">${this.escape(l.sender_phone || (l.network_name ? '🏢 ' + l.network_name : '👑 السيادي'))}</small></td>
                            <td>${this.escape(l.recipient_name || l.recipient_phone || l.recipient_chat_id || '—')}</td>
                            <td style="max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this.escape(l.message_text || '')}">${this.escape(l.message_text || '')}</td>
                            <td>
                                <span class="mt-badge" style="background:${l.status === 'sent' ? '#dcfce7' : '#fee2e2'}; color:${l.status === 'sent' ? '#166534' : '#991b1b'}; font-weight:700;">
                                    ${l.status === 'sent' ? '✓ تم الإرسال' : '❌ فشل'}
                                </span>
                                ${l.error_message ? `<div style="font-size:10.5px; color:#b91c1c; margin-top:2px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this.escape(l.error_message)}">${this.escape(l.error_message)}</div>` : ''}
                            </td>
                            <td><small>${this.escape(l.created_at || '')}</small></td>
                            <td style="text-align:center;">
                                ${l.status === 'failed' && l.channel === 'whatsapp' ? `
                                <button type="button" class="mt-btn mt-btn-sm" style="padding:2px 8px; font-size:11px; font-weight:700; background:#f59e0b; color:#fff; border:none; border-radius:4px;" onclick="App.retryOwnerWhatsAppLog(${l.id}, this)">
                                    🔄 إعادة الإرسال
                                </button>` : '<span style="color:#94a3b8; font-size:11px;">—</span>'}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    App.markOwnerSystemAlertRead = async function (id) {
        const result = await this.api('owner_system_notification_read', {}, 'POST', { id: Number(id) || 0 });
        if (!result?.success) return this.toast(result?.error || 'تعذر تحديث التنبيه', 'danger');
        this.renderOwnerSystemAlerts();
    };

    App.markAllOwnerSystemAlertsRead = async function () {
        const result = await this.api('owner_system_notifications_read_all', {}, 'POST', {});
        if (!result?.success) return this.toast(result?.error || 'تعذر تحديث التنبيهات', 'danger');
        this.toast('تم تعليم تنبيهات النظام كمقروءة', 'success');
        this.renderOwnerSystemAlerts();
    };

    App.ownerFmt = function (n) {
        n = Number(n) || 0;
        const u = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return n.toFixed(i ? 1 : 0) + ' ' + u[i];
    };

    /* ==========================================================================
       1. SERVER & SYSTEM INFRASTRUCTURE CONSOLE (إعدادات النظام والخادم)
       ========================================================================== */
    App.ownerActiveSubTab = 'services';

    App.switchOwnerSubTab = function (tab) {
        this.ownerActiveSubTab = tab;
        document.querySelectorAll('.owner-subtab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-subtab') === tab);
        });
        document.querySelectorAll('.owner-subtab-panel').forEach(p => {
            p.style.display = (p.id === 'subtab-panel-' + tab) ? 'block' : 'none';
        });
        if (tab === 'jobs') this.loadOwnerJobs();
        if (tab === 'firewall') this.loadOwnerFirewall();
        if (tab === 'logs') this.loadOwnerLogs();
    };

    App.renderSystemOwnerConsole = async function () {
        const r = await this.api('owner_system_get');
        if (!r || !r.success) return;
        const s = r.settings, x = r.resources;

        const currentSub = this.ownerActiveSubTab || 'services';

        const PB = window.SamUI?.PageBuilder;
        const actions = [
            { label: '🔄 فحص وإعادة بناء التشغيل', variant: 'warning', onclick: 'App.ownerMaintenanceRebuild()', title: 'فحص التكوين وإعادة تشغيل الخدمات' },
            { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderSystemOwnerConsole()' }
        ];

        const innerContent = `
            <div class="mt-card owner-console">
                <div class="owner-console-head">
                    <div>
                        <h2>🛡️ مركز إدارة وصحة النظام وخوادم التشغيل</h2>
                        <small style="opacity:0.85;font-size:12px;">لوحة التشخيص المتقدم والتحكم الشامل بالخدمات والأمان</small>
                    </div>
                    <span class="status-pill status-danger">مالك النظام فقط (ID #1)</span>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card"><b>CPU المعالج</b><small>${this.escape(x.cpu || '-')}</small><strong>Load ${Number(x.load?.[0] || 0).toFixed(2)}</strong></div>
                    <div class="kpi-card"><b>الذاكرة المتاحة (RAM)</b><strong>${this.ownerFmt(x.memory_available)} / ${this.ownerFmt(x.memory_total)}</strong></div>
                    <div class="kpi-card"><b>القرص المتاح (Storage)</b><strong>${this.ownerFmt(x.disk_free)} / ${this.ownerFmt(x.disk_total)}</strong></div>
                    <div class="kpi-card"><b>وقت التشغيل المتواصل</b><strong>${this.escape(x.uptime || '-')}</strong></div>
                </div>

                <!-- Owner Console Subtabs -->
                <div class="owner-subtabs">
                    <button class="owner-subtab-btn ${currentSub === 'services' ? 'active' : ''}" data-subtab="services" onclick="App.switchOwnerSubTab('services')">
                        <span>🖥️</span> خدمات وتشغيل الخادم
                    </button>
                    <button class="owner-subtab-btn ${currentSub === 'jobs' ? 'active' : ''}" data-subtab="jobs" onclick="App.switchOwnerSubTab('jobs')">
                        <span>⚙️</span> مهام الخلفية والـ API
                    </button>
                    <button class="owner-subtab-btn" data-subtab="firewall" onclick="App.switchTab('owner_firewall')" style="border-color:#38bdf8; background:#f0f9ff; color:#0369a1; font-weight:700;">
                        <span>🛡️</span> جدار الحماية المستقل ↗
                    </button>
                    <button class="owner-subtab-btn ${currentSub === 'logs' ? 'active' : ''}" data-subtab="logs" onclick="App.switchOwnerSubTab('logs')">
                        <span>📜</span> عارض السجلات والصيانة
                    </button>
                </div>

                <!-- SUBTAB 1: SERVICES & INFRASTRUCTURE -->
                <div id="subtab-panel-services" class="owner-subtab-panel" style="display:${currentSub === 'services' ? 'block' : 'none'}">
                    <div class="owner-sections">
                        <section class="owner-section owner-section-services">
                            <h3>⚙️ خدمات النظام الأساسية ومراقبة التشغيل</h3>
                            <div class="mt-table-container">
                                <table class="mt-table">
                                    <thead><tr><th>الخدمة</th><th>الحالة الحالية</th><th>الذاكرة المستهلكة</th><th>إجراءات التحكم السريع</th></tr></thead>
                                    <tbody>${r.services.map(v => `
                                        <tr>
                                            <td><b>${this.escape(v.label)}</b><small style="display:block;color:var(--text-muted)">${v.unit}</small></td>
                                            <td><span class="status-pill ${v.state === 'active' ? 'status-online' : 'status-disabled'}">${v.state === 'active' ? '🟢 شغال ونشط' : '🔴 متوقف (' + v.state + ')'}</span></td>
                                            <td><b>${v.memory_bytes ? this.ownerFmt(v.memory_bytes) : '-'}</b></td>
                                            <td class="owner-service-actions">
                                                <button class="mt-btn" onclick="App.ownerService('${v.unit}','restart')">🔄 إعادة تشغيل</button>
                                                ${v.unit !== 'apache2' ? `
                                                    <button class="mt-btn mt-btn-success" onclick="App.ownerService('${v.unit}','start')">▶️ تشغيل</button>
                                                    <button class="mt-btn mt-btn-danger" onclick="App.ownerService('${v.unit}','stop')">⏹️ إيقاف</button>
                                                ` : ''}
                                            </td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section class="owner-section owner-section-ports">
                            <h3>🔌 منافذ الخادم النشطة وتغيير منفذ الويب</h3>
                            <p class="owner-port-list">المنافذ المستمعة حالياً: <code>${(x.listening_ports || []).join(', ')}</code></p>
                            <div class="form-row" style="margin-top:10px;">
                                <div class="form-group"><label>المنفذ الجديد (1024 - 65535)</label><input id="own-port" class="mt-input" type="number" min="1024" max="65535" value="${s.app_port}"></div>
                                <div class="form-group"><label>عبارة التأكيد</label><input id="own-port-confirm" class="mt-input" placeholder="اكتب: تغيير المنفذ"></div>
                                <button class="mt-btn mt-btn-warning" onclick="App.changeOwnerPort()">تغيير منفذ النظام</button>
                            </div>
                        </section>

                        <section class="owner-section">
                            <h3>📦 صورة المصنع النظيفة والنسخ الوقائي</h3>
                            <p>حالة صورة المصنع النظيفة: <b>${r.factory?.exists ? 'جاهزة ومحفوظة — ' + this.ownerFmt(r.factory.size) : 'غير منشأة بعد'}</b> <small style="display:block;color:var(--text-muted);margin-top:4px">${r.factory?.created_at || ''}</small></p>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                                <button class="mt-btn mt-btn-primary" onclick="App.ownerBuildFactory()">📦 إنشاء / تحديث صورة المصنع</button>
                                <button class="mt-btn mt-btn-warning" onclick="App.ownerMaintenanceRebuild()">🔧 فحص وإعادة بناء تكوين الخدمات</button>
                                <button class="mt-btn" onclick="App.switchTab('backups')">💾 إدارة النسخ الاحتياطية</button>
                            </div>
                        </section>

                        <section class="owner-section">
                            <h3>🌐 الدومين العام ووضع الصيانة</h3>
                            <div class="form-group"><label>الدومين العام للنظام</label><input id="own-domain" class="mt-input" dir="ltr" value="${this.escape(s.public_domain)}"></div>
                            <div style="margin:12px 0;"><label style="display:flex;align-items:center;gap:8px;font-weight:bold;cursor:pointer;"><input id="own-maint" type="checkbox" ${s.maintenance_mode ? 'checked' : ''}> <span>وضع الصيانة (حظر الدخول لغير مالك النظام)</span></label></div>
                            <button class="mt-btn mt-btn-success" onclick="App.saveOwnerSystemServer()">💾 حفظ إعدادات الاتصال والصيانة</button>
                        </section>

                        <section class="owner-section owner-section-danger">
                            <h3 style="color:#b91c1c">⚠️ منطقة الصيانة وإعادة التهيئة الحساسة</h3>
                            <p style="font-size:12.5px;line-height:1.6;color:#7f1d1d;">استعادة الواجهات لا تحذف الفواتير أو الحسابات أو الكروت. تصفير الحسابات عملية مالية مستقلة للمحاسبة. إعادة المصنع تحذف جميع بيانات التشغيل بعد أخذ نسخة احتياطية كاملة فورية.</p>
                            <div class="owner-actions" style="margin-top:12px;">
                                <button class="mt-btn mt-btn-warning" onclick="App.ownerResetUi()">🎨 استعادة إعدادات الواجهات الافتراضية</button>
                                <button class="mt-btn mt-btn-danger" onclick="App.ownerResetFinancial()">💵 تصفير الحسابات المالية</button>
                                <button class="mt-btn mt-btn-danger" style="background:#991b1b;color:#fff;" onclick="App.ownerFactoryReset()">🏭 إعادة المصنع الكاملة للبيانات</button>
                            </div>
                        </section>
                    </div>
                </div>

                <!-- SUBTAB 2: BACKGROUND JOBS QUEUE -->
                <div id="subtab-panel-jobs" class="owner-subtab-panel" style="display:${currentSub === 'jobs' ? 'block' : 'none'}">
                    <div class="owner-section" style="margin-bottom:16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
                            <div>
                                <h3 style="margin:0;">⚙️ طابور مهام الخلفية وعامل الـ API (Worker Jobs)</h3>
                                <small style="color:var(--text-muted)">متابعة ومعالجة مهام التصدير والنسخ والمزامنة التلقائية</small>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="mt-btn" onclick="App.loadOwnerJobs()">🔄 تحديث الطابور</button>
                                <button class="mt-btn mt-btn-warning" onclick="App.purgeOwnerJobs('completed_failed')">🧹 تنظيف المنتهية</button>
                            </div>
                        </div>
                        <div id="owner-jobs-stats" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;margin-bottom:14px;">
                            <!-- Stats injected here -->
                        </div>
                        <div class="mt-table-container">
                            <table class="mt-table">
                                <thead>
                                    <tr>
                                        <th>معرف المهمة</th>
                                        <th>نوع المهمة</th>
                                        <th>التقدم</th>
                                        <th>الحالة</th>
                                        <th>المنشئ</th>
                                        <th>تاريخ الإنشاء</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody id="owner-jobs-tbody">
                                    <tr><td colspan="7" style="text-align:center;padding:24px;">جاري تحميل المهام...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- SUBTAB 3: FIREWALL & SECURITY -->
                <div id="subtab-panel-firewall" class="owner-subtab-panel" style="display:${currentSub === 'firewall' ? 'block' : 'none'}">
                    <div class="owner-section">
                        <div id="owner-firewall-content">
                            <div style="text-align:center;padding:24px;">جاري فحص حالة الجدار الناري...</div>
                        </div>
                    </div>
                </div>

                <!-- SUBTAB 4: LOGS & CLEANUP -->
                <div id="subtab-panel-logs" class="owner-subtab-panel" style="display:${currentSub === 'logs' ? 'block' : 'none'}">
                    <div class="cleanup-banner" style="margin-bottom:16px;">
                        <div>
                            <h4 style="margin:0 0 4px;font-size:16px;color:#065f46;">🧹 الصيانة والتنظيف الوقائي السريع بنقرة واحدة</h4>
                            <p style="margin:0;font-size:12.5px;color:#047857;">حذف الملفات المؤقتة القديمة في /tmp، وتطهير مجلد التصدير المؤقت، وإغلاق الجلسات المعلقة القديمة في قاعدة البيانات.</p>
                        </div>
                        <button class="mt-btn mt-btn-success" style="white-space:nowrap;" onclick="App.runOwnerCleanup()">✨ بدء دورة التنظيف الفوري</button>
                    </div>

                    <div class="owner-terminal-window">
                        <div class="owner-terminal-header">
                            <div class="owner-terminal-dots">
                                <div class="terminal-dot dot-red"></div>
                                <div class="terminal-dot dot-yellow"></div>
                                <div class="terminal-dot dot-green"></div>
                                <span style="font-family:monospace;font-size:12px;color:#94a3b8;margin-right:8px;">Live System Logs Viewer</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <select id="owner-log-target" class="mt-input" style="padding:4px 8px;height:32px;font-size:12px;background:#1e293b;color:#fff;border-color:#334155;" onchange="App.loadOwnerLogs()">
                                    <option value="worker">⚙️ سجل عامل الـ API (Worker)</option>
                                    <option value="telemetry">📡 سجل البث اللحظي (Telemetry)</option>
                                    <option value="whatsapp">💬 سجل بوابة الواتساب (WhatsApp)</option>
                                    <option value="accel-ppp">🚇 سجل نفق الراوترات (SSTP accel-ppp)</option>
                                    <option value="freeradius">🔑 سجل خادم FreeRADIUS</option>
                                    <option value="apache-error">🌐 سجل أخطاء أباتشي (Apache Error)</option>
                                    <option value="maintenance">🛠️ سجل الصيانة الدورية (Cron)</option>
                                    <option value="ssh">🔒 سجل اتصالات SSH</option>
                                </select>
                                <select id="owner-log-lines" class="mt-input" style="padding:4px 8px;height:32px;font-size:12px;background:#1e293b;color:#fff;border-color:#334155;width:85px;" onchange="App.loadOwnerLogs()">
                                    <option value="25">25 سطر</option>
                                    <option value="50" selected>50 سطر</option>
                                    <option value="100">100 سطر</option>
                                    <option value="200">200 سطر</option>
                                </select>
                                <button class="mt-btn" style="padding:4px 10px;font-size:12px;" onclick="App.loadOwnerLogs()">🔄 تحديث</button>
                            </div>
                        </div>
                        <pre id="owner-terminal-pre" class="owner-terminal-body">جاري جلب السجلات...</pre>
                    </div>
                </div>
            </div>`;

        if (PB && typeof PB.renderShell === 'function') {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'system_settings',
                archetype: 'designer',
                eyebrow: 'SYSTEM / OWNER CONSOLE',
                title: 'مركز إدارة وصحة النظام وخوادم التشغيل',
                subtitle: 'لوحة التشخيص المتقدم والتحكم الشامل بالخدمات والأنفاق وجدار الحماية (مالك النظام)',
                icon: '🛡️',
                actions: actions,
                content: innerContent
            });
        } else {
            document.getElementById('main-view').innerHTML = innerContent;
        }
    };

    /* ─── Background Jobs Queue Logic ─── */
    App.loadOwnerJobs = async function () {
        const r = await this.api('owner_system_jobs');
        const tbody = document.getElementById('owner-jobs-tbody');
        const statsEl = document.getElementById('owner-jobs-stats');
        if (!tbody || !r || !r.success) return;

        const s = r.stats || {};
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="kpi-card" style="padding:10px;min-height:auto;"><b>إجمالي المهام</b><strong>${s.total || 0}</strong></div>
                <div class="kpi-card" style="padding:10px;min-height:auto;"><b style="color:#d97706">معلقة</b><strong>${s.queued || 0}</strong></div>
                <div class="kpi-card" style="padding:10px;min-height:auto;"><b style="color:#0284c7">قيد التنفيذ</b><strong>${s.running || 0}</strong></div>
                <div class="kpi-card" style="padding:10px;min-height:auto;"><b style="color:#16a34a">مكتملة</b><strong>${s.completed || 0}</strong></div>
                <div class="kpi-card" style="padding:10px;min-height:auto;"><b style="color:#dc2626">فاشلة</b><strong>${s.failed || 0}</strong></div>
            `;
        }

        if (!r.jobs || !r.jobs.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">لا توجد مهام مسجلة في الطابور حالياً.</td></tr>';
            return;
        }

        const typeLabels = {
            'export_users_csv': 'تصدير مستخدمين (CSV)',
            'export_users_pdf': 'تصدير مستخدمين (PDF)',
            'database_backup': 'نسخ احتياطي لقاعدة البيانات',
            'router_backup': 'نسخ احتياطي لراوتر'
        };

        tbody.innerHTML = r.jobs.map(j => {
            const label = typeLabels[j.type] || j.type;
            const progress = Number(j.progress || 0);
            const statusClass = 'status-' + j.status;
            let statusText = j.status;
            if (j.status === 'queued') statusText = '⏳ معلق';
            else if (j.status === 'running') statusText = '🚀 جاري التشغيل';
            else if (j.status === 'completed') statusText = '✅ مكتمل';
            else if (j.status === 'failed') statusText = '❌ فشل';

            let resultHtml = '';
            if (j.status === 'completed' && j.result?.download_url) {
                resultHtml = `<a href="${j.result.download_url}" target="_blank" class="mt-btn mt-btn-success" style="padding:3px 8px;font-size:11.5px;">📥 تحميل</a>`;
            } else if (j.status === 'failed') {
                resultHtml = `
                    <button class="mt-btn mt-btn-warning" style="padding:3px 8px;font-size:11.5px;" onclick="App.retryOwnerJob('${j.id}')">🔁 إعادة</button>
                    ${j.error_message ? `<small style="display:block;color:#dc2626;margin-top:4px;" title="${this.escape(j.error_message)}">${this.escape(j.error_message.slice(0, 35))}...</small>` : ''}
                `;
            }

            return `
                <tr>
                    <td><code>${j.id.slice(0, 8)}...</code></td>
                    <td><b>${this.escape(label)}</b></td>
                    <td>
                        <div class="job-progress-container">
                            <div class="job-progress-bar" style="width:${progress}%"></div>
                            <span class="job-progress-text">${progress}%</span>
                        </div>
                    </td>
                    <td><span class="status-pill ${statusClass}">${statusText}</span></td>
                    <td>${this.escape(j.owner_fullname || j.owner_username || 'نظام')}</td>
                    <td><small style="color:var(--text-muted)">${j.created_at || '-'}</small></td>
                    <td style="display:flex;gap:4px;align-items:center;">
                        ${resultHtml}
                        <button class="mt-btn mt-btn-danger" style="padding:3px 6px;font-size:11px;" onclick="App.purgeOwnerJobs('single', '${j.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    App.retryOwnerJob = async function (jobId) {
        const r = await this.api('owner_system_job_retry', {}, 'POST', { job_id: jobId });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerJobs();
    };

    App.purgeOwnerJobs = async function (mode, jobId) {
        if (mode === 'completed_failed') {
            if (!confirm('هل أنت متأكد من تنظيف كافة المهام المنتهية والفاشلة؟')) return;
        }
        const r = await this.api('owner_system_job_purge', {}, 'POST', { mode, job_id: jobId });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerJobs();
    };

    /* ─── Dynamic Firewall, Port Forwarding & GeoIP Manager ─── */
    App.ownerFirewallData = null;
    App.ownerPortForwardData = null;
    App.ownerGeoRulesData = null;
    App.ownerFirewallFilter = App.ownerFirewallFilter || 'all';

    App.ownerFirewallData = null;
    App.ownerPortForwardData = null;
    App.ownerGeoRulesData = null;
    App.ownerFirewallFilter = App.ownerFirewallFilter || 'all';
    App.ownerMatrixSearch = '';

    App.loadOwnerFirewall = async function () {
        const container = document.getElementById('owner-firewall-content');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">جاري جلب مصفوفة الحماية الموحدة وقواعد الأسبقية الجغرافية والمؤسسية...</div>';

        const [fwRes, pfRes, geoRes] = await Promise.all([
            this.api('owner_system_firewall'),
            this.api('owner_system_port_forwarding'),
            this.api('owner_system_geo_rules')
        ]);

        if (!fwRes || !fwRes.success) {
            container.innerHTML = '<div style="color:#dc2626;padding:16px;">تعذر فحص حالة الجدار الناري.</div>';
            return;
        }

        this.ownerFirewallData = fwRes;
        this.ownerPortForwardData = pfRes?.success ? pfRes : null;
        this.ownerGeoRulesData = geoRes?.success ? geoRes : null;

        const isActive = Boolean(fwRes.active);
        const ipv6Enabled = Boolean(fwRes.ipv6_enabled);
        const rules = fwRes.rules || [];
        const ports = fwRes.default_ports || [];
        const forwards = pfRes?.forwards || [];
        const pfRouters = pfRes?.routers || [];
        const geoRules = geoRes?.rules || [];
        const currentFilter = this.ownerFirewallFilter || 'all';

        const highPrioCount = geoRules.filter(r => r.priority === 'high' && Number(r.is_enabled) === 1).length;
        const activeGeoCount = geoRules.filter(r => Number(r.is_enabled) === 1).length;

        container.innerHTML = `
            <!-- Top Status Banner -->
            <div class="firewall-banner ${isActive ? 'active' : 'inactive'}">
                <div>
                    <h3 style="margin:0 0 6px;color:inherit;">حالة الجدار الناري والنواة: <b>${isActive ? '🟢 نشط ومحمي (Kernel IPSet + UFW Active)' : '🔴 غير مفعّل (معطل)'}</b></h3>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:6px;flex-wrap:wrap;">
                        <span style="font-size:13px;opacity:0.95;">
                            بروتوكول IPv6: <b>${ipv6Enabled ? '🟢 مفعّل' : '⚪ معطّل'}</b>
                        </span>
                        <button class="mt-btn" style="background:rgba(255,255,255,0.92);color:#0f172a;padding:3px 10px;font-size:11.5px;font-weight:700;border:1px solid rgba(0,0,0,0.1);" onclick="App.toggleOwnerFirewallIpv6(${!ipv6Enabled})">
                            ${ipv6Enabled ? '🚫 تعطيل حركة IPv6' : '⚡ تفعيل حركة IPv6'}
                        </button>
                        <span style="font-size:12.5px;opacity:0.9;">
                            🛡️ قواعد الأولوية القصوى (صدارة السيرفر): <b>${highPrioCount} قاعدة نافذة</b>
                        </span>
                        <span style="font-size:12.5px;opacity:0.9;">
                            📊 إجمالي السياسات النشطة: <b>${activeGeoCount} قاعدة</b>
                        </span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <button class="mt-btn" style="background:#fff;color:#0f172a;font-weight:700;" onclick="App.applyOwnerFirewallDefaults()">⚡ تطبيق القواعد الموصى بها</button>
                    <button class="mt-btn ${isActive ? 'mt-btn-danger' : 'mt-btn-success'}" style="font-weight:800;font-size:14px;padding:9px 18px;" onclick="App.toggleOwnerFirewall(${!isActive})">
                        ${isActive ? '⏹️ تعطيل الجدار الناري' : '🛡️ تفعيل الجدار الناري الآن'}
                    </button>
                    <button class="mt-btn" onclick="App.loadOwnerFirewall()">🔄 تحديث شامل</button>
                </div>
            </div>

            <!-- SECTION 2: UNIFIED POLICY MATRIX (مصفوفة القواعد والسياسات الموحدة بالأسبقية) -->
            <div class="geo-rules-section">
                <div class="geo-rules-header" style="flex-wrap:wrap;gap:12px;">
                    <div>
                        <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;">
                            <span>📋</span> مصفوفة القواعد وسياسات الحماية الموحدة بالأسبقية (Unified Policy Matrix)
                        </h3>
                        <p style="margin:0;font-size:12.5px;color:var(--text-muted);">
                            دمج قواعد الحماية الجغرافية والمؤسسية (GeoIP & ASN) مع قواعد المنافذ الحساسة وشبكات الأنفاق، مرتبة بالأسبقية التشغيلية مع إمكانية التعديل الفوري.
                        </p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input id="fw-matrix-search" class="mt-input" style="max-width:200px;font-size:12px;padding:6px 12px;" placeholder="🔍 بحث سريع في القواعد..." oninput="App.onMatrixSearch(this.value)">
                        <button class="mt-btn mt-btn-primary" style="font-weight:700;" onclick="App.openGeoRuleModal()">
                            ➕ إضافة قاعدة جديدة
                        </button>
                    </div>
                </div>

                <!-- Filter Tabs -->
                <div style="padding:10px 16px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #f1f5f9;">
                    <div class="fw-filter-tabs">
                        <button class="fw-filter-tab ${currentFilter === 'all' ? 'active' : ''}" onclick="App.setFwFilter('all')">
                            🌐 كافة السياسات (${geoRules.length})
                        </button>
                        <button class="fw-filter-tab ${currentFilter === 'high' ? 'active' : ''}" onclick="App.setFwFilter('high')">
                            🔴 أولوية قصوى (${highPrioCount})
                        </button>
                        <button class="fw-filter-tab ${currentFilter === 'geo' ? 'active' : ''}" onclick="App.setFwFilter('geo')">
                            🌍 دول ومزودين (${geoRules.filter(r => r.rule_type === 'country' || r.rule_type === 'asn').length})
                        </button>
                        <button class="fw-filter-tab ${currentFilter === 'ports' ? 'active' : ''}" onclick="App.setFwFilter('ports')">
                            🔌 حماية المنافذ (${geoRules.filter(r => r.port !== 'all').length})
                        </button>
                        <button class="fw-filter-tab ${currentFilter === 'local' ? 'active' : ''}" onclick="App.setFwFilter('local')">
                            🏠 شبكات محلية (${geoRules.filter(r => r.rule_type === 'local').length})
                        </button>
                        <button class="fw-filter-tab ${currentFilter === 'deny' ? 'active' : ''}" onclick="App.setFwFilter('deny')">
                            ⛔ قواعد الحظر (${geoRules.filter(r => r.action === 'deny').length})
                        </button>
                    </div>
                </div>

                <!-- Unified Policy Table -->
                <div class="mt-table-container">
                    <table class="mt-table" id="unified-policy-table">
                        <thead>
                            <tr>
                                <th style="width:45px;">#</th>
                                <th>الأسبقية</th>
                                <th>الهدف المستهدف</th>
                                <th>نوع القاعدة</th>
                                <th>الإجراء</th>
                                <th>المنفذ / البروتوكول</th>
                                <th>النسخة</th>
                                <th>الوصف والملاحظة</th>
                                <th>الحالة</th>
                                <th style="width:160px;text-align:center;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderUnifiedPolicyRows(geoRules, currentFilter)}
                        </tbody>
                    </table>
                </div>

                ${geoRes?.kernel_status ? `
                    <div style="margin:12px 16px;">
                        <details style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;">
                            <summary style="font-size:12px;font-weight:700;color:var(--text-muted);cursor:pointer;">عرض تفاصيل سلاسل الـ Kernel ومجموعات IPSet النشطة</summary>
                            <pre style="margin:8px 0 0;font-family:monospace;font-size:11px;direction:ltr;background:#0f172a;color:#38bdf8;padding:10px;border-radius:6px;overflow-x:auto;">${this.escape(geoRes.kernel_status)}</pre>
                        </details>
                    </div>
                ` : ''}
            </div>

            <!-- SECTION 3: GEOIP & ASN THREAT INTELLIGENCE -->
            <div class="geoip-section" style="margin-top:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
                    <div>
                        <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;">
                            <span>🌍</span> فاحص العناوين والتعرف الجغرافي للـ IP (GeoIP & ASN Inspector)
                        </h3>
                        <p style="margin:0;font-size:12.5px;color:var(--text-muted);">
                            كشف الدولة والعلم ومزود الخدمة والـ ASN لأي عنوان IP محلي أو عالمي مدمج بقاعدة بيانات ملايين السجلات.
                        </p>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="quick-chip-btn" onclick="App.quickTestGeoIp('5.100.160.1')">🇾🇪 فحص IP يمن نت</button>
                        <button class="quick-chip-btn" onclick="App.quickTestGeoIp('8.8.8.8')">🇺🇸 فحص Google</button>
                        <button class="quick-chip-btn" onclick="App.quickTestGeoIp('1.1.1.1')">🇦🇺 فحص Cloudflare</button>
                        <button class="quick-chip-btn" onclick="App.quickTestGeoIp('192.168.3.1')">🏠 فحص IP محلي</button>
                    </div>
                </div>

                <div class="geoip-search-row">
                    <input id="geoip-input-ip" class="mt-input" style="max-width:320px;font-weight:700;font-family:monospace;font-size:14px;" placeholder="أدخل عنوان IP للفحص (مثال: 5.100.160.1)" dir="ltr">
                    <button class="mt-btn mt-btn-primary" style="font-weight:800;padding:8px 18px;" onclick="App.lookupOwnerGeoIp()">
                        🔍 فحص وتحليل المصدر
                    </button>
                </div>

                <div id="geoip-result-box" style="display:none;"></div>
            </div>

            <!-- SECTION 4: PORT FORWARDING & NAT -->
            <div class="port-forward-section" style="margin-top:20px;">
                <div class="port-forward-header">
                    <div>
                        <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px;">
                            <span>🔀</span> توجيه المنافذ والتحويل الداخلي (Port Forwarding & NAT)
                        </h3>
                        <p style="margin:0;font-size:12.5px;color:var(--text-muted);">
                            توجيه المنافذ الخارجية للخادم إلى راوترات الميكروتك في نفق SSTP، أو الكاميرات، أو الأجهزة والخوادم الداخلية.
                        </p>
                    </div>
                    <button class="mt-btn mt-btn-primary" style="font-weight:700;" onclick="App.togglePfForm()">
                        ➕ إضافة توجيه جديد
                    </button>
                </div>

                <!-- Add Forward Form (Collapsible) -->
                <div id="pf-form-card" style="display:none;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:16px;margin-bottom:16px;">
                    <h4 style="margin:0 0 12px;font-size:14px;color:#1e293b;">إعداد قاعدة توجيه منفذ جديدة</h4>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">المنفذ الخارجي (Listen Port)</label>
                            <input id="pf-listen-port" class="mt-input" type="number" min="1" max="65535" placeholder="مثال: 8291" dir="ltr">
                            <small style="color:var(--text-muted);font-size:11px;">المنفذ المستمع في هذا السيرفر</small>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">البروتوكول</label>
                            <select id="pf-proto" class="mt-input">
                                <option value="tcp" selected>TCP (معظم الخدمات والويب)</option>
                                <option value="udp">UDP</option>
                                <option value="both">TCP + UDP (كلاهما)</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">الراوتر الهدف (Target Router)</label>
                            <select id="pf-router-id" class="mt-input" onchange="App.onPfRouterChange(this.value)">
                                <option value="" selected>-- اختر الراوتر الهدف --</option>
                                ${pfRouters.map(r => `
                                    <option value="${r.id}" data-ip="${this.escape(r.nasname)}">${this.escape(r.shortname || r.nasname)} (${this.escape(r.nasname)}) ${r.network_name ? '· ' + this.escape(r.network_name) : ''}</option>
                                `).join('')}
                            </select>
                            <small style="color:var(--text-muted);font-size:11px;">اختر الراوتر الموصل بالنفق</small>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">الـ IP الداخلي الهدف (Target IP)</label>
                            <input id="pf-target-ip" class="mt-input" type="text" placeholder="يتم تحديده تلقائياً من الراوتر" dir="ltr" readonly style="background:#f1f5f9;">
                            <small style="color:var(--text-muted);font-size:11px;">عنوان الـ IP بالنفق تلقائياً</small>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">المنفذ الداخلي الهدف (Target Port)</label>
                            <input id="pf-target-port" class="mt-input" type="number" min="1" max="65535" placeholder="مثال: 8291" dir="ltr">
                            <small style="color:var(--text-muted);font-size:11px;">منفذ الخدمة في الجهاز الهدف</small>
                        </div>
                    </div>
                    <div style="margin-top:12px;display:flex;gap:10px;align-items:flex-end;">
                        <div class="form-group" style="margin:0;flex:1;">
                            <label style="font-size:12px;font-weight:700;">الوصف أو اسم الجهاز</label>
                            <input id="pf-comment" class="mt-input" placeholder="مثال: ونبوكس راوتر الفرع الرئيسي (Winbox Router 1)">
                        </div>
                        <button class="mt-btn mt-btn-success" style="font-weight:800;white-space:nowrap;padding:9px 18px;" onclick="App.saveOwnerPortForwarding(this)">
                            💾 حفظ وتطبيق التوجيه
                        </button>
                        <button class="mt-btn" style="white-space:nowrap;" onclick="App.togglePfForm(false)">إلغاء</button>
                    </div>
                </div>

                <!-- Forwards Table -->
                <div class="mt-table-container">
                    <table class="mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>مسار التوجيه (من -> إلى)</th>
                                <th>البروتوكول</th>
                                <th>الوصف</th>
                                <th>الحالة</th>
                                <th>تاريخ الإضافة</th>
                                <th style="width:130px;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${forwards.length === 0 ? `
                                <tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">لا توجد توجيهات منافذ مسجلة حالياً. اضغط "إضافة توجيه جديد" لربط منفذ خارجي بجهاز أو راوتر داخلي.</td></tr>
                            ` : forwards.map(pf => {
                                const isEn = Number(pf.is_enabled) === 1;
                                return `
                                    <tr>
                                        <td><b>#${pf.id}</b></td>
                                        <td>
                                            <div class="port-forward-flow">
                                                <span class="pf-listen">:${pf.listen_port}</span>
                                                <span class="pf-arrow">➔</span>
                                                <span class="pf-target">${this.escape(pf.target_ip)}:${pf.target_port}</span>
                                            </div>
                                        </td>
                                        <td><span class="status-pill status-info" style="font-size:11px;font-weight:700;">${this.escape(pf.protocol).toUpperCase()}</span></td>
                                        <td><b>${this.escape(pf.comment || '-')}</b></td>
                                        <td>
                                            <span class="status-pill ${isEn ? 'status-online' : 'status-disabled'}" style="cursor:pointer;" onclick="App.toggleOwnerPortForwarding(${pf.id}, ${!isEn}, ${pf.listen_port}, '${this.escape(pf.target_ip)}', ${pf.target_port})">
                                                ${isEn ? '🟢 مفعّل' : '⚪ معطّل'}
                                            </span>
                                        </td>
                                        <td><small style="color:var(--text-muted)">${pf.created_at || '-'}</small></td>
                                        <td style="display:flex;gap:6px;align-items:center;">
                                            <button class="mt-btn ${isEn ? 'mt-btn-warning' : 'mt-btn-success'}" style="padding:4px 8px;font-size:11px;font-weight:700;" onclick="App.toggleOwnerPortForwarding(${pf.id}, ${!isEn}, ${pf.listen_port}, '${this.escape(pf.target_ip)}', ${pf.target_port})">
                                                ${isEn ? 'إيقاف' : 'تشغيل'}
                                            </button>
                                            <button class="mt-btn mt-btn-danger" style="padding:4px 8px;font-size:11px;font-weight:700;" onclick="App.deleteOwnerPortForwarding(${pf.id}, ${pf.listen_port}, '${this.escape(pf.target_ip)}', ${pf.target_port})">
                                                🗑️ حذف
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- SECTION 5: REFERENCE PORTS GUIDE -->
            <div style="margin-top:20px;">
                <details style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                    <summary style="font-weight:700;cursor:pointer;color:var(--text-muted);">🔌 الدليل الاسترشادي لمنافذ خدمات منظومة SAM الأساسية</summary>
                    <div class="ports-chips-grid" style="margin-top:12px;">
                        ${ports.map(p => `
                            <div class="port-chip">
                                <div>
                                    <code>${p.port}</code>
                                    <small style="display:block;color:var(--text-muted);margin-top:2px;">${p.label}</small>
                                </div>
                                <span class="status-pill status-online" style="font-size:10px;">مرجعي</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>
        `;
    };

    App.renderUnifiedPolicyRows = function (geoRules, filter) {
        let list = geoRules || [];
        const search = (this.ownerMatrixSearch || '').toLowerCase().trim();

        if (filter === 'high') list = list.filter(r => r.priority === 'high');
        else if (filter === 'geo') list = list.filter(r => r.rule_type === 'country' || r.rule_type === 'asn');
        else if (filter === 'ports') list = list.filter(r => r.port !== 'all');
        else if (filter === 'local') list = list.filter(r => r.rule_type === 'local');
        else if (filter === 'deny') list = list.filter(r => r.action === 'deny');

        if (search) {
            list = list.filter(r => 
                (r.target_label || '').toLowerCase().includes(search) ||
                (r.target_value || '').toLowerCase().includes(search) ||
                (r.port || '').toLowerCase().includes(search) ||
                (r.comment || '').toLowerCase().includes(search) ||
                (r.rule_type || '').toLowerCase().includes(search)
            );
        }

        if (list.length === 0) {
            return `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted)">لا توجد قواعد مطابقة للفلتر أو البحث المحدد. يمكنك الضغط على "إضافة قاعدة جديدة" للبدء.</td></tr>`;
        }

        // Sort by Priority (High first), then ID desc
        list.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return b.id - a.id;
        });

        return list.map(gr => {
            const isEn = Number(gr.is_enabled) === 1;
            const isDeny = gr.action === 'deny';
            const isHigh = gr.priority === 'high';
            const typeLabel = {
                country: '🇾🇪 دولة',
                asn: '🏢 مزود ASN',
                local: '🏠 محلي/نفق',
                custom: '🎯 نطاق CIDR'
            }[gr.rule_type] || gr.rule_type.toUpperCase();

            return `
                <tr>
                    <td><b>#${gr.id}</b></td>
                    <td>
                        <span class="priority-tag-${isHigh ? 'high' : 'norm'}">
                            ${isHigh ? '🔴 قصوى (صدارة)' : '🟡 عادية'}
                        </span>
                    </td>
                    <td>
                        <b>${this.escape(gr.target_label || gr.target_value)}</b>
                        ${gr.target_value && gr.target_value !== gr.target_label ? `<small style="display:block;color:#64748b;font-family:monospace;">${this.escape(gr.target_value)}</small>` : ''}
                    </td>
                    <td><span class="status-pill status-info" style="font-size:10.5px;">${typeLabel}</span></td>
                    <td><span class="status-pill ${isDeny ? 'badge-deny' : 'badge-allow'}">${isDeny ? '⛔ حظر (DROP)' : '✅ سماح (ACCEPT)'}</span></td>
                    <td><code style="font-size:12px;font-weight:700;">${gr.port === 'all' ? 'كافة المنافذ' : gr.port + '/' + gr.protocol.toUpperCase()}</code></td>
                    <td><span class="status-pill ${gr.ip_version === 'v6' ? 'badge-v6' : (gr.ip_version === 'v4' ? 'badge-v4' : 'badge-both')}">${gr.ip_version.toUpperCase()}</span></td>
                    <td><small style="color:#334155;font-weight:600;">${this.escape(gr.comment || '-')}</small></td>
                    <td>
                        <span class="status-pill ${isEn ? 'status-online' : 'status-disabled'}" style="cursor:pointer;" onclick="App.toggleOwnerGeoRule(${gr.id}, ${!isEn}, '${this.escape(gr.target_label || gr.target_value)}')">
                            ${isEn ? '🟢 مفعّل' : '⚪ معطّل'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex;gap:4px;justify-content:center;">
                            <button class="mt-btn mt-btn-primary" style="padding:4px 8px;font-size:11px;font-weight:700;" onclick="App.openGeoRuleModal(${gr.id})" title="تعديل كافة بيانات القاعدة">
                                ✏️ تعديل
                            </button>
                            <button class="mt-btn ${isEn ? 'mt-btn-warning' : 'mt-btn-success'}" style="padding:4px 8px;font-size:11px;font-weight:700;" onclick="App.toggleOwnerGeoRule(${gr.id}, ${!isEn}, '${this.escape(gr.target_label || gr.target_value)}')" title="${isEn ? 'إيقاف مؤقت' : 'تفعيل'}">
                                ${isEn ? '⏸️' : '▶️'}
                            </button>
                            <button class="mt-btn mt-btn-danger" style="padding:4px 8px;font-size:11px;font-weight:700;" onclick="App.deleteOwnerGeoRule(${gr.id}, '${this.escape(gr.target_label || gr.target_value)}')" title="حذف نهائي">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    App.onMatrixSearch = function (val) {
        this.ownerMatrixSearch = val;
        const tbody = document.querySelector('#unified-policy-table tbody');
        if (tbody && this.ownerGeoRulesData) {
            tbody.innerHTML = this.renderUnifiedPolicyRows(this.ownerGeoRulesData.rules, this.ownerFirewallFilter);
        }
    };

    App.applyOwnerArmorPreset = async function (preset) {
        let msg = 'تأكيد تطبيق درع الحماية؟';
        if (preset === 'owner_gateway_local') msg = 'تأكيد تحصين بوابة مالك النظام (8099) وحصرها على الشبكة المحلية ونفق SSTP فقط وحظر الإنترنت الخارجي؟';
        else if (preset === 'owner_gateway_yemen') msg = 'تأكيد تحصين بوابة المالك (8099) وحصرها على نطاق اليمن والشبكات المحلية وحظر أي وصول دولي؟';
        else if (preset === 'telemetry_shield') msg = 'تأكيد حصر خدمة البث والتليمتري (8088) على الشبكات المحلية والأنفاق؟';

        if (!confirm(msg)) return;

        const r = await this.api('owner_system_armor_preset', {}, 'POST', { preset });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.openGeoRuleModal = function (ruleId = null) {
        const geoRes = this.ownerGeoRulesData || {};
        const defaultCountries = [
            { code: 'YE', name_ar: 'اليمن', name_en: 'Yemen', flag: '🇾🇪' },
            { code: 'SA', name_ar: 'المملكة العربية السعودية', name_en: 'Saudi Arabia', flag: '🇸🇦' },
            { code: 'EG', name_ar: 'جمهورية مصر العربية', name_en: 'Egypt', flag: '🇪🇬' },
            { code: 'AE', name_ar: 'الإمارات العربية المتحدة', name_en: 'United Arab Emirates', flag: '🇦🇪' },
            { code: 'OM', name_ar: 'سلطنة عُمان', name_en: 'Oman', flag: '🇴🇲' },
            { code: 'JO', name_ar: 'المملكة الأردنية الهاشمية', name_en: 'Jordan', flag: '🇯🇴' },
            { code: 'US', name_ar: 'الولايات المتحدة الأمريكية', name_en: 'United States', flag: '🇺🇸' },
            { code: 'CN', name_ar: 'الصين', name_en: 'China', flag: '🇨🇳' },
            { code: 'RU', name_ar: 'روسيا الاتحادية', name_en: 'Russia', flag: '🇷🇺' },
            { code: 'DE', name_ar: 'ألمانيا', name_en: 'Germany', flag: '🇩🇪' },
            { code: 'GB', name_ar: 'المملكة المتحدة (بريطانيا)', name_en: 'United Kingdom', flag: '🇬🇧' },
            { code: 'TR', name_ar: 'تركيا', name_en: 'Turkey', flag: '🇹🇷' },
            { code: 'IN', name_ar: 'الهند', name_en: 'India', flag: '🇮🇳' },
            { code: 'FR', name_ar: 'فرنسا', name_en: 'France', flag: '🇫🇷' },
            { code: 'NL', name_ar: 'هولندا', name_en: 'Netherlands', flag: '🇳🇱' },
            { code: 'IR', name_ar: 'إيران', name_en: 'Iran', flag: '🇮🇷' },
            { code: 'IL', name_ar: 'الكيان الصهيوني', name_en: 'Israel', flag: '🇮🇱' },
            { code: 'BR', name_ar: 'البرازيل', name_en: 'Brazil', flag: '🇧🇷' },
            { code: 'SG', name_ar: 'سنغافورة', name_en: 'Singapore', flag: '🇸🇬' },
            { code: 'CA', name_ar: 'كندا', name_en: 'Canada', flag: '🇨🇦' }
        ];
        const defaultAsns = [
            { asn: 'AS30873', name: 'يمن نت - المؤسسة العامة للاتصالات (YemenNet PTC)', country: 'YE', badge: '🇾🇪 YemenNet' },
            { asn: 'AS204317', name: 'عدن نت - الاتصالات وتقنية المعلومات (AdenNet)', country: 'YE', badge: '🇾🇪 AdenNet' },
            { asn: 'AS12486', name: 'تيليمن - الشركة اليمنية للاتصالات الدولية (TeleYemen)', country: 'YE', badge: '🇾🇪 TeleYemen' },
            { asn: 'AS37497', name: 'سبأفون - الهاتف النقال (Sabafon)', country: 'YE', badge: '🇾🇪 Sabafon' },
            { asn: 'AS37521', name: 'يو - الشركة العمانية اليمنية للاتصالات (YOU / MTN)', country: 'YE', badge: '🇾🇪 YOU Telecom' },
            { asn: 'AS37092', name: 'يمن موبايل للهاتف النقال (Yemen Mobile)', country: 'YE', badge: '🇾🇪 Yemen Mobile' },
            { asn: 'AS13335', name: 'كلاود فلير - حماية وشبكة توزيع (Cloudflare CDN)', country: 'US', badge: '☁️ Cloudflare' },
            { asn: 'AS15169', name: 'جوجل - شبكة وخدمات جوجل السحابية (Google LLC)', country: 'US', badge: '🔍 Google' },
            { asn: 'AS8075', name: 'مايكروسوفت - أزور والحوسبة السحابية (Microsoft Azure)', country: 'US', badge: '🪟 Microsoft' },
            { asn: 'AS16509', name: 'أمازون - خدمات الحوسبة السحابية (Amazon AWS)', country: 'US', badge: '📦 Amazon AWS' },
            { asn: 'AS62041', name: 'تليجرام ماسنجر (Telegram Messenger Inc)', country: 'AE', badge: '✈️ Telegram' },
            { asn: 'AS32934', name: 'ميتا - فيسبوك وإنستغرام وواتساب (Meta Platforms)', country: 'US', badge: '💬 Meta/Facebook' }
        ];
        const defaultLocals = [
            { key: 'lan', label: 'الشبكة المحلية الخاصة بالسيرفر (LAN 192.168.3.0/24)', badge: '🏠 Server LAN' },
            { key: 'sstp', label: 'شبكة نفق راوترات الميكروتك (SSTP VPN 10.10.0.0/16)', badge: '🛡️ SSTP Concentrator' },
            { key: 'rfc1918', label: 'كافة الشبكات الخاصة القياسية (RFC1918: 10/8, 172.16/12, 192.168/16)', badge: '🌐 All Private RFC1918' },
            { key: 'loopback', label: 'الخادم المحلي الداخلي (Loopback 127.0.0.1, ::1)', badge: '🔄 Loopback' },
            { key: 'all', label: 'جميع النطاقات والشبكات المحلية والأنفاق معاً', badge: '🏠 All Local & VPN' }
        ];

        const countries = (geoRes?.preset_countries && geoRes.preset_countries.length > 0) ? geoRes.preset_countries : defaultCountries;
        const asns = (geoRes?.preset_asns && geoRes.preset_asns.length > 0) ? geoRes.preset_asns : defaultAsns;
        const locals = (geoRes?.preset_locals && geoRes.preset_locals.length > 0) ? geoRes.preset_locals : defaultLocals;
        
        if (!this.ownerGeoRulesData) {
            this.ownerGeoRulesData = { preset_countries: countries, preset_asns: asns, preset_locals: locals, rules: [] };
        } else {
            if (!this.ownerGeoRulesData.preset_countries) this.ownerGeoRulesData.preset_countries = countries;
            if (!this.ownerGeoRulesData.preset_asns) this.ownerGeoRulesData.preset_asns = asns;
            if (!this.ownerGeoRulesData.preset_locals) this.ownerGeoRulesData.preset_locals = locals;
        }

        const existing = ruleId ? (geoRes?.rules || []).find(r => Number(r.id) === Number(ruleId)) : null;

        const isEdit = Boolean(existing);
        const rType = existing?.rule_type || 'country';
        const rAction = existing?.action || 'deny';
        const rPrio = existing?.priority || 'high';
        const rPort = existing?.port || 'all';
        const rProto = existing?.protocol || 'all';
        const rIpVer = existing?.ip_version || 'both';
        const rComment = existing?.comment || '';
        const rTargetVal = existing?.target_value || 'YE';
        const rTargetLbl = existing?.target_label || '';

        // Remove any previous modal
        document.getElementById('geo-rule-modal-overlay')?.remove();

        const modal = document.createElement('div');
        modal.className = 'mt-modal-backdrop';
        modal.id = 'geo-rule-modal-overlay';
        modal.style.zIndex = '10005';
        modal.onclick = function(e) { if (e.target === this) this.remove(); };
        modal.innerHTML = `
            <div class="mt-modal" style="max-width:560px;" onclick="event.stopPropagation()">
                <div class="mt-modal-header">
                    <h3>${isEdit ? `✏️ تعديل قاعدة الحماية #${existing.id}` : '➕ إضافة قاعدة حماية جغرافية / مؤسسية بالأسبقية'}</h3>
                    <button type="button" class="mt-modal-close" onclick="document.getElementById('geo-rule-modal-overlay')?.remove()">✕</button>
                </div>
                <form onsubmit="App.submitOwnerGeoRuleModal(event, ${isEdit ? existing.id : 0})">
                    <div class="mt-modal-body" style="display:flex;flex-direction:column;gap:14px;">
                        
                        <!-- Row 1: Target Type & Action -->
                        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">نوع الهدف</label>
                                <select id="m-geo-type" class="mt-input" onchange="App.onModalGeoTypeChange()">
                                    <option value="country" ${rType==='country'?'selected':''}>🇾🇪 دولة أو إقليم جغرافي (Country)</option>
                                    <option value="asn" ${rType==='asn'?'selected':''}>🏢 شركة أو مزود خدمة (ISP / ASN)</option>
                                    <option value="local" ${rType==='local'?'selected':''}>🏠 شبكة محلية أو خاصة (Local Network)</option>
                                    <option value="custom" ${rType==='custom'?'selected':''}>🎯 نطاق شبكي مخصص (Custom CIDR)</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">نوع الإجراء</label>
                                <select id="m-geo-action" class="mt-input">
                                    <option value="deny" ${rAction==='deny'?'selected':''}>⛔ حظر ومنع كامل (Deny / DROP)</option>
                                    <option value="allow" ${rAction==='allow'?'selected':''}>✅ سماح وتصريح (Allow / ACCEPT)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Target Selector Box -->
                        <div class="form-group" style="margin:0;" id="m-geo-target-box">
                            <!-- Populated dynamically via onModalGeoTypeChange -->
                        </div>

                        <!-- Row 2: Priority & Port -->
                        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">الأسبقية والأهمية</label>
                                <select id="m-geo-prio" class="mt-input">
                                    <option value="high" ${rPrio==='high'?'selected':''}>🔴 أولوية قصوى (صدارة السيرفر - High)</option>
                                    <option value="normal" ${rPrio==='normal'?'selected':''}>🟡 أولوية عادية (Normal)</option>
                                </select>
                                <small style="color:var(--text-muted);font-size:11px;">قواعد الصدارة تنفذ أولاً في نواة الـ Kernel</small>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">المنفذ المستهدف</label>
                                <input id="m-geo-port" class="mt-input" value="${this.escape(rPort)}" placeholder="all للكل أو 8099" dir="ltr">
                                <div class="quick-chips" style="margin-top:4px;">
                                    <span class="quick-chip-btn" onclick="document.getElementById('m-geo-port').value='all'">كافة المنافذ</span>
                                    <span class="quick-chip-btn" onclick="document.getElementById('m-geo-port').value='8099'">بوابة المالك 8099</span>
                                    <span class="quick-chip-btn" onclick="document.getElementById('m-geo-port').value='8088'">8088</span>
                                    <span class="quick-chip-btn" onclick="document.getElementById('m-geo-port').value='22'">22</span>
                                </div>
                            </div>
                        </div>

                        <!-- Row 3: Protocol & IP Version -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">البروتوكول</label>
                                <select id="m-geo-proto" class="mt-input">
                                    <option value="all" ${rProto==='all'?'selected':''}>كافة البروتوكولات (TCP + UDP)</option>
                                    <option value="tcp" ${rProto==='tcp'?'selected':''}>TCP فقط</option>
                                    <option value="udp" ${rProto==='udp'?'selected':''}>UDP فقط</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:12px;font-weight:700;">إصدار البروتوكول الشبكي</label>
                                <select id="m-geo-ipver" class="mt-input">
                                    <option value="both" ${rIpVer==='both'?'selected':''}>🌐 كلاهما (IPv4 + IPv6)</option>
                                    <option value="v4" ${rIpVer==='v4'?'selected':''}>🔹 IPv4 فقط</option>
                                    <option value="v6" ${rIpVer==='v6'?'selected':''}>🟣 IPv6 فقط</option>
                                </select>
                            </div>
                        </div>

                        <!-- Row 4: Comment -->
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:12px;font-weight:700;">ملاحظة أو وصف</label>
                            <input id="m-geo-comment" class="mt-input" value="${this.escape(rComment)}" placeholder="مثال: حظر ماسحات أو حصر بوابة المالك محلياً">
                        </div>

                        <div style="background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;color:#64748b;">
                            📌 سيتم تطبيق القاعدة وتحديث مجموعات IPSet وسلاسل الـ iptables في نواة النظام فوراً عند الحفظ.
                        </div>
                    </div>

                    <div class="mt-modal-footer">
                        <button type="button" class="mt-btn" onclick="document.getElementById('geo-rule-modal-overlay')?.remove()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800;padding:8px 20px;">
                            ${isEdit ? '💾 حفظ التعديلات وتطبيقها فورا' : '➕ إضافة وتطبيق القاعدة فورا'}
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        this.onModalGeoTypeChange(rTargetVal, rTargetLbl);
    };

    App.onModalGeoTypeChange = function (preVal = '', preLbl = '') {
        const type = document.getElementById('m-geo-type')?.value || 'country';
        const box = document.getElementById('m-geo-target-box');
        if (!box) return;

        const geoRes = this.ownerGeoRulesData;
        const countries = geoRes?.preset_countries || [];
        const asns = geoRes?.preset_asns || [];
        const locals = geoRes?.preset_locals || [];

        if (type === 'country') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار الدولة المستهدفة</label>
                <select id="m-geo-target-sel" class="mt-input" onchange="App.onModalTargetSelectChange()">
                    ${countries.map(c => `
                        <option value="${c.code}" ${c.code === (preVal || 'YE') ? 'selected' : ''}>${c.flag} ${c.name_ar} (${c.name_en} - ${c.code})</option>
                    `).join('')}
                    <option value="__custom__" ${preVal && !countries.find(c=>c.code===preVal) ? 'selected' : ''}>✏️ إدخال رمز دولة أخرى (كود ISO)...</option>
                </select>
                <input id="m-geo-target-custom" class="mt-input" style="${preVal && !countries.find(c=>c.code===preVal) ? 'display:block;' : 'display:none;'}margin-top:6px;" value="${this.escape(preVal && !countries.find(c=>c.code===preVal) ? preVal : '')}" placeholder="أدخل رمز الدولة (مثال: IT أو TR أو DE)" dir="ltr">
            `;
        } else if (type === 'asn') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار الشركة أو مزود الخدمة (ASN)</label>
                <select id="m-geo-target-sel" class="mt-input" onchange="App.onModalTargetSelectChange()">
                    ${asns.map(a => `
                        <option value="${a.asn}" ${a.asn === preVal ? 'selected' : ''}>${a.badge} - ${a.name}</option>
                    `).join('')}
                    <option value="__custom__" ${preVal && !asns.find(a=>a.asn===preVal) ? 'selected' : ''}>✏️ إدخال رقم شركة/مزود آخر (ASN)...</option>
                </select>
                <input id="m-geo-target-custom" class="mt-input" style="${preVal && !asns.find(a=>a.asn===preVal) ? 'display:block;' : 'display:none;'}margin-top:6px;" value="${this.escape(preVal && !asns.find(a=>a.asn===preVal) ? preVal : '')}" placeholder="أدخل رقم الـ ASN (مثال: AS12345 أو 12345)" dir="ltr">
            `;
        } else if (type === 'local') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار النطاق أو الشبكة المحلية</label>
                <select id="m-geo-target-sel" class="mt-input">
                    ${locals.map(l => `
                        <option value="${l.key}" ${l.key === preVal ? 'selected' : ''}>${l.badge} - ${l.label}</option>
                    `).join('')}
                </select>
            `;
        } else if (type === 'custom') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">نطاق الـ IP أو قناع الشبكة (CIDR)</label>
                <input id="m-geo-target-custom" class="mt-input" value="${this.escape(preVal)}" placeholder="مثال: 198.51.100.0/24 أو 2001:db8::/32" dir="ltr" style="display:block;">
            `;
        }
    };

    App.onModalTargetSelectChange = function () {
        const sel = document.getElementById('m-geo-target-sel');
        const customInput = document.getElementById('m-geo-target-custom');
        if (sel && customInput) {
            const isCustom = sel.value === '__custom__';
            customInput.style.display = isCustom ? 'block' : 'none';
            if (isCustom) customInput.focus();
        }
    };

    App.submitOwnerGeoRuleModal = async function (e, id = 0) {
        e.preventDefault();
        const rule_type = document.getElementById('m-geo-type')?.value || 'country';
        const action = document.getElementById('m-geo-action')?.value || 'deny';
        const priority = document.getElementById('m-geo-prio')?.value || 'high';
        const port = document.getElementById('m-geo-port')?.value.trim() || 'all';
        const protocol = document.getElementById('m-geo-proto')?.value || 'all';
        const ip_version = document.getElementById('m-geo-ipver')?.value || 'both';
        const comment = document.getElementById('m-geo-comment')?.value.trim();

        let target_value = '';
        let target_label = '';

        if (rule_type === 'custom') {
            target_value = document.getElementById('m-geo-target-custom')?.value.trim();
            target_label = target_value;
        } else {
            const sel = document.getElementById('m-geo-target-sel');
            if (sel) {
                if (sel.value === '__custom__') {
                    target_value = document.getElementById('m-geo-target-custom')?.value.trim().toUpperCase();
                    target_label = target_value;
                } else {
                    target_value = sel.value;
                    target_label = sel.options[sel.selectedIndex]?.text || target_value;
                }
            }
        }

        if (!target_value) {
            return this.toast('يرجى تحديد الهدف أو إدخال القيمة المطلوبة', 'warning');
        }

        const r = await this.api('owner_system_geo_rule_save', {}, 'POST', {
            id: Number(id),
            rule_type,
            target_value,
            target_label,
            action,
            priority,
            port,
            protocol,
            ip_version,
            comment
        });

        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) {
            document.getElementById('geo-rule-modal-overlay')?.remove();
            this.loadOwnerFirewall();
        }
    };

    /* ─── Port Forwarding Controller Methods ─── */
    App.onPfRouterChange = function (routerId) {
        const sel = document.getElementById('pf-router-id');
        const opt = sel?.options[sel.selectedIndex];
        const ip = opt?.getAttribute('data-ip') || '';
        const targetIpInput = document.getElementById('pf-target-ip');
        if (targetIpInput) targetIpInput.value = ip;
    };

    App.togglePfForm = function (forceState) {
        const card = document.getElementById('pf-form-card');
        if (!card) return;
        const willShow = forceState !== undefined ? forceState : card.style.display === 'none';
        card.style.display = willShow ? 'block' : 'none';
        if (willShow) document.getElementById('pf-listen-port')?.focus();
    };

    App.saveOwnerPortForwarding = async function (btnEl) {
        const listen_port = document.getElementById('pf-listen-port')?.value.trim();
        const protocol = document.getElementById('pf-proto')?.value || 'tcp';
        const router_id = document.getElementById('pf-router-id')?.value;
        const target_ip = document.getElementById('pf-target-ip')?.value.trim();
        const target_port = document.getElementById('pf-target-port')?.value.trim();
        const comment = document.getElementById('pf-comment')?.value.trim();

        if (!listen_port || !router_id || !target_port) {
            return this.toast('يرجى اختيار الراوتر الهدف وملء المنفذ الخارجي والمنفذ الهدف', 'warning');
        }

        const saveBtn = btnEl || document.querySelector('#pf-form-card button.mt-btn-success');
        const origText = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '⏳ جاري الحفظ والتطبيق...'; }

        try {
            const r = await this.api('owner_system_port_forwarding_save', {}, 'POST', {
                listen_port, protocol, router_id, target_ip, target_port, comment
            });
            this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
            if (r?.success) this.loadOwnerFirewall();
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origText; }
        }
    };

    App.toggleOwnerPortForwarding = async function (id, enable, lPort, tIp, tPort) {
        const actionStr = enable ? 'تفعيل' : 'إيقاف/تعطيل';
        const targetStr = (lPort && tIp) ? `:${lPort} ➔ ${tIp}:${tPort}` : `#${id}`;
        if (!confirm(`تأكيد ${actionStr} قاعدة توجيه المنفذ (${targetStr})؟`)) return;
        const r = await this.api('owner_system_port_forwarding_toggle', {}, 'POST', { id, enable });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.deleteOwnerPortForwarding = async function (id, lPort, tIp, tPort) {
        if (!confirm(`تأكيد حذف توجيه المنفذ :${lPort} -> ${tIp}:${tPort}؟`)) return;
        const r = await this.api('owner_system_port_forwarding_delete', {}, 'POST', { id });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    /* ─── GeoIP Lookup Actions ─── */
    App.quickTestGeoIp = function (ip) {
        const input = document.getElementById('geoip-input-ip');
        if (input) input.value = ip;
        this.lookupOwnerGeoIp(ip);
    };

    App.lookupOwnerGeoIp = async function (ipToLookup) {
        const ip = (ipToLookup || document.getElementById('geoip-input-ip')?.value || '').trim();
        if (!ip) return this.toast('يرجى كتابة عنوان IP للفحص', 'warning');

        const box = document.getElementById('geoip-result-box');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = '<div style="padding:14px;background:#fff;border-radius:8px;text-align:center;color:var(--text-muted);">جاري فحص العنوان وتحليل السجلات...</div>';
        }

        const r = await this.api('owner_system_geoip_lookup', { ip });
        if (!r || !r.success || !r.data) {
            if (box) box.innerHTML = `<div style="padding:14px;background:#fef2f2;color:#b91c1c;border-radius:8px;">❌ ${this.escape(r?.error || 'تعذر فحص الـ IP')}</div>`;
            return;
        }

        const d = r.data;
        if (box) {
            box.innerHTML = `
                <div class="geoip-result-card" style="margin-top:10px;">
                    <div class="geoip-flag-icon">${d.flag || '🌐'}</div>
                    <div class="geoip-details">
                        <h4>
                            <b>${this.escape(d.country_name)}</b> 
                            <span style="font-size:13px;color:#64748b;">(${this.escape(d.country_code)})</span>
                            ${d.continent && d.continent !== '-' ? `<small style="font-size:12px;color:#64748b;margin-right:6px;">— قارة ${this.escape(d.continent)}</small>` : ''}
                        </h4>
                        <div style="font-size:13px;color:#334155;margin-top:2px;">
                            مزود الخدمة: <b>${this.escape(d.as_name || 'غير معروف')}</b>
                            ${d.as_domain ? `<a href="http://${this.escape(d.as_domain)}" target="_blank" style="margin-right:8px;font-size:11.5px;color:#0284c7;">(${this.escape(d.as_domain)})</a>` : ''}
                        </div>
                        <div class="geoip-tags">
                            <span class="geoip-tag asn">شبكة المزود: ${this.escape(d.asn || '-')}</span>
                            <span class="geoip-tag">النطاق CIDR: ${this.escape(d.network || '-')}</span>
                            <span class="geoip-tag" style="direction:ltr;">IP: ${this.escape(d.ip)}</span>
                            ${d.is_private ? '<span class="geoip-tag" style="background:#fef3c7;color:#92400e;">🏠 نطاق محلي خاص</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <button class="mt-btn mt-btn-danger" style="font-size:11.5px;font-weight:700;padding:5px 12px;white-space:nowrap;" onclick="App.prefillBanFromGeoIp('${this.escape(d.ip)}')">
                            ⛔ حظر في الجدار الناري
                        </button>
                        <button class="mt-btn mt-btn-success" style="font-size:11.5px;font-weight:700;padding:5px 12px;white-space:nowrap;" onclick="App.prefillAllowFromGeoIp('${this.escape(d.ip)}')">
                            ✅ سماح لمنفذ لهذا الـ IP
                        </button>
                    </div>
                </div>
            `;
        }
    };

    App.prefillBanFromGeoIp = function (ip) {
        const banIp = document.getElementById('fw-ban-ip');
        const banComm = document.getElementById('fw-ban-comment');
        if (banIp) banIp.value = ip;
        if (banComm) banComm.value = 'حظر بناءً على فحص GeoIP';
        banIp?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.toast(`تم تعبئة العنوان ${ip} في بطاقة الحظر الفوري أدناه`, 'info');
    };

    App.prefillAllowFromGeoIp = function (ip) {
        const addIp = document.getElementById('fw-add-ip');
        if (addIp) addIp.value = ip;
        addIp?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.toast(`تم تعبئة العنوان ${ip} في بطاقة السماح أدناه`, 'info');
    };

    App.fillFwPort = function (port, proto, comment) {
        const portEl = document.getElementById('fw-add-port');
        const protoEl = document.getElementById('fw-add-proto');
        const commEl = document.getElementById('fw-add-comment');
        if (portEl) portEl.value = port;
        if (protoEl) protoEl.value = proto;
        if (commEl) commEl.value = comment;
    };

    App.addOwnerFirewallRule = async function () {
        const port = document.getElementById('fw-add-port')?.value.trim();
        const protocol = document.getElementById('fw-add-proto')?.value || 'tcp';
        const from_ip = document.getElementById('fw-add-ip')?.value.trim();
        const ip_version = document.getElementById('fw-add-ip-ver')?.value || 'both';
        const comment = document.getElementById('fw-add-comment')?.value.trim();

        if (!port) return this.toast('يرجى تحديد رقم المنفذ', 'warning');

        const r = await this.api('owner_system_firewall_add_rule', {}, 'POST', { port, protocol, from_ip, ip_version, comment });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.banOwnerIp = async function () {
        const ip = document.getElementById('fw-ban-ip')?.value.trim();
        const comment = document.getElementById('fw-ban-comment')?.value.trim() || 'حظر IP مشبوه';

        if (!ip) return this.toast('يرجى إدخال عنوان الـ IP المراد حظره', 'warning');
        if (!confirm(`هل أنت متأكد من حظر العنوان ${ip} تماماً من الوصول للسيرفر؟`)) return;

        const r = await this.api('owner_system_firewall_ban_ip', {}, 'POST', { ip, comment });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.deleteOwnerFirewallRule = async function (num, to, isSsh) {
        if (isSsh) {
            if (!confirm('⚠️ تحذير: هذه القاعدة تخص منفذ التحكم عن بُعد (SSH). هل أنت متأكد تماماً من حذفها؟')) return;
        } else {
            if (!confirm(`هل أنت متأكد من حذف القاعدة رقم [${num}] للمنفذ (${to})؟`)) return;
        }

        const r = await this.api('owner_system_firewall_delete_rule', {}, 'POST', { num, to, is_ssh: isSsh });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.applyOwnerFirewallDefaults = async function () {
        if (!confirm('تأكيد تطبيق القواعد الافتراضية لمنظومة SAM (الويب 80/443/8099، راديوس 1812/1813/3799، نفق 4406، تليمتري 8088، واتساب 3388، و SSH 22)؟')) return;
        const r = await this.api('owner_system_firewall_defaults', {}, 'POST', {});
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.toggleOwnerFirewall = async function (enable) {
        const promptMsg = enable ? 'تأكيد تفعيل الجدار الناري لحماية منافذ الخادم؟ سيتم التحقق من فتح منفذ SSH تلقائياً لحمايتك.' : 'تأكيد تعطيل الجدار الناري؟';
        if (!confirm(promptMsg)) return;
        const r = await this.api('owner_system_firewall_toggle', {}, 'POST', { enable });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        this.loadOwnerFirewall();
    };

    App.setFwFilter = function (filter) {
        this.ownerFirewallFilter = filter;
        this.loadOwnerFirewall();
    };

    App.toggleOwnerFirewallIpv6 = async function (enable) {
        const promptMsg = enable ? 'تأكيد تفعيل حركة بروتوكول IPv6 في جدار الحماية (UFW)؟' : 'تأكيد تعطيل حركة مرور بروتوكول IPv6 بالكامل في جدار الحماية؟';
        if (!confirm(promptMsg)) return;
        const r = await this.api('owner_system_firewall_ipv6_toggle', {}, 'POST', { enable });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.toggleGeoRuleForm = function (forceState) {
        const card = document.getElementById('geo-rule-form-card');
        if (!card) return;
        const willShow = forceState !== undefined ? forceState : card.style.display === 'none';
        card.style.display = willShow ? 'block' : 'none';
        if (willShow) this.onGeoRuleTypeChange();
    };

    App.onGeoRuleTypeChange = function () {
        const type = document.getElementById('geo-rule-type')?.value || 'country';
        const box = document.getElementById('geo-target-box');
        if (!box) return;

        const geoRes = this.ownerGeoRulesData;
        const countries = geoRes?.preset_countries || [];
        const asns = geoRes?.preset_asns || [];
        const locals = geoRes?.preset_locals || [];

        if (type === 'country') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار الدولة المستهدفة</label>
                <select id="geo-target-select" class="mt-input" onchange="App.onGeoTargetSelectChange()">
                    ${countries.map(c => `
                        <option value="${c.code}" ${c.code==='YE'?'selected':''}>${c.flag} ${c.name_ar} (${c.name_en} - ${c.code})</option>
                    `).join('')}
                    <option value="__custom__">✏️ إدخال رمز دولة أخرى (كود ISO)...</option>
                </select>
                <input id="geo-target-custom" class="mt-input" style="display:none;margin-top:6px;" placeholder="أدخل رمز الدولة (مثال: IT أو TR أو DE)" dir="ltr">
            `;
        } else if (type === 'asn') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار الشركة أو مزود الخدمة (ASN)</label>
                <select id="geo-target-select" class="mt-input" onchange="App.onGeoTargetSelectChange()">
                    ${asns.map(a => `
                        <option value="${a.asn}">${a.badge} - ${a.name}</option>
                    `).join('')}
                    <option value="__custom__">✏️ إدخال رقم شركة/مزود آخر (ASN)...</option>
                </select>
                <input id="geo-target-custom" class="mt-input" style="display:none;margin-top:6px;" placeholder="أدخل رقم الـ ASN (مثال: AS12345 أو 12345)" dir="ltr">
            `;
        } else if (type === 'local') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">اختيار النطاق أو الشبكة المحلية</label>
                <select id="geo-target-select" class="mt-input">
                    ${locals.map(l => `
                        <option value="${l.key}">${l.badge} - ${l.label}</option>
                    `).join('')}
                </select>
            `;
        } else if (type === 'custom') {
            box.innerHTML = `
                <label style="font-size:12px;font-weight:700;">نطاق الـ IP أو قناع الشبكة (CIDR)</label>
                <input id="geo-target-custom" class="mt-input" placeholder="مثال: 198.51.100.0/24 أو 2001:db8::/32" dir="ltr" style="display:block;">
            `;
        }
    };

    App.onGeoTargetSelectChange = function () {
        const sel = document.getElementById('geo-target-select');
        const customInput = document.getElementById('geo-target-custom');
        if (sel && customInput) {
            const isCustom = sel.value === '__custom__';
            customInput.style.display = isCustom ? 'block' : 'none';
            if (isCustom) customInput.focus();
        }
    };

    App.saveOwnerGeoRule = async function () {
        const rule_type = document.getElementById('geo-rule-type')?.value || 'country';
        const action = document.getElementById('geo-rule-action')?.value || 'deny';
        const priority = document.getElementById('geo-rule-prio')?.value || 'high';
        const port = document.getElementById('geo-rule-port')?.value.trim() || 'all';
        const protocol = document.getElementById('geo-rule-proto')?.value || 'all';
        const ip_version = document.getElementById('geo-rule-ipver')?.value || 'both';
        const comment = document.getElementById('geo-rule-comment')?.value.trim();

        let target_value = '';
        let target_label = '';

        if (rule_type === 'custom') {
            target_value = document.getElementById('geo-target-custom')?.value.trim();
            target_label = target_value;
        } else {
            const sel = document.getElementById('geo-target-select');
            if (sel) {
                if (sel.value === '__custom__') {
                    target_value = document.getElementById('geo-target-custom')?.value.trim().toUpperCase();
                    target_label = target_value;
                } else {
                    target_value = sel.value;
                    target_label = sel.options[sel.selectedIndex]?.text || target_value;
                }
            }
        }

        if (!target_value) {
            return this.toast('يرجى تحديد الهدف أو إدخال القيمة المطلوبة', 'warning');
        }

        const r = await this.api('owner_system_geo_rule_save', {}, 'POST', {
            rule_type,
            target_value,
            target_label,
            action,
            priority,
            port,
            protocol,
            ip_version,
            comment
        });

        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.toggleOwnerGeoRule = async function (id, enable, label) {
        const actionStr = enable ? 'تفعيل' : 'إيقاف/تعطيل';
        const targetStr = label ? label : `#${id}`;
        if (!confirm(`تأكيد ${actionStr} قاعدة الجدار الناري (${targetStr})؟`)) return;
        const r = await this.api('owner_system_geo_rule_toggle', {}, 'POST', { id, enable });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    App.deleteOwnerGeoRule = async function (id, label) {
        if (!confirm(`هل أنت متأكد من حذف قاعدة الحماية (${label})؟`)) return;
        const r = await this.api('owner_system_geo_rule_delete', {}, 'POST', { id });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.loadOwnerFirewall();
    };

    /* ─── Logs & Diagnostics Logic ─── */
    App.loadOwnerLogs = async function () {
        const pre = document.getElementById('owner-terminal-pre');
        const target = document.getElementById('owner-log-target')?.value || 'worker';
        const lines = document.getElementById('owner-log-lines')?.value || '50';
        if (!pre) return;

        pre.innerHTML = 'جاري سحب السجلات من الخادم...';
        const r = await this.api('owner_system_logs', { target, lines });
        if (!r || !r.success) {
            pre.innerHTML = 'تعذر جلب السجل.';
            return;
        }
        pre.innerHTML = this.escape(r.log || 'السجل فارغ.');
        pre.scrollTop = pre.scrollHeight;
    };

    /* ─── 1-Click System Cleanup ─── */
    App.runOwnerCleanup = async function () {
        if (!confirm('بدء دورة التنظيف الوقائي الآمن للملفات المؤقتة والجلسات المعلقة؟')) return;
        this.toast('جاري تنفيذ التنظيف الوقائي...', 'info', 3000);
        const r = await this.api('owner_system_cleanup');
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger', 6000);
        if (r?.success) this.loadOwnerLogs();
    };

    App.saveOwnerSystemServer = async function () {
        const domain = document.getElementById('own-domain')?.value || '';
        const maint = document.getElementById('own-maint')?.checked || false;
        const r = await this.api('owner_system_save', {}, 'POST', {
            system_name: (this.uiSettings || {}).app_title || 'SAM',
            system_short_name: (this.uiSettings || {}).app_short_title || 'SAM',
            public_domain: domain,
            maintenance_mode: maint
        });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
    };

    /* ==========================================================================
       2. SYSTEM TEMPLATES CATALOG (قوالب النظام الشاملة)
       ========================================================================== */
    App.systemTemplates = [
        {
            id: 'modern_clean',
            name: 'النمط العصري الموحد',
            subName: 'Modern Clean ERP',
            icon: '💎',
            badge: 'الموصى به · عصري فائق الوضوح',
            badgeClass: 'badge-recommended',
            desc: 'واجهة عصرية بتدرجات زرقاء وكحلية مريحة للعين، بطاقات أنيقة، وظلال انسيابية تناسب العمل اليومي والمكثف.',
            palette: {
                primary: '#0284c7',
                header: '#0f172a',
                sidebar: '#1e293b',
                sidebar_active: '#0284c7',
                success: '#10b981',
                danger: '#ef4444'
            },
            density: 'normal',
            tableViewMode: 'standard'
        },
        {
            id: 'winbox_compact',
            name: 'نمط وينبوكس الكلاسيكي المدمج',
            subName: 'Compact Winbox Classic',
            icon: '🗂️',
            badge: 'كثافة وسرعة عالية',
            badgeClass: 'badge-winbox',
            desc: 'مظهر مضغوط وعالي الكثافة مستوحى من Winbox MikroTik، يتيح لمديري الشبكات رؤية أقصى عدد من الصفوف والأعمدة دون تمرير.',
            palette: {
                primary: '#2563eb',
                header: '#1e293b',
                sidebar: '#334155',
                sidebar_active: '#1d4ed8',
                success: '#16a34a',
                danger: '#dc2626'
            },
            density: 'compact',
            tableViewMode: 'compact'
        },
        {
            id: 'mobile_pos',
            name: 'نمط بطاقات الجوال ونقاط البيع',
            subName: 'Mobile First & POS Cards',
            icon: '📱',
            badge: 'شاشات اللمس والهواتف',
            badgeClass: 'badge-pos',
            desc: 'أزرار عريضة ومتباعدة، وتحويل الجداول إلى كروت سهلة اللمس، وتجربة سلسة لشاشات اللمس والهواتف ونقاط البيع السريعة.',
            palette: {
                primary: '#059669',
                header: '#064e3b',
                sidebar: '#065f46',
                sidebar_active: '#10b981',
                success: '#22c55e',
                danger: '#f43f5e'
            },
            density: 'comfortable',
            tableViewMode: 'cards'
        },
        {
            id: 'enterprise_dark',
            name: 'نمط المؤسسات والمراكز الكبرى',
            subName: 'Enterprise Steel & Indigo',
            icon: '💼',
            badge: 'داكن فاخر وعالي التباين',
            badgeClass: 'badge-enterprise',
            desc: 'طابع داكن عصري باللون النيلي (Steel & Indigo) عالي التباين والأناقة، مناسب لمراكز المراقبة والشركات وإدارات NOC.',
            palette: {
                primary: '#6366f1',
                header: '#090d16',
                sidebar: '#111827',
                sidebar_active: '#4f46e5',
                success: '#059669',
                danger: '#e11d48'
            },
            density: 'normal',
            tableViewMode: 'standard'
        },
        {
            id: 'gold_luxury',
            name: 'النمط الذهبي الدافئ',
            subName: 'Warm Amber & Gold',
            icon: '☀️',
            badge: 'فخم وأنيق',
            badgeClass: 'badge-gold',
            desc: 'ألوان عنبرية وذهبية دافئة تمنح النظام طابعاً فخماً ومميزاً للشبكات الراقية مع وضوح عالي للعمليات المالية.',
            palette: {
                primary: '#d97706',
                header: '#78350f',
                sidebar: '#451a03',
                sidebar_active: '#d97706',
                success: '#16a34a',
                danger: '#dc2626'
            },
            density: 'normal',
            tableViewMode: 'standard'
        }
    ];

    /* ==========================================================================
       3. SYSTEM UI & TEMPLATE GOVERNANCE STUDIO (الهوية والواجهات العامة)
       ========================================================================== */
    App.activeSelectedTemplate = 'modern_clean';

    App.renderSystemUiGovernance = async function () {
        const isOwner = Boolean(this.isSystemOwner) || this.userRole === 'system_owner';
        const [networkRes, uiRes, ownerRes] = await Promise.all([
            this.api('get_network_ui_settings'),
            this.api('get_ui_settings'),
            isOwner ? this.api('owner_system_get') : Promise.resolve(null)
        ]);
        // This screen edits the active network profile for both owner and network manager.
        // Global owner defaults remain available through the separate system settings actions.
        const s = (networkRes && networkRes.settings) ? networkRes.settings : {};
        const ui = (uiRes && uiRes.app_title) ? uiRes : (this.uiSettings || {});
        const p = ui.theme_palette || {};

        this.activeSelectedTemplate = s.system_template || ui.system_template || 'modern_clean';

        // 1. Template Presets HTML
        const templateCards = this.systemTemplates.map(t => {
            const isActive = (t.id === this.activeSelectedTemplate);
            return `
                <div class="gov-template-card ${isActive ? 'active' : ''}" id="gov-tpl-${t.id}" onclick="App.selectGovTemplate('${t.id}')">
                    <div class="gov-template-top">
                        <div class="gov-template-icon-wrap">${t.icon}</div>
                        <span class="gov-template-badge ${t.badgeClass}">${t.badge}</span>
                    </div>
                    <div class="gov-template-info">
                        <h4>${esc(t.name)}</h4>
                        <div class="gov-template-sub">${esc(t.subName)}</div>
                        <div class="gov-template-desc">${esc(t.desc)}</div>
                    </div>
                    <div class="gov-template-swatches">
                        <span class="gov-swatch-dot" style="background:${t.palette.header}" title="الترويسة: ${t.palette.header}"></span>
                        <span class="gov-swatch-dot" style="background:${t.palette.sidebar}" title="القائمة: ${t.palette.sidebar}"></span>
                        <span class="gov-swatch-dot" style="background:${t.palette.primary}" title="الرئيسي: ${t.palette.primary}"></span>
                        <span class="gov-swatch-dot" style="background:${t.palette.sidebar_active}" title="التحديد: ${t.palette.sidebar_active}"></span>
                        <span class="gov-swatch-dot" style="background:${t.palette.success}" title="النجاح: ${t.palette.success}"></span>
                    </div>
                    <button type="button" class="gov-template-btn">${isActive ? '✓ القالب المعتمد حالياً' : '⚡ اختيار وتطبيق القالب'}</button>
                </div>
            `;
        }).join('');

        // 2. Navigation Studio Hierarchy
        const sections = this.getStudioSections ? this.getStudioSections() : [];
        const sectionCards = sections.map((sec, sIdx) => {
            const itemRows = sec.items.map((it, iIdx) => {
                const isFirst = (iIdx === 0);
                return `
                    <div class="sam-item-row ${isFirst ? 'sam-item-first' : ''}" id="sam-item-row-${esc(it.id)}" data-item-id="${esc(it.id)}" data-parent-dept="${esc(sec.id)}" data-search="${esc((it.label + ' ' + it.id).toLowerCase())}">
                        <div class="sam-item-col-main">
                            <span class="sam-item-order-badge">#${iIdx + 1}</span>
                            <span class="sam-item-icon">${esc(it.icon)}</span>
                            <div class="sam-item-input-wrap">
                                <input class="mt-input sam-item-input" data-sam-label="tab:${esc(it.id)}" value="${esc(it.label)}" placeholder="${esc(it.label)}" title="تعديل اسم القائمة/العملية" />
                                <span class="sam-item-id-tag">${esc(it.id)}</span>
                            </div>
                            <span class="sam-item-first-star" title="هذه العملية في مقدمة القسم" style="display:${isFirst ? 'inline-flex' : 'none'};">⭐ في المقدمة</span>
                        </div>
                        <div class="sam-item-col-actions">
                            <button type="button" class="mt-btn sam-btn-to-top" onclick="App.moveStudioItemToTop('${esc(sec.id)}', '${esc(it.id)}')" title="نقل هذه العملية إلى المقدمة مباشرة">🔝 إلى المقدمة</button>
                            <button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioItem('${esc(sec.id)}', '${esc(it.id)}', -1)" title="تحريك لأعلى">⬆️</button>
                            <button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioItem('${esc(sec.id)}', '${esc(it.id)}', 1)" title="تحريك لأسفل">⬇️</button>
                            <input type="hidden" data-sam-order="tab:${esc(it.id)}" value="${iIdx + 1}" />
                            <label class="sam-switch" title="إظهار أو إخفاء من القائمة"><input type="checkbox" data-sam-visible="tab:${esc(it.id)}" ${it.visible ? 'checked' : ''}><span>ظاهر</span></label>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="sam-dept-card" id="sam-dept-card-${esc(sec.id)}" data-dept-id="${esc(sec.id)}" data-search="${esc((sec.label + ' ' + sec.id).toLowerCase())}">
                    <div class="sam-dept-header">
                        <div class="sam-dept-info">
                            <span class="sam-dept-order-badge">#${sIdx + 1}</span>
                            <span class="sam-dept-icon">${esc(sec.icon)}</span>
                            <div class="sam-dept-title-wrap">
                                <input class="mt-input sam-dept-input" data-sam-label="dept:${esc(sec.id)}" value="${esc(sec.label)}" placeholder="${esc(sec.label)}" title="تعديل اسم القسم" />
                                <span class="sam-dept-count-badge">${sec.items.length} عملية</span>
                            </div>
                        </div>
                        <div class="sam-dept-actions">
                            <button type="button" class="mt-btn sam-btn-dept-top" onclick="App.moveStudioDeptToTop('${esc(sec.id)}')" title="نقل هذا القسم بالكامل إلى أعلى القائمة">🔝 القسم إلى المقدمة</button>
                            <button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioDept('${esc(sec.id)}', -1)" title="تحريك القسم لأعلى">⬆️</button>
                            <button type="button" class="mt-btn sam-btn-move" onclick="App.moveStudioDept('${esc(sec.id)}', 1)" title="تحريك القسم لأسفل">⬇️</button>
                            <input type="hidden" data-sam-order="dept:${esc(sec.id)}" value="${sIdx + 1}" />
                            <label class="sam-switch" title="إظهار أو إخفاء القسم"><input type="checkbox" data-sam-visible="dept:${esc(sec.id)}" ${sec.visible ? 'checked' : ''}><span>ظاهر</span></label>
                            <button type="button" class="mt-btn sam-btn-collapse" onclick="App.toggleStudioDeptCollapse('${esc(sec.id)}')" title="طي / توسيع"><span class="sam-dept-chevron">▼</span></button>
                        </div>
                    </div>
                    <div class="sam-dept-items-list" id="sam-dept-items-${esc(sec.id)}">${itemRows}</div>
                </div>
            `;
        }).join('');

        // 3. Mobile Bottom Nav Slots
        const allAccessibleItems = [];
        sections.forEach(sec => {
            (sec.items || []).forEach(it => {
                allAccessibleItems.push({ id: it.id, name: it.label, icon: it.icon, dept: sec.label });
            });
        });
        const currentBottomNav = Array.isArray(ui.mobile_bottom_nav) ? ui.mobile_bottom_nav : [
            { tab: 'dashboard', title: 'الرئيسية', icon: '📊' },
            { tab: 'users', title: 'الكروت', icon: '👥' },
            { tab: 'sales', title: 'المبيعات', icon: '💳' },
            { tab: 'cashbox_accounts', title: 'المالية', icon: '💰' },
            { tab: 'operating_expenses', title: 'المصروفات التشغيلية', icon: '💸' },
            { tab: 'chart_of_accounts', title: 'الحسابات', icon: '📑' },
            { tab: 'reports_center', title: 'التقارير', icon: '📈' },
            { tab: 'admins_agents', title: 'المستخدمين', icon: '👥' },
            { tab: 'whatsapp_manager', title: 'الواتساب', icon: '💬' }
        ];

        const bottomNavSlotsHtml = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => {
            const slot = currentBottomNav[idx] || { tab: 'dashboard', title: 'الرئيسية', icon: '📊' };
            const options = allAccessibleItems.map(item => `
                <option value="${esc(item.id)}|${esc(item.name)}|${esc(item.icon)}" ${item.id === slot.tab ? 'selected' : ''}>
                    ${esc(item.icon)} ${esc(item.name)} (${esc(item.dept)})
                </option>
            `).join('');

            return `
                <div class="gov-mobilenav-slot">
                    <label>الزر #${idx + 1} في شريط الهاتف</label>
                    <select class="mt-select" id="gov-bottom-slot-${idx}">
                        ${options}
                    </select>
                </div>
            `;
        }).join('');

        document.getElementById('main-view').innerHTML = `
            <div class="gov-studio">
                <!-- Hero Header -->
                <div class="gov-hero-header">
                    <div class="gov-hero-title">
                        <span style="font-size:32px;">🎨</span>
                        <div>
                            <h2>${isOwner ? 'مركز التحكم بالهوية والواجهات وقوالب النظام الموحدة' : 'هوية وقالب الشبكة النشطة'}</h2>
                            <div class="gov-hero-desc">${isOwner ? 'لوحة الحوكمة والتحكم الشامل لمالك النظام: اختيار القوالب الجاهزة (Templates)، تخصيص الشعار والألوان، ترتيب القوائم والعمليات، وضبط واجهات الهاتف والجداول وتعميمها لجميع المستخدمين والمشرفين.' : 'إدارة هوية وقالب الشبكة النشطة فقط. التغييرات لا تنتقل إلى شبكة أخرى، ولا تشمل الدومين العام أو الشعار المركزي للمنصة.'}</div>
                        </div>
                    </div>
                    <div class="gov-hero-actions">
                        <span class="status-pill ${isOwner ? 'status-danger' : 'status-success'}" style="background:${isOwner ? '#dc2626' : '#059669'};color:#fff;font-weight:bold;padding:6px 14px;border-radius:20px;">${isOwner ? '👑 مالك النظام — نطاق المنصة' : '🛡️ مدير الشبكة — الشبكة النشطة'}</span>
                        <button class="mt-btn mt-btn-success" onclick="App.saveSystemUiGovernance()" style="font-size:13px;font-weight:bold;padding:8px 18px;box-shadow:0 4px 12px rgba(16,185,129,0.3);">${isOwner ? '💾 حفظ وتعميم القالب والهوية ✓' : '💾 حفظ هوية وقالب الشبكة ✓'}</button>
                    </div>
                </div>

                <!-- Section 1: Template Switcher -->
                <div class="gov-card">
                    <div class="gov-card-header">
                        <div class="gov-card-title">
                            <span style="font-size:22px;">🌟</span>
                            <div>
                                <h3>${isOwner ? 'مبدل قوالب النظام الشاملة (Full System Template Switcher)' : 'مبدل قالب الشبكة النشطة'}</h3>
                                <small>${isOwner ? 'اختر أحد القوالب الاحترافية ليتم تطبيق ألوانه وكثافته ونمطه على المنصة بالكامل.' : 'اختر قالبًا لتطبيق ألوانه وكثافته ونمطه على الشبكة النشطة فقط.'}</small>
                            </div>
                        </div>
                    </div>
                    <div class="gov-template-grid" id="gov-template-grid">
                        ${templateCards}
                    </div>
                </div>

                <!-- Section 2: Branding & Logo & Contact Info -->
                <div class="gov-card">
                    <div class="gov-card-header">
                        <div class="gov-card-title">
                            <span style="font-size:22px;">🏷️</span>
                            <div>
                                <h3>هوية الشبكة والنظام، الشعار وبيانات التواصل</h3>
                                <small>تعديل اسم المنشأة والشبكة، الأيقونة/الشعار، هاتف التواصل، والعنوان لظهورها في الترويسات، الكشوفات، الفواتير وشريط النظام.</small>
                            </div>
                        </div>
                    </div>
                    <div class="gov-branding-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
                        <div class="form-group">
                            <label style="font-weight:700;">🌐 اسم الشبكة / المنشأة *</label>
                            <input id="gov-name" class="mt-input" value="${esc(s.system_name || s.network_name || ui.app_title || 'SAM')}" oninput="App.livePreviewGovBrand()" placeholder="مثال: شبكة النور اللاسلكية">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700;">🏷️ الاسم المختصر للهاتف</label>
                            <input id="gov-short-name" class="mt-input" maxlength="30" value="${esc(s.system_short_name || ui.app_short_title || 'SAM')}" oninput="App.livePreviewGovBrand()" placeholder="SAM">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700;">📞 رقم هاتف التواصل</label>
                            <input id="gov-phone" class="mt-input" dir="ltr" value="${esc(s.contact_phone || s.phone || '')}" placeholder="مثال: 777123456">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700;">📍 عنوان وبيانات الشبكة</label>
                            <input id="gov-address" class="mt-input" value="${esc(s.system_address || s.address || '')}" placeholder="مثال: صنعاء - شارع الحدة">
                        </div>
                        ${isOwner ? `
                        <div class="form-group">
                            <label style="font-weight:700;">🌐 رابط الدومين العام (Public Domain)</label>
                            <input id="gov-domain" class="mt-input" dir="ltr" value="${esc(s.public_domain || '')}">
                        </div>` : `
                        <div class="form-group">
                            <label style="font-weight:700;">🌐 رابط الدومين العام (Public Domain)</label>
                            <div class="mt-input" style="background:#f8fafc;color:#64748b;min-height:38px;display:flex;align-items:center;">🔒 يُدار مركزيًا من مالك النظام</div>
                        </div>`}
                    </div>

                    <div style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
                        <div><label style="font-weight:700;font-size:12px;">نوع الرموز للكروت</label><select id="gov-character-set" class="mt-select"><option value="mixed">حروف وأرقام</option><option value="letters">حروف فقط</option><option value="numbers">أرقام فقط</option><option value="uppercase">أحرف كبيرة وأرقام</option></select></div>
                        <div><label style="font-weight:700;font-size:12px;">نظام كلمة المرور</label><select id="gov-password-mode" class="mt-select"><option value="different">مستخدم وكلمة مرور مختلفان</option><option value="same">المستخدم = كلمة المرور</option><option value="username_only">اسم مستخدم فقط</option></select></div>
                        <div><label style="font-weight:700;font-size:12px;">العملة الأساسية</label><input id="gov-base-currency" class="mt-input" value="YER_SANAA" maxlength="20" dir="ltr"></div>
                        <div><label style="font-weight:700;font-size:12px;">أرقام الاتصال المباشر</label><input id="gov-direct-phones" class="mt-input" placeholder="رقم، رقم، رقم"></div>
                        <div><label style="font-weight:700;font-size:12px;">رقم واتساب الاستفسارات</label><input id="gov-whatsapp-phone" class="mt-input" dir="ltr"></div>
                        <div><label style="font-weight:700;font-size:12px;">الشعار اللفظي / Slogan</label><input id="gov-slogan" class="mt-input"></div>
                    </div>
                    <div style="margin-top:12px;background:#f8fafc;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
                        <label style="font-weight:700;font-size:12px;display:block;margin-bottom:6px;">حسابات المحافظ الإلكترونية والعملات</label>
                        <textarea id="gov-wallet-accounts" class="mt-input" rows="3" placeholder="الحساب | YER_SANAA, SAR
الحساب الثاني | USD"></textarea>
                        <small style="color:#64748b;font-size:11px;">سطر لكل محفظة، بالشكل: رقم الحساب أو المحفظة | العملات مفصولة بفاصلة.</small>
                    </div>

                    <div style="margin-top:16px;">
                        <label style="font-weight:700;font-size:13px;display:block;margin-bottom:8px;">🖼️ أيقونة وشعار الشبكة الرسمي (PNG / Image Logo)</label>
                        <div class="gov-logo-box" style="display:flex; align-items:center; gap:16px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0; flex-wrap:wrap;">
                            <img id="gov-logo-preview" src="${esc(s.logo_url || 'assets/img/log.png')}" class="gov-logo-preview" style="height:60px; width:auto; max-width:100px; object-fit:contain; border-radius:6px; background:#fff; padding:4px; border:1px solid #cbd5e1;" alt="شعار الشبكة">
                            <div style="flex:1; min-width:250px;">
                                <div class="gov-logo-controls" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                                    <input id="gov-logo" type="file" accept="image/*,.png,.jpg,.jpeg,.webp" onchange="App.previewGovLogo(this)" style="font-size:12px;">
                                    <button id="gov-logo-btn" type="button" class="mt-btn mt-btn-primary" style="padding:6px 14px; font-weight:700;" onclick="App.uploadGovLogo()">⬆️ رفع واعتماد الشعار</button>
                                </div>
                                <div style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                    <label style="font-size:11px; font-weight:700; color:#475569; white-space:nowrap;">أو ضع رابط الشعار المباشر (Logo URL):</label>
                                    <input id="gov-logo-url-input" class="mt-input" style="font-size:12px; padding:4px 8px; direction:ltr; text-align:right; flex:1; min-width:200px;" value="${esc(s.logo_url || '')}" placeholder="assets/img/log.png" oninput="const img=document.getElementById('gov-logo-preview'); if(img) img.src=this.value||'assets/img/log.png';">
                                </div>
                                <p class="owner-help" style="margin-top:6px; font-size:11px; color:#64748b;">صورة PNG أو JPEG أو WebP بخلفية شفافة لتظهر بأعلى جودة في الترويسات والفواتير وشريط النظام.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Advanced Palette & Density -->
                <div class="gov-card">
                    <div class="gov-card-header">
                        <div class="gov-card-title">
                            <span style="font-size:22px;">🎨</span>
                            <div>
                                <h3>لوحة الألوان المتقدمة وكثافة العرض (Custom Palette & Density)</h3>
                                <small>${isOwner ? 'يمكنك تعديل أي لون بدقة؛ التعديل ينعكس مباشرة أثناء الاختيار.' : 'يمكن لمدير الشبكة تعديل ألوان الشبكة النشطة فقط؛ المعاينة لا تغيّر إعدادات شبكة أخرى.'}</small>
                            </div>
                        </div>
                    </div>
                    <div class="gov-palette-grid">
                        <div class="gov-palette-item">
                            <label>اللون الرئيسي (Primary)<span id="lbl-primary">${p.primary || '#0284c7'}</span></label>
                            <input type="color" id="gov-primary" data-sam-color="primary" value="${p.primary || s.primary_color || '#0284c7'}" oninput="App.liveGovPaletteChange()">
                        </div>
                        <div class="gov-palette-item">
                            <label>لون الترويسة (Header)<span id="lbl-header">${p.header || '#0f172a'}</span></label>
                            <input type="color" id="gov-header" data-sam-color="header" value="${p.header || s.header_color || '#0f172a'}" oninput="App.liveGovPaletteChange()">
                        </div>
                        <div class="gov-palette-item">
                            <label>لون القائمة (Sidebar)<span id="lbl-sidebar">${p.sidebar || '#1e293b'}</span></label>
                            <input type="color" id="gov-sidebar" data-sam-color="sidebar" value="${p.sidebar || s.sidebar_color || '#1e293b'}" oninput="App.liveGovPaletteChange()">
                        </div>
                        <div class="gov-palette-item">
                            <label>لون التحديد (Active Item)<span id="lbl-active">${p.sidebar_active || '#0284c7'}</span></label>
                            <input type="color" id="gov-active" data-sam-color="sidebar_active" value="${p.sidebar_active || s.sidebar_active || '#0284c7'}" oninput="App.liveGovPaletteChange()">
                        </div>
                        <div class="gov-palette-item">
                            <label>لون النجاح والإيراد (Success)<span id="lbl-success">${p.success || '#10b981'}</span></label>
                            <input type="color" id="gov-success" data-sam-color="success" value="${p.success || s.success_color || '#10b981'}" oninput="App.liveGovPaletteChange()">
                        </div>
                        <div class="gov-palette-item">
                            <label>لون التنبيه والخطر (Danger)<span id="lbl-danger">${p.danger || '#ef4444'}</span></label>
                            <input type="color" id="gov-danger" data-sam-color="danger" value="${p.danger || s.danger_color || '#ef4444'}" oninput="App.liveGovPaletteChange()">
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:16px;">
                        <div class="form-group">
                            <label style="font-weight:700;font-size:12.5px;">كثافة الواجهة والأزرار (Interface Density)</label>
                            <select class="mt-select" id="gov-density" onchange="App.liveGovDensityChange(this.value)">
                                <option value="compact" ${ui.layout_density === 'compact' ? 'selected' : ''}>🗜️ مضغوطة (استغلال أقصى مساحة للشاشات والبيانات)</option>
                                <option value="normal" ${(ui.layout_density === 'normal' || !ui.layout_density) ? 'selected' : ''}>⚖️ متوازنة (قياسية وعصرية موصى بها)</option>
                                <option value="comfortable" ${ui.layout_density === 'comfortable' ? 'selected' : ''}>🛋️ مريحة (أزرار كبيرة ومتباعدة للمس والهاتف)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700;font-size:12.5px;">نمط عرض الجداول الافتراضي (Table View Mode)</label>
                            <select class="mt-select" id="gov-table-view-mode">
                                <option value="standard" ${(s.table_view_mode === 'standard' || !s.table_view_mode) ? 'selected' : ''}>📊 جدول كلاسيكي متجاوب مع تمرير سلس</option>
                                <option value="cards" ${s.table_view_mode === 'cards' ? 'selected' : ''}>📱 بطاقات تفاعلية ذكية (Card View)</option>
                                <option value="compact" ${s.table_view_mode === 'compact' ? 'selected' : ''}>🗂️ صفوف مدمجة عالية الكثافة (Compact Grid)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Navigation & Screens Studio -->
                <div class="gov-card">
                    <div class="gov-card-header">
                        <div class="gov-card-title">
                            <span style="font-size:22px;">🧭</span>
                            <div>
                                <h3>استوديو هيكلة وترتيب القوائم وشاشات النظام (Navigation Studio)</h3>
                                <small>رتب الأقسام والعمليات المسموح بها في ${isOwner ? 'المنصة' : 'الشبكة النشطة'} لتظهر أولاً عبر زر <b>🔝 إلى المقدمة</b>.</small>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button type="button" class="mt-btn" onclick="App.toggleAllStudioDepts(true)" style="font-size:11.5px;">➕ فتح الكل</button>
                            <button type="button" class="mt-btn" onclick="App.toggleAllStudioDepts(false)" style="font-size:11.5px;">➖ طي الكل</button>
                        </div>
                    </div>
                    <div class="sam-studio-search-bar"><input type="text" class="mt-input" placeholder="🔎 بحث وتصفية فورية في الأقسام والعمليات..." oninput="App.filterStudioItems(this.value)"></div>
                    <div id="sam-studio-sections-list" class="sam-studio-sections-list">${sectionCards}</div>
                </div>

                <!-- Section 5: Mobile Bottom Navigation -->
                <div class="gov-card">
                    <div class="gov-card-header">
                        <div class="gov-card-title">
                            <span style="font-size:22px;">📱</span>
                            <div>
                                <h3>تخصيص الشريط السفلي للهواتف الذكية (Mobile Bottom Navigation)</h3>
                                <small>حدد العمليات الخمس الرئيسية التي تظهر في شريط التنقل السريع أسفل شاشة الهاتف.</small>
                            </div>
                        </div>
                    </div>
                    <div class="gov-mobilenav-grid">
                        ${bottomNavSlotsHtml}
                    </div>
                </div>

                <!-- Sticky Universal Save & Broadcast Bar -->
                <div class="gov-save-bar">
                    <div class="gov-save-info">
                        <span style="font-size:24px;">🌐</span>
                        <div>
                            <div><b>${isOwner ? 'تعميم التخصيص لجميع المستخدمين:' : 'نطاق التخصيص:'}</b> ${isOwner ? 'سيتم تطبيق القالب، الهوية، الألوان، وترتيب القوائم كإعداد افتراضي عام لجميع المشرفين والوكلاء.' : 'سيتم تطبيق القالب، الهوية، الألوان، وترتيب القوائم على مستخدمي الشبكة النشطة فقط؛ لا يتم تعديل الدومين العام أو إعدادات شبكة أخرى.'}</div>
                        </div>
                    </div>
                    <div class="gov-save-actions">
                        <button type="button" class="mt-btn mt-btn-warning" onclick="App.resetGovUiDefaults()">🔄 استعادة الافتراضي</button>
                        <button type="button" class="mt-btn mt-btn-success" onclick="App.saveSystemUiGovernance()" style="font-size:14px;font-weight:bold;padding:10px 22px;">${isOwner ? '💾 حفظ وتعميم القالب والهوية للجميع ✓' : '💾 حفظ هوية وقالب الشبكة ✓'}</button>
                    </div>
                </div>
            </div>
        `;

        for(const [id,key,fallback] of [['gov-character-set','character_set','mixed'],['gov-password-mode','password_mode','username_only'],['gov-base-currency','base_currency','YER_SANAA'],['gov-direct-phones','direct_phones',''],['gov-whatsapp-phone','whatsapp_phone',''],['gov-slogan','slogan','']]){const el=document.getElementById(id);if(el)el.value=s[key]??ui[key]??fallback;}
        const walletEl=document.getElementById('gov-wallet-accounts');if(walletEl)walletEl.value=(s.wallet_accounts??ui.wallet_accounts??[]).map(w=>`${w.account} | ${w.currencies.join(', ')}`).join('\n');
        if (this.reindexStudioOrders) this.reindexStudioOrders();
    };

    /* Live selection and preview of system templates */
    App.selectGovTemplate = function (templateId) {
        const t = this.systemTemplates.find(x => x.id === templateId);
        if (!t) return;
        this.activeSelectedTemplate = templateId;

        // 1. Highlight card
        document.querySelectorAll('.gov-template-card').forEach(c => c.classList.remove('active'));
        const card = document.getElementById('gov-tpl-' + templateId);
        if (card) card.classList.add('active');

        // 2. Set color inputs
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
            const lbl = document.getElementById('lbl-' + id.replace('gov-', ''));
            if (lbl) lbl.textContent = val;
        };
        setVal('gov-primary', t.palette.primary);
        setVal('gov-header', t.palette.header);
        setVal('gov-sidebar', t.palette.sidebar);
        setVal('gov-active', t.palette.sidebar_active);
        setVal('gov-success', t.palette.success);
        setVal('gov-danger', t.palette.danger);

        // 3. Set density & table mode
        const dens = document.getElementById('gov-density');
        if (dens) dens.value = t.density;
        const tbl = document.getElementById('gov-table-view-mode');
        if (tbl) tbl.value = t.tableViewMode;

        // 4. Live apply to CSS variables
        this.liveGovPaletteChange();
        this.liveGovDensityChange(t.density);

        this.toast('✨ تم اختيار ومعاينة قالب: ' + t.name, 'info');
    };

    App.liveGovPaletteChange = function () {
        const root = document.documentElement;
        const p = {
            primary: document.getElementById('gov-primary')?.value || '#0284c7',
            header: document.getElementById('gov-header')?.value || '#0f172a',
            sidebar: document.getElementById('gov-sidebar')?.value || '#1e293b',
            sidebar_active: document.getElementById('gov-active')?.value || '#0284c7',
            success: document.getElementById('gov-success')?.value || '#10b981',
            danger: document.getElementById('gov-danger')?.value || '#ef4444'
        };
        root.style.setProperty('--accent-blue', p.primary);
        root.style.setProperty('--bg-header', p.header);
        root.style.setProperty('--bg-sidebar', p.sidebar);
        root.style.setProperty('--sidebar-active', p.sidebar_active);
        root.style.setProperty('--accent-green', p.success);
        root.style.setProperty('--accent-red', p.danger);

        ['primary', 'header', 'sidebar', 'active', 'success', 'danger'].forEach(k => {
            const lbl = document.getElementById('lbl-' + k);
            const input = document.getElementById('gov-' + k);
            if (lbl && input) lbl.textContent = input.value;
        });
    };

    App.liveGovDensityChange = function (density) {
        document.body.classList.remove('sam-density-compact', 'sam-density-comfortable');
        if (density === 'compact') document.body.classList.add('sam-density-compact');
        if (density === 'comfortable') document.body.classList.add('sam-density-comfortable');
    };

    App.livePreviewGovBrand = function () {
        const full = document.getElementById('gov-name')?.value || '';
        const short = document.getElementById('gov-short-name')?.value || '';
        const bFull = document.querySelector('.brand-title-full');
        const bShort = document.querySelector('.brand-title-short');
        if (bFull && full) bFull.textContent = full;
        if (bShort && short) bShort.textContent = short;
        if (full) document.title = full;
    };

    App.previewGovLogo = function (input) {
        const f = input.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) {
            input.value = '';
            return this.toast('اختر صورة لا تتجاوز 5MB', 'warning');
        }
        const img = document.getElementById('gov-logo-preview');
        if (img) img.src = URL.createObjectURL(f);
    };

    App.uploadGovLogo = async function () {
        const input = document.getElementById('gov-logo'), f = input?.files?.[0];
        if (!f) return this.toast('اختر صورة أولاً للشعار', 'warning');
        if (f.size > 5 * 1024 * 1024) return this.toast('الملف يجب ألا يتجاوز 5MB', 'warning');
        const btn = document.getElementById('gov-logo-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'جاري رفع واعتماد الشعار...'; }
        try {
            const fd = new FormData();
            fd.append('logo', f, f.name);
            const res = await fetch('api.php?action=owner_system_logo', { method: 'POST', body: fd, credentials: 'same-origin' });
            const text = await res.text();
            let r;
            try { r = JSON.parse(text); } catch (e) { throw new Error('استجابة غير صالحة: ' + text.slice(0, 120)); }
            this.toast(r.message || r.error, r.success ? 'success' : 'danger');
            if (r.success && r.logo_url) {
                const img = document.getElementById('gov-logo-preview');
                if (img) img.src = r.logo_url;
                const inputUrl = document.getElementById('gov-logo-url-input');
                if (inputUrl) inputUrl.value = r.logo_url;
                const headerLogo = document.querySelector('.brand-logo, #header-logo');
                if (headerLogo) headerLogo.src = r.logo_url;
            }
        } catch (e) {
            this.toast('فشل رفع الشعار: ' + e.message, 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⬆️ رفع واعتماد الشعار'; }
        }
    };

    /* ─── Standalone Sovereign Firewall & Security Center ─── */
    App.renderOwnerFirewallStandalone = async function () {
        const view = document.getElementById('main-view') || document.getElementById('app-root');
        if (!view) return;

        const PB = window.SamUI?.PageBuilder;
        const actions = [
            { label: '🛡️ القواعد الافتراضية للدرع', variant: 'warning', onclick: 'App.resetOwnerFirewallDefaults()' },
            { label: '⟳ تحديث الشامل', variant: 'primary', onclick: 'App.loadOwnerFirewall()' }
        ];

        const content = `
            <div class="mt-card owner-console" style="margin-bottom:20px; padding:0; overflow:hidden;">
                <div class="owner-console-head" style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; padding:20px 24px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-right:6px solid #d97706; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                    <div>
                        <h2 style="margin:0; font-size:19px; font-weight:800; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <span>🛡️</span> مركز جدار الحماية والأمان السيادي (Sovereign Firewall & Security)
                        </h2>
                        <small style="opacity:0.85; font-size:12.5px; display:block; margin-top:4px;">
                            إدارة مستقلة ومباشرة لـ UFW, IP Rules, Banned IPs, Port Forwarding, والقواعد الجغرافية والدرع المؤسسي
                        </small>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <span class="status-pill" style="background:rgba(217,119,6,0.2); color:#fbbf24; border:1px solid rgba(217,119,6,0.4); padding:5px 14px; border-radius:20px; font-weight:700; font-size:12px;">
                            👑 إدارة مستقلة لمالك المنظومة
                        </span>
                        <button class="mt-btn" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:6px 14px; font-size:12px;" onclick="App.loadOwnerFirewall()">
                            🔄 تحديث البيانات
                        </button>
                    </div>
                </div>
            </div>

            <div id="owner-firewall-content" style="min-height:400px; width:100%; overflow-x:hidden;">
                <div style="text-align:center; padding:40px; color:var(--text-muted); font-size:15px;">
                    ⏳ جاري جلب مصفوفة الحماية الموحدة وقواعد الأسبقية الجغرافية والمؤسسية...
                </div>
            </div>
        `;

        if (PB && typeof PB.renderPage === 'function') {
            view.innerHTML = PB.renderPage({
                title: '🛡️ جدار الحماية والأمان السيادي',
                subtitle: 'إدارة مستقلة وشاملة لمنظومة الأمان والدرع المؤسسي وجدار الحماية للمالك',
                icon: '🛡️',
                actions: actions,
                bodyHtml: content
            });
        } else {
            view.innerHTML = content;
        }

        await this.loadOwnerFirewall();
    };

    /* Save and broadcast complete governance settings to all users */
    App.saveSystemUiGovernance = async function () {
        const isOwner = Boolean(this.isSystemOwner) || this.userRole === 'system_owner';
        const systemName = document.getElementById('gov-name')?.value?.trim() || 'SAM';
        const systemShortName = document.getElementById('gov-short-name')?.value?.trim() || 'SAM';
        const contactPhone = document.getElementById('gov-phone')?.value?.trim() || '';
        const systemAddress = document.getElementById('gov-address')?.value?.trim() || '';
        const logoUrl = document.getElementById('gov-logo-url-input')?.value?.trim() || document.getElementById('gov-logo-preview')?.src || '';
        const density = document.getElementById('gov-density')?.value || 'normal';
        const tableViewMode = document.getElementById('gov-table-view-mode')?.value || 'standard';
        const walletAccounts = (document.getElementById('gov-wallet-accounts')?.value || '').split('\n').map(line => { const parts=line.split('|'); return {account:(parts[0]||'').trim(), currencies:(parts[1]||'').split(',').map(x=>x.trim()).filter(Boolean)}; }).filter(x=>x.account && x.currencies.length);

        const palette = {
            primary: document.getElementById('gov-primary')?.value || '#0284c7',
            header: document.getElementById('gov-header')?.value || '#0f172a',
            sidebar: document.getElementById('gov-sidebar')?.value || '#1e293b',
            sidebar_active: document.getElementById('gov-active')?.value || '#0284c7',
            success: document.getElementById('gov-success')?.value || '#10b981',
            danger: document.getElementById('gov-danger')?.value || '#ef4444'
        };

        // Read mobile bottom navigation slots
        const bottomNav = [];
        for (let i = 0; i < 5; i++) {
            const sel = document.getElementById('gov-bottom-slot-' + i);
            if (sel && sel.value) {
                const parts = sel.value.split('|');
                bottomNav.push({
                    tab: parts[0] || 'dashboard',
                    title: parts[1] || parts[0],
                    icon: parts[2] || '📊'
                });
            }
        }

        // Read navigation studio layout and custom labels
        const studio = (this.readStudioSettings ? this.readStudioSettings() : {});

        const ownerPayload = {
            system_name: systemName,
            network_name: systemName,
            system_short_name: systemShortName,
            contact_phone: contactPhone,
            system_address: systemAddress,
            logo_url: logoUrl,
            slogan: document.getElementById('gov-slogan')?.value?.trim() || '',
            direct_phones: document.getElementById('gov-direct-phones')?.value?.trim() || '',
            whatsapp_phone: document.getElementById('gov-whatsapp-phone')?.value?.trim() || '',
            character_set: document.getElementById('gov-character-set')?.value || 'mixed',
            password_mode: document.getElementById('gov-password-mode')?.value || 'different',
            base_currency: document.getElementById('gov-base-currency')?.value?.trim() || 'YER_SANAA',
            wallet_accounts: walletAccounts,
            public_domain: document.getElementById('gov-domain')?.value?.trim() || '',
            primary_color: palette.primary,
            header_color: palette.header,
            sidebar_color: palette.sidebar,
            sidebar_active: palette.sidebar_active,
            success_color: palette.success,
            danger_color: palette.danger,
            system_template: this.activeSelectedTemplate,
            layout_density: density,
            table_view_mode: tableViewMode
        };

        const uiPayload = {
            app_title: systemName,
            app_short_title: systemShortName,
            contact_phone: contactPhone,
            system_address: systemAddress,
            logo_url: logoUrl,
            theme_palette: palette,
            layout_density: density,
            system_template: this.activeSelectedTemplate,
            table_defaults: { view_mode: tableViewMode, density: density },
            module_labels: studio.module_labels || {},
            sidebar_layout: studio.sidebar_layout || {},
            mobile_bottom_nav: bottomNav.length > 0 ? bottomNav : undefined,
            save_as_system_default: true
        };

        const networkPayload = {
            system_name: systemName,
            network_name: systemName,
            system_short_name: systemShortName,
            contact_phone: contactPhone,
            system_address: systemAddress,
            logo_url: logoUrl,
            slogan: document.getElementById('gov-slogan')?.value?.trim() || '',
            direct_phones: document.getElementById('gov-direct-phones')?.value?.trim() || '',
            whatsapp_phone: document.getElementById('gov-whatsapp-phone')?.value?.trim() || '',
            character_set: document.getElementById('gov-character-set')?.value || 'mixed',
            password_mode: document.getElementById('gov-password-mode')?.value || 'different',
            base_currency: document.getElementById('gov-base-currency')?.value?.trim() || 'YER_SANAA',
            wallet_accounts: walletAccounts,
            system_template: this.activeSelectedTemplate,
            layout_density: density,
            table_view_mode: tableViewMode,
            theme_palette: palette,
            module_labels: studio.module_labels || {},
            sidebar_layout: studio.sidebar_layout || {},
            mobile_bottom_nav: bottomNav.length > 0 ? bottomNav : undefined
        };

        this.toast(isOwner ? 'جاري حفظ وتعميم القالب والهوية في قاعدة البيانات...' : 'جاري حفظ هوية وقالب الشبكة النشطة...', 'info');

        try {
            let result;
            const networkResult = await this.api('save_network_ui_settings', {}, 'POST', networkPayload);
            if (isOwner) {
                const [ownerDefaultResult, globalUiResult] = await Promise.all([
                    this.api('owner_system_save', {}, 'POST', ownerPayload),
                    this.api('save_ui_settings', uiPayload, 'POST')
                ]);
                result = !networkResult?.success ? networkResult : !ownerDefaultResult?.success ? ownerDefaultResult : globalUiResult;
            } else {
                result = networkResult;
            }

            if (result && result.success) {
                this.toast(isOwner ? '🎉 تم حفظ وتعميم القالب والهوية الافتراضية لكافة المشرفين والمستخدمين بنجاح ✓' : '✅ تم حفظ هوية وقالب الشبكة النشطة فقط بنجاح ✓', 'success');
                await this.loadUISettings(true);
                this.applyThemePalette();
                this.applyConfiguredBrand();
                this.departments = this.getConfiguredDepartments();
                this.showMainApp();
                this.switchTab('system_ui_governance');
            } else {
                this.toast(result?.error || 'فشل حفظ الإعدادات', 'danger');
            }
        } catch (e) {
            this.toast('خطأ أثناء الحفظ: ' + e.message, 'danger');
        }
    };

    App.resetGovUiDefaults = async function () {
        const c = prompt('للتأكيد اكتب: استعادة إعدادات الواجهات');
        if (c !== 'استعادة إعدادات الواجهات') return;
        const isOwner = Boolean(this.isSystemOwner) || this.userRole === 'system_owner';
        const r = isOwner
            ? await this.api('owner_system_reset_ui', {}, 'POST', { confirmation: c })
            : await this.api('reset_network_ui_settings', {}, 'POST', { confirmation: c });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) {
            this.uiSettings = null;
            await this.loadUISettings(true);
            this.applyThemePalette();
            this.applyConfiguredBrand();
            this.showMainApp();
            this.switchTab('system_ui_governance');
        }
    };

    /* Owner Service Actions */
    App.ownerService = async function (unit, operation) {
        if (!confirm('تأكيد ' + operation + ' للخدمة ' + unit + '؟')) return;
        const r = await this.api('owner_system_service', {}, 'POST', { unit, operation });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        this.renderSystemOwnerConsole();
    };

    App.changeOwnerPort = async function () {
        const r = await this.api('owner_system_port', {}, 'POST', {
            port: Number(document.getElementById('own-port').value),
            confirmation: document.getElementById('own-port-confirm').value
        });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
    };

    App.ownerResetUi = async function () {
        const c = prompt('للتأكيد اكتب: استعادة إعدادات الواجهات');
        if (c === null) return;
        const r = await this.api('owner_system_reset_ui', {}, 'POST', { confirmation: c });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
    };

    App.ownerResetFinancial = async function () {
        const c = prompt('عملية حساسة وتنشئ النسخة الاحتياطية وفق مسار الصيانة. للتأكيد اكتب: تصفير الحسابات');
        if (c !== 'تصفير الحسابات') return this.toast('لم يتم التصفير: عبارة التأكيد غير صحيحة', 'warning');
        const r = await this.api('reset_financial_system', {}, 'POST', { confirm: true, confirmation: c });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
    };

    App.ownerBuildFactory = async function () {
        const c = prompt('اكتب: إنشاء صورة المصنع');
        if (c !== 'إنشاء صورة المصنع') return;
        const p = prompt('أدخل كلمة مرور مالك النظام');
        if (p === null) return;
        const r = await this.api('owner_system_build_factory', {}, 'POST', { confirmation: c, password: p });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) this.renderSystemOwnerConsole();
    };

    App.ownerFactoryReset = async function () {
        const c = prompt('سيتم أخذ نسخة كاملة ثم حذف جميع بيانات التشغيل. اكتب: إعادة المصنع وحذف البيانات');
        if (c !== 'إعادة المصنع وحذف البيانات') return;
        const p = prompt('أدخل كلمة مرور مالك النظام');
        if (p === null) return;
        const r = await this.api('owner_system_factory_reset', {}, 'POST', { confirmation: c, password: p });
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        if (r?.success) setTimeout(() => location.reload(), 2500);
    };

    App.ownerMaintenanceRebuild = async function () {
        if (!confirm('فحص التكوين وإعادة تشغيل خدمات النظام من إعدادات قاعدة البيانات؟')) return;
        const r = await this.api('owner_system_maintenance_rebuild', {}, 'POST', {});
        this.toast(r?.message || r?.error, r?.success ? 'success' : 'danger');
        this.renderSystemOwnerConsole();
    };

    // =========================================================================
    // 👑 SOVEREIGN OWNER PORTAL (البوابة السيادية لمالك النظام)
    // =========================================================================

    App.renderOwnerPortalOverview = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل بيانات البوابة السيادية الشاملة لمالك النظام...</div>';

        const [adminsRes, subRes, sysRes, waRes, tgRes] = await Promise.all([
            this.api('owner_system_get_network_admins').catch(() => null),
            this.api('owner_system_subscription_center').catch(() => null),
            this.api('owner_system_get').catch(() => null),
            this.api('owner_system_whatsapp_get').catch(() => null),
            this.api('owner_system_telegram_get').catch(() => null)
        ]);

        if (this.currentTab !== 'owner_portal_overview') return;

        const admins = adminsRes?.admins || [];
        const networks = adminsRes?.networks || [];
        const plans = subRes?.plans || [];
        const subscriptions = subRes?.networks || [];
        const adminSummary = adminsRes?.summary || { total_admins: admins.length, active_admins: admins.filter(a=>a.is_active).length, disabled_admins: 0, total_networks: networks.length };
        const res = sysRes?.resources || {};
        const services = sysRes?.services || [];
        const waStatus = waRes?.session_status || {};
        const isWaConnected = Boolean(waStatus.connected);
        const isWaQr = waStatus.status === 'QR_READY';
        const tgCfg = tgRes?.telegram || {};
        const isTgConfigured = Boolean(tgCfg.enabled && tgCfg.bot_token);

        const activeNets = networks.filter(n => n.status === 'active' || !n.status);
        const suspendedNets = networks.filter(n => n.status === 'suspended');

        const diskFreeGb = res.disk_free ? (res.disk_free / (1024*1024*1024)).toFixed(1) : 0;
        const diskTotalGb = res.disk_total ? (res.disk_total / (1024*1024*1024)).toFixed(1) : 1;
        const diskPct = diskTotalGb > 0 ? Math.round(((diskTotalGb - diskFreeGb) / diskTotalGb) * 100) : 0;

        const memAvailMb = res.memory_available ? Math.round(res.memory_available / (1024*1024)) : 0;
        const memTotMb = res.memory_total ? Math.round(res.memory_total / (1024*1024)) : 1;
        const memPct = memTotMb > 0 ? Math.round(((memTotMb - memAvailMb) / memTotMb) * 100) : 0;

        const activeServices = services.filter(s => s.state === 'active').length;
        const totalServices = services.length || 8;

        const content = `
            <!-- Top Sovereign Banner -->
            <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; border-radius:14px; padding:22px 24px; margin-bottom:20px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.25); border:1px solid #d97706;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size:26px;">👑</span>
                            <h2 style="margin:0; font-size:22px; font-weight:800; color:#fbbf24;">بوابة مالك النظام والتحكم السيادي (Sovereign Hub)</h2>
                            <span class="mt-badge" style="background:#d97706; color:#fff; font-size:11px; font-weight:800; padding:3px 9px; border-radius:12px;">SOVEREIGN CONSOLE</span>
                        </div>
                        <div style="color:#cbd5e1; font-size:13px; max-width:750px; line-height:1.7;">
                            المركز السيادي الموحد لمالك المنظومة للتحكم الشامل بالسيرفر، إدارة شبكات العملاء واشتراكاتها، تفويض المدراء، ومتابعة قنوات الواتساب وتلغرام السيادية.
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="mt-btn" style="background:#10b981; color:#fff; font-weight:800; border:none; padding:8px 14px; border-radius:8px;" onclick="App.openAddClientNetworkModal()">
                            ➕ إضافة شبكة عميل جديدة
                        </button>
                        <button class="mt-btn" style="background:#0284c7; color:#fff; font-weight:800; border:none; padding:8px 14px; border-radius:8px;" onclick="App.switchTab('system_settings')">
                            🖥️ التحكم بالسيرفر والخدمات
                        </button>
                        <button class="mt-btn" style="background:#8b5cf6; color:#fff; font-weight:800; border:none; padding:8px 14px; border-radius:8px;" onclick="App.switchTab('owner_diagnostics')">
                            🩺 الفحص التشخيصي
                        </button>
                        <button class="mt-btn" style="background:#16a34a; color:#fff; font-weight:800; border:none; padding:8px 14px; border-radius:8px;" onclick="App.switchTab('owner_whatsapp')">
                            📱 واتساب المالك
                        </button>
                        <button class="mt-btn" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:8px 14px; border-radius:8px;" onclick="App.renderOwnerPortalOverview()">
                            🔄 تحديث
                        </button>
                    </div>
                </div>
            </div>

            <!-- KPI Metric Cards (Sovereign Overview) -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:14px; margin-bottom:20px;">
                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #0284c7; cursor:pointer;" onclick="App.switchTab('owner_clients_networks')" title="إدارة كافة شبكات العملاء">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">🏢 شبكات العملاء</div>
                        <span style="font-size:22px;">🏢</span>
                    </div>
                    <div style="font-size:28px; font-weight:800; color:#0f172a; margin:6px 0 2px;">${networks.length}</div>
                    <div style="font-size:11.5px; color:#10b981; font-weight:700;">${activeNets.length} نشطة · ${suspendedNets.length} معلقة</div>
                </div>

                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #d97706; cursor:pointer;" onclick="App.switchTab('network_subscriptions')" title="باقات واشتراكات العملاء">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">💎 الاشتراكات والتراخيص</div>
                        <span style="font-size:22px;">💎</span>
                    </div>
                    <div style="font-size:28px; font-weight:800; color:#0f172a; margin:6px 0 2px;">${subscriptions.length || networks.length}</div>
                    <div style="font-size:11.5px; color:#d97706; font-weight:700;">${plans.length} باقات معرفة</div>
                </div>

                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #3b82f6; cursor:pointer;" onclick="App.switchTab('owner_network_admins')" title="حسابات مدراء الشبكات">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">👥 مدراء الشبكات</div>
                        <span style="font-size:22px;">👥</span>
                    </div>
                    <div style="font-size:28px; font-weight:800; color:#0f172a; margin:6px 0 2px;">${adminSummary.total_admins}</div>
                    <div style="font-size:11.5px; color:#10b981; font-weight:700;">${adminSummary.active_admins} حساب نشط ومفعل</div>
                </div>

                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #10b981; cursor:pointer;" onclick="App.switchTab('system_settings')" title="التحكم بخدمات السيرفر">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">🖥️ خدمات السيرفر</div>
                        <span style="font-size:22px;">⚙️</span>
                    </div>
                    <div style="font-size:28px; font-weight:800; color:#0f172a; margin:6px 0 2px;">${activeServices}/${totalServices}</div>
                    <div style="font-size:11.5px; color:#10b981; font-weight:700;">Apache · PHP-FPM · DB · SSTP</div>
                </div>

                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #16a34a; cursor:pointer;" onclick="App.switchTab('owner_whatsapp')" title="حالة جلسة واتساب المالك">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">📱 واتساب المالك</div>
                        <span style="font-size:22px;">📱</span>
                    </div>
                    <div style="font-size:19px; font-weight:800; color:${isWaConnected ? '#16a34a' : (isWaQr ? '#d97706' : '#ef4444')}; margin:10px 0 4px;">
                        ${isWaConnected ? 'متصل ومقترن 🟢' : (isWaQr ? 'بانتظار QR 🟡' : 'غير متصل 🔴')}
                    </div>
                    <div style="font-size:11.5px; color:#64748b; font-weight:600;">جلسة سيادية #0 (إرسال OTP والإشعارات)</div>
                </div>

                <div class="mt-card" style="padding:16px 18px; border-right:4px solid #0284c7; cursor:pointer;" onclick="App.switchTab('owner_telegram')" title="حالة بوت تلغرام المالك">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; font-weight:700; color:#64748b;">✈️ تلغرام المالك</div>
                        <span style="font-size:22px;">✈️</span>
                    </div>
                    <div style="font-size:19px; font-weight:800; color:${isTgConfigured ? '#0284c7' : '#64748b'}; margin:10px 0 4px;">
                        ${isTgConfigured ? 'مفعل وجاهز 🟢' : 'غير مهيأ ⚪'}
                    </div>
                    <div style="font-size:11.5px; color:#64748b; font-weight:600;">تنبيهات السيرفر والأمان الفورية</div>
                </div>
            </div>

            <!-- Live Server Resources Bar -->
            <div class="mt-card" style="padding:18px 22px; margin-bottom:20px; background:#f8fafc; border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:16px;">🖥️</span>
                        <b style="font-size:14px; color:#0f172a;">موارد وأداء خادم النظام المباشرة</b>
                        <span style="font-size:11.5px; color:#64748b; font-weight:600;">(${this.escape(res.hostname || 'palapox.ddns.net')} · وقت التشغيل: ${this.escape(res.uptime || '-')})</span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="mt-btn mt-btn-sm" style="background:#0284c7; color:#fff; font-weight:700;" onclick="App.createInstantDatabaseBackup()">
                            💾 نسخة احتياطية فورية
                        </button>
                        <button type="button" class="mt-btn mt-btn-sm" style="background:#475569; color:#fff; font-weight:700;" onclick="App.clearServerCacheNow()">
                            🧹 تنظيف الكاش والذاكرة
                        </button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                            <span style="font-weight:700; color:#334155;">🧠 الذاكرة العشوائية (RAM)</span>
                            <span style="font-weight:800; color:#0284c7;">${memPct}% (${memTotMb - memAvailMb}MB / ${memTotMb}MB)</span>
                        </div>
                        <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                            <div style="height:100%; width:${memPct}%; background:${memPct > 85 ? '#ef4444' : '#0284c7'}; border-radius:4px;"></div>
                        </div>
                    </div>

                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                            <span style="font-weight:700; color:#334155;">💽 سعة التخزين (Disk)</span>
                            <span style="font-weight:800; color:#10b981;">${diskPct}% (متبقي ${diskFreeGb}GB / ${diskTotalGb}GB)</span>
                        </div>
                        <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                            <div style="height:100%; width:${diskPct}%; background:${diskPct > 85 ? '#ef4444' : '#10b981'}; border-radius:4px;"></div>
                        </div>
                    </div>

                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                            <span style="font-weight:700; color:#334155;">⚡ حمل المعالج (CPU Load)</span>
                            <span style="font-weight:800; color:#8b5cf6;">${Number(res.load?.[0] || 0).toFixed(2)} / ${Number(res.load?.[1] || 0).toFixed(2)}</span>
                        </div>
                        <div style="font-size:11px; color:#64748b; font-weight:600; margin-top:2px;">
                            ${this.escape(res.cpu || 'CPU Cores')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Client Networks Management Table (Overview) -->
            <div class="mt-card" style="padding:20px; margin-bottom:20px; border-right:4px solid #0284c7;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px; flex-wrap:wrap; gap:8px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <b style="font-size:16px; color:#0f172a;">🏢 شبكات العملاء التابعة للمنظومة</b>
                            <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:11px; padding:2px 8px; border-radius:10px;">
                                ${networks.length} عميل مسجل
                            </span>
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">
                            🔒 <b>تنبيه سيادي:</b> الشبكات تعتبر عملاء لدى النظام. واجهات التشغيل مخصصة لمدراء الشبكات عبر بوابتهم الخاصة.
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="mt-btn mt-btn-sm" style="background:#0284c7; color:#fff; font-weight:800;" onclick="App.openAddClientNetworkModal()">
                            ➕ إضافة شبكة عميل جديدة
                        </button>
                        <button class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#334155; font-weight:700; border:1px solid #cbd5e1;" onclick="App.switchTab('owner_clients_networks')">
                            عرض كافة العملاء والتفاصيل ↗
                        </button>
                    </div>
                </div>

                <div class="mt-table-container" style="overflow-x:auto;">
                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:right;">
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">الكود</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">اسم شبكة العميل</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">المدينة / المحافظة</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">هاتف التواصل</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">باقة الاشتراك</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155;">الحالة</th>
                                <th style="padding:10px 12px; font-weight:800; color:#334155; text-align:center;">إجراءات المالك السيادية</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${networks.map(net => {
                                const netId = Number(net.id || net.network_id || 0);
                                const isSuspended = net.status === 'suspended';
                                const subInfo = subscriptions.find(s => Number(s.network_id) === netId) || {};
                                const planName = subInfo.plan_name || 'باقة افتراضية';
                                return `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:10px 12px;">
                                        <span style="font-family:monospace; font-weight:800; font-size:11.5px; background:#f1f5f9; color:#0369a1; padding:2px 7px; border-radius:5px; border:1px solid #e2e8f0;">
                                            ${this.escape(net.code || ('NET-00' + netId))}
                                        </span>
                                    </td>
                                    <td style="padding:10px 12px;">
                                        <b style="font-size:13px; color:#0f172a;">${this.escape(net.name || ('شبكة ' + netId))}</b>
                                    </td>
                                    <td style="padding:10px 12px; color:#475569;">
                                        ${net.location || net.city ? `<span>📍 ${this.escape(net.location || net.city)}</span>` : '<span style="color:#94a3b8;">غير محدد</span>'}
                                    </td>
                                    <td style="padding:10px 12px; font-family:monospace; font-weight:700; color:#0f172a;" dir="ltr">
                                        ${this.escape(net.phone || '-')}
                                    </td>
                                    <td style="padding:10px 12px;">
                                        <span style="background:#fef3c7; color:#b45309; font-weight:700; font-size:11px; padding:2px 8px; border-radius:6px;">
                                            💎 ${this.escape(planName)}
                                        </span>
                                    </td>
                                    <td style="padding:10px 12px;">
                                        ${isSuspended ? `
                                        <span style="background:#fee2e2; color:#b91c1c; font-weight:800; font-size:11px; padding:3px 8px; border-radius:12px;">
                                            ⏸️ معلقة
                                        </span>` : `
                                        <span style="background:#dcfce7; color:#15803d; font-weight:800; font-size:11px; padding:3px 8px; border-radius:12px;">
                                            🟢 نشطة
                                        </span>`}
                                    </td>
                                    <td style="padding:10px 12px; text-align:center;">
                                        <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#0284c7; border:1px solid #cbd5e1; font-weight:700;" onclick="App.openAssignPlanModal(${netId})" title="تعديل وتجديد باقة الاشتراك">
                                                💎 باقة الاشتراك
                                            </button>
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:700;" onclick="App.openEditNetworkModal(${netId})" title="تعديل بيانات الشبكة والمدينة">
                                                ✏️ تعديل
                                            </button>
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:${isSuspended ? '#10b981' : '#f59e0b'}; color:#fff; font-weight:800; border:none;" onclick="App.toggleNetworkSuspension(${netId}, '${net.status || 'active'}')" title="${isSuspended ? 'تفعيل خدمة الشبكة' : 'تعليق خدمة الشبكة مؤقتاً'}">
                                                ${isSuspended ? '🟢 تفعيل' : '⏸️ تعليق'}
                                            </button>
                                            ${netId > 1 ? `
                                            <button type="button" class="mt-btn mt-btn-sm mt-btn-danger" style="font-weight:700; padding:2px 7px;" onclick="App.deleteClientNetwork(${netId})" title="حذف الشبكة">
                                                🗑️
                                            </button>` : ''}
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_portal_overview',
            archetype: 'dashboard',
            eyebrow: 'SOVEREIGN OWNER PORTAL',
            title: 'بوابة مالك النظام والتحكم السيادي',
            subtitle: 'لوحة القيادة المركزية لمالك المنظومة لكافة شبكات العملاء، الباقات، المدراء، وأجهزة الراوتر',
            icon: '👑',
            actions: [
                { label: '🏢 شبكات العملاء', variant: 'primary', onclick: "App.switchTab('owner_clients_networks')" },
                { label: '💎 باقات واشتراكات العملاء', variant: 'secondary', onclick: "App.switchTab('network_subscriptions')" },
                { label: '👥 إدارة المدراء والتفويض', variant: 'secondary', onclick: "App.switchTab('owner_network_admins')" },
                { label: '🖥️ التحكم بالسيرفر', variant: 'secondary', onclick: "App.switchTab('system_settings')" },
                { label: '🔄 تحديث', variant: 'secondary', onclick: 'App.renderOwnerPortalOverview()' }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    // =========================================================================
    // 🏢 CLIENT NETWORKS MANAGEMENT MODULE (إدارة شبكات العملاء الشاملة)
    // =========================================================================

    App.renderOwnerClientsNetworks = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل شبكات العملاء والاشتراكات...</div>';

        const [adminsRes, subRes] = await Promise.all([
            this.api('owner_system_get_network_admins').catch(() => null),
            this.api('owner_system_subscription_center').catch(() => null)
        ]);

        if (this.currentTab !== 'owner_clients_networks') return;

        const networks = adminsRes?.networks || [];
        const plans = subRes?.plans || [];
        const subscriptions = subRes?.networks || [];

        const content = `
            <div class="mt-card" style="padding:20px; margin-bottom:20px; border-right:4px solid #0284c7;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0 0 4px 0; font-size:18px; color:#0f172a; font-weight:800;">
                            🏢 إدارة شبكات العملاء التابعة للمنظومة
                        </h3>
                        <div style="font-size:12px; color:#64748b;">
                            التحكم الكامل ببيانات العملاء، الاشتراكات والباقات، تعليق أو تفعيل الخدمات، وإدارة مدراء كل شبكة.
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="mt-btn" style="background:#10b981; color:#fff; font-weight:800; border:none; padding:8px 14px;" onclick="App.openAddClientNetworkModal()">
                            ➕ إضافة شبكة عميل جديدة
                        </button>
                        <button type="button" class="mt-btn" style="background:#334155; color:#fff; font-weight:700;" onclick="App.renderOwnerClientsNetworks()">
                            🔄 تحديث
                        </button>
                    </div>
                </div>

                <div class="mt-table-container" style="overflow-x:auto;">
                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:right;">
                                <th style="padding:12px; font-weight:800; color:#334155;">الكود</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">اسم شبكة العميل</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">الموقع / المدينة</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">هاتف التواصل</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">باقة الاشتراك</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">انتهاء الاشتراك</th>
                                <th style="padding:12px; font-weight:800; color:#334155;">حالة الخدمة</th>
                                <th style="padding:12px; font-weight:800; color:#334155; text-align:center;">إجراءات المالك السيادية</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${networks.map(net => {
                                const netId = Number(net.id || net.network_id || 0);
                                const isSuspended = net.status === 'suspended';
                                const subInfo = subscriptions.find(s => Number(s.network_id) === netId) || {};
                                const planName = subInfo.plan_name || 'باقة افتراضية';
                                const expDate = subInfo.expires_at ? subInfo.expires_at.split(' ')[0] : 'غير محدد';
                                return `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:12px;">
                                        <span style="font-family:monospace; font-weight:800; font-size:12px; background:#f1f5f9; color:#0369a1; padding:3px 8px; border-radius:5px; border:1px solid #e2e8f0;">
                                            ${this.escape(net.code || ('NET-00' + netId))}
                                        </span>
                                    </td>
                                    <td style="padding:12px;">
                                        <b style="font-size:14px; color:#0f172a;">${this.escape(net.name || ('شبكة ' + netId))}</b>
                                        ${net.notes ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">${this.escape(net.notes)}</div>` : ''}
                                    </td>
                                    <td style="padding:12px; color:#475569;">
                                        ${net.location || net.city ? `<span>📍 ${this.escape(net.location || net.city)}</span>` : '<span style="color:#94a3b8;">غير محدد</span>'}
                                    </td>
                                    <td style="padding:12px; font-family:monospace; font-weight:700; color:#0f172a;" dir="ltr">
                                        ${this.escape(net.phone || '-')}
                                    </td>
                                    <td style="padding:12px;">
                                        <span style="background:#fef3c7; color:#b45309; font-weight:700; font-size:11.5px; padding:3px 9px; border-radius:6px;">
                                            💎 ${this.escape(planName)}
                                        </span>
                                    </td>
                                    <td style="padding:12px; font-family:monospace; font-weight:600; color:#475569;">
                                        ${expDate}
                                    </td>
                                    <td style="padding:12px;">
                                        ${isSuspended ? `
                                        <span style="background:#fee2e2; color:#b91c1c; font-weight:800; font-size:11.5px; padding:3px 9px; border-radius:12px;">
                                            ⏸️ معلقة
                                        </span>` : `
                                        <span style="background:#dcfce7; color:#15803d; font-weight:800; font-size:11.5px; padding:3px 9px; border-radius:12px;">
                                            🟢 نشطة
                                        </span>`}
                                    </td>
                                    <td style="padding:12px; text-align:center;">
                                        <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#0284c7; border:1px solid #cbd5e1; font-weight:700;" onclick="App.openAssignPlanModal(${netId})" title="تعديل وتجديد باقة الاشتراك">
                                                💎 باقة الاشتراك
                                            </button>
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:700;" onclick="App.openEditNetworkModal(${netId})" title="تعديل بيانات الشبكة والمدينة">
                                                ✏️ تعديل
                                            </button>
                                            <button type="button" class="mt-btn mt-btn-sm" style="background:${isSuspended ? '#10b981' : '#f59e0b'}; color:#fff; font-weight:800; border:none;" onclick="App.toggleNetworkSuspension(${netId}, '${net.status || 'active'}')" title="${isSuspended ? 'تفعيل خدمة الشبكة' : 'تعليق خدمة الشبكة مؤقتاً'}">
                                                ${isSuspended ? '🟢 تفعيل' : '⏸️ تعليق'}
                                            </button>
                                            ${netId > 1 ? `
                                            <button type="button" class="mt-btn mt-btn-sm mt-btn-danger" style="font-weight:700;" onclick="App.deleteClientNetwork(${netId})" title="حذف الشبكة">
                                                🗑️ حذف
                                            </button>` : ''}
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_clients_networks',
            archetype: 'table',
            eyebrow: 'CLIENT TENANTS MANAGEMENT',
            title: 'إدارة شبكات العملاء (Clients Hub)',
            subtitle: 'سجل وإدارة جميع الشبكات والعملاء المسجلين في المنظومة والتحكم بحالاتهم واشتراكاتهم',
            icon: '🏢',
            actions: [
                { label: '➕ إضافة شبكة عميل جديدة', variant: 'primary', onclick: "App.openAddClientNetworkModal()" },
                { label: '💎 مركز الاشتراكات', variant: 'secondary', onclick: "App.switchTab('network_subscriptions')" },
                { label: '🔄 تحديث', variant: 'secondary', onclick: 'App.renderOwnerClientsNetworks()' }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    // =========================================================================
    // 🩺 SYSTEM DIAGNOSTICS & HEALTH CHECK MODULE (الفحص التشخيصي وصحة النظام)
    // =========================================================================

    App._diagSubtab = 'overview';
    App._diagData = null;
    App._diagClientLatency = 0;

    App.switchDiagSubtab = function (subtab) {
        this._diagSubtab = subtab || 'overview';
        if (this._diagData) {
            this._renderDiagContent(this._diagData, this._diagClientLatency);
        } else {
            this.renderOwnerDiagnostics();
        }
    };

    App.renderOwnerDiagnostics = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:28px;text-align:center;color:#64748b;font-weight:700;"><div style="font-size:32px;margin-bottom:10px;">🩺</div>جاري فحص مؤشرات الأداء الحية، استجابة الخادم، وقواعد البيانات والخدمات السيادية...</div>';

        const t0 = performance.now();
        const data = await this.api('owner_system_diagnostics').catch(() => null);
        const clientLatency = Math.round(performance.now() - t0);

        if (this.currentTab !== 'owner_diagnostics') return;
        if (!data || !data.success) {
            view.innerHTML = `<div class="mt-card" style="padding:24px;text-align:center;color:#ef4444;border-right:4px solid #ef4444;">
                <h3>تعذر تشغيل الفحص التشخيصي</h3>
                <p>${data?.error || 'حدث خطأ أثناء جلب مؤشرات النظام التشخيصية'}</p>
                <button class="mt-btn" style="background:#8b5cf6;color:#fff;" onclick="App.renderOwnerDiagnostics()">🔄 إعادة المحاولة</button>
            </div>`;
            return;
        }

        this._diagData = data;
        this._diagClientLatency = clientLatency;
        this._renderDiagContent(data, clientLatency);
    };

    App._renderDiagContent = function (data, clientLatency) {
        const view = document.getElementById('main-view');
        if (!view) return;

        const telem = data.telemetry || {};
        const tests = data.tests || [];
        const passCount = tests.filter(t => t.status === 'pass').length;
        const totalTests = tests.length || 8;
        const activeSub = this._diagSubtab || 'overview';
        const alerts = telem.alerts || { overall_status: 'healthy', active_count: 0, items: [], thresholds: {} };
        const isHealthy = alerts.overall_status === 'healthy';
        const isCritical = alerts.overall_status === 'critical';

        const cpu = telem.cpu || { percent: 0, load_avg: [0, 0, 0], cores: 1, model: '' };
        const ram = telem.ram || { percent: 0, used_mb: 0, total_mb: 0, available_mb: 0 };
        const disk = telem.disk || { percent: 0, used_gb: 0, total_gb: 0, free_gb: 0 };
        const fpm = telem.php_fpm || { workers_count: 0, avg_memory_mb: 0, max_children: 5, state: 'unknown', workers: [] };
        const dbMeta = telem.mariadb || { state: 'unknown', threads_connected: 0, questions: 0, slow_queries: 0, latency_ms: 0 };
        const redisMeta = telem.redis || { state: 'unknown', ping: 'FAIL', used_memory_human: '0B', connected_clients: 0, latency_ms: 0 };
        const radiusMeta = telem.freeradius || { state: 'unknown', active_sessions: 0, today_sessions: 0 };
        const routersMeta = telem.routers || { online: 0, total: 0, offline: 0, sstp_state: 'unknown' };
        const connsMeta = telem.active_connections || { radius_sessions: 0, http_conns: 0, telemetry_conns: 0, sstp_conns: 0 };
        const cronMeta = telem.cron || { state: 'unknown', failed_count: 0, failed_logs: [] };
        const errsMeta = telem.errors || { count_24h: 0, count_1h: 0, recent: [] };
        const procMeta = telem.processes || { total_running: 0, items: [] };
        const backupMeta = telem.backup || { last_status: 'unknown', last_time: '-', last_title: '-' };
        const servicesList = telem.services || [];

        // Latency color
        const latColor = clientLatency < 120 ? '#10b981' : (clientLatency < 350 ? '#f59e0b' : '#ef4444');
        const latLabel = clientLatency < 120 ? 'استجابة فائقة 🟢' : (clientLatency < 350 ? 'استجابة جيدة 🟡' : 'استجابة بطيئة 🔴');

        let subContent = '';

        // ─────────────────────────────────────────────────────────────
        // 1. SUBTAB: OVERVIEW
        // ─────────────────────────────────────────────────────────────
        if (activeSub === 'overview') {
            subContent = `
                <!-- Alert Banner if any alerts active -->
                ${alerts.active_count > 0 ? `
                    <div style="background:${isCritical ? '#fef2f2' : '#fffbeb'}; border:1.5px solid ${isCritical ? '#f87171' : '#fde047'}; border-radius:12px; padding:16px 20px; margin-bottom:20px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                            <b style="font-size:15px; color:${isCritical ? '#b91c1c' : '#92400e'};">
                                ${isCritical ? '🚨 تنبيهات حرجة في النظام تتطلب المعالجة' : '⚠️ تنبيهات تحذيرية نشطة'} (${alerts.active_count})
                            </b>
                            <button class="mt-btn" style="background:${isCritical ? '#b91c1c' : '#b45309'}; color:#fff; font-size:12px; padding:4px 10px; border-radius:6px;" onclick="App.sendOwnerTestAlert()">
                                📱 إرسال تقرير عاجل لواتساب المالك
                            </button>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:8px;">
                            ${alerts.items.map(a => `
                                <div style="background:#fff; border-radius:8px; padding:8px 12px; font-size:12.5px; border-right:3px solid ${a.severity === 'critical' ? '#ef4444' : '#f59e0b'};">
                                    <b style="color:#0f172a;">${a.title}</b>: <span style="color:#475569;">${a.message}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Top 12 Metrics KPI Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px; margin-bottom:24px;">
                    <!-- 1. API Latency -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid ${latColor};">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>⚡ استجابة الـ API</span>
                            <span style="color:${latColor}; font-weight:800;">${latLabel}</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${clientLatency} <span style="font-size:13px; color:#64748b;">ms (RTT)</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            DB: <b>${telem.db_latency_ms || 0}ms</b> | Redis: <b>${telem.redis_latency_ms || 0}ms</b>
                        </div>
                    </div>

                    <!-- 2. CPU & Load -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #3b82f6;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>🖥️ المعالج CPU</span>
                            <span class="mt-badge" style="background:#eff6ff; color:#1d4ed8; font-size:11px;">${cpu.cores} أنوية</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${cpu.percent}% <span style="font-size:13px; color:#64748b;">مستخدم</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            Load Avg: <b>${cpu.load_avg.map(v => Number(v).toFixed(2)).join(', ')}</b>
                        </div>
                    </div>

                    <!-- 3. RAM Memory -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #8b5cf6;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>🧠 الذاكرة RAM</span>
                            <span class="mt-badge" style="background:${ram.percent > 85 ? '#fee2e2' : '#f5f3ff'}; color:${ram.percent > 85 ? '#b91c1c' : '#6d28d9'}; font-size:11px;">${ram.percent}%</span>
                        </div>
                        <div style="font-size:22px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${(ram.used_mb / 1024).toFixed(1)} <span style="font-size:13px; color:#64748b;">/ ${(ram.total_mb / 1024).toFixed(1)} GB</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            متبقي متاح: <b>${(ram.available_mb / 1024).toFixed(1)} GB</b>
                        </div>
                    </div>

                    <!-- 4. Disk Storage -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #06b6d4;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>💾 مساحة القرص</span>
                            <span class="mt-badge" style="background:${disk.percent > 85 ? '#fee2e2' : '#ecfeff'}; color:${disk.percent > 85 ? '#b91c1c' : '#0e7490'}; font-size:11px;">${disk.percent}%</span>
                        </div>
                        <div style="font-size:22px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${disk.free_gb} <span style="font-size:13px; color:#64748b;">GB متبقي</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            إجمالي: <b>${disk.total_gb} GB</b> (${disk.used_gb} GB مستخدم)
                        </div>
                    </div>

                    <!-- 5. PHP-FPM Workers -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #10b981;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>⚙️ معالج PHP-FPM</span>
                            <span class="mt-badge" style="background:#ecfdf5; color:#047857; font-size:11px;">${fpm.state === 'active' ? 'نشط 🟢' : 'متوقف 🔴'}</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${fpm.workers_count} <span style="font-size:13px; color:#64748b;">عمال نشطين</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            متوسط: <b>${fpm.avg_memory_mb} MB/عامل</b> (Max: ${fpm.max_children})
                        </div>
                    </div>

                    <!-- 6. MariaDB Database -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #f59e0b;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>🗄️ قاعدة البيانات</span>
                            <span class="mt-badge" style="background:#fef3c7; color:#b45309; font-size:11px;">MariaDB</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${dbMeta.threads_connected} <span style="font-size:13px; color:#64748b;">اتصال نشط</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            استعلامات بطيئة: <b style="color:${dbMeta.slow_queries > 0 ? '#ef4444' : '#10b981'};">${dbMeta.slow_queries}</b> | إجمالي: ${dbMeta.questions}
                        </div>
                    </div>

                    <!-- 7. Redis Cache -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #ef4444;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>⚡ خادم الكاش Redis</span>
                            <span class="mt-badge" style="background:${redisMeta.ping === 'PONG' ? '#ecfdf5' : '#fee2e2'}; color:${redisMeta.ping === 'PONG' ? '#047857' : '#b91c1c'}; font-size:11px;">${redisMeta.ping}</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${redisMeta.used_memory_human} <span style="font-size:13px; color:#64748b;">كاش محجوز</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            عملاء متصلون: <b>${redisMeta.connected_clients}</b> | أوامر: ${redisMeta.total_commands}
                        </div>
                    </div>

                    <!-- 8. FreeRADIUS & Live Sessions -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #6366f1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>🛡️ المصادقة والجلسات</span>
                            <span class="mt-badge" style="background:#eef2ff; color:#4338ca; font-size:11px;">RADIUS</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${radiusMeta.active_sessions} <span style="font-size:13px; color:#64748b;">جلسة حية</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            جلسات اليوم: <b>${radiusMeta.today_sessions}</b> | كروت: ${radiusMeta.total_users}
                        </div>
                    </div>

                    <!-- 9. Routers & SSTP -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #14b8a6;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>🌐 الراوترات وخادم النفق</span>
                            <span class="mt-badge" style="background:#f0fdfa; color:#0f766e; font-size:11px;">SSTP: ${routersMeta.sstp_state}</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${routersMeta.online} <span style="font-size:13px; color:#64748b;">/ ${routersMeta.total} متصل</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            راوترات غير متصلة: <b style="color:${routersMeta.offline > 0 ? '#ef4444' : '#10b981'};">${routersMeta.offline}</b>
                        </div>
                    </div>

                    <!-- 10. Cron & Automation -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #ec4899;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>⏰ الجدولة الدورية Cron</span>
                            <span class="mt-badge" style="background:${cronMeta.state === 'active' ? '#ecfdf5' : '#fee2e2'}; color:${cronMeta.state === 'active' ? '#047857' : '#b91c1c'}; font-size:11px;">${cronMeta.state}</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${cronMeta.failed_count} <span style="font-size:13px; color:#64748b;">مهام متعثرة</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            حالة المهام: <b style="color:${cronMeta.failed_count === 0 ? '#10b981' : '#ef4444'};">${cronMeta.failed_count === 0 ? 'تعمل بانتظام ✓' : 'توجد أخطاء مسجلة'}</b>
                        </div>
                    </div>

                    <!-- 11. API Errors (24h) -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #f97316;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>⚠️ سجل أخطاء الـ API</span>
                            <span class="mt-badge" style="background:#fff7ed; color:#c2410c; font-size:11px;">24 ساعة</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${errsMeta.count_24h} <span style="font-size:13px; color:#64748b;">خطأ مسجل</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            خلال آخر ساعة: <b style="color:${errsMeta.count_1h > 0 ? '#ef4444' : '#10b981'};">${errsMeta.count_1h} أخطاء</b>
                        </div>
                    </div>

                    <!-- 12. Active Connections -->
                    <div class="mt-card" style="padding:14px 16px; border-top:3px solid #84cc16;">
                        <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:12px; font-weight:700;">
                            <span>👥 الاتصالات والشبكة الحية</span>
                            <span class="mt-badge" style="background:#f7fee7; color:#4d7c0f; font-size:11px;">Live Network</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:6px 0 2px;">
                            ${connsMeta.radius_sessions + connsMeta.http_conns} <span style="font-size:13px; color:#64748b;">اتصال نشط</span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b;">
                            HTTP: <b>${connsMeta.http_conns}</b> | WS: <b>${connsMeta.telemetry_conns}</b> | SSTP: <b>${connsMeta.sstp_conns}</b>
                        </div>
                    </div>
                </div>

                <!-- Tests Detail Grid -->
                <div class="mt-card" style="padding:18px 20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <b style="font-size:15px; color:#0f172a;">🩺 نتائج الفحص التشخيصي المباشر لمكونات الخادم</b>
                        <span class="mt-badge" style="background:${passCount === totalTests ? '#dcfce7' : '#fef3c7'}; color:${passCount === totalTests ? '#15803d' : '#b45309'}; font-weight:800; font-size:11px;">
                            ${passCount} / ${totalTests} اختبارات ناجحة
                        </span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px;">
                        ${tests.map(t => {
                            const isPass = t.status === 'pass';
                            const isWarn = t.status === 'warn';
                            const badgeBg = isPass ? '#dcfce7' : (isWarn ? '#fef3c7' : '#fee2e2');
                            const badgeColor = isPass ? '#15803d' : (isWarn ? '#b45309' : '#b91c1c');
                            const icon = isPass ? '✅' : (isWarn ? '⚠️' : '❌');
                            return `
                            <div style="border:1px solid ${isPass ? '#bbf7d0' : (isWarn ? '#fde68a' : '#fecaca')}; background:${isPass ? '#f0fdf4' : (isWarn ? '#fffbeb' : '#fef2f2')}; border-radius:10px; padding:12px 14px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                    <b style="font-size:13.5px; color:#0f172a;">${t.name}</b>
                                    <span style="background:${badgeBg}; color:${badgeColor}; font-weight:800; font-size:11px; padding:2px 7px; border-radius:6px;">
                                        ${icon} ${isPass ? 'ناجح' : (isWarn ? 'تنبيه' : 'فشل')}
                                    </span>
                                </div>
                                <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px;">
                                    ${t.value}
                                </div>
                                <div style="font-size:11px; color:#64748b;">
                                    💡 ${t.recommendation || ''}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Server Info Footer -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 18px; font-size:12px; color:#475569; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div><b>PHP:</b> ${data.php_version || '-'}</div>
                    <div><b>نواة الخادم:</b> ${data.os || '-'}</div>
                    <div><b>توقيت الخادم:</b> ${data.server_time || '-'}</div>
                    <div><b>النسخ الاحتياطي:</b> ${backupMeta.last_status === 'success' ? 'آخر نسخة مكتملة بنجاح 🟢' : (backupMeta.last_time || 'غير محدد')}</div>
                </div>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 2. SUBTAB: SERVICES & ENGINES
        // ─────────────────────────────────────────────────────────────
        else if (activeSub === 'services') {
            subContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">🖥️ حالة الخدمات السيادية ومحركات التشغيل</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">مراقبة حية لاستهلاك الذاكرة مع إمكانية إعادة تشغيل الخدمات بنقرة واحدة</p>
                        </div>
                        <button class="mt-btn" style="background:#8b5cf6; color:#fff;" onclick="App.renderOwnerDiagnostics()">🔄 تحديث الحالة</button>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
                        ${servicesList.map(srv => {
                            const isAct = srv.state === 'active';
                            const memMb = srv.memory_bytes ? (srv.memory_bytes / (1024*1024)).toFixed(1) : '0';
                            return `
                                <div style="border:1.5px solid ${isAct ? '#bbf7d0' : '#fecaca'}; background:${isAct ? '#f8fafc' : '#fef2f2'}; border-radius:12px; padding:16px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                        <b style="font-size:14px; color:#0f172a;">${srv.label}</b>
                                        <span class="mt-badge" style="background:${isAct ? '#dcfce7' : '#fee2e2'}; color:${isAct ? '#15803d' : '#b91c1c'}; font-weight:800; font-size:11px;">
                                            ${isAct ? '🟢 نشط ويعمل' : '🔴 متوقف (' + srv.state + ')'}
                                        </span>
                                    </div>
                                    <div style="font-size:12px; color:#64748b; margin-bottom:12px; display:flex; justify-content:space-between;">
                                        <span>الوحدة: <code>${srv.unit}</code></span>
                                        <span>الذاكرة: <b>${memMb} MB</b></span>
                                    </div>
                                    <div style="display:flex; gap:6px;">
                                        ${srv.installed === false ? `<button class="mt-btn" style="background:#7c3aed;color:white" onclick="App.installDiagService('${srv.unit}')">📦 تثبيت المتطلبات</button>` : ''}
                                        <button ${srv.installed === false ? 'disabled' : ''} class="mt-btn" style="background:#3b82f6; color:#fff; font-size:11.5px; padding:4px 10px; border-radius:6px; flex:1;" onclick="App.controlDiagService('${srv.unit}', 'restart')">
                                            🔄 إعادة تشغيل
                                        </button>
                                        ${srv.unit !== 'apache2' && srv.installed !== false ? `
                                            <button class="mt-btn" style="background:${isAct ? '#ef4444' : '#10b981'}; color:#fff; font-size:11.5px; padding:4px 10px; border-radius:6px;" onclick="App.controlDiagService('${srv.unit}', '${isAct ? 'stop' : 'start'}')">
                                                ${isAct ? '⏹️ إيقاف' : '▶️ تشغيل'}
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 3. SUBTAB: API ERRORS & LOGS
        // ─────────────────────────────────────────────────────────────
        else if (activeSub === 'errors') {
            const recErrs = errsMeta.recent || [];
            subContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">⚠️ سجل ومعدل أخطاء الـ API والعمليات الفاشلة</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">تتبع فوري للأخطاء البرمجية وفشل عمليات الدفع والراوترات وانقطاع الجلسات</p>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <span class="mt-badge" style="background:#fee2e2; color:#b91c1c; font-weight:800; padding:6px 12px; font-size:12px; border-radius:8px;">
                                ${errsMeta.count_24h} أخطاء خلال 24 ساعة
                            </span>
                            <span class="mt-badge" style="background:#fff7ed; color:#c2410c; font-weight:800; padding:6px 12px; font-size:12px; border-radius:8px;">
                                ${errsMeta.count_1h} أخطاء خلال الساعة الأخيرة
                            </span>
                        </div>
                    </div>

                    ${recErrs.length === 0 ? `
                        <div style="padding:32px; text-align:center; color:#10b981; font-weight:700;">
                            <div style="font-size:36px; margin-bottom:8px;">✅</div>
                            لا توجد أي أخطاء مسجلة مؤخراً! النظام يعمل بكامل استقراره ودقته.
                        </div>
                    ` : `
                        <div class="mt-table-wrap">
                            <table class="mt-table">
                                <thead>
                                    <tr>
                                        <th>التوقيت</th>
                                        <th>النوع / القسم</th>
                                        <th>عنوان العملية</th>
                                        <th>التفاصيل ومحتوى الخطأ</th>
                                        <th>الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recErrs.map(e => `
                                        <tr>
                                            <td style="white-space:nowrap; font-size:12px; color:#64748b;">${e.created_at}</td>
                                            <td><span class="mt-badge" style="background:#f1f5f9; color:#475569; font-size:11px;">${e.action_category || e.action_type}</span></td>
                                            <td style="font-weight:700; color:#0f172a;">${e.action_title || '-'}</td>
                                            <td style="font-size:12px; color:#b91c1c; max-width:360px; word-break:break-word;">${e.details || '-'}</td>
                                            <td><span class="mt-badge" style="background:#fee2e2; color:#b91c1c; font-size:11px; font-weight:800;">${e.status}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 4. SUBTAB: CRON & AUTOMATION
        // ─────────────────────────────────────────────────────────────
        else if (activeSub === 'cron') {
            const fLogs = cronMeta.failed_logs || [];
            subContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">⏰ مراقبة مهام Cron والجدولة التلقائية</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">فحص سلامة سياق الجدولة واكتشاف أي مهام معطلة أو أخطاء bad minute</p>
                        </div>
                        <span class="mt-badge" style="background:${cronMeta.failed_count === 0 ? '#dcfce7' : '#fee2e2'}; color:${cronMeta.failed_count === 0 ? '#15803d' : '#b91c1c'}; font-weight:800; font-size:12px; padding:6px 12px; border-radius:8px;">
                            ${cronMeta.failed_count === 0 ? 'كافة المهام تعمل بنجاح ✓' : cronMeta.failed_count + ' مهام واجهت تعثراً'}
                        </span>
                    </div>

                    <!-- Scheduled Jobs Overview -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:20px;">
                        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#f8fafc;">
                            <b style="font-size:13px; color:#0f172a;">🎯 انتهاء صلاحيات الكروت</b>
                            <div style="font-size:11.5px; color:#64748b; margin-top:3px;"><code>sam-expire-vouchers.php</code> (كل دقيقة)</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#f8fafc;">
                            <b style="font-size:13px; color:#0f172a;">📨 طابور رسائل الواتساب</b>
                            <div style="font-size:11.5px; color:#64748b; margin-top:3px;"><code>cron_dispatch_queue.php</code> (كل دقيقة)</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#f8fafc;">
                            <b style="font-size:13px; color:#0f172a;">🌐 مراقبة اتصال الراوترات</b>
                            <div style="font-size:11.5px; color:#64748b; margin-top:3px;"><code>cron_router_status_monitor.php</code> (كل دقيقة)</div>
                        </div>
                        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#f8fafc;">
                            <b style="font-size:13px; color:#0f172a;">📊 تقارير الشبكات والصيانة</b>
                            <div style="font-size:11.5px; color:#64748b; margin-top:3px;"><code>cron_network_notification_reports.php</code></div>
                        </div>
                    </div>

                    <b style="font-size:14px; color:#0f172a;">📋 سجل العمليات والأخطاء المرصودة في مهام Cron:</b>
                    ${fLogs.length === 0 ? `
                        <div style="padding:24px; text-align:center; color:#10b981; font-weight:700; background:#f0fdf4; border-radius:8px; margin-top:10px;">
                            ✅ لا توجد أي أخطاء في ملف الجدولة أو تنفيذ المهام الدورية.
                        </div>
                    ` : `
                        <div style="background:#0f172a; color:#f8fafc; border-radius:10px; padding:14px; font-family:monospace; font-size:12px; line-height:1.6; margin-top:10px; max-height:280px; overflow-y:auto; direction:ltr; text-align:left;">
                            ${fLogs.map(l => `<div style="color:${l.includes('bad minute') || l.includes('FAIL') || l.includes('failed') ? '#f87171' : '#94a3b8'};">${l}</div>`).join('')}
                        </div>
                    `}
                </div>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 5. SUBTAB: PROCESSES & LONG-RUNNING TASKS
        // ─────────────────────────────────────────────────────────────
        else if (activeSub === 'processes') {
            const pItems = procMeta.items || [];
            subContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">⚡ العمليات الحية ومراقبة المهام العالقة</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">تتبع العمليات الأكثر استهلاكاً للمعالج والذاكرة مع إمكانية الإنهاء الآمن للمهام العالقة</p>
                        </div>
                        <button class="mt-btn" style="background:#8b5cf6; color:#fff;" onclick="App.renderOwnerDiagnostics()">🔄 تحديث العمليات</button>
                    </div>

                    <div class="mt-table-wrap">
                        <table class="mt-table">
                            <thead>
                                <tr>
                                    <th>معرف العملية (PID)</th>
                                    <th>المستخدم</th>
                                    <th>المعالج (CPU %)</th>
                                    <th>الذاكرة (RAM %)</th>
                                    <th>مدة التشغيل</th>
                                    <th>الأمر / البرنامج</th>
                                    <th>الحالة / إجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pItems.map(p => {
                                    const isStuck = p.is_stuck;
                                    return `
                                        <tr style="background:${isStuck ? '#fff1f2' : 'inherit'};">
                                            <td><b>${p.pid}</b></td>
                                            <td><code>${p.user}</code></td>
                                            <td><span class="mt-badge" style="background:${p.cpu > 50 ? '#fee2e2' : '#f1f5f9'}; color:${p.cpu > 50 ? '#b91c1c' : '#334155'}; font-weight:800;">${p.cpu}%</span></td>
                                            <td>${p.mem}%</td>
                                            <td><code>${p.etime}</code></td>
                                            <td style="font-family:monospace; font-size:12px; color:#0f172a;">${p.comm}</td>
                                            <td>
                                                ${isStuck ? `
                                                    <span class="mt-badge" style="background:#fee2e2; color:#b91c1c; font-weight:800; margin-left:6px;">⚠️ مشتبه بالعلوق</span>
                                                ` : '<span style="color:#10b981; font-weight:700; font-size:11px;">طبيعي</span>'}
                                                <button class="mt-btn" style="background:#ef4444; color:#fff; font-size:11px; padding:3px 8px; border-radius:6px;" onclick="App.killOwnerProcess(${p.pid})">
                                                    إنهاء
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 6. SUBTAB: ALERTS & WHATSAPP SETTINGS
        // ─────────────────────────────────────────────────────────────
        else if (activeSub === 'alerts') {
            const th = alerts.thresholds || {};
            subContent = `
                <div class="mt-card" style="padding:22px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">🔔 قواعد وتنبيهات النظام الذكية للمالك</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">تحديد العتبات الحرجة وإرسال إشعارات فورية عبر الواتساب وتليجرام عند تجاوز أي حد</p>
                        </div>
                        <button class="mt-btn" style="background:#16a34a; color:#fff; font-weight:800;" onclick="App.sendOwnerTestAlert()">
                            📱 إرسال فحص تشخيصي تجريبي الآن
                        </button>
                    </div>

                    <form id="owner-alert-config-form" onsubmit="event.preventDefault(); App.saveOwnerAlertConfig(this);">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:20px;">
                            <div>
                                <label class="mt-label">الحد الأقصى لاستهلاك المعالج (CPU Alert Threshold %):</label>
                                <input type="number" name="cpu_thresh" class="mt-input" min="50" max="99" value="${th.cpu_thresh || 85}" required>
                                <div style="font-size:11px; color:#64748b; margin-top:3px;">إرسال تنبيه إذا تجاوز استهلاك المعالج هذه النسبة</div>
                            </div>
                            <div>
                                <label class="mt-label">الحد الأقصى لاستهلاك الذاكرة (RAM Alert Threshold %):</label>
                                <input type="number" name="ram_thresh" class="mt-input" min="50" max="99" value="${th.ram_thresh || 90}" required>
                                <div style="font-size:11px; color:#64748b; margin-top:3px;">إرسال تنبيه إذا تجاوز استهلاك الذاكرة RAM هذه النسبة</div>
                            </div>
                            <div>
                                <label class="mt-label">الحد الأقصى لامتلاء القرص (Disk Alert Threshold %):</label>
                                <input type="number" name="disk_thresh" class="mt-input" min="60" max="98" value="${th.disk_thresh || 90}" required>
                                <div style="font-size:11px; color:#64748b; margin-top:3px;">إرسال تنبيه عند اقتراب امتلاء مساحة التخزين</div>
                            </div>
                            <div>
                                <label class="mt-label">أقصى زمن استجابة للـ API (Latency Threshold ms):</label>
                                <input type="number" name="latency_thresh" class="mt-input" min="300" max="10000" step="100" value="${th.latency_thresh || 1500}" required>
                                <div style="font-size:11px; color:#64748b; margin-top:3px;">إرسال تنبيه عند بطء استجابة الخادم وتجاوز هذا الزمن</div>
                            </div>
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:20px;">
                            <b style="font-size:13.5px; color:#0f172a; display:block; margin-bottom:10px;">قنوات تسليم التنبيهات الفورية:</b>
                            <div style="display:flex; gap:20px; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#334155;">
                                    <input type="checkbox" name="whatsapp_enabled" value="1" ${th.whatsapp_enabled ? 'checked' : ''}>
                                    🟢 إرسال عبر واتساب المالك
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#334155;">
                                    <input type="checkbox" name="telegram_enabled" value="1" ${th.telegram_enabled ? 'checked' : ''}>
                                    ✈️ إرسال عبر بوت تليجرام المالك
                                </label>
                            </div>
                        </div>

                        <div style="text-align:left;">
                            <button type="submit" class="mt-btn" style="background:#8b5cf6; color:#fff; font-weight:800; padding:8px 24px;">
                                💾 حفظ إعدادات وقواعد التنبيهات
                            </button>
                        </div>
                    </form>
                </div>
            `;
        }

        // Subtabs Navigation Bar
        const subNav = `
            <div style="display:flex; gap:8px; border-bottom:2px solid #e2e8f0; margin-bottom:18px; overflow-x:auto; padding-bottom:8px;">
                <button type="button" class="mt-btn" style="background:${activeSub === 'overview' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'overview' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('overview')">
                    📊 نظرة عامة ومؤشرات حية
                </button>
                <button type="button" class="mt-btn" style="background:${activeSub === 'services' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'services' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('services')">
                    🖥️ الخدمات ومحركات التشغيل
                </button>
                <button type="button" class="mt-btn" style="background:${activeSub === 'errors' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'errors' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('errors')">
                    ⚠️ سجل أخطاء الـ API (${errsMeta.count_24h})
                </button>
                <button type="button" class="mt-btn" style="background:${activeSub === 'cron' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'cron' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('cron')">
                    ⏰ الجدولة والمهام الآلية
                </button>
                <button type="button" class="mt-btn" style="background:${activeSub === 'processes' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'processes' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('processes')">
                    ⚡ العمليات والمهام العالقة
                </button>
                <button type="button" class="mt-btn" style="background:${activeSub === 'alerts' ? '#8b5cf6' : '#f1f5f9'}; color:${activeSub === 'alerts' ? '#fff' : '#475569'}; font-weight:800; border-radius:8px; padding:8px 14px; border:none;" onclick="App.switchDiagSubtab('alerts')">
                    🔔 قواعد وإعدادات التنبيهات
                </button>
            </div>
        `;

        const fullContent = `
            <div style="padding:14px 18px;">
                ${subNav}
                ${subContent}
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_diagnostics',
            archetype: 'detail',
            eyebrow: 'SYSTEM TELEMETRY & DIAGNOSTICS',
            title: 'لوحة المراقبة الداخلية وصحة النظام',
            subtitle: 'مراقبة حية فورية لزمن الاستجابة، استهلاك الموارد، محركات التشغيل، وقواعد التنبيهات الذكية',
            icon: '🩺',
            actions: [
                { label: '🔄 تحديث فوري', variant: 'primary', onclick: "App.renderOwnerDiagnostics()" },
                { label: '📱 إرسال تقرير للمالك', variant: 'secondary', onclick: "App.sendOwnerTestAlert()" },
                { label: '🖥️ إعدادات الخادم', variant: 'secondary', onclick: "App.switchTab('system_settings')" }
            ],
            content: fullContent
        }) : `<div style="padding:14px">${fullContent}</div>`;
    };

    // Supporting Helper Methods
    App.sendOwnerTestAlert = async function () {
        this.toast('جاري إرسال تقرير الفحص التشخيصي للمالك...', 'info');
        const res = await this.api('owner_system_send_test_alert', {}).catch(e => ({ success: false, error: e.message }));
        if (res && res.success) {
            this.toast(res.message || 'تم إرسال تقرير المراقبة بنجاح ✓', 'success');
        } else {
            this.toast(res?.error || res?.message || 'تعذر إرسال التقرير', 'danger');
        }
    };

    App.saveOwnerAlertConfig = async function (form) {
        const formData = new FormData(form);
        const payload = {
            cpu_thresh: formData.get('cpu_thresh'),
            ram_thresh: formData.get('ram_thresh'),
            disk_thresh: formData.get('disk_thresh'),
            latency_thresh: formData.get('latency_thresh'),
            whatsapp_enabled: form.querySelector('[name="whatsapp_enabled"]')?.checked ? 1 : 0,
            telegram_enabled: form.querySelector('[name="telegram_enabled"]')?.checked ? 1 : 0
        };
        this.toast('جاري حفظ قواعد التنبيهات...', 'info');
        const res = await this.api('owner_system_save_alert_settings', payload).catch(e => ({ success: false, error: e.message }));
        if (res && res.success) {
            this.toast('تم حفظ إعدادات وقواعد التنبيهات بنجاح ✓', 'success');
            this.renderOwnerDiagnostics();
        } else {
            this.toast(res?.error || 'تعذر حفظ الإعدادات', 'danger');
        }
    };

    App.killOwnerProcess = async function (pid) {
        if (!confirm(`هل أنت متأكد من رغبتك في إنهاء العملية (PID: ${pid})؟`)) return;
        this.toast(`جاري إنهاء العملية ${pid}...`, 'info');
        const res = await this.api('owner_system_kill_process', { pid }).catch(e => ({ success: false, error: e.message }));
        if (res && res.success) {
            this.toast(res.message || 'تم إنهاء العملية بنجاح ✓', 'success');
            this.renderOwnerDiagnostics();
        } else {
            this.toast(res?.error || 'تعذر إنهاء العملية', 'danger');
        }
    };

    App.installDiagService = async function(unit) {
        if(!confirm('تثبيت متطلبات الخدمة '+unit+'؟ لن تُعاد تشغيل الخدمات الموجودة.'))return;
        let r=await this.api('owner_system_install_service',{},'POST',{unit}).catch(e=>({error:e.message}));
        if(!r?.success||!r.job_id){this.toast(r?.error||r?.message||'تعذر بدء التثبيت','danger');return;}
        const job=r.job_id;this.toast('بدأ تثبيت المتطلبات. يمكنك متابعة العمل.','info');
        const poll=async()=>{const d=await this.api('owner_system_install_service_status',{},'POST',{job_id:job}).catch(e=>({state:'failed',message:e.message}));
            if(d.state==='completed'||d.state==='failed'){this.toast(d.message||d.error,d.success?'success':'danger');if(d.service?.configuration_required?.length)this.toast(d.service.configuration_required.join('؛ '),'warning');this.renderOwnerDiagnostics();}
            else setTimeout(poll,3000);
        };setTimeout(poll,3000);
    };
    App.controlDiagService = async function (unit, op) {
        const opLabel = op === 'restart' ? 'إعادة تشغيل' : (op === 'stop' ? 'إيقاف' : 'تشغيل');
        if (!confirm(`هل أنت متأكد من ${opLabel} الخدمة (${unit})؟`)) return;
        this.toast(`جاري ${opLabel} الخدمة ${unit}...`, 'info');
        const res = await this.api('owner_system_service', {}, 'POST', { unit, operation: op }).catch(e => ({ success: false, error: e.message }));
        if (res && res.success) {
            this.toast(`تم تنفيذ عملية ${opLabel} للخدمة ${unit} بنجاح ✓`, 'success');
            this.renderOwnerDiagnostics();
        } else {
            this.toast(res?.error || res?.message || 'فشلت العملية على الخدمة', 'danger');
        }
    };

    // =========================================================================
    // 📋 SYSTEM & ERROR LOGS MODULE (سجلات النظام والأخطاء)
    // =========================================================================

    App.renderOwnerSystemLogs = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل سجلات النظام والعمليات...</div>';

        const [logsRes, errRes] = await Promise.all([
            this.api('owner_system_logs', { limit: 60 }).catch(() => null),
            this.api('owner_system_error_logs').catch(() => null)
        ]);

        if (this.currentTab !== 'owner_logs') return;

        const auditLogs = logsRes?.logs || [];
        const errLines = errRes?.lines || [];
        const errFile = errRes?.log_file || 'Log File';

        const content = `
            <div class="mt-card" style="padding:20px; margin-bottom:20px; border-right:4px solid #3b82f6;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0 0 4px 0; font-size:18px; color:#0f172a; font-weight:800;">
                            📋 سجلات النظام وأنشطة المدراء
                        </h3>
                        <div style="font-size:12px; color:#64748b;">
                            سجل العمليات الحساسة وإجراءات مالك النظام والمدراء في المنصة.
                        </div>
                    </div>
                    <button type="button" class="mt-btn" style="background:#3b82f6; color:#fff; font-weight:700;" onclick="App.renderOwnerSystemLogs()">
                        🔄 تحديث السجلات
                    </button>
                </div>

                <div class="mt-table-container" style="overflow-x:auto; max-height:400px; margin-bottom:24px;">
                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:right;">
                                <th style="padding:8px 10px;">التاريخ والوقت</th>
                                <th style="padding:8px 10px;">المسؤول</th>
                                <th style="padding:8px 10px;">نوع الإجراء</th>
                                <th style="padding:8px 10px;">القسم</th>
                                <th style="padding:8px 10px;">التفاصيل</th>
                                <th style="padding:8px 10px;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${auditLogs.map(l => `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:8px 10px; font-family:monospace; color:#64748b;">${this.escape(l.created_at || '-')}</td>
                                <td style="padding:8px 10px; font-weight:700; color:#0f172a;">${this.escape(l.admin_name || ('مدير #' + l.admin_id))}</td>
                                <td style="padding:8px 10px; font-weight:700; color:#0284c7;">${this.escape(l.action_title || l.action_type)}</td>
                                <td style="padding:8px 10px; color:#475569;">${this.escape(l.action_category || '-')}</td>
                                <td style="padding:8px 10px; color:#334155; max-width:320px;">${this.escape(l.details || '-')}</td>
                                <td style="padding:8px 10px;">
                                    <span style="background:${l.status === 'success' ? '#dcfce7' : '#fee2e2'}; color:${l.status === 'success' ? '#15803d' : '#b91c1c'}; font-size:10.5px; font-weight:800; padding:2px 7px; border-radius:6px;">
                                        ${l.status === 'success' ? 'نجاح' : 'خطأ'}
                                    </span>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="border-top:2px solid #e2e8f0; padding-top:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <b style="font-size:14px; color:#0f172a;">⚠️ سجل أخطاء خادم الويب وPHP المباشر (${this.escape(errFile)})</b>
                        <span style="font-size:11px; color:#64748b;">آخر 60 سطراً</span>
                    </div>
                    <pre style="background:#0f172a; color:#f8fafc; padding:14px; border-radius:8px; font-family:monospace; font-size:11px; max-height:220px; overflow-y:auto; direction:ltr; text-align:left; line-height:1.6;">${errLines.length ? this.escape(errLines.join('\n')) : 'No recent errors reported in log file.'}</pre>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_logs',
            archetype: 'detail',
            eyebrow: 'SYSTEM LOGS & AUDIT',
            title: 'سجلات النظام والأخطاء',
            subtitle: 'تتبع كافة العمليات الإدارية وسجلات تشغيل الخادم لمعالجة الأخطاء',
            icon: '📋',
            actions: [
                { label: '🔄 تحديث', variant: 'secondary', onclick: "App.renderOwnerSystemLogs()" }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    // =========================================================================
    // 📢 OWNER BROADCAST & ANNOUNCEMENTS MODULE (التنبيهات والبث العام)
    // =========================================================================

    App.renderOwnerBroadcast = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل مركز التعميمات والتنبيهات السيادية...</div>';

        const [bcRes, admRes] = await Promise.all([
            this.api('owner_system_broadcast_logs').catch(() => null),
            this.api('owner_system_get_network_admins').catch(() => null)
        ]);

        if (this.currentTab !== 'owner_broadcast' && this.currentTab !== 'owner_alerts') return;

        const networks = admRes?.networks || [];
        const logs = bcRes?.logs || [];

        const content = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;">
                <!-- Compose Form -->
                <div class="mt-card" style="padding:20px; border-right:4px solid #f59e0b;">
                    <h3 style="margin:0 0 4px 0; font-size:17px; color:#0f172a; font-weight:800;">
                        📢 إرسال تعميم / تنبيه رسمي لمدراء الشبكات
                    </h3>
                    <div style="font-size:12px; color:#64748b; margin-bottom:16px;">
                        يمكنك بث إشعار فوري لكافة مدراء الشبكات عبر الواتساب أو تلغرام أو الإشعار الداخلي.
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">عنوان التعميم / التنبيه</label>
                            <input type="text" id="bc-title" class="mt-input" style="width:100%;" placeholder="مثال: تنبيه هام بخصوص موعد التحديث الأسبوعي" />
                        </div>

                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">نص الرسالة</label>
                            <textarea id="bc-message" class="mt-input" rows="4" style="width:100%; font-size:13px; line-height:1.6;" placeholder="اكتب نص التعميم أو التعليمات هنا..."></textarea>
                        </div>

                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">الفئة المستهدفة</label>
                            <select id="bc-audience" class="mt-input" style="width:100%;">
                                <option value="all_admins">📢 كافة مدراء الشبكات المسجلين (${networks.length} شبكة)</option>
                                ${networks.map(n => `<option value="net_${n.id || n.network_id}">شبكة: ${this.escape(n.name || n.code)}</option>`).join('')}
                            </select>
                        </div>

                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:6px;">قنوات البث والإرسال</label>
                            <div style="display:flex; gap:14px; flex-wrap:wrap; font-size:13px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="bc-ch-wa" checked /> 📱 رسائل واتساب (WhatsApp)
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="bc-ch-tg" checked /> ✈️ تلغرام (Telegram)
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="bc-ch-inapp" checked /> 🔔 إشعار داخل المنصة
                                </label>
                            </div>
                        </div>

                        <div style="margin-top:8px;">
                            <button type="button" class="mt-btn" style="background:#f59e0b; color:#fff; font-weight:800; width:100%; padding:10px; font-size:14px; border:none; border-radius:8px;" onclick="App.sendOwnerBroadcastNow()">
                                📢 إرسال التعميم الآن
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Broadcast History -->
                <div class="mt-card" style="padding:20px; border-right:4px solid #334155;">
                    <h3 style="margin:0 0 4px 0; font-size:17px; color:#0f172a; font-weight:800;">
                        📜 سجل التعميمات السابقة
                    </h3>
                    <div style="font-size:12px; color:#64748b; margin-bottom:14px;">
                        تاريخ التعميمات والبلاغات المرسلة للمدراء.
                    </div>

                    <div style="max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                        ${logs.length ? logs.map(l => `
                        <div style="border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; padding:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <b style="font-size:13px; color:#0f172a;">${this.escape(l.title || 'تعميم')}</b>
                                <span style="font-size:11px; color:#64748b; font-family:monospace;">${this.escape(l.created_at || '')}</span>
                            </div>
                            <div style="font-size:12px; color:#334155; line-height:1.6; margin-bottom:6px;">
                                ${this.escape(l.message || '')}
                            </div>
                            <div style="font-size:11px; color:#0284c7; font-weight:700;">
                                القنوات: ${this.escape(l.channels || 'in_app')} · المستلمون: ${l.recipients_count || 1}
                            </div>
                        </div>`).join('') : '<div style="color:#94a3b8; text-align:center; padding:30px;">لا توجد تعميمات سابقة مسجلة.</div>'}
                    </div>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_broadcast',
            archetype: 'detail',
            eyebrow: 'BROADCAST & ANNOUNCEMENTS',
            title: 'التنبيهات والبث العام لمدراء الشبكات',
            subtitle: 'إرسال التنبيهات والتعميمات لكافة العملاء والمدراء عبر قنوات الواتساب وتلغرام',
            icon: '📢',
            actions: [
                { label: '🔄 تحديث', variant: 'secondary', onclick: "App.renderOwnerBroadcast()" }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    // =========================================================================
    // 📱 SOVEREIGN WHATSAPP MODULE (واتساب مالك المنظومة وسجل الرسائل وإعادة الإرسال)
    // =========================================================================

    App._ownerWaLogFilter = 'all'; // default to all so the owner immediately sees all recent outbox messages
    App._ownerWaLogSearch = '';
    App._ownerWaLogsCache = [];

    App.renderOwnerWhatsAppSettings = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري الاتصال بخدمة واتساب المالك وجلب سجل الرسائل السيادية...</div>';

        const filter = this._ownerWaLogFilter || 'all';
        const search = this._ownerWaLogSearch || '';

        const [data, logsRes] = await Promise.all([
            this.api('owner_system_whatsapp_get').catch(() => null),
            this.api('owner_system_whatsapp_logs', { status: filter, search: search }).catch(() => null)
        ]);

        if (this.currentTab !== 'owner_whatsapp') return;

        const wa = data?.whatsapp || {};
        const sess = data?.session_status || {};
        const isConn = Boolean(sess.connected);
        const isQr = sess.status === 'QR_READY';

        const summary = logsRes?.summary || { total_count: 0, failed_count: 0, sent_count: 0, pending_count: 0, filtered_total: 0 };
        const logs = logsRes?.logs || [];
        this._ownerWaLogsCache = logs;

        const hasFailed = Number(summary.failed_count || 0) > 0;

        const content = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <!-- TOP SECTION: SESSION & SETTINGS -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;">
                    <!-- Session Status & QR Card -->
                    <div class="mt-card" style="padding:22px; border-right:4px solid #16a34a; background:var(--bg-window, #fff);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                            <h3 style="margin:0; font-size:17px; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                                <span>📱</span> بوابة واتساب مالك النظام السيادية
                            </h3>
                            <span style="background:${isConn ? '#dcfce7' : (isQr ? '#fef3c7' : '#fee2e2')}; color:${isConn ? '#15803d' : (isQr ? '#b45309' : '#b91c1c')}; font-weight:800; font-size:12px; padding:3px 10px; border-radius:12px;">
                                ${isConn ? 'متصل ومقترن 🟢' : (isQr ? 'بانتظار مسح QR 🟡' : 'غير متصل 🔴')}
                            </span>
                        </div>

                        <div style="font-size:12.5px; color:#475569; line-height:1.7; margin-bottom:14px;">
                            جلسة الواتساب السيادية (<b>Session #0</b>) مسؤولة عن إرسال رموز التحقق OTP، وتنبيهات الحسابات والسيرفر، وإعادة إرسال الرسائل الفاشلة لضمان وصولها بنجاح.
                        </div>

                        <!-- QR Box -->
                        <div id="owner-wa-qr-box" style="background:#f8fafc; border:2px dashed ${isConn ? '#86efac' : '#cbd5e1'}; border-radius:12px; padding:18px; text-align:center; margin-bottom:14px;">
                            ${isConn ? `
                            <div style="padding:14px 0;">
                                <div style="font-size:42px; margin-bottom:6px;">✅</div>
                                <b style="font-size:15px; color:#15803d;">رقم مالك النظام متصل وجاهز للإرسال</b>
                                <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
                                    الرقم المقترن: <b style="color:#0f172a;" dir="ltr">${this.escape(sess?.info?.wid || wa.owner_phone || '967770283515')}</b> 
                                    ${sess?.info?.pushname ? `<span style="color:#0284c7; font-weight:700;">(${this.escape(sess.info.pushname)})</span>` : ''}
                                </div>
                            </div>` : `
                            <div>
                                <div style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:10px;">امسح رمز QR من تطبيق WhatsApp لربط رقم المالك:</div>
                                <div id="owner-qr-container" style="display:inline-block; padding:8px; background:#fff; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:10px; min-width:180px; min-height:180px;">
                                    <div id="owner-wa-qr-spinner" style="width:180px; height:180px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px; color:#64748b;">
                                        <div style="font-size:30px;">⏳</div>
                                        <div style="font-size:12px;">جاري تحميل رمز QR...</div>
                                    </div>
                                    <img id="owner-wa-qr-img" src="" alt="WhatsApp QR" style="width:180px; height:180px; display:none; border-radius:4px;" />
                                </div>
                                <div>
                                    <button type="button" class="mt-btn mt-btn-sm" style="background:#16a34a; color:#fff; font-weight:800;" onclick="App.refreshOwnerWhatsAppQr()">
                                        🔄 تحديث رمز QR
                                    </button>
                                </div>
                            </div>`}
                        </div>

                        <!-- Test Message Form -->
                        <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
                            <b style="font-size:13px; color:#0f172a; display:block; margin-bottom:6px;">📤 إرسال رسالة اختبار عبر واتساب المالك:</b>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="owner-wa-test-phone" class="mt-input" style="flex:1; font-family:monospace;" placeholder="رقم الهاتف: 770283515" value="${this.escape(wa.owner_phone || '967770283515')}" />
                                <button type="button" class="mt-btn" style="background:#16a34a; color:#fff; font-weight:800; white-space:nowrap; padding:6px 14px;" onclick="App.sendTestWhatsAppToOwner()">
                                    إرسال تجريبي 🚀
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Card -->
                    <div class="mt-card" style="padding:22px; border-right:4px solid #334155; background:var(--bg-window, #fff);">
                        <h3 style="margin:0 0 4px 0; font-size:17px; color:#0f172a; font-weight:800;">
                            ⚙️ إعدادات وخيارات خدمة واتساب المالك
                        </h3>
                        <div style="font-size:12px; color:#64748b; margin-bottom:14px;">
                            ضبط مسار البوابة ورقم هاتف المالك المعتمد للإشعارات.
                        </div>

                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:13px; color:#0f172a; cursor:pointer;">
                                    <input type="checkbox" id="owner-wa-enabled" ${wa.enabled ? 'checked' : ''} />
                                    تفعيل بوابة واتساب مالك النظام السيادية
                                </label>
                            </div>

                            <div>
                                <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">رقم هاتف المالك المعتمد (اليمن)</label>
                                <input type="text" id="owner-wa-phone" class="mt-input" style="width:100%; font-family:monospace; font-weight:700;" placeholder="770283515" value="${this.escape(wa.owner_phone || '967770283515')}" />
                            </div>

                            <div>
                                <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">رابط خدمة الواتساب المحلية (Gateway URL)</label>
                                <input type="text" id="owner-wa-api-url" class="mt-input" style="width:100%; font-family:monospace;" value="${this.escape(wa.api_url || 'http://127.0.0.1:3388')}" />
                            </div>

                            <div style="border-top:1px solid #e2e8f0; padding-top:10px;">
                                <b style="font-size:12.5px; color:#334155; display:block; margin-bottom:6px;">إشعارات المالك التلقائية عبر الواتساب:</b>
                                <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                        <input type="checkbox" id="owner-wa-notif-network" checked /> إشعار فوري عند تسجيل شبكة عميل جديدة
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                        <input type="checkbox" id="owner-wa-notif-alerts" ${wa.notify_server_alerts ? 'checked' : ''} /> تنبيه المالك عند تعطل خدمات الخادم أو امتلاء القرص
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                        <input type="checkbox" id="owner-wa-notif-security" ${wa.notify_security ? 'checked' : ''} /> تنبيه عند رصد محاولات دخول أمنية مشبوهة
                                    </label>
                                </div>
                            </div>

                            <div style="margin-top:6px;">
                                <button type="button" class="mt-btn" style="background:#0f172a; color:#fff; font-weight:800; width:100%; padding:8px 12px;" onclick="App.saveOwnerWhatsAppConfig()">
                                    💾 حفظ إعدادات واتساب المالك
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BOTTOM SECTION: WHATSAPP OUTBOX & FAILED LOGS CONSOLE -->
                <div class="mt-card" style="padding:20px; border-right:4px solid #ef4444; background:var(--bg-window, #fff); box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <!-- Header & Summary Stats -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:14px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:24px;">📬</span>
                                <div>
                                    <h3 style="margin:0; font-size:18px; color:#0f172a; font-weight:800;">
                                        صندوق رسائل وسجلات الواتساب الصادرة (WhatsApp Outbox)
                                    </h3>
                                    <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                        متابعة كافة رسائل الواتساب الصادرة من النظام، ورصد الرسائل الفاشلة مع إمكانية إعادة إرسالها فوراً.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- KPI Stat Badges -->
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <div style="background:#fee2e2; border:1px solid #fca5a5; padding:6px 12px; border-radius:8px; display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="App.setOwnerWhatsAppLogFilter('failed')">
                                <span style="font-size:14px;">❌</span>
                                <span style="font-size:12px; color:#991b1b; font-weight:800;">فاشلة: <b style="font-size:14px;">${summary.failed_count}</b></span>
                            </div>
                            <div style="background:#dcfce7; border:1px solid #86efac; padding:6px 12px; border-radius:8px; display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="App.setOwnerWhatsAppLogFilter('sent')">
                                <span style="font-size:14px;">🟢</span>
                                <span style="font-size:12px; color:#166534; font-weight:800;">مرسلة: <b style="font-size:14px;">${summary.sent_count}</b></span>
                            </div>
                            <div style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px 12px; border-radius:8px; display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="App.setOwnerWhatsAppLogFilter('all')">
                                <span style="font-size:14px;">📑</span>
                                <span style="font-size:12px; color:#334155; font-weight:800;">الإجمالي: <b style="font-size:14px;">${summary.total_count}</b></span>
                            </div>
                        </div>
                    </div>

                    <!-- Filter Toolbar & Action Buttons -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                        <!-- Filter Tabs -->
                        <div style="display:inline-flex; gap:6px; flex-wrap:wrap;">
                            <button type="button" class="mt-btn ${filter === 'all' ? 'mt-btn-primary' : ''}" style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:6px; ${filter === 'all' ? 'background:#0284c7; color:#fff;' : 'background:#f8fafc; border:1px solid #cbd5e1; color:#334155;'}" onclick="App.setOwnerWhatsAppLogFilter('all')">
                                📑 كافة الرسائل (${summary.total_count})
                            </button>
                            <button type="button" class="mt-btn ${filter === 'failed' ? 'mt-btn-danger' : ''}" style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:6px; ${filter === 'failed' ? 'background:#ef4444; color:#fff;' : 'background:#f8fafc; border:1px solid #cbd5e1; color:#991b1b;'}" onclick="App.setOwnerWhatsAppLogFilter('failed')">
                                ❌ الرسائل الفاشلة (${summary.failed_count})
                            </button>
                            <button type="button" class="mt-btn ${filter === 'sent' ? 'mt-btn-success' : ''}" style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:6px; ${filter === 'sent' ? 'background:#16a34a; color:#fff;' : 'background:#f8fafc; border:1px solid #cbd5e1; color:#166534;'}" onclick="App.setOwnerWhatsAppLogFilter('sent')">
                                🟢 المرسلة بنجاح (${summary.sent_count})
                            </button>
                        </div>

                        <!-- Actions & Search -->
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <!-- Search -->
                            <div style="position:relative; min-width:220px;">
                                <input type="text" class="mt-input" style="padding:5px 28px 5px 10px; font-size:12px; width:100%; border-radius:6px;" placeholder="بحث برقم الهاتف، المستلم..." value="${this.escape(search)}" oninput="App.onOwnerWhatsAppSearch(this.value)" />
                                <span style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:12px; color:#94a3b8;">🔍</span>
                            </div>

                            ${Number(summary.failed_count || 0) > 0 ? `
                            <button type="button" class="mt-btn" style="background:#f59e0b; color:#fff; font-weight:800; font-size:12px; padding:5px 14px; border-radius:6px; border:none; box-shadow:0 2px 4px rgba(245,158,11,0.25);" onclick="App.retryAllOwnerWhatsAppFailed(this)">
                                🚀 إعادة إرسال كافة الفاشلة (${summary.failed_count})
                            </button>
                            <button type="button" class="mt-btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11.5px; padding:5px 10px; border-radius:6px;" onclick="App.clearAllOwnerWhatsAppFailed()" title="مسح سجلات الرسائل الفاشلة">
                                🗑️ مسح الفاشلة
                            </button>
                            ` : ''}

                            <button type="button" class="mt-btn" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-size:12px; padding:5px 12px; border-radius:6px; font-weight:700;" onclick="App.renderOwnerWhatsAppSettings()">
                                🔄 تحديث
                            </button>
                        </div>
                    </div>

                    <!-- Logs Table -->
                    <div style="overflow-x:auto; max-height:480px;">
                        <table class="mt-table" style="font-size:12px; width:100%;">
                            <thead>
                                <tr style="background:#f8fafc; position:sticky; top:0; z-index:2;">
                                    <th style="width:40px;">#</th>
                                    <th style="width:160px;">نوع الحدث / الرسالة</th>
                                    <th style="width:140px;">المستلم / الرقم</th>
                                    <th style="width:130px;">الشبكة / النطاق</th>
                                    <th>نص الرسالة</th>
                                    <th style="width:190px;">الحالة وسبب الفشل</th>
                                    <th style="width:130px;">التاريخ</th>
                                    <th style="width:140px; text-align:center;">الإجراء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logs.length > 0 ? logs.map((l, i) => {
                                    const isFailed = l.status === 'failed';
                                    const isSent = l.status === 'sent';
                                    return `
                                    <tr id="owner-wa-row-${l.id}" style="background:${isFailed ? '#fff5f5' : '#ffffff'}; transition:background 0.2s;">
                                        <td><b style="color:#64748b;">${l.id}</b></td>
                                        <td>
                                            <span class="mt-badge" style="background:${isFailed ? '#fee2e2' : '#e0f2fe'}; color:${isFailed ? '#991b1b' : '#0369a1'}; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px; display:inline-block;">
                                                ${this.escape(l.event_label || l.event_type || 'رسالة')}
                                            </span>
                                        </td>
                                        <td>
                                            <div style="font-weight:700; color:#0f172a; direction:ltr; text-align:right; font-family:monospace; font-size:12.5px;">
                                                ${this.escape(l.recipient_phone || '—')}
                                            </div>
                                            ${l.recipient_name && l.recipient_name !== 'مالك النظام' ? `<div style="font-size:11px; color:#64748b;">${this.escape(l.recipient_name)}</div>` : ''}
                                        </td>
                                        <td>
                                            <span style="font-size:11px; color:#334155; font-weight:600;">
                                                ${this.escape(l.network_name || 'المنظومة')}
                                            </span>
                                        </td>
                                        <td>
                                            <div style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; color:#334155;" onclick="App.showOwnerWhatsAppMessageDetails(${l.id})" title="انقر لعرض كامل نص الرسالة">
                                                ${this.escape(l.message_text || '')}
                                            </div>
                                        </td>
                                        <td>
                                            <div style="display:flex; flex-direction:column; gap:2px;">
                                                <span class="mt-badge" style="background:${isSent ? '#dcfce7' : (isFailed ? '#fee2e2' : '#f1f5f9')}; color:${isSent ? '#166534' : (isFailed ? '#991b1b' : '#334155')}; font-weight:700; font-size:11px; padding:2px 8px; border-radius:12px; display:inline-block; width:fit-content;">
                                                    ${isSent ? '✓ تم الإرسال 🟢' : (isFailed ? '❌ فشل الإرسال 🔴' : '⏳ معلق')}
                                                </span>
                                                ${l.error_message ? `
                                                    <div style="font-size:10.5px; color:#b91c1c; line-height:1.4; max-width:180px; word-break:break-word;" title="${this.escape(l.error_message)}">
                                                        ⚠️ ${this.escape(l.error_message)}
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </td>
                                        <td>
                                            <div style="font-size:11px; color:#64748b;">${this.escape(l.created_at || '')}</div>
                                        </td>
                                        <td style="text-align:center;">
                                            <div style="display:inline-flex; align-items:center; gap:4px;">
                                                <button type="button" id="btn-retry-wa-${l.id}" class="mt-btn mt-btn-sm" style="background:${isFailed ? '#f59e0b' : '#0284c7'}; color:#fff; font-weight:800; font-size:11px; padding:3px 8px; border:none; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.1);" onclick="App.retryOwnerWhatsAppLog(${l.id}, this)" title="إعادة إرسال الرسالة فوراً عبر بوابة المالك السيادية">
                                                    🔄 ${isFailed ? 'إعادة' : 'إعادة إرسال'}
                                                </button>
                                                <button type="button" class="mt-btn mt-btn-sm" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; font-size:11px; padding:3px 7px; border-radius:4px;" onclick="App.showOwnerWhatsAppMessageDetails(${l.id})" title="عرض التفاصيل">
                                                    👁️
                                                </button>
                                                <button type="button" class="mt-btn mt-btn-sm" style="background:#fff; color:#ef4444; border:1px solid #fca5a5; font-size:11px; padding:3px 6px; border-radius:4px;" onclick="App.deleteOwnerWhatsAppLog(${l.id})" title="حذف السجل">
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                                }).join('') : `
                                <tr>
                                    <td colspan="8" style="text-align:center; padding:36px; color:#94a3b8;">
                                        <div style="font-size:32px; margin-bottom:6px;">📭</div>
                                        <b style="font-size:13.5px; color:#475569;">
                                            ${filter === 'failed' ? 'لا توجد رسائل واتساب فاشلة حالياً 🎉 كافة الرسائل تعمل بنجاح!' : 'لا توجد رسائل واتساب مسجلة مطابقة لمعايير البحث'}
                                        </b>
                                    </td>
                                </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_whatsapp',
            archetype: 'detail',
            eyebrow: 'SOVEREIGN WHATSAPP GATEWAY',
            title: 'واتساب مالك المنظومة (Sovereign WA & Outbox)',
            subtitle: 'ربط وإدارة جلسة الواتساب السيادية، ومتابعة صندوق الرسائل الصادرة وإعادة إرسال الرسائل الفاشلة فوراً',
            icon: '📱',
            actions: [
                { label: '🔄 تحديث الشاشة', variant: 'secondary', onclick: "App.renderOwnerWhatsAppSettings()" }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;

        // Load QR image via API if disconnected
        if (!isConn) {
            this.api('owner_system_whatsapp_qr').then(qrData => {
                const img = document.getElementById('owner-wa-qr-img');
                const spinner = document.getElementById('owner-wa-qr-spinner');
                if (!img) return;
                if (qrData?.qr) {
                    img.src = qrData.qr;
                    img.style.display = 'block';
                    if (spinner) spinner.style.display = 'none';
                } else if (qrData?.status === 'CONNECTED') {
                    this.renderOwnerWhatsAppSettings();
                } else {
                    if (spinner) spinner.innerHTML = '<div style="font-size:13px;color:#ef4444;">⚠️ رمز QR غير متاح حالياً</div>';
                }
            }).catch(() => {
                const spinner = document.getElementById('owner-wa-qr-spinner');
                if (spinner) spinner.innerHTML = '<div style="font-size:13px;color:#ef4444;">❌ خطأ في تحميل رمز QR</div>';
            });
        }
    };

    App.setOwnerWhatsAppLogFilter = function (filter) {
        this._ownerWaLogFilter = filter;
        this.renderOwnerWhatsAppSettings();
    };

    App.onOwnerWhatsAppSearch = function (val) {
        this._ownerWaLogSearch = val;
        clearTimeout(this._ownerWaSearchDebounce);
        this._ownerWaSearchDebounce = setTimeout(() => {
            this.renderOwnerWhatsAppSettings();
        }, 200);
    };

    App.retryOwnerWhatsAppLog = async function (logId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        }
        this.toast('جاري إعادة إرسال رسالة الواتساب عبر بوابة المالك السيادية...', 'info', 3000);

        try {
            const res = await this.api('owner_system_whatsapp_retry', {}, 'POST', { log_id: logId });
            if (res && res.success) {
                this.toast(res.message || 'تمت إعادة إرسال الرسالة بنجاح 🟢', 'success', 5000);
                this.renderOwnerWhatsAppSettings();
            } else {
                this.toast(res?.error || 'تعذر إعادة إرسال الرسالة', 'danger', 6000);
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.innerHTML = '🔄 إعادة';
                }
            }
        } catch (e) {
            this.toast('حدث خطأ أثناء الاتصال بالسيرفر', 'danger');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = '🔄 إعادة';
            }
        }
    };

    App.retryAllOwnerWhatsAppFailed = async function (btnEl) {
        if (!confirm('هل تريد إعادة إرسال كافة رسائل الواتساب الفاشلة الآن عبر بوابة المالك السيادية؟')) return;

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إرسال الكل...';
        }
        this.toast('جاري معالجة وإعادة إرسال كافة الرسائل الفاشلة...', 'info', 4000);

        try {
            const res = await this.api('owner_system_whatsapp_retry_all', {}, 'POST', {});
            if (res && res.success) {
                this.toast(res.message || 'تمت معالجة إعادة إرسال الرسائل الفاشلة بنجاح!', 'success', 6000);
                this.renderOwnerWhatsAppSettings();
            } else {
                this.toast(res?.error || 'فشلت عملية إعادة الإرسال', 'danger');
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.innerHTML = '🚀 إعادة إرسال كافة الفاشلة';
                }
            }
        } catch (e) {
            this.toast('حدث خطأ أثناء معالجة إعادة الإرسال', 'danger');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = '🚀 إعادة إرسال كافة الفاشلة';
            }
        }
    };

    App.showOwnerWhatsAppMessageDetails = function (logId) {
        const item = (this._ownerWaLogsCache || []).find(l => Number(l.id) === Number(logId));
        if (!item) return;

        const isFailed = item.status === 'failed';
        const isSent = item.status === 'sent';

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 18px; border-bottom:1px solid #334155;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>📱</span> تفاصيل رسالة الواتساب #${item.id}
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <div class="mt-modal-body" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                    <div>
                        <small style="color:#64748b; display:block;">نوع الحدث:</small>
                        <b style="color:#0284c7; font-size:13px;">${this.escape(item.event_label || item.event_type)}</b>
                    </div>
                    <div>
                        <small style="color:#64748b; display:block;">حالة الإرسال:</small>
                        <span class="mt-badge" style="background:${isSent ? '#dcfce7' : (isFailed ? '#fee2e2' : '#f1f5f9')}; color:${isSent ? '#166534' : (isFailed ? '#991b1b' : '#334155')}; font-weight:700;">
                            ${isSent ? '✓ تم الإرسال 🟢' : (isFailed ? '❌ فشل الإرسال 🔴' : '⏳ معلق')}
                        </span>
                    </div>
                    <div>
                        <small style="color:#64748b; display:block;">رقم هاتف المستلم:</small>
                        <b style="font-family:monospace; direction:ltr; display:inline-block; font-size:13px;">${this.escape(item.recipient_phone)}</b>
                    </div>
                    <div>
                        <small style="color:#64748b; display:block;">تاريخ ووقت الإرسال:</small>
                        <span style="font-size:12px; color:#334155;">${this.escape(item.created_at)}</span>
                    </div>
                </div>

                ${item.error_message ? `
                <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; color:#991b1b; font-size:12.5px;">
                    <b>سبب الفشل المسجل:</b><br>
                    ${this.escape(item.error_message)}
                </div>` : ''}

                <div>
                    <label style="font-weight:700; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">نص الرسالة الكامل:</label>
                    <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:12px; font-size:13px; line-height:1.7; white-space:pre-wrap; max-height:220px; overflow-y:auto; color:#0f172a; font-family:inherit;">${this.escape(item.message_text)}</div>
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                <div>
                    ${isFailed ? `
                    <button type="button" class="mt-btn mt-btn-success" style="font-weight:700; font-size:13px; padding:6px 18px;" onclick="App.closeModal(); App.retryOwnerWhatsAppLog(${item.id})">
                        🔄 إعادة إرسال الرسالة الآن
                    </button>` : ''}
                </div>
                <button type="button" class="mt-btn" onclick="App.closeModal()" style="font-size:13px;">إغلاق</button>
            </div>
        `, '560px');
    };

    App.deleteOwnerWhatsAppLog = async function (logId) {
        if (!confirm(`هل أنت متأكد من حذف سجل الرسالة #${logId}؟`)) return;
        try {
            const res = await this.api('owner_system_whatsapp_delete_log', {}, 'POST', { log_id: logId });
            if (res && res.success) {
                this.toast(res.message || 'تم حذف السجل بنجاح', 'success');
                this.renderOwnerWhatsAppSettings();
            } else {
                this.toast(res?.error || 'تعذر حذف السجل', 'danger');
            }
        } catch (e) {
            this.toast('خطأ في الاتصال', 'danger');
        }
    };

    App.clearAllOwnerWhatsAppFailed = async function () {
        if (!confirm('هل أنت متأكد من مسح كافة سجلات الرسائل الفاشلة نهائياً؟')) return;
        try {
            const res = await this.api('owner_system_whatsapp_delete_log', {}, 'POST', { clear_all_failed: 1 });
            if (res && res.success) {
                this.toast(res.message || 'تم مسح السجلات الفاشلة بنجاح 🗑️', 'success');
                this.renderOwnerWhatsAppSettings();
            } else {
                this.toast(res?.error || 'تعذر مسح السجلات', 'danger');
            }
        } catch (e) {
            this.toast('خطأ في الاتصال', 'danger');
        }
    };

    // =========================================================================
    // ✈️ SOVEREIGN TELEGRAM MODULE (تلغرام مالك المنظومة)
    // =========================================================================

    App.renderOwnerTelegramSettings = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل إعدادات بوت تلغرام المالك...</div>';

        const data = await this.api('owner_system_telegram_get').catch(() => null);
        if (this.currentTab !== 'owner_telegram') return;

        const tg = data?.telegram || {};

        const content = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;">
                <!-- Config Card -->
                <div class="mt-card" style="padding:22px; border-right:4px solid #0284c7;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h3 style="margin:0; font-size:18px; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:8px;">
                            <span>✈️</span> إعدادات بوت تلغرام مالك النظام
                        </h3>
                        <span style="background:${tg.enabled ? '#dcfce7' : '#fee2e2'}; color:${tg.enabled ? '#15803d' : '#b91c1c'}; font-weight:800; font-size:12px; padding:3px 10px; border-radius:12px;">
                            ${tg.enabled ? 'مفعل 🟢' : 'معطل 🔴'}
                        </span>
                    </div>

                    <div style="font-size:12.5px; color:#475569; line-height:1.7; margin-bottom:16px;">
                        يتم استخدام بوت تلغرام لإرسال التنبيهات الفورية الحرجة لمالك النظام مباشرة (مثل تعطل إحدى الخدمات، تسجيل شبكات جديدة، أو عمليات النسخ الاحتياطي).
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div>
                            <label style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:13px; color:#0f172a; cursor:pointer;">
                                <input type="checkbox" id="owner-tg-enabled" ${tg.enabled ? 'checked' : ''} />
                                تفعيل إشعارات بوت تلغرام للمالك
                            </label>
                        </div>

                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">رمز البوت (Telegram Bot Token)</label>
                            <input type="password" id="owner-tg-token" class="mt-input" style="width:100%; font-family:monospace;" placeholder="مثال: 123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" value="${this.escape(tg.bot_token || '')}" />
                        </div>

                        <div>
                            <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">معرف محادثة المالك (Chat ID)</label>
                            <input type="text" id="owner-tg-chat-id" class="mt-input" style="width:100%; font-family:monospace;" placeholder="مثال: 987654321" value="${this.escape(tg.chat_id || '')}" />
                        </div>

                        <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
                            <b style="font-size:13px; color:#334155; display:block; margin-bottom:8px;">التنبيهات الفورية المفعلة عبر تلغرام:</b>
                            <div style="display:flex; flex-direction:column; gap:8px; font-size:12.5px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="owner-tg-notif-server" ${tg.notify_server_alerts ? 'checked' : ''} /> تعطل خدمات الخادم أو ارتفاع استهلاك الذاكرة
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="owner-tg-notif-network" ${tg.notify_new_network ? 'checked' : ''} /> تسجيل شبكة عميل جديدة في النظام
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="owner-tg-notif-backups" ${tg.notify_backups ? 'checked' : ''} /> إشعارات اكتمال النسخ الاحتياطي لقاعدة البيانات
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="owner-tg-notif-sec" ${tg.notify_security ? 'checked' : ''} /> تنبيهات محاولات الدخول الخاطئة والأمان
                                </label>
                            </div>
                        </div>

                        <div style="margin-top:10px; display:flex; gap:10px;">
                            <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; font-weight:800; flex:1; padding:10px;" onclick="App.saveOwnerTelegramConfig()">
                                💾 حفظ إعدادات تلغرام
                            </button>
                            <button type="button" class="mt-btn" style="background:#10b981; color:#fff; font-weight:800; padding:10px 16px;" onclick="App.sendTestTelegramToOwner()">
                                🚀 اختبار الإرسال
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Info Guide Card -->
                <div class="mt-card" style="padding:22px; border-right:4px solid #334155;">
                    <h3 style="margin:0 0 6px 0; font-size:17px; color:#0f172a; font-weight:800;">
                        💡 كيفية إنشاء بوت تلغرام والحصول على البيانات
                    </h3>
                    <div style="font-size:13px; color:#475569; line-height:1.8;">
                        <ol style="margin:0; padding-right:20px;">
                            <li>افتح تطبيق تلغرام وابحث عن البوت الرسمي <b>@BotFather</b>.</li>
                            <li>أرسل الأمر <code>/newbot</code> ثم اتبع التعليمات لتسمية البوت.</li>
                            <li>ستحصل على <b>API Token</b>، قم بنسخه ولصقه في حقل Token أعلاه.</li>
                            <li>ابحث في تلغرام عن البوت <b>@userinfobot</b> لمعرفة الـ <b>Chat ID</b> الخاص بك وضعه في حقل Chat ID.</li>
                            <li>ابدأ المحادثة مع بوتك بالضغط على <b>Start</b> ثم اضغط "اختبار الإرسال" هنا للتأكد من وصول التنبيهات.</li>
                        </ol>
                    </div>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_telegram',
            archetype: 'detail',
            eyebrow: 'SOVEREIGN TELEGRAM BOT',
            title: 'بوت تلغرام مالك المنظومة',
            subtitle: 'تكوين واستقبال التنبيهات السيادية الفورية وتقارير الأمان عبر تلغرام',
            icon: '✈️',
            actions: [
                { label: '🔄 تحديث', variant: 'secondary', onclick: "App.renderOwnerTelegramSettings()" }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    // =========================================================================
    // 🛠️ SOVEREIGN HELPER METHODS (الدوال المساعدة لعمليات المالك)
    // =========================================================================

    App.openAssignPlanModal = function (netId) {
        if (typeof this.showNetworkSubscriptionModal === 'function') {
            return this.showNetworkSubscriptionModal(netId);
        }
        this.switchTab('network_subscriptions');
    };

    App.openAddNetworkModal = function () {
        return this.openAddClientNetworkModal();
    };

    App.openAddClientNetworkModal = async function () {
        const subRes = await this.api('owner_system_subscription_center').catch(() => null);
        const plans = subRes?.plans || [];

        const formHtml = `
            <form id="add-client-network-form" onsubmit="App.saveNewClientNetwork(event)" style="display:flex; flex-direction:column; gap:14px; text-align:right;">
                <div>
                    <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">اسم شبكة العميل *</label>
                    <input type="text" id="new-net-name" class="mt-input" style="width:100%;" required placeholder="مثال: شبكة الأمل اللاسلكية" />
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">كود الشبكة (اختياري)</label>
                        <input type="text" id="new-net-code" class="mt-input" style="width:100%; font-family:monospace;" placeholder="مثال: NET-005 (تلقائي)" />
                    </div>
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">المدينة / المحافظة</label>
                        <input type="text" id="new-net-city" class="mt-input" style="width:100%;" placeholder="مثال: صنعاء / عدن" />
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">هاتف التواصل (اليمن)</label>
                        <input type="tel" id="new-net-phone" class="mt-input" style="width:100%; font-family:monospace;" maxlength="20" placeholder="770283515" onpaste="App.onPhoneInputAutoFormat(this)" oninput="App.onPhoneInputAutoFormat(this)" />
                    </div>
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">باقة الاشتراك الأولية</label>
                        <select id="new-net-plan" class="mt-input" style="width:100%;">
                            ${plans.map(p => `<option value="${p.id}">${this.escape(p.name)} (${p.monthly_price || 0} ${p.currency_code || 'YER'})</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">ملاحظات العميل</label>
                    <textarea id="new-net-notes" class="mt-input" rows="2" style="width:100%;" placeholder="أي بيانات أو شروط خاصة بالعميل..."></textarea>
                </div>

                <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="mt-btn" style="background:#64748b; color:#fff;" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:800;">✅ إنشاء شبكة العميل وتفعيلها</button>
                </div>
            </form>
        `;
        this.showModal('➕ إضافة شبكة عميل جديدة للمنظومة', formHtml, '620px');
    };

    App.saveNewClientNetwork = async function (e) {
        if (e) e.preventDefault();
        const name = document.getElementById('new-net-name').value.trim();
        const code = document.getElementById('new-net-code').value.trim();
        const city = document.getElementById('new-net-city').value.trim();
        const phone = document.getElementById('new-net-phone').value.trim();
        const planId = Number(document.getElementById('new-net-plan').value || 1);
        const notes = document.getElementById('new-net-notes').value.trim();

        if (!name) return this.toast('اسم شبكة العميل مطلوب', 'danger');

        const r = await this.api('owner_system_create_network', {}, 'POST', {
            name, code, city, phone, plan_id: planId, notes
        });

        if (r?.success) {
            this.toast(r.message || 'تم إنشاء وتفعيل شبكة العميل بنجاح!', 'success');
            this.closeModal();
            if (this.currentTab === 'owner_clients_networks') this.renderOwnerClientsNetworks();
            else this.renderOwnerPortalOverview();
        } else {
            this.toast(r?.error || 'فشل إنشاء الشبكة', 'danger');
        }
    };

    App.openEditNetworkModal = async function (netId) {
        const netIdNum = Number(netId);
        const res = await this.api('owner_system_get_network_admins').catch(() => null);
        const networks = res?.networks || [];
        const net = networks.find(n => Number(n.id || n.network_id) === netIdNum);
        if (!net) return this.toast('الشبكة غير موجودة', 'danger');

        const formHtml = `
            <form id="edit-client-network-form" onsubmit="App.saveEditedNetwork(event, ${netIdNum})" style="display:flex; flex-direction:column; gap:14px; text-align:right;">
                <div>
                    <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">اسم الشبكة</label>
                    <input type="text" id="edit-net-name" class="mt-input" style="width:100%;" required value="${this.escape(net.name || '')}" />
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">كود الشبكة</label>
                        <input type="text" id="edit-net-code" class="mt-input" style="width:100%; font-family:monospace;" required value="${this.escape(net.code || '')}" />
                    </div>
                    <div>
                        <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">الموقع / المدينة</label>
                        <input type="text" id="edit-net-city" class="mt-input" style="width:100%;" value="${this.escape(net.location || net.city || '')}" />
                    </div>
                </div>

                <div>
                    <label style="display:block; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:4px;">ملاحظات</label>
                    <textarea id="edit-net-notes" class="mt-input" rows="2" style="width:100%;">${this.escape(net.notes || '')}</textarea>
                </div>

                <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="mt-btn" style="background:#64748b; color:#fff;" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:800;">💾 حفظ التعديلات</button>
                </div>
            </form>
        `;
        this.showModal('✏️ تعديل بيانات شبكة العميل', formHtml, '560px');
    };

    App.saveEditedNetwork = async function (e, netId) {
        if (e) e.preventDefault();
        const name = document.getElementById('edit-net-name').value.trim();
        const code = document.getElementById('edit-net-code').value.trim();
        const city = document.getElementById('edit-net-city').value.trim();
        const notes = document.getElementById('edit-net-notes').value.trim();

        const r = await this.api('owner_system_save_network_info', {}, 'POST', {
            network_id: netId, name, code, city, notes
        });

        if (r?.success) {
            this.toast(r.message || 'تم حفظ بيانات الشبكة بنجاح', 'success');
            this.closeModal();
            if (this.currentTab === 'owner_clients_networks') this.renderOwnerClientsNetworks();
            else this.renderOwnerPortalOverview();
        } else {
            this.toast(r?.error || 'فشل حفظ التعديلات', 'danger');
        }
    };

    App.toggleNetworkSuspension = async function (netId, currentStatus) {
        const netIdNum = Number(netId);
        const isCurrentActive = currentStatus === 'active';
        const targetStatus = isCurrentActive ? 'suspended' : 'active';
        const promptMsg = isCurrentActive 
            ? 'هل أنت متأكد من تعليق خدمة هذه الشبكة؟ سيتم إيقاف الخدمة وإشعار مدير الشبكة عبر الواتساب فوراً.'
            : 'هل أنت متأكد من تفعيل خدمة هذه الشبكة؟ سيتم إعادة تفعيلها فوراً وإشعار مدير الشبكة عبر الواتساب.';

        if (!confirm(promptMsg)) return;

        const r = await this.api('owner_system_toggle_network_status', {}, 'POST', {
            network_id: netIdNum,
            status: targetStatus
        });

        if (r?.success) {
            this.toast(r.message, 'success');
            if (this.currentTab === 'owner_clients_networks') this.renderOwnerClientsNetworks();
            else this.renderOwnerPortalOverview();
        } else {
            this.toast(r?.error || 'تعذر تعديل حالة الشبكة', 'danger');
        }
    };

    App.deleteClientNetwork = async function (netId) {
        const netIdNum = Number(netId);
        if (netIdNum <= 1) return this.toast('لا يمكن حذف الشبكة الأساسية للنظام', 'danger');

        const c = prompt('تحذير سيادي: سيتم حذف شبكة العميل وكافة سجلاتها وتفويضاتها نهائياً.\nللتأكيد اكتب: حذف الشبكة');
        if (c !== 'حذف الشبكة') return this.toast('تم إلغاء عملية الحذف', 'info');

        const r = await this.api('owner_system_delete_network', {}, 'POST', { network_id: netIdNum });
        if (r?.success) {
            this.toast(r.message, 'success');
            if (this.currentTab === 'owner_clients_networks') this.renderOwnerClientsNetworks();
            else this.renderOwnerPortalOverview();
        } else {
            this.toast(r?.error || 'فشل حذف الشبكة', 'danger');
        }
    };

    App.createInstantDatabaseBackup = async function () {
        this.toast('جاري إنشاء نسخة احتياطية شاملة لقاعدة البيانات...', 'info', 3000);
        const r = await this.api('owner_system_server_backup', {}, 'POST', {});
        if (r?.success) {
            const dl = r.download_url ? `<a href="${r.download_url}" target="_blank" style="color:#38bdf8; font-weight:800; text-decoration:underline;">تحميل النسخة فوراً (${r.filename})</a>` : '';
            this.showModal('💾 تم إنشاء النسخة الاحتياطية بنجاح', `
                <div style="text-align:center; padding:16px;">
                    <div style="font-size:42px; margin-bottom:8px;">✅</div>
                    <b style="font-size:16px; color:#15803d;">تم إنشاء النسخة الاحتياطية الشاملة بأمان</b>
                    <div style="font-size:13px; color:#334155; margin:10px 0;">اسم الملف: <b>${this.escape(r.filename || '')}</b></div>
                    <div style="margin-top:16px;">
                        ${r.download_url ? `<a href="${r.download_url}" class="mt-btn mt-btn-primary" style="display:inline-block; font-weight:800; text-decoration:none;">⬇️ تحميل ملف النسخة (${r.filename})</a>` : ''}
                    </div>
                </div>
            `, '500px');
        } else {
            this.toast(r?.error || 'فشل إنشاء النسخة الاحتياطية', 'danger');
        }
    };

    App.clearServerCacheNow = async function () {
        if (!confirm('تنظيف التخزين المؤقت (Opcache وملفات الجلسات المؤقتة)؟')) return;
        const r = await this.api('owner_system_clear_cache', {}, 'POST', {});
        if (r?.success) {
            this.toast(r.message || 'تم تفريغ التخزين المؤقت بنجاح', 'success');
        } else {
            this.toast(r?.error || 'فشل تنظيف الكاش', 'danger');
        }
    };

    App.sendTestWhatsAppToOwner = async function () {
        const phone = document.getElementById('owner-wa-test-phone')?.value.trim();
        if (!phone) return this.toast('يرجى إدخال رقم الهاتف', 'warning');
        this.toast('جاري إرسال رسالة الاختبار عبر واتساب المالك...', 'info', 3000);
        const r = await this.api('owner_system_whatsapp_test', {}, 'POST', { phone });
        if (r?.success) {
            this.toast('✅ ' + (r.message || 'تم إرسال رسالة الاختبار بنجاح!'), 'success');
        } else {
            this.toast('❌ ' + (r?.error || 'فشل إرسال رسالة الاختبار'), 'danger');
        }
    };

    App.saveOwnerWhatsAppConfig = async function () {
        const enabled = document.getElementById('owner-wa-enabled')?.checked;
        const phone = document.getElementById('owner-wa-phone')?.value.trim();
        const apiUrl = document.getElementById('owner-wa-api-url')?.value.trim();
        const notifAlerts = document.getElementById('owner-wa-notif-alerts')?.checked;
        const notifSecurity = document.getElementById('owner-wa-notif-security')?.checked;

        const r = await this.api('owner_system_whatsapp_save', {}, 'POST', {
            enabled,
            owner_phone: phone,
            api_url: apiUrl,
            notify_server_alerts: notifAlerts,
            notify_security: notifSecurity
        });

        if (r?.success) {
            this.toast(r.message || 'تم حفظ إعدادات واتساب المالك بنجاح', 'success');
        } else {
            this.toast(r?.error || 'فشل حفظ الإعدادات', 'danger');
        }
    };

    App.refreshOwnerWhatsAppQr = async function () {
        const img = document.getElementById('owner-wa-qr-img');
        const spinner = document.getElementById('owner-wa-qr-spinner');
        if (spinner) {
            spinner.style.display = 'flex';
            spinner.innerHTML = '<div style="font-size:32px">⏳</div><div style="font-size:12px">جاري تحديث رمز QR...</div>';
        }
        if (img) img.style.display = 'none';

        const res = await this.api('owner_system_whatsapp_qr').catch(() => null);
        if (res?.qr) {
            if (img) { img.src = res.qr; img.style.display = 'block'; }
            if (spinner) spinner.style.display = 'none';
            this.toast('✅ تم تحديث رمز QR', 'success', 2000);
        } else if (res?.status === 'CONNECTED') {
            this.toast('✅ الجلسة متصلة بالفعل', 'success', 3000);
            this.renderOwnerWhatsAppSettings();
        } else {
            if (spinner) spinner.innerHTML = '<div style="font-size:13px;color:#ef4444;">⚠️ رمز QR غير متاح حالياً</div>';
            this.toast('⚠️ رمز QR غير متاح حالياً', 'warning', 3000);
        }
    };

    App.saveOwnerTelegramConfig = async function () {
        const enabled = document.getElementById('owner-tg-enabled')?.checked;
        const token = document.getElementById('owner-tg-token')?.value.trim();
        const chatId = document.getElementById('owner-tg-chat-id')?.value.trim();
        const notifServer = document.getElementById('owner-tg-notif-server')?.checked;
        const notifNetwork = document.getElementById('owner-tg-notif-network')?.checked;
        const notifBackups = document.getElementById('owner-tg-notif-backups')?.checked;
        const notifSec = document.getElementById('owner-tg-notif-sec')?.checked;

        const r = await this.api('owner_system_telegram_save', {}, 'POST', {
            enabled,
            bot_token: token,
            chat_id: chatId,
            notify_server_alerts: notifServer,
            notify_new_network: notifNetwork,
            notify_backups: notifBackups,
            notify_security: notifSec
        });

        if (r?.success) {
            this.toast(r.message || 'تم حفظ إعدادات بوت تلغرام بنجاح', 'success');
        } else {
            this.toast(r?.error || 'فشل حفظ إعدادات تلغرام', 'danger');
        }
    };

    App.sendTestTelegramToOwner = async function () {
        const chatId = document.getElementById('owner-tg-chat-id')?.value.trim();
        this.toast('جاري إرسال رسالة الاختبار عبر تلغرام...', 'info', 3000);
        const r = await this.api('owner_system_telegram_test', {}, 'POST', { chat_id: chatId });
        if (r?.success) {
            this.toast('✅ ' + (r.message || 'تم إرسال رسالة الاختبار عبر تلغرام بنجاح!'), 'success');
        } else {
            this.toast('❌ ' + (r?.error || 'فشل إرسال رسالة تلغرام'), 'danger');
        }
    };

    App.sendOwnerBroadcastNow = async function () {
        const title = document.getElementById('bc-title')?.value.trim();
        const message = document.getElementById('bc-message')?.value.trim();
        const audience = document.getElementById('bc-audience')?.value;
        const chWa = document.getElementById('bc-ch-wa')?.checked;
        const chTg = document.getElementById('bc-ch-tg')?.checked;
        const chInapp = document.getElementById('bc-ch-inapp')?.checked;

        if (!title || !message) return this.toast('يرجى إدخال عنوان ونص التعميم', 'warning');

        const channels = [];
        if (chWa) channels.push('whatsapp');
        if (chTg) channels.push('telegram');
        if (chInapp) channels.push('in_app');

        if (channels.length === 0) return this.toast('يرجى تحديد قناة إرسال واحدة على الأقل', 'warning');

        if (!confirm('هل أنت متأكد من بث وإرسال هذا التعميم فوراً؟')) return;

        this.toast('جاري إرسال التعميم عبر القنوات المحددة...', 'info', 3000);
        const r = await this.api('owner_system_broadcast_send', {}, 'POST', {
            title,
            message,
            target_audience: audience,
            channels
        });

        if (r?.success) {
            this.toast(r.message || 'تم إرسال التعميم بنجاح!', 'success');
            document.getElementById('bc-title').value = '';
            document.getElementById('bc-message').value = '';
            this.renderOwnerBroadcast();
        } else {
            this.toast(r?.error || 'فشل إرسال التعميم', 'danger');
        }
    };

    // =========================================================================
    // 💰 SOVEREIGN MASTER FINANCIAL CONSOLE (المركز المالي والمحاسبي السيادي الشامل)
    // =========================================================================

    App._ownerFinFilterNet = 'all';
    App._ownerFinSubTab = 'overview';
    App._ownerFinVoucherType = 'all';
    App._ownerFinSearch = '';
    App._ownerFinCategory = 'all';

    App.setOwnerMasterFinSubTab = function (subTab) {
        this._ownerFinSubTab = subTab;
        this.renderOwnerMasterFinance();
    };

    App.setOwnerMasterFinNetwork = function (netId) {
        this._ownerFinFilterNet = netId;
        this.renderOwnerMasterFinance();
    };

    App.renderOwnerMasterFinance = async function () {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:28px;text-align:center;color:#64748b;font-weight:700;">جاري تحميل البيانات المالية المجمعة لكافة الشبكات... 💰</div>';

        const activeSub = this._ownerFinSubTab || 'overview';
        const filterNet = this._ownerFinFilterNet || 'all';

        // Load financial data based on active sub-tab
        let res = null;
        let coaRes = null;
        let voucherRes = null;
        let journalRes = null;
        let cashRes = null;

        try {
            if (activeSub === 'overview') {
                res = await this.api('owner_get_master_finance_summary', { network_id: filterNet });
            } else if (activeSub === 'chart_of_accounts') {
                coaRes = await this.api('owner_get_master_chart_of_accounts', { network_id: filterNet });
            } else if (activeSub === 'vouchers') {
                voucherRes = await this.api('owner_get_master_vouchers', {
                    network_id: filterNet,
                    type: this._ownerFinVoucherType || 'all',
                    search: this._ownerFinSearch || '',
                    category: this._ownerFinCategory || 'all'
                });
            } else if (activeSub === 'journal') {
                journalRes = await this.api('owner_get_master_journal_entries', {
                    network_id: filterNet,
                    search: this._ownerFinSearch || ''
                });
            } else if (activeSub === 'cashboxes') {
                cashRes = await this.api('owner_get_master_cashboxes', { network_id: filterNet });
            }
        } catch (e) {
            view.innerHTML = `<div class="mt-card" style="padding:20px;color:#b91c1c">فشل جلب البيانات المالية: ${esc(e.message || e)}</div>`;
            return;
        }

        if (this.currentTab !== 'owner_master_finance') return;

        // Fetch networks list for dropdown
        const networks = res?.networks || coaRes?.networks || voucherRes?.networks || journalRes?.networks || this.networks || [];

        // Build Master Filter & Nav Bar
        const navBarHtml = `
            <div style="background:linear-gradient(135deg, #0b1329 0%, #0f172a 50%, #1e293b 100%); color:#fff; border-radius:12px; padding:20px 24px; margin-bottom:18px; border:1px solid #334155; box-shadow:0 8px 24px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <span style="font-size:24px;">💰</span>
                            <h2 style="margin:0; font-size:20px; font-weight:800; color:#f8fafc;">المركز المالي والمحاسبي السيادي لجميع الشبكات</h2>
                            <span class="mt-badge" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:800;">MASTER CONSOLIDATED FINANCE</span>
                        </div>
                        <div style="color:#94a3b8; font-size:12.5px; max-width:750px; line-height:1.6;">
                            رقابة مالية مركزية وموحدة: إيرادات، مبيعات الكروت، مصروفات التشغيل، الأرباح، الصناديق، وسندات القبض والصرف لكافة الشبكات دون الحاجة للتبديل بين الحسابات.
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <!-- Network Filter Dropdown -->
                        <div style="display:flex; align-items:center; gap:6px; background:#1e293b; padding:4px 10px; border-radius:8px; border:1px solid #475569;">
                            <span style="font-size:14px;">🌐</span>
                            <label style="font-size:12px; font-weight:700; color:#cbd5e1;">الشبكة:</label>
                            <select class="mt-select" style="background:#0f172a; color:#fff; border-color:#334155; font-weight:700; font-size:12.5px; padding:5px 10px; border-radius:6px;" onchange="App.setOwnerMasterFinNetwork(this.value)">
                                <option value="all" ${filterNet === 'all' ? 'selected' : ''}>🌐 كافة الشبكات (عرض موحد شامل)</option>
                                ${networks.map(n => `<option value="${n.id}" ${String(filterNet) === String(n.id) ? 'selected' : ''}>🏢 ${esc(n.name)} (${esc(n.code || 'ID: ' + n.id)})</option>`).join('')}
                            </select>
                        </div>

                        <button class="mt-btn mt-btn-success" style="font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:6px; padding:7px 14px;" onclick="App.openOwnerNewVoucherModal()">
                            <span>➕</span>
                            <span>إضافة سند مالي مباشر</span>
                        </button>

                        <button class="mt-btn" style="background:#334155; color:#f8fafc; border:1px solid #475569; font-weight:700; font-size:13px;" onclick="App.renderOwnerMasterFinance()">
                            <span>🔄</span>
                            <span>تحديث</span>
                        </button>
                    </div>
                </div>

                <!-- Sub Navigation Tabs -->
                <div style="display:flex; gap:6px; margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.1); flex-wrap:wrap;">
                    <button class="mt-btn" style="padding:6px 14px; font-size:12.5px; font-weight:800; border-radius:8px; ${activeSub === 'overview' ? 'background:#0284c7; color:#fff; border-color:#38bdf8;' : 'background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid #334155;'}" onclick="App.setOwnerMasterFinSubTab('overview')">
                        📊 لوحة القيادة والمؤشرات المجمعة
                    </button>
                    <button class="mt-btn" style="padding:6px 14px; font-size:12.5px; font-weight:800; border-radius:8px; ${activeSub === 'vouchers' ? 'background:#0284c7; color:#fff; border-color:#38bdf8;' : 'background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid #334155;'}" onclick="App.setOwnerMasterFinSubTab('vouchers')">
                        💳 سندات القبض والصرف لجميع الشبكات
                    </button>
                    <button class="mt-btn" style="padding:6px 14px; font-size:12.5px; font-weight:800; border-radius:8px; ${activeSub === 'chart_of_accounts' ? 'background:#0284c7; color:#fff; border-color:#38bdf8;' : 'background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid #334155;'}" onclick="App.setOwnerMasterFinSubTab('chart_of_accounts')">
                        🌳 شجرة الحسابات الموحدة
                    </button>
                    <button class="mt-btn" style="padding:6px 14px; font-size:12.5px; font-weight:800; border-radius:8px; ${activeSub === 'journal' ? 'background:#0284c7; color:#fff; border-color:#38bdf8;' : 'background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid #334155;'}" onclick="App.setOwnerMasterFinSubTab('journal')">
                        📑 القيود اليومية لجميع الشبكات
                    </button>
                    <button class="mt-btn" style="padding:6px 14px; font-size:12.5px; font-weight:800; border-radius:8px; ${activeSub === 'cashboxes' ? 'background:#0284c7; color:#fff; border-color:#38bdf8;' : 'background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid #334155;'}" onclick="App.setOwnerMasterFinSubTab('cashboxes')">
                        💵 الصناديق والخزائن المدارة
                    </button>
                </div>
            </div>
        `;

        let tabContent = '';

        // -------------------------------------------------------------
        // SUB-TAB 1: OVERVIEW & KPIS
        // -------------------------------------------------------------
        if (activeSub === 'overview') {
            const k = res?.kpis || {};
            const breakdown = res?.networks_breakdown || [];
            const recent = res?.recent_transactions || [];

            tabContent = `
                <!-- Master KPI Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-bottom:20px;">
                    <!-- Card 1: Total Sales -->
                    <div class="mt-card" style="padding:18px; border-right:4px solid #10b981; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; font-weight:700; color:#64748b;">💎 إجمالي مبيعات الكروت المجمعة</span>
                            <span style="font-size:22px;">💰</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:8px 0 4px;">
                            ${Number(k.total_sales || 0).toLocaleString()} <span style="font-size:13px; font-weight:600; color:#64748b;">ر.ي</span>
                        </div>
                        <div style="font-size:11.5px; color:#10b981; font-weight:700;">
                            اليوم: ${Number(k.today_sales || 0).toLocaleString()} ر.ي · ${Number(k.total_cards_sold || 0).toLocaleString()} كرت
                        </div>
                    </div>

                    <!-- Card 2: Operating Expenses -->
                    <div class="mt-card" style="padding:18px; border-right:4px solid #ef4444; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; font-weight:700; color:#64748b;">💸 إجمالي المصروفات والمدفوعات</span>
                            <span style="font-size:22px;">📉</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:8px 0 4px;">
                            ${Number(k.total_expenses || 0).toLocaleString()} <span style="font-size:13px; font-weight:600; color:#64748b;">ر.ي</span>
                        </div>
                        <div style="font-size:11.5px; color:#ef4444; font-weight:700;">
                            اليوم: ${Number(k.today_expenses || 0).toLocaleString()} ر.ي (تشغيلي ومشتريات)
                        </div>
                    </div>

                    <!-- Card 3: Net Profit -->
                    <div class="mt-card" style="padding:18px; border-right:4px solid #0284c7; background:#f0f9ff;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; font-weight:700; color:#0369a1;">📈 صافي الأرباح المجمعة</span>
                            <span style="font-size:22px;">🏆</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:${(k.net_profit || 0) >= 0 ? '#0284c7' : '#ef4444'}; margin:8px 0 4px;">
                            ${Number(k.net_profit || 0).toLocaleString()} <span style="font-size:13px; font-weight:600; color:#0369a1;">ر.ي</span>
                        </div>
                        <div style="font-size:11.5px; color:#0369a1; font-weight:700;">
                            صافي العائد التشغيلي الإجمالي
                        </div>
                    </div>

                    <!-- Card 4: Total Cashbox Balance -->
                    <div class="mt-card" style="padding:18px; border-right:4px solid #8b5cf6; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; font-weight:700; color:#64748b;">🏦 إجمالي السيولة بالخزائن والصناديق</span>
                            <span style="font-size:22px;">💵</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:8px 0 4px;">
                            ${Number(k.total_cashbox_balance || 0).toLocaleString()} <span style="font-size:13px; font-weight:600; color:#64748b;">ر.ي</span>
                        </div>
                        <div style="font-size:11.5px; color:#8b5cf6; font-weight:700;">
                            سيولة نقدية وبنكية متاحة بكافة الفروع
                        </div>
                    </div>

                    <!-- Card 5: Distributor Debts -->
                    <div class="mt-card" style="padding:18px; border-right:4px solid #f59e0b; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12px; font-weight:700; color:#64748b;">⏳ مديونيات ومستحقات الموزعين</span>
                            <span style="font-size:22px;">👥</span>
                        </div>
                        <div style="font-size:24px; font-weight:900; color:#0f172a; margin:8px 0 4px;">
                            ${Number(k.total_distributor_debts || 0).toLocaleString()} <span style="font-size:13px; font-weight:600; color:#64748b;">ر.ي</span>
                        </div>
                        <div style="font-size:11.5px; color:#f59e0b; font-weight:700;">
                            لدى ${Number(k.total_distributors_count || 0)} موزع ونقطة بيع
                        </div>
                    </div>
                </div>

                <!-- Network Financial Breakdown Table -->
                <div class="mt-card" style="padding:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; gap:8px;">
                        <div>
                            <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">🏢 جدول الأداء المالي المقارن لكافة الشبكات والفروع</h3>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">مقارنة لحظية للمبيعات والمصروفات وصافي الأرباح والسيولة لكل شبكة مستقلة</div>
                        </div>
                        <button class="mt-btn mt-btn-sm" style="background:#0284c7; color:#fff; font-weight:700;" onclick="App.openAddNetworkModal()">
                            ➕ إضافة فرع / شبكة جديدة
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:10px 12px; text-align:right;"># الشبكة</th>
                                    <th style="padding:10px 12px; text-align:right;">اسم الشبكة والكود</th>
                                    <th style="padding:10px 12px; text-align:center;">كروت مباعة</th>
                                    <th style="padding:10px 12px; text-align:right;">مبيعات اليوم</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي المبيعات</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي المصروفات</th>
                                    <th style="padding:10px 12px; text-align:right;">صافي الأرباح</th>
                                    <th style="padding:10px 12px; text-align:right;">رصيد الخزينة</th>
                                    <th style="padding:10px 12px; text-align:right;">ديون الموزعين</th>
                                    <th style="padding:10px 12px; text-align:center;">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${breakdown.map(nb => {
                                    const netProfit = Number(nb.net_profit || 0);
                                    return `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:10px 12px; font-weight:700; color:#64748b;">${nb.network_id}</td>
                                        <td style="padding:10px 12px;">
                                            <div style="font-weight:800; color:#0f172a;">${esc(nb.network_name)}</div>
                                            <div style="font-size:11px; color:#0284c7; font-family:monospace;">${esc(nb.network_code || '-')}</div>
                                        </td>
                                        <td style="padding:10px 12px; text-align:center; font-weight:700;">${Number(nb.cards_count || 0).toLocaleString()}</td>
                                        <td style="padding:10px 12px; font-weight:700; color:#10b981;">${Number(nb.today_sales || 0).toLocaleString()} ر.ي</td>
                                        <td style="padding:10px 12px; font-weight:800; color:#0f172a;">${Number(nb.total_sales || 0).toLocaleString()} ر.ي</td>
                                        <td style="padding:10px 12px; font-weight:700; color:#ef4444;">${Number(nb.total_expenses || 0).toLocaleString()} ر.ي</td>
                                        <td style="padding:10px 12px; font-weight:900; color:${netProfit >= 0 ? '#0284c7' : '#dc2626'};">
                                            ${netProfit.toLocaleString()} ر.ي
                                        </td>
                                        <td style="padding:10px 12px; font-weight:700; color:#8b5cf6;">${Number(nb.cashbox_balance || 0).toLocaleString()} ر.ي</td>
                                        <td style="padding:10px 12px; font-weight:700; color:#f59e0b;">${Number(nb.distributor_debts || 0).toLocaleString()} ر.ي</td>
                                        <td style="padding:10px 12px; text-align:center;">
                                            <div style="display:inline-flex; gap:6px;">
                                                <button class="mt-btn mt-btn-sm" style="padding:4px 8px; font-size:11px; background:#0284c7; color:#fff;" onclick="App.openOwnerNewVoucherModal(${nb.network_id})" title="إضافة سند لهذه الشبكة">
                                                    ➕ سند
                                                </button>
                                                <button class="mt-btn mt-btn-sm" style="padding:4px 8px; font-size:11px; background:#f8fafc; border:1px solid #cbd5e1;" onclick="App.setOwnerMasterFinNetwork(${nb.network_id}); App.setOwnerMasterFinSubTab('vouchers');" title="تصفح سندات هذه الشبكة">
                                                    🔍 السندات
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Recent Master Transactions Stream -->
                <div class="mt-card" style="padding:20px;">
                    <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin-bottom:12px;">📜 أحدث الحركات المالية والسندات المجمعة عبر كافة الشبكات</h3>
                    <div class="table-responsive">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                                    <th style="padding:8px 10px; text-align:right;"># المعاملة</th>
                                    <th style="padding:8px 10px; text-align:right;">الشبكة</th>
                                    <th style="padding:8px 10px; text-align:right;">نوع الحركة</th>
                                    <th style="padding:8px 10px; text-align:right;">البيان والتفاصيل</th>
                                    <th style="padding:8px 10px; text-align:right;">المبلغ</th>
                                    <th style="padding:8px 10px; text-align:right;">المنفذ</th>
                                    <th style="padding:8px 10px; text-align:right;">التاريخ والوقت</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recent.map(tx => `
                                    <tr style="border-bottom:1px solid #f8fafc;">
                                        <td style="padding:8px 10px; color:#64748b; font-weight:700;">#${tx.id}</td>
                                        <td style="padding:8px 10px;">
                                            <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700;">
                                                🏢 ${esc(tx.network_name || 'شبكة ' + tx.network_id)}
                                            </span>
                                        </td>
                                        <td style="padding:8px 10px; font-weight:700; color:#0f172a;">${esc(tx.tx_type || tx.reference_type || '-')}</td>
                                        <td style="padding:8px 10px; color:#334155;">${esc(tx.description || '-')}</td>
                                        <td style="padding:8px 10px; font-weight:800; color:${(tx.cashbox_impact || 0) >= 0 ? '#10b981' : '#ef4444'};">
                                            ${Number(tx.debit > 0 ? tx.debit : tx.credit).toLocaleString()} ر.ي
                                        </td>
                                        <td style="padding:8px 10px; color:#64748b;">${esc(tx.creator_name || 'النظام')}</td>
                                        <td style="padding:8px 10px; color:#64748b; font-size:11.5px;">${esc(tx.created_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // -------------------------------------------------------------
        // SUB-TAB 2: VOUCHERS (سندات القبض والصرف الشاملة)
        // -------------------------------------------------------------
        else if (activeSub === 'vouchers') {
            const vList = voucherRes?.vouchers || voucherRes?.data || [];
            const vSum = voucherRes?.summary || {};

            tabContent = `
                <!-- Summary bar -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px;">
                    <div class="mt-card" style="padding:14px 18px; border-right:4px solid #10b981;">
                        <div style="font-size:11.5px; color:#64748b; font-weight:700;">إجمالي المقبوضات المجمعة</div>
                        <div style="font-size:20px; font-weight:900; color:#10b981; margin-top:4px;">
                            ${Number(vSum.total_receipts || 0).toLocaleString()} ر.ي
                        </div>
                    </div>
                    <div class="mt-card" style="padding:14px 18px; border-right:4px solid #ef4444;">
                        <div style="font-size:11.5px; color:#64748b; font-weight:700;">إجمالي المدفوعات والمصروفات</div>
                        <div style="font-size:20px; font-weight:900; color:#ef4444; margin-top:4px;">
                            ${Number(vSum.total_payments || 0).toLocaleString()} ر.ي
                        </div>
                    </div>
                    <div class="mt-card" style="padding:14px 18px; border-right:4px solid #0284c7;">
                        <div style="font-size:11.5px; color:#64748b; font-weight:700;">صافي التدفق النقدي للسندات</div>
                        <div style="font-size:20px; font-weight:900; color:#0284c7; margin-top:4px;">
                            ${Number(vSum.net_cashflow || 0).toLocaleString()} ر.ي
                        </div>
                    </div>
                </div>

                <!-- Filters & Actions -->
                <div class="mt-card" style="padding:16px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <select class="mt-select" style="font-size:12.5px; padding:6px 10px;" onchange="App._ownerFinVoucherType = this.value; App.renderOwnerMasterFinance();">
                                <option value="all" ${this._ownerFinVoucherType === 'all' ? 'selected' : ''}>كافة أنواع السندات (قبض + صرف)</option>
                                <option value="receipt" ${this._ownerFinVoucherType === 'receipt' ? 'selected' : ''}>سندات القبض (Receipts) 🟢</option>
                                <option value="payment" ${this._ownerFinVoucherType === 'payment' ? 'selected' : ''}>سندات الصرف (Payments) 🔴</option>
                            </select>

                            <input type="text" class="mt-input" style="width:240px; font-size:12.5px; padding:6px 10px;" placeholder="🔍 بحث برقم السند، الجهة، أو الوصف..." value="${esc(this._ownerFinSearch || '')}" onkeyup="if(event.key==='Enter'){ App._ownerFinSearch = this.value; App.renderOwnerMasterFinance(); }">
                        </div>

                        <button class="mt-btn mt-btn-success" style="font-weight:800; font-size:13px;" onclick="App.openOwnerNewVoucherModal()">
                            ➕ إنشاء سند مالي جديد
                        </button>
                    </div>
                </div>

                <!-- Vouchers Table -->
                <div class="mt-card" style="padding:20px;">
                    <div class="table-responsive">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:10px 12px; text-align:right;">رقم السند</th>
                                    <th style="padding:10px 12px; text-align:right;">الشبكة التابع لها</th>
                                    <th style="padding:10px 12px; text-align:right;">النوع</th>
                                    <th style="padding:10px 12px; text-align:right;">التاريخ</th>
                                    <th style="padding:10px 12px; text-align:right;">اسم الجهة / العميل</th>
                                    <th style="padding:10px 12px; text-align:right;">البند والتصنيف</th>
                                    <th style="padding:10px 12px; text-align:right;">طريقة الدفع</th>
                                    <th style="padding:10px 12px; text-align:right;">المبلغ والعملة</th>
                                    <th style="padding:10px 12px; text-align:right;">المنفذ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vList.length === 0 ? `
                                    <tr><td colspan="9" style="text-align:center; padding:24px; color:#94a3b8;">لا توجد سندات مالية مطابقة للمعايير المحددة</td></tr>
                                ` : vList.map(v => {
                                    const isReceipt = v.voucher_type === 'receipt';
                                    return `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:10px 12px; font-weight:800; color:#0f172a; font-family:monospace;">${esc(v.voucher_no)}</td>
                                        <td style="padding:10px 12px;">
                                            <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700;">
                                                🏢 ${esc(v.network_name || 'شبكة ' + v.network_id)}
                                            </span>
                                        </td>
                                        <td style="padding:10px 12px;">
                                            <span class="mt-badge" style="background:${isReceipt ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${isReceipt ? '#059669' : '#dc2626'}; font-weight:800; font-size:11.5px;">
                                                ${isReceipt ? '📥 سند قبض' : '📤 سند صرف'}
                                            </span>
                                        </td>
                                        <td style="padding:10px 12px; color:#64748b; font-size:12px;">${esc(v.voucher_date)}</td>
                                        <td style="padding:10px 12px; font-weight:700; color:#0f172a;">${esc(v.party_name || '-')}</td>
                                        <td style="padding:10px 12px; color:#475569;">${esc(v.category || '-')}</td>
                                        <td style="padding:10px 12px; color:#64748b;">${esc(v.payment_method || 'كاش')}</td>
                                        <td style="padding:10px 12px; font-weight:900; color:${isReceipt ? '#059669' : '#dc2626'}; font-size:14px;">
                                            ${Number(v.amount || 0).toLocaleString()} <span style="font-size:11.5px; font-weight:600;">${esc(v.currency_code || 'YER')}</span>
                                        </td>
                                        <td style="padding:10px 12px; color:#64748b; font-size:12px;">${esc(v.created_by_name || 'مالك النظام')}</td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // -------------------------------------------------------------
        // SUB-TAB 3: CHART OF ACCOUNTS (شجرة الحسابات الموحدة)
        // -------------------------------------------------------------
        else if (activeSub === 'chart_of_accounts') {
            const accList = coaRes?.accounts || [];

            tabContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                        <div>
                            <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">🌳 دليل وشجرة الحسابات المحاسبية الموحدة</h3>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">استعراض شجرة الحسابات لكافة الشبكات مع الأرصدة المحسوبة ديناميكياً</div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:10px 12px; text-align:right;">رمز الحساب</th>
                                    <th style="padding:10px 12px; text-align:right;">اسم الحساب</th>
                                    <th style="padding:10px 12px; text-align:right;">الشبكة</th>
                                    <th style="padding:10px 12px; text-align:right;">نوع الحساب</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي المدين</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي الدائن</th>
                                    <th style="padding:10px 12px; text-align:right;">الرصيد المحاسبي</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${accList.length === 0 ? `
                                    <tr><td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">لا توجد حسابات مسجلة</td></tr>
                                ` : accList.map(a => {
                                    const bal = Number(a.balance || a.calculated_balance || 0);
                                    const isDebit = a.debit_credit_nature === 'debit';
                                    return `
                                    <tr style="border-bottom:1px solid #f1f5f9; ${a.level == 1 ? 'background:#f8fafc; font-weight:800;' : ''}">
                                        <td style="padding:8px 12px; font-family:monospace; font-weight:700; color:#0284c7;">${esc(a.account_code)}</td>
                                        <td style="padding:8px 12px; padding-right:${(a.level - 1) * 20 + 12}px;">
                                            <span style="font-weight:${a.level == 1 ? '800' : '600'}; color:#0f172a;">${esc(a.name_ar)}</span>
                                        </td>
                                        <td style="padding:8px 12px;">
                                            <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px;">
                                                🏢 ${esc(a.network_name || 'شبكة ' + a.network_id)}
                                            </span>
                                        </td>
                                        <td style="padding:8px 12px; color:#64748b; font-size:12px;">${esc(a.account_type)}</td>
                                        <td style="padding:8px 12px; color:#0f172a;">${Number(a.total_debit || 0).toLocaleString()}</td>
                                        <td style="padding:8px 12px; color:#0f172a;">${Number(a.total_credit || 0).toLocaleString()}</td>
                                        <td style="padding:8px 12px; font-weight:800; color:${bal >= 0 ? '#0284c7' : '#ef4444'};">
                                            ${bal.toLocaleString()} ر.ي
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // -------------------------------------------------------------
        // SUB-TAB 4: JOURNAL ENTRIES (سجل القيود اليومية)
        // -------------------------------------------------------------
        else if (activeSub === 'journal') {
            const jList = journalRes?.entries || journalRes?.data || [];

            tabContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                        <div>
                            <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">📑 دفتر وسجل القيود اليومية المزدوجة</h3>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">استعراض قيود اليومية العامة وتفاصيل الحسابات المدينة والدائنة عبر الشبكات</div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:10px 12px; text-align:right;">رقم القيد</th>
                                    <th style="padding:10px 12px; text-align:right;">الشبكة</th>
                                    <th style="padding:10px 12px; text-align:right;">التاريخ</th>
                                    <th style="padding:10px 12px; text-align:right;">البيان العام</th>
                                    <th style="padding:10px 12px; text-align:right;">المصدر</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي المدين / الدائن</th>
                                    <th style="padding:10px 12px; text-align:right;">المنشئ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${jList.length === 0 ? `
                                    <tr><td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">لا توجد قيود يومية مسجلة</td></tr>
                                ` : jList.map(j => `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:10px 12px; font-family:monospace; font-weight:800; color:#0284c7;">${esc(j.entry_no)}</td>
                                        <td style="padding:10px 12px;">
                                            <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px;">
                                                🏢 ${esc(j.network_name || 'شبكة ' + j.network_id)}
                                            </span>
                                        </td>
                                        <td style="padding:10px 12px; color:#64748b;">${esc(j.entry_date)}</td>
                                        <td style="padding:10px 12px; font-weight:700; color:#0f172a;">${esc(j.description || '-')}</td>
                                        <td style="padding:10px 12px; color:#64748b;">${esc(j.source_module || 'manual')}</td>
                                        <td style="padding:10px 12px; font-weight:800; color:#0f172a;">
                                            ${Number(j.total_debit || 0).toLocaleString()} ر.ي
                                        </td>
                                        <td style="padding:10px 12px; color:#64748b;">${esc(j.creator_name || 'مالك النظام')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // -------------------------------------------------------------
        // SUB-TAB 5: CASHBOXES (الصناديق والخزائن)
        // -------------------------------------------------------------
        else if (activeSub === 'cashboxes') {
            const cbList = cashRes?.cashboxes || [];

            tabContent = `
                <div class="mt-card" style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                        <div>
                            <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">💵 الخزائن والصناديق النقدية والبنكية لكافة الشبكات</h3>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">متابعة أرصدة وحركة السيولة في الصناديق والمحافظ والمسؤولين عنها</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
                        ${cbList.length === 0 ? `
                            <div style="grid-column:1/-1; text-align:center; padding:30px; color:#94a3b8;">لا توجد صناديق نقدية معرفة</div>
                        ` : cbList.map(cb => `
                            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px; background:#f8fafc; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                                    <div>
                                        <div style="font-weight:800; font-size:15px; color:#0f172a;">${esc(cb.account_name)}</div>
                                        <div style="font-size:11px; color:#0284c7; font-family:monospace;">${esc(cb.account_code)}</div>
                                    </div>
                                    <span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700;">
                                        🏢 ${esc(cb.network_name || 'شبكة ' + cb.network_id)}
                                    </span>
                                </div>
                                <div style="font-size:22px; font-weight:900; color:#0f172a; margin:10px 0;">
                                    ${Number(cb.balance || 0).toLocaleString()} <span style="font-size:12px; font-weight:600; color:#64748b;">ر.ي</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-size:11.5px; color:#64748b; padding-top:8px; border-top:1px solid #e2e8f0;">
                                    <span>وارد اليوم: <b style="color:#10b981;">+${Number(cb.today_in || 0).toLocaleString()}</b></span>
                                    <span>صادر اليوم: <b style="color:#ef4444;">-${Number(cb.today_out || 0).toLocaleString()}</b></span>
                                </div>
                                <div style="font-size:11px; color:#94a3b8; margin-top:6px;">
                                    المسؤول: ${esc(cb.custodian_name || 'المدير العام')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const fullContent = navBarHtml + tabContent;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_master_finance',
            archetype: 'dashboard',
            eyebrow: 'SOVEREIGN FINANCIAL GOVERNANCE',
            title: 'المركز المالي والمحاسبي السيادي',
            subtitle: 'إدارة شاملة ومجمعة لإيرادات ومصروفات وصناديق كافة الشبكات دون تبديل الجلسة',
            icon: '💰',
            actions: [
                { label: '➕ سند مالي جديد', variant: 'primary', onclick: 'App.openOwnerNewVoucherModal()' },
                { label: '🔄 تحديث البيانات', variant: 'secondary', onclick: 'App.renderOwnerMasterFinance()' }
            ],
            content: fullContent
        }) : `<div style="padding:14px">${fullContent}</div>`;
    };

    // =========================================================================
    // ➕ MODAL: CREATE MASTER VOUCHER FOR ANY NETWORK
    // =========================================================================

    App.openOwnerNewVoucherModal = async function (prefillNetId = null) {
        const netRes = await this.api('owner_system_get_networks').catch(() => null);
        const networks = netRes?.networks || this.networks || [];
        const selectedNet = prefillNetId || (this._ownerFinFilterNet !== 'all' ? this._ownerFinFilterNet : (networks[0]?.id || 1));

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; font-size:16px;">💰 إنشاء سند مالي مباشر لشبكة (قبض / صرف)</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.saveOwnerMasterVoucher(event)">
                <div class="mt-modal-body" style="padding:20px; display:flex; flex-direction:column; gap:14px; max-height:75vh; overflow-y:auto;">
                    
                    <!-- Network Selection -->
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px;">الشبكة / الفرع المستهدف *</label>
                        <select id="m-v-network" class="mt-select" style="width:100%; font-weight:700;" required>
                            ${networks.map(n => `<option value="${n.id}" ${String(selectedNet) === String(n.id) ? 'selected' : ''}>🏢 ${esc(n.name)} (${esc(n.code || 'ID: ' + n.id)})</option>`).join('')}
                        </select>
                    </div>

                    <!-- Voucher Type & Amount -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">نوع السند *</label>
                            <select id="m-v-type" class="mt-select" style="width:100%; font-weight:700;" required>
                                <option value="receipt">📥 سند قبض (إيراد / استلام مالي)</option>
                                <option value="payment" selected>📤 سند صرف (مصروف تشغيلي / مدفوعات)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">المبلغ *</label>
                            <input type="number" step="0.01" min="0.01" id="m-v-amount" class="mt-input" style="width:100%; font-size:15px; font-weight:800;" placeholder="0.00" required />
                        </div>
                    </div>

                    <!-- Party Name & Category -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">اسم الجهة / العميل / المستلم *</label>
                            <input type="text" id="m-v-party" class="mt-input" style="width:100%;" placeholder="مثال: شركة الإنترنت، مالك البرج، مورد الكروت..." required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">بند وتصنيف السند *</label>
                            <select id="m-v-category" class="mt-select" style="width:100%;">
                                <option value="مصروفات تشغيلية">مصروفات تشغيلية عامة</option>
                                <option value="إيجار أبراج ومواقع">إيجار أبراج ومواقع</option>
                                <option value="إنترنت وخطوط رئيسية">إنترنت وخطوط رئيسية ومزودات</option>
                                <option value="وقود ومولدات وصيانة">وقود ومولدات وصيانة</option>
                                <option value="سداد مديونية كروت">سداد مديونية كروت وموزعين</option>
                                <option value="مشتريات ومعدات">مشتريات ومعدات راوترات</option>
                                <option value="سحب أرباح شركاء">سحب أرباح شركاء</option>
                                <option value="أخرى">بند وتصنيف مخصص</option>
                            </select>
                        </div>
                    </div>

                    <!-- Date & Payment Method -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">تاريخ السند *</label>
                            <input type="date" id="m-v-date" class="mt-input" style="width:100%;" value="${new Date().toISOString().split('T')[0]}" required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px;">طريقة الدفع *</label>
                            <select id="m-v-method" class="mt-select" style="width:100%;">
                                <option value="cash">نقداً (كاش / الخزينة)</option>
                                <option value="bank_transfer">تحويل بنكي / حساب بنك</option>
                                <option value="kuraimi">الكريمي / محفظة إلكترونية</option>
                                <option value="cheque">شيك</option>
                            </select>
                        </div>
                    </div>

                    <!-- Description / Notes -->
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px;">البيان والتفاصيل الإضافية</label>
                        <textarea id="m-v-desc" class="mt-input" style="width:100%; height:60px;" placeholder="اكتب تفاصيل أو ملاحظات عن هذا السند..."></textarea>
                    </div>

                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; padding:8px 18px;">
                        ✓ حفظ وترحيل السند للشبكة
                    </button>
                </div>
            </form>
        `);
    };

    App.saveOwnerMasterVoucher = async function (event) {
        event.preventDefault();
        const netId = document.getElementById('m-v-network')?.value;
        const type = document.getElementById('m-v-type')?.value;
        const amount = document.getElementById('m-v-amount')?.value;
        const party = document.getElementById('m-v-party')?.value;
        const category = document.getElementById('m-v-category')?.value;
        const date = document.getElementById('m-v-date')?.value;
        const method = document.getElementById('m-v-method')?.value;
        const desc = document.getElementById('m-v-desc')?.value;

        if (!netId || !amount || !party) {
            this.toast('يرجى ملء جميع الحقول الإلزامية', 'warning');
            return;
        }

        const payload = {
            network_id: Number(netId),
            voucher_type: type,
            amount: parseFloat(amount),
            party_name: party,
            category: category,
            voucher_date: date,
            payment_method: method,
            description: desc,
            currency_code: 'YER'
        };

        const res = await this.api('owner_save_master_voucher', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ السند بنجاح! 🎉', 'success');
            this.closeModal();
            this.renderOwnerMasterFinance();
        } else {
            this.toast(res?.error || 'تعذر حفظ السند', 'danger');
        }
    };

    // =========================================================================
    // 👥 CENTRAL NETWORK ADMINS MANAGEMENT (إدارة مدراء وتفويض الشبكات)
    // =========================================================================

    App.ownerAdminData = null;

    App.renderOwnerNetworkAdmins = async function (force = false) {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = '<div class="mt-card" style="padding:24px;text-align:center;color:#64748b">جاري تحميل حسابات المدراء وتفويضات الشبكات...</div>';

        const res = await this.api('owner_system_get_network_admins');
        if (this.currentTab !== 'owner_network_admins') return;

        if (!res?.success) {
            view.innerHTML = `<div class="mt-card" style="padding:20px;color:#b91c1c">${esc(res?.error || 'تعذر تحميل حسابات المدراء')}</div>`;
            return;
        }

        this.ownerAdminData = res;
        const admins = res.admins || [];
        const networks = res.networks || [];
        const roles = res.roles || [];
        const summary = res.summary || { total_admins: admins.length, active_admins: admins.filter(a=>a.is_active).length, disabled_admins: 0, total_networks: networks.length };

        const rows = admins.map((adm, idx) => {
            const roleObj = roles.find(r => r.role_key === adm.role);
            const roleLabel = roleObj ? (roleObj.role_name_ar || roleObj.role_key) : adm.role;
            const assigned = Array.isArray(adm.assigned_networks) ? adm.assigned_networks : [];
            
            const accessLevelBadges = {
                owner: '<span class="mt-badge" style="background:#fef3c7; color:#92400e; font-size:10px;">👑 مالك فرعي</span>',
                manager: '<span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">👔 مدير</span>',
                operator: '<span class="mt-badge" style="background:#f1f5f9; color:#475569; font-size:10px;">⚙️ مشغل</span>',
                viewer: '<span class="mt-badge" style="background:#f3f4f6; color:#6b7280; font-size:10px;">👁️ عرض فقط</span>'
            };

            const netBadges = assigned.length ? assigned.map(na => {
                const lvlBadge = accessLevelBadges[na.access_level] || `<span class="mt-badge" style="font-size:10px;">${esc(na.access_level)}</span>`;
                const defBadge = na.is_default ? '<span title="الشبكة الافتراضية" style="color:#eab308; font-size:11px; margin-right:2px;">⭐</span>' : '';
                return `<div style="display:inline-flex; align-items:center; gap:4px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px; margin:2px; font-size:11px;">
                    ${defBadge}<b>${esc(na.network_name)}</b> ${lvlBadge}
                </div>`;
            }).join('') : '<span style="color:#ef4444; font-size:11px; font-weight:600;">⚠️ غير مفوض على أي شبكة</span>';

            const isMainOwner = Number(adm.id) === 1;

            return `<tr>
                <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
                <td>
                    <div style="font-weight:800; color:#0f172a; font-size:13px;">
                        ${isMainOwner ? '👑 ' : ''}${esc(adm.fullname)}
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">
                        <code>${esc(adm.username)}</code> ${adm.phone ? `· 📞 ${esc(adm.phone)}` : ''}
                    </div>
                </td>
                <td>
                    <span class="mt-badge" style="background:${isMainOwner ? '#0f172a' : '#e0e7ff'}; color:${isMainOwner ? '#f8fafc' : '#3730a3'}; font-weight:700; font-size:11px;">
                        ${esc(roleLabel)}
                    </span>
                </td>
                <td style="max-width:320px;">
                    <div style="display:flex; flex-wrap:wrap; gap:2px;">
                        ${netBadges}
                    </div>
                </td>
                <td style="text-align:center;">
                    <span class="mt-badge ${adm.is_active ? 'sam-badge--success' : 'sam-badge--danger'}" style="font-size:11px;">
                        ${adm.is_active ? '🟢 نشط' : '🔴 معطل'}
                    </span>
                </td>
                <td style="text-align:center; white-space:nowrap;">
                    <div style="display:flex; gap:4px; justify-content:center;">
                        <button class="mt-btn mt-btn-sm" style="background:#0284c7; color:#fff;" onclick="App.openOwnerAdminModal(${adm.id})" title="تعديل الحساب وتفويض الشبكات">✏️ تعديل وتفويض</button>
                        <button class="mt-btn mt-btn-sm" style="background:#f8fafc; border:1px solid #cbd5e1;" onclick="App.quickResetOwnerAdminPassword(${adm.id})" title="إعادة تعيين كلمة المرور">🔑 كلمة السر</button>
                        ${!isMainOwner ? `
                            <button class="mt-btn mt-btn-sm ${adm.is_active ? 'sam-btn--warning' : 'sam-btn--success'}" onclick="App.toggleOwnerAdminStatus(${adm.id}, ${!adm.is_active})" title="${adm.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}">
                                ${adm.is_active ? '⏸️ تعطيل' : '▶️ تفعيل'}
                            </button>
                            <button class="mt-btn mt-btn-sm sam-btn--danger" onclick="App.deleteOwnerAdmin(${adm.id})" title="حذف المدير">🗑️</button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');

        const content = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px;">
                <div class="mt-card" style="padding:14px; border-right:4px solid #3b82f6;">
                    <div style="font-size:11px; color:#64748b; font-weight:700;">إجمالي حسابات المدراء</div>
                    <div style="font-size:24px; font-weight:800; color:#0f172a; margin-top:4px;">${summary.total_admins}</div>
                </div>
                <div class="mt-card" style="padding:14px; border-right:4px solid #10b981;">
                    <div style="font-size:11px; color:#64748b; font-weight:700;">الحسابات النشطة</div>
                    <div style="font-size:24px; font-weight:800; color:#10b981; margin-top:4px;">${summary.active_admins}</div>
                </div>
                <div class="mt-card" style="padding:14px; border-right:4px solid #ef4444;">
                    <div style="font-size:11px; color:#64748b; font-weight:700;">الحسابات المعطلة</div>
                    <div style="font-size:24px; font-weight:800; color:#ef4444; margin-top:4px;">${summary.disabled_admins}</div>
                </div>
                <div class="mt-card" style="padding:14px; border-right:4px solid #8b5cf6;">
                    <div style="font-size:11px; color:#64748b; font-weight:700;">إجمالي الشبكات المتاحة</div>
                    <div style="font-size:24px; font-weight:800; color:#8b5cf6; margin-top:4px;">${summary.total_networks}</div>
                </div>
            </div>

            <div class="mt-card" style="padding:0; overflow:hidden;">
                <div style="padding:14px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; gap:10px; background:#f8fafc;">
                    <div>
                        <b style="font-size:14px; color:#0f172a;">👥 قائمة مدراء المنظومة وتفويض الفروع والشبكات</b>
                        <div style="font-size:11px; color:#64748b; margin-top:2px;">إدارة مركزية لجميع المدراء ومستويات وصولهم للشبكات</div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="mt-btn mt-btn-primary" style="font-weight:700;" onclick="App.openOwnerAdminModal(0)">➕ إضافة مدير وتفويض شبكات</button>
                        <button class="mt-btn" onclick="App.renderOwnerNetworkAdmins(true)">🔄 تحديث</button>
                    </div>
                </div>

                <div style="overflow-x:auto;">
                    <table class="mt-table" style="margin:0;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="width:40px; text-align:center;">#</th>
                                <th>المدير وبيانات الاتصال</th>
                                <th>الرتبة العامة</th>
                                <th>📡 الفروع والشبكات المصرحة (Allowed Networks)</th>
                                <th style="text-align:center;">الحالة</th>
                                <th style="text-align:center;">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748b;">لا يوجد مدراء مضافين</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
        view.innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'owner_network_admins',
            archetype: 'table',
            eyebrow: 'SYSTEM OWNER / ACCESS CONTROL',
            title: 'إدارة مدراء وتفويض الشبكات والفروع',
            subtitle: 'التحكم المركزي بجميع حسابات المدراء وتحديد الفروع والشبكات المصرح لهم بالعمل عليها',
            icon: '👥',
            actions: [
                { label: '➕ إضافة وتفويض مدير جديد', variant: 'primary', onclick: 'App.openOwnerAdminModal(0)' },
                { label: '👑 البوابة السيادية', variant: 'secondary', onclick: "App.switchTab('owner_portal_overview')" },
                { label: '🔄 تحديث', variant: 'secondary', onclick: 'App.renderOwnerNetworkAdmins(true)' }
            ],
            content
        }) : `<div style="padding:14px">${content}</div>`;
    };

    App.openOwnerAdminModal = function (adminId = 0) {
        const id = Number(adminId);
        const data = this.ownerAdminData || {};
        const admins = data.admins || [];
        const networks = data.networks || [];
        const defaultRoles = [
            { role_key: 'superadmin', role_name_ar: 'مدير عام شبكة (Superadmin)' },
            { role_key: 'network_manager', role_name_ar: 'مدير تشغيل الشبكة' },
            { role_key: 'accountant', role_name_ar: 'محاسب مالي' },
            { role_key: 'cashier', role_name_ar: 'كاشير ومبيعات' },
            { role_key: 'distributor', role_name_ar: 'وكيل وموزع معتمد' },
            { role_key: 'operator', role_name_ar: 'مشغل وفني شبكة' }
        ];
        const roles = (Array.isArray(data.roles) && data.roles.length > 0) ? data.roles : defaultRoles;
        const adm = id > 0 ? (admins.find(a => Number(a.id) === id) || {}) : {};
        const isEdit = id > 0;
        const isMainOwner = id === 1;
        const assigned = Array.isArray(adm.assigned_networks) ? adm.assigned_networks : [];

        const modalHtml = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:720px; max-width:96vw; max-height:90vh; overflow-y:auto;">
                    <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                        <span style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                            <span>${isEdit ? '✏️' : '➕'}</span>
                            <span>${isEdit ? 'تعديل بيانات وتفويض المدير' : 'إضافة حساب مدير جديد وتفويض الشبكات'}</span>
                        </span>
                        <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:18px;">
                        
                        <!-- Account Details Section -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:16px;">
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
                                👤 بيانات الحساب والاعتماد
                            </div>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">الاسم الكامل للمدير *</label>
                                    <input type="text" id="owner-adm-fullname" class="mt-input" style="width:100%;" value="${esc(adm.fullname || '')}" placeholder="مثال: أحمد محمد علي" />
                                </div>
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">اسم المستخدم (Username) *</label>
                                    <input type="text" id="owner-adm-username" class="mt-input" style="width:100%; direction:ltr; text-align:right;" value="${esc(adm.username || '')}" placeholder="ahmed_admin" ${isMainOwner ? 'disabled' : ''} />
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">رقم الهاتف / الواتساب *</label>
                                    <input type="text" id="owner-adm-phone" class="mt-input" style="width:100%; direction:ltr; text-align:right;" value="${esc(adm.phone || '')}" placeholder="777123456" />
                                </div>
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">البريد الإلكتروني</label>
                                    <input type="email" id="owner-adm-email" class="mt-input" style="width:100%; direction:ltr; text-align:right;" value="${esc(adm.email || '')}" placeholder="ahmed@example.com" />
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">
                                        ${isEdit ? 'كلمة المرور (اتركها فارغة للإبقاء عليها)' : 'كلمة المرور *'}
                                    </label>
                                    <input type="password" id="owner-adm-password" class="mt-input" style="width:100%; direction:ltr;" placeholder="${isEdit ? '••••••••' : 'أدخل كلمة مرور قوية'}" />
                                </div>
                                <div>
                                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px; color:#334155;">الرتبة العامة (Role)</label>
                                    <select id="owner-adm-role" class="mt-select" style="width:100%; font-weight:700;" ${isMainOwner ? 'disabled' : ''}>
                                        ${roles.map(r => `
                                            <option value="${r.role_key}" ${(adm.role || 'superadmin') === r.role_key ? 'selected' : ''}>${esc(r.role_name_ar || r.role_key)}</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Allowed Networks & Access Delegation Matrix -->
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px; margin-bottom:16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #bae6fd; padding-bottom:6px; flex-wrap:wrap; gap:8px;">
                                <div style="flex:1; min-width:220px;">
                                    <b style="font-size:13px; color:#0369a1;">📡 الفروع والشبكات المصرح له بالعمل عليها (Allowed Networks)</b>
                                    <div style="font-size:11px; color:#0c4a6e; margin-top:2px;">حدد الشبكات المسموح للمدير بإدارتها ومستوى وصوله في كل شبكة والشبكة الافتراضية</div>
                                </div>
                                <span class="mt-badge" style="background:#0284c7; color:#fff; font-size:10.5px; padding:3px 9px; border-radius:12px; white-space:nowrap; flex-shrink:0;">👑 سيادة مالك النظام</span>
                            </div>

                            <div style="max-height:220px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
                                <table class="mt-table" style="width:100%; margin:0; font-size:12px; border-collapse:collapse;">
                                    <thead>
                                        <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                                            <th style="width:50px; text-align:center; padding:8px 4px;">تصريح</th>
                                            <th style="padding:8px 8px; text-align:right;">الشبكة التابعة</th>
                                            <th style="width:170px; padding:8px 6px;">مستوى الوصول بالشبكة</th>
                                            <th style="width:85px; text-align:center; padding:8px 4px;">الافتراضية ⭐</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${networks.map(net => {
                                            const netAccess = assigned.find(na => Number(na.network_id) === Number(net.id));
                                            const isChecked = Boolean(netAccess) || (!isEdit && networks.length === 1);
                                            const currentLvl = netAccess ? (netAccess.access_level || 'manager') : 'manager';
                                            const isDef = netAccess ? Boolean(netAccess.is_default) : (!isEdit && networks.length === 1);

                                            return `<tr style="border-bottom:1px solid #f1f5f9;">
                                                <td style="text-align:center; padding:6px 4px;">
                                                    <input type="checkbox" class="owner-adm-net-cb" value="${net.id}" ${isChecked ? 'checked' : ''} ${isMainOwner ? 'disabled checked' : ''} onchange="App.onOwnerNetCbChange(${net.id})" />
                                                </td>
                                                <td style="padding:6px 8px;">
                                                    <b>${esc(net.name)}</b>
                                                    <code style="font-size:10.5px; color:#64748b; margin-right:4px;">(${esc(net.code || '')})</code>
                                                </td>
                                                <td style="padding:6px 6px;">
                                                    <select id="owner-net-lvl-${net.id}" class="mt-select" style="width:100%; font-size:11px; padding:4px 6px; border-radius:4px;" ${!isChecked && !isMainOwner ? 'disabled' : ''}>
                                                        <option value="owner" ${currentLvl === 'owner' ? 'selected' : ''}>👑 مالك فرعي للشبكة</option>
                                                        <option value="manager" ${currentLvl === 'manager' ? 'selected' : ''}>👔 مدير فرع / مسؤول</option>
                                                        <option value="operator" ${currentLvl === 'operator' ? 'selected' : ''}>⚙️ مشغل / موظف</option>
                                                        <option value="viewer" ${currentLvl === 'viewer' ? 'selected' : ''}>👁️ عرض وتقارير فقط</option>
                                                    </select>
                                                </td>
                                                <td style="text-align:center; padding:6px 4px;">
                                                    <input type="radio" name="owner-default-net" value="${net.id}" ${isDef ? 'checked' : ''} title="تعيين كشبكة افتراضية عند تسجيل الدخول" />
                                                </td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                    <div class="mt-modal-footer" style="padding:12px 18px; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                        <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button class="mt-btn mt-btn-primary" style="font-weight:700;" onclick="App.saveOwnerNetworkAdmin(${id})">💾 حفظ وتفويض الحساب</button>
                    </div>
                </div>
            </div>
        `;

        this.openModal(modalHtml);
    };

    App.onOwnerNetCbChange = function (netId) {
        const cb = document.querySelector(`.owner-adm-net-cb[value="${netId}"]`);
        const lvlSelect = document.getElementById(`owner-net-lvl-${netId}`);
        if (lvlSelect) {
            lvlSelect.disabled = !cb.checked;
        }
        const defaultRadio = document.querySelector(`input[name="owner-default-net"][value="${netId}"]`);
        if (defaultRadio && !cb.checked && defaultRadio.checked) {
            defaultRadio.checked = false;
            const firstChecked = document.querySelector('.owner-adm-net-cb:checked');
            if (firstChecked) {
                const firstRadio = document.querySelector(`input[name="owner-default-net"][value="${firstChecked.value}"]`);
                if (firstRadio) firstRadio.checked = true;
            }
        }
    };

    App.saveOwnerNetworkAdmin = async function (adminId = 0) {
        const id = Number(adminId);
        const fullname = document.getElementById('owner-adm-fullname')?.value?.trim();
        const username = document.getElementById('owner-adm-username')?.value?.trim();
        const phone = document.getElementById('owner-adm-phone')?.value?.trim();
        const email = document.getElementById('owner-adm-email')?.value?.trim();
        const password = document.getElementById('owner-adm-password')?.value || '';
        const role = document.getElementById('owner-adm-role')?.value || 'superadmin';

        if (!fullname) return this.toast('الاسم الكامل للمدير إجباري', 'warning');
        if (!username) return this.toast('اسم المستخدم إجباري', 'warning');
        if (!phone) return this.toast('رقم الهاتف إجباري', 'warning');
        if (!id && !password) return this.toast('كلمة المرور مطلوبة للحساب الجديد', 'warning');

        // Collect assigned networks
        const assignedNetworks = [];
        const checkedBoxes = document.querySelectorAll('.owner-adm-net-cb:checked');
        const defaultRadio = document.querySelector('input[name="owner-default-net"]:checked');
        const defaultNetId = defaultRadio ? Number(defaultRadio.value) : (checkedBoxes.length ? Number(checkedBoxes[0].value) : 1);

        checkedBoxes.forEach(cb => {
            const netId = Number(cb.value);
            const lvl = document.getElementById(`owner-net-lvl-${netId}`)?.value || 'manager';
            assignedNetworks.push({
                network_id: netId,
                access_level: lvl,
                is_default: netId === defaultNetId ? 1 : 0,
                is_active: 1
            });
        });

        if (!assignedNetworks.length && id !== 1) {
            return this.toast('يجب تفويض المدير على شبكة واحدة على الأقل', 'warning');
        }

        const payload = {
            id,
            fullname,
            username,
            phone,
            email,
            password,
            role,
            data_scope: 'all',
            assigned_networks: assignedNetworks,
            default_network_id: defaultNetId
        };

        const res = await this.api('owner_system_save_network_admin', payload, 'POST');
        if (res?.success) {
            this.toast(res.message || 'تم حفظ المدير وتفويض الشبكات بنجاح', 'success');
            this.closeModal();
            this.renderOwnerNetworkAdmins(true);
        } else {
            this.toast(res?.error || 'تعذر حفظ بيانات المدير', 'danger');
        }
    };

    App.quickResetOwnerAdminPassword = function (adminId) {
        const id = Number(adminId);
        const data = this.ownerAdminData || {};
        const adm = (data.admins || []).find(a => Number(a.id) === id);
        if (!adm) return;

        const modalHtml = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:420px;">
                    <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:14px;">🔑 إعادة تعيين كلمة المرور</span>
                        <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:18px;">
                        <div style="margin-bottom:12px; font-size:13px; color:#475569;">
                            المدير: <b>${esc(adm.fullname)}</b> (<code>${esc(adm.username)}</code>)
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">كلمة المرور الجديدة *</label>
                            <input type="password" id="owner-reset-pass" class="mt-input" style="width:100%; font-size:14px;" placeholder="أدخل كلمة المرور الجديدة" />
                        </div>
                    </div>
                    <div class="mt-modal-footer" style="padding:10px 18px; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                        <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button class="mt-btn mt-btn-primary" style="font-weight:700;" onclick="App.executeOwnerResetPassword(${id})">تحديث كلمة السر</button>
                    </div>
                </div>
            </div>
        `;
        this.openModal(modalHtml);
    };

    App.executeOwnerResetPassword = async function (adminId) {
        const pass = document.getElementById('owner-reset-pass')?.value;
        if (!pass || pass.length < 6) {
            return this.toast('كلمة المرور يجب ألا تقل عن 6 أحرف/أرقام', 'warning');
        }
        const data = this.ownerAdminData || {};
        const adm = (data.admins || []).find(a => Number(a.id) === Number(adminId));
        if (!adm) return;

        const payload = {
            id: adm.id,
            fullname: adm.fullname,
            username: adm.username,
            phone: adm.phone,
            email: adm.email,
            role: adm.role,
            password: pass,
            assigned_networks: adm.assigned_networks || []
        };

        const res = await this.api('owner_system_save_network_admin', payload, 'POST');
        if (res?.success) {
            this.toast('تم تحديث كلمة المرور للمدير بنجاح', 'success');
            this.closeModal();
        } else {
            this.toast(res?.error || 'تعذر تحديث كلمة المرور', 'danger');
        }
    };

    App.toggleOwnerAdminStatus = async function (adminId, newStatus) {
        const id = Number(adminId);
        const res = await this.api('owner_system_toggle_admin_status', { id, active: newStatus ? 1 : 0 }, 'POST');
        if (res?.success) {
            this.toast(res.message || 'تم تحديث حالة الحساب', 'success');
            this.renderOwnerNetworkAdmins(true);
        } else {
            this.toast(res?.error || 'تعذر تغيير حالة الحساب', 'danger');
        }
    };

    App.deleteOwnerAdmin = async function (adminId) {
        const id = Number(adminId);
        const data = this.ownerAdminData || {};
        const adm = (data.admins || []).find(a => Number(a.id) === id);
        const name = adm ? adm.fullname : `رقم ${id}`;

        if (!confirm(`هل أنت متأكد من حذف حساب المدير "${name}" نهائياً من كافة الشبكات وإلغاء كافة صلاحياته؟`)) {
            return;
        }

        const res = await this.api('owner_system_delete_network_admin', { id }, 'POST');
        if (res?.success) {
            this.toast(res.message || 'تم حذف حساب المدير بنجاح', 'success');
            this.renderOwnerNetworkAdmins(true);
        } else {
            this.toast(res?.error || 'تعذر حذف الحساب', 'danger');
        }
    };
})();

