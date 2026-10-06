/**
 * SAM User Manager — Main Application Bootstrapper
 * Version: 2.0 (Modular Architecture)
 */
'use strict';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.App && typeof window.App.init === 'function') {
            window.App.init();
        }
    });
} else {
    if (window.App && typeof window.App.init === 'function') {
        window.App.init();
    }
}


// =========================================================================
// UNIVERSAL STANDARDIZED SUCCESS MODAL & QUICK POS UTILITIES
// =========================================================================

App.showStandardSuccessModal = function (opts) {
    const {
        title = 'تمت العملية بنجاح',
        subtitle = '',
        icon = '🎉',
        headerColor = 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
        refNo = '',
        refLabel = 'رقم العملية',
        items = [],
        whatsappUrl = '',
        whatsappMessage = '',
        whatsappBtnText = '📲 إرسال الفاتورة / الإشعار للعميل عبر واتساب (WhatsApp)',
        printFn = null,
        printBtnText = '🖨️ طباعة الفاتورة والإيصال',
        onClose = null
    } = opts;

    const modalHtml = `
    <div class="mt-modal-backdrop" id="standard-success-backdrop" style="z-index:10060;">
        <div class="mt-modal" style="width:500px; max-width:95vw; box-shadow:0 16px 40px rgba(0,0,0,0.35); border:1px solid #cbd5e1; animation:fadeIn .2s ease-out; border-radius:12px; overflow:hidden;">
            <div class="mt-modal-header" style="background:${headerColor}; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:14px 20px;">
                <span style="font-weight:800; font-size:16px; display:flex; align-items:center; gap:8px;">✓ ${this.escape(title)}</span>
                <span style="cursor:pointer; font-size:20px; font-weight:700;" onclick="App.closeStandardSuccessModal()">✕</span>
            </div>
            <div class="mt-modal-body" style="padding:22px; text-align:center;">
                <div style="font-size:46px; margin-bottom:10px;">${icon}</div>
                ${refNo ? `
                <div style="font-size:17px; font-weight:800; color:#1e293b; margin-bottom:6px;">
                    ${this.escape(refLabel)}: <code style="background:#f1f5f9; padding:4px 10px; border-radius:6px; color:#0f766e; font-size:16px; border:1px solid #cbd5e1;">${this.escape(refNo)}</code>
                </div>` : ''}
                ${subtitle ? `<div style="font-size:13px; color:#475569; margin-bottom:16px; line-height:1.6;">${subtitle}</div>` : ''}

                <!-- Key-Value Breakdown Box -->
                ${items.length > 0 ? `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:18px; text-align:right; font-size:13px;">
                    ${items.map((it, idx) => `
                        <div style="display:flex; justify-content:space-between; align-items:center; ${idx > 0 ? 'margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0;' : ''}">
                            <span style="color:#64748b; font-weight:600;">${this.escape(it.label)}:</span>
                            <b style="color:${it.color || '#0f172a'}; font-size:${it.size || '13px'}; direction:ltr;">${it.value}</b>
                        </div>
                    `).join('')}
                </div>` : ''}

                <!-- Action Buttons -->
                <div style="display:flex; flex-direction:column; gap:9px;">
                    ${whatsappUrl || whatsappMessage ? `
                    <button class="mt-btn mt-btn-success" style="font-weight:bold; font-size:14px; padding:11px 16px; width:100%; display:flex; justify-content:center; align-items:center; gap:8px;" onclick="${whatsappUrl ? `window.open('${whatsappUrl}', '_blank')` : `App.openWhatsAppWithMessage('${encodeURIComponent(whatsappMessage)}')`}">
                        <span style="font-size:18px;">📲</span> ${this.escape(whatsappBtnText)}
                    </button>` : ''}
                    
                    <div style="display:flex; gap:8px;">
                        ${printFn ? `
                        <button class="mt-btn mt-btn-primary" style="flex:1; padding:9px 12px; font-weight:700; display:flex; justify-content:center; align-items:center; gap:6px;" onclick="${printFn}">
                            ${this.escape(printBtnText)}
                        </button>` : ''}
                        ${whatsappMessage ? `
                        <button class="mt-btn" style="flex:1; padding:9px 12px; font-weight:600;" onclick="App.copyInvoiceText('${this.escape(whatsappMessage).replace(/'/g, "\'")}')">
                            📋 نسخ النص
                        </button>` : ''}
                    </div>
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:10px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                <button type="button" class="mt-btn" onclick="App.closeStandardSuccessModal()" style="width:100%;">إغلاق</button>
            </div>
        </div>
    </div>`;

    App._standardSuccessOnClose = onClose;
    const old = document.getElementById('standard-success-backdrop');
    if (old) old.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstElementChild);
};

