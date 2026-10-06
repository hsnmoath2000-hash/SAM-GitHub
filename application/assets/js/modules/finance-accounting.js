/**

 * SAM User Manager — Double-Entry Accounting, CoA, Journal & Financial Statements

 */

'use strict';



Object.assign(window.App, {

    setVouchersPage(page) {
        this.vouchersPage = Math.max(1, parseInt(page, 10) || 1);
        this.renderVouchersFin();
    },

    async renderVouchersFin() {

        const params = {

            type: this.vouchersTypeFilter,

            party_id: this.vouchersPartyFilter,

            payment_method: this.vouchersMethodFilter,

            category: this.vouchersCategoryFilter,

            start_date: this.vouchersStartDate,

            end_date: this.vouchersEndDate,

            search: this.vouchersSearch,

            page: this.vouchersPage,

            limit: this.vouchersLimit

        };



        const res = await this.api('get_financial_vouchers', params) || { data: [], summary: {}, grouped_by_category: [], grouped_by_party: [] };

        const vouchers = res.data || [];

        const summary = res.summary || {};

        const groupedByCategory = res.grouped_by_category || [];

        const groupedByParty = res.grouped_by_party || [];



        const adminsRes = await this.api('get_admins') || [];

        const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes.admins || []);



        const categoriesList = [

            'سداد مديونية كروت',

            'إيجار أبراج ومواقع',

            'صيانة ومعدات',

            'وقود ومولدات',

            'إنترنت وخطوط رئيسية',

            'مصروفات تشغيلية',

            'تجديد عقود واشتراكات',

            'مشتريات وفواتير موردين',

            'سداد موردين',

            'رصيد افتتاحي / مديونية سابقة',

            'رواتب ومكافآت',

            'مصاريف عمومية وإدارية',

            'أخرى'

        ];



        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            (this.can('vouchers_receipt_create') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '💵 + سند قبض نقدية', variant: 'success', onclick: "App.showVoucherModal('receipt')", title: 'إنشاء سند قبض نقدية جديد' } : null,
            (this.can('vouchers_payment_create') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '💳 - سند صرف مصاريف', variant: 'danger', onclick: "App.showVoucherModal('payment')", title: 'إنشاء سند صرف مصاريف جديد' } : null,
            { label: '🖨️ طباعة السندات المحددة', variant: 'primary', onclick: 'App.printSelectedVouchers()', title: 'طباعة السندات المحددة' },
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderVouchersFin()' }
        ].filter(Boolean);

        // 2. Standard KPIs
        const stats = [
            { label: 'إجمالي سندات القبض', value: App.formatMoney(summary.total_receipts || 0), icon: '💵', tone: 'green', meta: `${summary.count_receipts || 0} سند` },
            { label: 'إجمالي سندات الصرف', value: App.formatMoney(summary.total_payments || 0), icon: '💳', tone: 'rose', meta: `${summary.count_payments || 0} سند` },
            { label: 'صافي التدفق المالي', value: App.formatMoney(summary.net_flow || 0), icon: '📊', tone: 'blue', meta: 'Net Cashflow' },
            { label: 'إجمالي عدد السندات', value: (summary.total_count || vouchers.length).toLocaleString(), icon: '📑', tone: 'amber', meta: 'مطابقة للفلتر' }
        ];

        // 3. Toolbar
        const leftToolbar = [
            `<div style="display:inline-flex; border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-sm, 4px); overflow:hidden;">
                <button type="button" class="sam-btn sam-btn--sm ${this.vouchersViewMode==='list'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.vouchersViewMode='list'; App.renderVouchersFin();">📑 جدول السندات</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.vouchersViewMode==='by_party'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.vouchersViewMode='by_party'; App.renderVouchersFin();">👥 تجميع بالعميل</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.vouchersViewMode==='by_category'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.vouchersViewMode='by_category'; App.renderVouchersFin();">🏷️ تجميع بالتصنيف</button>
            </div>`
        ];

        const rightToolbar = [
            `<div class="quick-table-search" style="margin:0; min-width:160px;">
                <span class="quick-table-search-icon">🔍</span>
                <input type="text" class="quick-table-search-input" placeholder="رقم السند، الاسم، البيان..." value="${this.escape(this.vouchersSearch)}" onkeydown="if(event.key==='Enter'){ App.vouchersSearch=this.value; App.vouchersPage=1; App.renderVouchersFin(); }" />
            </div>`,
            `<select class="sam-select" style="min-width:120px;" onchange="App.vouchersTypeFilter=this.value; App.vouchersPage=1; App.renderVouchersFin();">
                <option value="">كل أنواع السندات</option>
                <option value="receipt" ${this.vouchersTypeFilter==='receipt'?'selected':''}>💵 سندات القبض</option>
                <option value="payment" ${this.vouchersTypeFilter==='payment'?'selected':''}>💳 سندات الصرف</option>
            </select>`,
            `<select class="sam-select" style="min-width:130px;" onchange="App.vouchersPartyFilter=this.value; App.vouchersPage=1; App.renderVouchersFin();">
                <option value="">كل العملاء والجهات</option>
                ${admins.map(a => `<option value="${a.id}" ${this.vouchersPartyFilter==a.id?'selected':''}>${a.fullname} (${a.username})</option>`).join('')}
            </select>`,
            `<select class="sam-select" style="min-width:100px;" onchange="App.vouchersMethodFilter=this.value; App.vouchersPage=1; App.renderVouchersFin();">
                <option value="">كل طرق السداد</option>
                <option value="cash" ${this.vouchersMethodFilter==='cash'?'selected':''}>نقدي Cash</option>
                <option value="bank" ${this.vouchersMethodFilter==='bank'?'selected':''}>تحويل بنكي Bank</option>
                <option value="check" ${this.vouchersMethodFilter==='check'?'selected':''}>شيك Check</option>
            </select>`,
            `<select class="sam-select" style="min-width:120px;" onchange="App.vouchersCategoryFilter=this.value; App.vouchersPage=1; App.renderVouchersFin();">
                <option value="">كل البنود والتصنيفات</option>
                ${categoriesList.map(c => `<option value="${c}" ${this.vouchersCategoryFilter===c?'selected':''}>${c}</option>`).join('')}
            </select>`,
            `<div style="display:inline-flex; align-items:center; gap:4px;">
                <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.vouchersStartDate}" onchange="App.vouchersStartDate=this.value; App.vouchersPage=1; App.renderVouchersFin();" title="من تاريخ" />
                <span>إلى</span>
                <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.vouchersEndDate}" onchange="App.vouchersEndDate=this.value; App.vouchersPage=1; App.renderVouchersFin();" title="إلى تاريخ" />
            </div>`,
            (this.vouchersSearch || this.vouchersTypeFilter || this.vouchersPartyFilter || this.vouchersMethodFilter || this.vouchersCategoryFilter || this.vouchersStartDate || this.vouchersEndDate) ? `
                <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" style="padding:4px 8px;" onclick="App.vouchersSearch=''; App.vouchersTypeFilter=''; App.vouchersPartyFilter=''; App.vouchersMethodFilter=''; App.vouchersCategoryFilter=''; App.vouchersStartDate=''; App.vouchersEndDate=''; App.vouchersPage=1; App.renderVouchersFin();" title="إلغاء كل الفلاتر">✕</button>
            ` : ''
        ].filter(Boolean);

        // 4. Content Area
        let contentHtml = '';

        if (this.vouchersViewMode === 'list') {
            // View Mode 1: Detailed List
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th style="width:30px; text-align:center;"><input type="checkbox" id="v-select-all" onchange="document.querySelectorAll('.v-select-cb').forEach(c => c.checked = this.checked); App.updateVouchersBulkBar();" title="تحديد الكل" /></th>
                                <th>#</th>
                                <th>رقم السند</th>
                                <th>نوع السند</th>
                                <th>المستلم منه / المدفوع له</th>
                                <th>المبلغ (Amount)</th>
                                <th>مركز التكلفة</th>
                                <th>الأثر المحاسبي المزدوج</th>
                                <th>طريقة الدفع</th>
                                <th>التصنيف / البند</th>
                                <th>البيان / الملاحظات</th>
                                <th>المحرر</th>
                                <th>التاريخ والوقت</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vouchers.map((v, idx) => `
                                <tr>
                                    <td style="text-align:center;"><input type="checkbox" class="v-select-cb" value="${v.id}" onchange="App.updateVouchersBulkBar()" /></td>
                                    <td>${((this.vouchersPage - 1) * this.vouchersLimit) + idx + 1}</td>
                                    <td><b><code>${v.voucher_no}</code></b></td>
                                    <td>
                                        <span class="status-pill ${v.voucher_type === 'receipt' ? 'status-active' : 'status-disabled'}">
                                            ${v.voucher_type === 'receipt' ? '💵 سند قبض' : '💳 سند صرف'}
                                        </span>
                                    </td>
                                    <td>
                                        <b>${this.escape(v.party_name || '-')}</b>
                                        ${v.party_id ? `<div style="margin-top:2px;"><a href="javascript:void(0)" onclick="if ((v.category && v.category.includes('مشتريات')) || (v.party_name && v.party_name.includes('المورد')) || (typeof App.openSupplierStatementModal === 'function')) { App.openSupplierStatementModal(${v.party_id}); } else { App.cashboxAccountFilter=${v.party_id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts'); }" style="font-size:11px; color:var(--sam-primary); font-weight:600; text-decoration:none;">📋 كشف حسابه</a></div>` : ''}
                                    </td>
                                    <td><b style="font-size:14px; color:${v.voucher_type === 'receipt' ? 'var(--sam-success)' : 'var(--sam-danger)'};">${App.formatMoney(v.amount)}</b></td>
                                    <td>
                                        ${v.cost_center_name ? `<span class="sam-badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;">🎯 ${this.escape(v.cost_center_name)}</span>` : '<span style="color:var(--sam-text-muted); font-size:11px;">عام</span>'}
                                    </td>
                                    <td>
                                        ${v.voucher_type === 'receipt' ? 
                                            `<span style="font-size:11px; color:#16a34a; font-weight:600; background:#f0fdf4; padding:2px 6px; border-radius:4px; border:1px solid #bbf7d0;">مدين: الصندوق 1101 ➔ دائن: ذمم 1301</span>` : 
                                            `<span style="font-size:11px; color:#dc2626; font-weight:600; background:#fef2f2; padding:2px 6px; border-radius:4px; border:1px solid #fecaca;">مدين: المصروف ➔ دائن: الصندوق 1101</span>`
                                        }
                                    </td>
                                    <td><span class="status-pill">${v.payment_method}</span></td>
                                    <td><span class="sam-badge" style="background:#475569; color:#fff;">${this.escape(v.category || 'عام')}</span></td>
                                    <td>${this.escape(v.notes || '-')}</td>
                                    <td><small>${this.escape(v.creator_name || 'Admin')}</small></td>
                                    <td style="font-size:11px; color:var(--sam-text-muted);">${v.created_at}</td>
                                    <td>
                                        <div style="display:flex; gap:3px; align-items:center;">
                                            ${!Number(v.is_void) && (this.userRole === 'system_owner' || this.userRole === 'superadmin') ? `
                                                <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" style="padding:2px 6px; font-size:11px;" onclick="App.showVoucherModal('${v.voucher_type}', null, ${v.id})" title="✏️ تعديل السند المالي">✏️</button>
                                            ` : ''}
                                            ${!Number(v.is_void) ? `
                                                <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 6px; font-size:11px;" onclick="App.printVoucher(${v.id})" title="🖨️ طباعة السند المالي">🖨️</button>
                                            ` : `<span class="sam-badge" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:3px 7px;">ملغى</span>`}
                                            <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px; background:#f8fafc;" onclick="App.showVoucherAuditModal(${v.id})" title="📜 عرض وتدقيق السند">📜</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="14" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد سندات مطابقة لمعايير الفلترة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;

            // Standard Pagination
            const totalVouchers = res.total || 0;
            const totalPages = res.total_pages || 1;
            if (PB?.renderPagination) {
                contentHtml += PB.renderPagination({
                    page: this.vouchersPage,
                    totalPages: totalPages,
                    totalRecords: totalVouchers,
                    itemName: 'سند',
                    onPageChange: 'App.setVouchersPage'
                });
            } else {
                contentHtml += `
                    <div class="sam-pagination mt-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <div style="font-size:12px; color:var(--sam-text-muted);">إجمالي السندات: <b>${totalVouchers.toLocaleString()}</b> (صفحة <b>${this.vouchersPage}</b> من <b>${totalPages}</b>)</div>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="sam-btn sam-btn--sm" ${this.vouchersPage <= 1 ? 'disabled' : ''} onclick="App.vouchersPage--; App.renderVouchersFin();">◀ السابق</button>
                            <span style="padding:4px 8px; font-weight:bold;">${this.vouchersPage}</span>
                            <button type="button" class="sam-btn sam-btn--sm" ${this.vouchersPage >= totalPages ? 'disabled' : ''} onclick="App.vouchersPage++; App.renderVouchersFin();">التالي ▶</button>
                        </div>
                    </div>
                `;
            }
        } else if (this.vouchersViewMode === 'by_party') {
            // View Mode 2: Grouped by Party
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>الجهة / العميل / المستفيد</th>
                                <th>إجمالي عدد السندات</th>
                                <th>إجمالي المقبوضات منه</th>
                                <th>إجمالي المصروفات له</th>
                                <th>صافي الحركة</th>
                                <th>إجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupedByParty.map((p, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><b>${this.escape(p.party_name)}</b></td>
                                    <td><b>${p.count}</b></td>
                                    <td style="color:var(--sam-success);"><b>${App.formatMoney(p.total_receipts)}</b></td>
                                    <td style="color:var(--sam-danger);"><b>${App.formatMoney(p.total_payments)}</b></td>
                                    <td><b>${App.formatMoney((parseFloat(p.total_receipts)||0) - (parseFloat(p.total_payments)||0))}</b></td>
                                    <td>
                                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.vouchersSearch='${this.escape(p.party_name)}'; App.vouchersViewMode='list'; App.renderVouchersFin();">🔍 استعراض سنداته</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد بيانات عملاء مجمعة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // View Mode 3: Grouped by Category
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>بند وتصنيف السند</th>
                                <th>نوع الحركة</th>
                                <th>عدد السندات</th>
                                <th>إجمالي المبلغ</th>
                                <th>إجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupedByCategory.map((c, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><span class="sam-badge" style="background:#475569; color:#fff; font-size:12px; padding:4px 8px;">🏷️ ${this.escape(c.category_name)}</span></td>
                                    <td>
                                        <span class="status-pill ${c.voucher_type === 'receipt' ? 'status-active' : 'status-disabled'}">
                                            ${c.voucher_type === 'receipt' ? '💵 مقبوضات' : '💳 مصروفات'}
                                        </span>
                                    </td>
                                    <td><b>${c.count}</b></td>
                                    <td><b style="font-size:13px; color:${c.voucher_type === 'receipt' ? 'var(--sam-success)' : 'var(--sam-danger)'};">${App.formatMoney(c.total_amount)}</b></td>
                                    <td>
                                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.vouchersCategoryFilter='${this.escape(c.category_name)}'; App.vouchersViewMode='list'; App.renderVouchersFin();">🔍 استعراض السندات</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد بنود وتصنيفات مجمعة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // 5. Render Shell
        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'vouchers_fin',
                archetype: 'ledger',
                title: 'السندات المالية (قبض وصرف)',
                subtitle: 'إدارة وتوثيق سندات القبض النقدية وصرف المصروفات والربط المحاسبي المزدوج',
                eyebrow: 'FINANCIAL VOUCHERS & LEDGERS',
                icon: '🧾',
                actions,
                stats,
                toolbar: { left: leftToolbar, right: rightToolbar },
                content: contentHtml
            });
        } else {
            document.getElementById('main-view').innerHTML = `
                <main class="sam-ui-page sam-page-shell" data-sam-page="vouchers_fin" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">🧾</span>
                            <div>
                                <span class="sam-page-eyebrow">FINANCIAL VOUCHERS & LEDGERS</span>
                                <h1>السندات المالية (قبض وصرف)</h1>
                                <p>إدارة وتوثيق سندات القبض النقدية وصرف المصروفات والربط المحاسبي المزدوج</p>
                            </div>
                        </div>
                        <div class="sam-page-actions">${actions.map(a => `<button type="button" class="sam-btn sam-btn--${a.variant||'secondary'}" onclick="${a.onclick}">${a.label}</button>`).join('')}</div>
                    </header>
                    <div class="view-scroll-content">
                        ${contentHtml}
                    </div>
                </main>
            `;
        }
        window.SamPageShell?.sync();
    },



    async showVoucherModal(type = 'receipt', defaultPartyId = null, editVoucherId = null) {

        if (editVoucherId && this.userRole !== 'system_owner' && this.userRole !== 'superadmin') {

            this.toast('غير مصرح: تعديل السندات المالية مقتصر على الإدارة العامة (Superadmin)', 'danger');

            return;

        }

        if (type === 'receipt' && defaultPartyId && Number(defaultPartyId) === Number(this.adminId)) {

            this.toast('لا يمكن إنشاء سند قبض لحسابك الخاص (المحصل والمسدد نفس الحساب)', 'warning');

            return;

        }

        const [adminsRes, cashboxRes, ccRes] = await Promise.all([

            this.api('get_admins'),

            this.api('get_cashbox_summary'),

            (!this._costCenters || this._costCenters.length === 0) ? this.api('get_cost_centers_report') : Promise.resolve(null)

        ]);



        const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);

        if (ccRes?.cost_centers) {

            this._costCenters = ccRes.cost_centers;

        }



        const userCashbox = parseFloat(cashboxRes?.cashbox_balance || 0);

        const userCreditLimit = parseFloat(cashboxRes?.credit_limit || 0);

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');



        let editVoucher = null;

        if (editVoucherId) {

            this.toast('جاري جلب بيانات السند...', 'info');

            const vRes = await this.api('get_financial_voucher_details', { voucher_id: editVoucherId });

            if (vRes && vRes.voucher) {

                editVoucher = vRes.voucher;

                type = editVoucher.voucher_type || type;

                defaultPartyId = editVoucher.party_id || defaultPartyId;

            }

        }



        const isEdit = !!editVoucher;

        const curAmount = isEdit ? parseFloat(editVoucher.amount) : '';

        const defaultPartyObj = defaultPartyId ? admins.find(a => Number(a.id) === Number(defaultPartyId)) : null;



                this.onVoucherCurrencyChange = function(code) {
            const sym = this.getCurrencySymbol(code);
            const lbl = document.getElementById('lbl-v-amount');
            if (lbl) lbl.textContent = `المبلغ (${sym}):`;
            this.onVoucherAmountInput(document.getElementById('v-amount')?.value);
        };

        this.onVoucherAmountInput = function(val) {
            const num = parseFloat(val) || 0;
            const currCode = document.getElementById('v-currency')?.value || this._baseCurrency || 'YER_SANAA';
            const tafqeetDiv = document.getElementById('v-tafqeet');
            const hintDiv = document.getElementById('v-currency-conv-hint');

            if (tafqeetDiv) {
                if (num > 0 && typeof App.tafqeet === 'function') {
                    tafqeetDiv.innerHTML = `📝 فقط <b>${App.tafqeet(num, currCode)}</b> لا غير`;
                } else {
                    tafqeetDiv.innerHTML = `📝 التفقيط المالي يظهر هنا فور كتابة المبلغ`;
                }
            }

            if (hintDiv) {
                const baseCode = this._baseCurrency || 'YER_SANAA';
                const isBase = (!currCode || currCode === baseCode || currCode === 'YER' || (currCode === 'YER_SANAA' && baseCode === 'YER_SANAA'));
                if (!isBase && num > 0) {
                    const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
                    const baseVal = this.formatMoney(num * rate, true, baseCode);
                    hintDiv.innerHTML = `💱 معادل الأساس: <b>${baseVal}</b> (سعر الصرف: ${rate})`;
                } else {
                    hintDiv.innerHTML = '';
                }
            }
        };

        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:560px;">

                <div class="mt-modal-header" style="background:${type==='receipt'?'#16a34a':'#dc2626'}; color:#fff;">

                    <span>${isEdit ? `✏️ تعديل سند ${type==='receipt'?'قبض':'صرف'} [ ${this.escape(editVoucher.voucher_no)} ]` : (type === 'receipt' ? '💵 تحرير سند قبض نقدية / توريد' : '💳 تحرير سند صرف مصاريف / مسحوبات')}</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form onsubmit="App.saveVoucher(event, '${type}', ${editVoucherId || 'null'})">

                    <div class="mt-modal-body" style="padding:16px;">

                        ${isEdit ? `

                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:11.5px; color:#1e40af;">

                                ℹ️ <b>تنبيه التدقيق المالي:</b> سيتم توثيق هذا التعديل في سجل تدقيق العمليات وعكس القيود السابقة وإرسال إشعار فوري للإدارة.

                            </div>

                        ` : ''}



                        ${(!isSuperAdmin && type === 'payment') ? `

                            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">

                                <div>

                                    <div style="font-size:11px; color:#64748b; font-weight:600;">💼 الرصيد النقدي المتوفر بصندوقك:</div>

                                    <div style="font-size:16px; font-weight:800; color:${userCashbox >= 0 ? '#16a34a' : '#dc2626'}; margin-top:2px;">${App.formatMoney(userCashbox)}</div>

                                </div>

                                <div style="text-align:left;">

                                    <div style="font-size:11px; color:#64748b; font-weight:600;">السقف الائتماني المسموح:</div>

                                    <div style="font-size:14px; font-weight:800; color:#0284c7; margin-top:2px;">${userCreditLimit > 0 ? App.formatMoney(userCreditLimit) : 'بدون سقف ائتماني'}</div>

                                </div>

                            </div>

                        ` : ''}



                        ${type === 'receipt' ? `

                            <div class="form-group" style="margin-bottom:12px;">

                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">المستلم منه (الموزع أو الوكيل): <span style="color:red;">*</span></label>

                                <div style="position:relative;">
                                    <input type="text" list="v-party-list" id="v-party-input" class="mt-input" style="width:100%; font-weight:700;" placeholder="🔍 اكتب اسم أو يوزر الموزع أو اختر من القائمة..." oninput="App.syncAdminCombobox(this, 'v-party-id', 'v-party-list')" onchange="App.syncAdminCombobox(this, 'v-party-id', 'v-party-list')" value="${defaultPartyObj ? `${this.escape(defaultPartyObj.fullname)} (@${this.escape(defaultPartyObj.username)})` : ''}" required />
                                    <input type="hidden" id="v-party-id" value="${defaultPartyId || ''}" />
                                    <datalist id="v-party-list">
                                        ${admins.filter(a => type !== 'receipt' || Number(a.id) !== Number(this.adminId)).map(a => `
                                            <option data-id="${a.id}" data-search="${this.escape(((a.fullname||'') + ' ' + (a.username||'') + ' ' + (a.phone||'')).toLowerCase())}" value="${this.escape(a.fullname)} (@${this.escape(a.username)}) - [رصيده: ${App.formatMoney(a.balance)}]">
                                                ${this.escape(a.fullname)} (@${this.escape(a.username)})
                                            </option>
                                        `).join('')}
                                    </datalist>
                                </div>

                            </div>

                        ` : `

                            <div class="form-row" style="margin-bottom:12px;">

                                <div class="form-group">

                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">المدفوع له (المستفيد / الجهة): <span style="color:red;">*</span></label>

                                    <input type="text" list="v-party-name-list" id="v-party-name" class="mt-input" style="width:100%; font-weight:700;" placeholder="مثال: شركة الاتصالات / مالك البرج" value="${this.escape(editVoucher?.party_name || '')}" required />
                                    <datalist id="v-party-name-list">
                                        ${admins.map(a => `<option value="${this.escape(a.fullname)}">${this.escape(a.fullname)} (@${this.escape(a.username)})</option>`).join('')}
                                    </datalist>

                                </div>

                                <div class="form-group">

                                    <label style="font-weight:700;">بند وحساب المصروف (Category):</label>

                                    <select id="v-category" class="mt-select" style="width:100%; font-weight:600;">

                                        <option value="وقود ومولدات" ${editVoucher?.category==='وقود ومولدات'?'selected':''}>[5403] وقود ومحروقات وديزل مولدات</option>

                                        <option value="صيانة ومعدات" ${editVoucher?.category==='صيانة ومعدات'?'selected':''}>[5404] مشتريات مواد وقطع صيانة</option>

                                        <option value="أجور صيانة وتصليح" ${editVoucher?.category==='أجور صيانة وتصليح'?'selected':''}>[5405] أجور وخدمات صيانة وتصليح</option>

                                        <option value="كهرباء وطاقة" ${editVoucher?.category==='كهرباء وطاقة'?'selected':''}>[5406] كهرباء ومياه وطاقة</option>

                                        <option value="خطوط انترنت فايبر" ${editVoucher?.category==='خطوط انترنت فايبر'?'selected':''}>[5401] خطوط واشتراكات إنترنت</option>

                                        <option value="إيجار أبراج ومواقع" ${editVoucher?.category==='إيجار أبراج ومواقع'?'selected':''}>[5402] إيجارات مواقع وأبراج</option>

                                        <option value="رواتب وأجور" ${editVoucher?.category==='رواتب وأجور'?'selected':''}>[5301] رواتب وأجور ومكافآت موظفين</option>

                                        <option value="مصاريف عامة وإدارية" ${editVoucher?.category==='مصاريف عامة وإدارية'?'selected':''}>[5305] مصاريف نثرية وعامة وإدارية</option>

                                        <option value="أخرى" ${editVoucher?.category==='أخرى'?'selected':''}>أخرى (حساب مالي مخصص)</option>

                                    </select>

                                </div>

                            </div>

                            <div class="form-group" style="margin-bottom:12px;">

                                <label style="font-weight:700;">الراوتر / الموقع المرتبط (اختياري):</label>

                                <select id="v-cost-center-id" class="mt-select" style="width:100%">

                                    <option value="">-- بدون ربط بموقع محدد (عام) --</option>

                                    ${(this._costCenters || []).map(c => `<option value="${c.id}" ${editVoucher?.cost_center_id==c.id?'selected':''}>${c.name} (${c.code})</option>`).join('')}

                                </select>

                            </div>

                        `}



                        <!-- Amount, Currency & Payment Method Grid -->
                        <div style="display:grid; grid-template-columns:140px 1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px;">العملة:</label>
                                <select id="v-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onVoucherCurrencyChange(this.value)">
                                    ${this.renderCurrencyOptions(editVoucher?.currency_code || this._baseCurrency)}
                                </select>
                            </div>
                            <div class="form-group">
                                <label id="lbl-v-amount" style="font-weight:700; font-size:12px;">المبلغ (${this.getCurrencySymbol(editVoucher?.currency_code || this._baseCurrency)}):</label>
                                <input type="number" id="v-amount" min="0.01" step="any" class="mt-input" style="width:100%; font-size:16px; font-weight:bold; color:#0078d7;" placeholder="0.00" value="${curAmount}" required oninput="App.onVoucherAmountInput(this.value)" />
                                <div id="v-tafqeet" style="font-size:11px; color:#0284c7; font-weight:bold; margin-top:3px; min-height:16px;">
                                    ${curAmount ? App.tafqeet(curAmount) : ''}
                                </div>
                                <div id="v-currency-conv-hint" style="font-size:11px; color:#059669; font-weight:700; margin-top:2px;"></div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px;">طريقة الاستلام / السداد:</label>
                                <select id="v-pay-method" class="mt-select" style="width:100%">
                                    <option value="cash" ${editVoucher?.payment_method==='cash'?'selected':''}>نقداً (الصندوق)</option>
                                    <option value="kareemi" ${editVoucher?.payment_method==='kareemi'?'selected':''}>الكريمي اكسبرس / حساب</option>
                                    <option value="onecash" ${editVoucher?.payment_method==='onecash'?'selected':''}>ون كاش (OneCash)</option>
                                    <option value="bank" ${editVoucher?.payment_method==='bank'?'selected':''}>تحويل بنكي</option>
                                    <option value="other" ${editVoucher?.payment_method==='other'?'selected':''}>أخرى</option>
                                </select>
                            </div>
                        </div>



                        <div class="form-group" style="margin-bottom:12px;">

                            <label style="font-weight:700;">البيان / الملاحظات:</label>

                            <input type="text" id="v-notes" class="mt-input" style="width:100%" placeholder="مثال: تسديد دفعة مبيعات كروت / إيجار برج شهر سبتمبر" value="${this.escape(editVoucher?.notes || '')}" />

                        </div>



                        ${isEdit ? `

                            <div class="form-group" style="margin-bottom:8px;">

                                <label style="font-weight:700; color:#dc2626;">سبب التعديل (إلزامي للتوثيق والتدقيق):</label>

                                <input type="text" id="v-edit-reason" class="mt-input" style="width:100%; border-color:#fca5a5;" placeholder="مثال: تصحيح خطأ إملائي في المبلغ / تعديل طريقة السداد" required value="تعديل وتصحيح بيانات السند" />

                            </div>

                        ` : ''}

                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn ${type==='receipt'?'mt-btn-success':'mt-btn-danger'}">

                            ${isEdit ? '💾 حفظ التعديلات وإرسال التنبيه' : (type === 'receipt' ? '💵 حفظ سند القبض وإيداع المبلغ' : '💳 حفظ سند الصرف وخصم المصروف')}

                        </button>

                    </div>

                </form>

            </div>

        </div>

        `;
        this.onVoucherAmountInput(curAmount || '');
    },

    async saveVoucher(e, type, editVoucherId = null) {

        e.preventDefault();

        if (type === 'receipt') {

            const pId = document.getElementById('v-party-id')?.value;

            if (Number(pId) === Number(this.adminId)) {

                return this.toast('⚠️ غير مصرح: لا يمكن إنشاء سند قبض لحسابك من نفسك', 'danger');

            }

        }

        const payload = {

            id: editVoucherId || null,

            voucher_type: type,

            party_id: document.getElementById('v-party-id')?.value || null,

            party_name: document.getElementById('v-party-name')?.value || '',

            category: document.getElementById('v-category')?.value || 'general',

            cost_center_id: document.getElementById('v-cost-center-id')?.value || null,

            amount: document.getElementById('v-amount').value,
            currency_code: document.getElementById('v-currency')?.value || App._baseCurrency || 'YER_SANAA',
            exchange_rate: App.getCurrencyRate(document.getElementById('v-currency')?.value),
            currency_amount: parseFloat(document.getElementById('v-amount').value),

            payment_method: document.getElementById('v-pay-method').value,

            notes: document.getElementById('v-notes').value,

            edit_reason: document.getElementById('v-edit-reason')?.value || 'تعديل السند'

        };



        this.toast('جاري حفظ السند المالي...', 'info');

        const res = await this.api('save_financial_voucher', {}, 'POST', payload);

        if (res && res.success) {

            this.toast(`تم حفظ السند بنجاح برقم [${res.voucher_no}]!`, 'success');

            this.closeModal();

            if (this.currentTab === 'cashbox_accounts') this.renderCashbox();

            else this.renderVouchersFin();

        } else {

            this.toast(res?.error || 'فشل حفظ السند', 'danger');

        }

    },



    async showVoucherAuditModal(voucherId) {

        this.toast('جاري جلب سجل تدقيق السند...', 'info');

        const res = await this.api('get_financial_voucher_details', { voucher_id: voucherId });

        if (!res || !res.voucher) return;

        const v = res.voucher;

        const logs = v.audit_logs || [];



        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:720px; max-height:90vh;">

                <div class="mt-modal-header" style="background:#0f172a; color:#fff;">

                    <span>📜 سجل التدقيق والتعديلات للسند المالي [ ${this.escape(v.voucher_no)} ]</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-modal-body" style="padding:16px; overflow-y:auto;">

                    <!-- Voucher Current Snapshot -->

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">

                        <div>

                            <div><b>رقم السند:</b> <code style="font-weight:bold; color:#0284c7;">${this.escape(v.voucher_no)}</code> (${v.voucher_type === 'receipt' ? '💵 سند قبض' : '💳 سند صرف'})</div>

                            <div style="margin-top:2px;"><b>الطرف:</b> ${this.escape(v.party_name)} | <b>طريقة الدفع:</b> ${this.escape(v.payment_method)}</div>

                        </div>

                        <div style="text-align:left;">

                            <div><b>المبلغ الحالي:</b> <b style="font-size:16px; color:${v.voucher_type === 'receipt' ? '#16a34a' : '#dc2626'};">${App.formatMoney(v.amount)}</b></div>

                            <div style="font-size:11px; color:#64748b; margin-top:2px;">حرره: ${this.escape(v.creator_name || 'النظام')} بتاريخ ${v.created_at}</div>

                        </div>

                    </div>



                    <div style="font-weight:700; margin-bottom:8px; font-size:12.5px;">📋 السجل الزمني للتعديلات والتدقيق:</div>

                    <table class="mt-table" style="font-size:12px;">

                        <thead>

                            <tr style="background:#f1f5f9;">

                                <th style="width:30px;">#</th>

                                <th>تاريخ ووقت التعديل</th>

                                <th>المسؤول المعدل</th>

                                <th>المبلغ السابق</th>

                                <th>المبلغ الجديد</th>

                                <th>ملخص الفروقات</th>

                                <th>سبب التعديل الموثق</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${logs.map((l, idx) => `

                                <tr>

                                    <td>${idx + 1}</td>

                                    <td style="font-size:11px; color:#64748b;">${l.created_at}</td>

                                    <td><b>${this.escape(l.modifier_name || l.modifier_user || 'المسؤول')}</b></td>

                                    <td style="color:#64748b; text-decoration:line-through;">${App.formatMoney(l.old_amount)}</td>

                                    <td><b style="color:#0284c7;">${App.formatMoney(l.new_amount)}</b></td>

                                    <td style="font-size:11px;">${this.escape(l.diff_summary || '-')}</td>

                                    <td style="color:#0f172a; font-weight:600;">${this.escape(l.edit_reason || '-')}</td>

                                </tr>

                            `).join('')}

                            ${logs.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:25px; color:var(--text-muted);">لم يتم إجراء أي تعديلات على هذا السند (السند في حالته الأصلية)</td></tr>' : ''}

                        </tbody>

                    </table>

                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="mt-btn mt-btn-success" onclick="App.printVoucher(${v.id})">
                            🖨️ طباعة السند المالي
                        </button>
                        ${(this.userRole === 'system_owner' || this.userRole === 'superadmin') ? `
                            <button type="button" class="mt-btn mt-btn-primary" onclick="App.closeModal(); App.showVoucherModal('${v.voucher_type}', null, ${v.id});">
                                ✏️ تعديل هذا السند الآن
                            </button>
                        ` : ''}
                    </div>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>

            </div>

        </div>

        `;

    },



    // ==========================================

    // SALES RETURNS FRONTEND UI

    // ==========================================

    async showSalesReturnHistoryModal(invoiceId) {

        const response = await this.api('get_sales_returns', { invoice_id: invoiceId });

        if (!response?.success) { this.toast(response?.error || 'تعذر تحميل سجل المرتجعات', 'danger'); return; }

        const records = response.data || [];

        const methodNames = { deduct_debt: 'تخفيض المديونية', cash_refund: 'استرداد نقدي', credit_balance: 'تسوية المديونية والرصيد الدائن' };

        this.openModal(`<div class="mt-modal-header"><b>سجل مرتجعات الفاتورة</b><button class="mt-btn" onclick="App.closeModal()">إغلاق</button></div>

            <div class="mt-modal-body" style="padding:16px; max-height:75vh; overflow:auto;">

            ${records.map(record => `<section style="border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px;">

                <b>${this.escape(record.return_no)}</b> · ${this.escape(record.created_at)}<br>

                ${Number(record.returned_cards_count)} كرت من ${Number(record.returned_sheets_count)} ورقة · <b>${this.formatMoney(record.returned_amount)}</b> · ${this.escape(methodNames[record.refund_method] || record.refund_method)}

                <div style="overflow:auto; margin-top:8px;"><table class="mt-table"><thead><tr><th>الباقة</th><th>الكروت المرتجعة</th><th>أرقام الأوراق والكميات</th><th>سعر الكرت بعد الخصم</th><th>قيمة المرتجع</th></tr></thead><tbody>

                ${(record.items || []).map(item => {

                    const numbers = String(item.sheet_numbers || '').split(',').map(Number).filter(n => n > 0).sort((a,b) => a-b);

                    const counts = item.sheet_card_counts || {};

                    const pages = numbers.map(number => String(number).padStart(6, '0') + (counts[number] ? ' (' + Number(counts[number]) + ' كرت)' : '')).join('، ');

                    const unnumbered = Number(counts[0]) || 0;

                    return `<tr><td>${this.escape(item.profile_name)}</td><td>${Number(item.cards_count)}</td><td style="min-width:150px; overflow-wrap:anywhere;">${this.escape(pages || 'بدون رقم ورقة')}${unnumbered ? ' · ' + unnumbered + ' كرت غير مرقم' : ''}</td><td>${Number(item.unit_price).toLocaleString('en-US', {maximumFractionDigits:6})} YER</td><td>${this.formatMoney(item.return_amount)}</td></tr>`;

                }).join('')}</tbody></table></div><p style="margin:8px 0 0;">السبب: ${this.escape(record.reason || '')}</p>

            </section>`).join('') || '<p>لم تسجل مرتجعات لهذه الفاتورة.</p>'}</div>`, '960px');

    },



    async showReturnSaleModal(invoiceId) {

        const requestId = (this._saleReturnRequestId || 0) + 1;

        this._saleReturnRequestId = requestId;

        this._saleReturnFocus = document.activeElement;

        this._saleReturnState = null;

        this.openModal('<div id="return-sale-loading" role="status" style="padding:28px; text-align:center;">جاري تحميل الكروت والأوراق المرتبطة بالفاتورة…</div>', '880px');

        const res = await this.api('get_sale_invoice_details', { invoice_id: invoiceId });

        if (requestId !== this._saleReturnRequestId || !document.getElementById('return-sale-loading')) return;

        if (!res || !res.invoice) {

            this.openModal('<div role="alert" style="padding:24px;">' + this.escape(res?.error || 'تعذر تحميل بيانات الفاتورة. أغلق النافذة وأعد المحاولة.') + '</div><div class="mt-modal-footer"><button class="mt-btn" onclick="App.closeReturnSaleModal()">إغلاق</button></div>', '560px');

            return;

        }

        const inv = res.invoice;

        if (Number(inv.buyer_id) === Number(this.adminId) && this.userRole !== 'system_owner' && this.userRole !== 'superadmin') {

            this.openModal('<div role="alert" style="padding:24px; color:#dc2626; font-weight:bold;">غير مصرح: لا يمكن إرجاع فاتورة مشتريات من حساب المشتري نفسه. هذه العملية مقتصرة على البائع أو الإدارة العامة</div><div class="mt-modal-footer"><button class="mt-btn" onclick="App.closeReturnSaleModal()">إغلاق</button></div>', '560px');

            return;

        }

        const options = (inv.return_options || []).map(option => ({

            ...option,

            available_cards_count: Number(option.available_cards_count) || 0,

            unnumbered_cards_count: Number(option.unnumbered_cards_count) || 0,

            available_sheets: (option.available_sheets || []).map(sheet => ({

                ...sheet,

                sheet_no: Number(sheet.sheet_no),

                cards_count: Number(sheet.cards_count) || 0,

                available_cards_count: Number(sheet.available_cards_count) || 0,

                blocked_cards_count: Number(sheet.blocked_cards_count) || 0,

                can_return_whole_sheet: sheet.can_return_whole_sheet === true || Number(sheet.can_return_whole_sheet) === 1

            })).filter(sheet => sheet.sheet_no > 0).sort((a, b) => a.sheet_no - b.sheet_no)

        }));

        this._saleReturnState = { invoice: inv, options, busy: false, selection: [] };

        const unavailable = inv.return_unavailable_reason || (!options.length ? 'لا توجد كروت مرتبطة بهذه الفاتورة يمكن تحديدها للمرتجع. يلزم مراجعة ربط الكروت ببنود الفاتورة قبل تسجيل الإرجاع.' : '');

        this.openModal(`

            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeReturnSaleModal()">

                <div class="mt-modal" id="return-sale-dialog" role="dialog" aria-modal="true" aria-labelledby="return-sale-title" onkeydown="App.handleReturnSaleKeydown(event)" style="width:880px; max-width:96vw; max-height:94vh; display:flex; flex-direction:column;">

                    <div class="mt-modal-header" style="background:#be123c; color:white; gap:12px;">

                        <span id="return-sale-title" style="font-weight:800;">مرتجع الفاتورة ${this.escape(inv.invoice_no)}</span>

                        <button type="button" class="mt-btn" aria-label="إغلاق المرتجع" onclick="App.closeReturnSaleModal()">✕</button>

                    </div>

                    <form id="return-sale-form" onsubmit="App.submitReturnSale(event, ${Number(inv.id)})" style="display:flex; flex-direction:column; min-height:0; overflow:hidden;">

                        <div class="mt-modal-body" style="padding:16px; overflow-y:auto;">

                            <div style="background:var(--bg-secondary,#f8fafc); border:1px solid var(--border-color,#cbd5e1); border-radius:8px; padding:12px; display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; margin-bottom:14px;">

                                <div><b>العميل / المشتري: ${this.escape(inv.buyer_name || '-')}</b><div style="margin-top:4px;">صافي الفاتورة الحالي: ${this.formatMoney(inv.total_amount)} · ${Number(inv.quantity) || 0} كرت</div></div>

                                <div>المسدد: ${this.formatMoney(inv.paid_amount)}<br>المتبقي الآجل: ${this.formatMoney(inv.remaining_amount)}</div>

                            </div>

                            <p style="font-size:12px; line-height:1.8;">حدد أوراقًا بأرقامها، أو عدد كروت من كل باقة. يحسب المرتجع بسعر الفاتورة بعد خصم البند وخصم الفاتورة، مع تسوية فروق التقريب. لا توجد كروت محددة تلقائيًا.</p>

                            ${unavailable ? `<div role="alert" style="padding:12px; border:1px solid #f59e0b; background:#fffbeb; color:#92400e; border-radius:6px; margin-bottom:12px;">${this.escape(unavailable)}</div>` : ''}

                            <fieldset id="ret-selection-fields" style="border:0; padding:0; margin:0; min-width:0;" ${unavailable ? 'disabled' : ''}>

                                ${options.map((option, index) => this.renderSaleReturnOption(option, index)).join('')}

                                <div class="form-group" style="margin:14px 0;">

                                    <label for="ret-refund-method" style="font-weight:700;">التسوية المالية للمرتجع</label>

                                    <select id="ret-refund-method" class="mt-select" style="width:100%;" onchange="App.calcReturnTotal()" required>

                                        ${Number(inv.remaining_amount) > 0 ? '<option value="deduct_debt">تخفيض المديونية — حتى قيمة المتبقي الآجل</option>' : ''}

                                        ${Number(inv.paid_amount) > 0 ? '<option value="cash_refund">استرداد نقدي — حتى قيمة المسدد</option>' : ''}

                                        <option value="credit_balance">تخفيض المديونية وإيداع الزائد رصيدًا للعميل</option>

                                    </select>

                                </div>

                                <div class="form-group">

                                    <label for="ret-reason" style="font-weight:700;">سبب الإرجاع</label>

                                    <input type="text" id="ret-reason" class="mt-input" style="width:100%;" maxlength="1000" placeholder="اكتب سبب إرجاع الكروت" required>

                                </div>

                            </fieldset>

                            <div id="ret-validation" role="alert" style="margin-top:10px; color:#b91c1c;"></div>

                            <div id="ret-server-error" role="alert" style="margin-top:10px; color:#b91c1c;"></div>

                            <div style="background:var(--bg-secondary,#f8fafc); border:1px solid var(--border-color,#cbd5e1); border-radius:8px; padding:12px; margin-top:12px;" aria-live="polite">

                                <div id="ret-selection-summary">لم يتم تحديد كروت للإرجاع</div>

                                <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; margin-top:8px;"><b>إجمالي المرتجع</b><b id="ret-grand-total" style="font-size:20px; color:#e11d48;">${this.formatMoney(0)}</b></div>

                                <div id="ret-grand-tafqeet" style="font-size:12px; margin-top:5px;">${this.tafqeet(0)}</div>

                            </div>

                        </div>

                        <div class="mt-modal-footer" style="display:flex; flex-wrap:wrap; gap:8px;">

                            <button type="button" class="mt-btn" onclick="App.closeReturnSaleModal()">إلغاء</button>

                            <button type="submit" id="ret-submit" class="mt-btn mt-btn-danger" disabled>اعتماد المرتجع وإعادة الكروت للمخزن</button>

                        </div>

                    </form>

                </div>

            </div>`);

        this.calcReturnTotal();

        document.querySelector('#return-sale-dialog button')?.focus();

    },



    renderSaleReturnOption(option, index) {

        const pages = option.available_sheets;

        const canReturn = option.available_cards_count > 0;

        const unitPrice = Number(option.net_unit_price ?? option.effective_unit_price) || 0;

        return `

            <section style="border:1px solid var(--border-color,#cbd5e1); border-radius:8px; padding:12px; margin-bottom:12px;" aria-labelledby="ret-profile-${index}">

                <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px;">

                    <div><b id="ret-profile-${index}">${this.escape(option.profile_name || 'باقة غير محددة')}</b>${option.batch_id ? `<span style="font-size:11px; margin-inline-start:8px;">دفعة ${this.escape(String(option.batch_id))}</span>` : ''}

                        <div style="font-size:12px; margin-top:4px;">الأصل: ${Number(option.original_cards_count) || 0} كرت · مرتجع سابق: ${Number(option.returned_cards_count) || 0} · متاح الآن: <b>${option.available_cards_count} كرت</b> ضمن ${pages.filter(s => s.available_cards_count > 0).length} ورقة مرقمة${option.unnumbered_cards_count ? ` و${option.unnumbered_cards_count} كرت غير مرقم` : ''}</div>

                    </div>

                    <div style="font-size:12px;"><b>سعر الكرت بعد الخصم</b><br><span dir="ltr">${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} YER</span></div>

                </div>

                ${Number(option.blocked_cards_count) > 0 ? `<p style="font-size:12px; color:#b45309;">${Number(option.blocked_cards_count)} كرت غير قابل للإرجاع حاليًا بسبب الاستخدام أو تغيّر حالة الكرت / عهدته.</p>` : ''}

                ${!canReturn ? '<p style="color:var(--text-muted,#64748b);">لا توجد كروت متاحة للإرجاع في هذا البند.</p>' : ''}

                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:end; margin-top:10px;">

                    <div><label for="ret-mode-${index}">طريقة التحديد</label><select id="ret-mode-${index}" class="mt-select" onchange="App.calcReturnTotal()" ${!canReturn ? 'disabled' : ''}><option value="sheets">اختيار أرقام الأوراق</option><option value="cards">عدد الكروت</option></select></div>

                    <div id="ret-count-wrap-${index}" hidden><label for="ret-count-${index}">عدد الكروت للإرجاع</label><input id="ret-count-${index}" type="number" inputmode="numeric" class="mt-input" min="0" max="${option.available_cards_count}" step="1" value="0" style="width:120px;" oninput="App.calcReturnTotal()" aria-describedby="ret-count-help-${index}"><small id="ret-count-help-${index}" style="display:block; max-width:440px;">تُختار الكروت المتاحة تصاعديًا حسب رقم الورقة ثم تسلسل الكرت. تظهر الأوراق والكميات التي سيتناولها المرتجع أدناه.</small></div>

                </div>

                <div id="ret-pages-wrap-${index}" style="margin-top:10px;">

                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px;"><b style="font-size:12px;">أرقام الأوراق المتبقية</b><button type="button" class="mt-btn" style="font-size:11px;" onclick="App.selectSaleReturnPages(${index}, true)" ${!canReturn ? 'disabled' : ''}>تحديد الأوراق المتاحة</button><button type="button" class="mt-btn" style="font-size:11px;" onclick="App.selectSaleReturnPages(${index}, false)">مسح التحديد</button></div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:6px; max-height:220px; overflow:auto; padding:2px;">

                        ${pages.map(sheet => `<label style="display:flex; align-items:start; gap:7px; border:1px solid var(--border-color,#cbd5e1); border-radius:5px; padding:8px; font-size:12px; ${!sheet.can_return_whole_sheet ? 'opacity:.65;' : ''}">

                            <input type="checkbox" class="ret-page-${index}" value="${sheet.sheet_no}" onchange="App.calcReturnTotal()" ${!sheet.can_return_whole_sheet ? 'disabled' : ''}>

                            <span><b dir="ltr">${String(sheet.sheet_no).padStart(4, '0')}</b> · ${sheet.available_cards_count} كرت متاح${sheet.blocked_cards_count ? `<br>${sheet.blocked_cards_count} غير قابل للإرجاع؛ استخدم عدد الكروت` : ''}</span>

                        </label>`).join('') || '<span style="font-size:12px;">لا توجد أوراق مرقمة متاحة. استخدم عدد الكروت إن توفرت كروت غير مرقمة.</span>'}

                    </div>

                </div>

                <div id="ret-item-summary-${index}" aria-live="polite" style="font-size:12px; line-height:1.8; margin-top:9px; overflow-wrap:anywhere;"></div>

                <div style="margin-top:6px; font-weight:700;">قيمة البند المرتجع: <span id="ret-item-total-${index}" style="color:#e11d48;">${this.formatMoney(0)}</span></div>

            </section>`;

    },



    selectSaleReturnPages(index, selected) {

        if (this._saleReturnState?.busy) return;

        document.querySelectorAll('.ret-page-' + index).forEach(input => { if (!input.disabled) input.checked = selected; });

        this.calcReturnTotal();

    },



    buildSaleReturnSelection(option, mode, sheetNumbers, rawCardsCount) {

        const result = { cards_count: 0, amount: 0, pages: [], unnumbered: 0, error: '', payload: null };

        let cardsCount = 0;

        if (mode === 'sheets') {

            const selected = new Set(sheetNumbers.map(Number));

            for (const sheet of option.available_sheets) {

                if (!selected.has(sheet.sheet_no)) continue;

                if (!sheet.can_return_whole_sheet || sheet.available_cards_count < 1) {

                    result.error = 'توجد ورقة غير متاحة للإرجاع بالكامل. حدّث البيانات أو استخدم عدد الكروت.';

                    return result;

                }

                cardsCount += sheet.available_cards_count;

                result.pages.push({ sheet_no: sheet.sheet_no, cards_count: sheet.available_cards_count, available_cards_count: sheet.available_cards_count });

                selected.delete(sheet.sheet_no);

            }

            if (selected.size) {

                result.error = 'تم تحديد رقم ورقة غير موجود في الفاتورة.';

                return result;

            }

        } else {

            cardsCount = Number(rawCardsCount);

            if (!Number.isInteger(cardsCount) || cardsCount < 0 || cardsCount > option.available_cards_count) {

                result.error = 'أدخل عددًا صحيحًا من صفر إلى ' + option.available_cards_count + ' كرت.';

                return result;

            }

            let remaining = cardsCount;

            for (const sheet of option.available_sheets) {

                const take = Math.min(remaining, sheet.available_cards_count);

                if (take > 0) result.pages.push({ sheet_no: sheet.sheet_no, cards_count: take, available_cards_count: sheet.available_cards_count });

                remaining -= take;

            }

            result.unnumbered = Math.min(remaining, option.unnumbered_cards_count);

            if (remaining > result.unnumbered) {

                result.error = 'تفاصيل الأوراق لا تطابق العدد المتاح. حدّث بيانات الفاتورة.';

                return result;

            }

        }

        if (!cardsCount) return result;

        const originalCount = Number(option.original_cards_count);

        if (!(originalCount > 0)) {

            result.error = 'بيانات الكمية الأصلية ناقصة؛ يلزم مراجعة ربط الفاتورة.';

            return result;

        }

        const netAmount = Number(option.effective_net_amount) || 0;

        const returnedAmount = Number(option.returned_amount) || 0;

        const netCents = Math.round(netAmount * 100);

        const cumulativeCents = Math.round(netCents * ((Number(option.returned_cards_count) || 0) + cardsCount) / originalCount);

        const remainingCents = Math.max(0, netCents - Math.round(returnedAmount * 100));

        result.amount = Math.max(0, Math.min(remainingCents, cumulativeCents - Math.round(returnedAmount * 100))) / 100;

        result.cards_count = cardsCount;

        result.payload = { return_key: option.return_key, invoice_item_id: option.invoice_item_id ?? null, selection_version: option.selection_version, mode };

        if (mode === 'sheets') result.payload.sheet_numbers = result.pages.map(sheet => sheet.sheet_no);

        else result.payload.cards_count = cardsCount;

        return result;

    },



    calcReturnTotal() {

        const state = this._saleReturnState;

        if (!state || state.busy || !document.getElementById('return-sale-form')) return;

        let cents = 0, cards = 0, pages = 0, unnumbered = 0;

        const errors = [];

        state.selection = [];

        state.options.forEach((option, index) => {

            const mode = document.getElementById('ret-mode-' + index)?.value || 'sheets';

            document.getElementById('ret-count-wrap-' + index).hidden = mode !== 'cards';

            document.getElementById('ret-pages-wrap-' + index).hidden = mode !== 'sheets';

            const chosenPages = Array.from(document.querySelectorAll('.ret-page-' + index + ':checked')).map(input => Number(input.value));

            const selection = this.buildSaleReturnSelection(option, mode, chosenPages, document.getElementById('ret-count-' + index)?.value || '0');

            if (selection.error) errors.push((option.profile_name || 'الباقة') + ': ' + selection.error);

            if (selection.payload) state.selection.push(selection.payload);

            cents += Math.round(selection.amount * 100);

            cards += selection.cards_count;

            pages += selection.pages.length;

            unnumbered += selection.unnumbered;

            document.getElementById('ret-item-total-' + index).textContent = this.formatMoney(selection.amount);

            const pageText = selection.pages.map(page => String(page.sheet_no).padStart(4, '0') + ' (' + page.cards_count + ' كرت' + (page.cards_count < page.available_cards_count ? ' من ' + page.available_cards_count : '') + ')').join('، ');

            document.getElementById('ret-item-summary-' + index).textContent = selection.error || (selection.cards_count ? 'المحدد: ' + selection.cards_count + ' كرت. الأوراق: ' + (pageText || 'لا توجد أوراق مرقمة') + (selection.unnumbered ? ' · ' + selection.unnumbered + ' كرت غير مرقم' : '') : 'لم يتم تحديد كروت من هذه الباقة.');

        });

        const amount = cents / 100;

        const method = document.getElementById('ret-refund-method')?.value;

        if (method === 'deduct_debt' && cents > Math.round(Number(state.invoice.remaining_amount) * 100)) errors.push('قيمة المرتجع أكبر من المتبقي الآجل. اختر تخفيض المديونية وإيداع الزائد رصيدًا للعميل، أو قلل الكمية.');

        if (method === 'cash_refund' && cents > Math.round(Number(state.invoice.paid_amount) * 100)) errors.push('قيمة المرتجع أكبر من المسدد نقدًا. اختر تسوية الرصيد أو قلل الكمية.');

        state.validationErrors = errors;

        state.previewAmount = amount;

        document.getElementById('ret-validation').textContent = errors.join(' ');

        document.getElementById('ret-selection-summary').textContent = cards ? cards + ' كرت · ' + pages + ' ورقة مرقمة' + (unnumbered ? ' · ' + unnumbered + ' كرت غير مرقم' : '') : 'لم يتم تحديد كروت للإرجاع';

        document.getElementById('ret-grand-total').textContent = this.formatMoney(amount);

        document.getElementById('ret-grand-tafqeet').textContent = this.tafqeet(amount);

        document.getElementById('ret-submit').disabled = !!state.invoice.return_unavailable_reason || !cards || errors.length > 0;

    },



    closeReturnSaleModal() {

        if (this._saleReturnState?.busy) return;

        this._saleReturnRequestId = (this._saleReturnRequestId || 0) + 1;

        this._saleReturnState = null;

        this.closeModal();

        if (this._saleReturnFocus?.isConnected) this._saleReturnFocus.focus();

    },



    handleReturnSaleKeydown(event) {

        if (event.key === 'Escape') {

            event.preventDefault();

            event.stopPropagation();

            this.closeReturnSaleModal();

        } else if (event.key === 'Tab') {

            const nodes = Array.from(event.currentTarget.querySelectorAll('button, input, select, [tabindex="0"]')).filter(node => !node.disabled && node.getClientRects().length);

            const first = nodes[0], last = nodes[nodes.length - 1];

            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }

            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }

        }

    },



    async submitReturnSale(e, invoiceId) {

        e.preventDefault();

        const state = this._saleReturnState;

        if (!state || state.busy || Number(state.invoice.id) !== Number(invoiceId)) return;

        this.calcReturnTotal();

        if (state.invoice.return_unavailable_reason || state.validationErrors.length || !state.selection.length) return;

        const reason = document.getElementById('ret-reason').value.trim();

        if (!reason) {

            document.getElementById('ret-server-error').textContent = 'اكتب سبب الإرجاع قبل الاعتماد.';

            document.getElementById('ret-reason').focus();

            return;

        }

        const payload = { invoice_id: Number(invoiceId), refund_method: document.getElementById('ret-refund-method').value, reason, items: state.selection };

        state.busy = true;

        document.getElementById('ret-server-error').textContent = '';

        document.getElementById('ret-selection-fields').disabled = true;

        document.getElementById('ret-submit').disabled = true;

        document.getElementById('ret-submit').textContent = 'جاري اعتماد المرتجع…';

        document.getElementById('return-sale-dialog').setAttribute('aria-busy', 'true');

        const res = await this.api('return_sale_invoice', {}, 'POST', payload);

        state.busy = false;

        if (this._saleReturnState !== state || !document.getElementById('return-sale-dialog')) return;

        document.getElementById('return-sale-dialog').removeAttribute('aria-busy');

        if (res?.success) {

            const returnedItems = res.items || res.return_items || [];

            const returnedAmount = res.returned_amount ?? res.total_return_amount ?? state.previewAmount;

            const returnedCards = res.returned_cards ?? res.returned_cards_count ?? returnedItems.reduce((total, item) => total + (Number(item.cards_count) || 0), 0);

            this.openModal(`<div role="status" style="padding:20px; line-height:1.9;"><b style="color:#16a34a;">${this.escape(res.message || 'تم اعتماد المرتجع وإعادة الكروت للمخزن.')}</b><div>رقم المرتجع: ${this.escape(res.return_no || '-')}</div><div>الكمية المعتمدة: ${Number(returnedCards) || 0} كرت · القيمة المعتمدة: <b>${this.formatMoney(returnedAmount)}</b></div>${returnedItems.map(item => {

                const numbers = (Array.isArray(item.sheet_numbers) ? item.sheet_numbers : String(item.sheet_numbers || '').split(',')).map(Number).filter(n => n > 0).sort((a, b) => a - b);

                return `<div style="border-top:1px solid var(--border-color,#cbd5e1); margin-top:8px; padding-top:8px; overflow-wrap:anywhere;">${this.escape(item.profile_name || '-')} · ${Number(item.cards_count) || 0} كرت · ${this.formatMoney(item.return_amount)}<br>الأوراق: <span dir="ltr">${numbers.map(n => String(n).padStart(4, '0')).join('، ') || 'كروت غير مرقمة'}</span></div>`;

            }).join('')}</div><div class="mt-modal-footer"><button class="mt-btn mt-btn-primary" onclick="App.closeReturnSaleModal()">تم</button></div>`, '650px');

            this.toast('تم تسجيل المرتجع ' + (res.return_no || ''), 'success');

            if (this.currentTab === 'sales') this.renderSales();

            else if (this.currentTab === 'card_warehouses') this.renderCardWarehouses();

        } else {

            document.getElementById('ret-selection-fields').disabled = false;

            document.getElementById('ret-submit').textContent = 'اعتماد المرتجع وإعادة الكروت للمخزن';

            document.getElementById('ret-server-error').textContent = res?.error || 'تعذر تأكيد نتيجة العملية. راجع سجل المرتجعات وحدّث الفاتورة قبل إعادة المحاولة.';

            this.calcReturnTotal();

        }

    },



        // ==========================================

    // 6. ASSETS & INFRASTRUCTURE (الأصول والمعدات)

});



