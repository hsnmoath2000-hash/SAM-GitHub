/**
 * SAM User Manager — Core Framework & Base State
 */
'use strict';

// Embedded Lightweight SVG QR Code Generator
const QRCodeGen = {
    generateSVG(text, size = 64) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 33 33" xmlns="http://www.w3.org/2000/svg">
            <rect width="33" height="33" fill="#ffffff"/>
            <!-- Top-Left Finder -->
            <rect x="2" y="2" width="7" height="7" fill="#000"/>
            <rect x="3" y="3" width="5" height="5" fill="#fff"/>
            <rect x="4" y="4" width="3" height="3" fill="#000"/>
            <!-- Top-Right Finder -->
            <rect x="24" y="2" width="7" height="7" fill="#000"/>
            <rect x="25" y="3" width="5" height="5" fill="#fff"/>
            <rect x="26" y="4" width="3" height="3" fill="#000"/>
            <!-- Bottom-Left Finder -->
            <rect x="2" y="24" width="7" height="7" fill="#000"/>
            <rect x="3" y="25" width="5" height="5" fill="#fff"/>
            <rect x="4" y="26" width="3" height="3" fill="#000"/>
            <!-- Patterns -->
            <rect x="11" y="4" width="2" height="2" fill="#000"/>
            <rect x="15" y="2" width="2" height="2" fill="#000"/>
            <rect x="19" y="4" width="2" height="2" fill="#000"/>
            <rect x="11" y="8" width="2" height="2" fill="#000"/>
            <rect x="14" y="10" width="3" height="2" fill="#000"/>
            <rect x="19" y="8" width="2" height="2" fill="#000"/>
            <rect x="4" y="11" width="2" height="3" fill="#000"/>
            <rect x="8" y="14" width="3" height="2" fill="#000"/>
            <rect x="24" y="11" width="2" height="3" fill="#000"/>
            <rect x="2" y="18" width="3" height="2" fill="#000"/>
            <rect x="8" y="20" width="2" height="2" fill="#000"/>
            <rect x="27" y="18" width="3" height="2" fill="#000"/>
            <!-- Center Timing -->
            <rect x="12" y="14" width="9" height="9" fill="#000"/>
            <rect x="14" y="16" width="5" height="5" fill="#fff"/>
            <rect x="15" y="17" width="3" height="3" fill="#000"/>
            <!-- Bottom -->
            <rect x="11" y="25" width="3" height="2" fill="#000"/>
            <rect x="16" y="27" width="2" height="3" fill="#000"/>
            <rect x="20" y="25" width="3" height="2" fill="#000"/>
            <rect x="25" y="24" width="2" height="2" fill="#000"/>
            <rect x="28" y="27" width="3" height="2" fill="#000"/>
        </svg>`;
    }
};

window.App = window.App || {};
const App = window.App;

// Universal Yemen Phone Formatting & Validation (9 digits: 77, 78, 70, 71, 73)
App.normalizeYemenPhone = function(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.startsWith('00967')) digits = digits.substring(5);
    else if (digits.startsWith('967') && digits.length === 12) digits = digits.substring(3);
    else if (digits.startsWith('07')) digits = digits.substring(1);
    else if (digits.startsWith('0') && (digits.length === 10 || digits.length === 9)) digits = digits.substring(1);

    if (digits.length === 9) return '967' + digits;
    if (digits.startsWith('967') && digits.length === 12) return digits;
    return digits;
};

App.isValidYemenPhone = function(phone) {
    if (!phone) return false;
    let digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.startsWith('00967')) digits = digits.substring(5);
    else if (digits.startsWith('967') && digits.length === 12) digits = digits.substring(3);
    else if (digits.startsWith('0')) digits = digits.substring(1);
    return /^(77|78|70|71|73)\d{7}$/.test(digits);
};

App.formatPhoneDisplay = function(phone) {
    if (!phone) return '';
    const norm = App.normalizeYemenPhone(phone);
    if (norm.startsWith('967') && norm.length === 12) {
        return `+967 ${norm.substring(3, 5)} ${norm.substring(5, 8)} ${norm.substring(8)}`;
    }
    return norm || phone;
};

App.onPhoneInputAutoFormat = function(inputEl) {
    if (!inputEl) return;
    let val = String(inputEl.value || '');
    // Strip all non-digit characters including invisible unicode bidi chars (\u2066, \u2069, etc.)
    let digits = val.replace(/[^0-9]/g, '');
    if (!digits) {
        inputEl.value = '';
        return;
    }

    // Strip Yemeni international code or trunk prefix if present
    if (digits.startsWith('00967')) {
        digits = digits.substring(5);
    } else if (digits.startsWith('967') && digits.length >= 12) {
        digits = digits.substring(3);
    } else if (digits.startsWith('07') && digits.length >= 10) {
        digits = digits.substring(1);
    } else if (digits.startsWith('0') && digits.length >= 10) {
        digits = digits.substring(1);
    } else if (digits.startsWith('0') && digits.length > 1 && /^(077|078|070|071|073)/.test(digits)) {
        digits = digits.substring(1);
    }

    // Yemeni mobile numbers are 9 digits starting with 77, 78, 70, 71, 73
    if (digits.length > 9) {
        // First check if the last 9 digits match valid Yemen mobile prefixes
        const last9 = digits.slice(-9);
        if (/^(77|78|70|71|73)/.test(last9)) {
            digits = last9;
        } else {
            // Check if the first 9 digits match
            const first9 = digits.slice(0, 9);
            if (/^(77|78|70|71|73)/.test(first9)) {
                digits = first9;
            } else {
                digits = last9;
            }
        }
    }

    inputEl.value = digits;
};

// Global clipboard paste listener for all phone inputs across any interface
if (!window.__samGlobalPhonePasteBound) {
    window.__samGlobalPhonePasteBound = true;
    document.addEventListener('paste', function(e) {
        const el = e.target;
        if (el && el.tagName === 'INPUT' && (
            el.type === 'tel' || 
            (el.id && el.id.toLowerCase().includes('phone')) || 
            (el.name && el.name.toLowerCase().includes('phone')) || 
            (el.className && el.className.includes('phone'))
        )) {
            setTimeout(() => {
                if (typeof App.onPhoneInputAutoFormat === 'function') {
                    App.onPhoneInputAutoFormat(el);
                }
            }, 10);
        }
    }, true);
}

// Smart Text Selection on Focus:
// 1st click (or Tab focus): Selects all text so user can immediately type over or clear it.
// 2nd / subsequent click (when already focused): Natural caret placement without re-selecting.
if (!window.__samSelectAllTextInputsBound) {
    window.__samSelectAllTextInputsBound = true;
    const excludedTypes = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit', 'date', 'time', 'datetime-local']);
    
    let activeElementBeforeMousedown = null;

    document.addEventListener('mousedown', (e) => {
        activeElementBeforeMousedown = document.activeElement;
    }, true);

    document.addEventListener('mouseup', (e) => {
        const element = e.target;
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
        if (element instanceof HTMLInputElement) {
            const t = (element.type || 'text').toLowerCase();
            if (excludedTypes.has(t)) return;
        }
        if (element.readOnly || element.disabled) return;

        // If the element was NOT already the active element before mousedown, this click gave it focus -> select all text
        if (activeElementBeforeMousedown !== element) {
            setTimeout(() => {
                try {
                    if (document.activeElement === element && typeof element.select === 'function') {
                        element.select();
                    }
                } catch (err) {}
            }, 1);
        }
        // If it WAS already the active element, do nothing so the browser places the cursor naturally where clicked!
    }, true);

    // Also support keyboard navigation (Tab key into input)
    document.addEventListener('focusin', (e) => {
        const element = e.target;
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
        if (element instanceof HTMLInputElement) {
            const t = (element.type || 'text').toLowerCase();
            if (excludedTypes.has(t)) return;
        }
        if (element.readOnly || element.disabled) return;

        // Small delay for keyboard focus
        setTimeout(() => {
            try {
                if (document.activeElement === element && typeof element.select === 'function') {
                    element.select();
                }
            } catch (err) {}
        }, 15);
    }, true);
}

Object.assign(App, {
    async onAdminModalRoleChange(newRole, isEdit) {
        if (!isEdit) {
            const res = await this.api('get_next_username', { role: newRole });
            if (res && res.username) {
                const userInp = document.getElementById('adm-user');
                if (userInp) userInp.value = res.username;
            }
        }
    },

    showChangePasswordModal() {
        this.openModal(`
            <div class="mt-modal-header" style="background:#0f172a; color:#fff;">
                <span>🔑 تغيير كلمة المرور الخاصة بحسابك</span>
                <span style="cursor:pointer;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="App.saveOwnPassword(event)">
                <div class="mt-modal-body" style="padding:16px;">
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700;">كلمة المرور الحالية *</label>
                        <input type="password" id="chg-curr-pass" class="mt-input" style="width:100%;" placeholder="أدخل كلمة المرور الحالية" required />
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700;">كلمة المرور الجديدة *</label>
                        <div style="display:flex; gap:4px;">
                            <input type="password" id="chg-new-pass" class="mt-input" style="width:100%;" placeholder="8+ خانات (أحرف كبيرة وصغيرة، أرقام، رموز)" required oninput="App.onAdminPasswordInput(this.value)" />
                            <button type="button" class="mt-btn" style="padding:2px 8px;" onclick="App.togglePasswordVisibility('chg-new-pass', this)">👁️</button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700;">تأكيد كلمة المرور الجديدة *</label>
                        <input type="password" id="chg-confirm-pass" class="mt-input" style="width:100%;" placeholder="أعد كتابة كلمة المرور الجديدة" required />
                    </div>
                    <div id="pwd-strength-box" style="margin-top:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 8px;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                            <span>مستوى قوة كلمة المرور:</span>
                            <b id="pwd-meter-text" style="color:#94a3b8;">لم يتم إدخال كلمة مرور</b>
                        </div>
                        <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                            <div id="pwd-meter-bar" style="width:0%; height:100%; background:#94a3b8; transition:all 0.3s ease;"></div>
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer" style="display:flex; justify-content:space-between;">
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:700; padding:6px 16px;">💾 حفظ كلمة المرور الجديدة</button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
                </div>
            </form>
        `, '480px');
    },

    async saveOwnPassword(e) {
        e.preventDefault();
        const curr = document.getElementById('chg-curr-pass')?.value;
        const newPass = document.getElementById('chg-new-pass')?.value;
        const confirmPass = document.getElementById('chg-confirm-pass')?.value;

        if (!newPass || newPass.length < 8) {
            return this.toast('كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل', 'warning');
        }
        if (newPass !== confirmPass) {
            return this.toast('كلمتا المرور غير متطابقتين', 'danger');
        }

        const res = await this.api('change_own_password', { current_password: curr, new_password: newPass });
        if (res && res.success) {
            this.toast('✓ تم تغيير كلمة المرور بنجاح', 'success');
            this.closeModal();
        } else {
            this.toast(res?.error || 'فشل تغيير كلمة المرور', 'danger');
        }
    },

    showForceChangePasswordModal() {
        this.openModal(`
            <div class="mt-modal-header" style="background:#dc2626; color:#fff;">
                <span>⚠️ إلزامي: تعيين كلمة مرور جديدة لحسابك لأول مرة</span>
            </div>
            <form onsubmit="App.saveForcePassword(event)">
                <div class="mt-modal-body" style="padding:18px;">
                    <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:6px; padding:10px 14px; margin-bottom:14px; color:#991b1b; font-size:12px; line-height:1.6;">
                        🛡️ <b>سياسة الأمان الإلزامية:</b> هذا هو أول تسجيل دخول لحسابك، يجب عليك تغيير كلمة المرور الافتراضية واختيار كلمة مرور قوية وخاصة بك للمتابعة.
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700;">كلمة المرور الجديدة *</label>
                        <div style="display:flex; gap:4px;">
                            <input type="password" id="force-new-pass" class="mt-input" style="width:100%;" placeholder="8+ خانات (أحرف كبيرة وصغيرة، أرقام، رموز)" required oninput="App.onAdminPasswordInput(this.value)" />
                            <button type="button" class="mt-btn" style="padding:2px 8px;" onclick="App.togglePasswordVisibility('force-new-pass', this)">👁️</button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700;">تأكيد كلمة المرور الجديدة *</label>
                        <input type="password" id="force-confirm-pass" class="mt-input" style="width:100%;" placeholder="أعد كتابة كلمة المرور الجديدة" required />
                    </div>
                    <div id="pwd-strength-box" style="margin-top:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 8px;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                            <span>مستوى قوة كلمة المرور:</span>
                            <b id="pwd-meter-text" style="color:#94a3b8;">لم يتم إدخال كلمة مرور</b>
                        </div>
                        <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                            <div id="pwd-meter-bar" style="width:0%; height:100%; background:#94a3b8; transition:all 0.3s ease;"></div>
                        </div>
                    </div>
                </div>
                <div class="mt-modal-footer" style="text-align:left;">
                    <button type="submit" class="mt-btn mt-btn-primary" style="font-weight:700; width:100%; padding:8px 16px; font-size:13px;">🔒 حفظ وتفعيل الحساب والدخول للوحة التحكم</button>
                </div>
            </form>
        `, '480px');
        const backdrop = document.querySelector('.mt-modal-backdrop');
        if (backdrop) backdrop.onclick = null;
    },

    async saveForcePassword(e) {
        e.preventDefault();
        const newPass = document.getElementById('force-new-pass')?.value;
        const confirmPass = document.getElementById('force-confirm-pass')?.value;

        if (!newPass || newPass.length < 8) {
            return this.toast('كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل', 'warning');
        }
        if (newPass !== confirmPass) {
            return this.toast('كلمتا المرور غير متطابقتين', 'danger');
        }

        const res = await this.api('change_own_password', { current_password: '', new_password: newPass });
        if (res && res.success) {
            this.toast('✓ تم تعيين كلمة المرور بنجاح! مرحباً بك في المنظومة.', 'success');
            this.closeModal();
            this.mustChangePassword = 0;
            if (this.currentUser) this.currentUser.must_change_password = 0;
        } else {
            this.toast(res?.error || 'فشل تعيين كلمة المرور', 'danger');
        }
    },

    // Password helpers used by the admin, own-password, and first-login forms.
    // Keep the generator entirely client-side; the server still validates the
    // submitted password before hashing it.
    checkPasswordStrength(password) {
        const value = String(password || '');
        const checks = {
            length: value.length >= 8,
            upper: /[A-Z]/.test(value),
            lower: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            symbol: /[^A-Za-z0-9]/.test(value)
        };
        const score = Object.values(checks).filter(Boolean).length;
        return { ...checks, score, valid: score === 5 };
    },

    onAdminPasswordInput(value) {
        const strength = this.checkPasswordStrength(value);
        const meter = document.getElementById('pwd-meter-bar');
        const label = document.getElementById('pwd-meter-text');
        const percent = Math.round((strength.score / 5) * 100);
        const color = strength.valid ? '#16a34a' : (strength.score >= 3 ? '#f59e0b' : '#ef4444');

        if (meter) {
            meter.style.width = `${percent}%`;
            meter.style.background = value ? color : '#94a3b8';
        }
        if (label) {
            label.textContent = !value ? 'لم يتم إدخال كلمة مرور' : (strength.valid ? 'كلمة مرور قوية' : (strength.score >= 3 ? 'متوسطة؛ أكمل الشروط' : 'ضعيفة'));
            label.style.color = value ? color : '#94a3b8';
        }

        const indicators = {
            'pwd-chk-len': strength.length,
            'pwd-chk-upper': strength.upper,
            'pwd-chk-lower': strength.lower,
            'pwd-chk-num': strength.number,
            'pwd-chk-sym': strength.symbol
        };
        Object.entries(indicators).forEach(([id, ok]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = ok ? '✅' : '❌';
                element.style.color = ok ? '#16a34a' : '#ef4444';
            }
        });
        return strength;
    },

    generateStrongPassword() {
        const field = document.getElementById('adm-pass');
        if (!field) return;

        const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lower = 'abcdefghijkmnopqrstuvwxyz';
        const digits = '23456789';
        const symbols = '!@#$%^&*_-+=';
        const all = upper + lower + digits + symbols;
        const randomIndex = (max) => {
            if (window.crypto?.getRandomValues) {
                const limit = Math.floor(0x100000000 / max) * max;
                const buffer = new Uint32Array(1);
                do { window.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
                return buffer[0] % max;
            }
            return Math.floor(Math.random() * max);
        };
        const pick = (chars) => chars[randomIndex(chars.length)];
        const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
        while (chars.length < 16) chars.push(pick(all));
        for (let i = chars.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        field.value = chars.join('');
        this.onAdminPasswordInput(field.value);
        field.focus();
    },

    togglePasswordVisibility(id, button) {
        const field = document.getElementById(id);
        if (!field) return;
        const visible = field.type === 'text';
        field.type = visible ? 'password' : 'text';
        if (button) button.textContent = visible ? '👁️' : '🙈';
    },

    // Table States for 5 Standardized Large-Scale Modules
    adminsPage: 1,
    adminsLimit: 50,
    adminsSortCol: 'id',
    adminsSortDir: 'asc',
    selectedAdmins: new Set(),

    assetsPage: 1,
    assetsLimit: 50,
    assetsSortCol: 'id',
    assetsSortDir: 'asc',
    selectedAssets: new Set(),

    nodesTablePage: 1,
    nodesTableLimit: 50,
    nodesTableSortCol: 'id',
    nodesTableSortDir: 'asc',
    selectedNodes: new Set(),

    portAnalyticsPage: 1,
    portAnalyticsLimit: 50,
    portAnalyticsSortCol: 'total_sales',
    portAnalyticsSortDir: 'desc',

    sessionsPage: 1,
    sessionsLimit: 50,
    sessionsSortCol: 'acctstarttime',
    sessionsSortDir: 'desc',
    selectedSessions: new Set(),

    // ==========================================
    // DEPARTMENTS & MODULES STRUCTURE
    // ==========================================
    can(permKey) {
        if (permKey === 'roles_permissions' && !this.isSystemOwner && this.userRole !== 'superadmin') return false;
        if (!this.userRole || this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin') return true;
        if (Array.isArray(this.userPermissions) && this.userPermissions.length > 0) {
            if (this.userPermissions.includes('*') || this.userPermissions.includes(permKey)) return true;
            return false;
        }
        const roleActionDefaults = {
            distributor: ['dashboard', 'sales', 'sales_create_invoice', 'sales_transfer_sheets', 'sales_invoice_pay', 'sales_invoice_return', 'card_warehouses', 'warehouse_stock_transfer', 'admins_agents', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'cashbox_accounts', 'sales_channel_reports', 'subscriber_portal'],
            pos_agent: ['dashboard', 'sales', 'sales_create_invoice', 'card_warehouses', 'sales_channel_reports', 'subscriber_portal'],
            partner: ['dashboard', 'financial_reports', 'sales_channel_reports', 'reports_center', 'partners_equity', 'networks_partnerships', 'cost_centers', 'port_analytics', 'routers', 'sstp_vpn', 'network_nodes', 'assets', 'logs', 'subscriber_portal'],
            finance: ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'vouchers_delete', 'financial_reports', 'sales_channel_reports', 'reports_center', 'sales', 'sales_invoice_pay', 'exchange_rates', 'subscriber_portal'],
            accountant: ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'vouchers_receipt_create', 'vouchers_payment_create', 'financial_reports', 'sales_channel_reports', 'reports_center', 'sales', 'sales_invoice_pay', 'exchange_rates', 'subscriber_portal'],
            main_node_owner: ['dashboard', 'network_nodes', 'assets', 'port_analytics', 'free_vouchers', 'free_vouchers_pos_rules', 'free_vouchers_schedules', 'free_vouchers_analytics', 'subscriber_portal'],
            sub_node_owner: ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'port_analytics', 'free_vouchers', 'free_vouchers_pos_rules', 'free_vouchers_schedules', 'free_vouchers_analytics', 'subscriber_portal'],
            regular_node_owner: ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'free_vouchers', 'free_vouchers_pos_rules', 'free_vouchers_schedules', 'free_vouchers_analytics', 'subscriber_portal'],
            maintenance: ['dashboard', 'network_nodes', 'assets', 'routers', 'noc', 'subscriber_portal'],
            vip: ['dashboard', 'free_vouchers', 'free_vouchers_pos_rules', 'free_vouchers_schedules', 'free_vouchers_analytics', 'free_vouchers_grant', 'subscriber_portal']
        };
        const defaults = roleActionDefaults[this.userRole] || ['dashboard', 'subscriber_portal'];
        return defaults.includes(permKey);
    },

    permissionCategories: [
        {
            id: 'cards_users',
            name: '🎫 إدارة الكروت والمشتركين والطباعة',
            color: '#8e44ad',
            items: [
                { id: 'users', name: '👁️ عرض شاشة كروت الإنترنت', desc: 'تصفح والبحث في كروت الإنترنت' },
                { id: 'users_add', name: '➕ إضافة كرت فردي جديد', desc: 'إضافة حساب كرت مفرد يدوياً' },
                { id: 'users_batch_gen', name: '⚡ توليد الكروت بالجملة', desc: 'توليد سلاسل كروت بالدفعات' },
                { id: 'users_print', name: '🖨️ طباعة ومعاينة وتصدير الكروت', desc: 'طباعة القوالب وتصدير PDF' },
                { id: 'users_import', name: '📥 استيراد كروت من ملف', desc: 'استيراد CSV / Excel' },
                { id: 'users_export', name: '📤 تصدير الكروت وقواعد البيانات', desc: 'تصدير الكروت إلى Excel/CSV' },
                { id: 'users_reset', name: '🔄 تصفير الكروت ومسح الجلسات', desc: 'تصفير استهلاك الكرت فورياً' },
                { id: 'users_change_profile', name: '📦 تغيير باقة الكروت المحددة', desc: 'ترقية أو تغيير سرعة وباقة الكرت' },
                { id: 'users_renew', name: '⏳ تجديد مدة وصلاحية الكروت', desc: 'تمديد انتهاء الصلاحية' },
                { id: 'users_disable', name: '⛔ تعطيل وإيقاف الكروت مؤقتاً', desc: 'حظر الاتصال مؤقتاً' },
                { id: 'users_enable', name: '✓ تفعيل وتشغيل الكروت المعطلة', desc: 'إعادة تفعيل الكرت' },
                { id: 'users_delete', name: '🗑️ حذف الكروت المحددة نهائياً', desc: 'حذف سجلات الكروت' },
                { id: 'profiles', name: '📦 إدارة باقات وسرعات الخدمة', desc: 'إنشاء وتعديل البروفايلات' },
                { id: 'templates', name: '🎨 تصاميم وقوالب الطباعة', desc: 'تعديل هوية وتصميم الكروت' }
            ]
        },
        {
            id: 'sales_warehouse',
            name: '🛒 إدارة المبيعات والمخازن والتحويل المخزني',
            color: '#27ae60',
            items: [
                { id: 'sales', name: '👁️ عرض شاشة فواتير المبيعات', desc: 'استعراض مبيعات الكروت والفواتير' },
                { id: 'sales_create_invoice', name: '🛒 إنشاء فاتورة بيع كروت وتفعيل فوري', desc: 'بيع وتفعيل كروت لموزع أو زبون' },
                { id: 'sales_transfer_sheets', name: '📦 أمر تحويل مخزني وتوزيع صفحات', desc: 'تحويل ورق وكروت لعهد الموزعين' },
                { id: 'sales_invoice_pay', name: '💵 سداد وقبض مبالغ الفواتير الآجلة', desc: 'تسجيل دفعات سداد المبيعات' },
                { id: 'sales_invoice_return', name: '🔄 مرتجع الفواتير واسترداد الكروت', desc: 'استرجاع كروت وصفحات المبيعات' },
                { id: 'card_warehouses', name: '🏢 إدارة مخازن الكروت والعهد الميدانية', desc: 'رؤية المخازن ومطابقة الجرد' },
                { id: 'warehouse_stock_transfer', name: '🚚 نقل المخزون بين المستودعات', desc: 'مناقلات العهد والمخازن' },
                { id: 'warehouse_stock_return', name: '↩️ إرجاع العهد والمخزون للمركزي', desc: 'إعادة المخزون للمستودع العام' }
            ]
        },
        {
            id: 'free_vouchers_mgmt',
            name: '🎁 إدارة الكروت المجانية والمكافآت و VIP',
            color: '#e67e22',
            items: [
                { id: 'free_vouchers', name: '👁️ عرض شاشة الكروت المجانية والجدولة', desc: 'استعراض الحصص والجداول' },
                { id: 'free_vouchers_grant', name: '🎁 منح وتوليد كروت مجانية فورية', desc: 'صرف كروت مجانية للأعضاء' },
                { id: 'free_vouchers_schedule_add', name: '⏰ ضبط وجدولة كروت دورية جديدة', desc: 'إعداد توزيع دوري آلي' },
                { id: 'free_vouchers_schedule_run', name: '⚡ تنفيذ الجدولة الدورية فوراً', desc: 'إطلاق دفعة الجدولة يدوياً' },
                { id: 'free_vouchers_schedule_delete', name: '🗑️ حذف الجدولة والحصص', desc: 'إلغاء جدولة الكروت' }
            ]
        },
        {
            id: 'finance_accounting',
            name: '💰 المالية والمحاسبة وسندات القبض والصرف',
            color: '#d35400',
            items: [
                { id: 'cashbox_accounts', name: '💼 إدارة الصناديق والخزائن النقدية', desc: 'متابعة أرصدة الكاش وحركات الصندوق' },
                { id: 'exchange_rates', name: '💱 إدارة أسعار الصرف والعملات', desc: 'ضبط ومتابعة أسعار صرف العملات والتحويل الفوري' },
                { id: 'vouchers_fin', name: '📑 عرض شاشة السندات المالية', desc: 'استعراض سندات القبض والصرف' },
                { id: 'vouchers_receipt_create', name: '💵 إنشاء سند قبض مالي جديد (+ قبض)', desc: 'استلام مبالغ نقدية من عميل/وكيل' },
                { id: 'vouchers_payment_create', name: '💳 إنشاء سند صرف مالي جديد (+ صرف)', desc: 'صرف مبالغ ونفقات تشغيلية' },
                { id: 'expenses_disburse_any_account', name: '🏦 الصرف والتمويل من أي حساب أو صندوق عام', desc: 'السماح بتحديد أي صندوق أو حساب مالي أو حساب مشرف كمصدر لتمويل الصرف بدلاً من حسابه الشخصي فقط' },
                { id: 'vouchers_delete', name: '🗑️ حذف وإلغاء السندات المالية', desc: 'إلغاء قيد سند مالي' },
                { id: 'chart_of_accounts', name: '🏢 شجرة ودليل الحسابات المحاسبي', desc: 'تهيئة الحسابات والأصول والخصوم' },
                { id: 'journal_entries', name: '📑 قيود اليومية العامة المزدوجة', desc: 'تسجيل القيود اليدوية والتسويات' },
                { id: 'trial_balance', name: '⚖️ ميزان المراجعة والأستاذ العام', desc: 'كشوف الحسابات والموازين' },
                { id: 'partners_equity', name: '🤝 حسابات الشركاء وتوزيع الأرباح', desc: 'رؤوس الأموال والأرباح الموزعة' },
                { id: 'salaries_payroll', name: '👥 الرواتب ومسيرات الموظفين', desc: 'صرف واحتساب مستحقات الكادر' }
                ,{ id: 'sales_sell_paper_cards', name: '🧾 بيع كروت وصفحات ورقية', desc: 'إنشاء فاتورة كروت الورق من المخزون' }
                ,{ id: 'instant_balance_sell', name: '💳 بيع رصيد شحن فوري', desc: 'بيع مبلغ من الرصيد الفوري' }
                ,{ id: 'instant_balance_issue_voucher', name: '📲 إصدار كرت من الرصيد', desc: 'خصم تكلفة الباقة وإرسال الكرت' }
                ,{ id: 'instant_balance_transfer', name: '🔄 تحويل رصيد فوري', desc: 'تحويل الرصيد إلى الحسابات التابعة' }
                ,{ id: 'instant_balance_initial_grant', name: '➕ منح رصيد أولي', desc: 'إدخال رصيد جديد لمخزن المدير العام' }
            ]
        },
        {
            id: 'reports_analytics',
            name: '📈 التقارير والإحصائيات والتحليلات',
            color: '#0284c7',
            items: [
                { id: 'sales_channel_reports', name: '🏪 تقارير مبيعات القنوات ونقاط البيع', desc: 'متابعة أداء المبيعات والأرباح والآجل حسب البائع' },
                { id: 'financial_reports', name: '📊 التقارير المالية وقوائم الأرباح (P&L)', desc: 'تقارير الإيرادات والأرباح التشغيلية' },
                { id: 'port_analytics', name: '🌐 مبيعات واستهلاك منافذ الشبكة والراوترات', desc: 'تحليل أداء السويتشات والمنافذ' },
                { id: 'reports_center', name: '🖨️ مركز التقارير الشاملة والطباعة', desc: 'طباعة وتصدير الكشوفات والتقارير' },
                { id: 'logs', name: '📜 سجلات العمليات وتدقيق أنشطة النظام (Audit Logs)', desc: 'مراقبة العمليات وسجل الأحداث والتدقيق' }
            ]
        },
        {
            id: 'network_infrastructure',
            name: '📡 الشبكة، الراوترات، السيرفرات والمراقبة',
            color: '#2980b9',
            items: [
                { id: 'routers', name: '🌐 إدارة أجهزة الراوتر (MikroTik NAS)', desc: 'إضافة ومتابعة الراوترات والاتصال' },
                { id: 'routers_reboot', name: '🔄 إعادة تشغيل وفحص الراوترات', desc: 'إرسال أوامر صيانة عبر API' },
                { id: 'sstp_vpn', name: '🔒 خادم وأنفاق SSTP VPN المشفرة', desc: 'ربط الفروع والراوترات البعيدة' },
                { id: 'network_nodes', name: '🌳 هيكلية ونقاط وتوزيع الشبكة', desc: 'النقاط الرئيسية والأبراج الفرعية' },
                { id: 'noc', name: '📡 مركز عمليات ومراقبة الشبكة (NOC)', desc: 'مراقبة حية وحالة التغطية' },
                { id: 'active_sessions', name: '🔴 عرض الجلسات الحية المتصلة', desc: 'متابعة المتصلين الآن بالشبكة' },
                { id: 'sessions_disconnect', name: '🚫 طرد وفصل جلسات المشتركين (CoA)', desc: 'قطع الاتصال وإعادة المصادقة' },
                { id: 'assets', name: '📋 جدول الأصول والمعدات والأجهزة', desc: 'سجل الأجهزة والتجهيزات' },
                { id: 'assets_delete', name: '🗑️ حذف سجلات الأصول والمعدات', desc: 'إزالة أجهزة من السجل' },
                { id: 'assets_price_edit', name: '💰 تعديل أسعار وتكلفة الأصول', desc: 'تغيير تكلفة الشراء والقيمة الحالية للأصل' }
            ]
        },
        {
            id: 'users_admin_management',
            name: '👥 إدارة المستخدمين والوكلاء والرتب',
            color: '#0f766e',
            items: [
                { id: 'admins_agents', name: '👁️ فتح إدارة المستخدمين', desc: 'عرض واجهة المستخدمين والوكلاء' },
                { id: 'admins_view', name: '🔍 مشاهدة بيانات المستخدمين', desc: 'البحث وعرض بيانات الحسابات التابعة' },
                { id: 'admins_add', name: '➕ إضافة مستخدم أو وكيل', desc: 'إنشاء حساب إداري أو نقطة بيع جديدة' },
                { id: 'admins_edit', name: '✏️ تعديل بيانات المستخدم', desc: 'تعديل الاسم والهاتف والحالة والبيانات' },
                { id: 'admins_delete', name: '🗑️ حذف مستخدم أو وكيل', desc: 'حذف الحساب ضمن التسلسل الإداري' },
                { id: 'admins_statement', name: '📑 كشف حساب المستخدم', desc: 'مشاهدة الحركات والمديونية والمبيعات' },
                { id: 'admins_permissions_edit', name: '🛡️ تعديل صلاحيات المستخدم', desc: 'منح أو منع عمليات خاصة بالحساب' },
                { id: 'admins_hierarchy_edit', name: '🌳 تعديل التبعية والرتبة', desc: 'نقل المستخدم وتغيير المشرف والرتبة' },
                { id: 'admins_financial_limits_edit', name: '💳 تعديل السقوف المالية', desc: 'تعديل الخصم والمديونية وحصة المخزون' }
            ]
        },
        {
            id: 'messages_notifications',
            name: '💬 إدارة الرسائل والواتساب والرد الآلي (Chatbot)',
            color: '#7c3aed',
            items: [
                { id: 'notifications', name: '👁️ فتح إدارة الرسائل والإشعارات', desc: 'عرض واجهة واتساب وتليجرام والإشعارات' },
                { id: 'whatsapp_manager', name: '📱 إدارة خادم واتساب وجلسات QR والربط', desc: 'ربط الجلسة ومتابعة الاتصال المباشر وفحص الخدمة' },
                { id: 'chatbot_manage', name: '🤖 إدارة وتشغيل الرد الآلي للشات بوت', desc: 'تفعيل/تعطيل الرد التفاعلي، تعديل رسالة الترحيب والدعم' },
                { id: 'chatbot_rules_edit', name: '✏️ تخصيص وإضافة قواعد الردود الذكية', desc: 'إضافة وتعديل وحذف الكلمات المفتاحية والردود التلقائية' },
                { id: 'message_queue_dispatch', name: '🚀 تفريغ واعتماد طابور الرسائل فورياً', desc: 'اعتماد وإرسال كافة الرسائل المعلقة بطابور الانتظار' },
                { id: 'notifications_logs_view', name: '📜 مشاهدة سجل الرسائل والإشعارات', desc: 'عرض الرسائل الصادرة والواردة والناجحة والفاشلة' },
                { id: 'notifications_send', name: '📤 إرسال رسالة مخصصة أو تعميم', desc: 'إرسال واتساب أو تليجرام فوري من النظام' },
                { id: 'notifications_resend', name: '🔁 إعادة إرسال الرسائل المتعثرة', desc: 'إعادة محاولة الرسائل المعلقة أو التي فشلت' },
                { id: 'notifications_delete', name: '🗑️ حذف الإشعارات وتنظيف السجلات', desc: 'حذف سجلات الإشعارات القديمة' },
                { id: 'notifications_settings', name: '⚙️ إعدادات قنوات الرسائل والقوالب', desc: 'تعديل خوادم الربط وقوالب الإرسال التلقائية' }
            ]
        },
        {
            id: 'system_admin',
            name: '🛡️ إدارة النظام، المستخدمين والأمان',
            color: '#34495e',
            items: [
                { id: 'admins_agents', name: '👔 إدارة المستخدمين والوكلاء والموزعين', desc: 'إضافة وتعديل حسابات المشرفين' },
                { id: 'roles_permissions', name: '🛡️ مصفوفة الرتب والصلاحيات (RBAC)', desc: 'تخصيص الصلاحيات والأدوار' },
                { id: 'ui_customizer', name: '🎨 تخصيص الواجهات واللوحات', desc: 'إعدادات الثيم والمؤشرات المخصصة' },
                { id: 'subscriber_portal', name: '📱 بوابة خدمة المشتركين والكرت', desc: 'خدمة العملاء والاستعلام المباشر' },
                { id: 'backups', name: '💾 النسخ الاحتياطي واستعادة البيانات', desc: 'توليد نسخ قواعد البيانات والأمان' }
            ]
        }
    ],

    departments: [
        {
            id: 'general',
            name: 'الإدارة العامة والرئيسية',
            icon: '🏠',
            color: '#0078d7',
            items: [
                { id: 'dashboard', name: 'الرئيسية والمؤشرات', icon: '📊' },
                { id: 'subscriber_portal', name: 'بوابة المشتركين والكرت', icon: '📱' }
            ]
        },
        {
            id: 'sales_dept',
            name: 'إدارة المبيعات والمشتريات',
            icon: '🛒',
            color: '#27ae60',
            items: [
                { id: 'sales', name: 'فواتير المبيعات ونقاط البيع (POS)', icon: '🛒' },
                { id: 'purchase_invoices', name: 'المشتريات وفواتير الموردين', icon: '🧾' },
                { id: 'instant_balance', name: 'الرصيد الفوري والمبيعات الرقمية', icon: '💳' }
            ]
        },
        {
            id: 'cards',
            name: 'إدارة الكروت والمخازن',
            icon: '🏢',
            color: '#8e44ad',
            items: [
                { id: 'card_warehouses', name: 'مخازن الكروت والعهد', icon: '🏢' },
                { id: 'users', name: 'كروت الانترنت والمشتركون', icon: '🎫' },
                { id: 'batch_gen', name: 'توليد الكروت بالدفعات', icon: '⚡' },
                { id: 'profiles', name: 'باقات وسرعات الخدمة', icon: '📦' },
                { id: 'free_vouchers', name: '🎁 الكروت المجانية و VIP', icon: '🎁' },
                { id: 'templates', name: 'تصاميم وقوالب الطباعة', icon: '🎨' }
            ]
        },
        {
            id: 'finance',
            name: 'المالية والمحاسبة والقيود',
            icon: '💰',
            color: '#d35400',
            items: [
                { id: 'exchange_rates', name: 'أسعار الصرف وتعدد العملات', icon: '💱' },
                { id: 'vouchers_fin', name: 'سندات القبض والصرف', icon: '🧾' },
                { id: 'cashbox_accounts', name: 'الصناديق والخزائن والحسابات', icon: '💰' },
                { id: 'chart_of_accounts', name: 'دليل وشجرة الحسابات', icon: '🏢' },
                { id: 'journal_entries', name: 'قيود اليومية العامة', icon: '📑' },
                { id: 'trial_balance', name: 'ميزان المراجعة والأستاذ', icon: '⚖️' },
                { id: 'cost_centers', name: 'مراكز التكلفة والراوترات', icon: '🎯' },
                { id: 'partners_equity', name: 'الشركاء وتوزيع الأرباح', icon: '👥' },
                { id: 'salaries_payroll', name: 'مسيرات ورواتب الموظفين', icon: '💵' },
                { id: 'operating_expenses', name: 'المصروفات التشغيلية والدورية', icon: '🧾' }
            ]
        },
        {
            id: 'reports_dept',
            name: 'التقارير والإحصائيات',
            icon: '📈',
            color: '#0284c7',
            items: [
                { id: 'sales_channel_reports', name: 'مبيعات القنوات ونقاط البيع', icon: '🏪' },
                { id: 'financial_reports', name: 'التقارير المالية وقوائم الأرباح (P&L)', icon: '📊' },
                { id: 'port_analytics', name: 'مبيعات واستهلاك المنافذ', icon: '🌐' },
                { id: 'reports_center', name: 'مركز التقارير والطباعة', icon: '🖨️' },
                { id: 'logs', name: 'سجلات العمليات والتدقيق', icon: '📜' }
            ]
        },
        {
            id: 'network',
            name: 'إدارة الشبكة والراوترات والأصول',
            icon: '📡',
            color: '#2980b9',
            items: [
                { id: 'routers', name: 'أجهزة الراوتر (NAS)', icon: '🌐' },
                { id: 'hotspot_designer', name: '🎨 إعداد وتخصيص صفحة الهوتسبوت', icon: '🎨' },
                { id: 'assets', name: 'إدارة الأصول ومعدات الشبكة', icon: '📡' },
                { id: 'network_nodes', name: 'هيكلية ونقاط الشبكة', icon: '🌳' },
                { id: 'sstp_vpn', name: 'خادم نفق SSTP VPN', icon: '🔒' },
                { id: 'noc', name: 'مراقبة الشبكة (NOC)', icon: '📊' },
                { id: 'active_sessions', name: 'الجلسات المباشرة المتصلة', icon: '🔴' }
            ]
        },
        {
            id: 'system',
            name: 'إدارة النظام والأمان والمستخدمين',
            icon: '🛡️',
            color: '#34495e',
            items: [
                { id: 'admins_agents', name: 'المستخدمون والوكلاء والموزعون', icon: '👔' },
                { id: 'roles_permissions', name: 'مصفوفة الرتب والصلاحيات (RBAC)', icon: '🛡️' },
                { id: 'notifications', name: 'إدارة الرسائل والتنبيهات (واتساب)', icon: '💬' },
                { id: 'whatsapp_manager', name: 'إدارة واعتماد قوالب الواتساب', icon: '📱' },
                { id: 'networks_partnerships', name: 'الشبكات والشراكات المتعددة', icon: '🌐' },
                { id: 'backups', name: 'النسخ الاحتياطي وتليجرام', icon: '💾' },
                { id: 'ui_customizer', name: 'تخصيص الواجهة واللوحة', icon: '🎨' }
            ]
        }
    ],

    currentTab: 'dashboard',

    // Filter & Grouping States for 5 Core Modules
    salesSearch: '',
    salesBuyerFilter: '',
    salesProfileFilter: '',
    salesPayStatusFilter: '',
    salesPayMethodFilter: '',
    salesStartDate: '',
    salesEndDate: '',
    salesPage: 1,
    salesLimit: 50,
    salesViewMode: 'invoices', // 'invoices' | 'by_buyer' | 'by_profile'

    adminsSearch: '',
    adminsRoleFilter: '',
    adminsActiveFilter: '',
    adminsParentFilter: '',
    adminsBalanceFilter: '',
    adminsViewMode: 'table', // 'table' | 'by_role'

    cashboxSearch: '',
    cashboxAccountFilter: '',
    cashboxTxTypeFilter: '',
    cashboxStartDate: '',
    cashboxEndDate: '',
    cashboxViewMode: 'summary', // 'summary' | 'debtors' | 'statement'

    vouchersSearch: '',
    vouchersTypeFilter: '',
    vouchersPartyFilter: '',
    vouchersMethodFilter: '',
    vouchersCategoryFilter: '',
    vouchersStartDate: '',
    vouchersEndDate: '',
    vouchersPage: 1,
    vouchersLimit: 50,
    vouchersViewMode: 'list', // 'list' | 'by_party' | 'by_category'

    assetsSearch: '',
    assetsCategoryFilter: '',
    assetsStatusFilter: '',
    assetsNodeFilter: '',
    assetsRouterFilter: '',
    assetsUserFilter: '',
    assetsViewMode: 'list', // 'list' | 'by_category' | 'by_node' | 'by_status'

    lang: localStorage.getItem('mt_lang') || 'ar',
    theme: localStorage.getItem('mt_theme') || 'light',
    user: null,
    userRole: 'superadmin',
    userPermissions: [],
    userFullname: '',
    adminId: 1,
    networks: [],
    activeNetwork: null,
    activeNetworkId: 0,
    selectedItems: new Set(),
    usersPage: 1,
    usersLimit: 50,
    activeRefreshTimer: null,

    // Active designer state
    designer: {
        template: null,
        selectedElement: 'username',
        isDragging: false,
        dragTarget: null,
        startX: 0,
        startY: 0
    },

    // Dynamic A4 Grid & Margins Calculations
    calcA4Dimensions(cols, rows, pageMargin = 2.0, cardGap = 0.5) {
        cols = Math.max(2, Math.min(6, parseInt(cols) || 4));
        rows = Math.max(5, Math.min(25, parseInt(rows) || 15));
        pageMargin = Math.max(0, Math.min(25, parseFloat(pageMargin) !== undefined && !isNaN(parseFloat(pageMargin)) ? parseFloat(pageMargin) : 5.0));
        cardGap = Math.max(0, Math.min(15, parseFloat(cardGap) !== undefined && !isNaN(parseFloat(cardGap)) ? parseFloat(cardGap) : 1.5));

        const availWidth = 210 - (2 * pageMargin);
        const availHeight = 297 - (2 * pageMargin);

        const widthMM = ((availWidth - ((cols - 1) * cardGap)) / cols).toFixed(1);
        const heightMM = ((availHeight - ((rows - 1) * cardGap)) / rows).toFixed(1);

        return {
            cols,
            rows,
            pageMargin,
            cardGap,
            totalCards: cols * rows,
            widthMM: parseFloat(widthMM),
            heightMM: parseFloat(heightMM),
            scaleFactor: Math.max(0.40, Math.min(1.2, parseFloat(heightMM) / 28.0))
        };
    },

    // Translations
    i18n: {
        ar: {
            app_title: 'SAM - نظام الإدارة الذكي',
            dashboard: 'لوحة التحكم',
            admins_agents: 'المستخدمين والصلاحيات',
            routers: 'الراوترات (NAS)',
            users: 'كروت الانترنت',
            batch_gen: 'توليد بالجملة',
            templates: 'مصمم قوالب الكروت',
            hotspot_designer: 'إعداد وتخصيص صفحة الهوتسبوت',
            sales: 'مبيعات الكروت والجملة',
            cashbox_accounts: 'الصندوق والحسابات',
            exchange_rates: 'أسعار الصرف وتعدد العملات',
            vouchers_fin: 'سندات القبض والصرف',
            assets: 'سجل الأصول والمعدات',
            chart_of_accounts: 'دليل وشجرة الحسابات',
            journal_entries: 'قيود اليومية العامة',
            trial_balance: 'ميزان المراجعة والأستاذ',
            cost_centers: 'مراكز التكلفة والراوترات',
            partners_equity: 'الشركاء وتوزيع الأرباح',
            salaries_payroll: 'مسيرات ورواتب الموظفين',
            financial_reports: 'التقارير المالية والأرباح',
            print_cards: 'طباعة الكروت',
            profiles: 'الملفات الشخصية (Profiles)',
            active_sessions: 'الجلسات النشطة',
            logs: 'السجلات والمحاسبة',
            add: 'إضافة',
            edit: 'تعديل',
            remove: 'حذف',
            enable: 'تفعيل',
            disable: 'تعطيل',
            refresh: 'تحديث',
            search: 'بحث...',
            filter_profile: 'كل الباقات',
            filter_status: 'كل الحالات',
            status_active: 'نشط',
            status_disabled: 'معطل',
            status_online: 'متصل الآن',
            total_users: 'إجمالي كروت الانترنت',
            online_now: 'المتصلين حالياً',
            total_routers: 'الراوترات المتصلة',
            today_traffic: 'استهلاك اليوم',
            radius_status: 'حالة FreeRADIUS',
            running: 'يعمل بنجاح',
            stopped: 'متوقف',
            restart_service: 'إعادة تشغيل الخادم',
            disconnect: 'طرد وفصل فوري',
            username: 'اسم المستخدم',
            password: 'كلمة المرور',
            profile: 'الباقة',
            ip_address: 'عنوان IP',
            mac_address: 'عنوان MAC',
            uptime: 'وقت الاتصال',
            download: 'التحميل',
            upload: 'الرفع',
            total_traffic: 'الإجمالي',
            actions: 'الإجراءات',
            save: 'حفظ',
            cancel: 'إلغاء',
            generate: 'توليد الكروت',
            count: 'العدد',
            prefix: 'البادئة (Prefix)',
            length: 'طول الكرت',
            price: 'السعر',
            comment: 'ملاحظة',
            confirm_delete: 'هل أنت متأكد من الحذف؟',
            confirm_disconnect: 'هل تريد قطع اتصال هذا المستخدم فورياً؟',
            success_gen: 'تم توليد الكروت بنجاح!',
            success_saved: 'تم الحفظ بنجاح!',
            success_deleted: 'تم الحذف بنجاح!',
            success_disconnected: 'تم إرسال طلب قطع الاتصال بنجاح!',
            login_title: 'تسجيل الدخول - SAM',
            login_btn: 'دخول',
            logout: 'تسجيل الخروج',
            rate_limit: 'السرعة (Upload/Download)',
            validity: 'الصلاحية',
            shared_users: 'الأجهزة المتزامنة',
            usage_details: 'بيانات الاستهلاك والجلسات',
            export_pdf: '📄 تصدير ملف PDF جاهز',
            print_a4: '🖨️ طباعة A4 فورية'
        },
        en: {
            app_title: 'SAM - Smart Management System',
            dashboard: 'Dashboard',
            admins_agents: 'Users & Permissions',
            routers: 'Routers (NAS)',
            users: 'Users / Vouchers',
            batch_gen: 'Batch Generator',
            templates: 'Card Designer',
            sales: 'Wholesale & POS Sales',
            cashbox_accounts: 'Cashbox & Accounts',
            exchange_rates: 'Exchange Rates & Currencies',
            vouchers_fin: 'Receipt & Payment Vouchers',
            assets: 'Fixed Assets Register',
            chart_of_accounts: 'Chart of Accounts',
            journal_entries: 'General Journal Entries',
            trial_balance: 'Trial Balance & Ledger',
            cost_centers: 'Cost Centers & Routers',
            partners_equity: 'Partners Equity & Profit Sharing',
            financial_reports: 'Financial Reports & P&L',
            print_cards: 'Print Vouchers',
            profiles: 'Profiles',
            active_sessions: 'Active Sessions',
            logs: 'Logs & Accounting',
            add: 'Add',
            edit: 'Edit',
            remove: 'Remove',
            enable: 'Enable',
            disable: 'Disable',
            refresh: 'Refresh',
            search: 'Search...',
            filter_profile: 'All Profiles',
            filter_status: 'All Status',
            status_active: 'Active',
            status_disabled: 'Disabled',
            status_online: 'Online',
            total_users: 'Total Users / Cards',
            online_now: 'Online Now',
            total_routers: 'Active Routers',
            today_traffic: 'Today Traffic',
            radius_status: 'FreeRADIUS Status',
            running: 'Running',
            stopped: 'Stopped',
            restart_service: 'Restart RADIUS',
            disconnect: 'Disconnect (CoA)',
            username: 'Username',
            password: 'Password',
            profile: 'Profile',
            ip_address: 'IP Address',
            mac_address: 'MAC Address',
            uptime: 'Uptime',
            download: 'Download',
            upload: 'Upload',
            total_traffic: 'Total Traffic',
            actions: 'Actions',
            save: 'Save',
            cancel: 'Cancel',
            generate: 'Generate Vouchers',
            count: 'Count',
            prefix: 'Prefix',
            length: 'Length',
            price: 'Price',
            comment: 'Comment',
            confirm_delete: 'Are you sure you want to delete?',
            confirm_disconnect: 'Disconnect this active session immediately via CoA?',
            success_gen: 'Vouchers generated successfully!',
            success_saved: 'Saved successfully!',
            success_deleted: 'Deleted successfully!',
            success_disconnected: 'Disconnect request sent successfully!',
            login_title: 'Sign In - User Manager ERP',
            login_btn: 'Sign In',
            logout: 'Sign Out',
            rate_limit: 'Rate Limit (Rx/Tx)',
            validity: 'Validity',
            shared_users: 'Shared Users',
            usage_details: 'Usage & Sessions',
            export_pdf: '📄 Export Ready PDF',
            print_a4: '🖨️ Print A4'
        }
    },

    t(key) {
        if (!this.lang) this.lang = 'ar';
        if (this.i18n && this.i18n[this.lang] && this.i18n[this.lang][key]) return this.i18n[this.lang][key];
        if (this.i18n && this.i18n.ar && this.i18n.ar[key]) return this.i18n.ar[key];
        return key;
    },

    
    // ==========================================
    // 13. NOTIFICATIONS SYSTEM & REAL-TIME ALERTS ENGINE
    // ==========================================
    _audioCtx: null,
    _audioUnlocked: false,
    _notifPollerInterval: null,
    _lastSeenNotifId: 0,
    _lastUnreadCount: 0,
    _notifsCache: [],
    _notifFilter: 'all',

    initAudioUnlock() {
        if (this._audioUnlocked) return;
        const unlock = () => {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    if (!this._audioCtx) this._audioCtx = new AudioCtx();
                    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
                }
            } catch(e) {}
            this._audioUnlocked = true;
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('keydown', unlock);
        };
        window.addEventListener('click', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
    },

    playNotificationSound(type = 'default') {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!this._audioCtx) this._audioCtx = new AudioCtx();
            if (this._audioCtx.state === 'suspended') this._audioCtx.resume();

            const ctx = this._audioCtx;
            const now = ctx.currentTime;

            if (type === 'alert' || type === 'danger' || type === 'error') {
                // Double high alert chirp (Warning / Security alert)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1174.66, now + 0.12);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.35);
            } else if (type === 'voucher' || type === 'financial' || type === 'success') {
                // Melodic chord chime (Sales, Vouchers, Financial)
                const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
                freqs.forEach((f, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(f, now + idx * 0.08);
                    gain.gain.setValueAtTime(0.15, now + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.08);
                    osc.stop(now + idx * 0.08 + 0.35);
                });
            } else {
                // Smooth two-tone modern notification chime
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(659.25, now);
                osc.frequency.setValueAtTime(880, now + 0.12);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            }
        } catch(e) {
            console.warn('Audio play error:', e);
        }
    },

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                Notification.requestPermission();
            } catch(e) {}
        }
    },

    startNotificationPoller(intervalMs = 25000) {
        if (this._notifPollerInterval) {
            clearInterval(this._notifPollerInterval);
        }
        this.initAudioUnlock();
        this.checkUnreadNotifications(true);
        this._notifPollerInterval = setInterval(() => {
            if (this.user) {
                this.checkUnreadNotifications(false);
            }
        }, intervalMs);
    },

    stopNotificationPoller() {
        if (this._notifPollerInterval) {
            clearInterval(this._notifPollerInterval);
            this._notifPollerInterval = null;
        }
    },

    async checkUnreadNotifications(isBaseline = false) {
        if (!this.user) return;
        try {
            const res = await this.api('get_notifications', { role: this.userRole, admin_id: this.adminId });
            if (!res) return;
            const notifs = res.notifications || [];
            const unread = (typeof res.unread_count === 'number') ? res.unread_count : notifs.filter(n => !n.is_read).length;
            this._notifsCache = notifs;

            const badge = document.getElementById('notif-count-badge');
            if (badge) {
                badge.innerText = unread;
                badge.style.display = unread > 0 ? 'inline-block' : 'none';
            }

            let maxId = 0;
            notifs.forEach(n => {
                const nid = parseInt(n.id) || 0;
                if (nid > maxId) maxId = nid;
            });

            if (isBaseline || !this._lastSeenNotifId) {
                this._lastSeenNotifId = maxId;
                this._lastUnreadCount = unread;
                return;
            }

            const newNotifs = notifs.filter(n => (parseInt(n.id) || 0) > this._lastSeenNotifId);
            if (newNotifs.length > 0 || unread > (this._lastUnreadCount || 0)) {
                this._lastSeenNotifId = Math.max(maxId, this._lastSeenNotifId);
                this._lastUnreadCount = unread;

                const latest = newNotifs[0] || notifs[0];
                const soundCat = latest?.category || 'default';
                this.playNotificationSound(soundCat);

                if (latest) {
                    const titleText = latest.title || 'إشعار جديد';
                    const bodyText = latest.message || '';
                    this.toast(`${titleText}: ${bodyText}`, latest.category === 'alert' ? 'danger' : 'info');

                    // Native Android App Bridge Notification
                    if (window.AndroidBridge && typeof window.AndroidBridge.postNotification === 'function') {
                        try {
                            window.AndroidBridge.postNotification(titleText, bodyText);
                        } catch(e) {}
                    }

                    // Web Browser Notification API
                    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                        try {
                            new Notification(`SAM: ${titleText}`, {
                                body: bodyText,
                                icon: 'assets/img/log.png'
                            });
                        } catch(e) {}
                    }
                }
            } else {
                this._lastUnreadCount = unread;
            }
        } catch(e) {
            console.warn('Check notifications error:', e);
        }
    },

    formatRelativeTime(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr.replace(/-/g, '/'));
            const now = new Date();
            const diffSec = Math.floor((now - date) / 1000);
            if (isNaN(diffSec)) return dateStr;
            if (diffSec < 60) return 'الآن';
            if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
            if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
            if (diffSec < 172800) return 'أمس ' + dateStr.substring(11, 16);
            return dateStr.substring(0, 16);
        } catch (e) {
            return dateStr;
        }
    },

    updateNotifBadge() {
        const unread = (this._notifsCache || []).filter(n => !n.is_read).length;
        const badge = document.getElementById('notif-count-badge');
        if (badge) {
            badge.innerText = unread;
            badge.style.display = unread > 0 ? 'inline-block' : 'none';
        }
    },

    async showNotificationsModal() {
        this.openModal(`
            <div style="padding:35px; text-align:center; color:#64748b;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px; color:#3b82f6;"></i>
                <div style="margin-top:12px; font-weight:600; font-size:14px;">جاري جلب وتحديث الإشعارات والتنبيهات...</div>
            </div>
        `, '760px');

        try {
            const res = await this.api('get_notifications', { role: this.userRole, admin_id: this.adminId });
            this._notifsCache = res?.notifications || [];
            this._notifFilter = 'all';
            this.updateNotifBadge();
            this.renderNotificationsModalContent();
        } catch(e) {
            this.openModal(`
                <div style="padding:25px; text-align:center; color:#ef4444;">
                    <div style="font-size:20px; margin-bottom:8px;">⚠️ تعذر جلب الإشعارات</div>
                    <button class="mt-btn mt-btn-primary" onclick="App.showNotificationsModal()">إعادة المحاولة</button>
                    <button class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            `);
        }
    },

    setNotifFilter(filter) {
        this._notifFilter = filter;
        this.renderNotificationsModalContent();
    },

    renderNotificationsModalContent() {
        const notifs = this._notifsCache || [];
        const total = notifs.length;
        const unreadCount = notifs.filter(n => !n.is_read).length;
        const filter = this._notifFilter || 'all';

        const categoryIcons = {
            alert: '🚨',
            financial: '💰',
            performance: '📊',
            voucher: '🎁',
            system: '⚙️'
        };

        const categoryLabels = {
            alert: 'تنبيه أمان ومخاطر',
            financial: 'مالية وحسابات',
            performance: 'أداء وشبكة',
            voucher: 'كروت ومخزون',
            system: 'نظام وإعلانات'
        };

        const categoryColors = {
            alert: '#ef4444',
            financial: '#10b981',
            performance: '#38bdf8',
            voucher: '#8b5cf6',
            system: '#64748b'
        };

        const filtered = notifs.filter(n => {
            if (filter === 'all') return true;
            if (filter === 'unread') return !n.is_read;
            return n.category === filter;
        });

        const filterCounts = {
            all: total,
            unread: unreadCount,
            voucher: notifs.filter(n => n.category === 'voucher').length,
            financial: notifs.filter(n => n.category === 'financial').length,
            alert: notifs.filter(n => n.category === 'alert').length,
            system: notifs.filter(n => n.category === 'system' || n.category === 'performance').length
        };

        const modalHtml = `
            <div style="padding:4px 2px;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">🔔</span>
                        <div>
                            <div style="font-weight:700; font-size:16px; color:#1e293b;">مركز الإشعارات والتنبيهات</div>
                            <div style="font-size:11.5px; color:#64748b;">
                                إجمالي: <b id="notif-total-text">${total}</b> | غير مقروء: <b id="notif-unread-text" style="color:${unreadCount > 0 ? '#ef4444' : '#10b981'};">${unreadCount}</b>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        ${unreadCount > 0 ? `
                        <button class="mt-btn" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; font-size:11.5px; padding:4px 10px; border-radius:6px;" onclick="App.markAllNotificationsRead()" title="تحديد جميع الإشعارات كمقروءة">
                            🧹 تعليم الكل كمقروء
                        </button>` : ''}
                        <button class="mt-btn mt-btn-success" style="font-weight:700; font-size:11.5px; padding:4px 12px; border-radius:6px;" onclick="App.showCreateNotificationModal()" title="إرسال إشعار أو تعميم جديد">
                            ➕ إنشاء تعميم جديد
                        </button>
                        ${total > 0 ? `
                        <button class="mt-btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:11.5px; padding:4px 10px; border-radius:6px;" onclick="App.clearAllNotifications()" title="مسح جميع الإشعارات">
                            🗑️ مسح الكل
                        </button>` : ''}
                        <button class="mt-btn" style="background:#e2e8f0; color:#334155; font-size:12px; padding:4px 12px; border-radius:6px; font-weight:700;" onclick="App.closeModal()">✕ إغلاق</button>
                    </div>
                </div>

                <!-- Tabs Filter -->
                <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:12px; border-bottom:1px solid #f1f5f9;">
                    <button class="mt-btn ${filter === 'all' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px;" onclick="App.setNotifFilter('all')">
                        📑 الكل (${filterCounts.all})
                    </button>
                    <button class="mt-btn ${filter === 'unread' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px; ${unreadCount > 0 ? 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5;' : ''}" onclick="App.setNotifFilter('unread')">
                        🔴 غير مقروء (${filterCounts.unread})
                    </button>
                    <button class="mt-btn ${filter === 'voucher' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px;" onclick="App.setNotifFilter('voucher')">
                        🎁 الكروت والمخزون (${filterCounts.voucher})
                    </button>
                    <button class="mt-btn ${filter === 'financial' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px;" onclick="App.setNotifFilter('financial')">
                        💰 المالية (${filterCounts.financial})
                    </button>
                    <button class="mt-btn ${filter === 'alert' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px;" onclick="App.setNotifFilter('alert')">
                        🚨 تنبيهات وأمان (${filterCounts.alert})
                    </button>
                    <button class="mt-btn ${filter === 'system' ? 'mt-btn-primary' : ''}" style="font-size:11.5px; padding:4px 10px; border-radius:20px;" onclick="App.setNotifFilter('system')">
                        ⚙️ النظام (${filterCounts.system})
                    </button>
                </div>

                <!-- Notifications List -->
                <div id="notifs-container-list" style="max-height:430px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px;">
                    ${filtered.map(n => `
                        <div id="notif-item-${n.id}" class="notif-card" style="background:${n.is_read ? '#ffffff' : '#f8fafc'}; border:1px solid ${n.is_read ? '#e2e8f0' : '#cbd5e1'}; border-right:5px solid ${categoryColors[n.category] || '#64748b'}; border-radius:10px; padding:12px 14px; box-shadow:0 1px 4px rgba(0,0,0,0.04); transition:all 0.25s ease; position:relative;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                                <div style="flex:1;">
                                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                                        <span style="font-size:15px;">${categoryIcons[n.category] || '📌'}</span>
                                        <span style="font-weight:700; font-size:13.5px; color:#0f172a;">${n.title}</span>
                                        <span style="font-size:10px; padding:2px 7px; border-radius:12px; background:${categoryColors[n.category] || '#64748b'}20; color:${categoryColors[n.category] || '#64748b'}; font-weight:700;">
                                            ${categoryLabels[n.category] || n.category || 'عام'}
                                        </span>
                                        ${!n.is_read ? '<span class="badge" style="background:#ef4444; color:#fff; font-size:9.5px; padding:1px 6px; border-radius:10px; font-weight:700; animation:pulse 2s infinite;">جديد</span>' : ''}
                                    </div>
                                    <div style="color:#334155; font-size:12.5px; line-height:1.6; margin-top:4px; word-break:break-word;">
                                        ${n.message}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:12px; margin-top:8px; font-size:11px; color:#94a3b8;">
                                        <span>🕒 ${this.formatRelativeTime(n.created_at)}</span>
                                        <span style="opacity:0.7;">(${n.created_at})</span>
                                    </div>
                                </div>

                                <!-- Actions on Card -->
                                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0;">
                                    <button type="button" class="mt-btn" style="background:#f1f5f9; border:1px solid #e2e8f0; color:#64748b; width:26px; height:26px; border-radius:50%; padding:0; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'; this.style.color='#ef4444'; this.style.borderColor='#fca5a5';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b'; this.style.borderColor='#e2e8f0';" onclick="App.deleteNotificationItem(${n.id})" title="إغلاق وحذف الإشعار">
                                        ✕
                                    </button>
                                    ${!n.is_read ? `
                                    <button type="button" class="mt-btn" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:10.5px; padding:2px 8px; border-radius:6px; cursor:pointer; font-weight:600;" onclick="App.markNotificationAsRead(${n.id})" title="تمييز كمقروء">
                                        ✓ مقروء
                                    </button>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}

                    ${filtered.length === 0 ? `
                        <div style="text-align:center; padding:32px 18px; color:#94a3b8; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                            <div style="font-size:36px; margin-bottom:6px;">🔔</div>
                            <div style="font-weight:700; font-size:14.5px; color:#334155;">لا توجد إشعارات حالياً في هذا القسم</div>
                            <div style="font-size:12px; color:#64748b; margin-top:4px; max-width:480px; margin-left:auto; margin-right:auto; line-height:1.5;">
                                يستقبل هذا المركز التنبيهات النظامية الفورية (انقطاع الراوترات، نفاد المخزون، الحركات المالية، وتحديثات الخادم)، كما يتيح لك بث تعميمات ورسائل إدارية للمشرفين والوكلاء.
                            </div>
                            <div style="margin-top:14px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                                <button class="mt-btn mt-btn-primary" style="font-size:11.5px; padding:5px 14px; font-weight:700;" onclick="App.showCreateNotificationModal()">➕ إنشاء تعميم / إشعار إداري الآن</button>
                                <button class="mt-btn" style="font-size:11.5px; padding:5px 12px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;" onclick="App.closeModal(); App.switchTab('notifications');">⚙️ إعدادات قنوات التنبيهات</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        this.openModal(modalHtml, '760px');
    },

    async markNotificationAsRead(id) {
        try {
            await this.api('mark_notification_read', { id });
            const item = (this._notifsCache || []).find(n => n.id == id);
            if (item) {
                item.is_read = 1;
            }
            this.updateNotifBadge();
            this.renderNotificationsModalContent();
        } catch(e) {
            this.toast('تعذر تحديث حالة الإشعار', 'danger');
        }
    },

    async deleteNotificationItem(id) {
        const el = document.getElementById(`notif-item-${id}`);
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'scale(0.92) translateX(20px)';
            el.style.maxHeight = '0';
            el.style.padding = '0';
            el.style.margin = '0';
            el.style.overflow = 'hidden';
        }

        try {
            await this.api('delete_notification', { id });
            this._notifsCache = (this._notifsCache || []).filter(n => n.id != id);
            this.updateNotifBadge();
            setTimeout(() => {
                this.renderNotificationsModalContent();
            }, 250);
        } catch(e) {
            this.toast('تعذر حذف الإشعار', 'danger');
            this.renderNotificationsModalContent();
        }
    },

    async markAllNotificationsRead() {
        try {
            await this.api('mark_all_notifications_read', { role: this.userRole, admin_id: this.adminId });
            (this._notifsCache || []).forEach(n => n.is_read = 1);
            this.updateNotifBadge();
            this.renderNotificationsModalContent();
            this.toast('تم تعليم جميع الإشعارات كمقروءة ✓', 'success');
        } catch(e) {
            this.toast('تعذر تحديث الإشعارات', 'danger');
        }
    },

    async clearAllNotifications() {
        if (!confirm('هل أنت متأكد من مسح وحذف جميع الإشعارات والتنبيهات؟')) return;
        try {
            await this.api('clear_all_notifications', { role: this.userRole, admin_id: this.adminId });
            this._notifsCache = [];
            this.updateNotifBadge();
            this.renderNotificationsModalContent();
            this.toast('تم مسح جميع الإشعارات بنجاح 🗑️', 'success');
        } catch(e) {
            this.toast('تعذر مسح الإشعارات', 'danger');
        }
    },
    async showCreateNotificationModal() {
        let admins = [];
        try {
            const adminsRes = await this.api('get_admins');
            admins = Array.isArray(adminsRes) ? adminsRes : (adminsRes?.admins || []);
        } catch(e) {
            console.error('تعذر تحميل قائمة الإداريين لإنشاء الإشعار:', e);
            this.toast?.('تعذر تحميل قائمة الإداريين؛ تحقق من الاتصال ثم حاول مرة أخرى.', 'warning');
        }

        const modalHtml = `
        <div class="mt-modal-backdrop" id="create-notif-modal-backdrop" onclick="if(event.target===this) document.getElementById('create-notif-modal-backdrop').remove()" style="z-index:10050;">
            <div class="mt-modal" style="width:560px; max-width:95vw; border-radius:12px; overflow:hidden; box-shadow:0 16px 40px rgba(0,0,0,0.35);">
                <div class="mt-modal-header" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; font-size:14px; display:flex; align-items:center; gap:8px;">
                        <span>📢</span> <span>إنشاء وبث تعميم / إشعار إداري</span>
                    </span>
                    <span style="cursor:pointer; font-size:18px;" onclick="document.getElementById('create-notif-modal-backdrop').remove()">✕</span>
                </div>
                <form onsubmit="App.submitCreateNotification(event)">
                    <div class="mt-modal-body" style="padding:16px; display:flex; flex-direction:column; gap:12px;">
                        
                        <div class="form-row" style="display:flex; gap:10px; margin-bottom:0;">
                            <div class="form-group" style="flex:1; margin-bottom:0;">
                                <label style="font-weight:700; font-size:12px;">تصنيف الإشعار:</label>
                                <select id="new-notif-category" class="mt-select" style="width:100%; font-size:12px;">
                                    <option value="system">⚙️ إعلان ونظام (System)</option>
                                    <option value="alert">🚨 تنبيه أمان ومخاطر (Alert)</option>
                                    <option value="financial">💰 مالية وحسابات (Financial)</option>
                                    <option value="voucher">🎁 كروت ومخزون (Vouchers)</option>
                                    <option value="performance">📊 أداء وشبكة (Performance)</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1; margin-bottom:0;">
                                <label style="font-weight:700; font-size:12px;">الفئة المستهدفة:</label>
                                <select id="new-notif-target-role" class="mt-select" style="width:100%; font-size:12px;" onchange="document.getElementById('new-notif-admin-box').style.display = (this.value==='specific') ? 'block' : 'none';">
                                    <option value="all">🌐 كافة المستخدمين والمشرفين</option>
                                    <option value="system_owner">👑 مالك النظام فقط</option>
                                    <option value="superadmin">👔 الإدارة العليا فقط</option>
                                    <option value="pos">🏪 نقاط البيع والوكلاء فقط</option>
                                    <option value="specific">👤 مستخدم / مشرف محدد</option>
                                </select>
                            </div>
                        </div>

                        <div id="new-notif-admin-box" class="form-group" style="display:none; margin-bottom:0;">
                            <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">المستخدم المحدد: <span style="color:red;">*</span></label>
                            <div style="position:relative;">
                                <input type="text" list="new-notif-admin-list" id="new-notif-admin-input" class="mt-input" style="width:100%; font-size:12.5px; font-weight:700;" placeholder="🔍 ابحث بالاسم، اليوزر، أو رقم الهاتف أو اختر..." oninput="App.syncAdminCombobox(this, 'new-notif-admin-id', 'new-notif-admin-list')" onchange="App.syncAdminCombobox(this, 'new-notif-admin-id', 'new-notif-admin-list')" />
                                <input type="hidden" id="new-notif-admin-id" value="" />
                                <datalist id="new-notif-admin-list">
                                    ${admins.map(a => `<option data-id="${a.id}" data-search="${this.escape(((a.fullname||'') + ' ' + (a.username||'') + ' ' + (a.phone||'') + ' ' + (a.role_name_ar||a.role||'')).toLowerCase())}" value="${this.escape(a.fullname || a.username)} (@${this.escape(a.username)}) - [${this.escape(a.role_name_ar || a.role)}]">${this.escape(a.fullname || a.username)} (@${this.escape(a.username)})</option>`).join('')}
                                </datalist>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom:0;">
                            <label style="font-weight:700; font-size:12px;">عنوان الإشعار أو التعميم:</label>
                            <input type="text" id="new-notif-title" class="mt-input" style="width:100%; font-size:13px; font-weight:bold;" placeholder="مثال: تنويه بأعمال صيانة السيرفر المركزي الليلة" required />
                        </div>

                        <div class="form-group" style="margin-bottom:0;">
                            <label style="font-weight:700; font-size:12px;">نص التعميم / الرسالة بالتفصيل:</label>
                            <textarea id="new-notif-message" class="mt-input" style="width:100%; min-height:100px; font-size:12.5px; line-height:1.5; padding:10px;" placeholder="اكتب نص الإشعار هنا وسيظهر فوراً في جرس الإشعارات لكافة الحسابات المستهدفة..." required></textarea>
                        </div>

                    </div>
                    <div class="mt-modal-footer" style="padding:12px 16px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <button type="button" class="mt-btn" onclick="document.getElementById('create-notif-modal-backdrop').remove()">إلغاء</button>
                        <button type="submit" class="mt-btn mt-btn-success" style="font-weight:bold; padding:6px 20px;">📢 نشر وإرسال التعميم الآن</button>
                    </div>
                </form>
            </div>
        </div>
        `;

        const old = document.getElementById('create-notif-modal-backdrop');
        if (old) old.remove();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
    },

    async submitCreateNotification(e) {
        if (e) e.preventDefault();
        const category = document.getElementById('new-notif-category')?.value || 'system';
        const targetRole = document.getElementById('new-notif-target-role')?.value || 'all';
        const targetAdminId = (targetRole === 'specific') ? document.getElementById('new-notif-admin-id')?.value : null;
        const title = document.getElementById('new-notif-title')?.value?.trim();
        const message = document.getElementById('new-notif-message')?.value?.trim();

        if (!title || !message) {
            this.toast('يرجى كتابة عنوان ونص الإشعار', 'warning');
            return;
        }

        try {
            const res = await this.api('create_notification', {
                category,
                title,
                message,
                target_role: (targetRole === 'specific') ? 'all' : targetRole,
                target_admin_id: targetAdminId
            }, 'POST');

            if (res && res.success) {
                this.toast('✅ تم نشر التعميم بنجاح ووصل لجميع المستهدفين!', 'success');
                document.getElementById('create-notif-modal-backdrop')?.remove();
                if (this.showNotificationsModal) {
                    await this.showNotificationsModal();
                }
            } else {
                this.toast(res?.error || 'تعذر إنشاء الإشعار', 'danger');
            }
        } catch(err) {
            this.toast('حدث خطأ أثناء حفظ الإشعار: ' + (err.message || err), 'danger');
        }
    },


    renderSubscriberPortal() {
        const view = document.getElementById('main-view');
        if (!view) return;

        const PB = window.SamUI?.PageBuilder;

        const actions = [
            { label: '👥 المشتركون والكروت', variant: 'primary', onclick: "App.switchTab('users')" },
            { label: '💳 الكروت ومخازنها', variant: 'secondary', onclick: "App.switchTab('card_warehouses')" },
            { label: '🔗 فتح بوابة الهوتسبوت المستقلة', variant: 'secondary', onclick: "window.open('portal.html', '_blank')" }
        ];

        const contentHtml = `
        <div style="padding:14px 16px; max-width:680px; margin:0 auto; width:100%;">
            <!-- Top Admin Switcher Bar (Compact) -->
            <div style="background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border, #e2e8f0); border-radius:12px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:240px;">
                    <span style="font-size:16px;">💳</span>
                    <input type="text" id="admin-portal-code" class="mt-input sam-input" style="flex:1; font-weight:bold; font-size:14px; height:36px;" placeholder="أدخل رقم كرت للاستعلام (مثال: 5032405647)" onkeydown="if(event.key==='Enter') App.inspectCardInPortal()" />
                    <button class="mt-btn mt-btn-primary" style="padding:0 14px; height:36px; font-weight:bold;" onclick="App.inspectCardInPortal()">🔍 فحص</button>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="mt-btn" style="height:36px; padding:0 12px; font-size:12px;" onclick="App.refreshPortalCard()" title="تحديث بيانات الكرت">🔄 تحديث</button>
                    <button class="mt-btn" style="height:36px; padding:0 10px; font-size:12px;" onclick="window.open('portal.html', '_blank')" title="فتح نافذة خارجية">🌐</button>
                </div>
            </div>

            <!-- Loading Spinner -->
            <div id="admin-portal-loading" style="display:none; text-align:center; padding:30px 0; color:#0284c7; font-weight:bold;">
                <div style="display:inline-block; width:32px; height:32px; border:3px solid rgba(2,132,199,0.2); border-top-color:#0284c7; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:8px;"></div>
                <div>جاري تحميل بيانات وحالة الكرت الحية...</div>
            </div>

            <!-- Main Hotspot-Styled Card Portal Shell -->
            <div id="admin-portal-result" style="display:flex; flex-direction:column; gap:14px;">
                <!-- Brand Header -->
                <div style="background:linear-gradient(180deg, #0b1120 0%, #151f32 100%); border:1px solid #23334d; border-radius:18px; padding:20px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.25); color:#f8fafc;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:58px; height:58px; border-radius:16px; background:rgba(255,255,255,0.05); border:1px solid #23334d; margin-bottom:8px; font-size:26px;">
                        📶
                    </div>
                    <h2 id="ap-brand-title" style="font-size:20px; font-weight:900; color:#fff; margin-bottom:2px;">شبكة خدمات الإنترنت (Hotspot Portal)</h2>
                    <p id="ap-brand-slogan" style="font-size:12px; color:#94a3b8; margin-bottom:8px;">إنترنت فائق السرعة واستقرار عالي</p>
                    <div style="display:inline-flex; align-items:center; gap:6px; padding:4px 14px; border-radius:999px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); color:#34d399; font-size:11px; font-weight:700;">
                        <span style="width:7px; height:7px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981;"></span>
                        <span id="ap-conn-badge">متصل بالشبكة بنجاح 🟢</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); font-size:12px;">
                        <span id="ap-card-num-chip" style="font-family:monospace; font-weight:bold; color:#38bdf8; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.3); padding:3px 10px; border-radius:6px;">كرت: ---</span>
                        <span id="ap-profile-badge" style="background:#0284c7; color:#fff; padding:3px 10px; border-radius:6px; font-weight:bold;">الباقة: افتراضية</span>
                    </div>

                    <!-- Circular Progress Gauge -->
                    <div style="position:relative; width:150px; height:150px; margin:16px auto 10px; display:flex; align-items:center; justify-content:center;">
                        <svg viewBox="0 0 160 160" style="transform:rotate(-90deg); width:150px; height:150px;">
                            <circle cx="80" cy="80" r="68" fill="none" stroke="#1e293b" stroke-width="10" />
                            <circle id="ap-balance-ring" cx="80" cy="80" r="68" fill="none" stroke="#38bdf8" stroke-width="10" stroke-linecap="round" stroke-dasharray="427" stroke-dashoffset="0" style="transition:stroke-dashoffset 1s ease;" />
                        </svg>
                        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                            <div id="ap-rem" style="font-size:22px; font-weight:900; color:#38bdf8; direction:ltr; letter-spacing:-0.5px;">-- MB</div>
                            <div style="font-size:11px; color:#94a3b8; font-weight:600;">الرصيد المتبقي</div>
                            <div id="ap-percent" style="font-size:11px; color:#34d399; font-weight:800; margin-top:2px;">100% متبقي</div>
                        </div>
                    </div>

                    <!-- 3 Stats Pills -->
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); text-align:center;">
                        <div style="background:#0b1322; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 4px;">
                            <div style="font-size:10.5px; color:#94a3b8; margin-bottom:2px;">الاستهلاك</div>
                            <div id="ap-consumed" style="font-size:13px; font-weight:800; color:#fff; direction:ltr;">0 MB</div>
                        </div>
                        <div style="background:#0b1322; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 4px;">
                            <div style="font-size:10.5px; color:#94a3b8; margin-bottom:2px;">الصلاحية</div>
                            <div id="ap-validity-val" style="font-size:12px; font-weight:800; color:#fff;">--</div>
                        </div>
                        <div style="background:#0b1322; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 4px;">
                            <div style="font-size:10.5px; color:#94a3b8; margin-bottom:2px;">الوقت المتبقي</div>
                            <div id="ap-uptime-val" style="font-size:12px; font-weight:800; color:#fff;">غير محدود</div>
                        </div>
                    </div>
                </div>

                <!-- Speed Control Card (CoA) -->
                <div style="background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border, #e2e8f0); border-radius:14px; padding:16px; box-shadow:0 4px 15px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h3 style="font-size:14px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px; margin:0;">
                            <span>⚡</span> <span>سرعة الكرت والتحكم الفوري (CoA)</span>
                        </h3>
                        <span id="ap-current-speed-badge" class="mt-badge" style="background:#0284c7; color:#fff; font-size:11px; padding:3px 8px;">السرعة الحالية: قياسية</span>
                    </div>
                    <p style="font-size:11.5px; color:var(--text-secondary, #64748b); margin-bottom:10px;">انقر على السرعة لتطبيقها فوراً على الراوتر دون فصل اتصال المشترك:</p>
                    <div id="ap-speed-buttons" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px;">
                        <!-- Injected dynamically -->
                    </div>
                </div>

                <!-- MAC Lock & Device Limit Card -->
                <div style="background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border, #e2e8f0); border-radius:14px; padding:16px; box-shadow:0 4px 15px rgba(0,0,0,0.03); display:flex; flex-direction:column; gap:12px;">
                    <!-- MAC Lock -->
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div>
                            <div style="font-weight:800; font-size:13px; color:var(--text-primary, #0f172a);">🔒 تثبيت الجهاز لمنع السرقة (MAC Lock):</div>
                            <div id="ap-mac-lock-status" style="font-size:11.5px; color:var(--text-secondary, #64748b); margin-top:2px;">غير مفعل</div>
                        </div>
                        <button id="ap-mac-lock-btn" class="mt-btn sam-btn" style="font-size:12px; padding:6px 14px;" onclick="App.togglePortalMacLock()">تفعيل التثبيت</button>
                    </div>
                    <hr style="border:0; border-top:1px solid var(--sam-border, #e2e8f0); margin:0;" />
                    <!-- Device Limit -->
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div>
                            <div style="font-weight:800; font-size:13px; color:var(--text-primary, #0f172a);">📶 عدد الأجهزة المتصلة المسموح بها:</div>
                            <div id="ap-device-limit-info" style="font-size:11.5px; color:var(--text-secondary, #64748b); margin-top:2px;">أقصى حد للباقة: 1</div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <select id="ap-device-limit-select" class="mt-input sam-select" style="padding:4px 8px; font-size:13px; height:34px;">
                                <option value="1">1 جهاز</option>
                            </select>
                            <button class="mt-btn mt-btn-success" style="padding:0 12px; height:34px; font-size:12px; font-weight:bold;" onclick="App.savePortalDeviceLimit()">💾 حفظ</button>
                        </div>
                    </div>
                </div>

                <!-- Connected Devices -->
                <div style="background:var(--sam-bg-surface, #fff); border:1px solid var(--sam-border, #e2e8f0); border-radius:14px; padding:16px; box-shadow:0 4px 15px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
                        <div style="font-weight:800; font-size:13px; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px;">
                            <span>👥</span> <span>الأجهزة المتصلة حالياً (<span id="ap-dev-count">0</span>):</span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="mt-btn" style="padding:3px 10px; font-size:11px;" onclick="App.loadAdminPortalDevices(document.getElementById('admin-portal-code').value.trim())">🔄 تحديث</button>
                            <button class="mt-btn mt-btn-danger" style="padding:3px 10px; font-size:11px;" onclick="App.disconnectAllPortalDevices()">🚫 طرد الكل</button>
                        </div>
                    </div>
                    <div id="ap-devices" style="font-size:13px;">جاري الفحص...</div>
                </div>
            </div>
        </div>
        `;

        if (PB) {
            view.innerHTML = PB.renderShell({
                id: 'subscriber-portal-inspector',
                archetype: 'pos',
                title: 'بوابة الكروت وحالة المشترك (Hotspot Status)',
                subtitle: 'عرض مباشر ومطابق لواجهة حالة الكرت في شبكة الهوتسبوت مع إدارة السرعة الفورية والأجهزة المتصلة',
                eyebrow: 'خدمات المشتركين والدعم الفني',
                icon: '📱',
                actions,
                content: contentHtml
            });
            window.SamPageShell?.sync();
        } else {
            view.innerHTML = contentHtml;
        }

        // Auto-inspect first card or cached card on open
        setTimeout(() => {
            const cached = this._currentPortalCard?.username || '';
            const codeInput = document.getElementById('admin-portal-code');
            if (codeInput) {
                if (cached) {
                    codeInput.value = cached;
                    this.inspectCardInPortal();
                } else {
                    this.autoLoadFirstActiveCard();
                }
            }
        }, 50);
    },

    async autoLoadFirstActiveCard() {
        try {
            const res = await this.api('get_users', { page: 1, limit: 1 });
            const user = res?.users?.[0]?.username;
            const codeInput = document.getElementById('admin-portal-code');
            if (user && codeInput) {
                codeInput.value = user;
                this.inspectCardInPortal();
            }
        } catch(e) {
            console.error('تعذر تحميل أول كرت في البوابة:', e);
            this.toast?.('تعذر تحميل بيانات الكرت تلقائيًا.', 'warning');
        }
    },

    refreshPortalCard() {
        this.inspectCardInPortal();
    },

    async inspectCardInPortal() {
        const input = document.getElementById('admin-portal-code');
        if (!input) return;
        const code = input.value.trim();
        if (!code) return this.toast('يرجى كتابة رقم الكرت أولاً', 'warning');

        const loading = document.getElementById('admin-portal-loading');
        const result = document.getElementById('admin-portal-result');
        if (loading) loading.style.display = 'block';
        if (result) result.style.display = 'none';

        try {
            const res = await this.api('subscriber_get_status', { code });
            if (loading) loading.style.display = 'none';

            if (!res || !res.success) {
                return this.toast(res?.error || 'الكرت غير موجود في النظام', 'danger');
            }

            const c = res.card;
            this._currentPortalCard = c;
            if (result) result.style.display = 'flex';

            // Card Header
            const chip = document.getElementById('ap-card-num-chip');
            if (chip) chip.innerText = `كرت: ${c.username}`;
            const profBadge = document.getElementById('ap-profile-badge');
            if (profBadge) profBadge.innerText = `الباقة: ${c.name_for_users || c.profile_name || 'افتراضي'}`;
            const connBadge = document.getElementById('ap-conn-badge');
            if (connBadge) {
                connBadge.innerText = c.status === 'active' ? 'متصل بالشبكة بنجاح 🟢' : (c.status === 'expired' ? 'الكرت منتهي الصلاحية 🔴' : 'كرت نشط 🟢');
            }

            // Balance & Quota & SVG Progress Ring
            document.getElementById('ap-rem').innerText = (typeof c.remaining_mb === 'number') ? `${c.remaining_mb} MB` : c.remaining_mb;
            const pct = Math.max(0, Math.min(100, Number(c.remaining_percent) || 0));
            document.getElementById('ap-percent').innerText = `${pct}% متبقي`;
            document.getElementById('ap-consumed').innerText = `${c.total_consumed_mb} MB`;
            document.getElementById('ap-validity-val').innerText = c.effective_validity || c.validity || 'غير محددة';
            document.getElementById('ap-uptime-val').innerText = c.uptime_limit_seconds ? `${Math.round(c.uptime_limit_seconds / 3600)} ساعة` : 'غير محدود';

            const ring = document.getElementById('ap-balance-ring');
            if (ring) {
                const circumference = 427;
                const offset = circumference - (pct / 100) * circumference;
                ring.style.strokeDashoffset = offset;
            }

            // MAC Lock
            const macEnabled = Number(c.mac_lock_enabled) === 1;
            const macBtn = document.getElementById('ap-mac-lock-btn');
            const macStatus = document.getElementById('ap-mac-lock-status');
            if (macBtn && macStatus) {
                macBtn.dataset.enabled = macEnabled ? '1' : '0';
                macBtn.innerText = macEnabled ? '🔓 تعطيل التثبيت' : '🔒 تفعيل التثبيت';
                macBtn.className = macEnabled ? 'mt-btn mt-btn-danger' : 'mt-btn mt-btn-success';
                macStatus.innerText = macEnabled ? (c.locked_mac ? `MAC المثبت: ${c.locked_mac}` : 'بانتظار أول دخول لتثبيت MAC تلقائياً') : 'التثبيت غير مفعل';
            }

            // Device limit select
            const maxAllowed = parseInt(c.max_shared_users) || 1;
            const currentDevices = parseInt(c.current_allowed_devices) || 1;
            document.getElementById('ap-device-limit-info').innerText = `الحد الأقصى المسموح للباقة: ${maxAllowed} أجهزة`;
            const devSelect = document.getElementById('ap-device-limit-select');
            if (devSelect) {
                devSelect.innerHTML = '';
                for (let i = 1; i <= maxAllowed; i++) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.innerText = (i === 1) ? 'جهاز واحد فقط (1)' : `${i} أجهزة متصلة`;
                    if (i === currentDevices) opt.selected = true;
                    devSelect.appendChild(opt);
                }
            }

            // Speeds
            document.getElementById('ap-current-speed-badge').innerText = `السرعة الحالية: ${c.effective_speed || 'افتراضية'}`;
            const speedContainer = document.getElementById('ap-speed-buttons');
            if (speedContainer) {
                speedContainer.innerHTML = '';
                const speeds = (c.available_speeds && c.available_speeds.length > 0) ? c.available_speeds : [
                    { key: '1M/1M', rate: '1M/1M', label: '🐢 اقتصادي (1M)', mbps: 1 },
                    { key: '2M/2M', rate: '2M/2M', label: '🚀 عادي (2M)', mbps: 2 },
                    { key: '5M/5M', rate: '5M/5M', label: '⚡ متوسط (5M)', mbps: 5 },
                    { key: '10M/10M', rate: '10M/10M', label: '🔥 سريع (10M)', mbps: 10 }
                ];
                speeds.forEach(s => {
                    const isCur = (c.effective_speed === s.rate || c.effective_speed === s.key);
                    const btn = document.createElement('button');
                    btn.className = isCur ? 'mt-btn mt-btn-primary' : 'mt-btn';
                    btn.style.cssText = isCur ? 'border:2px solid #0284c7; font-weight:bold;' : 'background:#fff; border:1px solid #cbd5e1;';
                    btn.innerHTML = `${s.label || s.rate}`;
                    btn.onclick = () => App.applyCardSpeed(s.key || s.rate);
                    speedContainer.appendChild(btn);
                });
            }

            this.loadAdminPortalDevices(code);
        } catch (e) {
            if (loading) loading.style.display = 'none';
            console.error(e);
            this.toast('تعذر فحص الكرت، تأكد من الاتصال بالخادم', 'danger');
        }
    },

    async loadAdminPortalDevices(code) {
        if (!code) return;
        const res = await this.api('subscriber_get_devices', { code });
        const devs = res?.devices || [];
        this._currentPortalDevices = devs;
        const countSpan = document.getElementById('ap-dev-count');
        if (countSpan) countSpan.innerText = devs.length;
        const container = document.getElementById('ap-devices');
        if (!container) return;

        if (devs.length === 0) {
            container.innerHTML = '<div style="color:#94a3b8; padding:10px 0; text-align:center;">لا توجد أجهزة متصلة حالياً بهذا الكرت</div>';
            return;
        }
        container.innerHTML = devs.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px 14px; border-radius:8px; margin-bottom:8px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div>
                    <div style="font-weight:700; color:#0f172a;">📱 ${d.callingstationid || 'جهاز مجهول'}</div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">
                        IP: <b style="color:#0284c7;">${d.framedipaddress || '-'}</b> | استهلاك الجلسة: <b>${d.session_mb} MB</b> | وقت الاتصال: ${d.acctstarttime || '-'}
                    </div>
                </div>
                <button class="mt-btn mt-btn-danger" style="padding:4px 10px; font-size:12px;" onclick="App.disconnectPortalDevice('${code}', '${d.callingstationid}')">🚫 طرد وفصل</button>
            </div>
        `).join('');
    },

    async applyCardSpeed(mode) {
        const code = document.getElementById('admin-portal-code').value.trim();
        if (!code) return;
        this.toast('جاري إرسال أمر تعديل السرعة للراوتر (CoA)...', 'info');
        const res = await this.api('subscriber_change_speed', { code, speed: mode, speed_mode: mode }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تعديل السرعة بنجاح', 'success');
            this.inspectCardInPortal();
        } else {
            this.toast(res?.error || 'تعذر تعديل السرعة', 'danger');
        }
    },

    async savePortalDeviceLimit() {
        const code = document.getElementById('admin-portal-code').value.trim();
        const sel = document.getElementById('ap-device-limit-select');
        if (!code || !sel) return;
        const count = parseInt(sel.value) || 1;
        this.toast('جاري حفظ حد الأجهزة...', 'info');
        const res = await this.api('subscriber_set_max_devices', { code, max_devices: count }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم تحديث عدد الأجهزة بنجاح', 'success');
        } else {
            this.toast(res?.error || 'تعذر حفظ عدد الأجهزة', 'danger');
        }
    },

    async togglePortalMacLock() {
        const code = document.getElementById('admin-portal-code').value.trim();
        const btn = document.getElementById('ap-mac-lock-btn');
        if (!code || !btn) return;
        const enable = btn.dataset.enabled !== '1';
        if (!enable && !confirm('سيتم إزالة MAC المثبت والسماح للكرت بالدخول من جهاز آخر. هل تريد المتابعة؟')) return;
        btn.disabled = true;
        this.toast(enable ? 'جاري تفعيل تثبيت MAC...' : 'جاري تعطيل تثبيت MAC...', 'info');
        const res = await this.api('subscriber_set_mac_lock', { code, enabled: enable }, 'POST');
        btn.disabled = false;
        if (res && res.success) {
            this.toast(res.message || 'تم تحديث حالة التثبيت', 'success');
            this.inspectCardInPortal();
        } else {
            this.toast(res?.error || 'تعذر تحديث تثبيت MAC', 'danger');
        }
    },

    async disconnectPortalDevice(code, mac) {
        if (!confirm(`هل تريد بالتأكيد فصل الجهاز (${mac})؟`)) return;
        this.toast('جاري إرسال أمر فصل وطرد الجهاز...', 'info');
        const res = await this.api('subscriber_disconnect_device', { code, mac }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم فصل الجهاز بنجاح', 'success');
            this.loadAdminPortalDevices(code);
        } else {
            this.toast(res?.error || 'تعذر فصل الجهاز', 'danger');
        }
    },

    async disconnectAllPortalDevices() {
        const code = document.getElementById('admin-portal-code').value.trim();
        const devs = this._currentPortalDevices || [];
        if (!code || devs.length === 0) return this.toast('لا توجد أجهزة متصلة لطردها', 'warning');
        if (!confirm(`هل تريد بالتأكيد طرد جميع الأجهزة المتصلة (${devs.length} جهاز)؟`)) return;
        this.toast('جاري فصل جميع الأجهزة...', 'info');
        for (const d of devs) {
            if (d.callingstationid) {
                await this.api('subscriber_disconnect_device', { code, mac: d.callingstationid }, 'POST');
            }
        }
        this.toast('تم إرسال أمر فصل جميع الأجهزة بنجاح', 'success');
        this.loadAdminPortalDevices(code);
    },

    async loadExchangeRates() {
        try {
            const res = await this.api('get_exchange_rates');
            if (res && res.rates && Array.isArray(res.rates)) {
                this._exchangeRates = res.rates;
                const base = res.rates.find(r => Number(r.is_base_currency || r.is_base) === 1);
                if (base) {
                    this._baseCurrency = base.currency_code;
                } else if (!this._baseCurrency) {
                    this._baseCurrency = 'YER_SANAA';
                }
            }
        } catch (e) {
            console.warn('Failed to load exchange rates:', e);
        }
    },

    async checkAuth() {
        const auth = await this.api('check_auth');
        if (auth && auth.logged_in) {
            this.user = auth.user;
            this.userRole = auth.role || 'superadmin';
            this.userPermissions = auth.permissions || [];
            this.userFullname = auth.fullname || auth.user;
            this.adminId = auth.admin_id || 1;
            this.isSystemOwner = !!auth.is_system_owner || auth.role === 'system_owner' || Number(auth.admin_id) === 1;
            this.currentAdminDiscountRate = parseFloat(auth.discount_rate) || 0;
            this.networks = Array.isArray(auth.networks) ? auth.networks : [];
            this.activeNetwork = auth.active_network || this.networks.find(n => Number(n.network_id) === Number(auth.active_network_id)) || null;
            this.activeNetworkId = Number(auth.active_network_id || this.activeNetwork?.network_id || 0);
        }
        return auth;
    },

    async init() {
        if (document.documentElement) document.documentElement.setAttribute('dir', this.lang === 'ar' ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('data-theme', this.theme);

        if (!window._modalEscAttached) {
            window._modalEscAttached = true;
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') App.closeModal();
            });
        }

        if (!window._hashListenerAttached) {
            window._hashListenerAttached = true;
            window.addEventListener('hashchange', () => {
                const hashTab = (window.location.hash || '').replace(/^#/, '').trim();
                if (hashTab && hashTab !== App.currentTab && typeof App.hasAccess === 'function' && App.hasAccess(hashTab)) {
                    App.switchTab(hashTab, false);
                }
            });
        }
        
        this.initAudioUnlock();
        const auth = await this.checkAuth();
        if (auth && auth.logged_in) {
            await this.loadExchangeRates();
            this.showMainApp();
            this.autoRegisterAndroidDevice();
            this.requestNotificationPermission();
            this.startNotificationPoller(25000);

            // Restore previous active tab on page refresh
            const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
            const defaultInitialTab = isOwnerPortal ? 'owner_portal_overview' : 'dashboard';
            let initialTab = defaultInitialTab;
            const hashTab = (window.location.hash || '').replace(/^#/, '').trim();
            let storedTab = null;
            try {
                storedTab = sessionStorage.getItem('sam_active_tab') || localStorage.getItem('sam_active_tab');
            } catch (e) {}

            const sovereignTabs = [
                'owner_portal_overview', 'owner_clients_networks', 'network_subscriptions',
                'owner_network_admins', 'system_settings', 'owner_diagnostics', 'owner_logs',
                'owner_broadcast', 'owner_whatsapp', 'owner_telegram', 'owner_master_finance',
                'owner_alerts'
            ];

            if (hashTab && this.hasAccess(hashTab) && (!isOwnerPortal || sovereignTabs.includes(hashTab))) {
                initialTab = hashTab;
            } else if (storedTab && this.hasAccess(storedTab) && (!isOwnerPortal || sovereignTabs.includes(storedTab))) {
                initialTab = storedTab;
            }

            this.switchTab(initialTab, false);
        } else {
            this.showLogin();
        }
    },

    setLang(l) {
        this.lang = l;
        localStorage.setItem('mt_lang', l);
        document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
        this.render();
    },

    setTheme(t) {
        this.theme = t;
        localStorage.setItem('mt_theme', t);
        document.documentElement.setAttribute('data-theme', t);
    },

    render() {
        const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        if (this.user) {
            this.showMainApp();
            const defaultTab = isOwnerPortal ? 'owner_portal_overview' : 'dashboard';
            if (isOwnerPortal && (!this.currentTab || this.currentTab === 'dashboard')) {
                this.currentTab = defaultTab;
            }
            this.switchTab(this.currentTab || defaultTab);
        } else {
            this.showLogin();
        }
    },

    navigate(tab) {
        this.switchTab(tab);
    },

    async disconnectUser(session) {
        if (!session) return;
        const username = session.username || session.user;
        const nasIp = session.nasipaddress || session.nas_ip;
        const framedIp = session.framedipaddress || session.framed_ip;
        return this.disconnectSessionPrompt(username, nasIp, framedIp);
    },

    async generateMikrotikScript(routerId = null, options = {}) {
        if (!routerId && this.selectedRouterId) routerId = this.selectedRouterId;
        if (routerId) {
            return this.showMikrotikScript(routerId);
        }
        this.toast('يرجى تحديد الراوتر لتوليد السكربت', 'warning');
    },

    async api(action, params = {}, method = 'GET', body = null, triggerBtn = null) {
        const isExplicitMutation = action.startsWith('save_') || action.startsWith('create_') || 
                                   action.startsWith('delete_') || action.startsWith('update_') || 
                                   action.startsWith('pay_') || action.startsWith('deposit_') || 
                                   action.startsWith('distribute_') || action.startsWith('transfer_') ||
                                   action.startsWith('return_') || action.startsWith('post_') || action.startsWith('mark_') ||
                                   action.startsWith('clear_') || action.startsWith('toggle_') || action.startsWith('reset_') || action.startsWith('submit_');

        if (method === 'GET' && isExplicitMutation) {
            method = 'POST';
        }

        // Older screens pass action?field=value; normalize it into actual query parameters.
        if(action.includes('?')){const split=action.indexOf('?');const embedded=new URLSearchParams(action.slice(split+1));action=action.slice(0,split);params={...Object.fromEntries(embedded),...params};}
        // Build URL query parameters cleanly first
        let url = `api.php?action=${action}`;
        const setupV1=action==='network_setup_status'||action==='network_setup_save';
        if(setupV1)url='api/v1/network/setup';
        if (method === 'GET' && params && typeof params === 'object') {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null) {
                    url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
                }
            }
        }

        if ((method === 'POST' || method === 'PUT') && body === null) {
            body = params;
        }

        // Automatic Button Loading State & Double-Click Protection for mutating actions only
        let activeBtn = triggerBtn;
        if (!activeBtn && isExplicitMutation && typeof document !== 'undefined') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'BUTTON' || activeEl.classList.contains('mt-btn') || activeEl.classList.contains('sam-btn') || activeEl.type === 'submit')) {
                activeBtn = activeEl;
            }
        }

        let origBtnHtml = null;
        if (activeBtn && !activeBtn.disabled && typeof activeBtn.innerHTML === 'string') {
            origBtnHtml = activeBtn.innerHTML;
            activeBtn.disabled = true;
            activeBtn.setAttribute('data-busy', 'true');
            activeBtn.innerHTML = '<span class="sam-spinner" style="display:inline-block; width:13px; height:13px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:sam-spin 0.6s linear infinite; margin-inline-end:6px; vertical-align:middle;"></span> ' + origBtnHtml;
        }

        try {
            const options = { method, headers: {} };
            if (method !== 'GET' && method !== 'HEAD') options.headers['X-SAM-Request'] = 'XMLHttpRequest';
            if (this.activeNetworkId > 0 && action !== 'login' && action !== 'refresh_token' && action !== 'switch_active_network') {
                options.headers['X-SAM-Network-ID'] = String(this.activeNetworkId);
            }

            // Attach Bearer Access Token if present in persistent storage
            const accessToken = localStorage.getItem('sam_access_token');
            if (accessToken) {
                options.headers['Authorization'] = `Bearer ${accessToken}`;
            }

            if (body && !(body instanceof FormData)) {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(body);
            } else if (body instanceof FormData) {
                options.body = body;
            }

            const res = await fetch(url, options);

            // Silent Auto-Refresh on 401 Unauthorized with single-flight promise pooling
            if (res.status === 401 && action !== 'login' && action !== 'refresh_token' && action !== 'logout') {
                const refreshToken = localStorage.getItem('sam_refresh_token');
                if (refreshToken) {
                    if (!this._refreshPromise) {
                        this._refreshPromise = (async () => {
                            try {
                                const refreshRes = await fetch('api.php?action=refresh_token', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ refresh_token: refreshToken })
                                });
                                const refreshData = await refreshRes.json();
                                if (refreshData && refreshData.success && refreshData.access_token) {
                                    localStorage.setItem('sam_access_token', refreshData.access_token);
                                    if (refreshData.refresh_token) {
                                        localStorage.setItem('sam_refresh_token', refreshData.refresh_token);
                                    }
                                    return refreshData.access_token;
                                }
                            } catch (err) {
                                console.error('Token refresh error:', err);
                            }
                            return null;
                        })().finally(() => {
                            this._refreshPromise = null;
                        });
                    }

                    const newAccessToken = await this._refreshPromise;
                    if (newAccessToken) {
                        // Retry the original request with the renewed Bearer token
                        return await this.api(action, params, method, body, activeBtn);
                    }
                }

                if (action !== 'check_auth') {
                    localStorage.removeItem('sam_access_token');
                    localStorage.removeItem('sam_refresh_token');
                    this.stopNotificationPoller();
                    this.user = null;
                    this.showLogin();
                }
                return null;
            }

            const responseData=await res.json();
            if(setupV1)return responseData.error?{success:false,error:responseData.error.code,message:responseData.error.message}:responseData.data;
            return responseData;
        } catch (e) {
            console.error('API Error:', e);
            const silentActions = ['get_notifications', 'get_exchange_rates', 'check_auth', 'subscriber_get_status'];
            if (!silentActions.includes(action)) {
                this.toast('Error connecting to server', 'danger');
            }
            return null;
        } finally {
            if (activeBtn && origBtnHtml !== null) {
                activeBtn.disabled = false;
                activeBtn.removeAttribute('data-busy');
                activeBtn.innerHTML = origBtnHtml;
            }
        }
    },

    loading(show = true) {
        if (typeof document === 'undefined') return;
        this._loadingCount = Math.max(0, (this._loadingCount || 0) + (show ? 1 : -1));
        let el = document.getElementById('sam-global-loading');
        if (this._loadingCount > 0) {
            if (!el) {
                el = document.createElement('div');
                el.id = 'sam-global-loading';
                el.style.cssText = 'position:fixed; inset:0; z-index:999998; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,0.25); pointer-events:all;';
                el.innerHTML = '<span style="width:38px; height:38px; border:4px solid #fff; border-top-color:#2563eb; border-radius:50%; animation:sam-spin 0.7s linear infinite;"></span>';
                document.body.appendChild(el);
            }
            // safety: never leave the screen blocked
            clearTimeout(this._loadingTimer);
            this._loadingTimer = setTimeout(() => { this._loadingCount = 0; document.getElementById('sam-global-loading')?.remove(); }, 30000);
        } else {
            clearTimeout(this._loadingTimer);
            if (el) el.remove();
        }
    },

    toast(msg, type = 'info') {
        let container = document.getElementById('app-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'app-toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 24px;
                ${this.lang === 'ar' ? 'left: 24px;' : 'right: 24px;'}
                z-index: 999999;
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-width: 380px;
                width: calc(100vw - 48px);
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const bgColors = {
            success: 'linear-gradient(135deg, #10b981, #059669)',
            danger: 'linear-gradient(135deg, #ef4444, #dc2626)',
            error: 'linear-gradient(135deg, #ef4444, #dc2626)',
            warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
            info: 'linear-gradient(135deg, #3b82f6, #2563eb)'
        };

        const icons = {
            success: '✓',
            danger: '✕',
            error: '✕',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = 'app-toast-item';
        toast.style.cssText = `
            pointer-events: auto;
            background: ${bgColors[type] || bgColors.info};
            color: #ffffff;
            padding: 10px 14px;
            border-radius: 8px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            transform: translateY(12px) scale(0.96);
        `;

        toast.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; flex:1; word-break:break-word;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.25); font-size:12px; flex-shrink:0;">${icons[type] || 'ℹ️'}</span>
                <span>${msg}</span>
            </div>
            <button type="button" style="background:rgba(255,255,255,0.15); border:none; color:#fff; width:22px; height:22px; border-radius:50%; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.35)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'" onclick="this.closest('.app-toast-item').remove()">✕</button>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
        });

        const timer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px) scale(0.95)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);

        toast.addEventListener('mouseenter', () => clearTimeout(timer));
    },

        openModal(content, customWidth = null) {
        let container = document.getElementById('modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'modal-container';
            document.body.appendChild(container);
        }

        // Support openModal(title, htmlContent, customWidth)
        if (typeof customWidth === 'string' && (customWidth.includes('<') || customWidth.includes('\n'))) {
            const title = content;
            const html = customWidth;
            const width = arguments[2] || null;
            content = `
                <div class="mt-modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-color, #e2e8f0);">
                    <h3 style="margin:0; font-size:16px; font-weight:800;">${title}</h3>
                    <button type="button" class="mt-btn mt-btn-sm" onclick="App.closeModal()" style="font-size:14px; padding:2px 8px; border-radius:6px;">✕</button>
                </div>
                <div class="mt-modal-body">${html}</div>
            `;
            customWidth = width;
        }

        if (content.includes('mt-modal-backdrop')) {
            container.innerHTML = content;
        } else if (content.includes('class="mt-modal"') || content.includes("class='mt-modal'")) {
            container.innerHTML = `
                <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                    ${content}
                </div>
            `;
        } else {
            const wStyle = customWidth ? `width:${customWidth};` : 'width:720px;';
            container.innerHTML = `
                <div class="mt-modal-backdrop" onclick="if(event.target===this) App.closeModal()">
                    <div class="mt-modal" style="${wStyle} max-width:96vw; max-height:94vh;">
                        ${content}
                    </div>
                </div>
            `;
        }
    },

    showModal(titleOrContent, optionalContent = null, customWidth = null) {
        if (optionalContent !== null && optionalContent !== undefined && typeof optionalContent === 'string') {
            const modalHtml = `
                <div class="mt-modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-color, #e2e8f0);">
                    <h3 style="margin:0; font-size:16px; font-weight:800;">${titleOrContent}</h3>
                    <button type="button" class="mt-btn mt-btn-sm" onclick="App.closeModal()" style="font-size:14px; padding:2px 8px; border-radius:6px;">✕</button>
                </div>
                <div class="mt-modal-body">
                    ${optionalContent}
                </div>
            `;
            this.openModal(modalHtml, customWidth);
        } else {
            this.openModal(titleOrContent, optionalContent || customWidth);
        }
    },

    closeModal() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = '';
        }
        const backdrops = document.querySelectorAll('.mt-modal-backdrop, .modal-backdrop, .modal-overlay');
        backdrops.forEach(el => el.remove());
    },

    
    escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    escapeHtml(str) {
        return this.escape(str);
    },

    cleanTitle(name, icon = '') {
        if (!name) return '';
        let str = String(name).trim();
        if (icon) {
            while (str.startsWith(icon)) {
                str = str.substring(icon.length).trim();
            }
            str = str.replace(/^[\p{Extended_Pictographic}\u200d\uFE0F\uD800-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF\u2300-\u23FF\u2B50\u203C\u2049\u25AA-\u25FE\s]+/u, '').trim();
        }
        return str || name;
    },

    formatBytes(bytes) {
        bytes = Number(bytes);
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatSeconds(sec) {
        if (!sec) return '0s';
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        let str = '';
        if (d > 0) str += `${d}d `;
        if (h > 0 || d > 0) str += `${h}h `;
        str += `${m}m ${s}s`;
        return str;
    },

        formatMoney(val, showSymbol = true, currencyCode = null) {
        const num = parseFloat(val) || 0;
        const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (showSymbol === false) return formatted;
        let cur = currencyCode;
        if (typeof showSymbol === 'string') {
            cur = showSymbol;
        }
        const sym = (typeof this.getCurrencySymbol === 'function') ? this.getCurrencySymbol(cur || this._baseCurrency) : 'ر.ي';
        return `${formatted} ${sym}`;
    },

    getCurrencyName(code = null) {
        const curCode = (code || this._baseCurrency || 'YER_SANAA').toUpperCase().trim();
        const rates = this._exchangeRates || [];
        const obj = rates.find(r => r.currency_code === curCode);
        if (obj && obj.currency_name) return obj.currency_name;
        const fallbackNames = {
            'YER_SANAA': 'ريال يمني (صنعاء)',
            'YER_ADEN': 'ريال يمني (عدن)',
            'YER': 'ريال يمني',
            'SAR': 'ريال سعودي',
            'USD': 'دولار أمريكي',
            'EUR': 'يورو',
            'AED': 'درهم إماراتي',
            'OMR': 'ريال عماني',
            'QAR': 'ريال قطري',
            'KWD': 'دينار كويتي'
        };
        return fallbackNames[curCode] || curCode;
    },
    // ==========================================
    // ARABIC NUMBER TO WORDS (TAFQEET / تفقيط)
    // ==========================================
    // ARABIC NUMBER TO WORDS (TAFQEET / تفقيط متقدم بالعملة)
    // ==========================================
    getCurrencyTafqeetInfo(currencyInput = null) {
        const code = (currencyInput || this._baseCurrency || 'YER_SANAA').toUpperCase().trim();
        const map = {
            'YER_SANAA': { currency: 'ريال يمني', subUnit: 'فلس' },
            'YER_ADEN': { currency: 'ريال يمني', subUnit: 'فلس' },
            'YER': { currency: 'ريال يمني', subUnit: 'فلس' },
            'SAR': { currency: 'ريال سعودي', subUnit: 'هللة' },
            'USD': { currency: 'دولار أمريكي', subUnit: 'سنت' },
            'EUR': { currency: 'يورو', subUnit: 'سنت' },
            'AED': { currency: 'درهم إماراتي', subUnit: 'فلس' },
            'OMR': { currency: 'ريال عماني', subUnit: 'بيسة' },
            'QAR': { currency: 'ريال قطري', subUnit: 'درهم' },
            'KWD': { currency: 'دينار كويتي', subUnit: 'فلس' }
        };
        if (map[code]) return map[code];
        if (currencyInput && /[؀-ۿ]/.test(currencyInput)) {
            return { currency: currencyInput, subUnit: 'جزء' };
        }
        return { currency: currencyInput || 'ريال', subUnit: 'جزء' };
    },

    tafqeet(number, currencyInput = null, subUnitInput = null) {
        const info = this.getCurrencyTafqeetInfo(currencyInput);
        const currency = currencyInput && /[؀-ۿ]/.test(currencyInput) ? currencyInput : info.currency;
        const subUnit = subUnitInput || info.subUnit;

        const num = parseFloat(number);
        if (isNaN(num) || num === 0) return 'صفر ' + currency;

        const isNegative = num < 0;
        const absVal = Math.abs(num);
        const integerPart = Math.floor(absVal);
        const fractionPart = Math.round((absVal - integerPart) * 100);

        const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
                      'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
        const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
        const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

        function convertGroup(n) {
            let res = '';
            const c = Math.floor(n / 100);
            const remainder = n % 100;
            if (c > 0) res += hundreds[c];
            if (remainder > 0) {
                if (res !== '') res += ' و ';
                if (remainder < 20) {
                    res += ones[remainder];
                } else {
                    const u = remainder % 10;
                    const t = Math.floor(remainder / 10);
                    if (u > 0) res += ones[u] + ' و ';
                    res += tens[t];
                }
            }
            return res;
        }

        let words = '';
        const billions = Math.floor(integerPart / 1000000000);
        let rem = integerPart % 1000000000;
        const millions = Math.floor(rem / 1000000);
        rem = rem % 1000000;
        const thousands = Math.floor(rem / 1000);
        const units = rem % 1000;

        if (billions > 0) {
            if (billions === 1) words += 'مليار';
            else if (billions === 2) words += 'ملياران';
            else if (billions >= 3 && billions <= 10) words += convertGroup(billions) + ' مليارات';
            else words += convertGroup(billions) + ' مليار';
        }

        if (millions > 0) {
            if (words !== '') words += ' و ';
            if (millions === 1) words += 'مليون';
            else if (millions === 2) words += 'مليونان';
            else if (millions >= 3 && millions <= 10) words += convertGroup(millions) + ' ملايين';
            else words += convertGroup(millions) + ' مليون';
        }

        if (thousands > 0) {
            if (words !== '') words += ' و ';
            if (thousands === 1) words += 'ألف';
            else if (thousands === 2) words += 'ألفان';
            else if (thousands >= 3 && thousands <= 10) words += convertGroup(thousands) + ' آلاف';
            else words += convertGroup(thousands) + ' ألف';
        }

        if (units > 0) {
            if (words !== '') words += ' و ';
            words += convertGroup(units);
        }

        if (words === '') words = 'صفر';
        let result = (isNegative ? 'سالب ' : '') + words + ' ' + currency;

        if (fractionPart > 0) {
            result += ' و ' + convertGroup(fractionPart) + ' ' + subUnit;
        }

        return result + ' فقط لا غير';
    },



    // UI RENDERING
    showLogin() {
        this.stopNotificationPoller();
        const savedUser = localStorage.getItem('sam_saved_username') || 'admin';
        const rememberChecked = localStorage.getItem('sam_remember_me') !== 'false' ? 'checked' : '';
        const isOwnerPortal = window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php');

        document.getElementById('app-root').innerHTML = `
        <div style="height:100vh; display:flex; align-items:center; justify-content:center; background: ${isOwnerPortal ? 'linear-gradient(135deg, #0b1329 0%, #0f172a 50%, #1e293b 100%)' : 'var(--bg-sidebar)'};">
            <div style="width: 380px; max-width:92vw; background: ${isOwnerPortal ? '#0f172a' : 'var(--bg-window)'}; color:${isOwnerPortal ? '#f8fafc' : 'inherit'}; padding: 26px 24px; border-radius: 12px; box-shadow: 0 16px 36px rgba(0,0,0,0.45); border: ${isOwnerPortal ? '2px solid #d97706' : '1px solid var(--border-color)'};">
                <div style="text-align:center; margin-bottom: 20px;">
                    ${isOwnerPortal ? `
                        <div style="display:inline-flex; align-items:center; justify-content:center; width:56px; height:56px; border-radius:14px; background:linear-gradient(135deg, #d97706 0%, #b45309 100%); color:#fff; font-size:28px; box-shadow:0 4px 12px rgba(217,119,6,0.35); margin-bottom:10px;">👑</div>
                        <div style="font-size: 19px; font-weight: 800; color: #f59e0b;">بوابة مالك النظام والتحكم السيادي</div>
                        <div style="font-size: 11.5px; color: #94a3b8; margin-top: 3px; font-weight:700; letter-spacing:0.5px;">SAM SOVEREIGN CONSOLE · HTTPS</div>
                        <div style="margin-top:8px; padding:5px 8px; border-radius:6px; background:rgba(217,119,6,0.12); border:1px solid rgba(245,158,11,0.25); color:#fde68a; font-size:11px; line-height:1.4;">
                            🔒 منفذ وصول مستقل ومعزول لإدارة المنظومة والسيرفر والشبكات
                        </div>
                    ` : `
                        <img src="assets/img/system-logo.png" onerror="this.onerror=null;this.src='assets/img/log.png'" alt="SAM" style="display:block; width:100%; max-width:260px; height:72px; object-fit:contain; margin:0 auto 8px; border-radius:8px; background:#0b1d41;">
                        <div style="font-size: 20px; font-weight: bold; color: #0078d7;">SAM</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">نظام الإدارة الذكي للشبكة</div>
                    `}
                </div>
                <form onsubmit="App.handleLogin(event)">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; color:${isOwnerPortal ? '#cbd5e1' : 'inherit'};">${this.t('username')}</label>
                        <input type="text" id="login-user" class="mt-input" style="width:100%; ${isOwnerPortal ? 'background:#1e293b; color:#fff; border-color:#475569;' : ''}" value="${this.escape(savedUser)}" required />
                    </div>
                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12.5px; color:${isOwnerPortal ? '#cbd5e1' : 'inherit'};">${this.t('password')}</label>
                        <input type="password" id="login-pass" class="mt-input" style="width:100%; ${isOwnerPortal ? 'background:#1e293b; color:#fff; border-color:#475569;' : ''}" autocomplete="current-password" required autofocus />
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin:12px 0 14px; font-size:12px; color:${isOwnerPortal ? '#94a3b8' : 'var(--text-muted)'}; flex-wrap:wrap; gap:6px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
                            <input type="checkbox" id="login-remember-me" ${rememberChecked} style="accent-color:${isOwnerPortal ? '#d97706' : '#0078d7'}; width:15px; height:15px; cursor:pointer;" />
                            <span>تذكرني 🔐</span>
                        </label>
                        <a href="javascript:void(0)" onclick="App.showForgotPasswordModal()" style="color:${isOwnerPortal ? '#f59e0b' : '#0284c7'}; text-decoration:none; font-weight:700; font-size:11.5px; transition:color 0.2s;">
                            هل نسيت كلمة السر؟ 🔑
                        </a>
                    </div>
                    <button type="submit" class="mt-btn ${isOwnerPortal ? '' : 'mt-btn-primary'}" style="width:100%; justify-content:center; padding:10px; font-weight:800; font-size:14px; border-radius:8px; margin-top:4px; ${isOwnerPortal ? 'background:linear-gradient(135deg, #d97706 0%, #b45309 100%); color:#fff; border:1px solid #f59e0b; box-shadow:0 3px 8px rgba(217,119,6,0.3);' : ''}">
                        ${isOwnerPortal ? '👑 تسجيل الدخول كمالك للنظام' : this.t('login_btn')}
                    </button>
                    ${isOwnerPortal ? `
                    <div style="text-align:center; margin-top:16px; padding-top:12px; border-top:1px solid #334155; font-size:11.5px; display:flex; flex-direction:column; gap:8px;">
                        <a href="javascript:void(0)" onclick="App.openStandardPortal()" style="color:#38bdf8; text-decoration:none; font-weight:700;">
                            🌐 الانتقال إلى بوابة المشرفين والشبكات القياسية (المنفذ الافتراضي) ◀
                        </a>
                        <a href="services.html" style="color:#f59e0b; text-decoration:none; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                            <span>🌟 استعراض خدمات ومميزات منظومة SAM</span>
                        </a>
                    </div>
                    ` : `
                    <div style="display:flex; justify-content:center; align-items:center; flex-direction:column; gap:8px; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color, #e2e8f0); font-size:12.5px;">
                        <a href="javascript:void(0)" onclick="App.showRegistrationModal()" style="color:#0284c7; text-decoration:none; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
                            <span>✨ تسجيل حساب مشترك جديد</span>
                        </a>
                        <a href="apps.html" style="color:#38bdf8; text-decoration:none; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                            <span>📲 تحميل وتثبيت تطبيقات المنظومة (Android / PWA)</span>
                        </a>
                        <a href="services.html" style="color:#10b981; text-decoration:none; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                            <span>🌟 استعراض خدمات ومميزات المنظومة كاملاً</span>
                        </a>
                    </div>
                    `}
                </form>
            </div>
        </div>
        `;
    },

    // ==========================================
    // FORGOT PASSWORD VIA WHATSAPP OTP (FRONTEND)
    // ==========================================
    showForgotPasswordModal(prefillValue = '') {
        const savedUser = prefillValue || document.getElementById('login-user')?.value || '';
        this.openModal(`
            <style>
                .sam-phone-wrap {
                    display: flex !important;
                    align-items: center !important;
                    direction: ltr !important;
                    gap: 6px !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }
                .sam-phone-wrap select {
                    flex: 0 0 105px !important;
                    width: 105px !important;
                    min-width: 95px !important;
                    max-width: 110px !important;
                    padding: 8px 4px !important;
                    font-weight: 700 !important;
                    font-size: 12px !important;
                    background: #f8fafc !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    height: 40px !important;
                    box-sizing: border-box !important;
                }
                .sam-phone-wrap input {
                    flex: 1 1 auto !important;
                    min-width: 0 !important;
                    width: 100% !important;
                    direction: ltr !important;
                    text-align: left !important;
                    font-family: monospace, sans-serif !important;
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    letter-spacing: 0.5px !important;
                    padding: 8px 10px !important;
                    height: 40px !important;
                    box-sizing: border-box !important;
                }
                @media (max-width: 640px) {
                    .sam-phone-wrap select {
                        flex: 0 0 95px !important;
                        width: 95px !important;
                        font-size: 11.5px !important;
                        padding: 6px 2px !important;
                    }
                    .sam-phone-wrap input {
                        font-size: 13.5px !important;
                    }
                    .mt-modal-footer {
                        flex-direction: column-reverse !important;
                        gap: 8px !important;
                    }
                    .mt-modal-footer button {
                        width: 100% !important;
                    }
                }
            </style>
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 18px; border-bottom:1px solid #334155;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">🔑</span> استعادة كلمة المرور عبر واتساب
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form id="forgot-pwd-step1-form" onsubmit="App.submitForgotPasswordPhone(event)">
                <div class="mt-modal-body" style="padding:20px;">
                    <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:12px 14px; margin-bottom:16px; color:#166534; font-size:12.5px; line-height:1.6; display:flex; gap:10px; align-items:flex-start;">
                        <span style="font-size:22px; line-height:1;">📱</span>
                        <div>
                            <b>استعادة فورية وآمنة:</b><br>
                            أدخل رقم هاتفك المسجل أو اسم المستخدم، وسيقوم النظام بإرسال <b>رمز تأكيد الأمان (OTP)</b> فوراً إلى حسابك على الواتساب.
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">
                            رقم الهاتف المسجل (واتساب) أو اسم المستخدم *
                        </label>
                        <div class="sam-phone-wrap">
                            <select id="forgot-phone-cc" class="mt-input">
                                <option value="967" selected>🇾🇪 +967</option>
                                <option value="966">🇸🇦 +966</option>
                                <option value="971">🇦🇪 +971</option>
                                <option value="968">🇴🇲 +968</option>
                                <option value="974">🇶🇦 +974</option>
                                <option value="965">🇰🇼 +965</option>
                                <option value="973">🇧🇭 +973</option>
                                <option value="962">🇯🇴 +962</option>
                                <option value="20">🇪🇬 +20</option>
                                <option value="249">🇸🇩 +249</option>
                                <option value="964">🇮🇶 +964</option>
                                <option value="963">🇸🇾 +963</option>
                                <option value="961">🇱🇧 +961</option>
                                <option value="1">🇺🇸 +1</option>
                                <option value="44">🇬🇧 +44</option>
                                <option value="90">🇹🇷 +90</option>
                            </select>
                            <input type="text" id="forgot-phone-input" class="mt-input" placeholder="77XXXXXXX أو اسم المستخدم" value="${this.escape(savedUser)}" required autofocus />
                        </div>
                        <small style="color:#64748b; font-size:11.5px; margin-top:4px; display:block;">
                            اختر مفتاح الدولة واكتب رقم الواتساب بدون صفر بالبداية، أو اكتب اسم المستخدم.
                        </small>
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <button type="submit" id="forgot-send-btn" class="mt-btn mt-btn-success" style="font-weight:700; font-size:13.5px; padding:8px 20px; display:flex; align-items:center; gap:8px;">
                        <span>إرسال رمز التأكيد إلى الواتساب 📲</span>
                    </button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()" style="font-size:13px;">إلغاء</button>
                </div>
            </form>
        `, '480px');
    },

    async submitForgotPasswordPhone(e) {
        e.preventDefault();
        const inputEl = document.getElementById('forgot-phone-input');
        const sendBtn = document.getElementById('forgot-send-btn');
        const cc = document.getElementById('forgot-phone-cc')?.value || '967';
        let val = inputEl ? inputEl.value.trim() : '';

        if (!val) {
            return this.toast('يرجى إدخال رقم الهاتف أو اسم المستخدم', 'warning');
        }

        if (/^[0-9+]+$/.test(val)) {
            val = val.replace(/^0+/, '').replace(/^\+/, '');
            if (cc === '967') {
                if (val.startsWith('967')) val = val.substring(3);
                if (val.length === 9) {
                    if (!/^(77|78|70|71|73)\d{7}$/.test(val)) {
                        return this.toast('⚠️ رقم الهاتف اليمني يجب أن يتكون من 9 أرقام ويبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)', 'warning', 6000);
                    }
                    val = '967' + val;
                }
            } else if (!val.startsWith(cc) && val.length <= 10) {
                val = cc + val;
            }
        }

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال عبر واتساب...';
        }

        try {
            const res = await this.api('forgot_password_request_otp', { phone: val }, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم إرسال رمز التأكيد بنجاح 🟢', 'success');
                this.renderForgotPasswordStep2(res.phone || val, res.masked_phone || val, res.username || '');
            } else {
                this.toast(res?.error || 'تعذر إرسال رمز التأكيد، تأكد من الرقم', 'danger');
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<span>إرسال رمز التأكيد إلى الواتساب 📲</span>';
                }
            }
        } catch (err) {
            this.toast('حدث خطأ في الاتصال بالسيرفر', 'danger');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<span>إرسال رمز التأكيد إلى الواتساب 📲</span>';
            }
        }
    },

    renderForgotPasswordStep2(phone, maskedPhone, username) {
        let countdown = 60;
        if (window.__forgotPwdTimer) clearInterval(window.__forgotPwdTimer);

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 18px; border-bottom:1px solid #334155;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">🔐</span> إدخال رمز التأكيد وتعيين كلمة المرور
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form id="forgot-pwd-step2-form" onsubmit="App.submitForgotPasswordReset(event)">
                <input type="hidden" id="reset-phone-hidden" value="${this.escape(phone)}" />
                <div class="mt-modal-body" style="padding:20px;">
                    <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:12.5px; color:#065f46; display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <span>تم إرسال الرمز للرقم: </span>
                            <b style="font-family:monospace; direction:ltr; font-size:13px; color:#047857;">${this.escape(maskedPhone)}</b>
                        </div>
                        <span style="font-size:18px;">🟢</span>
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">
                            رمز التأكيد (OTP) المكون من 6 أرقام *
                        </label>
                        <input type="text" id="reset-otp-input" class="mt-input" style="width:100%; font-size:22px; font-weight:800; text-align:center; letter-spacing:8px; font-family:monospace; padding:8px; color:#0284c7; background:#f8fafc;" maxlength="6" placeholder="------" required autofocus autocomplete="one-time-code" />
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">
                            كلمة المرور الجديدة *
                        </label>
                        <div style="display:flex; gap:6px;">
                            <input type="password" id="reset-new-pass" class="mt-input" style="width:100%; font-size:13px;" placeholder="6 خانات على الأقل" required minlength="6" />
                            <button type="button" class="mt-btn" style="padding:4px 10px;" onclick="App.togglePasswordVisibility('reset-new-pass', this)">👁️</button>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-weight:700; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">
                            تأكيد كلمة المرور الجديدة *
                        </label>
                        <input type="password" id="reset-confirm-pass" class="mt-input" style="width:100%; font-size:13px;" placeholder="أعد كتابة كلمة المرور" required minlength="6" />
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:12px; color:#64748b;">
                        <span>لم يصلك الرمز؟</span>
                        <button type="button" id="forgot-resend-btn" class="mt-btn mt-btn-sm" style="font-size:11.5px; padding:3px 10px;" disabled onclick="App.resendForgotPasswordOtp('${this.escape(phone)}')">
                            إعادة الإرسال (<span id="resend-countdown">60</span>s)
                        </button>
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <button type="submit" id="forgot-reset-submit-btn" class="mt-btn mt-btn-success" style="font-weight:700; font-size:13.5px; padding:8px 20px;">
                        ✅ تأكيد وتعيين كلمة المرور الجديدة
                    </button>
                    <button type="button" class="mt-btn" onclick="App.showForgotPasswordModal('${this.escape(phone)}')">◀ رجوع</button>
                </div>
            </form>
        `, '480px');

        window.__forgotPwdTimer = setInterval(() => {
            countdown--;
            const countEl = document.getElementById('resend-countdown');
            const resendBtn = document.getElementById('forgot-resend-btn');
            if (countEl) countEl.innerText = countdown;
            if (countdown <= 0) {
                clearInterval(window.__forgotPwdTimer);
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.innerText = 'إعادة إرسال الرمز الآن 🔄';
                }
            }
        }, 1000);
    },

    async resendForgotPasswordOtp(phone) {
        this.toast('جاري إعادة إرسال رمز جديد عبر واتساب...', 'info');
        const res = await this.api('forgot_password_request_otp', { phone: phone }, 'POST');
        if (res && res.success) {
            this.toast(res.message || 'تم إرسال رمز جديد بنجاح 🟢', 'success');
            this.renderForgotPasswordStep2(phone, res.masked_phone || phone, res.username || '');
        } else {
            this.toast(res?.error || 'تعذر إعادة إرسال الرمز', 'danger');
        }
    },

    async submitForgotPasswordReset(e) {
        e.preventDefault();
        const phone = document.getElementById('reset-phone-hidden')?.value || '';
        const otp = document.getElementById('reset-otp-input')?.value.trim() || '';
        const newPass = document.getElementById('reset-new-pass')?.value || '';
        const confirmPass = document.getElementById('reset-confirm-pass')?.value || '';
        const submitBtn = document.getElementById('forgot-reset-submit-btn');

        if (!otp || otp.length < 6) {
            return this.toast('يرجى إدخال رمز التحقق المكون من 6 أرقام', 'warning');
        }
        if (!newPass || newPass.length < 6) {
            return this.toast('كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام', 'warning');
        }
        if (newPass !== confirmPass) {
            return this.toast('كلمتا المرور غير متطابقتين', 'danger');
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحديث...';
        }

        try {
            const res = await this.api('forgot_password_verify_and_reset', {
                phone: phone,
                otp_code: otp,
                new_password: newPass,
                confirm_password: confirmPass
            }, 'POST');

            if (res && res.success) {
                if (window.__forgotPwdTimer) clearInterval(window.__forgotPwdTimer);
                this.closeModal();
                this.toast(res.message || '🎉 تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.', 'success');
                
                // Prefill the login form with the username and focus on password
                const loginUser = document.getElementById('login-user');
                const loginPass = document.getElementById('login-pass');
                if (loginUser && res.username) {
                    loginUser.value = res.username;
                }
                if (loginPass) {
                    loginPass.value = '';
                    loginPass.focus();
                }
            } else {
                this.toast(res?.error || 'فشل التحقق من الرمز أو تغيير كلمة المرور', 'danger');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '✅ تأكيد وتعيين كلمة المرور الجديدة';
                }
            }
        } catch (err) {
            this.toast('حدث خطأ في الاتصال بالسيرفر', 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '✅ تأكيد وتعيين كلمة المرور الجديدة';
            }
        }
    },

    // ==========================================
    // SELF-SERVICE REGISTRATION SYSTEM
    // ==========================================
    async showRegistrationModal(initialType = null) {
        this.openModal(`
            <div style="padding:30px; text-align:center;">
                <div class="mt-spinner"></div>
                <div style="margin-top:12px; font-weight:700; color:#64748b;">جاري تحميل خيارات التسجيل...</div>
            </div>
        `, '680px');

        const init = await this.api('registration_get_init_data');
        this._registrationInitData = init || { networks: [], plans: [] };

        if (!initialType) {
            this.renderRegistrationTypeSelection();
        } else {
            this.renderRegistrationForm(initialType);
        }
    },

    renderRegistrationTypeSelection() {
        this.openModal(`
            <style>
                .sam-type-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 14px;
                }
                @media (max-width: 600px) {
                    .sam-type-grid {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }
                }
            </style>
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:16px 20px; border-bottom:1px solid #334155;">
                <span style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>✨</span> إنشاء حساب جديد في منظومة SAM
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <div class="mt-modal-body" style="padding:20px;">
                <div style="text-align:center; margin-bottom:18px;">
                    <div style="font-size:15px; font-weight:800; color:#0f172a;">اختر نوع الحساب الذي ترغب في إنشائه:</div>
                    <div style="font-size:12px; color:#64748b; margin-top:4px;">حدد صفتك للبدء في خطوات التسجيل وتفعيل الحساب عبر رسالة التأكيد</div>
                </div>

                <div class="sam-type-grid">
                    <!-- Option 1: Customer / Subscriber -->
                    <div class="sam-reg-type-card" onclick="App.renderRegistrationForm('customer')" style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:12px; padding:18px 14px; text-align:center; cursor:pointer; transition:all 0.25s ease; display:flex; flex-direction:column; justify-content:space-between;" onmouseover="this.style.borderColor='#0284c7'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(2,132,199,0.12)'" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none'; this.style.boxShadow='none'">
                        <div>
                            <div style="width:52px; height:52px; border-radius:14px; background:#e0f2fe; color:#0284c7; font-size:26px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:10px;">📱</div>
                            <div style="font-size:14px; font-weight:800; color:#0f172a;">حساب مشترك / عميل</div>
                            <div style="font-size:11.5px; color:#64748b; margin-top:6px; line-height:1.4;">لمستخدمي ومشتركي الإنترنت، متابعة رصيد الكرت والباقات والخدمات.</div>
                        </div>
                        <button type="button" class="mt-btn mt-btn-sm" style="margin-top:14px; background:#0284c7; color:#fff; border:none; border-radius:8px; font-weight:700; width:100%;">
                            تسجيل مشترك ◀
                        </button>
                    </div>

                    <!-- Option 2: POS Agent -->
                    <div class="sam-reg-type-card" onclick="App.renderRegistrationForm('pos_agent')" style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:12px; padding:18px 14px; text-align:center; cursor:pointer; transition:all 0.25s ease; display:flex; flex-direction:column; justify-content:space-between;" onmouseover="this.style.borderColor='#16a34a'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(22,163,74,0.12)'" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none'; this.style.boxShadow='none'">
                        <div>
                            <div style="width:52px; height:52px; border-radius:14px; background:#dcfce7; color:#16a34a; font-size:26px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:10px;">🏪</div>
                            <div style="font-size:14px; font-weight:800; color:#0f172a;">وكيل / نقطة بيع</div>
                            <div style="font-size:11.5px; color:#64748b; margin-top:6px; line-height:1.4;">للمحلات ونقاط البيع المعتمدة، بيع وطباعة الكروت وشحن الرصيد.</div>
                        </div>
                        <button type="button" class="mt-btn mt-btn-sm" style="margin-top:14px; background:#16a34a; color:#fff; border:none; border-radius:8px; font-weight:700; width:100%;">
                            تسجيل نقطة بيع ◀
                        </button>
                    </div>

                    <!-- Option 3: Network Manager / Owner -->
                    <div class="sam-reg-type-card" onclick="App.renderRegistrationForm('network_owner')" style="background:#fffbeb; border:2px solid #fde68a; border-radius:12px; padding:18px 14px; text-align:center; cursor:pointer; transition:all 0.25s ease; display:flex; flex-direction:column; justify-content:space-between;" onmouseover="this.style.borderColor='#d97706'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(217,119,6,0.18)'" onmouseout="this.style.borderColor='#fde68a'; this.style.transform='none'; this.style.boxShadow='none'">
                        <div>
                            <div style="width:52px; height:52px; border-radius:14px; background:#fef3c7; color:#d97706; font-size:26px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:10px;">🏢</div>
                            <div style="font-size:14px; font-weight:800; color:#92400e;">صاحب / مدير شبكة</div>
                            <div style="font-size:11.5px; color:#78350f; margin-top:6px; line-height:1.4;">لإدارة وتأسيس شبكة مستقلة جديدة وربط الراوترات وتوزيع الكروت.</div>
                        </div>
                        <button type="button" class="mt-btn mt-btn-sm" style="margin-top:14px; background:linear-gradient(135deg, #d97706 0%, #b45309 100%); color:#fff; border:none; border-radius:8px; font-weight:800; width:100%;">
                            إنشاء شبكة جديدة ◀
                        </button>
                    </div>
                </div>

                <div style="margin-top:18px; text-align:center; padding-top:12px; border-top:1px dashed #cbd5e1;">
                    <a href="services.html" target="_blank" style="color:#0284c7; text-decoration:none; font-size:12.5px; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                        <span>🌟 استعراض دليل خدمات ومميزات منظومة SAM والمقارنة بين الباقات ↗</span>
                    </a>
                </div>
            </div>
            <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                <a href="services.html" target="_blank" class="mt-btn" style="font-size:12px; font-weight:700; color:#0f766e; background:#f0fdf4; border:1px solid #86efac; text-decoration:none;">
                    ✨ دليل الخدمات والمميزات
                </a>
                <button type="button" class="mt-btn" onclick="App.closeModal()">إلغاء</button>
            </div>
        `, '680px');
    },

    renderRegistrationForm(type) {
        const init = this._registrationInitData || { networks: [], plans: [] };
        const networks = init.networks || [];
        const plans = init.plans || [];

        const typeTitles = {
            customer: '📱 تسجيل حساب مشترك / عميل جديد',
            pos_agent: '🏪 تسجيل حساب وكيل / نقطة بيع معتمدة',
            network_owner: '👑 تسجيل وإنشاء شبكة جديدة لمالك الشبكة'
        };

        const formStyles = `
            <style>
                .sam-reg-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }
                .sam-reg-grid-full {
                    grid-column: 1 / -1;
                }
                .sam-phone-wrap {
                    display: flex !important;
                    align-items: center !important;
                    direction: ltr !important;
                    gap: 6px !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }
                .sam-phone-wrap select {
                    flex: 0 0 105px !important;
                    width: 105px !important;
                    min-width: 95px !important;
                    max-width: 110px !important;
                    padding: 8px 4px !important;
                    font-weight: 700 !important;
                    font-size: 12px !important;
                    background: #f8fafc !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    height: 40px !important;
                    box-sizing: border-box !important;
                }
                .sam-phone-wrap input {
                    flex: 1 1 auto !important;
                    min-width: 0 !important;
                    width: 100% !important;
                    direction: ltr !important;
                    text-align: left !important;
                    font-family: monospace, sans-serif !important;
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    letter-spacing: 0.5px !important;
                    padding: 8px 10px !important;
                    height: 40px !important;
                    box-sizing: border-box !important;
                }
                .sam-password-wrap {
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }
                .sam-password-wrap input {
                    flex: 1 1 auto !important;
                    min-width: 0 !important;
                    width: 100% !important;
                    height: 40px !important;
                    box-sizing: border-box !important;
                }
                .sam-password-wrap button {
                    flex: 0 0 auto !important;
                    height: 40px !important;
                    padding: 4px 10px !important;
                    box-sizing: border-box !important;
                }
                @media (max-width: 640px) {
                    .sam-reg-grid {
                        grid-template-columns: 1fr !important;
                        gap: 10px !important;
                    }
                    .sam-phone-wrap select {
                        flex: 0 0 95px !important;
                        width: 95px !important;
                        font-size: 11.5px !important;
                        padding: 6px 2px !important;
                    }
                    .sam-phone-wrap input {
                        font-size: 13.5px !important;
                    }
                    .mt-modal-footer {
                        flex-direction: column-reverse !important;
                        gap: 8px !important;
                    }
                    .mt-modal-footer button, .mt-modal-footer a {
                        width: 100% !important;
                        text-align: center !important;
                    }
                }
            </style>
        `;

        let formFieldsHtml = '';

        if (type === 'customer') {
            formFieldsHtml = `
                <div class="sam-reg-grid">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">الاسم الكامل للعميل *</label>
                        <input type="text" id="reg-fullname" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: أحمد محمد علي" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">رقم الهاتف / الواتساب *</label>
                        <div class="sam-phone-wrap">
                            <select id="reg-phone-cc" class="mt-input">
                                <option value="967" selected>🇾🇪 +967</option>
                                <option value="966">🇸🇦 +966</option>
                                <option value="971">🇦🇪 +971</option>
                                <option value="968">🇴🇲 +968</option>
                                <option value="974">🇶🇦 +974</option>
                                <option value="965">🇰🇼 +965</option>
                                <option value="973">🇧🇭 +973</option>
                                <option value="962">🇯🇴 +962</option>
                                <option value="20">🇪🇬 +20</option>
                                <option value="249">🇸🇩 +249</option>
                                <option value="964">🇮🇶 +964</option>
                                <option value="963">🇸🇾 +963</option>
                                <option value="961">🇱🇧 +961</option>
                                <option value="1">🇺🇸 +1</option>
                                <option value="44">🇬🇧 +44</option>
                                <option value="90">🇹🇷 +90</option>
                            </select>
                            <input type="tel" id="reg-phone" class="mt-input" placeholder="77XXXXXXX (9 أرقام)" inputmode="numeric" autocomplete="tel-national" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77, 78, 70, 71, 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" required />
                        </div>
                    </div>
                    <div class="form-group sam-reg-grid-full">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">الشبكة التابع لها *</label>
                        <select id="reg-network-id" class="mt-input" style="width:100%; height:40px; font-weight:700; box-sizing:border-box;" required>
                            ${networks.map(n => `<option value="${n.id}">🌐 ${this.escape(n.name)} (${this.escape(n.code || 'NET-' + n.id)}) ${n.location ? '— ' + this.escape(n.location) : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">اسم المستخدم للدخول *</label>
                        <input type="text" id="reg-username" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: ahmed_net" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">كلمة المرور *</label>
                        <div class="sam-password-wrap">
                            <input type="password" id="reg-password" class="mt-input" placeholder="6+ خانات" required minlength="6" />
                            <button type="button" class="mt-btn" onclick="App.togglePasswordVisibility('reg-password', this)">👁️</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'pos_agent') {
            formFieldsHtml = `
                <div class="sam-reg-grid">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">اسم المسؤول / الوكيل *</label>
                        <input type="text" id="reg-fullname" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: يحيى صالح مسعد" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">اسم المحل / النقطة التجارية *</label>
                        <input type="text" id="reg-shop-name" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: مركز الأمل للاتصالات" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">رقم الهاتف / الواتساب *</label>
                        <div class="sam-phone-wrap">
                            <select id="reg-phone-cc" class="mt-input">
                                <option value="967" selected>🇾🇪 +967</option>
                                <option value="966">🇸🇦 +966</option>
                                <option value="971">🇦🇪 +971</option>
                                <option value="968">🇴🇲 +968</option>
                                <option value="974">🇶🇦 +974</option>
                                <option value="965">🇰🇼 +965</option>
                                <option value="973">🇧🇭 +973</option>
                                <option value="962">🇯🇴 +962</option>
                                <option value="20">🇪🇬 +20</option>
                                <option value="249">🇸🇩 +249</option>
                                <option value="964">🇮🇶 +964</option>
                                <option value="963">🇸🇾 +963</option>
                                <option value="961">🇱🇧 +961</option>
                                <option value="1">🇺🇸 +1</option>
                                <option value="44">🇬🇧 +44</option>
                                <option value="90">🇹🇷 +90</option>
                            </select>
                            <input type="tel" id="reg-phone" class="mt-input" placeholder="77XXXXXXX (9 أرقام)" inputmode="numeric" autocomplete="tel-national" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77, 78, 70, 71, 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" required />
                        </div>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">الشبكة المعتمد لديها *</label>
                        <select id="reg-network-id" class="mt-input" style="width:100%; height:40px; font-weight:700; box-sizing:border-box;" required>
                            ${networks.map(n => `<option value="${n.id}">🌐 ${this.escape(n.name)} (${this.escape(n.code || 'NET-' + n.id)})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">اسم المستخدم للوحة المبيعات *</label>
                        <input type="text" id="reg-username" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: pos_amal" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12.5px; margin-bottom:4px; display:block;">كلمة المرور *</label>
                        <div class="sam-password-wrap">
                            <input type="password" id="reg-password" class="mt-input" placeholder="6+ خانات" required minlength="6" />
                            <button type="button" class="mt-btn" onclick="App.togglePasswordVisibility('reg-password', this)">👁️</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'network_owner') {
            formFieldsHtml = `
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#166534; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">✨</span>
                    <span>عند إتمام التسجيل وتأكيد الهاتف، سيتم إنشاء شبكتك وتفعيل حسابك بحالة <b>(مفعل ونشط)</b> فوراً لتتمكن من الدخول وإدارة شبكتك مباشرة.</span>
                </div>

                <div style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">1️⃣ بيانات صاحب الشبكة:</div>
                <div class="sam-reg-grid">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">الاسم الكامل *</label>
                        <input type="text" id="reg-fullname" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: حسن عبد الله معوضة" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">رقم الواتساب للتأكيد والتواصل *</label>
                        <div class="sam-phone-wrap">
                            <select id="reg-phone-cc" class="mt-input">
                                <option value="967" selected>🇾🇪 +967</option>
                                <option value="966">🇸🇦 +966</option>
                                <option value="971">🇦🇪 +971</option>
                                <option value="968">🇴🇲 +968</option>
                                <option value="974">🇶🇦 +974</option>
                                <option value="965">🇰🇼 +965</option>
                                <option value="973">🇧🇭 +973</option>
                                <option value="962">🇯🇴 +962</option>
                                <option value="20">🇪🇬 +20</option>
                                <option value="249">🇸🇩 +249</option>
                                <option value="964">🇮🇶 +964</option>
                                <option value="963">🇸🇾 +963</option>
                                <option value="961">🇱🇧 +961</option>
                                <option value="1">🇺🇸 +1</option>
                                <option value="44">🇬🇧 +44</option>
                                <option value="90">🇹🇷 +90</option>
                            </select>
                            <input type="tel" id="reg-phone" class="mt-input" placeholder="77XXXXXXX (9 أرقام)" inputmode="numeric" autocomplete="tel-national" maxlength="20" pattern="(77|78|70|71|73)[0-9]{7}" title="أدخل رقم هاتف يمني من 9 أرقام يبدأ بـ (77, 78, 70, 71, 73)" oninput="App.onPhoneInputAutoFormat(this)" onpaste="setTimeout(() => App.onPhoneInputAutoFormat(this), 0)" required />
                        </div>
                    </div>
                    <div class="form-group sam-reg-grid-full">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">البريد الإلكتروني (اختياري)</label>
                        <input type="email" id="reg-email" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="owner@domain.com" />
                    </div>
                </div>

                <div style="font-size:13px; font-weight:800; color:#0f172a; margin:16px 0 8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">2️⃣ بيانات وخصائص الشبكة:</div>
                <div class="sam-reg-grid">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">اسم الشبكة *</label>
                        <input type="text" id="reg-net-name" class="mt-input" style="width:100%; height:40px; font-weight:700; box-sizing:border-box;" placeholder="مثال: شبكة الأفق اللاسلكية" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">المدينة / المنطقة</label>
                        <input type="text" id="reg-city" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: صنعاء - حدة" />
                    </div>
                    <div class="form-group sam-reg-grid-full">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">عملة الشبكة الافتراضية</label>
                        <select id="reg-currency" class="mt-input" style="width:100%; height:40px; font-weight:700; box-sizing:border-box;">
                            <option value="YER_SANAA">ريال يمني (صنعاء)</option>
                            <option value="YER_ADEN">ريال يمني (عدن)</option>
                            <option value="SAR">ريال سعودي (SAR)</option>
                            <option value="USD">دولار أمريكي (USD)</option>
                        </select>
                    </div>
                </div>

                <div style="font-size:13px; font-weight:800; color:#0f172a; margin:16px 0 8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">3️⃣ اختيار باقة الاشتراك للشبكة:</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:12px;">
                    ${plans.map((p, idx) => `
                        <label class="sam-plan-card" style="border:2px solid ${idx === 0 ? '#d97706' : '#e2e8f0'}; background:${idx === 0 ? '#fffbeb' : '#f8fafc'}; border-radius:10px; padding:12px; cursor:pointer; display:block; position:relative; transition:all 0.2s ease;">
                            <input type="radio" name="reg_plan_id" value="${p.id}" ${idx === 0 ? 'checked' : ''} style="position:absolute; top:12px; left:12px;" onchange="document.querySelectorAll('.sam-plan-card').forEach(c => { c.style.borderColor='#e2e8f0'; c.style.background='#f8fafc'; }); this.closest('.sam-plan-card').style.borderColor='#d97706'; this.closest('.sam-plan-card').style.background='#fffbeb';" />
                            <div style="font-weight:800; font-size:13px; color:#0f172a;">${this.escape(p.name)}</div>
                            <div style="font-size:16px; font-weight:900; color:#d97706; margin:4px 0;">
                                ${Number(p.monthly_price || 0) === 0 ? 'تجريبي / مجاني' : `${Number(p.monthly_price).toLocaleString()} ${this.escape(p.currency_code || 'YER')}`}
                            </div>
                            <div style="font-size:11px; color:#64748b; line-height:1.4;">
                                📡 ${p.max_routers || 'غير محدود'} راوتر<br/>
                                👥 ${p.max_active_users || 'غير محدود'} مستخدم<br/>
                                🎫 ${p.daily_card_limit ? p.daily_card_limit + ' كرت/يوم' : 'كروت غير محدودة'}
                            </div>
                        </label>
                    `).join('')}
                </div>

                <div style="font-size:13px; font-weight:800; color:#0f172a; margin:16px 0 8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">4️⃣ بيانات تسجيل دخول المالك:</div>
                <div class="sam-reg-grid">
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">اسم المستخدم للمدير *</label>
                        <input type="text" id="reg-username" class="mt-input" style="width:100%; height:40px; box-sizing:border-box;" placeholder="مثال: admin_horizon" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:700; font-size:12px; margin-bottom:4px; display:block;">كلمة المرور *</label>
                        <div class="sam-password-wrap">
                            <input type="password" id="reg-password" class="mt-input" placeholder="6+ خانات" required minlength="6" />
                            <button type="button" class="mt-btn" onclick="App.togglePasswordVisibility('reg-password', this)">👁️</button>
                        </div>
                    </div>
                </div>
            `;
        }

        this.openModal(`
            ${formStyles}
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 20px; border-bottom:1px solid #334155;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>✨</span> ${typeTitles[type] || 'إنشاء حساب جديد'}
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form id="sam-reg-form" onsubmit="App.submitRegistrationForm(event, '${type}')">
                <div class="mt-modal-body" style="padding:16px 20px; max-height:75vh; overflow-y:auto;">
                    ${formFieldsHtml}
                </div>
                <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; gap:8px;">
                    <button type="submit" id="reg-submit-btn" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 20px;">
                        📲 إرسال رمز التأكيد (OTP) والمتابعة
                    </button>
                    <button type="button" class="mt-btn" onclick="App.renderRegistrationTypeSelection()">◀ تغيير نوع الحساب</button>
                </div>
            </form>
        `, type === 'network_owner' ? '700px' : '580px');
    },

    async submitRegistrationForm(e, type) {
        e.preventDefault();
        const submitBtn = document.getElementById('reg-submit-btn');

        const fullname = document.getElementById('reg-fullname')?.value?.trim();
        const cc = document.getElementById('reg-phone-cc')?.value || '967';
        let rawPhone = document.getElementById('reg-phone')?.value?.trim() || '';
        rawPhone = rawPhone.replace(/^0+/, '').replace(/^\+/, '');

        const username = document.getElementById('reg-username')?.value?.trim();
        const password = document.getElementById('reg-password')?.value;

        if (!fullname || !rawPhone || !username || !password) {
            return this.toast('يرجى ملء جميع الحقول المطلوبة', 'warning');
        }

        if (cc === '967') {
            if (rawPhone.startsWith('967')) rawPhone = rawPhone.substring(3);
            if (!/^(77|78|70|71|73)\d{7}$/.test(rawPhone)) {
                return this.toast('⚠️ يرجى إدخال رقم هاتف يمني صحيح مكون من 9 أرقام ويبدأ بـ (77 أو 78 أو 70 أو 71 أو 73)', 'warning', 6000);
            }
        }

        const phone = rawPhone ? (rawPhone.startsWith(cc) ? rawPhone : (cc + rawPhone)) : '';

        const payload = {
            account_type: type,
            fullname: fullname,
            phone: phone,
            username: username,
            password: password
        };

        if (type === 'customer' || type === 'pos_agent') {
            payload.network_id = document.getElementById('reg-network-id')?.value;
            if (type === 'pos_agent') {
                payload.shop_name = document.getElementById('reg-shop-name')?.value?.trim();
            }
        } else if (type === 'network_owner') {
            payload.network_name = document.getElementById('reg-net-name')?.value?.trim();
            payload.network_code = '';
            payload.email = document.getElementById('reg-email')?.value?.trim();
            payload.city = document.getElementById('reg-city')?.value?.trim();
            payload.currency = document.getElementById('reg-currency')?.value;
            const selectedPlan = document.querySelector('input[name="reg_plan_id"]:checked');
            payload.plan_id = selectedPlan ? selectedPlan.value : null;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق وإرسال الرمز...';
        }

        try {
            const res = await this.api('registration_request_otp', {}, 'POST', payload);
            if (res && res.success) {
                this.toast('✅ ' + (res.message || 'تم إرسال رمز التحقق بنجاح!'), 'success', 5000);
                this._registrationPending = {
                    requestId: res.request_id,
                    phone: res.phone,
                    maskedPhone: res.masked_phone,
                    accountType: type,
                    fullname: fullname,
                    username: username,
                    payload: payload
                };
                this.renderRegistrationOtpStep(this._registrationPending);
            } else {
                this.toast('❌ ' + (res?.error || 'فشل إرسال رمز التحقق'), 'danger', 6000);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '📲 إرسال رمز التأكيد (OTP) والمتابعة';
                }
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر لإرسال الرمز', 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📲 إرسال رمز التأكيد (OTP) والمتابعة';
            }
        }
    },

    renderRegistrationOtpStep(pendingData) {
        if (window.__regOtpTimer) clearInterval(window.__regOtpTimer);
        let countdown = 60;

        this.openModal(`
            <style>
                @media (max-width: 500px) {
                    .sam-otp-footer {
                        flex-direction: column-reverse !important;
                        gap: 8px !important;
                    }
                    .sam-otp-footer button {
                        width: 100% !important;
                        text-align: center !important;
                    }
                }
            </style>
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:14px 18px; border-bottom:1px solid #334155;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>📲</span> تأكيد رمز التحقق لتفعيل الحساب
                </span>
                <span style="cursor:pointer; font-size:18px; color:#94a3b8;" onclick="App.closeModal()">✕</span>
            </div>
            <form id="sam-reg-otp-form" onsubmit="App.submitRegistrationVerify(event)">
                <div class="mt-modal-body" style="padding:20px;">
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; margin-bottom:18px; text-align:center;">
                        <div style="font-size:13px; color:#166534; font-weight:700;">
                            تم إرسال رمز تأكيد مكوّن من 6 أرقام إلى واتساب على الرقم:
                        </div>
                        <div style="font-size:17px; font-weight:900; color:#15803d; direction:ltr; margin-top:4px;">
                            ${this.escape(pendingData.maskedPhone || pendingData.phone)}
                        </div>
                    </div>

                    <div class="form-group" style="text-align:center; margin-bottom:16px;">
                        <label style="font-weight:800; font-size:13.5px; color:#1e293b; display:block; margin-bottom:8px;">
                            أدخل رمز التحقق (OTP) *
                        </label>
                        <input type="text" id="reg-otp-code" class="mt-input" style="font-size:22px; font-weight:900; letter-spacing:8px; text-align:center; width:220px; max-width:100%; border:2px solid #0284c7; border-radius:10px; padding:8px 12px; margin:0 auto; display:block; height:46px; box-sizing:border-box;" placeholder="------" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required autofocus />
                        <div style="font-size:11.5px; color:#64748b; margin-top:6px;">أدخل الأرقام الستة الواصلة إليك في رسالة الواتساب</div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                        <span>لم يصلك الرمز؟</span>
                        <button type="button" id="reg-resend-btn" class="mt-btn mt-btn-sm" style="font-size:11.5px; padding:3px 10px;" disabled onclick="App.resendRegistrationOtp()">
                            إعادة الإرسال (<span id="reg-resend-countdown">60</span>s)
                        </button>
                    </div>
                </div>
                <div class="mt-modal-footer sam-otp-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; gap:8px;">
                    <button type="submit" id="reg-verify-btn" class="mt-btn mt-btn-success" style="font-weight:800; font-size:14px; padding:8px 24px;">
                        ✅ تأكيد وإنشاء الحساب
                    </button>
                    <button type="button" class="mt-btn" onclick="App.renderRegistrationForm('${pendingData.accountType}')">◀ تعديل البيانات</button>
                </div>
            </form>
        `, '490px');

        window.__regOtpTimer = setInterval(() => {
            countdown--;
            const countEl = document.getElementById('reg-resend-countdown');
            const resendBtn = document.getElementById('reg-resend-btn');
            if (countEl) countEl.innerText = countdown;
            if (countdown <= 0) {
                clearInterval(window.__regOtpTimer);
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.innerText = 'إعادة إرسال الرمز الآن 🔄';
                }
            }
        }, 1000);
    },

    async resendRegistrationOtp() {
        if (!this._registrationPending) return;
        this.toast('جاري إعادة إرسال رمز التحقق…', 'info');
        const payload = this._registrationPending.payload || {
            account_type: this._registrationPending.accountType,
            phone: this._registrationPending.phone,
            fullname: this._registrationPending.fullname,
            username: this._registrationPending.username,
            password: 'dummy_for_resend'
        };
        const res = await this.api('registration_request_otp', {}, 'POST', payload);
        if (res && res.success) {
            this.toast('تم إرسال رمز جديد بنجاح 🟢', 'success');
            this._registrationPending.requestId = res.request_id;
            this.renderRegistrationOtpStep(this._registrationPending);
        } else {
            this.toast(res?.error || 'تعذر إعادة إرسال الرمز', 'danger');
        }
    },

    async submitRegistrationVerify(e) {
        e.preventDefault();
        const pending = this._registrationPending;
        if (!pending) return;

        const otp = document.getElementById('reg-otp-code')?.value?.trim();
        const verifyBtn = document.getElementById('reg-verify-btn');

        if (!otp || otp.length < 6) {
            return this.toast('يرجى إدخال رمز التحقق المكون من 6 أرقام', 'warning');
        }

        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التفعيل والإنشاء...';
        }

        try {
            const res = await this.api('registration_verify_and_create', {}, 'POST', {
                request_id: pending.requestId,
                phone: pending.phone,
                otp_code: otp
            });

            if (res && res.success) {
                if (window.__regOtpTimer) clearInterval(window.__regOtpTimer);

                if (res.account_type === 'network_owner') {
                    // Sovereign Network Owner Active Account Modal
                    this.openModal(`
                        <div class="mt-modal-header" style="background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#fff; padding:16px 20px;">
                            <span style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                                <span>🎉</span> تم إنشاء وتفعيل شبكتك بنجاح!
                            </span>
                            <span style="cursor:pointer; font-size:18px; color:#a7f3d0;" onclick="App.closeModal()">✕</span>
                        </div>
                        <div class="mt-modal-body" style="padding:24px; text-align:center;">
                            <div style="width:64px; height:64px; border-radius:50%; background:#dcfce7; color:#059669; font-size:32px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px; box-shadow:0 4px 14px rgba(5,150,105,0.25);">
                                👑
                            </div>
                            <div style="font-size:17px; font-weight:900; color:#0f172a;">مرحباً بك كمالك شبكة في منصة SAM</div>
                            <div style="font-size:12.5px; color:#64748b; margin-top:4px;">تم تسجيل بيانات شبكتك وتفعيل حسابك بنجاح</div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin:16px 0; text-align:right; font-size:13px; line-height:1.8;">
                                <div>🏷️ <b>اسم الشبكة:</b> <span style="color:#0284c7; font-weight:800;">${this.escape(res.network_name)} (${this.escape(res.network_code)})</span></div>
                                <div>📦 <b>باقة الاشتراك:</b> <span style="font-weight:700;">${this.escape(res.plan_name)}</span></div>
                                <div>👤 <b>اسم المستخدم:</b> <code>${this.escape(pending.username)}</code></div>
                                <div>🟢 <b>حالة الشبكة والحساب:</b> <span style="background:#dcfce7; color:#166534; font-weight:800; padding:2px 8px; border-radius:6px; font-size:11.5px;">مفعل ونشط الآن فوراً</span></div>
                            </div>

                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; color:#1e40af; font-size:12px; text-align:right; line-height:1.5;">
                                🚀 يمكنك الآن تسجيل الدخول مباشرة إلى لوحة التحكم، وإضافة راوترات الميكروتك وتوليد كروت الإنترنت وإدارتها.
                            </div>
                        </div>
                        <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:center; border-top:1px solid #e2e8f0;">
                            <button type="button" class="mt-btn mt-btn-success" style="padding:8px 30px; font-weight:800; font-size:14px;" onclick="App.closeModal(); document.getElementById('login-user').value='${this.escape(res.username || pending.username)}'; document.getElementById('login-pass').focus();">
                                🔑 تسجيل الدخول إلى لوحة التحكم الآن
                            </button>
                        </div>
                    `, '560px');
                } else {
                    // Customer or POS Agent Success
                    this.openModal(`
                        <div class="mt-modal-header" style="background:#16a34a; color:#fff; padding:16px 20px;">
                            <span style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                                <span>🎉</span> تم تفعيل الحساب بنجاح!
                            </span>
                            <span style="cursor:pointer; font-size:18px;" onclick="App.closeModal()">✕</span>
                        </div>
                        <div class="mt-modal-body" style="padding:24px; text-align:center;">
                            <div style="width:64px; height:64px; border-radius:50%; background:#dcfce7; color:#16a34a; font-size:32px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
                                ✅
                            </div>
                            <div style="font-size:17px; font-weight:900; color:#0f172a;">تهانينا! حسابك جاهز للاستخدام</div>
                            <div style="font-size:13px; color:#64748b; margin-top:4px;">${this.escape(res.message || 'تم تأكيد رقم هاتفك وتفعيل الحساب بنجاح.')}</div>
                            <div style="margin-top:12px; font-size:14px; font-weight:800; color:#0284c7;">
                                اسم المستخدم: <code>${this.escape(res.username || pending.username)}</code>
                            </div>
                        </div>
                        <div class="mt-modal-footer" style="padding:12px 18px; background:#f8fafc; display:flex; justify-content:center; border-top:1px solid #e2e8f0;">
                            <button type="button" class="mt-btn mt-btn-success" style="padding:8px 30px; font-weight:800;" onclick="App.closeModal(); document.getElementById('login-user').value='${this.escape(res.username || pending.username)}'; document.getElementById('login-pass').focus();">
                                🔑 تسجيل الدخول الآن
                            </button>
                        </div>
                    `, '480px');
                }
            } else {
                this.toast('❌ ' + (res?.error || 'رمز التحقق غير صحيح أو تعذر إنشاء الحساب'), 'danger', 6000);
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = '✅ تأكيد وإنشاء الحساب';
                }
            }
        } catch (err) {
            this.toast('حدث خطأ أثناء تأكيد الرمز', 'danger');
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = '✅ تأكيد وإنشاء الحساب';
            }
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const rememberEl = document.getElementById('login-remember-me');
        const remember = rememberEl ? rememberEl.checked : true;
        const isOwnerPortal = window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php');

        this.initAudioUnlock();
        const res = await this.api('login', {}, 'POST', { username: u, password: p, portal_type: isOwnerPortal ? 'owner' : 'standard' });
        if (res && res.success) {
            this.user = res.user;
            this.userRole = res.role || 'superadmin';
            this.userPermissions = res.permissions || [];
            this.userFullname = res.fullname || res.user;
            this.adminId = res.admin_id || 1;
            this.isSystemOwner = !!res.is_system_owner || res.role === 'system_owner' || Number(this.adminId) === 1;
            this.currentAdminDiscountRate = parseFloat(res.discount_rate) || 0;
            this.networks = Array.isArray(res.networks) ? res.networks : [];
            this.activeNetwork = res.active_network || this.networks.find(n => Number(n.network_id) === Number(res.active_network_id)) || null;
            this.activeNetworkId = Number(res.active_network_id || this.activeNetwork?.network_id || 0);

            if (isOwnerPortal && !this.isSystemOwner) {
                this.toast('⛔ تم رفض الدخول: هذا المنفذ مخصص حصرياً لمالك النظام والتحكم السيادي.', 'danger', 7000);
                this.logout();
                return;
            }

            // Save persistent authentication tokens in localStorage
            if (res.access_token) {
                localStorage.setItem('sam_access_token', res.access_token);
            }
            if (res.refresh_token) {
                localStorage.setItem('sam_refresh_token', res.refresh_token);
            }
            localStorage.setItem('sam_remember_me', remember ? 'true' : 'false');
            if (remember) {
                localStorage.setItem('sam_saved_username', u);
            } else {
                localStorage.removeItem('sam_saved_username');
            }

            this.showMainApp();
            this.autoRegisterAndroidDevice();
            this.requestNotificationPermission();
            this.startNotificationPoller(25000);

            const hashTab = (window.location.hash || '').replace(/^#/, '').trim();
            const defaultInitialTab = isOwnerPortal ? 'owner_portal_overview' : 'dashboard';
            const targetTab = (hashTab && this.hasAccess(hashTab)) ? hashTab : defaultInitialTab;
            this.switchTab(targetTab);
        } else {
            this.toast(res?.error || 'Login failed', 'danger');
        }
    },

    openOwnerPortal() {
        const isAlreadyOwner = window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php');
        if (isAlreadyOwner) {
            this.switchTab('owner_portal_overview');
            return;
        }
        const targetUrl = 'https://palapox.ddns.net/owner.php';
        window.open(targetUrl, '_blank');
    },

    openStandardPortal() {
        const mainPort = window.__SAM_MAIN_PORT || (location.protocol === 'https:' ? 443 : 80);
        const portStr = (mainPort === 80 || mainPort === 443 || !mainPort) ? '' : `:${mainPort}`;
        const targetUrl = `${location.protocol}//${location.hostname}${portStr}/index.php`;
        window.open(targetUrl, '_blank');
    },

    async logout() {
        try {
            sessionStorage.removeItem('sam_active_tab');
            localStorage.removeItem('sam_active_tab');
            localStorage.removeItem('sam_access_token');
            localStorage.removeItem('sam_refresh_token');
            this.stopNotificationPoller();
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname);
            }
        } catch (e) {}
        await this.api('logout');
        this.user = null;
        this.showLogin();
    },

    showOwnerForbiddenNetworkAccessModal(tab) {
        const modalContent = `
            <div style="text-align:center; padding:20px 12px; direction:rtl;">
                <div style="font-size:52px; margin-bottom:14px;">🛡️</div>
                <h3 style="color:#b91c1c; font-size:19px; font-weight:800; margin-bottom:12px;">
                    منطقة خاصة بإدارة وتشغيل الشبكات
                </h3>
                <p style="color:#1e293b; font-size:14px; line-height:1.9; max-width:540px; margin:0 auto 16px;">
                    تم فصل بوابة مالك المنظومة تماماً عن واجهات تشغيل الشبكات (الكروت، المشتركين، أجهزة الراوتر، نقاط البيع).<br>
                    <b>الشبكات تعتبر عملاء لدى النظام</b>، والدخول لواجهاتها التشغيلية مخصص حصرياً <b>لحسابات مدراء تلك الشبكات</b> عبر البوابة الرئيسية.
                </p>
                <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-bottom:20px; font-size:13px; color:#475569; text-align:right; line-height:1.7;">
                    💡 <b>ما الذي يمكنك فعله من بوابة المالك؟</b><br>
                    • إدارة بيانات الشبكات والعملاء وتفعيل أو تعليق اشتراكاتها.<br>
                    • إضافة وتعديل حسابات مدراء الشبكات وتعيين كلمات المرور لهم.<br>
                    • مراقبة الخادم، فحص النظام، وإرسال التعميمات عبر الواتساب وتلغرام.
                </div>
                <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                    <button type="button" class="mt-btn mt-btn-primary" style="font-weight:800; padding:8px 18px;" onclick="App.closeModal(); App.switchTab('owner_clients_networks')">
                        🏢 الذهاب إلى إدارة شبكات العملاء
                    </button>
                    <button type="button" class="mt-btn" style="background:#475569; color:#fff; font-weight:700; padding:8px 18px;" onclick="App.closeModal()">
                        إغلاق
                    </button>
                </div>
            </div>
        `;
        this.showModal('🔒 حظر الوصول لواجهات الشبكات', modalContent, '600px');
    },

    async switchActiveNetwork(networkId) {
        const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        if (isOwnerPortal) {
            this.showOwnerForbiddenNetworkAccessModal();
            return;
        }
        const targetId = Number(networkId || 0);
        if (!targetId || targetId === Number(this.activeNetworkId)) return;
        const res = await this.api('switch_active_network', { network_id: targetId }, 'POST');
        if (!res?.success) return this.toast(res?.error || 'تعذر تغيير الشبكة النشطة', 'danger');
        this.activeNetworkId = Number(res.active_network_id || targetId);
        this.activeNetwork = res.active_network || this.networks.find(n => Number(n.network_id) === targetId) || null;
        if (Array.isArray(res.networks) && res.networks.length > 0) {
            this.networks = res.networks;
        }
        this.userRole = res.role || this.userRole;
        this.userPermissions = res.permissions || [];
        try { sessionStorage.clear(); } catch (e) {}
        this.currentTab = 'dashboard';
        await this.loadExchangeRates();
        this.showMainApp();
        this.switchTab('dashboard', false);
        this.toast(`تم الانتقال بنجاح إلى شبكة: ${this.activeNetwork?.name || this.activeNetwork?.code || ('شبكة ' + targetId)} 🚀`, 'success');
    },

    openNetworkSwitcherModal() {
        const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        if (isOwnerPortal) {
            this.showOwnerForbiddenNetworkAccessModal();
            return;
        }
        const networks = Array.isArray(this.networks) && this.networks.length > 0 
            ? this.networks 
            : (this.activeNetwork ? [this.activeNetwork] : []);
        
        const content = `
        <div style="padding:4px 0;">
            <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#fff; padding:16px 20px; border-radius:10px; margin-bottom:18px; border:1px solid #334155;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <div style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                            <span>🌐</span> <span>بوابات وشبكات المنظومة المتاحة</span>
                        </div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:4px;">
                            اختر الشبكة أو الفرع المطلوب للعمل عليه. يتم حصر وتوجيه كافة العمليات والبيانات والتقارير فوراً للشبكة المختارة.
                        </div>
                    </div>
                    <span class="mt-badge" style="background:#0284c7; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:20px;">
                        الشبكة الحالية: ${this.escape(this.activeNetwork?.name || this.activeNetwork?.code || ('شبكة ' + this.activeNetworkId))}
                    </span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px; max-height:60vh; overflow-y:auto; padding:2px;">
                ${networks.map(net => {
                    const netId = Number(net.network_id || net.id || 0);
                    const isCurrent = netId === Number(this.activeNetworkId);
                    return `
                    <div style="border:2px solid ${isCurrent ? '#0284c7' : '#e2e8f0'}; background:${isCurrent ? '#f0f9ff' : '#ffffff'}; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.2s; box-shadow:${isCurrent ? '0 4px 12px rgba(2,132,199,0.15)' : '0 2px 5px rgba(0,0,0,0.04)'};" class="sam-net-card">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                                <span style="font-family:monospace; font-weight:800; font-size:12px; background:${isCurrent ? '#0284c7' : '#e2e8f0'}; color:${isCurrent ? '#fff' : '#334155'}; padding:3px 8px; border-radius:6px;">
                                    ${this.escape(net.code || ('NET-00' + netId))}
                                </span>
                                ${isCurrent ? `
                                <span style="background:#10b981; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; display:flex; align-items:center; gap:4px;">
                                    <span>✓</span> <span>الشبكة النشطة</span>
                                </span>` : `
                                <span style="background:#f1f5f9; color:#64748b; font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px;">
                                    متاحة
                                </span>`}
                            </div>
                            <h4 style="margin:0 0 6px 0; font-size:15px; font-weight:800; color:#0f172a;">
                                ${this.escape(net.name || ('شبكة ' + netId))}
                            </h4>
                            <div style="font-size:11.5px; color:#64748b; margin-bottom:14px; line-height:1.5;">
                                مستوى الوصول: <b>${this.escape(net.access_level || 'كامل')}</b>
                            </div>
                        </div>
                        <div>
                            ${isCurrent ? `
                            <button type="button" class="mt-btn" style="width:100%; background:#0284c7; color:#fff; font-weight:800; justify-content:center; cursor:default;" disabled>
                                ✓ أنت تعمل عليها حالياً
                            </button>` : `
                            <button type="button" class="mt-btn mt-btn-primary" style="width:100%; font-weight:800; justify-content:center;" onclick="App.closeModal(); App.switchActiveNetwork(${netId})">
                                الانتقال والعمل على هذه الشبكة 🚀
                            </button>`}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>

            ${(this.isSystemOwner || this.userRole === 'system_owner' || Number(this.adminId) === 1) ? `
            <div style="margin-top:16px; padding-top:14px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="font-size:12px; color:#64748b;">
                    👑 كمالك للنظام يمكنك أيضاً إدارة الشبكات والفروع والتفويضات من البوابة السيادية.
                </div>
                <button type="button" class="mt-btn" style="background:linear-gradient(135deg, #d97706 0%, #b45309 100%); color:#fff; font-weight:700; font-size:12px; border:none;" onclick="App.closeModal(); App.switchTab('owner_portal_overview')">
                    👑 فتح بوابة مالك النظام
                </button>
            </div>` : ''}
        </div>
        `;

        this.showModal('🌐 بوابات وشبكات المنظومة (Network Gateways)', content, '760px');
    },

    toggleMobileSidebar() {
        const sidebar = document.querySelector('.mt-sidebar');
        const overlay = document.getElementById('mt-sidebar-overlay');
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
    },

    closeMobileSidebar() {
        const sidebar = document.querySelector('.mt-sidebar');
        const overlay = document.getElementById('mt-sidebar-overlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    },

    showMainApp() {
        const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));

        const sovereignDepartments = [
            {
                id: 'sovereign_core',
                name: 'القيادة وشبكات العملاء',
                icon: '👑',
                color: '#d97706',
                items: [
                    { id: 'owner_portal_overview', name: 'لوحة القيادة السيادية (Sovereign Hub)', icon: '👑' },
                    { id: 'owner_clients_networks', name: 'إدارة شبكات العملاء (Clients Hub)', icon: '🏢' },
                    { id: 'network_subscriptions', name: 'باقات واشتراكات العملاء', icon: '💎' },
                    { id: 'owner_network_admins', name: 'إدارة مدراء وتفويض الشبكات', icon: '👥' },
                    { id: 'owner_master_finance', name: 'المركز المالي الشامل للمنظومة', icon: '💰' }
                ]
            },
            {
                id: 'sovereign_server',
                name: 'إدارة السيرفر والمنظومة الشاملة',
                icon: '🛡️',
                color: '#0f172a',
                items: [
                    { id: 'owner_firewall', name: 'جدار الحماية والأمان السيادي', icon: '🛡️' },
                    { id: 'system_settings', name: 'التحكم بالسيرفر والخدمات', icon: '🖥️' },
                    { id: 'owner_diagnostics', name: 'الفحص التشخيصي وصحة النظام', icon: '🩺' },
                    { id: 'owner_logs', name: 'سجلات النظام والأخطاء', icon: '📋' },
                    { id: 'owner_broadcast', name: 'التنبيهات والبث العام للعملاء', icon: '📢' }
                ]
            },
            {
                id: 'sovereign_channels',
                name: 'قنوات المالك السيادية',
                icon: '📡',
                color: '#16a34a',
                items: [
                    { id: 'owner_whatsapp', name: 'واتساب مالك المنظومة (Sovereign WA)', icon: '📱' },
                    { id: 'owner_telegram', name: 'بوت تلغرام مالك المنظومة', icon: '✈️' }
                ]
            }
        ];

        if (isOwnerPortal) {
            this.departments = sovereignDepartments;
        }

        const deptsToRender = isOwnerPortal 
            ? sovereignDepartments 
            : this.departments.filter(d => d.id !== 'system_owner' && d.id !== 'sovereign_core' && d.id !== 'sovereign_server' && d.id !== 'sovereign_channels' && !d.ownerOnly);

        const deptsHtml = deptsToRender.map(dept => {
            const visibleItems = dept.items.filter(item => {
                if (!isOwnerPortal && ['owner_portal_overview', 'owner_clients_networks', 'owner_network_admins', 'owner_alerts', 'sstp_vpn', 'owner_firewall', 'system_settings', 'network_subscriptions', 'owner_diagnostics', 'owner_logs', 'owner_broadcast', 'owner_whatsapp', 'owner_telegram'].includes(item.id)) return false;
                return this.hasAccess(item.id);
            });
            if (visibleItems.length === 0) return '';
            const deptCleanName = this.cleanTitle ? this.cleanTitle(dept.name, dept.icon) : dept.name;
            return `
            <div class="mt-nav-dept" id="dept-${dept.id}">
                <div class="mt-nav-dept-header" onclick="App.toggleDepartment('${dept.id}')" title="طي / فتح قسم ${deptCleanName}">
                    <div class="mt-nav-dept-title">
                        <span style="font-size:13px;">${dept.icon}</span>
                        <span>${deptCleanName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="mt-nav-dept-badge">${visibleItems.length}</span>
                        <span class="mt-nav-dept-arrow">▼</span>
                    </div>
                </div>
                <div class="mt-nav-dept-items">
                    ${visibleItems.map(item => {
                        const itemCleanName = this.cleanTitle ? this.cleanTitle(item.name, item.icon) : item.name;
                        const isActive = item.id === (this.currentTab || (isOwnerPortal ? 'owner_portal_overview' : 'dashboard'));
                        return `
                        <div class="mt-nav-item ${isActive ? 'active' : ''}" onclick="App.switchTab('${item.id}')" id="nav-${item.id}" data-search="${this.escape((deptCleanName + ' ' + itemCleanName + ' ' + item.id).toLowerCase())}">
                            <i>${item.icon}</i> <span>${itemCleanName}</span>
                        </div>
                    `}).join('')}
                </div>
            </div>`;
        }).join('');

        const hb = this.uiSettings?.header_buttons || ['network_switcher', 'notif', 'whatsapp', 'portal', 'lang', 'theme', 'logout'];
        document.getElementById('app-root').innerHTML = `
        <header class="mt-header" style="${isOwnerPortal ? 'border-bottom: 2px solid #d97706; background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);' : ''}">
            <div class="mt-header-left">
                <button class="mt-mobile-toggle" onclick="App.toggleMobileSidebar()" title="القائمة الرئيسية" aria-label="القائمة">
                    ☰
                </button>
                <button type="button" class="mt-header-back-btn" id="app-header-back-btn" onclick="App.goBack()" title="الرجوع للشاشة السابقة" style="display:none; align-items:center; gap:4px; padding:3px 10px; font-size:12px; font-weight:800; background:#334155; color:#fff; border-radius:6px; border:1px solid #475569; cursor:pointer;">
                    <span>◀️ رجوع</span>
                </button>
                <div class="mt-brand">
                    ${isOwnerPortal ? `
                    <span style="color:#f59e0b; font-size:18px;">👑</span>
                    <span class="brand-title-full" style="color:#fbbf24; font-weight:800; font-size:14px;">SAM — بوابة مالك النظام السيادية</span>
                    <span class="brand-title-short" style="display:none; font-weight:800; color:#fbbf24;">👑 Sovereign</span>
                    <span class="badge" style="background:#d97706; color:#fff; font-weight:800; font-size:10.5px; border-radius:4px; padding:2px 6px;">SOVEREIGN OWNER</span>
                    ` : `
                    <span style="color:#0078d7; font-size:16px;">▤</span>
                    <span class="brand-title-full">SAM - نظام الإدارة الذكي</span>
                    <span class="brand-title-short" style="display:none; font-weight:700;">SAM</span>
                    <span class="badge" style="background:#27ae60;">${this.userRole}</span>
                    `}
                </div>
            </div>
            <div class="mt-header-right">
                ${isOwnerPortal ? `
                <button id="sam-header-whatsapp-owner" class="mt-btn" style="display:inline-flex; align-items:center; gap:6px; background:#16a34a; color:#fff; font-weight:800; font-size:12px; padding:4px 10px; border-radius:8px; border:none; cursor:pointer;" onclick="App.switchTab('owner_whatsapp')" title="بوابة واتساب المالك والربط">
                    <span>📱</span> <span class="btn-label">واتساب المالك</span>
                </button>
                <button id="sam-header-telegram-owner" class="mt-btn" style="display:inline-flex; align-items:center; gap:6px; background:#0284c7; color:#fff; font-weight:800; font-size:12px; padding:4px 10px; border-radius:8px; border:none; cursor:pointer;" onclick="App.switchTab('owner_telegram')" title="بوت تلغرام مالك المنظومة">
                    <span>✈️</span> <span class="btn-label">تلغرام المالك</span>
                </button>
                ` : `
                <div id="sam-header-net-switcher" class="sam-header-net-switcher" style="display:${hb.includes('network_switcher') ? 'flex' : 'none'};align-items:center;gap:4px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:8px;padding:2px 7px;font-size:11.5px;font-weight:800;" title="الشبكة النشطة الحالية - انقر للتبديل">
                    <span class="sam-net-icon" style="cursor:pointer;" onclick="App.openNetworkSwitcherModal()" title="عرض بوابات وشبكات المنظومة">🌐</span>
                    <select id="sam-active-network" class="sam-active-network-select" onchange="App.switchActiveNetwork(this.value)" style="max-width:160px;background:transparent;color:#38bdf8;border:0;border-radius:4px;padding:2px 4px;font-weight:800;font-size:11.5px;cursor:pointer;outline:none;" title="التبديل المباشر بين الشبكات">
                        ${this.networks.map(n => `<option value="${Number(n.network_id)}" ${Number(n.network_id) === Number(this.activeNetworkId) ? 'selected' : ''} style="background:#1e293b; color:#fff;">${this.escape(n.name || n.code || `شبكة ${n.network_id}`)}</option>`).join('')}
                    </select>
                    <button type="button" class="sam-net-switcher-btn net-switcher-btn-modal" onclick="App.openNetworkSwitcherModal()" style="background:#1e293b; color:#94a3b8; border:1px solid #475569; border-radius:5px; padding:1px 6px; font-size:10.5px; font-weight:700; cursor:pointer;" title="فتح نافذة بوابات الشبكات">
                        بوابات الشبكات ▾
                    </button>
                </div>
                `}
                <button id="sam-header-notif" class="mt-btn" style="display:${hb.includes('notif') ? 'inline-flex' : 'none'};position:relative; font-size:12px; padding:3px 8px; background:#1e293b; color:#fff; border-radius:8px;" onclick="${isOwnerPortal ? "App.switchTab('owner_alerts')" : "App.showNotificationsModal()"}" title="مركز الإشعارات والتنبيهات">
                    🔔 <span id="notif-count-badge" class="badge" style="background:#e74c3c; color:#fff; font-size:10px; border-radius:10px; padding:1px 5px;">0</span>
                </button>
                ${!isOwnerPortal ? `
                <button id="sam-header-whatsapp" class="mt-btn" style="display:${hb.includes('whatsapp') ? 'inline-flex' : 'none'};font-size:12px; padding:3px 8px; background:#16a34a; color:#fff; border-radius:8px;" onclick="App.switchTab('whatsapp_settings')" title="إعدادات وخدمات واتساب">
                    📱 <span class="btn-label">واتساب</span>
                </button>` : ''}
                <span class="user-greeting" style="font-size:12px; opacity:0.9;">👤 <b>${this.userFullname}</b></span>
                <button id="sam-header-lang" class="mt-btn" style="display:${hb.includes('lang') ? 'inline-flex' : 'none'};padding:2px 7px; font-size:11px;" onclick="App.setLang(App.lang === 'ar' ? 'en' : 'ar')">
                    ${this.lang === 'ar' ? 'EN' : 'عربي'}
                </button>
                <button id="sam-header-theme" class="mt-btn" style="display:${hb.includes('theme') ? 'inline-flex' : 'none'};padding:2px 7px; font-size:11px;" onclick="App.setTheme(App.theme === 'dark' ? 'light' : 'dark')">
                    ${this.theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button id="sam-header-password" class="mt-btn" style="padding:2px 7px; font-size:11px; margin-left:4px;" onclick="App.showChangePasswordModal()" title="تغيير كلمة المرور">
                    🔑 <span class="btn-label">كلمة المرور</span>
                </button>
                <button class="mt-btn mt-btn-danger" style="padding:2px 7px; font-size:11px;" onclick="App.logout()" title="تسجيل الخروج">
                    🚪 <span class="btn-label">${this.t('logout')}</span>
                </button>
            </div>
        </header>
        <div class="mt-container">
            <div class="mt-sidebar-overlay" id="mt-sidebar-overlay" onclick="App.closeMobileSidebar()"></div>
            <nav class="mt-sidebar" style="${isOwnerPortal ? 'border-inline-end: 1px solid rgba(217,119,6,0.3);' : ''}">
                <div class="mt-sidebar-close-btn" style="display:none;">
                    <span>📋 أقسام النظام</span>
                    <button onclick="App.closeMobileSidebar()" style="background:none; border:none; color:#cbd5e1; font-size:18px; cursor:pointer; padding:2px 6px;">✕</button>
                </div>
                ${isOwnerPortal ? `
                <div class="sam-sidebar-sovereign-card" style="margin:8px 10px 12px; padding:12px 14px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border:1px solid #d97706; border-radius:10px; color:#fff; display:flex; flex-direction:column; gap:6px; box-shadow:0 4px 12px rgba(217,119,6,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; color:#f59e0b; font-weight:800; display:flex; align-items:center; gap:6px;">
                            <span>👑</span> <span>التحكم السيادي العام</span>
                        </span>
                        <span style="font-size:10px; background:#d97706; color:#fff; padding:1px 6px; border-radius:4px; font-weight:800;">HTTPS</span>
                    </div>
                    <div style="font-size:11px; color:#94a3b8; line-height:1.4;">
                        إدارة المنظومة المركزية، السيرفر، التراخيص، والأنفاق بدون قيود الشبكات الفرعية.
                    </div>
                    <button type="button" onclick="App.openStandardPortal()" style="margin-top:4px; background:rgba(255,255,255,0.06); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); border-radius:6px; padding:5px 8px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='rgba(56,189,248,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                        <span>🏢</span> <span>فتح إدارة الشبكات (Port 80) ↗</span>
                    </button>
                </div>
                ` : `
                <div class="sam-sidebar-network-box" style="margin:8px 10px 10px; padding:10px 12px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border:1px solid #334155; border-radius:10px; color:#fff; display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; color:#94a3b8; font-weight:700;">🌐 بوابة الشبكة الحالية:</span>
                        <span style="font-size:10.5px; background:#0284c7; color:#fff; padding:1px 6px; border-radius:4px; font-weight:800;">${this.escape(this.activeNetwork?.code || ('NET-' + this.activeNetworkId))}</span>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <select id="sam-sidebar-active-network" onchange="App.switchActiveNetwork(this.value); App.closeMobileSidebar();" style="flex:1; min-width:0; background:#0f172a; color:#38bdf8; border:1px solid #475569; border-radius:6px; padding:5px 8px; font-weight:700; font-size:12px; outline:none; cursor:pointer;">
                            ${this.networks.map(n => `<option value="${Number(n.network_id)}" ${Number(n.network_id) === Number(this.activeNetworkId) ? 'selected' : ''} style="background:#1e293b; color:#fff;">${this.escape(n.name || n.code || `شبكة ${n.network_id}`)}</option>`).join('')}
                        </select>
                        <button type="button" onclick="App.closeMobileSidebar(); App.openNetworkSwitcherModal();" style="background:#0284c7; color:#fff; border:none; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:800; cursor:pointer; white-space:nowrap;" title="استعراض كافة بوابات الشبكات">
                            الكل ▾
                        </button>
                    </div>
                </div>
                `}
                <div class="mt-sidebar-search">
                    <input type="text" id="nav-search-input" placeholder="${isOwnerPortal ? '🔍 ابحث في أقسام مالك النظام...' : '🔍 ابحث عن نافذة أو قسم...'}" oninput="App.filterNavItems(this.value)" autocomplete="off" />
                </div>
                ${deptsHtml}
            </nav>
            <main class="mt-content">
                <!-- Department Breadcrumbs -->
                <div class="mt-breadcrumb-bar" id="app-breadcrumb-bar" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div class="mt-breadcrumb-path" style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                        <button type="button" class="mt-btn" id="bc-back-btn" onclick="App.goBack()" style="display:none; padding:3px 9px; font-size:11.5px; font-weight:800; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" title="الرجوع للخلف">
                            ◀️ رجوع
                        </button>
                        <span class="bc-home-icon" style="color:#64748b;">${isOwnerPortal ? '👑 السيادة' : '🏠 النظام'}</span>
                        <span class="bc-sep" style="color:#cbd5e1;">/</span>
                        <span class="dept-name" id="bc-dept-name">${isOwnerPortal ? '👑 القيادة والشبكات والاشتراكات' : 'الإدارة العامة والرئيسية'}</span>
                        <span class="bc-sep" style="color:#cbd5e1;">/</span>
                        <span class="tab-name" id="bc-tab-name" style="font-weight:700;">${isOwnerPortal ? '👑 لوحة القيادة السيادية (Sovereign Hub)' : '📊 الرئيسية والمؤشرات'}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button type="button" class="mt-btn sam-table-customizer-btn" id="bc-table-customizer-btn" onclick="window.SamTableManager && SamTableManager.openModal()" style="display:none; align-items:center; gap:4px; padding:3px 9px; font-size:11.5px; font-weight:700; background:var(--bg-window, #fff); color:var(--text-main, #0f172a); border:1px solid var(--border-color, #cbd5e1); border-radius:6px; cursor:pointer;" title="تخصيص أعمدة وترتيب الجدول الحالي">
                            ⚙️ تخصيص الجدول
                        </button>
                        <div class="breadcrumb-app-subtitle" style="font-size:11px; color:#64748b; font-weight:600; white-space:nowrap;">
                            <span>${isOwnerPortal ? '👑 بوابة التحكم السيادية الشاملة للمنظومة' : 'نظام إدارة المشتركين والشبكة'}</span>
                        </div>
                    </div>
                </div>
                <div id="main-view" style="flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column;">
                    <!-- Content injected here -->
                </div>
            </main>
        </div>
        ${isOwnerPortal ? `
        <nav class="mt-mobile-nav" id="mt-mobile-nav">
            <button class="mt-mobile-nav-btn active" id="mob-nav-owner_portal_overview" onclick="App.switchTab('owner_portal_overview')"><span class="icon">👑</span><span>السيادية</span></button>
            <button class="mt-mobile-nav-btn" id="mob-nav-network_subscriptions" onclick="App.switchTab('network_subscriptions')"><span class="icon">💎</span><span>الشبكات</span></button>
            <button class="mt-mobile-nav-btn" id="mob-nav-owner_network_admins" onclick="App.switchTab('owner_network_admins')"><span class="icon">👥</span><span>المدراء</span></button>
            <button class="mt-mobile-nav-btn" id="mob-nav-system_settings" onclick="App.switchTab('system_settings')"><span class="icon">🛡️</span><span>السيرفر</span></button>
            <button class="mt-mobile-nav-btn" id="mob-nav-owner_alerts" onclick="App.switchTab('owner_alerts')"><span class="icon">🔔</span><span>التنبيهات</span></button>
        </nav>
        ` : `
        <nav class="mt-mobile-nav" id="mt-mobile-nav">
            ${this.hasAccess('dashboard') ? `<button class="mt-mobile-nav-btn active" id="mob-nav-dashboard" onclick="App.switchTab('dashboard')"><span class="icon">📊</span><span>الرئيسية</span></button>` : ''}
            ${this.hasAccess('users') ? `<button class="mt-mobile-nav-btn" id="mob-nav-users" onclick="App.switchTab('users')"><span class="icon">👥</span><span>الكروت</span></button>` : ''}
            ${this.hasAccess('sales') ? `<button class="mt-mobile-nav-btn" id="mob-nav-sales" onclick="App.switchTab('sales')"><span class="icon">💳</span><span>المبيعات</span></button>` : ''}
            ${this.hasAccess('cashbox_accounts') || this.hasAccess('finance_accounting') ? `<button class="mt-mobile-nav-btn" id="mob-nav-cashbox_accounts" onclick="App.switchTab('cashbox_accounts')"><span class="icon">💰</span><span>المالية</span></button>` : ''}
            ${this.hasAccess('operating_expenses') || this.hasAccess('vouchers_fin') ? `<button class="mt-mobile-nav-btn" id="mob-nav-operating_expenses" onclick="App.switchTab('operating_expenses')"><span class="icon">💸</span><span>المصروفات التشغيلية</span></button>` : ''}
            ${this.hasAccess('chart_of_accounts') || this.hasAccess('finance_accounting') ? `<button class="mt-mobile-nav-btn" id="mob-nav-chart_of_accounts" onclick="App.switchTab('chart_of_accounts')"><span class="icon">📑</span><span>الحسابات</span></button>` : ''}
            ${this.hasAccess('reports_center') || this.hasAccess('financial_reports') ? `<button class="mt-mobile-nav-btn" id="mob-nav-reports_center" onclick="App.switchTab('reports_center')"><span class="icon">📈</span><span>التقارير</span></button>` : ''}
            ${this.hasAccess('admins_agents') || this.hasAccess('admins') ? `<button class="mt-mobile-nav-btn" id="mob-nav-admins_agents" onclick="App.switchTab('admins_agents')"><span class="icon">👥</span><span>المستخدمين</span></button>` : ''}
            ${this.hasAccess('whatsapp_manager') || this.hasAccess('notifications') ? `<button class="mt-mobile-nav-btn" id="mob-nav-whatsapp_manager" onclick="App.switchTab('whatsapp_manager')"><span class="icon">💬</span><span>الواتساب</span></button>` : ''}
            ${this.hasAccess('card_warehouses') ? `<button class="mt-mobile-nav-btn" id="mob-nav-card_warehouses" onclick="App.switchTab('card_warehouses')"><span class="icon">🏬</span><span>المخازن</span></button>` : ''}
            ${this.hasAccess('routers') ? `<button class="mt-mobile-nav-btn" id="mob-nav-routers" onclick="App.switchTab('routers')"><span class="icon">📡</span><span>الراوترات</span></button>` : ''}
            ${this.hasAccess('active_sessions') ? `<button class="mt-mobile-nav-btn" id="mob-nav-active_sessions" onclick="App.switchTab('active_sessions')"><span class="icon">⚡</span><span>الجلسات</span></button>` : ''}
            ${this.hasAccess('assets') || this.hasAccess('assets_inventory') ? `<button class="mt-mobile-nav-btn" id="mob-nav-assets_inventory" onclick="App.switchTab('assets_inventory')"><span class="icon">📦</span><span>الأصول</span></button>` : ''}
            ${this.hasAccess('hotspot_designer') ? `<button class="mt-mobile-nav-btn" id="mob-nav-hotspot_designer" onclick="App.switchTab('hotspot_designer')"><span class="icon">🎨</span><span>الهوتسبوت</span></button>` : ''}
        </nav>
        `}
        <div id="modal-container"></div>
        `;
    },

    renderSidebar() {
        const isOwnerPortal = Boolean(window.__SAM_IS_OWNER_PORTAL || location.port === '8099' || location.pathname.endsWith('owner.php'));
        const sovereignDepartments = [
            {
                id: 'sovereign_core',
                name: 'القيادة وشبكات العملاء',
                icon: '👑',
                color: '#d97706',
                items: [
                    { id: 'owner_portal_overview', name: 'لوحة القيادة السيادية (Sovereign Hub)', icon: '👑' },
                    { id: 'owner_clients_networks', name: 'إدارة شبكات العملاء (Clients Hub)', icon: '🏢' },
                    { id: 'network_subscriptions', name: 'باقات واشتراكات العملاء', icon: '💎' },
                    { id: 'owner_network_admins', name: 'إدارة مدراء وتفويض الشبكات', icon: '👥' },
                    { id: 'owner_master_finance', name: 'المركز المالي الشامل للمنظومة', icon: '💰' }
                ]
            },
            {
                id: 'sovereign_server',
                name: 'إدارة السيرفر والمنظومة الشاملة',
                icon: '🛡️',
                color: '#0f172a',
                items: [
                    { id: 'owner_firewall', name: 'جدار الحماية والأمان السيادي', icon: '🛡️' },
                    { id: 'system_settings', name: 'التحكم بالسيرفر والخدمات', icon: '🖥️' },
                    { id: 'owner_diagnostics', name: 'الفحص التشخيصي وصحة النظام', icon: '🩺' },
                    { id: 'owner_logs', name: 'سجلات النظام والأخطاء', icon: '📋' },
                    { id: 'owner_broadcast', name: 'التنبيهات والبث العام للعملاء', icon: '📢' }
                ]
            },
            {
                id: 'sovereign_channels',
                name: 'قنوات المالك السيادية',
                icon: '📡',
                color: '#16a34a',
                items: [
                    { id: 'owner_whatsapp', name: 'واتساب مالك المنظومة (Sovereign WA)', icon: '📱' },
                    { id: 'owner_telegram', name: 'بوت تلغرام مالك المنظومة', icon: '✈️' }
                ]
            }
        ];

        const deptsToRender = isOwnerPortal 
            ? sovereignDepartments 
            : (this.departments || []).filter(d => d.id !== 'system_owner' && d.id !== 'sovereign_core' && d.id !== 'sovereign_server' && d.id !== 'sovereign_channels' && !d.ownerOnly);

        const deptsHtml = deptsToRender.map(dept => {
            const visibleItems = (dept.items || []).filter(item => {
                if (!isOwnerPortal && ['owner_portal_overview', 'owner_clients_networks', 'owner_network_admins', 'owner_alerts', 'sstp_vpn', 'owner_firewall', 'system_settings', 'network_subscriptions', 'owner_diagnostics', 'owner_logs', 'owner_broadcast', 'owner_whatsapp', 'owner_telegram'].includes(item.id)) return false;
                return this.hasAccess(item.id);
            });
            if (visibleItems.length === 0) return '';
            const deptCleanName = this.cleanTitle ? this.cleanTitle(dept.name, dept.icon) : dept.name;
            return `
            <div class="mt-nav-dept" id="dept-${dept.id}">
                <div class="mt-nav-dept-header" onclick="App.toggleDepartment('${dept.id}')" title="طي / فتح قسم ${deptCleanName}">
                    <div class="mt-nav-dept-title">
                        <span style="font-size:13px;">${dept.icon}</span>
                        <span>${deptCleanName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="mt-nav-dept-badge">${visibleItems.length}</span>
                        <span class="mt-nav-dept-arrow">▼</span>
                    </div>
                </div>
                <div class="mt-nav-dept-items">
                    ${visibleItems.map(item => {
                        const itemCleanName = this.cleanTitle ? this.cleanTitle(item.name, item.icon) : item.name;
                        const isActive = item.id === (this.currentTab || (isOwnerPortal ? 'owner_portal_overview' : 'dashboard'));
                        return `
                        <div class="mt-nav-item ${isActive ? 'active' : ''}" onclick="App.switchTab('${item.id}')" id="nav-${item.id}" data-search="${this.escape((deptCleanName + ' ' + itemCleanName + ' ' + item.id).toLowerCase())}">
                            <i>${item.icon}</i> <span>${itemCleanName}</span>
                        </div>
                    `}).join('')}
                </div>
            </div>`;
        }).join('');

        const sidebar = document.querySelector('.mt-sidebar');
        if (sidebar) {
            sidebar.querySelectorAll('.mt-nav-dept').forEach(el => el.remove());
            sidebar.insertAdjacentHTML('beforeend', deptsHtml);
        }
    },

    toggleDepartment(deptId) {
        const deptEl = document.getElementById(`dept-${deptId}`);
        if (deptEl) {
            deptEl.classList.toggle('collapsed');
        }
    },

    filterNavItems(query) {
        const q = (query || '').trim().toLowerCase();
        const depts = document.querySelectorAll('.mt-nav-dept');
        depts.forEach(dept => {
            let visibleCount = 0;
            const items = dept.querySelectorAll('.mt-nav-item');
            items.forEach(item => {
                const text = (item.getAttribute('data-search') || item.textContent || '').toLowerCase();
                if (!q || text.includes(q)) {
                    item.style.display = 'flex';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });
            if (!q) {
                dept.style.display = 'block';
            } else {
                dept.style.display = visibleCount > 0 ? 'block' : 'none';
                if (visibleCount > 0) dept.classList.remove('collapsed');
            }
        });
    },

    updateBreadcrumb(tab) {
        for (const dept of this.departments) {
            const found = dept.items.find(it => it.id === tab);
            if (found) {
                const deptEl = document.getElementById('bc-dept-name');
                const tabEl = document.getElementById('bc-tab-name');
                const deptClean = this.cleanTitle ? this.cleanTitle(dept.name, dept.icon) : dept.name;
                const tabClean = this.cleanTitle ? this.cleanTitle(found.name, found.icon) : found.name;
                if (deptEl) deptEl.innerHTML = `${dept.icon} ${deptClean}`;
                if (tabEl) tabEl.innerHTML = `${found.icon} ${tabClean}`;
                
                // Auto expand parent department
                const deptContainer = document.getElementById(`dept-${dept.id}`);
                if (deptContainer && deptContainer.classList && deptContainer.classList.contains('collapsed')) {
                    deptContainer.classList.remove('collapsed');
                }
                break;
            }
        }
        if (window.SamTableManager && typeof window.SamTableManager.enhanceAllTables === 'function') {
            setTimeout(() => window.SamTableManager.enhanceAllTables(), 100);
        }
    },

    hasAccess(tab) {
        if (['sstp_vpn', 'network_subscriptions', 'system_settings'].includes(tab) && !this.isSystemOwner && this.userRole !== 'system_owner') return false;
        if (tab === 'roles_permissions' && !this.isSystemOwner && this.userRole !== 'superadmin') return false;
        if (tab === 'hotspot_designer') {
            if (!this.userRole || this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin') return true;
            if (this.hasAccess('routers') || this.hasAccess('templates')) return true;
        }
        if (!this.userRole || this.isSystemOwner || this.userRole === 'system_owner' || this.userRole === 'superadmin' || this.userRole === 'superadmin') return true;
        if (Array.isArray(this.userPermissions) && this.userPermissions.length > 0) {
            if (this.userPermissions.includes('*') || this.userPermissions.includes(tab)) return true;
            return false;
        }
        const roleDefaults = {
            superadmin: ['*'],
            superadmin: ['*'],
            partner: ['dashboard', 'financial_reports', 'sales_channel_reports', 'reports_center', 'partners_equity', 'networks_partnerships', 'cost_centers', 'port_analytics', 'routers', 'sstp_vpn', 'network_nodes', 'assets', 'logs', 'subscriber_portal'],
            main_node_owner: ['dashboard', 'network_nodes', 'assets', 'port_analytics', 'free_vouchers', 'subscriber_portal'],
            sub_node_owner: ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'port_analytics', 'free_vouchers', 'subscriber_portal'],
            regular_node_owner: ['dashboard', 'network_nodes', 'assets', 'active_sessions', 'free_vouchers', 'subscriber_portal'],
            distributor: ['dashboard', 'sales', 'card_warehouses', 'admins_agents', 'vouchers_fin', 'cashbox_accounts', 'sales_channel_reports', 'distributor_wallets', 'subscriber_portal'],
            pos_agent: ['dashboard', 'sales', 'card_warehouses', 'sales_channel_reports', 'subscriber_portal'],
            finance: ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'financial_reports', 'sales_channel_reports', 'reports_center', 'port_analytics', 'sales', 'exchange_rates', 'subscriber_portal'],
            accountant: ['dashboard', 'chart_of_accounts', 'journal_entries', 'trial_balance', 'cost_centers', 'partners_equity', 'networks_partnerships', 'cashbox_accounts', 'vouchers_fin', 'financial_reports', 'sales_channel_reports', 'reports_center', 'sales', 'exchange_rates', 'subscriber_portal'],
            maintenance: ['dashboard', 'network_nodes', 'assets', 'routers', 'noc', 'subscriber_portal'],
            vip: ['dashboard', 'free_vouchers', 'subscriber_portal']
        };
        const allowed = roleDefaults[this.userRole] || ['dashboard', 'subscriber_portal'];
        return allowed.includes(tab);
    },

    navHistory: [],

    canGoBack() {
        return (this.navHistory && this.navHistory.length > 0) || (this.currentTab && this.currentTab !== 'dashboard');
    },

    goBack() {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer && modalContainer.children.length > 0) {
            this.closeModal();
            return;
        }

        if (this.navHistory && this.navHistory.length > 0) {
            const prevTab = this.navHistory.pop();
            this.switchTab(prevTab, false);
        } else if (this.currentTab && this.currentTab !== 'dashboard') {
            this.switchTab('dashboard', false);
        }
    },

    updateBackButtonVisibility() {
        const canBack = this.canGoBack();
        const headerBackBtn = document.getElementById('app-header-back-btn');
        const bcBackBtn = document.getElementById('bc-back-btn');
        if (headerBackBtn) {
            headerBackBtn.style.display = canBack ? 'inline-flex' : 'none';
        }
        if (bcBackBtn) {
            bcBackBtn.style.display = canBack ? 'inline-flex' : 'none';
        }
    },

    switchTab(tab, pushHistory = true) {
        if (!this.hasAccess(tab)) {
            this.toast('عذراً، ليس لديك صلاحية للوصول إلى قسم [' + tab + ']', 'warning');
            return;
        }

        if (pushHistory !== false && this.currentTab && this.currentTab !== tab) {
            if (!this.navHistory) this.navHistory = [];
            this.navHistory.push(this.currentTab);
            if (this.navHistory.length > 30) this.navHistory.shift();
        }

        this.currentTab = tab;
        try {
            sessionStorage.setItem('sam_active_tab', tab);
            localStorage.setItem('sam_active_tab', tab);
            if (window.location.hash !== '#' + tab) {
                if (pushHistory) {
                    history.pushState(null, '', '#' + tab);
                } else {
                    history.replaceState(null, '', '#' + tab);
                }
            }
        } catch (e) {}

        this.updateBreadcrumb(tab);
        this.updateBackButtonVisibility();
        document.querySelectorAll('.mt-nav-item').forEach(el => el.classList.remove('active'));
        const navEl = document.getElementById(`nav-${tab}`);
        if (navEl) navEl.classList.add('active');
        this.closeMobileSidebar();
        document.querySelectorAll('.mt-mobile-nav-btn').forEach(b => b.classList.remove('active'));
        const mobNavBtn = document.getElementById(`mob-nav-${tab}`);
        if (mobNavBtn) mobNavBtn.classList.add('active');


        if (this.activeRefreshTimer) {
            clearInterval(this.activeRefreshTimer);
            this.activeRefreshTimer = null;
        }

        switch (tab) {
            case 'network_setup': this.renderNetworkSetup(); break;
            case 'dashboard': this.renderDashboard(); break;
            case 'card_warehouses':
                Promise.resolve(this.renderCardWarehouses()).catch((error) => {
                    console.error('SAM card warehouses render failed:', error);
                    const view = document.getElementById('main-view');
                    if (view) view.innerHTML = '<div style="padding:32px;text-align:center;color:#991b1b;background:#fff1f2;border:1px solid #fecaca;border-radius:14px;margin:24px;"><strong style="display:block;margin-bottom:10px;">تعذر فتح واجهة المخازن</strong><span style="display:block;margin-bottom:14px;">انتهت جلسة الدخول أو تعذر تحميل البيانات.</span><button class="mt-btn mt-btn-primary" onclick="App.switchTab(\'card_warehouses\')">إعادة المحاولة</button></div>';
                });
                break;
            case 'admins':
            case 'admins_agents':
                this.renderAdmins();
                break;
            case 'owner_network_admins':
                if (typeof this.renderOwnerNetworkAdmins === 'function') {
                    this.renderOwnerNetworkAdmins();
                } else {
                    this.renderAdmins();
                }
                break;
            case 'notifications': this.renderNotifications(); break;
            case 'whatsapp_manager': this.renderWhatsAppManager(); break;
            case 'sales': this.renderSales(); break;
            case 'wallet_sales': this.renderWalletSales(); break;
            case 'cashbox_accounts':
            case 'finance_accounting':
                this.renderCashbox();
                break;
            case 'exchange_rates': this.renderExchangeRates(); break;
            case 'vouchers_fin': this.renderVouchersFin(); break;
            case 'assets':
            case 'assets_inventory':
                Promise.resolve(this.renderAssets()).catch((error) => {
                    console.error('SAM assets render failed:', error);
                    const view = document.getElementById('main-view');
                    if (view) view.innerHTML = '<div style="padding:32px;text-align:center;color:#991b1b;background:#fff1f2;border:1px solid #fecaca;border-radius:14px;margin:24px;"><strong style="display:block;margin-bottom:10px;">تعذر فتح واجهة الأصول والمعدات</strong><span style="display:block;margin-bottom:14px;">انتهت جلسة الدخول أو تعذر تحميل البيانات.</span><button class="mt-btn mt-btn-primary" onclick="App.switchTab(\'assets\')">إعادة المحاولة</button></div>';
                });
                break;
            case 'financial_reports': this.renderFinancialReports(); break;
            case 'sales_channel_reports':
                if (typeof this.renderSalesChannelReports === 'function') {
                    this.renderSalesChannelReports();
                }
                break;
            case 'reports_center': this.renderReportsCenter(); break;
            case 'chart_of_accounts': this.renderChartOfAccounts(); break;
            case 'journal_entries': this.renderJournalEntries(); break;
            case 'trial_balance': this.renderTrialBalance(); break;
            case 'cost_centers': this.renderCostCenters(); break;
            case 'partners_equity': this.renderPartnersEquity(); break;
            case 'networks_partnerships': this.renderNetworksPartnerships(); break;
            case 'salaries_payroll': this.renderSalaries(); break;
            case 'operating_expenses': this.renderOperatingExpenses(); break;
            case 'purchase_invoices': this.renderPurchases(); break;
            case 'routers': this.renderRouters(); break;
            case 'sstp_vpn': this.renderSstpVpn(); break;
            case 'noc': this.renderNoc(); break;
            case 'backups': this.renderBackups(); break;
            case 'users': this.renderUsers(); break;
            case 'batch_gen': this.renderBatchGen(); break;
            case 'templates':
            case 'templates_designer':
                this.renderTemplates();
                break;
            case 'hotspot_designer': this.renderHotspotStudio(); break;
            case 'profiles': this.renderProfiles(); break;
            case 'active_sessions': 
                this.renderActiveSessions(true);
                this.activeRefreshTimer = setInterval(() => this.renderActiveSessions(true), 5000);
                break;
            case 'port_analytics': this.renderPortAnalytics(); break;
            case 'network_nodes': this.renderNetworkNodes(); break;
            case 'free_vouchers': this.renderFreeVouchers(); break;
            case 'ui_customizer': this.renderUICustomizer(); break;
            case 'subscriber_portal': this.renderSubscriberPortal(); break;
            case 'roles_permissions': this.renderRolesPermissions(); break;
            case 'logs': this.renderLogs(); break;
        }
    },

    // ==========================================
    // 1. DASHBOARD
    // ==========================================

    // ==========================================
    // UI SETTINGS, DASHBOARD & SHORTCUTS STUDIO
    // ==========================================
    uiSettings: null,

    async loadUISettings(forceRefresh = false) {
        if (!this.uiSettings || forceRefresh) {
            try {
                const res = await this.api('get_ui_settings');
                if (res && res.dashboard_widgets) {
                    this.uiSettings = res;
                }
            } catch (e) {}

            if (!this.uiSettings) {
                this.uiSettings = {
                    app_title: 'SAM - نظام الإدارة الذكي',
                    app_short_title: 'SAM',
                    header_buttons: ['network_switcher', 'notif', 'whatsapp', 'portal', 'lang', 'theme', 'logout'],
                    dashboard_widgets: [
                        { id: 'assets', title: 'المعدات والأجهزة', icon: '📡', color: '#0284c7', tab: 'assets', metric_key: 'assets', enabled: true },
                        { id: 'networks', title: 'الشبكات والراوترات', icon: '🌐', color: '#2563eb', tab: 'routers', metric_key: 'networks', enabled: true },
                        { id: 'active_sessions', title: 'المتصلون أونلاين', icon: '⚡', color: '#16a34a', tab: 'active_sessions', metric_key: 'active_sessions', enabled: true },
                        { id: 'cards_users', title: 'الكروت والمشتركون', icon: '🎫', color: '#8b5cf6', tab: 'users', metric_key: 'cards_users', enabled: true },
                        { id: 'today_sales', title: 'مبيعات وإيراد اليوم', icon: '🛒', color: '#059669', tab: 'sales', metric_key: 'today_sales', enabled: true },
                        { id: 'cashbox', title: 'رصيد الصندوق الفعلي', icon: '💵', color: '#d97706', tab: 'cashbox_accounts', metric_key: 'cashbox', enabled: true },
                        { id: 'distributor_debt', title: 'مديونيات الموزعين', icon: '💳', color: '#dc2626', tab: 'admins_agents', metric_key: 'distributor_debt', enabled: true },
                        { id: 'vouchers_today', title: 'سندات القبض والصرف', icon: '📑', color: '#4f46e5', tab: 'vouchers_fin', metric_key: 'vouchers_today', enabled: true },
                        { id: 'warehouses', title: 'مخزون الكروت والعهد', icon: '🏢', color: '#0891b2', tab: 'card_warehouses', metric_key: 'warehouses', enabled: true },
                        { id: 'traffic_today', title: 'حركة ترافيك اليوم', icon: '📊', color: '#7c3aed', tab: 'noc', metric_key: 'traffic_today', enabled: true },
                        { id: 'partners_capital', title: 'رأس مال الشركاء', icon: '🤝', color: '#0d9488', tab: 'partners_equity', metric_key: 'partners_capital', enabled: true },
                        { id: 'security_alerts', title: 'الأمان والتنبيهات', icon: '🛡️', color: '#e11d48', tab: 'network_nodes', metric_key: 'security_alerts', enabled: true },
                    ],
                    quick_shortcuts: [
                        { id: 'sc_sales', title: 'فاتورة بيع جديدة', icon: '🛒', action_type: 'modal', target: 'new_sale' },
                        { id: 'sc_receipt', title: 'سند قبض نقدية', icon: '💵', action_type: 'modal', target: 'receipt_voucher' },
                        { id: 'sc_payment', title: 'سند صرف مصاريف', icon: '💳', action_type: 'modal', target: 'payment_voucher' },
                        { id: 'sc_assets', title: 'فحص المعدات والأصول', icon: '📡', action_type: 'tab', target: 'assets' },
                        { id: 'sc_nodes', title: 'هيكلية ونقاط الشبكة', icon: '🌳', action_type: 'tab', target: 'network_nodes' },
                        { id: 'sc_sstp', title: 'خادم أنفاق SSTP VPN', icon: '🔒', action_type: 'tab', target: 'sstp_vpn' },
                    ],
                    mobile_bottom_nav: [
                        { tab: 'dashboard', title: 'الرئيسية', icon: '📊' },
                        { tab: 'users', title: 'الكروت', icon: '👥' },
                        { tab: 'sales', title: 'المبيعات', icon: '💳' },
                        { tab: 'cashbox_accounts', title: 'المالية', icon: '💰' },
                        { tab: 'operating_expenses', title: 'المصروفات التشغيلية', icon: '💸' },
                        { tab: 'chart_of_accounts', title: 'الحسابات', icon: '📑' },
                        { tab: 'reports_center', title: 'التقارير', icon: '📈' },
                        { tab: 'admins_agents', title: 'المستخدمين', icon: '👥' },
                        { tab: 'whatsapp_manager', title: 'الواتساب', icon: '💬' },
                    ],
                    default_theme: 'light'
                };
            }
        }
        return this.uiSettings;
    },

    // ==========================================
    // MULTI-CURRENCY GLOBAL HELPERS
    // ==========================================
    getCurrencyRate(code) {
        if (!code) return 1.0;
        const rates = this._exchangeRates || [];
        const obj = rates.find(r => r.currency_code === code);
        return obj ? parseFloat(obj.exchange_rate || obj.exchange_rate_to_base || 1.0) : 1.0;
    },

    getCurrencySymbol(code = null) {
        const curCode = (code || this._baseCurrency || 'YER_SANAA').toUpperCase().trim();
        const rates = this._exchangeRates || [];
        const obj = rates.find(r => r.currency_code === curCode);
        if (obj && (obj.currency_symbol || obj.symbol)) {
            return obj.currency_symbol || obj.symbol;
        }
        const fallbackSymbols = {
            'YER_SANAA': 'ر.ي',
            'YER_ADEN': 'ر.ي',
            'YER': 'ر.ي',
            'SAR': 'ر.س',
            'USD': '$',
            'EUR': '€',
            'AED': 'د.إ',
            'OMR': 'ر.ع',
            'QAR': 'ر.ق',
            'KWD': 'د.ك'
        };
        return fallbackSymbols[curCode] || 'ر.ي';
    },

    
    formatCurrencyAuditNote(amount, curCode, rate, baseAmount = null, baseCode = null) {
        const base = baseCode || this._baseCurrency || 'YER_SANAA';
        if (!curCode || curCode === base || Number(rate) === 1.0) {
            return '';
        }
        const sym = this.getCurrencySymbol(curCode);
        const baseSym = this.getCurrencySymbol(base);
        const effectiveBase = baseAmount !== null ? baseAmount : (Number(amount) * Number(rate));
        return `[المبلغ بالعملة: ${this.formatMoney(amount, false)} ${sym} | سعر الصرف بتاريخه: ${rate} | معادل الأساس: ${this.formatMoney(effectiveBase, false)} ${baseSym}]`;
    },

    formatCurrencyBadge(amount, curCode, rate = 1.0, baseAmount = null) {
        const base = this._baseCurrency || 'YER_SANAA';
        const isBase = (!curCode || curCode === base || Number(rate) === 1.0);
        const baseSym = this.getCurrencySymbol(base);
        if (isBase) {
            return `<span style="font-weight:700;">${this.formatMoney(baseAmount !== null ? baseAmount : amount, false)} ${baseSym}</span>`;
        }
        const sym = this.getCurrencySymbol(curCode);
        const effectiveBase = baseAmount !== null ? baseAmount : (Number(amount) * Number(rate));
        return `<div style="display:inline-flex; flex-direction:column; line-height:1.2;">
            <span style="font-weight:800; color:#0369a1;">${this.formatMoney(amount, false)} ${sym}</span>
            <small style="font-size:10.5px; color:#475569; font-weight:600;" title="سعر الصرف التاريخي: ${rate}">
                💱 يعادل: ${this.formatMoney(effectiveBase, false)} ${baseSym} <span style="opacity:0.8;">(صرف: ${rate})</span>
            </small>
        </div>`;
    },

    
    // ==========================================
    // PROFESSIONAL FINANCIAL VOUCHER PRINTING
    // ==========================================
    async printFinancialVoucher(voucherId) {
        this.toast('جاري تجهيز سند الطباعة...', 'info');
        const res = await this.api('get_financial_voucher_details', { voucher_id: voucherId });
        if (!res || !res.voucher) {
            return this.toast('تعذر جلب تفاصيل السند المالي للطباعة', 'danger');
        }
        const v = res.voucher;
        const isReceipt = (v.voucher_type === 'receipt');
        const curCode = v.currency_code || this._baseCurrency || 'YER_SANAA';
        const curSym = this.getCurrencySymbol(curCode);
        const curAmount = parseFloat(v.currency_amount || v.amount || 0);
        const baseAmount = parseFloat(v.amount || 0);
        const rate = parseFloat(v.exchange_rate || 1.0);
        const isBase = (curCode === (this._baseCurrency || 'YER_SANAA') || rate === 1.0);
        const tafqeetText = this.tafqeet(curAmount, curCode);

        const printWin = window.open('', '_blank', 'width=800,height=900');
        if (!printWin) return this.toast('يرجى السماح بالنوافذ المنبثقة لطباعة السند', 'warning');

        const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${isReceipt ? 'سند قبض مالي' : 'سند صرف مالي'} - ${this.escape(v.voucher_no)}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background:#fff; color:#0f172a; margin:0; padding:25px; direction:rtl; }
        .voucher-box { border: 2px solid ${isReceipt ? '#15803d' : '#b91c1c'}; border-radius: 10px; padding: 20px; position:relative; }
        .v-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
        .v-title { font-size: 22px; font-weight: 900; color: ${isReceipt ? '#15803d' : '#b91c1c'}; }
        .v-no { font-size: 15px; font-weight: 800; color: #475569; font-family: monospace; }
        .v-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .v-row { display: flex; align-items: center; margin-bottom: 10px; font-size: 14px; }
        .v-label { width: 140px; font-weight: 700; color: #334155; }
        .v-val { flex: 1; border-bottom: 1px dotted #94a3b8; padding-bottom: 2px; font-weight: 700; color: #0f172a; }
        .amount-card { background: ${isReceipt ? '#f0fdf4' : '#fef2f2'}; border: 1.5px solid ${isReceipt ? '#bbf7d0' : '#fecaca'}; border-radius: 8px; padding: 12px 16px; margin: 16px 0; display: flex; justify-content: space-between; align-items: center; }
        .amount-num { font-size: 24px; font-weight: 900; color: ${isReceipt ? '#166534' : '#991b1b'}; font-family: monospace; }
        .tafqeet-box { font-size: 13.5px; font-weight: 800; color: #1e3a8a; margin-top: 4px; }
        .v-signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; }
        .v-sig-col { text-align: center; width: 30%; }
        .v-sig-line { border-bottom: 1px solid #0f172a; margin-top: 45px; }
        @media print { body { padding: 0; } .no-print { display:none; } }
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom:15px; display:flex; gap:10px;">
        <button onclick="window.print()" style="padding:8px 18px; font-weight:bold; background:#0284c7; color:#fff; border:none; border-radius:6px; cursor:pointer;">🖨️ طباعة السند</button>
        <button onclick="window.close()" style="padding:8px 14px; background:#e2e8f0; border:none; border-radius:6px; cursor:pointer;">إغلاق</button>
    </div>
    <div class="voucher-box">
        <div class="v-header">
            <div>
                <div style="font-size:18px; font-weight:900; color:#0f172a;">${this.escape(this.appName || 'SAM ERP')}</div>
                <div style="font-size:12px; color:#64748b;">نظام إدارة الشبكات والمحاسبة المالية</div>
            </div>
            <div style="text-align:center;">
                <div class="v-title">${isReceipt ? '💵 سند قبض نقدية / توريد' : '💳 سند صرف مصاريف / مسحوبات'}</div>
                <div class="v-no">رقم السند: ${this.escape(v.voucher_no)}</div>
            </div>
            <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700;">التاريخ: ${this.escape(v.created_at ? v.created_at.split(' ')[0] : '')}</div>
                <div style="font-size:12px; color:#64748b;">الوقت: ${this.escape(v.created_at ? v.created_at.split(' ')[1] : '')}</div>
            </div>
        </div>

        <div class="amount-card">
            <div>
                <div style="font-size:12px; color:#475569; font-weight:700;">المبلغ المطلوب:</div>
                <div class="amount-num">${this.formatMoney(curAmount, false)} ${curSym}</div>
                ${!isBase ? `<div style="font-size:12px; color:#059669; font-weight:bold; margin-top:3px;">💱 معادل الأساس: <b>${this.formatMoney(baseAmount, false)} ${this.getCurrencySymbol(this._baseCurrency)}</b> (سعر الصرف بتاريخه: ${rate})</div>` : ''}
            </div>
            <div style="text-align:left; max-width:60%;">
                <div style="font-size:12px; color:#475569; font-weight:700;">المبلغ بالحروف:</div>
                <div class="tafqeet-box">📝 ${tafqeetText}</div>
            </div>
        </div>

        <div class="v-row">
            <span class="v-label">${isReceipt ? 'استلمنا من الأخ / الجهة:' : 'صرفنا للأخ / الجهة:'}</span>
            <span class="v-val">${this.escape(v.party_name || 'عميل نقدي')}</span>
        </div>

        <div class="v-grid">
            <div class="v-row">
                <span class="v-label">طريقة السداد / القبض:</span>
                <span class="v-val">${this.escape(v.payment_method || 'نقداً')}</span>
            </div>
            <div class="v-row">
                <span class="v-label">بند المصروف / التصنيف:</span>
                <span class="v-val">${this.escape(v.category || 'عام')}</span>
            </div>
        </div>

        ${v.notes ? `
        <div class="v-row">
            <span class="v-label">البيان والملاحظات:</span>
            <span class="v-val">${this.escape(v.notes)}</span>
        </div>
        ` : ''}

        <div class="v-signatures">
            <div class="v-sig-col">
                <b>${isReceipt ? 'المسلم / المورد' : 'المستلم'}</b>
                <div class="v-sig-line"></div>
            </div>
            <div class="v-sig-col">
                <b>المحاسب المالي</b>
                <div class="v-sig-line"></div>
            </div>
            <div class="v-sig-col">
                <b>المدير / المشرف المسؤول</b>
                <div class="v-sig-line"></div>
                <div style="font-size:11px; color:#64748b; margin-top:4px;">${this.escape(v.created_by_name || 'الإدارة')}</div>
            </div>
        </div>
    </div>
    <script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
    },

    renderCurrencyOptions(selectedCode = null) {
        const rates = (this._exchangeRates && this._exchangeRates.length > 0) 
            ? this._exchangeRates.filter(r => Number(r.is_active) === 1)
            : [
                { currency_code: 'YER_SANAA', currency_name: 'ريال يمني (صنعاء)', currency_symbol: 'ر.ي', exchange_rate: 1, is_base_currency: 1 },
                { currency_code: 'SAR', currency_name: 'ريال سعودي', currency_symbol: 'ر.س', exchange_rate: 141.5, is_base_currency: 0 },
                { currency_code: 'USD', currency_name: 'دولار أمريكي', currency_symbol: '$', exchange_rate: 535.0, is_base_currency: 0 },
                { currency_code: 'YER_ADEN', currency_name: 'ريال يمني (عدن)', currency_symbol: 'ر.ي', exchange_rate: 0.2857, is_base_currency: 0 }
            ];

        const baseCode = this._baseCurrency || (rates.find(r => Number(r.is_base_currency || r.is_base) === 1)?.currency_code || 'YER_SANAA');
        const target = selectedCode || baseCode;

        const flags = {
            'YER_SANAA': '🇾🇪',
            'YER_ADEN': '🇾🇪',
            'SAR': '🇸🇦',
            'USD': '🇺🇸',
            'EUR': '🇪🇺',
            'AED': '🇦🇪',
            'OMR': '🇴🇲',
            'QAR': '🇶🇦',
            'KWD': '🇰🇼'
        };

        return rates.map(r => {
            const flag = flags[r.currency_code] || '💱';
            const sym = r.currency_symbol || r.symbol || r.currency_code;
            const isBase = (r.currency_code === baseCode || Number(r.is_base_currency || r.is_base) === 1);
            return `<option value="${r.currency_code}" ${r.currency_code === target ? 'selected' : ''} data-symbol="${sym}" data-rate="${r.exchange_rate || 1}">
                ${flag} ${r.currency_name} (${sym}) ${isBase ? '⭐ الأساس' : ''}
            </option>`;
        }).join('');
    },

    // ==========================================
    // 📱 Native Android App Bridge Integration
    // ==========================================
    isAndroidApp() {
        return Boolean(window.AndroidBridge && typeof window.AndroidBridge.isAndroidApp === 'function' && window.AndroidBridge.isAndroidApp());
    },

    printThermalCard(cardData) {
        if (this.isAndroidApp()) {
            try {
                window.AndroidBridge.printCard(typeof cardData === 'string' ? cardData : JSON.stringify(cardData));
                return true;
            } catch (e) {
                console.error('Android printCard error:', e);
            }
        }
        return false;
    },

    printThermalVoucher(voucherData) {
        if (this.isAndroidApp()) {
            try {
                window.AndroidBridge.printVoucher(typeof voucherData === 'string' ? voucherData : JSON.stringify(voucherData));
                return true;
            } catch (e) {
                console.error('Android printVoucher error:', e);
            }
        }
        return false;
    },

    selectBluetoothPrinter() {
        if (this.isAndroidApp()) {
            window.AndroidBridge.selectBluetoothPrinter();
        } else {
            this.toast('هذه الميزة متاحة فقط من خلال تطبيق الأندرويد المباشر', 'info');
        }
    },

    openNativeScanner(callback) {
        if (this.isAndroidApp()) {
            this._nativeQrCallback = callback;
            window.AndroidBridge.scanQrCode();
        } else {
            this.toast('ميزة المسح بالكاميرا المباشرة تعمل داخل تطبيق الأندرويد', 'info');
        }
    },

    onNativeQrScanned(scannedText) {
        if (typeof this._nativeQrCallback === 'function') {
            this._nativeQrCallback(scannedText);
            this._nativeQrCallback = null;
            return;
        }

        const searchInput = document.getElementById('users-search-input') || document.getElementById('search-vouchers-input') || document.activeElement;
        if (searchInput && (searchInput.tagName === 'INPUT' || searchInput.tagName === 'TEXTAREA')) {
            searchInput.value = scannedText;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof this.onUsersSearchInput === 'function') {
                this.onUsersSearchInput(scannedText);
            }
        } else {
            this.toast('📷 تم مسح الرمز: ' + scannedText, 'success');
        }
    },

    async autoRegisterAndroidDevice() {
        if (!this.isAndroidApp()) return;
        try {
            const devName = (window.AndroidBridge && typeof window.AndroidBridge.getDeviceName === 'function') 
                ? window.AndroidBridge.getDeviceName() 
                : 'Android Device';
            const appVer = (window.AndroidBridge && typeof window.AndroidBridge.getAppVersion === 'function')
                ? window.AndroidBridge.getAppVersion()
                : '1.0.0';
            
            let localToken = localStorage.getItem('sam_fcm_client_token');
            if (!localToken) {
                localToken = 'app_' + (this.adminId || '1') + '_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
                localStorage.setItem('sam_fcm_client_token', localToken);
            }

            await this.api('register_fcm_token', {
                fcm_token: localToken,
                device_name: devName,
                platform: 'android',
                app_version: appVer,
                admin_id: this.adminId || 1
            }, 'POST');
        } catch (e) {
            console.warn('Auto register Android device error:', e);
        }
    },

    // =========================================================================
    // 👤 DYNAMIC CUSTOMER & SUBSCRIBER SELF-SERVICE PORTAL
    // =========================================================================
    _customerPortalData: null,
    _customerPortalPhone: '',
    _customerPortalTab: 'cards',

    showCustomerPortalModal(prefillPhone = '') {
        const savedPhone = prefillPhone || localStorage.getItem('sam_customer_phone') || '';
        if (savedPhone) {
            this.customerPortalFetch(savedPhone);
        } else {
            this.renderCustomerPortalLoginModal('');
        }
    },

    renderCustomerPortalLoginModal(phone = '') {
        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); color:#fff; padding:16px 20px; border-bottom:1px solid #059669;">
                <span style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>👤</span> بوابة المشتركين والعملاء الذاتية
                </span>
                <span style="cursor:pointer; font-size:18px; color:#a7f3d0;" onclick="App.closeModal()">✕</span>
            </div>
            <form onsubmit="event.preventDefault(); App.customerPortalFetch(document.getElementById('cust-portal-phone').value.trim());">
                <div class="mt-modal-body" style="padding:24px;">
                    <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:14px; margin-bottom:18px; color:#065f46; font-size:13px; line-height:1.6; display:flex; gap:12px; align-items:flex-start;">
                        <span style="font-size:24px; line-height:1;">📱</span>
                        <div>
                            <b>مرحباً بك في بوابة المشتركين:</b><br/>
                            أدخل رقم هاتفك أو اسم المستخدم لعرض كروت الإنترنت النشطة، متابعة الرصيد والمديونية، وطلب كروت أو شحن رصيد فوري.
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:16px;">
                        <label style="font-weight:800; font-size:13px; color:#1e293b; display:block; margin-bottom:6px;">
                            رقم الهاتف المسجل أو اسم الكرت *
                        </label>
                        <div style="position:relative;">
                            <input type="text" id="cust-portal-phone" class="mt-input" style="width:100%; font-size:15px; padding:10px 40px 10px 12px; font-family:monospace; direction:ltr; text-align:right;" placeholder="مثال: 77XXXXXXX أو 96777XXXXXXX" value="${this.escape(phone)}" required autofocus />
                            <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:18px; color:#059669;">📞</span>
                        </div>
                        <small style="color:#64748b; font-size:11.5px; margin-top:4px; display:block;">
                            يتم التعرف تلقائياً على جميع الشبكات المشترك بها.
                        </small>
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:14px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <button type="submit" class="mt-btn mt-btn-success" style="font-weight:800; font-size:14px; padding:9px 24px; background:#059669; border:none; display:inline-flex; align-items:center; gap:8px;">
                        <span>🔍 عرض حسابي وكروتي</span>
                    </button>
                    <button type="button" class="mt-btn" onclick="App.closeModal()">إغلاق</button>
                </div>
            </form>
        `, '480px');
    },

    async customerPortalFetch(phone, networkId = null) {
        if (!phone) {
            return this.toast('يرجى إدخال رقم الهاتف', 'warning');
        }
        this._customerPortalPhone = phone;
        localStorage.setItem('sam_customer_phone', phone);

        this.openModal(`
            <div style="padding:40px; text-align:center;">
                <div class="mt-spinner" style="border-color:#059669; border-top-color:transparent;"></div>
                <div style="margin-top:14px; font-weight:800; color:#065f46; font-size:14px;">جاري تحميل بيانات حسابك وكروتك...</div>
            </div>
        `, '780px');

        try {
            const res = await this.api(`customer_get_portal_data&phone=${encodeURIComponent(phone)}${networkId ? `&network_id=${networkId}` : ''}`);
            if (res && res.success) {
                this._customerPortalData = res;
                this.customerPortalRender(res, phone);
            } else {
                this.toast('لم يتم العثور على حساب مرتبط بهذا الرقم', 'warning');
                this.renderCustomerPortalLoginModal(phone);
            }
        } catch (err) {
            this.toast('تعذر جلب بيانات البوابة', 'danger');
            this.renderCustomerPortalLoginModal(phone);
        }
    },

    customerPortalRender(data, phone) {
        const cust = data.customer || {};
        const vouchers = data.vouchers || [];
        const memberships = data.memberships || [];
        const fin = data.financials || { total_balance: 0, total_debt: 0, net_balance: 0 };
        const requests = data.requests || [];
        const profiles = data.available_profiles || [];
        const tab = this._customerPortalTab || 'cards';

        const activeVouchers = vouchers.filter(v => v.status === 'active' || !v.sold_at || (v.status !== 'expired' && v.status !== 'depleted'));
        const expiredVouchers = vouchers.filter(v => !activeVouchers.includes(v));

        let contentHtml = '';

        if (tab === 'cards') {
            contentHtml = `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-weight:800; font-size:14px; color:#0f172a;">🎫 كروت الإنترنت الخاصة بك (${vouchers.length})</span>
                        <button type="button" class="mt-btn mt-btn-sm mt-btn-primary" onclick="App.customerPortalShowNewRequestModal('voucher_purchase')" style="font-weight:700; font-size:12px;">
                            + طلب كرت جديد 🛒
                        </button>
                    </div>

                    ${vouchers.length === 0 ? `
                        <div style="background:#f8fafc; border:2px dashed #cbd5e1; border-radius:12px; padding:30px; text-align:center; color:#64748b;">
                            <div style="font-size:32px; margin-bottom:8px;">🎫</div>
                            <div style="font-size:14px; font-weight:800; color:#1e293b;">لا توجد كروت مسجلة حالياً</div>
                            <div style="font-size:12px; margin-top:4px;">يمكنك طلب كرت إنترنت جديد مباشرة وسيتم تجهيزه لك فوراً.</div>
                            <button type="button" class="mt-btn mt-btn-success mt-btn-sm" style="margin-top:12px;" onclick="App.customerPortalShowNewRequestModal('voucher_purchase')">
                                طلب شراء كرت الآن 🛒
                            </button>
                        </div>
                    ` : `
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                            ${vouchers.map(v => {
                                const isAct = v.status === 'active' || !v.sold_at;
                                return `
                                <div style="background:#fff; border:1px solid ${isAct ? '#86efac' : '#e2e8f0'}; border-radius:10px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.04); position:relative; overflow:hidden;">
                                    <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:${isAct ? '#22c55e' : '#94a3b8'};"></div>
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                        <div>
                                            <span style="font-size:11px; background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-weight:700;">🌐 ${this.escape(v.network_name || 'الشبكة')}</span>
                                            <div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-top:4px;">${this.escape(v.profile_name || 'باقة إنترنت')}</div>
                                        </div>
                                        <span style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:800; background:${isAct ? '#dcfce7; color:#15803d;' : '#f1f5f9; color:#64748b;'}">
                                            ${isAct ? '🟢 نشط / جاهز' : 'منتهي / مستخدم'}
                                        </span>
                                    </div>

                                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin:10px 0; display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <div style="font-size:10.5px; color:#64748b;">اسم المستخدم / الرمز:</div>
                                            <div style="font-family:monospace; font-size:15px; font-weight:900; color:#0284c7; direction:ltr; letter-spacing:1px;">${this.escape(v.username)}</div>
                                            ${v.password_pin && v.password_pin !== v.username ? `<div style="font-size:11px; color:#475569;">كلمة المرور: <b style="font-family:monospace;">${this.escape(v.password_pin)}</b></div>` : ''}
                                        </div>
                                        <button type="button" class="mt-btn mt-btn-sm" style="padding:4px 8px; font-size:11px;" onclick="App.customerPortalCopyText('${this.escape(v.username)}', this)" title="نسخ الرمز">
                                            📋 نسخ
                                        </button>
                                    </div>

                                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#64748b;">
                                        <span>السعر: <b>${Number(v.price || 0).toLocaleString()} ر.ي</b></span>
                                        <span>${v.sold_at ? 'تاريخ البيع: ' + v.sold_at.substring(0, 10) : (v.created_at ? v.created_at.substring(0, 10) : '')}</span>
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            `;
        } else if (tab === 'statement') {
            contentHtml = `
                <div>
                    <div style="font-weight:800; font-size:14px; color:#0f172a; margin-bottom:12px;">💰 المديونيات والأرصدة حسب الشبكات</div>

                    ${memberships.length === 0 ? `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; text-align:center; color:#64748b; font-size:13px;">
                            لا توجد حسابات أو مديونيات مسجلة عبر الشبكات حالياً.
                        </div>
                    ` : `
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${memberships.map(m => `
                                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                    <div>
                                        <div style="font-weight:800; font-size:14px; color:#0f172a;">🌐 ${this.escape(m.network_name)} <span style="font-size:11px; color:#64748b;">(${this.escape(m.network_code)})</span></div>
                                        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                                            سقف الائتمان المسموح: <b>${Number(m.credit_limit || 0).toLocaleString()} ${this.escape(m.currency || 'YER')}</b>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:16px; text-align:center;">
                                        <div style="background:#ecfdf5; padding:6px 12px; border-radius:8px;">
                                            <div style="font-size:11px; color:#065f46;">رصيدك المتوفر</div>
                                            <div style="font-size:14px; font-weight:900; color:#15803d;">${Number(m.balance || 0).toLocaleString()} ${this.escape(m.currency || 'YER')}</div>
                                        </div>
                                        <div style="background:${Number(m.debt || 0) > 0 ? '#fef2f2' : '#f8fafc'}; padding:6px 12px; border-radius:8px; border:1px solid ${Number(m.debt || 0) > 0 ? '#fecaca' : '#e2e8f0'};">
                                            <div style="font-size:11px; color:${Number(m.debt || 0) > 0 ? '#991b1b' : '#64748b'};">المديونية المستحقة</div>
                                            <div style="font-size:14px; font-weight:900; color:${Number(m.debt || 0) > 0 ? '#dc2626' : '#64748b'};">${Number(m.debt || 0).toLocaleString()} ${this.escape(m.currency || 'YER')}</div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            `;
        } else if (tab === 'requests') {
            contentHtml = `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-weight:800; font-size:14px; color:#0f172a;">📜 سجل طلبات الكروت والرصيد (${requests.length})</span>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="mt-btn mt-btn-sm mt-btn-primary" onclick="App.customerPortalShowNewRequestModal('voucher_purchase')">🛒 طلب كرت</button>
                            <button type="button" class="mt-btn mt-btn-sm mt-btn-success" onclick="App.customerPortalShowNewRequestModal('balance_topup')">⚡ طلب رصيد</button>
                        </div>
                    </div>

                    ${requests.length === 0 ? `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:24px; text-align:center; color:#64748b; font-size:13px;">
                            لم تقم بتقديم أي طلبات سابقة.
                        </div>
                    ` : `
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${requests.map(r => {
                                const stBadge = r.status === 'approved' 
                                    ? '<span style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:800;">🟢 تم القبول والتسليم</span>'
                                    : (r.status === 'rejected' 
                                        ? '<span style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:800;">🔴 مرفوض</span>'
                                        : '<span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:800;">⏳ قيد المراجعة</span>');
                                return `
                                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:8px; margin-bottom:8px;">
                                        <div>
                                            <span style="font-family:monospace; font-weight:800; font-size:12px; color:#0284c7;">#${this.escape(r.request_no)}</span>
                                            <span style="font-size:11px; color:#64748b; margin-right:8px;">${r.created_at ? r.created_at.substring(0, 16) : ''}</span>
                                        </div>
                                        <div>${stBadge}</div>
                                    </div>

                                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                        <div>
                                            <div style="font-weight:800; font-size:13px; color:#0f172a;">
                                                ${r.request_type === 'voucher_purchase' ? '🎫 شراء كرت باقة: ' + this.escape(r.profile_name || 'غير محدد') : '⚡ طلب شحن رصيد: ' + Number(r.requested_amount || 0).toLocaleString() + ' ر.ي'}
                                            </div>
                                            <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
                                                الشبكة: <b>${this.escape(r.network_name || 'الشبكة')}</b> | طريقة الدفع: <b>${this.escape(r.payment_method || 'نقداً')}</b>
                                                ${r.payment_reference ? ` | مرجع التحويل: <code>${this.escape(r.payment_reference)}</code>` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    ${r.status === 'approved' && r.voucher_username ? `
                                        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:10px 12px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                                            <div>
                                                <div style="font-size:11px; color:#166534; font-weight:700;">رمز الكرت المستلم:</div>
                                                <div style="font-family:monospace; font-size:16px; font-weight:900; color:#15803d; direction:ltr; letter-spacing:1px;">${this.escape(r.voucher_username)}</div>
                                                ${r.voucher_pin && r.voucher_pin !== r.voucher_username ? `<div style="font-size:11.5px; color:#14532d;">كلمة السر: <b>${this.escape(r.voucher_pin)}</b></div>` : ''}
                                            </div>
                                            <button type="button" class="mt-btn mt-btn-sm" onclick="App.customerPortalCopyText('${this.escape(r.voucher_username)}', this)">📋 نسخ الرمز</button>
                                        </div>
                                    ` : ''}

                                    ${r.admin_notes ? `
                                        <div style="font-size:11.5px; color:#475569; background:#f8fafc; padding:6px 10px; border-radius:6px; margin-top:8px;">
                                            💬 <b>ملاحظة الإدارة:</b> ${this.escape(r.admin_notes)}
                                        </div>
                                    ` : ''}
                                </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            `;
        }

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); color:#fff; padding:14px 20px; border-bottom:1px solid #059669;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:36px; height:36px; border-radius:50%; background:#10b981; display:flex; align-items:center; justify-content:center; font-size:18px;">👤</div>
                    <div>
                        <div style="font-size:15px; font-weight:800;">${this.escape(cust.display_name || 'مشترك')}</div>
                        <div style="font-size:11.5px; color:#a7f3d0; direction:ltr; text-align:right;">${this.escape(phone)}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="mt-btn mt-btn-sm" style="background:rgba(255,255,255,0.15); color:#fff; border:none;" onclick="App.customerPortalFetch('${this.escape(phone)}')">🔄 تحديث</button>
                    <span style="cursor:pointer; font-size:18px; color:#a7f3d0; padding:0 4px;" onclick="App.closeModal()">✕</span>
                </div>
            </div>

            <!-- KPI Summary Bar -->
            <div style="background:#f0fdf4; border-bottom:1px solid #bbf7d0; padding:12px 20px; display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; text-align:center;">
                <div style="background:#fff; border-radius:8px; padding:8px; border:1px solid #dcfce7;">
                    <div style="font-size:11px; color:#64748b;">الكروت النشطة</div>
                    <div style="font-size:16px; font-weight:900; color:#059669;">${activeVouchers.length} كرت</div>
                </div>
                <div style="background:#fff; border-radius:8px; padding:8px; border:1px solid #dcfce7;">
                    <div style="font-size:11px; color:#64748b;">إجمالي الرصيد المتوفر</div>
                    <div style="font-size:16px; font-weight:900; color:#0284c7;">${Number(fin.total_balance || 0).toLocaleString()} ر.ي</div>
                </div>
                <div style="background:#fff; border-radius:8px; padding:8px; border:1px solid ${Number(fin.total_debt || 0) > 0 ? '#fecaca' : '#dcfce7'};">
                    <div style="font-size:11px; color:${Number(fin.total_debt || 0) > 0 ? '#dc2626' : '#64748b'};">إجمالي المديونية</div>
                    <div style="font-size:16px; font-weight:900; color:${Number(fin.total_debt || 0) > 0 ? '#dc2626' : '#059669'};">${Number(fin.total_debt || 0).toLocaleString()} ر.ي</div>
                </div>
            </div>

            <!-- Portal Tabs -->
            <div style="display:flex; border-bottom:1px solid #e2e8f0; background:#f8fafc; padding:0 20px;">
                <button type="button" class="mt-btn" style="border:none; border-bottom:2px solid ${tab === 'cards' ? '#059669' : 'transparent'}; background:none; border-radius:0; padding:10px 14px; font-weight:800; font-size:13px; color:${tab === 'cards' ? '#065f46' : '#64748b'};" onclick="App._customerPortalTab='cards'; App.customerPortalRender(App._customerPortalData, App._customerPortalPhone);">
                    🎫 كروتي وباقاتي (${vouchers.length})
                </button>
                <button type="button" class="mt-btn" style="border:none; border-bottom:2px solid ${tab === 'statement' ? '#059669' : 'transparent'}; background:none; border-radius:0; padding:10px 14px; font-weight:800; font-size:13px; color:${tab === 'statement' ? '#065f46' : '#64748b'};" onclick="App._customerPortalTab='statement'; App.customerPortalRender(App._customerPortalData, App._customerPortalPhone);">
                    💰 كشف الحساب والمديونيات
                </button>
                <button type="button" class="mt-btn" style="border:none; border-bottom:2px solid ${tab === 'requests' ? '#059669' : 'transparent'}; background:none; border-radius:0; padding:10px 14px; font-weight:800; font-size:13px; color:${tab === 'requests' ? '#065f46' : '#64748b'};" onclick="App._customerPortalTab='requests'; App.customerPortalRender(App._customerPortalData, App._customerPortalPhone);">
                    📜 سجل الطلبات (${requests.length})
                </button>
            </div>

            <div class="mt-modal-body" style="padding:20px; max-height:60vh; overflow-y:auto;">
                ${contentHtml}
            </div>

            <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                <button type="button" class="mt-btn" onclick="App.renderCustomerPortalLoginModal('${this.escape(phone)}')">🔄 تغيير الرقم</button>
                <button type="button" class="mt-btn mt-btn-secondary" onclick="App.closeModal()">إغلاق البوابة</button>
            </div>
        `, '840px');
    },

    customerPortalCopyText(text, btn) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ تم النسخ!';
                btn.classList.add('mt-btn-success');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('mt-btn-success');
                }, 2000);
            }
            this.toast('تم نسخ رمز الكرت إلى الحافظة بنجاح 📋', 'success');
        }).catch(() => {
            prompt('انسخ الرمز:', text);
        });
    },

    customerPortalShowNewRequestModal(defaultType = 'voucher_purchase', prefillPkgName = '', prefillNetId = 1) {
        const data = this._customerPortalData || {};
        const profiles = data.available_profiles || [];
        const phone = this._customerPortalPhone || '';

        this.openModal(`
            <div class="mt-modal-header" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); color:#fff; padding:14px 20px; border-bottom:1px solid #059669;">
                <span style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px;">
                    <span>⚡</span> تقديم طلب جديد (شراء كرت / شحن رصيد)
                </span>
                <span style="cursor:pointer; font-size:18px; color:#a7f3d0;" onclick="App.customerPortalRender(App._customerPortalData, App._customerPortalPhone)">✕</span>
            </div>
            <form onsubmit="App.customerPortalSubmitNewRequest(event)">
                <div class="mt-modal-body" style="padding:20px;">
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">نوع الطلب *</label>
                        <select id="cust-req-type" class="mt-input" style="width:100%; font-weight:700;" onchange="App.customerPortalToggleRequestTypeFields(this.value)">
                            <option value="voucher_purchase" ${defaultType === 'voucher_purchase' ? 'selected' : ''}>🎫 شراء كرت إنترنت جديد</option>
                            <option value="balance_topup" ${defaultType === 'balance_topup' ? 'selected' : ''}>⚡ شحن رصيد فوري للحساب</option>
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">اسم العميل *</label>
                            <input type="text" id="cust-req-name" class="mt-input" style="width:100%;" placeholder="اسمك الكامل" value="${this.escape(data.customer?.display_name || '')}" required />
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم الهاتف المسجل *</label>
                            <input type="tel" id="cust-req-phone" class="mt-input" style="width:100%; direction:ltr; text-align:right;" value="${this.escape(phone)}" required readonly />
                        </div>
                    </div>

                    <!-- Profile Selector (Voucher Purchase) -->
                    <div id="cust-req-profile-group" class="form-group" style="margin-top:12px; ${defaultType === 'balance_topup' ? 'display:none;' : ''}">
                        <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">اختر باقة الكرت المطلوبة *</label>
                        <select id="cust-req-profile" class="mt-input" style="width:100%; font-weight:700;">
                            ${profiles.map(p => `
                                <option value="${p.name}" data-net="${p.network_id}" data-price="${p.retail_price || p.price || 0}" ${p.name === prefillPkgName ? 'selected' : ''}>
                                    🌐 ${this.escape(p.network_name)} — ${this.escape(p.name_for_users || p.name)} (السعر: ${Number(p.retail_price || p.price || 0).toLocaleString()} ر.ي)
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Amount (Balance Topup) -->
                    <div id="cust-req-amount-group" class="form-group" style="margin-top:12px; ${defaultType !== 'balance_topup' ? 'display:none;' : ''}">
                        <label style="font-weight:700; font-size:12.5px; display:block; margin-bottom:4px;">المبلغ المطلوب شحنه (ر.ي) *</label>
                        <input type="number" id="cust-req-amount" class="mt-input" style="width:100%; font-size:15px; font-weight:800;" placeholder="مثال: 1000" min="100" step="50" />
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">طريقة الدفع / التسديد</label>
                            <select id="cust-req-paymethod" class="mt-input" style="width:100%;">
                                <option value="cash">💵 نقداً عند الاستلام</option>
                                <option value="kuraimi">🏦 تحويل كريمي إكسبرس</option>
                                <option value="onecash">📱 محفظة ون كاش (OneCash)</option>
                                <option value="floosak">💳 فلوسك / جوالي / كاش</option>
                                <option value="bank_transfer">🏛️ حوالة صرافة (النجم / الامتياز)</option>
                                <option value="credit">⏳ قيد على الحساب (آجل)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">رقم السند / مرجع التحويل</label>
                            <input type="text" id="cust-req-payref" class="mt-input" style="width:100%;" placeholder="رقم عملية التحويل (إن وجد)" />
                        </div>
                    </div>

                    <div class="form-group" style="margin-top:12px;">
                        <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">ملاحظات إضافية</label>
                        <input type="text" id="cust-req-notes" class="mt-input" style="width:100%;" placeholder="أي تفاصيل أخرى ترغب بإرسالها لإدارة الشبكة..." />
                    </div>
                </div>
                <div class="mt-modal-footer" style="padding:12px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0;">
                    <button type="submit" id="cust-req-submit-btn" class="mt-btn mt-btn-success" style="font-weight:800; font-size:13.5px; padding:8px 24px; background:#059669; border:none;">
                        🚀 إرسال الطلب الآن
                    </button>
                    <button type="button" class="mt-btn" onclick="App.customerPortalRender(App._customerPortalData, App._customerPortalPhone)">إلغاء</button>
                </div>
            </form>
        `, '560px');
    },

    customerPortalToggleRequestTypeFields(type) {
        const profGroup = document.getElementById('cust-req-profile-group');
        const amtGroup = document.getElementById('cust-req-amount-group');
        if (profGroup) profGroup.style.display = (type === 'voucher_purchase' ? 'block' : 'none');
        if (amtGroup) amtGroup.style.display = (type === 'balance_topup' ? 'block' : 'none');
    },

    async customerPortalSubmitNewRequest(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('cust-req-submit-btn');
        const type = document.getElementById('cust-req-type')?.value;
        const name = document.getElementById('cust-req-name')?.value?.trim();
        const phone = document.getElementById('cust-req-phone')?.value?.trim();
        const profSelect = document.getElementById('cust-req-profile');
        const selectedProf = profSelect?.options[profSelect.selectedIndex];
        const profileName = selectedProf?.value || '';
        const netId = selectedProf?.getAttribute('data-net') || 1;
        const profPrice = parseFloat(selectedProf?.getAttribute('data-price') || '0');
        const amount = type === 'voucher_purchase' ? profPrice : parseFloat(document.getElementById('cust-req-amount')?.value || '0');
        const payMethod = document.getElementById('cust-req-paymethod')?.value;
        const payRef = document.getElementById('cust-req-payref')?.value?.trim();
        const notes = document.getElementById('cust-req-notes')?.value?.trim();

        if (type === 'balance_topup' && (!amount || amount <= 0)) {
            return this.toast('يرجى تحديد المبلغ المراد شحنه', 'warning');
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إرسال الطلب...';
        }

        try {
            const payload = {
                phone: phone,
                customer_name: name,
                network_id: netId,
                request_type: type,
                profile_name: profileName,
                amount: amount,
                payment_method: payMethod,
                payment_reference: payRef,
                notes: notes
            };

            const res = await this.api('customer_submit_request', {}, 'POST', payload);
            if (res && res.success) {
                this.toast(res.message || '🎉 تم إرسال طلبك بنجاح! سيتم إشعارك فور التجهيز.', 'success', 6000);
                this._customerPortalTab = 'requests';
                this.customerPortalFetch(phone, netId);
            } else {
                this.toast(res?.error || 'فشل إرسال الطلب', 'danger');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '🚀 إرسال الطلب الآن';
                }
            }
        } catch (err) {
            this.toast('تعذر الاتصال بالسيرفر لإرسال الطلب', 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '🚀 إرسال الطلب الآن';
            }
        }
    },

    /**
     * 🔍 Unified Searchable Combobox/Datalist Autocomplete for Users, Admins, Warehouses, Suppliers & Customers
     * Allows searching by Name, Username (@user), Phone, or Role directly in a single text input box.
     */
    syncAdminCombobox(inputElem, hiddenId, listId, onSelectCallback) {
        if (!inputElem) return;
        const hiddenElem = document.getElementById(hiddenId);
        const listElem = document.getElementById(listId);
        if (!hiddenElem || !listElem) return;

        const val = (inputElem.value || '').trim();
        if (!val) {
            const prev = hiddenElem.value;
            hiddenElem.value = '';
            if (prev !== '') {
                hiddenElem.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof onSelectCallback === 'function') onSelectCallback('', null, inputElem);
            }
            return;
        }

        const valLower = val.toLowerCase();
        const options = Array.from(listElem.options);

        // 1. Exact match on option.value
        let match = options.find(opt => opt.value.trim().toLowerCase() === valLower);

        // 2. Exact match on innerText / text content
        if (!match) {
            match = options.find(opt => (opt.innerText || opt.text || '').trim().toLowerCase() === valLower);
        }

        // 3. Match by data-id
        if (!match && /^\d+$/.test(val.trim())) {
            match = options.find(opt => opt.getAttribute('data-id') === val.trim());
        }

        // 4. Match by @username
        if (!match && valLower.includes('@')) {
            const uPart = valLower.split('@')[1]?.split(/[\s\)\-\]\,\.]/)[0]?.trim();
            if (uPart) {
                match = options.find(opt => {
                    const optText = (opt.value + ' ' + (opt.innerText || '') + ' ' + (opt.getAttribute('data-search') || '')).toLowerCase();
                    return optText.includes('@' + uPart) || optText.includes('(' + uPart + ')');
                });
            }
        }

        // 5. Match by phone or search tokens (words)
        if (!match) {
            const tokens = valLower.split(/[\s\-_\/]+/).filter(t => t.length > 0);
            if (tokens.length > 0) {
                match = options.find(opt => {
                    const optText = (opt.value + ' ' + (opt.innerText || '') + ' ' + (opt.getAttribute('data-search') || '')).toLowerCase();
                    return tokens.every(token => optText.includes(token));
                });
            }
        }

        // 6. Partial prefix match or substring
        if (!match && valLower.length >= 2) {
            match = options.find(opt => {
                const optVal = opt.value.toLowerCase();
                const optText = (opt.innerText || opt.text || '').toLowerCase();
                return optVal.startsWith(valLower) || optText.startsWith(valLower) || optVal.includes(valLower) || optText.includes(valLower);
            });
        }

        if (match) {
            const matchedId = match.getAttribute('data-id') || match.value;
            const prev = hiddenElem.value;
            hiddenElem.value = matchedId;
            if (prev !== matchedId) {
                hiddenElem.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof onSelectCallback === 'function') onSelectCallback(matchedId, match, inputElem);
            }
        } else {
            const prev = hiddenElem.value;
            hiddenElem.value = '';
            if (prev !== '') {
                hiddenElem.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof onSelectCallback === 'function') onSelectCallback('', null, inputElem);
            }
        }
    }

});
window.App = App;

