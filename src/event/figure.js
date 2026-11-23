// Full-body pixel figure for the Pixel Passport ("cq-pixel-v2"), 96 x 136.
// One light from the upper left, hue-shifted colour ramps, outlines in a dark
// version of each part's own colour, and a cast shadow under the chin. Every
// shape is rasterised here from numbers, so the event still ships no images.
export const FIGURE_W = 96, FIGURE_H = 136;
const W = FIGURE_W, H = FIGURE_H, N = W * H, CX = 48, B = 50, EY = 31;

// ---- colour ramps ----
const parse = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
function toHsv([r, g, b]) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0; if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h / 6) % 1 + 1) % 1, max ? d / max : 0, max]; }
function fromHsv([h, s, v]) { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map(x => x * 255); }
const clamp01 = v => Math.max(0, Math.min(1, v));
export function shift(hex, dv, ds = 0) { const [h, s, v] = toHsv(parse(hex)); return toHex(fromHsv([h, clamp01(s + ds), clamp01(v + dv)])); }
export function toward(hex, hue, amount) { const [h, s, v] = toHsv(parse(hex)), d = ((hue - h + 0.5) % 1 + 1) % 1 - 0.5; return toHex(fromHsv([((h + d * amount) % 1 + 1) % 1, s, v])); }
export const blend = (a, b, t) => { const x = parse(a), y = parse(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const ramps = new Map();
// Shadows lean towards violet and highlights towards warm yellow, which keeps flat colours from looking muddy.
export function ramp(hex) {
  let r = ramps.get(hex);
  if (!r) { r = { base: hex.toUpperCase(), sh: toward(shift(hex, -0.16, 0.08), 0.75, 0.10), deep: toward(shift(hex, -0.32, 0.12), 0.75, 0.16), hi: toward(shift(hex, 0.10, -0.08), 0.13, 0.10), line: toward(shift(hex, -0.52, 0.10), 0.75, 0.22) }; if (ramps.size > 400) ramps.clear(); ramps.set(hex, r); }
  return r;
}

// ---- masks ----
const mask = () => new Uint8Array(N);
const put = (m, x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1; };
function line(m, x0, y0, x1, y1) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { put(m, x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
function poly(m, pts) {
  for (let y = 0; y < H; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]; if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax)); }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) put(m, x, y);
  }
  for (let i = 0; i < pts.length; i++) line(m, ...pts[i], ...pts[(i + 1) % pts.length]);
  return m;
}
function ellipse(m, x0, y0, x1, y1, onlyTop = false) { const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2; for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) { if (onlyTop && y + 0.5 > cy) break; for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m[y * W + x] = 1; } return m; }
function rrect(m, x0, y0, x1, y1, r = 0) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x, cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6) put(m, x, y); } return m; }
const P = (...pts) => m => poly(m, pts), E = (...a) => m => ellipse(m, ...a), R = (...a) => m => rrect(m, ...a);
const shape = (...draws) => { const m = mask(); for (const d of draws) d(m); return m; };

// ---- sprite ----
function createSprite() {
  const im = new Array(N).fill(null), ln = new Array(N).fill(null);
  return {
    // Paints a mask with a shaded lower-right edge, a lit upper-left edge and a coloured outline.
    part(m, color, { form = null, rim = 2, hl = 1 } = {}) {
      const r = ramp(color);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!m[i]) continue;
        let c = form && form[i] ? r.sh : r.base;
        const inner = x + rim < W && y + rim < H && m[(y + rim) * W + x + rim];
        if (!inner) c = c === r.base ? r.sh : r.deep;
        else if (hl && !(x - hl >= 0 && y - hl >= 0 && m[(y - hl) * W + x - hl])) c = r.hi;
        im[i] = c; ln[i] = null;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < W - 1 && m[i + 1]) || (y > 0 && m[i - W]) || (y < H - 1 && m[i + W])) ln[i] = r.line; }
      return m;
    },
    dot(x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) { im[y * W + x] = c; ln[y * W + x] = null; } },
    dots(pts, c) { for (const [x, y] of pts) this.dot(x, y, c); },
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.dot(x, y, c); },
    run(x, y, n, c, dx = 1, every = 0) { for (let i = 0; i < n; i++) this.dot(x + (dx ? i * Math.sign(dx) : 0), y + (every ? Math.floor(i / every) : dx ? 0 : i), c); },
    out(dx = 0, dy = 0) { const cells = new Array(N).fill(null); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = im[y * W + x] ?? ln[y * W + x]; if (!c) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) cells[ny * W + nx] = c; } return cells; }
  };
}

