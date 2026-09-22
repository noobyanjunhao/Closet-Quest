# Plan A implementation

September 22, 2026. Local-first implementation following the selected roadmap. The app uses a simpler fashion-editorial interface and a richer internal pipeline.

## Product design and style references

The [reference study](platform-style-research.md) examines official COS, Zara and UNIQLO pages. Closet Quest applies general principles: spacious garment photographs, quiet browsing controls, a small editorial introduction, and color/layering ideas. These are original design and styling interpretations. Retailer images, catalogs and customer data were not collected for model training.

## Running pipeline

1. **Recognition:** validated image decoding, EXIF removal, optional API target crop, blank-image rejection, Qwen3-VL 4B Instruct Q4 structured visual observation, deterministic category mapping, then explicit review. Gemma3 4B remains the stylist; model roles are configurable independently. Persisted photo jobs survive restarts; photos are removed when processing ends. Cropping is an API capability; a crop editor and segmentation remain future work.
2. **Retrieval:** current reviewed metadata → BM25 lexical search and Qwen3 Embedding 0.6B text vectors → reciprocal-rank fusion → a maximum of 18 items with complete outfit slots and required anchor/rediscovery pieces. The embedding model runs on CPU to preserve GPU memory. Cache entries include model digest, dimensions and content hashes; changed descriptions invalidate vectors.
3. **Planning and generation:** bounded complete outfit candidates → local model selects plan IDs and explains choices → deterministic ownership, slot, anchor and low-use validation. Model output cannot introduce invented garments. If embeddings are unavailable, the response explicitly reports lexical fallback.
4. **Learning:** explicit reviewed corrections and like/dislike feedback → allowlisted local metadata → deduplication and grouped dataset export. Sample data is separately marked. Names, photos, labels, profiles and raw styling briefs are excluded from the learning log. Hashed IDs are pseudonymous, not anonymous.
5. **Training:** a real small pairwise ranker has been trained on authored synthetic fixtures. Its learned weights are experimental and disabled in live ranking by default. The offline NF4 QLoRA runner is implemented with LoRA adapters, gradient accumulation/checkpointing and held-out loss comparison, but no adapter has been trained or deployed without suitable real examples.

## Measured evidence and limits

- [Hybrid development run](../vision/results/hybrid-retrieval-development.json): target recall at 18 candidates was 8/8 versus BM25's 1/8 across eight authored vocabulary-mismatch requests. Final cached total was 413 ms; the first cold/partly-cached run took 49.57 s and found 7/8. These cases were used during refinement, so they are not an independent test set.
- [Ranking artifact](../ml/artifacts/ranker.json): synthetic held-out NDCG@5 improved from approximately 0.884 to 0.997. Labels measure authored occasion/category/rediscovery relevance, not fashion taste. This does not establish improvement over the live hybrid retriever.
- [Vision comparison](../vision/results/plan-a-development.json): the explicit Instruct Q4 model returned 7/7 valid analyses and 7/7 category matches on seven reused demonstration photos. Mean elapsed time was 6.10 s including a 17.19 s first call; later calls took 3.83–5.63 s. The generic `qwen3-vl:4b` tag was a thinking variant and failed the bounded structured-response workflow; both failure runs are archived. The explicit Instruct variant is now the recognition default. This establishes compatibility, not superior accuracy or speed versus Gemma, and garment colors still need review.
- Model promotion, personal preference quality and visual attribute accuracy require a larger garment-disjoint real dataset. Fine-tuning photo recognition additionally requires an approved image dataset; the metadata-only export cannot train visual perception.

## Commands

```powershell
npm run ai:start
npm run ai:setup
npm run dev
npm test
npm run ml:test
npm run rag:hybrid
npm run ai:evaluate
npm run ml:train
npm run ml:prepare
```

`npm run ml:train` reproduces only the small synthetic ranking experiment. `npm run ml:prepare` exports private grouped text datasets and a readiness manifest; it does not train a language model. See [ML instructions](../ml/README.md) for QLoRA prerequisites and explicit training commands. The app's **More → AI lab** shows installed models and current learning counts. **Settings** can disable new learning events.

For a built local app with the same API, use `npm run build` then `npm start`. `npm run preview` is static Vite preview and does not provide the AI API. Stop the development server before starting a production server against the same job directory, or set a separate `CLOSET_JOB_DIR`. Services bind to loopback, and wardrobe data is not uploaded to a cloud model.

## Still to implement and validate

Foreground segmentation, visual embeddings, measured color, calibrated uncertainty, field-specific OCR, multi-user identity/storage, real preference learning, image adapter training and a separately held-out fashion-quality evaluation remain future work. Adding more models is useful only when an evaluation shows improvement worth the latency and memory cost.

## Integration verification

80 application tests, 8 ranking/learning checks and 5 dependency-free QLoRA preflight tests passed; the production build passed. HTTP tests cover durable restart, cancellation, same-origin access and serving the built UI with the API. Browser checks covered desktop and 390-pixel layouts, three live hybrid-stylist results, explicit feedback capture and Lab readiness. A mobile heading collision was fixed and visually rechecked. The sample feedback was recorded as one sample event, with zero eligible real examples.

The running development service was restarted and confirmed to report the Qwen Instruct recognizer, Gemma stylist and Qwen embedding model as installed. A live queued Qwen photo request was acknowledged in 26 ms and completed in 18.15 s including model loading and polling. The original browser wardrobe remained at 15 pieces; QA used a separate localhost origin.
