# Core technology implementation and evaluation

**Closet Quest | 27 September 2026 | Rubric: implementation 50%, evaluation 30%, analysis 20%.**

## Working implementation (50%)

The central capability turns reviewed garment photos into complete, owned outfit suggestions. The app now supports camera preview, capture, retake, a native mobile capture input, and batch upload. Imports immediately enter a sequential review flow. Recognition prefills an untouched form; manual edits and replaced photos are protected. Reviewed pieces can be styled while other images are processing. Primary navigation stays Closet, Stylist, Saved looks; resale and technical details stay under More.

Recognition uses local Qwen3-VL 4B Q4_K_M, validated image decoding and normalization, structured attributes, durable jobs, cancellation, bounded retries and explicit human review. This sprint retains that working recognition pipeline and improves its entry and review flow.

Recommendation follows **request → retrieval → valid plans → provider selection → validation → evidence and response**. BM25 and explicit synonyms handle lexical retrieval; optional local Qwen3 text embeddings add dense cosine ranking and reciprocal-rank fusion. Category coverage, review state, owned IDs, optional anchors and low-use requirements constrain the shortlist (at most 18 of 200 records). The planner enumerates valid combinations and retains up to 12 diverse plans. A provider can select only those plan IDs; a second validator rejects invalid or duplicate selections. Displayed AI titles are derived from selected wardrobe records after a live title hallucination was found.

The server exposes Auto, Quick, OpenAI and Local modes. Auto chooses OpenAI when a server key exists, otherwise Quick. Quick is **lexical retrieval plus deterministic planning, not generative AI**. OpenAI uses the Responses API, the pinned `gpt-4.1-mini-2025-04-14`, strict JSON schema, `store:false`, a 1,200-token output limit and a 15-second deadline. It receives reviewed descriptions and the brief, not images, profile or label text. Local uses Gemma 3 4B with a 45-second generation deadline. Semantic retrieval has a six-second interactive budget and falls back to BM25. Provider failure returns explicitly labeled Quick results without a second retrieval pass; valid model abstention is respected. These are service budgets, not guaranteed wall-clock SLAs.

The former UI called retrieval and then styling, which retrieved again. The new request retrieves once. A bounded 512-entry memory vector cache supplements the disk cache; keys include normalized text, model digest, dimensions and schema version. Edits and model changes invalidate vectors. Cached vectors contain no raw photos. Concurrency permits up to two non-local styling requests while serializing local generation with photo inference. Cancellation propagates to model requests.

The Depop adapter uses the official, private Selling API: authenticated own-shop inspection and paginated listings. It defaults to staging, uses fixed official origins and server-only bearer keys, rejects redirects, bounds requests and distinguishes missing access from a connected shop. The UI offers local listing drafts and export today. **No Depop credentials were available: live connection and publishing are not demonstrated.** Publishing, marketplace search, OAuth onboarding and inventory synchronization are not implemented.

The supplied technical design's interface, services, async processing, AI, storage and external-system layers are represented by React, the local Node API, durable jobs, recognition/retrieval/planning, browser/disk persistence and provider adapters. FastAPI, Expo, PostgreSQL/pgvector, private cloud object storage, authentication and container deployment remain integration work. This is a functioning local core prototype, not the full designed cloud system.

## Evaluation and baseline comparison (30%)

### Common structural oracle: 30 frozen synthetic wardrobes, 180 requests

The independent oracle checks owned, reviewed, unique, complete outfits and low-use constraints. It does not call production planning or validation helpers. There are 132 structurally feasible requests and 48 impossible requests. The same requests are passed to all three actual implementations. Occasion tag compatibility is measured separately because Assignment 3 treated tags as hard constraints whereas v2 treats them as preferences.

| Metric | Original v1 | Assignment 3 | Quick RAG v2 |
|---|---:|---:|---:|
| At least one valid result, feasible requests | 132/132 | 98/132 | 132/132 |
| Correct abstention, impossible requests | 36/48 | 48/48 | 48/48 |
| Invalid returned outfits | 104/432 | 0/263 | 0/366 |
| Owned outfits | 432/432 | 263/263 | 366/366 |
| Duplicate suggestions | 36 | 0 | 0 |
| Exact occasion-compatible outfits | 178/432 | 263/263 | 259/366 |
| In-process median / P95 | 0.008 / 0.026 ms | 0.013 / 0.071 ms | 2.008 / 4.330 ms |

Timing is one sequential sample per request, including first-use initialization, on Windows/Node 24.19, AMD Ryzen 9 8945HS. The very small rules timings are approximate. The new pipeline is **slower than simple rules**, although its end-to-end Quick path remains interactive. The broader structural coverage comes with lower exact occasion compatibility (70.8% vs 100%); it does not establish superior recommendations. Under the retained Assignment 3 strict occasion oracle, the historical feasible denominator is 98, with 98/98 successes for its prototype. The changed denominator above must not be presented as a replication of that earlier metric.

### Live runtime measurements

