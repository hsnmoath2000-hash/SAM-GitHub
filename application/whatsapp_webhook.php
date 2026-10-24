<?php
declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/NetworkChannelService.php';
require_once __DIR__ . '/includes/MessageQueueManager.php';
require_once __DIR__ . '/includes/ChatbotService.php';
require_once __DIR__ . '/includes/WhatsAppService.php';

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true) ?: $_POST;

if (!$input) {
    echo json_encode(["ok" => false, "status" => "no_data"]);
    exit;
}

$db = getDB();

// 1. Explicitly identify and validate network_id
$networkId = (int)($_GET['network_id'] ?? ($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($input['network_id'] ?? 0)));
if ($networkId <= 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "status" => "error", "error" => "NETWORK_CONTEXT_REQUIRED"]);
    exit;
}

// 2. Reject inactive or nonexistent network explicitly before loading channel
$netStmt = $db->prepare("SELECT id, status FROM um_networks WHERE id = ? LIMIT 1");
$netStmt->execute([$networkId]);
$netRow = $netStmt->fetch(PDO::FETCH_ASSOC);
if (!$netRow || $netRow['status'] !== 'active') {
    http_response_code(403);
    echo json_encode(["ok" => false, "status" => "error", "error" => "INACTIVE_OR_INVALID_NETWORK", "network_id" => $networkId]);
    exit;
}

try {
    $channelService = new NetworkChannelService($db);
    $channel = $channelService->getChannel($networkId, 'whatsapp');

    // 3. Verify that the loaded channel strictly matches the requested network ID and is enabled
    if (empty($channel['is_enabled']) || (int)($channel['network_id'] ?? 0) !== $networkId) {
        http_response_code(404);
        echo json_encode(["ok" => false, "status" => "error", "error" => "WHATSAPP_NOT_CONFIGURED_FOR_NETWORK", "network_id" => $networkId]);
        exit;
    }

    // 4. Verify Webhook Secret / Signature if configured
    $secretHeader = (string)($_SERVER['HTTP_X_WHATSAPP_SECRET'] ?? ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? ($_GET['secret'] ?? '')));
    if (!empty($channel['webhook_secret_hash'])) {
        $validSecret = false;
        if ($channelService->verifyWebhookSecret($networkId, 'whatsapp', $secretHeader)) {
            $validSecret = true;
        } elseif (!empty($channel['webhook_secret']) && str_starts_with($secretHeader, 'sha256=')) {
            $expectedHash = hash_hmac('sha256', $rawInput, $channel['webhook_secret']);
            $validSecret = hash_equals('sha256=' . $expectedHash, $secretHeader);
        }
        if (!$validSecret) {
            http_response_code(401);
            echo json_encode(["ok" => false, "status" => "error", "error" => "INVALID_WEBHOOK_SIGNATURE"]);
            exit;
        }
    }

    $phone = preg_replace('/[^0-9]/', '', (string)($input['phone'] ?? $input['from'] ?? ''));
    $messageText = trim((string)($input['message'] ?? $input['body'] ?? $input['text']['body'] ?? ''));

    if (empty($phone) || empty($messageText)) {
        echo json_encode(["ok" => false, "status" => "invalid_payload"]);
        exit;
    }

    $db->exec('SET @sam_active_network_id=' . $networkId);
    $chatbot = new ChatbotService($db);
    $res = $chatbot->handleMessage($messageText, $phone, 'whatsapp', $networkId);

    $replyMessage = $res['response'] ?? ($res['reply'] ?? null);

    if (!empty($replyMessage) && !empty($res['handled'])) {
        $ws = new WhatsAppService($db, $networkId);
        $ws->sendDirectMessage($phone, $replyMessage);
    }

    echo json_encode([
        "ok" => true,
        "status" => "success",
        "network_id" => $networkId,
        "reply" => $replyMessage,
        "response" => $replyMessage,
        "handled" => $res['handled'] ?? false
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "status" => "error", "message" => $e->getMessage()]);
}
