(() => {
    'use strict';
    if (!window.App || App.__printLayoutControlsInstalled) return;
    App.__printLayoutControlsInstalled = true;

    const numberValue = (id, fallback) => {
        const value = Number(document.getElementById(id)?.value);
        return Number.isFinite(value) ? value : fallback;
    };
    const saved = (key, fallback) => localStorage.getItem(key) ?? fallback;

    App.installPrintLayoutControls = function () {
        const position = document.getElementById('preview-sheet-pos');
        if (!position || document.getElementById('preview-sheet-custom-controls')) return;

        if (!position.querySelector('option[value="custom"]')) {
            const option = document.createElement('option');
            option.value = 'custom';
            option.textContent = '🎯 موضع مخصص داخل صفحة A4';
            position.appendChild(option);
        }

        const storedPosition = saved('mt_print_sheet_pos', position.value || 'top_bar');
        if (position.querySelector(`option[value="${storedPosition}"]`)) position.value = storedPosition;

        const controls = document.createElement('div');
        controls.id = 'preview-sheet-custom-controls';
        controls.className = 'print-sheet-custom-controls';
        controls.innerHTML = `
            <label>أفقي X (%)<input id="preview-sheet-x" type="number" inputmode="decimal" min="0" max="100" step="0.5" value="${saved('mt_print_sheet_x', '50')}"></label>
            <label>رأسي Y (%)<input id="preview-sheet-y" type="number" inputmode="decimal" min="0" max="100" step="0.5" value="${saved('mt_print_sheet_y', '2')}"></label>
            <label>هامش الرقم (mm)<input id="preview-sheet-padding" type="number" inputmode="decimal" min="0" max="15" step="0.5" value="${saved('mt_print_sheet_padding', '1')}"></label>`;
        position.closest('div')?.insertAdjacentElement('afterend', controls);

        controls.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
            localStorage.setItem('mt_print_sheet_x', String(numberValue('preview-sheet-x', 50)));
            localStorage.setItem('mt_print_sheet_y', String(numberValue('preview-sheet-y', 2)));
            localStorage.setItem('mt_print_sheet_padding', String(numberValue('preview-sheet-padding', 1)));
            App.onPreviewMarginsChange();
        }));
        document.getElementById('preview-sheet-font')?.addEventListener('input', event => {
            localStorage.setItem('mt_print_sheet_font', event.target.value);
        });
        const font = document.getElementById('preview-sheet-font');
        if (font) font.value = saved('mt_print_sheet_font', font.value || '9.5');
        this.toggleCustomSheetControls();
    };

    App.toggleCustomSheetControls = function () {
        const custom = document.getElementById('preview-sheet-pos')?.value === 'custom';
        const controls = document.getElementById('preview-sheet-custom-controls');
        if (controls) controls.hidden = !custom;
    };

    App.applyCustomSheetNumberLayout = function () {
        this.toggleCustomSheetControls();
        if (document.getElementById('preview-sheet-pos')?.value !== 'custom') return;

        const x = Math.max(0, Math.min(100, numberValue('preview-sheet-x', 50)));
        const y = Math.max(0, Math.min(100, numberValue('preview-sheet-y', 2)));
        const font = Math.max(6, Math.min(36, numberValue('preview-sheet-font', 9.5)));
        const padding = Math.max(0, Math.min(15, numberValue('preview-sheet-padding', 1)));
        let voucherOffset = 0;

        document.querySelectorAll('#print-container .pdf-a4-page').forEach((page, pageIndex) => {
            const cardsOnPage = page.querySelectorAll('.visual-card-rendered').length;
            const voucher = this.currentPrintVouchers?.[voucherOffset] || {};
            const fallback = Number(this.currentPrintMeta?.start_sheet_no || 1) + pageIndex;
            const sheetNumber = voucher.sheet_no_formatted || (voucher.sheet_no ? String(voucher.sheet_no).padStart(6, '0') : String(fallback).padStart(6, '0'));
            voucherOffset += cardsOnPage;
            page.style.position = 'relative';
            page.querySelectorAll('.custom-sheet-number').forEach(node => node.remove());
            const marker = document.createElement('div');
            marker.className = 'custom-sheet-number';
            marker.textContent = `ورقة رقم: ${sheetNumber}`;
            marker.style.cssText = `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);z-index:50;font-size:${font}pt;padding:${padding}mm;line-height:1;font-weight:800;color:#111;background:transparent;white-space:nowrap;pointer-events:none;`;
            page.appendChild(marker);
        });
    };

    const originalPrintList = App.printVouchersList.bind(App);
    App.printVouchersList = async function (...args) {
        const result = await originalPrintList(...args);
        this.installPrintLayoutControls();
        if (document.getElementById('preview-sheet-pos')?.value === 'custom') {
            await this.onPreviewMarginsChange();
        }
        return result;
    };

    const originalPositionChange = App.onPreviewSheetPosChange.bind(App);
    App.onPreviewSheetPosChange = function (position) {
        localStorage.setItem('mt_print_sheet_pos', position);
        this.toggleCustomSheetControls();
        return originalPositionChange(position);
    };

    const originalMarginChange = App.onPreviewMarginsChange.bind(App);
    App.onPreviewMarginsChange = async function (...args) {
        const result = await originalMarginChange(...args);
        this.applyCustomSheetNumberLayout();
        return result;
    };
})();
