/**
 * SAM User Manager — Card Warehouses, Sheet Transfers & Free Quotas
 */
'use strict';

Object.assign(window.App, {
    maskVoucherCode(code) {
        if (!code) return '';
        const str = String(code);
        const len = str.length;
        if (len <= 4) return str;
        const visibleLen = Math.ceil(len / 2);
        return str.substring(0, visibleLen) + '*'.repeat(len - visibleLen);
    },

    toggleFreeVoucherSort(col) {
        if (this.freeVouchersSortCol === col) {
            this.freeVouchersSortDir = this.freeVouchersSortDir === 'ASC' ? 'DESC' : 'ASC';
        } else {
            this.freeVouchersSortCol = col;
            this.freeVouchersSortDir = 'DESC';
        }
        this.renderFreeVouchers('vouchers');
    },

    getFreeSortIcon(col) {
        if ((this.freeVouchersSortCol || 'id') !== col) return '<span style="opacity:0.3; font-size:10px;">↕</span>';
        return (this.freeVouchersSortDir || 'DESC') === 'ASC' ? '<span style="font-size:10px;">▲</span>' : '<span style="font-size:10px;">▼</span>';
    },

    async cleanupUnassignedFreeVouchers() {
        if (!confirm('هل أنت متأكد من رغبتك في حذف وتصفية كافة الكروت المجانية السابقة الممنوحة وغير المخصصة نهائياً من النظام؟')) {
            return;
        }
        this.toast('جاري حذف وتصفية الكروت المجانية...', 'info');
        const res = await this.api('delete_all_free_vouchers', { all: true }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تنظيف الكروت المجانية بنجاح', 'success');
            this.renderFreeVouchers('vouchers');
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء الحذف', 'danger');
        }
    },

    async hideFreeVoucher(username) {
        if (!confirm(`هل أنت متأكد من رغبتك في إخفاء الكرت المنتهي (${username}) من هذا الجدول؟\n\n(ملاحظة: لن يتم حذف بيانات الكرت أو استهلاكه من قاعدة البيانات وسيبقى مسجلاً في التقارير و ROI)`)) {
            return;
        }
        this.toast('جاري إخفاء الكرت...', 'info');
        try {
            const res = await this.api('hide_free_voucher', { username }, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم إخفاء الكرت من الجدول بنجاح 👁️‍🗨️', 'success');
                this.renderFreeVouchers('vouchers');
            } else {
                this.toast(res?.error || 'فشل إخفاء الكرت', 'danger');
            }
        } catch (e) {
            this.toast('تعذر الاتصال بالسيرفر لإخفاء الكرت', 'danger');
        }
    },

    async hideExpiredFreeVouchers() {
        if (!confirm('هل تريد إخفاء كافة الكروت المجانية المنتهية من هذا الجدول؟\n\n(ملاحظة: الكروت ستختفي من هذه الواجهة فقط وتبقى محفوظة في سجلات النظام وإحصائيات ROI بالكامل)')) {
            return;
        }
        this.toast('جاري إخفاء الكروت المنتهية...', 'info');
        try {
            const res = await this.api('hide_expired_free_vouchers', {}, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم إخفاء الكروت المنتهية بنجاح 🧹', 'success');
                this.renderFreeVouchers('vouchers');
            } else {
                this.toast(res?.error || 'فشل إخفاء الكروت المنتهية', 'danger');
            }
        } catch (e) {
            this.toast('تعذر الاتصال بالسيرفر لإخفاء الكروت المنتهية', 'danger');
        }
    },
    async renderFreeVouchers(subTab = null) {
        if (subTab) this.freeVouchersTab = subTab;
        if (!this.freeVouchersTab) this.freeVouchersTab = 'vouchers';
        const view = document.getElementById('main-view');
        if (!view) return;

        const PB = window.SamUI?.PageBuilder;

        // Render immediate responsive feedback upon click
        const isCurrentPage = document.querySelector('[data-sam-page="free-vouchers"]');
        if (!isCurrentPage) {
            const loadingHtml = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:90px 20px; color:var(--text-secondary, #64748b);">
                    <div class="sam-spinner" style="width:38px; height:38px; border:3.5px solid var(--sam-primary, #0284c7); border-top-color:transparent; border-radius:50%; animation:sam-spin 0.75s linear infinite; margin-bottom:16px;"></div>
                    <div style="font-weight:700; font-size:15px; color:var(--text-primary, #0f172a);">جاري تحميل الكروت المجانية والمكافآت...</div>
                </div>
            `;
            view.innerHTML = PB ? PB.renderShell({
                id: 'free-vouchers',
                archetype: 'pos',
                title: '🎁 الكروت المجانية و VIP',
                subtitle: 'إدارة وتوزيع الكروت المجانية للشخصيات والشركاء، الجدولة الآلية، وتحليل العائد (ROI)',
                eyebrow: 'الكروت والمخازن',
                icon: '🎁',
                content: loadingHtml
            }) : `<div class="mt-page">${loadingHtml}</div>`;
        }

        if (this._freeVouchersNetworkId !== this.activeNetworkId) {
            this._freeVouchersProfiles = null;
            this._freeVouchersAdmins = null;
            this._freeVouchersNetworkId = this.activeNetworkId;
        }

        // Lazy fetch only required endpoint per sub-tab to avoid heavy unnecessary database execution
        const promises = [
            this._freeVouchersAdmins ? Promise.resolve({ admins: this._freeVouchersAdmins }) : this.api('get_admins_with_roles'),
            this._freeVouchersProfiles ? Promise.resolve({ data: this._freeVouchersProfiles }) : this.api('get_profiles')
        ];

        if (this.freeVouchersTab === 'vouchers') {
            promises.push(this.api('get_free_vouchers_list'));
        } else if (this.freeVouchersTab === 'schedules') {
            promises.push(this.api('get_free_vouchers_quotas'));
        } else if (this.freeVouchersTab === 'analytics') {
            promises.push(this.api('get_free_vouchers_analytics'));
        } else if (this.freeVouchersTab === 'pos_rules') {
            promises.push(this.api('get_pos_free_voucher_rules'));
            promises.push(this.api('get_pos_free_voucher_eligibility'));
        }

        const results = await Promise.all(promises);
        const admins = results[0]?.admins || this._freeVouchersAdmins || [];
        const profiles = results[1]?.data || results[1] || this._freeVouchersProfiles || [];
        this._freeVouchersAdmins = admins;
        this._freeVouchersProfiles = profiles;

        if (this.freeVouchersTab === 'vouchers') {
            this._allFreeVouchers = results[2]?.free_vouchers || [];
        } else if (this.freeVouchersTab === 'schedules') {
            this._allFreeQuotas = results[2]?.quotas || [];
        } else if (this.freeVouchersTab === 'analytics') {
            this._allFreeAnalytics = results[2] || {};
        } else if (this.freeVouchersTab === 'pos_rules') {
            this._allPosRules = results[2]?.rules || [];
            this._allPosEligibility = results[3] || {};
        }

        const rawVouchers = this._allFreeVouchers || [];
        const quotas = this._allFreeQuotas || [];
        const analytics = this._allFreeAnalytics || {};
        const posRules = this._allPosRules || [];
        const posEligibility = this._allPosEligibility || {};
        const profileAnalytics = analytics.profiles || [];
        const recipientAnalytics = analytics.recipients || [];

        let totalMb = 0;
        let activeCount = 0;
        rawVouchers.forEach(v => {
            totalMb += parseFloat(v.total_consumed_mb || 0);
            if (v.status === 'active') activeCount++;
        });

        let actions = [];
        let stats = [];
        let shellTitle = '🎁 الكروت المجانية والمكافآت';
        let shellSubtitle = 'إدارة وتوزيع الكروت المجانية للشخصيات والشركاء ونقاط البيع، الجدولة الآلية، وتحليل العائد';
        let shellIcon = '🎁';

        if (this.freeVouchersTab === 'pos_rules') {
            shellTitle = '🏪 مكافآت وقواعد نقاط البيع حسب الورق';
            shellSubtitle = 'ضبط قواعد المكافآت بحسب الأوراق المباعة (أقصى حد 4 كروت للورقة) أو المبيعات، واحتساب الاستحقاق الفوري والصرف الآلي';
            shellIcon = '🏪';
            actions = [
                this.can('free_vouchers_schedule_add') ? {
                    label: '➕ إضافة قاعدة منح لنقاط البيع',
                    variant: 'primary',
                    onclick: `App.showPosFreeRuleModal()`
                } : null,
                ((posEligibility.total_pending_cards || 0) > 0 && this.can('free_vouchers_schedule_add')) ? {
                    label: `🚀 صرف المستحقات للجميع (${posEligibility.total_pending_cards} كرت)`,
                    variant: 'success',
                    onclick: `App.grantAllEligiblePosFreeVouchers()`
                } : null,
                { label: '⟳ تحديث', variant: 'secondary', onclick: "App.renderFreeVouchers('pos_rules')" }
            ].filter(Boolean);

            stats = [
                { label: 'قواعد المنح النشطة', value: posRules.length, icon: '⚙️', tone: 'blue', meta: 'قاعدة مفعلة' },
                { label: 'كروت مستحقة جاهزة للصرف', value: posEligibility.total_pending_cards || 0, icon: '🎁', tone: 'green', meta: 'كرت مستحق' },
                { label: 'نقاط بيع مؤهلة للصرف', value: posEligibility.total_eligible_pos || 0, icon: '🏪', tone: 'purple', meta: 'نقطة بيع' },
                { label: 'إجمالي الكروت الممنوحة سابقاً', value: posRules.reduce((acc, r) => acc + (parseInt(r.total_granted_cards, 10) || 0), 0), icon: '🎫', tone: 'amber', meta: 'كرت مصروف' }
            ];
        } else if (this.freeVouchersTab === 'schedules') {
            shellTitle = '⏰ الجدولة الآلية الدورية للكروت المجانية';
            shellSubtitle = 'جدولة الحصص الأسبوعية والشهرية والسنوية الآلية للمستفيدين مع الإرسال التلقائي عبر الواتساب';
            shellIcon = '⏰';
            actions = [
                this.can('free_vouchers_schedule_add') ? {
                    label: '➕ ضبط جدولة دورية جديدة',
                    variant: 'primary',
                    onclick: `App.showFreeScheduleModal()`
                } : null,
                this.can('free_vouchers_schedule_run') ? {
                    label: '🚀 تنفيذ الجدولة المستحقة الآن',
                    variant: 'success',
                    onclick: `App.dispatchScheduledFreeVouchers()`
                } : null,
                { label: '⟳ تحديث', variant: 'secondary', onclick: "App.renderFreeVouchers('schedules')" }
            ].filter(Boolean);

            stats = [
                { label: 'إجمالي الجداول المعرفة', value: quotas.length, icon: '⏰', tone: 'blue', meta: 'جدول دوري' },
                { label: 'الجداول النشطة الفعالة', value: quotas.filter(q => q.is_active == 1).length, icon: '⚡', tone: 'green', meta: 'جدول شغال' },
                { label: 'إجمالي الحصص المجدولة', value: quotas.reduce((acc, q) => acc + (parseInt(q.cards_count || q.monthly_cards_quota, 10) || 1), 0), icon: '🎁', tone: 'purple', meta: 'كرت / دورة' },
                { label: 'طريقة الإرسال الآلي', value: '💬 واتساب + SMS', icon: '📲', tone: 'amber', meta: 'تلقائي' }
            ];
        } else if (this.freeVouchersTab === 'analytics') {
            shellTitle = '📈 إحصائيات الباقات والمبيعات (ROI)';
            shellSubtitle = 'تحليل تكلفة استهلاك الكروت المجانية ودراسة جدوى مبيعات نقاط البيع والعائد الاستثماري';
            shellIcon = '📈';
            actions = [
                { label: '⟳ تحديث', variant: 'secondary', onclick: "App.renderFreeVouchers('analytics')" }
            ];

            const totalAnalyticsCost = profileAnalytics.reduce((acc, p) => acc + parseFloat(p.estimated_cost || 0), 0);
            const totalNodeSales = recipientAnalytics.reduce((acc, r) => acc + parseFloat(r.node_commercial_sales || 0), 0);

            stats = [
                { label: 'باقات مجانية مستهلكة', value: profileAnalytics.length, icon: '📦', tone: 'blue', meta: 'باقة' },
                { label: 'إجمالي البيانات المستهلكة', value: (profileAnalytics.reduce((acc, p) => acc + parseFloat(p.total_consumed_gb || 0), 0)).toFixed(1) + ' GB', icon: '📶', tone: 'green', meta: 'بيانات مستهلكة' },
                { label: 'التكلفة التقديرية للباقات', value: App.formatMoney(totalAnalyticsCost), icon: '💵', tone: 'amber', meta: 'تكلفة تقديرية' },
                { label: 'مبيعات نقاط البيع المرتبطة', value: App.formatMoney(totalNodeSales), icon: '💰', tone: 'purple', meta: 'مبيعات حقيقية' }
            ];
        } else {
            // vouchers
            shellTitle = '🎫 الكروت المجانية الممنوحة';
            shellSubtitle = 'إدارة وتوليد الكروت المجانية الفورية للشخصيات ونقاط البيع، ومتابعة حالات تسليم الواتساب';
            shellIcon = '🎫';
            actions = [
                this.can('free_vouchers_grant') ? {
                    label: '🎁 منح كروت مجانية فورية',
                    variant: 'primary',
                    onclick: `App.showGrantFreeVouchersModal(App._freeVouchersAdmins, App._freeVouchersProfiles)`
                } : null,
                this.can('free_vouchers_delete') || this.isAdmin ? {
                    label: '🧹 إخفاء الكروت المنتهية',
                    variant: 'secondary',
                    onclick: 'App.hideExpiredFreeVouchers()'
                } : null,
                { label: '⟳ تحديث', variant: 'secondary', onclick: "App.renderFreeVouchers('vouchers')" }
            ].filter(Boolean);

            stats = [
                { label: 'إجمالي الكروت المجانية', value: rawVouchers.length, icon: '🎁', tone: 'purple', meta: 'كرت ممنوح' },
                { label: 'الكروت النشطة حالياً', value: activeCount, icon: '⚡', tone: 'green', meta: 'كرت فعال' },
                { label: 'إجمالي الاستهلاك المجاني', value: App.formatBytes(totalMb * 1024 * 1024), icon: '📶', tone: 'blue' },
                { label: 'القيمة التقديرية للاستهلاك', value: App.formatMoney(totalMb * 0.5), icon: '💵', tone: 'amber' }
            ];
        }

        // Tabs Header
        const tabsNav = `
        <div class="sam-tabs-nav" style="display:flex; gap:8px; border-bottom:1px solid var(--sam-border, #e2e8f0); margin-bottom:16px; padding-bottom:8px; flex-wrap:wrap;">
            <button type="button" class="sam-btn ${this.freeVouchersTab === 'vouchers' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.renderFreeVouchers('vouchers')">
                🎫 الكروت الممنوحة (${rawVouchers.length})
            </button>
            <button type="button" class="sam-btn ${this.freeVouchersTab === 'pos_rules' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.renderFreeVouchers('pos_rules')">
                🏪 مكافآت وقواعد نقاط البيع حسب الورق (${posRules.length})
            </button>
            <button type="button" class="sam-btn ${this.freeVouchersTab === 'schedules' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.renderFreeVouchers('schedules')">
                ⏰ الجدولة الآلية الدورية (${quotas.length})
            </button>
            <button type="button" class="sam-btn ${this.freeVouchersTab === 'analytics' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.renderFreeVouchers('analytics')">
                📈 إحصائيات الباقات والمبيعات (ROI)
            </button>
        </div>
        `;

        let tabContent = '';

        // Tab 1: Vouchers List with Filters, Sorting and Client Pagination
        if (this.freeVouchersTab === 'vouchers') {
            const filterProfile = this.freeFilterProfile || '';
            const filterGranter = this.freeFilterGranter || '';
            const filterStatus = this.freeFilterStatus || '';
            const filterWa = this.freeFilterWa || '';
            const filterGrantType = this.freeFilterGrantType || '';
            const searchQuery = (this.freeFilterSearch || '').trim().toLowerCase();

            let filteredVouchers = rawVouchers.filter(v => {
                if (filterProfile && v.profile_name !== filterProfile) return false;
                if (filterGranter && String(v.granted_by_admin_id) !== String(filterGranter)) return false;
                if (filterStatus && v.status !== filterStatus) return false;
                if (filterWa && (v.whatsapp_status || 'none') !== filterWa) return false;
                if (filterGrantType) {
                    const gt = v.grant_type || (
                        (v.notes && (v.notes.includes('مجدول') || v.notes.includes('جدولة'))) ? 'schedule' :
                        ((v.notes && (v.notes.includes('مكافأة') || v.notes.includes('ورق') || v.notes.includes('نقطة'))) ? 'pos_reward' : 'instant')
                    );
                    if (gt !== filterGrantType) return false;
                }
                if (searchQuery) {
                    const searchHaystack = `${v.username} ${v.recipient_fullname || ''} ${v.recipient_username || ''} ${v.whatsapp_phone || ''} ${v.recipient_default_phone || ''} ${v.profile_name || ''} ${v.notes || ''} ${v.granter_fullname || ''}`.toLowerCase();
                    if (!searchHaystack.includes(searchQuery)) return false;
                }
                return true;
            });

            // Sorting
            const sortCol = this.freeVouchersSortCol || 'date';
            const sortDir = this.freeVouchersSortDir || 'DESC';
            const dirMultiplier = sortDir === 'ASC' ? 1 : -1;

            filteredVouchers.sort((a, b) => {
                let valA, valB;
                switch (sortCol) {
                    case 'username':
                        valA = a.username || '';
                        valB = b.username || '';
                        return valA.localeCompare(valB) * dirMultiplier;
                    case 'recipient':
                        valA = a.recipient_fullname || '';
                        valB = b.recipient_fullname || '';
                        return valA.localeCompare(valB, 'ar') * dirMultiplier;
                    case 'granter':
                        valA = a.granter_fullname || '';
                        valB = b.granter_fullname || '';
                        return valA.localeCompare(valB, 'ar') * dirMultiplier;
                    case 'grant_type':
                        valA = a.grant_type || '';
                        valB = b.grant_type || '';
                        return valA.localeCompare(valB) * dirMultiplier;
                    case 'profile':
                        valA = a.profile_name || '';
                        valB = b.profile_name || '';
                        return valA.localeCompare(valB) * dirMultiplier;
                    case 'status':
                        valA = a.status || '';
                        valB = b.status || '';
                        return valA.localeCompare(valB) * dirMultiplier;
                    case 'consumed':
                        valA = parseFloat(a.total_consumed_mb || 0);
                        valB = parseFloat(b.total_consumed_mb || 0);
                        return (valA - valB) * dirMultiplier;
                    case 'wa':
                        valA = a.whatsapp_status || '';
                        valB = b.whatsapp_status || '';
                        return valA.localeCompare(valB) * dirMultiplier;
                    case 'date':
                    default:
                        valA = new Date(a.free_granted_at || a.created_at || 0).getTime();
                        valB = new Date(b.free_granted_at || b.created_at || 0).getTime();
                        return (valA - valB) * dirMultiplier;
                }
            });

            // Distinct lists for filter dropdowns
            const uniqueProfiles = Array.from(new Set(rawVouchers.map(v => v.profile_name).filter(Boolean)));
            const uniqueGranters = [];
            const granterMap = new Map();
            rawVouchers.forEach(v => {
                if (v.granted_by_admin_id && !granterMap.has(v.granted_by_admin_id)) {
                    granterMap.set(v.granted_by_admin_id, v.granter_fullname || `مسؤول #${v.granted_by_admin_id}`);
                    uniqueGranters.push({ id: v.granted_by_admin_id, name: granterMap.get(v.granted_by_admin_id) });
                }
            });

            // Client Pagination Logic
            this.freeVouchersPage = this.freeVouchersPage || 1;
            this.freeVouchersPageSize = this.freeVouchersPageSize || 50;

            const totalFiltered = filteredVouchers.length;
            const totalPages = Math.max(1, Math.ceil(totalFiltered / this.freeVouchersPageSize));
            if (this.freeVouchersPage > totalPages) this.freeVouchersPage = totalPages;
            const startIndex = (this.freeVouchersPage - 1) * this.freeVouchersPageSize;
            const pagedVouchers = filteredVouchers.slice(startIndex, startIndex + this.freeVouchersPageSize);

            const filterBarHtml = `
            <div class="sam-card mt-card" style="padding:12px 16px; margin-bottom:14px; background:var(--bg-card, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:8px;">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; align-items:center;">
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">🔍 بحث سريع:</label>
                        <input type="text" class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" placeholder="بحث بالمستفيد، الكرت، الملاحظات..." value="${this.escape(this.freeFilterSearch || '')}" oninput="App.onFreeFilterChange('search', this.value)" />
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">🏷️ نوع العملية:</label>
                        <select class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" onchange="App.onFreeFilterChange('grant_type', this.value)">
                            <option value="">كل العمليات</option>
                            <option value="instant" ${filterGrantType === 'instant' ? 'selected' : ''}>🎁 منح فوري</option>
                            <option value="schedule" ${filterGrantType === 'schedule' ? 'selected' : ''}>⏰ جدولة آلية</option>
                            <option value="pos_reward" ${filterGrantType === 'pos_reward' ? 'selected' : ''}>🏪 مكافأة مبيعات</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">📦 الباقة:</label>
                        <select class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" onchange="App.onFreeFilterChange('profile', this.value)">
                            <option value="">كل الباقات</option>
                            ${uniqueProfiles.map(p => `<option value="${p}" ${filterProfile === p ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">👤 المانح:</label>
                        <select class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" onchange="App.onFreeFilterChange('granter', this.value)">
                            <option value="">كل المانحين</option>
                            ${uniqueGranters.map(g => `<option value="${g.id}" ${String(filterGranter) === String(g.id) ? 'selected' : ''}>${g.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">⚡ حالة الكرت:</label>
                        <select class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" onchange="App.onFreeFilterChange('status', this.value)">
                            <option value="">كل الحالات</option>
                            <option value="active" ${filterStatus === 'active' ? 'selected' : ''}>جاهز / نشط</option>
                            <option value="used" ${filterStatus === 'used' ? 'selected' : ''}>مستخدم</option>
                            <option value="expired" ${filterStatus === 'expired' ? 'selected' : ''}>منتهي</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:700; color:var(--text-muted, #64748b); display:block; margin-bottom:3px;">📲 حالة الواتساب:</label>
                        <select class="mt-input" style="width:100%; font-size:12px; padding:6px 10px;" onchange="App.onFreeFilterChange('wa', this.value)">
                            <option value="">الكل</option>
                            <option value="sent" ${filterWa === 'sent' ? 'selected' : ''}>🟢 تم التسليم</option>
                            <option value="failed" ${filterWa === 'failed' ? 'selected' : ''}>🔴 فشل الإرسال</option>
                            <option value="none" ${filterWa === 'none' ? 'selected' : ''}>⚪ لم يرسل</option>
                        </select>
                    </div>
                </div>
                ${(filterGrantType || filterProfile || filterGranter || filterStatus || filterWa || searchQuery) ? `
                    <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; font-size:11.5px;">
                        <span style="color:#0369a1; font-weight:700;">📊 نتائج التصفية: ${filteredVouchers.length} من إجمالي ${rawVouchers.length} كرت</span>
                        <button class="sam-btn sam-btn--sm sam-btn--secondary" style="padding:2px 8px; font-size:11px;" onclick="App.clearFreeVouchersFilters()">✕ إلغاء التصفية</button>
                    </div>
                ` : ''}
            </div>
            `;

            const columns = [
                { key: 'idx', label: '#', width: '45px', render: (_, i) => startIndex + i + 1 },
                {
                    key: 'username',
                    label: 'رقم الكرت',
                    sortable: true,
                    sortKey: 'username',
                    render: v => `
                        <a href="javascript:void(0)" onclick="App.showUserUsageModal('${this.escape(v.username)}')" title="انقر لعرض تفاصيل واستهلاك الكرت" style="color:var(--sam-primary, #0284c7); font-size:13.5px; font-weight:bold; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                            <code>${this.maskVoucherCode(v.username)}</code>
                            <span style="font-size:11px; opacity:0.7;">🔍</span>
                        </a>
                    `
                },
                {
                    key: 'recipient',
                    label: 'المستفيد / المستلم',
                    sortable: true,
                    sortKey: 'recipient',
                    render: v => `
                        <div>
                            <b>${this.escape(v.recipient_fullname || 'غير محدد')}</b>
                            ${v.notes ? `<div style="font-size:10.5px; color:#64748b;" title="${this.escape(v.notes)}">📝 ${this.escape(v.notes)}</div>` : ''}
                        </div>
                    `
                },
                {
                    key: 'grant_type',
                    label: 'نوع العملية',
                    sortable: true,
                    sortKey: 'grant_type',
                    render: v => {
                        const gt = v.grant_type || (
                            (v.notes && (v.notes.includes('مجدول') || v.notes.includes('جدولة'))) ? 'schedule' :
                            ((v.notes && (v.notes.includes('مكافأة') || v.notes.includes('ورق') || v.notes.includes('نقطة'))) ? 'pos_reward' : 'instant')
                        );
                        if (gt === 'schedule') {
                            return `<span class="badge" style="background:#e67e22; color:#fff; font-size:11px; padding:3px 8px; border-radius:4px; font-weight:700;">⏰ جدولة آلية</span>`;
                        } else if (gt === 'pos_reward') {
                            return `<span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:3px 8px; border-radius:4px; font-weight:700;">🏪 مكافأة مبيعات</span>`;
                        }
                        return `<span class="badge" style="background:#8e44ad; color:#fff; font-size:11px; padding:3px 8px; border-radius:4px; font-weight:700;">🎁 منح فوري</span>`;
                    }
                },
                {
                    key: 'granter',
                    label: 'المانح',
                    sortable: true,
                    sortKey: 'granter',
                    render: v => `<span class="badge" style="background:#475569; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">👤 ${this.escape(v.granter_fullname || 'الإدارة المركزية')}</span>`
                },
                {
                    key: 'role',
                    label: 'الرتبة',
                    render: v => `<span class="badge" style="background:#8e44ad; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(v.recipient_role_ar || v.recipient_role || 'مستخدم')}</span>`
                },
                {
                    key: 'profile',
                    label: 'الباقة',
                    sortable: true,
                    sortKey: 'profile',
                    render: v => `<span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(v.profile_name)}</span>`
                },
                {
                    key: 'status',
                    label: 'حالة الكرت',
                    sortable: true,
                    sortKey: 'status',
                    render: v => {
                        const isExp = v.is_expired == 1 || v.status === 'expired' || (v.expires_at && new Date(v.expires_at) <= new Date());
                        if (isExp) {
                            return `<span class="status-pill status-danger" style="font-weight:700;">منتهي</span>`;
                        }
                        return `<span class="status-pill ${v.status === 'active' ? 'status-online' : 'status-danger'}">${v.status === 'active' ? 'جاهز/نشط' : this.escape(v.status)}</span>`;
                    }
                },
                {
                    key: 'consumed',
                    label: 'الاستهلاك',
                    sortable: true,
                    sortKey: 'consumed',
                    render: v => `<b>${v.total_consumed_mb} MB</b>`
                },
                {
                    key: 'wa',
                    label: 'حالة تسليم واتساب',
                    sortable: true,
                    sortKey: 'wa',
                    render: v => {
                        const waStat = v.whatsapp_status || 'none';
                        const phoneNum = v.whatsapp_phone || v.recipient_default_phone || '';
                        if (waStat === 'sent') {
                            return `<span class="status-pill status-active" style="font-size:11px; font-weight:700;">🟢 تم التسليم (${App.formatPhoneDisplay(phoneNum)})</span>`;
                        } else if (waStat === 'failed') {
                            return `
                            <div style="display:flex; flex-direction:column; gap:3px;">
                                <span class="status-pill status-disabled" style="font-size:10.5px; font-weight:bold;" title="${this.escape(v.whatsapp_error || 'فشل إرسال الرسالة')}">🔴 لم تصل الرسالة</span>
                                <button class="sam-btn sam-btn--sm sam-btn--warning" style="padding:2px 8px; font-size:10.5px; font-weight:bold;" onclick="App.retryFreeVoucherWhatsApp('${this.escape(v.username)}', '${this.escape(phoneNum)}')">🔁 إعادة الإرسال</button>
                            </div>`;
                        }
                        return `
                        <div style="display:flex; flex-direction:column; gap:3px;">
                            <span class="status-pill" style="font-size:10.5px; background:#f1f5f9; color:#64748b;">⚪ لم يُرسل بعد</span>
                            <button class="sam-btn sam-btn--sm" style="padding:2px 8px; font-size:10.5px; background:#25D366; color:#fff; font-weight:bold;" onclick="App.retryFreeVoucherWhatsApp('${this.escape(v.username)}', '${this.escape(phoneNum)}')">📲 إرسال لواتساب</button>
                        </div>`;
                    }
                },
                {
                    key: 'date',
                    label: 'تاريخ المنح',
                    sortable: true,
                    sortKey: 'date',
                    render: v => `<small style="font-size:11px; color:#64748b;">${this.escape(v.free_granted_at || v.created_at)}</small>`
                },
                {
                    key: 'actions',
                    label: 'إجراءات الإرسال',
                    align: 'center',
                    width: '150px',
                    render: v => {
                        const phoneNum = v.whatsapp_phone || v.recipient_default_phone || '';
                        const isExp = v.is_expired == 1 || v.status === 'expired' || (v.expires_at && new Date(v.expires_at) <= new Date());
                        return `
                        <div style="display:flex; gap:4px; justify-content:center; align-items:center; flex-wrap:wrap;">
                            <button class="sam-btn sam-btn--sm" style="background:#25D366; color:#fff; padding:2px 8px; font-size:11px;" onclick="App.sendVoucherViaWhatsApp('${this.escape(v.username)}', '${this.escape(v.recipient_fullname)}', '${this.escape(v.profile_name)}', '${this.escape(v.validity || '30d')}', '${this.escape(phoneNum)}')" title="فتح تطبيق واتساب ويب المباشر">
                                🌐 ويب
                            </button>
                            <button class="sam-btn sam-btn--sm sam-btn--secondary" style="padding:2px 6px; font-size:11px;" onclick="App.copyVoucherMessage('${this.escape(v.username)}', '${this.escape(v.recipient_fullname)}', '${this.escape(v.profile_name)}')" title="نسخ نص الكرت للحافظة">
                                📋 نسخ
                            </button>
                            ${isExp ? `
                            <button class="sam-btn sam-btn--sm sam-btn--danger" style="padding:2px 6px; font-size:11px; font-weight:bold;" onclick="App.hideFreeVoucher('${this.escape(v.username)}')" title="إخفاء الكرت المنتهي من الجدول دون حذفه نهائياً">
                                👁️‍🗨️ إخفاء
                            </button>
                            ` : ''}
                        </div>`;
                    }
                }
            ];

            const tableHtml = PB ? PB.renderTable({
                columns,
                rows: pagedVouchers,
                currentSort: this.freeVouchersSortCol || 'date',
                sortDir: (this.freeVouchersSortDir || 'DESC').toLowerCase(),
                onSort: 'App.toggleFreeVoucherSort',
                emptyText: 'لا توجد كروت مجانية ممنوحة تطابق معايير البحث'
            }) : '';

            const paginationHtml = totalPages > 1 ? `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div style="font-size:12px; color:#475569; font-weight:700;">
                    عرض <b>${totalFiltered ? startIndex + 1 : 0} - ${Math.min(startIndex + this.freeVouchersPageSize, totalFiltered)}</b> من إجمالي <b>${totalFiltered}</b> كرت
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" ${this.freeVouchersPage <= 1 ? 'disabled' : ''} onclick="App.changeFreeVouchersPage(${this.freeVouchersPage - 1})">
                        ◀ السابق
                    </button>
                    <span style="font-size:12px; font-weight:800; padding:0 8px;">صفحة ${this.freeVouchersPage} من ${totalPages}</span>
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" ${this.freeVouchersPage >= totalPages ? 'disabled' : ''} onclick="App.changeFreeVouchersPage(${this.freeVouchersPage + 1})">
                        التالي ▶
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:11.5px; color:#64748b;">لكل صفحة:</span>
                    <select class="mt-input" style="padding:3px 8px; font-size:12px; width:auto;" onchange="App.changeFreeVouchersPageSize(Number(this.value))">
                        <option value="25" ${this.freeVouchersPageSize === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${this.freeVouchersPageSize === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${this.freeVouchersPageSize === 100 ? 'selected' : ''}>100</option>
                        <option value="200" ${this.freeVouchersPageSize === 200 ? 'selected' : ''}>200</option>
                    </select>
                </div>
            </div>
            ` : '';

            tabContent = filterBarHtml + tableHtml + paginationHtml;
        }

        // Tab 2: Schedules
        else if (this.freeVouchersTab === 'schedules') {
            const columns = [
                { key: 'idx', label: '#', width: '45px', render: (_, i) => i + 1 },
                { key: 'fullname', label: 'المستفيد', render: q => `<b>${this.escape(q.fullname)}</b>${q.recipient_phone || q.phone ? `<br><small style="color:#64748b;">📱 ${this.escape(q.recipient_phone || q.phone)}</small>` : ''}` },
                { key: 'role', label: 'الرتبة', render: q => `<span class="badge" style="background:#8e44ad; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(q.role_name_ar || q.role)}</span>` },
                { key: 'profile', label: 'الباقة المجانية', render: q => `<span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(q.profile_label || q.profile_name)}</span>` },
                { key: 'qty', label: 'الكمية', render: q => `<b>${q.cards_count || q.monthly_cards_quota || 1} كروت</b>` },
                { key: 'schedule', label: 'نمط التكرار', render: q => `
                    <span class="badge" style="background:#e67e22; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">
                        ${q.schedule_type === 'weekly' ? '📅 أسبوعي (كل 7 أيام)' :
                          q.schedule_type === 'yearly' ? '📅 سنوي (كل 365 يوم)' :
                          q.schedule_type === 'custom_days' ? `📅 كل ${q.interval_days} يوم` : '📅 شهري (كل 30 يوم)'}
                    </span>`
                },
                { key: 'start_date', label: 'تاريخ البداية', render: q => `<span style="font-weight:600; color:#0f766e;">${this.escape(q.start_date || '-')}</span>` },
                { key: 'notes', label: 'الملاحظة والسبب', render: q => `<span style="font-size:12px; color:#475569;">${this.escape(q.notes || '-')}</span>` },
                { key: 'creator', label: 'أضيف بواسطة', render: q => `<span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-size:11px; padding:2px 6px;">👤 ${this.escape(q.creator_name || 'النظام')}</span>` },
                { key: 'next', label: 'تاريخ الإرسال القادم', render: q => `<b style="color:#e11d48;">${this.escape(q.next_dispatch_date || 'فورياً')}</b>` },
                { key: 'last', label: 'آخر إرسال', render: q => `<small>${this.escape(q.last_dispatched_at || 'لم يتم بعد')}</small>` },
                { key: 'status', label: 'الحالة', render: q => `
                    <span class="badge" style="background:${q.is_active ? '#16a34a' : '#64748b'}; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; display:inline-block; font-weight:600;">
                        ${q.is_active ? '🟢 مفعل' : '⏸️ معطل'}
                    </span>
                ` },
                { key: 'actions', label: 'الإجراءات', align: 'center', width: '130px', render: q => {
                    const qData = JSON.stringify(q).replace(/"/g, '&quot;');
                    return `
                    <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                        <button type="button" class="mt-btn mt-btn-sm" style="padding:4px 8px; font-size:12px; display:inline-flex; align-items:center; gap:3px;" onclick='App.editFreeSchedule(${qData})' title="تعديل الجدولة">
                            <span>✏️</span> <span>تعديل</span>
                        </button>
                        <button type="button" class="mt-btn mt-btn-sm ${q.is_active ? 'mt-btn-warning' : 'mt-btn-success'}" style="padding:4px 8px; font-size:12px; display:inline-flex; align-items:center; gap:3px;" onclick="App.toggleFreeSchedule(${q.id}, ${q.is_active ? 0 : 1})" title="${q.is_active ? 'تعطيل الجدولة' : 'تفعيل الجدولة'}">
                            <span>${q.is_active ? '⏸️' : '▶️'}</span> <span>${q.is_active ? 'تعطيل' : 'تفعيل'}</span>
                        </button>
                    </div>
                    `;
                }}
            ];

            tabContent = PB ? PB.renderTable({
                columns,
                rows: quotas,
                emptyText: 'لا توجد جداول دورية معرفة بعد'
            }) : '';
        }

        // Tab 3: Analytics & ROI
        else if (this.freeVouchersTab === 'analytics') {
            const profCols = [
                { key: 'label', label: 'اسم الباقة', render: pa => `<b style="color:#0284c7;">${this.escape(pa.profile_label)}</b> <code>(${this.escape(pa.profile_name)})</code>` },
                { key: 'total', label: 'إجمالي الكروت', render: pa => `<b>${pa.total_cards} كرت</b>` },
                { key: 'active', label: 'الكروت النشطة', render: pa => `<span class="status-pill status-online">${pa.active_cards} فعال</span>` },
                { key: 'mb', label: 'حجم الاستهلاك (MB)', render: pa => `<b>${pa.total_consumed_mb} MB</b>` },
                { key: 'gb', label: 'حجم الاستهلاك (GB)', render: pa => `<b style="color:#16a34a;">${pa.total_consumed_gb} GB</b>` },
                { key: 'cost', label: 'التكلفة التقديرية للباقة', render: pa => `<b>${App.formatMoney(pa.estimated_cost)}</b>` }
            ];

            const recipCols = [
                { key: 'name', label: 'المستفيد / صاحب النقطة', render: ra => `<b>${this.escape(ra.fullname)}</b>` },
                { key: 'role', label: 'الرتبة', render: ra => `<span class="badge" style="background:#8e44ad; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(ra.role_name_ar)}</span>` },
                { key: 'node', label: 'النقطة المرتبطة به', render: ra => `<b>${this.escape(ra.linked_node_name || 'غير مرتبط بنقطة')}</b>` },
                { key: 'total', label: 'الكروت المستلمة', render: ra => `${ra.total_free_cards} كرت` },
                { key: 'mb', label: 'استهلاك كروته', render: ra => `<b>${ra.free_consumed_mb} MB</b>` },
                { key: 'cost', label: 'تكلفة استهلاكه', render: ra => `<b>${App.formatMoney(ra.free_consumed_cost)}</b>` },
                { key: 'sales', label: 'مبيعات نقطته', render: ra => `<b style="color:#0284c7;">${App.formatMoney(ra.node_commercial_sales)}</b>` },
                { key: 'ratio', label: 'نسبة الاستهلاك من المبيعات', render: ra => {
                    const ratio = parseFloat(ra.free_to_sales_ratio || 0);
                    let color = '#16a34a';
                    if (ratio > 25) color = '#e11d48';
                    else if (ratio > 10) color = '#ea580c';
                    return `<b style="color:${color};">${ratio}%</b>`;
                }},
                { key: 'eval', label: 'التقييم', render: ra => {
                    const ratio = parseFloat(ra.free_to_sales_ratio || 0);
                    let bg = '#16a34a';
                    let text = '🌟 ممتاز ومربح';
                    if (ratio > 25) { bg = '#e11d48'; text = '⚠️ استهلاك مرتفع'; }
                    else if (ratio > 10) { bg = '#ea580c'; text = '⚖️ استهلاك متوسط'; }
                    return `<span class="badge" style="background:${bg}; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${text}</span>`;
                }}
            ];

            const tableProf = PB ? PB.renderTable({ columns: profCols, rows: profileAnalytics, emptyText: 'لا توجد بيانات استهلاك للباقات' }) : '';
            const tableRecip = PB ? PB.renderTable({ columns: recipCols, rows: recipientAnalytics, emptyText: 'لا توجد بيانات مقارية مالية بعد' }) : '';

            tabContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="sam-card mt-card" style="padding:16px;">
                    <div style="font-weight:700; font-size:15px; margin-bottom:12px; color:var(--sam-text, #0f172a);">
                        📊 إحصائيات استهلاك وتكلفة الباقات المجانية
                    </div>
                    ${tableProf}
                </div>
                <div class="sam-card mt-card" style="padding:16px;">
                    <div style="font-weight:700; font-size:15px; margin-bottom:12px; color:var(--sam-text, #0f172a);">
                        💼 دراسة الجدوى: مقارنة استهلاك كروت صاحب النقطة بحجم مبيعات نقطته (ROI)
                    </div>
                    ${tableRecip}
                </div>
            </div>`;
        } else if (this.freeVouchersTab === 'pos_rules') {
            const posRules = this._allPosRules || [];
            const eligData = this._allPosEligibility || {};
            const eligList = eligData.eligibility || [];
            const totalPending = eligData.total_pending_cards || 0;
            const totalEligiblePos = eligData.total_eligible_pos || 0;

            // Rules Table
            const rulesRows = posRules.map(r => {
                const basisText = r.rule_type === 'sheets_sales' 
                    ? `<span class="sam-badge sam-badge--info">📄 لكل ${r.threshold_value} ورقة</span>`
                    : (r.rule_type === 'revenue_sales' 
                        ? `<span class="sam-badge sam-badge--warning">💰 لكل ${App.formatMoney(r.threshold_value)} مبيعات</span>`
                        : `<span class="sam-badge sam-badge--purple">📶 لكل ${r.threshold_value} GB استهلاك</span>`);

                const paidBadge = `<span class="sam-badge sam-badge--primary" style="font-weight:700;">🛒 ${this.escape(r.paid_profile_label || r.paid_profile_name || 'كافة الباقات')}</span>`;
                const freeBadge = `<span class="sam-badge sam-badge--success" style="font-weight:700;">🎁 ${this.escape(r.profile_label || r.profile_name)}</span>`;
                const cardsBadge = `<span class="sam-badge sam-badge--purple" style="font-weight:700;">✨ ${r.free_cards_count} كرت مجاني</span>`;
                const subBadge = r.include_sub_pos == 1 
                    ? `<span class="sam-badge sam-badge--success">نعم (الرئيسي + التابعة)</span>` 
                    : `<span class="sam-badge sam-badge--neutral">النقطة المحددة فقط</span>`;

                return `
                <tr>
                    <td style="font-weight:600;">
                        ${r.pos_admin_id > 0 
                            ? `<span style="color:#0284c7;">👤 [مخصص] ${this.escape(r.pos_name)}</span>` 
                            : '<span style="color:#16a34a; font-weight:700;">🌐 تطبيق عام لكافة نقاط البيع</span>'}
                        ${r.pos_admin_id > 0 ? `<div style="font-size:11px; color:#64748b;">${r.pos_role_ar || ''} ${r.pos_phone ? '📱 ' + r.pos_phone : ''}</div>` : '<div style="font-size:11px; color:#64748b;">تطبق تلقائياً على أي وكيل ليس له تخصيص</div>'}
                        ${r.parent_pos_name ? `<div style="font-size:10px; color:#94a3b8;">تابعة لـ: ${this.escape(r.parent_pos_name)}</div>` : ''}
                    </td>
                    <td>${paidBadge}</td>
                    <td>${freeBadge}</td>
                    <td>${cardsBadge} <div style="font-size:11px; color:#64748b; margin-top:2px;">${basisText}</div></td>
                    <td>${subBadge}</td>
                    <td>
                        <span class="sam-badge sam-badge--neutral">${r.send_method === 'whatsapp' ? '💬 واتساب' : (r.send_method === 'sms' ? '📱 SMS' : (r.send_method === 'both' ? '💬 واتساب + SMS' : '🔒 بالنظام'))}</span>
                    </td>
                    <td>
                        <strong style="color:#0284c7;">${r.total_granted_cards || 0} كرت</strong>
                    </td>
                    <td>
                        ${r.is_active == 1 ? '<span class="sam-badge sam-badge--success">مفعلة</span>' : '<span class="sam-badge sam-badge--danger">معطلة</span>'}
                    </td>
                    <td>
                        <div style="display:flex; gap:4px;">
                            <button type="button" class="mt-btn mt-btn-sm" style="padding:4px 8px;" onclick="App.editPosFreeRule(${r.id})" title="تعديل">✏️</button>
                            <button type="button" class="mt-btn mt-btn-sm mt-btn-danger" style="padding:4px 8px;" onclick="App.deletePosFreeRule(${r.id})" title="حذف">🗑️</button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');

            const rulesTable = posRules.length ? `
            <div class="table-responsive" style="overflow-x:auto;">
                <table class="sam-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:var(--sam-bg-subtle, #f8fafc); text-align:right;">
                            <th style="padding:10px 12px;">نطاق التطبيق (الوكيل / عامة)</th>
                            <th style="padding:10px 12px;">الباقة المدفوعة المشتراة</th>
                            <th style="padding:10px 12px;">الباقة المجانية الممنوحة</th>
                            <th style="padding:10px 12px;">معدل المنح</th>
                            <th style="padding:10px 12px;">شمل الفروع</th>
                            <th style="padding:10px 12px;">الإرسال</th>
                            <th style="padding:10px 12px;">إجمالي المصروف</th>
                            <th style="padding:10px 12px;">الحالة</th>
                            <th style="padding:10px 12px;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>${rulesRows}</tbody>
                </table>
            </div>` : `<div style="text-align:center; padding:30px 15px; color:#64748b;">لم يتم تعريف أي قواعد منح لنقاط البيع بعد. انقر على "إضافة قاعدة منح لنقاط البيع" أعلاه لضبط الشروط.</div>`;

            // Live Eligibility Rows
            const eligRows = eligList.map(e => {
                const isEligible = e.pending_eligible_cards > 0;
                const statusBadge = isEligible 
                    ? `<span class="sam-badge sam-badge--success" style="font-weight:700; font-size:12px;">🎁 مستحق الآن (${e.pending_eligible_cards} كرت)</span>`
                    : `<span class="sam-badge sam-badge--neutral">تم صرف المستحق</span>`;

                return `
                <tr style="${isEligible ? 'background:rgba(16, 185, 129, 0.04);' : ''}">
                    <td style="font-weight:600;">
                        ${this.escape(e.pos_name)}
                        <div style="font-size:11px; color:#64748b;">${e.pos_role_ar || ''} ${e.pos_phone ? '📱 ' + e.pos_phone : ''}</div>
                    </td>
                    <td>
                        ${e.parent_name ? `<span class="sam-badge sam-badge--neutral">فرعي تابع لـ: ${this.escape(e.parent_name)}</span>` : `<span class="sam-badge sam-badge--info">نقطة رئيسية / موزع</span>`}
                        ${e.sub_pos_count > 0 && e.include_sub_pos ? `<div style="font-size:10px; color:#0369a1; margin-top:2px;">(يشمل ${e.sub_pos_count} نقطة فرعية تابعة)</div>` : ''}
                    </td>
                    <td>
                        <strong style="font-size:13px; color:#0f172a;">📄 ${e.sold_sheets} ورقة</strong>
                        <div style="font-size:11px; color:#64748b;">(${e.sold_cards} كرت مباع)</div>
                    </td>
                    <td>
                        <strong style="color:#0284c7;">${App.formatMoney(e.total_revenue)}</strong>
                        ${e.consumed_mb > 0 ? `<div style="font-size:11px; color:#64748b;">استهلاك: ${App.formatBytes(e.consumed_mb * 1024 * 1024)}</div>` : ''}
                    </td>
                    <td>
                        <div style="font-size:11px; font-weight:700; color:#0284c7;">🛒 ${this.escape(e.paid_profile_label || e.paid_profile_name || 'كافة الباقات')}</div>
                        <div style="font-size:11px; font-weight:700; color:#16a34a; margin-top:2px;">🎁 ${this.escape(e.profile_label || e.profile_name)}</div>
                        <div style="font-size:10px; color:#64748b; margin-top:2px;">${e.rule_type_label}</div>
                    </td>
                    <td style="font-weight:700; color:#3b82f6;">${e.earned_cards} كرت</td>
                    <td style="color:#64748b;">${e.already_granted_cards} كرت</td>
                    <td>${statusBadge}</td>
                    <td>
                        ${isEligible ? `
                            <button type="button" class="mt-btn mt-btn-sm mt-btn-success" style="font-weight:700; padding:6px 12px; display:inline-flex; align-items:center; gap:4px;" onclick="App.grantPosFreeVouchers(${e.rule_id}, ${e.pos_id}, ${e.pending_eligible_cards}, '${this.escape(e.pos_name)}')">
                                🎁 صرف (${e.pending_eligible_cards}) كرت
                            </button>
                        ` : `<button type="button" class="mt-btn mt-btn-sm" style="opacity:0.5;" disabled>لا يوجد مستحق</button>`}
                    </td>
                </tr>
                `;
            }).join('');

            const eligTable = eligList.length ? `
            <div class="table-responsive" style="overflow-x:auto;">
                <table class="sam-table" style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead>
                        <tr style="background:var(--sam-bg-subtle, #f8fafc); text-align:right;">
                            <th style="padding:10px 12px;">نقطة البيع والمسؤول</th>
                            <th style="padding:10px 12px;">التبعية والتفرع</th>
                            <th style="padding:10px 12px;">الأوراق المباعة الفعلية</th>
                            <th style="padding:10px 12px;">المبيعات / الاستهلاك</th>
                            <th style="padding:10px 12px;">الباقة والقاعدة</th>
                            <th style="padding:10px 12px;">المستحق إجمالاً</th>
                            <th style="padding:10px 12px;">الممنوح سابقاً</th>
                            <th style="padding:10px 12px;">المتبقي للصرف</th>
                            <th style="padding:10px 12px;">إجراء الصرف</th>
                        </tr>
                    </thead>
                    <tbody>${eligRows}</tbody>
                </table>
            </div>` : `<div style="text-align:center; padding:30px 15px; color:#64748b;">لا توجد نقاط بيع مسجلة أو لم تنطبق أي قاعدة استحقاق.</div>`;

            tabContent = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <!-- Summary Cards for POS Rewards -->
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                    <div class="sam-card mt-card" style="padding:14px; background:linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border:1px solid #bbf7d0;">
                        <div style="font-size:12px; color:#166534; font-weight:700;">🎁 كروت مستحقة جاهزة للصرف الآن</div>
                        <div style="font-size:24px; font-weight:800; color:#15803d; margin-top:4px;">${totalPending} <span style="font-size:13px; font-weight:600;">كرت مجاني</span></div>
                        <div style="font-size:11px; color:#166534; margin-top:2px;">لـ ${totalEligiblePos} نقطة بيع مؤهلة</div>
                    </div>
                    <div class="sam-card mt-card" style="padding:14px; background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border:1px solid #bfdbfe;">
                        <div style="font-size:12px; color:#1e40af; font-weight:700;">🏪 إجمالي قواعد المنح النشطة</div>
                        <div style="font-size:24px; font-weight:800; color:#1d4ed8; margin-top:4px;">${posRules.length} <span style="font-size:13px; font-weight:600;">قاعدة</span></div>
                        <div style="font-size:11px; color:#1e40af; margin-top:2px;">حسب الورق والمبيعات</div>
                    </div>
                </div>

                <!-- Section 1: Configured Rules -->
                <div class="sam-card mt-card" style="padding:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                        <div>
                            <div style="font-weight:700; font-size:15px; color:var(--sam-text, #0f172a);">
                                ⚙️ قواعد وإعدادات منح الكروت المجانية لنقاط البيع
                            </div>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                تحديد عدد الكروت المجانية المستحقة مقابل الأوراق المباعة (بحد أقصى 4 كروت للورقة) أو المبيعات والاستهلاك
                            </div>
                        </div>
                        <button type="button" class="mt-btn mt-btn-primary" style="font-size:12px; padding:6px 12px;" onclick="App.showPosFreeRuleModal()">
                            ➕ إضافة قاعدة منح جديدة
                        </button>
                    </div>
                    ${rulesTable}
                </div>

                <!-- Section 2: Live Eligibility & Performance -->
                <div class="sam-card mt-card" style="padding:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                        <div>
                            <div style="font-weight:700; font-size:15px; color:var(--sam-text, #0f172a);">
                                📊 كشف استحقاق نقاط البيع الفعلي ومبيعات الأوراق
                            </div>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                احتساب آلي لعدد الأوراق المباعة والمتبقي للصرف لصاحب النقطة المختار أو النقاط التابعة له
                            </div>
                        </div>
                        ${totalPending > 0 ? `
                            <button type="button" class="mt-btn mt-btn-success" style="font-size:12px; font-weight:700; padding:8px 16px; box-shadow:0 2px 4px rgba(16,185,129,0.3);" onclick="App.grantAllEligiblePosFreeVouchers()">
                                🚀 صرف جميع المستحقات (${totalPending} كرت) دفعة واحدة
                            </button>
                        ` : ''}
                    </div>
                    ${eligTable}
                </div>
            </div>`;
        }

        const pageContent = `
            ${tabsNav}
            <div class="free-vouchers-tab-body">
                ${tabContent}
            </div>
        `;

        const shell = PB ? PB.renderShell({
            id: 'free-vouchers',
            archetype: 'pos',
            title: '🎁 الكروت المجانية و VIP',
            subtitle: 'إدارة وتوزيع الكروت المجانية للشخصيات والشركاء، الجدولة الآلية، وتحليل العائد (ROI)',
            eyebrow: 'الكروت والمخازن',
            icon: '🎁',
            actions,
            stats,
            content: pageContent
        }) : `<div class="mt-page">${pageContent}</div>`;

        view.innerHTML = shell;
    },

    changeFreeVouchersPage(p) {
        this.freeVouchersPage = Math.max(1, p);
        this.renderFreeVouchers('vouchers');
    },

    changeFreeVouchersPageSize(size) {
        this.freeVouchersPageSize = size;
        this.freeVouchersPage = 1;
        this.renderFreeVouchers('vouchers');
    },

    onFreeFilterChange(type, val) {
        if (type === 'profile') this.freeFilterProfile = val;
        if (type === 'granter') this.freeFilterGranter = val;
        if (type === 'grant_type') this.freeFilterGrantType = val;
        if (type === 'status') this.freeFilterStatus = val;
        if (type === 'wa') this.freeFilterWa = val;
        if (type === 'search') this.freeFilterSearch = val;
        this.freeVouchersPage = 1;
        this.renderFreeVouchers('vouchers');
    },

    clearFreeVouchersFilters() {
        this.freeFilterProfile = '';
        this.freeFilterGranter = '';
        this.freeFilterGrantType = '';
        this.freeFilterStatus = '';
        this.freeFilterWa = '';
        this.freeFilterSearch = '';
        this.freeVouchersPage = 1;
        this.renderFreeVouchers('vouchers');
    },

    async showGrantFreeVouchersModal(admins = null, profiles = null) {
        if (this._freeVouchersNetworkId !== this.activeNetworkId) {
            this._freeVouchersProfiles = null;
            this._freeVouchersAdmins = null;
            this._freeVouchersNetworkId = this.activeNetworkId;
        }
        if (!admins || !admins.length) {
            if (this._freeVouchersAdmins && this._freeVouchersAdmins.length) {
                admins = this._freeVouchersAdmins;
            } else {
                const res = await this.api('get_admins_with_roles');
                admins = res?.admins || [];
                this._freeVouchersAdmins = admins;
            }
        }
        if (!profiles || !profiles.length) {
            if (this._freeVouchersProfiles && this._freeVouchersProfiles.length) {
                profiles = this._freeVouchersProfiles;
            } else {
                const res = await this.api('get_profiles');
                profiles = res?.data || res || [];
                this._freeVouchersProfiles = profiles;
            }
        }
        const freeProfiles = profiles.filter(p => parseFloat(p.price || 0) === 0 || p.package_type === 'free' || (p.name || '').toLowerCase().includes('vip') || (p.name_for_users || '').toLowerCase().includes('vip') || (p.name_for_users || '').includes('مجاني'));
        const sortedProfiles = freeProfiles.length ? freeProfiles : profiles;
        const initialProfile = sortedProfiles[0] || {};
        const limitBytes = initialProfile.transfer_limit ? parseInt(initialProfile.transfer_limit, 10) : 0;

        this.openModal(`
            <div style="font-weight:bold; font-size:16px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                <span>🎁</span>
                <span>منح كروت مجانية / VIP فائقة السرعة</span>
                <span class="badge" style="background:#8e44ad; color:#fff; font-size:11px; padding:2px 8px;">سرعة فورية</span>
            </div>
            <form onsubmit="event.preventDefault(); App.submitGrantFreeVouchers();" style="display:flex; flex-direction:column; gap:12px;">
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">الشخص المستفيد: <span style="color:red;">*</span></label>
                    <input type="text" list="fv-recipient-list" id="fv-recipient-input" class="mt-input" style="width:100%; font-weight:600; font-size:12.5px;" placeholder="🔍 اكتب اسم أو يوزر المستفيد أو اختر من القائمة..." oninput="App.syncAdminCombobox(this, 'fv-recipient', 'fv-recipient-list', (id) => App.onRecipientSelected(id, ${JSON.stringify(admins).replace(/"/g, '&quot;')}))" onchange="App.syncAdminCombobox(this, 'fv-recipient', 'fv-recipient-list', (id) => App.onRecipientSelected(id, ${JSON.stringify(admins).replace(/"/g, '&quot;')}))" required />
                    <input type="hidden" id="fv-recipient" value="" />
                    <datalist id="fv-recipient-list">
                        ${admins.filter(a => Number(a.id) !== Number(this.adminId)).map(a => `
                            <option data-id="${a.id}" data-search="${this.escapeHtml(((a.fullname || '') + ' ' + (a.username || '') + ' ' + (a.phone || '') + ' ' + (a.role_name_ar || a.role || '')).toLowerCase())}" value="${this.escapeHtml(a.fullname)} (@${this.escapeHtml(a.username)}) - [${this.escapeHtml(a.role_name_ar || a.role)}]">
                                ${this.escapeHtml(a.fullname)} (@${this.escapeHtml(a.username)})
                            </option>
                        `).join('')}
                    </datalist>
                </div>

                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">الباقة المستهدفة: <span style="color:red;">*</span></label>
                    <select id="fv-profile" class="mt-input" style="width:100%; font-weight:700;" required onchange="App.onGrantProfileChange(this.value)">
                        ${sortedProfiles.map(p => {
                            const bytes = parseInt(p.transfer_limit || 0, 10);
                            const speed = p.rate_limit ? ` [${p.rate_limit}]` : '';
                            return `<option value="${this.escapeHtml(p.name)}" data-bytes="${bytes}">🎁 ${this.escapeHtml(p.name_for_users || p.name)}${speed} (${App.formatBytes(bytes) || 'مفتوح'})</option>`;
                        }).join('')}
                    </select>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">⚡ تعزيز سرعة الكرت (VIP Speed Boost):</label>
                        <select id="fv-speed-boost" class="mt-input" style="width:100%; font-weight:700; color:#0284c7;">
                            <option value="" selected>حسب الباقة (الافتراضية)</option>
                            <option value="10M/10M">⚡ سريع (10 Mbps)</option>
                            <option value="20M/20M">⚡ VIP فائق (20 Mbps)</option>
                            <option value="50M/50M">🚀 VIP صاروخي (50 Mbps)</option>
                            <option value="100M/100M">🏎️ VIP قصوى (100 Mbps)</option>
                            <option value="500M/500M">🌐 ألياف ضوئية (500 Mbps)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">عدد الكروت المطلوبة: <span style="color:red;">*</span></label>
                        <input type="number" id="fv-count" class="mt-input" style="width:100%; font-weight:700;" min="1" max="10" value="1" required />
                        <small id="fv-count-hint" style="color:#0369a1; font-size:11px; display:block; margin-top:3px;">
                            💡 يمكنك توليد حتى 10 كروت دفعة واحدة
                        </small>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">رقم الهاتف (لإرسال الكروت لواتساب):</label>
                        <input type="text" id="fv-phone" class="mt-input" style="width:100%; direction:ltr; text-align:right;" placeholder="967xxxxxxxxx" />
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">ملاحظات / سبب المنح: <span style="color:red;">*</span></label>
                        <input type="text" id="fv-notes" class="mt-input" style="width:100%;" required placeholder="مثلاً: كرت VIP مجاني لمسؤول نقطة / ضيف مميز" value="كرت VIP مجاني" />
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="background:#059669; font-weight:700;">🎁 توليد وتفعيل الكروت فوراً</button>
                </div>
            </form>
        `);
    },

    onGrantProfileChange(profileName) {
        const sel = document.getElementById('fv-profile');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const bytes = opt ? parseInt(opt.getAttribute('data-bytes') || '0', 10) : 0;
        const hintEl = document.getElementById('fv-count-hint');
        if (hintEl) {
            hintEl.innerText = bytes > 0 ? `💡 حجم الباقة: ${App.formatBytes(bytes)} (توليد حتى 10 كروت)` : '💡 باقة مفتوحة / VIP';
        }
    },

    onRecipientSelected(adminId, admins) {
        const found = admins.find(a => String(a.id) === String(adminId));
        const phoneInput = document.getElementById('fv-phone');
        if (found && phoneInput && found.phone) phoneInput.value = found.phone;
    },

    async submitGrantFreeVouchers() {
        const recipientInput = document.getElementById('fv-recipient-input');
        const hiddenRecipient = document.getElementById('fv-recipient');
        let recipientId = hiddenRecipient?.value ? parseInt(hiddenRecipient.value, 10) : 0;
        let recipientName = recipientInput ? recipientInput.value.trim() : '';

        // Fallback resolve from datalist if hidden id is empty
        if (!recipientId && recipientInput) {
            const dl = document.getElementById('fv-recipient-list');
            if (dl) {
                const opt = Array.from(dl.options).find(o => o.value === recipientInput.value || o.text.includes(recipientInput.value));
                if (opt && opt.dataset.id) {
                    recipientId = parseInt(opt.dataset.id, 10);
                    if (hiddenRecipient) hiddenRecipient.value = recipientId;
                }
            }
        }

        if (!recipientId) {
            return this.toast('يرجى اختيار الشخص المستفيد من القائمة', 'warning');
        }

        if (Number(recipientId) === Number(this.adminId)) {
            return this.toast('⚠️ غير مصرح: لا يمكنك منح كروت مجانية لحسابك الشخصي', 'danger');
        }

        const profileName = document.getElementById('fv-profile')?.value;
        if (!profileName) {
            return this.toast('يرجى اختيار الباقة المستهدفة', 'warning');
        }

        const speedBoost = document.getElementById('fv-speed-boost')?.value || '';
        const simultaneousUse = 1;
        const phone = document.getElementById('fv-phone')?.value || '';
        const count = parseInt(document.getElementById('fv-count')?.value || '1', 10);
        const notes = document.getElementById('fv-notes')?.value?.trim() || 'كرت VIP مجاني';

        if (!notes) {
            return this.toast('يرجى إدخال سبب / ملاحظات منح الكروت المجانية', 'warning');
        }

        const payload = {
            recipient_id: recipientId,
            profile_name: profileName,
            speed_boost: speedBoost,
            simultaneous_use: simultaneousUse,
            count: count,
            phone: phone,
            notes: notes
        };

        this.toast('جاري توليد الكروت وضبط الصلاحيات...', 'info');
        const res = await this.api('grant_free_vouchers', payload, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم توليد وتفعيل الكروت بنجاح', 'success');
            const cards = res.cards || [];
            const cardDetails = res.card_details || [];
            const wa = res.whatsapp_delivery || {};
            const cleanPhone = res.phone || phone;
            const appliedSpeed = res.speed || speedBoost || 'حسب الباقة';
            
            // Format WhatsApp Message for Web Direct Link
            const cardsText = cardDetails.map(c => `• 🎫 الكرت: *${c.code}* ${c.password ? `(السر: ${c.password})` : '(بدون كلمة سر)'} ${c.speed ? `[⚡ ${c.speed}]` : ''}`).join('\n');
            const fullShareMsg = `🎁 *كروت إنترنت مجانية / VIP*\n━━━━━━━━━━━━━━━━━━━━\n👤 *المستفيد:* ${recipientName}\n📦 *الباقة:* ${profileName}${appliedSpeed !== 'حسب الباقة' ? ` (⚡ سرعة: ${appliedSpeed})` : ''}\n🔢 *عدد الكروت:* ${cards.length}\n\n${cardsText}\n\n📝 *البيان:* ${notes}\n━━━━━━━━━━━━━━━━━━━━\n🌐 نتمنى لك تصفحاً ممتعاً وسريعاً!`;

            // Show Success & Instant Send Modal
            this.openModal(`
                <div style="text-align:center; padding:18px;">
                    <div style="font-size:42px; margin-bottom:8px;">🎉</div>
                    <div style="font-weight:800; font-size:18px; color:#15803d; margin-bottom:4px;">تم توليد وتخصيص كروت VIP المجانية بنجاح!</div>
                    <div style="color:#64748b; font-size:13px; margin-bottom:14px;">المستفيد: <b>${this.escapeHtml(recipientName)}</b> (${cards.length} كرت — <b>${appliedSpeed}</b>)</div>
                    
                    <div style="background:#f8fafc; border:1px dashed #94a3b8; border-radius:10px; padding:12px; margin-bottom:14px; font-size:15px; text-align:right;">
                        ${cardDetails.map(c => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #e2e8f0;">
                                <div>
                                    <span style="font-weight:800; color:#4f46e5; font-size:16px;">🎫 <code>${c.code}</code></span>
                                    <span style="font-size:11px; color:#64748b; margin-right:6px;">${c.password ? `🔑 كلمة السر: <b>${c.password}</b>` : '🔓 بدون كلمة سر'}</span>
                                </div>
                                <span class="badge" style="background:#0284c7; color:#fff; font-size:11px; padding:2px 8px;">⚡ ${c.speed || 'افتراضي'}</span>
                            </div>
                        `).join('')}
                    </div>

                    ${wa.sent ? `
                        <div style="background:#dcfce7; border:1px solid #86efac; color:#15803d; border-radius:8px; padding:10px; margin-bottom:14px; font-size:13px; font-weight:bold;">
                            🟢 تم إرسال الرسالة والكروت تلقائياً إلى واتساب (${App.formatPhoneDisplay(cleanPhone)}) بنجاح!
                        </div>
                    ` : (cleanPhone ? `
                        <div style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; border-radius:8px; padding:10px; margin-bottom:14px; font-size:12.5px; text-align:right;">
                            ⚠️ <b>حالة التسليم الآلي للواتساب:</b> ${App.escape(wa.error || 'بانتظار الإرسال أو أن الرقم غير مسجل')}
                            <div style="margin-top:8px; display:flex; gap:6px;">
                                <button class="mt-btn mt-btn-warning" style="font-size:11px; padding:4px 10px; font-weight:bold;" onclick="App.retryFreeVoucherWhatsApp('${cards[0]}', '${cleanPhone}')">🔁 إعادة إرسال الكرت لواتساب</button>
                            </div>
                        </div>
                    ` : '')}

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; gap:8px;">
                            ${cleanPhone ? `
                                <a class="mt-btn" style="flex:1; background:#25D366; color:#fff; font-weight:bold; padding:8px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;" target="_blank" href="https://wa.me/${cleanPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(fullShareMsg)}">
                                    💬 فتح واتساب ويب مباشرة
                                </a>
                            ` : ''}
                            <button type="button" class="mt-btn" style="flex:1; padding:8px 12px; font-size:12px; font-weight:bold;" onclick="navigator.clipboard.writeText(\`${fullShareMsg.replace(/`/g, '\\`')}\`); App.toast('تم نسخ بيانات الكروت بالكامل إلى الحافظة! 📋', 'success');">
                                📋 نسخ بيانات الكروت
                            </button>
                        </div>
                        <button class="mt-btn mt-btn-primary" style="padding:10px; font-weight:bold;" onclick="App.closeModal(); if (typeof App.renderFreeVouchers === 'function') App.renderFreeVouchers();">
                            ✓ إغلاق وعرض السجل
                        </button>
                    </div>
                </div>
            `);
            if (typeof this.renderFreeVouchers === 'function') {
                this.renderFreeVouchers();
            }
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء المنح', 'danger');
        }
    },

    async showFreeScheduleModal(admins = null, profiles = null, schedule = null) {
        if (this._freeVouchersNetworkId !== this.activeNetworkId) {
            this._freeVouchersProfiles = null;
            this._freeVouchersAdmins = null;
            this._freeVouchersNetworkId = this.activeNetworkId;
        }

        if (!admins || !admins.length) {
            if (this._freeVouchersAdmins && this._freeVouchersAdmins.length) {
                admins = this._freeVouchersAdmins;
            } else {
                const res = await this.api('get_admins_with_roles');
                admins = res?.admins || [];
                this._freeVouchersAdmins = admins;
            }
        }
        if (!profiles || !profiles.length) {
            if (this._freeVouchersProfiles && this._freeVouchersProfiles.length) {
                profiles = this._freeVouchersProfiles;
            } else {
                const res = await this.api('get_profiles');
                profiles = res?.data || res || [];
                this._freeVouchersProfiles = profiles;
            }
        }

        const isEdit = !!schedule;
        this._modalScheduleAdmins = admins;
        this._modalScheduleProfiles = profiles;
        this._modalEditingSchedule = schedule;

        // Existing scheduled admin IDs to prevent duplicates in Add mode
        const existingScheduledAdminIds = new Set(
            (this._allFreeQuotas || [])
                .filter(q => !isEdit || Number(q.id) !== Number(schedule.id))
                .map(q => Number(q.admin_id))
        );

        const freeProfiles = profiles.filter(p => parseFloat(p.price) === 0 || p.name.startsWith('Free-') || p.package_type === 'free');
        const defaultProfiles = freeProfiles.length ? freeProfiles : profiles;
        
        const selectedProfileName = schedule?.profile_name || (defaultProfiles[0]?.name || '');
        const selectedProfile = defaultProfiles.find(p => p.name === selectedProfileName) || defaultProfiles[0] || {};
        const limitBytes = selectedProfile.transfer_limit ? parseInt(selectedProfile.transfer_limit, 10) : 0;
        const isSmall = (limitBytes > 0 && limitBytes < 10737418240);
        const maxCards = isSmall ? 4 : 1;
        const currentCount = schedule ? Math.min(maxCards, parseInt(schedule.cards_count || schedule.monthly_cards_quota || 1, 10)) : 1;

        let selectedAdmin = null;
        if (schedule) {
            selectedAdmin = admins.find(a => Number(a.id) === Number(schedule.admin_id)) || {
                id: schedule.admin_id,
                fullname: schedule.fullname || 'المستفيد',
                role: schedule.role || '',
                role_name_ar: schedule.role_name_ar || schedule.role,
                phone: schedule.recipient_phone || schedule.phone || ''
            };
        }

        const startDateVal = schedule?.start_date ? schedule.start_date.substring(0, 10) : new Date().toISOString().split('T')[0];

        this.openModal(`
            <div style="font-weight:bold; font-size:16px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                <span>${isEdit ? '✏️ تعديل جدولة كروت مجانية دورية' : '⏰ ضبط جدولة دورية لمنح الكروت المجانية آلياً'}</span>
            </div>
            <form onsubmit="event.preventDefault(); App.submitFreeSchedule();" style="display:flex; flex-direction:column; gap:12px;">
                <input type="hidden" id="fvs-schedule-id" value="${schedule?.id || ''}" />
                
                <!-- Modern Searchable Recipient Picker -->
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">الشخص المستفيد (مستخدم موجود بالنظام): <span style="color:red;">*</span></label>
                    
                    <div id="fvs-selected-recipient-card" style="${selectedAdmin ? 'display:flex;' : 'display:none;'} align-items:center; justify-content:space-between; background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:8px 12px; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:18px;">👤</span>
                            <div>
                                <b id="fvs-selected-name" style="color:#166534; font-size:13px;">${selectedAdmin ? this.escape(selectedAdmin.fullname) : ''}</b>
                                <span id="fvs-selected-role" class="badge" style="background:#8e44ad; color:#fff; font-size:10px; padding:1px 6px; border-radius:4px; margin-inline-start:6px;">${selectedAdmin ? this.escape(selectedAdmin.role_name_ar || selectedAdmin.role) : ''}</span>
                                <span id="fvs-selected-phone" style="font-size:11px; color:#64748b; display:block;">${selectedAdmin?.phone ? '📱 ' + this.escape(selectedAdmin.phone) : ''}</span>
                            </div>
                        </div>
                        ${!isEdit ? `<button type="button" class="mt-btn mt-btn-sm" style="background:#fee2e2; color:#b91c1c; border:none; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:bold;" onclick="App.clearSelectedScheduleRecipient()">✕ تغيير</button>` : ''}
                    </div>

                    <div id="fvs-search-container" style="${selectedAdmin ? 'display:none;' : 'display:block;'}">
                        <div style="position:relative;">
                            <input type="text" id="fvs-recipient-search" class="mt-input" style="width:100%; padding-inline-start:32px;" placeholder="🔍 ابحث بالاسم، الرتبة، أو رقم الهاتف..." oninput="App.filterScheduleRecipients(this.value)" autocomplete="off" />
                            <span style="position:absolute; inset-inline-start:10px; top:50%; transform:translateY(-50%); pointer-events:none; color:#94a3b8;">🔍</span>
                        </div>
                        <div id="fvs-recipient-dropdown" style="max-height:160px; overflow-y:auto; border:1px solid var(--sam-border, #cbd5e1); border-radius:6px; margin-top:4px; background:var(--sam-card-bg, #fff); box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                            ${this._renderScheduleRecipientsList(admins, existingScheduledAdminIds)}
                        </div>
                    </div>
                    <input type="hidden" id="fvs-recipient" value="${schedule?.admin_id || ''}" required />
                    <input type="hidden" id="fvs-phone" value="${schedule?.recipient_phone || schedule?.phone || ''}" />
                </div>

                <!-- Start Date & Frequency -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">تاريخ بداية الجدولة: <span style="color:red;">*</span></label>
                        <input type="date" id="fvs-start-date" class="mt-input" style="width:100%; ${isEdit ? 'background:#f1f5f9; cursor:not-allowed; opacity:0.85;' : ''}" value="${startDateVal}" ${isEdit ? 'readonly disabled' : 'required'} />
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">نمط التكرار والجدولة: <span style="color:red;">*</span></label>
                        <select id="fvs-type" class="mt-input" style="width:100%;" onchange="App.onScheduleTypeChange(this.value)">
                            <option value="monthly" ${schedule?.schedule_type === 'monthly' || !schedule ? 'selected' : ''}>📅 شهري (كل 30 يوم)</option>
                            <option value="weekly" ${schedule?.schedule_type === 'weekly' ? 'selected' : ''}>📅 أسبوعي (كل 7 أيام)</option>
                            <option value="yearly" ${schedule?.schedule_type === 'yearly' ? 'selected' : ''}>📅 سنوي (كل 365 يوم)</option>
                            <option value="custom_days" ${schedule?.schedule_type === 'custom_days' ? 'selected' : ''}>⏱️ بحسب الأيام المعدودة (مخصص)</option>
                        </select>
                    </div>
                </div>

                <div id="fvs-custom-days-group" style="${schedule?.schedule_type === 'custom_days' ? 'display:block;' : 'display:none;'}">
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600; color:#e67e22;">حدد عدد الأيام بين كل إرسالية:</label>
                    <input type="number" id="fvs-days" class="mt-input" style="width:100%;" min="1" max="365" value="${schedule?.interval_days || 30}" placeholder="مثلاً: كل 30 يوم" />
                </div>

                <!-- Package & Quantity with Limits Rule -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">الباقة المجانية المعتمدة: <span style="color:red;">*</span></label>
                        <select id="fvs-profile" class="mt-input" style="width:100%;" required onchange="App.onScheduleProfileChange(this.value)">
                            ${defaultProfiles.map(p => {
                                const bytes = parseInt(p.transfer_limit || 0, 10);
                                const isSel = (p.name === selectedProfileName);
                                return `<option value="${p.name}" data-bytes="${bytes}" ${isSel ? 'selected' : ''}>🎁 ${p.name_for_users || p.name} (${App.formatBytes(bytes) || 'مفتوح'})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">عدد الكروت في كل دورة: <span style="color:red;">*</span></label>
                        <input type="number" id="fvs-count" class="mt-input" style="width:100%;" min="1" max="${maxCards}" value="${currentCount}" required />
                    </div>
                </div>

                <!-- Optional Notes -->
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">ملاحظات / وصف اختياري:</label>
                    <input type="text" id="fvs-notes" class="mt-input" style="width:100%;" placeholder="ملاحظات (اختياري)" value="${schedule ? this.escape(schedule.notes || '') : ''}" />
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary">💾 ${isEdit ? 'حفظ التعديلات' : 'حفظ وبدء الجدولة الدورية'}</button>
                </div>
            </form>
        `);
    },

    _renderScheduleRecipientsList(admins, existingScheduledAdminIds, query = '') {
        const q = (query || '').trim().toLowerCase();
        const filtered = admins.filter(a => {
            if (Number(a.id) === Number(this.adminId)) return false;
            if (!q) return true;
            const name = (a.fullname || '').toLowerCase();
            const uname = (a.username || '').toLowerCase();
            const role = (a.role_name_ar || a.role || '').toLowerCase();
            const phone = (a.phone || '').toLowerCase();
            return name.includes(q) || uname.includes(q) || role.includes(q) || phone.includes(q);
        });

        if (!filtered.length) {
            return `<div style="padding:10px; text-align:center; color:#94a3b8; font-size:12px;">لا يوجد مستخدم مطابق للبحث</div>`;
        }

        return filtered.map(a => {
            const isAlreadyScheduled = existingScheduledAdminIds.has(Number(a.id));
            const safeName = (a.fullname || '').replace(/'/g, "\\'");
            const safeRole = (a.role_name_ar || a.role || '').replace(/'/g, "\\'");
            const safePhone = (a.phone || '').replace(/'/g, "\\'");
            return `
                <div class="schedule-recipient-item" style="padding:8px 10px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; cursor:${isAlreadyScheduled ? 'not-allowed' : 'pointer'}; opacity:${isAlreadyScheduled ? '0.6' : '1'}; background:${isAlreadyScheduled ? '#f8fafc' : 'transparent'}; transition:background 0.2s;" ${isAlreadyScheduled ? '' : `onclick="App.selectScheduleRecipient(${a.id}, '${safeName}', '${safeRole}', '${safePhone}')"`} onmouseover="if (!${isAlreadyScheduled}) this.style.background='#f0f9ff';" onmouseout="if (!${isAlreadyScheduled}) this.style.background='transparent';">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>👤</span>
                        <div>
                            <b style="font-size:12px; color:#1e293b;">${this.escape(a.fullname)}</b>
                            <span class="badge" style="background:#8e44ad; color:#fff; font-size:10px; padding:1px 6px; border-radius:4px; margin-inline-start:4px;">${this.escape(a.role_name_ar || a.role)}</span>
                            ${a.phone ? `<span style="font-size:11px; color:#64748b; display:block;">📱 ${this.escape(a.phone)}</span>` : ''}
                        </div>
                    </div>
                    <div>
                        ${isAlreadyScheduled ? `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:10px; padding:2px 6px; border-radius:4px;">⚠️ مسجل مسبقاً</span>` : `<button type="button" class="mt-btn mt-btn-sm mt-btn-primary" style="padding:2px 8px; font-size:11px;">اختيار</button>`}
                    </div>
                </div>
            `;
        }).join('');
    },

    filterScheduleRecipients(query) {
        const container = document.getElementById('fvs-recipient-dropdown');
        if (!container || !this._modalScheduleAdmins) return;
        const isEdit = !!this._modalEditingSchedule;
        const existingScheduledAdminIds = new Set(
            (this._allFreeQuotas || [])
                .filter(q => !isEdit || Number(q.id) !== Number(this._modalEditingSchedule.id))
                .map(q => Number(q.admin_id))
        );
        container.innerHTML = this._renderScheduleRecipientsList(this._modalScheduleAdmins, existingScheduledAdminIds, query);
    },

    selectScheduleRecipient(adminId, name, role, phone) {
        const recipInp = document.getElementById('fvs-recipient');
        const phoneInp = document.getElementById('fvs-phone');
        if (recipInp) recipInp.value = adminId;
        if (phoneInp) phoneInp.value = phone || '';

        const selCard = document.getElementById('fvs-selected-recipient-card');
        const searchCont = document.getElementById('fvs-search-container');
        const nameEl = document.getElementById('fvs-selected-name');
        const roleEl = document.getElementById('fvs-selected-role');
        const phoneEl = document.getElementById('fvs-selected-phone');

        if (nameEl) nameEl.innerText = name;
        if (roleEl) roleEl.innerText = role;
        if (phoneEl) phoneEl.innerText = phone ? '📱 ' + phone : '';

        if (selCard) selCard.style.display = 'flex';
        if (searchCont) searchCont.style.display = 'none';
    },

    clearSelectedScheduleRecipient() {
        const recipInp = document.getElementById('fvs-recipient');
        const phoneInp = document.getElementById('fvs-phone');
        if (recipInp) recipInp.value = '';
        if (phoneInp) phoneInp.value = '';

        const selCard = document.getElementById('fvs-selected-recipient-card');
        const searchCont = document.getElementById('fvs-search-container');
        if (selCard) selCard.style.display = 'none';
        if (searchCont) {
            searchCont.style.display = 'block';
            const sInp = document.getElementById('fvs-recipient-search');
            if (sInp) {
                sInp.value = '';
                sInp.focus();
                this.filterScheduleRecipients('');
            }
        }
    },

    onScheduleProfileChange(profileName) {
        const sel = document.getElementById('fvs-profile');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const bytes = opt ? parseInt(opt.getAttribute('data-bytes') || '0', 10) : 0;
        const isSmall = (bytes > 0 && bytes < 10737418240);
        const maxCards = isSmall ? 4 : 1;

        const countInp = document.getElementById('fvs-count');
        if (countInp) {
            countInp.max = maxCards;
            if (parseInt(countInp.value, 10) > maxCards) countInp.value = maxCards;
        }
    },

    onScheduleTypeChange(val) {
        const grp = document.getElementById('fvs-custom-days-group');
        if (grp) grp.style.display = (val === 'custom_days') ? 'block' : 'none';
    },

    async submitFreeSchedule() {
        const scheduleId = document.getElementById('fvs-schedule-id')?.value;
        const recipientId = document.getElementById('fvs-recipient')?.value;
        const startDate = document.getElementById('fvs-start-date')?.value;
        const notes = document.getElementById('fvs-notes')?.value.trim();

        if (!recipientId) {
            return this.toast('يرجى اختيار الشخص المستفيد من القائمة', 'warning');
        }

        // Duplicate check in frontend
        if (!scheduleId) {
            const alreadyScheduled = (this._allFreeQuotas || []).some(q => Number(q.admin_id) === Number(recipientId));
            if (alreadyScheduled) {
                return this.toast('المستفيد مسجل بالفعل في جدول المواعيد الدورية، يرجى تعديل جدولته بدلاً من تكراره', 'danger');
            }
        }

        const payload = {
            id: scheduleId || undefined,
            network_id: this.activeNetworkId,
            admin_id: recipientId,
            phone: document.getElementById('fvs-phone') ? document.getElementById('fvs-phone').value : '',
            profile_name: document.getElementById('fvs-profile').value,
            cards_count: document.getElementById('fvs-count').value,
            start_date: startDate || new Date().toISOString().split('T')[0],
            schedule_type: document.getElementById('fvs-type').value,
            interval_days: document.getElementById('fvs-days') ? document.getElementById('fvs-days').value : 30,
            send_method: 'all',
            notes: notes || 'جدولة كروت مجانية دورية'
        };

        this.loading(true);
        try {
            const res = await this.api('save_free_vouchers_schedule', payload, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message, 'success');
                this.closeModal();
                this.renderFreeVouchers('schedules');
            } else {
                this.toast(res?.error || 'حدث خطأ أثناء الحفظ', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast('تعذر الاتصال بالسيرفر لحفظ الجدولة', 'danger');
        }
    },

    editFreeSchedule(schedule) {
        this.showFreeScheduleModal(this._freeVouchersAdmins, this._freeVouchersProfiles, schedule);
    },

    async toggleFreeSchedule(id, newStatus) {
        this.loading(true);
        try {
            const res = await this.api('toggle_free_voucher_schedule', { id, is_active: newStatus }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message, 'success');
                this.renderFreeVouchers('schedules');
            } else {
                this.toast(res?.error || 'فشل تغيير حالة الجدولة', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast('تعذر الاتصال بالسيرفر لتغيير الحالة', 'danger');
        }
    },

    async deleteFreeSchedule(id) {
        if (!confirm('هل أنت متأكد من حذف هذه الجدولة الدورية نهائياً؟')) return;
        this.loading(true);
        try {
            const res = await this.api('delete_free_voucher_schedule', { id }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message, 'success');
                this.renderFreeVouchers('schedules');
            } else {
                this.toast(res?.error || 'فشل حذف الجدولة', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast('تعذر الاتصال بالسيرفر لحذف الجدولة', 'danger');
        }
    },

    async dispatchScheduledFreeVouchers() {
        if (!confirm('هل ترغب في توليد وصرف الكروت المجانية المجدولة المستحقة الآن لجميع المستفيدين وإرسالها عبر الواتساب؟')) return;
        this.loading(true);
        try {
            const res = await this.api('dispatch_scheduled_free_vouchers', {}, 'POST');
            this.loading(false);
            if (res && res.success) {
                const cnt = res.dispatched_count || (res.items || []).length || 0;
                this.toast(`تم بنجاح توليد وإرسال ${cnt} حصة كروت مجانية دورية عبر الواتساب 🚀`, 'success');
                this.renderFreeVouchers('schedules');
            } else {
                this.toast(res?.error || 'فشل تشغيل الجدولة', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast('تعذر الاتصال بالسيرفر لتشغيل الجدولة', 'danger');
        }
    },

    sendCardsViaWhatsApp(phone, cardsText, recipientName, profileName) {
        phone = (phone || '').replace(/[^0-9]/g, '');
        if (!phone) {
            phone = prompt('يرجى إدخال رقم هاتف المستلم (مع مفتاح الدولة مثلاً 967xxxxxxxxx):');
            if (!phone) return;
            phone = phone.replace(/[^0-9]/g, '');
        }

        const msg = `🌟 مرحباً بك أستاذ: ${recipientName}\n\n🎁 تم تخصيص كروت مجانية لحسابك في شبكتنا:\n\n🎫 رقم الكرت: ${cardsText}\n📦 الباقة: ${profileName}\n\n🌐 نتمنى لك تجربة ممتعة!`;
        const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    },

    sendVoucherViaWhatsApp(card, recipientName, profileName, validity) {
        const phone = prompt('أدخل رقم هاتف المستفيد لإرسال الكرت عبر واتساب:', '');
        if (!phone) return;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const msg = `🌟 مرحباً بك أستاذ: ${recipientName}\n\n🎁 تم تخصيص كرت مجاني لحسابك:\n\n🎫 رقم الكرت: ${card}\n📦 الباقة: ${profileName}\n⏳ الصلاحية: ${validity}\n\n🌐 نتمنى لك تصفحاً ممتعاً!`;
        window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank');
    },

    copyCardsText(cardsText, recipientName, profileName) {
        const text = `🌟 مرحباً بك أستاذ: ${recipientName}\n🎁 كروتك المجانية المخصصة:\n🎫 الكرت: ${cardsText}\n📦 الباقة: ${profileName}`;
        navigator.clipboard.writeText(text).then(() => {
            this.toast('تم نسخ رسالة الكروت للحافظة بنجاح 📋', 'success');
        });
    },

    copyVoucherMessage(card, recipientName, profileName) {
        const text = `🌟 مرحباً بك أستاذ: ${recipientName}\n🎁 كرتك المجاني:\n🎫 الكرت: ${card}\n📦 الباقة: ${profileName}`;
        navigator.clipboard.writeText(text).then(() => {
            this.toast('تم نسخ الكرت للحافظة بنجاح 📋', 'success');
        });
    },

    // ==========================================
    // 7. INTERACTIVE DRILL-DOWN MODAL FOR PORT
    // ==========================================
    async showNodeDetailModal(nasIp, portId) {
        this.openModal(`
            <div style="padding:30px; text-align:center;">
                <i class="fas fa-spinner fa-spin"></i> جاري جلب التقرير الشامل للمنفذ [${portId}]...
            </div>
        `);

        const res = await this.api('get_node_detail_report', { nas: nasIp, port: portId, period: 'all' });
        const data = res || {};
        const summary = data.summary || {};
        const sessions = data.sessions || [];
        const assets = data.assets || [];
        const nodes = data.nodes || [];

        this.openModal(`
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #dfe6e9; padding-bottom:10px; margin-bottom:15px;">
                <div>
                    <span style="font-weight:bold; font-size:17px; color:#2c3e50;">🔍 تقرير تفصيلي شامل: المنفذ [${data.port_id}]</span>
                    <div style="font-size:12px; color:#7f8c8d; margin-top:3px;">الراوتر: <code>${data.nas_ip}</code></div>
                </div>
                <button class="mt-btn" onclick="App.closeModal()">✕ إغلاق</button>
            </div>

            <!-- Mini KPIs -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">
                <div style="background:#f1f2f6; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#7f8c8d;">إجمالي المبيعات</div>
                    <div style="font-size:16px; font-weight:bold; color:#27ae60;">${App.formatMoney(summary.commercial_sales || 0)}</div>
                </div>
                <div style="background:#f1f2f6; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#7f8c8d;">استهلاك الكروت التجارية</div>
                    <div style="font-size:16px; font-weight:bold; color:#2980b9;">${summary.commercial_mb || 0} MB</div>
                </div>
                <div style="background:#f1f2f6; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#7f8c8d;">استهلاك الكروت المجانية</div>
                    <div style="font-size:16px; font-weight:bold; color:#8e44ad;">${summary.free_mb || 0} MB</div>
                </div>
                <div style="background:#f1f2f6; padding:10px; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#7f8c8d;">الأصول والمعدات المنصوبة</div>
                    <div style="font-size:16px; font-weight:bold; color:#e67e22;">${summary.assets_count || 0} أجهزة</div>
                </div>
            </div>

            <!-- Assets on this port -->
            <div style="margin-bottom:15px;">
                <div style="font-weight:bold; font-size:13px; margin-bottom:8px; color:#2c3e50;">📡 الأصول والمعدات الهوائية المنصوبة على هذا المنفذ:</div>
                <div class="mt-table-container" style="max-height:160px; overflow-y:auto;">
                    <table class="mt-table" style="font-size:12px;">
                        <thead>
                            <tr style="background:#f8f9fa;">
                                <th>اسم المعدة / الجهاز</th><th>النوع</th><th>المستلم (العهدة)</th><th>تاريخ الاستلام</th><th>قيمة الشراء</th><th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assets.map(a => `
                                <tr>
                                    <td><b>${a.name}</b> <small>(${a.model || ''})</small></td>
                                    <td>${a.category}</td>
                                    <td><b>${a.responsible_display || '-'}</b></td>
                                    <td><small>${a.handover_date || a.purchase_date || '-'}</small></td>
                                    <td>${App.formatMoney(a.purchase_cost || 0)}</td>
                                    <td><span class="status-pill status-online">${a.status}</span></td>
                                </tr>
                            `).join('')}
                            ${assets.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#95a5a6; padding:10px;">لا توجد معدات مسجلة مربوطة بهذا المنفذ</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Sessions on this port -->
            <div>
                <div style="font-weight:bold; font-size:13px; margin-bottom:8px; color:#2c3e50;">🎫 آخر الجلسات والمشتركين المتصلين من هذا المنفذ:</div>
                <div class="mt-table-container" style="max-height:180px; overflow-y:auto;">
                    <table class="mt-table" style="font-size:12px;">
                        <thead>
                            <tr style="background:#f8f9fa;">
                                <th>الكرت</th><th>نوع الكرت</th><th>المستفيد / المستلم</th><th>الاستهلاك</th><th>المبيعات المحققة</th><th>وقت البدء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sessions.slice(0, 30).map(s => `
                                <tr>
                                    <td><code>${s.username}</code></td>
                                    <td>
                                        <span class="badge" style="background:${s.is_free_quota ? '#8e44ad' : '#27ae60'}; color:#fff; font-size:10px;">
                                            ${s.is_free_quota ? '🎁 مجاني' : '💵 تجاري'}
                                        </span>
                                    </td>
                                    <td>${s.free_recipient_name || '-'}</td>
                                    <td><b>${s.total_mb} MB</b></td>
                                    <td>${s.is_free_quota ? '-' : App.formatMoney(s.calculated_sales)}</td>
                                    <td><small>${s.acctstarttime}</small></td>
                                </tr>
                            `).join('')}
                            ${sessions.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#95a5a6; padding:10px;">لا توجد جلسات مسجلة</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    renderWarehouseSheetInventoryRows() {
        const target = document.getElementById('warehouse-sheet-results');
        const state = this.warehouseSheetInventory;
        if (!target || !state) return;
        const selectedProfile = document.getElementById('warehouse-sheet-profile')?.value || '';
        const rawQuery = (document.getElementById('warehouse-sheet-query')?.value || '').trim();
        const query = rawQuery.replace(/[٠-٩]/g, n => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
            .replace(/[۰-۹]/g, n => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n))).replace(/[–—]/g, '-');
        const ranges = [];
        if (query) {
            for (const term of query.split(/[,،;؛\n]+/).map(value => value.trim())) {
                const match = term.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
                const first = match ? Number(match[1]) : 0;
                const last = match ? Number(match[2] || match[1]) : 0;
                if (!match || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first <= 0 || last < first) {
                    target.innerHTML = '<div style="padding:14px; color:var(--text-muted);" role="status">أدخل رقم ورقة صحيحاً أو نطاقاً تصاعدياً، وافصل بين الأرقام بفاصلة. مثال: 12، 18-20.</div>';
                    return;
                }
                ranges.push([first, last]);
            }
        }
        const count = value => Number(value || 0).toLocaleString();
        let displayedSheets = 0;
        let displayedCards = 0;
        const groups = state.profiles.map((profile, index) => {
            if (selectedProfile !== '' && Number(selectedProfile) !== index) return '';
            const sheets = (profile.sheets || []).filter(sheet => {
                const number = Number(sheet.sheet_no);
                return number > 0 && Number(sheet.remaining_cards || 0) > 0 && (!ranges.length || ranges.some(([first, last]) => number >= first && number <= last));
            }).sort((a, b) => Number(a.sheet_no) - Number(b.sheet_no) || String(a.batch_id || '').localeCompare(String(b.batch_id || ''), undefined, { numeric: true }));
            const unnumbered = ranges.length ? 0 : Number(profile.unnumbered_cards || 0);
            if (!sheets.length && !unnumbered) return '';
            const cards = sheets.reduce((sum, sheet) => sum + Number(sheet.remaining_cards || 0), 0) + unnumbered;
            const partial = sheets.filter(sheet => sheet.is_partial === true || Number(sheet.is_partial) === 1 || Number(sheet.remaining_cards) < Number(sheet.total_cards)).length;
            displayedSheets += sheets.length;
            displayedCards += cards;
            return `<section style="border:1px solid var(--border-color); border-radius:7px; margin-bottom:12px; overflow:hidden;">
                <div style="padding:10px 12px; background:var(--bg-sidebar); display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
                    <b>🏷️ ${this.escapeHtml(profile.profile_label || profile.display_profile || profile.profile_name || 'بدون باقة')}</b>
                    <span style="font-size:12px;">${count(sheets.length)} ورقة · ${count(cards)} كرت متبقٍ · ${count(partial)} ورقة جزئية</span>
                </div>
                ${sheets.length ? `<div class="mt-table-responsive" style="max-height:300px; overflow:auto;">
                    <table class="mt-table" style="width:100%; min-width:620px; font-size:12px; margin:0;">
                        <thead><tr><th>رقم الورقة ↑</th><th>رقم الدفعة</th><th>الكروت المتبقية</th><th>المستهلكة (المفعلة)</th><th>كروت الورقة الأصلية</th><th>نوع المخزون</th><th>الحالة</th></tr></thead>
                        <tbody>${sheets.map(sheet => {
                            const isPartial = sheet.is_partial === true || Number(sheet.is_partial) === 1 || Number(sheet.remaining_cards) < Number(sheet.total_cards);
                            const stockTypeBadge = (Number(sheet.is_sold) === 1 || Number(sheet.available_cards) === 0) 
    ? '<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:10.5px; padding:2px 6px; border-radius:4px;">🛒 مباعة بفاتورة</span>'
    : ((Number(sheet.available_cards) > 0 && Number(sheet.sold_cards) === 0)
        ? '<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:10.5px; padding:2px 6px; border-radius:4px;">📦 عهدة مخزنية</span>'
        : '<span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700; font-size:10.5px; padding:2px 6px; border-radius:4px;">📦 عهدة + مباعة</span>');
return `<tr>
    <td style="font-family:monospace; font-weight:700;" dir="ltr">#${String(Number(sheet.sheet_no)).padStart(6, '0')}</td>
    <td>${this.escapeHtml(String(sheet.batch_id || '—'))}</td>
    <td><b style="color:#0284c7; font-size:13px;">${count(sheet.remaining_cards)}</b></td>
    <td><span style="color:#64748b; font-weight:600;">${count(sheet.used_cards || (Number(sheet.total_cards) - Number(sheet.remaining_cards)))}</span></td>
    <td>${Number(sheet.total_cards) > 0 ? count(sheet.total_cards) : 'غير مسجل'}</td>
    <td>${stockTypeBadge}</td>
    <td><span style="font-size:11px; font-weight:600; color:${isPartial ? '#d97706' : '#16a34a'};">${isPartial ? '◐ مستخدمة جزئياً' : '● كاملة'}</span></td>
</tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>` : ''}
                ${unnumbered ? `<div style="padding:10px 12px; font-size:12px; border-top:1px solid var(--border-color);">📇 ${count(unnumbered)} كرت متبقٍ بدون رقم ورقة؛ تُعرض منفصلة ولا تُحتسب كأوراق مرقمة.</div>` : ''}
            </section>`;
        }).join('');
        target.innerHTML = groups
            ? `<div style="font-size:12px; color:var(--text-muted); margin-bottom:9px;" role="status">المعروض: ${count(displayedSheets)} ورقة مرقمة و${count(displayedCards)} كرت متبقٍ${query ? ' ضمن الأرقام المحددة' : ''}.</div>${groups}`
            : '<div style="text-align:center; padding:30px; color:var(--text-muted);" role="status">لا توجد أوراق أو كروت متبقية مطابقة للعرض.</div>';
    },

    stockReadNext(cursor) {
        const state=this.stockReadPage;
        if(!state||!state.has_more||Number(cursor)!==state.next)return;
        state.stack.push(Number(cursor));this.renderCardWarehouses();
    },
    stockReadPrevious() {
        if(!this.stockReadPage||this.stockReadPage.stack.length<2)return;
        this.stockReadPage.stack.pop();this.renderCardWarehouses();
    },
    renderStockReadPager() {
        const s=this.stockReadPage;if(!s)return '';
        return `<div class="sam-stock-pager" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 0"><button class="mt-btn" ${s.stack.length<2?'disabled':''} onclick="App.stockReadPrevious()">السابق</button><span>الصفحة ${s.stack.length} — ملخص الأعداد والقيم للسجلات الظاهرة فقط</span><button class="mt-btn mt-btn-primary" ${s.has_more?'':'disabled'} onclick="App.stockReadNext(${Number(s.next)||0})">التالي</button></div>`;
    },

    async renderCardWarehouses() {
        const stockNetwork=Number(this.activeNetworkId),stockTab=this.currentTab,stockRevision=this.warehouseRenderRevision=(this.warehouseRenderRevision||0)+1;
        const stockCurrent=()=>Number(this.activeNetworkId)===stockNetwork&&this.currentTab===stockTab&&this.warehouseRenderRevision===stockRevision;
        const pagedStock=['inventories','adjustments'].includes(this.warehousesViewMode);
        const stockKey=JSON.stringify([stockNetwork,this.warehousesViewMode,this.warehousesSearchQuery||'',this.warehousesRoleFilter||'']);
        if(pagedStock&&this.stockReadPage?.key!==stockKey)this.stockReadPage={key:stockKey,stack:[0],next:0,has_more:false};
        const view = document.getElementById('main-view');
        if (view) {
            view.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:260px;padding:32px;"><div role="status" style="padding:18px 24px;border:1px solid #dbeafe;border-radius:12px;background:#eff6ff;color:#1e40af;font-weight:700;">جاري تحميل واجهة المخازن...</div></div>`;
        }
        // تحميل بيانات المخازن مع إعادة محاولة تلقائية لتجاوز حالات انشغال الخادم المؤقت
        // (الاستعلام نفسه سريع؛ الفشل غالباً عابر بسبب ضغط آني على الخادم).
        let data = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const resp = await this.api('get_card_warehouses');
                if (resp === null) {
                    // لا توجد استجابة صالحة (خادم مشغول/انقطاع مؤقت) → أعد المحاولة
                    lastError = new Error('no_response');
                    if (attempt < 3) { await new Promise(r => setTimeout(r, attempt * 1500)); continue; }
                    break;
                }
                if (resp && resp.success === false) {
                    lastError = new Error(resp.error || 'فشل تحميل بيانات المخازن');
                    if (attempt < 3) { await new Promise(r => setTimeout(r, attempt * 1500)); continue; }
                    break;
                }
                data = resp || { warehouses: [], summary: {} };
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
                if (attempt < 3) { await new Promise(r => setTimeout(r, attempt * 1500)); continue; }
            }
        }
        if(!stockCurrent())return;
        if (data === null) {
            console.error('SAM card warehouses load failed:', lastError);
            if (view) {
                view.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:260px;padding:32px;"><div role="alert" style="max-width:520px;text-align:center;padding:22px 26px;border:1px solid #fecaca;border-radius:14px;background:#fff1f2;color:#991b1b;"><strong style="display:block;font-size:16px;margin-bottom:8px;">تعذر تحميل واجهة المخازن</strong><span style="display:block;margin-bottom:15px;">الخادم مشغول مؤقتاً أو انقطع الاتصال. حاولنا التحميل تلقائياً عدة مرات دون نجاح — يرجى إعادة المحاولة بعد لحظات.</span><button class="mt-btn mt-btn-primary" onclick="App.renderCardWarehouses()">إعادة المحاولة</button></div></div>`;
            }
            if (typeof this.toast === 'function') this.toast('تعذر تحميل بيانات المخازن، حاول مرة أخرى', 'warning');
            return;
        }
        const isWarehouseAdministrator = this.isSystemOwner === true || ['system_owner', 'superadmin'].includes(this.userRole);
        const warehouses = data.warehouses || [];
        const summary = data.summary || {};

        const filtered = warehouses.filter(w => {
            if (this.warehousesRoleFilter && w.role !== this.warehousesRoleFilter) return false;
            // Filter out empty warehouses by default unless user toggles showEmpty
            if (!this.warehousesShowEmpty && (Number(w.total_cards) || 0) === 0 && (Number(w.total_sheets) || 0) === 0 && (Number(w.instant_balance) || 0) === 0) return false;
            if (this.warehousesSearchQuery) {
                const q = this.warehousesSearchQuery.toLowerCase();
                const matchName = (w.fullname || '').toLowerCase().includes(q);
                const matchUser = (w.username || '').toLowerCase().includes(q);
                const matchPhone = (w.phone || '').includes(q);
                if (!matchName && !matchUser && !matchPhone) return false;
            }
            return true;
        });

        const roleLabels = {
            system_owner: 'مالك النظام (المخزن الرئيسي)',
            superadmin: 'مدير عام (المخزن الرئيسي)',
            admin: 'مدير نظام',
            supervisor: 'مشرف شبكة',
            distributor: 'موزع رئيسي',
            pos_agent: 'نقطة بيع / محل',
            partner: 'شريك تجاري',
            regular_node_owner: 'مالك برج / عقدة',
            accountant: 'محاسب مالي'
        };

        const roleBadgeColors = {
            system_owner: 'background:#7c2d12; color:#fff;',
            superadmin: 'background:#4338ca; color:#fff;',
            admin: 'background:#2563eb; color:#fff;',
            supervisor: 'background:#0284c7; color:#fff;',
            distributor: 'background:#059669; color:#fff;',
            pos_agent: 'background:#d97706; color:#fff;',
            partner: 'background:#7c3aed; color:#fff;',
            regular_node_owner: 'background:#475569; color:#fff;',
            accountant: 'background:#db2777; color:#fff;'
        };

        let contentHtml = '';

        if (this.warehousesViewMode === 'transfers_log') {
            const typeParam = this.warehousesTypeFilter ? `&type=${encodeURIComponent(this.warehousesTypeFilter)}` : '';
            const roleParam = this.warehousesRoleFilter ? `&role=${encodeURIComponent(this.warehousesRoleFilter)}` : '';
            const searchParam = this.warehousesSearchQuery ? `&search=${encodeURIComponent(this.warehousesSearchQuery.trim())}` : '';
            const qStr = (typeParam || roleParam || searchParam) ? '?' + [typeParam, roleParam, searchParam].filter(Boolean).join('&').replace(/^&/, '') : '';
            const logsRes = await this.api(`get_stock_transfers_log${qStr}`) || { data: [] };
            let logs = logsRes.data || [];

            // Secondary instant filtering in JS
            if (this.warehousesRoleFilter) {
                logs = logs.filter(l => l.sender_role === this.warehousesRoleFilter || l.receiver_role === this.warehousesRoleFilter);
            }
            if (this.warehousesSearchQuery) {
                const q = this.warehousesSearchQuery.toLowerCase().trim();
                logs = logs.filter(l => 
                    String(l.id).includes(q) ||
                    (l.transfer_no && l.transfer_no.toLowerCase().includes(q)) ||
                    (l.sender_name && l.sender_name.toLowerCase().includes(q)) ||
                    (l.sender_username && l.sender_username.toLowerCase().includes(q)) ||
                    (l.receiver_name && l.receiver_name.toLowerCase().includes(q)) ||
                    (l.receiver_username && l.receiver_username.toLowerCase().includes(q)) ||
                    (l.profile_name && l.profile_name.toLowerCase().includes(q)) ||
                    (l.sheet_numbers && l.sheet_numbers.includes(q)) ||
                    (l.notes && l.notes.toLowerCase().includes(q))
                );
            }

            const totalTransfers = logs.length;
            const totalSheets = logs.reduce((sum, l) => sum + (parseInt(l.sheets_count, 10) || 0), 0);
            const totalCards = logs.reduce((sum, l) => sum + (parseInt(l.cards_count, 10) || 0), 0);
            const totalValue = logs.reduce((sum, l) => sum + (parseFloat(l.total_value) || 0), 0);

            const formatSheetNumbersDisplay = (sheetsStr) => {
                if (!sheetsStr) return '-';
                const parts = sheetsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                if (parts.length === 0) return this.escapeHtml(sheetsStr);
                const sorted = [...parts].sort((a, b) => a - b);
                let isConsecutive = true;
                for (let i = 1; i < sorted.length; i++) {
                    if (sorted[i] !== sorted[i-1] + 1) {
                        isConsecutive = false;
                        break;
                    }
                }
                if (sorted.length > 3 && isConsecutive) {
                    return `
                        <span class="status-pill" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; font-family:monospace; font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; cursor:help;" title="${this.escapeHtml(sheetsStr)}">
                            ${sorted[0]} ➔ ${sorted[sorted.length - 1]} 
                            <span style="color:#64748b; font-size:10px; font-weight:normal; margin-right:4px;">(${sorted.length} ورقة)</span>
                        </span>
                    `;
                }
                if (sorted.length <= 5) {
                    return `<span style="font-family:monospace; font-size:11px; font-weight:600; color:var(--text-main);">${this.escapeHtml(sheetsStr)}</span>`;
                }
                return `
                    <div style="max-width:180px; max-height:42px; overflow-y:auto; word-break:break-word; font-family:monospace; font-size:11px; line-height:1.25; background:rgba(0,0,0,0.03); padding:3px 6px; border-radius:4px; border:1px solid var(--border-color);" title="${this.escapeHtml(sheetsStr)}">
                        ${this.escapeHtml(sheetsStr)}
                    </div>
                `;
            };

            contentHtml = `
                <!-- Summary bar for filtered movements -->
                <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; align-items:center; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px;">
                    <span style="font-size:12px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                        📜 ملخص الحركات المعروضة:
                    </span>
                    <span style="background:rgba(99,102,241,0.08); color:var(--primary-color); border:1px solid rgba(99,102,241,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        عدد العمليات: ${totalTransfers}
                    </span>
                    <span style="background:rgba(217,119,6,0.08); color:#b45309; border:1px solid rgba(217,119,6,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        إجمالي الأوراق: ${totalSheets.toLocaleString()}
                    </span>
                    <span style="background:rgba(2,132,199,0.08); color:#0284c7; border:1px solid rgba(2,132,199,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        إجمالي الكروت: ${totalCards.toLocaleString()}
                    </span>
                    <span style="background:rgba(16,185,129,0.08); color:#059669; border:1px solid rgba(16,185,129,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700; margin-right:auto;">
                        القيمة الإجمالية: ${App.formatMoney(totalValue)}
                    </span>
                </div>

                <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; overflow-y:visible; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <table class="mt-table" style="width:100%; min-width:1150px; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-sidebar);">
                                <th style="white-space:nowrap; padding:10px 12px;">رقم المستند</th>
                                <th style="white-space:nowrap; padding:10px 12px; text-align:center;">الحالة والاعتماد</th>
                                <th style="white-space:nowrap; padding:10px 12px;">نوع العملية</th>
                                <th style="white-space:nowrap; padding:10px 12px;">من مخزن (المصدر)</th>
                                <th style="white-space:nowrap; padding:10px 12px;">إلى مخزن (المستلم)</th>
                                <th style="white-space:nowrap; padding:10px 12px;">الباقة</th>
                                <th style="white-space:nowrap; padding:10px 12px; text-align:center;">الأوراق / الكروت</th>
                                <th style="white-space:nowrap; padding:10px 12px;">أرقام الأوراق</th>
                                <th style="white-space:nowrap; padding:10px 12px;">التكلفة والقيمة</th>
                                <th style="white-space:nowrap; padding:10px 12px; text-align:center;">القيد المحاسبي</th>
                                <th style="white-space:nowrap; padding:10px 12px;">التاريخ</th>
                                <th style="white-space:nowrap; padding:10px 12px; text-align:center;">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length > 0 ? logs.map(l => {
                                const isPending = l.status === 'pending_approval';
                                const isPosted = l.status === 'posted';
                                const isRejected = l.status === 'rejected';
                                const canApprove = isPending && (isWarehouseAdministrator || this.currentAdminId === l.target_admin_id);

                                return `
                                <tr style="border-bottom:1px solid var(--border-color); ${isPending ? 'background:#fffbeb;' : ''}">
                                    <td style="white-space:nowrap; font-weight:700;">
                                        <code>#${l.transfer_no || l.id}</code>
                                        ${l.is_immutable ? '<span title="مستند مغلق محاسبياً غير قابل للتعديل أو الحذف" style="color:#64748b; margin-right:4px;">🔒</span>' : ''}
                                    </td>
                                    <td style="white-space:nowrap; text-align:center;">
                                        ${isPending ? '<span class="status-pill" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⏳ بانتظار الاعتماد</span>' :
                                          isPosted ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">✓ معتمد ومنفذ</span>' :
                                          isRejected ? '<span class="status-pill" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">✕ مرفوض</span>' :
                                          `<span class="status-pill" style="background:#f1f5f9; color:#475569; padding:3px 8px; border-radius:6px;">${this.escapeHtml(l.status || 'posted')}</span>`}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        ${l.transfer_type === 'return' ? '<span class="status-pill" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">↩️ إرجاع عهدة</span>' : 
                                          l.transfer_type === 'sale' ? '<span class="status-pill" style="background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">🛒 فاتورة مبيعات</span>' :
                                          l.transfer_type === 'sale_return' ? '<span class="status-pill" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">↩️🛒 مرتجع فاتورة</span>' :
                                          '<span class="status-pill" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">📦 تحويل عهدة</span>'}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        ${l.sender_name ? `<b>${this.escapeHtml(l.sender_name)}</b> <span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px; ${roleBadgeColors[l.sender_role] || 'background:#64748b; color:#fff;'}">${roleLabels[l.sender_role] || l.sender_role}</span>` : `<span style="color:#64748b; font-weight:700;">🏢 المخزن الرئيسي / الإدارة</span>`}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        ${l.receiver_name ? `<b>${this.escapeHtml(l.receiver_name)}</b> <span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px; ${roleBadgeColors[l.receiver_role] || 'background:#64748b; color:#fff;'}">${roleLabels[l.receiver_role] || l.receiver_role}</span>` : `<span style="color:#64748b; font-weight:700;">🛒 نقطة بيع / زبون</span>`}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        <span style="background:rgba(99,102,241,0.1); color:var(--primary-color); padding:3px 8px; border-radius:4px; font-weight:700;">${this.escapeHtml(l.profile_name)}</span>
                                    </td>
                                    <td style="font-weight:bold; text-align:center; white-space:nowrap;">
                                        ${l.sheets_count} ورقة<br/>
                                        <span style="font-size:11px; color:#0284c7;">(${(l.cards_count || 0).toLocaleString()} كرت)</span>
                                    </td>
                                    <td style="white-space:normal;">${formatSheetNumbersDisplay(l.sheet_numbers)}</td>
                                    <td style="white-space:nowrap;">
                                        <div style="font-weight:bold; color:#15803d;">${App.formatMoney(l.total_value)}</div>
                                        ${l.cost_value ? `<div style="font-size:10.5px; color:#64748b;">التكلفة: ${App.formatMoney(l.cost_value)}</div>` : ''}
                                    </td>
                                    <td style="white-space:nowrap; text-align:center;">
                                        ${l.journal_entry_id ? `
                                            <button class="sam-btn sam-btn--xs sam-btn--secondary" style="font-family:monospace; font-weight:700; font-size:11px; padding:2px 8px;" onclick="App.viewMovementJournalEntry(${l.journal_entry_id})" title="عرض تفاصيل القيد المحاسبي المزدوج">
                                                📖 #${l.journal_entry_id}
                                            </button>
                                        ` : '<span style="color:#94a3b8; font-size:11px;">-</span>'}
                                    </td>
                                    <td style="font-size:11px; color:var(--text-muted); white-space:nowrap;" dir="ltr">${l.created_at}</td>
                                    <td style="white-space:nowrap; text-align:center;">
                                        <div style="display:flex; gap:4px; justify-content:center;">
                                            ${canApprove ? `
                                                <button class="sam-btn sam-btn--xs sam-btn--success" style="font-weight:700; padding:3px 8px;" onclick="App.approveStockTransfer(${l.id})" title="اعتماد واستلام العهدة وتأثير الرصيد">✓ اعتماد</button>
                                                <button class="sam-btn sam-btn--xs sam-btn--danger" style="font-weight:700; padding:3px 8px;" onclick="App.rejectStockTransfer(${l.id})" title="رفض أمر التحويل">✕ رفض</button>
                                            ` : ''}
                                            ${!isPending && !l.is_immutable ? `
                                                <button class="sam-btn sam-btn--xs sam-btn--danger" onclick="App.deleteStockTransfer(${l.id})" title="حذف">🗑️</button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('') : `
                                <tr><td colspan="12" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد حركات تحويل أو إرجاع مخزنية مطابقة للبحث أو الرتبة المحددة</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.warehousesViewMode === 'inventories') {
            const invRes = await this.api('get_stock_inventories',{before_id:this.stockReadPage.stack.at(-1)||0,limit:100,search:this.warehousesSearchQuery||'',role_filter:this.warehousesRoleFilter||''}) || { data: [] };
            if(!stockCurrent())return;
            this.stockReadPage.next=Number(invRes.next_cursor)||0;this.stockReadPage.has_more=invRes.has_more===true;
            const inventories = invRes.data || [];

            const totalInv = inventories.length;
            const inProgressInv = inventories.filter(i => i.status === 'in_progress' || i.status === 'draft').length;
            const completedInv = inventories.filter(i => i.status === 'completed').length;
            const totalVarCards = inventories.reduce((sum, i) => sum + (parseInt(i.total_variance_cards, 10) || 0), 0);

            contentHtml = `
                <!-- Summary bar for Stock Inventories -->
                <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; align-items:center; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px;">
                    <span style="font-size:12px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                        📋 إحصائيات الجرد الدوري والمفاجئ:
                    </span>
                    <span style="background:rgba(99,102,241,0.08); color:var(--primary-color); border:1px solid rgba(99,102,241,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        إجمالي الجلسات: ${totalInv}
                    </span>
                    <span style="background:rgba(217,119,6,0.08); color:#b45309; border:1px solid rgba(217,119,6,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        قيد الجرد والعد: ${inProgressInv}
                    </span>
                    <span style="background:rgba(16,185,129,0.08); color:#059669; border:1px solid rgba(16,185,129,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        مكتملة ومرحلة محاسبياً: ${completedInv}
                    </span>
                    <span style="background:${totalVarCards !== 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'}; color:${totalVarCards !== 0 ? '#dc2626' : '#059669'}; border:1px solid ${totalVarCards !== 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}; padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700; margin-right:auto;">
                        صافي فروقات الكروت: ${totalVarCards.toLocaleString()}
                    </span>
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" onclick="App.showStartStockInventoryModal()">
                        ➕ بدء جلسة جرد جديدة
                    </button>
                </div>

                <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <table class="mt-table" style="width:100%; min-width:1050px; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-sidebar);">
                                <th style="padding:10px 12px;">رقم الجلسة</th>
                                <th style="padding:10px 12px;">المخزن الخاضع للجرد</th>
                                <th style="padding:10px 12px; text-align:center;">الحالة</th>
                                <th style="padding:10px 12px; text-align:center;">الرصيد الدفتري</th>
                                <th style="padding:10px 12px; text-align:center;">العد الفعلي</th>
                                <th style="padding:10px 12px; text-align:center;">الفارق (عجز/فائض)</th>
                                <th style="padding:10px 12px; text-align:right;">قيمة التسوية المالية</th>
                                <th style="padding:10px 12px;">تاريخ البدء</th>
                                <th style="padding:10px 12px;">القائم بالجرد</th>
                                <th style="padding:10px 12px; text-align:center;">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inventories.length > 0 ? inventories.map(inv => {
                                const isComp = inv.status === 'completed';
                                const varCards = parseInt(inv.total_variance_cards, 10) || 0;
                                const varVal = parseFloat(inv.total_cost_variance) || 0;

                                return `
                                    <tr style="border-bottom:1px solid var(--border-color);">
                                        <td style="font-weight:700; white-space:nowrap;"><code>#${inv.inventory_no || inv.id}</code></td>
                                        <td style="white-space:nowrap;">
                                            <b>${this.escapeHtml(inv.warehouse_name)}</b>
                                            <div style="font-size:11px; color:var(--text-muted);">@${this.escapeHtml(inv.warehouse_username)}</div>
                                        </td>
                                        <td style="text-align:center; white-space:nowrap;">
                                            ${isComp ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">✓ مكتمل ومسوى</span>' :
                                              inv.status === 'in_progress' ? '<span class="status-pill" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⏳ قيد العد</span>' :
                                              '<span class="status-pill" style="background:#f1f5f9; color:#475569; padding:3px 8px; border-radius:6px;">مسودة</span>'}
                                        </td>
                                        <td style="text-align:center; font-weight:700; color:#3b82f6;">${(inv.total_book_cards || 0).toLocaleString()} كرت</td>
                                        <td style="text-align:center; font-weight:700; color:#0f172a;">${(inv.total_actual_cards || 0).toLocaleString()} كرت</td>
                                        <td style="text-align:center; font-weight:700;">
                                            ${varCards === 0 ? '<span style="color:#15803d;">✔️ 0</span>' :
                                              varCards > 0 ? `<span style="color:#2563eb;">🔺 +${varCards.toLocaleString()}</span>` :
                                              `<span style="color:#dc2626;">🔻 ${varCards.toLocaleString()}</span>`}
                                        </td>
                                        <td style="text-align:right; font-weight:700; color:${varVal < 0 ? '#dc2626' : (varVal > 0 ? '#2563eb' : '#15803d')};">
                                            ${varVal === 0 ? '0.00' : (varVal > 0 ? `+${App.formatMoney(varVal)}` : App.formatMoney(varVal))}
                                        </td>
                                        <td style="font-size:11px; color:var(--text-muted); white-space:nowrap;" dir="ltr">${inv.started_at || inv.created_at}</td>
                                        <td style="font-size:11px; white-space:nowrap;">${this.escapeHtml(inv.creator_name || '-')}</td>
                                        <td style="text-align:center; white-space:nowrap;">
                                            <div style="display:flex; gap:4px; justify-content:center;">
                                                <button class="sam-btn sam-btn--xs sam-btn--primary" onclick="App.showStockInventorySheetModal(${inv.id})">
                                                    ${isComp ? '👁️ عرض التفاصيل' : '✏️ استمارة الجرد'}
                                                </button>
                                                ${!isComp ? `
                                                    <button class="sam-btn sam-btn--xs sam-btn--success" onclick="App.postStockInventoryAdjustmentConfirmed(${inv.id})" title="اعتماد وتسوية الجرد وترحيل القيد المحاسبي">
                                                        ⚖️ اعتماد وتسوية
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : `
                                <tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد جلسات جرد مخزني سابقة. اضغط على زر "بدء جلسة جرد جديدة" للبدء.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.warehousesViewMode === 'adjustments') {
            const adjRes = await this.api('get_stock_adjustments',{before_id:this.stockReadPage.stack.at(-1)||0,limit:100,search:this.warehousesSearchQuery||'',role_filter:this.warehousesRoleFilter||''}) || { data: [] };
            if(!stockCurrent())return;
            this.stockReadPage.next=Number(adjRes.next_cursor)||0;this.stockReadPage.has_more=adjRes.has_more===true;
            const adjustments = adjRes.data || [];

            const totalAdj = adjustments.length;
            const totalLossAdj = adjustments.filter(a => ['deficit','damaged','lost'].includes(a.adjustment_type)).length;
            const totalSurplusAdj = adjustments.filter(a => a.adjustment_type === 'surplus').length;
            const totalAdjCost = adjustments.reduce((sum, a) => sum + (parseFloat(a.cost_value) || 0), 0);

            const adjTypeLabels = {
                deficit:'عجز',damaged:'تالف',lost:'مفقود',surplus:'فائض',
                damage_loss: '<span class="status-pill" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">🔻 إتلاف / عجز كروت</span>',
                surplus_found: '<span class="status-pill" style="background:#dbeafe; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">🔺 فائض جردي</span>',
                inventory_variance: '<span class="status-pill" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⚖️ تسوية دورية لجلسة جرد</span>',
                correction: '<span class="status-pill" style="background:#f1f5f9; color:#475569; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⚙️ تسوية تصحيحية</span>'
            };

            contentHtml = `
                <!-- Summary bar for Stock Adjustments -->
                <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; align-items:center; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px;">
                    <span style="font-size:12px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                        ⚖️ ملخص التسويات والإتلاف:
                    </span>
                    <span style="background:rgba(99,102,241,0.08); color:var(--primary-color); border:1px solid rgba(99,102,241,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        إجمالي التسويات: ${totalAdj}
                    </span>
                    <span style="background:rgba(239,68,68,0.08); color:#dc2626; border:1px solid rgba(239,68,68,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        سندات إتلاف وعجز: ${totalLossAdj}
                    </span>
                    <span style="background:rgba(37,99,235,0.08); color:#2563eb; border:1px solid rgba(37,99,235,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                        سندات فائض: ${totalSurplusAdj}
                    </span>
                    <span style="background:rgba(16,185,129,0.08); color:#059669; border:1px solid rgba(16,185,129,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700; margin-right:auto;">
                        إجمالي القيمة: ${App.formatMoney(totalAdjCost)}
                    </span>
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--warning" onclick="App.showDirectStockAdjustmentModal()">
                        ➕ تسوية جردية / إتلاف مباشر
                    </button>
                </div>

                <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <table class="mt-table" style="width:100%; min-width:1050px; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-sidebar);">
                                <th style="padding:10px 12px;">رقم السند</th>
                                <th style="padding:10px 12px;">المخزن</th>
                                <th style="padding:10px 12px;">نوع التسوية</th>
                                <th style="padding:10px 12px; text-align:center;">إجمالي الكمية (كروت)</th>
                                <th style="padding:10px 12px; text-align:right;">القيمة المحاسبية</th>
                                <th style="padding:10px 12px; text-align:center;">القيد المحاسبي</th>
                                <th style="padding:10px 12px;">التاريخ</th>
                                <th style="padding:10px 12px;">المحاسب / المنفذ</th>
                                <th style="padding:10px 12px;">البيان والملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${adjustments.length > 0 ? adjustments.map(adj => `
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <td style="font-weight:700; white-space:nowrap;">
                                        <code>#${adj.adjustment_no || adj.id}</code>
                                        ${Number(adj.is_immutable)===1?'<span title="مستند مرحّل ومقفل">🔒</span>':'<span>مسودة / غير مقفل</span>'}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        <b>${this.escapeHtml(adj.warehouse_name)}</b>
                                        <div style="font-size:11px; color:var(--text-muted);">@${this.escapeHtml(adj.warehouse_username)}</div>
                                    </td>
                                    <td style="white-space:nowrap;">
                                        ${adjTypeLabels[adj.adjustment_type] || this.escapeHtml(adj.adjustment_type)}
                                    </td>
                                    <td style="text-align:center; font-weight:700; color:#4338ca;">
                                        ${(Number(adj.total_cards) || 0).toLocaleString()} كرت
                                    </td>
                                    <td style="text-align:right; font-weight:700; color:#059669;">
                                        ${App.formatMoney(adj.cost_value || 0)}
                                    </td>
                                    <td style="text-align:center; white-space:nowrap;">
                                        ${adj.journal_entry_id ? `
                                            <button class="sam-btn sam-btn--xs sam-btn--secondary" style="font-family:monospace; font-weight:700; font-size:11px; padding:2px 8px;" onclick="App.viewMovementJournalEntry(${adj.journal_entry_id})" title="عرض تفاصيل القيد المحاسبي المزدوج">
                                                📖 #${adj.journal_entry_id}
                                            </button>
                                        ` : '<span style="color:#94a3b8;">-</span>'}
                                    </td>
                                    <td style="font-size:11px; color:var(--text-muted); white-space:nowrap;" dir="ltr">${adj.created_at}</td>
                                    <td style="font-size:11px; white-space:nowrap;">${this.escapeHtml(adj.creator_name || '-')}</td>
                                    <td style="font-size:11px; color:var(--text-muted); max-width:180px; white-space:normal;">${this.escapeHtml(adj.reason || '-')}</td>
                                </tr>
                            `).join('') : `
                                <tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد سندات تسوية جردية مسجلة</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.warehousesViewMode === 'reports') {
            const currentReport = this.warehousesReportType || 'valuation';
            const repRes = await this.api(`get_inventory_reports?report_type=${currentReport}`) || { data: {} };
            const repData = repRes.data || {};

            const reportNavBtns = `
                <div style="display:inline-flex; border:1px solid var(--sam-border-strong); border-radius:var(--sam-radius-sm); overflow:hidden; margin-bottom:14px;">
                    <button type="button" class="sam-btn sam-btn--sm ${currentReport === 'valuation' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesReportType='valuation'; App.renderCardWarehouses();">📊 تقييم وتكلفة المخزون</button>
                    <button type="button" class="sam-btn sam-btn--sm ${currentReport === 'custody_aging' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesReportType='custody_aging'; App.renderCardWarehouses();">⏳ تقرير أعمار العهد والركود</button>
                    <button type="button" class="sam-btn sam-btn--sm ${currentReport === 'transfers_audit' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesReportType='transfers_audit'; App.renderCardWarehouses();">📜 سجل تدقيق الحركات</button>
                </div>
            `;

            if (currentReport === 'valuation') {
                const rows = repData.valuation || [];
                const totCost = repData.total_cost_value || 0;
                const totRetail = repData.total_retail_value || 0;
                const totProfit = repData.projected_profit || 0;
                const totCards = repData.total_cards || 0;

                contentHtml = `
                    ${reportNavBtns}
                    <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; align-items:center; background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px;">
                        <span style="background:rgba(99,102,241,0.08); color:var(--primary-color); border:1px solid rgba(99,102,241,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                            إجمالي الكروت المتاحة: ${totCards.toLocaleString()}
                        </span>
                        <span style="background:rgba(2,132,199,0.08); color:#0284c7; border:1px solid rgba(2,132,199,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                            القيمة بالتكلفة: ${App.formatMoney(totCost)}
                        </span>
                        <span style="background:rgba(16,185,129,0.08); color:#059669; border:1px solid rgba(16,185,129,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700;">
                            القيمة بالبيع: ${App.formatMoney(totRetail)}
                        </span>
                        <span style="background:rgba(217,119,6,0.08); color:#b45309; border:1px solid rgba(217,119,6,0.2); padding:3px 10px; border-radius:6px; font-size:12px; font-weight:700; margin-right:auto;">
                            هامش الربح المتوقع: ${App.formatMoney(totProfit)}
                        </span>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="window.print()">🖨️ طباعة التقرير</button>
                    </div>

                    <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <table class="mt-table" style="width:100%; min-width:1050px; border-collapse:collapse;">
                            <thead>
                                <tr style="background:var(--bg-sidebar);">
                                    <th style="padding:10px 12px;">الباقة / الصنف</th>
                                    <th style="padding:10px 12px;">المخزن / الحساب</th>
                                    <th style="padding:10px 12px; text-align:center;">الكروت المتاحة</th>
                                    <th style="padding:10px 12px; text-align:center;">الأوراق</th>
                                    <th style="padding:10px 12px; text-align:right;">تكلفة الوحدة</th>
                                    <th style="padding:10px 12px; text-align:right;">سعر البيع</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي التكلفة</th>
                                    <th style="padding:10px 12px; text-align:right;">إجمالي البيع</th>
                                    <th style="padding:10px 12px; text-align:right;">الربح المتوقع</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows.map(r => `
                                    <tr style="border-bottom:1px solid var(--border-color);">
                                        <td style="font-weight:700;"><b>${this.escapeHtml(r.profile_name)}</b></td>
                                        <td>
                                            ${this.escapeHtml(r.fullname)}
                                            <span style="font-size:10.5px; color:var(--text-muted);">(@${this.escapeHtml(r.username)})</span>
                                        </td>
                                        <td style="text-align:center; font-weight:700; color:#2563eb;">${(r.unsold_cards || 0).toLocaleString()}</td>
                                        <td style="text-align:center; font-weight:700;">${(r.unsold_sheets || 0).toLocaleString()}</td>
                                        <td style="text-align:right; font-family:monospace;">${App.formatMoney(r.cost_price || 0)}</td>
                                        <td style="text-align:right; font-family:monospace;">${App.formatMoney(r.retail_price || 0)}</td>
                                        <td style="text-align:right; font-weight:700; color:#0284c7;">${App.formatMoney(r.cost_value || 0)}</td>
                                        <td style="text-align:right; font-weight:700; color:#059669;">${App.formatMoney(r.retail_value || 0)}</td>
                                        <td style="text-align:right; font-weight:700; color:#b45309;">${App.formatMoney((r.retail_value || 0) - (r.cost_value || 0))}</td>
                                    </tr>
                                `).join('') : `
                                    <tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد بيانات تقييم مخزون متاحة</td></tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
            } else if (currentReport === 'custody_aging') {
                const rows = repData.aging || [];
                contentHtml = `
                    ${reportNavBtns}
                    <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <table class="mt-table" style="width:100%; min-width:950px; border-collapse:collapse;">
                            <thead>
                                <tr style="background:var(--bg-sidebar);">
                                    <th style="padding:10px 12px;">المسؤول / أمين العهدة</th>
                                    <th style="padding:10px 12px;">الرتبة</th>
                                    <th style="padding:10px 12px; text-align:center;">الكروت المتبقية</th>
                                    <th style="padding:10px 12px; text-align:right;">القيمة المالية</th>
                                    <th style="padding:10px 12px;">آخر حركة استلام</th>
                                    <th style="padding:10px 12px; text-align:center;">أيام الركود</th>
                                    <th style="padding:10px 12px; text-align:center;">تصنيف العمر</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows.map(r => {
                                    const days = parseInt(r.days_since_last_movement, 10) || 0;
                                    const ageBucket = days <= 30 ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; font-weight:700; padding:2px 8px; border-radius:6px;">🟢 نشط حديثاً (&lt;30 يوم)</span>' :
                                                      days <= 60 ? '<span class="status-pill" style="background:#fef3c7; color:#b45309; font-weight:700; padding:2px 8px; border-radius:6px;">🟡 راكد متوسط (30-60 يوم)</span>' :
                                                      days <= 90 ? '<span class="status-pill" style="background:#fee2e2; color:#dc2626; font-weight:700; padding:2px 8px; border-radius:6px;">🟠 راكد مرتفع (60-90 يوم)</span>' :
                                                      '<span class="status-pill" style="background:#450a0a; color:#fee2e2; font-weight:700; padding:2px 8px; border-radius:6px;">🔴 مجمد / خطر (&gt;90 يوم)</span>';

                                    return `
                                        <tr style="border-bottom:1px solid var(--border-color);">
                                            <td style="font-weight:700;">
                                                <b>${this.escapeHtml(r.fullname)}</b>
                                                <div style="font-size:11px; color:var(--text-muted);">@${this.escapeHtml(r.username)}</div>
                                            </td>
                                            <td>
                                                <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:12px; ${roleBadgeColors[r.role] || 'background:#64748b; color:#fff;'}">
                                                    ${roleLabels[r.role] || r.role}
                                                </span>
                                            </td>
                                            <td style="text-align:center; font-weight:700; color:#2563eb;">${(r.total_cards || 0).toLocaleString()} كرت</td>
                                            <td style="text-align:right; font-weight:700; color:#059669;">${App.formatMoney(r.total_value || 0)}</td>
                                            <td style="font-size:11px; color:var(--text-muted);" dir="ltr">${r.last_transfer_date || 'لا توجد حركات'}</td>
                                            <td style="text-align:center; font-weight:700;">${days} يوم</td>
                                            <td style="text-align:center;">${ageBucket}</td>
                                        </tr>
                                    `;
                                }).join('') : `
                                    <tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد عهد نشطة حالياً</td></tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                // Transfers Audit
                const rows = repData.transfers || [];
                contentHtml = `
                    ${reportNavBtns}
                    <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow-x:auto; width:100%; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                        <table class="mt-table" style="width:100%; min-width:1100px; border-collapse:collapse;">
                            <thead>
                                <tr style="background:var(--bg-sidebar);">
                                    <th style="padding:10px 12px;">المعرف</th>
                                    <th style="padding:10px 12px;">نوع الحركة</th>
                                    <th style="padding:10px 12px;">المصدر</th>
                                    <th style="padding:10px 12px;">المستلم</th>
                                    <th style="padding:10px 12px;">الباقة</th>
                                    <th style="padding:10px 12px; text-align:center;">الأوراق / الكروت</th>
                                    <th style="padding:10px 12px; text-align:right;">القيمة</th>
                                    <th style="padding:10px 12px; text-align:center;">القيد المحاسبي</th>
                                    <th style="padding:10px 12px; text-align:center;">الحالة</th>
                                    <th style="padding:10px 12px;">التاريخ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows.map(r => `
                                    <tr style="border-bottom:1px solid var(--border-color);">
                                        <td style="font-weight:700;"><code>#${r.id}</code></td>
                                        <td>${this.escapeHtml(r.transfer_type)}</td>
                                        <td>${this.escapeHtml(r.sender_name || 'المخزن الرئيسي')}</td>
                                        <td>${this.escapeHtml(r.receiver_name || '-')}</td>
                                        <td><b>${this.escapeHtml(r.profile_name)}</b></td>
                                        <td style="text-align:center; font-weight:700;">${r.sheets_count} ورقة (${(r.cards_count || 0).toLocaleString()} كرت)</td>
                                        <td style="text-align:right; font-weight:700; color:#059669;">${App.formatMoney(r.total_value)}</td>
                                        <td style="text-align:center; font-family:monospace; font-weight:700;">
                                            ${r.journal_entry_id ? `
                                                <button class="sam-btn sam-btn--xs sam-btn--secondary" onclick="App.viewMovementJournalEntry(${r.journal_entry_id})">
                                                    📖 #${r.journal_entry_id}
                                                </button>
                                            ` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            ${r.status === 'posted' ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; font-weight:700; padding:2px 8px; border-radius:6px;">🔒 معتمد</span>' :
                                              r.status === 'pending_approval' ? '<span class="status-pill" style="background:#fef3c7; color:#b45309; font-weight:700; padding:2px 8px; border-radius:6px;">⏳ معلق</span>' :
                                              this.escapeHtml(r.status || 'posted')}
                                        </td>
                                        <td style="font-size:11px; color:var(--text-muted);" dir="ltr">${r.created_at}</td>
                                    </tr>
                                `).join('') : `
                                    <tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد حركات مطابقة</td></tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        } else if (this.warehousesViewMode === 'table') {
            contentHtml = `
                <div class="mt-table-responsive" style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow:hidden;">
                    <table class="mt-table">
                        <thead>
                            <tr style="background:var(--bg-sidebar);">
                                <th>المخزن / الحساب</th>
                                <th>الرتبة</th>
                                <th>الهاتف</th>
                                <th>الكروت المتاحة للبيع</th>
                                <th>الأوراق المتاحة للبيع</th>
                                <th>القيمة المالية للمخزون</th><th>الرصيد الفوري المتبقي</th>
                                <th>تفصيل الباقات بالمخزن</th>
                                <th>المديونية الحالية</th>
                                <th>إجراءات المخزن</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.length > 0 ? filtered.map(w => `
                                <tr>
                                    <td>
                                        <div style="font-weight:bold; font-size:13px;">${this.escapeHtml(w.fullname)}</div>
                                        <div style="font-size:11px; color:var(--text-muted);">@${this.escapeHtml(w.username)}</div>
                                    </td>
                                    <td>
                                        <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:12px; ${roleBadgeColors[w.role] || 'background:#64748b; color:#fff;'}">
                                            ${roleLabels[w.role] || w.role}
                                        </span>
                                    </td>
                                    <td style="font-family:monospace; font-size:11px;">${this.escapeHtml(w.phone || '-')}</td>
                                    <td style="font-weight:bold; font-size:14px; text-align:center; color:#4f46e5;">${(w.total_cards || 0).toLocaleString()}</td>
                                    <td style="font-weight:bold; font-size:13px; text-align:center;">${(w.total_sheets || 0).toLocaleString()}</td>
                                    <td style="font-weight:bold; font-size:13px; color:#27ae60;">${App.formatMoney(w.total_stock_value || 0)}</td><td style="font-weight:bold; font-size:13px; color:#0369a1;">${App.formatMoney(w.instant_balance || 0)}</td>
                                    <td>
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            ${(w.remaining_profiles || w.profiles_stock || []).length > 0 ? (w.remaining_profiles || w.profiles_stock || []).map(ps => `
                                                <div style="font-size:11px; background:#f8fafc; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px;">
                                                    <div style="display:flex; justify-content:space-between; gap:6px;">
                                                        <b style="color:#0369a1;">${this.escapeHtml(ps.profile_label || ps.display_profile || ps.profile_name)}:</b>
                                                        <span>${(ps.total_cards ?? ps.unsold_cards).toLocaleString()} كرت (${(ps.total_sheets ?? ps.unsold_sheets).toLocaleString()} ورقة)</span>
                                                    </div>
                                                    <div style="font-size:10px; color:#475569; margin-top:2px;">${this.warehouseSheetNumbersPreview(ps)}</div>
                                                </div>
                                            `).join('') : '<span style="font-size:11px; color:var(--text-muted);">مخزن فارغ</span>'}
                                        </div>
                                    </td>
                                    <td style="font-weight:bold; color:${(w.balance||0)>0?'#e74c3c':'#27ae60'};">${App.formatMoney(w.balance || 0)}</td>
                                    <td>
                                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                                            <button class="mt-btn" style="padding:3px 7px; font-size:11px;" onclick="App.showWarehouseSheetInventory(${w.id})" title="عرض الأوراق المتبقية غير المستخدمة وتجميعها حسب الباقة">📑 الأوراق المتبقية${w.remaining_sheets !== undefined ? ` (${Number(w.remaining_sheets).toLocaleString()})` : ''}</button>
                                            ${(this.can('warehouse_stock_transfer') && (w.unsold_cards || 0) > 0) ? `<button class="mt-btn mt-btn-primary" style="padding:3px 7px; font-size:11px;" onclick="App.showStockTransferModal(${w.id})" title="تحويل عهدة كروت من هذا المخزن">📦 تحويل عهدة</button>` : ''}
                                            ${(this.can('warehouse_stock_return') && w.id !== 1 && (w.unsold_cards || 0) > 0) ? `<button class="mt-btn mt-btn-warning" style="padding:3px 7px; font-size:11px;" onclick="App.showStockReturnModal(${w.id})" title="إرجاع عهدة كروت للإدارة وتخفيض المديونية">↩️ إرجاع عهدة</button>` : ''}
                                            ${((w.unsold_cards || 0) === 0 && (w.sold_cards || 0) > 0) ? `<span style="font-size:10.5px; font-weight:700; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 6px; border-radius:4px;" title="كروت مباعة بفاتورة بيع - تتبع الرصيد والاستهلاك فقط">🛒 مباعة بفاتورة</span>` : ''}
                                            <button class="mt-btn" style="padding:3px 7px; font-size:11px;" onclick="App.printWarehouseAuditReport(${w.id})" title="طباعة محضر جرد رسمي">🖨️ جرد</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted);">لا توجد مخازن مطابقة للبحث</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // Grid Cards Mode (Ultra-Clear High-Contrast Design)
            contentHtml = `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:18px;">
                    ${filtered.length > 0 ? filtered.map(w => `
                        <div style="background:var(--bg-window, #ffffff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; overflow:hidden; transition:transform 0.15s, box-shadow 0.15s;">
                            <!-- Warehouse Header -->
                            <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#ffffff; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155;">
                                <div>
                                    <div style="font-weight:800; font-size:14px; color:#ffffff; display:flex; align-items:center; gap:6px;">
                                        <span>🏢</span>
                                        <span>${this.escapeHtml(w.fullname)}</span>
                                    </div>
                                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                                        @${this.escapeHtml(w.username)} ${w.phone ? `· 📞 ${this.escapeHtml(w.phone)}` : ''}
                                    </div>
                                </div>
                                <span style="font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; box-shadow:0 2px 4px rgba(0,0,0,0.25); ${roleBadgeColors[w.role] || 'background:#64748b; color:#fff;'}">
                                    ${roleLabels[w.role] || w.role}
                                </span>
                            </div>

                            <!-- Key Metrics Grid (Separated Custody vs Sold) -->
                            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; padding:10px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:center;">
                                <div style="background:#ffffff; padding:6px 4px; border-radius:6px; border:1px solid #bbf7d0; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                                    <div style="font-size:10.5px; font-weight:700; color:#15803d; margin-bottom:2px;">📦 كروت العهدة</div>
                                    <div style="font-size:14px; font-weight:900; color:#166534;">${(w.custody_cards || w.unsold_cards || 0).toLocaleString()}</div>
                                    <div style="font-size:9.5px; color:#15803d; font-weight:600;">${(w.custody_sheets || 0).toLocaleString()} ورقة</div>
                                </div>
                                <div style="background:#ffffff; padding:6px 4px; border-radius:6px; border:1px solid #fde68a; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                                    <div style="font-size:10.5px; font-weight:700; color:#b45309; margin-bottom:2px;">🛒 كروت مباعة</div>
                                    <div style="font-size:14px; font-weight:900; color:#92400e;">${(w.sold_cards || 0).toLocaleString()}</div>
                                    <div style="font-size:9.5px; color:#b45309; font-weight:600;">${(w.sold_sheets || 0).toLocaleString()} ورقة</div>
                                </div>
                                <div style="background:#ffffff; padding:6px 4px; border-radius:6px; border:1px solid #bae6fd; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                                    <div style="font-size:10.5px; font-weight:700; color:#0369a1; margin-bottom:2px;">⚡ رصيد فوري عهدة</div>
                                    <div style="font-size:12px; font-weight:800; color:#0284c7; margin-top:3px;">${App.formatMoney(w.custody_balance || 0)}</div>
                                </div>
                                <div style="background:#ffffff; padding:6px 4px; border-radius:6px; border:1px solid #ddd6fe; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                                    <div style="font-size:10.5px; font-weight:700; color:#6d28d9; margin-bottom:2px;">💳 رصيد مشتريات</div>
                                    <div style="font-size:12px; font-weight:800; color:#7c3aed; margin-top:3px;">${App.formatMoney(w.sold_balance || 0)}</div>
                                </div>
                            </div>

                            <!-- Stock Breakdown per Package -->
                            <div style="padding:12px 16px; flex:1; overflow-y:auto; max-height:260px; background:#ffffff;">
                                <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                                    <span>📦 الأوراق المتبقية حسب الباقة:</span>
                                    <span style="background:#e2e8f0; color:#475569; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;">${(w.remaining_profiles || w.profiles_stock || []).length} باقات</span>
                                </div>
                                ${(w.remaining_profiles || w.profiles_stock || []).length > 0 ? `
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        ${(w.remaining_profiles || w.profiles_stock || []).map(ps => `
                                            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:6px; flex-wrap:wrap;">
                                                    <b style="color:#0f172a; font-size:13px; font-weight:800;">🏷️ ${this.escapeHtml(ps.profile_label || ps.display_profile || ps.profile_name)}</b>
                                                    <span style="font-weight:700; font-size:11.5px; background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1;">
                                                        إجمالي: ${(ps.total_cards || 0).toLocaleString()} كرت · ${(ps.total_sheets || 0).toLocaleString()} ورقة
                                                    </span>
                                                </div>
                                                <div style="display:flex; flex-direction:column; gap:6px; font-size:11px;">
                                                    <!-- Custody Sheets Section -->
                                                    ${((ps.custody_cards || ps.unsold_cards || 0) > 0 || (ps.custody_sheets || ps.unsold_sheets || 0) > 0) ? `
                                                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 8px;">
                                                            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; color:#15803d; font-size:11px; margin-bottom:2px;">
                                                                <span>📦 كروت العهدة المخزنية (غير مباعة):</span>
                                                                <span style="background:#dcfce7; color:#166534; padding:1px 6px; border-radius:4px;">${(ps.custody_cards || ps.unsold_cards || 0).toLocaleString()} كرت (${(ps.custody_sheets || ps.unsold_sheets || 0).toLocaleString()} ورقة)</span>
                                                            </div>
                                                            <div style="font-family:monospace; font-size:10.5px; color:#166534; word-break:break-word;">
                                                                📄 أوراق العهدة: <b>${ps.custody_sheet_ranges || (ps.custody_sheet_numbers && ps.custody_sheet_numbers.length ? ps.custody_sheet_numbers.join(', ') : '-')}</b>
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                    <!-- Sold by Invoice Section -->
                                                    ${((ps.sold_cards || 0) > 0 || (ps.sold_sheets || 0) > 0) ? `
                                                        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:6px 8px;">
                                                            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; color:#b45309; font-size:11px; margin-bottom:2px;">
                                                                <span>🛒 كروت مباعة بفاتورة (مشتراة للموزع):</span>
                                                                <span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px;">${(ps.sold_cards || 0).toLocaleString()} كرت (${(ps.sold_sheets || 0).toLocaleString()} ورقة)</span>
                                                            </div>
                                                            <div style="font-family:monospace; font-size:10.5px; color:#92400e; word-break:break-word;">
                                                                📄 أوراق الفاتورة: <b>${ps.sold_sheet_ranges || (ps.sold_sheet_numbers && ps.sold_sheet_numbers.length ? ps.sold_sheet_numbers.join(', ') : '-')}</b>
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div style="text-align:center; padding:25px 10px; color:#94a3b8; font-size:12px; background:#f8fafc; border-radius:6px; border:1px dashed #cbd5e1;">
                                        📭 لا توجد كروت غير مستخدمة وسارية متبقية في هذا المخزن حالياً
                                    </div>
                                `}
                            </div>

                            <!-- Card Footer Actions -->
                            <div style="padding:10px 14px; border-top:1px solid #e2e8f0; background:#f8fafc;">
                                <button class="mt-btn" style="width:100%; padding:8px; display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #cbd5e1; font-size:12px;" onclick="App.showWarehouseSheetInventory(${w.id})">
                                    <b style="color:#0f172a;">📑 كشف الأوراق المتبقية بتسلسل الباقات</b>
                                    <span style="background:#e0e7ff; color:#4338ca; padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px;">${w.remaining_sheets !== undefined ? `${Number(w.remaining_sheets).toLocaleString()} ورقة` : 'عرض التفاصيل'}</span>
                                </button>
                            </div>
                            <div style="padding:10px 14px; background:#f1f5f9; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                                <div style="font-size:12px;">
                                    <span style="color:#64748b; font-weight:600;">المديونية: </span>
                                    <b style="color:${(w.balance||0)>0?'#dc2626':'#16a34a'}; font-size:13px;">${App.formatMoney(w.balance || 0)}</b>
                                </div>
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    ${(this.can('warehouse_stock_transfer') && (w.unsold_cards || 0) > 0) ? `
                                    <button class="mt-btn mt-btn-primary" style="padding:4px 10px; font-size:11px; font-weight:700;" onclick="App.showStockTransferModal(${w.id})" title="تحويل عهدة كروت من هذا المخزن إلى مخزن آخر">
                                        📦 تحويل عهدة
                                    </button>` : ''}
                                    ${(this.can('warehouse_stock_return') && w.id !== 1 && (w.unsold_cards || 0) > 0) ? `
                                        <button class="mt-btn mt-btn-warning" style="padding:4px 10px; font-size:11px; font-weight:700;" onclick="App.showStockReturnModal(${w.id})" title="إرجاع عهدة كروت إلى المخزن المركزي وتخفيض مديونية الحساب">
                                            ↩️ إرجاع عهدة
                                        </button>
                                    ` : ''}
                                    ${(w.role === 'pos_agent' || ((w.unsold_cards || 0) === 0 && (w.sold_cards || 0) > 0)) ? `
                                        <span style="font-size:11px; font-weight:700; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:3px 8px; border-radius:6px;" title="كروت مباعة بموجب فاتورة مبيعات - تتبع الرصيد والاستخدام">
                                            🛒 كروت مباعة بفواتير (تتبع الاستهلاك)
                                        </span>
                                    ` : ''}
                                    <button class="mt-btn" style="padding:4px 10px; font-size:11px; font-weight:700; background:#ffffff; border:1px solid #cbd5e1;" onclick="App.printWarehouseAuditReport(${w.id})" title="طباعة محضر جرد رسمي A4">
                                        🖨️ جرد
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('') : `
                        <div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-muted); background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px;">
                            🏢 لا توجد مخازن مطابقة لمعايير البحث المحددة
                        </div>
                    `}
                </div>
            `;
        }

        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            this.can('warehouse_stock_transfer') ? { label: '📦 + تحويل مخزني جديد', variant: 'primary', onclick: 'App.showStockTransferModal(1)' } : null,
            isWarehouseAdministrator || this.can('stock_inventory') ? { label: '📋 + بدء جلسة جرد', variant: 'indigo', onclick: 'App.showStartStockInventoryModal()' } : null,
            isWarehouseAdministrator || this.can('stock_adjustment') ? { label: '⚖️ + تسوية / إتلاف', variant: 'warning', onclick: 'App.showDirectStockAdjustmentModal()' } : null,
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderCardWarehouses()' }
        ].filter(Boolean);

        // 2. Stats
        const stats = [
            { label: 'المخازن والعهد النشطة', value: (summary.total_warehouses || 0).toLocaleString(), icon: '🏢', tone: 'indigo' },
            { label: 'إجمالي الكروت المتاحة', value: (summary.grand_total_cards || 0).toLocaleString(), icon: '🎫', tone: 'blue' },
            { label: 'الأوراق التسلسلية المتاحة', value: (summary.grand_total_sheets || 0).toLocaleString(), icon: '📄', tone: 'amber' },
            { label: 'القيمة المالية للمخزون', value: App.formatMoney(summary.grand_total_value || 0), icon: '💰', tone: 'green' }
        ];

        // 3. Toolbar
        const viewModeBtns = `
            <div style="display:inline-flex; border:1px solid var(--sam-border-strong); border-radius:var(--sam-radius-sm); overflow:hidden; flex-wrap:wrap;">
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'grid' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='grid'; App.renderCardWarehouses();">🏢 بطاقات المخازن</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'table' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='table'; App.renderCardWarehouses();">📋 جدول تفصيلي</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'transfers_log' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='transfers_log'; App.renderCardWarehouses();">📜 التحويلات والاعتمادات</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'inventories' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='inventories'; App.renderCardWarehouses();">📋 الجرد المخزني</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'adjustments' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='adjustments'; App.renderCardWarehouses();">⚖️ التسويات والإتلاف</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.warehousesViewMode === 'reports' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border:none; border-radius:0;" onclick="App.warehousesViewMode='reports'; App.renderCardWarehouses();">📊 تقارير المخزون والتقييم</button>
            </div>
        `;

        const toolbar = {
            left: [viewModeBtns],
            right: [
                `<select class="sam-select" style="min-width:160px;" onchange="App.warehousesRoleFilter=this.value; App.renderCardWarehouses();">
                    <option value="">-- جميع الرتب والأدوار --</option>
                    <option value="system_owner" ${this.warehousesRoleFilter === 'system_owner' ? 'selected' : ''}>مالك النظام (المخزن الرئيسي)</option>
                    <option value="superadmin" ${this.warehousesRoleFilter === 'superadmin' ? 'selected' : ''}>المدير العام (المخزن الرئيسي)</option>
                    <option value="admin" ${this.warehousesRoleFilter === 'admin' ? 'selected' : ''}>مدير نظام</option>
                    <option value="supervisor" ${this.warehousesRoleFilter === 'supervisor' ? 'selected' : ''}>مشرف شبكة</option>
                    <option value="distributor" ${this.warehousesRoleFilter === 'distributor' ? 'selected' : ''}>موزع رئيسي</option>
                    <option value="pos_agent" ${this.warehousesRoleFilter === 'pos_agent' ? 'selected' : ''}>نقطة بيع / محل</option>
                    <option value="regular_node_owner" ${this.warehousesRoleFilter === 'regular_node_owner' ? 'selected' : ''}>مالك برج / عقدة</option>
                </select>`,
                `<label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; color:var(--sam-text-secondary); user-select:none;">
                    <input type="checkbox" ${this.warehousesShowEmpty ? 'checked' : ''} onchange="App.warehousesShowEmpty = this.checked; App.renderCardWarehouses();" />
                    <span>إظهار المخازن الفارغة</span>
                </label>`,
                `<div class="quick-table-search" style="margin:0; min-width:220px;">
                    <span class="quick-table-search-icon">🔍</span>
                    <input type="text" class="quick-table-search-input" placeholder="بحث باسم المخزن أو رقم الحركة..." value="${this.escapeHtml(this.warehousesSearchQuery || '')}" oninput="App.warehousesSearchQuery=this.value; App.renderCardWarehouses();" />
                </div>`
            ]
        };

        if(!stockCurrent())return;
        if(pagedStock)contentHtml+=this.renderStockReadPager();
        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'card-warehouses',
                archetype: 'pos',
                title: 'منظومة مخازن الكروت والعهد',
                subtitle: 'متابعة وإدارة مخزون الكروت، العهد الموزعة، وأوامر التحويل المخزني الفوري',
                eyebrow: 'INVENTORY & WAREHOUSES',
                icon: '🏢',
                actions: actions,
                stats: stats,
                toolbar: toolbar,
                content: contentHtml
            });
        } else {
            document.getElementById('main-view').innerHTML = `
                <main class="sam-page-shell sam-ui-page" data-sam-page="card-warehouses" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">🏢</span>
                            <div>
                                <span class="sam-page-eyebrow">INVENTORY & WAREHOUSES</span>
                                <h1>منظومة مخازن الكروت والعهد</h1>
                                <p>متابعة وإدارة مخزون الكروت، العهد الموزعة، وأوامر التحويل المخزني الفوري</p>
                            </div>
                        </div>
                    </header>
                    <div class="view-scroll-content">
                        ${contentHtml}
                    </div>
                </main>
            `;
        }
        window.SamPageShell?.sync();
    },

    async showStockTransferModal(defaultSourceId = 1) {
        const data = await this.api('get_card_warehouses') || { warehouses: [] };
        const allWh = data.warehouses || [];
        const roleLabels = { system_owner: 'مالك النظام', superadmin: 'مدير عام', admin: 'مدير', distributor: 'موزع', pos_agent: 'نقطة بيع', accountant: 'محاسب', supervisor: 'مشرف', partner: 'شريك' };
        
        this.stAllWarehouses = allWh;
        this.stDefaultSourceId = parseInt(defaultSourceId) || 1;

        const sourceWarehouse = allWh.find(w => w.id === this.stDefaultSourceId) || allWh[0] || {};
        
        // Filter profiles: omit profiles with 0 unsold sheets
        const availableProfiles = (sourceWarehouse.profiles_stock || []).filter(p => (parseInt(p.unsold_sheets, 10) || 0) > 0);

        // Recipient filtering: default hide pos_agent unless advanced toggle checked
        const showPos = !!this.stShowPosAgents;
        const targetWarehouses = allWh.filter(w => w.id !== sourceWarehouse.id && (showPos || w.role !== 'pos_agent'));

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color:#fff; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                    <span>📦 إنشاء أمر تحويل عهدة كروت مخزنية (Stock Transfer)</span>
                </div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
                    <div>
                        <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">من مخزن (المصدر):</label>
                        <select id="st-source-id" class="mt-select" style="width:100%; font-weight:bold;" onchange="App.onStockTransferSourceChange(this.value)">
                            ${allWh.map(w => `
                                <option value="${w.id}" ${w.id === sourceWarehouse.id ? 'selected' : ''}>
                                    ${this.escapeHtml(w.fullname)} (${roleLabels[w.role] || w.role}) - [${(w.unsold_cards || w.total_cards || 0).toLocaleString()} كرت عهدة متاحة]
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <label style="font-size:12px; font-weight:700;">إلى مخزن (المستلم): <span style="color:red;">*</span></label>
                            <label style="font-size:10.5px; color:#4f46e5; cursor:pointer; user-select:none;">
                                <input type="checkbox" id="st-show-pos-cb" ${showPos ? 'checked' : ''} onchange="App.toggleStockTransferAdvancedPos(this.checked)" />
                                ⚙️ خيارات متقدمة (إظهار نقاط البيع)
                            </label>
                        </div>

                        <!-- Single Searchable Input with Datalist (Combobox) -->
                        <div style="position:relative;">
                            <input type="text" list="st-target-list" id="st-target-input" class="mt-input" style="width:100%; font-weight:700; font-size:12.5px;" placeholder="🔍 اكتب اسم أو يوزر المستلم أو اختر من القائمة..." oninput="App.syncAdminCombobox(this, 'st-target-id', 'st-target-list')" onchange="App.syncAdminCombobox(this, 'st-target-id', 'st-target-list')" required />
                            <input type="hidden" id="st-target-id" value="" />
                            <datalist id="st-target-list">
                                ${targetWarehouses.map(w => `
                                    <option data-id="${w.id}" data-search="${this.escapeHtml((w.fullname + ' ' + w.username + ' ' + (w.phone || '') + ' ' + w.role).toLowerCase())}" value="${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)}) - [${roleLabels[w.role] || w.role}]">
                                        ${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)})
                                    </option>
                                `).join('')}
                            </datalist>
                        </div>
                    </div>
                </div>

                <!-- Multi-Profile Items Section -->
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; font-weight:700; color:#1e293b;">📋 الباقات المراد تحويلها وتخصيص الأوراق:</span>
                        <button type="button" class="mt-btn mt-btn-secondary" style="padding:4px 12px; font-size:11.5px; font-weight:700;" onclick="App.addStockTransferRow()">
                            ➕ إضافة باقة / بند آخر للتحويل
                        </button>
                    </div>

                    <div class="mt-table-responsive" style="overflow-x:auto;">
                        <table class="mt-table" style="width:100%; border-collapse:collapse; background:#fff; font-size:12px;">
                            <thead>
                                <tr style="background:#f1f5f9; text-align:right; font-size:11.5px; color:#475569;">
                                    <th style="padding:8px; border:1px solid #cbd5e1; width:28%;">الباقة المستهدفة</th>
                                    <th style="padding:8px; border:1px solid #cbd5e1; width:14%; text-align:center;">عدد الأوراق</th>
                                    <th style="padding:8px; border:1px solid #cbd5e1; width:38%;">الأوراق المحجوزة تسلسلياً (Auto-Allocated)</th>
                                    <th style="padding:8px; border:1px solid #cbd5e1; width:12%; text-align:center;">الكروت</th>
                                    <th style="padding:8px; border:1px solid #cbd5e1; width:8%; text-align:center;">حذف</th>
                                </tr>
                            </thead>
                            <tbody id="st-items-tbody">
                                <!-- Items Rows Rendered Dynamically as <tr> -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Range Preview & Calculation Box -->
                <div id="st-preview-box" style="background:#EEF2FF; border:1px solid #C7D2FE; border-radius:8px; padding:12px; margin-bottom:14px;">
                    <div style="font-size:12px; font-weight:700; color:#3730A3; margin-bottom:6px;">⚡ التخصيص المحسوب والقيمة الإجمالية:</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                        <span>إجمالي الباقات والأوراق: <b id="st-calc-sheets" style="color:#4f46e5;">0 ورقة (0 كرت)</b></span>
                        <span>إجمالي القيمة التقديرية (التكلفة): <b id="st-calc-val" style="color:#16a34a; font-size:14px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b></span>
                    </div>
                </div>

                <!-- Approval Workflow Toggle -->
                <div style="margin-bottom:14px; background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:10px 14px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:#92400e; cursor:pointer; user-select:none;">
                        <input type="checkbox" id="st-require-approval" style="width:16px; height:16px;" />
                        <span>⏳ تفعيل دورة الاعتماد (يظل أمر التحويل معلقاً بانتظار موافقة واعتماد المستلم قبل نقل الكروت وتأثير الرصيد)</span>
                    </label>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">ملاحظات التحويل (اختياري):</label>
                    <input type="text" id="st-notes" class="mt-input" style="width:100%;" placeholder="مثال: دفعة أسبوعية لمنطقة التحرير" />
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-success" style="padding:7px 18px; font-weight:700;" onclick="App.confirmStockTransferExecution()">
                        ✓ تأكيد التحويل المالي والمخزني
                    </button>
                </div>
            </div>
        `, '740px');

        // Render initial row
        App.renderStockTransferRows(availableProfiles);
    },

    toggleStockTransferAdvancedPos(checked) {
        this.stShowPosAgents = checked;
        const sourceId = parseInt(document.getElementById('st-source-id')?.value || this.stDefaultSourceId, 10);
        this.showStockTransferModal(sourceId);
    },

    filterStockTransferRecipients(q) {
        const sel = document.getElementById('st-target-id');
        if (!sel) return;
        const query = q.toLowerCase().trim();
        Array.from(sel.options).forEach(opt => {
            if (!opt.value) return;
            const searchData = opt.getAttribute('data-search') || opt.innerText.toLowerCase();
            if (!query || searchData.includes(query)) {
                opt.style.display = '';
            } else {
                opt.style.display = 'none';
            }
        });
    },

    renderStockTransferRows(availableProfiles) {
        this.stAvailableProfiles = availableProfiles || [];
        const tbody = document.getElementById('st-items-tbody');
        if (!tbody) return;

        if (this.stAvailableProfiles.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; color:#94a3b8; font-size:12px; padding:16px;">
                        ⚠️ لا توجد باقات كروت عهدة متاحة في هذا المخزن المصدر
                    </td>
                </tr>
            `;
            App.recalcStockTransferTotals();
            return;
        }

        tbody.innerHTML = '';
        App.addStockTransferRow();
    },

    addStockTransferRow() {
        const tbody = document.getElementById('st-items-tbody');
        if (!tbody || !this.stAvailableProfiles || this.stAvailableProfiles.length === 0) return;

        // Collect already selected profile names in existing rows to prevent duplicate profile selection!
        const selectedProfNames = Array.from(document.querySelectorAll('.st-prof-sel')).map(s => s.value);
        const unselectedProfiles = this.stAvailableProfiles.filter(p => !selectedProfNames.includes(p.profile_name));

        if (unselectedProfiles.length === 0 && document.querySelectorAll('.st-row').length > 0) {
            App.toast('جميع الباقات المتاحة تم إضافتها في البنود السابقة', 'warning');
            return;
        }

        const profilesToList = (unselectedProfiles.length > 0) ? unselectedProfiles : this.stAvailableProfiles;
        const defaultProf = profilesToList[0];

        const rowId = 'st-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        const tr = document.createElement('tr');
        tr.className = 'st-row';
        tr.id = rowId;
        tr.style.cssText = 'background:#fff; border-bottom:1px solid #cbd5e1;';
        tr.innerHTML = `
            <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:middle;">
                <select class="mt-select st-prof-sel" style="width:100%; font-size:11.5px; font-weight:bold;" onchange="App.onStockTransferRowProfileChange('${rowId}')">
                    ${this.stAvailableProfiles.map(p => `
                        <option value="${this.escapeHtml(p.profile_name)}" ${p.profile_name === defaultProf.profile_name ? 'selected' : ''} data-sheets="${p.unsold_sheets}" data-cards="${p.unsold_cards}" data-price="${p.unit_price}" data-cost="${p.unit_cost || p.cost_price || p.unit_price}">
                            ${this.escapeHtml(p.display_profile || p.profile_name)} (متاح: ${p.unsold_sheets} ورقة - ${p.unsold_cards} كرت - تكلفة الكرت: ${App.formatMoney(p.unit_cost || p.cost_price || p.unit_price)})
                        </option>
                    `).join('')}
                </select>
            </td>

            <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:middle; text-align:center;">
                <input type="number" class="mt-input st-sheets-inp" style="width:100%; font-size:11.5px; font-weight:bold; text-align:center;" value="1" min="1" oninput="App.recalcStockTransferTotals()" />
            </td>

            <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:middle;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                    <span class="st-sheet-badge" id="${rowId}-badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">
                        🟢 تلقائي (أول ورقة)
                    </span>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="text" class="mt-input st-sheets-manual" style="width:100px; font-size:10.5px; font-family:monospace; padding:2px 4px;" placeholder="أو نطاق 1-5" oninput="App.onStockTransferManualSheetsInput('${rowId}', this.value)" title="أدخل نطاق الأوراق يدوياً (مثال: 1-5)" />
                        <button type="button" class="mt-btn mt-btn-secondary" style="padding:3px 8px; font-size:11px; font-weight:700; white-space:nowrap;" onclick="App.openSheetPickerModal('${rowId}')">⚙️ تخصيص</button>
                    </div>
                </div>
            </td>

            <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:middle; text-align:center;">
                <b class="st-row-cards" style="color:#4f46e5; font-size:12px;">60 كرت</b>
            </td>

            <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:middle; text-align:center;">
                <button type="button" class="mt-btn" style="color:#dc2626; border:none; background:none; font-weight:bold; font-size:16px; padding:2px 6px;" onclick="this.closest('.st-row').remove(); App.recalcStockTransferTotals();" title="حذف البند">✕</button>
            </td>
        `;
        tbody.appendChild(tr);
        App.recalcStockTransferTotals();
    },

    onStockTransferRowProfileChange(rowId) {
        // Validate against duplicate profiles across rows
        const currentSel = document.querySelector(`#${rowId} .st-prof-sel`);
        if (!currentSel) return;
        const currentVal = currentSel.value;

        const allSels = document.querySelectorAll('.st-prof-sel');
        let dupCount = 0;
        allSels.forEach(s => {
            if (s.value === currentVal) dupCount++;
        });

        if (dupCount > 1) {
            App.toast(`⚠️ الباقة (${currentVal}) محددة في بند آخر مسبقاً. يرجى تعديل البند بدلاً من التكرار.`, 'warning');
        }

        // Reset manual sheets input on profile change
        const manualInp = document.querySelector(`#${rowId} .st-sheets-manual`);
        if (manualInp) manualInp.value = '';

        App.recalcStockTransferTotals();
    },

    onStockTransferManualSheetsInput(rowId, val) {
        const row = document.getElementById(rowId);
        if (!row) return;
        const sheetsInp = row.querySelector('.st-sheets-inp');
        if (!sheetsInp) return;

        if (!val.trim()) {
            App.recalcStockTransferTotals();
            return;
        }

        const sheetNos = new Set();
        const parts = val.split(',');
        parts.forEach(p => {
            p = p.trim();
            if (p.includes('-')) {
                const [start, end] = p.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let x = Math.min(start, end); x <= Math.max(start, end); x++) sheetNos.add(x);
                }
            } else if (!isNaN(Number(p)) && Number(p) > 0) {
                sheetNos.add(Number(p));
            }
        });

        if (sheetNos.size > 0) {
            sheetsInp.value = sheetNos.size;
        }
        App.recalcStockTransferTotals();
    },

    async openSheetPickerModal(rowId) {
        const row = document.getElementById(rowId);
        if (!row) return;
        const profSel = row.querySelector('.st-prof-sel');
        if (!profSel) return;
        const profileName = profSel.value;

        const sourceId = parseInt(document.getElementById('st-source-id')?.value || '1', 10);

        App.toast('جاري تحميل كشف أوراق الباقة المتاحة في المخزن المصدر...', 'info');

        const details = await App.api('get_warehouse_details', { admin_id: sourceId }) || {};
        const custodySheets = (details.custody_sheets || details.sheets || []).filter(s => (!s.is_sold || Number(s.is_sold) === 0) && (s.profile_name === profileName || s.display_profile === profileName));

        if (custodySheets.length === 0) {
            return App.toast(`لا توجد أوراق عهدة متاحة في المخزن المصدر للباقة (${profileName})`, 'warning');
        }

        const manualInp = row.querySelector('.st-sheets-manual');
        const currentSelectedNos = new Set();
        if (manualInp && manualInp.value.trim()) {
            manualInp.value.split(',').forEach(p => {
                p = p.trim();
                if (p.includes('-')) {
                    const [s, e] = p.split('-').map(Number);
                    for (let x = Math.min(s, e); x <= Math.max(s, e); x++) currentSelectedNos.add(x);
                } else if (Number(p) > 0) currentSelectedNos.add(Number(p));
            });
        }

        const pickerHtml = `
            <div class="mt-modal-backdrop" id="st-picker-backdrop" style="z-index:10070;" onclick="if(event.target===this) document.getElementById('st-picker-backdrop').remove()">
                <div class="mt-modal" style="width:550px; max-width:94vw;">
                    <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff;">
                        <span style="font-weight:bold; font-size:14px;">📋 كشف أوراق العهدة المتاحة للباقة (${App.escapeHtml(profileName)})</span>
                        <span style="cursor:pointer;" onclick="document.getElementById('st-picker-backdrop').remove()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:16px;">
                        <div style="font-size:12px; color:#334155; margin-bottom:8px;">
                            حدد الأوراق المراد إدراجها في التحويل لهذا البند:
                        </div>
                        <div style="max-height:260px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:6px; padding:6px;">
                            ${custodySheets.map(s => {
                                const sNo = parseInt(s.sheet_no, 10);
                                const isChecked = currentSelectedNos.has(sNo);
                                const sNoFmt = String(sNo).padStart(6, '0');
                                const isPartial = (s.remaining_cards < s.total_cards && s.remaining_cards > 0);
                                return `
                                    <label style="display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid #e2e8f0; font-size:12px; cursor:pointer;">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <input type="checkbox" class="st-picker-chk" value="${sNo}" ${isChecked ? 'checked' : ''} />
                                            <b style="font-family:monospace; color:#4f46e5;">ورقة #${sNoFmt}</b>
                                        </div>
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <span style="font-size:11px; font-weight:600; color:${isPartial ? '#d97706' : '#16a34a'};">${isPartial ? '◐ مستخدمة جزئياً' : '● كاملة'} (${s.cards_in_sheet || s.remaining_cards} كرت)</span>
                                            <b style="color:#16a34a;">${App.formatMoney(s.sheet_total_value || 0)}</b>
                                        </div>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="mt-modal-footer">
                        <button type="button" class="mt-btn" onclick="document.getElementById('st-picker-backdrop').remove()">إلغاء</button>
                        <button type="button" class="mt-btn mt-btn-primary" style="font-weight:bold;" onclick="App.applySheetPickerSelection('${rowId}')">
                            ✓ اعتماد الأوراق المحددة
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', pickerHtml);
    },

    applySheetPickerSelection(rowId) {
        const chks = document.querySelectorAll('.st-picker-chk:checked');
        const nos = Array.from(chks).map(c => parseInt(c.value, 10)).sort((a, b) => a - b);
        
        document.getElementById('st-picker-backdrop')?.remove();

        const row = document.getElementById(rowId);
        if (!row) return;
        const manualInp = row.querySelector('.st-sheets-manual');
        const sheetsInp = row.querySelector('.st-sheets-inp');

        if (nos.length > 0) {
            // Format consecutive range if continuous
            let formattedStr = '';
            let isConsecutive = true;
            for (let i = 1; i < nos.length; i++) {
                if (nos[i] !== nos[i-1] + 1) { isConsecutive = false; break; }
            }
            if (nos.length > 2 && isConsecutive) {
                formattedStr = `${nos[0]}-${nos[nos.length - 1]}`;
            } else {
                formattedStr = nos.join(',');
            }

            if (manualInp) manualInp.value = formattedStr;
            if (sheetsInp) sheetsInp.value = nos.length;
        } else {
            if (manualInp) manualInp.value = '';
        }

        App.recalcStockTransferTotals();
    },

    recalcStockTransferTotals() {
        const rows = document.querySelectorAll('.st-row');
        let totalSheets = 0;
        let totalCards = 0;
        let totalValue = 0;

        rows.forEach(r => {
            const sel = r.querySelector('.st-prof-sel');
            const inp = r.querySelector('.st-sheets-inp');
            const manualInp = r.querySelector('.st-sheets-manual');
            const badgeEl = r.querySelector('.st-sheet-badge');
            const cardsEl = r.querySelector('.st-row-cards');
            if (!sel || !inp) return;
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;

            let sCnt = parseInt(inp.value, 10) || 1;
            const manualVal = manualInp?.value.trim() || '';

            if (manualVal) {
                const manualNos = new Set();
                manualVal.split(',').forEach(p => {
                    p = p.trim();
                    if (p.includes('-')) {
                        const [st, en] = p.split('-').map(Number);
                        for (let x = Math.min(st, en); x <= Math.max(st, en); x++) manualNos.add(x);
                    } else if (Number(p) > 0) manualNos.add(Number(p));
                });
                if (manualNos.size > 0) {
                    sCnt = manualNos.size;
                    inp.value = sCnt;
                }
            }

            const maxSheets = parseInt(opt.getAttribute('data-sheets') || '1', 10);
            if (sCnt > maxSheets) { sCnt = maxSheets; inp.value = maxSheets; }

            const uPrice = parseFloat(opt.getAttribute('data-cost') || opt.getAttribute('data-price') || '0');
            const totalAvailCards = parseInt(opt.getAttribute('data-cards') || '0', 10);
            const totalAvailSheets = parseInt(opt.getAttribute('data-sheets') || '1', 10);
            const cardsPerSheet = (totalAvailSheets > 0) ? Math.round(totalAvailCards / totalAvailSheets) : 60;

            const rowCards = sCnt * cardsPerSheet;
            const rowVal = rowCards * uPrice;

            totalSheets += sCnt;
            totalCards += rowCards;
            totalValue += rowVal;

            if (cardsEl) cardsEl.innerText = `${rowCards.toLocaleString()} كرت`;

            if (badgeEl) {
                if (manualVal) {
                    badgeEl.innerHTML = `📄 تخصيص يدوياً: ${App.escapeHtml(manualVal)} (${sCnt} ورقة)`;
                    badgeEl.style.cssText = 'background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;';
                } else {
                    badgeEl.innerHTML = `🟢 تلقائي (أول ${sCnt} ورقة)`;
                    badgeEl.style.cssText = 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;';
                }
            }
        });

        const sheetsEl = document.getElementById('st-calc-sheets');
        const valEl = document.getElementById('st-calc-val');
        if (sheetsEl) sheetsEl.innerText = `${totalSheets} ورقة (${totalCards.toLocaleString()} كرت تقريباً)`;
        if (valEl) valEl.innerText = App.formatMoney(totalValue);
    },

    confirmStockTransferExecution() {
        const sourceId = parseInt(document.getElementById('st-source-id')?.value || '1', 10);
        const targetId = parseInt(document.getElementById('st-target-id')?.value || '0', 10);
        const notes = document.getElementById('st-notes')?.value.trim() || '';

        if (!targetId) {
            return App.toast('يرجى تحديد المستلم / المخزن المستهدف أولاً', 'warning');
        }

        const rows = document.querySelectorAll('.st-row');
        if (rows.length === 0) {
            return App.toast('يرجى تحديد باقة وعدد أوراق للتحويل', 'warning');
        }

        // Validate duplicate profiles
        const seenProfs = new Set();
        let hasDuplicate = false;
        rows.forEach(r => {
            const pVal = r.querySelector('.st-prof-sel')?.value;
            if (pVal) {
                if (seenProfs.has(pVal)) hasDuplicate = true;
                seenProfs.add(pVal);
            }
        });

        if (hasDuplicate) {
            return App.toast('⛔ تكرار غير مسموح: إحدى الباقات مكررة في أكثر من بند في نفس الأمر. يرجى تعديل البند المكرر أو دمج عدد الأوراق في بند واحد.', 'danger');
        }

        const items = [];
        let totalSheets = 0;
        let totalValue = 0;
        let itemSummaries = [];

        rows.forEach(r => {
            const sel = r.querySelector('.st-prof-sel');
            const inp = r.querySelector('.st-sheets-inp');
            const manualInp = r.querySelector('.st-sheets-manual');
            if (!sel || !inp) return;
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;

            const pName = sel.value;
            const sCnt = parseInt(inp.value, 10) || 1;
            const manualSheetNos = manualInp?.value.trim() || null;

            const uPrice = parseFloat(opt.getAttribute('data-cost') || opt.getAttribute('data-price') || '0');
            const totalAvailCards = parseInt(opt.getAttribute('data-cards') || '0', 10);
            const totalAvailSheets = parseInt(opt.getAttribute('data-sheets') || '1', 10);
            const cardsPerSheet = (totalAvailSheets > 0) ? Math.round(totalAvailCards / totalAvailSheets) : 60;
            const rowCards = sCnt * cardsPerSheet;
            const rowVal = rowCards * uPrice;

            items.push({
                profile_name: pName,
                sheets_count: sCnt,
                sheet_numbers: manualSheetNos
            });

            totalSheets += sCnt;
            totalValue += rowVal;

            const specLabel = manualSheetNos ? ` [صفحات مخصصة: ${App.escapeHtml(manualSheetNos)}]` : '';
            itemSummaries.push(`• <b>${App.escapeHtml(pName)}:</b> ${sCnt} ورقة (${rowCards} كرت)${specLabel} بقيمة ${App.formatMoney(rowVal)}`);
        });

        const targetInput = document.getElementById('st-target-input');
        const targetSel = document.getElementById('st-target-id');
        const targetName = targetInput?.value || (targetSel?.options ? targetSel.options[targetSel.selectedIndex]?.text : '') || 'المستلم';
        const reqAppr = document.getElementById('st-require-approval')?.checked ? 1 : 0;

        // Confirmation Modal Summary
        const confirmHtml = `
            <div class="mt-modal-backdrop" id="st-confirm-backdrop" style="z-index:10060;" onclick="if(event.target===this) document.getElementById('st-confirm-backdrop').remove()">
                <div class="mt-modal" style="width:500px; max-width:94vw; box-shadow:0 12px 35px rgba(0,0,0,0.35);">
                    <div class="mt-modal-header" style="background:linear-gradient(135deg, #10b981 0%, #047857 100%); color:#fff;">
                        <span style="font-weight:bold; font-size:14px;">✅ تأكيد إرسال أمر تحويل العهدة المخزنية</span>
                        <span style="cursor:pointer;" onclick="document.getElementById('st-confirm-backdrop').remove()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:16px; font-size:12.5px; line-height:1.6;">
                        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:10px; margin-bottom:12px; color:#065f46;">
                            👤 <b>المستلم:</b> ${App.escapeHtml(targetName)}<br/>
                            💰 <b>إجمالي التكلفة الحقيقية للعهد:</b> <b style="font-size:14px; color:#047857;">${App.formatMoney(totalValue)}</b>
                            ${reqAppr ? '<br/><span style="color:#d97706; font-weight:700;">⏳ دورة اعتماد مفعلة: سيبقى معلقاً حتى يعتمده المستلم</span>' : ''}
                        </div>

                        <div style="margin-bottom:12px;">
                            <b>تفاصيل الباقات والمراد تحويلها:</b>
                            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px; margin-top:4px;">
                                ${itemSummaries.join('<br/>')}
                            </div>
                        </div>

                        ${notes ? `<div style="margin-bottom:12px; color:#475569;">📝 <b>ملاحظات:</b> ${App.escapeHtml(notes)}</div>` : ''}

                        <div style="font-size:11px; color:#64748b; background:#f1f5f9; padding:6px 8px; border-radius:4px;">
                            📱 سيتم إرسال الإشعارات الآلية تلقائياً عبر <b>واتساب النظام</b> و <b>جروب التلجرام</b> لكلا الطرفين.
                        </div>
                    </div>
                    <div class="mt-modal-footer">
                        <button type="button" class="mt-btn" onclick="document.getElementById('st-confirm-backdrop').remove()">تعديل</button>
                        <button type="button" class="mt-btn mt-btn-success" style="font-weight:bold; padding:7px 20px;" onclick="App.executeStockTransferConfirmed(${sourceId}, ${targetId}, ${JSON.stringify(items).replace(/"/g, '&quot;')}, '${App.escapeHtml(notes)}', ${reqAppr})">
                            🚀 تأكيد وإرسال التحويل الآن
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', confirmHtml);
    },

    async executeStockTransferConfirmed(sourceId, targetId, items, notes, reqAppr = 0) {
        document.getElementById('st-confirm-backdrop')?.remove();
        App.closeModal();

        App.toast('جاري تنفيذ أمر تحويل العهدة وإقاد الحسابات وإرسال الإشعارات...', 'info');

        const payload = {
            source_admin_id: sourceId,
            target_admin_id: targetId,
            items: items,
            notes: notes,
            require_approval: reqAppr ? 1 : 0
        };

        const res = await App.api('transfer_warehouse_stock', payload, 'POST');
        if (res && res.success) {
            App.toast(`✅ ${res.message || 'تم تحويل العهدة بنجاح'}`, 'success');
            App.renderCardWarehouses();
        } else {
            App.toast(res?.error || 'فشل تنفيذ تحويل العهدة', 'danger');
        }
    },

    stockOperationError(code) {
        const errors={QUOTE_CHANGED:'تغيّر السعر أو الكروت أو انتهت المعاينة؛ افتح الاعتماد مرة أخرى وراجع القيمة',CREDIT_LIMIT_EXCEEDED:'تجاوز المستلم حد المديونية المسموح',TRANSFER_STALE:'تغيّرت الكروت؛ راجع المستند والمخزون',CHART_ACCOUNT_INVALID:'راجع تفعيل حسابات المخزون والعهد والعجز',IMMUTABLE_RECORD:'المستند مقفل أو له أثر مالي',POSTED_TRANSFER_INCOMPLETE:'المستند القديم يحتاج مراجعة أثره المحاسبي',IDEMPOTENCY_CONFLICT:'تغيّرت بيانات طلب سبق تنفيذه؛ افتح تسوية جديدة',INSUFFICIENT_STOCK:'لا توجد كروت غير مستخدمة كافية في الأوراق والباقة المحددة',SURPLUS_REQUIRES_CARD_IMPORT:'استورد الكروت الفعلية للفائض ثم افتح جرداً جديداً',SALES_INVOICE_REQUIRED:'عملية البيع تحتاج فاتورة؛ اعتماد العهدة مخصص للنقل والإرجاع',FORBIDDEN_SCOPE:'المستند خارج صلاحيات المستخدم',FORBIDDEN_NETWORK:'المستند خارج الشبكة الحالية'};
        return errors[code]||code;
    },
    async approveStockTransfer(transferId) {
        this.loading(true);
        try {
            const network=Number(this.activeNetworkId);
            const quote=await this.api('get_stock_transfer_quote',{transfer_id:transferId});
            this.loading(false);
            if(!quote?.success)return this.toast(this.stockOperationError(quote?.error)||'تعذر تحميل معاينة الاعتماد','danger');
            if(network!==Number(this.activeNetworkId))return;
            const changed=String(quote.previous_document_value)!==String(quote.distribution_value);
            if(!confirm(`اعتماد العهدة #${transferId} (${quote.cards_count} كرت)؟\nقيمة التوزيع وأثر المديونية: ${App.formatMoney(quote.distribution_value)}\nتكلفة الشراء المنقولة محاسبياً: ${App.formatMoney(quote.purchase_cost)}\nسعر البيع الإجمالي للعملاء: ${App.formatMoney(quote.retail_value)}${changed?`\nالقيمة السابقة للمستند: ${App.formatMoney(quote.previous_document_value)}؛ ستُعتمد قيمة التوزيع المعروضة أعلاه.`:''}\nالمستند سيُقفل بعد الاعتماد.`))return;
            if(network!==Number(this.activeNetworkId))return;
            this.loading(true);
            const res=await this.api('approve_stock_transfer',{transfer_id:transferId,quote_token:quote.quote_token,expected_total_value:quote.distribution_value},'POST');
            if(res?.success){this.toast(res.message||'تم اعتماد العهدة','success');this.renderCardWarehouses();}
            else this.toast(this.stockOperationError(res?.error)||'فشل اعتماد العهدة','danger');
        }catch(e){this.toast(e.message||'حدث خطأ','danger');}finally{this.loading(false);}
    },

    async rejectStockTransfer(transferId) {
        const reason = prompt('يرجى كتابة سبب رفض هذا التحويل المخزني:');
        if (reason === null) return;
        this.loading(true);
        try {
            const res = await this.api('reject_stock_transfer', { transfer_id: transferId, reason: reason }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message || 'تم رفض التحويل المخزني', 'warning');
                this.renderCardWarehouses();
            } else {
                this.toast(res?.error || 'فشل رفض التحويل', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');
        }
    },

    async deleteStockTransfer(transferId) {
        if (!confirm(`هل أنت متأكد من حذف حركة التحويل رقم #${transferId}؟`)) return;
        this.loading(true);
        try {
            const res = await this.api('delete_stock_transfer', { transfer_id: transferId }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message || 'تم حذف الحركة بنجاح', 'success');
                this.renderCardWarehouses();
            } else {
                this.toast(res?.error || 'فشل حذف الحركة', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');
        }
    },

    async viewMovementJournalEntry(journalId) {
        if (!journalId) return;
        this.toast('جاري جلب تفاصيل القيد المحاسبي...', 'info');
        const res = await this.api(`get_journal_entry_details?id=${journalId}`);
        if (!res || !res.success || !res.data) {
            return this.toast('تعذر جلب بيانات القيد المحاسبي', 'danger');
        }
        const entry = res.data;
        const lines = entry.lines || [];
        
        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                    <span>📖 سند القيد المحاسبي المزدوج رقم #${entry.entry_no || entry.id}</span>
                </div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:14px; font-size:12px;">
                    <div><b>تاريخ القيد:</b> ${entry.entry_date || entry.created_at}</div>
                    <div><b>نوع المستند:</b> ${entry.source_type || 'حركة مخزنية'}</div>
                    <div><b>المبلغ الإجمالي:</b> <b style="color:#059669;">${App.formatMoney(entry.amount || entry.total_debit || 0)}</b></div>
                    <div style="grid-column: span 3;"><b>البيان / الوصف:</b> ${this.escapeHtml(entry.description || '-')}</div>
                </div>
                <div class="mt-table-responsive" style="border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <table class="mt-table" style="width:100%; font-size:12px;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="padding:8px 10px;">رقم الحساب</th>
                                <th style="padding:8px 10px;">اسم الحساب في الدليل</th>
                                <th style="padding:8px 10px; text-align:right;">مدين (Dr)</th>
                                <th style="padding:8px 10px; text-align:right;">دائن (Cr)</th>
                                <th style="padding:8px 10px;">البيان التفصيلي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lines.map(l => `
                                <tr style="border-bottom:1px solid #e2e8f0;">
                                    <td style="font-family:monospace; font-weight:700;">${this.escapeHtml(l.account_code || '-')}</td>
                                    <td><b>${this.escapeHtml(l.account_name || '-')}</b></td>
                                    <td style="color:#059669; font-weight:700; text-align:right;">${(parseFloat(l.debit) > 0) ? App.formatMoney(l.debit) : '-'}</td>
                                    <td style="color:#dc2626; font-weight:700; text-align:right;">${(parseFloat(l.credit) > 0) ? App.formatMoney(l.credit) : '-'}</td>
                                    <td style="color:#64748b; font-size:11px;">${this.escapeHtml(l.line_description || l.description || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top:16px; display:flex; justify-content:flex-end;">
                    <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        `, '700px');
    },

    async showStartStockInventoryModal() {
        this.stockInventoryRequestKey=crypto.randomUUID();
        const data = await this.api('get_card_warehouses') || { warehouses: [] };
        const allWh = data.warehouses || [];
        const roleLabels = { system_owner: 'مالك النظام', superadmin: 'مدير عام', admin: 'مدير', distributor: 'موزع', pos_agent: 'نقطة بيع', accountant: 'محاسب', supervisor: 'مشرف', partner: 'شريك' };

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #4338ca 0%, #312e81 100%); color:#fff; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                    <span>📋 بدء جلسة جرد مخزني جديدة (Physical Stocktaking)</span>
                </div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; margin-bottom:16px; font-size:12px; color:#1e40af; line-height:1.6;">
                    ℹ️ <b>جلسة الجرد المخزني:</b> تتيح تجميد أو توثيق الأرصدة الدفترية ومقارنتها بالعد الفعلي للباقات والأوراق التسلسلية في المخزن، لاكتشاف العجز أو الفائض وحساب التكاليف وترحيل قيود التسوية المحاسبية تلقائياً.
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">المخزن الخاضع للجرد: <span style="color:red;">*</span></label>
                    <input type="text" list="inv-admin-list" id="inv-admin-input" class="mt-input" style="width:100%; font-weight:bold; font-size:12.5px;" placeholder="🔍 ابحث عن اسم المخزن أو اكتب للفلترة..." oninput="App.syncAdminCombobox(this, 'inv-admin-id', 'inv-admin-list')" onchange="App.syncAdminCombobox(this, 'inv-admin-id', 'inv-admin-list')" value="${allWh[0] ? `${this.escapeHtml(allWh[0].fullname)} (@${this.escapeHtml(allWh[0].username)}) - [${roleLabels[allWh[0].role] || allWh[0].role}]` : ''}" required />
                    <input type="hidden" id="inv-admin-id" value="${allWh[0]?.id || ''}" />
                    <datalist id="inv-admin-list">
                        ${allWh.map(w => `
                            <option data-id="${w.id}" data-search="${this.escapeHtml((w.fullname + ' ' + w.username + ' ' + (w.phone || '') + ' ' + w.role).toLowerCase())}" value="${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)}) - [${roleLabels[w.role] || w.role}] (${(w.unsold_cards || w.total_cards || 0).toLocaleString()} كرت)">
                                ${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)})
                            </option>
                        `).join('')}
                    </datalist>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">عنوان / مسمى جلسة الجرد:</label>
                    <input type="text" id="inv-title" class="mt-input" style="width:100%;" placeholder="مثال: جرد نهاية الربع الأول - مخزن الإدارة الرئيسي" />
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">ملاحظات وتعليمات الجرد:</label>
                    <textarea id="inv-notes" class="mt-input" style="width:100%; height:60px;" placeholder="ملاحظات لجنة الجرد..."></textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-primary" style="padding:7px 18px; font-weight:700;" onclick="App.executeStartStockInventory()">
                        🚀 فتح جلسة الجرد والبدء بإدخال الكميات الفعلية
                    </button>
                </div>
            </div>
        `, '600px');
    },

    async executeStartStockInventory() {
        const adminId = parseInt(document.getElementById('inv-admin-id')?.value || '0', 10);
        const title = document.getElementById('inv-title')?.value.trim() || '';
        const notes = document.getElementById('inv-notes')?.value.trim() || '';

        if (!adminId) return this.toast('يرجى اختيار المخزن الخاضع للجرد', 'warning');

        this.loading(true);
        try {
            const res = await this.api('start_stock_inventory', { admin_id: adminId, title: title, notes: notes, request_key:this.stockInventoryRequestKey||(this.stockInventoryRequestKey=crypto.randomUUID()) }, 'POST');
            this.loading(false);
            if (res && res.success && res.inventory_id) {
                this.toast('تم فتح جلسة الجرد بنجاح', 'success');
                this.closeModal();
                this.showStockInventorySheetModal(res.inventory_id);
            } else {
                this.toast(res?.error || 'فشل فتح جلسة الجرد', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');
        }
    },

    async showStockInventorySheetModal(inventoryId,afterId=0) {
        this.loading(true);
        const res = await this.api(`get_stock_inventory_details?inventory_id=${inventoryId}&after_id=${Number(afterId)||0}`);
        this.loading(false);
        if (!res || !res.success || !res.data) {
            return this.toast('تعذر جلب تفاصيل جلسة الجرد', 'danger');
        }

        const inv = res.data;
        const linePager=res.has_more?`<p>تعرض هذه الصفحة أول ${res.limit||500} صنفًا من موضع القراءة الحالي. احفظ العد قبل الانتقال؛ الملخص أثناء التحرير يخص الأصناف المعروضة فقط.</p><button class="mt-btn" onclick="App.advanceStockInventoryLines(${Number(inv.id)},${Number(res.next_cursor)||0},${!['draft','in_progress'].includes(inv.status)})">التالي — أصناف الجرد</button>`:(afterId?`<button class="mt-btn" onclick="App.advanceStockInventoryLines(${Number(inv.id)},0,${!['draft','in_progress'].includes(inv.status)})">العودة لأول صفحة أصناف</button>`:'');
        const lines = inv.lines || [];
        const isCompleted = !['draft','in_progress'].includes(inv.status);

        const renderLinesHtml = () => {
            return lines.map((l) => {
                const bookCards = parseInt(l.book_cards_count, 10) || 0;
                const bookSheets = parseInt(l.book_sheets_count, 10) || 0;
                const actualCards = (l.actual_cards_count !== null && l.actual_cards_count !== undefined) ? parseInt(l.actual_cards_count, 10) : bookCards;
                const actualSheets = (l.actual_sheets_count !== null && l.actual_sheets_count !== undefined) ? parseInt(l.actual_sheets_count, 10) : bookSheets;
                const unitCost = parseFloat(l.cost_price) || 0;
                const diff = actualCards - bookCards;
                const diffVal = diff * unitCost;

                return `
                    <tr class="inv-line-row" data-line-id="${l.id}" data-unit-cost="${unitCost}" data-book-cards="${bookCards}" data-book-sheets="${bookSheets}" style="border-bottom:1px solid #e2e8f0;">
                        <td style="font-weight:700; padding:10px 8px;">
                            ${this.escapeHtml(l.profile_name)}
                        </td>
                        <td style="text-align:center; padding:10px 8px; font-weight:700; color:#3b82f6;">
                            ${bookSheets.toLocaleString()} ورقة<br/>
                            <span style="font-size:11px; color:#64748b;">(${bookCards.toLocaleString()} كرت)</span>
                        </td>
                        <td style="text-align:center; padding:10px 8px;">
                            ${isCompleted ? `
                                <b>${actualSheets.toLocaleString()} ورقة</b><br/>
                                <span style="font-size:11px; color:#64748b;">(${actualCards.toLocaleString()} كرت)</span>
                            ` : `
                                <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                    <input type="number" min="0" class="mt-input inv-actual-sheets" style="width:90px; text-align:center; font-weight:700; padding:4px;" value="${actualSheets}" oninput="App.recalcStockInventoryLine(this)" />
                                    <span style="font-size:10px; color:#64748b;">أو كروت فردية:</span>
                                    <input type="number" min="0" class="mt-input inv-actual-cards" style="width:90px; text-align:center; font-weight:700; padding:4px;" value="${actualCards}" oninput="App.recalcStockInventoryCardsLine(this)" />
                                </div>
                            `}
                        </td>
                        <td style="text-align:center; padding:10px 8px;" class="inv-variance-cell">
                            ${diff === 0 ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; font-weight:700; padding:3px 8px; border-radius:6px;">✔️ مطابق (0)</span>' :
                              diff > 0 ? `<span class="status-pill" style="background:#dbeafe; color:#1d4ed8; font-weight:700; padding:3px 8px; border-radius:6px;">🔺 فائض (+${diff})</span>` :
                              `<span class="status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:3px 8px; border-radius:6px;">🔻 عجز (${diff})</span>`}
                        </td>
                        <td style="text-align:right; padding:10px 8px; font-weight:700;" class="inv-variance-val-cell">
                            ${diffVal === 0 ? '0.00' : (diffVal > 0 ? `+${App.formatMoney(diffVal)}` : App.formatMoney(diffVal))}
                        </td>
                        <td style="padding:10px 8px;">
                            ${isCompleted ? (this.escapeHtml(l.notes || '-')) : `
                                <input type="text" class="mt-input inv-line-notes" style="width:100%; font-size:11px; padding:4px 6px;" placeholder="ملاحظات الصنف..." value="${this.escapeHtml(l.notes || '')}" />
                            `}
                        </td>
                    </tr>
                `;
            }).join('');
        };

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                    <span>📋 استمارة الجرد المخزني - #${inv.inventory_no || inv.id} (${this.escapeHtml(inv.warehouse_name)})</span>
                </div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:14px;">
                    <div>
                        <b>المخزن:</b> ${this.escapeHtml(inv.warehouse_name)} (@${this.escapeHtml(inv.warehouse_username)})<br/>
                        <b>الحالة:</b> ${inv.status === 'completed' ? '<span style="color:#16a34a; font-weight:700;">✓ مكتمل ومسوى محاسبياً</span>' : '<span style="color:#d97706; font-weight:700;">⏳ قيد الجرد والعد</span>'}
                    </div>
                    <div style="text-align:left; font-size:12px;">
                        <b>تاريخ البدء:</b> ${inv.started_at || inv.created_at}<br/>
                        <b>القائم بالجرد:</b> ${this.escapeHtml(inv.created_by_name || 'مدير النظام')}
                    </div>
                </div>

                <div class="mt-table-responsive" style="max-height:380px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:14px;">
                    <table class="mt-table" style="width:100%; font-size:12px;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="padding:8px 10px;">الباقة / الصنف</th>
                                <th style="padding:8px 10px; text-align:center;">الرصيد الدفتري للنظام</th>
                                <th style="padding:8px 10px; text-align:center; width:130px;">العد الفعلي الحقيقي</th>
                                <th style="padding:8px 10px; text-align:center;">الفارق (عجز/فائض)</th>
                                <th style="padding:8px 10px; text-align:right;">القيمة المالية للتسوية</th>
                                <th style="padding:8px 10px;">ملاحظات الفروقات</th>
                            </tr>
                        </thead>
                        <tbody id="inv-lines-tbody">
                            ${renderLinesHtml()}
                        </tbody>
                    </table>
                </div>

                ${linePager}
                <div id="inv-summary-bar" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12.5px; margin-bottom:14px;">
                    <span>إجمالي الكروت الدفترية: <b id="inv-tot-book">${(inv.total_book_cards || 0).toLocaleString()}</b></span>
                    <span>إجمالي العد الفعلي: <b id="inv-tot-act" style="color:#2563eb;">${(inv.total_actual_cards ?? inv.total_book_cards ?? 0).toLocaleString()}</b></span>
                    <span>صافي الفارق: <b id="inv-tot-var">${(inv.total_variance_cards || 0) > 0 ? `+${inv.total_variance_cards}` : (inv.total_variance_cards || 0)}</b></span>
                    <span>صافي القيمة: <b id="inv-tot-val" style="color:#059669;">${App.formatMoney(inv.total_cost_variance || 0)}</b></span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                    <div style="display:flex; gap:8px;">
                        ${!isCompleted ? `
                            <button class="mt-btn mt-btn-secondary" style="font-weight:700;" onclick="App.saveStockInventoryDraft(${inv.id})">
                                💾 حفظ مسودة الجرد
                            </button>
                            <button class="mt-btn mt-btn-success" style="font-weight:700; background:#059669; color:#fff;" onclick="App.postStockInventoryAdjustmentConfirmed(${inv.id})">
                                ⚖️ اعتماد وتسوية الجرد وترحيل القيد المحاسبي
                            </button>
                        ` : `
                            <button class="mt-btn mt-btn-primary" onclick="window.print()">🖨️ طباعة محضر الجرد</button>
                        `}
                    </div>
                </div>
            </div>
        `, '860px');
    },

    recalcStockInventoryLine(inputElem) {
        const row = inputElem.closest('.inv-line-row');
        if (!row) return;
        const sheets = parseInt(inputElem.value, 10) || 0;
        const bookCards = parseInt(row.getAttribute('data-book-cards') || '0', 10);
        const bookSheets = parseInt(row.getAttribute('data-book-sheets') || '1', 10);
        const cardsPerSheet = (bookSheets > 0) ? Math.round(bookCards / bookSheets) : 60;
        const cards = sheets * cardsPerSheet;

        const cardsInp = row.querySelector('.inv-actual-cards');
        if (cardsInp) cardsInp.value = cards;

        this._updateInvRowVariance(row, cards, bookCards);
        this._recalcInvSummaryTotals();
    },

    recalcStockInventoryCardsLine(inputElem) {
        const row = inputElem.closest('.inv-line-row');
        if (!row) return;
        const cards = parseInt(inputElem.value, 10) || 0;
        const bookCards = parseInt(row.getAttribute('data-book-cards') || '0', 10);
        const bookSheets = parseInt(row.getAttribute('data-book-sheets') || '1', 10);
        const cardsPerSheet = (bookSheets > 0) ? Math.round(bookCards / bookSheets) : 60;
        const sheets = (cardsPerSheet > 0) ? Math.floor(cards / cardsPerSheet) : 0;

        const sheetsInp = row.querySelector('.inv-actual-sheets');
        if (sheetsInp) sheetsInp.value = sheets;

        this._updateInvRowVariance(row, cards, bookCards);
        this._recalcInvSummaryTotals();
    },

    _updateInvRowVariance(row, actualCards, bookCards) {
        const unitCost = parseFloat(row.getAttribute('data-unit-cost') || '0');
        const diff = actualCards - bookCards;
        const diffVal = diff * unitCost;

        const varCell = row.querySelector('.inv-variance-cell');
        if (varCell) {
            varCell.innerHTML = (diff === 0) ? '<span class="status-pill" style="background:#dcfce7; color:#15803d; font-weight:700; padding:3px 8px; border-radius:6px;">✔️ مطابق (0)</span>' :
                (diff > 0) ? `<span class="status-pill" style="background:#dbeafe; color:#1d4ed8; font-weight:700; padding:3px 8px; border-radius:6px;">🔺 فائض (+${diff})</span>` :
                `<span class="status-pill" style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:3px 8px; border-radius:6px;">🔻 عجز (${diff})</span>`;
        }

        const valCell = row.querySelector('.inv-variance-val-cell');
        if (valCell) {
            valCell.innerText = (diffVal === 0) ? '0.00' : ((diffVal > 0 ? '+' : '') + App.formatMoney(diffVal));
        }
    },

    _recalcInvSummaryTotals() {
        let totBook = 0, totAct = 0, totVar = 0, totVal = 0;
        document.querySelectorAll('.inv-line-row').forEach(row => {
            const bookCards = parseInt(row.getAttribute('data-book-cards') || '0', 10);
            const actualCards = parseInt(row.querySelector('.inv-actual-cards')?.value || '0', 10);
            const unitCost = parseFloat(row.getAttribute('data-unit-cost') || '0');
            const diff = actualCards - bookCards;
            const diffVal = diff * unitCost;

            totBook += bookCards;
            totAct += actualCards;
            totVar += diff;
            totVal += diffVal;
        });

        const bookElem = document.getElementById('inv-tot-book');
        const actElem = document.getElementById('inv-tot-act');
        const varElem = document.getElementById('inv-tot-var');
        const valElem = document.getElementById('inv-tot-val');

        if (bookElem) bookElem.innerText = totBook.toLocaleString();
        if (actElem) actElem.innerText = totAct.toLocaleString();
        if (varElem) varElem.innerText = (totVar > 0 ? `+${totVar.toLocaleString()}` : totVar.toLocaleString());
        if (valElem) valElem.innerText = (totVal > 0 ? `+${App.formatMoney(totVal)}` : App.formatMoney(totVal));
    },

    async advanceStockInventoryLines(id,afterId,readOnly) {
        if(readOnly||await this.saveStockInventoryDraft(id))await this.showStockInventorySheetModal(id,afterId);
    },

    async saveStockInventoryDraft(inventoryId) {
        const lines = [];
        document.querySelectorAll('.inv-line-row').forEach(row => {
            lines.push({
                id: parseInt(row.getAttribute('data-line-id'), 10),
                actual_sheets_count: parseInt(row.querySelector('.inv-actual-sheets')?.value || '0', 10),
                actual_cards_count: parseInt(row.querySelector('.inv-actual-cards')?.value || '0', 10),
                notes: row.querySelector('.inv-line-notes')?.value.trim() || ''
            });
        });

        this.loading(true);
        try {
            const res = await this.api('save_stock_inventory', { inventory_id: inventoryId, lines: lines }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast('تم حفظ مسودة الجرد بنجاح', 'success');return true;
            } else {
                this.toast(res?.error || 'فشل حفظ المسودة', 'danger');return false;
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');return false;
        }
    },

    async postStockInventoryAdjustmentConfirmed(inventoryId) {
        if (!confirm('اعتماد الجرد نهائياً؟ عند العجز ستُعطّل أقدم الكروت غير المستخدمة من الباقة بقدر النقص، وتُسجل تكلفة شرائها الفعلية. الفائض يحتاج تسجيل الكروت الفعلية وجرداً جديداً. لن يمكن تعديل المحضر بعد اعتماده.')) return;

        // First save latest inputs
        if(!await this.saveStockInventoryDraft(inventoryId))return;

        this.loading(true);
        try {
            const res = await this.api('post_stock_inventory_adjustment', { inventory_id: inventoryId }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast('✅ تم اعتماد وتسوية الجرد وترحيل القيود المحاسبية بنجاح', 'success');
                this.closeModal();
                this.renderCardWarehouses();
            } else {
                const errors={INVENTORY_STALE:'تغير المخزون منذ فتح المحضر؛ ابدأ جرداً جديداً',SURPLUS_REQUIRES_CARD_IMPORT:'سجل الكروت الفعلية للفائض ثم ابدأ جرداً جديداً',CHART_ACCOUNT_INVALID:'راجع تفعيل ونوع حساب المخزون وحساب العجز',POSTED_INVENTORY_INCOMPLETE:'المحضر القديم مغلق لكنه يفتقد تسوية أو قيداً؛ يلزم مراجعته',POSTING_BATCH_REQUIRED:'المحضر يتجاوز حد الترحيل المباشر؛ يحتاج معالجة خلفية',INVENTORY_LOCKED:'محضر الجرد مغلق أو ملغى'};this.toast(errors[res?.error] || res?.error || 'فشل اعتماد التسوية', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');
        }
    },

    async showDirectStockAdjustmentModal() {
        this.directStockRequestKey=crypto.randomUUID();
        const data = await this.api('get_card_warehouses') || { warehouses: [] };
        const allWh = data.warehouses || [];
        const profilesData = await this.api('get_profiles') || [];
        const profiles = profilesData.data || profilesData || [];

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #b45309 0%, #78350f 100%); color:#fff; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px;">
                    <span>⚖️ إنشاء تسوية جردية / إتلاف عجز مخزني مباشر</span>
                </div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">المخزن: <span style="color:red;">*</span></label>
                    <input type="text" list="adj-admin-list" id="adj-admin-input" class="mt-input" style="width:100%; font-weight:bold; font-size:12.5px;" placeholder="🔍 ابحث عن اسم المخزن أو اكتب للفلترة..." oninput="App.syncAdminCombobox(this, 'adj-admin-id', 'adj-admin-list')" onchange="App.syncAdminCombobox(this, 'adj-admin-id', 'adj-admin-list')" value="${allWh[0] ? `${this.escapeHtml(allWh[0].fullname)} (@${this.escapeHtml(allWh[0].username)})` : ''}" required />
                    <input type="hidden" id="adj-admin-id" value="${allWh[0]?.id || ''}" />
                    <datalist id="adj-admin-list">
                        ${allWh.map(w => `
                            <option data-id="${w.id}" data-search="${this.escapeHtml((w.fullname + ' ' + w.username + ' ' + (w.phone || '') + ' ' + w.role).toLowerCase())}" value="${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)})">
                                ${this.escapeHtml(w.fullname)} (@${this.escapeHtml(w.username)})
                            </option>
                        `).join('')}
                    </datalist>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                    <div>
                        <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">نوع التسوية:</label>
                        <select id="adj-type" class="mt-select" style="width:100%; font-weight:bold;">
                            <option value="damaged">إتلاف كروت تالفة</option><option value="lost">كروت مفقودة</option><option value="deficit">عجز مخزني</option>
                            
                            
                        </select>
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">الباقة المستهدفة:</label>
                        <select id="adj-profile" class="mt-select" style="width:100%;">
                            ${profiles.map(p => `<option value="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)} (${p.price || 0} ${App.getCurrencySymbol()})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                    <div>
                        <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">عدد الأوراق التسلسلية:</label>
                        <input type="number" id="adj-sheets" min="0" value="1" class="mt-input" style="width:100%; font-weight:bold;" />
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">أرقام الأوراق التسلسلية (اختياري):</label>
                        <input type="text" id="adj-sheet-nos" class="mt-input" style="width:100%; font-family:monospace;" placeholder="مثال: 104, 105, 106" />
                    </div>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">السبب والملاحظات القانونية للتسوية:</label>
                    <textarea id="adj-reason" class="mt-input" style="width:100%; height:65px;" placeholder="اكتب مبرر التسوية أو محضر الإتلاف..."></textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-warning" style="font-weight:700; padding:7px 18px;" onclick="App.executeDirectStockAdjustment()">
                        ⚖️ تأكيد التسوية وترحيل القيد المحاسبي
                    </button>
                </div>
            </div>
        `, '600px');
    },

    async executeDirectStockAdjustment() {
        const adminId = parseInt(document.getElementById('adj-admin-id')?.value || '0', 10);
        const type = document.getElementById('adj-type')?.value || 'damage_loss';
        const profile = document.getElementById('adj-profile')?.value || '';
        const sheets = parseInt(document.getElementById('adj-sheets')?.value || '1', 10);
        const sheetNos = document.getElementById('adj-sheet-nos')?.value.trim() || '';
        const reason = document.getElementById('adj-reason')?.value.trim() || '';

        if (!adminId || !profile || sheets <= 0 || !reason) {
            return this.toast('يرجى ملء جميع الحقول المطلوبة للتسوية', 'warning');
        }

        if (!confirm('تعطيل الكروت غير المستخدمة من الأوراق المحددة؟ إذا لم تحدد أرقام الأوراق ستُختار أقدم الأوراق المتاحة. سيُسجل العجز بتكلفة الشراء الفعلية؛ العملية نهائية.')) return;

        this.loading(true);
        try {
            const res = await this.api('create_stock_adjustment', {
                admin_id: adminId,
                adjustment_type: type, request_key:this.directStockRequestKey||(this.directStockRequestKey=crypto.randomUUID()),
                reason: reason,
                items: [{
                    profile_name: profile,
                    sheets_count: sheets,
                    sheet_numbers: sheetNos
                }]
            }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast('تم اعتماد التسوية؛ يُنشأ القيد عند وجود تكلفة شراء فعلية', 'success');
                this.closeModal();
                this.warehousesViewMode = 'adjustments';
                this.renderCardWarehouses();
            } else {
                this.toast(this.stockOperationError(res?.error) || 'فشل إنشاء التسوية', 'danger');
            }
        } catch (e) {
            this.loading(false);
            this.toast(e.message || 'حدث خطأ', 'danger');
        }
    },

    async onStockTransferSourceChange(sourceId) {
        App.showStockTransferModal(parseInt(sourceId));
    },

    onStockTransferProfileChange() {
        const profSel = document.getElementById('st-profile-name');
        if (!profSel) return;
        const opt = profSel.options[profSel.selectedIndex];
        if (!opt) return;

        const maxSheets = parseInt(opt.getAttribute('data-sheets') || '1');
        const sheetsInp = document.getElementById('st-sheets-count');
        if (sheetsInp) {
            sheetsInp.max = maxSheets;
            if (parseInt(sheetsInp.value) > maxSheets) sheetsInp.value = maxSheets;
        }
        App.onStockTransferSheetsInput();
    },

    onStockTransferSheetsInput() {
        const profSel = document.getElementById('st-profile-name');
        const sheetsInp = document.getElementById('st-sheets-count');
        const calcValEl = document.getElementById('st-calc-val');
        if (!profSel || !sheetsInp || !calcValEl) return;

        const opt = profSel.options[profSel.selectedIndex];
        if (!opt) return;

        const totalSheets = parseInt(opt.getAttribute('data-sheets') || '1');
        const totalCards = parseInt(opt.getAttribute('data-cards') || '0');
        const unitPrice = parseFloat(opt.getAttribute('data-price') || '0');
        const sheetsCount = parseInt(sheetsInp.value || '1');

        const cardsPerSheet = totalSheets > 0 ? Math.round(totalCards / totalSheets) : 20;
        const estCards = sheetsCount * cardsPerSheet;
        const estTotalVal = estCards * unitPrice;

        calcValEl.innerText = App.formatMoney(estTotalVal) + ` (${estCards} كرت تقريباً)`;
    },

    async executeStockTransfer() {
        const sourceId = parseInt(document.getElementById('st-source-id')?.value || '1');
        const targetId = parseInt(document.getElementById('st-target-id')?.value || '0');
        const profileName = document.getElementById('st-profile-name')?.value;
        const sheetsCount = parseInt(document.getElementById('st-sheets-count')?.value || '1');
        const notes = document.getElementById('st-notes')?.value || '';

        if (!targetId) {
            App.toast('يرجى تحديد المستلم / المخزن المستهدف', 'warning');
            return;
        }
        if (!profileName) {
            App.toast('يرجى تحديد الباقة المراد تحويلها', 'warning');
            return;
        }

        const res = await App.api('transfer_warehouse_stock', {
            source_admin_id: sourceId,
            target_admin_id: targetId,
            profile_name: profileName,
            sheets_count: sheetsCount,
            notes: notes
        }, 'POST');

        if (res && res.success) {
            App.closeModal();
            App.toast(res.message || 'تم تحويل العهدة المخزنية بنجاح', 'success');
            App.renderCardWarehouses();
        } else {
            App.toast(res?.error || 'فشل التحويل المخزني', 'danger');
        }
    },

    async showStockReturnModal(adminId) {
        const details = await this.api('get_warehouse_details', { admin_id: adminId }) || {};
        const sheets = (details.custody_sheets && details.custody_sheets.length > 0) ? details.custody_sheets : (details.sheets || []).filter(s => !s.is_sold);
        const account = details.account || {};

        if (sheets.length === 0) {
            this.toast('لا توجد أوراق أو كروت قابلة للإرجاع في هذا المخزن', 'warning');
            return;
        }

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #d97706 0%, #b45309 100%); color:#fff; border-radius:8px 8px 0 0;">
                <div style="font-weight:700; font-size:15px;">↩️ إرجاع أوراق كروت للإدارة المركزية وتخفيض المديونية</div>
                <button class="mt-btn" style="background:none; border:none; color:#fff; font-size:16px;" onclick="App.closeModal()">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:12px; margin-bottom:14px; font-size:12px; color:#92400e; line-height:1.6;">
                    🏢 المخزن المرجع: <b>${this.escapeHtml(account.fullname)}</b> | المديونية الحالية: <b>${App.formatMoney(account.balance || 0)}</b><br/>
                    💡 سيتم إرجاع الأوراق المحددة إلى المخزن الرئيسي للإدارة وتخفيض مديونية الموزع فوراً بقيمتها المالية.
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:6px; display:block;">حدد الأوراق المراد إرجاعها:</label>
                    <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:8px;">
                        ${sheets.map(s => {
                            const sNoFmt = String(s.sheet_no).padStart(6, '0');
                            return `
                                <label style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-bottom:1px solid var(--border-color); font-size:12px; cursor:pointer;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <input type="checkbox" class="st-return-sheet-chk" value="${s.sheet_no}" data-val="${s.sheet_total_value}" onchange="App.onStockReturnCheckChange()" checked />
                                        <b style="font-family:monospace; color:#4f46e5;">ورقة #${sNoFmt}</b>
                                        <span>(${this.escapeHtml(s.display_profile || s.profile_name)})</span>
                                    </div>
                                    <div style="display:flex; gap:12px;">
                                        <span>${s.cards_in_sheet} كرت</span>
                                        <b style="color:#16a34a;">${App.formatMoney(s.sheet_total_value)}</b>
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div style="background:var(--bg-sidebar); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <span>إجمالي المرتجع المحسوب:</span>
                    <b id="st-return-total-calc" style="font-size:15px; color:#16a34a;">${App.formatMoney(details.total_value)}</b>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-size:12px; font-weight:700; margin-bottom:4px; display:block;">ملاحظات الإرجاع:</label>
                    <input type="text" id="st-return-notes" class="mt-input" style="width:100%;" placeholder="مثال: تسوية حساب نهاية الشهر" />
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-warning" style="padding:7px 18px; font-weight:700;" onclick="App.executeStockReturn(${adminId})">
                        ✓ تأكيد الإرجاع وتخفيض المديونية
                    </button>
                </div>
            </div>
        `, '650px');
    },

    onStockReturnCheckChange() {
        const chks = document.querySelectorAll('.st-return-sheet-chk:checked');
        let sum = 0;
        chks.forEach(c => sum += parseFloat(c.getAttribute('data-val') || '0'));
        const calcEl = document.getElementById('st-return-total-calc');
        if (calcEl) calcEl.innerText = App.formatMoney(sum) + ` (${chks.length} ورقة)`;
    },

    async executeStockReturn(sourceId) {
        const chks = document.querySelectorAll('.st-return-sheet-chk:checked');
        const sheetNos = Array.from(chks).map(c => parseInt(c.value));
        const totalVal = Array.from(chks).reduce((acc, c) => acc + parseFloat(c.getAttribute('data-val') || 0), 0);
        const notes = document.getElementById('st-return-notes')?.value || '';

        if (sheetNos.length === 0) {
            App.toast('يرجى تحديد ورقة واحدة على الأقل للإرجاع', 'warning');
            return;
        }

        const confirmMsg = `تأكيد إرجاع عهدة كروت للإدارة المركزية:\n\n` +
            `📑 عدد الأوراق المحددة: ${sheetNos.length} ورقة\n` +
            `💰 إجمالي القيمة المالية المسترجعة: ${App.formatMoney(totalVal)}\n\n` +
            `سيتم إعادة الكروت إلى المخزن الرئيسي وتخفيض مديونية الموزع فوراً بهذا المبلغ. هل تريد المتابعة؟`;
        if (!confirm(confirmMsg)) return;

        const res = await App.api('return_warehouse_stock', {
            source_admin_id: sourceId,
            target_admin_id: 1,
            sheet_numbers: sheetNos,
            notes: notes
        }, 'POST');

        if (res && res.success) {
            App.closeModal();
            App.toast(res.message || 'تم إرجاع الكروت بنجاح', 'success');
            App.renderCardWarehouses();
        } else {
            App.toast(res?.error || 'فشل عملية الإرجاع', 'danger');
        }
    },

    async printWarehouseAuditReport(adminId) {
        const res = await this.api('get_warehouse_audit_report', { admin_id: adminId }) || {};
        const rep = res.report || {};
        const acc = rep.account || {};
        const auditor = rep.auditor || {};
        const profilesStock = rep.profiles_stock || [];

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>محضر جرد وتدقيق مخزني شامل - ${acc.fullname || ''}</title>
                <style>
                    body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; padding: 25px; color: #1e293b; direction: rtl; line-height:1.6; }
                    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                    .header h2 { margin: 0 0 4px 0; color: #0f172a; font-size:18px; }
                    .header .sub { font-size: 12px; color: #475569; }
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 12px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11.5px; }
                    th, td { border: 1px solid #94a3b8; padding: 6px 8px; text-align: right; }
                    th { background: #f1f5f9; font-weight: bold; color: #0f172a; }
                    .sec-title { font-size: 13px; font-weight: bold; margin: 14px 0 6px 0; display: flex; justify-content: space-between; align-items: center; }
                    .badge-custody { background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
                    .badge-sold { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
                    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; text-align: center; font-size: 12px; page-break-inside: avoid; }
                    .sig-line { margin-top: 40px; border-top: 1px dashed #64748b; padding-top: 6px; }
                    @media print { body { padding: 10px; } button { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>🏢 محضر جرد وتدقيق مخزني رسمي لكروت الإنترنت والعهد</h2>
                    <div class="sub">نظام إدارة الشبكات والمشتركين والفوترة المتقدمة</div>
                </div>

                <div class="meta-grid">
                    <div><b>المخزن / أمين العهدة:</b> ${acc.fullname || '-'} (${acc.role || '-'})</div>
                    <div><b>تاريخ ووقت الجرد:</b> ${rep.audit_date || ''}</div>
                    <div><b>رقم الهاتف:</b> ${acc.phone || '-'}</div>
                    <div><b>مسؤول التدقيق:</b> ${auditor.fullname || 'المدير العام'}</div>
                    <div><b>المديونية المسجلة:</b> ${App.formatMoney(acc.balance || 0)}</div>
                    <div><b>إجمالي الرصيد الفوري:</b> ${App.formatMoney(rep.instant_balance || 0)}</div>
                </div>

                <!-- Section 1: Custody Cards Summary -->
                <div class="sec-title">
                    <span>📦 أولاً: كشف كروت وأوراق العهدة المخزنية (غير المباعة - في عهدة الحساب)</span>
                    <span class="badge-custody">إجمالي العهدة: ${Number(rep.custody_cards || 0).toLocaleString()} كرت</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>الباقة</th>
                            <th>عدد كروت العهدة</th>
                            <th>عدد أوراق العهدة</th>
                            <th>نطاق أرقام أوراق العهدة</th>
                            <th>سعر الكرت الواحد</th>
                            <th>إجمالي قيمة العهدة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profilesStock.filter(p => (p.custody_cards || 0) > 0).map(p => `
                            <tr>
                                <td><b>${p.display_profile || p.profile_name}</b></td>
                                <td style="font-weight:bold; text-align:center;">${(p.custody_cards || 0).toLocaleString()}</td>
                                <td style="font-weight:bold; text-align:center;">${(p.custody_sheets || 0).toLocaleString()}</td>
                                <td style="font-family:monospace; font-weight:bold;">${p.custody_sheet_ranges || '-'}</td>
                                <td>${App.formatMoney(p.unit_price)}</td>
                                <td style="font-weight:bold; color:#166534;">${App.formatMoney((p.custody_cards || 0) * (p.unit_price || 0))}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; color:#64748b;">لا توجد كروت عهدة مخزنية متبقية</td></tr>'}
                    </tbody>
                </table>

                <!-- Section 2: Sold Cards Summary -->
                <div class="sec-title">
                    <span>🛒 ثانياً: كشف الكروت والأوراق المباعة بفواتير (المشتراة للموزع والمتاحة لمشتركيه)</span>
                    <span class="badge-sold">إجمالي المباع: ${Number(rep.sold_cards || 0).toLocaleString()} كرت</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>الباقة</th>
                            <th>عدد الكروت المتبقية للبيع</th>
                            <th>عدد الأوراق</th>
                            <th>نطاق أرقام أوراق الفواتير</th>
                            <th>سعر الكرت</th>
                            <th>إجمالي القيمة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profilesStock.filter(p => (p.sold_cards || 0) > 0).map(p => `
                            <tr>
                                <td><b>${p.display_profile || p.profile_name}</b></td>
                                <td style="font-weight:bold; text-align:center;">${(p.sold_cards || 0).toLocaleString()}</td>
                                <td style="font-weight:bold; text-align:center;">${(p.sold_sheets || 0).toLocaleString()}</td>
                                <td style="font-family:monospace; font-weight:bold;">${p.sold_sheet_ranges || '-'}</td>
                                <td>${App.formatMoney(p.unit_price)}</td>
                                <td style="font-weight:bold; color:#92400e;">${App.formatMoney((p.sold_cards || 0) * (p.unit_price || 0))}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center; color:#64748b;">لا توجد كروت مباعة بفواتير متبقية</td></tr>'}
                    </tbody>
                </table>

                <!-- Section 3: Instant Balance Summary -->
                <div class="sec-title">
                    <span>⚡ ثالثاً: كشف أرصدة الشحن الفوري (المتبقية بالمخزن)</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>نوع الرصيد</th>
                            <th>الرصيد المتبقي (${App.getCurrencySymbol(App._baseCurrency)})</th>
                            <th>الحالة والوصف</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><b>📦 رصيد فوري عهدة (منح / تحويل عهدة)</b></td>
                            <td style="font-weight:bold; color:#0369a1;">${App.formatMoney(rep.custody_balance || 0)}</td>
                            <td>رصيد عهدة مسلم للحساب للتوزيع أو التوليد</td>
                        </tr>
                        <tr>
                            <td><b>🛒 رصيد فوري مشتريات (مباع بفواتير)</b></td>
                            <td style="font-weight:bold; color:#7c3aed;">${App.formatMoney(rep.sold_balance || 0)}</td>
                            <td>رصيد مشتريات مسدد أو مقيد على حساب الموزع</td>
                        </tr>
                        <tr style="background:#f8fafc; font-weight:bold;">
                            <td>إجمالي الرصيد الفوري الكلي</td>
                            <td style="font-size:13px; color:#0f172a;">${App.formatMoney(rep.instant_balance || 0)}</td>
                            <td>المتاح الفعلي لإصدار الكروت الرقمية وعمليات الشحن</td>
                        </tr>
                    </tbody>
                </table>

                <div class="signatures">
                    <div>
                        <b>أمين المخزن / المستلم</b>
                        <div class="sig-line">${acc.fullname || ''}</div>
                    </div>
                    <div>
                        <b>المشرف / المدقق المخزني</b>
                        <div class="sig-line">${auditor.fullname || 'المدير العام'}</div>
                    </div>
                    <div>
                        <b>إدارة الحسابات والرقابة</b>
                        <div class="sig-line">الختم والاعتماد الرسمي</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
    },

    // ==========================================
    // POS FREE VOUCHERS REWARD RULES & ACTIONS
    // ==========================================

    async showPosFreeRuleModal(rule = null) {
        if (this._freeVouchersNetworkId !== this.activeNetworkId) {
            this._freeVouchersProfiles = null;
            this._freeVouchersAdmins = null;
            this._freeVouchersNetworkId = this.activeNetworkId;
        }
        const isEdit = !!rule;
        let admins = this._freeVouchersAdmins || [];
        let profiles = this._freeVouchersProfiles || [];
        if (!admins.length) {
            const res = await this.api('get_admins_with_roles');
            admins = res?.admins || [];
            this._freeVouchersAdmins = admins;
        }
        if (!profiles.length) {
            const res = await this.api('get_profiles');
            profiles = res?.data || res || [];
            this._freeVouchersProfiles = profiles;
        }
        
        // Filter POS & Distributors admins
        const posAdmins = admins.filter(a => ['pos_agent', 'distributor', 'admin'].includes(a.role));
        const paidProfiles = profiles.filter(p => parseFloat(p.price) > 0 || (p.package_type && p.package_type !== 'free'));
        const freeProfiles = profiles.filter(p => parseFloat(p.price) === 0 || p.name.startsWith('Free-') || p.package_type === 'free');
        const defaultPaidProfiles = paidProfiles.length ? paidProfiles : profiles;
        const defaultFreeProfiles = freeProfiles.length ? freeProfiles : profiles;

        const selPosId = rule ? parseInt(rule.pos_admin_id, 10) : 0;
        const selPaidProfile = rule ? (rule.paid_profile_name || '') : (defaultPaidProfiles[0]?.name || '');
        const selRuleType = rule ? rule.rule_type : 'sheets_sales';
        const selThreshold = rule ? rule.threshold_value : 1;
        const selCardsCount = rule ? rule.free_cards_count : 1;
        const selProfile = rule ? rule.profile_name : (defaultFreeProfiles[0]?.name || '');
        const selIncludeSub = rule ? (rule.include_sub_pos == 1) : true;
        const selSendMethod = rule ? rule.send_method : 'whatsapp';
        const selIsActive = rule ? (rule.is_active == 1) : true;
        const selNotes = rule ? (rule.notes || '') : '';

        this.openModal(`
            <div style="font-weight:bold; font-size:16px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                <span>${isEdit ? '✏️ تعديل قاعدة منح كروت مجانية لمبيعات الورق' : '➕ إضافة قاعدة منح كروت مجانية لمبيعات الورق'}</span>
            </div>
            <form onsubmit="event.preventDefault(); App.submitSavePosFreeRule(${rule?.id || 0});" style="display:flex; flex-direction:column; gap:14px;">
                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">نطاق التطبيق (نقطة البيع / الوكيل المستهدف): <span style="color:red;">*</span></label>
                    <select id="pos-rule-admin-id" class="mt-input" style="width:100%;">
                        <option value="0" ${selPosId === 0 ? 'selected' : ''}>🌐 تطبيق عام على جميع نقاط البيع والوكلاء بالشبكة</option>
                        ${posAdmins.map(a => `<option value="${a.id}" ${selPosId === a.id ? 'selected' : ''}>${a.parent_name ? '↳ [فرعي] ' : '★ [رئيسي] '} ${a.fullname} (${a.role_name_ar || a.role}) ${a.phone ? ' - ' + a.phone : ''}</option>`).join('')}
                    </select>
                    <small style="color:#64748b; font-size:11px; display:block; margin-top:2px;">
                        💡 <strong>ملاحظة هامة:</strong> القاعدة العامة تطبق على كافة الوكلاء. وفي حال تم تخصيص وكيل معين لنفس الباقة، يتم استثناؤه تلقائياً وتطبيق شروطه الخاصة بدلاً من العامة.
                    </small>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">نوع الباقة المدفوعة (المشتراة بالورق): <span style="color:red;">*</span></label>
                        <select id="pos-rule-paid-profile" class="mt-input" style="width:100%; font-weight:600;" required>
                            ${defaultPaidProfiles.map(p => {
                                const price = parseFloat(p.price || 0);
                                return `<option value="${p.name}" ${selPaidProfile === p.name ? 'selected' : ''}>🛒 ${p.name_for_users || p.name} (${App.formatMoney(price)})</option>`;
                            }).join('')}
                        </select>
                        <small style="color:#64748b; font-size:11px; display:block; margin-top:2px;">الباقة التجارية المشتراة بفاتورة الورق (لا يتكرر تعريفها في نفس النطاق).</small>
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">الباقة المجانية الممنوحة (كروت الهدية): <span style="color:red;">*</span></label>
                        <select id="pos-rule-profile" class="mt-input" style="width:100%; font-weight:600;" required>
                            ${defaultFreeProfiles.map(p => {
                                const bytes = parseInt(p.transfer_limit || 0, 10);
                                return `<option value="${p.name}" ${selProfile === p.name ? 'selected' : ''}>🎁 ${p.name_for_users || p.name} (${App.formatBytes(bytes)})</option>`;
                            }).join('')}
                        </select>
                        <small style="color:#64748b; font-size:11px; display:block; margin-top:2px;">نوع الكروت المجانية التي سيتم توليدها وإرسالها للوكيل.</small>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">معيار ومنهجية المنح: <span style="color:red;">*</span></label>
                        <select id="pos-rule-type" class="mt-input" style="width:100%;" onchange="App.onPosRuleTypeChange(this.value)">
                            <option value="sheets_sales" ${selRuleType === 'sheets_sales' ? 'selected' : ''}>📄 بحسب عدد أوراق الكروت المباعة (Sheets)</option>
                            <option value="revenue_sales" ${selRuleType === 'revenue_sales' ? 'selected' : ''}>💰 بحسب إجمالي قيمة المبيعات (YER)</option>
                            <option value="data_consumption" ${selRuleType === 'data_consumption' ? 'selected' : ''}>📶 بحسب إجمالي استهلاك البيانات (GB)</option>
                        </select>
                    </div>
                    <div>
                        <label id="pos-rule-threshold-lbl" style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">معامل الاحتساب (لكل X ورقة مباعة): <span style="color:red;">*</span></label>
                        <input type="number" id="pos-rule-threshold" class="mt-input" style="width:100%;" step="any" min="0.1" value="${selThreshold}" required oninput="App.onPosRuleCardsCountChange()" />
                        <small id="pos-rule-threshold-hint" style="color:#64748b; font-size:11px; display:block; margin-top:2px;">مثال: 1 (لكل ورقة كروت واحدة مباعة ومسددة)</small>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">عدد الكروت المجانية الممنوحة: <span style="color:red;">*</span></label>
                        <input type="number" id="pos-rule-cards-count" class="mt-input" style="width:100%;" min="1" max="4" value="${selCardsCount}" required oninput="App.onPosRuleCardsCountChange()" />
                        <small id="pos-rule-cards-hint" style="color:#0369a1; font-size:11px; display:block; margin-top:2px; font-weight:600;">
                            💡 الحد الأقصى: 4 كروت لكل 1 ورقة مباعة
                        </small>
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">طريقة تسليم الكروت لصاحب النقطة:</label>
                        <select id="pos-rule-send-method" class="mt-input" style="width:100%;">
                            <option value="whatsapp" ${selSendMethod === 'whatsapp' ? 'selected' : ''}>💬 إرسال واتساب آلي فوري لرقم الوكيل</option>
                            <option value="sms" ${selSendMethod === 'sms' ? 'selected' : ''}>📱 إرسال رسالة SMS</option>
                            <option value="both" ${selSendMethod === 'both' ? 'selected' : ''}>💬 واتساب + SMS</option>
                            <option value="none" ${selSendMethod === 'none' ? 'selected' : ''}>🔒 توليد وحفظ داخل النظام فقط</option>
                        </select>
                    </div>
                </div>

                <div style="padding-top:4px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; cursor:pointer;">
                        <input type="checkbox" id="pos-rule-include-sub" ${selIncludeSub ? 'checked' : ''} />
                        <span>شمل مبيعات واستحقاق النقاط الفرعية التابعة لنفس الحساب</span>
                    </label>
                </div>

                <div>
                    <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">ملاحظات / وصف القاعدة:</label>
                    <input type="text" id="pos-rule-notes" class="mt-input" style="width:100%;" placeholder="مثلاً: بونص كرتين مجانية لكل ورقة 500 ريال مسددة" value="${this.escape(selNotes)}" />
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px; border-top:1px solid #e2e8f0; padding-top:12px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="pos-rule-is-active" ${selIsActive ? 'checked' : ''} />
                        <span>تفعيل القاعدة فوراً</span>
                    </label>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="button" class="mt-btn mt-btn-primary" onclick="App.submitSavePosFreeRule(${rule?.id || 0})">💾 حفظ وتطبيق القاعدة</button>
                    </div>
                </div>
            </form>
        `);
    },

    editPosFreeRule(ruleId) {
        const rule = (this._allPosRules || []).find(r => Number(r.id) === Number(ruleId));
        this.showPosFreeRuleModal(rule || null);
    },

    onPosRuleTypeChange(type) {
        const lbl = document.getElementById('pos-rule-threshold-lbl');
        const hint = document.getElementById('pos-rule-threshold-hint');
        const cardsCountInp = document.getElementById('pos-rule-cards-count');
        const cardsHint = document.getElementById('pos-rule-cards-hint');
        const threshInp = document.getElementById('pos-rule-threshold');

        if (type === 'sheets_sales') {
            if (lbl) lbl.innerText = 'معامل الاحتساب (لكل X ورقة مباعة): *';
            if (hint) hint.innerText = 'مثال: 1 (لكل ورقة كروت واحدة مباعة ومسددة)';
            if (threshInp && (!threshInp.value || parseFloat(threshInp.value) > 100)) threshInp.value = 1;
            if (cardsHint) cardsHint.innerText = '💡 الحد الأقصى: 4 كروت للورقة الواحدة';
        } else if (type === 'revenue_sales') {
            if (lbl) lbl.innerText = 'معامل الاحتساب (لكل X ريال مبيعات): *';
            if (hint) hint.innerText = 'مثال: 50000 (لكل 50,000 ريال مبيعات)';
            if (threshInp && parseFloat(threshInp.value) <= 10) threshInp.value = 50000;
            if (cardsHint) cardsHint.innerText = '💡 عدد الكروت الممنوحة عند تحقيق المبلغ';
        } else if (type === 'data_consumption') {
            if (lbl) lbl.innerText = 'معامل الاحتساب (لكل X جيجابايت استهلاك): *';
            if (hint) hint.innerText = 'مثال: 100 (لكل 100 GB استهلاك بيانات)';
            if (threshInp && parseFloat(threshInp.value) > 1000) threshInp.value = 100;
            if (cardsHint) cardsHint.innerText = '💡 عدد الكروت الممنوحة عند تحقيق الاستهلاك';
        }
        this.onPosRuleCardsCountChange();
    },

    onPosRuleCardsCountChange() {
        const typeEl = document.getElementById('pos-rule-type');
        const threshEl = document.getElementById('pos-rule-threshold');
        const countEl = document.getElementById('pos-rule-cards-count');
        const hintEl = document.getElementById('pos-rule-cards-hint');

        if (!typeEl || !countEl || !threshEl) return;
        const type = typeEl.value;
        const thresh = parseFloat(threshEl.value || 1);
        const count = parseInt(countEl.value || 1, 10);

        if (type === 'sheets_sales') {
            const maxAllowed = Math.max(1, Math.min(4, Math.round(4 * thresh)));
            countEl.max = maxAllowed;
            if (count > maxAllowed) {
                countEl.value = maxAllowed;
                if (hintEl) hintEl.innerText = `⚠️ تم التعديل إلى الحد الأقصى المسموح: ${maxAllowed} كروت (${thresh} ورقة × 4 كروت)`;
            } else {
                if (hintEl) hintEl.innerText = `💡 مسموح حتى ${maxAllowed} كروت مجانية (الحد الأقصى 4 كروت لكل 1 ورقة)`;
            }
        } else {
            countEl.removeAttribute('max');
        }
    },

    async submitSavePosFreeRule(ruleId = 0) {
        const posAdminId = parseInt(document.getElementById('pos-rule-admin-id')?.value || '0', 10);
        const paidProfileName = document.getElementById('pos-rule-paid-profile')?.value || '';
        const ruleType = document.getElementById('pos-rule-type')?.value || 'sheets_sales';
        const thresholdValue = parseFloat(document.getElementById('pos-rule-threshold')?.value || '1');
        const freeCardsCount = parseInt(document.getElementById('pos-rule-cards-count')?.value || '1', 10);
        const profileName = document.getElementById('pos-rule-profile')?.value || '';
        const includeSubPos = document.getElementById('pos-rule-include-sub')?.checked ? 1 : 0;
        const sendMethod = document.getElementById('pos-rule-send-method')?.value || 'whatsapp';
        const isActive = document.getElementById('pos-rule-is-active')?.checked ? 1 : 0;
        const notes = document.getElementById('pos-rule-notes')?.value || '';

        if (!paidProfileName) {
            return this.toast('يرجى اختيار نوع الباقة المدفوعة المشتراة', 'warning');
        }

        if (!profileName) {
            return this.toast('يرجى اختيار الباقة المجانية الممنوحة', 'warning');
        }

        if (ruleType === 'sheets_sales') {
            const maxAllowed = Math.round(4 * thresholdValue);
            if (freeCardsCount > maxAllowed) {
                return this.toast(`الحد الأقصى للكروت هو 4 كروت للورقة الواحدة (أقصى حد لـ ${thresholdValue} ورقة هو ${maxAllowed} كرت)`, 'danger');
            }
        }

        // Check for existing rule for same paid profile and POS scope
        const existingRules = this._allPosRules || [];
        const existingMatched = existingRules.find(r => 
            parseInt(r.pos_admin_id, 10) === posAdminId &&
            (r.paid_profile_name || '').toLowerCase() === paidProfileName.toLowerCase()
        );
        if (existingMatched && !ruleId) {
            ruleId = parseInt(existingMatched.id, 10);
        }

        this.loading(true);
        try {
            const res = await this.api('save_pos_free_voucher_rule', {
                id: ruleId,
                pos_admin_id: posAdminId,
                paid_profile_name: paidProfileName,
                rule_type: ruleType,
                threshold_value: thresholdValue,
                free_cards_count: freeCardsCount,
                profile_name: profileName,
                include_sub_pos: includeSubPos,
                send_method: sendMethod,
                is_active: isActive,
                notes
            }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast(res.message || 'تم حفظ وتطبيق قاعدة المنح بنجاح', 'success');
                this.closeModal();
                this.renderFreeVouchers('pos_rules');
            } else {
                this.toast(res?.error || 'فشل حفظ القاعدة', 'danger');
            }
        } catch (err) {
            this.loading(false);
            this.toast(err?.message || 'حدث خطأ أثناء حفظ القاعدة', 'danger');
        }
    },

    async deletePosFreeRule(ruleId) {
        if (!confirm('هل أنت متأكد من حذف قاعدة منح الكروت لنقطة البيع هذه؟')) return;
        this.loading(true);
        try {
            const res = await this.api('delete_pos_free_voucher_rule', { id: ruleId }, 'POST');
            this.loading(false);
            if (res && res.success) {
                this.toast('تم حذف القاعدة بنجاح', 'success');
                this.renderFreeVouchers('pos_rules');
            } else {
                this.toast(res?.error || 'فشل حذف القاعدة', 'danger');
            }
        } catch (err) {
            this.loading(false);
            this.toast(err?.message || 'حدث خطأ أثناء الحذف', 'danger');
        }
    },

    async grantPosFreeVouchers(ruleId, posAdminId, pendingCount, posName) {
        if (!confirm(`هل ترغب في صرف ${pendingCount} كرت مجاني مستحق الآن لصالح مسؤول نقطة البيع (${posName})؟`)) return;
        this.loading(true);
        try {
            const res = await this.api('grant_pos_free_vouchers', {
                rule_id: ruleId,
                pos_admin_id: posAdminId,
                cards_count: pendingCount
            });
            this.loading(false);
            if (res.success) {
                this.toast(res.message || `تم بنجاح توليد وصرف ${res.granted_count} كرت مجاني`, 'success');
                this.renderFreeVouchers('pos_rules');
            } else {
                this.toast(res.error || 'فشل صرف الكروت المستحقة', 'danger');
            }
        } catch (err) {
            this.loading(false);
            this.toast(err.message || 'حدث خطأ أثناء صرف الكروت', 'danger');
        }
    },

    async grantAllEligiblePosFreeVouchers() {
        if (!confirm('هل أنت متأكد من صرف كافة الكروت المجانية المستحقة لجميع نقاط البيع المؤهلة دفعة واحدة؟')) return;
        this.loading(true);
        try {
            const res = await this.api('grant_all_eligible_pos_free_vouchers');
            this.loading(false);
            if (res.success) {
                this.toast(res.message || `تم صرف ${res.total_granted_cards} كرت مجاني بنجاح`, 'success');
                this.renderFreeVouchers('pos_rules');
            } else {
                this.toast(res.error || 'فشل تنفيذ عملية الصرف الجماعي', 'danger');
            }
        } catch (err) {
            this.loading(false);
            this.toast(err.message || 'حدث خطأ أثناء الصرف الجماعي', 'danger');
        }
    }
});
