/**
 * SAM Universal Table Manager & Mobile Column Controller
 * يتيح التحكم الكامل في جداول النظام: إظهار وإخفاء الأعمدة، إعادة ترتيبها، تحجيمها، 
 * والتحويل إلى نمط البطاقات الذكية للهاتف (Mobile Card View) مع الحفظ التلقائي.
 */
'use strict';

window.SamTableManager = (function () {
    const STORAGE_PREFIX = 'sam_table_cfg_';
    let isEnhancing = false;

    function cleanHeaderTitle(text) {
        if (!text) return '';
        return text.replace(/[\u25B2\u25BC\u2195\u2B06\u2B07\u2191\u2193\u21C5🔼🔽↕️▲▼⬆⬇]/g, '').replace(/\s+/g, ' ').trim();
    }

    function getTableKey(table) {
        if (!table) return 'default_table';
        if (table.id) return table.id;
        const currentTab = (window.App && window.App.currentTab) ? window.App.currentTab : '';
        const shell = table.closest('.sam-page-shell');
        const pageId = shell ? shell.getAttribute('data-sam-page') : '';
        const parentContainer = table.closest('.tab-pane, .sam-subtab-pane, #main-view');
        const containerId = pageId || (parentContainer ? (parentContainer.id || parentContainer.getAttribute('data-tab') || '') : '');
        
        // Hash the column titles without sort icons
        const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
        const headersSignature = ths.map(th => cleanHeaderTitle(th.innerText).slice(0, 10)).join('_');
        return `${currentTab || 'global'}_${containerId}_${headersSignature}`.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
    }

    function getSavedConfig(tableKey) {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function saveConfig(tableKey, config) {
        try {
            localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(config));
        } catch (_) {}
    }

    function extractColumns(table) {
        const thead = table.querySelector('thead');
        const headerRow = thead ? thead.querySelector('tr') : table.querySelector('tr');
        if (!headerRow) return [];

        const ths = Array.from(headerRow.children);
        return ths.map((th, index) => {
            const title = cleanHeaderTitle(th.innerText) || `عمود #${index + 1}`;
            let origIdx = th.getAttribute('data-orig-index');
            if (origIdx === null) {
                origIdx = String(index);
                th.setAttribute('data-orig-index', origIdx);
            }
            const colId = th.getAttribute('data-col-id') || `col_${origIdx}`;
            th.setAttribute('data-col-id', colId);
            return {
                id: colId,
                title: title,
                origIndex: parseInt(origIdx),
                visible: th.style.display !== 'none' && !th.classList.contains('sam-col-hidden'),
                width: th.style.width || ''
            };
        });
    }

    function applyConfigToTable(table, config) {
        if (!table || !config) return;

        // 1. Apply Card View Mode on Mobile
        if (config.cardMode) {
            table.classList.add('sam-table-card-view');
            table.classList.remove('sam-table-traditional-view');
        } else {
            table.classList.remove('sam-table-card-view');
            table.classList.add('sam-table-traditional-view');
        }

        // 2. Apply Font Size / Density
        table.classList.remove('sam-table-font-sm', 'sam-table-font-md', 'sam-table-font-lg');
        if (config.fontSize) {
            table.classList.add(`sam-table-font-${config.fontSize}`);
        }

        // 3. Extract columns mapping from current header row
        const thead = table.querySelector('thead');
        const headerRow = thead ? thead.querySelector('tr') : table.querySelector('tr');
        if (!headerRow) return;

        const ths = Array.from(headerRow.children);
        const colMap = {};
        ths.forEach((th, idx) => {
            let origIdx = th.getAttribute('data-orig-index');
            if (origIdx === null) {
                origIdx = String(idx);
                th.setAttribute('data-orig-index', origIdx);
            }
            const colId = th.getAttribute('data-col-id') || `col_${origIdx}`;
            th.setAttribute('data-col-id', colId);
            colMap[colId] = { 
                th, 
                origIndex: parseInt(origIdx), 
                currentIdx: idx, 
                title: cleanHeaderTitle(th.innerText) 
            };
        });

        // 4. Label all td elements with data-label for responsive card mode
        const rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
        rows.forEach(tr => {
            const tds = Array.from(tr.children);
            tds.forEach((td, idx) => {
                if (ths[idx]) {
                    const label = cleanHeaderTitle(ths[idx].innerText);
                    if (label && label !== '✕' && label !== '#' && label !== 'الإجراء') {
                        td.setAttribute('data-label', label);
                    }
                }
                const txt = (td.innerText || '').trim();
                const hasInteractive = td.querySelector('button, a, input, select, img, svg, .mt-btn, .ib-badge');
                if (!txt && !hasInteractive) {
                    td.classList.add('sam-empty-cell');
                } else {
                    td.classList.remove('sam-empty-cell');
                }
            });
        });

        // 5. Apply Visibility and Reordering
        if (Array.isArray(config.columns) && config.columns.length > 0) {
            const newThOrder = [];
            config.columns.forEach(colCfg => {
                let target = colMap[colCfg.id];
                if (!target) {
                    const foundKey = Object.keys(colMap).find(k => colMap[k].title === colCfg.title);
                    if (foundKey) target = colMap[foundKey];
                }
                if (target) {
                    newThOrder.push({ target, visible: colCfg.visible !== false, width: colCfg.width });
                }
            });

            if (newThOrder.length === ths.length) {
                // Reorder THs in header
                newThOrder.forEach(item => {
                    headerRow.appendChild(item.target.th);
                    if (!item.visible) {
                        item.target.th.style.setProperty('display', 'none', 'important');
                        item.target.th.classList.add('sam-col-hidden');
                    } else {
                        item.target.th.style.removeProperty('display');
                        item.target.th.classList.remove('sam-col-hidden');
                        if (item.width) item.target.th.style.width = item.width;
                    }
                });

                // Reorder TDs in rows
                rows.forEach(tr => {
                    const currentTds = Array.from(tr.children);
                    if (currentTds.length === ths.length) {
                        newThOrder.forEach(item => {
                            const td = currentTds[item.target.origIndex];
                            if (td) {
                                tr.appendChild(td);
                                if (!item.visible) {
                                    td.style.setProperty('display', 'none', 'important');
                                    td.classList.add('sam-col-hidden');
                                } else {
                                    td.style.removeProperty('display');
                                    td.classList.remove('sam-col-hidden');
                                }
                            }
                        });
                    }
                });
            } else {
                // Visibility fallback
                config.columns.forEach(colCfg => {
                    let target = colMap[colCfg.id];
                    if (!target) {
                        const foundKey = Object.keys(colMap).find(k => colMap[k].title === colCfg.title);
                        if (foundKey) target = colMap[foundKey];
                    }
                    if (!target) return;
                    const idx = target.currentIdx;

                    if (colCfg.visible === false) {
                        target.th.style.setProperty('display', 'none', 'important');
                        target.th.classList.add('sam-col-hidden');
                    } else {
                        target.th.style.removeProperty('display');
                        target.th.classList.remove('sam-col-hidden');
                    }

                    rows.forEach(tr => {
                        const td = tr.children[idx];
                        if (td) {
                            if (colCfg.visible === false) {
                                td.style.setProperty('display', 'none', 'important');
                                td.classList.add('sam-col-hidden');
                            } else {
                                td.style.removeProperty('display');
                                td.classList.remove('sam-col-hidden');
                            }
                        }
                    });
                });
            }
        }
    }

    function enhanceAllTables() {
        if (isEnhancing) return;
        isEnhancing = true;

        try {
            const tables = document.querySelectorAll('.sam-table, .mt-table, table.table');
            const breadcrumbBtn = document.getElementById('bc-table-customizer-btn');
            let hasVisibleTable = false;

            tables.forEach(table => {
                if (table.closest('.sam-table-studio-modal') || table.classList.contains('no-enhance')) return;

                hasVisibleTable = true;
                const tableKey = getTableKey(table);
                const saved = getSavedConfig(tableKey);
                if (saved) {
                    applyConfigToTable(table, saved);
                }

                const wrap = table.closest('.sam-table-container, .mt-table-wrap, .mt-table-container') || table.parentElement;
                if (!wrap) return;

                // Remove any legacy injected headers to keep the page clean and unified
                const prevEl = wrap.previousElementSibling;
                if (prevEl && prevEl.classList.contains('sam-table-control-header')) {
                    prevEl.remove();
                }

                // Single, clean customizer button inside toolbar
                const card = wrap.closest('.sam-page-shell, .mt-card, .tab-pane, #main-view, .mt-content');
                if (card) {
                    const toolbar = card.querySelector('.sam-toolbar, .mt-toolbar, .sam-page-actions');
                    if (toolbar && !card.querySelector('.sam-toolbar-customizer-btn')) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'mt-btn sam-btn sam-btn--secondary sam-toolbar-customizer-btn';
                        btn.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; gap:5px; font-weight:700; font-size:12px; cursor:pointer; padding:7px 12px; min-height:38px; border-radius:6px; touch-action:manipulation; position:relative; z-index:2;';
                        btn.title = 'تخصيص أعمدة وترتيب الجدول ونمط الهاتف';
                        btn.innerHTML = '⚙️ تخصيص الجدول';
                        btn.addEventListener('click', function(event) { event.preventDefault(); event.stopPropagation(); window.SamTableManager.openModal(this); }, { passive: false });

                        const targetGroup = toolbar.querySelector('.sam-toolbar-group:last-child, .mt-toolbar-right, .mt-toolbar-left') || toolbar;
                        targetGroup.appendChild(btn);
                    }
                }
            });

            if (breadcrumbBtn) {
                breadcrumbBtn.style.display = hasVisibleTable ? 'inline-flex' : 'none';
            }
        } finally {
            isEnhancing = false;
        }
    }

    function findTableForElement(el) {
        if (!el) return document.querySelector('.sam-table, .mt-table, table.table');
        if (el.tagName === 'TABLE') return el;
        
        // Check next sibling wrap
        const wrap = el.nextElementSibling;
        if (wrap && wrap.querySelector('table')) return wrap.querySelector('table');

        // Check parent container
        const parent = el.closest('.sam-table-container, .mt-table-wrap, .sam-page-shell, .mt-card, .tab-pane, .sam-subtab-pane, #main-view');
        if (parent) {
            const found = parent.querySelector('.sam-table, .mt-table, table.table');
            if (found) return found;
        }

        return document.querySelector('.sam-table, .mt-table, table.table');
    }

    function openModal(btnOrTable) {
        if (typeof btnOrTable === 'object' && btnOrTable?.preventDefault) btnOrTable.preventDefault();
        const table = findTableForElement(btnOrTable);
        if (!table) {
            if (window.App && App.toast) App.toast('لا يوجد جدول معروض في هذه الشاشة حالياً', 'warning');
            return;
        }

        const tableKey = getTableKey(table);
        const cols = extractColumns(table);
        const saved = getSavedConfig(tableKey) || { columns: cols, cardMode: false, fontSize: 'md' };

        // Merge saved visibility with current columns
        const mergedCols = cols.map(c => {
            const found = (saved.columns || []).find(sc => sc.id === c.id || sc.title === c.title);
            return {
                ...c,
                visible: found ? found.visible !== false : true,
                width: found ? found.width : c.width
            };
        });

        // If saved had reordered columns, sort mergedCols according to saved order
        if (Array.isArray(saved.columns) && saved.columns.length > 0) {
            mergedCols.sort((a, b) => {
                const idxA = saved.columns.findIndex(sc => sc.id === a.id || sc.title === a.title);
                const idxB = saved.columns.findIndex(sc => sc.id === b.id || sc.title === b.title);
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <span style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:8px;">⚙️ مدير أعمدة وتنسيق الجدول الذكي</span>
                <span style="cursor:pointer; font-size:18px; font-weight:700; padding:4px 8px;" onclick="App.closeModal()">✕</span>
            </div>
            <div class="mt-modal-body sam-table-studio-modal" data-view-mode="${saved.cardMode ? 'card' : 'table'}" style="padding:16px; max-height:calc(88dvh - 120px); overflow-y:auto; -webkit-overflow-scrolling:touch;">
                <!-- 1. Quick Mobile View Mode -->
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; margin-bottom:14px;">
                    <div style="font-weight:800; font-size:13px; color:#0f172a; margin-bottom:8px;">📱 نمط العرض للهاتف:</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" id="stb-mode-table" class="mt-btn ${!saved.cardMode ? 'mt-btn-primary' : ''}" style="flex:1; min-height:38px; font-weight:700;" onclick="SamTableManager.setModalViewMode(false)">
                            📊 جدول تقليدي متجاوب
                        </button>
                        <button type="button" id="stb-mode-card" class="mt-btn ${saved.cardMode ? 'mt-btn-primary' : ''}" style="flex:1; min-height:38px; font-weight:700;" onclick="SamTableManager.setModalViewMode(true)">
                            🗂️ نمط بطاقات الهاتف (Card View)
                        </button>
                    </div>
                </div>

                <!-- 2. Font Size / Density -->
                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; margin-bottom:14px;">
                    <div style="font-weight:800; font-size:13px; color:#0f172a; margin-bottom:8px;">🔤 حجم الخط ومستوى الكثافة:</div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="mt-btn ${saved.fontSize === 'sm' ? 'mt-btn-primary' : ''}" style="flex:1; font-size:11px; font-weight:700;" onclick="SamTableManager.setModalFontSize('sm')">صغير (مضغوط)</button>
                        <button type="button" class="mt-btn ${saved.fontSize === 'md' || !saved.fontSize ? 'mt-btn-primary' : ''}" style="flex:1; font-size:13px; font-weight:700;" onclick="SamTableManager.setModalFontSize('md')">متوسط (افتراضي)</button>
                        <button type="button" class="mt-btn ${saved.fontSize === 'lg' ? 'mt-btn-primary' : ''}" style="flex:1; font-size:15px; font-weight:700;" onclick="SamTableManager.setModalFontSize('lg')">كبير ومريح</button>
                    </div>
                </div>

                <!-- 3. Columns List -->
                <div style="font-weight:800; font-size:13px; color:#0f172a; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>👁️ إظهار وإخفاء وترتيب الأعمدة (${mergedCols.length} عمود):</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="mt-btn" style="font-size:11px; padding:3px 8px; font-weight:600;" onclick="SamTableManager.toggleAllModalColumns(true)">إظهار الكل</button>
                        <button type="button" class="mt-btn" style="font-size:11px; padding:3px 8px; font-weight:600;" onclick="SamTableManager.toggleAllModalColumns(false)">إخفاء الكل</button>
                    </div>
                </div>
                <div id="stb-cols-list" style="display:flex; flex-direction:column; gap:6px;">
                    ${mergedCols.map((c, i) => `
                        <div class="sam-stb-col-item" data-col-id="${c.id}" style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; font-size:13px; flex:1; margin:0;">
                                <input type="checkbox" class="stb-col-check" data-col-id="${c.id}" ${c.visible ? 'checked' : ''} style="width:18px; height:18px; accent-color:#0078d7;" />
                                <span>${c.title}</span>
                            </label>
                            <div style="display:flex; gap:4px;">
                                <button type="button" class="mt-btn" style="padding:2px 8px; font-size:12px;" onclick="SamTableManager.moveModalColumn(this, -1)" ${i === 0 ? 'disabled' : ''}>⬆️</button>
                                <button type="button" class="mt-btn" style="padding:2px 8px; font-size:12px;" onclick="SamTableManager.moveModalColumn(this, 1)" ${i === mergedCols.length - 1 ? 'disabled' : ''}>⬇️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="mt-modal-footer sam-table-studio-footer" style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; padding:12px 16px; background:#f8fafc; border-top:1px solid #cbd5e1;">
                <button type="button" class="mt-btn mt-btn-success" style="flex:2; font-weight:800; font-size:14px; min-height:40px;" onclick="SamTableManager.applyFromModal('${tableKey}')">
                    💾 حفظ وتطبيق التخصيص فوراً
                </button>
                <button type="button" class="mt-btn mt-btn-danger" style="flex:1; min-height:40px; font-weight:700;" onclick="SamTableManager.resetTableConfig('${tableKey}')">
                    🔄 استعادة الافتراضي
                </button>
            </div>
        `;

        if (window.App && App.openModal) {
            App.openModal(modalHtml, '560px');
        }
    }

    function setModalViewMode(isCard) {
        const btnTable = document.getElementById('stb-mode-table');
        const btnCard = document.getElementById('stb-mode-card');
        const studio = document.querySelector('.sam-table-studio-modal');
        if (studio) studio.dataset.viewMode = isCard ? 'card' : 'table';
        if (btnTable && btnCard) {
            if (isCard) {
                btnCard.classList.add('mt-btn-primary');
                btnTable.classList.remove('mt-btn-primary');
            } else {
                btnTable.classList.add('mt-btn-primary');
                btnCard.classList.remove('mt-btn-primary');
            }
        }
    }

    function setModalFontSize(size) {
        const btns = document.querySelectorAll('.sam-table-studio-modal button[onclick^="SamTableManager.setModalFontSize"]');
        btns.forEach(b => {
            if (b.getAttribute('onclick').includes(`'${size}'`)) {
                b.classList.add('mt-btn-primary');
            } else {
                b.classList.remove('mt-btn-primary');
            }
        });
    }

    function toggleAllModalColumns(state) {
        document.querySelectorAll('#stb-cols-list .stb-col-check').forEach(chk => chk.checked = state);
    }

    function moveModalColumn(btn, direction) {
        const item = btn.closest('.sam-stb-col-item');
        if (!item) return;
        if (direction === -1 && item.previousElementSibling) {
            item.parentNode.insertBefore(item, item.previousElementSibling);
        } else if (direction === 1 && item.nextElementSibling) {
            item.parentNode.insertBefore(item, item.nextElementSibling);
        }
    }

    function applyFromModal(tableKey) {
        const studio = document.querySelector('.sam-table-studio-modal');
        const isCard = studio ? studio.dataset.viewMode === 'card' : (document.getElementById('stb-mode-card')?.classList.contains('mt-btn-primary') || false);
        let fontSize = 'md';
        const activeFontBtn = document.querySelector('.sam-table-studio-modal button.mt-btn-primary[onclick^="SamTableManager.setModalFontSize"]');
        if (activeFontBtn) {
            if (activeFontBtn.getAttribute('onclick').includes("'sm'")) fontSize = 'sm';
            if (activeFontBtn.getAttribute('onclick').includes("'lg'")) fontSize = 'lg';
        }

        const columns = [];
        document.querySelectorAll('#stb-cols-list .sam-stb-col-item').forEach(item => {
            const colId = item.getAttribute('data-col-id');
            const chk = item.querySelector('.stb-col-check');
            const title = item.querySelector('label span')?.innerText || '';
            columns.push({
                id: colId,
                title: title,
                visible: chk ? chk.checked : true
            });
        });

        const config = {
            cardMode: isCard,
            fontSize: fontSize,
            columns: columns
        };

        saveConfig(tableKey, config);

        // Find table and apply immediately
        const tables = document.querySelectorAll('.sam-table, .mt-table, table.table');
        tables.forEach(t => {
            if (getTableKey(t) === tableKey) {
                // Explicitly switch both directions; removing the card class
                // is required for the traditional table CSS on mobile.
                t.classList.toggle('sam-table-card-view', config.cardMode === true);
                t.classList.toggle('sam-table-traditional-view', config.cardMode !== true);
                applyConfigToTable(t, config);
            }
        });

        if (window.App && App.closeModal) App.closeModal();
        if (window.App && App.toast) App.toast('تم تطبيق وحفظ تخصيص الجدول بنجاح 🚀', 'success');
    }

    function resetTableConfig(tableKey) {
        try {
            localStorage.removeItem(STORAGE_PREFIX + tableKey);
        } catch (_) {}

        const tables = document.querySelectorAll('.sam-table, .mt-table, table.table');
        tables.forEach(t => {
            if (getTableKey(t) === tableKey) {
                t.classList.remove('sam-table-card-view', 'sam-table-traditional-view', 'sam-table-font-sm', 'sam-table-font-md', 'sam-table-font-lg');
                t.querySelectorAll('th, td').forEach(el => {
                    el.style.removeProperty('display');
                    el.classList.remove('sam-col-hidden');
                });
            }
        });

        if (window.App && App.closeModal) App.closeModal();
        if (window.App && App.toast) App.toast('تمت استعادة الضبط الافتراضي للجدول 🔄', 'info');
    }

    // Mobile-safe layout for the table customizer modal.
    if (!document.getElementById('sam-table-customizer-mobile-style')) {
        const style = document.createElement('style');
        style.id = 'sam-table-customizer-mobile-style';
        style.textContent = `
            .sam-toolbar-customizer-btn, .sam-table-customizer-btn { touch-action: manipulation; }
            @media (max-width: 600px) {
                #modal-container .sam-table-studio-modal { max-height: calc(84dvh - 110px) !important; padding: 12px !important; }
                #modal-container .sam-table-studio-modal button { min-height: 40px; touch-action: manipulation; }
                #modal-container .sam-table-studio-footer { flex-direction: column !important; padding: 10px !important; }
                #modal-container .sam-table-studio-footer button { width: 100% !important; min-height: 44px !important; flex: none !important; }
                table.sam-table-traditional-view { display: table !important; width: 100% !important; min-width: 640px !important; table-layout: auto !important; }
                table.sam-table-traditional-view thead { display: table-header-group !important; }
                table.sam-table-traditional-view tbody { display: table-row-group !important; }
                table.sam-table-traditional-view tr { display: table-row !important; width: auto !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
                table.sam-table-traditional-view th, table.sam-table-traditional-view td { display: table-cell !important; width: auto !important; min-height: 0 !important; border: 1px solid var(--border-color, #e2e8f0) !important; padding: 8px 10px !important; }
                table.sam-table-traditional-view td::before { display: none !important; content: none !important; }
            }
        `;
        document.head.appendChild(style);
    }
    // Auto-run observer on DOM mutations
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
            // Applying a saved configuration moves TH/TD nodes. Those internal
            // mutations must not re-enter enhanceAllTables(), otherwise the
            // observer loops forever and freezes the page after Save.
            const hasExternalChildChange = mutations.some(mutation => {
                if (mutation.type !== 'childList') return false;
                const target = mutation.target;
                return !(target && (target.closest('table') || target.closest('#modal-container')));
            });
            if (hasExternalChildChange) enhanceAllTables();
        });
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
            enhanceAllTables();
        });
    }

    window.addEventListener('load', () => {
        enhanceAllTables();
    });

    return {
        init: enhanceAllTables,
        enhanceAllTables,
        openModal,
        setModalViewMode,
        setModalFontSize,
        toggleAllModalColumns,
        moveModalColumn,
        applyFromModal,
        resetTableConfig
    };
})();
