<?php
declare(strict_types=1);

/**
 * High-Performance Caching Service with Redis & In-Memory Fallback
 * Provides ultra-fast caching for Sessions, System Settings, Permissions, and RADIUS stats.
 */
class CacheService {
    private static ?CacheService $instance = null;
    private ?Redis $redis = null;
    private bool $connected = false;
    private array $memoryCache = [];
    private string $prefix = 'sam:';

    private function __construct() {
        if (class_exists('Redis')) {
            try {
                $this->redis = new Redis();
                $host = defined('REDIS_HOST') ? REDIS_HOST : '127.0.0.1';
                $port = defined('REDIS_PORT') ? (int)REDIS_PORT : 6379;
                $timeout = 0.5; // 500ms max connect timeout
                if (@$this->redis->connect($host, $port, $timeout)) {
                    if (defined('REDIS_PASS') && REDIS_PASS !== '') {
                        $this->redis->auth(REDIS_PASS);
                    }
                    $this->connected = true;
                    if (defined('Redis::SERIALIZER_IGBINARY') && extension_loaded('igbinary')) {
                        $this->redis->setOption(Redis::OPT_SERIALIZER, Redis::SERIALIZER_IGBINARY);
                    } else {
                        $this->redis->setOption(Redis::OPT_SERIALIZER, Redis::SERIALIZER_PHP);
                    }
                } else {
                    $this->connected = false;
                }
            } catch (Throwable $e) {
                $this->connected = false;
                error_log('[CacheService] Redis init failed: ' . $e->getMessage());
            }
        }
    }

    public static function getInstance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function isRedisActive(): bool {
        return $this->connected;
    }

    public function get(string $key, mixed $default = null): mixed {
        $fullKey = $this->prefix . $key;
        if ($this->connected) {
            try {
                $val = $this->redis->get($fullKey);
                if ($val !== false) {
                    return $val;
                }
            } catch (Throwable $e) {
                error_log('[CacheService] Redis get failed: ' . $e->getMessage());
            }
        }
        return $this->memoryCache[$key] ?? $default;
    }

    public function set(string $key, mixed $value, int $ttlSeconds = 3600): bool {
        $fullKey = $this->prefix . $key;
        $this->memoryCache[$key] = $value;
        if ($this->connected) {
            try {
                return (bool) $this->redis->setex($fullKey, $ttlSeconds, $value);
            } catch (Throwable $e) {
                error_log('[CacheService] Redis set failed: ' . $e->getMessage());
                return false;
            }
        }
        return true;
    }

    public function delete(string $key): bool {
        $fullKey = $this->prefix . $key;
        unset($this->memoryCache[$key]);
        if ($this->connected) {
            try {
                return (bool) $this->redis->del($fullKey);
            } catch (Throwable $e) {
                return false;
            }
        }
        return true;
    }

    public function has(string $key): bool {
        $fullKey = $this->prefix . $key;
        if ($this->connected) {
            try {
                return (bool) $this->redis->exists($fullKey);
            } catch (Throwable $e) {
                return isset($this->memoryCache[$key]);
            }
        }
        return isset($this->memoryCache[$key]);
    }

    public function remember(string $key, int $ttlSeconds, callable $callback): mixed {
        $val = $this->get($key);
        if ($val !== null) {
            return $val;
        }
        $fresh = $callback();
        $this->set($key, $fresh, $ttlSeconds);
        return $fresh;
    }

    public function flushPattern(string $pattern): int {
        if (!$this->connected) {
            $this->memoryCache = [];
            return 0;
        }
        try {
            $keys = $this->redis->keys($this->prefix . $pattern);
            if (!empty($keys)) {
                return (int) $this->redis->del($keys);
            }
        } catch (Throwable $e) {
            error_log('[CacheService] flushPattern failed: ' . $e->getMessage());
        }
        return 0;
    }
}
