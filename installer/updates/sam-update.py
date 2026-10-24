#!/usr/bin/env python3
"""Root-owned verifier and rollback-capable application updater for SAM."""
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path('/var/www/mikrotik-usermanager')
STATE = pathlib.Path('/var/lib/mikrotik-usermanager/updates')
INCOMING = STATE / 'incoming'
BACKUPS = pathlib.Path('/var/backups/mikrotik-usermanager/updates')
PUBLIC_KEY = pathlib.Path('/usr/local/share/sam-updater/release-public.pem')
LOCK = pathlib.Path('/run/lock/sam-update.lock')
PRESERVE = {'uploads', 'downloads', 'node_modules', 'vendor', 'logs', 'backups'}
MAX_BUNDLE = 64 * 1024**2
MAX_FILES = 100000
MAX_UNPACKED = 4 * 1024**3

class UpdateError(Exception):
    pass

def run(argv, *, capture=False):
    return subprocess.run(argv, check=True, text=True, stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)

def safe_id(value):
    if len(value) != 32 or any(c not in '0123456789abcdef' for c in value):
        raise UpdateError('Invalid update id')
    return value

def stage_path(update_id):
    return INCOMING / (safe_id(update_id) + '.tar.gz')

def validate_archive(path, extract_to=None):
    if not path.is_file() or path.stat().st_size > MAX_BUNDLE:
        raise UpdateError('Update archive missing or too large')
    with tarfile.open(path, 'r:gz') as outer:
        members = outer.getmembers()
        names = {m.name: m for m in members}
        if len(members) != 3 or set(names) != {'release.json', 'release.sig', 'application.tar.gz'}:
            raise UpdateError('Unsupported update package layout')
        if any(not m.isfile() for m in members):
            raise UpdateError('Links and special files are forbidden in update package')
        if names['release.json'].size > 65536 or names['release.sig'].size != 64 or names['application.tar.gz'].size > MAX_BUNDLE:
            raise UpdateError('Invalid release metadata or payload size')
        release_bytes = outer.extractfile(names['release.json']).read()
        signature = outer.extractfile(names['release.sig']).read()
        release = json.loads(release_bytes)
        if release.get('format') != 'sam-update-v1' or not isinstance(release.get('version'), str):
            raise UpdateError('Unsupported release format')
        if not PUBLIC_KEY.is_file():
            raise UpdateError('Trusted signing key is not installed')
        with tempfile.TemporaryDirectory(prefix='sam-update-verify-') as td:
            td = pathlib.Path(td)
            (td / 'release.json').write_bytes(release_bytes)
            (td / 'release.sig').write_bytes(signature)
            run(['/usr/bin/openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(PUBLIC_KEY), '-rawin',
                 '-in', str(td / 'release.json'), '-sigfile', str(td / 'release.sig')])
            app_member = names['application.tar.gz']
            app_stream = outer.extractfile(app_member)
            digest = hashlib.sha256()
            temp_path = None
            if extract_to is not None:
                fd, temp_name = tempfile.mkstemp(prefix='sam-app-payload-', suffix='.tar.gz')
                temp_path = pathlib.Path(temp_name)
                with os.fdopen(fd, 'wb') as output:
                    while True:
                        chunk = app_stream.read(1024 * 1024)
                        if not chunk: break
                        digest.update(chunk)
                        output.write(chunk)
            else:
                while True:
                    chunk = app_stream.read(1024 * 1024)
                    if not chunk: break
                    digest.update(chunk)
        if digest.hexdigest() != release.get('files', {}).get('application.tar.gz'):
            if temp_path: temp_path.unlink(missing_ok=True)
            raise UpdateError('Application payload checksum mismatch')
        if release.get('database_migrations') != []:
            raise UpdateError('This updater accepts code-only releases; database migrations require a separately reviewed migration package')
        if extract_to is not None:
            try:
                extract_application(temp_path, extract_to)
            finally:
                temp_path.unlink(missing_ok=True)
        return release

def extract_application(payload_path, destination):
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    unpacked = 0
    seen = set()
    with tarfile.open(payload_path, mode='r:gz') as app:
        members = app.getmembers()
        if len(members) > MAX_FILES:
            raise UpdateError('Too many files in application archive')
        for member in members:
            p = pathlib.PurePosixPath(member.name)
            if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] != 'mikrotik-usermanager':
                raise UpdateError('Unsafe path in application archive')
            rel = pathlib.PurePosixPath(*p.parts[1:])
            if not rel.parts or rel.as_posix() in seen:
                raise UpdateError('Duplicate or empty application path')
            seen.add(rel.as_posix())
            if any(part in PRESERVE for part in rel.parts):
                raise UpdateError('Release attempts to overwrite mutable application data')
            if member.isdir():
                continue
            if not member.isfile():
                raise UpdateError('Symlinks and special files are forbidden')
            unpacked += member.size
            if unpacked > MAX_UNPACKED:
                raise UpdateError('Unpacked application exceeds safety limit')
            target = destination.joinpath(*rel.parts)
            target.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
            source = app.extractfile(member)
            with target.open('xb') as out:
                shutil.copyfileobj(source, out)
            target.chmod(0o640 if target.suffix == '.php' else 0o644)

