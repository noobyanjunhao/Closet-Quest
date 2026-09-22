# Recognition pipeline v2 — September 22, 2026

The local photo pipeline now identifies a specific item type, derives a consistent wardrobe category, and returns suggestions for human review. It uses the existing `gemma3:4b` model. This increment refines prompts, schemas, preprocessing and job handling; it does not train or replace model weights.

## Processing

1. **Prepare.** Decode JPG/PNG/WebP bytes with Sharp; verify MIME against actual format, reject animation, dimensions under 48 px and inputs above 40 megapixels. Enforce a 6 MB decoded-byte limit (the browser accepts an 8 MB original and resizes it first). Normalize EXIF orientation, flatten transparency on white, strip metadata, and resize to at most 1,000 px. Reject essentially uniform pixels (`max − min ≤ 1` in every channel) with `EMPTY_IMAGE`. This deliberately conservative check is not an object detector or background remover.
2. **Recognize.** Send normalized pixels to local Ollama with a bounded structured schema, temperature 0 and seed 42. Identify the primary item, a matching footwear pair, a dominant item in a scene, or an ambiguous/unrelated scene. No expected test labels, source filenames or sample IDs are sent. A fixed seed reduces variation; it is not a reproducibility guarantee across runtime/hardware changes.
3. **Validate.** Validate every field and reject unknown/ambiguous targets. Map the item type to a category instead of asking the model to produce both independently. Map the color family to a representative hex palette so color name and swatch agree. This does not measure true fabric color. Fit, texture and occasions remain unverified suggestions. Restrict occasion suggestions to the three supported app contexts.
4. **Review.** Store suggestions separately. Show the selected target and review notes before application. Applying suggestions fills the form; saving accepts the user's corrections. Never generate or overwrite label text. Existing manually entered labels survive application. Late poll responses cannot revive a cancelled/reviewed job or attach to a replaced photograph.

Successful results retain pipeline version, prompt/schema hash, input and normalized-image SHA-256, normalized dimensions, per-stage durations, model name and token count. Results contain no image bytes. Model digest and GPU residency are recorded separately by the evaluation harness.

The queue reports `stage`, `attempt`, `maxAttempts` and typed `errorCode`. It retries explicitly transient transport/overload failures once with a short abortable backoff. Validation failures, invalid images, ambiguous subjects and model timeouts are not automatically retried. Cancellation aborts in-flight work and prevents retries; client polling recovers from temporary connection failures. The queue serializes inference, holds at most eight unfinished photos, limits retained records, and expires terminal results after 30 minutes. It is still in memory: a restart requires resubmitting unfinished work.

## Measured evidence

| Check | Original pipeline | Revised pipeline v2.1 |
| --- | ---: | ---: |
| Structured results from seven real photos | 6/7 | 7/7 |
| Intended category matched | 4/7 | 7/7 |
| Generated blank image | Not tested | Rejected before inference |

The same seven demo photographs were used to debug and evaluate the changes. This is a development regression check, **not held-out accuracy**. In particular, neither Dress nor broad unrelated-object rejection is evaluated by these seven photos. Colors, materials, item details and subjective suitability are not independently scored.

- Sneakers are now accepted as a pair. Trousers map to Bottom and the tote maps to Accessory.
- The first v2.0 run still hallucinated a white sweater in a blank image. Its failed control remains in `vision/results/pipeline-runs/2026-09-22T04-44-44-563Z.json`. This led to the deterministic uniform-pixel guard in v2.1; the prompt itself was unchanged between those runs.
- v2.1 completed the seven photos in **3.0–5.0 seconds**, including 250 ms polling; acceptance took **11–26 ms**. The blank control returned `EMPTY_IMAGE` in 271 ms including polling. These are individual local measurements, not service-level targets.
- Preserve the slow case: the first v2.0 request took **90.7 seconds**, with its other real photos at **3.6–4.2 seconds**. This was not a controlled cold/warm-start benchmark; runtime conditions differ.
- Descriptions still hallucinate details. The v2.1 sneakers were described as having a stacked heel; the jacket description claimed a lining. Matching a broad category does not make the rest of the answer trustworthy. Human review remains necessary.

The original `vision/results/photo-collection-smoke.json` remains unchanged. Every new run is archived under `vision/results/pipeline-runs/`; `pipeline-v2-development.json` holds the most recent run shown in Lab. Model digest remained `a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a` with GPU residency reported by Ollama. Expected categories are used only by the scoring script.

## Reproduce

```sh
npm run ai:start
npm run dev
# In another terminal:
npm test
npm run pipeline:evaluate
npm run build
```

`npm run photos:test` is an alias for the new evaluator. It checks the API pipeline version and image hashes, archives successes and failures, cancels retained jobs after reading them, and exits nonzero on any category/control failure. A generated blank control is scored separately from the photographs.

31 automated tests cover pipeline decoding, taxonomy and palette constraints, invalid responses, abstention codes, blank-image rejection without model invocation, preservation of pale image detail and manual labels, queue retry/cancellation, plus the existing wardrobe and outfit rules. Browser checks cover cancellation followed by re-analysis, review/application, label preservation, persistence, and Lab presentation.

## Next validation and infrastructure work

Use an independent collection spanning all categories, clutter, occlusion, matching pairs, ambiguous multi-item scenes and unrelated objects. Keep alternate views of one garment in the same split. The design's planned 120 distinct garments and locked split remain outstanding; do not train or select prompts on the locked test set. Evaluate attribute corrections and unknown rejection separately from category matches.

Background removal, durable workers, authenticated FastAPI endpoints, PostgreSQL and private image storage remain future work. This implementation processes photos locally and keeps the existing browser data workflow. Production deployment requires that backend work; the static build alone has no inference API.

Implementation references: Ollama's [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) and [vision input](https://docs.ollama.com/capabilities/vision) documentation, and Sharp's [input validation/metadata API](https://sharp.pixelplumbing.com/api-input/).
