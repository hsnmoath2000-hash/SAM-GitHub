/**


 * SAM User Manager — Instant Balance & Digital Voucher Sales Center


 * Standard Winbox UI + Mobile Responsive Pattern (Actions / Filters / Stats)


 */


'use strict';





(function () {


    if (!window.App) return;





    // Helpers


    const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


    const err = (app, res, fallback) => app.toast(res?.error || res?.message || fallback, 'error');





    // Helper: Tafqeet with professional formatting


    function formatTafqeet(amount, currency = 'ريال يمني') {


        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return '';


        if (window.App && typeof window.App.tafqeet === 'function') {


            const words = window.App.tafqeet(amount, currency);


            return 'فقط ' + words + ' لا غير';


        }


        return '';


    }





    // Inject Essential Styles for phone wrapper and badges


    if (!document.getElementById('ib-modern-styles')) {


        document.head.insertAdjacentHTML('beforeend', `


        <style id="ib-modern-styles">


            .ib-phone-wrapper {


                display: flex;


                direction: ltr;


                align-items: stretch;


                border: 1px solid #cbd5e1;


                border-radius: 8px;


                overflow: hidden;


                background: #fff;


            }


            .ib-phone-prefix {


                background: #e0f2fe;


                color: #0369a1;


                font-weight: 800;


                padding: 8px 12px;


                font-size: 13px;


                display: flex;


                align-items: center;


                border-right: 1px solid #cbd5e1;


                user-select: none;


            }


            .ib-phone-input {


                flex: 1;


                border: 0 !important;


                border-radius: 0 !important;


                direction: ltr;


                font-family: monospace;


                font-weight: 700;


                padding: 8px 12px;


                font-size: 14px;


            }


            .ib-tafqeet-note {


                font-size: 11.5px;


                color: #0284c7;


                font-weight: 700;


                margin-top: 5px;


                padding: 3px 8px;


                background: #f0f9ff;


                border-radius: 6px;


                border: 1px dashed #bae6fd;


                min-height: 24px;


                display: flex;


                align-items: center;


                transition: all 0.2s;


            }


            .ib-badge {


                display: inline-flex;


                align-items: center;


                gap: 4px;


                padding: 3px 7px;


                border-radius: 5px;


                font-size: 11px;


                font-weight: 700;


            }


            .ib-badge-success { background: #dcfce7; color: #15803d; }


            .ib-badge-warning { background: #fef3c7; color: #b45309; }


            .ib-badge-danger { background: #fee2e2; color: #b91c1c; }


            .ib-badge-info { background: #e0f2fe; color: #0369a1; }


            .ib-badge-purple { background: #f3e8ff; color: #7e22ce; }


        </style>`);


    }





    const originalHasAccess = App.hasAccess.bind(App);


    App.hasAccess = function (key) {


        return (key === 'wallet_sales' || key === 'instant_balance') ? originalHasAccess('sales') : originalHasAccess(key);


    };





        App.instantBalanceAvailable = async function () {
        try {
            const res = await this.api('instant_balance_summary');
            return Number(res?.available || 0);
        } catch (e) {
            return 0;
        }
    };

App.instantBalanceLoadAccounts = async function () {


        const res = await this.api('get_sales_eligible_accounts');


        return res?.accounts || [];


    };





    // State Variables


    App.ibActiveTab = App.ibActiveTab || 'invoices';


    App.ibLimit = App.ibLimit || 25;


    App.ibInvoicesPage = App.ibInvoicesPage || 1;


    App.ibTransfersPage = App.ibTransfersPage || 1;


    App.ibLotsPage = App.ibLotsPage || 1;


    App.ibSearchInvoices = App.ibSearchInvoices || '';


    App.ibFilterSaleKind = App.ibFilterSaleKind || '';


    App.ibFilterPaymentType = App.ibFilterPaymentType || '';


    App.ibSearchTransfers = App.ibSearchTransfers || '';


    App.ibFilterTransferOp = App.ibFilterTransferOp || '';


    App.ibSearchLots = App.ibSearchLots || '';





    /**


     * Main Instant Balance Center View (Standard Winbox & Mobile Responsive Pattern)


     */


    App.renderInstantBalanceCenter = async function (activeTab = null) {
        if (activeTab) this.ibActiveTab = activeTab;
        const currentTab = this.ibActiveTab || 'invoices';
        this.ibActiveTab = currentTab;

        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        const [summaryRes, invoicesRes, transfersRes] = await Promise.all([
            this.api('instant_balance_summary'),
            this.api('instant_balance_invoices'),
            this.api('instant_balance_transfers')
        ]);

        const summary = summaryRes || {};
        const available = Number(summary.available || 0);
        const lots = Array.isArray(summary.lots) ? summary.lots : [];
        let invoices = Array.isArray(invoicesRes?.invoices) ? invoicesRes.invoices : [];
        this._lastIbInvoices = invoices;
        let transfers = Array.isArray(transfersRes?.data) ? transfersRes.data : [];

        // Stats calculation
        const totalSalesSum = invoices.reduce((sum, x) => sum + Number(x.total_amount || 0), 0);
        const totalProfitSum = invoices.reduce((sum, x) => sum + Number(x.profit_amount || 0), 0);
        const totalDigitalVouchers = invoices.filter(x => x.sale_kind === 'digital_voucher').length;

        // Apply filters on Invoices
        if (this.ibSearchInvoices) {
            const q = this.ibSearchInvoices.toLowerCase();
            invoices = invoices.filter(x => 
                (x.invoice_no && x.invoice_no.toLowerCase().includes(q)) ||
                (x.buyer_name && x.buyer_name.toLowerCase().includes(q)) ||
                (x.buyer_account_name && x.buyer_account_name.toLowerCase().includes(q)) ||
                (x.buyer_phone && x.buyer_phone.includes(q))
            );
        }
        if (this.ibFilterSaleKind) {
            invoices = invoices.filter(x => x.sale_kind === this.ibFilterSaleKind);
        }
        if (this.ibFilterPaymentType) {
            invoices = invoices.filter(x => x.payment_type === this.ibFilterPaymentType);
        }

        // Apply filters on Transfers
        if (this.ibSearchTransfers) {
            const q = this.ibSearchTransfers.toLowerCase();
            transfers = transfers.filter(x => 
                (x.reference_no && x.reference_no.toLowerCase().includes(q)) ||
                (x.from_admin_name && x.from_admin_name.toLowerCase().includes(q)) ||
                (x.to_admin_name && x.to_admin_name.toLowerCase().includes(q)) ||
                (x.notes && x.notes.toLowerCase().includes(q))
            );
        }
        if (this.ibFilterTransferOp) {
            transfers = transfers.filter(x => x.operation_type === this.ibFilterTransferOp);
        }

        // Apply filters on Lots
        let filteredLots = lots;
        if (this.ibSearchLots) {
            const q = this.ibSearchLots.toLowerCase();
            filteredLots = filteredLots.filter(x => 
                (x.lot_number && String(x.lot_number).toLowerCase().includes(q)) ||
                (x.created_at && String(x.created_at).includes(q))
            );
        }

        // Pagination computations
        const limit = parseInt(this.ibLimit) || 25;

        // Invoices Pagination
        const totalInvoices = invoices.length;
        const totalPagesInvoices = Math.max(1, Math.ceil(totalInvoices / limit));
        if (this.ibInvoicesPage > totalPagesInvoices) this.ibInvoicesPage = totalPagesInvoices;
        if (this.ibInvoicesPage < 1) this.ibInvoicesPage = 1;
        const startIdxInvoices = (this.ibInvoicesPage - 1) * limit;
        const pageInvoices = invoices.slice(startIdxInvoices, startIdxInvoices + limit);

        // Transfers Pagination
        const totalTransfers = transfers.length;
        const totalPagesTransfers = Math.max(1, Math.ceil(totalTransfers / limit));
        if (this.ibTransfersPage > totalPagesTransfers) this.ibTransfersPage = totalPagesTransfers;
        if (this.ibTransfersPage < 1) this.ibTransfersPage = 1;
        const startIdxTransfers = (this.ibTransfersPage - 1) * limit;
        const pageTransfers = transfers.slice(startIdxTransfers, startIdxTransfers + limit);

        // Lots Pagination
        const totalLots = filteredLots.length;
        const totalPagesLots = Math.max(1, Math.ceil(totalLots / limit));
        if (this.ibLotsPage > totalPagesLots) this.ibLotsPage = totalPagesLots;
        if (this.ibLotsPage < 1) this.ibLotsPage = 1;
        const startIdxLots = (this.ibLotsPage - 1) * limit;
        const pageLots = filteredLots.slice(startIdxLots, startIdxLots + limit);

        // 1. Toolbar Elements (Tabs + Filters)
        const leftToolbarItems = [
            `<div class="view-mode-group" style="display:inline-flex; border:1px solid var(--border-color, #cbd5e1); border-radius:6px; overflow:hidden; background:var(--bg-panel, #f8fafc);">
                <button class="mt-btn ${currentTab === 'invoices' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.renderInstantBalanceCenter('invoices')">
                    🧾 فواتير المبيعات الرقمية (${(invoicesRes?.invoices || []).length})
                </button>
                <button class="mt-btn ${currentTab === 'transfers' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.renderInstantBalanceCenter('transfers')">
                    🔄 سجل التحويلات والمنح (${(transfersRes?.data || []).length})
                </button>
                <button class="mt-btn ${currentTab === 'lots' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.renderInstantBalanceCenter('lots')">
                    📦 دفعات المخزون والصلاحية (${lots.length})
                </button>
            </div>`
        ];

        let rightToolbarItems = [];
        if (currentTab === 'invoices') {
            rightToolbarItems = [
                `<input type="text" class="mt-input" placeholder="🔍 بحث بالرقم، المشتري، الهاتف..." value="${this.escape(this.ibSearchInvoices || '')}" onkeydown="if(event.key==='Enter'){ App.ibSearchInvoices=this.value; App.ibInvoicesPage=1; App.renderInstantBalanceCenter(); }" oninput="App.ibSearchInvoices=this.value; App.ibInvoicesPage=1; clearTimeout(App._ibSearchTimer); App._ibSearchTimer=setTimeout(()=>App.renderInstantBalanceCenter(), 300);" style="min-width:170px;" />`,
                `<select class="mt-select" onchange="App.ibFilterSaleKind=this.value; App.ibInvoicesPage=1; App.renderInstantBalanceCenter();">
                    <option value="">كل أنواع المبيعات</option>
                    <option value="digital_voucher" ${this.ibFilterSaleKind === 'digital_voucher' ? 'selected' : ''}>📲 كرت فوري</option>
                    <option value="balance_charge" ${this.ibFilterSaleKind === 'balance_charge' ? 'selected' : ''}>💳 رصيد شحن</option>
                </select>`,
                `<select class="mt-select" onchange="App.ibFilterPaymentType=this.value; App.ibInvoicesPage=1; App.renderInstantBalanceCenter();">
                    <option value="">كل طرق السداد</option>
                    <option value="cash" ${this.ibFilterPaymentType === 'cash' ? 'selected' : ''}>💵 نقدي</option>
                    <option value="credit" ${this.ibFilterPaymentType === 'credit' ? 'selected' : ''}>⏳ آجل</option>
                    <option value="partial" ${this.ibFilterPaymentType === 'partial' ? 'selected' : ''}>⚖️ جزئي</option>
                </select>`,
                `<select class="mt-select" onchange="App.ibLimit=parseInt(this.value); App.ibInvoicesPage=1; App.renderInstantBalanceCenter();" title="عدد العناصر في الصفحة">
                    <option value="10" ${limit === 10 ? 'selected' : ''}>10 فواتير</option>
                    <option value="25" ${limit === 25 ? 'selected' : ''}>25 فاتورة</option>
                    <option value="50" ${limit === 50 ? 'selected' : ''}>50 فاتورة</option>
                    <option value="100" ${limit === 100 ? 'selected' : ''}>100 فاتورة</option>
                    <option value="250" ${limit === 250 ? 'selected' : ''}>250 فاتورة</option>
                </select>`,
                (this.ibSearchInvoices || this.ibFilterSaleKind || this.ibFilterPaymentType) ? `
                    <button class="mt-btn mt-btn-danger" style="padding:4px 8px;" onclick="App.ibSearchInvoices=''; App.ibFilterSaleKind=''; App.ibFilterPaymentType=''; App.ibInvoicesPage=1; App.renderInstantBalanceCenter();" title="إلغاء كل الفلاتر">✕</button>
                ` : ''
            ];
        } else if (currentTab === 'transfers') {
            rightToolbarItems = [
                `<input type="text" class="mt-input" placeholder="🔍 بحث بالرقم، المرسل، المستلم..." value="${this.escape(this.ibSearchTransfers || '')}" onkeydown="if(event.key==='Enter'){ App.ibSearchTransfers=this.value; App.ibTransfersPage=1; App.renderInstantBalanceCenter(); }" oninput="App.ibSearchTransfers=this.value; App.ibTransfersPage=1; clearTimeout(App._ibSearchTimer); App._ibSearchTimer=setTimeout(()=>App.renderInstantBalanceCenter(), 300);" style="min-width:180px;" />`,
                `<select class="mt-select" onchange="App.ibFilterTransferOp=this.value; App.ibTransfersPage=1; App.renderInstantBalanceCenter();">
                    <option value="">كل أنواع الحركات</option>
                    <option value="grant" ${this.ibFilterTransferOp === 'grant' ? 'selected' : ''}>➕ منح أولي</option>
                    <option value="transfer" ${this.ibFilterTransferOp === 'transfer' ? 'selected' : ''}>🔄 تحويل لموزع</option>
                </select>`,
                `<select class="mt-select" onchange="App.ibLimit=parseInt(this.value); App.ibTransfersPage=1; App.renderInstantBalanceCenter();" title="عدد العناصر في الصفحة">
                    <option value="10" ${limit === 10 ? 'selected' : ''}>10 عمليات</option>
                    <option value="25" ${limit === 25 ? 'selected' : ''}>25 عملية</option>
                    <option value="50" ${limit === 50 ? 'selected' : ''}>50 عملية</option>
                    <option value="100" ${limit === 100 ? 'selected' : ''}>100 عملية</option>
                    <option value="250" ${limit === 250 ? 'selected' : ''}>250 عملية</option>
                </select>`,
                (this.ibSearchTransfers || this.ibFilterTransferOp) ? `
                    <button class="mt-btn mt-btn-danger" style="padding:4px 8px;" onclick="App.ibSearchTransfers=''; App.ibFilterTransferOp=''; App.ibTransfersPage=1; App.renderInstantBalanceCenter();" title="إلغاء البحث">✕</button>
                ` : ''
            ];
        } else {
            rightToolbarItems = [
                `<input type="text" class="mt-input" placeholder="🔍 بحث برقم الدفعة..." value="${this.escape(this.ibSearchLots || '')}" onkeydown="if(event.key==='Enter'){ App.ibSearchLots=this.value; App.ibLotsPage=1; App.renderInstantBalanceCenter(); }" oninput="App.ibSearchLots=this.value; App.ibLotsPage=1; clearTimeout(App._ibSearchTimer); App._ibSearchTimer=setTimeout(()=>App.renderInstantBalanceCenter(), 300);" style="min-width:180px;" />`,
                `<select class="mt-select" onchange="App.ibLimit=parseInt(this.value); App.ibLotsPage=1; App.renderInstantBalanceCenter();" title="عدد العناصر في الصفحة">
                    <option value="10" ${limit === 10 ? 'selected' : ''}>10 دفعات</option>
                    <option value="25" ${limit === 25 ? 'selected' : ''}>25 دفعة</option>
                    <option value="50" ${limit === 50 ? 'selected' : ''}>50 دفعة</option>
                    <option value="100" ${limit === 100 ? 'selected' : ''}>100 دفعة</option>
                </select>`,
                this.ibSearchLots ? `
                    <button class="mt-btn mt-btn-danger" style="padding:4px 8px;" onclick="App.ibSearchLots=''; App.ibLotsPage=1; App.renderInstantBalanceCenter();" title="إلغاء البحث">✕</button>
                ` : ''
            ];
        }

        // 2. Tab Content (Tables)
        let tabContentHtml = '';

        if (currentTab === 'invoices') {
            tabContentHtml = `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table" id="ib-invoices-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>الفاتورة</th>
                                <th>النوع</th>
                                <th>المشتري / الهاتف</th>
                                <th>الإجمالي</th>
                                <th>التكلفة</th>
                                <th>الربح</th>
                                <th>السداد</th>
                                <th>حالة الإرسال / الفاتورة</th>
                                <th>التاريخ</th>
                                <th>الإجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageInvoices.length > 0 ? pageInvoices.map((x, idx) => `
                            <tr>
                                <td style="font-size:11px; color:#64748b;">${startIdxInvoices + idx + 1}</td>
                                <td style="font-weight:700; font-family:monospace; color:#2563eb; white-space:nowrap;">${this.escape(x.invoice_no)}</td>
                                <td style="white-space:nowrap;">
                                    ${x.sale_kind === 'digital_voucher' ? '<span class="ib-badge ib-badge-purple">📲 كرت فوري</span>' : '<span class="ib-badge ib-badge-info">💳 رصيد شحن</span>'}
                                </td>
                                <td>
                                    <div style="font-weight:600;">${this.escape(x.buyer_account_name || x.buyer_name || 'عميل مباشر')}</div>
                                    ${x.buyer_phone ? `<div style="font-size:11px; color:#64748b; font-family:monospace;">${this.escape(x.buyer_phone)}</div>` : ''}
                                </td>
                                <td style="font-weight:700; white-space:nowrap;">
                                    ${money(x.total_amount)} ${App.getCurrencySymbol(App._baseCurrency)}
                                    <div style="font-size:10.5px; color:#0369a1; font-weight:normal;">${formatTafqeet(x.total_amount)}</div>
                                </td>
                                <td style="color:#64748b; white-space:nowrap;">${money(x.cost_amount)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                <td style="font-weight:700; color:#059669; white-space:nowrap;">+${money(x.profit_amount)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                <td style="white-space:nowrap;">
                                    <span class="ib-badge ${x.payment_type === 'cash' ? 'ib-badge-success' : (x.payment_type === 'credit' ? 'ib-badge-danger' : 'ib-badge-warning')}">
                                        ${x.payment_type === 'cash' ? 'نقدي' : (x.payment_type === 'credit' ? 'آجل' : 'جزئي')}
                                    </span>
                                </td>
                                <td style="white-space:nowrap;">
                                    ${x.invoice_status === 'refunded' ? '<span class="ib-badge ib-badge-danger">↩️ مسترجع وملغي</span>' : (
                                        x.sale_kind === 'digital_voucher' ? (
                                             x.delivery_status === 'sent' ? '<span class="ib-badge ib-badge-success">✅ تم الإرسال</span>' :
                                            (x.delivery_status === 'failed' ? '<span class="ib-badge ib-badge-danger">❌ تعذر الإرسال</span>' : '<span class="ib-badge ib-badge-warning">⏳ قيد الإرسال</span>')
                                        ) : '<span class="ib-badge ib-badge-success">✅ تم التحويل</span>'
                                    )}
                                </td>
                                <td style="font-size:11.5px; color:#64748b; white-space:nowrap;">${this.escape(x.created_at)}</td>
                                <td style="white-space:nowrap;">
                                    <div style="display:flex; gap:4px; align-items:center;">
                                        ${x.sale_kind === 'digital_voucher' && x.invoice_status !== 'refunded' ? `
                                            <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.resendInstantVoucher(${x.id})" title="إعادة إرسال واتساب">
                                                📲 إعادة إرسال
                                            </button>
                                        ` : ''}
                                        ${x.invoice_status === 'refunded' ? `
                                            <span class="ib-badge ib-badge-danger">↩️ مسترجع</span>
                                        ` : (
                                            (x.sale_kind === 'digital_voucher' && (x.first_login || x.voucher_status === 'used' || Number(x.radacct_count || 0) > 0)) ? `
                                                <span class="ib-badge ib-badge-info" title="تم تسجيل دخول بالكرت وبدء استهلاكه على الشبكة (غير قابل للاسترجاع)">⚡ مستهلك</span>
                                            ` : `
                                                <button class="mt-btn mt-btn-danger" style="padding:2px 6px; font-size:11px;" onclick="App.refundInstantVoucher(${x.id})" title="استرجاع الفاتورة وعكس القيد وحذف الكرت مباشرة">
                                                    ↩️ استرجاع
                                                </button>
                                            `
                                        )}
                                    </div>
                                </td>
                            </tr>
                            `).join('') : `
                            <tr><td colspan="11" style="text-align:center; padding:35px; color:#94a3b8;">لا توجد فواتير مبيعات مطابقة.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Footer -->
                <div class="mt-pagination sam-pagination-bar" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; color:var(--text-muted, #64748b);">
                        إجمالي الفواتير: <b>${totalInvoices.toLocaleString()}</b> (صفحة <b>${this.ibInvoicesPage}</b> من <b>${totalPagesInvoices}</b>) — المعروض: <b>${pageInvoices.length}</b>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="mt-btn" ${this.ibInvoicesPage <= 1 ? 'disabled' : ''} onclick="App.ibInvoicesPage=1; App.renderInstantBalanceCenter('invoices')">⇤ الأولى</button>
                        <button class="mt-btn" ${this.ibInvoicesPage <= 1 ? 'disabled' : ''} onclick="App.ibInvoicesPage--; App.renderInstantBalanceCenter('invoices')">◀ السابق</button>
                        <span style="padding:4px 10px; background:var(--bg-panel, #f8fafc); border:1px solid var(--border-color, #cbd5e1); border-radius:4px; font-weight:bold; font-size:12px;">${this.ibInvoicesPage} / ${totalPagesInvoices}</span>
                        <button class="mt-btn" ${this.ibInvoicesPage >= totalPagesInvoices ? 'disabled' : ''} onclick="App.ibInvoicesPage++; App.renderInstantBalanceCenter('invoices')">التالي ▶</button>
                        <button class="mt-btn" ${this.ibInvoicesPage >= totalPagesInvoices ? 'disabled' : ''} onclick="App.ibInvoicesPage=${totalPagesInvoices}; App.renderInstantBalanceCenter('invoices')">الأخيرة ⇥</button>
                    </div>
                </div>
            `;
        } else if (currentTab === 'transfers') {
            tabContentHtml = `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table" id="ib-transfers-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>المرجع</th>
                                <th>نوع العملية</th>
                                <th>المرسل</th>
                                <th>المستلم</th>
                                <th>الرصيد المحول</th>
                                <th>التكلفة الفعلية</th>
                                <th>التاريخ</th>
                                <th>الملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageTransfers.length > 0 ? pageTransfers.map((x, idx) => `
                            <tr>
                                <td style="font-size:11px; color:#64748b;">${startIdxTransfers + idx + 1}</td>
                                <td style="font-weight:700; font-family:monospace; color:#2563eb; white-space:nowrap;">${this.escape(x.reference_no || 'TR-' + x.id)}</td>
                                <td style="white-space:nowrap;">
                                    ${x.operation_type === 'grant' ? '<span class="ib-badge ib-badge-success">➕ منح أولي</span>' : '<span class="ib-badge ib-badge-info">🔄 تحويل لموزع</span>'}
                                </td>
                                <td><b>${this.escape(x.from_admin_name || 'الإدارة المركزية')}</b></td>
                                <td><b>${this.escape(x.to_admin_name || 'المخزن الرئيسي')}</b></td>
                                <td style="font-weight:700; color:#059669; white-space:nowrap;">
                                    ${money(x.amount)} ${App.getCurrencySymbol(App._baseCurrency)}
                                    <div style="font-size:10.5px; color:#0369a1; font-weight:normal;">${formatTafqeet(x.amount)}</div>
                                </td>
                                <td style="color:#64748b; white-space:nowrap;">${money(x.cost_amount)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                <td style="font-size:11.5px; color:#64748b; white-space:nowrap;">${this.escape(x.created_at)}</td>
                                <td style="font-size:12px; color:#475569;">${this.escape(x.notes || '-')}</td>
                            </tr>
                            `).join('') : `
                            <tr><td colspan="9" style="text-align:center; padding:35px; color:#94a3b8;">لا توجد عمليات تحويل أو منح مسجلة.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Footer -->
                <div class="mt-pagination sam-pagination-bar" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; color:var(--text-muted, #64748b);">
                        إجمالي التحويلات والمنح: <b>${totalTransfers.toLocaleString()}</b> (صفحة <b>${this.ibTransfersPage}</b> من <b>${totalPagesTransfers}</b>) — المعروض: <b>${pageTransfers.length}</b>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="mt-btn" ${this.ibTransfersPage <= 1 ? 'disabled' : ''} onclick="App.ibTransfersPage=1; App.renderInstantBalanceCenter('transfers')">⇤ الأولى</button>
                        <button class="mt-btn" ${this.ibTransfersPage <= 1 ? 'disabled' : ''} onclick="App.ibTransfersPage--; App.renderInstantBalanceCenter('transfers')">◀ السابق</button>
                        <span style="padding:4px 10px; background:var(--bg-panel, #f8fafc); border:1px solid var(--border-color, #cbd5e1); border-radius:4px; font-weight:bold; font-size:12px;">${this.ibTransfersPage} / ${totalPagesTransfers}</span>
                        <button class="mt-btn" ${this.ibTransfersPage >= totalPagesTransfers ? 'disabled' : ''} onclick="App.ibTransfersPage++; App.renderInstantBalanceCenter('transfers')">التالي ▶</button>
                        <button class="mt-btn" ${this.ibTransfersPage >= totalPagesTransfers ? 'disabled' : ''} onclick="App.ibTransfersPage=${totalPagesTransfers}; App.renderInstantBalanceCenter('transfers')">الأخيرة ⇥</button>
                    </div>
                </div>
            `;
        } else if (currentTab === 'lots') {
            tabContentHtml = `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table" id="ib-lots-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>رقم الدفعة</th>
                                <th>الرصيد الكلي الممنوح</th>
                                <th>المتبقي المتاح</th>
                                <th>المستهلك / المباع</th>
                                <th>نسبة الاستهلاك</th>
                                <th>تاريخ المنح</th>
                                <th>الصلاحية</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageLots.length > 0 ? pageLots.map((x, idx) => {
                                const total = Number(x.granted_amount || 0);
                                const rem = Number(x.remaining_amount || 0);
                                const used = total - rem;
                                const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                                const isExp = x.expires_at && new Date(x.expires_at) < new Date();
                                return `
                                <tr>
                                    <td style="font-size:11px; color:#64748b;">${startIdxLots + idx + 1}</td>
                                    <td style="font-weight:700; font-family:monospace; color:#2563eb; white-space:nowrap;">LOT #${x.id}</td>
                                    <td style="font-weight:700; white-space:nowrap;">${money(total)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                    <td style="font-weight:700; color:#059669; white-space:nowrap;">${money(rem)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                    <td style="color:#64748b; white-space:nowrap;">${money(used)} ${App.getCurrencySymbol(App._baseCurrency)}</td>
                                    <td style="white-space:nowrap;">
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <div style="flex:1; width:60px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                                                <div style="width:${pct}%; height:100%; background:${pct > 85 ? '#dc2626' : (pct > 50 ? '#d97706' : '#2563eb')};"></div>
                                            </div>
                                            <span style="font-size:11px; font-weight:700;">${pct}%</span>
                                        </div>
                                    </td>
                                    <td style="font-size:11.5px; color:#64748b; white-space:nowrap;">${this.escape(x.created_at)}</td>
                                    <td style="font-size:11.5px; white-space:nowrap;">
                                        ${x.expires_at ? `<span style="color:${isExp ? '#dc2626' : '#475569'};">${this.escape(x.expires_at)}</span>` : '<span style="color:#94a3b8;">غير محدد</span>'}
                                    </td>
                                    <td style="white-space:nowrap;">
                                        ${rem <= 0 ? '<span class="ib-badge ib-badge-danger">نفد بالكامل</span>' : (isExp ? '<span class="ib-badge ib-badge-warning">منتهي الصلاحية</span>' : '<span class="ib-badge ib-badge-success">نشط ومتاح</span>')}
                                    </td>
                                </tr>
                                `;
                            }).join('') : `
                            <tr><td colspan="9" style="text-align:center; padding:35px; color:#94a3b8;">لا توجد دفعات رصيد مسجلة.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Footer -->
                <div class="mt-pagination sam-pagination-bar" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; color:var(--text-muted, #64748b);">
                        إجمالي دفعات المخزون: <b>${totalLots.toLocaleString()}</b> (صفحة <b>${this.ibLotsPage}</b> من <b>${totalPagesLots}</b>) — المعروض: <b>${pageLots.length}</b>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="mt-btn" ${this.ibLotsPage <= 1 ? 'disabled' : ''} onclick="App.ibLotsPage=1; App.renderInstantBalanceCenter('lots')">⇤ الأولى</button>
                        <button class="mt-btn" ${this.ibLotsPage <= 1 ? 'disabled' : ''} onclick="App.ibLotsPage--; App.renderInstantBalanceCenter('lots')">◀ السابق</button>
                        <span style="padding:4px 10px; background:var(--bg-panel, #f8fafc); border:1px solid var(--border-color, #cbd5e1); border-radius:4px; font-weight:bold; font-size:12px;">${this.ibLotsPage} / ${totalPagesLots}</span>
                        <button class="mt-btn" ${this.ibLotsPage >= totalPagesLots ? 'disabled' : ''} onclick="App.ibLotsPage++; App.renderInstantBalanceCenter('lots')">التالي ▶</button>
                        <button class="mt-btn" ${this.ibLotsPage >= totalPagesLots ? 'disabled' : ''} onclick="App.ibLotsPage=${totalPagesLots}; App.renderInstantBalanceCenter('lots')">الأخيرة ⇥</button>
                    </div>
                </div>
            `;
        }

        // 3. Hero Header Actions
        const actions = [
            (this.userRole === 'system_owner' || this.userRole === 'superadmin') ? {
                label: 'منح رصيد أولي',
                icon: '➕',
                variant: 'primary',
                onclick: "App.showInstantBalanceTransferModal('grant')"
            } : null,
            {
                label: 'تحويل للموزعين',
                icon: '🔄',
                variant: 'secondary',
                onclick: "App.showInstantBalanceTransferModal('transfer')"
            },
            {
                label: 'بيع رصيد شحن',
                icon: '🧾',
                variant: 'success',
                onclick: "App.showInstantBalanceSaleModal()"
            },
            {
                label: 'بيع كرت واتساب',
                icon: '📲',
                variant: 'warning',
                onclick: "App.showInstantDigitalVoucherModal()"
            },
            {
                label: 'تحديث',
                icon: '⟳',
                variant: 'secondary',
                onclick: "App.renderInstantBalanceCenter()"
            }
        ].filter(Boolean);

        // 4. KPI Stats
        const stats = [
            {
                label: 'الرصيد الفوري المتاح',
                value: `${money(available)} ${App.getCurrencySymbol(App._baseCurrency)}`,
                icon: '💳',
                tone: 'blue',
                meta: `${lots.length} دفعات نشطة بالمخزن`
            },
            {
                label: 'إجمالي مبيعات الرصيد',
                value: `${money(totalSalesSum)} ${App.getCurrencySymbol(App._baseCurrency)}`,
                icon: '📈',
                tone: 'emerald',
                meta: `${invoices.length} فواتير بيع مسجلة`
            },
            {
                label: 'إجمالي الأرباح المحققة',
                value: `+${money(totalProfitSum)} ${App.getCurrencySymbol(App._baseCurrency)}`,
                icon: '💰',
                tone: 'amber',
                meta: 'فارق سعر البيع عن التكلفة'
            },
            {
                label: 'كروت الواتساب الصادرة',
                value: `${totalDigitalVouchers} كرت`,
                icon: '📲',
                tone: 'purple',
                meta: 'إصدار وتسليم فوري عبر واتساب'
            }
        ];

        // 5. PageBuilder Shell
        const PB = window.SamUI?.PageBuilder;
        if (PB && typeof PB.renderShell === 'function') {
            mainView.innerHTML = PB.renderShell({
                id: 'instant-balance-center',
                archetype: 'pos',
                eyebrow: 'POS & DIGITAL BALANCE CENTER',
                title: 'مركز الرصيد الفوري والمبيعات الرقمية',
                subtitle: 'إدارة مبيعات الرصيد والكروت الفورية عبر واتساب، شحن الموزعين وتتبع دفعات FIFO',
                icon: '⚡',
                actions: actions,
                stats: stats,
                toolbar: {
                    left: leftToolbarItems,
                    right: rightToolbarItems
                },
                content: tabContentHtml
            });
        } else {
            // Fallback rendering
            const actButtonsHtml = actions.map(a => `<button class="mt-btn mt-btn-${a.variant}" onclick="${a.onclick}">${a.icon} ${a.label}</button>`).join(' ');
            const kpisFallbackHtml = `
                <div class="kpi-grid" style="margin-bottom:12px;">
                    ${stats.map(s => `
                        <div class="kpi-card">
                            <div class="kpi-icon">${s.icon}</div>
                            <div>
                                <div class="kpi-val">${s.value}</div>
                                <div class="kpi-lbl">${s.label} (${s.meta})</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            const toolbarFallbackHtml = `
                <div class="mt-toolbar" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <div class="mt-toolbar-left" style="display:flex; gap:6px; align-items:center;">
                        ${actButtonsHtml}
                        ${leftToolbarItems.join('')}
                    </div>
                    <div class="mt-toolbar-right" style="display:flex; gap:6px; align-items:center;">
                        ${rightToolbarItems.join('')}
                    </div>
                </div>
            `;
            mainView.innerHTML = `
                ${toolbarFallbackHtml}
                <div class="view-scroll-content" style="flex:1; overflow-y:auto; padding:12px 12px calc(80px + env(safe-area-inset-bottom, 0px)) 12px;">
                    ${kpisFallbackHtml}
                    ${tabContentHtml}
                </div>
            `;
        }

        // Trigger SAM Mobile Responsive Transformation
        if (typeof App.organizeMobilePage === 'function') {
            App.organizeMobilePage();
        }
    };





    App.filterInstantInvoicesTable = function (q) {


        this.ibSearchInvoices = q;


        this.ibInvoicesPage = 1;


        this.renderInstantBalanceCenter('invoices');


    };





    // ==========================================
    // 1. MODAL: TRANSFER & GRANT INSTANT BALANCE
    // ==========================================
    App.showInstantBalanceTransferModal = async function (initialOp = 'transfer', targetAdminId = null) {
        const isRoot = this.userRole === 'system_owner' || this.userRole === 'superadmin';
        const accounts = await this.instantBalanceLoadAccounts();
        const available = await this.instantBalanceAvailable();

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">${initialOp === 'grant' ? '➕ منح رصيد شحن أولي للمخزن الرئيسي' : '🔄 تحويل رصيد شحن فوري للموزعين'}</span>
                <span onclick="App.closeModal()" style="cursor:pointer; font-size:18px;">✕</span>
            </div>
            <form onsubmit="App.submitInstantBalanceTransfer(event)" style="padding:16px;">
                <div class="mt-modal-body" style="padding:0; max-height:75vh; overflow-y:auto;">
                    <div id="ibt-available-badge" style="display:${initialOp === 'transfer' ? 'flex' : 'none'}; justify-content:space-between; align-items:center; background:#e0f2fe; border:1px solid #93c5fd; padding:8px 12px; border-radius:6px; margin-bottom:12px; font-size:12px; color:#0369a1;">
                        <span>💳 <b>الرصيد المتاح حالياً في مخزنك:</b></span>
                        <b style="font-size:14px; color:#0284c7;">${App.formatMoney(available)} ريال</b>
                    </div>
                    ${isRoot ? `
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">نوع الحركة</label>
                            <select id="ibt-op" class="mt-select" style="width:100%" onchange="App.updateInstantBalanceReceivers(this.value)">
                                <option value="grant" ${initialOp === 'grant' ? 'selected' : ''}>منح أولي من الإدارة للمخزن الرئيسي</option>
                                <option value="transfer" ${initialOp === 'transfer' ? 'selected' : ''}>تحويل رصيد إلى موزع معتمد</option>
                            </select>
                        </div>
                    ` : '<input type="hidden" id="ibt-op" value="transfer">'}

                    <div class="form-group" style="margin-bottom:12px;" id="ibt-receiver-group">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <label style="font-weight:bold; font-size:13px; color:#1e293b; margin:0;" id="ibt-receiver-label">👤 المستلم (الموزع / الوكيل) *</label>
                            <button type="button" class="mt-btn mt-btn-success" style="padding:3px 9px; font-size:11px; font-weight:bold; display:flex; align-items:center; gap:4px;" onclick="App.showQuickAddPosModal(function(newAdmin){ App.showInstantBalanceTransferModal(document.getElementById('ibt-op')?.value || 'transfer').then(() => { const sel = document.getElementById('ibt-receiver'); if(sel && newAdmin.id){ sel.value = newAdmin.id; } }); })">
                                🏪 ➕ إضافة حساب / وكيل جديد
                            </button>
                        </div>
                        <input type="text" class="mt-input" placeholder="🔍 بحث فوري بالاسم أو المستخدم أو الهاتف..." oninput="App.filterSelectOptions('ibt-receiver', this.value)" style="margin-bottom:6px; font-size:12px; width:100%; border-color:#93c5fd;">
                        <select id="ibt-receiver" class="mt-select" style="width:100%; font-weight:700;">
                            <option value="">-- اختر الموزع المستلم --</option>
                            ${accounts.filter(a => Number(a.id) !== Number(this.adminId)).map(a => `<option value="${a.id}" data-phone="${this.escape(a.phone || '')}" data-name="${this.escape(a.fullname || a.username)}" data-search="${this.escape(((a.fullname || '') + ' ' + (a.username || '') + ' ' + (a.phone || '')).toLowerCase())}">${this.escape(a.fullname || a.username)} (${a.role_title || a.role})</option>`).join('')}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">قيمة الرصيد الاسمية (${App.getCurrencySymbol(App._baseCurrency)}) *</label>
                            <input id="ibt-amount" type="number" inputmode="decimal" min="0.01" step="0.01" class="mt-input" style="width:100%; font-size:16px; font-weight:bold; color:#0284c7;" placeholder="0.00" required oninput="App.onInstantTransferAmountInput(this.value)">
                            <div id="ibt-amount-tafqeet" style="font-size:11px; color:#0369a1; font-weight:600; margin-top:3px; display:none;"></div>
                        </div>
                        <div class="form-group" id="ibt-cost-group" style="display:${initialOp === 'grant' ? 'block' : 'none'};">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">تكلفة شراء الرصيد الفعلية (${App.getCurrencySymbol(App._baseCurrency)}) *</label>
                            <input id="ibt-cost" type="number" inputmode="decimal" min="0.01" step="0.01" class="mt-input" style="width:100%; font-weight:bold; color:#059669;" placeholder="0.00">
                            <div id="ibt-cost-tafqeet" style="font-size:11px; color:#059669; font-weight:600; margin-top:3px; display:none;"></div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">تاريخ انتهاء الصلاحية</label>
                            <input id="ibt-expiry" type="datetime-local" class="mt-input" style="width:100%">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات العملية</label>
                            <input id="ibt-notes" class="mt-input" style="width:100%" placeholder="ملاحظات اختيارية عن التحويل...">
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-primary" style="font-weight:800; padding:8px 24px;">حفظ وتنفيذ العملية</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '620px');
        this.updateInstantBalanceReceivers(initialOp);
        if (targetAdminId) {
            const sel = document.getElementById('ibt-receiver');
            if (sel) sel.value = String(targetAdminId);
        }
    };

    App.updateInstantBalanceReceivers = function (op) {
        const isGrant = (op === 'grant');
        const recGroup = document.getElementById('ibt-receiver-group');
        const costGroup = document.getElementById('ibt-cost-group');
        const availBadge = document.getElementById('ibt-available-badge');
        if (availBadge) availBadge.style.display = isGrant ? 'none' : 'flex';
        if (costGroup) costGroup.style.display = isGrant ? 'block' : 'none';
        if (recGroup) recGroup.style.display = isGrant ? 'none' : 'block';
        const costInp = document.getElementById('ibt-cost');
        const amtInp = document.getElementById('ibt-amount');
        if (costInp && isGrant && amtInp && !costInp.value) costInp.value = amtInp.value;
    };

    App.onInstantTransferAmountInput = function (val) {
        const num = parseFloat(val) || 0;
        const tafqeetDiv = document.getElementById('ibt-amount-tafqeet');
        const words = typeof App.tafqeet === 'function' ? App.tafqeet(num) : '';
        if (tafqeetDiv) {
            tafqeetDiv.textContent = words ? ('📝 ' + words) : '';
            tafqeetDiv.style.display = words ? 'block' : 'none';
        }
        const costInp = document.getElementById('ibt-cost');
        if (costInp && document.getElementById('ibt-op')?.value === 'grant' && !costInp.dataset.manual) {
            costInp.value = val;
        }
    };

    App.submitInstantBalanceTransfer = async function (event) {
        event.preventDefault();
        const op = document.getElementById('ibt-op')?.value || 'transfer';
        const isGrant = (op === 'grant');
        const amount = Number(document.getElementById('ibt-amount')?.value || 0);
        const costAmount = Number(document.getElementById('ibt-cost')?.value || amount);
        const receiverId = isGrant ? (this.adminId || 1) : document.getElementById('ibt-receiver')?.value;
        const recSelect = document.getElementById('ibt-receiver');
        const receiverName = isGrant ? 'المخزن الرئيسي (حسابي الحالي)' : (recSelect ? recSelect.options[recSelect.selectedIndex]?.text : '');

        if (amount <= 0) return this.toast('يرجى كتابة مبلغ صحيح', 'warning');

        if (isGrant) {
            const ok = await App.showExactConfirmModal({
                headerTitle: '🏢 تأكيد بيانات منح رصيد شحن أولي للمخزن الرئيسي',
                headline: `تأكيد منح رصيد أولي بمبلغ ${App.formatMoney(amount)}`,
                subheadline: 'سيتم إضافة الرصيد الاسمي والتكلفة إلى مخزنك المتاح للبيع والتوزيع',
                rows: [
                    { label: 'الحساب المستلم:', html: `<b>المخزن الرئيسي (حسابي الحالي)</b>` },
                    { label: 'البنود والعملية:', html: `• <b>منح أولي للرصيد الفوري</b>: ${App.formatMoney(amount)}` },
                    { label: '💰 القيمة الاسمية للرصيد:', bg: '#f0fdf4', color: '#15803d', html: `<b style="color:#0284c7; font-size:14px;">${App.formatMoney(amount)}</b>` },
                    { label: '📉 تكلفة الشراء الفعلية:', bg: '#eff6ff', color: '#1e40af', html: `<b style="color:#059669; font-size:14px;">${App.formatMoney(costAmount)}</b>` }
                ],
                confirmBtnText: 'تأكيد المنح والإضافة للمخزن',
                confirmBtnClass: 'mt-btn-success',
                backBtnText: 'back'
            });
            if (!ok) return;
        } else {
            if (!receiverId) return this.toast('يرجى تحديد الموزع المستلم', 'warning');
            const ok = await App.showExactConfirmModal({
                headerTitle: '⚡ تأكيد بيانات تحويل رصيد شحن فوري',
                headline: `تأكيد تحويل رصيد بمبلغ ${App.formatMoney(amount)}`,
                subheadline: 'سيتم خصم المبلغ من مخزنك الفوري المتاح ونقله إلى حساب الموزع فوراً',
                rows: [
                    { label: 'المستلم (الموزع):', html: `<b>${this.escape(receiverName)}</b>` },
                    { label: 'البنود والعملية:', html: `• <b>تحويل رصيد فوري للموزع</b>` },
                    { label: '💰 المبلغ المحول:', bg: '#f0fdf4', color: '#15803d', html: `<b style="color:#0284c7; font-size:14px;">${App.formatMoney(amount)}</b>` }
                ],
                confirmBtnText: 'تأكيد التحويل الفوري',
                confirmBtnClass: 'mt-btn-success',
                backBtnText: 'back'
            });
            if (!ok) return;
        }

        const payload = {
            operation_type: op,
            target_admin_id: receiverId,
            receiver_admin_id: receiverId,
            amount: document.getElementById('ibt-amount').value,
            cost_amount: document.getElementById('ibt-cost')?.value || document.getElementById('ibt-amount').value,
            expires_at: document.getElementById('ibt-expiry')?.value || null,
            notes: document.getElementById('ibt-notes')?.value || ''
        };

        const res = await this.api(isGrant ? 'instant_balance_grant' : 'instant_balance_transfer', {}, 'POST', payload);
        if (!res?.success) return err(this, res, 'تعذر إتمام عملية التحويل');

        this.closeModal();
        this.renderInstantBalanceCenter('warehouses');

        const opt = recSelect?.options[recSelect.selectedIndex];
        const recPhone = (opt?.dataset?.phone || '').replace(/^(\+?967)/, '');
        const fullPhone = recPhone ? ('967' + recPhone) : '';
        const waMsg = `⚡ *إشعار تحويل رصيد فوري*\n━━━━━━━━━━━━━━━━━━\n📄 *رقم التحويل:* ${res.transfer_no}\n👤 *المستلم:* ${receiverName}\n💰 *المبلغ المحول:* ${App.formatMoney(amount)}\n📅 *الوقت:* ${new Date().toLocaleString('ar-YE')}\n━━━━━━━━━━━━━━━━━━\nتمت إضافة الرصيد لحسابكم بنجاح 🌐`;
        const waUrl = fullPhone ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(waMsg)}` : '';

        this.showStandardSuccessModal({
            title: isGrant ? 'تم المنح الأولي للرصيد بنجاح' : 'تم تحويل الرصيد الفوري بنجاح',
            subtitle: `تم تحويل مبلغ <b>${App.formatMoney(amount)}</b> إلى حساب <b>${this.escape(receiverName)}</b>`,
            icon: '⚡',
            headerColor: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            refNo: res.transfer_no,
            refLabel: 'رقم التحويل',
            items: [
                { label: 'المستلم', value: receiverName, color: '#0f172a' },
                { label: 'المبلغ المحول', value: App.formatMoney(amount), color: '#0284c7', size: '15px' },
                { label: 'رصيد مخزنك المتبقي', value: App.formatMoney(res.available || 0), color: '#15803d' }
            ],
            whatsappUrl: waUrl,
            whatsappMessage: waMsg,
            whatsappBtnText: '📲 إرسال إشعار التحويل للمستلم عبر واتساب'
        });
    };

    // ==========================================
    // 2. MODAL: SELL DIRECT INSTANT BALANCE
    // ==========================================
    App.showInstantBalanceSaleModal = async function () {
        const accounts = await this.instantBalanceLoadAccounts();
        const maxDisc = this.currentAdminDiscountRate || ((this.userRole === 'system_owner' || this.userRole === 'superadmin') ? 100 : 0);
        const modalHtml = `
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 18px;">
                <span style="font-weight:800; font-size:16px;">🧾 تحرير فاتورة بيع رصيد شحن فوري مباشر</span>
                <span onclick="App.closeModal()" style="cursor:pointer; font-size:18px; font-weight:700;">✕</span>
            </div>
            <form onsubmit="App.submitInstantBalanceSale(event)" style="padding:16px;">
                <div class="mt-modal-body" style="padding:0; max-height:75vh; overflow-y:auto;">
                    
                    <!-- Buyer Selection & Quick Search / Add -->
                    <div style="background:var(--bg-secondary,#f8fafc); border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <label style="font-weight:bold; font-size:13px; color:#1e293b; margin:0;">👤 المشتري (نقطة البيع / الوكيل / العميل) *</label>
                            <button type="button" class="mt-btn mt-btn-success" style="padding:4px 10px; font-size:11px; font-weight:bold; display:flex; align-items:center; gap:4px;" onclick="App.showQuickAddPosModal(function(newAdmin){ App.showInstantBalanceSaleModal().then(() => { const sel = document.getElementById('ibs-buyer'); if(sel && newAdmin.id){ sel.value = newAdmin.id; App.onInstantSaleBuyerChange(sel); } }); })">
                                🏪 ➕ إضافة نقطة بيع / عميل جديد
                            </button>
                        </div>
                        
                        <input type="text" class="mt-input" placeholder="🔍 بحث فوري بالاسم، اسم المستخدم، أو رقم الهاتف لتحديد المشتري بسرعة..." oninput="App.filterSelectOptions('ibs-buyer', this.value)" style="margin-bottom:6px; font-size:12px; width:100%; border-color:#93c5fd;">
                        
                        <select id="ibs-buyer" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onInstantSaleBuyerChange(this)">
                            <option value="">-- عميل مباشر / نقدي (بدون حساب مسجل) --</option>
                            ${accounts.map(a => `<option value="${a.id}" data-phone="${this.escape(a.phone || '')}" data-name="${this.escape(a.fullname || a.username)}" data-role="${this.escape(a.role_title || a.role)}" data-disc="${a.discount_rate || 0}" data-bal="${a.balance || 0}" data-search="${this.escape(((a.fullname || '') + ' ' + (a.username || '') + ' ' + (a.phone || '')).toLowerCase())}">${this.escape(a.fullname || a.username)} [${a.role_title || a.role}] (سقف الخصم: ${a.discount_rate || 0}%)</option>`).join('')}
                        </select>

                        <div id="ibs-buyer-info-bar" style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; margin-top:8px; font-size:12px; display:none; gap:12px; flex-wrap:wrap;"></div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">اسم العميل / المشتري</label>
                            <input id="ibs-name" class="mt-input" style="width:100%; font-weight:600;" placeholder="عميل مباشر">
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم هاتف الواتساب (لإرسال الفاتورة تلقائياً)</label>
                            <div class="ib-phone-wrapper">
                                <span class="ib-phone-prefix">+967</span>
                                <input id="ibs-phone" type="tel" class="ib-phone-input" placeholder="77XXXXXXX" maxlength="9">
                            </div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">مبلغ الشحن المطلوب (${App.getCurrencySymbol(App._baseCurrency)}) *</label>
                            <input id="ibs-amount" type="number" inputmode="decimal" min="0.01" step="0.01" class="mt-input" style="width:100%; font-size:16px; font-weight:bold; color:#059669;" placeholder="0.00" required oninput="App.onInstantSaleAmountInput(this.value)">
                            <div id="ibs-amount-tafqeet" style="display:none; font-size:11px; margin-top:3px; color:#047857; font-weight:600;"></div>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">مبلغ الخصم (إن وجد)</label>
                            <input id="ibs-discount" type="number" inputmode="decimal" min="0" step="0.01" class="mt-input" style="width:100%" placeholder="0.00" oninput="App.onInstantSaleDiscountInput(this.value)">
                            <small id="ibs-discount-help" style="color:#64748b; font-size:11px; display:block; margin-top:2px;"></small>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">طريقة السداد *</label>
                            <select id="ibs-payment" class="mt-select" style="width:100%" onchange="App.onInstantSalePaymentChange(this.value)" required>
                                <option value="cash">💵 نقدي (دخول الصندوق مباشرة)</option>
                                <option value="credit">⏳ آجل (قيد على ذمة المشتري)</option>
                                <option value="partial">⚖️ دفعة جزئية (مقدم + آجل)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">المبلغ المسدد فعلياً (${App.getCurrencySymbol(App._baseCurrency)}) *</label>
                            <input id="ibs-paid" type="number" inputmode="decimal" min="0" step="0.01" class="mt-input" style="width:100%; font-weight:bold;" required oninput="App.onInstantSalePaidInput(this.value)">
                            <div id="ibs-paid-tafqeet" style="display:none; font-size:11px; margin-top:3px; color:#047857; font-weight:600;"></div>
                            <small id="ibs-paid-help" style="color:#64748b; font-size:11px; display:block; margin-top:2px;"></small>
                        </div>
                    </div>

                    <!-- Live Summary Calculation Box -->
                    <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:12px; display:grid; grid-template-columns:repeat(3, 1fr); text-align:center; gap:6px;">
                        <div>
                            <span style="font-size:11px; color:#64748b; display:block;">الصافي المطلوب</span>
                            <b id="ibs-calc-net" style="font-size:15px; color:#0f172a;">${this.formatMoney(0)}</b>
                        </div>
                        <div>
                            <span style="font-size:11px; color:#64748b; display:block;">المسدد نقداً</span>
                            <b id="ibs-calc-paid" style="font-size:15px; color:#15803d;">${this.formatMoney(0)}</b>
                        </div>
                        <div>
                            <span style="font-size:11px; color:#64748b; display:block;">المتبقي آجل</span>
                            <b id="ibs-calc-rem" style="font-size:15px; color:#64748b;">${this.formatMoney(0)}</b>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات الفاتورة</label>
                        <input id="ibs-notes" class="mt-input" style="width:100%" placeholder="ملاحظات اختيارية عن البيع...">
                    </div>
                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn mt-btn-success" style="font-weight:800; padding:8px 24px;">تأكيد البيع وإصدار الفاتورة</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '650px');
        this.syncInstantSaleTotals();
    };

    App.syncInstantSaleTotals = function () {
        const amtInput = document.getElementById('ibs-amount');
        const discInput = document.getElementById('ibs-discount');
        const paidInput = document.getElementById('ibs-paid');
        const paySelect = document.getElementById('ibs-payment');

        const amount = Math.max(0, parseFloat(amtInput?.value) || 0);
        const discount = Math.max(0, parseFloat(discInput?.value) || 0);
        const net = Math.max(0, amount - discount);
        const payment = paySelect?.value || 'cash';

        let paid = parseFloat(paidInput?.value);
        if (isNaN(paid) || paidInput?.dataset?.auto === '1' || paidInput?.dataset?.auto === undefined) {
            if (payment === 'cash') {
                paid = net;
                if (paidInput) { paidInput.value = net > 0 ? net.toFixed(2) : '0.00'; paidInput.dataset.auto = '1'; }
            } else if (payment === 'credit') {
                paid = 0;
                if (paidInput) { paidInput.value = '0.00'; paidInput.dataset.auto = '1'; }
            } else if (payment === 'partial') {
                if (paidInput && (isNaN(paid) || paid === 0 || paid === net)) {
                    paid = net > 0 ? (net / 2) : 0;
                    paidInput.value = paid > 0 ? paid.toFixed(2) : '0.00';
                    paidInput.dataset.auto = '1';
                }
            }
        }
        paid = Math.max(0, isNaN(paid) ? 0 : paid);
        const remaining = Math.max(0, net - paid);

        // Update Tafqeet Text
        const amtTafqeet = document.getElementById('ibs-amount-tafqeet');
        if (amtTafqeet) {
            const w = amount > 0 && typeof App.tafqeet === 'function' ? App.tafqeet(amount) : '';
            amtTafqeet.textContent = w ? ('📝 ' + w) : '';
            amtTafqeet.style.display = w ? 'block' : 'none';
        }

        const paidTafqeet = document.getElementById('ibs-paid-tafqeet');
        if (paidTafqeet) {
            const w = paid > 0 && typeof App.tafqeet === 'function' ? App.tafqeet(paid) : '';
            paidTafqeet.textContent = w ? ('📝 ' + w) : '';
            paidTafqeet.style.display = w ? 'block' : 'none';
        }

        // Update Bottom Calculation Summary
        const calcNet = document.getElementById('ibs-calc-net');
        if (calcNet) calcNet.textContent = App.formatMoney(net);

        const calcPaid = document.getElementById('ibs-calc-paid');
        if (calcPaid) calcPaid.textContent = App.formatMoney(paid);

        const calcRem = document.getElementById('ibs-calc-rem');
        if (calcRem) {
            calcRem.textContent = App.formatMoney(remaining);
            calcRem.style.color = remaining > 0 ? '#dc2626' : '#64748b';
        }

        const helpPaid = document.getElementById('ibs-paid-help');
        if (helpPaid) {
            if (payment === 'cash') helpPaid.textContent = 'نقدي: يدخل الصندوق كاملاً.';
            else if (payment === 'credit') helpPaid.textContent = 'آجل: يقيد المبلغ كاملاً في ذمة المشتري.';
            else helpPaid.textContent = `دفعة جزئية: المسدد نقداً (${App.formatMoney(paid)}) والباقي آجل (${App.formatMoney(remaining)}).`;
        }
    };

    App.onInstantSaleAmountInput = function (val) {
        const paidInput = document.getElementById('ibs-paid');
        if (paidInput) paidInput.dataset.auto = '1';
        this.syncInstantSaleTotals();
    };

    App.onInstantSaleDiscountInput = function (val) {
        const paidInput = document.getElementById('ibs-paid');
        if (paidInput) paidInput.dataset.auto = '1';
        this.syncInstantSaleTotals();
    };

    App.onInstantSalePaymentChange = function (val) {
        const paidInput = document.getElementById('ibs-paid');
        if (paidInput) paidInput.dataset.auto = '1';
        this.syncInstantSaleTotals();
    };

    App.onInstantSalePaidInput = function (val) {
        const paidInput = document.getElementById('ibs-paid');
        if (paidInput) paidInput.dataset.auto = '0';
        this.syncInstantSaleTotals();
    };

    App.onInstantSaleBuyerChange = function (select) {
        const opt = select.options[select.selectedIndex];
        const bar = document.getElementById('ibs-buyer-info-bar');
        if (!opt || !opt.value) {
            if (bar) bar.style.display = 'none';
            if (document.getElementById('ibs-name')) document.getElementById('ibs-name').value = '';
            if (document.getElementById('ibs-phone')) document.getElementById('ibs-phone').value = '';
            this.syncInstantSaleTotals();
            return;
        }
        const phone = opt.dataset.phone || '';
        const name = opt.dataset.name || '';
        const role = opt.dataset.role || '';
        const disc = opt.dataset.disc || '0';
        const bal = parseFloat(opt.dataset.bal || 0);

        if (phone && document.getElementById('ibs-phone')) document.getElementById('ibs-phone').value = phone.replace(/^(\+?967)/, '');
        if (name && document.getElementById('ibs-name')) document.getElementById('ibs-name').value = name;

        if (bar) {
            bar.innerHTML = `
                <span>👤 <b>${this.escape(name)}</b></span>
                <span>🏷️ الرتبة: <b>${this.escape(role)}</b></span>
                <span>✨ الخصم المعتمد: <b>${disc}%</b></span>
                <span>💳 الرصيد المالي: <b style="color:${bal >= 0 ? '#059669' : '#dc2626'};">${this.formatMoney(bal)}</b></span>
            `;
            bar.style.display = 'flex';
        }
        this.syncInstantSaleTotals();
    };

    App.submitInstantBalanceSale = async function (event) {
        event.preventDefault();
        const phone = document.getElementById('ibs-phone').value.replace(/\D/g, '');
        const payment = document.getElementById('ibs-payment').value;
        if (phone && !/^\d{9}$/.test(phone)) return this.toast('رقم الهاتف اليمني يجب أن يكون 9 أرقام', 'warning');
        const buyer = document.getElementById('ibs-buyer').value;
        const buyerName = document.getElementById('ibs-name').value || 'عميل مباشر';
        if (payment !== 'cash' && !buyer) return this.toast('لا يمكن إصدار فاتورة (آجل) أو (جزئي) إلا بتحديد حساب عميل / موزع مسجل في النظام', 'warning');

        const amount = Number(document.getElementById('ibs-amount')?.value || 0);
        const discount = Number(document.getElementById('ibs-discount')?.value || 0);
        const paid = Number(document.getElementById('ibs-paid')?.value || 0);
        const net = Math.max(0, amount - discount);
        const remaining = Math.max(0, net - paid);

        const ok = await App.showExactConfirmModal({
            headerTitle: '🧾 تأكيد بيانات فاتورة مبيعات الرصيد الفوري',
            headline: `تأكيد بيع رصيد فوري بمبلغ ${App.formatMoney(amount)}`,
            subheadline: 'سيتم خصم الرصيد الفوري وقيد القيود المحاسبية وإصدار الفاتورة وإرسالها للمشترك',
            rows: [
                { label: 'المشتري:', html: `<b>${this.escape(buyerName)}</b>` },
                { label: 'رقم الهاتف:', html: `<b>${phone ? ('+967 ' + phone) : 'بدون هاتف'}</b>` },
                { label: 'البنود والكميات:', html: `• <b>رصيد شحن فوري مباشر</b>: المبلغ الاسمي: ${App.formatMoney(amount)} - الصافي: ${App.formatMoney(net)}` },
                { label: '💰 الصافي المطلوب:', bg: '#f0fdf4', color: '#15803d', html: `<b style="color:#15803d; font-size:14px;">${App.formatMoney(net)}</b> (إجمالي قبل الخصم: ${App.formatMoney(amount)}${discount > 0 ? ` | خصم: -${App.formatMoney(discount)}` : ''})` },
                { label: '💵 طريقة السداد والمدفوع:', bg: '#eff6ff', color: '#1e40af', html: `<b>${payment === 'cash' ? 'نقداً بالكامل' : (payment === 'credit' ? 'آجل بالكامل' : 'دفعة نقدية وآجل')}</b> (المدفوع: <b style="color:#15803d;">${App.formatMoney(paid)}</b> | المتبقي آجل: <b style="color:#dc2626;">${App.formatMoney(remaining)}</b>)` }
            ],
            confirmBtnText: 'تأكيد البيع والتفعيل الفوري',
            confirmBtnClass: 'mt-btn-success',
            backBtnText: 'back'
        });
        if (!ok) return;

        const payload = {
            buyer_admin_id: buyer || null,
            buyer_name: document.getElementById('ibs-name').value,
            buyer_phone: phone,
            amount: document.getElementById('ibs-amount').value,
            discount_amount: document.getElementById('ibs-discount').value,
            payment_type: payment,
            paid_amount: document.getElementById('ibs-paid').value,
            notes: document.getElementById('ibs-notes').value
        };
        const res = await this.api('instant_balance_sell', {}, 'POST', payload);
        if (!res?.success) return err(this, res, 'تعذر إصدار الفاتورة');

        this.closeModal();
        this.renderInstantBalanceCenter('invoices');

        const cleanPhone = (phone || '').replace(/^(\+?967)/, '');
        const fullPhone = cleanPhone ? ('967' + cleanPhone) : '';
        const waMsg = `⚡ *فاتورة مبيعات رصيد فوري*\n━━━━━━━━━━━━━━━━━━\n📄 *رقم الفاتورة:* ${res.invoice_no}\n👤 *العميل:* ${buyerName}\n💰 *المبلغ:* ${App.formatMoney(amount)}\n🏷️ *الخصم:* ${App.formatMoney(discount)}\n💵 *الصافي المطلوب:* ${App.formatMoney(net)}\n💳 *المسدد نقداً:* ${App.formatMoney(paid)}\n⏳ *المتبقي آجل:* ${App.formatMoney(remaining)}\n━━━━━━━━━━━━━━━━━━\nشكراً لتعاملكم معنا! 🌐`;
        const waUrl = fullPhone ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(waMsg)}` : '';

        this.showStandardSuccessModal({
            title: 'تم بيع الرصيد وإصدار الفاتورة بنجاح',
            subtitle: `تم بيع رصيد شحن فوري بقيمة <b>${App.formatMoney(amount)}</b> للمشتري <b>${this.escape(buyerName)}</b>`,
            icon: '⚡',
            headerColor: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            refNo: res.invoice_no,
            refLabel: 'رقم الفاتورة',
            items: [
                { label: 'الصافي المطلوب', value: App.formatMoney(net), color: '#0f172a', size: '15px' },
                { label: 'المسدد نقداً', value: App.formatMoney(paid), color: '#15803d', size: '14px' },
                { label: 'المتبقي آجل على الحساب', value: App.formatMoney(remaining), color: remaining > 0 ? '#dc2626' : '#64748b', size: '14px' }
            ],
            whatsappUrl: waUrl,
            whatsappMessage: waMsg,
            whatsappBtnText: '📲 إرسال الفاتورة للعميل عبر واتساب (WhatsApp)',
            printFn: `App.printSaleInvoice && App.printSaleInvoice(${res.invoice_id || 0})`
        });
    };

    // ==========================================
    // 3. MODAL: DIGITAL VOUCHER (ISSUE VOUCHER)
    // ==========================================
    App.showInstantDigitalVoucherModal = async function () {
        const [accounts, profilesRes] = await Promise.all([
            this.instantBalanceLoadAccounts(),
            this.api('get_profiles')
        ]);
        const profiles = Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || []);

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">📲 بيع كرت فوري وتوليده على FreeRADIUS وإرساله واتساب</span>
                <span onclick="App.closeModal()" style="cursor:pointer; font-size:18px;">✕</span>
            </div>
            <form onsubmit="App.submitInstantDigitalVoucher(event)" style="padding:16px;">
                <div class="mt-modal-body" style="padding:0; max-height:75vh; overflow-y:auto;">
                    
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">باقة الكرت المستهدفة *</label>
                        <select id="ibv-profile" class="mt-select" style="width:100%" required onchange="App.onInstantVoucherProfileChange(this)">
                            <option value="">-- اختر الباقة أو الفئة --</option>
                            ${profiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-'))).map(p => {
                                const pName = p.name_for_users || p.name;
                                const pPrice = parseFloat(p.retail_price || p.price || 0);
                                const pCost = parseFloat(p.cost_price || (p.price > 0 ? p.price : 0));
                                const labelText = `${pName} — سعر البيع: ${App.formatMoney(pPrice)} (التكلفة: ${App.formatMoney(pCost)})`;
                                return `<option value="${p.id}" data-id="${p.id}" data-price="${pPrice}" data-cost="${pCost}" data-free="0" data-name="${this.escape(p.name)}" data-label="${this.escape(pName)}">${this.escape(labelText)}</option>`;
                            }).join('')}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم هاتف الواتساب للمشتري *</label>
                            <div class="ib-phone-wrapper">
                                <span class="ib-phone-prefix">+967</span>
                                <input id="ibv-phone" type="tel" class="ib-phone-input" placeholder="77XXXXXXX" maxlength="9" required>
                            </div>
                            <small style="color:#64748b; font-size:11px; display:block; margin-top:3px;">سيتم إرسال بيانات الكرت (اليوزر والباسورد والتعليمات) إلى هذا الرقم فوراً.</small>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">اسم المشتري / العميل</label>
                            <input id="ibv-name" class="mt-input" style="width:100%" placeholder="اسم العميل">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label style="font-weight:700; font-size:12px; margin:0;">حساب العميل (اختياري)</label>
                                <button type="button" class="mt-btn mt-btn-success" style="padding:2px 8px; font-size:10px; font-weight:bold;" onclick="App.showQuickAddPosModal(function(newAdmin){ App.showInstantDigitalVoucherModal().then(() => { const sel = document.getElementById('ibv-buyer'); if(sel && newAdmin.id){ sel.value = newAdmin.id; App.onInstantVoucherBuyerChange(sel); } }); })">
                                    ➕ إضافة عميل جديد
                                </button>
                            </div>
                            <input type="text" class="mt-input" placeholder="🔍 بحث عن العميل..." oninput="App.filterSelectOptions('ibv-buyer', this.value)" style="margin-bottom:6px; font-size:11px; width:100%; border-color:#93c5fd;">
                            <select id="ibv-buyer" class="mt-select" style="width:100%" onchange="App.onInstantVoucherBuyerChange(this)">
                                <option value="">-- عميل مباشر (بدون حساب) --</option>
                                ${accounts.map(a => `<option value="${a.id}" data-phone="${this.escape(a.phone || '')}" data-name="${this.escape(a.fullname || a.username)}" data-search="${this.escape(((a.fullname || '') + ' ' + (a.username || '') + ' ' + (a.phone || '')).toLowerCase())}">${this.escape(a.fullname || a.username)} (${a.role_title || a.role})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">طريقة السداد *</label>
                            <select id="ibv-payment" class="mt-select" style="width:100%" required>
                                <option value="cash">💵 نقدي (دخول الصندوق مباشرة)</option>
                                <option value="credit">⏳ آجل (قيد على ذمة المشتري)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Cost / Price Card -->
                    <div id="ibv-pricing-card" style="background:#fdf4ff; border:1px solid #f0abfc; border-radius:8px; padding:12px; margin-bottom:14px; display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span style="font-size:11.5px; color:#86198f; font-weight:700; display:block;">المخصوم من رصيدك الفوري (التكلفة):</span>
                                <b id="ibv-cost-display" style="font-size:18px; color:#c026d3;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                                <div id="ibv-cost-tafqeet" style="font-size:11px; color:#86198f; font-weight:600; margin-top:2px;"></div>
                            </div>
                            <div style="text-align:left;">
                                <span style="font-size:11.5px; color:#475569; display:block;">سعر البيع للعميل (الإيراد):</span>
                                <b id="ibv-price-display" style="font-size:15px; color:#059669;">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</b>
                                <div id="ibv-profit-display" style="font-size:11px; color:#2563eb; font-weight:700; margin-top:2px;"></div>
                            </div>
                        </div>
                        <div style="font-size:11px; color:#6b21a8; margin-top:8px; padding-top:6px; border-top:1px dashed #f0abfc; text-align:center;">
                            ⚡ توليد آلي فوري في FreeRADIUS وإرسال بيانات الحساب للمشترك فوراً
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button class="mt-btn" style="background:linear-gradient(135deg, #9333ea 0%, #7e22ce 100%); color:#fff; font-weight:800; padding:8px 24px;">⚡ بيع وتوليد الكرت وإرساله واتساب</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '600px');
    };

    App.onInstantVoucherProfileChange = function (select) {
        const opt = select.options[select.selectedIndex];
        const card = document.getElementById('ibv-pricing-card');
        if (!opt || !opt.value) {
            if (card) card.style.display = 'none';
            return;
        }
        const price = parseFloat(opt.dataset.price || 0);
        const cost = parseFloat(opt.dataset.cost || 0);
        const isFree = (opt.dataset.free === '1' || (price === 0 && cost === 0));
        const profit = Math.max(0, price - cost);

        if (card) {
            card.style.display = 'block';
            if (isFree) {
                document.getElementById('ibv-cost-display').innerHTML = '<span style="color:#059669; font-size:16px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)} (مجاني 🎁)</span>';
                document.getElementById('ibv-price-display').innerHTML = '<span style="color:#059669; font-size:16px;">0.00 ${App.getCurrencySymbol(App._baseCurrency)} (مجاني 🎁)</span>';
                document.getElementById('ibv-profit-display').textContent = 'باقة مجانية / ترويجية للمشترك';
                const tafDiv = document.getElementById('ibv-cost-tafqeet');
                if (tafDiv) tafDiv.textContent = 'مجاني بالكامل (لن يتم خصم أي رصيد مالي)';
            } else {
                document.getElementById('ibv-cost-display').textContent = App.formatMoney(cost);
                document.getElementById('ibv-price-display').textContent = App.formatMoney(price);
                document.getElementById('ibv-profit-display').textContent = 'ربحك من الكرت: ' + App.formatMoney(profit);
                const w = cost > 0 && typeof App.tafqeet === 'function' ? App.tafqeet(cost) : '';
                const tafDiv = document.getElementById('ibv-cost-tafqeet');
                if (tafDiv) tafDiv.textContent = w ? ('فقط ' + w + ' لا غير') : '';
            }
        }
    };

    App.onInstantVoucherBuyerChange = function (select) {
        const opt = select.options[select.selectedIndex];
        if (!opt || !opt.value) return;
        const phone = opt.dataset.phone || '';
        const name = opt.dataset.name || '';
        if (phone && document.getElementById('ibv-phone')) document.getElementById('ibv-phone').value = phone.replace(/^(\+?967)/, '');
        if (name && document.getElementById('ibv-name')) document.getElementById('ibv-name').value = name;
    };

    App.submitInstantDigitalVoucher = async function (event) {
        event.preventDefault();
        const phone = document.getElementById('ibv-phone').value.replace(/\D/g, '');
        if (!/^\d{9}$/.test(phone)) return this.toast('رقم هاتف الواتساب اليمني يجب أن يتكون من 9 أرقام (مثال: 771234567)', 'warning');

        const profSelect = document.getElementById('ibv-profile');
        const selectedOpt = profSelect.options[profSelect.selectedIndex];
        if (!profSelect.value) return this.toast('يرجى اختيار باقة الكرت المستهدفة', 'warning');

        const profName = selectedOpt?.dataset?.label || selectedOpt?.dataset?.name || '';
        const price = Number(selectedOpt?.dataset?.price || 0);
        const cost = Number(selectedOpt?.dataset?.cost || 0);
        const isFree = (selectedOpt?.dataset?.free === '1' || (price === 0 && cost === 0));
        const profit = Math.max(0, price - cost);
        const buyerName = document.getElementById('ibv-name').value || 'عميل مباشر';
        const payment = document.getElementById('ibv-payment').value;

        const rows = [
            { label: 'المشتري:', html: `<b>${this.escape(buyerName)}</b>` },
            { label: 'رقم الواتساب:', html: `<b>+967 ${phone}</b>` },
            { label: 'البنود والكميات:', html: `• باقة <b>${this.escape(profName)}</b> (كرت رقمي فوري 1 حبة) - ${isFree ? '<span style="color:#059669; font-weight:bold;">🎁 باقة مجانية</span>' : 'سعر البيع: ' + App.formatMoney(price)}` }
        ];

        if (isFree) {
            rows.push({
                label: '🎁 نوع الكرت:',
                bg: '#f0fdf4',
                color: '#15803d',
                html: `<b style="color:#15803d; font-size:14px;">باقة مجانية بالكامل (${App.formatMoney(0)})</b> (لن يتم خصم أي رصيد مالي من حسابك)`
            });
            rows.push({
                label: '💵 المطالبة المالية:',
                bg: '#f8fafc',
                color: '#475569',
                html: `<b>مجاني (لا يوجد سداد مطلوب)</b>`
            });
        } else {
            rows.push({
                label: '💰 الصافي المطلوب:',
                bg: '#f0fdf4',
                color: '#15803d',
                html: `<b style="color:#15803d; font-size:14px;">${App.formatMoney(price)}</b> (المخصوم من رصيدك التكلفة: ${App.formatMoney(cost)} | ربحك المحقق: +${App.formatMoney(profit)})`
            });
            rows.push({
                label: '💵 طريقة السداد والمدفوع:',
                bg: '#eff6ff',
                color: '#1e40af',
                html: `<b>${payment === 'cash' ? 'نقداً بالكامل' : (payment === 'credit' ? 'آجل بالكامل' : 'دفعة نقدية وآجل')}</b> (المدفوع: <b style="color:#15803d;">${App.formatMoney(price)}</b>)`
            });
        }

        const ok = await App.showExactConfirmModal({
            headerTitle: isFree ? '🎁 تأكيد منح كرت مجاني فوري' : '🎫 تأكيد بيع وتوليد كرت إلكتروني فوري',
            headline: isFree ? `تأكيد توليد كرت مجاني (باقة ${profName})` : `تأكيد توليد كرت إلكتروني (باقة ${profName})`,
            subheadline: isFree ? 'سيتم توليد الكرت في FreeRADIUS دون خصم رصيد وإرسال البيانات للمشترك عبر الواتساب' : 'سيتم توليد الكرت في FreeRADIUS وخصم التكلفة من رصيدك وقيد المبلغ وإرسال البيانات للمشترك',
            rows: rows,
            confirmBtnText: isFree ? 'تأكيد التوليد والإرسال المجاني' : 'تأكيد التوليد والإرسال الفوري',
            confirmBtnClass: 'mt-btn-success',
            backBtnText: 'back'
        });

        if (!ok) return;

        const payload = {
            profile_id: profSelect.value,
            profile_name: selectedOpt?.dataset?.name || '',
            buyer_phone: phone,
            phone: phone,
            buyer_name: buyerName,
            buyer_admin_id: document.getElementById('ibv-buyer')?.value || null,
            payment_type: isFree ? 'cash' : payment
        };

        const res = await this.api('instant_balance_sell_digital_voucher', {}, 'POST', payload);
        if (!res?.success && !res?.id && !res?.invoice_no) return err(this, res, 'تعذر توليد وإرسال الكرت الرقمي');

        this.closeModal();
        this.renderInstantBalanceCenter('invoices');

        const cardCode = res.username || '';
        const cardPass = res.password || 'فارغة';
        const fullPhone = '967' + phone;
        const passLine = cardPass === 'فارغة' ? '🔓 *كلمة المرور:* فارغة' : `🔑 *كلمة المرور:* \`${cardPass}\``;
        const waMsg = `🏢 *SAM | كرت إنترنت مدفوع*\n━━━━━━━━━━━━━━━━━━━━\n🎫 *رقم الكرت:* \`${cardCode}\`\n${passLine}\n📦 *الباقة:* ${profName}\n💰 *سعر البيع:* ${isFree ? 'مجاني 🎁' : App.formatMoney(price)}\n📄 *رقم الفاتورة:* ${res.invoice_no || ''}\n━━━━━━━━━━━━━━━━━━━━\nشكراً لاستخدامكم خدمتنا 🌐`;
        const waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(waMsg)}`;

        // Mask customer secrets for display on seller screen: only first 3 digits/characters visible
        const maskSecret = function (str) {
            if (!str || str === 'فارغة' || str === '-' || str === 'null') return str || '-';
            const s = String(str);
            if (s.length <= 3) return s + '***';
            return s.slice(0, 3) + '*'.repeat(Math.max(3, s.length - 3));
        };
        const maskedCode = maskSecret(cardCode);
        const maskedPass = (cardPass === 'فارغة' || !cardPass) ? 'فارغة' : maskSecret(cardPass);

        const items = [
            { label: '🎫 رقم الكرت (اليوزر)', value: `<code style="font-size:16px; color:#d97706; background:#fef3c7; padding:2px 8px; border-radius:4px;" title="تم إخفاء باقي الرقم لحفظ خصوصية الزبون">${maskedCode}</code> <span style="font-size:11px; color:#64748b;">(أول 3 أرقام فقط)</span>`, size: '16px' },
            { label: '🔑 كلمة المرور', value: `<code style="font-size:15px;" title="تم إخفاء باقي كلمة المرور لحفظ خصوصية الزبون">${maskedPass}</code> <span style="font-size:11px; color:#64748b;">(أول 3 أرقام فقط)</span>`, size: '15px' },
            { label: '📦 الباقة المستهدفة', value: profName, color: '#2563eb' }
        ];

        if (isFree) {
            items.push({ label: '🎁 نوع الكرت', value: 'باقة مجانية (${App.formatMoney(0)})', color: '#059669' });
            items.push({ label: '💰 الرصيد المخصوم', value: '0.00 ${App.getCurrencySymbol(App._baseCurrency)} (بدون خصم)', color: '#059669' });
        } else {
            items.push({ label: '💰 سعر البيع', value: App.formatMoney(price), color: '#15803d' });
            items.push({ label: '📈 ربحك من الكرت', value: '+' + App.formatMoney(profit), color: '#059669' });
        }

        this.showStandardSuccessModal({
            title: isFree ? '🎁 تم توليد الكرت المجاني في FreeRADIUS بنجاح' : 'تم توليد الكرت الرقمي في FreeRADIUS بنجاح',
            subtitle: `تم إصدار الكرت بنجاح وإرساله للمشترك على الرقم <b>+967${phone}</b>`,
            icon: isFree ? '🎁' : '🎫',
            headerColor: isFree ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
            refNo: res.invoice_no || ('INV-DV-' + cardCode),
            refLabel: 'رقم الفاتورة',
            items: items,
            whatsappUrl: waUrl,
            whatsappMessage: waMsg,
            whatsappBtnText: '📲 إعادة إرسال الكرت للمشترك عبر واتساب',
            printFn: `App.printSaleInvoice && App.printSaleInvoice(${res.id || 0})`,
            printBtnText: '🖨️ طباعة إيصال الكرت'
        });
    };

    // Quick Action Helpers
    App.showInstantVoucherQuickAdd = function () {
        this.showInstantDigitalVoucherModal();
    };

    App.showInstantBalanceQuickAdd = function () {
        this.showInstantBalanceSaleModal();
    };

    App.resendInstantVoucher = async function (id) {
        const r = await App.api('instant_balance_resend_voucher', {}, 'POST', { invoice_id: id });
        App.toast(r?.success ? 'تمت إعادة الإرسال عبر الواتساب' : (r?.error || 'تعذر الإرسال'), r?.success ? 'success' : 'error');
        App.renderInstantBalanceCenter('invoices');
    };

    App.refundInstantVoucher = async function (id) {
        const inv = (this._lastIbInvoices || []).find(x => x.id == id);
        const invNo = inv?.invoice_no || ('#' + id);
        const costAmt = inv?.cost_amount ? App.formatMoney(inv.cost_amount) : 'المبلغ المحسوب';

        const ok = await App.showExactConfirmModal({
            headerTitle: '↩️ تأكيد استرجاع فاتورة كرت إلكتروني',
            headline: `تأكيد استرجاع وإلغاء الفاتورة (${invNo})`,
            subheadline: 'سيتم إلغاء الفاتورة وتعطيل وحذف الكرت من FreeRADIUS وإعادة التكلفة لرصيدك وعكس القيود المالية',
            rows: [
                { label: 'رقم الفاتورة:', html: `<b>${this.escape(invNo)}</b>` },
                { label: '💰 التكلفة المستعادة:', bg: '#f0fdf4', color: '#15803d', html: `<b style="color:#15803d; font-size:14px;">${costAmt}</b>` }
            ],
            confirmBtnText: 'تأكيد الاسترجاع وعكس القيد',
            confirmBtnClass: 'mt-btn-danger',
            backBtnText: 'back'
        });
        if (!ok) return;

        const r = await App.api('instant_balance_refund_voucher', {}, 'POST', { invoice_id: id });
        App.toast(r?.success ? 'تم استرجاع الفاتورة وإعادة الرصيد وعكس القيد بنجاح' : (r?.error || 'تعذر الاسترجاع'), r?.success ? 'success' : 'error');
        App.renderInstantBalanceCenter('invoices');
    };

    // Switch tab interception


    const oldSwitch = App.switchTab ? App.switchTab.bind(App) : null;
    App.switchTab = function (tab, pushHistory = true) {
        if (tab === 'wallet_sales' || tab === 'instant_balance') {
            if (!this.hasAccess('sales') && this.userRole !== 'system_owner' && this.userRole !== 'superadmin') return this.toast('غير مصرح', 'warning');
            this.currentTab = 'wallet_sales';
            try {
                sessionStorage.setItem('sam_active_tab', 'wallet_sales');
                localStorage.setItem('sam_active_tab', 'wallet_sales');
                if (window.location.hash !== '#wallet_sales') {
                    history.replaceState(null, '', '#wallet_sales');
                }
            } catch (e) {}
            this.updateBreadcrumb?.('wallet_sales');
            this.closeMobileSidebar?.();
            return this.renderInstantBalanceCenter('invoices');
        }
        if (oldSwitch) return oldSwitch(tab, pushHistory);
    };


})();
