"""Build the four-page beta report from Markdown and inspectable vector diagrams."""
from pathlib import Path
import re
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Line, Polygon, String
from reportlab.graphics import renderSVG
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/Closet-Quest-Sprint-9-Beta-Report.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
WIDTH=519.28
INK=HexColor('#28262B'); PLUM=HexColor('#79354F'); MUTED=HexColor('#6F6770')
PALE=HexColor('#F4EEF1'); LINE=HexColor('#DED4DA'); CREAM=HexColor('#F8F6F1')
font=Path('C:/Windows/Fonts/arial.ttf')
if font.exists():
    pdfmetrics.registerFont(TTFont('CQ',str(font)))
    pdfmetrics.registerFont(TTFont('CQBold','C:/Windows/Fonts/arialbd.ttf'))
    pdfmetrics.registerFontFamily('CQ',normal='CQ',bold='CQBold')
else:
    from reportlab.pdfbase.pdfmetrics import Font
    pdfmetrics.registerFont(Font('CQ','Helvetica','WinAnsiEncoding'))
    pdfmetrics.registerFont(Font('CQBold','Helvetica-Bold','WinAnsiEncoding'))
    pdfmetrics.registerFontFamily('CQ',normal='CQ',bold='CQBold')
styles={
    'body':ParagraphStyle('body',fontName='CQ',fontSize=9.3,leading=12.15,spaceAfter=6.4,textColor=INK),
    'h1':ParagraphStyle('h1',fontName='CQBold',fontSize=23,leading=27,spaceAfter=10,textColor=PLUM),
    'h2':ParagraphStyle('h2',fontName='CQBold',fontSize=15,leading=19,spaceBefore=7,spaceAfter=9,keepWithNext=True,textColor=PLUM),
    'cell':ParagraphStyle('cell',fontName='CQ',fontSize=8.3,leading=10.6,textColor=INK),
    'caption':ParagraphStyle('caption',fontName='CQ',fontSize=7.7,leading=10,spaceAfter=6,textColor=MUTED),
}

def box(d,x,y,w,h,title,lines=(),tint=PALE):
    d.add(Rect(x,y,w,h,rx=7,ry=7,fillColor=tint,strokeColor=LINE,strokeWidth=.7))
    d.add(String(x+9,y+h-15,title,fontName='CQBold',fontSize=8.5,fillColor=PLUM))
    for i,t in enumerate(lines):
        d.add(String(x+9,y+h-28-i*10,t,fontName='CQ',fontSize=7.5,fillColor=INK))

def arrow(d,x1,y1,x2,y2,color=PLUM):
    d.add(Line(x1,y1,x2,y2,strokeColor=color,strokeWidth=1.1))
    if x2>x1: pts=[x2,y2,x2-4,y2+2.4,x2-4,y2-2.4]
    elif x2<x1: pts=[x2,y2,x2+4,y2+2.4,x2+4,y2-2.4]
    elif y2>y1: pts=[x2,y2,x2-2.4,y2-4,x2+2.4,y2-4]
    else: pts=[x2,y2,x2-2.4,y2+4,x2+2.4,y2+4]
    d.add(Polygon(pts,fillColor=color,strokeColor=color))

def system_diagram():
    d=Drawing(WIDTH,119)
    box(d,0,63,122,54,'PHONE / DESKTOP',['React + Vite','Review, cards, backup'])
    box(d,154,63,211,54,'RENDER / NODE 24 API',['Session + owner checks; bounded work','Recognition, RAG, validation, recovery'])
    box(d,397,63,122,54,'SUPABASE / PRIVATE',['Auth + Postgres','Owner-scoped photos'])
    arrow(d,122,90,152,90);arrow(d,365,90,395,90)
    box(d,154,0,211,47,'PROCESS-LOCAL STATE',['Photo jobs, vector cache, admission limits'],CREAM)
    box(d,397,0,122,47,'EXTERNAL PROVIDERS',['AI + retailer sources','Server-side keys only'],CREAM)
    arrow(d,260,63,260,49)
    d.add(Line(365,76,380,76,strokeColor=PLUM,strokeWidth=1.1))
    d.add(Line(380,76,380,24,strokeColor=PLUM,strokeWidth=1.1))
    arrow(d,380,24,395,24)
    d.add(String(0,31,'Private photos stay out',fontName='CQ',fontSize=7.8,fillColor=MUTED))
    d.add(String(0,20,'of the styling prompt.',fontName='CQ',fontSize=7.8,fillColor=MUTED))
    d.add(String(0,9,'AWS practice: not deployed.',fontName='CQ',fontSize=7.8,fillColor=MUTED))
    return d

def rag_diagram():
    d=Drawing(WIDTH,129)
    box(d,0,57,81,55,'1 / BRIEF',['Occasion, anchors','Preferences'])
    box(d,101,88,106,39,'2 / CLOTHES',['Hybrid / owned only'])
    box(d,101,38,106,39,'2 / NOTES',['Keyword / vectors'])
    box(d,231,57,80,55,'3 / PLANS',['Bounded context','Owned plan IDs'])
    box(d,335,57,80,55,'4 / ROUTE',['Local rules or','one model call'])
    box(d,439,57,80,55,'5 / VALIDATE',['Check owned IDs','Outfit cards'])
    arrow(d,81,93,99,107);arrow(d,81,75,99,57)
    arrow(d,207,107,229,94);arrow(d,207,57,229,75)
    arrow(d,311,84,333,84);arrow(d,415,84,437,84)
    box(d,231,0,288,39,'ERROR OR DEADLINE',['Local plan from the same evidence + visible fallback'],CREAM)
    arrow(d,375,57,375,41)
    arrow(d,501,39,501,55)
    d.add(String(0,19,'Parallel retrieval',fontName='CQBold',fontSize=8,fillColor=PLUM))
    d.add(String(0,7,'Explicit feedback informs later ranking.',fontName='CQ',fontSize=7.5,fillColor=MUTED))
    return d

