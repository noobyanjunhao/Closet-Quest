// Deterministic colour sampling for the optional on-device outfit reference.
// Pure functions: nothing here records coordinates or colours anywhere.

// Rectangle an image occupies inside a box when shown with object-fit: contain.
export function containRect(boxW, boxH, srcW, srcH) {
  if (!(boxW > 0 && boxH > 0 && srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(boxW / srcW, boxH / srcH), w = srcW * scale, h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

// Converts a tap inside the displayed box to source pixel coordinates.
// Taps in the letterbox report inside:false; coordinates are always clamped.
export function mapPointToSource({ px, py, boxW, boxH, srcW, srcH }) {
  const rect = containRect(boxW, boxH, srcW, srcH);
  if (!rect.w || !rect.h) return { x: 0, y: 0, inside: false };
  const inside = px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return { x: clamp(Math.floor(((px - rect.x) / rect.w) * srcW), srcW - 1), y: clamp(Math.floor(((py - rect.y) / rect.h) * srcH), srcH - 1), inside };
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Median colour of a small patch, so one noisy pixel cannot decide the result.
// `data` is RGBA bytes for a width x height image. Returns null if the patch is fully transparent.
export function medianColor(data, width, height, cx, cy, radius = 3) {
  const channels = [[], [], []];
  const x0 = Math.max(0, cx - radius), x1 = Math.min(width - 1, cx + radius), y0 = Math.max(0, cy - radius), y1 = Math.min(height - 1, cy + radius);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) continue;
    channels[0].push(data[i]); channels[1].push(data[i + 1]); channels[2].push(data[i + 2]);
  }
  if (!channels[0].length) return null;
  const median = list => { list.sort((a, b) => a - b); return list[Math.floor(list.length / 2)]; };
  return rgbToHex(median(channels[0]), median(channels[1]), median(channels[2]));
}
