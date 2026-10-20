"""Illustrated report built from frozen experiment results and live app captures."""
import json, math
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, Flowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from PIL import Image as PILImage
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'output/sprint7'; ASSETS=D/'report-assets'
s=json.loads((D/'summary.json').read_text()); ab=json.loads((D/'ablation-summary.json').read_text())
r=json.loads((ROOT/'output/recognition-100/analysis.json').read_text())
assert r['images']==100 and r['attempts']==200
a=r['summary']['single'];b=r['summary']['multiple']
INK=colors.HexColor('#203e35'); MUTED=colors.HexColor('#526960'); PALE=colors.HexColor('#edf3ef'); LINE=colors.HexColor('#c8d8cf'); BLUE=colors.HexColor('#eaf0f7')
styles={
 'title':ParagraphStyle('title',fontName='Times-Roman',fontSize=27,leading=29,textColor=INK,spaceAfter=10),
 'eyebrow':ParagraphStyle('eyebrow',fontName='Helvetica-Bold',fontSize=8,leading=11,textColor=MUTED,spaceAfter=9),
 'h':ParagraphStyle('h',fontName='Helvetica-Bold',fontSize=12,leading=15,textColor=INK,spaceBefore=9,spaceAfter=6),
 'p':ParagraphStyle('p',fontName='Helvetica',fontSize=9.5,leading=13,textColor=INK,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Helvetica',fontSize=8.2,leading=11,textColor=MUTED,spaceAfter=7),
 'caption':ParagraphStyle('caption',fontName='Helvetica',fontSize=8.2,leading=11,textColor=MUTED,spaceBefore=5,spaceAfter=8),
 'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=8.4,leading=11,textColor=INK),
 'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=8.4,leading=11,textColor=colors.white),
}
story=[]
def p(text,kind='p'):story.append(Paragraph(text,styles[kind]))
def table(rows,widths,padding=6):
 t=Table([[Paragraph(escape(str(v)),styles['head' if i==0 else 'cell']) for v in row] for i,row in enumerate(rows)],colWidths=widths,repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),padding),('BOTTOMPADDING',(0,0),(-1,-1),padding)]));story.extend([t,Spacer(1,7)])
def rate(v):return f"{v['numerator']}/{v['denominator']} ({100*v['value']:.1f}%)" if v['value'] is not None else 'Not measured'
def seconds(ms):return f'{ms:g} ms' if ms<1000 else f'{ms/1000:.2f} s'
def page(n,title):
 if n>1:story.append(PageBreak())
 p(f'CLOSET QUEST / VALIDATION / {n:02d}','eyebrow');p(title,'title')
def screenshot(name,caption,width=504):
 path=ASSETS/name
 with PILImage.open(path) as img:w,h=img.size
 story.append(Image(str(path),width=width,height=width*h/w));p(caption,'caption')

