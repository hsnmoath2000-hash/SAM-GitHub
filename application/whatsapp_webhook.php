<?php
declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/MessageQueueManager.php';
require_once __DIR__ . '/includes/ChatbotService.php';
require_once __DIR__ . '/includes/WhatsAppService.php';

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true) ?: $_POST;

if (!$input) {
    echo json_encode(["status" => "no_data"]);
    exit;
}

$phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? $input['from'] ?? ''));
$messageText = trim((string)($input['message'] ?? $input['body'] ?? $input['text']['body'] ?? ''));

if (empty($phone) || empty($messageText)) {
    echo json_encode(["status" => "invalid_payload"]);
    exit;
}

try {
    $db = getDB();
    $chatbot = new ChatbotService($db);
    $res = $chatbot->handleMessage($messageText, $phone, 'whatsapp');

    $replyMessage = $res['response'] ?? ($res['reply'] ?? null);

    if (!empty($replyMessage) && !empty($res['handled'])) {
        if (class_exists('WhatsAppService')) {
            $ws = new WhatsAppService($db);
            $ws->sendDirectMessage($phone, $replyMessage);
        }
    }

    echo json_encode(["status" => "success", "reply" => $replyMessage, "response" => $replyMessage, "handled" => $res['handled'] ?? false]);
} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
