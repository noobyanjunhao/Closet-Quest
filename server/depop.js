import { PipelineError } from './recognition.js';

export function depopStatus() {
  return { configured: Boolean(process.env.DEPOP_API_KEY?.trim()), environment: process.env.DEPOP_ENVIRONMENT === 'production' ? 'production' : 'staging', access: 'Approved Depop partner API key required' };
}

// Own-shop, read-only connection. Keys never enter the browser or a listing export.
export function createDepopClient({ apiKey = process.env.DEPOP_API_KEY, environment = depopStatus().environment, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const base = environment === 'production' ? 'https://partnerapi.depop.com' : 'https://partnerapi-staging.depop.com';
  async function get(path, signal) {
    if (!apiKey?.trim()) throw new PipelineError('Depop requires approved partner access. Add DEPOP_API_KEY to .env.local, choose its environment, and restart the server.', { code: 'DEPOP_NOT_CONFIGURED', status: 503 });
    const deadline = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(base + path, { redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
      if (!response.ok) throw new PipelineError(response.status === 401 || response.status === 403 ? 'Depop rejected the key or its permissions. Check partner approval and environment.' : response.status === 429 ? 'Depop is rate limiting this connection. Please try later.' : 'Depop is currently unavailable.', { code: `DEPOP_HTTP_${response.status}`, status: 503 });
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PipelineError) throw error;
      throw new PipelineError(deadline.aborted ? 'Depop took too long to respond.' : 'Could not read a valid Depop response.', { code: 'DEPOP_UNAVAILABLE', status: 503 });
    }
  }
  return {
    async shop(signal) {
      const result = await get('/api/v1/shop/', signal);
      if (typeof result.username !== 'string' || !result.username) throw new PipelineError('Depop returned an unexpected shop response.', { code: 'DEPOP_INVALID_RESPONSE', status: 503 });
      return { connected: true, environment, username: result.username.slice(0, 100), countryCode: result.country_code, checkedAt: new Date().toISOString() };
    },
    async products(cursor = '', signal) {
      if (typeof cursor !== 'string' || cursor.length > 2048) throw new PipelineError('Invalid listing cursor.', { code: 'INVALID_CURSOR', status: 400 });
      const result = await get(`/api/v1/products/?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, signal);
      if (!Array.isArray(result.data)) throw new PipelineError('Depop returned an unexpected listing response.', { code: 'DEPOP_INVALID_RESPONSE', status: 503 });
      return { products: result.data.slice(0, 20).map(product => ({ id: product.product_id, sku: product.sku, description: String(product.description || '').slice(0, 1000), price: product.price_amount, currency: product.price_currency, status: product.status })),
        nextCursor: result.meta?.has_more === true && typeof result.meta.cursor === 'string' ? result.meta.cursor : null };
    },
  };
}
