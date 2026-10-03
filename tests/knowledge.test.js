import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createKnowledgeStore, chunkKnowledgeText, KNOWLEDGE_LIMITS } from '../server/knowledge.js';
import { createEmbeddingClient } from '../server/embeddings.js';

const wardrobe = '3448769b-c1f6-42c2-94e6-d882da3d890c';
const otherWardrobe = '8155b8f6-cb61-4387-9e16-ae5c82b0e351';
async function storage(t) {
  const path = await mkdtemp(join(tmpdir(), 'closet-knowledge-test-'));
  assert.ok(relative(resolve(tmpdir()), resolve(path)).startsWith('closet-knowledge-test-'));
  const stores = [];
  t.after(async () => { for (const store of stores) store.close(); await rm(path, { recursive: true, force: true }); });
  return { path, open: options => { const store = createKnowledgeStore({ storageDir: path, seedDocuments: [], ...options }); stores.push(store); return store; } };
}
function semanticClient() {
  const state = { calls: [], digest: 'weights-1', model: 'test-semantic', dimensions: 2 };
  return { state, async embed(records, { signal } = {}) {
    signal?.throwIfAborted(); state.calls.push(records);
    return { vectors: records.map(record => /gala|tuxedo|ceremony/.test(record.text) ? Array.from({ length: state.dimensions }, (_, i) => i === 0 ? 1 : 0) : Array.from({ length: state.dimensions }, (_, i) => i === 1 ? 1 : 0)), metadata: { provider: 'local', model: state.model, digest: state.digest, schemaVersion: 'test-v1', dimensions: state.dimensions } };
  } };
}

test('semantic retrieval crosses vocabulary gaps and vectors survive store reload', async t => {
  const files = await storage(t), client = semanticClient();
  let store = files.open({ embeddingClient: client });
  const formal = await store.upsert(wardrobe, { title: 'Evening reference', content: 'A tuxedo suits a ceremony.', source: 'My saved style notes' });
  await store.upsert(wardrobe, { title: 'Afternoon reference', content: 'Canvas shorts suit a picnic.' });
  assert.equal(formal.indexing.mode, 'semantic');
  store.close(); store = files.open({ embeddingClient: client });
  const result = await store.search(wardrobe, 'gala');
  assert.equal(result.metadata.mode, 'hybrid');
  assert.equal(result.sources[0].documentId, formal.document.id);
  assert.equal(result.sources[0].lexicalScore, 0);
  assert.equal(result.sources[0].semanticScore, 1);
  assert.equal(result.sources[0].source, 'My saved style notes');
  assert.equal(result.sources[0].trust, 'untrusted-context');
  assert.equal(result.sources[0].citationId, `KB:${formal.document.id}:0`);
  assert.equal(client.state.calls.length, 3, 'reload embeds only the query, not the persisted passages');
});

test('wardrobe namespaces isolate notes, updates replace old chunks, and deletion survives reload', async t => {
  const files = await storage(t), client = semanticClient();
  let store = files.open({ embeddingClient: client });
  const doc = (await store.upsert(wardrobe, { title: 'Private taste', content: 'I prefer velvet and cobalt.' }, { lexicalOnly: true })).document;
  assert.equal((await store.search(otherWardrobe, 'velvet', { lexicalOnly: true })).sources.length, 0);
  assert.deepEqual(await store.remove(otherWardrobe, doc.id), { removed: false });
  await store.upsert(wardrobe, { id: doc.id, title: 'Updated taste', content: 'I prefer linen and terracotta.' }, { lexicalOnly: true });
  assert.equal((await store.search(wardrobe, 'velvet', { lexicalOnly: true })).sources.length, 0);
  assert.equal((await store.search(wardrobe, 'terracotta', { lexicalOnly: true })).sources.length, 1);
  assert.equal((await store.list(wardrobe)).length, 1);
  assert.deepEqual(await store.remove(wardrobe, doc.id), { removed: true });
  store.close(); store = files.open({ embeddingClient: client });
  assert.deepEqual(await store.list(wardrobe), []);
  assert.equal(client.state.calls.length, 0);
});

