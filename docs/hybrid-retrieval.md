# Local hybrid wardrobe retrieval

Implemented 22 September 2026. Plan A now combines the existing BM25 vocabulary search with real local text embeddings before the existing constrained outfit planner. This is garment-description retrieval; it does not embed photographs or establish visual fit, verified fabric, or a wearer's preferences.

## Runtime path

1. Validate up to 200 current wardrobe records, exclude items awaiting review, and check that a complete outfit can include the requested anchor and low-use piece. Impossible requests fail before inference.
2. Rank eligible descriptions with BM25 and the existing explicit synonym groups. Embed the current brief and bounded descriptive fields with local `qwen3-embedding:0.6b`, requesting 512 dimensions, then validate and normalize every vector.
3. Rank by cosine similarity and combine lexical and dense ranks with reciprocal rank fusion (`k=60`, at most 60 candidates per branch). Generic category-only lexical matches do not add a fusion vote: category coverage is already enforced separately. Raw BM25 scores/ranks remain available for inspection.
4. Reserve a feasible complete outfit, the owned anchor, and a compatible underused item when required. Interleave category rankings into at most 18 records. Dense scores or an experimental reranker cannot relax these constraints.
5. Retrieve at most three authored guidance cards. The stylist enumerates at most 12 valid outfit plans, asks the language model to choose plan IDs and write explanations, then validates those selections. It never manufactures an outfit when generation fails. The system message plus serialized user context remains capped at 6,000 UTF-8 bytes; optional garment fields can be shortened with explicit diagnostics.

The embedding call uses Ollama's documented [`/api/embed`](https://docs.ollama.com/api/embed) interface, including batched inputs, explicit dimensions and `truncate:false`. The [Qwen model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) describes its text embedding task and configurable dimensionality; the local artifact is the [Ollama 0.6B model](https://ollama.com/library/qwen3-embedding:0.6b). These upstream capabilities do not establish wardrobe retrieval accuracy.

## Interfaces and evidence

```js
// Existing synchronous, deterministic lexical API is preserved.
retrieveWardrobe(items, { request, context, anchorId, requireLowUse });

// Async hybrid API used by preview and styling.
await retrieveWardrobeHybrid(
  items,
  { request, context, anchorId, requireLowUse, signal },
  dependencies = {},
); // { items, retrieval }

await style(body, { signal, retrievalDependencies, ...modelOptions });
```

`dependencies.signal` remains accepted for existing callers; an `options.signal` takes precedence. Test seams include `embeddingClient`, `getModelIdentity`, `embedTexts`, `cacheDir`, `dimensions`, `rerankCandidates`, and `rerankerOptions`. `enabled:false` explicitly selects lexical mode. Unit tests inject vectors or disable dense retrieval; they do not contact a model.

The public `retrieval` object preserves the original counts, selected items, reasons, guidance and timing. It adds `version` (`wardrobe-hybrid-v1.1`), an honest `method`, `embedding` model/digest/dimensions/cache/timing metadata, `fusion` branch statistics, `fallback`, `reranker`, and candidate scores. Selected item evidence includes BM25, raw lexical rank, informative fusion rank, dense cosine/rank, and fused score. A cosine score is similarity, not confidence or a probability of a good outfit. Selection order remains stable for model aliases.

The optional learned reranker is **off by default**. Its activation requires explicit `CLOSET_LEARNED_RERANKER=1` or `rerankerOptions.enabled:true`. Its artifact was trained and evaluated against an authored lexical relevance proxy, with no learned dense feature weights; that gate is not evidence of real wardrobe preference quality. When explicitly enabled, the current experimental blend is 80% normalized fusion score and 20% normalized learned score. That online blend has not been evaluated for real wearer relevance. Reranker failure keeps valid dense retrieval active.

## Cache, resource use and failure behavior

