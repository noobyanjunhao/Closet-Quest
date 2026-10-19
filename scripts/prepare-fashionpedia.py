"""Freeze a licensed, deterministic evaluation sample before any model predictions."""
import json, hashlib, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
private=root/'vision/private/fashionpedia'
d=json.loads((private/'annotations.json').read_text())
mapping={0:'Top',1:'Top',2:'Top',3:'Outerwear',4:'Outerwear',5:'Outerwear',6:'Bottom',7:'Bottom',8:'Bottom',9:'Outerwear',10:'Dress',11:'Dress',12:'Outerwear',13:'Accessory',14:'Accessory',15:'Accessory',16:'Accessory',17:'Accessory',18:'Accessory',19:'Accessory',20:'Accessory',21:'Bottom',22:'Accessory',23:'Shoes',24:'Accessory',25:'Accessory',26:'Accessory'}
annotations={i['id']:[] for i in d['images']}
for a in d['annotations']:
 if a['category_id'] in mapping: annotations[a['image_id']].append(a)
eligible=[i for i in d['images'] if i['license'] in [0,6] and 2<=len(set(mapping[a['category_id']] for a in annotations[i['id']]))<=6]
rank=lambda i:hashlib.sha256(('closet-sprint7-v1:'+str(i['id'])).encode()).hexdigest()
hat=[i for i in sorted(eligible,key=rank) if any(a['category_id']==14 for a in annotations[i['id']])][:6]
hat_ids={i['id'] for i in hat}
general=[i for i in sorted(eligible,key=rank) if i['id'] not in hat_ids][:12]
selected=general+hat
out=root/'output/sprint7';out.mkdir(parents=True,exist_ok=True)
manifest={'dataset':'Fashionpedia validation 2020','seed':'closet-sprint7-v1','annotationSha256':hashlib.sha256((private/'annotations.json').read_bytes()).hexdigest(),'annotationLicense':'CC BY 4.0','source':'https://github.com/cvdfoundation/fashionpedia','eligibleImages':len(eligible),'sampling':'12 hash-ranked general images plus up to 6 disjoint hat-enriched images; image licenses CC BY 2.0 or public domain. Category-set task; not instance segmentation. Not model-training holdout.','categoryMapping':mapping,'images':[]}
with zipfile.ZipFile(private/'images.zip') as z:
 names={Path(n).name:n for n in z.namelist() if not n.endswith('/')}
 for i in selected:
  data=z.read(names[i['file_name']]);(private/i['file_name']).write_bytes(data)
  manifest['images'].append({**i,'stratum':'hat' if i['id'] in hat_ids else 'general','licenseDetails':next(l for l in d['licenses'] if l['id']==i['license']),'sha256':hashlib.sha256(data).hexdigest(),'expected':sorted(set(mapping[a['category_id']] for a in annotations[i['id']])),'annotatedHat':any(a['category_id']==14 for a in annotations[i['id']])})
(out/'dataset-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'selected':len(selected),'general':len(general),'hat':len(hat),'eligible':len(eligible)}))
