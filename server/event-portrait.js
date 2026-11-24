// Pixel Passport: AI-drawn character from a visitor's photo.
// Unlike event-avatar.js (which only reads drawing settings from the photo),
// this asks an image model to draw a brand-new illustrated figure that keeps
// the visitor's likeness. It costs more per call, so it has its own, lower caps.
// Nothing is stored: the photo and the drawing live only for this request.
import { fail, normalizeJpeg, readBody } from './event-avatar.js';

export const EVENT_PORTRAIT_PATH = '/api/event/pixel-passport/portrait';
export const EVENT_PORTRAIT_LIMITS = Object.freeze({ maxBodyBytes: 700_000, maxImageBytes: 500_000, maxSide: 768, maxCalls: 30, perVisitor: 3, concurrency: 1, timeoutMs: 90_000 });
export const PORTRAIT_MODEL = 'gpt-image-2.6-flare';
const COMMON = 'Draw a brand-new illustrated character of the person in this photo. Do not trace, filter or paste the photo: redraw everything from scratch. Keep the likeness so friends would recognise them: face shape, hairstyle and hair colour, skin tone, eyebrows, eye shape, glasses, facial hair and their expression. Dress the character in the clothes visible in the photo, using the outermost layer; where the photo does not show the lower body, add simple trousers and shoes that match. Show the whole figure from head to shoes, standing, facing the viewer, centred, with a little space above the head and below the feet. Plain flat background in soft sage green (#E4ECD9), a small soft shadow under the feet. No text, no logos, no frame, no extra people or objects.';
export const PORTRAIT_STYLES = Object.freeze({
  toon: 'Style: clean modern cartoon illustration with smooth shapes, soft cel shading and friendly proportions (head slightly larger than life, about four heads tall).',
  toy: 'Style: a cute 3D collectible vinyl toy figure, softly lit studio render, smooth rounded forms, about three and a half heads tall.',
  pixel: 'Style: detailed 32-bit pixel art sprite with crisp square pixels, a limited palette and a dark coloured outline, about four heads tall.'
});

export async function generatePortrait({ apiKey, image, style, quality = 'low', model = PORTRAIT_MODEL, timeoutMs = EVENT_PORTRAIT_LIMITS.timeoutMs, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl('https://api.openai.com/v1/images/edits', {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: `${COMMON} ${PORTRAIT_STYLES[style]}`, images: [{ image_url: `data:image/jpeg;base64,${image}` }], size: '1024x1536', quality, output_format: 'jpeg', output_compression: 85, n: 1 })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (body?.error?.code === 'moderation_blocked') throw fail('That photo could not be used. Try another one, or build your character by hand.', 422, 'PORTRAIT_REFUSED');
    throw Object.assign(new Error(`image provider ${response.status}`), { provider: body?.error?.code || response.status });
  }
  const picture = body?.data?.[0]?.b64_json;
  if (typeof picture !== 'string' || !picture) throw new Error('image provider returned no picture');
  return { image: picture, usage: body.usage ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : null };
}

export function createEventPortrait({ env = process.env, generate, normalize = normalizeJpeg, limits: overrides = {} } = {}) {
  const configured = Number.parseInt(env.CLOSET_EVENT_PORTRAIT_MAX_CALLS || '', 10);
  const limits = { ...EVENT_PORTRAIT_LIMITS, ...(Number.isInteger(configured) && configured >= 0 && configured <= 500 ? { maxCalls: configured } : {}), ...overrides };
  const quality = ['low', 'medium', 'high'].includes(env.CLOSET_EVENT_PORTRAIT_QUALITY) ? env.CLOSET_EVENT_PORTRAIT_QUALITY : 'low';
  const enabled = env.CLOSET_EVENT_AI === '1' && env.CLOSET_EVENT_PORTRAIT !== '0' && (Boolean(generate) || Boolean(env.OPENAI_API_KEY?.trim()));
  const run = generate || ((image, style) => generatePortrait({ apiKey: env.OPENAI_API_KEY, image, style, quality, timeoutMs: limits.timeoutMs }));
  const publicOrigin = env.CLOSET_PUBLIC_ORIGIN || '';
  const visitors = new Map(), recent = []; let calls = 0, active = 0;
  function checkOrigin(req) {
    const host = req.headers.host || '', origin = req.headers.origin;
    const expected = publicOrigin ? (host === new URL(publicOrigin).host ? publicOrigin : null) : (/^(localhost|127\.0\.0\.1):\d+$/.test(host) ? `http://${host}` : null);
    if (!expected || (origin && origin !== expected) || (req.method === 'POST' && origin !== expected)) throw fail('Same-origin request required.', 403, 'FORBIDDEN');
  }
  const visitorKey = req => (publicOrigin ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket?.remoteAddress || 'unknown';
  const available = () => enabled && calls < limits.maxCalls;

  async function handle(req, res) {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    let claimed = false; const started = Date.now();
    try {
      checkOrigin(req);
      if (req.method === 'GET') return send(200, { available: available(), styles: Object.keys(PORTRAIT_STYLES), remaining: Math.max(0, limits.maxCalls - calls), quality, recent });
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw fail('Method not allowed.', 405, 'METHOD'); }
      if (!enabled) throw fail('AI-drawn characters are not switched on.', 503, 'PORTRAIT_OFF');
      const body = await readBody(req, limits.maxBodyBytes);
      if (body.consent !== true) throw fail('Agree to send your photo first.', 400, 'CONSENT_REQUIRED');
      if (!Object.hasOwn(PORTRAIT_STYLES, body.style)) throw fail('Choose one of the listed styles.', 400, 'BAD_STYLE');
      if (typeof body.image !== 'string' || body.image.length > limits.maxBodyBytes || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) throw fail('Send one JPEG photo under 500 KB.', 400, 'INVALID_IMAGE');
      const image = await normalize(body.image, limits);
      const key = visitorKey(req), used = visitors.get(key) || 0;
      if (calls >= limits.maxCalls) throw fail('AI-drawn characters have reached today’s limit.', 429, 'PORTRAIT_FULL');
      if (used >= limits.perVisitor) throw fail('That is the limit of AI drawings for one visitor.', 429, 'VISITOR_LIMIT');
      if (active >= limits.concurrency) throw fail('Someone else’s character is being drawn. Try again in a moment.', 503, 'BUSY');
      // Counted before the call: a failed or slow request can still cost money.
      calls++; active++; claimed = true; visitors.set(key, used + 1);
      const result = await run(image, body.style);
      recent.push({ at: new Date().toISOString(), style: body.style, ms: Date.now() - started, usage: result.usage || null }); while (recent.length > 10) recent.shift();
      return send(200, { image: result.image, style: body.style });
    } catch (error) {
      if (claimed) { recent.push({ at: new Date().toISOString(), failed: error?.code || error?.provider || error?.name || 'ERROR', ms: Date.now() - started }); while (recent.length > 10) recent.shift(); }
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : error?.name === 'TimeoutError' ? 504 : 502;
      return send(status, { error: error?.expose ? error.message : 'The character could not be drawn right now. Try again, or build yours by hand.', code: error?.expose ? error.code : 'PORTRAIT_FAILED' });
    } finally { if (claimed) active--; }
  }
  return { handle, stats: () => ({ enabled, calls, maxCalls: limits.maxCalls, active, quality, recent: structuredClone(recent) }) };
}
