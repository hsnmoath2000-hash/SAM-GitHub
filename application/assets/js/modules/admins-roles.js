/**

 * SAM User Manager — Admins, Roles & Permissions (RBAC)

 */

'use strict';



Object.assign(window.App, {

    setAdminFilterBalance(balanceStatus) {

        this.adminsBalanceFilter = balanceStatus;

        this.adminsPage = 1;

        this.renderAdmins();

    },



    async renderAdmins() {

        const params = {

            role: this.adminsRoleFilter,

            search: this.adminsSearch,

            active: this.adminsActiveFilter,

            parent_id: this.adminsParentFilter,

            balance_status: this.adminsBalanceFilter

        };



        const [res, netRes, nodesRes] = await Promise.all([

            this.api('get_admins', params) || { admins: [], summary: {} },

            this.api('get_networks').catch(() => ({ networks: [] })),

            this.api('get_network_nodes').catch(() => [])

        ]);



        let rawAdmins = res.admins || (Array.isArray(res) ? res : []);

        const allNetworksList = netRes?.networks || (Array.isArray(netRes) ? netRes : []);

        const allNetworkNodesList = Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes || []);



        const summary = res.summary || {

            total_users: rawAdmins.length,

            active_count: rawAdmins.filter(a => a.is_active).length,

            disabled_count: rawAdmins.filter(a => !a.is_active).length,

            total_credit_limit: rawAdmins.reduce((s, a) => s + (parseFloat(a.credit_limit) || 0), 0),

            total_balance_debt: rawAdmins.reduce((s, a) => s + (parseFloat(a.balance) > 0 ? parseFloat(a.balance) : 0), 0),

            role_counts: {}

        };



        const rolesList = [

            { key: 'system_owner', label: 'مالك النظام' },

            { key: 'superadmin', label: 'مدير عام (Superadmin)' },

            { key: 'partner', label: 'شريك استثماري (Partner)' },

            { key: 'distributor', label: 'موزع رئيسي (Distributor)' },

            { key: 'main_node_owner', label: '🗼 مسؤول نقطة أساسي (Main Node)' },

            { key: 'sub_node_owner', label: '📡 مسؤول نقطة فرعي (Sub Node)' },

            { key: 'regular_node_owner', label: '📶 مسؤول نقطة عادي (Node Owner)' },

            { key: 'pos_agent', label: 'نقطة بيع (POS Agent)' },

            { key: 'agent', label: 'عميل نقطة البيع' },

            { key: 'accountant', label: 'محاسب مالي (Accountant)' },

            { key: 'supervisor', label: 'مشرف شبكة (Supervisor)' },

            { key: 'maintenance', label: 'فني صيانة (Maintenance)' },

            { key: 'vip', label: 'مستخدم VIP (كروت مجانية)' }

        ];



        const commercialRoles = ['distributor', 'partner', 'pos_agent', 'agent', 'regular_node_owner', 'main_node_owner', 'sub_node_owner'];
        const staffRoles = ['system_owner', 'superadmin', 'admin', 'accountant', 'finance', 'supervisor', 'maintenance', 'vip'];

        const currentMode = this.adminsViewMode || 'table';
        this.adminsViewMode = currentMode;

        const allDistributors = rawAdmins.filter(a => commercialRoles.includes(a.role));
        const allStaff = rawAdmins.filter(a => staffRoles.includes(a.role));
        const selCount = this.selectedAdmins.size;

        // Determine which list to display based on mode
        let displayList = rawAdmins;
        if (currentMode === 'distributors') {
            displayList = allDistributors;
        } else if (currentMode === 'staff') {
            displayList = allStaff;
        }

        // Apply Sorting & Pagination for Table View
        this._lastAdminsList = displayList;
        let sortedAdmins = this.genericSort(displayList, this.adminsSortCol, this.adminsSortDir);
        const paginated = this.genericPaginate(sortedAdmins, this.adminsPage, this.adminsLimit);
        const pageData = paginated.data;

        const actions = [
            (this.can('admins_add') || this.can('admins_agents') || ['system_owner', 'superadmin', 'partner', 'supervisor', 'distributor', 'main_node_owner'].includes(this.userRole)) ? { label: '➕ إضافة حساب', variant: 'primary', onclick: 'App.showAdminModal()', title: 'إضافة حساب جديد' } : null,
            (this.can('admins_add') || this.can('admins_agents') || ['system_owner', 'superadmin', 'partner', 'supervisor', 'distributor', 'main_node_owner'].includes(this.userRole)) ? { label: '📡 إضافة مسؤول نقطة', variant: 'primary', onclick: 'App.showNodeOwnerModal()', title: 'إضافة مسؤول نقطة (أساسي / فرعي / عادي) بنموذج مبسط' } : null,
            (this.can('admins_add') || this.can('admins_agents') || ['system_owner', 'superadmin', 'admin', 'partner', 'supervisor', 'distributor'].includes(this.userRole)) ? { label: '📲 دعوة نقطة بيع', variant: 'warning', onclick: 'App.showInvitePosModal()', title: 'دعوة نقطة بيع وتثبيت المديونية السابقة' } : null,
            { label: '📤 تصدير CSV', variant: 'success', onclick: 'App.exportAdminsCSV()', title: 'تصدير بيانات المستخدمين إلى CSV' },
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderAdmins()' }
        ].filter(Boolean);

        const stats = [
            {
                label: '👥 إجمالي الحسابات',
                value: String(summary.total_users || rawAdmins.length),
                icon: '👥',
                tone: 'blue',
                onclick: "App.adminsActiveFilter=''; App.adminsBalanceFilter=''; App.adminsPage=1; App.renderAdmins();",
                title: 'عرض جميع الحسابات'
            },
            {
                label: '🟢 نشط ومفعل',
                value: String(summary.active_count || 0),
                icon: '🟢',
                tone: 'emerald',
                onclick: "App.setAdminFilterStatus('1')",
                title: 'تصفية الحسابات النشطة'
            },
            {
                label: '🔴 معطل',
                value: String(summary.disabled_count || 0),
                icon: '🔴',
                tone: 'rose',
                onclick: "App.setAdminFilterStatus('0')",
                title: 'تصفية الحسابات المعطلة'
            },
            {
                label: '💵 مديونيات السوق',
                value: App.formatMoney(summary.total_balance_debt || 0),
                icon: '💵',
                tone: 'red',
                onclick: "App.setAdminFilterBalance('debt')",
                title: 'تصفية الحسابات المدينة'
            },
            {
                label: '💳 سقوف الائتمان',
                value: App.formatMoney(summary.total_credit_limit || 0),
                icon: '💳',
                tone: 'amber',
                title: 'إجمالي سقوف الائتمان الممنوحة'
            },
            {
                label: '👔 الموزعون والوكلاء',
                value: String(allDistributors.length),
                icon: '👔',
                tone: 'purple',
                onclick: "App.adminsViewMode='distributors'; App.adminsPage=1; App.renderAdmins();",
                title: 'عرض الموزعين والوكلاء'
            }
        ];

        // Toolbar elements
        const leftToolbarItems = [
            `<div class="view-mode-group" style="display:inline-flex; border:1px solid var(--border-color, #cbd5e1); border-radius:6px; overflow:hidden; background:var(--bg-panel, #f8fafc);">
                <button class="mt-btn ${currentMode === 'distributors' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.adminsViewMode='distributors'; App.adminsPage=1; App.renderAdmins();">
                    👔 الموزعون والوكلاء (${allDistributors.length})
                </button>
                <button class="mt-btn ${currentMode === 'staff' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.adminsViewMode='staff'; App.adminsPage=1; App.renderAdmins();">
                    🛡️ المشرفون ومستخدمو النظام (${allStaff.length})
                </button>
                <button class="mt-btn ${currentMode === 'table' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.adminsViewMode='table'; App.adminsPage=1; App.renderAdmins();">
                    📋 كل الحسابات (${rawAdmins.length})
                </button>
                <button class="mt-btn ${currentMode === 'tree' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.adminsViewMode='tree'; App.renderAdmins();">
                    🌳 شجرة المستخدمين والشبكات
                </button>
                <button class="mt-btn ${currentMode === 'by_role' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:0; padding:6px 12px; font-size:12px; font-weight:700;" onclick="App.adminsViewMode='by_role'; App.renderAdmins();">
                    👥 تجميع بالرتبة
                </button>
            </div>`,
            `<div id="admin-selection-actions" style="background:rgba(99,102,241,0.1); border:1px solid var(--primary-color); border-radius:6px; padding:4px 10px; display:${selCount > 0 ? 'inline-flex' : 'none'}; align-items:center; gap:6px;">
                <span id="selected-admins-count-label" style="font-weight:bold; color:var(--primary-color); font-size:11.5px;">تم تحديد ${selCount} مستخدم</span>
                <button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick="App.selectedAdmins.clear(); App.renderAdmins();">✕ إلغاء التحديد</button>
            </div>`
        ];

        const rightToolbarItems = [
            `<select class="mt-select" style="min-width:130px; font-size:11.5px;" onchange="App.adminsRoleFilter=this.value; App.adminsPage=1; App.renderAdmins();">
                <option value="">كل الرتب والأدوار</option>
                ${rolesList.map(r => `<option value="${r.key}" ${this.adminsRoleFilter===r.key?'selected':''}>${r.label}</option>`).join('')}
            </select>`,
            `<select class="mt-select" style="font-size:11.5px;" onchange="App.adminsActiveFilter=this.value; App.adminsPage=1; App.renderAdmins();">
                <option value="" ${this.adminsActiveFilter==='' ? 'selected' : ''}>كل الحالات</option>
                <option value="1" ${this.adminsActiveFilter==='1' ? 'selected' : ''}>🟢 نشط ومفعل</option>
                <option value="0" ${this.adminsActiveFilter==='0' ? 'selected' : ''}>🔴 معطل</option>
            </select>`,
            `<select class="mt-select" style="font-size:11.5px;" onchange="App.adminsBalanceFilter=this.value; App.adminsPage=1; App.renderAdmins();">
                <option value="" ${this.adminsBalanceFilter==='' ? 'selected' : ''}>كل الأرصدة</option>
                <option value="debt" ${this.adminsBalanceFilter==='debt' ? 'selected' : ''}>🔴 مدين (عليه مبالغ)</option>
                <option value="credit" ${this.adminsBalanceFilter==='credit' ? 'selected' : ''}>🟢 دائن (له رصيد)</option>
                <option value="zero" ${this.adminsBalanceFilter==='zero' ? 'selected' : ''}>⚪ رصيد صفر</option>
            </select>`,
            `<select class="mt-select" style="font-size:11.5px; max-width:160px;" onchange="App.adminsParentFilter=this.value; App.adminsPage=1; App.renderAdmins();">
                <option value="">كل الوكلاء المشرفين</option>
                ${allDistributors.map(d => `<option value="${d.id}" ${this.adminsParentFilter==d.id?'selected':''}>التابع لـ: ${d.fullname}</option>`).join('')}
            </select>`,
            `<select class="mt-select" style="font-size:11.5px;" onchange="App.setAdminsLimit(parseInt(this.value))" title="عدد السجلات في الصفحة">
                <option value="25" ${this.adminsLimit==25 ? 'selected' : ''}>25 سطر</option>
                <option value="50" ${this.adminsLimit==50 ? 'selected' : ''}>50 سطر</option>
                <option value="100" ${this.adminsLimit==100 ? 'selected' : ''}>100 سطر</option>
                <option value="250" ${this.adminsLimit==250 ? 'selected' : ''}>250 سطر</option>
            </select>`,
            `<div style="position:relative; display:inline-block;">
                <input type="text" id="adm-search-input" class="mt-input" style="padding-left:28px; width:170px; font-size:11.5px;" placeholder="بحث لحظي..." value="${this.escape(this.adminsSearch)}" oninput="App.onAdminsLiveSearch(this.value)" />
                <span style="position:absolute; left:8px; top:7px; color:var(--text-muted); pointer-events:none; font-size:12px;">🔍</span>
            </div>`,
            (this.adminsSearch || this.adminsRoleFilter || this.adminsActiveFilter || this.adminsBalanceFilter || this.adminsParentFilter) ? `
                <button class="mt-btn mt-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="App.adminsSearch=''; App.adminsRoleFilter=''; App.adminsActiveFilter=''; App.adminsBalanceFilter=''; App.adminsParentFilter=''; App.adminsPage=1; App.renderAdmins();" title="إلغاء كل الفلاتر">✕ تفريغ</button>
            ` : ''
        ];

        // Content rendering
        let contentHtml = '';

        if (currentMode === 'tree') {
            contentHtml = this.renderAdminsHierarchyTree(rawAdmins, allNetworksList, allNetworkNodesList);
        } else if (currentMode === 'by_role') {
            contentHtml = `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
                    ${rolesList.map(r => {
                        const roleAdmins = rawAdmins.filter(a => a.role === r.key);
                        if (roleAdmins.length === 0) return '';
                        const roleDebt = roleAdmins.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
                        return `
                            <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:14px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border-color, #e2e8f0); padding-bottom:8px;">
                                    <b>${r.label}</b>
                                    <span class="badge" style="background:#0284c7; color:#fff; border-radius:4px; padding:2px 8px; font-size:11px;">${roleAdmins.length} مستخدم</span>
                                </div>
                                <div style="font-size:12px; color:var(--text-muted, #64748b); margin-bottom:10px;">
                                    إجمالي المديونيات لهذه الرتبة: <b style="color:#e74c3c;">${App.formatMoney(roleDebt)}</b>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    ${roleAdmins.map(a => `
                                        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--toolbar-bg, #f8fafc); padding:6px 10px; border-radius:5px; font-size:12px;">
                                            <div>
                                                <b>${this.escape(a.fullname)}</b>
                                                <small style="color:var(--text-muted, #64748b); display:block;">@${this.escape(a.username)}</small>
                                            </div>
                                            <div style="text-align:left;">
                                                <b style="color:${parseFloat(a.balance) > 0 ? '#e74c3c' : (parseFloat(a.balance) < 0 ? '#27ae60' : 'inherit')};">${App.formatMoney(a.balance)}</b>
                                                ${(a.role !== 'system_owner' && Number(a.id) !== Number(this.adminId)) || Number(a.id) === Number(this.adminId) ? `
                                                    <button class="mt-btn" style="padding:1px 5px; font-size:10px; margin-right:4px;" onclick="App.showAdminModal(${a.id})" title="تعديل">✏️</button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            // Table view (distributors, staff, or all)
            const tableId = (currentMode === 'distributors') ? 'admins-distributors-table' : ((currentMode === 'staff') ? 'admins-staff-table' : 'admins-all-table');
            contentHtml = `
                <div class="sam-table-container mt-table-container">
                    <table class="sam-table mt-table" id="${tableId}">
                        <thead>
                            <tr>
                                <th style="width:36px; text-align:center;"><input type="checkbox" onchange="App.toggleSelectAllAdmins(this)" /></th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('id')"># ${this.getTableSortIcon(this.adminsSortCol, 'id', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('username')">اسم المستخدم ${this.getTableSortIcon(this.adminsSortCol, 'username', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('fullname')">الاسم الكامل / المحل ${this.getTableSortIcon(this.adminsSortCol, 'fullname', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('phone')">الهاتف ${this.getTableSortIcon(this.adminsSortCol, 'phone', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('role')">الرتبة والدور ${this.getTableSortIcon(this.adminsSortCol, 'role', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('parent_name')">الوكيل المشرف الأب ${this.getTableSortIcon(this.adminsSortCol, 'parent_name', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('balance')">الرصيد المالي ${this.getTableSortIcon(this.adminsSortCol, 'balance', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('credit_limit')">سقف الائتمان ${this.getTableSortIcon(this.adminsSortCol, 'credit_limit', this.adminsSortDir)}</th>
                                <th style="cursor:pointer;" onclick="App.toggleAdminsSort('discount_rate')">نسبة الخصم % ${this.getTableSortIcon(this.adminsSortCol, 'discount_rate', this.adminsSortDir)}</th>
                                <th>كوتة الكروت المجانية</th>
                                <th style="cursor:pointer; text-align:center;" onclick="App.toggleAdminsSort('is_active')">الحالة ${this.getTableSortIcon(this.adminsSortCol, 'is_active', this.adminsSortDir)}</th>
                                <th style="text-align:center;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageData.map((a, idx) => `
                                <tr>
                                    <td style="text-align:center;"><input type="checkbox" class="admin-row-cb" value="${a.id}" ${this.selectedAdmins.has(a.id)?'checked':''} onchange="App.toggleSelectAdmin(${a.id}, this.checked)" /></td>
                                    <td>${paginated.start_index + idx}</td>
                                    <td><b style="font-family:monospace; color:#0284c7;">${this.escape(a.username)}</b></td>
                                    <td><b>${this.escape(a.fullname)}</b></td>
                                    <td><span style="direction:ltr; display:inline-block; font-family:monospace;">${this.escape(a.phone || '-')}</span></td>
                                    <td><span class="status-pill status-online">${this.escape(a.role_name_ar || a.role)}</span></td>
                                    <td>${a.parent_name ? `<span class="badge" style="background:#0284c7; color:#fff; font-weight:600; padding:3px 8px; border-radius:4px; font-size:11px;">👔 ${this.escape(a.parent_name)}</span>` : '<span style="color:#94a3b8; font-size:11px;">— مباشر للإدارة —</span>'}</td>
                                    <td>
                                        <b style="font-size:13px; color:${parseFloat(a.balance) > 0 ? '#e74c3c' : (parseFloat(a.balance) < 0 ? '#27ae60' : 'inherit')};">
                                            ${App.formatMoney(a.balance)}
                                        </b>
                                    </td>
                                    <td>${App.formatMoney(a.credit_limit)}</td>
                                    <td><b>${a.discount_rate || 0}%</b></td>
                                    <td>${a.free_cards_quota ? `<span class="badge" style="background:#8e44ad; color:#fff;">🎁 ${a.free_cards_quota} كرت (${a.free_profile})</span>` : '-'}</td>
                                    <td style="text-align:center;">
                                        <span class="status-pill ${a.is_active ? 'status-active' : 'status-disabled'}">
                                            ${a.is_active ? '🟢 نشط' : '🔴 معطل'}
                                        </span>
                                    </td>
                                    <td style="text-align:center; white-space:nowrap;">
                                        <div style="display:inline-flex; gap:4px; align-items:center;">
                                            ${Number(a.id) === Number(this.adminId) ? `
                                                <button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.cashboxAccountFilter=${a.id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" title="كشف حسابي الخاص">📄 كشف حسابي</button>
                                                ${(this.userRole === 'system_owner' || this.userRole === 'superadmin') ? `<button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAdminModal(${a.id})" title="تعديل بياناتي">✏️ تعديل</button>` : ''}
                                            ` : `
                                                <button class="mt-btn" style="padding:2px 6px; font-size:11px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700;" onclick="App.showInstantBalanceTransferModal('transfer', ${a.id})" title="⚡ تحويل وشحن رصيد فوري للوكيل">⚡ شحن</button>
                                                <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAdminModal(${a.id})" title="تعديل الحساب">✏️ تعديل</button>
                                                <button class="mt-btn mt-btn-success" style="padding:2px 6px; font-size:11px;" onclick="App.showVoucherModal('receipt', ${a.id})" title="سند قبض">💵 قبض</button>
                                                <button class="mt-btn" style="padding:2px 6px; font-size:11px; background:#fef3c7; color:#92400e; border:1px solid #fde68a;" onclick="App.showOpeningDebtModal(${a.id}, '${this.escape(a.fullname)}', ${a.balance || 0})" title="إضافة أو تسوية مديونية سابقة / رصيد افتتاحي">⚖️ مديونية</button>
                                                <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.cashboxAccountFilter=${a.id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" title="كشف حساب">📑 كشف</button>
                                                ${(a.id !== 1 && Number(a.id) !== Number(this.adminId)) ? `<button class="mt-btn mt-btn-danger" style="padding:2px 6px; font-size:11px;" onclick="App.deleteAdminPrompt(${a.id})" title="حذف الحساب">🗑️</button>` : ''}
                                            `}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                            ${pageData.length === 0 ? `
                                <tr><td colspan="13" style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد حسابات مطابقة لمعايير البحث والتصفية</td></tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                ${this.renderTablePaginationBar(paginated, 'App.setAdminsPage', 'App.setAdminsLimit')}
            `;
        }

        const PB = window.SamUI?.PageBuilder;
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        if (PB && typeof PB.renderShell === 'function') {
            mainView.innerHTML = PB.renderShell({
                id: 'admins_agents',
                archetype: 'table',
                eyebrow: 'إدارة الحسابات والوكلاء • ACCESS & GOVERNANCE',
                title: 'المستخدمون والموزعون والوكلاء',
                subtitle: 'إدارة حسابات الموزعين ونقاط البيع، سقوف الائتمان والمديونيات، حسابات المشرفين وشجرة التبعية',
                icon: '👔',
                actions: actions,
                stats: stats,
                toolbar: {
                    left: leftToolbarItems,
                    right: rightToolbarItems
                },
                content: contentHtml
            });
        } else {
            // Fallback rendering
            mainView.innerHTML = `
                <div class="sam-toolbar" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                    <div class="mt-toolbar-left" style="display:flex; gap:6px; align-items:center;">${leftToolbarItems.join('')}</div>
                    <div class="mt-toolbar-right" style="display:flex; gap:6px; align-items:center;">${rightToolbarItems.join('')}</div>
                </div>
                <div class="view-scroll-content" style="flex:1; overflow-y:auto; padding:12px 12px calc(80px + env(safe-area-inset-bottom, 0px)) 12px;">
                    ${contentHtml}
                </div>
            `;
        }

        if (typeof App.organizeMobilePage === 'function') {
            App.organizeMobilePage();
        }
    },
    renderAdminsHierarchyTree(admins = [], networks = [], nodes = []) {

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');
        const isSystemOwner = (this.userRole === 'system_owner');

        const callerNetworkIds = Array.isArray(this.networks)
            ? this.networks.map(n => Number(n.network_id ?? n.id)).filter(Number.isFinite)
            : [];
        const activeNetId = Number(this.activeNetworkId || 0);

        let visibleNetworkIds = null;
        if (isSystemOwner) {
            visibleNetworkIds = activeNetId > 0 ? new Set([activeNetId]) : null;
        } else {
            if (activeNetId > 0) {
                visibleNetworkIds = new Set([activeNetId]);
            } else if (callerNetworkIds.length > 0) {
                visibleNetworkIds = new Set(callerNetworkIds);
            } else {
                visibleNetworkIds = new Set();
            }
        }

        const displayNetworks = visibleNetworkIds
            ? networks.filter(net => visibleNetworkIds.has(Number(net.id)))
            : networks;

        // Group admins by role and parents

        const superadmins = admins.filter(a => ['system_owner', 'superadmin'].includes(a.role));

        const partners = admins.filter(a => a.role === 'partner');

        const distributors = admins.filter(a => a.role === 'distributor');

        const supervisors = admins.filter(a => a.role === 'supervisor');

        const accountants = admins.filter(a => a.role === 'accountant' || a.role === 'finance');

        const posAgents = admins.filter(a => a.role === 'pos_agent');

        const nodeOwners = admins.filter(a => ['regular_node_owner', 'main_node_owner', 'sub_node_owner'].includes(a.role));

        const maintenanceList = admins.filter(a => a.role === 'maintenance' || a.role === 'technician');

        const others = admins.filter(a => !['system_owner', 'superadmin', 'partner', 'distributor', 'supervisor', 'accountant', 'finance', 'pos_agent', 'regular_node_owner', 'main_node_owner', 'sub_node_owner', 'maintenance', 'technician'].includes(a.role));



        // Helper to format money badge

        const renderBalBadge = (bal) => {

            const num = parseFloat(bal) || 0;

            if (num > 0) {

                return `<span class="badge" style="background:#fee2e2; color:#dc2626; font-weight:bold; border:1px solid #fca5a5;">مدين عليه: ${App.formatMoney(num)}</span>`;

            } else if (num < 0) {

                return `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:bold; border:1px solid #86efac;">دائن له: ${App.formatMoney(Math.abs(num))}</span>`;

            }

            return `<span class="badge" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;">رصيد صفر</span>`;

        };



        // Render Single Admin Card

        const renderAdminCard = (adm, levelClass = '', icon = '👤') => {

            const isMe = (Number(adm.id) === Number(this.adminId));

            const subAgents = admins.filter(x => Number(x.parent_id) === Number(adm.id));

            const assignedNodes = nodes.filter(n => Number(n.responsible_admin_id) === Number(adm.id));



            // Parse assigned networks for chips

            let userNets = [];

            if (Array.isArray(adm.network_ids)) {
                userNets = adm.network_ids.map(Number);
            } else if (Array.isArray(adm.allowed_networks)) {

                userNets = adm.allowed_networks;

            } else if (typeof adm.allowed_networks === 'string') {

                try { userNets = JSON.parse(adm.allowed_networks); } catch(e) { userNets = []; }

            }

            const matchingNetworks = displayNetworks.filter(net => userNets.includes(Number(net.id)));



            return `

                <div class="tree-card ${levelClass}" style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:10px 14px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03); transition:all 0.2s ease;">

                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:10px;">

                            <span style="font-size:20px;">${icon}</span>

                            <div>

                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">

                                    <b style="font-size:13.5px; color:#0f172a;">${this.escape(adm.fullname)}</b>

                                    <code style="font-size:11px; background:#f1f5f9; padding:1px 6px; border-radius:4px; color:#475569;">@${this.escape(adm.username)}</code>

                                    ${isMe ? '<span class="badge" style="background:#8b5cf6; color:#fff; font-size:10px;">أنت (حسابك)</span>' : ''}

                                    <span class="status-pill ${adm.is_active ? 'status-active' : 'status-disabled'}" style="font-size:10.5px;">

                                        ${adm.is_active ? '🟢 نشط' : '🔴 معطل'}

                                    </span>

                                </div>

                                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:11.5px; color:#64748b; margin-top:3px;">

                                    <span>${this.escape(adm.role_name_ar || adm.role)}</span>

                                    ${adm.phone ? `<span>•</span> <span>📞 <a href="tel:${this.escape(adm.phone)}" style="color:#0284c7; text-decoration:none;">${this.escape(adm.phone)}</a></span>` : ''}

                                    ${adm.parent_name ? `<span>•</span> <span>👔 المشرف: <b style="color:#0284c7;">${this.escape(adm.parent_name)}</b></span>` : '<span class="badge" style="background:#f0fdf4; color:#15803d; font-size:10px;">👑 مباشر للإدارة</span>'}

                                    ${adm.discount_rate > 0 ? `<span>•</span> <span>خصم: <b>${adm.discount_rate}%</b></span>` : ''}

                                    ${adm.credit_limit > 0 ? `<span>•</span> <span>سقف ائتمان: <b>${App.formatMoney(adm.credit_limit)}</b></span>` : ''}

                                    ${adm.free_cards_quota > 0 ? `<span>•</span> <span style="color:#8e44ad;">🎁 ${adm.free_cards_quota} كرت (${this.escape(adm.free_profile || '')})</span>` : ''}

                                </div>

                                ${matchingNetworks.length > 0 ? `

                                    <div style="display:flex; align-items:center; gap:4px; margin-top:4px; flex-wrap:wrap;">

                                        <span style="font-size:10.5px; color:#64748b;">🏢 الفروع:</span>

                                        ${matchingNetworks.map(n => `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">🏢 ${this.escape(n.name)}</span>`).join('')}

                                    </div>

                                ` : ''}

                            </div>

                        </div>



                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">

                            ${renderBalBadge(adm.balance)}

                            <div style="display:flex; gap:4px; flex-wrap:wrap;">

                                ${isSuperAdmin && ['distributor', 'partner', 'supervisor', 'main_node_owner'].includes(adm.role) ? `

                                    <button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.showAdminModal({ parent_id: ${adm.id}, role: 'pos_agent' })" title="إضافة نقطة بيع تابعة لهذا الموزع">+ إضافة نقطة بيع</button>

                                ` : ''}

                                ${isSuperAdmin && !isMe && adm.role !== 'system_owner' ? `

                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px; background:#f8fafc; border-color:#cbd5e1;" onclick="App.showReassignHierarchyModal(${adm.id})" title="إعادة هيكلة ونقل التبعية وتخصيص الفروع">🔀 نقل التبعية</button>

                                ` : ''}

                                ${isMe ? `

                                    <button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.cashboxAccountFilter=${adm.id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" title="كشف حسابي">📄 كشف حسابي</button>

                                    ${isSuperAdmin ? `<button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAdminModal(${adm.id})" title="تعديل بياناتي">✏️</button>` : ''}

                                ` : adm.role === 'system_owner' ? `

                                    <span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">🔒 حساب المالك محمي</span>

                                ` : `

                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAdminModal(${adm.id})" title="تعديل الحساب">✏️ تعديل</button>

                                    <button class="mt-btn mt-btn-success" style="padding:2px 6px; font-size:11px;" onclick="App.showVoucherModal('receipt', ${adm.id})" title="سند قبض">💵 قبض</button>

                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px; background:#fef3c7; color:#92400e; border:1px solid #fde68a;" onclick="App.showOpeningDebtModal(${adm.id}, '${this.escape(adm.fullname)}', ${adm.balance || 0})" title="إضافة أو تسوية مديونية سابقة / رصيد افتتاحي">⚖️ مديونية</button>

                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.cashboxAccountFilter=${adm.id}; App.cashboxViewMode='statement'; App.switchTab('cashbox_accounts');" title="كشف حساب">📑 كشف</button>

                                `}

                            </div>

                        </div>

                    </div>



                    <!-- Associated Network Nodes Managed by this user -->

                    ${assignedNodes.length > 0 ? `

                        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--border-color, #e2e8f0); display:flex; flex-wrap:wrap; gap:6px; align-items:center;">

                            <span style="font-size:11px; color:#64748b; font-weight:600;">🗼 نقاط وأبراج تحت إشرافه:</span>

                            ${assignedNodes.map(nd => `

                                <span class="badge" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; font-size:11px;">

                                    ${nd.node_type === 'main_node' ? '🗼' : '📡'} ${this.escape(nd.node_name)} <code>(${this.escape(nd.nas_ip)})</code>

                                </span>

                            `).join('')}

                        </div>

                    ` : ''}



                    <!-- Nested Subordinates (POS Agents or Sub-Distributors) -->

                    ${subAgents.length > 0 ? `

                        <div style="margin-top:10px; margin-right:20px; padding-right:12px; border-right:2px solid #38bdf8; display:flex; flex-direction:column; gap:6px;">

                            <div style="font-size:11.5px; font-weight:700; color:#0284c7; display:flex; align-items:center; gap:4px;">

                                <span>↳</span> <span>نقاط البيع والوكلاء التابعين (${subAgents.length}):</span>

                            </div>

                            ${subAgents.map(sub => renderAdminCard(sub, 'tree-child', '🏪')).join('')}

                        </div>

                    ` : ''}

                </div>

            `;

        };



        // Render Networks with Partners & Distribution Points

        const renderNetworkBranch = (net) => {

            const netPartners = (net.partners || []);

            const netNodes = nodes.filter(n => {

                return (net.location && n.location && n.location.includes(net.location)) || (n.node_name && n.node_name.includes(net.name));

            });



            // Find all distributors and agents assigned to this network

            const netAdmins = admins.filter(a => {

                let aNets = [];

                if (Array.isArray(a.network_ids)) aNets = a.network_ids.map(Number);
                else if (Array.isArray(a.allowed_networks)) aNets = a.allowed_networks;

                else if (typeof a.allowed_networks === 'string') {

                    try { aNets = JSON.parse(a.allowed_networks); } catch(e) { aNets = []; }

                }

                return aNets.includes(Number(net.id));

            });



            return `

                <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; margin-bottom:16px; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.02);">

                    <div style="background:linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%); padding:12px 16px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">

                        <div style="display:flex; align-items:center; gap:10px;">

                            <span style="font-size:24px;">🌐</span>

                            <div>

                                <div style="display:flex; align-items:center; gap:8px;">

                                    <b style="font-size:15px; color:#0f172a;">${this.escape(net.name)}</b>

                                    <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">${this.escape(net.code || 'NET')}</span>

                                    <span class="status-pill status-active" style="font-size:10px;">🟢 فرع نشط</span>

                                </div>

                                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">

                                    📍 الموقع: <b>${this.escape(net.location || 'غير محدد')}</b> • 

                                    👥 الشركاء: <b>${netPartners.length}</b> • 

                                    🏢 إجمالي الأصول: <b style="color:#0f172a;">${App.formatMoney(net.total_assets_value || 0)}</b>

                                </div>

                            </div>

                        </div>

                        <div style="display:flex; gap:6px;">

                            ${isSuperAdmin ? `

                                <button class="mt-btn mt-btn-primary" style="padding:4px 10px; font-size:11.5px;" onclick="App.showAdminModal({ allowed_networks: [${net.id}], role: 'distributor' })">➕ إضافة موزع في هذا الفرع</button>

                                <button class="mt-btn" style="padding:4px 10px; font-size:11.5px;" onclick="App.switchTab('networks')">⚙️ إدارة الفرع</button>

                            ` : ''}

                        </div>

                    </div>



                    <div style="padding:14px 16px;">

                        <!-- Partners in this Network -->

                        ${netPartners.length > 0 ? `

                            <div style="margin-bottom:12px;">

                                <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:flex; align-items:center; gap:6px;">

                                    <span>🤝</span> <span>الشركاء والمستثمرون في الفرع:</span>

                                </div>

                                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">

                                    ${netPartners.map(p => `

                                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">

                                            <div>

                                                <b>👤 ${this.escape(p.partner_name)}</b>

                                                <div style="font-size:11px; color:#64748b;">حصة الأرباح: <b style="color:#15803d;">${parseFloat(p.share_percent)}%</b></div>

                                            </div>

                                            <div style="text-align:left;">

                                                <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">${App.formatMoney(p.partner_asset_share_value || 0)}</span>

                                            </div>

                                        </div>

                                    `).join('')}

                                </div>

                            </div>

                        ` : ''}



                        <!-- Related Nodes & Towers under this network -->

                        ${netNodes.length > 0 ? `

                            <div style="margin-top:10px; margin-bottom:10px;">

                                <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:flex; align-items:center; gap:6px;">

                                    <span>🗼</span> <span>الأبراج والمحطات الرئيسية التابعة:</span>

                                </div>

                                <div style="display:flex; flex-wrap:wrap; gap:6px;">

                                    ${netNodes.map(nd => `

                                        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:11.5px; display:flex; align-items:center; gap:6px;">

                                            <span>${nd.node_type === 'main_node' ? '🗼' : '📡'}</span>

                                            <b>${this.escape(nd.node_name)}</b>

                                            <code style="font-size:10px; color:#64748b;">${this.escape(nd.nas_ip)}</code>

                                            ${nd.responsible_display ? `<span class="badge" style="background:#f1f5f9; color:#334155; font-size:10px;">المسؤول: ${this.escape(nd.responsible_display)}</span>` : ''}

                                        </div>

                                    `).join('')}

                                </div>

                            </div>

                        ` : ''}



                        <!-- Active Distributors and Staff in this network -->

                        ${netAdmins.length > 0 ? `

                            <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;">

                                <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px; display:flex; align-items:center; gap:6px;">

                                    <span>🚚</span> <span>الموزعون ونقاط البيع المرتبطة بهذا الفرع (${netAdmins.length}):</span>

                                </div>

                                <div style="display:flex; flex-wrap:wrap; gap:6px;">

                                    ${netAdmins.map(a => `

                                        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:11px; display:flex; align-items:center; gap:6px;">

                                            <span>${a.role === 'distributor' ? '🚚' : '🏪'}</span>

                                            <b>${this.escape(a.fullname)}</b>

                                            <code style="font-size:10px; color:#64748b;">@${this.escape(a.username)}</code>

                                            <button class="mt-btn" style="padding:1px 4px; font-size:10px;" onclick="App.showAdminModal(${a.id})" title="تعديل">✏️</button>

                                        </div>

                                    `).join('')}

                                </div>

                            </div>

                        ` : ''}

                    </div>

                </div>

            `;

        };



        // Root Independent POS Agents (Direct to Superadmin / No Parent)

        const directPosAgents = posAgents.filter(a => !a.parent_id || Number(a.parent_id) === 0);



        return `

            <div class="hierarchy-tree-container" style="display:flex; flex-direction:column; gap:16px;">

                

                <!-- Tree Top Banner & Summary -->

                <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff; border-radius:10px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">

                    <div>

                        <div style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">

                            <span>🌳</span> <span>الهيكل الإداري والشبكي المتكامل (Management & Network Hierarchy)</span>

                        </div>

                        <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">

                            تحكم كامل في بناء وتعديل شجرة التبعية الإدارية، توزيع الفروع والشبكات، وربط نقاط البيع بالموزعين المعتمدين.

                        </div>

                    </div>

                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">

                        ${isSuperAdmin ? `

                            <button class="mt-btn mt-btn-primary" style="font-weight:bold; font-size:12px; padding:6px 14px;" onclick="App.showAdminModal()">➕ إضافة حساب / موزع</button>

                            <button class="mt-btn" style="font-weight:bold; font-size:12px; padding:6px 14px; background:#0284c7; color:#fff; border:none;" onclick="App.switchTab('networks')">🏢 إدارة الفروع والشبكات</button>

                        ` : ''}

                        <button class="mt-btn" style="font-size:12px; padding:6px 12px;" onclick="App.renderAdmins()" title="تحديث الشجرة">🔄 تحديث</button>

                    </div>

                </div>



                <!-- SECTION 1: SUPERADMINS & HEADQUARTERS -->

                <div class="tree-section" style="background:var(--toolbar-bg, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:14px 16px;">

                    <div style="font-weight:800; font-size:14px; color:#0f172a; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">

                        <span style="display:flex; align-items:center; gap:8px;">

                            <span>👑</span> <span>الإدارة العامة والحسابات المركزية (Superadmins & Central Management)</span>

                        </span>

                        ${isSuperAdmin ? `<button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.showAdminModal({ role: 'distributor' })">+ إضافة موزع مباشر</button>` : ''}

                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">

                        ${superadmins.map(adm => renderAdminCard(adm, 'tree-root', '👑')).join('')}

                    </div>

                </div>



                <!-- SECTION 2: NETWORKS & BRANCHES -->

                ${displayNetworks.length > 0 ? `

                    <div class="tree-section" style="background:var(--toolbar-bg, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:14px 16px;">

                        <div style="font-weight:800; font-size:14px; color:#0f172a; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">

                            <span style="display:flex; align-items:center; gap:8px;">

                                <span>🏢</span> <span>الفروع والشبكات التابعة والشراكات الاستثمارية (Networks & Branches)</span>

                            </span>

                            ${isSuperAdmin ? `<button class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.switchTab('networks')">⚙️ إعدادات الشبكات</button>` : ''}

                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px;">

                            ${displayNetworks.map(net => renderNetworkBranch(net)).join('')}

                        </div>

                    </div>

                ` : ''}



                <!-- SECTION 3: DISTRIBUTORS & THEIR SUBORDINATE POS AGENTS -->

                <div class="tree-section" style="background:var(--toolbar-bg, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:14px 16px;">

                    <div style="font-weight:800; font-size:14px; color:#0f172a; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">

                        <span style="display:flex; align-items:center; gap:8px;">

                            <span>🚚</span> <span>شبكة الموزعين المعتمدين ونقاط البيع التابعة لهم (Distributors & POS Agents Network)</span>

                        </span>

                        ${isSuperAdmin ? `<button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.showAdminModal({ role: 'distributor' })">+ موزع جديد</button>` : ''}

                    </div>

                    ${distributors.length > 0 ? `

                        <div style="display:flex; flex-direction:column; gap:8px;">

                            ${distributors.map(dist => renderAdminCard(dist, 'tree-distributor', '🚚')).join('')}

                        </div>

                    ` : `

                        <div style="text-align:center; padding:20px; color:#64748b; font-size:12px;">لا يوجد موزعون مسجلون حالياً</div>

                    `}



                    <!-- Independent POS Agents (Direct to Superadmin) -->

                    ${directPosAgents.length > 0 ? `

                        <div style="margin-top:16px; padding-top:12px; border-top:1px dashed var(--border-color, #e2e8f0);">

                            <div style="font-weight:700; font-size:13px; color:#334155; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">

                                <span style="display:flex; align-items:center; gap:6px;">

                                    <span>🏪</span> <span>نقاط بيع مستقلة (مرتبطة بالإدارة العامة مباشرة دون موزع وسيط):</span>

                                </span>

                                ${isSuperAdmin ? `<button class="mt-btn mt-btn-primary" style="padding:2px 8px; font-size:11px;" onclick="App.showAdminModal({ role: 'pos_agent' })">+ نقطة بيع مستقلة</button>` : ''}

                            </div>

                            <div style="display:flex; flex-direction:column; gap:6px;">

                                ${directPosAgents.map(pos => renderAdminCard(pos, 'tree-direct-pos', '🏪')).join('')}

                            </div>

                        </div>

                    ` : ''}

                </div>



                <!-- SECTION 4: SUPERVISORS, ACCOUNTANTS & TECHNICAL CREW -->

                ${(supervisors.length > 0 || accountants.length > 0 || maintenanceList.length > 0 || nodeOwners.length > 0 || others.length > 0) ? `

                    <div class="tree-section" style="background:var(--toolbar-bg, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:10px; padding:14px 16px;">

                        <div style="font-weight:800; font-size:14px; color:#0f172a; margin-bottom:10px; display:flex; align-items:center; gap:8px;">

                            <span>🛠️</span> <span>الكادر الإشرافي والمحاسبي والفني وملاك النقاط (Supervisors & Operations Crew)</span>

                        </div>

                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:10px;">

                            ${[...supervisors, ...accountants, ...maintenanceList, ...nodeOwners, ...others].map(st => `

                                <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">

                                    <div>

                                        <div style="font-weight:700; font-size:13px; color:#0f172a;">${this.escape(st.fullname)}</div>

                                        <div style="font-size:11px; color:#64748b;">

                                            <code>@${this.escape(st.username)}</code> • ${this.escape(st.role_name_ar || st.role)}

                                        </div>

                                    </div>

                                    <div style="display:flex; align-items:center; gap:6px;">

                                        ${renderBalBadge(st.balance)}

                                        ${isSuperAdmin ? `<button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showReassignHierarchyModal(${st.id})" title="تخصيص الفروع">🔀</button>` : ''}

                                        <button class="mt-btn" style="padding:2px 6px; font-size:11px;" onclick="App.showAdminModal(${st.id})" title="تعديل">✏️</button>

                                    </div>

                                </div>

                            `).join('')}

                        </div>

                    </div>

                ` : ''}



            </div>

        `;

    },



    async showReassignHierarchyModal(adminId) {

        if (!adminId) return;

        const [adminRes, allAdminsRes, rolesRes, networksRes] = await Promise.all([

            this.api('get_admin_details', { id: adminId }),

            this.api('get_admins'),

            this.api('get_roles'),

            this.api('get_networks')

        ]);



        const adm = adminRes?.admin || adminRes;

        if (!adm || !adm.id) {

            this.toast('تعذر جلب بيانات الحساب', 'danger');

            return;

        }



        const rawAllAdmins = Array.isArray(allAdminsRes) ? allAdminsRes : (allAdminsRes?.admins || []);

        const supervisors = rawAllAdmins.filter(a => ['system_owner', 'superadmin', 'partner', 'distributor', 'supervisor', 'main_node_owner'].includes(a.role) && Number(a.id) !== Number(adm.id));

        const rawRoles = (rolesRes?.roles || []).filter(r => r.role_key !== 'system_owner');

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');
        const isSystemOwner = (this.userRole === 'system_owner');
        const canAssignNetworkMemberships = (this.userRole === 'system_owner');
        const allAvailableNetworks = networksRes?.networks || (Array.isArray(networksRes) ? networksRes : []);
        // System owners and superadmins can grant membership in any network. Other
        // callers must only see networks already present in their authenticated network context.
        const callerNetworkIds = Array.isArray(this.networks)
            ? this.networks.map(n => Number(n.network_id ?? n.id)).filter(Number.isFinite)
            : [];
        const visibleNetworkIds = callerNetworkIds.length > 0
            ? new Set(callerNetworkIds)
            : new Set(Number(this.activeNetworkId) > 0 ? [Number(this.activeNetworkId)] : []);
        const availableNetworks = (isSuperAdmin || isSystemOwner)
            ? allAvailableNetworks
            : (visibleNetworkIds.size > 0 ? allAvailableNetworks.filter(net => visibleNetworkIds.has(Number(net.id))) : allAvailableNetworks);



        let assignedNets = [];

        if (Array.isArray(adm.network_ids)) assignedNets = adm.network_ids.map(Number);
        else if (Array.isArray(adm.allowed_networks)) assignedNets = adm.allowed_networks.map(Number);

        else if (typeof adm.allowed_networks === 'string') {

            try { assignedNets = JSON.parse(adm.allowed_networks).map(Number); } catch(e) { assignedNets = []; }

        }



        const roleHierarchyMap = {
            system_owner: 1000,
            superadmin: 100,
            partner: 80,
            accountant: 60,
            finance: 60,
            supervisor: 60,
            main_node_owner: 50,
            distributor: 40,
            sub_node_owner: 30,
            pos_agent: 20,
            regular_node_owner: 20,
            maintenance: 20,
            technician: 20,
            agent: 5,
            vip: 10,
            user: 5
        };
        const myLevel = roleHierarchyMap[this.userRole] || 10;

        const selectableReassignRoles = rawRoles.filter(r => {
            const rKey = r.role_key || r.key;
            if (rKey === 'system_owner') return isSystemOwner;
            if (isSystemOwner) return true;
            const rLevel = roleHierarchyMap[rKey] || 10;
            return rLevel < myLevel;
        });

        const modalHtml = `

        <div class="mt-modal-backdrop" id="reassign-hierarchy-backdrop" onclick="if(event.target===this) document.getElementById('reassign-hierarchy-backdrop').remove()">

            <div class="mt-modal" style="width:620px; max-width:95vw; border-radius:10px;">

                <div class="mt-modal-header" style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#fff;">

                    <span style="font-weight:bold; font-size:14px;">🔀 إعادة هيكلة ونقل التبعية وتخصيص الفروع</span>

                    <span style="cursor:pointer;" onclick="document.getElementById('reassign-hierarchy-backdrop').remove()">✕</span>

                </div>

                <form onsubmit="App.saveReassignHierarchyForm(event, ${adm.id})">

                    <div class="mt-modal-body" style="padding:18px;">

                        

                        <!-- Account Info Card -->

                        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">

                            <div>

                                <b style="font-size:14px; color:#0f172a;">${this.escape(adm.fullname)}</b>

                                <div style="font-size:11.5px; color:#64748b;">

                                    <code>@${this.escape(adm.username)}</code> • الرتبة الحالية: <b>${this.escape(adm.role_name_ar || adm.role)}</b>

                                </div>

                            </div>

                            <span class="badge" style="background:#0284c7; color:#fff; font-size:11px;">ID: #${adm.id}</span>

                        </div>



                        <!-- 1. Change Supervising Parent -->

                        <div class="form-group" style="margin-bottom:14px;">

                            <label style="font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">👔 الوكيل أو المسؤول المشرف المباشر (Parent Supervisor):</label>

                            <select id="reassign-parent" class="mt-select" style="width:100%; font-size:13px;">

                                <option value="">👑 -- بدون وسيط (مباشر للإدارة العامة SuperAdmin) --</option>

                                ${supervisors.map(s => `

                                    <option value="${s.id}" ${Number(adm.parent_id) === Number(s.id) ? 'selected' : ''}>

                                        ${this.escape(s.fullname)} (@${this.escape(s.username)}) - [${this.escape(s.role_name_ar || s.role)}]

                                    </option>

                                `).join('')}

                            </select>

                            <small style="color:#64748b; font-size:11px;">تحديد المشرف يربط هذا الحساب مباشرة تحت الفرع الإداري للمشرف المختار.</small>

                        </div>



                        <!-- 2. Role Adjustment (Optional) -->

                        <div class="form-group" style="margin-bottom:14px;">

                            <label style="font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">🎖️ الرتبة والدور الإداري (Role):</label>

                            <select id="reassign-role" class="mt-select" style="width:100%; font-size:13px;">

                                ${selectableReassignRoles.map(r => `

                                    <option value="${r.role_key}" ${adm.role === r.role_key ? 'selected' : ''}>${this.escape(r.role_name_ar || r.role_key)}</option>

                                `).join('')}

                            </select>

                        </div>



                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="document.getElementById('reassign-hierarchy-backdrop').remove()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:bold; padding:7px 24px;">💾 حفظ التعديلات وتحديث الشجرة</button>

                    </div>

                </form>

            </div>

        </div>

        `;



        const wrapper = document.createElement('div');

        wrapper.innerHTML = modalHtml;

        document.body.appendChild(wrapper.firstElementChild);

    },



    async saveReassignHierarchyForm(e, adminId) {

        e.preventDefault();

        const selectedNets = [];

        document.querySelectorAll('.reassign-net-cb:checked').forEach(c => selectedNets.push(Number(c.value)));



        const payload = {

            id: Number(adminId),

            parent_id: document.getElementById('reassign-parent')?.value ? Number(document.getElementById('reassign-parent').value) : null,

            role: document.getElementById('reassign-role')?.value || undefined,

            data_scope: document.getElementById('reassign-scope')?.value || 'own'

        };

        if (this.userRole === 'system_owner') {
            payload.allowed_networks = selectedNets.length > 0 ? selectedNets : null;
        }



        const res = await this.api('update_admin_hierarchy', payload, 'POST');

        if (res && res.success) {

            this.toast(res.message || '✅ تم تحديث التبعية والهيكل الإداري بنجاح!', 'success');

            document.getElementById('reassign-hierarchy-backdrop')?.remove();

            this.renderAdmins();

        } else {

            this.toast(res?.error || 'تعذر تحديث الهيكل الإداري', 'danger');

        }

    },



    async showAdminModal(data = null) {
        try {
            const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');
            const canAssignNetworkMemberships = (this.userRole === 'system_owner');
            const isDistributor = (this.userRole === 'distributor');
            let requestedAdminId = null;
            let adminData = null;
            let adminFetchPromise = null;

            if (typeof data === 'number' || (typeof data === 'string' && /^\d+$/.test(String(data).trim()))) {
                requestedAdminId = Number(data);
                adminFetchPromise = this.api('get_admin_details', { id: requestedAdminId });
            } else if (data && typeof data === 'object') {
                adminData = data;
            }

            const [distributorsRes, rolesRes, profilesRes, allAdminsRes, networksRes, fetchedAdmin] = await Promise.all([
                this.api('get_admins').catch(() => ({ admins: [] })),
                this.api('get_roles').catch(() => ({ roles: [] })),
                this.api('get_profiles').catch(() => ({ profiles: [] })),
                this.api('get_admins').catch(() => ({ admins: [] })),
                this.api('get_networks').catch(() => ({ networks: [] })),
                adminFetchPromise ? adminFetchPromise.catch(() => null) : Promise.resolve(null)
            ]);

            if (requestedAdminId !== null) {
                const resolvedAdmin = fetchedAdmin?.admin || fetchedAdmin;
                if (!resolvedAdmin?.id) {
                    this.toast(fetchedAdmin?.error || 'تعذر تحميل بيانات الحساب المطلوب', 'danger');
                    return;
                }
                data = resolvedAdmin;
            } else {
                data = adminData;
            }



        const isEdit = Boolean(data?.id);

        const isSelf = isEdit && (Number(data.id) === Number(this.adminId));

        // STRICT ROLE HIERARCHY TREE
        const roleHierarchyMap = {
            system_owner: 1000,
            superadmin: 100,
            partner: 80,
            accountant: 60,
            finance: 60,
            supervisor: 60,
            main_node_owner: 50,
            distributor: 40,
            sub_node_owner: 30,
            pos_agent: 20,
            agent: 5,
            regular_node_owner: 20,
            maintenance: 20,
            technician: 20,
            vip: 10,
            user: 10
        };

        const myLevel = roleHierarchyMap[this.userRole] || 10;
        const targetRole = data?.role;
        const targetLevel = targetRole ? (roleHierarchyMap[targetRole] || 10) : 0;

        if (isEdit && !isSelf && !isSuperAdmin && targetLevel >= myLevel) {
            this.toast('⚠️ لا يمكنك تعديل بيانات حساب ذو رتبة مساوية أو أعلى من رتبتك الإدارية', 'danger');
            return;
        }

        const rawAllAdmins = Array.isArray(distributorsRes) ? distributorsRes : (distributorsRes?.admins || []);

        const distributors = rawAllAdmins.filter(a => ['system_owner', 'superadmin', 'partner', 'distributor', 'supervisor', 'main_node_owner'].includes(a.role));

        const rawRoles = rolesRes?.roles || [];

        const profiles = Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || []);

        const allAdmins = allAdminsRes?.admins || (Array.isArray(allAdminsRes) ? allAdminsRes : []);
        const allAvailableNetworks = networksRes?.networks || (Array.isArray(networksRes) ? networksRes : []);

        const isSystemOwner = (this.userRole === 'system_owner');
        const callerNetworkIds = Array.isArray(this.networks)
            ? this.networks.map(n => Number(n.network_id ?? n.id)).filter(Number.isFinite)
            : [];
        const visibleNetworkIds = callerNetworkIds.length > 0
            ? new Set(callerNetworkIds)
            : new Set(Number(this.activeNetworkId) > 0 ? [Number(this.activeNetworkId)] : []);
        const availableNetworks = (isSystemOwner || isSuperAdmin)
            ? allAvailableNetworks
            : (visibleNetworkIds.size > 0 ? allAvailableNetworks.filter(net => visibleNetworkIds.has(Number(net.id))) : allAvailableNetworks);

        let selectableRoles = rawRoles.filter(r => {
            if (r.role_key === 'system_owner') return isSystemOwner;
            if (isSystemOwner) return true;
            if (isDistributor) return r.role_key === 'pos_agent';
            const roleLevel = roleHierarchyMap[r.role_key] || 10;
            return roleLevel < myLevel;
        });

        if (selectableRoles.length === 0) {
            if (isDistributor) {
                selectableRoles = [{ role_key: 'pos_agent', role_name_ar: 'نقطة بيع الكروت (POS Agent)' }];
            } else {
                const defaultRolesList = [
                    { role_key: 'superadmin', role_name_ar: 'مدير عام (Superadmin)' },
                    { role_key: 'partner', role_name_ar: 'شريك استثماري (Partner)' },
                    { role_key: 'distributor', role_name_ar: 'موزع رئيسي (Distributor)' },
                    { role_key: 'pos_agent', role_name_ar: 'نقطة بيع (POS Agent)' },
                    { role_key: 'accountant', role_name_ar: 'محاسب مالي (Accountant)' },
                    { role_key: 'supervisor', role_name_ar: 'مشرف شبكة (Supervisor)' },
                    { role_key: 'maintenance', role_name_ar: 'فني صيانة (Maintenance)' }
                ];
                selectableRoles = defaultRolesList.filter(r => isSystemOwner || isSuperAdmin || (roleHierarchyMap[r.role_key] || 10) < myLevel);
            }
        }

        let delegatedIds = [];

        if (Array.isArray(data?.delegated_admin_ids)) {
            delegatedIds = data.delegated_admin_ids.map(Number);
        } else if (typeof data?.delegated_admin_ids === 'string') {
            try { delegatedIds = JSON.parse(data.delegated_admin_ids).map(Number); } catch(e) { delegatedIds = []; }
        }

        let assignedNetworks = [];

        if (Array.isArray(data?.network_ids)) {
            assignedNetworks = data.network_ids.map(Number);
        } else if (Array.isArray(data?.allowed_networks)) {
            assignedNetworks = data.allowed_networks.map(Number);
        } else if (typeof data?.allowed_networks === 'string') {
            try { assignedNetworks = JSON.parse(data.allowed_networks).map(Number); } catch(e) { assignedNetworks = []; }
        }

        const currentRole = data?.role || (selectableRoles.length > 0 ? selectableRoles[0].role_key : 'pos_agent');
        const isCreatingDistributor = !isEdit && currentRole === 'distributor';
        const isCreatingAutoCredentialAccount = !isEdit && ['distributor', 'pos_agent'].includes(currentRole);

        let autoUsername = '';
        if (!isEdit) {
            try {
                const userRes = await this.api('get_next_username', { role: currentRole }).catch(() => null);
                autoUsername = userRes?.username || ((currentRole === 'distributor' ? 'dist_' : 'pos_') + Math.floor(1000 + Math.random() * 9000));
            } catch(e) {
                autoUsername = 'user_' + Math.floor(1000 + Math.random() * 9000);
            }
        }



        let modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'modal-container';
            document.body.appendChild(modalContainer);
        }

        modalContainer.innerHTML = `

        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">

            <div class="mt-modal" style="width:${isDistributor ? '600px' : '740px'}; max-height:92vh; overflow-y:auto;">

                <div class="mt-modal-header" style="background:${isSelf ? '#475569' : (isDistributor ? '#059669' : '#0284c7')}; color:#fff;">

                    <span>${isEdit ? (isSelf ? '👤 تعديل ملفك الشخصي' : (isDistributor ? '🏪 تعديل بيانات نقطة البيع' : '✏️ تعديل بيانات المسؤول / الوكيل')) : (isDistributor ? '🏪 ➕ إضافة نقطة بيع تابعة جديدة' : '➕ إضافة حساب / وكيل فرعي جديد')}</span>

                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

                </div>

                <form id="admin-edit-form" data-is-edit="${isEdit ? '1' : '0'}" onsubmit="App.saveAdminForm(event, ${isEdit ? data.id : 'null'})">

                    <div class="mt-modal-body" style="padding:16px;">

                        

                        ${isSelf ? `

                            <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:6px; padding:10px 12px; margin-bottom:14px; color:#9f1239; font-size:12px; display:flex; align-items:center; gap:8px;">

                                <span style="font-size:18px;">🔒</span>

                                <div>

                                    <b>حماية الصلاحيات:</b> أنت تقوم بتعديل حسابك الشخصي. تم قفل حقول الرتبة، ونطاق الرؤية، وسقف الائتمان والخصم لمنع التلاعب وتصعيد الصلاحيات ذاتياً.

                                </div>

                            </div>

                        ` : ''}



                        <div class="form-row">

                            <div class="form-group" style="flex:1;">

                                <label>الاسم الكامل / اسم المحل *</label>

                                <input type="text" id="adm-fullname" class="mt-input" style="width:100%; font-weight:bold;" value="${this.escape(data?.fullname || '')}" placeholder="مثال: سوبرماركت الأمل" required />

                            </div>

                            <div id="adm-username-group" class="form-group" style="flex:1; ${(isEdit && !isSelf) || isCreatingAutoCredentialAccount ? 'display:none;' : ''}">

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">

                                    <label style="margin:0; font-weight:700;">اسم المستخدم (Username) *</label>

                                    ${!isEdit ? '<button type="button" class="mt-btn" style="padding:1px 6px; font-size:10.5px; background:#f0fdf4; color:#16a34a; border-color:#86efac;" onclick="App.generateAdminUsername()">🎲 توليد تلقائي</button>' : ''}

                                </div>

                                <input type="text" id="adm-user" class="mt-input" style="width:100%; font-family:monospace; font-weight:bold;" value="${this.escape(data?.username || autoUsername)}" placeholder="pos_0001" required />

                            </div>

                        </div>



                        <div class="form-row" style="align-items:flex-start;">

                            <div id="adm-password-group" class="form-group" style="flex:1.2; ${(isEdit && !isSelf) || isCreatingAutoCredentialAccount ? 'display:none;' : ''}">

                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">

                                    <label style="font-weight:700; margin:0;">🔒 كلمة المرور ${isEdit ? '(اتركه فارغاً للإبقاء عليها)' : '* (إجبارية)'}</label>

                                    <button type="button" class="mt-btn" style="padding:1px 6px; font-size:10.5px; background:#f0fdf4; color:#16a34a; border-color:#86efac;" onclick="App.generateStrongPassword()">

                                        🎲 توليد كلمة مرور

                                    </button>

                                </div>

                                <div style="display:flex; gap:4px;">

                                    <input type="password" id="adm-pass" class="mt-input" style="width:100%; font-family:monospace; font-size:13px;" placeholder="8+ أحرف، أرقام، رموز" oninput="App.onAdminPasswordInput(this.value)" ${isEdit ? '' : 'required'} />

                                    <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="App.togglePasswordVisibility('adm-pass', this)" title="إظهار/إخفاء كلمة المرور">👁️</button>

                                </div>



                                <!-- Live Strength Meter -->

                                <div style="margin-top:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 8px;">

                                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">

                                        <span>مستوى قوة كلمة المرور:</span>

                                        <b id="pwd-meter-text" style="color:#94a3b8;">لم يتم إدخال كلمة مرور</b>

                                    </div>

                                    <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">

                                        <div id="pwd-meter-bar" style="width:0%; height:100%; background:#94a3b8; transition:all 0.3s ease;"></div>

                                    </div>

                                    <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:10px; margin-top:6px; color:#64748b;">

                                        <span><span id="pwd-chk-len">❌</span> 8 خانات+</span>

                                        <span><span id="pwd-chk-upper">❌</span> حرف كبير</span>

                                        <span><span id="pwd-chk-lower">❌</span> حرف صغير</span>

                                        <span><span id="pwd-chk-num">❌</span> أرقام</span>

                                        <span><span id="pwd-chk-sym">❌</span> رموز خاصّة</span>

                                    </div>

                                </div>

                            </div>



                            <div class="form-group" style="flex:0.8;">

                                <label style="font-weight:700;">الرتبة والدور الإداري *</label>

                                ${isDistributor ? `

                                    <div style="padding:9px 12px; background:#f0fdf4; border:1px solid #86efac; border-radius:6px; color:#15803d; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:6px;">

                                        <span>🏪</span> <span>نقطة بيع الكروت (POS)</span>

                                    </div>

                                    <input type="hidden" id="adm-role" value="pos_agent" />

                                ` : `

                                    <select id="adm-role" class="mt-select" style="width:100%; font-weight:bold;" ${isSelf ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''} onchange="App.onRoleSelectChange(this.value)">

                                        ${selectableRoles.map(r => `<option value="${r.role_key}" ${currentRole === r.role_key ? 'selected' : ''}>${r.role_name_ar || r.role_key}</option>`).join('')}

                                    </select>

                                `}

                            </div>

                        </div>



                        ${!isDistributor ? `

                        <!-- Data Scope Security & Permissions Section -->

                        <div id="adm-data-scope-section" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:12px;">

                            <div class="form-row" style="margin-bottom:0;">

                                <div class="form-group" style="width:100%;">

                                    <label style="font-weight:700; font-size:12px; color:#1e293b;">👁️ نطاق رؤية البيانات في لوحة التحكم (Data Scope):</label>

                                    <select id="adm-data-scope" class="mt-select" style="width:100%; font-size:12px;" ${isSelf ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''} onchange="document.getElementById('adm-delegated-box').style.display = (this.value === 'assigned') ? 'block' : 'none';">

                                        ${isSuperAdmin ? `<option value="all" ${!isCreatingDistributor && data?.data_scope === 'all' ? 'selected' : ''}>🌐 رؤية بيانات كافة الشبكات والمشتركين والموزعين (All - عام)</option>` : ''}

                                        <option value="own" ${(isCreatingDistributor || data?.data_scope === 'own' || !data?.data_scope || (!isSuperAdmin && data?.data_scope === 'all')) ? 'selected' : ''}>👤 رؤية بياناته الخاصة ومشتركيه وعملائه التابعين له فقط (Own Only)</option>

                                        <option value="assigned" ${data?.data_scope === 'assigned' ? 'selected' : ''}>👥 رؤية بيانات موزعين وحسابات محددة بتفويض (Assigned / Delegated)</option>

                                    </select>

                                </div>

                            </div>

                            <div id="adm-delegated-box" style="margin-top:8px; ${data?.data_scope === 'assigned' ? '' : 'display:none;'}">

                                <label style="font-size:11px; font-weight:bold; color:#475569;">حدد الوكلاء المسموح له بإدارتهم:</label>

                                <div style="max-height:120px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:6px; background:#fff; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:6px;">

                                    ${allAdmins.filter(a => !data || a.id != data.id).map(a => `

                                        <label style="display:flex; align-items:center; gap:6px; font-size:11px; background:#f8fafc; padding:4px 6px; border-radius:4px; border:1px solid #e2e8f0; cursor:pointer;">

                                            <input type="checkbox" class="adm-delegated-cb" value="${a.id}" ${delegatedIds.includes(Number(a.id)) ? 'checked' : ''} ${isSelf ? 'disabled' : ''} />

                                            <span>${this.escape(a.fullname)} (@${this.escape(a.username)})</span>

                                        </label>

                                    `).join('')}

                                </div>

                            </div>

                        </div>



                        <!-- Parent Distributor Selection -->

                        <div class="form-row" id="row-parent-dist" style="${!['system_owner', 'superadmin'].includes(currentRole) ? 'display:flex;' : 'display:none;'}">

                            <div class="form-group" style="width:100%;">

                                <label style="font-weight:700;">الوكيل المشرف الأب (Parent Distributor):</label>

                                <select id="adm-parent" class="mt-select" style="width:100%" ${(!isSuperAdmin || isSelf) ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''}>

                                    ${isSuperAdmin ? '<option value="">-- بدون وكيل مشرف (مباشر للإدارة العامة) --</option>' : ''}

                                    ${distributors.map(d => `<option value="${d.id}" ${(data?.parent_id == d.id || (!isSuperAdmin && this.adminId == d.id)) ? 'selected' : ''}>${this.escape(d.fullname)} (@${this.escape(d.username)})</option>`).join('')}

                                </select>

                            </div>

                        </div>



                        <!-- Allowed Networks Section -->
                        <div id="adm-networks-section" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:12px;">
                            <label style="font-weight:700; font-size:12px; color:#1e293b; display:block; margin-bottom:6px;">🌐 الفروع والشبكات المصرح له بالعمل عليها:</label>
                            <div style="max-height:140px; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:6px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:8px;">
                                ${availableNetworks.map(net => {
                                    const netId = Number(net.id);
                                    const isChecked = assignedNetworks.includes(netId) || (!isEdit && (assignedNetworks.length === 0 ? netId === Number(this.activeNetworkId) : false));
                                    const netCode = net.code || ('NET-' + String(netId).padStart(3, '0'));
                                    return `
                                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; padding:6px 8px; border-radius:4px; background:#f8fafc; border:1px solid #e2e8f0;">
                                        <input type="checkbox" class="adm-network-cb" value="${netId}" ${isChecked ? 'checked' : ''} ${isSelf ? 'disabled' : ''} />
                                        <span style="font-weight:600; color:#334155;">${this.escape(net.name || 'الشبكة')} <span style="font-size:11px; color:#64748b; font-weight:normal;">(${this.escape(netCode)})</span></span>
                                    </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>


                        ` : `

                        <input type="hidden" id="adm-data-scope" value="own" />

                        <input type="hidden" id="adm-parent" value="${this.adminId}" />

                        `}



                        <div class="form-row">

                            <div class="form-group" style="flex:1;">

                                <label>نسبة الخصم الممنوحة % (Discount Rate)</label>

                                <input type="number" id="adm-disc" step="0.5" min="0" max="5" class="mt-input" style="width:100%" value="${data?.discount_rate || 0}" ${isSelf ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''} />

                                ${!isSuperAdmin ? `<small style="color:#64748b; font-size:10.5px;">أقصى نسبة مسموح لك بمنحها: ${this.currentAdminDiscountRate || 0}%</small>` : ''}

                            </div>

                            <div class="form-group" style="flex:1;">

                                <label>سقف المديونية الأقصى (${(typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(this._baseCurrency) : 'ر.ي'})</label>

                                <input type="number" id="adm-credit" class="mt-input" style="width:100%" value="${data?.credit_limit || 0}" ${isSelf ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''} />

                            </div>

                            ${!isDistributor ? `

                            <div class="form-group" style="flex:1;">

                                <label>سقف حيازة الكروت (Max Cards Quota)</label>

                                <input type="number" id="adm-max-quota" min="0" class="mt-input" style="width:100%" value="${data?.max_cards_quota || 0}" placeholder="0 = غير محدود" title="أقصى كمية كروت غير مباعة يمكن للموزع/الوكيل حيازتها في عهدته" ${isSelf ? 'disabled style="background:#f1f5f9; color:#64748b;"' : ''} />

                            </div>

                            ` : ''}

                        </div>







                        <div class="form-row">

                            <div class="form-group" style="flex:1; ${isEdit && !isSelf ? 'display:none;' : ''}">

                                <label>رقم الهاتف / الواتساب *</label>

                                <div class="phone-input-group" style="display:flex; direction:ltr; align-items:stretch; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-window);">

    <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:12.5px; padding:0 10px; display:inline-flex; align-items:center; border-right:1px solid #bae6fd; user-select:none; font-family:monospace;">

        🇾🇪 +967

    </span>

    <input type="tel" id="adm-phone" class="mt-input" style="flex:1; border:none; border-radius:0; direction:ltr; font-family:monospace; font-weight:700; font-size:14px; padding:8px 10px;" value="${this.escape((data?.phone || '').replace(/^(?:\+?967|00967|0)+/, ''))}" placeholder="77XXXXXXX (9 أرقام)" inputmode="numeric" autocomplete="tel-national" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" required />

</div>

                                ${isCreatingAutoCredentialAccount ? '<small style="display:block; color:#64748b; font-size:10.5px; margin-top:4px;">تُنشأ بيانات الدخول تلقائيًا وتُرسل إلى رقم واتساب هذا بعد الحفظ.</small>' : ''}

                            </div>

                            <div class="form-group" style="flex:1; ${isEdit && !isSelf ? 'display:none;' : ''}">

                                <label>البريد الإلكتروني</label>

                                <input type="email" id="adm-email" class="mt-input" style="width:100%" value="${this.escape(data?.email || '')}" placeholder="name@example.com" />

                            </div>

                        </div>



                        <!-- Opening Balance / Previous Debt Section -->

                        ${!isEdit ? `

                        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px; margin-bottom:12px;">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">

                                <label style="font-weight:800; font-size:12.5px; color:#166534; display:flex; align-items:center; gap:6px;">

                                    <span>⚖️</span> الرصيد الافتتاحي / المديونية السابقة (اختياري)

                                </label>

                                <span style="font-size:10.5px; background:#bbf7d0; color:#166534; padding:2px 6px; border-radius:4px; font-weight:700;">قيد وسند محاسبي فوري</span>

                            </div>

                            <div class="form-row" style="margin-bottom:0; display:flex; gap:10px;">

                                <div class="form-group" style="flex:1;">

                                    <label style="font-size:11px; font-weight:700; color:#374151;">نوع الرصيد</label>

                                    <select id="adm-opening-type" class="mt-select" style="width:100%; font-weight:700;">

                                        <option value="debt">🔴 مديونية سابقة على الحساب (عليه / مدين)</option>

                                        <option value="credit">🟢 رصيد سابق دائن للحساب (له / دائن)</option>

                                    </select>

                                </div>

                                <div class="form-group" style="flex:1;">

                                    <label style="font-size:11px; font-weight:700; color:#374151;">المبلغ (YER)</label>

                                    <input type="number" id="adm-opening-amount" step="0.01" min="0" class="mt-input" style="width:100%; font-weight:700; color:#dc2626;" placeholder="0.00" />

                                </div>

                            </div>

                            <div class="form-group" style="margin-top:6px; margin-bottom:0;">

                                <label style="font-size:11px; color:#4b5563;">البيان / ملاحظات الرصيد الافتتاحي</label>

                                <input type="text" id="adm-opening-notes" class="mt-input" style="width:100%; font-size:11.5px;" placeholder="مثال: رصيد مديونية سابقة من الدفاتر القديمة" />

                            </div>

                        </div>

                        ` : ''}



                        <div class="form-group">

                            <label>ملاحظات / العنوان</label>

                            <input type="text" id="adm-notes" class="mt-input" style="width:100%" value="${this.escape(data?.notes || '')}" placeholder="المدينة، الشارع، موقع المحل..." />

                        </div>



                        <div class="form-group">

                            <label><input type="checkbox" id="adm-active" ${(!data || data.is_active !== 0) ? 'checked' : ''} ${isSelf ? 'disabled' : ''} /> الحساب مفعّل ونشط (Active)</label>

                        </div>

                    </div>

                    <div class="mt-modal-footer">

                        <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>

                        <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:bold; padding:6px 18px;">${this.t('save')}</button>

                    </div>

                </form>

            </div>

        </div>

        `;

        if (isCreatingAutoCredentialAccount && typeof this.generateStrongPassword === 'function') {
            this.generateStrongPassword();
        }
    } catch (err) {
        console.error('showAdminModal error:', err);
        if (typeof this.toast === 'function') {
            this.toast('⚠️ تعذر فتح نافذة الحساب: ' + (err?.message || err), 'danger');
        }
    }
},



    async generateAdminUsername() {

        const userField = document.getElementById('adm-user');

        const role = document.getElementById('adm-role')?.value || 'pos_agent';

        if (!userField) return;

        try {

            const userRes = await this.api('get_next_username', { role });

            if (userRes?.username) {

                userField.value = userRes.username;

                return;

            }

        } catch(e) {
            console.error('تعذر توليد اسم المستخدم الإداري من الخادم:', e);
            this.toast?.('تعذر الحصول على اسم مستخدم تلقائي؛ تم إنشاء اسم مؤقت.', 'warning');
        }
        const rnd = Math.floor(1000 + Math.random() * 9000);

        userField.value = (role === 'distributor' ? 'dist_' : 'pos_') + rnd;

    },



    async onRoleSelectChange(role) {

        const rowParent = document.getElementById('row-parent-dist');

        if (rowParent) {

            rowParent.style.display = (!['system_owner', 'superadmin'].includes(role)) ? 'flex' : 'none';

        }



        const form = document.getElementById('admin-edit-form');

        const creatingAccount = form?.dataset.isEdit === '0';
        const distributorRole = role === 'distributor';
        const autoCredentialRole = ['distributor', 'pos_agent'].includes(role);
        if (creatingAccount) {
            const usernameGroup = document.getElementById('adm-username-group');
            const passwordGroup = document.getElementById('adm-password-group');
            const scopeSection = document.getElementById('adm-data-scope-section');
            const networkSection = document.getElementById('adm-allowed-networks-section');
            if (usernameGroup) usernameGroup.style.display = autoCredentialRole ? 'none' : '';
            if (passwordGroup) passwordGroup.style.display = autoCredentialRole ? 'none' : '';
            if (scopeSection) scopeSection.style.display = distributorRole ? 'none' : '';
            if (networkSection) networkSection.style.display = distributorRole ? 'none' : '';
            if (distributorRole) {
                const scopeInput = document.getElementById('adm-data-scope');
                if (scopeInput) scopeInput.value = 'own';
                document.querySelectorAll('.adm-delegated-cb:checked').forEach(input => { input.checked = false; });
            }
            const passwordInput = document.getElementById('adm-pass');
            if (autoCredentialRole && !passwordInput?.value && typeof this.generateStrongPassword === 'function') this.generateStrongPassword();
        }

        const usernameInput = document.getElementById('adm-user');

        if (form?.dataset.isEdit === '0' && usernameInput) {

            const userRes = await this.api('get_next_username', { role });

            if (userRes?.username) usernameInput.value = userRes.username;

        }

    },

async saveAdminForm(e, id) {

        e.preventDefault();

        const isSuperAdmin = (this.userRole === 'system_owner' || this.userRole === 'superadmin');

        const delegated = [];

        document.querySelectorAll('.adm-delegated-cb:checked').forEach(c => delegated.push(Number(c.value)));



        const selectedNetworks = [];

        document.querySelectorAll('.adm-network-cb:checked').forEach(c => selectedNetworks.push(Number(c.value)));



        const isEdit = (id && id !== 'null');

        const isSelf = isEdit && (Number(id) === Number(this.adminId));
        const accountRole = document.getElementById('adm-role')?.value || '';

        const roleHierarchyMap = {
            system_owner: 1000,
            superadmin: 100,
            partner: 80,
            accountant: 60,
            finance: 60,
            supervisor: 60,
            main_node_owner: 50,
            distributor: 40,
            sub_node_owner: 30,
            pos_agent: 20,
            agent: 5,
            regular_node_owner: 20,
            maintenance: 20,
            technician: 20,
            vip: 10,
            user: 10
        };

        const myLevel = roleHierarchyMap[this.userRole] || 10;
        const targetLevel = accountRole ? (roleHierarchyMap[accountRole] || 10) : 0;

        if (!isSelf && !isSuperAdmin && targetLevel >= myLevel) {
            this.toast('⚠️ لا يمكنك تعيين أو تعديل حساب برتبة مساوية أو أعلى من رتبتك الإدارية', 'danger');
            return;
        }

        const isCreatingDistributor = !isEdit && accountRole === 'distributor';
        if (isCreatingDistributor) {
            const dataScopeInput = document.getElementById('adm-data-scope');
            if (dataScopeInput) dataScopeInput.value = 'own';
            delegated.length = 0;
        }

        // A new account is local to the active network by default. For an edit,
        // require an explicit non-empty selection (self-edit is the exception
        // because its network checkboxes are disabled and must be preserved).
        if (!isSelf && selectedNetworks.length === 0) {
            if (Number(this.activeNetworkId) > 0) {
                selectedNetworks.push(Number(this.activeNetworkId));
            } else if (Array.isArray(this.networks) && this.networks.length > 0) {
                selectedNetworks.push(Number(this.networks[0].id || this.networks[0].network_id));
            }
        }

        const rawPass = document.getElementById('adm-pass')?.value?.trim() || '';

        // Enforce Strong Password
        if (!isEdit && !rawPass) {
            this.toast('⚠️ يرجى إدخال كلمة المرور', 'warning');
            document.getElementById('adm-pass')?.focus();
            return;
        }

        if (rawPass) {
            const strength = this.checkPasswordStrength(rawPass);
            if (!strength.valid) {
                this.toast('⚠️ كلمة المرور ضعيفة! يجب أن تتكون من 8 خانات على الأقل وتحتوي على أحرف كبيرة (A-Z) وصغيرة (a-z) وأرقام ورموز خاصة (@#$%).', 'danger');
                document.getElementById('adm-pass')?.focus();
                return;
            }
        }

        const discInputVal = document.getElementById('adm-disc') ? (parseFloat(document.getElementById('adm-disc').value) || 0) : 0;
        if (!isSuperAdmin && discInputVal > (this.currentAdminDiscountRate || 0)) {
            this.toast(`⚠️ نسبة الخصم الممنوحة (${discInputVal}%) تتجاوز سقف الخصم المسموح لحسابك (${this.currentAdminDiscountRate || 0}%)!`, 'danger');
            document.getElementById('adm-disc')?.focus();
            return;
        }

        const usernameVal = document.getElementById('adm-user')?.value?.trim() || '';
        const fullnameVal = document.getElementById('adm-fullname')?.value?.trim() || '';

        const phoneField = document.getElementById('adm-phone');
        let rawPhoneDigits = (phoneField?.value || '').replace(/\D/g, '');
        let cleanLocalPhone = rawPhoneDigits;

        if (cleanLocalPhone.startsWith('967') && cleanLocalPhone.length === 12) {
            cleanLocalPhone = cleanLocalPhone.substring(3);
        } else if (cleanLocalPhone.startsWith('00967') && cleanLocalPhone.length === 14) {
            cleanLocalPhone = cleanLocalPhone.substring(5);
        } else if (cleanLocalPhone.startsWith('0') && cleanLocalPhone.length === 10) {
            cleanLocalPhone = cleanLocalPhone.substring(1);
        }

        if (cleanLocalPhone !== '' && !/^(77|78|70|71|73)\d{7}$/.test(cleanLocalPhone)) {
            this.toast('⚠️ أدخل رقم واتساب يمني صحيحاً مكوناً من 9 أرقام يبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)', 'warning');
            phoneField?.focus();
            return;
        }

        const phoneVal = cleanLocalPhone ? ('967' + cleanLocalPhone) : '';



        if (!usernameVal || !fullnameVal) {

            this.toast('⚠️ اسم المستخدم والاسم الكامل مطلوبان', 'warning');

            return;

        }



        const payload = {

            id: isEdit ? Number(id) : null,

            username: usernameVal,

            fullname: fullnameVal,

            password: document.getElementById('adm-pass')?.value || '',

            role: document.getElementById('adm-role') ? document.getElementById('adm-role').value : undefined,

            parent_id: document.getElementById('adm-parent')?.value ? Number(document.getElementById('adm-parent').value) : null,

            discount_rate: discInputVal,

            credit_limit: document.getElementById('adm-credit') ? (parseFloat(document.getElementById('adm-credit').value) || 0) : undefined,

            max_cards_quota: document.getElementById('adm-max-quota') ? parseInt(document.getElementById('adm-max-quota')?.value || '0', 10) : undefined,

            free_profile: document.getElementById('adm-free-profile')?.value || null,

            free_cards_quota: document.getElementById('adm-free-quota') ? parseInt(document.getElementById('adm-free-quota')?.value || '0', 10) : undefined,

            data_scope: isCreatingDistributor ? 'own' : (document.getElementById('adm-data-scope') ? document.getElementById('adm-data-scope').value : 'own'),

            delegated_admin_ids: isCreatingDistributor ? [] : delegated,

            phone: phoneVal,

            email: document.getElementById('adm-email')?.value?.trim() || '',

            notes: document.getElementById('adm-notes')?.value?.trim() || '',

            is_active: document.getElementById('adm-active') ? (document.getElementById('adm-active').checked ? 1 : 0) : 1

        };

        if (!isSelf) {
            const isSystemOwner = (this.userRole === 'system_owner');
            const callerNetworkIds = Array.isArray(this.networks)
                ? this.networks.map(n => Number(n.network_id ?? n.id)).filter(Number.isFinite)
                : [];
            const visibleNetworkIds = callerNetworkIds.length > 0
                ? new Set(callerNetworkIds)
                : new Set(Number(this.activeNetworkId) > 0 ? [Number(this.activeNetworkId)] : []);
            if (!isSystemOwner && selectedNetworks.length > 0) {
                const forbidden = selectedNetworks.filter(nId => !visibleNetworkIds.has(nId));
                if (forbidden.length > 0) {
                    this.toast('⚠️ لا يمكنك تخصيص شبكة أو فرع لا تملك صلاحية وصول عليه', 'danger');
                    return;
                }
            }
            payload.allowed_networks = selectedNetworks;
        }



        payload.system_url = 'http://palapox.ddns.net:8099';

        const res = await this.api('save_admin', payload, 'POST');

        if (res && res.success) {

            const newAdminId = res.id || (!isEdit ? res.admin_id : null);

            const openingAmt = document.getElementById('adm-opening-amount') ? (parseFloat(document.getElementById('adm-opening-amount').value) || 0) : 0;

            if (!isEdit && openingAmt > 0 && newAdminId) {

                try {

                    await this.api('set_account_opening_balance', {

                        admin_id: newAdminId,

                        balance_type: document.getElementById('adm-opening-type')?.value || 'debt',

                        amount: openingAmt,

                        notes: document.getElementById('adm-opening-notes')?.value || 'رصيد افتتاحي / مديونية سابقة عند إنشاء الحساب'

                    }, 'POST');

                } catch(e) {

                    console.error('Error creating opening balance:', e);

                }

            }



            if (!id && res.whatsapp_sent) {

                this.toast(`✅ تم حفظ الحساب (${payload.fullname}) وإرسال بيانات الدخول عبر واتساب بنجاح! 📱`, 'success');

            } else if (!id && res.whatsapp_error) {

                this.toast(`✅ تم حفظ الحساب (⚠️ تعذر إرسال الواتساب: ${res.whatsapp_error})`, 'warning');

            } else {

                this.toast(this.t('success_saved'), 'success');

            }

            this.closeModal();

            this.renderAdmins();

        } else {

            this.toast(res?.error || 'تعذر حفظ المستخدم', 'danger');

        }

    },



    async deleteAdminPrompt(id) {

        return this.deleteAdminUser(id);

    },



    async deleteAdminUser(id) {

        if (!confirm('⚠️ هل أنت متأكد من حذف وإلغاء هذا الحساب؟\n\nتنبيه: يشترط النظام خلو الحساب كلياً من أي مديونيات أو رصيد فوري أو كروت بالمخزون قبل التنفيذ، وسوف يتم إرسال إشعار توثيقي للإدارة والحساب.')) return;

        const res = await this.api('delete_admin', { id }, 'POST');

        if (res && res.success) {

            this.toast(res.message || '✅ تم حذف الحساب بنجاح وتوثيق العملية بالإشعارات', 'success');

            this.renderAdmins();

        } else {

            this.toast(res?.error || 'تعذر حذف الحساب', 'danger');

        }

    },



    // ==========================================

    // 3. WHOLESALE & POS SALES (مبيعات الكروت والجملة)

    // ==========================================

    // ==========================================

    // 3. SALES & INVOICES (المبيعات وعمليات الشراء)

    // ==========================================,



    async renderRolesPermissions() {

        const canManageRoles = !!this.isSystemOwner;

        const [rolesRes, adminsRes] = await Promise.all([

            this.api('get_roles'),

            this.api('get_admins_with_roles')

        ]);

        const roles = rolesRes?.roles || [];

        const admins = adminsRes?.admins || [];



        const scopeLabels = {

            'all': '<span class="badge" style="background:#27ae60; color:#fff;">🌐 كافة بيانات الشبكة</span>',

            'own': '<span class="badge" style="background:#e67e22; color:#fff;">👤 عملياته الخاصة فقط</span>',

            'assigned': '<span class="badge" style="background:#2980b9; color:#fff;">👥 مفوض بفريق محدد</span>',
            'children': '<span class="badge" style="background:#7c3aed; color:#fff;">🌳 المستخدم وأبناؤه</span>',
            'delegated': '<span class="badge" style="background:#0891b2; color:#fff;">🤝 مفوض له</span>',
            'network': '<span class="badge" style="background:#0f766e; color:#fff;">📡 شبكات محددة</span>'

        };



        document.getElementById('main-view').innerHTML = `

        <div class="mt-toolbar">

            <div class="mt-toolbar-left">

                <span style="font-weight:700; font-size:14px; color:#2c3e50;">🛡️ مصفوفة الصلاحيات والرتب ونطاق البيانات (Enterprise RBAC)</span>

                ${canManageRoles ? '<button class="mt-btn mt-btn-primary" onclick="App.showRoleModal()">+ إضافة رتبة جديدة</button>' : '<span class="badge" style="background:#64748b;color:#fff;">👁️ عرض فقط — إدارة الرتب للمالك</span>'}
                <button class="mt-btn" onclick="App.renderPermissionMatrix()">⚙️ مصفوفة RBAC</button>

                <button class="mt-btn" onclick="App.renderRolesPermissions()">⟳ ${this.t('refresh')}</button>

            </div>

            <div class="mt-toolbar-right">

                <span style="font-size:12px; color:var(--text-muted);">إجمالي الرتب: <b>${roles.length}</b> رتبة | المستخدمين: <b>${admins.length}</b> مستخدم</span>

            </div>

        </div>



        <div style="flex:1; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:20px;">

            <!-- Roles Matrix Overview -->

            <section style="background:var(--bg-card, #fff); border-radius:10px; border:1px solid var(--border-color, #e1e8ed); padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">

                    <div>

                        <div style="font-weight:700; font-size:15px; color:#1e293b;">🛡️ قائمة الأدوار والرتب وصلاحيات الوصول</div>

                        <div style="font-size:11px; color:#64748b; margin-top:2px;">يمكنك إنشاء رتب جديدة وتخصيص شاشات وصلاحيات كل رتبة ونطاق رؤية البيانات التلقائي</div>

                    </div>

                    ${canManageRoles ? '<button class="mt-btn mt-btn-primary" style="padding:4px 12px; font-size:12px;" onclick="App.showRoleModal()">+ إنشاء رتبة مخصصة</button>' : '<span class="badge" style="background:#e2e8f0;color:#475569;">الرتب الأساسية محمية، والرتب المخصصة يديرها المالك</span>'}

                </div>

                <div class="mt-table-container">

                    <table class="mt-table">

                        <thead>

                            <tr style="background:#f8f9fa;">

                                <th>رمز الرتبة</th>

                                <th>اسم الرتبة</th>

                                <th>الوصف والمسؤولية</th>

                                <th>نوع الرتبة</th>

                                <th>نطاق البيانات الافتراضي</th>

                                <th>الشاشات والصلاحيات الممنوحة</th>

                                <th>الإجراءات</th>

                            </tr>

                        </thead>

                        <tbody>

                            ${(() => {
                                const customRoles = roles.filter(r => !Number(r.is_system) && r.role_key !== 'system_owner');
                                if (customRoles.length === 0) {
                                    return `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b; font-weight:600;">لا توجد رتب مخصصة مضافة حالياً. الرتب الأساسية بالنظام محمية. يمكنك إضافة رتبة مخصصة بالنقر على زر "+ إنشاء رتبة مخصصة".</td></tr>`;
                                }
                                return customRoles.map(r => `
                                    <tr>
                                        <td><code>${this.escape(r.role_key)}</code></td>
                                        <td><b style="color:#2980b9; font-size:13px;">${this.escape(r.role_name_ar)}</b></td>
                                        <td><small style="color:#64748b;">${this.escape(r.description || '-')}</small></td>
                                        <td><span class="badge" style="background:#8e44ad; color:#fff; font-size:10px;">رتبة مخصصة</span></td>
                                        <td>${scopeLabels[r.default_data_scope] || scopeLabels['own']}</td>
                                        <td>
                                            <div style="max-width:320px; display:flex; flex-wrap:wrap; gap:3px;">
                                                ${r.permissions.includes('*') 
                                                    ? '<span class="badge" style="background:#27ae60; color:#fff; font-weight:700;">★ كامل صلاحيات النظام (Super Admin)</span>'
                                                    : r.permissions.map(p => `<span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-size:10px;">${this.escape(p)}</span>`).join('')}
                                            </div>
                                        </td>
                                        <td style="white-space:nowrap;">
                                            ${canManageRoles ? `<button class="mt-btn" style="padding:3px 8px; font-size:11px;" onclick='App.showRoleModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>✏️ تعديل</button>` : ''}
                                            ${canManageRoles ? `
                                                <button class="mt-btn mt-btn-danger" style="padding:3px 8px; font-size:11px;" onclick="App.deleteRole('${this.escape(r.role_key)}')">🗑️ حذف</button>
                                            ` : ''}
                                        </td>
                                    </tr>
                                `).join('');
                            })()}

                        </tbody>

                    </table>

                </div>

            </section>

                </div>

            </section>

        </div>

        `;

    },



    showRoleModal(role = null) {
        if (!this.isSystemOwner) { this.toast('إدارة الرتب متاحة لمالك النظام فقط', 'warning'); return; }
        if (role && Number(role.is_system) === 1) { this.toast('هذه رتبة أساسية محمية ولا يمكن تعديلها', 'warning'); return; }

        const r = role || {};

        const isEdit = !!role;



        let activePerms = [];

        if (Array.isArray(r.permissions)) {

            activePerms = r.permissions;

        } else if (typeof r.permissions === 'string') {

            try { activePerms = JSON.parse(r.permissions); } catch(e) { activePerms = []; }

        }



        const isSuper = activePerms.includes('*');



        const categoriesHtml = this.permissionCategories.map(cat => `

            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid ${cat.color}22; padding-bottom:6px;">

                    <span style="font-weight:700; font-size:13.5px; color:${cat.color};">${cat.name}</span>

                    <div style="display:flex; gap:4px;">

                        <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.cb-cat-${cat.id}').forEach(c => c.checked=true)">✓ تحديد الكل</button>

                        <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.cb-cat-${cat.id}').forEach(c => c.checked=false)">✕ إلغاء</button>

                    </div>

                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px;">

                    ${cat.items.map(item => {

                        const isChecked = isSuper || activePerms.includes(item.id);

                        return `

                            <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; background:#f8fafc; padding:7px 10px; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.background='#eef2f6'" onmouseout="this.style.background='#f8fafc'">

                                <input type="checkbox" class="role-perm-cb cb-cat-${cat.id}" value="${item.id}" ${isChecked ? 'checked' : ''} style="margin-top:2px;" />

                                <div>

                                    <div style="font-weight:700; color:#1e293b;">${item.name}</div>

                                    <div style="font-size:10.5px; color:#64748b; margin-top:1px;">${item.desc}</div>

                                </div>

                            </label>

                        `;

                    }).join('')}

                </div>

            </div>

        `).join('');



        this.openModal(`

            <div style="font-weight:bold; font-size:16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">

                <span>${isEdit ? '✏️ تعديل الرتبة ومصفوفة الصلاحيات الشاملة' : '🛡️ إنشاء رتبة / دور جديد للنظام مع الصلاحيات'}</span>

                <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>

            </div>

            <form onsubmit="App.saveRoleForm(event)" style="display:flex; flex-direction:column; gap:12px;">

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">

                    <div>

                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">رمز الرتبة بالإنجليزية (Role Key) *</label>

                        <input type="text" id="role-key" class="mt-input" style="width:100%; direction:ltr;" required value="${this.escape(r.role_key || '')}" ${isEdit ? 'readonly style="background:#f1f2f6;"' : ''} placeholder="مثال: branch_manager" />

                    </div>

                    <div>

                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">اسم الرتبة بالعربية *</label>

                        <input type="text" id="role-name-ar" class="mt-input" style="width:100%;" required value="${this.escape(r.role_name_ar || '')}" placeholder="مثال: مدير فرع / مسؤول مالي" />

                    </div>

                </div>



                <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px;">

                    <div>

                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">الوصف والمسؤوليات:</label>

                        <input type="text" id="role-desc" class="mt-input" style="width:100%;" value="${this.escape(r.description || '')}" placeholder="وصف مهام هذا الدور ومسؤولياته" />

                    </div>

                    <div>

                        <label style="display:block; font-size:12px; margin-bottom:4px; font-weight:700;">نطاق البيانات الافتراضي:</label>

                        <select id="role-data-scope" class="mt-input" style="width:100%;">

                            <option value="all" ${r.default_data_scope === 'all' ? 'selected' : ''}>🌐 كافة بيانات الشبكة (All)</option>

                            <option value="own" ${(!r.default_data_scope || r.default_data_scope === 'own') ? 'selected' : ''}>👤 عملياته الخاصة فقط (Own)</option>

                            <option value="assigned" ${r.default_data_scope === 'assigned' ? 'selected' : ''}>👥 مفوض بفريق محدد (Assigned)</option>

                            <option value="children" ${r.default_data_scope === 'children' ? 'selected' : ''}>🌳 المستخدم وجميع التابعين له (Children)</option>

                            <option value="delegated" ${r.default_data_scope === 'delegated' ? 'selected' : ''}>🤝 حسابات مفوضة صراحة (Delegated)</option>

                            <option value="network" ${r.default_data_scope === 'network' ? 'selected' : ''}>📡 الشبكات المسموح بها (Network)</option>

                        </select>

                    </div>

                </div>



                <!-- Presets Bar -->

                <div style="background:#f1f5f9; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">

                    <span style="font-size:12px; font-weight:700; color:#334155;">⚡ قوالب صلاحيات جاهزة:</span>

                    <div style="display:flex; gap:4px; flex-wrap:wrap;">

                        <button type="button" class="mt-btn mt-btn-success" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.role-perm-cb').forEach(c => c.checked=true)">🌟 تحديد كل النظام</button>

                        <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.role-perm-cb').forEach(c => c.checked=false); document.querySelectorAll('.cb-cat-cards_users, .cb-cat-sales_warehouse').forEach(c => c.checked=true);">🛒 كروت ومبيعات</button>

                        <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.role-perm-cb').forEach(c => c.checked=false); document.querySelectorAll('.cb-cat-network_infrastructure').forEach(c => c.checked=true);">📡 شبكة وصيانة</button>

                        <button type="button" class="mt-btn" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.role-perm-cb').forEach(c => c.checked=false); document.querySelectorAll('.cb-cat-finance_accounting').forEach(c => c.checked=true);">💰 مالية ومحاسبة</button>

                        <button type="button" class="mt-btn mt-btn-danger" style="padding:2px 8px; font-size:11px;" onclick="document.querySelectorAll('.role-perm-cb').forEach(c => c.checked=false)">🚫 إلغاء الكل</button>

                    </div>

                </div>



                <!-- Categorized Permissions Matrix -->

                <div style="max-height:420px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; padding:10px; background:#f8fafc;">

                    ${categoriesHtml}

                </div>



                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px; border-top:1px solid #e2e8f0; padding-top:10px;">

                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>

                    <button type="submit" class="mt-btn mt-btn-primary" style="padding:6px 18px; font-weight:700;">💾 حفظ الرتبة ومصفوفة الصلاحيات</button>

                </div>

            </form>

        `, '920px');

    },



    async saveRoleForm(e) {

        e.preventDefault();
        if (!this.isSystemOwner) { this.toast('إدارة الرتب متاحة لمالك النظام فقط', 'warning'); return; }

        const perms = [];

        document.querySelectorAll('.role-perm-cb:checked').forEach(cb => perms.push(cb.value));



        const payload = {

            role_key: document.getElementById('role-key').value.trim(),

            role_name_ar: document.getElementById('role-name-ar').value.trim(),

            description: document.getElementById('role-desc').value.trim(),

            default_data_scope: document.getElementById('role-data-scope')?.value || 'own',

            permissions: perms

        };



        const res = await this.api('save_role', payload, 'POST');

        if (res && res.success) {

            this.toast(res.message || 'تم حفظ الرتبة بنجاح', 'success');

            this.closeModal();

            this.renderRolesPermissions();

        } else {

            this.toast(res?.error || 'تعذر حفظ الرتبة', 'danger');

        }

    },



    async deleteRole(roleKey) {

        if (!this.isSystemOwner) { this.toast('حذف الرتب متاح لمالك النظام فقط', 'warning'); return; }

        if (!confirm(`هل تريد بالتأكيد حذف الرتبة (${roleKey})؟`)) return;

        const res = await this.api('delete_role', { role_key: roleKey }, 'POST');

        if (res && res.success) {

            this.toast(res.message || 'تم حذف الرتبة بنجاح', 'success');

            this.renderRolesPermissions();

        } else {

            this.toast(res?.error || 'تعذر حذف الرتبة', 'danger');

        }

    },





    async showGrantFreeVouchersForAdmin(adminId) {

        const [adminsRes, profilesRes] = await Promise.all([

            this.api('get_admins_with_roles'),

            this.api('get_profiles')

        ]);

        const admins = adminsRes?.admins || [];

        const profiles = profilesRes || [];

        const target = admins.find(a => String(a.id) === String(adminId));



        this.showGrantFreeVouchersModal(admins, profiles);



        setTimeout(() => {

            const recSel = document.getElementById('fv-recipient');

            if (recSel && target) {

                recSel.value = target.id;

                this.onRecipientSelected(target.id, admins);

                if (target.free_profile) {

                    const profSel = document.getElementById('fv-profile');

                    if (profSel) profSel.value = target.free_profile;

                }

                if (target.free_cards_quota && target.free_cards_quota > 0) {

                    const cntInput = document.getElementById('fv-count');

                    if (cntInput) cntInput.value = target.free_cards_quota;

                }

            }

        }, 100);

    },





        // ==========================================

    // MIKROTIK NEIGHBORS DISCOVERY & SYNC ENGINE

    // ==========================================

    async testRouterApi(nasId) {

        const user = document.getElementById('nas-api-user')?.value || 'admin';

        const pass = document.getElementById('nas-api-pass')?.value || '';

        const port = document.getElementById('nas-api-control-port')?.value || 8728;



        this.toast('جاري فحص اتصال API بالراوتر...', 'info');

        const res = await this.api('test_router_api', { id: nasId, api_user: user, api_password: pass, api_port: port }, 'POST');

        if (res && res.success) {

            alert(`✅ تم الاتصال براوتر ميكروتك بنجاح!\n\nاسم الراوتر: ${res.identity}\nإصدار النظام: ${res.version}\nنوع المعالج/البورد: ${res.platform}\nمدة التشغيل: ${res.uptime}\nاستهلاك المعالج: ${res.cpu_load}\nالذاكرة الحرة: ${res.free_memory}`);

        } else {

            alert(`❌ فشل الاتصال براوتر ميكروتك عبر API:\n${res?.error || 'يرجى التأكد من تشغيل /ip service enable api في الميكروتك وصحة كلمة المرور'}`);

        }

    },



    async showMikrotikNeighborsModal(defaultRouterId = null) {

        this.openModal(`

            <div style="padding:25px; text-align:center;">

                <i class="fas fa-spinner fa-spin"></i> جاري تجهيز مستكشف جيران ميكروتك...

            </div>

        `, '980px');



        const [routersRes, adminsRes] = await Promise.all([

            this.api('get_routers'),

            this.api('get_admins_with_roles')

        ]);

        const routers = routersRes || [];

        const admins = adminsRes?.admins || [];



        this.cachedNeighborsList = [];

        this.currentNeighborsRouterId = defaultRouterId || (routers[0]?.id || 0);



        this.renderNeighborsModalContent(routers, admins, 'api');

    },


    async showOpeningDebtModal(adminId, fullname = '', currentBalance = 0) {
        if (!adminId) return;

        if (!fullname) {
            const res = await this.api('get_admin_details', { id: adminId });
            const adm = res?.admin || res;
            fullname = adm?.fullname || 'الحساب';
            currentBalance = adm?.balance || 0;
        }

        const baseSym = this.getCurrencySymbol(this._baseCurrency || 'YER_SANAA');
        const formattedBal = this.formatMoney(Math.abs(currentBalance));
        const balLabel = currentBalance > 0 ? '(مديونية سابقة عليه)' : (currentBalance < 0 ? '(رصيد مسبق له)' : '(مصفّر)');

        const currenciesList = [
            { code: 'YER_SANAA', name: 'ريال يمني (قديم/صنعاء)', symbol: 'ر.ي' },
            { code: 'YER_ADEN', name: 'ريال يمني (جديد/عدن)', symbol: 'ر.ي' },
            { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
            { code: 'USD', name: 'دولار أمريكي', symbol: '$' }
        ];

        let modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'modal-container';
            document.body.appendChild(modalContainer);
        }

        modalContainer.innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:540px;">
                <div class="mt-modal-header" style="background:#b45309; color:#fff;">
                    <span>⚖️ إثبات مديونية سابقة / تسوية رصيد افتتاحي</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <form onsubmit="App.saveOpeningDebtForm(event, ${adminId})">
                    <div class="mt-modal-body" style="padding:16px;">
                        <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:12.5px; color:#92400e;">
                            <div style="font-size:13px; font-weight:800; color:#78350f;">👤 الحساب المستهدف: ${this.escape(fullname)}</div>
                            <div style="margin-top:3px;">⚖️ <b>الرصيد الحالي بالمحفظة:</b> <b style="font-size:14px; color:${currentBalance > 0 ? '#dc2626' : (currentBalance < 0 ? '#16a34a' : '#475569')};">${formattedBal} ${balLabel}</b></div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:700; font-size:12px;">نوع حركة الرصيد *</label>
                                <select id="debt-type" class="mt-select" style="width:100%; font-weight:700;">
                                    <option value="debt">🔴 مديونية سابقة على الحساب (عليه / مدين)</option>
                                    <option value="credit">🟢 رصيد سابق دائن للحساب (له / دائن)</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:700; font-size:12px;">العملة *</label>
                                <select id="debt-currency" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onOpeningDebtCurrencyChange(this.value)">
                                    ${currenciesList.map(c => `<option value="${c.code}" ${c.code === (this._baseCurrency || 'YER_SANAA') ? 'selected' : ''}>${c.name} (${c.symbol})</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom:12px;">
                            <label id="lbl-debt-amount" style="font-weight:700; font-size:12px;">مبلغ الرصيد / المديونية (${baseSym}) *</label>
                            <input type="number" id="debt-amount" step="0.01" min="1" class="mt-input" style="width:100%; font-size:16px; font-weight:800; color:#b45309;" placeholder="مثال: 337500" oninput="App.onOpeningDebtAmountInput(this.value)" required />
                            <div id="debt-currency-conv-hint" style="font-size:11px; color:#64748b; margin-top:4px;"></div>
                        </div>

                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="font-weight:700; font-size:12px;">تاريخ إثبات الحركة *</label>
                            <input type="date" id="debt-date" class="mt-input" style="width:100%; font-weight:bold;" value="${new Date().toISOString().split('T')[0]}" required />
                        </div>

                        <div class="form-group" style="margin-bottom:0;">
                            <label style="font-weight:700; font-size:12px;">البيان والتفاصيل (التوثيق المحاسبي) *</label>
                            <input type="text" id="debt-notes" class="mt-input" style="width:100%; font-weight:bold;" value="تسجيل مديونية سابقة مثبتة على الحساب" placeholder="اكتب ملاحظات أو بيان المديونية السابقة..." required />
                        </div>
                    </div>

                    <div class="mt-modal-footer" style="padding:12px 16px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between;">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-warning" style="font-weight:800; background:#b45309; color:#fff; border:none; padding:8px 18px;">💾 حفظ وإثبات المديونية</button>
                    </div>
                </form>
            </div>
        </div>
        `;
    },

    async saveOpeningDebtForm(e, adminId) {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('debt-amount')?.value) || 0;
        if (amount <= 0) {
            this.toast('⚠️ يرجى إدخال مبلغ مديونية صحيح أكبر من الصفر', 'warning');
            return;
        }

        const balanceType = document.getElementById('debt-type')?.value || 'debt';
        const currencyCode = document.getElementById('debt-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const dateVal = document.getElementById('debt-date')?.value || new Date().toISOString().split('T')[0];
        const notesVal = document.getElementById('debt-notes')?.value?.trim() || '';

        this.toast('جاري تسجيل الحركة المحاسبية وتعديل المديونية السابقة...', 'info');

        const res = await this.api('set_account_opening_balance', {
            admin_id: adminId,
            balance_type: balanceType,
            currency_code: currencyCode,
            amount: amount,
            date: dateVal,
            notes: notesVal
        });

        if (res && (res.success || res.message)) {
            this.toast(res.message || '✅ تم تسجيل المديونية وتحديث رصيد الحساب بنجاح', 'success');
            this.closeModal();
            if (typeof this.loadAdmins === 'function') this.loadAdmins();
            else if (typeof this.renderAdmins === 'function') this.renderAdmins();
            else location.reload();
        } else if (res && res.error) {
            this.toast(res.error, 'danger');
        }
    },

    onOpeningDebtCurrencyChange(code) {
        const sym = this.getCurrencySymbol(code);
        const lbl = document.getElementById('lbl-debt-amount');
        if (lbl) lbl.textContent = `مبلغ الرصيد / المديونية (${sym}) *`;
        this.onOpeningDebtAmountInput(document.getElementById('debt-amount')?.value || 0);
    },

    onOpeningDebtAmountInput(val) {
        const amount = parseFloat(val) || 0;
        const code = document.getElementById('debt-currency')?.value || this._baseCurrency || 'YER_SANAA';
        const rate = this.getCurrencyRate(code);
        const isBase = (code === (this._baseCurrency || 'YER_SANAA') || rate === 1.0);
        const hint = document.getElementById('debt-currency-conv-hint');
        if (hint) {
            if (!isBase && amount > 0) {
                const baseAmount = amount * rate;
                const baseSym = this.getCurrencySymbol(this._baseCurrency || 'YER_SANAA');
                hint.innerHTML = `💱 القيد المحاسبي بالأساس: <b>${this.formatMoney(baseAmount)} ${baseSym}</b> (سعر الصرف بتاريخه: ${rate})`;
            } else {
                hint.innerHTML = '';
            }
        }
    },

    async showNodeOwnerModal(adminDataOrId = {}) {
        let defaultData = {};
        if (typeof adminDataOrId === 'number' || typeof adminDataOrId === 'string') {
            try {
                const fetched = await this.api('get_admin', { id: adminDataOrId });
                defaultData = fetched?.admin || fetched || {};
            } catch (e) {
                this.toast('تعذر تحميل بيانات المسؤول', 'danger');
                return;
            }
        } else if (adminDataOrId && typeof adminDataOrId === 'object') {
            defaultData = adminDataOrId;
        }

        const isEdit = Boolean(defaultData?.id);
        const [distributorsRes, nodesRes] = await Promise.all([
            this.api('get_distributors'),
            this.api('get_network_nodes')
        ]);

        const rawAllAdmins = Array.isArray(distributorsRes) ? distributorsRes : (distributorsRes?.admins || distributorsRes?.data || []);
        const supervisors = rawAllAdmins.filter(a => ['system_owner', 'superadmin', 'partner', 'distributor', 'supervisor', 'main_node_owner'].includes(a.role));
        const nodes = nodesRes?.nodes || (Array.isArray(nodesRes) ? nodesRes : []);

        const selectedRole = defaultData?.role || 'main_node_owner';
        const selectedParentId = defaultData?.parent_id || this.adminId;
        const selectedNodeId = defaultData?.linked_node_id || defaultData?.node_id || '';

        // Extract address from notes if present
        let extractedAddress = defaultData?.address || '';
        let extractedNotes = defaultData?.notes || '';
        if (!extractedAddress && extractedNotes.includes('العنوان:')) {
            const m = extractedNotes.match(/العنوان:\s*([^|]+)(?:\s*\|\s*(.*))?/s);
            if (m) {
                extractedAddress = (m[1] || '').trim();
                extractedNotes = (m[2] || '').trim();
            }
        }

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>📡</span> ${isEdit ? 'تعديل بيانات مسؤول النقطة' : 'إضافة مسؤول نقطة جديد (أساسي / فرعي / عادي)'}
                </span>
                <span style="cursor:pointer; font-size:18px; color:#e0f2fe;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.saveNodeOwnerForm(event, ${isEdit ? defaultData.id : 'null'})">
                <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto;">
                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 14px; margin-bottom:16px; font-size:12.5px; color:#0369a1; line-height:1.6;">
                        💡 <b>إضافة مبسطة لمسؤول النقطة:</b><br/>
                        نموذج مخصص لا يتطلب اسم مستخدم أو كلمة مرور أو بريد إلكتروني أو نطاق رؤية بيانات. يتم حفظ مسؤول النقطة وربطه بالوكيل المشرف وبالنقطة مباشرة.
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">نوع المسؤول (الرتبة) *</label>
                            <select id="node-owner-role" class="mt-input" style="width:100%; font-weight:700;" required>
                                <option value="main_node_owner" ${selectedRole === 'main_node_owner' ? 'selected' : ''}>🗼 مسؤول نقطة أساسي (Main Node Owner)</option>
                                <option value="sub_node_owner" ${selectedRole === 'sub_node_owner' ? 'selected' : ''}>📡 مسؤول نقطة فرعي (Sub Node Owner)</option>
                                <option value="regular_node_owner" ${selectedRole === 'regular_node_owner' ? 'selected' : ''}>📶 مسؤول نقطة عادي (Regular Node Owner)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">الوكيل المشرف الأب (Parent Distributor) *</label>
                            <select id="node-owner-parent" class="mt-input" style="width:100%; font-weight:700;" required>
                                ${supervisors.length === 0 ? `
                                    <option value="${this.adminId}">حسابي الحالي (${this.escape(this.adminName || 'المدير')})</option>
                                ` : supervisors.map(s => `
                                    <option value="${s.id}" ${Number(s.id) === Number(selectedParentId) ? 'selected' : ''}>
                                        ${this.escape(s.fullname || s.username)} (${s.role_name || s.role || 'مشرف'})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">اسم مسؤول النقطة الكامل *</label>
                            <input type="text" id="node-owner-fullname" class="mt-input" style="width:100%; font-weight:700;" placeholder="مثال: يحيى مسعد - مسؤول نقطة الريماس" value="${this.escape(defaultData?.fullname || '')}" required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">رقم الهاتف / الواتساب *</label>
                            <input type="tel" id="node-owner-phone" class="mt-input" style="width:100%; direction:ltr; text-align:left; font-family:monospace; font-weight:700;" placeholder="77XXXXXXX" maxlength="12" value="${this.escape(defaultData?.phone || '')}" oninput="App.onPhoneInputAutoFormat(this)" required />
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">العنوان / المنطقة</label>
                            <input type="text" id="node-owner-address" class="mt-input" style="width:100%;" placeholder="مثال: صنعاء - شارع حدة - عمارة الأمل" value="${this.escape(extractedAddress)}" />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">ربط بنقطة شبكة (اختياري)</label>
                            <select id="node-owner-node" class="mt-input" style="width:100%;">
                                <option value="">-- بدون ربط الآن (أو اختر نقطة للربط) --</option>
                                ${nodes.map(n => `
                                    <option value="${n.id}" ${Number(n.id) === Number(selectedNodeId) || Number(n.responsible_admin_id) === Number(defaultData?.id) ? 'selected' : ''}>
                                        ${n.node_type === 'main_node' ? '🗼' : '📡'} ${this.escape(n.node_name)} (${this.escape(n.nas_ip)}${n.nas_port_id ? ':' + this.escape(n.nas_port_id) : ''})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">ملاحظات إضافية</label>
                        <textarea id="node-owner-notes" class="mt-input" style="width:100%; height:60px; resize:vertical;" placeholder="أي تفاصيل أو ملاحظات خاصة بالمسؤول أو النقطة...">${this.escape(extractedNotes)}</textarea>
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" style="padding:8px 16px; font-weight:700;" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" id="btn-save-node-owner" class="mt-btn mt-btn-primary" style="padding:8px 20px; font-weight:800; background:#0284c7; border:none;">
                        💾 ${isEdit ? 'تحديث البيانات' : 'حفظ وإنشاء مسؤول النقطة'}
                    </button>
                </div>
            </form>
        `);
    },

    async saveNodeOwnerForm(e, editId = null) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-node-owner');
        if (btn) { btn.disabled = true; btn.innerText = '⏳ جاري الحفظ...'; }

        try {
            const payload = {
                id: editId || null,
                role: document.getElementById('node-owner-role').value,
                parent_id: document.getElementById('node-owner-parent').value,
                fullname: document.getElementById('node-owner-fullname').value.trim(),
                phone: document.getElementById('node-owner-phone').value.trim(),
                address: document.getElementById('node-owner-address')?.value?.trim() || '',
                linked_node_id: document.getElementById('node-owner-node')?.value || '',
                notes: document.getElementById('node-owner-notes')?.value?.trim() || ''
            };

            const res = await this.api('save_node_responsible', payload, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم حفظ مسؤول النقطة بنجاح', 'success');
                this.closeModal();
                if (typeof this.renderAdmins === 'function') {
                    this.renderAdmins();
                }
                if (typeof this.renderNetworkNodes === 'function' && document.getElementById('nd-nodes-table')) {
                    this.renderNetworkNodes();
                }
            } else {
                this.toast(res?.error || 'تعذر حفظ مسؤول النقطة', 'danger');
            }
        } catch (err) {
            this.toast(err.message || 'حدث خطأ أثناء حفظ مسؤول النقطة', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 حفظ مسؤول النقطة'; }
        }
    },

});
