# Closet Quest

A responsive wardrobe app prototype for the Closet Quest semester project, maintained in `noobyanjunhao/Closet-Quest`.

## Personal RAG and model providers - October 2

The current extension adds **photo provider → reviewed wardrobe → personal preferences + document retrieval → owned outfit plan → model selection → validation → saved/worn history and feedback**. Open **More → My style & memory** for three tabs: **My style**, **Knowledge**, and **History**. The earlier measurements below describe the first local rehearsal; fresh evidence is in `output/sprint6/advanced/`. The current suite passes 143 tests. Live OpenAI recognition took 3.925 s versus 26.727 s locally on one public tee; the optimized browser stylist displayed 6.6 s. These are small development samples, not latency guarantees.

- **My style:** choose styles, colors, fit, priorities, color exclusions and a short personal note. The color exclusion uses reviewed color labels; preference and feedback boosts are bounded ranking adjustments. They do not train a model. Photo recognition and outfit recommendations have independent provider selectors. OpenAI profiles are **Fast**, **Balanced**, and **Deep**; the server resolves their model names and optional per-task overrides. Profiles affect OpenAI, while local model names remain server configuration.
- **Knowledge:** import/paste `.txt` or `.md` notes (up to 20,000 characters), then inspect retrieved excerpts and sources. SQLite stores documents, overlapping passages, vectors and index identity under the wardrobe UUID in `.local-data/knowledge/`. Four project-authored starter guides begin with keyword search. **Semantic search settings → Build semantic index** explicitly indexes them; import also attempts indexing. Up to 24 documents, including the starter guides, are supported. Choose the same local/OpenAI embedding provider for indexing and search; the saved preference also governs styling retrieval. Provider/model/dimension/schema mismatches fall back to keyword search rather than compare incompatible vectors.
- **History:** retain up to 100 recommendation runs in the current browser, including provider/model, elapsed time, owned outfit IDs, chosen/saved/worn actions, and **Works for me / Not my style** feedback. A bounded recent feedback window can affect later retrieval scores. History is local and is separate from the optional training-data log.
- **Recognition:** both providers use the same image normalization, structured output checks and human review. A bounded, ten-minute, wardrobe-scoped in-memory cache reuses validated observations for an identical photo/provider/model/prompt configuration. A cache hit is reuse, not new inference. Image jobs still pass through the queue; a cloud model is not a promise of lower end-to-end latency.

Wardrobe retrieval combines lexical matching and optional local embeddings. Document retrieval is a separate store with local or OpenAI embeddings, bounded search, keyword fallback and traceable excerpts. The prompt contains bounded wardrobe facts, preferences, retrieved guidance and server-created outfit plans. Document content is treated as untrusted context. The model selects plans; final validation checks owned/reviewed IDs, completeness and the anchor. **Quick** uses deterministic ranking/planning; **Automatic** selects OpenAI when configured and Quick otherwise. An AI failure can return clearly labeled Quick results.

React and the Node API are retained to keep the existing tested UI and shared schemas. The earlier measured wait was concentrated in model inference; changing frontend language alone has no demonstrated latency benefit. Provider adapters, persistent retrieval, time budgets and cache provenance are the useful separation points now. Authenticated cloud services remain future integration work.

### Configure providers

Use Node.js 24.x (this workspace reports 24.19.0); the document store uses built-in `node:sqlite`. Install with `npm ci`. For local inference, follow [local model setup](docs/local-agents.md), run `npm run ai:start`, and install the configured models in advance. A platform website login does not configure server API access.

If `.env.local` does not exist, copy `.env.example` to it. Edit the server-only, git-ignored file privately; never print, commit, paste into browser fields, or prefix secrets with `VITE_`.

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables the OpenAI API adapters; model access, billing and request success must still be checked |
| `CLOSET_OPENAI_RECOGNITION_MODEL` | Optional server override for the photo model; blank uses the selected profile |
| `CLOSET_OPENAI_RECOMMENDATION_MODEL` | Optional server override for the stylist model; blank uses the selected profile |
| `CLOSET_OPENAI_EMBED_MODEL` | Document embedding model; defaults to `text-embedding-3-small` |
| `CLOSET_RECOGNITION_MODEL`, `CLOSET_STYLIST_MODEL` | Local Ollama model overrides |