class Architecture(Flowable):
 def __init__(self,kind):
  super().__init__();self.kind=kind;self.width=504;self.height=190 if kind=='system' else 294
 def box(self,x,y,w,h,title,lines,fill=PALE):
  c=self.canv;c.setFillColor(fill);c.setStrokeColor(LINE);c.setLineWidth(.7);c.roundRect(x,y,w,h,7,stroke=1,fill=1)
  c.setFillColor(INK);c.setFont('Helvetica-Bold',9);c.drawString(x+9,y+h-16,title);c.setFont('Helvetica',8.3)
  for i,line in enumerate(lines):c.drawString(x+9,y+h-30-i*11,line)
 def arrow(self,pts,dashed=False):
  c=self.canv;c.setStrokeColor(MUTED);c.setFillColor(MUTED);c.setLineWidth(1)
  c.setDash(3,2) if dashed else c.setDash()
  path=c.beginPath();path.moveTo(*pts[0])
  for xy in pts[1:]:path.lineTo(*xy)
  c.drawPath(path);c.setDash();x,y=pts[-1];a=math.atan2(y-pts[-2][1],x-pts[-2][0]);z=4
  path=c.beginPath();path.moveTo(x,y);path.lineTo(x-z*math.cos(a-.5),y-z*math.sin(a-.5));path.lineTo(x-z*math.cos(a+.5),y-z*math.sin(a+.5));path.close();c.drawPath(path,stroke=0,fill=1)
 def label(self,x,y,text):
  self.canv.setFillColor(MUTED);self.canv.setFont('Helvetica',7.4);self.canv.drawCentredString(x,y,text)
 def draw(self):
  if self.kind=='system':
   self.box(0,116,145,72,'Your browser',['React interface','Review, style, save and wear','Keeps unsynced edits locally'])
   self.box(180,116,145,72,'Render: Node API',['Checks the signed-in user','Coordinates AI and retrieval','Validates and saves results'])
   self.box(360,116,144,72,'OpenAI',['Vision for uploaded photos','Embeddings for text search','Outfit selection and advice'],BLUE)
   self.box(0,2,145,72,'Temporary server data',['SQLite / vector cache','Photo-analysis jobs','Cache can be rebuilt'])
   self.box(180,2,145,72,'Supabase: durable data',['Auth + wardrobe + notes','Private photo storage','Owner-only access policies'],BLUE)
   self.box(360,2,144,72,'Brevo email',['Signup confirmation','Password-reset email route','Links return to the app'])
   self.arrow([(145,153),(180,153)]);self.label(162,163,'HTTPS');self.arrow([(180,141),(145,141)])
   self.arrow([(325,153),(360,153)]);self.label(342,163,'AI calls');self.arrow([(360,141),(325,141)])
   self.arrow([(252,116),(252,74)]);self.label(291,94,'User-scoped')
   self.arrow([(212,116),(212,95),(72,95),(72,74)])
   self.arrow([(325,37),(360,37)]);self.label(342,47,'SMTP')
  else:
   self.box(14,254,476,38,'Stored context',['Reviewed wardrobe  |  saved preferences and feedback  |  personal notes and text vectors'],BLUE)
   self.box(14,153,148,73,'1  Describe the day',['Occasion, request and','optional starting garment'])
   self.box(178,153,148,73,'2  Retrieve useful context',['Shortlist owned pieces','Search notes using keywords','and embedding similarity'])
   self.box(342,153,148,73,'3  Build outfit candidates',['Owned pieces; partial if needed','Respect exclusions and','rank using preferences'])
   self.box(342,44,148,73,'4  Ask OpenAI to choose',['Send plans + limited excerpts','Select plan IDs and explain','why the pieces work'],BLUE)
   self.box(178,44,148,73,'5  Check the response',['Allowed plans and item IDs','Label missing-piece suggestions','Show a fallback if needed'])
   self.box(14,44,148,73,'6  Show an outfit card',['View pieces and explanation','Save, wear or give feedback','Keep a record for next time'])
   self.arrow([(252,254),(252,226)]);self.arrow([(162,189),(178,189)]);self.arrow([(326,189),(342,189)])
   self.arrow([(416,153),(416,117)]);self.arrow([(342,80),(326,80)]);self.arrow([(178,80),(162,80)])
   self.arrow([(88,44),(88,14),(4,14),(4,189),(14,189)],True)
   self.label(292,18,'Feedback informs future requests; it does not retrain OpenAI.')


page(1,'Does Closet Quest help?')
p('Sprint 7 | Validation design and execution | October 20, 2026','eyebrow')
p('Closet Quest helps people choose outfits from clothes they already own. This controlled research pilot tests recognition and styling against simpler alternatives. It shows better garment coverage and preference-target matching, but does not yet establish everyday user value.')
p('What we evaluated','h')
p('We used public annotated photos and fixed fictional wardrobe briefs, with no human participants or domain-expert ratings. Comparing methods on the same inputs helps locate failures; it cannot replace wearer judgments about comfort, taste or usefulness.')
table([['Study and sample','Comparison and execution'],
 ['Photo recognition: 100 images, 200 attempts','Single-piece versus multi-piece on 100 Fashionpedia photos: 336 annotated instances and 247 category occurrences. Two hat photos plus 98 hash-selected general photos; all 18 earlier test images excluded by ID and file hash.'],
 ['Styling: 6 briefs, 11 wardrobe items, 18 attempts','Quick rules, OpenAI without personal memory, and full personal RAG used the same wardrobe and briefs. Condition order rotated. A separate model judged anonymized results in forward and reverse order.'],
 ['Document / feedback study: 6 new briefs, 24 + 6 attempts','A 2x2 experiment toggled notes and feedback independently. Targets were saved before inference; each initial condition ran once per brief. Six immediate repeats measured cache-warm behavior.']],[155,349])
