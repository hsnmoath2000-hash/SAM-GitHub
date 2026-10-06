/* SAM UI shared components for sales and POS pages. */
(function (window) {
  'use strict';
  window.SamUI = window.SamUI || {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const attrs = object => Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== null && value !== false).map(([key, value]) => `${key}="${esc(value === true ? key : value)}"`).join(' ');
  const icon = value => value ? `<span class="sam-ui-icon" aria-hidden="true">${esc(value)}</span>` : '';
  function actions(items = []) {
    return `<div class="sam-page-actions">${items.filter(Boolean).map(item => {
      if (typeof item === 'string') return item;
      return `<button type="${item.type || 'button'}" class="sam-ui-btn ${item.variant || ''}" ${attrs(item.attrs)}>${icon(item.icon)}${esc(item.label || '')}</button>`;
    }).join('')}</div>`;
  }
  function hero(options = {}) {
    return `<header class="sam-page-hero"><div class="sam-page-hero-copy">${icon(options.icon)}<div>${options.eyebrow ? `<span class="sam-page-eyebrow">${esc(options.eyebrow)}</span>` : ''}<h1>${esc(options.title || '')}</h1>${options.description ? `<p>${esc(options.description)}</p>` : ''}</div></div>${actions(options.actions)}</header>`;
  }
  function pageShell(options = {}, body = '') {
    const id = options.id || 'page';
    return `<main class="sam-page-shell sam-ui-page" data-sam-page="${esc(id)}" dir="rtl">${hero(options)}${body}</main>`;
  }
  function filterPanel(options = {}) {
    return `<section class="sam-page-filters sam-ui-filters" aria-label="${esc(options.label || 'فلاتر الصفحة')}"><div class="sam-ui-filter-fields">${options.fields || ''}</div>${actions(options.actions || [{ label:'تطبيق', icon:'✓', variant:'primary', attrs:{ 'data-sam-action':'apply-filters' } }])}</section>`;
  }
  function field(label, control, hint = '') {
    return `<label class="sam-ui-field"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }
  function kpi(options = {}) {
    const tone = options.tone || 'blue';
    return `<article class="sam-ui-kpi sam-ui-kpi-${esc(tone)}"><div class="sam-ui-kpi-label">${icon(options.icon)}<span>${esc(options.label || '')}</span></div><strong>${options.value ?? '—'}</strong>${options.meta ? `<small>${esc(options.meta)}</small>` : ''}</article>`;
  }
  function kpis(items = []) { return `<section class="sam-page-kpis sam-ui-kpis">${items.map(kpi).join('')}</section>`; }
  function panel(options = {}, body = '') {
    return `<section class="sam-page-panel sam-ui-panel ${esc(options.className || '')}"><header class="sam-ui-panel-head"><div><h2>${esc(options.title || '')}</h2>${options.description ? `<p>${esc(options.description)}</p>` : ''}</div>${actions(options.actions)}</header><div class="sam-ui-panel-body">${body}</div></section>`;
  }
  function table(options = {}) {
    const columns = options.columns || [];
    const rows = options.rows || [];
    const empty = options.empty || 'لا توجد بيانات مطابقة.';
    const body = rows.length ? rows.map(row => `<tr>${columns.map(col => `<td data-label="${esc(col.label)}">${col.render ? col.render(row) : esc(row[col.key])}</td>`).join('')}</tr>`).join('') : `<tr><td class="sam-ui-empty" colspan="${Math.max(columns.length, 1)}">${esc(empty)}</td></tr>`;
    return `<div class="sam-ui-table-wrap"><table class="sam-ui-table"><thead><tr>${columns.map(col => `<th scope="col">${esc(col.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function loading(message = 'جاري تحميل البيانات...') { return `<div class="sam-ui-state sam-ui-loading" role="status"><span class="sam-ui-spinner"></span>${esc(message)}</div>`; }
  function empty(message = 'لا توجد بيانات.', action = '') { return `<div class="sam-ui-state sam-ui-empty-state"><strong>${esc(message)}</strong>${action}</div>`; }
  function error(message = 'تعذر تحميل البيانات.', retry = '') { return `<div class="sam-ui-state sam-ui-error-state"><strong>${esc(message)}</strong>${retry}</div>`; }
  function exportCsv(rows, columns, filename = 'sam-export.csv') {
    const escapeCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [columns.map(c => escapeCell(c.label)).join(','), ...rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','))].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  Object.assign(window.SamUI, { Components: { esc, actions, hero, pageShell, filterPanel, field, kpi, kpis, panel, table, loading, empty, error, exportCsv } });
})(window);