// ---- part tables (ids are listed in manifest.js) ----
export const FACES = Object.freeze({ oval: [17, 6, 50], round: [19, 9, 49], square: [19, 10, 51], heart: [18, 5, 50], long: [16, 6, 53] });
export const BUILDS = Object.freeze({ slim: [18, 10], regular: [20, 11], broad: [23, 12] });
const EYES = { round: 3, wide: 4, narrow: 2, lashes: 3 };
const BROWS = { soft: [1, [0, -1, -1, -1, -1, 0]], straight: [1, [0, 0, 0, 0, 0, 0]], thick: [2, [0, 0, -1, -1, -1, 0]], arched: [1, [1, 0, -1, -2, -1, 0]] };
const NOSES = { small: 1, medium: 1, wide: 2 }, MOUTHS = { smile: 4, small: 2, wide: 5, neutral: 4 };
export function figureGeometry(appearance) {
  const [fw0, cw0, chin] = FACES[appearance.faceId] || FACES.oval, [sw, leg] = BUILDS[appearance.buildId] || BUILDS.regular;
  const fw = Math.max(15, Math.min(21, fw0 + (appearance.headWidth || 0))), cw = Math.max(4, Math.min(fw - 7, cw0 + (appearance.jaw || 0)));
  return { cx: CX, fw, cw, chin, sw, leg, gap: Math.max(6, Math.min(fw - 8, 8 + (appearance.eyeGap || 0))) };
}

