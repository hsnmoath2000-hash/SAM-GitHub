"""Build fresh-install and signed in-app update bundles; never installs/deploys."""
import hashlib
import json
import pathlib
import shutil
import tarfile
import datetime
import os
import subprocess

def add_bytes(tar, name, data, mode=0o644):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.uid = info.gid = 0
    info.uname = info.gname = 'root'
    import io
    tar.addfile(info, io.BytesIO(data))

def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

ROOT = pathlib.Path(__file__).resolve().parents[1]

def build():
    version = datetime.datetime.now().strftime('%Y.%m.%d.%H%M%S')
    name = 'sam-release-' + version.replace('.', '-')
    output = ROOT / 'dist' / name
    if output.exists():
        raise SystemExit('Output already exists; refusing overwrite.')
    shutil.copytree(ROOT / 'installer', output)
    shutil.copytree(ROOT / 'database', output / 'database')
    with tarfile.open(output / 'application.tar.gz', 'w:gz') as tar:
        for path in sorted((ROOT / 'application').rglob('*')):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT / 'application').as_posix()
            if any(part in {'uploads', 'downloads', 'node_modules', 'vendor', 'logs', 'backups'} for part in path.relative_to(ROOT / 'application').parts):
                raise ValueError('Operational data in application: ' + rel)
            info = tar.gettarinfo(str(path), 'mikrotik-usermanager/' + rel)
            info.mode = 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            with path.open('rb') as stream:
                tar.addfile(info, stream)
    metadata = json.loads((ROOT / 'runtime/archive-metadata.json').read_text())
    with tarfile.open(output / 'runtime.tar.gz', 'w:gz') as tar:
        for rel, mode in sorted(metadata['modes'].items()):
            path = ROOT / 'runtime' / rel
            info = tar.gettarinfo(str(path), rel)
            info.mode = mode
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            with path.open('rb') as stream:
                tar.addfile(info, stream)
        for link in metadata['links']:
            info = tarfile.TarInfo(link['path'])
            info.type = tarfile.SYMTYPE
            info.linkname = link['target']
            info.mode = 0o777
            tar.addfile(info)
    # The subordinate bootstrap checks its own directory as well.
    service = output / 'service-manager'
    service_sums = [hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(service).as_posix()
                    for p in sorted(service.rglob('*')) if p.is_file() and p.name != 'SHA256SUMS']
    (service / 'SHA256SUMS').write_text('\n'.join(service_sums) + '\n', encoding='utf-8')
    sums = []
    for path in sorted(output.rglob('*')):
        if path.is_file() and path.name != 'SHA256SUMS':
            sums.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.relative_to(output).as_posix())
    (output / 'SHA256SUMS').write_text('\n'.join(sums) + '\n', encoding='utf-8')
    archive = ROOT / 'dist' / ('sam-installer-' + version.replace('.', '-') + '.tar.gz')
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(output, arcname='sam-fresh-web-installer')
        if (service / 'SHA256SUMS').is_file():
            tar.add(service / 'SHA256SUMS', arcname='sam-fresh-web-installer/service-manager/SHA256SUMS')
        if (output / 'SHA256SUMS').is_file():
            tar.add(output / 'SHA256SUMS', arcname='sam-fresh-web-installer/SHA256SUMS')
    private_key = pathlib.Path(os.environ.get('SAM_RELEASE_PRIVATE_KEY', pathlib.Path.home() / '.sam-release-signing' / 'sam-release-private.pem'))
    if not private_key.is_file():
        raise SystemExit('Missing offline Ed25519 release key: set SAM_RELEASE_PRIVATE_KEY. Do not store the private key in the repository or server.')
    app_path = output / 'application-update.tar.gz'
    archive_file_application(ROOT, app_path)
    app_hash = sha256_file(app_path)
    release = {
        'format': 'sam-update-v1',
        'version': version,
        'minimum_app_version': '3.0.0',
        'created_utc': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        'files': {'application.tar.gz': app_hash},
        'database_migrations': []
    }
    release_bytes = (json.dumps(release, sort_keys=True, separators=(',', ':')) + '\n').encode()
    signature = subprocess.run(
        ['node', '-e', "const c=require('crypto'),fs=require('fs');const k=fs.readFileSync(process.argv[1]);const d=fs.readFileSync(0);process.stdout.write(c.sign(null,d,k));", str(private_key)],
        input=release_bytes, stdout=subprocess.PIPE, check=True).stdout
    update_archive = ROOT / 'dist' / ('sam-update-' + version.replace('.', '-') + '.tar.gz')
    with tarfile.open(update_archive, 'w:gz') as tar:
        add_bytes(tar, 'release.json', release_bytes)
        add_bytes(tar, 'release.sig', signature)
        tar.add(app_path, arcname='application.tar.gz')
    app_path.unlink()
    print(json.dumps({
        'installer_bundle': str(archive),
        'installer_sha256': sha256_file(archive),
        'update_bundle': str(update_archive),
        'update_sha256': sha256_file(update_archive),
        'version': version,
        'signing_key_id': hashlib.sha256((ROOT / 'installer' / 'updates' / 'release-public.pem').read_bytes()).hexdigest()[:16]
    }, ensure_ascii=False))

def archive_file_application(root, destination):
    with tarfile.open(destination, mode='w:gz') as tar:
        for path in sorted((root / 'application').rglob('*')):
            if not path.is_file():
                continue
            rel_path = path.relative_to(root / 'application')
            rel = rel_path.as_posix()
            if any(part in {'uploads', 'downloads', 'node_modules', 'vendor', 'logs', 'backups'} for part in rel_path.parts):
                raise ValueError('Operational data in application: ' + rel)
            info = tar.gettarinfo(str(path), 'mikrotik-usermanager/' + rel)
            info.mode = 0o640 if path.suffix == '.php' else 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            with path.open('rb') as stream:
                tar.addfile(info, stream)

if __name__ == '__main__':
    import check_repo
    check_repo.check(False)
    build()
