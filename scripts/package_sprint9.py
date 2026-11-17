"""Package the reviewable beta report, guides and allowlisted results (no credentials)."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'output/pdf/Closet-Quest-Sprint-9-Beta-Report.pdf',
    'docs/sprint9-beta-validation.md',
    'docs/beta-user-guide.md', 'docs/developer-guide.md', 'docs/beta-deployment.md',
    'docs/sprint9-delivery-checklist.md', 'docs/sprint9-nonfunctional-requirements.md',
    'docs/ashley-review.md', 'docs/responsible-deployment-audit.md',
    'docs/cpu-dependency-install.md',
    'docs/diagrams/sprint9-system-design.svg', 'docs/diagrams/sprint9-rag-pipeline.svg',
    'output/sprint9/stylist-nfr.json', 'output/sprint9/live-capabilities.json',
    'output/sprint9/shopping-load.json', 'output/sprint9/photo-quality.json',
    'output/sprint9/python-completeness.json', 'output/sprint9/flow-completeness.json',
    'output/sprint9/beta-completeness-verification.json',
    'output/sprint9/recovery-verification.json',
    'output/sprint9/final-release-verification.json',
    'output/sprint9/shopping-boundaries-before.json', 'output/sprint9/shopping-boundaries-after.json',
    'output/sprint9/shopping-http-validation.json',
    'output/sprint9/responsible-deployment-audit.json', 'output/sprint9/responsible-deployment-tests.tap',
    'output/sprint9/closet-ui-review.json',
    'output/sprint9/mobile-closet.jpg', 'output/sprint9/desktop-closet.jpg',
    'output/sprint8/model-results.json', 'output/sprint8/manifest.json',
]

def main():
    for name in FILES:
        if not (ROOT / name).is_file():
            raise FileNotFoundError(f'Required evidence missing: {name}')
    files=FILES
    manifest = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in files}
    dest = ROOT/'output/Closet-Quest-Sprint-9-Delivery.zip'
    with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in files:
            bundle.write(ROOT/name, name)
        bundle.writestr('SHA256.json', json.dumps(manifest, indent=2)+'\n')
        bundle.writestr('START-HERE.txt',
            'Closet Quest / Sprint 9 beta\n'
            'Try: https://closet-quest-junhao-s7.onrender.com/\n'
            'Source: https://github.com/noobyanjunhao/Closet-Quest\n\n'
            'Read output/pdf/Closet-Quest-Sprint-9-Beta-Report.pdf first.\n'
            'The docs folder contains concise user/developer guides and deployment instructions.\n'
            'Results distinguish fixtures, live API checks, owner recovery and agent-operated review.\n'
            'recovery-verification.json supersedes the historical cloud-outage status in beta-completeness-verification.json.\n'
            'final-release-verification.json records the deployed 77f50e3 release and its 323 Node / 19 Python CI results.\n'
            'Direct-human independent testing is still pending; this package does not claim it is complete.\n')
    print(json.dumps({'path': str(dest), 'files':len(files)+2, 'bytes':dest.stat().st_size}))

if __name__ == '__main__':
    main()
