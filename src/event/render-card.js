// Souvenir card composition. One path (drawScene + drawCard) serves the
// animated preview and the saved 1080 x 1350 PNG, so an edit can never show on
// screen and be missing from the export. The card never contains the photo.
import { manifest as defaultManifest } from './manifest.js';
import { resolveScene } from './state.js';
import { buildAvatarDrawPlan, poseForScene, drawPlan } from './render-avatar.js';
import { buildScenePlan, SCENE_W, SCENE_H, AVATAR_X, AVATAR_Y, AVATAR_SCALE } from './scenes.js';

export const CARD_W = 1080, CARD_H = 1350;
export const CARD_FILENAME = 'closet-quest-pixel-passport.png';
export const TAGLINE = 'Same clothes. New quest.';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const INK = '#263E33', PAPER = '#FFFDF6', FRAME = '#D9D2EE', FRAME_DEEP = '#B9AEDC', STAMP = '#D4573F';

// 5 x 7 first-party pixel lettering for the wordmark and stamps.
const GLYPHS = {
  A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.#####....#....#....#....#.....####',
  D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
  G: '.#####....#....#.####...##...#.###.', H: '#...##...##...#######...##...##...#', I: '#####..#....#....#....#....#..#####',
  J: '..###...#....#....#....#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...#.#.#..#.#...#..', W: '#...##...##...##.#.##.#.###.###...#', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#..#####', 2: '.###.#...#....#...#...#...#...#####',
  3: '####.....#....#.###.....#....#####.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
  6: '.###.#....#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#....#.###.', '.': '..............................##...', '-': '...............#####...............',
  '/': '....#....#...#...#...#...#....#....', '!': '..#....#....#....#....#.........#..', '<': '...#...#...#...#.....#.....#.....#.', ' ': ''
};

export function pixelTextWidth(text, scale) { return Math.max(0, text.length * 6 - 1) * scale; }
export function drawPixelText(ctx, text, x, y, scale, color, bold = 0) {
  ctx.fillStyle = color;
  [...text.toUpperCase()].forEach((ch, index) => {
    const glyph = GLYPHS[ch]; if (!glyph) return;
    for (let i = 0; i < glyph.length; i++) if (glyph[i] === '#') ctx.fillRect(x + (index * 6 + (i % 5)) * scale, y + Math.floor(i / 5) * scale, scale + bold, scale);
  });
}

// Largest size at which the text fits; ellipsises as a last resort.
export function fitText(ctx, text, maxWidth, font, sizes) {
  for (const size of sizes) { ctx.font = font(size); if (ctx.measureText(text).width <= maxWidth) return { text, size }; }
  const size = sizes[sizes.length - 1], chars = Array.from(text); ctx.font = font(size);
  while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
  return { text: chars.join('').trimEnd() + '…', size };
}

export function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

// Draws scenery + character at an integer scale. Used by thumbnails and the card.
export function drawScene(ctx, spec, { sceneId = spec.sceneId, frame = null, x = 0, y = 0, scale = 10 } = {}) {
  const scene = resolveScene({ ...spec, sceneId }), plan = buildScenePlan(scene.id, frame);
  const avatar = buildAvatarDrawPlan(spec, poseForScene(scene.reveal, frame));
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, SCENE_W * scale, SCENE_H * scale); ctx.clip();
  drawPlan(ctx, { rects: plan.back }, x, y, scale);
  drawPlan(ctx, avatar, x + AVATAR_X * scale, y + AVATAR_Y * scale, scale * AVATAR_SCALE);
  drawPlan(ctx, { rects: plan.front }, x, y, scale);
  ctx.restore();
}

export function drawAvatar(ctx, spec, { pose, x = 0, y = 0, scale = 4 } = {}) { drawPlan(ctx, buildAvatarDrawPlan(spec, pose), x, y, scale); }

// Fixed geometry for the card; exported so tests can check the safe area.
export const CARD_LAYOUT = Object.freeze({
  paper: { x: 36, y: 36, w: 1008, h: 1278 },
  scene: { x: 80, y: 190, w: SCENE_W * 10, h: SCENE_H * 10, scale: 10 },
  text: { x: 84, right: 996, nameBaseline: 1140, nameMax: 580, captionTop: 1184, captionMax: 590 },
  stamp: { cx: 836, cy: 1158, w: 316, h: 118 }
});

export function describeCard(spec, config = {}) {
  const scene = resolveScene(spec);
  const label = [config.displayName, config.displayDate].filter(value => typeof value === 'string' && value.trim()).join(' · ');
  return { width: CARD_W, height: CARD_H, nickname: spec.nickname, sceneLabel: scene.label, caption: scene.caption, stamp: scene.stamp, tagline: TAGLINE, eventLabel: label, filename: CARD_FILENAME };
}

