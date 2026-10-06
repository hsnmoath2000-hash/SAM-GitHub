/* RBAC role-permission matrix UI backed by the normalized permission tables. */
(function () {
  'use strict';
  const state = { catalog: [], roles: [], matrix: {}, selectedRole: '', search: '', module: 'all', loading: false };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = () => window.App;
  const modules = () => [...new Set(state.catalog.map(p => p.module_key))];
  const role = () => state.roles.find(r => r.role_key === state.selectedRole) || state.roles[0];
  const labelModule = (m) => ({ dashboard:'لوحة التحكم', sales:'المبيعات', wallet:'المحفظة', statement:'كشوف الحساب', inventory:'المخزون', cashbox:'الصندوق', maintenance:'الصيانة', free_vouchers:'الكروت المجانية', notifications:'الإشعارات' }[m] || m);
  const render = () => {
    const root = document.getElementById('main-view'); if (!root) return;
    const selected = role(); const readOnly = !api()?.isSystemOwner || !selected || Number(selected.is_system) === 1;
    const q = state.search.toLocaleLowerCase('ar');
    const rows = state.catalog.filter(p => (state.module === 'all' || p.module_key === state.module) && (!q || `${p.permission_key} ${p.permission_name_ar} ${p.description || ''}`.toLocaleLowerCase('ar').includes(q)));
    const groups = modules().filter(m => state.module === 'all' || m === state.module).map(m => [m, rows.filter(p => p.module_key === m)]).filter(([, list]) => list.length);
    const PB = window.SamUI?.PageBuilder;
    const bodyHtml = `
      <div class="rbac-matrix-toolbar"><label>الرتبة<select id="rbac-role-select">${state.roles.map(r => `<option value="${esc(r.role_key)}" ${r.role_key === state.selectedRole ? 'selected' : ''}>${esc(r.role_name_ar || r.role_key)} · ${esc(r.role_key)}</option>`).join('')}</select></label><label>الوحدة<select id="rbac-module-select"><option value="all">كل الوحدات</option>${modules().map(m => `<option value="${esc(m)}" ${m === state.module ? 'selected' : ''}>${esc(labelModule(m))}</option>`).join('')}</select></label><label class="rbac-search">بحث<input id="rbac-permission-search" type="search" value="${esc(state.search)}" placeholder="اسم الصلاحية أو وصفها..." /></label><button class="mt-btn" id="rbac-refresh">🔄 تحديث</button></div>
      <div class="rbac-role-summary"><div><b>${esc(selected?.role_name_ar || '—')}</b><span>${esc(selected?.description || 'لا يوجد وصف')}</span></div><div><span class="rbac-scope-chip">النطاق الافتراضي: ${esc(selected?.default_data_scope || 'own')}</span>${readOnly ? '<span class="rbac-readonly-chip">قراءة فقط</span>' : '<span class="rbac-edit-chip">قابل للتعديل</span>'}</div></div>
      <div class="rbac-legend"><span><i class="grant-dot"></i>منح</span><span><i class="deny-dot"></i>منع صريح</span><span><i class="none-dot"></i>غير موروثة</span><span>تعديل الرتبة المحددة فقط</span></div>
      <div class="rbac-table-wrap"><table class="rbac-matrix-table"><thead><tr><th>الوحدة والصلاحية</th><th>العملية</th><th>النطاق</th><th>الوصف</th><th>الحالة للرتبة</th></tr></thead><tbody>${groups.map(([m, list]) => `<tr class="rbac-group-row"><th colspan="5">${esc(labelModule(m))}<small>${esc(m)}</small></th></tr>${list.map(p => { const effect = state.matrix[state.selectedRole]?.[p.permission_key] || 'none'; return `<tr data-permission="${esc(p.permission_key)}"><td><b>${esc(p.permission_name_ar)}</b><code>${esc(p.permission_key)}</code>${p.is_sensitive == 1 ? '<em>حساسة</em>' : ''}</td><td>${esc(p.action_key)}</td><td><span class="scope-pill">${esc(p.scope_key)}</span></td><td>${esc(p.description || '')}</td><td><select class="rbac-effect-select ${effect}" data-permission="${esc(p.permission_key)}" ${readOnly ? 'disabled' : ''}><option value="none" ${effect === 'none' ? 'selected' : ''}>— غير موروثة</option><option value="grant" ${effect === 'grant' ? 'selected' : ''}>✓ منح</option><option value="deny" ${effect === 'deny' ? 'selected' : ''}>× منع صريح</option></select></td></tr>`; }).join('')}`).join('') || '<tr><td colspan="5" class="rbac-empty">لا توجد صلاحيات مطابقة للبحث.</td></tr>'}</tbody></table></div>
      <div class="rbac-savebar"><span id="rbac-dirty">لم يتم تعديل المصفوفة</span><button class="mt-btn" id="rbac-reset" ${readOnly ? 'disabled' : ''}>↩ تراجع</button><button class="mt-btn mt-btn-primary" id="rbac-save" ${readOnly ? 'disabled' : ''}>💾 حفظ صلاحيات الرتبة</button></div>
    `;

    if (PB && typeof PB.renderShell === 'function') {
      root.innerHTML = PB.renderShell({
        id: 'roles_permissions',
        archetype: 'designer',
        eyebrow: 'RBAC / MATRIX',
        title: 'مصفوفة صلاحيات الرتب',
        subtitle: 'تحكم مركزي في ما يستطيع كل دور عرضه أو تنفيذه ونطاق البيانات الخاص به',
        icon: '🛡️',
        stats: [
          { label: 'الرتب المعتمدة', value: state.roles.length, icon: '👑', tone: 'purple' },
          { label: 'إجمالي الصلاحيات', value: state.catalog.length, icon: '🔒', tone: 'blue' }
        ],
        content: `<section class="rbac-matrix-page" dir="rtl" style="padding:0;">${bodyHtml}</section>`
      });
    } else {
      root.innerHTML = `<section class="rbac-matrix-page" dir="rtl">
        <div class="rbac-matrix-hero"><div><span class="rbac-eyebrow">RBAC / MATRIX</span><h1>مصفوفة صلاحيات الرتب</h1><p>تحكم مركزي في ما يستطيع كل دور عرضه أو تنفيذه ونطاق البيانات الخاص به.</p></div><div class="rbac-hero-stat"><b>${state.roles.length}</b><span>رتب</span><b>${state.catalog.length}</b><span>صلاحية</span></div></div>
        ${bodyHtml}
      </section>`;
    }
    bind();
  };
  const bind = () => {
    document.getElementById('rbac-role-select')?.addEventListener('change', e => { state.selectedRole = e.target.value; render(); });
    document.getElementById('rbac-module-select')?.addEventListener('change', e => { state.module = e.target.value; render(); });
    document.getElementById('rbac-permission-search')?.addEventListener('input', e => { state.search = e.target.value; render(); setTimeout(() => document.getElementById('rbac-permission-search')?.focus(), 0); });
    document.getElementById('rbac-refresh')?.addEventListener('click', () => load());
    document.getElementById('rbac-reset')?.addEventListener('click', () => load());
    document.querySelectorAll('.rbac-effect-select').forEach(select => select.addEventListener('change', e => { state.matrix[state.selectedRole] ||= {}; state.matrix[state.selectedRole][e.target.dataset.permission] = e.target.value === 'none' ? undefined : e.target.value; e.target.className = `rbac-effect-select ${e.target.value}`; document.getElementById('rbac-dirty').textContent = 'هناك تعديلات غير محفوظة'; }));
    document.getElementById('rbac-save')?.addEventListener('click', save);
  };
  const load = async () => { state.loading = true; const root = document.getElementById('main-view'); if (root) root.innerHTML = '<div class="rbac-loading">جاري تحميل مصفوفة الصلاحيات...</div>'; try { const res = await api().api('get_permission_matrix'); if (!res?.success) throw new Error(res?.error || 'تعذر تحميل المصفوفة'); state.catalog = res.catalog || []; state.roles = res.roles || []; state.matrix = res.matrix || {}; state.selectedRole ||= state.roles[0]?.role_key || ''; render(); } catch (e) { if (root) root.innerHTML = `<div class="rbac-error">⚠️ ${esc(e.message)}<button class="mt-btn mt-btn-primary" onclick="App.renderPermissionMatrix()">إعادة المحاولة</button></div>`; } finally { state.loading = false; } };
  const save = async () => { const selected = role(); if (!api()?.isSystemOwner || !selected || Number(selected.is_system) === 1) { api()?.toast?.('إدارة مصفوفة الرتب متاحة لمالك النظام فقط', 'warning'); return; } const changes = Object.entries(state.matrix[selected.role_key] || {}).filter(([, effect]) => effect === 'grant' || effect === 'deny').map(([permission_key, effect]) => ({ permission_key, effect })); const button = document.getElementById('rbac-save'); if (button) { button.disabled = true; button.textContent = '⏳ جارٍ الحفظ...'; } try { const res = await api().api('save_permission_matrix', { role_key: selected.role_key, changes }, 'POST'); if (!res?.success) throw new Error(res?.error || 'تعذر الحفظ'); api().toast?.('✅ تم حفظ مصفوفة صلاحيات الرتبة', 'success'); await load(); } catch (e) { api().toast?.(`❌ ${e.message}`, 'danger'); if (button) { button.disabled = false; button.textContent = '💾 حفظ صلاحيات الرتبة'; } } };
  window.App = window.App || {};
  window.App.renderPermissionMatrix = load;
})();