test('authored seeds work offline, carry provenance, and removed seeds are not silently restored', async t => {
  const files = await storage(t), client = semanticClient();
  let store = createKnowledgeStore({ storageDir: files.path, embeddingClient: client });
  t.after(() => store.close());
  const documents = await store.list(wardrobe);
  assert.equal(documents.length, 4);
  assert.ok(documents.every(doc => doc.origin === 'project-authored' && doc.indexing === 'lexical'));
  const result = await store.search(wardrobe, 'comfort footwear');
  assert.ok(result.sources.length > 0);
  assert.equal(result.metadata.mode, 'lexical');
  assert.equal(client.state.calls.length, 0, 'unindexed search must not trigger expensive passage indexing');
  await store.remove(wardrobe, documents[0].id); store.close();
  store = createKnowledgeStore({ storageDir: files.path, embeddingClient: client });
  assert.equal((await store.list(wardrobe)).length, 3);
  store.close();
});

test('model digest or dimension changes never mix vector spaces; explicit reindex repairs them', async t => {
  const files = await storage(t), client = semanticClient(), store = files.open({ embeddingClient: client });
  await store.upsert(wardrobe, { title: 'Formal', content: 'A tuxedo for a ceremony.' });
  client.state.digest = 'weights-2'; client.state.dimensions = 3;
  const stale = await store.search(wardrobe, 'ceremony');
  assert.equal(stale.metadata.mode, 'lexical-fallback');
  assert.equal(stale.metadata.fallback, 'EMBEDDING_INDEX_STALE');
  assert.equal(stale.metadata.staleChunks, 1);
  assert.equal(stale.sources[0].semanticScore, null);
  assert.equal(client.state.calls.length, 2, 'read does not quietly re-embed documents');
  const refreshed = await store.reindex(wardrobe);
  assert.equal(refreshed.indexedChunks, 1);
  assert.equal((await store.search(wardrobe, 'gala')).metadata.mode, 'hybrid');
});

test('existing digest-aware embedding cache avoids repeated passage inference', async t => {
  const files = await storage(t);
  let digest = 'local-digest-a', generated = 0;
  const client = createEmbeddingClient({ cacheDir: join(files.path, 'cache'), dimensions: 2, getModelIdentity: async () => ({ digest }), embedTexts: async texts => { generated += texts.length; return texts.map(() => [1, 2]); } });
  const store = files.open({ embeddingClient: client });
  const input = { id: randomUUID(), title: 'Everyday', content: 'Comfortable trousers and soft layers.' };
  await store.upsert(wardrobe, input);
  await store.upsert(wardrobe, input);
  assert.equal(generated, 1);
  digest = 'local-digest-b';
  await store.upsert(wardrobe, input);
  assert.equal(generated, 2);
});

test('unavailable model saves searchable text honestly and lexical-only calls never invoke it', async t => {
  const files = await storage(t);
  let calls = 0;
  const store = files.open({ embeddingClient: { async embed() { calls++; throw Object.assign(new Error('offline'), { code: 'EMBEDDING_UNAVAILABLE' }); } } });
  const saved = await store.upsert(wardrobe, { title: 'Textures', content: 'Corduroy adds texture.' });
  assert.equal(saved.indexing.mode, 'lexical');
  assert.equal(saved.indexing.fallback, 'EMBEDDING_UNAVAILABLE');
  const result = await store.search(wardrobe, 'corduroy', { lexicalOnly: true });
  assert.equal(result.sources.length, 1);
  assert.equal(result.metadata.mode, 'lexical');
  assert.equal(calls, 1);
});

