/**
 * SAM Network Manager — Canonical Page Builder & Archetype Engine
 * ==============================================================================
 * Provides standard builder functions to render uniform, responsive, and
 * highly ergonomic page layouts for all 5 functional archetypes:
 * 1. Data-Dense & Table Operations (users, active_sessions, routers, logs)
 * 2. POS & Touch Terminals (sales, warehouses, batch_gen)
 * 3. Financial Ledgers & Double-Entry (vouchers, cashbox, journals)
 * 4. Executive Dashboards (dashboard, noc, distributor-wallets)
 * 5. Visual Designers & System Config (templates, owner console, permissions)
 * ==============================================================================
 */
(function (window) {
  'use strict';

  window.SamUI = window.SamUI || {};
  const SamUI = window.SamUI;

  const esc = (val) => String(val ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  /**
   * Render a complete canonical Page Shell
   */
  function renderShell(opts = {}) {
    const {
      id = 'page',
      archetype = 'table', // 'table' | 'pos' | 'ledger' | 'dashboard' | 'designer'
      title = '',
      subtitle = '',
      eyebrow = '',
      icon = '',
      actions = [], // Array of { label, icon, variant, onclick, title, attrs }
      stats = [],   // Array of { label, value, icon, tone, meta, onclick, active }
      toolbar = null, // HTML string or object
      content = '',
    } = opts;

    // 1. Hero Header
    const actionBtns = (actions || []).map(a => {
      if (typeof a === 'string') return a;
      const v = a.variant ? `sam-btn--${a.variant}` : 'sam-btn--secondary';
      const c = a.className ? ` ${a.className}` : '';
      const clk = a.onclick ? ` onclick="${esc(a.onclick)}"` : '';
      const tit = a.title ? ` title="${esc(a.title)}"` : '';
      const att = a.attrs ? ` ${a.attrs}` : '';
      return `<button type="button" class="sam-btn ${v}${c}"${clk}${tit}${att}>${a.icon ? `<span>${a.icon}</span>` : ''}${esc(a.label)}</button>`;
    }).join('');

    const heroHtml = `
      <header class="sam-page-hero">
        <div class="sam-page-hero-copy">
          ${icon ? `<span class="sam-ui-icon" style="font-size:28px; line-height:1;">${icon}</span>` : ''}
          <div>
            ${eyebrow ? `<span class="sam-page-eyebrow">${esc(eyebrow)}</span>` : ''}
            <h1>${esc(title)}</h1>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
        </div>
        ${actionBtns ? `<div class="sam-page-actions">${actionBtns}</div>` : ''}
      </header>
    `;

    // 2. KPI Cards Grid (if stats provided)
    let kpiHtml = '';
    if (stats && stats.length > 0) {
      const cards = stats.map(s => {
        const tone = s.tone || 'blue';
        const isAct = s.active ? ' sam-kpi-card--active' : '';
        const clk = s.onclick ? ` onclick="${esc(s.onclick)}" style="cursor:pointer;"` : '';
        const tit = s.title ? ` title="${esc(s.title)}"` : '';
        return `
          <div class="kpi-card sam-ui-kpi sam-ui-kpi-${tone}${isAct}"${clk}${tit}>
            <div class="sam-ui-kpi-label">
              ${s.icon ? `<span style="font-size:16px;">${s.icon}</span>` : ''}
              <span>${esc(s.label)}</span>
            </div>
            <strong>${s.value ?? '—'}</strong>
            ${s.meta ? `<small>${esc(s.meta)}</small>` : ''}
          </div>
        `;
      }).join('');
      kpiHtml = `<section class="kpi-grid sam-ui-kpis" style="margin-bottom:14px;">${cards}</section>`;
    }

    // 3. Toolbar (if provided)
    let toolbarHtml = '';
    if (typeof toolbar === 'string') {
      toolbarHtml = toolbar;
    } else if (toolbar && typeof toolbar === 'object') {
      const leftItems = (toolbar.left || []).join('');
      const rightItems = (toolbar.right || []).join('');
      toolbarHtml = `
        <div class="sam-toolbar">
          <div class="sam-toolbar-group mt-toolbar-left">${leftItems}</div>
          <div class="sam-toolbar-group mt-toolbar-right">${rightItems}</div>
        </div>
      `;
    }

    return `
      <main class="sam-page-shell sam-ui-page" data-sam-page="${esc(id)}" data-sam-archetype="${esc(archetype)}" dir="rtl">
        ${heroHtml}
        <div class="view-scroll-content">
          ${kpiHtml}
          ${toolbarHtml}
          ${content}
        </div>
      </main>
    `;
  }

  /**
   * Render a standardized Data Table with Sticky Header
   */
  function renderTable(opts = {}) {
    const {
      id = '',
      className = '',
      columns = [], // Array of { key, label, sortable, sortKey, align, width, render }
      rows = [],
      emptyText = 'لا توجد بيانات مطابقة لمعايير البحث',
      currentSort = '',
      sortDir = 'asc',
      onSort = '',
    } = opts;

    const ths = columns.map(col => {
      const align = col.align ? ` text-align:${col.align};` : '';
      const w = col.width ? ` width:${col.width};` : '';
      const style = (align || w) ? ` style="${align}${w}"` : '';
      if (col.sortable && onSort) {
        const sKey = col.sortKey || col.key;
        const icon = currentSort === sKey ? (sortDir === 'asc' ? ' 🔼' : ' 🔽') : ' ↕️';
        return `<th${style} style="cursor:pointer; user-select:none;${align}" onclick="${esc(onSort)}('${sKey}')">${esc(col.label)}${icon}</th>`;
      }
      return `<th${style}>${esc(col.label)}</th>`;
    }).join('');

    let trs = '';
    if (!rows || rows.length === 0) {
      trs = `<tr><td colspan="${Math.max(columns.length, 1)}" style="text-align:center; padding:32px 16px; color:var(--sam-text-muted); font-size:13px;">${esc(emptyText)}</td></tr>`;
    } else {
      trs = rows.map((row, idx) => {
        const rowId = row.id !== undefined ? ` id="row-${row.id}"` : '';
        const tds = columns.map(col => {
          const val = col.render ? col.render(row, idx) : esc(row[col.key] ?? '—');
          const align = col.align ? ` style="text-align:${col.align};"` : '';
          return `<td data-label="${esc(col.label)}"${align}>${val}</td>`;
        }).join('');
        return `<tr${rowId}>${tds}</tr>`;
      }).join('');
    }

    return `
      <div class="sam-table-container mt-table-container">
        <table class="sam-table mt-table ${className}"${id ? ` id="${id}"` : ''}>
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render standardized Pagination Footer
   */
  function renderPagination(opts = {}) {
    const {
      page = 1,
      totalPages = 1,
      totalRecords = 0,
      itemName = 'سجل',
      onPageChange = 'App.setPage',
    } = opts;

    if (totalPages <= 1 && totalRecords <= 0) return '';

    return `
      <div class="sam-pagination mt-pagination" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; padding:8px 4px;">
        <div style="font-size:12.5px; color:var(--sam-text-secondary);">
          إجمالي ${esc(itemName)}: <b>${totalRecords.toLocaleString()}</b> (صفحة <b>${page}</b> من <b>${Math.max(totalPages, 1)}</b>)
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button type="button" class="sam-btn sam-btn--sm" ${page <= 1 ? 'disabled' : ''} onclick="${esc(onPageChange)}(1)" title="الصفحة الأولى">⇤ الأولى</button>
          <button type="button" class="sam-btn sam-btn--sm" ${page <= 1 ? 'disabled' : ''} onclick="${esc(onPageChange)}(${page - 1})" title="الصفحة السابقة">◀ السابق</button>
          <span style="display:inline-flex; align-items:center; justify-content:center; min-width:34px; height:30px; padding:0 10px; font-weight:700; font-size:12px; background:var(--sam-bg-surface); border:1px solid var(--sam-border-strong); border-radius:var(--sam-radius-sm); color:var(--sam-text);">${page}</span>
          <button type="button" class="sam-btn sam-btn--sm" ${page >= totalPages ? 'disabled' : ''} onclick="${esc(onPageChange)}(${page + 1})" title="الصفحة التالية">التالي ▶</button>
          <button type="button" class="sam-btn sam-btn--sm" ${page >= totalPages ? 'disabled' : ''} onclick="${esc(onPageChange)}(${totalPages})" title="الصفحة الأخيرة">الأخيرة ⇥</button>
        </div>
      </div>
    `;
  }

  /**
   * Render standardized Quick Search Box
   */
  function renderQuickSearch(opts = {}) {
    const {
      id = 'quick-search-input',
      placeholder = 'بحث سريع...',
      value = '',
      oninput = '',
      onclear = '',
      minWidth = '200px'
    } = opts;

    const clearBtn = onclear ? `
      <button type="button" class="quick-table-search-clear" onclick="${esc(onclear)}" title="مسح البحث">✕</button>
    ` : '';

    return `
      <div class="quick-table-search" style="min-width:${minWidth}; margin:0;">
        <span class="quick-table-search-icon">🔍</span>
        <input type="text" id="${id}" class="quick-table-search-input" placeholder="${esc(placeholder)}" value="${esc(value)}" oninput="${esc(oninput)}" />
        ${clearBtn}
      </div>
    `;
  }

  // Export to SamUI namespace
  SamUI.PageBuilder = {
    esc,
    renderShell,
    renderTable,
    renderPagination,
    renderQuickSearch
  };
  window.SamPageBuilder = SamUI.PageBuilder;

})(window);