// =========================================================================

// ENTERPRISE DOUBLE-ENTRY ACCOUNTING & ERP ENGINE - COMPLETE CLIENT CODE

// =========================================================================



// --- 1. CHART OF ACCOUNTS (شجرة ودليل الحسابات) ---

App.renderChartOfAccounts = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '➕ إضافة حساب جديد', variant: 'primary', onclick: 'App.openAddAccountModal()', title: 'إضافة حساب محاسبي جديد' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderChartOfAccounts()', title: 'تحديث شجرة الحسابات' }
    ];

    const toolbarHtml = `
        <div class="mt-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px;">
                <span class="status-badge" style="background:#e8f4fd; color:#0078d7; font-weight:700;" id="coa-count-badge">جاري التحميل...</span>
            </div>
            <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <select id="coa-type-filter" class="mt-select" onchange="App.filterChartOfAccounts()">
                    <option value="">-- جميع التصنيفات (1 - 5) --</option>
                    <option value="assets">1 - الأصول (Assets)</option>
                    <option value="liabilities">2 - الخصوم والالتزامات (Liabilities)</option>
                    <option value="equity">3 - حقوق الملكية والشركاء (Equity)</option>
                    <option value="revenue">4 - الإيرادات والمبيعات (Revenues)</option>
                    <option value="expense">5 - المصروفات التشغيلية (Expenses)</option>
                </select>
                <input type="text" id="coa-search" class="mt-input" placeholder="🔍 بحث بالرقم أو الاسم..." oninput="App.filterChartOfAccounts()" style="width:200px;" />
            </div>
        </div>
    `;

    const contentHtml = `
        <!-- KPI SUMMARY CARDS -->
        <div class="kpi-grid" style="padding:0; margin-bottom:15px;" id="coa-kpi-grid">
            <div class="kpi-card" style="border-right:4px solid #27ae60;">
                <div class="kpi-icon" style="background:#e8f8f0; color:#27ae60;">🏦</div>
                <div>
                    <div class="kpi-val" id="kpi-coa-assets" style="color:#27ae60;">0.00</div>
                    <div class="kpi-lbl">إجمالي الأصول (Assets)</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #e67e22;">
                <div class="kpi-icon" style="background:#fef5e7; color:#e67e22;">📜</div>
                <div>
                    <div class="kpi-val" id="kpi-coa-liabilities" style="color:#e67e22;">0.00</div>
                    <div class="kpi-lbl">الخصوم والالتزامات (Liabilities)</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #2980b9;">
                <div class="kpi-icon" style="background:#ebf5fb; color:#2980b9;">👥</div>
                <div>
                    <div class="kpi-val" id="kpi-coa-equity" style="color:#2980b9;">0.00</div>
                    <div class="kpi-lbl">حقوق الملكية (Equity)</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #16a085;">
                <div class="kpi-icon" style="background:#e8f8f5; color:#16a085;">📈</div>
                <div>
                    <div class="kpi-val" id="kpi-coa-revenue" style="color:#16a085;">0.00</div>
                    <div class="kpi-lbl">الإيرادات (Revenues)</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #c0392b;">
                <div class="kpi-icon" style="background:#fdedec; color:#c0392b;">📉</div>
                <div>
                    <div class="kpi-val" id="kpi-coa-expense" style="color:#c0392b;">0.00</div>
                    <div class="kpi-lbl">المصروفات (Expenses)</div>
                </div>
            </div>
        </div>

        <!-- ERP MAPPING GUIDE BANNER -->
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:14px 18px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="const d = document.getElementById('coa-guide-box'); d.style.display = d.style.display==='none'?'block':'none';">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">🗺️</span>
                    <div>
                        <span style="font-weight:700; font-size:14px; color:#0f172a;">دليل وخريطة الربط المحاسبي التلقائي للشبكة (ERP Operational Mapping)</span>
                        <div style="font-size:11px; color:#64748b;">كيف ترتبط شاشات الكروت، الصناديق، الموزعين وسندات الصرف مع شجرة الحسابات تلقائياً؟</div>
                    </div>
                </div>
                <span style="font-size:12px; color:#2563eb; font-weight:700; background:#eff6ff; padding:4px 10px; border-radius:15px; border:1px solid #bfdbfe;">[إظهار / إخفاء تفاصيل الربط] ▾</span>
            </div>
            <div id="coa-guide-box" style="margin-top:14px; font-size:12px; color:#334155; line-height:1.7; display:none;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px;">
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:10px; border-right:3px solid #0284c7;">
                        <b style="color:#0284c7;">💼 الصناديق والنقدية (1101 / 1102 / 1103):</b>
                        <div style="font-size:11px; color:#475569; margin-top:3px;">مرتبطة آلياً بالصندوق الرئيسي، وبنك الكريمي والمحافظ. تستقبل مقبوضات المبيعات النقدية وسندات القبض، وتدفع منها المصروفات.</div>
                    </div>
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:10px; border-right:3px solid #b45309;">
                        <b style="color:#b45309;">👥 ذمم ومديونيات الموزعين (1105):</b>
                        <div style="font-size:11px; color:#475569; margin-top:3px;">كل عملية بيع آجل أو دفعات كروت عهدة تُسجل مديونية على حساب الوكيل هنا، وتنخفض بسندات القبض النقدية أو البنكية.</div>
                    </div>
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:10px; border-right:3px solid #16a34a;">
                        <b style="color:#16a34a;">📈 إيرادات مبيعات الكروت (4101):</b>
                        <div style="font-size:11px; color:#475569; margin-top:3px;">تُضاف إليها تلقائياً عوائد كل كرت يُباع في نقاط البيع والموزعين، كطرف دائن أساسي في قائمة الدخل.</div>
                    </div>
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:10px; border-right:3px solid #dc2626;">
                        <b style="color:#dc2626;">📉 تكلفة النشاط والمصروفات (5101 - 5109):</b>
                        <div style="font-size:11px; color:#475569; margin-top:3px;">سندات الصرف تسحب من الصناديق وتوجه مباشرة لبنود المصروفات (إيجارات أبراج، ديزل، باقات إنترنت رئيسية، رواتب).</div>
                    </div>
                </div>
            </div>
        </div>

        ${toolbarHtml}

        <!-- ACCOUNTS TABLE -->
        <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f8fafc; border-bottom:2px solid var(--border-color); text-align:right;">
                        <th style="padding:10px 14px; width:110px;">رمز الحساب</th>
                        <th style="padding:10px 14px;">اسم الحساب المحاسبي</th>
                        <th style="padding:10px 14px; width:110px;">التصنيف</th>
                        <th style="padding:10px 14px; width:190px;">الربط بالعمليات (System Link)</th>
                        <th style="padding:10px 14px; width:85px;">الرتبة</th>
                        <th style="padding:10px 14px; width:95px;">الطبيعة</th>
                        <th style="padding:10px 14px; width:135px; text-align:left;">الرصيد الدفتري</th>
                        <th style="padding:10px 14px; width:140px; text-align:center;">إجراءات</th>
                    </tr>
                </thead>
                <tbody id="coa-table-body">
                    <tr><td colspan="8" style="text-align:center; padding:30px; color:#888;">جاري تحميل شجرة الحسابات...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
        mainView.innerHTML = PB.renderShell({
            id: 'chart_of_accounts',
            archetype: 'ledger',
            eyebrow: 'CHART OF ACCOUNTS / ERP',
            title: 'دليل وشجرة الحسابات المحاسبي الموحد',
            subtitle: 'الشجرة المحاسبية القياسية ومطابقة أرصدة الأصول والخصوم والمصروفات والإيرادات',
            icon: '🏢',
            actions: actions,
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px;">🏢 دليل وشجرة الحسابات المحاسبي الموحد (Chart of Accounts)</span>
                    <span class="status-badge" style="background:#e8f4fd; color:#0078d7; margin-right:10px;" id="coa-count-badge">جاري التحميل...</span>
                </div>
                <div class="mt-toolbar-right" style="gap:8px;">
                    <select id="coa-type-filter" class="mt-select" onchange="App.filterChartOfAccounts()">
                        <option value="">-- جميع التصنيفات (1 - 5) --</option>
                        <option value="assets">1 - الأصول (Assets)</option>
                        <option value="liabilities">2 - الخصوم والالتزامات (Liabilities)</option>
                        <option value="equity">3 - حقوق الملكية والشركاء (Equity)</option>
                        <option value="revenue">4 - الإيرادات والمبيعات (Revenues)</option>
                        <option value="expense">5 - المصروفات التشغيلية (Expenses)</option>
                    </select>
                    <input type="text" id="coa-search" class="mt-input" placeholder="🔍 بحث بالرقم أو الاسم..." oninput="App.filterChartOfAccounts()" style="width:200px;" />
                    <button class="mt-btn mt-btn-primary" onclick="App.openAddAccountModal()">➕ إضافة حساب جديد</button>
                    <button class="mt-btn" onclick="App.renderChartOfAccounts()">⟳ تحديث</button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:15px;">
                ${contentHtml}
            </div>
        `;
    }




    const res = await this.api('get_chart_of_accounts');

    if (!res || !res.success) {

        const tbody = document.getElementById('coa-table-body');

        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#e74c3c;">فشل تحميل شجرة الحسابات: ${this.escape(res?.error || 'خطأ غير معروف')}</td></tr>`;

        return;

    }



    this._coaAccounts = res.accounts || [];

    this.updateCoaSummary();

    this.filterChartOfAccounts();

};



