/* POS-specific dashboard: dynamic multi-network affiliation, card batch requests, invitations, and ledger */
(function(){
'use strict'; if(!window.App)return;
const fallback=App.renderDashboard;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString('ar-YE',{maximumFractionDigits:2});
const m=v=>`${n(v)} <small>ر.ي</small>`;
const state={data:null,section:'overview',networks:[],invitations:[],cardRequests:[],profiles:[]};
const metric=(label,value,icon,tone,note='')=>`<article class="pos-kpi ${tone}"><span>${icon}</span><p>${esc(label)}</p><b>${value}</b><small>${esc(note)}</small></article>`;

function tabs(){
    const invBadge = (state.invitations && state.invitations.length > 0) ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-right:4px;">${state.invitations.length}</span>` : '';
    return `<nav class="pos-tabs">
        <button data-section="overview" class="${state.section==='overview'?'active':''}">نظرة عامة</button>
        <button data-section="networks" class="${state.section==='networks'?'active':''}">🌐 الشبكات والارتباط ${invBadge}</button>
        <button data-section="card_requests" class="${state.section==='card_requests'?'active':''}">🎟️ طلب كروت وباقات</button>
        <button data-section="statement" class="${state.section==='statement'?'active':''}">كشف الحساب</button>
        <button data-section="cards" class="${state.section==='cards'?'active':''}">الكروت والمخزون</button>
        <button data-section="network" class="${state.section==='network'?'active':''}">الشبكة الحالية</button>
    </nav>`;
}

function invitationsBanner(){
    if(!state.invitations || state.invitations.length === 0) return '';
    return `<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 12px rgba(217,119,6,0.08);">
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">🔔</span>
            <div>
                <h4 style="margin:0;font-size:15px;color:#92400e;font-weight:800;">دعوات اعتماد شبكات جديدة وتأكيد المديونية</h4>
                <p style="margin:2px 0 0;font-size:12px;color:#b45309;">تمت إضافتك أو دعوتك كنقطة بيع لدى شبكات أخرى. يرجى مراجعة البيانات والمديونية السابقة لتأكيد الربط.</p>
            </div>
        </div>
        ${state.invitations.map(inv => `
            <div style="background:#ffffff;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                    <div style="font-weight:800;font-size:14px;color:#0f172a;">🌐 شبكة: ${esc(inv.network_name)} <small style="color:#64748b;">(${esc(inv.network_code)})</small></div>
                    <div style="font-size:12px;color:#475569;display:flex;gap:14px;margin-top:4px;flex-wrap:wrap;">
                        <span>📌 الخصم الممنوح: <b>${n(inv.discount_rate)}%</b></span>
                        <span>💳 الحد الائتماني: <b>${m(inv.credit_limit)}</b></span>
                        <span style="color:#dc2626;font-weight:700;">📉 المديونية السابقة: <b>${m(inv.opening_debt)}</b></span>
                        ${Number(inv.opening_balance) > 0 ? `<span style="color:#16a34a;font-weight:700;">💰 الرصيد الافتتاحي: <b>${m(inv.opening_balance)}</b></span>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="mt-btn mt-btn-success" style="font-size:12px;padding:6px 14px;" onclick="App.posConfirmInvitation(${inv.id}, 'accept', '${esc(inv.network_name)}', ${Number(inv.opening_debt)})">✓ تأكيد البيانات وقبول الربط</button>
                    <button class="mt-btn mt-btn-danger" style="font-size:12px;padding:6px 14px;" onclick="App.posConfirmInvitation(${inv.id}, 'reject')">✕ رفض</button>
                </div>
            </div>
        `).join('')}
    </div>`;
}

function overview(d){
    const a=d.account,c=d.cards;
    return `
    ${invitationsBanner()}
    <section class="pos-kpis">
        ${metric('الرصيد المتاح',m(a.available_balance),'◉','green','القابل للاستخدام')}
        ${metric('المديونية',m(a.debt),'↙','orange','المستحق للشبكة')}
        ${metric('المتاح الائتماني',m(a.credit_available),'▣','blue',`من حد ${n(a.credit_limit)}`)}
        ${metric('رصيد الشحن الفوري',m(d.instant_balance),'ϟ','purple','الرصيد غير المنتهي')}
        ${metric('مخزون الكروت',n(c.stock),'◇','cyan','كرت جاهز')}
        ${metric('مبيعات اليوم',m(c.sales_today),'↗','pink',`${n(c.sold_today)} كرت`)}
    </section>
    <section class="pos-overview-grid">
        <div class="pos-card">
            <div class="pos-card-head">
                <div><h3>وضع الحساب مع الشبكة</h3><p>ملخص مالي واضح للحساب الحالي</p></div>
                <button onclick="App.posSetSection('statement')">كشف كامل</button>
            </div>
            <div class="pos-account-bars">
                <div>
                    <span>نسبة استخدام الائتمان</span>
                    <b>${a.credit_limit>0?Math.min(100,Math.round(a.debt/a.credit_limit*100)):0}%</b>
                    <progress max="100" value="${a.credit_limit>0?Math.min(100,a.debt/a.credit_limit*100):0}"></progress>
                </div>
                <dl>
                    <div><dt>الرصيد الدفتري</dt><dd>${m(a.balance)}</dd></div>
                    <div><dt>رصيد المحفظة</dt><dd>${m(a.wallet_balance)}</dd></div>
                    <div><dt>نسبة الخصم</dt><dd>${n(a.discount_rate)}%</dd></div>
                </dl>
            </div>
        </div>
        ${networkCard(d)}
        <div class="pos-card pos-actions">
            <div class="pos-card-head"><div><h3>عمليات سريعة</h3><p>العمليات المتاحة لنقطة البيع</p></div></div>
            <button onclick="App.posSetSection('card_requests')"><i>🎟️</i><span><b>طلب كروت وباقات</b><small>طلب صفحات كروت بالباقة والكمية</small></span></button>
            <button onclick="App.posShowTopupModal()"><i>ϟ</i><span><b>طلب رصيد فوري</b><small>شحن محفظة الرصيد الفوري</small></span></button>
            <button onclick="App.posSetSection('networks')"><i>🌐</i><span><b>الشبكات والارتباط</b><small>الانضمام لشبكات أخرى والتبديل</small></span></button>
            <button onclick="App.switchTab('sales')"><i>＋</i><span><b>بيع كرت</b><small>إصدار فاتورة وتسليم الكرت</small></span></button>
        </div>
    </section>`;
}

function networks(d){
    const nets = state.networks || [];
    return `
    ${invitationsBanner()}
    <section class="pos-card pos-section">
        <div class="pos-card-head">
            <div>
                <h3>🌐 الشبكات والارتباط متعدد الشبكات</h3>
                <p>إدارة ارتباط نقطة البيع بالشبكات والاطلاع على الأرصدة والمديونيات في كل شبكة</p>
            </div>
            <button class="mt-btn mt-btn-primary" onclick="App.posRefreshNetworks()">⟳ تحديث القائمة</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px;margin-top:16px;">
            ${nets.map(net => {
                const isConn = net.is_connected;
                const isAct = net.is_active_context;
                const req = net.latest_request;
                const isPending = req && req.status === 'pending';
                return `
                <div style="background:#ffffff;border:1px solid ${isAct ? 'var(--primary, #0284c7)' : '#e2e8f0'};border-radius:12px;padding:16px;position:relative;display:flex;flex-direction:column;justify-content:space-between;box-shadow:${isAct ? '0 0 0 2px rgba(2,132,199,0.2)' : 'none'};">
                    ${isAct ? '<span style="position:absolute;top:12px;left:12px;background:#0284c7;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;">الشبكة النشطة حالياً</span>' : ''}
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="width:12px;height:12px;border-radius:50%;background:${esc(net.theme_color||'#0284c7')};"></span>
                            <h4 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${esc(net.name)}</h4>
                            <span style="font-size:12px;color:#64748b;font-family:monospace;">${esc(net.code)}</span>
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-bottom:12px;">📍 ${esc(net.location||'الموقع غير محدد')}</div>
                        
                        ${isConn ? `
                            <div style="background:#f8fafc;border-radius:8px;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px;">
                                <div><span style="color:#64748b;">الرصيد المتاح:</span> <b style="color:#16a34a;display:block;">${m(net.balance)}</b></div>
                                <div><span style="color:#64748b;">المديونية:</span> <b style="color:${Number(net.debt)>0?'#dc2626':'#0f172a'};display:block;">${m(net.debt)}</b></div>
                                <div><span style="color:#64748b;">الحد الائتماني:</span> <b style="display:block;">${m(net.credit_limit)}</b></div>
                                <div><span style="color:#64748b;">حالة الربط:</span> <b style="color:#16a34a;display:block;">🟢 معتمد ونشط</b></div>
                            </div>
                        ` : isPending ? `
                            <div style="background:#fffbeb;border:1px dashed #f59e0b;border-radius:8px;padding:10px;font-size:12px;color:#b45309;margin-bottom:12px;">
                                ⏳ <b>طلب الانضمام قيد المراجعة</b><br>
                                تم إرسال الطلب برقم <code>${esc(req.request_no)}</code> وبانتظار اعتماد مدير الشبكة.
                            </div>
                        ` : `
                            <div style="background:#f1f5f9;border-radius:8px;padding:10px;font-size:12px;color:#64748b;margin-bottom:12px;">
                                ⚪ غير مرتبط بهذه الشبكة بعد. يمكنك إرسال طلب انضمام كنقطة بيع.
                            </div>
                        `}
                    </div>

                    <div style="margin-top:8px;">
                        ${isAct ? `
                            <button class="mt-btn" style="width:100%;font-size:12px;background:#e0f2fe;color:#0369a1;border:none;cursor:default;" disabled>✓ متصل بالشبكة الحالية</button>
                        ` : isConn ? `
                            <button class="mt-btn mt-btn-primary" style="width:100%;font-size:12px;" onclick="App.switchNetwork(${net.id})">🔄 التبديل إلى هذه الشبكة</button>
                        ` : isPending ? `
                            <button class="mt-btn" style="width:100%;font-size:12px;" disabled>⏳ الطلب قيد الانتظار</button>
                        ` : `
                            <button class="mt-btn mt-btn-success" style="width:100%;font-size:12px;" onclick="App.posShowJoinModal(${net.id}, '${esc(net.name)}')">＋ طلب اعتماد كنقطة بيع</button>
                        `}
                    </div>
                </div>`;
            }).join('') || '<div class="pos-empty">لا توجد شبكات متاحة حالياً.</div>'}
        </div>
    </section>`;
}

function cardRequests(d){
    const reqs = state.cardRequests || [];
    const profs = state.profiles || [];
    return `
    <section class="pos-card pos-section">
        <div class="pos-card-head">
            <div>
                <h3>🎟️ طلب صفحات كروت وباقات جديدة</h3>
                <p>طلب طباعة كروت وباقات محددة من مدير الشبكة وإضافتها مباشرة في عهدتك</p>
            </div>
            <button class="mt-btn mt-btn-primary" onclick="App.posShowNewCardRequestModal()">＋ طلب كروت جديدة</button>
        </div>

        <div class="pos-table-wrap" style="margin-top:16px;">
            <table>
                <thead>
                    <tr>
                        <th>رقم الطلب</th>
                        <th>الباقة</th>
                        <th>عدد الصفحات</th>
                        <th>إجمالي الكروت</th>
                        <th>سعر الكرت</th>
                        <th>الصافي بعد الخصم</th>
                        <th>الحالة</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>
                    ${reqs.map(r => {
                        const isGen = r.status === 'generated' || r.status === 'approved';
                        const isRej = r.status === 'rejected';
                        const statusClass = isGen ? 'paid' : isRej ? 'due' : 'orange';
                        const statusLabel = isGen ? '🟢 تم التوليد بنجاح' : isRej ? '🔴 مرفوض' : '⏳ قيد المراجعة';
                        return `
                        <tr>
                            <td data-label="رقم الطلب"><b>${esc(r.request_no)}</b></td>
                            <td data-label="الباقة"><b>${esc(r.name_for_users || r.profile_name)}</b></td>
                            <td data-label="عدد الصفحات">${n(r.page_count)} صفحة</td>
                            <td data-label="إجمالي الكروت"><span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:10px;font-weight:700;">${n(r.total_cards)} كرت</span></td>
                            <td data-label="سعر الكرت">${m(r.card_price)}</td>
                            <td data-label="الصافي"><b>${m(r.net_amount)}</b></td>
                            <td data-label="الحالة"><span class="pos-badge ${statusClass}">${statusLabel}</span></td>
                            <td data-label="التاريخ">${new Date(r.created_at.replace(' ','T')).toLocaleDateString('ar')}</td>
                        </tr>`;
                    }).join('') || '<tr><td colspan="8" class="pos-empty">لا توجد طلبات كروت سابقة. انقر على "طلب كروت جديدة" لإنشاء أول طلب.</td></tr>'}
                </tbody>
            </table>
        </div>
    </section>`;
}

function statement(d){
    return `<section class="pos-card pos-section"><div class="pos-card-head"><div><h3>كشف الحساب مع الشبكة</h3><p>آخر الفواتير المشتراة والرصيد المتبقي</p></div><button onclick="window.print()">طباعة</button></div><div class="pos-table-wrap"><table><thead><tr><th>المرجع</th><th>التاريخ</th><th>إجمالي الفاتورة</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${(d.statement||[]).map(x=>`<tr><td data-label="المرجع"><b>${esc(x.reference_no)}</b></td><td data-label="التاريخ">${new Date(x.created_at.replace(' ','T')).toLocaleDateString('ar')}</td><td data-label="الإجمالي">${m(x.amount)}</td><td data-label="المدفوع">${m(x.paid_amount)}</td><td data-label="المتبقي"><strong class="${Number(x.remaining_amount)>0?'due':'paid'}">${m(x.remaining_amount)}</strong></td><td data-label="الحالة">${Number(x.remaining_amount)>0?'<span class="pos-badge due">مستحق</span>':'<span class="pos-badge paid">مسدد</span>'}</td></tr>`).join('')||'<tr><td colspan="6" class="pos-empty">لا توجد حركات في كشف الحساب.</td></tr>'}</tbody></table></div></section>`;
}

function cards(d){
    return `<section class="pos-card pos-section"><div class="pos-card-head"><div><h3>الكروت والمخزون</h3><p>آخر الكروت الموجودة في عهدة نقطة البيع</p></div><button onclick="App.switchTab('card_warehouses')">إدارة المخزون</button></div><div class="pos-table-wrap"><table><thead><tr><th>الكرت</th><th>الباقة</th><th>الحالة</th><th>البيع</th><th>السعر</th><th>التاريخ</th></tr></thead><tbody>${(d.recent_cards||[]).map(x=>`<tr><td data-label="الكرت"><code>${esc(x.username)}</code></td><td data-label="الباقة">${esc(x.profile_name||'—')}</td><td data-label="الحالة"><span class="pos-badge ${x.status==='active'?'paid':'due'}">${esc(x.status)}</span></td><td data-label="البيع">${Number(x.is_sold)?'مباع':'متاح'}</td><td data-label="السعر">${m(x.sale_price)}</td><td data-label="التاريخ">${new Date((x.sold_at||x.created_at).replace(' ','T')).toLocaleDateString('ar')}</td></tr>`).join('')||'<tr><td colspan="6" class="pos-empty">لا توجد كروت في العهدة.</td></tr>'}</tbody></table></div></section>`;
}

function networkCard(d){
    const x=d.network,p=d.parent;
    return `<div class="pos-card pos-network"><div class="pos-card-head"><div><h3>الشبكة والجهة المسؤولة</h3><p>ارتباط نقطة البيع بالشبكة والموزع</p></div><span class="pos-online">● مرتبط</span></div><dl><div><dt>الشبكة</dt><dd>${esc(x?.name||'غير محددة')}</dd></div><div><dt>النقطة</dt><dd>${esc(x?.node_name||'غير محددة')}</dd></div><div><dt>الموزع المسؤول</dt><dd>${esc(p?.fullname||'الإدارة')}</dd></div><div><dt>رقم التواصل</dt><dd>${esc(p?.phone||'—')}</dd></div></dl></div>`;
}

function network(d){
    return `<section class="pos-network-full">${networkCard(d)}<div class="pos-card"><div class="pos-card-head"><div><h3>تفاصيل الحساب</h3><p>هوية نقطة البيع ونطاقها</p></div></div><dl class="pos-identity"><div><dt>الاسم</dt><dd>${esc(d.account.fullname)}</dd></div><div><dt>اسم المستخدم</dt><dd>${esc(d.account.username)}</dd></div><div><dt>نوع الحساب</dt><dd>نقطة بيع</dd></div><div><dt>نطاق العرض</dt><dd>الحساب والعملاء التابعون فقط</dd></div></dl></div></section>`;
}

function paint(){
    const d=state.data,root=document.getElementById('main-view');
    if(!d||!root)return;
    const body = state.section==='networks' ? networks(d)
               : state.section==='card_requests' ? cardRequests(d)
               : state.section==='statement' ? statement(d)
               : state.section==='cards' ? cards(d)
               : state.section==='network' ? network(d)
               : overview(d);

    root.innerHTML=`<main class="pos-dashboard" dir="rtl">
        <header class="pos-hero">
            <div>
                <span>POS MULTI-NETWORK DASHBOARD</span>
                <h1>مرحبًا، ${esc(d.account.fullname)}</h1>
                <p>لوحة نقطة البيع المتكاملة · شبكاتك وعملياتك وكروتك المعتمدة</p>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="App.renderDashboard()">↻ تحديث</button>
            </div>
        </header>
        ${tabs()}
        ${body}
    </main>`;

    root.querySelectorAll('.pos-tabs button').forEach(b=>b.onclick=()=>{
        state.section=b.dataset.section;
        if (state.section === 'networks') App.posRefreshNetworks();
        if (state.section === 'card_requests') App.posRefreshCardRequests();
        paint();
    });
}

async function render(){
    if(App.userRole!=='pos_agent')return typeof fallback==='function'?fallback.call(App):null;
    const root=document.getElementById('main-view');
    if(!root)return;
    root.innerHTML='<div class="rd-loading"><span></span>جاري تحميل حساب نقطة البيع...</div>';
    try{
        const [d, invRes] = await Promise.all([
            App.api('pos_dashboard_details'),
            App.api('pos_get_pending_invitations').catch(() => ({ success: false }))
        ]);
        if(!d?.success)throw new Error(d?.error||'تعذر تحميل الحساب');
        state.data=d;
        state.invitations = invRes?.invitations || [];
        paint();
    }catch(e){
        root.innerHTML=`<div class="rd-error"><b>تعذر تحميل لوحة نقطة البيع</b><p>${esc(e.message)}</p><button onclick="App.renderDashboard()">إعادة المحاولة</button></div>`;
    }
}

// Global App POS Helpers
App.posSetSection = s => { state.section = s; paint(); };
App.renderDashboard = render;

App.posRefreshNetworks = async function() {
    try {
        const res = await this.api('pos_get_networks_catalog');
        if (res && res.success) {
            state.networks = res.networks || [];
            paint();
        }
    } catch(e) {
        console.error('تعذر تحديث شبكات نقطة البيع:', e);
        App.toast?.('تعذر تحديث شبكات نقطة البيع. حاول مرة أخرى.', 'danger');
    }
};
App.posRefreshCardRequests = async function() {
    try {
        const [rRes, pRes] = await Promise.all([
            this.api('pos_get_card_requests'),
            this.api('get_profiles').catch(() => ({ success: false }))
        ]);
        if (rRes && rRes.success) state.cardRequests = rRes.requests || [];
        if (pRes && pRes.profiles) state.profiles = pRes.profiles || [];
        paint();
    } catch(e) {
        console.error('تعذر تحديث طلبات الكروت والباقات:', e);
        App.toast?.('تعذر تحديث طلبات الكروت والباقات. حاول مرة أخرى.', 'danger');
    }
};
App.posConfirmInvitation = async function(requestId, decision, netName = '', debt = 0) {
    if (decision === 'accept') {
        let msg = `هل أنت متأكد من تأكيد الربط بشبكة [${netName}]؟`;
        if (debt > 0) msg += `\n\nتنبيه: سيتم تثبيت المديونية السابقة بمبلغ (${Number(debt).toLocaleString()} ر.ي) في حسابك.`;
        if (!confirm(msg)) return;
    } else {
        if (!confirm('هل أنت متأكد من رفض دعوة الانضمام؟')) return;
    }

    try {
        const res = await this.api('pos_confirm_network_invitation', { request_id: requestId, decision: decision });
        if (res && res.success) {
            alert(res.message || 'تمت العملية بنجاح');
            this.renderDashboard();
        } else {
            alert('❌ خطأ: ' + (res?.error || 'تعذر تأكيد الدعوة'));
        }
    } catch(e) {
        alert('❌ فشل الاتصال بالسيرفر: ' + e.message);
    }
};

App.posShowJoinModal = function(networkId, networkName) {
    const modal = document.createElement('div');
    modal.className = 'mt-modal-backdrop';
    modal.onclick = function(e) { if (e.target === this) this.remove(); };
    modal.innerHTML = `
        <div class="mt-modal" style="max-width:440px;" onclick="event.stopPropagation()">
            <div class="mt-modal-header">
                <h3>🌐 طلب انضمام كنقطة بيع: ${esc(networkName)}</h3>
                <button type="button" class="mt-modal-close" onclick="this.closest('.mt-modal-backdrop').remove()">✕</button>
            </div>
            <form onsubmit="App.submitPosJoinRequest(event, ${networkId})">
                <div class="mt-modal-body" style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">اسم المحل / النقطة التجارية</label>
                        <input type="text" name="shop_name" class="mt-input" placeholder="مثال: بقالة الأمل / كافيه النخبة" style="width:100%;">
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">ملاحظات الموقع والتوزيع</label>
                        <textarea name="location_notes" class="mt-input" rows="3" placeholder="موقع النقطة وساعات العمل..." style="width:100%;"></textarea>
                    </div>
                    <div style="background:#f8fafc;padding:10px;border-radius:8px;font-size:12px;color:#64748b;">
                        📌 سيتم إرسال الطلب إلى مدير الشبكة لاعتماده وتحديد نسبة الخصم والحد الائتماني المتاح لنقطة البيع.
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="this.closest('.mt-modal-backdrop').remove()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success">إرسال الطلب</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

App.submitPosJoinRequest = async function(e, networkId) {
    e.preventDefault();
    const form = e.target;
    const shopName = form.shop_name.value.trim();
    const notes = form.location_notes.value.trim();

    try {
        const res = await this.api('pos_submit_network_join_request', { network_id: networkId, shop_name: shopName, location_notes: notes });
        if (res && res.success) {
            alert(res.message || 'تم إرسال الطلب بنجاح');
            form.closest('.mt-modal-overlay').remove();
            this.posRefreshNetworks();
        } else {
            alert('❌ خطأ: ' + (res?.error || 'تعذر إرسال الطلب'));
        }
    } catch(err) {
        alert('❌ فشل الاتصال بالسيرفر: ' + err.message);
    }
};

App.posShowNewCardRequestModal = async function() {
    let profiles = state.profiles || [];
    if (profiles.length === 0) {
        const pRes = await this.api('get_profiles').catch(() => ({ profiles: [] }));
        profiles = pRes.profiles || [];
        state.profiles = profiles;
    }

    const modal = document.createElement('div');
    modal.className = 'mt-modal-backdrop';
    modal.onclick = function(e) { if (e.target === this) this.remove(); };
    modal.innerHTML = `
        <div class="mt-modal" style="max-width:480px;" onclick="event.stopPropagation()">
            <div class="mt-modal-header">
                <h3>🎟️ طلب صفحات كروت جديدة</h3>
                <button type="button" class="mt-modal-close" onclick="this.closest('.mt-modal-backdrop').remove()">✕</button>
            </div>
            <form onsubmit="App.submitPosCardRequest(event)">
                <div class="mt-modal-body" style="display:flex;flex-direction:column;gap:14px;">
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">اختر باقة الكرت المطلوبة *</label>
                        <select name="profile_name" class="mt-input" style="width:100%;" required onchange="App.calcPosCardRequestTotal()">
                            <option value="">-- اختر الباقة --</option>
                            ${profiles.map(p => `<option value="${esc(p.name)}" data-price="${p.retail_price||p.price||0}">${esc(p.name_for_users||p.name)} - (${Number(p.retail_price||p.price||0).toLocaleString()} ر.ي)</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">عدد الصفحات المطلوب *</label>
                            <input type="number" name="page_count" class="mt-input" min="1" max="100" value="1" style="width:100%;" required oninput="App.calcPosCardRequestTotal()">
                        </div>
                        <div>
                            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">كروت في الصفحة</label>
                            <select name="cards_per_page" class="mt-input" style="width:100%;" onchange="App.calcPosCardRequestTotal()">
                                <option value="10">10 كروت / صفحة</option>
                                <option value="20">20 كرت / صفحة</option>
                                <option value="30">30 كرت / صفحة</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="pos-card-calc-summary" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;font-size:13px;color:#166534;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <span>إجمالي عدد الكروت:</span>
                            <b id="pos-calc-cards">10 كرت</b>
                        </div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <span>السعر الإجمالي:</span>
                            <b id="pos-calc-total">0.00 ر.ي</b>
                        </div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                            <span>نسبة الخصم الممنوحة:</span>
                            <b>${n(state.data?.account?.discount_rate || 0)}%</b>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:14px;border-top:1px dashed #86efac;padding-top:6px;margin-top:6px;">
                            <span style="font-weight:800;">الصافي المطلوب سداده:</span>
                            <b id="pos-calc-net" style="color:#15803d;font-size:16px;">0.00 ر.ي</b>
                        </div>
                    </div>

                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">طريقة السداد</label>
                        <select name="payment_method" class="mt-input" style="width:100%;">
                            <option value="credit_balance">خصم من الرصيد الائتماني / المحفظة</option>
                            <option value="debt">تسجيل كمديونية على الحساب</option>
                            <option value="cash">نقداً عند الاستلام</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">ملاحظات إضافية (اختياري)</label>
                        <input type="text" name="notes" class="mt-input" placeholder="ملاحظات لمدير الشبكة..." style="width:100%;">
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="this.closest('.mt-modal-backdrop').remove()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success">إرسال طلب الكروت</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    App.calcPosCardRequestTotal();
};

App.calcPosCardRequestTotal = function() {
    const sel = document.querySelector('select[name="profile_name"]');
    const pageInp = document.querySelector('input[name="page_count"]');
    const cppSel = document.querySelector('select[name="cards_per_page"]');
    if (!sel || !pageInp || !cppSel) return;

    const opt = sel.selectedOptions[0];
    const cardPrice = opt ? parseFloat(opt.dataset.price || 0) : 0;
    const pages = Math.max(1, parseInt(pageInp.value) || 1);
    const cpp = parseInt(cppSel.value) || 10;

    const totalCards = pages * cpp;
    const totalAmount = totalCards * cardPrice;
    const discRate = parseFloat(state.data?.account?.discount_rate || 0);
    const netAmount = totalAmount - (totalAmount * (discRate / 100));

    const elCards = document.getElementById('pos-calc-cards');
    const elTotal = document.getElementById('pos-calc-total');
    const elNet = document.getElementById('pos-calc-net');

    if (elCards) elCards.textContent = totalCards.toLocaleString() + ' كرت';
    if (elTotal) elTotal.textContent = totalAmount.toLocaleString('ar-YE', {maximumFractionDigits:2}) + ' ر.ي';
    if (elNet) elNet.textContent = netAmount.toLocaleString('ar-YE', {maximumFractionDigits:2}) + ' ر.ي';
};

App.submitPosCardRequest = async function(e) {
    e.preventDefault();
    const form = e.target;
    const prof = form.profile_name.value;
    const pages = form.page_count.value;
    const cpp = form.cards_per_page.value;
    const method = form.payment_method.value;
    const notes = form.notes.value.trim();

    try {
        const res = await this.api('pos_request_card_batch', {
            profile_name: prof,
            page_count: pages,
            cards_per_page: cpp,
            payment_method: method,
            notes: notes
        });
        if (res && res.success) {
            alert(res.message || 'تم إرسال طلب الكروت بنجاح!');
            form.closest('.mt-modal-overlay').remove();
            this.posRefreshCardRequests();
        } else {
            alert('❌ خطأ: ' + (res?.error || 'تعذر إرسال طلب الكروت'));
        }
    } catch(err) {
        alert('❌ فشل الاتصال بالسيرفر: ' + err.message);
    }
};

App.posShowTopupModal = function() {
    const modal = document.createElement('div');
    modal.className = 'mt-modal-backdrop';
    modal.onclick = function(e) { if (e.target === this) this.remove(); };
    modal.innerHTML = `
        <div class="mt-modal" style="max-width:440px;" onclick="event.stopPropagation()">
            <div class="mt-modal-header">
                <h3>ϟ طلب شحن رصيد فوري</h3>
                <button type="button" class="mt-modal-close" onclick="this.closest('.mt-modal-backdrop').remove()">✕</button>
            </div>
            <form onsubmit="App.submitPosTopupRequest(event)">
                <div class="mt-modal-body" style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">المبلغ المطلوب (ر.ي) *</label>
                        <input type="number" name="amount" class="mt-input" min="500" step="100" placeholder="مثال: 5000" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">طريقة الدفع</label>
                        <select name="payment_method" class="mt-input" style="width:100%;">
                            <option value="cash">نقداً (تسليم مباشر)</option>
                            <option value="bank">تحويل بنكي / صرافة</option>
                            <option value="credit">آجل (على الحساب الائتماني)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">رقم الحوالة / السند (اختياري)</label>
                        <input type="text" name="payment_reference" class="mt-input" placeholder="رقم الإشعار أو الحوالة..." style="width:100%;">
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px;">ملاحظات إضافية</label>
                        <textarea name="notes" class="mt-input" rows="2" placeholder="أي تفاصيل لمدير الشبكة..." style="width:100%;"></textarea>
                    </div>
                </div>
                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="this.closest('.mt-modal-backdrop').remove()">إلغاء</button>
                    <button type="submit" class="mt-btn mt-btn-success">إرسال طلب الشحن</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

App.submitPosTopupRequest = async function(e) {
    e.preventDefault();
    const form = e.target;
    const amt = form.amount.value;
    const method = form.payment_method.value;
    const ref = form.payment_reference.value.trim();
    const notes = form.notes.value.trim();

    try {
        const res = await this.api('balance_topup_request_create', {
            amount: amt,
            payment_method: method,
            payment_reference: ref,
            notes: notes
        });
        if (res && res.success) {
            alert('✓ تم إرسال طلب الشحن بنجاح برقم: ' + (res.request_no || ''));
            form.closest('.mt-modal-backdrop').remove();
            this.renderDashboard();
        } else {
            alert('❌ خطأ: ' + (res?.error || 'تعذر إرسال طلب الشحن'));
        }
    } catch(err) {
        alert('❌ فشل الاتصال بالسيرفر: ' + err.message);
    }
};

})();
