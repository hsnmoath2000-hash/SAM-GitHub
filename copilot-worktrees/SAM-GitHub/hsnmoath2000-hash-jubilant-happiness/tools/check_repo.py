"""Read-only repository checks. Syntax checks do not execute application code."""
import argparse
import json
import pathlib
import re
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
IGNORED = {'.git', 'dist', 'node_modules', 'vendor', '__pycache__'}

def check(syntax=False):
    errors = []
    files = [p for p in ROOT.rglob('*') if p.is_file() and not any(part in IGNORED for part in p.relative_to(ROOT).parts)]
    required = ['application/api.php', 'application/config.php', 'application/index.php', 'application/includes/WalletCommerceService.php', 'database/schema.sql', 'installer/install.sh', 'runtime/archive-metadata.json']
    for rel in required:
        if not (ROOT / rel).is_file():
            errors.append('Missing: ' + rel)
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        runtime_module = rel == 'runtime/etc/freeradius/3.0/mods-available/detail.log'
        if (path.suffix in {'.pem', '.key', '.keystore', '.p12', '.pfx', '.sqlite', '.sqlite3', '.db', '.dump', '.log'} and not runtime_module) or path.name in {'.env', 'app-config.php', 'test-owner.json'} or path.name.endswith('.sql.gz'):
            errors.append('Private/operational file: ' + rel)
        if any(part in {'uploads', 'backups', 'logs', 'sessions', 'downloads', 'auth_info_baileys'} for part in path.relative_to(ROOT).parts):
            errors.append('Operational directory: ' + rel)
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeError, OSError):
            continue
        if path.suffix == '.json':
            try:
                json.loads(text)
            except ValueError:
                errors.append('Invalid JSON: ' + rel)
        # Fragment assembly keeps the check from matching its own source.
        known = ['pala' + 'poxxp', 'Pala' + 'pox@123A']
        if any(secret in text for secret in known) or re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text):
            errors.append('Credential marker: ' + rel)
        if path == ROOT / 'database/schema.sql' and re.search(r'^\s*INSERT\s+INTO\b', text, re.M | re.I):
            errors.append('Data rows in schema: ' + rel)
    config = (ROOT / 'application/config.php').read_text(encoding='utf-8')
    if 'UM_CONFIG_FILE' not in config or '/etc/mikrotik-usermanager/app-config.php' not in config:
        errors.append('Application must load private external configuration')
    metadata = json.loads((ROOT / 'runtime/archive-metadata.json').read_text())
    for rel in metadata['modes']:
        pure = pathlib.PurePosixPath(rel)
        if pure.is_absolute() or '..' in pure.parts or not (ROOT / 'runtime' / rel).is_file():
            errors.append('Invalid runtime member: ' + rel)
    for link in metadata['links']:
        pure = pathlib.PurePosixPath(link['path'])
        target = pathlib.PurePosixPath(link['target'])
        if pure.is_absolute() or '..' in pure.parts or target.is_absolute():
            errors.append('Unsafe runtime link: ' + link['path'])
        resolved = (ROOT / 'runtime' / pure.parent / link['target']).resolve()
        supplied_by_package = link['path'] == 'etc/freeradius/3.0/mods-enabled/eap' and link['target'] == '../mods-available/eap'
        if not resolved.is_relative_to((ROOT / 'runtime').resolve()) or (not resolved.is_file() and not supplied_by_package):
            errors.append('Broken/outside runtime link: ' + link['path'])
    syntax_count = 0
    if syntax:
        for executable in ['php', 'node']:
            if not shutil.which(executable):
                errors.append('Syntax checker missing: ' + executable)
        if not errors:
            for path in files:
                command = ['php', '-l', str(path)] if path.suffix == '.php' else ['node', '--check', str(path)] if path.suffix in {'.js', '.cjs', '.mjs'} else None
                if command:
                    result = subprocess.run(command, capture_output=True, text=True)
                    syntax_count += 1
                    if result.returncode:
                        errors.append('Syntax failed: ' + path.relative_to(ROOT).as_posix() + '\n' + (result.stderr or result.stdout)[:500])
    print(json.dumps({'files_checked': len(files), 'syntax_files_checked': syntax_count, 'errors': errors}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--syntax', action='store_true')
    check(parser.parse_args().syntax)
