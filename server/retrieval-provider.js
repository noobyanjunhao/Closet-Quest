import { createHash } from 'node:crypto';
import { createOpenAIEmbeddingClient } from './openai.js';
import { EmbeddingError, normalizeVector } from './embeddings.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schemaVersion = 'openai-document-embedding-v1';
function checkedIdentity(value) {
  const identity = { provider: value?.provider, model: value?.model, digest: value?.digest, schemaVersion: value?.schemaVersion, dimensions: value?.dimensions };
  if (['provider', 'model', 'digest', 'schemaVersion'].some(key => typeof identity[key] !== 'string' || !identity[key] || identity[key].length > 256) || !Number.isInteger(identity.dimensions) || identity.dimensions < 2 || identity.dimensions > 3072) throw new EmbeddingError('Invalid retrieval embedding identity.', 'INVALID_EMBEDDING');
  return identity;
}

/** Cache contains hashed keys and normalized vectors, never plaintext wardrobe fields or photos. */
export function createCachedRetrievalEmbeddingClient({ client, identity, memoryCache = new Map(), maxEntries = 512, ttlMs = 10 * 60 * 1000, timeoutMs = 6000, now = Date.now, wardrobeId } = {}) {
  if (!client?.embed || !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096 || !Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid retrieval embedding cache configuration.');
  const expectedIdentity = checkedIdentity(identity), identityKey = JSON.stringify(expectedIdentity);
  // Older clients can still retrieve, but only UUID-scoped requests are cached.
  const scope = typeof wardrobeId === 'string' && uuidPattern.test(wardrobeId) ? wardrobeId.toLowerCase() : null;
  return { async embed(records, { signal: parentSignal } = {}) {
    parentSignal?.throwIfAborted();
    if (!Array.isArray(records) || !records.length || records.length > 201 || records.some(record => !['query', 'garment'].includes(record?.kind) || typeof record.text !== 'string' || !record.text.trim() || record.text.length > 4000)) throw new EmbeddingError('Invalid wardrobe embedding records.', 'INVALID_EMBEDDING_INPUT');
    const started = performance.now(), deadline = AbortSignal.timeout(timeoutMs), signal = parentSignal ? AbortSignal.any([parentSignal, deadline]) : deadline;
    const stats = { scope: scope ? 'wardrobe' : 'disabled', requested: records.length, unique: 0, hits: 0, memoryHits: 0, misses: 0, generated: 0 };
    for (const [key, entry] of memoryCache) if (!entry || now() - entry.createdAt >= ttlMs) memoryCache.delete(key);
    const unique = new Map();
    const ordered = records.map(record => {
      const key = hash(JSON.stringify([scope, identityKey, record.kind, hash(record.text)]));
      if (!unique.has(key)) unique.set(key, { key, record, vector: null });
      return unique.get(key);
    });
    stats.unique = unique.size;
    const missing = [];
    for (const entry of unique.values()) {
      const cached = scope && ttlMs > 0 ? memoryCache.get(entry.key) : null;
      if (cached?.identityKey === identityKey) try {
        entry.vector = normalizeVector(cached.vector, expectedIdentity.dimensions);
        memoryCache.delete(entry.key); memoryCache.set(entry.key, cached);
      } catch { memoryCache.delete(entry.key); }
      if (entry.vector) { stats.hits++; stats.memoryHits++; }
      else { stats.misses++; missing.push(entry); }
    }
    let abortListener;
    try {
      if (missing.length) {
        const aborted = new Promise((_, reject) => { abortListener = () => reject(signal.reason); signal.addEventListener('abort', abortListener, { once: true }); });
        signal.throwIfAborted();
        const generated = await Promise.race([
          client.embed(missing.map(entry => entry.record), { signal }),
          aborted,
        ]);
        signal.throwIfAborted();
        if (JSON.stringify(checkedIdentity(generated?.metadata)) !== identityKey || !Array.isArray(generated.vectors) || generated.vectors.length !== missing.length) throw new EmbeddingError('The retrieval embedding response does not match its model identity.', 'INVALID_EMBEDDING');
        // Validate the complete response before writing any entry, so failures never poison the cache.
        const vectors = generated.vectors.map(vector => normalizeVector(vector, expectedIdentity.dimensions));
        missing.forEach((entry, index) => { entry.vector = vectors[index]; });
        stats.generated = missing.length;
        signal.throwIfAborted();
        if (scope && ttlMs > 0) for (const entry of missing) {
          memoryCache.delete(entry.key); memoryCache.set(entry.key, { identityKey, createdAt: now(), vector: [...entry.vector] });
          while (memoryCache.size > maxEntries) memoryCache.delete(memoryCache.keys().next().value);
        }
      }
      signal.throwIfAborted();
      return { vectors: ordered.map(entry => [...entry.vector]), metadata: { available: true, ...expectedIdentity, placement: 'remote', cache: stats, timingMs: Number((performance.now() - started).toFixed(2)), identityNote: 'OpenAI exposes a model identifier, not a weights digest; this cache expires after a bounded TTL.' } };
    } catch (error) {
      if (parentSignal?.aborted) throw parentSignal.reason;
      const failure = deadline.aborted ? new EmbeddingError('Cloud wardrobe embeddings exceeded the retrieval time budget.', 'EMBEDDING_TIMEOUT') : error instanceof Error ? error : new EmbeddingError('Cloud wardrobe embeddings are unavailable.');
      failure.metadata = { available: false, ...expectedIdentity, placement: 'remote', cache: stats, timingMs: Number((performance.now() - started).toFixed(2)) };
      throw failure;
    } finally { if (abortListener) signal.removeEventListener('abort', abortListener); }
  } };
}

/** Returns dependencies for retrieveWardrobeHybrid; only explicit OpenAI embedding choice uses cloud. */
export function createRetrievalProvider({ openaiFactory = createOpenAIEmbeddingClient, memoryCache = new Map(), maxEntries = 512, ttlMs = 10 * 60 * 1000, timeoutMs = 6000, now = Date.now, getModelIdentity = () => {
  const model = process.env.CLOSET_OPENAI_EMBED_MODEL?.trim() || 'text-embedding-3-small';
  return { provider: 'openai', model, digest: model, schemaVersion, dimensions: 512 };
} } = {}) {
  return function retrievalDependenciesFor({ provider = 'local', embeddingProvider = 'local', wardrobeId } = {}) {
    if (provider === 'quick') return { enabled: false };
    if (!['local', 'openai'].includes(embeddingProvider)) throw new EmbeddingError('Choose local or OpenAI wardrobe embeddings.', 'INVALID_PROVIDER');
    if (embeddingProvider !== 'openai') return {};
    const identity = checkedIdentity(getModelIdentity());
    const client = openaiFactory({ model: identity.model, dimensions: identity.dimensions, timeoutMs });
    return { embeddingClient: createCachedRetrievalEmbeddingClient({ client, identity, memoryCache, maxEntries, ttlMs, timeoutMs, now, wardrobeId }) };
  };
}

export const retrievalDependenciesFor = createRetrievalProvider();
