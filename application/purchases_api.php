<?php
/**
 * purchases_api.php — نقطة نهاية واجهة برمجة إدارة المشتريات والموردين
 * SAM User Manager
 */

declare(strict_types=1);

// This endpoint is included by api.php after authentication and authorization.
// Refuse direct web execution to prevent the fallback admin identity from being used.
if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/PurchasesService.php';

if (!function_exists('getDB')) {
    function getDB(): PDO {
        static $db = null;
        if ($db === null) {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT ?? 3306, DB_NAME);
            $db = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT            => 10,
            ]);
        }
        return $db;
    }
}

if (!function_exists('jsonResponse')) {
    function jsonResponse($data, int $status = 200): void {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$purchasesAction = $_GET['action'] ?? $_POST['action'] ?? '';
$purchasesInput  = json_decode(file_get_contents('php://input'), true) ?: $_POST ?: $_GET;

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    @session_start();
}
$purchasesAdminId = (int)($_SESSION['admin_id'] ?? 0);
if ($purchasesAdminId <= 0) {
    jsonResponse(['success' => false, 'error' => 'AUTH_REQUIRED'], 401);
}

$purchasesService = new PurchasesService(getDB());

switch ($purchasesAction) {
    // ─── 1. SUPPLIERS ────────────────────────────────────────────────────────
    case 'get_suppliers':
        $search = (string)($purchasesInput['search'] ?? '');
        $activeOnly = !empty($purchasesInput['active_only']);
        jsonResponse(['success' => true, 'data' => $purchasesService->getSuppliers($search, $activeOnly)]);
        break;

    case 'post_supplier':
    case 'save_supplier':
        jsonResponse($purchasesService->saveSupplier((array)$purchasesInput, $purchasesAdminId));
        break;

    case 'delete_supplier':
        $id = (int)($purchasesInput['id'] ?? 0);
        jsonResponse($purchasesService->deleteSupplier($id));
        break;

    case 'get_supplier_statement':
        $id = (int)($purchasesInput['id'] ?? $purchasesInput['supplier_id'] ?? 0);
        $startDate = (string)($purchasesInput['start_date'] ?? '');
        $endDate = (string)($purchasesInput['end_date'] ?? '');
        jsonResponse($purchasesService->getSupplierStatement($id, $startDate, $endDate));
        break;

    // ─── 2. PURCHASES & INVOICES ─────────────────────────────────────────────
    case 'get_purchase_lookups':
        jsonResponse($purchasesService->getPurchaseLookups());
        break;

    case 'get_purchases_list':
        jsonResponse($purchasesService->listPurchaseInvoices((array)$purchasesInput));
        break;

    case 'get_purchase_details':
        $id = (int)($purchasesInput['id'] ?? 0);
        $details = $purchasesService->getPurchaseInvoiceDetails($id);
        if (!$details) {
            jsonResponse(['success' => false, 'error' => 'الفاتورة غير موجودة'], 404);
        }
        jsonResponse(['success' => true, 'data' => $details]);
        break;

    case 'post_purchase_invoice':
        jsonResponse($purchasesService->postPurchaseInvoice((array)$purchasesInput, $purchasesAdminId));
        break;

    case 'pay_supplier_invoice':
    case 'pay_supplier':
    case 'post_supplier_payment':
        jsonResponse($purchasesService->paySupplier((array)$purchasesInput, $purchasesAdminId));
        break;

    default:
        // Fallthrough
        break;
}
