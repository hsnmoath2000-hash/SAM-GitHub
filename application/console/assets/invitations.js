(() => {
    'use strict';

    const elements = {
        body: document.getElementById('invitationBody'),
        count: document.getElementById('invitationCount'),
        createButton: document.getElementById('createButton'),
        empty: document.getElementById('invitationEmpty'),
        form: document.getElementById('invitationForm'),
        inviteResult: document.getElementById('inviteResult'),
        loading: document.getElementById('loadingState'),
        menuButton: document.getElementById('menuButton'),
        networkSelect: document.getElementById('networkSelect'),
        notice: document.getElementById('pageNotice'),
        refresh: document.getElementById('refreshButton'),
        roleSelect: document.getElementById('roleSelect'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        updatedAt: document.getElementById('updatedAt'),
        workspace: document.getElementById('invitationWorkspace'),
    };

    const state = { networkId: '', busy: false };
    const labels = { issued: 'مُرسلة', completed: 'مكتملة', revoked: 'مبطلة', expired: 'منتهية' };
    const dateFormat = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });

    function showNotice(message, isError = true) {
        elements.notice.textContent = message;
        elements.notice.classList.toggle('notice-error', isError);
        elements.notice.hidden = false;
    }

    function setBusy(busy) {
        state.busy = busy;
        elements.refresh.disabled = busy;
        elements.createButton.disabled = busy || !elements.roleSelect.value;
        elements.refresh.classList.toggle('spinning', busy);
    }

    function apiUrl(view) {
        const query = new URLSearchParams({ view });
        if (state.networkId) query.set('network_id', state.networkId);
        return `api/invitations.php?${query}`;
    }

    async function responsePayload(response) {
        const payload = await response.json();
        if (response.status === 401) {
            window.location.replace('../login.html');
            return null;
        }
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'تعذر تنفيذ الطلب.');
        }
        return payload;
    }

    async function getJson(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
        return responsePayload(response);
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-SAM-Request': 'XMLHttpRequest',
            },
            cache: 'no-store',
            body: JSON.stringify(body),
        });
        return responsePayload(response);
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

    function renderRoles(roles) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = roles.length ? 'اختر الدور' : 'لا توجد أدوار مسموحة';
        const options = roles.map((role) => {
            const option = document.createElement('option');
            option.value = role.role_key;
            option.textContent = `${role.role_name_ar} (${role.role_key})`;
            return option;
        });
        elements.roleSelect.replaceChildren(emptyOption, ...options);
        elements.createButton.disabled = state.busy || !roles.length;
    }

    function formatDate(value) {
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed);
    }

    function renderInvitations(invitations, generatedAt) {
        elements.count.textContent = new Intl.NumberFormat('ar-YE').format(invitations.length) + ' دعوة';
        elements.empty.hidden = invitations.length > 0;
        const rows = invitations.map((invite) => {
            const row = document.createElement('tr');
            const values = [
                `${invite.target_name || ''} (${invite.username || ''})`,
                invite.role_name || invite.role_key || '—',
                invite.issuer_name || '—',
                formatDate(invite.created_at),
                formatDate(invite.expires_at),
            ];
            values.forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (index === 0) cell.dir = 'auto';
                row.append(cell);
            });
            const statusCell = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = `status-badge status-${invite.display_state}`;
            badge.textContent = labels[invite.display_state] || invite.display_state;
            statusCell.append(badge);
            row.append(statusCell);

            const actionCell = document.createElement('td');
            if (invite.display_state === 'issued') {
                const revoke = document.createElement('button');
                revoke.type = 'button';
                revoke.className = 'invitation-action';
                revoke.textContent = 'إبطال';
                revoke.dataset.invitationId = String(invite.id);
                revoke.setAttribute('aria-label', `إبطال دعوة ${invite.username}`);
                actionCell.append(revoke);
            } else {
                actionCell.textContent = '—';
            }
            row.append(actionCell);
            return row;
        });
        elements.body.replaceChildren(...rows);

        const date = new Date(generatedAt);
        elements.updatedAt.textContent = Number.isNaN(date.getTime())
            ? ''
            : `آخر تحديث ${new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
    }

    async function loadInvitations() {
        setBusy(true);
        try {
            const payload = await getJson(apiUrl('list'));
            if (payload) renderInvitations(payload.invitations || [], payload.generated_at);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'تعذر تحميل سجل الدعوات.');
        } finally {
            setBusy(false);
        }
    }

    function createRequestKey() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID().replace(/-/g, '');
        }
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
    }

    function showCreatedInvitation(payload) {
        const link = new URL(payload.invitation_url, window.location.href);
        const label = document.createElement('strong');
        label.textContent = 'تم إنشاء الدعوة. انسخ الرابط الآن؛ لن يُخزّن نص الرابط ويُعرض مرة واحدة فقط.';
        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = 'رابط الدعوة';
        const field = document.createElement('input');
        field.type = 'text';
        field.readOnly = true;
        field.value = link.href;
        field.setAttribute('aria-label', 'رابط الدعوة، انسخه لإرساله إلى المدعو');
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'نسخ الرابط';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(field.value);
                copy.textContent = 'تم النسخ';
            } catch {
                field.focus();
                field.select();
                copy.textContent = 'حدّد الرابط وانسخه يدويًا';
            }
        });
        elements.inviteResult.replaceChildren(label, fieldLabel, field, copy);
        elements.inviteResult.hidden = false;
    }

    async function initialize() {
        setBusy(true);
        const networkFromUrl = new URLSearchParams(window.location.search).get('network_id') || '';
        try {
            const bootstrapResponse = await fetch(
                `api/members.php?view=bootstrap${networkFromUrl ? `&network_id=${encodeURIComponent(networkFromUrl)}` : ''}`,
                { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' }
            );
            const bootstrap = await responsePayload(bootstrapResponse);
            if (!bootstrap) return;
            state.networkId = networkFromUrl || String(bootstrap.network.id);
            document.getElementById('userName').textContent = bootstrap.actor.name;
            document.getElementById('userAvatar').textContent = bootstrap.actor.name.trim().charAt(0) || 'س';
            document.getElementById('userRole').textContent = bootstrap.actor.role;
            elements.selectedNetwork.textContent = bootstrap.network.name;
            document.title = `${bootstrap.network.name} — دعوات الانضمام`;
            renderNetworks(bootstrap.networks, state.networkId);

            const rolesPayload = await getJson(apiUrl('roles'));
            if (!rolesPayload) return;
            renderRoles(rolesPayload.roles || []);
            elements.workspace.hidden = false;
            elements.loading.hidden = true;
            if (!(rolesPayload.roles || []).length) {
                showNotice('لا توجد أدوار يمكن إسنادها ضمن صلاحياتك.', false);
            }
            await loadInvitations();
        } catch (error) {
            elements.loading.hidden = true;
            showNotice(error instanceof Error ? error.message : 'تعذر تهيئة صفحة الدعوات.');
        } finally {
            setBusy(false);
        }
    }

    elements.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy) return;
        elements.notice.hidden = true;
        elements.inviteResult.hidden = true;
        const values = new FormData(elements.form);
        const payload = {
            action: 'create',
            fullname: String(values.get('fullname') || '').trim(),
            username: String(values.get('username') || '').trim(),
            phone: String(values.get('phone') || '').trim(),
            email: String(values.get('email') || '').trim(),
            role_key: String(values.get('role_key') || ''),
            expires_hours: Number(values.get('expires_hours')),
            request_key: createRequestKey(),
        };
        setBusy(true);
        try {
            const result = await postJson(apiUrl('list'), payload);
            if (!result) return;
            showCreatedInvitation(result);
            showNotice('أُنشئت الدعوة. أرسل الرابط إلى الشخص المقصود مباشرةً.', false);
            await loadInvitations();
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'تعذر إنشاء الدعوة.');
        } finally {
            setBusy(false);
        }
    });

    elements.body.addEventListener('click', async (event) => {
        const button = event.target.closest('.invitation-action');
        if (!button || state.busy) return;
        if (!window.confirm('سيُبطل هذا الرابط فورًا، ولن يستطيع المدعو إكمال الانضمام به. هل تريد المتابعة؟')) return;
        setBusy(true);
        try {
            await postJson(apiUrl('list'), { action: 'revoke', invitation_id: Number(button.dataset.invitationId) });
            showNotice('أُبطلت الدعوة.', false);
            await loadInvitations();
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'تعذر إبطال الدعوة.');
        } finally {
            setBusy(false);
        }
    });

    elements.networkSelect.addEventListener('change', () => {
        const query = new URLSearchParams(window.location.search);
        query.set('network_id', elements.networkSelect.value);
        window.location.search = query.toString();
    });
    elements.refresh.addEventListener('click', loadInvitations);
    elements.roleSelect.addEventListener('change', () => {
        elements.createButton.disabled = state.busy || !elements.roleSelect.value;
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
