<?php
declare(strict_types=1);

final class ApiResponse
{
    public static string $requestId = '';

    public static function init(): void
    {
        self::$requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? bin2hex(random_bytes(8));
        header('Content-Type: application/json; charset=utf-8');
        header('X-Request-Id: ' . self::$requestId);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
    }

    public static function ok(mixed $data = null, array $meta = [], int $status = 200): never
    {
        self::send(['data' => $data, 'meta' => array_merge(['request_id' => self::$requestId], $meta), 'error' => null], $status);
    }

    public static function error(string $code, string $message, int $status = 400, array $details = []): never
    {
        self::send([
            'data' => null,
            'meta' => ['request_id' => self::$requestId],
            'error' => ['code' => $code, 'message' => $message, 'details' => (object)$details],
        ], $status);
    }

    private static function send(array $payload, int $status): never
    {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}
