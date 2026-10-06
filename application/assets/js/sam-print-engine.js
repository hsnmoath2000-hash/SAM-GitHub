/**
 * SAM User Manager — Universal Printing Engine
 * Supports Single & Bulk Printing for Statements, Invoices, Vouchers, Accounts & Assets
 * Formats: A4 Standard & Thermal POS (80mm) with PDF Export & WhatsApp Sharing
 */
'use strict';

(function () {
    const PrintEngine = {
        // System / Network info fallback & Print Settings
        _cachedPrintSettings: null,

        async getNetworkPrintSettings(networkId = null) {
            try {
                if (window.App && typeof App.api === 'function') {
                    const res = await App.api('get_print_settings', networkId ? { network_id: networkId } : {});
                    if (res && res.success && res.settings) {
                        this._cachedPrintSettings = res.settings;
                        return res.settings;
                    }
                }
            } catch (e) {
                console.warn('تعذر تحميل إعدادات الطباعة؛ سيتم استخدام الإعدادات الافتراضية:', e);
                window.App?.toast?.('تعذر تحميل إعدادات الطباعة؛ سيتم استخدام الإعدادات الافتراضية.', 'warning');
            }
            const net = this.getNetworkInfo();
            return {
                header_title: net.name || 'شبكة إنترنت اللاسلكية',
                header_subtitle: 'نظام الإدارة المحاسبية والشبكات المتقدم',
                phone: net.phone || '',
                address: net.address || '',
                tax_no: '',
                logo_url: net.logo || 'assets/img/log.png',
                primary_color: '#0f172a',
                accent_color: '#0284c7',
                footer_notes: 'تعتبر جميع الفواتير والكشوفات الصادرة نهائية ورسمية ما لم يقدم اعتراض كتابي خلال 7 أيام.',
                signature_roles: ['المحاسب / المنظم', 'المستلم / العميل', 'المدير العام / الاعتماد'],
                paper_format: 'a4',
                show_qr: true,
                show_watermark: true
            };
        },

        getNetworkInfo() {
            const settings = this._cachedPrintSettings || {};
            const netName = settings.header_title || (window.App && App.systemSettings && App.systemSettings.system_name) ||
                            (window.App && App.networkName) || 'شبكة إنترنت اللاسلكية';
            const phone = settings.phone || (window.App && App.systemSettings && App.systemSettings.contact_phone) || '';
            const address = settings.address || (window.App && App.systemSettings && App.systemSettings.system_address) || '';
            const logo = settings.logo_url || (window.App && App.systemSettings && App.systemSettings.logo_url) || 'assets/img/log.png';
            return { name: netName, phone, address, logo };
        },

        // Clean currency & money formatting
        formatMoney(amount, showSymbol = true, currency = null) {
            if (window.App && typeof App.formatMoney === 'function') {
                return App.formatMoney(amount, showSymbol, currency);
            }
            const num = parseFloat(amount) || 0;
            const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return showSymbol !== false ? (formatted + ' ر.ي') : formatted;
        },

        // Tafqeet wrapper
        tafqeet(amount, currency = null) {
            if (window.App && typeof App.tafqeet === 'function') {
                return App.tafqeet(amount, currency);
            }
            return '';
        },

        // Escape helper
        escape(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/[&<>"']/g, m => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
            }[m]));
        },

        // Generate QR code URL via quickchart / local
        getQrUrl(text, size = 120) {
            return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(text);
        },

        // Open Document Preview Modal
        preview(docHtml, options = {}) {
            const title = options.title || 'معاينة وطباعة المستند';
            const isThermal = options.isThermal || false;
            const filename = (options.filename || 'Document_' + Date.now()).replace(/\.pdf$/i, '');
            const allowThermalToggle = options.allowThermalToggle !== false;
            const currentFormat = isThermal ? 'thermal' : 'a4';

            let modalContainer = document.getElementById('modal-container');
            if (!modalContainer) {
                modalContainer = document.createElement('div');
                modalContainer.id = 'modal-container';
                document.body.appendChild(modalContainer);
            }

            modalContainer.innerHTML = `
            <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                <div class="mt-modal sam-print-preview-modal ${isThermal ? 'thermal-mode' : 'a4-mode'}">
                    <!-- Toolbar Header -->
                    <div class="mt-modal-header no-print" style="background:#0f172a; color:#fff; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:18px;">🖨️</span>
                            <span style="font-weight:700; font-size:14px;">${this.escape(title)}</span>
                        </div>
                        <span style="cursor:pointer; font-size:18px; color:#94a3b8; padding:2px 6px;" onclick="App.closeModal()">✕</span>
                    </div>

                    <!-- Action Bar -->
                    <div class="sam-print-actions-bar no-print">
                        <div class="sam-print-actions-left">
                            <button type="button" class="mt-btn sam-btn-print" onclick="App.PrintEngine.triggerDirectPrint()">
                                <span>🖨️</span> طباعة فورية
                            </button>
                            <button type="button" id="sam-export-pdf-btn" class="mt-btn sam-btn-pdf" onclick="App.PrintEngine.exportCurrentPDF('${filename}')">
                                <span>📄</span> تصدير PDF
                            </button>
                            ${options.whatsappText ? `
                            <button type="button" id="sam-share-wa-btn" class="mt-btn sam-btn-wa" onclick="App.PrintEngine.shareWhatsApp('${encodeURIComponent(options.whatsappText)}', '${this.escape(options.phone || '')}', '${this.escape(filename)}')">
                                <span>📲</span> واتساب
                            </button>` : ''}
                        </div>

                        <div class="sam-print-actions-right">
                            ${allowThermalToggle && options.onToggleFormat ? `
                            <div class="sam-format-toggle" style="display:inline-flex; background:#0f172a; border-radius:6px; padding:2px; border:1px solid #475569;">
                                <button type="button" class="mt-btn ${currentFormat === 'a4' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:4px; padding:4px 8px; font-size:11px;" onclick="${options.onToggleFormat}('a4')">📄 A4</button>
                                <button type="button" class="mt-btn ${currentFormat === 'thermal' ? 'mt-btn-primary' : ''}" style="border:none; border-radius:4px; padding:4px 8px; font-size:11px;" onclick="${options.onToggleFormat}('thermal')">🧾 80mm</button>
                            </div>` : ''}
                            <button type="button" class="mt-btn sam-btn-close" onclick="App.closeModal()">✕ إغلاق</button>
                        </div>
                    </div>

                    <!-- Scrollable Printable Paper Container -->
                    <div class="mt-modal-body sam-print-preview-body">
                        <div id="sam-printable-document" class="${isThermal ? 'sam-doc-thermal' : 'sam-doc-a4'}">
                            ${docHtml}
                        </div>
                    </div>
                </div>
            </div>
            `;
        },

        // Trigger Direct Browser Print without white screen issues
        triggerDirectPrint() {
            const source = document.getElementById('sam-printable-document');
            if (!source) return;

            let mount = document.getElementById('print-mount-point');
            if (!mount) {
                mount = document.createElement('div');
                mount.id = 'print-mount-point';
                document.body.appendChild(mount);
            }

            mount.innerHTML = source.outerHTML;
            window.print();

            setTimeout(() => {
                mount.innerHTML = '';
            }, 1500);
        },

        async loadHtml2PdfScript() {
            if (window.html2pdf) return true;
            return new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = 'assets/js/html2pdf.bundle.min.js';
                s.onload = () => resolve(true);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            });
        },

        // Export as PDF using html2pdf / jsPDF
        async exportCurrentPDF(filename = 'Document') {
            const source = document.getElementById('sam-printable-document');
            if (!source) return;

            const btn = document.getElementById('sam-export-pdf-btn');
            const originalText = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ جاري التصدير...';
            }

            const isThermal = source.classList.contains('sam-doc-thermal');

            const opt = {
                margin: isThermal ? [2, 2, 2, 2] : [10, 10, 10, 10],
                filename: `${filename}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: isThermal ? [80, 200] : 'a4', orientation: 'portrait' }
            };

            try {
                if (!window.html2pdf) {
                    await this.loadHtml2PdfScript();
                }
                if (window.html2pdf) {
                    await window.html2pdf().set(opt).from(source).save();
                } else {
                    this.triggerDirectPrint();
                }
            } catch (err) {
                console.error('PDF Export Error:', err);
                if (window.App && typeof App.toast === 'function') {
                    App.toast('فشل التصدير التلقائي، تم توجيهك لطباعة المتصفح لحفظ PDF', 'warning');
                }
                this.triggerDirectPrint();
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            }
        },

        // WhatsApp Share with Image capture & Summary Report
        async shareWhatsApp(encodedText, phone = '', filename = 'Statement') {
            const text = decodeURIComponent(encodedText);
            const docEl = document.getElementById('sam-printable-document');
            const waBtn = document.getElementById('sam-share-wa-btn');
            const originalWaHtml = waBtn ? waBtn.innerHTML : '';

            if (waBtn) {
                waBtn.disabled = true;
                waBtn.innerHTML = '<span>⏳</span> جاري التجهيز...';
            }

            if (window.App && typeof App.toast === 'function') {
                App.toast('📸 جاري التقاط صورة الكشف وتجهيز تقرير الواتساب...', 'info');
            }

            let imageBlob = null;
            let imageFile = null;

            if (docEl && window.html2canvas) {
                try {
                    const canvas = await window.html2canvas(docEl, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false,
                        windowWidth: 1024
                    });
                    imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
                    if (imageBlob) {
                        const cleanName = (filename || 'Statement').replace(/[^\w\u0600-\u06FF\-]/g, '_');
                        imageFile = new File([imageBlob], `${cleanName}.png`, { type: 'image/png' });
                    }
                } catch (e) {
                    console.warn('Canvas capture failed:', e);
                }
            }

            // Clean destination phone number
            let destPhone = String(phone || '').replace(/[^\d+]/g, '');
            if (destPhone.startsWith('+')) destPhone = destPhone.substring(1);
            if (destPhone.length === 9 && (destPhone.startsWith('7') || destPhone.startsWith('07'))) {
                destPhone = '967' + (destPhone.startsWith('0') ? destPhone.substring(1) : destPhone);
            }

            try {
                // Try Web Share API (Direct file + caption text share on Android/iOS WhatsApp)
                if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
                    try {
                        await navigator.share({
                            title: filename || 'كشف حساب',
                            text: text,
                            files: [imageFile]
                        });
                        if (window.App && typeof App.toast === 'function') {
                            App.toast('✅ تم إرسال صورة الكشف والتقرير إلى الواتساب بنجاح!', 'success');
                        }
                        return;
                    } catch (shareErr) {
                        if (shareErr.name === 'AbortError') return;
                        console.warn('Navigator share error:', shareErr);
                    }
                }

                // Fallback: Download image & open WhatsApp with formatted summary text
                if (imageBlob) {
                    const url = URL.createObjectURL(imageBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${(filename || 'Statement')}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                }

                const waBase = destPhone ? `https://api.whatsapp.com/send?phone=${destPhone}&text=` : `https://api.whatsapp.com/send?text=`;
                window.open(waBase + encodeURIComponent(text), '_blank');
                if (window.App && typeof App.toast === 'function') {
                    App.toast('📥 تم حفظ صورة كشف الحساب وفتح الواتساب لإرسال التقرير!', 'success');
                }
            } finally {
                if (waBtn) {
                    waBtn.disabled = false;
                    waBtn.innerHTML = originalWaHtml;
                }
            }
        },

        // Common Header HTML Component
        renderHeader(docTitle, docSubtitle = '', metaItems = [], customSettings = null) {
            const settings = customSettings || this._cachedPrintSettings || {};
            const net = this.getNetworkInfo();
            const headerTitle = settings.header_title || net.name;
            const headerSubtitle = settings.header_subtitle || 'نظام الإدارة المحاسبية والشبكات المتقدم';
            const logo = settings.logo_url || net.logo;
            const phone = settings.phone || net.phone;
            const address = settings.address || net.address;
            const taxNo = settings.tax_no || '';
            const primaryColor = settings.primary_color || '#0f172a';
            const accentColor = settings.accent_color || '#0284c7';

            return `
            <div class="sam-print-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid ${primaryColor}; padding-bottom:12px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="${logo}" style="height:55px; width:auto; max-width:80px; object-fit:contain;" onerror="this.style.display='none';" />
                    <div>
                        <div style="font-size:18px; font-weight:900; color:${primaryColor};">${this.escape(headerTitle)}</div>
                        <div style="font-size:11px; color:#64748b; font-weight:600;">${this.escape(headerSubtitle)}</div>
                        ${phone ? `<div style="font-size:11px; color:#64748b;">هاتف: ${this.escape(phone)}${address ? ' | العنوان: ' + this.escape(address) : ''}</div>` : (address ? `<div style="font-size:11px; color:#64748b;">العنوان: ${this.escape(address)}</div>` : '')}
                        ${taxNo ? `<div style="font-size:10.5px; color:#64748b;">الرقم الضريبي: <code>${this.escape(taxNo)}</code></div>` : ''}
                    </div>
                </div>
                <div style="text-align:left;">
                    <div style="font-size:17px; font-weight:800; color:${accentColor};">${this.escape(docTitle)}</div>
                    ${docSubtitle ? `<div style="font-size:12px; font-weight:700; color:#475569;">${this.escape(docSubtitle)}</div>` : ''}
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-YE')} ${new Date().toLocaleTimeString('ar-YE')}</div>
                </div>
            </div>
            ${metaItems.length > 0 ? `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:16px; font-size:12px;">
                ${metaItems.map(item => `<div><b>${item.label}:</b> <span style="color:#0f172a; font-weight:600;">${item.value}</span></div>`).join('')}
            </div>` : ''}
            `;
        },

        // Common Signatures Block Component
        renderSignatures(roles = null) {
            const settings = this._cachedPrintSettings || {};
            const savedRoles = Array.isArray(settings.signature_roles) && settings.signature_roles.length ? settings.signature_roles : null;
            const sigRoles = savedRoles || roles || ['المحاسب / المنظم', 'المستلم / العميل', 'المدير العام / الاعتماد'];
            const footerNotes = settings.footer_notes || '';

            return `
            ${footerNotes ? `
            <div style="margin-top:20px; padding:8px 12px; background:#f8fafc; border-right:4px solid ${settings.accent_color || '#0284c7'}; border-radius:4px; font-size:11px; color:#475569; line-height:1.5;">
                <b>ملاحظات وشروط المستند:</b> ${this.escape(footerNotes)}
            </div>` : ''}
            <div class="sam-print-signatures" style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:30px; padding-top:15px; border-top:1px dashed #cbd5e1; font-size:12px;">
                ${sigRoles.map(r => `
                <div style="text-align:center; min-width:140px;">
                    <div style="font-weight:700; color:#334155; margin-bottom:38px;">${this.escape(r)}</div>
                    <div style="border-top:1px solid #94a3b8; padding-top:4px; color:#64748b;">التوقيع / الختم: ...................</div>
                </div>`).join('')}
            </div>
            `;
        },

        // =========================================================================
        // 1. FINANCIAL VOUCHERS (سندات القبض والصرف والقيود - مفرد وجماعي)
        // =========================================================================
        
        // Single Voucher Document Builder (A4 or Thermal 80mm)
        buildVoucherHtml(v, isThermal = false) {
            const isReceipt = v.voucher_type === 'receipt';
            const typeTitle = isReceipt ? 'سند قبض نقدية' : 'سند صرف مصاريف';
            const typeColor = isReceipt ? '#16a34a' : '#dc2626';
            const net = this.getNetworkInfo();
            const tafqeetText = this.tafqeet(v.amount, v.currency_code);
            const qrData = 'VOUCHER:' + v.voucher_no + '|TYPE:' + v.voucher_type + '|AMT:' + v.amount + '|DATE:' + v.created_at;

            if (isThermal) {
                // POS 80mm Thermal Receipt Layout
                return `
                <div class="thermal-receipt" style="font-size:12px; line-height:1.4; text-align:center; color:#000;">
                    <div style="font-weight:900; font-size:15px; margin-bottom:2px;">${this.escape(net.name)}</div>
                    <div style="font-size:10px; color:#444;">نظام إدارة الشبكات والمبيعات</div>
                    <div style="border-bottom:1px dashed #000; margin:6px 0;"></div>

                    <div style="font-weight:800; font-size:14px; color:#000; margin-bottom:4px;">${typeTitle}</div>
                    <div style="font-size:11px;"><b>رقم السند:</b> <code>${this.escape(v.voucher_no)}</code></div>
                    <div style="font-size:10px;">التاريخ: ${v.created_at || '-'}</div>

                    <div style="border-bottom:1px solid #000; margin:8px 0;"></div>

                    <div style="text-align:right; font-size:11.5px; margin-bottom:8px;">
                        <div><b>${isReceipt ? 'استلمنا من' : 'صرفنا إلى'}:</b> ${this.escape(v.party_name || '-')}</div>
                        <div style="margin-top:4px;"><b>طريقة الدفع:</b> ${this.escape(v.payment_method || 'نقدي')}</div>
                        ${v.category ? `<div style="margin-top:2px;"><b>البند:</b> ${this.escape(v.category)}</div>` : ''}
                        ${v.notes ? `<div style="margin-top:2px;"><b>البيان:</b> ${this.escape(v.notes)}</div>` : ''}
                    </div>

                    <div style="background:#eee; padding:6px; border:1px solid #999; border-radius:4px; margin:8px 0;">
                        <div style="font-size:10px; font-weight:700;">المبلغ المطلوب:</div>
                        <div style="font-size:16px; font-weight:900;">${this.formatMoney(v.amount, v.currency_code)}</div>
                        ${tafqeetText ? `<div style="font-size:9.5px; font-weight:700; margin-top:2px;">فقط ${tafqeetText} لا غير</div>` : ''}
                    </div>

                    <div style="display:flex; justify-content:center; margin:8px 0;">
                        <img src="${this.getQrUrl(qrData, 80)}" style="width:75px; height:75px;" />
                    </div>

                    <div style="font-size:10px; margin-top:6px; display:flex; justify-content:space-between;">
                        <span>المحرر: ${this.escape(v.creator_name || 'Admin')}</span>
                        <span>التوقيع: .........</span>
                    </div>
                    <div style="font-size:9px; color:#555; margin-top:8px; border-top:1px dashed #999; padding-top:4px;">
                        شكراً لتعاملكم معنا
                    </div>
                </div>
                `;
            }

            // Standard Official A4 / Half-A4 Voucher Layout
            return `
            <div class="a4-voucher" style="border:2px solid ${typeColor}; border-radius:8px; padding:18px; position:relative;">
                <!-- Header -->
                ${this.renderHeader(typeTitle, 'سند رقم: ' + v.voucher_no, [
                    { label: 'رقم السند المالي', value: '<code>' + this.escape(v.voucher_no) + '</code>' },
                    { label: 'تاريخ السند', value: v.created_at || '-' },
                    { label: 'طريقة الدفع', value: this.escape(v.payment_method || 'نقدي') },
                    { label: 'مركز التكلفة / الراوتر', value: this.escape(v.cost_center_name || 'عام') }
                ])}

                <!-- Amount Box Hero Banner -->
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:2px solid ${typeColor}; border-radius:8px; padding:12px 18px; margin-bottom:16px;">
                    <div>
                        <div style="font-size:12px; font-weight:700; color:#334155;">المبلغ المستحق بالأرقام:</div>
                        <div style="font-size:24px; font-weight:900; color:${typeColor};">${this.formatMoney(v.amount, v.currency_code)}</div>
                    </div>
                    <div style="text-align:left; max-width:60%;">
                        <div style="font-size:12px; font-weight:700; color:#334155;">المبلغ كتابةً وتفقيطاً:</div>
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">
                            فقط <b>${tafqeetText || '...................................................'}</b> لا غير.
                        </div>
                    </div>
                </div>

                <!-- Parties & Statement Details -->
                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px; font-size:12.5px;">
                    <tbody>
                        <tr style="border-bottom:1px solid #e2e8f0;">
                            <td style="width:20%; font-weight:800; background:#f8fafc; padding:8px 12px;">${isReceipt ? 'استلمنا من السيد / الجهة:' : 'صرفنا إلى السيد / الجهة:'}</td>
                            <td style="padding:8px 12px; font-size:14px; font-weight:800; color:#0284c7;">${this.escape(v.party_name || '-')}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #e2e8f0;">
                            <td style="font-weight:800; background:#f8fafc; padding:8px 12px;">البند والحساب المالي:</td>
                            <td style="padding:8px 12px; font-weight:700;">${this.escape(v.category || 'عام')}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #e2e8f0;">
                            <td style="font-weight:800; background:#f8fafc; padding:8px 12px;">وذلك عن / البيان:</td>
                            <td style="padding:8px 12px;">${this.escape(v.notes || 'سداد حركة مالية')}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:800; background:#f8fafc; padding:8px 12px;">الأثر المحاسبي المزدوج:</td>
                            <td style="padding:8px 12px; font-size:11.5px; color:#475569;">
                                ${isReceipt ? 'مدين: الصندوق / البنك [1101] ➔ دائن: حساب العميل / الإيراد [1301]' : 'مدين: حساب المصروف [5000] ➔ دائن: الصندوق / البنك [1101]'}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- Bottom QR & Signatures -->
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${this.getQrUrl(qrData, 90)}" style="width:70px; height:70px; border:1px solid #cbd5e1; border-radius:4px; padding:2px;" />
                        <div style="font-size:10.5px; color:#64748b;">
                            <div>المسؤول: <b>${this.escape(v.creator_name || 'Admin')}</b></div>
                            <div>رمز التحقق الإلكتروني</div>
                        </div>
                    </div>

                    <div style="display:flex; gap:35px; text-align:center; font-size:12px;">
                        <div>
                            <div style="font-weight:700; margin-bottom:30px;">توقيع المحاسب / أمين الصندوق</div>
                            <div style="border-top:1px solid #94a3b8; padding-top:2px;">................................</div>
                        </div>
                        <div>
                            <div style="font-weight:700; margin-bottom:30px;">توقيع ${isReceipt ? 'المسلم' : 'المستلم'}</div>
                            <div style="border-top:1px solid #94a3b8; padding-top:2px;">................................</div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        },

        // Single Voucher Print Entry
        async printSingleVoucher(voucherId, format = 'a4') {
            if (!window.App) return;
            App.toast('جاري جلب بيانات السند للطباعة...', 'info');

            const res = await App.api('get_financial_voucher_details', { voucher_id: voucherId });
            if (!res || !res.voucher) {
                return App.toast('تعذر جلب تفاصيل السند', 'danger');
            }

            const v = res.voucher;
            const isThermal = (format === 'thermal');
            const html = this.buildVoucherHtml(v, isThermal);

            this.preview(html, {
                title: 'طباعة سند ' + (v.voucher_type === 'receipt' ? 'قبض' : 'صرف') + ' [' + v.voucher_no + ']',
                filename: 'Voucher_' + v.voucher_no,
                isThermal: isThermal,
                allowThermalToggle: true,
                onToggleFormat: 'App.PrintEngine.printSingleVoucher.bind(App.PrintEngine, ' + voucherId + ')',
                whatsappText: '*سند ' + (v.voucher_type === 'receipt' ? 'قبض نقدية' : 'صرف') + '*\nرقم: ' + v.voucher_no + '\nالطرف: ' + v.party_name + '\nالمبلغ: ' + v.amount + '\nالتاريخ: ' + v.created_at + '\n' + (v.notes || '')
            });
        },

        // Bulk Vouchers Print Entry
        async printVouchersBulk(voucherIds = []) {
            if (!voucherIds || voucherIds.length === 0) {
                return App.toast('يرجى تحديد سند واحد على الأقل للطباعة الجماعية', 'warning');
            }

            App.toast('جاري تجهيز ' + voucherIds.length + ' سند للطباعة الجماعية...', 'info');

            const vouchersData = await Promise.all(
                voucherIds.map(id => App.api('get_financial_voucher_details', { voucher_id: id }))
            );

            const validVouchers = vouchersData.map(r => r?.voucher).filter(Boolean);
            if (validVouchers.length === 0) {
                return App.toast('تعذر تحميل بيانات السندات المحددة', 'danger');
            }

            let bulkHtml = `
            <div class="sam-bulk-vouchers-container">
                <div class="sam-bulk-header no-print" style="background:#0f172a; color:#fff; padding:10px 14px; border-radius:6px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div><b>🖨️ طباعة السندات المجمعة</b> (العدد: ${validVouchers.length} سند)</div>
                    <div style="font-size:12px;">إجمالي المبالغ: <b>${this.formatMoney(validVouchers.reduce((s, x) => s + parseFloat(x.amount || 0), 0))}</b></div>
                </div>
            `;

            validVouchers.forEach((v, index) => {
                bulkHtml += `
                <div class="sam-voucher-page-item" style="margin-bottom:25px; page-break-after:${(index + 1) % 2 === 0 && (index + 1) !== validVouchers.length ? 'always' : 'auto'};">
                    ${this.buildVoucherHtml(v, false)}
                </div>
                ${(index + 1) % 2 === 0 && (index + 1) !== validVouchers.length ? '<div style="height:1px; page-break-after:always;"></div>' : ''}
                `;
            });

            bulkHtml += `</div>`;

            this.preview(bulkHtml, {
                title: 'طباعة مجمعة لـ (' + validVouchers.length + ') سند مالي',
                filename: 'Bulk_Vouchers_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        cleanStatementDescription(desc, partyName = '') {
            if (!desc) return 'حركة مالية';
            let str = String(desc).trim();

            if (partyName) {
                const escParty = partyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Strip duplicate (PartyName) inside ( ... (PartyName) ) or (PartyName)
                str = str.replace(new RegExp('\\(\\s*' + escParty + '\\s*\\)', 'gi'), '');
                // Handle colon with duplicated party name e.g. ": PartyName (" -> ": ("
                str = str.replace(new RegExp(':\\s*' + escParty + '\\s*\\(', 'gi'), ': (');
                // Handle colon with duplicated party name e.g. ": PartyName" -> ""
                str = str.replace(new RegExp(':\\s*' + escParty + '\\s*$', 'gi'), '');
                // Remove bare party name occurrences inside parentheses if duplicated
                str = str.replace(new RegExp('^' + escParty + '\\s*[:\\-]?\\s*', 'gi'), '');
            }

            // Remove empty parens like () or ( ) or ( - ) or double parens (( ... ))
            str = str.replace(/\(\s*\)/g, '')
                     .replace(/\(\s*-\s*\)/g, '')
                     .replace(/\(\s*:\s*\)/g, '')
                     .replace(/\(\s*\(/g, '(')
                     .replace(/\)\s*\)/g, ')')
                     .replace(/\s{2,}/g, ' ')
                     .trim();

            // Clean up trailing colons or separators
            str = str.replace(/[:\-]\s*$/, '').trim();

            return str || 'حركة مالية';
        },

        async printAccountStatement(partyId, params = {}) {
            if (!window.App) return;
            App.toast('جاري تجهيز كشف الحساب التفصيلي...', 'info');

            await this.getNetworkPrintSettings();

            const [partyRes, stRes] = await Promise.all([
                App.api('get_admin_details', { id: partyId }).catch(() => null),
                App.api('get_account_statement', { account_id: partyId, start_date: params.start_date || '', end_date: params.end_date || '' }).catch(() => null)
            ]);

            const party = (partyRes && partyRes.admin) ? partyRes.admin : (partyRes && partyRes.id ? partyRes : (stRes && stRes.account ? stRes.account : { fullname: 'العميل / الحساب', username: 'party' }));
            const statement = (stRes && stRes.account) ? stRes : (stRes && stRes.data ? stRes.data : {});
            const transactions = statement.transactions || stRes?.transactions || (Array.isArray(stRes) ? stRes : []);

            let runningBalance = 0;
            let totalDebit = 0;
            let totalCredit = 0;

            const baseCode = (window.App && App._baseCurrency) ? App._baseCurrency : 'YER_SANAA';
            const curSym = (window.App && typeof App.getCurrencySymbol === 'function') ? App.getCurrencySymbol(baseCode) : 'ر.ي';
            const curName = (window.App && typeof App.getCurrencyName === 'function') ? App.getCurrencyName(baseCode) : 'ريال يمني';

            const rowsHtml = transactions.map((t, idx) => {
                const debit = parseFloat(t.debit !== undefined ? t.debit : ((t.voucher_type === 'receipt' || t.type === 'debit' || t.type === 'receipt') ? (t.amount || 0) : 0));
                const credit = parseFloat(t.credit !== undefined ? t.credit : ((t.voucher_type === 'payment' || t.type === 'credit' || t.type === 'payment') ? (t.amount || 0) : 0));
                totalDebit += debit;
                totalCredit += credit;
                runningBalance += (debit - credit);
                const lineBal = t.running_balance !== undefined ? parseFloat(t.running_balance) : (t.balance_after !== undefined ? parseFloat(t.balance_after) : runningBalance);

                const rawNotes = t.notes || t.description || t.category || t.tx_type || 'حركة مالية';
                const cleanDesc = this.cleanStatementDescription(rawNotes, party.fullname || party.username);

                const rawDate = t.created_at || t.date || '';
                let datePart = '-';
                let timePart = '';
                if (rawDate && rawDate !== '-') {
                    const parts = String(rawDate).trim().split(/[\sT]+/);
                    datePart = parts[0] || '-';
                    timePart = parts[1] ? parts[1].substring(0, 8) : '';
                }

                return `
                <tr style="border-bottom:1px solid #e2e8f0; font-size:11px;">
                    <td style="text-align:center; padding:6px 3px; white-space:nowrap; width:35px;">${idx + 1}</td>
                    <td style="padding:6px 4px; white-space:nowrap; text-align:center; line-height:1.25; width:95px;">
                        <div style="font-weight:700; color:#1e293b; font-size:10.5px;">${datePart}</div>
                        ${timePart ? `<div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:2px;">${timePart}</div>` : ''}
                    </td>
                    <td style="padding:6px 4px; white-space:nowrap; text-align:center; width:65px;">
                        <code style="background:#f1f5f9; padding:2px 5px; border-radius:4px; font-weight:700; font-size:10.5px; color:#0f172a;">${this.escape(t.tx_number || t.voucher_no || t.ref_no || ('#' + (t.id || idx + 1)))}</code>
                    </td>
                    <td class="statement-desc" style="padding:6px 8px; font-weight:600; white-space:normal !important; word-wrap:break-word !important; word-break:break-word !important; overflow-wrap:break-word !important; line-height:1.4; text-align:right;">${this.escape(cleanDesc)}</td>
                    <td style="text-align:center; padding:6px 4px; font-weight:700; color:#16a34a; white-space:nowrap; font-size:11.5px; width:90px;">${debit > 0 ? this.formatMoney(debit, false) : '-'}</td>
                    <td style="text-align:center; padding:6px 4px; font-weight:700; color:#dc2626; white-space:nowrap; font-size:11.5px; width:90px;">${credit > 0 ? this.formatMoney(credit, false) : '-'}</td>
                    <td style="text-align:center; padding:6px 4px; font-weight:800; color:${lineBal >= 0 ? '#0284c7' : '#dc2626'}; white-space:nowrap; font-size:11.5px; width:95px;">${this.formatMoney(lineBal, false)}</td>
                </tr>
                `;
            }).join('') || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">لا توجد حركات مالية مسجلة لهذه الفترة</td></tr>';

            const finalBal = party.balance !== undefined ? parseFloat(party.balance) : (statement.summary?.net_balance !== undefined ? parseFloat(statement.summary.net_balance) : runningBalance);
            const tafqeetBal = this.tafqeet(Math.abs(finalBal), baseCode);

            const html = `
            <div class="sam-statement-doc">
                ${statement.balance_consistency?.matches===false?'<p style="padding:10px;border:1px solid #f2d592;background:#fff9e9;color:#92400e">تنبيه: الرصيد المخزّن يختلف عن مجموع الحركات. قراءة هذا التقرير لا تعدّل الرصيد؛ يلزم مراجعة القيود.</p>':''}
                ${this.renderHeader('كشف حساب مالي تفصيلي', 'الجهة: ' + (party.fullname || party.username), [
                    { label: 'اسم الحساب / العميل', value: '<b>' + this.escape(party.fullname || party.username) + '</b>' },
                    { label: 'اسم المستخدم / الكود', value: '<code>@' + this.escape(party.username || party.id) + '</code>' },
                    { label: 'العملة المعتمدة للكشف', value: '<b style="color:#0369a1; font-size:12.5px;">' + curName + ' (' + curSym + ')</b>' },
                    { label: 'الفترة المحددة', value: (params.start_date || 'البداية') + ' إلى ' + (params.end_date || 'الآن') },
                    { label: 'الرصيد الختامي الحالي', value: '<b style="font-size:14px; color:' + (finalBal >= 0 ? '#16a34a' : '#dc2626') + ';">' + this.formatMoney(finalBal) + '</b>' }
                ])}

                <div style="margin-bottom:14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:700; color:#1e40af;">الرصيد المالي الحالي كتابةً:</span>
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">
                            فقط <b>${tafqeetBal || 'صفر'}</b> لا غير (${finalBal >= 0 ? 'رصيد دائن / له' : 'رصيد مدين / عليه'}).
                        </div>
                    </div>
                    <div style="text-align:left; background:#fff; border:1px solid #bfdbfe; border-radius:4px; padding:4px 10px;">
                        <span style="font-size:11px; color:#64748b; display:block;">العملة:</span>
                        <b style="color:#0369a1; font-size:12px;">${curSym}</b>
                    </div>
                </div>

                <div class="sam-statement-table-wrapper" style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; margin-bottom:16px; border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
                    <table class="mt-table sam-doc-table" style="width:100%; border-collapse:collapse; margin-bottom:0; table-layout:auto;">
                        <thead>
                            <tr style="background:#0f172a; color:#fff; font-size:11.5px;">
                                <th style="padding:8px 3px; width:35px; text-align:center;">#</th>
                                <th style="padding:8px 4px; width:95px; text-align:center; white-space:nowrap;">التاريخ والوقت</th>
                                <th style="padding:8px 4px; width:65px; text-align:center; white-space:nowrap;">رقم المرجع</th>
                                <th style="padding:8px 6px; text-align:right;">البيان والتفاصيل</th>
                                <th style="padding:8px 4px; width:90px; text-align:center; white-space:nowrap;">مدين (له)</th>
                                <th style="padding:8px 4px; width:90px; text-align:center; white-space:nowrap;">دائن (عليه)</th>
                                <th style="padding:8px 4px; width:95px; text-align:center; white-space:nowrap;">الرصيد التراكمي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background:#f1f5f9; font-weight:800; font-size:12px; border-top:2px solid #0f172a;">
                                <td colspan="4" style="text-align:right; padding:8px 12px;">الإجماليات الكلية (${curSym}):</td>
                                <td style="text-align:center; padding:8px 4px; color:#16a34a; white-space:nowrap; font-size:12px;">${this.formatMoney(totalDebit, false)}</td>
                                <td style="text-align:center; padding:8px 4px; color:#dc2626; white-space:nowrap; font-size:12px;">${this.formatMoney(totalCredit, false)}</td>
                                <td style="text-align:center; padding:8px 4px; color:#0284c7; white-space:nowrap; font-size:12px;">${this.formatMoney(runningBalance, false)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                ${this.renderSignatures()}
            </div>
            `;

            const netInfo = this.getNetworkInfo();
            const netName = netInfo.name || 'شبكة إنترنت';
            const balStatus = (finalBal >= 0 ? `دائن (له): ${this.formatMoney(finalBal)}` : `مدين (عليه): ${this.formatMoney(Math.abs(finalBal))}`);
            
            const waSummary = 
`📊 *كشف حساب مالي رسمي*
🏢 *الشبكة:* ${netName}
👤 *العميل:* ${party.fullname || party.username}
📱 *رقم الحساب:* #${party.id || party.username}
📅 *الفترة:* ${(params.start_date || 'البداية')} إلى ${(params.end_date || 'الآن')}
──────────────────
📦 *إجمالي المسحوبات (مدين):* ${this.formatMoney(totalDebit)}
💵 *إجمالي السدادات (دائن):* ${this.formatMoney(totalCredit)}
⚖️ *الرصيد الختامي:* ${balStatus}
📝 *المبلغ كتابةً:* فقط ${tafqeetBal || 'صفر'} لا غير.
──────────────────
📎 *مرفق صورة كشف الحساب المالي التفصيلي.*
✨ *شكراً لتعاملكم معنا.*`;

            this.preview(html, {
                title: 'كشف حساب: ' + (party.fullname || party.username),
                filename: 'Statement_' + (party.username || party.id) + '_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false,
                phone: party.phone || '',
                whatsappText: waSummary
            });
        },

        // Bulk Statements Print
        async printBulkStatements(partyIds = []) {
            if (!partyIds || partyIds.length === 0) {
                return App.toast('يرجى تحديد عميل أو حساب واحد على الأقل للطباعة الجماعية', 'warning');
            }

            App.toast('جاري إعداد كشوفات حسابات ' + partyIds.length + ' عميل...', 'info');
            let combinedHtml = '<div>';
            for (let i = 0; i < partyIds.length; i++) {
                const pId = partyIds[i];
                const res = await App.api('get_admin_details', { id: pId });
                const party = res?.admin || (res?.id?res:{ fullname: 'عميل ' + pId, username: 'user_' + pId });
                const stRes = await App.api('get_cashbox_statement', { party_id: pId }) || [];
                const transactions = Array.isArray(stRes) ? stRes : (stRes?.data || []);

                combinedHtml += `
                <div style="page-break-after:${i !== partyIds.length - 1 ? 'always' : 'auto'}; margin-bottom:30px;">
                    ${this.renderHeader('كشف حساب مالي مجمع', 'العميل: ' + party.fullname, [
                        { label: 'العميل', value: party.fullname },
                        { label: 'اسم المستخدم', value: '@' + party.username },
                        { label: 'الرصيد النهائي', value: this.formatMoney(party.balance || 0) }
                    ])}
                    <div style="font-size:12px; margin-bottom:10px;">العمليات المعروضة: <b>${transactions.length}</b> حركة. ${stRes?.has_more?'<strong style="color:#b45309">هذه صفحة محدودة وتوجد حركات أخرى؛ لا تعتمدها كشفًا كاملًا.</strong>':''}</div>
                    ${this.renderSignatures(['المحاسب', 'العميل'])}
                </div>
                `;
            }
            combinedHtml += '</div>';

            this.preview(combinedHtml, {
                title: 'طباعة مجمعة لـ (' + partyIds.length + ') كشف حساب',
                filename: 'Bulk_Statements_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // =========================================================================
        // 3. INVOICES (فواتير المبيعات ونقاط البيع والمشتريات - مفرد وجماعي)
        // =========================================================================
        
        buildInvoiceHtml(inv, isThermal = false) {
            const net = this.getNetworkInfo();
            const qrData = 'INV:' + inv.invoice_no + '|AMT:' + (inv.final_amount || inv.total_amount) + '|DATE:' + inv.created_at;
            const tafqeetInv = this.tafqeet(inv.final_amount || inv.total_amount, inv.currency_code);

            const items = inv.items || inv.cards || [];

            if (isThermal) {
                return `
                <div class="thermal-receipt" style="font-size:12px; line-height:1.35; text-align:center; color:#000;">
                    <div style="font-weight:900; font-size:15px;">${this.escape(net.name)}</div>
                    <div style="font-size:10px; color:#444;">فاتورة مبيعات نقاط البيع</div>
                    <div style="border-bottom:1px dashed #000; margin:6px 0;"></div>

                    <div style="display:flex; justify-content:space-between; font-size:11px;">
                        <span><b>فاتورة #:</b> <code>${this.escape(inv.invoice_no)}</code></span>
                        <span>${inv.created_at ? inv.created_at.split(' ')[0] : ''}</span>
                    </div>
                    <div style="text-align:right; font-size:11px; margin-top:3px;">
                        <div><b>العميل:</b> ${this.escape(inv.customer_name || inv.distributor_name || 'عميل نقدي')}</div>
                    </div>

                    <div style="border-bottom:1px solid #000; margin:6px 0;"></div>

                    <!-- Items Table -->
                    <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:right;">
                        <thead>
                            <tr style="border-bottom:1px solid #000;">
                                <th style="text-align:right;">الصنف</th>
                                <th style="text-align:center;">الكمية</th>
                                <th style="text-align:center;">السعر</th>
                                <th style="text-align:left;">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(it => `
                            <tr>
                                <td>${this.escape(it.profile_name || it.item_name || 'كرت')}</td>
                                <td style="text-align:center;">${it.quantity || it.cards_count || 1}</td>
                                <td style="text-align:center;">${parseFloat(it.unit_price || it.price || 0)}</td>
                                <td style="text-align:left; font-weight:700;">${parseFloat(it.total_price || (it.quantity * it.unit_price) || 0)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>

                    <div style="border-top:1px dashed #000; margin:6px 0;"></div>

                    <div style="text-align:right; font-size:11.5px; line-height:1.5;">
                        <div style="display:flex; justify-content:space-between;"><span>الإجمالي:</span> <b>${this.formatMoney(inv.total_amount)}</b></div>
                        ${parseFloat(inv.discount_amount) > 0 ? `<div style="display:flex; justify-content:space-between; color:#c00;"><span>الخصم:</span> <b>-${this.formatMoney(inv.discount_amount)}</b></div>` : ''}
                        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; border-top:1px solid #000; padding-top:2px; margin-top:2px;">
                            <span>الصافي المطلوب:</span> <span>${this.formatMoney(inv.final_amount || inv.total_amount)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;"><span>المدفوع:</span> <span>${this.formatMoney(inv.paid_amount || 0)}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>المتبقي:</span> <b>${this.formatMoney(inv.remaining_amount || 0)}</b></div>
                    </div>

                    <div style="display:flex; justify-content:center; margin:8px 0;">
                        <img src="${this.getQrUrl(qrData, 75)}" style="width:70px; height:70px;" />
                    </div>

                    <div style="font-size:9.5px; color:#555; border-top:1px dashed #999; padding-top:4px;">
                        نتشرف بخدمتكم دائماً
                    </div>
                </div>
                `;
            }

            // Standard A4 Invoice
            return `
            <div class="sam-a4-invoice" style="border:1px solid #cbd5e1; border-radius:8px; padding:20px;">
                ${this.renderHeader('فاتورة مبيعات رسمية', 'رقم الفاتورة: ' + inv.invoice_no, [
                    { label: 'رقم الفاتورة', value: '<code>' + this.escape(inv.invoice_no) + '</code>' },
                    { label: 'تاريخ الفاتورة', value: inv.created_at || '-' },
                    { label: 'العميل / المستلم', value: '<b>' + this.escape(inv.customer_name || inv.distributor_name || 'عميل نقدي') + '</b>' },
                    { label: 'حالة السداد', value: parseFloat(inv.remaining_amount) <= 0 ? '<span style="color:#16a34a; font-weight:800;">✓ مسددة بالكامل</span>' : '<span style="color:#dc2626; font-weight:800;">متبقي: ' + this.formatMoney(inv.remaining_amount) + '</span>' }
                ])}

                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; font-size:12px;">
                            <th style="padding:8px; width:30px;">#</th>
                            <th style="padding:8px; text-align:right;">الباقة / الصنف</th>
                            <th style="padding:8px; text-align:center;">الكمية (كروت)</th>
                            <th style="padding:8px; text-align:center;">سعر الكرت</th>
                            <th style="padding:8px; text-align:center;">سعر الورقة</th>
                            <th style="padding:8px; text-align:center;">إجمالي الصنف</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                        <tr style="border-bottom:1px solid #e2e8f0; font-size:12px;">
                            <td style="text-align:center; padding:6px 8px;">${idx + 1}</td>
                            <td style="padding:6px 8px; font-weight:700; color:#0284c7;">${this.escape(it.profile_name || it.item_name || 'كرت شبكة')}</td>
                            <td style="text-align:center; padding:6px 8px; font-weight:bold;">${it.quantity || it.cards_count || 1}</td>
                            <td style="text-align:center; padding:6px 8px;">${this.formatMoney(it.unit_price || it.price || 0)}</td>
                            <td style="text-align:center; padding:6px 8px;">${this.formatMoney(it.sheet_price || (it.unit_price * (it.cards_per_sheet || 1)) || 0)}</td>
                            <td style="text-align:center; padding:6px 8px; font-weight:800;">${this.formatMoney(it.total_price || ((it.quantity || 1) * (it.unit_price || 0)))}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>

                <!-- Summary Breakdown Grid -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <div style="flex:1; margin-left:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px;">
                        <div style="font-weight:700; font-size:12px; color:#334155;">التفقيط المالي للصافي:</div>
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:3px;">
                            فقط <b>${tafqeetInv || '...........................................'}</b> لا غير.
                        </div>
                        <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
                            <img src="${this.getQrUrl(qrData, 75)}" style="width:65px; height:65px; border:1px solid #cbd5e1; border-radius:4px; padding:2px;" />
                            <div style="font-size:10.5px; color:#64748b;">فاتورة ضريبية / مبيعات معتمدة إلكترونياً</div>
                        </div>
                    </div>

                    <div style="width:280px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; font-size:12.5px;">
                        <div style="display:flex; justify-content:space-between; padding:3px 0;"><span>المجموع الإجمالي:</span> <b>${this.formatMoney(inv.total_amount)}</b></div>
                        ${parseFloat(inv.discount_amount) > 0 ? `<div style="display:flex; justify-content:space-between; padding:3px 0; color:#dc2626;"><span>الخصم الممنوح:</span> <b>-${this.formatMoney(inv.discount_amount)}</b></div>` : ''}
                        <div style="display:flex; justify-content:space-between; padding:5px 0; border-top:2px solid #0f172a; margin-top:4px; font-size:14px; font-weight:900; color:#0284c7;">
                            <span>الصافي النهائي:</span> <span>${this.formatMoney(inv.final_amount || inv.total_amount)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:3px 0; color:#16a34a; font-weight:700;"><span>المبلغ المدفوع:</span> <span>${this.formatMoney(inv.paid_amount || 0)}</span></div>
                        <div style="display:flex; justify-content:space-between; padding:3px 0; color:#dc2626; font-weight:800;"><span>المبلغ المتبقي:</span> <span>${this.formatMoney(inv.remaining_amount || 0)}</span></div>
                    </div>
                </div>

                ${this.renderSignatures(['المبيعات / المحاسب', 'توقيع العميل المستلم'])}
            </div>
            `;
        },

        // Single Sales Invoice Print
        async printSingleSaleInvoice(invoiceId, format = 'a4') {
            if (!window.App) return;
            App.toast('جاري تحميل تفاصيل الفاتورة...', 'info');

            const res = await App.api('get_sale_invoice_details', { invoice_id: invoiceId });
            if (!res || !res.invoice) {
                return App.toast('تعذر جلب تفاصيل الفاتورة', 'danger');
            }

            const inv = res.invoice;
            const isThermal = (format === 'thermal');
            const html = this.buildInvoiceHtml(inv, isThermal);

            this.preview(html, {
                title: 'طباعة فاتورة مبيعات [' + inv.invoice_no + ']',
                filename: 'Invoice_' + inv.invoice_no,
                isThermal: isThermal,
                allowThermalToggle: true,
                onToggleFormat: 'App.PrintEngine.printSingleSaleInvoice.bind(App.PrintEngine, ' + invoiceId + ')',
                whatsappText: '*فاتورة مبيعات كروت*\nرقم: ' + inv.invoice_no + '\nالعميل: ' + (inv.customer_name || 'عميل') + '\nالصافي: ' + (inv.final_amount || inv.total_amount) + ' ر.ي\nالمدفوع: ' + (inv.paid_amount || 0) + '\nالمتبقي: ' + (inv.remaining_amount || 0)
            });
        },

        // Bulk Sales Invoices Print
        async printSalesInvoicesBulk(invoiceIds = []) {
            if (!invoiceIds || invoiceIds.length === 0) {
                return App.toast('يرجى تحديد فاتورة واحدة على الأقل للطباعة الجماعية', 'warning');
            }

            App.toast('جاري تجهيز ' + invoiceIds.length + ' فاتورة للطباعة الجماعية...', 'info');
            const invoicesData = await Promise.all(
                invoiceIds.map(id => App.api('get_sale_invoice_details', { invoice_id: id }))
            );

            const validInvoices = invoicesData.map(r => r?.invoice).filter(Boolean);
            if (validInvoices.length === 0) return App.toast('تعذر تحميل الفواتير المحددة', 'danger');

            let bulkHtml = '<div>';
            validInvoices.forEach((inv, index) => {
                bulkHtml += `
                <div style="page-break-after:${index !== validInvoices.length - 1 ? 'always' : 'auto'}; margin-bottom:30px;">
                    ${this.buildInvoiceHtml(inv, false)}
                </div>
                `;
            });
            bulkHtml += '</div>';

            this.preview(bulkHtml, {
                title: 'طباعة مجمعة لـ (' + validInvoices.length + ') فاتورة مبيعات',
                filename: 'Bulk_Invoices_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // =========================================================================
        // 4. ACCOUNTS & FINANCIAL STATEMENTS (الحسابات، ميزان المراجعة، دليل الحسابات)
        // =========================================================================
        
        // Chart of Accounts Tree & Balances Print
        async printChartOfAccountsReport() {
            if (!window.App) return;
            App.toast('جاري تجهيز تقرير دليل الحسابات...', 'info');

            const res = await App.api('get_chart_of_accounts') || { accounts: [] };
            const accounts = Array.isArray(res) ? res : (res.accounts || []);

            const rows = accounts.map((acc, idx) => `
            <tr style="border-bottom:1px solid #e2e8f0; font-size:12px;">
                <td style="text-align:center; padding:6px;">${idx + 1}</td>
                <td style="padding:6px;"><code>${this.escape(acc.code || acc.account_code)}</code></td>
                <td style="padding:6px; font-weight:700;">${this.escape(acc.name || acc.account_name)}</td>
                <td style="padding:6px; color:#64748b;">${this.escape(acc.type || acc.account_type || 'أصول')}</td>
                <td style="text-align:center; padding:6px; font-weight:800; color:${parseFloat(acc.balance || 0) >= 0 ? '#16a34a' : '#dc2626'};">${this.formatMoney(acc.balance || 0)}</td>
            </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد حسابات مسجلة</td></tr>';

            const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

            const html = `
            <div class="sam-accounts-doc">
                ${this.renderHeader('دليل الحسابات والأرصدة الشامل', 'شجرة الحسابات المالية', [
                    { label: 'إجمالي الحسابات', value: accounts.length },
                    { label: 'صافي الأرصدة التراكمية', value: this.formatMoney(totalBalance) }
                ])}

                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; font-size:12px;">
                            <th style="padding:8px; width:30px;">#</th>
                            <th style="padding:8px; text-align:right;">رمز الحساب</th>
                            <th style="padding:8px; text-align:right;">اسم الحساب المالي</th>
                            <th style="padding:8px; text-align:right;">التصنيف المحاسبي</th>
                            <th style="padding:8px; text-align:center;">الرصيد الحالي</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                ${this.renderSignatures(['المحاسب العام', 'المدير المالي'])}
            </div>
            `;

            this.preview(html, {
                title: 'طباعة دليل الحسابات الشامل',
                filename: 'Chart_Of_Accounts_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // Trial Balance Statement Print
        async printTrialBalanceReport() {
            if (!window.App) return;
            App.toast('جاري تجهيز ميزان المراجعة...', 'info');

            const res = await App.api('get_trial_balance') || { data: [] };
            const records = Array.isArray(res) ? res : (res.data || res.records || []);

            let totalDebit = 0;
            let totalCredit = 0;

            const rows = records.map((r, idx) => {
                const d = parseFloat(r.debit || 0);
                const c = parseFloat(r.credit || 0);
                totalDebit += d;
                totalCredit += c;
                return `
                <tr style="border-bottom:1px solid #e2e8f0; font-size:12px;">
                    <td style="text-align:center; padding:6px;">${idx + 1}</td>
                    <td style="padding:6px;"><code>${this.escape(r.account_code || r.code)}</code></td>
                    <td style="padding:6px; font-weight:700;">${this.escape(r.account_name || r.name)}</td>
                    <td style="text-align:center; padding:6px; color:#16a34a; font-weight:bold;">${d > 0 ? this.formatMoney(d) : '-'}</td>
                    <td style="text-align:center; padding:6px; color:#dc2626; font-weight:bold;">${c > 0 ? this.formatMoney(c) : '-'}</td>
                </tr>
                `;
            }).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد بيانات لميزان المراجعة</td></tr>';

            const html = `
            <div class="sam-trial-balance-doc">
                ${this.renderHeader('ميزان المراجعة بالمجاميع والأرصدة', 'القوائم المالية الختامية', [
                    { label: 'إجمالي الحركات المدينة', value: this.formatMoney(totalDebit) },
                    { label: 'إجمالي الحركات الدائنة', value: this.formatMoney(totalCredit) },
                    { label: 'حالة التوازن', value: Math.abs(totalDebit - totalCredit) < 0.01 ? '<b style="color:#16a34a;">✓ متزن تماماً</b>' : '<b style="color:#dc2626;">غير متزن</b>' }
                ])}

                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; font-size:12px;">
                            <th style="padding:8px; width:30px;">#</th>
                            <th style="padding:8px; text-align:right;">رمز الحساب</th>
                            <th style="padding:8px; text-align:right;">اسم الحساب</th>
                            <th style="padding:8px; text-align:center;">إجمالي المدين</th>
                            <th style="padding:8px; text-align:center;">إجمالي الدائن</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid #0f172a;">
                            <td colspan="3" style="padding:8px 12px; text-align:left;">المجموع الكلي:</td>
                            <td style="text-align:center; padding:8px; color:#16a34a;">${this.formatMoney(totalDebit)}</td>
                            <td style="text-align:center; padding:8px; color:#dc2626;">${this.formatMoney(totalCredit)}</td>
                        </tr>
                    </tfoot>
                </table>
                ${this.renderSignatures(['المحاسب المالي', 'مدير الحسابات', 'الاعتماد'])}
            </div>
            `;

            this.preview(html, {
                title: 'طباعة ميزان المراجعة',
                filename: 'Trial_Balance_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // =========================================================================
        // 5. ASSETS & HARDWARE INVENTORY (الأصول والمعدات - بطاقة، ملصقات، وجرد شامل)
        // =========================================================================
        
        
        // Build Purchase Invoice HTML
        buildPurchaseInvoiceHtml(p) {
            const net = this.getNetworkInfo();
            const items = p.items || [];
            const qrData = 'PURCHASE:' + p.invoice_no + '|SUPPLIER:' + (p.supplier_name || '') + '|AMT:' + p.total_amount;
            const tafqeetText = this.tafqeet(p.total_amount, p.currency_code);

            return `
            <div class="sam-purchase-invoice-doc" style="border:1px solid #cbd5e1; border-radius:8px; padding:20px;">
                ${this.renderHeader('فاتورة مشتريات وتوريد', 'رقم الفاتورة: ' + p.invoice_no, [
                    { label: 'رقم الفاتورة', value: '<code>' + this.escape(p.invoice_no) + '</code>' },
                    { label: 'المورد / الشركة', value: '<b>' + this.escape(p.supplier_name || 'مورد عام') + '</b>' },
                    { label: 'تاريخ الفاتورة', value: p.invoice_date || p.created_at || '-' },
                    { label: 'حالة السداد', value: parseFloat(p.remaining_amount) <= 0 ? '<span style="color:#16a34a; font-weight:800;">✓ مسددة بالكامل</span>' : '<span style="color:#dc2626; font-weight:800;">متبقي: ' + this.formatMoney(p.remaining_amount) + '</span>' }
                ])}

                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; font-size:12px;">
                            <th style="padding:8px; width:30px;">#</th>
                            <th style="padding:8px; text-align:right;">البند / الصنف</th>
                            <th style="padding:8px; text-align:right;">التصنيف</th>
                            <th style="padding:8px; text-align:center;">الكمية</th>
                            <th style="padding:8px; text-align:center;">سعر الوحدة</th>
                            <th style="padding:8px; text-align:center;">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, idx) => `
                        <tr style="border-bottom:1px solid #e2e8f0; font-size:12px;">
                            <td style="text-align:center; padding:6px 8px;">${idx + 1}</td>
                            <td style="padding:6px 8px; font-weight:700; color:#0284c7;">${this.escape(it.item_name || it.description || 'صنف مشتريات')}</td>
                            <td style="padding:6px 8px; color:#64748b;">${this.escape(it.category || '-')}</td>
                            <td style="text-align:center; padding:6px 8px; font-weight:bold;">${it.quantity || 1} ${this.escape(it.unit || '')}</td>
                            <td style="text-align:center; padding:6px 8px;">${this.formatMoney(it.unit_price || 0)}</td>
                            <td style="text-align:center; padding:6px 8px; font-weight:800;">${this.formatMoney(it.total_price || ((it.quantity || 1) * (it.unit_price || 0)))}</td>
                        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center; padding:15px;">لا توجد بنود مسجلة</td></tr>'}
                    </tbody>
                </table>

                <!-- Summary Breakdown -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <div style="flex:1; margin-left:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px;">
                        <div style="font-weight:700; font-size:12px; color:#334155;">المبلغ كتابةً وتفقيطاً:</div>
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:3px;">
                            فقط <b>${tafqeetText || '...........................................'}</b> لا غير.
                        </div>
                    </div>

                    <div style="width:280px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; font-size:12.5px;">
                        <div style="display:flex; justify-content:space-between; padding:4px 0;"><span>إجمالي الفاتورة:</span> <b>${this.formatMoney(p.total_amount)}</b></div>
                        <div style="display:flex; justify-content:space-between; padding:4px 0; color:#16a34a; font-weight:700;"><span>المبلغ المسدد:</span> <span>${this.formatMoney(p.paid_amount || 0)}</span></div>
                        <div style="display:flex; justify-content:space-between; padding:4px 0; color:#dc2626; font-weight:800; border-top:1px solid #cbd5e1; margin-top:4px;"><span>المتبقي الآجل:</span> <span>${this.formatMoney(p.remaining_amount || 0)}</span></div>
                    </div>
                </div>

                ${this.renderSignatures(['أمين المخزن / المستلم', 'مسؤول المشتريات', 'الاعتماد المالي'])}
            </div>
            `;
        },

        // Single Purchase Invoice Print
        async printSinglePurchaseInvoice(purchaseId) {
            if (!window.App) return;
            App.toast('جاري جلب تفاصيل فاتورة المشتريات...', 'info');

            const res = await App.api('get_purchase_details', { id: purchaseId });
            if (!res || (!res.id && !res.purchase)) {
                return App.toast('تعذر جلب تفاصيل الفاتورة', 'danger');
            }

            const p = res.purchase || res;
            const html = this.buildPurchaseInvoiceHtml(p);

            this.preview(html, {
                title: 'طباعة فاتورة مشتريات [' + p.invoice_no + ']',
                filename: 'Purchase_Invoice_' + p.invoice_no,
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // Single Asset Data Sheet
        buildAssetCardHtml(asset) {
            const qrData = 'ASSET:' + (asset.asset_code || asset.id) + '|MAC:' + (asset.mac_address || '') + '|NAME:' + asset.asset_name;
            return `
            <div class="sam-asset-card-doc" style="border:2px solid #0284c7; border-radius:8px; padding:18px;">
                ${this.renderHeader('بطاقة تعريف الأصل والمعدة', 'كود الأصل: ' + (asset.asset_code || asset.id), [
                    { label: 'كود الأصل', value: '<code>' + this.escape(asset.asset_code || asset.id) + '</code>' },
                    { label: 'اسم الجهاز / المعدة', value: '<b>' + this.escape(asset.asset_name) + '</b>' },
                    { label: 'التصنيف', value: this.escape(asset.category || 'أجهزة ومعدات') },
                    { label: 'الحالة الفنية', value: '<span style="font-weight:700;">' + this.escape(asset.status || 'في الخدمة') + '</span>' }
                ])}

                <div style="display:flex; gap:20px; margin-bottom:16px;">
                    <table class="mt-table" style="flex:1; border-collapse:collapse; font-size:12.5px;">
                        <tbody>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px; width:35%;">النوع والموديل:</td><td style="padding:6px 10px;">${this.escape(asset.model || '-')}</td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">الرقم التسلسلي (Serial No):</td><td style="padding:6px 10px;"><code>${this.escape(asset.serial_number || '-')}</code></td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">عنوان الماك (MAC Address):</td><td style="padding:6px 10px;"><code>${this.escape(asset.mac_address || '-')}</code></td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">الموقع / البرج / الراوتر:</td><td style="padding:6px 10px; color:#0284c7; font-weight:700;">${this.escape(asset.node_name || asset.location || 'عام')}</td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">المسؤول / العهدة:</td><td style="padding:6px 10px; font-weight:700;">${this.escape(asset.custodian_name || asset.user_name || 'الإدارة')}</td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">تاريخ الشراء / التركيب:</td><td style="padding:6px 10px;">${asset.purchase_date || asset.created_at || '-'}</td></tr>
                            <tr style="border-bottom:1px solid #e2e8f0;"><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">تكلفة الشراء:</td><td style="padding:6px 10px; font-weight:800;">${this.formatMoney(asset.purchase_cost || asset.cost || 0)}</td></tr>
                            <tr><td style="font-weight:700; background:#f8fafc; padding:6px 10px;">القيمة التقديرية الحالية:</td><td style="padding:6px 10px; font-weight:800; color:#16a34a;">${this.formatMoney(asset.current_value || asset.purchase_cost || 0)}</td></tr>
                        </tbody>
                    </table>

                    <div style="width:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid #cbd5e1; border-radius:6px; padding:12px; text-align:center; background:#f8fafc;">
                        <img src="${this.getQrUrl(qrData, 120)}" style="width:110px; height:110px;" />
                        <div style="font-size:11px; font-weight:700; margin-top:8px;"><code>${this.escape(asset.asset_code || asset.id)}</code></div>
                        <div style="font-size:10px; color:#64748b;">ملصق تتبع الأصل الذكي</div>
                    </div>
                </div>

                ${this.renderSignatures(['مسؤول الصيانة والشبكات', 'أمين العهدة والمخزن', 'الاعتماد'])}
            </div>
            `;
        },

        // Single Asset Print
        async printSingleAsset(assetId) {
            if (!window.App) return;
            App.toast('جاري جلب بطاقة الأصل...', 'info');

            const res = await App.api('get_asset_details', { asset_id: assetId }) || await App.api('get_assets', { id: assetId });
            const asset = (res && res.asset) ? res.asset : (Array.isArray(res) ? res[0] : (res?.data ? res.data[0] : null));

            if (!asset) return App.toast('تعذر العثور على بيانات الأصل', 'danger');

            const html = this.buildAssetCardHtml(asset);

            this.preview(html, {
                title: 'بطاقة الأصل: ' + asset.asset_name + ' [' + (asset.asset_code || asset.id) + ']',
                filename: 'Asset_' + (asset.asset_code || asset.id),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // Bulk Asset Inventory Register Print
        async printAssetsInventoryReport(params = {}) {
            if (!window.App) return;
            App.toast('جاري تجهيز تقرير جرد الأصول الشامل...', 'info');

            const res = await App.api('get_assets', params) || { data: [] };
            const assets = Array.isArray(res) ? res : (res.data || []);

            let totalCost = 0;
            let totalVal = 0;

            const rows = assets.map((a, idx) => {
                const cost = parseFloat(a.purchase_cost || a.cost || 0);
                const val = parseFloat(a.current_value || cost);
                totalCost += cost;
                totalVal += val;

                return `
                <tr style="border-bottom:1px solid #e2e8f0; font-size:11.5px;">
                    <td style="text-align:center; padding:5px;">${idx + 1}</td>
                    <td style="padding:5px;"><code>${this.escape(a.asset_code || a.id)}</code></td>
                    <td style="padding:5px; font-weight:700; color:#0284c7;">${this.escape(a.asset_name)}</td>
                    <td style="padding:5px;">${this.escape(a.category || '-')}</td>
                    <td style="padding:5px;"><code>${this.escape(a.mac_address || a.serial_number || '-')}</code></td>
                    <td style="padding:5px;">${this.escape(a.node_name || a.location || 'عام')}</td>
                    <td style="padding:5px;">${this.escape(a.custodian_name || '-')}</td>
                    <td style="text-align:center; padding:5px; font-weight:600;">${this.escape(a.status || 'يعمل')}</td>
                    <td style="text-align:center; padding:5px; font-weight:700;">${this.formatMoney(cost)}</td>
                </tr>
                `;
            }).join('') || '<tr><td colspan="9" style="text-align:center; padding:20px;">لا توجد أصول مسجلة</td></tr>';

            const html = `
            <div class="sam-inventory-report-doc">
                ${this.renderHeader('تقرير وسجل جرد الأصول والمعدات', 'جرد الأصول الثابتة والشبكات', [
                    { label: 'إجمالي عدد المعدات والأجهزة', value: '<b>' + assets.length + '</b> جهاز' },
                    { label: 'إجمالي تكلفة الشراء', value: this.formatMoney(totalCost) },
                    { label: 'القيمة التقديرية الحالية', value: this.formatMoney(totalVal) }
                ])}

                <table class="mt-table" style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; font-size:11.5px;">
                            <th style="padding:7px 4px; width:25px;">#</th>
                            <th style="padding:7px; text-align:right;">الكود</th>
                            <th style="padding:7px; text-align:right;">اسم الأصل / الجهاز</th>
                            <th style="padding:7px; text-align:right;">التصنيف</th>
                            <th style="padding:7px; text-align:right;">الماك / السيريال</th>
                            <th style="padding:7px; text-align:right;">الموقع / البرج</th>
                            <th style="padding:7px; text-align:right;">العهدة</th>
                            <th style="padding:7px; text-align:center;">الحالة</th>
                            <th style="padding:7px; text-align:center;">التكلفة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid #0f172a;">
                            <td colspan="8" style="padding:7px 12px; text-align:left;">إجمالي تكلفة جرد الأصول:</td>
                            <td style="text-align:center; padding:7px; color:#0284c7;">${this.formatMoney(totalCost)}</td>
                        </tr>
                    </tfoot>
                </table>

                ${this.renderSignatures(['لجنة الجرد والمطابقة', 'مدير الشبكات والصيانة', 'المدير العام'])}
            </div>
            `;

            this.preview(html, {
                title: 'تقرير جرد الأصول (' + assets.length + ' أصل)',
                filename: 'Assets_Inventory_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // Bulk Asset Printable Barcode Tags (ملصقات الباركود والـ QR)
        async printAssetBarcodesBulk(assetIds = []) {
            if (!assetIds || assetIds.length === 0) {
                return App.toast('يرجى تحديد أصل واحد على الأقل لطباعة ملصقات الباركود', 'warning');
            }

            App.toast('جاري تجهيز ' + assetIds.length + ' ملصق باركود للأصول...', 'info');
            const res = await App.api('get_assets', {}) || { data: [] };
            const allAssets = Array.isArray(res) ? res : (res.data || []);
            const targetAssets = allAssets.filter(a => assetIds.includes(String(a.id)) || assetIds.includes(Number(a.id)));

            if (targetAssets.length === 0) return App.toast('تعذر العثور على الأصول المحددة', 'danger');

            const net = this.getNetworkInfo();

            const tagsHtml = targetAssets.map(a => {
                const qrData = 'ASSET:' + (a.asset_code || a.id) + '|MAC:' + (a.mac_address || '');
                return `
                <div class="asset-barcode-tag" style="width:65mm; height:36mm; border:1.5px dashed #0f172a; border-radius:6px; padding:4mm; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; background:#fff; page-break-inside:avoid; margin:2mm;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #0f172a; padding-bottom:2px;">
                        <span style="font-weight:900; font-size:10px; color:#0f172a;">${this.escape(net.name)}</span>
                        <span style="font-size:9px; font-weight:bold; color:#0284c7;">أصل ثابت</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; gap:4px; margin:2px 0;">
                        <div style="flex:1; font-size:9.5px; line-height:1.2;">
                            <div style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.escape(a.asset_name)}</div>
                            <div style="font-size:8.5px; color:#475569; margin-top:2px;">كود: <b>${this.escape(a.asset_code || a.id)}</b></div>
                            ${a.mac_address ? `<div style="font-size:8px; color:#64748b;">MAC: ${this.escape(a.mac_address)}</div>` : ''}
                        </div>
                        <img src="${this.getQrUrl(qrData, 60)}" style="width:40px; height:40px;" />
                    </div>

                    <div style="font-size:8px; color:#64748b; text-align:center; border-top:1px dashed #cbd5e1; padding-top:1px;">
                        ملكية خاصة — يحظر إزالة هذا الملصق
                    </div>
                </div>
                `;
            }).join('');

            const html = `
            <div class="sam-barcode-sheet" style="display:flex; flex-wrap:wrap; gap:4mm; justify-content:flex-start;">
                ${tagsHtml}
            </div>
            `;

            this.preview(html, {
                title: 'طباعة ملصقات الباركود (' + targetAssets.length + ' ملصق)',
                filename: 'Asset_Barcodes_' + Date.now(),
                isThermal: false,
                allowThermalToggle: false
            });
        },

        // =========================================================================
        // 5. DOCUMENT & HEADER PRINT CUSTOMIZATION UI (تخصيص طباعة المستندات والترويسة)
        // =========================================================================

        async openDocumentPrintSettingsModal(networkId = null) {
            if (!window.App) return;
            App.toast('جاري تحميل إعدادات وتصاميم الطباعة...', 'info');

            const res = await App.api('get_print_settings', { network_id: networkId || 0 }).catch(() => null);
            const settings = (res && res.success && res.settings) ? res.settings : await this.getNetworkPrintSettings(networkId);
            const activeNetId = (res && res.network_id) ? res.network_id : (networkId || 0);

            const sigStr = Array.isArray(settings.signature_roles) ? settings.signature_roles.join(', ') : (settings.signature_roles || '');

            const modalHtml = `
            <div class="mt-modal-header" style="background:#0f172a; color:#fff; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:20px;">🎨</span>
                    <div>
                        <div style="font-size:15px; font-weight:800; color:#fff;">تخصيص طباعة المستندات والترويسة</div>
                        <div style="font-size:11px; color:#94a3b8;">تعديل الهوية البصرية، الشعار، الألوان والتواقيع للفواتير والكشوفات والجرد</div>
                    </div>
                </div>
                <span style="cursor:pointer; font-size:20px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>

            <div class="mt-modal-body" style="padding:20px; max-height:78vh; overflow-y:auto; background:#f8fafc;">
                <form id="sam-print-settings-form" onsubmit="App.PrintEngine.savePrintSettingsForm(event, ${activeNetId})">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        
                        <!-- Left Column: Settings Controls -->
                        <div style="display:flex; flex-direction:column; gap:14px; background:#fff; padding:16px; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                            <div style="font-weight:800; font-size:14px; color:#0f172a; border-bottom:2px solid #3b82f6; padding-bottom:6px;">
                                ⚙️ بيانات الترويسة والهوية
                            </div>

                            <div>
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🌐 اسم المنشأة / الشبكة (الترويسة الرئيسية)</label>
                                <input type="text" id="pset-header-title" class="mt-input" value="${this.escape(settings.header_title || '')}" style="width:100%; font-weight:700;" placeholder="مثال: شبكة إنترنت اللاسلكية" oninput="App.PrintEngine.updateSettingsLivePreview()" required />
                            </div>

                            <div>
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🏷️ العنوان الفرعي للترويسة</label>
                                <input type="text" id="pset-header-subtitle" class="mt-input" value="${this.escape(settings.header_subtitle || '')}" style="width:100%;" placeholder="مثال: نظام الإدارة المحاسبية والشبكات المتقدم" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                            </div>

                            <div style="display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📞 هاتف التواصل</label>
                                    <input type="text" id="pset-phone" class="mt-input" value="${this.escape(settings.phone || '')}" style="width:100%;" placeholder="777123456" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📍 العنوان والمنطقة</label>
                                    <input type="text" id="pset-address" class="mt-input" value="${this.escape(settings.address || '')}" style="width:100%;" placeholder="صنعاء - شارع الحدة" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                            </div>

                            <div style="display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🧾 الرقم الضريبي (اختياري)</label>
                                    <input type="text" id="pset-tax-no" class="mt-input" value="${this.escape(settings.tax_no || '')}" style="width:100%;" placeholder="100293847" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🖼️ رابط الشعار (Logo URL)</label>
                                    <input type="text" id="pset-logo-url" class="mt-input" value="${this.escape(settings.logo_url || '')}" style="width:100%; direction:ltr; text-align:right;" placeholder="assets/img/log.png" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                            </div>

                            <div style="display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🎨 اللون الرئيسي</label>
                                    <input type="color" id="pset-primary-color" value="${settings.primary_color || '#0f172a'}" style="width:100%; height:38px; border-radius:6px; cursor:pointer;" onchange="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">🖌️ لون العناوين والتمييز</label>
                                    <input type="color" id="pset-accent-color" value="${settings.accent_color || '#0284c7'}" style="width:100%; height:38px; border-radius:6px; cursor:pointer;" onchange="App.PrintEngine.updateSettingsLivePreview()" />
                                </div>
                            </div>

                            <div>
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📝 شروط وملاحظات تذييل المستند</label>
                                <textarea id="pset-footer-notes" class="mt-input" rows="2" style="width:100%; resize:vertical;" placeholder="شروط الفاتورة أو الملاحظات التي تظهر أسفل الكشوفات..." oninput="App.PrintEngine.updateSettingsLivePreview()">${this.escape(settings.footer_notes || '')}</textarea>
                            </div>

                            <div>
                                <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">✍️ مساحة التواقيع (مفصولة بفواصل)</label>
                                <input type="text" id="pset-signature-roles" class="mt-input" value="${this.escape(sigStr)}" style="width:100%;" placeholder="المحاسب / المنظم, المستلم / العميل, المدير العام / الاعتماد" oninput="App.PrintEngine.updateSettingsLivePreview()" />
                            </div>

                            <div style="display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">📄 المقاس الافتراضي للورق</label>
                                    <select id="pset-paper-format" class="mt-select" style="width:100%;">
                                        <option value="a4" ${settings.paper_format === 'a4' ? 'selected' : ''}>📄 A4 القياسي</option>
                                        <option value="thermal" ${settings.paper_format === 'thermal' ? 'selected' : ''}>🧾 حراري 80mm POS</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Live Interactive Preview -->
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div style="font-weight:800; font-size:14px; color:#0f172a; display:flex; justify-space-between; align-items:center;">
                                <span>👁️ معاينة الترويسة والتصميم المباشر</span>
                                <span style="font-size:11px; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; font-weight:700;">تحديث حي</span>
                            </div>

                            <div id="pset-live-preview-card" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.08); font-family:'Cairo', sans-serif;">
                                <!-- Header Preview -->
                                <div id="pset-pv-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid ${settings.primary_color || '#0f172a'}; padding-bottom:10px; margin-bottom:14px;">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <img id="pset-pv-logo" src="${settings.logo_url || 'assets/img/log.png'}" style="height:48px; width:auto; max-width:70px; object-fit:contain;" onerror="this.style.display='none';" />
                                        <div>
                                            <div id="pset-pv-title" style="font-size:16px; font-weight:900; color:${settings.primary_color || '#0f172a'};">${this.escape(settings.header_title || 'اسم الشبكة')}</div>
                                            <div id="pset-pv-subtitle" style="font-size:10.5px; color:#64748b; font-weight:600;">${this.escape(settings.header_subtitle || '')}</div>
                                            <div id="pset-pv-contact" style="font-size:10px; color:#64748b;">
                                                ${settings.phone ? 'هاتف: ' + this.escape(settings.phone) : ''} ${settings.address ? '| ' + this.escape(settings.address) : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="text-align:left;">
                                        <div id="pset-pv-doctitle" style="font-size:15px; font-weight:800; color:${settings.accent_color || '#0284c7'};">كشف حساب / فاتورة نموذجية</div>
                                        <div style="font-size:10px; color:#64748b; margin-top:2px;">معاينة حية للمستند</div>
                                    </div>
                                </div>

                                <!-- Body Dummy Table -->
                                <div style="font-size:11px; color:#475569; margin-bottom:12px;">
                                    <table style="width:100%; border-collapse:collapse; text-align:center;">
                                        <thead>
                                            <tr style="background:#f1f5f9; font-weight:700;">
                                                <th style="padding:4px; border:1px solid #e2e8f0;">#</th>
                                                <th style="padding:4px; border:1px solid #e2e8f0; text-align:right;">البيان والتفاصيل</th>
                                                <th style="padding:4px; border:1px solid #e2e8f0;">المبلغ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style="padding:4px; border:1px solid #e2e8f0;">1</td>
                                                <td style="padding:4px; border:1px solid #e2e8f0; text-align:right;">حركة نموذجية للتوضيح والمعاينة</td>
                                                <td style="padding:4px; border:1px solid #e2e8f0; font-weight:700; color:#16a34a;">150,000.00 ر.ي</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <!-- Footer Notes & Signatures Preview -->
                                <div id="pset-pv-footer-notes" style="margin-top:12px; padding:6px 10px; background:#f8fafc; border-right:3px solid ${settings.accent_color || '#0284c7'}; border-radius:4px; font-size:10px; color:#475569;">
                                    <b>ملاحظات:</b> <span id="pset-pv-notes-text">${this.escape(settings.footer_notes || 'تعتبر الفواتير نهائية')}</span>
                                </div>

                                <div id="pset-pv-signatures" style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; padding-top:10px; border-top:1px dashed #cbd5e1; font-size:10px;">
                                    <!-- Rendered dynamically -->
                                </div>
                            </div>
                        </div>

                    </div>

                    <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:14px;">
                        <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-primary" style="padding:9px 24px; font-weight:800; background:#2563eb; border-color:#1d4ed8; font-size:13px;">
                            💾 حفظ وتطبيق تخصيص الطباعة
                        </button>
                    </div>
                </form>
            </div>
            `;

            App.openModal(modalHtml, '940px');
            setTimeout(() => this.updateSettingsLivePreview(), 50);
        },

        updateSettingsLivePreview() {
            const title = document.getElementById('pset-header-title')?.value || 'اسم المنشأة / الشبكة';
            const subtitle = document.getElementById('pset-header-subtitle')?.value || '';
            const phone = document.getElementById('pset-phone')?.value || '';
            const address = document.getElementById('pset-address')?.value || '';
            const taxNo = document.getElementById('pset-tax-no')?.value || '';
            const logo = document.getElementById('pset-logo-url')?.value || 'assets/img/log.png';
            const primaryColor = document.getElementById('pset-primary-color')?.value || '#0f172a';
            const accentColor = document.getElementById('pset-accent-color')?.value || '#0284c7';
            const notes = document.getElementById('pset-footer-notes')?.value || 'تعتبر المستندات نهائية';
            const sigStr = document.getElementById('pset-signature-roles')?.value || 'المحاسب / المنظم, المستلم / العميل, المدير العام / الاعتماد';

            const headerEl = document.getElementById('pset-pv-header');
            if (headerEl) headerEl.style.borderBottomColor = primaryColor;

            const logoEl = document.getElementById('pset-pv-logo');
            if (logoEl) {
                logoEl.src = logo;
                logoEl.style.display = 'block';
            }

            const titleEl = document.getElementById('pset-pv-title');
            if (titleEl) {
                titleEl.textContent = title;
                titleEl.style.color = primaryColor;
            }

            const subEl = document.getElementById('pset-pv-subtitle');
            if (subEl) subEl.textContent = subtitle;

            const docTitleEl = document.getElementById('pset-pv-doctitle');
            if (docTitleEl) docTitleEl.style.color = accentColor;

            const contactEl = document.getElementById('pset-pv-contact');
            if (contactEl) {
                let parts = [];
                if (phone) parts.push('هاتف: ' + phone);
                if (address) parts.push('العنوان: ' + address);
                if (taxNo) parts.push('الرقم الضريبي: ' + taxNo);
                contactEl.textContent = parts.join(' | ');
            }

            const notesEl = document.getElementById('pset-pv-notes-text');
            if (notesEl) notesEl.textContent = notes;

            const notesBox = document.getElementById('pset-pv-footer-notes');
            if (notesBox) notesBox.style.borderRightColor = accentColor;

            const sigBox = document.getElementById('pset-pv-signatures');
            if (sigBox) {
                const sigList = sigStr.split(',').map(s => s.trim()).filter(Boolean);
                sigBox.innerHTML = sigList.map(r => `
                    <div style="text-align:center;">
                        <div style="font-weight:700; color:#334155; margin-bottom:20px;">${this.escape(r)}</div>
                        <div style="border-top:1px solid #94a3b8; padding-top:2px; color:#94a3b8;">التوقيع / الختم</div>
                    </div>
                `).join('');
            }
        },

        async savePrintSettingsForm(e, networkId = 0) {
            if (e && e.preventDefault) e.preventDefault();

            const payload = {
                network_id: networkId,
                header_title: document.getElementById('pset-header-title')?.value,
                header_subtitle: document.getElementById('pset-header-subtitle')?.value,
                phone: document.getElementById('pset-phone')?.value,
                address: document.getElementById('pset-address')?.value,
                tax_no: document.getElementById('pset-tax-no')?.value,
                logo_url: document.getElementById('pset-logo-url')?.value,
                primary_color: document.getElementById('pset-primary-color')?.value,
                accent_color: document.getElementById('pset-accent-color')?.value,
                footer_notes: document.getElementById('pset-footer-notes')?.value,
                signature_roles: document.getElementById('pset-signature-roles')?.value,
                paper_format: document.getElementById('pset-paper-format')?.value || 'a4'
            };

            payload.show_qr = 1;
            payload.show_watermark = 1;
            const res = await App.api('save_print_settings', payload).catch(() => null);
            if (res && res.success) {
                this._cachedPrintSettings = null;
                await this.getNetworkPrintSettings();
                App.closeModal();
                App.toast(res.message || 'تم حفظ وتخصيص طباعة المستندات والترويسة بنجاح ✓', 'success');
            } else {
                App.toast('خطأ: ' + (res?.error || 'فشل حفظ إعدادات الطباعة'), 'danger');
            }
        }
    };

    // Attach to global App
    window.App = window.App || {};
    window.App.PrintEngine = PrintEngine;

    // Direct helper aliases on App
    const withSettings = (fn) => async (...args) => {
        await PrintEngine.getNetworkPrintSettings();
        return fn.apply(PrintEngine, args);
    };
    App.printVoucher = withSettings((id, format) => PrintEngine.printSingleVoucher(id, format));
    App.printVouchersBulk = withSettings((ids) => PrintEngine.printVouchersBulk(ids));
    App.printAccountStatement = withSettings((id, params) => PrintEngine.printAccountStatement(id, params));
    App.printBulkStatements = withSettings((ids) => PrintEngine.printBulkStatements(ids));
    App.printSaleInvoiceDoc = withSettings((id, format) => PrintEngine.printSingleSaleInvoice(id, format));
    App.printSaleInvoicesBulk = withSettings((ids) => PrintEngine.printSalesInvoicesBulk(ids));
    App.printChartOfAccountsReport = withSettings(() => PrintEngine.printChartOfAccountsReport());
    App.printTrialBalanceReport = withSettings(() => PrintEngine.printTrialBalanceReport());
    App.printPurchaseInvoiceDoc = withSettings((id) => PrintEngine.printSinglePurchaseInvoice(id));
    App.printAssetCardDoc = withSettings((id) => PrintEngine.printSingleAsset(id));
    App.printAssetsInventoryReport = withSettings((params) => PrintEngine.printAssetsInventoryReport(params));
    App.printAssetBarcodesBulk = withSettings((ids) => PrintEngine.printAssetBarcodesBulk(ids));
    App.openDocumentPrintSettingsModal = (netId) => PrintEngine.openDocumentPrintSettingsModal(netId);

})();
