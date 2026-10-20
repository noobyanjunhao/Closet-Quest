"""Package only the validation report and explicitly selected supporting results."""
from pathlib import Path
import csv
import hashlib
import json
import zipfile
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
data = root / 'output/sprint7'
report = root / 'output/pdf/Closet-Quest-Sprint-7-Validation-Report.pdf'
summary = json.loads((data / 'summary.json').read_text())
ablation = json.loads((data / 'ablation-summary.json').read_text())
recognition100=json.loads((root/'output/recognition-100/both-100.json').read_text())
analysis100=json.loads((root/'output/recognition-100/analysis.json').read_text())
assert recognition100['complete'] and recognition100['completedTasks']==200
assert analysis100['images']==100 and analysis100['attempts']==200
assert len({(r['imageId'],r['mode']) for r in recognition100['rows']})==200
assert all(sum(r['mode']==mode for r in recognition100['rows'])==100 for mode in ['single','multiple'])
with (data / 'recognition.csv').open(newline='') as handle:
    rows = list(csv.DictReader(handle))
assert len(PdfReader(report).pages) == 5
assert len(rows) == 36
assert summary['humanParticipants'] == ablation['humanParticipants'] == 0
assert ablation['all']['attempts'] == 30
assert ablation['all']['validOutfits']['numerator'] == 54
timing = {}
for mode in ['single', 'multiple']:
    selected = [r for r in rows if r['mode'] == mode]
    assert len(selected) == 18
    timing[mode] = {'attempts': len(selected), 'completedWithin20Seconds': sum(
        r['status'] == 'completed' and int(r['latencyMs']) < 20000 for r in selected)}
assert timing['multiple']['completedWithin20Seconds'] == 16

