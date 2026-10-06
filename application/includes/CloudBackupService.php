<?php
declare(strict_types=1);

require_once __DIR__ . '/BaseService.php';

/**
 * CloudBackupService - Off-Site Cloud Backup Engine for SAM MikroTik Manager
 * Supports automated synchronization to Telegram Cloud Storage & Remote SFTP Servers
 */
class CloudBackupService extends BaseService {

    public function getSettings(): array {
        $stmt = $this->db->query("
            SELECT setting_key, setting_value 
            FROM um_settings 
            WHERE setting_key LIKE 'cloud_backup_%' 
               OR setting_key IN ('telegram_bot_token', 'telegram_chat_id', 'telegram_enabled')
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

        // Fallback telegram token & chat from existing telegram settings if not set specifically
        $defaultTgToken = $rows['telegram_bot_token'] ?? '';
        $defaultTgChat = $rows['telegram_chat_id'] ?? '';

        return [
            'telegram' => [
                'enabled' => ($rows['cloud_backup_telegram_enabled'] ?? '1') === '1',
                'bot_token' => $rows['cloud_backup_telegram_bot_token'] ?? $defaultTgToken,
                'chat_id' => $rows['cloud_backup_telegram_chat_id'] ?? $defaultTgChat,
            ],
            'sftp' => [
                'enabled' => ($rows['cloud_backup_sftp_enabled'] ?? '0') === '1',
                'host' => $rows['cloud_backup_sftp_host'] ?? '',
                'port' => (int)($rows['cloud_backup_sftp_port'] ?? 22),
                'username' => $rows['cloud_backup_sftp_username'] ?? '',
                'password' => $rows['cloud_backup_sftp_password'] ?? '',
                'remote_path' => $rows['cloud_backup_sftp_remote_path'] ?? '/var/backups/sam_remote',
            ],
            'auto_sync' => ($rows['cloud_backup_auto_sync'] ?? '1') === '1',
            'retention_days' => max(1, (int)($rows['cloud_backup_retention_days'] ?? 30)),
            'cron_interval' => $rows['cloud_backup_cron_interval'] ?? 'daily',
        ];
    }

    public function saveSettings(array $input): array {
        $keys = [
            'cloud_backup_telegram_enabled' => !empty($input['telegram']['enabled']) ? '1' : '0',
            'cloud_backup_telegram_bot_token' => trim((string)($input['telegram']['bot_token'] ?? '')),
            'cloud_backup_telegram_chat_id' => trim((string)($input['telegram']['chat_id'] ?? '')),
            'cloud_backup_sftp_enabled' => !empty($input['sftp']['enabled']) ? '1' : '0',
            'cloud_backup_sftp_host' => trim((string)($input['sftp']['host'] ?? '')),
            'cloud_backup_sftp_port' => (string)max(1, (int)($input['sftp']['port'] ?? 22)),
            'cloud_backup_sftp_username' => trim((string)($input['sftp']['username'] ?? '')),
            'cloud_backup_sftp_password' => (string)($input['sftp']['password'] ?? ''),
            'cloud_backup_sftp_remote_path' => trim((string)($input['sftp']['remote_path'] ?? '/var/backups/sam_remote')),
            'cloud_backup_auto_sync' => !empty($input['auto_sync']) ? '1' : '0',
            'cloud_backup_retention_days' => (string)max(1, (int)($input['retention_days'] ?? 30)),
            'cloud_backup_cron_interval' => (string)($input['cron_interval'] ?? 'daily'),
        ];

        foreach ($keys as $k => $v) {
            $this->setSettingValue($k, $v);
        }

        $this->logActivity('cloud_backup_settings', 'system', 'تحديث إعدادات النسخ السحابي', 'تم حفظ إعدادات Telegram Cloud و SFTP بنجاح', 'success');

        return [
            'success' => true,
            'message' => 'تم حفظ إعدادات النسخ الاحتياطي السحابي الخارجي بنجاح'
        ];
    }

    /**
     * Send compressed backup document directly to Telegram Cloud Storage
     */
    public function sendToTelegramCloud(string $filepath, string $filename, ?string $customCaption = null, ?array $overrideSettings = null): array {
        if (!file_exists($filepath) || filesize($filepath) < 50) {
            return ['success' => false, 'error' => 'ملف النسخة الاحتياطية غير موجود أو تالف على السيرفر'];
        }

        $settings = $overrideSettings ?: $this->getSettings()['telegram'];
        $botToken = trim((string)($settings['bot_token'] ?? ''));
        $chatId = trim((string)($settings['chat_id'] ?? ''));

        if (empty($botToken) || empty($chatId)) {
            return ['success' => false, 'error' => 'بيانات بوت تليجرام أو معرف القناة (Chat ID) غير مكتملة'];
        }

        $filesize = filesize($filepath);
        $sizeMB = round($filesize / (1024 * 1024), 2);
        $sizeFormatted = $sizeMB >= 1 ? "{$sizeMB} MB" : round($filesize / 1024, 2) . " KB";
        $sha256 = hash_file('sha256', $filepath);
        $hostname = gethostname() ?: 'SAM-VPS';
        $networkName = $this->getSettingValue('network_name', 'SAM MikroTik Network');

        if ($customCaption !== null) {
            $caption = $customCaption;
        } else {
            $caption = "🛡️ <b>نسخة احتياطية سحابية لقاعدة البيانات (Cloud Backup)</b>
";
            $caption .= "━━━━━━━━━━━━━━━━━━━━━━
";
            $caption .= "📁 <b>الملف:</b> <code>{$filename}</code>
";
            $caption .= "📊 <b>الحجم:</b> {$sizeFormatted} (" . number_format($filesize) . " بايت)
";
            $caption .= "🔐 <b>SHA256:</b> <code>" . substr($sha256, 0, 16) . "..." . substr($sha256, -8) . "</code>
";
            $caption .= "🏢 <b>الشبكة:</b> {$networkName}
";
            $caption .= "⏱️ <b>التاريخ:</b> " . date('Y-m-d h:i:s A') . "
";
            $caption .= "━━━━━━━━━━━━━━━━━━━━━━
";
            $caption .= "☁️ <i>تم الحفظ تلقائياً في سحابة Telegram Cloud المشفرة</i>";
        }

        $url = "https://api.telegram.org/bot{$botToken}/sendDocument";

        $postData = [
            'chat_id' => $chatId,
            'caption' => $caption,
            'parse_mode' => 'HTML',
            'document' => new CURLFile($filepath, 'application/gzip', $filename)
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 180);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            return ['success' => false, 'error' => "خطأ في اتصال cURL: {$curlErr}"];
        }

        $json = json_decode((string)$response, true);
        if ($httpCode === 200 && !empty($json['ok'])) {
            $msgId = $json['result']['message_id'] ?? null;
            $fileId = $json['result']['document']['file_id'] ?? null;
            return [
                'success' => true,
                'message_id' => $msgId,
                'file_id' => $fileId,
                'size_formatted' => $sizeFormatted,
                'sha256' => $sha256,
                'response' => $json
            ];
        }

        $errMsg = $json['description'] ?? ("HTTP Code: " . $httpCode);
        return ['success' => false, 'error' => "فشل إرسال الملف إلى تليجرام: {$errMsg}"];
    }

