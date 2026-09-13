"""Build the four-page Sprint 3 submission from checked-in experiment evidence.
Run from repository root with Python + reportlab + pypdf installed.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
r=json.loads((ROOT/'experiments/results/latest.json').read_text())
v=json.loads((ROOT/'vision/results/latest.json').read_text())
old=json.loads((ROOT/'experiments/results/exhaustive-prototype.json').read_text())
b=r['summary']['baseline']; p=r['summary']['prototype']; clip,siglip=v['summary']
out=ROOT/'output/pdf/Closet-Quest-Sprint-3-Feasibility-Report.pdf'
out.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle',fontName='Helvetica-Bold',fontSize=21,leading=25,spaceAfter=10,textColor=colors.HexColor('#172f26')))
styles.add(ParagraphStyle(name='Sub',fontName='Helvetica',fontSize=9,leading=13,spaceAfter=14,textColor=colors.HexColor('#64746a')))
styles.add(ParagraphStyle(name='H',fontName='Helvetica-Bold',fontSize=12,leading=16,spaceBefore=11,spaceAfter=7,textColor=colors.HexColor('#254b3c')))
styles.add(ParagraphStyle(name='P',fontName='Helvetica',fontSize=9.5,leading=13.4,spaceAfter=8))
styles.add(ParagraphStyle(name='SmallText',fontName='Helvetica',fontSize=8,leading=10.7,spaceAfter=6))
styles.add(ParagraphStyle(name='Cell',fontName='Helvetica',fontSize=8.2,leading=11))
styles.add(ParagraphStyle(name='CellHead',fontName='Helvetica-Bold',fontSize=8.2,leading=11,textColor=colors.white))
story=[]; transcript=[]
def para(text,style='P'):
    story.append(Paragraph(text,styles[style]));transcript.append(text)
def heading(text):para(text,'H')
def table(rows,widths):
    cells=[[Paragraph(escape(str(cell)),styles['CellHead' if i==0 else 'Cell'])for cell in row]for i,row in enumerate(rows)]
    t=Table(cells,colWidths=widths,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#254b3c')),('BACKGROUND',(0,1),(-1,-1),colors.HexColor('#f3f5f0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,1),(-1,-1),.4,colors.HexColor('#dbe1d7'))]))
    story.append(t);story.append(Spacer(1,8));transcript.extend(' | '.join(map(str,row))for row in rows)
def newpage():story.append(PageBreak());transcript.append('\n--- PAGE BREAK ---\n')
def footer(canvas,doc):
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#6f7a72'))
    canvas.drawString(46,28,'CLOSET QUEST   /   SPRINT 3   /   SEPTEMBER 2026')
    canvas.drawRightString(566,28,f'{doc.page} / 4')

para('Closet Quest Technical Feasibility and Baseline','ReportTitle')
para('Sprint 3 submission | Junhao Yan | Repository owner noobyanjunhao<br/>Evidence collected September 13 2026 | Submission due Tuesday September 15 at 10 am','Sub')
para('<b>Decision: Modify.</b> Continue the closet, styling, quest, and resale workflow, but replace independent garment selection with constrained outfit ranking. Two experiments establish local technical feasibility: a reproducible metadata benchmark and a CPU-only pretrained-vision smoke test. They do not establish human styling acceptance or real-photo recognition accuracy. Keep manual corrections and defer a final model or fine-tuning decision until a real-photo evaluation is reviewed with Junhao.')
heading('Technical and data feasibility')
para('The highest product risk is that digitization creates more correction work than value. A second critical assumption is that small, incomplete closets still support useful context-specific outfits. Sprint 3 directly tests the latter with representative metadata scenarios and tests whether existing vision models can execute locally without training. The semester targets remain category accuracy >=80%, color accuracy >=85%, valid-job success >=95%, 90% of uploads within 20 seconds, and human acceptance within the top three >=70%.')
table([
['Risk and priority','Dependencies and access','Assessment and mitigation'],
['High: photo recognition and cleanup','Consented labeled photos; pretrained model weights; inference runtime; separate segmentation tool.','Only illustration inference tested. No color or cleanup validation. Keep all attributes editable; compare models before tuning.'],
['High: useful styling from sparse closets','Reliable categories/context tags, garment ownership and wear counts; human ratings.','Test shape, context, low-use constraints and abstention. Wrong metadata still causes missed outfits.'],
['High: private persistent wardrobe','Authentication, PostgreSQL, private object storage, API authorization and image deletion.','Current browser storage is a demo, not account isolation. Prove cross-user access denial before hosted private data.'],
['Medium: latency and reliability','CPU/RAM, downloads, bounded ranking, job timeouts/retries; production HTTPS.','Local measurements only. Separate image jobs from normal API calls and retain failure/retry states.'],
['Medium: external dependencies','Node/npm lockfile, ONNX runtime; model licenses and network access.','No GPU or paid API used. Models cached outside Git. RMBG-2.0 is gated/noncommercial; not integrated. [1-3]'],
['Medium: resale correctness','User-confirmed size/condition/price; stored image; export destination.','Editable export only. Do not invent condition, auto-post, or add a marketplace/payment system.'],
],[116,180,224])
para('Infrastructure direction: React web client now; proposed FastAPI service later with PostgreSQL and object storage. Deploy with HTTPS, restart handling and memory planning; these are separate tasks from running a development server. [4] Expo remains an option after the workflow is validated. No production hosting, GPU capacity, or external account access is claimed.','SmallText')

newpage()
para('Baseline and feasibility prototype','ReportTitle')
heading('Experiment A Outfit feasibility with representative metadata')
para('<b>Hypothesis:</b> a rule-based ranker can return complete, owned, context-matching outfits, include a low-use garment when required, and abstain when no solution exists, without a trained recommendation model. The original baseline is frozen from repository commit <font face="Courier">dab74ac</font>. It chooses each category separately, favors low wear counts before context, and cycles all slots together. The prototype searches complete outfits, normalizes exact context tags, and exposes three distinct options with explanations.')
para('<b>Data:</b> 30 original synthetic wardrobes: ten scenario families with three seeded wear-count variants each. Each wardrobe receives three contexts and ordinary/low-use requests, giving 180 queries. Scenarios cover balanced closets, context conflicts, dress-only wardrobes, missing shoes, sparse inventory, unknown tags, all-used clothing, mixed-case tags, dress alternatives, and mislabeled footwear. These are inspectable engineering scenarios, not observations from wardrobe owners. The variants and requests are correlated.')
para('<b>Reference rule:</b> an independently implemented brute-force oracle accepts one top plus one bottom, or one dress, with exactly one pair of shoes and optional outerwear. All pieces must be owned and tagged for the requested context; quest requests additionally require a piece with <=1 wear. A feasible request succeeds if any of up to three suggestions passes. Impossible requests are evaluated separately for correct abstention. This proxy is deliberately narrower than fashion quality.')
para('<b>Measurement:</b> five warmups and 30 timed repeats per query (5,400 calls per method); nearest-rank P50/P95 from warm in-process CPU calls. Stress tests use 50, 100 and 200 garments, two warmups and ten measured calls per size. The small-sample stress P95 is the observed maximum. No API, storage, upload or model latency is included in these ranking timings.')
heading('Experiment B Pretrained vision execution without training')
para('Compare quantized CLIP ViT-B/32 and SigLIP Base ONNX checkpoints using Transformers.js on CPU. [1,2] The fixture is 18 original garment illustrations: six shapes with three color/background variations, derived from the app SVG assets. Anonymous filenames prevent category leakage. Reference categories come from the authored shapes. The existing filename heuristic defaults all 18 images to Top. These images represent demo silhouettes, not real wardrobe photos.')
para('Both models use the same six fixed label phrases and template, one warmup, then one timed prediction per image. Record every prediction, ranking score, latency and pinned model revision; no prompts, weights or thresholds are tuned. Use q8, four intra-op threads and one inter-op thread. Scores are uncalibrated rankings. No model performs background cleanup or color extraction in this test.')
heading('Reproduction and available resources')
para('<font face="Courier">npm ci<br/>npm test<br/>npm run benchmark<br/>npm run vision:compare<br/>npm run dev</font>','SmallText')
para(f"Measured host: {escape(r['environment']['cpu'])}; {r['environment']['logicalCpus']} logical CPUs; {r['environment']['ramGiB']} GiB reported RAM; Windows x64; Node {r['environment']['node']}. No discrete GPU required. npm and first-time model downloads need network access. The lockfile, dataset hashes, model revisions, source, raw results, and generators are checked in; model caches are ignored. Inspect the comparison in the app's Lab screen.",'SmallText')

newpage()
para('Measured findings and limitations','ReportTitle')
heading('Outfit constraints improve while ownership is preserved')
table([
['Metric and denominator','Original baseline','Ranked prototype'],
['Feasible requests with valid top-three result',f"{b['top3Hits']}/{b['eligible']} ({100*b['top3ConstraintSuccess']:.1f}%)",f"{p['top3Hits']}/{p['eligible']} ({100*p['top3ConstraintSuccess']:.1f}%)"],
['Impossible requests correctly declined',f"{b['correctAbstentions']}/{b['impossible']}",f"{p['correctAbstentions']}/{p['impossible']}"],
['Constraint-invalid individual suggestions',f"{b['invalidOutfits']}/{b['returnedOutfits']}",f"{p['invalidOutfits']}/{p['returnedOutfits']}"],
['Suggestions entirely from stored garments',f"{b['ownedOutfits']}/{b['returnedOutfits']}",f"{p['ownedOutfits']}/{p['returnedOutfits']}"],
['Duplicate suggestions within a request',b['duplicateSuggestions'],p['duplicateSuggestions']],
['Warm ranking P95 across fixture calls',f"{b['p95Ms']:.3f} ms",f"{p['p95Ms']:.3f} ms"],
],[290,115,115])
para('The baseline already preserves ownership, but frequently suggests garments that fail context or quest constraints. Its top-three success rate hides invalid individual options and impossible requests. The prototype removes those failures in this fixture. Unknown and mislabeled metadata produce explicit abstention; this is safe behavior under recorded metadata, not proof that the actual closet lacks a wearable combination.')
heading('A scalability failure changed the implementation')
ex200=next(x['p95Ms']for x in old['stress']if x['method']=='prototype'and x['size']==200)
new200=next(x['p95Ms']for x in r['stress']if x['method']=='prototype'and x['size']==200)
para(f'The first exhaustive prototype took {ex200:,.1f} ms at P95 for 200 garments, exceeding a one-second interaction budget. The revised search keeps the best candidates per slot under the separable wear score; its 200-item P95 was {new200:.3f} ms. Tests establish equality with exhaustive top-three outputs on all 180 fixture queries. This pruning depends on the current additive score and must be reconsidered if pairwise color/style compatibility is added. Both runs and the failed exhaustive implementation are preserved.')
heading('Vision smoke test results')
table([
['Method','Correct illustrations','Warm P95'],
['Filename heuristic',f"{v['filenameBaseline']['correct']}/18 (16.7%)",'Not timed'],
['CLIP ViT-B/32 q8 CPU',f"{clip['correct']}/18 ({clip['accuracy']*100:.1f}%)",f"{clip['p95Ms']:.1f} ms"],
['SigLIP Base q8 CPU',f"{siglip['correct']}/18 ({siglip['accuracy']*100:.1f}%)",f"{siglip['p95Ms']:.1f} ms"],
],[260,145,115])
para('SigLIP labeled one outerwear illustration as Top. CLIP is the provisional next-test candidate on this evidence because it made fewer errors and ran faster. Eighteen correlated, clean illustrations are too easy and too small to establish real-photo accuracy or statistical superiority. Each model is forced to select one of six classes even for an unrelated photo. Cached load time and download time are separate from warm inference. No job-failure, real upload, or mobile-device benchmark was performed.')
para('Evidence: experiments/results/latest.json, experiments/results/exhaustive-prototype.json, and vision/results/latest.json include full outputs and timing protocol. The benchmark quality counts are deterministic; timings vary with device load. There is no held-out user or photo evaluation and no confidence interval presented for correlated synthetic samples.','SmallText')

newpage()
para('Project decision and next validation','ReportTitle')
heading('Modify the implementation and proceed with bounded scope')
para('The evidence supports a working technical path for stored-garment styling and local pretrained classification. It does not justify claiming all semester Must Have requirements are complete. Adopt constrained ranking, visible abstention and metadata correction now. Keep the web demo and resale export. Delay social features, weather, marketplace integration, large-model training and mobile migration until the core workflow is measured with users.')
table([
['Next step','Owner and acceptance gate'],
['Ship this Sprint 3 baseline','Implemented: ranked options, explanations, stricter quest validation, Lab comparison, reproducible scripts and raw evidence. Maintain regression checks.'],
['Evaluate real photos before choosing a model','Junhao and project team: collect >=120 distinct, consented garments across six classes. Use 60 development and 60 locked test items, grouping alternate views by garment. Compare both pretrained models; review confusion matrix, macro F1, unknown-item failures, correction burden and >=80% category target.'],
['Decide on tuning together','Junhao participates in model/prompt selection and any tuning. If zero-shot performance is inadequate, jointly consider prompt changes or a frozen-embedding classifier before fine-tuning. Do not tune on locked test labels.'],
['Validate actual styling usefulness','Recruit 5-8 target users for an initial pilot. Randomize/blind baseline and prototype options and record accept/modify/reject, task completion and correction time. Evaluate the >=70% top-three acceptance target with explicit denominators; do not invent results.'],
['Connect and validate backend','Add authentication, private storage and complete deletion. Test cross-user access denial, image-job retries, >=95% job success and 90% under 20 seconds. Measure deployed API P95 <1 second separately.'],
],[151,369])
para('Contingency: if photo recognition or background removal remains unreliable, retain manual metadata and original images as an explicitly scoped fallback while collecting correction data. This changes the original AI-processing commitment and must be agreed by the team/instructor; it is not equivalent to completing it. If real users reject constrained outfits, revise ranking or narrow contexts before adding personalization.')
heading('Submission and inspection')
para('Upload this four-page PDF to the course assignment. The working proof of concept is in <link href="https://github.com/noobyanjunhao/Closet-Quest" color="#254b3c">github.com/noobyanjunhao/Closet-Quest</link>. README and experiments/README.md document setup, scenarios, metrics, limitations and the preserved performance failure. vision/README.md documents the pretrained comparison and collaborative evaluation plan. The report builder reads the checked-in evidence; no course submission is automated.')
heading('References and technical sources')
para('[1] Hugging Face Xenova. CLIP ViT-B/32 ONNX model card and usage. <link href="https://huggingface.co/Xenova/clip-vit-base-patch32">huggingface.co/Xenova/clip-vit-base-patch32</link><br/>[2] Google and Hugging Face Xenova. SigLIP Base model and ONNX usage. <link href="https://huggingface.co/google/siglip-base-patch16-224">huggingface.co/google/siglip-base-patch16-224</link>; <link href="https://huggingface.co/Xenova/siglip-base-patch16-224">huggingface.co/Xenova/siglip-base-patch16-224</link><br/>[3] BRIA. RMBG-2.0 model card and access conditions. <link href="https://huggingface.co/briaai/RMBG-2.0">huggingface.co/briaai/RMBG-2.0</link><br/>[4] FastAPI. Deployment concepts. <link href="https://fastapi.tiangolo.com/deployment/concepts/">fastapi.tiangolo.com/deployment/concepts/</link><br/>Accessed September 13 2026. Project targets come from the supplied Semester MVP Report; measured results come from this repository.','SmallText')

doc=SimpleDocTemplate(str(out),pagesize=letter,rightMargin=46,leftMargin=46,topMargin=40,bottomMargin=43,title='Closet Quest Technical Feasibility and Baseline',author='Junhao Yan')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
pages=len(PdfReader(str(out)).pages)
if pages!=4:raise RuntimeError(f'Expected 4 pages, got {pages}; adjust layout and render again.')
(ROOT/'docs/sprint-3-report-source.txt').write_text('\n\n'.join(transcript),encoding='utf-8')
print(f'Created {out} ({pages} pages)')
