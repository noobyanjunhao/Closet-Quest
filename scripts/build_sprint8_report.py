"""Four-page report from recorded experiments; never substitutes simulated users for people."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/sprint8'
data=json.loads((OUT/'model-results.json').read_text(encoding='utf-8'))
stress=json.loads((OUT/'robustness-results.json').read_text(encoding='utf-8'))
shopping=json.loads((OUT/'shopping-preview-improvement.json').read_text(encoding='utf-8'))
pdf=ROOT/'output/pdf/Closet-Quest-Sprint-8-Robustness-Report.pdf'
pdf.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(pdf),pagesize=(612,792))
c.setTitle('Closet Quest - Robustness and responsible deployment')
c.setAuthor('Closet Quest | Junhao Yan')
INK=HexColor('#26282b'); MUTED=HexColor('#67676a'); WINE=HexColor('#78394c'); LINE=HexColor('#dedbd8'); PALE=HexColor('#f5f1ed')
styles={k:ParagraphStyle(k,fontName='Helvetica-Bold' if k in ('h','th') else 'Helvetica',fontSize=s,leading=l,textColor=INK,spaceAfter=0) for k,s,l in [('p',10.2,14.2),('small',8.3,11.2),('h',14,18),('th',8.8,11.5),('cell',9.1,12.3)]}
y=0
def para(t,kind='p',x=44,w=524,gap=9):
 global y
 p=Paragraph(t,styles[kind]);_,h=p.wrap(w,700);p.drawOn(c,x,y-h);y-=h+gap
 assert y>=42, f'Page overflow at {t[:60]}: {y}'
def section(t):para(t,'h',gap=10)
def page(n,kicker,title):
 global y
 if n>1:c.showPage()
 c.setFillColor(PALE);c.rect(0,754,612,38,fill=1,stroke=0)
 c.setFillColor(WINE);c.setFont('Helvetica-Bold',8);c.drawString(44,768,'CLOSET QUEST / SPRINT 8');c.setFont('Helvetica',8);c.drawRightString(568,768,'27 OCTOBER 2026')
 c.setFillColor(MUTED);c.setFont('Helvetica',8);c.drawString(44,27,kicker);c.drawRightString(568,27,f'{n} / 4')
 c.setStrokeColor(LINE);c.line(44,40,568,40)
 y=725;c.setFillColor(INK);c.setFont('Helvetica-Bold',25);c.drawString(44,y,title);y-=30
def table(rows,widths):
 global y
 values=[[Paragraph(str(v),styles['th' if i==0 else 'cell']) for v in row] for i,row in enumerate(rows)]
 t=Table(values,colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));_,h=t.wrap(524,700);t.drawOn(c,44,y-h);y-=h+12;assert y>=42
def pct(v):return f'{v*100:.1f}%'
def screenshot(path,x,top,w,h):
 im=ImageReader(str(path));iw,ih=im.getSize();scale=min(w/iw,h/ih);c.drawImage(im,x,top-ih*scale,width=iw*scale,height=ih*scale,mask='auto')

page(1,'Evidence-driven improvement','A closet that keeps working.')
para('This iteration focuses on a simple promise: a difficult photo or an incomplete wardrobe should not stop someone from putting an outfit together. The strongest measured improvement is in recovery from partially invalid recognition output. The new closet and shopping flow make that recovery more useful, but their effect on people has not yet been measured.')
section('What the earlier evidence changed')
para('The previous 100-photo study completed 93/100 multi-item requests; failed responses accounted for 16 of its 24 missed category occurrences. That made whole-response rejection a higher priority than switching models. Project feedback also asked for a closet that feels browsable and real products when owned clothes are insufficient.')
table([
 ['Problem / baseline','Implemented change','Evidence this iteration'],
 ['One malformed piece could discard the whole scene.','Keep individually validated pieces; omit invalid entries and show a review warning.','Same 67 model responses: 61 accepted before, 67 after. Six recovered responses retained 15 pieces.'],
 ['Static wardrobe grid; missing-piece cards were placeholders.','Circular photo/cutout rail, thumbnail selection and an optional retailer search.','Browser flow exercised at 390 x 844 and 1440 x 900 CSS pixels; real search results and prices recorded.'],
 ['Build audit flagged one high-severity affected dependency.','Patch Vite 7.3.6 to 7.3.7 without changing the app framework.','Known vulnerable dependencies: 1 to 0; production build and all 210 tests pass.'],
 ],[151,186,187])
section('The updated experience')
top=y
screenshot(OUT/'closet-mobile.png',44,top,132,245)
old=y;y=top
para('The rail uses the user\'s existing cutout, original photo, or chosen pixel icon. A garment moves into the center as the user selects it; arrows, swipe gestures and the thumbnail strip provide equivalent controls. The grid remains available.','p',x=194,w=374)
para('In the browser check, a sample blazer was extracted locally, reviewed, saved and displayed on the rail. Opening Saved looks and returning preserved the selected piece. Styling from the rail carried that piece into the outfit brief. These are functional checks on sample data, not usability-study results.','p',x=194,w=374)
para('Phone capture: actual local build, using a public sample garment. The cutout is a processed photograph, not a generated clothing image.','small',x=194,w=374)
y=min(y,top-245)-8
para('<b>Interpretation:</b> recovery improved. We have not established faster dressing, less shopping, greater outfit acceptance or reduced environmental impact. No human participants were recruited for this iteration.','small',gap=0)

page(2,'Live model validation','What the model gets right.')
section('A controlled comparison on new photographs')
para('Before running inference, we froze 20 Fashionpedia photographs not used in the earlier 100-photo or 18-photo evaluations, checking both image IDs and hashes. Selection used a fixed hash order from 35 eligible images with CC BY 2.0 or public-domain metadata. Each image was tested unchanged, at 35% brightness, and at 160-pixel resolution with blur (sigma 1.2) and JPEG quality 50.')
para('We made 60 live multi-item calls using gpt-6-luna, high image detail and a 4,096-token output limit. Each raw response was passed through both validators: prompt, model response and inference latency were identical within each pair. Seven previously failed photos were rechecked separately, producing 67 calls total, with no retries. The 60 variants represent 20 independent photos, not 60 independent samples.','p')
rows=[['Condition (n)','Completion<br/>before / after','Recall<br/>before / after','Precision<br/>before / after','F1<br/>before / after']]
for key,label in [('fresh:original','Original (20)'),('fresh:low-light','Dimmed (20)'),('fresh:small-blur','Small + blur (20)'),('selected-recheck:original','Prior failures (7)*')]:
 b=data['scores'][key]['before'];a=data['scores'][key]['after'];rows.append([label,f"{b['completed']}/{b['images']} to {a['completed']}/{a['images']}",f"{pct(b['microRecall'])} / {pct(a['microRecall'])}",f"{pct(b['microPrecision'])} / {pct(a['microPrecision'])}",f"{b['microF1']:.3f} / {a['microF1']:.3f}"])
table(rows,[116,100,106,106,96])
para('*The seven prior failures are a selected diagnostic group; their larger gain cannot be generalized to new uploads. The previous failed raw outputs were not retained. This comparison uses new calls replayed through both validators, not a reconstruction of those earlier outputs.','small')
section('Completion is not the same as correctness')
para('On the original photographs, recall rose from 42/47 to 43/47 category occurrences, but precision fell from 42/51 to 43/53. Exact category-set agreement stayed at 10/20. The recovered photo added a correctly labeled dress and an extra accessory category. All six original-photo accessory false positives were jewelry-only: Fashionpedia does not label jewelry in the mapped wardrobe ontology. This is a label mismatch to investigate, not proof that every extra detection is a hallucination.')
para('Blur remained the clearest weakness: after the change, recall was only 28/47 (59.6%), including shoes at 3/10 and accessories at 1/8. Lower resolution can therefore return a structurally valid but incomplete closet. Seven invalid crop boxes and eight ambiguous entries were omitted across the 67 calls; every kept piece still went through the existing validation rules.')
para('Median / p95 request time was 7.23 / 9.94 seconds for originals, 6.75 / 8.49 for dimmed images, and 5.33 / 8.31 for small blurred images. The paired validator comparison does not demonstrate a model-speed gain. Metrics measure image-level category sets, not instance detection, crop IoU, color, material or fashion quality. The new set contains no annotated hats; it cannot establish baseball-cap accuracy.','small',gap=0)

page(3,'Robustness and reliability','Test failure, not just success.')
para('Live calls were complemented by deterministic fault injection and a real local HTTP burst. Injected failures are reported separately: they exercise application behavior but do not estimate how often OpenAI or a retailer fails in production.')
table([
 ['Challenge','Observed result','What it establishes'],
 ['One bad crop in 17 otherwise usable scenes','Before: 0/17 retained a scene.<br/>After: 17/17 retained valid pieces.','Partial recovery without accepting the corrupted box.'],
 ['Five malformed / all-invalid scene cases','5/5 rejected.','Recovery does not accept a wholly invalid scene.'],
 ['Provider 429, 500, bad JSON, network loss, timeout','5/5 returned explicit 503 errors; no fabricated products.','Shopping has a bounded failure path.'],
 ['40 simultaneous HTTP shopping requests','2 completed; 38 received 429; peak provider concurrency was 2. Next request succeeded.','Load shedding and recovery, not 40-user throughput.'],
 ['Unauthenticated, foreign-origin, oversized and unusual-category requests','401, 403, 413 and 400 respectively.','The new route uses identity, origin and input boundaries.'],
 ['Blank, geometric house and image-text injection','Blank rejected locally in 30 ms. Both live non-clothing images returned NOT_FASHION (1.57 / 1.56 s).','Three narrow negative cases; not comprehensive misuse resistance.'],
 ],[156,187,181])
section('Shopping: useful, but coverage remains uneven')
before=json.loads((OUT/'shopping-final-live.json').read_text(encoding='utf-8'))
bproducts=sum(len(r['products']) for r in before);bphotos=sum(bool(p['image']) for r in before for p in r['products'])
aproducts=sum(len(r['products']) for r in shopping);aphotos=sum(bool(p['image']) for r in shopping for p in r['products'])
para(f'Two initial formal-top queries (menswear and womenswear; maximum $300) returned {bproducts} candidates with {bphotos} photo preview. Inspection caught a retailer category-list URL, which the validator now rejects. We also changed retrieval to include a relevant J.Crew product when sourced, because its pages support previews. Repeating the two briefs returned {aproducts} products with {aphotos} previews. These are sequential smoke checks with changing web results, not a controlled estimate of shopping quality.')
table([['Final query','Products / previews','Cold search / cached repeat'],*[ [r['query']['presentation'].capitalize(),f"{len(r['products'])} / {sum(bool(p['image']) for p in r['products'])}",f"{r['latencyMs']/1000:.2f} s / {r['warmMs']:.2f} ms"] for r in shopping]],[168,146,210])
para('Products are sorted by observed USD price and marked as external, never as owned garments. A direct retailer URL must occur in retrieved sources, and its price must occur in evidence for that same page. Photo URLs come from source-linked image results or retailer page metadata. Unavailable previews remain visibly unavailable. A separate image-only lookup returned no usable photos and was removed.','small')
para('The 15-minute cache is scoped by account and query. Four synthetic cache requests made three provider calls, confirming reuse, account separation and expiry. The cached times above measure the in-process function, excluding browser/network latency. Stock, sizing, shipping, discounts and price freshness still require confirmation at the store.','small',gap=0)

page(4,'Responsible deployment and next priorities','Keep the boundaries visible.')
table([
 ['Risk','Implemented control','Remaining limitation'],
 ['Privacy and account separation','Existing Supabase identity, owner-scoped storage and authenticated API routes. Shopping receives only category, occasion, presentation and budget; store:false on OpenAI requests.','Recognition still sends photos to OpenAI. Retailer image loads disclose a network request. Deletion, retention and cross-device behavior need broader independent auditing.'],
 ['Invented clothes or misleading shopping','Owned outfit IDs remain constrained. Invalid pieces are omitted with warnings. Retailer/source/price checks and explicit external labels separate shopping from wardrobe truth.','Source prices may be stale or describe another variant. Title and price co-occurrence is not a complete product-catalog guarantee. No purchase or inventory API is connected.'],
 ['Bias and pressure to spend','User chooses menswear, womenswear or all styles. Budget control and price sorting; borrowing/renting remain visible alternatives. No affiliate ranking.','Nine US retailer domains, USD only; J.Crew preview preference introduces selection bias. Size inclusion, culture, body diversity and affordability are not validated.'],
 ['Accessibility and motion','Arrow keys, Home/End, focus indicators, live selection text, explicit controls and reduced-motion CSS; grid alternative. No automatic spinning.','Keyboard and phone-layout checks are not a screen-reader or WCAG conformance audit. Physical-device gesture and assistive-technology testing remain open.'],
 ['Availability, misuse and dependencies','Bounded requests, two concurrent shopping searches, 25-second deadline, cancel/retry states, source allowlist and redirects checked before retailer fetches. Vite patched; audit now zero known issues.','Per-process limits are not distributed capacity controls. Free Render can sleep; model calls still cost money. A clean dependency audit is not a penetration test.'],
 ],[112,211,201])
section('What should happen next')
para('<b>1. Improve the hardest inputs.</b> Add quality warnings and recapture guidance, then evaluate per-garment boxes and small accessories on consented phone photos. Do not lower confidence thresholds just to increase completion.','small')
para('<b>2. Measure whether people benefit.</b> Run a paired baseline-versus-RAG study with unseen wardrobe briefs. Record top-three acceptance, correction time, evidence usefulness, fallback frequency and cold/warm latency with denominators. No human acceptance or sustainability gain is claimed here.','small')
para('<b>3. Harden shopping and operations.</b> Replace variable web previews with licensed catalog feeds; verify variants, size coverage and price freshness. Test simultaneous signed-in users, real camera capture and account deletion, then add durable monitoring and distributed rate limits before wider release.','small')
section('Traceable release and supporting results')
para('The supporting bundle includes the frozen manifest, all 67 response pairs, the old validator, negative-case and stress results, shopping observations, dependency audits, screenshots and reproducible scripts. Private uploads, credentials and full retailer-page snippets are excluded. Published source and deployment verification are recorded in release.json.','small')
para('<link href="https://closet-quest-junhao-s7.onrender.com/" color="#78394c">Deployed app</link> | <link href="https://github.com/noobyanjunhao/Closet-Quest" color="#78394c">Repository and supporting code</link><br/>Dataset: <link href="https://fashionpedia.github.io/home/" color="#78394c">Fashionpedia</link> (image licenses and source URLs in manifest). Model/tool: <link href="https://developers.openai.com/api/docs/guides/tools-web-search" color="#78394c">OpenAI web search</link>. Dependency advisory: <link href="https://github.com/advisories/GHSA-587h-7wmj-h5pm" color="#78394c">GHSA-587h-7wmj-h5pm</link>.','small',gap=0)
c.save()
print(pdf)