p('How we made the comparisons interpretable','h')
p('Both photo modes used GPT-6 Luna (Fast). Single-piece uses low image detail and 1,200 output tokens; multi-piece uses high detail, 4,096 tokens and up to six detections. This compares app workflows, not equally capable detectors or prompts alone. The baseline is designed for one item, so incomplete scene coverage is expected.')
p('The manifest was fixed before inference. Requests ran serially with alternating mode order, caching disabled and no retries. One selected photo had been used to check the runner; no prompt was tuned afterward. Timings include local processing and live API calls, not phone upload or Render startup. The separate October 19 styling studies used GPT-6 Luna, GPT-6 Astra critique and text-embedding-3-small.')
p('For the 2x2 study, all conditions shared the wardrobe, brief, model, neutral explicit preferences and planning rules. Notes came from a fixed nine-note library plus built-in guides. Feedback consisted of three scripted helpful votes for the target outfit. This isolates two personalization inputs, although it favors scenarios designed to use them.')
p('What counts as success','h')
p('Technical measures are category coverage, precision, job completion, valid owned-item outfits, fallback frequency and latency. The research-impact measure is target-outfit hit@3: whether a preselected top, bottom and shoes appear together in any of up to three suggestions. Extra layers are allowed. It measures recovery of a stated preference, not human acceptance. Failed or empty attempts count as misses.')
p('The original targets are assessed on page 3. Correction time, wearer acceptance, time saved and purchases avoided remain unmeasured. Recognition results below replace the smaller photo pilot; historical records remain separate. Failed attempts remain in the denominators.','small')

page(2,'The system under evaluation')
p('Recognition creates reviewed records; retrieval supplies context; planning and validation constrain the stylist. The account layer supports continued use, but persistence alone does not establish user benefit.')
p('System architecture','h');story.append(Architecture('system'))
p('Figure 1. Current deployment. Photos go to OpenAI for recognition when selected. Styling sends reviewed descriptions and note excerpts. Supabase persists account data; Render jobs and vector caches are temporary. Brevo carries account emails.','caption')
p('RAG pipeline and experimental controls','h');story.append(Architecture('rag'))
p('Figure 2. The 2x2 study toggled notes and feedback with complete outfits. Current updates add labeled partial looks, skip unnecessary small-closet embeddings and reuse prepared document vectors. Frozen styling results remain unchanged.','caption')


page(3,'Technical results and targets')
p('Each category counts once per photo: 247 annotated category occurrences across 100 photos. Failed requests predict nothing and remain in recall, exact-match and completion denominators. Precision describes emitted labels, so read it alongside completion.')
table([['Same 100 photographs','Single-piece baseline','Multi-piece flow'],
 ['Correct / predicted categories',rate(a['precision']),rate(b['precision'])],
 ['Found / annotated categories',rate(a['recall']),rate(b['recall'])],
 ['Micro F1',f"{a['microF1']:.3f}",f"{b['microF1']:.3f}"],
 ['Exactly matched category set',rate(a['exactSet']),rate(b['exactSet'])],
 ['Completed attempts',rate(a['completion']),rate(b['completion'])],
 ['Successful result within 20 s',rate(a['within20s']),rate(b['within20s'])],
 ['Median / p95 attempt time',f"{seconds(a['medianLatencyMs'])} / {seconds(a['p95LatencyMs'])}",f"{seconds(b['medianLatencyMs'])} / {seconds(b['p95LatencyMs'])}"],
 ['Hats found (small subgroup)',rate(a['hatRecall']),rate(b['hatRecall'])]],[194,155,155])
