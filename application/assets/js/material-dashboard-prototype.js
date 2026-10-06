/* Material Dashboard prototype behavior — no business logic changes. */
(function () {
  'use strict';
  const applyShellState = () => {
    const root = document.body;
    const isDashboard = !window.App || !window.App.currentTab || window.App.currentTab === 'dashboard';
    root.classList.toggle('sam-dashboard-prototype', isDashboard);
    const saved = localStorage.getItem('sam_sidebar_collapsed') === '1';
    root.classList.toggle('sam-sidebar-collapsed', saved);
    const headerLeft = document.querySelector('.mt-header > div:first-child');
    if (!headerLeft || document.querySelector('.sam-sidebar-collapse-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sam-sidebar-collapse-toggle';
    button.title = 'طي أو فتح القائمة الجانبية';
    button.setAttribute('aria-label', button.title);
    button.textContent = saved ? '»' : '«';
    button.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sam-sidebar-collapsed');
      localStorage.setItem('sam_sidebar_collapsed', collapsed ? '1' : '0');
      button.textContent = collapsed ? '»' : '«';
    });
    headerLeft.appendChild(button);
  };
  const patchNavigation = () => {
    if (!window.App || window.App.__materialDashboardPrototypePatched) return;
    const original = window.App.switchTab;
    if (typeof original !== 'function') return;
    window.App.switchTab = function () {
      const result = original.apply(this, arguments);
      setTimeout(applyShellState, 0);
      return result;
    };
    window.App.__materialDashboardPrototypePatched = true;
  };
  const boot = () => { patchNavigation(); setTimeout(applyShellState, 80); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
