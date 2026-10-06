/**
 * SAM User Manager — MikroTik Routers, SSTP VPN, NOC & Port Analytics
 */
'use strict';

Object.assign(window.App, {
    async renderSstpVpn() {
        const [sstpRes, backupRadiusRes, umProxyRes, routersRes] = await Promise.all([
            this.api('get_sstp_status'),
            this.api('get_backup_radius_settings'),
            this.api('get_um_proxy_settings'),
            this.api('get_routers')
        ]);
        const backupRadius = backupRadiusRes?.data || { enabled: false, ip: '', router_id: 0 };
        const umProxy = umProxyRes?.data || { enabled: false, ip: '', secret: '', authPort: 1812 };
        const proxyRouters = Array.isArray(routersRes) ? routersRes : (routersRes?.routers || []);
        const selectedProxyRouterId = Number(umProxy.router_id || backupRadius.router_id || 0);
        const sstp = sstpRes?.data || {
            is_active: false, service_active: false, listener_active: false,
            radius_active: false, backend: 'accel-ppp',
            server_host: window.location.hostname, vpn_gateway: '10.101.0.1',
            vpn_subnet: '10.101.0.0/24', session_count: 0, sessions: []
        };
        const sessions = Array.isArray(sstp.sessions) ? sstp.sessions : [];
        const healthClass = sstp.is_active && sstp.radius_active ? 'status-online' : 'status-danger';
        const healthText = sstp.is_active && sstp.radius_active ? 'يعمل بصورة سليمة' : 'يحتاج مراجعة';

        const shellOpts = {
            id: 'sstp-vpn',
            archetype: 'table',
            icon: '🔒',
            title: 'خادم نفق SSTP VPN & Failover',
            eyebrow: 'البنية التحتية والشبكة',
            subtitle: `خادم SSTP / PPP عبر ${sstp.backend} — دومين النظام مُدار تلقائيًا والمنفذ مخفي`,
            actions: [
                { label: 'إعدادات النفق والسيرفر', icon: '⚙️', variant: 'primary', onclick: 'App.openSstpServerSettingsModal()' },
                { label: 'إعادة تشغيل SSTP', icon: '⟳', variant: 'danger', onclick: 'App.restartSstp()' },
                { label: this.t('refresh'), icon: '🔄', variant: 'secondary', onclick: 'App.renderSstpVpn()' }
            ],
            stats: [
                { label: 'حالة خادم SSTP', value: sstp.service_active ? 'نشط' : 'متوقف', icon: '🔐', tone: sstp.service_active ? 'green' : 'red', meta: healthText },
                { label: 'الجلسات المتصلة', value: sstp.session_count || 0, icon: '⚡', tone: 'blue', meta: 'جلسة حية' },
                { label: 'خدمة FreeRADIUS', value: sstp.radius_active ? 'نشطة' : 'متوقفة', icon: '📡', tone: sstp.radius_active ? 'green' : 'amber', meta: sstp.backend || 'accel-ppp' },
                { label: 'بوابة النفق Gateway', value: sstp.vpn_gateway || '10.101.0.1', icon: '🌐', tone: 'indigo', meta: `نطاق: ${sstp.vpn_subnet}` }
            ],
            content: `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <!-- SSTP SERVER STATUS CARD -->
                <div style="background:var(--bg-window, #fff); border:1px solid #1565c0; border-radius:10px; padding:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="font-size:36px;">🔐</div>
                        <div>
                            <div style="font-weight:800; font-size:15px; color:#1565c0;">خادم SSTP / PPP عبر ${sstp.backend} — دومين النظام والمنفذ مُداران تلقائيًا</div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                                <span class="status-pill ${healthClass}">${healthText}</span> |
                                الخدمة: <b>${sstp.service_active ? 'نشطة' : 'متوقفة'}</b> |
                                المستمع: <b>${sstp.listener_active ? 'جاهز' : 'غير متاح'}</b> |
                                FreeRADIUS: <b>${sstp.radius_active ? 'نشط' : 'متوقف'}</b> |
                                الجلسات المتصلة حالياً: <b style="color:#2563eb; font-size:14px;">${sstp.session_count || 0}</b>
                            </div>
                            <div style="font-size:12px; margin-top:6px; font-family:monospace; color:#334155;">
                                الدومين: <b>${this.escape(sstp.server_host || 'إعدادات النظام')}</b> | المنفذ: <b>مُدار من النظام</b> | البوابة: <b>${sstp.vpn_gateway}</b> | نطاق الشبكة: <b>${sstp.vpn_subnet}</b>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ACTIVE SSTP SESSIONS TABLE -->
                <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color); border-radius:10px; padding:16px;">
                    <div style="font-weight:700; font-size:14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🌐 أنفاق SSTP للراوترات والفروع المتصلة (${sessions.length})</span>
                        <button class="mt-btn" style="font-size:11px;" onclick="App.renderSstpVpn()">⟳ تحديث الجلسات</button>
                    </div>
                    ${sessions.length ? `
                    <div class="mt-table-container">
                        <table class="mt-table">
                            <thead><tr><th>الجلسة</th><th>المستخدم / الراوتر</th><th>VPN IP</th><th>عنوان IP المصدر</th><th>الحالة</th><th>مدة الاتصال</th><th>التحميل / الرفع</th></tr></thead>
                            <tbody>${sessions.map(s => `<tr><td><code>${s.interface}</code></td><td><b>${s.username}</b></td><td><code>${s.ip}</code></td><td><code>${s.source_ip}</code></td><td><span class="status-pill ${s.state === 'active' ? 'status-online' : 'status-danger'}">${s.state}</span></td><td>${s.uptime}</td><td>${s.rx} / ${s.tx}</td></tr>`).join('')}</tbody>
                        </table>
                    </div>
                    ` : `
                    <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px;">
                        لا توجد جلسات SSTP متصلة حالياً
                    </div>
                    `}
                </div>

                <!-- USER MANAGER PROXY FAILOVER CARD -->
                <div class="mt-card" style="background:linear-gradient(135deg, #e8f5e9 0%, #ffffff 100%); border:1px solid #a5d6a7; border-radius:10px; padding:16px 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:12px; border-bottom:1px solid #c8e6c9; padding-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px;">🔄</span>
                            <div>
                                <strong style="color:#1b5e20; font-size:14px;">خادم User Manager الاحتياطي العام للنظام (Global Default Fallback)</strong>
                                <div style="font-size:11px; color:#555;">إذا لم يجد السيرفر الكرت محلياً، يحوّل الطلب تلقائياً لهذا السيرفر العام (للراوترات التي ليس لها User Manager مخصص في بطاقتها).</div>
                            </div>
                        </div>
                        <div>
                            <label style="margin:0; font-size:13px; font-weight:bold; color:#2e7d32; display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="um-proxy-enabled" ${umProxy.enabled ? 'checked' : ''} style="transform:scale(1.2);">
                                تفعيل الاحتياطي العام للكروت
                            </label>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:flex-end;">
                        <div>
                            <label style="font-size:11px; font-weight:bold; color:#333; margin-bottom:4px; display:block;">راوتر User Manager الاحتياطي من الشبكة النشطة:</label>
                            <select id="um-proxy-router-id" class="mt-form-control" style="font-weight:bold; font-size:13px;">
                                <option value="">-- اختر راوترًا --</option>
                                ${proxyRouters.map(r => `<option value="${r.id}" ${Number(r.id) === selectedProxyRouterId ? 'selected' : ''}>${this.escape(r.shortname || ('Router #' + r.id))}</option>`).join('')}
                            </select>
                            <small style="display:block;color:#2e7d32;margin-top:4px;">يتم استخراج IP ومفتاح RADIUS تلقائيًا من الراوتر المختار.</small>
                        </div>
                        <div>
                            <div style="background:#f0fdf4;border:1px dashed #86efac;border-radius:6px;padding:10px;font-size:11px;color:#166534;line-height:1.7;">🔒 لا يمكن إدخال IP أو Secret يدويًا في الاحتياطي العام.</div>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:bold; color:#333; margin-bottom:4px; display:block;">منفذ المصادقة (Auth Port):</label>
                            <input type="number" id="um-proxy-auth-port" value="${umProxy.authPort || 1812}" class="mt-form-control" style="font-family:monospace; font-size:13px;">
                        </div>
                        <div>
                            <button class="mt-btn mt-btn-success" style="width:100%; font-weight:bold;" onclick="App.saveUmProxyConfig()">💾 حفظ وتطبيق على السيرفر</button>
                        </div>
                    </div>
                </div>
            </div>
            `
        };

        if (window.SamUI?.PageBuilder) {
            document.getElementById('main-view').innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            document.getElementById('main-view').innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px; margin-left:12px;">🔒 خادم نفق SSTP VPN & Failover</span>
                    <button class="mt-btn mt-btn-primary" style="background:#2563eb;" onclick="App.openSstpServerSettingsModal()">⚙️ إعدادات النفق والسيرفر</button>
                    <button class="mt-btn" style="border:1px solid #dc2626; color:#dc2626;" onclick="App.restartSstp()">⟳ إعادة تشغيل خادم SSTP</button>
                    <button class="mt-btn" onclick="App.renderSstpVpn()">⟳ ${this.t('refresh')}</button>
                </div>
            </div>
            <div style="padding:15px;">${shellOpts.content}</div>`;
        }
    },
    
    async showRouterModal(router = null) {
        // The modal can be opened directly from a deep link or an older table
        // render where routerCache has not been populated yet.  Always refresh
        // the active-network list before building the User Manager selector.
        try {
            const response = await this.api('get_routers');
            const fetched = Array.isArray(response) ? response : (response?.routers || []);
            if (Array.isArray(response) || Array.isArray(response?.routers)) this.routerCache = fetched;
            if (router?.id) {
                const fresh = this.routerCache.find(item => Number(item.id) === Number(router.id));
                if (fresh) router = fresh;
            }
        } catch (error) {
            this.routerCache = Array.isArray(this.routerCache) ? this.routerCache : [];
        }

        const isEdit = !!router;
        const currentRouterId = Number(router?.id || 0);
        const selectedWorkTypes = router
            ? String(router.work_types || 'hotspot').split(',').map(value => value.trim()).filter(Boolean)
            : ['hotspot'];
        const networkRouters = Array.isArray(this.routerCache) ? this.routerCache : [];
        const isUserManagerRouter = selectedWorkTypes.includes('usermanager');
        const userManagerRouters = networkRouters.filter(item =>
            Number(item.id) !== currentRouterId &&
            String(item.work_types || '').split(',').map(value => value.trim()).includes('usermanager')
        );
        const persistedProxyId = Number(router?.um_proxy_router_id || 0);
        const automaticProxyId = !isUserManagerRouter && userManagerRouters.length === 1
            ? Number(userManagerRouters[0].id)
            : 0;
        const selectedProxyId = persistedProxyId || automaticProxyId;
        const proxyEnabled = !isUserManagerRouter && (
            Number(router?.um_proxy_enabled || 0) === 1 || (!router && automaticProxyId > 0) ||
            (!!router && !persistedProxyId && automaticProxyId > 0)
        );
        const proxyDisabled = isUserManagerRouter || userManagerRouters.length === 0;
        const proxyOptions = userManagerRouters.length
            ? userManagerRouters.map(item => `<option value="${item.id}" ${Number(item.id) === selectedProxyId ? 'selected' : ''}>${this.escape(item.shortname || ('Router #' + item.id))}</option>`).join('')
            : '<option value="">لا يوجد راوتر User Manager آخر في الشبكة الحالية</option>';
        this.routerModalCurrentId = currentRouterId;
        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:680px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden;">
                <div class="mt-modal-header" style="flex-shrink:0;">
                    <span>${isEdit ? '✏️ تعديل جهاز NAS' : '➕ إضافة جهاز NAS وربطه عبر SSTP'}</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <form onsubmit="App.saveRouterForm(event, ${router?.id || 'null'})" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;">
                    <div class="mt-modal-body" style="overflow-y:auto; flex:1; padding:16px;">
                        <div style="background:#e3f2fd; color:#0d47a1; padding:10px 12px; border-radius:5px; margin-bottom:14px; line-height:1.8;">
                            <div style="font-weight:800; margin-bottom:4px;">🌐 الشبكة النشطة: ${this.escape(this.activeNetwork?.name || this.activeNetwork?.code || `شبكة ${this.activeNetworkId || '—'}`)}</div>
                            ${isEdit
                                ? 'تبقى هوية الربط ثابتة وتدار داخليًا؛ التعديل متاح فقط لاسم الجهاز والخصائص التشغيلية.'
                                : 'سيُنشأ تلقائيًا: سجل NAS، مستخدم SSTP، عنوان VPN ثابت، ومفتاح RADIUS آمن وسكربت MikroTik جاهز للنسخ.'}
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>اسم الجهاز / الموقع *</label>
                                <input id="nas-shortname" class="mt-input" style="width:100%" maxlength="64" required placeholder="مثال: فرع صنعاء" />
                            </div>
                            <div class="form-group">
                                <label>نوع الجهاز</label>
                                <input class="mt-input" style="width:100%" value="MikroTik" readonly />
                            </div>
                        </div>
                        <div style="background:#f1f5f9;border:1px dashed #94a3b8;border-radius:8px;padding:10px 12px;margin-bottom:12px;color:#475569;font-size:12px;line-height:1.8;">
                            🔐 <b>إعدادات الربط الحساسة مُدارة تلقائيًا:</b> سيخصص النظام عنوان NAS/SSTP، منفذ CoA، كلمة مرور نفق MikroTik، ومفتاح RADIUS Secret آمنًا لكل راوتر. لا تُرسل هذه القيم من المتصفح ولا يمكن تعديلها من الواجهة.
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>نوع عمل الراوتر *</label>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
                                    ${[
                                        ['hotspot','Hotspot / بوابة الكروت'],
                                        ['usermanager','User Manager / RADIUS'],
                                        ['line_bonding','دمج خطوط / Load Balancing']
                                    ].map(([v,l]) => `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;"><input type="checkbox" class="nas-work-type" value="${v}" ${selectedWorkTypes.includes(v) ? 'checked' : ''} onchange="App.syncRouterWorkTypeState()">${l}</label>`).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- MIKROTIK ROUTEROS API & CONTROL SUITE SETTINGS -->
                        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; color:#1e293b; cursor:pointer;">
                                    <input type="checkbox" id="nas-api-enabled" ${(!router || Number(router?.api_enabled ?? 1) === 1) ? 'checked' : ''} onchange="document.getElementById('nas-control-suite-fields').style.display = this.checked ? 'block' : 'none';" />
                                    <span>⚡ تمكين الإدارة والتحكم الشامل بالراوتر (API & Control Suite)</span>
                                </label>
                                ${isEdit ? `<button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px; background:#16a085; color:#fff;" onclick="App.testRouterApi(${router.id})">🔌 فحص اتصال API</button>` : ''}
                            </div>
                            <div id="nas-control-suite-fields" style="display:${(!router || Number(router?.api_enabled ?? 1) === 1) ? 'block' : 'none'};">
                                <div class="form-row">
                                    <div class="form-group" style="flex:1;">
                                        <label>مستخدم API (Username):</label>
                                        <input id="nas-api-user" class="mt-input" style="width:100%; direction:ltr;" value="${router?.api_user || 'admin'}" placeholder="admin" />
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label>كلمة مرور API (Password):</label>
                                        <input id="nas-api-pass" type="password" class="mt-input" style="width:100%; direction:ltr;" value="${router?.api_password || ''}" placeholder="كلمة سر راوتر ميكروتك" />
                                    </div>
                                    <div class="form-group" style="width:90px;">
                                        <label>منفذ API:</label>
                                        <input id="nas-api-control-port" type="number" class="mt-input" style="width:100%; direction:ltr;" value="${router?.api_port || 8728}" min="1" max="65535" />
                                    </div>
                                </div>
                                <div class="form-row" style="margin-top:6px;">
                                    <div class="form-group" style="width:130px;">
                                        <label>منفذ FTP (رفع الملفات):</label>
                                        <input id="nas-ftp-port" type="number" class="mt-input" style="width:100%; direction:ltr;" value="${router?.ftp_port || 21}" />
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label>مجلد الهوتسبوت بالراوتر (Hotspot Directory):</label>
                                        <select id="nas-hotspot-dir" class="mt-input" style="width:100%;">
                                            <option value="hotspot" ${(!router || router?.hotspot_dir === 'hotspot') ? 'selected' : ''}>hotspot (أجهزة RouterOS الافتراضية والقديمة)</option>
                                            <option value="flash/hotspot" ${router?.hotspot_dir === 'flash/hotspot' ? 'selected' : ''}>flash/hotspot (راوترات RouterBOARD الحديثة بذاكرة فلاش)</option>
                                        </select>
                                    </div>
                                </div>
                                <div style="font-size:11px; color:#64748b; margin-top:4px;">
                                    يتيح سحب الجيران والنقاط تلقائيًا، مراقبة حركة المنافذ، طرد المستخدمين، ورفع صفحات Hotspot Login مباشرة لذاكرة الراوتر.
                                </div>
                            </div>
                        </div>

                        
                        <!-- DUAL PORT FORWARDING & REMOTE ACCESS (WINBOX & API) -->
                        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:12px; margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <div style="font-weight:800; font-size:13px; color:#166534; display:flex; align-items:center; gap:6px;">
                                    <span>🌐</span> <span>توجيه المنافذ والاتصال عن بُعد (Port Forwarding & Remote Access)</span>
                                </div>
                                <span class="badge" style="background:#16a34a; color:#fff; font-size:10.5px; padding:2px 8px; font-weight:700;">2 منافذ سيرفر مخصصة</span>
                            </div>
                            <div style="font-size:11px; color:#15803d; margin-bottom:10px; line-height:1.6;">
                                يحجز النظام منفذين واردين على السيرفر لكل راوتر (Winbox & API). المنفذ الوارد من السيرفر ثابت، والمنفذ الموجه للراوتر اختياري بحسب إعدادات الراوتر لديك.
                            </div>

                            <!-- Channel 1: Winbox Port Forwarding -->
                            <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <strong style="color:#0f172a; font-size:11.5px; display:flex; align-items:center; gap:4px;">
                                        <span>🖥️</span> <span>1. منفذ الدخول عبر برنامج الوينبوكس (Winbox Port)</span>
                                    </strong>
                                    ${isEdit ? `<button type="button" class="mt-btn" style="padding:2px 8px; font-size:10px; background:#0284c7; color:#fff; border:none;" onclick="App.copyWinboxEndpoint('${router.winbox_listen_port || (8220 + router.id)}')">📋 نسخ عنوان Winbox</button>` : ''}
                                </div>
                                <div class="form-row">
                                    <div class="form-group" style="flex:1;">
                                        <label style="font-size:11px; color:#64748b;">🔒 المنفذ الوارد من السيرفر (ثابت ومخصص):</label>
                                        <input class="mt-input" style="width:100%; direction:ltr; background:#f1f5f9; font-weight:700; color:#0369a1;" value="${window.location.hostname || '194.163.165.238'}:${router?.winbox_listen_port || (router ? (8220 + router.id) : 'تلقائي (82XX)')}" readonly />
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label style="font-size:11px; color:#0f172a; font-weight:700;">✏️ المنفذ الموجه إلى الراوتر (Target Port):</label>
                                        <input id="nas-winbox-port" type="number" class="mt-input" style="width:100%; direction:ltr; font-weight:700;" value="${router?.winbox_port || 8291}" placeholder="8291" min="1" max="65535" />
                                        <small style="font-size:10px; color:#64748b;">الافتراضي 8291 أو المنفذ المعدل في المايكروتك</small>
                                    </div>
                                </div>
                            </div>

                            <!-- Channel 2: API Port Forwarding -->
                            <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <strong style="color:#0f172a; font-size:11.5px; display:flex; align-items:center; gap:4px;">
                                        <span>⚡</span> <span>2. منفذ خدمة الدخول عبر المتصفح (WWW Service Port)</span>
                                    </strong>
                                </div>
                                <div class="form-row">
                                    <div class="form-group" style="flex:1;">
                                        <label style="font-size:11px; color:#64748b;">🔒 المنفذ الوارد من السيرفر (ثابت ومخصص):</label>
                                        <input class="mt-input" style="width:100%; direction:ltr; background:#f1f5f9; font-weight:700; color:#0369a1;" value="${window.location.hostname || '194.163.165.238'}:${router?.api_listen_port || (router ? (8720 + router.id) : 'تلقائي (87XX)')}" readonly />
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label style="font-size:11px; color:#0f172a; font-weight:700;">✏️ منفذ WWW الموجه إلى الراوتر (WWW Target Port):</label>
                                        <input id="nas-www-port" type="number" class="mt-input" style="width:100%; direction:ltr; font-weight:700;" value="${router?.www_port || router?.api_port || 80}" placeholder="80" min="1" max="65535" />
                                        <small style="font-size:10px; color:#64748b;">أدخل منفذ خدمة WWW في الراوتر، مثل 80 أو 443 أو منفذ مخصص</small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- PER-ROUTER USER MANAGER PROXY FAILOVER -->
                        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:10px; margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; color:#9a3412; cursor:pointer;">
                                    <input type="checkbox" id="nas-um-proxy-enabled" ${proxyEnabled ? 'checked' : ''} ${proxyDisabled ? 'disabled' : ''} onchange="App.syncRouterWorkTypeState();" />
                                    <span>🔄 سيرفر User Manager احتياطي مخصص لهذا الراوتر (Proxy Failover)</span>
                                </label>
                                <span class="badge" style="background:#ea580c; color:#fff; font-size:10px; padding:2px 8px;">Per-Router Failover</span>
                            </div>
                            ${isUserManagerRouter ? '<div style="font-size:11px;color:#9a3412;background:#ffedd5;border-radius:5px;padding:7px;margin-bottom:8px;">هذا الراوتر معيّن كـUser Manager الأساسي للشبكة، لذلك لا يحتاج إلى احتياطي ولا يمكنه اختيار نفسه.</div>' : (userManagerRouters.length === 0 ? '<div style="font-size:11px;color:#9a3412;background:#ffedd5;border-radius:5px;padding:7px;margin-bottom:8px;">لا يمكن تفعيل الاحتياطي قبل تعيين راوتر واحد بنوع عمل User Manager داخل هذه الشبكة.</div>' : '')}
                            <div id="nas-um-proxy-fields" style="display:${proxyEnabled && !proxyDisabled ? 'block' : 'none'};">
                                <div style="font-size:11px; color:#7c2d12; margin-bottom:8px; line-height:1.6;">
                                    عند عدم العثور على الكرت في نظام SAM، سيقوم السيرفر المركزي بتوجيه طلب المصادقة فوراً إلى اليوزر مانجر الخاص بهذا الراوتر حصراً دون أي تداخل مع كروت الراوترات الأخرى.
                                </div>
                                <div class="form-row">
                                    <div class="form-group" style="flex:2;">
                                        <label>راوتر User Manager الاحتياطي من الشبكة نفسها:</label>
                                        <select id="nas-um-proxy-router-id" class="mt-input" style="width:100%;" ${proxyDisabled ? 'disabled' : ''}>
                                            ${proxyOptions}
                                        </select>
                                        <small id="nas-um-proxy-help" style="display:block;color:#7c2d12;margin-top:4px;">${isUserManagerRouter ? 'هذا هو راوتر User Manager الأساسي؛ لا يمكنه اختيار نفسه كاحتياطي.' : (userManagerRouters.length ? 'يُحفظ راوتر User Manager الوحيد في الشبكة كاحتياطي تلقائيًا، ويمكن تغييره فقط إذا وُجد أكثر من مرشح.' : 'لا يوجد راوتر User Manager محدد في هذه الشبكة بعد.')}</small>
                                    </div>
                                    <div class="form-group" style="flex:2;">
                                        <div style="background:#fff7ed;border:1px dashed #fdba74;border-radius:6px;padding:10px;font-size:11px;color:#9a3412;line-height:1.7;">🔒 عنوان الـIP ومفتاح RADIUS للراوتر الاحتياطي مُداران تلقائيًا ولا يمكن تعديلهما كنص.</div>
                                    </div>
                                </div>
                                <div class="form-row" style="margin-top:6px;">
                                    <div class="form-group" style="flex:1;">
                                        <label>منفذ المصادقة (Auth Port):</label>
                                        <input id="nas-um-proxy-auth-port" type="number" class="mt-input" style="width:100%; direction:ltr;" value="${router?.um_proxy_auth_port || 1812}" />
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label>منفذ المحاسبة (Acct Port):</label>
                                        <input id="nas-um-proxy-acct-port" type="number" class="mt-input" style="width:100%; direction:ltr;" value="${router?.um_proxy_acct_port || 1813}" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>الوصف</label>
                            <textarea id="nas-description" class="mt-input" style="width:100%; min-height:75px; resize:vertical" placeholder="موقع الجهاز أو ملاحظات الإدارة"></textarea>
                        </div>
                    </div>
                    <div class="mt-modal-footer">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>
                        <button id="nas-save-button" type="submit" class="mt-btn mt-btn-primary">${isEdit ? 'حفظ التعديلات' : 'إنشاء الجهاز وتجهيز السكربت'}</button>
                    </div>
                </form>
            </div>
        </div>`;

        if (isEdit) {
            document.getElementById('nas-shortname').value = router.shortname || '';
            document.getElementById('nas-description').value = router.description || '';

            if (document.getElementById('nas-um-proxy-enabled')) {
                const proxyActive = proxyEnabled && !proxyDisabled;
                document.getElementById('nas-um-proxy-enabled').checked = proxyActive;
                document.getElementById('nas-um-proxy-fields').style.display = proxyActive ? 'block' : 'none';
                document.getElementById('nas-um-proxy-auth-port').value = router.um_proxy_auth_port || 1812;
                document.getElementById('nas-um-proxy-acct-port').value = router.um_proxy_acct_port || 1813;
            }
        }
        this.syncRouterWorkTypeState();
    },

    syncRouterWorkTypeState() {
        const workTypes = Array.from(document.querySelectorAll('.nas-work-type:checked')).map(el => el.value);
        const currentId = Number(this.routerModalCurrentId || 0);
        const isUserManager = workTypes.includes('usermanager');
        const candidates = (Array.isArray(this.routerCache) ? this.routerCache : []).filter(router =>
            Number(router.id) !== currentId &&
            String(router.work_types || '').split(',').map(value => value.trim()).includes('usermanager')
        );
        const enabled = document.getElementById('nas-um-proxy-enabled');
        const fields = document.getElementById('nas-um-proxy-fields');
        const select = document.getElementById('nas-um-proxy-router-id');
        const help = document.getElementById('nas-um-proxy-help');
        if (!enabled || !fields || !select) return;

        // Only one network router can own User Manager.  Stop a second role
        // from being submitted and leave the authoritative server-side guard
        // as the final enforcement layer.
        if (isUserManager && candidates.length > 0) {
            const userManagerCheckbox = document.querySelector('.nas-work-type[value="usermanager"]');
            if (userManagerCheckbox) userManagerCheckbox.checked = false;
            this.toast('يوجد راوتر User Manager معيّن مسبقًا في هذه الشبكة؛ لا يمكن إضافة راوتر ثانٍ بهذا النوع', 'warning');
            return this.syncRouterWorkTypeState();
        }

        const noTarget = candidates.length === 0;
        enabled.disabled = isUserManager || noTarget;
        if (isUserManager || noTarget) {
            enabled.checked = false;
            fields.style.display = 'none';
            select.disabled = true;
            if (help) help.textContent = isUserManager
                ? 'هذا هو راوتر User Manager الأساسي؛ لا يمكنه اختيار نفسه كاحتياطي.'
                : 'لا يوجد راوتر User Manager آخر في الشبكة الحالية بعد.';
            return;
        }

        enabled.disabled = false;
        if (!select.value || !candidates.some(router => Number(router.id) === Number(select.value))) {
            select.value = String(candidates[0].id);
        }
        select.disabled = false;
        fields.style.display = enabled.checked ? 'block' : 'none';
        if (help) help.textContent = 'يُحفظ راوتر User Manager الوحيد في الشبكة كاحتياطي تلقائيًا، ويُستخرج عنوانه ومفتاحه من النظام.';
    },

    async saveRouterForm(event, id = null) {
        event.preventDefault();
        const button = document.getElementById('nas-save-button');
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = id ? 'جاري الحفظ...' : 'جاري إنشاء NAS وSSTP...';
        const workTypes = Array.from(document.querySelectorAll('.nas-work-type:checked')).map(el => el.value);
        if (!workTypes.length) {
            button.disabled = false;
            button.textContent = originalText;
            this.toast('اختر نوع عمل واحدًا على الأقل للراوتر', 'warning');
            return;
        }
        const data = {
            id,
            shortname: document.getElementById('nas-shortname').value.trim(),
            work_types: workTypes,
            description: document.getElementById('nas-description').value.trim(),
            type: 'mikrotik',
            winbox_port: Number(document.getElementById('nas-winbox-port')?.value || 8291),
            api_enabled: document.getElementById('nas-api-enabled')?.checked ? 1 : 0,
            api_user: document.getElementById('nas-api-user')?.value?.trim() || 'admin',
            api_password: document.getElementById('nas-api-pass')?.value || '',
            api_port: Number(document.getElementById('nas-api-control-port')?.value || 8728),
            www_port: Number(document.getElementById('nas-www-port')?.value || 80),
            ftp_port: Number(document.getElementById('nas-ftp-port')?.value || 21),
            hotspot_dir: document.getElementById('nas-hotspot-dir')?.value?.trim() || 'hotspot',
            um_proxy_enabled: document.getElementById('nas-um-proxy-enabled')?.checked ? 1 : 0,
            um_proxy_router_id: Number(document.getElementById('nas-um-proxy-router-id')?.value || 0),
            um_proxy_auth_port: Number(document.getElementById('nas-um-proxy-auth-port')?.value || 1812),
            um_proxy_acct_port: Number(document.getElementById('nas-um-proxy-acct-port')?.value || 1813)
        };
        const res = await this.api('save_router', {}, 'POST', data);
        if (!res || !res.success) {
            button.disabled = false;
            button.textContent = originalText;
            this.toast(res?.error || 'تعذر حفظ الجهاز', 'danger');
            return;
        }

        this.closeModal();
        await this.renderRouters();
        this.toast(res.message || (id ? 'تم تحديث الجهاز' : 'تم إنشاء الجهاز وحساب SSTP'), 'success');
        if (!id && res.script) this.displayMikrotikScript(res, true);
    },

    displayMikrotikScript(res, createdNow = false) {
        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:840px; max-height:94vh; overflow-y:auto;">
                <div class="mt-modal-header bg-primary text-white" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${createdNow ? '✅ تم إنشاء الجهاز — ' : '📋 '}سكربت ربط MikroTik مع RADIUS عبر SSTP: <b>${this.escape(res.router?.shortname || '')}</b></span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <div class="mt-modal-body" style="padding:16px;">
                    <!-- Radius & NAS Summary Bar -->
                    <div class="nas-created-summary" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom:14px;">
                        <div><small>حالة الربط</small><strong style="color:#166534;">✅ تم التوليد تلقائيًا</strong></div>
                        <div><small>إعدادات NAS / SSTP / CoA</small><strong>🔒 مُدارة من النظام</strong></div>
                        <div><small>مفتاح RADIUS وكلمة المرور</small><strong>🔒 غير معروضين</strong></div>
                        <div><small>خادم RADIUS الداخلي</small><strong>دومين النظام — المنفذ مُدار من النظام</strong></div>
                        <div><small>راديوس احتياطي</small><strong>${Number(res.router?.um_proxy_enabled ?? 0) === 1 ? '🔄 مفعّل براوتر من نفس الشبكة' : '⚪ غير مفعّل'}</strong></div>
                    </div>

                    <!-- Public DDNS SSTP is intentionally not part of the normal router script. -->
                    <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:12px; color:#475569; font-size:11px; line-height:1.8;">
                        🌐 اتصال SSTP العام عبر DDNS غير مطلوب لهذا الربط، لذلك لا يُضاف إلى السكربت. يمكن لمالك النظام تفعيله لاحقًا من إعدادات خادم SSTP العامة فقط.
                    </div>

                    <!-- 2. BACKUP RADIUS CONFIGURATION CARD -->
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 16px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="margin:0; font-weight:bold; font-size:12px; color:#1e40af; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" id="mt-script-backup-enabled" ${res.backup_radius_enabled ? 'checked' : ''} onchange="App.refreshScriptWithServerVpn(${res.router.id})" style="transform:scale(1.2);">
                                🛡️ خادم RADIUS الاحتياطي (User Manager):
                            </label>
                        </div>
                        <div style="font-size:11px; color:#1e40af; font-weight:600; text-align:right;">
                            يُستخدم الراوتر الاحتياطي المحدد من إعدادات User Manager العامة في هذه الشبكة فقط.
                            <br><span style="color:#64748b; font-weight:500;">لا يمكن إدخال عنوان IP يدويًا.</span>
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; margin-bottom:10px; font-size:11px; color:#334155; line-height:1.6;">
                        💡 انسخ السكربت كاملاً والصقه مرة واحدة في <b>Terminal</b> داخل الميكروتك؛ سيُنشئ نفق SSTP الداخلي ويضبط خادم FreeRADIUS والجدار الناري وCoA والـ Hotspot تلقائياً.
                    </div>
                    <textarea id="mt-generated-script" class="nas-script-box" style="height:260px; font-family:monospace; font-size:11px; direction:ltr; text-align:left;" readonly></textarea>
                </div>
                <div class="mt-modal-footer" style="justify-content:space-between; padding:10px 16px;">
                    <button type="button" class="mt-btn mt-btn-success" style="font-weight:700; padding:6px 18px;" onclick="App.copyScriptToClipboard()">📋 نسخ السكربت كاملاً</button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        </div>`;
        document.getElementById('mt-generated-script').value = res.script;
    },

    async refreshScriptWithServerVpn(routerId) {
        const backupEnabled = document.getElementById('mt-script-backup-enabled')?.checked ?? false;

        this.toast('جاري تحديث السكربت...', 'info');
        const scriptOptions = {
            id: routerId,
            backup_enabled: backupEnabled
        };
        const res = await this.api('generate_mikrotik_script', scriptOptions);

        if (res && res.success) {
            const txt = document.getElementById('mt-generated-script');
            if (txt) txt.value = res.script;
            this.toast('تم تحديث السكربت بنجاح!', 'success');
        } else {
            this.toast(res?.error || 'تعذر تحديث السكربت', 'danger');
        }
    },

    async saveServerVpnSettingsAsDefault(routerId) {
        const serverEnabled = document.getElementById('mt-script-server-vpn-enabled')?.checked ?? true;
        const serverHost = document.getElementById('mt-script-server-host')?.value?.trim() || window.location.hostname;
        const serverPort = parseInt(document.getElementById('mt-script-server-port')?.value || '443', 10);
        const serverUser = document.getElementById('mt-script-server-user')?.value?.trim() || '';
        const serverPass = document.getElementById('mt-script-server-pass')?.value?.trim() || '';
        const serverComment = document.getElementById('mt-script-server-comment')?.value?.trim() || 'SSTP SERVER SAM';

        this.toast('جاري حفظ إعدادات الـ DDNS والخادم كافتراضي...', 'info');
        const res = await this.api('save_sstp_server_vpn_settings', {
            enabled: serverEnabled,
            host: serverHost,
            port: serverPort,
            user: serverUser,
            pass: serverPass,
            comment: serverComment
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم حفظ إعدادات الـ DDNS والخادم كافتراضي بنجاح!', 'success');
            this.refreshScriptWithServerVpn(routerId);
        } else {
            this.toast(res?.error || 'فشل الحفظ', 'danger');
        }
    },

    async refreshScriptBackup(routerId) {
        return this.refreshScriptWithServerVpn(routerId);
    },

    async restartSstp() {
        if (!confirm('هل أنت متأكد من إعادة تشغيل خادم SSTP VPN؟')) return;
        this.toast('جاري إعادة تشغيل خادم SSTP...', 'info');
        const res = await this.api('restart_sstp');
        if (res && res.success) {
            this.toast(res.message || 'تمت إعادة التشغيل بنجاح!', 'success');
            this.renderRouters();
        }
    },

    
    
    async showMikrotikScript(routerId) {
        return this.openSmartRouterScriptModal(routerId);
    },

    async openSmartRouterScriptModal(routerId = 0) {
        let routersList = this.routerCache || [];
        if (!routersList.length) {
            const rRes = await this.api('get_routers');
            routersList = Array.isArray(rRes) ? rRes : (rRes?.routers || []);
            this.routerCache = routersList;
        }

        let selectedId = Number(routerId);
        if (!selectedId && routersList.length > 0) {
            selectedId = Number(routersList[0].id);
        }
        if (!selectedId) {
            this.toast('لا يوجد راوتر محدد لتوليد السكربت', 'warning');
            return;
        }

        this.toast('جاري تجهيز بيانات الترخيص والسكربتات الذكية...', 'info');

        const [resV7, resV6, provRes] = await Promise.all([
            this.api('generate_smart_router_script', { router_id: selectedId, version: 'v7' }),
            this.api('generate_smart_router_script', { router_id: selectedId, version: 'v6' }),
            this.api('get_router_provision_info', { router_id: selectedId })
        ]);

        const validRes = (resV7 && resV7.success) ? resV7 : ((resV6 && resV6.success) ? resV6 : null);
        if (!validRes) {
            this.toast(resV7?.error || resV6?.error || 'تعذر توليد السكربت لهذا الراوتر', 'danger');
            return;
        }

        if (!routersList.some(r => Number(r.id) === selectedId)) {
            routersList.push({
                id: selectedId,
                shortname: validRes.router?.shortname || provRes?.shortname || `راوتر #${selectedId}`,
                nasname: validRes.router?.nasname || provRes?.nasname || ''
            });
        }

        this._cachedRouterScripts = {
            routerId: selectedId,
            v7: (resV7 && resV7.success) ? resV7 : validRes,
            v6: (resV6 && resV6.success) ? resV6 : validRes,
            provision: provRes || {},
            activeTab: this._cachedRouterScripts?.activeTab || 'v7'
        };

        this.renderSmartRouterScriptModal(selectedId, routersList);
    },

    downloadCustomTlgrmPack(routerId = 0, version = 'v7') {
        const rId = Number(routerId || this._cachedRouterScripts?.routerId || 0);
        const ver = version || (this._cachedRouterScripts?.activeTab === 'v6' ? 'v6' : 'v7');
        if (!rId) return this.toast('يرجى تحديد الراوتر أولاً', 'warning');
        this.toast('جاري تجهيز وتنزيل حزمة TG2 المهيأة ببيانات شبكتك...', 'info');
        window.location.href = `api.php?action=download_custom_tlgrm_pack&router_id=${rId}&version=${ver}`;
    },

    async regenerateRouterProvisionKey(routerId) {
        if (!confirm('⚠️ تحذير: تجديد مفتاح الترخيص سيُلغي المفتاح القديم فوراً ولن يتمكن الراوتر من الاستدعاء حتى تحديث المفتاح فيه. هل تريد المتابعة؟')) return;
        this.toast('جاري تجديد مفتاح الترخيص...', 'info');
        const res = await this.api('regenerate_router_token', { router_id: routerId }, 'POST');
        if (res && res.success) {
            this.toast('✅ تم تجديد مفتاح ترخيص الراوتر بنجاح!', 'success');
            this.openSmartRouterScriptModal(routerId);
        } else {
            this.toast(res?.error || 'فشل تجديد المفتاح', 'danger');
        }
    },

    async toggleRouterLicense(routerId, newStatus) {
        const actionText = newStatus ? 'تنشيط ترخيص الراوتر' : 'إيقاف وتعطيل ترخيص الراوتر';
        if (!confirm(`هل أنت متأكد من ${actionText}؟`)) return;
        this.toast('جاري تحديث حالة الترخيص...', 'info');
        const res = await this.api('toggle_router_license', { router_id: routerId, is_active: newStatus ? 1 : 0 }, 'POST');
        if (res && res.success) {
            this.toast(`✅ تم ${actionText} بنجاح!`, 'success');
            this.openSmartRouterScriptModal(routerId);
        } else {
            this.toast(res?.error || 'فشل تغيير حالة الترخيص', 'danger');
        }
    },

    copyCallerCommandToClipboard() {
        const txt = document.getElementById('smart-mt-caller-command');
        if (txt) {
            txt.select();
            document.execCommand('copy');
            this.toast('✅ تم نسخ أمر الاستدعاء الفوري للحافظة!', 'success');
        }
    },

    renderSmartRouterScriptModal(selectedId, routersList) {
        const data = this._cachedRouterScripts;
        const currentRes = data.activeTab === 'v6' ? data.v6 : data.v7;
        const activeTab = data.activeTab || 'v7';
        const routerInfo = currentRes.router || (routersList && routersList.find(r => Number(r.id) === Number(selectedId))) || {};
        const prov = data.provision || {};
        const currentVersion = activeTab === 'v6' ? 'v6' : 'v7';
        const callerCmd = activeTab === 'v6' ? prov.v6_bootstrap_command : prov.v7_bootstrap_command;

        let activeCode = '';
        let tabDesc = '';

        if (activeTab === 'v7') {
            activeCode = currentRes.script || '';
            tabDesc = '⚡ <b>RouterOS v7 (الكود الكامل):</b> يتضمن إعداد نفق SSTP، مصادقة RADIUS، الجدار الناري، الـ Hotspot، واستدعاء تنبيهات الطوارئ مع صياغة v7 المحدثة.';
        } else if (activeTab === 'v6') {
            activeCode = (data.v6?.script) || currentRes.script || '';
            tabDesc = '⚙️ <b>RouterOS v6 (الكود الكامل):</b> متوافق بالكامل مع إصدارات RouterOS 6.x القديمة ومعاملات HTTPS لـ /tool fetch.';
        } else if (activeTab === 'whatsapp') {
            activeCode = currentRes.whatsapp_script || '';
            tabDesc = '💬 <b>سكربت إرسال الواتساب من المايكروتك (send_whatsapp.rsc):</b> يتيح للراوتر إرسال رسائل وإشعارات عبر بوابة الواتساب الخاصة بالنظام تلقائياً.';
        } else if (activeTab === 'telemetry') {
            activeCode = currentRes.telemetry_script || '';
            tabDesc = '📡 <b>سكربت تقارير الطوارئ والاتصال (send_telemetry.rsc):</b> يُرسل حالة الخطوط، أعطال الكهرباء، وانقطاع الإنترنت إلى النظام لحظياً.';
        } else if (activeTab === 'tlgrm_pack') {
            activeCode = `# =========================================================================\n# أوامر تثبيت وتشغيل حزمة TG2 المهيأة تلقائياً لراوتر: ${routerInfo.shortname || routerInfo.nasname || selectedId}\n# =========================================================================\n# 1. اضغط على زر [تنزيل حزمة TG2 المهيأة لشبكتك (.ZIP)] لتحميل الحزمة.\n# 2. فك الضغط على جهازك واسحب مجلد TLGRM إلى قائمة Files في WinBox.\n# 3. نفّذ أمر التثبيت التلقائي بحسب إصدار الراوتر:\n\n# لتثبيت وتفعيل البوت على RouterOS v7:\n/import file-name="TLGRM/setup_tlgrm_v7.rsc"\n\n# لتثبيت وتفعيل البوت على RouterOS v6:\n/import file-name="TLGRM/setup_tlgrm_v6.rsc"\n\n# =========================================================================\n# ستعمل كافة أوامر البوت وفحص الكروت والتنبيهات المباشرة فوراً!`;
            tabDesc = '🤖 <b>حزمة بوت التيليجرام للراوتر (TG2 Pack):</b> تم حقن توكن البوت، معرف الدردشة، وعناوين الربط مع سيرفرك تلقائياً داخل الحزمة. اضغط على زر التحميل لتنزيل مجلد TLGRM جاهز بالكامل!';
        }

        const isLicActive = prov.is_active !== false;

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()" style="z-index:10050;">
            <div class="mt-modal" style="width:900px; max-width:96vw; max-height:95vh; overflow-y:auto; border-radius:12px;">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #0f172a, #1e293b); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:22px;">🚀</span>
                        <div>
                            <div style="font-weight:800; font-size:15px;">الاستدعاء الذكي ومُولّد سكربتات MikroTik بمفتاح الترخيص</div>
                            <div style="font-size:11px; color:#94a3b8;">إعداد وترخيص الراوترات آلياً (RouterOS v6 & RouterOS v7) مع حماية المفتاح</div>
                        </div>
                    </div>
                    <span style="cursor:pointer; font-size:20px; color:#cbd5e1;" onclick="App.closeModal()">✕</span>
                </div>

                <div class="mt-modal-body" style="padding:18px;">
                    <!-- Router Selector & Quick Actions -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
                        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:240px;">
                            <label style="font-weight:700; font-size:12.5px; color:#334155; margin:0; white-space:nowrap;">📡 الراوتر المحدد:</label>
                            <select class="mt-select" style="font-weight:700; font-size:12.5px; flex:1;" onchange="App.openSmartRouterScriptModal(this.value)">
                                ${routersList.map(r => `<option value="${r.id}" ${Number(r.id) === Number(selectedId) ? 'selected' : ''}>${this.escape(r.shortname || r.nasname)} (${r.nasname})</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.diagnoseRouterFleet(${selectedId})" title="فحص صحة واتصال هذا الراوتر">🩺 فحص وتشخيص</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--success" onclick="App.downloadCustomTlgrmPack(${selectedId})" style="display:inline-flex; align-items:center; gap:5px; font-weight:700;">📥 تنزيل حزمة TG2 (.ZIP)</button>
                        </div>
                    </div>

                    <!-- 🚀 DYNAMIC BOOTSTRAP CALLER CARD (ENTERPRISE ONE-LINER) -->
                    <div style="background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; border-radius:10px; padding:14px 18px; margin-bottom:16px; box-shadow:0 4px 12px rgba(2,132,199,0.25);">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:18px;">⚡</span>
                                <span style="font-weight:800; font-size:13.5px;">أمر الاستدعاء والترخيص التلقائي (One-Click Dynamic Bootstrap):</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="sam-badge ${isLicActive ? 'sam-badge--success' : 'sam-badge--danger'}" style="font-size:11px; padding:3px 8px;">${isLicActive ? '🟢 ترخيص نشط' : '🔴 ترخيص معطل'}</span>
                                <button type="button" class="sam-btn sam-btn--xs" style="background:#fff; color:#0369a1; font-weight:700;" onclick="App.regenerateRouterProvisionKey(${selectedId})" title="إلغاء المفتاح الحالي وتوليد مفتاح أمان جديد">🔄 تجديد المفتاح</button>
                                <button type="button" class="sam-btn sam-btn--xs" style="background:${isLicActive ? '#fee2e2; color:#dc2626;' : '#dcfce7; color:#15803d;'} font-weight:700;" onclick="App.toggleRouterLicense(${selectedId}, ${!isLicActive})">${isLicActive ? '🔒 تعطيل' : '🔓 تنشيط'}</button>
                            </div>
                        </div>

                        <!-- One Liner Command Box -->
                        <div style="position:relative; margin-bottom:8px;">
                            <input type="text" id="smart-mt-caller-command" value="${this.escape(callerCmd || '')}" readonly style="width:100%; font-family:Consolas, 'Courier New', monospace; font-size:11.5px; background:#0b1320; color:#38bdf8; border:1px solid #1e293b; border-radius:6px; padding:9px 12px; direction:ltr; text-align:left;" />
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:11px; color:#e0f2fe;">
                            <div>
                                🔑 مفتاح الترخيص: <code style="background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px; font-family:monospace; color:#fff;">${prov.provision_token || '--'}</code>
                                ${prov.last_bootstrap_at ? `<span style="margin-right:8px;">• آخر استدعاء: <b>${prov.last_bootstrap_at}</b> (${prov.bootstrap_ip || 'WAN'})</span>` : ''}
                            </div>
                            <button type="button" class="sam-btn sam-btn--sm" style="background:#38bdf8; color:#0f172a; font-weight:800; padding:4px 14px;" onclick="App.copyCallerCommandToClipboard()">📋 نسخ أمر الاستدعاء</button>
                        </div>
                    </div>

                    <!-- Version & Script Tabs -->
                    <div style="display:flex; gap:6px; border-bottom:2px solid #e2e8f0; margin-bottom:14px; overflow-x:auto; padding-bottom:2px;">
                        <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'v7' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="font-weight:700; border-radius:6px 6px 0 0;" onclick="App.switchSmartScriptTab('v7')">⚡ RouterOS v7 (الكود الكامل)</button>
                        <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'v6' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="font-weight:700; border-radius:6px 6px 0 0;" onclick="App.switchSmartScriptTab('v6')">⚙️ RouterOS v6 (الكود الكامل)</button>
                        <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'whatsapp' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="font-weight:700; border-radius:6px 6px 0 0;" onclick="App.switchSmartScriptTab('whatsapp')">💬 إرسال واتساب (WhatsApp Relay)</button>
                        <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'telemetry' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="font-weight:700; border-radius:6px 6px 0 0;" onclick="App.switchSmartScriptTab('telemetry')">📡 بلاغات الطوارئ (Telemetry)</button>
                        <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'tlgrm_pack' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="font-weight:700; border-radius:6px 6px 0 0;" onclick="App.switchSmartScriptTab('tlgrm_pack')">📦 حزمة التيليجرام TLGRM</button>
                    </div>

                    <!-- Tab Instruction Banner -->
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:12px; color:#1e40af; line-height:1.6;">
                        ${tabDesc}
                    </div>

                    <!-- Code Textarea -->
                    <div style="position:relative;">
                        <textarea id="smart-mt-generated-script" style="width:100%; height:260px; font-family:Consolas, 'Courier New', monospace; font-size:11.5px; direction:ltr; text-align:left; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:8px; padding:12px; resize:vertical; line-height:1.5;" readonly>${this.escape(activeCode)}</textarea>
                    </div>

                    <!-- Bottom Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; padding-top:10px; border-top:1px solid #e2e8f0;">
                        <div style="font-size:11.5px; color:#64748b;">
                            💡 يمكنك استخدام <b>أمر الاستدعاء الفوري</b> في الأعلى أو نسخ الكود الكامل يدوياً.
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="sam-btn sam-btn--success" onclick="App.copySmartScriptToClipboard()" style="font-weight:700; padding:6px 18px;">📋 نسخ السكربت للحافظة</button>
                            <button type="button" class="sam-btn sam-btn--secondary" onclick="App.closeModal()">إغلاق</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    switchSmartScriptTab(tabName) {
        if (!this._cachedRouterScripts) return;
        this._cachedRouterScripts.activeTab = tabName;
        this.renderSmartRouterScriptModal(this._cachedRouterScripts.routerId, this.routerCache || []);
    },

    copySmartScriptToClipboard() {
        const txt = document.getElementById('smart-mt-generated-script');
        if (txt) {
            txt.select();
            document.execCommand('copy');
            this.toast('✅ تم نسخ السكربت للحافظة بنجاح!', 'success');
        }
    },

    async diagnoseRouterFleet(routerId) {
        this.toast('جاري فحص وتشخيص صحة الراوتر لحظياً...', 'info');
        const res = await this.api('diagnose_router_fleet', { router_id: routerId });
        if (!res || !res.success) {
            return this.toast(res?.error || 'تعذر تشخيص الراوتر', 'danger');
        }

        const d = res.diagnostics || {};
        const isOnline = d.sstp_status?.online;
        const apiOk = d.api_service?.accessible;
        const radiusOk = d.radius_status?.active;

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()" style="z-index:10060;">
            <div class="mt-modal" style="width:680px; max-width:95vw; max-height:90vh; overflow-y:auto; border-radius:12px;">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:22px;">🩺</span>
                        <div>
                            <div style="font-weight:800; font-size:15px;">تقرير تشخيص وفحص الراوتر الذكي</div>
                            <div style="font-size:11px; color:#e0f2fe;">${this.escape(d.router_name || '')} (${this.escape(d.nas_ip || '')})</div>
                        </div>
                    </div>
                    <span style="cursor:pointer; font-size:20px; color:#fff;" onclick="App.closeModal()">✕</span>
                </div>

                <div class="mt-modal-body" style="padding:18px;">
                    <!-- Health Score Cards -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:16px;">
                        <div style="background:#f8fafc; border:1px solid ${isOnline ? '#86efac' : '#fca5a5'}; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">نفق SSTP</div>
                            <div style="font-weight:800; font-size:13px; color:${isOnline ? '#16a34a' : '#dc2626'};">${isOnline ? '🟢 متصل' : '🔴 غير متصل'}</div>
                            <small style="font-size:10px; color:#94a3b8;">${this.escape(d.sstp_status?.vpn_ip || 'لا يوجد')}</small>
                        </div>
                        <div style="background:#f8fafc; border:1px solid ${apiOk ? '#86efac' : '#fca5a5'}; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">منفذ API (8728)</div>
                            <div style="font-weight:800; font-size:13px; color:${apiOk ? '#16a34a' : '#dc2626'};">${apiOk ? '🟢 متاح' : '🔴 غير متاح'}</div>
                            <small style="font-size:10px; color:#94a3b8;">${d.api_service?.latency_ms ? d.api_service.latency_ms + ' ms' : '--'}</small>
                        </div>
                        <div style="background:#f8fafc; border:1px solid ${radiusOk ? '#86efac' : '#fca5a5'}; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">مصادقة RADIUS</div>
                            <div style="font-weight:800; font-size:13px; color:${radiusOk ? '#16a34a' : '#dc2626'};">${radiusOk ? '🟢 نشطة' : '🔴 متوقفة'}</div>
                            <small style="font-size:10px; color:#94a3b8;">منفذ 1812 / 1813</small>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px;">نظام التشغيل</div>
                            <div style="font-weight:800; font-size:13px; color:#0284c7;">${this.escape(d.system_health?.ros_version || 'RouterOS')}</div>
                            <small style="font-size:10px; color:#94a3b8;">${this.escape(d.system_health?.board_name || 'MikroTik')}</small>
                        </div>
                    </div>

                    <!-- System Resource Metrics if online -->
                    ${d.system_health?.cpu_load !== undefined ? `
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 16px; margin-bottom:14px;">
                            <div style="font-weight:700; font-size:12px; color:#0369a1; margin-bottom:8px;">📊 مؤشرات موارد المعالج والذاكرة:</div>
                            <div style="display:flex; justify-content:space-between; gap:10px; font-size:12px; color:#0c4a6e; flex-wrap:wrap;">
                                <div>استهلاك المعالج CPU: <b>${d.system_health.cpu_load}%</b></div>
                                <div>الذاكرة الحرة RAM: <b>${Math.round((d.system_health.free_memory || 0) / (1024*1024))} MB</b></div>
                                <div>المساحة الحرة HDD: <b>${Math.round((d.system_health.free_hdd_space || 0) / (1024*1024))} MB</b></div>
                                <div>مدة التشغيل Uptime: <b>${this.escape(d.system_health.uptime || '--')}</b></div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Issues / Recommendations -->
                    <div style="background:#fafafa; border:1px solid #e5e5e5; border-radius:8px; padding:12px 16px; margin-bottom:14px;">
                        <div style="font-weight:700; font-size:12.5px; color:#171717; margin-bottom:6px;">💡 التوصيات والإجراءات المقترحة:</div>
                        <ul style="margin:0; padding-right:20px; font-size:12px; color:#525252; line-height:1.7;">
                            ${!isOnline ? '<li>⚠️ الراوتر غير متصل بنفق SSTP. يرجى مراجعة اتصال الإنترنت في الراوتر أو تطبيق سكربت التهيئة.</li>' : '<li>✅ نفق SSTP متصل وثابت مع السيرفر.</li>'}
                            ${!apiOk ? '<li>⚠️ منفذ API غير متاح. تأكد من تفعيل خدمة API في الراوتر: <code>/ip service enable api</code>.</li>' : '<li>✅ خدمة API متجاوبة وتتيح التحكم السريع بالجلسات والمستخدمين.</li>'}
                            <li>📦 يمكنك تحديث سكريبتات الراوتر وتنزيل حزمة TLGRM لضمان التوافق التام مع الإصدارات الحديثة.</li>
                        </ul>
                    </div>

                    <!-- Actions -->
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" class="sam-btn sam-btn--primary" onclick="App.openSmartRouterScriptModal(${routerId})">📜 فتح مولد السكربتات</button>
                        <button type="button" class="sam-btn sam-btn--secondary" onclick="App.closeModal()">إغلاق</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    copyScriptToClipboard() {
        const txt = document.getElementById('mt-generated-script');
        if (txt) {
            txt.select();
            document.execCommand('copy');
            this.toast('تم نسخ اسكربت الميكروتك للحافظة بنجاح!', 'success');
        }
    },

    async deleteRouter(id) {
        if (!confirm(this.t('confirm_delete'))) return;
        const res = await this.api('delete_router', { id });
        if (res && res.success) {
            this.toast(this.t('success_deleted'), 'success');
            this.renderRouters();
        }
    },

    async testRouterCoA(routerId = 0, nasIp = '', port = 3799) {
        this.toast('جاري فحص استجابة منفذ CoA للراوتر...', 'info');
        const res = await this.api('test_router_coa', {
            router_id: routerId,
            nas_ip: nasIp,
            port: port
        });

        if (!res || !res.success) {
            return this.toast(res?.error || 'تعذر فحص منفذ CoA', 'danger');
        }

        const healthy = !!res.healthy;
        const isMismatch = (res.status === 'secret_mismatch');
        const badgeColor = healthy ? '#16a34a' : (isMismatch ? '#ea580c' : '#dc2626');
        const badgeText = healthy ? '🟢 متصل ويستجيب بنجاح' : (isMismatch ? '⚠️ كلمة السر غير مطابقة' : '🔴 غير متصل / المنفذ مغلق');

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()" style="z-index:10070;">
            <div class="mt-modal" style="width:620px; max-width:95vw; max-height:90vh; overflow-y:auto; border-radius:12px;">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #1e293b, #334155); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:22px;">⚡</span>
                        <div>
                            <div style="font-weight:800; font-size:15px;">تقرير فحص منفذ CoA / Disconnect للراوتر</div>
                            <div style="font-size:11px; color:#cbd5e1;">${this.escape(res.router_name || '')} (${this.escape(res.nas_ip || '')}:${res.coa_port})</div>
                        </div>
                    </div>
                    <span style="cursor:pointer; font-size:20px; color:#fff;" onclick="App.closeModal()">✕</span>
                </div>

                <div class="mt-modal-body" style="padding:18px;">
                    <!-- Status Badge Banner -->
                    <div style="background:${healthy ? '#f0fdf4' : (isMismatch ? '#fffbeb' : '#fef2f2')}; border:1px solid ${healthy ? '#86efac' : (isMismatch ? '#fde68a' : '#fca5a5')}; border-radius:10px; padding:14px; margin-bottom:16px; display:flex; align-items:center; gap:12px;">
                        <div style="font-size:32px;">${healthy ? '✅' : (isMismatch ? '⚠️' : '❌')}</div>
                        <div>
                            <div style="font-weight:800; font-size:14px; color:${badgeColor};">${badgeText}</div>
                            <div style="font-size:12px; color:#475569; margin-top:3px; line-height:1.6;">${this.escape(res.message || '')}</div>
                        </div>
                    </div>

                    <!-- Technical Details -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:14px;">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b;">عنوان الراوتر NAS IP</div>
                            <div style="font-weight:800; font-size:13px; color:#0f172a; font-family:monospace;">${this.escape(res.nas_ip || '')}</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b;">منفذ CoA Port</div>
                            <div style="font-weight:800; font-size:13px; color:#0284c7; font-family:monospace;">${res.coa_port}</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center;">
                            <div style="font-size:11px; color:#64748b;">زمن الاستجابة Latency</div>
                            <div style="font-weight:800; font-size:13px; color:${res.latency_ms < 100 ? '#16a34a' : '#d97706'}; font-family:monospace;">${res.latency_ms || '--'} ms</div>
                        </div>
                    </div>

                    <!-- Raw radclient output -->
                    ${res.raw_output ? `
                        <div style="margin-bottom:14px;">
                            <div style="font-weight:700; font-size:12px; color:#334155; margin-bottom:4px;">📟 استجابة حزمة الاختبار من FreeRADIUS / radclient:</div>
                            <pre style="background:#0f172a; color:#38bdf8; padding:10px 12px; border-radius:6px; font-size:11.5px; direction:ltr; text-align:left; overflow-x:auto; margin:0; line-height:1.5;">${this.escape(res.raw_output)}</pre>
                        </div>
                    ` : ''}

                    <!-- Recommended Actions -->
                    <div style="background:#fafafa; border:1px solid #e5e5e5; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:12px; color:#525252; line-height:1.7;">
                        <b>💡 التوصيات والإجراءات:</b>
                        <ul style="margin:4px 0 0 16px; padding:0;">
                            ${healthy ? '<li>منفذ CoA جاهز تماماً؛ يستطيع النظام طرد الجلسات وفصل الكروت المنتهية وتغيير السرعات لحظياً.</li>' : ''}
                            ${!healthy ? '<li>تأكد من تفعيل استقبال RADIUS في المايكروتك عبر الأمر: <code>/radius incoming set accept=yes port=' + res.coa_port + '</code></li>' : ''}
                            ${!healthy ? '<li>تأكد من أن نفق SSTP VPN متصل مع السيرفر.</li>' : ''}
                            ${isMismatch ? '<li>تأكد من مطابقة كلمة سر RADIUS Secret في قائمة <code>/radius</code> داخل الراوتر مع المسجل بالنظام.</li>' : ''}
                        </ul>
                    </div>

                    <!-- Actions -->
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" class="sam-btn sam-btn--primary" onclick="App.testRouterCoA(${res.router_id}, '${res.nas_ip}', ${res.coa_port})">🔄 إعادة الفحص</button>
                        <button type="button" class="sam-btn sam-btn--secondary" onclick="App.closeModal()">إغلاق</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    async openReassignRouterModal(routerId = 0) {
        const canTransfer = this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin' || this.can('routers_transfer') || this.can('routers_edit') || this.can('networks_manage') || this.can('routers');
        if (!canTransfer) {
            return this.toast('⛔ غير مصرح: ليس لديك صلاحية نقل الراوترات بين الشبكات', 'danger');
        }

        let routersList = this.routerCache || [];
        const rRes = await this.api('get_routers', { scope: 'all' });
        routersList = (rRes && rRes.routers) ? rRes.routers : (Array.isArray(rRes) ? rRes : (rRes?.data || routersList));
        this.routerCache = routersList;

        const res = await this.api('get_networks', { scope: 'all' });
        const networks = (res && res.networks) ? res.networks : [];
        if (!networks.length) {
            return this.toast('لا توجد شبكات متاحة لنقل الراوتر إليها', 'warning');
        }

        const rId = Number(routerId);
        const router = rId > 0 ? routersList.find(r => Number(r.id) === rId) : null;
        const currentNetworkId = router ? Number(router.network_id || 0) : 0;
        const currentNetwork = currentNetworkId > 0 ? networks.find(n => Number(n.id) === currentNetworkId) : null;
        const currentNetName = currentNetwork ? currentNetwork.name : 'شبكة الراوتر الحالية';

        const modalHtml = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:580px; max-height:90vh; overflow-y:auto;">
                    <div class="mt-modal-header" style="background:#0284c7; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:15px;">🔄 نقل الراوتر إلى شبكة أخرى (Router Migration)</span>
                        <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:18px;">
                        ${router ? `
                            <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 14px; margin-bottom:14px; line-height:1.7;">
                                <div style="font-size:13px; font-weight:800; color:#0369a1; margin-bottom:4px;">
                                    📡 الراوتر: ${this.escape(router.shortname || router.nasname)} (${router.nasname})
                                </div>
                                <div style="font-size:12px; color:#0c4a6e;">
                                    الشبكة الحالية: <b>${this.escape(currentNetName)}</b>
                                </div>
                            </div>
                        ` : `
                            <div class="form-group" style="margin-bottom:14px;">
                                <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block;">📡 اختر الراوتر المطلوب نقله *</label>
                                <select id="reassign-source-router-id" class="mt-input" style="width:100%; font-size:13px; font-weight:700;" onchange="App.onReassignSourceRouterChange(this.value)">
                                    <option value="">-- اختر الراوتر --</option>
                                    ${routersList.map(r => {
                                        const rNet = networks.find(n => Number(n.id) === Number(r.network_id));
                                        const netLabel = rNet ? rNet.name : 'غير محدد';
                                        return `<option value="${r.id}" data-net="${r.network_id || 0}">📡 ${this.escape(r.shortname || r.nasname)} (${r.nasname}) — [الشبكة الحالية: ${this.escape(netLabel)}]</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `}

                        <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:12px; color:#92400e; line-height:1.7;">
                            ⚠️ <b>ملاحظة هامة:</b> عند نقل الراوتر إلى الشبكة الجديدة:
                            <ul style="margin:6px 0 0 18px; padding:0;">
                                <li>سيتم تحويل مصادقة FreeRADIUS للراوتر تلقائياً لتعمل كروت الشبكة الجديدة عليه فوراً.</li>
                                <li>يبقى نفق SSTP VPN متصلاً بدون انقطاع وبنفس الـ IP الثابت والمفتاح السري.</li>
                                <li>تسجيل جلسات الاستهلاك (Accounting) سيبدأ بالانتساب للشبكة الجديدة.</li>
                            </ul>
                        </div>

                        <div class="form-group" style="margin-bottom:14px;">
                            <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block;">🌐 اختر الشبكة المستهدفة لنقل الراوتر إليها *</label>
                            <select id="reassign-target-network-id" class="mt-input" style="width:100%; font-size:13px; font-weight:700;">
                                <option value="">-- اختر الشبكة المستهدفة --</option>
                                ${networks.map(n => `
                                    <option value="${n.id}" ${router && Number(n.id) === currentNetworkId ? 'disabled' : ''}>
                                        🏢 ${this.escape(n.name)} (${this.escape(n.code || 'NET-' + n.id)}) ${router && Number(n.id) === currentNetworkId ? '— (الشبكة الحالية)' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="button" id="btn-submit-reassign" class="mt-btn mt-btn-primary" style="background:#0284c7; border-color:#0369a1;" onclick="App.submitReassignRouter(${router ? router.id : 0})">
                            🔄 نقل الراوتر وتحديث الربط فوراً
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    onReassignSourceRouterChange(rId) {
        const sel = document.getElementById('reassign-source-router-id');
        const targetSel = document.getElementById('reassign-target-network-id');
        if (!sel || !targetSel) return;
        const opt = sel.options[sel.selectedIndex];
        const curNetId = Number(opt?.getAttribute('data-net') || 0);
        for (let i = 0; i < targetSel.options.length; i++) {
            const val = Number(targetSel.options[i].value);
            targetSel.options[i].disabled = (val > 0 && val === curNetId);
        }
    },

    async submitReassignRouter(fixedRouterId = 0) {
        const canTransfer = this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin' || this.can('routers_transfer') || this.can('routers_edit') || this.can('networks_manage') || this.can('routers');
        if (!canTransfer) {
            return this.toast('⛔ غير مصرح: ليس لديك صلاحية نقل الراوترات بين الشبكات', 'danger');
        }
        const routerId = fixedRouterId || Number(document.getElementById('reassign-source-router-id')?.value || 0);
        if (!routerId) {
            return this.toast('يرجى تحديد الراوتر المراد نقله', 'warning');
        }
        const targetNetworkId = document.getElementById('reassign-target-network-id')?.value;
        if (!targetNetworkId) {
            return this.toast('يرجى اختيار الشبكة المستهدفة', 'warning');
        }
        const btn = document.getElementById('btn-submit-reassign');
        if (btn) { btn.disabled = true; btn.textContent = 'جاري النقل...'; }

        const res = await this.api('reassign_router_network', {
            router_id: routerId,
            target_network_id: targetNetworkId
        }, 'POST');

        if (res && res.success) {
            this.closeModal();
            this.toast(res.message || 'تم نقل الراوتر إلى الشبكة الجديدة بنجاح', 'success');
            if (this.currentTab === 'network_subscriptions' && typeof this.renderNetworkSubscriptionCenter === 'function') {
                this.renderNetworkSubscriptionCenter(true);
            } else if (typeof this.renderRouters === 'function') {
                await this.renderRouters();
            }
        } else {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 نقل الراوتر وتحديث الربط فوراً'; }
            this.toast(res?.error || 'فشل نقل الراوتر', 'danger');
        }
    },

    portAnalyticsPeriod: 'all',
    portAnalyticsDateFrom: '',
    portAnalyticsDateTo: '',
    portAnalyticsRouter: '',
    portAnalyticsNode: '',
    portAnalyticsPort: '',
    portAnalyticsNodeType: '',
    portAnalyticsSearch: '',
    portAnalyticsViewMode: 'nodes',

    async renderPortAnalytics(period = null, nasIp = null) {
        const view = document.getElementById('main-view');
        if (!view) return;

        if (period !== null) this.portAnalyticsPeriod = period;
        if (nasIp !== null) this.portAnalyticsRouter = nasIp;

        view.innerHTML = `<div style="padding:60px 20px; text-align:center; font-size:15px; color:#475569;"><div class="spinner" style="margin:0 auto 12px; width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:#0284c7; border-radius:50%; animation:spin .8s linear infinite;"></div>جاري تحليل مبيعات واستهلاك منافذ وهيكل الشبكة...</div>`;

        const params = {
            period: this.portAnalyticsPeriod || 'all',
            date_from: this.portAnalyticsDateFrom || '',
            date_to: this.portAnalyticsDateTo || '',
            nas: this.portAnalyticsRouter || '',
            node_id: this.portAnalyticsNode || '',
            port_id: this.portAnalyticsPort || '',
            node_type: this.portAnalyticsNodeType || '',
            search: this.portAnalyticsSearch || ''
        };

        let res, routersRes, nodesRes;
        try {
            [res, routersRes, nodesRes] = await Promise.all([
                this.api('get_port_router_analytics', params),
                this.api('get_routers'),
                this.api('get_network_nodes')
            ]);
        } catch (err) {
            console.error('Port Analytics Error:', err);
            this.toast('تعذر جلب تقارير المنافذ والهيكل: ' + (err.message || err), 'danger');
            res = { data: { ports: [], routers: [], nodes: [], daily: [], summary: {} } };
            routersRes = [];
            nodesRes = [];
        }

        const data = res?.data || res || {};
        const ports = data.ports || [];
        const routers = data.routers || [];
        const nodes = data.nodes || [];
        const topologyTree = data.topology_tree || [];
        const daily = data.daily || [];
        const summary = data.summary || {};
        const nasList = routersRes?.data || routersRes || [];
        const allNodesList = nodesRes?.nodes || (Array.isArray(nodesRes) ? nodesRes : []);

        this._lastPortAnalyticsData = data;
        this._lastPortList = ports;

        const isFiltered = this.portAnalyticsPeriod !== 'all' || this.portAnalyticsDateFrom || this.portAnalyticsDateTo || this.portAnalyticsRouter || this.portAnalyticsNode || this.portAnalyticsPort || this.portAnalyticsNodeType || this.portAnalyticsSearch;

        // Filter text matching helper
        const searchQ = (this.portAnalyticsSearch || '').toLowerCase().trim();
        const filteredNodes = nodes.filter(n => {
            if (this.portAnalyticsNodeType && n.node_type !== this.portAnalyticsNodeType) return false;
            if (this.portAnalyticsNode && Number(n.id) !== Number(this.portAnalyticsNode)) return false;
            if (this.portAnalyticsRouter && n.nas_ip !== this.portAnalyticsRouter) return false;
            if (this.portAnalyticsPort && n.nas_port_id !== this.portAnalyticsPort) return false;
            if (!searchQ) return true;
            return (n.node_name || '').toLowerCase().includes(searchQ) ||
                   (n.display_name || '').toLowerCase().includes(searchQ) ||
                   (n.responsible_display || '').toLowerCase().includes(searchQ) ||
                   (n.nas_ip || '').toLowerCase().includes(searchQ) ||
                   (n.nas_port_id || '').toLowerCase().includes(searchQ) ||
                   (n.location || '').toLowerCase().includes(searchQ);
        });

        const filteredPorts = ports.filter(p => {
            if (this.portAnalyticsRouter && p.nasipaddress !== this.portAnalyticsRouter) return false;
            if (this.portAnalyticsPort && p.port_id !== this.portAnalyticsPort) return false;
            if (this.portAnalyticsNode && Number(p.node_id) !== Number(this.portAnalyticsNode)) return false;
            if (!searchQ) return true;
            return (p.port_id || '').toLowerCase().includes(searchQ) ||
                   (p.router_name || '').toLowerCase().includes(searchQ) ||
                   (p.nasipaddress || '').toLowerCase().includes(searchQ) ||
                   (p.node_name || '').toLowerCase().includes(searchQ) ||
                   (p.responsible_display || '').toLowerCase().includes(searchQ);
        });

        const filteredRouters = routers.filter(r => {
            if (this.portAnalyticsRouter && r.nasipaddress !== this.portAnalyticsRouter) return false;
            if (!searchQ) return true;
            return (r.router_name || '').toLowerCase().includes(searchQ) ||
                   (r.nasipaddress || '').toLowerCase().includes(searchQ);
        });

        const nodeTypeLabels = {
            main_node: '⭐ برج / نقطة رئيسية',
            sub_node: '↳ نقطة فرعية',
            regular: '📍 نقطة عادية'
        };

        const nodeTypeBadges = {
            main_node: '<span class="status-pill" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; font-weight:700;">⭐ برج رئيسي</span>',
            sub_node: '<span class="status-pill" style="background:#f3e8ff; color:#7c3aed; border:1px solid #e9d5ff; font-weight:700;">↳ نقطة فرعية</span>',
            regular: '<span class="status-pill" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">📍 نقطة عادية</span>'
        };

        // Views Content Builders
        const renderNodesTable = () => `
            <div class="mt-table-container" style="background:#fff; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#334155;">
                            <th style="padding:10px; width:45px; text-align:center;">#</th>
                            <th style="padding:10px;">النقطة / البرج (هيكل الشبكة)</th>
                            <th style="padding:10px;">النوع</th>
                            <th style="padding:10px;">المسؤول / المشرف</th>
                            <th style="padding:10px;">الراوتر والمنفذ</th>
                            <th style="padding:10px; text-align:center;">الجلسات</th>
                            <th style="padding:10px; text-align:center;">المشتركين</th>
                            <th style="padding:10px;">التنزيل / الرفع</th>
                            <th style="padding:10px;">إجمالي البيانات</th>
                            <th style="padding:10px; background:#f0fdf4; color:#166534; font-weight:800;">إجمالي المبيعات</th>
                            <th style="padding:10px;">استهلاك مجاني</th>
                            <th style="padding:10px; text-align:center;">الأجهزة</th>
                            <th style="padding:10px; text-align:center; width:90px;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredNodes.map((n, i) => `
                            <tr style="border-bottom:1px solid #f1f5f9; ${n.node_type==='main_node' ? 'background:#fafcff;' : ''}">
                                <td style="padding:8px 10px; text-align:center; color:#64748b;">${i + 1}</td>
                                <td style="padding:8px 10px;">
                                    <div style="font-weight:700; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px;">
                                        ${n.parent_id ? '<span style="color:#94a3b8;">↳</span>' : '🏢'} 
                                        <b>${this.escape(n.display_name || n.node_name)}</b>
                                    </div>
                                    ${n.parent_name ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">متفرع من: <b>${this.escape(n.parent_name)}</b></div>` : ''}
                                    ${n.location ? `<div style="font-size:10.5px; color:#94a3b8;">📍 ${this.escape(n.location)}</div>` : ''}
                                </td>
                                <td style="padding:8px 10px;">${nodeTypeBadges[n.node_type] || n.node_type}</td>
                                <td style="padding:8px 10px;">
                                    <div style="font-weight:600; color:#334155;">👤 ${this.escape(n.responsible_display || 'إدارة الشبكة')}</div>
                                    ${n.responsible_phone_display ? `<div style="font-size:10.5px; color:#64748b; direction:ltr; text-align:right;">📞 ${this.escape(n.responsible_phone_display)}</div>` : ''}
                                </td>
                                <td style="padding:8px 10px;">
                                    <div style="font-weight:600; color:#0284c7;">📡 ${this.escape(n.nas_ip || 'غير محدد')}</div>
                                    <span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size:10.5px;">🔌 ${this.escape(n.nas_port_id || 'default')}</span>
                                </td>
                                <td style="padding:8px 10px; text-align:center; font-weight:700;">${n.total_sessions || 0}</td>
                                <td style="padding:8px 10px; text-align:center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${n.unique_users || 0}</span></td>
                                <td style="padding:8px 10px; font-size:11px;">
                                    <div style="color:#059669;">⬇️ ${App.formatBytes((n.download_mb || 0) * 1024 * 1024)}</div>
                                    <div style="color:#d97706;">⬆️ ${App.formatBytes((n.upload_mb || 0) * 1024 * 1024)}</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:12.5px; color:#1e293b;">${App.formatBytes(n.total_bytes || 0)}</b>
                                    <div style="font-size:10.5px; color:#64748b;">${(n.total_mb || 0).toLocaleString()} MB</div>
                                </td>
                                <td style="padding:8px 10px; background:#f0fdf4;">
                                    <b style="color:#15803d; font-size:13.5px;">${App.formatMoney(n.total_sales || 0)}</b>
                                    <div style="font-size:10px; color:#16a34a;">${(n.comm_mb || 0).toLocaleString()} MB مدفوع</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    ${(n.free_mb > 0 || n.free_sessions > 0) ? `
                                        <div style="color:#7c3aed; font-weight:600;">🎁 ${(n.free_mb || 0).toLocaleString()} MB</div>
                                        <div style="font-size:10.5px; color:#64748b;">${n.free_sessions || 0} جلسة مجانية</div>
                                    ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
                                </td>
                                <td style="padding:8px 10px; text-align:center;">
                                    <span class="badge" style="background:#f8fafc; border:1px solid #cbd5e1; color:#475569; font-weight:700;">📦 ${n.assets_count || 0}</span>
                                </td>
                                <td style="padding:8px 10px; text-align:center; white-space:nowrap;">
                                    <button class="mt-btn mt-btn-primary" style="padding:4px 8px; font-size:11px; font-weight:700;" onclick="App.showNodePortDetailModal('${n.nas_ip || ''}', '${n.nas_port_id || ''}', ${n.id})" title="فحص جلسات واستهلاك ومعدات النقطة">🔍 فحص</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${filteredNodes.length === 0 ? `
                            <tr><td colspan="13" style="text-align:center; padding:40px; color:#94a3b8;">لا توجد نقاط شبكية مطابقة لمعايير البحث أو التصفية</td></tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `;

        const renderPortsTable = () => `
            <div class="mt-table-container" style="background:#fff; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#334155;">
                            <th style="padding:10px; width:45px; text-align:center;">#</th>
                            <th style="padding:10px;">الراوتر (NAS)</th>
                            <th style="padding:10px;">المنفذ (Port ID)</th>
                            <th style="padding:10px;">النقطة المرتبطة</th>
                            <th style="padding:10px;">المسؤول</th>
                            <th style="padding:10px; text-align:center;">الجلسات</th>
                            <th style="padding:10px; text-align:center;">المشتركين</th>
                            <th style="padding:10px;">التنزيل / الرفع</th>
                            <th style="padding:10px;">إجمالي البيانات</th>
                            <th style="padding:10px; background:#f0fdf4; color:#166534; font-weight:800;">إجمالي المبيعات</th>
                            <th style="padding:10px;">استهلاك مجاني</th>
                            <th style="padding:10px; text-align:center; width:90px;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredPorts.map((p, i) => `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:8px 10px; text-align:center; color:#64748b;">${i + 1}</td>
                                <td style="padding:8px 10px;">
                                    <b>${this.escape(p.router_name)}</b>
                                    <div style="font-size:11px; color:#64748b; font-family:monospace;">${this.escape(p.nasipaddress)}</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    <span class="badge" style="background:#4a69bd; color:#fff; padding:4px 9px; border-radius:5px; font-weight:700; font-size:11.5px;">🔌 ${this.escape(p.port_id)}</span>
                                </td>
                                <td style="padding:8px 10px;">
                                    ${p.node_name && p.node_id ? `
                                        <div style="font-weight:700; color:#0f172a;">📍 ${this.escape(p.node_name)}</div>
                                        ${nodeTypeBadges[p.node_type] || ''}
                                    ` : '<span style="color:#94a3b8; font-size:11px;">منفذ عام / غير مربوط</span>'}
                                </td>
                                <td style="padding:8px 10px;">
                                    <div style="font-size:11.5px; color:#334155;">👤 ${this.escape(p.responsible_display || 'إدارة الشبكة')}</div>
                                </td>
                                <td style="padding:8px 10px; text-align:center; font-weight:700;">${p.total_sessions || 0}</td>
                                <td style="padding:8px 10px; text-align:center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${p.unique_users || 0}</span></td>
                                <td style="padding:8px 10px; font-size:11px;">
                                    <div style="color:#059669;">⬇️ ${App.formatBytes((p.download_mb || 0) * 1024 * 1024)}</div>
                                    <div style="color:#d97706;">⬆️ ${App.formatBytes((p.upload_mb || 0) * 1024 * 1024)}</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:12.5px; color:#1e293b;">${App.formatBytes(p.total_bytes || 0)}</b>
                                    <div style="font-size:10.5px; color:#64748b;">${(p.total_mb || 0).toLocaleString()} MB</div>
                                </td>
                                <td style="padding:8px 10px; background:#f0fdf4;">
                                    <b style="color:#15803d; font-size:13.5px;">${App.formatMoney(p.total_sales || 0)}</b>
                                    <div style="font-size:10px; color:#16a34a;">${(p.comm_mb || 0).toLocaleString()} MB مدفوع</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    ${(p.free_mb > 0 || p.free_sessions > 0) ? `
                                        <div style="color:#7c3aed; font-weight:600;">🎁 ${(p.free_mb || 0).toLocaleString()} MB</div>
                                        <div style="font-size:10.5px; color:#64748b;">${p.free_sessions || 0} جلسة مجانية</div>
                                    ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
                                </td>
                                <td style="padding:8px 10px; text-align:center; white-space:nowrap;">
                                    <button class="mt-btn mt-btn-primary" style="padding:4px 8px; font-size:11px; font-weight:700;" onclick="App.showNodePortDetailModal('${p.nasipaddress}', '${p.port_id}', ${p.node_id || 0})" title="فحص جلسات واستهلاك المنفذ">🔍 فحص</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${filteredPorts.length === 0 ? `
                            <tr><td colspan="12" style="text-align:center; padding:40px; color:#94a3b8;">لا توجد منافذ مسجلة مطابقة لمعايير البحث</td></tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `;

        const renderRoutersTable = () => `
            <div class="mt-table-container" style="background:#fff; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#334155;">
                            <th style="padding:10px; width:45px; text-align:center;">#</th>
                            <th style="padding:10px;">اسم الراوتر (Router NAS)</th>
                            <th style="padding:10px;">عنوان IP</th>
                            <th style="padding:10px; text-align:center;">المنافذ النشطة</th>
                            <th style="padding:10px; text-align:center;">الجلسات</th>
                            <th style="padding:10px; text-align:center;">المشتركين</th>
                            <th style="padding:10px;">التنزيل / الرفع</th>
                            <th style="padding:10px;">إجمالي البيانات</th>
                            <th style="padding:10px; background:#f0fdf4; color:#166534; font-weight:800;">إجمالي المبيعات</th>
                            <th style="padding:10px;">استهلاك مجاني</th>
                            <th style="padding:10px; text-align:center; width:90px;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredRouters.map((r, i) => `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:8px 10px; text-align:center; color:#64748b;">${i + 1}</td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:13px; color:#0f172a;">📡 ${this.escape(r.router_name)}</b>
                                </td>
                                <td style="padding:8px 10px; font-family:monospace; font-weight:600; color:#0284c7;">
                                    ${this.escape(r.nasipaddress)}
                                </td>
                                <td style="padding:8px 10px; text-align:center;">
                                    <span class="badge" style="background:#8e44ad; color:#fff; padding:3px 9px; border-radius:4px; font-weight:700;">${r.active_ports || 0} منافذ</span>
                                </td>
                                <td style="padding:8px 10px; text-align:center; font-weight:700;">${r.total_sessions || 0}</td>
                                <td style="padding:8px 10px; text-align:center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${r.unique_users || 0}</span></td>
                                <td style="padding:8px 10px; font-size:11px;">
                                    <div style="color:#059669;">⬇️ ${App.formatBytes((r.download_mb || 0) * 1024 * 1024)}</div>
                                    <div style="color:#d97706;">⬆️ ${App.formatBytes((r.upload_mb || 0) * 1024 * 1024)}</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:12.5px; color:#1e293b;">${App.formatBytes(r.total_bytes || 0)}</b>
                                    <div style="font-size:10.5px; color:#64748b;">${(r.total_mb || 0).toLocaleString()} MB</div>
                                </td>
                                <td style="padding:8px 10px; background:#f0fdf4;">
                                    <b style="color:#15803d; font-size:14px;">${App.formatMoney(r.total_sales || 0)}</b>
                                    <div style="font-size:10px; color:#16a34a;">${(r.comm_mb || 0).toLocaleString()} MB مدفوع</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    ${(r.free_mb > 0 || r.free_sessions > 0) ? `
                                        <div style="color:#7c3aed; font-weight:600;">🎁 ${(r.free_mb || 0).toLocaleString()} MB</div>
                                        <div style="font-size:10.5px; color:#64748b;">${r.free_sessions || 0} جلسة مجانية</div>
                                    ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
                                </td>
                                <td style="padding:8px 10px; text-align:center; white-space:nowrap;">
                                    <button class="mt-btn mt-btn-primary" style="padding:4px 8px; font-size:11px; font-weight:700;" onclick="App.portAnalyticsRouter='${r.nasipaddress}'; App.portAnalyticsViewMode='ports'; App.renderPortAnalytics();" title="عرض منافذ هذا الراوتر">🔌 المنافذ</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${filteredRouters.length === 0 ? `
                            <tr><td colspan="11" style="text-align:center; padding:40px; color:#94a3b8;">لا توجد راوترات مسجلة</td></tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `;

        const renderDailyTable = () => `
            <div class="mt-table-container" style="background:#fff; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#334155;">
                            <th style="padding:10px; width:45px; text-align:center;">#</th>
                            <th style="padding:10px;">التاريخ (اليوم)</th>
                            <th style="padding:10px; text-align:center;">الجلسات اليومية</th>
                            <th style="padding:10px; text-align:center;">المشتركين الفريدين</th>
                            <th style="padding:10px;">التنزيل / الرفع</th>
                            <th style="padding:10px;">إجمالي استهلاك البيانات</th>
                            <th style="padding:10px; background:#f0fdf4; color:#166534; font-weight:800;">مبيعات اليوم المحققة</th>
                            <th style="padding:10px;">استهلاك الكروت المجانية</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${daily.map((d, i) => `
                            <tr style="border-bottom:1px solid #f1f5f9;">
                                <td style="padding:8px 10px; text-align:center; color:#64748b;">${i + 1}</td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:13px; color:#0f172a;">📅 ${d.day_date}</b>
                                </td>
                                <td style="padding:8px 10px; text-align:center; font-weight:700;">${d.total_sessions || 0}</td>
                                <td style="padding:8px 10px; text-align:center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${d.unique_users || 0}</span></td>
                                <td style="padding:8px 10px; font-size:11px;">
                                    <div style="color:#059669;">⬇️ ${App.formatBytes((d.download_mb || 0) * 1024 * 1024)}</div>
                                    <div style="color:#d97706;">⬆️ ${App.formatBytes((d.upload_mb || 0) * 1024 * 1024)}</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    <b style="font-size:12.5px; color:#1e293b;">${App.formatBytes((d.total_mb || 0) * 1024 * 1024)}</b>
                                    <div style="font-size:10.5px; color:#64748b;">${(d.total_mb || 0).toLocaleString()} MB</div>
                                </td>
                                <td style="padding:8px 10px; background:#f0fdf4;">
                                    <b style="color:#15803d; font-size:14px;">${App.formatMoney(d.total_sales || 0)}</b>
                                    <div style="font-size:10px; color:#16a34a;">${(d.comm_mb || 0).toLocaleString()} MB مدفوع</div>
                                </td>
                                <td style="padding:8px 10px;">
                                    ${(d.free_mb > 0 || d.free_sessions > 0) ? `
                                        <div style="color:#7c3aed; font-weight:600;">🎁 ${(d.free_mb || 0).toLocaleString()} MB</div>
                                        <div style="font-size:10.5px; color:#64748b;">${d.free_sessions || 0} جلسة مجانية</div>
                                    ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
                                </td>
                            </tr>
                        `).join('')}
                        ${daily.length === 0 ? `
                            <tr><td colspan="8" style="text-align:center; padding:40px; color:#94a3b8;">لا توجد سجلات يومية في هذه الفترة</td></tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `;

        const viewTitles = {
            nodes: '🌳 تقرير مبيعات واستهلاك هيكل الشبكة والنقاط والأبراج',
            ports: '🔌 تقرير مبيعات واستهلاك منافذ الشبكة (NAS-Port-Id)',
            routers: '📡 تقرير ملخص مبيعات واستهلاك راوترات الميكروتك (Routers)',
            daily: '📅 التحليل الزمني اليومي للمبيعات والاستهلاك (Daily Timeline)'
        };

        const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px;">
            
            <!-- Filters & Controls Bar -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:12px;">
                
                <!-- Row 1: View Modes & Quick Presets -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="display:inline-flex; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;">
                        <button class="mt-btn ${this.portAnalyticsViewMode==='nodes'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:6px 14px; font-size:12px; font-weight:700;" onclick="App.portAnalyticsViewMode='nodes'; App.renderPortAnalytics();">🌳 هيكل الشبكة والنقاط</button>
                        <button class="mt-btn ${this.portAnalyticsViewMode==='ports'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:6px 14px; font-size:12px; font-weight:700;" onclick="App.portAnalyticsViewMode='ports'; App.renderPortAnalytics();">🔌 المنافذ (Ports)</button>
                        <button class="mt-btn ${this.portAnalyticsViewMode==='routers'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:6px 14px; font-size:12px; font-weight:700;" onclick="App.portAnalyticsViewMode='routers'; App.renderPortAnalytics();">📡 الراوترات (Routers)</button>
                        <button class="mt-btn ${this.portAnalyticsViewMode==='daily'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:6px 14px; font-size:12px; font-weight:700;" onclick="App.portAnalyticsViewMode='daily'; App.renderPortAnalytics();">📅 التقرير اليومي</button>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button class="mt-btn mt-btn-success" style="padding:6px 12px; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:5px;" onclick="App.printPortTopologyReport()">🖨️ طباعة التقرير</button>
                        <button class="mt-btn" style="background:#0284c7; color:#fff; padding:6px 12px; font-weight:700; font-size:12px;" onclick="App.exportPortTopologyCSV()">📤 تصدير CSV</button>
                        <button class="mt-btn" style="padding:6px 12px; font-size:12px;" onclick="App.renderPortAnalytics()">⟳ ${this.t('refresh')}</button>
                    </div>
                </div>

                <!-- Row 2: Advanced Dropdowns, Custom Date Pickers, and Search -->
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-top:10px; border-top:1px solid #f1f5f9;">
                    
                    <!-- Search Input -->
                    <div style="flex:1; min-width:200px;">
                        <input type="text" class="mt-input" placeholder="🔍 بحث بالنقطة، الراوتر، المنفذ، المسؤول..." value="${this.escape(this.portAnalyticsSearch)}" onchange="App.portAnalyticsSearch=this.value; App.renderPortAnalytics();" onkeyup="if(event.key==='Enter'){ App.portAnalyticsSearch=this.value; App.renderPortAnalytics(); }" style="width:100%; font-size:11.5px; height:34px;" />
                    </div>

                    <!-- Period Presets -->
                    <select class="mt-select" style="font-size:11.5px; height:34px; min-width:140px;" onchange="App.portAnalyticsPeriod=this.value; if(this.value!=='custom'){ App.portAnalyticsDateFrom=''; App.portAnalyticsDateTo=''; } App.renderPortAnalytics();">
                        <option value="all" ${this.portAnalyticsPeriod==='all'?'selected':''}>🌐 كل الفترات (All Time)</option>
                        <option value="today" ${this.portAnalyticsPeriod==='today'?'selected':''}>📅 اليوم (Today)</option>
                        <option value="yesterday" ${this.portAnalyticsPeriod==='yesterday'?'selected':''}>⏮️ أمس (Yesterday)</option>
                        <option value="week" ${this.portAnalyticsPeriod==='week'?'selected':''}>🗓️ آخر 7 أيام (Last 7 Days)</option>
                        <option value="this_month" ${this.portAnalyticsPeriod==='this_month'?'selected':''}>📊 هذا الشهر (This Month)</option>
                        <option value="month" ${this.portAnalyticsPeriod==='month'?'selected':''}>📈 آخر 30 يوم (Last 30 Days)</option>
                        <option value="last_month" ${this.portAnalyticsPeriod==='last_month'?'selected':''}>📉 الشهر الماضي (Last Month)</option>
                        <option value="custom" ${this.portAnalyticsPeriod==='custom'?'selected':''}>📆 فترة مخصصة (Custom Range)</option>
                    </select>

                    <!-- Date From & To Pickers -->
                    <div style="display:inline-flex; align-items:center; gap:4px; background:#f8fafc; padding:3px 8px; border-radius:6px; border:1px solid #cbd5e1;">
                        <span style="font-size:11px; color:#475569; font-weight:700;">من:</span>
                        <input type="date" class="mt-input" id="pa-date-from" value="${this.escape(this.portAnalyticsDateFrom)}" onchange="App.portAnalyticsDateFrom=this.value; App.portAnalyticsPeriod='custom'; App.renderPortAnalytics();" style="font-size:11px; padding:2px 6px; height:28px; width:125px;" />
                        <span style="font-size:11px; color:#475569; font-weight:700;">إلى:</span>
                        <input type="date" class="mt-input" id="pa-date-to" value="${this.escape(this.portAnalyticsDateTo)}" onchange="App.portAnalyticsDateTo=this.value; App.portAnalyticsPeriod='custom'; App.renderPortAnalytics();" style="font-size:11px; padding:2px 6px; height:28px; width:125px;" />
                    </div>

                    <!-- Router Filter -->
                    <select class="mt-select" style="font-size:11.5px; height:34px; max-width:160px;" onchange="App.portAnalyticsRouter=this.value; App.renderPortAnalytics();">
                        <option value="">كل الراوترات</option>
                        ${nasList.map(r => `<option value="${r.nasname}" ${this.portAnalyticsRouter===r.nasname?'selected':''}>📡 ${this.escape(r.shortname || r.nasname)}</option>`).join('')}
                    </select>

                    <!-- Node Filter -->
                    <select class="mt-select" style="font-size:11.5px; height:34px; max-width:160px;" onchange="App.portAnalyticsNode=this.value; App.renderPortAnalytics();">
                        <option value="">كل النقاط والأبراج</option>
                        ${allNodesList.map(n => `<option value="${n.id}" ${Number(this.portAnalyticsNode)===Number(n.id)?'selected':''}>📍 ${this.escape(n.node_name)}</option>`).join('')}
                    </select>

                    <!-- Node Type Filter -->
                    <select class="mt-select" style="font-size:11.5px; height:34px;" onchange="App.portAnalyticsNodeType=this.value; App.renderPortAnalytics();">
                        <option value="">كل أنواع النقاط</option>
                        <option value="main_node" ${this.portAnalyticsNodeType==='main_node'?'selected':''}>⭐ رئيسية / أبراج</option>
                        <option value="sub_node" ${this.portAnalyticsNodeType==='sub_node'?'selected':''}>↳ فرعية</option>
                        <option value="regular" ${this.portAnalyticsNodeType==='regular'?'selected':''}>📍 عادية</option>
                    </select>

                    ${isFiltered ? `
                        <button class="mt-btn mt-btn-danger" style="padding:4px 9px; font-size:11px; height:34px;" onclick="App.portAnalyticsPeriod='all'; App.portAnalyticsDateFrom=''; App.portAnalyticsDateTo=''; App.portAnalyticsRouter=''; App.portAnalyticsNode=''; App.portAnalyticsPort=''; App.portAnalyticsNodeType=''; App.portAnalyticsSearch=''; App.renderPortAnalytics();" title="إلغاء كل الفلاتر وتفريغ البحث">✕ تفريغ</button>
                    ` : ''}

                </div>
            </div>

            <!-- KPI Cards -->
            <div class="kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
                <div class="kpi-card" style="border-right:4px solid #16a34a; background:#fff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
                    <div class="kpi-icon" style="background:#dcfce7; color:#16a34a; font-size:24px; width:44px; height:44px; border-radius:8px; display:flex; align-items:center; justify-content:center;">💰</div>
                    <div>
                        <div class="kpi-val" style="font-size:18px; font-weight:800; color:#15803d;">${App.formatMoney(summary.total_sales || 0)}</div>
                        <div class="kpi-lbl" style="font-size:11px; color:#64748b;">إجمالي المبيعات المحققة</div>
                    </div>
                </div>

                <div class="kpi-card" style="border-right:4px solid #0284c7; background:#fff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7; font-size:24px; width:44px; height:44px; border-radius:8px; display:flex; align-items:center; justify-content:center;">📶</div>
                    <div>
                        <div class="kpi-val" style="font-size:18px; font-weight:800; color:#0369a1;">${App.formatBytes(summary.total_bytes || 0)}</div>
                        <div class="kpi-lbl" style="font-size:11px; color:#64748b;">إجمالي استهلاك البيانات (رفع وتنزيل)</div>
                    </div>
                </div>

                <div class="kpi-card" style="border-right:4px solid #7c3aed; background:#fff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
                    <div class="kpi-icon" style="background:#f3e8ff; color:#7c3aed; font-size:24px; width:44px; height:44px; border-radius:8px; display:flex; align-items:center; justify-content:center;">⚡</div>
                    <div>
                        <div class="kpi-val" style="font-size:18px; font-weight:800; color:#6d28d9;">${summary.total_sessions || 0} <small style="font-size:11px; color:#64748b;">جلسة (${summary.unique_users || 0} مشترك)</small></div>
                        <div class="kpi-lbl" style="font-size:11px; color:#64748b;">حجم الجلسات والمشتركين النشطين</div>
                    </div>
                </div>

                <div class="kpi-card" style="border-right:4px solid #ea580c; background:#fff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
                    <div class="kpi-icon" style="background:#ffedd5; color:#ea580c; font-size:24px; width:44px; height:44px; border-radius:8px; display:flex; align-items:center; justify-content:center;">🎁</div>
                    <div>
                        <div class="kpi-val" style="font-size:18px; font-weight:800; color:#c2410c;">${(summary.free_mb || 0).toLocaleString()} <small style="font-size:11px; color:#64748b;">MB</small></div>
                        <div class="kpi-lbl" style="font-size:11px; color:#64748b;">استهلاك الكروت المجانية والـ VIP</div>
                    </div>
                </div>

                <div class="kpi-card" style="border-right:4px solid #475569; background:#fff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px;">
                    <div class="kpi-icon" style="background:#f1f5f9; color:#475569; font-size:24px; width:44px; height:44px; border-radius:8px; display:flex; align-items:center; justify-content:center;">🌳</div>
                    <div>
                        <div class="kpi-val" style="font-size:18px; font-weight:800; color:#1e293b;">${summary.nodes_count || 0} <small style="font-size:11px; color:#64748b;">نقطة (${summary.active_ports_count || 0} منفذ)</small></div>
                        <div class="kpi-lbl" style="font-size:11px; color:#64748b;">النقاط والأبراج النشطة</div>
                    </div>
                </div>
            </div>

            <!-- Main Table Section -->
            <section style="background:#fff; border-radius:10px; border:1px solid #e2e8f0; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div style="font-weight:800; font-size:15px; color:#1e293b;">
                        ${viewTitles[this.portAnalyticsViewMode] || viewTitles.nodes}
                    </div>
                    <div style="font-size:12px; color:#64748b;">
                        ${this.portAnalyticsDateFrom && this.portAnalyticsDateTo ? `الفترة: من <b>${this.escape(this.portAnalyticsDateFrom)}</b> إلى <b>${this.escape(this.portAnalyticsDateTo)}</b>` : `الفترة المحددة: <b>${this.portAnalyticsPeriod}</b>`}
                    </div>
                </div>

                ${this.portAnalyticsViewMode === 'nodes' ? renderNodesTable() : ''}
                ${this.portAnalyticsViewMode === 'ports' ? renderPortsTable() : ''}
                ${this.portAnalyticsViewMode === 'routers' ? renderRoutersTable() : ''}
                ${this.portAnalyticsViewMode === 'daily' ? renderDailyTable() : ''}
            </section>

        </div>`;

        const shellOpts = {
            id: 'port-analytics',
            archetype: 'dashboard',
            icon: '📊',
            title: 'تقارير مبيعات واستهلاك منافذ الشبكة والراوترات',
            eyebrow: 'تحليل حركة البيانات وهيكل الشبكة',
            subtitle: `المبيعات الإجمالية: ${App.formatMoney(summary.total_sales || 0)} | البيانات: ${App.formatBytes(summary.total_bytes || 0)} | النقاط: ${summary.nodes_count || 0}`,
            actions: [
                { label: '🖨️ طباعة التقرير', icon: '🖨️', variant: 'primary', onclick: `App.printPortTopologyReport()` },
                { label: this.t('refresh'), icon: '🔄', variant: 'secondary', onclick: `App.renderPortAnalytics()` }
            ],
            toolbar: {
                left: [
                    `<span class="status-pill status-online" style="margin-left:6px;">🌳 النقاط: ${summary.nodes_count || 0}</span>`,
                    `<span class="status-pill status-online">⚡ المنافذ: ${summary.active_ports_count || 0}</span>`
                ],
                right: []
            },
            content: contentHtml
        };

        if (window.SamUI?.PageBuilder) {
            view.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            view.innerHTML = `
            <div class="mt-toolbar" style="flex-wrap:wrap; gap:10px;">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700; font-size:15px;">📊 تقارير مبيعات واستهلاك منافذ الشبكة وهيكل الأبراج</span>
                    <span class="status-pill status-online">🌳 النقاط: ${summary.nodes_count || 0}</span>
                    <span class="status-pill status-online">⚡ المنافذ: ${summary.active_ports_count || 0}</span>
                    <button class="mt-btn" onclick="App.renderPortAnalytics()">⟳ ${this.t('refresh')}</button>
                </div>
            </div>
            <div style="padding:15px;">${contentHtml}</div>`;
        }
    },

    // ==========================================
    // METHOD: showNodePortDetailModal (Drilldown)
    // ==========================================
    async showNodePortDetailModal(nasIp, portId, nodeId = 0) {
        this.loading(true);
        let res;
        try {
            res = await this.api('get_node_detail_report', {
                nas: nasIp,
                port: portId,
                node_id: nodeId,
                period: this.portAnalyticsPeriod || 'all',
                date_from: this.portAnalyticsDateFrom || '',
                date_to: this.portAnalyticsDateTo || ''
            });
        } catch (err) {
            this.loading(false);
            return this.toast('تعذر جلب تفاصيل النقطة: ' + (err.message || err), 'danger');
        }
        this.loading(false);

        const data = res?.data || res || {};
        const sessions = data.sessions || [];
        const assets = data.assets || [];
        const nodes = data.nodes || [];
        const summary = data.summary || {};
        const nodeInfo = data.node_info || (nodes.length > 0 ? nodes[0] : null);

        const modalId = 'app-node-port-detail-modal';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const modalHtml = `
        <div class="mt-modal-backdrop" id="${modalId}" style="z-index:10080; background:rgba(15,23,42,0.65); backdrop-filter:blur(3px); animation:fadeIn .15s ease-out;">
            <div class="mt-modal" style="width:900px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column; border-radius:12px; overflow:hidden; box-shadow:0 25px 60px rgba(0,0,0,0.4); animation:scaleUp .18s ease-out; background:#fff;">
                
                <!-- Modal Header -->
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                    <div>
                        <div style="font-weight:800; font-size:16px; display:flex; align-items:center; gap:8px;">
                            <span>🔍 تفاصيل واستهلاك:</span>
                            <span style="color:#38bdf8;">${this.escape(nodeInfo ? (nodeInfo.display_name || nodeInfo.node_name) : (portId || 'المنفذ العام'))}</span>
                        </div>
                        <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
                            الراوتر: <b>${this.escape(nasIp || 'عام')}</b> | المنفذ: <b>${this.escape(portId || 'الرئيسي')}</b> | المسؤول: <b>${this.escape(nodeInfo?.responsible_fullname || nodeInfo?.responsible_name || 'إدارة الشبكة')}</b>
                        </div>
                    </div>
                    <span style="cursor:pointer; font-size:20px; font-weight:700; color:#94a3b8;" onclick="document.getElementById('${modalId}').remove()">✕</span>
                </div>

                <!-- Modal Body -->
                <div class="mt-modal-body" style="padding:18px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
                    
                    <!-- KPI Summary -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px;">
                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:11px; color:#166534; font-weight:600;">المبيعات المحققة</div>
                            <div style="font-size:16px; font-weight:800; color:#15803d; margin-top:2px;">${App.formatMoney(summary.commercial_sales || 0)}</div>
                        </div>
                        <div style="background:#e0f2fe; border:1px solid #bae6fd; padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:11px; color:#0369a1; font-weight:600;">إجمالي البيانات</div>
                            <div style="font-size:16px; font-weight:800; color:#0284c7; margin-top:2px;">${(summary.total_mb || 0).toLocaleString()} MB</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:11px; color:#475569; font-weight:600;">عدد الجلسات</div>
                            <div style="font-size:16px; font-weight:800; color:#1e293b; margin-top:2px;">${summary.total_sessions || 0}</div>
                        </div>
                        <div style="background:#f3e8ff; border:1px solid #e9d5ff; padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:11px; color:#6d28d9; font-weight:600;">استهلاك مجاني</div>
                            <div style="font-size:16px; font-weight:800; color:#7c3aed; margin-top:2px;">${(summary.free_mb || 0).toLocaleString()} MB</div>
                        </div>
                        <div style="background:#fef3c7; border:1px solid #fde68a; padding:10px; border-radius:8px; text-align:center;">
                            <div style="font-size:11px; color:#92400e; font-weight:600;">الأجهزة المثبتة</div>
                            <div style="font-size:16px; font-weight:800; color:#b45309; margin-top:2px;">${assets.length} جهاز</div>
                        </div>
                    </div>

                    <!-- Tabs Header -->
                    <div style="display:flex; border-bottom:2px solid #e2e8f0; gap:10px;">
                        <button class="mt-btn" id="npd-tab-btn-sessions" style="border:none; border-bottom:2px solid #0284c7; font-weight:700; border-radius:0; color:#0284c7;" onclick="document.querySelectorAll('.npd-tab-pane').forEach(el=>el.style.display='none'); document.querySelectorAll('#npd-tab-btn-sessions, #npd-tab-btn-assets, #npd-tab-btn-info').forEach(el=>{el.style.borderColor='transparent'; el.style.color='#64748b';}); this.style.borderColor='#0284c7'; this.style.color='#0284c7'; document.getElementById('npd-pane-sessions').style.display='block';">📋 سجل الجلسات الحديثة (${sessions.length})</button>
                        <button class="mt-btn" id="npd-tab-btn-assets" style="border:none; border-bottom:2px solid transparent; font-weight:700; border-radius:0; color:#64748b;" onclick="document.querySelectorAll('.npd-tab-pane').forEach(el=>el.style.display='none'); document.querySelectorAll('#npd-tab-btn-sessions, #npd-tab-btn-assets, #npd-tab-btn-info').forEach(el=>{el.style.borderColor='transparent'; el.style.color='#64748b';}); this.style.borderColor='#0284c7'; this.style.color='#0284c7'; document.getElementById('npd-pane-assets').style.display='block';">📦 الأجهزة والمعدات (${assets.length})</button>
                        <button class="mt-btn" id="npd-tab-btn-info" style="border:none; border-bottom:2px solid transparent; font-weight:700; border-radius:0; color:#64748b;" onclick="document.querySelectorAll('.npd-tab-pane').forEach(el=>el.style.display='none'); document.querySelectorAll('#npd-tab-btn-sessions, #npd-tab-btn-assets, #npd-tab-btn-info').forEach(el=>{el.style.borderColor='transparent'; el.style.color='#64748b';}); this.style.borderColor='#0284c7'; this.style.color='#0284c7'; document.getElementById('npd-pane-info').style.display='block';">ℹ️ بيانات النقطة والمشرف</button>
                    </div>

                    <!-- Tab 1: Sessions -->
                    <div class="npd-tab-pane" id="npd-pane-sessions">
                        <div class="mt-table-container" style="max-height:340px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
                            <table class="mt-table" style="width:100%; font-size:11.5px; border-collapse:collapse;">
                                <thead>
                                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; position:sticky; top:0; z-index:5;">
                                        <th style="padding:8px;">المستخدم (الكارت)</th>
                                        <th style="padding:8px;">نوع الكارت</th>
                                        <th style="padding:8px;">IP المشترك</th>
                                        <th style="padding:8px;">MAC المشترك</th>
                                        <th style="padding:8px;">التنزيل / الرفع</th>
                                        <th style="padding:8px;">إجمالي MB</th>
                                        <th style="padding:8px; background:#f0fdf4; color:#166534;">المبيعات</th>
                                        <th style="padding:8px;">وقت البدء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${sessions.map(s => `
                                        <tr style="border-bottom:1px solid #f1f5f9;">
                                            <td style="padding:6px 8px; font-weight:700; font-family:monospace; color:#0f172a;">${this.escape(s.username)}</td>
                                            <td style="padding:6px 8px;">
                                                ${s.is_free_quota == 1 ? '<span class="badge" style="background:#f3e8ff; color:#7c3aed; font-weight:700;">🎁 مجاني / VIP</span>' : '<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">💳 تجاري مدفوع</span>'}
                                            </td>
                                            <td style="padding:6px 8px; font-family:monospace; color:#0284c7;">${this.escape(s.framedipaddress || '-')}</td>
                                            <td style="padding:6px 8px; font-family:monospace; font-size:10.5px; direction:ltr; text-align:right;">${this.escape(s.callingstationid || '-')}</td>
                                            <td style="padding:6px 8px; font-size:11px;">
                                                <span style="color:#059669;">⬇️ ${(s.download_mb || 0)}M</span> / <span style="color:#d97706;">⬆️ ${(s.upload_mb || 0)}M</span>
                                            </td>
                                            <td style="padding:6px 8px; font-weight:700;">${(s.total_mb || 0)} MB</td>
                                            <td style="padding:6px 8px; background:#f0fdf4; font-weight:800; color:#15803d;">${App.formatMoney(s.calculated_sales || 0)}</td>
                                            <td style="padding:6px 8px; font-size:10.5px; color:#64748b;">${this.escape(s.acctstarttime || '-')}</td>
                                        </tr>
                                    `).join('')}
                                    ${sessions.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد جلسات مسجلة في هذه الفترة</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Tab 2: Assets -->
                    <div class="npd-tab-pane" id="npd-pane-assets" style="display:none;">
                        <div class="mt-table-container" style="max-height:340px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
                            <table class="mt-table" style="width:100%; font-size:11.5px; border-collapse:collapse;">
                                <thead>
                                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; position:sticky; top:0; z-index:5;">
                                        <th style="padding:8px;">كود الجهاز</th>
                                        <th style="padding:8px;">اسم الأصل / الجهاز</th>
                                        <th style="padding:8px;">التصنيف</th>
                                        <th style="padding:8px;">الموديل والماك</th>
                                        <th style="padding:8px;">الحالة</th>
                                        <th style="padding:8px;">المسؤول</th>
                                        <th style="padding:8px;">تكلفة الشراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${assets.map(a => `
                                        <tr style="border-bottom:1px solid #f1f5f9;">
                                            <td style="padding:6px 8px; font-family:monospace; font-weight:700;">${this.escape(a.asset_code || '-')}</td>
                                            <td style="padding:6px 8px; font-weight:700;">${this.escape(a.name)}</td>
                                            <td style="padding:6px 8px;">${this.escape(a.category)}</td>
                                            <td style="padding:6px 8px; font-family:monospace; font-size:11px;">
                                                <div>${this.escape(a.model || '-')}</div>
                                                <div style="color:#64748b; font-size:10px;">${this.escape(a.mac_address || '-')}</div>
                                            </td>
                                            <td style="padding:6px 8px;"><span class="status-pill status-${a.status}">${this.escape(a.status)}</span></td>
                                            <td style="padding:6px 8px;">${this.escape(a.responsible_display || '-')}</td>
                                            <td style="padding:6px 8px; font-weight:700;">${App.formatMoney(a.purchase_cost || 0)}</td>
                                        </tr>
                                    `).join('')}
                                    ${assets.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد معدات أو أصول مسجلة على هذه النقطة</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Tab 3: Node Info -->
                    <div class="npd-tab-pane" id="npd-pane-info" style="display:none;">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12.5px;">
                            <div>
                                <span style="color:#64748b;">اسم النقطة:</span> <b>${this.escape(nodeInfo?.node_name || 'المنفذ العام')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">نوع النقطة:</span> <b>${this.escape(nodeInfo?.node_type || 'regular')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">المشرف المسؤول:</span> <b>${this.escape(nodeInfo?.responsible_display || 'إدارة الشبكة')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">هاتف المشرف:</span> <b style="direction:ltr; display:inline-block;">${this.escape(nodeInfo?.responsible_phone_display || nodeInfo?.responsible_admin_phone || '-')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">الراوتر:</span> <b>${this.escape(nasIp || nodeInfo?.nas_ip || '-')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">المنفذ:</span> <b>${this.escape(portId || nodeInfo?.nas_port_id || 'default')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">الموقع الجغرافي:</span> <b>${this.escape(nodeInfo?.location || '-')}</b>
                            </div>
                            <div>
                                <span style="color:#64748b;">الإحداثيات:</span> <b>${this.escape(nodeInfo?.coordinates || '-')}</b>
                            </div>
                            ${nodeInfo?.notes ? `<div style="grid-column:1/-1; padding-top:6px; border-top:1px solid #e2e8f0;"><span style="color:#64748b;">ملاحظات:</span> ${this.escape(nodeInfo.notes)}</div>` : ''}
                        </div>
                    </div>

                </div>

                <!-- Modal Footer -->
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11.5px; color:#64748b;">تم جلب البيانات بنجاح</span>
                    <button type="button" class="mt-btn" onclick="document.getElementById('${modalId}').remove()" style="padding:6px 18px; font-weight:600;">إغلاق</button>
                </div>
            </div>
        </div>`;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
    },

    // ==========================================
    // METHOD: printPortTopologyReport
    // ==========================================
    printPortTopologyReport() {
        const data = this._lastPortAnalyticsData || {};
        const nodes = data.nodes || [];
        const ports = data.ports || [];
        const summary = data.summary || {};

        const filterDesc = this.portAnalyticsDateFrom && this.portAnalyticsDateTo 
            ? `الفترة المحددة: من ${this.portAnalyticsDateFrom} إلى ${this.portAnalyticsDateTo}`
            : `الفترة المحددة: ${this.portAnalyticsPeriod || 'كل الفترات'}`;

        const headers = ['#', 'النقطة / البرج', 'النوع', 'المسؤول', 'الراوتر والمنفذ', 'الجلسات', 'المشتركون', 'إجمالي البيانات', 'المبيعات المحققة', 'استهلاك مجاني'];
        const rowsHtml = nodes.map((n, i) => `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; font-weight:bold;">${this.escape(n.display_name || n.node_name)}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${this.escape(n.node_type)}</td>
                <td style="border:1px solid #cbd5e1; padding:6px;">${this.escape(n.responsible_display || 'إدارة الشبكة')}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; font-family:monospace;">${this.escape(n.nas_ip)} (${this.escape(n.nas_port_id || 'default')})</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center; font-weight:bold;">${n.total_sessions || 0}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; text-align:center;">${n.unique_users || 0}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; font-weight:bold;">${App.formatBytes(n.total_bytes || 0)}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; font-weight:bold; color:#15803d; background:#f0fdf4;">${App.formatMoney(n.total_sales || 0)}</td>
                <td style="border:1px solid #cbd5e1; padding:6px; color:#7c3aed;">${(n.free_mb || 0).toLocaleString()} MB</td>
            </tr>
        `).join('');

        const summarySub = `إجمالي المبيعات: ${App.formatMoney(summary.total_sales || 0)} | إجمالي استهلاك البيانات: ${App.formatBytes(summary.total_bytes || 0)} | الجلسات: ${summary.total_sessions || 0} | ${filterDesc}`;
        this.printUniversalReport('تقرير مبيعات واستهلاك هيكل الشبكة والمنافذ', headers, rowsHtml, summarySub);
    },

    // ==========================================
    // METHOD: exportPortTopologyCSV
    // ==========================================
    exportPortTopologyCSV() {
        const data = this._lastPortAnalyticsData || {};
        const nodes = data.nodes || [];
        if (!nodes.length) return this.toast('لا توجد بيانات شبكية للتصدير', 'warning');

        const headers = ['النقطة / البرج', 'نوع النقطة', 'المسؤول', 'الهاتف', 'الراوتر', 'المنفذ', 'الجلسات', 'المشتركون', 'التنزيل (MB)', 'الرفع (MB)', 'إجمالي البيانات (Bytes)', 'المبيعات المحققة', 'استهلاك مجاني (MB)', 'الأجهزة'];
        const rows = nodes.map(n => [
            n.display_name || n.node_name || '',
            n.node_type || '',
            n.responsible_display || '',
            n.responsible_phone_display || '',
            n.nas_ip || '',
            n.nas_port_id || '',
            n.total_sessions || 0,
            n.unique_users || 0,
            n.download_mb || 0,
            n.upload_mb || 0,
            n.total_bytes || 0,
            n.total_sales || 0,
            n.free_mb || 0,
            n.assets_count || 0
        ]);

        this.downloadExcelCSV(`Network_Topology_Sales_Report_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },


        showEditAssetModal(data) {
        return this.showAssetModal(data);
    },

        // ==========================================


    // ==========================================
    // SSTP SERVER & FAILOVER SETTINGS MODAL
    // ==========================================
    async openSstpServerSettingsModal() {
        const [serverVpnRes, sstpRes, umProxyRes, backupRadiusRes, routersRes] = await Promise.all([
            this.api('get_sstp_server_vpn_settings'),
            this.api('get_sstp_status'),
            this.api('get_um_proxy_settings'),
            this.api('get_backup_radius_settings'),
            this.api('get_routers')
        ]);

        const serverVpn = serverVpnRes?.data || {
            enabled: false,
            host: window.location.hostname,
            port: 4406,
            user: '',
            pass: '',
            comment: 'SSTP SERVER SAM'
        };

        const sstp = sstpRes?.data || sstpRes || {};
        const umProxy = umProxyRes?.data || umProxyRes || { enabled: false, ip: '', secret: '', authPort: 1812 };
        const backupRadius = backupRadiusRes?.data || backupRadiusRes || { enabled: false, router_id: 0 };
        const proxyRouters = Array.isArray(routersRes) ? routersRes : (routersRes?.routers || []);
        const selectedProxyRouterId = Number(umProxy.router_id || backupRadius.router_id || 0);

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="max-width:760px; width:95vw; max-height:92vh; display:flex; flex-direction:column;">
                <div class="mt-modal-header" style="background:#2563eb; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:18px;">⚙️</span>
                        <span style="font-weight:700; font-size:15px;">إعدادات خادم نفق SSTP VPN & Failover</span>
                    </div>
                    <button onclick="App.closeModal()" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">✕</button>
                </div>

                <div class="mt-modal-body" style="flex:1; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- Section 1: External SSTP Server / DDNS -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:18px;">🌐</span>
                                <b style="font-size:13px; color:#1e293b;">اتصال SSTP الخارجي عبر DDNS (اختياري)</b>
                            </div>
                            <label style="margin:0; font-size:12px; font-weight:700; color:#2563eb; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" id="modal-sstp-enabled" ${serverVpn.enabled ? 'checked' : ''} style="transform:scale(1.2);">
                                تفعيل الوصول العام فقط
                            </label>
                        </div>
                        <div style="font-size:11px; color:#64748b; margin-bottom:12px;">
                            هذا الاتصال العام غير مطلوب لربط RADIUS الداخلي، ولا يُضاف إلى سكربت الراوتر الداخلي إلا عند تفعيله صراحةً من مالك النظام.
                        </div>
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">عنوان السيرفر / الدومين (Host / DDNS):</label>
                                <input type="text" id="modal-sstp-host" class="mt-input" style="width:100%; direction:ltr; text-align:left; font-family:monospace;" value="${this.escape(serverVpn.host || window.location.hostname)}" placeholder="example.sn.mynetname.net" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">منفذ الاتصال الخارجي (Port):</label>
                                <input type="number" id="modal-sstp-port" class="mt-input" style="width:100%; font-family:monospace;" value="${serverVpn.port || 443}" min="1" max="65535" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">اسم مستخدم VPN (User):</label>
                                <input type="text" id="modal-sstp-user" class="mt-input" style="width:100%; font-family:monospace;" value="${this.escape(serverVpn.user || 'sam_server')}" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">كلمة مرور VPN (Password):</label>
                                <input type="password" id="modal-sstp-pass" class="mt-input" style="width:100%; font-family:monospace;" value="${this.escape(serverVpn.pass || '')}" />
                            </div>
                            <div style="grid-column:1/-1;">
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">تعليق واجهة النفق في المايكروتك (Comment):</label>
                                <input type="text" id="modal-sstp-comment" class="mt-input" style="width:100%;" value="${this.escape(serverVpn.comment || 'SSTP SERVER SAM')}" />
                            </div>
                        </div>
                    </div>

                    <!-- Section 2: Local accel-ppp SSTP Server Info -->
                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px;">
                        <div style="display:flex; align-items:center; gap:8px; border-bottom:1px solid #bae6fd; padding-bottom:8px; margin-bottom:10px;">
                            <span style="font-size:18px;">🔒</span>
                            <b style="font-size:13px; color:#0369a1;">معلومات خادم SSTP المحلي (accel-ppp Server)</b>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; font-size:12px;">
                            <div>المنفذ المحلي: <b style="color:#0369a1;">مُدار تلقائيًا من إعدادات النظام</b></div>
                            <div>دومين النظام الداخلي: <code>${this.escape(sstp.server_host || 'مُدار من إعدادات النظام')}</code></div>
                            <div>بوابة النفق (Gateway): <code>${sstp.vpn_gateway || '10.101.0.1'}</code></div>
                            <div>نطاق عناوين النفق: <code>${sstp.vpn_subnet || '10.101.0.0/24'}</code></div>
                        </div>
                    </div>

                    <!-- Section 3: Proxy Failover -->
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #bbf7d0; padding-bottom:8px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:18px;">🔄</span>
                                <div>
                                    <b style="font-size:13px; color:#15803d;">خادم User Manager الاحتياطي العام للنظام (Global Fallback)</b>
                                    <div style="font-size:11px; color:#64748b; font-weight:normal;">يُستخدم تلقائياً للراوترات التي لم يُحدد لها User Manager مخصص في بطاقة الراوتر.</div>
                                </div>
                            </div>
                            <label style="margin:0; font-size:12px; font-weight:700; color:#16a34a; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" id="modal-proxy-enabled" ${umProxy.enabled ? 'checked' : ''} style="transform:scale(1.2);">
                                تفعيل الاحتياطي العام
                            </label>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">راوتر User Manager الاحتياطي من الشبكة النشطة:</label>
                                <select id="modal-proxy-router-id" class="mt-input" style="width:100%;">
                                    <option value="">-- اختر راوترًا --</option>
                                    ${proxyRouters.map(r => `<option value="${r.id}" ${Number(r.id) === selectedProxyRouterId ? 'selected' : ''}>${this.escape(r.shortname || ('Router #' + r.id))}</option>`).join('')}
                                </select>
                            </div>
                            <div style="background:#f0fdf4;border:1px dashed #86efac;border-radius:6px;padding:10px;font-size:11px;color:#166534;line-height:1.7;">🔒 يُستخرج IP وRADIUS Secret تلقائيًا من الراوتر المختار.</div>
                        </div>
                    </div>

                </div>

                <div class="mt-modal-footer" style="padding:12px 18px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <button class="mt-btn" style="border:1px solid #dc2626; color:#dc2626;" onclick="App.restartSstp()">
                        ⟳ إعادة تشغيل خادم SSTP
                    </button>
                    <div style="display:flex; gap:8px;">
                        <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button class="mt-btn mt-btn-primary" style="background:#2563eb; border-color:#2563eb; font-weight:700; padding:6px 20px;" onclick="App.saveSstpServerSettingsFromModal()">
                            💾 حفظ وتطبيق الإعدادات
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    async saveSstpServerSettingsFromModal() {
        const sstpData = {
            enabled: document.getElementById('modal-sstp-enabled')?.checked ? 1 : 0,
            host: document.getElementById('modal-sstp-host')?.value?.trim() || '',
            port: parseInt(document.getElementById('modal-sstp-port')?.value) || 4406,
            user: document.getElementById('modal-sstp-user')?.value?.trim() || '',
            pass: document.getElementById('modal-sstp-pass')?.value?.trim() || '',
            comment: document.getElementById('modal-sstp-comment')?.value?.trim() || 'SSTP SERVER SAM'
        };

        const proxyData = {
            enabled: document.getElementById('modal-proxy-enabled')?.checked ? 1 : 0,
            router_id: Number(document.getElementById('modal-proxy-router-id')?.value || 0),
            auth_port: 1812,
            acct_port: 1813
        };
        const backupData = { ...proxyData };

        const [resSstp, resProxy, resBackup] = await Promise.all([
            this.api('save_sstp_server_vpn_settings', {}, 'POST', sstpData),
            this.api('save_um_proxy_settings', {}, 'POST', proxyData),
            this.api('save_backup_radius_settings', {}, 'POST', backupData)
        ]);

        if (resSstp && resSstp.success && resProxy?.success && resBackup?.success) {
            this.toast(resSstp.message || 'تم حفظ إعدادات السيرفر والنفق بنجاح', 'success');
            this.closeModal();
            this.renderSstpVpn();
        } else {
            this.toast(resSstp?.error || resProxy?.error || resBackup?.error || 'فشل حفظ الإعدادات', 'danger');
        }
    },

    // ==========================================
    // MULTI-SELECT & BULK ASSET PRICE EDITOR
    // ==========================================
    toggleAllAssetsCheckboxes(checked) {
        document.querySelectorAll('.asset-checkbox').forEach(cb => cb.checked = checked);
        this.onAssetCheckboxChange();
    },

    onAssetCheckboxChange() {
        const checkedBoxes = document.querySelectorAll('.asset-checkbox:checked');
        const count = checkedBoxes.length;
        const bar = document.getElementById('assets-floating-bar');
        const countEl = document.getElementById('assets-selected-count');
        if (countEl) countEl.innerText = count;
        if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
        const allBox = document.getElementById('select-all-assets');
        const allBoxes = document.querySelectorAll('.asset-checkbox');
        if (allBox && allBoxes.length > 0) {
            allBox.checked = count === allBoxes.length;
        }

        // Highlight selected rows
        document.querySelectorAll('.asset-checkbox').forEach(cb => {
            const tr = cb.closest('tr');
            if (tr) {
                if (cb.checked) {
                    tr.style.backgroundColor = '#f0f9ff';
                } else {
                    tr.style.backgroundColor = '';
                }
            }
        });
    },

    clearAssetSelection() {
        document.querySelectorAll('.asset-checkbox').forEach(cb => {
            cb.checked = false;
            const tr = cb.closest('tr');
            if (tr) tr.style.backgroundColor = '';
        });
        const allBox = document.getElementById('select-all-assets');
        if (allBox) allBox.checked = false;
        this.onAssetCheckboxChange();
    },

    getSelectedAssetIds() {
        return Array.from(document.querySelectorAll('.asset-checkbox:checked'))
            .map(cb => Number(cb.value))
            .filter(id => id > 0);
    },

    showBulkAssetPriceModal(targetIds = null) {
        let ids = targetIds;
        if (!ids || !ids.length) {
            ids = this.getSelectedAssetIds();
        }

        const allAssets = this.currentAssetsList || [];
        let itemsToEdit = [];

        if (ids && ids.length > 0) {
            const idSet = new Set(ids);
            itemsToEdit = allAssets.filter(a => idSet.has(Number(a.id)));
        } else {
            // If none selected, default to all current filtered assets
            itemsToEdit = allAssets;
        }

        if (itemsToEdit.length === 0) {
            this.toast('لا توجد أصناف / أصول محددة للتعديل', 'warning');
            return;
        }

        const catLabels = {
            routers: 'راوترات ميكروتك',
            servers: 'سيرفرات',
            antennas_dishes: 'أطباق وهوائيات',
            solar_batteries: 'طاقة وبطاريات',
            cables_fiber: 'كابلات وسويتشات',
            towers: 'أبراج',
            vehicles: 'مركبات',
            other: 'أخرى'
        };

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="max-width:960px; width:95vw; max-height:92vh; display:flex; flex-direction:column;">
                <div class="mt-modal-header" style="background:#7c3aed; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:18px;">🏷️</span>
                        <span style="font-weight:700; font-size:15px;">تعديل وتحديد أسعار الأصناف والأصول (${itemsToEdit.length} صنف)</span>
                    </div>
                    <button onclick="App.closeModal()" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">✕</button>
                </div>

                <div class="mt-modal-body" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:14px;">
                    <!-- Quick Batch Action Tools Box -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                        <div style="font-weight:700; font-size:12px; color:#334155; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                            <span>⚡ أدوات التحديد والتطبيق السريع على الكل:</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; font-size:12px;">
                            <div style="display:flex; gap:4px; align-items:center;">
                                <input type="number" id="bulk-uniform-cost" placeholder="سعر شراء موحد..." class="mt-input" style="flex:1; height:32px; font-size:12px;" min="0" step="any" />
                                <button class="mt-btn" style="background:#0284c7; color:#fff; height:32px; font-size:11px; font-weight:700;" onclick="App.applyBulkUniformCost()">تطبيق للكل</button>
                            </div>

                            <div style="display:flex; gap:4px; align-items:center;">
                                <input type="number" id="bulk-uniform-val" placeholder="قيمة تقديرية موحدة..." class="mt-input" style="flex:1; height:32px; font-size:12px;" min="0" step="any" />
                                <button class="mt-btn" style="background:#059669; color:#fff; height:32px; font-size:11px; font-weight:700;" onclick="App.applyBulkUniformVal()">تطبيق للكل</button>
                            </div>

                            <div style="display:flex; gap:4px; align-items:center;">
                                <button class="mt-btn" style="background:#475569; color:#fff; height:32px; font-size:11px; font-weight:700; width:100%; justify-content:center;" onclick="App.copyCostToValAll()">
                                    ⇄ نسخ الشراء إلى القيمة
                                </button>
                            </div>

                            <div style="display:flex; gap:4px; align-items:center;">
                                <input type="number" id="bulk-percent-adj" placeholder="نسبة تعديل ± %" class="mt-input" style="flex:1; height:32px; font-size:12px;" step="any" />
                                <button class="mt-btn" style="background:#d97706; color:#fff; height:32px; font-size:11px; font-weight:700;" onclick="App.applyBulkPercentAll()">تطبيق %</button>
                            </div>
                        </div>
                    </div>

                    <!-- Search filter inside modal -->
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <input type="text" placeholder="🔍 تصفية الأصناف في القائمة..." class="mt-input" style="max-width:280px; height:30px; font-size:11px;" oninput="App.filterBulkPriceTable(this.value)" />
                        <span style="font-size:11px; color:#64748b;">يمكنك تعديل سعر كل صنف بشكل فردي من الجدول مباشرة:</span>
                    </div>

                    <!-- Table of Assets to Edit -->
                    <div class="mt-table-container" style="max-height:46vh; border:1px solid #e2e8f0; border-radius:6px;">
                        <table class="mt-table" id="bulk-price-table" style="font-size:12px; width:100%;">
                            <thead style="position:sticky; top:0; background:#f1f5f9; z-index:5;">
                                <tr>
                                    <th style="width:36px; text-align:center;">#</th>
                                    <th>كود الأصل</th>
                                    <th>اسم الجهاز / الصنف</th>
                                    <th>التصنيف</th>
                                    <th>سعر الشراء الحالي</th>
                                    <th style="width:170px; background:#eff6ff;">سعر الشراء الجديد (${App.getCurrencySymbol(App._baseCurrency)})</th>
                                    <th style="width:170px; background:#f0fdf4;">القيمة التقديرية (${App.getCurrencySymbol(App._baseCurrency)})</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsToEdit.map((item, idx) => `
                                    <tr class="bulk-asset-row" data-id="${item.id}" data-orig-cost="${parseFloat(item.purchase_cost) || 0}">
                                        <td style="text-align:center;">${idx + 1}</td>
                                        <td><code>${this.escape(item.asset_code || `AST-${item.id}`)}</code></td>
                                        <td><b>${this.escape(item.name)}</b> ${item.model ? `<small style="color:#64748b;">(${this.escape(item.model)})</small>` : ''}</td>
                                        <td><span class="badge" style="background:#64748b; font-size:10px;">${this.escape(catLabels[item.category] || item.category)}</span></td>
                                        <td style="color:#64748b;">${App.formatMoney(item.purchase_cost)}</td>
                                        <td style="background:#eff6ff;">
                                            <input type="number" class="mt-input bulk-cost-input" data-id="${item.id}" value="${parseFloat(item.purchase_cost) || 0}" style="width:100%; height:30px; font-weight:700; color:#0284c7;" min="0" step="any" oninput="App.updateBulkPriceSummary()" />
                                        </td>
                                        <td style="background:#f0fdf4;">
                                            <input type="number" class="mt-input bulk-val-input" data-id="${item.id}" value="${parseFloat(item.current_value) || parseFloat(item.purchase_cost) || 0}" style="width:100%; height:30px; font-weight:700; color:#059669;" min="0" step="any" oninput="App.updateBulkPriceSummary()" />
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Live Financial Summary Card -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; font-size:12px;">
                        <div>
                            <span style="color:#64748b;">إجمالي التكلفة السابقة:</span>
                            <b id="bulk-summary-old-cost" style="color:#475569; margin-right:4px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                        </div>
                        <div>
                            <span style="color:#64748b;">إجمالي التكلفة الجديدة:</span>
                            <b id="bulk-summary-new-cost" style="color:#0284c7; margin-right:4px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                        </div>
                        <div>
                            <span style="color:#64748b;">إجمالي القيمة التقديرية:</span>
                            <b id="bulk-summary-new-val" style="color:#059669; margin-right:4px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                        </div>
                        <div>
                            <span style="color:#64748b;">الفارق المالي:</span>
                            <b id="bulk-summary-diff" style="margin-right:4px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                        </div>
                    </div>
                </div>

                <div class="mt-modal-footer" style="padding:12px 18px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <div style="font-size:11px; color:#64748b;">
                        سيتم تحديث التكلفة والقيمة مباشرة في قاعدة بيانات الأصول وحصص الشبكة المرتبطة
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button class="mt-btn mt-btn-primary" style="background:#7c3aed; border-color:#7c3aed; font-weight:700; padding:6px 18px;" onclick="App.saveBulkAssetPrices()">
                            💾 حفظ وتحديث أسعار الأصناف
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        this.updateBulkPriceSummary();
    },

    filterBulkPriceTable(query) {
        const q = (query || '').toLowerCase().trim();
        const rows = document.querySelectorAll('#bulk-price-table tbody tr');
        rows.forEach(tr => {
            const text = tr.innerText.toLowerCase();
            tr.style.display = text.includes(q) ? '' : 'none';
        });
    },

    applyBulkUniformCost() {
        const val = parseFloat(document.getElementById('bulk-uniform-cost')?.value);
        if (isNaN(val) || val < 0) {
            this.toast('يرجى إدخال سعر شراء صحيح', 'warning');
            return;
        }
        document.querySelectorAll('.bulk-cost-input').forEach(input => {
            input.value = val;
        });
        this.updateBulkPriceSummary();
        this.toast(`تم تعيين سعر الشراء (${val} YER) لجميع الأصناف`, 'success');
    },

    applyBulkUniformVal() {
        const val = parseFloat(document.getElementById('bulk-uniform-val')?.value);
        if (isNaN(val) || val < 0) {
            this.toast('يرجى إدخال قيمة تقديرية صحيحة', 'warning');
            return;
        }
        document.querySelectorAll('.bulk-val-input').forEach(input => {
            input.value = val;
        });
        this.updateBulkPriceSummary();
        this.toast(`تم تعيين القيمة التقديرية (${val} YER) لجميع الأصناف`, 'success');
    },

    copyCostToValAll() {
        document.querySelectorAll('.bulk-asset-row').forEach(row => {
            const costInput = row.querySelector('.bulk-cost-input');
            const valInput = row.querySelector('.bulk-val-input');
            if (costInput && valInput) {
                valInput.value = costInput.value;
            }
        });
        this.updateBulkPriceSummary();
        this.toast('تم نسخ سعر الشراء إلى القيمة التقديرية لجميع الأصناف', 'info');
    },

    applyBulkPercentAll() {
        const percent = parseFloat(document.getElementById('bulk-percent-adj')?.value);
        if (isNaN(percent) || percent === 0) {
            this.toast('يرجى إدخال نسبة مئوية صحيحة (مثال: 10 أو -5)', 'warning');
            return;
        }
        document.querySelectorAll('.bulk-cost-input').forEach(input => {
            const current = parseFloat(input.value) || 0;
            const updated = Math.max(0, current + (current * (percent / 100)));
            input.value = Math.round(updated * 100) / 100;
        });
        document.querySelectorAll('.bulk-val-input').forEach(input => {
            const current = parseFloat(input.value) || 0;
            const updated = Math.max(0, current + (current * (percent / 100)));
            input.value = Math.round(updated * 100) / 100;
        });
        this.updateBulkPriceSummary();
        this.toast(`تم تطبيق نسبة (${percent > 0 ? '+' : ''}${percent}%) على جميع الأسعار`, 'info');
    },

    updateBulkPriceSummary() {
        let totalOldCost = 0;
        let totalNewCost = 0;
        let totalNewVal = 0;

        document.querySelectorAll('.bulk-asset-row').forEach(row => {
            const orig = parseFloat(row.getAttribute('data-orig-cost')) || 0;
            const costInput = row.querySelector('.bulk-cost-input');
            const valInput = row.querySelector('.bulk-val-input');

            const newCost = costInput ? (parseFloat(costInput.value) || 0) : 0;
            const newVal = valInput ? (parseFloat(valInput.value) || 0) : 0;

            totalOldCost += orig;
            totalNewCost += newCost;
            totalNewVal += newVal;
        });

        const diff = totalNewCost - totalOldCost;
        const oldEl = document.getElementById('bulk-summary-old-cost');
        const newEl = document.getElementById('bulk-summary-new-cost');
        const valEl = document.getElementById('bulk-summary-new-val');
        const diffEl = document.getElementById('bulk-summary-diff');

        if (oldEl) oldEl.innerText = this.formatMoney(totalOldCost);
        if (newEl) newEl.innerText = this.formatMoney(totalNewCost);
        if (valEl) valEl.innerText = this.formatMoney(totalNewVal);
        if (diffEl) {
            diffEl.innerText = (diff >= 0 ? '+' : '') + this.formatMoney(diff);
            diffEl.style.color = diff > 0 ? '#16a34a' : (diff < 0 ? '#dc2626' : '#64748b');
        }
    },

    async saveBulkAssetPrices() {
        const rows = document.querySelectorAll('.bulk-asset-row');
        const items = [];

        rows.forEach(row => {
            const id = Number(row.getAttribute('data-id'));
            const costInput = row.querySelector('.bulk-cost-input');
            const valInput = row.querySelector('.bulk-val-input');

            if (id > 0 && costInput && valInput) {
                items.push({
                    id: id,
                    purchase_cost: parseFloat(costInput.value) || 0,
                    current_value: parseFloat(valInput.value) || 0
                });
            }
        });

        if (items.length === 0) {
            this.toast('لا توجد بيانات أصناف للحفظ', 'warning');
            return;
        }

        const res = await this.api('batch_update_asset_prices', {}, 'POST', { items: items });
        if (res && res.success) {
            this.toast(res.message || 'تم تحديث أسعار الأصناف بنجاح', 'success');
            this.closeModal();
            this.clearAssetSelection();
            this.renderAssets();
        } else {
            this.toast(res?.error || 'فشل تحديث أسعار الأصناف', 'danger');
        }
    },

    async deleteSelectedAssets() {
        const ids = this.getSelectedAssetIds();
        if (!ids || ids.length === 0) {
            this.toast('لم يتم تحديد أي أجهزة أو أصناف للحذف', 'warning');
            return;
        }

        if (!confirm(`هل أنت متأكد من رغبتك في حذف (${ids.length}) أصل / جهاز محدد نهائياً؟`)) {
            return;
        }

        const res = await this.api('batch_update_network_devices', {}, 'POST', {
            asset_ids: ids,
            updates: { bulk_delete: 1 }
        });

        if (res && res.success) {
            this.toast(res.message || `تم حذف ${ids.length} جهاز بنجاح`, 'success');
            this.clearAssetSelection();
            this.renderAssets();
        } else {
            this.toast(res?.error || 'فشل حذف الأجهزة المحددة', 'danger');
        }
    },

    // 5. NETWORK NODES & DETAILED CONNECTED DEVICES SUITE (TOPOLOGY & ASSETS)
    // ==========================================
    ndFilterState: {
        search_column: 'all',
        search_query: '',
        routers: [],
        ports: [],
        nodes: [],
        node_types: [],
        custodians: [],
        locations: [],
        platforms: [],
        statuses: [],
        date_from: '',
        date_to: '',
        is_duplicate_mac_only: false,
        group_by: 'flat'
    },
    ndSelectedIds: new Set(),
    ndCachedData: null,
    ndFilterOptions: null,
    ndRoutersList: [],
    ndAdminsList: [],
    ndNodesList: [],

    getVendorFromMac(mac) {
        if (!mac) return { name: '', badgeClass: '' };
        const clean = mac.replace(/[:-]/g, '').toUpperCase();
        if (clean.startsWith('488F5A') || clean.startsWith('6C3B6B') || clean.startsWith('744D28') || clean.startsWith('B869F4') || clean.startsWith('C4AD34') || clean.startsWith('DC2C6E') || clean.startsWith('E48D8C') || clean.startsWith('000C42') || clean.startsWith('18FD74') || clean.startsWith('2C12D5') || clean.startsWith('D401C3') || clean.startsWith('CC2DE0') || clean.startsWith('085531') || clean.startsWith('24F5A2') || clean.startsWith('48A98A') || clean.startsWith('64D154') || clean.startsWith('789A18') || clean.startsWith('B869F4') || clean.startsWith('C4AD34')) {
            return { name: 'MikroTik', badgeClass: 'badge-oui-mikrotik' };
        }
        if (clean.startsWith('002722') || clean.startsWith('0418D6') || clean.startsWith('24A43C') || clean.startsWith('68D79A') || clean.startsWith('788A20') || clean.startsWith('802AA8') || clean.startsWith('B4FBE4') || clean.startsWith('DC9FDB') || clean.startsWith('F09FC2') || clean.startsWith('44D9E7') || clean.startsWith('70A741') || clean.startsWith('AC8BA9') || clean.startsWith('00156D') || clean.startsWith('60E327') || clean.startsWith('F492BF')) {
            return { name: 'Ubiquiti', badgeClass: 'badge-oui-ubiquiti' };
        }
        if (clean.startsWith('50C7BF') || clean.startsWith('98DE04') || clean.startsWith('D84732') || clean.startsWith('E848B8') || clean.startsWith('14CC20') || clean.startsWith('30B5C2') || clean.startsWith('704F57') || clean.startsWith('C006C3')) {
            return { name: 'TP-Link', badgeClass: 'badge-oui-tplink' };
        }
        if (clean.startsWith('40A5EF') || clean.startsWith('00155D') || clean.startsWith('005056') || clean.startsWith('525400')) {
            return { name: 'Linux/Server', badgeClass: 'badge-oui-linux' };
        }
        return { name: '', badgeClass: '' };
    },

    formatLastSeen(dateStr) {
        if (!dateStr) return '<span style="color:#94a3b8; font-size:11px;">⚠️ لم يُفحص بعد</span>';
        try {
            const d = new Date(dateStr.replace(/-/g, '/'));
            if (isNaN(d.getTime())) return `<small style="color:#64748b;">${this.escape(dateStr)}</small>`;
            const now = new Date();
            const diffMin = Math.floor((now - d) / (1000 * 60));

            if (diffMin < 2) return '<span class="badge" style="background:#059669; color:#fff; font-size:10px;">🟢 الآن (متصل)</span>';
            if (diffMin < 60) return `<span style="color:#0284c7; font-weight:700; font-size:11px;">منذ ${diffMin} دقيقة</span>`;
            if (diffMin < 1440) {
                const hours = Math.floor(diffMin / 60);
                return `<span style="color:#334155; font-size:11px;">اليوم (${hours} ساعة مضت)</span>`;
            }
            return `<small style="color:#64748b; font-family:monospace;">${dateStr.substring(0, 16)}</small>`;
        } catch (e) {
            return `<small style="color:#64748b;">${this.escape(dateStr)}</small>`;
        }
    },

    async renderNetworkNodes() {
        const view = document.getElementById('main-view');
        if (!view) return;
        view.innerHTML = `<div style="padding:40px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل هيكلية نقاط الشبكة والأجهزة المتصلة...</div>`;

        // 1. Fetch initial data via POST payload to guarantee array preservation
        const [devicesRes, nodesRes, topoRes, routersRes, adminsRes, scanSettingsRes] = await Promise.all([
            this.api('get_network_devices_table', this.ndFilterState, 'POST'),
            this.api('get_network_nodes'),
            this.api('get_network_topology'),
            this.api('get_routers'),
            this.api('get_admins_with_roles'),
            this.api('get_neighbor_scan_settings')
        ]);

        this.ndCachedData = devicesRes || {};
        this.ndFilterOptions = devicesRes?.filter_options || {};
        this.ndNodesList = nodesRes?.nodes || [];
        this.ndRoutersList = routersRes?.data || routersRes || [];
        this.ndAdminsList = adminsRes?.admins || [];
        this.ndScanSettings = scanSettingsRes || {};
        this.ndTopology = topoRes?.topology || [];

        const summary = devicesRes?.summary || { total_devices: 0, active_devices: 0, maintenance_devices: 0, in_stock_devices: 0, damaged_devices: 0, duplicate_mac_count: 0 };
        const devices = devicesRes?.devices || [];
        const groups = devicesRes?.groups || [];

        const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px; min-height:fit-content;">

            <!-- Advanced Filter & Multi-Select Bar -->
            <section style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <!-- Row 1: Column Search & Quick Actions -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1;">
                        <span style="font-weight:700; font-size:13px; color:#1e293b;">🔍 البحث المخصص:</span>
                        <select id="nd-search-col" class="mt-select" style="font-size:12px; padding:5px 8px; font-weight:600;" onchange="App.onNdSearchColChange(this.value)">
                            <option value="all" ${this.ndFilterState.search_column === 'all' ? 'selected' : ''}>📋 كل الأعمدة (All Columns)</option>
                            <option value="identity" ${this.ndFilterState.search_column === 'identity' ? 'selected' : ''}>🏷️ اسم الجهاز / الهوية (Identity)</option>
                            <option value="mac" ${this.ndFilterState.search_column === 'mac' ? 'selected' : ''}>🔢 عنوان الماك (MAC)</option>
                            <option value="ip" ${this.ndFilterState.search_column === 'ip' ? 'selected' : ''}>🌐 عنوان IP</option>
                            <option value="port" ${this.ndFilterState.search_column === 'port' ? 'selected' : ''}>🔌 المنفذ / الواجهة (Port)</option>
                            <option value="location" ${this.ndFilterState.search_column === 'location' ? 'selected' : ''}>📍 الموقع الجغرافي (Location)</option>
                            <option value="version" ${this.ndFilterState.search_column === 'version' ? 'selected' : ''}>⚙️ إصدار النظام (OS Version)</option>
                            <option value="platform" ${this.ndFilterState.search_column === 'platform' ? 'selected' : ''}>📱 نوع الجهاز / المنصة (Platform)</option>
                            <option value="responsible" ${this.ndFilterState.search_column === 'responsible' ? 'selected' : ''}>👤 المستلم / المسؤول (Custodian)</option>
                            <option value="serial_number" ${this.ndFilterState.search_column === 'serial_number' ? 'selected' : ''}>🔖 الرقم التسلسلي / الكود (Serial)</option>
                        </select>
                        <div style="position:relative; flex:1; max-width:340px;">
                            <input type="text" id="nd-search-input" class="mt-input" placeholder="اكتب كلمة البحث هنا..." value="${this.escape(this.ndFilterState.search_query || '')}" style="width:100%; font-size:12px; padding:6px 10px;" oninput="App.onNdSearchInputChange(this.value)" />
                            ${this.ndFilterState.search_query ? `<button style="position:absolute; left:8px; top:6px; background:none; border:none; cursor:pointer; color:#94a3b8;" onclick="App.clearNdSearch()">✕</button>` : ''}
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button class="nd-filter-btn ${this.ndFilterState.is_duplicate_mac_only ? 'active' : ''}" style="${this.ndFilterState.is_duplicate_mac_only ? 'background:#fee2e2; color:#b91c1c; border-color:#f87171;' : ''}" onclick="App.toggleNdDuplicateMacOnly()">
                            ⚠️ الماك المكرر فقط (${summary.duplicate_mac_count})
                        </button>
                        <button class="mt-btn" style="padding:5px 12px; font-size:12px; background:#f1f5f9; color:#475569;" onclick="App.resetNdFilters()">
                            🔄 تفريغ الفلاتر
                        </button>
                    </div>
                </div>

                <!-- Row 2: Multi-Select Filter Badges & Dropdowns -->
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700; font-size:12px; color:#475569;">🎛️ تصفية متعددة:</span>

                    <!-- Filter: Routers -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.routers.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-routers')">
                            🌐 الراوتر ${this.ndFilterState.routers.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.routers.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-routers" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">اختر الراوترات المطلوبة:</div>
                            ${(this.ndFilterOptions.routers || []).map(r => `
                                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                    <input type="checkbox" ${this.ndFilterState.routers.includes(r) ? 'checked' : ''} onchange="App.onNdMultiFilterChange('routers', '${this.escape(r)}', this.checked)" />
                                    <span>${this.escape(r)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Filter: Ports -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.ports.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-ports')">
                            🔌 المنفذ ${this.ndFilterState.ports.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.ports.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-ports" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">اختر المنافذ المطلوبة:</div>
                            ${(this.ndFilterOptions.ports || []).map(p => `
                                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                    <input type="checkbox" ${this.ndFilterState.ports.includes(p) ? 'checked' : ''} onchange="App.onNdMultiFilterChange('ports', '${this.escape(p)}', this.checked)" />
                                    <code>${this.escape(p)}</code>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Filter: Nodes -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.nodes.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-nodes')">
                            🗼 النقطة ${this.ndFilterState.nodes.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.nodes.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-nodes" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">اختر النقاط المستهدفة:</div>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer; border-bottom:1px dashed #e2e8f0;">
                                <input type="checkbox" ${this.ndFilterState.nodes.includes('unassigned') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('nodes', 'unassigned', this.checked)" />
                                <span style="color:#ef4444; font-weight:bold;">⚠️ أجهزة غير مرتبطة بنقطة</span>
                            </label>
                            ${this.ndNodesList.map(n => `
                                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                    <input type="checkbox" ${this.ndFilterState.nodes.includes(String(n.id)) ? 'checked' : ''} onchange="App.onNdMultiFilterChange('nodes', '${n.id}', this.checked)" />
                                    <span>${n.node_type === 'main_node' ? '🗼' : '📡'} ${this.escape(n.node_name)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Filter: Custodians -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.custodians.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-custodians')">
                            👤 المستلم / المسؤول ${this.ndFilterState.custodians.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.custodians.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-custodians" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">المستلم / صاحب العهدة:</div>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer; border-bottom:1px dashed #e2e8f0;">
                                <input type="checkbox" ${this.ndFilterState.custodians.includes('unassigned') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('custodians', 'unassigned', this.checked)" />
                                <span style="color:#64748b; font-weight:bold;">📦 المخزن العام (بدون مستلم)</span>
                            </label>
                            ${this.ndAdminsList.map(a => `
                                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                    <input type="checkbox" ${this.ndFilterState.custodians.includes(String(a.id)) ? 'checked' : ''} onchange="App.onNdMultiFilterChange('custodians', '${a.id}', this.checked)" />
                                    <span>${this.escape(a.fullname)} (${this.escape(a.role_name_ar || a.role)})</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Filter: Platforms -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.platforms.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-platforms')">
                            📱 نوع الجهاز ${this.ndFilterState.platforms.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.platforms.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-platforms" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">نوع ومنصة الجهاز:</div>
                            ${(this.ndFilterOptions.platforms || []).map(p => `
                                <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                    <input type="checkbox" ${this.ndFilterState.platforms.includes(p) ? 'checked' : ''} onchange="App.onNdMultiFilterChange('platforms', '${this.escape(p)}', this.checked)" />
                                    <span>${this.escape(p)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Filter: Statuses -->
                    <div style="position:relative;">
                        <button class="nd-filter-btn ${this.ndFilterState.statuses.length > 0 ? 'active' : ''}" onclick="App.toggleNdDropdown('dropdown-nd-statuses')">
                            🏷️ الحالة ${this.ndFilterState.statuses.length > 0 ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.ndFilterState.statuses.length}</span>` : '▾'}
                        </button>
                        <div id="dropdown-nd-statuses" class="nd-multiselect-dropdown">
                            <div style="font-weight:700; font-size:11px; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">حالة الأجهزة:</div>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                <input type="checkbox" ${this.ndFilterState.statuses.includes('in_service') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('statuses', 'in_service', this.checked)" />
                                <span class="badge" style="background:#059669; color:#fff;">🟢 تعمل / بالخدمة (in_service)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                <input type="checkbox" ${this.ndFilterState.statuses.includes('maintenance') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('statuses', 'maintenance', this.checked)" />
                                <span class="badge" style="background:#f59e0b; color:#fff;">🟠 تحت الصيانة (maintenance)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                <input type="checkbox" ${this.ndFilterState.statuses.includes('in_stock') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('statuses', 'in_stock', this.checked)" />
                                <span class="badge" style="background:#8b5cf6; color:#fff;">📦 في المخزن (in_stock)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                <input type="checkbox" ${this.ndFilterState.statuses.includes('damaged') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('statuses', 'damaged', this.checked)" />
                                <span class="badge" style="background:#ef4444; color:#fff;">🔴 تالف / معطوب (damaged)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; cursor:pointer;">
                                <input type="checkbox" ${this.ndFilterState.statuses.includes('retired') ? 'checked' : ''} onchange="App.onNdMultiFilterChange('statuses', 'retired', this.checked)" />
                                <span class="badge" style="background:#64748b; color:#fff;">⚪ غير موجود / مفصول (retired)</span>
                            </label>
                        </div>
                    </div>

                    <!-- Filter: Date Range -->
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <input type="date" class="mt-input" style="font-size:11px; padding:4px 6px;" value="${this.ndFilterState.date_from || ''}" onchange="App.onNdDateChange('date_from', this.value)" title="من تاريخ آخر ظهور بالفحص" />
                        <span style="font-size:11px; color:#64748b;">إلى</span>
                        <input type="date" class="mt-input" style="font-size:11px; padding:4px 6px;" value="${this.ndFilterState.date_to || ''}" onchange="App.onNdDateChange('date_to', this.value)" title="إلى تاريخ آخر ظهور بالفحص" />
                    </div>
                </div>
            </section>

            <!-- Grouping & View Mode Tabs Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f1f5f9; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span style="font-weight:800; font-size:12px; color:#1e293b; margin-left:6px;">📊 نمط العرض والتجميع:</span>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'flat' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('flat')">
                        📋 جدول مسطح متكامل
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'tree' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('tree')">
                        🗺️ شجرة الاتصال الهرمية
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'router' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('router')">
                        📡 تجميع بالراوتر
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'port' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('port')">
                        🔌 تجميع بالمنفذ
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'node' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('node')">
                        🗼 تجميع بالنقطة
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'platform' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('platform')">
                        📱 تجميع بنوع الجهاز
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'status' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('status')">
                        🏷️ تجميع بالحالة
                    </button>
                    <button class="mt-btn ${this.ndFilterState.group_by === 'custodian' ? 'mt-btn-primary' : ''}" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.setNdGroupBy('custodian')">
                        👤 تجميع بالمستلم
                    </button>
                </div>
                <div style="font-size:12px; font-weight:800; color:#0f172a;">
                    المعروض: <b style="color:#0284c7; font-size:14px;">${devices.length}</b> جهاز
                </div>
            </div>

            <!-- Main Content Area based on View Mode -->
            <div id="nd-main-content-view">
                ${this.ndFilterState.group_by === 'tree' ? this.renderNdTreeHierarchyView() :
                  this.ndFilterState.group_by === 'flat' ? this.renderNdFlatTableView(devices) :
                  this.renderNdGroupedView(groups)}
            </div>

            <!-- Registered Nodes Table (Reference) -->
            <section style="background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03); margin-top:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                    <div style="font-weight:800; font-size:15px; color:#1e293b; display:flex; align-items:center; gap:8px;">
                        <span>🗼</span>
                        <span>جدول ملخص النقاط الأساسية والفرعية المسجلة بالشبكة</span>
                    </div>
                    <span class="badge" style="background:#0f172a; color:#fff; font-size:11px;">إجمالي: ${this.ndNodesList.length} نقطة</span>
                </div>
                <div class="mt-table-container" style="overflow-x:auto;">
                    <table class="mt-table" style="width:100%; font-size:12px;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="width:40px; text-align:center;">#</th>
                                <th>نوع النقطة</th>
                                <th>اسم النقطة</th>
                                <th>الراوتر والمنفذ</th>
                                <th>النقطة التابعة لها</th>
                                <th>المستلم والمسؤول</th>
                                <th>الموقع</th>
                                <th>الأجهزة المرتبطة</th>
                                <th style="text-align:center;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.ndNodesList.map((n, i) => `
                                <tr>
                                    <td style="text-align:center;">${i + 1}</td>
                                    <td>
                                        <span class="badge" style="background:${n.node_type === 'main_node' ? '#f59e0b' : '#10b981'}; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">
                                            ${n.node_type === 'main_node' ? '🗼 أساسية' : '📡 فرعية'}
                                        </span>
                                    </td>
                                    <td><b style="color:#0f172a;">${this.escape(n.node_name)}</b></td>
                                    <td><code>${this.escape(n.nas_ip)}</code> | <span class="badge" style="background:#0284c7; color:#fff; font-size:10px;">${this.escape(n.nas_port_id || 'الرئيسي')}</span></td>
                                    <td>${this.escape(n.parent_name || '-')}</td>
                                    <td><b>${this.escape(n.responsible_display || '-')}</b> <small style="color:#64748b;">(${this.escape(n.responsible_phone_display || '-')})</small></td>
                                    <td>${this.escape(n.location || '-')}</td>
                                    <td><span class="badge" style="background:#334155; color:#fff;">${n.assets_count || 0} أجهزة</span></td>
                                    <td style="text-align:center; white-space:nowrap;">
                                        <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.showAddNodeModal(${JSON.stringify(n).replace(/"/g, '&quot;')})">✏️ تعديل</button>
                                        <button class="mt-btn mt-btn-danger" style="padding:2px 8px; font-size:11px;" onclick="App.deleteNode(${n.id}, '${this.escape(n.node_name)}')">🗑️ حذف</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${this.ndNodesList.length === 0 ? '<tr><td colspan="9" style="text-align:center; padding:25px; color:#94a3b8;">لا توجد نقاط مسجلة بالمنظومة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </section>

        </div>

        <!-- Sticky Floating Batch Bar -->
        <div id="nd-batch-bar-container" style="position:fixed; bottom:20px; left:20px; right:20px; z-index:999; pointer-events:none;"></div>
        `;

        const shellOpts = {
            id: 'network-nodes',
            archetype: 'table',
            icon: '🌳',
            title: 'هيكلية الشبكة والنقاط (راوتر ➔ منفذ ➔ أساسية ➔ فرعية)',
            eyebrow: 'إدارة البنية التحتية والمعدات',
            subtitle: `${this.ndNodesList.length} نقطة مسجلة | ${summary.total_devices} جهاز مسجل ${summary.duplicate_mac_count > 0 ? `| ⚠️ ${summary.duplicate_mac_count} ماك مكرر` : ''}`,
            actions: [
                { label: 'إضافة نقطة جديدة', icon: '+', variant: 'primary', onclick: 'App.showAddNodeModal()' },
                { label: '👤 إضافة مسؤول نقطة', icon: '📡', variant: 'primary', onclick: 'App.showNodeOwnerModal()', title: 'إضافة مسؤول نقطة (أساسي / فرعي / عادي) بنموذج مبسط' },
                { label: 'سحب واكتشاف الجيران', icon: '📡', variant: 'success', onclick: 'App.showMikrotikNeighborsModal()' },
                { label: 'إعدادات الفحص المجدول', icon: '⚙️', variant: 'secondary', onclick: 'App.showScheduledScanModal()' },
                { label: 'تصدير Excel', icon: '📊', variant: 'secondary', onclick: 'App.exportNetworkDevicesCsv()', title: 'تصدير جدول الأجهزة الحالي كملف Excel / CSV' },
                { label: 'تحديث', icon: '⟳', variant: 'secondary', onclick: 'App.renderNetworkNodes()' }
            ],
            stats: [
                { label: 'إجمالي الأجهزة المسجلة', value: `${summary.total_devices} جهاز`, icon: '📦', tone: 'blue' },
                { label: 'تعمل بالخدمة (Active)', value: `${summary.active_devices} جهاز`, icon: '🟢', tone: 'green' },
                { label: 'تحت الصيانة (Maintenance)', value: `${summary.maintenance_devices} جهاز`, icon: '🟠', tone: 'amber' },
                { label: 'في المخزن (In Stock)', value: `${summary.in_stock_devices} جهاز`, icon: '📦', tone: 'purple' },
                { label: 'أجهزة بماك مكرر', value: summary.duplicate_mac_count > 0 ? `${summary.duplicate_mac_count} مكرر` : 'لا يوجد', icon: '⚠️', tone: summary.duplicate_mac_count > 0 ? 'red' : 'slate', onclick: 'App.toggleNdDuplicateMacOnly()', title: 'اضغط لتصفية الأجهزة المكررة' },
                { label: 'نقاط الشبكة', value: `${this.ndNodesList.length} نقطة`, icon: '🗼', tone: 'indigo' }
            ],
            content: contentHtml
        };

        if (window.SamUI?.PageBuilder) {
            view.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            view.innerHTML = `
            <div class="mt-toolbar" style="flex-wrap:wrap; gap:10px;">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-weight:800; font-size:15px; color:#0f172a;">🌳 هيكلية الشبكة والنقاط</span>
                    <span class="badge" style="background:#0284c7; color:#fff;">${this.ndNodesList.length} نقطة</span>
                    <span class="badge" style="background:#059669; color:#fff;">${summary.total_devices} جهاز</span>
                </div>
                <div class="mt-toolbar-right" style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="mt-btn mt-btn-primary" onclick="App.showAddNodeModal()">+ إضافة نقطة</button>
                    <button class="mt-btn" onclick="App.renderNetworkNodes()">⟳ تحديث</button>
                </div>
            </div>
            <div style="padding:14px;">${contentHtml}</div>`;
        }

        this.updateNdBatchBar();
    },


    toggleNodesSort(col) {
        if (this.nodesTableSortCol === col) {
            this.nodesTableSortDir = this.nodesTableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.nodesTableSortCol = col;
            this.nodesTableSortDir = 'asc';
        }
        this.renderNetworkNodes();
    },

    setNodesPage(p) {
        this.nodesTablePage = p;
        this.renderNetworkNodes();
    },

    setNodesLimit(l) {
        this.nodesTableLimit = l;
        this.nodesTablePage = 1;
        this.renderNetworkNodes();
    },

    exportNodesCSV() {
        if (!this._lastDevicesList || !this._lastDevicesList.length) return this.toast('لا توجد أجهزة للتصدير', 'warning');
        const headers = ['اسم الجهاز / الهوية', 'نوع الجهاز / المنصة', 'إصدار النظام', 'عنوان الماك (MAC)', 'عنوان IP', 'الراوتر', 'المنفذ', 'النقطة المرتبطة', 'الموقع', 'المسؤول', 'الحالة', 'آخر ظهور'];
        const rows = this._lastDevicesList.map(d => [
            d.identity || '',
            d.platform || '',
            d.version || '',
            d.mac || '',
            d.ip || '',
            d.router_name || '',
            d.port || '',
            d.node_name || '',
            d.location || '',
            d.responsible || '',
            d.status || '',
            d.last_seen || ''
        ]);
        this.downloadExcelCSV(`Network_Devices_Nodes_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },

    printNodesTable() {
        if (!this._lastDevicesList || !this._lastDevicesList.length) return this.toast('لا توجد أجهزة للطباعة', 'warning');
        const headers = ['#', 'اسم الجهاز', 'المنصة', 'إصدار النظام', 'عنوان MAC', 'عنوان IP', 'الراوتر / المنفذ', 'النقطة', 'المسؤول', 'الحالة'];
        const rowsHtml = this._lastDevicesList.map((d, i) => `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(d.identity || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(d.platform || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(d.version || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr;">${this.escape(d.mac || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr;">${this.escape(d.ip || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(d.router_name || '')} (${this.escape(d.port || '-')})</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(d.node_name || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(d.responsible || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${this.escape(d.status || '-')}</td>
            </tr>
        `).join('');
        this.printUniversalReport('كشف كافة الأجهزة والمعدات المتصلة بالشبكة', headers, rowsHtml, `إجمالي الأجهزة: ${this._lastDevicesList.length}`);
    },

    renderNdFlatTableView(devices) {
        this._lastDevicesList = devices;
        devices = this.genericSort(devices, this.nodesTableSortCol, this.nodesTableSortDir);
        const paginated = this.genericPaginate(devices, this.nodesTablePage, this.nodesTableLimit);
        const pageDevices = paginated.data;

        return `
        <section style="background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px; flex-wrap:wrap; gap:8px;">
                <div style="font-weight:800; font-size:15px; color:#1e293b; display:flex; align-items:center; gap:8px;">
                    <span>📋</span>
                    <span>جدول تفاصيل كافة الأجهزة والمعدات المتصلة بالشبكة</span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="mt-btn mt-btn-primary" onclick="App.exportNodesCSV()" title="تصدير الأجهزة إلى Excel">📊 تصدير Excel</button>
                    <button class="mt-btn" style="background:#f1f5f9; border:1px solid #cbd5e1;" onclick="App.printNodesTable()" title="طباعة A4">🖨️ طباعة A4</button>
                    <button class="mt-btn" style="padding:3px 10px; font-size:11px;" onclick="App.toggleNdSelectAll(true)">تحديد الكل</button>
                    <button class="mt-btn" style="padding:3px 10px; font-size:11px;" onclick="App.toggleNdSelectAll(false)">إلغاء التحديد</button>
                </div>
            </div>
            <div class="mt-table-container" style="overflow-x:auto;">
                <table class="mt-table" style="width:100%; font-size:12px;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="width:36px; text-align:center;"><input type="checkbox" id="nd-cb-master" onchange="App.toggleNdSelectAll(this.checked)" /></th>
                            <th style="width:36px; text-align:center; cursor:pointer;" onclick="App.toggleNodesSort('id')"># ${this.getTableSortIcon(this.nodesTableSortCol, 'id', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('identity')">اسم الجهاز / الهوية ${this.getTableSortIcon(this.nodesTableSortCol, 'identity', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('platform')">النوع / المنصة ${this.getTableSortIcon(this.nodesTableSortCol, 'platform', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('version')">إصدار النظام ${this.getTableSortIcon(this.nodesTableSortCol, 'version', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('mac')">عنوان الماك (MAC) ${this.getTableSortIcon(this.nodesTableSortCol, 'mac', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('ip')">عنوان IP ${this.getTableSortIcon(this.nodesTableSortCol, 'ip', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('router_name')">الراوتر والمنفذ ${this.getTableSortIcon(this.nodesTableSortCol, 'router_name', this.nodesTableSortDir)}</th>
                            <th style="cursor:pointer;" onclick="App.toggleNodesSort('node_name')">النقطة المرتبطة ${this.getTableSortIcon(this.nodesTableSortCol, 'node_name', this.nodesTableSortDir)}</th>
                            <th>الموقع</th>
                            <th>المستلم والمسؤول</th>
                            <th style="text-align:center; cursor:pointer;" onclick="App.toggleNodesSort('status')">الحالة ${this.getTableSortIcon(this.nodesTableSortCol, 'status', this.nodesTableSortDir)}</th>
                            <th>آخر ظهور بالفحص</th>
                            <th style="text-align:center;">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageDevices.map((d, i) => this.renderNdDeviceRow(d, paginated.start_index + i)).join('')}
                        ${pageDevices.length === 0 ? '<tr><td colspan="14" style="text-align:center; padding:40px; color:#94a3b8; font-size:14px;">لا توجد أجهزة مطابقة لشروط الفلترة والبحث المحددة</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
            ${this.renderTablePaginationBar(paginated, 'App.setNodesPage', 'App.setNodesLimit')}
        </section>
        `;
    },
    renderNdGroupedView(groups) {
        if (!groups || groups.length === 0) {
            return `<div style="background:#fff; border-radius:8px; padding:30px; text-align:center; color:#94a3b8; border:1px solid #e2e8f0;">لا توجد بيانات متوفرة للتجميع المختار</div>`;
        }

        return `
        <div style="display:flex; flex-direction:column; gap:16px;">
            ${groups.map((g, gi) => `
                <section style="background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                    <div class="nd-group-header">
                        <div style="font-weight:800; font-size:14px; color:#0f172a; display:flex; align-items:center; gap:8px;">
                            <span>📁</span>
                            <span>${this.escape(g.group_label)}</span>
                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:2px 8px;">${g.total_count} جهاز</span>
                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px; padding:2px 8px;">${g.active_count} نشط</span>
                            ${g.duplicate_count > 0 ? `<span class="badge-dup-mac">⚠️ ${g.duplicate_count} ماك مكرر</span>` : ''}
                        </div>
                    </div>
                    <div class="mt-table-container" style="overflow-x:auto;">
                        <table class="mt-table" style="width:100%; font-size:12px;">
                            <thead>
                                <tr style="background:#f8fafc;">
                                    <th style="width:36px; text-align:center;"><input type="checkbox" onchange="App.toggleNdGroupSelect('${g.group_key}', this.checked)" /></th>
                                    <th style="width:36px; text-align:center;">#</th>
                                    <th>اسم الجهاز / الهوية</th>
                                    <th>النوع / المنصة</th>
                                    <th>إصدار النظام</th>
                                    <th>عنوان الماك (MAC)</th>
                                    <th>عنوان IP</th>
                                    <th>الراوتر والمنفذ</th>
                                    <th>النقطة المرتبطة</th>
                                    <th>الموقع</th>
                                    <th>المستلم والمسؤول</th>
                                    <th style="text-align:center;">الحالة</th>
                                    <th>آخر ظهور بالفحص</th>
                                    <th style="text-align:center;">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${g.devices.map((d, di) => this.renderNdDeviceRow(d, di + 1, g.group_key)).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
            `).join('')}
        </div>
        `;
    },

    renderNdTreeHierarchyView() {
        const topo = this.ndTopology || [];
        return `
        <section style="background:var(--bg-card, #fff); border-radius:10px; border:1px solid var(--border-color, #e1e8ed); padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                <div style="font-weight:800; font-size:16px; color:#1e293b; display:flex; align-items:center; gap:8px;">
                    <span>🗺️</span>
                    <span>شجرة الاتصال الهرمية للأجهزة والنقاط (راوتر ➔ منفذ ➔ أساسية ➔ فرعية)</span>
                </div>
                <span style="font-size:12px; color:#64748b;">توضح ارتباط كل جهاز وسيكتور بالراوتر والمنفذ والنقاط</span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${topo.map(r => `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                        <div style="font-weight:800; font-size:15px; color:#0369a1; display:flex; align-items:center; gap:8px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
                            <span>📡</span>
                            <span>الراوتر: ${r.router_ip}</span>
                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:2px 8px;">${r.ports ? r.ports.length : 0} منافذ نشطة</span>
                        </div>
                        <div style="margin-right:15px; display:flex; flex-direction:column; gap:12px;">
                            ${(r.ports || []).map(p => `
                                <div style="background:#ffffff; border-right:4px solid #0284c7; border:1px solid #e2e8f0; border-right-width:4px; border-radius:6px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                        <span style="font-weight:700; color:#1e293b; font-size:13px;">
                                            🔌 المنفذ / السيكتور: <span class="badge" style="background:#0f172a; color:#fff; padding:3px 10px; border-radius:4px; font-family:monospace;">${p.port_id}</span>
                                        </span>
                                        <div style="display:flex; gap:6px;">
                                            <button class="mt-btn" style="padding:3px 10px; font-size:11px; font-weight:600;" onclick="App.showNodeDetailModal('${r.router_ip}', '${p.port_id}')">🔍 تفاصيل المنفذ والأصول</button>
                                            <button class="mt-btn" style="padding:3px 10px; font-size:11px; background:#e0f2fe; color:#0369a1; font-weight:600;" onclick="App.showAddNodeModal(null, '${r.router_ip}', '${p.port_id}')">+ إضافة نقطة هنا</button>
                                        </div>
                                    </div>

                                    <div style="margin-top:12px; margin-right:15px; display:flex; flex-direction:column; gap:8px;">
                                        ${(p.main_nodes || []).map(mn => `
                                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
                                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                                    <div style="display:flex; align-items:center; gap:8px;">
                                                        <span class="badge" style="background:#f59e0b; color:#fff; font-size:11px; font-weight:700;">🗼 نقطة أساسية</span>
                                                        <b style="color:#0f172a; font-size:13px;">${this.escape(mn.node_name)}</b>
                                                        ${mn.responsible_display ? `<span style="font-size:11px; color:#64748b;">👤 ${this.escape(mn.responsible_display)}</span>` : ''}
                                                    </div>
                                                    <div style="display:flex; gap:6px; align-items:center;">
                                                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAddSubNodeModal(${mn.id}, '${this.escape(mn.node_name)}', '${r.router_ip}')">+ فرعية</button>
                                                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAddNodeModal(${JSON.stringify(mn).replace(/"/g, '&quot;')})">✏️</button>
                                                    </div>
                                                </div>

                                                <!-- Sub Nodes List -->
                                                ${mn.sub_nodes && mn.sub_nodes.length > 0 ? `
                                                    <div style="margin-top:8px; margin-right:15px; display:flex; flex-direction:column; gap:6px;">
                                                        ${mn.sub_nodes.map(sn => `
                                                            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                                                <div style="display:flex; align-items:center; gap:6px;">
                                                                    <span class="badge" style="background:#10b981; color:#fff; font-size:10px; font-weight:700;">📡 فرعية</span>
                                                                    <span style="font-weight:700; color:#334155; font-size:12px;">${this.escape(sn.node_name)}</span>
                                                                    <code style="font-size:10px; color:#64748b;">[${this.escape(sn.nas_port_id || '')}]</code>
                                                                </div>
                                                                <div style="display:flex; gap:8px; align-items:center;">
                                                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAddNodeModal(${JSON.stringify(sn).replace(/"/g, '&quot;')})">✏️</button>
                                                                </div>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                ` : '<div style="font-size:11px; color:#94a3b8; margin-top:6px; margin-right:10px;">لا توجد نقاط فرعية تابعة لهذه النقطة الأساسية حتى الآن</div>'}
                                            </div>
                                        `).join('')}
                                        ${p.main_nodes.length === 0 ? `<div style="font-size:12px; color:#64748b; padding:6px 0;">لا توجد نقاط أساسية معرفة على هذا المنفذ. <a href="javascript:void(0)" style="color:#0284c7; font-weight:600;" onclick="App.showAddNodeModal(null, '${r.router_ip}', '${p.port_id}')">+ إضافة نقطة أساسية هنا</a></div>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
                ${topo.length === 0 ? '<div style="text-align:center; padding:35px; color:#64748b; font-size:14px;">لا توجد نقاط معرفة بعد. اضغط على "إضافة نقطة جديدة" أو "سحب الجيران" للبدء.</div>' : ''}
            </div>
        </section>
        `;
    },

    renderNdDeviceRow(d, index, groupKey = '') {
        const isChecked = this.ndSelectedIds.has(Number(d.id));
        const vendor = this.getVendorFromMac(d.mac_address);
        const statusMap = {
            'in_service': { label: '🟢 يعمل / بالخدمة', bg: '#059669' },
            'maintenance': { label: '🟠 تحت الصيانة', bg: '#f59e0b' },
            'in_stock': { label: '📦 في المخزن', bg: '#8b5cf6' },
            'damaged': { label: '🔴 تالف / معطوب', bg: '#ef4444' },
            'retired': { label: '⚪ غير موجود / مفصول', bg: '#64748b' }
        };
        const st = statusMap[d.status] || { label: d.status || 'غير محدد', bg: '#64748b' };

        return `
        <tr style="${isChecked ? 'background:#eff6ff;' : ''} ${d.is_duplicate_mac ? 'border-right:3px solid #ef4444;' : ''}">
            <td style="text-align:center;">
                <input type="checkbox" class="nd-row-cb" data-id="${d.id}" data-group="${groupKey}" ${isChecked ? 'checked' : ''} onchange="App.toggleNdItemSelect(${d.id}, this.checked)" />
            </td>
            <td style="text-align:center; color:#64748b;">${index}</td>
            <td>
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                    <span>${this.escape(d.name || d.neighbor_identity || 'جهاز بدون اسم')}</span>
                    ${vendor.name ? `<span class="badge-oui ${vendor.badgeClass}">${vendor.name}</span>` : ''}
                </div>
                ${d.asset_code ? `<small style="color:#64748b; font-family:monospace;">${this.escape(d.asset_code)}</small>` : ''}
            </td>
            <td>
                <span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:600;">
                    ${this.escape(d.platform || d.model || 'غير محدد')}
                </span>
            </td>
            <td>
                ${d.version ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; font-family:monospace;">${this.escape(d.version)}</span>` : '<span style="color:#94a3b8;">-</span>'}
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <code style="font-weight:700; color:#1e293b;">${this.escape(d.mac_address || '-')}</code>
                    ${d.is_duplicate_mac ? `
                        <span class="badge-dup-mac" title="هذا الماك مسجل ${d.duplicate_count} مرات في المنظومة!">
                            ⚠️ مكرر (${d.duplicate_count})
                        </span>
                    ` : ''}
                </div>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:4px;">
                    <code>${this.escape(d.ip_address || '-')}</code>
                    ${d.ip_address ? `
                        <button class="mt-btn" style="padding:1px 5px; font-size:10px; background:#f1f5f9;" title="فحص Ping مباشر" onclick="App.pingDeviceFromTable('${d.ip_address}', '${d.nas_ip}')">📶</button>
                    ` : ''}
                </div>
            </td>
            <td>
                <div style="font-size:11px;">
                    <code>${this.escape(d.nas_ip || '-')}</code>
                    ${d.nas_port_id ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:10px; margin-right:4px;">${this.escape(d.nas_port_id)}</span>` : ''}
                </div>
            </td>
            <td>
                ${d.node_name ? `
                    <span class="badge" style="background:${d.node_type === 'main_node' ? '#fef3c7; color:#92400e; border:1px solid #fde68a;' : '#d1fae5; color:#065f46; border:1px solid #a7f3d0;'} font-weight:700;">
                        ${d.node_type === 'main_node' ? '🗼 أساسية: ' : '📡 فرعية: '} ${this.escape(d.node_name)}
                    </span>
                ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
            </td>
            <td>
                <span style="font-size:11px; color:#475569;">${this.escape(d.location || '-')}</span>
            </td>
            <td>
                <div style="font-size:11px;">
                    <b>${this.escape(d.custodian_name || 'المخزن العام')}</b>
                    ${d.custodian_phone ? `<br><small style="color:#64748b;">${this.escape(d.custodian_phone)}</small>` : ''}
                </div>
            </td>
            <td style="text-align:center;">
                <span class="badge" style="background:${st.bg}; color:#fff; font-size:10px; font-weight:700; padding:3px 8px;">
                    ${st.label}
                </span>
            </td>
            <td>
                ${this.formatLastSeen(d.last_seen || d.created_at)}
            </td>
            <td style="text-align:center; white-space:nowrap;">
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="mt-btn" style="padding:2px 7px; font-size:11px;" title="تعديل بيانات الجهاز" onclick="App.showEditAssetModal(${d.id})">✏️</button>
                    <button class="mt-btn mt-btn-danger" style="padding:2px 7px; font-size:11px;" title="حذف الجهاز" onclick="App.deleteSingleDevice(${d.id}, '${this.escape(d.name || d.mac_address)}')">🗑️</button>
                </div>
            </td>
        </tr>
        `;
    },

    // -------------------------------------------------------------
    // INTERACTION & FILTER HANDLERS
    // -------------------------------------------------------------

    toggleNdDropdown(id) {
        const dd = document.getElementById(id);
        if (!dd) return;
        const isShown = dd.classList.contains('show');
        document.querySelectorAll('.nd-multiselect-dropdown').forEach(d => d.classList.remove('show'));
        if (!isShown) dd.classList.add('show');
    },

    onNdSearchColChange(col) {
        this.ndFilterState.search_column = col;
        this.applyNetworkDevicesFilters();
    },

    onNdSearchInputChange(val) {
        this.ndFilterState.search_query = val.trim();
        if (this.ndSearchDebounce) clearTimeout(this.ndSearchDebounce);
        this.ndSearchDebounce = setTimeout(() => this.applyNetworkDevicesFilters(), 350);
    },

    clearNdSearch() {
        this.ndFilterState.search_query = '';
        const input = document.getElementById('nd-search-input');
        if (input) input.value = '';
        this.applyNetworkDevicesFilters();
    },

    onNdMultiFilterChange(type, value, isChecked) {
        if (!this.ndFilterState[type]) this.ndFilterState[type] = [];
        if (isChecked) {
            if (!this.ndFilterState[type].includes(value)) this.ndFilterState[type].push(value);
        } else {
            this.ndFilterState[type] = this.ndFilterState[type].filter(v => v !== value);
        }
        this.applyNetworkDevicesFilters();
    },

    onNdDateChange(type, value) {
        this.ndFilterState[type] = value;
        this.applyNetworkDevicesFilters();
    },

    toggleNdDuplicateMacOnly() {
        this.ndFilterState.is_duplicate_mac_only = !this.ndFilterState.is_duplicate_mac_only;
        this.applyNetworkDevicesFilters();
    },

    resetNdFilters() {
        this.ndFilterState = {
            search_column: 'all',
            search_query: '',
            routers: [],
            ports: [],
            nodes: [],
            node_types: [],
            custodians: [],
            locations: [],
            platforms: [],
            statuses: [],
            date_from: '',
            date_to: '',
            is_duplicate_mac_only: false,
            group_by: this.ndFilterState.group_by || 'flat'
        };
        this.ndSelectedIds.clear();
        this.renderNetworkNodes();
    },

    setNdGroupBy(mode) {
        this.ndFilterState.group_by = mode;
        this.renderNetworkNodes();
    },

    async applyNetworkDevicesFilters() {
        this.renderNetworkNodes();
    },

    // -------------------------------------------------------------
    // SELECTION & BATCH OPERATIONS
    // -------------------------------------------------------------

    toggleNdItemSelect(id, checked) {
        id = Number(id);
        if (checked) {
            this.ndSelectedIds.add(id);
        } else {
            this.ndSelectedIds.delete(id);
        }
        this.updateNdBatchBar();
    },

    toggleNdSelectAll(checked) {
        const cbs = document.querySelectorAll('.nd-row-cb');
        cbs.forEach(cb => {
            cb.checked = checked;
            const id = Number(cb.getAttribute('data-id'));
            if (id) {
                if (checked) this.ndSelectedIds.add(id);
                else this.ndSelectedIds.delete(id);
            }
        });
        const masterCb = document.getElementById('nd-cb-master');
        if (masterCb) masterCb.checked = checked;
        this.updateNdBatchBar();
    },

    toggleNdGroupSelect(groupKey, checked) {
        const cbs = document.querySelectorAll(`.nd-row-cb[data-group="${groupKey}"]`);
        cbs.forEach(cb => {
            cb.checked = checked;
            const id = Number(cb.getAttribute('data-id'));
            if (id) {
                if (checked) this.ndSelectedIds.add(id);
                else this.ndSelectedIds.delete(id);
            }
        });
        this.updateNdBatchBar();
    },

    clearNdSelection() {
        this.ndSelectedIds.clear();
        document.querySelectorAll('.nd-row-cb').forEach(cb => cb.checked = false);
        const masterCb = document.getElementById('nd-cb-master');
        if (masterCb) masterCb.checked = false;
        this.updateNdBatchBar();
    },

    updateNdBatchBar() {
        const container = document.getElementById('nd-batch-bar-container');
        if (!container) return;

        const count = this.ndSelectedIds.size;
        if (count === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
        <div class="nd-batch-bar" style="pointer-events:auto;">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <span class="badge" style="background:#0284c7; color:#fff; font-size:13px; padding:5px 12px; font-weight:800;">
                    ✓ تم تحديد (${count}) جهاز
                </span>
                <span style="font-size:12px; color:#cbd5e1;">العمليات الجماعية على الأجهزة المحددة:</span>
            </div>

            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <button class="mt-btn" style="background:#3b82f6; color:#fff; font-weight:700; font-size:12px; padding:6px 12px;" onclick="App.showBatchMoveNodeModal()">
                    📌 تغيير النقطة
                </button>
                <button class="mt-btn" style="background:#10b981; color:#fff; font-weight:700; font-size:12px; padding:6px 12px;" onclick="App.showBatchChangeLocationModal()">
                    📍 تغيير الموقع
                </button>
                <button class="mt-btn" style="background:#8b5cf6; color:#fff; font-weight:700; font-size:12px; padding:6px 12px;" onclick="App.showBatchChangeCustodianModal()">
                    👤 تغيير المستلم / العهدة
                </button>
                <button class="mt-btn" style="background:#f59e0b; color:#fff; font-weight:700; font-size:12px; padding:6px 12px;" onclick="App.showBatchChangeStatusModal()">
                    🏷️ تغيير الحالة
                </button>
                <button class="mt-btn mt-btn-danger" style="font-weight:700; font-size:12px; padding:6px 12px;" onclick="App.showBatchDeleteModal()">
                    🗑️ حذف المحدد
                </button>
                <button class="mt-btn" style="background:#334155; color:#fff; font-size:12px; padding:6px 10px;" onclick="App.clearNdSelection()" title="إلغاء التحديد">
                    ✕ إلغاء
                </button>
            </div>
        </div>
        `;
    },

    // -------------------------------------------------------------
    // BATCH ACTION MODALS
    // -------------------------------------------------------------

    showBatchMoveNodeModal() {
        const count = this.ndSelectedIds.size;
        if (count === 0) return;

        this.openModal(`
            <div class="mt-modal-header">
                <span>📌 نقل (${count}) أجهزة إلى نقطة شبكة محددة</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body">
                <div class="form-group">
                    <label>اختر النقطة المستهدفة لنقل الأجهزة إليها:</label>
                    <select id="batch-target-node" class="mt-select" style="width:100%; font-size:13px; padding:8px;">
                        <option value="0">-- فك الارتباط (أجهزة غير مرتبطة بنقطة) --</option>
                        ${this.ndNodesList.map(n => `
                            <option value="${n.id}">${n.node_type === 'main_node' ? '🗼 أساسية: ' : '📡 فرعية: '} ${this.escape(n.node_name)} (${this.escape(n.nas_ip)} - ${this.escape(n.nas_port_id || 'عام')})</option>
                        `).join('')}
                    </select>
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:8px;">
                    💡 سيتم ربط الأجهزة المحددة بهذه النقطة تلقائياً وتحديث بيانات الراوتر والمنفذ تبعاً لها.
                </div>
            </div>
            <div class="mt-modal-footer">
                <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button class="mt-btn mt-btn-primary" onclick="App.executeBatchMoveNode()">💾 تطبيق النقل فوراً</button>
            </div>
        `);
    },

    async executeBatchMoveNode() {
        const nodeId = document.getElementById('batch-target-node')?.value;
        const assetIds = Array.from(this.ndSelectedIds);

        this.toast('جاري تنفيذ النقل الجماعي...', 'info');
        const res = await this.api('batch_update_network_devices', {
            asset_ids: assetIds,
            updates: { node_id: parseInt(nodeId, 10) }
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم تحديث النقطة للأجهزة بنجاح!', 'success');
            this.closeModal();
            this.ndSelectedIds.clear();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشلت العملية', 'danger');
        }
    },

    showBatchChangeLocationModal() {
        const count = this.ndSelectedIds.size;
        if (count === 0) return;

        this.openModal(`
            <div class="mt-modal-header">
                <span>📍 تغيير الموقع الجغرافي لـ (${count}) أجهزة</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body">
                <div class="form-group">
                    <label>الموقع الجغرافي الجديد:</label>
                    <input type="text" id="batch-target-location" class="mt-input" style="width:100%; font-size:13px; padding:8px;" placeholder="e.g. برج السلام - الطابق الرابع أو صنعاء" />
                </div>
                <div style="margin-top:10px;">
                    <span style="font-size:11px; color:#64748b;">مواقع مستخدمة مؤخراً (اضغط للاختيار السريع):</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                        ${(this.ndFilterOptions.locations || []).slice(0, 8).map(loc => `
                            <button type="button" class="mt-btn" style="padding:2px 8px; font-size:10px;" onclick="document.getElementById('batch-target-location').value = '${this.escape(loc)}'">${this.escape(loc)}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="mt-modal-footer">
                <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button class="mt-btn mt-btn-primary" onclick="App.executeBatchChangeLocation()">💾 حفظ الموقع للأجهزة</button>
            </div>
        `);
    },

    async executeBatchChangeLocation() {
        const loc = document.getElementById('batch-target-location')?.value.trim();
        const assetIds = Array.from(this.ndSelectedIds);

        this.toast('جاري تحديث الموقع...', 'info');
        const res = await this.api('batch_update_network_devices', {
            asset_ids: assetIds,
            updates: { location: loc }
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم تحديث الموقع بنجاح!', 'success');
            this.closeModal();
            this.ndSelectedIds.clear();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشلت العملية', 'danger');
        }
    },

    showBatchChangeCustodianModal() {
        const count = this.ndSelectedIds.size;
        if (count === 0) return;

        this.openModal(`
            <div class="mt-modal-header">
                <span>👤 تعيين المستلم / المسؤول عن العهدة لـ (${count}) أجهزة</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body">
                <div class="form-group">
                    <label>اختر المستلم / المسؤول الجديد:</label>
                    <select id="batch-target-custodian" class="mt-select" style="width:100%; font-size:13px; padding:8px;">
                        <option value="0">-- المخزن العام (بدون عهدة محددة) --</option>
                        ${this.ndAdminsList.map(a => `
                            <option value="${a.id}">${this.escape(a.fullname)} (${this.escape(a.role_name_ar || a.role)})</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            <div class="mt-modal-footer">
                <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button class="mt-btn mt-btn-primary" onclick="App.executeBatchChangeCustodian()">💾 حفظ التعيين</button>
            </div>
        `);
    },

    async executeBatchChangeCustodian() {
        const custId = document.getElementById('batch-target-custodian')?.value;
        const assetIds = Array.from(this.ndSelectedIds);

        this.toast('جاري تعيين المستلم...', 'info');
        const res = await this.api('batch_update_network_devices', {
            asset_ids: assetIds,
            updates: { assigned_to_user_id: parseInt(custId, 10) }
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم تعيين المستلم بنجاح!', 'success');
            this.closeModal();
            this.ndSelectedIds.clear();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشلت العملية', 'danger');
        }
    },

    showBatchChangeStatusModal() {
        const count = this.ndSelectedIds.size;
        if (count === 0) return;

        this.openModal(`
            <div class="mt-modal-header">
                <span>🏷️ تغيير حالة (${count}) أجهزة محددة</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body">
                <div class="form-group">
                    <label>اختر الحالة الجديدة:</label>
                    <select id="batch-target-status" class="mt-select" style="width:100%; font-size:13px; padding:8px;">
                        <option value="in_service">🟢 تعمل / بالخدمة (in_service)</option>
                        <option value="maintenance">🟠 تحت الصيانة (maintenance)</option>
                        <option value="in_stock">📦 في المخزن (in_stock)</option>
                        <option value="damaged">🔴 تالف / معطوب (damaged)</option>
                        <option value="retired">⚪ غير موجود / مفصول من الشبكة (retired)</option>
                    </select>
                </div>
            </div>
            <div class="mt-modal-footer">
                <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button class="mt-btn mt-btn-primary" onclick="App.executeBatchChangeStatus()">💾 تطبيق الحالة فوراً</button>
            </div>
        `);
    },

    async executeBatchChangeStatus() {
        const status = document.getElementById('batch-target-status')?.value;
        const assetIds = Array.from(this.ndSelectedIds);

        this.toast('جاري تحديث الحالة...', 'info');
        const res = await this.api('batch_update_network_devices', {
            asset_ids: assetIds,
            updates: { status: status }
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم تحديث الحالة بنجاح!', 'success');
            this.closeModal();
            this.ndSelectedIds.clear();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشلت العملية', 'danger');
        }
    },

    async showBatchDeleteModal() {
        const count = this.ndSelectedIds.size;
        if (count === 0) return;

        if (!confirm(`⚠️ تحذير حرج: هل أنت متأكد من رغبتك في حذف (${count}) أجهزة محددة نهائياً من المنظومة؟`)) return;

        this.toast('جاري حذف الأجهزة المحددة...', 'info');
        const res = await this.api('batch_update_network_devices', {
            asset_ids: Array.from(this.ndSelectedIds),
            updates: { bulk_delete: true }
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم حذف الأجهزة بنجاح!', 'success');
            this.ndSelectedIds.clear();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشل الحذف', 'danger');
        }
    },

    async deleteSingleDevice(id, name) {
        if (!confirm(`هل أنت متأكد من حذف الجهاز [${name}] من المنظومة؟`)) return;
        const res = await this.api('batch_update_network_devices', {
            asset_ids: [id],
            updates: { bulk_delete: true }
        }, 'POST');

        if (res && res.success) {
            this.toast('تم حذف الجهاز بنجاح', 'success');
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشل الحذف', 'danger');
        }
    },

    // -------------------------------------------------------------
    // SCHEDULED SCAN SETTINGS & RUNNER
    // -------------------------------------------------------------

    async showScheduledScanModal() {
        const settings = await this.api('get_neighbor_scan_settings') || {};

        this.openModal(`
            <div class="mt-modal-header">
                <span>⚙️ إعدادات الفحص المجدول والتلقائي لجيران الميكروتك (MNDP/CDP)</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <form onsubmit="App.saveScheduledScanSettingsForm(event)">
                <div class="mt-modal-body" style="display:flex; flex-direction:column; gap:14px;">
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                        <label style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px; cursor:pointer; color:#0f172a;">
                            <input type="checkbox" id="scan-enabled" name="enabled" ${settings.enabled ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;" />
                            <span>تفعيل الفحص التلقائي المجدول عبر كافة الراوترات</span>
                        </label>
                        <div style="font-size:12px; color:#64748b; margin-top:6px; margin-right:26px;">
                            يقوم النظام دورياً بالاتصال بكافة الراوترات النشطة وسحب قائمة الجيران وتحديث تاريخ آخر ظهور للأجهزة وتحديث بياناتها واكتشاف الأجهزة الجديدة تلقائياً بدون تكرار.
                        </div>
                    </div>

                    <div class="form-group">
                        <label style="font-weight:700;">فترة تكرار الفحص التلقائي:</label>
                        <select name="interval_min" class="mt-select" style="width:100%; font-size:13px; padding:8px;">
                            <option value="5" ${Number(settings.interval_min) === 5 ? 'selected' : ''}>⚡ كل 5 دقائق (فحص سريع)</option>
                            <option value="10" ${Number(settings.interval_min) === 10 ? 'selected' : ''}>⏱️ كل 10 دقائق</option>
                            <option value="15" ${Number(settings.interval_min) === 15 || !settings.interval_min ? 'selected' : ''}>⏱️ كل 15 دقيقة (موصى به)</option>
                            <option value="30" ${Number(settings.interval_min) === 30 ? 'selected' : ''}>⏱️ كل 30 دقيقة</option>
                            <option value="60" ${Number(settings.interval_min) === 60 ? 'selected' : ''}>🕐 كل 60 دقيقة (ساعة واحدة)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" name="auto_create" ${settings.auto_create ? 'checked' : ''} />
                            <span>تسجيل الأجهزة الجديدة المكتشفة تلقائياً كأصول ونقاط جديدة بالمنظومة</span>
                        </label>
                    </div>

                    <div style="background:#f1f5f9; border-radius:6px; padding:10px; font-size:12px; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                        <span>تاريخ وتوقيت آخر فحص تم:</span>
                        <b style="color:#0284c7;">${settings.last_run || 'لم يتم الفحص بعد'}</b>
                    </div>

                    <div style="border-top:1px solid #e2e8f0; padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
                        <button type="button" class="mt-btn" style="background:#059669; color:#fff; font-weight:800; padding:8px 16px; font-size:13px;" onclick="App.runAllRoutersNeighborScan()">
                            🔄 تشغيل الفحص الشامل لكافة الراوترات الآن
                        </button>
                    </div>

                    <div id="scan-run-results" style="display:none; background:#0f172a; color:#38bdf8; border-radius:8px; padding:12px; font-family:monospace; font-size:11px; max-height:160px; overflow-y:auto; direction:ltr; text-align:left;"></div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                    <button type="submit" class="mt-btn mt-btn-primary">💾 حفظ الإعدادات</button>
                </div>
            </form>
        `, '650px');
    },

    async saveScheduledScanSettingsForm(e) {
        e.preventDefault();
        const form = e.target;
        const payload = {
            enabled: form.enabled.checked,
            interval_min: parseInt(form.interval_min.value, 10),
            auto_create: form.auto_create.checked
        };

        this.toast('جاري حفظ الإعدادات...', 'info');
        const res = await this.api('save_neighbor_scan_settings', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ الإعدادات بنجاح', 'success');
            this.closeModal();
            this.renderNetworkNodes();
        } else {
            this.toast(res?.error || 'فشل حفظ الإعدادات', 'danger');
        }
    },

    async runAllRoutersNeighborScan() {
        const box = document.getElementById('scan-run-results');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = 'Connecting to all registered MikroTik routers and scanning neighbors... please wait...\n';
        }

        const res = await this.api('run_all_routers_neighbor_scan', { force: true }, 'POST');
        if (res && res.success) {
            if (box) {
                const logs = (res.logs || []).join('\n');
                box.innerHTML = `SCAN COMPLETED!\n` +
                                `Scanned: ${res.scanned_routers}/${res.total_routers} routers\n` +
                                `Neighbors Found: ${res.neighbors_found}\n` +
                                `Updated: ${res.updated_devices} | Created: ${res.created_devices}\n\n` +
                                `LOGS:\n${logs}`;
            }
            this.toast(res.message || 'اكتمل الفحص الشامل للراوترات بنجاح!', 'success');
            this.renderNetworkNodes();
        } else {
            if (box) box.innerHTML += `\nERROR: ${res?.error || 'Scan failed'}`;
            this.toast(res?.error || 'فشل الفحص', 'danger');
        }
    },

    // -------------------------------------------------------------
    // LIVE PING & CSV EXPORT
    // -------------------------------------------------------------

    async pingDeviceFromTable(ip, nasIp) {
        if (!ip) return;
        this.toast(`جاري إرسال اختبار Ping إلى (${ip})...`, 'info');

        let nasId = null;
        if (nasIp && this.ndRoutersList) {
            const r = this.ndRoutersList.find(x => x.nasname === nasIp || x.shortname === nasIp);
            if (r) nasId = r.id;
        }

        const res = await this.api('ping_router_device', { id: nasId, target_ip: ip });
        if (res && res.success) {
            alert(`📶 نتيجة فحص Ping إلى الجهاز (${ip}):\n\n- الحزم المرسلة: ${res.packets_sent}\n- الحزم المستلمة: ${res.packets_received}\n- نسبة الفقدان: ${res.packet_loss}\n- متوسط الاستجابة: ${res.avg_ms ? res.avg_ms + ' ms' : 'غير متاح'}`);
        } else {
            alert(res?.error || `تعذر الوصول للجهاز (${ip}) عبر فحص Ping`);
        }
    },

    exportNetworkDevicesCsv() {
        const devices = this.ndCachedData?.devices || [];
        if (devices.length === 0) return alert('لا توجد أجهزة لتصديرها');

        let csv = '\uFEFF'; // UTF-8 BOM
        csv += 'ID,اسم الجهاز,النوع والمنصة,إصدار النظام,الماك,الآيبي,الراوتر,المنفذ,النقطة المرتبطة,نوع النقطة,الموقع,المستلم,الحالة,آخر ظهور بالفحص\n';

        devices.forEach(d => {
            const row = [
                d.id,
                `"${(d.name || d.neighbor_identity || '').replace(/"/g, '""')}"`,
                `"${(d.platform || d.model || '').replace(/"/g, '""')}"`,
                `"${(d.version || '').replace(/"/g, '""')}"`,
                `"${(d.mac_address || '').replace(/"/g, '""')}"`,
                `"${(d.ip_address || '').replace(/"/g, '""')}"`,
                `"${(d.nas_ip || '').replace(/"/g, '""')}"`,
                `"${(d.nas_port_id || '').replace(/"/g, '""')}"`,
                `"${(d.node_name || '').replace(/"/g, '""')}"`,
                `"${(d.node_type === 'main_node' ? 'أساسية' : (d.node_type === 'sub_node' ? 'فرعية' : '')).replace(/"/g, '""')}"`,
                `"${(d.location || '').replace(/"/g, '""')}"`,
                `"${(d.custodian_name || '').replace(/"/g, '""')}"`,
                `"${(d.status || '').replace(/"/g, '""')}"`,
                `"${(d.last_seen || d.created_at || '').replace(/"/g, '""')}"`
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `network_devices_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

// ==========================================
    // 6. FREE / VIP VOUCHERS MANAGEMENT (MULTI-TAB, SCHEDULER & ROI ANALYTICS)
    // ==========================================
    freeVouchersTab: 'vouchers',

    renderNeighborsModalContent(routers, admins, activeTab = 'api') {
        const rId = this.currentNeighborsRouterId;
        const currentRouter = routers.find(r => Number(r.id) === Number(rId)) || routers[0] || {};

        this.openModal(`
        <div class="mt-modal" style="width:1120px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 12px 36px rgba(0,0,0,0.35); border-radius:8px; overflow:hidden;">
            <!-- Header -->
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:20px;">📡</span>
                    <span style="font-weight:700; font-size:16px;">مستكشف جيران الميكروتك (MikroTik Neighbors Auto-Discovery)</span>
                    <span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:3px 8px;">MNDP / CDP / LLDP</span>
                </div>
                <button type="button" style="background:transparent; border:none; color:#94a3b8; font-size:22px; cursor:pointer; line-height:1;" onclick="App.closeModal()">&times;</button>
            </div>

            <!-- Top Control Bar (Router + Scan Button + Mode Toggle) -->
            <div style="padding:12px 18px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <label style="font-weight:700; font-size:13px; color:#1e293b; white-space:nowrap;">🌐 الراوتر المستهدف:</label>
                    <select id="mn-router-picker" class="mt-select" style="font-weight:600; min-width:260px; font-size:13px;" onchange="App.currentNeighborsRouterId = this.value; App.onNeighborRouterChanged(this.value, ${JSON.stringify(routers).replace(/"/g, '&quot;')})">
                        ${routers.map(r => `<option value="${r.id}" ${Number(r.id) === Number(rId) ? 'selected' : ''}>${r.shortname} (${r.nasname || r.sstp_ip || ''})</option>`).join('')}
                    </select>

                    <button type="button" class="mt-btn" style="background:#059669; color:#fff; font-weight:700; font-size:13px; padding:7px 18px; display:flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(5,150,105,0.3); border:none; cursor:pointer;" onclick="App.fetchLiveNeighbors()">
                        <span>🔄</span>
                        <span>فحص وسحب الأجهزة الحية الآن</span>
                    </button>
                </div>

                <!-- Tabs: Live API vs Manual Paste -->
                <div style="display:flex; gap:6px;">
                    <button type="button" id="mn-tab-btn-api" class="mt-btn" style="font-weight:700; font-size:12px; padding:6px 14px; ${activeTab === 'api' ? 'background:#0284c7; color:#fff;' : 'background:#e2e8f0; color:#334155;'}" onclick="App.switchNeighborsTab('api')">
                        🌐 سحب مباشر (API)
                    </button>
                    <button type="button" id="mn-tab-btn-paste" class="mt-btn" style="font-weight:700; font-size:12px; padding:6px 14px; ${activeTab === 'paste' ? 'background:#0284c7; color:#fff;' : 'background:#e2e8f0; color:#334155;'}" onclick="App.switchNeighborsTab('paste')">
                        📋 لصق يدوي (WinBox)
                    </button>
                </div>
            </div>

            <!-- Tab 1: Live API Panel -->
            <div id="mn-panel-api" style="padding:10px 18px; background:#eff6ff; border-bottom:1px solid #dbeafe; ${activeTab === 'api' ? 'display:block;' : 'display:none;'}">
                <div style="font-size:12px; color:#1e40af; display:flex; align-items:center; gap:8px;">
                    <span>ℹ️</span>
                    <span><b>قاعدة الربط:</b> النقطة في هيكل الشبكة هي <b>المنفذ (Interface)</b>؛ المنافذ التي تحمل <b>ether</b> هي نقاط أساسية، والمنافذ الأخرى نقاط فرعية، وتجتمع كافة أجهزة المنفذ تحته كأصول تابعة له.</span>
                </div>
            </div>

            <!-- Tab 2: Paste Panel -->
            <div id="mn-panel-paste" style="padding:12px 18px; background:#fffbeb; border-bottom:1px solid #fef3c7; ${activeTab === 'paste' ? 'display:block;' : 'display:none;'}">
                <div style="font-size:12px; color:#92400e; margin-bottom:6px;">
                    📋 <b>طريقة النسخ من Winbox:</b> افتح قائمة <code>IP > Neighbors</code> في وينبوكس، اضغط <kbd>Ctrl+A</kbd> لتحديد كافة الأسطر، ثم <kbd>Ctrl+C</kbd> والصق هنا مباشرة:
                </div>
                <div style="display:flex; gap:10px;">
                    <textarea id="mn-raw-text" class="mt-input" style="flex:1; height:75px; font-family:monospace; font-size:11px; direction:ltr;" placeholder="الصق أسطر Winbox أو ناتج أمر /ip neighbor print as-value هنا..."></textarea>
                    <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; font-weight:700; width:140px; font-size:13px;" onclick="App.parsePastedNeighbors()">
                        🔍 تحليل ومعاينة
                    </button>
                </div>
            </div>

            <!-- Results Toolbar & Filters -->
            <div id="mn-results-toolbar" style="padding:10px 18px; background:#ffffff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span id="mn-stats-badge" class="badge" style="background:#0f172a; color:#fff; font-size:12px; padding:5px 12px; font-weight:700;">0 جهاز مكتشف</span>
                    <div style="position:relative;">
                        <input type="text" id="mn-filter-search" class="mt-input" placeholder="🔍 تصفية بالاسم، المنفذ، IP، الموديل، الماك..." style="width:280px; font-size:12px; padding:5px 10px; border:1px solid #cbd5e1; border-radius:4px;" oninput="App.filterNeighborsTable()" />
                    </div>
                    <select id="mn-filter-port" class="mt-select" style="font-size:12px; min-width:160px;" onchange="App.filterNeighborsTable()">
                        <option value="">كل المنافذ والواجهات</option>
                    </select>
                </div>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; font-weight:600;" onclick="App.toggleAllNeighbors(true)">تحديد الكل</button>
                    <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; font-weight:600;" onclick="App.toggleAllNeighbors(false)">إلغاء التحديد</button>
                    <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; font-weight:600; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;" onclick="App.selectOnlyNewNeighbors()">تحديد الجديد فقط</button>
                </div>
            </div>

            <!-- Table Container -->
            <div style="flex:1; overflow-y:auto; padding:0; min-height:300px; max-height:480px; background:#fff;">
                <div id="mn-table-placeholder" style="text-align:center; padding:60px 20px; color:#64748b;">
                    <div style="font-size:42px; margin-bottom:12px;">📡</div>
                    <div style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:6px;">جاهز لسحب واكتشاف الأجهزة المتصلة</div>
                    <div style="font-size:12px; color:#94a3b8; margin-bottom:16px;">اضغط على زر "فحص وسحب الأجهزة الحية الآن" أعلاه أو الصق نص وينبوكس لعرض الجيران</div>
                    <button type="button" class="mt-btn" style="background:#059669; color:#fff; font-weight:700; font-size:13px; padding:8px 22px;" onclick="App.fetchLiveNeighbors()">
                        🔄 بدء الفحص والسحب المباشر
                    </button>
                </div>
                <table id="mn-devices-table" class="mt-table" style="display:none; width:100%; font-size:12px; border-collapse:collapse;">
                    <thead style="position:sticky; top:0; background:#f1f5f9; z-index:2; border-bottom:2px solid #cbd5e1;">
                        <tr>
                            <th style="width:40px; text-align:center;"><input type="checkbox" id="mn-cb-all" onchange="App.toggleAllNeighbors(this.checked)" checked /></th>
                            <th style="text-align:right;">المنفذ / الواجهة (Interface)</th>
                            <th style="text-align:right;">اسم النقطة / المشترك (Identity)</th>
                            <th style="text-align:right;">عنوان IP (Address)</th>
                            <th style="text-align:right;">نوع وموديل الجهاز (Platform)</th>
                            <th style="text-align:right;">الماك (MAC Address)</th>
                            <th style="text-align:center;">حالة التسجيل بالمنظومة</th>
                            <th style="text-align:center;">إجراء</th>
                        </tr>
                    </thead>
                    <tbody id="mn-devices-tbody"></tbody>
                </table>
            </div>

            <!-- Bottom Import Action Bar -->
            <div id="mn-bottom-bar" style="padding:12px 18px; background:#f8fafc; border-top:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; cursor:pointer; color:#1e293b;">
                        <input type="checkbox" id="mn-opt-nodes" checked style="cursor:pointer;" />
                        <span>🌳 اعتماد المنافذ كنقاط بهيكل الشبكة (ether أساسية / غيره فرعية)</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; cursor:pointer; color:#1e293b;">
                        <input type="checkbox" id="mn-opt-assets" checked style="cursor:pointer;" />
                        <span>📦 تسجيل الأجهزة كأصول وهوائيات تابعة للمنفذ (Assets)</span>
                    </label>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:12px; font-weight:600; color:#475569;">👤 تعيين العهدة لـ:</span>
                        <select id="mn-assign-user" class="mt-select" style="font-size:12px; max-width:220px;">
                            <option value="">-- بدون مستلم عهدة محدد (المخزن العام) --</option>
                            ${admins.filter(a => Number(a.id) !== Number(this.adminId)).map(a => `<option value="${a.id}">${a.fullname} (${a.role_name_ar || a.role})</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="display:flex; gap:10px;">
                    <button type="button" class="mt-btn" style="font-weight:600; padding:7px 16px;" onclick="App.closeModal()">إلغاء</button>
                    <button type="button" id="mn-submit-import-btn" class="mt-btn mt-btn-primary" style="font-weight:700; font-size:13px; padding:7px 22px; background:#0284c7;" onclick="App.executeNeighborsImport()">
                        📥 استيراد الأجهزة المحددة وحفظها فوراً
                    </button>
                </div>
            </div>
        </div>
        `, '1120px');
    },

    switchNeighborsTab(tab) {
        const pApi = document.getElementById('mn-panel-api');
        const pPaste = document.getElementById('mn-panel-paste');
        const btnApi = document.getElementById('mn-tab-btn-api');
        const btnPaste = document.getElementById('mn-tab-btn-paste');

        if (pApi) pApi.style.display = tab === 'api' ? 'block' : 'none';
        if (pPaste) pPaste.style.display = tab === 'paste' ? 'block' : 'none';

        if (btnApi) {
            btnApi.style.background = tab === 'api' ? '#0284c7' : '#e2e8f0';
            btnApi.style.color = tab === 'api' ? '#fff' : '#334155';
        }
        if (btnPaste) {
            btnPaste.style.background = tab === 'paste' ? '#0284c7' : '#e2e8f0';
            btnPaste.style.color = tab === 'paste' ? '#fff' : '#334155';
        }
    },

    onNeighborRouterChanged(nasId, routers) {
        this.cachedNeighborsList = [];
        const t = document.getElementById('mn-devices-table');
        const p = document.getElementById('mn-table-placeholder');
        const b = document.getElementById('mn-stats-badge');
        if (t) t.style.display = 'none';
        if (p) {
            p.innerHTML = `
                <div style="font-size:42px; margin-bottom:12px;">📡</div>
                <div style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:6px;">جاهز لسحب واكتشاف الأجهزة المتصلة بالراوتر المحدد</div>
                <div style="font-size:12px; color:#94a3b8; margin-bottom:16px;">اضغط على زر "فحص وسحب الأجهزة الحية الآن" لبدء الفحص</div>
                <button type="button" class="mt-btn" style="background:#059669; color:#fff; font-weight:700; font-size:13px; padding:8px 22px;" onclick="App.fetchLiveNeighbors()">
                    🔄 بدء الفحص والسحب المباشر
                </button>
            `;
            p.style.display = 'block';
        }
        if (b) b.innerText = '0 جهاز مكتشف';
    },

    async fetchLiveNeighbors() {
        const routerId = document.getElementById('mn-router-picker')?.value || this.currentNeighborsRouterId;
        if (!routerId) return alert('يرجى اختيار الراوتر أولاً');

        const placeholder = document.getElementById('mn-table-placeholder');
        if (placeholder) {
            placeholder.innerHTML = `<div style="padding:50px 20px;"><i class="fas fa-spinner fa-spin fa-3x" style="color:#0284c7;"></i><div style="margin-top:14px; font-weight:700; font-size:15px; color:#1e293b;">جاري الاتصال بـ API الراوتر وسحب قائمة الجيران والأجهزة الحية...</div><div style="color:#64748b; font-size:12px; margin-top:4px;">يرجى الانتظار بضع ثوانٍ...</div></div>`;
            placeholder.style.display = 'block';
            const tbl = document.getElementById('mn-devices-table');
            if (tbl) tbl.style.display = 'none';
        }

        const res = await this.api('fetch_router_neighbors', { id: routerId });
        if (res && res.success) {
            this.cachedNeighborsList = res.neighbors || [];
            this.renderNeighborsTable(this.cachedNeighborsList);
            if (this.cachedNeighborsList.length === 0) {
                if (placeholder) {
                    placeholder.innerHTML = `<div style="padding:40px; color:#64748b;"><div style="font-size:36px; margin-bottom:10px;">🔍</div><div style="font-weight:700; font-size:14px;">لم يتم العثور على أجهزة جيران متصلة عبر MNDP/CDP حالياً في هذا الراوتر.</div></div>`;
                    placeholder.style.display = 'block';
                }
            }
        } else {
            if (placeholder) {
                placeholder.innerHTML = `<div style="padding:40px; color:#dc2626;"><div style="font-size:36px; margin-bottom:10px;">⚠️</div><div style="font-weight:700; font-size:14px;">فشل الاتصال بـ API الراوتر:</div><div style="margin-top:6px; font-size:12px; color:#475569;">${this.escape(res?.error || 'يرجى التحقق من اتصال الراوتر وتشغيل /ip service enable api وصحة المنفذ')}</div></div>`;
                placeholder.style.display = 'block';
            }
        }
    },

    parsePastedNeighbors() {
        const text = (document.getElementById('mn-raw-text')?.value || '').trim();
        if (!text) return alert('يرجى لصق نص بيانات الجيران أولاً');

        const lines = text.split(/\r?\n/);
        const parsed = [];

        // Support both winbox line format and key=value format
        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#') || line.startsWith('INTERFACE') || line.startsWith('Columns:')) return;

            let iface = '', identity = '', address = '', mac = '', platform = '', version = '';

            if (line.includes('interface=') || line.includes('identity=')) {
                // Key-value format
                const parts = line.split(/\s+/);
                parts.forEach(p => {
                    const [k, ...v] = p.split('=');
                    const val = v.join('=');
                    if (k === 'interface') iface = val;
                    if (k === 'identity') identity = val;
                    if (k === 'address') address = val;
                    if (k === 'mac-address') mac = val;
                    if (k === 'platform') platform = val;
                    if (k === 'version') version = val;
                });
            } else {
                // Winbox tab-separated or space-separated line
                const cols = line.split(/[\t]+| {2,}/);
                if (cols.length >= 2) {
                    iface = cols[0] || '';
                    identity = cols[1] || '';
                    address = cols[2] || '';
                    mac = cols[3] || '';
                    platform = cols[4] || '';
                    version = cols[5] || '';
                }
            }

            if (iface || identity || address || mac) {
                parsed.push({
                    interface: iface || 'ether1',
                    identity: identity || 'Device',
                    address: address || '',
                    mac_address: mac || '',
                    platform: platform || 'Generic Device',
                    version: version || '',
                    already_node: false,
                    already_asset: false
                });
            }
        });

        if (parsed.length === 0) {
            return alert('لم يتم التعرف على أي أجهزة من النص الملصق. يرجى التأكد من نسخ الأسطر من WinBox بشكل صحيح.');
        }

        this.cachedNeighborsList = parsed;
        this.renderNeighborsTable(parsed);
    },

    renderNeighborsTable(items) {
        const placeholder = document.getElementById('mn-table-placeholder');
        const table = document.getElementById('mn-devices-table');
        const badge = document.getElementById('mn-stats-badge');

        if (items.length > 0) {
            if (placeholder) placeholder.style.display = 'none';
            if (table) table.style.display = 'table';
        }

        if (badge) {
            badge.innerText = `${items.length} جهاز مكتشف`;
        }

        // Populate port filter dropdown dynamically
        const ports = Array.from(new Set(items.map(i => i.interface).filter(Boolean)));
        const portSelect = document.getElementById('mn-filter-port');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">كل المنافذ (' + ports.length + ' منفذ)</option>' +
                ports.map(p => `<option value="${p}">${p}</option>`).join('');
        }

        this.filteredNeighbors = [...items];
        this.renderFilteredNeighborsRows();
    },

    renderFilteredNeighborsRows() {
        const tbody = document.getElementById('mn-devices-tbody');
        if (!tbody) return;

        const items = this.filteredNeighbors || [];

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد أجهزة مطابقة لشروط البحث والتصفية</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map((item, idx) => {
            const isAlready = item.already_node || item.already_asset;
            const plat = (item.platform || '').toLowerCase();
            const isUbi = plat.includes('powerbeam') || plat.includes('nano') || plat.includes('litebeam') || plat.includes('ubiquiti') || plat.includes('airmax');
            const isMt = plat.includes('mikrotik') || plat.includes('routerboard') || plat.includes('routeros');
            const isMimosa = plat.includes('mimosa') || plat.includes('cambium');

            return `
                <tr style="background:${isAlready ? '#f8fafc' : '#ffffff'}; border-bottom:1px solid #f1f5f9;">
                    <td style="text-align:center; padding:8px 4px;">
                        <input type="checkbox" class="mn-item-cb" data-idx="${idx}" ${!isAlready ? 'checked' : ''} style="cursor:pointer;" />
                    </td>
                    <td style="padding:8px 10px;">
                        <span class="badge" style="background:#1e293b; color:#fff; font-family:monospace; font-size:11px; padding:3px 8px;">
                            ${item.interface || '-'}
                        </span>
                        ${item.is_ether || (item.interface && item.interface.toLowerCase().includes('ether')) ? `
                            <span class="badge" style="background:#059669; color:#fff; font-size:10px; padding:2px 6px; margin-right:4px;">
                                🗼 أساسية
                            </span>
                        ` : `
                            <span class="badge" style="background:#0284c7; color:#fff; font-size:10px; padding:2px 6px; margin-right:4px;">
                                📡 فرعية
                            </span>
                        `}
                    </td>
                    <td style="padding:8px 10px;">
                        <b style="color:#0f172a; font-size:13px;">${this.escape(item.identity || 'بدون اسم')}</b>
                        ${item.version ? `<small style="color:#64748b; display:block; font-size:10px;">OS: ${this.escape(item.version)}</small>` : ''}
                    </td>
                    <td style="padding:8px 10px;">
                        <code style="color:#0284c7; font-weight:700; font-size:12px;">${item.address || '-'}</code>
                    </td>
                    <td style="padding:8px 10px;">
                        <span class="badge" style="background:${isUbi ? '#0284c7' : (isMt ? '#059669' : (isMimosa ? '#d97706' : '#64748b'))}; color:#fff; font-size:11px; padding:3px 8px;">
                            ${this.escape(item.platform || 'جهاز شبكة')}
                        </span>
                    </td>
                    <td style="padding:8px 10px;">
                        <code style="font-size:11px; color:#475569;">${item.mac_address || '-'}</code>
                    </td>
                    <td style="text-align:center; padding:8px 10px;">
                        ${item.already_asset ? `
                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px; padding:3px 8px;">
                                ✅ جهاز مسجل
                            </span>
                        ` : `
                            <span class="badge" style="background:#f59e0b; color:#fff; font-size:11px; padding:3px 8px;">
                                🆕 جهاز جديد
                            </span>
                        `}
                        ${item.already_node ? `
                            <small style="color:#059669; display:block; font-size:10px; margin-top:2px; font-weight:600;">(المنفذ مسجل كنقطة)</small>
                        ` : ''}
                    </td>
                    <td style="text-align:center; white-space:nowrap; padding:8px 10px;">
                        ${item.address ? `
                            <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px; background:#f1f5f9; border:1px solid #cbd5e1; font-weight:600;" title="فحص Ping مباشر للجهاز" onclick="App.pingDeviceLive('${item.address}')">
                                📶 Ping
                            </button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        }).join('');
    },

    filterNeighborsTable() {
        const q = (document.getElementById('mn-filter-search')?.value || '').toLowerCase().trim();
        const port = document.getElementById('mn-filter-port')?.value || '';

        this.filteredNeighbors = (this.cachedNeighborsList || []).filter(item => {
            if (port && item.interface !== port) return false;
            if (!q) return true;
            return (item.identity || '').toLowerCase().includes(q) ||
                   (item.interface || '').toLowerCase().includes(q) ||
                   (item.address || '').toLowerCase().includes(q) ||
                   (item.platform || '').toLowerCase().includes(q) ||
                   (item.mac_address || '').toLowerCase().includes(q);
        });

        this.renderFilteredNeighborsRows();
    },

    toggleAllNeighbors(checked) {
        document.querySelectorAll('.mn-item-cb').forEach(cb => cb.checked = checked);
    },

    selectOnlyNewNeighbors() {
        const cbs = document.querySelectorAll('.mn-item-cb');
        (this.filteredNeighbors || []).forEach((item, i) => {
            if (cbs[i]) {
                cbs[i].checked = !item.already_node && !item.already_asset;
            }
        });
    },

    async pingDeviceLive(ip) {
        const routerId = document.getElementById('mn-router-picker')?.value || this.currentNeighborsRouterId;
        this.toast(`جاري إرسال 3 طلبات Ping إلى (${ip})...`, 'info');

        const res = await this.api('ping_router_device', { id: routerId, target_ip: ip });
        if (res && res.success) {
            alert(`📶 نتيجة فحص Ping إلى (${ip}):\n\nالحزم المرسلة: ${res.packets_sent}\nالحزم المستلمة: ${res.packets_received}\nنسبة الفقدان: ${res.packet_loss}\nمتوسط الاستجابة: ${res.avg_ms ? res.avg_ms + ' ms' : 'غير متاح'}`);
        } else {
            alert(res?.error || 'تعذر إجراء فحص Ping للجهاز');
        }
    },

    async executeNeighborsImport() {
        const selectedIndices = [];
        document.querySelectorAll('.mn-item-cb:checked').forEach(cb => {
            const idx = parseInt(cb.getAttribute('data-idx'), 10);
            if (!isNaN(idx) && this.filteredNeighbors[idx]) {
                selectedIndices.push(this.filteredNeighbors[idx]);
            }
        });

        if (selectedIndices.length === 0) {
            return alert('يرجى تحديد جهاز واحد على الأقل من الجدول للاستيراد');
        }

        const createNodes = document.getElementById('mn-opt-nodes')?.checked;
        const createAssets = document.getElementById('mn-opt-assets')?.checked;
        const assignedAdmin = document.getElementById('mn-assign-user')?.value || null;
        const routerId = document.getElementById('mn-router-picker')?.value || this.currentNeighborsRouterId;

        if (!createNodes && !createAssets) {
            return alert('يرجى تفعيل خيار إنشاء النقاط أو إنشاء الأصول على الأقل');
        }

        const btn = document.getElementById('mn-submit-import-btn');
        if (btn) { btn.disabled = true; btn.innerText = 'جاري المعالجة والحفظ...'; }

        const payload = {
            id: routerId,
            items: selectedIndices,
            options: {
                create_nodes: createNodes,
                create_assets: createAssets,
                assigned_admin_id: assignedAdmin,
                node_type: 'auto'
            }
        };

        const res = await this.api('import_router_neighbors', payload, 'POST');
        if (btn) { btn.disabled = false; btn.innerText = '📥 استيراد الأجهزة المحددة وحفظها فوراً'; }

        if (res && res.success) {
            alert(`🎉 ${res.message || 'تمت عملية الاستيراد بنجاح!'}`);
            this.closeModal();
            // Refresh current view if relevant
            if (this.currentTab === 'network_nodes') this.renderNetworkNodes();
            if (this.currentTab === 'assets') this.renderAssets();
            if (this.currentTab === 'routers') this.renderRouters();
        } else {
            alert(res?.error || 'فشلت عملية الاستيراد');
        }
    },

    // ==========================================
    // MIKROTIK FULL ROUTER CONTROL SUITE
    // ==========================================
    async showRouterControlCenter(nasId, activeTab = 'overview') {
        const routers = this.routerCache || await this.api('get_routers') || [];
        const router = routers.find(r => Number(r.id) === Number(nasId));
        const workTypes = String(router?.work_types || 'hotspot,usermanager').split(',').filter(Boolean);
        const hasHotspot = workTypes.includes('hotspot');
        if (!hasHotspot && ['hotspot_users', 'storage'].includes(activeTab)) activeTab = 'overview';
        const rName = router ? router.shortname : `الراوتر #${nasId}`;
        const rIp = router ? (router.nasname || router.sstp_ip || `10.101.0.${nasId}`) : '';

        this.openModal(`
            <div style="padding:30px; text-align:center; min-height:350px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div style="font-size:38px; margin-bottom:12px;">🎮</div>
                <div style="font-size:16px; font-weight:700; color:#1e293b;">جاري فتح مركز الإدارة والتحكم الشامل بالراوتر...</div>
                <div style="font-size:12px; color:#64748b; margin-top:6px;">${this.escape(rName)} (${rIp})</div>
                <div style="margin-top:18px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#8e44ad;"></i></div>
            </div>
        `, '1100px');

        let tabData = null;
        try {
            if (activeTab === 'overview') {
                tabData = await this.api('get_router_comprehensive_status', { id: nasId });
            } else if (activeTab === 'interfaces' || activeTab === 'line_bonding') {
                tabData = await this.api('get_router_interfaces_traffic', { id: nasId });
            } else if (activeTab === 'hotspot_users') {
                tabData = await this.api('get_router_hotspot_active', { id: nasId });
            } else if (activeTab === 'storage') {
                tabData = await this.api('get_router_files_list', { id: nasId });
            }
        } catch (e) {
            console.error('Control center fetch error:', e);
        }

        this.renderRouterControlCenterContent(nasId, router, activeTab, tabData);
    },

    renderRouterControlCenterContent(nasId, router, activeTab, tabData) {
        const rName = router ? router.shortname : `الراوتر #${nasId}`;
        const rIp = router ? (router.nasname || router.sstp_ip || `10.101.0.${nasId}`) : '';
        const workTypes = String(router?.work_types || 'hotspot,usermanager').split(',').filter(Boolean);
        const hasHotspot = workTypes.includes('hotspot');
        const workTypeLabel = { hotspot: 'Hotspot', usermanager: 'User Manager', line_bonding: 'دمج خطوط' };
        const workTypeBadges = workTypes.map(t => `<span class="badge" style="background:#e0f2fe;color:#0369a1;margin-left:4px;">${workTypeLabel[t] || t}</span>`).join('');

        const tabs = [
            { id: 'overview', name: '📊 لوحة المؤشرات والموارد', icon: '📊' },
            { id: 'interfaces', name: '🔌 المنافذ وحركة المرور', icon: '🔌' },
            ...(hasHotspot ? [
                { id: 'hotspot_users', name: '👥 المتصلين بالهوتسبوت', icon: '👥' },
                { id: 'storage', name: '💾 الذاكرة وملفات الهوتسبوت', icon: '💾' }
            ] : []),
            ...(workTypes.includes('line_bonding') ? [{ id: 'line_bonding', name: '🔗 دمج الخطوط', icon: '🔗' }] : []),
            { id: 'neighbors', name: '🌐 الجيران واكتشاف الشبكة', icon: '🌐' },
            { id: 'terminal', name: '💻 طرفية الأوامر (Web CLI)', icon: '💻' }
        ];

        let contentHtml = '';

        if (activeTab === 'overview') {
            if (!tabData || !tabData.success) {
                contentHtml = `
                    <div style="padding:20px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; margin:10px 0;">
                        <h4 style="margin:0 0 8px 0;">⚠️ تعذر جلب مؤشرات وموارد الراوتر عبر API</h4>
                        <p style="margin:0; font-size:13px;">${this.escape(tabData?.error || 'يرجى التحقق من اتصال نفق SSTP وتفعيل منفذ API في الراوتر.')}</p>
                        <div style="margin-top:12px;">
                            <button class="mt-btn" onclick="App.showRouterControlCenter(${nasId}, 'overview')">⟳ إعادة المحاولة</button>
                        </div>
                    </div>`;
            } else {
                const res = tabData.resources || {};
                const health = tabData.health || {};
                const clock = tabData.clock || {};
                const cpuLoad = parseInt(res['cpu-load'] || 0, 10);
                const freeRam = parseInt(res['free-memory'] || 0, 10);
                const totalRam = parseInt(res['total-memory'] || 1, 10);
                const ramPercent = Math.round(((totalRam - freeRam) / totalRam) * 100) || 0;

                const freeHdd = parseInt(res['free-hdd-space'] || 0, 10);
                const totalHdd = parseInt(res['total-hdd-space'] || 1, 10);
                const hddPercent = Math.round(((totalHdd - freeHdd) / totalHdd) * 100) || 0;

                contentHtml = `
                    <!-- Telemetry Gauges -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:15px; margin-bottom:20px;">
                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:700; color:#475569; font-size:13px;">⚡ استهلاك المعالج (CPU)</span>
                                <span style="font-size:18px; font-weight:800; color:${cpuLoad > 80 ? '#e74c3c' : '#2ecc71'};">${cpuLoad}%</span>
                            </div>
                            <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                                <div style="width:${cpuLoad}%; height:100%; background:${cpuLoad > 80 ? '#e74c3c' : '#2ecc71'}; transition:width 0.3s;"></div>
                            </div>
                            <div style="font-size:11px; color:#64748b; margin-top:6px;">${res.cpu || 'CPU'} (${res['cpu-frequency'] || '-'} MHz)</div>
                        </div>

                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:700; color:#475569; font-size:13px;">🧠 استهلاك الذاكرة (RAM)</span>
                                <span style="font-size:18px; font-weight:800; color:${ramPercent > 85 ? '#e74c3c' : '#3498db'};">${ramPercent}%</span>
                            </div>
                            <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                                <div style="width:${ramPercent}%; height:100%; background:${ramPercent > 85 ? '#e74c3c' : '#3498db'}; transition:width 0.3s;"></div>
                            </div>
                            <div style="font-size:11px; color:#64748b; margin-top:6px;">حر: ${res.free_memory_formatted || '-'} / إجمالي: ${res.total_memory_formatted || '-'}</div>
                        </div>

                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:700; color:#475569; font-size:13px;">💾 المساحة التخزينية (Storage)</span>
                                <span style="font-size:18px; font-weight:800; color:${hddPercent > 90 ? '#e74c3c' : '#9b59b6'};">${hddPercent}%</span>
                            </div>
                            <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                                <div style="width:${hddPercent}%; height:100%; background:${hddPercent > 90 ? '#e74c3c' : '#9b59b6'}; transition:width 0.3s;"></div>
                            </div>
                            <div style="font-size:11px; color:#64748b; margin-top:6px;">حر: ${res.free_hdd_formatted || '-'} / إجمالي: ${res.total_hdd_formatted || '-'}</div>
                        </div>

                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:700; color:#475569; font-size:13px;">⏱️ مدة التشغيل (Uptime)</span>
                                <span style="font-size:14px; font-weight:700; color:#e67e22;">${res.uptime || '-'}</span>
                            </div>
                            <div style="font-size:11px; color:#64748b; margin-top:6px;">التوقيت: ${clock.time || '-'} (${clock['time-zone-name'] || ''})</div>
                            <div style="font-size:11px; color:#64748b;">التاريخ: ${clock.date || '-'}</div>
                        </div>
                    </div>

                    <!-- System Information Details -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                            <h4 style="margin:0 0 10px 0; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">⚙️ مواصفات ونظام الراوتر</h4>
                            <table style="width:100%; font-size:12px; border-collapse:collapse;">
                                <tr><td style="padding:6px 0; color:#64748b;">اسم الجهاز (Identity):</td><td style="font-weight:700;">${tabData.identity || '-'}</td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">الموديل (Board Name):</td><td style="font-weight:700;">${res['board-name'] || res.platform || '-'}</td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">نظام التشغيل (RouterOS):</td><td><span class="badge bg-primary">${res.version || '-'}</span></td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">معمارية النظام:</td><td>${res['architecture-name'] || '-'}</td></tr>
                            </table>
                        </div>

                        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                            <h4 style="margin:0 0 10px 0; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">🌡️ صحة وسلامة الجهاز (Hardware Health)</h4>
                            <table style="width:100%; font-size:12px; border-collapse:collapse;">
                                <tr><td style="padding:6px 0; color:#64748b;">درجة الحرارة:</td><td style="font-weight:700; color:${health.temperature && health.temperature > 65 ? '#e74c3c' : '#27ae60'};">${health.temperature ? health.temperature + ' °C' : 'غير متوفرة بحساس الجهاز'}</td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">الجهد الكهربائي:</td><td style="font-weight:700;">${health.voltage ? (health.voltage / 10).toFixed(1) + ' V' : 'طبيعي'}</td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">مجلد الهوتسبوت المعتمد:</td><td><code>${tabData.router?.hotspot_dir || 'hotspot'}</code></td></tr>
                                <tr><td style="padding:6px 0; color:#64748b;">منفذ FTP لرفع الملفات:</td><td><code>${tabData.router?.ftp_port || 21}</code></td></tr>
                            </table>
                        </div>
                    </div>

                    <!-- Quick Control Actions -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <div style="font-weight:700; font-size:13px; color:#1e293b;">🛠️ إجراءات التحكم السريعة بالنظام</div>
                            <div style="font-size:11px; color:#64748b;">تنفيذ إجراءات الصيانة أو أخذ نسخ احتياطية مباشرة</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="mt-btn" style="background:#27ae60; color:#fff;" onclick="App.createRouterBackupConfirm(${nasId})">📦 أخذ نسخة احتياطية (.backup)</button>
                            <button class="mt-btn mt-btn-danger" onclick="App.rebootRouterConfirm(${nasId})">🔄 إعادة تشغيل الراوتر (Reboot)</button>
                        </div>
                    </div>`;
            }
        } else if (activeTab === 'interfaces' || activeTab === 'line_bonding') {
            if (!tabData || !tabData.success) {
                contentHtml = `
                    <div style="padding:20px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; margin:10px 0;">
                        <h4 style="margin:0 0 8px 0;">⚠️ تعذر جلب بيانات المنافذ</h4>
                        <p style="margin:0; font-size:13px;">${this.escape(tabData?.error || 'تعذر الاتصال بـ RouterOS API')}</p>
                    </div>`;
            } else {
                const ifaces = tabData.interfaces || [];
                contentHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b;">
                            ${activeTab === 'line_bonding' ? '🔗 خطوط ومنافذ الدمج واستهلاك البيانات' : '🔌 منافذ الراوتر واستهلاك البيانات المباشر'} (${ifaces.length} منفذ)
                        </div>
                        <button class="mt-btn" style="font-size:11px; padding:3px 8px;" onclick="App.showRouterControlCenter(${nasId}, 'interfaces')">⟳ تحديث المنافذ والسرعات</button>
                    </div>
                    <div class="mt-table-container" style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; max-height:420px; overflow:auto;">
                        <table class="mt-table" style="width:100%; font-size:12px;">
                            <thead>
                                <tr>
                                    <th>المنفذ</th>
                                    <th>النوع</th>
                                    <th>الحالة</th>
                                    <th>النقطة المرتبطة</th>
                                    <th>معدل النقل اللحظي (Rx / Tx)</th>
                                    <th>إجمالي التحميل (Rx)</th>
                                    <th>إجمالي الرفع (Tx)</th>
                                    <th>التحكم</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ifaces.map(item => {
                                    const isRunning = item.running === 'true' || item.running === true;
                                    const isDisabled = item.disabled === 'true' || item.disabled === true;
                                    const nodeBadge = item.attached_node 
                                        ? `<span class="badge" style="background:#1abc9c; color:#fff;">📍 ${this.escape(item.attached_node.node_name)}</span>`
                                        : `<span style="color:#94a3b8; font-size:11px;">غير مرتبط بنقطة</span>`;
                                    
                                    return `<tr>
                                        <td><b>${this.escape(item.name)}</b></td>
                                        <td><span class="badge bg-secondary">${this.escape(item.type || 'ether')}</span></td>
                                        <td>
                                            ${isDisabled 
                                                ? '<span class="status-pill status-danger">معطل (Disabled)</span>'
                                                : (isRunning ? '<span class="status-pill status-online">نشط (Running)</span>' : '<span class="status-pill status-warning">غير متصل</span>')}
                                        </td>
                                        <td>${nodeBadge}</td>
                                        <td>
                                            <span style="color:#27ae60; font-weight:600;">↓ ${item.rx_rate_formatted || '0 bps'}</span> / 
                                            <span style="color:#2980b9; font-weight:600;">↑ ${item.tx_rate_formatted || '0 bps'}</span>
                                        </td>
                                        <td><code>${item.rx_byte_formatted || '0 B'}</code></td>
                                        <td><code>${item.tx_byte_formatted || '0 B'}</code></td>
                                        <td>
                                            ${isDisabled
                                                ? `<button class="mt-btn mt-btn-success" style="padding:2px 7px; font-size:11px;" onclick="App.toggleRouterInterfaceState(${nasId}, '${this.escape(item.name)}', 1)">✓ تفعيل</button>`
                                                : `<button class="mt-btn mt-btn-danger" style="padding:2px 7px; font-size:11px;" onclick="App.toggleRouterInterfaceState(${nasId}, '${this.escape(item.name)}', 0)">✕ تعطيل</button>`}
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`;
            }
        } else if (activeTab === 'hotspot_users') {
            if (!tabData || !tabData.success) {
                contentHtml = `
                    <div style="padding:20px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; margin:10px 0;">
                        <h4 style="margin:0 0 8px 0;">⚠️ تعذر جلب المستخدمين المتصلين بالهوتسبوت</h4>
                        <p style="margin:0; font-size:13px;">${this.escape(tabData?.error || 'تأكد من تشغيل خادم الهوتسبوت بالراوتر وصحة الربط.')}</p>
                    </div>`;
            } else {
                const users = tabData.active_users || [];
                contentHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b;">
                            👥 الجلسات المتصلة حالياً بالهوتسبوت: <b>${users.length}</b> مستخدم
                        </div>
                        <button class="mt-btn" style="font-size:11px; padding:3px 8px;" onclick="App.showRouterControlCenter(${nasId}, 'hotspot_users')">⟳ تحديث الجلسات</button>
                    </div>
                    ${users.length === 0 ? `
                        <div style="padding:35px; text-align:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b;">
                            لا توجد جلسات هوتسبوت نشطة متصلة بهذا الراوتر حالياً.
                        </div>
                    ` : `
                        <div class="mt-table-container" style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; max-height:420px; overflow:auto;">
                            <table class="mt-table" style="width:100%; font-size:12px;">
                                <thead>
                                    <tr>
                                        <th>المستخدم / كود الكرت</th>
                                        <th>عنوان IP</th>
                                        <th>عنوان MAC</th>
                                        <th>مدة الاتصال (Uptime)</th>
                                        <th>الوقت المتبقي</th>
                                        <th>حجم الاستهلاك (تحميل / رفع)</th>
                                        <th>طرد الجلسة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${users.map(u => `
                                        <tr>
                                            <td><b>${this.escape(u.user || '-')}</b></td>
                                            <td><code>${this.escape(u.address || '-')}</code></td>
                                            <td><code>${this.escape(u['mac-address'] || '-')}</code></td>
                                            <td>${this.escape(u.uptime || '-')}</td>
                                            <td>${this.escape(u['session-time-left'] || 'مفتوح')}</td>
                                            <td>
                                                <span style="color:#27ae60;">↓ ${this.formatBytes(u['bytes-out'] || 0)}</span> / 
                                                <span style="color:#2980b9;">↑ ${this.formatBytes(u['bytes-in'] || 0)}</span>
                                            </td>
                                            <td>
                                                <button class="mt-btn mt-btn-danger" style="padding:2px 7px; font-size:11px;" onclick="App.kickHotspotUserSession(${nasId}, '${this.escape(u['.id'] || u.user)}')">⚡ طرد (Kick)</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}`;
            }
        } else if (activeTab === 'storage') {
            const files = tabData?.files || [];
            contentHtml = `
                <!-- Hotspot Login Deployer Banner -->
                <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:#fff; border-radius:8px; padding:18px; margin-bottom:18px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div style="max-width:650px;">
                            <h4 style="margin:0 0 6px 0; font-size:16px;">🚀 رفع وتثبيت صفحة تسجيل الدخول لكرت الهوتسبوت (Hotspot Login)</h4>
                            <p style="margin:0; font-size:12px; opacity:0.9; line-height:1.6;">
                                بضغطة زر واحدة، يقوم النظام بتوليد ورفع واجهات تسجيل دخول الهوتسبوت الحديثة ذات التصميم العربي المتجاوب بالكامل 
                                (مع شاشات تسجيل الدخول، معرفة الرصيد المتبقي، سرعة الكرت، وزر تسجيل الخروج) مباشرة إلى ذاكرة الراوتر في مجلد: 
                                <code>${router?.hotspot_dir || 'hotspot'}</code>
                            </p>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button class="mt-btn" style="background:#0284c7; color:#fff; font-weight:800; padding:10px 16px; font-size:13px; border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);" onclick="App.closeModal(); App.switchTab('hotspot_designer')">
                                🎨 استوديو وتخصيص الهوتسبوت
                            </button>
                            <button id="btn-deploy-hotspot" class="mt-btn" style="background:#00e676; color:#111; font-weight:800; padding:10px 18px; font-size:13px; border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);" onclick="App.deployHotspotLoginTemplateNow(${nasId})">
                                🚀 رفع وتثبيت بالراوتر الآن
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Storage Files List -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-weight:700; font-size:13px; color:#1e293b;">
                        💾 مستعرض ملفات الذاكرة الداخلية للراوتر (${files.length} ملف/مجلد)
                    </div>
                    <button class="mt-btn" style="font-size:11px; padding:3px 8px;" onclick="App.showRouterControlCenter(${nasId}, 'storage')">⟳ تحديث قائمة الملفات</button>
                </div>
                ${files.length === 0 ? `
                    <div style="padding:30px; text-align:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b;">
                        لا توجد ملفات متوفرة أو لم يتم تفعيل بروتوكول قراءة الملفات.
                    </div>
                ` : `
                    <div class="mt-table-container" style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; max-height:360px; overflow:auto;">
                        <table class="mt-table" style="width:100%; font-size:12px;">
                            <thead>
                                <tr>
                                    <th>اسم الملف / المسار</th>
                                    <th>النوع</th>
                                    <th>الحجم</th>
                                    <th>تاريخ الإنشاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${files.map(f => `
                                    <tr>
                                        <td><b>${this.escape(f.name || '-')}</b></td>
                                        <td><span class="badge ${f.type === 'directory' ? 'bg-warning text-dark' : 'bg-secondary'}">${this.escape(f.type || 'file')}</span></td>
                                        <td><code>${f.size_formatted || this.formatBytes(f.size || 0)}</code></td>
                                        <td style="color:#64748b;">${this.escape(f['creation-time'] || '-')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}`;
        } else if (activeTab === 'neighbors') {
            contentHtml = `
                <div style="padding:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center;">
                    <div style="font-size:38px; margin-bottom:10px;">📡</div>
                    <h3 style="margin:0 0 8px 0; color:#1e293b;">مستكشف جيران ميكروتك وسحب النقاط تلقائياً</h3>
                    <p style="margin:0 auto 18px auto; max-width:600px; font-size:13px; color:#64748b; line-height:1.6;">
                        يقوم النظام بالاستعلام عن بروتوكولات الاكتشاف (MNDP / LLDP / CDP) مباشرة من الراوتر عبر بروتوكول RouterOS API، 
                        لاستكشاف جميع أجهزة البث الهوائي، والروابط، والنقاط الأساسية والفرعية المتصلة بمنافذه، 
                        مع إمكانية إضافتها وتعيينها كأصول ونقاط شبكة مع مسؤوليها فوراً.
                    </p>
                    <button class="mt-btn mt-btn-primary" style="padding:10px 20px; font-size:14px; font-weight:700;" onclick="App.showMikrotikNeighborsModal(${nasId})">
                        📡 فتح مستكشف الجيران وسحب النقاط الآن
                    </button>
                </div>`;
        } else if (activeTab === 'terminal') {
            contentHtml = `
                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b;">💻 طرفية أوامر RouterOS السريعة (Web CLI)</div>
                        <div style="font-size:11px; color:#64748b;">يمكنك تنفيذ أوامر RouterOS مباشرة واستلام النتائج الفورية</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                        <span style="font-size:11px; color:#475569; align-self:center;">أوامر سريعة:</span>
                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="document.getElementById('cli-cmd-input').value='/interface print'; App.executeRouterCliCommand(${nasId});">/interface print</button>
                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="document.getElementById('cli-cmd-input').value='/ip address print'; App.executeRouterCliCommand(${nasId});">/ip address print</button>
                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="document.getElementById('cli-cmd-input').value='/ip hotspot user print'; App.executeRouterCliCommand(${nasId});">/ip hotspot user print</button>
                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="document.getElementById('cli-cmd-input').value='/ip dhcp-server lease print'; App.executeRouterCliCommand(${nasId});">/ip dhcp-server lease print</button>
                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="document.getElementById('cli-cmd-input').value='/system resource print'; App.executeRouterCliCommand(${nasId});">/system resource print</button>
                    </div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <input id="cli-cmd-input" class="mt-input" style="flex:1; direction:ltr; text-align:left; font-family:monospace;" placeholder="مثال: /interface print" onkeydown="if(event.key==='Enter') App.executeRouterCliCommand(${nasId});" />
                        <button id="cli-exec-btn" class="mt-btn mt-btn-primary" onclick="App.executeRouterCliCommand(${nasId})">⚡ تنفيذ الأمر</button>
                    </div>
                    <pre id="cli-output-pre" style="background:#1e1e1e; color:#00ff66; padding:12px; border-radius:6px; font-family:Consolas, Monaco, monospace; font-size:12px; min-height:200px; max-height:350px; overflow:auto; direction:ltr; text-align:left; white-space:pre-wrap; margin:0;">جاهز لاستقبال الأوامر...</pre>
                </div>`;
        }

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:1100px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column;">
                <!-- Header -->
                <div class="mt-modal-header" style="background:#1e293b; color:#fff; padding:12px 18px; border-top-left-radius:8px; border-top-right-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:20px;">🎮</span>
                        <div>
                            <div style="font-weight:700; font-size:15px;">مركز الإدارة والتحكم: <b>${this.escape(rName)}</b></div>
                            <div style="font-size:11px; opacity:0.8; font-family:monospace;">${rIp} — API: ${router?.api_port || 8728}</div>
                            <div style="margin-top:5px;">${workTypeBadges}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button class="mt-btn" style="background:#334155; color:#fff; border:1px solid #475569; font-size:11px; padding:3px 8px;" onclick="App.showRouterControlCenter(${nasId}, '${activeTab}')">⟳ تحديث</button>
                        <span style="cursor:pointer; font-size:18px; line-height:1;" onclick="App.closeModal()">✕</span>
                    </div>
                </div>

                <!-- Tabs Bar -->
                <div style="display:flex; background:#f1f5f9; border-bottom:1px solid #cbd5e1; padding:0 12px; gap:4px; overflow-x:auto;">
                    ${tabs.map(t => `
                        <button type="button" 
                                style="padding:10px 14px; border:none; background:${activeTab === t.id ? '#fff' : 'transparent'}; 
                                       font-weight:${activeTab === t.id ? '700' : '500'}; 
                                       color:${activeTab === t.id ? '#8e44ad' : '#64748b'}; 
                                       border-bottom:${activeTab === t.id ? '3px solid #8e44ad' : '3px solid transparent'}; 
                                       cursor:pointer; font-size:13px; white-space:nowrap; transition:all 0.2s;"
                                onclick="App.showRouterControlCenter(${nasId}, '${t.id}')">
                            ${t.name}
                        </button>
                    `).join('')}
                </div>

                <!-- Body -->
                <div class="mt-modal-body" style="padding:18px; overflow-y:auto; flex:1; background:#f8fafc;">
                    ${contentHtml}
                </div>
            </div>
        </div>`;

        document.getElementById('modal-container').innerHTML = modalHtml;
    },

    async toggleRouterInterfaceState(nasId, ifaceName, newState) {
        const actionText = newState ? 'تفعيل' : 'تعطيل';
        if (!confirm(`هل أنت متأكد من رغبتك في ${actionText} المنفذ (${ifaceName})؟`)) return;

        this.toast(`جاري ${actionText} المنفذ...`, 'info');
        const res = await this.api('set_router_interface_state', { id: nasId, interface: ifaceName, enabled: newState }, 'POST');
        if (res && res.success) {
            this.toast(res.message || `تم ${actionText} المنفذ بنجاح`, 'success');
            await this.showRouterControlCenter(nasId, 'interfaces');
        } else {
            this.toast(res?.error || 'تعذر تغيير حالة المنفذ', 'danger');
        }
    },

    async kickHotspotUserSession(nasId, userOrId) {
        if (!confirm(`هل أنت متأكد من طرد جلسة المستخدم (${userOrId}) فوراً من الراوتر؟`)) return;

        this.toast('جاري طرد المستخدم...', 'info');
        const res = await this.api('kick_router_hotspot_user', { id: nasId, user: userOrId }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم طرد المستخدم بنجاح', 'success');
            await this.showRouterControlCenter(nasId, 'hotspot_users');
        } else {
            this.toast(res?.error || 'تعذر فصل المستخدم', 'danger');
        }
    },

    async deployHotspotLoginTemplateNow(nasId) {
        const btn = document.getElementById('btn-deploy-hotspot');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ جاري الرفع والتثبيت على الراوتر...';
        }

        this.toast('جاري رفع حزمة واجهات الهوتسبوت الحديثة إلى ذاكرة الراوتر...', 'info');
        const res = await this.api('deploy_hotspot_template', { id: nasId }, 'POST');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🚀 رفع وتثبيت صفحة الهوتسبوت الآن';
        }

        if (res && res.success) {
            alert(`✅ ${res.message}\n\nطريقة الرفع: ${res.method}\nالمسار بالراوتر: ${res.hotspot_dir}\nالملفات المرفوعة: ${res.deployed_files.join(', ')}`);
            this.toast('تم رفع وتثبيت صفحة الهوتسبوت بنجاح', 'success');
            await this.showRouterControlCenter(nasId, 'storage');
        } else {
            alert(`❌ فشل رفع صفحة الهوتسبوت:\n${res?.error || 'يرجى التأكد من تفعيل خدمة FTP بالراوتر أو التحقق من مسار الذاكرة.'}`);
        }
    },

    async executeRouterCliCommand(nasId) {
        const input = document.getElementById('cli-cmd-input');
        const pre = document.getElementById('cli-output-pre');
        const btn = document.getElementById('cli-exec-btn');
        const cmd = input?.value?.trim();
        if (!cmd) return;

        if (btn) btn.disabled = true;
        pre.textContent += `\n> ${cmd}\n[جاري التنفيذ...]\n`;
        pre.scrollTop = pre.scrollHeight;

        const res = await this.api('execute_router_terminal_command', { id: nasId, command: cmd }, 'POST');
        if (btn) btn.disabled = false;

        if (res && res.success) {
            const outStr = typeof res.output === 'object' ? JSON.stringify(res.output, null, 2) : String(res.output);
            pre.textContent += `${outStr}\n`;
        } else {
            pre.textContent += `خطأ: ${res?.error || 'تعذر تنفيذ الأمر'}\n`;
        }
        pre.scrollTop = pre.scrollHeight;
    },

    async rebootRouterConfirm(nasId) {
        if (!confirm('⚠️ تحذير: هل أنت متأكد من إعادة تشغيل راوتر ميكروتك (Reboot)؟\nستنقطع الخدمة مؤقتًا لدقائق حتى يكتمل إقلاع الراوتر.')) return;

        this.toast('جاري إرسال أمر إعادة التشغيل للراوتر...', 'warning');
        const res = await this.api('reboot_router', { id: nasId }, 'POST');
        if (res && res.success) {
            alert('✅ ' + (res.message || 'تم إرسال أمر إعادة تشغيل الراوتر بنجاح'));
            this.closeModal();
            this.renderRouters();
        } else {
            this.toast(res?.error || 'تعذر إعادة تشغيل الراوتر', 'danger');
        }
    },

    async createRouterBackupConfirm(nasId) {
        const backupName = prompt('أدخل اسم النسخة الاحتياطية (أو اتركه فارغاً للاسم التلقائي):', 'backup_' + new Date().toISOString().slice(0,10));
        if (backupName === null) return;

        this.toast('جاري إنشاء النسخة الاحتياطية بالراوتر...', 'info');
        const res = await this.api('create_router_backup', { id: nasId, backup_name: backupName }, 'POST');
        if (res && res.success) {
            alert(`✅ ${res.message}\nاسم الملف: ${res.backup_file}`);
            this.toast('تم إنشاء النسخة الاحتياطية بنجاح', 'success');
            await this.showRouterControlCenter(nasId, 'storage');
        } else {
            this.toast(res?.error || 'تعذر إنشاء النسخة الاحتياطية', 'danger');
        }
    },



// ==========================================
    // MOBILE SIDEBAR DRAWER CONTROLS
    // ==========================================
    toggleMobileSidebar() {
        const sidebar = document.querySelector('.mt-sidebar');
        const overlay = document.getElementById('mt-sidebar-overlay');
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
    },

    closeMobileSidebar() {
        const sidebar = document.querySelector('.mt-sidebar');
        const overlay = document.getElementById('mt-sidebar-overlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    },

    // ==========================================
    // ACTIVE LIVE SESSIONS (الجلسات المباشرة المتصلة)
    // ==========================================
        async renderActiveSessions(fetchFresh = false) {
        if (this.currentTab !== 'active_sessions') return;
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        // Remember active input focus and caret position before re-rendering
        const activeEl = document.activeElement;
        const isSearchFocused = activeEl && activeEl.classList && activeEl.classList.contains('quick-table-search-input');
        const caretPos = isSearchFocused ? activeEl.selectionStart : null;

        const isFirstRender = !mainView.querySelector('.sam-page-shell[data-sam-page="active-sessions"]');

        if (isFirstRender && !this._activeSessionsCache) {
            mainView.innerHTML = `
                <main class="sam-page-shell sam-ui-page" data-sam-page="active-sessions" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">⚡</span>
                            <div>
                                <span class="sam-page-eyebrow">LIVE MONITORING</span>
                                <h1>الجلسات المباشرة المتصلة</h1>
                                <p>جاري جلب الجلسات النشطة من خادم RADIUS...</p>
                            </div>
                        </div>
                    </header>
                    <div class="view-scroll-content" style="padding:40px; text-align:center;">
                        <span class="sam-ui-spinner" style="width:36px; height:36px; margin-bottom:12px;"></span>
                        <div style="color:var(--sam-text-muted); font-size:13px;">جاري تحديث الجلسات المتصلة الآن...</div>
                    </div>
                </main>
            `;
        }

        // Fetch fresh data if requested or cache is missing
        if (fetchFresh || !this._activeSessionsCache) {
            try {
                const resUsers = await this.api('get_active_sessions');
                if (resUsers) {
                    this._activeSessionsCache = Array.isArray(resUsers) ? resUsers : (resUsers.sessions || []);
                }
            } catch (e) {
                console.warn('Failed to refresh active sessions:', e);
            }
        }

        const sessions = this._activeSessionsCache || [];
        let userSessions = sessions.filter(s => !String(s.username || '').startsWith('router_'));

        // Search query filter (search by Card / IP / MAC / Router / Port / Package / Node / Responsible)
        if (this.sessionsSearch) {
            const q = String(this.sessionsSearch).toLowerCase().trim();
            userSessions = userSessions.filter(s => 
                (s.username || '').toLowerCase().includes(q) ||
                (s.framedipaddress || '').includes(q) ||
                (s.callingstationid || '').toLowerCase().includes(q) ||
                (s.nasipaddress || '').includes(q) ||
                (s.nas_shortname || s.router_name || '').toLowerCase().includes(q) ||
                (s.nasportid || '').toLowerCase().includes(q) ||
                (s.profile_name || '').toLowerCase().includes(q) ||
                (s.node_name || '').toLowerCase().includes(q) ||
                (s.node_display_name || '').toLowerCase().includes(q) ||
                (s.responsible_name || '').toLowerCase().includes(q) ||
                (s.responsible_phone || '').includes(q) ||
                (s.parent_node_name || '').toLowerCase().includes(q) ||
                (s.node_location || '').toLowerCase().includes(q)
            );
        }

        this._lastSessionsList = userSessions;

        // Custom robust sorting for Active Sessions
        this.sessionsSortCol = this.sessionsSortCol || 'acctstarttime';
        this.sessionsSortDir = this.sessionsSortDir || 'desc';
        userSessions = this.sortActiveSessions(userSessions, this.sessionsSortCol, this.sessionsSortDir);

        this.sessionsPage = this.sessionsPage || 1;
        this.sessionsLimit = this.sessionsLimit || 50;
        const paginated = this.genericPaginate(userSessions, this.sessionsPage, this.sessionsLimit);
        const pageSessions = paginated.data;

        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            { label: '📊 تصدير Excel', variant: 'secondary', onclick: 'App.exportSessionsCSV()' },
            { label: '🖨️ طباعة A4', variant: 'secondary', onclick: 'App.printSessionsTable()' },
            (this.can('sessions_disconnect') && this.selectedSessions.size > 0) ? {
                label: `⚡ فصل المحدد (${this.selectedSessions.size})`,
                variant: 'danger',
                onclick: 'App.disconnectSelectedSessions()'
            } : null,
            (this.can('sessions_disconnect') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? {
                label: '🧹 تنظيف العالقة',
                variant: 'danger',
                onclick: 'App.cleanupStaleSessions()',
                title: 'تنظيف الجلسات العالقة'
            } : null,
            { label: '⟳ تحديث حي', variant: 'primary', onclick: 'App.renderActiveSessions(true)' }
        ].filter(Boolean);

        // 2. Stats
        const stats = [
            { label: 'كروت المشتركين المتصلين', value: userSessions.length.toLocaleString(), icon: '👥', tone: 'green' },
            { label: 'جلسات الصفحة الحالية', value: pageSessions.length.toLocaleString(), icon: '⚡', tone: 'cyan' },
            { label: 'حالة التحديث اللحظي', value: 'نشط (كل 5ث)', icon: '🔄', tone: 'purple' }
        ];

        this.sessionsViewMode = this.sessionsViewMode || 'table';

        // 3. Toolbar
        const toolbar = {
            left: [
                `<div style="display:inline-flex; align-items:center; background:var(--sam-bg-secondary, #f1f5f9); padding:3px; border-radius:8px; border:1px solid var(--sam-border, #cbd5e1); gap:4px;">
                    <button type="button" class="sam-btn sam-btn--xs ${this.sessionsViewMode !== 'tree' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.sessionsViewMode='table'; App.renderActiveSessions(false);" style="min-height:28px; padding:4px 12px; font-weight:700;">
                        📋 جدول مباشر
                    </button>
                    <button type="button" class="sam-btn sam-btn--xs ${this.sessionsViewMode === 'tree' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.sessionsViewMode='tree'; App.renderActiveSessions(false);" style="min-height:28px; padding:4px 12px; font-weight:700;">
                        🌳 شجرة المنافذ والنقاط
                    </button>
                </div>`,
                this.sessionsViewMode === 'tree' ? `
                    <div style="display:inline-flex; align-items:center; gap:4px; margin-inline-start:6px;">
                        <button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" onclick="App.collapseAllSessionTree()" title="طي كافة الراوترات والمنافذ" style="min-height:28px; padding:4px 10px; font-weight:700; border-radius:6px; font-size:11.5px;">
                            📁 طي الكل
                        </button>
                        <button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" onclick="App.expandAllSessionTree()" title="توسيع كافة الراوترات والمنافذ" style="min-height:28px; padding:4px 10px; font-weight:700; border-radius:6px; font-size:11.5px;">
                            📂 توسيع الكل
                        </button>
                    </div>
                ` : '',
                `<span style="font-size:12.5px; color:var(--sam-text-secondary); font-weight:700; margin-right:8px;">${this.sessionsViewMode === 'tree' ? 'عرض شجري هرمي حسب الراوترات ومنافذ النقاط ومسؤوليها:' : 'المشتركون المتصلون حالياً مع ربط منافذهم بنقاط الشبكة ومسؤوليها:'}</span>`
            ].filter(Boolean),
            right: [
                `<div class="quick-table-search" style="margin:0; min-width:280px;">
                    <span class="quick-table-search-icon">🔍</span>
                    <input type="text" class="quick-table-search-input" placeholder="تصفية بالكرت، المنفذ، النقطة، أو المسؤول..." value="${this.escape(this.sessionsSearch || '')}" oninput="App.onSessionsLiveSearch(this.value)" />
                    ${this.sessionsSearch ? `<span style="position:absolute; left:8px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:12px; color:var(--sam-text-muted);" onclick="App.onSessionsLiveSearch('')" title="إلغاء التصفية">✕</span>` : ''}
                </div>`
            ]
        };

        // 4. Tables HTML
        const userRowsHtml = pageSessions.map((s, idx) => {
            const upBytes = parseInt(s.acctinputoctets) || 0;
            const downBytes = parseInt(s.acctoutputoctets) || 0;
            const totalBytes = upBytes + downBytes;
            const dur = (s.live_duration !== undefined && s.live_duration !== null && s.live_duration > 0) ? s.live_duration : (s.acctsessiontime || 0);

            return `
            <tr>
                <td style="text-align:center;"><input type="checkbox" class="session-row-cb" value="${s.username}" ${this.selectedSessions.has(s.username)?'checked':''} onchange="App.toggleSelectSession('${s.username}', this.checked)" /></td>
                <td>${paginated.start_index + idx}</td>
                <td style="cursor:pointer;" onclick="App.showActiveCardDetails('${this.escape(s.username)}')">
                    <b style="color:var(--sam-primary); text-decoration:underline;">${this.escape(s.username)}</b>
                    <span style="font-size:10px; color:var(--sam-primary); opacity:0.8; margin-right:4px;">🔍 تفاصيل</span>
                </td>
                <td style="direction:ltr; text-align:left;"><code>${this.escape(s.framedipaddress || '-')}</code></td>
                <td style="direction:ltr; text-align:left; font-size:11px; color:var(--sam-text-muted);">${this.escape(s.callingstationid || '-')}</td>
                <td><b>${this.escape(s.nas_shortname || s.router_name || s.nasipaddress)}</b></td>
                <td>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <span class="sam-badge sam-badge--subtle" style="font-family:monospace; font-weight:700; align-self:flex-start;">🔌 ${this.escape(s.nasportid || 'Default')}</span>
                        ${s.node_id ? `
                            <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:2px;">
                                <span class="badge" style="background:${s.node_type === 'main_node' ? '#f59e0b' : '#10b981'}; color:#fff; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px;" title="${s.node_type === 'main_node' ? 'نقطة أساسية' : 'نقطة فرعية'}">
                                    ${s.node_type === 'main_node' ? '🗼' : '📡'} ${this.escape(s.node_name)}
                                </span>
                                ${s.node_display_name && s.node_display_name !== s.node_name ? `<span style="color:#0369a1; font-size:11px; font-weight:700;" title="الاسم الظاهر للمستخدمين">🏷️ ${this.escape(s.node_display_name)}</span>` : ''}
                            </div>
                        ` : `
                            <div style="margin-top:2px;">
                                <button type="button" class="sam-btn sam-btn--xs" style="padding:1px 7px; font-size:10.5px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe; border-radius:4px; font-weight:700;" onclick="App.showAddNodeModal(null, '${this.escape(s.nasipaddress || '')}', '${this.escape(s.nasportid || '')}')" title="ربط هذا المنفذ بنقطة شبكة جديدة أو موجودة">
                                    ➕ ربط بنقطة
                                </button>
                            </div>
                        `}
                    </div>
                </td>
                <td>
                    ${s.responsible_name ? `
                        <div style="font-size:11.5px;">
                            <b style="color:#0f172a; display:flex; align-items:center; gap:4px;">👤 ${this.escape(s.responsible_name)}</b>
                            ${s.responsible_phone ? `<div style="font-size:10.5px; margin-top:2px;"><a href="tel:${this.escape(s.responsible_phone)}" style="color:#0284c7; text-decoration:none; font-weight:600; direction:ltr; display:inline-block;">📱 ${this.escape(s.responsible_phone)}</a></div>` : ''}
                        </div>
                    ` : '<span style="color:var(--sam-text-muted, #94a3b8); font-size:11px;">-</span>'}
                </td>
                <td style="font-size:11px; color:var(--sam-text-muted);">${this.escape(s.acctstarttime || '-')}</td>
                <td><b>${this.formatUptime(dur)}</b></td>
                <td style="color:var(--sam-success); font-weight:600;">↓ ${this.formatBytes(downBytes)}</td>
                <td style="color:var(--sam-info); font-weight:600;">↑ ${this.formatBytes(upBytes)}</td>
                <td><b>${this.formatBytes(totalBytes)}</b></td>
                <td style="text-align:center;">
                    ${this.can('sessions_disconnect') ? `
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.disconnectSessionPrompt('${this.escape(s.username)}', '${this.escape(s.nasipaddress)}', '${this.escape(s.framedipaddress)}')" title="فصل الجلسة فوراً (CoA/PoD)">
                        ✕ فصل
                    </button>` : '<span style="color:var(--sam-text-subtle); font-size:11px;">-</span>'}
                </td>
            </tr>
            `;
        }).join('');

        // 5. Build Hierarchical Tree Topology HTML (Router -> Port / Node -> Package -> Users)
        let treeHtml = '';
        if (this.sessionsViewMode === 'tree') {
            if (!this._collapsedSessionNodes || !(this._collapsedSessionNodes instanceof Set)) {
                this._collapsedSessionNodes = new Set();
            }
            const routerMap = new Map();
            userSessions.forEach(s => {
                const rKey = s.nasipaddress || 'unknown';
                const rName = s.nas_shortname || s.router_name || s.nasipaddress || 'الراوتر الرئيسي';
                if (!routerMap.has(rKey)) {
                    routerMap.set(rKey, {
                        ip: s.nasipaddress,
                        name: rName,
                        totalSessions: 0,
                        totalInput: 0,
                        totalOutput: 0,
                        ports: new Map()
                    });
                }
                const rObj = routerMap.get(rKey);
                rObj.totalSessions++;
                const inB = parseInt(s.acctinputoctets) || 0;
                const outB = parseInt(s.acctoutputoctets) || 0;
                rObj.totalInput += inB;
                rObj.totalOutput += outB;

                const portKey = s.nasportid || 'Default';
                if (!rObj.ports.has(portKey)) {
                    rObj.ports.set(portKey, {
                        name: portKey,
                        nodeId: s.node_id || null,
                        nodeName: s.node_name || null,
                        nodeDisplayName: s.node_display_name || null,
                        nodeType: s.node_type || null,
                        responsibleName: s.responsible_name || null,
                        responsiblePhone: s.responsible_phone || null,
                        totalSessions: 0,
                        totalInput: 0,
                        totalOutput: 0,
                        packages: new Map()
                    });
                }
                const pObj = rObj.ports.get(portKey);
                pObj.totalSessions++;
                pObj.totalInput += inB;
                pObj.totalOutput += outB;
                if (!pObj.nodeName && s.node_name) {
                    pObj.nodeId = s.node_id;
                    pObj.nodeName = s.node_name;
                    pObj.nodeDisplayName = s.node_display_name;
                    pObj.nodeType = s.node_type;
                    pObj.responsibleName = s.responsible_name;
                    pObj.responsiblePhone = s.responsible_phone;
                }

                const pkgKey = s.profile_name || 'باقة عامة';
                if (!pObj.packages.has(pkgKey)) {
                    pObj.packages.set(pkgKey, {
                        name: pkgKey,
                        totalSessions: 0,
                        totalInput: 0,
                        totalOutput: 0,
                        subscribers: []
                    });
                }
                const pkgObj = pObj.packages.get(pkgKey);
                pkgObj.totalSessions++;
                pkgObj.totalInput += inB;
                pkgObj.totalOutput += outB;
                pkgObj.subscribers.push(s);
            });

            if (routerMap.size === 0) {
                treeHtml = `
                    <div style="text-align:center; padding:48px 16px; background:var(--sam-bg-surface, #ffffff); border-radius:12px; border:1px dashed var(--sam-border, #cbd5e1); color:var(--sam-text-muted);">
                        <span style="font-size:36px; display:block; margin-bottom:8px;">📡</span>
                        <b>${this.sessionsSearch ? 'لا توجد جلسات مطابقة لمعايير البحث في الشجرة' : 'لا توجد جلسات متصلة حالياً لعرض الشجرة الهيكلية'}</b>
                    </div>
                `;
            } else {
                treeHtml = `
                    <div class="sam-tree-view-wrapper" style="display:flex; flex-direction:column; gap:16px;">
                        ${Array.from(routerMap.values()).map((r, rIdx) => {
                            const rNodeId = 'r_' + String(r.ip || rIdx).replace(/[^a-zA-Z0-9_-]/g, '_');
                            const isRCollapsed = this._collapsedSessionNodes.has(rNodeId);
                            return `
                            <div class="sam-card" style="border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; overflow:hidden; box-shadow:var(--sam-shadow-sm, 0 1px 3px rgba(0,0,0,0.05)); background:var(--sam-bg-surface, #ffffff);">
                                <!-- Router Header (Click to Collapse/Expand) -->
                                <div class="sam-tree-header" data-session-tree-node="${rNodeId}" onclick="App.toggleSessionTreeNode('${rNodeId}')" style="cursor:pointer; user-select:none; padding:12px 18px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#ffffff; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; transition:filter 0.15s ease;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter='none'">
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <span id="session-tree-chevron-${rNodeId}" style="display:inline-block; transition:transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); transform:${isRCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; font-size:14px; color:#38bdf8; font-weight:bold;">▼</span>
                                        <span style="font-size:22px; background:rgba(255,255,255,0.12); padding:6px 10px; border-radius:8px;">📡</span>
                                        <div>
                                            <div style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                                                <span>${this.escape(r.name)}</span>
                                                <code style="background:rgba(255,255,255,0.18); color:#38bdf8; font-size:12px; padding:2px 8px; border-radius:4px;">${this.escape(r.ip || '-')}</code>
                                            </div>
                                            <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
                                                المنافذ النشطة: <b>${r.ports.size}</b> | إجمالي الاستهلاك: <b>↓ ${this.formatBytes(r.totalOutput)}</b> / <b>↑ ${this.formatBytes(r.totalInput)}</b>
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <span class="sam-badge" style="background:#0284c7; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:20px;">
                                            👥 ${r.totalSessions.toLocaleString()} متصل
                                        </span>
                                        <span style="font-size:11.5px; color:#94a3b8; opacity:0.85;">${isRCollapsed ? '◀ توسيع' : '▼ طي'}</span>
                                    </div>
                                </div>

                                <!-- Ports List Under Router -->
                                <div id="session-tree-body-${rNodeId}" style="padding:16px; display:${isRCollapsed ? 'none' : 'flex'}; flex-direction:column; gap:14px; background:var(--sam-bg-base, #f8fafc);">
                                    ${Array.from(r.ports.values()).map((p, pIdx) => {
                                        const pNodeId = rNodeId + '_p_' + String(p.name || pIdx).replace(/[^a-zA-Z0-9_-]/g, '_');
                                        const isPCollapsed = this._collapsedSessionNodes.has(pNodeId);
                                        return `
                                        <div style="border:1px solid var(--sam-border, #e2e8f0); border-radius:10px; background:var(--sam-bg-surface, #ffffff); overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                                            <!-- Port Header (Click to Collapse/Expand) -->
                                            <div class="sam-tree-header" data-session-tree-node="${pNodeId}" onclick="App.toggleSessionTreeNode('${pNodeId}')" style="cursor:pointer; user-select:none; padding:10px 14px; background:#f1f5f9; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; transition:background 0.15s ease;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                                    <span id="session-tree-chevron-${pNodeId}" style="display:inline-block; transition:transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); transform:${isPCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; font-size:12px; color:#0f766e; font-weight:bold;">▼</span>
                                                    <span style="font-size:16px;">🔌</span>
                                                    <span style="font-weight:700; font-size:13px; color:#1e293b;">المنفذ: <code style="color:#0f766e; background:#ccfbf1; padding:2px 6px; border-radius:4px;">${this.escape(p.name)}</code></span>
                                                    ${p.nodeName ? `
                                                        <span class="badge" style="background:${p.nodeType === 'main_node' ? '#f59e0b' : '#10b981'}; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px;">
                                                            ${p.nodeType === 'main_node' ? '🗼 نقطة أساسية: ' : '📡 نقطة فرعية: '} ${this.escape(p.nodeName)}
                                                        </span>
                                                        ${p.nodeDisplayName && p.nodeDisplayName !== p.nodeName ? `<span style="color:#0369a1; font-weight:700; font-size:11.5px;">(🏷️ ${this.escape(p.nodeDisplayName)})</span>` : ''}
                                                        ${p.responsibleName ? `<span style="color:#475569; font-size:11.5px; font-weight:600;">👤 ${this.escape(p.responsibleName)} ${p.responsiblePhone ? `<small>(${this.escape(p.responsiblePhone)})</small>` : ''}</span>` : ''}
                                                    ` : `
                                                        <button type="button" class="sam-btn sam-btn--xs" style="padding:1px 6px; font-size:10.5px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe; font-weight:700;" onclick="event.stopPropagation(); App.showAddNodeModal(null, '${this.escape(r.ip || '')}', '${this.escape(p.name)}')">
                                                            ➕ ربط بنقطة
                                                        </button>
                                                    `}
                                                </div>
                                                <div style="display:flex; align-items:center; gap:8px; font-size:11.5px;">
                                                    <span class="sam-badge sam-badge--subtle" style="font-weight:700;">📊 ${this.formatBytes(p.totalOutput + p.totalInput)}</span>
                                                    <span class="sam-badge sam-badge--info" style="font-weight:700;">👥 ${p.totalSessions} كرت</span>
                                                    <span style="font-size:11px; color:#64748b;">${isPCollapsed ? '◀ توسيع' : '▼ طي'}</span>
                                                </div>
                                            </div>

                                            <!-- Packages Under Port -->
                                            <div id="session-tree-body-${pNodeId}" style="padding:12px 14px; display:${isPCollapsed ? 'none' : 'flex'}; flex-direction:column; gap:10px;">
                                                ${Array.from(p.packages.values()).map((pkg, pkgIdx) => {
                                                    const pkgNodeId = pNodeId + '_pkg_' + String(pkg.name || pkgIdx).replace(/[^a-zA-Z0-9_-]/g, '_');
                                                    const isPkgCollapsed = this._collapsedSessionNodes.has(pkgNodeId);
                                                    return `
                                                    <div style="background:#f8fafc; border:1px solid #edf2f7; border-radius:8px; padding:10px;">
                                                        <!-- Package Title (Click to Collapse/Expand) -->
                                                        <div class="sam-tree-header" data-session-tree-node="${pkgNodeId}" onclick="App.toggleSessionTreeNode('${pkgNodeId}')" style="cursor:pointer; user-select:none; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px dashed #cbd5e1; padding-bottom:6px; transition:opacity 0.15s ease;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                                                            <div style="display:flex; align-items:center; gap:6px;">
                                                                <span id="session-tree-chevron-${pkgNodeId}" style="display:inline-block; transition:transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); transform:${isPkgCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; font-size:11px; color:#0f766e;">▼</span>
                                                                <span style="font-size:14px;">🏷️</span>
                                                                <span style="font-weight:800; font-size:12.5px; color:#0f766e;">${this.escape(pkg.name)}</span>
                                                            </div>
                                                            <div style="display:flex; align-items:center; gap:6px;">
                                                                <span class="sam-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; border-radius:12px;">
                                                                    ${pkg.totalSessions} مشترك
                                                                </span>
                                                                <span style="font-size:10px; color:#64748b;">${isPkgCollapsed ? '◀' : '▼'}</span>
                                                            </div>
                                                        </div>

                                                        <!-- Subscriber Cards Grid -->
                                                        <div id="session-tree-body-${pkgNodeId}" style="display:${isPkgCollapsed ? 'none' : 'grid'}; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px;">
                                                            ${pkg.subscribers.map(sub => `
                                                                <div class="sam-session-user-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; transition:all 0.15s ease; box-shadow:0 1px 2px rgba(0,0,0,0.02);" onmouseover="this.style.borderColor='var(--sam-primary)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none';">
                                                                    <div style="display:flex; align-items:center; justify-content:space-between;">
                                                                        <span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="App.showActiveCardDetails('${this.escape(sub.username)}')" title="انقر لعرض كامل تفاصيل الكرت">
                                                                            <span style="font-size:13px;">🎫</span>
                                                                            <b style="color:var(--sam-primary); font-size:13px; text-decoration:underline;">${this.escape(sub.username)}</b>
                                                                        </span>
                                                                        ${this.can('sessions_disconnect') ? `
                                                                            <button type="button" class="sam-btn sam-btn--xs sam-btn--danger" style="min-height:22px; padding:1px 6px; font-size:10px; border-radius:4px;" onclick="App.disconnectSessionPrompt('${this.escape(sub.username)}', '${this.escape(sub.nasipaddress)}', '${this.escape(sub.framedipaddress)}')" title="فصل الجلسة">
                                                                                ✕ فصل
                                                                            </button>
                                                                        ` : ''}
                                                                    </div>
                                                                    <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; color:#64748b; direction:ltr;">
                                                                        <code>${this.escape(sub.framedipaddress || '-')}</code>
                                                                        <span style="font-size:10px;">${this.escape(sub.callingstationid || '-')}</span>
                                                                    </div>
                                                                    <div style="display:flex; align-items:center; justify-content:space-between; font-size:11px; border-top:1px solid #f1f5f9; pt-1; margin-top:2px;">
                                                                        <span style="color:#0f766e; font-weight:700;">⏱️ ${this.formatUptime(sub.live_duration !== undefined && sub.live_duration !== null && sub.live_duration > 0 ? sub.live_duration : (sub.acctsessiontime || 0))}</span>
                                                                        <span style="color:#16a34a; font-weight:700;">↓ ${this.formatBytes(sub.acctoutputoctets || 0)}</span>
                                                                    </div>
                                                                </div>
                                                            `).join('')}
                                                        </div>
                                                    </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
        }

        const contentHtml = this.sessionsViewMode === 'tree' ? `
            <div class="sam-page-panel sam-ui-panel" style="margin-bottom:16px;">
                ${treeHtml}
            </div>
        ` : `
            <div class="sam-page-panel sam-ui-panel" style="margin-bottom:16px;">
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th style="width:36px; text-align:center;"><input type="checkbox" onchange="App.toggleSelectAllSessions(this)" /></th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('id')"># ${this.getTableSortIcon(this.sessionsSortCol, 'id', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('username')">اسم المستخدم (الكرت) ${this.getTableSortIcon(this.sessionsSortCol, 'username', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('framedipaddress')">عنوان IP المستلم ${this.getTableSortIcon(this.sessionsSortCol, 'framedipaddress', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('callingstationid')">عنوان MAC ${this.getTableSortIcon(this.sessionsSortCol, 'callingstationid', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('router_name')">الراوتر (NAS) ${this.getTableSortIcon(this.sessionsSortCol, 'router_name', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('nasportid')">المنفذ ونقطة الشبكة ${this.getTableSortIcon(this.sessionsSortCol, 'nasportid', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('responsible_name')">مسؤول النقطة ${this.getTableSortIcon(this.sessionsSortCol, 'responsible_name', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('acctstarttime')">وقت الاتصال ${this.getTableSortIcon(this.sessionsSortCol, 'acctstarttime', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('acctsessiontime')">المدة ${this.getTableSortIcon(this.sessionsSortCol, 'acctsessiontime', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('acctoutputoctets')">التحميل ↓ ${this.getTableSortIcon(this.sessionsSortCol, 'acctoutputoctets', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('acctinputoctets')">الرفع ↑ ${this.getTableSortIcon(this.sessionsSortCol, 'acctinputoctets', this.sessionsSortDir)}</th>
                                <th style="cursor:pointer; user-select:none;" onclick="App.toggleSessionSort('total_octets')">الإجمالي ${this.getTableSortIcon(this.sessionsSortCol, 'total_octets', this.sessionsSortDir)}</th>
                                <th style="text-align:center;">إجراء</th>
                            </tr>
                        </thead>
                        <tbody id="user-sessions-tbody">
                            ${userRowsHtml || '<tr><td colspan="14" style="text-align:center; padding:32px 16px; color:var(--sam-text-muted);">لا توجد جلسات كروت متصلة حالياً</td></tr>'}
                        </tbody>
                    </table>
                </div>
                ${this.renderTablePaginationBar(paginated, 'App.setSessionsPage', 'App.setSessionsLimit')}
            </div>
        `;

        if (PB?.renderShell) {
            mainView.innerHTML = PB.renderShell({
                id: 'active-sessions',
                archetype: 'table',
                title: 'الجلسات المباشرة المتصلة',
                subtitle: 'مراقبة حية لحظية لاتصالات المشتركين عبر RADIUS مع التحديث التلقائي وربط النقاط',
                eyebrow: 'LIVE MONITORING',
                icon: '⚡',
                actions: actions,
                stats: stats,
                toolbar: toolbar,
                content: contentHtml
            });
        } else {
            mainView.innerHTML = `
                <main class="sam-page-shell sam-ui-page" data-sam-page="active-sessions" dir="rtl">
                    <div class="view-scroll-content">
                        ${contentHtml}
                    </div>
                </main>
            `;
        }

        // Restore search focus and caret position smoothly
        if (isSearchFocused) {
            const newSearchInput = mainView.querySelector('.quick-table-search-input');
            if (newSearchInput) {
                newSearchInput.focus();
                if (caretPos !== null) {
                    newSearchInput.setSelectionRange(caretPos, caretPos);
                }
            }
        }

        window.SamPageShell?.sync();
    },

    toggleSessionTreeNode(nodeId) {
        if (!this._collapsedSessionNodes || !(this._collapsedSessionNodes instanceof Set)) {
            this._collapsedSessionNodes = new Set();
        }
        const bodyEl = document.getElementById(`session-tree-body-${nodeId}`);
        const chevronEl = document.getElementById(`session-tree-chevron-${nodeId}`);
        
        if (this._collapsedSessionNodes.has(nodeId)) {
            this._collapsedSessionNodes.delete(nodeId);
            if (bodyEl) {
                if (nodeId.includes('_pkg_')) {
                    bodyEl.style.display = 'grid';
                } else {
                    bodyEl.style.display = 'flex';
                }
            }
            if (chevronEl) {
                chevronEl.style.transform = 'rotate(0deg)';
            }
        } else {
            this._collapsedSessionNodes.add(nodeId);
            if (bodyEl) {
                bodyEl.style.display = 'none';
            }
            if (chevronEl) {
                chevronEl.style.transform = 'rotate(-90deg)';
            }
        }
    },

    collapseAllSessionTree() {
        if (!this._collapsedSessionNodes || !(this._collapsedSessionNodes instanceof Set)) {
            this._collapsedSessionNodes = new Set();
        }
        const headers = document.querySelectorAll('[data-session-tree-node]');
        headers.forEach(el => {
            const nodeId = el.getAttribute('data-session-tree-node');
            if (nodeId) {
                this._collapsedSessionNodes.add(nodeId);
                const bodyEl = document.getElementById(`session-tree-body-${nodeId}`);
                const chevronEl = document.getElementById(`session-tree-chevron-${nodeId}`);
                if (bodyEl) bodyEl.style.display = 'none';
                if (chevronEl) chevronEl.style.transform = 'rotate(-90deg)';
            }
        });
    },

    expandAllSessionTree() {
        if (!this._collapsedSessionNodes || !(this._collapsedSessionNodes instanceof Set)) {
            this._collapsedSessionNodes = new Set();
        }
        this._collapsedSessionNodes.clear();
        const headers = document.querySelectorAll('[data-session-tree-node]');
        headers.forEach(el => {
            const nodeId = el.getAttribute('data-session-tree-node');
            if (nodeId) {
                const bodyEl = document.getElementById(`session-tree-body-${nodeId}`);
                const chevronEl = document.getElementById(`session-tree-chevron-${nodeId}`);
                if (bodyEl) {
                    if (nodeId.includes('_pkg_')) {
                        bodyEl.style.display = 'grid';
                    } else {
                        bodyEl.style.display = 'flex';
                    }
                }
                if (chevronEl) chevronEl.style.transform = 'rotate(0deg)';
            }
        });
    },

    onSessionsLiveSearch(val) {
        this.sessionsSearch = val;
        this.sessionsPage = 1;
        clearTimeout(this._sessionsSearchDebounce);
        this._sessionsSearchDebounce = setTimeout(() => {
            this.renderActiveSessions(false);
        }, 120);
    },

    toggleSessionSort(col) {
        if (this.sessionsSortCol === col) {
            this.sessionsSortDir = this.sessionsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sessionsSortCol = col;
            this.sessionsSortDir = (col === 'acctstarttime' || col === 'acctsessiontime' || col === 'acctoutputoctets' || col === 'acctinputoctets' || col === 'total_octets') ? 'desc' : 'asc';
        }
        this.renderActiveSessions(false);
    },

    setSessionsPage(p) {
        this.sessionsPage = p;
        this.renderActiveSessions(false);
    },

    setSessionsLimit(l) {
        this.sessionsLimit = l;
        this.sessionsPage = 1;
        this.renderActiveSessions(false);
    },

    sortActiveSessions(list, sortCol, sortDir) {
        if (!sortCol || !Array.isArray(list)) return list;
        const dir = (sortDir === 'desc') ? -1 : 1;

        const parseIpNum = ip => {
            if (!ip || typeof ip !== 'string') return 0;
            const parts = ip.split('.').map(p => parseInt(p, 10) || 0);
            return (parts[0] || 0) * 16777216 + (parts[1] || 0) * 65536 + (parts[2] || 0) * 256 + (parts[3] || 0);
        };

        return [...list].sort((a, b) => {
            if (sortCol === 'acctsessiontime' || sortCol === 'duration') {
                const durA = Number((a.live_duration !== undefined && a.live_duration !== null && a.live_duration > 0) ? a.live_duration : (a.acctsessiontime || 0));
                const durB = Number((b.live_duration !== undefined && b.live_duration !== null && b.live_duration > 0) ? b.live_duration : (b.acctsessiontime || 0));
                return (durA - durB) * dir;
            }

            if (sortCol === 'acctoutputoctets') {
                const bA = Number(a.acctoutputoctets || 0);
                const bB = Number(b.acctoutputoctets || 0);
                return (bA - bB) * dir;
            }

            if (sortCol === 'acctinputoctets') {
                const bA = Number(a.acctinputoctets || 0);
                const bB = Number(b.acctinputoctets || 0);
                return (bA - bB) * dir;
            }

            if (sortCol === 'total_octets') {
                const tA = (Number(a.acctinputoctets || 0) + Number(a.acctoutputoctets || 0));
                const tB = (Number(b.acctinputoctets || 0) + Number(b.acctoutputoctets || 0));
                return (tA - tB) * dir;
            }

            if (sortCol === 'id') {
                const idA = Number(a.radacctid || a.id || 0);
                const idB = Number(b.radacctid || b.id || 0);
                return (idA - idB) * dir;
            }

            if (sortCol === 'framedipaddress' || sortCol === 'nasipaddress') {
                const ipA = parseIpNum(a[sortCol]);
                const ipB = parseIpNum(b[sortCol]);
                return (ipA - ipB) * dir;
            }

            if (sortCol === 'router_name') {
                const nameA = String(a.nas_shortname || a.router_name || a.nasipaddress || '').toLowerCase();
                const nameB = String(b.nas_shortname || b.router_name || b.nasipaddress || '').toLowerCase();
                return nameA.localeCompare(nameB) * dir;
            }

            if (sortCol === 'node_name') {
                const nA = String(a.node_name || '').toLowerCase();
                const nB = String(b.node_name || '').toLowerCase();
                return nA.localeCompare(nB) * dir;
            }

            if (sortCol === 'responsible_name') {
                const rA = String(a.responsible_name || '').toLowerCase();
                const rB = String(b.responsible_name || '').toLowerCase();
                return rA.localeCompare(rB) * dir;
            }

            // Generic string or number comparison
            let valA = a[sortCol];
            let valB = b[sortCol];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean' && valA !== '' && valB !== '') {
                return (numA - numB) * dir;
            }

            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            return strA.localeCompare(strB) * dir;
        });
    },

    exportSessionsCSV() {
        const list = this._lastSessionsList || [];
        if (!list.length) return this.toast('لا توجد جلسات نشطة للتصدير', 'warning');
        const headers = ['#', 'اسم المستخدم (الكرت)', 'عنوان IP', 'عنوان MAC', 'الراوتر (NAS)', 'المنفذ', 'نقطة الشبكة', 'الاسم الظاهر', 'نوع النقطة', 'مسؤول النقطة', 'هاتف المسؤول', 'الباقة', 'وقت الاتصال', 'المدة (ثواني)', 'التحميل (بايت)', 'الرفع (بايت)', 'الإجمالي (بايت)'];
        const rows = list.map((s, i) => [
            i + 1,
            s.username || '',
            s.framedipaddress || '',
            s.callingstationid || '',
            s.nas_shortname || s.router_name || s.nasipaddress || '',
            s.nasportid || '',
            s.node_name || '',
            s.node_display_name || '',
            s.node_type === 'main_node' ? 'أساسية' : (s.node_type === 'sub_node' ? 'فرعية' : ''),
            s.responsible_name || '',
            s.responsible_phone || '',
            s.profile_name || '',
            s.acctstarttime || '',
            (s.live_duration !== undefined && s.live_duration !== null && s.live_duration > 0) ? s.live_duration : (s.acctsessiontime || 0),
            s.acctoutputoctets || 0,
            s.acctinputoctets || 0,
            (parseInt(s.acctinputoctets) || 0) + (parseInt(s.acctoutputoctets) || 0)
        ]);
        this.downloadExcelCSV(`Active_Sessions_${new Date().toISOString().slice(0, 10)}`, headers, rows);
    },

    printSessionsTable() {
        const list = this._lastSessionsList || [];
        if (!list.length) return this.toast('لا توجد جلسات نشطة للطباعة', 'warning');
        const headers = ['#', 'المستخدم (الكرت)', 'عنوان IP', 'عنوان MAC', 'الراوتر', 'المنفذ / نقطة الشبكة', 'مسؤول النقطة', 'الباقة', 'المدة', 'إجمالي الاستهلاك'];
        const rowsHtml = list.map((s, i) => {
            const dur = (s.live_duration !== undefined && s.live_duration !== null && s.live_duration > 0) ? s.live_duration : (s.acctsessiontime || 0);
            const tot = (parseInt(s.acctinputoctets) || 0) + (parseInt(s.acctoutputoctets) || 0);
            return `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(s.username || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr;">${this.escape(s.framedipaddress || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr;">${this.escape(s.callingstationid || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(s.nas_shortname || s.router_name || s.nasipaddress || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(s.nasportid || '')} ${s.node_name ? `[${this.escape(s.node_name)}]` : ''}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(s.responsible_name || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(s.profile_name || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${this.formatUptime(dur)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold; text-align:center;">${this.formatBytes(tot)}</td>
            </tr>
            `;
        }).join('');
        this.printUniversalReport('كشف الجلسات المباشرة المتصلة بالشبكة', headers, rowsHtml, `إجمالي الجلسات النشطة: ${list.length}`);
    },

    /**
     * Show comprehensive card details modal on click
     */
    async showActiveCardDetails(username) {
        if (!username) return;
        const session = (this._lastSessionsList || []).find(s => String(s.username) === String(username)) || {};
        
        const cardUser = this.escape(username);
        const pkgName = this.escape(session.profile_name || 'باقة عامة');
        const routerName = this.escape(session.nas_shortname || session.router_name || session.nasipaddress || 'الراوتر الافتراضي');
        const portName = this.escape(session.nasportid || 'Default / Generic');
        const ipAddr = this.escape(session.framedipaddress || '-');
        const macAddr = this.escape(session.callingstationid || '-');
        const connectTime = this.escape(session.acctstarttime || '-');
        const durationSec = session.live_duration !== undefined && session.live_duration !== null && session.live_duration > 0 ? session.live_duration : (session.acctsessiontime || 0);
        const durationStr = this.formatUptime(durationSec);
        const inBytes = this.formatBytes(session.acctinputoctets || 0);
        const outBytes = this.formatBytes(session.acctoutputoctets || 0);
        const totBytes = this.formatBytes((parseInt(session.acctinputoctets) || 0) + (parseInt(session.acctoutputoctets) || 0));
        const price = session.voucher_price || session.profile_price || session.sale_price || '-';
        const priceStr = price !== '-' ? `${price} ر.ي` : 'غير محدد';

        const modalHtml = `
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#ffffff; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px; background:rgba(255,255,255,0.12); padding:6px 10px; border-radius:8px;">🎫</span>
                    <div>
                        <div style="font-size:16px; font-weight:800;">تفاصيل كرت المشترك المتصل</div>
                        <div style="font-size:11px; color:#94a3b8;">بيانات الجلسة الحية وارتباط النقطة والتحكم اللحظي</div>
                    </div>
                </div>
                <button type="button" class="mt-btn" style="background:rgba(255,255,255,0.15); color:#fff; border:none; padding:4px 10px; border-radius:6px; cursor:pointer;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px; direction:rtl; font-family:var(--sam-font-sans);">
                <!-- User Hero Banner -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div>
                        <span style="font-size:11px; color:#64748b; font-weight:700;">اسم المستخدم / رقم الكرت:</span>
                        <div style="font-size:20px; font-weight:900; color:#0f766e; letter-spacing:1px;">${cardUser}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="sam-badge sam-badge--success" style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:20px;">🟢 متصل أونلاين</span>
                        <button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" onclick="navigator.clipboard.writeText('${cardUser}').then(()=>App.toast('تم نسخ رقم الكرت بنجاح','success'))" style="min-height:28px;">
                            📋 نسخ الرقم
                        </button>
                    </div>
                </div>

                <!-- Info Grid -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">📦 الباقة / البروفايل:</span>
                        <b style="color:#1e293b; font-size:13px;">${pkgName}</b>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">💰 سعر الكرت:</span>
                        <b style="color:#0f766e; font-size:13px;">${priceStr}</b>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">📡 الراوتر المتصل (NAS):</span>
                        <b style="color:#1e293b; font-size:12.5px;">${routerName}</b>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">🔌 المنفذ / السيكتور:</span>
                        <code style="color:#0f766e; font-size:12px;">${portName}</code>
                    </div>

                    <!-- Linked Network Node details -->
                    ${session.node_name ? `
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; grid-column:1/-1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                            <div>
                                <span style="font-size:11px; color:#166534; display:block; margin-bottom:2px; font-weight:700;">🗼 نقطة الشبكة المربوطة:</span>
                                <b style="color:#065f46; font-size:13.5px;">${session.node_type === 'main_node' ? '🗼 نقطة أساسية: ' : '📡 نقطة فرعية: '}${this.escape(session.node_name)}</b>
                                ${session.node_display_name && session.node_display_name !== session.node_name ? `<span style="color:#0369a1; font-weight:700; font-size:12px; margin-right:6px;">(🏷️ ${this.escape(session.node_display_name)})</span>` : ''}
                                ${session.node_location ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">📍 الموقع: ${this.escape(session.node_location)}</div>` : ''}
                            </div>
                            ${session.node_coordinates ? `
                                <a href="https://www.google.com/maps?q=${encodeURIComponent(session.node_coordinates)}" target="_blank" class="sam-btn sam-btn--xs" style="background:#ffffff; color:#0369a1; border:1px solid #bae6fd; font-weight:700; text-decoration:none; padding:3px 8px; border-radius:4px;">
                                    🗺️ فتح الخريطة
                                </a>
                            ` : ''}
                        </div>
                    </div>
                    ` : `
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:10px 12px; grid-column:1/-1; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-size:11px; color:#92400e; font-weight:700;">⚠️ نقطة الشبكة:</span>
                            <div style="font-size:12px; color:#b45309;">هذا المنفذ غير مربوط بنقطة شبكة مسجلة بعد.</div>
                        </div>
                        <button type="button" class="sam-btn sam-btn--xs sam-btn--primary" onclick="App.closeModal(); App.showAddNodeModal(null, '${this.escape(session.nasipaddress || '')}', '${this.escape(session.nasportid || '')}')">
                            ➕ ربط بنقطة الآن
                        </button>
                    </div>
                    `}

                    <!-- Responsible Admin -->
                    ${session.responsible_name ? `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; grid-column:1/-1;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">👤 مسؤول النقطة والعهدة:</span>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <b style="color:#0f172a; font-size:13px;">${this.escape(session.responsible_name)}</b>
                            ${session.responsible_phone ? `<a href="tel:${this.escape(session.responsible_phone)}" style="color:#0284c7; text-decoration:none; font-weight:700; direction:ltr; font-size:12px;">📱 ${this.escape(session.responsible_phone)}</a>` : ''}
                        </div>
                    </div>
                    ` : ''}

                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">🌐 عنوان IP المستلم:</span>
                        <code style="color:#2563eb; font-size:12.5px; direction:ltr; display:inline-block;">${ipAddr}</code>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">📱 عنوان الماك (MAC):</span>
                        <code style="color:#475569; font-size:12px; direction:ltr; display:inline-block;">${macAddr}</code>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">⏰ وقت بداية الاتصال:</span>
                        <span style="color:#1e293b; font-size:12px; font-weight:600;">${connectTime}</span>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">⏱️ مدة الجلسة الحالية:</span>
                        <b style="color:#d97706; font-size:13px;">${durationStr}</b>
                    </div>
                </div>

                <!-- Traffic Stats Bar -->
                <div style="background:linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border:1px solid #bbf7d0; border-radius:10px; padding:12px 16px; margin-bottom:16px;">
                    <div style="font-size:12px; font-weight:800; color:#166534; margin-bottom:8px;">📊 استهلاك البيانات في هذه الجلسة:</div>
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:12.5px;">
                        <div>📥 التحميل (Download): <b style="color:#16a34a;">${outBytes}</b></div>
                        <div>📤 الرفع (Upload): <b style="color:#0284c7;">${inBytes}</b></div>
                        <div>⚡ الإجمالي: <b style="color:#1e293b; font-weight:900;">${totBytes}</b></div>
                    </div>
                </div>

                <!-- Modal Actions -->
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; border-top:1px solid #e2e8f0; padding-top:14px;">
                    ${this.can('sessions_disconnect') ? `
                        <button type="button" class="sam-btn sam-btn--danger" onclick="App.closeModal(); App.disconnectSessionPrompt('${cardUser}', '${this.escape(session.nasipaddress || '')}', '${this.escape(session.framedipaddress || '')}')">
                            ⚡ قطع اتصال الجلسة فوراً (CoA)
                        </button>
                    ` : '<div></div>'}
                    <button type="button" class="sam-btn sam-btn--secondary" onclick="App.closeModal()">
                        إغلاق
                    </button>
                </div>
            </div>
        `;

        if (typeof this.openModal === 'function') {
            this.openModal(modalHtml);
        } else {
            let mc = document.getElementById('modal-container');
            if (!mc) {
                mc = document.createElement('div');
                mc.id = 'modal-container';
                document.body.appendChild(mc);
            }
            mc.innerHTML = `<div class="mt-modal-overlay" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999;"><div class="mt-modal-content" style="background:#fff; border-radius:12px; max-width:560px; width:94%; box-shadow:0 10px 25px rgba(0,0,0,0.3);">${modalHtml}</div></div>`;
        }
    },
    filterSessionsTable(query, tbodyId) {
        const q = (query || '').toLowerCase().trim();
        const rows = document.querySelectorAll(`#${tbodyId} tr`);
        rows.forEach(r => {
            const text = r.textContent.toLowerCase();
            r.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
    },

    async disconnectSessionPrompt(username, nasIp, framedIp) {
        if (!confirm(`هل أنت متأكد من فصل المستخدم (${username}) فوراً عبر أمر CoA/PoD؟`)) return;
        this.toast(`جاري إرسال أمر قطع الاتصال للمستخدم ${username}...`, 'info');
        const res = await this.api('disconnect_session', {}, 'POST', {
            username: username,
            nas_ip: nasIp,
            framed_ip: framedIp
        });
        if (res && res.success) {
            this.toast(res.message || 'تم قطع الاتصال بنجاح', 'success');
            setTimeout(() => this.renderActiveSessions(false), 800);
        } else {
            this.toast(res?.error || 'فشل قطع الاتصال', 'danger');
        }
    },

    async cleanupStaleSessions() {
        if (!confirm('هل ترغب في فحص وتنظيف الجلسات العالقة في قاعدة بيانات RADIUS؟')) return;
        const res = await this.api('cleanup_stale_sessions', {}, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تنظيف الجلسات بنجاح', 'success');
            this.renderActiveSessions(false);
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء التنظيف', 'danger');
        }
    },

    formatUptime(seconds) {
        seconds = parseInt(seconds) || 0;
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (d > 0) return `${d}ي ${h}س ${m}د`;
        if (h > 0) return `${h}س ${m}د ${s}ث`;
        if (m > 0) return `${m}د ${s}ث`;
        return `${s}ث`;
    },

    // ==========================================
    // NOC NETWORK MONITORING DASHBOARD (مراقبة الشبكة)
    // ==========================================
        async renderNoc() {
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:600; font-size:14px;">📡 مصفوفة مراقبة استجابة الأبراج والراوترات (NOC & Ping Matrix)</span>
                </div>
            </div>
            <div style="padding:40px; text-align:center; color:var(--text-muted);">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#0078d7;"></i>
                <div style="margin-top:10px; font-weight:700;">جاري فحص مؤشرات الأداء ومصفوفة الـ Ping الحية للأبراج...</div>
            </div>
        `;

        try {
            const [nocRes, pingRes] = await Promise.all([
                this.api('get_noc_dashboard').catch(() => ({})),
                this.api('get_fleet_ping_matrix').catch(() => ({}))
            ]);

            const routers = nocRes.routers || [];
            const summary = nocRes.summary || {};
            const pingMatrix = pingRes.routers || [];
            const pingSummary = pingRes || {};

            // Merge ping matrix metrics into routers list
            const pingMap = {};
            pingMatrix.forEach(p => {
                pingMap[p.id] = p;
                pingMap[p.ip] = p;
            });

            const mergedRouters = routers.map(r => {
                const pInfo = pingMap[r.id] || pingMap[r.nasname] || {};
                return {
                    ...r,
                    latency_ms: pInfo.latency_ms ?? r.latency,
                    status_color: pInfo.status_color || (r.is_online ? '#10b981' : '#ef4444'),
                    status_label: pInfo.status_label || (r.is_online ? 'متصل' : 'غير متصل'),
                    jitter_ms: pInfo.jitter_ms ?? 0,
                    packet_loss: pInfo.packet_loss ?? (r.is_online ? 0 : 100),
                    pings: pInfo.pings || [],
                    is_matrix_online: pInfo.status ? pInfo.status !== 'down' : r.is_online
                };
            });

            const avgPing = pingSummary.avg_latency_ms || summary.avg_latency || 0;
            const healthScore = pingSummary.network_health_score ?? (summary.online_count ? Math.round((summary.online_count / (routers.length || 1)) * 100) : 100);

            const matrixToolbarHtml = `
            <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:14px 18px; margin-bottom:16px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <button class="mt-btn mt-btn-primary" style="font-weight:700; padding:7px 16px; display:flex; align-items:center; gap:6px;" onclick="App.runFleetPingMatrixLive()">
                        <span>⚡</span> <span>فحص مصفوفة الـ Ping الحي لكافة الأبراج الآن</span>
                    </button>
                    <button class="mt-btn" style="padding:7px 14px;" onclick="App.renderNoc()">
                        ⟳ تحديث شامل
                    </button>
                    <span style="font-size:11.5px; color:var(--text-muted, #64748b);">
                        آخر فحص: <b>${pingSummary.tested_at || new Date().toLocaleTimeString()}</b>
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:12px; font-size:12px; flex-wrap:wrap;">
                    <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#10b981;">
                        <span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span> ممتاز (&lt; 200ms)
                    </span>
                    <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#0284c7;">
                        <span style="width:8px; height:8px; border-radius:50%; background:#0284c7; display:inline-block;"></span> مستقر VPN (200-280ms)
                    </span>
                    <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#eab308;">
                        <span style="width:8px; height:8px; border-radius:50%; background:#eab308; display:inline-block;"></span> بطيء / ضغط (280-450ms)
                    </span>
                    <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#ef4444;">
                        <span style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> منقطع / فقدان حزم
                    </span>
                </div>
            </div>`;

            const routerGridHtml = matrixToolbarHtml + `
            <div id="noc-ping-matrix-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(330px, 1fr)); gap:15px;">
                ${mergedRouters.map(r => {
                    const lat = r.latency_ms !== null && r.latency_ms !== undefined ? `${r.latency_ms} ms` : 'غير متاح';
                    const pingPills = (r.pings && r.pings.length > 0) 
                        ? r.pings.map(p => `<span style="font-size:10px; background:#f1f5f9; padding:2px 5px; border-radius:4px; border:1px solid #e2e8f0; font-family:monospace;">${p}ms</span>`).join(' ') 
                        : '<span style="font-size:10.5px; color:#94a3b8;">فحص فردي</span>';

                    return `
                    <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03); border-top:4px solid ${r.status_color};">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                            <div>
                                <div style="font-weight:800; font-size:15px; color:var(--text-main, #0f172a); display:flex; align-items:center; gap:6px;">
                                    <span>📡</span> <span>${this.escape(r.shortname || r.name)}</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--text-muted, #64748b); direction:ltr; text-align:right; margin-top:2px;">
                                    IP: <code>${this.escape(r.nasname || r.ip_address)}</code>
                                </div>
                            </div>
                            <span style="font-size:11.5px; font-weight:700; padding:3px 8px; border-radius:6px; background:${r.status_color}18; color:${r.status_color}; border:1px solid ${r.status_color}44;">
                                ${r.status_label}
                            </span>
                        </div>

                        <!-- Latency & Signal Metrics -->
                        <div style="background:var(--toolbar-bg, #f8fafc); border-radius:8px; padding:12px; margin-bottom:12px; border:1px solid var(--border-color, #e2e8f0);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <div style="font-size:11.5px; color:#64748b; font-weight:600;">زمن الاستجابة (Ping):</div>
                                <div style="font-size:17px; font-weight:800; color:${r.status_color}; font-family:monospace;">
                                    ⏱️ ${lat}
                                </div>
                            </div>

                            <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:8px; color:#475569;">
                                <span>فقدان الحزم: <b>${r.packet_loss}%</b></span>
                                <span>تذبذب الإشارة (Jitter): <b>${r.jitter_ms} ms</b></span>
                            </div>

                            <div style="display:flex; align-items:center; justify-content:space-between; padding-top:6px; border-top:1px dashed #cbd5e1;">
                                <span style="font-size:10.5px; color:#64748b;">سلسلة النبضات:</span>
                                <div>${pingPills}</div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11.5px; margin-bottom:12px; padding:0 2px;">
                            <div>جلسات Hotspot: <b style="color:#0f172a;">${r.hotspot_users || 0}</b></div>
                            <div>حالة النفق: <b style="color:#0284c7;">${r.sstp_status || 'SSTP نشط'}</b></div>
                        </div>

                        <div style="display:flex; gap:6px;">
                            <button class="mt-btn mt-btn-primary" style="flex:1; justify-content:center; padding:6px; font-size:12px;" onclick="App.showRouterControlCenter(${r.id}, 'overview')">
                                🎮 التحكم
                            </button>
                            <button class="mt-btn" style="flex:1; justify-content:center; padding:6px; font-size:12px;" onclick="App.showRouterControlCenter(${r.id}, 'interfaces')">
                                📈 الترافيك
                            </button>
                            <button class="mt-btn" style="padding:6px 10px; font-size:12px;" title="فحص Ping مباشر وفردي" onclick="App.pingRouterLiveMatrix(${r.id}, '${r.nasname}')">
                                📶
                            </button>
                        </div>
                    </div>
                    `;
                }).join('') || '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">لا توجد راوترات مضافة حالياً</div>'}
            </div>`;

            const shellOpts = {
                id: 'noc',
                archetype: 'dashboard',
                icon: '📡',
                title: 'مركز مراقبة الشبكة ومصفوفة الـ Ping (NOC Matrix)',
                eyebrow: 'غرفة العمليات والمراقبة الحية للأبراج',
                subtitle: `مراقبة حية لأجهزة MikroTik واستجابة الأبراج والخطوط | الأجهزة المتصلة: ${pingSummary.online_count || summary.online_count || routers.length} راوتر`,
                actions: [
                    { label: '⚡ فحص مصفوفة الـ Ping', icon: '⚡', variant: 'primary', onclick: 'App.runFleetPingMatrixLive()' },
                    { label: '⟳ تحديث', icon: '⟳', variant: 'secondary', onclick: 'App.renderNoc()' }
                ],
                stats: [
                    { label: 'إجمالي الأبراج والراوترات', value: routers.length, icon: '🌐', tone: 'blue', meta: 'أجهزة MikroTik' },
                    { label: 'مؤشر استقرار الأسطول', value: `${healthScore}%`, icon: '🛡️', tone: healthScore >= 80 ? 'green' : 'amber', meta: 'نسبة الجاهزية' },
                    { label: 'متوسط زمن الاستجابة (Ping)', value: `${avgPing} ms`, icon: '⏱️', tone: 'amber', meta: 'متوسط أسطول الأبراج' },
                    { label: 'إجمالي المشتركين النشطين', value: summary.total_active_sessions || 0, icon: '⚡', tone: 'green', meta: 'جلسات حية الآن' }
                ],
                content: routerGridHtml
            };

            if (window.SamUI?.PageBuilder) {
                mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
            } else {
                mainView.innerHTML = `
                <div class="mt-toolbar">
                    <div class="mt-toolbar-left">
                        <span style="font-weight:600; font-size:14px;">📡 مركز مراقبة الشبكة والراوترات (NOC Matrix)</span>
                        <span class="status-pill status-active">🟢 جاهزية الأسطول: ${healthScore}%</span>
                    </div>
                    <div class="mt-toolbar-right">
                        <button class="mt-btn mt-btn-primary" onclick="App.runFleetPingMatrixLive()">⚡ فحص مصفوفة Ping</button>
                        <button class="mt-btn" onclick="App.renderNoc()">⟳ تحديث</button>
                    </div>
                </div>
                <div style="flex:1; overflow-y:auto; padding:15px;">
                    ${routerGridHtml}
                </div>`;
            }
        } catch (e) {
            console.error('NOC error:', e);
            this.toast('تعذر تحميل بيانات مركز مراقبة الشبكة', 'danger');
        }
    },

    async runFleetPingMatrixLive() {
        this.toast('⚡ جاري إرسال اختبار Ping متوازي لكافة أبراج وراوترات الشبكة...', 'info');
        await this.renderNoc();
        this.toast('✅ تم تحديث مصفوفة الـ Ping الحية بنجاح', 'success');
    },

    async pingRouterLiveMatrix(routerId, ip) {
        this.toast(`📶 جاري فحص Ping المباشر للجهاز (${ip})...`, 'info');
        const res = await this.api('ping_router_device', { id: routerId, target_ip: ip });
        if (res && res.success !== false) {
            alert(`📶 نتيجة فحص Ping الدقيق للبرج (${ip}):

- الحزم المرسلة: ${res.packets_sent || 3}
- الحزم المستلمة: ${res.packets_received || 3}
- نسبة الفقدان: ${res.packet_loss || 0}%
- متوسط الاستجابة: ${res.avg_ms ? res.avg_ms + ' ms' : 'سريع'}
- أدنى زمن: ${res.min_ms || '-'} ms
- أقصى زمن: ${res.max_ms || '-'} ms`);
        } else {
            alert(res?.error || `تعذر إجراء فحص Ping المباشر للجهاز (${ip})`);
        }
    },

    // ==========================================
    // BACKUPS & TELEGRAM (النسخ الاحتياطي وتليجرام)
    // ==========================================
    async renderBackups() {
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        const [backupsRes, notifSettings, cloudSettingsRes] = await Promise.all([
            this.api('list_backups'),
            this.api('get_notification_settings'),
            this.api('get_cloud_backup_settings')
        ]);
        const cloud = cloudSettingsRes?.settings || { telegram: {}, sftp: {} };

        const backups = Array.isArray(backupsRes) ? backupsRes : (backupsRes?.backups || []);
        const tg = notifSettings?.telegram || {};
        const wa = notifSettings?.whatsapp || {};

        const isOwnerEnv = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        const currentNetworkName = this.activeNetworkName || this.currentNetwork?.name || (backupsRes?.active_network_id ? `شبكة #${backupsRes.active_network_id}` : 'الشبكة الحالية');
        const isNetworkScoped = !isOwnerEnv && Boolean(backupsRes?.active_network_id);

        const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px;">
            <!-- Network Scope Alert Banner -->
            <div style="background:${isNetworkScoped ? '#f0f9ff' : '#fffbeb'}; border:1px solid ${isNetworkScoped ? '#bae6fd' : '#fde68a'}; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">${isNetworkScoped ? '🌐' : '👑'}</span>
                    <div>
                        <div style="font-weight:800; font-size:13.5px; color:${isNetworkScoped ? '#0369a1' : '#92400e'};">
                            ${isNetworkScoped ? `نطاق النسخ الاحتياطي: بيانات شبكة [ ${this.escape(currentNetworkName)} ] فقط` : 'نطاق النسخ الاحتياطي السيادي: المنظومة الشاملة وكافة الشبكات'}
                        </div>
                        <div style="font-size:11.5px; color:${isNetworkScoped ? '#0284c7' : '#b45309'}; margin-top:2px;">
                            ${isNetworkScoped ? 'النسخ التي يتم إنشاؤها هنا معزولة تماماً وتخص كروت، فواتير، محاسبة، ومستخدمي هذه الشبكة فقط دون التأثير على بقية الشبكات.' : 'النسخ الشاملة تشمل هيكل المنظومة بالكامل، كافة قواعد البيانات، التراخيص، وإعدادات الخادم المركزية.'}
                        </div>
                    </div>
                </div>
                <div>
                    <span class="mt-badge" style="background:${isNetworkScoped ? '#0284c7' : '#d97706'}; color:#fff; font-size:11px; font-weight:700; padding:4px 10px;">
                        ${isNetworkScoped ? '🔒 نسخة شبكة معزولة' : '👑 نسخة سيادية شاملة'}
                    </span>
                </div>
            </div>

            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="font-weight:700; font-size:14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>☁️</span>
                        <span style="color:#0284c7;">المزامنة والنسخ الاحتياطي السحابي الخارجي (Off-Site Cloud Backups)</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button type="button" class="mt-btn mt-btn-success" style="font-size:12px; font-weight:700; padding:5px 14px;" onclick="App.saveCloudBackupSettings()">
                            💾 حفظ إعدادات السحابة
                        </button>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:14px; margin-bottom:14px;">
                    <!-- 1. Telegram Cloud Storage Card -->
                    <div style="background:#f8fafc; border:1px solid #93c5fd; border-radius:8px; padding:14px; position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:18px;">✈️</span>
                                <b style="font-size:13px; color:#0369a1;">Telegram Cloud Storage (مجاني للأبد)</b>
                            </div>
                            <label style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; cursor:pointer;">
                                <input type="checkbox" id="cloud-tg-enabled" ${cloud.telegram?.enabled ? 'checked' : ''} />
                                <span>تفعيل</span>
                            </label>
                        </div>
                        <div style="font-size:11.5px; color:#475569; margin-bottom:10px;">
                            إرسال ملف النسخة المضغوطة <code>.sql.gz</code> كملف مستند مشفر إلى قناتك أو محادثتك الخاصة في تليجرام تلقائياً.
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">Telegram Bot Token:</label>
                                <input type="text" id="cloud-tg-token" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr; font-family:monospace;" placeholder="123456789:ABCdefGhI..." value="${this.escape(cloud.telegram?.bot_token || '')}" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">Telegram Chat ID / Channel ID:</label>
                                <input type="text" id="cloud-tg-chat" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr; font-family:monospace;" placeholder="-100123456789 أو معرف الشات" value="${this.escape(cloud.telegram?.chat_id || '')}" />
                            </div>
                            <div style="display:flex; gap:8px; margin-top:4px;">
                                <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px; background:#eff6ff; border-color:#93c5fd; color:#1d4ed8; font-weight:700;" onclick="App.testCloudBackupTelegram()">
                                    🚀 إرسال تجريبي للتليجرام
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Remote SFTP Server Card -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:14px; position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:18px;">🔒</span>
                                <b style="font-size:13px; color:#334155;">سيرفر احتياطي خارجي (Remote SFTP / NAS)</b>
                            </div>
                            <label style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; cursor:pointer;">
                                <input type="checkbox" id="cloud-sftp-enabled" ${cloud.sftp?.enabled ? 'checked' : ''} />
                                <span>تفعيل</span>
                            </label>
                        </div>
                        <div style="font-size:11.5px; color:#475569; margin-bottom:10px;">
                            نقل وتخزين النسخ الاحتياطية آلياً عبر بروتوكول SFTP الآمن إلى سيرفر خارجي منفصل.
                        </div>
                        <div style="display:grid; grid-template-columns:2fr 1fr; gap:8px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">عنوان السيرفر (Host / IP):</label>
                                <input type="text" id="cloud-sftp-host" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr;" placeholder="backup.myserver.com" value="${this.escape(cloud.sftp?.host || '')}" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">المنفذ (Port):</label>
                                <input type="number" id="cloud-sftp-port" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr;" value="${cloud.sftp?.port || 22}" />
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">اسم المستخدم:</label>
                                <input type="text" id="cloud-sftp-user" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr;" value="${this.escape(cloud.sftp?.username || '')}" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">كلمة المرور:</label>
                                <input type="password" id="cloud-sftp-pass" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr;" value="${this.escape(cloud.sftp?.password || '')}" />
                            </div>
                        </div>
                        <div style="margin-top:6px;">
                            <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:3px;">المسار على السيرفر البعيد (Remote Path):</label>
                            <input type="text" id="cloud-sftp-path" class="input-field" style="width:100%; padding:6px 10px; font-size:11.5px; direction:ltr;" value="${this.escape(cloud.sftp?.remote_path || '/var/backups/sam_remote')}" />
                        </div>
                        <div style="display:flex; gap:8px; margin-top:8px;">
                            <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px; background:#f1f5f9; border-color:#94a3b8; color:#334155; font-weight:700;" onclick="App.testCloudBackupSftp()">
                                🔌 فحص اتصال SFTP
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 3. Automation & Retention Options Bar -->
                <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#1e293b; cursor:pointer;">
                        <input type="checkbox" id="cloud-auto-sync" ${cloud.auto_sync ? 'checked' : ''} />
                        <span>⚡ تفعيل المزامنة السحابية الفورية تلقائياً عند إنشاء أي نسخة احتياطية</span>
                    </label>
                    <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
                        <span style="color:#475569; font-weight:600;">الاحتفاظ بالنسخ المحلية لمدة:</span>
                        <input type="number" id="cloud-retention-days" class="input-field" style="width:65px; padding:3px 6px; font-size:12px; text-align:center;" value="${cloud.retention_days || 30}" min="1" max="365" />
                        <span style="color:#475569; font-weight:600;">يوم</span>
                    </div>
                </div>
            </div>

            <!-- Database Backups List -->
            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="font-weight:700; font-size:14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>📦</span>
                        <span>${isNetworkScoped ? `النسخ الاحتياطية الخاصة بشبكة [ ${this.escape(currentNetworkName)} ]` : 'النسخ الاحتياطية لقواعد البيانات'} (${backups.length})</span>
                    </div>
                    <span style="font-size:11.5px; color:var(--text-muted);">المسار على السيرفر: <code>/var/backups/mikrotik-usermanager/</code></span>
                </div>
                <div class="mt-table-container" style="max-height:42vh;">
                    <table class="mt-table" style="font-size:12px;">
                        <thead>
                            <tr>
                                <th style="width:40px;">#</th>
                                <th>اسم ملف النسخة</th>
                                <th style="width:130px;">النوع والنطاق</th>
                                <th style="width:110px;">حجم الملف</th>
                                <th style="width:150px;">تاريخ الإنشاء</th>
                                <th style="width:240px; text-align:center;">الإجراءات والعمليات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${backups.length > 0 ? backups.map((b, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><b style="direction:ltr; display:inline-block; color:#0369a1; font-family:monospace;">${this.escape(b.filename)}</b></td>
                                    <td>
                                        ${b.type === 'network' 
                                            ? `<span class="mt-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700;">🌐 شبكة: ${this.escape(b.network_name || '#' + b.network_id)}</span>` 
                                            : '<span class="mt-badge" style="background:#fef3c7; color:#92400e; font-size:11px; font-weight:700;">👑 شاملة لكافة الشبكات</span>'}
                                    </td>
                                    <td><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${this.escape(b.size_formatted || b.size || '—')}</span></td>
                                    <td style="color:var(--text-muted); font-size:11px;">${this.escape(b.created_at)}</td>
                                    <td style="text-align:center;">
                                        <div style="display:inline-flex; gap:6px;">
                                            <a href="api.php?action=download_backup&file=${encodeURIComponent(b.filename)}" class="mt-btn" style="text-decoration:none; padding:3px 8px; font-size:11px; background:#f0fdf4; border-color:#86efac; color:#15803d; font-weight:bold;" download title="تحميل النسخة إلى جهازك">
                                                ⬇️ تحميل
                                            </a>
                                            <button class="mt-btn mt-btn-warning" style="padding:3px 8px; font-size:11px; font-weight:bold;" onclick="App.restoreBackup('${this.escape(b.filename)}', '${b.type || ''}')" title="استعادة هذه النسخة الاحتياطية">
                                                🔄 استعادة
                                            </button>
                                            <button class="mt-btn" style="padding:3px 8px; font-size:11px; font-weight:bold; background:#f0f9ff; border-color:#7dd3fc; color:#0284c7;" onclick="App.uploadBackupToCloud('${this.escape(b.filename)}')" title="رفع ومزامنة هذه النسخة إلى السحابة فوراً">
                                                ☁️ رفع سحابي
                                            </button>
                                            <button class="mt-btn mt-btn-danger" style="padding:3px 8px; font-size:11px; font-weight:bold;" onclick="App.deleteBackup('${this.escape(b.filename)}')" title="حذف ملف النسخة نهائياً">
                                                🗑️ حذف
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد نسخ احتياطية مسجلة لهذه الشبكة. اضغط زر "إنشاء نسخة احتياطية فورية" أعلاه.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Notification & Messaging Quick Hub Card -->
            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="font-weight:700; font-size:14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>💬</span>
                        <span>مركز تنبيهات النظام السريعة (تليجرام وواتساب)</span>
                    </div>
                    <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:4px 14px; font-weight:700;" onclick="App.switchTab('notifications')">
                        🌐 فتح مركز الرسائل والتنبيهات المتقدم ➔
                    </button>
                </div>
                
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
                    <!-- Telegram Quick Box -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <b style="font-size:13px; color:#0369a1;">✈️ إشعارات تليجرام</b>
                            <span class="status-pill ${tg.enabled ? 'status-active' : 'status-disabled'}" style="font-size:10.5px; padding:2px 8px;">
                                ${tg.enabled ? '🟢 مفعّل' : '⚪ معطل'}
                            </span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">
                            إرسال إشعارات الفواتير، السندات، والراوترات مباشرة لقناة المشرفين والمدير العام.
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px; background:#eff6ff; border-color:#93c5fd; color:#1d4ed8;" onclick="App.testTelegramAlertDirect()">🔔 فحص البوت</button>
                            <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px;" onclick="App.switchTab('notifications')">⚙️ تعديل الإعدادات</button>
                        </div>
                    </div>

                    <!-- WhatsApp Quick Box -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <b style="font-size:13px; color:#15803d;">🟢 خدمة واتساب (whatsapp-web.js)</b>
                            <span class="status-pill ${wa.connected ? 'status-active' : 'status-disabled'}" style="font-size:10.5px; padding:2px 8px;">
                                ${wa.connected ? '🟢 متصل (' + (wa.info?.pushname || wa.info?.wid || 'نشط') + ')' : '🔴 غير متصل'}
                            </span>
                        </div>
                        <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">
                            إرسال وتوجيه رسائل الفواتير والعهد للعملاء والموزعين عبر تطبيق الواتساب مباشرة.
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px; background:#f0fdf4; border-color:#86efac; color:#15803d;" onclick="App.showTestWhatsAppModal()">🔔 إرسال تجريبي</button>
                            <button type="button" class="mt-btn" style="padding:4px 12px; font-size:11.5px;" onclick="App.switchTab('notifications')">📱 مسح رمز QR</button>
                        </div>
                    </div>
                </div>

            </div>

        </div>
        `;

        const createLabel = isNetworkScoped 
            ? `+ إنشاء نسخة احتياطية لشبكة [${currentNetworkName}]`
            : '+ إنشاء نسخة احتياطية شاملة لكامل المنظومة';

        const actions = [
            `<label class="sam-btn sam-btn--secondary" style="background:#0284c7; color:#fff; cursor:pointer; padding:6px 14px; font-weight:700;"><span>📤</span> استيراد / رفع نسخة من ملف<input type="file" accept=".sql,.gz,.sql.gz" style="display:none;" onchange="App.uploadBackupFile(event)" /></label>`
        ];
        if (this.can('backups') || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'superadmin') {
            actions.push({ label: createLabel, icon: '📦', variant: 'primary', onclick: 'App.createBackup()' });
        }
        actions.push({ label: this.t('refresh'), icon: '🔄', variant: 'secondary', onclick: 'App.renderBackups()' });

        const shellOpts = {
            id: 'backups',
            archetype: 'designer',
            icon: '🛡️',
            title: isNetworkScoped ? `النسخ الاحتياطي الخاص بشبكة (${currentNetworkName})` : 'النسخ الاحتياطي الشامل للمنظومة (Backups Center)',
            eyebrow: isNetworkScoped ? `أمان بيانات ${currentNetworkName}` : 'أمان واستقرار المنظومة السيادية',
            subtitle: isNetworkScoped 
                ? `النسخ الاحتياطية المعزولة لبيانات الشبكة الحالية والمزامنة السحابية (${backups.length} نسخة متوفرة)`
                : `النسخ الاحتياطية الشاملة لكافة قواعد بيانات المنظومة (${backups.length} نسخة متوفرة)`,
            actions: actions,
            stats: [
                { label: isNetworkScoped ? `نسخ شبكة ${currentNetworkName}` : 'إجمالي النسخ المتوفرة', value: `${backups.length} نسخة`, icon: '📦', tone: 'blue', meta: backups[0] ? backups[0].created_at : 'لا يوجد' },
                { label: 'المزامنة مع Telegram', value: cloud.telegram?.enabled ? 'مفعّلة' : 'معطلة', icon: '✈️', tone: cloud.telegram?.enabled ? 'green' : 'slate', meta: 'تخزين سحابي مجاني' },
                { label: 'المزامنة مع SFTP / NAS', value: cloud.sftp?.enabled ? 'مفعّلة' : 'معطلة', icon: '🔒', tone: cloud.sftp?.enabled ? 'green' : 'slate', meta: cloud.sftp?.host || 'سيرفر خارجي' },
                { label: 'المزامنة الفورية التلقائية', value: cloud.auto_sync ? 'نشطة' : 'متوقفة', icon: '⚡', tone: cloud.auto_sync ? 'green' : 'amber', meta: `حفظ لمدة ${cloud.retention_days || 30} يوم` }
            ],
            content: contentHtml
        };

        if (window.SamUI?.PageBuilder) {
            mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px;">🛡️ النسخ الاحتياطي وإدارة التنبيهات</span>
                </div>
                <div class="mt-toolbar-right">
                    <button class="mt-btn" onclick="App.renderBackups()">⟳ ${this.t('refresh')}</button>
                </div>
            </div>
            <div style="padding:15px;">${contentHtml}</div>`;
        }
    },

    async createBackup() {
        const isOwnerEnv = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        const currentNetworkName = this.activeNetworkName || this.currentNetwork?.name || 'الشبكة الحالية';
        const msg = isOwnerEnv 
            ? 'جاري إنشاء نسخة احتياطية شاملة لكافة قواعد بيانات المنظومة والشبكات...'
            : `جاري إنشاء نسخة احتياطية معزولة خاصة بشبكة [${currentNetworkName}] فقط...`;

        this.toast(msg, 'info');
        const res = await this.api('create_backup', {}, 'POST');
        if (res && (res.success || res.filename)) {
            this.toast(`✅ تم إنشاء النسخة الاحتياطية بنجاح [${res.filename || ''}]`, 'success');
            this.renderBackups();
        } else {
            this.toast(res?.error || 'فشل إنشاء النسخة الاحتياطية', 'danger');
        }
    },

    async restoreBackup(filename, type = '') {
        const isNetwork = type === 'network' || filename.startsWith('network_');
        const warning = isNetwork
            ? `⚠️ تأكيد استعادة بيانات الشبكة:\n\nهل أنت متأكد من رغبتك في استعادة بيانات هذه الشبكة من النسخة:\n[${filename}]؟\n\nسيتم تحديث سجلات وبيانات هذه الشبكة فقط دون المساس ببقية الشبكات.`
            : `⚠️ تحذير أمني هام (استعادة شاملة لكامل المنظومة):\n\nهل أنت متأكد من استعادة قاعدة البيانات الشاملة من:\n[${filename}]؟\n\nسيتم استبدال كافة بيانات المنظومة بالبيانات الموجودة في الملف.`;

        if (!confirm(warning)) {
            return;
        }

        this.toast('جاري استعادة البيانات من النسخة الاحتياطية، يرجى الانتظار...', 'info');
        const res = await this.api('restore_backup', { file: filename }, 'POST');
        if (res && res.success) {
            this.toast(res.message || '✅ تمت الاستعادة بنجاح!', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            this.toast(res?.error || 'تعذر استعادة النسخة الاحتياطية', 'danger');
        }
    },

    async deleteBackup(filename) {
        if (!confirm(`هل أنت متأكد من حذف ملف النسخة الاحتياطية:
[${filename}]؟`)) {
            return;
        }

        const res = await this.api('delete_backup', { file: filename }, 'POST');
        if (res && res.success) {
            this.toast('تم حذف ملف النسخة الاحتياطية بنجاح', 'info');
            this.renderBackups();
        } else {
            this.toast(res?.error || 'تعذر حذف الملف', 'danger');
        }
    },

    
    async saveCloudBackupSettings() {
        const payload = {
            telegram: {
                enabled: document.getElementById('cloud-tg-enabled')?.checked || false,
                bot_token: document.getElementById('cloud-tg-token')?.value || '',
                chat_id: document.getElementById('cloud-tg-chat')?.value || ''
            },
            sftp: {
                enabled: document.getElementById('cloud-sftp-enabled')?.checked || false,
                host: document.getElementById('cloud-sftp-host')?.value || '',
                port: parseInt(document.getElementById('cloud-sftp-port')?.value || '22', 10),
                username: document.getElementById('cloud-sftp-user')?.value || '',
                password: document.getElementById('cloud-sftp-pass')?.value || '',
                remote_path: document.getElementById('cloud-sftp-path')?.value || '/var/backups'
            },
            auto_sync: document.getElementById('cloud-auto-sync')?.checked || false,
            retention_days: parseInt(document.getElementById('cloud-retention-days')?.value || '30', 10)
        };

        this.toast('جاري حفظ إعدادات النسخ السحابي...', 'info');
        const res = await this.api('save_cloud_backup_settings', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || '✅ تم حفظ إعدادات المزامنة السحابية بنجاح!', 'success');
        } else {
            this.toast(res?.error || 'فشل حفظ الإعدادات', 'danger');
        }
    },

    async testCloudBackupTelegram() {
        const payload = {
            telegram: {
                bot_token: document.getElementById('cloud-tg-token')?.value || '',
                chat_id: document.getElementById('cloud-tg-chat')?.value || ''
            }
        };

        this.toast('جاري فحص الاتصال وإرسال ملف تجريبي إلى تليجرام...', 'info');
        const res = await this.api('test_cloud_backup_telegram', payload, 'POST');
        if (res && res.success) {
            this.toast('✅ نجح إرسال الملف التجريبي إلى تليجرام بنجاح!', 'success');
        } else {
            this.toast(res?.error || 'فشل الاتصال بتليجرام. تحقق من الـ Token والـ Chat ID', 'danger');
        }
    },

    async testCloudBackupSftp() {
        const payload = {
            sftp: {
                host: document.getElementById('cloud-sftp-host')?.value || '',
                port: parseInt(document.getElementById('cloud-sftp-port')?.value || '22', 10),
                username: document.getElementById('cloud-sftp-user')?.value || '',
                password: document.getElementById('cloud-sftp-pass')?.value || '',
                remote_path: document.getElementById('cloud-sftp-path')?.value || '/var/backups'
            }
        };

        this.toast('جاري فحص الاتصال بسيرفر SFTP...', 'info');
        const res = await this.api('test_cloud_backup_sftp', payload, 'POST');
        if (res && res.success) {
            this.toast('✅ تم الاتصال بسيرفر SFTP واختبار صلاحية الكتابة بنجاح!', 'success');
        } else {
            this.toast(res?.error || 'فشل الاتصال بسيرفر SFTP', 'danger');
        }
    },

    async uploadBackupToCloud(filename) {
        this.toast(`جاري رفع النسخة [${filename}] إلى السحابة...`, 'info');
        const res = await this.api('upload_backup_to_cloud', { file: filename }, 'POST');
        if (res && res.success) {
            this.toast(`✅ تمت المزامنة السحابية بنجاح: ${res.summary || ''}`, 'success');
        } else {
            this.toast(res?.error || res?.summary || 'فشلت المزامنة السحابية للنسخة', 'danger');
        }
    },

    async uploadBackupFile(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('backup_file', file);

        this.toast('جاري رفع ملف النسخة الاحتياطية إلى السيرفر...', 'info');
        try {
            const resp = await fetch('api.php?action=upload_backup', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();
            if (res && res.success) {
                this.toast('✅ تم رفع ملف النسخة الاحتياطية بنجاح!', 'success');
                this.renderBackups();
            } else {
                this.toast(res?.error || 'فشل رفع الملف', 'danger');
            }
        } catch (e) {
            this.toast('تعذر رفع الملف إلى السيرفر', 'danger');
        }
        event.target.value = '';
    },

    async saveTelegramSettingsForm(e) {
        e.preventDefault();
        const payload = {
            telegram_bot_token: document.getElementById('tg-bot-token')?.value?.trim() || '',
            telegram_chat_id: document.getElementById('tg-chat-id')?.value?.trim() || '',
            telegram_enabled: document.getElementById('tg-opt-enabled')?.checked ? '1' : '0',
            telegram_notify_sales: document.getElementById('tg-opt-orders')?.checked ? '1' : '0',
            telegram_notify_receipts: document.getElementById('tg-opt-receipts')?.checked ? '1' : '0',
            telegram_notify_routers: document.getElementById('tg-opt-routers')?.checked ? '1' : '0'
        };

        const res = await this.api('save_notification_settings', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ إعدادات تليجرام بنجاح', 'success');
        } else {
            this.toast(res?.error || 'فشل الحفظ', 'danger');
        }
    },

    async testTelegramAlert() {
        this.testTelegramAlertDirect();
    },

    // ==========================================
    // LOGS & AUDIT TRAILS (سجلات العمليات والتدقيق)
    // ==========================================
    logsActiveTab: 'auth', // 'auth' or 'activity'
    logsPage: 1,
    logsLimit: 50,
    logsReplyFilter: '',
    logsSearch: '',
    logsCategoryFilter: ''
});


App.copyWinboxEndpoint = function(port) {
    const host = window.location.hostname || '194.163.165.238';
    const endpoint = `${host}:${port}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(endpoint).catch(() => {});
    }
    App.toast(`✅ تم نسخ عنوان Winbox: (${endpoint}) — الصقه في برنامج Winbox للاتصال بالراوتر مباشرة`, 'success');
};