App.updateCoaSummary = function() {

    let assets = 0, liabilities = 0, equity = 0, revenue = 0, expense = 0;

    (this._coaAccounts || []).forEach(acc => {

        const bal = Math.abs(parseFloat(acc.balance) || 0);

        const type = String(acc.account_type || '').toLowerCase();

        if (['asset', 'assets'].includes(type) && acc.level === 1) assets += bal;

        else if (['liability', 'liabilities'].includes(type) && acc.level === 1) liabilities += bal;

        else if (['equity'].includes(type) && acc.level === 1) equity += bal;

        else if (['revenue', 'revenues'].includes(type) && acc.level === 1) revenue += bal;

        else if (['expense', 'expenses'].includes(type) && acc.level === 1) expense += bal;

    });



    const elAssets = document.getElementById('kpi-coa-assets');

    if (elAssets) elAssets.innerText = App.formatMoney(assets);

    const elLiab = document.getElementById('kpi-coa-liabilities');

    if (elLiab) elLiab.innerText = App.formatMoney(liabilities);

    const elEq = document.getElementById('kpi-coa-equity');

    if (elEq) elEq.innerText = App.formatMoney(equity);

    const elRev = document.getElementById('kpi-coa-revenue');

    if (elRev) elRev.innerText = App.formatMoney(revenue);

    const elExp = document.getElementById('kpi-coa-expense');

    if (elExp) elExp.innerText = App.formatMoney(expense);



    const badge = document.getElementById('coa-count-badge');

    if (badge) badge.innerText = `${(this._coaAccounts || []).length} حساب معتمد`;

};



