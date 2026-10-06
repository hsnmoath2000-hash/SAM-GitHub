/* Interactive dashboard widgets. Uses the existing dashboard_stats response only. */
(function () {
  'use strict';
  const state = { stats: null };
  const originalApi = window.App && window.App.api;
  if (!window.App || typeof originalApi !== 'function') return;
  window.App.api = async function () {
    const result = await originalApi.apply(this, arguments);
    if (arguments[0] === 'dashboard_stats' && result) state.stats = result;
    return result;
  };
  const formatNumber = (value) => Number(value || 0).toLocaleString('ar');
  const render = () => {
    const host = document.getElementById('dashboard-interactive-insights');
    const stats = state.stats;
    if (!host || !stats) return;
    const items = [
      { label: 'مبيعات اليوم', value: Number(stats.today_sales || 0), display: window.App.formatMoney(stats.today_sales || 0), color: '#1976d2' },
      { label: 'المتصلون الآن', value: Number(stats.active_sessions || 0), display: formatNumber(stats.active_sessions), color: '#2e7d32' },
      { label: 'الكروت الجاهزة', value: Number(stats.warehouse_stock || 0), display: formatNumber(stats.warehouse_stock), color: '#ef6c00' },
      { label: 'فواتير اليوم', value: Number(stats.today_invoices_count || 0), display: formatNumber(stats.today_invoices_count), color: '#7b1fa2' }
    ];
    const max = Math.max(...items.map(i => i.value), 1);
    host.querySelector('.md-insight-bars').innerHTML = items.map(item => `
      <div class="md-insight-row">
        <div class="md-insight-label"><span>${item.label}</span><b>${item.display}</b></div>
        <div class="md-insight-track"><span style="--bar-color:${item.color}; width:0%" data-width="${Math.max(6, Math.round(item.value / max * 100))}%"></span></div>
      </div>`).join('');
    requestAnimationFrame(() => host.querySelectorAll('[data-width]').forEach(el => { el.style.width = el.dataset.width; }));
    host.querySelector('.md-insight-time').textContent = new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  };
  const mount = () => {
    const main = document.getElementById('main-view');
    if (!main || document.getElementById('dashboard-interactive-insights')) return;
    const grid = main.querySelector('.kpi-grid');
    if (!grid) return;
    const panel = document.createElement('section');
    panel.id = 'dashboard-interactive-insights';
    panel.className = 'md-insight-panel';
    panel.innerHTML = `<div class="md-insight-head"><div><h3>مؤشرات النشاط</h3><p>ملخص تفاعلي من بيانات اليوم</p></div><span class="md-insight-time"></span></div><div class="md-insight-bars"></div>`;
    grid.insertAdjacentElement('afterend', panel);
    render();
  };
  const originalRender = window.App.renderDashboard;
  if (typeof originalRender === 'function') {
    window.App.renderDashboard = async function () {
      const result = await originalRender.apply(this, arguments);
      setTimeout(() => { const old = document.getElementById('dashboard-interactive-insights'); if (old) old.remove(); mount(); }, 30);
      return result;
    };
  }
  if (document.readyState !== 'loading') setTimeout(mount, 300);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 300));
})();
