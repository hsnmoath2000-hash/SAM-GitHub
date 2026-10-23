#!/usr/bin/python3
"""Safely add service-manager support to an existing SAM control script."""
import os
import subprocess
import sys
from pathlib import Path


HANDLER = 'exec /usr/bin/python3 /usr/local/libexec/sam-service-manager.py "${@:2}"'
SERVICE_CASE = 'case "$unit" in '
SERVICE_CASE_END = ' ;; *) exit 2;; esac'
ADDITIONAL_UNITS = ('php8.[1-9]-fpm', 'redis-server', 'cron')


def merge_control(source):
    route_lines = [index for index, line in enumerate(source.splitlines()) if line.strip() == 'service-manager)']
    if len(route_lines) > 1:
        raise ValueError('Existing control script has duplicate service-manager commands.')
    if route_lines:
        route = source.splitlines()[route_lines[0] + 1:route_lines[0] + 3]
        if len(route) != 2 or route[0].strip() != HANDLER or route[1].strip() != ';;':
            raise ValueError('Existing service-manager command uses an unsupported handler.')
    else:
        marker = 'case "${1:-}" in'
        if source.count(marker) != 1:
            raise ValueError('Cannot safely add service-manager command to existing control script.')
        source = source.replace(
            marker,
            marker + '\n  service-manager)\n    ' + HANDLER + '\n    ;;',
            1,
        )

    lines = source.splitlines(keepends=True)
    service_lines = [index for index, line in enumerate(lines) if SERVICE_CASE in line]
    if len(service_lines) != 1:
        raise ValueError('Cannot safely update the existing service allowlist.')
    index = service_lines[0]
    line = lines[index]
    body = line.rstrip('\r\n')
    if body.count(SERVICE_CASE) != 1 or not body.endswith(SERVICE_CASE_END):
        raise ValueError('Existing service allowlist has an unsupported format.')
    units = body[len(SERVICE_CASE):-len(SERVICE_CASE_END)].split('|')
    for unit in ADDITIONAL_UNITS:
        if unit not in units:
            units.append(unit)
    newline = '\r\n' if line.endswith('\r\n') else '\n' if line.endswith('\n') else ''
    indentation = body[:body.index(SERVICE_CASE)]
    lines[index] = indentation + SERVICE_CASE + '|'.join(units) + SERVICE_CASE_END + newline
    merged = ''.join(lines)
    return merged


def update_file(path):
    target = Path(path)
    original = target.read_text(encoding='utf-8')
    merged = merge_control(original)
    check = subprocess.run(['/bin/bash', '-n'], input=merged, text=True, capture_output=True)
    if check.returncode:
        raise RuntimeError('Merged service control script failed bash syntax validation.')
    if merged == original:
        return

    temporary = target.with_name(target.name + '.sam-ready')
    try:
        temporary.write_text(merged, encoding='utf-8')
        temporary.chmod(target.stat().st_mode & 0o777)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: merge_control.py PATH')
    update_file(sys.argv[1])