    /**
     * Upload backup to Remote SFTP / SSH Server
     */
    public function uploadToSftpServer(string $filepath, string $filename, ?array $overrideSettings = null): array {
        if (!file_exists($filepath) || filesize($filepath) < 50) {
            return ['success' => false, 'error' => 'ملف النسخة الاحتياطية غير موجود أو تالف على السيرفر'];
        }

        $settings = $overrideSettings ?: $this->getSettings()['sftp'];
        $host = trim((string)($settings['host'] ?? ''));
        $port = max(1, (int)($settings['port'] ?? 22));
        $user = trim((string)($settings['username'] ?? ''));
        $pass = (string)($settings['password'] ?? '');
        $remotePath = rtrim(trim((string)($settings['remote_path'] ?? '/var/backups')), '/');

        if (empty($host) || empty($user)) {
            return ['success' => false, 'error' => 'عنوان سيرفر SFTP أو اسم المستخدم غير محدد'];
        }

        $filesize = filesize($filepath);
        $targetUrl = "sftp://{$host}:{$port}{$remotePath}/{$filename}";

        $ch = curl_init();
        $fp = fopen($filepath, 'r');
        if (!$fp) {
            return ['success' => false, 'error' => 'تعذر فتح ملف النسخة الاحتياطية للقراءة'];
        }

        curl_setopt($ch, CURLOPT_URL, $targetUrl);
        curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
        curl_setopt($ch, CURLOPT_UPLOAD, true);
        curl_setopt($ch, CURLOPT_INFILE, $fp);
        curl_setopt($ch, CURLOPT_INFILESIZE, $filesize);
        curl_setopt($ch, CURLOPT_FTP_CREATE_MISSING_DIRS, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        $curlErrNo = curl_errno($ch);
        curl_close($ch);
        fclose($fp);

        if ($curlErrNo === 0) {
            return [
                'success' => true,
                'target_url' => "sftp://{$user}@{$host}:{$port}{$remotePath}/{$filename}",
                'filesize' => $filesize
            ];
        }

        return [
            'success' => false,
            'error' => "فشل الرفع عبر SFTP: {$curlErr} (كود: {$curlErrNo})"
        ];
    }

    /**
     * Dispatch single backup file to all enabled off-site destinations
     */
    public function syncBackupToCloud(string $filepath, string $filename): array {
        $settings = $this->getSettings();
        $results = [
            'filename' => $filename,
            'telegram' => null,
            'sftp' => null
        ];

        // 1. Sync to Telegram Cloud if enabled
        if (!empty($settings['telegram']['enabled']) && !empty($settings['telegram']['bot_token'])) {
            $results['telegram'] = $this->sendToTelegramCloud($filepath, $filename, null, $settings['telegram']);
        }

        // 2. Sync to SFTP Server if enabled
        if (!empty($settings['sftp']['enabled']) && !empty($settings['sftp']['host'])) {
            $results['sftp'] = $this->uploadToSftpServer($filepath, $filename, $settings['sftp']);
        }

        $tgOk = !empty($results['telegram']['success']);
        $sftpOk = !empty($results['sftp']['success']);

        $statusDesc = [];
        if ($tgOk) $statusDesc[] = "Telegram Cloud ✅";
        if ($sftpOk) $statusDesc[] = "SFTP Server ✅";
        if (!$tgOk && isset($results['telegram']['error'])) $statusDesc[] = "Telegram ❌ (" . $results['telegram']['error'] . ")";
        if (!$sftpOk && isset($results['sftp']['error'])) $statusDesc[] = "SFTP ❌ (" . $results['sftp']['error'] . ")";

        $summaryText = implode(' | ', $statusDesc) ?: 'لا توجد وجهات سحابية مفعلة';
        $this->logActivity('cloud_backup_sync', 'system', "مزامنة سحابية: {$filename}", $summaryText, ($tgOk || $sftpOk) ? 'success' : 'warning');

        return [
            'success' => $tgOk || $sftpOk,
            'filename' => $filename,
            'destinations' => $results,
            'summary' => $summaryText
        ];
    }

    /**
     * Test Telegram Connection by sending a test message or small file
     */
    public function testTelegramConnection(?array $customConfig = null): array {
        $settings = $customConfig ?: $this->getSettings()['telegram'];
        $botToken = trim((string)($settings['bot_token'] ?? ''));
        $chatId = trim((string)($settings['chat_id'] ?? ''));

        if (empty($botToken) || empty($chatId)) {
            return ['success' => false, 'error' => 'يرجى ملء Bot Token و Chat ID أولاً'];
        }

        $testContent = "=== SAM CLOUD BACKUP HEALTH TEST ===\nDate: " . date('Y-m-d H:i:s') . "\nHost: " . gethostname() . "\nStatus: OK";
        $tmpFile = tempnam(sys_get_temp_dir(), 'sam_tg_test_');
        file_put_contents($tmpFile, $testContent);

        $testFilename = "sam_cloud_backup_test_" . date('Ymd_His') . ".txt";
        $caption = "🚀 <b>فحص اتصال النسخ الاحتياطي السحابي (Telegram Cloud Test)</b>\n\n✅ الاتصال بالبوت والمحادثة يعمل بنجاح وكفاءة 100%!\n⏱️ <b>التاريخ:</b> " . date('Y-m-d h:i:s A');

        $res = $this->sendToTelegramCloud($tmpFile, $testFilename, $caption, $settings);
        @unlink($tmpFile);

        return $res;
    }

    /**
     * Test SFTP Connection
     */
    public function testSftpConnection(?array $customConfig = null): array {
        $settings = $customConfig ?: $this->getSettings()['sftp'];
        $host = trim((string)($settings['host'] ?? ''));
        $user = trim((string)($settings['username'] ?? ''));

        if (empty($host) || empty($user)) {
            return ['success' => false, 'error' => 'يرجى إدخال عنوان السيرفر (Host) واسم المستخدم أولاً'];
        }

        $testContent = "=== SAM SFTP TEST FILE ===\nDate: " . date('Y-m-d H:i:s') . "\nStatus: Connected";
        $tmpFile = tempnam(sys_get_temp_dir(), 'sam_sftp_test_');
        file_put_contents($tmpFile, $testContent);

        $testFilename = "sam_sftp_connection_test_" . time() . ".txt";
        $res = $this->uploadToSftpServer($tmpFile, $testFilename, $settings);
        @unlink($tmpFile);

        return $res;
    }

    /**
     * Purge local backups older than retention days
     */
    public function purgeOldBackups(int $retentionDays = 30): int {
        $backupDir = '/var/backups/mikrotik-usermanager';
        if (!is_dir($backupDir)) return 0;

        $files = glob("{$backupDir}/radius_backup_*.sql.gz") ?: [];
        $cutoff = time() - ($retentionDays * 86400);
        $deletedCount = 0;

        foreach ($files as $f) {
            if (filemtime($f) < $cutoff) {
                if (@unlink($f)) {
                    $deletedCount++;
                }
            }
        }

        if ($deletedCount > 0) {
            $this->logActivity('backup_purge', 'system', "تنظيف النسخ القديمة", "تم حذف {$deletedCount} ملف نسخة احتياطية محلية أقدم من {$retentionDays} يوم", 'info');
        }

        return $deletedCount;
    }

    /**
     * Run Complete Automated Backup & Cloud Sync Lifecycle
     */
    public function executeScheduledBackup(): array {
        if (!$this->radius) {
            require_once __DIR__ . '/RadiusService.php';
            $this->radius = new RadiusService($this->db);
        }

        // 1. Create Local Backup
        $backupRes = $this->radius->createDatabaseBackup();
        if (empty($backupRes['success']) || empty($backupRes['filename'])) {
            return ['success' => false, 'error' => $backupRes['error'] ?? 'فشل إنشاء النسخة الاحتياطية المحلية'];
        }

        $backupDir = '/var/backups/mikrotik-usermanager';
        $filepath = "{$backupDir}/{$backupRes['filename']}";

        // 2. Sync to Off-Site Cloud
        $syncRes = $this->syncBackupToCloud($filepath, $backupRes['filename']);

        // 3. Purge expired backups
        $settings = $this->getSettings();
        $retentionDays = (int)($settings['retention_days'] ?? 30);
        $purged = $this->purgeOldBackups($retentionDays);

        return [
            'success' => true,
            'local_backup' => $backupRes,
            'cloud_sync' => $syncRes,
            'purged_files_count' => $purged
        ];
    }
}
