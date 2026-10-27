"""Package explicit public evidence only; never include keys, private photos or raw retailer snippets."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
names=['manifest.json','model-results.json','baseline-multi-recognition.mjs','ood-results.json','robustness-results.json','shopping-grounding-fixture.json','shopping-live.json','shopping-top-live.json','shopping-final-live.json','shopping-image-live.json','shopping-preview-improvement.json','dependency-audit-before.json','dependency-audit-after.json','regression-tests.txt','build.txt','release.json','ui-checks.json','closet-mobile.png']
files=[ROOT/'output/sprint8'/n for n in names]
files += [ROOT/p for p in ['docs/sprint8-robustness.md','scripts/prepare-sprint8.py','scripts/evaluate-sprint8.mjs','scripts/evaluate-sprint8-ood.mjs','scripts/stress-sprint8.mjs','scripts/recognition-metrics.mjs','scripts/build_sprint8_report.py','scripts/package_sprint8.py','server/multi-recognition.js','server/shopping.js','tests/multi-recognition.test.js','tests/shopping.test.js','output/pdf/Closet-Quest-Sprint-8-Robustness-Report.pdf']]
files += [ROOT/'output/shopping-v2'/n for n in ['live-results.json','visual-sources-results.json','image-checks.json','tests.txt','cards-mobile.png','cards-desktop.png']]
optional=['closet-desktop.png','shopping-ui.png','deployment.png']
files += [ROOT/'output/sprint8'/n for n in optional if (ROOT/'output/sprint8'/n).exists()]
for p in files:assert p.is_file(),p
manifest=[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in files]
dest=ROOT/'output/submission/Closet-Quest-Sprint-8-Supporting-Results.zip';dest.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:z.write(p,p.relative_to(ROOT).as_posix())
 z.writestr('CHECKSUMS.json',json.dumps(manifest,indent=2))
print(json.dumps({'path':str(dest),'files':len(files),'bytes':dest.stat().st_size}))
