// First-party pixel scenery for the three reveals, drawn on a 92 x 86 logical
// canvas. Props are scenery only; they are never claims about owned clothes.
// buildScenePlan returns { back, front }: rectangles behind and in front of the
// character. `frame` is null for the static card and 0..n during the reveal.
export const SCENE_W = 92, SCENE_H = 86, FLOOR_Y = 62;
export const AVATAR_X = 14, AVATAR_Y = 5;

function painter() {
  const rects = [];
  const r = (x, y, w, h, color) => {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(SCENE_W, Math.round(x + w)), y1 = Math.min(SCENE_H, Math.round(y + h));
    if (x1 > x0 && y1 > y0) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, color });
  };
  // Draws a small sprite from rows of characters using a colour key.
  const sprite = (x, y, rows, key) => rows.forEach((row, j) => [...row].forEach((ch, i) => { if (key[ch]) r(x + i, y + j, 1, 1, key[ch]); }));
  const blob = (cx, cy, rx, ry, color) => { for (let y = -ry; y <= ry; y++) { const half = Math.round(rx * Math.sqrt(1 - (y * y) / ((ry + 0.5) * (ry + 0.5)))); r(cx - half, cy + y, half * 2 + 1, 1, color); } };
  return { rects, r, sprite, blob };
}

const shadow = (p, color) => { p.r(24, 80, 44, 1, color); p.r(20, 81, 52, 2, color); p.r(24, 83, 44, 1, color); };
const star = (p, x, y, color, big) => { p.r(x, y, 1, 1, color); if (big) { p.r(x - 1, y, 3, 1, color); p.r(x, y - 1, 1, 3, color); } };

function coffeeBreak(frame) {
  const b = painter(), f = painter(), t = frame ?? 5;
  b.r(0, 0, 92, 48, '#F6E7CC'); b.r(0, 48, 92, 14, '#EBD3AC'); b.r(0, 48, 92, 1, '#D9BC8E');
  for (let x = 5; x < 92; x += 11) b.r(x, 50, 1, 11, '#DFC599');
  b.r(0, 62, 92, 24, '#C2915F'); b.r(0, 62, 92, 1, '#8F6238');
  for (let y = 68; y < 86; y += 6) { b.r(0, y, 92, 1, '#A97A4C'); for (let x = (y % 12 ? 9 : 27); x < 92; x += 36) b.r(x, y - 5, 1, 5, '#A97A4C'); }
  // Window with a slice of sky
  b.r(5, 7, 28, 30, '#7A5238'); b.r(7, 9, 24, 26, '#BFE6F2'); b.r(7, 27, 24, 8, '#D8F0F5');
  b.r(22, 12, 5, 5, '#FFE08A'); b.r(9, 18, 9, 3, '#FFFFFF'); b.r(11, 16, 5, 2, '#FFFFFF'); b.r(20, 26, 8, 2, '#FFFFFF');
  b.r(18, 9, 2, 26, '#7A5238'); b.r(7, 21, 24, 2, '#7A5238'); b.r(3, 37, 32, 2, '#8F6238');
  // Pendant lamp
  b.r(74, 0, 1, 9, '#5B4636'); b.r(69, 9, 11, 2, '#E0705A'); b.r(67, 11, 15, 3, '#E0705A'); b.r(67, 13, 15, 1, '#B4533C'); b.r(72, 14, 5, 2, '#FFE9A8');
  // Shelf with mugs and a trailing plant
  b.r(60, 30, 30, 2, '#8F6238'); b.r(62, 32, 2, 3, '#7A5238'); b.r(86, 32, 2, 3, '#7A5238');
  b.r(63, 25, 5, 5, '#FAFAF5'); b.r(68, 26, 1, 3, '#FAFAF5'); b.r(71, 24, 5, 6, '#8FB8DE'); b.r(79, 26, 7, 4, '#B4533C');
  b.r(80, 21, 2, 5, '#4E8A5B'); b.r(83, 22, 2, 4, '#62A06D'); b.r(86, 24, 2, 9, '#4E8A5B'); b.r(88, 28, 1, 8, '#62A06D');
  // Menu board
  b.r(40, 10, 18, 22, '#3A3A40'); b.r(41, 11, 16, 20, '#2F3E36'); b.r(43, 14, 9, 1, '#FAFAF5'); b.r(43, 18, 12, 1, '#C9D8CC'); b.r(43, 21, 7, 1, '#C9D8CC'); b.r(43, 24, 10, 1, '#C9D8CC'); b.r(52, 26, 3, 3, '#E0B84C');
  // Floor plant
  b.r(3, 70, 10, 11, '#E0705A'); b.r(2, 69, 12, 2, '#B4533C'); b.r(4, 80, 8, 1, '#B4533C');
  b.blob(8, 60, 6, 5, '#4E8A5B'); b.blob(4, 55, 3, 4, '#62A06D'); b.blob(12, 53, 3, 5, '#3F7550'); b.r(7, 62, 2, 8, '#3F7550');
  // Rug and soft shadow
  b.r(18, 77, 56, 8, '#6E9A78'); b.r(15, 79, 62, 4, '#6E9A78'); b.r(18, 78, 56, 1, '#EDE9D9'); b.r(18, 83, 56, 1, '#EDE9D9');
  shadow(b, '#577D62');
  // Café table, cup and saucer sit in front of the character
  f.r(66, 59, 26, 3, '#7A5238'); f.r(66, 59, 26, 1, '#9A6A45'); f.r(78, 62, 3, 19, '#5B3E2B'); f.r(72, 81, 15, 2, '#5B3E2B');
  f.r(72, 58, 12, 1, '#FAFAF5'); f.r(74, 51, 8, 7, '#FAFAF5'); f.r(74, 51, 8, 1, '#6A452E'); f.r(82, 53, 2, 1, '#FAFAF5'); f.r(83, 53, 1, 4, '#FAFAF5'); f.r(82, 56, 2, 1, '#FAFAF5'); f.r(80, 52, 2, 6, '#DCD8CC');
  f.r(86, 54, 4, 5, '#E0B84C'); f.r(86, 53, 4, 1, '#F3D98A');
  // Steam drifts upward during the reveal
  const steam = '#FFFFFF';
  for (let i = 0; i < 3; i++) { const y = 48 - ((t + i * 3) % 9), x = 76 + i * 2 + ((t + i) % 4 < 2 ? 0 : 1); if (y > 38) { f.r(x, y, 1, 2, steam); if (y < 46) f.r(x + (i % 2 ? -1 : 1), y - 2, 1, 1, steam); } }
  return { back: b.rects, front: f.rects };
}

