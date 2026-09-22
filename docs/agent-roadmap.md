# Recognition and stylist agent roadmap

Research checked September 22, 2026. This is the original three-option roadmap. The user selected Plan A; see [the implementation record](plan-a-implementation.md) for what has since shipped, measured results and remaining work. The baseline descriptions below describe the earlier checkpoint, not today's complete implementation.

**Recommendation: simplify the product first, then build Plan A in stages.** Its biggest gains come from better item evidence, hybrid retrieval and learning from explicit corrections. Keep Plan B as an optional route for unresolved cases. Plan C becomes worthwhile after real feedback demonstrates where additional agents improve outcomes.

## What actually exists

The current code already has useful foundations:

| Area | Current implementation | Remaining gap |
| --- | --- | --- |
| Recognition | `server/recognition.js`: validated image decoding, resizing, blank-image rejection, Gemma 3 4B structured observations, deterministic type→category mapping, palette swatches, editable review | No segmentation, OCR pipeline, measured color, calibrated uncertainty or persistent observation history |
| Jobs | `server/jobs.js`: bounded serial queue, progress, cancellation, transient retries | Queue is lost on restart; recognition and styling need a shared resource scheduler for multiple models |
| Retrieval | `server/retrieval.js`: BM25, explicit synonyms, current corrected metadata, reviewed-item filtering, category coverage; ≤200 records → ≤18 items; eight authored guide cards | No dense embeddings, learned reranking, visual similarity or learned preferences |
| Styling | `server/outfit-plans.js` and `server/agents.js`: ≤12 prevalidated outfit plans; model chooses plan IDs and writes bounded prose; ownership/slots/anchor/low-use checks; 6,000-byte prompt budget | Candidate ranking is heuristic; explanation accuracy and aesthetic appeal are not established |
| Storage | Browser wardrobe persistence and saved outfits | No durable service-side asset store, database, account isolation or versioned retrieval index |

Recorded hardware is **RTX 4060 Laptop GPU, 8,188 MiB total VRAM**, from [local hardware evidence](local-agents.md). The [recognition development run](../vision/results/pipeline-v2-development.json) recorded Gemma `Q4_K_M`, 8,192 context, and 2,879,714,754 bytes of model VRAM. This is model allocation, not total process/GPU peak or currently free VRAM. Do not assume several new models can remain resident together.

Current development evidence is small: 7/7 category matches on seven reused photos, and [2/2 live styling cases](../vision/results/wardrobe-rag-development.json). Styling took 23.056 s for three coffee looks and 1.751 s for one presentation look in single runs. These are integration checks, not held-out accuracy, typical latency or wearer satisfaction.

## Product shape shared by all three plans

Keep the everyday interface to **Wardrobe, Outfits and Saved**. Adding a photo should lead to one review card: item, color, category and an expandable “More details.” An outfit request should ask for the occasion and an optional starting piece, then show large outfit photos, one short reason, Save and Swap. Put model names, retrieval scores, guide IDs, traces and evaluation tables in an optional “How this was made” panel or Lab.

For uncertain recognition, show the specific issue—“Which item should I use?” or “This label is hard to read”—with a crop or correction action. For styling, show only actions that change the result: “More relaxed,” “Different shoes,” or a brief clarification when requirements conflict. More complex internals should reduce work for the user, not add control panels.

## Three concrete alternatives

| Plan | Recognition + stylist architecture | Best fit | Main tradeoff |
| --- | --- | --- | --- |
| **A. Entirely local hybrid — recommended first** | Crop/mask + structured attributes; lexical and dense text retrieval + optional reranker; validated plans + one local stylist | Private, offline-first laptop app | Model loading and GPU scheduling need care; modest models may still abstain |
| **B. Local with optional cloud escalation** | Plan A locally; unresolved evidence or difficult plan selection gets a bounded cloud second opinion when enabled | Better handling of occasional hard cases without a large local model | Network, cost and an explicit external-data boundary |
| **C. Multimodal personalized agents** | Multiple item views + visual/text indexes; specialist retrieval, planner, critic and preference memory | A richer product with real repeat usage and feedback | Most engineering and evaluation work; more calls can be slower without being better |