App.filterChartOfAccounts = function() {

    const typeFilter = (document.getElementById('coa-type-filter')?.value || '').trim();

    const search = (document.getElementById('coa-search')?.value || '').trim().toLowerCase();

    const tbody = document.getElementById('coa-table-body');

    if (!tbody) return;



    const filtered = (this._coaAccounts || []).filter(acc => {

        const accType = String(acc.account_type || '').toLowerCase();

        if (typeFilter && accType !== typeFilter && !(typeFilter === 'assets' && accType === 'asset') && !(typeFilter === 'liabilities' && accType === 'liability') && !(typeFilter === 'revenue' && accType === 'revenues') && !(typeFilter === 'expense' && accType === 'expenses')) return false;

        if (search) {

            const code = String(acc.code || acc.account_code || '').toLowerCase();

            const name = String(acc.name || acc.name_ar || '').toLowerCase();

            if (!code.includes(search) && !name.includes(search)) return false;

        }

        return true;

    });



    if (filtered.length === 0) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#999;">لا توجد حسابات مطابقة لمعايير البحث</td></tr>`;

        return;

    }



    const typeMeta = {

        asset: { label: 'أصول', color: '#27ae60', bg: '#e8f8f0' },

        assets: { label: 'أصول', color: '#27ae60', bg: '#e8f8f0' },

        liability: { label: 'خصوم', color: '#e67e22', bg: '#fef5e7' },

        liabilities: { label: 'خصوم', color: '#e67e22', bg: '#fef5e7' },

        equity: { label: 'حقوق ملكية', color: '#2980b9', bg: '#ebf5fb' },

        revenue: { label: 'إيرادات', color: '#16a085', bg: '#e8f8f5' },

        revenues: { label: 'إيرادات', color: '#16a085', bg: '#e8f8f5' },

        expense: { label: 'مصروفات', color: '#c0392b', bg: '#fdedec' },

        expenses: { label: 'مصروفات', color: '#c0392b', bg: '#fdedec' }

    };



    const systemLinks = {

        '1101': { label: '💼 الصندوق الرئيسي (الكاش)', color: '#0284c7', bg: '#e0f2fe' },

        '1102': { label: '🏦 بنك الكريمي', color: '#1d4ed8', bg: '#eff6ff' },

        '1103': { label: '📱 ون كاش والمحافظ', color: '#7c3aed', bg: '#f5f3ff' },

        '1104': { label: '🏪 صناديق الفروع والمحصلين', color: '#0369a1', bg: '#f0f9ff' },

        '1201': { label: '📦 مخزون كروت الإنترنت', color: '#b45309', bg: '#fef3c7' },

        '1202': { label: '📡 مخزون معدات وراوترات', color: '#b45309', bg: '#fffbeb' },

        '1301': { label: '👥 مديونيات كروت الموزعين', color: '#dc2626', bg: '#fee2e2' },

        '1302': { label: '👷 عهد الموظفين وسلف العمل', color: '#d97706', bg: '#fef3c7' },

        '1501': { label: '🖥️ سيرفرات وخوادم الشبكة', color: '#475569', bg: '#f1f5f9' },

        '1502': { label: '📡 راوترات ومحطات التوزيع', color: '#475569', bg: '#f1f5f9' },

        '1503': { label: '🗼 أبراج وهوائيات الشبكة', color: '#475569', bg: '#f1f5f9' },

        '1504': { label: '☀️ منظومات الطاقة والبطاريات', color: '#475569', bg: '#f1f5f9' },

        '2101': { label: '🌐 موردو سعات الإنترنت (ISP)', color: '#b91c1c', bg: '#fef2f2' },

        '2102': { label: '🏢 موردو أجهزة ومعدات', color: '#b91c1c', bg: '#fef2f2' },

        '2201': { label: '💵 رواتب وأجور مستحقة', color: '#b91c1c', bg: '#fef2f2' },

        '2202': { label: '🏢 إيجارات مواقع مستحقة', color: '#b91c1c', bg: '#fef2f2' },

        '3101': { label: '🏛️ رأس مال الشركاء', color: '#1d4ed8', bg: '#eff6ff' },

        '3201': { label: '👤 جاري الشريك (المدير)', color: '#1d4ed8', bg: '#eff6ff' },

        '3302': { label: '📈 أرباح الفترة القابلة للتوزيع', color: '#16a34a', bg: '#f0fdf4' },

        '4101': { label: '🎟️ إيرادات مبيعات الكروت', color: '#16a34a', bg: '#f0fdf4' },

        '4102': { label: '📶 إيرادات اشتراكات PPPoE', color: '#16a34a', bg: '#f0fdf4' },

        '4201': { label: '🛒 مبيعات أجهزة ومعدات', color: '#16a34a', bg: '#f0fdf4' },

        '4202': { label: '🛠️ خدمات تركيب وبرمجة', color: '#16a34a', bg: '#f0fdf4' },

        '5101': { label: '🌐 تكلفة خطوط وسعات الإنترنت', color: '#dc2626', bg: '#fef2f2' },

        '5102': { label: '🖨️ تكلفة طباعة كروت النت', color: '#dc2626', bg: '#fef2f2' },

        '5201': { label: '🗼 إيجارات مواقع الأبراج', color: '#c2410c', bg: '#fff7ed' },

        '5202': { label: '⛽ ديزل وكهرباء المولدات', color: '#c2410c', bg: '#fff7ed' },

        '5203': { label: '🔧 صيانة الشبكة وقطع الغيار', color: '#c2410c', bg: '#fff7ed' },

        '5301': { label: '👷 رواتب وأجور الموظفين', color: '#7c3aed', bg: '#f5f3ff' },

        '5302': { label: '🎁 عمولات وخصومات الموزعين', color: '#7c3aed', bg: '#f5f3ff' },

        '5305': { label: '📋 مصروفات نثرية وعمومية', color: '#64748b', bg: '#f8fafc' }

    };



    let html = '';

    filtered.forEach(acc => {

        const accType = String(acc.account_type || '').toLowerCase();

        const meta = typeMeta[accType] || { label: accType, color: '#555', bg: '#eee' };

        const indent = (acc.level - 1) * 22;

        const isLeaf = (acc.is_leaf == 1 || acc.children_count == 0);

        const icon = isLeaf ? '📄' : (acc.level === 1 ? '🏛️' : '📁');

        const bal = parseFloat(acc.balance) || 0;

        const code = String(acc.code || acc.account_code || '');

        const name = String(acc.name || acc.name_ar || '');

        const isDebit = acc.debit_credit_nature ? (acc.debit_credit_nature === 'debit') : (['asset', 'assets', 'expense', 'expenses'].includes(accType));

        const balColor = bal === 0 ? '#64748b' : (bal > 0 ? '#10b981' : '#ef4444');

        const linkBadge = systemLinks[code] ? 

            `<span style="background:${systemLinks[code].bg}; color:${systemLinks[code].color}; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700; display:inline-block;">${systemLinks[code].label}</span>` : 

            (acc.is_system ? `<span style="color:#94a3b8; font-size:11px;">حساب قياسي</span>` : `<span style="background:#f1f5f9; color:#64748b; padding:2px 7px; border-radius:4px; font-size:11px;">حساب مخصص</span>`);



        html += `

            <tr style="border-bottom:1px solid #edf2f7; ${!isLeaf ? 'background:#fafbfc; font-weight:600;' : ''}">

                <td style="padding:10px 14px; font-family:monospace; font-weight:700; color:#1e293b;">

                    <span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1;">${this.escape(code)}</span>

                </td>

                <td style="padding:10px 14px; padding-right:${14 + indent}px;">

                    <span style="margin-left:6px;">${icon}</span>

                    <span style="${acc.level === 1 ? 'font-size:14px; font-weight:700;' : ''}">${this.escape(name)}</span>

                </td>

                <td style="padding:10px 14px;">

                    <span style="background:${meta.bg}; color:${meta.color}; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">

                        ${meta.label}

                    </span>

                </td>

                <td style="padding:10px 14px;">

                    ${linkBadge}

                </td>

                <td style="padding:10px 14px; color:#64748b; font-size:12px;">

                    ${acc.level === 1 ? 'رئيسي (1)' : (acc.level === 2 ? 'مساعد (2)' : 'فرعي (3)')}

                </td>

                <td style="padding:10px 14px; font-size:12px;">

                    <span style="color:${isDebit ? '#0284c7' : '#d97706'}; font-weight:600;">

                        ${isDebit ? 'مدين (Dr)' : 'دائن (Cr)'}

                    </span>

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:700; color:${balColor};">

                    ${App.formatMoney(bal)}

                </td>

                <td style="padding:10px 14px; text-align:center;">

                    <div style="display:flex; justify-content:center; gap:6px;">

                        <button class="mt-btn" style="padding:3px 8px; font-size:11px;" title="عرض دفتر الأستاذ العام للحساب" onclick="App.viewGeneralLedger(${acc.id}, '${this.escape(name)}', '${this.escape(code)}')">

                            📖 الأستاذ

                        </button>

                        ${!isLeaf ? `

                            <button class="mt-btn" style="padding:3px 8px; font-size:11px; background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;" title="إضافة حساب فرعي تحته" onclick="App.openAddAccountModal(${acc.id})">

                                ➕ فرعي

                            </button>

                        ` : ''}

                        ${(!acc.is_system && isLeaf) ? `

                            <button class="mt-btn mt-btn-danger" style="padding:3px 8px; font-size:11px;" title="حذف الحساب المحاسبي" onclick="App.deleteChartAccount(${acc.id}, '${this.escape(name)}')">

                                🗑️

                            </button>

                        ` : ''}

                    </div>

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

};



// --- ADD ACCOUNT MODAL ---

App.openAddAccountModal = function(parentId = null) {

    const parentOptions = (this._coaAccounts || [])

        .filter(a => a.level < 3)

        .map(a => `<option value="${a.id}" data-type="${a.account_type}" data-code="${a.code}" data-nature="${a.debit_credit_nature}" ${parentId == a.id ? 'selected' : ''}>${a.code} - ${a.name} (مستوى ${a.level})</option>`)

        .join('');



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">➕ إضافة حساب محاسبي جديد إلى الشجرة</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitAddAccount(event)">

            <div class="mt-modal-body" style="padding:20px;">

                <div class="form-group" style="margin-bottom:14px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">الحساب الرئيسي الأب (Parent Account):</label>

                    <select id="acc-parent-id" class="mt-select" style="width:100%;" onchange="App.onParentAccountChange()">

                        <option value="">-- بدون حساب أب (حساب رئيسي مستوى 1) --</option>

                        ${parentOptions}

                    </select>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">رمز الحساب (Account Code) *</label>

                        <input type="text" id="acc-code" class="mt-input" style="width:100%; font-family:monospace;" placeholder="مثال: 1104 أو 5208" required />

                    </div>

                    <div style="flex:2;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">اسم الحساب بالعربية (Account Name) *</label>

                        <input type="text" id="acc-name" class="mt-input" style="width:100%;" placeholder="مثال: عهدة الفني أحمد / مصرف الكريمي" required />

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">التصنيف العام (Type) *</label>

                        <select id="acc-type" class="mt-select" style="width:100%;" required>

                            <option value="assets">1 - الأصول (Assets)</option>

                            <option value="liabilities">2 - الخصوم (Liabilities)</option>

                            <option value="equity">3 - حقوق الملكية (Equity)</option>

                            <option value="revenue">4 - الإيرادات (Revenues)</option>

                            <option value="expense">5 - المصروفات (Expenses)</option>

                        </select>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">الطبيعة المحاسبية الأصلية *</label>

                        <select id="acc-nature" class="mt-select" style="width:100%;" required>

                            <option value="debit">مدين (Debit - طبيعة الأصول والمصروفات)</option>

                            <option value="credit">دائن (Credit - طبيعة الخصوم والإيرادات والملكية)</option>

                        </select>

                    </div>

                </div>



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">ملاحظات / وصف استخدام الحساب:</label>

                    <textarea id="acc-notes" class="mt-input" style="width:100%; height:60px; resize:none;" placeholder="شرح الغرض من هذا الحساب المحاسبي وكيفية استخدامه..."></textarea>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-save-acc">💾 حفظ الحساب المحاسبي</button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '650px');

    if (parentId) {

        this.onParentAccountChange();

    }

};



App.onParentAccountChange = function() {

    const parentSel = document.getElementById('acc-parent-id');

    if (!parentSel) return;

    const opt = parentSel.options[parentSel.selectedIndex];

    if (opt && opt.value) {

        const type = opt.getAttribute('data-type');

        const nature = opt.getAttribute('data-nature');

        const pCode = opt.getAttribute('data-code');



        if (type) document.getElementById('acc-type').value = type;

        if (nature) document.getElementById('acc-nature').value = nature;



        const siblings = (this._coaAccounts || []).filter(a => a.parent_id == opt.value);

        let nextNum = siblings.length + 1;

        let pad = nextNum < 10 ? '0' + nextNum : String(nextNum);

        document.getElementById('acc-code').value = `${pCode}${pad}`;

    }

};



App.submitAddAccount = async function(e) {

    e.preventDefault();

    const btn = document.getElementById('btn-save-acc');

    if (btn) btn.disabled = true;



    const data = {

        parent_id: document.getElementById('acc-parent-id').value || null,

        code: document.getElementById('acc-code').value.trim(),

        name: document.getElementById('acc-name').value.trim(),

        account_type: document.getElementById('acc-type').value,

        debit_credit_nature: document.getElementById('acc-nature').value,

        notes: document.getElementById('acc-notes').value.trim()

    };



    const res = await this.api('save_chart_account', data, 'POST');

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حفظ الحساب المحاسبي', 'danger');

    }



    this.toast('تم حفظ الحساب المحاسبي بنجاح في الشجرة 🏢', 'success');

    this.closeModal();

    this.renderChartOfAccounts();

};



App.deleteChartAccount = async function(id, name) {

    if (!confirm(`هل أنت متأكد من رغبتك في حذف أو تعطيل الحساب (${name})؟`)) return;

    this.toast('جاري معالجة حذف الحساب...', 'info');

    const res = await this.api('delete_chart_account', { id });

    if (res && res.success) {

        this.toast(res.message || 'تم حذف/تعطيل الحساب بنجاح', res.action === 'deactivated' ? 'warning' : 'success');

        this.renderChartOfAccounts();

    } else {

        this.toast(res?.error || 'فشل حذف الحساب', 'danger');

    }

};



// --- 2. JOURNAL ENTRIES (دفتر اليومية العامة والقيود المتوازنة) ---

App.renderJournalEntries = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '➕ قيد يومية يدوي متوازن', variant: 'primary', onclick: 'App.openNewJournalEntryModal()', title: 'إضافة قيد يومية يدوي' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.loadJournalEntriesList()' }
    ];

    const stats = [
        { label: 'نظام القيد المزدوج', value: 'متوازن ⚖️', icon: '⚖️', tone: 'green', meta: 'Double-Entry Balanced' },
        { label: 'دفتر اليومية', value: 'العامة', icon: '📑', tone: 'blue', meta: 'General Journal' }
    ];

    const rightToolbar = [
        `<select id="je-source-filter" class="sam-select" style="min-width:140px;" onchange="App.loadJournalEntriesList()">
            <option value="">-- جميع المصادر --</option>
            <option value="manual">قيود يدوية (Manual)</option>
            <option value="sales">مبيعات الكروت (Sales)</option>
            <option value="vouchers">سندات القبض والصرف</option>
            <option value="salary">مسيرات الرواتب (Salaries)</option>
            <option value="profit_distribution">توزيع الأرباح</option>
        </select>`,
        `<div style="display:inline-flex; align-items:center; gap:4px;">
            <input type="date" id="je-date-start" class="sam-input" style="padding:3px 6px; font-size:11px;" onchange="App.loadJournalEntriesList()" title="من تاريخ" />
            <span>إلى</span>
            <input type="date" id="je-date-end" class="sam-input" style="padding:3px 6px; font-size:11px;" onchange="App.loadJournalEntriesList()" title="إلى تاريخ" />
        </div>`,
        `<div class="quick-table-search" style="margin:0; min-width:180px;">
            <span class="quick-table-search-icon">🔍</span>
            <input type="text" id="je-search" class="quick-table-search-input" placeholder="بحث بالرقم أو البيان..." oninput="App.loadJournalEntriesList()" />
        </div>`
    ];

    const contentHtml = `
        <div class="sam-table-container mt-table-container">
            <table class="sam-table mt-table" style="font-size:13px;">
                <thead>
                    <tr>
                        <th style="width:130px;">رقم القيد</th>
                        <th style="width:110px;">التاريخ</th>
                        <th style="width:150px;">المصدر / المرجع</th>
                        <th>البيان والشرح المحاسبي</th>
                        <th style="width:140px; text-align:left;">إجمالي القيد</th>
                        <th style="width:110px; text-align:center;">الحالة</th>
                        <th style="width:120px;">المسؤول</th>
                        <th style="width:100px; text-align:center;">تفاصيل</th>
                    </tr>
                </thead>
                <tbody id="je-table-body">
                    <tr><td colspan="8" style="text-align:center; padding:30px; color:var(--sam-text-muted);">جاري جلب قيود اليومية...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    if (PB?.renderShell) {
        mainView.innerHTML = PB.renderShell({
            id: 'journal_entries',
            archetype: 'ledger',
            title: 'دفتر قيود اليومية العامة',
            subtitle: 'توثيق حركات القيد المزدوج المتوازن والعمليات المالية المباشرة والآلية',
            eyebrow: 'GENERAL JOURNAL ENTRIES',
            icon: '📑',
            actions,
            stats,
            toolbar: { left: [], right: rightToolbar },
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <main class="sam-ui-page sam-page-shell" data-sam-page="journal_entries" dir="rtl">
                <header class="sam-page-hero">
                    <div class="sam-page-hero-copy">
                        <span class="sam-ui-icon" style="font-size:28px;">📑</span>
                        <div>
                            <span class="sam-page-eyebrow">GENERAL JOURNAL ENTRIES</span>
                            <h1>دفتر قيود اليومية العامة</h1>
                            <p>توثيق حركات القيد المزدوج المتوازن والعمليات المالية المباشرة والآلية</p>
                        </div>
                    </div>
                    <div class="sam-page-actions">${actions.map(a => `<button type="button" class="sam-btn sam-btn--${a.variant||'secondary'}" onclick="${a.onclick}">${a.label}</button>`).join('')}</div>
                </header>
                <div class="view-scroll-content">
                    ${contentHtml}
                </div>
            </main>
        `;
    }
    window.SamPageShell?.sync();

    await this.loadJournalEntriesList();
};



App.loadJournalEntriesList = async function() {

    const source = document.getElementById('je-source-filter')?.value || '';

    const start_date = document.getElementById('je-date-start')?.value || '';

    const end_date = document.getElementById('je-date-end')?.value || '';

    const search = document.getElementById('je-search')?.value || '';

    const tbody = document.getElementById('je-table-body');

    if (!tbody) return;



    const res = await this.api('get_journal_entries', { source, start_date, end_date, search, limit: 100 });

    if (!res || !res.success) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#e74c3c;">فشل تحميل القيود: ${this.escape(res?.error || 'خطأ غير معروف')}</td></tr>`;

        return;

    }



    this._journalEntries = res.entries || [];

    if (this._journalEntries.length === 0) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:35px; color:#94a3b8;">لا توجد قيود يومية مطابقة للبحث</td></tr>`;

        return;

    }



    const sourceMeta = {

        manual: { label: 'قيد يدوي', color: '#8b5cf6', bg: '#f5f3ff' },

        sales: { label: 'فاتورة مبيعات', color: '#10b981', bg: '#ecfdf5' },

        vouchers: { label: 'سند مالي', color: '#0284c7', bg: '#f0f9ff' },

        receipt: { label: 'سند قبض', color: '#0284c7', bg: '#f0f9ff' },

        payment: { label: 'سند صرف', color: '#dc2626', bg: '#fef2f2' },

        transfer: { label: 'تحويل مالي', color: '#059669', bg: '#ecfdf5' },

        salary: { label: 'مسير رواتب', color: '#2563eb', bg: '#eff6ff' },

        depreciation: { label: 'إهلاك أصول', color: '#d97706', bg: '#fffbeb' },

        profit_distribution: { label: 'توزيع أرباح', color: '#f59e0b', bg: '#fffbeb' }

    };



    let html = '';

    this._journalEntries.forEach(je => {

        const srcKey = je.source_module || je.source || 'manual';

        const sm = sourceMeta[srcKey] || { label: (srcKey === 'undefined' || !srcKey ? 'قيد عام' : srcKey), color: '#64748b', bg: '#f1f5f9' };

        html += `

            <tr style="border-bottom:1px solid #edf2f7;">

                <td style="padding:10px 14px; font-family:monospace; font-weight:700; color:#1e293b;">

                    <span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1;">${this.escape(je.entry_no)}</span>

                </td>

                <td style="padding:10px 14px; color:#475569;">${je.entry_date}</td>

                <td style="padding:10px 14px;">

                    <span style="background:${sm.bg}; color:${sm.color}; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;">

                        ${sm.label}

                    </span>

                    ${je.reference_no ? `<div style="font-size:11px; color:#64748b; font-family:monospace; margin-top:2px;" dir="ltr">#${this.escape(je.reference_no)}</div>` : ''}

                </td>

                <td style="padding:10px 14px; font-weight:600; color:#0f172a;">${this.escape(je.description || '-')}</td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:700; color:#0284c7;">

                    ${App.formatMoney(je.total_debit)}

                </td>

                <td style="padding:10px 14px; text-align:center;">

                    <span style="background:#e8f8f0; color:#16a34a; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">

                        ⚖️ مرحّل

                    </span>

                </td>

                <td style="padding:10px 14px; color:#64748b; font-size:12px;">${this.escape(je.creator_name || 'النظام')}</td>

                <td style="padding:10px 14px; text-align:center;">

                    <button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick="App.viewJournalEntryDetails(${je.id})">

                        🔍 تفاصيل

                    </button>

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

};



// --- VIEW JOURNAL ENTRY DRILL-DOWN MODAL ---

App.viewJournalEntryDetails = function(entryId) {

    const je = (this._journalEntries || []).find(e => e.id == entryId);

    if (!je) return;



    let linesHtml = '';

    (je.lines || []).forEach((line, idx) => {

        linesHtml += `

            <tr style="border-bottom:1px solid #f1f5f9;">

                <td style="padding:8px 12px; color:#64748b;">${idx + 1}</td>

                <td style="padding:8px 12px; font-family:monospace; font-weight:700;">${this.escape(line.account_code)}</td>

                <td style="padding:8px 12px; font-weight:600;">${this.escape(line.account_name)}</td>

                <td style="padding:8px 12px; color:#64748b; font-size:12px;">${this.escape(line.cost_center_name || '-')}</td>

                <td style="padding:8px 12px; text-align:left; font-family:monospace; font-weight:700; color:#0284c7;">

                    ${parseFloat(line.debit) > 0 ? App.formatMoney(line.debit) : '-'}

                </td>

                <td style="padding:8px 12px; text-align:left; font-family:monospace; font-weight:700; color:#d97706;">

                    ${parseFloat(line.credit) > 0 ? App.formatMoney(line.credit) : '-'}

                </td>

                <td style="padding:8px 12px; color:#64748b; font-size:12px;">${this.escape(line.note || '-')}</td>

            </tr>

        `;

    });



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <div style="display:flex; align-items:center; gap:8px;">

                <span style="font-weight:700; font-size:16px;">تفاصيل قيد اليومية رقم:</span>

                <span style="font-family:monospace; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700;">${this.escape(je.entry_no)}</span>

            </div>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <div class="mt-modal-body" style="padding:20px;">

            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; background:#f8fafc; padding:12px; border-radius:6px; margin-bottom:16px; border:1px solid #e2e8f0;">

                <div><small style="color:#64748b; display:block;">تاريخ القيد:</small><b>${je.entry_date}</b></div>

                <div><small style="color:#64748b; display:block;">المصدر:</small><b>${je.source}</b></div>

                <div><small style="color:#64748b; display:block;">الرقم المرجعي:</small><b>${je.reference_no || '-'}</b></div>

                <div><small style="color:#64748b; display:block;">المسؤول:</small><b>${je.creator_name || 'النظام'}</b></div>

            </div>



            <div style="margin-bottom:14px; padding:10px; background:#fafafa; border-radius:6px; border-right:3px solid #0284c7;">

                <b style="font-size:12px; color:#64748b;">البيان العام: </b>

                <span style="font-weight:600; color:#0f172a;">${this.escape(je.description || '-')}</span>

            </div>



            <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:15px;">

                <thead>

                    <tr style="background:#f1f5f9; text-align:right;">

                        <th style="padding:8px 12px; width:30px;">#</th>

                        <th style="padding:8px 12px; width:90px;">رمز الحساب</th>

                        <th style="padding:8px 12px;">اسم الحساب</th>

                        <th style="padding:8px 12px; width:130px;">مركز التكلفة</th>

                        <th style="padding:8px 12px; width:130px; text-align:left;">مدين (Debit)</th>

                        <th style="padding:8px 12px; width:130px; text-align:left;">دائن (Credit)</th>

                        <th style="padding:8px 12px;">ملاحظات السطر</th>

                    </tr>

                </thead>

                <tbody>

                    ${linesHtml}

                </tbody>

                <tfoot>

                    <tr style="background:#f8fafc; border-top:2px solid #cbd5e1; font-weight:700;">

                        <td colspan="4" style="padding:10px 12px; text-align:left;">الإجمالي المتوازن:</td>

                        <td style="padding:10px 12px; text-align:left; font-family:monospace; color:#0284c7; font-size:14px;">${App.formatMoney(je.total_debit)}</td>

                        <td style="padding:10px 12px; text-align:left; font-family:monospace; color:#d97706; font-size:14px;">${App.formatMoney(je.total_credit)}</td>

                        <td style="padding:10px 12px; color:#16a34a;">⚖️ متطابق 100%</td>

                    </tr>

                </tfoot>

            </table>

        </div>

        <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">

            <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>

        </div>

    `;



    this.openModal(modalHtml, '780px');

};



// --- NEW MANUAL JOURNAL ENTRY MODAL ---

App.openNewJournalEntryModal = async function() {

    if (!this._coaAccounts || this._coaAccounts.length === 0) {

        const res = await this.api('get_chart_of_accounts');

        this._coaAccounts = res?.accounts || [];

    }

    if (!this._costCenters) {

        const ccRes = await this.api('get_cost_centers_report');

        this._costCenters = ccRes?.cost_centers || [];

    }



    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">➕ إنشاء قيد يومية عام يدوي متوازن (Balanced Journal Entry)</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitNewJournalEntry(event)">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">تاريخ القيد *</label>

                        <input type="date" id="mje-date" class="mt-input" style="width:100%;" value="${today}" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">الرقم المرجعي (Ref / سند / شيك):</label>

                        <input type="text" id="mje-ref" class="mt-input" style="width:100%;" placeholder="مثال: REF-2026-001" />

                    </div>

                </div>



                <div style="display:grid; grid-template-columns:160px 1fr; gap:12px; margin-bottom:16px;">
                    <div>
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">عملة القيد *</label>
                        <select id="mje-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.calcJournalEntryBalance()">
                            ${this.renderCurrencyOptions(this._baseCurrency)}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">البيان والشرح العام للقيد *</label>
                        <input type="text" id="mje-desc" class="mt-input" style="width:100%;" placeholder="شرح تفصيلي لمبرر القيد المحاسبي..." required />
                    </div>
                </div>



                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">

                    <span style="font-weight:700; font-size:14px; color:#1e293b;">سطور القيد المزدوج (Lines):</span>

                    <button type="button" class="mt-btn" style="background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;" onclick="App.addJournalEntryRow()">

                        ➕ إضافة سطر جديد

                    </button>

                </div>



                <div style="border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin-bottom:14px;">

                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">

                        <thead>

                            <tr style="background:#f1f5f9; text-align:right;">

                                <th style="padding:8px 10px; width:220px;">الحساب المحاسبي *</th>

                                <th style="padding:8px 10px; width:160px;">مركز التكلفة</th>

                                <th style="padding:8px 10px; width:120px;">مدين (Debit)</th>

                                <th style="padding:8px 10px; width:120px;">دائن (Credit)</th>

                                <th style="padding:8px 10px;">ملاحظة السطر</th>

                                <th style="padding:8px 10px; width:40px; text-align:center;">حذف</th>

                            </tr>

                        </thead>

                        <tbody id="mje-lines-body">

                            <!-- Rows added via JS -->

                        </tbody>

                    </table>

                </div>



                <!-- LIVE BALANCE VALIDATION CARD -->

                <div id="mje-balance-card" style="padding:12px 16px; border-radius:6px; background:#fef2f2; border:1px solid #fecaca; display:flex; justify-content:space-between; align-items:center;">

                    <div>

                        <span id="mje-balance-status" style="font-weight:700; color:#dc2626;">⚠️ القيد غير متوازن</span>

                        <div style="font-size:11px; color:#64748b;" id="mje-balance-diff">الفارق: 0.00</div>

                    </div>

                    <div style="display:flex; gap:20px; font-family:monospace; font-size:13px;">

                        <div>إجمالي المدين: <b id="mje-total-debit" style="color:#0284c7;">0.00</b></div>

                        <div>إجمالي الدائن: <b id="mje-total-credit" style="color:#d97706;">0.00</b></div>

                    </div>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-submit-mje" disabled>

                    ⚖️ اعتماد وترحيل القيد المتوازن

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '840px');

    // Add initial 2 rows (Debit and Credit)

    this.addJournalEntryRow();

    this.addJournalEntryRow();

    this.calcJournalEntryBalance();

};



App.addJournalEntryRow = function() {

    const tbody = document.getElementById('mje-lines-body');

    if (!tbody) return;



    const accOptions = (this._coaAccounts || [])

        .filter(a => a.is_leaf == 1 || a.level >= 2)

        .map(a => `<option value="${a.id}">${a.code} - ${this.escape(a.name)}</option>`)

        .join('');



    const ccOptions = (this._costCenters || [])

        .map(c => `<option value="${c.id}">${this.escape(c.name)} (${c.code})</option>`)

        .join('');



    const tr = document.createElement('tr');

    tr.className = 'mje-row';

    tr.style.borderBottom = '1px solid #f1f5f9';

    tr.innerHTML = `

        <td style="padding:6px 8px;">

            <select class="mt-select mje-acc" style="width:100%; font-size:12px;" required>

                <option value="">-- اختر الحساب --</option>

                ${accOptions}

            </select>

        </td>

        <td style="padding:6px 8px;">

            <select class="mt-select mje-cc" style="width:100%; font-size:12px;">

                <option value="">-- اختياري --</option>

                ${ccOptions}

            </select>

        </td>

        <td style="padding:6px 8px;">

            <input type="number" step="0.01" min="0" class="mt-input mje-debit" style="width:100%; font-family:monospace; text-align:left;" value="0" oninput="App.onMjeAmountInput(this, 'debit')" />

        </td>

        <td style="padding:6px 8px;">

            <input type="number" step="0.01" min="0" class="mt-input mje-credit" style="width:100%; font-family:monospace; text-align:left;" value="0" oninput="App.onMjeAmountInput(this, 'credit')" />

        </td>

        <td style="padding:6px 8px;">

            <input type="text" class="mt-input mje-note" style="width:100%; font-size:12px;" placeholder="ملاحظة..." />

        </td>

        <td style="padding:6px 8px; text-align:center;">

            <button type="button" class="mt-btn" style="padding:2px 6px; color:#ef4444;" onclick="App.removeJournalEntryRow(this)">✕</button>

        </td>

    `;

    tbody.appendChild(tr);

};



App.onMjeAmountInput = function(input, type) {

    const row = input.closest('tr');

    if (parseFloat(input.value) > 0) {

        if (type === 'debit') {

            row.querySelector('.mje-credit').value = '0';

        } else {

            row.querySelector('.mje-debit').value = '0';

        }

    }

    this.calcJournalEntryBalance();

};



App.removeJournalEntryRow = function(btn) {

    const tbody = document.getElementById('mje-lines-body');

    if (!tbody) return;

    if (tbody.querySelectorAll('.mje-row').length <= 2) {

        return this.toast('يجب أن يحتوي القيد المحاسبي على سطرين على الأقل (طرف مدين وطرف دائن)', 'warning');

    }

    btn.closest('tr').remove();

    this.calcJournalEntryBalance();

};



App.calcJournalEntryBalance = function() {

    let totalDebit = 0;

    let totalCredit = 0;



    document.querySelectorAll('.mje-row').forEach(row => {

        const d = parseFloat(row.querySelector('.mje-debit')?.value) || 0;

        const c = parseFloat(row.querySelector('.mje-credit')?.value) || 0;

        totalDebit += d;

        totalCredit += c;

    });



    const diff = Math.abs(totalDebit - totalCredit);

    const isBalanced = (totalDebit > 0) && (totalCredit > 0) && (diff < 0.005);



    const card = document.getElementById('mje-balance-card');

    const status = document.getElementById('mje-balance-status');

    const diffEl = document.getElementById('mje-balance-diff');

    const totDebEl = document.getElementById('mje-total-debit');

    const totCredEl = document.getElementById('mje-total-credit');

    const submitBtn = document.getElementById('btn-submit-mje');



    if (totDebEl) totDebEl.innerText = App.formatMoney(totalDebit);

    if (totCredEl) totCredEl.innerText = App.formatMoney(totalCredit);



    if (card && status && diffEl) {

        if (isBalanced) {

            card.style.background = '#f0fdf4';

            card.style.borderColor = '#bbf7d0';

            status.style.color = '#16a34a';

            status.innerHTML = '⚖️ القيد متوازن ومطابق تماماً';

            diffEl.innerText = 'الفارق: 0.00 (جاهز للترحيل الدفتري)';

            if (submitBtn) submitBtn.disabled = false;

        } else {

            card.style.background = '#fef2f2';

            card.style.borderColor = '#fecaca';

            status.style.color = '#dc2626';

            status.innerHTML = '⚠️ القيد غير متوازن بموجب المعادلة المحاسبية';

            diffEl.innerText = `الفارق: ${App.formatMoney(diff)} (المدين يجب أن يساوي الدائن)`;

            if (submitBtn) submitBtn.disabled = true;

        }

    }

};



App.submitNewJournalEntry = async function(e) {

    e.preventDefault();

    const submitBtn = document.getElementById('btn-submit-mje');

    if (submitBtn) submitBtn.disabled = true;



    const lines = [];

    let hasError = false;



    document.querySelectorAll('.mje-row').forEach(row => {

        const account_id = row.querySelector('.mje-acc')?.value;

        const cost_center_id = row.querySelector('.mje-cc')?.value || null;

        const debit = parseFloat(row.querySelector('.mje-debit')?.value) || 0;

        const credit = parseFloat(row.querySelector('.mje-credit')?.value) || 0;

        const note = row.querySelector('.mje-note')?.value.trim() || '';



        if (!account_id) {

            hasError = true;

            return;

        }

        if (debit > 0 || credit > 0) {

            lines.push({ account_id, cost_center_id, debit, credit, note });

        }

    });



    if (hasError || lines.length < 2) {

        if (submitBtn) submitBtn.disabled = false;

        return this.toast('يرجى اختيار الحساب لجميع أسطر القيد (سطرين على الأقل)', 'warning');

    }



    const payload = {

        entry_date: document.getElementById('mje-date').value,

        reference_no: document.getElementById('mje-ref').value.trim(),

        source: 'manual',

        description: document.getElementById('mje-desc').value.trim(),

        lines: lines

    };



    const res = await this.api('create_journal_entry', payload);

    if (submitBtn) submitBtn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل ترحيل القيد المحاسبي', 'danger');

    }



    this.toast(`تم ترحيل القيد المحاسبي المتوازن بنجاح [#JE-${res.entry_id}] ⚖️`, 'success');

    this.closeModal();

    this.renderJournalEntries();

};



// --- 3. TRIAL BALANCE & GENERAL LEDGER (ميزان المراجعة والأستاذ) ---

App.renderTrialBalance = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const today = new Date().toISOString().split('T')[0];
    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '🖨️ طباعة الميزان', variant: 'primary', onclick: 'App.printTrialBalance()', title: 'طباعة ميزان المراجعة' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.loadTrialBalanceData()', title: 'إعادة احتساب الأرصدة' }
    ];

    const toolbarHtml = `
        <div class="mt-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <div class="mt-toolbar-left"></div>
            <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:12px; color:#475569;">حتى تاريخ:</label>
                <input type="date" id="tb-date" class="mt-input" value="${today}" onchange="App.loadTrialBalanceData()" />
            </div>
        </div>
    `;

    const contentHtml = `
        <div id="tb-printable-area">
            <!-- STATUS BADGE / BANNER -->
            <div id="tb-status-banner" style="margin-bottom:15px; padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #bbf7d0;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:26px;">⚖️</span>
                    <div>
                        <h4 style="margin:0; font-size:15px; color:#166534;" id="tb-banner-title">ميزان المراجعة متوازن ومطابق</h4>
                        <div style="font-size:12px; color:#15803d;" id="tb-banner-subtitle">إجمالي أطراف المدين يساوي تماماً إجمالي أطراف الدائن بموجب معايير GAAP / IFRS</div>
                    </div>
                </div>
                <div style="display:flex; gap:20px; font-family:monospace; font-size:14px; text-align:left;">
                    <div>إجمالي المدين: <b id="tb-total-debit" style="color:#0284c7;">0.00</b></div>
                    <div>إجمالي الدائن: <b id="tb-total-credit" style="color:#d97706;">0.00</b></div>
                </div>
            </div>

            ${toolbarHtml}

            <!-- TABLE -->
            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="background:#f8fafc; border-bottom:2px solid var(--border-color); text-align:right;">
                            <th style="padding:10px 14px; width:110px;">رمز الحساب</th>
                            <th style="padding:10px 14px;">اسم الحساب المحاسبي</th>
                            <th style="padding:10px 14px; width:110px;">التصنيف</th>
                            <th style="padding:10px 14px; width:140px; text-align:left;">حركة المدين</th>
                            <th style="padding:10px 14px; width:140px; text-align:left;">حركة الدائن</th>
                            <th style="padding:10px 14px; width:140px; text-align:left;">رصيد نهائي (مدين)</th>
                            <th style="padding:10px 14px; width:140px; text-align:left;">رصيد نهائي (دائن)</th>
                            <th style="padding:10px 14px; width:100px; text-align:center;">دفتر الأستاذ</th>
                        </tr>
                    </thead>
                    <tbody id="tb-table-body">
                        <tr><td colspan="8" style="text-align:center; padding:30px; color:#888;">جاري احتساب ميزان المراجعة من القيود...</td></tr>
                    </tbody>
                    <tfoot id="tb-table-foot">
                        <!-- Totals inserted here -->
                    </tfoot>
                </table>
            </div>
        </div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
        mainView.innerHTML = PB.renderShell({
            id: 'trial_balance',
            archetype: 'ledger',
            eyebrow: 'TRIAL BALANCE / GAAP',
            title: 'ميزان المراجعة العام بالأرصدة والمجاميع',
            subtitle: 'مطابقة الحسابات العامة وميزان المراجعة الدفتري بالأرصدة والحركات',
            icon: '⚖️',
            actions: actions,
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px;">⚖️ ميزان المراجعة العام بالأرصدة والمجاميع (Trial Balance)</span>
                </div>
                <div class="mt-toolbar-right" style="gap:8px;">
                    <label style="font-size:12px; color:#475569;">حتى تاريخ:</label>
                    <input type="date" id="tb-date" class="mt-input" value="${today}" onchange="App.loadTrialBalanceData()" />
                    <button class="mt-btn" onclick="App.printTrialBalance()">🖨️ طباعة الميزان</button>
                    <button class="mt-btn" onclick="App.loadTrialBalanceData()">⟳ تحديث</button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:15px;">
                ${contentHtml}
            </div>
        `;
    }




    await this.loadTrialBalanceData();

};



App.loadTrialBalanceData = async function() {

    const as_of_date = document.getElementById('tb-date')?.value || '';

    const tbody = document.getElementById('tb-table-body');

    const tfoot = document.getElementById('tb-table-foot');

    if (!tbody) return;



    const res = await this.api('get_trial_balance', { as_of_date });

    if (!res || !res.success) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#e74c3c;">فشل تحميل ميزان المراجعة: ${this.escape(res?.error || 'خطأ غير معروف')}</td></tr>`;

        return;

    }



    const rows = res.trial_balance || [];

    const totals = res.totals || { debit: 0, credit: 0, is_balanced: true, diff: 0 };



    const banner = document.getElementById('tb-status-banner');

    const bTitle = document.getElementById('tb-banner-title');

    const bSub = document.getElementById('tb-banner-subtitle');

    const totDeb = document.getElementById('tb-total-debit');

    const totCred = document.getElementById('tb-total-credit');



    if (totDeb) totDeb.innerText = App.formatMoney(totals.debit);

    if (totCred) totCred.innerText = App.formatMoney(totals.credit);



    if (banner && bTitle && bSub) {

        if (totals.is_balanced) {

            banner.style.background = '#f0fdf4';

            banner.style.borderColor = '#bbf7d0';

            bTitle.style.color = '#166534';

            bTitle.innerText = 'ميزان المراجعة متوازن ومطابق تماماً ⚖️';

            bSub.style.color = '#15803d';

            bSub.innerText = 'إجمالي أطراف المدين يساوي تماماً إجمالي أطراف الدائن (الفارق: 0.00)';

        } else {

            banner.style.background = '#fef2f2';

            banner.style.borderColor = '#fecaca';

            bTitle.style.color = '#991b1b';

            bTitle.innerText = '⚠️ ميزان المراجعة غير متوازن!';

            bSub.style.color = '#b91c1c';

            bSub.innerText = `يوجد فارق غير مطابق بمقدار: ${App.formatMoney(totals.diff)}`;

        }

    }



    if (rows.length === 0) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">لا توجد حركات محاسبية مسجلة حتى تاريخه</td></tr>`;

        return;

    }



    let html = '';

    let totalDebitMove = 0;

    let totalCreditMove = 0;



    rows.forEach(r => {

        const isLeaf = r.is_leaf == 1;

        const code = r.code || r.account_code || '';

        const name = r.name || r.name_ar || r.account_name || '';

        totalDebitMove += (parseFloat(r.total_debit) || 0);

        totalCreditMove += (parseFloat(r.total_credit) || 0);



        html += `

            <tr style="border-bottom:1px solid #edf2f7; ${!isLeaf ? 'background:#fafbfc; font-weight:600;' : ''}">

                <td style="padding:10px 14px; font-family:monospace; font-weight:700;">

                    <span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; border:1px solid #cbd5e1;">${this.escape(code)}</span>

                </td>

                <td style="padding:10px 14px; padding-right:${14 + (r.level - 1) * 18}px;">

                    ${isLeaf ? '📄' : '📁'} ${this.escape(name)}

                </td>

                <td style="padding:10px 14px; color:#64748b; font-size:12px;">${r.account_type}</td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; color:#0284c7;">

                    ${parseFloat(r.total_debit) > 0 ? App.formatMoney(r.total_debit) : '-'}

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; color:#d97706;">

                    ${parseFloat(r.total_credit) > 0 ? App.formatMoney(r.total_credit) : '-'}

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:700; color:#0284c7;">

                    ${parseFloat(r.ending_debit) > 0 ? App.formatMoney(r.ending_debit) : '-'}

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:700; color:#d97706;">

                    ${parseFloat(r.ending_credit) > 0 ? App.formatMoney(r.ending_credit) : '-'}

                </td>

                <td style="padding:10px 14px; text-align:center;">

                    <button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick="App.viewGeneralLedger(${r.id}, '${this.escape(r.name)}', '${this.escape(r.code)}')">

                        📖 كشف

                    </button>

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;



    if (tfoot) {

        tfoot.innerHTML = `

            <tr style="background:#f8fafc; border-top:2px solid #94a3b8; font-weight:700;">

                <td colspan="3" style="padding:12px 14px; text-align:left;">المجموع العام لميزان المراجعة:</td>

                <td style="padding:12px 14px; text-align:left; font-family:monospace; color:#0284c7; font-size:14px;">${App.formatMoney(totalDebitMove)}</td>

                <td style="padding:12px 14px; text-align:left; font-family:monospace; color:#d97706; font-size:14px;">${App.formatMoney(totalCreditMove)}</td>

                <td style="padding:12px 14px; text-align:left; font-family:monospace; color:#0284c7; font-size:14px;">${App.formatMoney(totals.debit)}</td>

                <td style="padding:12px 14px; text-align:left; font-family:monospace; color:#d97706; font-size:14px;">${App.formatMoney(totals.credit)}</td>

                <td style="padding:12px 14px; text-align:center; color:#16a34a;">${totals.is_balanced ? '⚖️ متطابق' : '❌ غير متطابق'}</td>

            </tr>

        `;

    }

};



App.printTrialBalance = function() {

    window.print();

};



// --- VIEW GENERAL LEDGER (دفتر الأستاذ العام) ---

App.viewGeneralLedger = async function(accountId, accountName, accountCode) {

    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <div style="display:flex; align-items:center; gap:8px;">

                <span style="font-weight:700; font-size:15px;">📖 دفتر الأستاذ العام (General Ledger):</span>

                <span style="font-family:monospace; background:#f1f5f9; padding:2px 8px; border-radius:4px; font-weight:700;">[${this.escape(accountCode)}] ${this.escape(accountName)}</span>

            </div>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <div class="mt-modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; background:#f8fafc; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">

                <div style="display:flex; gap:10px; align-items:center;">

                    <label style="font-size:12px; color:#475569;">من:</label>

                    <input type="date" id="gl-date-start" class="mt-input" style="font-size:12px;" />

                    <label style="font-size:12px; color:#475569;">إلى:</label>

                    <input type="date" id="gl-date-end" class="mt-input" style="font-size:12px;" />

                    <button class="mt-btn" onclick="App.fetchGlLines(${accountId})">⟳ تطبيق الفترة</button>

                </div>

                <div style="font-family:monospace; font-size:13px;">

                    الرصيد الافتتاحي: <b id="gl-opening-val" style="color:#0284c7;">0.00</b>

                </div>

            </div>



            <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">

                <thead>

                    <tr style="background:#f1f5f9; text-align:right;">

                        <th style="padding:8px 10px; width:95px;">التاريخ</th>

                        <th style="padding:8px 10px; width:110px;">رقم القيد</th>

                        <th style="padding:8px 10px;">البيان والشرح المحاسبي</th>

                        <th style="padding:8px 10px; width:120px; text-align:left;">مدين</th>

                        <th style="padding:8px 10px; width:120px; text-align:left;">دائن</th>

                        <th style="padding:8px 10px; width:140px; text-align:left;">الرصيد التراكمي</th>

                    </tr>

                </thead>

                <tbody id="gl-lines-body">

                    <tr><td colspan="6" style="text-align:center; padding:25px; color:#888;">جاري جلب حركات الحساب...</td></tr>

                </tbody>

            </table>



            <div style="background:#f8fafc; padding:12px 16px; border-radius:6px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <span style="font-weight:700; color:#1e293b;">الرصيد الختامي بعد جميع الحركات:</span>

                <span id="gl-closing-val" style="font-family:monospace; font-size:16px; font-weight:700; color:#16a34a;">0.00</span>

            </div>

        </div>

        <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">

            <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>

        </div>

    `;



    this.openModal(modalHtml, '800px');

    await this.fetchGlLines(accountId);

};



App.fetchGlLines = async function(accountId) {

    const start_date = document.getElementById('gl-date-start')?.value || '';

    const end_date = document.getElementById('gl-date-end')?.value || '';

    const tbody = document.getElementById('gl-lines-body');

    if (!tbody) return;



    const res = await this.api('get_general_ledger', { account_id: accountId, start_date, end_date });

    if (!res || !res.success) {

        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#e74c3c;">فشل تحميل كشف الحساب: ${this.escape(res?.error || 'خطأ غير معروف')}</td></tr>`;

        return;

    }



    const opEl = document.getElementById('gl-opening-val');

    if (opEl) opEl.innerText = App.formatMoney(res.opening_balance || 0);



    const clEl = document.getElementById('gl-closing-val');

    if (clEl) clEl.innerText = App.formatMoney(res.closing_balance || 0);



    const lines = res.lines || [];

    if (lines.length === 0) {

        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:#94a3b8;">لا توجد حركات مسجلة على هذا الحساب خلال الفترة المحددة</td></tr>`;

        return;

    }



    let html = '';

    lines.forEach(l => {

        html += `

            <tr style="border-bottom:1px solid #f1f5f9;">

                <td style="padding:8px 10px; color:#475569;">${l.entry_date}</td>

                <td style="padding:8px 10px; font-family:monospace; font-weight:700; color:#1e293b;">${this.escape(l.entry_no)}</td>

                <td style="padding:8px 10px; font-weight:600;">${this.escape(l.description || l.line_note || '-')}</td>

                <td style="padding:8px 10px; text-align:left; font-family:monospace; color:#0284c7;">

                    ${parseFloat(l.debit) > 0 ? App.formatMoney(l.debit) : '-'}

                </td>

                <td style="padding:8px 10px; text-align:left; font-family:monospace; color:#d97706;">

                    ${parseFloat(l.credit) > 0 ? App.formatMoney(l.credit) : '-'}

                </td>

                <td style="padding:8px 10px; text-align:left; font-family:monospace; font-weight:700; color:#10b981;">

                    ${App.formatMoney(l.running_balance)}

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

};



// --- 4. COST CENTERS (مراكز التكلفة والربحية وإدارتها) ---

App.renderCostCenters = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '➕ إضافة مركز تكلفة جديد', variant: 'success', onclick: 'App.openCostCenterModal()', title: 'إضافة مركز تكلفة أو موقع جديد' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.loadCostCentersData()' }
    ];

    const toolbarHtml = `
        <div class="mt-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="status-badge" style="background:#f0f9ff; color:#0369a1;">ربط الراوترات، الأبراج، الفروع والمشاريع</span>
            </div>
            <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <input type="text" id="cc-search-input" class="mt-input" style="width:160px; font-size:12px;" placeholder="🔍 بحث بالاسم أو الرمز..." oninput="App.filterCostCentersGrid()" />
                <select id="cc-type-filter" class="mt-select" style="font-size:12px;" onchange="App.filterCostCentersGrid()">
                    <option value="">كل الأنواع</option>
                    <option value="general">عام (General)</option>
                    <option value="branch">فروع ومكاتب (Branches)</option>
                    <option value="tower_node">أبراج ومواقع شبكة (Towers)</option>
                    <option value="project">مشاريع وتوسعات (Projects)</option>
                    <option value="router">راوترات MikroTik</option>
                </select>
                <input type="date" id="cc-date-start" class="mt-input" onchange="App.loadCostCentersData()" title="من تاريخ" />
                <input type="date" id="cc-date-end" class="mt-input" onchange="App.loadCostCentersData()" title="إلى تاريخ" />
            </div>
        </div>
    `;

    const contentHtml = `
        <!-- KPI CARDS -->
        <div class="kpi-grid" style="padding:0; margin-bottom:15px;">
            <div class="kpi-card" style="border-right:4px solid #0284c7;">
                <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">🎯</div>
                <div>
                    <div class="kpi-val" id="kpi-cc-count">0</div>
                    <div class="kpi-lbl">مراكز التكلفة المطابقة</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #16a34a;">
                <div class="kpi-icon" style="background:#f0fdf4; color:#16a34a;">📈</div>
                <div>
                    <div class="kpi-val" id="kpi-cc-rev" style="color:#16a34a;">0.00</div>
                    <div class="kpi-lbl">إيرادات المراكز المحققة</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #dc2626;">
                <div class="kpi-icon" style="background:#fef2f2; color:#dc2626;">📉</div>
                <div>
                    <div class="kpi-val" id="kpi-cc-exp" style="color:#dc2626;">0.00</div>
                    <div class="kpi-lbl">مصروفات المراكز المباشرة</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #7c3aed;">
                <div class="kpi-icon" style="background:#f5f3ff; color:#7c3aed;">💰</div>
                <div>
                    <div class="kpi-val" id="kpi-cc-margin" style="color:#7c3aed;">0.00</div>
                    <div class="kpi-lbl">صافي هامش ربحية المراكز</div>
                </div>
            </div>
        </div>

        ${toolbarHtml}

        <!-- CARDS GRID -->
        <div id="cc-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">
            <div style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">جاري جلب مراكز التكلفة وتحليل الربحية...</div>
        </div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
        mainView.innerHTML = PB.renderShell({
            id: 'cost_centers',
            archetype: 'ledger',
            eyebrow: 'COST CENTERS / ALLOCATION',
            title: 'مراكز التكلفة والمواقع والمشاريع',
            subtitle: 'تتبع إيرادات ومصروفات المواقع، الأبراج، الراوترات، ومشاريع التوسعة',
            icon: '🎯',
            actions: actions,
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <div class="mt-toolbar" style="flex-wrap:wrap; gap:8px;">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <button class="mt-btn mt-btn-primary" style="background:#16a34a; border-color:#15803d; font-weight:bold;" onclick="App.openCostCenterModal()">➕ إضافة مركز تكلفة جديد</button>
                    <span style="font-weight:700; font-size:15px;">🎯 مراكز التكلفة والمواقع والمشاريع (Cost Centers)</span>
                    <span class="status-badge" style="background:#f0f9ff; color:#0369a1;">ربط الراوترات، الأبراج، الفروع والمشاريع</span>
                </div>
                <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <input type="text" id="cc-search-input" class="mt-input" style="width:160px; font-size:12px;" placeholder="🔍 بحث بالاسم أو الرمز..." oninput="App.filterCostCentersGrid()" />
                    <select id="cc-type-filter" class="mt-select" style="font-size:12px;" onchange="App.filterCostCentersGrid()">
                        <option value="">كل الأنواع</option>
                        <option value="general">عام (General)</option>
                        <option value="branch">فروع ومكاتب (Branches)</option>
                        <option value="tower_node">أبراج ومواقع شبكة (Towers)</option>
                        <option value="project">مشاريع وتوسعات (Projects)</option>
                        <option value="router">راوترات MikroTik</option>
                    </select>
                    <input type="date" id="cc-date-start" class="mt-input" onchange="App.loadCostCentersData()" title="من تاريخ" />
                    <input type="date" id="cc-date-end" class="mt-input" onchange="App.loadCostCentersData()" title="إلى تاريخ" />
                    <button class="mt-btn" onclick="App.loadCostCentersData()">⟳ تحديث</button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:15px;">
                ${contentHtml}
            </div>
        `;
    }




    await this.loadCostCentersData();

};



App.loadCostCentersData = async function() {

    const start_date = document.getElementById('cc-date-start')?.value || '';

    const end_date = document.getElementById('cc-date-end')?.value || '';

    const grid = document.getElementById('cc-cards-grid');

    if (!grid) return;



    const res = await this.api('get_cost_centers_report', { start_date, end_date });

    if (!res || !res.success) {

        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:#e74c3c;">فشل تحميل مراكز التكلفة: ${this.escape(res?.error || 'خطأ غير معروف')}</div>`;

        return;

    }



    this._costCenters = res.cost_centers || [];

    this.filterCostCentersGrid();

};



App.filterCostCentersGrid = function() {

    const grid = document.getElementById('cc-cards-grid');

    if (!grid) return;



    const typeFilter = document.getElementById('cc-type-filter')?.value || '';

    const search = (document.getElementById('cc-search-input')?.value || '').trim().toLowerCase();



    const centers = (this._costCenters || []).filter(c => {

        if (typeFilter && c.type !== typeFilter) return false;

        if (search) {

            const code = String(c.code || '').toLowerCase();

            const name = String(c.name || '').toLowerCase();

            if (!code.includes(search) && !name.includes(search)) return false;

        }

        return true;

    });



    let totRev = 0, totExp = 0, totMargin = 0;

    centers.forEach(c => {

        totRev += (parseFloat(c.total_revenue) || 0);

        totExp += (parseFloat(c.total_expense) || 0);

        totMargin += (parseFloat(c.net_margin) || 0);

    });



    const elCount = document.getElementById('kpi-cc-count');

    if (elCount) elCount.innerText = centers.length;

    const elRev = document.getElementById('kpi-cc-rev');

    if (elRev) elRev.innerText = App.formatMoney(totRev);

    const elExp = document.getElementById('kpi-cc-exp');

    if (elExp) elExp.innerText = App.formatMoney(totExp);

    const elMargin = document.getElementById('kpi-cc-margin');

    if (elMargin) elMargin.innerText = App.formatMoney(totMargin);



    if (centers.length === 0) {

        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:35px; color:#94a3b8; background:var(--bg-window); border:1px dashed var(--border-color); border-radius:8px;">لا توجد مراكز تكلفة مطابقة للفلتر المحدد</div>`;

        return;

    }



    const typeIcons = {

        router: '📡 روتر MikroTik',

        tower_node: '🗼 موقع / برج شبكة',

        branch: '🏢 فرع / مكتب مبيعات',

        project: '🚀 مشروع / قسم',

        general: '🎯 مركز عام'

    };



    let html = '';

    centers.forEach(c => {

        const rev = parseFloat(c.total_revenue) || 0;

        const exp = parseFloat(c.total_expense) || 0;

        const margin = parseFloat(c.net_margin) || 0;

        const marginPct = parseFloat(c.margin_percentage) || 0;

        const isProfitable = margin >= 0;

        const cJson = JSON.stringify({ id: c.id, code: c.code, name: c.name, type: c.type }).replace(/"/g, '&quot;');



        html += `

            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between;">

                <div>

                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">

                        <div style="flex:1;">

                            <span style="font-family:monospace; font-weight:700; background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:12px; border:1px solid #cbd5e1;">${this.escape(c.code)}</span>

                            <h3 style="margin:6px 0 2px 0; font-size:15px; color:#0f172a; word-break:break-word;">${this.escape(c.name)}</h3>

                            <div style="font-size:12px; color:#64748b;">${typeIcons[c.type] || c.type} ${c.target_name ? `• ${this.escape(c.target_name)}` : ''}</div>

                        </div>

                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; margin-right:8px;">

                            <span style="background:${isProfitable ? '#f0fdf4' : '#fef2f2'}; color:${isProfitable ? '#16a34a' : '#dc2626'}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">

                                ${isProfitable ? 'مربح ✅' : 'عجز ⚠️'}

                            </span>

                            <div style="display:inline-flex; gap:4px;">

                                <button class="mt-btn" style="padding:2px 7px; font-size:11px;" title="تعديل مركز التكلفة" onclick="App.openCostCenterModal(${cJson})">✏️</button>

                                <button class="mt-btn mt-btn-danger" style="padding:2px 7px; font-size:11px;" title="حذف أو تعطيل مركز التكلفة" onclick="App.deleteCostCenter(${c.id}, '${this.escape(c.name)}')">🗑️</button>

                            </div>

                        </div>

                    </div>



                    <div style="background:#f8fafc; border-radius:6px; padding:10px; margin-bottom:12px; border:1px solid #f1f5f9;">

                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">

                            <span style="color:#64748b;">الإيرادات المحققة:</span>

                            <b style="color:#16a34a; font-family:monospace;">${App.formatMoney(rev)}</b>

                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">

                            <span style="color:#64748b;">المصروفات المباشرة:</span>

                            <b style="color:#dc2626; font-family:monospace;">${App.formatMoney(exp)}</b>

                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; border-top:1px dashed #cbd5e1; padding-top:4px;">

                            <span>صافي الربح التشغيلي:</span>

                            <span style="color:${isProfitable ? '#16a34a' : '#dc2626'}; font-family:monospace;">${App.formatMoney(margin)}</span>

                        </div>

                    </div>

                </div>



                <div>

                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-bottom:4px;">

                        <span>نسبة هامش الربحية:</span>

                        <b style="color:${isProfitable ? '#16a34a' : '#dc2626'};">${marginPct.toFixed(1)}%</b>

                    </div>

                    <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">

                        <div style="width:${Math.max(0, Math.min(100, marginPct))}%; height:100%; background:${isProfitable ? '#16a34a' : '#dc2626'};"></div>

                    </div>

                </div>

            </div>

        `;

    });



    grid.innerHTML = html;

};



// --- COST CENTER MODAL & ACTIONS ---

App.openCostCenterModal = function(center = null) {

    const isEdit = !!center;

    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">

                ${isEdit ? '✏️ تعديل بيانات مركز التكلفة' : '➕ إضافة مركز تكلفة جديد'}

            </span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitCostCenter(event, ${center ? center.id : 'null'})">

            <div class="mt-modal-body" style="padding:20px;">

                <div style="margin-bottom:14px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">اسم مركز التكلفة *</label>

                    <input type="text" id="cc-input-name" class="mt-input" style="width:100%;" value="${center ? this.escape(center.name) : ''}" placeholder="مثال: برج المحطة / فرع السوق / مشروع التوسعة" required />

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">رمز المركز (Code - اختياري)</label>

                        <input type="text" id="cc-input-code" class="mt-input" style="width:100%; font-family:monospace;" value="${center ? this.escape(center.code) : ''}" placeholder="اتركه فارغاً للتوليد التلقائي" />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:5px; display:block;">نوع مركز التكلفة *</label>

                        <select id="cc-input-type" class="mt-select" style="width:100%;" required>

                            <option value="general" ${center?.type === 'general' ? 'selected' : ''}>🎯 عام (General)</option>

                            <option value="branch" ${center?.type === 'branch' ? 'selected' : ''}>🏢 فرع / مكتب مبيعات</option>

                            <option value="tower_node" ${center?.type === 'tower_node' ? 'selected' : ''}>🗼 موقع / برج شبكة</option>

                            <option value="project" ${center?.type === 'project' ? 'selected' : ''}>🚀 مشروع / توسعة</option>

                            <option value="router" ${center?.type === 'router' ? 'selected' : ''}>📡 راوتر MikroTik</option>

                        </select>

                    </div>

                </div>



                <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px; font-size:12px; color:#0369a1; line-height:1.6;">

                    💡 <b>فائدة مركز التكلفة:</b> يتيح لك تتبع ربحية ومصروفات كل برج، راوتر، أو فرع على حدة، ومعرفة أي المواقع تحقق أرباحاً وأيها تسبب عجزاً وخسائر تشغيلية.

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-save-cc">

                    ${isEdit ? '💾 حفظ التعديلات' : '➕ إضافة المركز'}

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '560px');

};



App.submitCostCenter = async function(e, centerId = null) {

    e.preventDefault();

    const btn = document.getElementById('btn-save-cc');

    if (btn) btn.disabled = true;



    const data = {

        id: centerId,

        name: document.getElementById('cc-input-name').value.trim(),

        code: document.getElementById('cc-input-code').value.trim(),

        center_type: document.getElementById('cc-input-type').value

    };



    const res = await this.api('save_cost_center', data, 'POST');

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حفظ مركز التكلفة', 'danger');

    }



    this.toast(res.message || 'تم حفظ مركز التكلفة بنجاح 🎯', 'success');

    this.closeModal();

    this.loadCostCentersData();

};



App.deleteCostCenter = async function(id, name) {

    if (!confirm(`هل أنت متأكد من رغبتك في حذف أو تعطيل مركز التكلفة (${name})؟`)) return;



    this.toast('جاري معالجة حذف مركز التكلفة...', 'info');

    const res = await this.api('delete_cost_center', { id });



    if (res && res.success) {

        this.toast(res.message || 'تمت العملية بنجاح', res.action === 'deactivated' ? 'warning' : 'success');

        this.loadCostCentersData();

    } else {

        this.toast(res?.error || 'فشل حذف مركز التكلفة', 'danger');

    }

};



// --- 5. PARTNERS EQUITY & PROFIT SHARING (الشركاء وتوزيع الأرباح) ---

App.renderPartnersEquity = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '➕ إضافة شريك جديد', variant: 'primary', onclick: 'App.openAddPartnerModal()', title: 'إضافة شريك ومساهم جديد' },
        { label: '💰 توزيع أرباح دورية', variant: 'success', onclick: 'App.openDistributeProfitsModal()', title: 'توزيع أرباح دورية جديدة' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderPartnersEquity()' }
    ];

    const contentHtml = `
        <!-- KPI CARDS -->
        <div class="kpi-grid" style="padding:0; margin-bottom:15px;">
            <div class="kpi-card" style="border-right:4px solid #2563eb;">
                <div class="kpi-icon" style="background:#eff6ff; color:#2563eb;">🏛️</div>
                <div>
                    <div class="kpi-val" id="kpi-part-total-cap">0.00</div>
                    <div class="kpi-lbl">إجمالي رأس المال المسجل</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #7c3aed;">
                <div class="kpi-icon" style="background:#f5f3ff; color:#7c3aed;">👥</div>
                <div>
                    <div class="kpi-val" id="kpi-part-count">0</div>
                    <div class="kpi-lbl">عدد الشركاء المعتمدين</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #16a34a;">
                <div class="kpi-icon" style="background:#f0fdf4; color:#16a34a;">🎁</div>
                <div>
                    <div class="kpi-val" id="kpi-part-tot-profits">0.00</div>
                    <div class="kpi-lbl">إجمالي الأرباح الموزعة</div>
                </div>
            </div>
            <div class="kpi-card" style="border-right:4px solid #ea580c;">
                <div class="kpi-icon" style="background:#fff7ed; color:#ea580c;">💳</div>
                <div>
                    <div class="kpi-val" id="kpi-part-tot-current">0.00</div>
                    <div class="kpi-lbl">أرصدة الحسابات الجارية للشركاء</div>
                </div>
            </div>
        </div>

        <!-- PARTNER CARDS -->
        <div id="partners-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:16px;">
            <div style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">جاري جلب سجلات الشركاء وتوزيع الأرباح...</div>
        </div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
        mainView.innerHTML = PB.renderShell({
            id: 'partners_equity',
            archetype: 'ledger',
            eyebrow: 'PARTNERS EQUITY / CAPITAL',
            title: 'حقوق الشركاء ورأس المال وتوزيع الأرباح',
            subtitle: 'إدارة مساهمات الشركاء، الأرباح الدورية، ومتابعة الحسابات الجارية',
            icon: '👥',
            actions: actions,
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px;">👥 حقوق الشركاء ورأس المال وتوزيع الأرباح (Partners Equity)</span>
                    <span class="status-badge" style="background:#f5f3ff; color:#7c3aed; margin-right:10px;">إدارة الشراكة والمحاسبة الدورية 🤝</span>
                </div>
                <div class="mt-toolbar-right" style="gap:8px;">
                    <button class="mt-btn mt-btn-primary" style="background:#2563eb; border-color:#1d4ed8;" onclick="App.openAddPartnerModal()">➕ إضافة شريك جديد</button>
                    <button class="mt-btn mt-btn-primary" style="background:#16a34a; border-color:#15803d;" onclick="App.openDistributeProfitsModal()">💰 توزيع أرباح دورية جديدة</button>
                    <button class="mt-btn" onclick="App.renderPartnersEquity()">⟳ تحديث</button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:15px;">
                ${contentHtml}
            </div>
        `;
    }




    const res = await this.api('get_partners_equity');

    if (!res || !res.success) {

        const grid = document.getElementById('partners-cards-grid');

        if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:#e74c3c;">فشل تحميل بيانات الشركاء: ${this.escape(res?.error || 'خطأ غير معروف')}</div>`;

        return;

    }



    this._partnersData = res.partners || [];

    const totalCapital = parseFloat(res.total_capital) || 0;



    let totProfits = 0, totCurrent = 0;

    this._partnersData.forEach(p => {

        totProfits += (parseFloat(p.total_profits_received) || 0);

        totCurrent += (parseFloat(p.current_account_balance) || 0);

    });



    const elCap = document.getElementById('kpi-part-total-cap');

    if (elCap) elCap.innerText = App.formatMoney(totalCapital);

    const elCount = document.getElementById('kpi-part-count');

    if (elCount) elCount.innerText = this._partnersData.length;

    const elProf = document.getElementById('kpi-part-tot-profits');

    if (elProf) elProf.innerText = App.formatMoney(totProfits);

    const elCurr = document.getElementById('kpi-part-tot-current');

    if (elCurr) elCurr.innerText = App.formatMoney(totCurrent);



    const grid = document.getElementById('partners-cards-grid');

    if (!grid) return;



    if (this._partnersData.length === 0) {

        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#94a3b8;">لا توجد سجلات شركاء مسجلة</div>`;

        return;

    }



    let html = '';

    this._partnersData.forEach(p => {

        const cap = parseFloat(p.capital_share) || 0;

        const sharePct = parseFloat(p.share_percentage) || 0;

        const curBal = parseFloat(p.current_account_balance) || 0;

        const pRec = parseFloat(p.total_profits_received) || 0;

        const draw = parseFloat(p.total_drawings) || 0;



        html += `

            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between;">

                <div>

                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">

                        <div style="display:flex; align-items:center; gap:10px;">

                            <div style="width:42px; height:42px; border-radius:50%; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:20px;">

                                👤

                            </div>

                            <div>

                                <h3 style="margin:0; font-size:15px; color:#0f172a;">${this.escape(p.partner_name)}</h3>

                                <div style="font-size:12px; color:#64748b;">${this.escape(p.phone || p.email || 'شريك معتمد')}</div>

                            </div>

                        </div>

                        <span style="background:#eff6ff; color:#2563eb; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:700; font-family:monospace;">

                            ${sharePct.toFixed(1)}% الحصة

                        </span>

                    </div>



                    <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-bottom:14px; border:1px solid #e2e8f0;">

                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">

                            <span style="color:#64748b;">رأس المال الثابت:</span>

                            <b style="font-family:monospace;">${App.formatMoney(cap)}</b>

                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">

                            <span style="color:#64748b;">رقم الحساب الجاري:</span>

                            <span style="font-family:monospace; background:#e0e7ff; color:#3730a3; padding:1px 6px; border-radius:4px; font-weight:700;">[${this.escape(p.current_account_code || '-')}]</span>

                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; border-top:1px dashed #cbd5e1; padding-top:6px;">

                            <span>الرصيد الجاري الحالي (المستحق):</span>

                            <span style="color:#16a34a; font-family:monospace;">${App.formatMoney(curBal)}</span>

                        </div>

                    </div>



                    <div style="display:flex; gap:10px; font-size:11px; color:#64748b; margin-bottom:14px;">

                        <div style="flex:1; background:#f0fdf4; padding:6px 8px; border-radius:4px; border:1px solid #bbf7d0;">

                            <div>الأرباح المستلمة:</div>

                            <b style="color:#16a34a; font-family:monospace;">${App.formatMoney(pRec)}</b>

                        </div>

                        <div style="flex:1; background:#fff7ed; padding:6px 8px; border-radius:4px; border:1px solid #fed7aa;">

                            <div>المسحوبات السابقة:</div>

                            <b style="color:#ea580c; font-family:monospace;">${App.formatMoney(draw)}</b>

                        </div>

                    </div>

                </div>



                <div>

                    <button class="mt-btn" style="width:100%; font-size:12px; margin-bottom:8px;" onclick="App.viewGeneralLedger(${p.current_account_id}, 'جاري الشريك - ${this.escape(p.partner_name)}', '${this.escape(p.current_account_code)}')">

                        📑 كشف الحساب الجاري في الأستاذ

                    </button>

                    <div style="display:flex; gap:6px;">

                        <button class="mt-btn" style="flex:1; font-size:11px; background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;" onclick="App.openDepositPartnerCapitalModal(${p.id}, '${this.escape(p.partner_name)}')">

                            💵 إيداع رأس مال

                        </button>

                        <button class="mt-btn" style="flex:1; font-size:11px;" onclick="App.openAddPartnerModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">

                            ✏️ تعديل

                        </button>

                        <button class="mt-btn" style="flex:1; font-size:11px; color:#dc2626; border-color:#fecaca;" onclick="App.deletePartner(${p.id}, '${this.escape(p.partner_name)}')">

                            🗑️ حذف

                        </button>

                    </div>

                </div>

            </div>

        `;

    });



    grid.innerHTML = html;

};



// --- DISTRIBUTE PROFITS MODAL ---

App.openDistributeProfitsModal = async function() {

    const today = new Date().toISOString().split('T')[0];

    const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">💰 توزيع الأرباح الدورية للشركاء وترحيل القيد المحاسبي المزدوج</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitDistributeProfits(event)">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:2;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">مسمى الفترة الدورية *</label>

                        <input type="text" id="dp-period-name" class="mt-input" style="width:100%;" placeholder="مثال: أرباح الربع الأول 2026 / أرباح شهر سبتمبر" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">من تاريخ:</label>

                        <input type="date" id="dp-start-date" class="mt-input" style="width:100%;" value="${firstDayMonth}" onchange="App.fetchPnlForDistribution()" />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">إلى تاريخ:</label>

                        <input type="date" id="dp-end-date" class="mt-input" style="width:100%;" value="${today}" onchange="App.fetchPnlForDistribution()" />

                    </div>

                </div>



                <!-- AUTO CALCULATED NET PROFIT CARD -->

                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">

                    <div>

                        <div style="font-size:12px; color:#1e40af;">صافي الربح التشغيلي المحسوب تلقائياً من قائمة الدخل (P&L):</div>

                        <div style="font-size:18px; font-weight:700; color:#1d4ed8; font-family:monospace;" id="dp-calc-profit">جاري الحساب...</div>

                    </div>

                    <button type="button" class="mt-btn" style="font-size:11px;" onclick="App.fetchPnlForDistribution()">⟳ إعادة الحساب</button>

                </div>



                <div class="form-group" style="margin-bottom:16px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">مبلغ الأرباح المراد توزيعه فعلياً (YER) *</label>

                    <input type="number" step="0.01" min="1" id="dp-total-profit" class="mt-input" style="width:100%; font-family:monospace; font-size:15px; font-weight:700;" oninput="App.recalcPartnersProfitShares()" required />

                    <small style="color:#64748b;">يمكنك اعتماد كامل صافي الربح أو تخصيص جزء منه للأرباح المحتجزة / المبقاة.</small>

                </div>



                <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e293b;">جدول حصص الشركاء من التوزيع (معاينة):</div>

                <div style="border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin-bottom:14px;">

                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">

                        <thead>

                            <tr style="background:#f1f5f9; text-align:right;">

                                <th style="padding:8px 10px;">الشريك</th>

                                <th style="padding:8px 10px; width:100px;">نسبة الحصة</th>

                                <th style="padding:8px 10px; width:120px;">الحساب الجاري</th>

                                <th style="padding:8px 10px; width:160px; text-align:left;">حصة الأرباح المحولة</th>

                            </tr>

                        </thead>

                        <tbody id="dp-shares-body">

                            <!-- Populated via JS -->

                        </tbody>

                    </table>

                </div>



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ملاحظات وقرار الجمعية العمومية / الشركاء:</label>

                    <textarea id="dp-notes" class="mt-input" style="width:100%; height:55px; resize:none;" placeholder="ملاحظات وتفاصيل التوزيع..."></textarea>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-submit-distribute" style="background:#16a34a; border-color:#15803d;">

                    ⚖️ ترحيل توزيع الأرباح للقيد المزدوج

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '720px');

    await this.fetchPnlForDistribution();

};



