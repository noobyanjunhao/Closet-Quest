// Follow-up performance sample for the explicit OpenAI wardrobe-embedding path.
import '../server/env.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createOpenAIEmbeddingClient } from '../server/openai.js';
import { createRetrievalProvider } from '../server/retrieval-provider.js';
import { retrieveWardrobeHybrid } from '../server/hybrid-retrieval.js';
import { personalizeRequest } from '../server/personalization.js';
import { photoCollection, sampleItem } from '../src/wardrobe.js';

if (!process.argv.includes('--live')) { console.error('Run with --live to send only public sample garment descriptions to OpenAI (maximum two embedding requests).'); process.exit(2); }
let requests = 0;
const lines = [], checks = [], wardrobeId = randomUUID(), signal = AbortSignal.timeout(25000);
const provider = createRetrievalProvider({ openaiFactory: options => createOpenAIEmbeddingClient({ ...options, fetchImpl: (url, request) => {
  if (requests >= 2) throw Object.assign(new Error('Embedding benchmark request limit reached.'), { code: 'BENCHMARK_BUDGET' });
  requests++; return fetch(url, request);
} }) });
const body = { wardrobeId, items: photoCollection.map(sampleItem), context: 'Presentation day', request: 'A polished, simple classroom presentation outfit around my navy blazer, using only my owned pieces.', anchorId: 'photo-blazer', provider: 'openai',
  preferences: { styles: ['Classic', 'Minimal'], colors: ['Navy', 'White'], avoidColors: ['Pink'], fit: 'Any', priorities: ['Versatility', 'Simple outfits'], notes: 'Prefer restrained combinations for a classroom talk.', modelProfile: 'fast', embeddingProvider: 'openai' },
  recommendationHistory: [{ runId: 'public-benchmark-example', feedback: 'helpful', chosenItemIds: ['photo-trousers', 'photo-sneakers'] }] };
const personal = personalizeRequest(body);
async function run(name, request, expected) {
  const start = performance.now(), requestsBefore = requests;
  try {
    const prepared = await retrieveWardrobeHybrid(personal.items, { ...personal, request: [request, personal.preferenceSummary].join(' ').slice(0, 2000), signal }, provider({ provider: 'openai', embeddingProvider: 'openai', wardrobeId }));
    const embedding = prepared.retrieval.embedding, actual = { hits: embedding.cache?.hits, generated: embedding.cache?.generated };
    const entry = { name, status: !prepared.retrieval.fallback.active && actual.hits === expected.hits && actual.generated === expected.generated ? 'passed' : 'failed', elapsedMs: Number((performance.now() - start).toFixed(2)), httpRequests: requests - requestsBefore, expectedCache: expected, embedding, fallback: prepared.retrieval.fallback, method: prepared.retrieval.method, retrievedIds: prepared.items.map(item => item.id) };
    checks.push(entry); lines.push(JSON.stringify(entry)); console.log(JSON.stringify({ name, status: entry.status, elapsedMs: entry.elapsedMs, embeddingMs: embedding.timingMs, cache: embedding.cache, httpRequests: entry.httpRequests }));
  } catch (error) {
    const entry = { name, status: 'failed', code: error.code || error.name, error: String(error.message).slice(0, 200) }; checks.push(entry); lines.push(JSON.stringify(entry)); console.log(JSON.stringify(entry));
  }
}
await run('Cold OpenAI wardrobe retrieval', body.request, { hits: 0, generated: 8 });
await run('Identical request with cached query and garment vectors', body.request, { hits: 8, generated: 0 });
await run('Changed request with cached garment vectors', 'A relaxed coffee date around my navy blazer with simple colors.', { hits: 7, generated: 1 });
await mkdir('output/sprint6/advanced', { recursive: true });
await writeFile('output/sprint6/advanced/retrieval-results.json', JSON.stringify({ measuredAt: new Date().toISOString(), publicInputsOnly: true, paidRequestCeiling: 2, requests, checks, caveats: ['Three sequential development samples, not population latency or an accuracy comparison.', 'Only the wardrobe retrieval stage is measured; full styling also includes document retrieval and generation.', 'Cached replay reuses stored vectors without inference; changing the query embeds only the query.'] }, null, 2));
await writeFile('output/sprint6/advanced/retrieval-evaluation.log', `${lines.join('\n')}\n`);
if (checks.some(check => check.status !== 'passed')) process.exitCode = 1;
