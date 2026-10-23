(() => {
    'use strict';

    const elements = {
        acceptButton: document.getElementById('acceptButton'),
        form: document.getElementById('acceptForm'),
        details: document.getElementById('joinDetails'),
        loading: document.getElementById('joinLoading'),
        login: document.getElementById('loginLink'),
        notice: document.getElementById('joinNotice'),
    };
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    let isSubmitting = false;

    function notice(message, isError = true) {
        elements.notice.textContent = message;
        elements.notice.classList.toggle('notice-error', isError);
        elements.notice.hidden = false;
    }

    async function request(body) {
        const response = await fetch('api/accept-invitation.php', {
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
        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'تعذر تنفيذ الطلب.');
        }
        return payload;
    }

    function dateText(value) {
        const parsed = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(parsed.getTime())
            ? value
            : new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
    }

    async function initialize() {
        if (!/^[a-f0-9]{64}$/.test(token)) {
            elements.loading.hidden = true;
            notice('رابط الدعوة غير صالح أو غير مكتمل.');
            return;
        }
        try {
            const payload = await request({ action: 'preview', token });
            const invite = payload.invitation;
            document.getElementById('inviteName').textContent = invite.fullname;
            document.getElementById('inviteUsername').textContent = invite.username;
            document.getElementById('inviteNetwork').textContent = invite.network_name || 'شبكة SAM';
            document.getElementById('inviteRole').textContent = invite.role_name || 'عضو';
            document.getElementById('inviteExpiry').textContent = dateText(invite.expires_at);
            elements.details.hidden = false;
        } catch (error) {
            notice(error instanceof Error ? error.message : 'تعذر التحقق من الدعوة.');
        } finally {
            elements.loading.hidden = true;
        }
    }

    elements.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        const values = new FormData(elements.form);
        const password = String(values.get('password') || '');
        const passwordConfirm = String(values.get('password_confirm') || '');
        const passwordBytes = new TextEncoder().encode(password).length;
        if (passwordBytes < 12 || passwordBytes > 72) {
            notice('يجب أن تتكون كلمة المرور من 12 إلى 72 بايتًا.');
            return;
        }
        if (password !== passwordConfirm) {
            notice('تأكيد كلمة المرور غير مطابق.');
            return;
        }
        isSubmitting = true;
        elements.acceptButton.disabled = true;
        try {
            const payload = await request({ action: 'accept', token, password, password_confirm: passwordConfirm });
            elements.details.hidden = true;
            elements.login.hidden = false;
            notice(`اكتمل الانضمام للحساب ${payload.username}. يمكنك الآن تسجيل الدخول.`, false);
        } catch (error) {
            notice(error instanceof Error ? error.message : 'تعذر إكمال الدعوة.');
            isSubmitting = false;
            elements.acceptButton.disabled = false;
        }
    });

    initialize();
})();
