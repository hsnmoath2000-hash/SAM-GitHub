/* Clear Arabic fallbacks for table cards when a table has missing headers. */
(function () {
  'use strict';
  const fallback = ['البيان', 'التفاصيل', 'القيمة', 'الحالة', 'التاريخ', 'الإجراء'];
  const apply = () => document.querySelectorAll('table.mt-table').forEach(table => {
    if (table.closest('.sam-print-preview-modal, .sam-a4-invoice, .sam-purchase-invoice-doc, .thermal-receipt')) return;
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => row.querySelectorAll('td').forEach((cell, index) => {
      if (!cell.getAttribute('data-label') || /^عمود\s+\d+$/.test(cell.getAttribute('data-label'))) cell.setAttribute('data-label', headers[index] || fallback[index] || `البيان ${index + 1}`);
    }));
  });
  const boot = () => { apply(); try { let timer; new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 140); }).observe(document.body, { childList:true, subtree:true }); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
