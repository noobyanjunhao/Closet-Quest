"""Package the public source and evidence; exclude ignored runtime data and secrets."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT
).decode('utf-8').split('\0')
forbidden = {'.git', '.local-data', '.model-cache', 'node_modules', 'tmp', '.codex', '.agents'}
files = []
for name in sorted(set(paths)):
    if not name or name == 'output/sprint6/source-manifest.json':
        continue
    path = ROOT / name
    if not path.is_file() or path.is_symlink():
        continue
    if forbidden.intersection(path.relative_to(ROOT).parts) or name.startswith('output/submission/'):
        continue
    if path.name.startswith('.env') and path.name != '.env.example':
        continue
    if name.startswith(('vision/private/', 'ml/checkpoints/', 'ml/exports/')):
        continue
    path.resolve().relative_to(ROOT.resolve())
    files.append((name, path.read_bytes()))

env = ROOT / '.env.local'
secrets = re.findall(r'^OPENAI_API_KEY\s*=\s*[\"\']?([^\s\"\']+)', env.read_text() if env.exists() else '', re.M)
for name, data in files:
    if any(secret and secret.encode() in data for secret in secrets):
        raise RuntimeError(f'Private credential detected; package not written: {name}')
manifest = {name: hashlib.sha256(data).hexdigest() for name, data in files}
manifest_path = ROOT / 'output/sprint6/source-manifest.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
files.append(('output/sprint6/source-manifest.json', manifest_path.read_bytes()))
target = ROOT / 'output/submission/Closet-Quest-Sprint-6-Alpha-Package.zip'
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in files:
        archive.writestr(name, data)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert '.env.local' not in archive.namelist()
print(json.dumps({'package': str(target), 'files': len(files), 'bytes': target.stat().st_size, 'secretCheck': 'passed'}))
