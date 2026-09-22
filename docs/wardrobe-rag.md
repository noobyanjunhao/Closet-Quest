# Local wardrobe retrieval

Closet Quest retrieves wardrobe records and a small set of authored styling guides before asking its existing local Gemma model to build outfits. This is lexical retrieval-augmented generation: BM25, explicit vocabulary expansion and outfit coverage. It does not use embeddings, a vector database, an external fashion knowledge service or a newly downloaded model.

## Request to grounded outfit

1. Validate up to 200 submitted wardrobe records and a request of up to 2,000 characters. `context` is optional text up to 160 characters. `anchorId` optionally names an owned starting piece. `requireLowUse` optionally requires a piece with zero or one recorded wear.
2. Remove every record with `needsReview: true`. Accept legacy reviewed records where that property is absent. Strip image bytes, job state and unknown fields before indexing or sending model context.
3. Build a fresh in-memory index from the current records. Names and garment types receive extra term frequency; recorded colors, patterns, fit, appearance and tags are searchable. User corrections affect the next request immediately, without an embedding refresh or stale cache.
4. Expand known query vocabulary explicitly, such as pants → trousers and office → polished/presentation. Rank with BM25 (`k1 = 1.2`, `b = 0.75`; expansion terms receive weight 0.45).
5. Find a complete outfit that satisfies the anchor and rediscovery requirements. Reserve its pieces, then interleave category rankings until at most 18 records are selected. This prevents many highly matching tops from displacing the only shoes. A dress anchor excludes a separates-only solution, and a top anchor cannot be satisfied by a dress.
6. Retrieve the foundational guide plus up to two relevant cards from the eight authored guides in `server/retrieval.js`. Their stable `CQ-G01`–`CQ-G08` identifiers identify local product guidance, not external research citations.
7. Enumerate complete outfit plans over the at-most-18 retrieved records before inference. Every plan already satisfies ownership, review status, exact base and shoe slots, at most one outerwear, and the anchor/low-use requirements. Usually plans have zero or one accessory; a required accessory anchor plus a different low-use accessory is also supported. Deduplicate combinations and select at most 12 candidates using lexical relevance, coverage of both dress and separates when feasible, and a penalty for overlap. These scores are selection heuristics, not aesthetic ratings.
8. Pack the combined system and serialized user prompt within 6,000 UTF-8 bytes, leaving headroom in the model’s 8,192-token context for message framing and up to 1,400 output tokens. Preserve every selected ID, category and recorded wear count, every candidate plan, the full brief and constraints, the response schema, and every retrieved guide. Optional garment metadata has individual field caps and is packed by field priority, with the anchor first within each field. The model receives an explicit `metadataTruncated` flag. A brief that cannot fit unchanged fails clearly before inference. Original wardrobe IDs are temporarily represented by `G1`, `G2`, etc. Instructions explicitly treat stored fields, request text and retrieved cards as data.
9. Ask the model to select up to three distinct plan IDs from a JSON-schema enum and write bounded natural prose (title 80 characters, explanation 400, styling tip 220). It cannot construct new item lists. Invalid IDs, duplicate choices and malformed text are rejected; known plan IDs are mapped back to their prevalidated garment lists and checked again against the outfit constraints. An empty or wholly invalid model selection remains empty with a reason; there is no silent replacement outfit.
10. Restore original IDs and attach deterministic item facts, retrieval reasons and guide references. These evidence records come from the server’s validated wardrobe, not model-generated citations. The model is instructed to use garment names without internal aliases or parenthesized record IDs.

The coverage reservation is deliberately separate from lexical ranking. A zero-scoring item may be included because it fills a necessary slot. Retrieval scores are ranking values, never confidence or outfit quality percentages.

## Interface

```js
import { retrieveWardrobe } from '../server/retrieval.js';

const { items, retrieval } = retrieveWardrobe(wardrobeItems, {
  request: 'A polished blue look',
  context: 'Presentation day', // optional
  anchorId: 'my-blazer-id',    // optional; must be owned and reviewed
  requireLowUse: false,       // optional; defaults to false
});
```

`items` contains the selected, sanitized wardrobe records. `retrieval` contains:

```js
{
  version: 'wardrobe-bm25-v1',
  method: 'BM25 + explicit synonyms + category coverage',
  eligibleCount: 83,
  retrievedCount: 18,
  excludedReviewCount: 2,
  items: [{ id: 'my-blazer-id', score: 2.4, reasons: ['Your selected starting piece'] }],
  guidance: [{ id: 'CQ-G01', title: 'Build a complete outfit', text: '...' }],
  anchorId: 'my-blazer-id',
  timingMs: 2.1,
}
```

Values above are illustrative. The returned result supplies actual counts, scores and timing. `POST /api/retrieve` can call this function without model inference. `POST /api/style` uses the same retrieval function and returns its metadata at the top level alongside the existing `data`, `model`, `latencyMs` and `tokens` fields.

Styling results additionally report `retrieval.contextChars`, `contextBytes`, `contextLimitBytes` and `truncatedFields: [{itemId, field}]`. These describe the combined system and user prompt sent to the model; they are byte/character measurements, not tokenizer-derived counts. Full saved garment facts remain available in the UI grounding evidence even when optional model metadata was shortened. Retrieval previews do not invoke prompt packing, so they omit these generation-specific measurements.

