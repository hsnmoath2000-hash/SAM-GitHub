/* SAM Product Catalog v1 — canonical modules, routes, permissions and shared UI helpers. */
(function (window) {
  'use strict';
  const modules = [
    { id:'dashboard', group:'home', label:'الرئيسية', icon:'📊', permission:'dashboard' },
    { id:'users', group:'subscribers', label:'المشتركون والكروت', icon:'🎫', permission:'users' },
    { id:'profiles', group:'subscribers', label:'الباقات والسرعات', icon:'📦', permission:'profiles' },
    { id:'card_warehouses', group:'inventory', label:'مخازن الكروت', icon:'🏢', permission:'card_warehouses' },
    { id:'batch_gen', group:'subscribers', label:'توليد الكروت', icon:'⚡', permission:'batch_gen' },
    { id:'templates', group:'subscribers', label:'قوالب الطباعة', icon:'🎨', permission:'templates' },
    { id:'free_vouchers', group:'subscribers', label:'الكروت المجانية و VIP', icon:'🎁', permission:'free_vouchers' },
    { id:'sales', group:'sales', label:'المبيعات ونقاط البيع', icon:'🛒', permission:'sales' },
    { id:'purchase_invoices', group:'sales', label:'المشتريات والموردون', icon:'🧾', permission:'purchase_invoices' },
    { id:'instant_balance', group:'sales', label:'الرصيد الفوري', icon:'💳', permission:'instant_balance' },
    { id:'chart_of_accounts', group:'finance', label:'دليل الحسابات', icon:'🏢', permission:'chart_of_accounts' },
    { id:'journal_entries', group:'finance', label:'القيود اليومية', icon:'📑', permission:'journal_entries' },
    { id:'trial_balance', group:'finance', label:'ميزان المراجعة', icon:'⚖️', permission:'trial_balance' },
    { id:'cost_centers', group:'finance', label:'مراكز التكلفة', icon:'🎯', permission:'cost_centers' },
    { id:'exchange_rates', group:'finance', label:'أسعار الصرف والعملات', icon:'💱', permission:'exchange_rates' },
    { id:'cashbox_accounts', group:'finance', label:'الصناديق والحسابات', icon:'💰', permission:'cashbox_accounts' },
    { id:'vouchers_fin', group:'finance', label:'السندات المالية', icon:'🧾', permission:'vouchers_fin' },
    { id:'operating_expenses', group:'finance', label:'المصروفات', icon:'🧾', permission:'operating_expenses' },
    { id:'salaries_payroll', group:'finance', label:'الرواتب', icon:'💵', permission:'salaries_payroll' },
    { id:'partners_equity', group:'partners', label:'الشركاء والأرباح', icon:'👥', permission:'partners_equity' },
    { id:'networks_partnerships', group:'partners', label:'الشبكات والشراكات', icon:'🌐', permission:'networks_partnerships' },

    // Core Reports & Analytics Department (قسم التقارير والإحصائيات الموحد)
    { id:'sales_channel_reports', group:'reports', label:'تقارير مبيعات القنوات', icon:'🏪', permission:'sales_channel_reports' },
    { id:'financial_reports', group:'reports', label:'التقارير المالية وقوائم الأرباح (P&L)', icon:'📊', permission:'financial_reports' },
    { id:'port_analytics', group:'reports', label:'مبيعات واستهلاك المنافذ', icon:'🌐', permission:'port_analytics' },
    { id:'reports_center', group:'reports', label:'مركز التقارير الشاملة والطباعة', icon:'🖨️', permission:'reports_center' },
    { id:'logs', group:'reports', label:'سجلات العمليات والتدقيق', icon:'📜', permission:'logs' },

    { id:'routers', group:'network', label:'الراوترات وNAS', icon:'🌐', permission:'routers' },
    { id:'hotspot_designer', group:'network', label:'🎨 إعداد صفحة الهوتسبوت', icon:'🎨', permission:'routers' },
    { id:'active_sessions', group:'network', label:'الجلسات النشطة', icon:'🔴', permission:'active_sessions' },
    { id:'network_nodes', group:'network', label:'هيكل الشبكة', icon:'🌳', permission:'network_nodes' },
    { id:'assets', group:'inventory', label:'الأصول والمعدات', icon:'📡', permission:'assets' },
    { id:'sstp_vpn', group:'network', label:'SSTP VPN', icon:'🔒', permission:'sstp_vpn' },
    { id:'noc', group:'network', label:'مراقبة الشبكة', icon:'📡', permission:'noc' },
    { id:'distributor_wallets', group:'system', label:'الموزعون وشحن الأرصدة', icon:'⚡', permission:'distributor_wallets' },
    { id:'admins_agents', group:'system', label:'المستخدمون والوكلاء', icon:'👔', permission:'admins_agents' },
    { id:'roles_permissions', group:'system', label:'الأدوار والصلاحيات', icon:'🛡️', permission:'roles_permissions' },
    { id:'notifications', group:'automation', label:'التنبيهات والرسائل', icon:'💬', permission:'notifications' },
    { id:'whatsapp_manager', group:'automation', label:'WhatsApp', icon:'📱', permission:'whatsapp_manager' },
    { id:'backups', group:'system', label:'النسخ الاحتياطي', icon:'💾', permission:'backups' },
    { id:'ui_customizer', group:'system', label:'تخصيص الواجهة', icon:'🎨', permission:'ui_customizer' },
    { id:'subscriber_portal', group:'home', label:'بوابة المشترك', icon:'📱', permission:'subscriber_portal' }
  ];
  const aliases = {
    home:'dashboard', main:'dashboard', subscribers:'users', subscriber_cards:'users', cards:'users',
    currencies:'exchange_rates', currency:'exchange_rates', exchange:'exchange_rates', exchange_rate:'exchange_rates',
    recurring_expenses:'operating_expenses', expenses:'operating_expenses', operating_expense:'operating_expenses',
    purchases:'purchase_invoices', purchase:'purchase_invoices', purchase_invoices:'purchase_invoices',
    networks:'routers', network:'routers', router:'routers', sessions:'active_sessions',
    hotspot:'hotspot_designer', hotspot_designer:'hotspot_designer', hotspot_studio:'hotspot_designer',
    permissions:'roles_permissions', rbac:'roles_permissions',
    reports_dept:'reports', reports_analytics:'reports', reports:'reports_center',
    financial_report:'financial_reports', accounting:'chart_of_accounts', whatsapp:'whatsapp_manager',
    admin:'system', system:'system_settings', settings:'system_settings', firewall:'system_settings',
    messages_notifications:'notifications',
    wallets:'distributor_wallets', distributors:'distributor_wallets', distributor_wallets:'distributor_wallets',
    sales_reports:'sales_channel_reports', channel_reports:'sales_channel_reports', sales_channel_reports:'sales_channel_reports',
    free_vouchers_rules:'free_vouchers_pos_rules', pos_rules:'free_vouchers', pos_free_rules:'free_vouchers',
    schedules:'free_vouchers', free_schedules:'free_vouchers',
    analytics:'free_vouchers', free_analytics:'free_vouchers', free_vouchers_roi:'free_vouchers',
    pos:'sales', cashier:'sales',
    owner_console:'system_owner_console', server_console:'system_owner_console'
  };
  const groups = [
    { id:'home', label:'الرئيسية', icon:'🏠', order:10 },
    { id:'network', label:'إدارة الشبكة والراوترات', icon:'📡', order:20 },
    { id:'subscribers', label:'المشتركون والخدمات', icon:'👥', order:30 },
    { id:'sales', label:'المبيعات والتحصيل', icon:'🛒', order:40 },
    { id:'finance', label:'المالية والمحاسبة', icon:'💰', order:50 },
    { id:'reports', label:'التقارير والإحصائيات', icon:'📈', order:55 },
    { id:'inventory', label:'المخزون والأصول', icon:'📦', order:60 },
    { id:'partners', label:'الشركاء والوكلاء', icon:'🤝', order:70 },
    { id:'automation', label:'الاتصالات والأتمتة', icon:'⚙️', order:80 },
    { id:'system', label:'الإدارة والأمان', icon:'🛡️', order:90 }
  ];
  const byId = Object.fromEntries(modules.map(m => [m.id, m]));
  function resolve(route) { const r = String(route || '').replace(/^#/, ''); return aliases[r] || (byId[r] ? r : r); }
  function permission(route) { const m = byId[resolve(route)]; return m ? m.permission : resolve(route); }
  function normalizeText(value) { return String(value ?? '').toLocaleLowerCase('ar').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }
  function normalizeFilters(filters, schema) {
    const out = {};
    Object.entries(schema || {}).forEach(([key, type]) => {
      let value = filters && filters[key];
      if (value === undefined || value === null) value = type === 'number' ? 0 : '';
      if (type === 'number') value = Number(value) || 0;
      if (type === 'boolean') value = value === true || value === 'true' || value === 1;
      if (type === 'date') value = String(value).slice(0, 10);
      out[key] = value;
    });
    return out;
  }
  function filterRows(rows, filters, fields) {
    const q = String(filters && (filters.q || filters.search) || '').trim().toLowerCase();
    if (!q) return Array.isArray(rows) ? rows.slice() : [];
    return (Array.isArray(rows) ? rows : []).filter(row => fields.some(f => String((row && row[f]) ?? '').toLowerCase().includes(q)));
  }
  function paginate(rows, page, limit) { const p = Math.max(1, Number(page) || 1), l = Math.max(1, Math.min(500, Number(limit) || 50)); return { page:p, limit:l, total:rows.length, pages:Math.max(1, Math.ceil(rows.length/l)), rows:rows.slice((p-1)*l, p*l) }; }
  function exportCsv(rows, columns, filename) {
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(r[c.key])).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'sam-export.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  window.SamProductCatalog = Object.freeze({ version:'1.0.0', modules, groups, aliases, resolve, permission, byId, normalizeText, normalizeFilters, filterRows, paginate, exportCsv });
  window.SamUI = window.SamUI || {};
  Object.assign(window.SamUI, { catalog: window.SamProductCatalog, normalizeText, normalizeFilters, filterRows, paginate, exportCsv });
  if (window.App) {
    const originalHasAccess = window.App.hasAccess;
    const roleAdditions = {
      superadmin: ['dashboard', 'users', 'profiles', 'card_warehouses', 'batch_gen', 'templates', 'free_vouchers', 'sales', 'purchase_invoices', 'instant_balance', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'exchange_rates', 'cashbox_accounts', 'vouchers_fin', 'operating_expenses', 'salaries_payroll', 'partners_equity', 'networks_partnerships', 'sales_channel_reports', 'financial_reports', 'port_analytics', 'reports_center', 'logs', 'routers', 'hotspot_designer', 'active_sessions', 'network_nodes', 'assets', 'noc', 'distributor_wallets', 'admins_agents', 'roles_permissions', 'notifications', 'whatsapp_manager', 'backups', 'ui_customizer', 'subscriber_portal'],
      system_owner: ['dashboard', 'users', 'profiles', 'card_warehouses', 'batch_gen', 'templates', 'free_vouchers', 'sales', 'purchase_invoices', 'instant_balance', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'exchange_rates', 'cashbox_accounts', 'vouchers_fin', 'operating_expenses', 'salaries_payroll', 'partners_equity', 'networks_partnerships', 'sales_channel_reports', 'financial_reports', 'port_analytics', 'reports_center', 'logs', 'routers', 'hotspot_designer', 'active_sessions', 'network_nodes', 'assets', 'noc', 'distributor_wallets', 'admins_agents', 'roles_permissions', 'notifications', 'whatsapp_manager', 'backups', 'ui_customizer', 'subscriber_portal'],
      finance: ['operating_expenses', 'salaries_payroll', 'purchase_invoices', 'financial_reports', 'sales_channel_reports', 'reports_center', 'port_analytics'],
      accountant: ['operating_expenses', 'salaries_payroll', 'purchase_invoices', 'financial_reports', 'sales_channel_reports', 'reports_center'],
      partner: ['financial_reports', 'sales_channel_reports', 'reports_center', 'port_analytics', 'logs'],
      distributor: ['sales_channel_reports', 'distributor_wallets'],
      pos_agent: ['sales_channel_reports']
    };
    window.App.hasAccess = function (route) {
      const canonical = resolve(route);
      if (['superadmin', 'superadmin'].includes(this.userRole) || this.isSystemOwner) return true;
      if (originalHasAccess.call(this, canonical)) return true;
      if (Array.isArray(this.userPermissions) && this.userPermissions.length > 0) return false;
      return (roleAdditions[this.userRole] || []).includes(canonical);
    };
    const originalSwitchTab = window.App.switchTab;
    window.App.switchTab = function (route, pushHistory) { return originalSwitchTab.call(this, resolve(route), pushHistory); };
    window.App.samCanonicalRoute = resolve;
    window.App.samCanonicalPermission = permission;
  }
})(window);

/* Apply the canonical navigation groups without changing legacy renderers. */
(function (window) {
  if (!window.App || !window.SamProductCatalog) return;
  const c = window.SamProductCatalog;
  window.App.departments = c.groups.map(g => ({
    id: g.id, name: g.label, icon: g.icon, color: '#334155',
    items: c.modules.filter(m => m.group === g.id).map(m => ({ id: m.id, name: m.label, icon: m.icon }))
  })).filter(g => g.items.length);
})(window);
