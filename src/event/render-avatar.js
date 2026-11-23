// Pixel character renderer for "cq-pixel-v2".
// buildAvatarDrawPlan turns a validated specification into a list of solid
// rectangles on a 96 x 144 logical canvas (the 96 x 136 figure from figure.js
// plus headroom for the jump). It has no DOM dependency, so the same plan
// drives the editor preview, the reveal animation and the saved PNG.
import { manifest as defaultManifest } from './manifest.js';
import { buildFigureCells, FIGURE_W, FIGURE_H, ramp } from './figure.js';

export const HEADROOM = 8;
export const SPRITE_W = FIGURE_W, SPRITE_H = FIGURE_H + HEADROOM;

const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const parse = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => clamp(v).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (hex, other, amount) => { const a = parse(hex), b = parse(other); return toHex(a.map((v, i) => v + (b[i] - v) * amount)); };
export const darken = (hex, amount = 0.22) => mix(hex, '#141220', amount);
export const lighten = (hex, amount = 0.25) => mix(hex, '#FFFFFF', amount);
export const luminance = hex => { const [r, g, b] = parse(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
// Each part is outlined in a dark version of its own colour.
export const outlineOf = hex => ramp(hex).line;

export const REST_POSE = Object.freeze({ dx: 0, dy: 0, armL: 'down', armR: 'down', step: 0, blink: false });

function toRects(cells) {
  const rects = [];
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W;) {
    const color = cells[y * SPRITE_W + x]; if (!color) { x++; continue; }
    let w = 1; while (x + w < SPRITE_W && cells[y * SPRITE_W + x + w] === color) w++;
    rects.push({ x, y, w, h: 1, color }); x += w;
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
    return { ...REST_POSE, step: beat === 0 ? 1 : beat === 2 ? 2 : 0, dx: beat === 0 ? -3 : beat === 2 ? 3 : 0, dy: beat % 2 ? 0 : -1, blink: frame % 12 === 7 };
  }
  if (reveal === 'bounce') {
    if (frame === null) return { ...REST_POSE, armL: 'up2', armR: 'up2', dy: -2 };
    const cycle = [0, -3, -6, -7, -6, -3, 0, 1][frame % 8];
    return { ...REST_POSE, dy: Math.min(cycle, 0), armL: cycle < -1 ? 'up2' : 'down', armR: cycle < -1 ? 'up2' : 'down', blink: cycle > 0 };
  }
  return { ...REST_POSE };
}

export function buildAvatarDrawPlan(spec, pose = REST_POSE, manifest = defaultManifest) {
  if (!spec || spec.rendererVersion !== manifest.rendererVersion) throw new Error('Unsupported character specification');
  const figure = buildFigureCells(spec, { ...pose, dx: 0, dy: 0 }), cells = new Array(SPRITE_W * SPRITE_H).fill(null), dx = pose.dx || 0, dy = HEADROOM + (pose.dy || 0);
  for (let y = 0; y < FIGURE_H; y++) for (let x = 0; x < FIGURE_W; x++) { const c = figure[y * FIGURE_W + x]; if (!c) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < SPRITE_W && ny < SPRITE_H) cells[ny * SPRITE_W + nx] = c; }
  return { width: SPRITE_W, height: SPRITE_H, rects: toRects(cells), cells };
}

// Draws a plan with crisp pixels. Edges are rounded so a fractional scale never leaves seams.
export function drawPlan(ctx, plan, x, y, scale) {
  ctx.imageSmoothingEnabled = false;
  for (const r of plan.rects) { const x0 = Math.round(x + r.x * scale), y0 = Math.round(y + r.y * scale); ctx.fillStyle = r.color; ctx.fillRect(x0, y0, Math.round(x + (r.x + r.w) * scale) - x0, Math.round(y + (r.y + r.h) * scale) - y0); }
}
