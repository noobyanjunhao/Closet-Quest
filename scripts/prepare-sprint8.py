"""Freeze disjoint public photos before the robustness experiment."""
import hashlib,json,zipfile
from pathlib import Path
import runpy
root=Path(__file__).resolve().parents[1]
mapping=runpy.run_path(str(root/'scripts/prepare-recognition-100.py'))['MAPPING']
data=json.loads((root/'vision/private/fashionpedia/annotations.json').read_text())
old=json.loads((root/'data/evaluation/recognition-100/manifest.json').read_text())
prior=json.loads((root/'output/sprint7/dataset-manifest.json').read_text())
excluded={i['id'] for i in old['images']+prior['images']}
hashes={i['sha256'] for i in old['images']+prior['images']}
anns={}
for a in data['annotations']:
    if a['category_id'] in mapping:anns.setdefault(a['image_id'],[]).append(a)
eligible=[i for i in data['images'] if i['license'] in [0,6] and i['id'] not in excluded and anns.get(i['id'])]
selected=sorted(eligible,key=lambda i:hashlib.sha256(f"sprint8-v1:{i['id']}".encode()).hexdigest())[:20]
dest=root/'vision/private/sprint8';dest.mkdir(parents=True,exist_ok=True)
records=[]
with zipfile.ZipFile(root/'vision/private/fashionpedia/images.zip') as z:
    names={Path(n).name:n for n in z.namelist()}
    for im in selected:
        raw=z.read(names[im['file_name']]);h=hashlib.sha256(raw).hexdigest()
        if h in hashes:continue
        hashes.add(h);(dest/im['file_name']).write_bytes(raw)
        records.append({**im,'sha256':h,'expected':sorted({mapping[a['category_id']] for a in anns[im['id']]}),'instanceCount':len(anns[im['id']])})
target=root/'output/sprint8/manifest.json'
assert not target.exists(),'Preserve the frozen manifest.'
target.write_text(json.dumps({'seed':'sprint8-v1','images':records,'eligibleCount':len(eligible),'excludedIds':sorted(excluded),'licenses':data['licenses'],'protocol':'All remaining eligible CC BY/Public Domain photos up to 20, hash ordered; each tested original, low light (brightness 0.35), and small/blurred (160px, Gaussian sigma 1.2). Same raw model response replayed through before/after validators. Separate seven previously failed scenes are diagnostic rechecks, not held-out data. No retries.','humanParticipants':0},indent=2)+'\n')
print(json.dumps({'freshImages':len(records),'eligibleCount':len(eligible)}))
