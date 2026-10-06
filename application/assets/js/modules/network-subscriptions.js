/**
 * SAM — مركز إدارة الشبكات والاشتراكات (System Owner only)
 */
'use strict';

(function () {
    if (!window.App) return;
    const App = window.App;
    const TAB = 'network_subscriptions';

    const isOwnerPortalEnv = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
    const systemDept = (App.departments || []).find(d => d.id === 'system');
    if (isOwnerPortalEnv && systemDept && !systemDept.items.some(i => i.id === TAB)) {
        systemDept.items.splice(5, 0, { id: TAB, name: 'مركز الشبكات والاشتراكات', icon: '💎' });
    }

    const oldHasAccess = App.hasAccess;
    App.hasAccess = function (tab) {
        if (tab === TAB) return !!this.isSystemOwner || this.userRole === 'system_owner';
        return oldHasAccess.call(this, tab);
    };

    const oldSwitchTab = App.switchTab;
    App.switchTab = function (tab, pushHistory = true) {
        oldSwitchTab.call(this, tab, pushHistory);
        if (tab === TAB && this.hasAccess(TAB)) this.renderNetworkSubscriptionCenter();
    };

    Object.assign(App, {
        networkSubscriptionData: null,

        subscriptionStatusLabel(status) {
            return ({ trial:'تجريبي',active:'نشط',grace:'فترة سماح',suspended:'معلّق',expired:'منتهي',cancelled:'ملغي' })[status] || status || 'غير مرتبط';
        },

        subscriptionStatusColor(status) {
            return ({ trial:'#2563eb',active:'#059669',grace:'#d97706',suspended:'#dc2626',expired:'#7c3aed',cancelled:'#475569' })[status] || '#64748b';
        },

        subscriptionMetricCard(icon, title, value, color='#2563eb') {
            return `<div style="background:var(--bg-window,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:14px;min-width:150px;box-shadow:0 1px 3px rgba(15,23,42,.06)">
                <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:#64748b;font-weight:800">${this.escape(title)}</span><span style="font-size:20px">${icon}</span></div>
                <div style="font-size:25px;font-weight:900;color:${color};margin-top:7px">${this.escape(String(value ?? 0))}</div>
            </div>`;
        },

        subscriptionMeter(meter, label) {
            meter = meter || { current:0,limit:0,percent:0,level:'ok',unlimited:true };
            const color = meter.level === 'limit' ? '#dc2626' : (meter.level === 'warning' ? '#d97706' : '#059669');
            const value = meter.unlimited ? `${meter.current} / غير محدود` : `${meter.current} / ${meter.limit}`;
            const width = meter.unlimited ? 0 : Math.max(0, Math.min(100, Number(meter.percent || 0)));
            return `<div style="min-width:170px"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;margin-bottom:4px"><span>${this.escape(label)}</span><span style="color:${color}">${this.escape(value)}</span></div><div style="height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${width}%;background:${color}"></div></div></div>`;
        },

        async renderNetworkSubscriptionCenter(force=false) {
            const view = document.getElementById('main-view');
            if (!view) return;
            if (!this.isSystemOwner && this.userRole !== 'system_owner') {
                view.innerHTML = '<div class="sam-empty-state">هذه الصفحة خاصة بمالك النظام.</div>';
                return;
            }
            view.innerHTML = '<div style="padding:40px;text-align:center;font-weight:800;color:#64748b">⏳ جارٍ تحميل الاشتراكات والحدود الفعلية...</div>';
            const res = await this.api('owner_system_subscription_center');
            if (!res?.success) {
                view.innerHTML = `<div style="padding:30px;color:#b91c1c">${this.escape(res?.error || 'تعذر تحميل مركز الاشتراكات')}</div>`;
                return;
            }
            this.networkSubscriptionData = res;
            const t = res.totals || {};
            const metrics = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">
                ${this.subscriptionMetricCard('🌐','إجمالي الشبكات',t.networks,'#2563eb')}
                ${this.subscriptionMetricCard('✅','النشطة',t.active,'#059669')}
                ${this.subscriptionMetricCard('🧪','التجريبية',t.trial,'#2563eb')}
                ${this.subscriptionMetricCard('⏳','فترة السماح',t.grace,'#d97706')}
                ${this.subscriptionMetricCard('⛔','الموقوفة',t.suspended,'#dc2626')}
                ${this.subscriptionMetricCard('📡','الراوترات النشطة',t.routers,'#7c3aed')}
                ${this.subscriptionMetricCard('🎫','كروت اليوم',t.cards_today,'#0891b2')}
                ${this.subscriptionMetricCard('🔔','تنتهي خلال 7 أيام',t.near_expiry,'#ea580c')}
            </div>`;
            const plans = (res.plans || []).map(p => `<tr>
                <td><b>${this.escape(p.name)}</b><div style="font-size:10px;color:#64748b">${this.escape(p.plan_code)}</div></td>
                <td>${Number(p.max_routers||0) || '∞'}</td><td>${Number(p.daily_card_limit||0) || '∞'}</td><td>${Number(p.max_admins||0) || '∞'}</td>
                <td>${Number(p.monthly_price||0).toLocaleString()} ${this.escape(p.currency_code||'')}</td>
                <td><span class="badge" style="background:${Number(p.is_active)?'#059669':'#64748b'}">${Number(p.is_active)?'فعالة':'موقفة'}</span></td>
                <td style="white-space:nowrap">${p.plan_code !== 'legacy_unlimited' ? `<button class="mt-btn" onclick="App.showNetworkPlanModal(${Number(p.id)})">✏️</button>` : '<span title="خطة انتقالية محمية">🔒</span>'} ${!Number(p.is_system)?`<button class="mt-btn mt-btn-danger" onclick="App.deleteNetworkPlan(${Number(p.id)})">🗑️</button>`:''}</td>
            </tr>`).join('');
            const networks = (res.networks || []).map(n => {
                const status=n.effective_status||n.status;
                const ownerDisplay = n.owner_name ? this.escape(n.owner_name) : '<span style="color:#94a3b8;">غير محدد</span>';
                const adminsCount = Number(n.delegated_admins_count || 0);
                return `<tr>
                    <td><b>${this.escape(n.name)}</b><div style="font-size:10px;color:#64748b">${this.escape(n.code||'')} · #${Number(n.network_id)}</div></td>
                    <td>
                        <div style="font-weight:700; color:#0f172a;">${ownerDisplay}</div>
                        ${adminsCount > 0 ? `<div style="font-size:10.5px;color:#0284c7;margin-top:2px;">👥 ${adminsCount} مفوض / مدير نظام</div>` : ''}
                    </td>
                    <td><b>${this.escape(n.plan_name||'غير مرتبطة')}</b></td>
                    <td><span class="badge" style="background:${this.subscriptionStatusColor(status)}">${this.subscriptionStatusLabel(status)}</span>${!Number(n.is_enabled)?' <span class="badge" style="background:#111827">معطلة</span>':''}</td>
                    <td>${n.expires_at?this.escape(String(n.expires_at)):'غير محدد'}</td>
                    <td>${this.subscriptionMeter(n.router_usage,'الراوترات')}</td><td>${this.subscriptionMeter(n.card_usage,'كروت اليوم')}</td>
                    <td style="white-space:nowrap"><button class="mt-btn mt-btn-primary" onclick="App.showNetworkSubscriptionModal(${Number(n.network_id)})">⚙️ إدارة</button> <button class="mt-btn" onclick="App.showNetworkSubscriptionDetail(${Number(n.network_id)})">📊 تفاصيل</button></td>
                </tr>`;
            }).join('');
            const content = `${metrics}
                <div class="mt-card" style="margin-bottom:14px;padding:0;overflow:hidden">
                    <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;gap:8px;">
                        <b>🌐 الشبكات والاشتراكات</b>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="mt-btn mt-btn-primary" onclick="App.openAddNetworkModal()">➕ إنشاء شبكة جديدة</button>
                            <button class="mt-btn" style="background:#0284c7;color:#fff;font-weight:700;" onclick="App.openNetworkMergeModal()">🔄 معالج دمج الشبكات</button>
                            <button class="mt-btn" style="background:#0d9488;color:#fff;font-weight:700;" onclick="App.openReassignRouterModal(0)">📡 نقل راوتر بين الشبكات</button>
                            <button class="mt-btn" style="background:#4338ca;color:#fff;font-weight:700;border-color:#3730a3;" onclick="App.renderRoamingPeers()">🌐 تحالف وتجوال الشبكات (Roaming)</button>
                            <button class="mt-btn" onclick="App.renderNetworkSubscriptionCenter(true)">🔄 تحديث</button>
                        </div>
                    </div>
                    <div style="overflow:auto"><table class="mt-table"><thead><tr><th>الشبكة</th><th>المالك / الشركاء</th><th>الباقة</th><th>الحالة</th><th>الانتهاء</th><th>الراوترات</th><th>كروت اليوم</th><th>إجراءات</th></tr></thead><tbody>${networks||'<tr><td colspan="8">لا توجد شبكات</td></tr>'}</tbody></table></div>
                </div>
                <div class="mt-card" style="padding:0;overflow:hidden">
                    <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;gap:8px;">
                        <b>💎 باقات الشبكات وسقوف المكونات</b>
                        <button class="mt-btn mt-btn-success" onclick="App.showNetworkPlanModal(0)">➕ إنشاء باقة</button>
                    </div>
                    <div style="overflow:auto"><table class="mt-table"><thead><tr><th>الباقة</th><th>الراوترات</th><th>الكروت/يوم</th><th>الإداريون</th><th>الموزعون</th><th>كروت/طبعة</th><th>مرات طباعة/يوم</th><th>نشطون</th><th>مديونية</th><th>السعر الشهري</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${plans}</tbody></table></div>
                </div>`;
            const PB = window.SamPageBuilder || window.SamUI?.PageBuilder;
            view.innerHTML = PB?.renderShell ? PB.renderShell({
                id:TAB,
                archetype:'dashboard',
                eyebrow:'OWNER / SAAS / LIMITS',
                title:'مركز إدارة الشبكات والاشتراكات',
                subtitle:'الباقات، إنشاء الشبكات، دمج الشبكات، نقل أجهزة الراوتر، تحالفات التجوال، حالات الاشتراك، والحدود الفعلية',
                icon:'💎',
                actions:[
                    {label:'➕ إنشاء شبكة جديدة',variant:'primary',onclick:'App.openAddNetworkModal()'},
                    {label:'🔄 دمج الشبكات (Merge)',variant:'secondary',onclick:'App.openNetworkMergeModal()'},
                    {label:'📡 نقل راوتر بين الشبكات',variant:'secondary',onclick:'App.openReassignRouterModal(0)'},
                    {label:'🌐 تحالف وتجوال الشبكات (Roaming)',variant:'primary',onclick:'App.renderRoamingPeers()'},
                    {label:'➕ إنشاء باقة جديدة',variant:'success',onclick:'App.showNetworkPlanModal(0)'},
                    {label:'🔄 تحديث',variant:'secondary',onclick:'App.renderNetworkSubscriptionCenter(true)'}
                ],
                content
            }) : `<div style="padding:14px">${content}</div>`;
        },

        showNetworkPlanModal(planId=0) {
            const p=(this.networkSubscriptionData?.plans||[]).find(x=>Number(x.id)===Number(planId))||{};
            const num=(k)=>(p[k]??0);
            const check=(k)=>(Number(p[k]??0)?'checked':'');
            this.openModal(`
            <div class="mt-modal-header" style="background:#1e293b;color:#fff;padding:14px 20px;">
                <b style="font-size:15px;">💎 ${planId?'تعديل باقة الشبكة والسقوف':'إنشاء باقة شبكات وسقوف جديدة'}</b>
                <span onclick="App.closeModal()" style="cursor:pointer;font-size:18px;">✕</span>
            </div>
            <form onsubmit="App.saveNetworkPlan(event,${Number(planId)})">
                <div class="mt-modal-body" style="display:flex;flex-direction:column;gap:14px;max-height:78vh;overflow-y:auto;padding:18px;">
                    <!-- Basic Info -->
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                        <div style="font-weight:800;font-size:12px;color:#1e293b;margin-bottom:8px;">📌 البيانات الأساسية للباقة</div>
                        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                            <label style="font-size:12px;font-weight:700;">رمز الباقة *<input class="mt-input" id="nsp-code" value="${this.escape(p.plan_code||'')}" required style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">اسم الباقة *<input class="mt-input" id="nsp-name" value="${this.escape(p.name||'')}" required style="width:100%;"></label>
                            <label style="font-size:12px;font-weight:700;">السعر الشهري<input type="number" min="0" step="0.01" class="mt-input" id="nsp-monthly" value="${num('monthly_price')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">السعر السنوي<input type="number" min="0" step="0.01" class="mt-input" id="nsp-annual" value="${num('annual_price')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">العملة<input class="mt-input" id="nsp-currency" maxlength="3" value="${this.escape(p.currency_code||'YER')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">حد التنبيه والإنذار %<input type="number" min="1" max="100" class="mt-input" id="nsp-warning" value="${num('warning_threshold_percent')||80}" style="width:100%;font-family:monospace;"></label>
                        </div>
                    </div>

                    <!-- Component Ceilings -->
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;">
                        <div style="font-weight:800;font-size:12px;color:#1e40af;margin-bottom:8px;">🛡️ سقوف وحدود المكونات والعمليات (0 = غير محدود)</div>
                        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                            <label style="font-size:12px;font-weight:700;">أقصى عدد راوترات<input type="number" min="0" class="mt-input" id="nsp-routers" value="${num('max_routers')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">الكروت اليومية القصوى<input type="number" min="0" class="mt-input" id="nsp-cards" value="${num('daily_card_limit')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">أقصى كروت للطبعة الواحدة<input type="number" min="0" class="mt-input" id="nsp-cards-per-print" value="${num('max_cards_per_print')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">مرات الطباعة اليومية لكل باقة<input type="number" min="0" class="mt-input" id="nsp-daily-prints" value="${num('max_daily_prints_per_profile')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">أقصى عدد حسابات مدراء<input type="number" min="0" class="mt-input" id="nsp-admins" value="${num('max_admins')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">أقصى عدد موزعين ونقاط بيع<input type="number" min="0" class="mt-input" id="nsp-distributors" value="${num('max_distributors')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">أقصى عدد باقات كروت<input type="number" min="0" class="mt-input" id="nsp-profiles" value="${num('max_profiles')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">المستخدمون النشطون المتصلون<input type="number" min="0" class="mt-input" id="nsp-active-users" value="${num('max_active_users')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">سقف مديونية الموزعين والشبكة<input type="number" min="0" step="0.01" class="mt-input" id="nsp-debt-limit" value="${num('max_debt_limit')}" style="width:100%;font-family:monospace;"></label>
                            <label style="font-size:12px;font-weight:700;">أقصى مجموعات تليجرام<input type="number" min="0" class="mt-input" id="nsp-telegram-groups" value="${num('max_telegram_groups')}" style="width:100%;font-family:monospace;"></label>
                        </div>
                    </div>

                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">الوصف والملاحظات</label>
                        <textarea class="mt-input" id="nsp-description" rows="2" style="width:100%;resize:vertical;">${this.escape(p.description||'')}</textarea>
                    </div>

                    <!-- Permissions & Toggles -->
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
                        <div style="font-weight:800;font-size:12px;color:#1e293b;margin-bottom:8px;">⚡ الصلاحيات والميزات الممكنة في الباقة</div>
                        <div style="display:flex;gap:16px;flex-wrap:wrap;">
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-active" ${planId?check('is_active'):'checked'}> 🟢 فعالة</label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-visible" ${planId?check('is_visible'):'checked'}> 👁️ ظاهرة</label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-api" ${check('allow_api')}> 🔌 تحكم API</label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-wa" ${check('allow_whatsapp')}> 💬 إشعارات WhatsApp</label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-reports" ${check('allow_advanced_reports')}> 📊 تقارير متقدمة</label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" id="nsp-restore" ${check('allow_restore')}> 🔄 استعادة ونسخ احتياطي</label>
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-success" type="submit" style="font-weight:700;padding:8px 20px;">💾 حفظ الباقة والسقوف</button>
                </div>
            </form>`, '780px');
        },

        async saveNetworkPlan(e,id) {
            e.preventDefault();
            const v=x=>document.getElementById(x)?.value;
            const c=x=>!!document.getElementById(x)?.checked;
            const body={
                id,
                plan_code:v('nsp-code'),
                name:v('nsp-name'),
                description:v('nsp-description'),
                monthly_price:v('nsp-monthly'),
                annual_price:v('nsp-annual'),
                currency_code:v('nsp-currency'),
                warning_threshold_percent:v('nsp-warning'),
                max_routers:v('nsp-routers'),
                daily_card_limit:v('nsp-cards'),
                max_cards_per_print:v('nsp-cards-per-print'),
                max_daily_prints_per_profile:v('nsp-daily-prints'),
                max_admins:v('nsp-admins'),
                max_distributors:v('nsp-distributors'),
                max_profiles:v('nsp-profiles'),
                max_active_users:v('nsp-active-users'),
                max_debt_limit:v('nsp-debt-limit'),
                max_telegram_groups:v('nsp-telegram-groups'),
                is_active:c('nsp-active'),
                is_visible:c('nsp-visible'),
                allow_api:c('nsp-api'),
                allow_whatsapp:c('nsp-wa'),
                allow_advanced_reports:c('nsp-reports'),
                allow_restore:c('nsp-restore'),
                daily_card_limit_mode:'generated_imported'
            };
            const r=await this.api('owner_system_save_network_plan',{},'POST',body);
            if(!r?.success)return this.toast(r?.error||r?.code||'فشل حفظ الباقة','danger');
            this.closeModal();this.toast('تم حفظ الباقة والسقوف بنجاح ✓','success');this.renderNetworkSubscriptionCenter(true);
        },

        async deleteNetworkPlan(id) {
            if(!confirm('حذف هذه الباقة نهائياً؟'))return;
            const r=await this.api('owner_system_delete_network_plan',{},'POST',{id});
            if(!r?.success)return this.toast(r?.error||r?.code||'تعذر حذف الباقة','danger');
            this.toast('تم حذف الباقة','success');this.renderNetworkSubscriptionCenter(true);
        },

        showNetworkSubscriptionModal(networkId) {
            const n=(this.networkSubscriptionData?.networks||[]).find(x=>Number(x.network_id)===Number(networkId));if(!n)return;
            const plans=(this.networkSubscriptionData?.plans||[]).filter(p=>Number(p.is_active)).map(p=>`<option value="${Number(p.id)}" ${Number(p.id)===Number(n.plan_id)?'selected':''}>${this.escape(p.name)}</option>`).join('');
            const statuses=['trial','active','grace','suspended','expired','cancelled'].map(s=>`<option value="${s}" ${s===(n.status||'active')?'selected':''}>${this.subscriptionStatusLabel(s)}</option>`).join('');
            const dt=v=>v?String(v).replace(' ','T').slice(0,16):'';
            this.openModal(`<div class="mt-modal-header"><b>⚙️ اشتراك ${this.escape(n.name)}</b><span onclick="App.closeModal()" style="cursor:pointer">✕</span></div><form onsubmit="App.saveNetworkSubscription(event,${Number(networkId)})"><div class="mt-modal-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
                <label>الباقة<select class="mt-input" id="nss-plan">${plans}</select></label><label>الحالة<select class="mt-input" id="nss-status">${statuses}</select></label>
                <label>بداية الاشتراك<input type="datetime-local" class="mt-input" id="nss-start" value="${dt(n.starts_at)}"></label><label>تاريخ الانتهاء<input type="datetime-local" class="mt-input" id="nss-expiry" value="${dt(n.expires_at)}"></label>
                <label>المنطقة الزمنية<input class="mt-input" id="nss-timezone" value="${this.escape(n.timezone||'Asia/Aden')}"></label><label>بداية يوم العمل<input type="time" class="mt-input" id="nss-daystart" value="${this.escape(String(n.business_day_start||'00:00').slice(0,5))}"></label>
                <label>السعر المثبت<input type="number" min="0" step="0.01" class="mt-input" id="nss-price" value="${Number(n.price_snapshot||0)}"></label><label>العملة<input class="mt-input" id="nss-currency" maxlength="3" value="${this.escape(n.currency_code||'YER')}"></label>
                <label style="grid-column:1/-1"><input type="checkbox" id="nss-enabled" ${Number(n.is_enabled)?'checked':''}> الشبكة مفعّلة للعمليات الجديدة</label><label style="grid-column:1/-1">سبب التعليق/الملاحظة<input class="mt-input" id="nss-reason"></label>
            </div><div class="mt-modal-footer"><button class="mt-btn mt-btn-success" type="submit">💾 تطبيق الاشتراك</button><button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button></div></form>`, '720px');
        },

        async saveNetworkSubscription(e,networkId) {
            e.preventDefault();const v=x=>document.getElementById(x)?.value;const enabled=!!document.getElementById('nss-enabled')?.checked;
            const body={network_id:networkId,plan_id:Number(v('nss-plan')),status:v('nss-status'),starts_at:v('nss-start'),expires_at:v('nss-expiry'),timezone:v('nss-timezone'),business_day_start:v('nss-daystart'),price_snapshot:v('nss-price'),currency_code:v('nss-currency'),is_enabled:enabled,suspension_reason:v('nss-reason')};
            const r=await this.api('owner_system_assign_network_plan',{},'POST',body);
            if(!r?.success)return this.toast(r?.error||r?.code||'تعذر تحديث الاشتراك','danger');
            this.closeModal();this.toast('تم تحديث اشتراك الشبكة والحدود','success');this.renderNetworkSubscriptionCenter(true);
        },

        async showNetworkSubscriptionDetail(networkId) {
            const r=await this.api('owner_system_network_subscription_detail',{network_id:networkId});
            if(!r?.success)return this.toast(r?.error||r?.code||'تعذر تحميل التفاصيل','danger');
            const s=r.subscription||{},m=r.meters||{},events=r.events||[];
            this.openModal(`<div class="mt-modal-header"><b>📊 تفاصيل استخدام الشبكة #${Number(networkId)}</b><span onclick="App.closeModal()" style="cursor:pointer">✕</span></div><div class="mt-modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${this.subscriptionMeter(m.routers,'الراوترات')}${this.subscriptionMeter(m.daily_cards,'كروت اليوم')}</div>
                <div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:12px"><b>الباقة:</b> ${this.escape(s.plan_name||'—')} · <b>الحالة:</b> ${this.subscriptionStatusLabel(s.effective_status)}</div>
                <b>آخر أحداث الاشتراك</b><div style="max-height:300px;overflow:auto;margin-top:8px"><table class="mt-table"><thead><tr><th>الوقت</th><th>الحدث</th><th>من</th><th>إلى</th><th>المنفذ</th></tr></thead><tbody>${events.map(e=>`<tr><td>${this.escape(e.created_at||'')}</td><td>${this.escape(e.event_type||'')}</td><td>${this.escape(e.old_status||'—')}</td><td>${this.escape(e.new_status||'—')}</td><td>${this.escape(e.actor_name||'النظام')}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد أحداث</td></tr>'}</tbody></table></div>
            </div><div class="mt-modal-footer"><button class="mt-btn" onclick="App.closeModal()">إغلاق</button></div>`, '820px');
        }
    });
})();
