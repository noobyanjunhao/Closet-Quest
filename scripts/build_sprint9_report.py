from pathlib import Path
import re
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/Closet-Quest-Sprint-9-Beta-Report.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
font=Path('C:/Windows/Fonts/arial.ttf')
if font.exists():
    pdfmetrics.registerFont(TTFont('CQ',str(font)))
    pdfmetrics.registerFont(TTFont('CQBold','C:/Windows/Fonts/arialbd.ttf'))
    pdfmetrics.registerFontFamily('CQ',normal='CQ',bold='CQBold')
else:
    pdfmetrics.registerFontFamily('CQ',normal='Helvetica',bold='Helvetica-Bold')
    from reportlab.pdfbase.pdfmetrics import Font
    pdfmetrics.registerFont(Font('CQ','Helvetica','WinAnsiEncoding'))
    pdfmetrics.registerFont(Font('CQBold','Helvetica-Bold','WinAnsiEncoding'))
styles={
    'body':ParagraphStyle('body',fontName='CQ',fontSize=10.2,leading=14.3,spaceAfter=8,textColor=HexColor('#302B33')),
    'h1':ParagraphStyle('h1',fontName='CQBold',fontSize=24,leading=28,spaceAfter=16,textColor=HexColor('#79354F')),
    'h2':ParagraphStyle('h2',fontName='CQBold',fontSize=14,leading=18,spaceBefore=12,spaceAfter=8,keepWithNext=True,textColor=HexColor('#79354F')),
    'cell':ParagraphStyle('cell',fontName='CQ',fontSize=8.4,leading=11.3,textColor=HexColor('#302B33')),
}
def rich(s):
    s=escape(s.replace('\u2014',' - ').replace('\u2013','-').replace('\u2011','-'))
    s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
    def link(m):
        label,target=m.groups()
        if not target.startswith('http'):
            target='https://github.com/noobyanjunhao/Closet-Quest/'+('tree/main/' if target.endswith('/') else 'blob/main/')+('docs/'+target if not target.startswith('../') else target[3:])
        return f'<link href="{target}" color="#79354F">{label}</link>'
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',link,s)
    s=re.sub(r'`([^`]+)`',r'<b>\1</b>',s)
    s=s.replace('https://closet-quest-junhao-s7.onrender.com/', '<link href="https://closet-quest-junhao-s7.onrender.com/" color="#79354F">closet-quest-junhao-s7.onrender.com</link>') if '<link' not in s else s
    return s
text=(ROOT/'docs/sprint9-beta.md').read_text(encoding='utf-8')
story=[]
for block in re.split(r'\n\s*\n',text):
    if block.startswith('|'):
        rows=[]
        for line in block.splitlines():
            cells=[c.strip() for c in line.strip().strip('|').split('|')]
            if all(re.fullmatch(r'[: -]+',c) for c in cells):continue
            rows.append([Paragraph(rich(c),styles['cell']) for c in cells])
        width=519.28
        widths=[width*.27,width*.25,width*.28,width*.2] if len(rows[0])==4 else [width*.44,width*.56]
        table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#EDE2E9')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,-1),.4,HexColor('#DCD2DA'))]))
        story.extend([table,Spacer(1,8)])
    else:
        style='h2' if block.startswith('## ') else 'h1' if block.startswith('# ') else 'body'
        value=re.sub(r'^#{1,2} ','',block).replace('  \n','<br/>').replace('\n',' ')
        story.append(Paragraph(rich(value).replace('&lt;br/&gt;','<br/>'),styles[style]))
def page(c,doc):
    c.setStrokeColor(HexColor('#DDCFD8'));c.line(38,808,557,808)
    c.setFont('CQ',8);c.setFillColor(HexColor('#766471'))
    c.drawString(38,820,'CLOSET QUEST / BETA RELEASE & INDEPENDENT TESTING')
    c.drawString(38,22,'November 9, 2026  |  Independent participant results pending')
    c.drawRightString(557,22,str(doc.page))
doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=38,rightMargin=38,topMargin=46,bottomMargin=38,title='Closet Quest - Sprint 9 Beta Release and Independent Testing',author='Closet Quest')
doc.build(story,onFirstPage=page,onLaterPages=page)
r=PdfReader(str(OUT));print({'file':str(OUT),'pages':len(r.pages),'bytes':OUT.stat().st_size})
assert 3<=len(r.pages)<=4

