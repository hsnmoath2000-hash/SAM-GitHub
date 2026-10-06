<?php

require_once __DIR__ . '/includes/InstantBalanceService.php';

$instantBalanceActions = [
    'instant_balance_summary',
    'instant_balance_warehouses',
    'instant_balance_grant',
    'instant_balance_transfer',
    'instant_balance_transfers',
    'instant_balance_sell',
    'instant_balance_issue_voucher',
    'instant_balance_sell_digital_voucher',
    'instant_balance_invoices',
    'instant_balance_resend_voucher',
    'instant_balance_refund_voucher',
];

if (in_array($action, $instantBalanceActions, true)) {
    try {
        $payload = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;
        $instant = new InstantBalanceService(getDB(), $service);
        switch ($action) {
            case 'instant_balance_summary':
                jsonResponse($instant->summary(!empty($payload['admin_id']) ? (int)$payload['admin_id'] : null));
            case 'instant_balance_warehouses':
                jsonResponse($instant->warehouses());
            case 'instant_balance_grant':
                jsonResponse($instant->grant($payload));
            case 'instant_balance_transfer':
                if (($payload['operation_type'] ?? '') === 'grant') {
                    jsonResponse($instant->grant($payload));
                }
                jsonResponse($instant->transfer($payload));
            case 'instant_balance_transfers':
                jsonResponse($instant->transfers($payload));
            case 'instant_balance_sell':
                jsonResponse($instant->sellBalance($payload));
            case 'instant_balance_issue_voucher':
            case 'instant_balance_sell_digital_voucher':
                jsonResponse($instant->issueVoucher($payload));
            case 'instant_balance_invoices':
                jsonResponse($instant->invoices($payload));
            case 'instant_balance_resend_voucher':
                jsonResponse($instant->resendVoucher((int)($payload['invoice_id'] ?? 0)));
            case 'instant_balance_refund_voucher':
                jsonResponse($instant->refundFailedVoucher((int)($payload['invoice_id'] ?? 0)));
        }
    } catch (Throwable $e) {
        $isSessionError = str_contains($e->getMessage(), 'جلسة الدخول');
        error_log('Instant balance [' . $action . ']: ' . $e->getMessage());
        jsonResponse(['success' => false, 'error' => $e->getMessage()], $isSessionError ? 401 : 400);
    }
}
