"""Four-page results report generated from observed benchmark records."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'output/sprint7'
s=json.loads((D/'summary.json').read_text())
INK=colors.HexColor('#203e35');MUTED=colors.HexColor('#536a61');PALE=colors.HexColor('#edf3ef')
styles={
 'title':ParagraphStyle('title',fontName='Times-Roman',fontSize=28,leading=30,textColor=INK,spaceAfter=10),
 'eyebrow':ParagraphStyle('eyebrow',fontName='Helvetica-Bold',fontSize=8,leading=11,textColor=MUTED,spaceAfter=10),
 'h':ParagraphStyle('h',fontName='Helvetica-Bold',fontSize=12,leading=15,textColor=INK,spaceBefore=10,spaceAfter=6),
 'p':ParagraphStyle('p',fontName='Helvetica',fontSize=9.3,leading=12.5,textColor=INK,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Helvetica',fontSize=8,leading=11,textColor=MUTED,spaceAfter=7),
 'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=8.2,leading=10.8,textColor=INK),
 'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=8.2,leading=10.8,textColor=colors.white),
}
story=[]
def p(text,kind='p'):story.append(Paragraph(text,styles[kind]))
def table(rows,widths):
 t=Table([[Paragraph(escape(str(v)),styles['head' if i==0 else 'cell']) for v in row] for i,row in enumerate(rows)],colWidths=widths,repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]));story.extend([t,Spacer(1,9)])
def rate(v):return f"{v['numerator']}/{v['denominator']} ({100*v['value']:.1f}%)" if v['value'] is not None else 'Not measured'
def seconds(ms):return f'{ms:g} ms' if ms<1000 else f'{ms/1000:.2f} s'
def page(n,title):
 if n>1:story.append(PageBreak())
 p(f'CLOSET QUEST / VALIDATION / {n:02d}', 'eyebrow');p(title,'title')
page(1,'Does a personal closet<br/>make a better stylist?')
p('Research pilot · October 19, 2026','eyebrow')
p('Closet Quest helps people discover wearable combinations from clothes they already own. This evaluation tests two narrower claims: whether one photo can yield several useful wardrobe entries, and whether preferences, memory and retrieved notes improve recommendation relevance.')
table([['Public photos','Authored wardrobe briefs','Human participants'],['18 photos / 36 initial calls','6 briefs / 18 generation runs','0 — human outcomes unmeasured']],[168,168,168])
p('Evaluation design','h')
p('Recognition used Fashionpedia validation annotations [1,2], mapped in advance to the app’s six garment categories. From 127 eligible images with CC BY 2.0 or public-domain metadata and at least two categories, a fixed SHA-256 ranking selected 12 general images and six disjoint hat examples. The manifest was written before predictions. This is a small, enriched sample, not a population estimate or a model-training holdout.')
p('Styling used 11 frozen wardrobe records and six fictional briefs covering campus, coffee and presentations. Every condition received the same explicit brief and owned pieces. Generation order rotated across briefs. The full condition additionally received fictional saved preferences, one feedback record and a personal note indexed in SQLite with OpenAI embeddings.')
table([['Condition','Information and execution'],['Quick baseline','Deterministic planner; lexical wardrobe retrieval; personal preferences, feedback and document retrieval disabled.'],['OpenAI, no memory','Same OpenAI generator and dense wardrobe retrieval as full; personal preferences, feedback and documents disabled.'],['Full personal RAG','OpenAI generator plus explicit preferences, feedback scoring and hybrid document retrieval.']],[133,371])
p('Independent model feedback, not independent human evidence','h')
p('GPT-6 Astra [3] rated anonymized X/Y/Z sets twice per brief, reversing presentation order. It scored brief fit, preference fit, coherence and evidence usefulness from 1 to 5, plus whether at least one look was acceptable under its rubric. There were 12 judge calls and 36 set ratings. The judge saw garment metadata and retrieved passages, not rendered outfits or actual wearability.')
p('The no-memory comparison tests the combined personalization layer. It does not isolate the causal effect of document retrieval from explicit color filters or feedback. Scenarios were authored for this feature; they are not an independent user sample.','small')
page(2,'More pieces found.<br/>More work still needed.')
p('RECOGNITION / FROZEN INITIAL BENCHMARK','eyebrow')
a=s['recognition']['single']['all'];b=s['recognition']['multiple']['all']
table([['Metric','Single-piece baseline','Multi-piece pipeline'],['Completed attempts',f"{a['completed']}/{a['attempts']}",f"{b['completed']}/{b['attempts']}"],['Category precision',rate(a['precision']),rate(b['precision'])],['Category recall',rate(a['recall']),rate(b['recall'])],['Exact category set',rate(a['exactSet']),rate(b['exactSet'])],['Hat detection, enriched subset',rate(a['hatRecall']),rate(b['hatRecall'])],['Median attempt latency',seconds(a['medianLatencyMs']),seconds(b['medianLatencyMs'])]],[190,157,157])
p('What improved','h')
p('The multi-piece flow recovered 24 additional correct category occurrences: recall rose from 34.7% to 83.7% on the combined sample. All six annotated hats were detected, compared with none in the dominant-item baseline. On the 12-image general stratum alone, recall was 22/30 (73.3%), versus 11/30 (36.7%). The stronger hat result should not obscure the weaker general result.')
p('What the numbers mean','h')
p('A correct category contributes one true positive per image, even if several instances share that category. Precision = correct predicted categories / all predicted categories; recall = correct predicted categories / all annotated categories. Failed requests predict an empty set and remain in the recall and attempt denominators. Hats are scored separately by the returned item type. This evaluates inventory coverage, not bounding-box IoU, fabric, color, or fine-grained garment accuracy.')
p('Both flows used GPT-6 Luna. Multi-piece mode also uses higher image detail and a larger output allowance, so this is a workflow comparison, not an isolated prompt experiment. Two workers ran concurrently. Timings cover direct local pipeline execution and provider calls, including failed attempts; they are neither phone-to-screen times nor hosted cold-start measurements.')
p('Failure analysis and a targeted correction','h')
p('The original multi-piece flow rejected images 15707 and 9711 with AMBIGUOUS_ITEM, losing clear detections alongside an uncertain piece. Version 1.1 now omits uncertain pieces individually and shows an explicit review warning; malformed geometry still fails validation. A separate, targeted two-image recheck recovered image 15707 with 4/4 categories. Image 9711 still failed with INVALID_SCENE_RESPONSE. This 1/2 recheck is not a replacement accuracy score: it was selected after observing errors and model outputs are stochastic.')
p('Four extra predicted categories disagree with the dataset labels. They require visual adjudication before calling them hallucinations; coarse mapping and annotation omissions can also create disagreement. No phone-photo accuracy or human correction-time claim is supported yet.','small')
page(3,'Personal relevance improved<br/>in a synthetic test.')
p('STYLING / SAME BRIEFS, THREE CONDITIONS','eyebrow')
c=[s['stylist'][k] for k in ['baseline','no-memory','full']]
table([['Metric','Quick','No memory','Full RAG'],['Completed attempts']+[f"{v['completed']}/{v['attempts']}" for v in c],['Valid owned outfits']+[rate(v['structuralValidity']) for v in c],['Median pipeline latency']+[seconds(v['medianLatencyMs']) for v in c],['Model fallback / attempts']+[rate(v['modelFallback']) for v in c],['Acceptable in BOTH judge orders']+[rate(v['synthetic']['bothOrdersAcceptable']) for v in c],['Preference fit / 5']+[f"{v['synthetic']['preferenceFit']:.2f}" for v in c],['Brief fit / 5']+[f"{v['synthetic']['briefFit']:.2f}" for v in c],['Coherence / 5']+[f"{v['synthetic']['coherence']:.2f}" for v in c]],[180,108,108,108])
p('The measured signal','h')
p('Full RAG received an acceptable rating in both orderings for 6/6 briefs; the quick baseline did so for 1/6 and OpenAI without memory for 2/6. Across the two ratings per brief, preference fit averaged 4.67/5 for full RAG, 2.58 for quick and 2.67 for no memory. There was no binary order disagreement in this small sample. Repeated ratings of the same six cases are not 12 independent users.')
p('All 41 returned outfits passed owned-item and completeness checks. Full RAG returned only nine outfits across six requests, compared with 18 for quick and 14 for no memory: stronger personalization came with fewer alternatives. No model fallback was observed in 18 attempts, and hybrid document retrieval succeeded in 6/6 full runs. These denominators are too small to establish a production failure rate.')
p('Evidence and interpretation','h')
p('Astra rated the full retrieved evidence bundle 4.83/5 on usefulness across 12 ratings. Conditions without documents were assigned 1 by the rubric, so that contrast is not an independent retrieval-quality test. The judge received all retrieved sources; the generator’s bounded prompt used fewer passages. Source IDs are retained in the raw results so that distinction remains auditable.')
p('For the first presentation brief, the judge identified a no-memory explanation that mentioned boots while its selected plan contained sneakers. Owned-ID validation prevents invented wardrobe records but does not guarantee grounded prose. The full condition respected the fictional red-color exclusion and preferred navy/sand combination; this can partly reflect deterministic filtering rather than better model reasoning.')
p('Potential value, not demonstrated social impact','h')
p('The findings support further testing of a more relevant owned-wardrobe assistant. They do not measure time saved, purchases avoided, waste reduction, human acceptance or correction burden. Astra is a same-provider-family, text-only evaluator with shared biases, not a fashion expert or a real participant. A small, feature-aligned synthetic study can overstate usefulness.','small')
page(4,'A measurable alpha.<br/>A focused next iteration.')
p('IMPLEMENTATION AND RELEASE STATUS','eyebrow')
p('The app now includes a paired study workspace with blinded set labels, explicit consent, per-look ratings, evidence ratings and anonymized exports. Failed, cancelled and unscored attempts remain visible. Development rehearsals are excluded from human results. Photo review records active visible-tab review time and edited fields; it does not infer total task time or label correctness from an edit alone.')
p('Hosted access uses private participant codes, signed HttpOnly/Secure cookies and server-derived UUID namespaces. Knowledge and photo-job ownership is checked on the server. Cross-account document and job tests use the real HTTP routes and SQLite store. The final regression suite passed 169/169 tests; the production frontend build passed. Browser inspection confirmed the study workspace renders without console warnings or errors.')
deploy_path=D/'deployment-status.json'
deploy=json.loads(deploy_path.read_text()) if deploy_path.exists() else {'status':'prepared','detail':'Render free-tier configuration and the GitHub deployment branch are prepared. Credential-transfer approval and a live deployment verification are pending.'}
p('Deployment: '+escape(deploy['detail']))
if deploy.get('url'):p('<link href="'+escape(deploy['url'])+'" color="#315c83">'+escape(deploy['url'])+'</link>','small')
p('The free Render service is an alpha host, not durable cloud storage [4]. It sleeps after inactivity and loses server-local SQLite records and uploaded job files on restart. Browser closets persist on that device; imported knowledge must be backed up separately or re-imported. OpenAI usage is billed separately. Shared-device confidentiality, account recovery, cross-device wardrobe sync and durable storage remain unfinished.')
table([['Priority','Observed reason','Next validation gate'],['1. Recognition recovery','One of two targeted failures remains; category precision is imperfect.','Geometry repair or per-piece retry; a fresh, labeled phone-photo set; report corrections and seconds/photo.'],['2. Grounded advice','Valid IDs can coexist with incorrect prose; full RAG returns fewer choices.','Check item mentions against selected records; measure distinct looks and expert/user agreement.'],['3. Real usefulness','Synthetic ratings do not establish user value.','Counterbalanced same-person briefs; top-three acceptance, evidence usefulness, decision time and correction burden.'],['4. Durable deployment','Free host storage is ephemeral; camera hardware unverified.','Persistent account-scoped database and recovery; physical-phone camera and cold/warm hosted measurements.']],[94,191,219])
p('Sources and reproducibility','h')
p('[1] <link href="https://github.com/cvdfoundation/fashionpedia" color="#315c83">Fashionpedia dataset and annotation format</link>. [2] <link href="https://fashionpedia.github.io/home/data_license.html" color="#315c83">Fashionpedia license</link>: annotation mapping is adapted from CC BY 4.0 data; image licenses are recorded individually. [3] <link href="https://developers.openai.com/api/docs/models" color="#315c83">OpenAI model documentation</link>, checked October 19, 2026. [4] <link href="https://render.com/docs/free" color="#315c83">Render free-service limitations</link>.','small')
p('Supporting results: output/sprint7 contains the fixed dataset manifest, per-image JSON/CSV, all fictional briefs and judge reasons, aggregate metrics, targeted recheck and test log. Reproduction scripts are under scripts/. Dataset photos and credentials are excluded from the repository.','small')
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#ccd9d1'));canvas.line(54,41,558,41)
 canvas.setFont('Helvetica',8);canvas.setFillColor(MUTED);canvas.drawString(54,27,'CLOSET QUEST / RESEARCH VALIDATION / 19 OCT 2026');canvas.drawRightString(558,27,str(doc.page))
target=ROOT/'output/pdf/Closet-Quest-Sprint-7-Validation-Report.pdf';target.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(target),pagesize=letter,rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=54,title='Closet Quest - Sprint 7 Validation',author='Closet Quest').build(story,onFirstPage=footer,onLaterPages=footer)
print(target)


