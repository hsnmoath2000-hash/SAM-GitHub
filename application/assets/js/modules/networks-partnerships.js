/**
 * SAM User Manager — Networks, Capital Shares & Multi-Partnerships
 */
'use strict';


// ================================================================
//  NETWORKS & MULTI-PARTNERSHIP CAPITAL SYSTEM — FRONTEND
//  نظام الشبكات وحصص رأس المال المتعددة والأصول المرتبطة
// ================================================================

App.renderNetworksPartnerships = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    mainView.innerHTML = `
        <div class="mt-toolbar">
            <div class="mt-toolbar-left">
                <span style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:6px;">
                    🌐 الشبكات والشراكات المتعددة (Networks & Capital)
                </span>
                <span style="background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; margin-right:10px; border:1px solid #bae6fd;">
                    📊 الشبكات المتاحة لنطاق حسابك
                </span>
            </div>
            <div class="mt-toolbar-right" style="gap:8px; display:flex; align-items:center; flex-wrap:wrap;">
                <button class="mt-btn mt-btn-primary" style="font-weight:700; background:#7c3aed; border-color:#6d28d9;" onclick="App.openDocumentPrintSettingsModal()">
                    🎨 تخصيص طباعة المستندات والترويسة
                </button>
                <button class="mt-btn mt-btn-success" style="font-weight:700;" onclick="App.renderCapitalSummaryReport()">
                    📊 تقرير رأس المال الكلي
                </button>
                <button class="mt-btn" onclick="App.renderNetworksPartnerships()">⟳ تحديث</button>
            </div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:16px;" id="networks-main-content">
            <div style="text-align:center; padding:40px; color:var(--text-muted);">⏳ جار تحميل بيانات الشبكات والشراكات...</div>
        </div>
    `;

    const res = await this.api('get_networks', { status: 'all' });
    if (!res || !res.success) {
        document.getElementById('networks-main-content').innerHTML = `<div style="color:#ef4444; padding:20px; font-weight:bold;">❌ تعذر تحميل الشبكات: ${res?.error || 'خطأ في الاتصال'}</div>`;
        return;
    }
    const networks = res.networks || [];
    this._networksData = networks;

    let html = '';

    if (networks.length === 0) {
        html = `
            <div style="text-align:center; padding:60px 20px; background:var(--bg-window, #ffffff); border-radius:12px; border:2px dashed var(--border-color, #cbd5e1);">
                <div style="font-size:48px; margin-bottom:16px;">🌐</div>
                <div style="font-size:18px; font-weight:800; color:var(--text-main, #0f172a); margin-bottom:8px;">لا توجد شبكات مسجلة بعد</div>
                <div style="color:var(--text-muted, #64748b); margin-bottom:20px;">تتم إدارة إنشاء الشبكات من 💎 مركز الشبكات والاشتراكات الخاص بمالك النظام.</div>
            </div>`;
    } else {
        const totalNetworks = networks.length;
        const totalAssets = networks.reduce((s, n) => s + parseFloat(n.total_assets_cost || 0), 0);
        const totalPartners = [...new Set(networks.flatMap(n => (n.partners || []).map(p => p.partner_id)))].length;

        html += `
            <div class="kpi-grid" style="padding:0; margin-bottom:16px;">
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#eff6ff; color:#2563eb;">🌐</div>
                    <div>
                        <div class="kpi-val">${totalNetworks}</div>
                        <div class="kpi-lbl">الشبكات المرتبطة بالشبكة النشطة</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#f0fdf4; color:#16a34a;">👥</div>
                    <div>
                        <div class="kpi-val">${totalPartners}</div>
                        <div class="kpi-lbl">شركاء ومستثمرون</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fef3c7; color:#b45309;">📦</div>
                    <div>
                        <div class="kpi-val">${App.formatMoney(totalAssets)}</div>
                        <div class="kpi-lbl">إجمالي تكلفة الأصول</div>
                    </div>
                </div>
                <div class="kpi-card" style="cursor:pointer;" onclick="App.renderCapitalSummaryReport()">
                    <div class="kpi-icon" style="background:#f5f3ff; color:#7c3aed;">📊</div>
                    <div>
                        <div class="kpi-val" style="font-size:14px; color:#7c3aed; font-weight:800;">▶ عرض التقرير</div>
                        <div class="kpi-lbl">تقرير رأس المال التجميعي</div>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(380px, 1fr)); gap:18px;">`;

        networks.forEach(net => {
            const statusColor = net.status === 'active' ? '#16a34a' : net.status === 'dissolved' ? '#dc2626' : '#b45309';
            const statusLabel = net.status === 'active' ? '🟢 نشطة' : net.status === 'dissolved' ? '🔴 منحلة' : '🔄 مدمجة';
            const partners = net.partners || [];
            const totalPct = partners.reduce((s, p) => s + parseFloat(p.share_percent || 0), 0);
            const isFull = Math.abs(totalPct - 100) < 0.1;
            const pctColor = isFull ? '#16a34a' : totalPct > 100 ? '#dc2626' : '#d97706';
            const pctBg = isFull ? '#dcfce7' : totalPct > 100 ? '#fee2e2' : '#fef3c7';
            const assetCost = parseFloat(net.total_assets_cost || 0);
            const assetVal  = parseFloat(net.total_assets_value || 0);

            const authLabel = net.auth_mode === 'username_only' ? '👤 مستخدم فقط (بدون كلمة سر)' :
                              net.auth_mode === 'same' ? '🔑 المستخدم = كلمة السر' : '🔐 مستخدم وكلمة سر مختلفتان';
            const authBg = net.auth_mode === 'username_only' ? '#0284c7' :
                           net.auth_mode === 'same' ? '#7c3aed' : '#059669';

            html += `
                <div style="background:var(--bg-window, #ffffff); border:1px solid var(--border-color, #cbd5e1); border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column;">
                    <!-- Network Header -->
                    <div style="background:linear-gradient(135deg, ${net.theme_color ? this.escape(net.theme_color) : '#1e293b'} 0%, #0f172a 100%); padding:14px 16px; color:#ffffff; border-bottom:1px solid #334155;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                ${net.logo_url ? `<img src="${this.escape(net.logo_url)}" style="width:36px; height:36px; border-radius:8px; object-fit:contain; background:#ffffff; padding:2px; border:1px solid rgba(255,255,255,0.2);" onerror="this.style.display='none'" />` : '<div style="width:36px; height:36px; border-radius:8px; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-size:18px;">🌐</div>'}
                                <div>
                                    <div style="font-size:15px; font-weight:800; color:#ffffff; margin-bottom:2px; display:flex; align-items:center; gap:6px;">
                                        <span>${this.escape(net.name)}</span>
                                        ${net.hotspot_title ? `<span style="font-size:11px; font-weight:400; opacity:0.85;">(${this.escape(net.hotspot_title)})</span>` : ''}
                                    </div>
                                    <div style="font-size:11px; color:#94a3b8; font-family:monospace; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                        <span>${this.escape(net.code || '')}</span>
                                        ${net.location ? `<span>· 📍 ${this.escape(net.location)}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                                <span style="background:rgba(255,255,255,0.15); color:#ffffff; border:1px solid rgba(255,255,255,0.2); border-radius:20px; padding:3px 10px; font-size:11px; font-weight:700; white-space:nowrap;">
                                    ${statusLabel}
                                </span>
                                <span style="background:${authBg}; color:#ffffff; border-radius:12px; padding:2px 8px; font-size:10px; font-weight:700; white-space:nowrap;">
                                    ${authLabel}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Assets Metrics Bar -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; padding:12px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:center;">
                        <div style="background:#ffffff; padding:8px 6px; border-radius:6px; border:1px solid #e2e8f0; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.03);" onclick="App.showNetworkAssets(${net.id})" title="انقر لعرض تفاصيل أصول الشبكة">
                            <div style="font-size:10px; font-weight:600; color:#64748b; margin-bottom:2px;">الأصول (انقر للعرض)</div>
                            <div style="font-size:15px; font-weight:800; color:#2563eb;">📦 ${net.asset_count || 0}</div>
                        </div>
                        <div style="background:#ffffff; padding:8px 6px; border-radius:6px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                            <div style="font-size:10px; font-weight:600; color:#64748b; margin-bottom:2px;">تكلفة الأصول</div>
                            <div style="font-size:12px; font-weight:800; color:#d97706;">${App.formatMoney(assetCost)}</div>
                        </div>
                        <div style="background:#ffffff; padding:8px 6px; border-radius:6px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                            <div style="font-size:10px; font-weight:600; color:#64748b; margin-bottom:2px;">القيمة الحالية</div>
                            <div style="font-size:12px; font-weight:800; color:#16a34a;">${App.formatMoney(assetVal)}</div>
                        </div>
                    </div>

                    <!-- Partners Equity Distribution -->
                    <div style="padding:14px 16px; flex:1; background:#ffffff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
                            <span style="font-size:12px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:4px;">
                                👥 شركاء الشبكة (${partners.length})
                            </span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:11px; font-weight:700; background:${pctBg}; color:${pctColor}; padding:2px 8px; border-radius:10px; border:1px solid ${pctColor}40;">
                                    الإجمالي: ${totalPct.toFixed(2)}%
                                </span>
                                <button class="mt-btn mt-btn-primary" style="padding:3px 8px; font-size:11px; font-weight:700;" onclick="App.openAddPartnerToNetworkModal(${net.id})">
                                    ➕ شريك
                                </button>
                            </div>
                        </div>

                        ${partners.length === 0 ? `
                            <div style="text-align:center; padding:20px; color:#94a3b8; font-size:11px; border:1px dashed #cbd5e1; border-radius:8px; background:#f8fafc;">
                                لا يوجد شركاء مسجلون في هذه الشبكة — اضغط ➕ شريك لتوزيع الحصص
                            </div>
                        ` : `
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${partners.map(p => {
                                    const pct = parseFloat(p.share_percent || 0);
                                    const shareVal = assetCost * pct / 100;
                                    return `
                                        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; gap:8px;">
                                                <div style="display:flex; align-items:center; gap:8px;">
                                                    <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #3b82f6, #6366f1); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; flex-shrink:0;">
                                                        ${this.escape(p.partner_name || '?').substring(0,2)}
                                                    </div>
                                                    <div style="font-size:12px; font-weight:800; color:#0f172a;">
                                                        ${this.escape(p.partner_name)}
                                                    </div>
                                                </div>
                                                <div style="display:flex; gap:4px;">
                                                    <button class="mt-btn" style="padding:2px 6px; font-size:11px; background:#ffffff; border:1px solid #cbd5e1;" onclick="App.openAddPartnerToNetworkModal(${net.id}, ${p.partner_id})" title="تعديل حصة الشريك">✏️</button>
                                                    <button class="mt-btn mt-btn-danger" style="padding:2px 6px; font-size:11px;" onclick="App.removeNetworkPartner(${net.id}, ${p.partner_id})" title="إزالة الشريك">🗑️</button>
                                                </div>
                                            </div>
                                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#475569; margin-top:2px;">
                                                <span>حصة الشريك: <b style="color:#2563eb; font-weight:800;">${pct.toFixed(2)}%</b></span>
                                                <span>القيمة المالية: <b style="color:#16a34a; font-weight:800;">${App.formatMoney(shareVal)}</b></span>
                                            </div>
                                            <div style="height:6px; background:#e2e8f0; border-radius:3px; margin-top:5px; overflow:hidden;">
                                                <div style="height:100%; background:linear-gradient(90deg, #3b82f6, #8b5cf6); width:${Math.min(pct,100)}%; border-radius:3px;"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `}
                    </div>

                    <!-- Footer Actions -->
                    <div style="padding:10px 14px; background:#f1f5f9; display:flex; gap:8px; border-top:1px solid #e2e8f0; flex-wrap:wrap;">
                        <button class="mt-btn" style="flex:1; font-size:11px; font-weight:700; background:#ffffff; border:1px solid #cbd5e1; color:#1e293b;" onclick="App.openAddNetworkModal(${net.id})">
                            ✏️ تعديل الشبكة
                        </button>
                        <button class="mt-btn" style="flex:1; font-size:11px; font-weight:700; background:#f0f9ff; border:1px solid #7dd3fc; color:#0369a1;" onclick="App.openDocumentPrintSettingsModal(${net.id})">
                            🎨 تخصيص الطباعة
                        </button>
                        <button class="mt-btn mt-btn-primary" style="flex:1; font-size:11px; font-weight:700;" onclick="App.showNetworkAssets(${net.id})">
                            📦 إدارة الأصول
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    }

    document.getElementById('networks-main-content').innerHTML = html;
};

App.openAddNetworkModal = async function(netId = null) {
    this._networkCreateReturnTab = (!netId && this.currentTab === 'network_subscriptions') ? 'network_subscriptions' : null;
    const net = (netId && this._networksData) ? this._networksData.find(n => n.id == netId) : null;
    const isEdit = !!net;
    // The owner may appoint any existing active user, even when that user
    // has no membership in the new network yet. The backend converts the
    // selected membership to the per-network `superadmin` manager role.
    const managersRes = await this.api('get_network_manager_candidates');
    let managerAdmins = (managersRes?.admins || (Array.isArray(managersRes) ? managersRes : []));
    if (!Array.isArray(managerAdmins) || managerAdmins.length === 0) {
        managerAdmins = [
            { id: this.adminId || 1, username: this.user || 'admin', fullname: this.userFullname || 'مالك المنظومة (الحساب الحالي)', role: 'system_owner' }
        ];
    }
    const currentManagerId = Number(net?.network_manager_id || (isEdit ? 0 : (this.adminId || 1)));
    const managerOptions = managerAdmins.map(m => {
        const isOwnerAcc = Number(m.id) === 1 || m.role === 'system_owner';
        const roleLabel = isOwnerAcc ? ' (👑 مالك النظام)' : (m.role ? ` — ${this.escape(m.role)}` : '');
        const isSelected = Number(m.id) === currentManagerId || (!isEdit && isOwnerAcc);
        return `<option value="${m.id}" ${isSelected ? 'selected' : ''}>${this.escape(m.fullname || m.username)} (@${this.escape(m.username || '')})${roleLabel}</option>`;
    }).join('');
    const managerRequired = (!isEdit || currentManagerId <= 0) ? 'required' : '';
    const modalHtml = `
        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">
            <span style="font-weight:700; font-size:15px; color:#0f172a;">
                ${isEdit ? '✏️ تعديل بيانات الشبكة' : '🌐 إنشاء شبكة جديدة'}
            </span>
            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>
        </div>
        <form onsubmit="App.saveNetwork(event, ${isEdit ? net.id : 0})">
            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                <div style="display:flex; gap:12px;">
                    <div style="flex:2;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">🌐 اسم الشبكة *</label>
                        <input type="text" id="net-name" class="mt-input" placeholder="مثال: شبكة حي السلام" value="${this.escape(isEdit ? net.name : '')}" style="width:100%;" required />
                    </div>
                    <div style="flex:1;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">الرمز (Code)</label>
                        <input type="text" id="net-code" class="mt-input" placeholder="NET-001" value="${this.escape(isEdit ? (net.code || '') : '')}" style="width:100%; direction:ltr; text-align:right;" />
                    </div>
                </div>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">📍 الموقع / المدينة</label>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input type="text" id="net-location" class="mt-input" placeholder="اختر من الخريطة أو اكتب المدينة" value="${this.escape(isEdit ? (net.location || '') : '')}" style="width:100%;" />
                            <button type="button" class="mt-btn" onclick="App.useCurrentNetworkLocation()" title="استخدام الموقع الحالي">📍 موقعي</button>
                            <button type="button" class="mt-btn" onclick="App.openNetworkMapLocation()" title="فتح الموقع في الخريطة">🗺️ خريطة</button>
                        </div>
                        <small style="display:block;color:#64748b;font-size:11px;margin-top:4px;">يمكن كتابة المدينة أو حفظ الإحداثيات من موقعك الحالي. الصيغة: المدينة — lat, lon</small>
                    </div>
                    <div style="flex:1;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">📅 تاريخ التأسيس</label>
                        <input type="date" id="net-founded" class="mt-input" value="${isEdit ? (net.founded_date || '') : ''}" style="width:100%;" />
                    </div>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">📝 الوصف</label>
                    <textarea id="net-desc" class="mt-input" rows="2" placeholder="وصف موجز للشبكة..." style="width:100%; resize:vertical;">${this.escape(isEdit ? (net.description || '') : '')}</textarea>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">👔 مدير الشبكة المسؤول *</label>
                    <select id="net-manager" class="mt-select" style="width:100%; font-weight:700;" ${managerRequired}>
                        <option value="">-- اختر مديرًا للشبكة --</option>
                        ${managerOptions}
                    </select>
                    <small style="display:block; color:#64748b; font-size:11px; margin-top:5px; line-height:1.4;">يمكن اختيار مدير شبكات أو أي مستخدم نشط؛ سيُمنح العضوية برتبة «مدير الشبكات» داخل هذه الشبكة، وستضاف الشبكة تلقائيًا إلى إدارة مالك النظام.</small>
                </div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:12px;">
                    <div style="font-weight:700; font-size:13px; color:#1e293b;">🎨 هوية الشبكة ونمط تسجيل الدخول والكروت</div>
                    <div style="display:flex; gap:12px;">
                        <div style="flex:2;">
                            <label style="font-weight:600; font-size:12px; margin-bottom:4px; display:block;">🔑 نمط تسجيل الدخول والكروت *</label>
                            <select id="net-auth-mode" class="mt-select" style="width:100%;">
                                <option value="different" ${(!isEdit || net.auth_mode === 'different') ? 'selected' : ''}>🔐 مستخدم وكلمة سر مختلفتان</option>
                                <option value="username_only" ${isEdit && net.auth_mode === 'username_only' ? 'selected' : ''}>👤 اسم مستخدم فقط (كلمة السر فارغة)</option>
                                <option value="same" ${isEdit && net.auth_mode === 'same' ? 'selected' : ''}>🔑 اسم المستخدم = كلمة السر</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label style="font-weight:600; font-size:12px; margin-bottom:4px; display:block;">🎨 لون السمة</label>
                            <input type="color" id="net-theme-color" class="mt-input" value="${this.escape(isEdit ? (net.theme_color || '#0284c7') : '#0284c7')}" style="width:100%; height:38px; padding:2px 4px; cursor:pointer;" />
                        </div>
                    </div>
                    <div style="display:flex; gap:12px;">
                        <div style="flex:1;">
                            <label style="font-weight:600; font-size:12px; margin-bottom:4px; display:block;">🖼️ مسار / رابط الشعار (Logo URL)</label>
                            <input type="text" id="net-logo" class="mt-input" placeholder="/assets/img/logo.png" value="${this.escape(isEdit ? (net.logo_url || '') : '')}" style="width:100%; direction:ltr; text-align:right;" />
                        </div>
                        <div style="flex:1;">
                            <label style="font-weight:600; font-size:12px; margin-bottom:4px; display:block;">🏷️ عنوان صفحة الدخول (Hotspot Title)</label>
                            <input type="text" id="net-hotspot-title" class="mt-input" placeholder="مثال: شبكة النور اللاسلكية" value="${this.escape(isEdit ? (net.hotspot_title || '') : '')}" style="width:100%;" />
                        </div>
                    </div>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">الحالة</label>
                    <select id="net-status" class="mt-select" style="width:100%;">
                        <option value="active"    ${(!isEdit || net.status==='active')    ? 'selected' : ''}>✅ نشطة</option>
                        <option value="dissolved" ${isEdit && net.status==='dissolved'    ? 'selected' : ''}>❌ منحلة</option>
                        <option value="merged"    ${isEdit && net.status==='merged'       ? 'selected' : ''}>🔄 مدمجة</option>
                    </select>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ملاحظات</label>
                    <textarea id="net-notes" class="mt-input" rows="2" placeholder="أي ملاحظات إضافية..." style="width:100%; resize:vertical;">${this.escape(isEdit ? (net.notes || '') : '')}</textarea>
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="submit" class="mt-btn mt-btn-primary" style="background:#2563eb; border-color:#1d4ed8; font-weight:700;">
                    💾 ${isEdit ? 'حفظ التعديلات' : 'إنشاء الشبكة'}
                </button>
            </div>
        </form>
    `;
    this.openModal(modalHtml, '680px');
};

App.useCurrentNetworkLocation = function() {
    if (!navigator.geolocation) return this.toast('المتصفح لا يدعم تحديد الموقع', 'warning');
    this.toast('جاري تحديد موقعك الحالي...', 'info');
    navigator.geolocation.getCurrentPosition(pos => {
        const input = document.getElementById('net-location');
        if (!input) return;
        const lat = Number(pos.coords.latitude).toFixed(6);
        const lon = Number(pos.coords.longitude).toFixed(6);
        const current = input.value.replace(/\s*[—-]\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*$/, '').trim();
        input.value = `${current || 'الموقع الحالي'} — ${lat}, ${lon}`;
        this.toast('تم تحديد الموقع الحالي', 'success');
    }, () => this.toast('تعذر تحديد الموقع. اسمح للمتصفح بالوصول إلى الموقع.', 'danger'), {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
};

App.openNetworkMapLocation = function() {
    const value = document.getElementById('net-location')?.value || '';
    const match = value.match(/([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)/);
    if (match) window.open(`https://www.openstreetmap.org/?mlat=${match[1]}&mlon=${match[2]}#map=16/${match[1]}/${match[2]}`, '_blank', 'noopener');
    else if (value.trim()) window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(value.trim())}`, '_blank', 'noopener');
    else this.toast('اكتب المدينة أو حدد موقعك أولًا', 'warning');
};

App.saveNetwork = async function(e, id = 0) {
    if (e && e.preventDefault) e.preventDefault();
    const data = {
        id: id || 0,
        name:         document.getElementById('net-name')?.value?.trim(),
        code:         document.getElementById('net-code')?.value?.trim(),
        location:     document.getElementById('net-location')?.value?.trim(),
        founded_date: document.getElementById('net-founded')?.value,
        description:  document.getElementById('net-desc')?.value?.trim(),
        status:       document.getElementById('net-status')?.value,
        notes:        document.getElementById('net-notes')?.value?.trim(),
        logo_url:     document.getElementById('net-logo')?.value?.trim() || '',
        auth_mode:    document.getElementById('net-auth-mode')?.value || 'different',
        hotspot_title: document.getElementById('net-hotspot-title')?.value?.trim() || '',
        theme_color:  document.getElementById('net-theme-color')?.value || '#0284c7',
        manager_admin_id: parseInt(document.getElementById('net-manager')?.value || '0', 10) || 0,
    };
    if (!data.name) { return this.toast('اسم الشبكة مطلوب', 'warning'); }
    if (!data.manager_admin_id) { return this.toast('يجب تحديد مدير الشبكة قبل الحفظ', 'warning'); }
    const res = await this.api('save_network', data);
    if (res && res.success) {
        this.closeModal();
        this.toast(res.message || 'تم حفظ بيانات الشبكة بنجاح ✓', 'success');
        if (this._networkCreateReturnTab === 'network_subscriptions' && typeof this.renderNetworkSubscriptionCenter === 'function') {
            this._networkCreateReturnTab = null;
            this.renderNetworkSubscriptionCenter(true);
        } else {
            this.renderNetworksPartnerships();
        }
    } else {
        this.toast('خطأ: ' + (res?.error || 'فشل الحفظ'), 'danger');
    }
};

App.deleteNetwork = async function(id) {
    const net = (this._networksData || []).find(n => n.id == id);
    const name = net ? net.name : 'الشبكة';
    if (!confirm(`هل أنت متأكد من حذف الشبكة "${name}"؟ سيتم حذف جميع ارتباطات الشركاء بها.`)) return;
    const res = await this.api('delete_network', { id });
    if (res && res.success) {
        this.toast(res.message || 'تم حذف الشبكة بنجاح', 'success');
        this.renderNetworksPartnerships();
    } else {
        this.toast('خطأ: ' + (res?.error || 'فشل الحذف'), 'danger');
    }
};

// ---- Add/Edit Partner in Network Modal ----
App.openAddPartnerToNetworkModal = async function(networkId, partnerIdToEdit = null) {
    const net = (this._networksData || []).find(n => n.id == networkId);
    const networkName = net ? net.name : 'الشبكة';
    const existingPartner = partnerIdToEdit ? (net?.partners || []).find(p => p.partner_id == partnerIdToEdit) : null;
    const isEditPartner = !!existingPartner;

    const res = await this.api('get_partners_equity');
    const partners = (res && res.partners) ? res.partners : (Array.isArray(res) ? res : (res?.data || []));
    if (partners.length === 0) {
        return this.toast('لا يوجد شركاء مسجلون. أضف الشركاء أولاً من قسم "الشركاء وتوزيع الأرباح".', 'warning');
    }

    const otherPartnersTotal = (net?.partners || [])
        .filter(p => p.partner_id != (partnerIdToEdit || 0))
        .reduce((s, p) => s + parseFloat(p.share_percent || 0), 0);
    const maxAllowed = Math.max(0, 100 - otherPartnersTotal);

    const modalHtml = `
        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">
            <span style="font-weight:700; font-size:15px; color:#0f172a;">
                ${isEditPartner ? `✏️ تعديل حصة الشريك في "${this.escape(networkName)}"` : `➕ إضافة شريك لـ "${this.escape(networkName)}"`}
            </span>
            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>
        </div>
        <form onsubmit="App.saveNetworkPartner(event, ${networkId})">
            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
                <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:8px 12px; font-size:11px; color:#92400e;">
                    💡 إجمالي الحصص للشركاء الآخرين: <b>${otherPartnersTotal.toFixed(2)}%</b> — الحد الأقصى المتاح: <b>${maxAllowed.toFixed(3)}%</b>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">👤 الشريك *</label>
                    <select id="np-partner-id" class="mt-select" style="width:100%;" ${isEditPartner ? 'disabled' : ''}>
                        ${partners.map(p => `
                            <option value="${p.id}" ${((isEditPartner && existingPartner.partner_id == p.id) || (!isEditPartner && p.id == partnerIdToEdit)) ? 'selected' : ''}>
                                ${this.escape(p.partner_name)} (الحصة العامة: ${parseFloat(p.profit_share_percent||p.share_percentage||0)}%)
                            </option>
                        `).join('')}
                    </select>
                    ${isEditPartner ? `<input type="hidden" id="np-partner-id-hidden" value="${existingPartner.partner_id}">` : ''}
                </div>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">📊 نسبة الحصة % *</label>
                        <input type="number" id="np-share-pct" class="mt-input" min="0.001" max="${maxAllowed.toFixed(3)}" step="0.001" value="${isEditPartner ? parseFloat(existingPartner.share_percent) : Math.min(maxAllowed, 50).toFixed(3)}" style="width:100%; font-family:monospace; font-weight:700; color:#2563eb;" required />
                    </div>
                    <div style="flex:1;">
                        <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">💰 مساهمة رأس المال (${App.getCurrencySymbol(App._baseCurrency)})</label>
                        <input type="number" id="np-capital" class="mt-input" min="0" step="0.01" value="${isEditPartner ? parseFloat(existingPartner.capital_contrib || 0) : 0}" style="width:100%; font-family:monospace;" />
                    </div>
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">📅 تاريخ الانضمام</label>
                    <input type="date" id="np-join-date" class="mt-input" value="${isEditPartner ? (existingPartner.join_date || '') : new Date().toISOString().split('T')[0]}" style="width:100%;" />
                </div>
                <div>
                    <label style="font-weight:600; font-size:13px; margin-bottom:4px; display:block;">ملاحظات</label>
                    <textarea id="np-notes" class="mt-input" rows="2" style="width:100%; resize:vertical;">${this.escape(isEditPartner ? (existingPartner.notes || '') : '')}</textarea>
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="submit" class="mt-btn mt-btn-primary" style="background:#2563eb; border-color:#1d4ed8;">
                    💾 ${isEditPartner ? 'حفظ التعديلات' : 'إضافة الشريك للشبكة'}
                </button>
            </div>
        </form>
    `;
    this.openModal(modalHtml, '500px');
};

App.saveNetworkPartner = async function(e, networkId) {
    if (e && e.preventDefault) e.preventDefault();
    const partnerId = parseInt(document.getElementById('np-partner-id-hidden')?.value || document.getElementById('np-partner-id')?.value);
    const data = {
        network_id:     networkId,
        partner_id:     partnerId,
        share_percent:  parseFloat(document.getElementById('np-share-pct')?.value),
        capital_contrib: parseFloat(document.getElementById('np-capital')?.value || 0),
        join_date:      document.getElementById('np-join-date')?.value,
        notes:          document.getElementById('np-notes')?.value?.trim(),
    };
    if (!data.partner_id || isNaN(data.share_percent) || data.share_percent <= 0) {
        return this.toast('يرجى تحديد الشريك ونسبة حصة صحيحة', 'warning');
    }
    const res = await this.api('save_network_partner', data);
    if (res && res.success) {
        this.closeModal();
        this.toast(res.message || 'تم حفظ بيانات الشريك ✓', 'success');
        this.renderNetworksPartnerships();
    } else {
        this.toast('خطأ: ' + (res?.error || 'فشل الحفظ'), 'danger');
    }
};

App.removeNetworkPartner = async function(networkId, partnerId) {
    const net = (this._networksData || []).find(n => n.id == networkId);
    const partner = (net?.partners || []).find(p => p.partner_id == partnerId);
    const pName = partner ? partner.partner_name : 'الشريك';
    const nName = net ? net.name : 'الشبكة';

    if (!confirm(`هل أنت متأكد من إزالة "${pName}" من شبكة "${nName}"؟`)) return;
    const res = await this.api('remove_network_partner', { network_id: networkId, partner_id: partnerId });
    if (res && res.success) {
        this.toast(res.message || 'تمت الإزالة بنجاح', 'success');
        this.renderNetworksPartnerships();
    } else {
        this.toast('خطأ: ' + (res?.error || 'فشل الحذف'), 'danger');
    }
};

// ---- Network Assets Management Modal ----
App.showNetworkAssets = async function(networkId) {
    const net = (this._networksData || []).find(n => n.id == networkId);
    const networkName = net ? net.name : 'الشبكة';

    const res = await this.api('get_assets_list');
    const allAssets = (res && res.data) ? res.data : ((res && res.assets) ? res.assets : (Array.isArray(res) ? res : []));
    const netAssets = allAssets.filter(a => a.network_id == networkId);
    const unassignedAssets = allAssets.filter(a => a.network_id != networkId);

    const modalHtml = `
        <div class="mt-modal-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:14px 20px;">
            <span style="font-weight:700; font-size:15px; color:#0f172a;">📦 إدارة أصول ومعدات شبكة: ${this.escape(networkName)}</span>
            <span style="cursor:pointer; font-size:18px; color:#64748b;" onclick="App.closeModal()">✕</span>
        </div>
        <div style="flex:1; overflow-y:auto; padding:16px; max-height:70vh; display:flex; flex-direction:column; gap:14px;">
            <!-- Quick Assign Bar -->
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:700; font-size:12px; color:#1e40af;">➕ ربط أصل موجود بهذه الشبكة:</span>
                <select id="quick-assign-asset-id" class="mt-select" style="flex:1; min-width:200px; background:#fff;">
                    <option value="">-- اختر الأصل للربط بالشبكة --</option>
                    ${unassignedAssets.map(a => `
                        <option value="${a.id}">
                            [${this.escape(a.asset_code || 'AST')}] ${this.escape(a.name)} - ${this.escape(a.category)} (${App.formatMoney(a.purchase_cost || 0)})
                        </option>
                    `).join('')}
                </select>
                <button class="mt-btn mt-btn-primary" style="background:#2563eb;" onclick="App.quickAssignAsset(${networkId})">
                    🔗 ربط الأصل بالشبكة
                </button>
            </div>

            <!-- Assets Table -->
            <div>
                <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>الأصول المرتبطة حالياً بهذه الشبكة (${netAssets.length})</span>
                    <span style="font-size:12px; color:#16a34a; font-weight:800;">إجمالي التكلفة: ${App.formatMoney(netAssets.reduce((s,a) => s + parseFloat(a.purchase_cost||0), 0))}</span>
                </div>
                ${netAssets.length === 0 ? `
                    <div style="text-align:center; padding:30px; color:var(--text-muted); background:var(--bg-sidebar); border-radius:8px; border:1px dashed var(--border-color);">
                        <div style="font-size:32px; margin-bottom:8px;">📦</div>
                        <div>لا توجد أصول مرتبطة بهذه الشبكة حتى الآن</div>
                        <div style="font-size:11px; margin-top:6px; color:#2563eb;">اختر أصلاً من القائمة أعلاه واضغط "ربط الأصل بالشبكة"</div>
                    </div>
                ` : `
                    <table class="mt-table" style="font-size:11px; width:100%;">
                        <thead>
                            <tr>
                                <th>الكود</th>
                                <th>اسم الجهاز</th>
                                <th>التصنيف</th>
                                <th>الموقع والنقطة</th>
                                <th>تكلفة الشراء</th>
                                <th>القيمة الحالية</th>
                                <th>الحالة</th>
                                <th style="text-align:center;">إجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${netAssets.map(a => `
                                <tr>
                                    <td style="font-family:monospace; font-size:10px; color:#7c3aed; font-weight:700;">${this.escape(a.asset_code || '')}</td>
                                    <td style="font-weight:700;">${this.escape(a.name || '')}</td>
                                    <td>${this.escape(a.category || '')}</td>
                                    <td>${this.escape(a.location || a.node_name || '-')}</td>
                                    <td style="color:#b45309; font-weight:700;">${App.formatMoney(a.purchase_cost || 0)}</td>
                                    <td style="color:#16a34a; font-weight:700;">${App.formatMoney(a.current_value || 0)}</td>
                                    <td><span class="status-badge">${this.escape(a.status || '')}</span></td>
                                    <td style="text-align:center;">
                                        <span class="status-badge" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;">🌐 مرتبط بالشبكة</span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight:800; background:#f8fafc;">
                                <td colspan="4" style="text-align:right; padding:8px;">المجموع:</td>
                                <td style="color:#b45309;">${App.formatMoney(netAssets.reduce((s,a) => s + parseFloat(a.purchase_cost||0), 0))}</td>
                                <td style="color:#16a34a;">${App.formatMoney(netAssets.reduce((s,a) => s + parseFloat(a.current_value||0), 0))}</td>
                                <td colspan="2"></td>
                            </tr>
                        </tfoot>
                    </table>
                `}
            </div>
        </div>
        <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>
            <button class="mt-btn mt-btn-primary" onclick="App.closeModal(); App.switchTab('assets')">📦 الذهاب لإدارة الأصول الكاملة</button>
        </div>
    `;
    this.openModal(modalHtml, '780px');
};

App.quickAssignAsset = async function(networkId) {
    if (Number(networkId) !== Number(this.activeNetworkId)) {
        return this.toast('يجب تبديل الشبكة النشطة قبل ربط الأصل؛ لا يمكن ربط أصل بشبكة غير نشطة', 'warning');
    }
    const assetId = document.getElementById('quick-assign-asset-id')?.value;
    if (!assetId) {
        return this.toast('يرجى اختيار الأصل المراد ربطه بالشبكة', 'warning');
    }
    const res = await this.api('assign_asset_network', { asset_id: assetId, network_id: this.activeNetworkId }, 'POST');
    if (res && res.success) {
        this.toast(res.message || 'تم ربط الأصل بالشبكة بنجاح ✓', 'success');
        await this.showNetworkAssets(networkId);
        this.renderNetworksPartnerships();
    } else {
        this.toast(res?.error || 'فشل ربط الأصل', 'danger');
    }
};

App.quickUnassignAsset = async function(assetId, networkId) {
    this.toast('الأصل يجب أن يبقى مرتبطًا بشبكة واحدة. استخدم تعديل الأصل بعد اختيار الشبكة النشطة.', 'warning');
};

// ---- Capital Summary Report ----
App.renderCapitalSummaryReport = async function() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="mt-toolbar">
            <div class="mt-toolbar-left">
                <button class="mt-btn" onclick="App.renderNetworksPartnerships()" style="margin-left:8px;">← رجوع</button>
                <span style="font-weight:700; font-size:15px;">📊 تقرير رأس المال التجميعي للشركاء</span>
            </div>
            <div class="mt-toolbar-right">
                <button class="mt-btn" onclick="App.renderCapitalSummaryReport()">⟳ تحديث</button>
            </div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:15px;" id="cap-report-content">
            <div style="text-align:center; padding:40px; color:var(--text-muted);">⏳ جار احتساب رأس المال...</div>
        </div>
    `;

    const res = await this.api('get_partner_capital_summary');
    if (!res || !res.success) {
        document.getElementById('cap-report-content').innerHTML = `<div style="color:red; padding:20px;">❌ ${res?.error || 'فشل التحميل'}</div>`;
        return;
    }

    const partners = res.partners || [];
    const grandTotal = parseFloat(res.grand_total || 0);

    let html = `
        <!-- Grand Total Banner -->
        <div style="background:linear-gradient(135deg,#1e293b,#0f172a); color:#fff; border-radius:10px; padding:16px 20px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:11px; color:#94a3b8;">إجمالي رأس المال الكلي للشركاء عبر جميع الشبكات</div>
                <div style="font-size:26px; font-weight:900; color:#facc15;">${App.formatMoney(grandTotal)}</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:10px; color:#94a3b8;">عدد الشركاء</div>
                <div style="font-size:22px; font-weight:800; color:#4ade80;">${partners.length}</div>
            </div>
        </div>

        <!-- Partner Cards -->
        <div style="display:flex; flex-direction:column; gap:12px;">
    `;

    partners.forEach(p => {
        const contributions = p.network_contributions || [];
        const capPct = parseFloat(p.capital_percent_of_total || 0);

        html += `
            <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">
                <!-- Partner Header -->
                <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; background:linear-gradient(90deg, #1e3a5f08 0%, transparent 100%); border-bottom:1px solid var(--border-color);">
                    <div style="width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg, #2563eb, #7c3aed); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; flex-shrink:0;">
                        ${this.escape(p.partner_name || '?').substring(0,2)}
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:14px; font-weight:800;">${this.escape(p.partner_name)}</div>
                        <div style="font-size:11px; color:var(--text-muted);">
                            ${p.networks_count} شبكة — حصة من إجمالي رأس المال: <b style="color:#2563eb;">${capPct.toFixed(2)}%</b>
                        </div>
                        <div style="height:6px; background:#e2e8f0; border-radius:3px; margin-top:4px;">
                            <div style="height:100%; background:linear-gradient(90deg,#2563eb,#7c3aed); width:${Math.min(capPct,100)}%; border-radius:3px;"></div>
                        </div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-size:10px; color:var(--text-muted);">إجمالي رأس المال</div>
                        <div style="font-size:16px; font-weight:900; color:#16a34a;">${App.formatMoney(p.grand_total_capital)}</div>
                    </div>
                </div>

                <!-- Capital Sources -->
                <div style="padding:12px 16px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:8px; margin-bottom:10px;">
                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 12px;">
                            <div style="font-size:10px; color:#166534;">رأس المال المباشر</div>
                            <div style="font-size:13px; font-weight:800; color:#16a34a;">${App.formatMoney(p.direct_capital)}</div>
                        </div>
                        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 12px;">
                            <div style="font-size:10px; color:#1e40af;">حصته من أصول الشبكات</div>
                            <div style="font-size:13px; font-weight:800; color:#2563eb;">${App.formatMoney(p.total_asset_share_cost)}</div>
                        </div>
                        <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:8px 12px;">
                            <div style="font-size:10px; color:#5b21b6;">مساهمات رأس مال في الشبكات</div>
                            <div style="font-size:13px; font-weight:800; color:#7c3aed;">${App.formatMoney(p.total_capital_contrib)}</div>
                        </div>
                    </div>

                    <!-- Networks breakdown -->
                    ${contributions.length > 0 ? `
                    <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">تفصيل الحصص من كل شبكة:</div>
                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead>
                            <tr style="background:var(--bg-sidebar);">
                                <th style="padding:6px 8px; text-align:right; border-bottom:1px solid var(--border-color);">الشبكة</th>
                                <th style="padding:6px 8px; text-align:center; border-bottom:1px solid var(--border-color);">النسبة %</th>
                                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--border-color);">إجمالي أصول الشبكة</th>
                                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--border-color);">حصته من الأصول</th>
                                <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--border-color);">مساهمة رأس المال</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${contributions.map(c => `
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <td style="padding:6px 8px; font-weight:700;">🌐 ${this.escape(c.network_name)}</td>
                                    <td style="padding:6px 8px; text-align:center;">
                                        <span style="background:#eff6ff; color:#2563eb; border-radius:10px; padding:2px 8px; font-weight:700;">${parseFloat(c.share_percent).toFixed(2)}%</span>
                                    </td>
                                    <td style="padding:6px 8px; color:#b45309;">${App.formatMoney(c.network_total_cost)}</td>
                                    <td style="padding:6px 8px; color:#16a34a; font-weight:700;">${App.formatMoney(c.asset_share_cost)}</td>
                                    <td style="padding:6px 8px; color:#7c3aed;">${App.formatMoney(c.capital_contrib)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background:#f8fafc; font-weight:800;">
                                <td colspan="3" style="padding:6px 8px; text-align:right;">المجموع الكلي لـ ${this.escape(p.partner_name)}:</td>
                                <td style="padding:6px 8px; color:#16a34a;">${App.formatMoney(p.total_asset_share_cost)}</td>
                                <td style="padding:6px 8px; color:#7c3aed;">${App.formatMoney(p.total_capital_contrib)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    ` : `<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:8px;">لا يشارك هذا الشريك في أي شبكة بعد</div>`}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    document.getElementById('cap-report-content').innerHTML = html;
};

// =========================================================================
// OPTION 2: FULL NETWORK MERGE WIZARD (معالج دمج وتوحيد الشبكات والفروع)
// =========================================================================

App.openNetworkMergeModal = async function() {
    const res = await this.api('get_networks', { scope: 'all' });
    const networks = (res && res.networks) ? res.networks : [];
    if (networks.length < 2) {
        return this.toast('يتطلب دمج الشبكات وجود شبكتين على الأقل في النظام', 'warning');
    }

    const modalHtml = `
        <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; padding:14px 20px;">
            <span style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:8px;">
                🔄 معالج دمج وتوحيد الشبكات والفروع (Network Merge Wizard)
            </span>
            <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
        </div>
        <div class="mt-modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">
            <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 14px; margin-bottom:16px; font-size:12px; color:#0369a1; line-height:1.7;">
                💡 يتيح لك هذا المعالج نقل جميع كروت المشتركين، جلسات المحاسبة، وأجهزة الراوتر من شبكة (المصدر) إلى شبكة أخرى (الهدف) مع معالجة تعارض الأسماء ومطابقة الباقات تلقائياً.
            </div>

            <!-- Step 1: Select Networks -->
            <div id="merge-step-1">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px;">
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block; color:#dc2626;">
                            📤 الشبكة المصدر (المراد نقلها ودمجها):
                        </label>
                        <select id="merge-source-net" class="mt-select" style="width:100%; font-weight:700;" onchange="App.onMergeSourceChange()">
                            <option value="">-- اختر الشبكة المصدر --</option>
                            ${networks.map(n => `<option value="${n.id}">🌐 ${this.escape(n.name)} (${this.escape(n.code || 'NET-' + n.id)})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block; color:#16a34a;">
                            📥 الشبكة المستهدفة (التي ستستقبل الكروت والأجهزة):
                        </label>
                        <select id="merge-target-net" class="mt-select" style="width:100%; font-weight:700;">
                            <option value="">-- اختر الشبكة المستهدفة --</option>
                            ${networks.map(n => `<option value="${n.id}">🌐 ${this.escape(n.name)} (${this.escape(n.code || 'NET-' + n.id)})</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="text-align:center; margin-top:10px;">
                    <button type="button" class="mt-btn mt-btn-primary" style="padding:8px 24px; font-weight:700; background:#0284c7; border-color:#0369a1;" onclick="App.previewNetworkMerge()">
                        🔍 فحص وتحليل بيانات الدمج (Preview)
                    </button>
                </div>
            </div>

            <!-- Step 2: Preview & Configuration (Dynamic) -->
            <div id="merge-step-2" style="display:none; margin-top:16px;">
                <!-- Container for preview results -->
            </div>
        </div>
        <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
            <button type="button" id="btn-execute-merge" class="mt-btn mt-btn-danger" style="display:none; font-weight:800; background:#dc2626; border-color:#b91c1c; padding:8px 20px;" onclick="App.executeNetworkMerge()">
                🚀 تأكيد وتنفيذ الدمج الشامل الآن
            </button>
        </div>
    `;
    this.openModal(modalHtml, '720px');
};

App.onMergeSourceChange = function() {
    const srcId = document.getElementById('merge-source-net')?.value;
    const tgtSelect = document.getElementById('merge-target-net');
    if (!tgtSelect) return;
    Array.from(tgtSelect.options).forEach(opt => {
        opt.disabled = (opt.value === srcId && opt.value !== '');
    });
};

App.previewNetworkMerge = async function() {
    const sourceId = document.getElementById('merge-source-net')?.value;
    const targetId = document.getElementById('merge-target-net')?.value;

    if (!sourceId || !targetId) {
        return this.toast('يرجى اختيار الشبكة المصدر والشبكة المستهدفة أولاً', 'warning');
    }
    if (sourceId === targetId) {
        return this.toast('لا يمكن دمج الشبكة مع نفسها', 'warning');
    }

    const previewContainer = document.getElementById('merge-step-2');
    previewContainer.style.display = 'block';
    previewContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">⏳ جاري فحص ومطابقة بيانات الشبكتين...</div>';

    const res = await this.api('preview_network_merge', {
        source_network_id: sourceId,
        target_network_id: targetId
    });

    if (!res || !res.success) {
        previewContainer.innerHTML = `<div style="color:#ef4444; padding:16px; font-weight:bold; background:#fef2f2; border-radius:8px;">❌ ${res?.error || 'تعذر تحليل الدمج'}</div>`;
        return;
    }

    this._mergePreviewData = res;
    const sourceProfiles = res.source_profiles || [];
    const targetProfiles = res.target_profiles || [];

    let html = `
        <div style="border-top:2px dashed #cbd5e1; padding-top:16px;">
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px;">
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:11px; color:#1e40af; font-weight:600;">الكروت المراد نقلها</div>
                    <div style="font-size:20px; font-weight:900; color:#2563eb;">${res.source_vouchers_count || 0}</div>
                </div>
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:11px; color:#166534; font-weight:600;">سجلات المحاسبة والجلسات</div>
                    <div style="font-size:20px; font-weight:900; color:#16a34a;">${res.source_sessions_count || 0}</div>
                </div>
                <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:10px; text-align:center;">
                    <div style="font-size:11px; color:#92400e; font-weight:600;">أجهزة الراوتر</div>
                    <div style="font-size:20px; font-weight:900; color:#d97706;">${res.source_routers_count || 0}</div>
                </div>
            </div>

            <!-- Collision Strategy -->
            <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:14px; margin-bottom:14px;">
                <label style="font-weight:800; font-size:13px; color:#9a3412; margin-bottom:8px; display:block;">
                    🛡️ استراتيجية معالجة تعارض أسماء الكروت المتطابقة (Collision Strategy):
                </label>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="font-size:12px; display:flex; align-items:center; gap:8px; cursor:pointer; color:#1e293b;">
                        <input type="radio" name="merge-collision" value="prefix" checked>
                        <span><b>(الموصى به) إضافة بادئة:</b> إضافة بادئة بالرمز القديم (مثل: <code>NET_${sourceId}_</code>) للكروت المتعارضة لمنع التداخل.</span>
                    </label>
                    <label style="font-size:12px; display:flex; align-items:center; gap:8px; cursor:pointer; color:#1e293b;">
                        <input type="radio" name="merge-collision" value="skip">
                        <span><b>تخطي الكروت المتعارضة (Skip):</b> نقل الكروت الفريدة فقط وتجاهل أي كرت موجود مسبقاً في الشبكة الهدف.</span>
                    </label>
                    <label style="font-size:12px; display:flex; align-items:center; gap:8px; cursor:pointer; color:#1e293b;">
                        <input type="radio" name="merge-collision" value="overwrite">
                        <span><b>استبدال الكروت القديمة (Overwrite):</b> تحديث الكروت المتعارضة لتتبع الشبكة الجديدة.</span>
                    </label>
                </div>
            </div>

            <!-- Profile Mapping -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:14px;">
                <label style="font-weight:800; font-size:13px; color:#1e293b; margin-bottom:8px; display:block;">
                    📋 مطابقة وتحويل الباقات (Profile Mapping):
                </label>
                ${sourceProfiles.length === 0 ? `
                    <div style="font-size:11px; color:#64748b;">لا توجد باقات خاصة بالشبكة المصدر، سيتم نقل الكروت مباشرة.</div>
                ` : `
                    <table class="mt-table" style="font-size:11px; width:100%;">
                        <thead>
                            <tr>
                                <th>باقة الشبكة المصدر</th>
                                <th>الباقة المقابلة في الشبكة الهدف</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sourceProfiles.map(sp => {
                                const matched = targetProfiles.find(tp => tp.name === sp.name);
                                return `
                                    <tr>
                                        <td><b>${this.escape(sp.name)}</b> <span style="color:#64748b;">(${sp.price || 0} ر.ي)</span></td>
                                        <td>
                                            <select class="mt-select merge-prof-map" data-source-profile="${this.escape(sp.name)}" style="width:100%; font-size:11px;">
                                                <option value="__auto__">✨ إنشاء نفس الباقة تلقائياً في الشبكة الهدف</option>
                                                ${targetProfiles.map(tp => `
                                                    <option value="${this.escape(tp.name)}" ${matched && matched.name === tp.name ? 'selected' : ''}>
                                                        ${this.escape(tp.name)} (${tp.price || 0} ر.ي)
                                                    </option>
                                                `).join('')}
                                            </select>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `}
            </div>

            <!-- Additional Migration Options -->
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#0369a1;">
                    <input type="checkbox" id="merge-opt-routers" checked>
                    <span>نقل وتحديث أجهزة الراوتر التابعة للشبكة المصدر إلى الشبكة المستهدفة تلقائياً</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#b91c1c;">
                    <input type="checkbox" id="merge-opt-archive" checked>
                    <span>أرشفة وتعطيل الشبكة المصدر بعد إتمام الدمج بنجاح (Merged / Archived)</span>
                </label>
            </div>
        </div>
    `;

    previewContainer.innerHTML = html;
    const btnExecute = document.getElementById('btn-execute-merge');
    if (btnExecute) btnExecute.style.display = 'inline-block';
};

App.executeNetworkMerge = async function() {
    const sourceId = document.getElementById('merge-source-net')?.value;
    const targetId = document.getElementById('merge-target-net')?.value;

    if (!confirm('⚠️ تحذير: هل أنت متأكد تماماً من تنفيذ الدمج؟ سيتم نقل الكروت وسجلات المحاسبة وتحديثها لتتبع الشبكة المستهدفة.')) {
        return;
    }

    const collisionStrategy = document.querySelector('input[name="merge-collision"]:checked')?.value || 'prefix';
    const migrateRouters = document.getElementById('merge-opt-routers')?.checked ? 1 : 0;
    const archiveSource = document.getElementById('merge-opt-archive')?.checked ? 1 : 0;

    // Collect profile mapping
    const profileMapping = {};
    document.querySelectorAll('.merge-prof-map').forEach(select => {
        const srcProf = select.getAttribute('data-source-profile');
        const tgtProf = select.value;
        if (srcProf && tgtProf && tgtProf !== '__auto__') {
            profileMapping[srcProf] = tgtProf;
        }
    });

    const btn = document.getElementById('btn-execute-merge');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري تنفيذ الدمج والمزامنة...'; }

    const res = await this.api('execute_network_merge', {
        source_network_id: sourceId,
        target_network_id: targetId,
        collision_strategy: collisionStrategy,
        profile_mapping: profileMapping,
        migrate_routers: migrateRouters,
        archive_source: archiveSource
    }, 'POST');

    if (res && res.success) {
        this.closeModal();
        this.toast(res.message || 'تم دمج الشبكتين بنجاح', 'success');
        this.renderNetworksPartnerships();
    } else {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 تأكيد وتنفيذ الدمج الشامل الآن'; }
        this.toast(res?.error || 'فشل تنفيذ الدمج', 'danger');
    }
};

// =========================================================================
// OPTION 3: NETWORK ROAMING & FEDERATION SUITE (تحالف وتجوال الشبكات)
// =========================================================================

App.renderRoamingPeers = async function() {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    mainView.innerHTML = `
        <div class="mt-toolbar">
            <div class="mt-toolbar-left">
                <button class="mt-btn" onclick="App.renderNetworkSubscriptionCenter ? App.renderNetworkSubscriptionCenter(true) : App.renderNetworksPartnerships()" style="margin-left:8px;">← رجوع لمركز الشبكات</button>
                <span style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:6px;">
                    🌐 تحالف وتجوال الشبكات والمشتركين (Network Roaming & Federation)
                </span>
                <span style="background:#ecfdf5; color:#047857; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; margin-right:10px; border:1px solid #a7f3d0;">
                    🟢 FreeRADIUS Roaming View Active
                </span>
            </div>
            <div class="mt-toolbar-right" style="gap:8px; display:flex; align-items:center; flex-wrap:wrap;">
                <button class="mt-btn mt-btn-primary" style="font-weight:700; background:#0284c7; border-color:#0369a1;" onclick="App.openAddRoamingPeerModal()">
                    ➕ إضافة تحالف تجوال جديد
                </button>
                <button class="mt-btn mt-btn-success" style="font-weight:700;" onclick="App.renderRoamingClearingReport()">
                    📑 تقرير المحاسبة والتسوية المالية
                </button>
                <button class="mt-btn" onclick="App.renderRoamingPeers()">⟳ تحديث</button>
            </div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:16px;" id="roaming-main-content">
            <div style="text-align:center; padding:40px; color:var(--text-muted);">⏳ جار تحميل بيانات تحالفات التجوال...</div>
        </div>
    `;

    const res = await this.api('get_roaming_peers');
    if (!res || !res.success) {
        document.getElementById('roaming-main-content').innerHTML = `<div style="color:#ef4444; padding:20px; font-weight:bold;">❌ تعذر تحميل تحالفات التجوال: ${res?.error || 'خطأ في الاتصال'}</div>`;
        return;
    }

    const peers = res.peers || [];
    this._roamingPeersData = peers;

    let html = '';

    if (peers.length === 0) {
        html = `
            <div style="text-align:center; padding:60px 20px; background:var(--bg-window, #ffffff); border-radius:12px; border:2px dashed var(--border-color, #cbd5e1);">
                <div style="font-size:48px; margin-bottom:16px;">🌐</div>
                <div style="font-size:18px; font-weight:800; color:var(--text-main, #0f172a); margin-bottom:8px;">لا توجد اتفاقيات تجوال نشطة حالياً</div>
                <div style="color:var(--text-muted, #64748b); margin-bottom:20px; max-width:600px; margin-left:auto; margin-right:auto; line-height:1.7;">
                    يتيح لك نظام التجوال السماح لمشتركي شبكتك باستخدام كروتهم على راوترات الشبكات الحليفة أو العكس، مع عزل حسابات كل شبكة وإصدار تقارير تسوية مالية دقيقة لاستهلاك الجيجابايت.
                </div>
                <button class="mt-btn mt-btn-primary" style="padding:8px 20px; font-weight:700;" onclick="App.openAddRoamingPeerModal()">
                    ➕ إضافة أول تحالف تجوال
                </button>
            </div>
        `;
    } else {
        const activeCount = peers.filter(p => p.status === 'active').length;
        const pausedCount = peers.length - activeCount;

        html += `
            <div class="kpi-grid" style="padding:0; margin-bottom:16px;">
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#eff6ff; color:#2563eb;">🤝</div>
                    <div>
                        <div class="kpi-val">${peers.length}</div>
                        <div class="kpi-lbl">إجمالي اتفاقيات التحالف</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#f0fdf4; color:#16a34a;">🟢</div>
                    <div>
                        <div class="kpi-val">${activeCount}</div>
                        <div class="kpi-lbl">تجوال نشط وفوري</div>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon" style="background:#fef3c7; color:#b45309;">⏸️</div>
                    <div>
                        <div class="kpi-val">${pausedCount}</div>
                        <div class="kpi-lbl">متوقف مؤقتاً</div>
                    </div>
                </div>
                <div class="kpi-card" style="cursor:pointer;" onclick="App.renderRoamingClearingReport()">
                    <div class="kpi-icon" style="background:#f5f3ff; color:#7c3aed;">📑</div>
                    <div>
                        <div class="kpi-val" style="font-size:14px; color:#7c3aed; font-weight:800;">▶ فتح التقرير</div>
                        <div class="kpi-lbl">تقرير المقاصة المالية للجيجابايت</div>
                    </div>
                </div>
            </div>

            <div class="sam-table-container mt-table-container">
                <table class="sam-table mt-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الشبكة المحلية</th>
                            <th>الشبكة الحليفة (Peer)</th>
                            <th>اتجاه التجوال</th>
                            <th>الباقات المسموح بها</th>
                            <th>سعر المقاصة (Clearing Rate)</th>
                            <th>الحالة</th>
                            <th style="text-align:center;">العمليات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${peers.map((p, i) => {
                            const isIncoming = p.roaming_type === 'incoming';
                            const isOutgoing = p.roaming_type === 'outgoing';
                            const typeLabel = isIncoming ? '📥 استقبال فقط (Incoming)' : isOutgoing ? '📤 تصدير فقط (Outgoing)' : '🔄 تبادلي متكامل (Bidirectional)';
                            const typeColor = isIncoming ? '#0284c7' : isOutgoing ? '#7c3aed' : '#16a34a';
                            const isActive = p.status === 'active';

                            return `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td><b>🌐 ${this.escape(p.network_name || 'شبكة #' + p.network_id)}</b></td>
                                    <td><b style="color:#2563eb;">🤝 ${this.escape(p.peer_network_name || 'شبكة #' + p.peer_network_id)}</b></td>
                                    <td><span style="background:${typeColor}15; color:${typeColor}; border:1px solid ${typeColor}40; border-radius:12px; padding:3px 10px; font-weight:700; font-size:11px;">${typeLabel}</span></td>
                                    <td><span style="font-size:11px; color:#475569;">${p.allowed_profiles ? this.escape(p.allowed_profiles) : '🌟 جميع الباقات'}</span></td>
                                    <td><b style="color:#059669;">${parseFloat(p.clearing_rate || 0)} ر.ي / GB</b></td>
                                    <td><span class="status-badge ${isActive ? 'status-online' : 'status-danger'}">${isActive ? '🟢 نشط' : '⏸️ متوقف'}</span></td>
                                    <td style="text-align:center; white-space:nowrap;">
                                        <div class="sam-toolbar-group" style="justify-content:center; gap:4px;">
                                            <button class="sam-btn sam-btn--sm ${isActive ? 'sam-btn--warning' : 'sam-btn--success'}" onclick="App.toggleRoamingPeer(${p.id}, '${isActive ? 'paused' : 'active'}')">
                                                ${isActive ? '⏸️ إيقاف مؤقت' : '▶ تفعيل'}
                                            </button>
                                            <button class="sam-btn sam-btn--sm sam-btn--danger" onclick="App.deleteRoamingPeer(${p.id})">
                                                🗑️ حذف
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    document.getElementById('roaming-main-content').innerHTML = html;
};

App.openAddRoamingPeerModal = async function() {
    const res = await this.api('get_networks', { scope: 'all' });
    const networks = (res && res.networks) ? res.networks : [];
    if (networks.length < 2) {
        return this.toast('يتطلب التجوال وجود شبكتين على الأقل في النظام', 'warning');
    }

    const currentNetId = Number(this.activeNetworkId || (networks[0]?.id || 0));

    const modalHtml = `
        <div class="mt-modal-header" style="background:linear-gradient(135deg, #4338ca, #3730a3); color:#fff; padding:14px 20px;">
            <span style="font-weight:800; font-size:15px;">🌐 إضافة اتفاقية تحالف وتجوال شبكات جديدة</span>
            <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
        </div>
        <form onsubmit="App.saveRoamingPeer(event)">
            <div class="mt-modal-body" style="padding:20px; max-height:75vh; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; font-size:12px; color:#1e40af; line-height:1.7;">
                    🤝 بمجرد تفعيل الاتفاقية، سيتم تحديث مصادقة FreeRADIUS فوراً للسماح للمشتركين باستخدام كروتهم عبر الشبكتين دون أي تعديل يدوي في الراوترات.
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:4px; display:block;">الشبكة المحلية *</label>
                        <select id="roam-local-net" class="mt-select" style="width:100%; font-weight:700;" required>
                            ${networks.map(n => `<option value="${n.id}" ${Number(n.id) === currentNetId ? 'selected' : ''}>🌐 ${this.escape(n.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:4px; display:block;">الشبكة الحليفة (Peer Network) *</label>
                        <select id="roam-peer-net" class="mt-select" style="width:100%; font-weight:700;" required>
                            <option value="">-- اختر الشبكة الحليفة --</option>
                            ${networks.map(n => `<option value="${n.id}" ${Number(n.id) === currentNetId ? 'disabled' : ''}>🤝 ${this.escape(n.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:4px; display:block;">نوع واتجاه التجوال *</label>
                        <select id="roam-type" class="mt-select" style="width:100%;">
                            <option value="bidirectional" selected>🔄 تبادلي كامل (المشتركون يتجولون في الاتجاهين)</option>
                            <option value="incoming">📥 استقبال فقط (مشتركو الحليف يستخدمون راوتراتنا)</option>
                            <option value="outgoing">📤 تصدير فقط (مشتركونا يستخدمون راوترات الحليف)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:13px; margin-bottom:4px; display:block;">سعر المقاصة لكل جيجابايت (Clearing Rate/GB)</label>
                        <input type="number" id="roam-clearing-rate" class="mt-input" min="0" step="0.01" value="0.00" placeholder="0.00" style="width:100%; font-family:monospace; font-weight:700;" />
                        <small style="font-size:11px; color:#64748b; margin-top:2px; display:block;">القيمة المالية لحساب التسوية لكل 1 GB مستهلك</small>
                    </div>
                </div>

                <div>
                    <label style="font-weight:700; font-size:13px; margin-bottom:4px; display:block;">الباقات المسموح بتجوالها (اختياري)</label>
                    <input type="text" id="roam-allowed-profiles" class="mt-input" placeholder="اتركه فارغاً لجميع الباقات، أو أدخل أسماء الباقات مفصولة بفاصلة" style="width:100%;" />
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="submit" id="btn-save-roam-peer" class="mt-btn mt-btn-primary" style="background:#4338ca; border-color:#3730a3; font-weight:700;">
                    💾 حفظ وتفعيل التحالف فوراً
                </button>
            </div>
        </form>
    `;
    this.openModal(modalHtml, '620px');
};

App.saveRoamingPeer = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    const networkId = document.getElementById('roam-local-net')?.value;
    const peerNetworkId = document.getElementById('roam-peer-net')?.value;
    const roamingType = document.getElementById('roam-type')?.value;
    const clearingRate = parseFloat(document.getElementById('roam-clearing-rate')?.value || 0);
    const allowedProfiles = document.getElementById('roam-allowed-profiles')?.value?.trim();

    if (!networkId || !peerNetworkId) {
        return this.toast('يرجى تحديد كل من الشبكة المحلية والشبكة الحليفة', 'warning');
    }
    if (networkId === peerNetworkId) {
        return this.toast('لا يمكن إنشاء اتفاقية تجوال لشبكة مع نفسها', 'warning');
    }

    const btn = document.getElementById('btn-save-roam-peer');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ والتطبيق على RADIUS...'; }

    const res = await this.api('add_roaming_peer', {
        network_id: networkId,
        peer_network_id: peerNetworkId,
        roaming_type: roamingType,
        clearing_rate: clearingRate,
        allowed_profiles: allowedProfiles
    }, 'POST');

    if (res && res.success) {
        this.closeModal();
        this.toast(res.message || 'تم تفعيل اتفاقية التجوال وتحديث FreeRADIUS بنجاح ✓', 'success');
        this.renderRoamingPeers();
    } else {
        if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ وتفعيل التحالف فوراً'; }
        this.toast(res?.error || 'فشل حفظ التحالف', 'danger');
    }
};

App.toggleRoamingPeer = async function(peerId, newStatus) {
    const statusLabel = newStatus === 'active' ? 'تفعيل' : 'إيقاف مؤقت';
    if (!confirm(`هل أنت متأكد من ${statusLabel} اتفاقية التجوال هذه؟`)) return;

    const res = await this.api('toggle_roaming_peer', {
        peer_id: peerId,
        status: newStatus
    }, 'POST');

    if (res && res.success) {
        this.toast(res.message || `تم ${statusLabel} بنجاح`, 'success');
        this.renderRoamingPeers();
    } else {
        this.toast(res?.error || 'فشل تحديث الحالة', 'danger');
    }
};

App.deleteRoamingPeer = async function(peerId) {
    if (!confirm('هل أنت متأكد من حذف اتفاقية التجوال هذه؟ سيتم حظر المصادقة المتجولة فوراً.')) return;

    const res = await this.api('delete_roaming_peer', {
        peer_id: peerId
    }, 'POST');

    if (res && res.success) {
        this.toast(res.message || 'تم حذف اتفاقية التجوال بنجاح', 'success');
        this.renderRoamingPeers();
    } else {
        this.toast(res?.error || 'فشل الحذف', 'danger');
    }
};

// =========================================================================
// ROAMING CLEARING & CONSUMPTION SETTLEMENT REPORT (تقرير المحاسبة والتسوية)
// =========================================================================

App.renderRoamingClearingReport = async function(fromDate = '', toDate = '', networkId = '') {
    const mainView = document.getElementById('main-view');
    if (!mainView) return;

    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const from = fromDate || firstDay;
    const to = toDate || today;

    mainView.innerHTML = `
        <div class="mt-toolbar">
            <div class="mt-toolbar-left">
                <button class="mt-btn" onclick="App.renderRoamingPeers()" style="margin-left:8px;">← رجوع للتحالفات</button>
                <span style="font-weight:700; font-size:15px; display:flex; align-items:center; gap:6px;">
                    📑 تقرير المحاسبة والتسوية المالية للتجوال (Roaming Clearing & Settlement)
                </span>
            </div>
            <div class="mt-toolbar-right" style="gap:8px; display:flex; align-items:center; flex-wrap:wrap;">
                <label style="font-size:12px; font-weight:700; color:#475569;">من:</label>
                <input type="date" id="roam-rep-from" class="mt-input" value="${from}" style="padding:4px 8px; font-size:12px;" />
                <label style="font-size:12px; font-weight:700; color:#475569;">إلى:</label>
                <input type="date" id="roam-rep-to" class="mt-input" value="${to}" style="padding:4px 8px; font-size:12px;" />
                <button class="mt-btn mt-btn-primary" onclick="App.onFilterRoamingReport()">🔍 عرض</button>
            </div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:16px;" id="roaming-rep-content">
            <div style="text-align:center; padding:40px; color:var(--text-muted);">⏳ جار احتساب استهلاك الجلسات والمقاصة المالية...</div>
        </div>
    `;

    const res = await this.api('get_roaming_clearing_report', {
        from: from,
        to: to,
        network_id: networkId || this.activeNetworkId || 0
    });

    if (!res || !res.success) {
        document.getElementById('roaming-rep-content').innerHTML = `<div style="color:#ef4444; padding:20px; font-weight:bold;">❌ تعذر تحميل تقرير التسوية: ${res?.error || 'خطأ في الاتصال'}</div>`;
        return;
    }

    const summary = res.summary || {};
    const inc = summary.incoming || { sessions_count: 0, total_gb: 0, cost: 0 };
    const out = summary.outgoing || { sessions_count: 0, total_gb: 0, cost: 0 };
    const netBal = parseFloat(summary.net_financial_balance || 0);
    const sessions = res.sessions || [];

    let html = `
        <!-- Settlement Summary Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:16px;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:700; color:#1e40af; margin-bottom:4px;">📥 استهلاك زوار الشبكة (Incoming Roaming)</div>
                <div style="font-size:22px; font-weight:900; color:#2563eb;">${parseFloat(inc.total_gb || 0).toFixed(2)} GB</div>
                <div style="font-size:11px; color:#475569; margin-top:4px;">
                    الجلسات: <b>${inc.sessions_count || 0}</b> | المستحق لنا: <b style="color:#16a34a;">${App.formatMoney(inc.cost || 0)}</b>
                </div>
            </div>

            <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:700; color:#5b21b6; margin-bottom:4px;">📤 استهلاك مشتركينا بالخارج (Outgoing Roaming)</div>
                <div style="font-size:22px; font-weight:900; color:#7c3aed;">${parseFloat(out.total_gb || 0).toFixed(2)} GB</div>
                <div style="font-size:11px; color:#475569; margin-top:4px;">
                    الجلسات: <b>${out.sessions_count || 0}</b> | المستحق علينا: <b style="color:#dc2626;">${App.formatMoney(out.cost || 0)}</b>
                </div>
            </div>

            <div style="background:${netBal >= 0 ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${netBal >= 0 ? '#bbf7d0' : '#fecaca'}; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:700; color:${netBal >= 0 ? '#166534' : '#991b1b'}; margin-bottom:4px;">⚖️ صافي رصيد المقاصة والتسوية</div>
                <div style="font-size:22px; font-weight:900; color:${netBal >= 0 ? '#16a34a' : '#dc2626'};">${App.formatMoney(Math.abs(netBal))}</div>
                <div style="font-size:11px; color:#475569; margin-top:4px;">
                    الوضعية: <b>${netBal >= 0 ? '🟢 رصيد دائن (مستحق القبض لصالحنا)' : '🔴 رصيد مدين (مستحق الدفع للحلفاء)'}</b>
                </div>
            </div>
        </div>

        <!-- Sessions Log Table -->
        <div class="sam-table-container mt-table-container">
            <div style="padding:12px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-weight:800; font-size:13px; color:#1e293b;">
                📋 سجل جلسات التجوال التفصيلي (${sessions.length})
            </div>
            <table class="sam-table mt-table" style="font-size:11px;">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>اسم الكرت / المشترك</th>
                        <th>شبكة الكرت الأصلية</th>
                        <th>الراوتر المتصل به (NAS)</th>
                        <th>تاريخ الجلسة</th>
                        <th>المدة (Uptime)</th>
                        <th>الاستهلاك (GB)</th>
                        <th>سعر المقاصة</th>
                        <th>المبلغ الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.length === 0 ? `
                        <tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد جلسات تجوال مسجلة في هذه الفترة</td></tr>
                    ` : sessions.map((s, i) => {
                        const totalBytes = (parseInt(s.acctinputoctets || 0) + parseInt(s.acctoutputoctets || 0));
                        const totalGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(3);
                        const rate = parseFloat(s.clearing_rate || 0);
                        const cost = (parseFloat(totalGb) * rate).toFixed(2);

                        return `
                            <tr>
                                <td>${i + 1}</td>
                                <td><b style="color:#0f172a;">${this.escape(s.username)}</b></td>
                                <td><span style="background:#eff6ff; color:#2563eb; border-radius:6px; padding:2px 6px; font-weight:700;">🌐 ${this.escape(s.home_network_name || 'شبكة #' + s.home_network_id)}</span></td>
                                <td><code>${this.escape(s.nasipaddress)}</code> (${this.escape(s.nas_shortname || 'NAS')})</td>
                                <td>${this.escape(s.acctstarttime || '-')}</td>
                                <td>${App.formatDuration ? App.formatDuration(s.acctsessiontime) : (s.acctsessiontime + 's')}</td>
                                <td><b style="color:#2563eb;">${totalGb} GB</b></td>
                                <td>${rate} ر.ي</td>
                                <td><b style="color:#16a34a;">${App.formatMoney(cost)}</b></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('roaming-rep-content').innerHTML = html;
};

App.onFilterRoamingReport = function() {
    const from = document.getElementById('roam-rep-from')?.value;
    const to = document.getElementById('roam-rep-to')?.value;
    this.renderRoamingClearingReport(from, to);
};
