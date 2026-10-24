#!/usr/bin/env bash
# SAM fresh installation. This is not an upgrade/restore script.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
APP=/var/www/mikrotik-usermanager
STEP=preflight
trap 'printf "Stopped at %s (line %s). Inspect the error before retrying; no automatic rollback is attempted.\n" "$STEP" "$LINENO" >&2' ERR
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ ${1:-} == --check || ${1:-} == --install || ${1:-} == --reinstall || ${1:-} == --clean ]] || die 'Usage: sudo bash install.sh --check | --install | --reinstall | --clean'
MODE=$1
do_cleanup(){
  printf 'Cleaning up previous SAM installation and freeing ports...\n'
  systemctl stop nginx apache2 freeradius accel-ppp sam-whatsapp sam-telemetry mikrotik-usermanager-api-worker sam-um-import-sftp 2>/dev/null || true
  for port in 80 443 8099 4406 3388 8088 2221; do
    fuser -k "${port}/tcp" 2>/dev/null || true
  done
  for port in 1812 1813 3799; do
    fuser -k "${port}/udp" 2>/dev/null || true
  done
  sleep 1
  rm -rf "$APP" /etc/mikrotik-usermanager /etc/accel-ppp/accel-ppp.conf
  if command -v mariadb >/dev/null && mariadb -NBe 'SELECT 1' >/dev/null 2>&1; then
    mariadb -e "DROP DATABASE IF EXISTS radius;" 2>/dev/null || true
  fi
}

if [[ $MODE == --clean ]]; then
  [[ $EUID == 0 ]] || die 'Run as root.'
  do_cleanup
  echo 'Cleanup completed successfully.'
  exit 0
fi
if [[ $MODE == --reinstall ]]; then
  [[ $EUID == 0 ]] || die 'Run as root.'
  do_cleanup
  MODE=--install
fi
[[ $EUID == 0 ]] || die 'Run as root.'
[[ -z $(dpkg --audit) ]] || die 'Package manager interrupted: finish dpkg --configure -a before installation.'
source /etc/os-release
[[ $ID == ubuntu && ( $VERSION_ID == 22.04 || $VERSION_ID == 24.04 ) ]] || die 'Requires Ubuntu 22.04/24.04 LTS.'
[[ $(uname -m) == x86_64 ]] || die 'Requires x86_64.'
if [[ -e $APP || -e /etc/mikrotik-usermanager || -e /etc/accel-ppp/accel-ppp.conf ]]; then
  if [[ -t 0 ]]; then
    read -r -p 'Existing SAM installation detected. Clean up and reinstall? [y/N]: ' confirm_clean
    if [[ $confirm_clean =~ ^[Yy]$ ]]; then
      do_cleanup
    else
      die 'Existing SAM installation. No files changed.'
    fi
  else
    die 'Existing SAM installation. Use --reinstall to clean and install.'
  fi
fi
IS_REPO=0
if [[ -d "$ROOT/application" && -d "$ROOT/runtime" && -f "$ROOT/database/schema.sql" ]]; then
  IS_REPO=1
  SRC_DIR="$ROOT"
  INSTALLER_DIR="$ROOT/installer"
elif [[ -d "$ROOT/../application" && -d "$ROOT/../runtime" && -f "$ROOT/../database/schema.sql" ]]; then
  IS_REPO=1
  SRC_DIR="$ROOT/.."
  INSTALLER_DIR="$ROOT"
fi

if [[ $IS_REPO -eq 1 ]]; then
  # Direct repository installation mode
  SCHEMA_SQL="$SRC_DIR/database/schema.sql"
  TRIGGERS_SQL="$SRC_DIR/database/triggers.sql"
  BOOTSTRAP_PHP="$INSTALLER_DIR/bootstrap.php"
  RENDER_RUNTIME_PY="$INSTALLER_DIR/render_runtime.py"
  ACCEL_TAR="$INSTALLER_DIR/payload/accel-ppp-1.14.0.tar.gz"
  [[ -f "$ACCEL_TAR" ]] || ACCEL_TAR="$INSTALLER_DIR/service-manager/accel-ppp-1.14.0.tar.gz"
  SERVICE_MGR_DIR="$INSTALLER_DIR/service-manager"
  for f in "$SCHEMA_SQL" "$TRIGGERS_SQL" "$BOOTSTRAP_PHP" "$RENDER_RUNTIME_PY" "$ACCEL_TAR"; do
    [[ -s "$f" ]] || die "Missing required file: $f"
  done
