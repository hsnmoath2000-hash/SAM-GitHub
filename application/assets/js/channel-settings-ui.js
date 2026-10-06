/* Visual enhancement for existing WhatsApp/Telegram settings and test actions. */
(function () {
  'use strict';
  const findCard = (selector) => {
    const el = document.querySelector(selector); if (!el) return null;
    let node = el; for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
      if (node.querySelector && node.querySelector('button')) return node;
    }
    return el.parentElement;
  };
  const addSecretToggle = (input) => {
    if (!input || input.dataset.secretToggle === '1') return;
    input.dataset.secretToggle = '1'; input.type = 'password';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'channel-secret-toggle'; button.textContent = 'إظهار';
    button.style.cssText = 'position:absolute; inset-inline-end:7px; top:29px; min-height:26px; padding:2px 7px; border:1px solid #d5e0e5; border-radius:6px; background:#f7fafb; color:#49616e; font-size:10px; cursor:pointer;';
    const parent = input.parentElement; parent.style.position = 'relative'; parent.appendChild(button);
    button.addEventListener('click', () => { const visible = input.type === 'text'; input.type = visible ? 'password' : 'text'; button.textContent = visible ? 'إظهار' : 'إخفاء'; });
  };
  const enhance = () => {
    const wa = findCard('#wa-qr-container'); const tg = findCard('#cfg-tg-token');
    if (wa) { wa.classList.add('channel-settings-card', 'wa-card'); wa.dataset.channelUi = '1'; }
    if (tg) { tg.classList.add('channel-settings-card', 'tg-card'); tg.dataset.channelUi = '1'; addSecretToggle(document.querySelector('#cfg-tg-token')); }
    if (wa && tg && wa.parentElement === tg.parentElement) wa.parentElement.classList.add('channel-settings-shell');
    document.querySelectorAll('#cfg-tg-token').forEach(addSecretToggle);
  };
  const boot = () => { setTimeout(enhance, 120); try { let timer; new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(enhance, 160); }).observe(document.body, { childList:true, subtree:true }); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