App.fetchPnlForDistribution = async function() {

    const start_date = document.getElementById('dp-start-date')?.value || '';

    const end_date = document.getElementById('dp-end-date')?.value || '';

    const calcEl = document.getElementById('dp-calc-profit');

    if (calcEl) calcEl.innerText = 'جاري احتساب قائمة الدخل...';



    const res = await this.api('get_comprehensive_financial_statements', { period: 'custom', start_date, end_date });

    const netOperating = parseFloat(res?.income_statement?.net_operating_income) || 0;



    if (calcEl) calcEl.innerText = App.formatMoney(netOperating);

    const totInput = document.getElementById('dp-total-profit');

    if (totInput && (!totInput.value || totInput.value == 0)) {

        totInput.value = Math.max(0, netOperating);

    }

    this.recalcPartnersProfitShares();

};



App.recalcPartnersProfitShares = function() {

    const totProfit = parseFloat(document.getElementById('dp-total-profit')?.value) || 0;

    const tbody = document.getElementById('dp-shares-body');

    if (!tbody) return;



    let html = '';

    (this._partnersData || []).forEach(p => {

        const sharePct = parseFloat(p.share_percentage) || 0;

        const partnerAmt = (totProfit * sharePct) / 100;

        html += `

            <tr style="border-bottom:1px solid #f1f5f9;">

                <td style="padding:8px 10px; font-weight:600;">${this.escape(p.partner_name)}</td>

                <td style="padding:8px 10px; font-family:monospace; color:#2563eb; font-weight:700;">${sharePct.toFixed(1)}%</td>

                <td style="padding:8px 10px; font-family:monospace;">[${this.escape(p.current_account_code || '-')}]</td>

                <td style="padding:8px 10px; text-align:left; font-family:monospace; font-weight:700; color:#16a34a;">

                    ${App.formatMoney(partnerAmt)}

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

};



App.submitDistributeProfits = async function(e) {

    e.preventDefault();

    const btn = document.getElementById('btn-submit-distribute');

    if (btn) btn.disabled = true;



    const payload = {

        period_name: document.getElementById('dp-period-name').value.trim(),

        start_date: document.getElementById('dp-start-date').value,

        end_date: document.getElementById('dp-end-date').value,

        total_net_profit: parseFloat(document.getElementById('dp-total-profit').value) || 0,

        notes: document.getElementById('dp-notes').value.trim()

    };



    const res = await this.api('distribute_profits', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل ترحيل توزيع الأرباح', 'danger');

    }



    this.toast(`تم ترحيل توزيع الأرباح بنجاح وتوليد القيد المزدوج [#JE-${res.journal_entry_id}] ⚖️🎉`, 'success');

    this.closeModal();

    this.renderPartnersEquity();

};



// --- 6. UPGRADED FINANCIAL REPORTS & STATEMENTS (القوائم المالية الشاملة) ---

App.renderFinancialReports = async function(activeTab = 'pnl') {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const periodSel = document.getElementById('rep-filter-period')?.value || 'month';
    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '🖨️ طباعة القائمة', variant: 'secondary', onclick: 'window.print()', title: 'طباعة التقرير المالي' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: `App.renderFinancialReports('${activeTab}')` }
    ];

    const toolbarHtml = `
        <div class="mt-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px;">
                <div style="display:inline-flex; background:#e2e8f0; border-radius:6px; padding:2px;">
                    <button class="mt-btn" style="border:none; ${activeTab === 'pnl' ? 'background:#fff; font-weight:700; color:#0f172a;' : 'background:transparent; color:#64748b;'}" onclick="App.renderFinancialReports('pnl')">
                        📊 قائمة الدخل (P&L)
                    </button>
                    <button class="mt-btn" style="border:none; ${activeTab === 'balance_sheet' ? 'background:#fff; font-weight:700; color:#0f172a;' : 'background:transparent; color:#64748b;'}" onclick="App.renderFinancialReports('balance_sheet')">
                        🏛️ الميزانية العمومية (Balance Sheet)
                    </button>
                </div>
            </div>
            <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:8px;">
                <select id="rep-filter-period" class="mt-select" onchange="App.renderFinancialReports('${activeTab}')">
                    <option value="today" ${periodSel === 'today' ? 'selected' : ''}>اليوم</option>
                    <option value="month" ${periodSel === 'month' ? 'selected' : ''}>الشهر الحالي (30 يوم)</option>
                    <option value="quarter" ${periodSel === 'quarter' ? 'selected' : ''}>الربع الحالي (3 أشهر)</option>
                    <option value="year" ${periodSel === 'year' ? 'selected' : ''}>السنة المالية الحالية</option>
                </select>
            </div>
        </div>
    `;

    const contentHtml = `
        ${toolbarHtml}
        <div id="fin-statements-content" style="padding:10px 0;">
            <div style="text-align:center; padding:40px; color:#888;">جاري إعداد القوائم المالية المعتمدة...</div>
        </div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
        mainView.innerHTML = PB.renderShell({
            id: 'financial_reports',
            archetype: 'ledger',
            eyebrow: 'FINANCIAL STATEMENTS / P&L & BS',
            title: 'القوائم والتقارير المالية الختامية',
            subtitle: 'قوائم الأرباح والخسائر والميزانية العمومية والمركز المالي للمؤسسة',
            icon: '📈',
            actions: actions,
            content: contentHtml
        });
    } else {
        mainView.innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    <span style="font-weight:700; font-size:15px;">📈 القوائم والتقارير المالية الختامية (Financial Statements)</span>
                </div>
                <div class="mt-toolbar-right" style="gap:8px;">
                    <div style="display:inline-flex; background:#e2e8f0; border-radius:6px; padding:2px; margin-left:10px;">
                        <button class="mt-btn" style="border:none; ${activeTab === 'pnl' ? 'background:#fff; font-weight:700; color:#0f172a;' : 'background:transparent; color:#64748b;'}" onclick="App.renderFinancialReports('pnl')">📊 قائمة الدخل (P&L)</button>
                        <button class="mt-btn" style="border:none; ${activeTab === 'balance_sheet' ? 'background:#fff; font-weight:700; color:#0f172a;' : 'background:transparent; color:#64748b;'}" onclick="App.renderFinancialReports('balance_sheet')">🏛️ الميزانية العمومية (Balance Sheet)</button>
                    </div>
                    <select id="rep-filter-period" class="mt-select" onchange="App.renderFinancialReports('${activeTab}')">
                        <option value="today" ${periodSel === 'today' ? 'selected' : ''}>اليوم</option>
                        <option value="month" ${periodSel === 'month' ? 'selected' : ''}>الشهر الحالي (30 يوم)</option>
                        <option value="quarter" ${periodSel === 'quarter' ? 'selected' : ''}>الربع الحالي (3 أشهر)</option>
                        <option value="year" ${periodSel === 'year' ? 'selected' : ''}>السنة المالية الحالية</option>
                    </select>
                    <button class="mt-btn" onclick="window.print()">🖨️ طباعة القائمة</button>
                    <button class="mt-btn" onclick="App.renderFinancialReports('${activeTab}')">⟳ تحديث</button>
                </div>
            </div>
            <div style="flex:1; overflow-y:auto; padding:20px;">
                ${contentHtml}
            </div>
        `;
    }




    const contentDiv = document.getElementById('fin-statements-content');

    const res = await this.api('get_comprehensive_financial_statements', { period: periodSel });

    if (!res || !res.success) {

        if (contentDiv) contentDiv.innerHTML = `<div style="text-align:center; padding:30px; color:#e74c3c;">فشل استخراج القوائم المالية: ${this.escape(res?.error || 'خطأ غير معروف')}</div>`;

        return;

    }



    const inc = res.income_statement || {};

    const bs = res.balance_sheet || {};



    if (activeTab === 'pnl') {

        // Multi-step Income Statement (P&L)

        contentDiv.innerHTML = `

            <!-- KPI CARDS -->

            <div class="kpi-grid" style="padding:0; margin-bottom:20px;">

                <div class="kpi-card" style="border-right:4px solid #16a34a;">

                    <div class="kpi-icon" style="background:#f0fdf4; color:#16a34a;">📈</div>

                    <div>

                        <div class="kpi-val" style="color:#16a34a;">${App.formatMoney(inc.net_revenues)}</div>

                        <div class="kpi-lbl">صافي إيرادات المبيعات</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #dc2626;">

                    <div class="kpi-icon" style="background:#fef2f2; color:#dc2626;">📉</div>

                    <div>

                        <div class="kpi-val" style="color:#dc2626;">${App.formatMoney(inc.total_expenses)}</div>

                        <div class="kpi-lbl">إجمالي المصروفات التشغيلية</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #0284c7;">

                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">🎯</div>

                    <div>

                        <div class="kpi-val" style="color:${inc.net_operating_income >= 0 ? '#0284c7' : '#dc2626'};">

                            ${App.formatMoney(inc.net_operating_income)}

                        </div>

                        <div class="kpi-lbl">صافي الدخل التشغيلي (Net Income)</div>

                    </div>

                </div>

            </div>



            <!-- DETAILED INCOME STATEMENT TABLE -->

            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:24px; max-width:900px; margin:0 auto; box-shadow:0 2px 8px rgba(0,0,0,0.04);">

                <div style="text-align:center; margin-bottom:20px; border-bottom:2px solid #e2e8f0; padding-bottom:12px;">

                    <h3 style="margin:0 0 6px 0; font-size:17px; color:#0f172a;">قائمة الدخل والأرباح والخسائر الشاملة (Income Statement)</h3>

                    <div style="font-size:12px; color:#64748b;">عن الفترة المالية: <b>${res.period?.start_date}</b> إلى <b>${res.period?.end_date}</b></div>

                </div>



                <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">

                    <tbody>

                        <!-- REVENUES -->

                        <tr style="background:#f8fafc; font-weight:700;">

                            <td colspan="2" style="padding:10px 12px; color:#15803d; font-size:14px;">1. الإيرادات التشغيلية (Revenues):</td>

                        </tr>

                        ${(inc.revenues || []).map(r => `

                            <tr>

                                <td style="padding:8px 24px; color:#334155;">+ ${this.escape(r.name)}</td>

                                <td style="padding:8px 12px; text-align:left; font-family:monospace;">${App.formatMoney(r.amount)}</td>

                            </tr>

                        `).join('')}

                        <tr style="border-bottom:1px solid #e2e8f0; font-weight:600;">

                            <td style="padding:8px 12px; text-align:left;">إجمالي الإيرادات:</td>

                            <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#16a34a;">${App.formatMoney(inc.total_revenues)}</td>

                        </tr>



                        <!-- DISCOUNTS -->

                        ${(inc.discounts || []).length > 0 ? `

                            ${(inc.discounts || []).map(d => `

                                <tr>

                                    <td style="padding:8px 24px; color:#ea580c;">- ${this.escape(d.name)}</td>

                                    <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#ea580c;">(${App.formatMoney(d.amount)})</td>

                                </tr>

                            `).join('')}

                            <tr style="border-bottom:2px solid #cbd5e1; font-weight:700; background:#f0fdf4;">

                                <td style="padding:8px 12px;">= صافي الإيرادات:</td>

                                <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#16a34a;">${App.formatMoney(inc.net_revenues)}</td>

                            </tr>

                        ` : ''}



                        <!-- COST OF SALES -->

                        ${(inc.cost_of_sales || []).length > 0 ? `

                            <tr style="background:#f8fafc; font-weight:700;">

                                <td colspan="2" style="padding:10px 12px; color:#b45309; font-size:14px;">2. تكلفة المبيعات (Cost of Sales):</td>

                            </tr>

                            ${(inc.cost_of_sales || []).map(c => `

                                <tr>

                                    <td style="padding:8px 24px; color:#475569;">- ${this.escape(c.name)}</td>

                                    <td style="padding:8px 12px; text-align:left; font-family:monospace;">(${App.formatMoney(c.amount)})</td>

                                </tr>

                            `).join('')}

                            <tr style="border-bottom:2px solid #cbd5e1; font-weight:700; background:#fefce8;">

                                <td style="padding:8px 12px;">= مجمل الربح (Gross Profit):</td>

                                <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#ca8a04;">${App.formatMoney(inc.gross_profit)}</td>

                            </tr>

                        ` : ''}



                        <!-- OPERATING EXPENSES -->

                        <tr style="background:#f8fafc; font-weight:700;">

                            <td colspan="2" style="padding:10px 12px; color:#b91c1c; font-size:14px;">3. المصروفات التشغيلية والإدارية (Operating Expenses):</td>

                        </tr>

                        ${(inc.expenses || []).map(e => `

                            <tr>

                                <td style="padding:8px 24px; color:#475569;">- ${this.escape(e.name)}</td>

                                <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#dc2626;">(${App.formatMoney(e.amount)})</td>

                            </tr>

                        `).join('')}

                        <tr style="border-bottom:1px solid #e2e8f0; font-weight:600;">

                            <td style="padding:8px 12px; text-align:left;">إجمالي المصروفات:</td>

                            <td style="padding:8px 12px; text-align:left; font-family:monospace; color:#dc2626;">(${App.formatMoney(inc.total_expenses)})</td>

                        </tr>



                        <!-- NET OPERATING INCOME -->

                        <tr style="background:${inc.net_operating_income >= 0 ? '#eff6ff' : '#fef2f2'}; border-top:2px solid #0f172a; font-size:15px; font-weight:700;">

                            <td style="padding:12px 14px; color:#0f172a;">صافي الدخل التشغيلي النهائي (Net Income):</td>

                            <td style="padding:12px 14px; text-align:left; font-family:monospace; font-size:16px; color:${inc.net_operating_income >= 0 ? '#1d4ed8' : '#dc2626'};">

                                ${App.formatMoney(inc.net_operating_income)}

                            </td>

                        </tr>

                    </tbody>

                </table>

            </div>

        `;

    } else {

        // Balance Sheet (الميزانية العمومية)

        contentDiv.innerHTML = `

            <!-- BALANCE STATUS BANNER -->

            <div style="margin-bottom:20px; padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:${bs.is_balanced ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${bs.is_balanced ? '#bbf7d0' : '#fecaca'};">

                <div style="display:flex; align-items:center; gap:12px;">

                    <span style="font-size:26px;">🏛️</span>

                    <div>

                        <h4 style="margin:0; font-size:15px; color:${bs.is_balanced ? '#166534' : '#991b1b'};">

                            ${bs.is_balanced ? 'الميزانية العمومية متوازنة تماماً ⚖️' : '⚠️ الميزانية العمومية غير متوازنة'}

                        </h4>

                        <div style="font-size:12px; color:${bs.is_balanced ? '#15803d' : '#b91c1c'};">

                            معادلة الميزانية: الأصول (${App.formatMoney(bs.total_assets)}) = الخصوم وحقوق الملكية (${App.formatMoney(bs.total_liabilities_and_equity)})

                        </div>

                    </div>

                </div>

                <div style="font-family:monospace; font-size:14px; font-weight:700; color:#16a34a;">

                    الفارق: ${App.formatMoney(bs.diff || 0)}

                </div>

            </div>



            <!-- TWO COLUMN BALANCE SHEET -->

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:1100px; margin:0 auto;">

                <!-- ASSETS SIDE -->

                <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">

                    <div style="border-bottom:2px solid #22c55e; padding-bottom:8px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">

                        <h3 style="margin:0; font-size:16px; color:#15803d;">الأصول والموجودات (Assets)</h3>

                        <span style="font-family:monospace; font-weight:700; color:#15803d;">${App.formatMoney(bs.total_assets)}</span>

                    </div>



                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">

                        <tbody>

                            ${(bs.assets || []).map(a => `

                                <tr style="border-bottom:1px solid #f1f5f9;">

                                    <td style="padding:8px 10px;">

                                        <span style="font-family:monospace; background:#f1f5f9; padding:1px 6px; border-radius:4px; font-size:11px; margin-left:6px;">${a.code}</span>

                                        ${this.escape(a.name)}

                                    </td>

                                    <td style="padding:8px 10px; text-align:left; font-family:monospace; font-weight:700; color:#0284c7;">${App.formatMoney(a.balance)}</td>

                                </tr>

                            `).join('')}

                        </tbody>

                        <tfoot>

                            <tr style="background:#f0fdf4; font-weight:700; border-top:2px solid #22c55e;">

                                <td style="padding:10px 10px; font-size:13px;">إجمالي الأصول:</td>

                                <td style="padding:10px 10px; text-align:left; font-family:monospace; font-size:14px; color:#15803d;">${App.formatMoney(bs.total_assets)}</td>

                            </tr>

                        </tfoot>

                    </table>

                </div>



                <!-- LIABILITIES & EQUITY SIDE -->

                <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">

                    <div style="border-bottom:2px solid #3b82f6; padding-bottom:8px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">

                        <h3 style="margin:0; font-size:16px; color:#1d4ed8;">الخصوم وحقوق الملكية (Liabilities & Equity)</h3>

                        <span style="font-family:monospace; font-weight:700; color:#1d4ed8;">${App.formatMoney(bs.total_liabilities_and_equity)}</span>

                    </div>



                    <div style="font-weight:700; font-size:13px; color:#ea580c; margin-bottom:6px;">الخصوم والالتزامات (Liabilities):</div>

                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">

                        <tbody>

                            ${(bs.liabilities || []).length > 0 ? (bs.liabilities || []).map(l => `

                                <tr style="border-bottom:1px solid #f1f5f9;">

                                    <td style="padding:6px 10px;">

                                        <span style="font-family:monospace; background:#f1f5f9; padding:1px 6px; border-radius:4px; font-size:11px; margin-left:6px;">${l.code}</span>

                                        ${this.escape(l.name)}

                                    </td>

                                    <td style="padding:6px 10px; text-align:left; font-family:monospace; font-weight:700; color:#ea580c;">${App.formatMoney(l.balance)}</td>

                                </tr>

                            `).join('') : `<tr><td colspan="2" style="padding:8px 10px; color:#94a3b8;">لا توجد خصوم مسجلة</td></tr>`}

                        </tbody>

                        <tfoot>

                            <tr style="background:#fff7ed; font-weight:600;">

                                <td style="padding:8px 10px;">مجموع الخصوم:</td>

                                <td style="padding:8px 10px; text-align:left; font-family:monospace; color:#ea580c;">${App.formatMoney(bs.total_liabilities)}</td>

                            </tr>

                        </tfoot>

                    </table>



                    <div style="font-weight:700; font-size:13px; color:#2563eb; margin-bottom:6px;">حقوق الملكية ورأس المال (Equity):</div>

                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">

                        <tbody>

                            ${(bs.equity || []).map(e => `

                                <tr style="border-bottom:1px solid #f1f5f9;">

                                    <td style="padding:6px 10px;">

                                        <span style="font-family:monospace; background:#f1f5f9; padding:1px 6px; border-radius:4px; font-size:11px; margin-left:6px;">${e.code}</span>

                                        ${this.escape(e.name)}

                                    </td>

                                    <td style="padding:6px 10px; text-align:left; font-family:monospace; font-weight:700; color:#2563eb;">${App.formatMoney(e.balance)}</td>

                                </tr>

                            `).join('')}

                        </tbody>

                        <tfoot>

                            <tr style="background:#eff6ff; font-weight:600;">

                                <td style="padding:8px 10px;">مجموع حقوق الملكية:</td>

                                <td style="padding:8px 10px; text-align:left; font-family:monospace; color:#2563eb;">${App.formatMoney(bs.total_equity)}</td>

                            </tr>

                        </tfoot>

                    </table>



                    <div style="background:#f8fafc; border:2px solid #3b82f6; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; font-weight:700;">

                        <span style="font-size:13px; color:#0f172a;">إجمالي الخصوم وحقوق الملكية:</span>

                        <span style="font-family:monospace; font-size:15px; color:#1d4ed8;">${App.formatMoney(bs.total_liabilities_and_equity)}</span>

                    </div>

                </div>

            </div>

        `;

    }

};





