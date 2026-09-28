"""Generate the concise core prototype report from checked-in measured results."""
import json
from pathlib import Path
from statistics import median
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, Flowable
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import letter
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
core = json.loads((ROOT / 'experiments/results/core-v2.json').read_text())
live = json.loads((ROOT / 'experiments/results/live-core-v2.json').read_text())
INK, GREEN, MUTED, LINE = '#233d32', '#eaf0e4', '#667164', '#d8dfd2'
styles = {
    'title': ParagraphStyle('title', fontName='Times-Roman', fontSize=32, leading=35, textColor=colors.HexColor(INK), spaceAfter=12),
    'sub': ParagraphStyle('sub', fontName='Helvetica', fontSize=10, leading=15, textColor=colors.HexColor(MUTED), spaceAfter=16),
    'h': ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=13, leading=18, textColor=colors.HexColor(INK), spaceBefore=14, spaceAfter=7),
    'body': ParagraphStyle('body', fontName='Helvetica', fontSize=9.3, leading=13.8, textColor=colors.HexColor(INK), spaceAfter=9),
    'small': ParagraphStyle('small', fontName='Helvetica', fontSize=8, leading=11.5, textColor=colors.HexColor(MUTED), spaceAfter=7),
    'cell': ParagraphStyle('cell', fontName='Helvetica', fontSize=8.3, leading=11.5, textColor=colors.HexColor(INK)),
    'head': ParagraphStyle('head', fontName='Helvetica-Bold', fontSize=8, leading=11, textColor=colors.white),
}
story = []
def p(text, style='body'):
    story.append(Paragraph(text, styles[style]))
def table(rows, widths):
    cells = [[Paragraph(escape(str(value)), styles['head' if row == 0 else 'cell']) for value in values] for row, values in enumerate(rows)]
    item = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    item.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor(INK)),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f2f4ee'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor(LINE))]))
    story.append(item); story.append(Spacer(1,9))

class Architecture(Flowable):
    def __init__(self): super().__init__(); self.width=504; self.height=104
    def draw(self):
        c=self.canv
        labels=[('1  RETRIEVE','BM25 + optional dense'),('2  PLAN','Owned, reviewed, complete'),('3  SELECT','OpenAI / local / quick'),('4  VALIDATE','IDs, anchor, low-use'),('5  EXPLAIN','Cards + saved facts'),('6  FALL BACK','Bounded, labeled recovery')]
        for index,(title,detail) in enumerate(labels):
            col=index%3; row=index//3; x=col*172; y=58-row*55
            c.setFillColor(colors.HexColor(GREEN));c.roundRect(x,y,160,46,6,fill=1,stroke=0)
            c.setFillColor(colors.HexColor(INK));c.setFont('Helvetica-Bold',8.6);c.drawString(x+10,y+28,title)
            c.setFont('Helvetica',7.4);c.drawString(x+10,y+12,detail)

p('Closet Quest', 'title')
p('Core technology prototype<br/>Implementation, evaluation and integration analysis | 27 September 2026', 'sub')
p('01 / Working implementation - 50%', 'h')
p('<b>Turn reviewed garment photos into complete outfits from clothes the user owns.</b> The working local prototype now connects camera/upload, background recognition, correction, grounded recommendation, saved looks and resale drafts through three main tabs.')
story.append(Architecture());story.append(Spacer(1,8))
p('Camera preview, capture/retake and native mobile capture feed the existing image validator and durable Qwen3-VL 4B recognition jobs. Review opens after import; suggestions fill an untouched form automatically. Edits and replaced photos are protected. Unreviewed garments stay out of recommendations.')
table([
    ['Layer','Implemented capability'],
    ['Retrieval + planning','BM25/synonyms + optional Qwen text vectors and rank fusion; up to 200 records to 18 candidates to 12 valid plans. A 512-vector memory cache complements the disk cache.'],
    ['Provider routing','Auto: OpenAI when configured, otherwise Quick. OpenAI Responses uses strict JSON schema, a pinned GPT-4.1 mini snapshot, store:false and a 1,200-token output cap. Local: Gemma 3 4B.'],
    ['Reliability','One retrieval pass. Six-second embedding budget, 15-second OpenAI deadline, 45-second local deadline. Cancellable calls, validated plan IDs, explicit Quick fallback. AI titles derive from actual wardrobe records.'],
    ['External connection','Official Depop own-shop and paginated-listing adapter with server-only keys, fixed origins and staging default. Local draft/export works; live partner access is pending.'],
], [105,399])
p('<b>Scope:</b> React and a local Node API implement the design layers. FastAPI, Expo, PostgreSQL/pgvector, cloud image storage, real account isolation and cloud deployment remain integration work. Quick is deterministic lexical RAG, not generative AI. OpenAI and Depop keys were unavailable for live validation.', 'small')
story.append(PageBreak())

