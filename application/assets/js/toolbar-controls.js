/* Compact toolbar controls — keeps essential actions visible and preserves handlers. */
(function () {
  'use strict';
  const replacements = [
    ['تحديث المؤشرات', 'تحديث'], ['تحديث البيانات', 'تحديث'], ['استوديو التخصيص', 'التخصيص'],
    ['إضافة بطاقة إحصائية جديدة إلى لوحة التحكم', 'إضافة بطاقة'], ['إدارة وتعديل الاختصارات', 'إدارة'],
    ['فتح بوابة المشتركين المستقلة', 'البوابة'], ['مركز الإشعارات والتنبيهات', 'الإشعارات'],
    ['إنشاء فاتورة جديدة', 'فاتورة'], ['إضافة فاتورة شراء', 'فاتورة شراء'], ['إضافة سند قبض', 'سند قبض'],
    ['إضافة سند صرف', 'سند صرف'], ['حفظ واستمرار', 'حفظ'], ['حفظ وإغلاق', 'حفظ'],
    ['تعديل البيانات', 'تعديل'], ['حذف السجل', 'حذف'], ['إلغاء العملية', 'إلغاء'],
    ['تصدير إلى Excel', 'Excel'], ['تصدير إلى PDF', 'PDF'], ['طباعة التقرير', 'طباعة']
  ];
  const shortenText = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(textNode => { let value = textNode.nodeValue; replacements.forEach(([longText, shortText]) => { value = value.replaceAll(longText, shortText); }); textNode.nodeValue = value; });
  };
  const closeMenus = (except) => document.querySelectorAll('.sam-toolbar-menu.open').forEach(menu => { if (menu !== except) menu.classList.remove('open'); });
  const isEssential = (button) => {
    const text = `${button.innerText || ''} ${button.title || ''} ${button.getAttribute('aria-label') || ''}`.toLocaleLowerCase('ar');
    return button.classList.contains('mt-btn-primary') || /بحث|تصف|search|تحديث|refresh|إضافة|اضاف|جديد|new|create/.test(text);
  };
  const compactToolbar = (toolbar) => {
    if (!toolbar || toolbar.dataset.compacted === '1' || toolbar.closest('.mt-modal, .sam-print-preview-modal, .sam-print-actions-bar')) return;
    const buttons = Array.from(toolbar.querySelectorAll(':scope > button, :scope > .mt-btn, :scope > a'));
    buttons.forEach(shortenText);
    const move = buttons.filter((button, index) => index > 0 && !isEssential(button));
    if (!move.length) return;
    const menu = document.createElement('div'); menu.className = 'sam-toolbar-menu-wrap';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'mt-btn sam-toolbar-more'; toggle.innerHTML = '⋯ <span>المزيد</span>'; toggle.setAttribute('aria-expanded', 'false');
    const dropdown = document.createElement('div'); dropdown.className = 'sam-toolbar-menu';
    move.forEach(button => { button.classList.add('sam-menu-action'); dropdown.appendChild(button); });
    menu.append(toggle, dropdown); toolbar.appendChild(menu); toolbar.dataset.compacted = '1';
    toggle.addEventListener('click', event => { event.stopPropagation(); closeMenus(dropdown); const open = dropdown.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
  };
  const process = () => {
    document.body.classList.add('sam-compact-controls');
    document.querySelectorAll('.mt-toolbar-right, .sam-dept-actions, .owner-actions, .owner-service-actions, .gov-hero-actions').forEach(compactToolbar);
    document.querySelectorAll('.mt-page-header, .page-header').forEach(header => { shortenText(header); header.querySelectorAll('.actions, .action-bar, .toolbar-actions').forEach(compactToolbar); });
    document.querySelectorAll('.gov-save-actions, .sam-print-actions-bar, .mt-modal-footer').forEach(shortenText);
  };
  const trackHeader = () => {
    const header = document.querySelector('.mt-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const update = () => document.body.style.setProperty('--sam-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    update();
    new ResizeObserver(update).observe(header);
  };
  document.addEventListener('click', () => closeMenus(null));
  const boot = () => { process(); trackHeader(); try { let timer; const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(process, 100); }); observer.observe(document.body, { childList:true, subtree:true }); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
