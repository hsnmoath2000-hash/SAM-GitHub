"""Build an installer bundle from editable source; never installs or deploys."""
import hashlib
import json
import pathlib
import shutil
import tarfile
import datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]

def build():
    name = 'sam-fresh-web-installer-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
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
    archive = output.with_suffix('.tar.gz')
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(output, arcname='sam-fresh-web-installer')
        if (service / 'SHA256SUMS').is_file():
            tar.add(service / 'SHA256SUMS', arcname='sam-fresh-web-installer/service-manager/SHA256SUMS')
        if (output / 'SHA256SUMS').is_file():
            tar.add(output / 'SHA256SUMS', arcname='sam-fresh-web-installer/SHA256SUMS')
    print(json.dumps({'bundle': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}))

if __name__ == '__main__':
    import check_repo
    check_repo.check(False)
    build()
