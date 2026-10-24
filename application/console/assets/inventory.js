(() => {
    'use strict';

    const elements = {
        body: document.getElementById('inventoryBody'),
        cancelTransferApproval: document.getElementById('cancelTransferApproval'),
        confirmTransferApproval: document.getElementById('confirmTransferApproval'),
        createInventoryButton: document.getElementById('createInventoryButton'),
        explainer: document.getElementById('viewExplainer'),
        head: document.getElementById('inventoryHead'),
        loading: document.getElementById('loadingState'),
        tableLoading: document.getElementById('tableLoading'),
        empty: document.getElementById('tableEmpty'),
        menuButton: document.getElementById('menuButton'),
        networkSelect: document.getElementById('networkSelect'),
        next: document.getElementById('nextPage'),
        notice: document.getElementById('pageNotice'),
        pageStatus: document.getElementById('pageStatus'),
        panel: document.getElementById('inventoryPanel'),
        previous: document.getElementById('previousPage'),
        refresh: document.getElementById('refreshButton'),
        search: document.getElementById('searchInput'),
        selectedNetwork: document.getElementById('selectedNetworkName'),
        sidebar: document.getElementById('sidebar'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        tabs: Array.from(document.querySelectorAll('.member-tab')),
        updatedAt: document.getElementById('updatedAt'),
        workspace: document.getElementById('inventoryWorkspace'),
        transferQuoteDialog: document.getElementById('transferQuoteDialog'),
        transferQuoteSummary: document.getElementById('transferQuoteSummary'),
        transferQuoteError: document.getElementById('transferQuoteError'),
        quoteCardsCount: document.getElementById('quoteCardsCount'),
        quoteDistributionValue: document.getElementById('quoteDistributionValue'),
        quotePurchaseCost: document.getElementById('quotePurchaseCost'),
        quoteRetailValue: document.getElementById('quoteRetailValue'),
        previousValueRow: document.getElementById('previousValueRow'),
        quotePreviousValue: document.getElementById('quotePreviousValue'),
        startInventoryDialog: document.getElementById('startInventoryDialog'),
        startInventoryForm: document.getElementById('startInventoryForm'),
        inventoryDateInput: document.getElementById('inventoryDateInput'),
        inventoryNotesInput: document.getElementById('inventoryNotesInput'),
        startInventoryError: document.getElementById('startInventoryError'),
        submitStartInventory: document.getElementById('submitStartInventory'),
        cancelStartInventory: document.getElementById('cancelStartInventory'),
        inventoryLinesDialog: document.getElementById('inventoryLinesDialog'),
        inventoryLinesTitle: document.getElementById('inventoryLinesTitle'),
        inventoryLinesSummary: document.getElementById('inventoryLinesSummary'),
        inventoryLinesBody: document.getElementById('inventoryLinesBody'),
        inventoryLinesError: document.getElementById('inventoryLinesError'),
        inventoryPostWarning: document.getElementById('inventoryPostWarning'),
        inventoryAdjustmentTypeWrap: document.getElementById('inventoryAdjustmentTypeWrap'),
        inventoryAdjustmentType: document.getElementById('inventoryAdjustmentType'),
        saveInventoryDraft: document.getElementById('saveInventoryDraft'),
        postInventoryButton: document.getElementById('postInventoryButton'),
        closeInventoryLines: document.getElementById('closeInventoryLines'),
    };

    const state = {
        view: 'stock', page: 1, total: 0, networkId: '', requestId: 0, actorId: 0, role: '',
        canApproveTransfers: false, canDraftInventory: false, canPostInventory: false,
        transferQuote: null, inventory: null, inventoryRequestKey: '',
    };
    const numberFormat = new Intl.NumberFormat('ar-YE');
    const labels = {
        status: { draft: 'مسودة', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', pending_approval: 'بانتظار الاعتماد', posted: 'مرحّل', rejected: 'مرفوض' },
        adjustment: { deficit: 'عجز', surplus: 'زيادة', damaged: 'تالف', lost: 'مفقود', correction: 'تصحيح' },
        transfer: { transfer: 'تحويل', return: 'إرجاع', adjustment: 'تسوية', sale: 'بيع', sale_return: 'استرجاع بيع' },
    };
    const descriptions = {
        stock: 'إجمالي الكروت ومتاحها وحالتها حسب صاحب الرصيد والملف. لا تُعرض أسماء دخول الكروت أو كلمات المرور أو بيانات المشترين.',
        inventories: 'سجلات الجرد المسجلة في المستودعات الواقعة ضمن نطاق صلاحيتك.',
        adjustments: 'التسويات المسجلة وحالتها؛ لا يمكن اعتمادها أو ترحيلها من هذه الصفحة.',
        transfers: 'حركة تحويل الكروت بين الحسابات وحالتها، ضمن نطاق صلاحيات الشبكة والحساب.',
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
            : new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(parsed);
    }

    function queryUrl(view) {
        const query = new URLSearchParams({
            view,
            page: String(state.page),
            search: elements.search.value.trim(),
        });
        if (state.networkId) query.set('network_id', state.networkId);
        return `api/inventory.php?${query.toString()}`;
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
        if (state.view === 'stock') {
            return [
                cell(record.owner_name || record.owner_username),
                cell(record.profile_name),
                cell(number(record.total_cards)),
                cell(number(record.available_cards)),
                cell(number(record.sold_cards)),
                cell(number(record.used_cards)),
                cell(number(record.expired_cards)),
                cell(number(record.disabled_cards)),
                cell(number(record.free_cards)),
            ];
        }
        if (state.view === 'inventories') {
            const cells = [
                cell(record.inventory_no, 'mono-cell'),
                cell(record.warehouse_name || record.warehouse_username),
                cell(date(record.inventory_date)),
                cell(labels.status[record.status] || record.status),
                cell(number(record.total_book_cards)),
                cell(number(record.total_actual_cards)),
                cell(number(record.total_variance_cards)),
                cell(date(record.created_at)),
            ];
            if (state.canDraftInventory || state.canPostInventory) {
                const action = document.createElement('td');
                const button = document.createElement('button');
                button.className = 'page-button';
                button.type = 'button';
                button.textContent = 'تفاصيل الجرد';
                button.addEventListener('click', () => openInventory(record));
                action.append(button);
                cells.push(action);
            }
            return cells;
        }
        if (state.view === 'adjustments') {
            return [
                cell(record.adjustment_no, 'mono-cell'),
                cell(record.warehouse_name || record.warehouse_username),
                cell(labels.adjustment[record.adjustment_type] || record.adjustment_type),
                cell(labels.status[record.status] || record.status),
                cell(number(record.total_cards)),
                cell(Number(record.is_immutable) === 1 ? 'نعم' : 'لا'),
                cell(date(record.created_at)),
            ];
        }
        const transferCells = [
            cell(record.transfer_no, 'mono-cell'),
            cell(labels.transfer[record.transfer_type] || record.transfer_type),
            cell(`${record.sender_name || '—'} ← ${record.receiver_name || '—'}`),
            cell(record.profile_name),
            cell(number(record.cards_count)),
            cell(labels.status[record.status] || record.status),
            cell(date(record.created_at)),
        ];
        if (state.canApproveTransfers) {
            const manager = ['system_owner', 'superadmin', 'network_manager', 'admin', 'admin2'].includes(state.role);
            const eligible = ['draft', 'pending_approval'].includes(record.status)
                && ['transfer', 'return'].includes(record.transfer_type)
                && (manager || Number(record.receiver_admin_id) === state.actorId);
            if (eligible) {
                const actionCell = document.createElement('td');
                const button = document.createElement('button');
                button.className = 'page-button transfer-approve-button';
                button.type = 'button';
                button.dataset.transferId = String(record.id);
                button.textContent = 'معاينة الاعتماد';
                button.addEventListener('click', () => prepareTransferApproval(record, button));
                actionCell.append(button);
                transferCells.push(actionCell);
            } else {
                transferCells.push(cell('—'));
            }
        }
        return transferCells;
    }

    function render(payload) {
        state.total = Number(payload.total || 0);
        const headingsByView = {
            stock: ['صاحب المخزون', 'الملف', 'الإجمالي', 'المتاح', 'المباع', 'المستخدم', 'المنتهي', 'المعطّل', 'حصة مجانية'],
            inventories: ['رقم الجرد', 'المستودع', 'تاريخ الجرد', 'الحالة', 'رصيد الدفاتر', 'الفعلي', 'الفارق', 'تاريخ الإنشاء', ...(state.canDraftInventory || state.canPostInventory ? ['إجراء'] : [])],
            adjustments: ['رقم التسوية', 'المستودع', 'النوع', 'الحالة', 'عدد الكروت', 'مقفلة', 'تاريخ الإنشاء'],
            transfers: ['رقم الحركة', 'النوع', 'من ← إلى', 'الملف', 'عدد الكروت', 'الحالة', 'تاريخ الحركة', ...(state.canApproveTransfers ? ['إجراء'] : [])],
        };
        const header = document.createElement('tr');
        headingsByView[state.view].forEach((heading) => header.append(cell(heading)));
        elements.head.replaceChildren(header);
        const rows = (payload.data || []).map((record) => {
            const row = document.createElement('tr');
            renderRow(record).forEach((item) => row.append(item));
            return row;
        });
        elements.body.replaceChildren(...rows);
        elements.empty.textContent = state.view === 'stock'
            ? 'لا يوجد مخزون كروت ضمن نطاقك.'
            : 'لا توجد سجلات مطابقة ضمن نطاقك.';
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
            const payload = await request(queryUrl(state.view));
            if (!payload || requestId !== state.requestId) return false;
            render(payload);
            return true;
        } catch (error) {
            if (requestId === state.requestId) showNotice(error.message || 'تعذر تحميل سجلات المخزون.');
            return false;
        } finally {
            if (requestId === state.requestId) elements.tableLoading.hidden = true;
        }
    }

    async function initialize() {
        try {
            const query = new URLSearchParams({ view: 'bootstrap' });
            const bootstrap = await request(`api/inventory.php?${query.toString()}`);
            if (!bootstrap) return;
            elements.loading.hidden = true;
            elements.selectedNetwork.textContent = bootstrap.network.name || bootstrap.network.code || 'الشبكة';
            state.actorId = Number(bootstrap.actor.id || 0);
            state.role = String(bootstrap.actor.role || '');
            state.canApproveTransfers = Boolean(bootstrap.access.transfer_approval);
            state.canDraftInventory = Boolean(bootstrap.access.inventory_draft);
            state.canPostInventory = Boolean(bootstrap.access.inventory_post);
            elements.createInventoryButton.hidden = !state.canDraftInventory;
            document.getElementById('userName').textContent = bootstrap.actor.name || 'مستخدم SAM';
            document.getElementById('userRole').textContent = bootstrap.actor.role || 'حساب';
            document.getElementById('userAvatar').textContent = (bootstrap.actor.name || 'س').trim().charAt(0);
            renderNetworks(bootstrap.networks || [], bootstrap.network.id);
            state.networkId = String(bootstrap.network.id || '');
            if (!bootstrap.access.inventory) {
                showNotice('ليس لحسابك صلاحية عرض مخزون الكروت.');
                return;
            }
            elements.workspace.hidden = false;
            await load();
        } catch (error) {
            elements.loading.hidden = true;
            showNotice(error.message || 'تعذر التحقق من صلاحيات الوصول.');
        }
    }

    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount)
            ? `${new Intl.NumberFormat('ar-YE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ر.ي`
            : String(value || '—');
    }

    function transferError(code) {
        const messages = {
            QUOTE_CHANGED: 'تغيّرت بيانات التحويل أو انتهت المعاينة. أعد فتح المعاينة وراجع القيمة.',
            CREDIT_LIMIT_EXCEEDED: 'سيؤدي التحويل إلى تجاوز الحد الائتماني للمستلم.',
            TRANSFER_STALE: 'تغيّرت الكروت أو بيانات التحويل. حدّث القائمة قبل إعادة المحاولة.',
            CHART_ACCOUNT_INVALID: 'تعذر الترحيل؛ تحقق من حسابات المخزون والعهد.',
            IMMUTABLE_RECORD: 'المستند مقفل أو له أثر مالي ولا يمكن اعتماده مرة أخرى.',
            POSTED_TRANSFER_INCOMPLETE: 'التحويل المرحّل يحتاج مراجعة محاسبية.',
            SALES_INVOICE_REQUIRED: 'هذا الإجراء مخصص للتحويلات والإرجاعات فقط.',
            FORBIDDEN_SCOPE: 'التحويل خارج نطاق صلاحيتك أو ليس موجّهًا إليك.',
            FORBIDDEN_NETWORK: 'التحويل لا يتبع الشبكة النشطة.',
            FORBIDDEN: 'لا تملك صلاحية اعتماد هذا التحويل.',
            TRANSFER_BATCH_REQUIRED: 'التحويل كبير أو غير صالح للاعتماد من هذه العملية.',
            DISTRIBUTION_PRICE_REQUIRED: 'لا يوجد سعر توزيع صالح لهذا الملف.',
            INVALID_SHEETS: 'بيانات أوراق التحويل غير صالحة.',
            MONEY_RANGE: 'إحدى القيم المالية خارج النطاق المسموح.',
            SAME_WAREHOUSE: 'لا يمكن اعتماد تحويل بين الحساب نفسه.',
        };
        return messages[code] || code || 'تعذر تنفيذ اعتماد التحويل.';
    }

    async function transferRequest(action, transferId, networkId, payload = null) {
        const query = new URLSearchParams({ action });
        const method = payload ? 'POST' : 'GET';
        if (!payload) query.set('transfer_id', String(transferId));
        const headers = {
            Accept: 'application/json',
            'X-SAM-Network-ID': String(networkId),
        };
        const options = { method, credentials: 'same-origin', headers, cache: 'no-store' };
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['X-SAM-Request'] = 'XMLHttpRequest';
            options.body = JSON.stringify(payload);
        }
        const response = await fetch(`../api.php?${query.toString()}`, options);
        const result = await response.json();
        if (response.status === 401) {
            window.location.replace('../login.html');
            return null;
        }
        if (!response.ok || !result.success) {
            throw new Error(transferError(result.error));
        }
        return result;
    }

    async function prepareTransferApproval(record, button) {
        const networkId = state.networkId;
        button.disabled = true;
        try {
            const quote = await transferRequest('get_stock_transfer_quote', record.id, networkId);
            if (!quote || networkId !== state.networkId) return;
            state.transferQuote = { quote, record, networkId };
            elements.transferQuoteError.hidden = true;
            elements.transferQuoteSummary.textContent = `${record.transfer_no} — ${labels.transfer[record.transfer_type] || record.transfer_type}: ${record.sender_name || '—'} ← ${record.receiver_name || '—'}`;
            elements.quoteCardsCount.textContent = number(quote.cards_count);
            elements.quoteDistributionValue.textContent = formatMoney(quote.distribution_value);
            elements.quotePurchaseCost.textContent = formatMoney(quote.purchase_cost);
            elements.quoteRetailValue.textContent = formatMoney(quote.retail_value);
            const valueChanged = Number(quote.previous_document_value) !== Number(quote.distribution_value);
            elements.previousValueRow.hidden = !valueChanged;
            elements.quotePreviousValue.textContent = formatMoney(quote.previous_document_value);
            elements.transferQuoteDialog.showModal();
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'تعذر تحميل معاينة الاعتماد.');
        } finally {
            button.disabled = false;
        }
    }

    async function confirmTransferApproval() {
        const context = state.transferQuote;
        if (!context || context.networkId !== state.networkId) {
            elements.transferQuoteError.textContent = 'تغيرت الشبكة النشطة. أغلق المعاينة وافتحها من جديد.';
            elements.transferQuoteError.hidden = false;
            return;
        }
        elements.confirmTransferApproval.disabled = true;
        elements.transferQuoteError.hidden = true;
        try {
            const result = await transferRequest('approve_stock_transfer', context.record.id, context.networkId, {
                transfer_id: Number(context.record.id),
                quote_token: context.quote.quote_token,
                expected_total_value: String(context.quote.distribution_value),
            });
            if (!result) return;
            elements.transferQuoteDialog.close();
            state.transferQuote = null;
            const refreshed = await load();
            if (refreshed) {
                elements.notice.textContent = result.message || `تم اعتماد التحويل ${result.transfer_no || ''}.`;
                elements.notice.classList.remove('notice-error');
                elements.notice.hidden = false;
            } else {
                showNotice('تم اعتماد التحويل، لكن تعذر تحديث القائمة. أعد تحميلها يدويًا.');
            }
        } catch (error) {
            elements.transferQuoteError.textContent = error instanceof Error ? error.message : 'تعذر اعتماد التحويل.';
            elements.transferQuoteError.hidden = false;
        } finally {
            elements.confirmTransferApproval.disabled = false;
        }
    }

    elements.cancelTransferApproval.addEventListener('click', () => {
        elements.transferQuoteDialog.close();
        state.transferQuote = null;
    });
    elements.transferQuoteDialog.addEventListener('close', () => {
        state.transferQuote = null;
    });
    elements.confirmTransferApproval.addEventListener('click', confirmTransferApproval);

    function operationError(code) {
        const messages = {
            INVENTORY_LOCKED: 'محضر الجرد مقفل ولا يمكن تعديله.',
            INVENTORY_STALE: 'تغيّر المخزون منذ بدء الجرد؛ لا يمكن ترحيل هذا المحضر.',
            SURPLUS_REQUIRES_CARD_IMPORT: 'الفائض لا يُرحّل تلقائيًا؛ سجّل الكروت الفعلية في النظام ثم ابدأ جردًا جديدًا.',
            POSTED_INVENTORY_INCOMPLETE: 'المحضر المكتمل يحتاج مراجعة تسوية أو قيد محاسبي.',
            POSTING_BATCH_REQUIRED: 'المحضر يتجاوز حد الترحيل المباشر؛ اطلب معالجته على دفعات.',
            CHART_ACCOUNT_INVALID: 'تحقق من حساب المخزون وحساب عجز المخزون في دليل الحسابات.',
            FORBIDDEN_SCOPE: 'هذا الجرد خارج نطاق حسابك.',
            FORBIDDEN_NETWORK: 'الجرد خارج الشبكة النشطة.',
            FORBIDDEN: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
            INVALID_COUNT: 'أدخل أعدادًا صحيحة غير سالبة ضمن الحد المسموح.',
            INVALID_LINES: 'تعذر حفظ تفاصيل الجرد؛ حدّث المحضر وحاول مرة أخرى.',
            INVALID_LINE_ID: 'يوجد سطر مكرر أو غير صالح في المحضر.',
        };
        return messages[code] || code || 'تعذر تنفيذ عملية الجرد.';
    }

    async function operationRequest(action, payload, networkId = state.networkId) {
        const response = await fetch(`../api.php?action=${encodeURIComponent(action)}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-SAM-Request': 'XMLHttpRequest',
                'X-SAM-Network-ID': String(networkId),
            },
            cache: 'no-store',
            body: JSON.stringify({ ...payload, network_id: Number(networkId) }),
        });
        const result = await response.json();
        if (response.status === 401) {
            window.location.replace('../login.html');
            return null;
        }
        if (!response.ok || !result.success) throw new Error(operationError(result.error));
        return result;
    }

    async function getInventoryDetails(inventoryId, networkId = state.networkId) {
        const query = new URLSearchParams({
            action: 'get_stock_inventory_details',
            inventory_id: String(inventoryId),
            limit: '500',
        });
        const response = await fetch(`../api.php?${query.toString()}`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-SAM-Network-ID': String(networkId) },
            cache: 'no-store',
        });
        const result = await response.json();
        if (response.status === 401) {
            window.location.replace('../login.html');
            return null;
        }
        if (!response.ok || !result.success || !result.data) {
            throw new Error(operationError(result.error));
        }
        if (result.has_more) throw new Error('هذا المحضر يتجاوز 500 صنف؛ لا يمكن تحريره كاملًا من هذه الواجهة.');
        return result.data;
    }

    function renderInventoryLines(inventory) {
        state.inventory = inventory;
        const editable = state.canDraftInventory && ['draft', 'in_progress'].includes(inventory.status);
        const lines = Array.isArray(inventory.lines) ? inventory.lines : [];
        elements.inventoryLinesBody.replaceChildren();
        let varianceTotal = 0;
        lines.forEach((line) => {
            const bookCards = Number(line.book_cards_count || 0);
            const bookSheets = Number(line.book_sheets_count || 0);
            const actualCards = line.actual_cards_count === null ? bookCards : Number(line.actual_cards_count || 0);
            const actualSheets = line.actual_sheets_count === null ? bookSheets : Number(line.actual_sheets_count || 0);
            const variance = actualCards - bookCards;
            varianceTotal += variance;
            const row = document.createElement('tr');
            row.dataset.lineId = String(line.id);
            row.dataset.bookCards = String(bookCards);
            row.dataset.costPrice = String(Number(line.cost_price || 0));
            const profile = document.createElement('td');
            profile.textContent = line.profile_name || '—';
            row.append(profile, cell(number(bookCards)));
            const actualCardsCell = document.createElement('td');
            const actualCardsInput = document.createElement('input');
            actualCardsInput.className = 'inventory-line-input';
            actualCardsInput.type = 'number';
            actualCardsInput.min = '0';
            actualCardsInput.max = '999999999';
            actualCardsInput.step = '1';
            actualCardsInput.value = String(actualCards);
            actualCardsInput.disabled = !editable;
            actualCardsCell.append(actualCardsInput);
            const actualSheetsCell = document.createElement('td');
            const actualSheetsInput = document.createElement('input');
            actualSheetsInput.className = 'inventory-line-input';
            actualSheetsInput.type = 'number';
            actualSheetsInput.min = '0';
            actualSheetsInput.max = '999999999';
            actualSheetsInput.step = '1';
            actualSheetsInput.value = String(actualSheets);
            actualSheetsInput.disabled = !editable;
            actualSheetsCell.append(actualSheetsInput);
            const varianceCell = cell(number(variance));
            row.append(actualCardsCell, actualSheetsCell, varianceCell);
            const estimatedCost = variance * Number(line.cost_price || 0);
            const estimatedCostCell = cell(formatMoney(estimatedCost));
            row.append(estimatedCostCell);
            actualCardsInput.addEventListener('input', () => {
                const currentVariance = Number(actualCardsInput.value || 0) - bookCards;
                varianceCell.textContent = number(currentVariance);
                estimatedCostCell.textContent = formatMoney(currentVariance * Number(row.dataset.costPrice || 0));
                const anyShortage = Array.from(elements.inventoryLinesBody.querySelectorAll('tr[data-line-id]'))
                    .some((item) => Number(item.querySelectorAll('input[type="number"]')[0]?.value || 0) < Number(item.dataset.bookCards || 0));
                elements.inventoryAdjustmentTypeWrap.hidden = !editable || !state.canPostInventory || !anyShortage;
            });
            const notesCell = document.createElement('td');
            if (editable) {
                const notes = document.createElement('input');
                notes.className = 'inventory-line-input inventory-line-note';
                notes.type = 'text';
                notes.maxLength = 255;
                notes.value = line.notes || '';
                notesCell.append(notes);
            } else {
                notesCell.textContent = line.notes || '—';
            }
            row.append(notesCell);
            elements.inventoryLinesBody.append(row);
        });
        const savedVariance = Number(inventory.total_variance_cards || varianceTotal);
        elements.inventoryLinesTitle.textContent = `محضر ${inventory.inventory_no || inventory.id}`;
        elements.inventoryLinesSummary.textContent = `${inventory.warehouse_name || inventory.warehouse_username || 'المستودع'} — ${labels.status[inventory.status] || inventory.status} — الدفتري ${number(inventory.total_book_cards)} / الفعلي ${number(inventory.total_actual_cards)} / الفارق ${number(savedVariance)}`;
        elements.inventoryLinesError.hidden = true;
        elements.inventoryLinesError.textContent = '';
        elements.inventoryPostWarning.hidden = !editable || !state.canPostInventory;
        elements.saveInventoryDraft.hidden = !editable;
        elements.postInventoryButton.hidden = !editable || !state.canPostInventory;
        elements.postInventoryButton.disabled = false;
        elements.inventoryAdjustmentTypeWrap.hidden = !editable || !state.canPostInventory
            || !lines.some((line) => Number(line.actual_cards_count ?? line.book_cards_count) < Number(line.book_cards_count));
        elements.inventoryAdjustmentType.value = 'deficit';
        if (!elements.inventoryLinesDialog.open) elements.inventoryLinesDialog.showModal();
    }

    async function openInventory(record) {
        const networkId = state.networkId;
        try {
            const inventory = await getInventoryDetails(record.id, networkId);
            if (inventory && networkId === state.networkId) renderInventoryLines(inventory);
        } catch (error) {
            showNotice(error instanceof Error ? error.message : 'تعذر تحميل تفاصيل الجرد.');
        }
    }

    elements.createInventoryButton.addEventListener('click', () => {
        elements.startInventoryForm.reset();
        const today = new Date();
        elements.inventoryDateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        elements.startInventoryError.hidden = true;
        elements.startInventoryDialog.showModal();
    });
    elements.cancelStartInventory.addEventListener('click', () => elements.startInventoryDialog.close());
    elements.startInventoryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!state.canDraftInventory || !state.actorId) return;
        elements.submitStartInventory.disabled = true;
        elements.startInventoryError.hidden = true;
        try {
            state.inventoryRequestKey ||= (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const result = await operationRequest('start_stock_inventory', {
                warehouse_admin_id: state.actorId,
                inventory_date: elements.inventoryDateInput.value,
                notes: elements.inventoryNotesInput.value.trim(),
                request_key: state.inventoryRequestKey,
            });
            if (!result) return;
            state.inventoryRequestKey = '';
            elements.startInventoryDialog.close();
            state.view = 'inventories';
            state.page = 1;
            elements.tabs.find((tab) => tab.dataset.view === 'inventories')?.click();
            const record = { id: result.inventory_id };
            await openInventory(record);
            if (result.replayed) showNotice('تم العثور على مسودة الجرد السابقة وإعادة فتحها.');
        } catch (error) {
            elements.startInventoryError.textContent = error instanceof Error ? error.message : 'تعذر بدء الجرد.';
            elements.startInventoryError.hidden = false;
        } finally {
            elements.submitStartInventory.disabled = false;
        }
    });

    async function saveInventory() {
        const inventory = state.inventory;
        if (!inventory) return false;
        const lines = [];
        for (const row of elements.inventoryLinesBody.querySelectorAll('tr[data-line-id]')) {
            const cardsInput = row.querySelector('input[type="number"]');
            const sheetsInput = row.querySelectorAll('input[type="number"]')[1];
            const cards = Number(cardsInput.value);
            const sheets = Number(sheetsInput.value);
            if (!Number.isInteger(cards) || cards < 0 || cards > 999999999
                || !Number.isInteger(sheets) || sheets < 0 || sheets > 999999999) {
                throw new Error(operationError('INVALID_COUNT'));
            }
            lines.push({
                id: Number(row.dataset.lineId),
                actual_cards_count: cards,
                actual_sheets_count: sheets,
                notes: row.querySelector('.inventory-line-note')?.value.trim() || '',
            });
        }
        if (lines.length > 500) throw new Error(operationError('INVALID_LINES'));
        await operationRequest('save_stock_inventory', { inventory_id: Number(inventory.id), lines });
        return true;
    }

    elements.saveInventoryDraft.addEventListener('click', async () => {
        elements.saveInventoryDraft.disabled = true;
        try {
            await saveInventory();
            const refreshed = await getInventoryDetails(state.inventory.id);
            if (refreshed) renderInventoryLines(refreshed);
            elements.notice.textContent = 'حُفظت مسودة الجرد دون تغيير الكروت أو القيود المالية.';
            elements.notice.classList.remove('notice-error');
            elements.notice.hidden = false;
        } catch (error) {
            elements.inventoryLinesError.textContent = error instanceof Error ? error.message : 'تعذر حفظ مسودة الجرد.';
            elements.inventoryLinesError.hidden = false;
        } finally {
            elements.saveInventoryDraft.disabled = false;
        }
    });

    elements.postInventoryButton.addEventListener('click', async () => {
        const positiveVariance = Array.from(elements.inventoryLinesBody.querySelectorAll('tr[data-line-id]'))
            .some((row) => Number(row.querySelectorAll('input[type="number"]')[0]?.value || 0) > Number(row.dataset.bookCards || 0));
        if (positiveVariance) {
            elements.inventoryLinesError.textContent = operationError('SURPLUS_REQUIRES_CARD_IMPORT');
            elements.inventoryLinesError.hidden = false;
            return;
        }
        const shortage = Array.from(elements.inventoryLinesBody.querySelectorAll('tr[data-line-id]'))
            .reduce((total, row) => total + Math.max(0, Number(row.dataset.bookCards || 0)
                - Number(row.querySelectorAll('input[type="number"]')[0]?.value || 0)), 0);
        if (shortage > 5000) {
            elements.inventoryLinesError.textContent = operationError('POSTING_BATCH_REQUIRED');
            elements.inventoryLinesError.hidden = false;
            return;
        }
        const message = 'تأكيد ترحيل الجرد نهائيًا؟ عند وجود عجز، ستُعطّل خدمة SAM أقدم الكروت المؤهلة غير المستخدمة، وتُرحّل تكلفة الشراء الفعلية كقيد خسارة. سيُقفل المحضر ولا يمكن تعديله. تابع فقط بعد مطابقة العد الميداني.';
        if (!window.confirm(message)) return;
        elements.postInventoryButton.disabled = true;
        elements.inventoryLinesError.hidden = true;
        try {
            await saveInventory();
            const result = await operationRequest('post_stock_inventory_adjustment', {
                inventory_id: Number(state.inventory.id),
                adjustment_type: elements.inventoryAdjustmentType.value,
            });
            if (!result) return;
            elements.inventoryLinesDialog.close();
            state.inventory = null;
            const refreshed = await load();
            if (refreshed) {
                elements.notice.textContent = result.message || 'تم ترحيل الجرد وإقفاله.';
                elements.notice.classList.remove('notice-error');
                elements.notice.hidden = false;
            } else {
                showNotice('تم ترحيل الجرد، لكن تعذر تحديث القائمة. أعد تحميلها يدويًا.');
            }
        } catch (error) {
            elements.inventoryLinesError.textContent = error instanceof Error ? error.message : 'تعذر ترحيل الجرد.';
            elements.inventoryLinesError.hidden = false;
        } finally {
            elements.postInventoryButton.disabled = false;
        }
    });
    elements.closeInventoryLines.addEventListener('click', () => {
        elements.inventoryLinesDialog.close();
        state.inventory = null;
    });
    elements.inventoryLinesDialog.addEventListener('close', () => {
        state.inventory = null;
    });

    elements.tabs.forEach((tab) => tab.addEventListener('click', () => {
        state.view = tab.dataset.view;
        state.page = 1;
        elements.tabs.forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        elements.panel.setAttribute('aria-labelledby', tab.id || '');
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