p('Measure the capability.', 'title')
p('02 / Evaluation and baseline comparison - 30%', 'sub')
p('<b>Protocol:</b> 30 frozen synthetic wardrobes, 180 identical requests; independent oracle checks owned/reviewed IDs, unique complete outfits and low-use requirements. There are 132 structurally feasible requests and 48 impossible ones. Occasion compatibility is measured separately because v2 treats tags as preferences.')
a,b,d=(core['summary'][key] for key in ['original_v1','assignment3','quick_rag_v2'])
rows=[['Metric','Original v1','Assignment 3','Quick RAG v2']]
for label,key,denom in [('Top-3 structural success','top3Success','feasible'),('Correct abstention','correctAbstentions','impossible'),('Invalid returned outfits','invalid','returned'),('Exact occasion compatibility','occasionCompatible','returned')]:
    rows.append([label]+[f'{v[key]}/{v[denom]}' for v in (a,b,d)])
rows += [['Duplicate suggestions']+[v['duplicate'] for v in (a,b,d)],['In-process median / P95']+[f"{v['p50Ms']:.3f} / {v['p95Ms']:.3f} ms" for v in (a,b,d)]]
table(rows,[192,104,104,104])
p('<b>Interpretation:</b> v2 returned zero invalid outfits and found combinations for all feasible requests. It is slower than simple rules and its exact occasion compatibility is only 70.8%, versus 100% for Assignment 3. Broader structural coverage does not establish better style quality. The earlier strict-occasion oracle had 98 feasible cases; its 98/98 result is retained, not replaced by this new denominator.', 'small')
two=median(live['retrievalPassExperiment']['twoPassMs']);one=median(live['retrievalPassExperiment']['onePassMs'])
http=[row['wallMs'] for row in live['http']]
# Use nearest-rank P50 consistently with the raw experiment summary.
q50=sorted(http)[(len(http)+1)//2-1]
table([
    ['Live runtime probe','Observed result / boundary'],
    ['Semantic recall@18, 8 authored cases','BM25 1/8; hybrid 8/8. Existing disk cache, 64-item wardrobes. Reused development probes, not held out.'],
    ['Warm retrieval, 10 alternating pairs',f'Two passes median {sorted(live["retrievalPassExperiment"]["twoPassMs"])[4]:.2f} ms; one pass {sorted(live["retrievalPassExperiment"]["onePassMs"])[4]:.2f} ms. Isolates retrieval overhead, not overall app speed.'],
    ['Quick local HTTP, 10 requests',f'Median {q50:.2f} ms; maximum {max(http):.2f} ms. Seven public sample records; no LLM call.'],
    ['Local AI, 2 requests',f'{live["local"][0]["wallMs"]/1000:.2f} s / {live["local"][1]["wallMs"]/1000:.2f} s. First request used lexical fallback after an embedding timeout.'],
    ['OpenAI / Depop','Not run: API key / approved partner key missing. Mocked contracts do not demonstrate live service quality.'],
], [192,312])
p('Windows, Node 24.19, AMD Ryzen 9 8945HS. CPU timings: one sample per query including first-use initialization. Raw evidence: experiments/results/core-v2.json and live-core-v2.json. No human fashion-preference evaluation was performed.', 'small')
story.append(PageBreak())

p('What still needs work.', 'title')
p('03 / Technical analysis - 20%', 'sub')
table([
    ['Observed issue / limitation','Response and next step'],
    ['Cold inference is slow','The first local request took 25.83 s; query embedding exceeded six seconds. Lexical recovery kept the request usable. Next: index after review, benchmark smaller embeddings and measure cold/warm P95 across 50-200 pieces.'],
    ['Valid IDs do not ensure truthful advice','A live title mentioned a tee missing from its sweater plan. Displayed titles now come from selected records. Free-form explanations remain unverified; add claim-to-garment checks and human faithfulness review.'],
    ['Soft occasions can disappoint','107 of 366 v2 outfits lack exact occasion-tag compatibility. Add a strict occasion option and measured weather/availability constraints; do not call structural success fashion accuracy.'],
    ['Small, reused development evidence','Seven previously debugged photos gave 7/7 category matches; eight authored retrieval cases gave 8/8 recall. Freeze unseen photos and briefs before further tuning. Track per-class errors, attribute accuracy and correction time.'],
    ['Fine-tuning is not complete','A synthetic pairwise ranker exists and stays off by default. Feedback logging and offline QLoRA preparation exist, but no LLM/VLM adapter was trained. Gather consented real examples; split by garment/wardrobe/person and require improvement on frozen tests.'],
    ['External and cloud dependencies','OpenAI and Depop need real credentials and live acceptance tests. Depop publication needs real images, reviewed price/size/condition, taxonomy and shipping. Hosting needs authentication, authorization, durable storage and deletion/retention policies.'],
], [172,332])
p('Verification and practical limits', 'h')
p('<b>104 checks passed:</b> 91 app tests, 8 ML checks and 5 Python preflight tests; production build passed. New coverage includes cancellation, malformed/refused responses, unknown plan IDs, one-pass fallback, privacy allowlists, camera track cleanup, protected edits, cache invalidation and Depop authentication/pagination.')
p('Desktop camera startup recovery was checked, but physical capture needs iOS/Android and real-camera testing. JPEG/PNG/WebP up to 8 MB are supported; HEIC is not. Browser storage is finite and device-local. Garment deletion does not yet purge all historical vector-cache entries. No remote private-wardrobe deployment is claimed.', 'small')
p('<b>Next evaluation:</b> at least 50 unseen phone photos and 50 unseen briefs, frozen before tuning. Report category macro-F1, per-attribute accuracy, correction time, Recall@18/NDCG, invalid-outfit rate, wearer top-three acceptance, fallback rate and cold/warm P50/P95. Include clutter, dark photos, multiple garments, footwear pairs, incomplete closets and vocabulary shifts.', 'small')
story.append(PageBreak())

p('Demonstrate the prototype.', 'title')
p('04 / Reproduction, walkthrough and delivery', 'sub')
p('<b>Four-minute walkthrough:</b> Add clothes and capture/select a photo; review suggested details; create a look from reviewed pieces; inspect its source facts; save or record a wear; open a resale draft and show the real Depop connection status. The offline walkthrough and detailed script are included in output/demo/ and docs/core-demo.md.')
image_path=ROOT/'output/demo/stylist.png'
if image_path.exists():
    picture=Image(str(image_path));width,height=picture.imageWidth,picture.imageHeight
    scale=min(504/width,250/height);picture.drawWidth=width*scale;picture.drawHeight=height*scale
    picture.hAlign='CENTER'
    story.append(picture);story.append(Spacer(1,6))
    p('Actual local prototype. Public sample photography; Quick output is labeled separately from generative AI.', 'small')
p('Run and verify', 'h')
p('<font name="Courier">npm ci<br/>npm run dev<br/>npm test &amp;&amp; npm run ml:test<br/>npm run core:evaluate</font><br/>For local models: <font name="Courier">npm run ai:start</font> (install models first if missing). With the app running: <font name="Courier">npm run core:live</font>. Python preflight: <font name="Courier">python -m unittest discover -s ml -p test_lora.py</font>. Production: <font name="Courier">npm run build</font>, then <font name="Courier">npm start</font>.')
p('Copy .env.example to .env.local for server credentials, then restart. The live script makes two OpenAI calls if configured. Keep credentials, model weights and private wardrobes out of the course upload. The submission ZIP contains source, raw evidence, this report and the demonstration. Course submission remains manual.', 'small')
p('References and source record', 'h')
p('<link href="https://github.com/noobyanjunhao/Closet-Quest">github.com/noobyanjunhao/Closet-Quest</link><br/>User-supplied Technical Design Document, 17 September 2026, pp. 1-6; retained Sprint 3 report.<br/><link href="https://developers.openai.com/api/docs/guides/structured-outputs">OpenAI Structured Outputs</link> and <link href="https://developers.openai.com/api/docs/models/gpt-4.1-mini">GPT-4.1 mini</link>; <link href="https://partnerapi.depop.com/api-docs/concepts/authentication/">Depop partner authentication</link> and <link href="https://partnerapi.depop.com/api-docs/openapi.yaml">official API specification</link>. Reviewed 27 September 2026.', 'small')

def frame(canvas, doc):
    canvas.setFillColor(colors.HexColor('#fbfcf8'));canvas.rect(0,0,612,792,fill=1,stroke=0)
    canvas.setStrokeColor(colors.HexColor(LINE));canvas.line(54,42,558,42)
    canvas.setFillColor(colors.HexColor(MUTED));canvas.setFont('Helvetica',7.5)
    canvas.drawString(54,28,'CLOSET QUEST  /  CORE TECHNOLOGY EVALUATION')
    canvas.drawRightString(558,28,f'{doc.page} / 4')

out=ROOT/'output/pdf/Closet-Quest-Core-Technology-Report.pdf';out.parent.mkdir(parents=True,exist_ok=True)
document=SimpleDocTemplate(str(out),pagesize=letter,leftMargin=54,rightMargin=54,topMargin=43,bottomMargin=55,title='Closet Quest - Core Technology Evaluation',author='Closet Quest')
document.build(story,onFirstPage=frame,onLaterPages=frame)
pages=len(PdfReader(out).pages)
if pages!=4: raise RuntimeError(f'Expected 4 pages, got {pages}; adjust layout before delivery.')
print(f'Created {out.name}: {pages} pages')
