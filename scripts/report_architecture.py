"""Code-audited, vector architecture figures for the Sprint 6 report."""
from pathlib import Path
from math import atan2, cos, sin, pi
from reportlab.graphics.shapes import Drawing, Rect, String, PolyLine, Polygon
from reportlab.graphics import renderSVG
from reportlab.lib import colors
from reportlab.lib.utils import simpleSplit

INK = colors.HexColor('#233d32')
MUTED = colors.HexColor('#52665d')
GREEN = colors.HexColor('#edf3ed')
GOLD = colors.HexColor('#f7f0df')
BORDER = colors.HexColor('#b8c8bd')
WHITE = colors.white


class Figure:
    def __init__(self, height):
        self.height = height
        self.d = Drawing(504, height)

    def text(self, x, top, text, size=8.2, bold=False, color=INK):
        self.d.add(String(x, self.height-top-size, text,
                          fontName='Helvetica-Bold' if bold else 'Helvetica',
                          fontSize=size, fillColor=color))

    def box(self, x, top, width, height, title, body='', fill=GREEN, size=8.2):
        self.d.add(Rect(x, self.height-top-height, width, height, rx=7, ry=7,
                        fillColor=fill, strokeColor=BORDER, strokeWidth=.7))
        cursor = top + 10
        for line in simpleSplit(title, 'Helvetica-Bold', 9.1, width-20):
            self.text(x+10, cursor, line, 9.1, True)
            cursor += 11.5
        if body:
            cursor += 4
            for paragraph in body.split('\n'):
                for line in simpleSplit(paragraph, 'Helvetica', size, width-20):
                    self.text(x+10, cursor, line, size)
                    cursor += 10.5
        if cursor > top+height-5:
            raise ValueError(f'Figure text exceeds box: {title}')

    def arrow(self, points, color=MUTED, dashed=False):
        coords = [(x, self.height-y) for x, y in points]
        self.d.add(PolyLine([n for point in coords for n in point],
                           strokeColor=color, strokeWidth=1,
                           strokeDashArray=[3, 3] if dashed else None))
        (x0, y0), (x1, y1) = coords[-2:]
        angle = atan2(y1-y0, x1-x0)
        tip = [x1, y1]
        for a in (angle+pi-.45, angle+pi+.45):
            tip.extend([x1+5*cos(a), y1+5*sin(a)])
        self.d.add(Polygon(tip, fillColor=color, strokeColor=color, strokeWidth=.3))


def rag_pipeline():
    f = Figure(478)
    f.text(0, 0, 'INDEXING  /  WHEN DOCUMENTS ARE ADDED OR REINDEXED', 8, True, MUTED)
    f.box(0, 18, 108, 66, 'Notes + guides', 'User text and authored style references', GOLD)
    f.box(126, 18, 108, 66, 'Chunk text', '900 characters; 120 overlap', GOLD)
    f.box(252, 18, 108, 66, 'Embed passages', 'Selected local or OpenAI adapter', GOLD)
    f.box(378, 18, 126, 66, 'SQLite library', 'Chunks, vectors, source + model IDs', GOLD)
    for x in (108, 234, 360):
        f.arrow([(x, 51), (x+18, 51)])
    f.text(0, 103, 'RECOMMENDATION  /  ONE REQUEST, ORDERED STAGES', 8, True, MUTED)
    f.box(0, 122, 458, 49, '1  Prepare the request',
          'Reviewed garments + brief + occasion/anchor + preferences + recent feedback')
    f.arrow([(114, 171), (114, 190)])
    f.box(0, 190, 220, 87, '2  Retrieve owned garments',
          'Hard color exclusions first\nBM25 + dense cosine -> rank fusion\nCoverage + preference/feedback scores\nKeep up to 18 of 200 garments', size=8)
    f.box(238, 190, 220, 87, '3  Retrieve document passages',
          'Same brief + preferences\nCosine 70% + lexical score 30%\nUp to 4 passages; source IDs retained\nKeyword fallback if vectors fail', size=8)
    f.arrow([(220, 233), (238, 233)])
    f.arrow([(441, 84), (489, 84), (489, 218), (458, 218)], color=colors.HexColor('#9b793a'))
    f.arrow([(348, 277), (348, 294)])
    f.box(0, 294, 458, 67, '4  Build complete plans and bounded context',
          'Owned-item outfit plans + garment facts + preferences + authored guides\nAt most 2 document excerpts in the 6,000-byte model prompt\nRetrieved documents are reference data, never instructions', size=8.1)
    f.arrow([(229, 361), (229, 376)])
    f.box(0, 376, 458, 43, '5  Select plans with structured output',
          'OpenAI or local stylist chooses plan IDs; Quick supplies deterministic fallback', size=8)
    f.arrow([(229, 419), (229, 434)])
    f.box(0, 434, 458, 43, '6  Validate, display and remember',
          'Ownership, completeness + anchor checks -> up to 3 outfits + saved history', size=8)
    f.arrow([(458, 456), (474, 456), (474, 147), (458, 147)], dashed=True)
    return f.d


