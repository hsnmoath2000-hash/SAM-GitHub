#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 && $(uname -m) == x86_64 ]] || { echo 'Ubuntu 24.04 x86_64 required'; exit 1; }
for p in /var/www/mikrotik-usermanager /etc/mikrotik-usermanager /etc/accel-ppp/accel-ppp.conf /etc/sam-web-installer; do
 [[ ! -e $p ]] || { echo 'Existing installation: refused before changes'; exit 1; }
done
if command -v mariadb >/dev/null; then
 [[ $(mariadb -NBe "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='radius'") == 0 ]] || exit 1
fi
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
(cd "$ROOT" && sha256sum --quiet -c SHA256SUMS)
for port in 80 443 8443 8099; do [[ -z $(ss -H -ltn "sport = :$port") ]] || { echo "Occupied port $port"; exit 1; }; done
[[ -z $(dpkg --audit) ]] || { echo 'Finish interrupted dpkg configuration before setup'; exit 1; }
[[ ${1:-} != --check ]] || { echo 'Fresh host and bundle preflight passed; no changes made'; exit 0; }
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt-get update
apt-get install -y --no-install-recommends apache2 php-cli libapache2-mod-php openssl sudo ca-certificates
install -d -m 0750 -o root -g www-data /etc/sam-web-installer /var/lib/sam-web-installer /var/www/sam-web-setup
install -d -m 0700 /usr/local/share/sam-web-installer /var/lib/sam-web-installer/private
cp -a "$ROOT/." /usr/local/share/sam-web-installer/
chown -R root:root /usr/local/share/sam-web-installer
install -m 0640 -o root -g www-data "$ROOT/setup.php" /var/www/sam-web-setup/index.php
install -m 0700 "$ROOT/setup-helper.php" /usr/local/share/sam-web-installer/setup-helper.php
TOKEN=$(php -r 'echo bin2hex(random_bytes(24));')
printf '%s' "$TOKEN" | php -r '$t=stream_get_contents(STDIN);file_put_contents("/etc/sam-web-installer/token.hash",hash("sha256",$t));'
chown root:www-data /etc/sam-web-installer/token.hash
chmod 0640 /etc/sam-web-installer/token.hash
openssl req -x509 -newkey rsa:3072 -nodes -days 7 -subj /CN=SAM-Setup -keyout /etc/sam-web-installer/key.pem -out /etc/sam-web-installer/cert.pem >/dev/null 2>&1
cat > /etc/apache2/sites-available/sam-setup.conf <<'CONF'
Listen 8443
<VirtualHost *:8443>
 DocumentRoot /var/www/sam-web-setup
 SSLEngine on
 SSLCertificateFile /etc/sam-web-installer/cert.pem
 SSLCertificateKeyFile /etc/sam-web-installer/key.pem
 <Directory /var/www/sam-web-setup>
  Require all granted
  Options -Indexes
 </Directory>
</VirtualHost>
CONF
printf '%s\n' 'www-data ALL=(root) NOPASSWD: /usr/bin/php /usr/local/share/sam-web-installer/setup-helper.php start, /usr/bin/php /usr/local/share/sam-web-installer/setup-helper.php status' > /etc/sudoers.d/sam-web-installer
chmod 0440 /etc/sudoers.d/sam-web-installer
visudo -cf /etc/sudoers.d/sam-web-installer
printf "%s\n" "# Setup only 8443" > /etc/apache2/ports.conf
a2dissite 000-default
a2enmod ssl
a2ensite sam-setup
apache2ctl configtest
systemctl restart apache2
echo "Open https://SERVER-IP:8443 (temporary self-signed TLS)"
echo "Installation token: $TOKEN"
openssl x509 -in /etc/sam-web-installer/cert.pem -noout -fingerprint -sha256
