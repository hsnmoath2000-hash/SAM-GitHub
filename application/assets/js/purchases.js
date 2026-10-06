/**
 * SAM User Manager — Purchases, Assets & Suppliers Module
 * Standard Winbox UI + Mobile Responsive Pattern (Actions / Filters / Stats)
 */
'use strict';

(function () {
    if (!window.App) return;

    const M = (n, cur = null) => (window.App && typeof window.App.formatMoney === 'function') ? window.App.formatMoney(n, true, cur) : (Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.ي');

    // ─── Menu & Navigation Hook ─────────────────────────────────────────────
    if (Array.isArray(App.departments)) {
        const targetDept = App.departments.find(d => d.id === 'finance' || d.id === 'general' || d.id === 'sales' || d.id === 'cards') || App.departments[0];
        if (targetDept && Array.isArray(targetDept.items) && !targetDept.items.find(i => i.id === 'purchases' || i.id === 'purchase_invoices')) {
            targetDept.items.push({ id: 'purchase_invoices', name: 'المشتريات والموردين', icon: '🧾' });
        }
    }

    const origSwitch = App.switchTab ? App.switchTab.bind(App) : null;
    App.switchTab = function(tab, pushHistory = true) {
        if (tab === 'purchases' || tab === 'purchase_invoices') {
            this.currentTab = 'purchase_invoices';
            try {
                sessionStorage.setItem('sam_active_tab', 'purchase_invoices');
                localStorage.setItem('sam_active_tab', 'purchase_invoices');
                if (window.location.hash !== '#purchase_invoices') {
                    history.replaceState(null, '', '#purchase_invoices');
                }
            } catch (e) {}
            if (typeof this.updateBreadcrumb === 'function') this.updateBreadcrumb('المشتريات والموردين');
            document.querySelectorAll('.mt-nav-item').forEach(el => el.classList.remove('active'));
            const nav = document.getElementById('nav-purchase_invoices') || document.getElementById('nav-purchases');
            if (nav) nav.classList.add('active');
            if (typeof this.closeMobileSidebar === 'function') this.closeMobileSidebar();
            this.renderPurchases();
            return;
        }
        if (origSwitch) return origSwitch(tab, pushHistory);
    };

    // State Variables
    App.purchasesSubTab = App.purchasesSubTab || 'invoices';
    App.purchasesSearch = App.purchasesSearch || '';
    App.purchasesPayFilter = App.purchasesPayFilter || '';
    App.purchasesStartDate = App.purchasesStartDate || '';
    App.purchasesEndDate = App.purchasesEndDate || '';
    App.suppliersSearch = App.suppliersSearch || '';

    /**
     * Main Renderer for Purchases & Suppliers Module
     */
    App.renderPurchases = async function(subTab = null) {
        if (subTab) this.purchasesSubTab = subTab;
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        const activeTab = this.purchasesSubTab || 'invoices';
        const PB = window.SamUI?.PageBuilder;

        const actions = [
            activeTab === 'invoices' ? {
                label: '➕ فاتورة مشتريات جديدة',
                variant: 'success',
                onclick: 'App.openPurchaseModal()'
            } : {
                label: '➕ إضافة مورد جديد',
                variant: 'primary',
                onclick: 'App.openSupplierModal()'
            },
            { label: '⟳ تحديث', variant: 'secondary', onclick: 'App.renderPurchases()' }
        ];

        const tabsNav = `
            <div class="view-mode-group" style="display:inline-flex; border:1px solid var(--sam-border, #cbd5e1); border-radius:6px; overflow:hidden;">
                <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'invoices' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0;" onclick="App.renderPurchases('invoices')">
                    🧾 فواتير المشتريات
                </button>
                <button type="button" class="sam-btn sam-btn--sm ${activeTab === 'suppliers' ? 'sam-btn--primary' : 'sam-btn--secondary'}" style="border-radius:0;" onclick="App.renderPurchases('suppliers')">
                    🏢 دليل الموردين
                </button>
            </div>
        `;

        const toolbar = {
            left: [
                tabsNav
            ],
            right: [
                activeTab === 'invoices' ? `
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <input type="text" class="sam-input mt-input" placeholder="🔍 رقم الفاتورة، المورد، البيان..." value="${this.escape(this.purchasesSearch || '')}" onkeydown="if(event.key==='Enter'){ App.purchasesSearch=this.value; App.loadPurchasesInvoicesList(); }" oninput="App.debouncePurchasesSearch(this.value)" style="min-width:180px;" />
                        <select class="sam-select mt-select" onchange="App.purchasesPayFilter=this.value; App.loadPurchasesInvoicesList();">
                            <option value="">كل طرق السداد</option>
                            <option value="cash" ${this.purchasesPayFilter === 'cash' ? 'selected' : ''}>💵 نقداً (Cash)</option>
                            <option value="credit" ${this.purchasesPayFilter === 'credit' ? 'selected' : ''}>⏳ آجل (Credit)</option>
                            <option value="partial" ${this.purchasesPayFilter === 'partial' ? 'selected' : ''}>⚖️ دفعة جزئية (Partial)</option>
                        </select>
                        <div style="display:inline-flex; align-items:center; gap:4px;">
                            <input type="date" class="sam-input mt-input" style="padding:4px 8px; font-size:11.5px;" value="${this.purchasesStartDate || ''}" onchange="App.purchasesStartDate=this.value; App.loadPurchasesInvoicesList();" title="من تاريخ" />
                            <span style="font-size:12px; color:var(--sam-text-secondary);">إلى</span>
                            <input type="date" class="sam-input mt-input" style="padding:4px 8px; font-size:11.5px;" value="${this.purchasesEndDate || ''}" onchange="App.purchasesEndDate=this.value; App.loadPurchasesInvoicesList();" title="إلى تاريخ" />
                        </div>
                        ${(this.purchasesSearch || this.purchasesPayFilter || this.purchasesStartDate || this.purchasesEndDate) ? `
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.purchasesSearch=''; App.purchasesPayFilter=''; App.purchasesStartDate=''; App.purchasesEndDate=''; App.loadPurchasesInvoicesList();" title="إلغاء كل الفلاتر">✕</button>
                        ` : ''}
                    </div>
                ` : `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="text" class="sam-input mt-input" placeholder="🔍 بحث بالاسم، الكود، الهاتف..." value="${this.escape(this.suppliersSearch || '')}" onkeydown="if(event.key==='Enter'){ App.suppliersSearch=this.value; App.loadSuppliersList(); }" oninput="App.debounceSuppliersSearch(this.value)" style="min-width:220px;" />
                        ${this.suppliersSearch ? `
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.suppliersSearch=''; App.loadSuppliersList();" title="إلغاء البحث">✕</button>
                        ` : ''}
                    </div>
                `
            ]
        };

        const shell = PB ? PB.renderShell({
            id: 'purchases',
            archetype: 'ledger',
            title: 'إدارة المشتريات والموردين',
            subtitle: 'سجل فواتير المشتريات، متابعة استحقاقات الموردين والدفعات المحاسبية',
            eyebrow: 'سلاسل الإمداد والمحاسبة',
            icon: '🧾',
            actions,
            toolbar,
            content: `<div id="purchases-container" style="flex:1; overflow-y:auto; padding:8px 0 30px 0;"><div style="text-align:center; padding:40px; color:#64748b;">⏳ جاري تحميل البيانات...</div></div>`
        }) : `
            <div class="sam-page-shell">
                <div id="purchases-container"></div>
            </div>
        `;

        mainView.innerHTML = shell;

        if (activeTab === 'invoices') {
            await this.loadPurchasesInvoicesList();
        } else {
            await this.loadSuppliersList();
        }
    };

    // ─── 1. Invoices List ────────────────────────────────────────────────────
    App.loadPurchasesInvoicesList = async function() {
        const container = document.getElementById('purchases-container');
        if (!container) return;

        const res = await this.api('get_purchases_list', {
            search: this.purchasesSearch || '',
            payment_type: this.purchasesPayFilter || '',
            start_date: this.purchasesStartDate || '',
            end_date: this.purchasesEndDate || '',
        });

        const invoices = res?.data || [];
        const totalPurchases = invoices.reduce((s, x) => s + parseFloat(x.total_amount || 0), 0);
        const totalPaid = invoices.reduce((s, x) => s + parseFloat(x.paid_amount || 0), 0);
        const totalRemaining = invoices.reduce((s, x) => s + parseFloat(x.remaining_amount || 0), 0);

        container.innerHTML = `
            <!-- Standard KPI Summary Cards (Mobile Collapsible) -->
            <div class="kpi-grid" style="margin-bottom:12px;">
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">📊</div>
                    <div>
                        <div class="kpi-val">${M(totalPurchases)}</div>
                        <div class="kpi-lbl">إجمالي المشتريات (${invoices.length} فاتورة)</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#e8f8f0; color:#16a34a;">💵</div>
                    <div>
                        <div class="kpi-val">${M(totalPaid)}</div>
                        <div class="kpi-lbl">المسدد نقداً / بنك</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fee2e2; color:#dc2626;">⏳</div>
                    <div>
                        <div class="kpi-val">${M(totalRemaining)}</div>
                        <div class="kpi-lbl">المتبقي الآجل (ديون الموردين)</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fef3c7; color:#d97706;">📑</div>
                    <div>
                        <div class="kpi-val">${invoices.length}</div>
                        <div class="kpi-lbl">عدد فواتير المشتريات</div>
                    </div>
                </div>
            </div>

            <!-- Invoices Table Container -->
            <div class="mt-table-container">
                <table class="mt-table">
                    <thead>
                        <tr>
                            <th>رقم الفاتورة</th>
                            <th>التاريخ</th>
                            <th>المورد</th>
                            <th>الشبكة</th>
                            <th>طريقة الدفع</th>
                            <th>الإجمالي</th>
                            <th>المدفوع</th>
                            <th>المتبقي</th>
                            <th>الأصناف</th>
                            <th>القيد</th>
                            <th style="text-align:center;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.length === 0 ? `
                            <tr><td colspan="11" style="text-align:center; padding:35px; color:#94a3b8;">لا توجد فواتير مشتريات مطابقة. اضغط "+ فاتورة مشتريات جديدة" لإضافة فاتورة.</td></tr>
                        ` : invoices.map(v => {
                            const cur = v.currency_code || App._baseCurrency || 'YER_SANAA';
                            const rate = parseFloat(v.exchange_rate || 1.0);
                            const curTot = (v.currency_total_amount !== undefined && v.currency_total_amount !== null && cur !== App._baseCurrency) ? parseFloat(v.currency_total_amount) : parseFloat(v.total_amount);
                            const curPaid = (v.currency_paid_amount !== undefined && v.currency_paid_amount !== null && cur !== App._baseCurrency) ? parseFloat(v.currency_paid_amount) : parseFloat(v.paid_amount);
                            const curRem = (v.currency_remaining_amount !== undefined && v.currency_remaining_amount !== null && cur !== App._baseCurrency) ? parseFloat(v.currency_remaining_amount) : Math.max(0, curTot - curPaid);
                            const isForeign = (cur !== App._baseCurrency && rate > 0);

                            return `
                            <tr>
                                <td style="font-weight:700; color:#0f172a; white-space:nowrap;"><code>${this.escape(v.invoice_no)}</code></td>
                                <td style="white-space:nowrap;">${this.escape(v.invoice_date)}</td>
                                <td><b>${this.escape(v.supplier_name || '—')}</b></td>
                                <td>${this.escape(v.network_name || 'عام')}</td>
                                <td style="white-space:nowrap;">
                                    <span class="status-pill ${v.payment_type === 'cash' ? 'status-online' : (v.payment_type === 'credit' ? 'status-disabled' : 'status-pending')}" style="font-size:11px;">
                                        ${v.payment_type === 'cash' ? 'نقدي' : (v.payment_type === 'credit' ? 'آجل' : 'جزئي')}
                                    </span>
                                </td>
                                <td style="font-weight:800; color:#0f172a; white-space:nowrap;">
                                    ${this.formatMoney(curTot, true, cur)}
                                    ${isForeign ? `<div style="font-size:10px; color:#64748b; font-weight:600;">≈ ${this.formatMoney(v.total_amount, true, App._baseCurrency)}</div>` : ''}
                                </td>
                                <td style="color:#15803d; font-weight:700; white-space:nowrap;">
                                    ${this.formatMoney(curPaid, true, cur)}
                                    ${isForeign && curPaid > 0 ? `<div style="font-size:10px; color:#64748b; font-weight:600;">≈ ${this.formatMoney(v.paid_amount, true, App._baseCurrency)}</div>` : ''}
                                </td>
                                <td style="color:${(curRem > 0 || parseFloat(v.remaining_amount) > 0) ? '#dc2626' : '#64748b'}; font-weight:800; white-space:nowrap;">
                                    ${this.formatMoney(curRem, true, cur)}
                                    ${isForeign && parseFloat(v.remaining_amount) > 0 ? `<div style="font-size:10px; color:#64748b; font-weight:600;">≈ ${this.formatMoney(v.remaining_amount, true, App._baseCurrency)}</div>` : ''}
                                </td>
                                <td style="white-space:nowrap;"><span style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:11px;">${v.items_count} صنف</span></td>
                                <td style="white-space:nowrap;">${v.journal_entry_id ? `<span style="color:#0284c7; font-weight:700;">JV#${v.journal_entry_id}</span>` : '—'}</td>
                                <td style="text-align:center; white-space:nowrap;">
                                    <button class="mt-btn" style="padding:3px 8px; font-size:11.5px;" onclick="App.viewPurchaseDetails(${v.id})" title="عرض التفاصيل">👁️ التفاصيل</button>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Trigger SAM Mobile Responsive Transformation
        if (typeof App.organizeMobilePage === 'function') {
            App.organizeMobilePage();
        }
    };

    App.debouncePurchasesSearch = function(val) {
        this.purchasesSearch = val;
        clearTimeout(this._piSearchDebounce);
        this._piSearchDebounce = setTimeout(() => this.loadPurchasesInvoicesList(), 300);
    };

    // ─── 2. Suppliers List ───────────────────────────────────────────────────
    App.loadSuppliersList = async function() {
        const container = document.getElementById('purchases-container');
        if (!container) return;

        const res = await this.api('get_suppliers', {
            search: this.suppliersSearch || ''
        });
        const suppliers = res?.data || [];

        const totalDebt = suppliers.reduce((s, x) => s + (parseFloat(x.current_balance) > 0 ? parseFloat(x.current_balance) : 0), 0);
        const debtCount = suppliers.filter(s => parseFloat(s.current_balance) > 0).length;

        container.innerHTML = `
            <!-- Standard KPI Summary Cards (Mobile Collapsible) -->
            <div class="kpi-grid" style="margin-bottom:12px;">
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">🏢</div>
                    <div>
                        <div class="kpi-val">${suppliers.length}</div>
                        <div class="kpi-lbl">إجمالي الموردين المعتمدين</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fee2e2; color:#dc2626;">💳</div>
                    <div>
                        <div class="kpi-val">${M(totalDebt)}</div>
                        <div class="kpi-lbl">إجمالي ديون الموردين المستحقة</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fef3c7; color:#d97706;">⚠️</div>
                    <div>
                        <div class="kpi-val">${debtCount}</div>
                        <div class="kpi-lbl">موردون بحسابات دائنة مستحقة</div>
                    </div>
                </div>
            </div>

            <!-- Suppliers Responsive Grid Cards -->
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:12px;">
                ${suppliers.length === 0 ? `
                    <div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
                        لا يوجد موردون مسجلون مطابقون. انقر فوق "➕ إضافة مورد جديد" للبدء.
                    </div>
                ` : suppliers.map(s => {
                    const bal = parseFloat(s.current_balance || 0);
                    return `
                        <div class="supplier-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:all 0.15s ease;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                                    <h4 style="margin:0; font-size:14.5px; font-weight:800; color:#0f172a;">${this.escape(s.name)}</h4>
                                    <span style="font-size:11px; background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-weight:700;">${this.escape(s.supplier_code)}</span>
                                </div>
                                <div style="font-size:12px; color:#64748b; margin-bottom:8px; line-height:1.5;">
                                    ${s.phone ? `<div>📞 ${this.escape(s.phone)}</div>` : ''}
                                    ${s.address ? `<div>📍 ${this.escape(s.address)}</div>` : ''}
                                    ${s.account_code ? `<div>💼 الحساب المحاسبي: <b>[${s.account_code}]</b></div>` : ''}
                                </div>
                            </div>
                            
                            <div style="border-top:1px solid #f1f5f9; padding-top:10px; margin-top:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <span style="font-size:11.5px; color:#64748b;">الرصيد الحالي:</span>
                                    <span style="font-size:14.5px; font-weight:800; color:${bal > 0 ? '#dc2626' : (bal < 0 ? '#15803d' : '#64748b')};">
                                        ${M(bal)} ${bal > 0 ? '(مستحق له)' : (bal < 0 ? '(مدين لنا)' : '')}
                                    </span>
                                </div>
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button class="mt-btn mt-btn-success" style="flex:1; padding:4px 6px; font-size:11.5px; font-weight:700;" onclick="App.openSupplierPaymentModal(${s.id})" ${bal <= 0 ? 'disabled' : ''}>
                                        💵 سداد دفعة
                                    </button>
                                    <button class="mt-btn" style="padding:4px 8px; font-size:11.5px;" onclick="App.openSupplierStatementModal(${s.id})" title="كشف الحساب">
                                        📋 كشف حساب
                                    </button>
                                    <button class="mt-btn" style="padding:4px 8px; font-size:11.5px;" onclick="App.openSupplierModal(${JSON.stringify(s).replace(/"/g, '&quot;')})" title="تعديل">
                                        ✏️
                                    </button>
                                    <button class="mt-btn mt-btn-danger" style="padding:4px 8px; font-size:11.5px;" onclick="App.deleteSupplier(${s.id})" title="حذف">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Trigger SAM Mobile Responsive Transformation
        if (typeof App.organizeMobilePage === 'function') {
            App.organizeMobilePage();
        }
    };

    App.debounceSuppliersSearch = function(val) {
        this.suppliersSearch = val;
        clearTimeout(this._supSearchDebounce);
        this._supSearchDebounce = setTimeout(() => this.loadSuppliersList(), 300);
    };

        // ─── 3. Purchase Invoice Modal (Add New with Autocomplete & Catalog) ─────
    App.openPurchaseModal = async function() {
        const lookRes = await this.api('get_purchase_lookups');
        const lookups = lookRes?.data || lookRes || {};

        const currentUserId = Number(this.adminId || this.currentUser?.id || 1);
        const suppliers = lookups.suppliers || [];
        const treasuries = lookups.treasuries || [];
        const currentAdminAccId = Number(lookups.current_admin_account_id || 0);
        const userDefaultBox = treasuries.find(t => (currentAdminAccId && Number(t.id) === currentAdminAccId) || (t.linked_admin_id && Number(t.linked_admin_id) === currentUserId));
        const userDefaultBoxId = userDefaultBox ? userDefaultBox.id : null;
        const admins = lookups.admins || [];
        const previousItems = lookups.previous_items || [];

        if (suppliers.length === 0) {
            this.toast('يرجى إضافة مورد واحد على الأقل قبل تسجيل فاتورة مشتريات', 'warning');
            this.openSupplierModal();
            return;
        }

        this._purchaseItemsCatalog = previousItems;
        this._purchaseSuppliers = suppliers;
        this._purchaseTreasuries = treasuries;
        this._purchaseAdmins = admins;
        this._purchaseTotal = 0;

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">🛒 تسجيل فاتورة مشتريات جديدة وأصول</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitPurchaseInvoice(event)" style="padding:16px;">
                
                <!-- Datalist for Items Autocomplete -->
                <datalist id="pi-items-catalog">
                    ${previousItems.map(it => `
                        <option value="${this.escape(it.item_name)}">
                            [${it.category || 'عام'}] ${it.unit_price > 0 ? `${App.formatMoney(it.unit_price)}` : ''} (${this.escape(it.unit_type || 'قطعة')})
                        </option>
                    `).join('')}
                </datalist>

                <!-- Header Fields with Currency -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <label style="font-weight:700; font-size:12px; color:#0f172a;">المورد *</label>
                            <button type="button" class="mt-btn mt-btn-success" style="padding:1px 6px; font-size:10.5px; font-weight:bold;" onclick="App.openSupplierModal()">➕ مورد جديد</button>
                        </div>
                        <div style="position:relative;">
                            <input type="text" list="pi-suppliers-catalog" id="pi-supplier-input" class="mt-input" style="width:100%; font-weight:700;" placeholder="🔍 اختر أو ابحث عن المورد..." oninput="App.syncAdminCombobox(this, 'pi-supplier', 'pi-suppliers-catalog', (id, opt) => App.onPurchaseSupplierChange(id, opt))" onchange="App.syncAdminCombobox(this, 'pi-supplier', 'pi-suppliers-catalog', (id, opt) => App.onPurchaseSupplierChange(id, opt))" required />
                            <input type="hidden" id="pi-supplier" value="" />
                            <datalist id="pi-suppliers-catalog">
                                ${suppliers.map(s => `
                                    <option data-id="${s.id}" data-phone="${this.escape(s.phone || '')}" data-balance="${s.current_balance || 0}" data-code="${this.escape(s.supplier_code || '')}" data-search="${this.escape(((s.name||'') + ' ' + (s.supplier_code||'') + ' ' + (s.phone||'')).toLowerCase())}" value="${this.escape(s.name)} (${s.supplier_code})">
                                        ${this.escape(s.name)} (${s.supplier_code})
                                    </option>
                                `).join('')}
                            </datalist>
                        </div>
                        <div id="pi-supplier-info-bar" style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; margin-top:4px; font-size:11px; display:none; justify-content:space-between; align-items:center;"></div>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; color:#0f172a; display:block; margin-bottom:4px;">عملة الفاتورة *</label>
                        <select id="pi-currency" class="mt-select" style="width:100%; font-weight:800;" onchange="App.onPurchaseCurrencyChange(this.value)">
                            ${this.renderCurrencyOptions(this._baseCurrency)}
                        </select>
                        <div id="pi-currency-rate-note" style="display:none; font-size:11px; color:#0284c7; font-weight:700; margin-top:3px;"></div>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; color:#0f172a; display:block; margin-bottom:4px;">تاريخ الفاتورة *</label>
                        <input type="date" id="pi-date" class="mt-input" style="width:100%; font-weight:700;" value="${new Date().toISOString().split('T')[0]}" required />
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; color:#0f172a; display:block; margin-bottom:4px;">رقم فاتورة المورد (اختياري)</label>
                        <input type="text" id="pi-supno" class="mt-input" style="width:100%;" placeholder="INV-SUP-1234" />
                    </div>
                </div>

                <!-- Items Container -->
                <div style="margin-bottom:14px; border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#f1f5f9;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
                        <span style="font-weight:800; font-size:13.5px; color:#0f172a;">📦 بنود ومعدات الفاتورة</span>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; padding:4px 12px; font-size:12px; font-weight:bold; display:inline-flex; align-items:center; gap:4px;" onclick="App.showPurchaseCatalogPicker()">
                                📚 اختيار من الأصناف السابقة (${previousItems.length})
                            </button>
                            <button type="button" class="mt-btn mt-btn-primary" style="padding:4px 12px; font-size:12px; font-weight:bold;" onclick="App.addPurchaseRow()">
                                ➕ إضافة بند
                            </button>
                        </div>
                    </div>
                    
                    <div id="pi-items-list" style="display:flex; flex-direction:column; gap:8px;">
                        <!-- Initial Row -->
                    </div>
                </div>

                <!-- Payment Fields & Summary -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; margin-bottom:14px;">
                    <div>
                        <label style="font-weight:700; font-size:12px; color:#166534; display:block; margin-bottom:4px;">طريقة السداد *</label>
                        <select id="pi-pay-type" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onPurchasePaymentTypeChange(this.value)" required>
                            <option value="cash">💵 نقداً (سداد فوري من الصندوق/البنك)</option>
                            <option value="credit">⏳ آجل (قيد كامل على حساب المورد)</option>
                            <option value="partial">⚖️ دفعة جزئية (مقدم + آجل)</option>
                        </select>
                    </div>
                    <div id="pi-treasury-wrap">
                        <label style="font-weight:700; font-size:12px; color:#166534; display:block; margin-bottom:4px;">حساب الدفع (حساب المستخدم / الخزينة) *</label>
                        <select id="pi-pay-account" class="mt-select" style="width:100%; font-weight:700;">
                            ${treasuries.map(t => {
                                const isCurrentAdminAcc = (currentAdminAccId && Number(t.id) === currentAdminAccId);
                                const isUserBox = (t.linked_admin_id && Number(t.linked_admin_id) === Number(currentUserId));
                                const isMainBox = (!userDefaultBoxId && t.account_code === '1101');
                                const isSelected = isCurrentAdminAcc || isUserBox || isMainBox;
                                return `<option value="${t.id}" ${isSelected ? 'selected' : ''}>[${t.account_code}] ${this.escape(t.name_ar)} (رصيد: ${App.formatMoney(t.balance || 0)})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div id="pi-paid-wrap">
                        <label style="font-weight:700; font-size:12px; color:#166534; display:block; margin-bottom:4px;">المبلغ المسدد نقداً *</label>
                        <input type="number" step="0.01" id="pi-paid-amount" class="mt-input" style="width:100%; font-weight:800; font-size:14px; color:#15803d;" value="0" oninput="App.calcPurchaseTotals()" />
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; color:#166534; display:block; margin-bottom:4px;">المستلم / المشرف المسؤول</label>
                        <div style="position:relative;">
                            <input type="text" list="pi-receivers-catalog" id="pi-receiver-input" class="mt-input" style="width:100%; font-weight:600;" placeholder="🔍 اختر أو ابحث عن المشرف المستلم..." oninput="App.syncAdminCombobox(this, 'pi-receiver', 'pi-receivers-catalog')" onchange="App.syncAdminCombobox(this, 'pi-receiver', 'pi-receivers-catalog')" value="${admins.find(a => Number(a.id) === Number(currentUserId)) ? `${this.escape(admins.find(a => Number(a.id) === Number(currentUserId)).fullname || admins.find(a => Number(a.id) === Number(currentUserId)).username)} (${this.escape(admins.find(a => Number(a.id) === Number(currentUserId)).role_ar || admins.find(a => Number(a.id) === Number(currentUserId)).role || 'عضو شبكة')})` : ''}" />
                            <input type="hidden" id="pi-receiver" value="${currentUserId}" />
                            <datalist id="pi-receivers-catalog">
                                ${admins.map(a => `
                                    <option data-id="${a.id}" data-search="${this.escape(((a.fullname||'') + ' ' + (a.username||'') + ' ' + (a.phone||'') + ' ' + (a.role_ar||a.role||'')).toLowerCase())}" value="${this.escape(a.fullname || a.username)} (${this.escape(a.role_ar || a.role || 'عضو شبكة')})">
                                        ${this.escape(a.fullname || a.username)} (@${this.escape(a.username)})
                                    </option>
                                `).join('')}
                            </datalist>
                        </div>
                    </div>
                </div>

                <!-- Live Summary Badges -->
                <div style="background:#0f172a; color:#fff; border-radius:8px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <span style="font-size:12px; color:#94a3b8;">إجمالي الفاتورة: </span>
                        <b id="pi-sum-total" style="font-size:16px; color:#38bdf8;">0.00 ${App.getCurrencySymbol(this._baseCurrency)}</b>
                    </div>
                    <div>
                        <span style="font-size:12px; color:#94a3b8;">المسدد: </span>
                        <b id="pi-sum-paid" style="font-size:16px; color:#4ade80;">0.00 ${App.getCurrencySymbol(this._baseCurrency)}</b>
                    </div>
                    <div>
                        <span style="font-size:12px; color:#94a3b8;">المتبقي الآجل: </span>
                        <b id="pi-sum-rem" style="font-size:16px; color:#f87171;">0.00 ${App.getCurrencySymbol(this._baseCurrency)}</b>
                    </div>
                </div>

                <div id="pi-tafqeet-note" style="font-size:12px; color:#0284c7; font-weight:bold; margin-bottom:14px; background:#f0f9ff; border:1px solid #bae6fd; padding:8px 12px; border-radius:6px;"></div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; padding:8px 24px;">💾 ترحيل الفاتورة وتوليد القيد</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '950px');
        this.addPurchaseRow();
        this.onPurchasePaymentTypeChange('cash');
    };

    App.onPurchaseSupplierChange = function(supIdOrSelect, optElem) {
        const infoBar = document.getElementById('pi-supplier-info-bar');
        if (!infoBar) return;
        let opt = optElem;
        let val = supIdOrSelect;
        if (supIdOrSelect && typeof supIdOrSelect === 'object' && supIdOrSelect.tagName === 'SELECT') {
            val = supIdOrSelect.value;
            opt = supIdOrSelect.options[supIdOrSelect.selectedIndex];
        }
        if (!val || !opt) {
            infoBar.style.display = 'none';
            return;
        }
        const bal = parseFloat(opt.dataset?.balance || opt.getAttribute?.('data-balance') || 0);
        const phone = opt.dataset?.phone || opt.getAttribute?.('data-phone') || '';
        const code = opt.dataset?.code || opt.getAttribute?.('data-code') || '';
        infoBar.style.display = 'flex';
        infoBar.innerHTML = `
            <span>🏢 كود: <b>${this.escape(code)}</b> ${phone ? `| 📞 ${this.escape(phone)}` : ''}</span>
            <span>رصيد المورد الحالي: <b style="color:${bal > 0 ? '#dc2626' : '#15803d'};">${App.formatMoney(bal)}</b></span>
        `;
    };

    App.addPurchaseRow = function(prefill = null) {
        const list = document.getElementById('pi-items-list');
        if (!list) return;

        const row = document.createElement('div');
        row.className = 'pi-row';
        row.style.cssText = 'background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; display:grid; grid-template-columns: 2.8fr 1.8fr 0.9fr 0.9fr 1.6fr 36px; gap:8px; align-items:flex-end; box-shadow:0 1px 2px rgba(0,0,0,0.04);';

        const nameVal = prefill?.item_name || '';
        const catVal = prefill?.category || 'routers';
        const qtyVal = prefill?.quantity || 1;
        const unitVal = prefill?.unit_type || 'قطعة';
        const priceVal = prefill?.unit_price !== undefined ? prefill.unit_price : '';

        row.innerHTML = `
            <div>
                <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">اسم الصنف / الجهاز *</label>
                <input type="text" list="pi-items-catalog" class="mt-input pi-name" placeholder="🔍 اختر من الأصول أو اكتب اسم صنف جديد..." style="width:100%; font-weight:700; font-size:13px;" value="${this.escape(nameVal)}" oninput="App.onPurchaseItemNameChange(this)" required />
            </div>
            <div>
                <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">التصنيف والفئة المحاسبية *</label>
                <select class="mt-select pi-cat" style="width:100%; font-size:11.5px; font-weight:600;">
                    <option value="routers" ${catVal === 'routers' ? 'selected' : ''}>📡 راوترات وأجهزة شبكة (أصل)</option>
                    <option value="antennas" ${(catVal === 'antennas' || catVal === 'antennas_dishes') ? 'selected' : ''}>📶 هوائيات وسكترات (أصل)</option>
                    <option value="cables" ${(catVal === 'cables' || catVal === 'cables_fiber') ? 'selected' : ''}>🔌 كابلات وتمديدات (أصل)</option>
                    <option value="servers" ${catVal === 'servers' ? 'selected' : ''}>💻 خوادم وسيرفرات (أصل)</option>
                    <option value="power_supplies" ${(catVal === 'power_supplies' || catVal === 'solar_batteries') ? 'selected' : ''}>☀️ طاقة وبطاريات (أصل)</option>
                    <option value="towers" ${catVal === 'towers' ? 'selected' : ''}>🗼 أبراج وصواري (أصل)</option>
                    <option value="maintenance_parts" ${catVal === 'maintenance_parts' ? 'selected' : ''}>🔧 قطع صيانة ومستهلكات (مصروف)</option>
                    <option value="other_assets" ${(catVal === 'other_assets' || catVal === 'other') ? 'selected' : ''}>📦 أصول ومعدات أخرى</option>
                </select>
            </div>
            <div>
                <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">الكمية *</label>
                <input type="number" step="0.001" min="0.001" class="mt-input pi-qty" value="${qtyVal}" style="width:100%; font-weight:800; font-size:13px;" oninput="App.calcPurchaseTotals()" required />
            </div>
            <div>
                <label style="font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">الوحدة</label>
                <input type="text" class="mt-input pi-unit" value="${this.escape(unitVal)}" style="width:100%; font-size:12px;" placeholder="قطعة" />
            </div>
            <div>
                <label style="font-size:11px; font-weight:700; color:#0284c7; display:block; margin-bottom:3px;">سعر الوحدة *</label>
                <input type="number" step="0.01" min="0" class="mt-input pi-price" placeholder="0.00" value="${priceVal}" style="width:100%; font-weight:800; font-size:14px; color:#0284c7; padding:6px 8px;" oninput="App.calcPurchaseTotals()" required />
            </div>
            <div style="text-align:center; padding-bottom:3px;">
                <button type="button" class="mt-btn mt-btn-danger" style="padding:6px 8px; font-size:12px; border-radius:6px;" onclick="this.closest('.pi-row').remove(); App.calcPurchaseTotals()" title="حذف البند">✕</button>
            </div>
        `;

        list.appendChild(row);
        this.calcPurchaseTotals();
    };

    App.onPurchaseItemNameChange = function(input) {
        const val = input.value.trim();
        if (!val) return;
        const catalog = this._purchaseItemsCatalog || [];
        const match = catalog.find(x => x.item_name && x.item_name.trim().toLowerCase() === val.toLowerCase());
        if (match) {
            const row = input.closest('.pi-row');
            if (row) {
                const catSelect = row.querySelector('.pi-cat');
                const unitInput = row.querySelector('.pi-unit');
                const priceInput = row.querySelector('.pi-price');

                if (catSelect && match.category) {
                    const c = match.category;
                    const catMap = {
                        'antennas_dishes': 'antennas',
                        'cables_fiber': 'cables',
                        'solar_batteries': 'power_supplies',
                        'other': 'other_assets'
                    };
                    catSelect.value = catMap[c] || c;
                }
                if (unitInput && match.unit_type) unitInput.value = match.unit_type;
                if (priceInput && (priceInput.value === '' || priceInput.value === '0') && match.unit_price > 0) {
                    priceInput.value = match.unit_price;
                }
                this.calcPurchaseTotals();
            }
        }
    };

    App.showPurchaseCatalogPicker = function() {
        const catalog = this._purchaseItemsCatalog || [];
        if (catalog.length === 0) return this.toast('لا توجد أصناف سابقة مسجلة', 'info');

        const pickerHtml = `
            <div class="mt-modal-header" style="background:#0284c7; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:14.5px;">📚 قائمة الأصناف والمعدات السابقة للاختيار السريع</span>
                <span style="cursor:pointer; font-size:18px;" onclick="document.getElementById('pi-catalog-picker-modal')?.remove()">✕</span>
            </div>
            <div style="padding:14px; max-height:60vh; overflow-y:auto;">
                <input type="text" id="pi-picker-search" class="mt-input" placeholder="🔍 بحث سريع في اسم الصنف، الموديل، الفئة..." style="width:100%; margin-bottom:10px; font-size:13px; font-weight:600;" oninput="App.filterPurchaseCatalogPicker(this.value)" />
                <div id="pi-picker-list" style="display:flex; flex-direction:column; gap:6px;">
                    ${catalog.map((it, idx) => `
                        <div class="pi-picker-item" data-search="${this.escape(((it.item_name || '') + ' ' + (it.model || '') + ' ' + (it.category || '')).toLowerCase())}" style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:9px 14px; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.background='#f0f9ff'; this.style.borderColor='#0284c7';" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0';" onclick="App.pickPurchaseCatalogItem(${idx})">
                            <div>
                                <b style="color:#0f172a; font-size:13.5px;">${this.escape(it.item_name)}</b>
                                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                                    ${it.model ? `موديل: <b>${this.escape(it.model)}</b> | ` : ''}فئة: <span style="background:#f1f5f9; padding:1px 5px; border-radius:3px;">${this.escape(it.category || 'عام')}</span> | وحدة: <span>${this.escape(it.unit_type || 'قطعة')}</span>
                                </div>
                            </div>
                            <div style="text-align:left;">
                                <b style="color:#059669; font-size:14px;">${App.formatMoney(it.unit_price || 0)}</b>
                                <div style="font-size:10.5px; color:#0284c7; font-weight:800; margin-top:2px;">➕ إدراج للفاتورة</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div style="background:#f8fafc; padding:10px 14px; border-top:1px solid #e2e8f0; text-align:left;">
                <button type="button" class="mt-btn" onclick="document.getElementById('pi-catalog-picker-modal')?.remove()">إغلاق النافذة</button>
            </div>
        `;

        let modalEl = document.getElementById('pi-catalog-picker-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'pi-catalog-picker-modal';
            modalEl.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:90%; max-width:650px; background:#fff; z-index:99999; border-radius:8px; box-shadow:0 15px 35px rgba(0,0,0,0.3); overflow:hidden; border:2px solid #0284c7;';
            document.body.appendChild(modalEl);
        }
        modalEl.innerHTML = pickerHtml;
    };

    App.filterPurchaseCatalogPicker = function(q) {
        const query = (q || '').trim().toLowerCase();
        document.querySelectorAll('#pi-picker-list .pi-picker-item').forEach(el => {
            const str = el.dataset.search || '';
            el.style.display = str.includes(query) ? 'flex' : 'none';
        });
    };

    App.pickPurchaseCatalogItem = function(index) {
        const catalog = this._purchaseItemsCatalog || [];
        const item = catalog[index];
        if (item) {
            const rows = document.querySelectorAll('.pi-row');
            let filled = false;
            if (rows.length === 1) {
                const firstRow = rows[0];
                const nameInp = firstRow.querySelector('.pi-name');
                if (nameInp && !nameInp.value) {
                    nameInp.value = item.item_name || '';
                    const mInp = firstRow.querySelector('.pi-model');
                    const cInp = firstRow.querySelector('.pi-cat');
                    const uInp = firstRow.querySelector('.pi-unit');
                    const pInp = firstRow.querySelector('.pi-price');
                    if (mInp) mInp.value = item.model || '';
                    if (cInp) cInp.value = item.category || 'routers';
                    if (uInp) uInp.value = item.unit_type || 'قطعة';
                    if (pInp) pInp.value = item.unit_price || 0;
                    this.calcPurchaseTotals();
                    filled = true;
                }
            }
            if (!filled) {
                this.addPurchaseRow({
                    item_name: item.item_name,
                    model: item.model,
                    category: item.category,
                    quantity: 1,
                    unit_type: item.unit_type,
                    unit_price: item.unit_price
                });
            }
            this.toast(`تم إدراج الصنف: ${item.item_name}`, 'success');
            document.getElementById('pi-catalog-picker-modal')?.remove();
        }
    };

    App.onPurchaseCurrencyChange = function(code) {
        this._selectedPurchaseCurrency = code;
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(code) : 1.0;
        const sym = (typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(code) : 'ر.ي';
        const baseSym = (typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(baseCode) : 'ر.ي';

        const rateNoteEl = document.getElementById('pi-currency-rate-note');
        if (rateNoteEl) {
            if (code !== baseCode && rate > 0) {
                rateNoteEl.innerHTML = `💱 سعر الصرف المعتمد: <b>1 ${sym} = ${rate} ${baseSym}</b>`;
                rateNoteEl.style.display = 'block';
            } else {
                rateNoteEl.style.display = 'none';
            }
        }

        this.calcPurchaseTotals();
    };

    App.calcPurchaseTotals = function() {
        let total = 0;
        document.querySelectorAll('.pi-row').forEach(r => {
            const qty = parseFloat(r.querySelector('.pi-qty')?.value || 0);
            const price = parseFloat(r.querySelector('.pi-price')?.value || 0);
            total += (qty * price);
        });

        this._purchaseTotal = total;

        const currCode = document.getElementById('pi-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;
        const isForeign = (currCode !== baseCode && rate > 0);

        const payType = document.getElementById('pi-pay-type')?.value;
        const paidInput = document.getElementById('pi-paid-amount');

        if (payType === 'cash') {
            if (paidInput) paidInput.value = total.toFixed(2);
        } else if (payType === 'credit') {
            if (paidInput) paidInput.value = '0';
        }

        const paid = parseFloat(paidInput?.value || 0);
        const rem = Math.max(0, total - paid);

        const sumTotal = document.getElementById('pi-sum-total');
        const sumPaid = document.getElementById('pi-sum-paid');
        const sumRem = document.getElementById('pi-sum-rem');
        const tafqeetDiv = document.getElementById('pi-tafqeet-note');

        if (sumTotal) {
            sumTotal.innerHTML = `${this.formatMoney(total, true, currCode)}${isForeign ? ` <small style="font-size:11px; color:#93c5fd; display:block; font-weight:normal;">(≈ ${this.formatMoney(total * rate, true, baseCode)})</small>` : ''}`;
        }
        if (sumPaid) {
            sumPaid.innerHTML = `${this.formatMoney(paid, true, currCode)}${isForeign && paid > 0 ? ` <small style="font-size:11px; color:#86efac; display:block; font-weight:normal;">(≈ ${this.formatMoney(paid * rate, true, baseCode)})</small>` : ''}`;
        }
        if (sumRem) {
            sumRem.innerHTML = `${this.formatMoney(rem, true, currCode)}${isForeign && rem > 0 ? ` <small style="font-size:11px; color:#fca5a5; display:block; font-weight:normal;">(≈ ${this.formatMoney(rem * rate, true, baseCode)})</small>` : ''}`;
        }

        if (tafqeetDiv) {
            if (total > 0 && typeof App.tafqeet === 'function') {
                tafqeetDiv.innerHTML = `📝 إجمالي الفاتورة كتابةً: <b>فقط ${App.tafqeet(total, currCode)} لا غير</b>`;
                tafqeetDiv.style.display = 'block';
            } else {
                tafqeetDiv.style.display = 'none';
            }
        }
    };

    App.onPurchasePaymentTypeChange = function(type) {
        const tWrap = document.getElementById('pi-treasury-wrap');
        const pWrap = document.getElementById('pi-paid-wrap');
        const paidInput = document.getElementById('pi-paid-amount');

        if (type === 'cash') {
            if (tWrap) tWrap.style.display = 'block';
            if (pWrap) pWrap.style.display = 'block';
            if (paidInput) {
                paidInput.readOnly = true;
                paidInput.value = (this._purchaseTotal || 0).toFixed(2);
            }
        } else if (type === 'credit') {
            if (tWrap) tWrap.style.display = 'none';
            if (pWrap) pWrap.style.display = 'none';
            if (paidInput) {
                paidInput.readOnly = true;
                paidInput.value = '0';
            }
        } else if (type === 'partial') {
            if (tWrap) tWrap.style.display = 'block';
            if (pWrap) pWrap.style.display = 'block';
            if (paidInput) {
                paidInput.readOnly = false;
            }
        }

        this.calcPurchaseTotals();
    };

        App.submitPurchaseInvoice = async function(e) {
        e.preventDefault();

        const items = [];
        document.querySelectorAll('.pi-row').forEach(r => {
            const name = r.querySelector('.pi-name')?.value?.trim();
            if (name) {
                items.push({
                    item_name: name,
                    model: '', // Model removed per user instruction
                    category: r.querySelector('.pi-cat')?.value || 'routers',
                    quantity: parseFloat(r.querySelector('.pi-qty')?.value || 1),
                    unit_type: r.querySelector('.pi-unit')?.value?.trim() || 'قطعة',
                    unit_price: parseFloat(r.querySelector('.pi-price')?.value || 0)
                });
            }
        });

        if (items.length === 0) {
            this.toast('أضف بنداً واحداً على الأقل', 'warning');
            return;
        }

        const supSelect = document.getElementById('pi-supplier');
        const supName = supSelect?.selectedOptions[0]?.text || 'مورد عام';
        const totalInvoice = items.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
        const paidAmount = parseFloat(document.getElementById('pi-paid-amount')?.value || 0);
        const payType = document.getElementById('pi-pay-type')?.value;
        const payTypeName = payType === 'cash' ? '💵 نقداً (سداد فوري من الصندوق)' : (payType === 'credit' ? '⏳ آجل (قيد كامل على حساب المورد)' : '⚖️ دفعة جزئية (مقدم + آجل)');

        const currCode = document.getElementById('pi-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const sym = (typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(currCode) : 'ر.ي';
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;

        const ok = await App.showExactConfirmModal({
            headerTitle: '🛒 تأكيد بيانات وترحيل فاتورة مشتريات وأصول',
            headline: `تأكيد ترحيل فاتورة مشتريات بمبلغ ${this.formatMoney(totalInvoice, true, currCode)}`,
            subheadline: 'سيتم قيد الفاتورة في حساب المورد وتوليد القيود المحاسبية وتحديث مخزون الأصول',
            rows: [
                { label: 'المورد:', html: `<b>${this.escape(supName)}</b>` },
                { label: 'عملة الفاتورة:', html: `<b>${(typeof this.getCurrencyName === 'function' ? this.getCurrencyName(currCode) : currCode)} (${sym})</b>` },
                { label: 'عدد الأصناف والبنود:', html: `• <b>${items.length} أصناف ومعدات</b> (${items.map(it => this.escape(it.item_name)).slice(0, 3).join('، ')}${items.length > 3 ? '...' : ''})` },
                { label: 'طريقة السداد والتمويل:', html: `<b>${payTypeName}</b>` },
                { label: '💰 إجمالي قيمة الفاتورة:', bg: '#f0fdf4', color: '#15803d', html: `<b style="color:#15803d; font-size:14px;">${this.formatMoney(totalInvoice, true, currCode)}</b>` },
                { label: '💵 المبلغ المسدد والمتبقي:', bg: '#eff6ff', color: '#1e40af', html: `المسدد: <b style="color:#15803d;">${this.formatMoney(paidAmount, true, currCode)}</b> | المتبقي الآجل: <b style="color:${(totalInvoice - paidAmount) > 0 ? '#dc2626' : '#64748b'};">${this.formatMoney(Math.max(0, totalInvoice - paidAmount), true, currCode)}</b>` }
            ],
            confirmBtnText: 'تأكيد ترحيل الفاتورة وتوليد القيد',
            confirmBtnClass: 'mt-btn-success',
            backBtnText: 'back'
        });
        if (!ok) return;

        const payload = {
            supplier_id: document.getElementById('pi-supplier')?.value,
            invoice_date: document.getElementById('pi-date')?.value,
            supplier_invoice_no: document.getElementById('pi-supno')?.value,
            payment_type: payType,
            payment_account_id: document.getElementById('pi-pay-account')?.value,
            paid_amount: paidAmount,
            received_by_admin_id: document.getElementById('pi-receiver')?.value,
            currency_code: currCode,
            exchange_rate: rate,
            currency_amount: totalInvoice,
            items: items
        };

        const res = await this.api('post_purchase_invoice', {}, 'POST', payload);
        if (res && res.success) {
            this.closeModal();
            this.renderPurchases('invoices');

            this.showStandardSuccessModal({
                title: 'تم ترحيل فاتورة المشتريات والأصول بنجاح',
                subtitle: `تم إصدار الفاتورة رقم <b>${res.invoice_no || ''}</b> وتوليد القيود المحاسبية وتحديث المخزون`,
                icon: '🛒',
                headerColor: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                tableRows: [
                    { label: 'رقم الفاتورة:', value: `<code style="font-weight:bold; color:#059669;">${res.invoice_no || '-'}</code>` },
                    { label: 'المورد:', value: `<b>${this.escape(supName)}</b>` },
                    { label: 'العملة:', value: `<b>${(typeof this.getCurrencyName === 'function' ? this.getCurrencyName(currCode) : currCode)} (${sym})</b>` },
                    { label: 'إجمالي الفاتورة:', value: `<b style="color:#059669; font-size:14px;">${this.formatMoney(totalInvoice, true, currCode)}</b>` },
                    { label: 'المسدد نقداً:', value: `<b style="color:#15803d;">${this.formatMoney(paidAmount, true, currCode)}</b>` },
                    { label: 'المتبقي الآجل:', value: `<b style="color:${(totalInvoice - paidAmount) > 0 ? '#dc2626' : '#64748b'};">${this.formatMoney(Math.max(0, totalInvoice - paidAmount), true, currCode)}</b>` }
                ],
                printFn: `App.viewPurchaseDetails(${res.invoice_id || res.id || 0})`,
                printBtnText: '🧾 عرض تفاصيل وسند الفاتورة'
            });
        } else {
            this.toast(res?.error || 'فشل ترحيل الفاتورة', 'danger');
        }
    };

// ─── 4. View Purchase Invoice Details ────────────────────────────────────
    App.viewPurchaseDetails = async function(invoiceId) {
        const res = await this.api('get_purchase_details', { id: invoiceId });
        if (!res?.success || !res.data) {
            this.toast('تعذر جلب تفاصيل الفاتورة', 'danger');
            return;
        }

        const inv = res.data;
        const items = inv.items || [];
        const je = inv.journal_entry;
        const cur = inv.currency_code || this._baseCurrency || 'YER_SANAA';
        const rate = parseFloat(inv.exchange_rate || 1.0);
        const curTot = (inv.currency_total_amount !== undefined && inv.currency_total_amount !== null && cur !== this._baseCurrency) ? parseFloat(inv.currency_total_amount) : parseFloat(inv.total_amount);
        const curPaid = (inv.currency_paid_amount !== undefined && inv.currency_paid_amount !== null && cur !== this._baseCurrency) ? parseFloat(inv.currency_paid_amount) : parseFloat(inv.paid_amount);
        const curRem = (inv.currency_remaining_amount !== undefined && inv.currency_remaining_amount !== null && cur !== this._baseCurrency) ? parseFloat(inv.currency_remaining_amount) : Math.max(0, curTot - curPaid);
        const isForeign = (cur !== this._baseCurrency && rate > 0);
        const sym = (typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(cur) : 'ر.ي';

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">🧾 تفاصيل فاتورة مشتريات: ${this.escape(inv.invoice_no)}</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <div style="padding:18px; max-height:80vh; overflow-y:auto;">
                <!-- Header Info -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px; font-size:13px;">
                    <div><b>المورد:</b> ${this.escape(inv.supplier_name)} (${inv.supplier_code})</div>
                    <div><b>التاريخ:</b> ${this.escape(inv.invoice_date)}</div>
                    <div><b>عملة الفاتورة:</b> <b style="color:#0284c7;">${this.getCurrencyName(cur)} (${sym})</b> ${isForeign ? `<small style="color:#64748b;">(سعر الصرف: ${rate})</small>` : ''}</div>
                    <div><b>طريقة السداد:</b> ${inv.payment_type === 'cash' ? 'نقدي' : (inv.payment_type === 'credit' ? 'آجل' : 'جزئي')}</div>
                    <div><b>الشبكة:</b> ${this.escape(inv.network_name || 'عام')}</div>
                    <div><b>الإجمالي:</b> <b style="color:#0f172a;">${this.formatMoney(curTot, true, cur)}</b> ${isForeign ? `<small style="color:#64748b; display:block;">(≈ ${this.formatMoney(inv.total_amount, true, this._baseCurrency)})</small>` : ''}</div>
                    <div><b>المسدد:</b> <b style="color:#15803d;">${this.formatMoney(curPaid, true, cur)}</b> ${isForeign && curPaid > 0 ? `<small style="color:#64748b; display:block;">(≈ ${this.formatMoney(inv.paid_amount, true, this._baseCurrency)})</small>` : ''}</div>
                    <div><b>المتبقي:</b> <b style="color:#dc2626;">${this.formatMoney(curRem, true, cur)}</b> ${isForeign && curRem > 0 ? `<small style="color:#64748b; display:block;">(≈ ${this.formatMoney(inv.remaining_amount, true, this._baseCurrency)})</small>` : ''}</div>
                    <div><b>سجل بواسطة:</b> ${this.escape(inv.created_by_name || 'النظام')}</div>
                </div>

                <!-- Items Table -->
                <h4 style="margin:0 0 8px 0; font-size:14px;">📦 الأصناف والأجهزة المشتراة</h4>
                <div class="mt-table-container" style="border:1px solid #e2e8f0; border-radius:6px; margin-bottom:14px;">
                    <table class="mt-table" style="width:100%;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th>الصنف</th>
                                <th>الموديل</th>
                                <th>الفئة</th>
                                <th>الكمية</th>
                                <th>السعر</th>
                                <th>الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(it => {
                                const price = parseFloat(it.unit_price || 0);
                                const itemTotal = parseFloat(it.line_total || it.total_price || (it.quantity * price) || 0);
                                return `
                                <tr>
                                    <td><b>${this.escape(it.item_name)}</b></td>
                                    <td>${this.escape(it.model || '—')}</td>
                                    <td><span style="font-size:11px; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${this.escape(it.category)}</span></td>
                                    <td>${it.quantity} ${this.escape(it.unit_type)}</td>
                                    <td>${this.formatMoney(price, true, cur)}</td>
                                    <td style="font-weight:700; color:#0f172a;">${this.formatMoney(itemTotal, true, cur)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Accounting Journal Entry -->
                ${je ? `
                    <h4 style="margin:0 0 8px 0; font-size:14px; color:#0284c7;">⚖️ القيد المحاسبي المولد: JV#${je.id} (${this.escape(je.entry_no)})</h4>
                    <div class="mt-table-container" style="border:1px solid #e2e8f0; border-radius:6px;">
                        <table class="mt-table" style="width:100%;">
                            <thead>
                                <tr style="background:#f1f5f9;">
                                    <th>الحساب</th>
                                    <th>البيان</th>
                                    <th>مدين (Debit)</th>
                                    <th>دائن (Credit)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(je.lines || []).map(l => `
                                    <tr>
                                        <td><code>${l.account_code || ''}</code> ${this.escape(l.account_name || '')}</td>
                                        <td>${this.escape(l.line_description || l.description || '')}</td>
                                        <td style="font-weight:700; color:#15803d;">${parseFloat(l.debit) > 0 ? this.formatMoney(l.debit, true, this._baseCurrency) : '—'}</td>
                                        <td style="font-weight:700; color:#0f172a;">${parseFloat(l.credit) > 0 ? this.formatMoney(l.credit, true, this._baseCurrency) : '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; margin-top:16px;">
                    <button type="button" class="mt-btn mt-btn-success" onclick="App.printPurchaseInvoiceDoc(${res.id || 0})">🖨️ طباعة الفاتورة الرسمية</button>
                    <button type="button" class="mt-btn mt-btn-primary" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        `;

        this.openModal(modalHtml, '780px');
    };

    // ─── 5. Supplier Modal (Add / Edit) ──────────────────────────────────────
    App.openSupplierModal = function(supplier = null) {
        const isEdit = !!(supplier && supplier.id);

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">${isEdit ? '✏️ تعديل بيانات مورد' : '➕ إضافة مورد جديد'}</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitSupplierForm(event, ${isEdit ? supplier.id : 0})" style="padding:16px;">
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">اسم المورد / الشركة *</label>
                    <input type="text" id="sup-name" class="mt-input" style="width:100%; font-weight:700;" value="${this.escape(supplier?.name || '')}" placeholder="مثال: شركة التقنية الحديثة للتجهيزات" required />
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم الهاتف</label>
                        <input type="text" id="sup-phone" class="mt-input" style="width:100%;" value="${this.escape(supplier?.phone || '')}" placeholder="77XXXXXXX" />
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم الواتساب</label>
                        <input type="text" id="sup-wa" class="mt-input" style="width:100%;" value="${this.escape(supplier?.whatsapp || '')}" placeholder="96777XXXXXXX" />
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">العنوان / الموقع</label>
                        <input type="text" id="sup-addr" class="mt-input" style="width:100%;" value="${this.escape(supplier?.address || '')}" placeholder="المدينة، الشارع" />
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">الرقم الضريبي / السجل</label>
                        <input type="text" id="sup-tax" class="mt-input" style="width:100%;" value="${this.escape(supplier?.tax_no || '')}" placeholder="الرقم الضريبي أو السجل التجاري" />
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:14px;">
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات إضافية</label>
                    <input type="text" id="sup-notes" class="mt-input" style="width:100%;" value="${this.escape(supplier?.notes || '')}" placeholder="طبيعة التوريدات أو شروط التعامل..." />
                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:800; padding:8px 24px;">💾 حفظ بيانات المورد</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '560px');
    };

    App.submitSupplierForm = async function(e, id) {
        e.preventDefault();
        const payload = {
            id: id || null,
            name: document.getElementById('sup-name')?.value?.trim(),
            phone: document.getElementById('sup-phone')?.value?.trim(),
            whatsapp: document.getElementById('sup-wa')?.value?.trim(),
            address: document.getElementById('sup-addr')?.value?.trim(),
            tax_no: document.getElementById('sup-tax')?.value?.trim(),
            notes: document.getElementById('sup-notes')?.value?.trim()
        };

        const res = await this.api('post_supplier', payload);
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ المورد بنجاح', 'success');
            this.closeModal();
            this.loadSuppliersList();
        } else {
            this.toast(res?.error || 'فشل حفظ المورد', 'danger');
        }
    };

    App.deleteSupplier = async function(supplierId) {
        if (!confirm('هل أنت متأكد من حذف هذا المورد؟ لا يمكن حذف مورد لديه فواتير أو حركات مالية.')) return;

        const res = await this.api('delete_supplier', { id: supplierId });
        if (res && res.success) {
            this.toast(res.message || 'تم حذف المورد', 'success');
            this.loadSuppliersList();
        } else {
            this.toast(res?.error || 'تعذر حذف المورد', 'danger');
        }
    };

    // ─── 6. Supplier Debt Payment Modal (سداد دفعة لمورد) ───────────────────
    
    App.onSupplierPayCurrencyChange = function(code) {
        const sym = this.getCurrencySymbol(code);
        const lbl = document.getElementById('lbl-spay-amount');
        if (lbl) lbl.textContent = `المبلغ المسدد (${sym}) *`;
        this.onSupplierPayAmountInput(document.getElementById('spay-amount')?.value || 0);
    };

    App.onSupplierPayAmountInput = function(val) {
        const amount = parseFloat(val) || 0;
        const code = document.getElementById('spay-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(code) : 1.0;
        const baseCode = this._baseCurrency || 'YER_SANAA';
        const isBase = (!code || code === baseCode || code === 'YER' || (code === 'YER_SANAA' && baseCode === 'YER_SANAA'));
        const tf = document.getElementById('spay-tafqeet');
        const hint = document.getElementById('spay-currency-conv-hint');
        if (tf) {
            tf.innerHTML = amount > 0 ? ('📝 فقط <b>' + (typeof this.tafqeet === 'function' ? this.tafqeet(amount, code) : amount) + '</b> لا غير') : '';
        }
        if (hint) {
            if (!isBase && amount > 0 && rate > 0) {
                const baseAmount = amount * rate;
                hint.innerHTML = `💱 الخصم من كشف الحساب بالأساس: <b>${this.formatMoney(baseAmount, true, baseCode)}</b> (سعر الصرف بتاريخه: ${rate})`;
            } else {
                hint.innerHTML = '';
            }
        }
    };

    App.openSupplierPaymentModal = async function(supplierId) {
        const res = await this.api('get_supplier_statement', { id: supplierId });
        if (!res?.success || !res.supplier) {
            this.toast('تعذر جلب بيانات المورد', 'danger');
            return;
        }

        const supplier = res.supplier;
        const lookRes = await this.api('get_purchase_lookups');
        const treasuries = lookRes?.data?.treasuries || [];

        const modalHtml = `
            <div class="mt-modal-header" style="background:#15803d; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">💵 سند صرف وسداد دفعة لمورد: ${this.escape(supplier.name)}</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.submitSupplierPayment(event, ${supplierId})" style="padding:16px;">
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:12px; color:#166534; font-weight:700;">الرصيد المستحق للمورد حالياً:</div>
                        <div style="font-size:18px; font-weight:800; color:#dc2626;">${M(supplier.current_balance)}</div>
                    </div>
                    <div style="font-size:12px; color:#475569;">
                        كود الحساب: <b>[${supplier.account_code || '2101'}]</b>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:140px 1fr; gap:10px; margin-bottom:12px;">
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">عملة السداد *</label>
                        <select id="spay-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onSupplierPayCurrencyChange(this.value)">
                            ${this.renderCurrencyOptions(this._baseCurrency)}
                        </select>
                    </div>
                    <div>
                        <label id="lbl-spay-amount" style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">المبلغ المسدد (${this.getCurrencySymbol()}) *</label>
                        <input type="number" step="0.01" min="0.01" id="spay-amount" class="mt-input" style="width:100%; font-size:16px; font-weight:800; color:#15803d;" value="${parseFloat(supplier.current_balance || 0) > 0 ? parseFloat(supplier.current_balance).toFixed(2) : ''}" required oninput="App.onSupplierPayAmountInput(this.value)" />
                        <div id="spay-tafqeet" style="font-size:11.5px; color:#0284c7; font-weight:bold; margin-top:4px;"></div>
                        <div id="spay-currency-conv-hint" style="font-size:11px; color:#059669; font-weight:700; margin-top:2px;"></div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">حساب الصرف (الخزينة / الصندوق) *</label>
                        <select id="spay-account" class="mt-select" style="width:100%; font-weight:700;" required>
                            ${treasuries.map(t => `<option value="${t.id}">${this.escape(t.name_ar)} (${t.account_code})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">تاريخ السند *</label>
                        <input type="date" id="spay-date" class="mt-input" style="width:100%; font-weight:700;" value="${new Date().toISOString().split('T')[0]}" required />
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">البيان والملاحظات</label>
                    <input type="text" id="spay-notes" class="mt-input" style="width:100%;" placeholder="سداد دفعة من رصيد المشتريات..." />
                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; padding:8px 24px;">⚖️ تأكيد السداد وترحيل القيد</button>
                </div>
            </form>
        `;

        this.openModal(modalHtml, '560px');
        this.onSupplierPayAmountInput(document.getElementById('spay-amount')?.value || 0);
    };

    App.submitSupplierPayment = async function(e, supplierId) {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('spay-amount')?.value || 0);
        if (amt <= 0) return this.toast('أدخل مبلغ سداد صحيح', 'warning');
        const currCode = document.getElementById('spay-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const sym = this.getCurrencySymbol(currCode);
        const rate = (typeof this.getCurrencyRate === 'function') ? this.getCurrencyRate(currCode) : 1.0;

        const confirmMsg = `تأكيد سند صرف / سداد دفعة للمورد:

` +
            `💰 المبلغ المسدد: ${App.formatMoney(amt, true, currCode)}

` +
            `سيتم خصم المبلغ من الصندوق وترحيل قيد السداد وتخفيض مديونية المورد. هل تريد المتابعة؟`;
        if (!confirm(confirmMsg)) return;

        const payload = {
            supplier_id: supplierId,
            payment_date: document.getElementById('spay-date')?.value,
            amount: amt,
            currency_code: currCode,
            exchange_rate: rate,
            currency_amount: amt,
            payment_account_id: document.getElementById('spay-account')?.value,
            notes: document.getElementById('spay-notes')?.value
        };

        const res = await this.api('post_supplier_payment', payload);
        if (res && res.success) {
            this.toast(res.message || 'تم تسجيل السداد بنجاح', 'success');
            this.closeModal();
            this.renderPurchases('suppliers');
        } else {
            this.toast(res?.error || 'فشل تسجيل السداد', 'danger');
        }
    };

    // ─── 7. Supplier Account Statement Modal (كشف حساب مورد) ─────────────────
    App.openSupplierStatementModal = async function(supplierId) {
        const res = await this.api('get_supplier_statement', { id: supplierId });
        if (!res?.success || !res.supplier) {
            this.toast('تعذر جلب كشف الحساب', 'danger');
            return;
        }

        const sup = res.supplier;
        const txs = res.transactions || [];

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px;">📋 كشف حساب مورد: ${this.escape(sup.name)} (${sup.supplier_code})</span>
                <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
            </div>
            <div style="padding:16px; max-height:80vh; overflow-y:auto;">
                <!-- Summary Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">${this.escape(sup.name)}</div>
                        <div style="font-size:12px; color:#64748b;">هاتف: ${this.escape(sup.phone || '—')} | ضريبي: ${this.escape(sup.tax_no || '—')}</div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-size:12px; color:#64748b;">الرصيد الختامي المستحق:</div>
                        <div style="font-size:18px; font-weight:800; color:${res.current_balance > 0 ? '#dc2626' : '#15803d'};">${M(res.current_balance)}</div>
                    </div>
                </div>

                <!-- Transactions Table -->
                <div class="mt-table-container" style="border:1px solid #e2e8f0; border-radius:6px;">
                    <table class="mt-table" style="width:100%;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th>التاريخ</th>
                                <th>المرجع / الرقم</th>
                                <th>نوع الحركة</th>
                                <th>البيان</th>
                                <th>مشتريات (دائن)</th>
                                <th>مسدد (مدين)</th>
                                <th>الرصيد التراكمي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.length === 0 ? `
                                <tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد حركات مسجلة لهذا المورد</td></tr>
                            ` : txs.map(t => `
                                <tr>
                                    <td style="white-space:nowrap;">${this.escape(t.tx_date)}</td>
                                    <td style="white-space:nowrap;"><code>${this.escape(t.invoice_no)}</code></td>
                                    <td style="white-space:nowrap;">
                                        <span class="status-pill ${t.tx_type === 'purchase_invoice' ? 'status-pending' : 'status-online'}" style="font-size:10.5px;">
                                            ${t.tx_type === 'purchase_invoice' ? 'فاتورة مشتريات' : 'سند صرف'}
                                        </span>
                                    </td>
                                    <td>${this.escape(t.notes || '—')}</td>
                                    <td style="color:#0f172a; font-weight:700; white-space:nowrap;">${parseFloat(t.credit) > 0 ? M(t.credit) : '—'}</td>
                                    <td style="color:#15803d; font-weight:700; white-space:nowrap;">${parseFloat(t.debit) > 0 ? M(t.debit) : '—'}</td>
                                    <td style="font-weight:800; color:${parseFloat(t.running_balance) > 0 ? '#dc2626' : '#15803d'}; white-space:nowrap;">${M(t.running_balance)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; margin-top:16px;">
                    <button type="button" class="mt-btn mt-btn-success" onclick="App.printAccountStatement(${supplierId})">🖨️ طباعة كشف الحساب الرسمي</button>
                    <button type="button" class="mt-btn mt-btn-primary" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        `;

        this.openModal(modalHtml, '800px');
    };

})();