files = [
    'output/recognition-100/both-100.json',
    'output/recognition-100/analysis.json', 'output/recognition-100/results.csv',
    'output/recognition-100/provenance.json', 'output/recognition-100/failure-analysis.md',
    'output/recognition-100/reviewed-examples.json',
    'data/evaluation/recognition-100/manifest.json',
    'data/evaluation/recognition-100/labels.csv', 'data/evaluation/recognition-100/summary.json',
    'scripts/evaluate-recognition-100.mjs', 'scripts/recognition-metrics.mjs',
    'scripts/analyze-recognition-100.py', 'scripts/prepare-recognition-100.py',
    'docs/recognition-100.md', 'docs/exact-embedding-search.md',
    'output/mobile/exact-search-benchmark.json', 'output/mobile/exact-search-tests.txt',
    'output/sprint7/summary.json', 'output/sprint7/ablation-summary.json',
    'output/sprint7/recognition.csv', 'output/sprint7/recognition.json',
    'output/sprint7/recognition-recheck.json', 'output/sprint7/dataset-manifest.json',
    'output/sprint7/stylist.json', 'output/sprint7/synthetic-ratings.csv',
    'output/sprint7/ablation.csv', 'output/sprint7/ablation.json',
    'output/sprint7/evaluation-provenance.json', 'output/sprint7/regression-tests.txt',
    'output/sprint7/README.md',
    'output/mobile/authenticated-flow-checks.json',
    'output/mobile/account-deployment-checks.json',
    'output/mobile/mobile-refresh-checks.json',
    'output/mobile/mobile-refresh-tests.txt',
    'output/sprint7/report-assets/mobile-closet.jpg',
    'output/sprint7/report-assets/mobile-stylist.jpg',
    'output/sprint7/report-assets/mobile-outfit.jpg',
    'public/photos/sources.json',
    'docs/sprint6-integration-report.md', 'docs/accounts-and-mobile.md',
    'scripts/prepare-fashionpedia.py',
    'scripts/evaluate-sprint7-recognition.mjs', 'scripts/evaluate-sprint7-stylist.mjs',
    'scripts/evaluate-sprint7-ablation.mjs', 'scripts/summarize-sprint7.mjs',
    'scripts/summarize-sprint7-ablation.mjs',
    'scripts/build_sprint7_report.py', 'scripts/sprint7_illustrated_report.py',
    'scripts/package_sprint7_validation.py',
]
index = '''CLOSET QUEST - SPRINT 7 VALIDATION

Start with Closet-Quest-Sprint-7-Validation-Report.pdf (5 pages).
The report focuses on validation design and execution, technical and research-impact
results against baselines, and findings with prioritized improvements.
Screenshots and diagrams support that analysis; this is not a demo instruction guide.

HOW TO READ THE SUPPORTING RESULTS
output/recognition-100/both-100.json: latest full comparison, all 200 attempts.
analysis.json / results.csv: audited counts, per-category metrics, paired image
bootstrap intervals, request failures and completed-response mismatches.
failure-analysis.md: observed failure patterns and reviewed examples, with limitations.
provenance.json: evaluated commit, file hashes, model settings and execution protocol.
data/evaluation/recognition-100: fixed 100-photo manifest, labels and licenses.
The report uses this latest recognition run; no historical attempts are pooled into it.

output/sprint7/summary.json: historical recognition and cited styling aggregates.
recognition.csv / recognition.json: all 36 initial attempts, including failures.
dataset-manifest.json: fixed sampling, labels, source URLs and individual photo licenses.
recognition-recheck.json: selected post-fix recheck, separate from initial results.
stylist.json / synthetic-ratings.csv: fixed wardrobe, six briefs, outputs and model critique.
ablation.json: frozen six new briefs and targets, 24 initial calls plus six repeats,
candidate plans, actual prompt context and provider outputs.
ablation-summary.json / ablation.csv: document-by-feedback comparisons and timing.
evaluation-provenance.json: evaluated versions, model IDs and script hashes.
reviewed-timing.json: successful completion within 20 seconds derived from recognition.csv.

RESEARCH VERSUS CURRENT DEPLOYMENT
The styling research records were frozen on October 19, before the later account upgrade.
The expanded 100-photo recognition comparison ran on October 20 on the current
recognition pipeline. It does not rerun the old styling studies.
output/mobile/authenticated-flow-checks.json documents the later account flow.
output/mobile/account-deployment-checks.json records anonymous-access checks.
docs/accounts-and-mobile.md describes the later checks and remaining limitations.
The historical regression-tests.txt records 169 tests at its earlier snapshot.
The latest engineering regression result is 206 passing tests in
output/mobile/exact-search-tests.txt; it is not a model accuracy measurement.
mobile-refresh-checks.json records navigation continuity and responsive browser checks.
These mobile-emulation checks do not establish physical-phone usability or satisfaction.
The historical research README refers to the earlier participant-code pilot.
The current deployed app uses Supabase accounts; this does not change frozen experiments.

LIMITS
Human participant count is zero. AI ratings and scripted preference targets are
research proxies, not human acceptance, correction time, purchase savings or social impact.
Current screenshots show labeled demo garments; the account's first-name display label
is visible. The image source attribution is in public/photos/sources.json.
Dataset photographs, credentials and private account exports are excluded.

REPRODUCTION
Use the Closet-Quest repository and the evaluated commits recorded in provenance.
The included scripts require that application's modules and dependencies; they are
not standalone programs. The historical README gives dataset setup and evaluation
commands. Live reruns require a server-side API key and incur provider usage charges.
Preserve frozen records; do not overwrite them to hide failed requests.
The report can be rebuilt with Python, ReportLab, Pillow and pypdf from the included
results and assets. The archive's SHA256 manifest supports file-integrity checks.

Repository: https://github.com/noobyanjunhao/Closet-Quest
Live app: https://closet-quest-junhao-s7.onrender.com/
'''
output = root / 'output/submission/Closet-Quest-Sprint-7-Submission.zip'
output.parent.mkdir(parents=True, exist_ok=True)
manifest = {}
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    def add(name, content):
        archive.writestr(name, content)
        manifest[name] = hashlib.sha256(content).hexdigest()
    add(report.name, report.read_bytes())
    for name in files:
        add(name, (root / name).read_bytes())
    add('START-HERE.txt', index.encode())
    add('reviewed-timing.json', (json.dumps(timing, indent=2) + '\n').encode())
    archive.writestr('SHA256.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(hashlib.sha256(archive.read(name)).hexdigest() == digest
               for name, digest in manifest.items())
print(json.dumps({'reportPages': 5, 'archive': str(output), 'files': len(manifest) + 1,
                  'latestRecognitionImages': analysis100['images'],
                  'latestRecognitionAttempts': analysis100['attempts'],
                  'historicalRecognitionTiming': timing}, indent=2))
