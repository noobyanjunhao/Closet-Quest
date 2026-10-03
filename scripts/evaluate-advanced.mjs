// Reproducible small-sample integration timings. Uses only checked-in public/demo data.
// Explicit --live is required: this sends one public tee photo and authored sample notes to OpenAI.
import '../server/env.js';
import { readFile, mkdir, writeFile, appendFile, mkdtemp, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { createRecognitionProvider } from '../server/recognition-provider.js';
import { createOpenAIChat, createOpenAIEmbeddingClient, openAIStatus } from '../server/openai.js';
import { createKnowledgeStore } from '../server/knowledge.js';
import { createEmbeddingClient } from '../server/embeddings.js';
import { recommend } from '../server/recommendation.js';
import { photoCollection, sampleItem } from '../src/wardrobe.js';

if (!process.argv.includes('--live')) {
  console.error('Run node scripts/evaluate-advanced.mjs --live to authorize the bounded live benchmark. Add --skip-local to omit local vision.');
  process.exit(2);
}

const outputDirectory = resolve('output/sprint6/advanced');
await mkdir(outputDirectory, { recursive: true });
const logPath = join(outputDirectory, 'evaluation.log');
await writeFile(logPath, '');
const started = performance.now(), globalDeadline = AbortSignal.timeout(180000), wardrobeId = randomUUID();
const counters = { recognitionRequests: 0, stylistRequests: 0, embeddingRequests: 0 };
const ceiling = { recognitionRequests: 1, stylistRequests: 1, embeddingRequests: 3 };
const result = {
  measuredAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, modelConfiguration: openAIStatus() },
  protocol: { publicInputsOnly: true, data: ['public/photos/tee.jpg', 'src/wardrobe.js photoCollection', 'data/styling-knowledge.json', 'project-authored example style note'], directPipeline: true, servicePortRequired: false, overallBudgetMs: 180000, paidRequestCeiling: ceiling, wardrobeId, variant: 'Baseline: local wardrobe embeddings plus OpenAI document embeddings. Run evaluate-advanced-retrieval.mjs for the optimized cloud wardrobe retrieval comparison.' },
  caveats: ['One public photo and one styling brief are development integration samples, not accuracy, fashion acceptance, population latency percentiles, or a controlled model comparison.', 'A recognition cache hit reuses an already validated result and is not a second model inference.', 'Quick is deterministic, and local wardrobe retrieval may explicitly fall back to lexical matching.', 'Imported documents use a temporary isolated SQLite database; no personal wardrobe or existing knowledge library is read or changed.'],
  checks: [],
};
const milliseconds = begin => Math.round((performance.now() - begin) * 100) / 100;
async function log(event) { const line = JSON.stringify({ time: new Date().toISOString(), ...event }); console.log(line); await appendFile(logPath, `${line}\n`); }
function meteredFetch(counter) {
  return async (url, options) => {
    if (counters[counter] >= ceiling[counter]) throw Object.assign(new Error('The benchmark request budget has been reached.'), { code: 'BENCHMARK_BUDGET' });
    counters[counter]++;
    return fetch(url, options);
  };
}
async function check(name, operation) {
  const begin = performance.now();
  await log({ event: 'start', name });
  try {
    const details = await operation();
    const entry = { name, elapsedMs: milliseconds(begin), ...details };
    result.checks.push(entry);
    await log({ event: 'result', name, status: entry.status, elapsedMs: entry.elapsedMs, ...(entry.errorCode ? { errorCode: entry.errorCode } : {}) });
    return entry;
  } catch (error) {
    const entry = { name, status: 'failed', elapsedMs: milliseconds(begin), errorCode: error.code || error.name || 'UNKNOWN', error: String(error.message || 'Operation failed').slice(0, 240) };
    result.checks.push(entry); await log({ event: 'result', ...entry }); return entry;
  }
}
const tempDirectory = await mkdtemp(join(tmpdir(), 'closet-advanced-evaluation-'));
const cloudEmbeddingClient = createOpenAIEmbeddingClient({ fetchImpl: meteredFetch('embeddingRequests') });
const store = createKnowledgeStore({ storageDir: tempDirectory, embeddingClients: { openai: cloudEmbeddingClient }, indexTimeoutMs: 6000, searchTimeoutMs: 2000 });
const imageBytes = await readFile('public/photos/tee.jpg');
const image = `data:image/jpeg;base64,${imageBytes.toString('base64')}`;
result.protocol.imageSha256 = createHash('sha256').update(imageBytes).digest('hex');
const recognize = createRecognitionProvider({ openaiFactory: options => createOpenAIChat({ ...options, fetchImpl: meteredFetch('recognitionRequests') }) });