else
  # Standalone installer bundle mode
  [[ -s $ROOT/SHA256SUMS ]] || die 'Complete bundle required, not install.sh alone.'
  (cd "$ROOT" && sha256sum --quiet -c SHA256SUMS) || die 'Release checksum failed.'
  for file in application.tar.gz runtime.tar.gz database/schema.sql database/triggers.sql bootstrap.php render_runtime.py payload/accel-ppp-1.14.0.tar.gz; do
    [[ -s $ROOT/$file ]] || die "Missing: $file"
  done
  SCHEMA_SQL="$ROOT/database/schema.sql"
  TRIGGERS_SQL="$ROOT/database/triggers.sql"
  BOOTSTRAP_PHP="$ROOT/bootstrap.php"
  RENDER_RUNTIME_PY="$ROOT/render_runtime.py"
  ACCEL_TAR="$ROOT/payload/accel-ppp-1.14.0.tar.gz"
  SERVICE_MGR_DIR="$ROOT/service-manager"
fi
if command -v mariadb >/dev/null; then
 mariadb -NBe 'SELECT 1' >/dev/null || die 'Cannot inspect existing database safely.'
 if [[ $(mariadb -NBe "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='radius'") -gt 0 ]]; then
  if [[ -t 0 ]]; then
    read -r -p 'Existing radius database detected. Drop and recreate? [y/N]: ' confirm_db
    if [[ $confirm_db =~ ^[Yy]$ ]]; then
      mariadb -e "DROP DATABASE IF EXISTS radius;"
    else
      die 'Existing radius database.'
    fi
  else
    die 'Existing radius database. Use --reinstall to clean and install.'
  fi
fi
fi
for port in 80 443 8099 4406 3388 8088 2221; do
 if [[ -n $(ss -H -ltn "sport = :$port") ]]; then
   if [[ -t 0 ]]; then
     read -r -p "TCP $port is occupied. Stop conflicting services automatically? [y/N]: " confirm_port
     if [[ $confirm_port =~ ^[Yy]$ ]]; then
       systemctl stop nginx apache2 freeradius accel-ppp sam-whatsapp sam-telemetry mikrotik-usermanager-api-worker sam-um-import-sftp 2>/dev/null || true
       fuser -k "${port}/tcp" 2>/dev/null || true
       sleep 1
     fi
   fi
   [[ -z $(ss -H -ltn "sport = :$port") ]] || die "TCP $port is occupied; requires an empty host."
 fi
done
for port in 1812 1813 3799; do
 [[ -z $(ss -H -lun "sport = :$port") ]] || die "UDP $port is occupied."
done
echo 'Host and bundle preflight passed. No changes made.'
[[ $MODE == --install ]] || exit 0
SAM_DOMAIN=${SAM_DOMAIN:-}
[[ -n $SAM_DOMAIN ]] || read -r -p 'Public DNS name: ' SAM_DOMAIN
[[ $SAM_DOMAIN =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && $SAM_DOMAIN == *.* ]] || die 'Invalid domain.'
SAM_OWNER_USER=${SAM_OWNER_USER:-owner}
SAM_OWNER_NAME=${SAM_OWNER_NAME:-مالك النظام}
SAM_NETWORK_NAME=${SAM_NETWORK_NAME:-الشبكة الافتراضية}
SAM_TIMEZONE=${SAM_TIMEZONE:-Asia/Aden}
SAM_OWNER_PHONE=${SAM_OWNER_PHONE:-}
[[ $SAM_OWNER_USER =~ ^[A-Za-z0-9_.-]{3,64}$ ]] || die 'Invalid owner username.'
[[ $SAM_TIMEZONE != *..* && -f /usr/share/zoneinfo/$SAM_TIMEZONE ]] || die 'Invalid IANA timezone.'
if [[ -z ${SAM_OWNER_PASSWORD:-} ]]; then
 read -r -s -p 'NEW owner password (12+ characters): ' SAM_OWNER_PASSWORD; echo
 read -r -s -p 'Confirm password: ' confirmation; echo
 [[ $confirmation == "$SAM_OWNER_PASSWORD" ]] || die 'Passwords differ.'
 unset confirmation