| Probe | Observed result | Scope |
|---|---|---|
| Authored semantic recall@18 | BM25 1/8; hybrid 8/8 | Eight reused 64-item development cases; existing disk vectors; no reranker |
| Warm retrieval overhead, 10 alternating pairs | Two passes median 29.97 ms; one pass 10.71 ms | Same process, case and cache; excludes generation; no claim of 2.8x overall app speed |
| Quick `/api/style`, 10 requests | Median 15.12 ms; max 16.08 ms | Local HTTP, seven public sample records; no LLM |
| Local AI, first/second request | 25.83 s / 8.24 s | Two samples only; first embedding miss exceeded six seconds and fell back to lexical retrieval |
| OpenAI | Not run: no API key | Mocked contract tests are not cloud validation |
| Depop | Not run: no approved key | Adapter contract and missing-access behavior tested |

Retained recognition development evidence: seven reused Wikimedia garment photos matched seven expected categories after iterative debugging. They are not a held-out test set. The live local style probe produced valid selected plans but one title referred to a tee absent from that plan; this observation prompted deterministic titles. Free-form explanation correctness remains unmeasured.

**Verification:** 91 application tests, 8 ML checks and 5 Python LoRA-preflight tests passed (104 total); production build passed. Added checks cover one retrieval pass, provider errors, refusal/incomplete output, invalid IDs, timeout, cancellation, photo/profile exclusion, Depop pagination/auth, late camera permission resolution, track cleanup, protected manual edits and vector invalidation. Camera device capture needs a physical-device test; lifecycle tests do not establish hardware compatibility.

Reproduce: `npm ci`, `npm test`, `npm run ml:test`, `python -m unittest discover -s ml -p test_lora.py`, `npm run core:evaluate`. For live measurements, start `npm run ai:start` and `npm run dev`, then `npm run core:live`. Read `experiments/results/core-v2.json` and `experiments/results/live-core-v2.json` for raw results and protocols. The live script uses only public sample metadata, may incur two OpenAI calls if configured, and keeps current disk-cache conditions visible.

## Technical analysis and integration priorities (20%)

1. **Cold-model cost remains material.** A missing query embedding exhausted the six-second budget. Fallback maintains availability but can lose semantic recall. Next: background indexing after review, smaller measured embedding models, latency distributions for cold/warm 50/100/200-item closets, and a bounded worker queue rather than longer synchronous waits. Recognition's 20-second target and generative recommendation P95 are not established here.
2. **Structural validity is not style quality.** ID and shape validation cannot prove color harmony, season suitability, fit or truthful prose. Deterministic titles address the observed title error; explanations still need a claim-to-garment audit. Add a strict occasion option and explicit weather/availability metadata before treating those as hard constraints.
3. **Evidence is small and reused.** Synthetic wardrobes and eight authored retrieval probes can overestimate performance. Recruit consented testers; freeze at least 50 diverse phone photographs and 50 unseen briefs before further tuning. Measure category macro-F1, per-attribute accuracy, correction time, Recall@18/NDCG, invalid outfit rate, top-three wearer acceptance, fallback rate and P50/P95 latency. Include clutter, dark lighting, multiple garments, footwear pairs, accessories, missing categories and style vocabulary shifts.
4. **Learning is prepared, not claimed complete.** The experimental pairwise ranker was trained on synthetic data and remains off by default. Correction/feedback collection and offline QLoRA preparation exist. No language/vision adapter was trained; sufficient eligible, consented real data is still missing. Split by garment/person/wardrobe, retain a frozen evaluation set, and require a quality/latency improvement over the untuned model before activation.
5. **Integration prerequisites are concrete.** Supply server credentials to verify OpenAI costs/latency/faithfulness and approved Depop read access. Depop publishing additionally needs real sale photos, seller-reviewed condition/size/price/shipping, taxonomy mapping, hosted image URLs and explicit listing confirmation. Before hosting private wardrobes, implement account isolation, server-owned records, authorization tests, encryption/retention rules, image and vector deletion, and durable remote storage. Local vector caches currently need a retention/deletion policy; browser garment deletion does not purge every historical cache vector.
6. **Camera and storage need device coverage.** Test iOS Safari/Android Chrome permissions, orientation, capture/retake, backgrounding and no-camera states. This desktop browser cannot certify mobile hardware capture. JPEG/PNG/WebP up to 8 MB are supported; HEIC is not. Browser storage is limited and not cross-device backup. The app provides export and clear storage errors, but larger wardrobes need object storage.

## Sources and deliverables

- [Repository](https://github.com/noobyanjunhao/Closet-Quest); `output/demo/index.html` and `docs/core-demo.md` contain the demonstration.
- User-supplied *Closet Quest Technical Design Document*, 17 September 2026, pp. 1-6; retained Sprint 3 report in `output/pdf/`.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), reviewed 27 September 2026.
- [Depop authentication and private access](https://partnerapi.depop.com/api-docs/concepts/authentication/), [official OpenAPI specification](https://partnerapi.depop.com/api-docs/openapi.yaml), reviewed 27 September 2026.

Course upload is manual. The submission bundle contains the source, raw measurements, demonstration and concise PDF report; it excludes credentials, model weights, browser wardrobes and local jobs.
