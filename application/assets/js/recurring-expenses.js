/**

 * SAM User Manager — Operating Expenses & Recurring Commitments Module

 * Standard Winbox UI + Mobile Responsive Pattern (Actions / Filters / Stats)

 */

'use strict';



(function () {

    if (!window.App) return;



    // Direct Expenses Categories (Operational Vouchers)

    const DIRECT_EXPENSE_TYPES = {

        fuel: {

            label: 'المحروقات والديزل للمولدات',

            shortLabel: 'محروقات وديزل',

            icon: '⛽',

            accountCode: '5403',

            accountName: 'مصروف المحروقات',

            color: '#d97706',

            bgColor: '#fffbeb',

            fields: {

                provider: { label: 'المورد / محطة الوقود', placeholder: 'اسم محطة التزود بالوقود' },

                itemDesc: { label: 'اسم المولد / المحطة المستهدفة', placeholder: 'مثال: مولد بيركنز 25KVA' },

                subType: { label: 'نوع الوقود (ديزل / بترول / زيوت وفلاتر)', placeholder: 'ديزل / زيت مولد وفلاتر' },

                qtyRate: { label: 'الكمية وسعر اللتر (توثيقي)', placeholder: 'مثال: 100 لتر بسعر 1100 ر.ي' }

            }

        },

        maintenance_parts: {

            label: 'مشتريات مواد وقطع الصيانة',

            shortLabel: 'مواد وقطع صيانة',

            icon: '🛠️',

            accountCode: '5404',

            accountName: 'مشتريات مواد وقطع الصيانة',

            color: '#0284c7',

            bgColor: '#f0f9ff',

            fields: {

                provider: { label: 'المحل / المورد التجاري', placeholder: 'اسم محل المعدات والإلكترونيات' },

                itemDesc: { label: 'المادة / المعدة المشتراة', placeholder: 'مثال: أنتينات ميمو، كابلات فايبر، باور سبلاي' },

                subType: { label: 'الكمية والوحدة والمواصفات', placeholder: 'مثال: 2 حبة / 500 متر' },

                qtyRate: { label: 'رقم فاتورة الشراء الأصلية', placeholder: 'رقم فاتورة المحل' }

            }

        },

        maintenance_labor: {

            label: 'أجور الصيانة والتصليح',

            shortLabel: 'أجور صيانة وتصليح',

            icon: '👷',

            accountCode: '5405',

            accountName: 'أجور الصيانة والتصليح',

            color: '#e11d48',

            bgColor: '#fff1f2',

            fields: {

                provider: { label: 'الفني / المهندس / المقاول المنفذ', placeholder: 'اسم المهندس أو الفني المنفذ' },

                itemDesc: { label: 'طبيعة العمل / الخدمة المنجزة', placeholder: 'مثال: لحام فايبر، تمديد خط، صيانة برج' },

                subType: { label: 'الموقع أو العقدة المنجز فيها العمل', placeholder: 'مثال: برج حي الأمل / موقع السنترال' },

                qtyRate: { label: 'ساعات العمل أو التقرير الفني', placeholder: 'تقرير موجز عن الإنجاز' }

            }

        },

        electricity: {

            label: 'الكهرباء والطاقة وفواتير الطاقة الشمسية',

            shortLabel: 'كهرباء وطاقة',

            icon: '⚡',

            accountCode: '5406',

            accountName: 'مصروف الكهرباء والطاقة',

            color: '#ca8a04',

            bgColor: '#fefce8',

            fields: {

                provider: { label: 'شركة الكهرباء / المورد / المحطة', placeholder: 'اسم محطة الكهرباء التجارية أو العامة' },

                itemDesc: { label: 'رقم العداد / الموقع المستهدف', placeholder: 'رقم عداد البرج أو الموقع' },

                subType: { label: 'نوع الطاقة (تجاري / عمومي / شحن بطاريات)', placeholder: 'كهرباء تجاري / كرت دفع مسبق' },

                qtyRate: { label: 'قراءة العداد أو الكيلووات', placeholder: 'رقم الكيلو أو فترة الاستهلاك' }

            }

        },

        general: {

            label: 'مصروف تشغيلي عام ونثريات',

            shortLabel: 'مصروف عام',

            icon: '📋',

            accountCode: '5401',

            accountName: 'مصروف تشغيلي عام',

            color: '#475569',

            bgColor: '#f8fafc',

            fields: {

                provider: { label: 'المدفوع له (المستفيد)', placeholder: 'اسم الجهة أو الشخص المستلم' },

                itemDesc: { label: 'البيان وتفاصيل المصروف', placeholder: 'شرح وتفاصيل المصروف' },

                subType: { label: 'ملاحظات إضافية', placeholder: 'أي تفاصيل أخرى' },

                qtyRate: { label: 'الرقم المرجعي', placeholder: 'رقم الإشعار أو الفاتورة' }

            }

        }

    };



    // Recurring Commitments Categories (Internet lines, Site Rents)

    const RECURRING_TYPES = {

        internet: {

            label: 'اشتراكات وخطوط الإنترنت والمزودين',

            shortLabel: 'خط إنترنت',

            icon: '🌐',

            accountCode: '5401',

            accountName: 'مصروف الإنترنت والخطوط',

            color: '#0284c7',

            bgColor: '#f0f9ff',

            fields: {

                provider: { label: 'مزود الخدمة (ISP) *', placeholder: 'مثال: يمن نت، عدن نت، سبأفون، يمن موبايل' },

                phone: { label: 'رقم الهاتف الأرضي / الشريحة *', placeholder: 'مثال: 01xxxxxx أو 77xxxxxxx' },

                contract: { label: 'رقم حساب المشترك / العقد', placeholder: 'رقم الحساب لدى المزود' },

                package: { label: 'اسم الباقة والسرعة المخصصة', placeholder: 'مثال: سوبر نت فايبر 50Mbps' }

            }

        },

        rent: {

            label: 'إيجارات المواقع والأبراج والعقارات',

            shortLabel: 'إيجار موقع/برج',

            icon: '🏢',

            accountCode: '5402',

            accountName: 'مصروف الإيجارات',

            color: '#7c3aed',

            bgColor: '#f5f3ff',

            fields: {

                provider: { label: 'اسم المؤجر / المالك *', placeholder: 'اسم مالك الموقع أو العقار' },

                phone: { label: 'رقم هاتف المؤجر', placeholder: 'مثال: 777123456' },

                contract: { label: 'رقم عقد الإيجار', placeholder: 'رقم عقد الإيجار الموثق' },

                location: { label: 'الموقع / الحي / تفاصيل البرج', placeholder: 'مثال: برج حي الأمل - السطح الشرقي' }

            }

        }

    };

    RECURRING_TYPES.isp_line = RECURRING_TYPES.internet;

    RECURRING_TYPES.site_rent = RECURRING_TYPES.rent;



    function esc(s) {

        if (s == null) return '';

        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    }



    function money(v) {
        if (window.App && typeof window.App.formatMoney === 'function') {
            return window.App.formatMoney(v);
        }
        return (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.ي';
    }



    function today() {

        return new Date().toISOString().slice(0, 10);

    }



    function getTransactionalCashAccounts(accounts) {

        return accounts.filter(a => {

            if (a.account_type !== 'asset') return false;

            const c = String(a.account_code || '');

            return c.startsWith('110') || c.startsWith('111') || c.startsWith('1302');

        });

    }



    // State Variables

    App.expensesActiveTab = App.expensesActiveTab || 'direct';

    App.expensesSearch = App.expensesSearch || '';

    App.expensesTypeFilter = App.expensesTypeFilter || '';

    App.expensesStartDate = App.expensesStartDate || '';

    App.expensesEndDate = App.expensesEndDate || '';



    /**

     * Main Renderer for Operating Expenses Hub (Uses standard SAM Winbox & Mobile Responsive Architecture)

     */

    App.renderOperatingExpenses = async function (activeTab = null) {
        if (activeTab) this.expensesActiveTab = activeTab;
        const currentActiveTab = this.expensesActiveTab || 'direct';
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        // Fetch data
        const d = await this.loadOperatingExpensesData();
        this._recurringData = d;

        const allAccounts = d.accounts || [];
        const cashAccounts = getTransactionalCashAccounts(allAccounts);
        const cashboxAcc = d.cashbox_account || cashAccounts.find(a => String(a.account_code) === '1101') || cashAccounts[0] || {};
        const adminAcc = d.current_admin_account || {};

        // Filter direct payments
        let directPayments = d.direct_payments || [];
        if (this.expensesSearch) {
            const q = this.expensesSearch.toLowerCase();
            directPayments = directPayments.filter(p => 
                (p.payment_no && p.payment_no.toLowerCase().includes(q)) ||
                (p.title_snapshot && p.title_snapshot.toLowerCase().includes(q)) ||
                (p.party_name && p.party_name.toLowerCase().includes(q)) ||
                (p.notes && p.notes.toLowerCase().includes(q))
            );
        }
        if (this.expensesTypeFilter) {
            const f = this.expensesTypeFilter;
            directPayments = directPayments.filter(p => p.expense_type === f || (f === 'internet' && p.expense_type === 'isp_line') || (f === 'rent' && p.expense_type === 'site_rent'));
        }
        if (this.expensesStartDate) {
            directPayments = directPayments.filter(p => p.payment_date >= this.expensesStartDate);
        }
        if (this.expensesEndDate) {
            directPayments = directPayments.filter(p => p.payment_date <= this.expensesEndDate);
        }

        // Filter recurring commitments
        let recurringItems = (d.recurring_expenses || d.items || []);
        if (this.expensesSearch) {
            const q = this.expensesSearch.toLowerCase();
            recurringItems = recurringItems.filter(x => 
                (x.title && x.title.toLowerCase().includes(q)) ||
                (x.provider_name && x.provider_name.toLowerCase().includes(q)) ||
                (x.line_identifier && x.line_identifier.toLowerCase().includes(q))
            );
        }
        if (this.expensesTypeFilter) {
            const f = this.expensesTypeFilter;
            recurringItems = recurringItems.filter(x => x.expense_type === f || (f === 'internet' && x.expense_type === 'isp_line') || (f === 'rent' && x.expense_type === 'site_rent'));
        }

        const PB = window.SamUI?.PageBuilder;

        const actions = [
            { label: '💳 + سند صرف تشغيلي', variant: 'danger', onclick: 'App.openDirectExpenseModal()' },
            { label: '🌐 + التزام / اشتراك دوري', variant: 'primary', onclick: 'App.openCommitmentModal()' },
            { label: '📜 سجل السندات والقيود', variant: 'secondary', onclick: 'App.openRecurringPayments()' },
            { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderOperatingExpenses()' }
        ];

        const stats = [
            { label: 'إجمالي المصروفات المباشرة', value: money(d.summary?.direct_total || 0), icon: '💳', tone: 'rose', meta: `${d.summary?.direct_count || 0} سند صرف` },
            { label: 'التكلفة الشهرية للالتزامات', value: money(d.summary?.recurring_monthly_cost || 0), icon: '🔄', tone: 'blue', meta: `${d.summary?.recurring_count || 0} عقد / خط` },
            { label: 'رصيد الصندوق الرئيسي', value: money(cashboxAcc.balance || 0), icon: '💰', tone: 'green', meta: `[${cashboxAcc.account_code || '1101'}]` },
            { label: 'رصيد حساب المشرف', value: money(adminAcc.balance || 0), icon: '👤', tone: 'amber', meta: `[${adminAcc.account_code || '-'}]` }
        ];

        const tabsNav = `
            <div class="view-mode-group" style="display:inline-flex; border:1px solid var(--sam-border, #cbd5e1); border-radius:6px; overflow:hidden;">
                <button type="button" class="sam-btn sam-btn--sm ${currentActiveTab === 'direct' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0;" onclick="App.switchOperatingExpensesTab('direct')">
                    ⚡ سندات الصرف المباشرة (${(directPayments || []).length})
                </button>
                <button type="button" class="sam-btn sam-btn--sm ${currentActiveTab === 'recurring' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0;" onclick="App.switchOperatingExpensesTab('recurring')">
                    🔄 عقود واشتراكات خطوط الإنترنت والمواقع (${(recurringItems || []).length})
                </button>
            </div>
        `;

        const toolbar = {
            left: [
                tabsNav
            ],
            right: [
                `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <input type="text" class="sam-input mt-input" placeholder="🔍 رقم السند، المورد، البيان..." value="${esc(this.expensesSearch)}" onkeydown="if(event.key==='Enter'){ App.expensesSearch=this.value; App.renderOperatingExpenses(); }" style="min-width:170px;" />
                    <select class="sam-select mt-select" onchange="App.expensesTypeFilter=this.value; App.renderOperatingExpenses();">
                        <option value="">كل أنواع المصروفات</option>
                        <option value="fuel" ${this.expensesTypeFilter === 'fuel' ? 'selected' : ''}>⛽ المحروقات والديزل</option>
                        <option value="maintenance_parts" ${this.expensesTypeFilter === 'maintenance_parts' ? 'selected' : ''}>🛠️ مواد وقطع صيانة</option>
                        <option value="maintenance_labor" ${this.expensesTypeFilter === 'maintenance_labor' ? 'selected' : ''}>👷 أجور صيانة وتصليح</option>
                        <option value="electricity" ${this.expensesTypeFilter === 'electricity' ? 'selected' : ''}>⚡ كهرباء وطاقة</option>
                        <option value="internet" ${this.expensesTypeFilter === 'internet' || this.expensesTypeFilter === 'isp_line' ? 'selected' : ''}>🌐 خطوط الإنترنت</option>
                        <option value="rent" ${this.expensesTypeFilter === 'rent' || this.expensesTypeFilter === 'site_rent' ? 'selected' : ''}>🏢 إيجار أبراج ومواقع</option>
                        <option value="general" ${this.expensesTypeFilter === 'general' ? 'selected' : ''}>📋 مصروف تشغيلي عام</option>
                    </select>
                    <div style="display:inline-flex; align-items:center; gap:4px;">
                        <input type="date" class="sam-input mt-input" style="padding:4px 8px; font-size:11.5px;" value="${this.expensesStartDate}" onchange="App.expensesStartDate=this.value; App.renderOperatingExpenses();" title="من تاريخ" />
                        <span style="font-size:12px; color:var(--sam-text-secondary);">إلى</span>
                        <input type="date" class="sam-input mt-input" style="padding:4px 8px; font-size:11.5px;" value="${this.expensesEndDate}" onchange="App.expensesEndDate=this.value; App.renderOperatingExpenses();" title="إلى تاريخ" />
                    </div>
                    ${(this.expensesSearch || this.expensesTypeFilter || this.expensesStartDate || this.expensesEndDate) ? `
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.expensesSearch=''; App.expensesTypeFilter=''; App.expensesStartDate=''; App.expensesEndDate=''; App.renderOperatingExpenses();" title="إلغاء كل الفلاتر">✕</button>
                    ` : ''}
                </div>`
            ]
        };

        let tabContentHtml = '';
        if (currentActiveTab === 'direct') {
            tabContentHtml = this.renderDirectExpensesSection(d, directPayments, adminAcc, cashboxAcc);
        } else {
            tabContentHtml = this.renderRecurringCommitmentsSection(d, recurringItems);
        }

        const shell = PB ? PB.renderShell({
            id: 'operating-expenses',
            archetype: 'ledger',
            title: 'المصروفات التشغيلية والالتزامات الدورية',
            subtitle: 'إدارة سندات الصرف، تكاليف الصيانة والمحروقات، ومتابعة اشتراكات خطوط الإنترنت والأبراج',
            eyebrow: 'المحاسبة التشغيلية',
            icon: '⚡',
            actions,
            stats,
            toolbar,
            content: tabContentHtml
        }) : `
            <div class="sam-page-shell">
                ${tabContentHtml}
            </div>
        `;

        mainView.innerHTML = shell;

        if (typeof App.organizeMobilePage === 'function') {
            App.organizeMobilePage();
        }
    };



    App.switchOperatingExpensesTab = function (tab) {

        this.expensesActiveTab = tab;

        this.renderOperatingExpenses(tab);

    };



    App.loadOperatingExpensesData = async function () {

        const res = await this.api('get_recurring_expenses');

        return res || { recurring_expenses: [], direct_payments: [], summary: {}, accounts: [], current_admin_account: {}, cashbox_account: {} };

    };



    /**

     * Direct Expenses Section (سندات الصرف المباشرة)

     */

    App.renderDirectExpensesSection = function (d, payments, adminAcc, cashboxAcc) {

        // Quick Category Action Cards

        const typeCards = Object.entries(DIRECT_EXPENSE_TYPES).map(([k, cfg]) => {

            const count = payments.filter(p => p.expense_type === k).length;

            const sum = payments.filter(p => p.expense_type === k).reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            return `

                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.15s ease;" onclick="App.openDirectExpenseModal('${k}')" onmouseover="this.style.borderColor='${cfg.color}'; this.style.transform='translateY(-1px)';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none';">

                    <div style="display:flex; align-items:center; gap:10px;">

                        <div style="width:36px; height:36px; border-radius:8px; background:${cfg.bgColor}; color:${cfg.color}; display:flex; align-items:center; justify-content:center; font-size:18px;">

                            ${cfg.icon}

                        </div>

                        <div>

                            <div style="font-weight:800; font-size:12.5px; color:#0f172a;">${cfg.label}</div>

                            <div style="font-size:11px; color:#64748b;">${count} سند مسجل</div>

                        </div>

                    </div>

                    <div style="text-align:left;">

                        <div style="font-size:14px; font-weight:900; color:${cfg.color};">${money(sum)}</div>

                        <span style="font-size:10.5px; font-weight:700; color:#dc2626;">+ صرف فوري</span>

                    </div>

                </div>

            `;

        }).join('');



        // Account & Funding Banner

        const fundingBanner = `

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">

                <div style="display:flex; align-items:center; gap:8px;">

                    <div style="font-size:20px;">💡</div>

                    <div>

                        <div style="font-size:12px; font-weight:800; color:#0f172a;">نظام التمويل الشخصي وسندات الصرف المباشرة:</div>

                        <div style="font-size:11px; color:#475569;">

                            حسابك الشخصي: <b style="color:#0284c7;">[${adminAcc.account_code || '-'}] ${esc(adminAcc.name_ar || 'المشرف')}</b> 

                            | الصندوق الرئيسي: <b style="color:#16a34a;">[${cashboxAcc.account_code || '1101'}] ${esc(cashboxAcc.name_ar || 'الصندوق الرئيسي')} (${money(cashboxAcc.balance || 0)})</b>

                        </div>

                    </div>

                </div>

                <div style="font-size:10.5px; background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:5px; font-weight:700;">

                    ✨ خيار التمويل يغذي الصندوق ثم يصرف السند تلقائياً

                </div>

            </div>

        `;



        // Direct payments table rows

        let tableRows = '';

        if (payments.length === 0) {

            tableRows = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد سندات صرف تشغيلية مسجلة. اضغط "+ سند صرف تشغيلي" لتحرير سند جديد.</td></tr>`;

        } else {

            tableRows = payments.map(p => {

                const cfg = DIRECT_EXPENSE_TYPES[p.expense_type] || DIRECT_EXPENSE_TYPES.general;

                return `

                    <tr>

                        <td style="font-weight:800; color:#dc2626; white-space:nowrap;">

                            ${esc(p.payment_no)}

                        </td>

                        <td style="white-space:nowrap;">

                            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:800; padding:2px 7px; border-radius:5px; background:${cfg.bgColor}; color:${cfg.color}; border:1px solid ${cfg.color}33;">

                                ${cfg.icon} ${cfg.shortLabel}

                            </span>

                        </td>

                        <td>

                            <div style="font-weight:700; color:#0f172a; font-size:12.5px;">${esc(p.title_snapshot)}</div>

                            <div style="font-size:11px; color:#64748b;">حساب المصروف: <b>${esc(p.expense_account_name || ('[' + (p.expense_account_code || '540x') + ']'))}</b></div>

                        </td>

                        <td style="font-weight:900; color:#dc2626; font-size:13.5px; white-space:nowrap;">

                            ${this.formatCurrencyBadge ? this.formatCurrencyBadge(p.currency_amount || p.amount, p.currency_code, p.exchange_rate, p.amount) : money(p.amount)}

                        </td>

                        <td style="font-size:11.5px; color:#334155;">

                            <div>💳 ${esc(p.payment_account_name || 'الصندوق الرئيسي')}</div>

                            <div style="font-size:10.5px; color:#64748b;">حرره: ${esc(p.creator_name || 'المشرف')}</div>

                        </td>

                        <td style="font-size:11.5px; white-space:nowrap;">

                            ${p.entry_no ? `<span style="color:#4338ca; font-weight:700; background:#eef2ff; padding:2px 6px; border-radius:4px;">#${esc(p.entry_no)}</span>` : '<span style="color:#94a3b8;">-</span>'}

                        </td>

                        <td style="font-size:11px; color:#64748b; white-space:nowrap;">

                            ${esc(p.payment_date)}

                        </td>

                    </tr>

                `;

            }).join('');

        }



        return `

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin-bottom:12px;">

                ${typeCards}

            </div>



            ${fundingBanner}



            <div class="mt-table-container">

                <div style="padding:10px 14px; background:#f8fafc; border-bottom:1px solid var(--border, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">

                    <div style="font-weight:800; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px;">

                        <span>📋</span> أحدث سندات الصرف التشغيلية المباشرة

                    </div>

                    <div style="font-size:11.5px; color:#64748b;">

                        إجمالي المعروض: <b style="color:#dc2626; font-size:13px;">${money(payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0))}</b>

                    </div>

                </div>



                <table class="mt-table">

                    <thead>

                        <tr>

                            <th>رقم السند</th>

                            <th>التصنيف</th>

                            <th>البيان والمستفيد</th>

                            <th>المبلغ المصروف</th>

                            <th>طريقة / حساب الصرف</th>

                            <th>قيد اليومية</th>

                            <th>التاريخ</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${tableRows}

                    </tbody>

                </table>

            </div>

        `;

    };



    /**

     * Recurring Commitments Section (العقود والاشتراكات الدورية)

     */

    App.renderRecurringCommitmentsSection = function (d, items) {
        let tableRows = '';
        const todayStr = today();

        if (items.length === 0) {
            tableRows = `<tr><td colspan="9" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد التزامات دورية مسجلة. اضغط "+ التزام / اشتراك دوري" لإضافة خط أو موقع.</td></tr>`;
        } else {
            tableRows = items.map(x => {
                const cfg = RECURRING_TYPES[x.expense_type] || RECURRING_TYPES.isp_line;
                const isDue = x.next_due_date <= todayStr;
                const isActive = (Number(x.is_active) === 1);

                return `
                    <tr style="${!isActive ? 'opacity:0.65; background:#f8fafc;' : (isDue ? 'background:#fff8f8;' : '')}">
                        <td style="white-space:nowrap;">
                            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:800; padding:2px 7px; border-radius:5px; background:${cfg.bgColor}; color:${cfg.color}; border:1px solid ${cfg.color}33;">
                                ${cfg.icon} ${cfg.shortLabel}
                            </span>
                        </td>
                        <td>
                            <div style="font-weight:700; color:#0f172a; font-size:12.5px;">${esc(x.title)}</div>
                            <div style="font-size:11px; color:#64748b;">${esc(x.package_name || x.line_identifier || '')}</div>
                        </td>
                        <td style="font-size:12px; color:#334155;">
                            <b>${esc(x.provider_name || '-')}</b>
                        </td>
                        <td style="font-size:11.5px; color:#475569;">
                            <div>📡 ${esc(x.router_name || 'عام على الشبكة')}</div>
                        </td>
                        <td style="font-weight:900; color:#059669; font-size:13.5px; white-space:nowrap;">
                            ${this.formatCurrencyBadge ? this.formatCurrencyBadge(x.currency_amount || x.amount, x.currency_code, x.exchange_rate, x.amount) : money(x.amount)}
                        </td>
                        <td style="font-size:11.5px; color:#475569;">
                            ${x.billing_cycle === 'monthly' ? '📅 شهري' : `⏳ مخصص (${x.custom_period_days} يوم)`}
                        </td>
                        <td style="font-size:11px; color:#64748b; white-space:nowrap;">
                            📅 ${esc(x.start_date || '-')}
                        </td>
                        <td style="white-space:nowrap;">
                            <span style="font-weight:800; font-size:11.5px; color:${!isActive ? '#64748b' : (isDue ? '#dc2626' : '#059669')};">
                                ${!isActive ? '⏸️ ' : (isDue ? '⚠️ ' : '📅 ')} ${esc(x.next_due_date)}
                            </span>
                        </td>
                        <td style="white-space:nowrap; text-align:center;">
                            ${isActive 
                                ? '<span class="status-pill status-online" style="font-size:10.5px; font-weight:700;">🟢 نشط</span>' 
                                : '<span class="status-pill status-disabled" style="font-size:10.5px; font-weight:700;" title="تم إيقاف التجديد الدوري لهذا الالتزام">⏸️ موقوف</span>'}
                        </td>
                        <td style="text-align:center; white-space:nowrap;">
                            <div style="display:inline-flex; gap:4px;">
                                ${isActive ? `
                                <button class="mt-btn mt-btn-success" style="font-size:11px; font-weight:700; padding:3px 8px;" onclick="App.openPayRecurring(${x.id})" title="سداد دورة استحقاق جديدة أو سابقة">
                                    💳 تسديد وتجديد
                                </button>` : ''}
                                <button class="mt-btn" style="font-size:11px; padding:3px 6px;" onclick="App.openCommitmentModal(${x.id})" title="تعديل تفاصيل العقد أو الباقة">
                                    ✏️
                                </button>
                                <button class="mt-btn ${isActive ? 'mt-btn-warning' : 'mt-btn-success'}" style="font-size:11px; padding:3px 8px; font-weight:700;" onclick="App.toggleRecurringExpenseStatus(${x.id})" title="${isActive ? 'إيقاف التجديد الدوري مع الاحتفاظ بالسجلات' : 'استئناف تفعيل التجديد الدوري'}">
                                    ${isActive ? '⏸️ إيقاف' : '▶️ استئناف'}
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        return `
            <div class="mt-table-container">
                <div style="padding:10px 14px; background:#f8fafc; border-bottom:1px solid var(--border, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:800; font-size:13px; color:#0f172a;">
                        🔄 عقود واشتراكات خطوط الإنترنت وإيجارات المواقع (الشبكة الحالية)
                    </div>
                    <button class="mt-btn mt-btn-primary" style="font-size:11.5px; font-weight:700; padding:4px 10px;" onclick="App.openCommitmentModal()">
                        + إضافة عقد / اشتراك جديد
                    </button>
                </div>

                <table class="mt-table">
                    <thead>
                        <tr>
                            <th>النوع</th>
                            <th>مسمى البند / العقد</th>
                            <th>المزود / المالك</th>
                            <th>الراوتر المستهدف</th>
                            <th>مبلغ الدورة</th>
                            <th>دورة التجديد</th>
                            <th>تاريخ البداية</th>
                            <th>الاستحقاق القادم</th>
                            <th style="text-align:center;">الحالة</th>
                            <th style="text-align:center;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    };



    /**

     * Modal for Direct Operational Expense Voucher

     */

    /**
     * Modal for Direct Operational Expense Voucher (تحرير سند صرف تشغيلي فوري)
     */
    App.openDirectExpenseModal = async function (preferredType = 'fuel') {
        let d = this._recurringData;
        if (!d) {
            d = await this.api('get_recurring_expenses');
            this._recurringData = d;
        }

        const allAccounts = d.accounts || [];
        const cashAccounts = getTransactionalCashAccounts(allAccounts);
        const expenseAccounts = allAccounts.filter(a => a.account_type === 'expense');
        const cashboxAcc = d.cashbox_account || cashAccounts.find(a => String(a.account_code) === '1101') || cashAccounts[0] || {};
        const adminAcc = d.current_admin_account || {};
        const allAdmins = d.admins || [];

        const canDisburseAny = (this.userRole === 'system_owner' || this.userRole === 'superadmin' || (typeof this.can === 'function' && this.can('expenses_disburse_any_account')));

        const currentType = DIRECT_EXPENSE_TYPES[preferredType] ? preferredType : 'fuel';

        const modalHtml = `
            <div class="mt-modal-header" style="background:#dc2626; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <b style="font-size:15px; font-weight:800;">💳 تحرير سند صرف تشغيلي فوري (مباشر)</b>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>

            <form onsubmit="App.submitDirectExpenseVoucher(event)">
                <div class="mt-modal-body" style="padding:16px 20px; max-height:75vh; overflow-y:auto;">
                    
                    <!-- Expense Category Selector -->
                    <div style="margin-bottom:14px;">
                        <label style="font-weight:800; font-size:12.5px; color:#0f172a; display:block; margin-bottom:6px;">نوع وتصنيف المصروف التشغيلي *</label>
                        <select id="re-direct-type" class="mt-select" style="width:100%; font-size:13.5px; font-weight:700; padding:8px;" onchange="App.onDirectTypeChanged(this.value)" required>
                            ${Object.entries(DIRECT_EXPENSE_TYPES).map(([k, cfg]) => `
                                <option value="${k}" ${k === currentType ? 'selected' : ''}>
                                    ${cfg.icon} ${cfg.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Dynamic Category Context Fields -->
                    <div id="red-context-fields" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
                        ${this.renderDirectContextFields(currentType)}
                    </div>

                    <!-- Amount, Currency & Tafqeet -->
                    <div style="margin-bottom:14px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px;">
                        <div style="display:grid; grid-template-columns:140px 1fr; gap:10px; align-items:flex-start;">
                            <div>
                                <label style="font-weight:800; font-size:12px; color:#991b1b; display:block; margin-bottom:4px;">العملة *</label>
                                <select id="red-currency" class="mt-select" style="width:100%; font-size:13.5px; font-weight:800;" onchange="App.onDirectCurrencyChange(this.value)">
                                    ${this.renderCurrencyOptions(this._baseCurrency)}
                                </select>
                            </div>
                            <div>
                                <label id="lbl-red-amount" style="font-weight:800; font-size:12.5px; color:#dc2626; display:block; margin-bottom:4px;">المبلغ الإجمالي المصروف (${this.getCurrencySymbol(this._baseCurrency)}) *</label>
                                <input type="number" step="0.01" min="0.01" id="red-amount" class="mt-input" style="width:100%; font-size:18px; font-weight:900; color:#dc2626; padding:7px;" placeholder="0.00" oninput="App.onDirectAmountInput(this.value)" required />
                            </div>
                        </div>
                        <div id="red-currency-conv-hint" style="font-size:11.5px; color:#059669; font-weight:700; margin-top:4px;"></div>
                        <div id="red-tafqeet" style="font-size:11.5px; color:#0369a1; font-weight:700; margin-top:2px;"></div>
                    </div>

                    <!-- Payment Source & Funding Mode (Permission-Controlled) -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="font-weight:800; font-size:12.5px; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                            <span style="display:flex; align-items:center; gap:6px;">💼 طريقة ومصدر تمويل الصرف المحاسبي *</span>
                            ${canDisburseAny ? `<span style="font-size:10.5px; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700;">صلاحية التمويل الشامل</span>` : `<span style="font-size:10.5px; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-weight:700;">🔒 مقيد بالحساب الشخصي</span>`}
                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px;">
                            
                            <!-- Option 1: Admin Personal Funding (Default & Mandatory for standard users) -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:2px solid #0284c7; border-radius:8px; padding:10px 12px;" id="lbl-fund-admin">
                                <input type="radio" name="re_payment_mode" value="admin_funding" checked onchange="App.onPaymentModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:13px; color:#0369a1; display:flex; align-items:center; justify-content:space-between;">
                                        <span>👤 دفع من حسابي الشخصي المسؤول عن العملية [${adminAcc.account_code || '-'}]</span>
                                        <span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px;">حسابك المالي</span>
                                    </div>
                                    <div style="font-size:11.5px; color:#475569; margin-top:3px; line-height:1.4;">
                                        خصم من حسابك الشخصي: <b style="color:#0f172a;">[${adminAcc.account_code || '-'}] ${esc(adminAcc.name_ar || 'حساب المشرف')} (${money(adminAcc.balance || 0)})</b> 
                                        وتحويله للصندوق لإتمام العملية وقيدها على عهدتك.
                                    </div>
                                </div>
                            </label>

                            ${canDisburseAny ? `
                            <!-- Option 2: Direct Cashbox Disbursement -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-fund-cashbox">
                                <input type="radio" name="re_payment_mode" value="cashbox_direct" onchange="App.onPaymentModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:13px; color:#334155;">
                                        💵 صرف مباشر من رصيد الصندوق الرئيسي [${cashboxAcc.account_code || '1101'}]
                                    </div>
                                    <div style="font-size:11.5px; color:#64748b; margin-top:3px;">
                                        خصم مباشر من الصندوق المتوفر به حالياً: <b style="color:${(cashboxAcc.balance || 0) >= 0 ? '#16a34a' : '#dc2626'};">${money(cashboxAcc.balance || 0)}</b> دون تمويل من حسابك الشخصي.
                                    </div>
                                </div>
                            </label>

                            <!-- Option 3: Custom Financial Account -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-fund-custom">
                                <input type="radio" name="re_payment_mode" value="custom_account" onchange="App.onPaymentModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:13px; color:#334155;">
                                        🏦 صرف من حساب مالي / بنكي / عهدة أخرى
                                    </div>
                                    <div id="red-custom-account-wrapper" style="display:none; margin-top:8px;">
                                        <select id="red-custom-payacc" class="mt-select" style="width:100%; font-weight:700;">
                                            ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${esc(a.name_ar)} (رصيد: ${money(a.balance)})</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </label>

                            <!-- Option 4: Other Supervisor/Admin Personal Account -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-fund-other-admin">
                                <input type="radio" name="re_payment_mode" value="other_admin" onchange="App.onPaymentModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:13px; color:#334155;">
                                        👥 صرف وخصم من حساب مسؤول / مشرف آخر
                                    </div>
                                    <div id="red-other-admin-wrapper" style="display:none; margin-top:8px;">
                                        <select id="red-other-admin" class="mt-select" style="width:100%; font-weight:700;">
                                            ${allAdmins.map(a => `<option value="${a.id}">👤 ${esc(a.name)} (@${esc(a.role || '')}) - رصيد: ${money(a.balance)}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </label>
                            ` : `
                            <div style="font-size:11px; color:#64748b; background:#f1f5f9; padding:8px 10px; border-radius:6px;">
                                ℹ️ بصفتك المسؤول المنفذ للعملية، يتم قيد المصروف وخصمه تلقائياً عبر حسابك الشخصي وقيده في سجلاتك.
                            </div>
                            `}

                        </div>

                        <div id="red-balance-warning" style="display:none; margin-top:8px; background:#fff7ed; border:1px solid #fdba74; border-radius:6px; padding:8px 10px; font-size:11.5px; color:#c2410c; line-height:1.5;"></div>
                    </div>

                    <!-- Target Expense Account in Chart of Accounts -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="font-weight:800; font-size:12px; color:#334155; margin-bottom:8px;">
                            ⚖️ التوجيه المحاسبي للمصروف
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div>
                                <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">حساب المصروف المستهدف *</label>
                                <select id="red-expacc" class="mt-select" style="width:100%; font-weight:700;" required>
                                    ${expenseAccounts.map(a => `
                                        <option value="${a.id}" ${a.account_code === DIRECT_EXPENSE_TYPES[currentType]?.accountCode ? 'selected' : ''}>
                                            [${a.account_code}] ${esc(a.name_ar)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">تاريخ الصرف والسند *</label>
                                <input type="date" id="red-date" class="mt-input" style="width:100%; font-weight:700;" value="${today()}" required />
                            </div>
                        </div>
                    </div>

                    <!-- General Notes -->
                    <div>
                        <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">ملاحظات وتفاصيل إضافية</label>
                        <input type="text" id="red-notes" class="mt-input" style="width:100%;" placeholder="أي ملاحظات توثيقية أو رقم شيك أو قيد داخلي..." />
                    </div>

                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-danger" style="background:#dc2626; color:#fff; font-weight:800; padding:8px 24px;">
                        💳 تأكيد صرف السند وترحيل القيد
                    </button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '700px');
    };

    App.onPaymentModeChanged = function (mode) {
        const customWrapper = document.getElementById('red-custom-account-wrapper');
        const otherAdminWrapper = document.getElementById('red-other-admin-wrapper');
        if (customWrapper) customWrapper.style.display = (mode === 'custom_account') ? 'block' : 'none';
        if (otherAdminWrapper) otherAdminWrapper.style.display = (mode === 'other_admin') ? 'block' : 'none';

        ['lbl-fund-admin', 'lbl-fund-cashbox', 'lbl-fund-custom', 'lbl-fund-other-admin'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.borderColor = '#cbd5e1';
                el.style.borderWidth = '1px';
            }
        });

        const activeMap = {
            admin_funding: 'lbl-fund-admin',
            cashbox_direct: 'lbl-fund-cashbox',
            custom_account: 'lbl-fund-custom',
            other_admin: 'lbl-fund-other-admin'
        };
        const activeEl = document.getElementById(activeMap[mode]);
        if (activeEl) {
            activeEl.style.borderColor = '#0284c7';
            activeEl.style.borderWidth = '2px';
        }

        const amt = parseFloat(document.getElementById('red-amount')?.value) || 0;
        this.onDirectAmountInput(amt);
    };

    App.onDirectCurrencyChange = function (code) {
        const sym = this.getCurrencySymbol(code);
        const lbl = document.getElementById('lbl-red-amount');
        if (lbl) lbl.innerText = `المبلغ الإجمالي المصروف (${sym}) *`;
        const amt = document.getElementById('red-amount')?.value;
        this.onDirectAmountInput(amt);
    };

    App.onDirectAmountInput = function (val) {
        const num = parseFloat(val) || 0;
        const currCode = document.getElementById('red-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const tafqeetDiv = document.getElementById('red-tafqeet');
        const hintDiv = document.getElementById('red-currency-conv-hint');
        const warningDiv = document.getElementById('red-balance-warning');

        if (tafqeetDiv) {
            if (num > 0 && typeof App.tafqeet === 'function') {
                tafqeetDiv.innerHTML = `📝 <b>${App.tafqeet(num, currCode)}</b>`;
            } else {
                tafqeetDiv.innerHTML = `📝 التفقيط المالي يظهر هنا فور كتابة المبلغ`;
            }
        }

        if (hintDiv) {
            const baseCode = this._baseCurrency || 'YER_SANAA';
            const isBase = (!currCode || currCode === baseCode || currCode === 'YER' || (currCode === 'YER_SANAA' && baseCode === 'YER_SANAA'));
            if (!isBase && num > 0) {
                const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
                const baseVal = (num * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                hintDiv.innerHTML = `💱 معادل الأساس: <b>${baseVal} ${this.getCurrencySymbol(baseCode)}</b> (سعر الصرف: ${rate})`;
            } else {
                hintDiv.innerHTML = '';
            }
        }

        const mode = document.querySelector('input[name="re_payment_mode"]:checked')?.value || 'admin_funding';
        const d = this._recurringData || {};
        const cashboxBal = parseFloat(d.cashbox_account?.balance) || 0;
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
        const effectiveBaseAmount = num * rate;

        if (warningDiv) {
            if (mode === 'cashbox_direct' && effectiveBaseAmount > cashboxBal) {
                warningDiv.style.display = 'block';
                warningDiv.innerHTML = `⚠️ <b>تنبيه عجز رصيد:</b> المبلغ المراد صرفه يعادل (${money(effectiveBaseAmount)}) ويتجاوز رصيد الصندوق المتاح حالياً (${money(cashboxBal)}). نوصي باختيار <b>"دفع من حسابي الشخصي"</b> لتغذية الصندوق آلياً.`;
            } else {
                warningDiv.style.display = 'none';
            }
        }
    };

    App.renderDirectContextFields = function (typeKey) {
        const cfg = DIRECT_EXPENSE_TYPES[typeKey] || DIRECT_EXPENSE_TYPES.fuel || DIRECT_EXPENSE_TYPES.general;
        const f = cfg?.fields || {
            provider: { label: 'المورد / الجهة المستلمة', placeholder: 'اسم المستلم أو المحل' },
            itemDesc: { label: 'بيان وبند المصروف', placeholder: 'تفاصيل المصروف' },
            subType: { label: 'النوع / المواصفات', placeholder: 'مواصفات إضافية' },
            qtyRate: { label: 'الكمية والسعر / رقم الفاتورة', placeholder: 'رقم الفاتورة أو الكمية' }
        };
        return `
            <div style="font-weight:800; font-size:12px; color:#0f172a; margin-bottom:8px;">
                📝 بيانات وتفاصيل (${cfg?.label || 'المصروف'})
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
                <div>
                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.provider?.label || 'المستفيد / المورد'} *</label>
                    <input type="text" id="red-provider" class="mt-input" style="width:100%;" placeholder="${f.provider?.placeholder || ''}" required />
                </div>
                <div>
                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.itemDesc?.label || 'البيان / الوصف'} *</label>
                    <input type="text" id="red-item" class="mt-input" style="width:100%;" placeholder="${f.itemDesc?.placeholder || ''}" required />
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.subType?.label || 'النوع والتفاصيل'}</label>
                    <input type="text" id="red-subtype" class="mt-input" style="width:100%;" placeholder="${f.subType?.placeholder || ''}" />
                </div>
                <div>
                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.qtyRate?.label || 'الكمية / رقم الفاتورة'}</label>
                    <input type="text" id="red-qtyrate" class="mt-input" style="width:100%;" placeholder="${f.qtyRate?.placeholder || ''}" />
                </div>
            </div>
        `;
    };

    App.onDirectTypeChanged = function (newType) {
        const container = document.getElementById('red-context-fields');
        if (container) container.innerHTML = this.renderDirectContextFields(newType);

        const expSelect = document.getElementById('red-expacc');
        const targetCode = DIRECT_EXPENSE_TYPES[newType]?.accountCode;
        if (expSelect && targetCode) {
            const d = this._recurringData || {};
            const accounts = d.accounts || [];
            const matched = accounts.find(a => a.account_code === targetCode);
            if (matched) expSelect.value = matched.id;
        }
    };

    App.submitDirectExpenseVoucher = async function (e) {
        e.preventDefault();
        const g = id => document.getElementById(id)?.value || '';
        const expenseType = g('re-direct-type');
        const cfg = DIRECT_EXPENSE_TYPES[expenseType] || DIRECT_EXPENSE_TYPES.general || {};
        const amount = parseFloat(g('red-amount')) || 0;
        const currCode = g('red-currency') || this._baseCurrency || 'YER_SANAA';
        const currRate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
        const baseAmount = amount * currRate;
        const isBase = (currCode === (this._baseCurrency || 'YER_SANAA') || currRate === 1.0);
        const paymentMode = document.querySelector('input[name="re_payment_mode"]:checked')?.value || 'admin_funding';
        const providerName = g('red-provider');
        const itemDesc = g('red-item');
        const notes = g('red-notes');

        if (amount <= 0) return this.toast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'warning');

        let paymentModeLabel = 'دفع من حسابي الشخصي (تغذية الصندوق ثم الصرف)';
        if (paymentMode === 'cashbox_direct') paymentModeLabel = 'صرف مباشر من الصندوق الرئيسي [1101]';
        else if (paymentMode === 'custom_account') paymentModeLabel = 'صرف من حساب مالي / بنكي مخصص';
        else if (paymentMode === 'other_admin') paymentModeLabel = 'صرف وخصم من حساب مسؤول آخر';

        const ok = await App.showExactConfirmModal({
            headerTitle: '💳 تأكيد بيانات سند صرف تشغيلي فوري',
            headline: `تأكيد تحرير سند صرف بمبلغ ${amount.toLocaleString('en-US', {minimumFractionDigits:2})} ${this.getCurrencySymbol(currCode)}`,
            subheadline: 'سيتم قيد السند وترحيل القيد المحاسبي آلياً إلى سجلات المصروفات',
            rows: [
                { label: 'بند وتصنيف المصروف:', html: `<b>${cfg.icon || '💳'} ${cfg.label || expenseType}</b>` },
                { label: 'المستفيد / المورد:', html: `<b>${this.escape(providerName || '-')}</b>` },
                { label: 'بيان وتفاصيل الصرف:', html: `<span>${this.escape(itemDesc || '-')}</span>` },
                { label: 'طريقة التمويل المالي:', html: `<b>${paymentModeLabel}</b>` },
                { 
                    label: '💰 المبلغ الإجمالي المصروف:', 
                    bg: '#f0fdf4', 
                    color: '#15803d', 
                    html: `<b style="color:#dc2626; font-size:15px;">${amount.toLocaleString('en-US', {minimumFractionDigits:2})} ${this.getCurrencySymbol(currCode)}</b>` + 
                          (!isBase ? `<br><small style="color:#059669; font-weight:bold;">💱 يعادل: ${baseAmount.toLocaleString('en-US', {minimumFractionDigits:2})} ${this.getCurrencySymbol(this._baseCurrency)} (صرف: ${currRate})</small>` : '')
                }
            ],
            confirmBtnText: 'تأكيد ترحيل سند الصرف',
            confirmBtnClass: 'mt-btn-danger',
            backBtnText: 'back'
        });
        if (!ok) return;

        const payload = {
            expense_type: expenseType,
            currency_code: currCode,
            exchange_rate: currRate,
            currency_amount: amount,
            amount: amount,
            payment_mode: paymentMode,
            payment_account_id: paymentMode === 'custom_account' ? g('red-custom-payacc') : null,
            funding_admin_id: paymentMode === 'other_admin' ? g('red-other-admin') : null,
            expense_account_id: g('red-expacc'),
            payment_date: g('red-date'),
            provider_name: providerName,
            item_desc: itemDesc,
            subtype_details: g('red-subtype'),
            qty_rate_info: g('red-qtyrate'),
            notes: notes
        };

        const res = await this.api('create_direct_expense_voucher', payload);
        if (!res?.success) return this.toast(res?.error || 'فشل حفظ سند الصرف', 'danger');

        this.closeModal();
        this.renderOperatingExpenses('direct');

        this.showStandardSuccessModal({
            title: 'تم تحرير سند الصرف التشغيلي بنجاح',
            subtitle: `تم إصدار السند رقم <b>${res.payment_no || '-'}</b> وقيده محاسبياً`,
            icon: '💳',
            headerColor: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            tableRows: [
                { label: 'رقم السند:', value: `<code style="font-weight:bold; color:#dc2626;">${res.payment_no || '-'}</code>` },
                { label: 'رقم القيد المحاسبي:', value: `<code style="font-weight:bold; color:#0284c7;">#${res.journal_entry_no || '-'}</code>` },
                { label: 'بند المصروف:', value: `<b>${cfg.icon || '💳'} ${cfg.label || expenseType}</b>` },
                { label: 'المستفيد:', value: `<b>${this.escape(providerName || '-')}</b>` },
                { label: 'المبلغ الإجمالي:', value: `<b style="color:#dc2626; font-size:14px;">${amount.toLocaleString('en-US', {minimumFractionDigits:2})} ${this.getCurrencySymbol(currCode)}</b>` }
            ]
        });
    };

    App.openCommitmentModal = async function (editId = null) {
        let d = this._recurringData;
        if (!d) {
            d = await this.api('get_recurring_expenses');
            this._recurringData = d;
        }

        const editItem = editId ? (d.recurring_expenses || d.items || []).find(x => x.id == editId) : null;
        const currentType = editItem ? (editItem.expense_type === 'isp_line' ? 'internet' : (editItem.expense_type === 'site_rent' ? 'rent' : editItem.expense_type)) : 'internet';

        const routers = d.routers || [];
        const allAccounts = d.accounts || [];
        const expenseAccounts = allAccounts.filter(a => a.account_type === 'expense');

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0284c7; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <b style="font-size:15px; font-weight:800;">🌐 ${editItem ? 'تعديل التزام / عقد دوري' : 'تثبيت التزام دوري جديد (خط إنترنت / إيجار موقع)'}</b>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>

            <form onsubmit="App.saveRecurringExpense(event, ${editId || 'null'})">
                <div class="mt-modal-body" style="padding:16px 20px; max-height:75vh; overflow-y:auto;">
                    
                    <!-- Expense Type -->
                    <div style="margin-bottom:14px;">
                        <label style="font-weight:800; font-size:12.5px; color:#0f172a; display:block; margin-bottom:6px;">نوع الالتزام الدوري *</label>
                        <select id="re-type" class="mt-select" style="width:100%; font-size:13.5px; font-weight:700; padding:8px;" onchange="App.onCommitTypeChanged(this.value)" ${editItem ? 'disabled' : ''} required>
                            ${Object.entries(RECURRING_TYPES).map(([k, cfg]) => `
                                <option value="${k}" ${k === currentType ? 'selected' : ''}>
                                    ${cfg.icon} ${cfg.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Title & Identifier -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">مسمى البند أو الخط *</label>
                            <input type="text" id="re-title" class="mt-input" style="width:100%; font-weight:700;" placeholder="مثال: خط إنترنت فايبر برج الأمل" value="${esc(editItem?.title || '')}" required />
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">المزود أو المؤجر *</label>
                            <input type="text" id="re-provider" class="mt-input" style="width:100%;" placeholder="اسم المزود أو المالك" value="${esc(editItem?.provider_name || '')}" required />
                        </div>
                    </div>

                    <!-- Dynamic Context Fields -->
                    <div id="re-commit-context-fields" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
                        ${this.renderCommitContextFields(currentType, editItem)}
                    </div>

                    <!-- Financial Amount, Currency & Cycle -->
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="display:grid; grid-template-columns:130px 1fr 1fr; gap:10px; margin-bottom:8px;">
                            <div>
                                <label style="font-weight:800; font-size:12px; color:#166534; display:block; margin-bottom:3px;">العملة *</label>
                                <select id="re-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onExpenseCurrencyChange(this.value)">
                                    ${this.renderCurrencyOptions(editItem?.currency_code || this._baseCurrency)}
                                </select>
                            </div>
                            <div>
                                <label id="lbl-re-amount" style="font-weight:800; font-size:12px; color:#166534; display:block; margin-bottom:3px;">مبلغ الدورة (${this.getCurrencySymbol(editItem?.currency_code || this._baseCurrency)}) *</label>
                                <input type="number" step="0.01" min="0.01" id="re-amount" class="mt-input" style="width:100%; font-size:16px; font-weight:900; color:#059669;" placeholder="0.00" value="${editItem?.currency_amount || editItem?.amount || ''}" required oninput="App.onExpenseAmountInput(this.value)" />
                            </div>
                            <div>
                                <label style="font-weight:800; font-size:12px; color:#166534; display:block; margin-bottom:3px;">دورة التجديد والسداد *</label>
                                <select id="re-cycle" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onExpenseCycleChange(this.value)" required>
                                    <option value="monthly" ${editItem?.billing_cycle === 'monthly' || !editItem ? 'selected' : ''}>📅 شهري (Monthly)</option>
                                    <option value="custom_days" ${editItem?.billing_cycle === 'custom_days' ? 'selected' : ''}>⏳ مخصص بالأيام</option>
                                </select>
                            </div>
                        </div>
                        <div id="re-currency-conv-hint" style="font-size:11.5px; color:#0369a1; font-weight:700; margin-top:2px;"></div>

                        <div id="re-days-wrapper" style="display:${editItem?.billing_cycle === 'custom_days' ? 'block' : 'none'}; margin-bottom:8px;">
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">عدد أيام دورة التجديد</label>
                            <input type="number" id="re-custom-days" class="mt-input" style="width:100%;" placeholder="مثال: 20 أو 45 يوم" value="${editItem?.custom_period_days || 30}" />
                        </div>

                        <div id="re-tafqeet-note" style="font-size:11.5px; color:#0284c7; font-weight:bold;"></div>
                    </div>

                    <!-- Target Router -->
                    <div style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">الراوتر أو العقدة المستهدفة (اختياري)</label>
                        <select id="re-router" class="mt-select" style="width:100%;">
                            <option value="">لا يوجد راوتر محدد (عام على الشبكة الحالية)</option>
                            ${routers.map(r => `<option value="${r.id}" ${editItem?.router_id == r.id ? 'selected' : ''}>📡 ${esc(r.name)} (${esc(r.ip_address)})</option>`).join('')}
                        </select>
                    </div>

                    <!-- Dates & Past Months Tracking -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:8px 10px;">
                            <label style="font-weight:800; font-size:11.5px; color:#0369a1; display:block; margin-bottom:3px;">📅 تاريخ بداية العقد / الاشتراك *</label>
                            <input type="date" id="re-start-date" class="mt-input" style="width:100%; font-weight:700;" value="${editItem?.start_date || today()}" required onchange="if(!document.getElementById('re-next-date').dataset.userEdited) document.getElementById('re-next-date').value = this.value;" />
                            <small style="font-size:10px; color:#64748b; display:block; margin-top:2px;">إذا كان العقد بدأ في أشهر سابقة، حدد تاريخ البداية لتسجيلها</small>
                        </div>
                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 10px;">
                            <label style="font-weight:800; font-size:11.5px; color:#166534; display:block; margin-bottom:3px;">⚡ تاريخ الاستحقاق القادم *</label>
                            <input type="date" id="re-next-date" class="mt-input" style="width:100%; font-weight:700;" value="${editItem?.next_due_date || editItem?.start_date || today()}" required oninput="this.dataset.userEdited='true'" />
                            <small style="font-size:10px; color:#64748b; display:block; margin-top:2px;">تاريخ استحقاق أول دفعة غير مسددة</small>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">حساب المصروف المحاسبي *</label>
                            <select id="re-expense-acc" class="mt-select" style="width:100%; font-weight:700;" required>
                                ${expenseAccounts.map(a => `
                                    <option value="${a.id}" ${editItem ? (editItem.expense_account_id == a.id ? 'selected' : '') : (a.account_code === RECURRING_TYPES[currentType]?.accountCode ? 'selected' : '')}>
                                        [${a.account_code}] ${esc(a.name_ar)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">تاريخ نهاية العقد (اختياري)</label>
                            <input type="date" id="re-end-date" class="mt-input" style="width:100%;" value="${editItem?.end_date || ''}" placeholder="اختياري" />
                        </div>
                    </div>

                    <!-- Notes -->
                    <div>
                        <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">ملاحظات وشروط العقد</label>
                        <input type="text" id="re-notes" class="mt-input" style="width:100%;" placeholder="أي تفاصيل أو بنود خاصة..." value="${esc(editItem?.notes || '')}" />
                    </div>

                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:800; padding:8px 24px;">
                        💾 ${editItem ? 'حفظ التعديلات' : 'تثبيت وحفظ الالتزام'}
                    </button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '720px');
        setTimeout(() => {
            const initAmt = document.getElementById('re-amount')?.value;
            if (initAmt) App.onExpenseAmountInput(initAmt);
        }, 50);
    };



    App.renderCommitContextFields = function (typeKey, editItem = null) {

        const cfg = RECURRING_TYPES[typeKey] || RECURRING_TYPES.isp_line;

        const f = cfg.fields;

        return `

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">

                <div>

                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.phone?.label || 'رقم الهاتف / التواصل'}</label>

                    <input type="text" id="re-phone" class="mt-input" style="width:100%;" placeholder="${f.phone?.placeholder || ''}" value="${esc(editItem?.provider_phone || '')}" />

                </div>

                <div>

                    <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.contract?.label || 'رقم العقد / الاشتراك'}</label>

                    <input type="text" id="re-contract" class="mt-input" style="width:100%;" placeholder="${f.contract?.placeholder || ''}" value="${esc(editItem?.contract_number || '')}" />

                </div>

            </div>

            <div>

                <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">${f.package?.label || f.location?.label || 'تفاصيل الباقة / الموقع'}</label>

                <input type="text" id="re-package" class="mt-input" style="width:100%;" placeholder="${f.package?.placeholder || f.location?.placeholder || ''}" value="${esc(editItem?.package_name || editItem?.location_details || '')}" />

            </div>

        `;

    };



    App.onCommitTypeChanged = function (newType) {

        const container = document.getElementById('re-commit-context-fields');

        if (container) container.innerHTML = this.renderCommitContextFields(newType);



        const expSelect = document.getElementById('re-expense-acc');

        const targetCode = RECURRING_TYPES[newType]?.accountCode;

        if (expSelect && targetCode) {

            const d = this._recurringData || {};

            const accounts = d.accounts || [];

            const matched = accounts.find(a => a.account_code === targetCode);

            if (matched) expSelect.value = matched.id;

        }

    };



    App.onExpenseCurrencyChange = function (code) {
        const sym = this.getCurrencySymbol(code);
        const lbl = document.getElementById('lbl-re-amount');
        if (lbl) lbl.innerText = `مبلغ الدورة (${sym}) *`;
        const amt = document.getElementById('re-amount')?.value;
        this.onExpenseAmountInput(amt);
    };

    App.onExpenseAmountInput = function (val) {
        const num = parseFloat(val) || 0;
        const currCode = document.getElementById('re-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const tafqeetDiv = document.getElementById('re-tafqeet-note');
        const hintDiv = document.getElementById('re-currency-conv-hint');

        if (tafqeetDiv) {
            if (num > 0 && typeof App.tafqeet === 'function') {
                tafqeetDiv.innerHTML = `📝 <b>${App.tafqeet(num, currCode)}</b>`;
            } else {
                tafqeetDiv.innerHTML = '';
            }
        }

        if (hintDiv) {
            const baseCode = this._baseCurrency || 'YER_SANAA';
            const isBase = (!currCode || currCode === baseCode || currCode === 'YER' || (currCode === 'YER_SANAA' && baseCode === 'YER_SANAA'));
            if (!isBase && num > 0) {
                const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
                const baseVal = (num * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                hintDiv.innerHTML = `💱 معادل الأساس: <b>${baseVal} ${this.getCurrencySymbol(baseCode)}</b> (سعر الصرف: ${rate})`;
            } else {
                hintDiv.innerHTML = '';
            }
        }
    };

    App.onExpenseCycleChange = function (val) {
        const wrap = document.getElementById('re-days-wrapper');
        if (wrap) wrap.style.display = val === 'custom_days' ? 'block' : 'none';
    };

    App.saveRecurringExpense = async function (e, editId) {
        e.preventDefault();
        const g = id => document.getElementById(id)?.value || '';

        const currCode = g('re-currency') || this._baseCurrency || 'YER_SANAA';
        const currRate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
        const currAmount = parseFloat(g('re-amount')) || 0;

        const payload = {
            id: editId,
            expense_type: g('re-type') || 'internet',
            title: g('re-title'),
            provider_name: g('re-provider'),
            provider_phone: g('re-phone'),
            contract_number: g('re-contract'),
            package_name: g('re-package'),
            location_details: g('re-package'),
            currency_code: currCode,
            exchange_rate: currRate,
            currency_amount: currAmount,
            amount: currAmount,
            billing_cycle: g('re-cycle'),
            custom_period_days: g('re-custom-days') || 30,
            router_id: g('re-router') || null,
            start_date: g('re-start-date') || g('re-next-date') || today(),
            next_due_date: g('re-next-date') || today(),
            end_date: g('re-end-date') || null,
            expense_account_id: g('re-expense-acc'),
            notes: g('re-notes')
        };

        const res = await this.api('save_recurring_expense', payload);
        if (!res?.success) return this.toast(res?.error || 'فشل حفظ الالتزام', 'danger');

        this.toast(res.message || 'تم حفظ الالتزام الدوري بنجاح', 'success');
        this.closeModal();
        this.renderOperatingExpenses('recurring');
    };



    /**

     * Modal for Settling Recurring Expense Payment (سداد دفعة التزام دوري)

     */

    /**
     * Modal for Settling Recurring Expense Payment (سداد دفعة التزام دوري)
     */
        function generateUnpaidPeriods(item) {
        const periods = [];
        const isMonthly = (item.billing_cycle === 'monthly' || !item.billing_cycle);
        const customDays = parseInt(item.custom_period_days, 10) || 30;
        
        let curStartStr = item.next_due_date || item.start_date || today();
        let curStartDate = new Date(curStartStr);
        if (isNaN(curStartDate.getTime())) curStartDate = new Date();
        
        const now = new Date();
        const cycleAmount = parseFloat(item.currency_amount || item.amount || 0);
        
        for (let i = 0; i < 24; i++) {
            const periodStart = new Date(curStartDate);
            const periodEnd = new Date(curStartDate);
            
            if (isMonthly) {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
                periodEnd.setDate(periodEnd.getDate() - 1);
                
                curStartDate = new Date(periodEnd);
                curStartDate.setDate(curStartDate.getDate() + 1);
            } else {
                periodEnd.setDate(periodEnd.getDate() + customDays - 1);
                curStartDate = new Date(periodEnd);
                curStartDate.setDate(curStartDate.getDate() + 1);
            }
            
            const startStr = periodStart.toISOString().slice(0, 10);
            const endStr = periodEnd.toISOString().slice(0, 10);
            
            const isPastDue = periodEnd < now;
            const isCurrent = periodStart <= now && periodEnd >= now;
            
            let badgeText = '📅 دورة قادمة';
            let badgeColor = '#0284c7';
            let badgeBg = '#e0f2fe';
            
            if (isPastDue) {
                badgeText = '⚠️ استحقاق سابق متأخر';
                badgeColor = '#dc2626';
                badgeBg = '#fee2e2';
            } else if (isCurrent) {
                badgeText = '⚡ الدورة الحالية المستحقة';
                badgeColor = '#16a34a';
                badgeBg = '#dcfce7';
            }
            
            periods.push({
                index: i,
                start: startStr,
                end: endStr,
                amount: cycleAmount,
                isPastDue,
                isCurrent,
                badgeText,
                badgeColor,
                badgeBg
            });
            
            if (periodStart > now && periods.length >= 2) {
                break;
            }
        }
        
        return periods;
    }

    App.openPayRecurring = async function (id) {
        let d = this._recurringData;
        if (!d) {
            d = await this.api('get_recurring_expenses');
            this._recurringData = d;
        }

        const item = (d.recurring_expenses || d.items || []).find(x => x.id == id);
        if (!item) return this.toast('الالتزام غير موجود', 'warning');

        this._currentPayingItem = item;
        const unpaidPeriods = generateUnpaidPeriods(item);
        this._currentUnpaidPeriods = unpaidPeriods;

        const allAccounts = d.accounts || [];
        const cashAccounts = getTransactionalCashAccounts(allAccounts);
        const cashboxAcc = d.cashbox_account || cashAccounts.find(a => String(a.account_code) === '1101') || cashAccounts[0] || {};
        const adminAcc = d.current_admin_account || {};
        const allAdmins = d.admins || [];

        const canDisburseAny = (this.userRole === 'system_owner' || this.userRole === 'superadmin' || (typeof this.can === 'function' && this.can('expenses_disburse_any_account')));

        const modalHtml = `
            <div class="mt-modal-header" style="background:#059669; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <b style="font-size:15px; font-weight:800;">💳 سداد دفعة وتجديد: ${esc(item.title)}</b>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>

            <form onsubmit="App.payRecurring(event, ${id})">
                <div class="mt-modal-body" style="padding:16px 20px; max-height:75vh; overflow-y:auto;">
                    
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-weight:800; font-size:13.5px; color:#166534;">${esc(item.title)}</div>
                                <div style="font-size:11.5px; color:#475569;">المزود: <b>${esc(item.provider_name)}</b> | حساب المصروف: <b>[${item.expense_account_code || '540x'}] ${esc(item.expense_account_name || '')}</b></div>
                            </div>
                            <div style="text-align:left;">
                                <div style="font-size:16px; font-weight:900; color:#059669;">
                                    ${this.formatCurrencyBadge ? this.formatCurrencyBadge(item.currency_amount || item.amount, item.currency_code, item.exchange_rate, item.amount) : money(item.amount)}
                                </div>
                                <span style="font-size:10.5px; color:#64748b;">مبلغ الدورة الأساسي</span>
                            </div>
                        </div>
                    </div>

                    <!-- 1. Selection of Unpaid Past / Current Dues -->
                    <div style="background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                            <div style="font-weight:800; font-size:12.5px; color:#0f172a;">
                                📅 الاستحقاقات والدورات غير المسددة (${unpaidPeriods.length} دورات متاحة):
                            </div>
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" style="font-size:11px; padding:2px 8px;" onclick="App.selectAllPayPeriods(true)">☑️ تسديد كافة الاستحقاقات</button>
                                <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" style="font-size:11px; padding:2px 8px;" onclick="App.selectAllPayPeriods(false)">☐ إلغاء التحديد</button>
                            </div>
                        </div>
                        
                        <div style="max-height:180px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc;">
                            <table class="mt-table" style="font-size:11.5px; margin:0; width:100%;">
                                <tbody>
                                    ${unpaidPeriods.map((p, idx) => `
                                        <tr style="cursor:pointer; background:#fff;" onclick="App.togglePayPeriodCheckbox(${idx})">
                                            <td style="width:34px; text-align:center;">
                                                <input type="checkbox" class="pay-period-cb" id="pay-period-cb-${idx}" data-idx="${idx}" data-start="${p.start}" data-end="${p.end}" data-amount="${p.amount}" ${p.isPastDue || idx === 0 ? 'checked' : ''} onclick="event.stopPropagation(); App.onPayPeriodsChanged();" style="cursor:pointer; width:16px; height:16px;" />
                                            </td>
                                            <td>
                                                <b style="color:#0f172a;">من ${p.start} إلى ${p.end}</b>
                                            </td>
                                            <td>
                                                <span style="padding:2px 7px; border-radius:4px; font-weight:700; font-size:10.5px; background:${p.badgeBg}; color:${p.badgeColor};">${p.badgeText}</span>
                                            </td>
                                            <td style="font-weight:800; text-align:left; color:#059669; white-space:nowrap;">
                                                ${App.formatMoney(p.amount)}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div style="margin-top:6px; font-size:11px; color:#64748b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                            <span id="rep-selected-periods-summary" style="font-weight:700; color:#0369a1;">تم تحديد الاستحقاقات</span>
                            <span style="color:#475569;">✍️ يمكنك تعديل المبلغ الإجمالي المسدد يدوياً في الخانة أدناه إذا اختلف</span>
                        </div>
                    </div>

                    <!-- 2. Pay Recurring Amount & Currency -->
                    <div style="display:grid; grid-template-columns:140px 1fr; gap:10px; margin-bottom:8px;">
                        <div>
                            <label style="font-weight:800; font-size:12px; color:#166534; display:block; margin-bottom:3px;">العملة *</label>
                            <select id="rep-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onPayRecurringCurrencyChange(this.value)">
                                ${this.renderCurrencyOptions(item.currency_code || this._baseCurrency)}
                            </select>
                        </div>
                        <div>
                            <label id="lbl-rep-amount" style="font-weight:800; font-size:12px; color:#166534; display:block; margin-bottom:3px;">إجمالي المبلغ المسدد (${this.getCurrencySymbol(item.currency_code || this._baseCurrency)}) *</label>
                            <input type="number" step="0.01" min="0.01" id="rep-amount" class="mt-input" style="width:100%; font-size:16px; font-weight:900; color:#059669;" value="${item.currency_amount || item.amount}" required oninput="App.onPayRecurringAmountInput(this.value)" />
                        </div>
                    </div>
                    <div id="rep-currency-conv-hint" style="font-size:11.5px; color:#059669; font-weight:700; margin-bottom:4px;"></div>
                    <div id="rep-tafqeet" style="font-size:11.5px; color:#0369a1; font-weight:700; margin-bottom:8px;"></div>

                    <!-- Option to update base commitment amount -->
                    <div style="margin-bottom:12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 10px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11.5px; font-weight:700; color:#1e40af; margin:0;">
                            <input type="checkbox" id="rep-update-base-amount" style="width:16px; height:16px; accent-color:#0284c7;" />
                            <span>تحديث مبلغ الالتزام الأساسي إلى هذا المبلغ الجديد للدورات المستقبلية أيضاً (إذا تغيرت تسعيرة الباقة/الإيجار)</span>
                        </label>
                    </div>

                    <!-- 3. Payment Source & Funding Mode (Current Admin Deducted by Default) -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="font-weight:800; font-size:12.5px; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                            <span style="display:flex; align-items:center; gap:6px;">💼 الحساب المالي المسؤول عن السداد والخصم *</span>
                            ${canDisburseAny ? `<span style="font-size:10.5px; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700;">صلاحية التمويل الشامل</span>` : `<span style="font-size:10.5px; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-weight:700;">🔒 خصم من حسابك الشخصي</span>`}
                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px;">
                            
                            <!-- Option 1: Admin Personal Funding (Default) -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:2px solid #0284c7; border-radius:8px; padding:10px 12px;" id="lbl-pay-fund-admin">
                                <input type="radio" name="rep_pay_mode" value="admin_funding" checked onchange="App.onPayRecurringModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:12.5px; color:#0369a1;">👤 خصم وسداد من حسابي الشخصي المسؤول عن العملية [${adminAcc.account_code || '-'}] (تغذية الصندوق ثم السداد)</div>
                                    <div style="font-size:11px; color:#64748b; margin-top:2px;">
                                        يتم خصم المبلغ من حسابك (<b>${esc(adminAcc.name_ar || 'المشرف المسؤول')}</b>) وتغذيته للصندوق وقيد المصروف على عهدتك.
                                    </div>
                                </div>
                            </label>

                            ${canDisburseAny ? `
                            <!-- Option 2: Direct Cashbox Disbursement -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-pay-fund-cashbox">
                                <input type="radio" name="rep_pay_mode" value="cashbox_direct" onchange="App.onPayRecurringModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:12.5px; color:#334155;">💵 صرف مباشر من الصندوق الرئيسي [${cashboxAcc.account_code || '1101'}] (${money(cashboxAcc.balance || 0)})</div>
                                </div>
                            </label>

                            <!-- Option 3: Custom Financial Account -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-pay-fund-custom">
                                <input type="radio" name="rep_pay_mode" value="custom_account" onchange="App.onPayRecurringModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:12.5px; color:#334155;">🏦 صرف من حساب مالي / بنكي / عهدة أخرى</div>
                                    <div id="rep-custom-account-wrapper" style="display:none; margin-top:8px;">
                                        <select id="rep-custom-payacc" class="mt-select" style="width:100%; font-weight:700;">
                                            ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${esc(a.name_ar)} (رصيد: ${money(a.balance)})</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </label>

                            <!-- Option 4: Other Admin Account -->
                            <label style="cursor:pointer; display:flex; align-items:flex-start; gap:10px; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;" id="lbl-pay-fund-other-admin">
                                <input type="radio" name="rep_pay_mode" value="other_admin" onchange="App.onPayRecurringModeChanged(this.value)" style="margin-top:3px; accent-color:#0284c7;" />
                                <div style="flex:1;">
                                    <div style="font-weight:800; font-size:12.5px; color:#334155;">👥 خصم وسداد من حساب مسؤول / مشرف آخر</div>
                                    <div id="rep-other-admin-wrapper" style="display:none; margin-top:8px;">
                                        <select id="rep-other-admin" class="mt-select" style="width:100%; font-weight:700;">
                                            ${allAdmins.map(a => `<option value="${a.id}">👤 ${esc(a.name)} (@${esc(a.role || '')}) - رصيد: ${money(a.balance)}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                            </label>
                            ` : `
                            <div style="font-size:11px; color:#64748b; background:#f1f5f9; padding:8px 10px; border-radius:6px;">
                                ℹ️ بصفتك المسؤول المنفذ لعملية السداد، يتم قيد المصروف وخصمه تلقائياً عبر حسابك الشخصي.
                            </div>
                            `}

                        </div>
                    </div>

                    <!-- Period Dates -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">بداية الفترة المسددة</label>
                            <input type="date" id="rep-from" class="mt-input" style="width:100%; font-weight:700;" value="${unpaidPeriods[0]?.start || item.next_due_date || today()}" required />
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">نهاية الفترة المسددة</label>
                            <input type="date" id="rep-to" class="mt-input" style="width:100%; font-weight:700;" value="${unpaidPeriods[0]?.end || today()}" required />
                        </div>
                    </div>

                    <div>
                        <label style="font-weight:700; font-size:11.5px; display:block; margin-bottom:3px;">رقم السند أو الفاتورة المرجعية (اختياري)</label>
                        <input type="text" id="rep-ref" class="mt-input" style="width:100%;" placeholder="رقم إشعار البنك أو سند الإيداع أو الفاتورة" />
                    </div>

                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; padding:8px 24px;">
                        ⚖️ تأكيد السداد وترحيل القيد المحاسبي
                    </button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '700px');
        setTimeout(() => {
            App.onPayPeriodsChanged();
        }, 60);
    };

    App.selectAllPayPeriods = function (selectAll) {
        document.querySelectorAll('.pay-period-cb').forEach(cb => {
            cb.checked = Boolean(selectAll);
        });
        App.onPayPeriodsChanged();
    };

    App.togglePayPeriodCheckbox = function (idx) {
        const cb = document.getElementById(`pay-period-cb-${idx}`);
        if (cb) {
            cb.checked = !cb.checked;
            App.onPayPeriodsChanged();
        }
    };

    App.onPayPeriodsChanged = function () {
        const checkedCbs = Array.from(document.querySelectorAll('.pay-period-cb:checked'));
        const item = App._currentPayingItem;
        const cycleAmt = parseFloat(item?.currency_amount || item?.amount || 0);
        
        let totalAmt = 0;
        let earliestStart = '';
        let latestEnd = '';

        if (checkedCbs.length === 0) {
            totalAmt = cycleAmt;
            earliestStart = item?.next_due_date || today();
            latestEnd = today();
        } else {
            checkedCbs.forEach((cb, i) => {
                const s = cb.dataset.start;
                const e = cb.dataset.end;
                const amt = parseFloat(cb.dataset.amount) || cycleAmt;
                totalAmt += amt;
                if (!earliestStart || s < earliestStart) earliestStart = s;
                if (!latestEnd || e > latestEnd) latestEnd = e;
            });
        }

        const amtInput = document.getElementById('rep-amount');
        if (amtInput) {
            amtInput.value = totalAmt.toFixed(2);
            App.onPayRecurringAmountInput(amtInput.value);
        }

        const fromInput = document.getElementById('rep-from');
        const toInput = document.getElementById('rep-to');
        if (fromInput && earliestStart) fromInput.value = earliestStart;
        if (toInput && latestEnd) toInput.value = latestEnd;

        const summaryEl = document.getElementById('rep-selected-periods-summary');
        if (summaryEl) {
            summaryEl.innerHTML = `تم تحديد <b>${checkedCbs.length}</b> دورات استحقاق (من <b>${earliestStart}</b> إلى <b>${latestEnd}</b>)`;
        }
    };

    App.payRecurring = async function (e, id) {
        e.preventDefault();
        const g = k => document.getElementById(k)?.value || '';
        const paymentMode = document.querySelector('input[name="rep_pay_mode"]:checked')?.value || 'admin_funding';

        const currCode = g('rep-currency') || this._baseCurrency || 'YER_SANAA';
        const currRate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
        const currAmount = parseFloat(g('rep-amount')) || 0;
        const updateBase = document.getElementById('rep-update-base-amount')?.checked || false;

        const payload = {
            id: id,
            currency_code: currCode,
            exchange_rate: currRate,
            currency_amount: currAmount,
            amount: currAmount,
            payment_mode: paymentMode,
            payment_account_id: paymentMode === 'custom_account' ? g('rep-custom-payacc') : null,
            funding_admin_id: paymentMode === 'other_admin' ? g('rep-other-admin') : null,
            period_start: g('rep-from'),
            period_end: g('rep-to'),
            payment_date: today(),
            reference_no: g('rep-ref'),
            update_base_amount: updateBase,
            notes: ''
        };

        const res = await this.api('pay_recurring_expense', payload);
        if (!res?.success) return this.toast(res?.error || 'فشل عملية التجديد', 'danger');

        this.toast(`${res.message} (قيد رقم: ${res.journal_entry_no})`, 'success');
        this.closeModal();
        this.renderOperatingExpenses('recurring');
    };

    App.toggleRecurringExpenseStatus = async function (id) {
        let d = this._recurringData;
        const item = (d?.recurring_expenses || d?.items || []).find(x => x.id == id);
        const isCurrentlyActive = item ? (Number(item.is_active) === 1) : true;
        
        const confirmMsg = isCurrentlyActive 
            ? 'هل ترغب في إيقاف تجديد هذا الالتزام مؤقتاً؟\nسيبقى الالتزام وسجل كافة دفعاته وقيوده المحاسبية السابقة محفوظة في النظام.'
            : 'هل ترغب في استئناف تفعيل التجديد الدوري لهذا الالتزام الآن؟';
            
        if (!confirm(confirmMsg)) return;
        
        const res = await this.api('toggle_recurring_expense_status', { id });
        if (!res?.success) return this.toast(res?.error || 'حدث خطأ أثناء تغيير الحالة', 'danger');
        
        this.toast(res.message || 'تم تحديث حالة الالتزام بنجاح', 'success');
        this.renderOperatingExpenses('recurring');
    };

    App.deleteRecurringExpense = async function (id) {
        return this.toggleRecurringExpenseStatus(id);
    };



    // Navigation Switch Interception

    const origSwitchTab = App.switchTab ? App.switchTab.bind(App) : null;
    App.switchTab = function (tab, pushHistory = true) {
        if (tab === 'operating_expenses' || tab === 'recurring_expenses') {
            this.currentTab = 'operating_expenses';
            try {
                sessionStorage.setItem('sam_active_tab', 'operating_expenses');
                localStorage.setItem('sam_active_tab', 'operating_expenses');
                if (window.location.hash !== '#operating_expenses') {
                    history.replaceState(null, '', '#operating_expenses');
                }
            } catch (e) {}
            if (typeof this.updateBreadcrumb === 'function') this.updateBreadcrumb('المصروفات التشغيلية والدورية');
            document.querySelectorAll('.mt-nav-item').forEach(el => el.classList.remove('active'));
            const nav = document.getElementById('nav-operating_expenses') || document.getElementById('nav-recurring_expenses');
            if (nav) nav.classList.add('active');
            if (typeof this.closeMobileSidebar === 'function') this.closeMobileSidebar();
            return this.renderOperatingExpenses();
        }
        if (origSwitchTab) return origSwitchTab(tab, pushHistory);
    };



})();

