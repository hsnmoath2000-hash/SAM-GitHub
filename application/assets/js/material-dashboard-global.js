/* Global Material Dashboard behavior — presentation only. */
(function () {
  'use strict';
  const applyTheme = () => {
    document.body.classList.add('sam-material-theme');
    const dashboard = !window.App || !window.App.currentTab || window.App.currentTab === 'dashboard';
    document.body.classList.toggle('sam-dashboard-prototype', dashboard);
    const saved = localStorage.getItem('sam_sidebar_collapsed') === '1';
    document.body.classList.toggle('sam-sidebar-collapsed', saved);
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
  const patch = () => {
    if (!window.App || window.App.__materialGlobalPatched) return;
    const original = window.App.switchTab;
    if (typeof original !== 'function') return;
    window.App.switchTab = function () {
      const result = original.apply(this, arguments);
      setTimeout(applyTheme, 0);
      return result;
    };
    window.App.__materialGlobalPatched = true;
  };
  const boot = () => { patch(); setTimeout(applyTheme, 80); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
