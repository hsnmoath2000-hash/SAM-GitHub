/**
 * SAM User Manager — Hotspot Login & Status Page Studio
 * Comprehensive builder for MikroTik Hotspot login, status, animated ads, packages, shortcuts & router deployment.
 * Fully Responsive & Mobile-Optimized for seamless control on Smartphones and Tablets.
 */
'use strict';

Object.assign(window.App, {
    hotspotStudioData: null,
    hotspotActiveTab: 'theme',
    hotspotMobileMode: 'editor',   // 'editor' or 'preview' on mobile screens
    hotspotPreviewDevice: 'mobile', // 'mobile' or 'desktop'
    hotspotPreviewPage: 'login',    // 'login' or 'status'

    hotspotThemePresets: [
        {
            id: 'modern_indigo',
            name: 'نيلي سحابي حديث',
            desc: 'ثيم أزرق نيلي عصري مع لمسات سيان مضيئة وتدرج ليلي فخم',
            icon: '🌌',
            primary_color: '#4f46e5',
            accent_color: '#06b6d4',
            bg_gradient_start: '#0f172a',
            bg_gradient_end: '#1e1b4b',
            card_bg: '#1e293b',
            card_border: '#334155',
            text_color: '#f8fafc',
            text_muted: '#94a3b8',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)'
        },
        {
            id: 'ocean_blue',
            name: 'أزرق محيطي كريستالي',
            desc: 'ألوان البحر والسماء الصافية مع بطاقات كحلية أنيقة وواضحة',
            icon: '🌊',
            primary_color: '#0284c7',
            accent_color: '#38bdf8',
            bg_gradient_start: '#0b1120',
            bg_gradient_end: '#0c4a6e',
            card_bg: '#151f32',
            card_border: '#23334d',
            text_color: '#f8fafc',
            text_muted: '#94a3b8',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)'
        },
        {
            id: 'emerald_glow',
            name: 'زمردي نيون مستقبلي',
            desc: 'أخضر زمردي جذاب يشع بالحيوية مع بطاقات داكنة عميقة',
            icon: '💎',
            primary_color: '#059669',
            accent_color: '#10b981',
            bg_gradient_start: '#022c22',
            bg_gradient_end: '#064e3b',
            card_bg: '#064e3b',
            card_border: '#0f766e',
            text_color: '#f0fdf4',
            text_muted: '#a7f3d0',
            border_radius: '14px',
            preview_gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
        },
        {
            id: 'cyber_violet',
            name: 'سايبربنك بنفسجي نيون',
            desc: 'ثيم ليلي مستقبلي بألوان البنفسجي الساحر والوردي النيوني',
            icon: '🔮',
            primary_color: '#9333ea',
            accent_color: '#ec4899',
            bg_gradient_start: '#18002e',
            bg_gradient_end: '#3b0764',
            card_bg: '#2e1065',
            card_border: '#581c87',
            text_color: '#faf5ff',
            text_muted: '#d8b4fe',
            border_radius: '18px',
            preview_gradient: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)'
        },
        {
            id: 'royal_gold',
            name: 'ملكي ذهبي وفاخر',
            desc: 'أسود فحمي وأوبسيديان ملكي مع بريق الذهب والعنبر الفاخر',
            icon: '👑',
            primary_color: '#d97706',
            accent_color: '#fbbf24',
            bg_gradient_start: '#0c0a09',
            bg_gradient_end: '#1c1917',
            card_bg: '#1c1917',
            card_border: '#44403c',
            text_color: '#fefce8',
            text_muted: '#fde68a',
            border_radius: '12px',
            preview_gradient: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)'
        },
        {
            id: 'crimson_red',
            name: 'ناري أحمر ساطع',
            desc: 'أحمر قرمزي ناري مفعم بالطاقة والحماس يلفت انتباه المشتركين',
            icon: '🔥',
            primary_color: '#dc2626',
            accent_color: '#f87171',
            bg_gradient_start: '#1c0505',
            bg_gradient_end: '#450a0a',
            card_bg: '#2d0c0c',
            card_border: '#7f1d1d',
            text_color: '#fef2f2',
            text_muted: '#fca5a5',
            border_radius: '14px',
            preview_gradient: 'linear-gradient(135deg, #dc2626 0%, #f87171 100%)'
        },
        {
            id: 'sunset_amber',
            name: 'غروب دافئ برتقالي',
            desc: 'ألوان الغروب الدافئة البرتقالية والكهرمانية المريحة للعين',
            icon: '🌅',
            primary_color: '#ea580c',
            accent_color: '#fb923c',
            bg_gradient_start: '#270d05',
            bg_gradient_end: '#431407',
            card_bg: '#2d140d',
            card_border: '#7c2d12',
            text_color: '#fff7ed',
            text_muted: '#fdba74',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #ea580c 0%, #fb923c 100%)'
        },
        {
            id: 'deep_forest',
            name: 'طبيعة خضراء منعشة',
            desc: 'أخضر الغابات الاستوائية الطبيعي يمنح راحة وثقة عالية',
            icon: '🌿',
            primary_color: '#16a34a',
            accent_color: '#4ade80',
            bg_gradient_start: '#052e16',
            bg_gradient_end: '#14532d',
            card_bg: '#14532d',
            card_border: '#166534',
            text_color: '#f0fdf4',
            text_muted: '#86efac',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)'
        },
        {
            id: 'glass_dark',
            name: 'زجاجي بلوري داكن',
            desc: 'نمط الزجاج الشفاف العائم (Glassmorphism) بلمسات هادئة',
            icon: '❄️',
            primary_color: '#6366f1',
            accent_color: '#a855f7',
            bg_gradient_start: '#0a0f1d',
            bg_gradient_end: '#1e1b4b',
            card_bg: '#131b2e',
            card_border: '#2e3d5c',
            text_color: '#f8fafc',
            text_muted: '#cbd5e1',
            border_radius: '20px',
            preview_gradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
        },
        {
            id: 'magenta_neon',
            name: 'وردي ماجنتا نيون',
            desc: 'وردي فاقع وتوتي توهجي مميز ومبتكر للشبكات العصرية',
            icon: '🌸',
            primary_color: '#db2777',
            accent_color: '#f472b6',
            bg_gradient_start: '#1f0516',
            bg_gradient_end: '#3f0729',
            card_bg: '#350a24',
            card_border: '#831843',
            text_color: '#fdf2f8',
            text_muted: '#f9a8d4',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #db2777 0%, #f472b6 100%)'
        },
        {
            id: 'matte_black',
            name: 'مات أسود فاحم وفخم',
            desc: 'أسود بيور فاخر جداً وموفر لبطاريات شاشات الـ OLED للمشتركين',
            icon: '🖤',
            primary_color: '#38bdf8',
            accent_color: '#818cf8',
            bg_gradient_start: '#000000',
            bg_gradient_end: '#0f0f11',
            card_bg: '#141416',
            card_border: '#27272a',
            text_color: '#f4f4f5',
            text_muted: '#a1a1aa',
            border_radius: '12px',
            preview_gradient: 'linear-gradient(135deg, #27272a 0%, #38bdf8 100%)'
        },
        {
            id: 'clean_light',
            name: 'أبيض ناصع عصري (نهاري)',
            desc: 'تصميم نهاري فاتح ونقي جداً بألوان واضحة وبطاقات بيضاء أنيقة',
            icon: '☀️',
            primary_color: '#2563eb',
            accent_color: '#0284c7',
            bg_gradient_start: '#f1f5f9',
            bg_gradient_end: '#e2e8f0',
            card_bg: '#ffffff',
            card_border: '#cbd5e1',
            text_color: '#0f172a',
            text_muted: '#64748b',
            border_radius: '16px',
            preview_gradient: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)'
        }
    ],

    /**
     * Render the main Hotspot Studio view
     */
    async renderHotspotStudio() {
        const view = document.getElementById('main-view');
        if (!view) return;

        view.innerHTML = `
            <div style="padding:40px; text-align:center; color:#0284c7; font-weight:bold;">
                <div class="spinner" style="margin:0 auto 15px; width:40px; height:40px; border:4px solid #cbd5e1; border-top-color:#0284c7; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                جاري تحميل استوديو إعداد وتخصيص صفحات الهوتسبوت...
            </div>
        `;

        try {
            const activeNetId = this.currentNetworkId ? this.currentNetworkId() : (this.activeNetworkId || 0);
            const res = await this.api('get_hotspot_studio_data', { network_id: activeNetId });
            if (!res || !res.success) {
                this.toast(res?.error || 'فشل تحميل بيانات استوديو الهوتسبوت', 'danger');
                return;
            }
            this.hotspotStudioData = res;
            this.buildHotspotStudioUI();
        } catch (e) {
            console.error('renderHotspotStudio error:', e);
            this.toast('حدث خطأ أثناء تحميل استوديو الهوتسبوت', 'danger');
        }
    },

    /**
     * Build the studio interface
     */
    buildHotspotStudioUI() {
        const view = document.getElementById('main-view');
        if (!view || !this.hotspotStudioData) return;

        const data = this.hotspotStudioData;
        const routers = data.routers || [];
        const activeNetId = data.network_id;

        const routerOptions = routers.map(r => `
            <option value="${r.id}">${this.escape(r.shortname || r.nasname)} (${r.nasname}) — مجلد: ${r.hotspot_dir || 'hotspot'}</option>
        `).join('');

        view.innerHTML = `
        <div class="hotspot-studio-wrapper" style="display:flex; flex-direction:column; min-height:calc(100vh - 70px); background:#f8fafc; font-family:'Cairo', sans-serif;">
            
            <!-- 1. Top Action Toolbar (Responsive for Phone & PC) -->
            <div class="hs-top-bar">
                <div class="hs-header-info">
                    <div class="hs-header-icon">🎨</div>
                    <div>
                        <div class="hs-header-title">
                            <span>استوديو إعداد صفحات الهوتسبوت</span>
                            <span class="hs-header-badge">MikroTik Portal</span>
                        </div>
                        <div class="hs-header-subtitle">تخصيص الهوية، باقات الشبكة، إعلانات متحركة، روابط الاستراحات والبث، وبوابة الكروت</div>
                    </div>
                </div>

                <!-- Router & Actions Row -->
                <div class="hs-top-actions">
                    ${routers.length > 0 ? `
                    <div class="hs-router-box">
                        <span style="font-size:12px; font-weight:700; color:#475569; white-space:nowrap;">الراوتر:</span>
                        <select id="hs-target-router" class="hs-router-select">
                            ${routerOptions}
                        </select>
                        <button class="mt-btn hs-btn-deploy" onclick="App.deployHotspotFromStudio()">
                            🚀 تثبيت بالراوتر
                        </button>
                    </div>
                    ` : ''}

                    <div class="hs-buttons-group">
                        <button class="mt-btn hs-btn-save" onclick="App.saveHotspotStudioSettings()">
                            <span>💾</span> حفظ الإعدادات
                        </button>
                        <button class="mt-btn hs-btn-secondary" onclick="App.downloadHotspotZipBundle(${activeNetId})" title="تحميل ملفات القالب المضغوطة">
                            <span>📦</span> تحميل ZIP
                        </button>
                        <button class="mt-btn hs-btn-secondary" onclick="App.openHotspotLiveWindow(${activeNetId})" title="فتح المعاينة في نافذة جديدة">
                            <span>👁️</span> نافذة جديدة
                        </button>
                    </div>
                </div>
            </div>

            <!-- Mobile Segment Switcher (Shown ONLY on Mobile / Small screens) -->
            <div class="hs-mobile-switcher">
                <button class="hs-mob-tab ${this.hotspotMobileMode === 'editor' ? 'active' : ''}" onclick="App.switchHotspotMobileMode('editor')">
                    🛠️ تعديل وتخصيص الإعدادات
                </button>
                <button class="hs-mob-tab ${this.hotspotMobileMode === 'preview' ? 'active' : ''}" onclick="App.switchHotspotMobileMode('preview')">
                    👁️ المعاينة المباشرة والشاشة
                </button>
            </div>

            <!-- 2. Main Studio Body -->
            <div class="hs-main-body">
                
                <!-- Left/Main: Settings Panels -->
                <div class="hs-settings-panel ${this.hotspotMobileMode === 'preview' ? 'hs-hide-mobile' : ''}">
                    
                    <!-- Navigation Tabs (Horizontal Scroll on Mobile) -->
                    <div class="hs-tabs-nav-bar">
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'theme' ? 'active' : ''}" onclick="App.switchHotspotTab('theme')">🎨 المظهر</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'brand' ? 'active' : ''}" onclick="App.switchHotspotTab('brand')">🏷️ الهوية</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'contacts' ? 'active' : ''}" onclick="App.switchHotspotTab('contacts')">📞 التواصل</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'packages' ? 'active' : ''}" onclick="App.switchHotspotTab('packages')">💎 الباقات</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'ads' ? 'active' : ''}" onclick="App.switchHotspotTab('ads')">📢 إعلانات متحركة</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'shortcuts' ? 'active' : ''}" onclick="App.switchHotspotTab('shortcuts')">🔗 روابط وخدمات</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'pos' ? 'active' : ''}" onclick="App.switchHotspotTab('pos')">🏪 نقاط البيع (POS)</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'options' ? 'active' : ''}" onclick="App.switchHotspotTab('options')">⚙️ خيارات وتحديثات</button>
                        <button class="hs-tab-btn ${this.hotspotActiveTab === 'routers' ? 'active' : ''}" onclick="App.switchHotspotTab('routers')">📡 الراوترات</button>
                    </div>

                    <!-- Tab Contents Container -->
                    <div id="hs-tab-content-container" class="hs-tab-content-box">
                        ${this.renderHotspotTabContent()}
                    </div>

                    <!-- Floating Mobile Save Button at bottom of settings -->
                    <div class="hs-mobile-bottom-save">
                        <button class="mt-btn hs-btn-save-full" onclick="App.saveHotspotStudioSettings()">
                            💾 حفظ الإعدادات وتحديث القالب
                        </button>
                    </div>
                </div>

                <!-- Right: Interactive Live Simulator Preview -->
                <div class="hs-preview-panel ${this.hotspotMobileMode === 'editor' ? 'hs-hide-mobile' : ''}">
                    
                    <!-- Preview Controls Header -->
                    <div class="hs-preview-toolbar">
                        
                        <!-- Switch Page View (Login vs Status) -->
                        <div class="hs-view-switch-box">
                            <button class="hs-view-btn ${this.hotspotPreviewPage === 'login' ? 'active' : ''}" onclick="App.switchHotspotPreviewPage('login')">
                                🔑 قبل الدخول (صفحة الدخول)
                            </button>
                            <button class="hs-view-btn ${this.hotspotPreviewPage === 'status' ? 'active' : ''}" onclick="App.switchHotspotPreviewPage('status')">
                                📊 بعد الدخول (بوابة الكرت)
                            </button>
                        </div>

                        <!-- Switch Device (Mobile vs Desktop) -->
                        <div class="hs-device-switch-box">
                            <button class="hs-view-btn ${this.hotspotPreviewDevice === 'mobile' ? 'active' : ''}" onclick="App.switchHotspotPreviewDevice('mobile')" title="معاينة شاشة الهاتف">
                                📱 هاتف
                            </button>
                            <button class="hs-view-btn ${this.hotspotPreviewDevice === 'desktop' ? 'active' : ''}" onclick="App.switchHotspotPreviewDevice('desktop')" title="معاينة شاشة الكمبيوتر">
                                💻 كمبيوتر
                            </button>
                        </div>

                        <button class="mt-btn hs-btn-refresh-preview" onclick="App.refreshHotspotPreviewFrame()">
                            ⟳ تحديث المعاينة
                        </button>
                    </div>

                    <!-- Simulator Frame Wrapper -->
                    <div id="hs-simulator-container" class="hs-simulator-wrapper">
                        <div id="hs-device-frame" class="hs-frame-box ${this.hotspotPreviewDevice === 'mobile' ? 'mobile-mode' : 'desktop-mode'}">
                            
                            <div class="hs-mobile-notch" style="${this.hotspotPreviewDevice === 'mobile' ? '' : 'display:none;'}">
                                <div class="hs-notch-pill"></div>
                            </div>

                            <iframe id="hs-preview-iframe" class="hs-iframe" src="api.php?action=preview_hotspot_page&network_id=${activeNetId}&type=${this.hotspotPreviewPage}&v=${Date.now()}"></iframe>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <style>
            /* Top bar */
            .hs-top-bar {
                background: #ffffff;
                border-bottom: 1px solid #e2e8f0;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            }
            .hs-header-info { display: flex; align-items: center; gap: 10px; }
            .hs-header-icon {
                font-size: 22px;
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                color: #fff;
                width: 40px;
                height: 40px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 8px rgba(2,132,199,0.25);
                flex-shrink: 0;
            }
            .hs-header-title {
                font-size: 16px;
                font-weight: 900;
                color: #0f172a;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .hs-header-badge {
                font-size: 10px;
                background: #e0f2fe;
                color: #0369a1;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 800;
            }
            .hs-header-subtitle {
                font-size: 11px;
                color: #64748b;
                margin-top: 2px;
            }
            .hs-top-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .hs-router-box {
                display: flex;
                align-items: center;
                gap: 6px;
                background: #f1f5f9;
                padding: 4px 8px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
            }
            .hs-router-select {
                background: #fff;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 5px 8px;
                font-size: 12px;
                font-weight: 700;
                outline: none;
                max-width: 200px;
            }
            .hs-btn-deploy {
                background: #10b981;
                color: #fff;
                font-weight: 800;
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                white-space: nowrap;
            }
            .hs-buttons-group { display: flex; gap: 6px; }
            .hs-btn-save {
                background: #0284c7;
                color: #fff;
                font-weight: 800;
                padding: 8px 14px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 13px;
                white-space: nowrap;
            }
            .hs-btn-secondary {
                background: #f1f5f9;
                color: #334155;
                font-weight: 700;
                padding: 8px 12px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }

            /* Mobile Switcher */
            .hs-mobile-switcher {
                display: none;
                background: #0f172a;
                padding: 8px 12px;
                gap: 8px;
                border-bottom: 1px solid #1e293b;
            }
            .hs-mob-tab {
                flex: 1;
                background: rgba(255,255,255,0.08);
                color: #94a3b8;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                padding: 10px 6px;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                text-align: center;
                transition: all 0.2s;
            }
            .hs-mob-tab.active {
                background: #0284c7;
                color: #fff;
                border-color: #38bdf8;
                box-shadow: 0 2px 8px rgba(2,132,199,0.35);
            }

            /* Main Split Layout */
            .hs-main-body {
                flex: 1;
                display: flex;
                overflow: hidden;
                position: relative;
            }
            .hs-settings-panel {
                width: 480px;
                min-width: 360px;
                max-width: 550px;
                background: #ffffff;
                border-left: 1px solid #e2e8f0;
                display: flex;
                flex-direction: column;
                box-shadow: 2px 0 8px rgba(0,0,0,0.02);
                height: 100%;
                overflow: hidden;
            }
            .hs-tabs-nav-bar {
                display: flex;
                border-bottom: 1px solid #e2e8f0;
                background: #f8fafc;
                overflow-x: auto;
                padding: 4px 6px 0 6px;
                gap: 4px;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            .hs-tabs-nav-bar::-webkit-scrollbar { display: none; }
            .hs-tab-btn {
                background: transparent;
                border: none;
                padding: 10px 12px;
                font-size: 12px;
                font-weight: 700;
                color: #64748b;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
            }
            .hs-tab-btn:hover { color: #0284c7; }
            .hs-tab-btn.active {
                color: #0284c7;
                border-bottom-color: #0284c7;
                background: #ffffff;
                font-weight: 800;
            }
            .hs-tab-content-box {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                -webkit-overflow-scrolling: touch;
            }
            .hs-mobile-bottom-save {
                display: none;
                padding: 12px 16px;
                background: #fff;
                border-top: 1px solid #e2e8f0;
            }
            .hs-btn-save-full {
                width: 100%;
                background: #0284c7;
                color: #fff;
                font-weight: 800;
                padding: 12px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 4px 10px rgba(2,132,199,0.3);
            }

            /* Preview panel */
            .hs-preview-panel {
                flex: 1;
                background: #0b1120;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding: 14px;
                overflow: hidden;
            }
            .hs-preview-toolbar {
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 30px;
                padding: 5px 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
                backdrop-filter: blur(8px);
                flex-wrap: wrap;
                justify-content: center;
            }
            .hs-view-switch-box {
                display: flex;
                background: rgba(0,0,0,0.4);
                padding: 3px;
                border-radius: 20px;
                gap: 2px;
            }
            .hs-device-switch-box {
                display: flex;
                background: rgba(0,0,0,0.4);
                padding: 3px;
                border-radius: 20px;
                gap: 2px;
            }
            .hs-view-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 16px;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }
            .hs-view-btn.active {
                background: #0284c7;
                color: #ffffff;
            }
            .hs-btn-refresh-preview {
                background: transparent;
                color: #38bdf8;
                border: none;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                padding: 4px 8px;
            }
            .hs-simulator-wrapper {
                flex: 1;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            .hs-frame-box {
                background: #ffffff;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                position: relative;
                transition: all 0.3s ease;
            }
            .hs-frame-box.mobile-mode {
                width: 380px;
                height: 720px;
                max-height: 100%;
                max-width: 100%;
                border-radius: 36px;
                border: 8px solid #334155;
            }
            .hs-frame-box.desktop-mode {
                width: 100%;
                height: 100%;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .hs-mobile-notch {
                height: 20px;
                background: #334155;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            .hs-notch-pill {
                width: 90px;
                height: 10px;
                background: #1e293b;
                border-bottom-left-radius: 6px;
                border-bottom-right-radius: 6px;
            }
            .hs-iframe {
                flex: 1;
                width: 100%;
                height: 100%;
                border: none;
                background: #0b1120;
            }

            /* Fields & Inputs */
            .hs-field-group { margin-bottom: 14px; }
            .hs-field-group label { display: block; font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 5px; }
            .hs-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; }
            .hs-input:focus { border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2,132,199,0.2); }

            /* Responsive Media Queries */
            @media (max-width: 960px) {
                .hs-mobile-switcher { display: flex; }
                .hs-mobile-bottom-save { display: block; }
                .hs-settings-panel {
                    width: 100% !important;
                    min-width: 100% !important;
                    max-width: 100% !important;
                    border-left: none;
                }
                .hs-preview-panel {
                    width: 100% !important;
                    height: 100% !important;
                    padding: 8px;
                }
                .hs-hide-mobile { display: none !important; }
                .hs-top-actions { width: 100%; justify-content: space-between; }
                .hs-router-box { width: 100%; justify-content: space-between; }
                .hs-router-select { flex: 1; max-width: none; }
                .hs-buttons-group { width: 100%; display: grid; grid-template-columns: 1fr 1fr 1fr; }
                .hs-btn-save, .hs-btn-secondary { justify-content: center; }
                .hs-frame-box.mobile-mode {
                    width: 100%;
                    height: 100%;
                    border-radius: 12px;
                    border: 2px solid #334155;
                }
            }
        </style>
        `;
    },

    /**
     * Switch Mobile View Mode (Editor vs Live Preview)
     */
    switchHotspotMobileMode(mode) {
        this.hotspotMobileMode = mode;
        const setPanel = document.querySelector('.hs-settings-panel');
        const prevPanel = document.querySelector('.hs-preview-panel');
        
        document.querySelectorAll('.hs-mob-tab').forEach(b => {
            if (b.innerText.includes('تعديل') && mode === 'editor') b.classList.add('active');
            else if (b.innerText.includes('المعاينة') && mode === 'preview') b.classList.add('active');
            else b.classList.remove('active');
        });

        if (setPanel && prevPanel) {
            if (mode === 'editor') {
                setPanel.classList.remove('hs-hide-mobile');
                prevPanel.classList.add('hs-hide-mobile');
            } else {
                setPanel.classList.add('hs-hide-mobile');
                prevPanel.classList.remove('hs-hide-mobile');
                this.refreshHotspotPreviewFrame();
            }
        }
    },

    /**
     * Switch settings tab
     */
    switchHotspotTab(tabKey) {
        // Collect current inputs before switching to avoid losing edits
        this.collectHotspotStudioInputs();
        this.hotspotActiveTab = tabKey;
        document.querySelectorAll('.hs-tab-btn').forEach(btn => btn.classList.remove('active'));
        const container = document.getElementById('hs-tab-content-container');
        if (container) {
            container.innerHTML = this.renderHotspotTabContent();
        }
        // Highlight active tab
        const activeBtn = Array.from(document.querySelectorAll('.hs-tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabKey));
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    },

    /**
     * Switch simulator device view
     */
    switchHotspotPreviewDevice(device) {
        this.hotspotPreviewDevice = device;
        const frame = document.getElementById('hs-device-frame');
        const notch = document.querySelector('.hs-mobile-notch');
        if (!frame) return;

        if (device === 'mobile') {
            frame.classList.remove('desktop-mode');
            frame.classList.add('mobile-mode');
            if (notch) notch.style.display = 'flex';
        } else {
            frame.classList.remove('mobile-mode');
            frame.classList.add('desktop-mode');
            if (notch) notch.style.display = 'none';
        }
        
        document.querySelectorAll('.hs-device-switch-box .hs-view-btn').forEach(b => {
            if (b.innerText.includes('هاتف') && device === 'mobile') b.classList.add('active');
            else if (b.innerText.includes('كمبيوتر') && device === 'desktop') b.classList.add('active');
            else b.classList.remove('active');
        });
    },

    /**
     * Switch simulator page view (login vs status)
     */
    switchHotspotPreviewPage(page) {
        this.hotspotPreviewPage = page;
        this.refreshHotspotPreviewFrame();
        document.querySelectorAll('.hs-view-switch-box .hs-view-btn').forEach(b => {
            if (b.innerText.includes('قبل الدخول') && page === 'login') b.classList.add('active');
            else if (b.innerText.includes('بعد الدخول') && page === 'status') b.classList.add('active');
            else b.classList.remove('active');
        });
    },

    /**
     * Refresh the iframe preview
     */
    refreshHotspotPreviewFrame() {
        const iframe = document.getElementById('hs-preview-iframe');
        if (!iframe || !this.hotspotStudioData) return;
        const netId = this.hotspotStudioData.network_id;
        iframe.src = `api.php?action=preview_hotspot_page&network_id=${netId}&type=${this.hotspotPreviewPage}&v=${Date.now()}`;
    },

    /**
     * Render tab content based on active tab
     */
    renderHotspotTabContent() {
        const s = this.hotspotStudioData?.settings || {};
        const t = s.theme || {};
        const b = s.brand || {};
        const c = s.contacts || {};
        const p = s.packages_config || {};
        const a = s.ads || {};
        const sc = s.shortcuts || {};
        const opt = s.login_options || {};
        const stOpt = s.status_options || {};

        switch (this.hotspotActiveTab) {
            case 'theme':
                return `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">🎨 مكتبة القوالب والثيمات الجاهزة (${(this.hotspotThemePresets || []).length} ثيم ملون)</h4>
                    </div>
                    <p style="font-size:12px; color:#64748b; line-height:1.5; margin-bottom:16px;">
                        اختر أي قالب وثيم ملون أدناه لتطبيقه بضغطة زر واحدة على صفحة تسجيل الدخول وبوابة كروت المشتركين، أو قم بتخصيص الألوان يدوياً.
                    </p>

                    <!-- Hidden Active Preset Field -->
                    <input type="hidden" id="hs-active-theme-preset" value="${t.theme_preset || 'modern_indigo'}" />

                    <!-- Presets Gallery Grid -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; margin-bottom:20px;">
                        ${(this.hotspotThemePresets || []).map(preset => {
                            const isActive = (t.theme_preset === preset.id) || (!t.theme_preset && preset.id === 'modern_indigo') || (t.primary_color === preset.primary_color && t.bg_gradient_start === preset.bg_gradient_start);
                            return `
                            <div class="hs-theme-preset-card" onclick="App.applyHotspotThemePreset('${preset.id}')" style="background:${preset.bg_gradient_start}; border:${isActive ? '2.5px solid #38bdf8' : '1px solid #334155'}; border-radius:12px; padding:12px; cursor:pointer; position:relative; overflow:hidden; transition:all 0.2s ease; box-shadow:${isActive ? '0 0 15px rgba(56,189,248,0.35)' : '0 2px 6px rgba(0,0,0,0.2)'}; text-align:right;">
                                
                                <!-- Top preview color bar -->
                                <div style="height:6px; background:${preset.preview_gradient}; border-radius:4px; margin-bottom:10px;"></div>
                                
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <div style="font-weight:900; font-size:13px; color:#fff; display:flex; align-items:center; gap:6px;">
                                        <span>${preset.icon}</span>
                                        <span>${preset.name}</span>
                                    </div>
                                    ${isActive ? '<span style="font-size:10px; background:#10b981; color:#fff; font-weight:800; padding:2px 6px; border-radius:4px;">✓ مفعل</span>' : ''}
                                </div>
                                
                                <p style="font-size:11px; color:#94a3b8; line-height:1.4; margin-bottom:10px; min-height:30px;">${preset.desc}</p>
                                
                                <!-- Color Swatch Dots & Apply Button -->
                                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.12); padding-top:8px;">
                                    <div style="display:flex; gap:5px; align-items:center;" title="الأساسي | المميز | البطاقة">
                                        <span style="width:16px; height:16px; border-radius:50%; background:${preset.primary_color}; border:1px solid rgba(255,255,255,0.4); display:inline-block;" title="اللون الأساسي: ${preset.primary_color}"></span>
                                        <span style="width:16px; height:16px; border-radius:50%; background:${preset.accent_color}; border:1px solid rgba(255,255,255,0.4); display:inline-block;" title="اللون المميز: ${preset.accent_color}"></span>
                                        <span style="width:16px; height:16px; border-radius:50%; background:${preset.card_bg}; border:1px solid rgba(255,255,255,0.4); display:inline-block;" title="لون البطاقة: ${preset.card_bg}"></span>
                                    </div>
                                    <button type="button" class="mt-btn" style="background:${isActive ? '#10b981' : 'rgba(255,255,255,0.15)'}; color:#fff; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; border:none; cursor:pointer;">
                                        ${isActive ? 'مطبق حالياً' : 'تطبيق ⚡'}
                                    </button>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Advanced Manual Color Customizer -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:14px; margin-top:10px;">
                        <div style="font-weight:800; font-size:13px; color:#0f172a; margin-bottom:12px;">⚙️ تخصيص يدوي متقدم للألوان والتدرجات:</div>
                        
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                            <div class="hs-field-group">
                                <label>اللون الأساسي للأزرار (Primary):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-primary-color" value="${t.primary_color || '#0284c7'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-primary-color-text').value=this.value" />
                                    <input type="text" id="hs-primary-color-text" class="hs-input" style="flex:1;" value="${t.primary_color || '#0284c7'}" oninput="document.getElementById('hs-primary-color').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>اللون المميز للباقات (Accent):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-accent-color" value="${t.accent_color || '#10b981'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-accent-color-text').value=this.value" />
                                    <input type="text" id="hs-accent-color-text" class="hs-input" style="flex:1;" value="${t.accent_color || '#10b981'}" oninput="document.getElementById('hs-accent-color').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>بداية تدرج الخلفية (Bg Start):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-bg-start" value="${t.bg_gradient_start || '#0b1120'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-bg-start-text').value=this.value" />
                                    <input type="text" id="hs-bg-start-text" class="hs-input" style="flex:1;" value="${t.bg_gradient_start || '#0b1120'}" oninput="document.getElementById('hs-bg-start').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>نهاية تدرج الخلفية (Bg End):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-bg-end" value="${t.bg_gradient_end || '#0c4a6e'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-bg-end-text').value=this.value" />
                                    <input type="text" id="hs-bg-end-text" class="hs-input" style="flex:1;" value="${t.bg_gradient_end || '#0c4a6e'}" oninput="document.getElementById('hs-bg-end').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>لون خلفية البطاقات (Card Bg):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-card-bg" value="${t.card_bg || '#151f32'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-card-bg-text').value=this.value" />
                                    <input type="text" id="hs-card-bg-text" class="hs-input" style="flex:1;" value="${t.card_bg || '#151f32'}" oninput="document.getElementById('hs-card-bg').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>لون إطار البطاقات (Card Border):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-card-border" value="${t.card_border || '#23334d'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-card-border-text').value=this.value" />
                                    <input type="text" id="hs-card-border-text" class="hs-input" style="flex:1;" value="${t.card_border || '#23334d'}" oninput="document.getElementById('hs-card-border').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>لون النص الرئيسي (Text Color):</label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="color" id="hs-text-color" value="${t.text_color || '#f8fafc'}" style="width:44px; height:38px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onchange="document.getElementById('hs-text-color-text').value=this.value" />
                                    <input type="text" id="hs-text-color-text" class="hs-input" style="flex:1;" value="${t.text_color || '#f8fafc'}" oninput="document.getElementById('hs-text-color').value=this.value" />
                                </div>
                            </div>

                            <div class="hs-field-group">
                                <label>انحناء حواف البطاقات (Border Radius):</label>
                                <select id="hs-radius" class="hs-input" style="height:38px;">
                                    <option value="8px" ${t.border_radius === '8px' ? 'selected' : ''}>حواف حادة قليلاً (8px)</option>
                                    <option value="12px" ${t.border_radius === '12px' ? 'selected' : ''}>انحناء متوسط (12px)</option>
                                    <option value="14px" ${t.border_radius === '14px' ? 'selected' : ''}>انحناء أنيق (14px)</option>
                                    <option value="16px" ${(!t.border_radius || t.border_radius === '16px') ? 'selected' : ''}>انحناء عصري جذاب (16px - الافتراضي)</option>
                                    <option value="18px" ${t.border_radius === '18px' ? 'selected' : ''}>انحناء دائري ناعم (18px)</option>
                                    <option value="20px" ${t.border_radius === '20px' ? 'selected' : ''}>انحناء زجاجي فائق (20px)</option>
                                    <option value="24px" ${t.border_radius === '24px' ? 'selected' : ''}>انحناء كبير (24px)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                `;

            case 'brand':
                return `
                <div>
                    <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:14px;">🏷️ الهوية البصرية واسم الشبكة</h4>
                    
                    <div class="hs-field-group">
                        <label>اسم الشبكة الظاهر في العنوان:</label>
                        <input type="text" id="hs-brand-name" class="hs-input" value="${this.escape(b.network_name || '')}" placeholder="مثال: شبكة الفهد نت للإنترنت السريع" />
                    </div>

                    <div class="hs-field-group">
                        <label>الشعار اللفظي / عبارة الترويج (Slogan):</label>
                        <input type="text" id="hs-brand-slogan" class="hs-input" value="${this.escape(b.slogan || '')}" placeholder="مثال: إنترنت فائق السرعة واستقرار عالي" />
                    </div>

                    <div class="hs-field-group">
                        <label>عبارة الترحيب في صفحة تسجيل الدخول:</label>
                        <textarea id="hs-welcome-msg" class="hs-input" style="height:60px; resize:vertical;" placeholder="أهلاً بك! أدخل رقم الكرت للاتصال بالإنترنت">${this.escape(b.welcome_message || '')}</textarea>
                    </div>

                    <div class="hs-field-group">
                        <label>رابط خادم النظام الخارجي للـ API (Server Base URL):</label>
                        <input type="text" id="hs-server-api-url" class="hs-input" value="${this.escape(b.server_api_url || '')}" placeholder="http://example.invalid أو اتركه فارغاً إذا كان محلياً" />
                        <small style="font-size:11px; color:#64748b; margin-top:3px; display:block;">يستخدم هذا الرابط من صفحة الكرت داخل الراوتر للاتصال بسيرفر التحكم وتغيير السرعة.</small>
                    </div>

                    <div class="hs-field-group">
                        <label>صورة الشعار (رفع أو رابط):</label>
                        <div style="display:flex;gap:6px;align-items:center;"><input type="text" id="hs-logo-url" class="hs-input" value="${this.escape(b.logo_url || '')}" placeholder="رابط الصورة أو ارفع ملفاً" /><input id="hs-logo-file" type="file" accept="image/*" style="max-width:180px" onchange="App.uploadHotspotImage(this,'hs-logo-url','hotspot-logo')" /></div>
                    </div>

                    <div class="hs-field-group">
                        <label>أيقونة الشعار البديلة (إيموجي أو رمز):</label>
                        <input type="text" id="hs-logo-icon" class="hs-input" style="width:100px; text-align:center; font-size:20px;" value="${this.escape(b.logo_icon || '📶')}" />
                    </div>

                    <div class="hs-field-group">
                        <label>نص التذييل وحقوق النشر (Footer):</label>
                        <input type="text" id="hs-footer-text" class="hs-input" value="${this.escape(b.footer_text || '')}" placeholder="خدمة الإنترنت السريع والآمن | جميع الحقوق محفوظة" />
                    </div>
                </div>
                `;

            case 'contacts':
                const phonesStr = (c.phones || []).join(', ');
                return `
                <div>
                    <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:14px;">📞 أرقام التواصل ونقاط البيع</h4>
                    
                    <div class="hs-field-group">
                        <label>أرقام هواتف الاتصال المباشر (افصل بينها بفاصلة):</label>
                        <input type="text" id="hs-contact-phones" class="hs-input" value="${this.escape(phonesStr)}" placeholder="770000000, 730000000" />
                    </div>

                    <div class="hs-field-group">
                        <label>رقم الواتساب لاستقبال الاستفسارات وطلبات الباقات:</label>
                        <input type="text" id="hs-contact-whatsapp" class="hs-input" value="${this.escape(c.whatsapp || '')}" placeholder="770000000" />
                    </div>

                    <div class="hs-field-group">
                        <label>رسالة الواتساب الافتراضية عند الضغط على زر التواصل:</label>
                        <input type="text" id="hs-wa-msg" class="hs-input" value="${this.escape(c.whatsapp_message || '')}" placeholder="مرحباً، أود الاستفسار عن كروت وباقات الإنترنت" />
                    </div>

                    <div class="hs-field-group">
                        <label>معرف أو رابط قناة التليجرام (Telegram Channel):</label>
                        <input type="text" id="hs-contact-telegram" class="hs-input" value="${this.escape(c.telegram || '')}" placeholder="@MyNetwork_Net" />
                    </div>

                    <div class="hs-field-group">
                        <label>أماكن تواجد الكروت ونقاط البيع (POS Locations):</label>
                        <textarea id="hs-pos-locations" class="hs-input" style="height:70px; resize:vertical;" placeholder="متوفر في جميع البقالات ومراكز التسوق ونقاط البيع المعتمدة">${this.escape(c.pos_locations || '')}</textarea>
                    </div>
                </div>
                `;

            case 'packages':
                const dbPackages = this.hotspotStudioData?.db_packages || [];
                const pkgItems = (p.package_items && p.package_items.length > 0) ? p.package_items : dbPackages.map(dp => ({
                    id: dp.id,
                    name: dp.name,
                    price: dp.price,
                    validity: dp.validity,
                    rate_limit: dp.rate_limit,
                    quota_label: dp.quota_label,
                    badge: dp.price == 0 ? 'مجاني' : '',
                    badge_color: '',
                    description: '',
                    custom_order_msg: '',
                    enabled: true,
                    featured: false,
                    is_custom: false
                }));

                // Ensure p.package_items is populated
                p.package_items = pkgItems;

                return `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">💎 باقات وعروض الشبكة (المدفوعة والمجانية)</h4>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-pkg-enabled" ${p.enabled !== false ? 'checked' : ''} />
                            تفعيل قسم الباقات
                        </label>
                    </div>
                    
                    <p style="font-size:12px; color:#64748b; line-height:1.6; margin-bottom:15px;">
                        تظهر الباقات المدفوعة والمجانية في صفحة تسجيل الدخول للمشتركين مع إمكانية تمييز الباقات الأكثر طلباً وتخصيص أسماء العرض والشارات والطلب الفوري عبر الواتساب.
                    </p>

                    <!-- Section General Config -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; margin-bottom:16px;">
                        <div style="font-weight:800; font-size:13px; color:#0369a1; margin-bottom:10px;">⚙️ إعدادات قسم الباقات العام:</div>
                        
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#475569;">عنوان القسم:</label>
                                <input type="text" id="hs-pkg-title" class="hs-input" value="${this.escape(p.title || '💎 باقات وعروض الشبكة')}" placeholder="💎 باقات وعروض الشبكة" />
                            </div>
                            <div>
                                <label style="font-size:11px; font-weight:700; color:#475569;">نص زر الطلب والشراء:</label>
                                <input type="text" id="hs-pkg-order-btn-text" class="hs-input" value="${this.escape(p.order_btn_text || 'طلب الباقة ⚡')}" placeholder="طلب الباقة ⚡" />
                            </div>
                        </div>

                        <div style="margin-bottom:10px;">
                            <label style="font-size:11px; font-weight:700; color:#475569;">الوصف التوضيحي للقسم:</label>
                            <input type="text" id="hs-pkg-subtitle" class="hs-input" value="${this.escape(p.subtitle || 'اختر باقتك المفضلة واستمتع باتصال مستقر وسريع')}" placeholder="اختر باقتك المفضلة واستمتع بأقصى سرعة" />
                        </div>

                        <div style="margin-bottom:10px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#334155; cursor:pointer;">
                                <input type="checkbox" id="hs-pkg-show-order-btn" ${p.show_order_btn !== false ? 'checked' : ''} />
                                إتاحة زر طلب وشراء الباقة عبر الواتساب مباشرة
                            </label>
                        </div>

                        <div>
                            <label style="font-size:11px; font-weight:700; color:#475569;">قالب رسالة الواتساب عند طلب الباقة:</label>
                            <input type="text" id="hs-pkg-wa-template" class="hs-input" value="${this.escape(p.whatsapp_msg_template || 'مرحباً، أود الاشتراك في باقة {name} بسعر {price} من شبكة {network}')}" placeholder="مرحباً، أود الاشتراك في باقة {name}..." />
                            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; font-size:10px;">
                                <span style="color:#64748b; font-weight:700;">المتغيرات المتاحة:</span>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 6px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.insertPkgWaTag('{name}')">{name}</button>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 6px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.insertPkgWaTag('{price}')">{price}</button>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 6px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.insertPkgWaTag('{validity}')">{validity}</button>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 6px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.insertPkgWaTag('{quota}')">{quota}</button>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 6px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.insertPkgWaTag('{network}')">{network}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Packages List Cards -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-weight:800; font-size:13px; color:#334155;">قائمة الباقات والعروض (${pkgItems.length} باقة):</span>
                        <button type="button" class="mt-btn" style="background:#f1f5f9; color:#475569; padding:4px 8px; font-size:11px; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" onclick="App.resyncHotspotPackagesFromDb()">
                            🔄 استيراد من النظام
                        </button>
                    </div>

                    <div id="hs-packages-list-container" style="display:flex; flex-direction:column; gap:12px; margin-bottom:15px;">
                        ${pkgItems.map((pkg, idx) => {
                            const isFree = (pkg.package_type === 'free') || (parseFloat(pkg.price || 0) === 0);
                            return `
                        <div class="hs-pkg-item-card" data-idx="${idx}" data-id="${pkg.id}" data-package-type="${pkg.package_type || (isFree ? 'free' : 'paid')}" data-custom="${pkg.is_custom ? 'true' : 'false'}" style="background:${pkg.featured ? '#f0fdf4' : (isFree ? '#f0fdfa' : '#ffffff')}; border:${pkg.featured ? '2px solid #10b981' : (isFree ? '1.5px solid #0d9488' : '1px solid #cbd5e1')}; border-radius:10px; padding:12px; position:relative; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                            
                            <!-- Card Header Bar -->
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="font-weight:900; font-size:13px; color:#0f172a;">${pkg.featured ? '⭐' : (isFree ? '🎁' : '💎')} #${idx + 1}</span>
                                    <span style="font-size:12px; font-weight:800; color:${isFree ? '#0d9488' : '#0284c7'};">${this.escape(pkg.name)}</span>
                                    ${isFree ? '<span style="font-size:10px; background:#ccfbf1; color:#0f766e; padding:1px 6px; border-radius:4px; font-weight:800;">🎁 باقة مجانية</span>' : ''}
                                    ${pkg.is_custom ? '<span style="font-size:10px; background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-weight:800;">باقة مخصصة</span>' : ''}
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#15803d; cursor:pointer;" title="تمييز الباقة بإطار مضيء وشارة خاصة">
                                        <input type="checkbox" class="hs-pkg-item-featured" ${pkg.featured ? 'checked' : ''} onchange="App.collectHotspotStudioInputs(); App.switchHotspotTab('packages');" />
                                        ⭐ مميزة
                                    </label>
                                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#334155; cursor:pointer;">
                                        <input type="checkbox" class="hs-pkg-item-enabled" ${pkg.enabled !== false ? 'checked' : ''} />
                                        👁️ إظهار
                                    </label>
                                </div>
                            </div>

                            <!-- Row 1: Name, Price, Badge -->
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">اسم الباقة الظاهر:</label>
                                    <input type="text" class="hs-input hs-pkg-item-name" value="${this.escape(pkg.name || '')}" placeholder="اسم الباقة" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">السعر (ريال):</label>
                                    <input type="number" class="hs-input hs-pkg-item-price" value="${pkg.price !== undefined ? pkg.price : 0}" placeholder="0" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">الشارة الترويجية (Badge):</label>
                                    <input type="text" class="hs-input hs-pkg-item-badge" value="${this.escape(pkg.badge || (isFree ? 'مجاني 🎁' : ''))}" placeholder="مثال: الأكثر طلباً ⭐" />
                                </div>
                            </div>

                            <!-- Quick Preset Badges -->
                            <div style="display:flex; gap:4px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
                                <span style="font-size:10px; color:#64748b; font-weight:700;">شارات سريعة:</span>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; padding:1px 5px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.setHotspotPackageBadgePreset(${idx}, 'الأكثر طلباً ⭐')">⭐ الأكثر طلباً</button>
                                <button type="button" class="mt-btn" style="background:#fef2f2; color:#b91c1c; padding:1px 5px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.setHotspotPackageBadgePreset(${idx}, 'خصم 20% 🔥')">🔥 خصم 20%</button>
                                <button type="button" class="mt-btn" style="background:#fefce8; color:#a16207; padding:1px 5px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.setHotspotPackageBadgePreset(${idx}, 'VIP 👑')">👑 VIP</button>
                                <button type="button" class="mt-btn" style="background:#f0fdf4; color:#15803d; padding:1px 5px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.setHotspotPackageBadgePreset(${idx}, 'عرض خاص 🎉')">🎉 عرض خاص</button>
                                <button type="button" class="mt-btn" style="background:#f1f5f9; color:#475569; padding:1px 5px; font-size:10px; border-radius:4px; border:none; cursor:pointer;" onclick="App.setHotspotPackageBadgePreset(${idx}, '')">مسح</button>
                            </div>

                            <!-- Row 2: Quota, Validity, Speed -->
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">📊 الرصيد:</label>
                                    <input type="text" class="hs-input hs-pkg-item-quota" value="${this.escape(pkg.quota_label || '')}" placeholder="5 GB" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">⏳ الصلاحية:</label>
                                    <input type="text" class="hs-input hs-pkg-item-validity" value="${this.escape(pkg.validity || '')}" placeholder="30 يوم" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">⚡ السرعة:</label>
                                    <input type="text" class="hs-input hs-pkg-item-speed" value="${this.escape(pkg.rate_limit || '')}" placeholder="أقصى سرعة" />
                                </div>
                            </div>

                            <!-- Row 3: Description -->
                            <div style="margin-bottom:8px;">
                                <label style="font-size:11px; font-weight:700; color:#475569;">وصف ومزايا الباقة:</label>
                                <input type="text" class="hs-input hs-pkg-item-desc" value="${this.escape(pkg.description || '')}" placeholder="تصفح غير محدود وسرعة مميزة لليوتيوب والألعاب..." />
                            </div>

                            <!-- Card Footer: Reorder / Delete -->
                            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:6px;">
                                <div style="display:flex; gap:4px;">
                                    <button type="button" class="mt-btn" style="background:#f1f5f9; color:#475569; padding:2px 8px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;" onclick="App.moveHotspotPackageItem(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.4;"' : ''}>🔼 للأعلى</button>
                                    <button type="button" class="mt-btn" style="background:#f1f5f9; color:#475569; padding:2px 8px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;" onclick="App.moveHotspotPackageItem(${idx}, 1)" ${idx === pkgItems.length - 1 ? 'disabled style="opacity:0.4;"' : ''}>🔽 للأسفل</button>
                                </div>
                                ${pkg.is_custom ? `
                                <button type="button" class="mt-btn" style="background:#fee2e2; color:#991b1b; padding:2px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="App.removeHotspotPackageItem(${idx})">🗑️ حذف الباقة المخصصة</button>
                                ` : ''}
                            </div>
                        </div>
                        `;
                        }).join('')}
                    </div>

                    <button type="button" class="mt-btn" style="width:100%; background:#e0f2fe; color:#0369a1; font-weight:800; border:1px dashed #0284c7; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;" onclick="App.addHotspotPackageItem()">
                        ➕ إضافة باقة ترويجية مخصصة جديدة
                    </button>
                </div>
                `;

            case 'ads':
                const adItems = a.items || [];
                return `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">📢 إدارة الإعلانات والبنرات المتحركة</h4>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-ads-enabled" ${a.enabled !== false ? 'checked' : ''} />
                            تفعيل شريط الإعلانات
                        </label>
                    </div>

                    <div style="display:flex; gap:12px; background:#f1f5f9; padding:10px 12px; border-radius:8px; margin-bottom:15px; align-items:center; flex-wrap:wrap;">
                        <label style="font-size:12px; font-weight:700; color:#334155;">سرعة التقليب التلقائي:</label>
                        <select id="hs-ads-speed" class="hs-input" style="width:140px; padding:4px 8px;">
                            <option value="3" ${a.rotation_speed == 3 ? 'selected' : ''}>كل 3 ثوانٍ</option>
                            <option value="4" ${(!a.rotation_speed || a.rotation_speed == 4) ? 'selected' : ''}>كل 4 ثوانٍ (افتراضي)</option>
                            <option value="6" ${a.rotation_speed == 6 ? 'selected' : ''}>كل 6 ثوانٍ</option>
                            <option value="8" ${a.rotation_speed == 8 ? 'selected' : ''}>كل 8 ثوانٍ</option>
                        </select>
                    </div>

                    <div id="hs-ads-list-container" style="display:flex; flex-direction:column; gap:12px; margin-bottom:15px;">
                        ${adItems.map((ad, idx) => `
                        <div class="hs-ad-card" data-idx="${idx}" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; position:relative;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:800; font-size:13px; color:#0f172a;">إعلان رقم #${idx + 1}</span>
                                <button type="button" class="mt-btn" style="background:#fee2e2; color:#991b1b; padding:2px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="App.removeHotspotAdItem(${idx})">🗑️ حذف</button>
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">عنوان الإعلان:</label>
                                    <input type="text" class="hs-input hs-ad-title" value="${this.escape(ad.title || '')}" placeholder="عنوان جذاب" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">شارة الإعلان (Badge):</label>
                                    <input type="text" class="hs-input hs-ad-badge" value="${this.escape(ad.badge || 'عرض خاص')}" placeholder="مثال: جديد، تخفيض" />
                                </div>
                            </div>
                            <div style="margin-bottom:8px;">
                                <label style="font-size:11px; font-weight:700; color:#475569;">تفاصيل ووصف الإعلان:</label>
                                <input type="text" class="hs-input hs-ad-desc" value="${this.escape(ad.desc || '')}" placeholder="تفاصيل العرض الترويجي..." />
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">صورة الإعلان (رفع أو رابط):</label>
                                    <div style="display:flex;gap:5px;"><input type="text" class="hs-input hs-ad-img" value="${this.escape(ad.image_url || '')}" placeholder="رابط الصورة" /><input type="file" accept="image/*" style="max-width:130px" onchange="App.uploadHotspotImage(this,null,'hotspot-ad')" /></div>
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">رابط التوجيه (اختياري):</label>
                                    <input type="text" class="hs-input hs-ad-link" value="${this.escape(ad.link_url || '')}" placeholder="https://wa.me/..." />
                                </div>
                            </div>
                            <div style="display:flex; gap:16px; font-size:12px; font-weight:700; color:#334155; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-ad-show-login" ${ad.show_on_login !== false ? 'checked' : ''} />
                                    عرض قبل الدخول (صفحة الدخول)
                                </label>
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-ad-show-status" ${ad.show_on_status !== false ? 'checked' : ''} />
                                    عرض بعد الدخول (بوابة الكرت)
                                </label>
                            </div>
                        </div>
                        `).join('')}
                    </div>

                    <button type="button" class="mt-btn" style="width:100%; background:#e0f2fe; color:#0369a1; font-weight:800; border:1px dashed #0284c7; padding:10px; border-radius:8px; cursor:pointer;" onclick="App.addHotspotAdItem()">
                        ➕ إضافة بنر إعلان جديد
                    </button>
                </div>
                `;

            case 'shortcuts':
                const scItems = sc.items || [];
                return `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">🔗 روابط الاستراحات، البث المباشر، والسيرفرات</h4>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-sc-enabled" ${sc.enabled !== false ? 'checked' : ''} />
                            تفعيل قسم الروابط والخدمات
                        </label>
                    </div>

                    <div class="hs-field-group">
                        <label>عنوان قسم الخدمات الترفيهية:</label>
                        <input type="text" id="hs-sc-title" class="hs-input" value="${this.escape(sc.title || '🌟 خدمات وروابط الشبكة السريعة')}" />
                    </div>

                    <div class="hs-field-group">
                        <label>الوصف التوضيحي للقسم:</label>
                        <input type="text" id="hs-sc-subtitle" class="hs-input" value="${this.escape(sc.subtitle || 'بث مباشر، استراحات، وسيرفرات ترفيهية داخلية بدون استهلاك رصيد')}" />
                    </div>

                    <div id="hs-sc-list-container" style="display:flex; flex-direction:column; gap:12px; margin-bottom:15px;">
                        ${scItems.map((item, idx) => `
                        <div class="hs-sc-card" data-idx="${idx}" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; position:relative;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:800; font-size:13px; color:#0f172a;">خدمة / رابط #${idx + 1}</span>
                                <button type="button" class="mt-btn" style="background:#fee2e2; color:#991b1b; padding:2px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="App.removeHotspotShortcutItem(${idx})">🗑️ حذف</button>
                            </div>
                            <div style="display:grid; grid-template-columns:70px 1fr 90px; gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">الأيقونة:</label>
                                    <input type="text" class="hs-input hs-sc-icon" style="text-align:center; font-size:18px;" value="${this.escape(item.icon || '🔗')}" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">اسم الخدمة / الرابط:</label>
                                    <input type="text" class="hs-input hs-sc-title-field" value="${this.escape(item.title || '')}" placeholder="مثال: بث مباشر للمباريات" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">شارة (Badge):</label>
                                    <input type="text" class="hs-input hs-sc-badge" value="${this.escape(item.badge || 'مباشر')}" placeholder="مباشر، VIP" />
                                </div>
                            </div>
                            <div style="margin-bottom:8px;">
                                <label style="font-size:11px; font-weight:700; color:#475569;">وصف الخدمة:</label>
                                <input type="text" class="hs-input hs-sc-desc" value="${this.escape(item.desc || '')}" placeholder="مشاهدة المباريات بجودة عالية وبدون استهلاك للرصيد" />
                            </div>
                            <div style="margin-bottom:8px;">
                                <label style="font-size:11px; font-weight:700; color:#475569;">رابط التوجيه (URL):</label>
                                <input type="text" class="hs-input hs-sc-url" value="${this.escape(item.url || '')}" placeholder="http://192.168.88.254:8080/live" />
                            </div>
                            <div style="display:flex; gap:16px; font-size:12px; font-weight:700; color:#334155; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-sc-show-login" ${item.show_on_login !== false ? 'checked' : ''} />
                                    عرض قبل الدخول (Login)
                                </label>
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-sc-show-status" ${item.show_on_status !== false ? 'checked' : ''} />
                                    عرض بعد الدخول (Status)
                                </label>
                            </div>
                        </div>
                        `).join('')}
                    </div>

                    <button type="button" class="mt-btn" style="width:100%; background:#e0f2fe; color:#0369a1; font-weight:800; border:1px dashed #0284c7; padding:10px; border-radius:8px; cursor:pointer;" onclick="App.addHotspotShortcutItem()">
                        ➕ إضافة رابط خدمة ترفيهية / بث جديد
                    </button>
                </div>
                `;

            case 'pos':
                const pos = s.pos_config || {};
                const posItems = pos.items || [];
                return `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">🏪 مراكز ونقاط بيع وتوزيع الكروت المعتمدة</h4>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-pos-enabled" ${pos.enabled !== false ? 'checked' : ''} />
                            تفعيل قسم نقاط ومراكز البيع
                        </label>
                    </div>

                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <div style="font-size:13px; font-weight:800; color:#166534;">🔄 المزامنة التلقائية مع وكلاء وموزعي النظام (Admins / POS Agents)</div>
                            <div style="font-size:11px; color:#15803d; margin-top:2px;">جلب نقاط بيع وموزعي الشبكة النشطين من قاعدة البيانات تلقائياً وتحديث أرقامهم وعناوينهم</div>
                        </div>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-pos-auto-sync" ${pos.auto_sync_admins !== false ? 'checked' : ''} />
                            مزامنة تلقائية
                        </label>
                    </div>

                    <div class="hs-field-group">
                        <label>عنوان قسم نقاط البيع في الصفحة:</label>
                        <input type="text" id="hs-pos-title" class="hs-input" value="${this.escape(pos.title || '🏪 مراكز ونقاط بيع وتوزيع الكروت المعتمدة')}" />
                    </div>

                    <div class="hs-field-group">
                        <label>الوصف التوضيحي للقسم:</label>
                        <input type="text" id="hs-pos-subtitle" class="hs-input" value="${this.escape(pos.subtitle || 'تفضل بزيارة أقرب موزع أو مركز بيع معتمد لشراء وتجديد باقات الإنترنت')}" />
                    </div>

                    <div class="hs-field-group">
                        <label>نص مربع البحث عن النقاط والأحياء:</label>
                        <input type="text" id="hs-pos-search-placeholder" class="hs-input" value="${this.escape(pos.search_placeholder || '🔍 ابحث عن أقرب مركز بيع، حي، شارع أو رقم هاتف...')}" />
                    </div>

                    <div id="hs-pos-list-container" style="display:flex; flex-direction:column; gap:12px; margin-bottom:15px;">
                        ${posItems.map((item, idx) => `
                        <div class="hs-pos-card" data-idx="${idx}" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; position:relative;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-weight:800; font-size:13px; color:#0f172a;">🏪 نقطة بيع #${idx + 1}: <b>${this.escape(item.name || 'بدون اسم')}</b></span>
                                    ${item.is_admin_sync ? '<span style="font-size:10px; background:#dbeafe; color:#1e40af; padding:1px 6px; border-radius:4px; font-weight:700;">مزامن من النظام</span>' : ''}
                                </div>
                                <button type="button" class="mt-btn" style="background:#fee2e2; color:#991b1b; padding:2px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="App.removeHotspotPosItem(${idx})">🗑️ حذف</button>
                            </div>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">اسم المركز / المحل:</label>
                                    <input type="text" class="hs-input hs-pos-name" value="${this.escape(item.name || '')}" placeholder="مركز الأمل للاتصالات" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">رقم الهاتف / الاتصال:</label>
                                    <input type="text" class="hs-input hs-pos-phone" value="${this.escape(item.phone || '')}" placeholder="770000000" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">رقم الواتساب:</label>
                                    <input type="text" class="hs-input hs-pos-whatsapp" value="${this.escape(item.whatsapp || item.phone || '')}" placeholder="770000000" />
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 120px 130px; gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">العنوان / الحي / الشارع:</label>
                                    <input type="text" class="hs-input hs-pos-address" value="${this.escape(item.address || '')}" placeholder="الشارع العام - بجوار بنك التضامن" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">أوقات العمل:</label>
                                    <input type="text" class="hs-input hs-pos-hours" value="${this.escape(item.working_hours || '8:00 ص - 11:30 م')}" placeholder="8 ص - 11 م" />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">شارة التميز (Badge):</label>
                                    <input type="text" class="hs-input hs-pos-badge" value="${this.escape(item.badge || 'نقطة معتمدة')}" placeholder="مركز رئيسي ⭐" />
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">رابط الموقع على الخريطة (Google Maps):</label>
                                    <input type="text" class="hs-input hs-pos-map-url" value="${this.escape(item.map_url || '')}" placeholder="https://maps.app.goo.gl/..." />
                                </div>
                                <div>
                                    <label style="font-size:11px; font-weight:700; color:#475569;">ملاحظات / الفئات المتوفرة:</label>
                                    <input type="text" class="hs-input hs-pos-notes" value="${this.escape(item.notes || 'متوفر جميع فئات الكروت')}" placeholder="متوفر جميع فئات الكروت والشحن الفوري" />
                                </div>
                            </div>

                            <div style="display:flex; gap:16px; font-size:12px; font-weight:700; color:#334155; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-pos-show-login" ${item.show_on_login !== false ? 'checked' : ''} />
                                    عرض قبل الدخول (Login)
                                </label>
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-pos-show-status" ${item.show_on_status !== false ? 'checked' : ''} />
                                    عرض بعد الدخول (Status)
                                </label>
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                    <input type="checkbox" class="hs-pos-enabled-item" ${item.enabled !== false ? 'checked' : ''} />
                                    تفعيل هذه النقطة
                                </label>
                            </div>
                        </div>
                        `).join('')}
                    </div>

                    <button type="button" class="mt-btn" style="width:100%; background:#f0fdf4; color:#15803d; font-weight:800; border:1px dashed #10b981; padding:10px; border-radius:8px; cursor:pointer;" onclick="App.addHotspotPosItem()">
                        ➕ إضافة مركز / نقطة بيع وتوزيع جديدة
                    </button>
                </div>
                `;

            case 'options':
                return `
                <div>
                    <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:14px;">⚙️ خيارات ومميزات الصفحات والتحديثات</h4>
                    
                    <div style="font-weight:800; font-size:13px; color:#0284c7; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                        1. خيارات صفحة قبل الدخول (Login Page)
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-remember-cards" ${opt.remember_cards !== false ? 'checked' : ''} />
                            💳 حفظ آخر 3 كروت سابقة على جهاز المشترك لسهولة التبديل
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-auto-login" ${opt.auto_login !== false ? 'checked' : ''} />
                            ⚡ تسجيل الدخول التلقائي بالكرت المحفوظ عبر الكوكيز
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-packages" ${opt.show_packages !== false ? 'checked' : ''} />
                            إظهار قسم باقات وعروض الشبكة
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-shortcuts" ${opt.show_shortcuts !== false ? 'checked' : ''} />
                            إظهار روابط الاستراحات والبث المباشر
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-contacts" ${opt.show_contacts !== false ? 'checked' : ''} />
                            إظهار أرقام التواصل والدعم الفني
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-opt-pos" ${opt.show_pos !== false ? 'checked' : ''} />
                            إظهار أماكن تواجد ونقاط بيع الكروت
                        </label>
                    </div>

                    <div style="font-weight:800; font-size:13px; color:#0284c7; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                        2. خيارات صفحة بعد الدخول (Status Page — بوابة الكروت)
                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-quota" ${stOpt.show_quota_circle !== false ? 'checked' : ''} />
                            عرض دائرة الرصيد المضيئة والنسبة المئوية
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-device-limit" ${stOpt.show_device_limit !== false ? 'checked' : ''} />
                            بطاقة تحديد عدد الأجهزة المتصلة المسموح بها
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-mac-lock" ${stOpt.show_mac_lock !== false ? 'checked' : ''} />
                            بطاقة تثبيت الجهاز عند أول دخول (MAC Lock)
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-speed" ${stOpt.show_speed_selector !== false ? 'checked' : ''} />
                            بطاقة التحكم بالسرعات واختيار سرعة الكرت
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-devices" ${stOpt.show_connected_devices !== false ? 'checked' : ''} />
                            بطاقة الأجهزة المتصلة حالياً مع إمكانية الفصل
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-shortcuts" ${stOpt.show_shortcuts !== false ? 'checked' : ''} />
                            إظهار روابط الاستراحات والبث المباشر
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-pos" ${stOpt.show_pos !== false ? 'checked' : ''} />
                            إظهار قسم مراكز ونقاط بيع وتوزيع الكروت
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
                            <input type="checkbox" id="hs-st-logout" ${stOpt.allow_logout !== false ? 'checked' : ''} />
                            زر تسجيل الخروج وفصل الاتصال
                        </label>
                    </div>

                    <div style="font-weight:800; font-size:13px; color:#0284c7; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                        3. خيارات إيقاف وتشغيل التحديثات التلقائية (Auto-Update)
                    </div>

                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:12px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; cursor:pointer;">
                            <input type="checkbox" id="hs-st-auto-refresh" ${stOpt.auto_refresh_enabled !== false ? 'checked' : ''} />
                            تفعيل التحديث التلقائي للرصيد والسرعة في الخلفية
                        </label>
                        
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <label style="font-size:12px; font-weight:700; color:#334155;">الفترة الزمنية بين كل تحديث:</label>
                            <select id="hs-st-refresh-interval" class="hs-input" style="width:160px; padding:6px 10px;">
                                <option value="10" ${stOpt.auto_refresh_interval == 10 ? 'selected' : ''}>كل 10 ثوانٍ</option>
                                <option value="15" ${(!stOpt.auto_refresh_interval || stOpt.auto_refresh_interval == 15) ? 'selected' : ''}>كل 15 ثانية (مستحسن)</option>
                                <option value="30" ${stOpt.auto_refresh_interval == 30 ? 'selected' : ''}>كل 30 ثانية</option>
                                <option value="60" ${stOpt.auto_refresh_interval == 60 ? 'selected' : ''}>كل دقيقة</option>
                            </select>
                        </div>

                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:#64748b; cursor:pointer;">
                            <input type="checkbox" id="hs-st-user-toggle" ${stOpt.allow_user_toggle_refresh !== false ? 'checked' : ''} />
                            إتاحة زر في صفحة الكرت للمشترك لإيقاف/تشغيل التحديث بنفسه
                        </label>
                    </div>
                </div>
                `;

            case 'routers':
                const routers = this.hotspotStudioData?.routers || [];
                const netId = this.hotspotStudioData?.network_id || 1;
                const portalUrl = `${window.location.protocol}//${window.location.host}/hotspot-portal.php`;
                const settingsApiUrl = `${window.location.protocol}//${window.location.host}/hotspot-settings-api.php?network_id=${netId}`;

                return `
                <div>
                    <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:14px;">📡 راوترات الشبكة وأنماط الربط والتثبيت</h4>
                    
                    <!-- Mode Selection Overview Cards -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-bottom:20px;">
                        <div style="background:#f0fdf4; border:1.5px solid #10b981; border-radius:12px; padding:14px;">
                            <div style="font-weight:800; font-size:13px; color:#15803d; margin-bottom:4px;">1️⃣ قالب محلي مع مزامنة API سريعة</div>
                            <p style="font-size:11px; color:#334155; line-height:1.5; margin-bottom:10px;">
                                يتم رفع ملفات القالب داخل الراوتر، وتحديث الإعدادات والباقات في ثانية واحدة عبر API / FTP أو عبر جدولة الميكروتك.
                            </p>
                            <button type="button" class="mt-btn" style="background:#10b981; color:#fff; font-size:11px; font-weight:800; padding:5px 10px; border-radius:6px; border:none; cursor:pointer;" onclick="App.showRouterSyncScriptModal()">
                                📋 نسخ كود جدولة المزامنة
                            </button>
                        </div>

                        <div style="background:#eff6ff; border:1.5px solid #3b82f6; border-radius:12px; padding:14px;">
                            <div style="font-weight:800; font-size:13px; color:#1d4ed8; margin-bottom:4px;">2️⃣ بوابة مركزية موحدة (Captive Portal)</div>
                            <p style="font-size:11px; color:#334155; line-height:1.5; margin-bottom:10px;">
                                الراوتر يحوّل المشتركين مباشرة لصفحة السيرفر الخارجية الحية. أي تعديل في الباقات أو الأسعار يظهر فوراً بدون رفع ملفات.
                            </p>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <button type="button" class="mt-btn" style="background:#3b82f6; color:#fff; font-size:11px; font-weight:800; padding:5px 10px; border-radius:6px; border:none; cursor:pointer;" onclick="App.showWalledGardenModal()">
                                    🛡️ أوامر Walled Garden
                                </button>
                                <button type="button" class="mt-btn" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:800; padding:5px 10px; border-radius:6px; border:none; cursor:pointer;" onclick="App.downloadHotspotZipBundle(${netId}, true)">
                                    📦 تحميل ZIP التوجيه
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Direct Endpoints & Links -->
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px; margin-bottom:18px;">
                        <div style="font-weight:800; font-size:12px; color:#0f172a; margin-bottom:6px;">🔗 الروابط المباشرة للسيرفر:</div>
                        <div style="font-size:11px; color:#475569; display:flex; flex-direction:column; gap:4px;">
                            <div>🌐 <b>رابط البوابة الخارجية (Captive Portal):</b> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:11px;">${portalUrl}</code></div>
                            <div>⚡ <b>رابط مزامنة الإعدادات (JSON API):</b> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:11px;">${settingsApiUrl}</code></div>
                        </div>
                    </div>

                    <!-- Router List Actions -->
                    <h5 style="font-size:13px; font-weight:800; color:#0f172a; margin-bottom:10px;">أجهزة الراوتر المتصلة (${routers.length}):</h5>
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${routers.map(r => `
                        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; padding:14px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                                <div>
                                    <div style="font-weight:800; font-size:14px; color:#0f172a;">${this.escape(r.shortname || 'راوتر ميكروتك')}</div>
                                    <div style="font-size:11px; color:#64748b; margin-top:2px;">
                                        IP: <code>${r.nasname}</code> | مجلد: <code>${r.hotspot_dir || 'hotspot'}</code> | FTP: <code>${r.ftp_port || 21}</code> | API: <code>${r.api_port || 8728}</code>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Action Buttons Row for each router -->
                            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                <button type="button" class="mt-btn" style="background:#10b981; color:#fff; font-weight:800; padding:6px 12px; font-size:12px; border-radius:6px; border:none; cursor:pointer;" onclick="App.deployHotspotToSingleRouter(${r.id})" title="رفع القالب الكامل ليعمل بدون إنترنت محلياً">
                                    🚀 تثبيت القالب الكامل
                                </button>
                                
                                <button type="button" class="mt-btn" style="background:#0284c7; color:#fff; font-weight:800; padding:6px 12px; font-size:12px; border-radius:6px; border:none; cursor:pointer;" onclick="App.fastSyncRouterHotspotSettings(${r.id})" title="تحديث ملف الإعدادات والباقات فقط في أقل من ثانية">
                                    ⚡ تحديث الإعدادات فقط (سريع)
                                </button>

                                <button type="button" class="mt-btn" style="background:#4f46e5; color:#fff; font-weight:800; padding:6px 12px; font-size:12px; border-radius:6px; border:none; cursor:pointer;" onclick="App.deployHotspotRedirectTemplate(${r.id})" title="تثبيت قالب تحويل فوري للبوابة المركزية الخارجية">
                                    🌐 تثبيت تحويل البوابة المركزية
                                </button>
                            </div>
                        </div>
                        `).join('')}

                        ${routers.length === 0 ? `
                        <div style="text-align:center; padding:30px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; color:#64748b; font-size:13px;">
                            لا توجد أجهزة راوتر مسجلة في هذه الشبكة حالياً. يمكنك إضافة راوتر من قسم "الراوترات والأجهزة".
                        </div>
                        ` : ''}
                    </div>
                </div>
                `;
        }
        return '';
    },

    /**
     * Add custom package item
     */
    addHotspotPackageItem() {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings) return;
        this.hotspotStudioData.settings.packages_config = this.hotspotStudioData.settings.packages_config || {};
        const pCfg = this.hotspotStudioData.settings.packages_config;
        pCfg.package_items = pCfg.package_items || [];
        pCfg.package_items.push({
            id: 'custom_' + Date.now(),
            name: 'باقة مميزة جديدة',
            price: 1000,
            quota_label: '10 GB',
            validity: '30 يوم',
            rate_limit: 'أقصى سرعة',
            badge: 'عرض جديد 🎉',
            badge_color: '',
            description: 'باقة ترويجية مخصصة للتحميل والتصفح عالي السرعة',
            custom_order_msg: '',
            enabled: true,
            featured: false,
            is_custom: true
        });
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Remove custom package item
     */
    removeHotspotPackageItem(idx) {
        this.collectHotspotStudioInputs();
        const pCfg = this.hotspotStudioData?.settings?.packages_config;
        if (!pCfg?.package_items) return;
        pCfg.package_items.splice(idx, 1);
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Move package item up or down
     */
    moveHotspotPackageItem(idx, direction) {
        this.collectHotspotStudioInputs();
        const pCfg = this.hotspotStudioData?.settings?.packages_config;
        if (!pCfg?.package_items) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= pCfg.package_items.length) return;
        const temp = pCfg.package_items[idx];
        pCfg.package_items[idx] = pCfg.package_items[targetIdx];
        pCfg.package_items[targetIdx] = temp;
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Set badge preset for a package
     */
    setHotspotPackageBadgePreset(idx, badge) {
        const card = document.querySelector(`.hs-pkg-item-card[data-idx="${idx}"]`);
        if (card) {
            const badgeInput = card.querySelector('.hs-pkg-item-badge');
            if (badgeInput) {
                badgeInput.value = badge;
                this.collectHotspotStudioInputs();
            }
        }
    },

    /**
     * Insert tag into WhatsApp template input
     */
    insertPkgWaTag(tag) {
        const input = document.getElementById('hs-pkg-wa-template');
        if (!input) return;
        const start = input.selectionStart || input.value.length;
        const end = input.selectionEnd || input.value.length;
        input.value = input.value.substring(0, start) + tag + input.value.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + tag.length;
    },

    /**
     * Resync packages from system profiles
     */
    resyncHotspotPackagesFromDb() {
        const dbPackages = this.hotspotStudioData?.db_packages || [];
        if (confirm('هل ترغب بإعادة استيراد كافة بروفايلات النظام وضبط الباقات وفقاً للأسعار والبيانات الأساسية؟')) {
            const pCfg = this.hotspotStudioData?.settings?.packages_config;
            if (pCfg) {
                pCfg.package_items = dbPackages.map(dp => {
                    const isFree = (dp.package_type === 'free') || (parseFloat(dp.price || 0) === 0);
                    return {
                        id: dp.id,
                        name: dp.name,
                        package_type: dp.package_type || (isFree ? 'free' : 'paid'),
                        price: dp.price,
                        validity: dp.validity,
                        rate_limit: dp.rate_limit,
                        quota_label: dp.quota_label,
                        badge: dp.badge || (isFree ? 'مجاني 🎁' : ''),
                        description: '',
                        custom_order_msg: '',
                        enabled: true,
                        featured: false,
                        is_custom: false
                    };
                });
                const container = document.getElementById('hs-tab-content-container');
                if (container) container.innerHTML = this.renderHotspotTabContent();
                this.toast('تمت إعادة مزامنة الباقات من بروفايلات النظام بنجاح', 'success');
            }
        }
    },

    /**
     * Add new ad item to ads array
     */
    addHotspotAdItem() {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings?.ads) return;
        this.hotspotStudioData.settings.ads.items = this.hotspotStudioData.settings.ads.items || [];
        this.hotspotStudioData.settings.ads.items.push({
            id: Date.now(),
            title: 'عرض ترويجي مميز',
            desc: 'وصف العرض والخصومات وسرعات الإنترنت...',
            badge: 'عرض حصري',
            image_url: '',
            link_url: '',
            show_on_login: true,
            show_on_status: true,
            enabled: true
        });
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Remove ad item
     */
    removeHotspotAdItem(idx) {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings?.ads?.items) return;
        this.hotspotStudioData.settings.ads.items.splice(idx, 1);
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Add new shortcut item
     */
    addHotspotShortcutItem() {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings?.shortcuts) return;
        this.hotspotStudioData.settings.shortcuts.items = this.hotspotStudioData.settings.shortcuts.items || [];
        this.hotspotStudioData.settings.shortcuts.items.push({
            id: Date.now(),
            title: 'رابط خدمة جديد',
            desc: 'وصف الخدمة أو البث المباشر...',
            badge: 'مباشر',
            icon: '⚽',
            url: 'http://192.168.88.254/live',
            show_on_login: true,
            show_on_status: true,
            enabled: true
        });
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Remove shortcut item
     */
    removeHotspotShortcutItem(idx) {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings?.shortcuts?.items) return;
        this.hotspotStudioData.settings.shortcuts.items.splice(idx, 1);
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Add new POS store / agent item
     */
    addHotspotPosItem() {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData) this.hotspotStudioData = {};
        if (!this.hotspotStudioData.settings) this.hotspotStudioData.settings = {};
        this.hotspotStudioData.settings.pos_config = this.hotspotStudioData.settings.pos_config || {};
        this.hotspotStudioData.settings.pos_config.items = this.hotspotStudioData.settings.pos_config.items || [];
        this.hotspotStudioData.settings.pos_config.items.push({
            id: Date.now(),
            name: 'نقطة بيع جديدة',
            phone: '770000000',
            whatsapp: '770000000',
            address: 'الشارع العام',
            working_hours: '8:00 ص - 11:30 م',
            badge: 'نقطة معتمدة',
            map_url: '',
            notes: 'متوفر جميع فئات الكروت وباقات الإنترنت',
            show_on_login: true,
            show_on_status: true,
            enabled: true
        });
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Remove POS store / agent item
     */
    removeHotspotPosItem(idx) {
        this.collectHotspotStudioInputs();
        if (!this.hotspotStudioData?.settings?.pos_config?.items) return;
        this.hotspotStudioData.settings.pos_config.items.splice(idx, 1);
        const container = document.getElementById('hs-tab-content-container');
        if (container) container.innerHTML = this.renderHotspotTabContent();
    },

    /**
     * Collect all studio settings from the DOM inputs
     */
    /**
     * Apply a selected Theme Preset
     */
    applyHotspotThemePreset(presetId) {
        const preset = (this.hotspotThemePresets || []).find(p => p.id === presetId);
        if (!preset) return;

        if (!this.hotspotStudioData) this.hotspotStudioData = {};
        if (!this.hotspotStudioData.settings) this.hotspotStudioData.settings = {};

        this.hotspotStudioData.settings.theme = {
            ...(this.hotspotStudioData.settings.theme || {}),
            theme_preset: preset.id,
            primary_color: preset.primary_color,
            accent_color: preset.accent_color,
            bg_gradient_start: preset.bg_gradient_start,
            bg_gradient_end: preset.bg_gradient_end,
            card_bg: preset.card_bg,
            card_border: preset.card_border,
            text_color: preset.text_color,
            text_muted: preset.text_muted || '#94a3b8',
            border_radius: preset.border_radius || '16px'
        };

        const container = document.getElementById('hs-tab-content-container');
        if (container) {
            container.innerHTML = this.renderHotspotTabContent();
        }

        this.toast(`تم تطبيق ثيم "${preset.name}" بنجاح! جاري حفظ الإعدادات وتحديث المعاينة...`, 'success');

        // Automatically save settings and refresh preview
        this.saveHotspotStudioSettings();
    },

    /**
     * Collect all studio settings from the DOM inputs
     */
    collectHotspotStudioInputs() {
        if (!this.hotspotStudioData?.settings) return {};

        const s = this.hotspotStudioData.settings;

        // Theme
        s.theme = s.theme || {};
        const pPreset = document.getElementById('hs-active-theme-preset')?.value;
        if (pPreset) s.theme.theme_preset = pPreset;
        const pColor = document.getElementById('hs-primary-color-text')?.value?.trim();
        if (pColor) s.theme.primary_color = pColor;
        const aColor = document.getElementById('hs-accent-color-text')?.value?.trim();
        if (aColor) s.theme.accent_color = aColor;
        const bgStart = document.getElementById('hs-bg-start-text')?.value?.trim();
        if (bgStart) s.theme.bg_gradient_start = bgStart;
        const bgEnd = document.getElementById('hs-bg-end-text')?.value?.trim();
        if (bgEnd) s.theme.bg_gradient_end = bgEnd;
        const cardBg = document.getElementById('hs-card-bg-text')?.value?.trim();
        if (cardBg) s.theme.card_bg = cardBg;
        const cardBorder = document.getElementById('hs-card-border-text')?.value?.trim();
        if (cardBorder) s.theme.card_border = cardBorder;
        const txtColor = document.getElementById('hs-text-color-text')?.value?.trim();
        if (txtColor) s.theme.text_color = txtColor;
        const radius = document.getElementById('hs-radius')?.value;
        if (radius) s.theme.border_radius = radius;

    // Brand
        s.brand = s.brand || {};
        const bName = document.getElementById('hs-brand-name')?.value?.trim();
        if (bName !== undefined) s.brand.network_name = bName;
        const bSlogan = document.getElementById('hs-brand-slogan')?.value?.trim();
        if (bSlogan !== undefined) s.brand.slogan = bSlogan;
        const bWelcome = document.getElementById('hs-welcome-msg')?.value?.trim();
        if (bWelcome !== undefined) s.brand.welcome_message = bWelcome;
        const bApiUrl = document.getElementById('hs-server-api-url')?.value?.trim();
        if (bApiUrl !== undefined) s.brand.server_api_url = bApiUrl;
        const bLogo = document.getElementById('hs-logo-url')?.value?.trim();
        if (bLogo !== undefined) s.brand.logo_url = bLogo;
        const bIcon = document.getElementById('hs-logo-icon')?.value?.trim();
        if (bIcon !== undefined) s.brand.logo_icon = bIcon;
        const bFooter = document.getElementById('hs-footer-text')?.value?.trim();
        if (bFooter !== undefined) s.brand.footer_text = bFooter;

        // Contacts
        s.contacts = s.contacts || {};
        const cPhones = document.getElementById('hs-contact-phones')?.value?.trim();
        if (cPhones !== undefined) s.contacts.phones = cPhones.split(',').map(x => x.trim()).filter(Boolean);
        const cWa = document.getElementById('hs-contact-whatsapp')?.value?.trim();
        if (cWa !== undefined) s.contacts.whatsapp = cWa;
        const cWaMsg = document.getElementById('hs-wa-msg')?.value?.trim();
        if (cWaMsg !== undefined) s.contacts.whatsapp_message = cWaMsg;
        const cTg = document.getElementById('hs-contact-telegram')?.value?.trim();
        if (cTg !== undefined) s.contacts.telegram = cTg;
        const cPos = document.getElementById('hs-pos-locations')?.value?.trim();
        if (cPos !== undefined) s.contacts.pos_locations = cPos;

        // Packages config
        s.packages_config = s.packages_config || {};
        const pkgEn = document.getElementById('hs-pkg-enabled');
        if (pkgEn) s.packages_config.enabled = pkgEn.checked;
        const pkgTitle = document.getElementById('hs-pkg-title')?.value?.trim();
        if (pkgTitle !== undefined) s.packages_config.title = pkgTitle;
        const pkgSub = document.getElementById('hs-pkg-subtitle')?.value?.trim();
        if (pkgSub !== undefined) s.packages_config.subtitle = pkgSub;
        const pkgOrderBtnEn = document.getElementById('hs-pkg-show-order-btn');
        if (pkgOrderBtnEn) s.packages_config.show_order_btn = pkgOrderBtnEn.checked;
        const pkgOrderText = document.getElementById('hs-pkg-order-btn-text')?.value?.trim();
        if (pkgOrderText !== undefined) s.packages_config.order_btn_text = pkgOrderText;
        const pkgWaTemplate = document.getElementById('hs-pkg-wa-template')?.value?.trim();
        if (pkgWaTemplate !== undefined) s.packages_config.whatsapp_msg_template = pkgWaTemplate;

        // Collect package cards if currently in packages tab
        const pkgCards = document.querySelectorAll('.hs-pkg-item-card');
        if (pkgCards.length > 0) {
            const pkgItems = [];
            pkgCards.forEach((card, i) => {
                const id = card.getAttribute('data-id') || (i + 1);
                const isCustom = card.getAttribute('data-custom') === 'true';
                const price = parseFloat(card.querySelector('.hs-pkg-item-price')?.value) || 0;
                const pkgType = card.getAttribute('data-package-type') || (price === 0 ? 'free' : 'paid');
                pkgItems.push({
                    id: isNaN(id) ? id : Number(id),
                    name: card.querySelector('.hs-pkg-item-name')?.value?.trim() || `باقة #${i+1}`,
                    package_type: pkgType,
                    price: price,
                    badge: card.querySelector('.hs-pkg-item-badge')?.value?.trim() || (pkgType === 'free' ? 'مجاني 🎁' : ''),
                    quota_label: card.querySelector('.hs-pkg-item-quota')?.value?.trim() || '',
                    validity: card.querySelector('.hs-pkg-item-validity')?.value?.trim() || '',
                    rate_limit: card.querySelector('.hs-pkg-item-speed')?.value?.trim() || '',
                    description: card.querySelector('.hs-pkg-item-desc')?.value?.trim() || '',
                    custom_order_msg: card.querySelector('.hs-pkg-item-custom-msg')?.value?.trim() || '',
                    enabled: card.querySelector('.hs-pkg-item-enabled')?.checked !== false,
                    featured: card.querySelector('.hs-pkg-item-featured')?.checked === true,
                    is_custom: isCustom
                });
            });
            s.packages_config.package_items = pkgItems;
        }

        // Ads
        s.ads = s.ads || {};
        const adsEn = document.getElementById('hs-ads-enabled');
        if (adsEn) s.ads.enabled = adsEn.checked;
        const adsSpeed = document.getElementById('hs-ads-speed')?.value;
        if (adsSpeed) s.ads.rotation_speed = parseInt(adsSpeed) || 4;
        
        // Collect ad cards if currently in ads tab
        const adCards = document.querySelectorAll('.hs-ad-card');
        if (adCards.length > 0) {
            const items = [];
            adCards.forEach((card, i) => {
                items.push({
                    id: i + 1,
                    title: card.querySelector('.hs-ad-title')?.value?.trim() || '',
                    badge: card.querySelector('.hs-ad-badge')?.value?.trim() || '',
                    desc: card.querySelector('.hs-ad-desc')?.value?.trim() || '',
                    image_url: card.querySelector('.hs-ad-img')?.value?.trim() || '',
                    link_url: card.querySelector('.hs-ad-link')?.value?.trim() || '',
                    show_on_login: card.querySelector('.hs-ad-show-login')?.checked !== false,
                    show_on_status: card.querySelector('.hs-ad-show-status')?.checked !== false,
                    enabled: true
                });
            });
            s.ads.items = items;
        }

        // Shortcuts
        s.shortcuts = s.shortcuts || {};
        const scEn = document.getElementById('hs-sc-enabled');
        if (scEn) s.shortcuts.enabled = scEn.checked;
        const scTitle = document.getElementById('hs-sc-title')?.value?.trim();
        if (scTitle !== undefined) s.shortcuts.title = scTitle;
        const scSub = document.getElementById('hs-sc-subtitle')?.value?.trim();
        if (scSub !== undefined) s.shortcuts.subtitle = scSub;

        // Collect shortcut cards
        const scCards = document.querySelectorAll('.hs-sc-card');
        if (scCards.length > 0) {
            const scItems = [];
            scCards.forEach((card, i) => {
                scItems.push({
                    id: i + 1,
                    icon: card.querySelector('.hs-sc-icon')?.value?.trim() || '🔗',
                    title: card.querySelector('.hs-sc-title-field')?.value?.trim() || '',
                    badge: card.querySelector('.hs-sc-badge')?.value?.trim() || '',
                    desc: card.querySelector('.hs-sc-desc')?.value?.trim() || '',
                    url: card.querySelector('.hs-sc-url')?.value?.trim() || '',
                    show_on_login: card.querySelector('.hs-sc-show-login')?.checked !== false,
                    show_on_status: card.querySelector('.hs-sc-show-status')?.checked !== false,
                    enabled: true
                });
            });
            s.shortcuts.items = scItems;
        }

        // POS Config
        s.pos_config = s.pos_config || {};
        const posEn = document.getElementById('hs-pos-enabled');
        if (posEn) s.pos_config.enabled = posEn.checked;
        const posAutoSync = document.getElementById('hs-pos-auto-sync');
        if (posAutoSync) s.pos_config.auto_sync_admins = posAutoSync.checked;
        const posTitle = document.getElementById('hs-pos-title')?.value?.trim();
        if (posTitle !== undefined) s.pos_config.title = posTitle;
        const posSub = document.getElementById('hs-pos-subtitle')?.value?.trim();
        if (posSub !== undefined) s.pos_config.subtitle = posSub;
        const posSearch = document.getElementById('hs-pos-search-placeholder')?.value?.trim();
        if (posSearch !== undefined) s.pos_config.search_placeholder = posSearch;

        // Collect POS cards if present in DOM
        const posCards = document.querySelectorAll('.hs-pos-card');
        if (posCards.length > 0) {
            const posItems = [];
            posCards.forEach((card, i) => {
                posItems.push({
                    id: i + 1,
                    name: card.querySelector('.hs-pos-name')?.value?.trim() || `نقطة بيع #${i+1}`,
                    phone: card.querySelector('.hs-pos-phone')?.value?.trim() || '',
                    whatsapp: card.querySelector('.hs-pos-whatsapp')?.value?.trim() || '',
                    address: card.querySelector('.hs-pos-address')?.value?.trim() || '',
                    working_hours: card.querySelector('.hs-pos-hours')?.value?.trim() || '8:00 ص - 11:30 م',
                    badge: card.querySelector('.hs-pos-badge')?.value?.trim() || 'نقطة معتمدة',
                    map_url: card.querySelector('.hs-pos-map-url')?.value?.trim() || '',
                    notes: card.querySelector('.hs-pos-notes')?.value?.trim() || '',
                    show_on_login: card.querySelector('.hs-pos-show-login')?.checked !== false,
                    show_on_status: card.querySelector('.hs-pos-show-status')?.checked !== false,
                    enabled: card.querySelector('.hs-pos-enabled-item')?.checked !== false
                });
            });
            s.pos_config.items = posItems;
        }

        // Options
        s.login_options = s.login_options || {};
        if (document.getElementById('hs-opt-remember-cards')) s.login_options.remember_cards = document.getElementById('hs-opt-remember-cards').checked;
        if (document.getElementById('hs-opt-auto-login')) s.login_options.auto_login = document.getElementById('hs-opt-auto-login').checked;
        if (document.getElementById('hs-opt-packages')) s.login_options.show_packages = document.getElementById('hs-opt-packages').checked;
        if (document.getElementById('hs-opt-shortcuts')) s.login_options.show_shortcuts = document.getElementById('hs-opt-shortcuts').checked;
        if (document.getElementById('hs-opt-contacts')) s.login_options.show_contacts = document.getElementById('hs-opt-contacts').checked;
        if (document.getElementById('hs-opt-pos')) s.login_options.show_pos = document.getElementById('hs-opt-pos').checked;

        s.status_options = s.status_options || {};
        if (document.getElementById('hs-st-quota')) s.status_options.show_quota_circle = document.getElementById('hs-st-quota').checked;
        if (document.getElementById('hs-st-device-limit')) s.status_options.show_device_limit = document.getElementById('hs-st-device-limit').checked;
        if (document.getElementById('hs-st-mac-lock')) s.status_options.show_mac_lock = document.getElementById('hs-st-mac-lock').checked;
        if (document.getElementById('hs-st-speed')) s.status_options.show_speed_selector = document.getElementById('hs-st-speed').checked;
        if (document.getElementById('hs-st-devices')) s.status_options.show_connected_devices = document.getElementById('hs-st-devices').checked;
        if (document.getElementById('hs-st-shortcuts')) s.status_options.show_shortcuts = document.getElementById('hs-st-shortcuts').checked;
        if (document.getElementById('hs-st-pos')) s.status_options.show_pos = document.getElementById('hs-st-pos').checked;
        if (document.getElementById('hs-st-logout')) s.status_options.allow_logout = document.getElementById('hs-st-logout').checked;
        
        if (document.getElementById('hs-st-auto-refresh')) s.status_options.auto_refresh_enabled = document.getElementById('hs-st-auto-refresh').checked;
        if (document.getElementById('hs-st-refresh-interval')) s.status_options.auto_refresh_interval = parseInt(document.getElementById('hs-st-refresh-interval').value) || 15;
        if (document.getElementById('hs-st-user-toggle')) s.status_options.allow_user_toggle_refresh = document.getElementById('hs-st-user-toggle').checked;

        return s;
    },

    /**
     * Save studio settings to backend
     */
    async saveHotspotStudioSettings() {
        const settings = this.collectHotspotStudioInputs();
        const activeNetId = this.hotspotStudioData?.network_id || (this.currentNetworkId ? this.currentNetworkId() : 0);

        this.toast('جاري حفظ إعدادات الهوتسبوت وبوابة الكروت...', 'info');
        try {
            const res = await this.api('save_hotspot_studio_data', {
                network_id: activeNetId,
                ...settings
            }, 'POST');

            if (res && res.success) {
                this.toast('تم حفظ إعدادات وتخصيصات الهوتسبوت بنجاح!', 'success');
                this.refreshHotspotPreviewFrame();
            } else {
                this.toast(res?.error || 'فشل حفظ الإعدادات', 'danger');
            }
        } catch (e) {
            console.error('saveHotspotStudioSettings error:', e);
            this.toast('حدث خطأ أثناء حفظ الإعدادات', 'danger');
        }
    },

    /**
     * Deploy hotspot to the selected router from top toolbar
     */
    async deployHotspotFromStudio() {
        const routerSelect = document.getElementById('hs-target-router');
        const nasId = Number(routerSelect?.value || 0);
        if (!nasId) {
            this.toast('يرجى اختيار راوتر لتثبيت القالب فيه', 'warning');
            return;
        }
        await this.deployHotspotToSingleRouter(nasId);
    },

    /**
     * Deploy hotspot to a single router
     */
    async deployHotspotToSingleRouter(nasId) {
        // Save latest settings first
        await this.saveHotspotStudioSettings();

        const activeNetId = this.hotspotStudioData?.network_id || (this.currentNetworkId ? this.currentNetworkId() : 0);
        this.toast('جاري رفع وتثبيت القالب في ذاكرة الراوتر...', 'info');

        try {
            const res = await this.api('deploy_hotspot_to_router', {
                nas_id: nasId,
                network_id: activeNetId
            }, 'POST');

            if (res && res.success) {
                this.toast(res.message || 'تم تثبيت صفحة الهوتسبوت في الراوتر بنجاح!', 'success');
            } else {
                this.toast(res?.error || 'فشل تثبيت القالب في الراوتر', 'danger');
            }
        } catch (e) {
            console.error('deployHotspotToSingleRouter error:', e);
            this.toast('حدث خطأ أثناء رفع القالب للراوتر', 'danger');
        }
    },

    /**
     * Fast Push: Deploy ONLY setting-api.html to a router via API / FTP (Takes < 1s)
     */
    async fastSyncRouterHotspotSettings(nasId) {
        await this.saveHotspotStudioSettings();
        this.toast('جاري تحديث إعدادات وهوية وباقات الشبكة في الراوتر...', 'info');

        try {
            const res = await this.api('fast_sync_router_hotspot_settings', { router_id: nasId }, 'POST');
            if (res && res.success) {
                this.toast(res.message || 'تم تحديث ملف الإعدادات في الراوتر بنجاح!', 'success');
            } else {
                this.toast(res?.error || 'فشل تحديث الإعدادات في الراوتر', 'danger');
            }
        } catch (e) {
            console.error('fastSyncRouterHotspotSettings error:', e);
            this.toast('حدث خطأ أثناء مزامنة الإعدادات', 'danger');
        }
    },

    /**
     * Deploy External Captive Portal Redirect Template to a router
     */
    async deployHotspotRedirectTemplate(nasId) {
        await this.saveHotspotStudioSettings();
        const portalUrl = `${window.location.protocol}//${window.location.host}/hotspot-portal.php`;
        const activeNetId = this.hotspotStudioData?.network_id || (this.currentNetworkId ? this.currentNetworkId() : 0);

        this.toast('جاري تثبيت قالب تحويل البوابة المركزية بالراوتر...', 'info');
        try {
            const res = await this.api('deploy_hotspot_template', {
                router_id: nasId,
                network_id: activeNetId,
                is_external_redirect: true,
                server_portal_url: portalUrl
            }, 'POST');

            if (res && res.success) {
                this.toast(res.message || 'تم تثبيت قالب التحويل للبوابة المركزية بنجاح!', 'success');
            } else {
                this.toast(res?.error || 'فشل تثبيت قالب التحويل', 'danger');
            }
        } catch (e) {
            console.error('deployHotspotRedirectTemplate error:', e);
            this.toast('حدث خطأ أثناء تثبيت قالب التحويل', 'danger');
        }
    },

    /**
     * Show Walled Garden Script Modal
     */
    async showWalledGardenModal() {
        this.toast('جاري توليد أوامر Walled Garden للراوتر...', 'info');
        try {
            const res = await this.api('get_hotspot_walled_garden_script', {
                host: window.location.hostname,
                ip: window.location.hostname
            });

            if (!res || !res.success) {
                this.toast('تعذر توليد أوامر Walled Garden', 'danger');
                return;
            }

            const script = res.script;
            this.showScriptModal(
                '🛡️ أوامر Walled Garden للسماح بالبوابة المركزية',
                'انسخ هذه الأوامر وألصقها في نافذة Terminal الخاصة براوتر الميكروتك للسماح للمشتركين بفتح صفحة السيرفر قبل تسجيل الدخول:',
                script
            );
        } catch (e) {
            console.error('showWalledGardenModal error:', e);
            this.toast('حدث خطأ أثناء توليد السكربت', 'danger');
        }
    },

    /**
     * Show Router Sync Scheduler Script Modal
     */
    async showRouterSyncScriptModal() {
        const activeNetId = this.hotspotStudioData?.network_id || (this.currentNetworkId ? this.currentNetworkId() : 1);
        this.toast('جاري توليد كود جدولة المزامنة التلقائية للراوتر...', 'info');

        try {
            const res = await this.api('get_hotspot_sync_script', {
                network_id: activeNetId,
                host: window.location.host,
                hotspot_dir: 'hotspot'
            });

            if (!res || !res.success) {
                this.toast('تعذر توليد كود الجدولة', 'danger');
                return;
            }

            const script = res.script;
            this.showScriptModal(
                '📋 كود جدولة مزامنة الإعدادات تلقائياً في MikroTik',
                'انسخ هذا السكربت وألصقه في Terminal الراوتر ليقوم الراوتر بتحديث الباقات والإعلانات وهوية الشبكة تلقائياً كل 10 دقائق:',
                script
            );
        } catch (e) {
            console.error('showRouterSyncScriptModal error:', e);
            this.toast('حدث خطأ أثناء توليد السكربت', 'danger');
        }
    },

    /**
     * Reusable Script Modal with 1-Click Copy
     */
    showScriptModal(title, description, scriptText) {
        const modalId = 'hs-script-modal';
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; font-family:Cairo,sans-serif; direction:rtl;';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
        <div style="background:#ffffff; border-radius:16px; max-width:600px; width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px rgba(0,0,0,0.25); overflow:hidden;">
            <div style="padding:16px 20px; background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:800; font-size:15px;">${this.escape(title)}</div>
                <button type="button" style="background:transparent; border:none; color:#94a3b8; font-size:20px; cursor:pointer;" onclick="document.getElementById('${modalId}').style.display='none'">✕</button>
            </div>
            <div style="padding:20px; overflow-y:auto;">
                <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:14px;">${this.escape(description)}</p>
                <div style="position:relative;">
                    <textarea id="hs-script-textarea" readonly style="width:100%; height:180px; background:#0b1120; color:#38bdf8; font-family:monospace; font-size:12px; border-radius:10px; padding:12px; border:1px solid #1e293b; direction:ltr; text-align:left; resize:none;">${this.escape(scriptText)}</textarea>
                </div>
            </div>
            <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="mt-btn" style="background:#10b981; color:#fff; font-weight:800; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px;" onclick="App.copyScriptFromModal()">
                    📋 نسخ الكود للحافظة
                </button>
                <button type="button" class="mt-btn" style="background:#f1f5f9; color:#475569; padding:8px 14px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; font-size:13px;" onclick="document.getElementById('${modalId}').style.display='none'">
                    إغلاق
                </button>
            </div>
        </div>
        `;
        modal.style.display = 'flex';
    },

    /**
     * Copy script from modal textarea
     */
    copyScriptFromModal() {
        const area = document.getElementById('hs-script-textarea');
        if (!area) return;
        area.select();
        navigator.clipboard.writeText(area.value).then(() => {
            this.toast('تم نسخ الأوامر بنجاح! الصقها في Terminal الراوتر.', 'success');
        }).catch(() => {
            this.toast('تم تحديد النص، يرجى النسخ يدوياً (Ctrl+C)', 'info');
        });
    },

    /**
     * Download hotspot ZIP bundle
     */
    downloadHotspotZipBundle(networkId, isRedirect = false) {
        const redirectParam = isRedirect ? '&is_external_redirect=1' : '';
        window.location.href = `api.php?action=download_hotspot_bundle&network_id=${networkId}${redirectParam}`;
    },

    /**
     * Open live preview in a new window
     */
    openHotspotLiveWindow(networkId) {
        window.open(`api.php?action=preview_hotspot_page&network_id=${networkId}&type=${this.hotspotPreviewPage}`, '_blank');
    }
});


        App.uploadHotspotImage = async function(input, targetId, category) {
        const file = input?.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            this.toast('حجم الصورة يجب ألا يتجاوز 5MB', 'warning');
            input.value = '';
            return;
        }

        const isLogo = (category === 'hotspot-logo');
        const targetW = isLogo ? 350 : 800;
        const targetH = isLogo ? 350 : 450;

        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('category', category || 'hotspot-image');
        fd.append('width', String(targetW));
        fd.append('height', String(targetH));

        const previous = targetId
            ? document.getElementById(targetId)?.value
            : input.closest('.hs-ad-card')?.querySelector('.hs-ad-img')?.value;
        const previousId = previous?.match(/\/uploads\/([a-f0-9]{32})$/)?.[1];
        if (previousId) fd.append('replace_id', previousId);

        const headers = {
            'X-SAM-Request': 'XMLHttpRequest',
            'X-SAM-Network-ID': String(this.activeNetworkId || 0)
        };
        const token = localStorage.getItem('sam_access_token');
        if (token) headers['Authorization'] = 'Bearer ' + token;

        try {
            const r = await fetch('api/v1/index.php/uploads/images', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin',
                headers: headers
            });
            const data = await r.json();
            const uploadedUrl = data?.data?.url || data?.url;
            if (!uploadedUrl) {
                const errMsg = (typeof data?.error === 'object' && data.error?.message) 
                    ? data.error.message 
                    : (typeof data?.error === 'string' ? data.error : 'فشل رفع وحفظ الصورة');
                throw new Error(errMsg);
            }

            if (targetId) {
                const el = document.getElementById(targetId);
                if (el) {
                    el.value = uploadedUrl;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } else {
                const card = input.closest('.hs-ad-card');
                const el = card?.querySelector('.hs-ad-img');
                if (el) {
                    el.value = uploadedUrl;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            this.toast('✓ تم رفع الصورة وتحجيمها بنجاح وحذف السابقة تلقائياً', 'success');
            if (typeof this.refreshHotspotPreviewFrame === 'function') {
                this.refreshHotspotPreviewFrame();
            }
        } catch(e) {
            this.toast(e.message || 'فشل رفع الصورة', 'danger');
        }
    };

