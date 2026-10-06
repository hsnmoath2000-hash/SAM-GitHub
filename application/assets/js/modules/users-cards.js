/**
 * SAM User Manager — Subscribers, Cards Generation, Profiles & Usage
 */
'use strict';

Object.assign(window.App, {
    toggleUserActionMenu(username) {
        if (!username) return;
        // On mobile screens (<= 768px), open a modern mobile action sheet
        if (window.innerWidth <= 768) {
            this.showUserMobileActionSheet(username);
            return;
        }
        const menu = document.getElementById(`user-actions-${username}`);
        if (!menu) return;
        const isCurrentlyOpen = menu.style.display === 'flex';
        this.closeUserActionMenus();
        if (!isCurrentlyOpen) {
            menu.style.display = 'flex';
            menu.removeAttribute('hidden');
        }
    },
    closeUserActionMenus() {
        document.querySelectorAll('.sam-action-menu__items').forEach(menu => {
            menu.style.display = 'none';
            menu.setAttribute('hidden', '');
        });
    },
    showUserMobileActionSheet(username) {
        if (!username) return;
        const u = (this.usersCache || []).find(x => String(x.username) === String(username)) || { username };
        const safeUser = this.escape(username);
        const isDisabled = u.is_disabled == 1;
        const canDelete = this.can('users_delete') && Number(u.can_delete_card || 0) === 1;

        const sheetHtml = `
            <div class="sam-modal-backdrop" onclick="if(event.target===this) App.closeModal()" style="align-items:flex-end; padding:0; z-index:100000;">
                <div class="sam-modal-dialog" style="width:100%; max-width:100%; border-radius:20px 20px 0 0; margin:0; animation:sam-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; background:#ffffff; box-shadow:0 -10px 30px rgba(0,0,0,0.25);">
                    <div style="padding:16px 20px; border-bottom:1px solid var(--sam-border, #e2e8f0); display:flex; align-items:center; justify-content:space-between; background:var(--sam-bg-surface-alt, #f8fafc); border-radius:20px 20px 0 0;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px; background:var(--sam-primary-light, #f0fdfa); padding:6px 10px; border-radius:10px; border:1px solid var(--sam-primary-border, #99f6e4);">🎫</span>
                            <div>
                                <div style="font-weight:800; font-size:15px; color:var(--sam-primary, #0f766e);">الكرت: <code style="font-size:16px;">${safeUser}</code></div>
                                <div style="font-size:12px; color:var(--sam-text-muted, #64748b); margin-top:2px;">الباقة: <b>${this.escape(u.profile_name || 'Default')}</b> | السعر: <b>${Number(u.price || 0).toLocaleString()} ر.ي</b></div>
                            </div>
                        </div>
                        <button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" onclick="App.closeModal()" style="width:32px; height:32px; padding:0; border-radius:50%; font-size:14px; font-weight:bold;">✕</button>
                    </div>
                    <div style="padding:16px; display:flex; flex-direction:column; gap:10px; max-height:65vh; overflow-y:auto;">
                        <button type="button" class="sam-btn sam-btn--secondary" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px; border:1px solid #cbd5e1; background:#ffffff;" onclick="App.closeModal(); App.showUserUsageModal('${safeUser}')">
                            <span style="font-size:18px; margin-left:10px;">📊</span> تفاصيل الاستهلاك وسجل الجلسات
                        </button>
                        ${this.can('users_edit') || this.can('users_add') ? `
                            <button type="button" class="sam-btn sam-btn--secondary" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px; border:1px solid #cbd5e1; background:#ffffff;" onclick="App.closeModal(); App.editUser('${safeUser}')">
                                <span style="font-size:18px; margin-left:10px;">✏️</span> تعديل بيانات الكرت
                            </button>
                        ` : ''}
                        ${this.can('users_change_profile') ? `
                            <button type="button" class="sam-btn sam-btn--secondary" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px; border:1px solid #cbd5e1; background:#ffffff;" onclick="App.closeModal(); App.singleChangeProfile('${safeUser}')">
                                <span style="font-size:18px; margin-left:10px;">📦</span> تغيير باقة الكرت
                            </button>
                        ` : ''}
                        ${this.can('users_reset') ? `
                            <button type="button" class="sam-btn sam-btn--success" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px;" onclick="App.closeModal(); App.singleResetUsage('${safeUser}')">
                                <span style="font-size:18px; margin-left:10px;">🔄</span> تصفير العداد وإعادة الكرت جديد
                            </button>
                        ` : ''}
                        ${(isDisabled ? this.can('users_enable') : this.can('users_disable')) ? `
                            <button type="button" class="sam-btn ${isDisabled ? 'sam-btn--success' : 'sam-btn--warning'}" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px;" onclick="App.closeModal(); App.setUserStatus('${safeUser}', ${isDisabled})">
                                <span style="font-size:18px; margin-left:10px;">${isDisabled ? '✓' : '⛔'}</span> ${isDisabled ? 'تفعيل الكرت' : 'تعطيل الكرت إدارياً'}
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button type="button" class="sam-btn sam-btn--danger" style="width:100%; justify-content:flex-start; padding:12px 16px; font-size:13.5px; font-weight:700; border-radius:10px; min-height:44px;" onclick="App.closeModal(); App.deleteUser('${safeUser}')">
                                <span style="font-size:18px; margin-left:10px;">🗑️</span> حذف الكرت نهائياً
                            </button>
                        ` : ''}
                    </div>
                    <div style="padding:12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid var(--sam-border, #e2e8f0); background:var(--sam-bg-surface-alt, #f8fafc);">
                        <button type="button" class="sam-btn sam-btn--secondary" style="width:100%; min-height:42px; font-weight:800; font-size:14px; border-radius:10px; background:#e2e8f0; border:none;" onclick="App.closeModal()">إلغاء</button>
                    </div>
                </div>
            </div>
        `;
        let mc = document.getElementById('modal-container');
        if (!mc) {
            mc = document.createElement('div');
            mc.id = 'modal-container';
            document.body.appendChild(mc);
        }
        mc.innerHTML = sheetHtml;
    },
    setUserFilterStatus(status) {
        this.usersFilterStatus = status || '';
        this.usersPage = 1;
        this.renderUsers();
    },
    setUserCardKind(kind) {
        this.usersFilterCardKind = (this.usersFilterCardKind === kind) ? '' : (kind || '');
        this.usersPage = 1;
        this.renderUsers();
    },
    setUserFilterProf(prof) {
        this.usersFilterProf = prof || '';
        this.usersPage = 1;
        this.renderUsers();
    },
    setUserFilterBatch(batch) {
        this.usersFilterBatch = batch || '';
        this.usersPage = 1;
        this.renderUsers();
    },
    setUserFilterOwner(owner) {
        this.usersFilterOwner = owner || '';
        this.usersPage = 1;
        this.renderUsers();
    },
    resetUserFilters() {
        this.usersSearchQuery = '';
        this.usersFilterProf = '';
        this.usersFilterStatus = '';
        this.usersFilterBatch = '';
        this.usersFilterCardKind = '';
        this.usersFilterOwner = '';
        this.usersPage = 1;
        this.renderUsers();
    },
    async showPrintBatchesPage() {
        const result = await this.api('get_print_batches');
        const batches = result?.data || [];
        const total = batches.reduce((n, b) => n + Number(b.total_cards || 0), 0);
        const sold = batches.reduce((n, b) => n + Number(b.sold_cards || 0), 0);
        const available = batches.reduce((n, b) => n + Number(b.unsold_cards || 0), 0);
        const rows = batches.map((b, i) => `<tr>
            <td>${i + 1}</td><td><code>${this.escape(b.batch_id || '')}</code></td>
            <td>${this.escape(b.profile_name || '—')}</td><td>${Number(b.total_cards || 0).toLocaleString()}</td>
            <td>${Number(b.cards_per_sheet || 0).toLocaleString()}</td><td>${Number(b.total_sheets || 0).toLocaleString()}</td>
            <td>${Number(b.unsold_cards || 0).toLocaleString()}</td><td>${Number(b.sold_cards || 0).toLocaleString()}</td>
            <td>${this.escape(b.print_status || '—')}</td><td>${this.escape(b.created_at || '—')}</td>
            <td><button type="button" class="sam-btn sam-btn--sm sam-btn--primary" onclick="App.printBatchById('${this.escape(b.batch_id || '')}')">🖨️ طباعة المتاح</button>
            ${b.print_status !== 'confirmed_printed' ? `<button type="button" class="sam-btn sam-btn--sm" onclick="App.confirmPrintBatch('${this.escape(b.batch_id || '')}')">✓ تأكيد الطباعة</button>` : ''}</td>
        </tr>`).join('');
        const PB = window.SamUI?.PageBuilder;
        document.getElementById('main-view').innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'voucher-print-batches', archetype: 'table', title: 'عمليات طباعة الكروت',
            subtitle: 'دفعات الطباعة وإحصاءات الكروت المباعة والمتبقية — ضمن الشبكة النشطة فقط',
            eyebrow: 'VOUCHER PRINTING', icon: '🧾',
            actions: [{label:'↩ العودة للكروت', variant:'secondary', onclick:'App.renderUsers()'}, {label:'⟳ تحديث', variant:'secondary', onclick:'App.showPrintBatchesPage()'}],
            stats: [
                {label:'إجمالي الكروت في الدفعات',value:total.toLocaleString(),icon:'🎫',tone:'blue'},
                {label:'المباعة/المسندة',value:sold.toLocaleString(),icon:'💳',tone:'green'},
                {label:'المتبقية في العهدة',value:available.toLocaleString(),icon:'📦',tone:'purple'}
            ], content:`<div class="sam-table-container"><table class="sam-table"><thead><tr><th>#</th><th>رقم الدفعة</th><th>الباقة</th><th>الكروت</th><th>في الورقة</th><th>الأوراق</th><th>غير مباعة</th><th>مباعة/مسندة</th><th>حالة الطباعة</th><th>تاريخ الإنشاء</th><th>الإجراءات</th></tr></thead><tbody>${rows || '<tr><td colspan="11" style="text-align:center;padding:28px">لا توجد دفعات طباعة في هذه الشبكة</td></tr>'}</tbody></table></div>`
        }) : `<h2>عمليات طباعة الكروت</h2><button onclick="App.renderUsers()">العودة</button><table>${rows}</table>`;
    },
    async confirmPrintBatch(batchId) {
        if (!batchId || !confirm('تأكيد طباعة الدفعة؟ سيُسجل هذا الإجراء على الشبكة النشطة.')) return;
        const result = await this.api('confirm_print_batch', {batch_id: batchId}, 'POST');
        if (result?.success) { this.toast('تم تأكيد الطباعة', 'success'); this.showPrintBatchesPage(); }
        else this.toast(result?.error || 'تعذر تأكيد الطباعة', 'danger');
    },
    async showRouterOSImportPage() {
        const [routerRes, profileRes] = await Promise.all([this.api('get_usermanager_import_routers'), this.api('get_profiles')]);
        const routers = routerRes?.routers || [];
        const profiles = Array.isArray(profileRes) ? profileRes : (profileRes?.data || []);
        this.umImportState = {
            activeTab: 'router',
            routers,
            profiles,
            token: null,
            summary: null,
            customerId: null,
            profileId: 0,
            page: 1,
            selected: new Set(),
            includedProfiles: new Set(),
            profileMap: {},
            networkId: routerRes?.network_id || this.activeNetworkId || 0,
            targetStatus: 'active'
        };
        this.renderRouterOSImportPage();
    },
    setUmImportTab(tab) {
        if (this.umImportState) {
            this.umImportState.activeTab = tab;
            this.renderRouterOSImportPage();
        }
    },
    formatDuration(sec) {
        sec = Number(sec) || 0;
        if (sec <= 0) return '0 ثانية';
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const parts = [];
        if (d > 0) parts.push(`${d}ي`);
        if (h > 0) parts.push(`${h}س`);
        if (m > 0) parts.push(`${m}د`);
        if (s > 0 && parts.length === 0) parts.push(`${s}ث`);
        return parts.join(' ') || `${sec}ث`;
    },
    renderRouterOSImportPage() {
        queueMicrotask(()=>{const view=document.getElementById("main-view");if(view&&this.umImportState&&this.currentTab==="users"&&!view.querySelector(".sam-import-policy")){const note=document.createElement("div");note.className="sam-import-policy";note.style.cssText="padding:12px;margin-bottom:12px;border:1px solid #f2d592;background:#fff9e9;border-radius:10px;line-height:1.8";note.textContent="يطبق الاستيراد نمط دخول الشبكة ويحذف المسافات من رقم الكرت وكلمة المرور. تُحفظ الصلاحية الأصلية عند توفرها؛ والكروت المستخدمة مجهولة الصلاحية تبقى معطلة للمراجعة. لا يغيّر الاستيراد بيانات الراوتر المصدر.";view.prepend(note);}});
        const s = this.umImportState; if (!s) return;
        const selectedRouterId = Number(s.transfer?.routerId || s.routerId || s.routers[0]?.id || 0);
        const selectedRouter = s.routers.find(r => Number(r.id) === selectedRouterId) || s.routers[0];
        const routerOptions = s.routers.map(r => `<option value="${Number(r.id)}" ${Number(r.id) === selectedRouterId ? 'selected' : ''}>${this.escape(r.shortname || r.nasname)} (${this.escape(r.nasname)})</option>`).join('');

        if (s.summary && (!s.includedProfiles || s.includedProfiles.size === 0)) {
            s.includedProfiles = new Set(s.summary.profiles.map(p => Number(p.id)));
        }

        const includedProfilesList = (s.summary?.profiles || []).filter(p => !s.includedProfiles || s.includedProfiles.has(Number(p.id)));
        const totalIncludedCards = includedProfilesList.reduce((sum, p) => sum + Number(p.card_count || 0), 0);
        const totalIncludedFresh = includedProfilesList.reduce((sum, p) => sum + Number(p.fresh_count !== undefined ? p.fresh_count : (p.card_count || 0)), 0);
        const totalIncludedUsed = includedProfilesList.reduce((sum, p) => sum + Number(p.used_count || 0), 0);
        const allProfilesIncluded = (s.summary?.profiles || []).length > 0 && (s.summary?.profiles || []).every(p => s.includedProfiles && s.includedProfiles.has(Number(p.id)));
        const hasManualSelection = s.selected && s.selected.size > 0;

        s.sortCol = s.sortCol || 'id';
        s.sortDir = s.sortDir || 'asc';
        s.searchFilter = s.searchFilter || '';
        s.cardKindFilter = s.cardKindFilter || '';
        s.usageFilter = s.usageFilter || '';

        const sortIcon = (col) => {
            if (s.sortCol !== col) return '<span style="opacity:0.35; font-size:11px;"> ⇅</span>';
            return s.sortDir === 'desc' ? '<span style="color:#0284c7; font-weight:bold; font-size:12px;"> ▼</span>' : '<span style="color:#0284c7; font-weight:bold; font-size:12px;"> ▲</span>';
        };

        const visibleCards = (s.cards || []).filter(c => {
            const pId = Number(c.source_profile_id || c.profile_id || 0);
            return !s.includedProfiles || s.includedProfiles.size === 0 || pId === 0 || s.includedProfiles.has(pId);
        });
        const allSelectedOnPage = visibleCards.length > 0 && visibleCards.every(c => s.selectAllFile || s.selected.has(Number(c.id)));

        const content = s.summary ? `
            <div class="sam-alert sam-alert--info" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                    <b>معاينة الكروت المستخرجة</b> — الشبكة النشطة: <b>#${Number(s.networkId)}</b> | إجمالي كروت الملف: <b>${Number(s.summary.counts.cards || 0).toLocaleString()}</b>
                    <span style="font-size:12px;color:#10b981;font-weight:700;margin:0 4px;">(✨ ${Number(s.summary.counts.fresh_cards || 0).toLocaleString()} جديدة)</span>
                    <span style="font-size:12px;color:#f59e0b;font-weight:700;">(⏱️ ${Number(s.summary.counts.used_cards || 0).toLocaleString()} مستهلكة)</span>
                    <span style="font-size:12px;display:block;color:var(--text-muted, #64748b);margin-top:2px;">حدد الباقات المطلوبة للاستيراد، طابقها أو اضغط «إنشاء الباقات الناقصة»، ثم اختر استيراد كافة الكروت أو الجديدة فقط مباشرة.</span>
                </div>
                <button class="sam-btn sam-btn--secondary" onclick="App.discardRouterOSImportPreview()">✕ إلغاء المعاينة وحذف الملف المؤقت</button>
            </div>

            <section class="sam-card" style="padding:16px;margin-bottom:16px;border:1px solid var(--border-color, #e2e8f0);border-radius:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0 0 4px 0;">1. مطابقة باقات المصدر والتحكم في استيرادها</h3>
                        <p style="font-size:13px;color:var(--text-muted, #64748b);margin:0;">حدد الباقات المراد استيراد كروتها، واربط كل باقة بباقة في النظام أو اضغط زر التجهيز التلقائي.</p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.toggleAllImportProfilesInclusion(true)">✓ تحديد كافة الباقات (${(s.summary.profiles || []).length})</button>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.toggleAllImportProfilesInclusion(false)">✕ إلغاء تحديد الكل</button>
                        <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" onclick="App.autoCreateAllMissingImportProfiles()" title="إنشاء وربط كافة الباقات الناقصة تلقائياً في شبكتك النشطة">⚡ إنشاء وربط الباقات الناقصة تلقائياً</button>
                    </div>
                </div>

                <div class="sam-table-container"><table class="sam-table">
                    <thead><tr>
                        <th style="width:50px;text-align:center;">
                            <input type="checkbox" ${allProfilesIncluded ? 'checked' : ''} onchange="App.toggleAllImportProfilesInclusion(this.checked)" title="تحديد / إلغاء تحديد كافة الباقات" />
                        </th>
                        <th>الباقة المصدر</th>
                        <th>السعر المصدر</th>
                        <th>الصلاحية</th>
                        <th>عدد البطاقات</th>
                        <th>باقة النظام المرتبطة</th>
                        <th style="min-width:180px;">إجراءات الباقة</th>
                    </tr></thead>
                    <tbody>${s.summary.profiles.map(p => {
                        const isInc = s.includedProfiles ? s.includedProfiles.has(Number(p.id)) : true;
                        return `<tr style="${isInc ? '' : 'opacity:0.55;background:rgba(0,0,0,0.03);'}">
                            <td style="text-align:center;">
                                <input type="checkbox" ${isInc ? 'checked' : ''} onchange="App.toggleImportProfileInclusion(${Number(p.id)}, this.checked)" title="تضمين هذه الباقة في الاستيراد" />
                            </td>
                            <td><b>${this.escape(p.name || '—')}</b></td>
                            <td>${Number(p.price || 0).toLocaleString()}</td>
                            <td>${this.escape(String(p.validity ?? '—'))}</td>
                            <td>
                                <span class="sam-badge sam-badge--info" style="font-weight:700;">${Number(p.card_count || 0).toLocaleString()}</span>
                                ${p.fresh_count !== undefined ? `
                                    <div style="font-size:11px;margin-top:3px;display:flex;gap:6px;">
                                        <span style="color:#10b981;font-weight:700;" title="كروت جديدة">✨ ${Number(p.fresh_count).toLocaleString()}</span>
                                        <span style="color:#f59e0b;font-weight:700;" title="كروت مستهلكة">⏱️ ${Number(p.used_count || 0).toLocaleString()}</span>
                                    </div>
                                ` : ''}
                            </td>
                            <td>
                                <select class="sam-select" data-import-profile="${Number(p.id)}" ${isInc ? '' : 'disabled'} onchange="App.umImportState.profileMap[this.dataset.importProfile]=this.value;App.renderRouterOSImportPage()">
                                    <option value="">-- اختر الباقة المحلية المناسبة --</option>
                                    ${s.profiles.map(lp => `<option value="${this.escape(lp.name)}" ${s.profileMap[p.id] === lp.name ? 'selected' : ''}>${this.escape(lp.name)} (السعر: ${Number(lp.price || 0)})</option>`).join('')}
                                </select>
                            </td>
                            <td>
                                <div style="display:flex;gap:6px;align-items:center;">
                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--primary" ${isInc ? '' : 'disabled'} onclick="App.addNewProfileFromImport(${Number(p.id)})" title="إنشاء باقة محلية جديدة مجهزة ببيانات هذه الباقة">➕ إضافة كباقة جديدة</button>
                                    <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" ${s.profileMap[p.id] && isInc ? '' : 'disabled'} onclick="App.editMappedRouterOSImportProfile(${Number(p.id)})" title="تعديل الباقة المحلية المختارة">✏️ تعديل</button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}</tbody>
                </table></div>
            </section>

            <section class="sam-card" style="padding:16px;border:1px solid var(--border-color, #e2e8f0);border-radius:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
                    <div>
                        <h3 style="margin:0 0 4px 0;">2. مراجعة البطاقات واعتماد الاستيراد</h3>
                        <div style="font-size:13px;color:var(--text-muted, #64748b);line-height:1.6;">
                            إجمالي كروت الملف: <b>${Number(s.summary?.counts?.cards || 0).toLocaleString()}</b>
                            <span style="font-size:12px;color:#10b981;font-weight:700;">(✨ ${Number(s.summary?.counts?.fresh_cards || 0).toLocaleString()} جديدة)</span>
                            <span style="font-size:12px;color:#f59e0b;font-weight:700;">(⏱️ ${Number(s.summary?.counts?.used_cards || 0).toLocaleString()} مستهلكة)</span>
                            | كروت الباقات المحددة: <b style="color:var(--sam-primary, #2563eb); font-size:14px;">${totalIncludedCards.toLocaleString()} كرت</b>
                            <span style="font-size:12px;color:#10b981;font-weight:700;">(✨ ${totalIncludedFresh.toLocaleString()} جديدة)</span>
                            <span style="font-size:12px;color:#f59e0b;font-weight:700;">(⏱️ ${totalIncludedUsed.toLocaleString()} مستهلكة)</span>
                            ${s.selectAllFile ? ` | المحدد: <b style="color:#e11d48;">كافة كروت الملف (${Number(s.summary?.counts?.cards || 0).toLocaleString()})</b>` : (hasManualSelection ? ` | المحدد يدوياً: <b style="color:#e11d48;">${s.selected.size.toLocaleString()} كرت</b>` : '')}
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        <label style="font-weight:bold;font-size:13px;">حالة الكروت بعد الاعتماد:
                            <select id="um-import-target-status" class="sam-select" style="font-weight:normal;" onchange="App.umImportState.targetStatus=this.value">
                                <option value="active" ${s.targetStatus === 'active' ? 'selected' : ''}>✅ جاهزة للاستخدام والبيع مباشرة (نشط)</option>
                                <option value="quarantined" ${s.targetStatus === 'quarantined' ? 'selected' : ''}>🔒 محجورة مؤقتاً في المخزن للمراجعة</option>
                            </select>
                        </label>
                        <button class="sam-btn" type="button" onclick="App.commitAllRouterOSImport('all')" ${totalIncludedCards > 0 ? '' : 'disabled'} style="font-weight:bold;padding:9px 22px;font-size:14px;background:#10b981;border-color:#059669;color:#fff;cursor:pointer;border-radius:6px;box-shadow:0 2px 6px rgba(16,185,129,0.3);">
                            ⚡ استيراد كافة كروت الباقات المحددة (${totalIncludedCards.toLocaleString()} كرت)
                        </button>
                    </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;background:var(--sam-bg-surface, #f8fafc);padding:10px;border-radius:6px;border:1px solid var(--border-color, #e2e8f0);">
                    <button class="sam-btn sam-btn--sm sam-btn--primary" type="button" onclick="App.commitAllRouterOSImport('fresh')" ${totalIncludedFresh > 0 ? '' : 'disabled'} title="استيراد الكروت الجديدة فقط للباقات المحددة">
                        🎫 استيراد الجديدة فقط (${totalIncludedFresh.toLocaleString()})
                    </button>
                    <button class="sam-btn sam-btn--sm sam-btn--warning" type="button" onclick="App.commitAllRouterOSImport('used')" ${totalIncludedUsed > 0 ? '' : 'disabled'} title="استيراد الكروت المستهلكة فقط للباقات المحددة">
                        ⏱️ استيراد المستهلكة فقط (${totalIncludedUsed.toLocaleString()})
                    </button>
                    ${s.selectAllFile ? `
                        <button class="sam-btn sam-btn--sm" style="background:#0284c7;color:#fff;font-weight:bold;" type="button" onclick="App.commitSelectedRouterOSImport()" title="اعتماد واستيراد كافة كروت الملف">
                            📥 استيراد كافة كروت الملف (${Number(s.summary?.counts?.cards || 0).toLocaleString()})
                        </button>
                    ` : (hasManualSelection ? `
                        <button class="sam-btn sam-btn--sm" style="background:#0284c7;color:#fff;font-weight:bold;" type="button" onclick="App.commitSelectedRouterOSImport()" title="استيراد الكروت المحددة بالـ Checkbox فقط">
                            📥 استيراد المحددة (${s.selected.size.toLocaleString()})
                        </button>
                    ` : '')}
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" type="button" onclick="App.selectAllRouterOSImportCards('all_file')" title="تحديد كل كروت الملف عبر كافة الصفحات">
                        🔘 تحديد كافة كروت الملف (${Number(s.summary?.counts?.cards || 0).toLocaleString()})
                    </button>
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" type="button" onclick="App.toggleAllPageRouterOSCards(true)" title="تحديد كروت الصفحة الحالية">
                        ✓ تحديد الصفحة (${(s.cards || []).length})
                    </button>
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" type="button" onclick="App.selectAllRouterOSImportCards('none')">
                        ✕ إلغاء التحديد
                    </button>
                </div>

                <div class="sam-table-container"><table class="sam-table">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="width:40px; text-align:center;">
                                <input type="checkbox" ${s.selectAllFile || allSelectedOnPage ? 'checked' : ''} onchange="App.toggleAllPageRouterOSCards(this.checked)" title="${s.selectAllFile ? 'إلغاء تحديد الكل' : 'تحديد كل الصفحة'}" />
                            </th>
                            <th onclick="App.sortRouterOSImportCards('username')" style="cursor:pointer; user-select:none;" title="انقر لترتيب العمود">اسم المستخدم ${sortIcon('username')}</th>
                            <th onclick="App.sortRouterOSImportCards('profile')" style="cursor:pointer; user-select:none;" title="انقر لترتيب العمود">الباقة المصدرية ${sortIcon('profile')}</th>
                            <th onclick="App.sortRouterOSImportCards('status')" style="cursor:pointer; user-select:none;" title="انقر لترتيب العمود">حالة البطاقة بالمصدر ${sortIcon('status')}</th>
                            <th onclick="App.sortRouterOSImportCards('uptime')" style="cursor:pointer; user-select:none;" title="انقر لترتيب العمود">استهلاك مسجل ${sortIcon('uptime')}</th>
                            <th style="width:70px; text-align:center;">تفاصيل</th>
                        </tr>
                        <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1;">
                            <td style="text-align:center; padding:4px;">
                                <span style="font-size:11px; color:#94a3b8;">فلترة:</span>
                            </td>
                            <td style="padding:4px 6px;">
                                <input type="text" class="sam-input sam-input--sm" style="width:100%; min-width:110px; padding:4px 8px; font-size:12px; border-radius:4px;" placeholder="🔍 بحث بالاسم..." value="${this.escape(s.searchFilter || '')}" oninput="App.debounceFilterRouterOSCards('search', this.value)" />
                            </td>
                            <td style="padding:4px 6px;">
                                <select class="sam-select sam-select--sm" style="width:100%; min-width:110px; padding:4px 6px; font-size:12px; border-radius:4px;" onchange="App.onFilterRouterOSImport('profileId', this.value)">
                                    <option value="0">كل الباقات (${Number(s.summary?.counts?.cards || 0).toLocaleString()})</option>
                                    ${(s.summary?.profiles || []).map(p => `<option value="${p.id}" ${Number(s.profileId) === Number(p.id) ? 'selected' : ''}>${this.escape(p.name || ('باقة ' + p.id))} (${Number(p.card_count || 0).toLocaleString()})</option>`).join('')}
                                </select>
                            </td>
                            <td style="padding:4px 6px;">
                                <select class="sam-select sam-select--sm" style="width:100%; min-width:110px; padding:4px 6px; font-size:12px; border-radius:4px;" onchange="App.onFilterRouterOSImport('cardKindFilter', this.value)">
                                    <option value="" ${!s.cardKindFilter ? 'selected' : ''}>كافة الحالات</option>
                                    <option value="fresh" ${s.cardKindFilter === 'fresh' ? 'selected' : ''}>✨ جديدة فقط</option>
                                    <option value="used" ${s.cardKindFilter === 'used' ? 'selected' : ''}>⏱️ مستهلكة فقط</option>
                                </select>
                            </td>
                            <td style="padding:4px 6px;">
                                <select class="sam-select sam-select--sm" style="width:100%; min-width:100px; padding:4px 6px; font-size:12px; border-radius:4px;" onchange="App.onFilterRouterOSImport('usageFilter', this.value)">
                                    <option value="" ${!s.usageFilter ? 'selected' : ''}>الكل</option>
                                    <option value="none" ${s.usageFilter === 'none' ? 'selected' : ''}>بدون استهلاك (0)</option>
                                    <option value="has" ${s.usageFilter === 'has' ? 'selected' : ''}>يوجد استهلاك</option>
                                </select>
                            </td>
                            <td style="padding:4px 6px; text-align:center;">
                                <button type="button" class="sam-btn sam-btn--sm" style="padding:3px 8px; font-size:11px; background:#e2e8f0; color:#334155;" onclick="App.resetRouterOSImportFilters()" title="إعادة ضبط الفلاتر">↺ تفريغ</button>
                            </td>
                        </tr>
                    </thead>
                    <tbody>${s.cardsLoading ? '<tr><td colspan="6" style="text-align:center;padding:24px">جارٍ تحميل البطاقات...</td></tr>' : ((visibleCards || []).map(c => {
                        const profObj = (s.summary?.profiles || []).find(p => Number(p.id) === Number(c.source_profile_id));
                        const profNameDisplay = profObj?.name || c.actualProfileName || c.groupName || (c.source_profile_id ? 'باقة ' + c.source_profile_id : '—');
                        return `<tr>
                        <td style="text-align:center;"><input type="checkbox" ${s.selectAllFile || s.selected.has(Number(c.id)) ? 'checked' : ''} onchange="App.toggleRouterOSImportCard(${Number(c.id)},this.checked)" /></td>
                        <td><code>${this.escape(c.userName)}</code></td>
                        <td><b>${this.escape(profNameDisplay)}</b></td>
                        <td>${Number(c.is_used) ? '<span class="sam-badge sam-badge--warning" style="font-weight:700;">⏱️ قيد الاستخدام (مستهلكة)</span>' : '<span class="sam-badge sam-badge--success" style="font-weight:700;">✨ جديدة وغير مستخدمة</span>'}</td>
                        <td>${(Number(c.uptimeUsed || 0) > 0 || Number(c.downloadUsed || 0) > 0 || Number(c.uploadUsed || 0) > 0) ? `
                            <span style="font-size:12px;color:var(--text-muted,#475569)">
                                ${Number(c.uptimeUsed || 0) > 0 ? '⏱️ ' + this.formatDuration(c.uptimeUsed) : ''}
                                ${Number(c.downloadUsed || 0) > 0 ? ' 📥 ' + (Number(c.downloadUsed)/1048576).toFixed(1) + 'MB' : ''}
                                ${Number(c.uploadUsed || 0) > 0 ? ' 📤 ' + (Number(c.uploadUsed)/1048576).toFixed(1) + 'MB' : ''}
                            </span>
                        ` : '<span style="color:#10b981; font-weight:600; font-size:12px;">لم تُستخدم بعد (0)</span>'}</td>
                        <td style="text-align:center;"><button class="sam-btn sam-btn--sm" onclick="App.showRouterOSImportCardDetails(${Number(c.id)})">عرض</button></td>
                    </tr>`;
                    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px">لا توجد بطاقات بهذه التصفية</td></tr>')}</tbody>
                </table></div>
                
                <div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 0;">
                    <button class="sam-btn sam-btn--sm" ${s.page <= 1 ? 'disabled' : ''} onclick="App.umImportState.page--;App.loadRouterOSImportCards()">« السابق</button>
                    <span style="font-size:13px;font-weight:bold;">صفحة ${s.page} من ${s.totalPages || 1}</span>
                    <button class="sam-btn sam-btn--sm" ${s.page >= (s.totalPages || 1) ? 'disabled' : ''} onclick="App.umImportState.page++;App.loadRouterOSImportCards()">التالي »</button>
                </div>
            </section>` : `
            <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid var(--border-color, #e2e8f0);padding-bottom:8px;">
                <button class="sam-btn ${s.activeTab === 'router' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.setUmImportTab('router')">🛰️ سحب مباشر من الراوتر (RouterOS API)</button>
                <button class="sam-btn ${s.activeTab === 'file' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.setUmImportTab('file')">📁 رفع ملف قاعدة بيانات (.sqldb / .sqlite / .db)</button>
                <button class="sam-btn ${s.activeTab === 'text' ? 'sam-btn--primary' : 'sam-btn--secondary'}" onclick="App.setUmImportTab('text')">📋 استيراد سريع كروت نصية / CSV</button>
            </div>

            ${s.activeTab === 'router' ? `
                <section class="sam-card" style="padding:18px;border:1px solid var(--border-color, #e2e8f0);border-radius:8px;">
                    <h3>سحب الكروت مباشرة من راوتر MikroTik</h3>
                    <p style="font-size:13px;color:var(--text-muted, #64748b);margin-bottom:16px;">
                        يتصل النظام بالراوتر المختار عبر RouterOS API ويقرأ الكروت والباقات تلقائياً (يدعم RouterOS v6 User Manager و RouterOS v7 User Manager وكروت Hotspot) ثم يعرضها في شاشة المعاينة لمراجعتها قبل الاعتماد.
                    </p>
                    ${routerOptions ? `
                        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
                            <label style="flex:1;min-width:240px;font-weight:bold;">راوتر User Manager من الشبكة النشطة:
                                <select id="um-import-router" class="sam-select" required onchange="App.umImportState.routerId=Number(this.value);App.renderRouterOSImportPage()">
                                    ${routerOptions}
                                </select>
                            </label>
                        </div>
                        ${selectedRouter && Number(selectedRouter.api_enabled) !== 1 ? `
                            <div class="sam-alert sam-alert--warning" style="margin-top:14px;">
                                الراوتر «${this.escape(selectedRouter.shortname || selectedRouter.nasname)}» معطّل التحكم به عبر API. فعّل الإدارة والتحكم الشامل من إعدادات الراوتر ثم أعد المحاولة.
                            </div>
                            <button class="sam-btn sam-btn--secondary" type="button" style="margin-top:8px;" onclick="App.openUserManagerImportRouterEdit(${Number(selectedRouter.id)})">فتح تعديل هذا الراوتر</button>
                        ` : ''}
                        ${selectedRouter && Number(selectedRouter.api_enabled) === 1 && (!selectedRouter.api_credentials_configured || !selectedRouter.api_port_configured) ? `
                            <div class="sam-alert sam-alert--info" style="margin-top:14px;">
                                بيانات API غير مكتملة في إعدادات الراوتر؛ أدخل البيانات المؤقتة للاتصال:
                            </div>
                            <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">
                                <label>اسم مستخدم API<input id="um-router-api-user" class="sam-input" autocomplete="username" value="${this.escape(selectedRouter.api_user_hint || 'admin')}" /></label>
                                <label>كلمة مرور API<input id="um-router-api-password" class="sam-input" type="password" autocomplete="current-password" placeholder="كلمة المرور" /></label>
                                <label>منفذ API<input id="um-router-api-port" class="sam-input" type="number" min="1" max="65535" value="${Number(selectedRouter.api_port || 8728)}" /></label>
                            </div>
                        ` : ''}
                        ${selectedRouter && Number(selectedRouter.api_enabled) === 1 ? `
                            <div style="margin-top:18px;">
                                <button class="sam-btn sam-btn--primary" type="button" style="font-weight:bold;padding:10px 24px;" onclick="App.prepareRouterOSImportTransfer()">
                                    ⚡ اتصال بالراوتر وقراءة الكروت فوراً
                                </button>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="sam-alert sam-alert--warning">لا يوجد راوتر مضاف في هذه الشبكة بعد. يمكنك إضافة راوتر من شاشة الأجهزة والراوترات، أو استخدام تبويب رفع الملف أدناه.</div>
                    `}
                </section>
            ` : ''}

            ${s.activeTab === 'file' ? `
                <section class="sam-card" style="padding:18px;border:1px solid var(--border-color, #e2e8f0);border-radius:8px;">
                    <h3>رفع ملف قاعدة بيانات User Manager (.sqldb / .sqlite / .db)</h3>
                    <p style="font-size:13px;color:var(--text-muted, #64748b);margin-bottom:16px;">
                        اختر ملف النسخة الاحتياطية لقاعدة User Manager من جهازك. سيقوم النظام بفحص الملف واستخراج الباقات والكروت وإنشاء معاينة فورية لك لمطابقتها واعتمادها.
                    </p>
                    <form onsubmit="return App.uploadRouterOSUserManagerFile(event)" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
                        <label style="flex:1;min-width:280px;font-weight:bold;">ملف قاعدة User Manager أو SQLite:
                            <input type="file" id="um-import-file" class="sam-input" accept=".sqldb,.sqlite,.db,application/vnd.sqlite3,.txt,.csv" required style="padding:8px;" />
                        </label>
                        <button class="sam-btn sam-btn--primary" type="submit" style="font-weight:bold;padding:10px 22px;">
                            🔍 فحص الملف وإنشاء المعاينة
                        </button>
                    </form>
                </section>
            ` : ''}

            ${s.activeTab === 'text' ? `
                <section class="sam-card" style="padding:18px;border:1px solid var(--border-color, #e2e8f0);border-radius:8px;">
                    <h3>استيراد سريع كروت نصية / CSV / Excel</h3>
                    <p style="font-size:13px;color:var(--text-muted, #64748b);margin-bottom:14px;">
                        ألصق قائمة الكروت هنا مباشرة. يدعم الصيغ: <code>اسم_المستخدم, كلمة_المرور, الباقة, السعر</code> أو <code>اسم_المستخدم كلمة_المرور</code> (كل كرت في سطر مستقل).
                    </p>
                    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
                        <label style="flex:1;min-width:200px;font-weight:bold;">الباقة الافتراضية للبطاقات:
                            <select id="um-text-default-profile" class="sam-select">
                                ${s.profiles.map(lp => `<option value="${this.escape(lp.name)}">${this.escape(lp.name)} (السعر: ${Number(lp.price || 0)})</option>`).join('')}
                            </select>
                        </label>
                    </div>
                    <textarea id="um-text-import-data" class="sam-input" rows="8" placeholder="user01, 123456, 1Hour, 100&#10;user02, 654321, 1Hour, 100&#10;user03, 987654" style="width:100%;font-family:monospace;margin-bottom:14px;direction:ltr;text-align:left;"></textarea>
                    <button class="sam-btn sam-btn--primary" type="button" onclick="App.importRawTextCards()" style="font-weight:bold;padding:10px 24px;">
                        📥 استيراد الكروت الآن إلى مخزن الشبكة
                    </button>
                </section>
            ` : ''}
        `;

        const PB = window.SamUI?.PageBuilder;
        document.getElementById('main-view').innerHTML = PB?.renderShell ? PB.renderShell({
            id: 'usermanager-sqlite-import',
            archetype: 'table',
            title: 'استيراد كروت User Manager إلى المخزن',
            subtitle: 'استيراد وسحب كروت مرحلي مقيد بالشبكة النشطة',
            eyebrow: 'NETWORK-SCOPED IMPORT',
            icon: '📥',
            actions: [{ label: '↩ العودة للكروت', variant: 'secondary', onclick: 'App.renderUsers()' }],
            stats: s.summary ? [
                { label: 'الباقات المستخرجة', value: s.summary.counts.profiles, icon: '📦', tone: 'blue' },
                { label: 'إجمالي الكروت', value: s.summary.counts.cards.toLocaleString(), icon: '🎫', tone: 'purple' },
                { label: 'المحدد للاعتماد', value: s.selected.size.toLocaleString(), icon: '✅', tone: 'green' }
            ] : [],
            content
        }) : `<h2>استيراد User Manager</h2>${content}`;

        if (s.summary && (s.customerId === null || s.customerId === undefined) && s.summary.customers.length) {
            s.customerId = Number(s.summary.customers[0]);
            this.loadRouterOSImportCards();
        }
    },
    async uploadRouterOSUserManagerFile(event) {
        event.preventDefault();
        const input = document.getElementById('um-import-file');
        const routerId = Number(document.getElementById('um-import-router')?.value || 0);
        if (!input?.files?.[0]) return false;

        const file = input.files[0];
        const form = new FormData();
        form.append('sqldb', file);
        form.append('router_id', String(routerId));
        this.showImportLoadingModal('فحص ملف قاعدة البيانات', `جاري رفع وفحص الملف (${file.name}) واستخراج الكروت والباقات...`, 1);

        try {
            const result = await this.api('preview_usermanager_sqlite', {}, 'POST', form);
            this.closeModal();
            if (!result?.success) {
                this.toast(result?.message || result?.error || 'تعذر فحص قاعدة المصدر', 'danger');
                return false;
            }

            const s = this.umImportState;
            s.token = result.token;
            s.summary = result.summary;
            s.routerId = routerId;
            s.networkId = result.network_id;
            s.customerId = Array.isArray(result.summary.customers) && result.summary.customers.length ? Number(result.summary.customers[0]) : 1;
            s.cards = [];
            s.cardsTotal = 0;
            s.cardsLoading = false;
            s.page = 1;
            s.selected.clear();
            s.selectAllFile = false;
            s.includedProfiles = new Set((result.summary.profiles || []).map(p => Number(p.id)));
            
            // Auto-map profiles with identical or close names
            if (Array.isArray(s.summary.profiles)) {
                for (const sp of s.summary.profiles) {
                    const match = s.profiles.find(lp => lp.name.trim().toLowerCase() === sp.name.trim().toLowerCase());
                    if (match) s.profileMap[sp.id] = match.name;
                    else if (s.profiles.length > 0) s.profileMap[sp.id] = s.profiles[0].name;
                }
            }

            this.toast(`تم فحص الملف بنجاح واستخراج ${Number(result.summary.counts?.cards || 0).toLocaleString()} كرت!`, 'success');
            this.renderRouterOSImportPage();
            await this.loadRouterOSImportCards();
            return false;
        } catch (err) {
            this.closeModal();
            this.toast(err?.message || 'فشلت معالجة الملف', 'danger');
            return false;
        }
    },
    async waitRouterImportJob(jobId, label = 'الاستيراد') {
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
            const state = await this.api('get_router_import_job_status', { job_id: jobId });
            if (!state?.success) throw new Error(state?.error || `تعذر متابعة مهمة ${label}`);
            const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));
            const detail = document.getElementById('um-import-progress-detail');
            if (detail) detail.textContent = `${label} — ${progress}%`;
            if (state.status === 'completed') return state.result || { success: false, error: `انتهت مهمة ${label} دون نتيجة` };
            if (state.status === 'failed') throw new Error(state.error || `فشلت مهمة ${label}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error(`انتهت مهلة ${label}. يمكنك تحديث الصفحة والتحقق من سجل المهام.`);
    },
    async prepareRouterOSImportTransfer() {
        const s = this.umImportState;
        const routerId = Number(document.getElementById('um-import-router')?.value || 0);
        if (!routerId) return this.toast('اختر راوتر من الشبكة النشطة أولاً', 'warning');

        const payload = {
            router_id: routerId,
            require_usermanager: this.networkSetupUserManagerOnly===true,
            api_user: document.getElementById('um-router-api-user')?.value || '',
            api_password: document.getElementById('um-router-api-password')?.value || '',
            api_port: document.getElementById('um-router-api-port')?.value || ''
        };

        this.showImportLoadingModal('سحب الكروت من الراوتر', 'جاري الاتصال براوتر MikroTik عبر API وقراءة الكروت فوراً...', 1);

        try {
            let started = await this.api('prepare_usermanager_router_transfer', {}, 'POST', payload);
            if (started?.queued && started.job_id) started = await this.waitRouterImportJob(started.job_id, 'سحب الكروت من الراوتر');
            this.closeModal();
            
            if (!started?.success) {
                if (started?.code === 'ROUTER_API_DISABLED') {
                    this.toast('الراوتر معطّل التحكم به عبر API. افتح نافذة تعديل الراوتر وفعّل API ثم احفظ.', 'warning');
                    await this.openUserManagerImportRouterEdit(routerId);
                    return;
                }
                return this.toast(started?.message || started?.error || 'تعذر الاتصال بالراوتر أو قراءة الكروت', 'danger');
            }

            s.token = started.token;
            s.summary = started.summary;
            s.routerId = routerId;
            s.networkId = started.network_id;
            s.customerId = Array.isArray(started.summary.customers) && started.summary.customers.length ? Number(started.summary.customers[0]) : 1;
            s.cards = [];
            s.cardsTotal = 0;
            s.cardsLoading = false;
            s.page = 1;
            s.selected.clear();
            s.selectAllFile = false;
            s.includedProfiles = new Set((started.summary.profiles || []).map(p => Number(p.id)));

            // Auto-map profiles
            if (Array.isArray(s.summary.profiles)) {
                for (const sp of s.summary.profiles) {
                    const match = s.profiles.find(lp => lp.name.trim().toLowerCase() === sp.name.trim().toLowerCase());
                    if (match) s.profileMap[sp.id] = match.name;
                    else if (s.profiles.length > 0) s.profileMap[sp.id] = s.profiles[0].name;
                }
            }

            this.toast(started.message || 'تم استيراد بيانات الكروت من الراوتر بنجاح!', 'success');
            this.renderRouterOSImportPage();
            await this.loadRouterOSImportCards();
        } catch (err) {
            this.closeModal();
            this.toast(err?.message || 'تعذر الاتصال بالراوتر', 'danger');
        }
    },
    async importRawTextCards() {
        const text = document.getElementById('um-text-import-data')?.value?.trim() || '';
        const defaultProfile = document.getElementById('um-text-default-profile')?.value || '';
        if (!text) return this.toast('ألصق بيانات الكروت في المربع أولاً', 'warning');

        const lines = text.split('\n');
        const cards = [];
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;
            
            let parts = line.split(/[,\t;|]+/);
            if (parts.length === 1 && line.includes(' ')) parts = line.split(/\s+/);
            parts = parts.map(p => p.trim());

            const username = parts[0];
            if (!username || username.toLowerCase() === 'username' || username.toLowerCase() === 'user') continue;
            const password = (parts[1] || '').trim();
            const profile = parts[2] || defaultProfile;
            const price = parseFloat(parts[3]) || 0;

            cards.push({ username, password, profile, price });
        }

        if (!cards.length) return this.toast('لم يتم العثور على أي كروت صالحة في النص المدخل', 'warning');

        this.toast(`جاري استيراد ${cards.length} كرت إلى مخزن الشبكة...`, 'info');
        const res = await this.api('import_vouchers', {}, 'POST', {
            cards,
            profile: defaultProfile
        });

        if (res?.success) {
            this.toast(`تم استيراد ${res.count || cards.length} كرت بنجاح! ${res.duplicates ? `(تم تخطي ${res.duplicates} مكرر)` : ''}`, 'success');
            document.getElementById('um-text-import-data').value = '';
            this.renderUsers(true);
        } else {
            this.toast(res?.message || res?.error || 'تعذر استيراد الكروت النصية', 'danger');
        }
    },
    toggleImportProfileInclusion(profileId, isIncluded) {
        const s = this.umImportState; if (!s) return;
        const id = Number(profileId);
        if (!s.includedProfiles) s.includedProfiles = new Set(s.summary?.profiles?.map(p => Number(p.id)) || []);
        if (isIncluded) {
            s.includedProfiles.add(id);
        } else {
            s.includedProfiles.delete(id);
            s.selectAllFile = false;
            if (s.cards) {
                s.cards.forEach(c => {
                    if (Number(c.source_profile_id || c.profile_id) === id) {
                        s.selected.delete(Number(c.id));
                    }
                });
            }
        }
        this.renderRouterOSImportPage();
    },
    toggleAllImportProfilesInclusion(isIncluded) {
        const s = this.umImportState; if (!s || !s.summary?.profiles) return;
        if (!s.includedProfiles) s.includedProfiles = new Set();
        if (isIncluded) {
            s.summary.profiles.forEach(p => s.includedProfiles.add(Number(p.id)));
        } else {
            s.includedProfiles.clear();
            s.selected.clear();
            s.selectAllFile = false;
        }
        this.renderRouterOSImportPage();
    },
    async autoCreateAllMissingImportProfiles() {
        const s = this.umImportState;
        if (!s?.summary?.profiles?.length) return;
        
        const unmapped = s.summary.profiles.filter(p => !s.profileMap[p.id]);
        if (unmapped.length === 0) {
            return this.toast('كافة الباقات المصدرية مربوطة بالفعل بباقات محلية!', 'info');
        }

        this.showImportLoadingModal('تجهيز الباقات', `جاري إنشاء وربط ${unmapped.length} باقة في الشبكة النشطة تلقائياً...`, 2);

        let createdCount = 0;
        try {
            for (const p of unmapped) {
                const existing = s.profiles.find(lp => lp.name.trim().toLowerCase() === String(p.name).trim().toLowerCase());
                if (existing) {
                    s.profileMap[p.id] = existing.name;
                    createdCount++;
                    continue;
                }
                const payload = {
                    name: p.name || `Profile_${p.id}`,
                    name_for_users: p.name || `Profile_${p.id}`,
                    price: Number(p.price || 0),
                    cost_price: 0,
                    validity: p.validity || '30d',
                    rate_limit: '2M/2M',
                    transfer_limit: 0,
                    uptime_limit: 0,
                    package_type: 'cards'
                };
                const res = await this.api('save_profile', {}, 'POST', payload);
                if (res?.success) {
                    s.profileMap[p.id] = payload.name;
                    createdCount++;
                }
            }
            const profileRes = await this.api('get_profiles');
            s.profiles = Array.isArray(profileRes) ? profileRes : (profileRes?.data || []);
            this.closeModal();
            this.toast(`تم ربط وتجهيز ${createdCount} باقة بنجاح!`, 'success');
            this.renderRouterOSImportPage();
        } catch (err) {
            this.closeModal();
            this.toast(err?.message || 'تعذر تجهيز بعض الباقات', 'danger');
            this.renderRouterOSImportPage();
        }
    },
    async addNewProfileFromImport(sourceProfileId) {
        const s = this.umImportState;
        const p = s?.summary?.profiles?.find(x => Number(x.id) === Number(sourceProfileId));
        if (!p) return;
        this.returnToUmImportSourceProfileId = Number(sourceProfileId);
        const prefill = {
            name: p.name || '',
            name_for_users: p.name || '',
            price: Number(p.price || 0),
            cost_price: 0,
            validity: p.validity || '30d',
            rate_limit: p.rate_limit || '2M/2M',
            transfer_limit: Number(p.transfer_limit || 0),
            uptime_limit: Number(p.uptime_limit || 0),
            package_type: 'cards'
        };
        await this.showProfileModal(prefill);
    },
    selectAllRouterOSImportCards(mode = 'all') {
        const s = this.umImportState; if (!s) return;
        if (mode === 'all_file') {
            s.selectAllFile = true;
            s.selected.clear();
        } else if (mode === 'none' || mode === false) {
            s.selectAllFile = false;
            s.selected.clear();
        } else {
            s.selectAllFile = false;
            if (s.cards) {
                s.cards.forEach(c => {
                    const pId = Number(c.source_profile_id || c.profile_id || 0);
                    if (s.includedProfiles && s.includedProfiles.size > 0 && pId > 0 && !s.includedProfiles.has(pId)) return;
                    const isUsed = Number(c.is_used) > 0;
                    if (mode === 'all') s.selected.add(Number(c.id));
                    else if (mode === 'fresh' && !isUsed) s.selected.add(Number(c.id));
                    else if (mode === 'used' && isUsed) s.selected.add(Number(c.id));
                });
            }
        }
        this.renderRouterOSImportPage();
    },
    toggleAllPageRouterOSCards(checked) {
        const s = this.umImportState; if (!s || !s.cards) return;
        if (!checked) {
            s.selectAllFile = false;
            s.cards.forEach(c => s.selected.delete(Number(c.id)));
        } else {
            s.cards.forEach(c => {
                const pId = Number(c.source_profile_id || c.profile_id || 0);
                if (s.includedProfiles && s.includedProfiles.size > 0 && pId > 0 && !s.includedProfiles.has(pId)) return;
                s.selected.add(Number(c.id));
            });
        }
        this.renderRouterOSImportPage();
    },
    toggleRouterOSImportCard(id, checked) {
        const s = this.umImportState; if (!s) return;
        id = Number(id);
        if (s.selectAllFile) {
            s.selectAllFile = false;
            if (s.cards) s.cards.forEach(c => s.selected.add(Number(c.id)));
        }
        if (checked) s.selected.add(id);
        else s.selected.delete(id);
        this.renderRouterOSImportPage();
    },
    async commitAllRouterOSImport(mode = 'all') {
        const s = this.umImportState;
        if (!s?.token) return;

        // Auto fallback for unmapped profiles
        for (const p of (s.summary?.profiles || [])) {
            if (s.includedProfiles && !s.includedProfiles.has(Number(p.id))) continue;
            if ((p.card_count || 0) > 0 && !s.profileMap[p.id]) {
                const match = s.profiles.find(lp => lp.name.trim().toLowerCase() === String(p.name).trim().toLowerCase()) || s.profiles[0];
                if (match) {
                    s.profileMap[p.id] = match.name;
                } else {
                    return this.toast(`اربط الباقة المصدرية [${p.name}] بباقة في شبكتك النشطة أو اضغط «⚡ إنشاء وربط الباقات الناقصة تلقائياً» أولاً`, 'warning');
                }
            }
        }

        const includedList = (s.summary?.profiles || []).filter(p => !s.includedProfiles || s.includedProfiles.has(Number(p.id)));
        let relevantCards = 0;
        if (mode === 'fresh') {
            relevantCards = includedList.reduce((sum, p) => sum + Number(p.fresh_count !== undefined ? p.fresh_count : (p.card_count || 0)), 0);
        } else if (mode === 'used') {
            relevantCards = includedList.reduce((sum, p) => sum + Number(p.used_count || 0), 0);
        } else {
            relevantCards = includedList.reduce((sum, p) => sum + Number(p.card_count || 0), 0);
        }

        if (relevantCards <= 0) {
            const modeText = (mode === 'fresh') ? 'جديدة وغير مستخدمة' : (mode === 'used' ? 'مستهلكة' : '');
            return this.toast(`لا توجد أي بطاقات مطابقة (${modeText}) في الباقات المحددة للاستيراد`, 'warning');
        }

        const targetStatus = document.getElementById('um-import-target-status')?.value || s.targetStatus || 'active';
        const statusLabel = (targetStatus === 'active') ? 'نشطة وجاهزة للاستخدام' : 'محجورة مؤقتاً';
        const modeLabel = (mode === 'fresh') ? 'الجديدة فقط' : (mode === 'used' ? 'المستهلكة/قيد الاستخدام فقط' : 'كافة الكروت (جديدة + مستهلكة)');

        if (!confirm(`تأكيد استيراد ${relevantCards.toLocaleString()} كرت (${modeLabel}) للباقات المحددة في الشبكة رقم #${s.networkId} بحالة [${statusLabel}]؟\n\nستتم المعالجة والاستيراد في الخلفية بسرعة وخفة دون أي تعليق للنظام.`)) {
            return;
        }

        this.showImportProgressModal(relevantCards, statusLabel);
        const includedProfileIds = Array.from(s.includedProfiles || s.summary.profiles.map(p => Number(p.id)));
        
        try {
            let r = await this.api('commit_usermanager_sqlite_import', {}, 'POST', {
                token: s.token,
                customer_id: s.customerId,
                profile_map: s.profileMap,
                target_status: targetStatus,
                import_all: true,
                included_profiles: includedProfileIds,
                mode: mode
            });
            if (r?.queued && r.job_id) r = await this.waitRouterImportJob(r.job_id, 'اعتماد الكروت');

            if (r?.success) {
                this.showModal('🎉 تم اكتمال اعتماد واستيراد الكروت بنجاح', `
                    <div style="text-align:center; padding:18px 12px; line-height:1.8;">
                        <div style="font-size:44px; margin-bottom:8px;">✅</div>
                        <h3 style="margin:0 0 6px 0; color:#15803d; font-size:18px; font-weight:800;">تم استيراد ${Number(r.imported || 0).toLocaleString()} كرت بنجاح!</h3>
                        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">تم إيداع الكروت في مخزن الشبكة بأمان وفصل الكروت الجديدة عن المستهلكة</p>
                        
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin:0 auto 18px; text-align:right; max-width:440px; font-size:13.5px;">
                            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0;">
                                <span>✨ <b>كروت جديدة غير مستخدمة (جاهزة للبيع):</b></span>
                                <span class="sam-badge sam-badge--success" style="font-size:13px; font-weight:bold;">${Number(r.fresh_imported || 0).toLocaleString()} كرت</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0;">
                                <span>⏱️ <b>كروت مستخدمة مستوردة (راجع الصلاحية والحالة):</b></span>
                                <span class="sam-badge sam-badge--warning" style="font-size:13px; font-weight:bold;">${Number(r.used_imported || 0).toLocaleString()} كرت</span>
                            </div>
                            ${r.duplicates ? `
                            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0;">
                                <span>⚠️ <b>كروت مكررة تم تخطيها:</b></span>
                                <span style="color:#64748b; font-weight:bold;">${Number(r.duplicates).toLocaleString()} كرت</span>
                            </div>` : ''}
                            <div style="display:flex; justify-content:space-between; padding:6px 0;">
                                <span>📦 <b>رقم دفعة الاستيراد:</b></span>
                                <code style="font-size:12px;">${this.escape(r.batch_id || '—')}</code>
                            </div>
                        </div>
                        
                        <div style="display:flex; justify-content:center; gap:10px;">
                            <button type="button" class="mt-btn mt-btn-primary" style="font-weight:800; padding:10px 22px;" onclick="App.closeModal(); App.umImportState = null; App.renderUsers(true);">
                                🚀 الانتقال إلى كروت المشتركين
                            </button>
                            <button type="button" class="mt-btn" style="background:#64748b; color:#fff;" onclick="App.closeModal(); App.umImportState = null; App.renderUsers(true);">
                                إغلاق
                            </button>
                        </div>
                    </div>
                `, '520px');
            } else {
                this.closeModal();
                this.toast(r?.message || r?.error || 'تعذر استيراد البطاقات', 'danger');
            }
        } catch (err) {
            this.closeModal();
            this.toast(err?.message || 'فشلت عملية الاستيراد', 'danger');
        }
    },
    async commitSelectedRouterOSImport() {
        const s = this.umImportState;
        if (s?.selectAllFile) {
            return this.commitAllRouterOSImport(s.cardKindFilter || 'all');
        }
        if (!s?.token || !s.selected || !s.selected.size) {
            return this.toast('حدد بطاقات من الجدول بالـ Checkbox أولاً أو اضغط زر استيراد كافة كروت الباقات المحددة', 'warning');
        }
        for (const p of (s.summary?.profiles || [])) {
            if (s.includedProfiles && !s.includedProfiles.has(Number(p.id))) continue;
            if ((p.card_count || 0) > 0 && !s.profileMap[p.id]) {
                const match = s.profiles.find(lp => lp.name.trim().toLowerCase() === String(p.name).trim().toLowerCase()) || s.profiles[0];
                if (match) s.profileMap[p.id] = match.name;
                else return this.toast(`اربط الباقة المصدرية [${p.name}] بباقة في شبكتك النشطة أولاً`, 'warning');
            }
        }
        const targetStatus = document.getElementById('um-import-target-status')?.value || s.targetStatus || 'active';
        const statusLabel = (targetStatus === 'active') ? 'نشطة وجاهزة للاستخدام' : 'محجورة مؤقتاً';

        if (!confirm(`تأكيد استيراد ${s.selected.size} بطاقة محددة في الشبكة رقم #${s.networkId} بحالة [${statusLabel}]؟`)) return;

        this.showImportProgressModal(s.selected.size, statusLabel);
        
        try {
            let r = await this.api('commit_usermanager_sqlite_import', {}, 'POST', {
                token: s.token,
                customer_id: s.customerId,
                profile_map: s.profileMap,
                source_user_ids: Array.from(s.selected),
                target_status: targetStatus,
                import_all: false
            });
            if (r?.queued && r.job_id) r = await this.waitRouterImportJob(r.job_id, 'اعتماد الكروت');

            if (r?.success) {
                this.showModal('🎉 تم اعتماد واستيراد الكروت المحددة', `
                    <div style="text-align:center; padding:18px 12px; line-height:1.8;">
                        <div style="font-size:44px; margin-bottom:8px;">✅</div>
                        <h3 style="margin:0 0 6px 0; color:#15803d; font-size:18px; font-weight:800;">تم استيراد ${Number(r.imported || 0).toLocaleString()} بطاقة بنجاح!</h3>
                        <div style="display:flex; justify-content:center; gap:10px; margin-top:16px;">
                            <button type="button" class="mt-btn mt-btn-primary" style="font-weight:800; padding:10px 22px;" onclick="App.closeModal(); App.umImportState = null; App.renderUsers(true);">
                                🚀 الانتقال إلى كروت المشتركين
                            </button>
                            <button type="button" class="mt-btn" style="background:#64748b; color:#fff;" onclick="App.closeModal(); App.umImportState = null; App.renderUsers(true);">
                                إغلاق
                            </button>
                        </div>
                    </div>
                `, '480px');
            } else {
                this.closeModal();
                this.toast(r?.message || r?.error || 'تعذر اعتماد البطاقات', 'danger');
            }
        } catch (err) {
            this.closeModal();
            this.toast(err?.message || 'فشلت عملية الاستيراد', 'danger');
        }
    },
    commitRouterOSImport() {
        return this.commitAllRouterOSImport('all');
    },
    async loadRouterOSImportCards() {
        const s = this.umImportState;
        if (!s?.token) return;
        s.cardsLoading = true;
        this.renderRouterOSImportPage();

        let cardKindParam = s.cardKindFilter || '';
        if (!cardKindParam && s.usageFilter === 'none') cardKindParam = 'fresh';
        else if (!cardKindParam && s.usageFilter === 'has') cardKindParam = 'used';

        const r = await this.api('get_usermanager_import_cards', {}, 'POST', {
            token: s.token,
            customer_id: s.customerId || 0,
            profile_id: s.profileId || 0,
            page: s.page || 1,
            limit: 100,
            search: s.searchFilter || '',
            card_kind: cardKindParam,
            sort_col: s.sortCol || 'id',
            sort_dir: s.sortDir || 'asc'
        });
        s.cardsLoading = false;
        if (!r?.success) {
            this.renderRouterOSImportPage();
            this.toast(r?.error || 'انتهت المعاينة أو تعذر تحميل الكروت', 'danger');
            return;
        }
        s.cards = r.cards || [];
        s.cardsTotal = r.total || 0;
        s.totalPages = r.total_pages || 1;
        this.renderRouterOSImportPage();
    },
    sortRouterOSImportCards(col) {
        const s = this.umImportState; if (!s) return;
        if (s.sortCol === col) {
            s.sortDir = (s.sortDir === 'asc') ? 'desc' : 'asc';
        } else {
            s.sortCol = col;
            s.sortDir = 'asc';
        }
        s.page = 1;
        this.loadRouterOSImportCards();
    },
    onFilterRouterOSImport(key, val) {
        const s = this.umImportState; if (!s) return;
        if (key === 'profileId') s.profileId = Number(val) || 0;
        else s[key] = val;
        s.page = 1;
        this.loadRouterOSImportCards();
    },
    debounceFilterRouterOSCards(key, val) {
        const s = this.umImportState; if (!s) return;
        s.searchFilter = val;
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => {
            s.page = 1;
            this.loadRouterOSImportCards();
        }, 350);
    },
    resetRouterOSImportFilters() {
        const s = this.umImportState; if (!s) return;
        s.searchFilter = '';
        s.profileId = 0;
        s.cardKindFilter = '';
        s.usageFilter = '';
        s.sortCol = 'id';
        s.sortDir = 'asc';
        s.page = 1;
        this.loadRouterOSImportCards();
    },
    showImportLoadingModal(title, message, currentStep = 1) {
        const steps = [
            { num: 1, text: 'الاتصال والتحقق من المنفذ وواجهة API' },
            { num: 2, text: 'استخراج وفحص باقات ومستخدمي User Manager' },
            { num: 3, text: 'توليد جدول المعاينة الآمنة ومطابقة الأسعار' }
        ];
        this.showModal(`⚡ ${title}`, `
            <div style="text-align:center; padding:24px 16px;">
                <div style="width:54px; height:54px; border:4px solid #e2e8f0; border-top-color:#0284c7; border-radius:50%; animation:samSpin 0.9s linear infinite; margin:0 auto 16px;"></div>
                <h3 style="margin:0 0 6px 0; color:#0f172a; font-size:16.5px; font-weight:800;">${this.escape(message)}</h3>
                <p style="font-size:13px; color:#64748b; margin:0 0 18px 0;">يرجى الانتظار، تتم العملية في الخلفية دون التأثير على أداء السيرفر أو الشبكة...</p>
                
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; text-align:right; max-width:440px; margin:0 auto;">
                    ${steps.map(s => `
                        <div style="display:flex; align-items:center; gap:10px; padding:6px 0; font-size:12.5px; color:${s.num === currentStep ? '#0284c7; font-weight:800;' : (s.num < currentStep ? '#10b981;' : '#94a3b8;')}">
                            <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:${s.num === currentStep ? '#e0f2fe; color:#0284c7;' : (s.num < currentStep ? '#dcfce7; color:#15803d;' : '#f1f5f9; color:#94a3b8;')} font-size:11px; font-weight:bold;">
                                ${s.num < currentStep ? '✓' : (s.num === currentStep ? '⏳' : s.num)}
                            </span>
                            <span>${s.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <style>
                @keyframes samSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `, '520px');
    },
    showImportProgressModal(totalCards, statusLabel) {
        this.showModal(`⚡ جاري استيراد الكروت في الخلفية`, `
            <div id="um-import-progress-box" style="text-align:center; padding:22px 14px;">
                <div style="font-size:38px; margin-bottom:10px;">📦</div>
                <h3 id="um-import-progress-title" style="margin:0 0 6px 0; font-size:16.5px; font-weight:800; color:#0f172a;">
                    جاري استيراد ${totalCards.toLocaleString()} كرت بحالة [${statusLabel}]...
                </h3>
                <p id="um-import-progress-sub" style="font-size:13px; color:#64748b; margin:0 0 16px 0;">
                    تتم العملية في الخلفية بسرعة وأمان وتحديث مخزن الكروت دون أي تعليق للنظام
                </p>
                <div style="background:#e2e8f0; border-radius:10px; height:16px; overflow:hidden; margin:0 auto 14px; max-width:440px;">
                    <div id="um-import-progress-bar" style="background:linear-gradient(90deg, #10b981, #0284c7); height:100%; width:100%; transition:width 0.3s; animation:pulseProgress 1.4s infinite;"></div>
                </div>
                <div id="um-import-progress-detail" style="font-size:12.5px; color:#475569; font-weight:600;">
                    <i class="fas fa-spinner fa-spin"></i> جاري حفظ الكروت في قاعدة البيانات وفحص التكرار واعتماد الأرصدة...
                </div>
            </div>
            <style>
                @keyframes pulseProgress { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }
            </style>
        `, '500px');
    },
    toggleRouterOSImportCard(id, checked) {
        const s = this.umImportState; if (!s) return;
        if (checked) s.selected.add(Number(id));
        else s.selected.delete(Number(id));
        this.renderRouterOSImportPage();
    },
    async editMappedRouterOSImportProfile(sourceProfileId) {
        const s = this.umImportState;
        const name = s?.profileMap?.[sourceProfileId];
        const profile = s?.profiles?.find(p => p.name === name);
        if (!profile) return this.toast('اختر باقة الشبكة أولاً', 'warning');
        this.returnToUmImportProfileName = profile.name;
        await this.showProfileModal(profile);
    },
    async showRouterOSImportCardDetails(sourceUserId) {
        const s = this.umImportState;
        const r = await this.api('get_usermanager_import_card_details', {}, 'POST', {
            token: s.token,
            customer_id: s.customerId || 0,
            source_user_id: sourceUserId
        });
        if (!r?.success) return this.toast(r?.error || 'تعذر تحميل تفاصيل البطاقة', 'danger');
        const c = r.card;
        document.getElementById('modal-container').innerHTML = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this)App.closeModal()">
                <div class="mt-modal" style="max-width:500px;">
                    <div class="mt-modal-header"><span>تفاصيل البطاقة المصدرية</span><button onclick="App.closeModal()">✕</button></div>
                    <div class="mt-modal-body" style="line-height:1.8;">
                        <p><b>اسم المستخدم:</b> <code>${this.escape(c.userName)}</code></p>
                        <p><b>كلمة المرور حسب نمط الشبكة:</b> <code>${c.password===''?'فارغة':this.escape(c.password)}</code></p>
                        <p><b>الباقة المصدر:</b> ${this.escape(c.actualProfileName || c.groupName || '—')}</p>
                        <p><b>تاريخ التسجيل/البدء:</b> ${this.escape(String(c.regDate || '—'))}</p>
                        <p><b>الاستهلاك المسجل:</b> ${Number(c.uptimeUsed || 0)} ثانية وقت، ${(Number(c.downloadUsed || 0) / 1048576).toFixed(2)} MB تنزيل، ${(Number(c.uploadUsed || 0) / 1048576).toFixed(2)} MB رفع</p>
                        <p><b>عمليات شراء سابقة:</b> ${Number(c.purchase_count || 0)}</p>
                        <div class="sam-alert sam-alert--info" style="margin-top:10px;">سيُعتمد الكرت بالرصيد المتبقي والصلاحية المتبقية دون تجديد.</div>
                    </div>
                    <div class="mt-modal-footer"><button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button></div>
                </div>
            </div>`;
    },
    async discardRouterOSImportPreview() {
        const s = this.umImportState;
        if (s?.token) await this.api('discard_usermanager_sqlite_preview', {}, 'POST', { token: s.token });
        this.umImportState = null;
        this.showRouterOSImportPage();
    },
    async openUserManagerImportRouterEdit(routerId) {
        const allowed = this.can?.('routers_edit') || this.userRole === 'system_owner' || this.userRole === 'superadmin';
        if (!allowed) return this.toast('لا تملك صلاحية تعديل إعدادات الراوتر. اطلب من مدير النظام تفعيل API لهذا الراوتر.', 'warning');
        const cached = Array.isArray(this.routerCache) ? this.routerCache : [];
        let router = cached.find(item => Number(item.id) === Number(routerId));
        if (!router) {
            const result = await this.api('get_routers');
            const routers = Array.isArray(result) ? result : (result?.data || result?.routers || []);
            router = routers.find(item => Number(item.id) === Number(routerId));
        }
        if (!router) return this.toast('تعذر العثور على الراوتر ضمن الشبكة النشطة؛ حدّث قائمة أجهزة الراوتر ثم أعد المحاولة.', 'danger');
        this.showRouterModal(router);
    },
    setUserCardKind(kind) {
        this.usersFilterCardKind = (this.usersFilterCardKind === kind) ? '' : kind;
        this.usersPage = 1;
        this.renderUsers();
    },
    setUsersPage(page) {
        this.usersPage = Math.max(1, parseInt(page, 10) || 1);
        this.renderUsers();
    },
    onUserLiveSearch(val) {
        this.usersSearchQuery = (val || '').trim();
        this.usersPage = 1;
        if (this._userSearchTimer) clearTimeout(this._userSearchTimer);
        this._userSearchTimer = setTimeout(async () => {
            await this.renderUsers();
            const input = document.getElementById('u-search');
            if (input) {
                input.focus();
                const len = input.value.length;
                input.setSelectionRange(len, len);
            }
        }, 350);
    },
    toggleUserSort(col) {
        if (this.usersSortBy === col) {
            this.usersSortDir = this.usersSortDir === 'ASC' ? 'DESC' : 'ASC';
        } else {
            this.usersSortBy = col;
            this.usersSortDir = 'DESC';
        }
        this.usersPage = 1;
        this.renderUsers();
    },
    getSortIcon(col) {
        if (this.usersSortBy !== col) return '<span style="opacity:0.3; font-size:10px;">↕</span>';
        return this.usersSortDir === 'ASC' ? '<span style="font-size:10px;">▲</span>' : '<span style="font-size:10px;">▼</span>';
    },
    async renderUsers(forceReloadFilters = false) {
        const needFilters = (!this._cachedUserFilters || forceReloadFilters);
        const reqKpi = this.api('get_user_kpis', { 
            search: this.usersSearchQuery || '', 
            profile: this.usersFilterProf || '', 
            owner_id: this.usersFilterOwner || '',
            batch_id: this.usersFilterBatch || '',
            card_kind: this.usersFilterCardKind || ''
        });
        const reqUsers = this.api('get_users', {
            page: this.usersPage,
            limit: this.usersLimit,
            search: this.usersSearchQuery,
            profile: this.usersFilterProf,
            status: this.usersFilterStatus,
            owner_id: this.usersFilterOwner,
            batch_id: this.usersFilterBatch,
            card_kind: this.usersFilterCardKind || '',
            sort_by: this.usersSortBy,
            sort_dir: this.usersSortDir
        });

        // Parallel non-blocking execution of all necessary data calls
        let kpiRaw, res;
        if (needFilters) {
            const [kpiRes, usersRes, profilesRaw, adminsRaw, batchesRaw] = await Promise.all([
                reqKpi,
                reqUsers,
                this.api('get_profiles'),
                this.api('get_admins'),
                this.api('get_batches')
            ]);
            kpiRaw = kpiRes;
            res = usersRes;
            this._cachedUserProfiles = Array.isArray(profilesRaw) ? profilesRaw : (profilesRaw?.data || []);
            this._cachedUserAdmins = Array.isArray(adminsRaw) ? adminsRaw : (adminsRaw?.admins || adminsRaw?.data || []);
            this._cachedUserBatches = Array.isArray(batchesRaw) ? batchesRaw : (batchesRaw?.data || []);
            this._cachedUserFilters = true;
        } else {
            const [kpiRes, usersRes] = await Promise.all([reqKpi, reqUsers]);
            kpiRaw = kpiRes;
            res = usersRes;
        }

        const profiles = this._cachedUserProfiles || [];
        const admins = this._cachedUserAdmins || [];
        const batches = this._cachedUserBatches || [];

        const kpis = kpiRaw?.data || (kpiRaw?.total !== undefined ? kpiRaw : { total: 0, online: 0, active: 0, fresh: 0, used: 0, expired: 0, disabled: 0, paid: 0, free: 0 });
        if (!res) return;

        const selCount = this.selectedItems.size;

        const PB = window.SamUI?.PageBuilder;

        // 1. Define Standard Actions
        const actions = [
            ((this.userRole === 'system_owner' || this.isSystemOwner) && (this.can('users_add') || this.can('users_edit'))) ? { label: '➕ إضافة كرت / مشترك', variant: 'primary', onclick: 'App.showUserModal()', title: 'إضافة كرت أو مشترك فردي جديد' } : null,
            this.can('users_batch_gen') ? { label: `⚡ ${this.t('batch_gen')}`, variant: 'warning', onclick: "App.switchTab('batch_gen')" } : null,
            this.can('users_print') ? { label: `🖨️ ${this.t('print_cards')}`, variant: 'secondary', onclick: 'App.printSelectedUsers()' } : null,
            this.can('users_print') ? { label: '🧾 عمليات الطباعة', variant: 'secondary', onclick: 'App.showPrintBatchesPage()' } : null,
            this.can('users_import') ? { label: '📥 استيراد User Manager', variant: 'secondary', onclick: 'App.showRouterOSImportPage()', title: 'معاينة واستيراد ملف قاعدة User Manager إلى مخزن حجر' } : null,
            this.can('users_export') ? { label: '📤 تصدير CSV', variant: 'secondary', onclick: 'App.exportUsersCSV()', title: 'تصدير الكروت إلى ملف CSV' } : null,
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderUsers()' }
        ].filter(Boolean);

        // 2. Define Standard KPIs
        const stats = [
            { label: 'إجمالي الكروت', value: kpis.total.toLocaleString(), icon: '📊', tone: 'blue', active: this.usersFilterStatus === '', onclick: "App.setUserFilterStatus('')" },
            { label: 'صالحة ونشطة', value: kpis.active.toLocaleString(), icon: '🟢', tone: 'green', active: this.usersFilterStatus === 'active', onclick: "App.setUserFilterStatus('active')" },
            { label: 'متصلين الآن', value: kpis.online.toLocaleString(), icon: '👥', tone: 'cyan', active: this.usersFilterStatus === 'online', onclick: "App.setUserFilterStatus('online')" },
            { label: 'جديدة لم تستخدم', value: kpis.fresh.toLocaleString(), icon: '⏳', tone: 'purple', active: this.usersFilterStatus === 'fresh', onclick: "App.setUserFilterStatus('fresh')" },
            { label: 'مستخدمة', value: Number(kpis.used || 0).toLocaleString(), icon: '📶', tone: 'blue', active: this.usersFilterStatus === 'used', onclick: "App.setUserFilterStatus('used')" },
            { label: 'كروت مدفوعة', value: Number(kpis.paid || 0).toLocaleString(), icon: '💳', tone: 'emerald', active: (this.usersFilterCardKind || '') === 'paid', onclick: "App.setUserCardKind('paid')" },
            { label: 'كروت مجانية', value: Number(kpis.free || 0).toLocaleString(), icon: '🎁', tone: 'indigo', active: (this.usersFilterCardKind || '') === 'free', onclick: "App.setUserCardKind('free')" },
            { label: 'منتهية الصلاحية', value: kpis.expired.toLocaleString(), icon: '🔴', tone: 'rose', active: this.usersFilterStatus === 'expired', onclick: "App.setUserFilterStatus('expired')" },
            { label: 'معطلة إدارياً', value: kpis.disabled.toLocaleString(), icon: '🚫', tone: 'amber', active: this.usersFilterStatus === 'disabled', onclick: "App.setUserFilterStatus('disabled')" }
        ];

        // 3. Define Toolbar
        const toolbar = {
            left: [
                `<div id="user-selection-actions" class="sam-toolbar-group" style="background:var(--sam-primary-subtle); border:1px solid var(--sam-primary-border); border-radius:var(--sam-radius-sm); padding:3px 10px; display:${selCount > 0 ? 'inline-flex' : 'none'}; align-items:center; gap:6px;">
                    <span id="selected-count-label" style="font-weight:700; color:var(--sam-primary); font-size:12px;">تم تحديد ${selCount} كرت</span>
                    ${this.can('users_reset') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--success" onclick="App.showBulkResetUsageModal()" title="تصفير الاستهلاك وإعادة الكروت جديدة">🔄 تصفير</button>` : ''}
                    ${this.can('users_change_profile') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.showBulkChangeProfileModal()" title="تغيير الباقة">📦 باقة</button>` : ''}
                    ${this.can('users_renew') ? `<button type="button" class="sam-btn sam-btn--sm" onclick="App.showBulkRenewModal()" title="تجديد وتمديد الصلاحية">⏳ تجديد</button>` : ''}
                    ${this.can('users_disable') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--warning" onclick="App.bulkToggleStatus('disabled')" title="تعطيل الكروت">⛔ تعطيل</button>` : ''}
                    ${this.can('users_enable') ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--success" onclick="App.bulkToggleStatus('active')" title="تفعيل الكروت">✓ تفعيل</button>` : ''}
                    ${this.can('users_export') ? `<button type="button" class="sam-btn sam-btn--sm" onclick="App.exportUsersCSV(true)" title="تصدير الكروت المحددة فقط إلى CSV">📤 تصدير</button>` : ''}
                </div>`
            ],
            right: [
                `<select id="u-filter-prof" class="sam-select" style="min-width:130px;" onchange="App.usersFilterProf=this.value; App.usersPage=1; App.renderUsers()">
                    <option value="">كل الباقات (${profiles.length})</option>
                    ${profiles.map(p => `<option value="${p.name}" ${App.usersFilterProf === p.name ? 'selected' : ''}>${p.name} (${(p.user_count || 0).toLocaleString()} كرت)</option>`).join('')}
                </select>`,
                `<div style="display:inline-flex; align-items:center; gap:4px;">
                    <select id="u-filter-batch" class="sam-select" style="min-width:130px;" onchange="App.usersFilterBatch=this.value; App.usersPage=1; App.renderUsers()">
                        <option value="">كل الدفعات (${batches.length})</option>
                        ${batches.map(b => `<option value="${b.batch_id}" ${App.usersFilterBatch === b.batch_id ? 'selected' : ''}>${b.batch_id} (${b.quantity} كرت)</option>`).join('')}
                    </select>
                    ${App.usersFilterBatch ? `<button type="button" class="sam-btn sam-btn--sm sam-btn--success" title="طباعة هذه الدفعة بالكامل" onclick="App.printBatchById('${App.usersFilterBatch}')">🖨️ طباعة</button>` : ''}
                </div>`,
                `<select id="u-filter-stat" class="sam-select" style="min-width:110px;" onchange="App.usersFilterStatus=this.value; App.usersPage=1; App.renderUsers()">
                    <option value="" ${App.usersFilterStatus === '' ? 'selected' : ''}>كل الحالات</option>
                    <option value="active" ${App.usersFilterStatus === 'active' ? 'selected' : ''}>🟢 نشط وصالح</option>
                    <option value="online" ${App.usersFilterStatus === 'online' ? 'selected' : ''}>👥 متصل الآن</option>
                    <option value="fresh" ${App.usersFilterStatus === 'fresh' ? 'selected' : ''}>⏳ جديد لم يستخدم</option>
                    <option value="used" ${App.usersFilterStatus === 'used' ? 'selected' : ''}>📶 مستخدم</option>
                    <option value="expired" ${App.usersFilterStatus === 'expired' ? 'selected' : ''}>🔴 منتهي</option>
                    <option value="disabled" ${App.usersFilterStatus === 'disabled' ? 'selected' : ''}>🚫 معطل</option>
                </select>`,
                `<select id="u-filter-kind" class="sam-select" style="min-width:110px;" onchange="App.usersFilterCardKind=this.value; App.usersPage=1; App.renderUsers()">
                    <option value="" ${(App.usersFilterCardKind || '') === '' ? 'selected' : ''}>النوع المالي</option>
                    <option value="paid" ${App.usersFilterCardKind === 'paid' ? 'selected' : ''}>💳 مدفوع</option>
                    <option value="free" ${App.usersFilterCardKind === 'free' ? 'selected' : ''}>🎁 مجاني</option>
                </select>`,
                `<select id="u-filter-owner" class="sam-select" style="min-width:120px;" onchange="App.usersFilterOwner=this.value; App.usersPage=1; App.renderUsers()">
                    <option value="">كل الموزعين</option>
                    ${admins.map(a => `<option value="${a.id}" ${App.usersFilterOwner == a.id ? 'selected' : ''}>${a.fullname} (${a.username})</option>`).join('')}
                </select>`,
                `<select class="sam-select" style="width:85px;" onchange="App.usersLimit=parseInt(this.value); App.usersPage=1; App.renderUsers()" title="عدد السجلات">
                    <option value="50" ${this.usersLimit == 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${this.usersLimit == 100 ? 'selected' : ''}>100</option>
                    <option value="250" ${this.usersLimit == 250 ? 'selected' : ''}>250</option>
                    <option value="500" ${this.usersLimit == 500 ? 'selected' : ''}>500</option>
                    <option value="1000" ${this.usersLimit == 1000 ? 'selected' : ''}>1000</option>
                </select>`,
                `<div class="quick-table-search" style="margin:0; min-width:170px;">
                    <span class="quick-table-search-icon">🔍</span>
                    <input type="text" id="u-search" class="quick-table-search-input" placeholder="بحث فوري بالمستخدم أو الماك..." value="${this.usersSearchQuery || ''}" oninput="App.onUserLiveSearch(this.value)" />
                </div>`,
                (this.usersSearchQuery || this.usersFilterProf || this.usersFilterStatus || this.usersFilterBatch || this.usersFilterCardKind || this.usersFilterOwner) ? `
                    <button type="button" class="sam-btn sam-btn--sm sam-btn--secondary" onclick="App.resetUserFilters()" title="إعادة تعيين كافة الفلاتر" style="padding:4px 8px; color:var(--sam-danger, #dc2626); font-size:12px;">
                        ✕ مسح
                    </button>
                ` : ''
            ].filter(Boolean)
        };

        // 4. Define Table Content
        const tableHtml = `
            <div class="sam-table-container mt-table-container">
                <table class="sam-table mt-table" id="users-table">
                    <thead>
                        <tr>
                            <th style="width:34px; text-align:center;"><input type="checkbox" id="users-select-all-cb" onchange="App.toggleSelectAll(this)" /></th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('username')">اسم المستخدم / الكرت ${this.getSortIcon('username')}</th>
                            <th>وسيلة الكرت</th>
                            <th>نوع الكرت</th>
                            <th>رقم الصفحة</th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('profile_name')">الباقة ${this.getSortIcon('profile_name')}</th>
                            <th>سعر البطاقة</th>
                            <th>المالك / الموزع</th>
                            <th>الحالة</th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('total_bytes')">استهلاك البيانات ${this.getSortIcon('total_bytes')}</th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('total_uptime')">الوقت المستهلك ${this.getSortIcon('total_uptime')}</th>
                            <th>الوقت المتبقي</th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('first_login')">أول تسجيل ${this.getSortIcon('first_login')}</th>
                            <th style="cursor:pointer;" onclick="App.toggleUserSort('expires_at')">تاريخ الانتهاء ${this.getSortIcon('expires_at')}</th>
                            <th style="text-align:center;">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${res.data.length === 0 ? `
                            <tr><td colspan="15" style="text-align:center; padding:32px 16px; color:var(--sam-text-muted);">لا توجد كروت مطابقة لمعايير البحث</td></tr>
                        ` : res.data.map(u => `
                            <tr class="${App.selectedItems.has(u.username) ? 'selected' : ''}" id="user-row-${u.username}">
                                <td style="text-align:center;"><input type="checkbox" class="user-checkbox" value="${u.username}" ${App.selectedItems.has(u.username) ? 'checked' : ''} onchange="App.toggleSelectItem('${u.username}', this.checked)" /></td>
                                <td onclick="App.showUserUsageModal('${u.username}')" style="cursor:pointer;">
                                    <b><code style="color:var(--sam-primary); font-size:13px;">${u.username}</code></b>
                                    <span style="font-size:11px; margin-right:4px;">📊</span>
                                </td>
                                <td><span class="sam-badge sam-badge--subtle">${({ paper: 'ورقي', digital: 'فوري من الرصيد', free: 'مجاني', individual: 'فردي' })[u.card_type] || 'فردي'}</span></td>
                                <td><span class="sam-badge ${Number(u.is_free_quota) === 1 ? 'sam-badge--info' : 'sam-badge--success'}">${Number(u.is_free_quota) === 1 ? '🎁 مجاني' : '💳 مدفوع'}</span></td>
                                <td>${u.sheet_no ? `<b>${u.sheet_no}</b>` : '<span style="color:var(--sam-text-subtle);">—</span>'}</td>
                                <td><span class="sam-badge sam-badge--primary" style="font-weight:700;">${u.profile_name || 'Default'}</span></td>
                                <td><b>${App.formatMoney ? App.formatMoney(Number(u.price || 0)) : Number(u.price || 0).toLocaleString()}</b></td>
                                <td>${u.owner_name ? `<b>${u.owner_name}</b>` : '<span style="color:var(--sam-text-muted); font-size:12px;">المخزن الرئيسي</span>'}</td>
                                <td>
                                    ${u.is_online > 0 ? '<span class="sam-badge sam-badge--success" style="animation:pulse 1.5s infinite; margin-left:4px;">🟢 متصل</span>' : ''}
                                    <span class="sam-badge ${u.is_disabled == 1 ? 'sam-badge--danger' : (u.first_login ? 'sam-badge--info' : 'sam-badge--warning')}">
                                        ${u.is_disabled == 1 ? 'معطل' : (u.first_login ? 'مستخدم' : 'جديد')}
                                    </span>
                                </td>
                                <td onclick="App.showUserUsageModal('${u.username}')" style="cursor:pointer;">
                                    <b>${App.formatBytes(u.total_bytes)}</b>
                                    <small style="color:var(--sam-text-muted); display:block; font-size:10px;">(↓${App.formatBytes(u.total_download)} ↑${App.formatBytes(u.total_upload)})</small>
                                </td>
                                <td>${App.formatSeconds(u.total_uptime)}</td>
                                <td>${u.remaining_uptime === null || u.remaining_uptime === undefined ? '<span class="sam-badge sam-badge--subtle">∞ غير محدود</span>' : `<b style="color:${Number(u.remaining_uptime) <= 0 ? 'var(--sam-danger)' : 'var(--sam-primary)'}">${App.formatSeconds(Number(u.remaining_uptime))}</b>`}</td>
                                <td><small style="color:var(--sam-text-muted); font-size:11px;">${u.first_login || 'لم يستخدم بعد'}</small></td>
                                <td><small style="color:var(--sam-text-muted); font-size:11px;">${u.expires_at || 'يبدأ عند أول دخول'}</small></td>
                                <td style="white-space:nowrap; text-align:center;">
                                    <div class="sam-action-menu" style="position:relative; display:inline-block;">
                                        <button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" style="min-height:26px; width:30px; height:26px; padding:0; display:inline-flex; align-items:center; justify-content:center; font-size:16px; font-weight:bold; border-radius:6px; background:var(--sam-bg-surface, #ffffff); border:1px solid var(--sam-border, #cbd5e1); color:var(--sam-text-primary, #1e293b); box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" aria-haspopup="true" onclick="event.stopPropagation(); App.toggleUserActionMenu('${this.escape(u.username || '')}')" title="خيارات الكرت">⋮</button>
                                        <div id="user-actions-${this.escape(u.username || '')}" class="sam-action-menu__items" hidden style="display:none; position:absolute; left:0; top:calc(100% + 4px); z-index:99999; min-width:165px; padding:6px; background:var(--sam-bg-surface, #ffffff); border:1px solid var(--sam-border, #e2e8f0); border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.18); flex-direction:column; gap:4px;">
                                            <button type="button" class="sam-btn sam-btn--xs sam-btn--subtle" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.showUserUsageModal('${this.escape(u.username || '')}'); App.closeUserActionMenus()">📊 تفاصيل الاستهلاك</button>
                                            ${this.can('users_edit') || this.can('users_add') ? `<button type="button" class="sam-btn sam-btn--xs sam-btn--subtle" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.editUser('${this.escape(u.username || '')}'); App.closeUserActionMenus()">✏️ تعديل الكرت</button>` : ''}
                                            ${this.can('users_change_profile') ? `<button type="button" class="sam-btn sam-btn--xs sam-btn--secondary" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.singleChangeProfile('${this.escape(u.username || '')}'); App.closeUserActionMenus()">📦 تغيير الباقة</button>` : ''}
                                            ${this.can('users_reset') ? `<button type="button" class="sam-btn sam-btn--xs sam-btn--success" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.singleResetUsage('${this.escape(u.username || '')}'); App.closeUserActionMenus()">🔄 تصفير العداد</button>` : ''}
                                            ${(u.is_disabled == 1 ? this.can('users_enable') : this.can('users_disable')) ? `<button type="button" class="sam-btn sam-btn--xs ${u.is_disabled == 1 ? 'sam-btn--success' : 'sam-btn--warning'}" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.setUserStatus('${this.escape(u.username || '')}', ${u.is_disabled == 1}); App.closeUserActionMenus()">${u.is_disabled == 1 ? '✓ تفعيل الكرت' : '⛔ تعطيل الكرت'}</button>` : ''}
                                            ${this.can('users_delete') && Number(u.can_delete_card || 0) === 1 ? `<button type="button" class="sam-btn sam-btn--xs sam-btn--danger" style="width:100%; justify-content:flex-start; padding:6px 10px; font-size:12px; font-weight:600; text-align:right; border-radius:4px; min-height:28px;" onclick="App.deleteUser('${this.escape(u.username || '')}'); App.closeUserActionMenus()">🗑️ حذف الكرت</button>` : ''}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // 5. Define Standard Pagination
        const paginationHtml = PB?.renderPagination ? PB.renderPagination({
            page: res.page,
            totalPages: res.total_pages,
            totalRecords: res.total,
            itemName: 'كرت',
            onPageChange: 'App.setUsersPage'
        }) : `
            <div class="sam-pagination mt-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
                <div style="font-size:12.5px; color:var(--sam-text-secondary);">إجمالي الكروت: <b>${res.total.toLocaleString()}</b> (صفحة <b>${res.page}</b> من <b>${res.total_pages}</b>)</div>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="sam-btn sam-btn--sm" ${res.page <= 1 ? 'disabled' : ''} onclick="App.usersPage=1; App.renderUsers()">⇤ الأولى</button>
                    <button type="button" class="sam-btn sam-btn--sm" ${res.page <= 1 ? 'disabled' : ''} onclick="App.usersPage--; App.renderUsers()">◀ السابق</button>
                    <span style="padding:4px 10px; background:var(--sam-bg-surface); border:1px solid var(--sam-border-strong); border-radius:var(--sam-radius-sm); font-weight:700;">${res.page}</span>
                    <button type="button" class="sam-btn sam-btn--sm" ${res.page >= res.total_pages ? 'disabled' : ''} onclick="App.usersPage++; App.renderUsers()">التالي ▶</button>
                    <button type="button" class="sam-btn sam-btn--sm" ${res.page >= res.total_pages ? 'disabled' : ''} onclick="App.usersPage=${res.total_pages}; App.renderUsers()">الأخيرة ⇥</button>
                </div>
            </div>
        `;

        // 6. Assemble complete page using PageBuilder
        const prevSearchEl = document.getElementById('u-search');
        const wasSearchFocused = document.activeElement === prevSearchEl;
        const cursorPos = prevSearchEl ? (prevSearchEl.selectionStart || 0) : 0;

        if (PB?.renderShell) {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'users-cards',
                archetype: 'table',
                title: 'المستخدمون والكروت',
                subtitle: 'إدارة الكروت والمستخدمين والحالات والدفعات بنظام متجاوب فائق السرعة',
                eyebrow: 'SUBSCRIBERS & VOUCHERS',
                icon: '👥',
                actions: actions,
                stats: stats,
                toolbar: toolbar,
                content: tableHtml + paginationHtml
            });
        } else {
            // Fallback
            document.getElementById('main-view').innerHTML = `
                <main class="sam-page-shell sam-ui-page" data-sam-page="users-cards" dir="rtl">
                    <header class="sam-page-hero">
                        <div class="sam-page-hero-copy">
                            <span class="sam-ui-icon" style="font-size:28px;">👥</span>
                            <div>
                                <span class="sam-page-eyebrow">SUBSCRIBERS & VOUCHERS</span>
                                <h1>المستخدمون والكروت</h1>
                                <p>إدارة الكروت والمستخدمين والحالات والدفعات بنظام متجاوب فائق السرعة</p>
                            </div>
                        </div>
                    </header>
                    <div class="view-scroll-content">
                        ${tableHtml}
                        ${paginationHtml}
                    </div>
                </main>
            `;
        }
        window.SamPageShell?.sync();

        const newSearchEl = document.getElementById('u-search');
        if (newSearchEl && wasSearchFocused) {
            newSearchEl.focus();
            try { newSearchEl.setSelectionRange(cursorPos, cursorPos); } catch(e){}
        }
    },

    toggleSelectAll(el) {
        const checkboxes = document.querySelectorAll('input.user-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = el.checked;
            const u = cb.value;
            const row = document.getElementById(`user-row-${u}`);
            if (el.checked) {
                this.selectedItems.add(u);
                row?.classList.add('selected');
            } else {
                this.selectedItems.delete(u);
                row?.classList.remove('selected');
            }
        });
        this.updateSelectionToolbar();
    },

    toggleSelectItem(username, checked) {
        if (checked) {
            this.selectedItems.add(username);
        } else {
            this.selectedItems.delete(username);
        }
        const row = document.getElementById(`user-row-${username}`);
        if (checked) row?.classList.add('selected');
        else row?.classList.remove('selected');

        const allCheckboxes = document.querySelectorAll('input.user-checkbox');
        const selectAllCb = document.getElementById('users-select-all-cb');
        if (selectAllCb && allCheckboxes.length > 0) {
            selectAllCb.checked = Array.from(allCheckboxes).every(cb => cb.checked);
        }

        this.updateSelectionToolbar();
    },

    updateSelectionToolbar() {
        const container = document.getElementById('user-selection-actions');
        const countSpan = document.getElementById('selected-count-label');
        if (container) {
            if (this.selectedItems.size > 0) {
                container.style.display = 'inline-flex';
                if (countSpan) countSpan.textContent = `تم تحديد ${this.selectedItems.size} كرت`;
            } else {
                container.style.display = 'none';
            }
        }
    },

    async singleResetUsage(username) {
        if (!confirm(`هل أنت متأكد من تصفير استهلاك الكرت (${username}) وإعادته كرت جديد بالكامل؟`)) return;
        const res = await this.api('reset_users_usage', { usernames: [username] }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تصفير الكرت بنجاح', 'success');
            this.renderUsers();
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء التصفير', 'danger');
        }
    },

    async showBulkResetUsageModal() {
        const usernames = Array.from(this.selectedItems);
        if (usernames.length === 0) return;
        if (!confirm(`هل أنت متأكد من تصفير استهلاك عدد (${usernames.length}) كرت محدد وإعادتها جديدة بالكامل؟
سيتم مسح سجلات الاستهلاك وتجديد الصلاحية فوراً.`)) return;

        const res = await this.api('reset_users_usage', { usernames }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تصفير الكروت بنجاح', 'success');
            this.selectedItems.clear();
            this.renderUsers();
        } else {
            this.toast(res?.error || 'حدث خطأ', 'danger');
        }
    },

    async singleChangeProfile(username) {
        const res = await this.api('get_profiles');
        const allProfiles = Array.isArray(res) ? res : (res?.profiles || res?.data || []);
        const profiles = allProfiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-')));
        this.showModal(`
            <div class="mt-modal-header">
                <span>📦 تغيير باقة الكرت: <b>${this.escape(username)}</b></span>
                <span class="mt-modal-close" style="cursor:pointer;" onclick="App.closeModal()">&times;</span>
            </div>
            <div class="mt-modal-body" style="padding:16px;">
                <div class="mt-form-group">
                    <label style="display:block; font-weight:600; margin-bottom:6px;">اختر الباقة الجديدة:</label>
                    <select id="modal-new-profile" class="mt-select" style="width:100%; font-weight:600;">
                        ${profiles.map(p => `
                            <option value="${this.escape(p.name)}">
                                💳 ${this.escape(p.name_for_users || p.name)} (${p.price || 0} ${App.getCurrencySymbol(App._baseCurrency)}) [${App.formatBytes(p.transfer_limit) || 'مفتوح'}]
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="mt-form-group" style="margin-top:12px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="modal-reset-usage" />
                        <span>تصفير استهلاك الكرت أيضاً (إعادة الرصيد والوقت جديداً)</span>
                    </label>
                </div>
                <div style="margin-top:12px; padding:10px 12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:11.5px; color:#1e40af; line-height:1.6;">
                    💡 <b>احتساب السعر عند تعديل الباقة:</b><br/>
                    • <b>إذا لم يُستخدم الكرت بعد:</b> يتعدل سعره ليطابق سعر الباقة الجديدة.<br/>
                    • <b>إذا كان الكرت مستخدماً بالفعل:</b> يُضاف سعر الباقة الجديدة إلى السعر السابق للكرت.
                </div>
            </div>
            <div class="mt-modal-footer">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="button" class="mt-btn mt-btn-primary" onclick="App.submitChangeProfile(['${this.escape(username)}'])">تطبيق الباقة</button>
            </div>
        `);
    },

    async showBulkChangeProfileModal() {
        const usernames = Array.from(this.selectedItems);
        if (usernames.length === 0) return;
        const res = await this.api('get_profiles');
        const allProfiles = Array.isArray(res) ? res : (res?.profiles || res?.data || []);
        const profiles = allProfiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-')));

        this.showModal(`
            <div class="mt-modal-header">
                <span>📦 تغيير باقة (<b>${usernames.length}</b>) كرت محدد</span>
                <span class="mt-modal-close" style="cursor:pointer;" onclick="App.closeModal()">&times;</span>
            </div>
            <div class="mt-modal-body" style="padding:16px;">
                <div class="mt-form-group">
                    <label style="display:block; font-weight:600; margin-bottom:6px;">اختر الباقة الجديدة:</label>
                    <select id="modal-new-profile" class="mt-select" style="width:100%; font-weight:600;">
                        ${profiles.map(p => `
                            <option value="${this.escape(p.name)}">
                                💳 ${this.escape(p.name_for_users || p.name)} (${p.price || 0} ${App.getCurrencySymbol(App._baseCurrency)}) [${App.formatBytes(p.transfer_limit) || 'مفتوح'}]
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="mt-form-group" style="margin-top:12px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="modal-reset-usage" />
                        <span>تصفير الاستهلاك للكروت المحددة أيضاً (إعادة البيانات والوقت جديدة)</span>
                    </label>
                </div>
                <div style="margin-top:12px; padding:10px 12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:11.5px; color:#1e40af; line-height:1.6;">
                    💡 <b>احتساب السعر عند تعديل الباقة:</b><br/>
                    • <b>الكروت غير المستخدمة (جديدة):</b> يتعدل سعرها ليطابق سعر الباقة الجديدة.<br/>
                    • <b>الكروت المستخدمة بالفعل:</b> يُضاف سعر الباقة الجديدة إلى السعر السابق لكل كرت.
                </div>
            </div>
            <div class="mt-modal-footer">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="button" class="mt-btn mt-btn-primary" onclick="App.submitChangeProfile()">تطبيق على المحدد</button>
            </div>
        `);
    },

    async submitChangeProfile(usernames = null) {
        if (!usernames || !usernames.length) {
            usernames = Array.from(this.selectedItems);
        }
        if (!usernames || !usernames.length) {
            this.toast('لم يتم تحديد أي كروت لتغيير الباقة', 'warning');
            return;
        }
        const newProf = document.getElementById('modal-new-profile')?.value;
        const resetUsage = document.getElementById('modal-reset-usage')?.checked || false;
        if (!newProf) {
            this.toast('يرجى اختيار الباقة الجديدة', 'warning');
            return;
        }

        const res = await this.api('change_users_profile', {
            usernames,
            profile: newProf,
            reset_usage: resetUsage
        }, 'POST');

        if (res && res.success) {
            this.toast(res.message || 'تم تغيير الباقة بنجاح', 'success');
            this.closeModal();
            this.selectedItems.clear();
            this.renderUsers();
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء تغيير الباقة', 'danger');
        }
    },

    async showBulkRenewModal() {
        const usernames = Array.from(this.selectedItems);
        if (usernames.length === 0) return;

        this.showModal(`
            <div class="mt-modal-header">
                <span>⏳ تجديد وتمديد صلاحية (<b>${usernames.length}</b>) كرت</span>
                <span class="mt-modal-close" style="cursor:pointer;" onclick="App.closeModal()">&times;</span>
            </div>
            <div class="mt-modal-body" style="padding:16px;">
                <div class="mt-form-group">
                    <label style="display:block; font-weight:600; margin-bottom:6px;">عدد أيام التمديد الإضافية:</label>
                    <input type="number" id="modal-renew-days" class="mt-input" value="30" min="1" max="365" style="width:100%;" />
                </div>
            </div>
            <div class="mt-modal-footer">
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                <button type="button" class="mt-btn mt-btn-primary" onclick="App.submitBulkRenew()">تجديد الصلاحية</button>
            </div>
        `);
    },

    async submitBulkRenew(usernames = null) {
        if (!usernames || !usernames.length) {
            usernames = Array.from(this.selectedItems);
        }
        if (!usernames || !usernames.length) {
            this.toast('لم يتم تحديد أي كروت للتجديد', 'warning');
            return;
        }
        const days = parseInt(document.getElementById('modal-renew-days')?.value || 30);
        const res = await this.api('renew_users_validity', { usernames, days }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تجديد الصلاحية بنجاح', 'success');
            this.closeModal();
            this.selectedItems.clear();
            this.renderUsers();
        } else {
            this.toast(res?.error || 'حدث خطأ أثناء تجديد الصلاحية', 'danger');
        }
    },

    async bulkToggleStatus(status) {
        const usernames = Array.from(this.selectedItems);
        if (usernames.length === 0) return;
        const actionLabel = status === 'disabled' ? 'تعطيل' : 'تفعيل';
        if (!confirm(`هل أنت متأكد من ${actionLabel} عدد (${usernames.length}) كرت محدد؟`)) return;

        const res = await this.api('set_users_batch_status', { usernames, status }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تحديث حالة الكروت بنجاح', 'success');
            this.selectedItems.clear();
            this.renderUsers();
        } else {
            this.toast(res?.error || 'حدث خطأ', 'danger');
        }
    },

    async showUserUsageModal(username) {
        this.toast('جاري تحميل بيانات استهلاك الكرت...', 'info');
        const usage = await this.api('get_user_usage', { username });
        if (!usage) return;
        const valStr = usage.validity || usage.profile_validity || '30d';

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:850px; max-height:92vh;">
                <div class="mt-modal-header">
                    <span>📊 بيانات الاستهلاك وسجل الجلسات للكرت: [ <code>${usage.username}</code> ]</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <div class="mt-modal-body">
                    <div class="kpi-grid" style="padding:0; margin-bottom:15px;">
                        <div class="kpi-card">
                            <div class="kpi-icon" style="background:#e1f5fe; color:#0288d1;">📥</div>
                            <div>
                                <div class="kpi-val">${App.formatBytes(usage.total_download)}</div>
                                <div class="kpi-lbl">إجمالي التحميل (Download)</div>
                            </div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-icon" style="background:#f3e5f5; color:#8e24aa;">📤</div>
                            <div>
                                <div class="kpi-val">${App.formatBytes(usage.total_upload)}</div>
                                <div class="kpi-lbl">إجمالي الرفع (Upload)</div>
                            </div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-icon" style="background:#e8f8f0; color:#27ae60;">📈</div>
                            <div>
                                <div class="kpi-val">${App.formatBytes(usage.total_bytes)}</div>
                                <div class="kpi-lbl">إجمالي الترافيك المستهلك</div>
                            </div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-icon" style="background:#fff3e0; color:#f57c00;">⏱️</div>
                            <div>
                                <div class="kpi-val">${App.formatSeconds(usage.total_uptime)}</div>
                                <div class="kpi-lbl">إجمالي وقت الاتصال (Uptime)</div>
                            </div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-icon" style="background:#ecfeff; color:#0f766e;">⌛</div>
                            <div>
                                <div class="kpi-val" style="color:${usage.remaining_uptime !== null && Number(usage.remaining_uptime)<=0?'#dc2626':'#0f766e'}">${usage.remaining_uptime === null || usage.remaining_uptime === undefined ? '∞ غير محدود' : App.formatSeconds(Number(usage.remaining_uptime))}</div>
                                <div class="kpi-lbl">الوقت المتبقي</div>
                            </div>
                        </div>
                    </div>

                    <div style="background:var(--toolbar-bg); border-radius:6px; padding:12px; margin-bottom:15px; font-size:12px; display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
                        <div><b>الباقة:</b> <span class="status-pill status-online">${usage.profile_name || 'بدون باقة'}</span></div>
                        <div><b>الصلاحية:</b> <span class="status-pill status-active">${App.formatValidityDisplay(valStr)}</span></div>
                        <div><b>السرعة:</b> <code>${usage.rate_limit || 'غير محددة'}</code></div>
                        <div><b>الحالة:</b> ${usage.is_online ? '<span class="status-pill status-online">🟢 متصل الآن</span>' : '<span class="status-pill">⚪ غير متصل</span>'}</div>
                        <div><b>عدد الجلسات:</b> ${usage.total_sessions} جلسة</div>
                        <div><b>أول استخدام:</b> <span>${usage.first_login || usage.first_connection || 'لم يستخدم بعد'}</span></div>
                        <div><b>تاريخ الانتهاء:</b> ${usage.expires_at ? `<span class="status-pill ${new Date(usage.expires_at) <= new Date() ? 'status-danger' : 'status-online'}" style="${new Date(usage.expires_at) <= new Date() ? 'background:#ffebee; color:#c62828;' : ''}">${usage.expires_at} ${new Date(usage.expires_at) <= new Date() ? '(🔴 منتهي)' : ''}</span>` : '<span class="text-muted">يبدأ عند أول تسجيل دخول</span>'}</div>
                        <div><b>نوع الكرت:</b> <span class="status-pill">${({paper:'ورقي',digital:'فوري من الرصيد',free:'مجاني',individual:'فردي'})[usage.card_type] || 'فردي'}</span></div>
                        <div><b>كلمة المرور:</b> <code>${this.escape(usage.password ?? '—')}</code></div>
                        <div><b>سعر البطاقة:</b> <b>${Number(usage.price || 0).toLocaleString()}</b></div>
                        <div><b>الدفعة:</b> <span>${this.escape(usage.batch_id || '—')}</span></div>
                        <div><b>الملاحظة:</b> <span>${this.escape(usage.comment || '—')}</span></div>
                        <div><b>رقم الصفحة:</b> <b>${usage.sheet_no || 'غير مرتبط بصفحة'}</b></div>
                        <div><b>تاريخ الإضافة:</b> <span>${usage.created_at || 'غير متوفر'}</span></div>
                        ${usage.remaining_bytes !== null ? `<div><b>الرصيد المتبقي:</b> <b>${App.formatBytes(usage.remaining_bytes)}</b> (${usage.quota_percent}% مستهلك)</div>` : ''}
                    </div>

                    ${usage.active_session ? `
                        <div style="background:#e8f8f0; border:1px solid #27ae60; border-radius:6px; padding:10px; margin-bottom:15px; font-size:12px;">
                            <div style="font-weight:700; color:#27ae60; margin-bottom:6px;">⚡ الجلسة النشطة حالياً (Live Online Session):</div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    IP: <code>${usage.active_session.framedipaddress}</code> | 
                                    MAC: <code>${usage.active_session.callingstationid}</code> | 
                                    الراوتر: <code>${usage.active_session.nasipaddress}</code> | 
                                    المنفذ: <code>${usage.active_session.nasportid || '-'}</code> |
                                    الوقت: <b>${App.formatSeconds(usage.active_session.acctsessiontime)}</b>
                                </div>
                                <button class="mt-btn mt-btn-danger" style="padding:3px 8px; font-size:11px;" onclick="App.disconnectSessionPrompt('${this.escape(usage.username)}', '${this.escape(usage.active_session.nasipaddress)}', '${this.escape(usage.active_session.framedipaddress)}')">
                                    ⚡ فصل الجلسة فورياً
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    <div style="font-weight:600; margin-bottom:8px; font-size:13px;">📜 سجل الجلسات السابقة (Session History):</div>
                    <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border-color); border-radius:4px;">
                        <table class="mt-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>الراوتر (NAS)</th>
                                    <th>المنفذ (NAS-Port-ID)</th>
                                    <th>عنوان IP</th>
                                    <th>عنوان MAC</th>
                                    <th>وقت البدء</th>
                                    <th>وقت الانتهاء</th>
                                    <th>المدة</th>
                                    <th>الاستهلاك</th>
                                    <th>سبب الإنهاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(usage.sessions_history || []).map((s, idx) => `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td><b>${s.nas_name || s.nasipaddress}</b></td>
                                        <td><code>${s.nasportid || '-'}</code></td>
                                        <td><code>${s.framedipaddress || '-'}</code></td>
                                        <td><small>${s.callingstationid || '-'}</small></td>
                                        <td><small>${s.acctstarttime}</small></td>
                                        <td><small>${s.acctstoptime || 'نشطة'}</small></td>
                                        <td>${App.formatSeconds(s.acctsessiontime)}</td>
                                        <td><b>${App.formatBytes(s.total_bytes)}</b></td>
                                        <td><span class="status-pill">${s.acctterminatecause || '-'}</span></td>
                                    </tr>
                                `).join('')}
                                ${(!usage.sessions_history || usage.sessions_history.length === 0) ? '<tr><td colspan="10" style="text-align:center; padding:15px; color:var(--text-muted);">لا توجد جلسات مسجلة لهذا الكرت</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn mt-btn-primary" onclick="App.closeModal()">إغلاق</button>
                </div>
            </div>
        </div>
        `;
    },

    async showUserModal(user = null) {
        if (!user && !(this.userRole === 'system_owner' || this.isSystemOwner)) {
            this.toast('عذراً، إضافة كرت / مشترك مفرد مخصصة لمالك النظام فقط', 'warning');
            return;
        }
        try {
            const profilesRes = await this.api('get_profiles').catch(() => []);
            const allProfiles = Array.isArray(profilesRes) ? profilesRes : (profilesRes?.profiles || profilesRes?.data || []);
            const profiles = allProfiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-')));
            const modalHtml = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal" style="width:640px; max-width:96vw;">
                    <div class="mt-modal-header" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                        <span style="font-weight:700; font-size:14.5px;">${user ? '✏️ تعديل بيانات الكرت / المشترك' : '➕ إضافة كرت / مشترك جديد'}</span>
                        <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
                    </div>
                    <form onsubmit="App.saveUserForm(event)">
                        <div class="mt-modal-body" style="padding:18px;">
                            <div class="form-row">
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700; display:flex; justify-content:space-between; align-items:center;">
                                        <span>${this.t('username')} *</span>
                                        ${!user ? `<button type="button" class="sam-btn sam-btn--xs" style="padding:1px 6px; font-size:10px;" onclick="document.getElementById('u-name').value = Math.floor(10000000 + Math.random() * 90000000)">🎲 رقم عشوائي</button>` : ''}
                                    </label>
                                    <input type="text" id="u-name" class="mt-input" style="width:100%; font-family:monospace; font-weight:700;" value="${this.escape(user?.username || '')}" ${user ? 'readonly' : ''} required />
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700;">${this.t('password')} <span style="font-weight:400; color:var(--text-muted);">(اختيارية)</span></label>
                                    <input type="text" id="u-pass" class="mt-input" style="width:100%; font-family:monospace;" value="${this.escape(user?.password || '')}" placeholder="اتركها فارغة: دخول بالاسم فقط" autocomplete="off" />
                                    <small style="display:block; color:var(--text-muted); margin-top:4px; font-size:10.5px;">عند تركها فارغة يكون الدخول باسم المستخدم فقط.</small>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700;">${this.t('profile')} *</label>
                                    <select id="u-prof" class="mt-select" style="width:100%; font-weight:600;" required>
                                        <option value="">-- اختر الباقة --</option>
                                        ${profiles.map(p => `<option value="${this.escape(p.name)}" ${user?.profile_name === p.name ? 'selected' : ''}>💳 ${this.escape(p.name_for_users || p.name)} (${p.price || 0} ${App.getCurrencySymbol(App._baseCurrency)}) [${App.formatBytes(p.transfer_limit) || 'مفتوح'}]</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700;">👥 ${this.t('shared_users')} (الأجهزة المتزامنة)</label>
                                    <input type="number" id="u-shared" min="1" max="10" class="mt-input" style="width:100%" value="${user?.shared_users || 1}" />
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700;">⚡ ${this.t('rate_limit')} (سرعة VIP مخصصة)</label>
                                    <div style="display:flex; gap:6px;">
                                        <input type="text" id="u-rate" class="mt-input" style="flex:1; font-family:monospace; font-weight:700;" value="${this.escape(user?.rate_limit || '')}" placeholder="مثال: 50M/50M" />
                                        <select class="mt-select" style="width:110px; font-size:11px;" onchange="if(this.value) document.getElementById('u-rate').value=this.value">
                                            <option value="">سرعات VIP</option>
                                            <option value="10M/10M">10 Mbps</option>
                                            <option value="20M/20M">20 Mbps</option>
                                            <option value="50M/50M">50 Mbps</option>
                                            <option value="100M/100M">100 Mbps</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label style="font-weight:700;">🔒 قفل الماك (MAC Lock)</label>
                                    <input type="text" id="u-mac" class="mt-input" style="width:100%; font-family:monospace;" value="${this.escape(user?.mac_lock || '')}" placeholder="AA:BB:CC:DD:EE:FF" />
                                </div>
                            </div>
                            <div class="form-group">
                                <label style="font-weight:700;">${this.t('comment')}</label>
                                <input type="text" id="u-comm" class="mt-input" style="width:100%" value="${this.escape(user?.comment || '')}" placeholder="ملاحظات اختيارية... (مثلاً: مشترك VIP)" />
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="u-dis" ${user?.is_disabled ? 'checked' : ''} />
                                    <span>تعطيل الحساب مؤقتاً (Disabled)</span>
                                </label>
                            </div>
                        </div>
                        <div class="mt-modal-footer" style="padding:12px 18px; display:flex; justify-content:flex-end; gap:8px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                            <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>
                            <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:700; padding:6px 20px;">${this.t('save')}</button>
                        </div>
                    </form>
                </div>
            </div>
            `;
            if (typeof this.openModal === 'function') {
                this.openModal(modalHtml);
            } else {
                let mc = document.getElementById('modal-container');
                if (!mc) {
                    mc = document.createElement('div');
                    mc.id = 'modal-container';
                    document.body.appendChild(mc);
                }
                mc.innerHTML = modalHtml;
            }
        } catch(err) {
            console.error('showUserModal error:', err);
            this.toast('تعذر فتح نافذة المستخدم: ' + (err?.message || err), 'danger');
        }
    },

    async editUser(username) {
        try {
            const u = await this.api('get_user_details', { username });
            if (u) {
                this.showUserModal(u.user || u);
            } else {
                this.toast('تعذر جلب بيانات المستخدم', 'danger');
            }
        } catch(err) {
            this.toast('تعذر جلب تفاصيل المستخدم: ' + (err?.message || err), 'danger');
        }
    },

    async saveUserForm(e) {
        e.preventDefault();
        const payload = {
            username: document.getElementById('u-name').value,
            password: document.getElementById('u-pass').value,
            profile: document.getElementById('u-prof').value,
            shared_users: document.getElementById('u-shared').value,
            rate_limit: document.getElementById('u-rate').value,
            mac_lock: document.getElementById('u-mac').value,
            comment: document.getElementById('u-comm').value,
            is_disabled: document.getElementById('u-dis').checked
        };
        const res = await this.api('save_user', {}, 'POST', payload);
        if (res && res.success) {
            this.toast(this.t('success_saved'), 'success');
            this.closeModal();
            this.renderUsers();
        }
    },

    async setUserStatus(username, enable) {
        if (enable) {
            const u = this.usersCache?.find(x => x.username === username);
            if (u && (u.is_sold == 0 || u.status === 'disabled')) {
                // If it is an unsold voucher
                if (u.is_sold == 0) {
                    this.toast('⚠️ لا يمكن تفعيل الكروت غير المباعة يدوياً - يتم التفعيل حصرياً عبر إنشاء فاتورة مبيعات في قسم المبيعات', 'warning');
                    return;
                }
            }
        }
        const res = await this.api('set_user_status', {}, 'POST', { username, enable });
        if (res && res.success) {
            this.toast(this.t('success_saved'), 'success');
            this.renderUsers();
        } else {
            this.toast(res?.error || 'فشل تغيير حالة الكرت', 'danger');
        }
    },

    async deleteUserSingle(username) {
        if (!confirm(this.t('confirm_delete'))) return;
        const res = await this.api('delete_user', { username });
        if (res && res.success) {
            this.toast(this.t('success_deleted'), 'success');
            this.renderUsers();
        }
    },

    async deleteSelectedUsers() {
        if (this.selectedItems.size === 0) return this.toast('الرجاء تحديد كروت للحذف', 'warning');
        if (!confirm(`هل أنت متأكد من حذف ${this.selectedItems.size} كرت؟`)) return;
        const res = await this.api('delete_users_batch', {}, 'POST', { usernames: Array.from(this.selectedItems) });
        if (res && res.success) {
            this.toast(this.t('success_deleted'), 'success');
            this.selectedItems.clear();
            this.renderUsers();
        }
    },

    formatValidityDisplay(v) {
        if (!v) return '30 يوم';
        v = String(v).trim().toLowerCase();
        if (v.endsWith('mo')) return parseInt(v) + ' شهر';
        if (v.endsWith('m')) return parseInt(v) + ' دقيقة';
        if (v.endsWith('h')) return parseInt(v) + ' ساعة';
        if (v.endsWith('d')) return parseInt(v) + ' يوم';
        if (v.endsWith('y')) return parseInt(v) + ' سنة';
        return v;
    },

    formatSecondsArabic(sec) {
        sec = parseInt(sec);
        if (!sec || sec <= 0) return 'غير محدود';
        if (sec >= 31536000 && sec % 31536000 === 0) return (sec / 31536000) + ' سنة';
        if (sec >= 2592000 && sec % 2592000 === 0) return (sec / 2592000) + ' شهر';
        if (sec >= 86400 && sec % 86400 === 0) return (sec / 86400) + ' يوم';
        if (sec >= 3600 && sec % 3600 === 0) return (sec / 3600) + ' ساعة';
        if (sec >= 60 && sec % 60 === 0) return (sec / 60) + ' دقيقة';
        return sec + ' ثانية';
    },

    parseRateLimit(rate) {
        const match = String(rate ?? '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmg]?)\s*(?:\/\s*([0-9]+(?:\.[0-9]+)?)\s*([kmg]?))?$/i);
        if (!match) return null;
        const toBps = (value, unit) => Number(value) * ({'': 1, k: 1e3, m: 1e6, g: 1e9}[String(unit || '').toLowerCase()] || 1);
        const rx = toBps(match[1], match[2]);
        const tx = match[3] === undefined ? rx : toBps(match[3], match[4]);
        return Number.isFinite(rx) && Number.isFinite(tx) ? [rx, tx] : null;
    },

    rateLimitIsGreater(maxRate, defaultRate) {
        const max = this.parseRateLimit(maxRate);
        const base = this.parseRateLimit(defaultRate);
        return Boolean(max && base && max[0] >= base[0] && max[1] >= base[1] && (max[0] > base[0] || max[1] > base[1]));
    },

    syncProfileMikrotikGroupPreview(name) {
        const preview = document.getElementById('p-mikrotik-group-preview');
        if (preview) preview.textContent = String(name || '').trim() || 'اسم الباقة';
    },

    refreshProfileMaxSpeedOptions() {
        const select = document.getElementById('p-max-speed');
        const enabled = document.getElementById('p-allow-speed')?.value === '1';
        const baseRate = document.getElementById('p-rate')?.value || '';
        if (!select) return;
        const currentValue = select.value;
        const eligible = (this.profileSpeedTiers || []).filter(t => this.rateLimitIsGreater(t.rate_limit, baseRate));
        select.required = enabled;
        select.innerHTML = eligible.length
            ? eligible.map(t => `<option value="${this.escape(t.rate_limit)}">${this.escape(t.label || t.rate_limit)} — ${this.escape(t.rate_limit)}</option>`).join('')
            : '<option value="">لا توجد سرعة أعلى معرفة لهذه الشبكة</option>';
        if (eligible.some(t => String(t.rate_limit) === String(currentValue))) select.value = currentValue;
    },

    onDefaultSpeedChange() {
        this.refreshProfileMaxSpeedOptions();
    },

    async showProfileModal(data = null) {
        const templates = await this.api('get_templates') || [];
        const speedResult = await this.api('get_speed_tiers');
        let speedTiers = speedResult?.tiers || [];
        if (!speedTiers.length && data?.rate_limit) speedTiers = [{ label: data.rate_limit, rate_limit: data.rate_limit }];
        if (!speedTiers.length) speedTiers = [{ label: '2M/2M', rate_limit: '2M/2M' }];
        const knownRates = new Set(speedTiers.map(t => String(t.rate_limit)));
        if (data?.rate_limit && !knownRates.has(String(data.rate_limit))) speedTiers.unshift({ label: 'السرعة الحالية', rate_limit: data.rate_limit });
        if (data?.max_speed && !knownRates.has(String(data.max_speed))) speedTiers.push({ label: 'الحد الأعلى الحالي', rate_limit: data.max_speed });
        this.profileSpeedTiers = speedTiers;
        const defaultRateForOptions = String(data?.rate_limit || speedTiers[0]?.rate_limit || '2M/2M');
        const higherSpeedTiers = speedTiers.filter(t => this.rateLimitIsGreater(t.rate_limit, defaultRateForOptions));
        const initialMaxRate = higherSpeedTiers.some(t => String(t.rate_limit) === String(data?.max_speed))
            ? String(data.max_speed)
            : String(higherSpeedTiers[0]?.rate_limit || '');

        // Parse Validity
        let valNum = 30;
        let valUnit = 'd';
        if (data && data.validity) {
            const vStr = String(data.validity).trim().toLowerCase();
            if (vStr.endsWith('mo')) {
                valNum = parseInt(vStr) || 1;
                valUnit = 'mo';
            } else if (vStr.endsWith('m')) {
                valNum = parseInt(vStr) || 5;
                valUnit = 'm';
            } else if (vStr.endsWith('h')) {
                valNum = parseInt(vStr) || 1;
                valUnit = 'h';
            } else if (vStr.endsWith('y')) {
                valNum = parseInt(vStr) || 1;
                valUnit = 'y';
            } else if (vStr.endsWith('d')) {
                valNum = parseInt(vStr) || 30;
                valUnit = 'd';
            } else {
                valNum = parseInt(vStr) || 30;
                valUnit = 'd';
            }
        }

        // Parse Transfer Limit (MB / GB / TB / Unlimited)
        let transNum = 0;
        let transUnit = 'unlimited';
        const rawBytes = parseInt(data?.transfer_limit || 0);
        if (rawBytes > 0) {
            if (rawBytes >= 1099511627776 && rawBytes % 1099511627776 === 0) {
                transNum = rawBytes / 1099511627776;
                transUnit = 'TB';
            } else if (rawBytes >= 1073741824 && rawBytes % 1073741824 === 0) {
                transNum = rawBytes / 1073741824;
                transUnit = 'GB';
            } else if (rawBytes >= 1000000000 && rawBytes % 1000000000 === 0) {
                transNum = rawBytes / 1000000000;
                transUnit = 'GB';
            } else if (rawBytes >= 1048576) {
                transNum = Math.round(rawBytes / 1048576);
                transUnit = 'MB';
            } else {
                transNum = Math.round(rawBytes / 1048576);
                transUnit = 'MB';
            }
        }

        // Parse Uptime Limit (Minutes / Hours / Days / Months / Years / Unlimited)
        let uptimeNum = 0;
        let uptimeUnit = 'unlimited';
        const rawSec = parseInt(data?.uptime_limit || 0);
        if (rawSec > 0) {
            if (rawSec >= 31536000 && rawSec % 31536000 === 0) {
                uptimeNum = rawSec / 31536000;
                uptimeUnit = 'y';
            } else if (rawSec >= 2592000 && rawSec % 2592000 === 0) {
                uptimeNum = rawSec / 2592000;
                uptimeUnit = 'mo';
            } else if (rawSec >= 86400 && rawSec % 86400 === 0) {
                uptimeNum = rawSec / 86400;
                uptimeUnit = 'd';
            } else if (rawSec >= 3600 && rawSec % 3600 === 0) {
                uptimeNum = rawSec / 3600;
                uptimeUnit = 'h';
            } else if (rawSec >= 60 && rawSec % 60 === 0) {
                uptimeNum = rawSec / 60;
                uptimeUnit = 'm';
            } else {
                uptimeNum = Math.round(rawSec / 60);
                uptimeUnit = 'm';
            }
        }

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="max-width: 650px;">
                <div class="mt-modal-header">
                    <span>${data ? 'تعديل الباقة / Profile' : 'إضافة باقة جديدة'}</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <form onsubmit="App.saveProfileForm(event)">
                    <div class="mt-modal-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label>اسم الباقة (Profile Name)</label>
                                <input type="text" id="p-name" class="mt-input" style="width:100%" value="${data?.name || ''}" ${data ? 'readonly' : ''} oninput="App.syncProfileMikrotikGroupPreview(this.value)" required />
                                <small style="color:#64748b">اسم MikroTik Group / User Profile هو نفسه اسم الباقة ويضبطه النظام تلقائياً: <code id="p-mikrotik-group-preview">${this.escape(data?.name || 'اسم الباقة')}</code></small>
                            </div>
                            <div class="form-group">
                                <label>الاسم الظاهر للمستخدمين</label>
                                <input type="text" id="p-display" class="mt-input" style="width:100%" value="${data?.name_for_users || ''}" />
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>نوع الباقة</label>
                                <select id="p-package-type" class="mt-select" style="width:100%" onchange="App.onPackageTypeChange()">
                                    <option value="paid" ${data?.package_type !== 'free' ? 'selected' : ''}>💳 باقة مدفوعة</option>
                                    <option value="free" ${data?.package_type === 'free' ? 'selected' : ''}>🎁 باقة مجانية</option>
                                </select>
                                <small style="color:#64748b">يُستخدم للفصل بين المبيعات المدفوعة والاستهلاك المجاني في التقارير.</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label>السرعة الافتراضية للباقة</label>
                                <select id="p-rate" class="mt-select" style="width:100%" onchange="App.onDefaultSpeedChange()" required>${speedTiers.map(t => `<option value="${this.escape(t.rate_limit)}" ${defaultRateForOptions === String(t.rate_limit) ? 'selected' : ''}>${this.escape(t.label)} — ${this.escape(t.rate_limit)}</option>`).join('')}</select>
                            </div>
                            <div class="form-group" id="p-price-group" style="flex:1; ${data?.package_type === 'free' ? 'display:none;' : ''}">
                                <label>سعر البيع للعميل (${App.getCurrencySymbol(App._baseCurrency)})</label>
                                <input type="number" id="p-price" class="mt-input" style="width:100%" value="${data?.retail_price || data?.price || 0}" step="any" min="0" oninput="App.validateProfileCostPrice()" ${data?.package_type === 'free' ? '' : 'required'} />
                            </div>
                            <div class="form-group" id="p-cost-group" style="flex:1; ${data?.package_type === 'free' ? 'display:none;' : ''}">
                                <label>سعر التوزيع للوكيل / نقطة البيع (${App.getCurrencySymbol(App._baseCurrency)})</label>
                                <input type="number" id="p-cost-price" class="mt-input" style="width:100%" value="${data?.cost_price || 0}" step="any" min="0" oninput="App.validateProfileCostPrice()" ${data?.package_type === 'free' ? '' : 'required'} />
                                <small id="p-cost-warn" style="color:#dc2626; font-size:11px; font-weight:800; display:none; margin-top:4px;">⚠️ تنبيه: سعر التوزيع لا يمكن أن يزيد عن سعر البيع!</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>فترة الصلاحية (Validity)</label>
                                <div style="display:flex; gap:6px;">
                                    <input type="number" id="p-val-num" class="mt-input" style="width:50%" value="${valNum}" min="1" required />
                                    <select id="p-val-unit" class="mt-select" style="width:50%">
                                        <option value="m" ${valUnit === 'm' ? 'selected' : ''}>دقيقة (Minutes)</option>
                                        <option value="h" ${valUnit === 'h' ? 'selected' : ''}>ساعة (Hours)</option>
                                        <option value="d" ${valUnit === 'd' ? 'selected' : ''}>يوم (Days)</option>
                                        <option value="mo" ${valUnit === 'mo' ? 'selected' : ''}>شهر (Months)</option>
                                        <option value="y" ${valUnit === 'y' ? 'selected' : ''}>سنة (Years)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>رصيد البيانات (Transfer Limit)</label>
                                <div style="display:flex; gap:6px;">
                                    <input type="number" id="p-trans-num" class="mt-input" style="width:50%" value="${transNum}" min="0" step="any" oninput="App.onTransNumChange()" />
                                    <select id="p-trans-unit" class="mt-select" style="width:50%" onchange="App.onTransUnitChange()">
                                        <option value="MB" ${transUnit === 'MB' ? 'selected' : ''}>ميجابايت (MB)</option>
                                        <option value="GB" ${transUnit === 'GB' ? 'selected' : ''}>جيجابايت (GB)</option>
                                        <option value="TB" ${transUnit === 'TB' ? 'selected' : ''}>تيرابايت (TB)</option>
                                        <option value="unlimited" ${transUnit === 'unlimited' ? 'selected' : ''}>غير محدود (Unlimited)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>وقت الاستخدام الأقصى (Uptime Limit)</label>
                                <div style="display:flex; gap:6px;">
                                    <input type="number" id="p-uptime-num" class="mt-input" style="width:50%" value="${uptimeNum}" min="0" oninput="App.onUptimeNumChange()" />
                                    <select id="p-uptime-unit" class="mt-select" style="width:50%" onchange="App.onUptimeUnitChange()">
                                        <option value="unlimited" ${uptimeUnit === 'unlimited' ? 'selected' : ''}>غير محدود (Unlimited)</option>
                                        <option value="m" ${uptimeUnit === 'm' ? 'selected' : ''}>دقيقة (Minutes)</option>
                                        <option value="h" ${uptimeUnit === 'h' ? 'selected' : ''}>ساعة (Hours)</option>
                                        <option value="d" ${uptimeUnit === 'd' ? 'selected' : ''}>يوم (Days)</option>
                                        <option value="mo" ${uptimeUnit === 'mo' ? 'selected' : ''}>شهر (Months)</option>
                                        <option value="y" ${uptimeUnit === 'y' ? 'selected' : ''}>سنة (Years)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>عدد الأجهزة المتزامنة (Shared Users)</label>
                                <input type="number" id="p-shared" class="mt-input" style="width:100%" value="${data?.shared_users || 1}" min="1" />
                            </div>
                        </div>

                        <div class="form-row" id="p-tmpl-row" style="${data?.package_type === 'free' ? 'display:none;' : ''}">
                            <div class="form-group">
                                <label id="p-tmpl-label">قالب الطباعة المخصص لهذه الباقة ${data?.package_type === 'free' ? '(اختياري)' : '*'}</label>
                                <select id="p-tmpl" class="mt-select" style="width:100%" ${data?.package_type === 'free' ? '' : 'required'}>
                                    <option value="">${data?.package_type === 'free' ? 'بدون قالب طباعة (باقة مجانية)' : 'اختر قالب طباعة مخصصاً'}</option>
                                    ${templates.map(t => `<option value="${t.id}" ${data?.template_id == t.id ? 'selected' : ''}>${t.name} (${t.grid_cols || 3}×${t.grid_rows || 10})</option>`).join('')}
                                </select>
                                <small id="p-tmpl-help" style="color:#64748b">${data?.package_type === 'free' ? 'قالب الطباعة اختياري للباقات المجانية.' : ('اختيار القالب إلزامي لكل الباقات المدفوعة.' + (templates.length ? '' : ' لا توجد قوالب بعد؛ أنشئ قالباً من صفحة قوالب الطباعة أولاً.'))}</small>
                            </div>
                        </div>

                        <div class="form-row" style="border-top:1px dashed #334155; padding-top:10px; margin-top:5px;">
                            <div class="form-group">
                                <label>إمكانية تغيير السرعة بواسطة المشترك</label>
                                <select id="p-allow-speed" class="mt-select" style="width:100%" onchange="App.onAllowSpeedChange(this.value)">
                                    <option value="0" ${(!data || data?.allow_speed_change == 0) ? 'selected' : ''}>❌ غير متاح (السرعة ثابتة ومحددة بالباقة)</option>
                                    <option value="1" ${data?.allow_speed_change == 1 ? 'selected' : ''}>✅ متاح (يمكن للمشترك تغيير السرعة حتى الحد الأقصى)</option>
                                </select>
                            </div>
                            <div class="form-group" id="p-max-speed-group" style="${(!data || data?.allow_speed_change == 0) ? 'display:none;' : ''}">
                                <label>أقصى سرعة مسموحة للمشترك (Max Speed)</label>
                                <select id="p-max-speed" class="mt-select" style="width:100%" ${data?.allow_speed_change == 1 ? 'required' : ''}>${higherSpeedTiers.length ? higherSpeedTiers.map(t => `<option value="${this.escape(t.rate_limit)}" ${initialMaxRate === String(t.rate_limit) ? 'selected' : ''}>${this.escape(t.label)} — ${this.escape(t.rate_limit)}</option>`).join('') : '<option value="">لا توجد سرعة أعلى معرفة لهذه الشبكة</option>'}</select>
                                <small style="color:#64748b">يجب أن يكون الحد الأعلى أكبر من السرعة الافتراضية في اتجاه واحد على الأقل، ولا يقل عنها في الاتجاه الآخر.</small>
                            </div>
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

    onPackageTypeChange() {
        const pkgType = document.getElementById('p-package-type')?.value;
        const priceGroup = document.getElementById('p-price-group');
        const costGroup = document.getElementById('p-cost-group');
        const tmplRow = document.getElementById('p-tmpl-row');
        const tmplSelect = document.getElementById('p-tmpl');
        const tmplLabel = document.getElementById('p-tmpl-label');
        const tmplHelp = document.getElementById('p-tmpl-help');
        const priceInput = document.getElementById('p-price');
        const costInput = document.getElementById('p-cost-price');
        const isFree = (pkgType === 'free');

        if (priceGroup) priceGroup.style.display = isFree ? 'none' : '';
        if (costGroup) costGroup.style.display = isFree ? 'none' : '';
        if (tmplRow) tmplRow.style.display = isFree ? 'none' : '';

        if (isFree) {
            if (priceInput) { priceInput.value = 0; priceInput.removeAttribute('required'); }
            if (costInput) { costInput.value = 0; costInput.removeAttribute('required'); }
            if (tmplSelect) { tmplSelect.removeAttribute('required'); }
            if (tmplLabel) tmplLabel.textContent = 'قالب الطباعة المخصص لهذه الباقة (اختياري)';
            if (tmplHelp) tmplHelp.textContent = 'قالب الطباعة اختياري للباقات المجانية.';
        } else {
            if (priceInput) {
                if (parseFloat(priceInput.value) === 0) priceInput.value = '';
                priceInput.setAttribute('required', 'required');
            }
            if (costInput) {
                if (parseFloat(costInput.value) === 0) costInput.value = '';
                costInput.setAttribute('required', 'required');
            }
            if (tmplSelect) {
                tmplSelect.setAttribute('required', 'required');
            }
            if (tmplLabel) tmplLabel.textContent = 'قالب الطباعة المخصص لهذه الباقة *';
            if (tmplHelp) tmplHelp.textContent = 'اختيار القالب إلزامي لكل الباقات المدفوعة.';
        }
    },

    validateProfileCostPrice() {
        const pkgType = document.getElementById('p-package-type')?.value;
        if (pkgType === 'free') return true;
        const priceInput = document.getElementById('p-price');
        const costInput = document.getElementById('p-cost-price');
        const warnEl = document.getElementById('p-cost-warn');
        const price = parseFloat(priceInput?.value) || 0;
        const cost = parseFloat(costInput?.value) || 0;

        if (costInput && price > 0) {
            costInput.max = price;
        }

        if (cost > price && price > 0) {
            if (warnEl) warnEl.style.display = 'block';
            if (costInput) costInput.style.borderColor = '#ef4444';
            return false;
        } else {
            if (warnEl) warnEl.style.display = 'none';
            if (costInput) costInput.style.borderColor = '';
            return true;
        }
    },

    onAllowSpeedChange(val) {
        const grp = document.getElementById('p-max-speed-group');
        if (grp) grp.style.display = (val === '1' || val === 1) ? 'block' : 'none';
        this.refreshProfileMaxSpeedOptions();
    },

    onTransNumChange() {
        const val = parseFloat(document.getElementById('p-trans-num').value) || 0;
        const sel = document.getElementById('p-trans-unit');
        if (val > 0 && sel.value === 'unlimited') {
            sel.value = 'MB';
        } else if (val === 0) {
            sel.value = 'unlimited';
        }
    },

    onTransUnitChange() {
        const sel = document.getElementById('p-trans-unit');
        const numInput = document.getElementById('p-trans-num');
        if (sel.value === 'unlimited') {
            numInput.value = 0;
        } else if (parseFloat(numInput.value) <= 0) {
            numInput.value = sel.value === 'MB' ? 500 : 1;
        }
    },

    onUptimeNumChange() {
        const val = parseFloat(document.getElementById('p-uptime-num').value) || 0;
        const sel = document.getElementById('p-uptime-unit');
        if (val > 0 && sel.value === 'unlimited') {
            sel.value = 'h';
        } else if (val === 0) {
            sel.value = 'unlimited';
        }
    },

    onUptimeUnitChange() {
        const sel = document.getElementById('p-uptime-unit');
        const numInput = document.getElementById('p-uptime-num');
        if (sel.value === 'unlimited') {
            numInput.value = 0;
        } else if (parseFloat(numInput.value) <= 0) {
            numInput.value = sel.value === 'm' ? 30 : 1;
        }
    },

    async saveProfileForm(e) {
        e.preventDefault();

        // Calculate validity
        const vNum = parseInt(document.getElementById('p-val-num').value) || 30;
        const vUnit = document.getElementById('p-val-unit').value || 'd';
        const validity = vNum + vUnit;

        // Calculate transfer_limit in Bytes
        const tNum = parseFloat(document.getElementById('p-trans-num').value) || 0;
        const tUnit = document.getElementById('p-trans-unit').value;
        let transferBytes = 0;
        if (tUnit === 'MB') transferBytes = Math.round(tNum * 1048576);
        else if (tUnit === 'GB') transferBytes = Math.round(tNum * 1073741824);
        else if (tUnit === 'TB') transferBytes = Math.round(tNum * 1099511627776);
        else transferBytes = 0;

        // Calculate uptime_limit in Seconds
        const uNum = parseFloat(document.getElementById('p-uptime-num').value) || 0;
        const uUnit = document.getElementById('p-uptime-unit').value;
        let uptimeSeconds = 0;
        if (uUnit === 'm') uptimeSeconds = Math.round(uNum * 60);
        else if (uUnit === 'h') uptimeSeconds = Math.round(uNum * 3600);
        else if (uUnit === 'd') uptimeSeconds = Math.round(uNum * 86400);
        else if (uUnit === 'mo') uptimeSeconds = Math.round(uNum * 2592000);
        else if (uUnit === 'y') uptimeSeconds = Math.round(uNum * 31536000);
        else uptimeSeconds = 0;

        const allowChangeVal = parseInt(document.getElementById('p-allow-speed')?.value || 0);
        const defaultRate = document.getElementById('p-rate').value || '2M/2M';
        const maxRate = (allowChangeVal === 1) ? (document.getElementById('p-max-speed')?.value || '') : defaultRate;
        const pkgType = document.getElementById('p-package-type')?.value || 'paid';
        const isFreePkg = (pkgType === 'free');
        const rawTmpl = document.getElementById('p-tmpl')?.value || '';
        const templateId = isFreePkg ? (rawTmpl ? parseInt(rawTmpl) || null : null) : (parseInt(rawTmpl) || null);
        if (!isFreePkg && !templateId) return this.toast('يجب اختيار قالب طباعة مخصص لهذه الباقة قبل الحفظ','warning');
        if (allowChangeVal === 1 && !this.rateLimitIsGreater(maxRate, defaultRate)) return this.toast('يجب اختيار أقصى سرعة أعلى من السرعة الافتراضية للباقة','warning');

        const priceVal = isFreePkg ? 0 : (parseFloat(document.getElementById('p-price')?.value) || 0);
        const costVal = isFreePkg ? 0 : (parseFloat(document.getElementById('p-cost-price')?.value) || 0);

        if (!isFreePkg && costVal > priceVal) {
            return this.toast(`⚠️ سعر التوزيع (${costVal}) لا يمكن أن يكون أكبر من سعر البيع للجمهور (${priceVal})`, 'warning');
        }

        const payload = {
            name: document.getElementById('p-name').value,
            mikrotik_group: document.getElementById('p-name').value,
            name_for_users: document.getElementById('p-display').value,
            package_type: pkgType,
            rate_limit: defaultRate,
            price: priceVal,
            retail_price: priceVal,
            cost_price: costVal,
            validity: validity,
            shared_users: document.getElementById('p-shared').value,
            transfer_limit: transferBytes,
            uptime_limit: uptimeSeconds,
            template_id: templateId,
            allow_speed_change: allowChangeVal,
            default_speed: defaultRate,
            max_speed: maxRate
        };

        const returnToImportSourceId = this.returnToUmImportSourceProfileId;
        const returnToImportName = this.returnToUmImportProfileName;
        const returnToImport = (returnToImportSourceId !== undefined && returnToImportSourceId !== null) || (returnToImportName === payload.name && Boolean(this.umImportState?.token));
        this.returnToUmImportSourceProfileId = null;
        this.returnToUmImportProfileName = null;
        const res = await this.api('save_profile', {}, 'POST', payload);
        if (res && res.success) {
            this.toast(this.t('success_saved'), 'success');
            this.closeModal();
            if (returnToImport && this.umImportState) {
                const profileResult = await this.api('get_profiles');
                this.umImportState.profiles = Array.isArray(profileResult) ? profileResult : (profileResult?.data || []);
                if (returnToImportSourceId !== undefined && returnToImportSourceId !== null) {
                    this.umImportState.profileMap[returnToImportSourceId] = payload.name;
                    if (this.umImportState.includedProfiles) {
                        this.umImportState.includedProfiles.add(Number(returnToImportSourceId));
                    }
                }
                this.renderRouterOSImportPage();
            } else {
                this.renderProfiles();
            }
        } else if (res?.error) this.toast(res.error, 'danger');
    },

        async deleteProfile(id, name) {
        if (this.userRole !== 'system_owner' && this.userRole !== 'superadmin') {
            alert('عذراً، صلاحية حذف الباقات مخصصة فقط للمسؤول المالك للنظام (Super Admin)');
            return;
        }
        if (!confirm(`هل تريد حذف تعريف الباقة الفارغة «${name}»؟ لا يمكن حذف أي باقة مرتبطة بكروت.`)) return;
        const res = await this.api('delete_profile', { id });
        if (res && res.success) {
            this.toast(this.t('success_deleted'), 'success');
            this.renderProfiles();
        } else if (res?.error) this.toast(res.error, 'warning');
    },

    // ==========================================
    // ==========================================
    // BATCH GENERATOR (WITH LOCALSTORAGE, PRESETS, DYNAMIC TEMPLATE SHEETS, CONFIRMATION MODAL & DIRECT PRINT)
    // ==========================================
    batchProfilesCache: [],
    batchTemplatesCache: [],
    batchSubCache: null,

    async renderBatchGen() {
        const [profilesRaw, templatesRaw, subRaw, setupRaw] = await Promise.all([
            this.api('get_profiles'),
            this.api('get_templates'),
            this.api('get_current_network_subscription').catch(() => null),
            this.loadNetworkSetup(true).catch(() => null)
        ]);

        const allProfiles = Array.isArray(profilesRaw) ? profilesRaw : (profilesRaw?.profiles || profilesRaw?.data || []);
        // Strictly exclude free profiles from card batch generator
        const profiles = allProfiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-')));
        const templates = Array.isArray(templatesRaw) ? templatesRaw : (templatesRaw?.data || []);

        this.batchProfilesCache = profiles;
        this.batchTemplatesCache = templates;
        this.batchSubCache = subRaw;

        // Restore saved settings from localStorage
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('um_batch_gen_settings_'+this.activeNetworkId+'_'+this.user) || '{}');
        } catch (e) {}

        const initialProf = saved.profile || (profiles[0]?.name || '');
        const initialCount = parseInt(saved.count) || 50;
        const initialLength = parseInt(saved.length) || 8;
        const initialPrefix = saved.prefix !== undefined ? saved.prefix : (this.suggestPrefixForProfile(initialProf));
        const initialChars = saved.char_type || 'digits';
        const initialPassMode = ({same:'same',username_only:'empty',different:'different'})[setupRaw?.network?.auth_mode] || 'same';
        const initialPassLength = parseInt(saved.pass_length) || 8;
        const initialComment = saved.comment || '';

        const PB = window.SamUI?.PageBuilder;

        const actions = [
            { label: '👥 المشتركون والكروت', variant: 'secondary', onclick: "App.switchTab('users')" },
            { label: '🏬 مخازن الكروت', variant: 'secondary', onclick: "App.switchTab('card_warehouses')" },
            { label: '⟳ إعادة تعيين', variant: 'secondary', onclick: 'App.renderBatchGen()' }
        ];

        const formHtml = `
        <div style="max-width: 960px; margin: 0 auto; width: 100%; padding-bottom: 24px;">
            <div class="sam-card mt-card" style="background:var(--sam-bg-surface, var(--bg-window, #fff)); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:24px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                <form onsubmit="App.executeBatchGen(event)">
                    <!-- Profile Selection & Template Info -->
                    <div class="form-row" style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                        <div class="form-group" style="flex:2; min-width:260px;">
                            <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block;">📦 باقة وسرعة الخدمة (Profile) *</label>
                            <select id="bg-prof" class="sam-select mt-select" style="width:100%; font-weight:bold; font-size:13px;" required onchange="App.onBatchProfileChange(this.value)">
                                <option value="">-- اختر الباقة المستهدفة للتوليد --</option>
                                ${profiles.map(p => `
                                    <option value="${p.name}" ${initialProf === p.name ? 'selected' : ''} data-price="${p.price}" data-template="${p.template_id || ''}">
                                        💳 ${this.escape(p.name_for_users || p.name)} (${p.price} ${App.getCurrencySymbol(App._baseCurrency)}) - [${App.formatBytes(p.transfer_limit) || 'مفتوح'}]
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="flex:1; min-width:180px;">
                            <label style="font-weight:700; font-size:13px; margin-bottom:6px; display:block;">بادئة الكرت (Prefix) [أرقام فقط بحد أقصى 4]</label>
                            <input type="text" id="bg-prefix" class="sam-input mt-input" style="width:100%; font-weight:bold;" value="${this.escape(initialPrefix)}" placeholder="مثال: 7701 أو 61" maxlength="4" pattern="[0-9]*" inputmode="numeric" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4)" />
                        </div>
                    </div>

                    <!-- Template & Live Sheets Calculation Badge -->
                    <div id="bg-sheet-calc-box" style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div>
                            <span style="font-size:12.5px; color:#166534;">📄 <b>قالب الطباعة وتوزيع الورقة:</b> <span id="bg-tmpl-name" style="font-weight:bold; color:#0f172a;">القالب القياسي (20 كرت/A4)</span></span>
                        </div>
                        <div>
                            <span style="font-size:13px; font-weight:800; color:#15803d;">عدد أوراق A4 المطلوبة: <span id="bg-sheets-badge" style="background:#15803d; color:#fff; padding:2px 10px; border-radius:6px;">1 ورقة</span></span>
                        </div>
                    </div>

                    <!-- Financial Gross Amount & Custody Summary Box -->
                    <div id="bg-financial-custody-box" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px 18px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                        <div style="flex:1; min-width:200px;">
                            <div style="font-size:11.5px; color:#1e40af; font-weight:700;">💰 القيمة المالية الإجمالية للدفعة:</div>
                            <div style="font-size:20px; font-weight:800; color:#1d4ed8; margin:3px 0;" id="bg-total-gross-val">0.00 ${App.getCurrencySymbol(App._baseCurrency)}</div>
                            <div style="font-size:11px; color:#64748b;" id="bg-unit-price-hint">سعر الكرت الواحد: 0 ${App.getCurrencySymbol(App._baseCurrency)}</div>
                        </div>
                        <div style="flex:1; min-width:220px; border-right: 1px solid #cbd5e1; padding-right:14px;">
                            <div style="font-size:11.5px; color:#1e40af; font-weight:700;">🏢 قيد العهدة والمخزن:</div>
                            <div style="font-size:14px; font-weight:800; color:#0f172a; margin:3px 0;" id="bg-admin-custody-val">${this.escape(this.userFullname || this.user || 'المسؤول الحالي')}</div>
                            <div style="font-size:11px; color:#059669;">📦 تقيد كروت معطلة بحسابك حتى البيع</div>
                        </div>
                        <div style="flex:1; min-width:180px; border-right: 1px solid #cbd5e1; padding-right:14px;">
                            <div style="font-size:11.5px; color:#1e40af; font-weight:700;">📄 تسلسل الأوراق المتوقع:</div>
                            <div style="font-size:13.5px; font-weight:700; color:#0f172a; margin:3px 0;" id="bg-expected-sheets-val">يبدأ من الورقة التالية</div>
                            <div style="font-size:11px; color:#64748b;">أرقام صفحات مستمرة 000001+</div>
                        </div>
                    </div>

                    <!-- Quantity Presets & Sheets Count -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                            <label style="font-weight:700; font-size:13px; color:#1e293b;">📄 كمية أوراق A4 المطلوب طباعتها:</label>
                            <span style="font-size:11.5px; color:#0369a1; font-weight:bold;" id="bg-sheets-quota-hint">سقف الطباعة: حتى 100 ورقة (وحسب سقف الشبكة)</span>
                        </div>
                        
                        <!-- Quick Quantity Chips (Sheets Only) -->
                        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                            <span style="font-size:11px; font-weight:bold; align-self:center; color:#475569;">عدد الأوراق:</span>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(1)">1 ورقة A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(2)">2 ورقة A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(3)">3 ورقات A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(5)">5 ورقات A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(10)">10 ورقات A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(20)">20 ورقة A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(50)">50 ورقة A4</button>
                            <button type="button" class="sam-btn sam-btn--sm sam-btn--info" style="padding:4px 12px; font-size:12px; font-weight:700;" onclick="App.setBatchPresetSheets(100)">100 ورقة A4</button>
                        </div>

                        <div class="form-row" style="display:flex; gap:16px; margin-bottom:0;">
                            <div class="form-group" style="flex:1;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <label style="font-weight:700; margin-bottom:0; display:block;">عدد أوراق A4 (Sheets) [أرقام عشرية فقط بحد أقصى 100] *</label>
                                    <span style="font-size:11px; color:#15803d; font-weight:700;" id="bg-sheets-max-badge">الحد الأقصى المتاح: 100 ورقة</span>
                                </div>
                                <input type="text" inputmode="numeric" pattern="[0-9]*" id="bg-sheets-input" class="sam-input mt-input" style="width:100%; font-weight:800; font-size:16px; color:#15803d;" value="1" maxlength="3" oninput="App.onBatchSheetsInput(this)" onblur="App.onBatchSheetsBlur(this)" required />
                                <input type="hidden" id="bg-count" value="60" />
                            </div>
                        </div>
                    </div>

                    <!-- Card Specs: Length, Characters, Password Mode -->
                    <div class="form-row" style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
                        <div class="form-group" style="flex:1; min-width:160px;">
                            <label style="font-weight:700; margin-bottom:6px; display:block;">طول الكرت (الافتراضي 8) [أرقام عشرية فقط]</label>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="bg-length" class="sam-input mt-input" style="width:100%; font-weight:bold;" value="${initialLength}" maxlength="2" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 2)" onblur="if(!this.value || parseInt(this.value) < 3) this.value = '8'; if(parseInt(this.value) > 16) this.value = '16';" required />
                        </div>
                        <div class="form-group" style="flex:1; min-width:200px;">
                            <label style="font-weight:700; margin-bottom:6px; display:block;">نوع الرموز (Character Set)</label>
                            <select id="bg-chars" class="sam-select mt-select" style="width:100%">
                                <option value="digits" ${initialChars === 'digits' ? 'selected' : ''}>أرقام فقط (0-9) [موصى به]</option>
                                <option value="alphanumeric" ${initialChars === 'alphanumeric' ? 'selected' : ''}>أرقام وحروف صغيرة بدون تشابه</option>
                                <option value="uppercase" ${initialChars === 'uppercase' ? 'selected' : ''}>أرقام وحروف كبيرة (A-Z, 0-9)</option>
                                <option value="mixed" ${initialChars === 'mixed' ? 'selected' : ''}>مختلط (حروف كبيرة وصغيرة وأرقام)</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1; min-width:220px;">
                            <label style="font-weight:700; margin-bottom:6px; display:block;">نظام كلمة المرور (Password Mode)</label>
                            <select disabled title="يعتمد على نمط دخول الكروت المحدد للشبكة" id="bg-pass-mode" class="sam-select mt-select" style="width:100%" onchange="App.onBatchPassModeChange(this.value)">
                                <option value="same" ${initialPassMode === 'same' ? 'selected' : ''}>اسم وكلمة سر متطابقان (Same) [افتراضي]</option>
                                <option value="empty" ${initialPassMode === 'empty' ? 'selected' : ''}>بدون كلمة سر (فارغة)</option>
                                <option value="different" ${initialPassMode === 'different' ? 'selected' : ''}>اسم وكلمة سر مختلفان (Different)</option>
                            </select>
                        </div>
                    </div>

                    <!-- Hidden Password Length (Only when mode = different) -->
                    <div class="form-row" id="bg-pass-length-group" style="${initialPassMode === 'different' ? 'display:flex;' : 'display:none;'} margin-bottom:16px;">
                        <div class="form-group" style="width:100%;">
                            <label style="font-weight:700; margin-bottom:6px; display:block;">طول كلمة المرور المنفصلة (Password Length - عدد الخانات) [أرقام عشرية فقط]</label>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="bg-pass-length" class="sam-input mt-input" style="width:100%" value="${initialPassLength}" maxlength="2" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 2)" onblur="if(!this.value || parseInt(this.value) < 3) this.value = '8'; if(parseInt(this.value) > 16) this.value = '16';" />
                            <small class="text-muted" style="font-size:11px; color:#64748b;">يحدد طول كلمة السر عند اختيار كروت باسم مستخدم وكلمة مرور منفصلين (أرقام فقط من 3 إلى 16).</small>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:20px;">
                        <label style="margin-bottom:6px; display:block; font-weight:600;">ملاحظات الدفعة (اختياري)</label>
                        <input type="text" id="bg-comment" class="sam-input mt-input" style="width:100%" value="${this.escape(initialComment)}" placeholder="إذا تركت فارغة سيتم تسجيل: تم التوليد بواسطة ${this.escape(this.userFullname || this.user || 'المسؤول')}" />
                    </div>

                    <!-- Action Button -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:8px; border-top:1px solid var(--sam-border, #e2e8f0);">
                        <button type="submit" class="sam-btn sam-btn--primary" style="padding:11px 26px; font-size:14px; font-weight:700; box-shadow:0 4px 12px rgba(2,132,199,0.3);">
                            ⚡ بدء توليد الكروت وطباعتها الآن
                        </button>
                        <span style="font-size:11.5px; color:#64748b;">
                            🔒 الترقيم التسلسلي للصفحات عالمي ومستمر (000001 حتى ما لا نهاية)
                        </span>
                    </div>
                </form>
            </div>
            
            <div id="batch-result" style="margin-top:20px;"></div>
        </div>`;

        const shell = PB ? PB.renderShell({
            id: 'batch-generator',
            archetype: 'pos',
            title: 'توليد وطباعة الكروت بالدفعات',
            subtitle: 'إعداد دفعات الكروت، البادئات، وربط قوالب الطباعة وحساب قيمة توزيع الأوراق والعهدة',
            eyebrow: 'إدارة الكروت والمبيعات',
            icon: '⚡',
            actions,
            content: formHtml
        }) : `<div class="mt-page">${formHtml}</div>`;

        document.getElementById('main-view').innerHTML = shell;
        window.SamPageShell?.sync();

        this.onBatchProfileChange(initialProf);
    },

    suggestPrefixForProfile(profName) {
        if (!profName) return '';
        const match = profName.match(/[0-9]+/);
        if (match) return match[0].slice(0, 4);
        return '';
    },

    getCardsPerSheetForProfile(profName) {
        const prof = this.batchProfilesCache.find(p => p.name === profName);
        let tmpl = null;
        if (prof?.template_id) {
            tmpl = this.batchTemplatesCache.find(t => t.id == prof.template_id);
        }
        if (!tmpl && Number(this.networkSetupState?.network_id)===Number(this.activeNetworkId)) {
            tmpl=this.batchTemplatesCache.find(t=>Number(t.id)===Number(this.networkSetupState?.default_template_id));
        }
        if (!tmpl && this.batchTemplatesCache.length > 0) {
            tmpl = this.batchTemplatesCache[0];
        }

        const cols = tmpl?.grid_cols || 4;
        const rows = tmpl?.grid_rows || 15;
        const cardsPerSheet = cols * rows;

        return {
            template: tmpl,
            templateName: tmpl?.name || 'القالب الافتراضي (60 كرت)',
            cols: cols,
            rows: rows,
            cardsPerSheet: cardsPerSheet || 60
        };
    },

    getBatchMaxAllowedSheets() {
        let maxSheets = 100;
        const sub = this.batchSubCache;
        if (sub && sub.subscription) {
            const dailyLimit = parseInt(sub.subscription.daily_card_limit) || 0;
            const consumed = parseInt(sub.usage?.cards_total) || 0;
            if (dailyLimit > 0) {
                const remainingCards = Math.max(0, dailyLimit - consumed);
                const profName = document.getElementById('bg-prof')?.value;
                const info = this.getCardsPerSheetForProfile(profName);
                const quotaSheets = Math.floor(remainingCards / (info.cardsPerSheet || 60));
                maxSheets = Math.max(1, Math.min(100, quotaSheets));
            }
        }
        return maxSheets;
    },

    onBatchSheetsInput(input) {
        let val = input.value.replace(/[^0-9]/g, '');
        if (val !== '') {
            let num = parseInt(val, 10);
            const maxAllowed = this.getBatchMaxAllowedSheets();
            if (num > maxAllowed) {
                num = maxAllowed;
                this.toast(`الحد الأقصى المسموح لعدد الصفحات هو (${maxAllowed} ورقة A4) حسب سقف الشبكة`, 'warning');
            }
            val = String(num);
        }
        input.value = val;
        this.calcBatchCardsFromSheets(val || 1);
    },

    onBatchSheetsBlur(input) {
        let val = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
        const maxAllowed = this.getBatchMaxAllowedSheets();
        if (!val || val < 1) val = 1;
        if (val > maxAllowed) val = maxAllowed;
        input.value = val;
        this.calcBatchCardsFromSheets(val);
    },

    updateBatchLiveSummary() {
        const profName = document.getElementById('bg-prof')?.value;
        const prof = this.batchProfilesCache?.find(p => p.name === profName);
        const count = parseInt(document.getElementById('bg-count')?.value) || 0;
        const unitPrice = parseFloat(prof?.price) || 0;
        const costPrice = parseFloat(prof?.cost_price !== undefined ? prof?.cost_price : prof?.price) || unitPrice;
        const totalGross = count * unitPrice;
        const totalCost = count * costPrice;

        const info = this.getCardsPerSheetForProfile(profName);
        const sheets = Math.ceil(count / info.cardsPerSheet) || 1;

        const totalGrossEl = document.getElementById('bg-total-gross-val');
        if (totalGrossEl) {
            totalGrossEl.innerText = `${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${App.getCurrencySymbol(App._baseCurrency)}`;
        }

        const unitPriceHintEl = document.getElementById('bg-unit-price-hint');
        if (unitPriceHintEl) {
            unitPriceHintEl.innerHTML = `سعر البيع: <b>${unitPrice.toLocaleString()}</b> • سعر التوزيع: <b>${costPrice.toLocaleString()} ${App.getCurrencySymbol(App._baseCurrency)}</b> (إجمالي سعر التوزيع: <b>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>)`;
        }

        const tmplNameEl = document.getElementById('bg-tmpl-name');
        if (tmplNameEl) {
            tmplNameEl.innerText = `${info.templateName} (${info.cols}×${info.rows} = ${info.cardsPerSheet} كرت/ورقة A4)`;
        }

        const badge = document.getElementById('bg-sheets-badge');
        if (badge) {
            badge.innerText = `${sheets} ورقة A4 (${count} كرت)`;
        }

        const maxBadge = document.getElementById('bg-sheets-max-badge');
        if (maxBadge) {
            const maxAllowed = this.getBatchMaxAllowedSheets();
            maxBadge.innerText = `الحد الأقصى المتاح: ${maxAllowed} ورقة`;
        }
    },

    onBatchProfileChange(profName) {
        const prof = this.batchProfilesCache.find(p => p.name === profName);
        const prefixInput = document.getElementById('bg-prefix');
        if (prefixInput && (!prefixInput.value || prefixInput.value.trim() === '')) {
            prefixInput.value = this.suggestPrefixForProfile(profName);
        }

        const sheets = parseInt(document.getElementById('bg-sheets-input')?.value) || 1;
        this.calcBatchCardsFromSheets(sheets);
    },

    setBatchPresetQty(qty) {
        const profName = document.getElementById('bg-prof')?.value;
        const info = this.getCardsPerSheetForProfile(profName);
        const sheets = Math.ceil(qty / info.cardsPerSheet) || 1;
        this.setBatchPresetSheets(sheets);
    },

    setBatchPresetSheets(sheets) {
        sheets = parseInt(sheets) || 1;
        const maxAllowed = this.getBatchMaxAllowedSheets();
        if (sheets > maxAllowed) {
            sheets = maxAllowed;
            this.toast(`تم ضبط الكمية على الحد الأقصى المسموح (${maxAllowed} ورقة A4)`, 'warning');
        }
        const sheetsInput = document.getElementById('bg-sheets-input');
        if (sheetsInput) sheetsInput.value = sheets;
        this.calcBatchCardsFromSheets(sheets);
    },

    calcBatchSheetsFromCards(count) {
        count = parseInt(count) || 0;
        const profName = document.getElementById('bg-prof')?.value;
        const info = this.getCardsPerSheetForProfile(profName);
        let sheets = Math.ceil(count / info.cardsPerSheet) || 1;
        const maxAllowed = this.getBatchMaxAllowedSheets();
        if (sheets > maxAllowed) sheets = maxAllowed;

        const sheetsInput = document.getElementById('bg-sheets-input');
        if (sheetsInput && document.activeElement !== sheetsInput) {
            sheetsInput.value = sheets;
        }

        this.updateBatchLiveSummary();
    },

    calcBatchCardsFromSheets(sheets) {
        sheets = parseInt(sheets) || 1;
        const maxAllowed = this.getBatchMaxAllowedSheets();
        if (sheets > maxAllowed) sheets = maxAllowed;
        if (sheets < 1) sheets = 1;
        const profName = document.getElementById('bg-prof')?.value;
        const info = this.getCardsPerSheetForProfile(profName);
        const totalCards = sheets * info.cardsPerSheet;

        const countInput = document.getElementById('bg-count');
        if (countInput) {
            countInput.value = totalCards;
        }

        this.updateBatchLiveSummary();
    },

    onBatchPassModeChange(mode) {
        const grp = document.getElementById('bg-pass-length-group');
        if (grp) {
            grp.style.display = (mode === 'different') ? 'flex' : 'none';
        }
    },

    // Step 1: Trigger confirmation modal with full batch specs
    async executeBatchGen(e) {
        e.preventDefault();
        const profName = document.getElementById('bg-prof').value;
        if (!profName) return this.toast('يرجى اختيار الباقة', 'warning');

        const passMode = document.getElementById('bg-pass-mode').value;
        const passLength = (passMode === 'different') ? (parseInt(document.getElementById('bg-pass-length').value) || 8) : 0;
        let sheets = parseInt(document.getElementById('bg-sheets-input').value) || 1;
        const maxAllowed = this.getBatchMaxAllowedSheets();
        if (sheets > maxAllowed) {
            return this.toast(`لا يمكن توليد أكثر من ${maxAllowed} ورقة A4 (الحد الأقصى 100 ورقة وحسب سقف الشبكة)`, 'warning');
        }
        if (sheets < 1) sheets = 1;

        const prof = this.batchProfilesCache.find(p => p.name === profName);
        const info = this.getCardsPerSheetForProfile(profName);
        const count = sheets * info.cardsPerSheet;
        const countInput = document.getElementById('bg-count');
        if (countInput) countInput.value = count;

        const rawPrefix = document.getElementById('bg-prefix').value.trim();
        const prefix = rawPrefix.replace(/[^0-9]/g, '').slice(0, 4);
        document.getElementById('bg-prefix').value = prefix;

        const length = parseInt(document.getElementById('bg-length').value) || 8;
        const charType = document.getElementById('bg-chars').value;
        
        const rawComment = document.getElementById('bg-comment').value.trim();
        const defaultAdminName = this.userFullname || this.user || 'المسؤول';
        const comment = rawComment || `تم التوليد بواسطة ${defaultAdminName}`;
        const totalSheets = sheets;

        const payload = {
            count,
            profile: profName,
            prefix,
            length,
            char_type: charType,
            pass_mode: passMode,
            pass_length: passLength,
            comment,
            cards_per_sheet: info.cardsPerSheet
        };

        // Save current settings to localStorage for future batch generations
        localStorage.setItem('um_batch_gen_settings_'+this.activeNetworkId+'_'+this.user, JSON.stringify({
            profile: profName,
            count,
            prefix,
            length,
            char_type: charType,
            pass_mode: passMode,
            pass_length: passLength,
            comment: rawComment
        }));

        this.showBatchConfirmationModal(payload, prof, info, totalSheets);
    },

    // Step 2: Show confirmation modal
    showBatchConfirmationModal(payload, prof, info, totalSheets) {
        const passModeLabels = {
            'same': 'اسم وكلمة مرور متطابقان (Same as username)',
            'empty': 'بدون كلمة سر (فارغة)',
            'different': `اسم وكلمة سر منفصلان (طول كلمة السر: ${payload.pass_length} خانات)`
        };

        const charLabels = {
            'digits': 'أرقام فقط (0-9)',
            'alphanumeric': 'أرقام وحروف صغيرة بدون تشابه',
            'uppercase': 'أرقام وحروف كبيرة',
            'mixed': 'حروف كبيرة وصغيرة وأرقام'
        };

        const unitPrice = parseFloat(prof?.price) || 0;
        const totalGrossAmount = payload.count * unitPrice;

        let modal = document.getElementById('modal-container');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-container';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:580px; max-height:92vh;">
                <div class="mt-modal-header">
                    <span>🖨️ تأكيد بيانات طباعة الدفعة</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <div class="mt-modal-body" style="padding:16px 20px;">
                    
                    <div style="text-align:center; margin-bottom:14px;">
                        <div style="font-size:18px; font-weight:800; color:#0284c7;">
                            هل ترغب في تأكيد توليد ${payload.count.toLocaleString()} كرت؟
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">
                            سيتم إنشاء الكروت وترقيم أوراقها تسلسلياً وفتح شاشة الطباعة A4 فوراً
                        </div>
                    </div>

                    <table class="mt-table" style="font-size:12px; margin-bottom:14px;">
                        <tbody>
                            <tr>
                                <td style="width:160px; font-weight:bold; background:#f8fafc;">الباقة وسعر الكرت:</td>
                                <td><b>${this.escape(prof?.name_for_users || payload.profile)}</b> (${unitPrice} YER)</td>
                            </tr>
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">الكمية والأوراق:</td>
                                <td><b style="color:#0284c7; font-size:13px;">${payload.count.toLocaleString()} كرت</b> (${totalSheets} ورقة A4)</td>
                            </tr>
                            <tr style="background:#f0fdf4;">
                                <td style="font-weight:bold; color:#15803d;">💰 إجمالي قيمة الدفعة:</td>
                                <td><b style="color:#15803d; font-size:14px;">${totalGrossAmount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} ${App.getCurrencySymbol(App._baseCurrency)}</b> (سعر الكرت: ${unitPrice} YER)</td>
                            </tr>
                            <tr style="background:#eff6ff;">
                                <td style="font-weight:bold; color:#1e40af;">🏢 قيد العهدة والمخزن:</td>
                                <td><b style="color:#1d4ed8;">${this.escape(this.userFullname || this.user || 'المسؤول الحالي')}</b> (تضاف الكروت كعهدة مخزنية بحسابك بحالة معطلة حتى البيع)</td>
                            </tr>
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">قالب وتوزيع الطباعة:</td>
                                <td>${info.templateName} (${info.cols} أعمدة × ${info.rows} صفوف = ${info.cardsPerSheet} كرت/ورقة)</td>
                            </tr>
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">طول الكرت والبادئة:</td>
                                <td>طول الكرت: <b>${payload.length} خانات</b> ${payload.prefix ? `| البادئة: <code>${this.escape(payload.prefix)}</code>` : ''}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">نوع الرموز:</td>
                                <td>${charLabels[payload.char_type] || payload.char_type}</td>
                            </tr>
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">نظام كلمة المرور:</td>
                                <td>${passModeLabels[payload.pass_mode] || payload.pass_mode}</td>
                            </tr>
                            ${payload.comment ? `
                            <tr>
                                <td style="font-weight:bold; background:#f8fafc;">ملاحظات الدفعة:</td>
                                <td>${this.escape(payload.comment)}</td>
                            </tr>
                            ` : ''}
                        </tbody>
                    </table>

                    <!-- Security Alert -->
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:10px 12px; font-size:11.5px; color:#92400e; display:flex; align-items:flex-start; gap:8px;">
                        <span style="font-size:16px;">⚠️</span>
                        <div>
                            <b>حالة الكروت عند التوليد:</b> ستُنشأ الكروت في حالة معطلة (<code>Reject</code>) وتُسجل في عهدة مخزنك مع أرقام صفحات تسلسلية مستمرة، وتفتح معاينة الطباعة فوراً.
                        </div>
                    </div>

                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>
                    <button type="button" class="mt-btn mt-btn-success" style="font-weight:bold; font-size:13px; padding:8px 20px;" onclick='App.confirmExecuteBatchGen(${JSON.stringify(payload).replace(/'/g, "&#39;")})'>
                        ✅ تأكيد التوليد والبدء في الطباعة
                    </button>
                </div>
            </div>
        </div>
        `;
    },

    // Step 3: Execute API generation and open direct A4 print preview
    async confirmExecuteBatchGen(payload) {
        this.closeModal();
        this.toast('جاري توليد الكروت في قاعدة البيانات وإدراج قيود FreeRADIUS...', 'info');

        const res = await this.api('generate_batch', {}, 'POST', payload);
        if (res && res.success) {
            this.toast(res.message || this.t('success_gen'), 'success');
            
            const linkedTemplate = await this.api('get_template_for_profile', { profile: payload.profile });
            res.template = linkedTemplate;
            res.profile = payload.profile;
            this.lastGeneratedBatch = res;

            // Prepare print metadata
            const meta = {
                batchId: res.batch_id,
                profileName: payload.profile,
                count: res.count,
                totalSheets: res.total_sheets,
                startSheetNo: res.start_sheet_no,
                endSheetNo: res.end_sheet_no,
                unitPrice: res.unit_price || 0,
                totalAmount: res.total_amount || 0,
                date: new Date().toISOString().slice(0, 10),
                printedBy: this.userFullname || this.user || 'المسؤول'
            };

            // Directly open the standard print preview modal
            if (res.vouchers && res.vouchers.length > 0) {
                await this.printVouchersList(res.vouchers, linkedTemplate || null, meta);
            } else {
                this._cachedUserFilters = false; // Refresh dropdown caches on next render
            this.toast('تم توليد الكروت، اضغط على زر فتح شاشة الطباعة للبدء', 'info');
            }

            // Also render batch result in view behind modal
            const batchResultBox = document.getElementById('batch-result');
            if (batchResultBox) {
                batchResultBox.innerHTML = `
                <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:8px; padding:16px; margin-top:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                        <div>
                            <span style="font-weight:bold; font-size:14px; color:#15803d;">✅ تم توليد ${res.count} كرت بنجاح (الدفعة: ${res.batch_id})</span>
                            <div style="font-size:12px; color:#64748b; margin-top:4px;">
                                📄 الأوراق التسلسلية: من (<b>${res.start_sheet_formatted}</b>) إلى (<b>${res.end_sheet_formatted}</b>) — إجمالي ${res.total_sheets} ورقة A4
                            </div>
                            <div style="font-size:12px; color:#1e40af; margin-top:3px; font-weight:700;">
                                💰 إجمالي قيمة الدفعة: ${Number(res.total_amount || 0).toLocaleString()} ${App.getCurrencySymbol(App._baseCurrency)} (سعر الكرت: ${res.unit_price || 0} YER) | 🏢 قيدت في عهدة ومخزن: ${this.escape(this.userFullname || this.user || 'المسؤول')}
                            </div>
                        </div>
                        <button class="mt-btn mt-btn-success" style="font-weight:700; font-size:12px; padding:6px 14px;" onclick="App.printLastGeneratedBatch()">
                            🖨️ إعادة فتح شاشة الطباعة A4
                        </button>
                    </div>
                </div>
                `;
            }
        } else {
            this.toast(res?.error || 'فشل توليد الكروت', 'danger');
        }
    },
    // PORT & ROUTER SALES & BANDWIDTH ANALYTICS
    // ==========================================
});

