<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/NetworkChannelService.php';
require_once __DIR__ . '/includes/TelegramService.php';
require_once __DIR__ . '/includes/WhatsAppService.php';
require_once __DIR__ . '/includes/ChatbotService.php';

header('Content-Type: application/json; charset=utf-8');
$db = getDB();
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$networkId = (int)($_GET['network_id'] ?? ($_SERVER['HTTP_X_SAM_NETWORK_ID'] ?? ($input['network_id'] ?? 0)));
if ($networkId <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'NETWORK_CONTEXT_REQUIRED']); exit; }

try {
    $channels = new NetworkChannelService($db);
    $networkId = $channels->normalizeNetworkId($networkId);
    $channel = $channels->getChannel($networkId, 'telegram');
    if (empty($channel['is_enabled']) || empty($channel['bot_token'])) {
        http_response_code(404); echo json_encode(['ok'=>false,'error'=>'TELEGRAM_NOT_CONFIGURED','network_id'=>$networkId]); exit;
    }
    $secret = (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
    if ($networkId > 1 && empty($channel['webhook_secret_hash'])) {
        http_response_code(403); echo json_encode(['ok'=>false,'error'=>'TELEGRAM_WEBHOOK_SECRET_REQUIRED','network_id'=>$networkId]); exit;
    }
    if (!empty($channel['webhook_secret_hash']) && !$channels->verifyWebhookSecret($networkId, 'telegram', $secret)) {
        http_response_code(403); echo json_encode(['ok'=>false,'error'=>'TELEGRAM_WEBHOOK_FORBIDDEN']); exit;
    }

    $message = (array)($input['message'] ?? []);
    $text = trim((string)($message['text'] ?? $message['caption'] ?? ''));
    $chatId = (string)($message['chat']['id'] ?? '');
    $from = (string)($message['from']['username'] ?? $message['from']['id'] ?? $chatId);
    if ($text === '' || $chatId === '') { echo json_encode(['ok'=>true,'ignored'=>true,'network_id'=>$networkId]); exit; }

    $db->exec('SET @sam_active_network_id=' . $networkId);
    $bot = new ChatbotService($db);
    $result = $bot->handleMessage($text, $from, 'telegram', $networkId);
    $reply = trim((string)($result['reply'] ?? $result['response'] ?? ''));
    $send = $reply !== '' ? (new TelegramService($db, $networkId))->sendMessage($reply, $chatId) : ['success'=>true,'skipped'=>true];
    echo json_encode(['ok'=>true,'network_id'=>$networkId,'handled'=>!empty($result['handled']),'sent'=>$send], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>$e->getMessage()], JSON_UNESCAPED_UNICODE);
}

