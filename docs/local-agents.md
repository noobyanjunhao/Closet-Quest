# Local garment and styling agents

Current recognition behavior and measurements: [pipeline v2](ai-pipeline.md). The dated smoke runs below remain historical evidence; v2 changes preprocessing, prompts and schemas while retaining the same model. Label text is now manual-only.

This experimental flow replaces filename classification with image inference and replaces wear-count ranking with a language-model stylist. It is not a claim of real-photo accuracy or human styling acceptance.

## Run

Install Ollama from https://ollama.com/download/windows or use its official standalone Windows archive. Run `ollama serve`, then `ollama pull gemma3:4b`. Start the app with `npm run dev`. The local API is part of the Vite development server; a static production build does NOT include it. Do not expose the development server publicly.

`CLOSET_MODEL` selects another installed vision-capable Ollama model when starting Vite. No training or fine-tuning is performed. On this laptop nvidia-smi reports an RTX 4060 Laptop GPU, 8188 MiB VRAM, driver 555.97. Verify actual offloading using `ollama ps` or `/api/ps`; GPU presence alone does not demonstrate GPU inference.

## Use

Add a garment and choose a real photo. The resized image goes only to the loopback Ollama runtime. Recognition proposes category, dominant color, pattern, apparent fit/material, occasions, style tags, readable label text and uncertainty notes. Review/edit before saving. Unknown brand stays unknown; visible label text is not authentication or product identification. This is not Google Lens, reverse-image search, segmentation, or verified fiber recognition.

Open Outfits, describe your occasion and preferences, and choose Local fashion agent. It receives garment metadata (not the photos), proposes up to three outfits, and explains color/silhouette/texture choices. Runtime validators discard unowned IDs, incomplete outfits, duplicates and quest violations. Context tags are soft preferences for this flow. Failures are explicit; the rules baseline is an optional, clearly labeled comparison, never a silent AI fallback.

## Validation status

The Sprint 3 synthetic results and PDF describe the OLD rules baseline and illustration comparison. They do not evaluate these agents. Unit tests cover output guards, not fashion quality. Real-photo and human preference measurements must be recorded separately. Use distinct garments split into development and locked test sets; do not tune prompts on test images. Brand evidence and subjective occasion labels require separate annotation. Record category/macro-F1, unknown rejection, corrections, latency, and model version; compare stylist acceptance with the frozen baseline on the same wardrobes.

API: GET `/api/status`; POST `/api/recognize` with `{image: dataURL}`; POST `/api/style` with `{items, request, requireLowUse}`. Requests are bounded and serialized, timeout at 180 seconds, use same-origin checks, and never grant the model tools or arbitrary network access. Model weights/runtime caches stay outside version control. Local browser wardrobe storage still has no account authentication.

References: https://docs.ollama.com/windows ; https://docs.ollama.com/capabilities/vision ; https://docs.ollama.com/capabilities/structured-outputs ; https://ollama.com/library/gemma3:4b

## Measured development smoke run (September 15, 2026)

`npm run agents:test` runs the two attributed Wikimedia photographs in `vision/real-photos` and one seeded-wardrobe styling request. `npm run agents:test -- --cpu` requests CPU inference. GPU mode used 3,029,157,806 bytes of model VRAM, CPU mode zero, as recorded by `/api/ps`. Model digest and predictions are in `vision/results/local-agents-{gpu,cpu}.json`.

| Request | GPU | CPU |
|---|---:|---:|
| Jeans photo | 3.124 s | 69.732 s |
| T-shirt photo | 2.463 s | 53.184 s |
| Styling | 7.288 s | 38.539 s |

Both photo categories were correct. This does not validate other attributes: the jeans color code was greenish despite a Light Blue description, and the T-shirt name was empty. Review is mandatory. Initial recognition failed hex-color validation; a schema pattern fixed formatting and the failure run is preserved. Styling can confuse garment relationships in its prose even when IDs pass structural checks. These are development smoke results, including different model-load and queue conditions, not a controlled speedup experiment or independent test set.

On this workspace, `npm run ai:start` launches the downloaded standalone runtime with project-local model storage. For a fresh checkout install Ollama and pull the weights first. The downloads are ignored by Git.
The stylist receives temporary G1/G2 aliases constrained by the output schema, then results map back to original wardrobe IDs. The alias mapping has a mocked-provider regression test; it does not establish fashion quality.

## September 21 photo workflow

The old sample-photo button is replaced by a seven-photo collection with in-app attribution. Photo analysis now uses the asynchronous `/api/jobs` queue, with explicit review and retry. See [photo workflow and measured results](photo-workflow.md). The expanded development smoke run includes failures: 6/7 completed analyses and 4/7 matching categories. Keep correcting suggestions manually; these results do not validate real-photo accuracy. `npm run ai:start` uses a Node launcher and does not change the Windows execution policy.
