// Local photo reference and camera lifecycle for Pixel Passport.
// The photograph is only ever a transient in-page reference: it is never
// uploaded, never written to browser storage and never reaches the renderer.
import { medianColor } from './palette.js';

export const PHOTO_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,       // checked before decoding
  maxPixels: 40_000_000,           // checked after decoding (about 40 megapixels)
  maxSide: 1024,                   // the kept reference is reduced to this
  types: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
});
export const PHOTO_ACCEPT = PHOTO_LIMITS.types.join(',');
export const CAMERA_START_TIMEOUT_MS = 12000;

export class PhotoError extends Error { constructor(message) { super(message); this.name = 'PhotoError'; } }

export function checkPhotoFile(file, limits = PHOTO_LIMITS) {
  if (!file || typeof file.size !== 'number') return 'That file could not be read. You can keep building without a photo.';
  if (!limits.types.includes(file.type)) return 'That photo format is not supported here. Try a JPEG, PNG or WebP, or keep building without a photo.';
  if (file.size > limits.maxBytes) return 'That photo is larger than 8 MB. Try a smaller one, or keep building without a photo.';
  return '';
}

export function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function browserDecode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.decoding = 'async'; image.src = url; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close() {} };
  } finally { URL.revokeObjectURL(url); }
}
const browserCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

// Owns at most one PhotoHandle. A generation token makes late decodes harmless:
// a slow image can never replace a newer photo or come back after a reset.
export function createPhotoStore({ decode = browserDecode, createCanvas = browserCanvas, limits = PHOTO_LIMITS } = {}) {
  let generation = 0, handle = null;
  function release() { if (handle) { handle.dispose(); handle = null; } }
  function adopt(source, width, height) {
    const size = fitWithin(width, height, limits.maxSide), canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size.width, size.height);
    let pixels = null, disposed = false;
    release();
    handle = {
      width: size.width, height: size.height, canvas,
      sample(x, y, radius = 3) {
        if (disposed) return null;
        pixels ||= ctx.getImageData(0, 0, size.width, size.height).data;
        return medianColor(pixels, size.width, size.height, x, y, radius);
      },
      dispose() { disposed = true; pixels = null; canvas.width = 1; canvas.height = 1; }
    };
    return handle;
  }
  return {
    current: () => handle,
    // Resolves with the new handle, or null when a newer action superseded this one.
    async load(file) {
      const current = ++generation, problem = checkPhotoFile(file, limits);
      if (problem) throw new PhotoError(problem);
      let bitmap;
      try { bitmap = await decode(file); } catch { if (current !== generation) return null; throw new PhotoError('That photo could not be opened on this device. You can keep building without it.'); }
      try {
        if (current !== generation) return null;
        if (!(bitmap.width > 0 && bitmap.height > 0)) throw new PhotoError('That photo could not be opened on this device. You can keep building without it.');
        if (bitmap.width * bitmap.height > limits.maxPixels) throw new PhotoError('That photo is too large to use as a reference. Try a smaller one, or keep building without a photo.');
        return adopt(bitmap.source || bitmap, bitmap.width, bitmap.height);
      } finally { bitmap.close?.(); }
    },
    // Captures the current video frame (camera path).
    fromFrame(source, width, height) {
      ++generation;
      if (!(width > 0 && height > 0)) throw new PhotoError('The camera was not ready yet. Try again, or choose a photo.');
      return adopt(source, width, height);
    },
    dispose() { ++generation; release(); }
  };
}

// Event-specific camera adapter. Unlike the wardrobe helper it supports a
// front/rear switch, and it bounds the wait for permission. Audio is never requested.
export function createEventCamera(mediaDevices, { timeoutMs = CAMERA_START_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let generation = 0, stream = null;
  const stopTracks = target => target?.getTracks?.().forEach(track => track.stop());
  function stop() { generation++; stopTracks(stream); stream = null; }
  async function start(facingMode = 'environment') {
    stop();
    const current = generation;
    if (!mediaDevices?.getUserMedia) throw Object.assign(new Error('No camera'), { name: 'NotFoundError' });
    let timer, timedOut = false;
    const pending = mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
    // If permission resolves after we stopped waiting, stop that late stream immediately.
    pending.then(late => { if (timedOut || current !== generation) stopTracks(late); }, () => {});
    const timeout = new Promise((_, reject) => { timer = setTimer(() => { timedOut = true; reject(Object.assign(new Error('Camera timed out'), { name: 'TimeoutError' })); }, timeoutMs); });
    try {
      const next = await Promise.race([pending, timeout]);
      if (current !== generation) { stopTracks(next); return null; }
      stream = next; return stream;
    } finally { clearTimer(timer); }
  }
  return { start, stop, active: () => stream };
}

export function eventCameraMessage(error) {
  return ({
    NotAllowedError: 'Camera access was declined. You can add a photo instead, or skip the photo.',
    SecurityError: 'Camera access was declined. You can add a photo instead, or skip the photo.',
    NotFoundError: 'No camera was found here. You can add a photo instead, or skip the photo.',
    OverconstrainedError: 'No camera was found here. You can add a photo instead, or skip the photo.',
    NotReadableError: 'The camera is busy in another app. You can add a photo instead, or skip the photo.',
    TimeoutError: 'The camera took too long to start. You can add a photo instead, or skip the photo.'
  })[error?.name] || 'The camera could not start. You can add a photo instead, or skip the photo.';
}
