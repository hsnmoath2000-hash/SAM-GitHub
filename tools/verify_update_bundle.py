"""Verify a SAM update package layout, Ed25519 signature, and payload hash."""
import base64
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile

def verify(archive_path, public_key_path):
    archive_path = pathlib.Path(archive_path)
    public_key = pathlib.Path(public_key_path).read_bytes()
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = {m.name: m for m in archive.getmembers()}
        if set(members) != {'release.json', 'release.sig', 'application.tar.gz'}:
            raise ValueError('Unexpected update package members')
        if any(not member.isfile() for member in members.values()):
            raise ValueError('Non-regular package member')
        manifest = archive.extractfile(members['release.json']).read()
        signature = archive.extractfile(members['release.sig']).read()
        if len(signature) != 64:
            raise ValueError('Invalid Ed25519 signature length')
        release = json.loads(manifest)
        if release.get('format') != 'sam-update-v1' or release.get('database_migrations') != []:
            raise ValueError('Unsupported or migration-bearing update')
        payload = archive.extractfile(members['application.tar.gz'])
        digest = hashlib.sha256()
        for chunk in iter(lambda: payload.read(1024 * 1024), b''):
            digest.update(chunk)
        if digest.hexdigest() != release.get('files', {}).get('application.tar.gz'):
            raise ValueError('Payload checksum mismatch')
    verify_js = ('const c=require("crypto");const ok=c.verify(null,Buffer.from(process.argv[1],"base64"),'
                 'c.createPublicKey(Buffer.from(process.argv[3],"base64")),Buffer.from(process.argv[2],"base64"));if(!ok)process.exit(1)')
    subprocess.run(['node', '-e', verify_js, base64.b64encode(manifest).decode(),
                    base64.b64encode(signature).decode(), base64.b64encode(public_key).decode()], check=True)
    return release

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python tools/verify_update_bundle.py <bundle.tar.gz> <public-key.pem>')
    result = verify(sys.argv[1], sys.argv[2])
    print(json.dumps({'valid': True, 'version': result['version'], 'database_migrations': 0}, ensure_ascii=False))
