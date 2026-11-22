// Pixel character renderer for "cq-pixel-v1".
// buildAvatarDrawPlan turns a validated specification into a list of solid
// rectangles on a 64 x 80 logical canvas. It has no DOM dependency, so the same
// plan drives the editor preview, the reveal animation and the saved PNG.
import { manifest as defaultManifest, lookup } from './manifest.js';

export const SPRITE_W = 64, SPRITE_H = 80;
export const OUTLINE = '#2B2A33';
const EYE = '#2B2A33', INNER_SHIRT = '#F3EEDF';

const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const parse = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (hex, other, amount) => { const a = parse(hex), b = parse(other); return toHex(a.map((v, i) => v + (b[i] - v) * amount)); };
export const darken = (hex, amount = 0.22) => mix(hex, '#141220', amount);
export const lighten = (hex, amount = 0.25) => mix(hex, '#FFFFFF', amount);
export const luminance = hex => { const [r, g, b] = parse(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

export const REST_POSE = Object.freeze({ dx: 0, dy: 0, armL: 'down', armR: 'down', step: 0, blink: false });

function createGrid() {
  const cells = new Array(SPRITE_W * SPRITE_H).fill(null);
  let ox = 0, oy = 0;
  const set = (x, y, color) => { x += ox; y += oy; if (x >= 0 && y >= 0 && x < SPRITE_W && y < SPRITE_H) cells[y * SPRITE_W + x] = color; };
  return {
    cells,
    offset(x, y) { ox = x; oy = y; },
    // Inclusive box: columns x0..x1 and rows y0..y1.
    box(x0, y0, x1, y1, color) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, color); },
    dot: set,
    clear(x, y) { set(x, y, null); }
  };
}

function drawLegs(g, spec, skin, pose) {
  const { bottomId, bottomColor, shoeId, shoeColor, topId } = spec.outfit;
  const onePiece = Boolean(lookup('tops', topId)?.onePiece);
  const skinShade = darken(skin, 0.16), cloth = bottomColor, clothShade = darken(cloth, 0.2);
  const bareLegs = onePiece || bottomId === 'skirt';
  for (const side of [0, 1]) {
    const lift = (pose.step === 1 && side === 0) || (pose.step === 2 && side === 1) ? 2 : 0;
    const x0 = side ? 33 : 23, x1 = side ? 40 : 30, bottom = 71 - lift;
    if (bareLegs) { g.box(x0 + 2, 58, x1 - 2, bottom + 1, skin); g.box(x1 - 2, 58, x1 - 2, bottom + 1, skinShade); }
    else if (bottomId === 'shorts') {
      g.box(x0 + 1, 62, x1 - 1, bottom + 1, skin); g.box(x1 - 1, 62, x1 - 1, bottom + 1, skinShade);
      g.box(x0, 56, x1, 63, cloth); g.box(x1 - 1, 56, x1, 63, clothShade); g.box(x0, 63, x1, 63, clothShade);
    } else { g.box(x0, 56, x1, bottom + 1, cloth); g.box(x1 - 1, 56, x1, bottom + 1, clothShade); }
    // Shoes
    const sole = luminance(shoeColor) > 0.7 ? darken(shoeColor, 0.3) : '#F4F1E8', shade = darken(shoeColor, 0.22), top = 72 - lift;
    const sx0 = side ? 33 : 21, sx1 = side ? 42 : 30;
    if (shoeId === 'boots') {
      g.box(x0, top - 6, x1, top, shoeColor); g.box(x1 - 1, top - 6, x1, top, shade);
      g.box(sx0, top, sx1, top + 3, shoeColor); g.box(sx0, top + 3, sx1, top + 3, darken(shoeColor, 0.4)); g.box(x0, top - 6, x1, top - 6, lighten(shoeColor, 0.18));
    } else if (shoeId === 'loafers') {
      g.box(sx0, top + 1, sx1, top + 3, shoeColor); g.box(sx0, top + 3, sx1, top + 3, darken(shoeColor, 0.4));
      g.box(side ? 37 : 23, top + 1, side ? 40 : 26, top + 1, lighten(shoeColor, 0.3));
    } else {
      g.box(sx0, top, sx1, top + 3, shoeColor); g.box(sx0, top + 3, sx1, top + 3, sole);
      g.box(side ? 35 : 25, top, side ? 38 : 28, top, lighten(shoeColor, 0.35)); g.box(side ? 35 : 25, top + 1, side ? 38 : 28, top + 1, shade);
    }
  }
}