The content-addressed disk cache lives in ignored `.local-data/embeddings/`. Keys include model name, the freshly discovered [Ollama model digest](https://docs.ollama.com/api/tags), text schema version, requested dimension count, record kind, and text hash. Changing descriptive metadata, model bytes, dimensions or schema invalidates the affected key. Wear counts remain live constraints and do not require new description embeddings. Identical descriptions within a request share a vector.

Cache files contain normalized vectors and provenance hashes, not photographs, raw briefs, garment text, wardrobe IDs, or recognition job data. Vectors are still derived user data. Superseded cache entries are not currently pruned automatically; deleting a garment stops its retrieval immediately but does not erase an older content-addressed vector file. Cache read/write errors are counted; corrupt vectors are recomputed. A failed cache write does not invalidate a successfully computed vector.

Default inference requests CPU placement (`num_gpu:0`), an 8,192 context and five-minute keep-alive so embeddings do not compete for the laptop's 8 GB GPU. The overall embedding budget is 45 seconds, with three seconds for model discovery. Missing models, service errors, timeouts or malformed vectors produce an explicit lexical fallback with a reason and no invented dense scores. User cancellation propagates instead of triggering fallback. These are local calls; no cloud escalation or upload is implemented.

## Measured development result

Run `node vision/evaluate-hybrid-retrieval.mjs` with Ollama and the embedding model available. The evaluator compares lexical and hybrid recall at 18 over eight authored, disjoint-vocabulary briefs, each with one intended target in a 64-record wardrobe. These cases are separate from the learned ranker training corpus, and learned reranking is explicitly disabled. Repeated distractor descriptions intentionally test crowding but also reduce unique embedding work. This is a small development probe, not a held-out real-photo or preference benchmark.

| Run | BM25 targets recalled | Hybrid targets recalled | Dense fallback | Total retrieval time |
| --- | --- | --- | --- | --- |
| [Initial run](../vision/results/hybrid-runs/2026-09-22T18-53-01-404Z.json) | 1/8 | 7/8 | 0/8 | 49,570 ms |
| [Final v1.1 cached run](../vision/results/hybrid-runs/2026-09-22T18-54-55-533Z.json) | 1/8 | 8/8 | 0/8 | 413 ms |

The initial hiking-footwear failure is retained: the intended boots ranked first by dense similarity, but generic shoe category matches crowded them out after fusion. Removing category-only lexical votes fixed this case; a unit regression covers that rule. Because this rule was refined using the development result, 8/8 is not independent test accuracy.

Initial per-case times were 4.5–10.9 seconds and involved actual CPU embedding inference; 35 unique vectors were generated for the first case and 32 for each remaining case. Final times were 26–152 ms with all 35 unique vectors per case already cached. The cached run measures reuse, not faster model inference. An unseen 200-item wardrobe, longer metadata and concurrent CPU work can be slower or reach the fallback budget. No claim about end-to-end stylist latency follows from these retrieval measurements. The [latest report](../vision/results/hybrid-retrieval-development.json) records all scores, cache statistics, model digest and selections; a separate [post-evaluation runtime snapshot](../vision/results/hybrid-runtime.json) records Ollama 0.34.0 and whatever models remained loaded at capture time.

Targeted verification passed 37 tests across retrieval, embeddings, hybrid retrieval, agents and outfit planning. Tests cover cache invalidation, CPU request configuration, corrections, missing models, cancellation, category crowding, owned anchors, required slots, low-use feasibility, review exclusion, malformed reranker results and the prompt budget. Injected-vector tests establish behavior, not encoder quality.

## Authored style references and remaining limits

`CQ-G09` and `CQ-G10` are short original interpretations of tonal/texture combinations and structured/relaxed combinations discussed in [UNIQLO's Modern Layering Guide](https://www.uniqlo.com/us/en/contents/lifewear-magazine/the-modern-layering-guide/). Their public source metadata explicitly says `authored-interpretation`; they are neither copied retailer text nor a retailer training dataset. They compete for the existing two optional guide slots instead of being appended to every request. Source URLs and provenance stay in public retrieval/citation evidence, outside the model prompt. The original general color and layering guides remain available.

Retrieval uses reviewed text, whose completeness and accuracy depend on recognition and user corrections. Text truncation for embedding is bounded and may omit detail near the end of long fields. There is no photo embedding, segmentation model, OCR model, calibrated confidence, learned personalization, automatically learned fashion rules, hard negation/exclusion parser, or feedback-trained online ranking in this change. Natural-language exclusions remain part of the brief rather than guaranteed filters. Style guidance is advice, and structural validity does not establish aesthetic quality. Next evaluation should use a locked set of varied, corrected wardrobes, adversarial exclusions and human relevance judgments before tuning ranking weights or enabling the learned blend.
