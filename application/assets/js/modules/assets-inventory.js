/**

 * SAM User Manager — Assets Management & Hardware Inventory

 */

'use strict';



Object.assign(window.App, {

    assetsCategoryFilter: '',
    assetsNetworkFilter: '',

    assetsStatusFilter: '',

    assetsNodeFilter: '',

    assetsRouterFilter: '',

    assetsUserFilter: '',

    assetsSearch: '',

    assetsViewMode: 'list',



    async renderAssets() {

        const params = {

            category: this.assetsCategoryFilter,

            status: this.assetsStatusFilter,

            node_id: this.assetsNodeFilter,

            nas_ip: this.assetsRouterFilter,

            user_id: this.assetsUserFilter,

            network_id: this.assetsNetworkFilter ? Number(this.assetsNetworkFilter) : Number(this.activeNetworkId || 0),

            search: this.assetsSearch

        };



        const [res, routersRes, nodesRes, adminsRes] = await Promise.all([

            this.api('get_assets', params),

            this.api('get_routers'),

            this.api('get_network_nodes'),

            this.api('get_admins')

        ]);



        const assetsRes = res || { data: [], summary: {}, grouped_by_category: [], grouped_by_status: [], grouped_by_node: [], grouped_by_custodian: [] };

        const assets = assetsRes.data || [];

        const summary = assetsRes.summary || {

            total_count: assets.length,

            total_cost: assetsRes.total_assets_cost || 0,

            total_valuation: assetsRes.total_current_valuation || 0,

            in_service_count: assets.filter(a => a.status === 'in_service').length,

            maintenance_count: assets.filter(a => a.status === 'maintenance').length,

            in_stock_count: assets.filter(a => a.status === 'in_stock').length,

            damaged_count: assets.filter(a => a.status === 'damaged').length,

            retired_count: assets.filter(a => a.status === 'retired').length

        };



        const groupedByCategory = assetsRes.grouped_by_category || [];

        const groupedByStatus = assetsRes.grouped_by_status || [];

        const groupedByNode = assetsRes.grouped_by_node || [];

        const groupedByCustodian = assetsRes.grouped_by_custodian || [];



        const routersList = Array.isArray(routersRes) ? routersRes : (routersRes?.data || routersRes?.routers || []);

        const nodesList = nodesRes?.nodes || (Array.isArray(nodesRes) ? nodesRes : []);

        const adminsList = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);
        const networksList = networksRes?.networks || [];



        const catLabels = {

            routers: '📡 راوترات وسيرفرات ميكروتك',

            servers: '💻 سيرفرات حاسوبية',

            antennas_dishes: '📶 هوائيات وأطباق بث',

            solar_batteries: '☀️ طاقة شمسية وبطاريات',

            cables_fiber: '🔌 كابلات فايبر وسويتشات',

            towers: '🗼 أبراج وصواري',

            vehicles: '🚗 مركبات وسيارات',

            other: '📦 معدات أخرى'

        };

        const sourceLabels = {
            router_discovery: '📡 مسح الراوتر',
            manual: '✍️ إضافة يدوية',
            purchase_invoice: '🧾 فاتورة شراء',
            file_import: '📥 استيراد ملف'
        };



        const statusLabels = {

            in_service: '🟢 في الخدمة (In Service)',

            maintenance: '🟡 قيد الصيانة (Maintenance)',

            in_stock: '📦 في المخزن (In Stock)',

            damaged: '🔴 تالف وخارج الخدمة (Damaged)',

            retired: '⚪ مسترجع / ملغي (Retired)'

        };



        const statusBadges = {

            in_service: 'status-active',

            maintenance: 'status-disabled',

            in_stock: 'badge-oui-linux',

            damaged: 'status-disabled',

            retired: 'status-disabled'

        };



        const isFiltered = this.assetsCategoryFilter || this.assetsStatusFilter || this.assetsNodeFilter || this.assetsRouterFilter || this.assetsUserFilter || this.assetsSearch;



        document.getElementById('main-view').innerHTML = `

        <div class="mt-toolbar" style="position:sticky; top:0; z-index:20; flex-wrap:wrap; gap:8px;">

            <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">

                ${this.can('assets_add') || (this.can('assets') && (this.userRole === 'system_owner' || this.userRole === 'superadmin')) ? `<button class="mt-btn mt-btn-primary" onclick="App.showAssetModal()">➕ + إضافة جهاز / أصل جديد</button>` : ''}

                ${this.can('assets_edit') || this.userRole === 'system_owner' || this.userRole === 'superadmin' ? `<button class="mt-btn" style="background:#7c3aed; color:#fff; font-weight:700;" onclick="App.showBulkAssetPriceModal()">🏷️ تعديل أسعار الأصناف</button>` : ''}

                ${this.can('assets') || this.can('noc') ? `<button class="mt-btn" style="background:#059669; color:#fff; font-weight:700;" onclick="App.showMikrotikNeighborsModal()">📡 اكتشاف وسحب الجيران</button>` : ''}

                ${this.can('assets') ? `<button class="mt-btn" style="background:#0284c7; color:#fff;" onclick="App.exportAssetsCSV()">📤 تصدير CSV</button>` : ''}

                <button class="mt-btn" onclick="App.renderAssets()">⟳ ${this.t('refresh')}</button>
<button class="mt-btn mt-btn-success" style="padding:4px 10px; font-weight:700; display:inline-flex; align-items:center; gap:5px;" onclick="App.printAssetsInventoryReport()">🖨️ طباعة تقرير الجرد العام</button>

                

                <div style="display:inline-flex; border:1px solid var(--border-color); border-radius:6px; overflow:hidden; margin-right:4px;">

                    <button class="mt-btn ${this.assetsViewMode==='list'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:4px 9px; font-size:11px; font-weight:700;" onclick="App.assetsViewMode='list'; App.renderAssets();">📋 قائمة مسطحة</button>

                    <button class="mt-btn ${this.assetsViewMode==='by_category'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:4px 9px; font-size:11px; font-weight:700;" onclick="App.assetsViewMode='by_category'; App.renderAssets();">📡 تجميع بالتصنيف</button>

                    <button class="mt-btn ${this.assetsViewMode==='by_node'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:4px 9px; font-size:11px; font-weight:700;" onclick="App.assetsViewMode='by_node'; App.renderAssets();">🌳 تجميع بالنقطة</button>

                    <button class="mt-btn ${this.assetsViewMode==='by_status'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:4px 9px; font-size:11px; font-weight:700;" onclick="App.assetsViewMode='by_status'; App.renderAssets();">⚙️ تجميع بالحالة</button>

                    <button class="mt-btn ${this.assetsViewMode==='by_custodian'?'mt-btn-primary':''}" style="border:none; border-radius:0; padding:4px 9px; font-size:11px; font-weight:700;" onclick="App.assetsViewMode='by_custodian'; App.renderAssets();">👤 تجميع بالمسؤول</button>

                </div>

            </div>

            

            <div class="mt-toolbar-right" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">

                ${networksList.length > 1 ? `
                <select class="mt-select" style="font-size:11px; border:1px solid #93c5fd; background:#eff6ff;" onchange="App.assetsNetworkFilter=this.value; App.renderAssets();">
                    <option value="">🌐 كل الشبكات</option>
                    ${networksList.map(n => `<option value="${n.id}" ${(App.assetsNetworkFilter==n.id || (!App.assetsNetworkFilter && Number(n.id) === Number(App.activeNetworkId))) ? 'selected' : ''}>🌐 ${App.escape(n.name)}</option>`).join('')}
                </select>
                ` : ''}
                <input type="text" class="mt-input" placeholder="🔍 بحث بالاسم، الكود، الماك، السيريال..." value="${this.escape(this.assetsSearch)}" onchange="App.assetsSearch=this.value; App.renderAssets();" onkeyup="if(event.key==='Enter'){ App.assetsSearch=this.value; App.renderAssets(); }" style="min-width:180px; font-size:11px;" />

                

                <select class="mt-select" style="font-size:11px;" onchange="App.assetsCategoryFilter=this.value; App.renderAssets();">

                    <option value="">كل التصنيفات</option>

                    ${Object.entries(catLabels).map(([k, v]) => `<option value="${k}" ${this.assetsCategoryFilter===k?'selected':''}>${v}</option>`).join('')}

                </select>



                <select class="mt-select" style="font-size:11px;" onchange="App.assetsStatusFilter=this.value; App.renderAssets();">

                    <option value="">كل الحالات الفنية</option>

                    ${Object.entries(statusLabels).map(([k, v]) => `<option value="${k}" ${this.assetsStatusFilter===k?'selected':''}>${v}</option>`).join('')}

                </select>



                <select class="mt-select" style="font-size:11px;" onchange="App.assetsNodeFilter=this.value; App.renderAssets();">

                    <option value="">كل النقاط والأبراج</option>

                    ${nodesList.map(n => `<option value="${n.id}" ${this.assetsNodeFilter==n.id?'selected':''}>${this.escape(n.node_name)}</option>`).join('')}

                </select>



                <select class="mt-select" style="font-size:11px;" onchange="App.assetsUserFilter=this.value; App.renderAssets();">

                    <option value="">كل مسؤولي العهد</option>

                    ${adminsList.map(a => `<option value="${a.id}" ${this.assetsUserFilter==a.id?'selected':''}>${this.escape(a.fullname)}</option>`).join('')}

                </select>



                ${isFiltered ? `

                    <button class="mt-btn mt-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="App.assetsCategoryFilter=''; App.assetsStatusFilter=''; App.assetsNodeFilter=''; App.assetsRouterFilter=''; App.assetsUserFilter=''; App.assetsSearch=''; App.renderAssets();" title="إلغاء كل الفلاتر">✕ تفريغ</button>

                ` : ''}

            </div>

        </div>



        <div style="padding:15px; display:flex; flex-direction:column; gap:14px;">

            <!-- KPI Summary Cards -->

            <div class="kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">

                <div class="kpi-card" style="border-right:4px solid #0284c7;">

                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">📦</div>

                    <div>

                        <div class="kpi-val">${summary.total_count || assets.length} <small style="font-size:12px; font-weight:normal;">جهاز</small></div>

                        <div class="kpi-lbl">إجمالي الأجهزة والمعدات</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #10b981;">

                    <div class="kpi-icon" style="background:#dcfce7; color:#10b981;">🟢</div>

                    <div>

                        <div class="kpi-val" style="color:#059669;">${summary.in_service_count || 0}</div>

                        <div class="kpi-lbl">تعمل بالخدمة النشطة</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #f59e0b;">

                    <div class="kpi-icon" style="background:#fef3c7; color:#f59e0b;">🟡</div>

                    <div>

                        <div class="kpi-val" style="color:#d97706;">${summary.maintenance_count || 0}</div>

                        <div class="kpi-lbl">قيد الصيانة والورشة</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #8b5cf6;">

                    <div class="kpi-icon" style="background:#ede9fe; color:#8b5cf6;">📦</div>

                    <div>

                        <div class="kpi-val" style="color:#7c3aed;">${summary.in_stock_count || 0}</div>

                        <div class="kpi-lbl">بالمخزن الاحتياطي</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #0284c7;">

                    <div class="kpi-icon" style="background:#e0f2fe; color:#0284c7;">💰</div>

                    <div>

                        <div class="kpi-val" style="font-size:16px;">${App.formatMoney(summary.total_cost || 0)}</div>

                        <div class="kpi-lbl">إجمالي تكلفة الشراء</div>

                    </div>

                </div>

                <div class="kpi-card" style="border-right:4px solid #10b981;">

                    <div class="kpi-icon" style="background:#dcfce7; color:#10b981;">📈</div>

                    <div>

                        <div class="kpi-val" style="font-size:16px; color:#059669;">${App.formatMoney(summary.total_valuation || 0)}</div>

                        <div class="kpi-lbl">القيمة التقديرية الحالية</div>

                    </div>

                </div>

            </div>



            <!-- View Mode 1: Detailed Flat Table -->

            ${this.assetsViewMode === 'list' ? this.renderAssetsFlatTable(assets, catLabels, statusLabels, sourceLabels) : ''}



            <!-- View Mode 2: Grouped by Category -->

            ${this.assetsViewMode === 'by_category' ? this.renderAssetsGroupedByCategory(groupedByCategory, catLabels, statusLabels) : ''}



            <!-- View Mode 3: Grouped by Node -->

            ${this.assetsViewMode === 'by_node' ? this.renderAssetsGroupedByNode(groupedByNode, statusLabels) : ''}



            <!-- View Mode 4: Grouped by Status -->

            ${this.assetsViewMode === 'by_status' ? this.renderAssetsGroupedByStatus(groupedByStatus, statusLabels) : ''}



            <!-- View Mode 5: Grouped by Custodian -->

            ${this.assetsViewMode === 'by_custodian' ? this.renderAssetsGroupedByCustodian(groupedByCustodian, statusLabels) : ''}



        </div>



        <!-- Floating Multi-Select Action Bar -->

        <div id="assets-floating-bar" style="display:none; position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#0f172a; color:#fff; padding:8px 18px; border-radius:30px; box-shadow:0 10px 25px rgba(0,0,0,0.35); z-index:999; align-items:center; gap:12px;">

            <span style="font-size:13px; font-weight:600;">✓ تم تحديد <b id="assets-selected-count" style="color:#38bdf8;">0</b> صنف</span>

            <button class="mt-btn" style="background:#0284c7; color:#fff; border-radius:20px; padding:4px 14px; font-weight:700; font-size:12px;" onclick="App.printSelectedAssetsBulk()">🖨️ طباعة الأصول المحددة</button>
<button class="mt-btn" style="background:#16a34a; color:#fff; border-radius:20px; padding:4px 14px; font-weight:700; font-size:12px;" onclick="App.printSelectedAssetBarcodes()">🏷️ طباعة ملصقات الباركود</button>
<button class="mt-btn" style="background:#7c3aed; color:#fff; border-radius:20px; padding:4px 14px; font-weight:700; font-size:12px;" onclick="App.showBulkAssetPriceModal()">🏷️ تعديل الأسعار</button>

            <button class="mt-btn mt-btn-danger" style="border-radius:20px; padding:4px 12px; font-size:12px;" onclick="App.deleteSelectedAssets()">🗑️ حذف</button>

            <button class="mt-btn" style="background:#334155; color:#cbd5e1; border-radius:20px; padding:4px 10px; font-size:11px;" onclick="App.clearAssetSelection()">✕ إلغاء</button>

        </div>

        `;

    },



    renderAssetsFlatTable(assets, catLabels = {}, statusLabels = {}, sourceLabels = {}) {

        const sLabels = Object.assign({
            router_discovery: '📡 مسح الراوتر',
            manual: '✍️ إضافة يدوية',
            purchase_invoice: '🧾 فاتورة شراء',
            file_import: '📥 استيراد ملف'
        }, sourceLabels || {});
        const cLabels = catLabels || {};
        const stLabels = statusLabels || {};

        this._lastAssetsList = assets;

        assets = this.genericSort(assets, this.assetsSortCol, this.assetsSortDir);

        const paginated = this.genericPaginate(assets, this.assetsPage, this.assetsLimit);

        const pageData = paginated.data;



        return `

        <div class="mt-table-container">

            <table class="mt-table">

                <thead>

                    <tr>

                        <th style="width:36px; text-align:center;"><input type="checkbox" onchange="App.toggleSelectAllAssets(this)" /></th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('id')"># ${this.getTableSortIcon(this.assetsSortCol, 'id', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('asset_code')">كود الأصل ${this.getTableSortIcon(this.assetsSortCol, 'asset_code', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('name')">اسم الأصل / الجهاز ${this.getTableSortIcon(this.assetsSortCol, 'name', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('category')">التصنيف ${this.getTableSortIcon(this.assetsSortCol, 'category', this.assetsSortDir)}</th>
                        <th>🏢 الشبكة</th>

                        <th>المصدر</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('node_name')">نقطة الشبكة / البرج ${this.getTableSortIcon(this.assetsSortCol, 'node_name', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('status')">الحالة ${this.getTableSortIcon(this.assetsSortCol, 'status', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('purchase_cost')">تكلفة الشراء ${this.getTableSortIcon(this.assetsSortCol, 'purchase_cost', this.assetsSortDir)}</th>

                        <th style="cursor:pointer;" onclick="App.toggleAssetsSort('current_value')">القيمة الحالية ${this.getTableSortIcon(this.assetsSortCol, 'current_value', this.assetsSortDir)}</th>

                        <th>المسؤول / العهدة</th>

                        <th>الماك MAC / السيريال</th>

                        <th>الإجراءات</th>

                    </tr>

                </thead>

                <tbody>

                    ${pageData.map((a, idx) => `

                        <tr>

                            <td style="text-align:center;"><input type="checkbox" class="asset-row-cb" value="${a.id}" ${this.selectedAssets.has(a.id)?'checked':''} onchange="App.toggleSelectAsset(${a.id}, this.checked)" /></td>

                            <td>${paginated.start_index + idx}</td>

                            <td><b style="font-family:monospace; color:#0284c7;">${this.escape(a.asset_code || '-')}</b></td>

                            <td>

                                <b>${this.escape(a.name)}</b>

                                ${a.model ? `<div style="font-size:11px; color:var(--text-muted);">${this.escape(a.model)} ${a.brand ? '('+this.escape(a.brand)+')' : ''}</div>` : ''}

                            </td>

                            <td>

                                <span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">

                                    ${cLabels[a.category] || a.category || '-'}

                                </span>

                            </td>

                            <td>
                                <span class="badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-weight:700;">
                                    🌐 ${this.escape(a.network_name || ('شبكة #' + (a.network_id || 1)))}
                                </span>
                            </td>

                            <td><span class="badge" style="background:#f8fafc; color:#475569; border:1px solid #cbd5e1;">${sLabels[a.source_type] || sLabels[a.source] || sLabels.manual || '✍️ إضافة يدوية'}</span></td>

                            <td>

                                ${a.node_name ? `<b>📍 ${this.escape(a.node_name)}</b>` : '<span style="color:var(--text-muted); font-size:11px;">مستودع / غير مثبت</span>'}

                            </td>

                            <td>

                                <span class="status-pill status-${a.status}">

                                    ${stLabels[a.status] || a.status || '-'}

                                </span>

                            </td>

                            <td><b>${App.formatMoney(a.purchase_cost)}</b></td>

                            <td><b style="color:#16a34a;">${App.formatMoney(a.current_value)}</b></td>

                            <td>

                                ${a.custodian_name ? `👤 ${this.escape(a.custodian_name)}` : '<span style="color:var(--text-muted);">-</span>'}

                            </td>

                            <td style="font-family:monospace; font-size:11px;">

                                ${a.mac_address ? `<div style="direction:ltr;">${this.escape(a.mac_address)}</div>` : ''}

                                ${a.serial_number ? `<div style="color:var(--text-muted); font-size:10px;">SN: ${this.escape(a.serial_number)}</div>` : ''}

                                ${(!a.mac_address && !a.serial_number) ? '-' : ''}

                            </td>

                            <td style="white-space:nowrap;">

                                <button class="mt-btn mt-btn-success" style="padding:3px 7px; font-size:11px;" onclick="App.printAssetCardDoc(${a.id})" title="🖨️ طباعة بطاقة الأصل">🖨️</button>

                                <button class="mt-btn mt-btn-primary" style="padding:3px 7px; font-size:11px;" onclick="App.showEditAssetModal(${a.id})" title="تعديل الأصل">✏️</button>

                                <button class="mt-btn" style="padding:3px 7px; font-size:11px;" onclick="App.showAssetTimelineModal(${a.id})" title="سجل وسيرة الجهاز">📜</button>

                                <button class="mt-btn mt-btn-danger" style="padding:3px 7px; font-size:11px;" onclick="App.deleteAsset(${a.id})" title="حذف">🗑️</button>

                            </td>

                        </tr>

                    `).join('')}

                    ${pageData.length === 0 ? `

                        <tr><td colspan="13" style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد أصول أو معدات مطابقة لمعايير البحث</td></tr>

                    ` : ''}

                </tbody>

            </table>

        </div>

        ${this.renderTablePaginationBar(paginated, 'App.setAssetsPage', 'App.setAssetsLimit')}

        `;

    },

    renderAssetsGroupedByCategory(groupedByCategory, catLabels, statusLabels) {

        if (!groupedByCategory || groupedByCategory.length === 0) {

            return `<div style="background:#fff; border-radius:8px; padding:30px; text-align:center; color:#94a3b8; border:1px solid #e2e8f0;">لا توجد تصنيفات مسجلة</div>`;

        }



        return `

        <div style="display:flex; flex-direction:column; gap:16px;">

            ${groupedByCategory.map((c, idx) => `

                <div style="background:#ffffff; border-radius:8px; border:1px solid #e2e8f0; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">

                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:8px;">

                            <span style="font-weight:800; font-size:15px; color:#0f172a;">${this.escape(catLabels[c.category] || c.category)}</span>

                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">${c.count} جهاز</span>

                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px;">قيمة: ${App.formatMoney(c.total_val)}</span>

                        </div>

                        <div>

                            <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.assetsCategoryFilter='${c.category}'; App.assetsViewMode='list'; App.renderAssets();">

                                🔍 تصفية القائمة

                            </button>

                        </div>

                    </div>

                    

                    <div class="mt-table-container" style="overflow-x:auto;">

                        <table class="mt-table" style="width:100%; font-size:11px;">

                            <thead>

                                <tr style="background:#f8fafc;">

                                    <th style="width:30px;">#</th>

                                    <th>اسم الجهاز</th>

                                    <th>الموديل</th>

                                    <th>الماك / السيريال</th>

                                    <th>الراوتر والمنفذ</th>

                                    <th>النقطة والبرج</th>

                                    <th>الموقع</th>

                                    <th>المستلم</th>

                                    <th>القيمة</th>

                                    <th>الحالة</th>

                                    <th style="text-align:center;">إجراء</th>

                                </tr>

                            </thead>

                            <tbody>

                                ${(c.devices || []).map((d, di) => `

                                    <tr>

                                        <td>${di + 1}</td>

                                        <td><b>${this.escape(d.name)}</b></td>

                                        <td>${this.escape(d.model || '-')}</td>

                                        <td><code>${this.escape(d.mac_address || d.serial_number || '-')}</code></td>

                                        <td>${this.escape(d.nas_ip || '-')} ${d.nas_port_id ? `(${this.escape(d.nas_port_id)})` : ''}</td>

                                        <td>${d.node_name ? `🌳 ${this.escape(d.node_name)}` : '-'}</td>

                                        <td>${this.escape(d.location || '-')}</td>

                                        <td><b>${this.escape(d.responsible_display || '-')}</b></td>

                                        <td><b style="color:#059669;">${App.formatMoney(d.current_value)}</b></td>

                                        <td><span class="badge" style="background:#059669; color:#fff; font-size:10px;">${statusLabels[d.status] || d.status}</span></td>

                                        <td style="text-align:center;">

                                            <button class="mt-btn" style="padding:1px 6px; font-size:10px;" onclick="App.showAssetModal(${d.id})">✏️ تعديل</button>

                                        </td>

                                    </tr>

                                `).join('')}

                            </tbody>

                        </table>

                    </div>

                </div>

            `).join('')}

        </div>

        `;

    },



    renderAssetsGroupedByNode(groupedByNode, statusLabels) {

        if (!groupedByNode || groupedByNode.length === 0) {

            return `<div style="background:#fff; border-radius:8px; padding:30px; text-align:center; color:#94a3b8; border:1px solid #e2e8f0;">لا توجد نقاط مسجلة</div>`;

        }



        return `

        <div style="display:flex; flex-direction:column; gap:16px;">

            ${groupedByNode.map((n, idx) => `

                <div style="background:#ffffff; border-radius:8px; border:1px solid #e2e8f0; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">

                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:8px;">

                            <span style="font-weight:800; font-size:15px; color:#0f172a;">🌳 ${this.escape(n.node_name)}</span>

                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">${n.count} جهاز منصوب</span>

                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px;">قيمة: ${App.formatMoney(n.total_val)}</span>

                        </div>

                        <div>

                            ${n.node_id ? `

                                <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.assetsNodeFilter=${n.node_id}; App.assetsViewMode='list'; App.renderAssets();">

                                    🔍 تصفية الأجهزة بالنقطة

                                </button>

                            ` : ''}

                        </div>

                    </div>

                    

                    <div class="mt-table-container" style="overflow-x:auto;">

                        <table class="mt-table" style="width:100%; font-size:11px;">

                            <thead>

                                <tr style="background:#f8fafc;">

                                    <th style="width:30px;">#</th>

                                    <th>اسم الجهاز</th>

                                    <th>الموديل</th>

                                    <th>الماك / السيريال</th>

                                    <th>الراوتر والمنفذ</th>

                                    <th>الموقع الدقيق</th>

                                    <th>المستلم</th>

                                    <th>القيمة</th>

                                    <th>الحالة</th>

                                    <th style="text-align:center;">إجراء</th>

                                </tr>

                            </thead>

                            <tbody>

                                ${(n.devices || []).map((d, di) => `

                                    <tr>

                                        <td>${di + 1}</td>

                                        <td><b>${this.escape(d.name)}</b></td>

                                        <td>${this.escape(d.model || '-')}</td>

                                        <td><code>${this.escape(d.mac_address || d.serial_number || '-')}</code></td>

                                        <td>${this.escape(d.nas_ip || '-')} ${d.nas_port_id ? `(${this.escape(d.nas_port_id)})` : ''}</td>

                                        <td>${this.escape(d.location || '-')}</td>

                                        <td><b>${this.escape(d.responsible_display || '-')}</b></td>

                                        <td><b style="color:#059669;">${App.formatMoney(d.current_value)}</b></td>

                                        <td><span class="badge" style="background:#059669; color:#fff; font-size:10px;">${statusLabels[d.status] || d.status}</span></td>

                                        <td style="text-align:center;">

                                            <button class="mt-btn" style="padding:1px 6px; font-size:10px;" onclick="App.showAssetModal(${d.id})">✏️ تعديل</button>

                                        </td>

                                    </tr>

                                `).join('')}

                            </tbody>

                        </table>

                    </div>

                </div>

            `).join('')}

        </div>

        `;

    },



    renderAssetsGroupedByStatus(groupedByStatus, statusLabels) {

        if (!groupedByStatus || groupedByStatus.length === 0) {

            return `<div style="background:#fff; border-radius:8px; padding:30px; text-align:center; color:#94a3b8; border:1px solid #e2e8f0;">لا توجد بيانات للحالات</div>`;

        }



        return `

        <div style="display:flex; flex-direction:column; gap:16px;">

            ${groupedByStatus.map((s, idx) => `

                <div style="background:#ffffff; border-radius:8px; border:1px solid #e2e8f0; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">

                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:8px;">

                            <span style="font-weight:800; font-size:15px; color:#0f172a;">${this.escape(statusLabels[s.status] || s.status)}</span>

                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">${s.count} جهاز</span>

                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px;">قيمة: ${App.formatMoney(s.total_val)}</span>

                        </div>

                        <div>

                            <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.assetsStatusFilter='${s.status}'; App.assetsViewMode='list'; App.renderAssets();">

                                🔍 تصفية الأجهزة

                            </button>

                        </div>

                    </div>

                    

                    <div class="mt-table-container" style="overflow-x:auto;">

                        <table class="mt-table" style="width:100%; font-size:11px;">

                            <thead>

                                <tr style="background:#f8fafc;">

                                    <th style="width:30px;">#</th>

                                    <th>اسم الجهاز</th>

                                    <th>التصنيف</th>

                                    <th>الموديل</th>

                                    <th>الماك / السيريال</th>

                                    <th>النقطة والبرج</th>

                                    <th>الموقع</th>

                                    <th>المستلم</th>

                                    <th>القيمة</th>

                                    <th style="text-align:center;">إجراء</th>

                                </tr>

                            </thead>

                            <tbody>

                                ${(s.devices || []).map((d, di) => `

                                    <tr>

                                        <td>${di + 1}</td>

                                        <td><b>${this.escape(d.name)}</b></td>

                                        <td><span class="badge" style="background:#475569; font-size:10px;">${this.escape(d.category || '-')}</span></td>

                                        <td>${this.escape(d.model || '-')}</td>

                                        <td><code>${this.escape(d.mac_address || d.serial_number || '-')}</code></td>

                                        <td>${d.node_name ? `🌳 ${this.escape(d.node_name)}` : '-'}</td>

                                        <td>${this.escape(d.location || '-')}</td>

                                        <td><b>${this.escape(d.responsible_display || '-')}</b></td>

                                        <td><b style="color:#059669;">${App.formatMoney(d.current_value)}</b></td>

                                        <td style="text-align:center;">

                                            <button class="mt-btn" style="padding:1px 6px; font-size:10px;" onclick="App.showAssetModal(${d.id})">✏️ تعديل</button>

                                        </td>

                                    </tr>

                                `).join('')}

                            </tbody>

                        </table>

                    </div>

                </div>

            `).join('')}

        </div>

        `;

    },



    renderAssetsGroupedByCustodian(groupedByCustodian, statusLabels) {

        if (!groupedByCustodian || groupedByCustodian.length === 0) {

            return `<div style="background:#fff; border-radius:8px; padding:30px; text-align:center; color:#94a3b8; border:1px solid #e2e8f0;">لا توجد بيانات للمسؤولين والعهد</div>`;

        }



        return `

        <div style="display:flex; flex-direction:column; gap:16px;">

            ${groupedByCustodian.map((c, idx) => `

                <div style="background:#ffffff; border-radius:8px; border:1px solid #e2e8f0; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">

                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:8px;">

                            <span style="font-weight:800; font-size:15px; color:#0f172a;">👤 ${this.escape(c.custodian_name)}</span>

                            ${c.custodian_role ? `<span class="badge" style="background:#475569; color:#fff; font-size:10px;">${this.escape(c.custodian_role)}</span>` : ''}

                            ${c.custodian_phone ? `<span style="font-size:11px; color:#64748b;">(${this.escape(c.custodian_phone)})</span>` : ''}

                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">${c.count} جهاز في العهدة</span>

                            <span class="badge" style="background:#10b981; color:#fff; font-size:11px;">قيمة: ${App.formatMoney(c.total_val)}</span>

                        </div>

                        <div>

                            ${c.assigned_to_user_id ? `

                                <button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.assetsUserFilter=${c.assigned_to_user_id}; App.assetsViewMode='list'; App.renderAssets();">

                                    🔍 تصفية عهدة المستخدم

                                </button>

                            ` : ''}

                        </div>

                    </div>

                    

                    <div class="mt-table-container" style="overflow-x:auto;">

                        <table class="mt-table" style="width:100%; font-size:11px;">

                            <thead>

                                <tr style="background:#f8fafc;">

                                    <th style="width:30px;">#</th>

                                    <th>اسم الجهاز</th>

                                    <th>الموديل</th>

                                    <th>الماك / السيريال</th>

                                    <th>النقطة والبرج</th>

                                    <th>الموقع</th>

                                    <th>القيمة</th>

                                    <th>الحالة</th>

                                    <th style="text-align:center;">إجراء</th>

                                </tr>

                            </thead>

                            <tbody>

                                ${(c.devices || []).map((d, di) => `

                                    <tr>

                                        <td>${di + 1}</td>

                                        <td><b>${this.escape(d.name)}</b></td>

                                        <td>${this.escape(d.model || '-')}</td>

                                        <td><code>${this.escape(d.mac_address || d.serial_number || '-')}</code></td>

                                        <td>${d.node_name ? `🌳 ${this.escape(d.node_name)}` : '-'}</td>

                                        <td>${this.escape(d.location || '-')}</td>

                                        <td><b style="color:#059669;">${App.formatMoney(d.current_value)}</b></td>

                                        <td><span class="badge" style="background:#059669; color:#fff; font-size:10px;">${statusLabels[d.status] || d.status}</span></td>

                                        <td style="text-align:center;">

                                            <button class="mt-btn" style="padding:1px 6px; font-size:10px;" onclick="App.showAssetModal(${d.id})">✏️ تعديل</button>

                                        </td>

                                    </tr>

                                `).join('')}

                            </tbody>

                        </table>

                    </div>

                </div>

            `).join('')}

        </div>

        `;

    },



    async showAssetModal(data = null) {

        let assetData = null;

        let assetFetchPromise = null;



        if (typeof data === 'number' || (typeof data === 'string' && /^\d+$/.test(String(data).trim()))) {

            const assetId = Number(data);

            assetFetchPromise = this.api('get_asset_details', { id: assetId });

        } else if (data && typeof data === 'object') {

            assetData = data;

        }



        const [nodesRes, adminsRes, routersRes, networksRes, fetchedAsset] = await Promise.all([

            this.api('get_network_nodes'),

            this.api('get_admins'),

            this.api('get_routers'),

            this.api('get_networks'),

            assetFetchPromise ? assetFetchPromise : Promise.resolve(null)

        ]);



        if (fetchedAsset) {

            assetData = fetchedAsset;

        }

        data = assetData;

        const isEdit = !!data && !!data.id;



        const nodes = nodesRes?.nodes || (Array.isArray(nodesRes) ? nodesRes : []);

        const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);

        const routers = Array.isArray(routersRes) ? routersRes : (routersRes?.data || routersRes?.routers || []);

        const networks = networksRes?.networks || [];



        document.getElementById('modal-container').innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:720px; max-height:92vh; overflow-y:auto;">

                <div class="mt-modal-header">

                    <span>${isEdit ? '✏️ تعديل بيانات الأصل / الجهاز والموقع والعهدة' : '➕ إضافة جهاز أو أصل شبكي جديد'}</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form onsubmit="App.saveAssetForm(event, ${isEdit ? data.id : 'null'})">

                    <div class="mt-modal-body">

                        

                        <div class="form-row">

                            <div class="form-group" style="flex:2;">

                                <label>اسم الأصل / الجهاز (Asset Name) *</label>

                                <input type="text" id="ast-name" class="mt-input" style="width:100%" value="${this.escape(data?.name || '')}" required />

                            </div>

                            <div class="form-group" style="flex:1;">

                                <label>كود الأصل (Asset Code)</label>

                                <input type="text" id="ast-code" class="mt-input" style="width:100%" value="${this.escape(data?.asset_code || '')}" placeholder="توليد تلقائي" />

                            </div>

                        </div>



                        <div class="form-row">

                            <div class="form-group">

                                <label>تصنيف الأصل (Category) *</label>

                                <select id="ast-cat" class="mt-select" style="width:100%">

                                    <option value="routers" ${(data?.category || 'routers') === 'routers' ? 'selected' : ''}>📡 راوترات وسيرفرات ميكروتك</option>

                                    <option value="antennas_dishes" ${data?.category === 'antennas_dishes' ? 'selected' : ''}>📶 هوائيات وأطباق بث</option>

                                    <option value="servers" ${data?.category === 'servers' ? 'selected' : ''}>💻 سيرفرات حاسوبية</option>

                                    <option value="solar_batteries" ${data?.category === 'solar_batteries' ? 'selected' : ''}>☀️ طاقة شمسية وبطاريات</option>

                                    <option value="cables_fiber" ${data?.category === 'cables_fiber' ? 'selected' : ''}>🔌 كابلات فايبر وسويتشات</option>

                                    <option value="towers" ${data?.category === 'towers' ? 'selected' : ''}>🗼 أبراج وصواري</option>

                                    <option value="vehicles" ${data?.category === 'vehicles' ? 'selected' : ''}>🚗 مركبات وسيارات</option>

                                    <option value="other" ${data?.category === 'other' ? 'selected' : ''}>📦 معدات أخرى</option>

                                </select>

                            </div>

                            <div class="form-group">
                                <label>مصدر الأصل (Source) *</label>
                                <select id="ast-source" class="mt-select" style="width:100%" required>
                                    <option value="manual" ${(data?.source_type || 'manual') === 'manual' ? 'selected' : ''}>✍️ إضافة يدوية</option>
                                    <option value="router_discovery" ${data?.source_type === 'router_discovery' ? 'selected' : ''}>📡 سحب من راوتر</option>
                                    <option value="purchase_invoice" ${data?.source_type === 'purchase_invoice' ? 'selected' : ''}>🧾 من فاتورة شراء</option>
                                    <option value="file_import" ${data?.source_type === 'file_import' ? 'selected' : ''}>📥 استيراد من ملف</option>
                                </select>
                            </div>

                            <div class="form-group">

                                <label>الموديل (Model / Platform)</label>

                                <input type="text" id="ast-model" class="mt-input" style="width:100%" value="${this.escape(data?.model || data?.platform || '')}" />

                            </div>

                        </div>



                        <div class="form-row">

                            <div class="form-group">

                                <label>الماك (MAC Address)</label>

                                <input type="text" id="ast-mac" class="mt-input" style="width:100%" value="${this.escape(data?.mac_address || '')}" placeholder="AA:BB:CC:DD:EE:FF" />

                            </div>

                            <div class="form-group">

                                <label>عنوان IP</label>

                                <input type="text" id="ast-ip" class="mt-input" style="width:100%" value="${this.escape(data?.ip_address || '')}" placeholder="10.x.x.x" />

                            </div>

                            <div class="form-group">

                                <label>الرقم التسلسلي (Serial Number)</label>

                                <input type="text" id="ast-serial" class="mt-input" style="width:100%" value="${this.escape(data?.serial_number || '')}" />

                            </div>

                        </div>



                        <!-- NETWORK LOCATION & TOPOLOGY -->

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:12px;">

                                    <div style="font-weight:bold; font-size:12px; margin-bottom:8px; color:#1e293b;">🌐 الارتباط بالشبكة والنقطة والراوتر:</div>

                            <div class="form-row" style="margin-bottom:8px;">

                                <div class="form-group" style="flex:1;">

                                    <label style="font-weight:700; color:#2563eb;">🏢 الشبكة التابع لها الأصل (Network):</label>

                                    <select id="ast-network" class="mt-select" style="width:100%; border:1px solid #93c5fd;">

                                        <option value="">-- اختر الشبكة النشطة --</option>

                                        ${networks.map(n => `<option value="${n.id}" ${(data?.network_id == n.id || (!data?.network_id && Number(n.id) === Number(this.activeNetworkId))) ? 'selected' : ''}>🌐 ${this.escape(n.name)} (${this.escape(n.code || 'NET')})</option>`).join('')}

                                    </select>

                                </div>

                            </div>

                            <div class="form-row">

                                <div class="form-group" style="flex:2;">

                                    <label>النقطة والبرج التابع له (Network Node):</label>

                                    <select id="ast-node" class="mt-select" style="width:100%">

                                        <option value="">-- بدون ارتباط بنقطة محددة --</option>

                                        ${nodes.map(n => `

                                            <option value="${n.id}" ${data?.node_id == n.id ? 'selected' : ''}>

                                                [${n.node_type === 'main_node' ? '🗼 أساسية' : '📡 فرعية'}] ${this.escape(n.node_name)} (${this.escape(n.nas_port_id || 'منفذ عام')})

                                            </option>

                                        `).join('')}

                                    </select>

                                </div>

                                <div class="form-group" style="flex:1;">

                                    <label>الراوتر المرتبط (NAS IP):</label>

                                    <select id="ast-nas-ip" class="mt-select" style="width:100%">

                                        <option value="">-- بدون راوتر --</option>

                                        ${routers.map(r => `

                                            <option value="${r.nasname}" ${data?.nas_ip === r.nasname ? 'selected' : ''}>

                                                ${this.escape(r.shortname || r.nasname)} (${this.escape(r.nasname)})

                                            </option>

                                        `).join('')}

                                    </select>

                                </div>

                                <div class="form-group" style="flex:1;">

                                    <label>المنفذ (Port):</label>

                                    <input type="text" id="ast-nas-port" class="mt-input" style="width:100%" value="${this.escape(data?.nas_port_id || '')}" placeholder="ether1 / SAM-..." />

                                </div>

                            </div>

                        </div>



                        <!-- CUSTODIAN & RESPONSIBLE -->

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:12px;">

                            <div style="font-weight:bold; font-size:12px; margin-bottom:8px; color:#1e293b;">👤 المسؤول والعهدة والموقع:</div>

                            <div class="form-row">

                                <div class="form-group" style="flex:2;">

                                    <label>مستلم العهدة المباشر (Custodian User):</label>

                                    <select id="ast-user" class="mt-select" style="width:100%" onchange="App.onAssetUserSelected(this.value, ${JSON.stringify(admins).replace(/"/g, '&quot;')})">

                                        <option value="">-- عهدة المخزن العام للإدارة --</option>

                                        ${admins.map(a => `

                                            <option value="${a.id}" ${data?.assigned_to_user_id == a.id ? 'selected' : ''}>

                                                ${this.escape(a.fullname)} (${this.escape(a.role_name_ar || a.role)}) - ${this.escape(a.phone || a.username)}

                                            </option>

                                        `).join('')}

                                    </select>

                                </div>

                                <div class="form-group" style="flex:1;">

                                    <label>تاريخ تسليم العهدة:</label>

                                    <input type="date" id="ast-handover" class="mt-input" style="width:100%" value="${data?.handover_date || ''}" />

                                </div>

                            </div>

                            <div class="form-row">

                                <div class="form-group" style="flex:1;">

                                    <label>المسؤول المباشر (نصي):</label>

                                    <input type="text" id="ast-resp" class="mt-input" style="width:100%" value="${this.escape(data?.responsible_person || data?.responsible_display || '')}" placeholder="اسم المستلم" />

                                </div>

                                <div class="form-group" style="flex:2;">

                                    <label>الموقع الجغرافي الدقيق (Location):</label>

                                    <input type="text" id="ast-loc" class="mt-input" style="width:100%" value="${this.escape(data?.location || '')}" placeholder="مثال: كابينة البرج الشرقي - قطاع 2" />

                                </div>

                            </div>

                        </div>



                        <!-- VALUATION & STATUS -->

                        <div class="form-row">

                            <div class="form-group">

                                <label>تكلفة الشراء (${App.getCurrencySymbol(App._baseCurrency)}): ${isEdit ? '<span style="color:#059669; font-size:11px; font-weight:700;">🔒 (السعر مقفل وثابت بعد الإضافة)</span>' : '*'}</label>

                                <input type="number" id="ast-cost" class="mt-input" style="width:100%; ${isEdit ? 'background:#f1f5f9; cursor:not-allowed; color:#475569; font-weight:bold;' : ''}" value="${data?.purchase_cost || 0}" step="any" ${isEdit ? 'readonly title="لا يمكن تعديل سعر الشراء بعد الإضافة"' : 'required'} />

                            </div>

                            <div class="form-group">

                                <label>القيمة الحالية (${App.getCurrencySymbol(App._baseCurrency)}): ${isEdit ? '<span style="color:#059669; font-size:11px; font-weight:700;">🔒 (مقفل)</span>' : ''}</label>

                                <input type="number" id="ast-val" class="mt-input" style="width:100%; ${isEdit ? 'background:#f1f5f9; cursor:not-allowed; color:#475569; font-weight:bold;' : ''}" value="${data?.current_value || data?.purchase_cost || 0}" step="any" ${isEdit ? 'readonly title="السعر مقيد بالسجل المالي"' : ''} />

                            </div>

                            <div class="form-group">

                                <label>الحالة التشغيلية (Status) *</label>

                                <select id="ast-stat" class="mt-select" style="width:100%">

                                    <option value="in_service" ${(data?.status || 'in_service') === 'in_service' ? 'selected' : ''}>🟢 يعمل بالخدمة (In Service)</option>

                                    <option value="maintenance" ${data?.status === 'maintenance' ? 'selected' : ''}>🟡 تحت الصيانة (Maintenance)</option>

                                    <option value="in_stock" ${data?.status === 'in_stock' ? 'selected' : ''}>📦 في المخزن الاحتياطي (In Stock)</option>

                                    <option value="damaged" ${data?.status === 'damaged' ? 'selected' : ''}>🔴 تالف / خارج الخدمة (Damaged)</option>

                                    <option value="retired" ${data?.status === 'retired' ? 'selected' : ''}>⚪ مسترجع / ملغي (Retired)</option>

                                </select>

                            </div>

                            <div class="form-group">

                                <label>تاريخ الشراء:</label>

                                <input type="date" id="ast-date" class="mt-input" style="width:100%" value="${data?.purchase_date || ''}" />

                            </div>

                        </div>



                        <div class="form-group">

                            <label>ملاحظات إضافية:</label>

                            <input type="text" id="ast-notes" class="mt-input" style="width:100%" value="${this.escape(data?.notes || '')}" placeholder="أي تفاصيل فنية أو أرقام سرية" />

                        </div>

                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-primary">${this.t('save')}</button>

                    </div>

                </form>

            </div>

        </div>

        `;

    },

    showEditAssetModal(data) {
        return this.showAssetModal(data);
    },

    async showAssetTimelineModal(id) {
        if (!id) return;
        const [asset, outagesRes] = await Promise.all([
            this.api('get_asset_details', { id }),
            this.api('get_asset_outages', { asset_id: id }).catch(() => ({ data: [] }))
        ]);
        if (!asset || !asset.id) {
            return this.toast('تعذر جلب تفاصيل الأصل', 'danger');
        }
        const outages = Array.isArray(outagesRes) ? outagesRes : (outagesRes?.data || []);
        
        const catLabels = {
            routers: '📡 راوترات وسيرفرات ميكروتك',
            servers: '💻 سيرفرات حاسوبية',
            antennas_dishes: '📶 هوائيات وأطباق بث',
            solar_batteries: '☀️ طاقة شمسية وبطاريات',
            cables_fiber: '🔌 كابلات فايبر وسويتشات',
            towers: '🗼 أبراج وصواري',
            vehicles: '🚗 مركبات وسيارات',
            other: '📦 معدات أخرى'
        };
        const statusLabels = {
            in_service: '🟢 في الخدمة (In Service)',
            maintenance: '🟡 قيد الصيانة (Maintenance)',
            in_stock: '📦 في المخزن (In Stock)',
            damaged: '🔴 تالف وخارج الخدمة (Damaged)',
            retired: '⚪ مسترجع / ملغي (Retired)'
        };

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:700px; max-height:90vh; overflow-y:auto;">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #1e293b, #0f172a); color:#fff; border-bottom:none;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📜</span>
                        <div>
                            <div style="font-weight:800; font-size:15px;">سجل وسيرة الأصل: ${this.escape(asset.name)}</div>
                            <div style="font-size:11px; color:#94a3b8; font-family:monospace;">كود الأصل: ${this.escape(asset.asset_code || '-')} | المعرف: #${asset.id}</div>
                        </div>
                    </div>
                    <span style="cursor:pointer; color:#94a3b8; font-size:18px;" onclick="App.closeModal()">✕</span>
                </div>
                <div class="mt-modal-body" style="padding:16px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px; margin-bottom:16px;">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">التصنيف والموديل</div>
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-top:2px;">${catLabels[asset.category] || asset.category || '-'}</div>
                            <div style="font-size:11px; color:#475569;">${this.escape(asset.model || '-')} ${asset.brand ? '(' + this.escape(asset.brand) + ')' : ''}</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">الحالة التشغيلية</div>
                            <div style="margin-top:4px;">
                                <span class="status-pill status-${asset.status}" style="font-size:12px; font-weight:700;">
                                    ${statusLabels[asset.status] || asset.status}
                                </span>
                            </div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">العهدة والمسؤول</div>
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-top:2px;">👤 ${this.escape(asset.custodian_name || asset.responsible_person || 'المخزن العام')}</div>
                            <div style="font-size:11px; color:#64748b;">تاريخ التسليم: ${this.escape(asset.handover_date || '-')}</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">الموقع والبرج / النقطة</div>
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-top:2px;">📍 ${this.escape(asset.node_name || 'غير محدد')}</div>
                            <div style="font-size:11px; color:#64748b;">${this.escape(asset.location || '-')}</div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">البيانات المالية</div>
                            <div style="font-size:12px; color:#0f172a; margin-top:2px;">شراء: <b>${App.formatMoney(asset.purchase_cost || 0)}</b></div>
                            <div style="font-size:12px; color:#16a34a;">تقييم حالي: <b>${App.formatMoney(asset.current_value || 0)}</b></div>
                        </div>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                            <div style="font-size:11px; color:#64748b;">الماك والسيريال</div>
                            <div style="font-family:monospace; font-size:11px; direction:ltr; text-align:left; color:#0284c7;">${this.escape(asset.mac_address || '-')}</div>
                            <div style="font-family:monospace; font-size:11px; color:#64748b;">SN: ${this.escape(asset.serial_number || '-')}</div>
                        </div>
                    </div>

                    ${asset.notes ? `
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:10px; margin-bottom:16px;">
                        <div style="font-weight:700; font-size:12px; color:#92400e; margin-bottom:4px;">📝 ملاحظات الأصل:</div>
                        <div style="font-size:12px; color:#78350f; white-space:pre-wrap;">${this.escape(asset.notes)}</div>
                    </div>` : ''}

                    <div style="font-weight:700; font-size:13px; margin-bottom:10px; color:#1e293b;">⏱️ سجل وسيرة الجهاز والعمليات:</div>
                    <div style="position:relative; padding-right:20px; border-right:2px solid #e2e8f0; margin-right:8px; display:flex; flex-direction:column; gap:12px;">
                        <div style="position:relative;">
                            <div style="position:absolute; right:-26px; top:3px; width:12px; height:12px; border-radius:50%; background:#10b981; border:2px solid #fff; box-shadow:0 0 0 2px #10b981;"></div>
                            <div style="font-weight:700; font-size:12px; color:#0f172a;">الحالة الحالية: ${statusLabels[asset.status] || asset.status}</div>
                            <div style="font-size:11px; color:#64748b;">الموقع: ${this.escape(asset.location || asset.node_name || 'المستودع')} | العهدة: ${this.escape(asset.custodian_name || asset.responsible_person || 'المخزن العام')}</div>
                        </div>

                        ${asset.handover_date ? `
                        <div style="position:relative;">
                            <div style="position:absolute; right:-26px; top:3px; width:12px; height:12px; border-radius:50%; background:#3b82f6; border:2px solid #fff; box-shadow:0 0 0 2px #3b82f6;"></div>
                            <div style="font-weight:700; font-size:12px; color:#0f172a;">تسليم العهدة</div>
                            <div style="font-size:11px; color:#64748b;">تاريخ التسليم: ${this.escape(asset.handover_date)} للمسؤول: ${this.escape(asset.custodian_name || asset.responsible_person || '-')}</div>
                        </div>` : ''}

                        ${asset.purchase_date ? `
                        <div style="position:relative;">
                            <div style="position:absolute; right:-26px; top:3px; width:12px; height:12px; border-radius:50%; background:#8b5cf6; border:2px solid #fff; box-shadow:0 0 0 2px #8b5cf6;"></div>
                            <div style="font-weight:700; font-size:12px; color:#0f172a;">تاريخ الشراء / الإدخال للمخزون</div>
                            <div style="font-size:11px; color:#64748b;">بتاريخ: ${this.escape(asset.purchase_date)} | تكلفة الشراء: ${App.formatMoney(asset.purchase_cost || 0)}</div>
                        </div>` : ''}

                        ${outages.map(o => `
                        <div style="position:relative;">
                            <div style="position:absolute; right:-26px; top:3px; width:12px; height:12px; border-radius:50%; background:#ef4444; border:2px solid #fff; box-shadow:0 0 0 2px #ef4444;"></div>
                            <div style="font-weight:700; font-size:12px; color:#dc2626;">سجل انقطاع / عطل فني</div>
                            <div style="font-size:11px; color:#64748b;">من: ${this.escape(o.start_time || '-')} إلى: ${this.escape(o.end_time || 'مستمر')} | السبب: ${this.escape(o.reason || 'غير محدد')}</div>
                        </div>`).join('')}

                        <div style="position:relative;">
                            <div style="position:absolute; right:-26px; top:3px; width:12px; height:12px; border-radius:50%; background:#64748b; border:2px solid #fff; box-shadow:0 0 0 2px #64748b;"></div>
                            <div style="font-weight:700; font-size:12px; color:#0f172a;">تسجيل الأصل في النظام</div>
                            <div style="font-size:11px; color:#64748b;">المصدر: ${this.escape(asset.source_type || 'إضافة يدوية')} | تاريخ الإنشاء: ${this.escape(asset.created_at || asset.purchase_date || '-')}</div>
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button class="mt-btn mt-btn-success" onclick="App.printAssetCardDoc(${asset.id})">🖨️ طباعة بطاقة الأصل</button>
                    <button class="mt-btn mt-btn-primary" onclick="App.closeModal(); App.showEditAssetModal(${asset.id})">✏️ تعديل البيانات</button>
                    <button class="mt-btn" onclick="App.closeModal()">${this.t('close')}</button>
                </div>
            </div>
        </div>
        `;
        this.openModal(modalHtml);
    },

    onAssetUserSelected(userId, admins) {

        if (!userId) return;

        const u = admins.find(a => a.id == userId);

        if (u) {

            const respInput = document.getElementById('ast-resp');

            if (respInput) respInput.value = u.fullname || '';

            const handoverInput = document.getElementById('ast-handover');

            if (handoverInput && !handoverInput.value) {

                handoverInput.value = new Date().toISOString().split('T')[0];

            }

        }

    },



    async saveAssetForm(e, id) {

        e.preventDefault();

        const payload = {

            id: (id && id !== 'null') ? Number(id) : null,

            name: document.getElementById('ast-name').value.trim(),

            asset_code: document.getElementById('ast-code')?.value.trim() || '',

            category: document.getElementById('ast-cat').value,

            source_type: document.getElementById('ast-source')?.value || 'manual',

            model: document.getElementById('ast-model')?.value.trim() || '',

            serial_number: document.getElementById('ast-serial')?.value.trim() || '',

            mac_address: document.getElementById('ast-mac')?.value.trim() || '',

            ip_address: document.getElementById('ast-ip')?.value.trim() || '',

            network_id: document.getElementById('ast-network')?.value ? Number(document.getElementById('ast-network').value) : Number(this.activeNetworkId || 0),

            node_id: document.getElementById('ast-node')?.value ? Number(document.getElementById('ast-node').value) : null,

            nas_ip: document.getElementById('ast-nas-ip')?.value || null,

            nas_port_id: document.getElementById('ast-nas-port')?.value.trim() || null,

            assigned_to_user_id: document.getElementById('ast-user')?.value ? Number(document.getElementById('ast-user').value) : null,

            handover_date: document.getElementById('ast-handover')?.value || null,

            responsible_person: document.getElementById('ast-resp')?.value.trim() || '',

            purchase_cost: parseFloat(document.getElementById('ast-cost').value) || 0,

            current_value: parseFloat(document.getElementById('ast-val').value) || 0,

            location: document.getElementById('ast-loc')?.value.trim() || '',

            status: document.getElementById('ast-stat').value,

            purchase_date: document.getElementById('ast-date')?.value || null,

            notes: document.getElementById('ast-notes')?.value.trim() || ''

        };



        const res = await this.api('save_asset', payload, 'POST');

        if (res && res.success) {

            this.toast(this.t('success_saved'), 'success');

            this.closeModal();

            this.renderAssets();

        } else {

            this.toast(res?.error || 'تعذر حفظ بيانات الأصل', 'danger');

        }

    },



    async deleteAsset(id) {

        return this.deleteAssetItem(id);

    },



    async deleteAssetItem(id) {

        if (!confirm(this.t('confirm_delete'))) return;

        const res = await this.api('delete_asset', { id });

        if (res && res.success) {

            this.toast(this.t('success_deleted'), 'success');

            this.renderAssets();

        } else {

            this.toast(res?.error || 'تعذر حذف الأصل', 'danger');

        }

    },



    exportAssetsCSV() {

        window.open('api.php?action=export_assets&category=' + encodeURIComponent(this.assetsCategoryFilter || '') + '&status=' + encodeURIComponent(this.assetsStatusFilter || ''), '_blank');

    },



    showImportAssetsModal() {

        this.openModal(`

            <div style="padding:20px;">

                <h3 style="margin-top:0; border-bottom:1px solid var(--border-color); padding-bottom:10px;">📥 استيراد الأصول والمعدات من ملف CSV</h3>

                <div class="form-group" style="margin-bottom:15px;">

                    <label style="font-weight:bold;">اختر ملف CSV:</label>

                    <input type="file" id="ast-import-file" accept=".csv" class="mt-input" style="width:100%;" />

                </div>

                <div class="form-group" style="margin-bottom:15px;">

                    <label><input type="checkbox" id="ast-import-overwrite" /> تحديث السجلات الموجودة مسبقاً في حال تطابق الكود أو السيريال</label>

                </div>

                <div style="font-size:12px; color:var(--text-muted); background:var(--toolbar-bg); padding:10px; border-radius:5px; margin-bottom:15px;">

                    <b>الأعمدة المطلوبة في CSV:</b><br/>

                    <code>asset_code, name, category, model, serial_number, mac_address, ip_address, purchase_cost, current_value, location, status</code>

                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px;">

                    <button class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                    <button class="mt-btn mt-btn-primary" onclick="App.processImportAssets()">بدء الاستيراد</button>

                </div>

            </div>

        `);

    },



    async processImportAssets() {

        const fileInput = document.getElementById('ast-import-file');

        if (!fileInput || !fileInput.files.length) {

            return alert('يرجى اختيار ملف CSV أولاً');

        }

        const overwrite = document.getElementById('ast-import-overwrite')?.checked || false;

        const formData = new FormData();

        formData.append('file', fileInput.files[0]);

        formData.append('overwrite', overwrite ? '1' : '0');



        const res = await this.api('import_assets', {}, 'POST', formData);

        if (res && res.success) {

            this.toast(`تم استيراد ${res.imported_count || 0} أصل بنجاح`, 'success');

            this.closeModal();

            this.renderAssets();

        } else {

            this.toast(res?.error || 'فشل استيراد الملف', 'danger');

        }

    },



    

