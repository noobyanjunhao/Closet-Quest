"""Download a public, ungated model at a resolved immutable revision."""
import json, os, hashlib
from pathlib import Path
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_XET']='1'
from huggingface_hub import HfApi, snapshot_download
root=Path(__file__).resolve().parents[2]
repo='Qwen/Qwen2.5-0.5B-Instruct'
info=HfApi().model_info(repo)
dest=root/'.model-cache/purchase-base'
snapshot_download(repo,revision=info.sha,local_dir=dest,allow_patterns=['*.json','*.safetensors','*.txt','*.model','*.jinja','LICENSE','README.md'])
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.iterdir() if p.is_file()}
manifest={'repo':repo,'revision':info.sha,'license':'Apache-2.0','files':files,'path':'.model-cache/purchase-base','trust_remote_code':False}
(root/'ml/purchase/base-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in manifest.items() if k!='files'},indent=2))
