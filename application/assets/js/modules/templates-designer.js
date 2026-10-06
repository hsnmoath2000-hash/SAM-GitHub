/**
 * SAM User Manager — Voucher Card Template Designer & Canvas
 */
'use strict';

Object.assign(window.App, {
    async renderTemplates() {
        const templates = await this.api('get_templates') || [];
        const speedTiersRes = await this.api('get_speed_tiers');
        const speedTiers = speedTiersRes?.tiers || [];
        const profiles = await this.api('get_profiles') || [];
        this.templatePackageLinksById = new Map(templates.map(template => {
            const templateId = Number(template.id);
            const legacyProfileName = String(template.profile_name || '').trim();
            const linkedProfiles = profiles.filter(profile =>
                Number(profile.template_id) === templateId ||
                (legacyProfileName !== '' && String(profile.name || '').trim() === legacyProfileName)
            );
            return [String(template.id), linkedProfiles];
        }));

        const PB = window.SamUI?.PageBuilder;
        const actions = [
            (this.can('templates') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '🎨 + تصميم قالب كروت جديد', variant: 'primary', onclick: 'App.openVisualDesigner()' } : null,
            { label: '📶 إعداد صفحة الهوتسبوت', variant: 'warning', onclick: "App.switchTab('hotspot_designer')" },
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderTemplates()' }
        ].filter(Boolean);

        const cardsHtml = `
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap:15px;">
                ${templates.map(t => {
                    const dim = App.calcA4Dimensions(t.grid_cols || 3, t.grid_rows || 10, t.page_margin_mm, t.card_gap_mm);
                    const linkedProfiles = this.templatePackageLinksById.get(String(t.id)) || [];
                    const linkedProfileNames = linkedProfiles.map(profile => this.escape(profile.name || '')).filter(Boolean);
                    const packageLabel = linkedProfileNames.length
                        ? linkedProfileNames.join('، ')
                        : (t.profile_name ? this.escape(t.profile_name) : 'كل الباقات (عام)');
                    const packageCount = linkedProfiles.length;
                    return `
                    <div style="background:var(--bg-window); border:1px solid var(--border-color); border-radius:6px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                        <div style="background:${t.header_bg || '#0078d7'}; color:${t.header_color || '#fff'}; padding:10px 14px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
                            <span>${t.name}</span>
                            <span style="font-size:11px; background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:3px;">
                                ${dim.cols} أعمدة × ${dim.rows} صفوف (${dim.totalCards} كرت/A4)
                            </span>
                        </div>
                        <div style="padding:15px; flex:1; font-size:12px; line-height:1.8;">
                            <div><b>الخلفية:</b> ${t.bg_image ? '<span style="color:#27ae60;">🖼️ صورة مخصصة</span>' : 'لون أساسي'}</div>
                            <div><b>أبعاد الكرت:</b> <code>${dim.widthMM}mm × ${dim.heightMM}mm</code></div>
                            <div><b>الهوامش:</b> هامش الصفحة: <code>${dim.pageMargin}mm</code> | الفاصل: <code>${dim.cardGap}mm</code></div>
                            <div><b>الباقات المرتبطة:</b> <span class="status-pill ${packageCount ? 'status-warning' : 'status-online'}">${packageLabel}</span>${packageCount ? ` <small style="color:#b45309;">(الحذف مقيد — ${packageCount} باقة)</small>` : ''}</div>
                            <div><b>اسم الشبكة:</b> ${t.network_name}</div>
                        </div>
                        <div style="background:var(--toolbar-bg); padding:8px 12px; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:5px; flex-wrap:wrap;">
                            <button class="mt-btn" title="معاينة طباعة القالب" onclick='App.previewTemplate(${JSON.stringify(t)})'>👁️ معاينة</button>
                            <button class="mt-btn mt-btn-warning" title="عمل نسخة مطابقة من هذا القالب" onclick="App.duplicateTemplate(${t.id})">📋 عمل نسخة</button>
                            <button class="mt-btn mt-btn-primary" title="تعديل التصميم وتحريك العناصر" onclick='App.openVisualDesigner(${JSON.stringify(t)})'>🎨 تعديل</button>
                            <button class="mt-btn mt-btn-danger" title="حذف القالب نهائياً" onclick="App.deleteTemplate(${t.id})">🗑️ حذف</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        if (PB && typeof PB.renderShell === 'function') {
            document.getElementById('main-view').innerHTML = PB.renderShell({
                id: 'templates',
                archetype: 'designer',
                eyebrow: 'PRINT & TEMPLATES / CANVAS',
                title: 'مصمم قوالب كروت الشبكة',
                subtitle: 'تصميم قوالب كروت الإنترنت، طباعة صفحات A4، وتخصيص الباركود والأسعار',
                icon: '🎨',
                actions: actions,
                content: `<div class="mt-table-container" style="padding:15px;">${cardsHtml}</div>`
            });
        } else {
            document.getElementById('main-view').innerHTML = `
            <div class="mt-toolbar">
                <div class="mt-toolbar-left">
                    ${this.can('templates') || this.userRole === 'system_owner' || this.userRole === 'superadmin' ? `<button class="mt-btn mt-btn-primary" onclick="App.openVisualDesigner()">🎨 + تصميم قالب كروت جديد</button>` : ''}
                    <button class="mt-btn" onclick="App.renderTemplates()">⟳ ${this.t('refresh')}</button>
                </div>
            </div>
            <div class="mt-table-container" style="padding:15px;">
                ${cardsHtml}
            </div>
            `;
        }
    },

    async deleteTemplate(id) {
        const linkedProfiles = this.templatePackageLinksById?.get(String(id)) || [];
        if (linkedProfiles.length > 0) {
            this.toast(`تعذر حذف القالب: ما زال مرتبطاً بـ ${linkedProfiles.length} باقة. غيّر قالب هذه الباقات أولاً ثم أعد المحاولة.`, 'danger');
            return;
        }
        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا القالب نهائياً؟')) return;
        this.toast('جاري حذف القالب...', 'info');
        const res = await this.api('delete_template', { id }, 'POST', { id: id });
        if (res && res.success) {
            this.toast('تم حذف القالب بنجاح!', 'success');
            await this.renderTemplates();
        } else {
            this.toast(res?.error || 'فشل حذف القالب', 'danger');
        }
    },

    async duplicateTemplate(id) {
        this.toast('جاري إنشاء نسخة من القالب...', 'info');
        const res = await this.api('duplicate_template', { id }, 'POST', { id: id });
        if (res && res.success) {
            this.toast('تم إنشاء نسخة من القالب بنجاح!', 'success');
            await this.renderTemplates();
        } else {
            this.toast(res?.error || 'فشل نسخ القالب', 'danger');
        }
    },

    getDefaultElements() {
        return {
            title: { id: 'title', label: 'اسم الشبكة', text: 'شبكة واي فاي', enabled: true, x: 50, y: 12, size: 14, weight: 'bold', color: '#0078d7', align: 'center', prefix: '' },
            username: { id: 'username', label: 'اسم المستخدم', text: '884920', enabled: true, x: 28, y: 42, size: 16, weight: 'bold', color: '#111111', align: 'center', prefix: 'اليوزر: ' },
            password: { id: 'password', label: 'كلمة المرور', text: '884920', enabled: true, x: 28, y: 65, size: 14, weight: 'bold', color: '#e74c3c', align: 'center', prefix: 'الرمز: ' },
            qr_code: { id: 'qr_code', label: 'رمز QR', text: 'QR', enabled: true, x: 80, y: 52, size: 55, weight: 'normal', color: '#000000', align: 'center', prefix: '' },
            price: { id: 'price', label: 'السعر', text: '500 ${App.getCurrencySymbol(App._baseCurrency)}', enabled: true, x: 28, y: 86, size: 12, weight: 'bold', color: '#27ae60', align: 'center', prefix: 'السعر: ' },
            profile: { id: 'profile', label: 'اسم الباقة', text: 'VIP 5M', enabled: true, x: 78, y: 86, size: 11, weight: 'bold', color: '#555555', align: 'center', prefix: '' },
            icon: { id: 'icon', label: 'صورة الأيقونة PNG', image_url: '', enabled: false, x: 88, y: 15, size: 40, weight: 'normal', color: '#0078d7', align: 'center', prefix: '' },
            sheet_no: { id: 'sheet_no', label: 'رقم الورقة بالكرت', text: '000001', enabled: false, x: 80, y: 15, size: 9, weight: 'bold', color: '#64748b', align: 'center', prefix: 'ورقة: ' }
        };
    },

    async openVisualDesigner(tmplData = null) {
        const profiles = await this.api('get_profiles') || [];

        const defaultElems = this.getDefaultElements();
        let elements = { ...defaultElems };
        if (tmplData && tmplData.elements_json) {
            try {
                const parsed = typeof tmplData.elements_json === 'string' ? JSON.parse(tmplData.elements_json) : tmplData.elements_json;
                elements = { ...defaultElems, ...parsed };
                if (!elements.sheet_no) {
                    elements.sheet_no = defaultElems.sheet_no;
                }
            } catch (e) {}
        }

        const initialCols = tmplData ? (tmplData.grid_cols || 4) : 4;
        const initialRows = tmplData ? (tmplData.grid_rows || 15) : 15;
        const initialPageMargin = tmplData && tmplData.page_margin_mm !== undefined ? parseFloat(tmplData.page_margin_mm) : 2.0;
        const initialCardGap = tmplData && tmplData.card_gap_mm !== undefined ? parseFloat(tmplData.card_gap_mm) : 0.5;

        this.designer.template = tmplData || {
            id: null,
            name: 'قالب كروت مخصص',
            profile_name: '',
            grid_cols: initialCols,
            grid_rows: initialRows,
            page_margin_mm: initialPageMargin,
            card_gap_mm: initialCardGap,
            bg_image: null,
            network_name: 'شبكة واي فاي',
            hotspot_url: 'http://192.168.88.1/login'
        };
        this.designer.template.grid_cols = initialCols;
        this.designer.template.grid_rows = initialRows;
        this.designer.template.page_margin_mm = initialPageMargin;
        this.designer.template.card_gap_mm = initialCardGap;
        this.designer.template.elements = elements;
        this.designer.selectedElement = 'username';

        const t = this.designer.template;
        const dim = this.calcA4Dimensions(t.grid_cols, t.grid_rows, t.page_margin_mm, t.card_gap_mm);

        document.getElementById('modal-container').innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:1100px; max-height:96vh;">
                <div class="mt-modal-header">
                    <span>🎨 مصمم قوالب الكروت التفاعلي (الأعمدة 2-5 والصفوف 10-25 مع ضبط الهوامش)</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>

                <div class="mt-toolbar" style="padding:8px 12px; background:#eef2f5;">
                    <div class="mt-toolbar-left" style="gap:8px; flex-wrap:wrap;">
                        <div>
                            <label style="font-size:11px; font-weight:700;">اسم القالب:</label>
                            <input type="text" id="vd-name" class="mt-input" style="width:140px;" value="${t.name}" />
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700;">الباقة:</label>
                            <select id="vd-profile" class="mt-select" style="width:120px;">
                                <option value="">-- كل الباقات المدفوعة --</option>
                                ${profiles.filter(p => (p.package_type !== 'free') && (parseFloat(p.retail_price || p.price || 0) > 0) && (!p.name || !p.name.startsWith('Free-'))).map(p => `<option value="${p.name}" ${t.profile_name === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:4px; background:#fff; padding:3px 6px; border-radius:4px; border:1px solid var(--border-color);">
                            <div>
                                <label style="font-size:10px; font-weight:700;">الأعمدة (2-5):</label>
                                <input type="number" id="vd-cols" min="2" max="5" class="mt-input" style="width:48px; text-align:center; font-weight:bold;" value="${t.grid_cols}" oninput="App.onCustomGridChange()" />
                            </div>
                            <span style="font-weight:bold; color:#888;">×</span>
                            <div>
                                <label style="font-size:10px; font-weight:700;">الصفوف (10-25):</label>
                                <input type="number" id="vd-rows" min="10" max="25" class="mt-input" style="width:52px; text-align:center; font-weight:bold;" value="${t.grid_rows}" oninput="App.onCustomGridChange()" />
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:6px; background:#fff; padding:3px 6px; border-radius:4px; border:1px solid var(--border-color);">
                            <div>
                                <label style="font-size:10px; font-weight:700;">هامش الصفحة (mm):</label>
                                <input type="number" id="vd-page-margin" min="0" max="25" step="0.5" class="mt-input" style="width:55px; text-align:center;" value="${t.page_margin_mm}" oninput="App.onCustomGridChange()" />
                            </div>
                            <div>
                                <label style="font-size:10px; font-weight:700;">الفاصل بين الكروت (mm):</label>
                                <input type="number" id="vd-card-gap" min="0" max="15" step="0.5" class="mt-input" style="width:55px; text-align:center;" value="${t.card_gap_mm}" oninput="App.onCustomGridChange()" />
                            </div>
                        </div>

                        <div id="vd-dim-badge" style="background:#0078d7; color:#fff; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;">
                            📊 ${dim.totalCards} كرت/A4 | الأبعاد: ${dim.widthMM}mm × ${dim.heightMM}mm
                        </div>
                    </div>
                    <div class="mt-toolbar-right">
                        <label class="mt-btn" style="cursor:pointer; background:#27ae60; color:#fff; border-color:#219653;">
                            🖼️ رفع صورة خلفية للكرت
                            <input type="file" id="vd-file" accept="image/*" style="display:none;" onchange="App.handleBgUpload(this)" />
                        </label>
                    </div>
                </div>

                <div class="mt-modal-body" style="padding:15px; background:var(--bg-main);">
                    <div class="designer-layout">
                        <div class="designer-canvas-area">
                            <div id="designer-canvas" class="designer-card-canvas" 
                                 style="background-image: ${t.bg_image ? `url('${t.bg_image}')` : 'none'}; background-color: ${t.bg_image ? 'transparent' : '#ffffff'};"
                                 onmousemove="App.onCanvasMouseMove(event)" 
                                 onmouseup="App.onCanvasMouseUp(event)"
                                 onmouseleave="App.onCanvasMouseUp(event)">
                            </div>
                        </div>
                        <div class="designer-props-panel" id="designer-props"></div>
                    </div>
                </div>

                <div class="mt-modal-footer">
                    <button type="button" class="mt-btn" onclick="App.closeModal()">${this.t('cancel')}</button>
                    <button type="button" class="mt-btn mt-btn-primary" onclick="App.saveVisualTemplate()">${this.t('save')} القالب والتصميم</button>
                </div>
            </div>
        </div>
        `;

        this.onCustomGridChange(false);
        this.renderDesignerCanvas();
        this.renderPropsPanel();
    },

    onCustomGridChange(reRenderCanvas = true) {
        const cols = parseInt(document.getElementById('vd-cols')?.value) || 3;
        const rows = parseInt(document.getElementById('vd-rows')?.value) || 10;
        const pMargin = parseFloat(document.getElementById('vd-page-margin')?.value) ?? 5.0;
        const cGap = parseFloat(document.getElementById('vd-card-gap')?.value) ?? 1.5;

        const dim = this.calcA4Dimensions(cols, rows, pMargin, cGap);

        this.designer.template.grid_cols = dim.cols;
        this.designer.template.grid_rows = dim.rows;
        this.designer.template.page_margin_mm = dim.pageMargin;
        this.designer.template.card_gap_mm = dim.cardGap;
        this.designer.template.cards_per_page = dim.totalCards;
        this.designer.template.card_width_mm = dim.widthMM;
        this.designer.template.card_height_mm = dim.heightMM;

        const badge = document.getElementById('vd-dim-badge');
        if (badge) {
            badge.innerHTML = `📊 ${dim.totalCards} كرت/A4 | الأبعاد: ${dim.widthMM}mm × ${dim.heightMM}mm (الهامش: ${dim.pageMargin}mm | الفاصل: ${dim.cardGap}mm)`;
        }

        const canvas = document.getElementById('designer-canvas');
        if (canvas) {
            const targetWidth = 480;
            const ratio = dim.heightMM / dim.widthMM;
            const targetHeight = Math.round(targetWidth * ratio);
            canvas.style.width = `${targetWidth}px`;
            canvas.style.height = `${targetHeight}px`;
            canvas.style.backgroundSize = '100% 100%';
            canvas.style.backgroundRepeat = 'no-repeat';
        }

        if (reRenderCanvas) {
            this.renderDesignerCanvas();
        }
    },

    renderDesignerCanvas() {
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;

        const elements = this.designer.template.elements;
        canvas.innerHTML = Object.values(elements).map(el => {
            if (!el.enabled) return '';
            const isSelected = this.designer.selectedElement === el.id;

            if (el.id === 'qr_code') {
                return `
                <div id="el-${el.id}" class="designer-element ${isSelected ? 'active' : ''}" 
                     style="left:${el.x}%; top:${el.y}%; transform:translate(-50%, -50%) rotate(${Number(el.rotation || 0)}deg); padding:2px;"
                     onmousedown="App.onElementMouseDown(event, '${el.id}')"
                     onclick="App.selectDesignerElement('${el.id}')">
                    ${QRCodeGen.generateSVG('http://192.168.88.1/login', el.size || 50)}
                </div>
                `;
            }

            if (el.id === 'icon') {
                const iconContent = el.image_url
                    ? `<img src="${el.image_url}" alt="" draggable="false" style="display:block;width:${el.size}px;height:${el.size}px;object-fit:contain;pointer-events:none;" />`
                    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:40px;border:1px dashed #94a3b8;border-radius:5px;font-size:10px;background:#fff;color:#64748b;">ارفع PNG</span>`;
                return `
                <div id="el-${el.id}" class="designer-element ${isSelected ? 'active' : ''}"
                     style="left:${el.x}%; top:${el.y}%; transform:translate(-50%, -50%) rotate(${Number(el.rotation || 0)}deg); padding:2px;"
                     onmousedown="App.onElementMouseDown(event, '${el.id}')"
                     onclick="App.selectDesignerElement('${el.id}')">
                    ${iconContent}
                </div>`;
            }

            return `
            <div id="el-${el.id}" class="designer-element ${isSelected ? 'active' : ''}" 
                 style="left:${el.x}%; top:${el.y}%; transform:translate(-50%, -50%) rotate(${Number(el.rotation || 0)}deg); font-size:${el.size}px; font-weight:${el.weight}; color:${el.color}; font-family:monospace;"
                 onmousedown="App.onElementMouseDown(event, '${el.id}')"
                 onclick="App.selectDesignerElement('${el.id}')">
                <span>${el.prefix || ''}${el.text}</span>
            </div>
            `;
        }).join('');
    },

    renderPropsPanel() {
        const panel = document.getElementById('designer-props');
        if (!panel) return;

        const elId = this.designer.selectedElement;
        const elements = this.designer.template.elements;
        const el = elements[elId] || elements['username'];

        if (!el) {
            panel.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:20px;">حدد عنصراً من الكرت لتعديل خصائصه وموضعه</div>`;
            return;
        }

        const pillsHTML = Object.values(elements).map(item => `
            <button type="button" class="mt-btn ${item.id === el.id ? 'mt-btn-primary' : ''}" 
                    style="padding:3px 7px; font-size:10px; font-weight:bold; border-radius:4px; ${item.enabled ? '' : 'opacity:0.6;'}"
                    onclick="App.selectDesignerElement('${item.id}')">
                ${item.label} ${item.enabled ? '✓' : ''}
            </button>
        `).join('');

        panel.innerHTML = `
        <div style="margin-bottom:10px;">
            <div style="font-size:11px; font-weight:bold; color:var(--text-muted); margin-bottom:4px;">اختر العنصر للتعديل والتحريك:</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${pillsHTML}
            </div>
        </div>

        <div style="font-weight:700; margin-bottom:10px; padding-bottom:4px; border-bottom:1px solid var(--border-color); color:var(--accent-blue); font-size:13px;">
            ⚙️ خصائص: ${el.label}
        </div>

        <div class="form-group">
            <label><input type="checkbox" id="prop-enabled" ${el.enabled ? 'checked' : ''} onchange="App.updateElementProp('enabled', this.checked)" /> إظهار هذا العنصر في الكرت</label>
        </div>

        ${el.id !== 'qr_code' ? `
            ${el.id === 'icon' ? `
            <div class="form-group">
                <label>رفع صورة الأيقونة (PNG):</label>
                <input type="file" class="mt-input" accept="image/png,.png" onchange="App.handleTemplateIconUpload(this)" />
                ${el.image_url ? `
                    <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:#fff;">
                        <img src="${el.image_url}" alt="الأيقونة" style="width:48px;height:48px;object-fit:contain;" />
                        <button type="button" class="mt-btn mt-btn-danger" onclick="App.removeTemplateIcon()">إزالة الصورة</button>
                    </div>
                ` : '<small style="color:var(--text-muted)">PNG فقط، بحد أقصى 2MB وأبعاد 2048×2048. تحفظ الصورة داخل النظام مع القالب.</small>'}
            </div>
            ` : `
            <div class="form-group">
                <label>النص التعريفي (البادئة / Prefix):</label>
                <input type="text" id="prop-prefix" class="mt-input" style="width:100%" value="${el.prefix || ''}" oninput="App.updateElementProp('prefix', this.value)" />
            </div>
            `}

            <div class="form-group">
                <label>${el.id === 'icon' ? 'حجم الصورة' : 'حجم الخط'} (<span id="lbl-size">${el.size}px</span>):</label>
                <input type="range" min="8" max="${el.id === 'icon' ? 100 : 36}" value="${el.size}" style="width:100%" oninput="document.getElementById('lbl-size').innerText=this.value+'px'; App.updateElementProp('size', parseInt(this.value))" />
            </div>

            ${el.id !== 'icon' ? `
            <div class="form-group">
                <label>لون الخط (Text Color):</label>
                <input type="color" value="${el.color}" style="width:100%; height:32px; padding:2px; border:1px solid var(--border-color); border-radius:3px;" oninput="App.updateElementProp('color', this.value)" />
            </div>
            <div class="form-group">
                <label>سماكة الخط (Font Weight):</label>
                <select class="mt-select" style="width:100%" onchange="App.updateElementProp('weight', this.value)">
                    <option value="bold" ${el.weight === 'bold' ? 'selected' : ''}>عريض (Bold)</option>
                    <option value="normal" ${el.weight === 'normal' ? 'selected' : ''}>عادي (Normal)</option>
                </select>
            </div>
            ` : ''}
        ` : `
            <div class="form-group">
                <label>حجم رمز الـ QR (<span id="lbl-qr-size">${el.size}px</span>):</label>
                <input type="range" min="20" max="100" value="${el.size}" style="width:100%" oninput="document.getElementById('lbl-qr-size').innerText=this.value+'px'; App.updateElementProp('size', parseInt(this.value))" />
            </div>
        `}

        <div class="form-group" style="margin-top:10px;">
            <label>زاوية الدوران: <b id="lbl-rotation">${Number(el.rotation || 0)}°</b></label>
            <div style="display:grid;grid-template-columns:1fr 86px;gap:8px;align-items:center;">
                <input type="range" min="-180" max="180" step="1" value="${Number(el.rotation || 0)}" oninput="document.getElementById('lbl-rotation').innerText=this.value+'°';document.getElementById('prop-rotation-number').value=this.value;App.updateElementProp('rotation',Number(this.value))" />
                <input id="prop-rotation-number" type="number" min="-360" max="360" step="1" class="mt-input" value="${Number(el.rotation || 0)}" oninput="document.getElementById('lbl-rotation').innerText=this.value+'°';App.updateElementProp('rotation',Number(this.value)||0)" />
            </div>
            <div style="display:flex;gap:5px;margin-top:6px;"><button type="button" class="mt-btn" onclick="App.updateElementRotation(0)">0°</button><button type="button" class="mt-btn" onclick="App.updateElementRotation(90)">90°</button><button type="button" class="mt-btn" onclick="App.updateElementRotation(-90)">-90°</button><button type="button" class="mt-btn" onclick="App.updateElementRotation(180)">180°</button></div>
        </div>

        <div style="font-weight:600; margin-top:10px; margin-bottom:6px; font-size:11px; color:var(--text-muted);">الموضع بدقة (Position %):</div>
        <div class="form-row">
            <div class="form-group">
                <label>أفقي X (%)</label>
                <input type="number" min="0" max="100" class="mt-input" style="width:100%" value="${Math.round(el.x)}" oninput="App.updateElementProp('x', parseFloat(this.value))" />
            </div>
            <div class="form-group">
                <label>رأسي Y (%)</label>
                <input type="number" min="0" max="100" class="mt-input" style="width:100%" value="${Math.round(el.y)}" oninput="App.updateElementProp('y', parseFloat(this.value))" />
            </div>
        </div>
        `;
    },

    updateElementRotation(angle) {
        const el = this.designer?.template?.elements?.[this.designer.selectedElement];
        if (!el) return;
        el.rotation = Number(angle) || 0;
        this.renderDesignerCanvas();
        this.renderPropsPanel();
    },

    selectDesignerElement(id) {
        this.designer.selectedElement = id;
        this.renderDesignerCanvas();
        this.renderPropsPanel();
    },

    updateElementProp(prop, val) {
        const elId = this.designer.selectedElement;
        if (this.designer.template.elements[elId]) {
            this.designer.template.elements[elId][prop] = val;
            this.renderDesignerCanvas();
        }
    },

    async handleBgUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const formData = new FormData();
        formData.append('image', file);

        this.toast('جاري رفع صورة الخلفية...', 'info');
        const res = await this.api('upload_bg', {}, 'POST', formData);
        if (res && res.success) {
            this.toast('تم رفع الصورة بنجاح!', 'success');
            this.designer.template.bg_image = res.url;
            const canvas = document.getElementById('designer-canvas');
            if (canvas) {
                canvas.style.backgroundImage = `url('${res.url}')`;
            }
        } else {
            this.toast(res?.error || 'فشل رفع الصورة', 'danger');
        }
    },

    async handleTemplateIconUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) {
            this.toast('اختر صورة بصيغة PNG فقط', 'danger');
            input.value = '';
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        this.toast('جاري رفع أيقونة PNG إلى النظام...', 'info');
        const res = await this.api('upload_template_icon', {}, 'POST', formData);
        if (res && res.success) {
            const icon = this.designer.template.elements.icon;
            icon.image_url = res.url;
            icon.enabled = true;
            delete icon.text;
            this.renderDesignerCanvas();
            this.renderPropsPanel();
            this.toast('تم رفع الأيقونة وربطها بالقالب', 'success');
        } else {
            this.toast(res?.error || 'فشل رفع الأيقونة', 'danger');
        }
    },

    removeTemplateIcon() {
        const icon = this.designer.template.elements.icon;
        icon.image_url = '';
        icon.enabled = false;
        this.renderDesignerCanvas();
        this.renderPropsPanel();
    },

    onElementMouseDown(e, id) {
        e.preventDefault();
        e.stopPropagation();
        this.selectDesignerElement(id);
        this.designer.isDragging = true;
        this.designer.dragTarget = id;
        this.designer.startX = e.clientX;
        this.designer.startY = e.clientY;
    },

    onCanvasMouseMove(e) {
        if (!this.designer.isDragging || !this.designer.dragTarget) return;
        e.preventDefault();

        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let posXPercent = Math.max(0, Math.min(100, (mouseX / rect.width) * 100));
        let posYPercent = Math.max(0, Math.min(100, (mouseY / rect.height) * 100));

        const el = this.designer.template.elements[this.designer.dragTarget];
        if (el) {
            el.x = Math.round(posXPercent);
            el.y = Math.round(posYPercent);

            const domEl = document.getElementById(`el-${el.id}`);
            if (domEl) {
                domEl.style.left = `${el.x}%`;
                domEl.style.top = `${el.y}%`;
            }
        }
    },

    onCanvasMouseUp(e) {
        if (this.designer.isDragging) {
            this.designer.isDragging = false;
            this.designer.dragTarget = null;
            this.renderPropsPanel();
        }
    },

    async saveVisualTemplate() {
        const name = document.getElementById('vd-name').value;
        const profile = document.getElementById('vd-profile').value;
        const cols = parseInt(document.getElementById('vd-cols').value) || 3;
        const rows = parseInt(document.getElementById('vd-rows').value) || 10;
        const pMargin = parseFloat(document.getElementById('vd-page-margin').value) ?? 5.0;
        const cGap = parseFloat(document.getElementById('vd-card-gap').value) ?? 1.5;
        const dim = this.calcA4Dimensions(cols, rows, pMargin, cGap);

        const payload = {
            id: this.designer.template.id,
            name: name,
            profile_name: profile,
            grid_cols: dim.cols,
            grid_rows: dim.rows,
            page_margin_mm: dim.pageMargin,
            card_gap_mm: dim.cardGap,
            card_width_mm: dim.widthMM,
            card_height_mm: dim.heightMM,
            bg_image: this.designer.template.bg_image,
            elements_json: this.designer.template.elements
        };

        this.toast('جاري حفظ التصميم والقالب...', 'info');
        const res = await this.api('save_template', {}, 'POST', payload);
        if (res && res.success) {
            this.toast(this.t('success_saved'), 'success');
            this.closeModal();
            this.renderTemplates();
        }
    },

    previewTemplate(t) {
        const dummyVouchers = [];
        const count = (t.grid_cols || 3) * (t.grid_rows || 10);
        for (let i = 1; i <= Math.min(count, 50); i++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            dummyVouchers.push({ username: code, password: code, profile: t.profile_name || 'VIP-10M', price: '1000' });
        }
        this.printVouchersList(dummyVouchers, t);
    },

    // ==========================================
    // PRINT & PDF PREVIEW + ISOLATED IFRAME ENGINE
    // ==========================================
    async printSelectedUsers() {
        if (this.selectedItems.size === 0) return this.toast('الرجاء تحديد كروت للطباعة', 'warning');
        const list = Array.from(this.selectedItems).map(u => ({ username: u, password: u, profile: '', price: '' }));
        const templates = await this.api('get_templates') || [];
        this.printVouchersList(list, templates[0] || null);
    },

                currentPrintMeta: null,
    lastGeneratedBatch: null,

    getPrintFilename() {
        const meta = this.currentPrintMeta || {};
        const b = (meta.batchId || 'طبعة_كروت').toString().trim().replace(/[/\?%*:|"<>]/g, '_');
        const p = (meta.profileName || 'باقة').toString().trim().replace(/[/\?%*:|"<>]/g, '_');
        const c = (meta.count || 0) + ' كرت';
        const d = (meta.date || new Date().toISOString().slice(0, 10)).toString().trim();
        const u = (meta.printedBy || this.userFullname || this.user || 'المسؤول').toString().trim().replace(/[/\?%*:|"<>]/g, '_');
        return `${b} - ${p} - ${c} - ${d} - ${u}.pdf`;
    },

    async printSelectedUsers() {
        if (this.selectedItems.size === 0) return this.toast('الرجاء تحديد كروت للطباعة', 'warning');
        const usernames = Array.from(this.selectedItems);
        this.toast('جاري فحص الكروت وتجهيز الطباعة...', 'info');

        const res = await this.api('get_users_for_print', { usernames }, 'POST');
        if (res && res.success && res.data) {
            const cards = res.data.cards || [];
            const blocked = res.data.blocked_used_count || 0;
            const template = res.data.template;

            if (blocked > 0) {
                this.toast(`⚠️ تم استبعاد ${blocked} كرت/ورقة نظراً لأنها مستخدمة أو تحتوي على كروت مستخدمة مسبقاً`, 'warning');
            }

            if (cards.length === 0) {
                return this.toast('❌ لا توجد كروت صالحة للطباعة! جميع الكروت المحددة مستخدمة أو تتبع أوراقاً تم استخدام كروت منها', 'danger');
            }

            const meta = {
                batchId: cards[0]?.batch_id || 'Selected_Users',
                profileName: cards[0]?.profile_name || this.usersFilterProf || 'محدد',
                count: cards.length,
                date: new Date().toISOString().slice(0, 10),
                printedBy: this.userFullname || this.user || 'المسؤول'
            };
            await this.printVouchersList(cards, template, meta);
        } else {
            this.toast(res?.error || 'تعذر تجهيز الكروت المحددة للطباعة', 'danger');
        }
    },

    async printBatchById(batchId) {
        if (!batchId) return this.toast('الرجاء اختيار دفعة للطباعة', 'warning');
        this.toast('جاري تجهيز بيانات الدفعة للطباعة...', 'info');
        const res = await this.api('get_batch_for_print', { batch_id: batchId });
        if (res && res.success && res.data && res.data.cards && res.data.cards.length > 0) {
            const cards = res.data.cards;
            const template = res.data.template;
            const meta = {
                batchId: batchId,
                profileName: cards[0]?.profile_name || 'باقة',
                count: cards.length,
                date: cards[0]?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                printedBy: this.userFullname || this.user || 'المسؤول'
            };
            await this.printVouchersList(cards, template, meta);
        } else {
            this.toast('❌ لا توجد كروت جديدة قابلة للطباعة في هذه الدفعة (تم استبعاد كافة الأوراق التي تم استخدام كروت منها)', 'danger');
        }
    },

    async printLastGeneratedBatch() {
        if (!this.lastGeneratedBatch || !this.lastGeneratedBatch.vouchers) {
            return this.toast('لا توجد بيانات دفعة حالية للطباعة', 'warning');
        }
        const res = this.lastGeneratedBatch;
        const meta = {
            batchId: res.batch_id,
            profileName: res.profile || (res.vouchers[0]?.profile || 'باقة'),
            count: res.count || res.vouchers.length,
            date: new Date().toISOString().slice(0, 10),
            printedBy: this.userFullname || this.user || 'المسؤول'
        };
        await this.printVouchersList(res.vouchers, res.template || null, meta);
    },

    async printVouchersList(vouchers, activeTemplate = null, meta = null) {
        if (!vouchers || vouchers.length === 0) return this.toast('لا توجد كروت للطباعة', 'warning');
        const templatesRaw = await this.api('get_templates');
        let templates = Array.isArray(templatesRaw) ? templatesRaw : (templatesRaw?.data || []);

        const defaultTemplate = {
            id: 1,
            name: 'القالب القياسي (60 كرت)',
            grid_cols: 4,
            grid_rows: 15,
            page_margin_mm: 2.0,
            card_gap_mm: 0.5,
            network_name: 'شبكتي اللاسلكية',
            hotspot_url: 'http://192.168.88.1/login',
            elements_json: JSON.stringify(this.getDefaultElements())
        };

        if (templates.length === 0) templates = [defaultTemplate];
        let t = activeTemplate || templates[0] || defaultTemplate;

        this.currentPrintMeta = meta || {
            batchId: vouchers[0]?.batch_id || 'طبعة_كروت',
            profileName: vouchers[0]?.profile || vouchers[0]?.profile_name || (t?.name || 'عامة'),
            count: vouchers.length,
            date: new Date().toISOString().slice(0, 10),
            printedBy: this.userFullname || this.user || 'المسؤول'
        };

        const initialMargin = t && t.page_margin_mm !== undefined ? parseFloat(t.page_margin_mm) : 5.0;
        const initialGap = t && t.card_gap_mm !== undefined ? parseFloat(t.card_gap_mm) : 1.5;

        // Ensure vouchers have password & profile fields
        const safeVouchers = vouchers.map(v => ({
            username: v.username || '',
            password: v.password !== undefined ? v.password : (v.username || ''),
            profile: v.profile || v.profile_name || '',
            price: v.price || '',
            sheet_no: v.sheet_no || null,
            sheet_no_formatted: v.sheet_no_formatted || (v.sheet_no ? String(v.sheet_no).padStart(6, '0') : null),
            batch_id: v.batch_id || ''
        }));

        this.currentPrintVouchers = safeVouchers;

        let modal = document.getElementById('modal-container');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-container';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="width:1150px; max-height:96vh;">
                <div class="mt-modal-header">
                    <span>🖨️ معاينة وتصدير الكروت (${safeVouchers.length} كرت)</span>
                    <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
                </div>
                <div class="mt-toolbar" style="padding:8px 12px; background:#eef2f5;">
                    <div class="mt-toolbar-left" style="gap:8px; flex-wrap:wrap;">
                        <label style="font-weight:700; font-size:12px;">اختر القالب:</label>
                        <select id="print-template-select" class="mt-select" style="min-width:180px;" onchange="App.applyPrintTemplate(this.value)">
                            ${templates.map(tmpl => {
                                const d = App.calcA4Dimensions(tmpl.grid_cols || 3, tmpl.grid_rows || 10, tmpl.page_margin_mm, tmpl.card_gap_mm);
                                return `<option value="${tmpl.id}" ${t && t.id === tmpl.id ? 'selected' : ''}>${tmpl.name} (${d.cols}×${d.rows} - ${d.totalCards} كرت/A4)</option>`;
                            }).join('')}
                        </select>

                        <!-- Live Margin Fine-Tuning in Print Preview -->
                        <div style="display:flex; align-items:center; gap:6px; background:#fff; padding:3px 8px; border-radius:4px; border:1px solid var(--border-color);">
                            <div>
                                <label style="font-size:10px; font-weight:700;">الهامش (mm):</label>
                                <input type="number" id="preview-margin" min="0" max="25" step="0.5" class="mt-input" style="width:48px; text-align:center;" value="${initialMargin}" oninput="App.onPreviewMarginsChange()" />
                            </div>
                            <div>
                                <label style="font-size:10px; font-weight:700;">الفاصل (mm):</label>
                                <input type="number" id="preview-gap" min="0" max="15" step="0.5" class="mt-input" style="width:48px; text-align:center;" value="${initialGap}" oninput="App.onPreviewMarginsChange()" />
                            </div>
                        </div>

                        <!-- Sheet Number & Batch Position & Size Selector -->
                        <div style="display:flex; align-items:center; gap:4px; background:#fff; padding:3px 6px; border-radius:4px; border:1px solid var(--border-color);">
                            <label style="font-size:10px; font-weight:700;">موضع رقم الورقة:</label>
                            <select id="preview-sheet-pos" class="mt-select" style="font-size:11px; padding:2px 4px; font-weight:600;" onchange="App.onPreviewSheetPosChange(this.value)">
                                <option value="top_bar">🔝 ترويسة كاملة أعلى الصفحة [افتراضي]</option>
                                <option value="top_right">↗️ أعلى الورقة - يمين</option>
                                <option value="top_center">⬆️ أعلى الورقة - وسط</option>
                                <option value="top_left">↖️ أعلى الورقة - يسار</option>
                                <option value="bottom_bar">🔻 تذييل كامل أسفل الصفحة</option>
                                <option value="bottom_right">↘️ أسفل الورقة - يمين</option>
                                <option value="bottom_center">⬇️ أسفل الورقة - وسط</option>
                                <option value="bottom_left">↙️ أسفل الورقة - يسار</option>
                                <option value="hide">🚫 إخفاء من رأس/تذييل الصفحة (للطباعة على ورق جاهز)</option>
                            </select>
                            <label style="font-size:10px; font-weight:700; margin-right:4px;">الخط (pt):</label>
                            <input type="number" id="preview-sheet-font" min="7" max="24" step="0.5" class="mt-input" style="width:44px; text-align:center; font-weight:bold;" value="9.5" oninput="App.onPreviewMarginsChange()" title="حجم خط رقم الورقة والترويسة" />
                        </div>
                    </div>
                    <div class="mt-toolbar-right" style="gap:8px;">
                        <button id="pdf-export-btn" class="mt-btn mt-btn-success" onclick="App.exportPDF()">
                            ${this.t('export_pdf')}
                        </button>
                        <button class="mt-btn mt-btn-primary" onclick="App.triggerPrint()">
                            ${this.t('print_a4')}
                        </button>
                    </div>
                </div>
                <div class="mt-modal-body" id="print-modal-scroll" style="background:#37474f; padding:20px; overflow-y:auto;">
                    <div id="print-container">
                        ${this.generatePrintPagesHTML(safeVouchers, t, initialMargin, initialGap)}
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    currentPrintVouchers: [],

    async applyPrintTemplate(templateId) {
        const templates = await this.api('get_templates') || [];
        const t = templates.find(item => item.id == templateId) || templates[0];
        const mInput = document.getElementById('preview-margin');
        const gInput = document.getElementById('preview-gap');
        if (mInput && t.page_margin_mm !== undefined) mInput.value = t.page_margin_mm;
        if (gInput && t.card_gap_mm !== undefined) gInput.value = t.card_gap_mm;

        this.onPreviewMarginsChange();
    },

    onPreviewSheetPosChange(pos) {
        localStorage.setItem('mt_print_sheet_pos', pos);
        this.onPreviewMarginsChange();
    },

    async onPreviewMarginsChange() {
        const templateId = document.getElementById('print-template-select')?.value;
        const templates = await this.api('get_templates') || [];
        const t = templates.find(item => item.id == templateId) || templates[0];
        const pMargin = parseFloat(document.getElementById('preview-margin')?.value) ?? 5.0;
        const cGap = parseFloat(document.getElementById('preview-gap')?.value) ?? 1.5;
        const sheetPos = document.getElementById('preview-sheet-pos')?.value || localStorage.getItem('mt_print_sheet_pos') || 'top_bar';
        const sheetFont = parseFloat(document.getElementById('preview-sheet-font')?.value) || 9.5;

        const container = document.getElementById('print-container');
        if (container && t && this.currentPrintVouchers) {
            container.innerHTML = this.generatePrintPagesHTML(this.currentPrintVouchers, t, pMargin, cGap, sheetPos, sheetFont);
        }
    },

        generatePrintPagesHTML(vouchers, t, customMargin = null, customGap = null, customSheetPos = null, customSheetFont = null) {
        if (!t) return '<div>No template</div>';

        const pMargin = customMargin !== null ? customMargin : (t.page_margin_mm !== undefined ? t.page_margin_mm : 5.0);
        const cGap = customGap !== null ? customGap : (t.card_gap_mm !== undefined ? t.card_gap_mm : 1.5);
        const sheetPos = customSheetPos || localStorage.getItem('mt_print_sheet_pos') || 'top_bar';
        const sheetFont = customSheetFont || parseFloat(document.getElementById('preview-sheet-font')?.value) || 9.5;

        const dim = this.calcA4Dimensions(t.grid_cols || 3, t.grid_rows || 10, pMargin, cGap);
        const perPage = dim.totalCards;
        const totalPages = Math.ceil(vouchers.length / perPage);

        let elements = this.getDefaultElements();
        if (t.elements_json) {
            try {
                const parsed = typeof t.elements_json === 'string' ? JSON.parse(t.elements_json) : t.elements_json;
                elements = { ...elements, ...parsed };
            } catch (e) {}
        }

        const scale = dim.scaleFactor;

        let html = '';
        for (let page = 0; page < totalPages; page++) {
            const pageVouchers = vouchers.slice(page * perPage, (page + 1) * perPage);

            const pageSheetFormatted = pageVouchers[0]?.sheet_no_formatted || (pageVouchers[0]?.sheet_no ? String(pageVouchers[0].sheet_no).padStart(6, '0') : (this.currentPrintMeta?.start_sheet_no ? String(Number(this.currentPrintMeta.start_sheet_no) + page).padStart(6, '0') : String(page + 1).padStart(6, '0')));

            const codeFont = Math.max(8, sheetFont + 1.5);
            const sheetTag = `<span>📄 ورقة رقم: <code style="font-size:${codeFont}px; font-weight:800; background:#f1f5f9; padding:1px 5px; border-radius:3px; color:#0f172a; border:1px solid #cbd5e1;">${pageSheetFormatted}</code></span>`;
            const batchTag = `<span>📦 الدفعة: ${this.escape(this.currentPrintMeta?.batchId || '')}</span>`;
            const profTag = `<span>🏷️ الباقة: ${this.escape(this.currentPrintMeta?.profileName || '')}</span>`;
            const dateTag = `<span>📅 ${this.currentPrintMeta?.date || new Date().toISOString().slice(0, 10)}</span>`;

            let headerHTML = '';
            let footerHTML = '';

            if (sheetPos === 'top_bar') {
                headerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; font-size:${sheetFont}px; font-weight:bold; color:#334155; border-bottom:1px solid #cbd5e1; padding-bottom:2px; margin-bottom:3.5mm;">${sheetTag}${batchTag}${profTag}${dateTag}</div>`;
            } else if (sheetPos === 'top_right') {
                headerHTML = `<div style="display:flex; justify-content:flex-start; align-items:center; gap:12px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-bottom:3mm;">${sheetTag}${batchTag}</div>`;
            } else if (sheetPos === 'top_center') {
                headerHTML = `<div style="display:flex; justify-content:center; align-items:center; gap:14px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-bottom:3mm;">${sheetTag}${batchTag}${profTag}</div>`;
            } else if (sheetPos === 'top_left') {
                headerHTML = `<div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-bottom:3mm;">${sheetTag}${batchTag}</div>`;
            } else if (sheetPos === 'bottom_bar') {
                footerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; font-size:${sheetFont}px; font-weight:bold; color:#334155; border-top:1px solid #cbd5e1; padding-top:2px; margin-top:3.5mm;">${sheetTag}${batchTag}${profTag}${dateTag}</div>`;
            } else if (sheetPos === 'bottom_right') {
                footerHTML = `<div style="display:flex; justify-content:flex-start; align-items:center; gap:12px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-top:3mm;">${sheetTag}${batchTag}</div>`;
            } else if (sheetPos === 'bottom_center') {
                footerHTML = `<div style="display:flex; justify-content:center; align-items:center; gap:14px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-top:3mm;">${sheetTag}${batchTag}${profTag}</div>`;
            } else if (sheetPos === 'bottom_left') {
                footerHTML = `<div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; font-size:${sheetFont}px; font-weight:bold; color:#334155; margin-top:3mm;">${sheetTag}${batchTag}</div>`;
            }

            html += `
            <div class="pdf-a4-page" style="padding: ${dim.pageMargin}mm; box-shadow: 0 4px 15px rgba(0,0,0,0.3); margin-bottom: 20px;">
                ${headerHTML}
                <div class="visual-cards-grid" style="display: grid !important; grid-template-columns: repeat(${dim.cols}, 1fr) !important; gap: ${dim.cardGap}mm !important; width: 100% !important; box-sizing: border-box !important;">
                    ${pageVouchers.map(v => {
                        const loginUrl = `${t.hotspot_url || 'http://192.168.88.1/login'}?username=${v.username}&password=${v.password}`;

                        return `
                        <div class="visual-card-rendered" style="position:relative; height:${dim.heightMM}mm; border:1px dashed ${t.border_color || '#0078d7'}; border-radius:3px; overflow:hidden; background:#ffffff; box-sizing:border-box;">
                            ${t.bg_image ? `<img src="${t.bg_image}" style="position:absolute; left:0; top:0; width:100%; height:100%; object-fit:fill; z-index:0; pointer-events:none;" />` : ''}
                            
                            ${elements.title?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.title.x}%; top:${elements.title.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.title.rotation || 0)}deg); font-size:${Math.round(elements.title.size * scale)}px; font-weight:${elements.title.weight}; color:${elements.title.color}; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.title.prefix || ''}${t.network_name || elements.title.text}
                                </div>
                            ` : ''}

                            ${elements.username?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.username.x}%; top:${elements.username.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.username.rotation || 0)}deg); font-size:${Math.round(elements.username.size * scale)}px; font-weight:${elements.username.weight}; color:${elements.username.color}; font-family:monospace; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.username.prefix || ''}${v.username}
                                </div>
                            ` : ''}

                            ${elements.password?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.password.x}%; top:${elements.password.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.password.rotation || 0)}deg); font-size:${Math.round(elements.password.size * scale)}px; font-weight:${elements.password.weight}; color:${elements.password.color}; font-family:monospace; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.password.prefix || ''}${v.password}
                                </div>
                            ` : ''}

                            ${elements.qr_code?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.qr_code.x}%; top:${elements.qr_code.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.qr_code.rotation || 0)}deg); z-index:2;">
                                    ${QRCodeGen.generateSVG(loginUrl, Math.round((elements.qr_code.size || 50) * scale))}
                                </div>
                            ` : ''}

                            ${elements.price?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.price.x}%; top:${elements.price.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.price.rotation || 0)}deg); font-size:${Math.round(elements.price.size * scale)}px; font-weight:${elements.price.weight}; color:${elements.price.color}; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.price.prefix || ''}${v.price ? v.price + ' ${App.getCurrencySymbol(App._baseCurrency)}' : elements.price.text}
                                </div>
                            ` : ''}

                            ${elements.profile?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.profile.x}%; top:${elements.profile.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.profile.rotation || 0)}deg); font-size:${Math.round(elements.profile.size * scale)}px; font-weight:${elements.profile.weight}; color:${elements.profile.color}; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.profile.prefix || ''}${v.profile || elements.profile.text}
                                </div>
                            ` : ''}

                            ${elements.icon?.enabled && elements.icon?.image_url ? `
                                <img class="rendered-item-pos" src="${elements.icon.image_url}" alt="" style="position:absolute; left:${elements.icon.x}%; top:${elements.icon.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.icon.rotation || 0)}deg); width:${Math.round(elements.icon.size * scale)}px; height:${Math.round(elements.icon.size * scale)}px; object-fit:contain; z-index:3;" />
                            ` : ''}

                            ${elements.sheet_no?.enabled ? `
                                <div class="rendered-item-pos" style="position:absolute; left:${elements.sheet_no.x}%; top:${elements.sheet_no.y}%; transform:translate(-50%, -50%) rotate(${Number(elements.sheet_no.rotation || 0)}deg); font-size:${Math.round(elements.sheet_no.size * scale)}px; font-weight:${elements.sheet_no.weight}; color:${elements.sheet_no.color}; font-family:monospace; z-index:2; white-space:nowrap; line-height:1.1;">
                                    ${elements.sheet_no.prefix || ''}${pageSheetFormatted}
                                </div>
                            ` : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
                ${footerHTML}
            </div>
            `;
        }
        return html;
    },

    // Solid Browser Print Without Any White Screen
    triggerPrint() {
        const source = document.getElementById('print-container');
        if (!source) return;

        const filename = this.getPrintFilename();
        const originalTitle = document.title;
        document.title = filename.replace(/\.pdf$/i, '');

        let mount = document.getElementById('print-mount-point');
        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'print-mount-point';
            document.body.appendChild(mount);
        }

        mount.innerHTML = source.innerHTML;

        window.print();

        setTimeout(() => {
            mount.innerHTML = '';
            document.title = originalTitle;
        }, 1500);
    },

        async exportPDF() {
        const sourcePages = Array.from(document.querySelectorAll('#print-container .pdf-a4-page'));
        if (sourcePages.length === 0) return this.toast('لا توجد كروت للتصدير', 'warning');
        if (this._pdfExportRunning) return this.toast('تصدير PDF قيد التنفيذ بالفعل', 'warning');

        const pdfButton = document.getElementById('pdf-export-btn');
        const originalButtonText = pdfButton?.textContent || this.t('export_pdf');
        const filename = this.getPrintFilename();
        const total = sourcePages.length;

        // Large batches used to exhaust browser memory (e.g. 4,800 cards / 80 pages).
        // Keep small jobs sharp and reduce raster size only when the page count requires it.
        const renderScale = total > 50 ? 1.0 : (total > 20 ? 1.25 : 2.0);
        const jpegQuality = total > 50 ? 0.80 : (total > 20 ? 0.86 : 0.94);

        this._pdfExportRunning = true;
        if (pdfButton) {
            pdfButton.disabled = true;
            pdfButton.textContent = `⏳ تجهيز 0 / ${total}`;
        }
        this.toast(`جاري تجهيز ${total} صفحة PDF... لا تغلق النافذة`, 'info');

        try {
            const JsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
            const canvasRenderer = window.html2canvas;
            if (!JsPdfCtor || !canvasRenderer) {
                throw new Error('مكتبة إنشاء PDF لم تُحمّل بصورة صحيحة');
            }
            if (document.fonts?.ready) await document.fonts.ready;

            const pdf = new JsPdfCtor({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true,
                putOnlyUsedFonts: true
            });

            for (let i = 0; i < total; i++) {
                if (pdfButton) pdfButton.textContent = `⏳ تجهيز ${i + 1} / ${total}`;

                const clone = sourcePages[i].cloneNode(true);
                clone.style.setProperty('margin', '0', 'important');
                clone.style.setProperty('box-shadow', 'none', 'important');
                clone.style.setProperty('max-width', 'none', 'important');
                clone.style.setProperty('width', '210mm', 'important');
                clone.style.setProperty('height', '297mm', 'important');
                clone.style.setProperty('min-height', '297mm', 'important');
                clone.style.position = 'fixed';
                clone.style.top = '0';
                clone.style.left = '-10000px';
                clone.style.background = '#ffffff';
                clone.style.zIndex = '1';
                document.body.appendChild(clone);

                let canvas = null;
                try {
                    const images = Array.from(clone.querySelectorAll('img'));
                    await Promise.all(images.map(img => {
                        if (img.complete) return Promise.resolve();
                        return new Promise(resolve => {
                            const done = () => resolve();
                            img.addEventListener('load', done, { once: true });
                            img.addEventListener('error', done, { once: true });
                            setTimeout(done, 3000);
                        });
                    }));

                    canvas = await canvasRenderer(clone, {
                        scale: renderScale,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        scrollY: 0,
                        scrollX: 0,
                        logging: false,
                        imageTimeout: 5000
                    });

                    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
                    if (i > 0) pdf.addPage('a4', 'portrait');
                    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, total > 20 ? 'FAST' : 'MEDIUM');
                } finally {
                    clone.remove();
                    if (canvas) {
                        canvas.width = 1;
                        canvas.height = 1;
                    }
                }

                // Give the browser a chance to release canvas memory and keep the UI responsive.
                if ((i + 1) % 2 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            if (pdfButton) pdfButton.textContent = '⬇️ بدء التنزيل...';
            pdf.save(filename);
            this.toast(`✓ تم تنزيل PDF بنجاح (${total} صفحة)`, 'success');
        } catch (e) {
            console.error('PDF export error:', e);
            this.toast(`تعذر تصدير PDF: ${e?.message || 'خطأ غير معروف'}. يمكنك استخدام طباعة A4 وحفظها PDF.`, 'danger');
        } finally {
            this._pdfExportRunning = false;
            if (pdfButton) {
                pdfButton.disabled = false;
                pdfButton.textContent = originalButtonText;
            }
        }
    },

    filterUsersByProfile(profName) {
        this.usersFilterProf = profName;
        this.usersFilterStatus = '';
        this.usersSearchQuery = '';
        this.usersFilterBatch = '';
        this.usersPage = 1;
        this.switchTab('users');
    },

    async renderProfiles() {
        const profiles = await this.api('get_profiles') || [];
        this._profilesList = profiles;

        const PB = window.SamUI?.PageBuilder;

        // Compute metrics
        const totalProfiles = profiles.length;
        const paidProfiles = profiles.filter(p => p.package_type !== 'free').length;
        const freeProfiles = profiles.filter(p => p.package_type === 'free').length;
        const totalSubscribers = profiles.reduce((acc, p) => acc + (Number(p.user_count) || 0), 0);
        const totalOnline = profiles.reduce((acc, p) => acc + (Number(p.online_count) || 0), 0);

        const actions = [
            (this.can('profiles_add') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: `+ ${this.t('add')}`, variant: 'primary', onclick: 'App.showProfileModal()' } : null,
            (this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '⚡ إدارة السرعات', variant: 'warning', onclick: 'App.showSpeedTiersModal()' } : null,
            (this.can('profiles') || this.userRole === 'system_owner' || this.userRole === 'superadmin') ? { label: '📥 استيراد باقات', variant: 'secondary', onclick: 'App.showImportProfilesModal()', title: 'استيراد الباقات من ملف CSV' } : null,
            (this.can('profiles')) ? { label: '📤 تصدير CSV', variant: 'secondary', onclick: 'App.exportProfilesCSV()', title: 'تصدير الباقات إلى ملف CSV' } : null,
            { label: `⟳ ${this.t('refresh')}`, variant: 'secondary', onclick: 'App.renderProfiles()' }
        ].filter(Boolean);

        const stats = [
            { label: 'إجمالي الباقات', value: totalProfiles, icon: '📦', tone: 'blue', active: !this.profilesTypeFilter, onclick: "App.profilesTypeFilter=''; App.renderProfiles();" },
            { label: 'باقات مدفوعة', value: paidProfiles, icon: '💳', tone: 'emerald', active: this.profilesTypeFilter === 'paid', onclick: "App.profilesTypeFilter='paid'; App.renderProfiles();" },
            { label: 'باقات مجانية', value: freeProfiles, icon: '🎁', tone: 'indigo', active: this.profilesTypeFilter === 'free', onclick: "App.profilesTypeFilter='free'; App.renderProfiles();" },
            { label: 'إجمالي المشتركين', value: totalSubscribers.toLocaleString(), icon: '👥', tone: 'purple' },
            { label: 'متصلون الآن', value: totalOnline.toLocaleString(), icon: '🟢', tone: 'cyan' }
        ];

        // Apply filters
        let filtered = profiles;
        if (this.profilesTypeFilter === 'paid') {
            filtered = filtered.filter(p => p.package_type !== 'free');
        } else if (this.profilesTypeFilter === 'free') {
            filtered = filtered.filter(p => p.package_type === 'free');
        }

        const q = (this.profilesSearchQuery || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.name_for_users && p.name_for_users.toLowerCase().includes(q)) ||
                (p.rate_limit && p.rate_limit.toLowerCase().includes(q))
            );
        }

        const toolbar = {
            left: [
                PB ? PB.renderQuickSearch({
                    id: 'profiles-search-input',
                    placeholder: 'بحث في الباقات، السرعات...',
                    value: this.profilesSearchQuery || '',
                    oninput: "App.profilesSearchQuery=this.value; App.renderProfiles();",
                    onclear: "App.profilesSearchQuery=''; App.renderProfiles();",
                    minWidth: '240px'
                }) : `<input type="text" class="sam-input" placeholder="بحث..." value="${this.escape(this.profilesSearchQuery || '')}" oninput="App.profilesSearchQuery=this.value; App.renderProfiles();" />`
            ],
            right: [
                `<span style="font-size:12.5px; color:var(--sam-text-secondary); font-weight:600;">عرض <b>${filtered.length}</b> من أصل <b>${totalProfiles}</b> باقة</span>`
            ]
        };

        const columns = [
            { key: 'idx', label: '#', width: '45px', render: (_, i) => i + 1 },
            { key: 'name', label: 'اسم الباقة (Profile)', render: p => `<b>${this.escape(p.name)}</b>` },
            { key: 'name_for_users', label: 'الاسم للمشتركين', render: p => this.escape(p.name_for_users || p.name) },
            { key: 'package_type', label: 'نوع الباقة', render: p => `<span class="status-pill" style="background:${p.package_type === 'free' ? '#dcfce7' : '#dbeafe'};color:${p.package_type === 'free' ? '#166534' : '#1d4ed8'};font-weight:700;">${p.package_type === 'free' ? '🎁 مجانية' : '💳 مدفوعة'}</span>` },
            { key: 'user_count', label: 'المشتركون', render: p => `
                <span class="status-pill status-active" style="cursor:pointer; display:inline-flex; align-items:center; gap:5px;" onclick="App.filterUsersByProfile('${this.escape(p.name)}')" title="عرض كروت هذه الباقة">
                    👥 <b>${(p.user_count || 0).toLocaleString()}</b> كرت
                    ${p.online_count > 0 ? `<span style="color:#06b6d4; font-size:11px;">(🟢 ${p.online_count})</span>` : ''}
                </span>`
            },
            { key: 'validity', label: 'الصلاحية (Validity)', render: p => `<span class="status-pill status-online">${App.formatValidityDisplay(p.validity)}</span>` },
            { key: 'rate_limit', label: 'السرعة (Rx/Tx)', render: p => `<code>${this.escape(p.rate_limit || 'Unlimited')}</code>` },
            { key: 'price', label: 'السعر', render: p => `<b>${p.price} ${App.getCurrencySymbol(App._baseCurrency)}</b>` },
            { key: 'shared_users', label: 'الأجهزة', render: p => p.shared_users ?? 1 },
            { key: 'transfer_limit', label: 'البيانات', render: p => p.transfer_limit > 0 ? App.formatBytes(p.transfer_limit) : 'غير محدود' },
            { key: 'uptime_limit', label: 'وقت الاستخدام', render: p => p.uptime_limit > 0 ? App.formatSecondsArabic(p.uptime_limit) : 'غير محدود' },
            { key: 'template_name', label: 'قالب الطباعة', render: p => `<span class="status-pill ${p.template_name ? 'status-active' : (p.package_type === 'free' ? 'status-online' : 'status-warning')}">${this.escape(p.template_name || (p.package_type === 'free' ? 'بدون قالب (مجانية)' : 'قالب غير محدد'))}</span>` },
            { key: 'actions', label: this.t('actions'), align: 'center', width: '130px', render: p => `
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="sam-btn sam-btn--sm sam-btn--secondary" title="تعديل الباقة" onclick='App.showProfileModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>✏️</button>
                    <button class="sam-btn sam-btn--sm sam-btn--info" title="عرض المشتركين" onclick="App.filterUsersByProfile('${this.escape(p.name)}')">👥</button>
                    ${(this.userRole === 'system_owner' || this.userRole === 'superadmin') && Number(p.user_count || 0) === 0 ? `
                        <button class="sam-btn sam-btn--sm sam-btn--danger" title="حذف باقة فارغة فقط" onclick="App.deleteProfile(${p.id}, '${this.escape(p.name)}')">🗑️</button>
                    ` : ''}
                </div>`
            }
        ];

        const tableHtml = PB ? PB.renderTable({
            columns,
            rows: filtered,
            emptyText: 'لا توجد باقات مطابقة لمعايير البحث'
        }) : '';

        const shell = PB ? PB.renderShell({
            id: 'profiles',
            archetype: 'table',
            title: 'إدارة باقات الإنترنت والسرعات',
            subtitle: 'تحديد صلاحيات الكروت، حدود التحميل والرفع، وسرعات الخدمة',
            eyebrow: 'إدارة الشبكة والمشتركين',
            icon: '📦',
            actions,
            stats,
            toolbar,
            content: tableHtml
        }) : `<div class="mt-page">${tableHtml}</div>`;

        document.getElementById('main-view').innerHTML = shell;
    },

    async showSpeedTiersModal() {
        const res = await this.api('get_speed_tiers');
        this.speedTierList = (res?.tiers || []).map(t => ({
            ...t,
            sort_order: parseInt(t.sort_order) || 0,
            is_active: Number(t.is_active) ? 1 : 0,
            usage_count: parseInt(t.usage_count) || 0
        }));
        this.speedTierFilter = 'all';
        this.speedTierSearch = '';

        const totalCount = this.speedTierList.length;
        const activeCount = this.speedTierList.filter(t => t.is_active).length;
        const usedCount = this.speedTierList.filter(t => t.usage_count > 0).length;

        const modalHtml = `
        <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="mt-modal" style="max-width:960px; width:95%; max-height:92vh; display:flex; flex-direction:column; overflow:hidden;">
                <!-- Header -->
                <div class="mt-modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-bottom:1px solid var(--border-color); background:var(--bg-card);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:24px;">⚡</span>
                        <div>
                            <h3 style="margin:0; font-size:16px; font-weight:700;">إدارة سرعات الشبكة والباقات</h3>
                            <p style="margin:0; font-size:11px; color:var(--text-muted);">تنظيم وتوحيد سرعات الرفع والتحميل وحذف التكرارات غير المتناسقة</p>
                        </div>
                    </div>
                    <button class="mt-btn mt-btn-sm" style="padding:4px 10px;" onclick="App.closeModal()">✕</button>
                </div>

                <!-- Modal Body Scrollable -->
                <div class="mt-modal-body" style="padding:16px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
                    
                    <!-- Stats & Auto Organize Toolbar -->
                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; background:var(--bg-input); padding:10px 16px; border-radius:8px; border:1px solid var(--border-color);">
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                            <span class="mt-badge" style="background:#3b82f615; color:#3b82f6; font-weight:600; padding:5px 10px; font-size:12px; border-radius:6px;">
                                📊 إجمالي السرعات: <strong>${totalCount}</strong>
                            </span>
                            <span class="mt-badge" style="background:#10b98115; color:#10b981; font-weight:600; padding:5px 10px; font-size:12px; border-radius:6px;">
                                🟢 النشطة: <strong>${activeCount}</strong>
                            </span>
                            <span class="mt-badge" style="background:#8b5cf615; color:#8b5cf6; font-weight:600; padding:5px 10px; font-size:12px; border-radius:6px;">
                                📦 مستخدمة في الباقات: <strong>${usedCount}</strong>
                            </span>
                        </div>
                        <div>
                            <button class="mt-btn mt-btn-secondary mt-btn-sm" style="background:#8b5cf615; color:#8b5cf6; border:1px solid #8b5cf640; font-weight:600; padding:6px 12px;" onclick="App.resetSpeedTiers()" title="إعادة ضبط وتنظيم السرعات وحذف التكرارات مع الحفاظ على سرعات الباقات الحالية">
                                ✨ إعادة التنظيم والترتيب التلقائي
                            </button>
                        </div>
                    </div>

                    <!-- Speed Builder / Quick Add Card -->
                    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:12px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div style="font-weight:700; font-size:12px; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                                <span>🛠️ مولد السرعات التفاعلي السريع (Speed Builder)</span>
                            </div>
                        </div>

                        <!-- Presets selector buttons -->
                        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px; font-size:11px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="font-weight:600; min-width:80px; color:#10b981;">⬇️ التحميل:</span>
                                <div style="display:flex; gap:3px; flex-wrap:wrap;">
                                    ${['1M', '2M', '3M', '5M', '10M', '15M', '20M', '30M', '50M', '100M', '500M'].map(r => `
                                        <button type="button" class="mt-btn mt-btn-sm" style="padding:1px 7px; font-size:11px;" onclick="App.setSpeedBuilderTx('${r}')">${r}</button>
                                    `).join('')}
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span style="font-weight:600; min-width:80px; color:#0284c7;">⬆️ الرفع:</span>
                                <div style="display:flex; gap:3px; flex-wrap:wrap;">
                                    ${['512K', '1M', '2M', '3M', '5M', '10M', '15M', '20M', '50M', '100M', '500M'].map(r => `
                                        <button type="button" class="mt-btn mt-btn-sm" style="padding:1px 7px; font-size:11px;" onclick="App.setSpeedBuilderRx('${r}')">${r}</button>
                                    `).join('')}
                                    <button type="button" class="mt-btn mt-btn-sm mt-btn-secondary" style="padding:1px 7px; font-size:11px; margin-right:4px;" onclick="App.toggleSpeedBuilderSymmetric()">⚡ متماثل</button>
                                </div>
                            </div>
                        </div>

                        <!-- Inputs row -->
                        <div style="display:grid; grid-template-columns: 1.4fr 1fr 80px auto; gap:8px; align-items:flex-end;">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:11px; margin-bottom:3px; display:block;">اسم السرعة بالعربية</label>
                                <input id="speed-builder-label" class="mt-input" style="height:34px; font-size:12px;" placeholder="مثال: فائق (10 Mbps)" />
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:11px; margin-bottom:3px; display:block;">السرعة (رفع/تحميل)</label>
                                <input id="speed-builder-rate" class="mt-input" dir="ltr" style="height:34px; font-size:12px; font-weight:600; text-align:center;" placeholder="2M/5M" oninput="App.onSpeedBuilderRateChange(this.value)" />
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:11px; margin-bottom:3px; display:block;">الترتيب</label>
                                <input id="speed-builder-order" type="number" class="mt-input" style="height:34px; font-size:12px; text-align:center;" value="${totalCount + 1}" min="1" />
                            </div>
                            <div>
                                <button type="button" class="mt-btn mt-btn-primary" style="height:34px; font-size:12px; white-space:nowrap; padding:0 14px;" onclick="App.quickAddSpeedTier()">
                                    ➕ إضافة السرعة
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Search & Filter Controls -->
                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button id="speed-filter-all" class="mt-btn mt-btn-sm ${this.speedTierFilter==='all'?'mt-btn-primary':'mt-btn-secondary'}" onclick="App.setSpeedFilter('all')">الكل (${totalCount})</button>
                            <button id="speed-filter-active" class="mt-btn mt-btn-sm ${this.speedTierFilter==='active'?'mt-btn-primary':'mt-btn-secondary'}" onclick="App.setSpeedFilter('active')">النشطة (${activeCount})</button>
                            <button id="speed-filter-used" class="mt-btn mt-btn-sm ${this.speedTierFilter==='used'?'mt-btn-primary':'mt-btn-secondary'}" onclick="App.setSpeedFilter('used')">المستخدمة في باقات (${usedCount})</button>
                        </div>
                        <div style="position:relative; min-width:220px; flex:1; max-width:300px;">
                            <input id="speed-search-input" class="mt-input" style="height:32px; font-size:12px;" placeholder="🔍 بحث بالاسم أو المعدل..." oninput="App.onSpeedSearch(this.value)" />
                        </div>
                    </div>

                    <!-- Speed Tiers Table -->
                    <div class="mt-table-container" style="border:1px solid var(--border-color); border-radius:6px; max-height:360px; overflow-y:auto;">
                        <table class="mt-table" style="margin:0; width:100%; border-collapse:collapse;">
                            <thead style="position:sticky; top:0; background:var(--bg-card); z-index:2; box-shadow:0 1px 2px rgba(0,0,0,0.06);">
                                <tr>
                                    <th style="width:65px; text-align:center;">الترتيب</th>
                                    <th style="min-width:150px;">اسم السرعة</th>
                                    <th style="width:130px; text-align:center;">معدل السرعة</th>
                                    <th style="min-width:160px;">التفاصيل ومعدل النقل</th>
                                    <th style="width:120px; text-align:center;">استخدام الباقات</th>
                                    <th style="width:85px; text-align:center;">الحالة</th>
                                    <th style="width:60px; text-align:center;">إجراء</th>
                                </tr>
                            </thead>
                            <tbody id="speed-tiers-tbody">
                                ${this.renderSpeedTiersRows()}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Modal Footer -->
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; border-top:1px solid var(--border-color); background:var(--bg-card);">
                    <div style="font-size:11px; color:var(--text-muted);">
                        💡 يمكنك تعديل الأسماء والترتيب وحفظها جميعاً دفعة واحدة عبر زر الحفظ.
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                        <button class="mt-btn mt-btn-success" onclick="App.saveAllSpeedTiers()">💾 حفظ كل التغييرات</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.getElementById('modal-container').innerHTML = modalHtml;
        this.speedBuilderRx = '2M';
        this.speedBuilderTx = '5M';
        this.updateSpeedBuilderFields();
    },

    renderSpeedTiersRows() {
        if (!this.speedTierList || !this.speedTierList.length) {
            return `<tr><td colspan="7" style="text-align:center; padding:25px; color:var(--text-muted);">لا توجد سرعات معرفة حالياً. اضغط "إعادة التنظيم والترتيب التلقائي" لتحميل الدليل القياسي.</td></tr>`;
        }

        let filtered = [...this.speedTierList];
        if (this.speedTierFilter === 'active') {
            filtered = filtered.filter(t => t.is_active);
        } else if (this.speedTierFilter === 'used') {
            filtered = filtered.filter(t => t.usage_count > 0);
        }

        const q = (this.speedTierSearch || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(t => 
                (t.label || '').toLowerCase().includes(q) || 
                (t.rate_limit || '').toLowerCase().includes(q) ||
                (t.rx_label || '').toLowerCase().includes(q) ||
                (t.tx_label || '').toLowerCase().includes(q)
            );
        }

        if (!filtered.length) {
            return `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">لا توجد نتائج مطابقة للبحث.</td></tr>`;
        }

        return filtered.map(t => {
            const isSym = t.is_symmetric || (t.rx_kbps && t.rx_kbps === t.tx_kbps);
            const usageCount = Number(t.usage_count) || 0;
            return `
            <tr id="speed-row-${t.id}">
                <td style="text-align:center;">
                    <input id="speed-order-${t.id}" class="mt-input" type="number" min="1" value="${t.sort_order}" style="width:50px; text-align:center; padding:3px 4px; font-size:12px;" />
                </td>
                <td>
                    <input id="speed-label-${t.id}" class="mt-input" value="${this.escape(t.label)}" style="font-size:12px; padding:4px 8px;" />
                </td>
                <td>
                    <input id="speed-rate-${t.id}" class="mt-input" value="${t.rate_limit}" dir="ltr" style="font-size:12px; text-align:center; font-weight:600; padding:4px 8px;" />
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                        <span class="mt-badge" style="background:#0284c715; color:#0284c7; border:1px solid #0284c730; font-size:11px; padding:2px 5px;">
                            ⬆️ ${this.escape(t.rx_label || t.rx_rate || '1M')}
                        </span>
                        <span class="mt-badge" style="background:#10b98115; color:#10b981; border:1px solid #10b98130; font-size:11px; padding:2px 5px;">
                            ⬇️ ${this.escape(t.tx_label || t.tx_rate || '2M')}
                        </span>
                        ${isSym ? '<span class="mt-badge" style="background:#10b98120; color:#10b981; font-size:10px; padding:1px 4px;">متماثل</span>' : '<span class="mt-badge" style="background:#64748b15; color:#64748b; font-size:10px; padding:1px 4px;">غير متماثل</span>'}
                    </div>
                </td>
                <td style="text-align:center;">
                    ${usageCount > 0 
                        ? `<span class="mt-badge" style="background:#8b5cf615; color:#8b5cf6; border:1px solid #8b5cf630; font-size:11px; padding:2px 6px; font-weight:600;" title="مستخدمة في ${usageCount} باقة">📦 ${usageCount} باقة</span>`
                        : `<span style="color:var(--text-muted); font-size:11px;">—</span>`
                    }
                </td>
                <td style="text-align:center;">
                    <label style="display:inline-flex; align-items:center; cursor:pointer; gap:4px; font-size:11px;">
                        <input id="speed-active-${t.id}" type="checkbox" ${t.is_active ? 'checked' : ''} style="cursor:pointer;" />
                        <span>${t.is_active ? 'نشطة' : 'معطلة'}</span>
                    </label>
                </td>
                <td style="text-align:center;">
                    ${usageCount > 0 
                        ? `<button class="mt-btn mt-btn-sm" style="padding:2px 6px; opacity:0.4; cursor:not-allowed;" title="لا يمكن حذف هذه السرعة لأنها مستخدمة في باقات" disabled>🗑️</button>`
                        : `<button class="mt-btn mt-btn-danger mt-btn-sm" style="padding:2px 6px;" onclick="App.deleteSpeedTier(${t.id})" title="حذف السرعة">🗑️</button>`
                    }
                </td>
            </tr>`;
        }).join('');
    },

    setSpeedFilter(filter) {
        this.speedTierFilter = filter;
        ['all', 'active', 'used'].forEach(f => {
            const btn = document.getElementById(`speed-filter-${f}`);
            if (btn) {
                btn.className = `mt-btn mt-btn-sm ${f === filter ? 'mt-btn-primary' : 'mt-btn-secondary'}`;
            }
        });
        const tbody = document.getElementById('speed-tiers-tbody');
        if (tbody) tbody.innerHTML = this.renderSpeedTiersRows();
    },

    onSpeedSearch(query) {
        this.speedTierSearch = query;
        const tbody = document.getElementById('speed-tiers-tbody');
        if (tbody) tbody.innerHTML = this.renderSpeedTiersRows();
    },

    setSpeedBuilderTx(tx) {
        this.speedBuilderTx = tx;
        this.updateSpeedBuilderFields();
    },

    setSpeedBuilderRx(rx) {
        this.speedBuilderRx = rx;
        this.updateSpeedBuilderFields();
    },

    toggleSpeedBuilderSymmetric() {
        this.speedBuilderRx = this.speedBuilderTx || '5M';
        this.updateSpeedBuilderFields();
    },

    updateSpeedBuilderFields() {
        const rx = this.speedBuilderRx || '2M';
        const tx = this.speedBuilderTx || '5M';
        const rate = `${rx}/${tx}`;
        const rateInput = document.getElementById('speed-builder-rate');
        const labelInput = document.getElementById('speed-builder-label');
        if (rateInput) rateInput.value = rate;
        if (labelInput && (!labelInput.value || labelInput.dataset.auto === 'true' || labelInput.value.trim() === '')) {
            labelInput.value = this.autoSuggestSpeedLabel(rate);
            labelInput.dataset.auto = 'true';
        }
    },

    onSpeedBuilderRateChange(rate) {
        const labelInput = document.getElementById('speed-builder-label');
        if (labelInput && labelInput.dataset.auto === 'true') {
            labelInput.value = this.autoSuggestSpeedLabel(rate);
        }
    },

    autoSuggestSpeedLabel(rate) {
        rate = String(rate || '').toUpperCase().trim();
        const std = {
            '512K/1M': 'اقتصادي (1 Mbps)',
            '1M/2M': 'عادي (2 Mbps)',
            '2M/2M': 'متماثل (2 Mbps)',
            '1M/3M': 'أساسي (3 Mbps)',
            '3M/3M': 'مستحسن (3 Mbps)',
            '2M/5M': 'سريع (5 Mbps)',
            '5M/5M': 'متوسط (5 Mbps)',
            '3M/10M': 'متقدم (10 Mbps)',
            '10M/10M': 'فائق (10 Mbps)',
            '5M/20M': 'مميز (20 Mbps)',
            '20M/20M': 'أعمال (20 Mbps)',
            '10M/30M': 'توربو (30 Mbps)',
            '30M/30M': 'توربو بلس (30 Mbps)',
            '15M/50M': 'VIP فائق (50 Mbps)',
            '50M/50M': 'VIP برو (50 Mbps)',
            '25M/100M': 'صاروخي (100 Mbps)',
            '100M/100M': 'صاروخي متماثل (100 Mbps)',
            '100M/500M': 'ألياف ضوئية (500 Mbps)',
            '500M/500M': 'ألياف فائقة (500 Mbps)'
        };
        if (std[rate]) return std[rate];
        const parts = rate.split('/');
        const rx = parts[0] || '1M';
        const tx = parts[1] || parts[0] || '1M';
        const isSym = (rx === tx);
        const formatP = (p) => p.includes('G') ? p.replace('G', ' Gbps') : (p.includes('M') ? p.replace('M', ' Mbps') : p.replace('K', ' Kbps'));
        return isSym ? `متماثل (${formatP(tx)})` : `سرعة (${formatP(tx)})`;
    },

    async quickAddSpeedTier() {
        const rate = (document.getElementById('speed-builder-rate')?.value || '').trim().toUpperCase();
        const label = (document.getElementById('speed-builder-label')?.value || '').trim();
        const sortOrder = parseInt(document.getElementById('speed-builder-order')?.value) || 0;

        if (!rate) return this.toast('يرجى تحديد معدل السرعة', 'error');
        if (!label) return this.toast('يرجى كتابة اسم للسرعة', 'error');

        const r = await this.api('save_speed_tier', {}, 'POST', {
            label,
            rate_limit: rate,
            sort_order: sortOrder,
            is_active: 1
        });

        if (r?.success) {
            this.toast('تمت إضافة السرعة بنجاح', 'success');
            await this.showSpeedTiersModal();
        } else {
            this.toast(r?.error || 'تعذر إضافة السرعة', 'error');
        }
    },

    async saveAllSpeedTiers() {
        if (!this.speedTierList || !this.speedTierList.length) return;
        let successCount = 0;
        for (const t of this.speedTierList) {
            const labelEl = document.getElementById(`speed-label-${t.id}`);
            const rateEl = document.getElementById(`speed-rate-${t.id}`);
            const orderEl = document.getElementById(`speed-order-${t.id}`);
            const activeEl = document.getElementById(`speed-active-${t.id}`);

            if (!labelEl || !rateEl) continue;

            const label = labelEl.value.trim();
            const rate = rateEl.value.trim().toUpperCase();
            const sort = parseInt(orderEl?.value) || 0;
            const active = activeEl ? (activeEl.checked ? 1 : 0) : 1;

            if (!rate || !label) continue;

            const r = await this.api('save_speed_tier', {}, 'POST', {
                id: t.id,
                label,
                rate_limit: rate,
                sort_order: sort,
                is_active: active
            });

            if (r?.success) successCount++;
            else {
                return this.toast(r?.error || `تعذر حفظ السرعة ${label}`, 'error');
            }
        }

        this.toast('تم حفظ جميع تعديلات وترتيبات السرعات بنجاح', 'success');
        await this.showSpeedTiersModal();
    },

    async resetSpeedTiers() {
        if (!confirm('هل تريد إعادة تنظيم وترتيب السرعات تلقائياً وفق المعايير القياسية؟\nسيتم توحيد المسميات وحذف التكرارات مع الحفاظ التام على جميع السرعات المستخدمة في الباقات.')) {
            return;
        }

        const r = await this.api('reset_speed_tiers', {}, 'POST', {});
        if (r?.success) {
            this.toast(r.message || 'تم إعادة تنظيم وترتيب السرعات بنجاح', 'success');
            await this.showSpeedTiersModal();
        } else {
            this.toast(r?.error || 'تعذر إعادة تنظيم السرعات', 'error');
        }
    },

    async deleteSpeedTier(id) {
        if (!confirm('هل أنت متأكد من حذف هذه السرعة؟')) return;
        const r = await this.api('delete_speed_tier', {}, 'POST', { id });
        if (r?.success) {
            this.toast('تم حذف السرعة بنجاح', 'success');
            await this.showSpeedTiersModal();
        } else {
            this.toast(r?.error || 'تعذر حذف السرعة', 'error');
        }
    }
});