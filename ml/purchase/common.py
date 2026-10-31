import hashlib, json, subprocess, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'data/evaluation/purchase-v1'
PROMPT=json.loads((ROOT/'ml/purchase/prompt.json').read_text(encoding='utf8'))
FIELDS=['description','category','color','size','brand','quantity']
CATEGORIES=['Top','Bottom','Dress','Shoes','Outerwear','Accessory']
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def rows(split):
    manifest=json.loads((DATA/'manifest.json').read_text(encoding='utf8'))
    path=DATA/f'{split}.jsonl'
    assert sha(path)==manifest['files'][split]['sha256'],'Dataset hash mismatch'
    return [json.loads(x) for x in path.read_text(encoding='utf8').splitlines()]
def messages(row):
    source={'source_lines':[{'id':f'L{i+1}','text':t} for i,t in enumerate(row['source'].split('\n'))]}
    return [{'role':'system','content':PROMPT['system']+'\nJSON schema: '+json.dumps(PROMPT['schema'],separators=(',',':'))},{'role':'user','content':json.dumps(source,ensure_ascii=False,separators=(',',':'))}]
def configure():
    os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_DATASETS_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
def validate_records(records,path):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf8')
    out=p.with_suffix('.validation.json')
    subprocess.run(['node','scripts/purchase-evaluation-bridge.mjs','validate',str(p),str(out)],cwd=ROOT,check=True)
    return json.loads(out.read_text(encoding='utf8'))