fi
[[ ${#SAM_OWNER_PASSWORD} -ge 12 ]] || die 'Password needs 12+ characters.'
SAM_TLS_CERT=${SAM_TLS_CERT:-}; SAM_TLS_KEY=${SAM_TLS_KEY:-}
if [[ -n $SAM_TLS_CERT || -n $SAM_TLS_KEY ]]; then
 [[ -r $SAM_TLS_CERT && -r $SAM_TLS_KEY ]] || die 'Certificate and key both required.'
 openssl x509 -in "$SAM_TLS_CERT" -noout -checkend 86400 >/dev/null || die 'Certificate expires too soon.'
 openssl x509 -in "$SAM_TLS_CERT" -noout -checkhost "$SAM_DOMAIN" | grep -q 'does match' || die 'TLS hostname mismatch.'
 [[ $(openssl x509 -in "$SAM_TLS_CERT" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256) == $(openssl pkey -in "$SAM_TLS_KEY" -pubout -outform DER | openssl dgst -sha256) ]] || die 'TLS key mismatch.'
else
 echo 'A NEW self-signed bootstrap TLS certificate will be generated. Replace before public use.'
fi
exec 9>/run/lock/sam-fresh-install.lock
flock -n 9 || die 'Another installer is running.'
export SAM_DOMAIN SAM_OWNER_USER SAM_OWNER_NAME SAM_OWNER_PHONE SAM_NETWORK_NAME SAM_TIMEZONE SAM_OWNER_PASSWORD
echo "SAM_STEP: packages"
STEP=packages
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt-get update
apt-get install -y ca-certificates curl gnupg software-properties-common
if [[ $VERSION_ID == 22.04 ]]; then add-apt-repository -y ppa:ondrej/php; fi
curl --connect-timeout 15 --max-time 120 --retry 3 --proto '=https' --tlsv1.2 -fsS https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /run/sam-nodesource.key
gpg --batch --yes --dearmor -o /usr/share/keyrings/nodesource.gpg /run/sam-nodesource.key
chmod 0644 /usr/share/keyrings/nodesource.gpg
printf '%s\n' 'deb [arch=amd64 signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
chmod 0644 /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y apache2 mariadb-server mariadb-client freeradius freeradius-mysql freeradius-utils \
 php8.3-cli php8.3-fpm php8.3-mysql php8.3-curl php8.3-mbstring php8.3-xml php8.3-zip php8.3-gd php8.3-intl php8.3-bcmath php8.3-sqlite3 php-tcpdf \
 nodejs git openssh-server redis-server cron sudo ufw fail2ban rsync python3 cmake make gcc g++ pkg-config libssl-dev libpcre3-dev \
 libpcre2-dev libreadline-dev libnl-3-dev libnl-genl-3-dev libnl-route-3-dev libmnl-dev libnetfilter-conntrack-dev iproute2 iptables ppp fonts-noto-core
timedatectl set-timezone "$SAM_TIMEZONE"
update-alternatives --set php /usr/bin/php8.3
systemctl enable --now mariadb
echo "SAM_STEP: application"
STEP=application
install -d -m 0750 -o root -g www-data "$APP" /etc/mikrotik-usermanager
if [[ $IS_REPO -eq 1 ]]; then
  cp -rf "$SRC_DIR/application"/* "$APP/"
else
  tar -xzf "$ROOT/application.tar.gz" -C "$APP" --strip-components=1 --no-same-owner
fi
chown -R root:www-data "$APP"
find "$APP" -type d -exec chmod 0750 {} +
find "$APP" -type f -exec chmod 0640 {} +
for path in uploads downloads; do install -d -m 0750 -o www-data -g www-data "$APP/$path"; done
for path in proxy exports uploads whatsapp um-import; do install -d -m 0750 -o www-data -g www-data "/var/lib/mikrotik-usermanager/$path"; done
install -d -m 0700 /var/backups/mikrotik-usermanager
install -d -m 0755 "$APP/assets/fonts"
if [[ -f /usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf ]]; then
 install -m 0644 /usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf "$APP/assets/fonts/SAMArabic.ttf"
fi
echo "SAM_STEP: database"
STEP=database
SAM_DB_PASSWORD=$(openssl rand -hex 32); SAM_RADIUS_SECRET=$(openssl rand -hex 32)
export SAM_DB_PASSWORD SAM_RADIUS_SECRET
mariadb <<SQL
CREATE DATABASE radius CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE OR REPLACE USER 'sam_app'@'localhost' IDENTIFIED BY '$SAM_DB_PASSWORD';
CREATE OR REPLACE USER 'sam_app'@'127.0.0.1' IDENTIFIED BY '$SAM_DB_PASSWORD';
GRANT ALL ON radius.* TO 'sam_app'@'localhost';
GRANT ALL ON radius.* TO 'sam_app'@'127.0.0.1';
SQL
mariadb radius < "$SCHEMA_SQL"
php8.3 "$BOOTSTRAP_PHP"
mariadb radius < "$TRIGGERS_SQL"
unset SAM_OWNER_PASSWORD
chown root:www-data /etc/mikrotik-usermanager/app-config.php
echo "SAM_STEP: runtime"
STEP=runtime
if [[ $IS_REPO -eq 1 ]]; then
  cp -rf "$SRC_DIR/runtime"/* /
else
  tar -xzf "$ROOT/runtime.tar.gz" -C / --no-same-owner
fi
python3 "$RENDER_RUNTIME_PY"
chown -R root:freerad /etc/freeradius/3.0
find /etc/freeradius/3.0 -type d -exec chmod 0750 {} +
find /etc/freeradius/3.0 -type f -exec chmod 0640 {} +
install -d -m 0750 /etc/accel-ppp /var/lib/accel-ppp /var/log/accel-ppp/sessions
if [[ -n $SAM_TLS_CERT ]]; then
 install -m 0644 "$SAM_TLS_CERT" /etc/accel-ppp/server.crt
 install -m 0600 "$SAM_TLS_KEY" /etc/accel-ppp/server.key
else
 openssl req -x509 -newkey rsa:3072 -nodes -days 365 -subj "/CN=$SAM_DOMAIN" -addext "subjectAltName=DNS:$SAM_DOMAIN" -keyout /etc/accel-ppp/server.key -out /etc/accel-ppp/server.crt 2>/dev/null
 chmod 0600 /etc/accel-ppp/server.key
fi
echo "SAM_STEP: accel-build"
STEP=accel-build
BUILD=$(mktemp -d /var/tmp/sam-accel.XXXXXX)
tar -xzf "$ACCEL_TAR" -C "$BUILD" --strip-components=1
cmake -S "$BUILD" -B "$BUILD/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_INSTALL_SYSCONFDIR=/etc/accel-ppp -DSHAPER=FALSE -DLUA=FALSE -DBUILD_IPOE_DRIVER=FALSE -DBUILD_VLAN_MON_DRIVER=FALSE -DBUILD_PPTP_DRIVER=FALSE
cmake --build "$BUILD/build" -j2
cmake --install "$BUILD/build"
ldconfig
python3 "$RENDER_RUNTIME_PY"
echo "SAM_STEP: node-dependencies"
STEP=node-dependencies
for component in whatsapp telemetry; do
 (cd "$APP/services/$component" && npm ci --omit=dev --ignore-scripts)
 chown -R root:www-data "$APP/services/$component/node_modules"
 find "$APP/services/$component/node_modules" -type d -exec chmod 0750 {} +
 find "$APP/services/$component/node_modules" -type f -exec chmod g+r,o-rwx {} +
done
echo "SAM_STEP: services"
STEP=services
bash "$SERVICE_MGR_DIR/bootstrap.sh"
sysctl -p /etc/sysctl.d/90-sam-forward.conf
systemctl restart mariadb
groupadd -f sam_um_importers
ssh-keygen -A
install -d -m 0755 /run/sshd
a2dissite 000-default 2>/dev/null || true
a2enmod ssl rewrite headers proxy_fcgi setenvif >/dev/null
a2dismod -f php8.3 2>/dev/null || true
a2enconf php8.3-fpm sam-port >/dev/null
a2ensite sam >/dev/null
visudo -cf /etc/sudoers.d/sam-fresh
printf 'Listen 80\n<IfModule ssl_module>\n Listen 443\n</IfModule>\n' > /etc/apache2/ports.conf
apache2ctl configtest
freeradius -XC >/dev/null 2>&1 || die 'FreeRADIUS configuration failed; inspect using freeradius -XC.'
/usr/sbin/sshd -t -f /etc/ssh/sshd_config_sam_um_import
find "$APP" -path '*/node_modules' -prune -o -type f -name '*.php' -print0 | xargs -0 -r -n1 php8.3 -l >/dev/null
systemctl daemon-reload
for service in php8.3-fpm apache2 freeradius accel-ppp mikrotik-usermanager-api-worker sam-whatsapp sam-telemetry sam-um-import-sftp redis-server cron fail2ban; do
 systemctl enable "$service" >/dev/null
 systemctl restart "$service"
 systemctl is-active --quiet "$service" || die "Service failed: $service"
done
echo "SAM_STEP: health"
STEP=health
declare -A SAM_RESTARTS
for service in sam-whatsapp sam-telemetry mikrotik-usermanager-api-worker freeradius accel-ppp; do
 SAM_RESTARTS[$service]=$(systemctl show "$service" -p NRestarts --value)
done
sleep 20
for service in "${!SAM_RESTARTS[@]}"; do
 systemctl is-active --quiet "$service" || die "Service unstable: $service"
 [[ $(systemctl show "$service" -p NRestarts --value) == "${SAM_RESTARTS[$service]}" ]] || die "Service restarting: $service"
done
curl -fsS http://127.0.0.1:8099/api/v1/health >/dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8099/api.php?action=get_profiles') == 401 ]] || die 'Unauthenticated API guard failed.'
unset SAM_DB_PASSWORD SAM_RADIUS_SECRET
echo "Installed: https://$SAM_DOMAIN/ ; owner portal: /owner.php"
echo 'Firewall unchanged to avoid SSH lockout. Follow README before exposing public access.'
echo 'Pair WhatsApp, configure Telegram/FCM, replace bootstrap TLS if used, then commission a test router.'
