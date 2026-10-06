Bottom Navigation (sam-bottom-nav) — README

Purpose
- Centralize mobile bottom navigation and allow modules to intercept actions.

APIs
- Dispatch event: `document.dispatchEvent(new CustomEvent('sam-bottom-nav', { detail: { action: 'your_action', filter: <optional>, view: <optional> } }));`
- Register handler: `App.registerBottomNavHandler(moduleName, handler)` — `handler(action, ev)` should return `true` to claim the action.
- Unregister handler: `App.unregisterBottomNavHandler(moduleName)`
- Re-register all saved handlers (useful after lazy-load): `App.reRegisterAllBottomNavHandlers()`
- Legacy: `App.onBottomNav(handler)` still works but prefer `registerBottomNavHandler` for lazy modules.

Best practices
- In lazy-loaded modules call `App.registerBottomNavHandler('mod-name', handler)` when the module initializes.
- If your module may be loaded/unloaded, call `App.unregisterBottomNavHandler('mod-name')` on cleanup.
- After dynamic module loads (router navigation), call `App.reRegisterAllBottomNavHandlers()` to ensure handlers are attached.

Payload conventions
- `detail.action`: short string key (e.g. `cashbox_accounts`, `whatsapp_manager`, `batch_gen`).
- Optional: `detail.filter` or `detail.view` for prefiltering module state before navigating.

Examples
- Emit a bottom-nav action:

  document.dispatchEvent(new CustomEvent('sam-bottom-nav', { detail: { action: 'cashbox_accounts', filter: 42 } }));

- Register a handler in a module's init:

  App.registerBottomNavHandler('finance-accounting', function(action, ev){
    if(action === 'cashbox_accounts'){
      if(ev?.detail?.filter) App.cashboxAccountFilter = ev.detail.filter;
      App.switchTab('cashbox_accounts');
      return true;
    }
    return false;
  });