function drawSkirt(g, color, hemRow) {
  const shade = darken(color, 0.2);
  g.box(22, 56, 41, 58, color); g.box(21, 59, 42, 61, color); g.box(20, 62, 43, hemRow, color);
  g.box(40, 56, 41, 58, shade); g.box(41, 59, 42, 61, shade); g.box(42, 62, 43, hemRow, shade);
  g.box(20, hemRow, 43, hemRow, shade);
  for (const x of [26, 32, 37]) g.box(x, 59, x, hemRow - 1, shade);
}

function drawArm(g, side, state, sleeve, skin, longSleeve) {
  const mirror = x => (side ? x : 63 - x), span = (a, b) => [Math.min(mirror(a), mirror(b)), Math.max(mirror(a), mirror(b))];
  const sleeveShade = darken(sleeve, 0.2), skinShade = darken(skin, 0.16);
  if (state === 'down') {
    const [x0, x1] = span(42, 46);
    g.box(x0, 37, x1, 52, longSleeve ? sleeve : skin);
    if (!longSleeve) g.box(x0, 37, x1, 44, sleeve);
    g.box(side ? x1 : x0, 38, side ? x1 : x0, longSleeve ? 52 : 44, sleeveShade);
    if (longSleeve) g.box(x0, 51, x1, 52, sleeveShade);
    g.box(x0, 53, x1, 56, skin); g.box(x0, 56, x1, 56, skinShade);
    return;
  }
  // Raised arm: shoulder block, then a forearm beside the head. 'up2' leans outward for the wave.
  const lean = state === 'up2' ? 2 : 0;
  const [s0, s1] = span(42, 47), [f0, f1] = span(45 + lean, 49 + lean);
  g.box(s0, 36, s1, 40, sleeve);
  g.box(f0, 27, f1, 39, longSleeve ? sleeve : skin);
  if (!longSleeve) g.box(f0, 33, f1, 39, sleeve);
  g.box(side ? f1 : f0, 28, side ? f1 : f0, 39, longSleeve ? sleeveShade : skinShade);
  if (longSleeve) g.box(f0, 27, f1, 28, sleeveShade);
  g.box(f0, 22, f1, 26, skin); g.box(f0, 22, f1, 22, lighten(skin, 0.18));
}

function drawTop(g, spec, skin, pose) {
  const { topId, topColor: c } = spec.outfit, shade = darken(c, 0.2), deep = darken(c, 0.36), light = lighten(c, 0.22);
  const longSleeve = topId === 'knit' || topId === 'hoodie' || topId === 'jacket';
  g.box(22, 36, 41, 55, c); g.box(39, 37, 41, 55, shade); g.box(22, 36, 41, 36, light);
  if (topId === 'dress') { drawSkirt(g, c, 66); g.box(22, 54, 41, 55, shade); g.box(28, 36, 35, 37, skin); g.box(29, 38, 34, 38, skin); }
  if (topId === 'shirt') { g.box(28, 36, 35, 36, skin); g.box(29, 37, 34, 37, skin); g.box(22, 55, 41, 55, shade); }
  if (topId === 'knit') {
    g.box(27, 36, 36, 37, light); g.box(22, 53, 41, 55, shade);
    for (let x = 23; x <= 40; x += 2) g.box(x, 54, x, 55, deep);
    for (let y = 41; y <= 50; y += 3) for (let x = 25 + (y % 2) * 2; x <= 37; x += 4) g.dot(x, y, light);
  }
  if (topId === 'hoodie') {
    g.box(27, 48, 36, 53, shade); g.box(27, 48, 36, 48, deep); g.box(22, 54, 41, 55, shade);
    g.box(29, 37, 29, 43, '#F4F1E8'); g.box(34, 37, 34, 43, '#F4F1E8'); g.box(26, 36, 37, 37, shade);
  }
  if (topId === 'jacket') {
    g.box(29, 36, 34, 55, INNER_SHIRT); g.box(34, 38, 34, 55, darken(INNER_SHIRT, 0.12));
    g.box(27, 36, 28, 44, shade); g.box(35, 36, 36, 44, shade); g.box(28, 45, 28, 55, deep); g.box(35, 45, 35, 55, deep);
    g.box(24, 42, 26, 44, light); g.box(23, 55, 28, 55, shade); g.box(35, 55, 41, 55, shade);
  }
  // A darker seam keeps a lowered arm readable against the body.
  if (pose.armL === 'down') g.box(22, 41, 22, 55, deep);
  if (pose.armR === 'down') g.box(41, 41, 41, 55, deep);
  drawArm(g, 0, pose.armL, c, skin, longSleeve);
  drawArm(g, 1, pose.armR, c, skin, longSleeve);
}

