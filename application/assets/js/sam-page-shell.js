/* SAM Page Shell bridge: global layout, density and table modes for every module. */
(function (window) {
  'use strict';
  const densityClasses = ['sam-density-compact', 'sam-density-comfortable'];
  const tableClasses = ['sam-table-standard', 'sam-table-compact', 'sam-table-cards'];
  function sync() {
    const app = window.App || {};
    const ui = app.uiSettings || {};
    const tableDefaults = ui.table_defaults || {};
    const density = ui.layout_density || tableDefaults.density || 'normal';
    const mode = tableDefaults.view_mode || ui.table_view_mode || 'standard';
    const body = document.body;
    const root = document.getElementById('main-view');
    if (!body) return;
    body.classList.remove(...densityClasses, ...tableClasses);
    if (density === 'compact') body.classList.add('sam-density-compact');
    if (density === 'comfortable') body.classList.add('sam-density-comfortable');
    body.classList.add('sam-table-' + (mode === 'cards' ? 'cards' : mode === 'compact' ? 'compact' : 'standard'));
    if (root) {
      root.classList.add('sam-page-shell');
      root.dataset.samPage = app.currentTab || 'unknown';
    }
    document.documentElement.dataset.samDensity = density;
    document.documentElement.dataset.samTableMode = mode;
  }
  window.SamPageShell = { sync };
  if (window.App && typeof window.App.applyThemePalette === 'function') {
    const original = window.App.applyThemePalette;
    window.App.applyThemePalette = function () {
      const result = original.apply(this, arguments);
      sync();
      return result;
    };
  }
  if (window.MutationObserver) {
    const observe = () => { const root = document.getElementById('main-view'); if (root) new MutationObserver(sync).observe(root, { childList: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true }); else observe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})(window);
