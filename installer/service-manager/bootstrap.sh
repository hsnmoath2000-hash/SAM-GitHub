#!/bin/bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run this script as root'; exit 1; }
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -f "$ROOT/SHA256SUMS" ]]; then
 (cd "$ROOT" && sha256sum --quiet -c SHA256SUMS)
else
 REPO_ROOT=$(git -C "$ROOT/../.." rev-parse --show-toplevel 2>/dev/null || true)
 [[ -n "$REPO_ROOT" && "$(cd "$REPO_ROOT" && pwd -P)" == "$(cd "$ROOT/../.." && pwd -P)" ]] || {
  echo 'No service-manager checksum manifest or trusted repository checkout.' >&2
  exit 1
 }
 echo 'No service-manager checksum manifest; continuing with the trusted repository checkout.'
fi
python3 - "$ROOT/manager.py" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
compile(source.read_text(encoding='utf-8'), str(source), 'exec')
PY
bash -n "$ROOT/sam-system-control"
install -d -m 0755 /usr/local/libexec /usr/local/share/sam-service-manager /usr/local/sbin
install -m 0755 "$ROOT/manager.py" /usr/local/libexec/sam-service-manager.py
[[ -f "$ROOT/sam-radius-client.py" ]] && install -m 0755 "$ROOT/sam-radius-client.py" /usr/local/libexec/sam-radius-client.py
[[ -f "$ROOT/sam-port-forward.py" ]] && install -m 0755 "$ROOT/sam-port-forward.py" /usr/local/libexec/sam-port-forward.py
# On an existing server, preserve its other administrative subcommands.
if [[ -f /usr/local/sbin/sam-system-control ]]; then
 python3 "$ROOT/merge_control.py" /usr/local/sbin/sam-system-control
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
