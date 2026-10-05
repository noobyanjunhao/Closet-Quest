"""Render the checked-in Sprint 6 report, then inspect the PDF pages separately."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from report_architecture import FIGURES, export_figures
ROOT=Path(__file__).resolve().parents[1]
export_figures(ROOT)
INK=colors.HexColor('#233d32')
styles={
 'title':ParagraphStyle('title',fontName='Times-Roman',fontSize=31,leading=34,textColor=INK,spaceAfter=12),
 'h':ParagraphStyle('h',fontName='Helvetica-Bold',fontSize=13,leading=17,textColor=INK,spaceBefore=12,spaceAfter=8),
 'p':ParagraphStyle('p',fontName='Helvetica',fontSize=9,leading=12.5,textColor=INK,spaceAfter=9),
 'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=8,leading=10.5,textColor=INK),
 'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=8,leading=10.5,textColor=colors.white),
 'caption':ParagraphStyle('caption',fontName='Helvetica-Oblique',fontSize=8,leading=11,textColor=INK,spaceAfter=9),
}
def markup(s):
 s=escape(s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
 return s
lines=(ROOT/'docs/sprint6-integration-report.md').read_text(encoding='utf-8').splitlines()
story=[];i=0
while i<len(lines):
 line=lines[i].strip();i+=1
 if not line:continue
 if line=='---':story.append(PageBreak());continue
 if line.startswith('# '):story.append(Paragraph(markup(line[2:]),styles['title']));continue
 if line.startswith('## '):story.append(Paragraph(markup(line[3:]),styles['h']));continue
 if line.startswith('|'):
  rows=[line]
  while i<len(lines) and lines[i].startswith('|'):rows.append(lines[i]);i+=1
  cells=[[c.strip() for c in row.strip('|').split('|')] for row in rows if not re.match(r'^\|[\s:|-]+$',row)]
  widths=([145,359] if len(cells[0])==2 else [123,132,249])
  data=[[Paragraph(markup(v),styles['head' if n==0 else 'cell']) for v in row] for n,row in enumerate(cells)]
  table=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f0f3ec'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
  story.extend([table,Spacer(1,10)]);continue
 if line.startswith('!['):
  match=re.match(r'!\[(.*?)\]\((.*?)\)',line)
  figure_path=Path(match[2])
  if figure_path.suffix=='.svg' and figure_path.stem in FIGURES:
   story.extend([FIGURES[figure_path.stem](),Spacer(1,7),Paragraph(markup(match[1]),styles['caption'])]);continue
  image=Image(str((ROOT/'docs'/match[2]).resolve()))
  factor=min(504/image.imageWidth,260/image.imageHeight)
  image.drawWidth=image.imageWidth*factor;image.drawHeight=image.imageHeight*factor
  story.extend([image,Spacer(1,5),Paragraph(match[1]+' - actual October 2 UI capture; public sample photos.',styles['caption'])]);continue
 story.append(Paragraph(markup(line),styles['p']))
def footer(canvas,doc):
 canvas.setFont('Helvetica',8);canvas.setFillColor(INK)
 canvas.drawString(54,29,'CLOSET QUEST  /  SPRINT 6  /  OCTOBER 5, 2026')
 canvas.drawRightString(558,29,str(doc.page))
target=ROOT/'output/pdf/Closet-Quest-Sprint-6-Integration-Report.pdf'
SimpleDocTemplate(str(target),pagesize=letter,rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=45,title='Closet Quest - Sprint 6 End-to-End Alpha',author='Closet Quest').build(story,onFirstPage=footer,onLaterPages=footer)
print(target)