function drawHead(g, spec, pose) {
  const { skinColor: skin, glasses } = spec.appearance, shade = darken(skin, 0.16);
  g.box(29, 34, 34, 36, shade);
  g.box(20, 12, 43, 33, skin);
  for (const [x, y] of [[20, 12], [43, 12], [20, 33], [43, 33], [21, 33], [42, 33], [20, 32], [43, 32]]) g.clear(x, y);
  g.box(41, 14, 42, 31, shade); g.box(22, 32, 41, 32, shade); g.box(23, 33, 40, 33, shade);
  g.box(19, 21, 19, 25, skin); g.box(44, 21, 44, 25, shade);
  // Face
  if (pose.blink) { g.box(26, 24, 27, 24, EYE); g.box(36, 24, 37, 24, EYE); }
  else { g.box(26, 22, 27, 24, EYE); g.box(36, 22, 37, 24, EYE); g.dot(26, 22, '#FFFFFF'); g.dot(36, 22, '#FFFFFF'); }
  const blush = mix(skin, '#E8607A', 0.3);
  g.box(23, 27, 25, 27, blush); g.box(38, 27, 40, 27, blush);
  const mouth = darken(skin, 0.45);
  g.box(30, 29, 33, 29, mouth); g.dot(29, 28, mouth); g.dot(34, 28, mouth);
  return { glasses };
}

function drawGlasses(g) {
  const f = '#2B2A33';
  for (const x of [24, 34]) { g.box(x, 20, x + 5, 20, f); g.box(x, 25, x + 5, 25, f); g.box(x, 20, x, 25, f); g.box(x + 5, 20, x + 5, 25, f); g.dot(x + 1, 21, '#FFFFFF'); }
  g.box(30, 22, 33, 22, f); g.box(20, 22, 23, 22, f); g.box(40, 22, 43, 22, f);
}

function drawHairBack(g, spec) {
  const { hairId, hairColor: h, headwearId } = spec.appearance;
  if (headwearId === 'headscarf') return;
  const shade = darken(h, 0.25);
  if (hairId === 'long') { g.box(17, 12, 46, 46, h); g.box(17, 44, 46, 46, shade); g.box(44, 14, 46, 46, shade); }
  if (hairId === 'curly') { g.box(16, 10, 47, 26, h); for (let y = 11; y <= 25; y += 3) { g.clear(16, y); g.clear(47, y + 1); } }
  if (hairId === 'bob') g.box(18, 12, 45, 32, h);
}