Restart the app server after changing configuration. `/api/status` reports configuration/readiness and profile model names without returning the key. `openai.configured: true` means a key is present, not that a paid request has succeeded. OpenAI controls stay disabled when no key is configured.

Photo recognition sends the normalized image to OpenAI only when that provider is selected. OpenAI styling sends reviewed descriptions, preferences, the brief and selected reference excerpts; it does not send garment photos or the display name. OpenAI indexing sends document text; selected OpenAI retrieval sends queries and reviewed garment descriptions. Unchanged garment vectors are cached for ten minutes in a bounded wardrobe-scoped memory cache. Local providers process these inputs on the local service. SQLite wardrobe namespaces are data organization, **not authentication or access control**; do not expose this prototype as a secure multi-user service.

### Current API and checks

`GET /api/status`; `POST /api/jobs` and job polling/cancel; `POST /api/recognize`, `/api/retrieve`, `/api/style`; and `POST /api/knowledge/list`, `/api/knowledge/documents`, `/api/knowledge/delete`, `/api/knowledge/search`, `/api/knowledge/reindex`. Knowledge requests carry `wardrobeId`; embedding operations accept an explicit `embeddingProvider`. The UI supplies bounded preferences and feedback on styling requests. API keys never belong in client request bodies.

```sh
npm test
npm run build -- --configLoader runner
node scripts/evaluate-alpha.mjs
```

The alpha evaluator needs the API on port 5173. `node scripts/evaluate-advanced.mjs --live` is the separate bounded live-provider evaluation: it sends checked-in public photo/sample notes to configured OpenAI services and writes `output/sprint6/advanced/`. Review actual results, cache labels and failures before updating claims. Never substitute mocked provider tests for live performance evidence.

## Initial Sprint 6 local rehearsal - October 2

The verified core journey is **real photo → local analysis → human review → owned-item styling → save → quest XP → wear/reload/undo**. Open `http://127.0.0.1:5173/?demo=sprint6` for an isolated, resettable six-piece rehearsal wardrobe, then upload `public/photos/tee.jpg`. This mode disables learning and uses its own browser storage key.

[Integration report](output/pdf/Closet-Quest-Sprint-6-Integration-Report.pdf) · [Requirement matrix and work plan](docs/sprint6-plan.md) · [Five-minute rehearsal guide](docs/sprint6-demo-guide.md) · [Actual screenshot gallery](output/sprint6/index.html).

Recorded before the advanced extension: **100 tests passed, production build passed, 8 integration checks passed**. The browser's live tee recognition took 24.903s and local styling displayed 19.7s. Ten Quick HTTP requests had a 14.275ms median. These are development samples, not independent accuracy or acceptance claims. Run `node scripts/evaluate-alpha.mjs` while the local API is serving to reproduce the integration checks.

Daily identical-outfit wear protection now works across Stylist and Saved looks, and saved looks reject unreviewed pieces. Corrupt images offer manual recovery. The report explicitly records missing cloud auth/storage, unverified camera/backup download, and absent independent quality evaluation. The sections below retain earlier sprint history; use the Sprint 6 report for current evidence and limitations. A successful GitHub push is not implied by this local update.

## Core prototype update - September 27

**Photo → review → style → save.** Add clothes now offers camera preview, capture/retake, native mobile capture and batch photo selection. Review opens immediately, and AI suggestions prefill only untouched fields. Quick and OpenAI recommendations can run while local photos are still analyzing.

The recommendation API retrieves once, builds complete owned outfit plans, selects via OpenAI/local AI/Quick, then validates. Auto uses OpenAI when configured and Quick otherwise. Quick is lexical retrieval and deterministic planning, not an LLM. Six-second wardrobe embedding, twenty-second OpenAI and forty-five-second local-generation budgets provide explicit fallback; bounded memory vectors reuse the existing digest-aware disk cache. OpenAI styling receives reviewed descriptions, preferences, the brief and selected reference excerpts, with `store:false`.