def system_design():
    f = Figure(470)
    f.d.add(Rect(0, 470-91, 504, 91, rx=9, ry=9, fillColor=GREEN, strokeColor=BORDER))
    f.text(12, 9, 'BROWSER  /  REACT 19', 8, True, MUTED)
    f.box(12, 29, 278, 54, 'Closet -> Stylist -> Saved looks',
          'Photo/camera input, human review, style + memory', WHITE, 8)
    f.box(324, 29, 168, 54, 'localStorage', 'Garments/photos, preferences, looks + history', WHITE, 8)
    f.arrow([(290, 48), (324, 48)])
    f.arrow([(324, 62), (290, 62)])
    f.text(171, 99, 'Same-origin HTTP; JSON, photos, job polling/cancel', 8, color=MUTED)
    f.d.add(Rect(0, 470-333, 504, 216, rx=9, ry=9, fillColor=GREEN, strokeColor=BORDER))
    f.box(12, 129, 480, 47, 'NODE 24  /  LOOPBACK API + BUILT FRONTEND',
          'Host/origin checks, request limits, image validation/EXIF removal; server-only API key', WHITE, 8)
    f.arrow([(154, 91), (154, 129)])
    f.arrow([(252, 176), (252, 192), (87, 192), (87, 207)])
    f.arrow([(252, 176), (252, 207)])
    f.arrow([(252, 192), (417, 192), (417, 207)])
    f.box(12, 207, 150, 112, 'Recognition service',
          'Durable photo jobs\n1 local + 2 cloud workers\nSeparate direct API cap\nProvider/profile routing\nValidated result cache\nEditable human review', WHITE, 8)
    f.box(177, 207, 150, 112, 'Recommendation service',
          'Preferences + feedback\nWardrobe/document RAG\nOwned outfit planning\nBounded prompt + validation\nQuick fallback + provenance', WHITE, 8)
    f.box(342, 207, 150, 112, 'Document service',
          'Add/delete/reindex notes\nChunk + embed + search\nWardrobe UUID namespace\nVector identity validation\nKeyword fallback', WHITE, 8)
    f.arrow([(122, 333), (122, 373)])
    f.text(132, 346, 'Read/write + cache', 8, color=MUTED)
    f.arrow([(382, 333), (382, 373)])
    f.text(291, 346, 'Provider adapters', 8, color=MUTED)
    f.box(0, 373, 244, 96, 'LOCAL PERSISTENCE + CACHES',
          'SQLite: documents, chunks, vectors + metadata\nFiles: durable job JSON, photos, local vector cache\nMemory: cloud vectors + recognition results\nNo cloud wardrobe database in this alpha', GOLD, 8)
    f.box(260, 373, 244, 96, 'MODEL SERVICES  /  SELECTABLE',
          'OpenAI API: vision, styling + embeddings\nLocal Ollama: vision, styling + embeddings\nFast / Balanced / Deep route configured models\nQuick planner executes inside Node', GOLD, 8)
    return f.d


FIGURES = {'rag-pipeline': rag_pipeline, 'system-design': system_design}


def export_figures(root: Path):
    target = root / 'docs' / 'diagrams'
    target.mkdir(parents=True, exist_ok=True)
    for name, build in FIGURES.items():
        renderSVG.drawToFile(build(), str(target / f'{name}.svg'))


if __name__ == '__main__':
    export_figures(Path(__file__).resolve().parents[1])