function campusWalk(frame) {
  const b = painter(), f = painter(), t = frame ?? 6;
  b.r(0, 0, 92, 22, '#8FCBEA'); b.r(0, 22, 92, 20, '#AEDBF0'); b.r(0, 42, 92, 20, '#CFEAF4');
  // Sun
  b.r(73, 6, 8, 10, '#FFE08A'); b.r(72, 7, 10, 8, '#FFE08A'); b.r(75, 8, 3, 2, '#FFF3C4');
  for (const [x, y] of [[76, 2], [76, 18], [68, 10], [85, 10]]) b.r(x, y, 2, 2, '#FFE9A8');
  // Clouds drift a few pixels
  const drift = Math.floor(t / 3);
  for (const [x, y, w] of [[44 + drift, 9, 14], [6 + drift, 4, 11]]) { b.r(x, y + 2, w, 3, '#FFFFFF'); b.r(x + 2, y, w - 6, 2, '#FFFFFF'); b.r(x + 1, y + 5, w - 2, 1, '#E6F3F8'); }
  // Far hills
  b.blob(20, 62, 30, 9, '#A9D3A0'); b.blob(74, 63, 26, 7, '#B8DDAB');
  // Lecture hall and clock tower
  b.r(2, 30, 40, 32, '#CF8262'); b.r(2, 30, 40, 2, '#8D4E3A'); b.r(0, 28, 44, 2, '#A45F45'); b.r(38, 32, 4, 30, '#B46C50');
  for (let y = 35; y < 54; y += 8) for (let x = 5; x < 36; x += 8) { b.r(x, y, 5, 5, '#F7E9B0'); b.r(x, y, 5, 1, '#8D4E3A'); b.r(x + 2, y, 1, 5, '#D9B981'); }
  b.r(15, 53, 8, 9, '#6A452E'); b.r(14, 52, 10, 1, '#8D4E3A'); b.r(21, 57, 1, 1, '#E0B84C');
  b.r(13, 10, 12, 18, '#DB9374'); b.r(22, 10, 3, 18, '#B46C50'); b.r(11, 8, 16, 2, '#8D4E3A'); b.r(15, 4, 8, 4, '#8D4E3A'); b.r(17, 1, 4, 3, '#8D4E3A');
  b.r(15, 13, 7, 7, '#FFFDF6'); b.r(18, 14, 1, 3, '#3A3A40'); b.r(18, 16, 3, 1, '#3A3A40'); b.r(16, 23, 2, 5, '#F7E9B0'); b.r(20, 23, 2, 5, '#F7E9B0');
  b.r(19, -3, 1, 4, '#5B4636'); b.r(20, 0, 5, 3, '#E0705A');
  // Trees
  b.r(79, 44, 3, 18, '#7A5238'); b.blob(80, 36, 12, 10, '#5E9E6A'); b.blob(75, 32, 6, 5, '#74B57E'); b.blob(86, 40, 5, 4, '#4A8558'); b.r(74, 30, 3, 1, '#9AD0A0');
  b.r(52, 50, 2, 12, '#7A5238'); b.blob(53, 46, 6, 6, '#74B57E'); b.blob(51, 44, 3, 2, '#9AD0A0');
  // Lawn and path
  b.r(0, 62, 92, 24, '#8CC27A'); b.r(0, 62, 92, 1, '#6FA561');
  for (let y = 66; y < 86; y++) { const half = 14 + (y - 66) * 1.6; b.r(46 - half, y, half * 2, 1, '#EBDCB0'); b.r(46 - half, y, 1, 1, '#CDBB8A'); b.r(46 + half - 1, y, 1, 1, '#CDBB8A'); }
  for (const [x, y, c] of [[4, 68, '#FFFFFF'], [9, 76, '#EFA5B8'], [86, 70, '#FFFFFF'], [82, 79, '#E0B84C'], [14, 83, '#E0B84C'], [89, 84, '#EFA5B8']]) { b.r(x, y, 2, 2, c); b.r(x, y + 2, 1, 2, '#4A8558'); }
  for (const [x, y] of [[36, 70], [57, 73], [41, 79], [62, 82]]) b.r(x, y, 3, 1, '#D9C795');
  shadow(b, '#CDBB8A');
  // Signpost in front
  f.r(6, 58, 2, 26, '#7A5238'); f.r(0, 52, 15, 7, '#FFFDF6'); f.r(0, 52, 15, 1, '#3A3A40'); f.r(0, 58, 15, 1, '#3A3A40'); f.r(14, 52, 1, 7, '#3A3A40');
  f.r(2, 55, 7, 1, '#2F5D46'); f.r(9, 54, 1, 3, '#2F5D46'); f.r(10, 55, 1, 1, '#2F5D46');
  // Leaves tumble through the reveal
  for (const [x, y, c, s] of [[60, 20, '#E0705A', 2], [70, 34, '#E0B84C', 3], [33, 12, '#E0B84C', 2], [84, 50, '#E0705A', 3], [48, 40, '#F0A04B', 2]]) {
    const yy = (y + t * s) % 78, xx = x - Math.floor(t * 0.7) + ((t + x) % 4 < 2 ? 0 : 1);
    f.r(xx, yy, 2, 1, c); f.r(xx + 1, yy + 1, 1, 1, c);
  }
  return { back: b.rects, front: f.rects };
}