diagrams={'sprint9-system-design.svg':system_diagram(),'sprint9-rag-pipeline.svg':rag_diagram()}
for name,d in diagrams.items():
    path=ROOT/'docs/diagrams'/name;path.parent.mkdir(parents=True,exist_ok=True)
    renderSVG.drawToFile(d,str(path))
    svg=path.read_text(encoding='utf-8').replace('font-family: CQBold;', 'font-family: Arial, sans-serif; font-weight: bold;').replace('font-family: CQ;', 'font-family: Arial, sans-serif;')
    title='Closet Quest system architecture' if 'system' in name else 'Closet Quest RAG and stylist pipeline'
    description='Browser to owner-scoped Node API, private Supabase storage and external providers.' if 'system' in name else 'Parallel owned-clothes and note retrieval, bounded plans, one generation or local rules, and owned-ID validation.'
    path.write_text(svg.replace('<title>...</title>',f'<title>{title}</title>').replace('<desc>...</desc>',f'<desc>{description}</desc>'),encoding='utf-8')

def rich(s):
    s=escape(s.replace('\u2014',' - ').replace('\u2013','-').replace('\u2011','-'))
    s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)',r'<i>\1</i>',s)
    def link(m):
        label,target=m.groups()
        if not target.startswith('http'):
            target='https://github.com/noobyanjunhao/Closet-Quest/blob/main/'+('docs/'+target if not target.startswith('../') else target[3:])
        return f'<link href="{target}" color="#79354F">{label}</link>'
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',link,s)
    return re.sub(r'`([^`]+)`',r'<b>\1</b>',s)

text=(ROOT/'docs/sprint9-beta-validation.md').read_text(encoding='utf-8')
story=[]
for block in re.split(r'\n\s*\n',text):
    if re.match(r'## [234]\.',block):story.append(PageBreak())
    ims=re.findall(r'!\[([^]]*)\]\(([^)]+)\)',block.strip())
    if ims:
        if len(ims)==2:
            images=[]
            for alt,target in ims:
                obj=Image(str((ROOT/'docs'/target).resolve()))
                scale=min(340/obj.imageWidth,220/obj.imageHeight)
                obj.drawWidth=obj.imageWidth*scale;obj.drawHeight=obj.imageHeight*scale
                images.append(obj)
            t=Table([images],colWidths=[132,355],hAlign='CENTER')
            t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(0,0),(-1,-1),'CENTER'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
            story.extend([t,Spacer(1,4)]);continue
        alt,target=ims[0];name=Path(target).name
        if name in diagrams:story.extend([diagrams[name],Spacer(1,7)])
        else:
            path=(ROOT/'docs'/target).resolve()
            if path.exists():
                obj=Image(str(path));scale=min(WIDTH/obj.imageWidth,165/obj.imageHeight)
                obj.drawWidth=obj.imageWidth*scale;obj.drawHeight=obj.imageHeight*scale
                obj.hAlign='CENTER';story.extend([obj,Spacer(1,4)])
            else:
                # Earlier public sample captures remain an explicit fallback for local preview.
                a=Image(str(ROOT/'output/sprint8/closet-mobile.png'),width=76,height=164.3)
                b=Image(str(ROOT/'output/sprint8/closet-desktop.png'),width=259,height=164)
                t=Table([[a,b]],colWidths=[116,300],hAlign='CENTER')
                t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(0,0),(-1,-1),'CENTER')]))
                story.extend([t,Spacer(1,4)])
        continue
    if block.startswith('|'):
        rows=[]
        for line in block.splitlines():
            cells=[c.strip() for c in line.strip().strip('|').split('|')]
            if all(re.fullmatch(r'[: -]+',c) for c in cells):continue
            rows.append([Paragraph(rich(c),styles['cell']) for c in cells])
        widths={2:[WIDTH*.31,WIDTH*.69],3:[WIDTH*.30,WIDTH*.19,WIDTH*.51],4:[WIDTH*.25]*4}[len(rows[0])]
        table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LINEBELOW',(0,0),(-1,-1),.35,LINE)]))
        story.extend([table,Spacer(1,7)])
    else:
        style='h2' if block.startswith('## ') else 'h1' if block.startswith('# ') else 'caption' if block.startswith(('*Interface','*Current')) else 'body'
        value=re.sub(r'^#{1,2} ','',block).replace('  \n','<br/>').replace('\n',' ')
        story.append(Paragraph(rich(value).replace('&lt;br/&gt;','<br/>'),styles[style]))

def page(c,doc):
    c.setStrokeColor(LINE);c.line(38,808,557,808)
    c.setFont('CQ',7.7);c.setFillColor(MUTED)
    c.drawString(38,820,'CLOSET QUEST / SPRINT 9 / BETA RELEASE & INDEPENDENT TESTING')
    c.drawString(38,22,'November 17, 2026  |  Beta release and validation')
    c.drawRightString(557,22,str(doc.page))

doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=38,rightMargin=38,topMargin=46,bottomMargin=38,title='Closet Quest - Sprint 9 Beta Release and Independent Testing',author='Closet Quest')
doc.build(story,onFirstPage=page,onLaterPages=page)
r=PdfReader(str(OUT));print({'file':str(OUT),'pages':len(r.pages),'bytes':OUT.stat().st_size})
assert len(r.pages)==4,'Report must remain exactly four pages; edit content rather than hiding overflow.'