// ==========================================

// PARTNER MANAGEMENT (ADD / EDIT / DEPOSIT / DELETE)

// ==========================================

App.openAddPartnerModal = async function(partner = null) {

    const isEdit = !!partner;

    const p = partner || {};



    let resAdmins = await this.api('get_admins');

    if (!resAdmins || (Array.isArray(resAdmins) && resAdmins.length === 0)) {

        resAdmins = await this.api('get_admins_with_roles');

    }

    const admins = Array.isArray(resAdmins) ? resAdmins : (resAdmins?.admins || resAdmins?.data || []);



    const resCoa = await this.api('get_chart_of_accounts');

    const cashAccounts = (resCoa?.accounts || []).filter(a => (a.account_code || '').startsWith('110') && a.is_leaf == 1);



    let modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">

                ${isEdit ? '✏️ تعديل بيانات الشريك وحصته' : '➕ إضافة شريك جديد وربطه بحصة المساهمة'}

            </span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitSavePartner(event, ${p.id || 0})">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:2;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">اسم الشريك بالكامل *</label>

                        <input type="text" id="part-name" class="mt-input" style="width:100%;" value="${this.escape(p.partner_name || '')}" placeholder="مثال: م. عبد الرحمن محمد" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">نسبة المساهمة / الأرباح (%) *</label>

                        <input type="number" step="0.01" min="0" max="100" id="part-share" class="mt-input" style="width:100%; font-family:monospace; font-weight:700; color:#2563eb;" value="${p.share_percentage || p.profit_share_percent || ''}" placeholder="مثال: 25" required />

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">حصة رأس المال الأساسي (YER) *</label>

                        <input type="number" step="0.01" min="0" id="part-capital" class="mt-input" style="width:100%; font-family:monospace; font-weight:700;" value="${p.capital_share || p.capital_amount || 0}" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ربط بحساب مستخدم (اختياري):</label>

                        <select id="part-admin-id" class="mt-select" style="width:100%;">

                            <option value="">-- بدون ربط بحساب مستخدم --</option>

                            ${admins.map(a => `<option value="${a.id}" ${p.admin_id == a.id ? 'selected' : ''}>${this.escape(a.fullname || a.username)} (${a.role})</option>`).join('')}

                        </select>

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">رقم الهاتف / الواتساب:</label>

                        <div class="phone-input-group" style="display:flex; direction:ltr; align-items:stretch; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-window);">

    <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:12.5px; padding:0 10px; display:inline-flex; align-items:center; border-right:1px solid #bae6fd; user-select:none; font-family:monospace;">

        🇾🇪 +967

    </span>

    <input type="tel" id="part-phone" class="mt-input" style="flex:1; border:none; border-radius:0; direction:ltr; font-family:monospace; font-weight:700; font-size:14px; padding:8px 10px;" value="${this.escape((p.phone || '').replace(/^(?:\+?967|00967|0)+/, ''))}" placeholder="77XXXXXXX" oninput="App.onPhoneInputAutoFormat(this)" />

</div>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">البريد الإلكتروني (اختياري):</label>

                        <input type="email" id="part-email" class="mt-input" style="width:100%;" value="${this.escape(p.email || '')}" placeholder="partner@network.com" />

                    </div>

                </div>



                ${!isEdit ? `

                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px; margin-bottom:14px;">

                    <label style="display:flex; align-items:center; gap:8px; font-weight:700; color:#1e40af; cursor:pointer; margin-bottom:8px;">

                        <input type="checkbox" id="part-deposit-check" onchange="document.getElementById('part-deposit-box').style.display = this.checked ? 'block' : 'none';" />

                        <span>إيداع رأس المال الأولي في الخزينة/البنك الآن وتوليد القيد المحاسبي المزدوج 🏛️</span>

                    </label>

                    <div id="part-deposit-box" style="display:none; margin-top:8px;">

                        <label style="font-size:12px; font-weight:600; color:#334155; margin-bottom:4px; display:block;">صندوق / حساب الإيداع المستلم:</label>

                        <select id="part-pay-acc" class="mt-select" style="width:100%;">

                            ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${this.escape(a.name_ar)}</option>`).join('')}

                        </select>

                        <small style="color:#64748b; margin-top:4px; display:block;">

                            سيتم إنشاء قيد مزدوج متوازن: من حساب النقدية المحدد إلى حساب (3101 - رأس مال الشركاء والمؤسسين).

                        </small>

                    </div>

                </div>

                ` : ''}



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ملاحظات واتفاقية الشراكة:</label>

                    <textarea id="part-notes" class="mt-input" style="width:100%; height:55px; resize:none;" placeholder="شروط ونسب وتفاصيل إضافية...">${this.escape(p.notes || '')}</textarea>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-save-partner" style="background:#2563eb; border-color:#1d4ed8;">

                    💾 حفظ بيانات الشريك

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '650px');

};



App.submitSavePartner = async function(e, partnerId) {

    e.preventDefault();

    const btn = document.getElementById('btn-save-partner');

    if (btn) btn.disabled = true;



    const payload = {

        id: partnerId || 0,

        partner_name: document.getElementById('part-name').value.trim(),

        share_percentage: parseFloat(document.getElementById('part-share').value) || 0,

        capital_share: parseFloat(document.getElementById('part-capital').value) || 0,

        admin_id: document.getElementById('part-admin-id').value || null,

        phone: document.getElementById('part-phone')?.value.trim() || '',

        email: document.getElementById('part-email')?.value.trim() || '',

        notes: document.getElementById('part-notes')?.value.trim() || '',

        deposit_capital: document.getElementById('part-deposit-check')?.checked ? 1 : 0,

        payment_account_id: document.getElementById('part-pay-acc')?.value || 21

    };



    const res = await this.api('save_partner', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حفظ بيانات الشريك', 'danger');

    }



    this.toast(res.message || 'تم حفظ بيانات الشريك بنجاح! 🤝', 'success');

    this.closeModal();

    this.renderPartnersEquity();

};




App.onDepositCapCurrencyChange = function(code) {
    const sym = this.getCurrencySymbol(code);
    const lbl = document.getElementById('lbl-dep-cap-amt');
    if (lbl) lbl.textContent = `مبلغ زيادة / إيداع رأس المال (${sym}) *`;
    this.onDepositCapAmountInput(document.getElementById('dep-cap-amt')?.value || 0);
};

App.onDepositCapAmountInput = function(val) {
    const amount = parseFloat(val) || 0;
    const code = document.getElementById('dep-cap-currency')?.value || this._baseCurrency || 'YER_SANAA';
    const rate = this.getCurrencyRate(code);
    const isBase = (code === (this._baseCurrency || 'YER_SANAA') || rate === 1.0);
    const hint = document.getElementById('dep-cap-conv-hint');
    if (hint) {
        if (!isBase && amount > 0) {
            const baseAmount = amount * rate;
            const baseSym = this.getCurrencySymbol(this._baseCurrency || 'YER_SANAA');
            hint.innerHTML = `💱 زيادة رأس المال بالعملة الأساسية: <b>${this.formatMoney(baseAmount)} ${baseSym}</b> (سعر الصرف بتاريخه: ${rate})`;
        } else {
            hint.innerHTML = '';
        }
    }
};

App.openDepositPartnerCapitalModal = async function(partnerId, partnerName) {

    const resCoa = await this.api('get_chart_of_accounts');

    const cashAccounts = (resCoa?.accounts || []).filter(a => (a.account_code || '').startsWith('110') && a.is_leaf == 1);



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">💵 إيداع رأس مال إضافي للشريك (${this.escape(partnerName)})</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitDepositPartnerCapital(event, ${partnerId})">

            <div class="mt-modal-body" style="padding:20px;">

                <div class="form-group" style="margin-bottom:14px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">مبلغ زيادة / إيداع رأس المال (YER) *</label>

                    <input type="number" step="0.01" min="1" id="dep-cap-amt" class="mt-input" style="width:100%; font-size:16px; font-weight:700; font-family:monospace; color:#16a34a;" placeholder="مثال: 500000" required />

                </div>

                <div class="form-group" style="margin-bottom:14px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">حساب الاستلام (صندوق النقدية أو البنك):</label>

                    <select id="dep-cap-acc" class="mt-select" style="width:100%;">

                        ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${this.escape(a.name_ar)}</option>`).join('')}

                    </select>

                </div>

                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">البيان / ملاحظات الإيداع:</label>

                    <textarea id="dep-cap-notes" class="mt-input" style="width:100%; height:55px; resize:none;" placeholder="بيان عملية زيادة رأس المال..."></textarea>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-dep-cap" style="background:#16a34a; border-color:#15803d;">

                    ⚖️ ترحيل الإيداع للقيد المزدوج

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '520px');

};



App.submitDepositPartnerCapital = async function(e, partnerId) {

    e.preventDefault();

    const btn = document.getElementById('btn-dep-cap');

    if (btn) btn.disabled = true;



    const payload = {

        partner_id: partnerId,

        amount: parseFloat(document.getElementById('dep-cap-amt').value) || 0,

        payment_account_id: document.getElementById('dep-cap-acc').value || 21,

        notes: document.getElementById('dep-cap-notes').value.trim()

    };



    const res = await this.api('deposit_partner_capital', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل ترحيل إيداع رأس المال', 'danger');

    }



    this.toast(res.message || 'تم إيداع رأس المال وترحيل القيد بنجاح! 🏛️', 'success');

    this.closeModal();

    this.renderPartnersEquity();

};



App.deletePartner = async function(partnerId, partnerName) {

    if (!confirm(`هل أنت متأكد من رغبتك في حذف الشريك (${partnerName})؟`)) return;



    const res = await this.api('delete_partner', { id: partnerId });

    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حذف الشريك', 'danger');

    }



    this.toast('تم حذف الشريك بنجاح', 'success');

    this.renderPartnersEquity();

};



// ==========================================

// SALARIES & PAYROLL VIEW

// ==========================================

App.renderSalaries = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const curMonth = new Date().toISOString().slice(0, 7);
    const PB = window.SamUI?.PageBuilder;

    const actions = [
        { label: '➕ إضافة موظف جديد', variant: 'primary', onclick: 'App.openEmployeeSalaryModal()' },
        { label: '⚡ صرف المسير دفعة واحدة', variant: 'success', onclick: 'App.openBatchSalaryModal()' },
        { label: '📜 أرشيف السندات', variant: 'secondary', onclick: 'App.openSalaryPaymentsLogModal()' },
        { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderSalaries()' }
    ];

    const toolbar = {
        left: [
            `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <label style="font-weight:700; font-size:12.5px; color:var(--sam-text-secondary);">شهر المسير:</label>
                <input type="month" id="sal-month-filter" class="sam-input mt-input" value="${curMonth}" onchange="App.loadSalariesData()" title="شهر المسير" style="padding:4px 8px; font-weight:700;" />
                <span id="sal-month-display" style="font-size:12px; font-weight:700; color:var(--sam-primary, #0284c7); font-family:monospace; background:var(--sam-primary-subtle, #f0f9ff); padding:3px 10px; border-radius:4px; border:1px solid var(--sam-primary-border, #bae6fd);">${curMonth}</span>
            </div>`
        ],
        right: []
    };

    const kpiHtml = `
        <div class="kpi-grid sam-ui-kpis" style="margin-bottom:14px;">
            <div class="kpi-card sam-ui-kpi sam-ui-kpi-blue">
                <div class="sam-ui-kpi-label"><span>👥</span><span>إجمالي كادر الموظفين</span></div>
                <strong id="kpi-sal-count">0</strong>
            </div>
            <div class="kpi-card sam-ui-kpi sam-ui-kpi-purple">
                <div class="sam-ui-kpi-label"><span>📊</span><span>إجمالي الموازنة التقديرية</span></div>
                <strong id="kpi-sal-budget">0.00</strong>
            </div>
            <div class="kpi-card sam-ui-kpi sam-ui-kpi-green">
                <div class="sam-ui-kpi-label"><span>✅</span><span>إجمالي الرواتب المصروفة</span></div>
                <strong id="kpi-sal-paid">0.00</strong>
            </div>
            <div class="kpi-card sam-ui-kpi sam-ui-kpi-rose">
                <div class="sam-ui-kpi-label"><span>⏳</span><span>المتبقي بانتظار الصرف</span></div>
                <strong id="kpi-sal-rem">0.00</strong>
            </div>
        </div>
    `;

    const tableHtml = `
        <div class="sam-table-container mt-table-container">
            <table class="sam-table mt-table" style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr>
                        <th style="padding:10px 14px;">الموظف</th>
                        <th style="padding:10px 14px;">المسمى الوظيفي</th>
                        <th style="padding:10px 14px; text-align:left;">الراتب الأساسي</th>
                        <th style="padding:10px 14px; text-align:left;">البدلات</th>
                        <th style="padding:10px 14px; text-align:left;">صافي الاستحقاق</th>
                        <th style="padding:10px 14px;">مركز التكلفة</th>
                        <th style="padding:10px 14px; text-align:center;">حالة صرف الشهر</th>
                        <th style="padding:10px 14px; text-align:center;">الإجراءات</th>
                    </tr>
                </thead>
                <tbody id="salaries-table-body">
                    <tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">جاري جلب سلم رواتب الموظفين...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    const shell = PB ? PB.renderShell({
        id: 'salaries-payroll',
        archetype: 'ledger',
        title: 'مسيرات ورواتب الموظفين (Employee Salaries & Payroll)',
        subtitle: 'إدارة الأجور والبدلات والاستقطاعات والصرف بالقيد المزدوج المعتمد',
        eyebrow: 'المحاسبة والمالية',
        icon: '💵',
        actions,
        toolbar,
        content: `${kpiHtml}${tableHtml}`
    }) : `
        <div class="sam-page-shell">
            ${kpiHtml}${tableHtml}
        </div>
    `;

    mainView.innerHTML = shell;
    await this.loadSalariesData();
};



App.loadSalariesData = async function() {

    const month = document.getElementById('sal-month-filter')?.value || new Date().toISOString().slice(0, 7);

    const mDisp = document.getElementById('sal-month-display');

    if (mDisp) mDisp.innerText = month;



    const tbody = document.getElementById('salaries-table-body');

    if (!tbody) return;



    const res = await this.api('get_employee_salaries', { month_year: month });

    if (!res || !res.success) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#e74c3c;">فشل تحميل سجلات الرواتب: ${this.escape(res?.error || 'خطأ غير معروف')}</td></tr>`;

        return;

    }



    this._employeeSalaries = res.employees || [];

    const sum = res.summary || {};



    const elCount = document.getElementById('kpi-sal-count');

    if (elCount) elCount.innerText = `${sum.paid_count || 0} / ${sum.total_employees || 0} موظف`;

    const elBud = document.getElementById('kpi-sal-budget');

    if (elBud) elBud.innerText = App.formatMoney(sum.total_budget || 0);

    const elPaid = document.getElementById('kpi-sal-paid');

    if (elPaid) elPaid.innerText = App.formatMoney(sum.total_paid || 0);

    const elRem = document.getElementById('kpi-sal-rem');

    if (elRem) elRem.innerText = App.formatMoney(sum.total_remaining || 0);



    if (this._employeeSalaries.length === 0) {

        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">لا يوجد موظفون مضافون لسلم الرواتب حالياً. اضغط "➕ إضافة موظف جديد" للبدء.</td></tr>`;

        return;

    }



    let html = '';

    this._employeeSalaries.forEach(emp => {

        const isPaid = !!emp.is_paid_this_month;

        html += `

            <tr style="border-bottom:1px solid #edf2f7;">

                <td style="padding:10px 14px; font-weight:700; color:#0f172a;">

                    ${this.escape(emp.employee_name)}

                    ${emp.phone ? `<div style="font-size:11px; color:#64748b; font-weight:normal;">📞 ${this.escape(emp.phone)}</div>` : ''}

                </td>

                <td style="padding:10px 14px; color:#475569;">${this.escape(emp.job_title || 'موظف')}</td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:600;">

                    ${App.formatMoney(emp.basic_salary)}

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; color:#059669;">

                    +${App.formatMoney(emp.total_allowances)}

                </td>

                <td style="padding:10px 14px; text-align:left; font-family:monospace; font-weight:700; color:#2563eb;">

                    ${App.formatMoney(emp.estimated_net)}

                </td>

                <td style="padding:10px 14px; color:#64748b; font-size:12px;">

                    ${this.escape(emp.cost_center_name || 'عام')}

                </td>

                <td style="padding:10px 14px; text-align:center;">

                    ${isPaid ? `

                        <span style="background:#f0fdf4; color:#16a34a; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; border:1px solid #bbf7d0;">

                            ✅ تم الصرف (${App.formatMoney(emp.last_paid_amount)})

                        </span>

                        <div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:2px;" dir="ltr">#${this.escape(emp.last_payment_no)}</div>

                    ` : `

                        <span style="background:#fffbeb; color:#d97706; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; border:1px solid #fde68a;">

                            ⏳ بانتظار الصرف

                        </span>

                    `}

                </td>

                <td style="padding:10px 14px; text-align:center;">

                    <div style="display:flex; gap:6px; justify-content:center;">

                        ${!isPaid ? `

                            <button class="mt-btn mt-btn-primary" style="padding:3px 8px; font-size:11px; background:#16a34a; border-color:#15803d;" onclick="App.openPaySalaryModal(${emp.id})">

                                💵 صرف الراتب

                            </button>

                        ` : `

                            <button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick="App.printSalaryVoucher(${emp.last_payment_id})">

                                🖨️ طباعة السند

                            </button>

                        `}

                        <button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick="App.openEmployeeSalaryModal(${JSON.stringify(emp).replace(/"/g, '&quot;')})">

                            ✏️

                        </button>

                        <button class="mt-btn" style="padding:3px 8px; font-size:11px; color:#dc2626;" onclick="App.deleteEmployeeSalary(${emp.id}, '${this.escape(emp.employee_name)}')">

                            🗑️

                        </button>

                    </div>

                </td>

            </tr>

        `;

    });



    tbody.innerHTML = html;

};



// --- EMPLOYEE SALARY PROFILE MODAL (ADD / EDIT) ---