function afterTalks(frame) {
  const b = painter(), f = painter(), t = frame ?? 3;
  b.r(0, 0, 92, 18, '#262553'); b.r(0, 18, 92, 16, '#3A2F6B'); b.r(0, 34, 92, 14, '#5A3F82'); b.r(0, 48, 92, 14, '#8A5590');
  b.r(64, 5, 7, 9, '#FFF3C4'); b.r(63, 6, 9, 7, '#FFF3C4'); b.r(66, 5, 5, 4, '#262553'); b.r(67, 9, 2, 1, '#262553');
  const stars = [[6, 6], [18, 14], [30, 5], [44, 11], [56, 20], [80, 8], [86, 22], [12, 26], [36, 22], [74, 28], [50, 3]];
  stars.forEach(([x, y], i) => star(b, x, y, (t + i) % 5 === 0 ? '#FFFFFF' : '#C9C3F0', (t + i) % 5 === 0 || i % 4 === 0));
  // Skyline
  for (const [x, w, h] of [[0, 12, 20], [12, 9, 13], [21, 14, 24], [35, 8, 10], [43, 12, 17], [55, 10, 12], [65, 13, 22], [78, 14, 15]]) {
    b.r(x, 62 - h, w, h, '#2B2550');
    for (let y = 64 - h; y < 59; y += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if ((xx * 7 + y * 3) % 5 < 2) b.r(xx, y, 1, 2, '#F3D98A');
  }
  // String lights
  for (let x = 0; x < 92; x++) { const y = 3 + Math.round(5 * Math.sin((x / 91) * Math.PI)); b.r(x, y, 1, 1, '#1C1A3A'); if (x % 8 === 4) { const on = (Math.floor(x / 8) + Math.floor(t / 2)) % 2 === 0; const c = ['#E0705A', '#E0B84C', '#8FB8DE', '#EFA5B8'][Math.floor(x / 8) % 4]; b.r(x - 1, y + 1, 3, 3, on ? c : '#6B5A8E'); if (on) b.r(x, y + 1, 1, 1, '#FFFFFF'); } }
  // Plaza
  b.r(0, 62, 92, 24, '#4A4468'); b.r(0, 62, 92, 1, '#2B2550');
  for (let y = 68; y < 86; y += 6) b.r(0, y, 92, 1, '#5A5480');
  for (let x = 10; x < 92; x += 16) b.r(x, 63, 1, 23, '#5A5480');
  // Projector screen with the last slide
  b.r(3, 30, 26, 22, '#3A3A40'); b.r(4, 31, 24, 20, '#FFFDF6'); b.r(15, 52, 2, 14, '#3A3A40'); b.r(10, 66, 12, 1, '#3A3A40');
  b.r(7, 34, 12, 1, '#2F5D46'); b.r(7, 45, 3, 4, '#8FB8DE'); b.r(11, 42, 3, 7, '#E0B84C'); b.r(15, 39, 3, 10, '#E0705A'); b.r(19, 36, 3, 13, '#627F62'); b.r(6, 49, 18, 1, '#3A3A40');
  b.r(24, 34, 1, 1, '#2F5D46'); b.r(25, 35, 1, 1, '#2F5D46'); b.r(23, 35, 1, 1, '#2F5D46');
  shadow(b, '#37325A');
  // Snack table in front
  f.r(64, 60, 28, 3, '#FFFDF6'); f.r(64, 63, 28, 9, '#F1ECDD'); f.r(64, 71, 28, 1, '#E0705A'); for (let x = 65; x < 92; x += 4) f.r(x, 72, 2, 1, '#E0705A');
  f.r(68, 72, 2, 12, '#2B2550'); f.r(87, 72, 2, 12, '#2B2550');
  f.sprite(67, 50, ['..r..', '.ppp.', 'ppwpp', 'ppppp', '.ccc.', '.ccc.', '.ccc.', '.....', '.....', '.....'], { r: '#E0705A', p: '#EFA5B8', w: '#FFFFFF', c: '#B9895A' });
  f.sprite(75, 53, ['.ggg.', 'ggggg', 'ggwgg', '.ddd.', '.ddd.', '.ddd.', '.ddd.'], { g: '#E0B84C', w: '#FFF3C4', d: '#8A5A34' });
  f.r(83, 54, 5, 6, '#8FB8DE'); f.r(83, 54, 5, 1, '#FFFFFF'); f.r(86, 49, 1, 6, '#E0705A');
  // Pixel stars burst around the character
  const ring = [[10, 20], [78, 16], [6, 46], [84, 44], [22, 8], [68, 6], [46, 2], [14, 70], [58, 74]];
  ring.forEach(([x, y], i) => {
    const phase = frame === null ? (i % 3 === 0 ? 2 : 1) : (frame + i * 2) % 6;
    if (phase === 0) return;
    const c = ['#FFE08A', '#FFFFFF', '#EFA5B8', '#8FB8DE'][i % 4];
    star(f, x, y - (frame === null ? 0 : Math.min(frame, 6) % 3), c, phase >= 2);
    if (phase >= 4) { f.r(x - 2, y - 2, 1, 1, c); f.r(x + 2, y + 2, 1, 1, c); f.r(x + 2, y - 2, 1, 1, c); f.r(x - 2, y + 2, 1, 1, c); }
  });
  return { back: b.rects, front: f.rects };
}

const builders = { 'coffee-break': coffeeBreak, 'campus-walk': campusWalk, 'after-talks': afterTalks };

export function buildScenePlan(sceneId, frame = null) {
  const build = Object.hasOwn(builders, sceneId) ? builders[sceneId] : null;
  if (!build) throw new Error('Unknown scene');
  return build(frame);
}
