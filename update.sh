#!/usr/bin/env bash
# ==============================================================================
# SAM System Synchronizer & Updater (محدث ومزامن نظام سام مع المستودع)
# ==============================================================================
set -Eeuo pipefail
umask 022

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
APP="/var/www/mikrotik-usermanager"

die() { printf "\e[31m[ERROR]\e[0m %s\n" "$*" >&2; exit 1; }
info() { printf "\e[32m[SAM-SYNC]\e[0m %s\n" "$*"; }

[[ $EUID -eq 0 ]] || die "يجب تشغيل السكربت بصلاحيات root: sudo bash update.sh"
[[ -d "$APP" ]] || die "مجلد النظام $APP غير موجود."

info "1/4: تحديث ومزامنة ملفات لوحة التحكم وتطبيقات الويب..."
if [[ -d "$ROOT/application" ]]; then
  cp -rf "$ROOT/application"/* "$APP/"
fi

chown -R root:www-data "$APP"
find "$APP" -type d -exec chmod 0750 {} +
find "$APP" -type f -exec chmod 0640 {} +
for path in uploads downloads; do
  install -d -m 0750 -o www-data -g www-data "$APP/$path"
done
for path in proxy exports uploads whatsapp um-import firewall; do
  install -d -m 0750 -o www-data -g www-data "/var/lib/mikrotik-usermanager/$path"
done

info "2/4: تثبيت سكربتات التحكم وإدارة FreeRADIUS..."
install -d -m 0755 /usr/local/libexec /usr/local/sbin

if [[ -f "$ROOT/installer/service-manager/sam-system-control" ]]; then
  install -m 0755 "$ROOT/installer/service-manager/sam-system-control" /usr/local/sbin/sam-system-control
fi
if [[ -f "$ROOT/installer/service-manager/sam-radius-client.py" ]]; then
  install -m 0755 "$ROOT/installer/service-manager/sam-radius-client.py" /usr/local/libexec/sam-radius-client.py
fi
if [[ -f "$ROOT/installer/service-manager/sam-port-forward.py" ]]; then
  install -m 0755 "$ROOT/installer/service-manager/sam-port-forward.py" /usr/local/libexec/sam-port-forward.py
fi

if [[ ! -f /etc/sudoers.d/sam-fresh ]]; then
  printf 'www-data ALL=(root) NOPASSWD: /usr/local/sbin/sam-system-control *\n' > /etc/sudoers.d/sam-fresh
  chmod 0440 /etc/sudoers.d/sam-fresh
fi

info "3/4: تطبيق ترقيات قاعدة البيانات الآمنة..."
if command -v mariadb >/dev/null && mariadb -NBe 'SELECT 1' >/dev/null 2>&1; then
  mariadb radius -e "ALTER TABLE um_wallet_sales ADD COLUMN IF NOT EXISTS customer_paid_amount DECIMAL(14,2) DEFAULT NULL;" 2>/dev/null || true
fi

info "4/4: إعادة تحميل خدمات FreeRADIUS و PHP..."
systemctl reload freeradius 2>/dev/null || systemctl restart freeradius 2>/dev/null || true
for s in php8.3-fpm apache2 sam-whatsapp sam-telemetry mikrotik-usermanager-api-worker accel-ppp; do
  if systemctl list-unit-files "$s.service" &>/dev/null; then
    systemctl restart "$s" 2>/dev/null || true
  fi
done

echo ""
printf "\e[1;32m✓ اكتمل تحديث النظام ومزامنته مع المستودع بنجاح!\e[0m\n"