### Plan A: improve the evidence and retrieval locally

**Recognition workflow.** Preserve the current original/normalized photo distinction. Add basic blur/exposure warnings, then ask for a box or point only when the target is ambiguous. Use **SAM 2.1 Hiera Tiny** for optional prompted masks; its official card supports point/box prompts and mask refinement. A mask identifies pixels, not garment category, material or authenticity. Retain the unmasked crop alongside the mask so thin straps, laces and patterned edges are not silently lost. [Meta model card](https://huggingface.co/facebook/sam2.1-hiera-tiny)

Keep installed Gemma as the baseline. Evaluate **Qwen3-VL-4B-Instruct** as a challenger for grounded attributes on the same crop and schema, rather than replacing the model because it is newer. Its official card documents image/text input and visual grounding/OCR capabilities. Quantized runtime compatibility and actual laptop fit must be tested; the published BF16 weights are not a promise of fitting in this GPU. [Qwen model card](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct)

For an optional separate label photo, evaluate **Florence-2-base** with its OCR-with-region task. Save literal text and quadrilateral evidence; require review before turning it into a brand, size or composition field. A logo or OCR string does not verify authenticity. Keep OCR disabled for ordinary garment photos until this evidence flow exists. [Microsoft model card](https://huggingface.co/microsoft/Florence-2-base)

Estimate a broad foreground palette from masked pixels, excluding obvious highlights/shadows, and keep the lighting limitation visible. Store color names and measurements separately; camera white balance prevents exact fabric-color claims. Fiber composition, physical fit on the wearer, condition and weather protection remain unknown unless explicitly confirmed. Use per-field states such as `suggested`, `needs_review` and `confirmed`; do not turn a model’s “90% confident” sentence into a probability.

**Stylist workflow.** Start with verified records → BM25 top 30 + dense top 30 → rank fusion → optional reranking of at most 24 → preserve anchor/required slots → ≤18 records → valid plan generator → one local selection/explanation pass. Retain deterministic constraints after reranking, so a similarity score cannot discard the only shoes or the required underused item.

Candidate dense encoder: **Qwen3-Embedding-0.6B**, whose card specifies text embeddings with configurable output dimensions. Candidate reranker: **Qwen3-Reranker-0.6B**, a separate query/document relevance model. Begin with 512-dimensional normalized garment-text vectors, and keep the reranker off until it demonstrates an incremental gain over fusion. General retrieval benchmarks do not establish fashion compatibility. [Embedding card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [reranker card](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B)

For hundreds of items, exact cosine search over stored vectors is adequate as an initial design; an external vector service is unnecessary. Preserve BM25 for exact garment names, brands entered by the user and specific exclusions. Parse hard exclusions into validated constraints rather than expecting embeddings to understand “not these shoes.” Keep explanations linked to selected garment facts and distinguish authored styling guidance from garment evidence.

**Deployment.** Move persistence and inference out of Vite middleware into a local service with SQLite metadata, an asset directory and a durable job table. A small Python worker can host the new vision/retrieval models while the existing Node API coordinates tasks; a full FastAPI migration can follow only if it simplifies operations. Load one large generator at a time; run cached embedding work or a small reranker on CPU when beneficial. Benchmark CPU, sequential GPU and model unload/reload before choosing placement. New-model latency is unknown.

### Plan B: keep local ownership, escalate only the difficult part

Use Plan A’s stored records, hybrid retrieval, masks and deterministic outfit plans. Add a router that distinguishes a poor input, an uncertain field and a hard styling brief. Blurry photographs should lead to a better-photo request, not an automatic cloud retry.

**Recognition escalation.** When enabled for the selected photo, send only a reviewed crop and the unresolved questions—for example, “shirt or lightweight jacket?” Return the same observation schema with evidence locations and a separate provider provenance record. Keep local and cloud suggestions side by side when they disagree; neither can overwrite a confirmed correction.

**Stylist escalation.** Send only shortlisted reviewed metadata, candidate plan IDs, relevant guides and explicit preferences. A cloud model selects/compares the existing plans; it cannot add garments. Start without photos. Allow a separate photo-based request only when the wearer wants visual reasoning and has chosen to share those crops. Validate selected IDs locally and preserve an explicit abstention rather than fabricating a fallback.

Current cloud candidates are **Gemini 3.5 Flash-Lite** for a low-cost extraction/selection experiment and **Gemini 3.8 Flash** for a more demanding second-opinion experiment. Their official pages list image input and structured output support. Benchmark them against the local baseline before enabling either route; API capability does not establish garment accuracy. Google currently limits 2.5 models to previous active users, so 2.5 is not a sound new-project default. [Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [current availability](https://ai.google.dev/gemini-api/docs/models), [structured output guidance](https://ai.google.dev/gemini-api/docs/structured-output)

Persist the provider/model identifier, transmitted asset hashes, purpose, user setting/approval event, token usage, cost and returned observation IDs. Keep credentials server-side and set per-request/day spending and timeout limits. A disabled cloud option sends nothing externally. Provider retention, account availability and current pricing must be checked before implementation; this roadmap makes no retention or dollar-cost guarantee. No uploads or cloud calls were made for this document.

**Choose this plan** if a measured local ceiling remains on useful difficult cases and optional external processing is acceptable. The added benefit must be measured on those cases, not inferred from model size or marketing benchmarks.

### Plan C: visual memory and a bounded specialist workflow

This extends Plan A rather than replacing its constraints with a conversation among unrestricted agents.

**Recognition specialists.** A target selector proposes regions; SAM refines the selected mask; an attribute worker uses the tested Gemma/Qwen challenger; an OCR worker handles a separate label crop; a deterministic evidence merger records agreements, disagreements and missing fields. Store multiple item views under one garment revision. Run only relevant workers, with a single bounded crop retry, and let the wearer resolve target disagreement.

Add **SigLIP2 base patch16 224** as a visual retrieval candidate. Its official card supports image/text retrieval and zero-shot classification. Index the approved garment crop separately from text metadata; use image similarity for “more like this shape/texture” and duplicate-photo suggestions, not as proof of matching material, identical product or successful outfit compatibility. Keep each embedding family in its own space. [Google model card](https://huggingface.co/google/siglip2-base-patch16-224)

**Stylist specialists.** A brief parser extracts editable hard/soft requirements. A retriever fuses BM25, text vectors, optional visual vectors and explicit preference memory. A planner constructs valid options and a selector ranks them. A critic checks only concrete claims against supplied evidence and detects missing requirements; it may reject or request one revision, never invent items. Deterministic validators remain the final authority. These roles can share one model sequentially; seven roles do not require seven resident models.

Start personalization with explicit “prefer this / not for me / too formal” events and user-entered preferences. Fit a small regularized preference ranker only after enough within-user comparisons exist, using a transparent default before that. A worn/saved outfit is useful but ambiguous feedback; a skipped outfit is not automatically disliked. Store and expose editable preference memory, and decay situational feedback. Never infer attractiveness, body judgments or sensitive traits from photos.

Bound runtime to one selection call, at most one critic call and at most one repair; return partial progress or a clear failure on budget exhaustion. Compare this against the simpler selector with an ablation test. Deploy visual indexing in background batches; schedule vision, reranking and generation sequentially on the recorded 8 GB-class GPU. Larger remote GPU workers are a later deployment choice, not assumed capacity on this laptop.

## Shared persisted records and correction rules

These are proposed schemas, not existing database tables:

| Record | Essential contents |
| --- | --- |
| `Asset` | Owner, original/normalized hash, dimensions, local storage reference, crop coordinates, optional mask reference, preprocessing version, permitted processing destinations |
| `Observation` | Asset revision, field/value, evidence region or literal OCR span, worker/model/version/digest, prompt/schema hashes, timestamp, latency, raw output reference, review state, uncertainty method |
| `GarmentRevision` | Garment ID, owner, current field values and source observation IDs, confirmed fields, review status, revision number |
| `EmbeddingRecord` | Garment/asset revision, embedding model revision, dimension, normalization/metric, vector, metadata hash, indexing status; text and image spaces stored separately |
| `StylingRun` | Wardrobe revision, brief/constraints, retrieval branch ranks, fused/reranked IDs, guide versions, candidate plans, selected plans, field-level evidence, model/runtime versions, timing, optional external cost |
| `FeedbackEvent` | Explicit user action, outfit/item references and revisions, reason, context, timestamp; separate observed wear/save events from stated preference |

A correction creates a new garment revision; it never rewrites the historical model observation. User-confirmed fields win over later suggestions. Invalidate that record’s text vector, affected plan cache and preference features; invalidate image vectors only if the approved crop/image changed. Apply ownership and current-review filters before retrieval, and verify revisions again before publishing a delayed result. Until reindexing finishes, use current lexical metadata for that record rather than its stale vector. Deleting an item also removes its searchable vectors and excludes it from future plans.

## Evaluation gates before rollout

The following numbers are **proposed release targets**, not achieved results or statistical guarantees. Build a garment-disjoint development/locked-test split—for an initial pilot, about 200 distinct items plus non-fashion and ambiguous-scene negatives. Include shoes in pairs, bags, layered scenes, dark/white items, clutter, varied lighting and label close-ups. Report class counts and uncertainty; small slices cannot establish precise reliability.

| Stage | Gate and measurement |
| --- | --- |
| Recognition | Compare category macro-F1 and per-field accuracy against unchanged Gemma; target ≥0.90 category macro-F1 with no material class regression. Track correction rate, false confident suggestions, unknown rejection and mask target errors separately. OCR uses character error rate on annotated label crops. |
| Confidence | Keep scores internal until calibrated on a separate set. For any future high-confidence autofill, target ≥97% observed precision with interval and coverage reported; otherwise label it a suggestion. Never use agreement between two models as a calibrated probability. |
| Retrieval | On ≥60 labeled briefs across several wardrobe sizes, target ≥95% relevant-item recall@18 and 100% retention of feasible required slots/anchors. Compare BM25, dense-only, fusion and fusion+reranker; measure negation and changed-record freshness explicitly. |
| Planning/prose | Zero ownership, review-state, shape or explicit-constraint violations in generated/property tests. Report empty-result rate separately so refusing everything cannot appear successful. Human-review claim support and blind preference against the current planner. |
| Operations | Record cold/warm p50/p95, model load time, queue wait, peak total VRAM/RAM and cancellation time. Initial warm targets: preview ≤2 s, recognition ≤15 s, styling ≤30 s at concurrency one. These are measurement gates, not latency promises; simplify or disable the added stage if it misses without a clear quality benefit. |
| Optional cloud | Measure hard-case correction/acceptance gain, escalation rate and actual cost per accepted result. Test disabled mode, timeouts and withdrawal of sharing permission. |

Use the same locked cases and versions across candidates. Separate artifact/schema correctness from recognition accuracy, retrieval relevance and subjective style preference. Preserve unsuccessful runs. A model-card benchmark or the current seven photos cannot substitute for these gates.

## Rollout order

1. **UI first:** one upload/review path and one outfit brief, large photos, obvious Save/Swap, diagnostics collapsed. Keep the current agents during this work.
2. **Durability and evidence:** local asset store, job persistence, garment revisions, correction provenance, feedback events and a locked evaluation set.
3. **Plan A retrieval:** cached text embeddings alongside BM25, then reranking only if its ablation wins. Preserve current plan constraints and inspectable evidence.
4. **Plan A recognition:** manual target crop, optional SAM masks, model challenger evaluation; add label OCR last with its separate review flow.
5. **Choose the next branch from evidence:** Plan B for rare unresolved cases with optional sharing; Plan C for measurable visual retrieval/personalization needs after repeated real use. Avoid adding both before their benefits are demonstrated.

The practical next agent milestone is **a durable, corrected wardrobe that retrieves the right pieces**, rather than more autonomous model calls. That foundation improves all three alternatives while keeping the product simple.