test('indexing timeout is bounded and caller cancellation does not save a document', async t => {
  const files = await storage(t), client = { async embed() { await new Promise(resolve => setTimeout(resolve, 120)); return {}; } };
  const store = files.open({ embeddingClient: client, indexTimeoutMs: 20 });
  const result = await store.upsert(wardrobe, { title: 'Late model', content: 'Blue denim.' });
  assert.equal(result.indexing.fallback, 'EMBEDDING_TIMEOUT');
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(store.upsert(wardrobe, { title: 'Canceled', content: 'Green silk.' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await store.list(wardrobe)).length, 1);
});

test('invalid input, namespace traversal, and library limits fail before persistence', async t => {
  const files = await storage(t), store = files.open({ embeddingClient: semanticClient() });
  await assert.rejects(store.list('../../someone-else'), { code: 'INVALID_KNOWLEDGE_INPUT' });
  await assert.rejects(store.upsert(wardrobe, { title: 'Empty', content: ' ' }), { code: 'INVALID_KNOWLEDGE_INPUT' });
  await assert.rejects(store.upsert(wardrobe, { title: 'Binary', content: '\u0000PNG' }), { code: 'INVALID_KNOWLEDGE_INPUT' });
  await assert.rejects(store.upsert(wardrobe, { title: 'Huge', content: 'x'.repeat(KNOWLEDGE_LIMITS.documentChars + 1) }), { code: 'INVALID_KNOWLEDGE_INPUT' });
  await assert.rejects(store.search(wardrobe, 'x', { limit: 99 }), { code: 'INVALID_KNOWLEDGE_INPUT' });
  for (let index = 0; index < KNOWLEDGE_LIMITS.documents; index++) await store.upsert(wardrobe, { title: `Note ${index}`, content: 'Cotton shirts.' }, { lexicalOnly: true });
  await assert.rejects(store.upsert(wardrobe, { title: 'One too many', content: 'Cotton shirts.' }, { lexicalOnly: true }), { code: 'KNOWLEDGE_LIMIT' });
  assert.equal((await store.list(wardrobe)).length, KNOWLEDGE_LIMITS.documents);
});

test('overlapping chunks cover long documents and returned passages remain bounded', async t => {
  const content = Array.from({ length: 600 }, (_, index) => `reference${index}`).join(' ');
  const chunks = chunkKnowledgeText(content);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(chunk => chunk.text.length <= KNOWLEDGE_LIMITS.chunkChars));
  assert.ok(chunks[0].text.includes(chunks[1].text.slice(0, 40)));
  assert.ok(chunks.at(-1).text.endsWith('reference599'));
  const files = await storage(t), store = files.open({ embeddingClient: semanticClient() });
  await store.upsert(wardrobe, { title: 'Long guide', content }, { lexicalOnly: true });
  const results = await store.search(wardrobe, 'reference599', { lexicalOnly: true });
  assert.ok(results.sources.some(source => source.excerpt.includes('reference599')));
  assert.ok(results.sources.every(source => source.excerpt.length <= KNOWLEDGE_LIMITS.chunkChars));
});

test('malformed stored vectors fall back to lexical evidence without leaking model errors', async t => {
  const files = await storage(t), client = semanticClient(), store = files.open({ embeddingClient: client });
  await store.upsert(wardrobe, { title: 'Formal', content: 'A tuxedo suits a ceremony.' });
  const database = new DatabaseSync(join(files.path, 'knowledge.sqlite'));
  database.prepare('UPDATE chunks SET vector=? WHERE namespace=?').run('[0,0]', wardrobe); database.close();
  const result = await store.search(wardrobe, 'ceremony');
  assert.equal(result.metadata.mode, 'lexical-fallback');
  assert.equal(result.metadata.corruptChunks, 1);
  assert.equal(result.sources[0].semanticScore, null);
});

test('explicit provider opt-in indexes through the requested adapter and never contacts OpenAI by default', async t => {
  const files = await storage(t), local = semanticClient(), cloud = semanticClient();
  const cloudEmbed = cloud.embed.bind(cloud);
  cloud.embed = async (...args) => { const result = await cloudEmbed(...args); result.metadata.provider = 'openai'; return result; };
  const store = files.open({ embeddingClient: local, embeddingClients: { openai: cloud } });
  await store.upsert(wardrobe, { title: 'Local guide', content: 'Linen trousers.' });
  assert.equal(cloud.state.calls.length, 0);
  const saved = await store.upsert(wardrobe, { title: 'Cloud guide', content: 'Tuxedo ceremony.' }, { embeddingProvider: 'openai' });
  assert.equal(saved.indexing.embedding.provider, 'openai');
  const result = await store.search(wardrobe, 'gala', { embeddingProvider: 'openai' });
  assert.equal(result.metadata.compatibleChunks, 1);
  assert.equal(result.metadata.staleChunks, 1);
});
