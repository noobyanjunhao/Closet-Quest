import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createEmbeddingClient, cosineSimilarity, normalizeVector } from './embeddings.js';

export const KNOWLEDGE_VERSION = 'knowledge-v1';
export const KNOWLEDGE_LIMITS = Object.freeze({ documents: 24, documentChars: 20000, chunks: 256, chunkChars: 900, overlapChars: 120, queryChars: 1000 });
export const BUILTIN_STYLE_DOCUMENTS = Object.freeze(JSON.parse(readFileSync(new URL('../data/styling-knowledge.json', import.meta.url), 'utf8')));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = text => createHash('sha256').update(text).digest('hex');
const defaultDirectory = fileURLToPath(new URL('../.local-data/knowledge/', import.meta.url));
const safeCode = error => /^[A-Z_]{3,50}$/.test(error?.code || '') ? error.code : 'EMBEDDING_UNAVAILABLE';

export class KnowledgeError extends Error {
  constructor(message, code = 'INVALID_KNOWLEDGE_INPUT', status = 400) { super(message); this.name = 'KnowledgeError'; this.code = code; this.status = status; }
}

function validateId(value, label) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new KnowledgeError(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function boundedText(value, label, maximum, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new KnowledgeError(`${label} must be plain text of at most ${maximum} characters.`);
  return value.trim().replace(/\r\n/g, '\n');
}

// Bounded overlapping passages preserve useful context without sending entire documents to a model.
export function chunkKnowledgeText(content) {
  const chunks = [];
  for (let start = 0; start < content.length;) {
    let end = Math.min(start + KNOWLEDGE_LIMITS.chunkChars, content.length);
    if (end < content.length) {
      const boundary = Math.max(content.lastIndexOf('\n', end), content.lastIndexOf(' ', end));
      if (boundary > start + KNOWLEDGE_LIMITS.chunkChars * 0.65) end = boundary;
    }
    const text = content.slice(start, end).trim();
    if (text) chunks.push({ ordinal: chunks.length, text, textHash: hash(text) });
    if (end === content.length) break;
    start = Math.max(start + 1, end - KNOWLEDGE_LIMITS.overlapChars);
  }
  return chunks;
}

function embeddingIdentity(metadata = {}, provider) {
  const identity = { provider: metadata.provider || provider, model: metadata.model, digest: metadata.digest || metadata.modelDigest, schemaVersion: metadata.schemaVersion, dimensions: metadata.dimensions, documentSchema: KNOWLEDGE_VERSION };
  if (['provider', 'model', 'digest', 'schemaVersion'].some(key => typeof identity[key] !== 'string' || !identity[key] || identity[key].length > 256) || !Number.isInteger(identity.dimensions) || identity.dimensions < 1 || identity.dimensions > 4096) throw new KnowledgeError('Embedding identity is invalid.', 'INVALID_EMBEDDING', 502);
  return identity;
}

function sameIdentity(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function docRecord(row) {
  return { id: row.id, title: row.title, source: row.source, origin: row.origin, contentLength: row.content.length, chunkCount: Number(row.chunk_count), indexedChunks: Number(row.indexed_chunks), indexing: row.indexed_chunks === row.chunk_count ? 'semantic' : row.indexed_chunks ? 'partial' : 'lexical', createdAt: row.created_at, updatedAt: row.updated_at };
}

const stopWords = new Set(['the', 'and', 'with', 'for', 'that', 'this', 'from', 'your', 'what', 'wear', 'outfit', 'look', 'please', 'would', 'have', 'are', 'can', 'want']);
function tokens(text) { return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(token => token.length > 1 && !stopWords.has(token)))]; }
function lexicalScore(queryTokens, chunk) {
  if (!queryTokens.length) return 0;
  const textTokens = new Set(tokens(chunk.text)), titleTokens = new Set(tokens(chunk.title));
  return queryTokens.reduce((sum, token) => sum + (titleTokens.has(token) ? 1 : textTokens.has(token) ? 0.75 : 0), 0) / queryTokens.length;
}

