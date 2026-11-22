// "Build from my photo": the one network call the event makes, and only after
// the visitor agrees. A reduced JPEG copy of the reference photo is sent to
// this app's own server, which asks an AI vision model for character settings.
// No cookies or account details are sent, and nothing is stored in the browser.
export const LIKENESS_ENDPOINT = '/api/event/pixel-passport/character';
export const LIKENESS_MAX_SIDE = 768;
export const LIKENESS_TIMEOUT_MS = 25000;
const FALLBACK = 'The photo character could not be made right now. You can build yours by hand.';

const browserCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

// Encodes the in-page photo reference as a small base64 JPEG.
export function encodePhoto(photo, { createCanvas = browserCanvas, maxSide = LIKENESS_MAX_SIDE, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const scale = Math.min(1, maxSide / Math.max(photo.width, photo.height));
      const canvas = createCanvas(Math.max(1, Math.round(photo.width * scale)), Math.max(1, Math.round(photo.height * scale)));
      canvas.getContext('2d').drawImage(photo.canvas, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality), marker = 'base64,';
      canvas.width = 1; canvas.height = 1;
      if (typeof url !== 'string' || !url.startsWith('data:image/jpeg') || !url.includes(marker)) throw new Error('encode');
      resolve(url.slice(url.indexOf(marker) + marker.length));
    } catch { reject(new Error(FALLBACK)); }
  });
}

// True only when the server says photo characters are switched on and within their limit.
export async function likenessAvailable({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(LIKENESS_ENDPOINT, { method: 'GET', credentials: 'omit', cache: 'no-store' });
    return response.ok && (await response.json()).available === true;
  } catch { return false; }
}

// Resolves with { outfit, appearance } from the server. The caller still
// validates every field before use. Rejects with a visitor-readable message.
export async function requestCharacter(photo, { fetchImpl = globalThis.fetch, signal, timeoutMs = LIKENESS_TIMEOUT_MS, encode = encodePhoto } = {}) {
  const image = await encode(photo);
  const deadline = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(LIKENESS_ENDPOINT, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, image }), signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(deadline.aborted ? 'That took too long. Try again, or build yours by hand.' : 'No connection right now. Try again, or build yours by hand.');
  }
  let body = null; try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(typeof body?.error === 'string' && body.error.length <= 200 ? body.error : FALLBACK);
  const character = body?.character;
  if (!character || typeof character.outfit !== 'object' || typeof character.appearance !== 'object' || !character.outfit || !character.appearance) throw new Error(FALLBACK);
  return character;
}