App.closeStandardSuccessModal = function() {
    const el = document.getElementById('standard-success-backdrop');
    if (el) el.remove();
    if (typeof App._standardSuccessOnClose === 'function') {
        App._standardSuccessOnClose();
        App._standardSuccessOnClose = null;
    }
};

App.openWhatsAppWithMessage = function(encodedMsg) {
    const msg = decodeURIComponent(encodedMsg);
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(msg), '_blank');
};

App.filterSelectOptions = function(selectId, query) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const q = (query || '').trim().toLowerCase();
    let firstMatch = null;
    let matchCount = 0;
    for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (!opt.value) continue; // skip default placeholder
        const text = (opt.textContent || '').toLowerCase();
        const search = (opt.dataset.search || opt.dataset.phone || opt.dataset.name || '').toLowerCase();
        const matched = !q || text.includes(q) || search.includes(q);
        opt.style.display = matched ? '' : 'none';
        if (matched) {
            matchCount++;
            if (!firstMatch) firstMatch = opt.value;
        }
    }
    if (q && firstMatch && select.value !== firstMatch) {
        select.value = firstMatch;
        select.dispatchEvent(new Event('change'));
    }
};


App.confirmModal = function (opts) {
    return new Promise((resolve) => {
        let title = 'تأكيد العملية';
        let subtitle = 'يرجى مراجعة البيانات التالية قبل الاعتماد والتنفيذ:';
        let icon = '⚡';
        let headerColor = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
        let confirmBtnText = '✓ تأكيد واعتماد العملية';
        let confirmBtnClass = 'mt-btn-primary';
        let cancelBtnText = 'تراجع وإلغاء';
        let items = [];
        let note = '';

        if (typeof opts === 'string') {
            subtitle = opts;
        } else if (opts && typeof opts === 'object') {
            if (opts.title) title = opts.title;
            if (opts.subtitle) subtitle = opts.subtitle;
            if (opts.icon) icon = opts.icon;
            if (opts.headerColor) headerColor = opts.headerColor;
            if (opts.confirmBtnText) confirmBtnText = opts.confirmBtnText;
            if (opts.confirmBtnClass) confirmBtnClass = opts.confirmBtnClass;
            if (opts.cancelBtnText) cancelBtnText = opts.cancelBtnText;
            if (Array.isArray(opts.items)) items = opts.items;
            if (opts.note) note = opts.note;
        }

        const modalId = 'app-custom-confirm-modal';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const modalHtml = `
        <div class="mt-modal-backdrop" id="${modalId}" style="z-index:10080; background:rgba(15,23,42,0.65); backdrop-filter:blur(3px); animation:fadeIn .15s ease-out;">
            <div class="mt-modal" style="width:480px; max-width:92vw; box-shadow:0 25px 60px rgba(0,0,0,0.4); border-radius:12px; overflow:hidden; border:1px solid #94a3b8; animation:scaleUp .18s ease-out; background:#fff;">
                <div class="mt-modal-header" style="background:${headerColor}; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:13px 18px;">
                    <span style="font-weight:800; font-size:15.5px; display:flex; align-items:center; gap:8px;">${icon} ${App.escape(title)}</span>
                    <span style="cursor:pointer; font-size:18px; font-weight:700;" onclick="document.getElementById('${modalId}').remove(); window._appConfirmResolve(false);">✕</span>
                </div>
                <div class="mt-modal-body" style="padding:18px 20px; text-align:right;">
                    ${subtitle ? `<div style="font-size:13.5px; color:#1e293b; margin-bottom:12px; line-height:1.6; font-weight:600;">${subtitle}</div>` : ''}

                    ${items.length > 0 ? `
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:13px;">
                        ${items.map((it, idx) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; ${idx > 0 ? 'margin-top:7px; padding-top:7px; border-top:1px solid #e2e8f0;' : ''}">
                                <span style="color:#64748b; font-weight:600;">${it.icon ? it.icon + ' ' : ''}${App.escape(it.label)}:</span>
                                <b style="color:${it.color || '#0f172a'}; font-size:${it.size || '13px'}; direction:ltr;">${it.value}</b>
                            </div>
                        `).join('')}
                    </div>` : ''}

                    ${note ? `<div style="background:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:9px 12px; font-size:12px; color:#92400e; margin-bottom:6px; line-height:1.5;">💡 ${note}</div>` : ''}
                </div>
                <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="mt-btn" style="padding:8px 18px; font-weight:600;" onclick="document.getElementById('${modalId}').remove(); window._appConfirmResolve(false);">${App.escape(cancelBtnText)}</button>
                    <button type="button" class="mt-btn ${confirmBtnClass}" style="padding:8px 24px; font-weight:800;" onclick="document.getElementById('${modalId}').remove(); window._appConfirmResolve(true);">${App.escape(confirmBtnText)}</button>
                </div>
            </div>
        </div>`;

        window._appConfirmResolve = resolve;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
    });
};


// =========================================================================
// EXACT TABLE-BASED CONFIRMATION MODAL (Matching Sales POS Design)
// =========================================================================

App.showExactConfirmModal = function (opts) {
    return new Promise((resolve) => {
        const {
            headerTitle = 'تأكيد العملية',
            headline = '',
            subheadline = '',
            rows = [], // Array of { label, html, bg, color }
            confirmBtnText = 'تأكيد البيع والتفعيل الفوري',
            confirmBtnClass = 'mt-btn-success',
            backBtnText = 'رجوع',
            onBack = null
        } = opts;

        const modalId = 'app-exact-confirm-modal';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const modalHtml = `
        <div class="mt-modal-backdrop" id="${modalId}" style="z-index:10080;" onclick="if(event.target===this){ document.getElementById('${modalId}').remove(); window._appExactConfirmResolve(false); }">
            <div class="mt-modal" style="width:620px; max-width:96vw; max-height:92vh; border-radius:10px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.4); animation:scaleUp .18s ease-out;">
                <div class="mt-modal-header" style="background:#1e293b; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                    <span style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:6px;">${headerTitle}</span>
                    <span style="cursor:pointer; font-size:18px; font-weight:700;" onclick="document.getElementById('${modalId}').remove(); window._appExactConfirmResolve(false);">✕</span>
                </div>
                <div class="mt-modal-body" style="padding:16px 20px;">
                    
                    ${headline ? `
                    <div style="text-align:center; margin-bottom:14px;">
                        <div style="font-size:18px; font-weight:800; color:#0284c7;">
                            ${headline}
                        </div>
                        ${subheadline ? `
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">
                            ${subheadline}
                        </div>` : ''}
                    </div>` : ''}

                    <table class="mt-table" style="font-size:12px; margin-bottom:14px; width:100%; border-collapse:collapse;">
                        <tbody>
                            ${rows.map(r => `
                            <tr style="${r.bg ? `background:${r.bg};` : ''}">
                                <td style="width:150px; font-weight:bold; background:${r.bg || '#f8fafc'}; color:${r.color || '#334155'}; padding:9px 12px; border:1px solid #e2e8f0;">${r.label}</td>
                                <td style="padding:9px 12px; border:1px solid #e2e8f0; line-height:1.6;">${r.html}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>

                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <button type="button" class="mt-btn" style="padding:7px 18px; font-weight:600;" onclick="document.getElementById('${modalId}').remove(); window._appExactConfirmResolve(false); ${onBack ? onBack : ''}">${backBtnText}</button>
                    <button type="button" class="mt-btn ${confirmBtnClass}" style="font-weight:bold; font-size:13px; padding:8px 22px; display:flex; align-items:center; gap:6px;" onclick="document.getElementById('${modalId}').remove(); window._appExactConfirmResolve(true);">
                        ✅ ${confirmBtnText}
                    </button>
                </div>
            </div>
        </div>`;

        window._appExactConfirmResolve = resolve;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
    });
};
