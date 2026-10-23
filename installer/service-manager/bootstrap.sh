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
 python3 - <<'PY'
from pathlib import Path
import os
import re
import subprocess

p = Path('/usr/local/sbin/sam-system-control')
s = p.read_text()
handler = 'exec /usr/bin/python3 /usr/local/libexec/sam-service-manager.py "${@:2}"'
if handler not in s:
    if re.search(r'(?m)^\s*service-manager\)\s*$', s):
        raise SystemExit('Existing service-manager command uses an unsupported handler.')
    marker = 'case "${1:-}" in'
    if s.count(marker) != 1:
        raise SystemExit('Cannot safely add service-manager command to existing control script.')
    s = s.replace(
        marker,
        marker + '\n  service-manager)\n'
        '    ' + handler + '\n'
        '    ;;',
        1,
    )

pattern = re.compile(r'(?m)^(\s*case "\$unit" in )([^\n]+?)( ;; \*) exit 2;; esac)$')
matches = list(pattern.finditer(s))
if len(matches) != 1:
    raise SystemExit('Cannot safely update the existing service allowlist.')
match = matches[0]
units = match.group(2).split('|')
for unit in ('php8.[1-9]-fpm', 'redis-server', 'cron'):
    if unit not in units:
        units.append(unit)
s = s[:match.start(2)] + '|'.join(units) + s[match.end(2):]
if handler not in s:
    raise SystemExit('Service-manager command registration failed.')

temp = p.with_name(p.name + '.sam-ready')
try:
    temp.write_text(s)
    temp.chmod(p.stat().st_mode & 0o777)
    with temp.open('rb') as script:
        subprocess.run(['/bin/bash', '-n'], stdin=script, check=True)
    os.replace(temp, p)
finally:
    temp.unlink(missing_ok=True)
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
