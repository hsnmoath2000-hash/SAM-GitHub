"""Installation-time renderer. Run only by install.sh on an empty Linux host."""
import os
import pathlib
import shutil

base = pathlib.Path(__file__).resolve().parent
domain = os.environ['SAM_DOMAIN']
app = '/var/www/mikrotik-usermanager'
replacements = {'@DOMAIN@': domain, '@DB_PASSWORD@': os.environ['SAM_DB_PASSWORD'], '@RADIUS_SECRET@': os.environ['SAM_RADIUS_SECRET']}

def write(path, text, mode=0o644):
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')
    target.chmod(mode)

def render(text):
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text

for path in pathlib.Path('/etc/freeradius/3.0').rglob('*'):
    if path.is_file() and not path.is_symlink():
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        if any(token in text for token in replacements):
            path.write_text(render(text), encoding='utf-8')
write('/etc/accel-ppp/accel-ppp.conf', render((base/'templates/accel-ppp.conf').read_text()), 0o600)
write('/etc/ssh/sshd_config_sam_um_import', (base/'templates/sshd_config_sam_um_import').read_text())
for path in (base/'systemd').glob('*.service'):
    write('/etc/systemd/system/'+path.name, path.read_text())
for path in (base/'helpers').iterdir():
    write('/usr/local/sbin/'+path.name, path.read_text(), 0o750)

# Only root may change privileged helpers and service configuration.
write('/etc/sudoers.d/sam-fresh', '''www-data ALL=(root) NOPASSWD: /usr/local/sbin/sam-system-control *
www-data ALL=(root) NOPASSWD: /usr/local/sbin/sam-um-sftp-ticket
www-data ALL=(root) NOPASSWD: /usr/local/sbin/sam-apply-proxy
www-data ALL=(root) NOPASSWD: /usr/bin/systemctl restart accel-ppp, /usr/bin/systemctl restart freeradius
''', 0o440)
write('/etc/apache2/conf-available/sam-port.conf', 'Listen 127.0.0.1:8099\n')
common = f'''
 DocumentRoot {app}
 DirectoryIndex index.php
 RewriteEngine On
 RewriteRule ^/?api/v1(?:/.*)?$ /api/v1/index.php [END,QSA]
 SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1
 <Directory {app}>
  Options -Indexes -ExecCGI +FollowSymLinks
  AllowOverride FileInfo Options
  Require all granted
 </Directory>
 <DirectoryMatch "{app}/(includes|services|installer|tests|vendor)(/|$)">
  Require all denied
 </DirectoryMatch>
 <FilesMatch "(^\\.|\\.(sql|ini|env|log|bak|sh|md|ya?ml)$|^(check_|init_|schema_|cron_|sam_maintenance))">
  Require all denied
 </FilesMatch>
 <FilesMatch "\\.php$">
  SetHandler "proxy:unix:/run/php/php8.3-fpm.sock|fcgi://localhost/"
 </FilesMatch>
 Header always set X-Content-Type-Options "nosniff"
 Header always set X-Frame-Options "SAMEORIGIN"
 ErrorLog ${{APACHE_LOG_DIR}}/sam-error.log
 CustomLog ${{APACHE_LOG_DIR}}/sam-access.log combined
'''
write('/etc/apache2/sites-available/sam.conf', f'''<VirtualHost *:80>
 ServerName {domain}
 Redirect permanent / https://{domain}/
</VirtualHost>
<VirtualHost *:443>
 ServerName {domain}
 SSLEngine on
 SSLCertificateFile /etc/accel-ppp/server.crt
 SSLCertificateKeyFile /etc/accel-ppp/server.key
{common}
</VirtualHost>
<VirtualHost 127.0.0.1:8099>
 ServerName localhost
{common}
</VirtualHost>
''')
for sapi in ['fpm', 'cli']:
    write(f'/etc/php/8.3/{sapi}/conf.d/99-sam.ini', f'''date.timezone={os.environ['SAM_TIMEZONE']}
default_charset=UTF-8
memory_limit=512M
upload_max_filesize=64M
post_max_size=70M
max_execution_time=180
display_errors=Off
log_errors=On
expose_php=Off
session.cookie_httponly=1
session.cookie_secure=1
session.cookie_samesite=Lax
''')
write('/etc/mysql/mariadb.conf.d/60-sam-private.cnf', '[mysqld]\nbind-address=127.0.0.1\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\n')
write('/etc/fail2ban/jail.d/sam-sshd.local', '[sshd]\nenabled=true\nbackend=systemd\nmaxretry=5\nbantime=1h\n')
write('/etc/sysctl.d/90-sam-forward.conf', 'net.ipv4.ip_forward=1\n')
write('/usr/local/sbin/sam-backup', '''#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
exec 9>/run/lock/sam-backup.lock
flock -n 9 || exit 0
dest=/var/backups/mikrotik-usermanager
install -d -m 0700 "$dest"
stamp=$(date +%Y%m%d-%H%M%S)
mariadb-dump --single-transaction --routines --events --triggers radius | gzip > "$dest/$stamp.sql.gz.part"
mv "$dest/$stamp.sql.gz.part" "$dest/$stamp.sql.gz"
tar -czf "$dest/$stamp-config.tar.gz" /etc/mikrotik-usermanager /etc/accel-ppp /etc/freeradius/3.0
# Retention is deliberately manual: never erase an operator's backup automatically.
''', 0o700)
write('/etc/cron.d/sam-system', f'''SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * www-data /usr/bin/php8.3 {app}/cron_router_status_monitor.php 2>&1 | /usr/bin/logger -t sam-router-monitor
* * * * * www-data /usr/bin/php8.3 {app}/cron_dispatch_queue.php 2>&1 | /usr/bin/logger -t sam-message-queue
*/5 * * * * www-data /usr/bin/php8.3 {app}/cron_network_notification_reports.php 2>&1 | /usr/bin/logger -t sam-network-reports
*/5 * * * * www-data /usr/bin/php8.3 {app}/sam_maintenance.php cleanup_sessions 2>&1 | /usr/bin/logger -t sam-maintenance
0 4 * * 0 www-data /usr/bin/php8.3 {app}/sam_maintenance.php cleanup_logs 2>&1 | /usr/bin/logger -t sam-maintenance
*/5 * * * * root echo cleanup | /usr/local/sbin/sam-um-sftp-ticket 2>&1 | /usr/bin/logger -t sam-sftp-cleanup
* * * * * root /usr/local/sbin/sam-expire-vouchers.php 2>&1 | /usr/bin/logger -t sam-expiry
0 3 * * * root /usr/local/sbin/sam-backup 2>&1 | /usr/bin/logger -t sam-backup
''')
write('/etc/logrotate.d/sam', '''/var/log/sam-um-import-sftp.log /var/log/accel-ppp/*.log {
 weekly
 rotate 8
 missingok
 notifempty
 compress
 delaycompress
 copytruncate
}
''')
