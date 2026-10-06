<?php
declare(strict_types=1);

/** OTP consumption and account creation share one database transaction. */
final class RegistrationVerificationService
{
    private string $key;

    public function __construct(private PDO $db)
    {
        $config = require (getenv('UM_CONFIG_FILE') ?: '/etc/mikrotik-usermanager/app-config.php');
        $hex = (string)($config['registration_payload_key'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/D', $hex)) {
            throw new RuntimeException('خدمة التحقق غير مهيأة. راجع مسؤول النظام.', 503);
        }
        $this->key = hex2bin($hex);
    }

    public function issue(string $phone, string $type, array $payload, string $otp): int
    {
        $lock = 'sam:reg:' . substr(hash('sha256', $phone), 0, 48);
        $q = $this->db->prepare('SELECT GET_LOCK(?, 5)');
        $q->execute([$lock]);
        if ((int)$q->fetchColumn() !== 1) throw new RuntimeException('يرجى إعادة المحاولة بعد قليل.', 429);
        try {
            $q = $this->db->prepare('SELECT COUNT(*) FROM um_registration_otps WHERE phone=? AND created_at>DATE_SUB(NOW(), INTERVAL 10 MINUTE)');
            $q->execute([$phone]);
            if ((int)$q->fetchColumn() >= 4) throw new RuntimeException('تم تجاوز عدد طلبات الرمز. انتظر عشر دقائق.', 429);
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $encrypted = base64_encode($nonce . sodium_crypto_secretbox(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $nonce, $this->key));
            $this->db->beginTransaction();
            $this->db->prepare('UPDATE um_registration_otps SET is_verified=2,payload_json=\'\' WHERE phone=? AND is_verified=0')->execute([$phone]);
            $q = $this->db->prepare('INSERT INTO um_registration_otps(phone,otp_code,account_type,payload_json,attempts,is_verified,expires_at,created_at) VALUES(?,?,?,?,0,0,DATE_ADD(NOW(),INTERVAL 10 MINUTE),NOW())');
            $q->execute([$phone, hash_hmac('sha256', $otp, $this->key), $type, $encrypted]);
            $id = (int)$this->db->lastInsertId();
            $this->db->commit();
            return $id;
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        } finally {
            $this->db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lock]);
        }
    }

    public function invalidate(int $id): void
    {
        $this->db->prepare('UPDATE um_registration_otps SET is_verified=2,payload_json=\'\' WHERE id=? AND is_verified=0')->execute([$id]);
    }

    /** Returns the verified payload with the transaction intentionally open. */
    public function claim(int $id, string $phone, string $otp): array
    {
        if ($id <= 0 || $phone === '' || !preg_match('/^[0-9]{6}$/D', $otp)) {
            throw new RuntimeException('أدخل رمز التحقق المكوّن من ستة أرقام.', 400);
        }
        $this->db->beginTransaction();
        try {
            $q = $this->db->prepare('SELECT * FROM um_registration_otps WHERE id=? AND phone=? AND is_verified=0 AND expires_at>NOW() FOR UPDATE');
            $q->execute([$id, $phone]);
            $row = $q->fetch(PDO::FETCH_ASSOC);
            if (!$row) throw new RuntimeException('الرمز منتهي أو مستخدم. اطلب رمزاً جديداً.', 400);
            if ((int)$row['attempts'] >= 5) throw new RuntimeException('انتهت المحاولات المتاحة. اطلب رمزاً جديداً.', 429);
            if (!hash_equals((string)$row['otp_code'], hash_hmac('sha256', $otp, $this->key))) {
                $this->db->prepare('UPDATE um_registration_otps SET attempts=attempts+1,is_verified=IF(attempts>=5,2,0) WHERE id=?')->execute([$id]);
                $this->db->commit();
                throw new RuntimeException('رمز التحقق غير صحيح.', 400);
            }
            $blob = base64_decode((string)$row['payload_json'], true);
            if ($blob === false || strlen($blob) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) throw new RuntimeException('طلب التحقق غير صالح.', 400);
            $plain = sodium_crypto_secretbox_open(substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $this->key);
            if ($plain === false) throw new RuntimeException('تعذر التحقق من الطلب.', 400);
            $payload = json_decode($plain, true, 512, JSON_THROW_ON_ERROR);
            $this->db->prepare('UPDATE um_registration_otps SET is_verified=1,payload_json=\'\',otp_code=\'\' WHERE id=?')->execute([$id]);
            return ['phone' => $row['phone'], 'account_type' => $row['account_type'], 'payload' => $payload];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }
}