/** SQLite is a local persistence layer, not authentication or a cloud vector service. */
export function createKnowledgeStore({ storageDir = defaultDirectory, embeddingClient, embeddingClients = {}, embeddingProvider = 'local', indexTimeoutMs = 6000, searchTimeoutMs = 2000, seedDocuments = BUILTIN_STYLE_DOCUMENTS } = {}) {
  if (typeof storageDir !== 'string' || !storageDir) throw new KnowledgeError('A knowledge storage directory is required.');
  mkdirSync(storageDir, { recursive: true });
  const database = new DatabaseSync(join(storageDir, 'knowledge.sqlite'));
  database.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS namespaces (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (
      namespace TEXT NOT NULL REFERENCES namespaces(id), id TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL, origin TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(namespace, id));
    CREATE TABLE IF NOT EXISTS chunks (
      namespace TEXT NOT NULL, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL,
      text_hash TEXT NOT NULL, vector TEXT, identity TEXT,
      PRIMARY KEY(namespace, document_id, ordinal),
      FOREIGN KEY(namespace, document_id) REFERENCES documents(namespace, id) ON DELETE CASCADE);`);
  const clients = { local: embeddingClient || createEmbeddingClient({ cacheDir: join(storageDir, 'embedding-cache'), schemaVersion: KNOWLEDGE_VERSION, timeoutMs: indexTimeoutMs }), ...embeddingClients };
  if (embeddingClient) clients[embeddingProvider] = embeddingClient;
  let closed = false;
  const assertOpen = () => { if (closed) throw new KnowledgeError('Knowledge store is closed.', 'KNOWLEDGE_CLOSED', 503); };
  const documentList = database.prepare(`SELECT d.*, COUNT(c.ordinal) AS chunk_count, SUM(CASE WHEN c.vector IS NOT NULL THEN 1 ELSE 0 END) AS indexed_chunks
    FROM documents d LEFT JOIN chunks c ON c.namespace=d.namespace AND c.document_id=d.id
    WHERE d.namespace=? GROUP BY d.id ORDER BY d.created_at,d.id`);
  const rowsFor = database.prepare(`SELECT c.*,d.title,d.source,d.origin,d.content_hash FROM chunks c JOIN documents d ON d.namespace=c.namespace AND d.id=c.document_id WHERE c.namespace=? ORDER BY d.created_at,c.document_id,c.ordinal`);
  const insertChunk = database.prepare('INSERT INTO chunks(namespace,document_id,ordinal,text,text_hash,vector,identity) VALUES(?,?,?,?,?,?,?)');
  function transaction(action) {
    database.exec('BEGIN IMMEDIATE');
    try { const result = action(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  function saveDocument(namespace, doc, chunks, vectors, identity, origin = 'user') {
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO documents(namespace,id,title,content,content_hash,source,origin,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(namespace,id) DO UPDATE SET title=excluded.title,content=excluded.content,content_hash=excluded.content_hash,source=excluded.source,origin=excluded.origin,updated_at=excluded.updated_at`).run(namespace, doc.id, doc.title, doc.content, hash(doc.content), doc.source, origin, now, now);
    database.prepare('DELETE FROM chunks WHERE namespace=? AND document_id=?').run(namespace, doc.id);
    chunks.forEach((chunk, index) => insertChunk.run(namespace, doc.id, chunk.ordinal, chunk.text, chunk.textHash, vectors ? JSON.stringify(vectors[index]) : null, identity ? JSON.stringify(identity) : null));
  }
  function ensureNamespace(value) {
    assertOpen();
    const namespace = validateId(value, 'Wardrobe ID');
    if (!database.prepare('SELECT id FROM namespaces WHERE id=?').get(namespace)) transaction(() => {
      database.prepare('INSERT INTO namespaces(id,created_at) VALUES(?,?)').run(namespace, new Date().toISOString());
      for (const seed of seedDocuments) {
        const doc = validateDocument(seed);
        saveDocument(namespace, doc, chunkKnowledgeText(doc.content), null, null, 'project-authored');
      }
    });
    return namespace;
  }
  function validateDocument(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new KnowledgeError('A title and text document are required.');
    return { id: input.id === undefined ? randomUUID() : validateId(input.id, 'Document ID'), title: boundedText(input.title, 'Title', 160), content: boundedText(input.content, 'Content', KNOWLEDGE_LIMITS.documentChars), source: boundedText(input.source, 'Source', 300, { optional: true }) || 'Personal style note' };
  }
  function chooseClient(provider) {
    const selected = provider || embeddingProvider;
    if (typeof selected !== 'string' || !['local', 'openai'].includes(selected)) throw new KnowledgeError('Choose local or OpenAI document embeddings.', 'INVALID_PROVIDER');
    return { provider: selected, client: clients[selected] };
  }
  async function embed(records, { signal: parentSignal, embeddingProvider: provider, budget }) {
    const selected = chooseClient(provider);
    if (!selected.client?.embed) throw new KnowledgeError('The selected embedding service is not configured.', 'EMBEDDING_UNAVAILABLE', 503);
    const timeout = AbortSignal.timeout(budget);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    signal.throwIfAborted();
    // Race the signal as well as passing it to adapters, so a broken adapter cannot stall a request.
    let onAbort;
    try {
      const result = await Promise.race([selected.client.embed(records, { signal }), new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); })]);
      signal.throwIfAborted();
      const identity = embeddingIdentity(result?.metadata, selected.provider);
      if (!Array.isArray(result.vectors) || result.vectors.length !== records.length) throw new KnowledgeError('Embedding count is invalid.', 'INVALID_EMBEDDING', 502);
      return { vectors: result.vectors.map(vector => normalizeVector(vector, identity.dimensions)), identity, metadata: result.metadata };
    } catch (error) {
      if (parentSignal?.aborted) throw parentSignal.reason;
      if (timeout.aborted) throw new KnowledgeError('Document embedding time budget expired.', 'EMBEDDING_TIMEOUT', 503);
      throw error;
    } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
  }
  const documentEmbeddingRecord = (title, text) => ({ kind: 'garment', text: `Style reference: ${title}\n${text}` });
  async function list(wardrobeId) { return documentList.all(ensureNamespace(wardrobeId)).map(docRecord); }
  async function upsert(wardrobeId, input, { signal, embeddingProvider: provider, lexicalOnly = false } = {}) {
    signal?.throwIfAborted();
    const namespace = ensureNamespace(wardrobeId), doc = validateDocument(input), chunks = chunkKnowledgeText(doc.content);
    chooseClient(provider);
    const checkCapacity = () => {
      const documents = documentList.all(namespace), existing = documents.find(row => row.id === doc.id);
      if (!existing && documents.length >= KNOWLEDGE_LIMITS.documents) throw new KnowledgeError('The style library is full. Remove a document before adding another.', 'KNOWLEDGE_LIMIT', 413);
      const otherChunks = documents.filter(row => row.id !== doc.id).reduce((sum, row) => sum + Number(row.chunk_count), 0);
      if (otherChunks + chunks.length > KNOWLEDGE_LIMITS.chunks) throw new KnowledgeError('The style library has reached its passage limit.', 'KNOWLEDGE_LIMIT', 413);
    };
    // Reject full libraries before any potentially billable embedding request.
    checkCapacity();
    let indexed = null, failure = null;
    if (!lexicalOnly) try { indexed = await embed(chunks.map(chunk => documentEmbeddingRecord(doc.title, chunk.text)), { signal, embeddingProvider: provider, budget: indexTimeoutMs }); }
    catch (error) { if (signal?.aborted) throw signal.reason; failure = safeCode(error); }
    signal?.throwIfAborted(); assertOpen();
    transaction(() => {
      checkCapacity();
      saveDocument(namespace, doc, chunks, indexed?.vectors, indexed?.identity);
    });
    return { document: documentList.all(namespace).map(docRecord).find(row => row.id === doc.id), indexing: { mode: indexed ? 'semantic' : 'lexical', embedding: indexed?.identity || null, fallback: failure, message: failure ? 'Saved. Keyword search is available; semantic indexing could not finish.' : null } };
  }
  async function remove(wardrobeId, id) {
    const namespace = ensureNamespace(wardrobeId), documentId = validateId(id, 'Document ID');
    return { removed: Number(database.prepare('DELETE FROM documents WHERE namespace=? AND id=?').run(namespace, documentId).changes) > 0 };
  }
  async function reindex(wardrobeId, { signal, embeddingProvider: provider } = {}) {
    signal?.throwIfAborted();
    const namespace = ensureNamespace(wardrobeId), rows = rowsFor.all(namespace), started = performance.now();
    chooseClient(provider);
    let indexedChunks = 0, failure = null, lastIdentity = null;
    for (let offset = 0; offset < rows.length; offset += 32) {
      signal?.throwIfAborted();
      const batch = rows.slice(offset, offset + 32), remaining = Math.floor(indexTimeoutMs - (performance.now() - started));
      if (remaining <= 0) { failure = 'EMBEDDING_TIMEOUT'; break; }
      let result;
      try { result = await embed(batch.map(row => documentEmbeddingRecord(row.title, row.text)), { signal, embeddingProvider: provider, budget: remaining }); }
      catch (error) { if (signal?.aborted) throw signal.reason; failure = safeCode(error); break; }
      signal?.throwIfAborted(); assertOpen(); lastIdentity = result.identity;
      // Text hash plus title protects against concurrent edits while a model request was running.
      transaction(() => batch.forEach((row, index) => {
        const updated = database.prepare(`UPDATE chunks SET vector=?,identity=? WHERE namespace=? AND document_id=? AND ordinal=? AND text_hash=?
          AND EXISTS(SELECT 1 FROM documents WHERE namespace=? AND id=? AND title=? AND content_hash=?)`).run(JSON.stringify(result.vectors[index]), JSON.stringify(result.identity), namespace, row.document_id, row.ordinal, row.text_hash, namespace, row.document_id, row.title, row.content_hash);
        indexedChunks += Number(updated.changes);
      }));
    }
    return { indexedChunks, totalChunks: rows.length, mode: failure ? indexedChunks ? 'partial' : 'lexical' : 'semantic', embedding: lastIdentity, fallback: failure, timingMs: Math.round(performance.now() - started) };
  }
  async function search(wardrobeId, query, { signal, limit = 4, lexicalOnly = false, embeddingProvider: provider } = {}) {
    signal?.throwIfAborted();
    const namespace = ensureNamespace(wardrobeId), text = boundedText(query, 'Search query', KNOWLEDGE_LIMITS.queryChars);
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new KnowledgeError('Choose between 1 and 8 retrieved passages.');
    chooseClient(provider);
    const started = performance.now();
    let rows = rowsFor.all(namespace), queryEmbedding = null, failure = null;
    if (!lexicalOnly && rows.some(row => row.vector)) try {
      queryEmbedding = await embed([{ kind: 'query', text: `Instruct: Retrieve style guidance relevant to this user's wardrobe request.\nQuery: ${text}` }], { signal, embeddingProvider: provider, budget: searchTimeoutMs });
    } catch (error) { if (signal?.aborted) throw signal.reason; failure = safeCode(error); }
    signal?.throwIfAborted(); assertOpen();
    // Re-read after inference so removed or edited notes cannot leak from an earlier snapshot.
    rows = rowsFor.all(namespace);
    let compatibleChunks = 0, staleChunks = 0, corruptChunks = 0;
    const queryTokens = tokens(text);
    const ranked = rows.map(row => {
      const lexical = lexicalScore(queryTokens, row);
      let semantic = null;
      if (queryEmbedding && row.vector) try {
        if (sameIdentity(JSON.parse(row.identity), queryEmbedding.identity)) {
          semantic = Math.max(0, cosineSimilarity(queryEmbedding.vectors[0], normalizeVector(JSON.parse(row.vector), queryEmbedding.identity.dimensions)));
          compatibleChunks++;
        } else staleChunks++;
      } catch { corruptChunks++; }
      return { row, lexical, semantic, score: semantic === null ? lexical * (queryEmbedding ? 0.3 : 1) : 0.7 * semantic + 0.3 * lexical };
    }).filter(entry => entry.lexical > 0 || (entry.semantic !== null && entry.semantic >= 0.25)).sort((left, right) => right.score - left.score || left.row.document_id.localeCompare(right.row.document_id) || left.row.ordinal - right.row.ordinal);
    const counts = new Map(), sources = [];
    for (const { row, lexical, semantic, score } of ranked) {
      if ((counts.get(row.document_id) || 0) >= 2) continue;
      counts.set(row.document_id, (counts.get(row.document_id) || 0) + 1);
      sources.push({ id: `${row.document_id}:${row.ordinal}`, citationId: `KB:${row.document_id}:${row.ordinal}`, documentId: row.document_id, title: row.title, source: row.source, origin: row.origin, excerpt: row.text, trust: 'untrusted-context', score: Number(score.toFixed(4)), lexicalScore: Number(lexical.toFixed(4)), semanticScore: semantic === null ? null : Number(semantic.toFixed(4)) });
      if (sources.length === limit) break;
    }
    const mode = compatibleChunks ? 'hybrid' : failure || staleChunks || corruptChunks ? 'lexical-fallback' : 'lexical';
    return { sources, metadata: { version: KNOWLEDGE_VERSION, mode, trust: 'untrusted-context', embedding: queryEmbedding?.identity || null, fallback: failure || (staleChunks ? 'EMBEDDING_INDEX_STALE' : corruptChunks ? 'INVALID_STORED_EMBEDDING' : null), totalChunks: rows.length, indexedChunks: rows.filter(row => row.vector).length, compatibleChunks, staleChunks, corruptChunks, lexicalOnly, timingMs: Math.round(performance.now() - started) } };
  }
  function close() { if (!closed) { database.close(); closed = true; } }
  return { list, upsert, remove, reindex, search, close };
}
