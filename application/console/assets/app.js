(() => {
    'use strict';

    const elements = {
        activityList: document.getElementById('activityList'),
        dashboardContent: document.getElementById('dashboardContent'),
        loadingState: document.getElementById('loadingState'),
        menuButton: document.getElementById('menuButton'),
        networkSelect: document.getElementById('networkSelect'),
        notice: document.getElementById('pageNotice'),
        refreshButton: document.getElementById('refreshButton'),
        salesChart: document.getElementById('salesChart'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        statsGrid: document.getElementById('statsGrid'),
    };

    const numberFormat = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 });
    const dateFormat = new Intl.DateTimeFormat('ar-YE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' });
    let activeRequest = 0;
    document.getElementById('todayLabel').textContent = dateFormat.format(new Date());

    function setLoading(loading) {
        elements.loadingState.hidden = !loading;
        elements.refreshButton.disabled = loading;
        elements.refreshButton.classList.toggle('spinning', loading);
        if (loading) {
            elements.notice.hidden = true;
            elements.statsGrid.hidden = true;
            elements.dashboardContent.hidden = true;
        }
    }

    function showNotice(message, isError = true) {
        elements.notice.textContent = message;
        elements.notice.classList.toggle('notice-error', isError);
        elements.notice.hidden = false;
    }

    function createStatCard({ label, value, detail, icon, tone }) {
        const card = document.createElement('article');
        card.className = `stat-card tone-${tone}`;
        const iconBox = document.createElement('span');
        iconBox.className = 'stat-icon';
        iconBox.setAttribute('aria-hidden', 'true');
        iconBox.textContent = icon;
        const labelNode = document.createElement('span');
        labelNode.className = 'stat-label';
        labelNode.textContent = label;
        const valueNode = document.createElement('strong');
        valueNode.className = 'stat-value';
        valueNode.textContent = value;
        const detailNode = document.createElement('span');
        detailNode.className = 'stat-detail';
        detailNode.textContent = detail;
        card.append(iconBox, labelNode, valueNode, detailNode);
        return card;
    }

    function renderStats(metrics) {
        const cards = [
            { label: 'جلسات نشطة', value: numberFormat.format(metrics.active_sessions), detail: 'اتصال قائم الآن', icon: '⌁', tone: 'mint' },
            { label: 'أجهزة الشبكة', value: numberFormat.format(metrics.active_routers), detail: 'جهاز مسجّل ونشط', icon: '⌘', tone: 'blue' },
            { label: 'كروت متاحة', value: numberFormat.format(metrics.available_cards), detail: 'ضمن المخزون النشط', icon: '▦', tone: 'amber' },
            { label: 'أعضاء الفريق', value: numberFormat.format(metrics.network_members), detail: 'عضوية إدارية فعّالة', icon: '◎', tone: 'violet' },
        ];
        if (metrics.today_invoice_count !== null) {
            cards.push({
                label: 'فواتير اليوم',
                value: numberFormat.format(metrics.today_invoice_count),
                detail: 'فاتورة مكتملة',
                icon: '▤',
                tone: 'rose',
            });
        }
        elements.statsGrid.replaceChildren(...cards.map(createStatCard));
        elements.statsGrid.hidden = false;
    }

    function renderNetworks(networks, selectedId) {
        const options = networks.map((network) => {
            const option = document.createElement('option');
            option.value = String(network.id);
            option.textContent = `${network.name} (${network.code})`;
            option.selected = network.id === selectedId;
            return option;
        });
        elements.networkSelect.replaceChildren(...options);
        elements.networkSelect.disabled = networks.length < 2;
    }

    function renderTrend(trend) {
        if (!trend.length) {
            elements.salesChart.replaceChildren();
            document.getElementById('trendPanel').hidden = true;
            elements.dashboardContent.classList.add('without-trend');
            return;
        }
        document.getElementById('trendPanel').hidden = false;
        elements.dashboardContent.classList.remove('without-trend');
        const maximum = Math.max(...trend.map((day) => day.invoice_count), 1);
        const bars = trend.map((day) => {
            const column = document.createElement('div');
            column.className = 'chart-column';
            const amount = document.createElement('span');
            amount.className = 'chart-amount';
            amount.textContent = numberFormat.format(day.invoice_count);
            const track = document.createElement('div');
            track.className = 'chart-track';
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            bar.style.height = `${Math.max(4, (day.invoice_count / maximum) * 100)}%`;
            bar.title = `${day.date}: ${numberFormat.format(day.invoice_count)} فاتورة`;
            track.append(bar);
            const label = document.createElement('span');
            label.className = 'chart-label';
            label.textContent = new Intl.DateTimeFormat('ar-YE', { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`));
            column.append(amount, track, label);
            return column;
        });
        elements.salesChart.replaceChildren(...bars);
    }

    function renderActivities(activities) {
        if (!activities.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'لا توجد نشاطات حديثة لعرضها.';
            elements.activityList.replaceChildren(empty);
            return;
        }
        const items = activities.map((activity) => {
            const item = document.createElement('article');
            item.className = 'activity-item';
            const marker = document.createElement('span');
            marker.className = `activity-dot status-${activity.status}`;
            marker.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('span');
            copy.className = 'activity-copy';
            const title = document.createElement('strong');
            title.textContent = activity.action_title;
            const category = document.createElement('small');
            category.textContent = activity.action_category;
            copy.append(title, category);
            const time = document.createElement('time');
            time.dateTime = activity.created_at;
            const parsedDate = new Date(activity.created_at.replace(' ', 'T'));
            time.textContent = Number.isNaN(parsedDate.getTime()) ? '' : timeFormat.format(parsedDate);
            item.append(marker, copy, time);
            return item;
        });
        elements.activityList.replaceChildren(...items);
    }

    function renderDashboard(payload) {
        const name = payload.actor.name || 'مستخدم SAM';
        document.getElementById('userName').textContent = name;
        document.getElementById('welcomeName').textContent = name.split(/\s+/)[0];
        document.getElementById('userAvatar').textContent = name.trim().charAt(0) || 'س';
        document.getElementById('userRole').textContent = payload.actor.role_name || payload.actor.role;
        document.title = `${payload.network.name} — لوحة SAM`;
        renderNetworks(payload.networks, payload.network.id);
        renderStats(payload.metrics);
        renderTrend(payload.metrics.sales_trend);
        renderActivities(payload.activities);
        const generatedAt = new Date(payload.generated_at);
        document.getElementById('updatedAt').textContent = Number.isNaN(generatedAt.getTime())
            ? ''
            : `آخر تحديث ${timeFormat.format(generatedAt)}`;
        elements.dashboardContent.hidden = false;
    }

    async function loadDashboard(networkId = '') {
        const requestId = ++activeRequest;
        setLoading(true);
        const query = networkId ? `?network_id=${encodeURIComponent(networkId)}` : '';
        try {
            const response = await fetch(`api/dashboard.php${query}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });
            const payload = await response.json();
            if (requestId !== activeRequest) return;
            if (response.status === 401) {
                window.location.replace('../login.html');
                return;
            }
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'تعذر تحميل لوحة التحكم.');
            }
            renderDashboard(payload);
        } catch (error) {
            if (requestId !== activeRequest) return;
            showNotice(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.');
        } finally {
            if (requestId === activeRequest) setLoading(false);
        }
    }

    function setSidebarOpen(open) {
        elements.sidebar.classList.toggle('sidebar-open', open);
        elements.sidebarScrim.hidden = !open;
        elements.menuButton.setAttribute('aria-expanded', String(open));
        elements.menuButton.setAttribute('aria-label', open ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل');
    }

    elements.networkSelect.addEventListener('change', () => loadDashboard(elements.networkSelect.value));
    elements.refreshButton.addEventListener('click', () => loadDashboard(elements.networkSelect.value));
    elements.menuButton.addEventListener('click', () => setSidebarOpen(!elements.sidebar.classList.contains('sidebar-open')));
    elements.sidebarScrim.addEventListener('click', () => setSidebarOpen(false));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setSidebarOpen(false);
    });

    loadDashboard();
})();
