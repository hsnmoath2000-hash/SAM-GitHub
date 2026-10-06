/**
 * SAM User Manager — Dashboard, KPI Metrics & UI Customizer
 */
'use strict';

Object.assign(window.App, {
    async renderDashboard() {
        const networkAtStart=Number(this.activeNetworkId);
        const [statsRes, subRes, uiRes, setupState] = await Promise.all([
            this.api('dashboard_stats').catch(() => ({})),
            this.api('get_current_network_subscription').catch(() => null),
            this.loadUISettings().catch(() => ({})),
            this.loadNetworkSetup().catch(() => null)
        ]);
        if(networkAtStart!==Number(this.activeNetworkId)||this.currentTab!=='dashboard')return;
        const stats = statsRes || {};
        const ui = uiRes || {};
        const subData = subRes || {};
        const sub = subData.subscription || {};
        const meters = subData.meters || {};
        const widgets = ui.dashboard_widgets || [];
        const shortcuts = this.syncQuickShortcuts(ui.quick_shortcuts || []);

        // Widget definitions dictionary with dynamic values and links
        const widgetDefs = {
            'assets': {
                title: 'الأصول',
                icon: '📡',
                val: `${(stats.total_assets || 0).toLocaleString()} جهاز`,
                sub: `<span style="color:#16a34a; font-weight:700;">🟢 ${stats.online_assets || 0} متصل</span> | <span style="color:${stats.offline_assets > 0 ? '#dc2626' : '#64748b'};">🔴 ${stats.offline_assets || 0} منقطع</span>`,
                tab: 'assets',
                badgeBg: '#e0f2fe',
                iconColor: '#0284c7'
            },
            'networks': {
                title: 'الشبكات',
                icon: '🌐',
                val: `${(stats.total_networks || 0).toLocaleString()} شبكات`,
                sub: `<span>🌐 ${stats.total_routers || 0} راوتر</span> | <span style="color:#2563eb; font-weight:700;">🔒 ${stats.sstp_tunnels || 0} نفق SSTP</span>`,
                tab: 'routers',
                badgeBg: '#eff6ff',
                iconColor: '#2563eb'
            },
            'active_sessions': {
                title: 'المتصلون الآن',
                icon: '⚡',
                val: `${(stats.active_sessions || 0).toLocaleString()} متصل`,
                sub: `<span style="color:#16a34a; font-weight:700;">🟢 بث مباشر وجلسات حية</span>`,
                tab: 'active_sessions',
                badgeBg: '#e8f8f0',
                iconColor: '#27ae60'
            },
            'cards_users': {
                title: 'المشتركون',
                icon: '🎫',
                val: `${(stats.total_users || 0).toLocaleString()} كرت`,
                sub: `<span>📦 ${stats.total_profiles || 0} باقة</span> | <span style="color:#8b5cf6; font-weight:700;">👔 ${stats.total_distributors || 0} وكيل</span>`,
                tab: 'users',
                badgeBg: '#f3e8ff',
                iconColor: '#8b5cf6'
            },
            'today_sales': {
                title: 'مبيعات اليوم',
                icon: '🛒',
                val: App.formatMoney(stats.today_sales || 0),
                sub: `<span>🧾 ${stats.today_invoices_count || 0} فواتير اليوم</span> | <span style="color:#059669; font-weight:700;">إجمالي: ${stats.total_invoices || 0}</span>`,
                tab: 'sales',
                badgeBg: '#ecfdf5',
                iconColor: '#059669'
            },
            'cashbox': {
                title: 'رصيد الصندوق',
                icon: '💵',
                val: App.formatMoney(stats.cashbox_balance || 0),
                sub: `<span style="color:#d97706; font-weight:700;">💰 سيولة نقدية متوفرة</span>`,
                tab: 'cashbox_accounts',
                badgeBg: '#fff3e0',
                iconColor: '#f57c00'
            },
            'distributor_debt': {
                title: 'مديونيات الوكلاء',
                icon: '💳',
                val: App.formatMoney(stats.total_debt || 0),
                sub: `<span style="color:#dc2626; font-weight:700;">مستحقات على الوكلاء والشركاء</span>`,
                tab: 'admins_agents',
                badgeBg: '#ffebee',
                iconColor: '#e53935'
            },
            'vouchers_today': {
                title: 'سندات اليوم',
                icon: '📑',
                val: `${stats.today_vouchers_count || 0} سندات`,
                sub: `<span style="color:#16a34a; font-weight:700;">قبض: ${App.formatMoney(stats.today_receipts_amount || 0)}</span> | <span style="color:#dc2626; font-weight:700;">صرف: ${App.formatMoney(stats.today_payments_amount || 0)}</span>`,
                tab: 'vouchers_fin',
                badgeBg: '#eef2ff',
                iconColor: '#4f46e5'
            },
            'warehouses': {
                title: 'مخزون الكروت',
                icon: '🏢',
                val: `${(stats.warehouse_stock || 0).toLocaleString()} كرت جاهز`,
                sub: `<span>جاهزة للتوزيع والصرف</span>`,
                tab: 'card_warehouses',
                badgeBg: '#ecfeff',
                iconColor: '#0891b2'
            },
            'traffic_today': {
                title: 'ترافيك اليوم',
                icon: '📊',
                val: this.formatBytes(stats.today_total_bytes || 0),
                sub: `<span>↓ ${this.formatBytes(stats.today_download_bytes || 0)}</span> | <span>↑ ${this.formatBytes(stats.today_upload_bytes || 0)}</span>`,
                tab: 'noc',
                badgeBg: '#faf5ff',
                iconColor: '#7c3aed'
            },
            'partners_capital': {
                title: 'رأس مال الشركاء',
                icon: '🤝',
                val: App.formatMoney(stats.total_partner_capital || 0),
                sub: `<span>👥 ${stats.total_partners || 0} شريك استثماري</span>`,
                tab: 'partners_equity',
                badgeBg: '#f0fdfa',
                iconColor: '#0d9488'
            },
            'security_alerts': {
                title: 'تنبيهات الأمان',
                icon: '🛡️',
                val: `${stats.duplicate_macs_count || 0} ماك مكرر`,
                sub: `<span>📡 ${stats.unregistered_devices_count || 0} جهاز مكتشف جديد</span>`,
                tab: 'network_nodes',
                badgeBg: '#fff1f2',
                iconColor: '#e11d48'
            }
        };

        // Render active widgets strictly scoped to user accessible tabs
        const activeWidgets = widgets.filter(w => w.enabled !== false && (this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.hasAccess(w.tab || 'dashboard')));
        const cardsHtml = activeWidgets.map(w => {
            const def = widgetDefs[w.metric_key || w.id] || {
                title: w.title,
                icon: w.icon || '📊',
                val: '---',
                sub: '',
                tab: w.tab || 'dashboard',
                badgeBg: '#f8fafc',
                iconColor: w.color || '#0284c7'
            };
            return `
            <div class="kpi-card kpi-card-interactive" onclick="App.switchTab('${w.tab || def.tab}')" title="انقر للانتقال مباشرة إلى قسم [${this.escape(w.title || def.title)}]">
                <div class="kpi-icon" style="background:${def.badgeBg}; color:${w.color || def.iconColor};">
                    ${w.icon || def.icon}
                </div>
                <div style="flex:1; min-width:0;">
                    <div class="kpi-lbl">${this.escape(w.title || def.title)}</div>
                    <div class="kpi-val" style="margin:2px 0;">${def.val}</div>
                    <div style="font-size:10.5px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${def.sub}
                    </div>
                </div>
                <div class="kpi-action-arrow" title="عرض التفاصيل">
                    ⬅
                </div>
            </div>
            `;
        }).join('');

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');
        const isNormalAdmin = (this.userRole === 'admin' || isSuperAdmin);
        const PB = window.SamUI?.PageBuilder;

        const actions = [
            isSuperAdmin ? { label: '➕ إضافة بطاقة', variant: 'primary', onclick: 'App.showWidgetModal()', title: 'إضافة بطاقة إحصائية جديدة إلى لوحة التحكم' } : null,
            { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderDashboard()', title: 'تحديث البيانات' },
            isSuperAdmin ? { label: `🔄 ${this.t('restart_service')}`, variant: 'danger', onclick: 'App.restartRadius()', title: 'إعادة تشغيل خدمة خادم RADIUS' } : null
        ].filter(Boolean);

        const innerContent = `
            ${this.networkSetupDashboardHTML(setupState)}
            <!-- Subscription & Quota Banner -->
            ${(() => {
                if (!sub || !sub.plan_name) return '';
                const cardMeter = meters.daily_cards || { used: 0, limit: 0, percent: 0, level: 'ok' };
                const routerMeter = meters.routers || { used: 0, limit: 0, percent: 0, level: 'ok' };
                const statusColors = { active: '#16a34a', trial: '#2563eb', grace: '#f59e0b', expired: '#dc2626', suspended: '#64748b' };
                const statusLabels = { active: 'باقة نشطة', trial: 'فترة تجريبية', grace: 'فترة سماح', expired: 'اشتراك منتهي', suspended: 'موقوف' };
                const st = sub.status || 'active';
                const stColor = statusColors[st] || '#16a34a';
                const stLabel = statusLabels[st] || st;

                return `
                <div class="sam-card" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; border-radius:12px; padding:14px 18px; margin-bottom:14px; box-shadow:0 4px 12px rgba(0,0,0,0.12); border:1px solid #334155;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:20px;">🌐</span>
                            <div>
                                <div style="font-size:14px; font-weight:800; display:flex; align-items:center; gap:6px;">
                                    <span>${this.escape(this.activeNetwork?.name || 'الشبكة النشطة')}</span>
                                    <span style="background:#334155; color:#94a3b8; font-size:11px; padding:1px 6px; border-radius:4px; font-weight:700;">${this.escape(this.activeNetwork?.code || '')}</span>
                                </div>
                                <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
                                    باقة الاشتراك: <b style="color:#38bdf8;">${this.escape(sub.plan_name)}</b>
                                    ${sub.expires_at ? ` · ينتهي في: <b style="color:#cbd5e1;">${sub.expires_at.slice(0, 10)}</b>` : ''}
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:${stColor}20; color:${stColor}; border:1px solid ${stColor}50; font-size:11px; font-weight:800; padding:3px 10px; border-radius:20px;">
                                ● ${stLabel}
                            </span>
                            <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; border:none;" onclick="App.openNetworkSwitcherModal()" title="فتح قائمة بوابات وشبكات المنظومة للتبديل">
                                🌐 بوابات الشبكات
                            </button>
                        </div>
                    </div>
                    
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; border-top:1px solid #334155; padding-top:10px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
                                <span style="color:#94a3b8;">🎫 حصة الكروت اليومية:</span>
                                <b>${cardMeter.used} / ${cardMeter.limit > 0 ? cardMeter.limit : '∞'} كرت (${cardMeter.percent}%)</b>
                            </div>
                            <div style="background:#334155; border-radius:4px; height:6px; overflow:hidden;">
                                <div style="background:${cardMeter.percent > 90 ? '#ef4444' : (cardMeter.percent > 75 ? '#f59e0b' : '#10b981')}; width:${Math.min(100, cardMeter.percent)}%; height:100%; border-radius:4px; transition:width 0.3s;"></div>
                            </div>
                        </div>

                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
                                <span style="color:#94a3b8;">🌐 أجهزة الراوتر النشطة:</span>
                                <b>${routerMeter.used} / ${routerMeter.limit > 0 ? routerMeter.limit : '∞'} راوتر (${routerMeter.percent}%)</b>
                            </div>
                            <div style="background:#334155; border-radius:4px; height:6px; overflow:hidden;">
                                <div style="background:${routerMeter.percent > 90 ? '#ef4444' : (routerMeter.percent > 75 ? '#f59e0b' : '#38bdf8')}; width:${Math.min(100, routerMeter.percent)}%; height:100%; border-radius:4px; transition:width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                </div>`;
            })()}

            <!-- Interactive KPI Grid -->
            <div class="kpi-grid">
                ${cardsHtml}
            </div>

            <!-- Quick Action Shortcuts Hub -->
            ${(() => {
                if(setupState)return '';
                const activeShortcuts = shortcuts.filter(sc => (sc.enabled !== false) && (isSuperAdmin || (sc.action_type === 'modal' ? true : this.hasAccess(sc.target))));
                if (activeShortcuts.length === 0) return '';
                return `
                <div class="customizer-box" style="padding:14px 18px; margin-bottom:14px; background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:13px; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:6px;">
                            <span>⚡ اختصارات الوصول السريع:</span>
                        </div>
                        ${isSuperAdmin ? `
                        <div style="display:flex; gap:6px;">
                            <button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.showShortcutModal()" title="إضافة اختصار جديد">➕ إضافة اختصار</button>
                        </div>
                        ` : ''}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                        ${activeShortcuts.map((sc) => `
                            <div class="quick-action-card" onclick="App.executeShortcut('${sc.action_type || 'tab'}', '${sc.target}')" title="انقر لتنفيذ: ${this.escape(sc.title)}" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--bg-main, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; font-weight:700; font-size:12.5px; transition:all 0.2s;">
                                <span style="font-size:18px;">${sc.icon || '⚡'}</span>
                                <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(sc.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            })()}

            <!-- Bottom Detail Panels (Strictly Scoped for Non-Admins) -->
            <div style="display:flex; gap:14px; flex-wrap:wrap;">
                ${(isSuperAdmin || this.hasAccess('routers')) ? `
                    <!-- Service Status & Bandwidth (SuperAdmin / NOC Only) -->
                    <div style="flex:1; min-width:320px; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <div style="font-weight:700; font-size:13px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>📶 حالة خادم FreeRADIUS وترافيك البث</span>
                            <span class="status-pill ${stats.radius_status === 'running' ? 'status-active' : 'status-disabled'}">
                                ${stats.radius_status === 'running' ? '🟢 يعمل بنجاح' : '🔴 متوقف'}
                            </span>
                        </div>
                        <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px;">
                            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">إجمالي حركة استهلاك البيانات اليوم:</div>
                            <div style="font-size:18px; font-weight:800; color:#0078d7;">${this.formatBytes(stats.today_total_bytes || 0)}</div>
                            <div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">
                                <span>📥 التحميل (Download): <b>${this.formatBytes(stats.today_download_bytes || 0)}</b></span> | 
                                <span>📤 الرفع (Upload): <b>${this.formatBytes(stats.today_upload_bytes || 0)}</b></span>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="mt-btn mt-btn-success" style="flex:1;" onclick="App.switchTab('sales')">🛒 إدارة المبيعات</button>
                            <button class="mt-btn mt-btn-primary" style="flex:1;" onclick="App.switchTab('noc')">📡 مركز المراقبة NOC</button>
                        </div>
                    </div>

                    <!-- Top Routers -->
                    <div style="flex:1; min-width:320px; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <div style="font-weight:700; font-size:13px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>🌐 أعلى الراوترات نشاطاً (Top Routers)</span>
                            <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.switchTab('routers')">كل الراوترات ⬅</button>
                        </div>
                        <div class="mt-table-container" style="margin-bottom:0;">
                            <table class="mt-table" style="font-size:11.5px;">
                                <thead>
                                    <tr><th>اسم الراوتر</th><th>عنوان IP</th><th>الجلسات</th><th>إجراء</th></tr>
                                </thead>
                                <tbody>
                                    ${(stats.top_routers || []).map(r => `
                                        <tr>
                                            <td><b>${this.escape(r.name)}</b></td>
                                            <td><code>${r.nasipaddress}</code></td>
                                            <td><span class="status-pill status-online">${r.sessions}</span></td>
                                            <td>
                                                <button class="mt-btn" style="padding:2px 6px; font-size:10.5px;" onclick="App.switchTab('active_sessions')">الجلسات</button>
                                            </td>
                                        </tr>
                                    `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:15px;">لا توجد جلسات نشطة حالياً</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <!-- POS Agent / Sub-User Account & Custody Overview Card -->
                    <div style="flex:1; min-width:320px; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <div style="font-weight:700; font-size:13px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>👤 ملخص الحساب والعهدة الشخصية</span>
                            <span class="badge" style="background:#059669; font-size:11px;">${this.escape(this.userFullname || this.user)}</span>
                        </div>
                        <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px;">
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                                <div>
                                    <div style="font-size:11px; color:var(--text-muted);">رصيد الحساب المالي:</div>
                                    <div style="font-size:16px; font-weight:800; color:${parseFloat(stats.cashbox_balance || 0) < 0 ? '#dc2626' : '#16a34a'};">${App.formatMoney(stats.cashbox_balance || 0)}</div>
                                </div>
                                <div>
                                    <div style="font-size:11px; color:var(--text-muted);">كروت العهدة المتاحة:</div>
                                    <div style="font-size:16px; font-weight:800; color:#0284c7;">${Number(stats.warehouse_stock || 0)} كرت</div>
                                </div>
                                <div>
                                    <div style="font-size:11px; color:var(--text-muted);">مبيعاتك لليوم:</div>
                                    <div style="font-size:16px; font-weight:800; color:#059669;">${App.formatMoney(stats.today_sales || 0)}</div>
                                </div>
                                <div>
                                    <div style="font-size:11px; color:var(--text-muted);">فواتيرك اليوم:</div>
                                    <div style="font-size:16px; font-weight:800; color:#4f46e5;">${Number(stats.today_invoices_count || 0)} فاتورة</div>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="mt-btn mt-btn-success" style="flex:1;" onclick="App.showSaleModal()">🛒 + بيع كروت فوري</button>
                            <button class="mt-btn mt-btn-primary" style="flex:1;" onclick="App.switchTab('card_warehouses')">🏢 كروت عهدتي ومخزني</button>
                        </div>
                    </div>

                    <!-- Quick Operations Card for POS / Sub-User -->
                    <div style="flex:1; min-width:320px; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <div style="font-weight:700; font-size:13px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span>⚡ عمليات وإجراءات سريعة لحسابك</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <button class="mt-btn" style="text-align:right; padding:9px 12px; font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;" onclick="App.switchTab('sales')">
                                <span>🧾 استعراض فواتير المبيعات الخاصة بي</span>
                                <span>⬅</span>
                            </button>
                            <button class="mt-btn" style="text-align:right; padding:9px 12px; font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;" onclick="App.switchTab('card_warehouses')">
                                <span>🏢 فحص الأوراق والكروت المتبقية في العهدة</span>
                                <span>⬅</span>
                            </button>
                            <button class="mt-btn" style="text-align:right; padding:9px 12px; font-size:12px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;" onclick="App.switchTab('subscriber_portal')">
                                <span>📱 بوابة الاستعلام وفحص رصيد المشتركين</span>
                                <span>⬅</span>
                            </button>
                        </div>
                    </div>
                `}
            </div>
        `;

        if (PB && typeof PB.renderShell === 'function') {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'dashboard',
                archetype: 'dashboard',
                eyebrow: 'EXECUTIVE / NOC / METRICS',
                title: isNormalAdmin ? 'لوحة القيادة والمؤشرات العامة' : 'لوحة حسابي والعمليات السريعة',
                subtitle: isNormalAdmin ? 'المؤشرات التشغيلية والمالية وحالة الخوادم والشبكة المباشرة' : 'ملخص الحساب المالي، عهدة الكروت، ومبيعات اليوم',
                icon: '📊',
                actions: actions,
                content: innerContent
            });
        } else {
            document.getElementById('main-view').innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:10px;">
                    <span style="font-weight:700; font-size:14px; color:#0f172a;">📊 لوحة التحكم ${isNormalAdmin ? 'والإحصائيات العامة' : 'حسابي'}</span>
                    <span class="badge" style="background:${isNormalAdmin ? '#0284c7' : '#059669'}; font-size:11px;">${isNormalAdmin ? 'مباشر عام' : 'بياناتك الشخصية'}</span>
                </div>
                <div class="mt-toolbar-right" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    ${isSuperAdmin ? `
                        <button class="mt-btn mt-btn-primary" onclick="App.showWidgetModal()" title="إضافة بطاقة إحصائية جديدة إلى لوحة التحكم">
                            ➕ إضافة بطاقة
                        </button>
                    ` : ''}
                    <button class="mt-btn" onclick="App.renderDashboard()" title="تحديث البيانات">
                        ⟳ تحديث
                    </button>
                    ${isSuperAdmin ? `
                        <button class="mt-btn" onclick="App.restartRadius()" title="إعادة تشغيل خدمة خادم RADIUS">
                            🔄 ${this.t('restart_service')}
                        </button>
                    ` : ''}
                </div>
            </div>

            <div class="view-scroll-content" style="flex:1; overflow-y:auto; padding:12px 12px calc(80px + env(safe-area-inset-bottom, 0px)) 12px;">
                ${innerContent}
            </div>
            `;
        }
        this.installNetworkSetupHints();
        if(setupState?.auto_open){setTimeout(()=>{if(this.currentTab==='dashboard'&&Number(this.activeNetworkId)===networkAtStart)this.openNetworkSetup();},0);}
    },

    // Execute quick action shortcut
    executeShortcut(actionType, target) {
        if (!target) return this.switchTab('dashboard');
        if (actionType === 'modal') {
            if (target === 'receipt_voucher') {
                return typeof this.showVoucherModal === 'function' ? this.showVoucherModal('receipt') : this.switchTab('vouchers_fin');
            }
            if (target === 'payment_voucher') {
                return typeof this.showVoucherModal === 'function' ? this.showVoucherModal('payment') : this.switchTab('vouchers_fin');
            }
            if (target === 'new_sale') {
                this.switchTab('sales');
                return typeof this.showSaleModal === 'function' ? this.showSaleModal() : null;
            }
            if (target === 'purchase_invoice') {
                this.switchTab('purchases');
                return typeof this.openPurchaseModal === 'function' ? this.openPurchaseModal() : null;
            }
            if (target === 'stock_transfer') {
                this.switchTab('card_warehouses');
                return typeof this.showStockTransferModal === 'function' ? this.showStockTransferModal() : null;
            }
            if (target === 'batch_gen') {
                return this.switchTab('batch_gen');
            }
            if (target === 'sales_transfer_sheets') {
                this.switchTab('sales');
                return typeof this.showSheetTransferModal === 'function' ? this.showSheetTransferModal() : null;
            }
            if (target === 'sales_add_buyer') {
                return this.switchTab('sales');
            }
            if (target === 'add_router') {
                this.switchTab('routers');
                return typeof this.showRouterModal === 'function' ? this.showRouterModal() : null;
            }
            if (target === 'add_network_node') {
                this.switchTab('network_nodes');
                return typeof this.showAddNodeModal === 'function' ? this.showAddNodeModal() : null;
            }
            if (target === 'add_asset') {
                this.switchTab('assets');
                return typeof this.showAssetModal === 'function' ? this.showAssetModal() : null;
            }
            if (target === 'bulk_asset_prices') {
                this.switchTab('assets');
                return typeof this.showBulkAssetPriceModal === 'function' ? this.showBulkAssetPriceModal() : null;
            }
            if (target === 'add_profile') {
                this.switchTab('profiles');
                return typeof this.showProfileModal === 'function' ? this.showProfileModal() : null;
            }
            if (target === 'grant_free_vouchers' || target === 'free_schedule') {
                return this.switchTab('free_vouchers');
            }
            if (target === 'add_account') {
                this.switchTab('admins_agents');
                return typeof this.showAdminModal === 'function' ? this.showAdminModal() : null;
            }
            if (target === 'whatsapp_settings') {
                return typeof this.renderWhatsAppSettings === 'function' ? this.renderWhatsAppSettings() : this.switchTab('whatsapp_settings');
            }
            if (target === 'card_warehouses') return this.switchTab('card_warehouses');
        }
        // Tab fallback
        this.switchTab(target || 'dashboard');
    },

    // ==========================================
    // UI CUSTOMIZER STUDIO
    // ==========================================

    getDefaultDashboardWidgets() {
        return [
            { id: 'today_sales', title: 'مبيعات وإيراد اليوم', icon: '🛒', color: '#059669', tab: 'sales', metric_key: 'today_sales', enabled: true },
            { id: 'cashbox', title: 'رصيد الصندوق / الحساب', icon: '💵', color: '#d97706', tab: 'cashbox_accounts', metric_key: 'cashbox', enabled: true },
            { id: 'warehouses', title: 'مخزون الكروت والعهد', icon: '🏢', color: '#0891b2', tab: 'card_warehouses', metric_key: 'warehouses', enabled: true },
            { id: 'cards_users', title: 'الكروت والمشتركون', icon: '🎫', color: '#8b5cf6', tab: 'users', metric_key: 'cards_users', enabled: true },
            { id: 'active_sessions', title: 'المتصلون أونلاين', icon: '⚡', color: '#16a34a', tab: 'active_sessions', metric_key: 'active_sessions', enabled: true },
            { id: 'distributor_debt', title: 'مديونيات الموزعين والوكلاء', icon: '💳', color: '#dc2626', tab: 'admins_agents', metric_key: 'distributor_debt', enabled: true },
            { id: 'vouchers_today', title: 'سندات القبض والصرف', icon: '📑', color: '#4f46e5', tab: 'vouchers_fin', metric_key: 'vouchers_today', enabled: true },
            { id: 'assets', title: 'المعدات والأجهزة', icon: '📡', color: '#0284c7', tab: 'assets', metric_key: 'assets', enabled: true },
            { id: 'networks', title: 'الشبكات والراوترات', icon: '🌐', color: '#2563eb', tab: 'routers', metric_key: 'networks', enabled: true },
            { id: 'traffic_today', title: 'حركة ترافيك اليوم', icon: '📊', color: '#7c3aed', tab: 'noc', metric_key: 'traffic_today', enabled: true },
            { id: 'partners_capital', title: 'رأس مال الشركاء', icon: '🤝', color: '#0d9488', tab: 'partners_equity', metric_key: 'partners_capital', enabled: true },
            { id: 'security_alerts', title: 'الأمان والتنبيهات', icon: '🛡️', color: '#e11d48', tab: 'network_nodes', metric_key: 'security_alerts', enabled: true }
        ];
    },

    getDefaultQuickShortcuts() {
        return [
            // 1. المبيعات والمشتريات
            { id: 'sc_new_sale', group: '🛒 إدارة المبيعات والمشتريات', title: 'فاتورة بيع جديدة', icon: '🛒', action_type: 'modal', target: 'new_sale', enabled: true },
            { id: 'sc_purchase_inv', group: '🛒 إدارة المبيعات والمشتريات', title: 'فاتورة مشتريات جديدة', icon: '🧾', action_type: 'modal', target: 'purchase_invoice', enabled: true },
            { id: 'sc_add_buyer', group: '🛒 إدارة المبيعات والمشتريات', title: 'إضافة عميل مشتري', icon: '👤', action_type: 'modal', target: 'sales_add_buyer', enabled: false },
            { id: 'sc_instant_bal', group: '🛒 إدارة المبيعات والمشتريات', title: 'الرصيد الفوري والمبيعات', icon: '💳', action_type: 'tab', target: 'instant_balance', enabled: false },
            { id: 'sc_sales_tab', group: '🛒 إدارة المبيعات والمشتريات', title: 'إدارة المبيعات', icon: '🛒', action_type: 'tab', target: 'sales', enabled: false },
            { id: 'sc_purchases_tab', group: '🛒 إدارة المبيعات والمشتريات', title: 'المشتريات والموردين', icon: '🧾', action_type: 'tab', target: 'purchases', enabled: false },

            // 2. إدارة الكروت والمخازن
            { id: 'sc_stock_transfer', group: '🏢 إدارة الكروت والمخازن', title: 'أمر تحويل مخزني', icon: '📦', action_type: 'modal', target: 'stock_transfer', enabled: true },
            { id: 'sc_batch_gen', group: '🏢 إدارة الكروت والمخازن', title: 'توليد كروت بالدفعات', icon: '⚡', action_type: 'modal', target: 'batch_gen', enabled: true },
            { id: 'sc_card_wh', group: '🏢 إدارة الكروت والمخازن', title: 'مخازن الكروت والعهد', icon: '🏢', action_type: 'tab', target: 'card_warehouses', enabled: false },
            { id: 'sc_users_cards', group: '🏢 إدارة الكروت والمخازن', title: 'كروت الانترنت والمشتركين', icon: '🎫', action_type: 'tab', target: 'users', enabled: false },
            { id: 'sc_add_profile', group: '🏢 إدارة الكروت والمخازن', title: 'إضافة باقة خدمة', icon: '📦', action_type: 'modal', target: 'add_profile', enabled: false },
            { id: 'sc_grant_free', group: '🏢 إدارة الكروت والمخازن', title: 'منح كروت مجانية', icon: '🎁', action_type: 'modal', target: 'grant_free_vouchers', enabled: false },
            { id: 'sc_free_sched', group: '🏢 إدارة الكروت والمخازن', title: 'جدولة كروت دورية', icon: '⏰', action_type: 'modal', target: 'free_schedule', enabled: false },

            // 3. المالية والمحاسبة والقيود
            { id: 'sc_exchange_rates', group: '💰 المالية والمحاسبة والقيود', title: 'أسعار الصرف والعملات', icon: '💱', action_type: 'tab', target: 'exchange_rates', enabled: true },
            { id: 'sc_receipt', group: '💰 المالية والمحاسبة والقيود', title: 'سند قبض نقدية', icon: '💵', action_type: 'modal', target: 'receipt_voucher', enabled: true },
            { id: 'sc_payment', group: '💰 المالية والمحاسبة والقيود', title: 'سند صرف مصاريف', icon: '💳', action_type: 'modal', target: 'payment_voucher', enabled: true },
            { id: 'sc_cashbox', group: '💰 المالية والمحاسبة والقيود', title: 'الصناديق والخزائن', icon: '💰', action_type: 'tab', target: 'cashbox_accounts', enabled: false },
            { id: 'sc_fin_vouchers', group: '💰 المالية والمحاسبة والقيود', title: 'سجل السندات المالية', icon: '🧾', action_type: 'tab', target: 'vouchers_fin', enabled: false },
            { id: 'sc_chart_acc', group: '💰 المالية والمحاسبة والقيود', title: 'دليل وشجرة الحسابات', icon: '🏢', action_type: 'tab', target: 'chart_of_accounts', enabled: false },

            // 4. التقارير والإحصائيات والتحليلات
            { id: 'sc_sales_rep', group: '📈 التقارير والإحصائيات', title: 'مبيعات القنوات والموزعين', icon: '🏪', action_type: 'tab', target: 'sales_channel_reports', enabled: true },
            { id: 'sc_fin_reports', group: '📈 التقارير والإحصائيات', title: 'القوائم المالية (P&L)', icon: '📊', action_type: 'tab', target: 'financial_reports', enabled: true },
            { id: 'sc_port_analytics', group: '📈 التقارير والإحصائيات', title: 'مبيعات واستهلاك المنافذ', icon: '🌐', action_type: 'tab', target: 'port_analytics', enabled: false },
            { id: 'sc_reports_center', group: '📈 التقارير والإحصائيات', title: 'مركز التقارير والطباعة', icon: '🖨️', action_type: 'tab', target: 'reports_center', enabled: false },
            { id: 'sc_logs', group: '📈 التقارير والإحصائيات', title: 'سجلات العمليات والتدقيق', icon: '📜', action_type: 'tab', target: 'logs', enabled: false },

            // 5. إدارة الشبكة والراوترات والأصول
            { id: 'sc_add_router', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'إضافة جهاز راوتر', icon: '🌐', action_type: 'modal', target: 'add_router', enabled: false },
            { id: 'sc_assets', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'فحص الأجهزة والأصول', icon: '📡', action_type: 'tab', target: 'assets', enabled: true },
            { id: 'sc_add_asset', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'إضافة جهاز أو أصل', icon: '📡', action_type: 'modal', target: 'add_asset', enabled: false },
            { id: 'sc_bulk_prices', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'تعديل أسعار الأصناف', icon: '🏷️', action_type: 'modal', target: 'bulk_asset_prices', enabled: false },
            { id: 'sc_nodes', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'هيكلية ونقاط الشبكة', icon: '🌳', action_type: 'tab', target: 'network_nodes', enabled: false },
            { id: 'sc_sstp', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'خادم نفق SSTP VPN', icon: '🔒', action_type: 'tab', target: 'sstp_vpn', enabled: false },
            { id: 'sc_noc', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'مراقبة الشبكة (NOC)', icon: '📊', action_type: 'tab', target: 'noc', enabled: false },
            { id: 'sc_active_sessions', group: '📡 إدارة الشبكة والراوترات والأصول', title: 'الجلسات المتصلة الآن', icon: '🔴', action_type: 'tab', target: 'active_sessions', enabled: false },

            // 6. إدارة النظام والأمان والمستخدمين
            { id: 'sc_add_account', group: '🛡️ إدارة النظام والأمان والمستخدمين', title: 'إضافة حساب / وكيل', icon: '➕', action_type: 'modal', target: 'add_account', enabled: false },
            { id: 'sc_whatsapp', group: '🛡️ إدارة النظام والأمان والمستخدمين', title: 'إعدادات واتساب', icon: '📱', action_type: 'modal', target: 'whatsapp_settings', enabled: false },
            { id: 'sc_portal', group: '🛡️ إدارة النظام والأمان والمستخدمين', title: 'بوابة المشتركين والكرت', icon: '📱', action_type: 'tab', target: 'subscriber_portal', enabled: false },
            { id: 'sc_backups', group: '🛡️ إدارة النظام والأمان والمستخدمين', title: 'النسخ الاحتياطي وتليجرام', icon: '💾', action_type: 'tab', target: 'backups', enabled: false }
        ];
    },

    syncQuickShortcuts(existingShortcuts = []) {
        const defaults = this.getDefaultQuickShortcuts();
        const map = new Map();
        if (Array.isArray(existingShortcuts)) {
            existingShortcuts.forEach(sc => {
                if (sc && sc.id) map.set(sc.id, sc);
                if (sc && sc.action_type && sc.target) map.set(sc.action_type + '|' + sc.target, sc);
            });
        }

        const merged = [];
        defaults.forEach(def => {
            const existing = map.get(def.id) || map.get(def.action_type + '|' + def.target);
            if (existing) {
                const isEnabled = (typeof existing.enabled !== 'undefined')
                    ? (existing.enabled === true || existing.enabled === 1 || existing.enabled === '1' || existing.enabled === 'true')
                    : (def.enabled !== false);
                merged.push({
                    id: def.id,
                    group: def.group,
                    title: existing.title || def.title,
                    icon: existing.icon || def.icon,
                    action_type: def.action_type,
                    target: def.target,
                    enabled: isEnabled
                });
            } else {
                merged.push({ ...def });
            }
        });

        // Add any user custom added shortcuts not in defaults
        if (Array.isArray(existingShortcuts)) {
            existingShortcuts.forEach(sc => {
                if (!sc) return;
                const key = sc.action_type + '|' + sc.target;
                const inDefaults = defaults.some(d => (d.action_type + '|' + d.target) === key || d.id === sc.id);
                if (!inDefaults) {
                    const isEnabled = (typeof sc.enabled !== 'undefined')
                        ? (sc.enabled === true || sc.enabled === 1 || sc.enabled === '1' || sc.enabled === 'true')
                        : true;
                    merged.push({
                        id: sc.id || ('sc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
                        group: sc.group || '🌟 اختصارات مخصصة إضافية',
                        title: sc.title || 'اختصار مخصص',
                        icon: sc.icon || '⚡',
                        action_type: sc.action_type || 'tab',
                        target: sc.target || 'dashboard',
                        enabled: isEnabled
                    });
                }
            });
        }

        return merged;
    },

    toggleCustomizerShortcut(scId, isEnabled = undefined) {
        if (!this.uiSettings) this.uiSettings = {};
        if (!this.uiSettings.quick_shortcuts) {
            this.uiSettings.quick_shortcuts = this.syncQuickShortcuts([]);
        }
        const sc = this.uiSettings.quick_shortcuts.find(s => s.id === scId);
        if (sc) {
            if (typeof isEnabled === 'boolean') {
                sc.enabled = isEnabled;
            } else {
                sc.enabled = !(sc.enabled !== false);
            }
            const chk = document.querySelector(`input[data-sc-id="${scId}"]`);
            if (chk) {
                chk.checked = sc.enabled;
            }
            const btn = document.querySelector(`[data-sc-btn="${scId}"]`);
            if (btn) {
                btn.style.background = sc.enabled ? '#059669' : 'var(--bg-window, #fff)';
                btn.style.borderColor = sc.enabled ? '#059669' : 'var(--border-color, #cbd5e1)';
                btn.style.color = sc.enabled ? '#fff' : 'var(--text-muted, #64748b)';
                btn.innerHTML = sc.enabled ? '✔ مفعّل' : 'إظهار';
            }
            const item = document.querySelector(`[data-sc-item="${scId}"]`);
            if (item) {
                item.style.borderColor = sc.enabled ? '#059669' : 'var(--border-color, #cbd5e1)';
                item.style.background = sc.enabled ? 'rgba(5,150,105,0.05)' : 'var(--bg-window, #fff)';
            }
            this.updateCustomizerShortcutsCount();
        }
    },

    updateCustomizerShortcutsCount() {
        document.querySelectorAll('#customizer-shortcuts-list > div').forEach(groupDiv => {
            const items = groupDiv.querySelectorAll('.widget-config-item input[data-sc-id]');
            let active = 0;
            items.forEach(chk => { if (chk.checked) active++; });
            const badge = groupDiv.querySelector('.sam-active-sc-badge');
            if (badge) {
                badge.innerHTML = `المفعّل: <b style="color:#059669;">${active}</b> من <b>${items.length}</b>`;
            }
        });
    },

    toggleAllShortcuts(enableAll) {
        if (!this.uiSettings) this.uiSettings = {};
        if (!this.uiSettings.quick_shortcuts) {
            this.uiSettings.quick_shortcuts = this.syncQuickShortcuts([]);
        }
        this.uiSettings.quick_shortcuts.forEach(sc => {
            sc.enabled = !!enableAll;
        });
        this.renderUICustomizer();
        this.toast(enableAll ? 'تم تفعيل وإظهار كافة الاختصارات' : 'تم إخفاء كافة الاختصارات', 'info');
    },

    resetDefaultShortcuts() {
        if (!confirm('هل تريد استعادة قائمة الاختصارات الافتراضية المقسمة؟')) return;
        if (!this.uiSettings) this.uiSettings = {};
        this.uiSettings.quick_shortcuts = this.getDefaultQuickShortcuts();
        this.renderUICustomizer();
        this.toast('تمت استعادة الاختصارات الافتراضية بنجاح', 'success');
    },

    async renderUICustomizer() {
        const ui = await this.loadUISettings();
        const widgets = ui.dashboard_widgets || [];
        const shortcuts = ui.quick_shortcuts || [];
        const bottomNav = ui.mobile_bottom_nav || [];

        // All available system tabs with clean names
        const allTabs = [
            { id: 'dashboard', name: 'الرئيسية والمؤشرات', icon: '📊' },
            { id: 'users', name: 'كروت الانترنت والمشتركون', icon: '👥' },
            { id: 'sales', name: 'المبيعات وعمليات الشراء', icon: '💳' },
            { id: 'cashbox_accounts', name: 'صناديق الحسابات والمالية', icon: '💰' },
            { id: 'operating_expenses', name: 'المصروفات التشغيلية والالتزامات', icon: '💸' },
            { id: 'chart_of_accounts', name: 'شجرة ودليل الحسابات', icon: '📑' },
            { id: 'reports_center', name: 'مركز التقارير والطباعة', icon: '📈' },
            { id: 'admins_agents', name: 'المستخدمين والوكلاء', icon: '👥' },
            { id: 'whatsapp_manager', name: 'إدارة رسائل وسيرفر الواتساب', icon: '💬' },
            { id: 'routers', name: 'أجهزة الراوتر (NAS)', icon: '🌐' },
            { id: 'assets', name: 'إدارة الأصول ومعدات الشبكة', icon: '📡' },
            { id: 'active_sessions', name: 'الجلسات المباشرة المتصلة', icon: '⚡' },
            { id: 'card_warehouses', name: 'مخازن الكروت والعهد', icon: '🏢' },
            { id: 'vouchers_fin', name: 'سندات القبض والصرف', icon: '🧾' },
            { id: 'hotspot_designer', name: 'إعداد وتصميم الهوتسبوت', icon: '🎨' },
            { id: 'network_nodes', name: 'هيكلية ونقاط الشبكة', icon: '🌳' },
            { id: 'noc', name: 'مركز مراقبة الشبكة (NOC)', icon: '📡' },
            { id: 'financial_reports', name: 'القوائم المالية والختامية', icon: '📊' },
            { id: 'backups', name: 'النسخ الاحتياطي', icon: '🛡️' }
        ];

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');
        const PB = window.SamUI?.PageBuilder;

        const actions = [
            { label: '🔄 استعادة الافتراضي', variant: 'secondary', onclick: 'App.resetCustomizerDefaults()', title: 'استعادة الترتيب والإعدادات الافتراضية لرتبتك' },
            { label: '💾 حفظ التخصيص الشخصي ✓', variant: 'success', onclick: 'App.saveCustomizerSettings()' }
        ];

        const innerContent = `
            ${isSuperAdmin ? `
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:12px; color:#166534;">
                        <b>👑 نمط المسؤول المالك:</b> التخصيص يُحفظ لحسابك الشخصي، ويمكنك اختيارياً تعميمه كقالب افتراضي عام لكافة المشرفين والوكلاء الجدد.
                    </div>
                    <label style="font-size:12px; font-weight:bold; color:#15803d; display:flex; align-items:center; gap:6px; cursor:pointer;">
                        <input type="checkbox" id="cust-save-as-global" />
                        🌐 تعميم كإعداد افتراضي عام للنظام
                    </label>
                </div>
            ` : `
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:20px;">🎨</span>
                    <div style="font-size:12px; color:#1e40af;">
                        <b>👤 تخصيص لوحتك الشخصية:</b> جميع التعديلات والسمات وترتيب البطاقات هنا خاصة بحسابك <b>(${this.escape(this.userFullname || this.user)})</b> ومحفوظة لك على السيرفر، ولن تؤثر على أي مستخدم آخر في الشبكة.
                    </div>
                </div>
            `}
            <!-- 1. Header Bar & Branding Customizer -->
            <div class="customizer-box" style="margin-bottom:16px; background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:16px;">
                <div class="customizer-title" style="font-weight:800; font-size:14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>🎛️ 1. تخصيص الترويسة والشريط العلوي (Header Bar)</span>
                    <span style="font-size:11px; color:var(--text-muted);">التحكم بأزرار الوصول السريع العلوية</span>
                </div>
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;padding:9px 12px;font-size:12px;color:#1e40af; margin-bottom:12px;">
                    اسم النظام والاسم المختصر إعدادان عامان، ويمكن لمالك النظام تعديلهما من «إدارة النظام والأمن ← إعدادات النظام والخادم» فقط.
                </div>

                <div>
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:8px;">أزرار الوصول السريع في الشريط العلوي:</label>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-network_switcher" ${(ui.header_buttons||[]).includes('network_switcher') ? 'checked' : ''} />
                            <span>🌐 مبدل الشبكات (Network Switcher)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-notif" ${(ui.header_buttons||[]).includes('notif') ? 'checked' : ''} />
                            <span>🔔 مركز الإشعارات والتنبيهات</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-whatsapp" ${(ui.header_buttons||[]).includes('whatsapp') ? 'checked' : ''} />
                            <span>📱 زر بوابة واتساب</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-portal" ${(ui.header_buttons||[]).includes('portal') ? 'checked' : ''} />
                            <span>🌐 زر بوابة الكرت والمشتركين</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-lang" ${(ui.header_buttons||[]).includes('lang') ? 'checked' : ''} />
                            <span>🌐 تبديل اللغة (AR / EN)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="btn-toggle-theme" ${(ui.header_buttons||[]).includes('theme') ? 'checked' : ''} />
                            <span>🌙 التبديل للوضع الليلي / النهاري</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- 2. Dashboard Widgets & KPIs Customizer -->
            <div class="customizer-box" style="margin-bottom:16px; background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:16px;">
                <div class="customizer-title" style="font-weight:800; font-size:14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span>📊 2. إعداد وترتيب وإضافة بطاقات لوحة التحكم (Dashboard Widgets)</span>
                    <button class="mt-btn mt-btn-primary" style="padding:5px 12px; font-size:12px; font-weight:700;" onclick="App.showWidgetModal()">
                        ➕ إضافة بطاقة إحصائية جديدة
                    </button>
                </div>
                <div id="customizer-widgets-list" style="display:flex; flex-direction:column; gap:8px;">
                    ${widgets.map((w, index) => `
                        <div class="widget-config-item" data-id="${w.id}" style="background:var(--bg-main, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:22px; width:36px; height:36px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; background:${w.color ? w.color + '15' : '#f1f5f9'}; color:${w.color || '#0284c7'};">${w.icon || '📊'}</span>
                                <div>
                                    <div style="font-weight:700; font-size:13px; color:#0f172a;">${this.escape(w.title)}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">الواجهة المرتبطة: <code>${w.tab}</code> | مصدر البيانات: <b>${w.metric_key || w.id}</b></div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <button class="mt-btn" style="padding:3px 10px; font-size:11.5px;" onclick="App.showWidgetModal(${index})" title="تعديل تفاصيل البطاقة">✏️ تعديل</button>
                                <button class="mt-btn mt-btn-danger" style="padding:3px 10px; font-size:11.5px;" onclick="App.deleteCustomizerWidget(${index})" title="حذف البطاقة">🗑️</button>
                                <div style="display:flex; gap:2px; margin-right:6px;">
                                    <button class="mt-btn" style="padding:3px 8px; font-size:11.5px;" onclick="App.moveCustomizerWidget(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="تحريك لأعلى">⬆️</button>
                                    <button class="mt-btn" style="padding:3px 8px; font-size:11.5px;" onclick="App.moveCustomizerWidget(${index}, 1)" ${index === widgets.length - 1 ? 'disabled' : ''} title="تحريك لأسفل">⬇️</button>
                                </div>
                                <label style="display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:700; cursor:pointer; margin-right:6px;">
                                    <input type="checkbox" id="widget-active-${w.id}" ${w.enabled !== false ? 'checked' : ''} onchange="App.toggleCustomizerWidget('${w.id}', this.checked)" />
                                    <span>${w.enabled !== false ? 'مفعلة ✅' : 'معطلة ❌'}</span>
                                </label>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 3. Quick Action Shortcuts Customizer -->
            <div class="customizer-box" style="margin-bottom:16px; background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:16px;">
                <div class="customizer-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                    <div>
                        <span style="font-size:14px; font-weight:800;">⚡ 3. إدارة واختيار اختصارات الوصول السريع (Quick Shortcuts)</span>
                        <div style="font-size:11.5px; color:var(--text-muted); font-weight:normal; margin-top:2px;">
                            كافة الاختصارات مقسمة ومصنفة بهذا الترتيب لتسهيل عملك. يمكنك فقط تفعيل (إظهار) أو تعطيل (إخفاء) أي اختصار بنقرة واحدة:
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:4px 12px; font-size:11.5px; font-weight:700;" onclick="App.toggleAllShortcuts(true)">
                            ✔ إظهار الكل
                        </button>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" style="padding:4px 12px; font-size:11.5px;" onclick="App.toggleAllShortcuts(false)">
                            ✕ إخفاء الكل
                        </button>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" style="padding:4px 12px; font-size:11.5px;" onclick="App.resetDefaultShortcuts()">
                            🔄 استعادة الافتراضي
                        </button>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" style="padding:4px 12px; font-size:11.5px; font-weight:700;" onclick="App.showShortcutModal()">
                            ➕ إضافة اختصار مخصص
                        </button>
                    </div>
                </div>

                <!-- Grouped Shortcuts List -->
                <div id="customizer-shortcuts-list" style="display:flex; flex-direction:column; gap:14px; margin-top:14px;">
                    ${(() => {
                        const allShortcuts = this.syncQuickShortcuts(shortcuts);
                        this.uiSettings.quick_shortcuts = allShortcuts;

                        // Group by group name
                        const groups = {};
                        allShortcuts.forEach((sc, globalIdx) => {
                            const g = sc.group || 'أخرى';
                            if (!groups[g]) groups[g] = [];
                            groups[g].push({ ...sc, globalIdx });
                        });

                        return Object.entries(groups).map(([gName, items]) => {
                            const activeCount = items.filter(i => i.enabled !== false).length;
                            return `
                            <div style="background:var(--bg-main, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                <div style="font-weight:800; font-size:13px; color:var(--primary-color, #0284c7); border-bottom:1px solid var(--border-color, #e2e8f0); padding-bottom:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                                    <span>${gName}</span>
                                    <span class="sam-active-sc-badge" style="font-size:11px; font-weight:700; color:var(--text-muted); background:var(--bg-window, #fff); padding:2px 8px; border-radius:12px; border:1px solid var(--border-color, #cbd5e1);">
                                        المفعّل: <b style="color:#059669;">${activeCount}</b> من <b>${items.length}</b>
                                    </span>
                                </div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">
                                    ${items.map(sc => `
                                        <div class="widget-config-item" data-sc-item="${sc.id}" style="padding:8px 12px; margin:0; border-radius:6px; border:1px solid ${sc.enabled !== false ? '#059669' : 'var(--border-color, #cbd5e1)'}; background:${sc.enabled !== false ? 'rgba(5,150,105,0.05)' : 'var(--bg-window, #fff)'}; display:flex; align-items:center; justify-content:space-between; transition:all 0.2s;">
                                            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                                                <span style="font-size:20px; width:34px; height:34px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; background:var(--bg-main, #f8fafc); border:1px solid var(--border-color, #e2e8f0);">${sc.icon || '⚡'}</span>
                                                <div style="min-width:0; flex:1;">
                                                    <div style="font-weight:700; font-size:12.5px; color:${sc.enabled !== false ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #64748b)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                                        ${this.escape(sc.title)}
                                                    </div>
                                                    <div style="font-size:10px; color:var(--text-muted, #64748b); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                                        ${sc.action_type === 'modal' ? '⚡ نافذة منبثقة' : '📑 شاشة'} | ${sc.target}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                <button type="button" class="mt-btn" style="padding:3px 7px; font-size:11px;" onclick="App.showShortcutModal(${sc.globalIdx})" title="تعديل الاسم أو الأيقونة">✏️</button>
                                                <button type="button" data-sc-btn="${sc.id}" style="display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:700; cursor:pointer; user-select:none; padding:4px 9px; border-radius:6px; border:1px solid ${sc.enabled !== false ? '#059669' : 'var(--border-color, #cbd5e1)'}; background:${sc.enabled !== false ? '#059669' : 'var(--bg-window, #fff)'}; color:${sc.enabled !== false ? '#fff' : 'var(--text-muted, #64748b)'};" onclick="App.toggleCustomizerShortcut('${sc.id}')">
                                                    ${sc.enabled !== false ? '✔ مفعّل' : 'إظهار'}
                                                </button>
                                                <input type="checkbox" data-sc-id="${sc.id}" style="display:none;" ${sc.enabled !== false ? 'checked' : ''} />
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            `;
                        }).join('');
                    })()}
                </div>
            </div>

            <!-- 4. Mobile Bottom Navigation Bar Customizer -->
            <div class="customizer-box" style="margin-bottom:20px; background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:16px;">
                <div class="customizer-title" style="font-weight:800; font-size:14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <span>📱 4. تخصيص شريط الملاحة السفلي للهواتف (Mobile Bottom Bar)</span>
                    <span style="font-size:11px; color:var(--text-muted);">الأيقونات المعروضة في شريط الجوال السفلي</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:12px;">
                    ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(slot => {
                        const cur = bottomNav[slot] || allTabs[slot] || allTabs[0];
                        return `
                        <div style="background:var(--bg-main, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:10px;">
                            <label style="font-weight:700; font-size:11.5px; margin-bottom:6px; display:block;">الأيقونة رقم ${slot + 1}:</label>
                            <select id="bottom-nav-slot-${slot}" class="sam-select mt-select" style="width:100%; font-weight:700;">
                                ${allTabs.map(t => `<option value="${t.id}|${t.icon}|${t.name}" ${cur.tab === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}
                            </select>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Submit Buttons -->
            <div style="text-align:center; padding:15px 0;">
                <button type="button" class="sam-btn sam-btn--success" onclick="App.saveCustomizerSettings()" style="font-size:14px; font-weight:700; padding:11px 32px; border-radius:8px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.3);">
                    💾 حفظ وتطبيق كافة التعديلات فوراً
                </button>
            </div>
        `;

        if (PB && typeof PB.renderShell === 'function') {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'ui_customizer',
                archetype: 'designer',
                eyebrow: 'UI / STUDIO',
                title: 'استوديو تخصيص الواجهة واللوحة الشخصية',
                subtitle: isSuperAdmin ? 'تخصيص الأشرطة، البطاقات، وترتيب الاختصارات وشريط الجوال' : 'تخصيص لوحة القيادة والاختصارات الشخصية الخاصة بحسابك',
                icon: '🎨',
                actions: actions,
                content: `<div style="max-width:1100px; margin:0 auto; width:100%;">${innerContent}</div>`
            });
        } else {
            document.getElementById('main-view').innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700; font-size:14px; color:#0f172a;">🎨 استوديو تخصيص الواجهة واللوحة الشخصية</span>
                    <span class="badge" style="background:${isSuperAdmin ? '#0284c7' : '#059669'}; font-size:11px;">${isSuperAdmin ? 'إدارة عامة' : 'خاص بحسابك'}</span>
                </div>
                <div class="mt-toolbar-right" style="display:flex; gap:8px; align-items:center;">
                    <button class="mt-btn" onclick="App.resetCustomizerDefaults()" title="استعادة الترتيب والإعدادات الافتراضية لرتبتك">
                        🔄 استعادة الافتراضي
                    </button>
                    <button class="mt-btn mt-btn-success" onclick="App.saveCustomizerSettings()" style="font-weight:700; padding:6px 14px;">
                        💾 حفظ التخصيص الشخصي ✓
                    </button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:16px; max-width:1100px; margin:0 auto; width:100%;">
                ${innerContent}
            </div>
            `;
        }
        window.SamPageShell?.sync();
    },

    // Modal to Add / Edit Widget
    showWidgetModal(widgetIndex = null) {
        const isEdit = widgetIndex !== null;
        const w = (isEdit && this.uiSettings?.dashboard_widgets) ? this.uiSettings.dashboard_widgets[widgetIndex] : {
            id: 'custom_' + Date.now(),
            title: '',
            icon: '📊',
            metric_key: 'assets',
            tab: 'assets',
            color: '#0284c7',
            enabled: true
        };

        const metricOptions = [
            { key: 'assets', name: 'المعدات والأجهزة (إجمالي / متصل / منقطع)' },
            { key: 'networks', name: 'الشبكات وأنفاق SSTP' },
            { key: 'active_sessions', name: 'المتصلون الآن (الجلسات النشطة)' },
            { key: 'cards_users', name: 'المشتركون والباقات' },
            { key: 'today_sales', name: 'مبيعات اليوم وفواتير البيع' },
            { key: 'cashbox', name: 'رصيد الصندوق' },
            { key: 'distributor_debt', name: 'مديونيات الوكلاء' },
            { key: 'vouchers_today', name: 'سندات اليوم (قبض وصرف)' },
            { key: 'warehouses', name: 'مخزون الكروت المتاحة' },
            { key: 'traffic_today', name: 'ترافيك اليوم (Upload / Download)' },
            { key: 'partners_capital', name: 'رؤوس أموال وحصص الشركاء' },
            { key: 'security_alerts', name: 'الأمان والماكات المكررة' },
        ];

        const tabOptions = [
            { id: 'dashboard', name: '📊 لوحة التحكم (Dashboard)' },
            { id: 'assets', name: '📡 إدارة الأجهزة والمعدات (Assets)' },
            { id: 'routers', name: '🌐 أجهزة الراوتر (NAS & SSTP)' },
            { id: 'active_sessions', name: '⚡ الجلسات المباشرة (Active Sessions)' },
            { id: 'users', name: '👥 كروت الانترنت والمشتركون (Users)' },
            { id: 'sales', name: '🛒 المبيعات وعمليات الشراء (Sales)' },
            { id: 'cashbox_accounts', name: '💰 الصناديق والخزائن (Cashbox)' },
            { id: 'admins_agents', name: '👔 إدارة المستخدمين والوكلاء (Admins)' },
            { id: 'vouchers_fin', name: '🧾 سندات القبض والصرف (Vouchers)' },
            { id: 'card_warehouses', name: '🏢 مخازن الكروت والعهد (Warehouses)' },
            { id: 'noc', name: '📡 مركز مراقبة الشبكة (NOC)' },
            { id: 'partners_equity', name: '👥 الشركاء وتوزيع الأرباح' },
            { id: 'network_nodes', name: '🌳 هيكلية ونقاط الشبكة' },
            { id: 'financial_reports', name: '📈 التقارير المالية والختامية' },
            { id: 'backups', name: '🛡️ النسخ الاحتياطي والأمان' },
        ];

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:550px;">
                <div class="mt-modal-header" style="background:#0284c7; color:#fff;">
                    <span>${isEdit ? '✏️ تعديل بطاقة إحصائية' : '➕ إضافة بطاقة إحصائية جديدة'}</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <form onsubmit="App.handleWidgetFormSubmit(event, ${widgetIndex})">
                    <div class="mt-modal-body">
                        <div class="form-row">
                            <div class="form-group" style="flex:2;">
                                <label>عنوان البطاقة الإحصائية:</label>
                                <input type="text" id="cust-w-title" class="mt-input" value="${this.escape(w.title)}" placeholder="مثال: المعدات والأجهزة" required />
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>الأيقونة / الإيموجي:</label>
                                <input type="text" id="cust-w-icon" class="mt-input" value="${this.escape(w.icon || '📊')}" placeholder="📡" required />
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom:12px;">
                            <label>مصدر البيانات / نوع الإحصائية:</label>
                            <select id="cust-w-metric" class="mt-select" style="width:100%;">
                                ${metricOptions.map(m => `<option value="${m.key}" ${(w.metric_key||w.id)===m.key ? 'selected' : ''}>${m.name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group" style="margin-bottom:12px;">
                            <label>الواجهة المرتبطة (التي يفتحها النقر على البطاقة):</label>
                            <select id="cust-w-tab" class="mt-select" style="width:100%;">
                                ${tabOptions.map(t => `<option value="${t.id}" ${w.tab===t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label>اللون المميز للأيقونة:</label>
                                <input type="color" id="cust-w-color" style="height:36px; width:100%; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" value="${w.color || '#0284c7'}" />
                            </div>
                            <div class="form-group" style="flex:1; justify-content:center;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-top:18px;">
                                    <input type="checkbox" id="cust-w-enabled" ${w.enabled !== false ? 'checked' : ''} />
                                    <span style="font-weight:700;">تفعيل وإظهار البطاقة</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="mt-modal-footer">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-success">${isEdit ? '💾 حفظ التعديل' : '➕ إضافة البطاقة'}</button>
                    </div>
                </form>
            </div>
        </div>
        `;
    },

    handleWidgetFormSubmit(event, widgetIndex) {
        event.preventDefault();
        const title = document.getElementById('cust-w-title').value.trim();
        const icon = document.getElementById('cust-w-icon').value.trim() || '📊';
        const metric_key = document.getElementById('cust-w-metric').value;
        const tab = document.getElementById('cust-w-tab').value;
        const color = document.getElementById('cust-w-color').value;
        const enabled = document.getElementById('cust-w-enabled').checked;

        if (!this.uiSettings) this.uiSettings = {};
        if (!this.uiSettings.dashboard_widgets) this.uiSettings.dashboard_widgets = [];

        if (widgetIndex !== null && widgetIndex >= 0) {
            // Edit existing
            this.uiSettings.dashboard_widgets[widgetIndex].title = title;
            this.uiSettings.dashboard_widgets[widgetIndex].icon = icon;
            this.uiSettings.dashboard_widgets[widgetIndex].metric_key = metric_key;
            this.uiSettings.dashboard_widgets[widgetIndex].tab = tab;
            this.uiSettings.dashboard_widgets[widgetIndex].color = color;
            this.uiSettings.dashboard_widgets[widgetIndex].enabled = enabled;
        } else {
            // Add new
            this.uiSettings.dashboard_widgets.push({
                id: 'w_' + Date.now(),
                title,
                icon,
                metric_key,
                tab,
                color,
                enabled
            });
        }

        this.closeModal();
        this.saveCustomizerSettings();
    },

    deleteCustomizerWidget(widgetIndex) {
        if (!this.uiSettings || !this.uiSettings.dashboard_widgets) return;
        const w = this.uiSettings.dashboard_widgets[widgetIndex];
        if (!confirm(`هل أنت متأكد من حذف بطاقة [${w.title}] نهائياً؟`)) return;

        this.uiSettings.dashboard_widgets.splice(widgetIndex, 1);
        this.saveCustomizerSettings();
    },

    // Modal to Add / Edit Quick Shortcut
    showShortcutModal(shortcutIndex = null) {
        const isEdit = shortcutIndex !== null;

        const actionCatalog = [
            {
                group: '🛒 المبيعات والمشتريات',
                items: [
                    { type: 'modal', target: 'new_sale', defaultTitle: 'فاتورة بيع جديدة', icon: '🛒', name: '🛒 فتح نافذة فاتورة بيع جديدة' },
                    { type: 'modal', target: 'purchase_invoice', defaultTitle: 'فاتورة مشتريات جديدة', icon: '🧾', name: '🧾 فتح نافذة فاتورة مشتريات جديدة' },
                    { type: 'modal', target: 'sales_add_buyer', defaultTitle: 'إضافة عميل مشتري', icon: '👤', name: '👤 فتح المبيعات لإضافة عميل مشتري' },
                    { type: 'tab', target: 'sales', defaultTitle: 'إدارة المبيعات', icon: '🛒', name: '🛒 الانتقال لشاشة المبيعات' },
                    { type: 'tab', target: 'purchases', defaultTitle: 'المشتريات والموردين', icon: '🧾', name: '🧾 الانتقال للمشتريات والموردين' },
                ]
            },
            {
                group: '🏢 مخازن الكروت والعهد',
                items: [
                    { type: 'modal', target: 'stock_transfer', defaultTitle: 'أمر تحويل مخزني', icon: '📦', name: '📦 فتح نافذة أمر تحويل مخزني جديد' },
                    { type: 'modal', target: 'batch_gen', defaultTitle: 'توليد كروت بالدفعات', icon: '⚡', name: '⚡ فتح نافذة توليد كروت بالدفعات' },
                    { type: 'modal', target: 'add_profile', defaultTitle: 'إضافة باقة خدمة', icon: '📦', name: '📦 إضافة باقة خدمة جديدة' },
                    { type: 'modal', target: 'grant_free_vouchers', defaultTitle: 'منح كروت مجانية', icon: '🎁', name: '🎁 فتح نافذة كروت مجانية فورية' },
                    { type: 'modal', target: 'free_schedule', defaultTitle: 'جدولة كروت دورية', icon: '⏰', name: '⏰ ضبط جدولة كروت دورية' },
                    { type: 'tab', target: 'card_warehouses', defaultTitle: 'مخازن الكروت والعهد', icon: '🏢', name: '🏢 الانتقال لمخازن الكروت والعهد' },
                    { type: 'tab', target: 'users', defaultTitle: 'كروت الانترنت والمشتركين', icon: '👥', name: '👥 الانتقال لقائمة الكروت والمشتركين' },
                ]
            },
            {
                group: '💰 المالية والخزائن والسندات',
                items: [
                    { type: 'modal', target: 'receipt_voucher', defaultTitle: 'سند قبض نقدية', icon: '💵', name: '💵 فتح نافذة سند قبض نقدية' },
                    { type: 'modal', target: 'payment_voucher', defaultTitle: 'سند صرف مصاريف', icon: '💳', name: '💳 فتح نافذة سند صرف مصاريف' },
                    { type: 'tab', target: 'cashbox_accounts', defaultTitle: 'الصناديق والخزائن', icon: '💰', name: '💰 الانتقال لشاشة الصناديق والخزائن' },
                    { type: 'tab', target: 'vouchers_fin', defaultTitle: 'سندات القبض والصرف', icon: '🧾', name: '🧾 الانتقال لسجل السندات المالية' },
                    { type: 'tab', target: 'financial_reports', defaultTitle: 'القوائم المالية والختامية', icon: '📈', name: '📈 الانتقال للتقارير والقوائم المالية' },
                ]
            },
            {
                group: '🌐 الشبكة والأصول والراوترات',
                items: [
                    { type: 'modal', target: 'add_router', defaultTitle: 'إضافة جهاز راوتر', icon: '🌐', name: '🌐 فتح نافذة إضافة جهاز راوتر' },
                    { type: 'modal', target: 'add_network_node', defaultTitle: 'إضافة نقطة شبكة', icon: '🗼', name: '🗼 فتح نافذة إضافة نقطة شبكة جديدة' },
                    { type: 'modal', target: 'add_asset', defaultTitle: 'إضافة جهاز / أصل', icon: '📡', name: '📡 فتح نافذة إضافة جهاز أو أصل جديد' },
                    { type: 'modal', target: 'bulk_asset_prices', defaultTitle: 'تعديل أسعار الأصناف', icon: '🏷️', name: '🏷️ فتح نافذة تعديل أسعار الأصناف' },
                    { type: 'tab', target: 'assets', defaultTitle: 'فحص الأجهزة والأصول', icon: '📡', name: '📡 الانتقال لشاشة فحص الأجهزة والأصول' },
                    { type: 'tab', target: 'network_nodes', defaultTitle: 'شجرة وهيكلية الشبكة', icon: '🌳', name: '🌳 الانتقال لشجرة وهيكلية الشبكة' },
                    { type: 'tab', target: 'sstp_vpn', defaultTitle: 'خادم نفق SSTP VPN', icon: '🔒', name: '🔒 الانتقال لخادم نفق SSTP VPN' },
                    { type: 'tab', target: 'noc', defaultTitle: 'مركز مراقبة الشبكة NOC', icon: '📊', name: '📊 الانتقال لمركز مراقبة الشبكة NOC' },
                    { type: 'tab', target: 'active_sessions', defaultTitle: 'الجلسات المباشرة', icon: '⚡', name: '⚡ الانتقال للجلسات المباشرة المتصلة' },
                ]
            },
            {
                group: '👥 الإدارة والنظام',
                items: [
                    { type: 'modal', target: 'add_account', defaultTitle: 'إضافة حساب / وكيل', icon: '➕', name: '➕ فتح نافذة إضافة حساب / وكيل جديد' },
                    { type: 'modal', target: 'whatsapp_settings', defaultTitle: 'إعدادات واتساب', icon: '📱', name: '📱 فتح نافذة إعدادات واتساب' },
                    { type: 'tab', target: 'subscriber_portal', defaultTitle: 'بوابة الكرت والمشتركين', icon: '📱', name: '📱 الانتقال لبوابة الكرت والمشتركين' },
                    { type: 'tab', target: 'backups', defaultTitle: 'النسخ الاحتياطي', icon: '🛡️', name: '🛡️ الانتقال لشاشة النسخ الاحتياطي' },
                ]
            }
        ];

        window.__samActionCatalog = actionCatalog;

        const defaultItem = actionCatalog[0].items[0];
        const sc = (isEdit && this.uiSettings?.quick_shortcuts) ? this.uiSettings.quick_shortcuts[shortcutIndex] : {
            id: 'sc_' + Date.now(),
            title: defaultItem.defaultTitle,
            icon: defaultItem.icon,
            action_type: defaultItem.type,
            target: defaultItem.target
        };

        const currentActionVal = `${sc.action_type || 'tab'}|${sc.target}`;

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:520px; max-width:95vw; box-shadow:0 12px 36px rgba(0,0,0,0.25); border-radius:10px; overflow:hidden;">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#fff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                        ${isEdit ? '✏️ تعديل اختصار وصول سريع' : '➕ إضافة اختصار وصول سريع جديد'}
                    </span>
                    <span style="cursor:pointer; font-size:18px; line-height:1;" onclick="App.closeModal()">✕</span>
                </div>
                <form onsubmit="App.handleShortcutFormSubmit(event, ${shortcutIndex})">
                    <div class="mt-modal-body" style="padding:18px;">
                        
                        <!-- 1. Select Action (at the top) -->
                        <div class="form-group" style="margin-bottom:16px;">
                            <label style="font-weight:700; font-size:12.5px; margin-bottom:6px; display:block; color:var(--text-main);">
                                ⚡ الإجراء المرتبط بالاختصار (اختر العملية أولاً):
                            </label>
                            <select id="cust-sc-action" class="mt-select" style="width:100%; font-weight:600; padding:8px 10px;" onchange="App.onShortcutActionChange(this.value)">
                                ${actionCatalog.map(g => `
                                    <optgroup label="${g.group}">
                                        ${g.items.map(o => {
                                            const val = `${o.type}|${o.target}`;
                                            const selected = (currentActionVal === val) ? 'selected' : '';
                                            return `<option value="${val}" data-title="${this.escape(o.defaultTitle)}" data-icon="${this.escape(o.icon)}" ${selected}>${o.name}</option>`;
                                        }).join('')}
                                    </optgroup>
                                `).join('')}
                            </select>
                        </div>

                        <!-- 2. Title & Icon Row (Auto-filled) -->
                        <div class="form-row" style="display:flex; gap:12px; margin-bottom:14px;">
                            <div class="form-group" style="flex:2;">
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">اسم الاختصار (يتم التعبئة تلقائياً ويمكن تعديله):</label>
                                <input type="text" id="cust-sc-title" class="mt-input" value="${this.escape(sc.title)}" placeholder="مثال: فاتورة بيع جديدة" oninput="App.updateShortcutPreview()" required />
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">الأيقونة / الإيموجي:</label>
                                <input type="text" id="cust-sc-icon" class="mt-input" value="${this.escape(sc.icon || '⚡')}" style="text-align:center; font-size:16px;" placeholder="🛒" oninput="App.updateShortcutPreview()" required />
                            </div>
                        </div>

                        <!-- 3. Quick Emoji Picker Chips -->
                        <div style="margin-bottom:16px;">
                            <label style="font-size:11px; color:var(--text-muted); margin-bottom:4px; display:block;">اختر أيقونة سريعة:</label>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                ${['🛒', '🧾', '💵', '💳', '📦', '⚡', '🌐', '📡', '👥', '📱', '🛡️', '📊', '🎁', '⏰', '🗼', '🏷️'].map(e => `
                                    <button type="button" class="mt-btn" style="padding:2px 8px; font-size:14px; background:var(--bg-main);" onclick="document.getElementById('cust-sc-icon').value='${e}'; App.updateShortcutPreview();">${e}</button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 4. Live Preview Box -->
                        <div style="background:var(--bg-main); border:1px dashed var(--border-color); border-radius:8px; padding:12px; margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">معاينة شكل الاختصار في لوحة التحكم:</div>
                            <div id="cust-sc-preview" class="quick-action-card" style="max-width:240px; pointer-events:none; margin:0 auto; background:var(--bg-window); box-shadow:0 2px 8px rgba(0,0,0,0.06); border:1px solid var(--border-color); display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:8px;">
                                <span id="cust-sc-preview-icon" style="font-size:20px;">${this.escape(sc.icon || '⚡')}</span>
                                <span id="cust-sc-preview-title" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700;">${this.escape(sc.title || 'فاتورة بيع جديدة')}</span>
                            </div>
                        </div>

                    </div>
                    <div class="mt-modal-footer" style="padding:12px 18px; background:var(--bg-main); display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--border-color);">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:700; padding:6px 16px;">${isEdit ? '💾 حفظ التعديل' : '➕ إضافة الاختصار'}</button>
                    </div>
                </form>
            </div>
        </div>
        `;

        App.updateShortcutPreview();
    },

    onShortcutActionChange(actionVal) {
        const select = document.getElementById('cust-sc-action');
        if (!select) return;
        const opt = select.options[select.selectedIndex];
        if (opt) {
            const titleInput = document.getElementById('cust-sc-title');
            const iconInput = document.getElementById('cust-sc-icon');
            if (titleInput && opt.dataset.title) {
                titleInput.value = opt.dataset.title;
            }
            if (iconInput && opt.dataset.icon) {
                iconInput.value = opt.dataset.icon;
            }
        }
        this.updateShortcutPreview();
    },

    updateShortcutPreview() {
        const title = document.getElementById('cust-sc-title')?.value || 'اختصار جديد';
        const icon = document.getElementById('cust-sc-icon')?.value || '⚡';
        const pTitle = document.getElementById('cust-sc-preview-title');
        const pIcon = document.getElementById('cust-sc-preview-icon');
        if (pTitle) pTitle.textContent = title;
        if (pIcon) pIcon.textContent = icon;
    },

    handleShortcutFormSubmit(event, shortcutIndex) {
        event.preventDefault();
        const title = document.getElementById('cust-sc-title').value.trim();
        const icon = document.getElementById('cust-sc-icon').value.trim() || '⚡';
        const actionVal = document.getElementById('cust-sc-action').value;
        const [action_type, target] = actionVal.split('|');

        if (!this.uiSettings) this.uiSettings = {};
        if (!this.uiSettings.quick_shortcuts) this.uiSettings.quick_shortcuts = [];

        if (shortcutIndex !== null && shortcutIndex >= 0 && this.uiSettings.quick_shortcuts[shortcutIndex]) {
            this.uiSettings.quick_shortcuts[shortcutIndex].title = title;
            this.uiSettings.quick_shortcuts[shortcutIndex].icon = icon;
            this.uiSettings.quick_shortcuts[shortcutIndex].action_type = action_type;
            this.uiSettings.quick_shortcuts[shortcutIndex].target = target;
        } else {
            this.uiSettings.quick_shortcuts.push({
                id: 'sc_' + Date.now(),
                group: '🌟 اختصارات مخصصة إضافية',
                title,
                icon,
                action_type,
                target,
                enabled: true
            });
        }

        this.closeModal();
        this.saveCustomizerSettings();
    },

    deleteCustomizerShortcut(shortcutIndex) {
        if (!this.uiSettings || !this.uiSettings.quick_shortcuts) return;
        const sc = this.uiSettings.quick_shortcuts[shortcutIndex];
        if (!confirm(`هل تريد حذف الاختصار [${sc.title}] نهائياً؟`)) return;

        this.uiSettings.quick_shortcuts.splice(shortcutIndex, 1);
        this.saveCustomizerSettings();
    },

    moveCustomizerShortcut(index, direction) {
        if (!this.uiSettings || !this.uiSettings.quick_shortcuts) return;
        const shortcuts = this.uiSettings.quick_shortcuts;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= shortcuts.length) return;

        const temp = shortcuts[index];
        shortcuts[index] = shortcuts[targetIndex];
        shortcuts[targetIndex] = temp;

        this.renderUICustomizer();
    },

    moveCustomizerWidget(index, direction) {
        if (!this.uiSettings || !this.uiSettings.dashboard_widgets) return;
        const widgets = this.uiSettings.dashboard_widgets;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= widgets.length) return;

        const temp = widgets[index];
        widgets[index] = widgets[targetIndex];
        widgets[targetIndex] = temp;

        this.renderUICustomizer();
    },

    toggleCustomizerWidget(widgetId, isChecked) {
        if (!this.uiSettings) this.uiSettings = {};
        if (!this.uiSettings.dashboard_widgets) {
            this.uiSettings.dashboard_widgets = this.getDefaultDashboardWidgets ? this.getDefaultDashboardWidgets() : [];
        }
        const w = this.uiSettings.dashboard_widgets.find(item => item.id === widgetId);
        if (w) {
            w.enabled = isChecked;
        }
        const labelSpan = document.querySelector(`#widget-active-${widgetId}`)?.nextElementSibling;
        if (labelSpan) {
            labelSpan.textContent = isChecked ? 'مفعلة ✅' : 'معطلة ❌';
        }
    },

    async saveCustomizerSettings() {
        const title = this.uiSettings?.app_title || 'SAM - نظام الإدارة الذكي';
        const shortTitle = this.uiSettings?.app_short_title || 'SAM';

        const headerButtons = [];
        const btnKeys = ['network_switcher', 'notif', 'whatsapp', 'portal', 'lang', 'theme'];
        btnKeys.forEach(k => {
            const el = document.getElementById(`btn-toggle-${k}`);
            if (el && el.checked) headerButtons.push(k);
        });
        headerButtons.push('logout');

        // Sync shortcuts live state from DOM
        if (this.uiSettings && this.uiSettings.quick_shortcuts) {
            document.querySelectorAll('#customizer-shortcuts-list input[data-sc-id]').forEach(input => {
                const scId = input.getAttribute('data-sc-id');
                const sc = this.uiSettings.quick_shortcuts.find(s => s.id === scId);
                if (sc) {
                    sc.enabled = input.checked;
                }
            });
        }

        // Sync widgets live state from DOM
        if (this.uiSettings && this.uiSettings.dashboard_widgets) {
            this.uiSettings.dashboard_widgets.forEach(w => {
                const chk = document.getElementById(`widget-active-${w.id}`);
                if (chk) {
                    w.enabled = chk.checked;
                }
            });
        }

        // Mobile bottom nav slots
        const mobileBottomNav = [];
        for (let i = 0; i < 20; i++) {
            const val = document.getElementById(`bottom-nav-slot-${i}`)?.value;
            if (val) {
                const parts = val.split('|');
                mobileBottomNav.push({
                    tab: parts[0],
                    icon: parts[1] || '📊',
                    title: parts[2] || parts[0]
                });
            }
        }

        const isGlobal = !!document.getElementById('cust-save-as-global')?.checked;
        const payload = {
            app_title: title,
            app_short_title: shortTitle,
            header_buttons: headerButtons,
            dashboard_widgets: this.uiSettings?.dashboard_widgets || [],
            quick_shortcuts: this.uiSettings?.quick_shortcuts || [],
            mobile_bottom_nav: mobileBottomNav.length > 0 ? mobileBottomNav : (this.uiSettings?.mobile_bottom_nav || []),
            default_theme: this.theme || 'light',
            save_as_system_default: isGlobal
        };

        this.toast('جاري حفظ التخصيص الشخصي على السيرفر...', 'info');
        const res = await this.api('save_ui_settings', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ التخصيص بنجاح ✓', 'success');
            this.uiSettings = Object.assign({}, this.uiSettings || {}, payload);
            // Update SPA Header & Mobile Nav live
            this.applyLiveUIUpdates();
            if (this.currentTab === 'ui_customizer') {
                this.renderUICustomizer();
            } else if (this.currentTab === 'dashboard') {
                this.renderDashboard();
            }
        } else {
            this.toast(res?.error || 'فشل حفظ التخصيص', 'danger');
        }
        return res;
    },

    async resetCustomizerDefaults() {
        if (!confirm('هل تريد استعادة ترتيب الواجهة والبطاقات والاختصارات إلى الوضع الافتراضي الخاص برتبتك؟')) return;
        const res = await this.api('reset_ui_settings', {}, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تمت استعادة الإعدادات الافتراضية بنجاح', 'success');
            this.uiSettings = null;
            await this.loadUISettings(true);
            this.applyLiveUIUpdates();
            if (this.currentTab === 'ui_customizer') {
                this.renderUICustomizer();
            } else if (this.currentTab === 'dashboard') {
                this.renderDashboard();
            }
        }
    },

    applyLiveUIUpdates() {
        if (!this.uiSettings) return;
        const brandFull = document.querySelector('.brand-title-full');
        const brandShort = document.querySelector('.brand-title-short');
        if (brandFull) brandFull.innerText = this.uiSettings.app_title || 'SAM - نظام الإدارة الذكي';
        if (brandShort) brandShort.innerText = this.uiSettings.app_short_title || 'SAM';

        const hb = this.uiSettings.header_buttons || ['network_switcher', 'notif', 'whatsapp', 'portal', 'lang', 'theme', 'logout'];
        const toggleEl = (id, key) => {
            const el = document.getElementById(id);
            if (el) el.style.display = hb.includes(key) ? '' : 'none';
        };
        toggleEl('sam-header-net-switcher', 'network_switcher');
        toggleEl('sam-header-notif', 'notif');
        toggleEl('sam-header-whatsapp', 'whatsapp');
        toggleEl('sam-header-portal', 'portal');
        toggleEl('sam-header-lang', 'lang');
        toggleEl('sam-header-theme', 'theme');

        // Re-render mobile nav items
        if (typeof App.applyConfiguredBrand === 'function') {
            App.applyConfiguredBrand();
        } else {
            const mobNav = document.getElementById('mt-mobile-nav');
            if (mobNav && this.uiSettings.mobile_bottom_nav) {
                mobNav.innerHTML = this.uiSettings.mobile_bottom_nav.map(b => `
                    <button class="mt-mobile-nav-btn ${this.currentTab === b.tab ? 'active' : ''}" id="mob-nav-${b.tab}" onclick="App.switchTab('${b.tab}')">
                        <span class="icon">${b.icon}</span>
                        <span>${b.title}</span>
                    </button>
                `).join('');
            }
        }
    },


    async restartRadius() {
        if (!confirm('هل تريد إعادة تشغيل خدمة FreeRADIUS الآن؟')) return;
        this.toast('جاري إعادة تشغيل FreeRADIUS...', 'info');
        const res = await this.api('restart_radius', {}, 'POST');
        if (res && res.success) {
            this.toast('تمت إعادة تشغيل FreeRADIUS بنجاح!', 'success');
            this.renderDashboard();
        } else {
            this.toast('فشل إعادة التشغيل: ' + (res?.output || ''), 'danger');
        }
    },

    // ==========================================
    // 2. ADMINS, DISTRIBUTORS & POS AGENTS (المستخدمين والصلاحيات)
    // ==========================================
    // ==========================================
    // 2. ADMINS & AGENTS (المستخدمين والوكلاء)
    // ==========================================
    onAdminsLiveSearch(val) {
        this.adminsSearch = val;
        clearTimeout(this.adminsDebounceTimer);
        this.adminsDebounceTimer = setTimeout(() => {
            this.adminsPage = 1;
            this.renderAdmins();
        }, 300);
    },

    setAdminFilterStatus(status) {
        this.adminsActiveFilter = status;
        this.adminsPage = 1;
        this.renderAdmins();
    }
});
