/* SAM UI adapters — connect legacy module state to the canonical SamUI layer. */
(function (window) {
  'use strict';
  const App = window.App;
  const U = window.SamUI;
  if (!App || !U) return;
  const schemas = {
    sales: { salesSearch:'text', salesBuyerFilter:'text', salesProfileFilter:'text', salesPayStatusFilter:'text', salesPayMethodFilter:'text', salesStartDate:'date', salesEndDate:'date', salesPage:'number', salesLimit:'number' },
    users: { usersPage:'number', usersLimit:'number' },
    cashbox: { cashboxSearch:'text', cashboxAccountFilter:'text', cashboxTxTypeFilter:'text', cashboxStartDate:'date', cashboxEndDate:'date' },
    vouchers: { vouchersSearch:'text', vouchersTypeFilter:'text', vouchersPartyFilter:'text', vouchersMethodFilter:'text', vouchersCategoryFilter:'text', vouchersStartDate:'date', vouchersEndDate:'date', vouchersPage:'number', vouchersLimit:'number' },
    assets: { assetsSearch:'text', assetsCategoryFilter:'text', assetsStatusFilter:'text', assetsNodeFilter:'text', assetsRouterFilter:'text', assetsUserFilter:'text' }
  };
  function sync(name) {
    const schema = schemas[name];
    if (!schema) return {};
    const state = {};
    Object.keys(schema).forEach(key => { state[key] = App[key]; });
    const normalized = U.normalizeFilters(state, schema);
    Object.keys(normalized).forEach(key => { App[key] = normalized[key]; });
    return normalized;
  }
  App.samUIState = Object.freeze({ schemas, sync });
  const wrap = (method, module) => {
    if (typeof App[method] !== 'function' || App[method].__samUIWrapped) return;
    const original = App[method];
    const wrapped = function (...args) { sync(module); return original.apply(this, args); };
    wrapped.__samUIWrapped = true;
    App[method] = wrapped;
  };
  [['renderSales','sales'], ['renderCashbox','cashbox'], ['renderVouchersFin','vouchers'], ['renderUsers','users'], ['renderAssets','assets']].forEach(([m, n]) => wrap(m, n));
  ['filterRoutersTable', 'filterChartOfAccounts', 'filterCostCentersGrid'].forEach(method => {
    if (typeof App[method] !== 'function' || App[method].__samUITextWrapped) return;
    const original = App[method];
    const wrapped = function (query, ...args) { return original.call(this, U.normalizeText(query), ...args); };
    wrapped.__samUITextWrapped = true;
    App[method] = wrapped;
  });
  App.exportRowsWithSamUI = function (rows, columns, filename) {
    return U.exportCsv(Array.isArray(rows) ? rows : [], columns || [], filename || 'sam-export.csv');
  };
  App.paginateWithSamUI = function (rows, page, limit) { return U.paginate(Array.isArray(rows) ? rows : [], page, limit); };
})(window);