// ==========================================

    // 7. FINANCIAL REPORTS & P&L (التقارير المالية والأرباح)

    // ==========================================

    async renderFinancialReports() {

        const period = document.getElementById('rep-filter-period')?.value || 'month';

        const rep = await this.api('get_financial_report', { period }) || {};



        document.getElementById('main-view').innerHTML = `

        <div class="mt-toolbar">

            <div class="mt-toolbar-left">

                <span style="font-weight:600; font-size:14px;">📈 تقرير الأرباح والخسائر والمبيعات (P&L Financial Report)</span>

            </div>

            <div class="mt-toolbar-right">

                <select id="rep-filter-period" class="mt-select" onchange="App.renderFinancialReports()">

                    <option value="today" ${period==='today'?'selected':''}>اليوم</option>

                    <option value="month" ${period==='month'?'selected':''}>آخر 30 يوم (الشهر الحالي)</option>

                    <option value="year" ${period==='year'?'selected':''}>السنة الحالية</option>

                </select>

                <button class="mt-btn" onclick="App.renderFinancialReports()">⟳ ${this.t('refresh')}</button>

            </div>

        </div>

        <div class="view-scroll-content" style="flex:1; overflow-y:auto; padding:14px 12px calc(80px + env(safe-area-inset-bottom, 0px)) 12px;">

            <div class="kpi-grid" style="padding:0; margin-bottom:20px;">

                <div class="kpi-card">

                    <div class="kpi-icon" style="background:#e8f8f0; color:#27ae60;">📈</div>

                    <div>

                        <div class="kpi-val" style="color:#27ae60;">${App.formatMoney(rep.net_sales || rep.gross_revenue)}</div>

                        <div class="kpi-lbl">إجمالي إيرادات مبيعات الكروت</div>

                    </div>

                </div>

                <div class="kpi-card">

                    <div class="kpi-icon" style="background:#ffebee; color:#e53935;">📉</div>

                    <div>

                        <div class="kpi-val" style="color:#e53935;">${App.formatMoney(rep.total_expenses)}</div>

                        <div class="kpi-lbl">إجمالي المصروفات التشغيلية</div>

                    </div>

                </div>

                <div class="kpi-card">

                    <div class="kpi-icon" style="background:#e1f5fe; color:#0288d1;">🎯</div>

                    <div>

                        <div class="kpi-val" style="font-size:22px; color:${rep.net_profit >= 0 ? '#0078d7' : '#e74c3c'};">

                            ${App.formatMoney(rep.net_profit)}

                        </div>

                        <div class="kpi-lbl">صافي الأرباح (Net Profit)</div>

                    </div>

                </div>

                <div class="kpi-card">

                    <div class="kpi-icon" style="background:#fff3e0; color:#f57c00;">💵</div>

                    <div>

                        <div class="kpi-val">${App.formatMoney(rep.total_cash_collected)}</div>

                        <div class="kpi-lbl">النقدية المحصلة فعلياً (Cash Flow)</div>

                    </div>

                </div>

            </div>



            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:6px; padding:20px; max-width:800px;">

                <div style="font-weight:700; font-size:15px; margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">

                    ملخص قائمة الدخل (Income Statement Summary):

                </div>

                <table class="mt-table" style="font-size:13px;">

                    <tbody>

                        <tr>

                            <td><b>+ إجمالي مبيعات كروت الجملة والتجزئة (قبل الخصم):</b></td>

                            <td style="text-align:left; font-weight:bold; color:#27ae60;">${App.formatMoney(rep.gross_revenue)}</td>

                        </tr>

                        <tr>

                            <td><b>- إجمالي الخصومات الممنوحة للموزعين:</b></td>

                            <td style="text-align:left; color:#f57c00;">${App.formatMoney(rep.total_discounts)}</td>

                        </tr>

                        <tr style="background:#f8fafc;">

                            <td><b>= صافي المبيعات والإيرادات (بعد الخصم):</b></td>

                            <td style="text-align:left; font-weight:bold; color:#0284c7;">${App.formatMoney(rep.net_sales || (rep.gross_revenue - rep.total_discounts))}</td>

                        </tr>

                        <tr>

                            <td><b>- إجمالي المصاريف التشغيلية والمشتريات (سندات الصرف):</b></td>

                            <td style="text-align:left; font-weight:bold; color:#e74c3c;">${App.formatMoney(rep.total_expenses)}</td>

                        </tr>

                        <tr style="background:#f4f6f8; font-size:15px; border-top:2px solid #cbd5e1;">

                            <td><b>= صافي الربح التشغيلي (Net Operating Profit):</b></td>

                            <td style="text-align:left; font-weight:bold; color:${rep.net_profit>=0?'#0078d7':'#e74c3c'};">${App.formatMoney(rep.net_profit)}</td>

                        </tr>

                    </tbody>

                </table>

            </div>

        </div>

        `;

    },



    // ==========================================

    // ROUTERS / NAS

    // ==========================================

    // ==========================================

    // ROUTERS (NAS) & SSTP VPN MANAGEMENT

    // ==========================================

        async renderRouters() {
        const [routersRes, sstpRes] = await Promise.all([
            this.api('get_routers'),
            this.api('get_sstp_status')
        ]);
        const routers = Array.isArray(routersRes) ? routersRes : (routersRes?.routers || []);
        this.routerCache = routers;
        const sessions = Array.isArray(sstpRes?.sessions) ? sstpRes.sessions : (Array.isArray(sstpRes?.data?.sessions) ? sstpRes.data.sessions : []);
        const activeIps = new Set(sessions.filter(s => s.state === 'active').map(s => s.ip));
        const activeUsers = new Set(sessions.filter(s => s.state === 'active').map(s => s.username));

        const isRouterOnline = (r) => {
            const vpnIp = '10.101.0.' + r.id;
            return activeIps.has(r.nasname) || activeIps.has(vpnIp) || activeUsers.has('router_' + r.id) || activeUsers.has(r.nasname) || activeUsers.has(r.shortname);
        };
        const activeCount = routers.filter(r => isRouterOnline(r)).length;
        const offlineCount = routers.length - activeCount;
        const apiActiveCount = routers.filter(r => Number(r.api_enabled ?? 1) === 1 && (Number(r.api_status ?? 0) === 1 || isRouterOnline(r))).length;

        const PB = window.SamUI?.PageBuilder;

        // 1. Actions
        const actions = [
            (this.can('routers_add') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '+ إضافة راوتر', variant: 'primary', onclick: 'App.showRouterModal()' } : null,
            { label: '🤖 حزمة TLGRM وسكربتات v6/v7', variant: 'info', onclick: 'App.openSmartRouterScriptModal()', title: 'توليد سكربتات MikroTik وحزمة التيليجرام' },
            { label: '🎨 إعداد صفحة الهوتسبوت', variant: 'warning', onclick: "App.switchTab('hotspot_designer')" },
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderRouters()' }
        ].filter(Boolean);

        // 2. Stats
        const stats = [
            { label: 'إجمالي الراوترات', value: routers.length.toLocaleString(), icon: '🌐', tone: 'blue' },
            { label: 'متصلة بالنفق (SSTP)', value: activeCount.toLocaleString(), icon: '🟢', tone: 'green' },
            { label: 'غير متصلة', value: offlineCount.toLocaleString(), icon: '🔴', tone: 'rose' },
            { label: 'تحكم API نشط', value: apiActiveCount.toLocaleString(), icon: '⚡', tone: 'cyan' }
        ];

        // 3. Toolbar
        const toolbar = {
            left: [
                `<span style="font-size:12.5px; color:var(--sam-text-secondary); font-weight:700;">قائمة الراوترات المسجلة في مصادقة RADIUS:</span>`
            ],
            right: [
                `<div class="quick-table-search" style="margin:0; min-width:220px;">
                    <span class="quick-table-search-icon">🔍</span>
                    <input type="text" class="quick-table-search-input" placeholder="بحث باسم الجهاز أو IP أو الموقع..." oninput="App.filterRoutersTable(this.value)" />
                </div>`
            ]
        };

        // 4. Table HTML
        const tableHtml = `
            <div class="sam-table-container mt-table-container">
                <table class="sam-table mt-table" id="routers-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم الجهاز / الموقع</th>
                            <th>نوع عمل الراوتر</th>
                            <th>حالة النفق والاتصال</th>
                            <th>إدارة وتحكم API</th>
                            <th style="text-align:center;">العمليات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${routers.map((r, i) => {
                            const isSstpOnline = isRouterOnline(r);
                            const apiOnline = Number(r.api_enabled ?? 1) === 1 && (Number(r.api_status ?? 0) === 1 || isSstpOnline);
                            const apiStatusText = Number(r.api_enabled ?? 1) === 1 ? (apiOnline ? '🟢 متصل جاهز' : '🔴 غير متصل') : '⚪ معطل';
                            const apiBadgeClass = Number(r.api_enabled ?? 1) === 1 ? (apiOnline ? 'sam-badge--success' : 'sam-badge--danger') : 'sam-badge--subtle';

                            return `<tr>
                                <td>${i + 1}</td>
                                <td>
                                    <div style="font-weight:800; font-size:13.5px; color:#0f172a;">${this.escape(r.shortname || r.nasname)}</div>
                                    <div style="margin-top:4px; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                                        <span class="sam-badge" style="background:#0284c7; color:#fff; cursor:pointer; font-size:10.5px; font-weight:700; padding:2px 7px;" onclick="App.copyWinboxEndpoint('${r.winbox_listen_port || (8220 + r.id)}')" title="انقر لنسخ عنوان Winbox">
                                            🖥️ Winbox: ${r.winbox_listen_port || (8220 + r.id)} → ${r.winbox_port || 8291} 📋
                                        </span>
                                        <span class="sam-badge sam-badge--secondary" style="font-size:10px; font-family:monospace;" title="منفذ توجيه الـ API">
                                            ⚡ API: ${r.api_listen_port || (8720 + r.id)} → ${r.api_port || 8728}
                                        </span>
                                    </div>
                                    ${Number(r.um_proxy_enabled) === 1 ? `<div style="margin-top:3px;"><span class="sam-badge sam-badge--warning" style="font-size:10px;">🔄 UM Failover: راوتر محدد من نفس الشبكة</span></div>` : ''}
                                </td>
                                    <td>${String(r.work_types || 'hotspot').split(',').map(t => ({hotspot:'Hotspot',usermanager:'User Manager',line_bonding:'دمج خطوط'}[t] || t)).map(t => `<span class="sam-badge sam-badge--info" style="font-size:10px;margin:2px;">${this.escape(t)}</span>`).join('')}</td>
                                <td><span class="sam-badge ${isSstpOnline ? 'sam-badge--success' : 'sam-badge--danger'}">${isSstpOnline ? '🟢 متصل بالنفق' : '🔴 غير متصل'}</span></td>
                                <td><span class="sam-badge ${apiBadgeClass}">${apiStatusText}</span></td>
                                <td style="text-align:center; white-space:nowrap;">
                                    <div class="sam-toolbar-group" style="justify-content:center; gap:3px;">
                                        ${(this.can('routers') || this.can('routers_view') || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--primary" onclick="App.openSmartRouterScriptModal(${r.id})" title="توليد سكربت التهيئة الذكي (v6 / v7) وحزم التيليجرام والواتساب">📜 سكربت v6/v7</button>` : ''}
                                        ${(this.can('routers') || this.can('routers_view') || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.diagnoseRouterFleet(${r.id})" title="فحص وتشخيص صحة الراوتر والاتصال">🩺 فحص</button>` : ''}
                                        ${(this.can('routers') || this.can('routers_view') || this.can('routers_manage') || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin') ? `<button type="button" class="sam-btn sam-btn--sm" onclick="App.testRouterCoA(${r.id}, '${this.escape(r.nasname)}', ${r.ports || 3799})" title="فحص استجابة منفذ CoA لطرد وفصل وتعديل المستخدمين">⚡ CoA</button>` : ''}
                                        ${(this.can('routers_transfer') || this.can('routers_edit') || this.can('routers') || this.can('networks_manage') || this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin') ? `<button type="button" class="sam-btn sam-btn--sm" style="color:#0284c7; background:#e0f2fe; border-color:#bae6fd;" onclick="App.openReassignRouterModal(${r.id})" title="نقل الراوتر وإعادة توجيهه بين الشبكات">🔄 نقل</button>` : ''}
                                        ${this.can('routers_edit') || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'admin' ? `<button type="button" class="sam-btn sam-btn--sm" onclick="App.showRouterModal(App.routerCache.find(x => Number(x.id) === ${Number(r.id)}))" title="تعديل بيانات الراوتر">✏️</button>` : ''}
                                        ${this.can('routers_delete') || this.userRole === 'system_owner' || this.userRole === 'superadmin' ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.deleteRouter(${r.id})" title="حذف الراوتر">🗑️</button>` : ''}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('') || '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--sam-text-muted);">لا توجد أجهزة راوتر مضافة</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'network-routers',
                archetype: 'table',
                title: 'أجهزة الراوتر ومصادقة NAS',
                subtitle: 'مراقبة وإدارة أجهزة MikroTik وأنفاق SSTP وحالة مصادقة RADIUS وفحص الاتصال',
                eyebrow: 'NETWORK & ROUTERS',
                icon: '🌐',
                actions: actions,
                stats: stats,
                toolbar: toolbar,
                content: tableHtml
            });
        } else {
            document.getElementById('main-view').innerHTML = `
                <main class="sam-page-shell sam-ui-page" data-sam-page="network-routers" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">🌐</span>
                            <div>
                                <span class="sam-page-eyebrow">NETWORK & ROUTERS</span>
                                <h1>أجهزة الراوتر ومصادقة NAS</h1>
                                <p>مراقبة وإدارة أجهزة MikroTik وأنفاق SSTP وحالة مصادقة RADIUS</p>
                            </div>
                        </div>
                    </header>
                    <div class="view-scroll-content">
                        ${tableHtml}
                    </div>
                </main>
            `;
        }
        window.SamPageShell?.sync();
    },



    filterRoutersTable(query) {

        const q = (query || '').toLowerCase().trim();

        const rows = document.querySelectorAll('#routers-table tbody tr');

        rows.forEach(tr => {

            const text = tr.innerText.toLowerCase();

            tr.style.display = text.includes(q) ? '' : 'none';

        });

    }

});


// ==========================================
// ASSETS BULK PRINTING HELPERS
// ==========================================
App.printSelectedAssetsBulk = function() {
    const selected = Array.from(this.selectedAssets || []);
    if (selected.length === 0) return App.toast('يرجى تحديد أصل واحد على الأقل للطباعة', 'warning');
    if (App.PrintEngine && typeof App.PrintEngine.printAssetsInventoryReport === 'function') {
        App.PrintEngine.printAssetsInventoryReport({ ids: selected });
    }
};

App.printSelectedAssetBarcodes = function() {
    const selected = Array.from(this.selectedAssets || []);
    if (selected.length === 0) return App.toast('يرجى تحديد أصل واحد على الأقل لطباعة ملصقات الباركود', 'warning');
    if (App.PrintEngine && typeof App.PrintEngine.printAssetBarcodesBulk === 'function') {
        App.PrintEngine.printAssetBarcodesBulk(selected);
    }
};


App.copyWinboxEndpoint = function(port) {
    const host = window.location.hostname || '194.163.165.238';
    const endpoint = `${host}:${port}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(endpoint).catch(() => {});
    }
    App.toast(`✅ تم نسخ عنوان Winbox: (${endpoint}) — الصقه في برنامج Winbox للاتصال بالراوتر مباشرة`, 'success');
};
