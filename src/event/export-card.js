// PNG export, download and optional native sharing for the souvenir card.
import { drawCard, CARD_W, CARD_H, CARD_FILENAME } from './render-card.js';

const browserCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

// Renders the static card and resolves with a PNG Blob. Rejects on a null Blob.
export function renderCardBlob(spec, { config = {}, createCanvas = browserCanvas } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = createCanvas(CARD_W, CARD_H);
      drawCard(canvas.getContext('2d'), spec, { frame: null, config });
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))), 'image/png');
    } catch (error) { reject(error); }
  });
}

// Keeps exactly one current export. A superseded URL is revoked when replaced;
// the current one stays alive while a download or open-image fallback may need it.
export function createExportStore(urlApi = globalThis.URL) {
  let current = null;
  const release = () => { if (current) { urlApi.revokeObjectURL(current.url); current = null; } };
  return {
    set(blob) { release(); current = { blob, url: urlApi.createObjectURL(blob) }; return current; },
    get: () => current,
    dispose: release
  };
}

export function cardFile(blob, FileCtor = globalThis.File) {
  try { return typeof FileCtor === 'function' ? new FileCtor([blob], CARD_FILENAME, { type: 'image/png' }) : null; } catch { return null; }
}

export function canShareFile(nav, file) {
  try { return Boolean(file && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })); } catch { return false; }
}

// Must be called directly from the tap so the browser still sees user activation.
export async function shareCard(nav, file) {
  try { await nav.share({ files: [file], title: 'My Pixel Passport' }); return 'shared'; }
  catch (error) { return error?.name === 'AbortError' ? 'cancelled' : 'failed'; }
}

// Starts a download. A click on the link only *requests* the download: the
// browser never tells the page whether the file was actually saved.
export function requestDownload(url, doc = document, filename = CARD_FILENAME) {
  try {
    const link = doc.createElement('a'); link.href = url; link.download = filename; link.rel = 'noopener'; link.style.display = 'none';
    doc.body.append(link); link.click(); link.remove(); return true;
  } catch { return false; }
}