The model’s internal response is `{outfits: [{planId, title, explanation, stylingTip}], reason}`. Public outfit results still contain the original `itemIds` and grounding, with an additional `planId`. Top-level planning diagnostics are explicit:

```js
{
  planning: {
    version: 'validated-outfit-plans-v1',
    method: 'Enumerated valid outfits + lexical relevance, base-shape coverage and overlap diversity',
    enumeratedCount: 16,
    validCombinationCount: 8,
    candidateCount: 8,
    timingMs: 1.2,
    candidates: [{id:'P1', itemIds:['my-top','my-bottom','my-shoes','my-blazer'], score:2.4}],
    selectedPlanIds: ['P1'],
    rejectedSelectionCount: 0,
  },
}
```

These numbers are illustrative. Planning verifies structure, ownership in the submitted snapshot and declared constraints. It does not establish that a wearer will like the outfit or that generated prose is completely grounded.

Each generated outfit retains `itemIds`, `title`, `explanation` and `stylingTip`, and adds:

```js
{
  grounding: [{
    itemId: 'my-blazer-id',
    reasons: ['Your selected starting piece', 'Adds an outerwear option'],
    facts: ['Category: Outerwear', 'Color label: Blue', 'Recorded wears: 3'],
  }],
  guideCitations: [{ id: 'CQ-G01', title: 'Build a complete outfit' }],
}
```

Guide citations mean “retrieved references supplied for this generation.” They do not assert that every sentence in a generated explanation follows a particular card. Facts describe saved attributes; model-recognized material appearance remains explicitly unverified.

Input and feasibility errors have HTTP status 400 and machine-readable codes: `INVALID_STYLE_REQUEST`, `ANCHOR_NOT_FOUND`, `ANCHOR_NEEDS_REVIEW`, `NO_COMPLETE_OUTFIT`, or `STYLE_CONTEXT_TOO_LARGE`. Invalid input and impossible combinations fail before the model is called. The 2,000-character request maximum remains an input limit; unusually expensive Unicode or escaped control text may also need shortening to fit the complete prompt’s byte budget.

## Validation and limits

Run `node --test tests/retrieval.test.js tests/agents.test.js tests/outfit-plans.test.js` for the targeted suite. Tests cover recall of a relevant piece among 180 distracting records, required slot coverage, mandatory anchor and low-use reservation, immediate correction visibility, pending-review exclusion, bounded input and metadata shapes, rejection before inference, generation guards, ID restoration, and evidence built from saved records. Planner tests exercise bounded 18-record enumeration, distinct bases, dress/top anchors, required accessory pairs, selected-plan restoration, malicious plan IDs and no-fallback behavior. Adversarial 200-item metadata tests include maximum-length arrays, Unicode and JSON escaping; they verify the complete prompt byte cap while retaining all 18 selected records, candidate plans, the anchor, slots, full brief, constraints and full UI facts. Model calls in these tests are mocked; these are correctness checks, not a measured fashion-quality benchmark.

The index is rebuilt per request over at most 200 records and retrieves at most 18; there is no durable database index. Lexical matching does not understand arbitrary synonyms, negation or visual compatibility. The model interprets the brief after retrieval, but cannot select a useful garment that retrieval omitted or a combination outside the at-most-12 candidate plans. The eight guides are deliberately small and authored locally. Retrieval reasons explain selection; they do not verify every generated explanation. Authenticated ownership is not established by the current local app: “owned” means contained in the request’s validated wardrobe snapshot.

The first live development run of free-form item-ID generation returned one valid coffee look but no valid presentation look even though the wardrobe was feasible. That failure prompted the prevalidated-plan interface; the [original run is retained](../vision/results/rag-runs/2026-09-22T17-49-13-704Z.json).

The [final local development run](../vision/results/wardrobe-rag-development.json), recorded September 22, 2026, passed **2/2 styling cases and 2/2 retrieval checks** using the authored metadata of the seven photographed sample garments:

| Styling case | Valid looks | End-to-end time | Prompt bytes |
| --- | ---: | ---: | ---: |
| Coffee date, knit anchor, low-use requirement | 3 | 23,056 ms | 4,429 |
| Presentation, blazer anchor | 1 | 1,751 ms | 4,373 |

Each styling case offered eight prevalidated plans. The 187-item crowded-closet retrieval check passed in 25 ms; missing shoes were correctly rejected with `NO_COMPLETE_OUTFIT` in 11 ms. These are single-run integration checks, not a latency benchmark, held-out retrieval-accuracy estimate or fashion-quality study. They verify owned IDs, complete shapes, anchors, evidence and bounded context on the development cases; generated prose and wearer preference still require review.

The next useful evaluation is a labeled set of briefs over larger, reviewed real wardrobes, measuring relevant-item recall, required-slot coverage, constraint compliance and wearer preference separately. That should guide any later embedding or reranking work. Adding embeddings without this evaluation would add cost without establishing a better result.

## Technical references

The BM25 term-frequency and document-length normalization follow the form explained in [SQLite’s primary FTS5 documentation](https://www.sqlite.org/fts5.html#the_bm25_function). This implementation uses `log(1 + (N - df + 0.5) / (df + 0.5))` for positive inverse-document-frequency weights; SQLite documents a different IDF floor and score sign convention. BM25 is implemented directly here; this project does not add SQLite. JSON schema is supplied both as Ollama’s response format and in the prompt, consistent with [Ollama’s structured output guidance](https://docs.ollama.com/capabilities/structured-outputs).