def status():
    result = {'available': PUBLIC_KEY.is_file(), 'current_version': None, 'staged': []}
    config = pathlib.Path('/etc/mikrotik-usermanager/app-config.php')
    if config.is_file():
        result['installed'] = True
    else:
        result['installed'] = False
    version_file = STATE / 'current-version'
    if version_file.is_file():
        result['current_version'] = version_file.read_text(errors='replace').strip()[:80]
    for item in sorted(INCOMING.glob('*.tar.gz')):
        try:
            release = validate_archive(item)
            result['staged'].append({'id': item.stem.replace('.tar', ''), 'version': release['version'], 'verified': True})
        except Exception:
            result['staged'].append({'id': item.stem.replace('.tar', ''), 'verified': False})
    print(json.dumps(result))

def php_lint(tree):
    php = shutil.which('php8.3') or shutil.which('php')
    if not php:
        raise UpdateError('PHP CLI unavailable; no files changed')
    for path in tree.rglob('*.php'):
        run([php, '-l', str(path)], capture=True)

def sync_tree(source, destination):
    destination.mkdir(mode=0o750, parents=True, exist_ok=True)
    excluded = []
    for name in sorted(PRESERVE):
        excluded += ['--exclude=' + name + '/', '--exclude=**/' + name + '/']
    run(['/usr/bin/rsync', '-a', '--delete', *excluded, str(source) + '/', str(destination) + '/'])
    www_group = subprocess.check_output(['/usr/bin/getent', 'group', 'www-data'], text=True).split(':')[2]
    gid = int(www_group)
    for current, dirs, files in os.walk(destination, followlinks=False):
        dirs[:] = [name for name in dirs if name not in PRESERVE and not (pathlib.Path(current) / name).is_symlink()]
        os.chmod(current, 0o750)
        os.chown(current, 0, gid)
        for filename in files:
            path = pathlib.Path(current) / filename
            if path.is_symlink():
                raise UpdateError('Symlink found after synchronization')
            os.chmod(path, 0o640 if path.suffix == '.php' else 0o644)
            os.chown(path, 0, gid)
            if path.suffix == '.php':
                os.utime(path, None)

def apply(update_id):
    update_id = safe_id(update_id)
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stage = stage_path(update_id)
        work_root = STATE / 'work'
        work_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        work = pathlib.Path(tempfile.mkdtemp(prefix=update_id + '-', dir=work_root))
        backup = BACKUPS / update_id
        backup_complete = False
        try:
            release = validate_archive(stage, work / 'application')
            app_stage = work / 'application'
            php_lint(app_stage)
            if not ROOT.is_dir() or not pathlib.Path('/etc/mikrotik-usermanager/app-config.php').is_file():
                raise UpdateError('SAM installation not detected')
            BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
            backup.mkdir(mode=0o700, exist_ok=False)
            shutil.copytree(ROOT, backup / 'application', dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns(*PRESERVE))
            previous_version = (STATE / 'current-version').read_text(errors='replace').strip() if (STATE / 'current-version').is_file() else 'untracked'
            (backup / 'version.txt').write_text(previous_version + '\n')
            backup_complete = True
            sync_tree(app_stage, ROOT)
            run(['/usr/bin/systemctl', 'is-active', '--quiet', 'apache2'])
            for unit in ('php8.3-fpm',):
                if subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', unit]).returncode != 0:
                    raise UpdateError('Post-update health check failed: ' + unit)
            (STATE / 'current-version').write_text(release['version'] + '\n')
            print(json.dumps({'success': True, 'version': release['version'], 'backup': str(backup),
                              'restarted_services': [], 'database_changed': False}))
        except Exception as exc:
            if backup_complete and backup.is_dir() and (backup / 'application').is_dir():
                try:
                    sync_tree(backup / 'application', ROOT)
                    old_version = (backup / 'version.txt').read_text(errors='replace').strip() if (backup / 'version.txt').is_file() else ''
                    if old_version:
                        (STATE / 'current-version').write_text(old_version + '\n')
                except Exception as rollback_error:
                    raise UpdateError('Update failed and rollback also failed; backup retained at ' + str(backup)) from rollback_error
            raise UpdateError(str(exc)) from exc
        finally:
            shutil.rmtree(work, ignore_errors=True)

def main():
    if os.geteuid() != 0:
        raise UpdateError('Root privileges required')
    if len(sys.argv) == 2 and sys.argv[1] == 'status':
        status()
        return
    if len(sys.argv) == 3 and sys.argv[1] == 'verify':
        release = validate_archive(stage_path(sys.argv[2]))
        print(json.dumps({'success': True, 'id': safe_id(sys.argv[2]), 'version': release['version'],
                          'database_migrations': 0, 'restarted_services': []}))
        return
    if len(sys.argv) == 3 and sys.argv[1] == 'apply':
        apply(sys.argv[2])
        return
    raise UpdateError('Usage: sam-update status | verify ID | apply ID')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'success': False, 'error': str(error)}))
        sys.exit(1)