App.openEmployeeSalaryModal = async function(emp = null) {

    const isEdit = !!emp;

    const e = emp || {};



    const [resAdmins, resCc, resSalaries] = await Promise.all([

        this.api('get_admins'),

        this.api('get_cost_centers'),

        this.api('get_employee_salaries')

    ]);



    const admins = Array.isArray(resAdmins) ? resAdmins : (resAdmins?.admins || resAdmins?.data || []);

    const costCenters = resCc?.cost_centers || [];

    const existingEmployees = resSalaries?.employees || [];

    

    // Map existing active admin IDs and names (excluding current editing employee)

    const existingAdminIds = new Set();

    const existingNames = new Set();

    existingEmployees.forEach(item => {

        if (Number(item.id) !== Number(e.id)) {

            if (item.admin_id) existingAdminIds.add(Number(item.admin_id));

            if (item.employee_name) existingNames.add(item.employee_name.trim().toLowerCase());

        }

    });



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">

                ${isEdit ? '✏️ تعديل سلم راتب الموظف' : '➕ إضافة موظف جديد لسلم الرواتب'}

            </span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitSaveEmployeeSalary(event, ${e.id || 0})">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                

                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#1e40af;">

                    💡 <b>ملاحظة لمنع التكرار:</b> يجب أن يكون لكل موظف سجل راتب نشط واحد فقط. يمكنك ربط الموظف بحسابه في النظام وسيتم ملء البيانات تلقائياً.

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">اختيار من كادر النظام (ربط بحساب):</label>

                        <select id="es-admin-id" class="mt-select" style="width:100%;" onchange="App.onSelectSalaryAdmin(this)">

                            <option value="">-- اختياري: اختر من حسابات النظام --</option>

                            ${admins.map(a => {

                                const isUsed = existingAdminIds.has(Number(a.id));

                                return `<option value="${a.id}" data-name="${this.escape(a.fullname || a.username)}" data-phone="${this.escape(a.phone || '')}" data-role="${this.escape(a.role || '')}" ${e.admin_id == a.id ? 'selected' : ''} ${isUsed ? 'disabled style="color:#94a3b8; background:#f1f5f9;"' : ''}>

                                    ${this.escape(a.fullname || a.username)} (${a.role}) ${isUsed ? '⚠️ [مسجل مسبقاً بالرواتب]' : ''}

                                </option>`;

                            }).join('')}

                        </select>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">مركز التكلفة / الراوتر المخصص:</label>

                        <select id="es-cost-center" class="mt-select" style="width:100%;">

                            <option value="">-- عام (بدون مركز تكلفة محدد) --</option>

                            ${costCenters.map(c => `<option value="${c.id}" ${e.cost_center_id == c.id ? 'selected' : ''}>${this.escape(c.name)} (${c.code})</option>`).join('')}

                        </select>

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:2;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">اسم الموظف الكامل *</label>

                        <input type="text" id="es-name" class="mt-input" style="width:100%;" value="${this.escape(e.employee_name || '')}" placeholder="مثال: صالح علي الحميري" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">المسمى الوظيفي:</label>

                        <input type="text" id="es-title" class="mt-input" style="width:100%;" value="${this.escape(e.job_title || '')}" placeholder="مثال: مهندس شبكات وصيانة" />

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">الراتب الأساسي (YER) *</label>

                        <input type="number" step="0.01" min="1" id="es-basic" class="mt-input" style="width:100%; font-family:monospace; font-weight:700; font-size:15px; color:#2563eb;" value="${e.basic_salary || ''}" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">رقم الهاتف / الواتساب:</label>

                        <div class="phone-input-group" style="display:flex; direction:ltr; align-items:stretch; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-window);">

    <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:12.5px; padding:0 10px; display:inline-flex; align-items:center; border-right:1px solid #bae6fd; user-select:none; font-family:monospace;">

        🇾🇪 +967

    </span>

    <input type="tel" id="es-phone" class="mt-input" style="flex:1; border:none; border-radius:0; direction:ltr; font-family:monospace; font-weight:700; font-size:14px; padding:8px 10px;" value="${this.escape((e.phone || '').replace(/^(?:\+?967|00967|0)+/, ''))}" placeholder="77XXXXXXX" oninput="App.onPhoneInputAutoFormat(this)" />

</div>

                    </div>

                </div>



                <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">

                    البدلات الشهرية والحوافز المستمرة (YER):

                </div>

                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-size:12px; color:#475569; margin-bottom:4px; display:block;">بدل سكن:</label>

                        <input type="number" step="0.01" min="0" id="es-housing" class="mt-input" style="width:100%; font-family:monospace;" value="${e.housing_allowance || 0}" />

                    </div>

                    <div style="flex:1;">

                        <label style="font-size:12px; color:#475569; margin-bottom:4px; display:block;">بدل مواصلات:</label>

                        <input type="number" step="0.01" min="0" id="es-transport" class="mt-input" style="width:100%; font-family:monospace;" value="${e.transport_allowance || 0}" />

                    </div>

                    <div style="flex:1;">

                        <label style="font-size:12px; color:#475569; margin-bottom:4px; display:block;">بدلات/حوافز أخرى:</label>

                        <input type="number" step="0.01" min="0" id="es-other" class="mt-input" style="width:100%; font-family:monospace;" value="${e.other_allowances || 0}" />

                    </div>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">طريقة الدفع الافتراضية:</label>

                        <select id="es-method" class="mt-select" style="width:100%;">

                            <option value="cash" ${e.payment_method === 'cash' ? 'selected' : ''}>نقداً من الصندوق</option>

                            <option value="bank" ${e.payment_method === 'bank' ? 'selected' : ''}>تحويل بنكي / الكريمي</option>

                            <option value="wallet" ${e.payment_method === 'wallet' ? 'selected' : ''}>محفظة إلكترونية</option>

                        </select>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">استقطاع افتراضي دوري (YER):</label>

                        <input type="number" step="0.01" min="0" id="es-deductions" class="mt-input" style="width:100%; font-family:monospace;" value="${e.default_deductions || 0}" />

                    </div>

                </div>



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ملاحظات وشروط العقد:</label>

                    <textarea id="es-notes" class="mt-input" style="width:100%; height:50px; resize:none;" placeholder="ملاحظات إضافية...">${this.escape(e.notes || '')}</textarea>

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-save-emp-sal" style="background:#2563eb; border-color:#1d4ed8;">

                    💾 حفظ بيانات الموظف

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '680px');

};



App.onSelectSalaryAdmin = function(selectEl) {

    const selectedOpt = selectEl.options[selectEl.selectedIndex];

    if (!selectedOpt || !selectedOpt.value) return;



    const name = selectedOpt.getAttribute('data-name');

    const phone = selectedOpt.getAttribute('data-phone');

    const role = selectedOpt.getAttribute('data-role');



    const nameInput = document.getElementById('es-name');

    const phoneInput = document.getElementById('es-phone');

    const titleInput = document.getElementById('es-title');



    if (nameInput && !nameInput.value.trim() && name) nameInput.value = name;

    if (phoneInput && !phoneInput.value.trim() && phone) phoneInput.value = phone;

    if (titleInput && !titleInput.value.trim() && role) titleInput.value = role;

};



App.submitSaveEmployeeSalary = async function(e, id) {

    e.preventDefault();

    const btn = document.getElementById('btn-save-emp-sal');

    if (btn) btn.disabled = true;



    const payload = {

        id: id || 0,

        employee_name: document.getElementById('es-name').value.trim(),

        job_title: document.getElementById('es-title').value.trim(),

        basic_salary: parseFloat(document.getElementById('es-basic').value) || 0,

        phone: document.getElementById('es-phone').value.trim(),

        housing_allowance: parseFloat(document.getElementById('es-housing').value) || 0,

        transport_allowance: parseFloat(document.getElementById('es-transport').value) || 0,

        other_allowances: parseFloat(document.getElementById('es-other').value) || 0,

        default_deductions: parseFloat(document.getElementById('es-deductions').value) || 0,

        cost_center_id: document.getElementById('es-cost-center').value || null,

        admin_id: document.getElementById('es-admin-id').value || null,

        payment_method: document.getElementById('es-method').value || 'cash',

        notes: document.getElementById('es-notes').value.trim()

    };



    const res = await this.api('save_employee_salary', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حفظ بيانات الموظف', 'danger');

    }



    this.toast(res.message || 'تم حفظ بيانات الموظف بنجاح!', 'success');

    this.closeModal();

    this.loadSalariesData();

};



App.deleteEmployeeSalary = async function(empId, empName) {

    if (!confirm(`هل أنت متأكد من رغبتك في إيقاف/حذف الموظف (${empName}) من سلم الرواتب؟`)) return;



    const res = await this.api('delete_employee_salary', { id: empId });

    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل حذف الموظف', 'danger');

    }



    this.toast('تم إيقاف الموظف من سلم الرواتب بنجاح', 'success');

    this.loadSalariesData();

};



// --- PAY INDIVIDUAL SALARY MODAL ---

App.openPaySalaryModal = async function(empId) {

    const emp = (this._employeeSalaries || []).find(e => e.id == empId);

    if (!emp) return;



    const curMonth = document.getElementById('sal-month-filter')?.value || new Date().toISOString().slice(0, 7);

    const today = new Date().toISOString().split('T')[0];



    const resCoa = await this.api('get_chart_of_accounts');

    const cashAccounts = (resCoa?.accounts || []).filter(a => (a.account_code || '').startsWith('110') && a.is_leaf == 1);



    const basic = parseFloat(emp.basic_salary) || 0;

    const allowances = parseFloat(emp.total_allowances) || 0;

    const initialNet = basic + allowances;



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">💵 صرف راتب شهر (${curMonth}) للموظف: ${this.escape(emp.employee_name)}</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitPaySalary(event, ${emp.id})">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                <input type="hidden" id="pay-emp-id" value="${emp.id}" />

                <input type="hidden" id="pay-month-year" value="${curMonth}" />



                <div style="background:#f1f5f9; border-radius:8px; padding:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">

                    <div>

                        <div style="font-weight:700; font-size:14px; color:#0f172a;">${this.escape(emp.employee_name)}</div>

                        <div style="font-size:12px; color:#64748b;">${this.escape(emp.job_title || 'موظف')} | مركز التكلفة: ${this.escape(emp.cost_center_name || 'عام')}</div>

                    </div>

                    <span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:12px; font-weight:700; font-size:12px; font-family:monospace;">

                        شهر المسير: ${curMonth}

                    </span>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">الراتب الأساسي (YER):</label>

                        <input type="number" step="0.01" id="payslip-basic" class="mt-input" style="width:100%; font-family:monospace; font-weight:700;" value="${basic}" oninput="App.recalcPayslipNet()" required />

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">إجمالي البدلات والمكافآت (YER):</label>

                        <input type="number" step="0.01" id="payslip-allowances" class="mt-input" style="width:100%; font-family:monospace; font-weight:700; color:#059669;" value="${allowances}" oninput="App.recalcPayslipNet()" />

                    </div>

                </div>



                <div style="font-weight:700; font-size:13px; color:#dc2626; margin-bottom:6px;">الاستقطاعات والخصومات من الراتب (YER):</div>

                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-size:12px; color:#475569; margin-bottom:4px; display:block;">

                            خصم سلفة / عهدة سابقة (حساب 1302):

                        </label>

                        <input type="number" step="0.01" min="0" id="payslip-advances" class="mt-input" style="width:100%; font-family:monospace; color:#dc2626;" value="0" oninput="App.recalcPayslipNet()" />

                    </div>

                    <div style="flex:1;">

                        <label style="font-size:12px; color:#475569; margin-bottom:4px; display:block;">جزاءات / استقطاعات غياب أخرى:</label>

                        <input type="number" step="0.01" min="0" id="payslip-penalties" class="mt-input" style="width:100%; font-family:monospace; color:#dc2626;" value="${emp.default_deductions || 0}" oninput="App.recalcPayslipNet()" />

                    </div>

                </div>



                <!-- LIVE NET SALARY DISPLAY -->

                <div style="background:#eff6ff; border:2px solid #3b82f6; border-radius:8px; padding:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">

                    <div>

                        <div style="font-size:12px; font-weight:600; color:#1e40af;">صافي الراتب المستحق للصرف نقداً/بنك:</div>

                        <div style="font-size:22px; font-weight:700; color:#1d4ed8; font-family:monospace;" id="payslip-net-display">

                            ${App.formatMoney(initialNet)}

                        </div>

                    </div>

                    <span style="font-size:24px;">💵</span>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">صندوق / حساب الصرف النقدي *</label>

                        <select id="payslip-account" class="mt-select" style="width:100%;">

                            ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${this.escape(a.name_ar)}</option>`).join('')}

                        </select>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">تاريخ الصرف الفعلي:</label>

                        <input type="date" id="payslip-date" class="mt-input" style="width:100%;" value="${today}" required />

                    </div>

                </div>



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">البيان والملاحظات:</label>

                    <input type="text" id="payslip-notes" class="mt-input" style="width:100%;" placeholder="مثال: صرف راتب شهر ${curMonth} نقداً..." />

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-submit-payslip" style="background:#16a34a; border-color:#15803d;">

                    ⚖️ ترحيل الصرف للقيد المزدوج

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '650px');

    this.recalcPayslipNet();

};



App.recalcPayslipNet = function() {

    const basic = parseFloat(document.getElementById('payslip-basic')?.value) || 0;

    const allowances = parseFloat(document.getElementById('payslip-allowances')?.value) || 0;

    const adv = parseFloat(document.getElementById('payslip-advances')?.value) || 0;

    const pen = parseFloat(document.getElementById('payslip-penalties')?.value) || 0;



    const net = Math.max(0, basic + allowances - adv - pen);

    const disp = document.getElementById('payslip-net-display');

    if (disp) disp.innerText = App.formatMoney(net);

};



App.submitPaySalary = async function(e, empId) {

    e.preventDefault();

    const btn = document.getElementById('btn-submit-payslip');

    if (btn) btn.disabled = true;



    const payload = {

        employee_id: empId,

        month_year: document.getElementById('pay-month-year').value,

        payment_date: document.getElementById('payslip-date').value,

        basic_salary: parseFloat(document.getElementById('payslip-basic').value) || 0,

        total_allowances: parseFloat(document.getElementById('payslip-allowances').value) || 0,

        advances_deduction: parseFloat(document.getElementById('payslip-advances').value) || 0,

        penalties_deduction: parseFloat(document.getElementById('payslip-penalties').value) || 0,

        payment_account_id: document.getElementById('payslip-account').value || 21,

        notes: document.getElementById('payslip-notes').value.trim()

    };



    const res = await this.api('pay_employee_salary', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل صرف الراتب', 'danger');

    }



    this.toast(res.message || 'تم صرف الراتب وتوليد القيد المزدوج بنجاح! ⚖️💵', 'success');

    this.closeModal();

    this.loadSalariesData();



    if (res.payment_id) {

        this.printSalaryVoucher(res.payment_id);

    }

};



// --- BATCH SALARIES PAYMENT MODAL ---

App.openBatchSalaryModal = async function() {

    const curMonth = document.getElementById('sal-month-filter')?.value || new Date().toISOString().slice(0, 7);

    const today = new Date().toISOString().split('T')[0];



    const resCoa = await this.api('get_chart_of_accounts');

    const cashAccounts = (resCoa?.accounts || []).filter(a => (a.account_code || '').startsWith('110') && a.is_leaf == 1);



    const unpaidList = (this._employeeSalaries || []).filter(e => !e.is_paid_this_month);



    if (unpaidList.length === 0) {

        return this.toast(`كافة رواتب الموظفين لشهر (${curMonth}) تم صرفها بالكامل مسبقاً!`, 'info');

    }



    let totalBatch = 0;

    unpaidList.forEach(e => totalBatch += (parseFloat(e.estimated_net) || 0));



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">⚡ اعتماد وصرف مسير الرواتب دفعة واحدة (${curMonth})</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <form onsubmit="App.submitBatchSalaries(event)">

            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">

                <input type="hidden" id="batch-month-year" value="${curMonth}" />



                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px; margin-bottom:16px;">

                    <div style="font-size:13px; color:#166534; font-weight:700; margin-bottom:4px;">

                        ملخص المسير المراد صرفه:

                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">

                        <div>

                            <span>عدد الموظفين بانتظار الصرف: <b>${unpaidList.length}</b> موظف</span>

                        </div>

                        <div style="font-size:18px; font-weight:700; color:#15803d; font-family:monospace;">

                            ${App.formatMoney(totalBatch)}

                        </div>

                    </div>

                </div>



                <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:8px;">قائمة الموظفين في هذا المسير:</div>

                <div style="border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin-bottom:14px; max-height:200px; overflow-y:auto;">

                    <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">

                        <thead>

                            <tr style="background:#f1f5f9; text-align:right;">

                                <th style="padding:6px 10px;">الموظف</th>

                                <th style="padding:6px 10px;">الأساسي</th>

                                <th style="padding:6px 10px;">البدلات</th>

                                <th style="padding:6px 10px; text-align:left;">صافي الصرف</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${unpaidList.map(e => `

                                <tr style="border-bottom:1px solid #f1f5f9;">

                                    <td style="padding:6px 10px; font-weight:600;">${this.escape(e.employee_name)}</td>

                                    <td style="padding:6px 10px; font-family:monospace;">${App.formatMoney(e.basic_salary)}</td>

                                    <td style="padding:6px 10px; font-family:monospace; color:#059669;">+${App.formatMoney(e.total_allowances)}</td>

                                    <td style="padding:6px 10px; text-align:left; font-family:monospace; font-weight:700; color:#2563eb;">${App.formatMoney(e.estimated_net)}</td>

                                </tr>

                            `).join('')}

                        </tbody>

                    </table>

                </div>



                <div style="display:flex; gap:12px; margin-bottom:14px;">

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">حساب / صندوق الصرف النقدي *</label>

                        <select id="batch-account" class="mt-select" style="width:100%;">

                            ${cashAccounts.map(a => `<option value="${a.id}">[${a.account_code}] ${this.escape(a.name_ar)}</option>`).join('')}

                        </select>

                    </div>

                    <div style="flex:1;">

                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">تاريخ الصرف:</label>

                        <input type="date" id="batch-date" class="mt-input" style="width:100%;" value="${today}" required />

                    </div>

                </div>



                <div class="form-group" style="margin-bottom:10px;">

                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">البيان والملاحظات العامة للمسير:</label>

                    <input type="text" id="batch-notes" class="mt-input" style="width:100%;" value="اعتماد وصرف مسير رواتب شهر ${curMonth} بالكامل" />

                </div>

            </div>

            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">

                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                <button type="submit" class="mt-btn mt-btn-primary" id="btn-submit-batch" style="background:#16a34a; border-color:#15803d;">

                    ⚡ تأكيد وصرف المسير لـ (${unpaidList.length}) موظف

                </button>

            </div>

        </form>

    `;



    this.openModal(modalHtml, '680px');

};



App.submitBatchSalaries = async function(e) {

    e.preventDefault();

    const btn = document.getElementById('btn-submit-batch');

    if (btn) btn.disabled = true;



    const payload = {

        month_year: document.getElementById('batch-month-year').value,

        payment_date: document.getElementById('batch-date').value,

        payment_account_id: document.getElementById('batch-account').value || 21,

        notes: document.getElementById('batch-notes').value.trim()

    };



    const res = await this.api('pay_batch_salaries', payload);

    if (btn) btn.disabled = false;



    if (!res || !res.success) {

        return this.toast(res?.error || 'فشل صرف المسير دفعة واحدة', 'danger');

    }



    this.toast(res.message || 'تم بنجاح اعتماد وصرف المسير وترحيل القيود المزدوجة!', 'success');

    this.closeModal();

    this.loadSalariesData();

};



// --- SALARY PAYMENTS LOG / ARCHIVE MODAL ---

App.openSalaryPaymentsLogModal = async function() {

    const res = await this.api('get_salary_payments', { limit: 100 });

    const payments = res?.payments || [];



    const modalHtml = `

        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">

            <span style="font-weight:700; font-size:15px; color:#0f172a;">📜 سجل وأرشيف سندات صرف رواتب الموظفين</span>

            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>

        </div>

        <div class="mt-modal-body" style="padding:15px; max-height:75vh; overflow-y:auto;">

            <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:12px;">

                <thead>

                    <tr style="background:#f1f5f9; text-align:right;">

                        <th style="padding:8px 10px;">رقم السند</th>

                        <th style="padding:8px 10px;">الموظف</th>

                        <th style="padding:8px 10px;">شهر المسير</th>

                        <th style="padding:8px 10px;">تاريخ الصرف</th>

                        <th style="padding:8px 10px; text-align:left;">الصافي المصروف</th>

                        <th style="padding:8px 10px;">حساب الصرف</th>

                        <th style="padding:8px 10px; text-align:center;">القيد المحاسبي</th>

                        <th style="padding:8px 10px; text-align:center;">طباعة</th>

                    </tr>

                </thead>

                <tbody>

                    ${payments.length > 0 ? payments.map(p => `

                        <tr style="border-bottom:1px solid #f1f5f9;">

                            <td style="padding:8px 10px; font-family:monospace; font-weight:700;" dir="ltr">#${this.escape(p.payment_no)}</td>

                            <td style="padding:8px 10px; font-weight:600;">${this.escape(p.employee_name)}</td>

                            <td style="padding:8px 10px; font-family:monospace; color:#2563eb;">${this.escape(p.month_year)}</td>

                            <td style="padding:8px 10px; color:#64748b;">${this.escape(p.payment_date)}</td>

                            <td style="padding:8px 10px; text-align:left; font-family:monospace; font-weight:700; color:#16a34a;">${App.formatMoney(p.net_salary)}</td>

                            <td style="padding:8px 10px; font-size:11px; color:#64748b;">${this.escape(p.payment_account_name || 'الصندوق')}</td>

                            <td style="padding:8px 10px; text-align:center;">

                                <span style="background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:4px; font-family:monospace; font-size:11px;">

                                    ${this.escape(p.journal_entry_no || ('JE-' + p.journal_entry_id))}

                                </span>

                            </td>

                            <td style="padding:8px 10px; text-align:center;">

                                <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.printSalaryVoucher(${p.id})">🖨️</button>

                            </td>

                        </tr>

                    `).join('') : `<tr><td colspan="8" style="text-align:center; padding:25px; color:#94a3b8;">لا توجد سندات صرف رواتب مسجلة حتى الآن</td></tr>`}

                </tbody>

            </table>

        </div>

        <div class="mt-modal-footer" style="padding:10px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">

            <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>

        </div>

    `;



    this.openModal(modalHtml, '840px');

};



// --- PRINTABLE SALARY PAYSLIP / VOUCHER ---

App.printSalaryVoucher = async function(paymentId) {

    const res = await this.api('get_salary_payments', { limit: 100 });

    const p = (res?.payments || []).find(item => item.id == paymentId);

    if (!p) {

        return this.toast('تعذر العثور على بيانات سند الصرف للطباعة', 'danger');

    }



    const brand = this.brand || { name: 'منظومة إدارة شبكات المايكروتك واليوزر مانجر', phone: '' };



    const printHtml = `

        <div class="no-print" style="padding:10px 16px; background:#f1f5f9; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">

            <span style="font-weight:700; color:#0f172a;">🖨️ معاينة مسير وسند صرف الراتب</span>

            <div style="display:flex; gap:8px;">

                <button class="mt-btn mt-btn-primary" style="background:#2563eb; border-color:#1d4ed8;" onclick="window.print()">

                    🖨️ طباعة السند (Print Voucher)

                </button>

                <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>

            </div>

        </div>

        <div style="padding:30px; background:#fff; color:#0f172a; font-family:'Cairo', sans-serif;" id="printable-salary-voucher">

            <!-- HEADER -->

            <div style="border-bottom:2px solid #0f172a; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-start;">

                <div>

                    <h2 style="margin:0 0 6px 0; font-size:18px; color:#1e293b;">${this.escape(brand.name || 'الشبكة')}</h2>

                    <div style="font-size:12px; color:#64748b;">قسم الشؤون المالية والموارد البشرية</div>

                    <div style="font-size:12px; color:#64748b;">هاتف الشبكة: ${this.escape(brand.phone || '777000000')}</div>

                </div>

                <div style="text-align:left;">

                    <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; display:inline-block;">

                        <div style="font-size:11px; color:#64748b;">رقم سند الصرف:</div>

                        <div style="font-size:14px; font-weight:700; font-family:monospace;" dir="ltr">${this.escape(p.payment_no)}</div>

                    </div>

                    <div style="font-size:12px; color:#64748b; margin-top:6px;">تاريخ الصرف: ${this.escape(p.payment_date)}</div>

                </div>

            </div>



            <!-- TITLE -->

            <div style="text-align:center; margin-bottom:20px;">

                <h3 style="margin:0; font-size:17px; background:#eff6ff; display:inline-block; padding:4px 20px; border-radius:20px; border:1px solid #bfdbfe; color:#1d4ed8;">

                    سند صرف راتب شهري (Salary Payment Voucher)

                </h3>

                <div style="font-size:13px; color:#475569; margin-top:4px;">عن استحقاق شهر: <b>${this.escape(p.month_year)}</b></div>

            </div>



            <!-- EMPLOYEE INFO -->

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:20px; display:flex; justify-content:space-between;">

                <div>

                    <div style="font-size:12px; color:#64748b;">اسم الموظف المستلم:</div>

                    <div style="font-size:16px; font-weight:700; color:#0f172a;">${this.escape(p.employee_name)}</div>

                </div>

                <div>

                    <div style="font-size:12px; color:#64748b;">حساب الصرف:</div>

                    <div style="font-size:14px; font-weight:600; color:#334155;">${this.escape(p.payment_account_name || 'الصندوق الرئيسي')}</div>

                </div>

                <div>

                    <div style="font-size:12px; color:#64748b;">رقم القيد المحاسبي المزدوج:</div>

                    <div style="font-size:14px; font-weight:700; color:#2563eb; font-family:monospace;">${this.escape(p.journal_entry_no || ('JE-' + p.journal_entry_id))}</div>

                </div>

            </div>



            <!-- SALARY BREAKDOWN TABLE -->

            <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px; border:1px solid #cbd5e1;">

                <thead>

                    <tr style="background:#f1f5f9; text-align:right;">

                        <th style="padding:10px; border:1px solid #cbd5e1;">البند</th>

                        <th style="padding:10px; border:1px solid #cbd5e1; text-align:left; width:180px;">المبلغ (YER)</th>

                    </tr>

                </thead>

                <tbody>

                    <tr>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1;">الراتب الأساسي</td>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; text-align:left; font-family:monospace; font-weight:600;">${App.formatMoney(p.basic_salary)}</td>

                    </tr>

                    <tr>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1;">إجمالي البدلات والمكافآت</td>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; text-align:left; font-family:monospace; color:#059669;">+${App.formatMoney(p.total_allowances)}</td>

                    </tr>

                    <tr>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; color:#dc2626;">استقطاع سلف وعهد سابقة (حساب 1302)</td>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; text-align:left; font-family:monospace; color:#dc2626;">-${App.formatMoney(p.advances_deduction)}</td>

                    </tr>

                    <tr>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; color:#dc2626;">استقطاعات وجزاءات أخرى</td>

                        <td style="padding:8px 10px; border:1px solid #cbd5e1; text-align:left; font-family:monospace; color:#dc2626;">-${App.formatMoney(p.penalties_deduction)}</td>

                    </tr>

                </tbody>

                <tfoot>

                    <tr style="background:#eff6ff; font-weight:700; font-size:15px;">

                        <td style="padding:10px; border:1px solid #cbd5e1; color:#1e40af;">صافي المبلغ المصروف والمستلم فعلياً:</td>

                        <td style="padding:10px; border:1px solid #cbd5e1; text-align:left; font-family:monospace; color:#1d4ed8;">${App.formatMoney(p.net_salary)}</td>

                    </tr>

                </tfoot>

            </table>



            <!-- SIGNATURES -->

            <div style="display:flex; justify-content:space-between; margin-top:40px; padding-top:20px;">

                <div style="text-align:center; width:200px;">

                    <div style="font-weight:700; font-size:13px; color:#334155;">إعداد وتوقيع المحاسب:</div>

                    <div style="height:45px;"></div>

                    <div style="border-top:1px dashed #94a3b8; font-size:12px; color:#64748b; padding-top:4px;">${this.escape(p.payer_name || 'المحاسب المالي')}</div>

                </div>

                <div style="text-align:center; width:200px;">

                    <div style="font-weight:700; font-size:13px; color:#334155;">اعتماد المدير المالي:</div>

                    <div style="height:45px;"></div>

                    <div style="border-top:1px dashed #94a3b8; font-size:12px; color:#64748b; padding-top:4px;">الإدارة العامة</div>

                </div>

                <div style="text-align:center; width:200px;">

                    <div style="font-weight:700; font-size:13px; color:#334155;">توقيع واستلام الموظف:</div>

                    <div style="height:45px;"></div>

                    <div style="border-top:1px dashed #94a3b8; font-size:12px; color:#64748b; padding-top:4px;">${this.escape(p.employee_name)}</div>

                </div>

            </div>

        </div>

    `;



    this.openModal(printHtml, '700px');

};




// ==========================================

