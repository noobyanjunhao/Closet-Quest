import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetrievalProvider, createCachedRetrievalEmbeddingClient } from '../server/retrieval-provider.js';
import { retrieveWardrobeHybrid } from '../server/hybrid-retrieval.js';

const wardrobeId = 'bf0a6207-4bc1-4b49-862c-230cd67c7ac0';
const anotherWardrobe = 'bfa3fbad-7c83-4a28-848e-dddc76110916';
const identity = { provider: 'openai', model: 'test-embed', digest: 'weights-one', schemaVersion: 'test-v1', dimensions: 3 };
const records = () => [{ kind: 'query', text: 'A classroom presentation' }, { kind: 'garment', text: 'PRIVATE TEXT navy blazer' }, { kind: 'garment', text: 'White sneakers' }];
function fakeProvider(options = {}) {
  const state = { identity: { ...identity }, calls: [], constructions: [] };
  const provider = createRetrievalProvider({ getModelIdentity: () => state.identity, openaiFactory: configuration => {
    state.constructions.push(configuration);
    return { async embed(input, { signal }) {
      signal.throwIfAborted(); state.calls.push(input);
      return { vectors: input.map(() => Array.from({ length: state.identity.dimensions }, (_, index) => index + 1)), metadata: { ...state.identity } };
    } };
  }, ...options });
  return { state, provider };
}

test('Quick and local selection never construct or call the OpenAI adapter', () => {
  const { state, provider } = fakeProvider();
  assert.deepEqual(provider({ provider: 'quick', embeddingProvider: 'openai', wardrobeId }), { enabled: false });
  assert.deepEqual(provider({ provider: 'openai', embeddingProvider: 'local', wardrobeId }), {});
  assert.equal(state.constructions.length, 0);
  assert.equal(state.calls.length, 0);
});

test('changed queries reuse garment vectors, duplicate texts batch once, and output cannot mutate cache', async () => {
  const memoryCache = new Map(), { state, provider } = fakeProvider({ memoryCache });
  const options = { provider: 'openai', embeddingProvider: 'openai', wardrobeId };
  const first = await provider(options).embeddingClient.embed(records());
  assert.equal(first.metadata.cache.generated, 3);
  first.vectors[1][0] = 99;
  const changed = records(); changed[0].text = 'A relaxed dinner'; changed.push(changed[1]);
  const second = await provider(options).embeddingClient.embed(changed);
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.calls[1].map(record => record.kind), ['query']);
  assert.deepEqual([second.metadata.cache.hits, second.metadata.cache.generated], [2, 1]);
  assert.notEqual(second.vectors[1][0], 99);
  assert.deepEqual(second.vectors[1], second.vectors[3]);
  assert.ok(!JSON.stringify([...memoryCache]).includes('PRIVATE TEXT'));
});

test('provider model digest dimensions schema and text changes invalidate cache independently', async () => {
  const { state, provider } = fakeProvider();
  const embed = input => provider({ embeddingProvider: 'openai', wardrobeId }).embeddingClient.embed(input);
  await embed(records());
  assert.equal((await embed(records())).metadata.cache.generated, 0);
  state.identity.digest = 'weights-two'; assert.equal((await embed(records())).metadata.cache.generated, 3);
  state.identity.dimensions = 4; assert.equal((await embed(records())).metadata.cache.generated, 3);
  state.identity.schemaVersion = 'test-v2'; assert.equal((await embed(records())).metadata.cache.generated, 3);
  state.identity.model = 'new-model'; assert.equal((await embed(records())).metadata.cache.generated, 3);
  const corrected = records(); corrected[1].text = 'Corrected black blazer';
  assert.equal((await embed(corrected)).metadata.cache.generated, 1);
});

test('cache is UUID-scoped, optional for old clients, TTL-expiring, and bounded', async () => {
  let time = 0;
  const memoryCache = new Map(), { state, provider } = fakeProvider({ memoryCache, maxEntries: 3, ttlMs: 100, now: () => time });
  const embed = id => provider({ embeddingProvider: 'openai', wardrobeId: id }).embeddingClient.embed(records());
  await embed(wardrobeId); assert.equal(memoryCache.size, 3);
  assert.equal((await embed(anotherWardrobe)).metadata.cache.generated, 3);
  assert.equal(memoryCache.size, 3);
  assert.equal((await embed(undefined)).metadata.cache.scope, 'disabled');
  assert.equal((await embed(undefined)).metadata.cache.generated, 3);
  assert.equal(memoryCache.size, 3);
  time = 101; assert.equal((await embed(anotherWardrobe)).metadata.cache.generated, 3);
  assert.equal(state.calls.length, 5);
});

test('failed, malformed, and mismatched model responses do not poison cache', async () => {
  const memoryCache = new Map();
  for (const failure of ['network', 'vector', 'identity']) {
    const client = createCachedRetrievalEmbeddingClient({ identity, memoryCache, wardrobeId, client: { async embed(input) {
      if (failure === 'network') throw Object.assign(new Error('Unavailable'), { code: 'OPENAI_UNAVAILABLE' });
      return { vectors: input.map(() => failure === 'vector' ? [0, 0, 0] : [1, 2, 3]), metadata: { ...identity, ...(failure === 'identity' ? { digest: 'other-weights' } : {}) } };
    } } });
    await assert.rejects(client.embed(records()));
    assert.equal(memoryCache.size, 0);
  }
});

test('caller cancellation and request deadline never leave cached vectors', async () => {
  const memoryCache = new Map(), controller = new AbortController();
  const client = createCachedRetrievalEmbeddingClient({ identity, memoryCache, wardrobeId, timeoutMs: 50, client: { async embed() { await new Promise(resolve => setTimeout(resolve, 80)); return {}; } } });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(client.embed(records(), { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(client.embed(records()), { code: 'EMBEDDING_TIMEOUT' });
  assert.equal(memoryCache.size, 0);
});

test('hybrid retrieval exposes explicit cloud fallback and retains owned complete categories', async () => {
  const items = [{ id: 'a', category: 'Top', name: 'Shirt', wears: 0 }, { id: 'b', category: 'Bottom', name: 'Jeans', wears: 0 }, { id: 'c', category: 'Shoes', name: 'Sneakers', wears: 0 }];
  const provider = createRetrievalProvider({ getModelIdentity: () => identity, openaiFactory: () => ({ async embed() { throw Object.assign(new Error('Unavailable'), { code: 'OPENAI_UNAVAILABLE' }); } }) });
  const result = await retrieveWardrobeHybrid(items, { request: 'A casual outfit' }, provider({ embeddingProvider: 'openai', wardrobeId }));
  assert.equal(result.retrieval.fallback.active, true);
  assert.equal(result.retrieval.fallback.code, 'OPENAI_UNAVAILABLE');
  assert.equal(result.retrieval.embedding.provider, 'openai');
  assert.deepEqual(new Set(result.items.map(item => item.id)), new Set(['a', 'b', 'c']));
});