function drawHairFront(g, spec) {
  const { hairId, hairColor: h, headwearId } = spec.appearance;
  if (headwearId === 'headscarf' || hairId === 'none') return;
  const shade = darken(h, 0.25), light = lighten(h, 0.2);
  if (hairId === 'buzz') {
    const stubble = mix(h, spec.appearance.skinColor, 0.25);
    g.box(21, 10, 42, 10, stubble); g.box(20, 11, 43, 15, stubble); g.box(20, 16, 20, 19, stubble); g.box(43, 16, 43, 19, stubble); return;
  }
  // Shared cap of hair across the top of the head.
  g.box(21, 8, 42, 8, h); g.box(20, 9, 43, 9, h); g.box(19, 10, 44, 15, h);
  g.box(19, 16, 21, 20, h); g.box(42, 16, 44, 20, h); g.box(22, 16, 25, 16, h); g.box(38, 16, 41, 16, h);
  g.box(23, 10, 30, 10, light); g.box(41, 11, 44, 15, shade);
  if (hairId === 'bob') { g.box(18, 12, 21, 31, h); g.box(42, 12, 45, 31, h); g.box(44, 14, 45, 31, shade); g.box(18, 31, 21, 31, shade); g.box(42, 31, 45, 31, shade); }
  if (hairId === 'long') { g.box(17, 12, 21, 42, h); g.box(42, 12, 46, 42, h); g.box(45, 14, 46, 42, shade); }
  if (hairId === 'curly') {
    g.box(18, 6, 45, 15, h); g.box(22, 4, 41, 5, h); g.box(16, 10, 20, 24, h); g.box(43, 10, 47, 24, h);
    for (const x of [22, 26, 30, 34, 38]) g.clear(x + 3, 4);
    for (const [x, y] of [[18, 6], [45, 6], [16, 10], [47, 10], [16, 24], [47, 24]]) g.clear(x, y);
    for (const [x, y] of [[22, 8], [28, 7], [34, 9], [40, 8], [19, 14], [44, 18], [25, 12], [37, 12], [18, 20]]) g.dot(x, y, light);
    for (const [x, y] of [[24, 10], [31, 11], [38, 10], [44, 13], [17, 17], [45, 22]]) g.dot(x, y, shade);
  }
  if (hairId === 'bun') { g.box(29, 2, 34, 2, h); g.box(28, 3, 35, 7, h); g.box(34, 3, 35, 7, shade); g.box(29, 3, 31, 3, light); }
}

function drawHeadwear(g, spec) {
  const { headwearId, headwearColor: c } = spec.appearance, shade = darken(c, 0.22), light = lighten(c, 0.22);
  if (headwearId === 'cap') {
    g.box(22, 6, 41, 6, c); g.box(20, 7, 43, 8, c); g.box(19, 9, 44, 13, c); g.box(40, 8, 44, 13, shade);
    g.box(19, 14, 50, 15, shade); g.box(19, 14, 44, 14, c); g.box(31, 5, 32, 5, shade); g.box(22, 8, 28, 8, light);
  }
  if (headwearId === 'beanie') {
    g.box(23, 4, 40, 4, c); g.box(21, 5, 42, 6, c); g.box(19, 7, 44, 12, c); g.box(40, 6, 44, 12, shade);
    g.box(18, 13, 45, 16, light); for (let x = 19; x <= 44; x += 3) g.box(x, 13, x, 16, c);
    g.box(30, 1, 33, 3, light); g.box(33, 2, 33, 3, c);
  }
  if (headwearId === 'headscarf') {
    g.box(21, 7, 42, 7, c); g.box(19, 8, 44, 9, c); g.box(17, 10, 46, 14, c);
    g.box(17, 15, 21, 34, c); g.box(42, 15, 46, 34, c); g.box(22, 15, 23, 16, c); g.box(40, 15, 41, 16, c);
    g.box(22, 32, 41, 34, c); g.box(22, 31, 24, 31, c); g.box(39, 31, 41, 31, c);
    g.box(19, 35, 44, 39, c); g.box(22, 40, 41, 41, c);
    g.box(44, 11, 46, 34, shade); g.box(41, 35, 44, 39, shade); g.box(22, 41, 41, 41, shade); g.box(22, 9, 30, 9, light);
  }
}

