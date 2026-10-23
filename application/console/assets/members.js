(() => {
    'use strict';

    const elements = {
        activityNotice: document.getElementById('pageNotice'),
        body: document.getElementById('membersBody'),
        content: document.getElementById('membersWorkspace'),
        empty: document.getElementById('tableEmpty'),
        explainer: document.getElementById('viewExplainer'),
        filterWrap: document.getElementById('memberFilters'),
        head: document.getElementById('membersHead'),
        loading: document.getElementById('loadingState'),
        menuButton: document.getElementById('menuButton'),
        memberView: document.getElementById('memberView'),
        networkSelect: document.getElementById('networkSelect'),
        next: document.getElementById('nextPage'),
        pageStatus: document.getElementById('pageStatus'),
        permissions: document.getElementById('permissionsList'),
        previous: document.getElementById('previousPage'),
        refresh: document.getElementById('refreshButton'),
        roleFilter: document.getElementById('roleFilterWrap'),
        roleSelect: document.getElementById('roleSelect'),
        search: document.getElementById('searchInput'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        status: document.getElementById('statusFilter'),
        summary: document.getElementById('membersSummary'),
        table: document.getElementById('membersTable'),
        tableLoading: document.getElementById('tableLoading'),
        tabs: Array.from(document.querySelectorAll('.member-tab')),
        updatedAt: document.getElementById('updatedAt'),
    };

    const state = { view: '', page: 1, perPage: 25, total: 0, networkId: '', role: '', requestId: 0 };
    const numberFormat = new Intl.NumberFormat('ar-YE');
    const urlNetworkId = new URLSearchParams(window.location.search).get('network_id') || '';
    const labels = {
        active: 'نشط',
        inactive: 'غير نشط',
        suspended: 'موقوف',
        expired: 'منتهي',
        disabled: 'معطل',
        locked: 'مقفل',
    };
    const scopeLabels = {
        all: 'كل البيانات',
        own: 'بياناته',
        children: 'التابعون له',
        assigned: 'المكلّفون له',
        delegated: 'المفوّضون',
        network: 'الشبكة',
    };
    const accessLabels = {
        owner: 'مالك',
        manager: 'مدير',
        accountant: 'محاسب',
        member: 'عضو',
        operator: 'مشغّل',
    };
    const descriptions = {
        team: 'حسابات الإدارة المعروفة في الشبكة، مع العضوية الفعّالة والدور المعيّن داخلها.',
        customers: 'هويات العملاء المركزية وعضوياتهم المحلية. لا تُدمج مع حسابات الإدارة أو سجلات RADIUS القديمة.',
        permissions: 'تعريفات الأدوار وصلاحياتها المسجلة. هذه الشاشة للعرض فقط ولا تغيّر صلاحيات الحسابات.',
    };

    function showNotice(message, isError = true) {
        elements.activityNotice.textContent = message;
        elements.activityNotice.classList.toggle('notice-error', isError);
        elements.activityNotice.hidden = false;
    }

    function togglePageLoading(loading) {
        elements.loading.hidden = !loading;
        elements.refresh.disabled = loading;
        elements.refresh.classList.toggle('spinning', loading);
    }

    function queryUrl(view, options = {}) {
        const query = new URLSearchParams({ view });
        if (state.networkId) query.set('network_id', state.networkId);
        if (view === 'team' || view === 'customers') {
            query.set('page', String(state.page));
            query.set('per_page', String(state.perPage));
            query.set('search', elements.search.value.trim());
            query.set('status', elements.status.value);
        }
        if (view === 'permissions' && (options.role || state.role)) {
            query.set('role', options.role || state.role);
        }
        return `api/members.php?${query.toString()}`;
    }

    async function request(view, options = {}) {
        const response = await fetch(queryUrl(view, options), {
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

    async function initialize() {
        state.networkId = urlNetworkId;
        togglePageLoading(true);
        try {
            const bootstrap = await request('bootstrap', { role: '' });
            if (!bootstrap) return;
            state.networkId = urlNetworkId || String(bootstrap.network.id);
            document.getElementById('userName').textContent = bootstrap.actor.name;
            document.getElementById('userAvatar').textContent = bootstrap.actor.name.trim().charAt(0) || 'س';
            document.getElementById('userRole').textContent = bootstrap.actor.role;
            elements.selectedNetwork.textContent = bootstrap.network.name;
            document.title = `${bootstrap.network.name} — الهويات والعضويات`;

            const options = bootstrap.networks.map((network) => {
                const option = document.createElement('option');
                option.value = String(network.id);
                option.textContent = `${network.name} (${network.code})`;
                option.selected = String(network.id) === state.networkId;
                return option;
            });
            elements.networkSelect.replaceChildren(...options);
            elements.networkSelect.disabled = bootstrap.networks.length < 2;
            elements.tabs.forEach((tab) => {
                tab.hidden = !bootstrap.access[tab.dataset.view];
                tab.setAttribute('aria-selected', 'false');
                tab.tabIndex = -1;
            });
            const firstAllowed = ['team', 'customers', 'permissions'].find((view) => bootstrap.access[view]);
            if (!firstAllowed) {
                throw new Error('لا تملك صلاحية عرض الهويات أو الأدوار في هذه الشبكة.');
            }
            elements.content.hidden = false;
            await switchView(firstAllowed);
            setFooterTime(bootstrap.generated_at);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.');
        } finally {
            togglePageLoading(false);
        }
    }

    function setFooterTime(dateText) {
        const date = new Date(dateText);
        elements.updatedAt.textContent = Number.isNaN(date.getTime())
            ? ''
            : `آخر تحديث ${new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
    }

    async function switchView(view) {
        state.view = view;
        state.page = 1;
        elements.memberView.setAttribute('aria-labelledby', `tab-${view}`);
        elements.tabs.forEach((tab) => {
            const selected = tab.dataset.view === view;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            tab.classList.toggle('selected', selected);
        });
        const permissions = view === 'permissions';
        elements.filterWrap.hidden = permissions;
        elements.roleFilter.hidden = !permissions;
        elements.table.hidden = permissions;
        elements.permissions.hidden = !permissions;
        elements.previous.hidden = permissions;
        elements.next.hidden = permissions;
        elements.pageStatus.hidden = permissions;
        elements.summary.textContent = '';
        elements.explainer.textContent = descriptions[view];
        if (!permissions) {
            const statuses = view === 'team'
                ? [['', 'كل الحالات'], ['active', 'نشط'], ['inactive', 'غير نشط'], ['expired', 'منتهي']]
                : [['', 'كل الحالات'], ['active', 'نشط'], ['suspended', 'موقوف'], ['expired', 'منتهي'], ['disabled', 'معطل'], ['locked', 'مقفل']];
            const options = statuses.map(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                return option;
            });
            elements.status.replaceChildren(...options);
            elements.status.value = '';
        }
        elements.body.replaceChildren();
        elements.permissions.replaceChildren();
        await loadView();
    }

    async function loadView() {
        const requestId = ++state.requestId;
        elements.activityNotice.hidden = true;
        elements.empty.hidden = true;
        elements.table.hidden = state.view === 'permissions';
        elements.permissions.hidden = state.view !== 'permissions';
        elements.tableLoading.hidden = state.view === 'permissions';
        if (state.view !== 'permissions') elements.tableLoading.hidden = false;
        elements.refresh.disabled = true;
        elements.refresh.classList.add('spinning');
        try {
            const payload = await request(state.view);
            if (!payload || requestId !== state.requestId) return;
            if (state.view === 'permissions') renderPermissions(payload);
            else renderMembers(payload);
            setFooterTime(payload.generated_at);
        } catch (error) {
            if (requestId === state.requestId) showNotice(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.');
        } finally {
            if (requestId === state.requestId) {
                elements.tableLoading.hidden = true;
                elements.refresh.disabled = false;
                elements.refresh.classList.remove('spinning');
            }
        }
    }

    function cell(text, className = '') {
        const node = document.createElement('td');
        if (className) node.className = className;
        node.textContent = text === null || text === undefined || text === '' ? '—' : String(text);
        return node;
    }

    function statusBadge(status) {
        const badge = document.createElement('span');
        badge.className = `status-badge status-${status}`;
        badge.textContent = labels[status] || status || 'غير محدد';
        return badge;
    }

    function displayDate(value) {
        if (!value) return 'بدون تاريخ انتهاء';
        const date = new Date(String(value).replace(' ', 'T'));
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('ar-YE', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    }

    function renderMembers(payload) {
        state.total = payload.total;
        const isTeam = state.view === 'team';
        const headings = isTeam
            ? ['الاسم', 'اسم الدخول', 'الهاتف', 'الدور في الشبكة', 'مستوى العضوية', 'نطاق البيانات', 'الحالة']
            : ['الهوية', 'اسم المستخدم بالشبكة', 'الهاتف', 'الملف', 'المسؤول', 'الصلاحية حتى', 'الحالة'];
        elements.head.replaceChildren();
        const headerRow = document.createElement('tr');
        headings.forEach((heading) => headerRow.append(cell(heading)));
        elements.head.append(headerRow);
        elements.body.replaceChildren();

        payload.data.forEach((record) => {
            const row = document.createElement('tr');
            if (isTeam) {
                row.append(
                    cell(record.display_name),
                    cell(record.username, 'mono-cell'),
                    cell(record.phone, 'mono-cell'),
                    cell(record.role_name),
                    cell(accessLabels[record.access_level] || record.access_level),
                    cell(scopeLabels[record.data_scope] || record.data_scope),
                    cell('', 'status-cell'),
                );
                row.lastElementChild.append(statusBadge(record.membership_status));
            } else {
                row.append(
                    cell(record.display_name),
                    cell(record.username, 'mono-cell'),
                    cell(record.phone, 'mono-cell'),
                    cell(record.profile_name),
                    cell(record.owner_name),
                    cell(displayDate(record.valid_until)),
                    cell('', 'status-cell'),
                );
                row.lastElementChild.append(statusBadge(record.display_status));
            }
            elements.body.append(row);
        });
        elements.summary.textContent = `عدد السجلات: ${numberFormat.format(payload.total)}`;
        elements.empty.hidden = payload.data.length !== 0;
        elements.empty.textContent = elements.search.value.trim()
            ? 'لا توجد نتائج تطابق عبارة البحث.'
            : 'لا توجد سجلات متاحة في هذا القسم ضمن نطاق صلاحيتك.';
        const pages = Math.max(1, Math.ceil(payload.total / payload.per_page));
        elements.pageStatus.textContent = `الصفحة ${numberFormat.format(payload.page)} من ${numberFormat.format(pages)}`;
        elements.previous.disabled = payload.page <= 1;
        elements.next.disabled = payload.page >= pages;
    }

    function renderPermissions(payload) {
        state.role = payload.selected_role;
        const roleOptions = payload.roles.map((role) => {
            const option = document.createElement('option');
            option.value = role.role_key;
            option.textContent = role.role_name_ar;
            option.selected = role.role_key === payload.selected_role;
            return option;
        });
        elements.roleSelect.replaceChildren(...roleOptions);
        const selectedRole = payload.roles.find((role) => role.role_key === payload.selected_role);
        const groups = new Map();
        payload.permissions.forEach((permission) => {
            if (!groups.has(permission.module_key)) groups.set(permission.module_key, []);
            groups.get(permission.module_key).push(permission);
        });
        const fragments = [];
        if (selectedRole) {
            const summary = document.createElement('div');
            summary.className = 'role-summary';
            const heading = document.createElement('strong');
            heading.textContent = selectedRole.role_name_ar;
            const description = document.createElement('span');
            description.textContent = selectedRole.description || `نطاق البيانات الافتراضي: ${selectedRole.default_data_scope}`;
            summary.append(heading, description);
            fragments.push(summary);
        }
        groups.forEach((permissions, moduleName) => {
            const section = document.createElement('section');
            section.className = 'permission-module';
            const title = document.createElement('h3');
            title.textContent = moduleName;
            const list = document.createElement('div');
            list.className = 'permission-grid';
            permissions.forEach((permission) => {
                const item = document.createElement('article');
                item.className = `permission-item effect-${permission.role_effect}`;
                const status = document.createElement('span');
                status.className = 'permission-effect';
                status.textContent = permission.role_effect === 'grant'
                    ? 'ممنوحة'
                    : permission.role_effect === 'deny' ? 'مرفوضة' : 'غير مسندة';
                const name = document.createElement('strong');
                name.textContent = permission.permission_name_ar;
                const key = document.createElement('code');
                key.textContent = permission.permission_key;
                const meta = document.createElement('small');
                meta.textContent = `${permission.action_key} · ${permission.scope_key}${permission.is_sensitive ? ' · حساسة' : ''}`;
                item.append(status, name, key, meta);
                list.append(item);
            });
            section.append(title, list);
            fragments.push(section);
        });
        if (!payload.permissions.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'لا توجد صلاحيات نشطة معرّفة في دليل الصلاحيات.';
            fragments.push(empty);
        }
        elements.permissions.replaceChildren(...fragments);
        elements.summary.textContent = `صلاحيات معرفة: ${numberFormat.format(payload.permissions.length)}`;
    }

    let debounce;
    elements.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
    elements.tabs.forEach((tab) => tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const visibleTabs = elements.tabs.filter((item) => !item.hidden);
        const current = visibleTabs.indexOf(tab);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = visibleTabs[(current + step + visibleTabs.length) % visibleTabs.length];
        next.focus();
        switchView(next.dataset.view);
    }));
    elements.search.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            state.page = 1;
            if (state.view === 'team' || state.view === 'customers') loadView();
        }, 250);
    });
    elements.status.addEventListener('change', () => {
        state.page = 1;
        loadView();
    });
    elements.roleSelect.addEventListener('change', () => {
        state.role = elements.roleSelect.value;
        loadView();
    });
    elements.previous.addEventListener('click', () => {
        state.page = Math.max(1, state.page - 1);
        loadView();
    });
    elements.next.addEventListener('click', () => {
        state.page += 1;
        loadView();
    });
    elements.refresh.addEventListener('click', loadView);
    elements.networkSelect.addEventListener('change', () => {
        const next = elements.networkSelect.value;
        const url = new URL(window.location.href);
        url.searchParams.set('network_id', next);
        window.location.assign(url.toString());
    });
    elements.menuButton.addEventListener('click', () => {
        const open = !elements.sidebar.classList.contains('sidebar-open');
        elements.sidebar.classList.toggle('sidebar-open', open);
        elements.sidebarScrim.hidden = !open;
        elements.menuButton.setAttribute('aria-expanded', String(open));
    });
    elements.sidebarScrim.addEventListener('click', () => {
        elements.sidebar.classList.remove('sidebar-open');
        elements.sidebarScrim.hidden = true;
        elements.menuButton.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            elements.sidebar.classList.remove('sidebar-open');
            elements.sidebarScrim.hidden = true;
            elements.menuButton.setAttribute('aria-expanded', 'false');
        }
    });

    initialize();
})();