const capShape = (cx, fw) => P([cx - fw - 1, 28], [cx - fw - 2, 18], [cx - fw + 2, 8], [cx - 8, 2], [cx + 8, 2], [cx + fw - 2, 8], [cx + fw + 2, 18], [cx + fw + 1, 28], [cx + fw - 2, 21], [cx + fw - 5, 15], [cx, 12], [cx - fw + 5, 15], [cx - fw + 2, 21]);
const longBack = (cx, fw, to = 66) => [R(cx - fw - 5, 4, cx + fw + 5, to, 15), P([cx - fw - 5, to - 10], [cx - fw - 3, to + 8], [cx - fw + 5, to]), P([cx + fw + 5, to - 10], [cx + fw + 3, to + 8], [cx + fw - 5, to])];
const sweep = (cx, fw) => [E(cx - fw - 3, 1, cx + fw + 3, 45, true), P([cx - fw - 3, 22], [cx - fw - 3, 52], [cx - fw + 1, 46], [cx - fw + 2, 28]), P([cx + fw + 3, 22], [cx + fw + 3, 54], [cx + fw - 1, 48], [cx + fw - 3, 30]), P([cx - 9, 4], [cx + fw + 2, 13], [cx + fw + 3, 30], [cx + 11, 23], [cx, 19], [cx - 10, 20], [cx - fw + 1, 27], [cx - fw - 2, 19])];
// Hair is two layers: `back` sits behind the body, `front` over the forehead.
const HAIR = {
  none: {},
  buzz: { front(s, g, c) { const { cx, fw } = g; s.part(shape(P([cx - fw, 27], [cx - fw - 1, 17], [cx - fw + 3, 8], [cx - 7, 4], [cx + 7, 4], [cx + fw - 3, 8], [cx + fw + 1, 17], [cx + fw, 27], [cx + fw - 2, 19], [cx + 8, 14], [cx - 8, 14], [cx - fw + 2, 19])), c, { rim: 1, hl: 0 }); const r = ramp(c); for (let y = 6; y < 18; y += 2) for (let x = cx - fw + 3 + (y % 4 ? 1 : 0); x < cx + fw - 2; x += 3) if (y > 7 || Math.abs(x - cx) < 7) s.dot(x, y, r.sh); } },
  short: { front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(P([cx - fw - 1, 30], [cx - fw - 2, 18], [cx - fw + 2, 8], [cx - 8, 2], [cx + 6, 1], [cx + fw - 2, 6], [cx + fw + 2, 16], [cx + fw + 1, 30], [cx + fw - 2, 25], [cx + fw - 3, 19], [cx + 4, 16], [cx - 10, 18], [cx - fw + 3, 20], [cx - fw + 2, 25])), c); s.run(cx - 11, 5, 6, r.line, 0); for (const [x, y, n] of [[cx - 7, 5, 9], [cx + 1, 4, 9], [cx + 9, 7, 6], [cx - 6, 10, 10], [cx + 6, 11, 7]]) s.run(x, y, n, r.hi, 1, 4); s.rect(cx - fw - 1, 22, cx - fw + 1, 29, r.sh); s.rect(cx + fw - 1, 22, cx + fw + 1, 29, r.sh); } },
  quiff: { front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(P([cx - fw, 30], [cx - fw - 1, 19], [cx - fw + 3, 9], [cx - 7, 3], [cx + 4, 0], [cx + 14, 2], [cx + fw + 2, 11], [cx + fw + 1, 30], [cx + fw - 1, 23], [cx + fw - 4, 16], [cx + 6, 14], [cx - 4, 17], [cx - fw + 5, 15], [cx - fw + 2, 23])), c); for (const [x, y, n] of [[cx - 9, 7, 7], [cx - 1, 3, 9], [cx + 8, 4, 6]]) s.run(x, y, n, r.hi, 1, 3); for (const [x, y, n] of [[cx - 6, 10, 8], [cx + 3, 9, 8]]) s.run(x, y, n, r.sh, 1, 4); s.rect(cx - fw, 21, cx - fw + 1, 29, r.sh); s.rect(cx + fw - 1, 21, cx + fw, 29, r.sh); } },
  pixie: { front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(P([cx - fw - 1, 31], [cx - fw - 2, 17], [cx - fw + 2, 7], [cx - 6, 2], [cx + 8, 2], [cx + fw - 1, 8], [cx + fw + 2, 18], [cx + fw + 1, 32], [cx + fw - 2, 27], [cx + fw - 2, 22], [cx + 8, 24], [cx - 2, 21], [cx - 10, 16], [cx - fw + 3, 20], [cx - fw + 2, 26])), c); for (const [x, y, n] of [[cx - 4, 6, 12], [cx + 2, 11, 12], [cx - 9, 9, 6]]) s.run(x, y, n, r.hi, 1, 3); s.run(cx - 10, 4, 8, r.line, 1, 2); } },
  curly: { back(s, g, c) { const { cx, fw } = g; s.part(shape(R(cx - fw - 5, 3, cx + fw + 5, 42, 14)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c), blobs = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8), x = Math.round(cx + Math.cos(a) * (fw + 1)), y = Math.round(22 - Math.sin(a) * 17); blobs.push(E(x - 5, y - 5, x + 5, y + 5)); } for (const dx of [-9, 0, 9]) blobs.push(E(cx + dx - 5, 8, cx + dx + 5, 18)); s.part(shape(...blobs), c, { rim: 2 }); for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8), x = Math.round(cx + Math.cos(a) * (fw + 1)), y = Math.round(22 - Math.sin(a) * 17); s.dots([[x - 2, y - 2], [x - 1, y - 3]], r.hi); s.dots([[x + 2, y + 2], [x + 1, y + 3]], r.deep); } } },
  afro: { back(s, g, c) { const { cx, fw } = g; s.part(shape(E(cx - fw - 8, 0, cx + fw + 8, 42)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(E(cx - fw - 8, 0, cx + fw + 8, 42, true), P([cx - fw - 8, 20], [cx - fw - 6, 34], [cx - fw + 1, 30], [cx - fw + 2, 21]), P([cx + fw + 8, 20], [cx + fw + 6, 34], [cx + fw - 1, 30], [cx + fw - 2, 21])), c, { rim: 3 }); for (let y = 3; y < 20; y += 3) for (let x = cx - fw - 5 + (y % 2 ? 2 : 0); x < cx + fw + 6; x += 4) { const inside = ((x - cx) / (fw + 8)) ** 2 + ((y - 21) / 21) ** 2 < 0.8; if (inside) { s.dot(x, y, r.hi); s.dot(x + 1, y + 1, r.deep); } } s.part(shape(P([cx - fw + 2, 21], [cx - fw + 4, 16], [cx, 14], [cx + fw - 4, 16], [cx + fw - 2, 21], [cx + fw - 3, 20], [cx, 17], [cx - fw + 3, 20])), c, { rim: 1, hl: 0 }); } },
  bob: { back(s, g, c) { const { cx, fw, chin } = g; s.part(shape(R(cx - fw - 5, 4, cx + fw + 5, chin + 3, 12)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw, chin } = g, r = ramp(c); s.part(shape(E(cx - fw - 3, 1, cx + fw + 3, 45, true), P([cx - fw - 3, 22], [cx - fw - 4, chin], [cx - fw + 2, chin - 5], [cx - fw + 3, 27]), P([cx + fw + 3, 22], [cx + fw + 4, chin], [cx + fw - 2, chin - 5], [cx + fw - 3, 27]), P([cx - fw + 1, 26], [cx - 3, 13], [cx, 12], [cx + 3, 13], [cx + fw - 1, 26], [cx + fw + 2, 16], [cx, 3], [cx - fw - 2, 16])), c); s.run(cx, 3, 9, r.line, 0); for (const [x, y, n, d] of [[cx - 6, 6, 10, -1], [cx + 6, 6, 10, 1], [cx - fw - 1, 30, 14, 0], [cx + fw + 1, 30, 14, 0]]) for (let i = 0; i < n; i++) s.dot(x + d * Math.floor(i / 2), y + i, r.hi); } },
  bangs: { back(s, g, c) { const { cx, fw } = g; s.part(shape(...longBack(cx, fw)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(E(cx - fw - 3, 1, cx + fw + 3, 45, true), P([cx - fw - 3, 22], [cx - fw - 3, 54], [cx - fw + 1, 48], [cx - fw + 2, 26]), P([cx + fw + 3, 22], [cx + fw + 3, 54], [cx + fw - 1, 48], [cx + fw - 2, 26]), R(cx - fw + 1, 12, cx + fw - 1, 24, 3)), c); for (let x = cx - fw + 3; x < cx + fw - 1; x += 4) s.run(x, 15, 9, r.sh, 0); for (const x of [cx - 8, cx + 2, cx + 10]) s.run(x, 6, 8, r.hi, 0); } },
  long: { back(s, g, c) { const { cx, fw } = g; s.part(shape(...longBack(cx, fw)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(...sweep(cx, fw)), c); s.run(cx - 9, 4, 6, r.deep, 1, 2); for (const [x, y, n, d] of [[cx - 4, 6, 11, 1], [cx + 5, 8, 10, 1], [cx + 12, 12, 8, 1], [cx - 13, 8, 9, -1], [cx - fw - 1, 30, 16, 0], [cx + fw + 1, 32, 16, 0]]) for (let i = 0; i < n; i++) s.dot(x + d * Math.floor(i / 2), y + i, r.hi); for (const x of [cx - fw - 4, cx + fw + 4]) s.run(x, 52, 16, r.deep, 0); } },
  wavy: { back(s, g, c) { const { cx, fw } = g, parts = [R(cx - fw - 6, 4, cx + fw + 6, 62, 14)]; for (const y of [44, 56, 68]) parts.push(E(cx - fw - 9, y - 7, cx - fw + 3, y + 7), E(cx + fw - 3, y - 7, cx + fw + 9, y + 7)); s.part(shape(...parts), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(...sweep(cx, fw)), c); for (const [x, y] of [[cx - fw - 2, 34], [cx + fw + 2, 36], [cx - fw - 2, 44], [cx + fw + 2, 46]]) { s.dots([[x, y], [x + 1, y + 1], [x, y + 2], [x - 1, y + 3]], r.hi); } for (const [x, y, n] of [[cx - 4, 6, 10], [cx + 6, 9, 9]]) for (let i = 0; i < n; i++) s.dot(x + Math.round(Math.sin(i / 1.6) * 1.2), y + i, r.hi); } },
  ponytail: { back(s, g, c) { const { cx, fw } = g; s.part(shape(E(cx + fw - 1, 16, cx + fw + 10, 34), P([cx + fw + 2, 28], [cx + fw + 10, 30], [cx + fw + 8, 56], [cx + fw + 3, 50])), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(capShape(cx, fw)), c); for (const [x, y, n] of [[cx - 8, 5, 8], [cx + 1, 4, 8], [cx - 3, 8, 9]]) s.run(x, y, n, r.hi, 1, 3); s.rect(cx + fw, 22, cx + fw + 1, 25, '#E0705A'); } },
  bun: { back(s, g, c) { const { cx } = g; s.part(shape(E(cx - 7, 0, cx + 7, 11)), c, { rim: 3 }); }, front(s, g, c) { const { cx, fw } = g, r = ramp(c); s.part(shape(capShape(cx, fw)), c); s.part(shape(E(cx - 6, 0, cx + 6, 8)), c, { rim: 2 }); s.dots([[cx - 3, 2], [cx - 2, 1], [cx - 1, 1]], r.hi); for (const [x, y, n] of [[cx - 8, 6, 7], [cx + 2, 5, 7]]) s.run(x, y, n, r.hi, 1, 3); } }
};
export const HAIR_IDS = Object.freeze(Object.keys(HAIR));

function drawLegs(s, spec, g, pose) {
  const { cx, leg: lw } = g, o = spec.outfit, skin = spec.appearance.skinColor, onePiece = o.topId === 'dress';
  const bare = onePiece || o.bottomId !== 'trousers';
  for (const side of [0, 1]) {
    const x0 = side ? cx + 1 : cx - lw - 1, lift = pose.step === side + 1 ? 3 : 0, foot = 127 - lift;
    s.part(shape(P([x0, 90], [x0 + lw, 90], [x0 + lw - 1, foot], [x0 + 1, foot])), bare ? skin : o.bottomColor);
    if (!onePiece && o.bottomId === 'shorts') s.part(shape(P([x0 - (side ? 0 : 1), 90], [x0 + lw + (side ? 1 : 0), 90], [x0 + lw + (side ? 1 : 0), 107], [x0 - (side ? 0 : 1), 107])), o.bottomColor);
    const sx0 = side ? x0 : x0 - 2, sx1 = side ? x0 + lw + 2 : x0 + lw - 1, top = 126 - lift, sole = 132 - lift, c = ramp(o.shoeColor);
    if (o.shoeId === 'boots') { s.part(shape(R(x0, top - 10, x0 + lw - 1, sole, 2), R(sx0, top, sx1, sole, 2)), o.shoeColor, { rim: 1 }); s.rect(sx0 + 1, sole, sx1 - 1, sole, c.deep); s.rect(x0 + 2, top - 6, x0 + lw - 3, top - 6, c.hi); }
    else if (o.shoeId === 'loafers') { s.part(shape(R(sx0, top + 2, sx1, sole, 2)), o.shoeColor, { rim: 1 }); s.rect(sx0 + 3, top + 3, sx1 - 3, top + 3, c.hi); }
    else { s.part(shape(R(sx0, top, sx1, sole, 2)), o.shoeColor, { rim: 1 }); s.rect(sx0 + 1, sole, sx1 - 1, sole, blend(o.shoeColor, '#FFFFFF', 0.75)); s.rect(sx0 + 3, top + 2, sx1 - 3, top + 2, c.hi); }
  }
  if (onePiece) { const r = ramp(o.topColor); s.part(shape(P([cx - 10, 88], [cx + 10, 88], [cx + 18, 114], [cx - 18, 114])), o.topColor, { rim: 3 }); for (const x of [cx - 8, cx, cx + 8]) s.run(x, 98, 14, r.sh, 0); }
  else if (o.bottomId === 'skirt') { const r = ramp(o.bottomColor); s.part(shape(P([cx - 10, 90], [cx + 10, 90], [cx + 16, 110], [cx - 16, 110])), o.bottomColor, { rim: 3 }); for (const x of [cx - 6, cx + 5]) s.run(x, 96, 13, r.sh, 0); }
}

function drawArm(s, spec, g, side, state) {
  const { cx, sw } = g, o = spec.outfit, skin = spec.appearance.skinColor, x0 = side ? cx + sw - 6 : cx - sw - 2, shortSleeve = o.topId === 'shirt' || o.topId === 'dress';
  if (state === 'down') {
    if (shortSleeve) { s.part(shape(R(x0 + 1, 68, x0 + 7, 93, 3)), skin, { rim: 1 }); s.part(shape(R(x0, 56, x0 + 8, 71, 4)), o.topColor); }
    else { s.part(shape(R(x0, 56, x0 + 8, 93, 4)), o.topColor); if (o.topId === 'knit' || o.topId === 'hoodie') s.rect(x0 + 1, 91, x0 + 7, 92, ramp(o.topColor).sh); }
    s.part(shape(R(x0 + 1, 92, x0 + 7, 99, 3)), skin, { rim: 1 });
    return;
  }
  const sgn = side ? 1 : -1, [ax, ay] = state === 'up' ? [13, -20] : [8, -24], sx = x0 + 4, sy = 61, ex = sx + sgn * ax, ey = sy + ay, len = Math.hypot(ax, ay), nx = -ay / len * 4, ny = sgn * ax / len * 4;
  const quad = (t0, t1) => P([sx + sgn * ax * t0 + nx, sy + ay * t0 + ny * sgn], [sx + sgn * ax * t1 + nx, sy + ay * t1 + ny * sgn], [sx + sgn * ax * t1 - nx, sy + ay * t1 - ny * sgn], [sx + sgn * ax * t0 - nx, sy + ay * t0 - ny * sgn]);
  if (shortSleeve) { s.part(shape(quad(0.3, 1)), skin, { rim: 1 }); s.part(shape(quad(0, 0.45), E(sx - 4, sy - 4, sx + 4, sy + 4)), o.topColor); }
  else s.part(shape(quad(0, 1), E(sx - 4, sy - 4, sx + 4, sy + 4)), o.topColor);
  s.part(shape(E(Math.round(ex) - 4, Math.round(ey) - 5, Math.round(ex) + 4, Math.round(ey) + 3)), skin, { rim: 1 });
}

function drawTorso(s, spec, g) {
  const { cx, sw } = g, o = spec.outfit, top = ramp(o.topColor);
  if (o.topId === 'jacket') {
    const shirt = '#F4F1E8', c = ramp(shirt);
    s.part(shape(P([cx - 8, B + 3], [cx + 8, B + 3], [cx + 10, 94], [cx - 10, 94])), shirt, { rim: 1 });
    s.part(shape(P([cx - sw + 2, B + 8], [cx - sw + 7, B + 4], [cx - 6, B + 2], [cx - 1, B + 18], [cx - 2, 95], [cx - sw + 5, 95], [cx - sw + 6, B + 26])), o.topColor, { rim: 1 });
    s.part(shape(P([cx + sw - 2, B + 8], [cx + sw - 7, B + 4], [cx + 6, B + 2], [cx + 1, B + 18], [cx + 2, 95], [cx + sw - 5, 95], [cx + sw - 6, B + 26])), o.topColor, { rim: 3 });
    for (let i = 0; i < 15; i++) s.dots([[cx - 6 + Math.floor(i / 3), B + 4 + i], [cx + 6 - Math.floor(i / 3), B + 4 + i]], top.deep);
    s.dots([[cx - 9, B + 8], [cx - 10, B + 10], [cx + 9, B + 8], [cx + 10, B + 10]], top.hi);
    s.rect(cx - sw + 7, B + 30, cx - sw + 12, B + 30, top.deep); s.rect(cx + sw - 12, B + 30, cx + sw - 7, B + 30, top.deep);
    s.dots([[cx - 6, B + 3], [cx - 5, B + 4], [cx - 4, B + 5], [cx - 3, B + 6], [cx + 5, B + 3], [cx + 4, B + 4], [cx + 3, B + 5], [cx + 2, B + 6]], c.deep);
    return;
  }
  const hem = o.topId === 'dress' ? 90 : 95;
  s.part(shape(P([cx - sw + 2, B + 8], [cx - sw + 7, B + 4], [cx - 6, B + 2], [cx + 6, B + 2], [cx + sw - 7, B + 4], [cx + sw - 2, B + 8], [cx + sw - 6, B + 26], [cx + sw - 5, hem], [cx - sw + 5, hem], [cx - sw + 6, B + 26])), o.topColor, { rim: 3 });
  const skin = ramp(spec.appearance.skinColor);
  if (o.topId === 'shirt' || o.topId === 'dress') { for (let i = 0; i < 4; i++) s.rect(cx - 5 + i, B + 3 + i, cx + 5 - i, B + 3 + i, i ? skin.base : skin.sh); for (let i = 0; i < 5; i++) s.dots([[cx - 6 + i, B + 3 + i], [cx + 6 - i, B + 3 + i]], top.deep); }
  if (o.topId === 'dress') s.rect(cx - sw + 6, 88, cx + sw - 6, 89, top.deep);
  if (o.topId === 'knit') { s.rect(cx - 6, B + 3, cx + 6, B + 4, top.deep); s.rect(cx - 5, B + 5, cx + 5, B + 5, top.sh); s.rect(cx - sw + 6, 92, cx + sw - 6, 92, top.deep); for (let x = cx - sw + 7; x < cx + sw - 6; x += 2) s.dot(x, 94, top.deep); for (let y = B + 12; y < 90; y += 5) for (let x = cx - sw + 9 + (y % 2 ? 2 : 0); x < cx + sw - 9; x += 4) s.dot(x, y, top.sh); }
  if (o.topId === 'hoodie') { s.rect(cx - 6, B + 3, cx + 6, B + 5, top.deep); for (let i = 0; i < 4; i++) s.dots([[cx - 5 + i, B + 5 + i], [cx + 5 - i, B + 5 + i]], top.deep); s.run(cx - 3, B + 9, 9, top.hi, 0); s.run(cx + 3, B + 9, 9, top.hi, 0); s.part(shape(P([cx - 9, B + 28], [cx + 9, B + 28], [cx + 11, B + 38], [cx - 11, B + 38])), o.topColor, { rim: 1, hl: 0 }); s.rect(cx - sw + 6, 93, cx + sw - 6, 93, top.deep); }
  s.dots([[cx - 9, B + 8], [cx - 10, B + 10]], top.hi);
}

function drawFace(s, spec, g, pose, head) {
  const { cx, fw, chin, gap } = g, a = spec.appearance, skin = ramp(a.skinColor), hair = ramp(a.hairColor), eh = EYES[a.eyeId] || 3, lx = cx - gap, rx = cx + gap, iris = a.eyeColor || '#6B4226';
  const beard = a.facialHairId;
  if (beard === 'stubble' || beard === 'beard') {
    const c = beard === 'beard' ? hair.base : blend(skin.sh, '#3C3C3C', 0.3);
    for (let y = 38; y <= chin; y++) for (let x = cx - fw; x <= cx + fw; x++) { const band = Math.abs(x - cx) > fw - 6 - (y - 38) * 0.4 || y >= chin - 4 || ((y === 41 || y === 42) && Math.abs(x - cx) <= 5); if (head[y * W + x] && band && (beard === 'beard' || (x + y) % 2 === 0) && !(Math.abs(x - cx) <= 5 && y >= 43 && y <= 46)) s.dot(x, y, beard === 'beard' && (x + y) % 5 === 0 ? hair.sh : c); }
  }
  if (beard === 'mustache' || beard === 'goatee') { s.rect(cx - 5, 41, cx + 5, 42, hair.base); s.dots([[cx - 6, 42], [cx + 6, 42], [cx - 6, 43], [cx + 6, 43]], hair.base); s.rect(cx - 1, 41, cx, 41, hair.sh); }
  if (beard === 'goatee') for (let y = 47; y <= chin; y++) for (let x = cx - 4; x <= cx + 4; x++) if (head[y * W + x]) s.dot(x, y, (x + y) % 4 === 0 ? hair.sh : hair.base);
  for (const ex of [lx, rx]) {
    if (pose.blink) { s.rect(ex - 2, EY + 1, ex + 2, EY + 1, hair.line); s.dot(ex > cx ? ex + 3 : ex - 3, EY, hair.line); continue; }
    s.rect(ex - 2, EY, ex + 2, EY + eh - 1, '#FDFBF6'); s.rect(ex - 1, EY, ex + 1, EY + eh - 1, iris); s.rect(ex, EY + (eh > 2 ? 1 : 0), ex, EY + eh - 1, '#1C1210'); s.dot(ex - 1, EY, '#FFFFFF');
    s.rect(ex - 2, EY - 1, ex + 2, EY - 1, hair.line); s.dot(ex > cx ? ex + 3 : ex - 3, EY, hair.line);
    if (a.eyeId === 'lashes') s.dots(ex > cx ? [[ex + 3, EY - 1], [ex + 4, EY - 2]] : [[ex - 3, EY - 1], [ex - 4, EY - 2]], hair.line);
    s.rect(ex - 1, EY + eh, ex + 1, EY + eh, skin.sh);
  }
  const [thick, arch] = BROWS[a.browId] || BROWS.soft;
  for (let t = 0; t < thick; t++) arch.forEach((dy, k) => s.dots([[lx - 3 + k, EY - 5 + dy - t], [rx + 2 - k, EY - 5 + dy - t]], hair.deep));
  const nw = NOSES[a.noseId] || 1;
  s.dots(a.noseId === 'small' ? [[cx, 37], [cx, 38]] : [[cx, 36], [cx, 37], [cx, 38]], skin.sh); s.rect(cx - nw, 39, cx + nw - 1, 39, skin.sh); s.dot(cx + nw, 39, skin.deep);
  const lip = toward(shift(skin.sh, -0.12, 0.12), 0, 0.5), dk = shift(lip, -0.14), mw = MOUTHS[a.mouthId] || 4;
  s.rect(cx - mw, 44, cx + mw, 44, dk); if (a.mouthId !== 'neutral') s.dots([[cx - mw - 1, 43], [cx + mw + 1, 43]], dk);
  if (mw > 2) { s.rect(cx - mw + 2, 45, cx + mw - 2, 45, lip); s.dot(cx - 1, 45, shift(lip, 0.2)); }
  const blush = toward(shift(a.skinColor, 0, 0.10), 0.97, 0.5);
  s.rect(cx - fw + 3, 38, cx - fw + 6, 39, blush); s.rect(cx + fw - 6, 38, cx + fw - 3, 39, blush);
  return { lx, rx, eh };
}

function drawHeadwear(s, spec, g) {
  const { cx, fw } = g, a = spec.appearance, c = a.headwearColor, r = ramp(c);
  if (a.headwearId === 'cap') { s.part(shape(P([cx - fw - 2, 22], [cx - fw - 1, 10], [cx - 8, 3], [cx + 8, 3], [cx + fw + 1, 10], [cx + fw + 2, 22])), c); s.part(shape(R(cx - fw - 3, 20, cx + fw + 9, 24, 2)), shift(c, -0.1), { rim: 1 }); s.rect(cx - 1, 2, cx + 1, 3, r.deep); for (const x of [cx - 7, cx + 7]) s.run(x, 6, 12, r.sh, 0); }
  if (a.headwearId === 'beanie') { s.part(shape(E(cx - fw - 3, 0, cx + fw + 3, 40, true)), c, { rim: 3 }); s.part(shape(R(cx - fw - 3, 16, cx + fw + 3, 24, 2)), c, { rim: 1 }); for (let x = cx - fw - 1; x < cx + fw + 3; x += 3) s.run(x, 17, 7, r.sh, 0); s.part(shape(E(cx - 3, -3, cx + 3, 3)), c, { rim: 1 }); }
}

// Builds the whole figure. Returns colour cells in row order, null where empty.
export function buildFigureCells(spec, pose = {}) {
  const s = createSprite(), g = figureGeometry(spec.appearance), { cx, fw, cw, chin } = g, a = spec.appearance, o = spec.outfit, skin = ramp(a.skinColor);
  const scarf = a.headwearId === 'headscarf', hair = scarf ? null : HAIR[a.hairId] || HAIR.short;
  if (scarf) s.part(shape(R(cx - fw - 5, 3, cx + fw + 5, chin + 12, 14)), a.headwearColor, { rim: 3 });
  hair?.back?.(s, g, a.hairColor);
  if (o.topId === 'hoodie' && !scarf) s.part(shape(R(cx - 14, B - 8, cx + 14, B + 10, 7)), shift(o.topColor, -0.08), { rim: 2 });
  drawLegs(s, spec, g, pose);
  for (const side of [0, 1]) if ((side ? pose.armR : pose.armL || 'down') === 'down' || !(side ? pose.armR : pose.armL)) drawArm(s, spec, g, side, 'down');
  s.part(shape(R(cx - 6, chin - 5, cx + 5, B + 7)), a.skinColor, { rim: 1, hl: 0 });
  s.rect(cx - 6, chin - 2, cx + 5, chin + 1, skin.deep); s.rect(cx - 6, chin + 2, cx + 5, chin + 2, skin.sh);
  drawTorso(s, spec, g);
  for (const ex of [cx - fw - 2, cx + fw - 1]) s.part(shape(E(ex, 28, ex + 3, 37)), a.skinColor, { rim: 1 });
  const headShape = shape(E(cx - fw, 6, cx + fw, 46), P([cx - fw, 28], [cx + fw, 28], [cx + fw - 1, 38], [cx + cw + 3, chin - 5], [cx + cw - 1, chin], [cx - cw + 1, chin], [cx - cw - 3, chin - 5], [cx - fw + 1, 38]));
  const lit = shape(E(cx - fw - 5, 0, cx + fw - 3, chin + 2)), form = mask(); for (let i = 0; i < N; i++) form[i] = headShape[i] && !lit[i] ? 1 : 0;
  s.part(headShape, a.skinColor, { form, rim: 1, hl: 0 });
  const face = drawFace(s, spec, g, pose, headShape);
  hair?.front?.(s, g, a.hairColor);
  if (scarf) { const c = a.headwearColor, r = ramp(c); s.part(shape(E(cx - fw - 3, 1, cx + fw + 3, 45, true), P([cx - fw - 3, 22], [cx - fw - 4, chin + 2], [cx - fw + 2, chin - 6], [cx - fw + 3, 24]), P([cx + fw + 3, 22], [cx + fw + 4, chin + 2], [cx + fw - 2, chin - 6], [cx + fw - 3, 24]), P([cx - fw + 2, 24], [cx - fw + 6, 15], [cx, 12], [cx + fw - 6, 15], [cx + fw - 2, 24], [cx + fw + 2, 14], [cx, 2], [cx - fw - 2, 14]), P([cx - fw, chin - 7], [cx - cw - 1, chin + 1], [cx + cw + 1, chin + 1], [cx + fw, chin - 7], [cx + fw + 3, chin + 9], [cx - fw - 3, chin + 9])), c); for (const [x, y, n] of [[cx - 6, 5, 8], [cx + 5, 6, 8]]) s.run(x, y, n, r.hi, 0); s.run(cx - 4, chin + 3, 9, r.sh, 1, 3); }
  drawHeadwear(s, spec, g);
  if (a.glasses) {
    const c = '#3A3A40', { lx, rx, eh } = face;
    for (const ex of [lx, rx]) { for (let x = ex - 3; x <= ex + 3; x++) s.dots([[x, EY - 2], [x, EY + eh + 1]], c); for (let y = EY - 1; y <= EY + eh; y++) s.dots([[ex - 4, y], [ex + 4, y]], c); s.dot(ex + 2, EY - 1, '#FFFFFF'); }
    s.rect(lx + 5, EY, rx - 5, EY, c); s.rect(cx - fw, EY, lx - 5, EY, c); s.rect(rx + 5, EY, cx + fw, EY, c);
  }
  for (const side of [0, 1]) { const state = side ? pose.armR : pose.armL; if (state && state !== 'down') drawArm(s, spec, g, side, state); }
  return s.out(pose.dx || 0, pose.dy || 0);
}