function recognitionEvidence(value) {
  return { provider: value.pipeline?.provider, model: value.model, latencyMs: value.latencyMs, cache: value.pipeline?.cache, pipeline: value.pipeline, observation: value.data, usage: value.usage || null };
}
function recommendationEvidence(value, body) {
  const outfits = value.data?.outfits || [], owned = new Set(body.items.map(item => item.id));
  const complete = outfits.length > 0 && outfits.every(outfit => {
    const chosen = outfit.itemIds.map(id => body.items.find(item => item.id === id)).filter(Boolean);
    const count = category => chosen.filter(item => item.category === category).length;
    return count('Shoes') === 1 && ((count('Top') === 1 && count('Bottom') === 1 && count('Dress') === 0) || (count('Dress') === 1 && count('Top') === 0 && count('Bottom') === 0));
  });
  return { provider: value.pipeline?.provider, model: value.model, pipeline: value.pipeline, latencyMs: value.latencyMs, usage: value.usage || null,
    constraints: { nonempty: outfits.length > 0, ownedOnly: outfits.every(outfit => outfit.itemIds.every(id => owned.has(id))), anchorPreserved: outfits.every(outfit => outfit.itemIds.includes(body.anchorId)), complete, unreviewedExcluded: outfits.every(outfit => outfit.itemIds.every(id => !body.items.find(item => item.id === id)?.needsReview)) },
    outfits, reason: value.data?.reason,
    retrieval: { method: value.retrieval?.method, embedding: value.retrieval?.embedding, fallback: value.retrieval?.fallback, knowledge: value.retrieval?.knowledge, personalization: value.retrieval?.personalization, promptSourceIds: value.retrieval?.promptSourceIds, contextBytes: value.retrieval?.contextBytes, contextLimitBytes: value.retrieval?.contextLimitBytes },
  };
}