Copy `.env.example` to `.env.local`, configure `OPENAI_API_KEY` and/or an approved `DEPOP_API_KEY`, then restart. Keys stay on the server. The official Depop adapter can check your own shop and read paginated listings; access requires Depop partner approval. Draft/export works without access. No listing is automatically published. Live OpenAI and Depop validation was unavailable on September 27 because no keys were configured.

**Submission:** [Concise core evaluation PDF](output/pdf/Closet-Quest-Core-Technology-Report.pdf), [full analysis](docs/core-evaluation.md), [demonstration guide](docs/core-demo.md), and [offline visual walkthrough](output/demo/index.html). Run `npm run core:evaluate` for the frozen baseline comparison and `npm run core:live` for live measurements (two OpenAI calls if configured). Raw results are in `experiments/results/core-v2.json` and `experiments/results/live-core-v2.json`.

The 180-request common structural evaluation returned zero invalid outfits with v2, but exact occasion compatibility was 259/366 versus the Assignment 3 rules' 263/263. Quick HTTP median was 15.12 ms (10 local requests); local AI took 25.83/8.24 seconds in two calls. Eight reused authored semantic probes gave BM25 recall@18 1/8 and hybrid 8/8. These are development results, not held-out fashion quality. 91 app tests, 8 ML checks and 5 Python checks passed.

For the September 27 four-minute presentation, use that historical demonstration guide. Use the Sprint 6 rehearsal guide for the current personal RAG workflow; earlier sprint evidence remains below.

## Wardrobe retrieval and styling studio

The main navigation is **Closet → Stylist → Saved looks**. Secondary tools live under **More**. Add clothes through one photo/manual entry point; **Review pieces** walks through imports with **Save & review next**. Saving your own corrections also resolves the pending suggestion for that piece.

Styling starts with an occasion, a brief and one **Create my looks** action. **Preferences** holds the optional starting piece, instant offline method and retrieval preview. Successful looks take focus and the brief collapses to **Change the brief**. Save or wear the result; source facts and matches stay available under **How this look was made**. A garment's **Style this piece** shortcut carries it into the stylist.

Retrieval combines BM25 and selected local Qwen or OpenAI text embeddings with reciprocal-rank fusion and complete-outfit coverage across up to 200 records, supplying at most 18 pieces to the model. It excludes unreviewed imports, invalidates embeddings after corrections and explicitly falls back to lexical search if embeddings are unavailable. Model inputs have a total byte budget; preview and generation can be stopped. [Hybrid retrieval and measured limitations](docs/hybrid-retrieval.md). Run `npm run rag:hybrid` for development recall checks; **More → AI lab** separates current model readiness from historical benchmarks.

The user selected **Plan A** from the [three architecture proposals](docs/agent-roadmap.md). [The implementation record](docs/plan-a-implementation.md) covers durable recognition jobs, hybrid retrieval, locally logged corrections and outfit feedback, a trained experimental pairwise ranker, and a gated offline QLoRA workflow. The language/vision model has not been fine-tuned: there are currently no eligible real training examples. The [platform reference study](docs/platform-style-research.md) informed a quieter, photo-led original interface and source-attributed styling guidance.

## Real-photo wardrobe update

Seven attributed real photographs now seed new closets. Existing closets are preserved and can add the photo collection. Import several photos, review asynchronous local AI suggestions, save outfits to a lookbook, and record or undo wears in the journal. The interface supports desktop and mobile browsers.

[Implementation, technical-design mapping and measured limitations](docs/photo-workflow.md) · [Photo source and license manifest](public/photos/sources.json).

The revised recognition pipeline completed 7/7 analyses and matched 7/7 expected categories, compared with 6/7 and 4/7 in the first run. It now validates actual image bytes, handles footwear pairs, derives consistent categories/colors, rejects blank images before inference, and supports cancellation and bounded retries. These same seven photos were used for debugging; this is development evidence, not validated accuracy. [Pipeline, preserved failures and reproduction](docs/ai-pipeline.md).

## Local fashion agents (new experimental flow)

