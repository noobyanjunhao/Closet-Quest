"""Landscape scenario presentation built from actual browser captures."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SHOTS=ROOT/'output/roleplay/screenshots'
OUT=ROOT/'output/pdf/Closet-Quest-Roleplay-Demo.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
W,H=1152,648
C=canvas.Canvas(str(OUT),pagesize=(W,H))
C.setTitle('Closet Quest | Role-play demonstration')
C.setAuthor('Closet Quest')
INK='#263e33';MUTED='#697361';PAPER='#f7f8f1';RULE='#d8dece'

def paragraph(text,x,y,width,size=16,color=INK,font='Helvetica',leading=None):
    p=Paragraph(text,ParagraphStyle('copy',fontName=font,fontSize=size,leading=leading or size*1.4,textColor=HexColor(color)))
    _,height=p.wrap(width,H);p.drawOn(C,x,y-height);return y-height

def base(number,label,title):
    C.setFillColor(HexColor(PAPER));C.rect(0,0,W,H,fill=1,stroke=0)
    paragraph(label.upper(),42,610,1000,11,MUTED,'Helvetica-Bold')
    paragraph(title,42,577,1068,34,INK,'Times-Roman',38)
    C.setStrokeColor(HexColor(RULE));C.line(42,40,1110,40)
    paragraph('CLOSET QUEST   /   ACTUAL PROTOTYPE SCREENS',42,28,900,9,MUTED)
    paragraph(f'{number:02}',1080,28,30,9,MUTED)

def screenshot(name,x=307,y=79,width=803,height=432,crop=None):
    image=Image.open(SHOTS/name)
    if crop:image=image.crop(crop)
    scale=min(width/image.width,height/image.height)
    dw,dh=image.width*scale,image.height*scale
    C.setFillColor(HexColor('#ffffff'));C.roundRect(x-4,y-4,width+8,height+8,8,fill=1,stroke=0)
    C.drawImage(ImageReader(image),x+(width-dw)/2,y+(height-dh)/2,dw,dh,mask='auto')

def scene(number,label,title,name,quote,result,note,crop=None):
    base(number,label,title)
    y=paragraph(escape(quote),42,489,225,25,INK,'Times-Italic',31)
    y=paragraph(result,42,y-30,222,16)
    paragraph(note,42,143,225,10,MUTED)
    screenshot(name,crop=crop)
    C.showPage()

scene(1,'Alex / the opening','A closet full of clothes. More ways to wear them.','01-closet.png',
      '“I always reach for the same five things.”',
      'Alex can see photographed pieces, search the wardrobe and start styling from clothes already owned.',
      'Screenshots use a separate sample wardrobe. Wear dates are simulated for the role-play.')
scene(2,'Monday / 8:10 AM','The forgotten jacket comes back into view','02-rediscover.png',
      '“Wait. I forgot I owned that.”',
      'The closet check finds the blazer after <b>43 days</b> without a recorded wear. Alex can style it, keep it or prepare a resale draft.',
      'Our real sample is a navy blazer. Use “navy blazer” in place of “green jacket” in the script.')
scene(3,'Monday / adding a piece','A real photo becomes editable wardrobe details','12-photo-review.png',
      '“So I don’t have to type everything?”',
      'Local photo analysis suggests the garment category and visible attributes. Alex reviews the details before using the piece in an outfit.',
      'Live Qwen3-VL analysis of a public sample photograph. Suggestions remain editable.')
scene(4,'Friday / dinner at 7:30','Dinner starts with Alex’s own closet','03-dinner-outfit.png',
      '“Casual, but put together. And no shopping.”',
      'The brief keeps the blazer as a starting piece. The result combines an owned tee, jeans and sneakers with that jacket.',
      'This captured result uses Quick wardrobe matching. The screen explicitly labels it as non-generative.')
scene(5,'The challenge / +150 XP','One forgotten favorite. Three saved outfits.','05-quest-complete.png',
      '“Okay, now I’m interested.”',
      'Friday dinner, campus layers and weekend coffee use different core combinations. All three count toward the quest, earning <b>150 XP</b>.',
      'Earned through app interactions. Accessory-only changes do not count. The reward can only be claimed once.')
scene(6,'Saturday / inspiration','The photo becomes a set of style ideas','06-inspiration-review.png',
      '“I like the look. I don’t own those exact pieces.”',
      'The local model describes the visible shirt, trousers, loafers and belt. Alex reviews and saves those ideas.',
      'A mistaken socks suggestion was removed during review. This is a real reviewed model result, not a preset answer.')
scene(7,'Saturday / matching the closet','Owned alternatives, with missing pieces shown','07-inspiration-matches.png',
      '“What can I recreate with my clothes?”',
      'The app suggests owned alternatives by category and recorded details. The belt has <b>no matching accessory</b>, so the gap stays visible.',
      'These are keyword-based alternatives, not exact visual matches. A tote is not substituted for a belt.')
scene(8,'Three months later / closet check','The shoes already have a resale starting point','08-resale-draft.png',
      '“I keep saying I’ll sell these someday.”',
      'The shoes have gone <b>96 days</b> without a recorded wear. Their wardrobe details and photo become an editable draft that Alex can save or export.',
      'Brand, size, condition and price still need checking. Depop publication is not connected or demonstrated.')
scene(9,'The close / using the wardrobe','A saved outfit becomes a recorded wear','10-wear-journal.png',
      '“I get more out of what’s already there.”',
      'Wear today updates the garments and adds a journal entry. Undo restores the previous counts and dates.',
      'Recorded and undone during this walkthrough. No personal wardrobe data was changed.')

base(10,'Additional capability / photos','Camera entry and optional background cleanup')
screenshot('11-camera-upload.png',42,193,521,313,crop=(365,36,915,685))
screenshot('13-background-preview.png',589,193,521,313,crop=(215,110,595,555))
paragraph('<b>Add a photo</b><br/>Camera and file-upload entry points lead to garment review.',42,167,506,15)
paragraph('<b>Review the cleanup</b><br/>Plain-background removal offers a preview and keeps the original recoverable.',589,167,506,15)
paragraph('Physical camera capture was not verified. Cleanup is a conservative edge-color method, not an AI segmentation model.',42,72,1040,10,MUTED)
C.showPage()

base(11,'Evidence and credits','What these screens demonstrate')
paragraph('<b>Working in the prototype</b><br/>Local recognition and review, owned-outfit suggestions, a three-look quest with a one-time reward, reviewed inspiration matching, wear tracking, keep reminders and saved resale drafts.',42,498,497,18)
paragraph('<b>Limits of this demonstration</b><br/>Sample photos and simulated history. Inspiration matching uses categories and keywords. No live weather, verified fabric recognition, automatic marketplace listing or cloud account sync is demonstrated.',606,498,497,18)
paragraph('<b>Verification</b><br/>96 application tests passed, including new date, quest, matching, background and inspiration API checks. The production build passed. These screenshots document browser interactions on 29 September 2026.',42,307,497,15)
paragraph('<b>Presentation note</b><br/>The screen examples use the existing navy blazer and public sample outfit photo. They illustrate the scenarios in your script without claiming those exact green-jacket or black-pants photos exist in the sample closet.',606,307,497,15)
credits=json.loads((ROOT/'public/photos/sources.json').read_text(encoding='utf-8'))
paragraph('<b>Photo credits</b> (full source and license links in the screenshot package)',42,172,1040,11)
lines=[]
for row in credits:
    author=row['author'].replace('\n',' / ')
    if row['id']=='blazer':author='Wikimedia Commons user Safiru'
    lines.append(f"{escape(row['id'])}: {escape(author)} ({escape(row['license'])})")
paragraph('; '.join(lines)+'. Photos resized in the app. Cleanup appears only in its labeled preview.',42,150,1068,10,MUTED)
C.showPage();C.save()
print(OUT)