// ==========================================
// EXCHANGE RATES & MULTI-CURRENCY MODULE
// ==========================================
Object.assign(window.App, {
    _exchangeRates: null,
    _baseCurrency: 'YER_SANAA',

    async renderExchangeRates() {
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        const PB = window.SamUI?.PageBuilder;

        const res = await this.api('get_exchange_rates');
        const rates = (res && (res.rates || res.data)) ? (res.rates || res.data) : [];
        const baseCode = (res && res.base_currency) ? res.base_currency : (rates.find(r => Number(r.is_base_currency || r.is_base) === 1)?.currency_code || 'YER_SANAA');

        this._exchangeRates = rates;
        this._baseCurrency = baseCode;

        const baseRateObj = rates.find(r => r.currency_code === baseCode) || { currency_code: baseCode, currency_name: 'ريال يمني (صنعاء)', symbol: 'ر.ي', exchange_rate: 1 };
        
        const currencyFlags = {
            'YER_SANAA': '🇾🇪',
            'YER_ADEN': '🇾🇪',
            'SAR': '🇸🇦',
            'USD': '🇺🇸',
            'EUR': '🇪🇺',
            'AED': '🇦🇪',
            'OMR': '🇴🇲',
            'QAR': '🇶🇦',
            'KWD': '🇰🇼'
        };

        const activeCount = rates.filter(r => Number(r.is_active) === 1).length;

        const actions = [
            { label: '⭐ تغيير العملة الأساسية', variant: 'warning', onclick: 'App.showSetBaseCurrencyModal()' },
            { label: '🔄 آلة التحويل المباشر', variant: 'primary', onclick: 'App.showCurrencyConverterModal()' },
            { label: '➕ إضافة / تحديث عملة', variant: 'success', onclick: 'App.showEditExchangeRateModal()' },
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderExchangeRates()' }
        ];

        const stats = [
            { label: 'العملة المرجعية الأساسية', value: `${this.escape(baseRateObj.currency_name)} (${baseCode})`, icon: '⭐', tone: 'green' },
            { label: 'إجمالي العملات المعرفة', value: `${rates.length} عملة`, icon: '💱', tone: 'blue' },
            { label: 'العملات النشطة بالخدمة', value: `${activeCount} عملة`, icon: '✓', tone: 'purple' },
            { label: 'نظام التحويل والربط', value: 'لحظي وتلقائي', icon: '⚡', tone: 'cyan' }
        ];

        const cardsHtml = rates.map(r => {
            const flag = currencyFlags[r.currency_code] || '💱';
            const isBase = (r.currency_code === baseCode || Number(r.is_base_currency || r.is_base) === 1);
            const rate = parseFloat(r.exchange_rate || r.exchange_rate_to_base || 1);
            const isActive = (Number(r.is_active) === 1);
            const sym = r.currency_symbol || r.symbol || r.currency_code;
            
            let rateDisplay = '';
            let inverseDisplay = '';
            if (isBase) {
                rateDisplay = `<span style="color:#059669; font-weight:800; font-size:15px;">⭐ العملة المرجعية الأساسية للنظام (1.00)</span>`;
                inverseDisplay = `<span style="color:#64748b; font-size:12px;">جميع قيود اليومية، الأرباح، وفواتير النظام تقيّد بهذه العملة</span>`;
            } else if (rate >= 1) {
                rateDisplay = `<b>1 ${this.escape(r.currency_code)}</b> = <span style="color:#2563eb; font-weight:800; font-size:18px;">${App.formatMoney(rate)}</span> <small style="font-weight:600; color:#475569;">${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'}</small>`;
                const inv = rate > 0 ? (1000 / rate).toFixed(2) : '0.00';
                inverseDisplay = `1,000 ${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'} = <b>${inv}</b> ${sym}`;
            } else {
                const rate1k = (rate * 1000).toFixed(2);
                const rate100k = (rate * 100000).toFixed(0);
                rateDisplay = `<b>1,000 ${this.escape(sym)}</b> = <span style="color:#2563eb; font-weight:800; font-size:18px;">${App.formatMoney(rate1k)}</span> <small style="font-weight:600; color:#475569;">${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'}</small>`;
                inverseDisplay = `100,000 ${sym} = <b>${App.formatMoney(rate100k)}</b> ${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'}`;
            }

            return `
                <div class="sam-card mt-card" style="margin:0; border-top: 4px solid ${isBase ? '#10b981' : (isActive ? '#3b82f6' : '#94a3b8')}; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.06); border-radius:12px; overflow:hidden; background:var(--card-bg, #fff);">
                    <div class="mt-card-body" style="padding:18px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:32px; line-height:1;">${flag}</span>
                                <div>
                                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#1e293b;">${this.escape(r.currency_name)}</h3>
                                    <div style="font-size:12px; color:#64748b; font-family:monospace; margin-top:2px;">${this.escape(r.currency_code)} (${this.escape(sym)})</div>
                                </div>
                            </div>
                            <div>
                                ${isBase 
                                    ? `<span class="status-pill status-active" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-size:11px; font-weight:700;">⭐ الأساس</span>`
                                    : (isActive 
                                        ? `<span class="status-pill status-active" style="font-size:11px;">✓ نشطة</span>` 
                                        : `<span class="status-pill status-disabled" style="font-size:11px;">⛔ معطلة</span>`
                                      )
                                }
                            </div>
                        </div>

                        <div style="background:#f8fafc; border-radius:8px; padding:12px 14px; margin-bottom:14px; border:1px solid #e2e8f0;">
                            <div style="font-size:14px; margin-bottom:4px;">${rateDisplay}</div>
                            <div style="font-size:11.5px; color:#64748b;">${inverseDisplay}</div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#94a3b8; border-top:1px dashed #e2e8f0; padding-top:10px; flex-wrap:wrap; gap:6px;">
                            <div>آخر تحديث: ${r.last_updated_at ? r.last_updated_at.split(' ')[0] : (r.updated_at ? r.updated_at.split(' ')[0] : 'أولي')}</div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <button class="sam-btn sam-btn--sm" style="padding:3px 8px; font-size:11px;" onclick="App.showCurrencyConverterModal('${r.currency_code}', '${baseCode}', 100)">🔄 تحويل</button>
                                <button class="sam-btn sam-btn--sm sam-btn--primary" style="padding:3px 8px; font-size:11px;" onclick="App.showEditExchangeRateModal('${r.currency_code}')">✏️ تعديل السعر</button>
                                ${!isBase ? `<button class="sam-btn sam-btn--sm sam-btn--warning" style="padding:3px 8px; font-size:11px; font-weight:700;" onclick="App.showSetBaseCurrencyModal('${r.currency_code}')">⭐ تعيين كأساسية</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const pageContent = `
            <!-- CURRENCIES CARDS GRID -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:16px; margin-bottom:24px;">
                ${cardsHtml}
            </div>

            <!-- INTERACTIVE CONVERTER & SYSTEM RULES ROW -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:20px; margin-bottom:24px;">
                <!-- LIVE CONVERTER CARD -->
                <div class="sam-card mt-card" style="margin:0; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); background:var(--card-bg, #fff);">
                    <div class="mt-card-header" style="background:#f8fafc; font-weight:700; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:6px; padding:12px 16px;">
                        <span>⚡</span> محول العملات اللحظي السريع
                    </div>
                    <div class="mt-card-body" style="padding:18px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                            <div>
                                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#475569;">المبلغ المراد تحويله:</label>
                                <input type="number" id="quick-conv-amount" class="sam-input mt-input" value="100" min="0" step="any" style="width:100%; font-size:16px; font-weight:700; font-family:monospace;" oninput="App.calcQuickCurrencyConvert()" />
                            </div>
                            <div>
                                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#475569;">من عملة:</label>
                                <select id="quick-conv-from" class="sam-select mt-select" style="width:100%; font-weight:600;" onchange="App.calcQuickCurrencyConvert()">
                                    ${rates.map(r => `<option value="${r.currency_code}" ${r.currency_code === 'SAR' ? 'selected' : ''}>${r.currency_name} (${r.currency_code})</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:center; margin:-6px 0 8px 0;">
                            <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 14px; font-size:12px; border-radius:20px;" onclick="App.swapQuickConverterCurrencies()">
                                ⇅ تبديل العملتين
                            </button>
                        </div>

                        <div style="margin-bottom:16px;">
                            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#475569;">إلى عملة:</label>
                            <select id="quick-conv-to" class="sam-select mt-select" style="width:100%; font-weight:600;" onchange="App.calcQuickCurrencyConvert()">
                                ${rates.map(r => `<option value="${r.currency_code}" ${r.currency_code === baseCode ? 'selected' : ''}>${r.currency_name} (${r.currency_code})</option>`).join('')}
                            </select>
                        </div>

                        <div id="quick-conv-result" style="background:linear-gradient(135deg, #1e3a8a, #3b82f6); color:#fff; border-radius:10px; padding:16px; text-align:center;">
                            <!-- Calculated via JS below -->
                        </div>
                    </div>
                </div>

                <!-- ACCOUNTING RULES / INFO CARD -->
                <div class="sam-card mt-card" style="margin:0; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); background:var(--card-bg, #fff);">
                    <div class="mt-card-header" style="background:#f8fafc; font-weight:700; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:6px; padding:12px 16px;">
                        <span>📋</span> مبادئ وضوابط تعدد العملات في النظام
                    </div>
                    <div class="mt-card-body" style="padding:18px; font-size:13px; line-height:1.7; color:#334155;">
                        <ul style="padding-right:20px; margin:0 0 14px 0;">
                            <li style="margin-bottom:8px;">
                                <b>العملة المرجعية الأساسية:</b> جميع القيود المحاسبية المزدوجة، شجرة الحسابات، الأرباح، وقوائم الدخل (P&L) تُقيد وتُعرض بالعملة الأساسية (<b>${this.escape(baseRateObj.currency_name)}</b>).
                            </li>
                            <li style="margin-bottom:8px;">
                                <b>تغيير العملة الأساسية:</b> عند اختيار عملة أساسية جديدة (مثل الريال السعودي أو ريال عدن)، يقوم النظام تلقائياً بإعادة احتساب أسعار باقي العملات بدقة عالية نسبةً للعملة الجديدة.
                            </li>
                            <li style="margin-bottom:8px;">
                                <b>تحديث وتعديل الأسعار:</b> يمكنك تعديل أسعار الشراء والبيع والتحويل لأي عملة في أي وقت بمجرد الضغط على زر <b>[ ✏️ تعديل السعر ]</b>.
                            </li>
                        </ul>
                        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:10px 12px; font-size:12px; color:#1e40af;">
                            💡 <b>العمليات السابقة:</b> الفواتير والسندات التاريخية السابقة تظل مقيدة بأسعار صرفها المسجلة عند تنفيذ العملية للحفاظ على سلامة القيود والأرباح.
                        </div>
                    </div>
                </div>
            </div>

            <!-- DETAILED RATES TABLE -->
            <div class="sam-card mt-card" style="margin:0; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden; background:var(--card-bg, #fff);">
                <div class="mt-card-header" style="background:#f8fafc; font-weight:700; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:12px 16px;">
                    <span>📊 جدول تفاصيل العملات وأسعار الصرف المعتمدة</span>
                    <span style="font-size:12px; font-weight:normal; color:#64748b;">العملة الأساسية: <b style="color:#059669;">${this.escape(baseRateObj.currency_name)}</b> | إجمالي العملات: <b>${rates.length}</b></span>
                </div>
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table" style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f1f5f9; text-align:right;">
                                <th>#</th>
                                <th>رمز العملة</th>
                                <th>اسم العملة</th>
                                <th>الرمز</th>
                                <th>سعر الصرف للأساس</th>
                                <th>المعادلة الصريحة</th>
                                <th>النوع / الحالة</th>
                                <th>آخر تحديث</th>
                                <th style="text-align:center;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rates.map((r, idx) => {
                                const isBase = (r.currency_code === baseCode || Number(r.is_base_currency || r.is_base) === 1);
                                const rate = parseFloat(r.exchange_rate || r.exchange_rate_to_base || 1);
                                const isActive = (Number(r.is_active) === 1);
                                const flag = currencyFlags[r.currency_code] || '💱';
                                const sym = r.currency_symbol || r.symbol || r.currency_code;

                                return `
                                    <tr style="${!isActive ? 'opacity:0.6;' : ''} ${isBase ? 'background:#f0fdf4;' : ''}">
                                        <td>${idx + 1}</td>
                                        <td>
                                            <span style="font-size:16px; margin-left:6px;">${flag}</span>
                                            <b style="font-family:monospace; font-size:13px;">${this.escape(r.currency_code)}</b>
                                        </td>
                                        <td><b>${this.escape(r.currency_name)}</b></td>
                                        <td><span class="badge" style="background:#e2e8f0; color:#334155; font-size:11px; padding:2px 8px; border-radius:4px;">${this.escape(sym)}</span></td>
                                        <td>
                                            <b style="font-family:monospace; font-size:14px; color:${isBase ? '#059669' : '#2563eb'};">${rate}</b>
                                        </td>
                                        <td style="font-size:12.5px;">
                                            ${isBase 
                                                ? `<span style="color:#059669; font-weight:700;">1 ${sym} = 1 ${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'} (الأساس)</span>` 
                                                : (rate >= 1 
                                                    ? `1 ${sym} = <b>${App.formatMoney(rate)}</b> ${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'}` 
                                                    : `1,000 ${sym} = <b>${App.formatMoney((rate * 1000).toFixed(2))}</b> ${baseRateObj.currency_symbol || baseRateObj.symbol || 'ر.ي'}`
                                                  )
                                            }
                                        </td>
                                        <td>
                                            ${isBase 
                                                ? `<span class="status-pill status-active" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700;">⭐ العملة الأساسية</span>` 
                                                : (isActive 
                                                    ? `<span class="status-pill status-active">✓ نشط</span>` 
                                                    : `<span class="status-pill status-disabled">معطل</span>`
                                                  )
                                            }
                                        </td>
                                        <td style="font-size:12px; color:#64748b;">${r.last_updated_at || r.updated_at || 'تلقائي'}</td>
                                        <td style="text-align:center;">
                                            <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                                                <button class="sam-btn sam-btn--sm sam-btn--primary" style="padding:3px 8px; font-size:11px;" onclick="App.showEditExchangeRateModal('${r.currency_code}')">
                                                    ✏️ تعديل السعر
                                                </button>
                                                ${!isBase ? `
                                                    <button class="sam-btn sam-btn--sm sam-btn--warning" style="padding:3px 8px; font-size:11px; font-weight:700;" onclick="App.showSetBaseCurrencyModal('${r.currency_code}')">
                                                        ⭐ تعيين كأساسية
                                                    </button>
                                                ` : ''}
                                                <button class="sam-btn sam-btn--sm" style="padding:3px 8px; font-size:11px;" onclick="App.showCurrencyConverterModal('${r.currency_code}', '${baseCode}', 100)">
                                                    🔄 تحويل
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="9" style="text-align:center; padding:30px;">لا توجد عملات مهيأة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const shell = PB ? PB.renderShell({
            id: 'exchange-rates',
            archetype: 'table',
            title: 'أسعار الصرف وتعدد العملات',
            subtitle: `العملة الأساسية للنظام: ${baseRateObj.currency_name} (${baseCode}) — تعديل أسعار العملات الأجنبية والتحويل الفوري`,
            eyebrow: 'المالية والمحاسبة',
            icon: '💱',
            actions,
            stats,
            content: pageContent
        }) : `
            <div class="sam-page-shell">
                ${pageContent}
            </div>
        `;

        mainView.innerHTML = shell;
        this.calcQuickCurrencyConvert();
    },

    calcQuickCurrencyConvert() {
        const amountInput = document.getElementById('quick-conv-amount');
        const fromSelect = document.getElementById('quick-conv-from');
        const toSelect = document.getElementById('quick-conv-to');
        const resDiv = document.getElementById('quick-conv-result');

        if (!amountInput || !fromSelect || !toSelect || !resDiv) return;

        const amount = parseFloat(amountInput.value) || 0;
        const fromCode = fromSelect.value;
        const toCode = toSelect.value;

        const rates = this._exchangeRates || [];
        const baseCode = this._baseCurrency || 'YER_SANAA';

        const fromObj = rates.find(r => r.currency_code === fromCode) || { exchange_rate: 1, symbol: fromCode, currency_name: fromCode };
        const toObj = rates.find(r => r.currency_code === toCode) || { exchange_rate: 1, symbol: toCode, currency_name: toCode };

        const fromRate = parseFloat(fromObj.exchange_rate || fromObj.exchange_rate_to_base || 1);
        const toRate = parseFloat(toObj.exchange_rate || toObj.exchange_rate_to_base || 1);

        const effectiveRate = toRate > 0 ? (fromRate / toRate) : 0;
        const convertedAmount = amount * effectiveRate;
        const fromSym = fromObj.currency_symbol || fromObj.symbol || fromCode;
        const toSym = toObj.currency_symbol || toObj.symbol || toCode;

        resDiv.innerHTML = `
            <div style="font-size:13px; opacity:0.9; margin-bottom:4px;">
                ${amount.toLocaleString()} ${fromSym} (${fromObj.currency_name}) يعادل:
            </div>
            <div style="font-size:26px; font-weight:800; font-family:monospace; letter-spacing:0.5px; margin-bottom:6px;">
                ${App.formatMoney(convertedAmount)} <span style="font-size:18px;">${toSym}</span>
            </div>
            <div style="font-size:11.5px; opacity:0.85; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;">
                معامل التحويل: 1 ${fromSym} = <b>${effectiveRate < 0.01 ? effectiveRate.toFixed(6) : effectiveRate.toFixed(4)}</b> ${toSym}
            </div>
        `;
    },

    swapQuickConverterCurrencies() {
        const fromSelect = document.getElementById('quick-conv-from');
        const toSelect = document.getElementById('quick-conv-to');
        if (!fromSelect || !toSelect) return;
        const tmp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tmp;
        this.calcQuickCurrencyConvert();
    },

    async showEditExchangeRateModal(currencyCode = null) {
        const rates = this._exchangeRates || (await this.api('get_exchange_rates'))?.rates || [];
        const baseCode = this._baseCurrency || 'YER_SANAA';

        let curr = null;
        if (currencyCode) {
            curr = rates.find(r => r.currency_code === currencyCode);
        }

        const isEdit = !!curr;
        const isBase = curr && (curr.currency_code === baseCode || Number(curr.is_base_currency || curr.is_base) === 1);

        const codeVal = isEdit ? curr.currency_code : '';
        const nameVal = isEdit ? curr.currency_name : '';
        const symbolVal = isEdit ? (curr.currency_symbol || curr.symbol || '') : '';
        const rateVal = isEdit ? (curr.exchange_rate || curr.exchange_rate_to_base || 1.0) : '1.0';
        const activeVal = isEdit ? (Number(curr.is_active) === 1) : true;

        const baseObj = rates.find(r => r.currency_code === baseCode) || { currency_name: 'ريال يمني (صنعاء)', symbol: 'ر.ي' };

        document.getElementById('modal-container').innerHTML = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:540px; border-radius:12px; overflow:hidden;">
                    <div class="mt-modal-header" style="background:#2563eb; color:#fff;">
                        <span>${isEdit ? `✏️ تعديل بيانات وسعر [ ${this.escape(curr.currency_name)} (${codeVal}) ]` : '➕ إضافة / ضبط عملة جديدة'}</span>
                        <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                    </div>
                    <form onsubmit="App.saveExchangeRateSubmit(event, '${codeVal}')">
                        <div class="mt-modal-body" style="padding:20px;">
                            
                            ${isBase ? `
                                <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; margin-bottom:16px; font-size:12.5px; color:#065f46;">
                                    ⭐ <b>هذه هي العملة الأساسية الحالية للنظام (${this.escape(curr.currency_name)}):</b><br>
                                    سعر صرفها مقابل نفسها ثابت دائماً (1.00). يمكنك تعديل الاسم والرمز المختصر هنا، أو تعيين عملة أخرى كأساسية من زر "تعيين كأساسية".
                                </div>
                            ` : `
                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:16px; font-size:12.5px; color:#475569;">
                                    ℹ️ <b>آلية تحديد السعر:</b> أدخل قيمة وحدة واحدة من هذه العملة مقابل العملة الأساسية للنظام (<b>${this.escape(baseObj.currency_name)}</b>).<br>
                                    مثال: إذا كان 1 ريال سعودي = 141.5 ${baseObj.symbol || 'ر.ي'}، أدخل <b>141.5</b>.<br>
                                    مثال: إذا كانت عملة عدن و 1000 عدن = 285.7 صنعاء، أدخل <b>0.285714</b>.
                                </div>
                            `}

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                <div>
                                    <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">رمز العملة (Code):</label>
                                    <input type="text" id="er-code" class="mt-input" required value="${this.escape(codeVal)}" ${isEdit ? 'readonly style="background:#f1f5f9;"' : ''} placeholder="SAR, USD, YER_ADEN..." />
                                </div>
                                <div>
                                    <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">الرمز المختصر (Symbol):</label>
                                    <input type="text" id="er-symbol" class="mt-input" required value="${this.escape(symbolVal)}" placeholder="ر.س, $, ر.ي..." />
                                </div>
                            </div>

                            <div style="margin-bottom:12px;">
                                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">اسم العملة الكامل:</label>
                                <input type="text" id="er-name" class="mt-input" required value="${this.escape(nameVal)}" placeholder="ريال سعودي، دولار أمريكي، ريال يمني..." />
                            </div>

                            <div style="margin-bottom:16px;">
                                <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:#1e40af;">
                                    سعر الصرف مقابل العملة الأساسية (${this.escape(baseObj.currency_name)}):
                                </label>
                                <input type="number" id="er-rate" class="mt-input" required min="0.00000001" step="any" value="${rateVal}" ${isBase ? 'readonly style="background:#f1f5f9; color:#059669;"' : 'style="font-size:16px; font-weight:700; font-family:monospace; color:#2563eb;"'} oninput="App.previewRateCalc(this.value)" />
                                <div id="er-preview-calc" style="font-size:12px; color:#059669; font-weight:600; margin-top:4px;"></div>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:8px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600;">
                                    <input type="checkbox" id="er-active" ${activeVal ? 'checked' : ''} ${isBase ? 'disabled checked' : ''} />
                                    <span>تفعيل العملة وإتاحتها في شاشات المبيعات وسندات القبض</span>
                                </label>

                                ${!isBase && isEdit ? `
                                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:700; color:#b45309;">
                                        <input type="checkbox" id="er-make-base" />
                                        <span>⭐ تعيين هذه العملة كالعملة الأساسية المرجعية للنظام</span>
                                    </label>
                                ` : ''}
                            </div>

                        </div>
                        <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                ${!isBase && isEdit ? `
                                    <button type="button" class="mt-btn mt-btn-warning" style="font-size:12px; font-weight:700;" onclick="App.showSetBaseCurrencyModal('${codeVal}')">
                                        ⭐ تعيين كأساسية فوراً
                                    </button>
                                ` : ''}
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                                <button type="submit" class="mt-btn mt-btn-primary" id="btn-save-er">💾 حفظ التعديلات</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.previewRateCalc(rateVal);
    },

    previewRateCalc(rateVal) {
        const p = document.getElementById('er-preview-calc');
        if (!p) return;
        const r = parseFloat(rateVal) || 0;
        const baseRates = this._exchangeRates || [];
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const baseObj = baseRates.find(x => x.currency_code === baseCode) || { currency_name: 'العملة الأساسية', symbol: 'ر.ي' };

        if (r > 0) {
            if (r >= 1) {
                p.innerHTML = `✓ التقدير: 100 وحدة = <b>${App.formatMoney((100 * r).toFixed(2))}</b> ${baseObj.currency_name} (${baseObj.symbol || ''})`;
            } else {
                p.innerHTML = `✓ التقدير: 100,000 وحدة = <b>${App.formatMoney((100000 * r).toFixed(2))}</b> ${baseObj.currency_name} (${baseObj.symbol || ''})`;
            }
        } else {
            p.innerHTML = '';
        }
    },

    async saveExchangeRateSubmit(e, existingCode) {
        e.preventDefault();
        const code = (existingCode || document.getElementById('er-code').value).trim().toUpperCase();
        const name = document.getElementById('er-name').value.trim();
        const symbol = document.getElementById('er-symbol').value.trim();
        const rate = parseFloat(document.getElementById('er-rate').value);
        const isActive = document.getElementById('er-active').checked ? 1 : 0;
        const makeBase = document.getElementById('er-make-base') ? document.getElementById('er-make-base').checked : false;

        if (!code || !name || isNaN(rate) || rate <= 0) {
            this.toast('يرجى تعبئة كافة الحقول والتأكد من إدخال سعر صحيح أكبر من الصفر', 'warning');
            return;
        }

        const btn = document.getElementById('btn-save-er');
        if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

        try {
            if (makeBase) {
                const baseRes = await this.api('set_base_currency', { currency_code: code, recalculate_rates: true }, 'POST');
                if (!baseRes || !baseRes.success) {
                    this.toast(baseRes?.error || 'فشل تعيين العملة الأساسية', 'danger');
                    return;
                }
            }

            const res = await this.api('save_exchange_rate', {
                currency_code: code,
                currency_name: name,
                currency_symbol: symbol,
                exchange_rate: rate,
                is_active: isActive
            }, 'POST');

            if (res && res.success) {
                this.toast(res.message || 'تم حفظ بيانات وسعر الصرف بنجاح', 'success');
                this.closeModal();
                this.renderExchangeRates();
            } else {
                this.toast(res?.error || 'فشل حفظ سعر الصرف', 'danger');
            }
        } catch (err) {
            this.toast('حدث خطأ أثناء الحفظ: ' + err.message, 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ التعديلات'; }
        }
    },

    async showSetBaseCurrencyModal(preselectedCode = null) {
        const rates = this._exchangeRates || (await this.api('get_exchange_rates'))?.rates || [];
        const currentBaseCode = this._baseCurrency || 'YER_SANAA';
        const currentBase = rates.find(r => r.currency_code === currentBaseCode) || { currency_code: currentBaseCode, currency_name: 'ريال يمني (صنعاء)' };

        const targetCode = preselectedCode || (rates.find(r => r.currency_code !== currentBaseCode)?.currency_code || 'SAR');

        document.getElementById('modal-container').innerHTML = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:520px; border-radius:12px; overflow:hidden;">
                    <div class="mt-modal-header" style="background:#b45309; color:#fff;">
                        <span>⭐ تعيين العملة المرجعية الأساسية للنظام</span>
                        <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                    </div>
                    <form onsubmit="App.setBaseCurrencySubmit(event)">
                        <div class="mt-modal-body" style="padding:20px;">
                            
                            <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:14px; margin-bottom:18px; font-size:13px; color:#92400e; line-height:1.6;">
                                ⚠️ <b>تنبيه مالي مهم:</b><br>
                                تغيير العملة الأساسية سيجعل العملة المختارة هي المرجع الأساسي (سعرها = 1.00) لجميع قيود اليومية المحاسبية الجديدة، حسابات الأرباح، والتقارير المالية.
                            </div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:16px;">
                                <div style="font-size:12px; color:#64748b;">العملة الأساسية الحالية:</div>
                                <div style="font-size:15px; font-weight:800; color:#0f172a; margin-top:2px;">
                                    ${this.escape(currentBase.currency_name)} (${this.escape(currentBase.currency_code)})
                                </div>
                            </div>

                            <div style="margin-bottom:18px;">
                                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px; color:#1e293b;">
                                    اختر العملة الأساسية الجديدة المراد اعتمادها:
                                </label>
                                <select id="set-base-select" class="mt-select" style="width:100%; font-size:15px; font-weight:700;" required>
                                    ${rates.map(r => `
                                        <option value="${r.currency_code}" ${r.currency_code === targetCode ? 'selected' : ''}>
                                            ${r.currency_name} (${r.currency_code}) — [السعر الحالي: ${r.exchange_rate || r.exchange_rate_to_base}]
                                        </option>
                                    `).join('')}
                                </select>
                            </div>

                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px;">
                                <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:12.5px; color:#1e40af; font-weight:600;">
                                    <input type="checkbox" id="set-base-recalc" checked style="margin-top:2px;" />
                                    <span>
                                        <b>إعادة احتساب أسعار باقي العملات تلقائياً بالنسبة للعملة الجديدة (موصى به)</b><br>
                                        <small style="color:#3b82f6; font-weight:normal;">سيتم تحويل مصفوفة الأسعار آلياً لتظل القيمة الشرائية لجميع العملات متطابقة تماماً بالنسبة للأساس الجديد.</small>
                                    </span>
                                </label>
                            </div>

                        </div>
                        <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px;">
                            <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                            <button type="submit" class="mt-btn mt-btn-warning" id="btn-set-base" style="font-weight:700;">⭐ تأكيد تعيين العملة الأساسية</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    async setBaseCurrencySubmit(e) {
        e.preventDefault();
        const code = document.getElementById('set-base-select').value;
        const recalc = document.getElementById('set-base-recalc').checked;

        if (!code) return;

        const btn = document.getElementById('btn-set-base');
        if (btn) { btn.disabled = true; btn.textContent = 'جاري التعيين والتحديث...'; }

        try {
            const res = await this.api('set_base_currency', {
                currency_code: code,
                recalculate_rates: recalc
            }, 'POST');

            if (res && res.success) {
                this.toast(res.message || 'تم تعيين العملة الأساسية بنجاح!', 'success');
                this.closeModal();
                this.renderExchangeRates();
            } else {
                this.toast(res?.error || 'فشل تغيير العملة الأساسية', 'danger');
            }
        } catch (err) {
            this.toast('حدث خطأ أثناء تعيين العملة: ' + err.message, 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⭐ تأكيد تعيين العملة الأساسية'; }
        }
    },

    async showCurrencyConverterModal(defaultFrom = 'SAR', defaultTo = null, defaultAmount = 100) {
        const rates = this._exchangeRates || (await this.api('get_exchange_rates'))?.rates || [];
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const targetTo = defaultTo || baseCode;

        document.getElementById('modal-container').innerHTML = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:480px; border-radius:12px; overflow:hidden;">
                    <div class="mt-modal-header" style="background:#1e3a8a; color:#fff;">
                        <span>🔄 آلة تحويل العملات المالية المباشرة</span>
                        <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                    </div>
                    <div class="mt-modal-body" style="padding:20px;">
                        
                        <div style="margin-bottom:14px;">
                            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">المبلغ:</label>
                            <input type="number" id="modal-conv-amount" class="mt-input" value="${defaultAmount}" min="0" step="any" style="width:100%; font-size:18px; font-weight:700; font-family:monospace;" oninput="App.calcModalCurrencyConvert()" />
                        </div>

                        <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:10px; align-items:center; margin-bottom:18px;">
                            <div>
                                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">من عملة:</label>
                                <select id="modal-conv-from" class="mt-select" style="width:100%; font-weight:600;" onchange="App.calcModalCurrencyConvert()">
                                    ${rates.map(r => `<option value="${r.currency_code}" ${r.currency_code === defaultFrom ? 'selected' : ''}>${r.currency_name} (${r.currency_code})</option>`).join('')}
                                </select>
                            </div>
                            <div style="padding-top:18px;">
                                <button type="button" class="mt-btn" style="padding:6px 10px; border-radius:50%; font-size:14px;" onclick="App.swapModalConverterCurrencies()">⇄</button>
                            </div>
                            <div>
                                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">إلى عملة:</label>
                                <select id="modal-conv-to" class="mt-select" style="width:100%; font-weight:600;" onchange="App.calcModalCurrencyConvert()">
                                    ${rates.map(r => `<option value="${r.currency_code}" ${r.currency_code === targetTo ? 'selected' : ''}>${r.currency_name} (${r.currency_code})</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div id="modal-conv-result" style="background:linear-gradient(135deg, #1e3a8a, #2563eb); color:#fff; border-radius:10px; padding:18px; text-align:center; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                            <!-- Calculated via JS below -->
                        </div>

                    </div>
                    <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">
                        <button type="button" class="mt-btn mt-btn-primary" onclick="App.closeModal()">إغلاق</button>
                    </div>
                </div>
            </div>
        `;

        this.calcModalCurrencyConvert();
    },

    calcModalCurrencyConvert() {
        const amountInput = document.getElementById('modal-conv-amount');
        const fromSelect = document.getElementById('modal-conv-from');
        const toSelect = document.getElementById('modal-conv-to');
        const resDiv = document.getElementById('modal-conv-result');

        if (!amountInput || !fromSelect || !toSelect || !resDiv) return;

        const amount = parseFloat(amountInput.value) || 0;
        const fromCode = fromSelect.value;
        const toCode = toSelect.value;

        const rates = this._exchangeRates || [];
        const fromObj = rates.find(r => r.currency_code === fromCode) || { exchange_rate: 1, symbol: fromCode, currency_name: fromCode };
        const toObj = rates.find(r => r.currency_code === toCode) || { exchange_rate: 1, symbol: toCode, currency_name: toCode };

        const fromRate = parseFloat(fromObj.exchange_rate || fromObj.exchange_rate_to_base || 1);
        const toRate = parseFloat(toObj.exchange_rate || toObj.exchange_rate_to_base || 1);

        const effectiveRate = toRate > 0 ? (fromRate / toRate) : 0;
        const convertedAmount = amount * effectiveRate;
        const fromSym = fromObj.currency_symbol || fromObj.symbol || fromCode;
        const toSym = toObj.currency_symbol || toObj.symbol || toCode;

        resDiv.innerHTML = `
            <div style="font-size:13px; opacity:0.9; margin-bottom:4px;">
                ${amount.toLocaleString()} ${fromSym} (${fromObj.currency_name}) يعادل:
            </div>
            <div style="font-size:28px; font-weight:800; font-family:monospace; letter-spacing:0.5px; margin-bottom:6px;">
                ${App.formatMoney(convertedAmount)} <span style="font-size:18px;">${toSym}</span>
            </div>
            <div style="font-size:11.5px; opacity:0.85; border-top:1px solid rgba(255,255,255,0.2); padding-top:6px;">
                سعر الصرف المعتمد: 1 ${fromSym} = <b>${effectiveRate < 0.01 ? effectiveRate.toFixed(6) : effectiveRate.toFixed(4)}</b> ${toSym}
            </div>
        `;
    },

    swapModalConverterCurrencies() {
        const fromSelect = document.getElementById('modal-conv-from');
        const toSelect = document.getElementById('modal-conv-to');
        if (!fromSelect || !toSelect) return;
        const tmp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tmp;
        this.calcModalCurrencyConvert();
    }



});

// ==========================================
// VOUCHERS BULK SELECTION & PRINTING
// ==========================================
App.updateVouchersBulkBar = function() {
    const checked = Array.from(document.querySelectorAll('.v-select-cb:checked')).map(c => Number(c.value));
    let bar = document.getElementById('vouchers-floating-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'vouchers-floating-bar';
        bar.style.cssText = 'display:none; position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#0f172a; color:#fff; padding:8px 18px; border-radius:30px; box-shadow:0 10px 25px rgba(0,0,0,0.35); z-index:999; align-items:center; gap:12px;';
        document.body.appendChild(bar);
    }
    if (checked.length > 0) {
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span style="font-size:13px; font-weight:600;">✓ تم تحديد <b style="color:#38bdf8;">${checked.length}</b> سند</span>
            <button class="mt-btn mt-btn-primary" style="border-radius:20px; padding:5px 16px; font-weight:700; font-size:12px;" onclick="App.printSelectedVouchers()">🖨️ طباعة السندات المحددة</button>
            <button class="mt-btn" style="background:#334155; color:#cbd5e1; border-radius:20px; padding:4px 10px; font-size:11px;" onclick="document.querySelectorAll('.v-select-cb').forEach(c => c.checked = false); App.updateVouchersBulkBar();">✕ إلغاء</button>
        `;
    } else {
        bar.style.display = 'none';
    }
};

App.printSelectedVouchers = function() {
    const checked = Array.from(document.querySelectorAll('.v-select-cb:checked')).map(c => Number(c.value));
    if (checked.length === 0) {
        return App.toast('يرجى تحديد سند واحد على الأقل للطباعة', 'warning');
    }
    if (App.PrintEngine && typeof App.PrintEngine.printVouchersBulk === 'function') {
        App.PrintEngine.printVouchersBulk(checked);
    } else {
        App.printVouchersBulk(checked);
    }
};