Photo recognition and outfit styling connect to local Ollama models. Run `npm run ai:start`, `npm run ai:setup`, then `npm run dev`. [Setup, GPU verification and limitations](docs/local-agents.md). `npm run build` followed by `npm start` serves the built app with the same local API; `npm run preview` is static only. Recognition and styling models can be configured independently using `CLOSET_RECOGNITION_MODEL` and `CLOSET_STYLIST_MODEL`.

## Sprint 3 Technical Feasibility and Baseline

**Submission:** [Four-page feasibility report](output/pdf/Closet-Quest-Sprint-3-Feasibility-Report.pdf). Decision: **Modify** the implementation and continue the core workflow. The course file upload is still a manual submission.

- **Outfit experiment:** 30 synthetic wardrobes, 180 requests. On 98 feasible requests, top-three constraint success improved from 78/98 to 98/98; correct abstention improved from 36/82 to 82/82. These are engineering constraints, not human fashion ratings.
- **Vision smoke test:** real pretrained CLIP and SigLIP inference on 18 original garment illustrations, with no training. CLIP classified 18/18 and SigLIP 17/18. These results do not establish real-photo accuracy. Model selection and any tuning remain collaborative.
- **App improvements:** three ranked outfit options, exact context-tag matching, dress alternatives, explanations, clear abstention messages, stricter quest validation, and an interactive **Lab** screen.
- **Reproduction:** `npm test`, `npm run benchmark`, and `npm run vision:compare`. Vision downloads pinned public model weights on first run; the app itself does not load those models.
- [Outfit experiment protocol and raw evidence](experiments/README.md) · [Vision comparison and next evaluation](vision/README.md).

The benchmark preserves an exhaustive-ranking failure (>2 seconds for a 200-item stress case) and the bounded fix. The PDF is generated from checked-in results, not invented measurements. To regenerate it, install Python packages from `scripts/report-requirements.txt`, then run `python scripts/build_report.py` from the repository root.

Rediscover clothes you own: organize a digital closet, build outfits, complete styling quests, track wears, and prepare resale listings.

## Run locally

