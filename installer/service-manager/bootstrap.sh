#!/bin/bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run this script as root'; exit 1; }
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
(cd "$ROOT" && sha256sum -c SHA256SUMS)
python3 -m py_compile "$ROOT/manager.py"
bash -n "$ROOT/sam-system-control"
install -d -m 0755 /usr/local/libexec /usr/local/share/sam-service-manager /usr/local/sbin
install -m 0755 "$ROOT/manager.py" /usr/local/libexec/sam-service-manager.py
[[ -f "$ROOT/sam-radius-client.py" ]] && install -m 0755 "$ROOT/sam-radius-client.py" /usr/local/libexec/sam-radius-client.py
[[ -f "$ROOT/sam-port-forward.py" ]] && install -m 0755 "$ROOT/sam-port-forward.py" /usr/local/libexec/sam-port-forward.py
# On an existing server, preserve its other administrative subcommands.
if [[ -f /usr/local/sbin/sam-system-control ]]; then
 python3 - <<'PY'
from pathlib import Path
p=Path('/usr/local/sbin/sam-system-control');s=p.read_text()
if '  service-manager)' not in s:s=s.replace('case "${1:-}" in','case "${1:-}" in\n  service-manager)\n    exec /usr/bin/python3 /usr/local/libexec/sam-service-manager.py "${@:2}"\n    ;;',1)
s=s.replace('apache2|php8.3-fpm|freeradius|mariadb|accel-ppp|sam-telemetry|sam-whatsapp|mikrotik-whatsapp|mikrotik-usermanager-api-worker)', 'apache2|php8.[1-9]-fpm|freeradius|mariadb|accel-ppp|sam-telemetry|sam-whatsapp|mikrotik-whatsapp|mikrotik-usermanager-api-worker|redis-server|cron)')
temp=p.with_name(p.name+'.sam-ready');temp.write_text(s);temp.chmod(0o755);temp.replace(p)
PY
else install -m 0755 "$ROOT/sam-system-control" /usr/local/sbin/sam-system-control
fi
for UNIT in sam-telemetry sam-whatsapp mikrotik-usermanager-api-worker accel-ppp; do
 install -m 0644 "$ROOT/$UNIT.service" "/usr/local/share/sam-service-manager/$UNIT.service"
done
install -m 0644 "$ROOT/accel-ppp-1.14.0.tar.gz" /usr/local/share/sam-service-manager/
SUDO_TMP=$(mktemp)
trap 'rm -f "$SUDO_TMP"' EXIT
printf '%s\n' 'www-data ALL=(root) NOPASSWD: /usr/local/sbin/sam-system-control service *, /usr/local/sbin/sam-system-control service-manager *' > "$SUDO_TMP"
visudo -cf "$SUDO_TMP" >/dev/null
install -m 0440 "$SUDO_TMP" /etc/sudoers.d/sam-service-manager
echo 'SAM service control initialized; no service was stopped or restarted.'
