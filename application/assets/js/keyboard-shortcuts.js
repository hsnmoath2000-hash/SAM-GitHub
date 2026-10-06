/* Keyboard shortcuts for navigation and finance forms. No operation is submitted automatically. */
(function () {
  'use strict';
  const isEditing = (target) => {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    return ['input', 'textarea', 'select'].includes(tag) || target.isContentEditable;
  };
  const canOpen = (tab) => !window.App || typeof window.App.hasAccess !== 'function' || window.App.hasAccess(tab);
  const openVoucher = (type) => {
    if (!canOpen('vouchers_fin')) return window.App?.toast?.('لا تملك صلاحية فتح السندات المالية', 'warning');
    if (typeof window.App.showVoucherModal === 'function') window.App.showVoucherModal(type);
    else window.App?.switchTab?.('vouchers_fin');
  };
  document.addEventListener('keydown', (event) => {
    if (isEditing(event.target)) return;
    const key = (event.key || '').toLowerCase();
    if (key === 'escape') { window.App?.closeModal?.(); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault(); const search = document.getElementById('nav-search-input'); if (search) { search.focus(); search.select(); } return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'f2') { event.preventDefault(); openVoucher('receipt'); return; }
    if (key === 'f3') { event.preventDefault(); openVoucher('payment'); return; }
    if (key === 'f4') { event.preventDefault(); if (canOpen('sales')) window.App?.switchTab?.('sales'); return; }
    if (key === 'f5' && window.App?.currentTab === 'dashboard') { event.preventDefault(); window.App?.renderDashboard?.(); }
  });
  const installHint = () => {
    const header = document.querySelector('.mt-header-right');
    if (!header || document.getElementById('keyboard-shortcuts-hint')) return;
    const hint = document.createElement('span');
    hint.id = 'keyboard-shortcuts-hint'; hint.className = 'keyboard-shortcuts-hint';
    hint.title = 'F2 سند قبض · F3 سند صرف · F4 المبيعات · Ctrl+K البحث · Esc إغلاق';
    hint.textContent = '⌨ الاختصارات';
    header.prepend(hint);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(installHint, 120));
  else setTimeout(installHint, 120);
})();