try {
  const first = await check('OpenAI public tee recognition — first inference', async () => {
    const value = await recognize(image, { provider: 'openai', modelProfile: 'fast', wardrobeId, signal: globalDeadline });
    const details = recognitionEvidence(value);
    return { status: details.provider === 'openai' && details.cache?.hit === false ? 'passed' : 'failed', ...details };
  });
  if (first.status === 'passed') await check('OpenAI same-photo recognition — scoped cache hit', async () => {
    const requestsBefore = counters.recognitionRequests;
    const value = await recognize(image, { provider: 'openai', modelProfile: 'fast', wardrobeId, signal: globalDeadline });
    const details = recognitionEvidence(value);
    return { status: details.cache?.hit && counters.recognitionRequests === requestsBefore ? 'passed' : 'failed', additionalModelRequests: counters.recognitionRequests - requestsBefore, ...details };
  });
  else result.checks.push({ name: 'OpenAI same-photo recognition — scoped cache hit', status: 'skipped', reason: 'The first inference failed; a second uncached paid request would exceed the limit.' });

  const note = { title: 'Example preference for a campus presentation', source: 'Project-authored benchmark note; fictional preference', content: 'For a classroom talk, I like understated combinations with a structured dark jacket, pale trousers, and my existing white canvas shoes. I prefer navy and white, simple accessories, and one textured piece. My recorded wardrobe and current request take priority. This is a demonstration preference, not a real user profile.' };
  await check('Document import and OpenAI semantic indexing', async () => {
    const imported = await store.upsert(wardrobeId, note, { lexicalOnly: true, signal: globalDeadline });
    const indexed = await store.reindex(wardrobeId, { embeddingProvider: 'openai', signal: globalDeadline });
    return { status: indexed.mode === 'semantic' && indexed.indexedChunks === indexed.totalChunks ? 'passed' : 'degraded', importMode: imported.indexing.mode, documentId: imported.document.id, indexed, documents: await store.list(wardrobeId) };
  });
  await check('OpenAI document query — persisted vectors and cited passages', async () => {
    const found = await store.search(wardrobeId, 'What would suit a low-key lecture with some tailoring?', { embeddingProvider: 'openai', signal: globalDeadline, limit: 4 });
    return { status: found.metadata.mode === 'hybrid' && found.sources.some(source => source.semanticScore !== null) ? 'passed' : 'degraded', ...found };
  });

  const body = { wardrobeId, items: photoCollection.map(sampleItem), context: 'Presentation day', request: 'A polished, simple classroom presentation outfit around my navy blazer, using only my owned pieces.', anchorId: 'photo-blazer', provider: 'openai',
    preferences: { styles: ['Classic', 'Minimal'], colors: ['Navy', 'White'], avoidColors: ['Pink'], fit: 'Any', priorities: ['Versatility', 'Simple outfits'], notes: 'Prefer restrained combinations for a classroom talk.', modelProfile: 'fast', embeddingProvider: 'openai' },
    recommendationHistory: [{ runId: 'public-benchmark-example', feedback: 'helpful', chosenItemIds: ['photo-trousers', 'photo-sneakers'] }] };
  await check('OpenAI personalized owned-item recommendation with document RAG', async () => {
    // Preserve the measured pre-optimization baseline and its three-embedding-call cap.
    // The separate retrieval benchmark measures the newer cloud wardrobe path.
    const value = await recommend(body, { signal: globalDeadline, retrievalDependencies: { embeddingClient: createEmbeddingClient({ timeoutMs: 6000 }) }, openaiChat: createOpenAIChat({ task: 'recommendation', modelProfile: 'fast', fetchImpl: meteredFetch('stylistRequests') }), knowledgeSearch: (id, query, options) => store.search(id, query, { ...options, embeddingProvider: 'openai' }) });
    const details = recommendationEvidence(value, body);
    return { status: details.provider === 'openai' && !details.pipeline.fallback && Object.values(details.constraints).every(Boolean) ? 'passed' : details.provider === 'quick' ? 'degraded' : 'failed', ...details };
  });
  await check('Quick deterministic recommendation — 10 direct-pipeline runs', async () => {
    const times = [], outputs = [];
    for (let index = 0; index < 10; index++) {
      const begin = performance.now(), quickBody = { ...body, provider: 'quick' };
      const value = await recommend(quickBody, { signal: globalDeadline, knowledgeSearch: (id, query, options) => store.search(id, query, { ...options, embeddingProvider: 'openai' }) });
      times.push(milliseconds(begin));
      outputs.push(recommendationEvidence(value, quickBody));
    }
    const sorted = [...times].sort((a, b) => a - b);
    return { status: outputs.every(output => output.provider === 'quick' && Object.values(output.constraints).every(Boolean)) ? 'passed' : 'failed', n: times.length, rawMs: times, sortedMs: sorted, medianMs: (sorted[4] + sorted[5]) / 2, minMs: sorted[0], maxMs: sorted.at(-1), provider: 'quick', model: outputs[0].model, firstOutput: outputs[0], scope: 'Direct function timings, not browser or HTTP timings.' };
  });
  if (!process.argv.includes('--skip-local') && performance.now() - started < 110000) await check('Local public tee recognition — one inference', async () => {
    const value = await recognize(image, { provider: 'local', modelProfile: 'fast', wardrobeId, signal: globalDeadline });
    const details = recognitionEvidence(value);
    return { status: details.provider === 'local' && details.cache?.hit === false ? 'passed' : 'failed', ...details };
  });
  else result.checks.push({ name: 'Local public tee recognition — one inference', status: 'skipped', reason: process.argv.includes('--skip-local') ? 'Explicit --skip-local.' : 'Less than 70 seconds remain in the overall benchmark budget.' });
} finally {
  store.close();
  const insideTemp = relative(resolve(tmpdir()), resolve(tempDirectory));
  if (!insideTemp.startsWith('closet-advanced-evaluation-') || insideTemp.includes('..') || insideTemp.includes('/') || insideTemp.includes('\\')) throw new Error('Unexpected benchmark temporary path; not removing it.');
  await rm(tempDirectory, { recursive: true, force: true });
  result.elapsedMs = milliseconds(started);
  result.requests = counters;
  result.summary = { passed: result.checks.filter(check => check.status === 'passed').length, degraded: result.checks.filter(check => check.status === 'degraded').length, failed: result.checks.filter(check => check.status === 'failed').length, skipped: result.checks.filter(check => check.status === 'skipped').length };
  await writeFile(join(outputDirectory, 'results.json'), JSON.stringify(result, null, 2));
  await log({ event: 'finished', summary: result.summary, requests: counters, elapsedMs: result.elapsedMs });
  if (result.summary.failed || result.summary.degraded) process.exitCode = 1;
}