export function drawCard(ctx, spec, { frame = null, config = {} } = {}) {
  const info = describeCard(spec, config), L = CARD_LAYOUT;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = FRAME; ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Scattered pixel plus-signs in the frame
  ctx.fillStyle = '#EAE5F7';
  for (let i = 0; i < 46; i++) { const px = (i * 197) % 1068, py = (i * 331) % 1338; ctx.fillRect(px, py + 6, 18, 6); ctx.fillRect(px + 6, py, 6, 18); }
  // Paper with stepped pixel corners and a hard drop shadow
  const paper = (ox, oy, color) => { ctx.fillStyle = color; const { x, y, w, h } = L.paper; ctx.fillRect(x + ox + 12, y + oy, w - 24, h); ctx.fillRect(x + ox, y + oy + 12, w, h - 24); ctx.fillRect(x + ox + 6, y + oy + 6, w - 12, h - 12); };
  paper(10, 12, FRAME_DEEP); paper(0, 0, PAPER);
  // Header
  drawPixelText(ctx, 'CLOSET QUEST', 84, 82, 7, INK, 4);
  drawPixelText(ctx, 'PIXEL PASSPORT', 84, 146, 3, '#6E8A78');
  if (info.eventLabel) {
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right'; ctx.fillStyle = '#6E8A78';
    const fitted = fitText(ctx, info.eventLabel, 380, size => `600 ${size}px ${SANS}`, [28, 24, 20]);
    ctx.fillText(fitted.text, L.text.right, 166);
  } else {
    const chip = 'CAMPUS EDITION', w = pixelTextWidth(chip, 3);
    ctx.fillStyle = '#E4ECD9'; ctx.fillRect(L.text.right - w - 36, 92, w + 36, 45);
    ctx.fillStyle = PAPER; for (const [cx, cy] of [[L.text.right - w - 36, 92], [L.text.right - 6, 92], [L.text.right - w - 36, 131], [L.text.right - 6, 131]]) ctx.fillRect(cx, cy, 6, 6);
    drawPixelText(ctx, chip, L.text.right - w - 18, 104, 3, INK);
  }
  // Scene window with a chunky frame
  ctx.fillStyle = INK; ctx.fillRect(L.scene.x - 8, L.scene.y - 8, L.scene.w + 16, L.scene.h + 16);
  ctx.fillStyle = PAPER; for (const [cx, cy] of [[L.scene.x - 8, L.scene.y - 8], [L.scene.x + L.scene.w, L.scene.y - 8], [L.scene.x - 8, L.scene.y + L.scene.h], [L.scene.x + L.scene.w, L.scene.y + L.scene.h]]) ctx.fillRect(cx, cy, 8, 8);
  drawScene(ctx, spec, { frame, x: L.scene.x, y: L.scene.y, scale: L.scene.scale });
  // Nickname and caption: antialiased text inside a fixed safe area
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = INK;
  const name = fitText(ctx, info.nickname, L.text.nameMax, size => `800 ${size}px ${SANS}`, [72, 64, 56, 48, 40, 34, 30]);
  ctx.font = `800 ${name.size}px ${SANS}`; ctx.fillText(name.text, L.text.x, L.text.nameBaseline);
  ctx.font = `400 34px ${SANS}`; ctx.fillStyle = '#4E5F55';
  wrapText(ctx, info.caption, L.text.captionMax, 2).forEach((line, i) => ctx.fillText(line, L.text.x, L.text.captionTop + 4 + i * 44));
  ctx.font = `italic 400 30px ${SERIF}`; ctx.fillStyle = '#7C70AE'; ctx.fillText(info.tagline, L.text.x, 1284);
  // Quest stamp
  ctx.translate(L.stamp.cx, L.stamp.cy); ctx.rotate(-0.105);
  ctx.globalAlpha = 0.9; ctx.strokeStyle = STAMP; ctx.lineWidth = 6; ctx.strokeRect(-L.stamp.w / 2, -L.stamp.h / 2, L.stamp.w, L.stamp.h);
  ctx.lineWidth = 2; ctx.strokeRect(-L.stamp.w / 2 + 10, -L.stamp.h / 2 + 10, L.stamp.w - 20, L.stamp.h - 20);
  drawPixelText(ctx, info.stamp, -pixelTextWidth(info.stamp, 3) / 2, -30, 3, STAMP);
  drawPixelText(ctx, 'QUEST UNLOCKED', -pixelTextWidth('QUEST UNLOCKED', 2) / 2, 8, 2, STAMP);
  ctx.fillStyle = STAMP; for (const sx of [-112, 100]) { ctx.fillRect(sx, 12, 12, 4); ctx.fillRect(sx + 4, 8, 4, 12); }
  ctx.restore();
}