ci=r['pairedBootstrap']['recallGain95CI'];gain=100*(b['recall']['value']-a['recall']['value'])
p(f"Multi-piece found more correct categories on {r['paired']['multi_more_categories']}/100 photos. Recall rose {gain:.1f} percentage points (paired image-bootstrap 95% interval: {100*ci[0]:.1f} to {100*ci[1]:.1f}; 10,000 resamples). This describes the selected photos, not a population of phone users.",'small')
table([['Category: found / annotated','Single-piece','Multi-piece']]+[[c,rate(a['perCategory'][c]['recall']),rate(b['perCategory'][c]['recall'])] for c in ['Top','Bottom','Outerwear','Dress','Shoes','Accessory']],[194,155,155])
codes=', '.join(f"{k}: {v}" for k,v in b['failureCodes'].items()) or 'none'
p('Where the system still breaks','h')
p(f"Multi-piece failures: {codes}. Failed requests account for {b['missingFromFailedRequests']} missed category occurrences; completed responses miss another {b['missingFromCompletedRequests']}. Extra labels total {b['precision']['denominator']-b['precision']['numerator']}. Error codes identify rejection classes; failed raw outputs were not retained, so they cannot establish a unique root cause.",'small')
completion='met' if b['completion']['value']>=.95 else 'not met'
speed='met' if b['within20s']['value']>=.90 else 'not met'
p(f"Targets in this sample: 95% completion is {completion}; 90% successful processing under 20 seconds is {speed}. The 80% per-garment category, 85% color and 70% human-acceptance targets remain unestablished: category-set recall is a different measure, and no color labels or wearer ratings were evaluated.",'small')

page(4,'Research impact of personalization')
p('The practical question is whether the stylist uses personal context to suggest something closer to the intended outfit. We first compared full RAG with simpler alternatives, then separated the effects of notes and feedback on six new briefs.')
c=[s['stylist'][k] for k in ['baseline','no-memory','full']]
table([['Initial six briefs','Quick rules','OpenAI alone','Personal RAG'],
 ['Complete, owned outfits']+[rate(v['structuralValidity']) for v in c],
 ['Accepted in both judge orders']+[rate(v['synthetic']['bothOrdersAcceptable']) for v in c],
 ['Mean preference fit, out of 5']+[f"{v['synthetic']['preferenceFit']:.2f}" for v in c],
 ['Median processing time']+[seconds(v['medianLatencyMs']) for v in c]],[189,105,105,105])
p('Both OpenAI versions used semantic wardrobe retrieval; only full RAG added personal preferences, feedback and a note. The judge rated full RAG acceptable on 6/6 briefs, versus 2/6 for OpenAI alone and 1/6 for rules. Twelve judge calls produced 36 set ratings; the repeated orderings are correlated checks, not additional samples. The judge saw text and belongs to the same provider family, so these scores are supporting critique rather than independent user validation.','small')
p('Primary research-impact result: preferred outfit recovery','h')
arms=[ab['conditions'][k] for k in ['neither','documents','feedback','both']]
table([['Six new briefs','Neither','Notes only','Feedback only','Both'],
 ['Target outfit in top 3']+[f"{v['hitAt3']['numerator']}/6" for v in arms],
 ['Target in candidate plans']+[f"{v['targetPlanAvailable']['numerator']}/6" for v in arms],
 ['Median processing time']+[seconds(v['medianMs']) for v in arms]],[168,84,84,84,84])
p('Adding both notes and feedback increased target hit@3 from 1/6 (16.7%) to 5/6 (83.3%): four more briefs, or 66.7 percentage points. Either input alone reached 3/6. Notes improved two briefs and worsened none at each feedback setting. This is measurable research value: the pipeline recovered an explicitly supplied preference more often than the same pipeline without those inputs. It does not establish a population-level or everyday benefit.')
p('What the retrieval and timing records explain','h')
p('Target notes reached the actual generator prompt in all 12 initial note-enabled calls. However, keyword search also ranked the target note first in all six queries. Shared event wording made retrieval easy; these results do not prove a vector-search advantage. One target outfit never entered the candidate plans in any condition, even when its garments and note were retrieved.')
cold=ab['conditions']['both'];warm=ab['repeatBoth']
p(f"Across all 30 follow-up attempts, 54/54 outfits passed structural checks and model and wardrobe-retrieval fallback frequencies were both 0/30. Immediate full-pipeline repeats reduced median retrieval from {seconds(cold['medianRetrievalMs'])} to {seconds(warm['medianRetrievalMs'])}, and total processing from {seconds(cold['medianMs'])} to {seconds(warm['medianMs'])}; 5/6 repeats were faster. Document indexes were already built. This is cache-cold versus cache-warm behavior, not hosted cold-start latency.",'small')
p('Owned-item validity creates the possibility of reusing clothes. We have not measured correction time, human acceptance, purchases avoided, money saved or environmental effects. Six authored cases and one initial generation per condition are too small and selective for strong generalization.','small')

