(() => {
    'use strict';

    const elements = {
        body: document.getElementById('posBody'),
        cancelReview: document.getElementById('cancelReview'),
        explainer: document.getElementById('viewExplainer'),
        financialFields: document.getElementById('reviewFinancialFields'),
        form: document.getElementById('reviewForm'),
        head: document.getElementById('posHead'),
        loading: document.getElementById('loadingState'),
        tableLoading: document.getElementById('tableLoading'),
        empty: document.getElementById('tableEmpty'),
        menuButton: document.getElementById('menuButton'),
        membersSummary: document.getElementById('membersSummary'),
        networkSelect: document.getElementById('networkSelect'),
        next: document.getElementById('nextPage'),
        notice: document.getElementById('pageNotice'),
        pageStatus: document.getElementById('pageStatus'),
        panel: document.getElementById('posPanel'),
        previous: document.getElementById('previousPage'),
        reviewDialog: document.getElementById('reviewDialog'),
        reviewError: document.getElementById('reviewError'),
        reviewRequestId: document.getElementById('reviewRequestId'),
        reviewRequestLabel: document.getElementById('reviewRequestLabel'),
        refresh: document.getElementById('refreshButton'),
        search: document.getElementById('searchInput'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        submitReview: document.getElementById('submitReview'),
        tabs: Array.from(document.querySelectorAll('.member-tab')),
        updatedAt: document.getElementById('updatedAt'),
        workspace: document.getElementById('posWorkspace'),
    };

    const state = { view: 'directory', page: 1, total: 0, networkId: '', requestId: 0, canReview: false };
    const numberFormat = new Intl.NumberFormat('ar-YE');
    const accessLabels = { full: 'كامل', agent: 'وكيل', member: 'عضو', operator: 'مشغّل' };
    const initiatedLabels = { pos_agent: 'نقطة بيع', network_manager: 'إدارة الشبكة', distributor: 'موزّع' };
    const descriptions = {
        directory: 'نقاط البيع الفعّالة المرتبطة بالشبكة، مع بيانات المتجر والفرع المعيّن عند توفرها.',
        requests: 'طلبات الانضمام التي ما زالت بانتظار المراجعة، ضمن نطاق حسابك في الشبكة.',
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

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(date.getTime())
            ? '—'
            : new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(date);
    }

    function queryUrl(view) {
        const query = new URLSearchParams({
            view,
            page: String(state.page),
            search: elements.search.value.trim(),
        });
        if (state.networkId) query.set('network_id', state.networkId);
        return `api/pos.php?${query.toString()}`;
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

    function renderDirectory(record) {
        return [
            cell(record.shop_name || record.fullname),
            cell(record.fullname),
            cell(record.username, 'mono-cell'),
            cell(record.phone, 'mono-cell'),
            cell(record.node_name || 'غير معيّن'),
            cell(accessLabels[record.access_level] || record.access_level),
            cell(formatDate(record.starts_at)),
        ];
    }

    function renderRequest(record) {
        const user = record.account_name
            ? `${record.account_name} (${record.username || ''})`
            : 'لم يُربط بحساب بعد';
        return [
            cell(record.request_no, 'mono-cell'),
            cell(record.shop_name),
            cell(user),
            cell(record.phone, 'mono-cell'),
            cell(record.location_notes),
            cell(initiatedLabels[record.initiated_by] || record.initiated_by),
            cell(formatDate(record.created_at)),
            state.canReview ? reviewActions(record) : cell('—'),
        ];
    }

    function reviewActions(record) {
        const container = document.createElement('div');
        container.className = 'review-action';
        [
            { decision: 'approved', label: 'اعتماد' },
            { decision: 'rejected', label: 'رفض' },
        ].forEach(({ decision, label }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.requestId = String(record.id);
            button.dataset.requestLabel = `${record.request_no} — ${record.shop_name || 'نقطة بيع'}`;
            button.dataset.decision = decision;
            button.textContent = label;
            button.addEventListener('click', () => openReview(button));
            container.append(button);
        });
        const wrapper = document.createElement('td');
        wrapper.append(container);
        return wrapper;
    }

    function openReview(button) {
        const approve = button.dataset.decision === 'approved';
        elements.form.reset();
        elements.reviewError.hidden = true;
        elements.reviewRequestId.value = button.dataset.requestId;
        elements.reviewRequestLabel.textContent = button.dataset.requestLabel;
        elements.financialFields.hidden = !approve;
        elements.financialFields.querySelectorAll('input').forEach((input) => {
            input.disabled = !approve;
            input.required = approve;
        });
        elements.submitReview.dataset.decision = button.dataset.decision;
        elements.submitReview.textContent = approve ? 'تأكيد الاعتماد' : 'تأكيد الرفض';
        elements.submitReview.classList.toggle('review-reject-button', !approve);
        elements.reviewDialog.showModal();
    }

    function render(payload) {
        state.total = Number(payload.total || 0);
        const headings = state.view === 'directory'
            ? ['اسم المتجر', 'حساب نقطة البيع', 'اسم الدخول', 'الهاتف', 'الفرع/النقطة', 'العضوية', 'تاريخ الربط']
            : ['رقم الطلب', 'المتجر', 'الحساب', 'الهاتف', 'ملاحظات الموقع', 'مقدّم الطلب', 'تاريخ الطلب', 'إجراء'];
        const header = document.createElement('tr');
        headings.forEach((heading) => header.append(cell(heading)));
        elements.head.replaceChildren(header);

        const rows = (payload.data || []).map((record) => {
            const row = document.createElement('tr');
            const cells = state.view === 'directory' ? renderDirectory(record) : renderRequest(record);
            cells.forEach((item) => row.append(item));
            return row;
        });
        elements.body.replaceChildren(...rows);
        elements.membersSummary.textContent = `عدد السجلات ضمن نطاقك: ${numberFormat.format(state.total)}`;
        elements.empty.hidden = rows.length > 0;
        elements.empty.textContent = elements.search.value.trim()
            ? 'لا توجد نتائج تطابق عبارة البحث.'
            : state.view === 'directory' ? 'لا توجد نقاط بيع فعّالة ضمن نطاق صلاحيتك.' : 'لا توجد طلبات انضمام معلّقة.';

        const page = Number(payload.page || 1);
        const pages = Math.max(1, Math.ceil(state.total / Number(payload.per_page || 25)));
        elements.pageStatus.textContent = `الصفحة ${numberFormat.format(page)} من ${numberFormat.format(pages)}`;
        elements.previous.disabled = page <= 1;
        elements.next.disabled = page >= pages;
        elements.updatedAt.textContent = `آخر تحديث ${new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(new Date(payload.generated_at))}`;
    }

    async function loadView() {
        const requestId = ++state.requestId;
        elements.notice.hidden = true;
        elements.empty.hidden = true;
        elements.tableLoading.hidden = false;
        elements.refresh.disabled = true;
        elements.refresh.classList.add('spinning');
        try {
            const payload = await request(queryUrl(state.view));
            if (!payload || requestId !== state.requestId) return;
            render(payload);
        } catch (error) {
            if (requestId === state.requestId) showNotice(error instanceof Error ? error.message : 'تعذر تحميل السجلات.');
        } finally {
            if (requestId === state.requestId) {
                elements.tableLoading.hidden = true;
                elements.refresh.disabled = false;
                elements.refresh.classList.remove('spinning');
            }
        }
    }

    async function switchView(view) {
        state.view = view;
        state.page = 1;
        elements.explainer.textContent = descriptions[view];
        elements.panel.setAttribute('aria-labelledby', `tab-${view}`);
        elements.tabs.forEach((tab) => {
            const selected = tab.dataset.view === view;
            tab.classList.toggle('selected', selected);
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        await loadView();
    }

    async function initialize() {
        elements.loading.hidden = false;
        const networkFromUrl = new URLSearchParams(window.location.search).get('network_id') || '';
        try {
            const url = `api/pos.php?view=bootstrap${networkFromUrl ? `&network_id=${encodeURIComponent(networkFromUrl)}` : ''}`;
            const bootstrap = await request(url);
            if (!bootstrap) return;
            state.networkId = networkFromUrl || String(bootstrap.network.id);
            document.getElementById('userName').textContent = bootstrap.actor.name;
            document.getElementById('userAvatar').textContent = bootstrap.actor.name.trim().charAt(0) || 'س';
            document.getElementById('userRole').textContent = bootstrap.actor.role;
            elements.selectedNetwork.textContent = bootstrap.network.name;
            document.title = `${bootstrap.network.name} — المتاجر ونقاط البيع`;
            renderNetworks(bootstrap.networks, state.networkId);
            state.canReview = Boolean(bootstrap.access.review);
            if (!bootstrap.access.pos) {
                throw new Error('لا تملك صلاحية عرض حسابات الشبكة ونقاط البيع.');
            }
            elements.workspace.hidden = false;
            elements.loading.hidden = true;
            await switchView('directory');
        } catch (error) {
            elements.loading.hidden = true;
            showNotice(error instanceof Error ? error.message : 'تعذر تهيئة الصفحة.');
        }
    }

    elements.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
    elements.cancelReview.addEventListener('click', () => elements.reviewDialog.close());
    elements.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const decision = elements.submitReview.dataset.decision;
        const values = new FormData(elements.form);
        const payload = {
            request_id: Number(values.get('request_id')),
            decision,
            notes: String(values.get('notes') || '').trim(),
        };
        if (decision === 'approved') {
            ['discount_rate', 'credit_limit', 'opening_debt', 'opening_balance'].forEach((key) => {
                payload[key] = String(values.get(key) || '');
            });
        }
        const query = new URLSearchParams({ network_id: state.networkId });
        elements.submitReview.disabled = true;
        elements.notice.hidden = true;
        try {
            const response = await fetch(`api/pos.php?${query.toString()}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-SAM-Request': 'XMLHttpRequest',
                },
                cache: 'no-store',
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (response.status === 401) {
                window.location.replace('../login.html');
                return;
            }
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'تعذرت مراجعة الطلب.');
            }
            elements.reviewDialog.close();
            await loadView();
            const actionMessage = result.result.message || 'تمت مراجعة الطلب.';
            if (!elements.notice.hidden) {
                showNotice(`${actionMessage} تعذر تحديث القائمة؛ أعد تحديثها يدويًا.`);
            } else {
                elements.notice.textContent = actionMessage;
                elements.notice.classList.remove('notice-error');
                elements.notice.hidden = false;
            }
        } catch (error) {
            elements.reviewError.textContent = error instanceof Error ? error.message : 'تعذرت مراجعة الطلب.';
            elements.reviewError.hidden = false;
        } finally {
            elements.submitReview.disabled = false;
        }
    });
    elements.search.addEventListener('input', () => {
        window.clearTimeout(elements.search.searchTimer);
        elements.search.searchTimer = window.setTimeout(() => {
            state.page = 1;
            loadView();
        }, 250);
    });
    elements.previous.addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            loadView();
        }
    });
    elements.next.addEventListener('click', () => {
        if (state.page * 25 < state.total) {
            state.page += 1;
            loadView();
        }
    });
    elements.refresh.addEventListener('click', loadView);
    elements.networkSelect.addEventListener('change', () => {
        const query = new URLSearchParams(window.location.search);
        query.set('network_id', elements.networkSelect.value);
        window.location.search = query.toString();
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

    initialize();
})();
