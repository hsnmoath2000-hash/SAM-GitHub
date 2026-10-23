(() => {
    'use strict';

    const elements = {
        body: document.getElementById('commerceBody'),
        explainer: document.getElementById('viewExplainer'),
        head: document.getElementById('commerceHead'),
        loading: document.getElementById('loadingState'),
        tableLoading: document.getElementById('tableLoading'),
        empty: document.getElementById('tableEmpty'),
        menuButton: document.getElementById('menuButton'),
        networkSelect: document.getElementById('networkSelect'),
        next: document.getElementById('nextPage'),
        notice: document.getElementById('pageNotice'),
        pageStatus: document.getElementById('pageStatus'),
        panel: document.getElementById('commercePanel'),
        previous: document.getElementById('previousPage'),
        refresh: document.getElementById('refreshButton'),
        search: document.getElementById('searchInput'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        summary: document.getElementById('commerceSummary'),
        tabs: Array.from(document.querySelectorAll('.member-tab')),
        updatedAt: document.getElementById('updatedAt'),
        workspace: document.getElementById('commerceWorkspace'),
    };

    const state = { view: 'sales', page: 1, total: 0, networkId: '', requestId: 0 };
    const numberFormat = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 });
    const statusLabels = { completed: 'مكتملة', refunded: 'مستردة', cancelled: 'ملغاة' };
    const typeLabels = {
        sale_invoice: 'فاتورة بيع',
        receipt_voucher: 'سند قبض',
        payment_voucher: 'سند صرف',
        expense: 'مصروف',
        transfer: 'تحويل',
        adjustment: 'تسوية',
    };
    const kindLabels = { cards: 'كروت', instant_balance: 'رصيد فوري', digital_voucher: 'قسيمة رقمية' };
    const paymentLabels = { cash: 'نقدًا', credit: 'آجل', partial: 'جزئي' };
    const descriptions = {
        sales: 'فواتير المبيعات التي أنشأها حسابك أو الحسابات الواقعة ضمن نطاق إدارتك. لا تظهر بيانات اتصال المشتري.',
        finance: 'حركة الحسابات المالية للحسابات الواقعة ضمن نطاقك، حسب صلاحية كشف الحساب والتقارير المالية.',
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
        if (!value) return '—';
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime())
            ? '—'
            : new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
    }

    function queryUrl(view) {
        const query = new URLSearchParams({
            view,
            page: String(state.page),
            search: elements.search.value.trim(),
        });
        if (state.networkId) query.set('network_id', state.networkId);
        return `api/commerce.php?${query.toString()}`;
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

    function renderSalesRow(record) {
        return [
            cell(record.invoice_no, 'mono-cell'),
            cell(record.seller_name || record.seller_username),
            cell(kindLabels[record.sale_kind] || record.sale_kind),
            cell(record.profile_name),
            cell(number(record.quantity)),
            cell(number(record.total_amount)),
            cell(number(record.paid_amount)),
            cell(number(record.remaining_amount)),
            cell(paymentLabels[record.payment_type] || record.payment_type),
            cell(statusLabels[record.invoice_status] || record.invoice_status),
            cell(date(record.created_at)),
        ];
    }

    function renderFinanceRow(record) {
        return [
            cell(record.tx_no, 'mono-cell'),
            cell(record.account_name || record.account_username),
            cell(typeLabels[record.tx_type] || record.tx_type),
            cell(record.description),
            cell(number(record.debit)),
            cell(number(record.credit)),
            cell(number(record.cashbox_impact)),
            cell(record.payment_method),
            cell(date(record.created_at)),
        ];
    }

    function renderSummary(summary) {
        if (state.view === 'sales') {
            elements.summary.textContent = `الفواتير: ${number(summary.invoice_count)}  •  إجمالي المكتمل: ${number(summary.completed_amount)}  •  المدفوع: ${number(summary.paid_amount)}  •  المتبقي: ${number(summary.remaining_amount)}`;
            return;
        }
        elements.summary.textContent = `الحركات: ${number(summary.transaction_count)}  •  مدين: ${number(summary.total_debit)}  •  دائن: ${number(summary.total_credit)}  •  أثر الصندوق: ${number(summary.cashbox_impact)}`;
    }

    function render(payload) {
        state.total = Number(payload.total || 0);
        const headings = state.view === 'sales'
            ? ['رقم الفاتورة', 'البائع', 'النوع', 'الملف', 'الكمية', 'الإجمالي', 'المدفوع', 'المتبقي', 'طريقة الدفع', 'الحالة', 'التاريخ']
            : ['رقم الحركة', 'الحساب', 'النوع', 'البيان', 'مدين', 'دائن', 'أثر الصندوق', 'طريقة الدفع', 'التاريخ'];
        const header = document.createElement('tr');
        headings.forEach((heading) => header.append(cell(heading)));
        elements.head.replaceChildren(header);
        const records = payload.data || [];
        const rows = records.map((record) => {
            const row = document.createElement('tr');
            (state.view === 'sales' ? renderSalesRow(record) : renderFinanceRow(record)).forEach((item) => row.append(item));
            return row;
        });
        elements.body.replaceChildren(...rows);
        elements.empty.textContent = state.view === 'sales' ? 'لا توجد فواتير مبيعات ضمن نطاقك.' : 'لا توجد حركات مالية ضمن نطاقك.';
        elements.empty.hidden = rows.length > 0;
        renderSummary(payload.summary || {});
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
            const payload = await request(queryUrl(state.view));
            if (!payload || requestId !== state.requestId) return;
            render(payload);
        } catch (error) {
            if (requestId === state.requestId) showNotice(error.message || 'تعذر تحميل السجلات.');
        } finally {
            if (requestId === state.requestId) elements.tableLoading.hidden = true;
        }
    }

    async function initialize() {
        try {
            const bootstrap = await request('api/commerce.php?view=bootstrap');
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
                showNotice('ليس لحسابك صلاحية عرض المبيعات أو البيانات المالية.');
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