Use Node.js 24.x and npm (this workspace uses 24.19); document persistence requires built-in SQLite support.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm test          # outfit, quest, wear-tracking, and listing logic
npm run build    # production files in dist/
npm start        # built app + APIs on 127.0.0.1:4173
npm run preview  # static build only; no local AI or knowledge API
```

## Five-minute demo

Use the current [Sprint 6 rehearsal guide](docs/sprint6-demo-guide.md) for exact controls, provider setup, a prepared document, safe reset and labeled recovery paths. The core remains **Closet → Stylist → Saved looks**; preferences, library and history are grouped under **More → My style & memory**. The guide is operational; the integration report records observed demonstrations separately.

## What works and what is simulated

| Requirement | This demo |
| --- | --- |
| Persistent wardrobe | Browser localStorage, seeded with seven real-photo samples; existing data preserved |
| Account | Local display name only; no authentication or account isolation |
| Upload / metadata correction | Single or batch upload; queued inference, review, editable attributes and retry |
| AI image processing | Validated, normalized photos; local or selected OpenAI inference with editable attributes; optional simple backdrop cleanup is not semantic segmentation |
| Closet management | Add, view, edit, search, filter, delete garment and stored photo |
| Styling | OpenAI/local selection or deterministic Quick planning, personal preferences, document context, and owned-ID validation; no fashion-quality guarantee |
| Personal memory | Explicit preferences and bounded feedback scores; browser recommendation history; no automatic model training |
| Document RAG | Local SQLite passages/vectors, provider-aware indexing, cited excerpts and keyword fallback |
| Gameplay | Three context-specific quests, validated submissions, one-time XP rewards, level progress |
| Usage | Saved lookbook, garment/outfit wear journal, last-worn timestamp and latest-wear undo |
| Low-use discovery | Garments with zero or one recorded wear |
| Resale | Editable template, clipboard copy, JSON export with uploaded photo; no auto-posting |

This React/Node prototype now has working model adapters, local document persistence and a vector retrieval path. The original Expo/React Native, FastAPI, PostgreSQL/pgvector, object storage and authentication design is not fully implemented. SQLite namespaces do not replace account authorization. Optional backdrop cleanup is a conservative edge-color operation, not an AI segmentation model.

## Project structure

```text
src/App.jsx         Screens, local persistence, photo review and lookbook
src/components.jsx  Photo cards, accessible dialogs and credits
src/wardrobe.js      Photo collection, migration, saved looks and wear journal
src/photos.js       Photo preparation, API client and exports
src/logic.js        Frozen original seed, quests and listing template
src/PersonalStyle.jsx Preferences, document library and recommendation history
src/preferences.js  Shared bounded preference contract
server/jobs.js      Durable bounded asynchronous photo queue
server/recognition.js Image validation, structured recognition and versioned results
server/recognition-provider.js Local/OpenAI routing and scoped result cache
server/openai.js    Server-only structured responses and embedding adapters
server/recommendation.js Personal RAG, provider routing and guarded fallback
server/personalization.js Color exclusions and bounded preference/feedback scores
server/knowledge.js SQLite documents, vector identity and hybrid passage retrieval
data/styling-knowledge.json Project-authored starter guidance
public/photos/     Bundled photographs and source/license records
tests/             Business logic, agent guards and queue regression tests
```

The frontend uses React and Vite with a loopback-only Node API for local Ollama or explicitly configured OpenAI adapters. API credentials remain server-side. Earlier CLI vision experiments still use Transformers.js with ONNX CPU inference. Real sample photographs are bundled with attribution; garments without photos display a placeholder. Typography uses locally available system fonts, with no external font requests. The lockfile pins dependencies for repeatable installs. Transitive `sharp` and `adm-zip` overrides select patched versions; both earlier model runs were verified after updating them.

## Storage, privacy, and limitations

- Wardrobe metadata, resized photos, preferences and up to 100 recommendation runs persist in this browser's localStorage. The photo/description/document data sent for inference depends on the selected provider, as described above. Same-browser access is not account security.
- Photos are prepared at up to 1,000px on the client; inference normalizes them again. Browser quota failures leave the prior saved state intact. Jobs persist locally in `.local-data/jobs/`; the result cache is memory-only and expires. Do not treat cache reuse as a model benchmark.
- Document text, passages and vectors persist in `.local-data/knowledge/`. UUID scoping prevents accidental mixing within the normal app flow but does not authenticate a caller. Browser reset/clearing creates a new namespace; it does not delete an old server library. Remove imported documents explicitly while its wardrobe is available; server-data lifecycle is next-sprint work.
- Exporting/copying a listing is an explicit user action. No external listing is published. The optional Depop adapter requires approved partner credentials for reading the user's shop.
- Data does not sync across devices. Camera capture, backup downloads, concurrency and independently measured fashion quality require the evidence stated in the report; do not infer them from UI controls.
- Language/vision weights are not fine-tuned. Feedback changes bounded ranking scores and may be logged locally if opted in; Fast/Balanced/Deep select models rather than train them. There is no live weather service, body scoring or payments.

## Build and deployment

`npm run build` creates `dist/`. On this Windows workspace, `npm run build -- --configLoader runner` avoids the config-loader sandbox issue seen in the prior rehearsal. `npm start` serves the built frontend and APIs together on `127.0.0.1:4173`; `npm run preview` and static-only hosting do not run recognition, document indexing or styling APIs. Keep the app server process open.

Deploying the full application needs a Node runtime with built-in SQLite, durable private server storage, protected server environment settings, and a reachable selected inference provider. The current server binds to loopback and has no user authentication. Hosting, HTTPS, authorization, quotas and data-deletion policy must be implemented and tested before a shared deployment. No hosting is provisioned automatically.

### Reproduce current advanced measurements

`npm test` and `npm run build` run without cloud inference. `npm run evaluate:advanced -- --live` intentionally performs a small paid API evaluation with public fixtures and the initial local wardrobe-embedding baseline. `node scripts/evaluate-advanced-retrieval.mjs --live` separately measures the optimized cloud wardrobe cache. Inspect `output/sprint6/advanced/results.json` and `retrieval-results.json` for exact request budgets, real provider labels and caveats. [Screenshot gallery](output/sprint6/advanced/index.html).
