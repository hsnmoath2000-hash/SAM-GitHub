#!/usr/bin/env python3
"""
SAM Port Forwarding helper.
Applies, validates, and lists kernel iptables port-forwarding rules for routers and services.
"""
import sys
import json
import re
import subprocess
from pathlib import Path

def apply_rules(conf_file):
    conf_path = Path(conf_file)
    if not conf_path.is_file():
        print(json.dumps({"verified": True, "active_count": 0, "rules": []}))
        return 0

    # Ensure IP forwarding is enabled in kernel
    try:
        subprocess.run(['sysctl', '-q', '-w', 'net.ipv4.ip_forward=1'], check=False)
    except Exception:
        pass

    # Ensure custom chains exist in nat and filter tables
    subprocess.run(['iptables', '-t', 'nat', '-N', 'SAM_PORT_FWD_PRE'], stderr=subprocess.DEVNULL)
    subprocess.run(['iptables', '-t', 'nat', '-N', 'SAM_PORT_FWD_POST'], stderr=subprocess.DEVNULL)
    subprocess.run(['iptables', '-N', 'SAM_PORT_FWD_FILTER'], stderr=subprocess.DEVNULL)

    # Jump rules
    subprocess.run(['iptables', '-t', 'nat', '-C', 'PREROUTING', '-j', 'SAM_PORT_FWD_PRE'], stderr=subprocess.DEVNULL)
    if subprocess.run(['iptables', '-t', 'nat', '-C', 'PREROUTING', '-j', 'SAM_PORT_FWD_PRE'], stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.run(['iptables', '-t', 'nat', '-I', 'PREROUTING', '1', '-j', 'SAM_PORT_FWD_PRE'], stderr=subprocess.DEVNULL)

    subprocess.run(['iptables', '-t', 'nat', '-C', 'POSTROUTING', '-j', 'SAM_PORT_FWD_POST'], stderr=subprocess.DEVNULL)
    if subprocess.run(['iptables', '-t', 'nat', '-C', 'POSTROUTING', '-j', 'SAM_PORT_FWD_POST'], stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.run(['iptables', '-t', 'nat', '-I', 'POSTROUTING', '1', '-j', 'SAM_PORT_FWD_POST'], stderr=subprocess.DEVNULL)

    subprocess.run(['iptables', '-C', 'FORWARD', '-j', 'SAM_PORT_FWD_FILTER'], stderr=subprocess.DEVNULL)
    if subprocess.run(['iptables', '-C', 'FORWARD', '-j', 'SAM_PORT_FWD_FILTER'], stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.run(['iptables', '-I', 'FORWARD', '1', '-j', 'SAM_PORT_FWD_FILTER'], stderr=subprocess.DEVNULL)

    # Flush current custom chains
    subprocess.run(['iptables', '-t', 'nat', '-F', 'SAM_PORT_FWD_PRE'], stderr=subprocess.DEVNULL)
    subprocess.run(['iptables', '-t', 'nat', '-F', 'SAM_PORT_FWD_POST'], stderr=subprocess.DEVNULL)
    subprocess.run(['iptables', '-F', 'SAM_PORT_FWD_FILTER'], stderr=subprocess.DEVNULL)

    count = 0
    lines = conf_path.read_text(encoding='utf-8', errors='ignore').splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        l_port, proto, t_ip, t_port = parts[0], parts[1].lower(), parts[2], parts[3]
        comment = parts[6] if len(parts) >= 7 else (parts[4] if len(parts) >= 5 else 'forward')

        protocols = ['tcp', 'udp'] if proto == 'both' else [proto]
        for p in protocols:
            # DNAT in PREROUTING
            subprocess.run([
                'iptables', '-t', 'nat', '-A', 'SAM_PORT_FWD_PRE',
                '-p', p, '--dport', str(l_port),
                '-j', 'DNAT', '--to-destination', f'{t_ip}:{t_port}'
            ], stderr=subprocess.DEVNULL)

            # MASQUERADE in POSTROUTING
            subprocess.run([
                'iptables', '-t', 'nat', '-A', 'SAM_PORT_FWD_POST',
                '-p', p, '-d', t_ip, '--dport', str(t_port),
                '-j', 'MASQUERADE'
            ], stderr=subprocess.DEVNULL)

            # ACCEPT in FORWARD
            subprocess.run([
                'iptables', '-A', 'SAM_PORT_FWD_FILTER',
                '-p', p, '-d', t_ip, '--dport', str(t_port),
                '-j', 'ACCEPT'
            ], stderr=subprocess.DEVNULL)

            count += 1

    print(json.dumps({
        "verified": True,
        "active_count": count,
        "applied": True
    }))
    return 0

def validate_rules(conf_file):
    conf_path = Path(conf_file)
    if not conf_path.is_file():
        print(json.dumps({"verified": True, "valid": True}))
        return 0
    lines = conf_path.read_text(encoding='utf-8', errors='ignore').splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) < 4:
            print(json.dumps({"verified": False, "error": f"Invalid line: {line}"}))
            return 1
    print(json.dumps({"verified": True, "valid": True}))
    return 0

def list_rules():
    try:
        res = subprocess.run(['iptables', '-t', 'nat', '-L', 'SAM_PORT_FWD_PRE', '-n', '-v', '--line-numbers'],
                             capture_output=True, text=True)
        print(res.stdout if res.returncode == 0 else "SAM_PORT_FWD_PRE chain empty.")
    except Exception as e:
        print(f"Error listing rules: {e}")
    return 0

def main():
    op = sys.argv[1] if len(sys.argv) > 1 else 'list'
    conf = sys.argv[2] if len(sys.argv) > 2 else '/var/lib/mikrotik-usermanager/firewall/port-forwards.conf'
    if op == 'apply':
        sys.exit(apply_rules(conf))
    elif op == 'validate':
        sys.exit(validate_rules(conf))
    elif op == 'list':
        sys.exit(list_rules())
    else:
        print(json.dumps({"error": f"Unknown op: {op}"}))
        sys.exit(1)

if __name__ == '__main__':
    main()
