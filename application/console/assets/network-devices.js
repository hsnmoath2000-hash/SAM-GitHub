(() => {
    'use strict';

    const elements = {
        body: document.getElementById('devicesBody'),
        explainer: document.getElementById('viewExplainer'),
        head: document.getElementById('devicesHead'),
        loading: document.getElementById('loadingState'),
        tableLoading: document.getElementById('tableLoading'),
        empty: document.getElementById('tableEmpty'),
        menuButton: document.getElementById('menuButton'),
        networkSelect: document.getElementById('networkSelect'),
        next: document.getElementById('nextPage'),
        notice: document.getElementById('pageNotice'),
        pageStatus: document.getElementById('pageStatus'),
        panel: document.getElementById('devicesPanel'),
        previous: document.getElementById('previousPage'),
        refresh: document.getElementById('refreshButton'),
        search: document.getElementById('searchInput'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        tabs: Array.from(document.querySelectorAll('.member-tab')),
        updatedAt: document.getElementById('updatedAt'),
        workspace: document.getElementById('devicesWorkspace'),
    };

    const state = { view: 'routers', page: 1, total: 0, networkId: '', requestId: 0 };
    const numberFormat = new Intl.NumberFormat('ar-YE');
    const labels = {
        nodeTypes: { main_node: 'نقطة رئيسية', sub_node: 'نقطة فرعية', regular: 'عادية' },
        categories: { routers: 'راوتر', servers: 'خادم', antennas_dishes: 'هوائي/طبق', solar_batteries: 'طاقة شمسية', cables_fiber: 'كابلات/ألياف', towers: 'برج', vehicles: 'مركبة', other: 'أخرى' },
        statuses: { in_service: 'في الخدمة', maintenance: 'صيانة', in_stock: 'في المخزون', damaged: 'متضرر', retired: 'خارج الخدمة', up: 'متصل', online: 'متصل', down: 'غير متصل', offline: 'غير متصل', success: 'سليم', failed: 'فشل الفحص' },
    };
    const descriptions = {
        routers: 'قائمة أجهزة NAS المسجلة وعنوانها ونوعها وآخر مزامنة مع النظام. حداثة المزامنة لا تعني أن الجهاز متصل الآن.',
        nodes: 'نقاط الشبكة المعرّفة في مخطط التوزيع، مع الراوتر والمنفذ والموقع والمسؤول المرتبط.',
        assets: 'الأجهزة والأصول المسجلة وحالتها وآخر ظهور أو فحص متاح.',
    };

    function showNotice(message) {
        elements.notice.textContent = message;
        elements.notice.classList.add('notice-error');
        elements.notice.hidden = false;
    }

    function cell(text, className = '') {
        const node = document.createElement('td');
        if (className) node.className = className;
        node.textContent = text === null || text === undefined || text === '' ? '—' : String(text);
        return node;
    }

    function number(value) {
        return numberFormat.format(Number(value || 0));
    }

    function date(value) {
        if (!value || String(value).startsWith('0000-00-00')) return '—';
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime())
            ? '—'
            : new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
    }

    function translate(value, map) {
        return map[value] || value || '—';
    }

    function syncFreshness(value) {
        if (!value) return 'لا توجد مزامنة مسجلة';
        const timestamp = new Date(String(value).replace(' ', 'T')).getTime();
        if (Number.isNaN(timestamp)) return 'وقت المزامنة غير معروف';
        const minutes = Math.floor((Date.now() - timestamp) / 60000);
        return minutes >= 0 && minutes <= 15 ? 'مزامنة حديثة' : 'المزامنة قديمة';
    }

    function queryUrl() {
        const query = new URLSearchParams({
            view: state.view,
            page: String(state.page),
            search: elements.search.value.trim(),
        });
        if (state.networkId) query.set('network_id', state.networkId);
        return `api/network-devices.php?${query.toString()}`;
    }

    async function request(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
        const payload = await response.json();
        if (response.status === 401) {
            window.location.replace('../login.html');
            return null;
        }
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'تعذر تحميل القسم المطلوب.');
        }
        return payload;
    }

    function renderNetworks(networks, selectedId) {
        const options = networks.map((network) => {
            const option = document.createElement('option');
            option.value = String(network.id);
            option.textContent = `${network.name} (${network.code})`;
            option.selected = String(network.id) === String(selectedId);
            return option;
        });
        elements.networkSelect.replaceChildren(...options);
        elements.networkSelect.disabled = networks.length < 2;
    }

    function renderRow(record) {
        if (state.view === 'routers') {
            return [
                cell(record.shortname || record.nasname),
                cell(record.nasname, 'mono-cell'),
                cell(record.type),
                cell(record.server),
                cell(Number(record.is_active) === 1 ? 'مفعّل' : 'معطّل'),
                cell(syncFreshness(record.last_sync_time)),
                cell(date(record.last_sync_time)),
                cell(record.owner_name),
            ];
        }
        if (state.view === 'nodes') {
            return [
                cell(record.display_name || record.node_name),
                cell(translate(record.node_type, labels.nodeTypes)),
                cell(record.nas_ip, 'mono-cell'),
                cell(record.nas_port_id, 'mono-cell'),
                cell(record.parent_name),
                cell(record.location),
                cell(record.responsible_name),
                cell(Number(record.is_active) === 1 ? 'مفعّلة' : 'معطّلة'),
            ];
        }
        return [
            cell(record.asset_code, 'mono-cell'),
            cell(record.name),
            cell(translate(record.category, labels.categories)),
            cell(record.model || record.platform),
            cell(translate(record.status, labels.statuses)),
            cell(record.ip_address, 'mono-cell'),
            cell(record.mac_address, 'mono-cell'),
            cell(record.node_name || record.location),
            cell(date(record.last_seen)),
        ];
    }

    function render(payload) {
        state.total = Number(payload.total || 0);
        const headings = {
            routers: ['اسم الجهاز', 'عنوان NAS', 'النوع', 'خادم RADIUS', 'الحالة الإدارية', 'حداثة المزامنة', 'آخر مزامنة', 'المسؤول المسجّل'],
            nodes: ['اسم النقطة', 'التصنيف', 'عنوان الراوتر', 'المنفذ', 'النقطة الأم', 'الموقع', 'المسؤول', 'الحالة'],
            assets: ['رمز الأصل', 'الجهاز', 'الفئة', 'الطراز/المنصة', 'الحالة', 'عنوان IP', 'عنوان MAC', 'النقطة/الموقع', 'آخر ظهور'],
        }[state.view];
        const header = document.createElement('tr');
        headings.forEach((heading) => header.append(cell(heading)));
        elements.head.replaceChildren(header);
        const rows = (payload.data || []).map((record) => {
            const row = document.createElement('tr');
            renderRow(record).forEach((item) => row.append(item));
            return row;
        });
        elements.body.replaceChildren(...rows);
        elements.empty.textContent = 'لا توجد أجهزة أو نقاط مسجلة ضمن نطاقك.';
        elements.empty.hidden = rows.length > 0;
        elements.pageStatus.textContent = `الصفحة ${number(state.page)} — ${number(state.total)} سجل`;
        elements.previous.disabled = state.page <= 1;
        elements.next.disabled = state.page * 25 >= state.total;
        elements.explainer.textContent = descriptions[state.view];
        elements.updatedAt.textContent = `آخر تحديث: ${new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
    }

    async function load() {
        const requestId = ++state.requestId;
        elements.notice.hidden = true;
        elements.tableLoading.hidden = false;
        elements.empty.hidden = true;
        try {
            const payload = await request(queryUrl());
            if (!payload || requestId !== state.requestId) return;
            render(payload);
        } catch (error) {
            if (requestId === state.requestId) showNotice(error.message || 'تعذر تحميل أجهزة الشبكة.');
        } finally {
            if (requestId === state.requestId) elements.tableLoading.hidden = true;
        }
    }

    async function initialize() {
        try {
            const bootstrap = await request('api/network-devices.php?view=bootstrap');
            if (!bootstrap) return;
            elements.loading.hidden = true;
            elements.selectedNetwork.textContent = bootstrap.network.name || bootstrap.network.code || 'الشبكة';
            document.getElementById('userName').textContent = bootstrap.actor.name || 'مستخدم SAM';
            document.getElementById('userRole').textContent = bootstrap.actor.role || 'حساب';
            document.getElementById('userAvatar').textContent = (bootstrap.actor.name || 'س').trim().charAt(0);
            renderNetworks(bootstrap.networks || [], bootstrap.network.id);
            state.networkId = String(bootstrap.network.id || '');

            const access = bootstrap.access || {};
            elements.tabs.forEach((tab) => {
                tab.hidden = !access[tab.dataset.view];
            });
            const firstAllowed = elements.tabs.find((tab) => !tab.hidden);
            if (!firstAllowed) {
                showNotice('ليس لحسابك صلاحية عرض أجهزة الشبكة.');
                return;
            }
            state.view = firstAllowed.dataset.view;
            elements.tabs.forEach((tab) => {
                const selected = tab === firstAllowed;
                tab.classList.toggle('selected', selected);
                tab.setAttribute('aria-selected', String(selected));
            });
            elements.panel.setAttribute('aria-labelledby', firstAllowed.id);
            elements.workspace.hidden = false;
            await load();
        } catch (error) {
            elements.loading.hidden = true;
            showNotice(error.message || 'تعذر التحقق من صلاحيات الوصول.');
        }
    }

    elements.tabs.forEach((tab) => tab.addEventListener('click', () => {
        if (tab.hidden) return;
        state.view = tab.dataset.view;
        state.page = 1;
        elements.tabs.forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        elements.panel.setAttribute('aria-labelledby', tab.id);
        load();
    }));
    elements.search.addEventListener('input', () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
            state.page = 1;
            load();
        }, 250);
    });
    elements.networkSelect.addEventListener('change', () => {
        state.networkId = elements.networkSelect.value;
        state.page = 1;
        const selected = elements.networkSelect.selectedOptions[0];
        elements.selectedNetwork.textContent = selected ? selected.textContent : 'الشبكة';
        load();
    });
    elements.previous.addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            load();
        }
    });
    elements.next.addEventListener('click', () => {
        if (state.page * 25 < state.total) {
            state.page += 1;
            load();
        }
    });
    elements.refresh.addEventListener('click', load);
    elements.menuButton.addEventListener('click', () => {
        const expanded = elements.menuButton.getAttribute('aria-expanded') === 'true';
        elements.menuButton.setAttribute('aria-expanded', String(!expanded));
        elements.sidebar.classList.toggle('sidebar-open', !expanded);
        elements.sidebarScrim.hidden = expanded;
    });
    elements.sidebarScrim.addEventListener('click', () => {
        elements.menuButton.setAttribute('aria-expanded', 'false');
        elements.sidebar.classList.remove('sidebar-open');
        elements.sidebarScrim.hidden = true;
    });
    initialize();
})();