function addOutline(cells) {
  const marks = [];
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
    if (cells[y * SPRITE_W + x]) continue;
    const near = (x > 0 && cells[y * SPRITE_W + x - 1]) || (x < SPRITE_W - 1 && cells[y * SPRITE_W + x + 1]) || (y > 0 && cells[(y - 1) * SPRITE_W + x]) || (y < SPRITE_H - 1 && cells[(y + 1) * SPRITE_W + x]);
    if (near) marks.push(y * SPRITE_W + x);
  }
  for (const i of marks) cells[i] = OUTLINE;
}

function toRects(cells) {
  const rects = [];
  for (let y = 0; y < SPRITE_H; y++) {
    let x = 0;
    while (x < SPRITE_W) {
      const color = cells[y * SPRITE_W + x];
      if (!color) { x++; continue; }
      let end = x;
      while (end + 1 < SPRITE_W && cells[y * SPRITE_W + end + 1] === color) end++;
      rects.push({ x, y, w: end - x + 1, h: 1, color });
      x = end + 1;
    }
  }
  return rects;
}

// Poses for the three short reveals. `frame` is null for the static hero pose
// that is used for the saved card and for reduced motion.
export function poseForScene(reveal, frame) {
  if (reveal === 'wave') {
    if (frame === null) return { ...REST_POSE, armR: 'up2' };
    return { ...REST_POSE, armR: frame % 4 < 2 ? 'up' : 'up2', dy: frame % 8 === 0 ? -1 : 0, blink: frame % 12 === 9 };
  }
  if (reveal === 'shuffle') {
    if (frame === null) return { ...REST_POSE, step: 1, dx: -1 };
    const beat = Math.floor(frame / 2) % 4;
    return { ...REST_POSE, step: beat === 0 ? 1 : beat === 2 ? 2 : 0, dx: beat === 0 ? -2 : beat === 2 ? 2 : 0, dy: beat % 2 ? 0 : -1, blink: frame % 12 === 7 };
  }
  if (reveal === 'bounce') {
    if (frame === null) return { ...REST_POSE, armL: 'up2', armR: 'up2', dy: -2 };
    const cycle = [0, -2, -4, -5, -4, -2, 0, 1][frame % 8];
    return { ...REST_POSE, dy: Math.min(cycle, 0), armL: cycle < -1 ? 'up2' : 'down', armR: cycle < -1 ? 'up2' : 'down', blink: cycle > 0 };
  }
  return { ...REST_POSE };
}

export function buildAvatarDrawPlan(spec, pose = REST_POSE, manifest = defaultManifest) {
  if (!spec || spec.rendererVersion !== manifest.rendererVersion) throw new Error('Unsupported character specification');
  const g = createGrid(), skin = spec.appearance.skinColor, scarf = spec.appearance.headwearId === 'headscarf';
  g.offset(pose.dx || 0, pose.dy || 0);
  drawHairBack(g, spec);
  if (spec.outfit.topId === 'hoodie' && !scarf) { const c = darken(spec.outfit.topColor, 0.2); g.box(19, 28, 44, 37, c); g.box(18, 30, 45, 36, c); }
  drawLegs(g, spec, skin, pose);
  if (!lookup('tops', spec.outfit.topId)?.onePiece && spec.outfit.bottomId === 'skirt') drawSkirt(g, spec.outfit.bottomColor, 65);
  drawTop(g, spec, skin, pose);
  const face = drawHead(g, spec, pose);
  drawHairFront(g, spec);
  drawHeadwear(g, spec);
  if (face.glasses) drawGlasses(g);
  addOutline(g.cells);
  return { width: SPRITE_W, height: SPRITE_H, rects: toRects(g.cells), cells: g.cells };
}

// Draws a plan with crisp pixels. `scale` should be an integer.
export function drawPlan(ctx, plan, x, y, scale) {
  ctx.imageSmoothingEnabled = false;
  for (const r of plan.rects) { ctx.fillStyle = r.color; ctx.fillRect(x + r.x * scale, y + r.y * scale, r.w * scale, r.h * scale); }
}
