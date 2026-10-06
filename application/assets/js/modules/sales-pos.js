/**

 * SAM User Manager — Sales, POS Invoices & Receipts

 */

'use strict';



Object.assign(window.App, {

    salesTradeType: 'sales',

    setSalesPage(page) {
        this.salesPage = Math.max(1, parseInt(page, 10) || 1);
        this.renderSales();
    },

    async renderSales() {

        if (!this.salesTradeType) this.salesTradeType = (this.userRole === 'pos_agent' ? 'purchases' : 'sales');



        const params = {

            buyer_id: this.salesBuyerFilter,

            trade_type: this.salesTradeType,

            profile: this.salesProfileFilter,

            pay_status: this.salesPayStatusFilter,

            pay_method: this.salesPayMethodFilter,

            start_date: this.salesStartDate,

            end_date: this.salesEndDate,

            search: this.salesSearch,

            page: this.salesPage,

            limit: this.salesLimit

        };



        const [res, adminsRes, profilesRes, alertsRes] = await Promise.all([

            this.api('get_sales_invoices', params),

            this.api('get_admins'),

            this.api('get_profiles'),

            this.api('get_low_stock_alerts')

        ]);



        const invoicesRes = res || { data: [], summary: {}, grouped_by_buyer: [], grouped_by_profile: [] };

        const invoices = invoicesRes.data || [];

        const summary = invoicesRes.summary || {};

        const groupedByBuyer = invoicesRes.grouped_by_buyer || [];

        const groupedByProfile = invoicesRes.grouped_by_profile || [];



        // Fallback calculation if summary is missing but invoices exist

        if ((!summary.total_count || summary.total_count === 0) && invoices.length > 0) {

            let tNet = 0, tPaid = 0, tRem = 0, tQty = 0, tDisc = 0;

            invoices.forEach(inv => {

                tNet += (parseFloat(inv.total_amount) || 0);

                tPaid += (parseFloat(inv.paid_amount) || 0);

                tRem += (parseFloat(inv.remaining_amount) || 0);

                tDisc += (parseFloat(inv.discount_amount) || 0);

                tQty += (parseInt(inv.quantity) || 0);

            });

            summary.total_net = tNet;

            summary.total_paid = tPaid;

            summary.total_remaining = tRem;

            summary.total_discount = tDisc;

            summary.total_qty = tQty;

            summary.total_count = invoices.length;

        }



        const buyersList = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);

        const profilesList = Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || []);

        const lowStockAlerts = alertsRes?.alerts || [];



        const isPosAgent = (this.userRole === 'pos_agent');

        const canTransferSheets = (this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin' || this.userRole === 'distributor');



        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            this.can('sales_create_invoice') ? { label: '🛒 بيع كروت', variant: 'success', onclick: 'App.showSaleModal()', title: 'بيع كروت جديدة' } : null,
            this.can('sales_transfer_sheets') ? { label: '📦 توزيع كروت', variant: 'warning', onclick: 'App.showSheetTransferModal()', title: 'توزيع كروت ونقل عهدة' } : null,
            this.can('sales_transfer_sheets') ? { label: '👔 إضافة موزع', variant: 'primary', onclick: "App.showAdminModal({ role: 'distributor' })", title: 'إضافة موزع جديد' } : null,
            this.can('sales_transfer_sheets') ? { label: '🏪 إضافة وكيل', variant: 'secondary', onclick: "App.showAdminModal({ role: 'pos_agent' })", title: 'إضافة وكيل / نقطة بيع' } : null,
            canTransferSheets ? { label: '📲 دعوة نقطة بيع (مع مديونية)', variant: 'secondary', onclick: 'App.showInvitePosModal()', title: 'دعوة نقطة بيع جديدة وتثبيت المديونية السابقة' } : null,
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderSales()' }
        ].filter(Boolean);

        // 2. Standard KPIs
        const stats = [
            { label: 'صافي المبيعات', value: App.formatMoney(summary.total_net || 0), icon: '💵', tone: 'green', meta: `${summary.total_count || 0} فاتورة` },
            { label: 'المسدد نقداً', value: App.formatMoney(summary.total_paid || 0), icon: '💰', tone: 'blue', meta: 'Paid Cash' },
            { label: 'المتبقي آجل ذمم', value: App.formatMoney(summary.total_remaining || 0), icon: '⏳', tone: 'rose', meta: 'Outstanding Debt' },
            { label: 'الكروت المباعة', value: (summary.total_qty || 0).toLocaleString(), icon: '🎫', tone: 'amber', meta: `خصم: ${App.formatMoney(summary.total_discount || 0)}` },
            { label: 'إجمالي التكلفة', value: summary.total_cost===null?'غير مسجلة':App.formatMoney(summary.total_cost || 0), icon: '📦', tone: 'purple' },
            { label: 'صافي الأرباح', value: summary.total_profit===null?'غير محدد':App.formatMoney(summary.total_profit || 0), icon: '📈', tone: 'emerald' }
        ];

        // 3. Toolbar
        const leftToolbar = [
            this.userRole === 'distributor' ? `
                <div style="display:inline-flex; border:1px solid var(--sam-primary, #0284c7); border-radius:var(--sam-radius-sm, 4px); overflow:hidden; margin-left:6px;">
                    <button type="button" class="sam-btn sam-btn--sm ${this.salesTradeType==='sales'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesTradeType='sales'; App.salesPage=1; App.renderSales();">🛒 فواتير مبيعاتي</button>
                    <button type="button" class="sam-btn sam-btn--sm ${this.salesTradeType==='purchases'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesTradeType='purchases'; App.salesPage=1; App.renderSales();">📥 مشترياتي من الإدارة</button>
                </div>
            ` : '',
            isPosAgent ? `
                <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.showAccountStatementModal(${this.adminId})">📄 كشف حسابي المالي</button>
            ` : '',
            `<div style="display:inline-flex; border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-sm, 4px); overflow:hidden;">
                <button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='invoices'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='invoices'; App.renderSales();">🧾 جدول الفواتير</button>
                ${!isPosAgent ? `<button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='by_buyer'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='by_buyer'; App.renderSales();">👥 تجميع بالمشتري</button>` : ''}
                <button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='by_profile'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='by_profile'; App.renderSales();">📦 تجميع بالباقة</button>
                ${canTransferSheets ? `
                    <button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='pos_requests'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='pos_requests'; App.renderSales();">📥 طلبات الوكلاء</button>
                    <button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='pos_card_requests'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='pos_card_requests'; App.renderSales();">🎫 طلبات الكروت</button>
                    <button type="button" class="sam-btn sam-btn--sm ${this.salesViewMode==='customer_requests'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.salesViewMode='customer_requests'; App.renderSales();">👤 طلبات المشتركين</button>
                ` : ''}
            </div>`
        ].filter(Boolean);

        const rightToolbar = [
            `<div class="quick-table-search" style="margin:0; min-width:160px;">
                <span class="quick-table-search-icon">🔍</span>
                <input type="text" class="quick-table-search-input" placeholder="رقم الفاتورة..." value="${this.escape(this.salesSearch)}" onkeydown="if(event.key==='Enter'){ App.salesSearch=this.value; App.salesPage=1; App.renderSales(); }" />
            </div>`,
            (!isPosAgent && buyersList.length > 1) ? `
                <select class="sam-select" style="min-width:130px;" onchange="App.salesBuyerFilter=this.value; App.salesPage=1; App.renderSales();">
                    <option value="">كل الحسابات</option>
                    ${buyersList.map(b => `<option value="${b.id}" ${this.salesBuyerFilter==b.id?'selected':''}>${b.fullname} (${b.username})</option>`).join('')}
                </select>
            ` : '',
            `<select class="sam-select" style="min-width:120px;" onchange="App.salesProfileFilter=this.value; App.salesPage=1; App.renderSales();">
                <option value="">كل الباقات</option>
                ${profilesList.map(p => `<option value="${p.name}" ${this.salesProfileFilter===p.name?'selected':''}>${p.name}</option>`).join('')}
            </select>`,
            `<select class="sam-select" style="min-width:110px;" onchange="App.salesPayStatusFilter=this.value; App.salesPage=1; App.renderSales();">
                <option value="">كل حالات السداد</option>
                <option value="paid" ${this.salesPayStatusFilter==='paid'?'selected':''}>🟢 مسدد</option>
                <option value="partial" ${this.salesPayStatusFilter==='partial'?'selected':''}>🟡 جزئي</option>
                <option value="unpaid" ${this.salesPayStatusFilter==='unpaid'?'selected':''}>🔴 آجل</option>
            </select>`,
            `<select class="sam-select" style="min-width:100px;" onchange="App.salesPayMethodFilter=this.value; App.salesPage=1; App.renderSales();">
                <option value="">طريقة الدفع</option>
                <option value="cash" ${this.salesPayMethodFilter==='cash'?'selected':''}>نقدي Cash</option>
                <option value="credit" ${this.salesPayMethodFilter==='credit'?'selected':''}>آجل Credit</option>
                <option value="partial" ${this.salesPayMethodFilter==='partial'?'selected':''}>جزئي Partial</option>
            </select>`,
            `<div style="display:inline-flex; align-items:center; gap:4px;">
                <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.salesStartDate}" onchange="App.salesStartDate=this.value; App.salesPage=1; App.renderSales();" title="من تاريخ" />
                <span>إلى</span>
                <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.salesEndDate}" onchange="App.salesEndDate=this.value; App.salesPage=1; App.renderSales();" title="إلى تاريخ" />
            </div>`,
            (this.salesSearch || this.salesBuyerFilter || this.salesProfileFilter || this.salesPayStatusFilter || this.salesPayMethodFilter || this.salesStartDate || this.salesEndDate) ? `
                <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" style="padding:4px 8px;" onclick="App.salesSearch=''; App.salesBuyerFilter=''; App.salesProfileFilter=''; App.salesPayStatusFilter=''; App.salesPayMethodFilter=''; App.salesStartDate=''; App.salesEndDate=''; App.salesPage=1; App.renderSales();" title="إلغاء كل الفلاتر">✕</button>
            ` : ''
        ].filter(Boolean);

        // 4. Content Area
        let contentHtml = '';

        // Low stock alert banner
        if (lowStockAlerts.length > 0) {
            contentHtml += `
                <div style="background:#fffbeb; border:1px solid #fde68a; border-right:5px solid #d97706; border-radius:var(--sam-radius-md, 8px); padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:22px;">⚠️</span>
                        <div>
                            <div style="font-weight:800; color:#92400e; font-size:13px;">تنبيه نقص مخزون الكروت في حسابك:</div>
                            <div style="font-size:12px; color:#78350f; margin-top:2px;">
                                ${lowStockAlerts.map(a => `<b>${this.escape(a.name_for_users || a.profile_name)}</b> (المتبقي: <b style="color:#b91c1c;">${a.unsold_cards} كرت</b> / ${a.unsold_sheets} ورقة A4)`).join(' ، ')}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" style="font-weight:bold;" onclick="App.switchTab('batch_gen')">⚡ توليد دفعة كروت جديدة الآن</button>
                </div>
            `;
        }

        // View Mode 1: Detailed Invoices Table
        if (this.salesViewMode === 'invoices') {
            const tableRows = invoices.map((inv, idx) => {
                const payClass = inv.remaining_amount <= 0 ? 'status-active' : (inv.paid_amount > 0 ? 'status-idle' : 'status-disabled');
                const payText = inv.remaining_amount <= 0 ? '🟢 مسدد' : (inv.paid_amount > 0 ? '🟡 جزئي' : '🔴 آجل');
                const itemSummary = inv.sale_kind === 'instant_balance'
                    ? `رصيد شحن فوري بقيمة ${App.formatMoney(inv.unit_price || inv.total_amount)} ${App.getCurrencySymbol(App._baseCurrency)}`
                    : inv.sale_kind === 'digital_voucher'
                        ? `كرت فوري — ${inv.profile_name || inv.items?.[0]?.profile_name || 'بدون باقة'}`
                        : ((inv.items && inv.items.length > 0)
                            ? inv.items.map(it => `${it.profile_name} (${it.sheets_count} ورقة = ${it.cards_count} كرت)`).join(' | ')
                            : (inv.profile_name || 'عامة'));
                const quantityLabel = inv.sale_kind === 'instant_balance'
                    ? `${App.formatMoney(inv.unit_price || (Number(inv.total_amount) + Number(inv.discount_amount)))} ${App.getCurrencySymbol(App._baseCurrency)} رصيد`
                    : inv.sale_kind === 'digital_voucher'
                        ? '1 كرت فوري'
                        : `${Number(inv.quantity || 0).toLocaleString()} كرت`;

                const isSellerOrSuper = (Number(inv.seller_id) === Number(this.adminId) || this.userRole === 'system_owner' || this.userRole === 'superadmin');
                const isPurchasesView = (this.salesTradeType === 'purchases' || Number(inv.buyer_id) === Number(this.adminId));

                return `
                    <tr>
                        <td>${((this.salesPage - 1) * this.salesLimit) + idx + 1}</td>
                        <td><b style="color:var(--sam-primary); font-size:12.5px;">${this.escape(inv.invoice_no)}</b></td>
                        <td>
                            <a href="javascript:void(0)" onclick="App.cashboxAccountFilter=${inv.buyer_id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" style="color:var(--sam-primary); font-weight:bold; text-decoration:none;" title="عرض كشف حساب المشتري">
                                👤 ${this.escape(inv.buyer_name || '-')}
                            </a>
                            ${inv.buyer_phone ? `<div style="font-size:11px; color:var(--sam-text-muted); direction:ltr;">📞 ${this.escape(inv.buyer_phone)}</div>` : ''}
                        </td>
                        <td><span class="sam-badge" style="background:#475569; color:#fff; font-size:11px;">${this.escape(itemSummary)}</span></td>
                        <td><b>${quantityLabel}</b></td>
                        <td>${App.formatMoney(inv.total_amount + inv.discount_amount)}</td>
                        <td><span style="color:var(--sam-danger);">${inv.discount_amount > 0 ? '-' + App.formatMoney(inv.discount_amount) : '0'}</span></td>
                        <td><b style="color:var(--sam-primary); font-size:13px;">${App.formatMoney(inv.total_amount)}</b></td>
                        <td><b style="color:#b45309;">${inv.cost_amount===null?'غير مسجلة':App.formatMoney(inv.cost_amount || 0)}</b></td>
                        <td><b style="color:${Number(inv.profit_amount||0)>=0?'var(--sam-success)':'var(--sam-danger)'};">${inv.profit_amount===null?'غير محدد':App.formatMoney(inv.profit_amount || 0)}</b></td>
                        <td><b style="color:var(--sam-success);">${App.formatMoney(inv.paid_amount)}</b></td>
                        <td><b style="color:${inv.remaining_amount > 0 ? 'var(--sam-danger)' : 'var(--sam-text-muted)'};">${App.formatMoney(inv.remaining_amount)}</b></td>
                        <td><span class="status-pill ${payClass}">${payText} (${inv.payment_type})</span></td>
                        <td style="font-size:11px; color:var(--sam-text-muted);">${inv.created_at || '-'}</td>
                        <td>
                            <div style="display:flex; gap:3px; align-items:center; flex-wrap:nowrap;">
                                ${(() => {
                                    if (isPurchasesView && !isSellerOrSuper) {
                                        return `<button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px; background:#f0fdf4; color:#166534; font-weight:600;" onclick="App.showInvoiceVouchersModal(${inv.id})" title="استعراض سندات سداد الفاتورة">🧾 السندات</button>`;
                                    }
                                    return (this.can('sales_invoice_pay') && parseFloat(inv.remaining_amount) > 0 ? `
                                        <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 7px; font-size:11px; font-weight:700;" onclick="App.showPayInvoiceModal(${inv.id})" title="💵 سداد نقدي مباشر لهذه الفاتورة">💵 سداد</button>
                                    ` : `
                                        <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px; background:#f0fdf4; color:#166534; font-weight:600;" onclick="App.showInvoiceVouchersModal(${inv.id})" title="استعراض سندات سداد الفاتورة">🧾 السندات</button>
                                    `) + (isSellerOrSuper && this.can('sales_invoice_return') ? `
                                        <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" style="padding:2px 6px; font-size:11px; font-weight:600;" onclick="App.showReturnSaleModal(${inv.id})" title="🔄 إرجاع كروت / مرتجع مبيعات">🔄 مرتجع</button>
                                    ` : '');
                                })()}
                                <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px;" onclick="App.showSalesReturnHistoryModal(${inv.id})" title="أرقام الأوراق والكروت المرتجعة وقيمتها">سجل المرتجعات</button>
                                <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px;" onclick="App.printSaleInvoice(${inv.id})" title="عرض وطباعة الفاتورة">👁️ عرض</button>
                                <button type="button" class="sam-btn sam-btn--sm" style="padding:2px 6px; font-size:11px; background:#e0f2fe; color:#0369a1; font-weight:600;" onclick="App.cashboxAccountFilter=${inv.buyer_id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" title="كشف حساب المشتري">📑 حسابه</button>
                                <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 6px; font-size:11px;" onclick="App.shareInvoiceWhatsApp(${inv.id})" title="إرسال عبر واتساب">📲</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>رقم الفاتورة</th>
                                <th>المشتري / الوكيل</th>
                                <th>الباقة والبنود</th>
                                <th>الكمية</th>
                                <th>الإجمالي</th>
                                <th>الخصم</th>
                                <th>الصافي (Net)</th>
                                <th>تكلفة الشراء الفعلية</th>
                                <th>الربح</th>
                                <th>المدفوع</th>
                                <th>المتبقي</th>
                                <th>طريقة الدفع</th>
                                <th>التاريخ</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows || '<tr><td colspan="15" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد فواتير مبيعات مطابقة لمعايير البحث</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;

            // Standard Pagination
            const totalInvoices = invoicesRes.total || 0;
            const totalPages = Math.ceil(totalInvoices / this.salesLimit) || 1;
            if (PB?.renderPagination) {
                contentHtml += PB.renderPagination({
                    page: this.salesPage,
                    totalPages: totalPages,
                    totalRecords: totalInvoices,
                    itemName: 'فاتورة',
                    onPageChange: 'App.setSalesPage'
                });
            } else {
                contentHtml += `
                    <div class="sam-pagination mt-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                        <div style="font-size:13px; color:var(--sam-text-muted);">إجمالي الفواتير: <b>${totalInvoices.toLocaleString()}</b> (صفحة <b>${this.salesPage}</b> من <b>${totalPages}</b>)</div>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="sam-btn sam-btn--sm" ${this.salesPage <= 1 ? 'disabled' : ''} onclick="App.salesPage=1; App.renderSales()">⇤ الأولى</button>
                            <button type="button" class="sam-btn sam-btn--sm" ${this.salesPage <= 1 ? 'disabled' : ''} onclick="App.salesPage--; App.renderSales()">◀ السابق</button>
                            <span style="padding:4px 10px; background:var(--sam-bg-surface); border:1px solid var(--sam-border-strong); border-radius:var(--sam-radius-sm); font-weight:bold;">${this.salesPage}</span>
                            <button type="button" class="sam-btn sam-btn--sm" ${this.salesPage >= totalPages ? 'disabled' : ''} onclick="App.salesPage++; App.renderSales()">التالي ▶</button>
                            <button type="button" class="sam-btn sam-btn--sm" ${this.salesPage >= totalPages ? 'disabled' : ''} onclick="App.salesPage=${totalPages}; App.renderSales()">الأخيرة ⇥</button>
                        </div>
                    </div>
                `;
            }
        } else if (this.salesViewMode === 'pos_requests') {
            // View Mode 4: POS Join & Partnership Requests
            const posReqsRes = await this.api('admin_get_pos_requests');
            const posRequests = posReqsRes?.requests || [];

            contentHtml += `
                <div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; font-size:15px; color:#0f172a;">📥 طلبات انضمام واعتماد نقاط البيع (${posRequests.length})</span>
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">إدارة طلبات الانضمام الواردة من الوكلاء وتحديد نسب الخصم وسقوف الائتمان وتثبيت المديونيات السابقة</div>
                    </div>
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--warning" onclick="App.showInvitePosModal()">
                        + دعوة نقطة بيع جديدة 📲
                    </button>
                </div>
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>اسم الوكيل / المحل</th>
                                <th>رقم الهاتف</th>
                                <th>النوع</th>
                                <th>نسبة الخصم</th>
                                <th>سقف الائتمان</th>
                                <th>المديونية المثبتة</th>
                                <th>حالة الطلب</th>
                                <th>تاريخ الطلب</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${posRequests.map((r, idx) => {
                                const stBadge = r.status === 'approved'
                                    ? '<span class="status-pill status-active">🟢 معتمد</span>'
                                    : (r.status === 'rejected'
                                        ? '<span class="status-pill status-disabled">🔴 مرفوض</span>'
                                        : '<span class="status-pill status-idle">⏳ قيد المراجعة</span>');
                                const typeLabel = r.request_type === 'invite' ? '📨 دعوة من الإدارة' : '📥 طلب انضمام ذاتي';
                                return `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td>
                                            <b>${this.escape(r.pos_name || '-')}</b>
                                            ${r.shop_name ? `<div style="font-size:11px; color:#64748b;">🏪 ${this.escape(r.shop_name)}</div>` : ''}
                                        </td>
                                        <td><code style="direction:ltr;">${this.escape(r.pos_phone || '-')}</code></td>
                                        <td><span class="sam-badge" style="background:#e0f2fe; color:#0369a1; font-size:11px;">${typeLabel}</span></td>
                                        <td><b>${r.discount_rate ? Number(r.discount_rate) + '%' : '-'}</b></td>
                                        <td><b>${r.credit_limit ? App.formatMoney(r.credit_limit) + ' ' + (r.currency || '') : '-'}</b></td>
                                        <td><b style="color:${Number(r.opening_debt) > 0 ? '#dc2626' : '#64748b'};">${Number(r.opening_debt) > 0 ? App.formatMoney(r.opening_debt) + ' ' + (r.currency || '') : '0'}</b></td>
                                        <td>${stBadge}</td>
                                        <td><small>${r.created_at || '-'}</small></td>
                                        <td>
                                            <div style="display:flex; gap:4px; align-items:center;">
                                                ${r.status === 'pending' ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 8px; font-size:11.5px; font-weight:700;" onclick="App.showReviewPosRequestModal(${r.id})">
                                                        ✅ مراجعة واعتماد
                                                    </button>
                                                ` : `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" style="padding:2px 6px; font-size:11px;" onclick="App.showReviewPosRequestModal(${r.id}, true)">
                                                        👁️ عرض الشروط
                                                    </button>
                                                `}
                                                ${r.pos_phone ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 6px; font-size:11px;" onclick="window.open('https://wa.me/${r.pos_phone.replace(/[^0-9]/g,'')}', '_blank')" title="مراسلة عبر واتساب">📲</button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد طلبات انضمام لنقاط البيع حالياً</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.salesViewMode === 'pos_card_requests') {
            // View Mode 5: POS Card Batch Print Requests
            const cardReqsRes = await this.api('admin_get_card_requests');
            const cardRequests = cardReqsRes?.requests || [];

            contentHtml += `
                <div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; font-size:15px; color:#0f172a;">🎫 طلبات طباعة وتوليد كروت نقاط البيع (${cardRequests.length})</span>
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">مراجعة طلبات صفحات الكروت وتوليدها تلقائياً وإضافتها لحساب الوكيل</div>
                    </div>
                </div>
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>رقم الطلب</th>
                                <th>اسم نقطة البيع</th>
                                <th>باقة الكروت</th>
                                <th>الكمية المطلوبة</th>
                                <th>سعر الكرت</th>
                                <th>الخصم</th>
                                <th>صافي الفاتورة</th>
                                <th>الحالة</th>
                                <th>تاريخ الطلب</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cardRequests.map((r, idx) => {
                                const stBadge = r.status === 'approved'
                                    ? '<span class="status-pill status-active">🟢 تم التوليد والطباعة</span>'
                                    : (r.status === 'rejected'
                                        ? '<span class="status-pill status-disabled">🔴 مرفوض</span>'
                                        : '<span class="status-pill status-idle">⏳ قيد الانتظار</span>');
                                return `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td><code style="color:var(--sam-primary); font-weight:bold;">${this.escape(r.request_no)}</code></td>
                                        <td>
                                            <b>${this.escape(r.pos_name || '-')}</b>
                                            ${r.pos_phone ? `<div style="font-size:11px; color:#64748b; direction:ltr;">📞 ${this.escape(r.pos_phone)}</div>` : ''}
                                        </td>
                                        <td><span class="sam-badge" style="background:#8e44ad; color:#fff;">📦 ${this.escape(r.profile_name)}</span></td>
                                        <td><b>${r.page_count} ورقة</b> × ${r.cards_per_page} = <b style="color:#0284c7;">${r.total_cards} كرت</b></td>
                                        <td>${App.formatMoney(r.card_price)}</td>
                                        <td><span style="color:#dc2626;">${Number(r.discount_rate) > 0 ? Number(r.discount_rate) + '%' : '0%'}</span></td>
                                        <td><b style="color:var(--sam-primary); font-size:13px;">${App.formatMoney(r.net_amount)}</b></td>
                                        <td>${stBadge}</td>
                                        <td><small>${r.created_at || '-'}</small></td>
                                        <td>
                                            <div style="display:flex; gap:4px; align-items:center;">
                                                ${r.status === 'pending' ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 8px; font-size:11.5px; font-weight:700;" onclick="App.showReviewPosCardRequestModal(${r.id})">
                                                        ⚡ موافقة وتوليد الكروت
                                                    </button>
                                                ` : `
                                                    <span style="font-size:11.5px; color:#16a34a; font-weight:700;">✅ مكتمل</span>
                                                `}
                                                ${r.pos_phone ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 6px; font-size:11px;" onclick="window.open('https://wa.me/${r.pos_phone.replace(/[^0-9]/g,'')}', '_blank')" title="مراسلة الوكيل">📲</button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد طلبات طباعة كروت حالياً</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.salesViewMode === 'customer_requests') {
            // View Mode 6: Customer Card & Balance Requests
            const custReqsRes = await this.api('admin_get_customer_requests');
            const custRequests = custReqsRes?.requests || [];

            contentHtml += `
                <div style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; font-size:15px; color:#0f172a;">👤 طلبات المشتركين والعملاء (${custRequests.length})</span>
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">مراجعة طلبات شراء الكروت والشحن الفوري الواردة من بوابة المشتركين الذاتية</div>
                    </div>
                </div>
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>رقم الطلب</th>
                                <th>اسم المشترك</th>
                                <th>رقم الهاتف</th>
                                <th>نوع الطلب</th>
                                <th>تفاصيل الباقة / المبلغ</th>
                                <th>طريقة الدفع</th>
                                <th>مرجع التحويل</th>
                                <th>الحالة</th>
                                <th>التاريخ</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${custRequests.map((r, idx) => {
                                const stBadge = r.status === 'approved'
                                    ? '<span class="status-pill status-active">🟢 تم التسليم</span>'
                                    : (r.status === 'rejected'
                                        ? '<span class="status-pill status-disabled">🔴 مرفوض</span>'
                                        : '<span class="status-pill status-idle">⏳ قيد المراجعة</span>');
                                const typeText = r.request_type === 'voucher_purchase' ? '🎫 شراء كرت' : '⚡ شحن رصيد';
                                return `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td><code style="color:var(--sam-primary); font-weight:bold;">${this.escape(r.request_no)}</code></td>
                                        <td><b>${this.escape(r.customer_name || 'مشترك')}</b></td>
                                        <td><code style="direction:ltr;">${this.escape(r.phone || '-')}</code></td>
                                        <td><span class="sam-badge" style="background:${r.request_type==='voucher_purchase'?'#e0f2fe; color:#0369a1;':'#fef3c7; color:#92400e;'}">${typeText}</span></td>
                                        <td>
                                            ${r.request_type === 'voucher_purchase' 
                                                ? `<b style="color:#0284c7;">${this.escape(r.profile_name || '-')}</b> (${App.formatMoney(r.requested_amount)} ر.ي)`
                                                : `<b style="color:#16a34a; font-size:13px;">${App.formatMoney(r.requested_amount)} ر.ي</b>`}
                                        </td>
                                        <td>${this.escape(r.payment_method || 'نقداً')}</td>
                                        <td><code>${this.escape(r.payment_reference || '-')}</code></td>
                                        <td>${stBadge}</td>
                                        <td><small>${r.created_at || '-'}</small></td>
                                        <td>
                                            <div style="display:flex; gap:4px; align-items:center;">
                                                ${r.status === 'pending' ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 8px; font-size:11.5px; font-weight:700;" onclick="App.showReviewCustomerRequestModal(${r.id})">
                                                        ✅ تسليم وتأكيد
                                                    </button>
                                                ` : `
                                                    <span style="font-size:11.5px; color:#16a34a;">${r.voucher_username ? 'رمز: ' + this.escape(r.voucher_username) : '✅ معتمد'}</span>
                                                `}
                                                ${r.phone ? `
                                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="padding:2px 6px; font-size:11px;" onclick="window.open('https://wa.me/${r.phone.replace(/[^0-9]/g,'')}', '_blank')" title="مراسلة المشترك">📲</button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد طلبات مشترين حالياً</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (this.salesViewMode === 'by_buyer') {
            // View Mode 2: Grouped by Buyer
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>اسم المشتري / الوكيل</th>
                                <th>الرتبة</th>
                                <th>عدد الفواتير</th>
                                <th>إجمالي الكروت المباعة</th>
                                <th>إجمالي المبيعات</th>
                                <th>المسدد</th>
                                <th>المتبقي ذمم</th>
                                <th>إجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupedByBuyer.map((b, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><b>${this.escape(b.buyer_name || '-')}</b></td>
                                    <td><span class="status-pill status-online">${this.escape(b.buyer_role_ar || b.buyer_role || '-')}</span></td>
                                    <td><b>${b.invoices_count}</b></td>
                                    <td><b>${(parseInt(b.total_qty) || 0).toLocaleString()} كرت</b></td>
                                    <td><b style="color:var(--sam-primary); font-size:13px;">${App.formatMoney(b.total_amount)}</b></td>
                                    <td><b style="color:var(--sam-success);">${App.formatMoney(b.total_paid)}</b></td>
                                    <td><b style="color:${parseFloat(b.total_remaining) > 0 ? 'var(--sam-danger)' : 'var(--sam-text-muted)'};">${App.formatMoney(b.total_remaining)}</b></td>
                                    <td>
                                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.salesBuyerFilter=${b.buyer_id}; App.salesViewMode='invoices'; App.renderSales();">🔍 استعراض الفواتير</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد بيانات مشترين مجمعة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // View Mode 3: Grouped by Profile
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>اسم الباقة والسرعة</th>
                                <th>عدد مرات البيع (الفواتير)</th>
                                <th>إجمالي عدد الكروت المباعة</th>
                                <th>إجمالي الإيراد الصافي</th>
                                <th>متوسط سعر الكرت</th>
                                <th>إجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupedByProfile.map((p, idx) => {
                                const qty = parseInt(p.total_qty) || 0;
                                const net = parseFloat(p.total_net) || 0;
                                const avg = qty > 0 ? (net / qty).toFixed(2) : '0';
                                return `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td><span class="sam-badge" style="background:#8e44ad; color:#fff; font-size:12px; padding:4px 8px;">📦 ${this.escape(p.profile_name || 'افتراضي')}</span></td>
                                        <td><b>${p.invoices_count}</b></td>
                                        <td><b>${qty.toLocaleString()} كرت</b></td>
                                        <td><b style="color:var(--sam-primary); font-size:13px;">${App.formatMoney(net)}</b></td>
                                        <td><b>${App.formatMoney(avg)}</b></td>
                                        <td>
                                            <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.salesProfileFilter='${this.escape(p.profile_name)}'; App.salesViewMode='invoices'; App.renderSales();">🔍 استعراض الفواتير</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--sam-text-muted);">لا توجد بيانات باقات مجمعة</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // 5. Render Shell
        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'sales-pos',
                archetype: 'pos',
                title: 'المبيعات ونقاط البيع والفواتير',
                subtitle: 'إدارة الفواتير، مبيعات الكروت، توزيع العهد، والتحصيل النقدي',
                eyebrow: 'SALES & POS TERMINAL',
                icon: '🛒',
                actions,
                stats,
                toolbar: { left: leftToolbar, right: rightToolbar },
                content: contentHtml
            });
        } else {
            document.getElementById('main-view').innerHTML = `
                <main class="sam-ui-page sam-page-shell" data-sam-page="sales-pos" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">🛒</span>
                            <div>
                                <span class="sam-page-eyebrow">SALES & POS TERMINAL</span>
                                <h1>المبيعات ونقاط البيع والفواتير</h1>
                                <p>إدارة الفواتير، مبيعات الكروت، توزيع العهد، والتحصيل النقدي</p>
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



    // ==========================================

    // MULTI-ITEM SALES INVOICES & SMART SEQUENCING

    // ==========================================

    saleEligibleBuyers: [],

    saleAvailableProfiles: [],

    currentSaleItems: [],



    async showSaleModal() {

        const [accRes, availRes] = await Promise.all([

            this.api('get_sales_eligible_accounts'),

            this.api('get_available_sheets')

        ]);



        this.saleEligibleBuyers = accRes?.accounts || [];

        this.saleAvailableProfiles = (availRes?.profiles || []).filter(p => (p.package_type !== 'free') && (parseFloat(p.unit_price || p.retail_price || p.price || 0) > 0) && (!p.profile_name || !p.profile_name.startsWith('Free-')));



        if (this.saleAvailableProfiles.length === 0) {

            return this.toast('⚠️ لا توجد أوراق أو كروت متاحة في مخزنك للبيع حالياً. يرجى توليد دفعة كروت أولاً.', 'warning');

        }



        // Initialize with 1 item row

        const firstProf = this.saleAvailableProfiles[0];

        const initialSheets = (firstProf?.sheets || []).slice(0, 1).map(s => s.sheet_no);

        const initialCards = (firstProf?.sheets || []).slice(0, 1).reduce((acc, s) => acc + (s.cards_count || 20), 0);

        const initialPrice = parseFloat(firstProf?.unit_price) || 0;



        this.currentSaleItems = [{

            profile_name: firstProf?.profile_name || '',

            sheets_count: 1,

            selected_sheets: initialSheets,

            manual_mode: false,

            unit_price: initialPrice,

            discount_amount: 0,

            cards_count: initialCards,

            gross_amount: initialCards * initialPrice,

            net_amount: initialCards * initialPrice

        }];



        const modal = document.getElementById('modal-container');

        modal.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:960px; max-width:96vw; max-height:94vh;">

                <div class="mt-modal-header">

                    <span>🛒 تحرير فاتورة بيع كروت جملة (صفحات وباقات ورقية مع التفعيل الفوري)</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form onsubmit="App.onSaleFormSubmit(event)">

                    <div class="mt-modal-body" style="overflow-y:auto; max-height:calc(94vh - 120px); padding:16px;">

                        

                        <!-- Top Info: Buyer & Fast Search -->

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">

                                <label style="font-weight:800; font-size:13px; color:#1e293b; margin:0;">👤 المشتري (الموزع / نقطة البيع / العميل) *</label>

                            </div>

                            

                            <div class="form-row" style="margin-bottom:0;">

                                <div class="form-group" style="flex:2;">

                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">المشتري التجاري أو نقطة البيع *</label>

                                    <div style="position:relative;">

                                        <input type="text" list="msale-buyer-list" id="msale-buyer-input" class="mt-input" 
                                               style="width:100%; font-weight:700; font-size:13px;" 
                                               placeholder="🔍 اكتب اسم المشتري، اليوزر، أو رقم الهاتف أو اختر من القائمة..." 
                                               oninput="App.syncAdminCombobox(this, 'msale-buyer', 'msale-buyer-list', (id) => App.onMultiSaleBuyerChange(id))" 
                                               onchange="App.syncAdminCombobox(this, 'msale-buyer', 'msale-buyer-list', (id) => App.onMultiSaleBuyerChange(id))" required />

                                        <input type="hidden" id="msale-buyer" value="" />

                                        <datalist id="msale-buyer-list">

                                            ${this.saleEligibleBuyers.filter(b => Number(b.id) !== Number(this.adminId)).map(b => `

                                                <option data-id="${b.id}" data-role="${b.role}" data-disc="${b.discount_rate}" data-quota="${b.max_cards_quota}" data-search="${this.escape(((b.fullname||'') + ' ' + (b.username||'') + ' ' + (b.phone||'') + ' ' + (b.role_name_ar||b.role||'')).toLowerCase())}" value="${this.escape(b.fullname)} (@${this.escape(b.username)}) - [${this.escape(b.role_name_ar || b.role)}] [سقف الخصم: ${b.discount_rate}%]">

                                                    ${this.escape(b.fullname)} (@${this.escape(b.username)})

                                                </option>

                                            `).join('')}

                                        </datalist>

                                    </div>

                                </div>

                                <div class="form-group" style="flex:1;">

                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">سقف الخصم المسموح لك</label>

                                    <input type="text" id="msale-seller-disc-cap" class="mt-input" style="width:100%; background:#f1f5f9; font-weight:bold; color:#0284c7;" value="${this.currentAdminDiscountRate || 0}%" readonly />

                                </div>

                            </div>

                            <div id="msale-buyer-info-bar" style="margin-top:8px; font-size:12px; color:#475569; display:none;"></div>

                        </div>



                        <!-- Invoice Items Table -->

                        <div style="margin-bottom:12px;">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">

                                <label style="font-weight:bold; font-size:13px; color:#1e293b;">📦 بنود الفاتورة (الباقات والصفحات المحددة):</label>

                                <button type="button" class="mt-btn mt-btn-info" style="padding:4px 12px; font-size:11px; font-weight:bold;" onclick="App.addSaleItemRow()">

                                    ➕ إضافة باقة / بند آخر للفاتورة

                                </button>

                            </div>



                            <div class="mt-table-container" style="max-height:280px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">

                                <table class="mt-table" style="font-size:12px; margin:0;">

                                    <thead>

                                        <tr style="background:#f1f5f9;">

                                            <th style="width:220px;">الباقة المستهدفة</th>

                                            <th style="width:90px; text-align:center;">عدد الأوراق</th>

                                            <th>الأوراق المحجوزة تسلسلياً (Auto-Allocated)</th>

                                            <th style="width:65px; text-align:center;">الكروت</th>

                                            <th style="width:115px; text-align:center;">سعر التوزيع قبل الخصم</th>

                                            <th style="width:100px; text-align:center;">الإجمالي</th>

                                            <th style="width:90px; text-align:center;">الخصم %<br><small style="font-size:9px; color:#64748b;">(أقصى 5%)</small></th>

                                            <th style="width:100px; text-align:center;">الصافي</th>

                                            <th style="width:36px; text-align:center;">✕</th>

                                        </tr>

                                    </thead>

                                    <tbody id="msale-items-body">

                                        <!-- Rows injected by renderSaleItemRows() -->

                                    </tbody>

                                </table>

                            </div>

                        </div>



                        <!-- Financial Summary Cards -->

                        <div style="background:#0f172a; color:#fff; border-radius:8px; padding:12px; margin-bottom:12px;">

                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; text-align:center;">

                                <div>

                                    <div style="font-size:10px; color:#94a3b8;">إجمالي الأوراق A4</div>

                                    <div id="msale-sum-sheets" style="font-size:18px; font-weight:800; color:#38bdf8;">1</div>

                                </div>

                                <div>

                                    <div style="font-size:10px; color:#94a3b8;">إجمالي الكروت</div>

                                    <div id="msale-sum-cards" style="font-size:18px; font-weight:800; color:#4ade80;">0 كرت</div>

                                </div>

                                <div>

                                    <div style="font-size:10px; color:#94a3b8;">الإجمالي قبل الخصم</div>

                                    <div id="msale-sum-gross" style="font-size:16px; font-weight:700; color:#cbd5e1;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</div>

                                </div>

                                <div>

                                    <div style="font-size:10px; color:#94a3b8;">إجمالي الخصم</div>

                                    <div id="msale-sum-disc" style="font-size:16px; font-weight:700; color:#f87171;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</div>

                                </div>

                                <div>

                                    <div style="font-size:10px; color:#94a3b8;">الصافي المطلوب (Net)</div>

                                    <div id="msale-sum-net" style="font-size:20px; font-weight:900; color:#facc15;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</div>

                                </div>

                            </div>

                            <div id="msale-net-tafqeet" style="text-align:center; font-size:12px; color:#38bdf8; font-weight:bold; margin-top:8px; border-top:1px dashed #334155; padding-top:6px;"></div>

                        </div>



                        <!-- Payment & Notes -->

                        <div class="form-row">

                            <div class="form-group" style="flex:1;">

                                <label style="font-weight:700;">طريقة السداد:</label>

                                <select id="msale-pay-type" class="mt-select" style="width:100%; font-weight:600;" onchange="App.onMultiSalePayTypeChange(this.value)">

                                    <option value="cash">نقداً (يدخل في الصندوق فوراً)</option>

                                    <option value="credit">آجل بالكامل (يقيد مديونية على الحساب)</option>

                                    <option value="partial">دفعة نقدية ومتبقي آجل</option>

                                </select>

                            </div>

                            <div class="form-group" style="flex:1;">

                                <label style="font-weight:700;">المبلغ المسدد نقداً الآن (${App.getCurrencySymbol(App._baseCurrency)}):</label>

                                <input type="number" id="msale-paid-amt" class="mt-input" style="width:100%; font-weight:bold; color:#27ae60; font-size:14px;" value="0" oninput="App.calcMultiSaleTotals()" />

                                <div id="msale-paid-tafqeet" style="font-size:11.5px; color:#0284c7; font-weight:bold; margin-top:4px; min-height:16px;"></div>

                            </div>

                            <div class="form-group" style="flex:1;">

                                <label style="font-weight:700;">المتبقي آجل على الحساب:</label>

                                <input type="text" id="msale-rem-amt" class="mt-input" style="width:100%; background:#f1f5f9; font-weight:bold; color:#e74c3c; font-size:14px;" value="0.00 ${App.getCurrencySymbol(App._baseCurrency)}" readonly />

                            </div>

                        </div>



                        <div class="form-group" style="margin-bottom:0;">

                            <label>ملاحظات الفاتورة / رقم الحوالة أو السند:</label>

                            <input type="text" id="msale-notes" class="mt-input" style="width:100%" placeholder="اكتب أية ملاحظات توثيقية أو رقم إيداع" />

                        </div>



                        <!-- Security & Activation Alert -->

                        <div style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:6px; padding:10px 12px; margin-top:10px; font-size:11.5px; color:#065f46; display:flex; align-items:center; gap:8px;">

                            <span style="font-size:16px;">⚡</span>

                            <div>

                                <b>التفعيل التلقائي الفوري:</b> بمجرد تأكيد الفاتورة، سيتم إلغاء حظر الكروت (Reject) في FreeRADIUS وتفعيلها لكافة المشتركين فوراً، وتوليد رابط المشاركة عبر واتساب.

                            </div>

                        </div>



                    </div>

                    <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center;">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:bold; font-size:13px; padding:8px 22px;">

                            🛒 تأكيد وتفعيل

                        </button>

                    </div>

                </form>

            </div>

        </div>

        `;



        this.renderSaleItemRows();

    },



    onMultiSaleBuyerChange(buyerId) {

        const b = this.saleEligibleBuyers.find(x => x.id == buyerId);

        const infoBar = document.getElementById('msale-buyer-info-bar');

        if (!b) {

            if (infoBar) infoBar.style.display = 'none';

            return;

        }



        const quotaText = b.max_cards_quota > 0 ? `${Number(b.max_cards_quota).toLocaleString()} كرت` : 'غير محدود';

        if (infoBar) {

            infoBar.style.display = 'block';

            infoBar.innerHTML = `

                <div style="display:flex; flex-wrap:wrap; gap:12px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid #cbd5e1;">

                    <span>👤 <b>الاسم:</b> ${this.escape(b.fullname)}</span>

                    <span>🛡️ <b>الرتبة:</b> ${this.escape(b.role_name_ar || b.role)}</span>

                    <span>🏷️ <b>نسبة الخصم المعتمدة:</b> <b style="color:#0284c7;">${b.discount_rate || 0}%</b></span>

                    <span>📦 <b>سقف حيازة الكروت:</b> <b style="color:#0d9488;">${quotaText}</b></span>

                    <span>💳 <b>الرصيد المالي:</b> <b style="color:${parseFloat(b.balance) > 0 ? '#e74c3c' : '#27ae60'};">${App.formatMoney(b.balance)}</b></span>

                </div>

            `;

        }

        this.calcMultiSaleTotals();

    },



    addSaleItemRow() {

        const usedProfiles = (this.currentSaleItems || []).map(i => i.profile_name);

        const unselectedProf = this.saleAvailableProfiles.find(p => !usedProfiles.includes(p.profile_name));

        if (!unselectedProf) {

            return this.toast('⚠️ تمت إضافة جميع الباقات المتاحة في مخزنك إلى الفاتورة بالفعل. لزيادة الكمية عدّل عدد الأوراق في البند الموجود.', 'warning');

        }



        const initialSheets = (unselectedProf?.sheets || []).slice(0, 1).map(s => s.sheet_no);

        const initialCards = (unselectedProf?.sheets || []).slice(0, 1).reduce((acc, s) => acc + (s.cards_count || 20), 0);

        const initialPrice = parseFloat(unselectedProf?.unit_price) || 0;



        this.currentSaleItems.push({

            profile_name: unselectedProf?.profile_name || '',

            sheets_count: 1,

            selected_sheets: initialSheets,

            manual_mode: false,

            unit_price: initialPrice,
            discount_rate: 0,

            discount_amount: 0,

            cards_count: initialCards,

            gross_amount: initialCards * initialPrice,

            net_amount: initialCards * initialPrice

        });



        this.renderSaleItemRows();

    },



    removeSaleItemRow(idx) {

        if (this.currentSaleItems.length <= 1) {

            return this.toast('يجب أن تحتوي الفاتورة على بند واحد على الأقل', 'warning');

        }

        this.currentSaleItems.splice(idx, 1);

        this.renderSaleItemRows();

    },



    onSaleItemProfileChange(idx, profName) {

        const isAlreadyUsed = (this.currentSaleItems || []).some((it, i) => i !== idx && it.profile_name === profName);

        if (isAlreadyUsed) {

            this.toast('⚠️ هذه الباقة مضافة بالفعل في بند آخر بالفاتورة. يرجى تعديل عدد أوراق البند السابق بدلاً من تكرار الباقة.', 'warning');

            this.renderSaleItemRows();

            return;

        }



        const item = this.currentSaleItems[idx];

        if (!item) return;



        const prof = this.saleAvailableProfiles.find(p => p.profile_name === profName);

        item.profile_name = profName;

        item.sheets_count = Math.min(item.sheets_count || 1, (prof?.sheets || []).length || 1);

        item.unit_price = parseFloat(prof?.unit_price) || 0;

        item.discount_rate = 0;

        item.discount_amount = 0;



        // Auto sequential allocation

        const avail = prof?.sheets || [];

        item.selected_sheets = avail.slice(0, item.sheets_count).map(s => s.sheet_no);

        item.cards_count = avail.slice(0, item.sheets_count).reduce((acc, s) => acc + (s.cards_count || 20), 0);

        item.gross_amount = item.cards_count * item.unit_price;

        item.net_amount = item.gross_amount;



        this.renderSaleItemRows();

    },



    onSaleItemSheetsCountChange(idx, countVal) {

        const item = this.currentSaleItems[idx];

        if (!item) return;



        const prof = this.saleAvailableProfiles.find(p => p.profile_name === item.profile_name);

        const avail = prof?.sheets || [];

        let count = parseInt(countVal) || 1;

        if (count < 1) count = 1;

        if (count > avail.length) {

            count = avail.length;

            this.toast(`أقصى عدد ورقات متاح للباقة ${item.profile_name} هو ${avail.length} ورقة`, 'warning');

        }



        item.sheets_count = count;

        item.manual_mode = false;

        item.selected_sheets = avail.slice(0, count).map(s => s.sheet_no);

        item.cards_count = avail.slice(0, count).reduce((acc, s) => acc + (s.cards_count || 20), 0);

        item.gross_amount = item.cards_count * item.unit_price;

        item.net_amount = Math.max(0, item.gross_amount - item.discount_amount);



        this.renderSaleItemRows();

    },



    toggleSaleItemManualPicker(idx) {

        const item = this.currentSaleItems[idx];

        if (!item) return;

        item.manual_mode = !item.manual_mode;

        this.renderSaleItemRows();

    },



    onSaleItemSheetToggle(idx, sheetNo, checked) {

        const item = this.currentSaleItems[idx];

        if (!item) return;

        item.manual_mode = true;



        if (checked) {

            if (!item.selected_sheets.includes(sheetNo)) item.selected_sheets.push(sheetNo);

        } else {

            item.selected_sheets = item.selected_sheets.filter(s => s !== sheetNo);

        }



        const prof = this.saleAvailableProfiles.find(p => p.profile_name === item.profile_name);

        let totalCards = 0;

        (prof?.sheets || []).forEach(s => {

            if (item.selected_sheets.includes(s.sheet_no)) {

                totalCards += (s.cards_count || 20);

            }

        });

        item.sheets_count = item.selected_sheets.length;

        item.cards_count = totalCards;

        item.gross_amount = item.cards_count * item.unit_price;

        item.net_amount = Math.max(0, item.gross_amount - item.discount_amount);



        this.renderSaleItemRows();

    },



    onSaleItemDiscountChange(idx, val) {
        const item = this.currentSaleItems[idx];
        if (!item) return;
        // Enforce max 5% cap
        let rate = parseFloat(val) || 0;
        if (rate > 5) { rate = 5; }
        if (rate < 0) { rate = 0; }
        item.discount_rate = rate;
        item.unit_price_discounted = item.unit_price * (1 - rate / 100);
        item.discount_amount = item.cards_count * item.unit_price * rate / 100;
        item.net_amount = Math.max(0, item.gross_amount - item.discount_amount);
        this.renderSaleItemRows();
    },



    renderSaleItemRows() {

        const tbody = document.getElementById('msale-items-body');

        if (!tbody) return;



        tbody.innerHTML = this.currentSaleItems.map((item, idx) => {

            const prof = this.saleAvailableProfiles.find(p => p.profile_name === item.profile_name);

            const availableSheets = prof?.sheets || [];

            const maxSheets = availableSheets.length;



            let sheetRangeText = 'لا توجد أوراق متاحة';

            if (item.selected_sheets && item.selected_sheets.length > 0) {

                const sorted = [...item.selected_sheets].sort((a,b) => a - b);

                const firstFmt = String(sorted[0]).padStart(6, '0');

                const lastFmt = String(sorted[sorted.length - 1]).padStart(6, '0');

                sheetRangeText = (sorted.length > 1) ? `من <b>${firstFmt}</b> إلى <b>${lastFmt}</b>` : `الورقة <b>${firstFmt}</b>`;

            }



            return `

            <tr>

                <td>

                    <select class="mt-select" style="width:100%; font-size:11.5px; font-weight:bold;" onchange="App.onSaleItemProfileChange(${idx}, this.value)">

                        ${(() => {

                            const otherUsed = (this.currentSaleItems || []).filter((_, i) => i !== idx).map(it => it.profile_name);

                            return this.saleAvailableProfiles.map(p => {

                                const isUsedInOther = otherUsed.includes(p.profile_name);

                                return `

                                    <option value="${p.profile_name}" ${item.profile_name === p.profile_name ? 'selected' : ''} ${isUsedInOther ? 'disabled style="color:#94a3b8; background:#f1f5f9;"' : ''}>

                                        ${this.escape(p.display_name || p.name_for_users || p.profile_name)} (${p.total_sheets} ورقة متاحة) ${isUsedInOther ? '🔒 [مضافة في بند آخر]' : ''}

                                    </option>

                                `;

                            }).join('');

                        })()}

                    </select>

                </td>

                <td style="text-align:center;">

                    <input type="number" class="mt-input" style="width:75px; text-align:center; font-weight:800; font-size:13px; color:#0284c7;" value="${item.sheets_count || 1}" min="1" max="${maxSheets}" onchange="App.onSaleItemSheetsCountChange(${idx}, this.value)" />

                </td>

                <td>

                    <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:4px; padding:4px 8px; font-size:11px; display:flex; justify-content:space-between; align-items:center;">

                        <div>

                            📄 ${sheetRangeText} <span style="color:#15803d; font-weight:700;">(${item.selected_sheets.length} ورقة)</span>

                        </div>

                        <button type="button" class="mt-btn" style="padding:1px 5px; font-size:10px;" onclick="App.toggleSaleItemManualPicker(${idx})" title="تحديد ورقات معينة">

                            ${item.manual_mode ? '🔼 إخفاء' : '⚙️ تخصيص'}

                        </button>

                    </div>



                    ${item.manual_mode ? `

                    <div style="max-height:85px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px; padding:4px; background:#fff; border:1px solid #cbd5e1; border-radius:4px; margin-top:4px;">

                        ${availableSheets.map(s => {

                            const isChecked = item.selected_sheets.includes(s.sheet_no);

                            return `

                            <label style="display:inline-flex; align-items:center; gap:3px; font-size:10px; background:${isChecked ? '#e0f2fe' : '#f8fafc'}; border:1px solid ${isChecked ? '#0284c7' : '#cbd5e1'}; padding:2px 5px; border-radius:3px; cursor:pointer;">

                                <input type="checkbox" value="${s.sheet_no}" ${isChecked ? 'checked' : ''} onchange="App.onSaleItemSheetToggle(${idx}, ${s.sheet_no}, this.checked)" />

                                <b>${s.sheet_no_formatted}</b> <small>(${s.cards_count}ك)</small>

                            </label>

                            `;

                        }).join('')}

                    </div>

                    ` : ''}

                </td>

                <td style="text-align:center;">

                    <b style="color:#0f172a; font-size:13px;">${item.cards_count || 0}</b>

                </td>

                <td style="text-align:center;">
                    <b style="font-size:12px; color:#16a34a;">${App.formatMoney(item.unit_price)}</b>
                    ${(item.retail_price && item.retail_price > item.unit_price) ? `
                        <div style="font-size:10px; color:#64748b;">(تجزئة: ${App.formatMoney(item.retail_price)})</div>
                    ` : ''}
                </td>
                <td style="text-align:center;">
                    <span style="font-weight:700; font-size:12px;">${App.formatMoney(item.gross_amount || 0)}</span>
                </td>

                <td style="text-align:center;">
                    <div style="display:flex; align-items:center; justify-content:center; gap:3px;">
                        <input type="number" class="mt-input" style="width:55px; text-align:center; font-size:12px; color:#0891b2; font-weight:bold;" value="${item.discount_rate || 0}" min="0" max="5" step="0.5" oninput="App.onSaleItemDiscountChange(${idx}, this.value)" title="أقصى خصم 5%" />
                        <span style="font-weight:bold; color:#0891b2; font-size:12px;">%</span>
                    </div>
                    ${(item.discount_rate > 0) ? `<div style="font-size:10px; color:#e74c3c; text-align:center; margin-top:2px;">= -${App.formatMoney(item.discount_amount)}</div>` : ''}
                </td>
                <td style="text-align:center;">
                    ${(item.discount_rate > 0) ? `
                        <div style="font-size:10px; color:#94a3b8; text-decoration:line-through;">${App.formatMoney(item.unit_price)}/كرت</div>
                        <b style="color:#0891b2; font-size:12px;">${App.formatMoney(item.unit_price_discounted || item.unit_price)}/كرت</b>
                        <div style="font-size:11.5px; color:#0284c7; font-weight:bold; border-top:1px solid #e2e8f0; margin-top:2px; padding-top:2px;">${App.formatMoney(item.net_amount || 0)}</div>
                    ` : `<b style="color:#0284c7; font-size:12.5px;">${App.formatMoney(item.net_amount || 0)}</b>`}
                </td>

                <td style="text-align:center;">

                    <button type="button" class="mt-btn mt-btn-danger" style="padding:2px 6px; font-size:11px;" onclick="App.removeSaleItemRow(${idx})">✕</button>

                </td>

            </tr>

            `;

        }).join('');



        this.calcMultiSaleTotals();

    },



    onMultiSalePayTypeChange(payType) {

        const netTotal = this.currentSaleNetTotal || 0;

        const paidInput = document.getElementById('msale-paid-amt');

        if (!paidInput) return;



        if (payType === 'cash') {

            paidInput.value = netTotal;

            paidInput.readOnly = true;

            paidInput.style.background = '#f1f5f9';

        } else if (payType === 'credit') {

            paidInput.value = 0;

            paidInput.readOnly = true;

            paidInput.style.background = '#f1f5f9';

        } else {

            paidInput.readOnly = false;

            paidInput.style.background = '#ffffff';

        }

        this.calcMultiSaleTotals();

    },



    currentSaleNetTotal: 0,



    calcMultiSaleTotals() {

        let totalSheets = 0;

        let totalCards = 0;

        let totalGross = 0;

        let totalDisc = 0;

        let totalNet = 0;



        this.currentSaleItems.forEach(item => {

            totalSheets += (item.selected_sheets || []).length;

            totalCards += (item.cards_count || 0);

            const gross = (item.cards_count || 0) * (item.unit_price || 0);

            item.gross_amount = gross;

            item.discount_amount = gross * (item.discount_rate || 0) / 100;
            item.unit_price_discounted = item.unit_price * (1 - (item.discount_rate || 0) / 100);
            item.net_amount = Math.max(0, gross - item.discount_amount);
            totalGross += item.gross_amount;
            totalDisc += item.discount_amount;

            totalNet += item.net_amount;

        });



        this.currentSaleNetTotal = totalNet;



        const sheetsEl = document.getElementById('msale-sum-sheets');

        if (sheetsEl) sheetsEl.innerText = totalSheets;



        const cardsEl = document.getElementById('msale-sum-cards');

        if (cardsEl) cardsEl.innerText = `${totalCards.toLocaleString()} كرت`;



        const grossEl = document.getElementById('msale-sum-gross');

        if (grossEl) grossEl.innerText = App.formatMoney(totalGross);



        const discEl = document.getElementById('msale-sum-disc');

        if (discEl) discEl.innerText = `-${App.formatMoney(totalDisc)}`;



        const netEl = document.getElementById('msale-sum-net');

        if (netEl) netEl.innerText = App.formatMoney(totalNet);



        const payType = document.getElementById('msale-pay-type')?.value;

        const paidInput = document.getElementById('msale-paid-amt');

        if (paidInput) {

            if (payType === 'cash') {

                paidInput.value = totalNet;

                paidInput.readOnly = true;

                paidInput.style.background = '#f1f5f9';

            } else if (payType === 'credit') {

                paidInput.value = 0;

                paidInput.readOnly = true;

                paidInput.style.background = '#f1f5f9';

            } else {

                paidInput.readOnly = false;

                paidInput.style.background = '#ffffff';

            }

        }



        const paid = parseFloat(paidInput?.value) || 0;

        const rem = Math.max(0, totalNet - paid);



        const remEl = document.getElementById('msale-rem-amt');

        if (remEl) remEl.value = App.formatMoney(rem);



        const netTafqeet = document.getElementById('msale-net-tafqeet');

        if (netTafqeet) {

            netTafqeet.innerText = totalNet > 0 ? ('📝 فقط ' + App.tafqeet(totalNet)) : '';

        }



        const paidTafqeet = document.getElementById('msale-paid-tafqeet');

        if (paidTafqeet) {

            paidTafqeet.innerText = paid > 0 ? ('📝 فقط ' + App.tafqeet(paid)) : '';

        }

    },



    onSaleFormSubmit(e) {

        e.preventDefault();

        const buyerId = document.getElementById('msale-buyer').value;

        if (!buyerId) return this.toast('يرجى اختيار المشتري', 'warning');



        const validItems = this.currentSaleItems.filter(item => item.selected_sheets && item.selected_sheets.length > 0);

        if (validItems.length === 0) {

            return this.toast('يرجى تحديد ورقة/صفحة واحدة على الأقل للبيع', 'warning');

        }



        const buyer = this.saleEligibleBuyers.find(x => x.id == buyerId);

        const payType = document.getElementById('msale-pay-type').value;

        const paidAmount = parseFloat(document.getElementById('msale-paid-amt').value) || 0;

        const notes = document.getElementById('msale-notes').value.trim();



        const payload = {

            buyer_id: Number(buyerId),

            payment_type: payType,

            paid_amount: paidAmount,

            notes: notes,

            items: validItems.map(it => ({

                profile_name: it.profile_name,

                sheets_count: it.sheets_count,

                sheet_numbers: it.selected_sheets,

                unit_price: it.unit_price,

                discount_rate: it.discount_rate || 0,
                discount_amount: it.discount_amount || 0

            }))

        };



        this.showSaleConfirmationModal(payload, buyer, validItems);

    },



    showSaleConfirmationModal(payload, buyer, items) {

        let totalCards = 0;

        let totalSheets = 0;

        let totalGross = 0;

        let totalDisc = 0;

        let totalNet = 0;



        items.forEach(it => {

            totalCards += it.cards_count;

            totalSheets += it.selected_sheets.length;

            totalGross += it.gross_amount;

            totalDisc += it.discount_amount;

            totalNet += it.net_amount;

        });



        const remAmount = Math.max(0, totalNet - payload.paid_amount);



        const modal = document.getElementById('modal-container');

        modal.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:620px; max-width:96vw; max-height:92vh;">

                <div class="mt-modal-header">

                    <span>🧾 تأكيد بيانات فاتورة المبيعات وتفعيل الكروت</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-modal-body" style="padding:16px 20px;">

                    

                    <div style="text-align:center; margin-bottom:14px;">

                        <div style="font-size:18px; font-weight:800; color:#0284c7;">

                            تأكيد بيع ${totalCards.toLocaleString()} كرت (${totalSheets} ورقة A4)

                        </div>

                        <div style="font-size:12px; color:#64748b; margin-top:2px;">

                            سيتم تفعيل كافة الكروت في FreeRADIUS وقيد المبلغ وإصدار رابط واتساب

                        </div>

                    </div>



                    <table class="mt-table" style="font-size:12px; margin-bottom:14px;">

                        <tbody>

                            <tr>

                                <td style="width:140px; font-weight:bold; background:#f8fafc;">المشتري:</td>

                                <td><b>${this.escape(buyer?.fullname || '-')}</b> (${this.escape(buyer?.role_name_ar || buyer?.role || '-')})</td>

                            </tr>

                            <tr>

                                <td style="font-weight:bold; background:#f8fafc;">البنود والكميات:</td>

                                <td>

                                    ${items.map(it => `

                                        <div>• <b>${it.profile_name}</b>: ${it.selected_sheets.length} ورقة (${it.cards_count} كرت) - الصافي: ${App.formatMoney(it.net_amount)}</div>

                                    `).join('')}

                                </td>

                            </tr>

                            <tr style="background:#f0fdf4;">

                                <td style="font-weight:bold; color:#15803d;">💰 الصافي المطلوب:</td>

                                <td><b style="color:#15803d; font-size:14px;">${App.formatMoney(totalNet)}</b> (إجمالي قبل الخصم: ${App.formatMoney(totalGross)}${totalDisc > 0 ? ` | خصم: -${App.formatMoney(totalDisc)}` : ''})</td>

                            </tr>

                            <tr style="background:#eff6ff;">

                                <td style="font-weight:bold; color:#1e40af;">💵 طريقة السداد والمدفوع:</td>

                                <td>

                                    <b>${payload.payment_type === 'cash' ? 'نقداً بالكامل' : (payload.payment_type === 'credit' ? 'آجل بالكامل' : 'دفعة نقدية وآجل')}</b>

                                    (المدفوع: <b style="color:#15803d;">${App.formatMoney(payload.paid_amount)}</b> | المتبقي آجل: <b style="color:#dc2626;">${App.formatMoney(remAmount)}</b>)

                                </td>

                            </tr>

                            ${payload.notes ? `

                            <tr>

                                <td style="font-weight:bold; background:#f8fafc;">ملاحظات:</td>

                                <td>${this.escape(payload.notes)}</td>

                            </tr>

                            ` : ''}

                        </tbody>

                    </table>



                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center;">

                    <button type="button" class="mt-btn" onclick="App.showSaleModal()">${this.t('back')}</button>

                    <button type="button" class="mt-btn mt-btn-success" style="font-weight:bold; font-size:13px; padding:8px 22px;" onclick='App.executeConfirmedSale(${JSON.stringify(payload).replace(/'/g, "&#39;")})'>

                        ✅ تأكيد البيع والتفعيل الفوري

                    </button>

                </div>

            </div>

        </div>

        `;

    },



        onFilterSaleBuyers(keyword) {

        const select = document.getElementById('msale-buyer');

        if (!select) return;

        const q = (keyword || '').toLowerCase().trim();

        let firstMatch = '';

        for (let i = 1; i < select.options.length; i++) {

            const opt = select.options[i];

            const searchData = (opt.getAttribute('data-search') || opt.text).toLowerCase();

            if (!q || searchData.includes(q)) {

                opt.style.display = '';

                if (!firstMatch) firstMatch = opt.value;

            } else {

                opt.style.display = 'none';

            }

        }

        if (q && firstMatch && select.value !== firstMatch) {

            select.value = firstMatch;

            this.onMultiSaleBuyerChange(firstMatch);

        }

    },



    showQuickAddPosModal() {

        const maxDisc = this.currentAdminDiscountRate || 0;

        const quickHtml = `

        <div class="mt-modal-backdrop" id="quick-pos-backdrop" style="z-index:10050;" onclick="if(event.target===this) document.getElementById('quick-pos-backdrop').remove()">

            <div class="mt-modal" style="width:520px; max-width:95vw; box-shadow:0 12px 35px rgba(0,0,0,0.35); border:1px solid #cbd5e1;">

                <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff;">

                    <span style="font-weight:bold; font-size:14px;">🏪 ➕ إضافة نقطة بيع / عميل سريع للفاتورة</span>

                    <span style="cursor:pointer;" onclick="document.getElementById('quick-pos-backdrop').remove()">✕</span>

                </div>

                <form onsubmit="App.saveQuickPosForm(event)">

                    <div class="mt-modal-body" style="padding:16px;">

                        <div class="form-row">

                            <div class="form-group" style="flex:1;">

                                <label style="font-weight:700;">الاسم الكامل / اسم المحل *</label>

                                <input type="text" id="qpos-fullname" class="mt-input" style="width:100%; font-weight:bold;" placeholder="مثال: بقالة الأمل" required />

                            </div>

                            <div class="form-group" style="flex:1; display:none;" aria-hidden="true">

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">

                                    <label style="font-weight:700; margin:0;">اسم المستخدم (Username) *</label>

                                    <button type="button" class="mt-btn" style="padding:1px 6px; font-size:10px; background:#f0fdf4; color:#16a34a; border-color:#86efac;" onclick="App.generateQuickUsername()">🎲 توليد</button>

                                </div>

                                <input type="hidden" id="qpos-user" />

                            </div>

                        </div>

                        <div class="form-row">

                            <div class="form-group" style="flex:1.2; display:none;" aria-hidden="true">

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">

                                    <label style="margin:0; font-weight:700;">🔒 كلمة المرور *</label>

                                    <button type="button" class="mt-btn" style="padding:1px 6px; font-size:10px; background:#f0fdf4; color:#16a34a; border-color:#86efac;" onclick="App.generateQuickPassword()">🎲 توليد</button>

                                </div>

                                <input type="hidden" id="qpos-pass" />

                            </div>

                            <div class="form-group" style="flex:1 1 100%;">

                                <label style="font-weight:700;">رقم الهاتف / الواتساب *</label>

                                <div class="phone-input-group" style="display:flex; direction:ltr; align-items:stretch; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-window);">

    <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:12.5px; padding:0 10px; display:inline-flex; align-items:center; border-right:1px solid #bae6fd; user-select:none; font-family:monospace;">

        🇾🇪 +967

    </span>

    <input type="tel" id="qpos-phone" class="mt-input" style="flex:1; border:none; border-radius:0; direction:ltr; font-family:monospace; font-weight:700; font-size:14px; padding:8px 10px;" placeholder="77XXXXXXX (9 أرقام)" inputmode="numeric" autocomplete="tel-national" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" required />

</div>

                            </div>

                        </div>

                        <div style="margin:-4px 0 12px; padding:9px 11px; border:1px solid #bfdbfe; border-radius:7px; background:#eff6ff; color:#1e40af; font-size:11.5px; line-height:1.7;">
                            🔐 سيُنشئ النظام اسم المستخدم وكلمة المرور تلقائيًا، ويرسل بيانات الدخول وروابط النظام والتطبيق إلى رقم واتساب المسجل.
                        </div>

                        <div class="form-row" style="margin-bottom:0;">

                            <div class="form-group" style="flex:1;">

                                <label>نسبة الخصم الممنوحة %</label>

                                <input type="number" id="qpos-disc" class="mt-input" style="width:100%;" min="0" max="${(this.userRole === 'system_owner' || this.userRole === 'superadmin') ? '100' : maxDisc}" value="0" step="0.5" />

                                ${this.userRole !== 'system_owner' && this.userRole !== 'superadmin' ? `<small style="font-size:10px; color:#64748b;">أقصى نسبة: ${maxDisc}%</small>` : ''}

                            </div>

                            <div class="form-group" style="flex:1;">

                                <label>سقف المديونية الأقصى (${App.getCurrencySymbol(App._baseCurrency)})</label>

                                <input type="number" id="qpos-credit" class="mt-input" style="width:100%;" min="0" value="0" />

                            </div>

                        </div>

                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="document.getElementById('quick-pos-backdrop').remove()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:bold; padding:7px 22px;">💾 حفظ واختيار فوري</button>

                    </div>

                </form>

            </div>

        </div>

        `;

        const wrapper = document.createElement('div');

        wrapper.innerHTML = quickHtml;

        document.body.appendChild(wrapper.firstElementChild);

        this.quickPosCredentialsReady = Promise.all([
            this.generateQuickUsername(),
            Promise.resolve(this.generateQuickPassword())
        ]);

    },



    async generateQuickUsername() {

        const userField = document.getElementById('qpos-user');

        if (!userField) return;

        try {

            const res = await this.api('get_next_username', { role: 'pos_agent' });

            if (res && res.username) {

                userField.value = res.username;

                return userField.value;

            }

        } catch(e) {
            console.error('تعذر توليد اسم مستخدم نقطة البيع من الخادم:', e);
            this.toast?.('تعذر الحصول على اسم مستخدم تلقائي؛ تم إنشاء اسم مؤقت.', 'warning');
        }
        const rnd = Math.floor(1000 + Math.random() * 9000);

        userField.value = 'pos_' + rnd;

        return userField.value;

    },



    suggestPosUsername(name) {

        const userField = document.getElementById('qpos-user');

        if (!userField) return;

        if (!userField.value || userField.value === 'pos_user') {

            this.generateQuickUsername();

        }

    },



    generateQuickPassword() {

        const pField = document.getElementById('qpos-pass');

        if (!pField) return;

        const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lower = 'abcdefghijkmnopqrstuvwxyz';
        const digits = '23456789';
        const symbols = '!@#$%^&*_-+=';
        const all = upper + lower + digits + symbols;
        const randomIndex = max => {
            if (window.crypto?.getRandomValues) {
                const limit = Math.floor(0x100000000 / max) * max;
                const buffer = new Uint32Array(1);
                do { window.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
                return buffer[0] % max;
            }
            return Math.floor(Math.random() * max);
        };
        const pick = chars => chars[randomIndex(chars.length)];
        const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
        while (chars.length < 16) chars.push(pick(all));
        for (let i = chars.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        pField.value = chars.join('');
        return pField.value;

    },



    async saveQuickPosForm(e) {

        e.preventDefault();

        try {
            if (this.quickPosCredentialsReady) await this.quickPosCredentialsReady;
            const usernameField = document.getElementById('qpos-user');
            const passwordField = document.getElementById('qpos-pass');
            if (!usernameField?.value) await this.generateQuickUsername();
            if (!passwordField?.value) this.generateQuickPassword();
            if (!usernameField?.value || !passwordField?.value) throw new Error('تعذر إنشاء بيانات الدخول تلقائيًا');
        } catch (error) {
            this.toast(error?.message || 'تعذر تجهيز بيانات الدخول، أعد المحاولة', 'danger');
            return;
        }

        const phoneField = document.getElementById('qpos-phone');
        const phoneVal = (phoneField?.value || '').replace(/\D/g, '');
        if (!/^(77|78|70|71|73)\d{7}$/.test(phoneVal)) {
            this.toast('⚠️ أدخل رقم واتساب يمني صحيحًا من 9 أرقام يبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)', 'warning');
            phoneField?.focus();
            return;
        }

        const qDiscVal = parseFloat(document.getElementById('qpos-disc')?.value) || 0;

        if (this.userRole !== 'system_owner' && this.userRole !== 'superadmin' && qDiscVal > (this.currentAdminDiscountRate || 0)) {

            this.toast(`⚠️ نسبة الخصم (${qDiscVal}%) تتجاوز سقف الخصم المسموح لحسابك (${this.currentAdminDiscountRate || 0}%)!`, 'danger');

            document.getElementById('qpos-disc')?.focus();

            return;

        }



        const payload = {

            username: document.getElementById('qpos-user').value.trim(),

            fullname: document.getElementById('qpos-fullname').value.trim(),

            password: document.getElementById('qpos-pass').value.trim(),

            phone: phoneVal,

            role: 'pos_agent',

            parent_id: this.adminId,

            data_scope: 'own',

            discount_rate: qDiscVal,

            credit_limit: parseFloat(document.getElementById('qpos-credit')?.value) || 0,

            system_url: 'http://palapox.ddns.net:8099',

            is_active: 1

        };



        const res = await this.api('save_admin', payload, 'POST');

        if (res && res.success) {

            if (res.whatsapp_sent) {

                this.toast(`✅ تم إضافة نقطة البيع (${payload.fullname}) وإرسال بيانات الدخول عبر واتساب بنجاح! 📱`, 'success');

            } else if (res.whatsapp_error) {

                this.toast(`✅ تم إضافة نقطة البيع (⚠️ تعذر إرسال الواتساب: ${res.whatsapp_error})`, 'warning');

            } else {

                this.toast('✅ تم إضافة نقطة البيع بنجاح!', 'success');

            }

            document.getElementById('quick-pos-backdrop')?.remove();

            

            // Reload eligible accounts

            const accRes = await this.api('get_sales_eligible_accounts');

            this.saleEligibleBuyers = accRes?.accounts || [];

            

            // Re-render datalist options
            const datalist = document.getElementById('msale-buyer-list');
            const hiddenBuyer = document.getElementById('msale-buyer');
            const inputBuyer = document.getElementById('msale-buyer-input');

            if (datalist) {
                datalist.innerHTML = this.saleEligibleBuyers.map(b => `
                    <option data-id="${b.id}" data-role="${b.role}" data-disc="${b.discount_rate}" data-quota="${b.max_cards_quota}" data-search="${this.escape(((b.fullname||'') + ' ' + (b.username||'') + ' ' + (b.phone||'') + ' ' + (b.role_name_ar||b.role||'')).toLowerCase())}" value="${this.escape(b.fullname)} (@${this.escape(b.username)}) - [${this.escape(b.role_name_ar || b.role)}] [سقف الخصم: ${b.discount_rate}%]">
                        ${this.escape(b.fullname)} (@${this.escape(b.username)})
                    </option>
                `).join('');
            }

            if (hiddenBuyer) {
                hiddenBuyer.value = res.id;
            }
            if (inputBuyer) {
                const newB = this.saleEligibleBuyers.find(x => Number(x.id) === Number(res.id));
                if (newB) {
                    inputBuyer.value = `${newB.fullname} (@${newB.username}) - [${newB.role_name_ar || newB.role}] [سقف الخصم: ${newB.discount_rate}%]`;
                }
            }

            this.onMultiSaleBuyerChange(res.id);

        } else {

            this.toast(res?.error || 'تعذر إضافة نقطة البيع', 'danger');

        }

    },



async executeConfirmedSale(payload) {

        this.closeModal();

        this.toast('جاري إصدار الفاتورة وتفعيل الكروت في FreeRADIUS...', 'info');



        const res = await this.api('create_sale_invoice', {}, 'POST', payload);

        if (res && res.success) {

            this.toast(res.message || 'تم إصدار الفاتورة وتفعيل الكروت بنجاح', 'success');

            this.showInvoiceSuccessModal(res);

            this.renderSales();

        } else {

            this.toast(res?.error || 'فشل إصدار الفاتورة', 'danger');

        }

    },



    showInvoiceSuccessModal(res) {

        const modal = document.getElementById('modal-container');

        modal.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:580px; max-width:96vw;">

                <div class="mt-modal-header" style="background:#15803d; color:#fff;">

                    <span>✅ تم إصدار الفاتورة وتفعيل الكروت بنجاح</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-modal-body" style="padding:20px; text-align:center;">

                    

                    <div style="font-size:42px; margin-bottom:10px;">🎉</div>

                    <div style="font-size:18px; font-weight:800; color:#15803d; margin-bottom:4px;">

                        تم إنشاء الفاتورة رقم: <code>${this.escape(res.invoice_no)}</code>

                    </div>

                    <div style="font-size:13px; color:#475569; margin-bottom:16px;">

                        تم تفعيل <b>${res.total_cards} كرت</b> (${res.total_sheets} ورقة A4) للمشتري <b>${this.escape(res.buyer_name)}</b>

                    </div>



                    <!-- Financial Summary Box -->

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:16px; text-align:right; font-size:12.5px;">

                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">

                            <span style="color:#64748b;">الصافي المطلوب:</span>

                            <b style="color:#0f172a;">${App.formatMoney(res.total_amount)}</b>

                        </div>

                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">

                            <span style="color:#64748b;">المسدد نقداً:</span>

                            <b style="color:#15803d;">${App.formatMoney(res.paid_amount)}</b>

                        </div>

                        <div style="display:flex; justify-content:space-between; border-top:1px solid #cbd5e1; padding-top:4px;">

                            <span style="color:#64748b;">المتبقي آجل على الحساب:</span>

                            <b style="color:${res.remaining_amount > 0 ? '#dc2626' : '#64748b'};">${App.formatMoney(res.remaining_amount)}</b>

                        </div>

                    </div>



                    <!-- WhatsApp & Print Action Buttons -->

                    <div style="display:flex; flex-direction:column; gap:8px;">

                        <button class="mt-btn mt-btn-success" style="font-weight:bold; font-size:14px; padding:10px 16px; width:100%; display:flex; justify-content:center; align-items:center; gap:8px;" onclick="window.open('${res.whatsapp_url}', '_blank')">

                            <span style="font-size:18px;">📲</span> إرسال الفاتورة للعميل عبر واتساب (WhatsApp)

                        </button>

                        <div style="display:flex; gap:8px;">

                            <button class="mt-btn mt-btn-primary" style="flex:1; padding:8px 12px; font-weight:700;" onclick="App.printSaleInvoice(${res.invoice_id})">

                                🖨️ طباعة الفاتورة والإيصال

                            </button>

                            <button class="mt-btn" style="flex:1; padding:8px 12px;" onclick="App.copyInvoiceText('${this.escape(res.whatsapp_message || '').replace(/'/g, "\'")}')">

                                📋 نسخ نص الفاتورة

                            </button>

                        </div>

                    </div>



                </div>

                <div class="mt-modal-footer">

                    <button type="button" class="mt-btn" onclick="App.closeModal()" style="width:100%;">إغلاق</button>

                </div>

            </div>

        </div>

        `;

    },



    copyInvoiceText(text) {

        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {

            this.toast('📋 تم نسخ نص الفاتورة للحافظة بنجاح', 'success');

        }).catch(() => {

            this.toast('تعذر النسخ التلقائي', 'warning');

        });

    },



    async shareInvoiceWhatsApp(invoiceId) {

        const res = await this.api('get_sale_invoice_details', { invoice_id: invoiceId });

        if (res && res.success && res.invoice) {

            const inv = res.invoice;

            const buyerPhone = (inv.buyer_phone || '').replace(/[^0-9]/g, '');

            let phone = buyerPhone;

            if (phone.startsWith('0')) phone = '967' + phone.substring(1);

            else if (phone.length === 9 && !phone.startsWith('967')) phone = '967' + phone;



            let itemsText = "";

            (inv.items || []).forEach((pItm, idx) => {

                const num = idx + 1;

                const sheetsArr = (pItm.sheet_numbers || '').split(',');

                const firstS = sheetsArr[0] ? String(sheetsArr[0]).padStart(6, '0') : '';

                const lastS = sheetsArr[sheetsArr.length - 1] ? String(sheetsArr[sheetsArr.length - 1]).padStart(6, '0') : '';

                const sheetRangeStr = (sheetsArr.length > 1) ? `${firstS} إلى ${lastS}` : firstS;



                itemsText += `🔹 *بند ${num}:* باقة ${pItm.profile_name}\n`;

                itemsText += `   • الكمية: ${pItm.sheets_count} ورقة (${pItm.cards_count} كرت)\n`;

                itemsText += `   • أرقام الأوراق: ${sheetRangeStr}\n`;

                itemsText += `   • السعر: ${App.formatMoney(pItm.gross_amount)}\n`;

            });



            let waMessage = `🧾 *فاتورة مبيعات كروت إنترنت رسمية*\n`;

            waMessage += `------------------------------------\n`;

            waMessage += `📋 *رقم الفاتورة:* ${inv.invoice_no}\n`;

            waMessage += `📅 *التاريخ:* ${inv.created_at || ''}\n`;

            waMessage += `👤 *العميل:* ${inv.buyer_name}\n`;

            waMessage += `🏢 *البائع:* ${inv.seller_name}\n`;

            waMessage += `------------------------------------\n`;

            waMessage += itemsText;

            waMessage += `------------------------------------\n`;

            waMessage += `💰 *الإجمالي قبل الخصم:* ${App.formatMoney(inv.total_amount + inv.discount_amount)}\n`;

            if (inv.discount_amount > 0) {

                waMessage += `🏷️ *الخصم الممنوح:* -${App.formatMoney(inv.discount_amount)}\n`;

            }

            waMessage += `💵 *الصافي المطلوب:* ${App.formatMoney(inv.total_amount)}\n`;

            waMessage += `✅ *المسدد نقداً:* ${App.formatMoney(inv.paid_amount)}\n`;

            if (inv.remaining_amount > 0) {

                waMessage += `🔴 *المتبقي آجل:* ${App.formatMoney(inv.remaining_amount)}\n`;

            }

            waMessage += `------------------------------------\n`;

            waMessage += `⚡ *حالة الكروت:* تم تفعيل كافة الكروت (${inv.quantity} كرت) بنجاح وتعمل الآن فوراً.\n`;

            waMessage += `🙏 شكراً لتعاملكم معنا!`;



            const waUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(waMessage)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;

            window.open(waUrl, '_blank');

        } else {

            this.toast('تعذر جلب بيانات الفاتورة', 'danger');

        }

    },



    

    // ==========================================

    // INVOICE PAYMENT & VOUCHERS MANAGEMENT

    // ==========================================

    async showPayInvoiceModal(invoiceId) {

        this.toast('جاري تجهيز بيانات سداد الفاتورة...', 'info');

        const [res, adminsRes] = await Promise.all([

            this.api('get_sale_invoice_details', { invoice_id: invoiceId }),

            this.api('get_admins')

        ]);

        if (!res || !res.invoice) return;

        const inv = res.invoice;

        if (Number(inv.buyer_id) === Number(this.adminId) && this.userRole !== 'system_owner' && this.userRole !== 'superadmin') {

            this.toast('غير مصرح: لا يمكن سداد فاتورة مشتريات من حساب المشتري نفسه. السداد يتم بواسطة البائع (المحصل)', 'danger');

            return;

        }

        const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);



        if (parseFloat(inv.remaining_amount) <= 0) {

            this.toast('هذه الفاتورة مسددة بالكامل!', 'success');

            return;

        }



        const remaining = parseFloat(inv.remaining_amount);

        const total = parseFloat(inv.total_amount);

        const paid = parseFloat(inv.paid_amount);



        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:540px;">

                <div class="mt-modal-header" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff;">

                    <span style="font-size:15px; font-weight:800;">💵 سداد نقدي لفاتورة مبيعات [ ${this.escape(inv.invoice_no)} ]</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form onsubmit="App.submitPayInvoice(event, ${inv.id})">

                    <div class="mt-modal-body" style="padding:16px;">

                        <!-- Invoice Financial Snapshot -->

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">

                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px;">

                                <div><b>👤 العميل / المشتري:</b> <span style="font-weight:bold; color:#0f172a;">${this.escape(inv.buyer_name)}</span></div>

                                <div><b>🏢 البائع الأصلي:</b> <span style="color:#64748b;">${this.escape(inv.seller_name || '-')}</span></div>

                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center;">

                                <div style="background:#fff; padding:6px; border-radius:6px; border:1px solid #e2e8f0;">

                                    <div style="font-size:10.5px; color:#64748b;">إجمالي الفاتورة</div>

                                    <div style="font-size:14px; font-weight:bold; color:#0f172a;">${App.formatMoney(total)}</div>

                                </div>

                                <div style="background:#fff; padding:6px; border-radius:6px; border:1px solid #e2e8f0;">

                                    <div style="font-size:10.5px; color:#166534;">المسدد سابقاً</div>

                                    <div style="font-size:14px; font-weight:bold; color:#16a34a;">${App.formatMoney(paid)}</div>

                                </div>

                                <div style="background:#fef2f2; padding:6px; border-radius:6px; border:1px solid #fca5a5;">

                                    <div style="font-size:10.5px; color:#991b1b; font-weight:bold;">المتبقي للدفع</div>

                                    <div style="font-size:14px; font-weight:900; color:#dc2626;">${App.formatMoney(remaining)}</div>

                                </div>

                            </div>

                        </div>



                        <!-- Collector Selection (المحصل المستلم للنقدية) -->

                        <div class="form-group" style="margin-bottom:12px;">

                            <label style="font-weight:700; color:#0f172a;">👤 المحصل المستلم للنقدية / الصندوق المستلم:</label>

                            <select id="pay-inv-collector" class="mt-select" style="width:100%; font-weight:bold; background:#f0fdf4; border-color:#86efac; color:#166534;">

                                ${admins.map(a => `

                                    <option value="${a.id}" ${a.id == App.adminId ? 'selected' : ''}>

                                        ${this.escape(a.fullname || a.username)} (${a.role || 'مستخدم'}) ${a.id == App.adminId ? '★ (أنت - المستخدم الحالي)' : ''}

                                    </option>

                                `).join('')}

                            </select>

                            <div style="font-size:10.5px; color:#64748b; margin-top:3px;">

                                💡 سيتم قيد النقدية في عهدة وصندوق وحساب المحصل المختار، وخصم المبلغ من مديونية المشتري.

                            </div>

                        </div>



                        <!-- Payment Amount Input -->

                        <div class="form-group" style="margin-bottom:12px;">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">

                                <label style="font-weight:700;">المبلغ المسدد نقدياً (${App.getCurrencySymbol(App._baseCurrency)}):</label>

                                <div style="display:flex; gap:4px;">

                                    <button type="button" class="mt-btn" style="padding:2px 6px; font-size:10.5px; background:#e0f2fe; color:#0369a1;" onclick="document.getElementById('pay-inv-amount').value = ${remaining}; document.getElementById('pay-inv-amount').dispatchEvent(new Event('input'));">

                                        سداد كامل المتبقي (100%)

                                    </button>

                                    ${remaining > 1000 ? `

                                    <button type="button" class="mt-btn" style="padding:2px 6px; font-size:10.5px;" onclick="document.getElementById('pay-inv-amount').value = ${Math.round(remaining / 2)}; document.getElementById('pay-inv-amount').dispatchEvent(new Event('input'));">

                                        50%

                                    </button>

                                    ` : ''}

                                </div>

                            </div>

                            <input type="number" id="pay-inv-amount" min="0.01" max="${remaining}" step="any" class="mt-input" style="width:100%; font-size:17px; font-weight:900; color:#059669;" value="${remaining}" required oninput="const tf = document.getElementById('pay-inv-tafqeet'); if(tf) tf.innerText = App.tafqeet(this.value);" />

                            <div id="pay-inv-tafqeet" style="font-size:11.5px; color:#0284c7; font-weight:bold; margin-top:4px; min-height:16px;">

                                ${App.tafqeet(remaining)}

                            </div>

                        </div>



                        <!-- Payment Method & Account -->

                        <div class="form-row" style="margin-bottom:12px;">

                            <div class="form-group">

                                <label>طريقة السداد والتحصيل:</label>

                                <select id="pay-inv-method" class="mt-select" style="width:100%">

                                    <option value="cash">نقداً (الصندوق النقدي للعهدة)</option>

                                    <option value="kareemi">الكريمي اكسبرس / حساب</option>

                                    <option value="onecash">ون كاش (OneCash)</option>

                                    <option value="bank">تحويل بنكي</option>

                                    <option value="other">أخرى</option>

                                </select>

                            </div>

                        </div>



                        <!-- Notes -->

                        <div class="form-group">

                            <label>ملاحظات السند / البيان:</label>

                            <input type="text" id="pay-inv-notes" class="mt-input" style="width:100%" placeholder="سداد دفعة نقدية لفاتورة مبيعات رقم ${this.escape(inv.invoice_no)}" value="سداد نقدي لفاتورة مبيعات رقم ${this.escape(inv.invoice_no)}" />

                        </div>

                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:700;">

                            💵 اعتماد سند السداد وإيداع المبلغ في عهدة المحصل

                        </button>

                    </div>

                </form>

            </div>

        </div>

        `;

    },



    async submitPayInvoice(e, invoiceId) {

        e.preventDefault();

        const amountVal = parseFloat(document.getElementById('pay-inv-amount')?.value);

        if (!amountVal || amountVal <= 0) {

            this.toast('يرجى كتابة مبلغ صحيح أكبر من الصفر', 'warning');

            return;

        }



        const collectorId = parseInt(document.getElementById('pay-inv-collector')?.value) || App.adminId || 1;



        const payload = {

            invoice_id: invoiceId,

            amount: amountVal,

            collector_id: collectorId,

            payment_method: document.getElementById('pay-inv-method')?.value || 'cash',

            notes: document.getElementById('pay-inv-notes')?.value || ''

        };



        this.toast('جاري تسجيل سند سداد الفاتورة...', 'info');

        const res = await this.api('pay_sale_invoice', {}, 'POST', payload);

        if (res && res.success) {

            this.toast(res.message || 'تم تسجيل سند السداد بنجاح!', 'success');

            this.closeModal();

            if (this.currentTab === 'sales') {

                this.renderSales();

            } else if (this.currentTab === 'cashbox_accounts') {

                this.renderCashbox();

            }

        } else {

            this.toast(res?.error || 'فشل تسجيل سند السداد', 'danger');

        }

    },



    async showInvoiceVouchersModal(invoiceId) {

        this.toast('جاري جلب سندات الفاتورة...', 'info');

        const res = await this.api('get_sale_invoice_details', { invoice_id: invoiceId });

        if (!res || !res.invoice) return;

        const inv = res.invoice;

        const vouchers = inv.vouchers || [];



        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:680px; max-height:90vh;">

                <div class="mt-modal-header" style="background:#0f172a; color:#fff;">

                    <span>🧾 سندات القبض والدفعات المسددة للفاتورة [ ${this.escape(inv.invoice_no)} ]</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-modal-body" style="padding:16px; overflow-y:auto;">

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">

                        <div><b>👤 المشتري:</b> ${this.escape(inv.buyer_name)} (${inv.buyer_role || ''})</div>

                        <div><b>💰 إجمالي الفاتورة:</b> <b style="color:#0284c7;">${App.formatMoney(inv.total_amount)}</b></div>

                        <div><b>💵 المسدد:</b> <b style="color:#16a34a;">${App.formatMoney(inv.paid_amount)}</b></div>

                        <div><b>⏳ المتبقي:</b> <b style="color:${parseFloat(inv.remaining_amount) > 0 ? '#dc2626' : '#16a34a'};">${App.formatMoney(inv.remaining_amount)}</b></div>

                    </div>



                    <table class="mt-table" style="font-size:12px;">

                        <thead>

                            <tr style="background:#f1f5f9;">

                                <th>#</th>

                                <th>رقم السند</th>

                                <th>التاريخ والوقت</th>

                                <th>طريقة الدفع</th>

                                <th>المبلغ المسدد</th>

                                <th>البيان والتفاصيل</th>

                                <th>المستلم</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${vouchers.map((v, idx) => `

                                <tr>

                                    <td>${idx + 1}</td>

                                    <td><code style="font-weight:bold; color:#0284c7;">${this.escape(v.voucher_no || ('RV-' + v.id))}</code></td>

                                    <td style="font-size:11px; color:#64748b;">${v.created_at}</td>

                                    <td><span class="status-pill status-active">${this.escape(v.payment_method || 'نقداً')}</span></td>

                                    <td><b style="color:#16a34a; font-size:13px;">${App.formatMoney(v.amount)}</b></td>

                                    <td><b>${this.escape(v.notes || '-')}</b></td>

                                    <td style="font-size:11px; color:#64748b;">${this.escape(v.creator_name || 'النظام')}</td>

                                </tr>

                            `).join('')}

                            ${vouchers.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:25px; color:var(--text-muted);">لم يتم تسجيل أي سندات قبض لهذه الفاتورة بعد</td></tr>' : ''}

                        </tbody>

                    </table>

                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between;">

                    ${parseFloat(inv.remaining_amount) > 0 ? `

                        <button type="button" class="mt-btn mt-btn-success" onclick="App.closeModal(); App.showPayInvoiceModal(${inv.id});">

                            💵 + سداد دفعة نقدية جديدة الآن

                        </button>

                    ` : `<div></div>`}

                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>

                </div>

            </div>

        </div>

        `;

    },



    async printSaleInvoice(invoiceId) {

        const res = await this.api('get_sale_invoice_details', { invoice_id: invoiceId });

        if (!res || !res.success || !res.invoice) {

            return this.toast('تعذر جلب تفاصيل الفاتورة للطباعة', 'danger');

        }



        const inv = res.invoice;

        const modal = document.getElementById('modal-container');

        modal.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:750px; max-width:96vw; max-height:94vh;">

                <div class="mt-modal-header no-print">

                    <span>🧾 معاينة وطباعة الفاتورة الرسمية</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-toolbar no-print" style="padding:6px 12px; background:#e2e8f0; display:flex; justify-content:space-between;">

                    <div style="display:flex; gap:6px;">

                        <button class="mt-btn mt-btn-success" onclick="App.shareInvoiceWhatsApp(${inv.id})">📲 إرسال واتساب</button>

                        ${parseFloat(inv.remaining_amount) > 0 ? `

                            <button class="mt-btn mt-btn-success" style="font-weight:700;" onclick="App.closeModal(); App.showPayInvoiceModal(${inv.id});">

                                💵 سداد نقدي للفاتورة

                            </button>

                        ` : ''}

                    </div>

                    <div style="display:flex; gap:6px;">

                        <button class="mt-btn mt-btn-primary" onclick="window.print()">🖨️ طباعة الفاتورة A4</button>

                        <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>

                    </div>

                </div>

                <div class="mt-modal-body" style="padding:24px; background:#fff; color:#0f172a; font-family:'Cairo', sans-serif;">

                    

                    <!-- Official Invoice Printable Container -->

                    <div id="printable-invoice" style="border:1px solid #cbd5e1; border-radius:8px; padding:24px;">

                        

                        <!-- Header -->

                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px;">

                            <div>

                                <div style="font-size:20px; font-weight:900; color:#0f172a;">شبكة إنترنت اللاسلكية</div>

                                <div style="font-size:12px; color:#64748b;">نظام إدارة المشتركين والمبيعات (FreeRADIUS ERP)</div>

                            </div>

                            <div style="text-align:left;">

                                <div style="font-size:16px; font-weight:800; color:#0284c7;">فاتورة مبيعات كروت</div>

                                <div style="font-size:13px; font-weight:bold;"><code>${this.escape(inv.invoice_no)}</code></div>

                                <div style="font-size:11px; color:#64748b;">التاريخ: ${inv.created_at || '-'}</div>

                            </div>

                        </div>



                        <!-- Seller / Buyer Meta -->

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; background:#f8fafc; padding:12px; border-radius:6px; margin-bottom:16px; font-size:12px;">

                            <div>

                                <div><b>👤 العميل / المشتري:</b> ${this.escape(inv.buyer_name || '-')}</div>

                                <div><b>📞 الهاتف:</b> <span style="direction:ltr; display:inline-block;">${this.escape(inv.buyer_phone || '-')}</span></div>

                                <div><b>🛡️ الصفة / الرتبة:</b> ${this.escape(inv.buyer_role || '-')}</div>

                            </div>

                            <div>

                                <div><b>🏢 البائع / المسؤول:</b> ${this.escape(inv.seller_name || '-')}</div>

                                <div><b>💳 طريقة السداد:</b> ${inv.payment_type === 'cash' ? 'نقداً بالكامل' : (inv.payment_type === 'credit' ? 'آجل على الحساب' : 'دفعة وآجل')}</div>

                                <div><b>⚡ حالة الكروت:</b> <span style="color:#15803d; font-weight:bold;">مفعلة وتعمل الآن</span></div>

                            </div>

                        </div>



                        <!-- Items Table -->

                        <table class="mt-table" style="font-size:12px; margin-bottom:16px; border:1px solid #cbd5e1;">

                            <thead>

                                <tr style="background:#0f172a; color:#fff;">

                                    <th style="color:#fff;">#</th>

                                    <th style="color:#fff;">الباقة والسرعة</th>

                                    <th style="color:#fff; text-align:center;">الأوراق</th>

                                    <th style="color:#fff;">أرقام الأوراق التسلسلية</th>

                                    <th style="color:#fff; text-align:center;">الكروت</th>

                                    <th style="color:#fff; text-align:center;">سعر الكرت</th>

                                    <th style="color:#fff; text-align:center;">الإجمالي</th>

                                </tr>

                            </thead>

                            <tbody>

                                ${(inv.items || []).map((it, idx) => `

                                <tr>

                                    <td>${idx + 1}</td>

                                    <td><b>${this.escape(it.profile_name)}</b></td>

                                    <td style="text-align:center;">${it.sheets_count} ورقة</td>

                                    <td><code>${this.escape(it.sheet_numbers || '-')}</code></td>

                                    <td style="text-align:center;"><b>${it.cards_count}</b></td>

                                    <td style="text-align:center;">${App.formatMoney(it.unit_price)}</td>

                                    <td style="text-align:center;"><b>${App.formatMoney(it.gross_amount)}</b></td>

                                </tr>

                                `).join('')}

                            </tbody>

                        </table>



                        <!-- Totals Breakdown -->

                        <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">

                            <div style="width:280px; font-size:12.5px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; background:#f8fafc;">

                                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">

                                    <span>الإجمالي قبل الخصم:</span>

                                    <b>${App.formatMoney(inv.total_amount + inv.discount_amount)}</b>

                                </div>

                                ${inv.discount_amount > 0 ? `

                                <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#dc2626;">

                                    <span>الخصم الممنوح:</span>

                                    <b>-${App.formatMoney(inv.discount_amount)}</b>

                                </div>

                                ` : ''}

                                <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:800; color:#0284c7; border-top:1px solid #cbd5e1; padding-top:4px; margin-top:4px;">

                                    <span>الصافي المطلوب:</span>

                                    <b>${App.formatMoney(inv.total_amount)}</b>

                                </div>

                                <div style="display:flex; justify-content:space-between; margin-top:4px; color:#15803d; font-weight:700;">

                                    <span>المسدد نقداً:</span>

                                    <b>${App.formatMoney(inv.paid_amount)}</b>

                                </div>

                                <div style="display:flex; justify-content:space-between; margin-top:4px; color:${inv.remaining_amount > 0 ? '#dc2626' : '#64748b'}; font-weight:700;">

                                    <span>المتبقي آجل:</span>

                                    <b>${App.formatMoney(inv.remaining_amount)}</b>

                                </div>

                            </div>

                        </div>



                        <!-- Attached Payment Vouchers Table -->

                        ${(inv.vouchers && inv.vouchers.length > 0) ? `

                        <div style="margin-bottom:16px;">

                            <div style="font-size:12px; font-weight:800; color:#0f172a; margin-bottom:6px;">

                                🧾 سندات القبض والدفعات المسددة المرتبطة بهذه الفاتورة:

                            </div>

                            <table class="mt-table" style="font-size:11px; border:1px solid #cbd5e1;">

                                <thead>

                                    <tr style="background:#f1f5f9;">

                                        <th style="width:30px;">#</th>

                                        <th>رقم السند</th>

                                        <th>التاريخ والوقت</th>

                                        <th>طريقة الدفع</th>

                                        <th style="text-align:center;">المبلغ المسدد</th>

                                        <th>البيان</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${inv.vouchers.map((v, vIdx) => `

                                    <tr>

                                        <td>${vIdx + 1}</td>

                                        <td><code style="font-weight:bold; color:#0284c7;">${this.escape(v.voucher_no || ('RV-' + v.id))}</code></td>

                                        <td>${v.created_at}</td>

                                        <td>${this.escape(v.payment_method || 'نقداً')}</td>

                                        <td style="text-align:center; color:#15803d; font-weight:bold;">${App.formatMoney(v.amount)}</td>

                                        <td>${this.escape(v.notes || '-')}</td>

                                    </tr>

                                    `).join('')}

                                </tbody>

                            </table>

                        </div>

                        ` : ''}



                        <!-- Footer Signatures -->

                        <div style="display:flex; justify-content:space-between; margin-top:30px; padding-top:16px; border-top:1px dashed #cbd5e1; font-size:12px; color:#475569;">

                            <div style="text-align:center;">

                                <div>توقيع / ختم البائع:</div>

                                <div style="margin-top:25px;">..................................</div>

                            </div>

                            <div style="text-align:center;">

                                <div>توقيع واستلام المشتري:</div>

                                <div style="margin-top:25px;">..................................</div>

                            </div>

                        </div>



                    </div>

                </div>

            </div>

        </div>

        `;

    },



    // ==========================================

    // SHEET DISTRIBUTION & TRANSFER MODAL

    // ==========================================

    transferSelectedSheets: [],

    transferAvailableProfiles: [],



    async showSheetTransferModal() {

        const [accRes, availRes] = await Promise.all([

            this.api('get_sales_eligible_accounts'),

            this.api('get_available_sheets')

        ]);



        const distributors = (accRes?.accounts || []).filter(a => a.role === 'distributor' || a.role === 'pos_agent' || a.role === 'partner');

        this.transferAvailableProfiles = availRes?.profiles || [];

        this.transferSelectedSheets = [];



        const modal = document.getElementById('modal-container');

        modal.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:800px; max-width:96vw;">

                <div class="mt-modal-header">

                    <span>📦 توزيع وتحويل صفحات الكروت للموزعين والوكلاء</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form onsubmit="App.executeSheetTransfer(event)">

                    <div class="mt-modal-body" style="padding:16px;">

                        

                        <div class="form-group">

                            <label style="font-weight:700;">👤 الموزع / الوكيل المستلم *</label>

                            <select id="tr-target" class="mt-select" style="width:100%; font-weight:600;" required onchange="App.onTransferTargetChange(this.value, ${JSON.stringify(distributors).replace(/'/g, "&#39;")})">

                                <option value="">-- اختر الموزع أو الوكيل المستلم --</option>

                                ${distributors.map(d => `

                                    <option value="${d.id}">

                                        ${this.escape(d.fullname)} (@${this.escape(d.username)}) - [سقف الكروت: ${d.max_cards_quota > 0 ? d.max_cards_quota : 'غير محدود'}]

                                    </option>

                                `).join('')}

                            </select>

                        </div>

                        <div id="tr-target-info" style="margin-bottom:10px; font-size:12px; display:none;"></div>



                        <div class="form-group">

                            <label style="font-weight:700;">📄 تحديد الصفحات المراد تحويلها لعهدة الموزع:</label>

                            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; max-height:200px; overflow-y:auto;">

                                ${this.transferAvailableProfiles.map(p => `

                                    <div style="margin-bottom:8px;">

                                        <div style="font-weight:700; font-size:11.5px; color:#0f172a; margin-bottom:4px;">📦 باقة: ${this.escape(p.display_name || p.profile_name)} (${p.total_sheets} ورقة متاحة)</div>

                                        <div style="display:flex; flex-wrap:wrap; gap:4px;">

                                            ${(p.sheets || []).map(s => `

                                                <label style="display:inline-flex; align-items:center; gap:3px; font-size:10px; background:#fff; border:1px solid #cbd5e1; padding:2px 6px; border-radius:3px; cursor:pointer;">

                                                    <input type="checkbox" class="tr-sheet-cb" value="${s.sheet_no}" data-cards="${s.cards_count}" onchange="App.onTransferSheetCheckboxChange()" />

                                                    <b>${s.sheet_no_formatted}</b> <small>(${s.cards_count}ك)</small>

                                                </label>

                                            `).join('')}

                                        </div>

                                    </div>

                                `).join('') || '<div style="color:#94a3b8; font-size:12px;">لا توجد صفحات متاحة للتحويل في مخزنك</div>'}

                            </div>

                        </div>



                        <div class="form-group">

                            <label>أو إدخال أرقام الصفحات كنطاق نصي (مثال: 1-10 أو 5,6,7):</label>

                            <input type="text" id="tr-manual-sheets" class="mt-input" style="width:100%" placeholder="مثال: 1-5" oninput="App.onTransferManualInput(this.value)" />

                        </div>



                        <div style="background:#0f172a; color:#fff; border-radius:6px; padding:10px; display:flex; justify-content:space-around; text-align:center;">

                            <div>

                                <div style="font-size:10px; color:#94a3b8;">الصفحات المحددة</div>

                                <div id="tr-sum-sheets" style="font-size:16px; font-weight:800; color:#38bdf8;">0</div>

                            </div>

                            <div>

                                <div style="font-size:10px; color:#94a3b8;">إجمالي الكروت</div>

                                <div id="tr-sum-cards" style="font-size:16px; font-weight:800; color:#4ade80;">0 كرت</div>

                            </div>

                        </div>



                        <div class="form-group" style="margin-top:10px;">

                            <label>ملاحظات التحويل:</label>

                            <input type="text" id="tr-notes" class="mt-input" style="width:100%" placeholder="مثال: تحويل عهدة كروت شهر سبتمبر" />

                        </div>



                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:bold;">📦 تأكيد تحويل الصفحات لعهدة الموزع</button>

                    </div>

                </form>

            </div>

        </div>

        `;

    },



    onTransferTargetChange(targetId, distributors) {

        const d = distributors.find(x => x.id == targetId);

        const info = document.getElementById('tr-target-info');

        if (!d) {

            if (info) info.style.display = 'none';

            return;

        }

        if (info) {

            info.style.display = 'block';

            info.innerHTML = `

                <div style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:6px 10px;">

                    <span>👤 المستلم: <b>${this.escape(d.fullname)}</b> | سقف الكروت المسموح: <b>${d.max_cards_quota > 0 ? d.max_cards_quota + ' كرت' : 'غير محدود'}</b></span>

                </div>

            `;

        }

    },



    onTransferSheetCheckboxChange() {

        const checkedBoxes = document.querySelectorAll('.tr-sheet-cb:checked');

        const sheetNos = [];

        let cardsCount = 0;

        checkedBoxes.forEach(cb => {

            sheetNos.push(Number(cb.value));

            cardsCount += Number(cb.getAttribute('data-cards') || 0);

        });



        this.transferSelectedSheets = sheetNos;

        const sumSheets = document.getElementById('tr-sum-sheets');

        if (sumSheets) sumSheets.innerText = sheetNos.length;

        const sumCards = document.getElementById('tr-sum-cards');

        if (sumCards) sumCards.innerText = `${cardsCount.toLocaleString()} كرت`;

    },



    onTransferManualInput(val) {

        if (!val.trim()) return;

        const parts = val.split(',');

        const targetNos = new Set();

        parts.forEach(p => {

            p = p.trim();

            if (p.includes('-')) {

                const [start, end] = p.split('-').map(Number);

                if (!isNaN(start) && !isNaN(end)) {

                    for (let x = Math.min(start, end); x <= Math.max(start, end); x++) targetNos.add(x);

                }

            } else if (!isNaN(Number(p)) && Number(p) > 0) {

                targetNos.add(Number(p));

            }

        });



        document.querySelectorAll('.tr-sheet-cb').forEach(cb => {

            cb.checked = targetNos.has(Number(cb.value));

        });

        this.onTransferSheetCheckboxChange();

    },



    async executeSheetTransfer(e) {

        e.preventDefault();

        const targetId = document.getElementById('tr-target').value;

        if (!targetId) return this.toast('يرجى تحديد الموزع المستلم', 'warning');



        let sheetNumbers = this.transferSelectedSheets;

        const manual = document.getElementById('tr-manual-sheets')?.value.trim();

        if (sheetNumbers.length === 0 && manual) {

            sheetNumbers = manual;

        }



        if (!sheetNumbers || (Array.isArray(sheetNumbers) && sheetNumbers.length === 0)) {

            return this.toast('يرجى تحديد أرقام الصفحات المراد تحويلها', 'warning');

        }



        const payload = {

            target_admin_id: Number(targetId),

            sheet_numbers: sheetNumbers,

            notes: document.getElementById('tr-notes')?.value.trim() || ''

        };



        this.toast('جاري تحويل الصفحات للموزع...', 'info');

        const res = await this.api('transfer_sheets', {}, 'POST', payload);

        if (res && res.success) {

            this.toast(`✅ ${res.message}`, 'success');

            this.closeModal();

            this.renderSales();

        } else {

            this.toast(res?.error || 'فشل تحويل الصفحات', 'danger');

        }

    },



        async renderCashbox() {

        const summary = await this.api('get_cashbox_summary') || {};

        const adminsRes = await this.api('get_admins') || [];

        const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes.admins || []);

        const debtorsList = admins.filter(a => parseFloat(a.balance) !== 0 || a.role === 'distributor' || a.role === 'pos_agent');



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



        // Auto-select first active debtor or admin if statement view mode is active

        if (this.cashboxViewMode === 'statement' && (!this.cashboxAccountFilter || !admins.some(a => a.id == this.cashboxAccountFilter))) {

            if (debtorsList.length > 0) {

                this.cashboxAccountFilter = debtorsList[0].id;

            } else if (admins.length > 0) {

                this.cashboxAccountFilter = admins[0].id;

            }

        }



        let statementData = null;

        if (this.cashboxViewMode === 'statement' && this.cashboxAccountFilter) {

            statementData = await this.api('get_account_statement', {

                account_id: this.cashboxAccountFilter,

                start_date: this.cashboxStartDate,

                end_date: this.cashboxEndDate

            });

        }



        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            this.can('vouchers_receipt_create') ? { label: '💵 + سند قبض نقدية', variant: 'success', onclick: "App.showVoucherModal('receipt')", title: 'سند قبض جديد' } : null,
            this.can('vouchers_payment_create') ? { label: '💳 - سند صرف مصاريف', variant: 'danger', onclick: "App.showVoucherModal('payment')", title: 'سند صرف جديد' } : null,
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderCashbox()' }
        ].filter(Boolean);

        // 2. Standard KPIs
        const stats = [
            { label: 'رصيد الصندوق المتوفر', value: App.formatMoney(summary.cashbox_balance || 0), icon: '💵', tone: 'green', meta: 'Cashbox Balance' },
            { label: 'مقبوضات اليوم', value: App.formatMoney(summary.today_cash_in || 0), icon: '📥', tone: 'cyan', meta: 'Today Cash In' },
            { label: 'مصروفات اليوم', value: App.formatMoney(summary.today_cash_out || 0), icon: '📤', tone: 'rose', meta: 'Today Cash Out' },
            { label: 'مديونيات الوكلاء', value: App.formatMoney(summary.total_distributor_debt || 0), icon: '💳', tone: 'amber', meta: 'Total Debtors' }
        ];

        // 3. Toolbar
        const leftToolbar = [
            `<div style="display:inline-flex; border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-sm, 4px); overflow:hidden;">
                <button type="button" class="sam-btn sam-btn--sm ${this.cashboxViewMode==='summary'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.cashboxViewMode='summary'; App.renderCashbox();">💰 الصندوق المالي</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.cashboxViewMode==='debtors'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.cashboxViewMode='debtors'; App.renderCashbox();">👥 أرصدة الوكلاء والمديونيات</button>
                <button type="button" class="sam-btn sam-btn--sm ${this.cashboxViewMode==='statement'?'sam-btn--primary':'sam-btn--secondary'}" style="border-radius:0;" onclick="App.cashboxViewMode='statement'; App.renderCashbox();">📑 كشف حساب تفصيلي</button>
            </div>`
        ];

        const rightToolbar = [];
        if (this.cashboxViewMode === 'statement') {
            rightToolbar.push(`
                <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <div style="display:inline-flex; border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-sm, 4px); overflow:hidden;">
                        <button type="button" class="sam-btn sam-btn--sm ${(this.cashboxScopeFilter || statementData?.scope || 'auto') === 'operations' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0; font-weight:700;" onclick="App.cashboxScopeFilter='operations'; App.renderCashbox();" title="عرض كل ما باعه وقبضه هذا الحساب من كروت ورصيد ومقبوضات">📋 كل العمليات والصندوق</button>
                        <button type="button" class="sam-btn sam-btn--sm ${(this.cashboxScopeFilter || statementData?.scope) === 'account' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0; font-weight:700;" onclick="App.cashboxScopeFilter='account'; App.renderCashbox();" title="عرض الذمة والمديونية المباشرة للحساب فقط">👤 كشف الذمة المباشرة</button>
                    </div>
                    <select class="sam-select" style="font-weight:bold; min-width:220px;" onchange="App.cashboxAccountFilter=this.value; App.renderCashbox();">
                        <option value="">-- اختر الحساب لاستعراض كشفه --</option>
                        ${admins.map(a => `<option value="${a.id}" ${this.cashboxAccountFilter==a.id?'selected':''}>${a.fullname} (@${a.username}) - [${App.formatMoney(a.balance)}]</option>`).join('')}
                    </select>
                    <div style="display:inline-flex; align-items:center; gap:4px;">
                        <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.cashboxStartDate || ''}" onchange="App.cashboxStartDate=this.value; App.renderCashbox();" title="من تاريخ" />
                        <span>إلى</span>
                        <input type="date" class="sam-input" style="padding:3px 6px; font-size:11px;" value="${this.cashboxEndDate || ''}" onchange="App.cashboxEndDate=this.value; App.renderCashbox();" title="إلى تاريخ" />
                    </div>
                </div>
            `);
        }

        // 4. Content Area
        let contentHtml = '';

        if (this.cashboxViewMode === 'summary' || this.cashboxViewMode === 'debtors') {
            contentHtml += `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>اسم الحساب / الوكيل</th>
                                <th>اسم المستخدم</th>
                                <th>الهاتف</th>
                                <th>الرتبة</th>
                                <th>سقف الائتمان</th>
                                <th>الرصيد المالي الحالي</th>
                                <th>الحالة المالية</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${debtorsList.map((d, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><b>${this.escape(d.fullname)}</b></td>
                                    <td><code>@${this.escape(d.username)}</code></td>
                                    <td><span style="direction:ltr; display:inline-block;">${this.escape(d.phone || '-')}</span></td>
                                    <td><span class="status-pill status-online">${roleLabels[d.role] || d.role}</span></td>
                                    <td>${App.formatMoney(d.credit_limit)}</td>
                                    <td>
                                        <b style="font-size:13px; color:${parseFloat(d.balance) > 0 ? 'var(--sam-danger)' : (parseFloat(d.balance) < 0 ? 'var(--sam-success)' : 'inherit')};">
                                             ${App.formatMoney(d.balance)}
                                        </b>
                                    </td>
                                    <td>
                                        <span class="status-pill ${parseFloat(d.balance) > 0 ? 'status-disabled' : (parseFloat(d.balance) < 0 ? 'status-active' : '')}">
                                            ${parseFloat(d.balance) > 0 ? '🔴 مدين عليه' : (parseFloat(d.balance) < 0 ? '🟢 دائن له' : '⚪ مسدد')}
                                        </span>
                                    </td>
                                    <td>
                                        <div style="display:flex; gap:4px;">
                                            ${Number(d.id) === Number(this.adminId) ? `
                                                <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" onclick="App.cashboxAccountFilter=${d.id}; App.cashboxViewMode='statement'; App.renderCashbox();" title="كشف حسابي الخاص">📄 كشف حسابي</button>
                                            ` : `
                                                <button type="button" class="sam-btn sam-btn--sm sam-btn--success" onclick="App.showVoucherModal('receipt', ${d.id})">💵 سند قبض</button>
                                                <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.cashboxAccountFilter=${d.id}; App.cashboxViewMode='statement'; App.renderCashbox();">📑 كشف حساب</button>
                                            `}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // View Mode: Account Statement
            contentHtml += `
                ${statementData && statementData.account ? `
                    <div style="background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-md, 8px); padding:16px; margin-bottom:12px;">
                        
                        <!-- Account Header & Actions Bar -->
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--sam-border, #e2e8f0); padding-bottom:12px; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                            <div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <b style="font-size:17px; color:var(--sam-primary);">📑 كشف حساب: ${this.escape(statementData.account.fullname)}</b>
                                    <code style="font-size:12px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px;">@${this.escape(statementData.account.username)}</code>
                                    <span class="status-pill status-online" style="font-size:11px;">${roleLabels[statementData.account.role] || statementData.account.role}</span>
                                </div>
                                <div style="font-size:12px; color:var(--sam-text-muted); margin-top:4px;">
                                    📞 الهاتف: <b style="direction:ltr; display:inline-block;">${this.escape(statementData.account.phone || '-')}</b>
                                    ${parseFloat(statementData.account.credit_limit) > 0 ? ` | 🛡️ سقف الائتمان: <b>${App.formatMoney(statementData.account.credit_limit)}</b>` : ''}
                                    ${parseFloat(statementData.account.discount_rate) > 0 ? ` | 🏷️ سقف الخصم: <b>${statementData.account.discount_rate}%</b>` : ''}
                                </div>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center;">
                                ${Number(statementData.account.id) !== Number(this.adminId) ? `
                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--success" style="font-weight:700;" onclick="App.showVoucherModal('receipt', ${statementData.account.id})">💵 + سند قبض فوري</button>
                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" style="font-weight:700;" onclick="App.showVoucherModal('payment', ${statementData.account.id})">💳 - سند صرف فوري</button>
                                ` : ''}
                                <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" style="font-weight:700;" onclick="App.printAccountStatement(${statementData.account.id})">🖨️ طباعة كشف الحساب</button>
                            </div>
                        </div>

                        <!-- 4 Financial Summary KPI Cards -->
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px;">
                            <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:var(--sam-radius-sm, 6px); padding:10px 14px; text-align:center;">
                                <div style="font-size:11px; font-weight:700; color:#9f1239;">📦 إجمالي الفواتير والمبيعات (مدين):</div>
                                <div style="font-size:18px; font-weight:900; color:#e11d48; margin-top:2px;">${App.formatMoney(statementData.total_debit)}</div>
                            </div>
                            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--sam-radius-sm, 6px); padding:10px 14px; text-align:center;">
                                <div style="font-size:11px; font-weight:700; color:#166534;">💵 إجمالي السدادات والمقبوضات (دائن):</div>
                                <div style="font-size:18px; font-weight:900; color:#16a34a; margin-top:2px;">${App.formatMoney(statementData.total_credit)}</div>
                            </div>
                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--sam-radius-sm, 6px); padding:10px 14px; text-align:center;">
                                <div style="font-size:11px; font-weight:700; color:#1e40af;">💰 المتحصلات النقدية للصندوق:</div>
                                <div style="font-size:18px; font-weight:900; color:#2563eb; margin-top:2px;">${App.formatMoney(statementData.total_cashbox || statementData.total_credit)}</div>
                            </div>
                            <div style="background:${statementData.net_balance > 0 ? '#fef2f2' : (statementData.net_balance < 0 ? '#f0fdf4' : '#f8fafc')}; border:1.5px solid ${statementData.net_balance > 0 ? '#f87171' : (statementData.net_balance < 0 ? '#86efac' : '#cbd5e1')}; border-radius:var(--sam-radius-sm, 6px); padding:10px 14px; text-align:center;">
                                <div style="font-size:11px; font-weight:700; color:${statementData.net_balance > 0 ? '#991b1b' : (statementData.net_balance < 0 ? '#166534' : '#475569')};">
                                    ⚖️ الرصيد الختامي الصافي:
                                </div>
                                <div style="font-size:20px; font-weight:900; color:${statementData.net_balance > 0 ? '#dc2626' : (statementData.net_balance < 0 ? '#15803d' : '#0f172a')}; margin-top:2px;">
                                    ${App.formatMoney(Math.abs(statementData.net_balance))} 
                                    <small style="font-size:12px; font-weight:700;">${statementData.net_balance > 0 ? '(مدين مطلوب)' : (statementData.net_balance < 0 ? '(دائن مسبق)' : '(خالص ومسدد)')}</small>
                                </div>
                            </div>
                        </div>

                        <!-- Tafqeet Banner for Net Balance -->
                        <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:8px 12px; margin-bottom:14px; font-size:12px; display:flex; align-items:center; gap:8px;">
                            <span style="font-size:16px;">✍️</span>
                            <div>
                                <b>الرصيد كتابةً:</b> <span style="font-weight:700; color:#0f172a;">${App.tafqeet(Math.abs(statementData.net_balance))}</span> 
                                <span style="font-weight:700; color:${statementData.net_balance > 0 ? 'var(--sam-danger)' : (statementData.net_balance < 0 ? 'var(--sam-success)' : 'var(--sam-text-muted)')};">
                                    ${statementData.net_balance > 0 ? ' [مطلوبة عليه للشبكة]' : (statementData.net_balance < 0 ? ' [رصيد مسبق له في حسابه]' : ' [الحساب مصفّر بالكامل]')}
                                </span>
                            </div>
                        </div>

                        <!-- Scope Banner Description -->
                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 12px; margin-bottom:10px; font-size:11.5px; color:#15803d; display:flex; justify-content:space-between; align-items:center;">
                            <span>📊 <b>وضع العرض الحالي:</b> ${statementData.scope === 'operations' ? 'عرض شامل لكل العمليات والمبيعات والمتحصلات النقدية المنفذة' : 'عرض حركات الذمة والمديونية المباشرة للحساب'}</span>
                            <span style="font-weight:bold;">عدد العمليات: ${(statementData.transactions || []).length} حركة</span>
                        </div>

                        <!-- Movements Table -->
                        <div class="sam-table-container mt-table-container">
                            <table class="sam-table mt-table" style="font-size:12px;">
                                <thead>
                                    <tr style="background:#f1f5f9;">
                                        <th style="width:36px; text-align:center;">#</th>
                                        <th style="width:105px; text-align:center;">التاريخ والوقت</th>
                                        <th style="width:120px; text-align:center;">نوع الحركة</th>
                                        <th style="width:80px; text-align:center;">رقم المرجع</th>
                                        <th style="width:120px;">الطرف / العميل</th>
                                        <th>البيان والتفاصيل (التوثيق)</th>
                                        <th style="width:100px; text-align:center; color:#9f1239;">المدين (له)</th>
                                        <th style="width:100px; text-align:center; color:#166534;">الدائن (عليه)</th>
                                        <th style="width:90px; text-align:center; color:#2563eb;">أثر الصندوق</th>
                                        <th style="width:115px; text-align:center;">الرصيد بعد الحركة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(statementData.transactions || []).map((t, idx) => {
                                        let badgeHtml = '';
                                        if (t.tx_type === 'sale_invoice') {
                                            if (t.reference_id && t.reference_id.startsWith('INV-IB-')) {
                                                badgeHtml = '<span class="status-pill" style="background:#fdf2f8; color:#9d174d; font-weight:700; font-size:10.5px;">⚡ بيع رصيد فوري</span>';
                                            } else if (t.reference_id && t.reference_id.startsWith('INV-DV-')) {
                                                badgeHtml = '<span class="status-pill" style="background:#fae8ff; color:#86198f; font-weight:700; font-size:10.5px;">🎫 بيع كرت إلكتروني</span>';
                                            } else {
                                                badgeHtml = '<span class="status-pill" style="background:#fee2e2; color:#991b1b; font-weight:700; font-size:10.5px;">🛒 بيع كروت ورقية</span>';
                                            }
                                        } else if (t.tx_type === 'receipt_voucher' && t.reference_id && t.reference_id.startsWith('INV-')) {
                                            badgeHtml = '<span class="status-pill" style="background:#dcfce7; color:#166534; font-weight:700; font-size:10.5px;">💵 سداد نقدي لفاتورة</span>';
                                        } else if (t.tx_type === 'receipt_voucher') {
                                            badgeHtml = '<span class="status-pill" style="background:#ecfdf5; color:#065f46; font-weight:700; font-size:10.5px;">🧾 سند قبض نقدية</span>';
                                        } else if (t.tx_type === 'payment_voucher') {
                                            badgeHtml = '<span class="status-pill" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:10.5px;">💳 سند صرف مصاريف</span>';
                                        } else if (t.tx_type === 'transfer') {
                                            badgeHtml = '<span class="status-pill" style="background:#e0e7ff; color:#3730a3; font-weight:700; font-size:10.5px;">🔄 تحويل رصيد</span>';
                                        } else if (t.tx_type === 'adjustment') {
                                            badgeHtml = '<span class="status-pill" style="background:#ffedd5; color:#9a3412; font-weight:700; font-size:10.5px;">⚙️ تسوية / تعديل</span>';
                                        } else {
                                            badgeHtml = `<span class="status-pill">${t.tx_type}</span>`;
                                        }

                                        const balVal = parseFloat(t.balance_after) || 0;
                                        let balHtml = '';
                                        if (balVal > 0) {
                                            balHtml = `<b style="color:var(--sam-danger);">${App.formatMoney(balVal, false)} <small style="font-size:9.5px; color:#991b1b;">(عليه)</small></b>`;
                                        } else if (balVal < 0) {
                                            balHtml = `<b style="color:var(--sam-success);">${App.formatMoney(Math.abs(balVal), false)} <small style="font-size:9.5px; color:#166534;">(له)</small></b>`;
                                        } else {
                                            balHtml = `<b style="color:var(--sam-text-muted);">0.00 <small style="font-size:9.5px; color:#475569;">(خالص)</small></b>`;
                                        }

                                        const partyName = t.target_fullname || t.party_name || (t.account_id == statementData.account.id ? 'الحساب نفسه' : 'عميل مباشر');
                                        const cashImpactVal = parseFloat(t.cashbox_impact) || 0;

                                        const rawDate = t.created_at || '';
                                        let datePart = '-';
                                        let timePart = '';
                                        if (rawDate) {
                                            const parts = String(rawDate).trim().split(/[\sT]+/);
                                            datePart = parts[0] || '-';
                                            timePart = parts[1] ? parts[1].substring(0, 8) : '';
                                        }

                                        return `
                                        <tr>
                                            <td style="text-align:center;">${idx + 1}</td>
                                            <td style="font-size:11px; text-align:center; white-space:nowrap; line-height:1.25;">
                                                <div style="font-weight:700; color:#1e293b;">${datePart}</div>
                                                ${timePart ? `<div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:2px;">${timePart}</div>` : ''}
                                            </td>
                                            <td style="text-align:center;">${badgeHtml}</td>
                                            <td style="text-align:center;"><code style="font-weight:bold; color:var(--sam-primary); font-size:11px; background:#f1f5f9; padding:2px 4px; border-radius:3px;">${this.escape(t.reference_id || t.tx_no)}</code></td>
                                            <td><b style="color:#0369a1;">${this.escape(partyName)}</b></td>
                                            <td><b>${this.escape(t.description)}</b></td>
                                            <td style="text-align:center; color:#e11d48; font-weight:800;">
                                                ${parseFloat(t.debit) > 0 ? App.formatMoney(t.debit, false) : '-'}
                                            </td>
                                            <td style="text-align:center; color:#166534; font-weight:800;">
                                                ${parseFloat(t.credit) > 0 ? App.formatMoney(t.credit, false) : '-'}
                                            </td>
                                            <td style="text-align:center; color:#2563eb; font-weight:700;">
                                                ${cashImpactVal > 0 ? ('+' + App.formatMoney(cashImpactVal, false)) : (cashImpactVal < 0 ? App.formatMoney(cashImpactVal, false) : '-')}
                                            </td>
                                            <td style="text-align:center; background:#f8fafc;">
                                                ${balHtml}
                                            </td>
                                        </tr>
                                        `;
                                    }).join('') || '<tr><td colspan="10" style="text-align:center; padding:25px; color:var(--sam-text-muted);">لا توجد حركات مسجلة لهذا الحساب</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <div style="text-align:center; padding:40px; background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border-strong, #cbd5e1); border-radius:var(--sam-radius-md, 8px); color:var(--sam-text-muted);">
                        <div style="font-size:36px; margin-bottom:10px;">📑</div>
                        <b>يرجى اختيار حساب من القائمة أعلاه لعرض كشف الحساب التفصيلي</b>
                    </div>
                `}
            `;
        }

        // 5. Render Shell
        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'cashbox_accounts',
                archetype: 'ledger',
                title: 'الصناديق والحسابات المالية',
                subtitle: 'إدارة حركة النقدية، أرصدة الوكلاء والمديونيات، وكشوف الحسابات التفصيلية',
                eyebrow: 'CASHBOX & ACCOUNT STATEMENTS',
                icon: '💰',
                actions,
                stats,
                toolbar: { left: leftToolbar, right: rightToolbar },
                content: contentHtml
            });
        } else {
            document.getElementById('main-view').innerHTML = `
                <main class="sam-ui-page sam-page-shell" data-sam-page="cashbox_accounts" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">💰</span>
                            <div>
                                <span class="sam-page-eyebrow">CASHBOX & ACCOUNT STATEMENTS</span>
                                <h1>الصناديق والحسابات المالية</h1>
                                <p>إدارة حركة النقدية، أرصدة الوكلاء والمديونيات، وكشوف الحسابات التفصيلية</p>
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



    async showAccountStatement(accountId) {

        this.toast('جاري تجهيز كشف الحساب...', 'info');

        const res = await this.api('get_account_statement', { account_id: accountId });

        if (!res) return;



        const acc = res.account;

        const txs = res.transactions;



        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:900px; max-height:94vh;">

                <div class="mt-modal-header">

                    <span>📄 كشف حساب رسمي: [ ${acc.fullname} (@${acc.username}) ]</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <div class="mt-toolbar" style="padding:8px 12px; background:#eef2f5;">

                    <div class="mt-toolbar-left">

                        <b>الرصيد النهائي المتبقي: </b>

                        <b style="font-size:16px; color:${res.net_balance > 0 ? '#e74c3c' : '#27ae60'}; margin-right:6px;">

                            ${App.formatMoney(res.net_balance)}

                        </b>

                    </div>

                    <div class="mt-toolbar-right">

                        <button class="mt-btn mt-btn-primary" onclick="App.printAccountStatement(${acc.id})">🖨️ طباعة كشف الحساب</button>

                    </div>

                </div>

                <div class="mt-modal-body" style="padding:15px; overflow-y:auto;">

                    <div style="background:var(--toolbar-bg); border-radius:6px; padding:12px; margin-bottom:15px; font-size:12px; display:flex; justify-content:space-between;">

                        <div><b>رقم الحساب:</b> #${acc.id}</div>

                        <div><b>الهاتف:</b> ${acc.phone || '-'}</div>

                        <div><b>إجمالي المدين (مسحوبات):</b> <b style="color:#e74c3c;">${App.formatMoney(res.total_debit)}</b></div>

                        <div><b>إجمالي الدائن (مسددات):</b> <b style="color:#27ae60;">${App.formatMoney(res.total_credit)}</b></div>

                    </div>



                    <table class="mt-table">
                        <thead>
                            <tr>
                                <th style="width:36px; text-align:center;">#</th>
                                <th style="width:80px; text-align:center;">رقم القيد</th>
                                <th style="width:105px; text-align:center;">التاريخ والوقت</th>
                                <th>البيان والتفاصيل</th>
                                <th style="width:95px; text-align:center;">مدين (Debit)</th>
                                <th style="width:95px; text-align:center;">دائن (Credit)</th>
                                <th style="width:110px; text-align:center;">الرصيد التراكمي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map((t, idx) => {
                                const rawDate = t.created_at || '';
                                let datePart = '-';
                                let timePart = '';
                                if (rawDate) {
                                    const parts = String(rawDate).trim().split(/[\sT]+/);
                                    datePart = parts[0] || '-';
                                    timePart = parts[1] ? parts[1].substring(0, 8) : '';
                                }
                                return `
                                <tr>
                                    <td style="text-align:center;">${idx + 1}</td>
                                    <td style="text-align:center;"><code style="font-weight:bold; color:#0284c7; font-size:11px; background:#f1f5f9; padding:2px 5px; border-radius:3px;">${this.escape(t.reference_id || t.tx_no)}</code></td>
                                    <td style="text-align:center; font-size:11px; line-height:1.25;">
                                        <div style="font-weight:700; color:#1e293b;">${datePart}</div>
                                        ${timePart ? `<div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:2px;">${timePart}</div>` : ''}
                                    </td>
                                    <td><b>${this.escape(t.description)}</b></td>
                                    <td style="text-align:center; color:#e11d48; font-weight:700;">${parseFloat(t.debit) > 0 ? App.formatMoney(t.debit, false) : '-'}</td>
                                    <td style="text-align:center; color:#166534; font-weight:700;">${parseFloat(t.credit) > 0 ? App.formatMoney(t.credit, false) : '-'}</td>
                                    <td style="text-align:center; font-weight:800;">${App.formatMoney(t.balance_after, false)}</td>
                                </tr>
                                `;
                            }).join('')}
                            ${txs.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">لا توجد حركات مالية مسجلة لهذا الحساب</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        </div>
        `;
    },

    // =========================================================================
    // 🏪 POS & CUSTOMER REQUESTS MANAGEMENT (NETWORK MANAGER CONTROLS)
    // =========================================================================

    showInvitePosModal() {
        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; padding:16px 20px;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>📲</span> دعوة نقطة بيع جديدة مع تثبيت المديونية السابقة
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitInvitePosAgent(event)">
                <div class="mt-modal-body" style="padding:20px; max-height:70vh; overflow-y:auto;">
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px; margin-bottom:16px; font-size:12.5px; color:#1e40af; line-height:1.6;">
                        💡 <b>دعوة واعتماد نقطة بيع:</b><br/>
                        سيتم إرسال دعوة رسمية ورابط تفعيل إلى واتساب الوكيل. عند دخول الوكيل وتأكيد رقم هاتفه، سيتم ربطه بشبكتك وتثبيت شروط الخصم والمديونية السابقة تلقائياً في حسابه وسجل القيود.
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">اسم الوكيل / المسؤول *</label>
                            <input type="text" id="inv-pos-name" class="mt-input" style="width:100%;" placeholder="مثال: يحيى صالح مسعد" required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">اسم المحل / النقطة *</label>
                            <input type="text" id="inv-pos-shop" class="mt-input" style="width:100%;" placeholder="مثال: مركز الأمل للاتصالات" required />
                        </div>
                    </div>

                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">رقم هاتف الوكيل (واتساب) *</label>
                        <input type="tel" id="inv-pos-phone" class="mt-input" style="width:100%; direction:ltr; text-align:left; font-family:monospace; font-weight:700;" placeholder="77XXXXXXX (9 أرقام)" maxlength="12" oninput="App.onPhoneInputAutoFormat(this)" required />
                    </div>

                    <div style="font-size:13px; font-weight:800; color:#0f172a; margin:16px 0 8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">⚙️ الشروط والاتفاق المالي:</div>

                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">نسبة الخصم للوكيل (%) *</label>
                            <input type="number" id="inv-pos-discount" class="mt-input" style="width:100%;" value="10" min="0" max="100" step="0.5" required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">سقف الائتمان المسموح</label>
                            <input type="number" id="inv-pos-credit" class="mt-input" style="width:100%;" value="0" min="0" step="500" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">العملة المالية</label>
                            <select id="inv-pos-currency" class="mt-input" style="width:100%; font-weight:700;">
                                <option value="YER">ريال يمني (YER)</option>
                                <option value="SAR">ريال سعودي (SAR)</option>
                                <option value="USD">دولار أمريكي (USD)</option>
                            </select>
                        </div>
                    </div>

                    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 14px; margin-top:14px;">
                        <div class="form-group">
                            <label style="font-weight:800; font-size:13px; color:#92400e; display:block; margin-bottom:4px;">
                                💰 المديونية السابقة المثبتة على الوكيل (رصيد افتتاحي ذمة)
                            </label>
                            <input type="number" id="inv-pos-debt" class="mt-input" style="width:100%; font-size:15px; font-weight:800; color:#b45309;" value="0" min="0" step="100" />
                            <small style="color:#78350f; font-size:11.5px; margin-top:4px; display:block;">
                                إذا كانت هناك ديون سابقة على نقطة البيع، سيتم إنشاء فاتورة وقيد افتتاحي بالمديونية عند تأكيد الوكيل للدعوة.
                            </small>
                        </div>
                    </div>

                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات الاتفاق</label>
                        <input type="text" id="inv-pos-notes" class="mt-input" style="width:100%;" placeholder="أي شروط أو بنود إضافية بين الشبكة والوكيل..." />
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <button type="submit" id="inv-pos-btn" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 24px;">
                        📲 إرسال الدعوة وتثبيت الشروط
                    </button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                </div>
            </form>
        `, '600px');
    },

    async submitInvitePosAgent(e) {
        e.preventDefault();
        const btn = document.getElementById('inv-pos-btn');
        const name = document.getElementById('inv-pos-name')?.value?.trim();
        const shop = document.getElementById('inv-pos-shop')?.value?.trim();
        const phone = document.getElementById('inv-pos-phone')?.value?.trim();
        const discount = parseFloat(document.getElementById('inv-pos-discount')?.value || '0');
        const credit = parseFloat(document.getElementById('inv-pos-credit')?.value || '0');
        const currency = document.getElementById('inv-pos-currency')?.value || 'YER';
        const debt = parseFloat(document.getElementById('inv-pos-debt')?.value || '0');
        const notes = document.getElementById('inv-pos-notes')?.value?.trim();

        if (!name || !shop || !phone) {
            return this.toast('يرجى ملء جميع الحقول المطلوبة', 'warning');
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إرسال الدعوة...';
        }

        try {
            const res = await this.api('admin_invite_pos_agent', {}, 'POST', {
                fullname: name,
                shop_name: shop,
                phone: phone,
                discount_rate: discount,
                credit_limit: credit,
                currency: currency,
                opening_debt: debt,
                notes: notes
            });

            if (res && res.success) {
                this.closeModal();
                this.toast(res.message || '🎉 تم إرسال الدعوة وتثبيت شروط نقطة البيع بنجاح!', 'success', 6000);
                this.salesViewMode = 'pos_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'تعذر إرسال الدعوة', 'danger');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '📲 إرسال الدعوة وتثبيت الشروط';
                }
            }
        } catch (err) {
            this.toast('حدث خطأ في الاتصال بالسيرفر', 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '📲 إرسال الدعوة وتثبيت الشروط';
            }
        }
    },

    async showReviewPosRequestModal(reqId, readonly = false) {
        const posReqsRes = await this.api('admin_get_pos_requests');
        const req = (posReqsRes?.requests || []).find(r => Number(r.id) === Number(reqId));
        if (!req) return this.toast('الطلب غير موجود', 'warning');

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; padding:16px 20px;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>📥</span> مراجعة واعتماد طلب انضمام نقطة البيع (#${req.id})
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitReviewPosRequest(event, ${req.id})">
                <div class="mt-modal-body" style="padding:20px; max-height:70vh; overflow-y:auto;">
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">🏪 ${this.escape(req.shop_name || req.pos_name || 'نقطة بيع')}</div>
                        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
                            المسؤول: <b>${this.escape(req.pos_name || '-')}</b> | الهاتف: <code style="direction:ltr;">${this.escape(req.pos_phone || '-')}</code>
                        </div>
                        ${req.notes ? `<div style="font-size:12px; color:#475569; margin-top:6px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid #e2e8f0;">💬 <b>رسالة الوكيل:</b> ${this.escape(req.notes)}</div>` : ''}
                    </div>

                    <div style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">⚙️ شروط الاعتماد والاتفاق:</div>

                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">نسبة الخصم للوكيل (%) *</label>
                            <input type="number" id="rev-pos-discount" class="mt-input" style="width:100%;" value="${req.discount_rate || 10}" min="0" max="100" step="0.5" ${readonly ? 'readonly' : ''} required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">سقف الائتمان</label>
                            <input type="number" id="rev-pos-credit" class="mt-input" style="width:100%;" value="${req.credit_limit || 0}" min="0" step="500" ${readonly ? 'readonly' : ''} />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">العملة</label>
                            <select id="rev-pos-currency" class="mt-input" style="width:100%; font-weight:700;" ${readonly ? 'disabled' : ''}>
                                <option value="YER" ${req.currency === 'YER' ? 'selected' : ''}>ريال يمني (YER)</option>
                                <option value="SAR" ${req.currency === 'SAR' ? 'selected' : ''}>ريال سعودي (SAR)</option>
                                <option value="USD" ${req.currency === 'USD' ? 'selected' : ''}>دولار (USD)</option>
                            </select>
                        </div>
                    </div>

                    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px; margin-top:12px;">
                        <div class="form-group">
                            <label style="font-weight:800; font-size:12.5px; color:#92400e; display:block; margin-bottom:4px;">
                                💰 المديونية السابقة المثبتة على الوكيل (إن وجدت)
                            </label>
                            <input type="number" id="rev-pos-debt" class="mt-input" style="width:100%; font-weight:800; color:#b45309;" value="${req.opening_debt || 0}" min="0" step="100" ${readonly ? 'readonly' : ''} />
                        </div>
                    </div>

                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات الإدارة للوكيل</label>
                        <input type="text" id="rev-pos-notes" class="mt-input" style="width:100%;" value="${this.escape(req.admin_notes || '')}" placeholder="تظهر في إشعار القبول للوكيل..." ${readonly ? 'readonly' : ''} />
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    ${!readonly ? `
                        <div style="display:flex; gap:8px;">
                            <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 20px;">
                                ✅ اعتماد وقبول نقطة البيع
                            </button>
                            <button type="button" class="mt-btn mt-btn-danger" style="font-weight:700; font-size:13px; padding:8px 14px;" onclick="App.submitRejectPosRequest(${req.id})">
                                ❌ رفض الطلب
                            </button>
                        </div>
                    ` : `<div></div>`}
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </form>
        `, '600px');
    },

    async submitReviewPosRequest(e, reqId) {
        e.preventDefault();
        const discount = parseFloat(document.getElementById('rev-pos-discount')?.value || '0');
        const credit = parseFloat(document.getElementById('rev-pos-credit')?.value || '0');
        const currency = document.getElementById('rev-pos-currency')?.value || 'YER';
        const debt = parseFloat(document.getElementById('rev-pos-debt')?.value || '0');
        const notes = document.getElementById('rev-pos-notes')?.value?.trim();

        try {
            const res = await this.api('admin_review_pos_request', {}, 'POST', {
                request_id: reqId,
                action: 'approve',
                discount_rate: discount,
                credit_limit: credit,
                currency: currency,
                opening_debt: debt,
                admin_notes: notes
            });

            if (res && res.success) {
                this.closeModal();
                this.toast(res.message || '✅ تم اعتماد نقطة البيع وتفعيل الصلاحيات بنجاح!', 'success');
                this.salesViewMode = 'pos_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'فشل اعتماد الطلب', 'danger');
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر', 'danger');
        }
    },

    async submitRejectPosRequest(reqId) {
        const reason = prompt('يرجى كتابة سبب الرفض (اختياري):');
        if (reason === null) return;

        try {
            const res = await this.api('admin_review_pos_request', {}, 'POST', {
                request_id: reqId,
                action: 'reject',
                admin_notes: reason
            });

            if (res && res.success) {
                this.closeModal();
                this.toast('تم رفض الطلب', 'info');
                this.salesViewMode = 'pos_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'فشل رفض الطلب', 'danger');
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر', 'danger');
        }
    },

    async showReviewPosCardRequestModal(reqId) {
        const cardReqsRes = await this.api('admin_get_card_requests');
        const req = (cardReqsRes?.requests || []).find(r => Number(r.id) === Number(reqId));
        if (!req) return this.toast('الطلب غير موجود', 'warning');

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; padding:16px 20px;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>🎫</span> اعتماد وتوليد دفعة كروت للوكيل (#${req.request_no})
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div style="font-size:14.5px; font-weight:800; color:#0f172a;">👤 ${this.escape(req.pos_name || '-')}</div>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">الهاتف: <code style="direction:ltr;">${this.escape(req.pos_phone || '-')}</code></div>
                        </div>
                        <span class="sam-badge" style="background:#8e44ad; color:#fff; font-size:12px; padding:4px 10px;">📦 ${this.escape(req.profile_name)}</span>
                    </div>
                </div>

                <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:14px; margin-bottom:16px; display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; text-align:center;">
                    <div>
                        <div style="font-size:11.5px; color:#065f46;">عدد الصفحات</div>
                        <div style="font-size:16px; font-weight:900; color:#047857;">${req.page_count} ورقة</div>
                    </div>
                    <div>
                        <div style="font-size:11.5px; color:#065f46;">إجمالي الكروت</div>
                        <div style="font-size:16px; font-weight:900; color:#0284c7;">${req.total_cards} كرت</div>
                    </div>
                    <div>
                        <div style="font-size:11.5px; color:#065f46;">صافي الفاتورة</div>
                        <div style="font-size:16px; font-weight:900; color:#15803d;">${App.formatMoney(req.net_amount)} ر.ي</div>
                    </div>
                </div>

                <div style="font-size:12px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; line-height:1.6;">
                    ⚡ <b>توليد آلي فوري:</b> عند الضغط على زر الموافقة، سيقوم النظام بتوليد ${req.total_cards} كرت عشوائي في قاعدة بيانات RADIUS وربطها بحساب الوكيل فوراً لطباعتها وبيعها.
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                <div style="display:flex; gap:8px;">
                    <button type="button" id="card-approve-btn" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 22px;" onclick="App.submitReviewPosCardRequest(${req.id}, 'approve')">
                        ⚡ موافقة وتوليد الكروت تلقائياً
                    </button>
                    <button type="button" class="mt-btn mt-btn-danger" style="font-weight:700; font-size:13px;" onclick="App.submitReviewPosCardRequest(${req.id}, 'reject')">
                        ❌ رفض الطلب
                    </button>
                </div>
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
            </div>
        `, '560px');
    },

    async submitReviewPosCardRequest(reqId, action) {
        const btn = document.getElementById('card-approve-btn');
        let adminNotes = '';
        if (action === 'reject') {
            adminNotes = prompt('سبب الرفض (اختياري):') || '';
            if (adminNotes === null) return;
        }

        if (btn && action === 'approve') {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري توليد الكروت في السيرفر...';
        }

        try {
            const res = await this.api('admin_review_card_request', {}, 'POST', {
                request_id: reqId,
                action: action,
                admin_notes: adminNotes
            });

            if (res && res.success) {
                this.closeModal();
                this.toast(res.message || (action === 'approve' ? '🎉 تم توليد دفعة الكروت وإضافتها للوكيل بنجاح!' : 'تم رفض الطلب'), 'success', 6000);
                this.salesViewMode = 'pos_card_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'فشل تنفيذ الإجراء', 'danger');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '⚡ موافقة وتوليد الكروت تلقائياً';
                }
            }
        } catch (err) {
            this.toast('حدث خطأ في الاتصال بالسيرفر', 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '⚡ موافقة وتوليد الكروت تلقائياً';
            }
        }
    },

    async showReviewCustomerRequestModal(reqId) {
        const custReqsRes = await this.api('admin_get_customer_requests');
        const req = (custReqsRes?.requests || []).find(r => Number(r.id) === Number(reqId));
        if (!req) return this.toast('الطلب غير موجود', 'warning');

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; padding:16px 20px;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>👤</span> تسليم وتأكيد طلب المشترك (#${req.request_no})
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitReviewCustomerRequest(event, ${req.id}, '${req.request_type}')">
                <div class="mt-modal-body" style="padding:20px;">
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:14.5px; font-weight:800; color:#0f172a;">👤 ${this.escape(req.customer_name || 'مشترك')}</div>
                                <div style="font-size:12px; color:#64748b; margin-top:2px;">الهاتف: <code style="direction:ltr;">${this.escape(req.phone || '-')}</code></div>
                            </div>
                            <span class="sam-badge" style="background:${req.request_type==='voucher_purchase'?'#e0f2fe; color:#0369a1;':'#fef3c7; color:#92400e;'}">
                                ${req.request_type === 'voucher_purchase' ? '🎫 شراء كرت' : '⚡ شحن رصيد'}
                            </span>
                        </div>
                        <div style="margin-top:10px; font-size:12.5px; color:#334155; line-height:1.6;">
                            <b>الطلب:</b> ${req.request_type === 'voucher_purchase' ? `كرت باقة (${this.escape(req.profile_name)})` : `شحن رصيد بقيمة (${App.formatMoney(req.requested_amount)} ر.ي)`}<br/>
                            <b>طريقة الدفع:</b> ${this.escape(req.payment_method || 'نقداً')} ${req.payment_reference ? `(مرجع: <code>${this.escape(req.payment_reference)}</code>)` : ''}
                        </div>
                    </div>

                    ${req.request_type === 'voucher_purchase' ? `
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:8px;">🎫 بيانات الكرت المسلم للعميل:</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">اسم المستخدم / رمز الكرت *</label>
                                <input type="text" id="cust-rev-voucher-user" class="mt-input" style="width:100%; font-family:monospace; font-weight:800; direction:ltr;" placeholder="أدخل رمز الكرت المسلم" required />
                            </div>
                            <div class="form-group">
                                <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">كلمة المرور / PIN (اختياري)</label>
                                <input type="text" id="cust-rev-voucher-pin" class="mt-input" style="width:100%; font-family:monospace; direction:ltr;" placeholder="نفس اسم المستخدم إن لم يوجد" />
                            </div>
                        </div>
                    ` : `
                        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px; font-size:12.5px; color:#065f46;">
                            ⚡ سيتم إضافة مبلغ <b>${App.formatMoney(req.requested_amount)} ر.ي</b> فوراً إلى رصيد المشترك المتوفر بالشبكة.
                        </div>
                    `}

                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظة للمشترك</label>
                        <input type="text" id="cust-rev-notes" class="mt-input" style="width:100%;" placeholder="تظهر للمشترك في بوابته ورسالة الواتساب..." />
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <div style="display:flex; gap:8px;">
                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 22px;">
                            ✅ تأكيد وتسليم الطلب
                        </button>
                        <button type="button" class="mt-btn mt-btn-danger" style="font-weight:700; font-size:13px;" onclick="App.submitRejectCustomerRequest(${req.id})">
                            ❌ رفض الطلب
                        </button>
                    </div>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                </div>
            </form>
        `, '560px');
    },

    async submitReviewCustomerRequest(e, reqId, reqType) {
        e.preventDefault();
        const vUser = document.getElementById('cust-rev-voucher-user')?.value?.trim();
        const vPin = document.getElementById('cust-rev-voucher-pin')?.value?.trim() || vUser;
        const notes = document.getElementById('cust-rev-notes')?.value?.trim();

        try {
            const res = await this.api('admin_review_customer_request', {}, 'POST', {
                request_id: reqId,
                action: 'approve',
                voucher_username: vUser,
                voucher_pin: vPin,
                admin_notes: notes
            });

            if (res && res.success) {
                this.closeModal();
                this.toast(res.message || '✅ تم تسليم الطلب وإشعار المشترك بنجاح!', 'success');
                this.salesViewMode = 'customer_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'فشل تسليم الطلب', 'danger');
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر', 'danger');
        }
    },

    async submitRejectCustomerRequest(reqId) {
        const reason = prompt('سبب الرفض (اختياري):');
        if (reason === null) return;

        try {
            const res = await this.api('admin_review_customer_request', {}, 'POST', {
                request_id: reqId,
                action: 'reject',
                admin_notes: reason
            });

            if (res && res.success) {
                this.closeModal();
                this.toast('تم رفض الطلب', 'info');
                this.salesViewMode = 'customer_requests';
                this.renderSales();
            } else {
                this.toast(res?.error || 'فشل رفض الطلب', 'danger');
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر', 'danger');
        }
    }

});