page(5,'Findings and the next iteration')
p('Personal context improved preferred-outfit recovery. Photo review also exposed label problems: visible jeans/shorts in 9914 and 10471 lack annotations; a long top in 17091 was called a dress. These were assistant visual checks, not expert relabeling. Original scores remain unchanged.')
p(f"On {b['extraAccessoryWithOnlyJewelryPredicted']}/100 multi-piece photos, extra Accessory predictions consist only of Jewelry, which the app supports but the dataset ontology omits. Extra labels therefore are not all confirmed hallucinations. A separate post-hoc sensitivity analysis is included with the supporting results.",'small')
p('Changes in priority order','h')
table([['Priority and reason','Next change and how to validate it'],
 ['1. Establish wearer value','Compare baseline and RAG with the same participants, unseen phone photos and blinded, counterbalanced briefs. Record acceptance, correction seconds, evidence usefulness, fallbacks and cold/warm latency, with denominators and missing observations.'],
 ['2. Fix candidate coverage','Retain feasible preference-matching outfits and ground explanations in selected items. Recheck the omitted outfit and boots/sneakers mismatch, then evaluate a new locked set.'],
 ['3. Repair recognition and labels','Preserve valid pieces when another observation fails; capture diagnostic reasons. Adjudicate labels for jewelry, visible bottoms and long tops, then test a new phone-photo set with more hats and lighting variation.'],
 ['4. Test real phones','Verify camera capture, touch, password-reset delivery and device conflicts. Separate upload, queue, inference and rendering time; Render Free sleeping and temporary jobs remain limitations.']],[145,359],padding=4)
p('A continuous mobile flow','h')
def thumb(name,width):
 path=ASSETS/name
 with PILImage.open(path) as im:w,h=im.size
 return Image(str(path),width=width,height=width*h/w)
photos=Table([[thumb('mobile-closet.jpg',80),thumb('mobile-stylist.jpg',80),thumb('mobile-outfit.jpg',80)]],colWidths=[168,168,168])
photos.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),6),('VALIGN',(0,0),(-1,-1),'TOP')]))
story.append(photos)
p('Figures 3-5. Hosted app captured October 19 at a measured 390 x 844 CSS-pixel viewport, using labeled demo garments. Browser checks preserved wardrobe filters and scroll, the styling draft and selected outfit through navigation and garment inspection. These are desktop mobile-emulation checks, not physical-phone testing or evidence of user satisfaction.','caption')
p('The 100-photo comparison measures broader recognition coverage, while the six-brief study tests preference recovery. Neither proves that people choose outfits faster or buy less. The current build passes 206 engineering tests; user benefit and physical-camera usability still need direct observation.','small')
p('Sources: <link href="https://github.com/cvdfoundation/fashionpedia" color="#315c83">Fashionpedia</link> and <link href="https://fashionpedia.github.io/home/data_license.html" color="#315c83">licenses</link> (annotations adapted from CC BY 4.0; photo licenses recorded); <link href="https://render.com/docs/free" color="#315c83">Render Free limits</link>. Targets: Sprint 6 report. Frozen records, protocols and summaries accompany this report.','small')

def footer(canvas,doc):
 canvas.setStrokeColor(LINE);canvas.line(54,41,558,41);canvas.setFont('Helvetica',8);canvas.setFillColor(MUTED)
 canvas.drawString(54,27,'CLOSET QUEST / VALIDATION REPORT / 20 OCT 2026');canvas.drawRightString(558,27,str(doc.page))
target=ROOT/'output/pdf/Closet-Quest-Sprint-7-Validation-Report.pdf';target.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(target),pagesize=letter,rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=54,title='Closet Quest - Illustrated Validation Report',author='Closet Quest').build(story,onFirstPage=footer,onLaterPages=footer)
print(target)
