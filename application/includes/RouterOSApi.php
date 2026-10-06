<?php
/**
 * RouterOS API Client (Pure PHP)
 * Fully compliant with MikroTik RouterOS API Protocol (ROS v6 & v7)
 */
class RouterOSApi {
    public $debug = false;
    public $connected = false;
    public $port = 8728;
    public $ssl = false;
    public $timeout = 6;
    public $attempts = 1;
    public $delay = 1;

    public $socket;
    public $error_no;
    public $error_str;
    public $lastError = null;
    public $lastDone = false;

    private function encodeLength($length) {
        if ($length < 0x80) {
            return chr($length);
        } elseif ($length < 0x4000) {
            $length |= 0x8000;
            return chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        } elseif ($length < 0x200000) {
            $length |= 0xC00000;
            return chr(($length >> 16) & 0xFF) . chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        } elseif ($length < 0x10000000) {
            $length |= 0xE0000000;
            return chr(($length >> 24) & 0xFF) . chr(($length >> 16) & 0xFF) . chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        } elseif ($length >= 0x10000000) {
            return chr(0xF0) . chr(($length >> 24) & 0xFF) . chr(($length >> 16) & 0xFF) . chr(($length >> 8) & 0xFF) . chr($length & 0xFF);
        }
        return '';
    }

    public function writeWord($word) {
        if (!$this->socket) return false;
        $len = strlen($word);
        return @fwrite($this->socket, $this->encodeLength($len) . $word);
    }

    public function writeSentence(array $words) {
        if (!$this->socket) return false;
        foreach ($words as $w) {
            $this->writeWord($w);
        }
        return @fwrite($this->socket, chr(0));
    }

    public function readWord() {
        if (!$this->socket) return false;
        $byte = @fread($this->socket, 1);
        if ($byte === false || strlen($byte) === 0) return false;
        $length = ord($byte);

        if ($length & 0x80) {
            if (($length & 0xC0) === 0x80) {
                $length &= ~0x80;
                $length = ($length << 8) + ord(@fread($this->socket, 1));
            } elseif (($length & 0xE0) === 0xC0) {
                $length &= ~0xC0;
                $length = ($length << 8) + ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
            } elseif (($length & 0xF0) === 0xE0) {
                $length &= ~0xE0;
                $length = ($length << 8) + ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
            } elseif (($length & 0xF8) === 0xF0) {
                $length = ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
                $length = ($length << 8) + ord(@fread($this->socket, 1));
            }
        }

        if ($length === 0) return '';
        $word = '';
        while (strlen($word) < $length) {
            $chunk = @fread($this->socket, $length - strlen($word));
            if ($chunk === false || strlen($chunk) === 0) break;
            $word .= $chunk;
        }
        return $word;
    }

    public function readSentence() {
        $sentence = [];
        while (true) {
            $word = $this->readWord();
            if ($word === false) return false;
            if ($word === '') {
                return $sentence;
            }
            $sentence[] = $word;
        }
    }

    public function connect($ip, $login, $password, $port = 8728, $ssl = false, $timeout = 6) {
        $this->port = (int)$port ?: 8728;
        $this->ssl = (bool)$ssl;
        $this->timeout = (int)$timeout ?: 6;

        $protocol = $this->ssl ? 'ssl://' : '';
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ]);

        $this->socket = @stream_socket_client(
            $protocol . $ip . ':' . $this->port,
            $this->error_no,
            $this->error_str,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            $context
        );

        if (!$this->socket) {
            $this->error_str = $this->error_str ?: 'تعذر الاتصال بعنوان IP والمنفذ المحدد للراوتر';
            return false;
        }

        stream_set_timeout($this->socket, $this->timeout);

        // Modern plaintext login (RouterOS 6.43+)
        $this->writeSentence(['/login', '=name=' . $login, '=password=' . $password]);
        $resp = $this->readSentence();

        if (!empty($resp)) {
            if ($resp[0] === '!done') {
                if (count($resp) === 1) {
                    $this->connected = true;
                    return true;
                }
                // Pre-6.43 challenge-response login
                $challenge = '';
                foreach ($resp as $w) {
                    if (strpos($w, '=ret=') === 0) {
                        $challenge = substr($w, 5);
                    }
                }
                if ($challenge) {
                    $this->writeSentence([
                        '/login',
                        '=name=' . $login,
                        '=response=00' . md5(chr(0) . $password . pack('H*', $challenge))
                    ]);
                    $resp2 = $this->readSentence();
                    if (!empty($resp2) && $resp2[0] === '!done') {
                        $this->connected = true;
                        return true;
                    }
                }
            } elseif ($resp[0] === '!trap') {
                $err = 'بيانات الدخول (اسم المستخدم أو كلمة المرور) غير صحيحة';
                foreach ($resp as $w) {
                    if (strpos($w, '=message=') === 0) {
                        $err = substr($w, 9);
                    }
                }
                $this->error_str = $err;
                $this->disconnect();
                return false;
            }
        }

        $this->error_str = 'فشل تسجيل الدخول إلى راوتر ميكروتك';
        $this->disconnect();
        return false;
    }

    public function disconnect() {
        if (is_resource($this->socket)) {
            @fclose($this->socket);
        }
        $this->socket = null;
        $this->connected = false;
    }

    public function comm($command, $params = [], ?callable $onRecord = null) {
        $this->lastError = null;
        $this->lastDone = false;
        if (!$this->connected || !$this->socket) return false;

        $words = [$command];
        foreach ($params as $k => $v) {
            $words[] = (is_numeric($k) ? '' : '=' . $k . '=') . $v;
        }
        $this->writeSentence($words);

        $results = [];
        while (true) {
            $sentence = $this->readSentence();
            if ($sentence === false || empty($sentence)) break;
            $type = $sentence[0];
            if ($type === '!re') {
                $item = [];
                for ($i = 1; $i < count($sentence); $i++) {
                    $w = $sentence[$i];
                    if (strpos($w, '=') === 0) {
                        $parts = explode('=', substr($w, 1), 2);
                        $item[$parts[0]] = $parts[1] ?? '';
                    }
                }
                if($onRecord!==null)$onRecord($item);else $results[] = $item;
            } elseif ($type === '!done') {
                $this->lastDone = true;
                break;
            } elseif ($type === '!trap' || $type === '!fatal') {
                $fields = [];
                for ($i = 1; $i < count($sentence); $i++) {
                    if (strpos($sentence[$i], '=') === 0) {
                        $parts = explode('=', substr($sentence[$i], 1), 2);
                        $fields[$parts[0]] = $parts[1] ?? '';
                    }
                }
                $this->lastError = $fields['message'] ?? ($type === '!fatal' ? 'RouterOS API fatal error' : 'RouterOS API command trapped');
                break;
            }
        }
        return $results;
    }
}
