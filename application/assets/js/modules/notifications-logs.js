/**
 * SAM User Manager — Notifications, WhatsApp/Telegram Triggers & Audit Logs
 */
'use strict';

Object.assign(window.App, {
    async renderLogs() {
        const mainView = document.getElementById('main-view');
        if (!mainView) return;

        mainView.innerHTML = `
            <div style="padding:40px; text-align:center; color:#64748b;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px; color:#3b82f6;"></i>
                <div style="margin-top:10px; font-weight:600;">جاري جلب وتحديث السجلات...</div>
            </div>
        `;

        if (this.logsActiveTab === 'activity') {
            await this.renderActivityLogsView(mainView);
        } else {
            await this.renderAuthLogsView(mainView);
        }
    },

    async renderAuthLogsView(mainView) {
        const res = await this.api('get_auth_logs', {
            page: this.logsPage,
            limit: this.logsLimit || 50,
            search: this.logsSearch,
            reply: this.logsReplyFilter
        }) || { logs: [], total: 0, total_pages: 1 };

        const logs = res.logs || res.data || [];
        const total = res.total || 0;
        const totalPages = res.total_pages || 1;

        const actions = [];
        if (this.userRole === 'system_owner' || this.userRole === 'superadmin') {
            actions.push({
                label: 'تفريغ السجلات',
                icon: '🧹',
                variant: 'danger',
                onclick: 'App.promptClearAuthLogs()',
                title: 'مسح وتفريغ سجلات الدخول القديمة'
            });
        }
        actions.push({
            label: 'تحديث السجل',
            icon: '⟳',
            variant: 'primary',
            onclick: 'App.renderLogs()'
        });

        const acceptCount = logs.filter(l => l.reply === 'Access-Accept').length;
        const rejectCount = logs.filter(l => l.reply === 'Access-Reject').length;

        const tableHtml = `
        <div class="mt-table-container" style="flex:1;">
            <table class="mt-table">
                <thead>
                    <tr>
                        <th style="width:60px;">#</th>
                        <th>اسم المستخدم / الكرت</th>
                        <th style="width:180px;">النتيجة والحالة</th>
                        <th>كلمة المرور / الرمز المستخدم</th>
                        <th>تاريخ ووقت محاولة المصادقة</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map((l, idx) => `
                        <tr>
                            <td><b>${((this.logsPage - 1) * (this.logsLimit || 50)) + idx + 1}</b></td>
                            <td><b style="color:#0284c7; font-family:monospace; font-size:13px;">${this.escape(l.username)}</b></td>
                            <td>
                                <span class="status-pill ${l.reply === 'Access-Accept' ? 'status-active' : 'status-disabled'}" style="font-size:11.5px; font-weight:700; padding:3px 10px;">
                                    ${l.reply === 'Access-Accept' ? '🟢 قبول (Access-Accept)' : '🔴 رفض (Access-Reject)'}
                                </span>
                            </td>
                            <td style="font-family:monospace; color:#64748b;">${this.escape(l.pass || '-')}</td>
                            <td style="font-size:12px; color:#475569; direction:ltr; text-align:right;">
                                🕒 ${this.escape(l.authdate)}
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">لا توجد سجلات مطابقة للبحث أو الفلتر</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="mt-pagination">
            <span style="font-size:12px; color:var(--text-muted);">إجمالي محاولات المصادقة: <b>${total.toLocaleString()}</b></span>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="mt-btn" ${this.logsPage <= 1 ? 'disabled' : ''} onclick="App.logsPage--; App.renderLogs()">◀ السابق</button>
                <span style="padding:4px 10px; font-weight:bold; font-size:12px;">صفحة ${this.logsPage} من ${totalPages}</span>
                <button class="mt-btn" ${this.logsPage >= totalPages ? 'disabled' : ''} onclick="App.logsPage++; App.renderLogs()">التالي ▶</button>
            </div>
        </div>`;

        const shellOpts = {
            id: 'auth-logs',
            archetype: 'table',
            icon: '🔐',
            title: 'سجلات المصادقة (RADIUS Auth Logs)',
            eyebrow: 'سجلات وأمان النظام',
            subtitle: `مراقبة محاولات تسجيل الدخول والاتصال عبر RADIUS (${total.toLocaleString()} محاولة)`,
            actions: actions,
            stats: [
                { label: 'إجمالي محاولات المصادقة', value: total.toLocaleString(), icon: '📋', tone: 'blue' },
                { label: 'محاولات مقبولة (Accept)', value: acceptCount, icon: '🟢', tone: 'green', meta: 'في هذه الصفحة' },
                { label: 'محاولات مرفوضة (Reject)', value: rejectCount, icon: '🔴', tone: 'red', meta: 'في هذه الصفحة' },
                { label: 'الصفحة الحالية', value: `${this.logsPage} / ${totalPages}`, icon: '📄', tone: 'indigo' }
            ],
            toolbar: {
                left: [
                    `<div style="display:flex; background:#e2e8f0; padding:2px; border-radius:8px; margin-left:8px;">
                        <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:3px 10px; border-radius:6px;" onclick="App.logsActiveTab='auth'; App.logsPage=1; App.renderLogs()">
                            🔐 سجلات المصادقة (RADIUS Auth)
                        </button>
                        <button class="mt-btn" style="font-size:11.5px; padding:3px 10px; border-radius:6px; background:transparent; border:none;" onclick="App.logsActiveTab='activity'; App.logsPage=1; App.renderLogs()">
                            🛡️ سجل العمليات الإدارية (Audit Trail)
                        </button>
                    </div>`,
                    `<input type="text" placeholder="🔍 بحث بالكرت أو الرمز..." class="mt-input" style="max-width:210px; font-size:12px;" value="${this.escape(this.logsSearch)}" onkeydown="if(event.key==='Enter'){ App.logsSearch=this.value; App.logsPage=1; App.renderLogs(); }" oninput="if(this.value===''){ App.logsSearch=''; App.logsPage=1; App.renderLogs(); }" />`,
                    `<select class="mt-select" style="font-size:12px;" onchange="App.logsReplyFilter=this.value; App.logsPage=1; App.renderLogs()">
                        <option value="" ${this.logsReplyFilter==='' ? 'selected' : ''}>كل نتائج المصادقة</option>
                        <option value="Access-Accept" ${this.logsReplyFilter==='Access-Accept' ? 'selected' : ''}>🟢 قبول (Access-Accept)</option>
                        <option value="Access-Reject" ${this.logsReplyFilter==='Access-Reject' ? 'selected' : ''}>🔴 رفض (Access-Reject)</option>
                    </select>`,
                    `<select class="mt-select" style="font-size:12px;" onchange="App.logsLimit=parseInt(this.value); App.logsPage=1; App.renderLogs()">
                        <option value="25" ${this.logsLimit===25 ? 'selected' : ''}>25 سطر</option>
                        <option value="50" ${this.logsLimit===50 ? 'selected' : ''}>50 سطر</option>
                        <option value="100" ${this.logsLimit===100 ? 'selected' : ''}>100 سطر</option>
                        <option value="200" ${this.logsLimit===200 ? 'selected' : ''}>200 سطر</option>
                    </select>`
                ],
                right: []
            },
            content: tableHtml
        };

        if (window.SamUI?.PageBuilder) {
            mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            mainView.innerHTML = `
            <div class="mt-toolbar" style="flex-wrap:wrap; gap:10px;">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div style="display:flex; background:#e2e8f0; padding:2px; border-radius:8px; margin-left:8px;">
                        <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:3px 10px; border-radius:6px;" onclick="App.logsActiveTab='auth'; App.logsPage=1; App.renderLogs()">
                            🔐 سجلات المصادقة
                        </button>
                        <button class="mt-btn" style="font-size:11.5px; padding:3px 10px; border-radius:6px; background:transparent; border:none;" onclick="App.logsActiveTab='activity'; App.logsPage=1; App.renderLogs()">
                            🛡️ سجل العمليات الإدارية
                        </button>
                    </div>
                </div>
                <div class="mt-toolbar-right" style="display:flex; gap:6px; align-items:center;">
                    <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:4px 12px;" onclick="App.renderLogs()">⟳ تحديث السجل</button>
                </div>
            </div>
            ${tableHtml}`;
        }
    },

    async renderActivityLogsView(mainView) {
        const res = await this.api('get_activity_logs', {
            page: this.logsPage,
            limit: this.logsLimit || 50,
            search: this.logsSearch,
            category: this.logsCategoryFilter
        }) || { logs: [], total: 0, total_pages: 1 };

        const logs = res.logs || [];
        const total = res.total || 0;
        const totalPages = res.total_pages || 1;

        const categoryLabels = {
            system: '⚙️ نظام',
            sales: '🛒 مبيعات',
            finance: '💰 مالية',
            cards: '🎫 كروت',
            auth: '🔑 أمان',
            voucher: '📑 سندات'
        };

        const successCount = logs.filter(l => l.status === 'success').length;
        const failedCount = logs.filter(l => l.status === 'failed').length;

        const tableHtml = `
        <div class="mt-table-container" style="flex:1;">
            <table class="mt-table">
                <thead>
                    <tr>
                        <th style="width:60px;">#</th>
                        <th>المسؤول / المنفذ</th>
                        <th>العملية والتصنيف</th>
                        <th>التفاصيل والملاحظات</th>
                        <th>عنوان IP</th>
                        <th style="width:100px;">الحالة</th>
                        <th>التاريخ والوقت</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map((l, idx) => `
                        <tr>
                            <td><b>${((this.logsPage - 1) * (this.logsLimit || 50)) + idx + 1}</b></td>
                            <td><b style="color:#0f172a;">${this.escape(l.admin_name || 'النظام')}</b></td>
                            <td>
                                <div style="font-weight:700; color:#1e293b; font-size:12.5px;">${this.escape(l.action_title || l.action_type)}</div>
                                <span style="font-size:10.5px; color:#64748b;">${categoryLabels[l.action_category] || l.action_category || 'عام'}</span>
                            </td>
                            <td style="font-size:12px; color:#475569; max-width:300px; word-break:break-word;">
                                ${this.escape(typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || '-'))}
                            </td>
                            <td style="direction:ltr; text-align:left; font-family:monospace; font-size:11.5px;">${this.escape(l.ip_address || '-')}</td>
                            <td>
                                <span class="badge" style="background:${l.status === 'success' ? '#10b981' : (l.status === 'failed' ? '#ef4444' : '#f59e0b')}; color:#fff; font-size:10px; padding:2px 7px; border-radius:10px;">
                                    ${l.status === 'success' ? 'ناجح' : (l.status === 'failed' ? 'فاشل' : l.status)}
                                </span>
                            </td>
                            <td style="font-size:11.5px; color:#64748b; direction:ltr; text-align:right;">
                                🕒 ${this.escape(l.created_at)}
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">لا توجد أنشطة مسجلة</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="mt-pagination">
            <span style="font-size:12px; color:var(--text-muted);">إجمالي العمليات المسجلة: <b>${total.toLocaleString()}</b></span>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="mt-btn" ${this.logsPage <= 1 ? 'disabled' : ''} onclick="App.logsPage--; App.renderLogs()">◀ السابق</button>
                <span style="padding:4px 10px; font-weight:bold; font-size:12px;">صفحة ${this.logsPage} من ${totalPages}</span>
                <button class="mt-btn" ${this.logsPage >= totalPages ? 'disabled' : ''} onclick="App.logsPage++; App.renderLogs()">التالي ▶</button>
            </div>
        </div>`;

        const shellOpts = {
            id: 'activity-logs',
            archetype: 'table',
            icon: '🛡️',
            title: 'سجل العمليات الإدارية (Audit Trail)',
            eyebrow: 'سجلات الرقابة والنظام',
            subtitle: `تتبع كافة إجراءات المشرفين والمديرين على النظام (${total.toLocaleString()} عملية مسجلة)`,
            actions: [
                { label: 'تصدير CSV', icon: '📥', variant: 'secondary', onclick: "window.open('api.php?action=export_activity_logs', '_blank')", title: 'تحميل السجل كملف Excel/CSV' },
                { label: 'تحديث', icon: '⟳', variant: 'primary', onclick: 'App.renderLogs()' }
            ],
            stats: [
                { label: 'إجمالي العمليات المسجلة', value: total.toLocaleString(), icon: '🛡️', tone: 'blue' },
                { label: 'عمليات ناجحة', value: successCount, icon: '🟢', tone: 'green', meta: 'في هذه الصفحة' },
                { label: 'عمليات فاشلة / مرفوضة', value: failedCount, icon: '🔴', tone: 'red', meta: 'في هذه الصفحة' },
                { label: 'الصفحة الحالية', value: `${this.logsPage} / ${totalPages}`, icon: '📄', tone: 'indigo' }
            ],
            toolbar: {
                left: [
                    `<div style="display:flex; background:#e2e8f0; padding:2px; border-radius:8px; margin-left:8px;">
                        <button class="mt-btn" style="font-size:11.5px; padding:3px 10px; border-radius:6px; background:transparent; border:none;" onclick="App.logsActiveTab='auth'; App.logsPage=1; App.renderLogs()">
                            🔐 سجلات المصادقة (RADIUS Auth)
                        </button>
                        <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:3px 10px; border-radius:6px;" onclick="App.logsActiveTab='activity'; App.logsPage=1; App.renderLogs()">
                            🛡️ سجل العمليات الإدارية (Audit Trail)
                        </button>
                    </div>`,
                    `<input type="text" placeholder="🔍 بحث بالمسؤول، الإجراء، أو IP..." class="mt-input" style="max-width:210px; font-size:12px;" value="${this.escape(this.logsSearch)}" onkeydown="if(event.key==='Enter'){ App.logsSearch=this.value; App.logsPage=1; App.renderLogs(); }" oninput="if(this.value===''){ App.logsSearch=''; App.logsPage=1; App.renderLogs(); }" />`,
                    `<select class="mt-select" style="font-size:12px;" onchange="App.logsCategoryFilter=this.value; App.logsPage=1; App.renderLogs()">
                        <option value="" ${this.logsCategoryFilter==='' ? 'selected' : ''}>كل التصنيفات</option>
                        <option value="system" ${this.logsCategoryFilter==='system' ? 'selected' : ''}>⚙️ النظام والتهيئة</option>
                        <option value="sales" ${this.logsCategoryFilter==='sales' ? 'selected' : ''}>🛒 المبيعات والفواتير</option>
                        <option value="finance" ${this.logsCategoryFilter==='finance' ? 'selected' : ''}>💰 المحاسبة والسندات</option>
                        <option value="cards" ${this.logsCategoryFilter==='cards' ? 'selected' : ''}>🎫 الكروت والمخازن</option>
                    </select>`,
                    `<select class="mt-select" style="font-size:12px;" onchange="App.logsLimit=parseInt(this.value); App.logsPage=1; App.renderLogs()">
                        <option value="25" ${this.logsLimit===25 ? 'selected' : ''}>25 سطر</option>
                        <option value="50" ${this.logsLimit===50 ? 'selected' : ''}>50 سطر</option>
                        <option value="100" ${this.logsLimit===100 ? 'selected' : ''}>100 سطر</option>
                    </select>`
                ],
                right: []
            },
            content: tableHtml
        };

        if (window.SamUI?.PageBuilder) {
            mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
        } else {
            mainView.innerHTML = `
            <div class="mt-toolbar" style="flex-wrap:wrap; gap:10px;">
                <div class="mt-toolbar-left" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div style="display:flex; background:#e2e8f0; padding:2px; border-radius:8px; margin-left:8px;">
                        <button class="mt-btn" style="font-size:11.5px; padding:3px 10px; border-radius:6px; background:transparent; border:none;" onclick="App.logsActiveTab='auth'; App.logsPage=1; App.renderLogs()">
                            🔐 سجلات المصادقة
                        </button>
                        <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:3px 10px; border-radius:6px;" onclick="App.logsActiveTab='activity'; App.logsPage=1; App.renderLogs()">
                            🛡️ سجل العمليات الإدارية
                        </button>
                    </div>
                </div>
                <div class="mt-toolbar-right" style="display:flex; gap:6px; align-items:center;">
                    <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:4px 12px;" onclick="App.renderLogs()">⟳ تحديث</button>
                </div>
            </div>
            ${tableHtml}`;
        }
    },

    async promptClearAuthLogs() {
        if (!confirm('هل أنت متأكد من تفريغ ومسح سجلات المصادقة والدخول بالكامل؟')) return;
        try {
            const res = await this.api('clear_auth_logs', {}, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم مسح سجلات المصادقة بنجاح ✓', 'success');
                this.logsPage = 1;
                this.renderLogs();
            } else {
                this.toast(res?.error || 'تعذر مسح السجلات', 'danger');
            }
        } catch(e) {
            this.toast('تعذر تنفيذ العملية', 'danger');
        }
    },
    // ==========================================
    // NETWORK NODES MODAL HELPERS (إضافة وتعديل وحذف النقاط مع الخريطة والمنافذ)
    // ==========================================
    async showAddNodeModal(arg1 = null, arg2 = '', arg3 = '') {
        let nodeData = null;
        if (typeof arg1 === 'object' && arg1 !== null) {
            nodeData = arg1;
        } else if (typeof arg1 === 'number' || (typeof arg1 === 'string' && arg1 !== '' && !isNaN(arg1))) {
            nodeData = { parent_id: Number(arg1), node_type: 'sub_node', nas_ip: arg2 || '' };
        } else {
            nodeData = { node_type: 'main_node', nas_ip: arg2 || '', nas_port_id: arg3 || '' };
        }

        const isEdit = Boolean(nodeData && nodeData.id);
        const nodeId = nodeData?.id || '';
        const nodeType = nodeData?.node_type || (nodeData?.parent_id ? 'sub_node' : 'main_node');
        const parentId = nodeData?.parent_id || '';
        const nodeName = nodeData?.node_name || '';
        const displayName = nodeData?.display_name || '';
        const nasPortId = nodeData?.nas_port_id || '';
        const respAdminId = nodeData?.responsible_admin_id || '';
        const location = nodeData?.location || '';
        const coordinates = nodeData?.coordinates || '';
        const notes = nodeData?.notes || '';
        const isActive = (nodeData?.is_active !== undefined) ? Number(nodeData.is_active) : 1;

        const routers = await this.api('get_routers') || [];
        const admins = await this.api('get_admins') || [];
        const allNodesRes = await this.api('get_network_nodes') || {};
        const allNodes = allNodesRes.nodes || [];
        const mainNodes = allNodes.filter(n => n.node_type === 'main_node' && (!nodeId || n.id != nodeId));

        const nasIp = nodeData?.nas_ip || (routers[0]?.nasname || '');
        const portsRes = await this.api('get_router_ports', { nas: nasIp }) || {};
        const ports = portsRes.ports || [];

        const isCustomPort = nasPortId && !ports.some(p => p.name === nasPortId);

        const modalTitle = isEdit 
            ? `✏️ تعديل بيانات نقطة الشبكة: [${this.escape(nodeName)}]`
            : (nodeType === 'sub_node' ? `➕ إضافة نقطة فرعية جديدة (Sub Node)` : `➕ إضافة نقطة شبكة رئيسية جديدة (Main Node)`);

        this.openModal(`
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 20px; border-radius:12px 12px 0 0;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:15px;">
                    <span>${isEdit ? '✏️' : '➕'}</span>
                    <span>${modalTitle}</span>
                </div>
                <button class="close-btn" onclick="App.closeModal()" style="color:#94a3b8; font-size:18px; cursor:pointer; background:none; border:none;">✕</button>
            </div>
            <form onsubmit="App.saveNetworkNodeForm(event)">
                <div class="mt-modal-body" style="padding:18px 22px; max-height:78vh; overflow-y:auto;">
                    <input type="hidden" name="id" value="${nodeId}" />

                    <!-- نوع النقطة والربط بالأساسية -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:14px;">
                        <div class="form-row" style="margin-bottom:0;">
                            <div class="form-group" style="flex:1;">
                                <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:block;">نوع النقطة:</label>
                                <select name="node_type" id="node-type-select" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onNodeTypeChange(this.value)">
                                    <option value="main_node" ${nodeType === 'main_node' ? 'selected' : ''}>🗼 نقطة رئيسية / أساسية (Main Node)</option>
                                    <option value="sub_node" ${nodeType === 'sub_node' ? 'selected' : ''}>📡 نقطة فرعية تابعة لنقطة أخرى (Sub Node)</option>
                                </select>
                            </div>
                            <div class="form-group" id="node-parent-container" style="flex:1.5; display:${nodeType === 'sub_node' ? 'block' : 'none'};">
                                <label style="font-weight:700; color:#0369a1; margin-bottom:6px; display:block;">🔗 النقطة الرئيسية التابعة لها (Parent Node):</label>
                                <select name="parent_id" id="node-parent-select" class="mt-select" style="width:100%; border-color:#38bdf8;">
                                    <option value="">-- اختر النقطة الرئيسية --</option>
                                    ${mainNodes.map(mn => `
                                        <option value="${mn.id}" ${mn.id == parentId ? 'selected' : ''}>
                                            🗼 ${this.escape(mn.node_name)} ${mn.display_name ? `[🏷️ ${this.escape(mn.display_name)}]` : ''} - (${this.escape(mn.nas_ip)})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- الراوتر والمنفذ السيكتور -->
                    <div class="form-row" style="margin-bottom:12px;">
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:block;">الراوتر التابع له:</label>
                            <select name="nas_ip" id="node-nas-ip-select" class="mt-select" style="width:100%" required onchange="App.onNodeRouterChange(this.value)">
                                ${routers.map(r => `
                                    <option value="${r.nasname}" ${r.nasname === nasIp ? 'selected' : ''}>
                                        ${this.escape(r.shortname || r.nasname)} (${this.escape(r.nasname)})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="flex:1.2;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                <span>🔌 اسم المنفذ / السيكتور (Interface):</span>
                                <small id="node-ports-status-badge" style="font-size:10px; color:#0284c7; font-weight:600;">(قائمة المنافذ المتاحة)</small>
                            </label>
                            <select id="node-port-select" class="mt-select" style="width:100%; margin-bottom:6px;" onchange="App.onNodePortSelectChange(this)">
                                <option value="">-- اختر المنفذ من الراوتر --</option>
                                ${ports.map(p => `
                                    <option value="${this.escape(p.name)}" ${p.name === nasPortId ? 'selected' : ''}>
                                        ${this.escape(p.label || p.name)}
                                    </option>
                                `).join('')}
                                <option value="__custom__" ${isCustomPort ? 'selected' : ''}>✏️ إدخال اسم منفذ مخصص يدوي...</option>
                            </select>
                            <input type="text" name="nas_port_id" id="node-port-id-input" class="mt-input" style="width:100%; font-family:monospace; font-weight:700; ${isCustomPort ? 'display:block;' : 'display:none;'}" value="${this.escape(nasPortId)}" placeholder="e.g. ether3 أو bridge1 أو SAM-15-AMAR" required />
                        </div>
                    </div>

                    <!-- الاسمين: الاسم في النظام والاسم الظاهر للمستخدمين -->
                    <div class="form-row" style="margin-bottom:12px;">
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:block;">
                                🏷️ الاسم الوارد في النظام (System Name): <span style="color:#ef4444;">*</span>
                            </label>
                            <input type="text" name="node_name" class="mt-input" style="width:100%; font-weight:700;" value="${this.escape(nodeName)}" placeholder="e.g. برج السلام - Sector 1 Main / SW-01" required />
                            <small style="font-size:11px; color:#64748b; margin-top:2px; display:block;">الاسم الفني الداخلي في النظام للتعريف والإدارة والتقارير</small>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700; color:#0369a1; margin-bottom:6px; display:block;">
                                👥 الاسم الظاهر للمستخدمين (Display Name):
                            </label>
                            <input type="text" name="display_name" class="mt-input" style="width:100%; font-weight:700; border-color:#38bdf8;" value="${this.escape(displayName)}" placeholder="e.g. شبكة السلام - حارة النور / نقطة الكورنيش" />
                            <small style="font-size:11px; color:#0284c7; font-weight:600; margin-top:2px; display:block;">الاسم المعروض للعملاء والمشتركين وعلى خرائط التغطية</small>
                        </div>
                    </div>

                    <!-- المسؤول والموقع الجغرافي نصياً -->
                    <div class="form-row" style="margin-bottom:12px;">
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                <span>المسؤول عن النقطة:</span>
                                <a href="javascript:void(0)" style="font-size:11px; color:#0284c7; font-weight:700; text-decoration:none;" onclick="App.showNodeOwnerModal({ linked_node_id: '${nodeId}' })">➕ إضافة مسؤول جديد</a>
                            </label>
                            <select name="responsible_admin_id" class="mt-select" style="width:100%">
                                <option value="">بدون تعيين</option>
                                ${admins.map(a => `
                                    <option value="${a.id}" ${a.id == respAdminId ? 'selected' : ''}>
                                        ${this.escape(a.fullname || a.username)} (${this.escape(a.username)})${a.phone ? ` - 📱 ${this.escape(a.phone)}` : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:block;">الموقع الجغرافي (الوصف النصي):</label>
                            <input type="text" name="location" id="node-location-input" class="mt-input" style="width:100%" value="${this.escape(location)}" placeholder="e.g. برج السلام - الدور الرابع - السطح" />
                        </div>
                    </div>

                    <!-- تحديد الإحداثيات وتحديد المكان من الخريطة -->
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                            <label style="font-weight:700; color:#166534; font-size:13px;">
                                📍 تحديد الإحداثيات والمكان على الخريطة (GPS Coordinates):
                            </label>
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; font-size:11px; padding:4px 10px;" onclick="App.getNodeCurrentLocation()">
                                    🎯 موقعي الحالي
                                </button>
                                <button type="button" class="mt-btn" style="background:#16a34a; color:#fff; font-size:11px; padding:4px 10px;" onclick="App.toggleNodeMapPicker()">
                                    🗺️ فتح الخريطة التفاعلية
                                </button>
                            </div>
                        </div>
                        <input type="text" name="coordinates" id="node-coordinates-input" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-weight:700;" value="${this.escape(coordinates)}" placeholder="15.369445, 44.191007 (Latitude, Longitude)" oninput="App.onNodeCoordinatesManualInput(this.value)" />
                        
                        <!-- Leaflet Interactive Map Container -->
                        <div id="node-map-picker-wrapper" style="display:none; margin-top:10px; border:2px solid #16a34a; border-radius:8px; overflow:hidden; background:#fff;">
                            <div id="node-leaflet-map-canvas" style="height:260px; width:100%; background:#f8fafc;"></div>
                            <div style="padding:6px 12px; background:#f0fdf4; display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#166534; border-top:1px solid #bbf7d0;">
                                <span>💡 انقر على أي موقع على الخريطة أو اسحب المؤشر لتحديد الموقع بدقة</span>
                                <span id="node-map-coords-badge" style="font-family:monospace; font-weight:700; color:#0f766e;"></span>
                            </div>
                        </div>
                    </div>

                    <!-- ملاحظات وحالة الخدمة -->
                    <div class="form-row" style="margin-bottom:0;">
                        <div class="form-group" style="flex:2;">
                            <label style="font-weight:700; color:#1e293b; margin-bottom:6px; display:block;">ملاحظات إضافية / تفاصيل فنية:</label>
                            <input type="text" name="notes" class="mt-input" style="width:100%" value="${this.escape(notes)}" placeholder="e.g. سويتش 8 بورت POE + بطارية 200A" />
                        </div>
                        <div class="form-group" style="flex:1; display:flex; align-items:center; margin-top:24px;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#1e293b;">
                                <input type="checkbox" name="is_active" value="1" ${isActive ? 'checked' : ''} style="width:18px; height:18px; accent-color:#0284c7;" />
                                <span>النقطة مفعلة بالخدمة</span>
                            </label>
                        </div>
                    </div>

                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:800; padding:8px 22px;">
                        💾 ${isEdit ? 'حفظ تعديلات النقطة' : 'حفظ وإضافة النقطة'}
                    </button>
                </div>
            </form>
        `);

        if (coordinates) {
            const badge = document.getElementById('node-map-coords-badge');
            if (badge) badge.innerText = coordinates;
        }
    },

    onNodeTypeChange(type) {
        const parentCont = document.getElementById('node-parent-container');
        if (!parentCont) return;
        if (type === 'sub_node') {
            parentCont.style.display = 'block';
        } else {
            parentCont.style.display = 'none';
            const parentSelect = document.getElementById('node-parent-select');
            if (parentSelect) parentSelect.value = '';
        }
    },

    async onNodeRouterChange(nasIp) {
        const badge = document.getElementById('node-ports-status-badge');
        if (badge) badge.innerText = '⏳ جاري قراءة منافذ الراوتر...';
        const portSelect = document.getElementById('node-port-select');
        const portInput = document.getElementById('node-port-id-input');
        if (!portSelect) return;

        try {
            const res = await this.api('get_router_ports', { nas: nasIp }) || {};
            const ports = res.ports || [];
            portSelect.innerHTML = `
                <option value="">-- اختر المنفذ من الراوتر --</option>
                ${ports.map(p => `<option value="${this.escape(p.name)}">${this.escape(p.label || p.name)}</option>`).join('')}
                <option value="__custom__">✏️ إدخال اسم منفذ مخصص يدوي...</option>
            `;
            if (badge) badge.innerText = `(${ports.length} منفذ متاح)`;
            if (ports.length > 0 && portInput && !portInput.value) {
                portSelect.value = ports[0].name;
                portInput.value = ports[0].name;
            }
        } catch (e) {
            if (badge) badge.innerText = '(تعذر الاتصال بالراوتر)';
        }
    },

    onNodePortSelectChange(sel) {
        const portInput = document.getElementById('node-port-id-input');
        if (!portInput) return;
        if (sel.value === '__custom__') {
            portInput.style.display = 'block';
            portInput.focus();
        } else {
            portInput.value = sel.value;
            portInput.style.display = 'none';
        }
    },

    async showAddSubNodeModal(parentId, parentName, nasIp = '') {
        return this.showAddNodeModal({
            parent_id: parentId,
            node_type: 'sub_node',
            nas_ip: nasIp
        });
    },

    async loadLeafletAssets() {
        if (window.L) return window.L;
        if (!document.getElementById('sam-leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'sam-leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        if (!window.L) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                script.onload = resolve;
                script.onerror = () => {
                    const script2 = document.createElement('script');
                    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
                    script2.onload = resolve;
                    script2.onerror = reject;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script);
            });
        }
        return window.L;
    },

    async toggleNodeMapPicker() {
        const wrapper = document.getElementById('node-map-picker-wrapper');
        if (!wrapper) return;
        if (wrapper.style.display === 'none' || !wrapper.style.display) {
            wrapper.style.display = 'block';
            await this.initNodeMapPicker();
        } else {
            wrapper.style.display = 'none';
        }
    },

    async initNodeMapPicker() {
        const container = document.getElementById('node-leaflet-map-canvas');
        if (!container) return;

        try {
            const L = await this.loadLeafletAssets();
            if (!L) return;

            const coordsInput = document.getElementById('node-coordinates-input');
            let initialLat = 15.369445;
            let initialLng = 44.191007;
            let initialZoom = 13;

            if (coordsInput && coordsInput.value.trim()) {
                const parts = coordsInput.value.trim().split(',').map(s => parseFloat(s.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    initialLat = parts[0];
                    initialLng = parts[1];
                    initialZoom = 16;
                }
            }

            if (this._nodeMapInstance) {
                this._nodeMapInstance.remove();
                this._nodeMapInstance = null;
            }

            const map = L.map('node-leaflet-map-canvas').setView([initialLat, initialLng], initialZoom);
            this._nodeMapInstance = map;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
            this._nodeMapMarker = marker;

            const updateCoords = (lat, lng) => {
                const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                if (coordsInput) coordsInput.value = formatted;
                const badge = document.getElementById('node-map-coords-badge');
                if (badge) badge.innerText = formatted;
            };

            marker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                updateCoords(pos.lat, pos.lng);
            });

            map.on('click', (e) => {
                marker.setLatLng(e.latlng);
                updateCoords(e.latlng.lat, e.latlng.lng);
            });

            setTimeout(() => {
                map.invalidateSize();
            }, 200);

        } catch (e) {
            console.error('Error initializing map picker:', e);
        }
    },

    onNodeCoordinatesManualInput(val) {
        if (!val || !this._nodeMapInstance || !this._nodeMapMarker) return;
        const parts = val.trim().split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const lat = parts[0];
            const lng = parts[1];
            this._nodeMapMarker.setLatLng([lat, lng]);
            this._nodeMapInstance.setView([lat, lng], 16);
            const badge = document.getElementById('node-map-coords-badge');
            if (badge) badge.innerText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    },

    getNodeCurrentLocation() {
        if (!navigator.geolocation) {
            this.toast('خدمة تحديد الموقع GPS غير مدعومة في متصفحك', 'warning');
            return;
        }
        this.toast('جاري قراءة إحداثيات الموقع الحالي GPS...', 'info');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                const input = document.getElementById('node-coordinates-input');
                if (input) input.value = formatted;
                const badge = document.getElementById('node-map-coords-badge');
                if (badge) badge.innerText = formatted;

                if (this._nodeMapInstance && this._nodeMapMarker) {
                    this._nodeMapMarker.setLatLng([lat, lng]);
                    this._nodeMapInstance.setView([lat, lng], 17);
                }
                this.toast('تم تحديد الموقع الجغرافي بنجاح 📍', 'success');
            },
            (err) => {
                this.toast('تعذر جلب موقع GPS: ' + (err.message || 'يرجى إعطاء الإذن للمتصفح'), 'warning');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    async saveNetworkNodeForm(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            id: form.id?.value ? Number(form.id.value) : undefined,
            node_type: form.node_type.value,
            parent_id: form.parent_id?.value ? Number(form.parent_id.value) : null,
            nas_ip: form.nas_ip.value,
            nas_port_id: (form.nas_port_id?.value || form.nas_port_id_select?.value || '').trim(),
            node_name: form.node_name.value.trim(),
            display_name: (form.display_name?.value || '').trim(),
            responsible_admin_id: form.responsible_admin_id?.value ? Number(form.responsible_admin_id.value) : null,
            location: (form.location?.value || '').trim(),
            coordinates: (form.coordinates?.value || '').trim(),
            notes: (form.notes?.value || '').trim(),
            is_active: form.is_active ? (form.is_active.checked ? 1 : 0) : 1
        };

        if (!data.node_name) {
            this.toast('يرجى إدخال اسم النقطة في النظام', 'warning');
            return;
        }

        if (!data.nas_ip) {
            this.toast('يرجى اختيار الراوتر التابع له', 'warning');
            return;
        }

        const res = await this.api('save_network_node', {}, 'POST', data);
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ النقطة بنجاح', 'success');
            this.closeModal();
            if (this._nodeMapInstance) {
                this._nodeMapInstance = null;
                this._nodeMapMarker = null;
            }
            if (typeof this.renderNetworkNodes === 'function') {
                this.renderNetworkNodes();
            }
        } else {
            this.toast(res?.error || 'فشل حفظ النقطة', 'danger');
        }
    },

    async deleteNode(id, name) {
        if (!confirm(`هل أنت متأكد من حذف النقطة [${name}] وكافة الروابط التابعة لها؟`)) return;
        const res = await this.api('delete_network_node', { id });
        if (res && res.success) {
            this.toast(res.message || 'تم حذف النقطة بنجاح', 'success');
            if (typeof this.renderNetworkNodes === 'function') {
                this.renderNetworkNodes();
            }
        } else {
            this.toast(res?.error || 'فشل الحذف', 'danger');
        }
    },

    // ==========================================
    // EXPORT & IMPORT CSV HELPERS
    // ==========================================

    // ==========================================
    // UNIVERSAL TABLE HELPERS (SORT, PAGINATE, CSV, PRINT)
    // ==========================================
    genericSort(list, sortCol, sortDir) {
        if (!sortCol || !Array.isArray(list)) return list;
        return [...list].sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean' && valA !== '' && valB !== '') {
                return sortDir === 'asc' ? numA - numB : numB - numA;
            }
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (strA < strB) return sortDir === 'asc' ? -1 : 1;
            if (strA > strB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    },

    genericPaginate(list, page, limit) {
        page = Math.max(1, parseInt(page) || 1);
        limit = Math.max(10, parseInt(limit) || 50);
        const total = list.length;
        const total_pages = Math.ceil(total / limit) || 1;
        const start = (page - 1) * limit;
        const data = list.slice(start, start + limit);
        return {
            data,
            total,
            page: Math.min(page, total_pages),
            limit,
            total_pages,
            start_index: total === 0 ? 0 : start + 1,
            end_index: Math.min(start + limit, total)
        };
    },

    renderTablePaginationBar(pagination, onPageChangeName, onLimitChangeName) {
        const { page, total_pages, total, limit, start_index, end_index } = pagination;
        const limits = [25, 50, 100, 250, 500, 1000];
        return `
        <div class="mt-pagination" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:10px 0; margin-top:12px; border-top:1px solid var(--border-color);">
            <div style="display:flex; align-items:center; gap:10px; font-size:12px; color:var(--text-muted);">
                <span>عرض السجلات <b>${start_index} - ${end_index}</b> من إجمالي <b>${total.toLocaleString()}</b></span>
                <div style="display:inline-flex; align-items:center; gap:4px; margin-right:8px;">
                    <label style="font-size:11px;">صفوف/صفحة:</label>
                    <select class="mt-select" style="font-size:11px; padding:2px 6px; height:26px;" onchange="${onLimitChangeName}(parseInt(this.value))">
                        ${limits.map(l => `<option value="${l}" ${limit === l ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="display:flex; gap:4px; align-items:center;">
                <button class="mt-btn" style="padding:4px 8px; font-size:11px;" ${page <= 1 ? 'disabled' : ''} onclick="${onPageChangeName}(1)" title="الصفحة الأولى">⇤ الأولى</button>
                <button class="mt-btn" style="padding:4px 8px; font-size:11px;" ${page <= 1 ? 'disabled' : ''} onclick="${onPageChangeName}(${page - 1})" title="الصفحة السابقة">◀ السابق</button>
                <span style="padding:4px 10px; font-size:11px; background:var(--bg-window, #fff); border:1px solid var(--border-color); border-radius:4px; font-weight:bold; color:var(--primary-color);">
                    صفحة ${page} من ${total_pages}
                </span>
                <button class="mt-btn" style="padding:4px 8px; font-size:11px;" ${page >= total_pages ? 'disabled' : ''} onclick="${onPageChangeName}(${page + 1})" title="الصفحة التالية">التالي ▶</button>
                <button class="mt-btn" style="padding:4px 8px; font-size:11px;" ${page >= total_pages ? 'disabled' : ''} onclick="${onPageChangeName}(${total_pages})" title="الصفحة الأخيرة">الأخيرة ⇥</button>
            </div>
        </div>`;
    },

    downloadExcelCSV(filename, headers, rows) {
        let csvContent = '\uFEFF'; // UTF-8 BOM for Microsoft Excel Arabic compatibility
        csvContent += headers.map(h => `"${String(h || '').replace(/"/g, '""')}"`).join(',') + '\r\n';
        rows.forEach(row => {
            csvContent += row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',') + '\r\n';
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename.endsWith('.csv') ? filename : filename + '.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    printUniversalReport(title, headers, rowsHtml, summaryHtml = '') {
        const printHtml = `
        <div class="pdf-a4-page" style="padding:15mm; font-family:Cairo,sans-serif; direction:rtl; color:#000; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0078d7; padding-bottom:8px; margin-bottom:14px;">
                <div>
                    <h2 style="margin:0; font-size:17px; color:#0078d7; font-weight:800;">${this.escape(title)}</h2>
                    <div style="font-size:11px; color:#64748b; margin-top:3px;">منظومة إدارة المشتركين والشبكات — تقرير رسمي</div>
                </div>
                <div style="text-align:left; font-size:11px; color:#64748b;">
                    <div>📅 التاريخ: <b>${new Date().toLocaleDateString('ar-YE')}</b></div>
                    <div>⏰ الوقت: <b>${new Date().toLocaleTimeString('ar-YE')}</b></div>
                </div>
            </div>
            ${summaryHtml ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:11px;">${summaryHtml}</div>` : ''}
            <table class="mt-table" style="width:100%; border-collapse:collapse; font-size:11px;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        ${headers.map(h => `<th style="padding:6px 8px; text-align:right; border:1px solid #cbd5e1; font-weight:bold; color:#0f172a;">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>`;

        this.openModal(`
            <div class="mt-modal-header" style="background:#1e293b; color:#fff;">
                <span>🖨️ معاينة وطباعة التقرير A4: <b>${this.escape(title)}</b></span>
                <div style="display:flex; gap:6px;">
                    <button class="mt-btn mt-btn-primary" onclick="window.print()">🖨️ طباعة فورية</button>
                    <button class="mt-btn" style="background:#334155; color:#fff; border:none;" onclick="App.closeModal()">✕ إغلاق</button>
                </div>
            </div>
            <div class="mt-modal-body" style="padding:20px; background:#475569; overflow:auto; max-height:82vh;">
                <div id="print-container">
                    ${printHtml}
                </div>
            </div>
        `, '1100px');
    },

    getTableSortIcon(currentCol, targetCol, currentDir) {
        if (currentCol !== targetCol) return '<span style="color:#94a3b8; font-size:10px; margin-right:4px;">↕</span>';
        return currentDir === 'asc' ? '<span style="color:#2563eb; font-weight:800; font-size:11px; margin-right:4px;">▲</span>' : '<span style="color:#2563eb; font-weight:800; font-size:11px; margin-right:4px;">▼</span>';
    },



    toggleAdminsSort(col) {
        if (this.adminsSortCol === col) {
            this.adminsSortDir = this.adminsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.adminsSortCol = col;
            this.adminsSortDir = 'asc';
        }
        this.renderAdmins();
    },

    setAdminsPage(p) {
        this.adminsPage = p;
        this.renderAdmins();
    },

    setAdminsLimit(l) {
        this.adminsLimit = l;
        this.adminsPage = 1;
        this.renderAdmins();
    },

    toggleSelectAllAdmins(masterCheckbox) {
        const checkboxes = document.querySelectorAll('input.admin-row-cb');
        checkboxes.forEach(cb => {
            cb.checked = masterCheckbox.checked;
            const id = parseInt(cb.value);
            if (masterCheckbox.checked) this.selectedAdmins.add(id);
            else this.selectedAdmins.delete(id);
        });
    },

    toggleSelectAdmin(id, isChecked) {
        id = parseInt(id);
        if (isChecked) this.selectedAdmins.add(id);
        else this.selectedAdmins.delete(id);
    },

    exportAdminsCSV() {
        if (!this._lastAdminsList || !this._lastAdminsList.length) return this.toast('لا توجد بيانات مستخدمين للتصدير', 'warning');
        const headers = ['المعرف ID', 'اسم المستخدم', 'الاسم الكامل', 'الهاتف', 'الرتبة والدور', 'الوكيل الأب', 'الرصيد المالي', 'سقف الائتمان', 'نسبة الخصم %', 'كوتة المجاني', 'الحالة'];
        const rows = this._lastAdminsList.map(a => [
            a.id,
            a.username,
            a.fullname,
            a.phone || '',
            a.role_name_ar || a.role,
            a.parent_name || '',
            a.balance || 0,
            a.credit_limit || 0,
            a.discount_rate || 0,
            a.free_cards_quota || 0,
            a.is_active ? 'نشط' : 'معطل'
        ]);
        this.downloadExcelCSV(`Admins_Agents_Report_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },

    printAdminsTable() {
        if (!this._lastAdminsList || !this._lastAdminsList.length) return this.toast('لا توجد بيانات للطباعة', 'warning');
        const headers = ['#', 'المستخدم', 'الاسم الكامل', 'الهاتف', 'الرتبة', 'الرصيد', 'سقف الائتمان', 'الخصم', 'الحالة'];
        const rowsHtml = this._lastAdminsList.map((a, i) => `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(a.username)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(a.fullname)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; direction:ltr;">${this.escape(a.phone || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(a.role_name_ar || a.role)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${App.formatMoney(a.balance)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${App.formatMoney(a.credit_limit)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${a.discount_rate || 0}%</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${a.is_active ? '🟢 نشط' : '🔴 معطل'}</td>
            </tr>
        `).join('');
        this.printUniversalReport('تقرير المستخدمين والوكلاء المسجلين', headers, rowsHtml, `إجمالي الحسابات المسجلة: ${this._lastAdminsList.length}`);
    },


    toggleAssetsSort(col) {
        if (this.assetsSortCol === col) {
            this.assetsSortDir = this.assetsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.assetsSortCol = col;
            this.assetsSortDir = 'asc';
        }
        this.renderAssets();
    },

    setAssetsPage(p) {
        this.assetsPage = p;
        this.renderAssets();
    },

    setAssetsLimit(l) {
        this.assetsLimit = l;
        this.assetsPage = 1;
        this.renderAssets();
    },

    toggleSelectAllAssets(masterCheckbox) {
        const checkboxes = document.querySelectorAll('input.asset-row-cb');
        checkboxes.forEach(cb => {
            cb.checked = masterCheckbox.checked;
            const id = parseInt(cb.value);
            if (masterCheckbox.checked) this.selectedAssets.add(id);
            else this.selectedAssets.delete(id);
        });
    },

    toggleSelectAsset(id, isChecked) {
        id = parseInt(id);
        if (isChecked) this.selectedAssets.add(id);
        else this.selectedAssets.delete(id);
    },

    exportAssetsCSVFull() {
        if (!this._lastAssetsList || !this._lastAssetsList.length) return this.toast('لا توجد أصول للتصدير', 'warning');
        const headers = ['المعرف ID', 'كود الأصل', 'اسم الجهاز / الأصل', 'التصنيف', 'نقطة الشبكة / البرج', 'الحالة', 'تكلفة الشراء', 'القيمة الحالية', 'المسؤول / العهدة', 'الماك MAC', 'السيريال'];
        const rows = this._lastAssetsList.map(a => [
            a.id,
            a.asset_code || '',
            a.name,
            a.category_name || a.category,
            a.node_name || '',
            a.status,
            a.purchase_cost || 0,
            a.current_value || 0,
            a.custodian_name || '',
            a.mac_address || '',
            a.serial_number || ''
        ]);
        this.downloadExcelCSV(`Assets_Inventory_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },

    printAssetsTable() {
        if (!this._lastAssetsList || !this._lastAssetsList.length) return this.toast('لا توجد أصول للطباعة', 'warning');
        const headers = ['#', 'كود الأصل', 'اسم الأصل / الجهاز', 'التصنيف', 'نقطة الشبكة', 'الحالة', 'تكلفة الشراء', 'القيمة الحالية', 'العهدة'];
        const rowsHtml = this._lastAssetsList.map((a, i) => `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold; font-family:monospace;">${this.escape(a.asset_code || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(a.name)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(a.category_name || a.category)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(a.node_name || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${this.escape(a.status)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${App.formatMoney(a.purchase_cost)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold; color:#16a34a;">${App.formatMoney(a.current_value)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(a.custodian_name || '-')}</td>
            </tr>
        `).join('');
        this.printUniversalReport('سجل الأصول ومعدات الشبكة', headers, rowsHtml, `إجمالي الأصول المسجلة: ${this._lastAssetsList.length}`);
    },


    togglePortSort(col) {
        if (this.portAnalyticsSortCol === col) {
            this.portAnalyticsSortDir = this.portAnalyticsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.portAnalyticsSortCol = col;
            this.portAnalyticsSortDir = 'asc';
        }
        this.renderPortAnalytics();
    },

    setPortPage(p) {
        this.portAnalyticsPage = p;
        this.renderPortAnalytics();
    },

    setPortLimit(l) {
        this.portAnalyticsLimit = l;
        this.portAnalyticsPage = 1;
        this.renderPortAnalytics();
    },

    exportPortAnalyticsCSV() {
        if (!this._lastPortList || !this._lastPortList.length) return this.toast('لا توجد بيانات منافذ للتصدير', 'warning');
        const headers = ['الراوتر (NAS)', 'عنوان IP', 'المنفذ (Port ID)', 'عدد الجلسات', 'المشتركين', 'الرفع (Upload)', 'التنزيل (Download)', 'إجمالي البيانات (Bytes)', 'إجمالي المبيعات (ريال)'];
        const rows = this._lastPortList.map(p => [
            p.router_name || '',
            p.nasipaddress || '',
            p.port_id,
            p.total_sessions || 0,
            p.unique_users || 0,
            p.rx_bytes || 0,
            p.tx_bytes || 0,
            p.total_bytes || 0,
            p.total_sales || 0
        ]);
        this.downloadExcelCSV(`Port_Analytics_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },

    printPortAnalyticsTable() {
        if (!this._lastPortList || !this._lastPortList.length) return this.toast('لا توجد بيانات للطباعة', 'warning');
        const headers = ['#', 'الراوتر', 'المنفذ (Port ID)', 'الجلسات', 'المشتركون', 'إجمالي البيانات', 'المبيعات'];
        const rowsHtml = this._lastPortList.map((p, i) => `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(p.router_name)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; font-weight:bold;">${this.escape(p.port_id)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${p.total_sessions}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${p.unique_users}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${App.formatBytes(p.total_bytes)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold; color:#16a34a;">${Number(p.total_sales || 0).toLocaleString()} YER</td>
            </tr>
        `).join('');
        this.printUniversalReport('تقرير مبيعات واستهلاك منافذ الشبكة (NAS-Port-Id)', headers, rowsHtml, `إجمالي المنافذ النشطة: ${this._lastPortList.length}`);
    },


    toggleSessionSort(col) {
        if (this.sessionsSortCol === col) {
            this.sessionsSortDir = this.sessionsSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sessionsSortCol = col;
            this.sessionsSortDir = 'asc';
        }
        this.renderActiveSessions(false);
    },

    setSessionsPage(p) {
        this.sessionsPage = p;
        this.renderActiveSessions(false);
    },

    setSessionsLimit(l) {
        this.sessionsLimit = l;
        this.sessionsPage = 1;
        this.renderActiveSessions(false);
    },

    toggleSelectAllSessions(masterCheckbox) {
        const checkboxes = document.querySelectorAll('input.session-row-cb');
        checkboxes.forEach(cb => {
            cb.checked = masterCheckbox.checked;
            const u = cb.value;
            if (masterCheckbox.checked) this.selectedSessions.add(u);
            else this.selectedSessions.delete(u);
        });
    },

    toggleSelectSession(username, isChecked) {
        if (isChecked) this.selectedSessions.add(username);
        else this.selectedSessions.delete(username);
    },

    async disconnectSelectedSessions() {
        if (!this.selectedSessions.size) return this.toast('الرجاء تحديد جلسات لفصلها', 'warning');
        if (!confirm(`هل أنت متأكد من فصل ${this.selectedSessions.size} جلسة مباشرة عبر بروتوكول CoA/PoD؟`)) return;
        this.toast(`جاري إرسال أوامر الفصل لـ ${this.selectedSessions.size} جلسة...`, 'info');
        let disconnected = 0;
        let failed = 0;
        for (const user of this.selectedSessions) {
            const sess = (this._lastSessionsList || []).find(s => s.username === user);
            if (sess) {
                const res = await this.api('disconnect_session', {
                    username: user,
                    nas_ip: sess.nasipaddress,
                    framed_ip: sess.framedipaddress,
                    session_id: sess.acctsessionid || sess.session_id || '',
                    mac: sess.callingstationid || sess.mac || ''
                }, 'POST');
                if (res?.success) disconnected++;
                else failed++;
            }
        }
        this.selectedSessions.clear();
        if (disconnected > 0 && failed === 0) this.toast(`تم إرسال أوامر فصل لـ ${disconnected} جلسة بنجاح`, 'success');
        else if (disconnected > 0) this.toast(`تم فصل ${disconnected} جلسة، وتعذر فصل ${failed} جلسة`, 'warning');
        else this.toast('تعذر فصل الجلسات المحددة؛ راجع حالة NAS وCoA/PoD', 'danger');
        this.renderActiveSessions(false);
    },

    exportSessionsCSV() {
        if (!this._lastSessionsList || !this._lastSessionsList.length) return this.toast('لا توجد جلسات للتصدير', 'warning');
        const headers = ['اسم المستخدم (الكرت)', 'عنوان IP المستلم', 'عنوان MAC', 'الراوتر (NAS)', 'المنفذ NAS-Port', 'وقت بدء الاتصال', 'مدة الجلسة (ثوان)', 'التحميل ↓', 'الرفع ↑', 'إجمالي البيانات (Bytes)'];
        const rows = this._lastSessionsList.map(s => [
            s.username,
            s.framedipaddress || '',
            s.callingstationid || '',
            s.router_name || s.nasipaddress,
            s.nasportid || '',
            s.acctstarttime || '',
            s.acctsessiontime || 0,
            s.acctoutputoctets || 0,
            s.acctinputoctets || 0,
            (parseInt(s.acctinputoctets)||0) + (parseInt(s.acctoutputoctets)||0)
        ]);
        this.downloadExcelCSV(`Live_Active_Sessions_${new Date().toISOString().slice(0,10)}`, headers, rows);
    },

    printSessionsTable() {
        if (!this._lastSessionsList || !this._lastSessionsList.length) return this.toast('لا توجد جلسات للطباعة', 'warning');
        const headers = ['#', 'المستخدم', 'IP المشترك', 'الماك MAC', 'الراوتر', 'المنفذ', 'وقت الاتصال', 'المدة', 'إجمالي الاستهلاك'];
        const rowsHtml = this._lastSessionsList.map((s, i) => `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.escape(s.username)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr;">${this.escape(s.framedipaddress || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace; direction:ltr; font-size:10px;">${this.escape(s.callingstationid || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px;">${this.escape(s.router_name || s.nasipaddress)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-family:monospace;">${this.escape(s.nasportid || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-size:10px;">${this.escape(s.acctstarttime || '-')}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold;">${this.formatUptime(s.acctsessiontime || 0)}</td>
                <td style="border:1px solid #cbd5e1; padding:5px; font-weight:bold; color:#16a34a;">${this.formatBytes((parseInt(s.acctinputoctets)||0) + (parseInt(s.acctoutputoctets)||0))}</td>
            </tr>
        `).join('');
        this.printUniversalReport('كشف الجلسات الحية المتصلة الآن في الشبكة', headers, rowsHtml, `إجمالي الجلسات النشطة: ${this._lastSessionsList.length}`);
    },


    async exportUsersCSV(selectedOnly = false) {
        const usernames = selectedOnly ? Array.from(this.selectedItems || []) : [];
        if (selectedOnly && usernames.length === 0) {
            return this.toast('حدد كرتاً واحداً على الأقل للتصدير', 'warning');
        }

        const payload = {
            usernames,
            search: selectedOnly ? '' : (this.usersSearchQuery || ''),
            profile: selectedOnly ? '' : (this.usersFilterProf || ''),
            status: selectedOnly ? '' : (this.usersFilterStatus || ''),
            batch: selectedOnly ? '' : (this.usersFilterBatch || '')
        };

        this.toast(selectedOnly ? `جاري تصدير ${usernames.length} كرت محدد...` : 'جاري تجهيز ملف الكروت حسب الفلاتر الحالية...', 'info');
        try {
            const response = await fetch('api.php?action=export_vouchers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.status === 401) {
                this.showLogin();
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData?.error || 'تعذر إنشاء ملف التصدير');
            }

            const blob = await response.blob();
            if (blob.size === 0) throw new Error('ملف التصدير فارغ');
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/i);
            const downloadName = match?.[1] || `cards_${new Date().toISOString().slice(0, 10)}.csv`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            this.toast('✓ تم تنزيل ملف CSV بنجاح', 'success');
        } catch (e) {
            console.error('Cards CSV export error:', e);
            this.toast(`تعذر تصدير الكروت: ${e?.message || 'خطأ غير معروف'}`, 'danger');
        }
    },

    exportProfilesCSV() {
        window.open('api.php?action=export_profiles', '_blank');
    },

    exportAssetsCSV() {
        window.open('api.php?action=export_assets', '_blank');
    },

    showImportVouchersModal() {
        this.openModal(`
            <div class="mt-modal-header">
                <span>📥 استيراد كروت من ملف CSV</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <form onsubmit="App.handleImportVouchers(event)">
                <div class="mt-modal-body">
                    <div class="form-group">
                        <label>اختر ملف CSV:</label>
                        <input type="file" id="import-vouchers-file" accept=".csv,.txt" class="mt-input" style="width:100%" required />
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary">📥 استيراد الآن</button>
                </div>
            </form>
        `);
    },

    async handleImportVouchers(e) {
        e.preventDefault();
        const file = document.getElementById('import-vouchers-file').files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('csv_file', file);
        this.toast('جاري قراءة واستيراد الملف...', 'info');
        const res = await this.api('import_vouchers', {}, 'POST', formData);
        if (res && res.success) {
            this.toast(`تم استيراد ${res.imported_count || 0} كرت بنجاح!`, 'success');
            this.closeModal();
            this.renderUsers();
        } else {
            this.toast(res?.error || 'فشل الاستيراد', 'danger');
        }
    },

    showImportProfilesModal() {
        this.openModal(`
            <div class="mt-modal-header">
                <span>📥 استيراد باقات وسرعات من ملف CSV</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <form onsubmit="App.handleImportProfiles(event)">
                <div class="mt-modal-body">
                    <div class="form-group">
                        <label>اختر ملف CSV:</label>
                        <input type="file" id="import-profiles-file" accept=".csv,.txt" class="mt-input" style="width:100%" required />
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary">📥 استيراد الباقات</button>
                </div>
            </form>
        `);
    },

    async handleImportProfiles(e) {
        e.preventDefault();
        const file = document.getElementById('import-profiles-file').files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('csv_file', file);
        const res = await this.api('import_profiles', {}, 'POST', formData);
        if (res && res.success) {
            this.toast(`تم استيراد الباقات بنجاح!`, 'success');
            this.closeModal();
            this.renderProfiles();
        } else {
            this.toast(res?.error || 'فشل الاستيراد', 'danger');
        }
    },

    showImportAssetsModal() {
        this.openModal(`
            <div class="mt-modal-header">
                <span>📥 استيراد معدات وأصول من ملف CSV</span>
                <button class="close-btn" onclick="App.closeModal()">✕</button>
            </div>
            <form onsubmit="App.handleImportAssets(event)">
                <div class="mt-modal-body">
                    <div class="form-group">
                        <label>اختر ملف CSV:</label>
                        <input type="file" id="import-assets-file" accept=".csv,.txt" class="mt-input" style="width:100%" required />
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-primary">📥 استيراد المعدات</button>
                </div>
            </form>
        `);
    },

    async handleImportAssets(e) {
        e.preventDefault();
        const file = document.getElementById('import-assets-file').files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('csv_file', file);
        const res = await this.api('import_assets', {}, 'POST', formData);
        if (res && res.success) {
            this.toast(`تم استيراد الأصول والمعدات بنجاح!`, 'success');
            this.closeModal();
            this.renderAssets();
        } else {
            this.toast(res?.error || 'فشل الاستيراد', 'danger');
        }
    },

// ==========================================
    // BACKUP RADIUS & PROXY CONFIG HELPERS
    // ==========================================
    async saveBackupRadiusAsDefault() {
        const routerId = Number(
            document.getElementById('backup-radius-router-id')?.value ||
            document.getElementById('um-proxy-router-id')?.value || 0
        );
        const enabled = document.getElementById('backup-radius-enabled')?.checked ? 1 : 0;
        const res = await this.api('save_backup_radius_settings', {}, 'POST', { router_id: routerId, enabled });
        if (res && res.success) {
            this.toast(res.message || 'تم حفظ إعدادات خادم RADIUS الاحتياطي بنجاح', 'success');
        } else {
            this.toast(res?.error || 'فشل الحفظ', 'danger');
        }
    },

    async saveUmProxyConfig() {
        const routerId = Number(document.getElementById('um-proxy-router-id')?.value || 0);
        const enabled = document.getElementById('um-proxy-enabled')?.checked ? 1 : 0;
        const authPort = Number(document.getElementById('um-proxy-auth-port')?.value || 1812);
        const acctPort = Number(document.getElementById('um-proxy-acct-port')?.value || 1813);
        const [res, backup] = await Promise.all([
            this.api('save_um_proxy_settings', {}, 'POST', { router_id: routerId, enabled, auth_port: authPort, acct_port: acctPort }),
            this.api('save_backup_radius_settings', {}, 'POST', { router_id: routerId, enabled, auth_port: authPort, acct_port: acctPort })
        ]);
        if (res && res.success && backup && backup.success) {
            this.toast(res.message || 'تم تحديث توجيه البروكسي وUser Manager الاحتياطي بنجاح', 'success');
        } else {
            this.toast(res?.error || backup?.error || 'فشل الحفظ', 'danger');
        }
    },

    async refreshScriptBackup() {
        if (typeof this.generateMikrotikScript === 'function') {
            this.generateMikrotikScript();
        } else {
            this.toast('تم تحديث إعدادات السكربت', 'info');
        }
    },

    // ==========================================
    // MULTI-TIER CARD WAREHOUSES & INVENTORY
    // ==========================================
    warehousesViewMode: 'grid', // 'grid' | 'table' | 'transfers_log'
    warehousesRoleFilter: '',
    warehousesSearchQuery: '',
    warehousesShowEmpty: false,

    warehouseSheetNumbersPreview(profile) {
        const numbers = [...new Set((profile.sheet_numbers || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);
        if (!numbers.length) {
            const unnumbered = Number(profile.unnumbered_cards || 0);
            return unnumbered ? `⚠️ ${unnumbered} كرت بدون رقم ورقة` : '📄 لا توجد أوراق مرقمة';
        }
        
        // Group sequential sheet numbers into readable ranges
        const ranges = [];
        let start = numbers[0];
        let prev = numbers[0];
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] === prev + 1) {
                prev = numbers[i];
            } else {
                ranges.push(start === prev ? String(start).padStart(6, '0') : `${String(start).padStart(6, '0')} ⬅️ ${String(prev).padStart(6, '0')}`);
                start = numbers[i];
                prev = numbers[i];
            }
        }
        ranges.push(start === prev ? String(start).padStart(6, '0') : `${String(start).padStart(6, '0')} ⬅️ ${String(prev).padStart(6, '0')}`);
        
        const preview = ranges.slice(0, 8).join(' | ');
        const extra = ranges.length > 8 ? ` + ${ranges.length - 8} نطاقات أخرى` : '';
        return `📄 الأوراق: ${preview}${extra}`;
    },

    async showWarehouseSheetInventory(adminId) {
        const details = await this.api('get_warehouse_details', { admin_id: adminId });
        if (!details || details.error || !details.sheet_inventory) {
            this.toast(details?.error || 'تعذر تحميل تسلسل الأوراق المتبقية. حاول التحديث مرة أخرى.', 'danger');
            return;
        }
        const inventory = details.sheet_inventory;
        const profiles = Array.isArray(inventory.profiles) ? inventory.profiles : [];
        this.warehouseSheetInventory = { adminId, inventory, profiles };
        const count = value => Number(value || 0).toLocaleString();
        this.openModal(`
            <div class="mt-modal-header">
                <b>📑 الأوراق المتبقية غير المستخدمة · ${this.escapeHtml(details.account?.fullname || details.account?.username || '')}</b>
                <button type="button" class="mt-btn" onclick="App.closeModal()" aria-label="إغلاق">✕</button>
            </div>
            <div class="mt-modal-body" style="padding:16px;">
                <p style="margin:0 0 12px; color:var(--text-muted); font-size:12px; line-height:1.8;">الأرقام الفعلية للأوراق التي تحتوي على كروت غير مستخدمة وسارية في عهدة الحساب، مرتبة تصاعدياً ومجمعة حسب الباقة. تشمل الكروت المشتراة التي ما زالت في عهدته. الورقة الجزئية تعني أن جزءاً من كروتها فقط متبقٍ هنا.</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-bottom:14px;">
                    <div style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; padding:8px; border-radius:6px; text-align:center;">
                        <div style="font-size:11px; font-weight:700;">📦 أوراق العهدة</div>
                        <b style="font-size:16px;">${count(inventory.custody_sheets || 0)} ورقة</b>
                        <div style="font-size:10.5px;">(${count(inventory.custody_cards || inventory.available_cards || 0)} كرت)</div>
                    </div>
                    <div style="background:#fffbeb; color:#92400e; border:1px solid #fde68a; padding:8px; border-radius:6px; text-align:center;">
                        <div style="font-size:11px; font-weight:700;">🛒 أوراق مباعة بفاتورة</div>
                        <b style="font-size:16px;">${count(inventory.sold_sheets || 0)} ورقة</b>
                        <div style="font-size:10.5px;">(${count(inventory.sold_cards || 0)} كرت)</div>
                    </div>
                    <div style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:8px; border-radius:6px; text-align:center;">
                        <div style="font-size:11px; font-weight:700;">⚡ رصيد فوري عهدة</div>
                        <b style="font-size:14px;">${App.formatMoney(details.account?.custody_balance || 0)}</b>
                    </div>
                    <div style="background:#faf5ff; color:#6d28d9; border:1px solid #ddd6fe; padding:8px; border-radius:6px; text-align:center;">
                        <div style="font-size:11px; font-weight:700;">💳 رصيد مشتريات</div>
                        <b style="font-size:14px;">${App.formatMoney(details.account?.sold_balance || 0)}</b>
                    </div>
                    <div style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:8px; border-radius:6px; text-align:center;">
                        <div style="font-size:11px; font-weight:700;">📑 إجمالي الأوراق</div>
                        <b style="font-size:16px;">${count(inventory.total_sheets || 0)} ورقة</b>
                        <div style="font-size:10.5px;">(${count(inventory.total_cards || 0)} كرت)</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; align-items:flex-end;">
                    <label style="flex:1; min-width:180px; font-size:12px;">الباقة
                        <select id="warehouse-sheet-profile" class="mt-select" style="display:block; width:100%; margin-top:4px;" onchange="App.renderWarehouseSheetInventoryRows()">
                            <option value="">كل الباقات (${profiles.length})</option>
                            ${profiles.map((profile, index) => `<option value="${index}">${this.escapeHtml(profile.profile_label || profile.display_profile || profile.profile_name || 'بدون باقة')} · ${count(profile.total_sheets)} ورقة</option>`).join('')}
                        </select>
                    </label>
                    <label style="flex:2; min-width:220px; font-size:12px;">البحث برقم الورقة أو نطاق أرقام
                        <input id="warehouse-sheet-query" class="mt-input" style="display:block; width:100%; margin-top:4px;" placeholder="مثال: 12، 18-20" inputmode="text" oninput="App.renderWarehouseSheetInventoryRows()" />
                    </label>
                    <button type="button" class="mt-btn" onclick="document.getElementById('warehouse-sheet-profile').value=''; document.getElementById('warehouse-sheet-query').value=''; App.renderWarehouseSheetInventoryRows()">عرض الكل</button>
                </div>
                <div id="warehouse-sheet-results" style="max-height:55vh; overflow-y:auto;"></div>
            </div>
            <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 16px;">
                <div>
                    <button type="button" class="mt-btn" style="background:#ffffff; border:1px solid #cbd5e1; font-weight:700;" onclick="App.printWarehouseAuditReport(${Number(adminId)})">🖨️ طباعة كشف ومحضر جرد شامل</button>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="mt-btn" onclick="App.showWarehouseSheetInventory(${Number(adminId)})">⟳ تحديث الرصيد</button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        `, '980px');
        this.renderWarehouseSheetInventoryRows();
    }
});

App.notifLogChannelFilter = '';
App.notifLogEventFilter = '';
App.notifLogStatusFilter = '';
App.notifLogSearch = '';
App.notifLogPage = 1;
App.notifLogLimit = 25;
App.waPollTimer = null;
App.notifSearchDebounce = null;

// =========================================================================
// NOTIFICATION CONSTANTS & UTILITIES
// =========================================================================
App.notifEventTypeMap = {
    'sale': { label: 'فاتورة مبيعات', icon: '🧾', bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
    'voucher_sale': { label: 'مبيعات كروت', icon: '🧾', bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
    'receipt': { label: 'سند مالي', icon: '💵', bg: '#eff6ff', color: '#2563eb', border: '#93c5fd' },
    'voucher_transfer': { label: 'تحويل عهدة', icon: '📦', bg: '#fdf4ff', color: '#a855f7', border: '#d8b4fe' },
    'transfer': { label: 'تحويل كروت', icon: '📦', bg: '#fdf4ff', color: '#a855f7', border: '#d8b4fe' },
    'router_offline': { label: 'انقطاع سيرفر', icon: '🚨', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
    'router_online': { label: 'عودة سيرفر', icon: '🟢', bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
    'low_stock': { label: 'تنبيه مخزون', icon: '📉', bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    'direct': { label: 'رسالة مباشرة', icon: '✉️', bg: '#f0f9ff', color: '#0284c7', border: '#7dd3fc' },
    'custom': { label: 'إشعار مخصص', icon: '✉️', bg: '#f0f9ff', color: '#0284c7', border: '#7dd3fc' },
    'broadcast': { label: 'تعميم إداري', icon: '📢', bg: '#f5f3ff', color: '#7c3aed', border: '#c4b5fd' },
    'system': { label: 'إشعار نظام', icon: '⚙️', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
};

App.cleanNotifMessagePreview = function(msg) {
    if (!msg) return '';
    return String(msg)
        .replace(/[*_~`]/g, '')
        .replace(/\n+/g, ' ')
        .trim();
};

App.retryNotificationLog = async function(logId) {
    if (!logId) return;
    this.toast('جاري إعادة إرسال الرسالة...', 'info');
    try {
        const res = await this.api('resend_notification_log', { log_id: logId }, 'POST');
        if (res && res.success) {
            this.toast('✅ تم إعادة إرسال الرسالة بنجاح!', 'success');
            this.renderNotifications();
        } else {
            this.toast(res?.error || 'تعذر إعادة إرسال الرسالة', 'danger');
        }
    } catch(err) {
        this.toast('حدث خطأ أثناء إعادة الإرسال: ' + (err.message || err), 'danger');
    }
};

App.showNotificationDetailModal = function(logId) {
    const log = (this._currentNotifLogs || []).find(l => Number(l.id) === Number(logId));
    if (!log) {
        this.toast('تعذر العثور على سجل الرسالة', 'warning');
        return;
    }
    const evInfo = (App.notifEventTypeMap && App.notifEventTypeMap[log.event_type]) || { label: log.event_type || 'إشعار', icon: '📩' };
    const content = `
        <div style="min-width:320px; max-width:620px; font-size:12.5px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:20px;">${evInfo.icon}</span>
                    <div>
                        <b style="font-size:14px; color:#0f172a;">تفاصيل رسالة #${log.id} (${evInfo.label})</b>
                        <div style="font-size:11px; color:#64748b;">القناة: <b>${String(log.channel || '').toUpperCase()}</b> • التاريخ: ${log.created_at}</div>
                    </div>
                </div>
                <div>
                    <span class="status-pill ${log.status === 'sent' ? 'status-active' : 'status-disabled'}" style="font-size:11px; font-weight:bold;">
                        ${log.status === 'sent' ? '🟢 تم الإرسال' : '🔴 فشل الإرسال'}
                    </span>
                </div>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:12px;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
                    <div><b>المرسل منه / الشبكة:</b> <code style="font-size:12px; color:#0f172a; font-weight:700;">${this.escape(log.sender_phone || (log.network_name ? '🏢 ' + log.network_name : '—'))}</code></div>
                    <div><b>المستلم:</b> <code style="font-size:12px; color:#0f172a;">${this.escape(log.recipient_phone || log.recipient_chat_id || '—')}</code></div>
                    <div><b>المرجع (Ref):</b> <span>${this.escape(log.reference_id || '—')}</span></div>
                    <div><b>سبب / رمز الخطأ:</b> <span style="color:#b91c1c;">${this.escape(log.error_message || 'لا يوجد (ناجح)')}</span></div>
                    <div><b>وقت التحديث:</b> <span>${this.escape(log.updated_at || log.created_at)}</span></div>
                </div>
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">📜 نص الرسالة الفعلي المرسل:</label>
                <div style="background:#0f172a; color:#f8fafc; border-radius:8px; padding:12px 14px; font-family:monospace, inherit; font-size:12px; line-height:1.6; white-space:pre-wrap; max-height:260px; overflow-y:auto; direction:auto; word-break:break-word;">
${this.escape(log.message_text || '')}
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <button type="button" class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:5px 14px;" onclick="App.closeModal(); App.retryNotificationLog(${log.id});">
                    🔁 إعادة إرسال هذه الرسالة
                </button>
                <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
            </div>
        </div>
    `;
    this.showModal(`معاينة الرسالة #${log.id}`, content);
};

App.saveTelegramSettingsDirect = async function() {
    const token = document.getElementById('cfg-tg-token')?.value?.trim() || '';
    const chatId = (document.getElementById('cfg-tg-chatid')?.value || document.getElementById('cfg-tg-chat')?.value || '').trim();
    const enabled = document.getElementById('cfg-tg-enabled')?.checked ? '1' : '0';
    const webhookSecret = document.getElementById('cfg-tg-webhook-secret')?.value?.trim() || '';

    const payload = {
        telegram_enabled: enabled,
        telegram_bot_token: token,
        telegram_chat_id: chatId,
        telegram_webhook_secret: webhookSecret
    };

    const res = await this.api('save_notification_settings', payload, 'POST');
    if (res && res.success) {
        this.toast('✅ تم حفظ إعدادات تليجرام بنجاح!', 'success');
        this.renderNotifications();
    } else {
        this.toast(res?.error || 'تعذر حفظ إعدادات تليجرام', 'danger');
    }
};

App.setTelegramWebhookDirect = async function() {
    const url = document.getElementById('cfg-tg-webhook-url')?.value?.trim() || '';
    const secret = document.getElementById('cfg-tg-webhook-secret')?.value?.trim() || '';
    if (!url) return this.toast('أدخل رابط Webhook العام الخاص بهذه الشبكة أولاً', 'warning');
    if (!/^https:\/\//i.test(url)) return this.toast('يجب أن يبدأ رابط Webhook بـ HTTPS', 'warning');
    const res = await this.api('set_telegram_webhook', { url, secret_token: secret }, 'POST');
    if (res?.success) this.toast(`✅ تم تسجيل Webhook للشبكة ${res.network_id || ''}`, 'success');
    else this.toast(res?.error || 'تعذر تسجيل Webhook تليجرام', 'danger');
};

App.renderNotifications = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    if (this.waPollTimer) {
        clearInterval(this.waPollTimer);
        this.waPollTimer = null;
    }

    mainView.innerHTML = `
        <div style="padding:50px 20px; text-align:center; color:#64748b;">
            <div class="spinner" style="width:36px; height:36px; border:3px solid #cbd5e1; border-top-color:#0284c7; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 14px;"></div>
            <div style="font-weight:700; font-size:15px; color:#1e293b;">جاري تحميل مركز الرسائل والتنبيهات وإحصائيات التسليم...</div>
            <div style="font-size:12px; color:#94a3b8; margin-top:6px;">مزامنة إعدادات WhatsApp و Telegram و FCM وسجلات الرسائل</div>
        </div>
    `;

    try {
        const [settingsRes, adminsRes, logsRes, botRes, statsRes] = await Promise.all([
            this.api('get_notification_settings').catch(() => ({})),
            this.api('get_admins').catch(() => []),
            this.api('get_notification_logs', {
                channel: this.notifLogChannelFilter,
                event_type: this.notifLogEventFilter,
                status: this.notifLogStatusFilter,
                search: this.notifLogSearch,
                page: this.notifLogPage,
                limit: this.notifLogLimit
            }).catch(() => ({ logs: [], total: 0, page: 1, limit: 25, pages: 1 })),
            this.api('get_chatbot_settings').catch(() => ({})),
            this.api('get_notification_stats').catch(() => ({ stats: {} }))
        ]);

        const bot = (botRes && botRes.settings) ? botRes.settings : { enabled: true, welcome_msg: 'مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐', support_phone: '777000000', network_name: 'شبكة ميكروتك مانجر' };
        this.chatbotSettings = bot;

        const notifSettings = (settingsRes && settingsRes.whatsapp) ? settingsRes : { whatsapp: {}, telegram: {}, firebase: {} };
        const wa = notifSettings.whatsapp || {};
        const tg = notifSettings.telegram || {};
        const tgConfig = typeof tg.config_json === 'string' ? (() => { try { return JSON.parse(tg.config_json) || {}; } catch (e) { return {}; } })() : (tg.config_json || {});
        const fb = notifSettings.firebase || {};
        const allAdmins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);
        const logsData = logsRes || { logs: [], total: 0, page: 1, limit: 25, pages: 1 };
        const logs = logsData.logs || [];
        this._currentNotifLogs = logs;

        const stats = statsRes?.stats || {
            total: logsData.total || logs.length,
            sent: logs.filter(l => l.status === 'sent').length,
            failed: logs.filter(l => l.status === 'failed').length,
            whatsapp: logs.filter(l => l.channel === 'whatsapp').length,
            telegram: logs.filter(l => l.channel === 'telegram').length
        };

        const isWaConnected = (wa.status === 'CONNECTED');
        const isWaQrReady = (wa.status === 'QR_READY');

    const contentHtml = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:14px; margin-bottom:16px;">
        
        <!-- 1. WHATSAPP WEB SERVICE CARD -->
        <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:22px;">🟢</span>
                    <div>
                        <b style="font-size:14px; color:#0f172a;">خدمة واتساب (whatsapp-web.js)</b>
                        <div style="font-size:11px; color:#64748b;">ربط الحساب عبر مسح الرمز QR</div>
                    </div>
                </div>
                <div id="wa-live-status-pill">
                    ${isWaConnected ? `
                        <span class="status-pill status-active" style="font-size:11px; font-weight:bold; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 10px;">
                            🟢 متصل (${this.escape(wa.info?.pushname || wa.info?.wid || 'نشط')})
                        </span>
                    ` : (isWaQrReady ? `
                        <span class="status-pill" style="font-size:11px; font-weight:bold; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px;">
                            🟡 بانتظار مسح QR
                        </span>
                    ` : `
                        <span class="status-pill status-disabled" style="font-size:11px; font-weight:bold; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:3px 10px;">
                            🔴 ${wa.status || 'غير متصل'}
                        </span>
                    `)}
                </div>
            </div>

            <div id="wa-qr-container" style="text-align:center; min-height:180px; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:12px; margin-bottom:12px;">
                ${isWaConnected ? `
                    <div style="padding:20px; color:#15803d;">
                        <div style="font-size:48px; margin-bottom:8px;">✅</div>
                        <b style="font-size:15px;">حساب الواتساب متصل بنجاح!</b>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">
                            الرقم: <b>${this.escape(wa.info?.wid || 'نشط')}</b> • الاسم: <b>${this.escape(wa.info?.pushname || 'المتصل')}</b>
                        </div>
                        <div style="margin-top:14px; display:flex; gap:8px; justify-content:center;">
                            <button class="mt-btn mt-btn-danger" style="padding:4px 14px; font-size:11.5px;" onclick="App.logoutWhatsApp()">🚪 قطع الاتصال / تبديل الرقم</button>
                            <button class="mt-btn" style="padding:4px 14px; font-size:11.5px;" onclick="App.showTestWhatsAppModal()">🔔 إرسال تجريبي</button>
                        </div>
                    </div>
                ` : `
                    <div id="wa-qr-loading-spinner" style="font-size:12px; color:#64748b;">
                        <div class="spinner" style="width:24px; height:24px; border:3px solid #cbd5e1; border-top-color:#0284c7; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 8px;"></div>
                        جاري جلب رمز الاستجابة السريعة (QR Code)...
                    </div>
                    <img id="wa-qr-img" src="" alt="WhatsApp QR" style="max-width:180px; max-height:180px; border-radius:8px; display:none;" />
                    <div id="wa-qr-instructions" style="display:none; font-size:11.5px; color:#475569; margin-top:8px;">
                        افتح تطبيق واتساب على هاتفك ➔ الأجهزة المرتبطة ➔ ربط جهاز ووجّه الكاميرا نحو الرمز.
                    </div>
                    <div style="margin-top:10px;">
                        <button class="mt-btn" style="padding:3px 10px; font-size:11px;" onclick="App.refreshWhatsAppQr()">🔄 إعادة توليد QR</button>
                    </div>
                `}
            </div>
        </div>

        <!-- 2. TELEGRAM SERVICE CARD -->
        <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:22px;">✈️</span>
                    <div>
                        <b style="font-size:14px; color:#0f172a;">بوت وقناة تليجرام (Telegram Bot)</b>
                        <div style="font-size:11px; color:#64748b;">إشعارات فورية وتقارير إلى مجموعة أو قناة الإدارة</div>
                    </div>
                </div>
                <span class="status-pill ${tg.enabled ? 'status-active' : 'status-disabled'}" style="font-size:11px; font-weight:bold; padding:3px 10px;">
                    ${tg.enabled ? '🟢 مفعّل' : '⚪ معطل'}
                </span>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">رمز توكن البوت (Bot Token):</label>
                    <input type="text" id="cfg-tg-token" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:12px;" value="${this.escape(tg.bot_token || '')}" placeholder="123456789:ABCdefGhIJKlmNoPQRstuvWXyz" />
                </div>

                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">معرف القناة أو المحادثة (Chat ID):</label>
                    <input type="text" id="cfg-tg-chatid" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:12px;" value="${this.escape(tg.chat_id || '')}" placeholder="-1001234567890 أو @channel_name" />
                </div>

                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">رابط Webhook العام لهذه الشبكة (HTTPS):</label>
                    <input type="url" id="cfg-tg-webhook-url" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:12px;" value="${this.escape(tgConfig.webhook_url || '')}" placeholder="https://example.com/telegram_webhook.php" />
                    <small style="display:block;color:#64748b;margin-top:3px;">يجب أن يكون الرابط قابلًا للوصول من خوادم Telegram ومخصصًا للشبكة النشطة.</small>
                </div>

                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">سر Webhook (اختياري):</label>
                    <input type="password" id="cfg-tg-webhook-secret" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:12px;" value="" placeholder="اتركه فارغًا إن لم تستخدم سرًا" autocomplete="new-password" />
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; flex-wrap:wrap; gap:6px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:bold; cursor:pointer;">
                        <input type="checkbox" id="cfg-tg-enabled" ${tg.enabled ? 'checked' : ''} />
                        <span>تفعيل إشعارات تليجرام</span>
                    </label>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; background:#f0fdf4; border-color:#86efac; color:#15803d;" onclick="App.testTelegramAlertDirect()">🔔 فحص البوت</button>
                        <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; background:#eff6ff; border-color:#93c5fd; color:#1d4ed8;" onclick="App.setTelegramWebhookDirect()">🔗 تسجيل Webhook</button>
                        <button type="button" class="mt-btn mt-btn-primary" style="padding:4px 12px; font-size:11px;" onclick="App.saveTelegramSettingsDirect()">💾 حفظ</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 2.5 FIREBASE CLOUD MESSAGING CARD -->
        <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:22px;">🔔</span>
                    <div>
                        <b style="font-size:14px; color:#0f172a;">إشعارات الأندرويد (Firebase FCM)</b>
                        <div style="font-size:11px; color:#64748b;">تنبيهات فورية Push Notifications لهواتف المشرفين والوكلاء</div>
                    </div>
                </div>
                <span class="status-pill ${fb.enabled ? 'status-active' : 'status-disabled'}" style="font-size:11px; font-weight:bold; padding:3px 10px;">
                    ${fb.enabled ? '🟢 مفعّل' : '⚪ معطل'}
                </span>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">معرف المشروع (Firebase Project ID):</label>
                    <input type="text" id="cfg-fb-project" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:12px;" value="${this.escape(fb.project_id || '')}" placeholder="sam-mikrotik-manager" />
                </div>

                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:12px;">مفتاح الخدمة (Service Account JSON / Server Key):</label>
                    <textarea id="cfg-fb-json" class="mt-input" style="width:100%; direction:ltr; font-family:monospace; font-size:11px; height:56px; resize:vertical;" placeholder='الصق محتوى ملف service-account.json أو Server Key هنا'>${this.escape(fb.service_account_json || fb.server_key || '')}</textarea>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:8px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:bold; cursor:pointer;">
                        <input type="checkbox" id="cfg-fb-enabled" ${fb.enabled ? 'checked' : ''} />
                        <span>تفعيل إشعارات فايربيس السحابية</span>
                    </label>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="mt-btn" style="padding:5px 12px; font-size:11.5px; font-weight:bold; background:#eff6ff; border-color:#93c5fd; color:#1d4ed8;" onclick="App.showFirebaseDevicesModal()">📱 إدارة الأجهزة المسجلة</button>
                        <button type="button" class="mt-btn" style="padding:5px 12px; font-size:11.5px; font-weight:bold; background:#f0fdf4; border-color:#86efac; color:#15803d;" onclick="App.testFirebaseAlertDirect()">🔔 إرسال تجريبي</button>
                        <button type="button" class="mt-btn mt-btn-primary" style="padding:5px 12px; font-size:11.5px; font-weight:bold;" onclick="App.saveFirebaseSettingsDirect()">💾 حفظ الإعدادات</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. SMART CHATBOT & AUTO-RESPONDER CARD -->
        <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:22px;">🤖</span>
                    <div>
                        <b style="font-size:14px; color:#0f172a;">الرد الآلي والاستعلامات الذكية (Chatbot)</b>
                        <div style="font-size:11px; color:#64748b;">كشوفات، مخزون، رصيد كروت، ومبيعات فورية</div>
                    </div>
                </div>
                <span class="status-pill ${bot.enabled ? 'status-active' : 'status-disabled'}" style="font-size:11px; font-weight:bold; padding:3px 10px;">
                    ${bot.enabled ? '🟢 البوت نشط' : '⚪ معطل'}
                </span>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="form-row" style="margin-bottom:0; display:flex; gap:8px;">
                    <div class="form-group" style="flex:1; margin-bottom:0;">
                        <label style="font-weight:700; font-size:11.5px;">اسم الشبكة بالردود:</label>
                        <input type="text" id="cfg-bot-network" class="mt-input" style="width:100%; font-size:12px;" value="${this.escape(bot.network_name || 'شبكة ميكروتك مانجر')}" />
                    </div>
                    <div class="form-group" style="flex:1; margin-bottom:0;">
                        <label style="font-weight:700; font-size:11.5px;">رقم الدعم الفني:</label>
                        <input type="text" id="cfg-bot-support" class="mt-input" style="width:100%; direction:ltr; font-size:12px;" value="${this.escape(bot.support_phone || '777000000')}" />
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-weight:700; font-size:11.5px;">رسالة الترحيب وقائمة الأوامر:</label>
                    <input type="text" id="cfg-bot-welcome" class="mt-input" style="width:100%; font-size:12px;" value="${this.escape(bot.welcome_msg || 'مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐')}" />
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; flex-wrap:wrap; gap:8px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:bold; cursor:pointer;">
                        <input type="checkbox" id="cfg-bot-enabled" ${bot.enabled ? 'checked' : ''} />
                        <span>تفعيل الرد التلقائي</span>
                    </label>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="mt-btn mt-btn-primary" style="padding:4px 12px; font-size:11.5px; font-weight:bold;" onclick="App.showChatbotSimulatorModal()">💬 محاكي واستعلامات البوت ➔</button>
                        <button type="button" class="mt-btn" style="padding:4px 10px; font-size:11px; background:#f0fdf4; border-color:#86efac; color:#15803d;" onclick="App.saveChatbotSettingsDirect()">💾 حفظ</button>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <!-- 3. NOTIFICATION TRIGGERS MATRIX -->
    <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:16px; margin-bottom:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
            <div>
                <b style="font-size:14px; color:#0f172a;">⚙️ قنوات التنبيهات والأحداث التلقائية (Automated Event Triggers)</b>
                <div style="font-size:11.5px; color:#64748b;">حدد القنوات التي تُرسل إليها الإشعارات لكل حدث في المنظومة</div>
            </div>
            <button class="mt-btn mt-btn-primary" style="font-weight:bold; font-size:12px; padding:5px 16px;" onclick="App.saveNotificationTriggersSettings()">💾 حفظ الإعدادات</button>
        </div>

        <div style="overflow-x:auto;">
            <table class="mt-table" style="width:100%; font-size:12px;">
                <thead>
                    <tr>
                        <th style="text-align:right;">نوع الحدث / الإشعار</th>
                        <th style="text-align:center; width:130px;">واتساب (WhatsApp) 🟢</th>
                        <th style="text-align:center; width:130px;">تليجرام (Telegram) ✈️</th>
                        <th style="text-align:center; width:140px;">فايربيس (FCM Push) 🔔</th>
                        <th style="text-align:right;">المستلم المستهدف</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><b>🧾 فواتير مبيعات الكروت والجملة</b><br><small style="color:#64748b;">إشعار فوري بتفاصيل الفاتورة والكمية والمبالغ</small></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-wa-sales" ${wa.notify_sales ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-tg-sales" ${tg.notify_sales ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-fb-sales" ${fb.notify_sales ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td>المشتري (واتساب/تطبيق) + الإدارة العامة (تليجرام/فايربيس)</td>
                    </tr>
                    <tr>
                        <td><b>💵 سندات القبض والصرف المالية</b><br><small style="color:#64748b;">إشعار بالدفعات والمبالغ المقيدة والرصيد</small></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-wa-receipts" ${wa.notify_receipts ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-tg-receipts" ${tg.notify_receipts ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-fb-receipts" ${fb.notify_receipts ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td>العميل (واتساب/تطبيق) + قناة الإدارة (تليجرام/فايربيس)</td>
                    </tr>
                    <tr>
                        <td><b>📦 تحويلات الكروت والعهد المخزنية</b><br><small style="color:#64748b;">إشعار بعدد الأوراق والكروت وقيمة العهدة</small></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-wa-transfers" ${wa.notify_transfers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-tg-transfers" ${tg.notify_transfers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-fb-transfers" ${fb.notify_transfers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td>المستلم والمصدر (واتساب/تطبيق) + قناة الإدارة</td>
                    </tr>
                    <tr>
                        <td><b>🚨 انقطاع وعودة السيرفرات والأبراج</b><br><small style="color:#64748b;">تنبيه طارئ بصوت إنذار عند سقوط اتصال راوتر</small></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-wa-routers" ${wa.notify_routers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-tg-routers" ${tg.notify_routers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-fb-routers" ${fb.notify_routers ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td>المدير العام والمهندسون (تطبيق الأندرويد + تليجرام + واتساب)</td>
                    </tr>
                    <tr>
                        <td><b>📉 تنبيهات تدني ونفاد مخزون الكروت</b><br><small style="color:#64748b;">تنبيه عند اقتراب نفاد فئات معينة</small></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-wa-lowstock" ${wa.notify_low_stock ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-tg-lowstock" ${tg.notify_low_stock ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td style="text-align:center;"><input type="checkbox" id="trig-fb-lowstock" ${fb.notify_low_stock ? 'checked' : ''} style="transform:scale(1.2);" /></td>
                        <td>الإدارة والموزع المشرف (تطبيق الأندرويد)</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- 4. REDESIGNED NOTIFICATION LOGS & HISTORY -->
    <div style="background:var(--bg-window, #fff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        
        <!-- Section Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
            <div>
                <b style="font-size:15px; color:#0f172a; display:flex; align-items:center; gap:8px;">
                    <span>📜</span> <span>سجل الرسائل والتنبيهات الصادرة</span>
                </b>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                    متابعة تسليم الرسائل عبر واتساب وتليجرام، إمكانية إعادة الإرسال بنقرة واحدة، ومعاينة النصوص.
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:4px 12px;" onclick="App.renderNotifications()">🔄 تحديث السجل</button>
            </div>
        </div>

        <!-- 5 Interactive Filter Summary KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; margin-bottom:14px;">
            <div style="background:${!this.notifLogStatusFilter && !this.notifLogChannelFilter ? '#f0f9ff' : '#f8fafc'}; border:1px solid ${!this.notifLogStatusFilter && !this.notifLogChannelFilter ? '#0284c7' : '#e2e8f0'}; border-radius:8px; padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; transition:all 0.15s;" onclick="App.notifLogChannelFilter=''; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();" title="عرض كل الرسائل">
                <div style="font-size:24px;">📊</div>
                <div>
                    <div style="font-size:11px; color:#64748b; font-weight:700;">كافة الرسائل</div>
                    <div style="font-size:17px; font-weight:800; color:#0f172a;">${stats.total}</div>
                </div>
            </div>

            <div style="background:${this.notifLogStatusFilter === 'sent' ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${this.notifLogStatusFilter === 'sent' ? '#16a34a' : '#e2e8f0'}; border-radius:8px; padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; transition:all 0.15s;" onclick="App.notifLogStatusFilter='sent'; App.notifLogPage=1; App.renderNotifications();" title="تصفية الرسائل المرسلة">
                <div style="font-size:24px;">🟢</div>
                <div>
                    <div style="font-size:11px; color:#15803d; font-weight:700;">تم الإرسال بنجاح</div>
                    <div style="font-size:17px; font-weight:800; color:#15803d;">${stats.sent}</div>
                </div>
            </div>

            <div style="background:${this.notifLogStatusFilter === 'failed' ? '#fef2f2' : '#f8fafc'}; border:1px solid ${this.notifLogStatusFilter === 'failed' ? '#dc2626' : '#e2e8f0'}; border-radius:8px; padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; transition:all 0.15s;" onclick="App.notifLogStatusFilter='failed'; App.notifLogPage=1; App.renderNotifications();" title="تصفية الرسائل الفاشلة">
                <div style="font-size:24px;">🔴</div>
                <div>
                    <div style="font-size:11px; color:#b91c1c; font-weight:700;">فشل / تعذر الإرسال</div>
                    <div style="font-size:17px; font-weight:800; color:#dc2626;">${stats.failed}</div>
                </div>
            </div>

            <div style="background:${this.notifLogChannelFilter === 'whatsapp' ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${this.notifLogChannelFilter === 'whatsapp' ? '#22c55e' : '#e2e8f0'}; border-radius:8px; padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; transition:all 0.15s;" onclick="App.notifLogChannelFilter='whatsapp'; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();" title="تصفية رسائل الواتساب">
                <div style="font-size:24px;">💬</div>
                <div>
                    <div style="font-size:11px; color:#047857; font-weight:700;">رسائل الواتساب</div>
                    <div style="font-size:17px; font-weight:800; color:#059669;">${stats.whatsapp}</div>
                </div>
            </div>

            <div style="background:${this.notifLogChannelFilter === 'telegram' ? '#f0f9ff' : '#f8fafc'}; border:1px solid ${this.notifLogChannelFilter === 'telegram' ? '#0ea5e9' : '#e2e8f0'}; border-radius:8px; padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; transition:all 0.15s;" onclick="App.notifLogChannelFilter='telegram'; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();" title="تصفية إشعارات التليجرام">
                <div style="font-size:24px;">✈️</div>
                <div>
                    <div style="font-size:11px; color:#0369a1; font-weight:700;">إشعارات التليجرام</div>
                    <div style="font-size:17px; font-weight:800; color:#0284c7;">${stats.telegram}</div>
                </div>
            </div>
        </div>

        <!-- Filter Toolbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <select id="notif-filter-channel" class="mt-select" style="font-size:11.5px; padding:4px 8px;" onchange="App.notifLogChannelFilter=this.value; App.notifLogPage=1; App.renderNotifications();">
                    <option value="">كل القنوات</option>
                    <option value="whatsapp" ${this.notifLogChannelFilter === 'whatsapp' ? 'selected' : ''}>🟢 واتساب (WhatsApp)</option>
                    <option value="telegram" ${this.notifLogChannelFilter === 'telegram' ? 'selected' : ''}>✈️ تليجرام (Telegram)</option>
                    <option value="fcm" ${this.notifLogChannelFilter === 'fcm' ? 'selected' : ''}>🔔 فايربيس (FCM)</option>
                </select>

                <select id="notif-filter-status" class="mt-select" style="font-size:11.5px; padding:4px 8px;" onchange="App.notifLogStatusFilter=this.value; App.notifLogPage=1; App.renderNotifications();">
                    <option value="">كل الحالات</option>
                    <option value="sent" ${this.notifLogStatusFilter === 'sent' ? 'selected' : ''}>🟢 تم الإرسال (Sent)</option>
                    <option value="failed" ${this.notifLogStatusFilter === 'failed' ? 'selected' : ''}>🔴 تعذر الإرسال (Failed)</option>
                </select>

                <input type="text" class="mt-input" style="font-size:11.5px; width:220px; padding:4px 10px;" placeholder="🔍 بحث برقم الهاتف أو الفاتورة..." value="${this.escape(this.notifLogSearch)}" onkeydown="if(event.key==='Enter'){ App.notifLogSearch=this.value; App.notifLogPage=1; App.renderNotifications(); }" oninput="if(this.value===''){ App.notifLogSearch=''; App.notifLogPage=1; App.renderNotifications(); }" />
            </div>

            <div style="display:flex; gap:6px; align-items:center;">
                <select class="mt-select" style="font-size:11px; padding:4px 8px;" onchange="App.notifLogLimit=parseInt(this.value); App.notifLogPage=1; App.renderNotifications();">
                    <option value="25" ${this.notifLogLimit===25 ? 'selected' : ''}>25 سطر</option>
                    <option value="50" ${this.notifLogLimit===50 ? 'selected' : ''}>50 سطر</option>
                    <option value="100" ${this.notifLogLimit===100 ? 'selected' : ''}>100 سطر</option>
                </select>
                ${(this.notifLogChannelFilter || this.notifLogStatusFilter || this.notifLogSearch) ? `
                    <button class="mt-btn" style="padding:4px 8px; font-size:11px; color:#64748b;" onclick="App.notifLogChannelFilter=''; App.notifLogStatusFilter=''; App.notifLogSearch=''; App.notifLogPage=1; App.renderNotifications();" title="إلغاء الفلاتر">✖ مسح الفلتر</button>
                ` : ''}
            </div>
        </div>

        <!-- Clean Compact Table -->
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #e2e8f0;">
            <table class="mt-table" style="width:100%; font-size:11.5px; margin:0; border-collapse:collapse;">
                <thead style="background:#f1f5f9;">
                    <tr>
                        <th style="width:45px; text-align:center;">#</th>
                        <th style="width:95px; text-align:center;">القناة</th>
                        <th style="width:130px; text-align:right;">المرسل منه</th>
                        <th style="width:140px; text-align:right;">نوع المعاملة / الحدث</th>
                        <th style="width:150px; text-align:right;">المستلم</th>
                        <th style="text-align:right;">نص الرسالة والمعاينة</th>
                        <th style="width:115px; text-align:center;">الحالة</th>
                        <th style="width:125px; text-align:center;">التاريخ والوقت</th>
                        <th style="width:130px; text-align:center;">الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.length > 0 ? logs.map((l, idx) => {
                        const evInfo = App.notifEventTypeMap[l.event_type] || { label: l.event_type || 'إشعار عام', icon: '📩', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
                        const isWa = (l.channel === 'whatsapp');
                        const isTg = (l.channel === 'telegram');
                        const isFailed = (l.status === 'failed');
                        const cleanSnippet = App.cleanNotifMessagePreview(l.message_text);
                        const recipientDisplay = l.recipient_phone || l.recipient_chat_id || '—';
                        
                        return `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="font-weight:700; color:#64748b; text-align:center;">${(logsData.page - 1) * logsData.limit + idx + 1}</td>
                            <td style="text-align:center;">
                                ${isWa ? `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:700; font-size:11px; padding:3px 8px;">🟢 واتساب</span>` : 
                                 (isTg ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; font-weight:700; font-size:11px; padding:3px 8px;">✈️ تليجرام</span>` : 
                                 `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700; font-size:11px; padding:3px 8px;">🔔 فايربيس</span>`)}
                            </td>
                            <td style="text-align:right;">
                                <div style="display:flex; flex-direction:column; gap:2px;">
                                    <span style="font-family:monospace; font-size:11px; font-weight:700; color:#0f172a; direction:ltr; text-align:right;">
                                        ${this.escape(l.sender_phone || '—')}
                                    </span>
                                    ${l.network_name ? `<span style="font-size:10px; color:#64748b;">🏢 ${this.escape(l.network_name)}</span>` : ''}
                                </div>
                            </td>
                            <td>
                                <div style="display:flex; flex-direction:column; gap:2px;">
                                    <span class="badge" style="background:${evInfo.bg}; color:${evInfo.color}; border:1px solid ${evInfo.border}; font-size:11px; font-weight:700; width:fit-content;">
                                        ${evInfo.icon} ${evInfo.label}
                                    </span>
                                    ${l.reference_id ? `<span style="font-family:monospace; font-size:10px; color:#64748b;">#${this.escape(l.reference_id)}</span>` : ''}
                                </div>
                            </td>
                            <td>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <b style="font-family:monospace; font-size:12px; color:#0f172a; direction:ltr;">${this.escape(recipientDisplay)}</b>
                                    ${l.recipient_phone ? `
                                        <a href="https://wa.me/${this.escape(l.recipient_phone.replace(/[^0-9]/g, ''))}" target="_blank" style="text-decoration:none; font-size:13px;" title="فتح محادثة واتساب">💬</a>
                                    ` : ''}
                                </div>
                            </td>
                            <td>
                                <div style="max-width:380px;">
                                    <div style="font-size:11.5px; color:#334155; line-height:1.45; max-height:36px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word;">
                                        ${this.escape(cleanSnippet)}
                                    </div>
                                    <button type="button" class="mt-btn" style="padding:1px 0; font-size:10.5px; margin-top:2px; background:none; border:none; color:#0284c7; text-decoration:underline; cursor:pointer;" onclick="App.showNotificationDetailModal(${l.id})">
                                        👁️ معاينة الرسالة كاملة
                                    </button>
                                </div>
                            </td>
                            <td style="text-align:center;">
                                ${!isFailed ? `
                                    <span class="status-pill status-active" style="font-size:11px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px;">
                                        🟢 تم الإرسال
                                    </span>
                                ` : `
                                    <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                                        <span class="status-pill status-disabled" style="font-size:11px; font-weight:700; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; padding:3px 8px; cursor:pointer;" onclick="App.showNotificationDetailModal(${l.id})" title="انقر لعرض سبب الفشل">
                                            🔴 فشل الإرسال
                                        </span>
                                        ${l.error_message ? `<span style="font-size:9.5px; color:#b91c1c; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escape(l.error_message)}">${this.escape(l.error_message)}</span>` : ''}
                                    </div>
                                `}
                            </td>
                            <td style="color:#64748b; font-size:11px; white-space:nowrap; direction:ltr; text-align:center;">
                                🕒 ${l.created_at}
                            </td>
                            <td style="text-align:center;">
                                <div style="display:flex; gap:4px; align-items:center; justify-content:center;">
                                    <button type="button" class="mt-btn ${isFailed ? 'mt-btn-warning' : ''}" style="font-size:11px; padding:3px 8px; border-radius:6px;" onclick="App.retryNotificationLog(${l.id})" title="إعادة إرسال الرسالة">
                                        🔁 ${isFailed ? 'إعادة الإرسال' : 'إرسال ثانية'}
                                    </button>
                                    <button type="button" class="mt-btn" style="font-size:11px; padding:3px 7px; border-radius:6px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;" onclick="App.showNotificationDetailModal(${l.id})" title="عرض التفاصيل">
                                        👁️
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('') : `
                        <tr><td colspan="9" style="text-align:center; padding:32px; color:#94a3b8; font-size:13px;">لا توجد رسائل مسجلة مطابقة للبحث أو الفلتر حالياً</td></tr>
                    `}
                </tbody>
            </table>
        </div>

        <!-- Pagination Bar -->
        ${(logsData.pages || logsData.total_pages) > 1 ? `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px; padding:4px 8px;">
                <div>صفحة <b>${logsData.page}</b> من <b>${logsData.pages || logsData.total_pages}</b> (إجمالي <b>${logsData.total}</b> رسالة)</div>
                <div style="display:flex; gap:4px;">
                    <button class="mt-btn" style="padding:3px 10px;" ${logsData.page <= 1 ? 'disabled' : ''} onclick="App.notifLogPage--; App.renderNotifications();">◀ السابق</button>
                    <button class="mt-btn" style="padding:3px 10px;" ${logsData.page >= (logsData.pages || logsData.total_pages) ? 'disabled' : ''} onclick="App.notifLogPage++; App.renderNotifications();">التالي ▶</button>
                </div>
            </div>
        ` : ''}
    </div>
    `;

    const shellOpts = {
        id: 'notifications',
        archetype: 'designer',
        icon: '💬',
        title: 'مركز الرسائل والتنبيهات المتكامل (WhatsApp & Telegram & FCM)',
        eyebrow: 'الاتصالات والأتمتة',
        subtitle: 'إدارة وتوجيه رسائل وتنبيهات الفواتير والسندات وانقطاع السيرفرات والرد الآلي الذكي',
        actions: [
            { label: 'أجهزة وهواتف الإشعارات (FCM)', icon: '📱', variant: 'secondary', onclick: 'App.showFirebaseDevicesModal()' },
            { label: 'إدارة قوالب واعتماد الرسائل ↗', icon: '📱', variant: 'success', onclick: "App.switchTab('whatsapp_manager')" },
            { label: 'إرسال رسالة مباشرة', icon: '✉️', variant: 'primary', onclick: 'App.showDirectMessengerModal()' },
            { label: 'تحديث', icon: '🔄', variant: 'secondary', onclick: 'App.renderNotifications()' }
        ],
        stats: [
            { label: 'كافة الرسائل', value: stats.total, icon: '📊', tone: 'blue', onclick: "App.notifLogChannelFilter=''; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();", active: !this.notifLogStatusFilter && !this.notifLogChannelFilter, title: 'عرض كل الرسائل' },
            { label: 'تم الإرسال بنجاح', value: stats.sent, icon: '🟢', tone: 'green', onclick: "App.notifLogStatusFilter='sent'; App.notifLogPage=1; App.renderNotifications();", active: this.notifLogStatusFilter === 'sent', title: 'تصفية الرسائل المرسلة' },
            { label: 'فشل / تعذر الإرسال', value: stats.failed, icon: '🔴', tone: 'red', onclick: "App.notifLogStatusFilter='failed'; App.notifLogPage=1; App.renderNotifications();", active: this.notifLogStatusFilter === 'failed', title: 'تصفية الرسائل الفاشلة' },
            { label: 'رسائل الواتساب', value: stats.whatsapp, icon: '💬', tone: 'emerald', onclick: "App.notifLogChannelFilter='whatsapp'; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();", active: this.notifLogChannelFilter === 'whatsapp', title: 'تصفية رسائل الواتساب' },
            { label: 'إشعارات التليجرام', value: stats.telegram, icon: '✈️', tone: 'sky', onclick: "App.notifLogChannelFilter='telegram'; App.notifLogStatusFilter=''; App.notifLogPage=1; App.renderNotifications();", active: this.notifLogChannelFilter === 'telegram', title: 'تصفية إشعارات التليجرام' }
        ],
        content: contentHtml
    };

    if (window.SamUI?.PageBuilder) {
        mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
    } else {
        mainView.innerHTML = contentHtml;
    }

    // Start QR polling if not connected
        if (!isWaConnected) {
            this.refreshWhatsAppQr();
            this.waPollTimer = setInterval(() => {
                this.pollWhatsAppQrStatus();
            }, 4000);
        }
    } catch(err) {
        console.error('Error in renderNotifications:', err);
        mainView.innerHTML = `
            <div style="padding:40px 20px; text-align:center; background:#fff; border:1px solid #fca5a5; border-radius:10px; margin:20px auto; max-width:650px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                <div style="font-size:36px; margin-bottom:10px;">⚠️</div>
                <b style="font-size:16px; color:#dc2626;">تعذر عرض مركز الرسائل والتنبيهات بالكامل</b>
                <div style="font-size:12px; color:#64748b; margin-top:6px; line-height:1.6;">
                    ${this.escape(err?.message || err)}
                </div>
                <div style="margin-top:16px; display:flex; justify-content:center; gap:8px;">
                    <button class="mt-btn mt-btn-primary" onclick="App.renderNotifications()">🔄 إعادة المحاولة</button>
                    <button class="mt-btn" onclick="App.switchTab('whatsapp_manager')">📱 إدارة قوالب الواتساب (WhatsApp Manager)</button>
                </div>
            </div>
        `;
    }
};

App.pollWhatsAppQrStatus = async function() {
    if (this.currentTab !== 'notifications') {
        if (this.waPollTimer) clearInterval(this.waPollTimer);
        return;
    }

    const res = await this.api('get_whatsapp_qr');
    if (res && res.status === 'CONNECTED') {
        if (this.waPollTimer) clearInterval(this.waPollTimer);
        this.toast('✅ تم ربط واتساب بنجاح!', 'success');
        this.renderNotifications();
        return;
    }

    if (res && res.qr) {
        const img = document.getElementById('wa-qr-img');
        const spinner = document.getElementById('wa-qr-loading-spinner');
        const instr = document.getElementById('wa-qr-instructions');
        if (img) {
            img.src = res.qr;
            img.style.display = 'inline-block';
        }
        if (spinner) spinner.style.display = 'none';
        if (instr) instr.style.display = 'block';
    }
};

App.refreshWhatsAppQr = async function() {
    const spinner = document.getElementById('wa-qr-loading-spinner');
    if (spinner) spinner.style.display = 'block';
    const res = await this.api('get_whatsapp_qr');
    if (res && res.qr) {
        const img = document.getElementById('wa-qr-img');
        const instr = document.getElementById('wa-qr-instructions');
        if (img) {
            img.src = res.qr;
            img.style.display = 'inline-block';
        }
        if (spinner) spinner.style.display = 'none';
        if (instr) instr.style.display = 'block';
    }
};

App.logoutWhatsApp = async function() {
    if (!confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من جلسة الواتساب الحالية؟')) return;
    const res = await this.api('logout_whatsapp', {}, 'POST');
    this.toast('تم تسجيل الخروج من واتساب', 'info');
    this.renderNotifications();
};

App.testTelegramAlertDirect = async function() {
    const token = document.getElementById('cfg-tg-token')?.value?.trim();
    const chat = (document.getElementById('cfg-tg-chatid')?.value || document.getElementById('cfg-tg-chat')?.value || '').trim();
    if (!token || !chat) {
        this.toast('يرجى إدخال Bot Token و Chat ID أولاً', 'warning');
        return;
    }
    const res = await this.api('test_telegram_alert', { custom_token: token, custom_chat_id: chat }, 'POST');
    if (res && res.success) {
        this.toast('✅ تم إرسال رسالة الاختبار إلى تليجرام بنجاح!', 'success');
    } else {
        this.toast(res?.error || 'تعذر إرسال رسالة الاختبار إلى تليجرام', 'danger');
    }
};



App.normalizeYemenPhone = function(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.startsWith('00967')) digits = digits.substring(2);
    if (digits.startsWith('967') && digits.length === 12) return digits;
    if (digits.startsWith('07') && digits.length === 10) return '967' + digits.substring(1);
    if (digits.startsWith('7') && digits.length === 9) return '967' + digits;
    if (digits.startsWith('0') && (digits.length === 8 || digits.length === 9)) return '967' + digits.substring(1);
    if (digits.length === 9) return '967' + digits;
    return digits;
};

App.formatPhoneDisplay = function(phone) {
    if (!phone) return '';
    const norm = App.normalizeYemenPhone(phone);
    if (norm.startsWith('967') && norm.length === 12) {
        return `+967 ${norm.substring(3, 6)} ${norm.substring(6, 9)} ${norm.substring(9)}`;
    }
    return norm || phone;
};

App.onPhoneInputAutoFormat = function(inputEl) {
    if (!inputEl) return;
    let val = inputEl.value;
    let digits = val.replace(/[^0-9]/g, '');
    if (digits.startsWith('00967')) digits = digits.substring(5);
    else if (digits.startsWith('967')) digits = digits.substring(3);
    else if (digits.startsWith('07')) digits = digits.substring(1);
    else if (digits.startsWith('0')) digits = digits.substring(1);
    if (digits.length > 9) digits = digits.substring(0, 9);
    inputEl.value = digits;
};

// old norm placeholder
App._oldNorm = function(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.startsWith('00967')) digits = digits.substring(2);
    if (digits.startsWith('967') && digits.length === 12) return digits;
    if (digits.startsWith('07') && digits.length === 10) return '967' + digits.substring(1);
    if (digits.startsWith('7') && digits.length === 9) return '967' + digits;
    if (digits.startsWith('0') && (digits.length === 8 || digits.length === 9)) return '967' + digits.substring(1);
    if (digits.length === 9) return '967' + digits;
    return digits;
};

App.showTestWhatsAppModal = function() {
    let phone = prompt('أدخل رقم الهاتف لاختبار الإرسال (مثال: 777423071 أو 967777423071):');
    if (!phone) return;
    phone = this.normalizeYemenPhone(phone);
    this.api('test_whatsapp_message', { phone: phone, message: 'مرحباً بك! هذه رسالة اختبارية لتأكيد نجاح ربط منظومة ميكروتك مانجر بواتساب 🌐' }, 'POST').then(res => {
        if (res && res.success) {
            this.toast('✅ تم إرسال الرسالة التجريبية إلى واتساب بنجاح إلى الرقم: ' + phone, 'success');
            this.renderNotifications();
        } else {
            this.toast(res?.error || 'تعذر إرسال رسالة الواتساب', 'danger');
        }
    });
};

App.saveChatbotSettingsDirect = async function() {
    const previous = this.chatbotSettings || {};
    const payload = {
        enabled: document.getElementById('cfg-bot-enabled')?.checked ? 1 : 0,
        allow_subscribers: previous.allow_subscribers === false ? 0 : 1,
        allow_pos: previous.allow_pos === false ? 0 : 1,
        allow_admins: previous.allow_admins === false ? 0 : 1,
        network_name: document.getElementById('cfg-bot-network')?.value?.trim() || '',
        support_phone: document.getElementById('cfg-bot-support')?.value?.trim() || '',
        welcome_msg: document.getElementById('cfg-bot-welcome')?.value?.trim() || ''
    };
    const res = await this.api('save_chatbot_settings', payload, 'POST');
    if (res?.success) {
        this.chatbotSettings = res.settings || { ...previous, ...payload };
        this.toast(res.message || 'تم حفظ إعدادات الرد الآلي بنجاح', 'success');
    } else {
        this.toast(res?.error || 'تعذر حفظ إعدادات الرد الآلي', 'danger');
    }
};

App.saveNotificationTriggersSettings = async function() {
    const fbJsonVal = document.getElementById('cfg-fb-json')?.value?.trim() || '';
    const isJson = fbJsonVal.startsWith('{');
    const payload = {
        whatsapp_enabled: '1',
        whatsapp_notify_sales: document.getElementById('trig-wa-sales')?.checked ? '1' : '0',
        whatsapp_notify_receipts: document.getElementById('trig-wa-receipts')?.checked ? '1' : '0',
        whatsapp_notify_transfers: document.getElementById('trig-wa-transfers')?.checked ? '1' : '0',
        whatsapp_notify_routers: document.getElementById('trig-wa-routers')?.checked ? '1' : '0',
        whatsapp_notify_low_stock: document.getElementById('trig-wa-lowstock')?.checked ? '1' : '0',
        telegram_enabled: document.getElementById('cfg-tg-enabled')?.checked ? '1' : '0',
        telegram_bot_token: document.getElementById('cfg-tg-token')?.value?.trim() || '',
        telegram_chat_id: (document.getElementById('cfg-tg-chatid')?.value || document.getElementById('cfg-tg-chat')?.value || '').trim(),
        telegram_webhook_secret: document.getElementById('cfg-tg-webhook-secret')?.value?.trim() || '',
        telegram_notify_sales: document.getElementById('trig-tg-sales')?.checked ? '1' : '0',
        telegram_notify_receipts: document.getElementById('trig-tg-receipts')?.checked ? '1' : '0',
        telegram_notify_transfers: document.getElementById('trig-tg-transfers')?.checked ? '1' : '0',
        telegram_notify_routers: document.getElementById('trig-tg-routers')?.checked ? '1' : '0',
        telegram_notify_low_stock: document.getElementById('trig-tg-lowstock')?.checked ? '1' : '0',
        firebase_enabled: document.getElementById('cfg-fb-enabled')?.checked ? '1' : '0',
        firebase_project_id: document.getElementById('cfg-fb-project')?.value?.trim() || '',
        firebase_service_account_json: isJson ? fbJsonVal : '',
        firebase_server_key: !isJson ? fbJsonVal : '',
        firebase_notify_sales: document.getElementById('trig-fb-sales')?.checked ? '1' : '0',
        firebase_notify_receipts: document.getElementById('trig-fb-receipts')?.checked ? '1' : '0',
        firebase_notify_transfers: document.getElementById('trig-fb-transfers')?.checked ? '1' : '0',
        firebase_notify_routers: document.getElementById('trig-fb-routers')?.checked ? '1' : '0',
        firebase_notify_low_stock: document.getElementById('trig-fb-lowstock')?.checked ? '1' : '0'
    };

    const res = await this.api('save_notification_settings', payload, 'POST');
    if (res && res.success) {
        this.toast('✅ تم حفظ إعدادات الرسائل والتنبيهات بنجاح!', 'success');
    } else {
        this.toast(res?.error || 'تعذر حفظ الإعدادات', 'danger');
    }
};

App.onNotifLogSearch = function(val) {
    clearTimeout(this.notifSearchDebounce);
    this.notifSearchDebounce = setTimeout(() => {
        this.notifLogSearch = val;
        this.notifLogPage = 1;
        this.renderNotifications();
    }, 350);
};

App.showDirectMessengerModal = async function(defaultPhone = '', defaultMsg = '', defaultAdminId = null) {
    const adminsRes = await this.api('get_admins');
    const admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);

    const modalHtml = `
    <div class="mt-modal-backdrop" id="messenger-modal-backdrop" onclick="if(event.target===this) document.getElementById('messenger-modal-backdrop').remove()">
        <div class="mt-modal" style="width:580px; max-width:95vw; border-radius:10px;">
            <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff;">
                <span style="font-weight:bold; font-size:14px;">✉️ إرسال رسالة وتنبيه مباشر (Direct Messenger)</span>
                <span style="cursor:pointer;" onclick="document.getElementById('messenger-modal-backdrop').remove()">✕</span>
            </div>
            <form onsubmit="App.submitDirectMessageForm(event)">
                <div class="mt-modal-body" style="padding:16px;">
                    
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700;">القناة المستخدمة للإرسال:</label>
                            <select id="msg-channel" class="mt-select" style="width:100%;">
                                <option value="whatsapp">🟢 واتساب فقط (WhatsApp)</option>
                                <option value="telegram">✈️ تليجرام فقط (Telegram)</option>
                                <option value="all">🌐 واتساب وتليجرام معاً</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label style="font-weight:700;">نوع المستلم:</label>
                            <select id="msg-recipient-type" class="mt-select" style="width:100%;" onchange="document.getElementById('msg-admin-select-box').style.display = (this.value==='admin') ? 'block' : 'none'; document.getElementById('msg-custom-phone-box').style.display = (this.value==='custom') ? 'block' : 'none';">
                                <option value="admin" ${defaultAdminId ? 'selected' : ''}>👤 مستخدم / موزع / نقطة بيع مسجل</option>
                                <option value="custom" ${(!defaultAdminId && defaultPhone) ? 'selected' : ''}>📞 رقم هاتف مخصص</option>
                            </select>
                        </div>
                    </div>

                    <div id="msg-admin-select-box" class="form-group" style="margin-bottom:12px; display:${defaultAdminId || !defaultPhone ? 'block' : 'none'};">
                        <label style="font-weight:700;">اختر الحساب المستلم:</label>
                        <div style="position:relative;">
                            <input type="text" list="msg-admin-list" id="msg-admin-input" class="mt-input" style="width:100%; font-weight:700; font-size:13px;" placeholder="🔍 ابحث بالاسم، اليوزر، أو رقم الهاتف أو اختر..." oninput="App.syncAdminCombobox(this, 'msg-admin-id', 'msg-admin-list')" onchange="App.syncAdminCombobox(this, 'msg-admin-id', 'msg-admin-list')" />
                            <input type="hidden" id="msg-admin-id" value="${defaultAdminId || ''}" />
                            <datalist id="msg-admin-list">
                                ${admins.map(a => `<option data-id="${a.id}" data-search="${this.escape(((a.fullname||'') + ' ' + (a.username||'') + ' ' + (a.phone||'') + ' ' + (a.role_name_ar||a.role||'')).toLowerCase())}" value="${this.escape(a.fullname)} (@${this.escape(a.username)}) - [${this.escape(a.role_name_ar || a.role)}] ${a.phone ? `(${this.escape(a.phone)})` : '' }">${this.escape(a.fullname)} (@${this.escape(a.username)})</option>`).join('')}
                            </datalist>
                        </div>
                    </div>

                    <div id="msg-custom-phone-box" class="form-group" style="margin-bottom:12px; display:${!defaultAdminId && defaultPhone ? 'block' : 'none'};">
                        <label style="font-weight:700;">رقم الهاتف / الواتساب:</label>
                        <div class="phone-input-group" style="display:flex; direction:ltr; align-items:stretch; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-window);">
    <span style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:12.5px; padding:0 10px; display:inline-flex; align-items:center; border-right:1px solid #bae6fd; user-select:none; font-family:monospace;">
        🇾🇪 +967
    </span>
    <input type="tel" id="msg-custom-phone" class="mt-input" style="flex:1; border:none; border-radius:0; direction:ltr; font-family:monospace; font-weight:700; font-size:14px; padding:8px 10px;" value="${this.escape(defaultPhone.replace(/^(?:\+?967|00967|0)+/, ''))}" placeholder="77XXXXXXX (9 أرقام)" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" />
</div>
                    </div>

                    <div class="form-group" style="margin-bottom:0;">
                        <label style="font-weight:700;">نص الرسالة:</label>
                        <textarea id="msg-text" class="mt-input" style="width:100%; min-height:110px; font-family:inherit; padding:8px;" placeholder="اكتب نص الرسالة أو التنبيه هنا..." required>${this.escape(defaultMsg)}</textarea>
                    </div>

                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="document.getElementById('messenger-modal-backdrop').remove()">${this.t('cancel')}</button>
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:bold; padding:7px 24px;">📤 إرسال الرسالة الآن</button>
                </div>
            </form>
        </div>
    </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);
};

App.submitDirectMessageForm = async function(e) {
    e.preventDefault();
    const channel = document.getElementById('msg-channel')?.value;
    const recType = document.getElementById('msg-recipient-type')?.value;
    const adminId = document.getElementById('msg-admin-id')?.value;
    const phone = document.getElementById('msg-custom-phone')?.value?.trim();
    const msg = document.getElementById('msg-text')?.value?.trim();

    if (!msg) {
        this.toast('يرجى إدخال نص الرسالة', 'warning');
        return;
    }

    const payload = {
        channel: channel,
        recipient_type: recType,
        admin_id: (recType === 'admin') ? adminId : null,
        phone: (recType === 'custom') ? phone : null,
        message: msg
    };

    const res = await this.api('send_custom_notification', payload, 'POST');
    if (res && res.success) {
        this.toast('✅ تم إرسال الرسالة بنجاح!', 'success');
        document.getElementById('messenger-modal-backdrop')?.remove();
        if (this.currentTab === 'notifications') this.renderNotifications();
    } else {
        this.toast(res?.error || 'تعذر إرسال الرسالة', 'danger');
    }
};


App.testFirebaseAlertDirect = async function() {
    const title = prompt('أدخل عنوان التنبيه التجريبي:', '🔔 تنبيه اختباري من SAM');
    if (title === null) return;
    const body = prompt('أدخل نص التنبيه:', 'تم استقبال الإشعار الفوري بنجاح على هواتف الأندرويد 🌐');
    if (body === null) return;

    this.toast('جاري فحص الاتصال وإرسال التنبيه الفوري عبر Firebase...', 'info');
    
    // In-app native notification trigger if running inside Android WebView
    if (window.AndroidBridge && typeof window.AndroidBridge.postNotification === 'function') {
        try {
            window.AndroidBridge.postNotification(title, body);
        } catch (e) {
            console.warn('Native notification post failed:', e);
        }
    }

    const res = await this.api('test_firebase_push', { title, body }, 'POST');
    if (res && res.success) {
        if (res.sent_count > 0) {
            this.toast(`✅ تم إرسال الإشعار الفوري بنجاح! (تم التسليم لـ ${res.sent_count} جهاز)`, 'success', 5000);
        } else {
            this.toast(res.message || '✅ تم التحقق من اتصال Firebase بنجاح 100%! (لا توجد هواتف مسجلة حالياً)', 'info', 7000);
        }
        if (typeof this.renderNotifications === 'function') this.renderNotifications();
    } else {
        const errMsg = res?.error || res?.reason || 'تعذر إرسال الإشعار الفوري.';
        let friendly = errMsg;
        if (errMsg === 'NO_DEVICES_REGISTERED') {
            friendly = '⚠️ لا توجد أجهزة هواتف مسجلة حالياً. قم بفتح التطبيق من الهاتف أو اضغط على "الأجهزة المسجلة" لتسجيل جهازك.';
        } else if (errMsg === 'FIREBASE_NOT_CONFIGURED') {
            friendly = '⚠️ لم يتم ضبط مفتاح Service Account JSON أو مفتاح السيرفر في إعدادات فايربيس.';
        } else if (errMsg === 'FIREBASE_DISABLED') {
            friendly = '⚠️ خدمة إشعارات فايربيس معطلة حالياً. يرجى تفعيلها من إعدادات التنبيهات.';
        }
        this.toast(friendly, 'danger', 6000);
    }
};

App.saveFirebaseSettingsDirect = async function() {
    const fbJsonVal = document.getElementById('cfg-fb-json')?.value?.trim() || '';
    let isJson = false;
    try {
        if (fbJsonVal.startsWith('{') && fbJsonVal.endsWith('}')) {
            JSON.parse(fbJsonVal);
            isJson = true;
        }
    } catch(e) {}

    const payload = {
        firebase_enabled: document.getElementById('cfg-fb-enabled')?.checked ? '1' : '0',
        firebase_project_id: document.getElementById('cfg-fb-project')?.value?.trim() || '',
        firebase_service_account_json: isJson ? fbJsonVal : '',
        firebase_server_key: !isJson ? fbJsonVal : ''
    };

    this.toast('جاري حفظ إعدادات إشعارات فايربيس...', 'info');
    const res = await this.api('save_notification_settings', payload, 'POST');
    if (res && res.success) {
        this.toast('✅ تم حفظ إعدادات إشعارات فايربيس (FCM) بنجاح!', 'success');
        if (typeof this.renderNotifications === 'function') this.renderNotifications();
    } else {
        this.toast(res?.error || 'تعذر حفظ الإعدادات', 'danger');
    }
};

App.showFirebaseDevicesModal = async function() {
    this.toast('جاري تحميل قائمة الأجهزة المسجلة...', 'info');
    const res = await this.api('get_fcm_devices');
    const devices = res?.devices || [];

    const content = `
        <div style="min-width:320px; max-width:680px;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px; margin-bottom:14px; color:#1e40af; font-size:12.5px; line-height:1.5;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:800; margin-bottom:4px;">
                    <span style="font-size:18px;">💡</span>
                    <span>كيف يتم تسجيل الهواتف والأجهزة واستقبال الإشعارات؟</span>
                </div>
                <div>
                    1. <b>تطبيق الأندرويد (Android App)</b>: عند فتح التطبيق وتسجيل الدخول بحساب المشرف أو الوكيل، يقوم التطبيق بربط رمز الجهاز تلقائياً مع خادم Firebase وسيظهر في هذا الجدول فوراً.<br>
                    2. <b>التنبيهات الفورية</b>: يستقبل الهاتف إشعارات فورية (Push Notifications) عند فصل الراوترات، عمليات الشحن والمبيعات، تسجيل الدخول، والتنبيهات الأمنية حتى والتطبيق مغلق.<br>
                    3. <b>التسجيل التجريبي</b>: يمكنك الضغط على زر <b>«➕ تسجيل جهازي الحالي للاختبار»</b> بالأسفل لتسجيل المتصفح واختبار إرسال الإشعارات الآن.
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <b style="font-size:14px; color:#0f172a;">📱 قائمة الأجهزة والهواتف المسجلة (${devices.length})</b>
                <button type="button" class="mt-btn mt-btn-sm mt-btn-primary" onclick="App.registerCurrentDeviceManual()" style="font-size:12px; font-weight:bold;">
                    ➕ تسجيل جهازي الحالي للاختبار
                </button>
            </div>

            ${devices.length > 0 ? `
                <div style="max-height:320px; overflow-y:auto; border:1px solid var(--border-color, #cbd5e1); border-radius:8px;">
                    <table class="mt-table" style="font-size:12px; width:100%; margin:0;">
                        <thead>
                            <tr style="background:var(--bg-main, #f8fafc);">
                                <th>المستخدم / الحساب</th>
                                <th>اسم ونوع الجهاز</th>
                                <th>المنصة</th>
                                <th>الحالة</th>
                                <th>آخر اتصال</th>
                                <th style="text-align:center;">إلغاء التنشيط</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${devices.map(d => `
                                <tr>
                                    <td><b>${this.escape(d.fullname || d.username || ('مستخدم #' + d.admin_id))}</b></td>
                                    <td>${this.escape(d.device_name || 'هاتف أندرويد')}</td>
                                    <td><code>${this.escape(d.platform || 'android')}</code></td>
                                    <td><span class="status-pill ${d.is_active ? 'status-active' : 'status-disabled'}" style="font-size:10px;">${d.is_active ? '🟢 نشط' : '⚪ معطل'}</span></td>
                                    <td style="font-size:11px; color:#64748b;">${d.last_used_at || d.created_at}</td>
                                    <td style="text-align:center;">
                                        <button type="button" class="mt-btn mt-btn-xs mt-btn-danger" title="إلغاء تنشيط الجهاز" onclick="App.unregisterFcmDevice('${this.escape(d.fcm_token)}')" style="padding:2px 8px; font-size:11px;">
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align:center; padding:32px 16px; color:#64748b; font-size:13px; background:var(--bg-main, #f8fafc); border-radius:8px; border:1px dashed var(--border-color, #cbd5e1);">
                    <div style="font-size:28px; margin-bottom:6px;">📱</div>
                    <b>لم يتم تسجيل أي هواتف بعد في قاعدة البيانات.</b><br>
                    <small style="display:block; margin-top:6px; color:#94a3b8;">قم بتثبيت تطبيق الأندرويد وتسجيل الدخول، أو اضغط زر <b>«➕ تسجيل جهازي الحالي للاختبار»</b> أعلاه للتجربة.</small>
                </div>
            `}

            <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <button type="button" class="mt-btn mt-btn-success" onclick="App.testFirebaseAlertDirect()" style="font-size:12.5px; font-weight:bold;">
                    🔔 إرسال تنبيه تجريبي لجميع الأجهزة النشطة
                </button>
                <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
            </div>
        </div>
    `;
    this.showModal('📱 أجهزة إشعارات Firebase (FCM)', content);
};

App.registerCurrentDeviceManual = async function() {
    let devName = 'متصفح/هاتف تجريبي';
    if (window.AndroidBridge && typeof window.AndroidBridge.getDeviceName === 'function') {
        try { devName = window.AndroidBridge.getDeviceName(); } catch(e){}
    } else if (navigator.userAgent) {
        devName = /Android/i.test(navigator.userAgent) ? 'هاتف أندرويد (متصفح)' : 'جهاز إداري (كمبيوتر)';
    }

    const token = 'token_' + (this.adminId || '1') + '_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    
    this.toast('جاري تسجيل الجهاز...', 'info');
    const res = await this.api('register_fcm_token', {
        fcm_token: token,
        device_name: devName,
        platform: /Android/i.test(navigator.userAgent) ? 'android' : 'web',
        app_version: '1.0.0',
        admin_id: this.adminId || 1
    }, 'POST');

    if (res && res.success) {
        this.toast('✅ تم تسجيل الجهاز بنجاح! يمكنك الآن تجربة إرسال الإشعارات.', 'success');
        this.showFirebaseDevicesModal();
    } else {
        this.toast(res?.error || 'تعذر تسجيل الجهاز', 'danger');
    }
};

App.unregisterFcmDevice = async function(token) {
    if (!confirm('هل تريد بالتأكيد إلغاء تنشيط هذا الجهاز؟')) return;
    const res = await this.api('unregister_fcm_token', { fcm_token: token }, 'POST');
    if (res && res.success) {
        this.toast('تم إلغاء تنشيط الجهاز بنجاح', 'success');
        this.showFirebaseDevicesModal();
    } else {
        this.toast(res?.error || 'تعذر إلغاء تنشيط الجهاز', 'danger');
    }
};


// =========================================================================
// WHATSAPP MANAGER EMBEDDED VIEW
// =========================================================================
App.renderWhatsAppManager = function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    if (this.waPollTimer) {
        clearInterval(this.waPollTimer);
        this.waPollTimer = null;
    }

    const iframeContent = `
    <div style="width:100%; height:calc(100vh - 210px); min-height:680px; position:relative; background:#f8fafc; border-radius:10px; border:1px solid var(--border-color, #cbd5e1); overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <iframe id="whatsapp-mgr-iframe" src="whatsapp_manager.php" style="width:100%; height:100%; border:none; display:block;" title="WhatsApp Manager"></iframe>
    </div>`;

    const shellOpts = {
        id: 'whatsapp-manager',
        archetype: 'designer',
        icon: '📱',
        title: 'مركز إدارة واعتماد قوالب ورسائل الواتساب والتليجرام',
        eyebrow: 'إدارة المراسلات والقوالب',
        subtitle: 'مراقبة واعتماد طابور الرسائل الصادرة، تخصيص قوالب العمليات الـ 24 المعتمدة مع المتغيرات البرمجية',
        actions: [
            { label: 'فتح في نافذة مستقلة', icon: '↗', variant: 'success', onclick: "window.open('whatsapp_manager.php', '_blank')" },
            { label: 'إعدادات الربط والبوت', icon: '⚙️', variant: 'primary', onclick: "App.switchTab('notifications')" },
            { label: 'تحديث الشاشة', icon: '🔄', variant: 'secondary', onclick: "const ifr=document.getElementById('whatsapp-mgr-iframe'); if(ifr) ifr.contentWindow.location.reload();" }
        ],
        content: iframeContent
    };

    if (window.SamUI?.PageBuilder) {
        mainView.innerHTML = window.SamUI.PageBuilder.renderShell(shellOpts);
    } else {
        mainView.innerHTML = iframeContent;
    }
};

// =========================================================================
// INTERACTIVE CHATBOT SIMULATOR & TEST ENGINE
// =========================================================================
App.showChatbotSimulatorModal = function() {
    const defaultWelcome = App.chatbotSettings?.welcome_msg || 'مرحباً بك في خدمة الرد الآلي والاستعلامات الذكية 🌐';
    const networkName = App.chatbotSettings?.network_name || 'شبكة ميكروتك مانجر';

    const modalHtml = `
    <div class="mt-modal-backdrop" id="chatbot-sim-backdrop" onclick="if(event.target===this) App.closeModal()" style="z-index:10050;">
        <div class="mt-modal" style="width:530px; max-width:96vw; height:680px; max-height:92vh; display:flex; flex-direction:column; border-radius:14px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.5); border:1px solid #334155; background:#0b141a; padding:0;">
            
            <!-- WhatsApp Phone Header -->
            <div style="background:#1f2c34; color:#e9edef; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3942;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:42px; height:42px; border-radius:50%; background:#00a884; display:flex; align-items:center; justify-content:center; font-size:22px; color:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.2);">
                        🤖
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:14px; color:#e9edef;">${this.escape(networkName)} — الرد الآلي</div>
                        <div style="font-size:11px; color:#00a884; display:flex; align-items:center; gap:5px;">
                            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#00a884;"></span>
                            متصل الآن (محاكي الرد الذكي)
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button type="button" class="mt-btn" style="padding:3px 8px; font-size:11px; background:#2a3942; color:#8696a0; border:none;" onclick="App.resetChatbotSimHistory()" title="مسح المحادثة">🗑️ مسح</button>
                    <span style="cursor:pointer; font-size:20px; color:#8696a0; padding:0 4px;" onclick="App.closeModal()">✕</span>
                </div>
            </div>

            <!-- Role Selector & Info Bar -->
            <div style="background:#111b21; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #222e35; font-size:11.5px; color:#8696a0; flex-wrap:wrap; gap:6px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span>نوع المتصل:</span>
                    <select id="sim-sender-role" class="mt-select" style="background:#202c33; color:#e9edef; border:1px solid #2a3942; padding:2px 8px; font-size:11px; border-radius:4px;" onchange="App.onSimSenderRoleChange(this.value)">
                        <option value="admin">👔 مدير النظام (Superadmin)</option>
                        <option value="pos">🏪 وكيل / موزع (POS Agent)</option>
                        <option value="subscriber">👤 مشترك عادي (Subscriber)</option>
                    </select>
                </div>
                <div>
                    <span id="sim-phone-label" style="font-family:monospace; color:#00a884; font-size:11px;">رقم المدير: 967777777777</span>
                </div>
            </div>

            <!-- Chat Messages Container -->
            <div id="sim-chat-box" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:#0b141a; background-image:radial-gradient(#1f2c34 1px, transparent 1px); background-size:16px 16px;">
                
                <!-- Initial Welcome Message from Bot -->
                <div style="align-self:flex-start; max-width:88%; background:#202c33; color:#e9edef; padding:12px 14px; border-radius:8px 8px 8px 0; font-size:12px; line-height:1.6; word-break:break-word; white-space:pre-wrap; box-shadow:0 1px 3px rgba(0,0,0,0.3); border-right:3px solid #00a884;">
${this.escape(defaultWelcome)}

💡 <b>أوامر الاستعلام السريعة المتاحة:</b>
• اكتب <b>1</b> أو <b>كشف حساب</b> (لعرض الملخص المالي والأرصدة)
• اكتب <b>2</b> أو <b>مخزون</b> (لعرض كروت وعهد المخزن)
• اكتب <b>3</b> أو <b>مبيعات</b> (لمبيعات وفواتير اليوم)
• اكتب <b>4</b> أو <b>سيرفرات</b> (لفحص حالة الراوترات)
• اكتب <b>استعلام كرت [الرقم]</b> (لفحص رصيد وصلاحية كرت)
• اكتب <b>باقات</b> (لعرض أسعار وسرعات الخدمة)
                </div>

            </div>

            <!-- Quick Action Command Chips -->
            <div id="sim-quick-chips" style="background:#111b21; padding:8px 12px; border-top:1px solid #222e35; display:flex; gap:6px; overflow-x:auto; white-space:nowrap;">
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('1')">📊 كشف حساب</button>
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('2')">🏢 جرد المخزون</button>
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('3')">🛒 مبيعات اليوم</button>
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('4')">🌐 حالة السيرفرات</button>
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('باقات')">📦 الباقات</button>
                <button type="button" class="mt-btn" style="background:#202c33; color:#00a884; border:1px solid #2a3942; font-size:11px; padding:3px 10px; border-radius:12px;" onclick="App.sendSimCommand('مساعدة')">❓ مساعدة</button>
            </div>

            <!-- Message Input Bar -->
            <form onsubmit="App.submitSimMessage(event)" style="background:#202c33; padding:10px 14px; display:flex; gap:8px; align-items:center; border-top:1px solid #2a3942; margin:0;">
                <input type="text" id="sim-input-msg" class="mt-input" style="flex:1; background:#2a3942; color:#e9edef; border:none; border-radius:8px; padding:9px 14px; font-size:13px;" placeholder="اكتب رسالة أو رقماً للاستعلام..." autocomplete="off" />
                <button type="submit" id="sim-send-btn" class="mt-btn" style="background:#00a884; color:#fff; border:none; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; flex-shrink:0;">
                    ➤
                </button>
            </form>

        </div>
    </div>`;

    const old = document.getElementById('chatbot-sim-backdrop');
    if (old) old.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);

    setTimeout(() => {
        const inp = document.getElementById('sim-input-msg');
        if (inp) inp.focus();
    }, 100);
};

App.submitSimMessage = async function(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('sim-input-msg');
    const msg = (input?.value || '').trim();
    if (!msg) return;
    input.value = '';

    const chatBox = document.getElementById('sim-chat-box');
    const roleSelect = document.getElementById('sim-sender-role');
    const role = roleSelect?.value || 'admin';
    const phone = (role === 'admin' ? '967777777777' : (role === 'pos' ? '967771234567' : '967700000000'));

    // Append user outgoing bubble
    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'align-self:flex-end; max-width:85%; background:#005c4b; color:#e9edef; padding:8px 12px; border-radius:8px 8px 0 8px; font-size:12.5px; line-height:1.5; word-break:break-word; white-space:pre-wrap; box-shadow:0 1px 2px rgba(0,0,0,0.3);';
    userBubble.innerText = msg;
    chatBox.appendChild(userBubble);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Typing indicator bubble
    const typingBubble = document.createElement('div');
    typingBubble.id = 'sim-typing-bubble';
    typingBubble.style.cssText = 'align-self:flex-start; background:#202c33; color:#8696a0; padding:6px 12px; border-radius:8px; font-size:11px; font-style:italic;';
    typingBubble.innerText = 'جاري المعالجة والرد... ⏳';
    chatBox.appendChild(typingBubble);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const res = await this.api('handle_chatbot_message', {
            message: msg,
            phone: phone,
            platform: 'whatsapp'
        }, 'POST');

        typingBubble.remove();

        const botReply = res?.response || res?.reply || res?.message || 'عذراً، لم أتمكن من فهم الأمر. اكتب (مساعدة) لعرض قائمة الأوامر.';

        const botBubble = document.createElement('div');
        botBubble.style.cssText = 'align-self:flex-start; max-width:88%; background:#202c33; color:#e9edef; padding:10px 14px; border-radius:8px 8px 8px 0; font-size:12px; line-height:1.6; word-break:break-word; white-space:pre-wrap; box-shadow:0 1px 2px rgba(0,0,0,0.3); border-right:3px solid #00a884;';
        botBubble.innerText = botReply;
        chatBox.appendChild(botBubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) {
        typingBubble.remove();
        const errBubble = document.createElement('div');
        errBubble.style.cssText = 'align-self:flex-start; background:#3b1818; color:#fca5a5; padding:8px 12px; border-radius:8px; font-size:12px;';
        errBubble.innerText = '❌ تعذر الاتصال بمحرك الرد الآلي: ' + (err.message || err);
        chatBox.appendChild(errBubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};

App.sendSimCommand = function(cmd) {
    const input = document.getElementById('sim-input-msg');
    if (input) {
        input.value = cmd;
        this.submitSimMessage();
    }
};

App.resetChatbotSimHistory = function() {
    this.showChatbotSimulatorModal();
};

App.onSimSenderRoleChange = function(role) {
    const label = document.getElementById('sim-phone-label');
    if (label) {
        label.innerText = (role === 'admin' ? 'رقم المدير: 967777777777' : (role === 'pos' ? 'رقم الوكيل: 967771234567' : 'رقم المشترك: 967700000000'));
    }
};
