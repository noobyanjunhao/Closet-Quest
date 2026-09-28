# Closet Quest

A responsive wardrobe app prototype for the Closet Quest semester project, maintained in `noobyanjunhao/Closet-Quest`.

## Core prototype update - September 27

**Photo → review → style → save.** Add clothes now offers camera preview, capture/retake, native mobile capture and batch photo selection. Review opens immediately, and AI suggestions prefill only untouched fields. Quick and OpenAI recommendations can run while local photos are still analyzing.

The recommendation API retrieves once, builds complete owned outfit plans, selects via OpenAI/local AI/Quick, then validates. Auto uses OpenAI when configured and Quick otherwise. Quick is lexical retrieval and deterministic planning, not an LLM. Six-second embedding, fifteen-second OpenAI and forty-five-second local-generation budgets provide explicit fallback; bounded memory vectors reuse the existing digest-aware disk cache. OpenAI receives descriptions and a brief only, with `store:false`.

Copy `.env.example` to `.env.local`, configure `OPENAI_API_KEY` and/or an approved `DEPOP_API_KEY`, then restart. Keys stay on the server. The official Depop adapter can check your own shop and read paginated listings; access requires Depop partner approval. Draft/export works without access. No listing is automatically published. Live OpenAI and Depop validation was unavailable on September 27 because no keys were configured.

**Submission:** [Concise core evaluation PDF](output/pdf/Closet-Quest-Core-Technology-Report.pdf), [full analysis](docs/core-evaluation.md), [demonstration guide](docs/core-demo.md), and [offline visual walkthrough](output/demo/index.html). Run `npm run core:evaluate` for the frozen baseline comparison and `npm run core:live` for live measurements (two OpenAI calls if configured). Raw results are in `experiments/results/core-v2.json` and `experiments/results/live-core-v2.json`.

The 180-request common structural evaluation returned zero invalid outfits with v2, but exact occasion compatibility was 259/366 versus the Assignment 3 rules' 263/263. Quick HTTP median was 15.12 ms (10 local requests); local AI took 25.83/8.24 seconds in two calls. Eight reused authored semantic probes gave BM25 recall@18 1/8 and hybrid 8/8. These are development results, not held-out fashion quality. 91 app tests, 8 ML checks and 5 Python checks passed.

For the current four-minute presentation and accurate feature labels, use the new demonstration guide above; the sections below retain earlier sprint history.

## Wardrobe retrieval and styling studio

The main navigation is **Closet → Stylist → Saved looks**. Secondary tools live under **More**. Add clothes through one photo/manual entry point; **Review pieces** walks through imports with **Save & review next**. Saving your own corrections also resolves the pending suggestion for that piece.

Styling starts with an occasion, a brief and one **Create my looks** action. **Preferences** holds the optional starting piece, instant offline method and retrieval preview. Successful looks take focus and the brief collapses to **Change the brief**. Save or wear the result; source facts and matches stay available under **How this look was made**. A garment's **Style this piece** shortcut carries it into the stylist.

Retrieval combines BM25 and local Qwen text embeddings with reciprocal-rank fusion and complete-outfit coverage across up to 200 records, supplying at most 18 pieces to the model. It excludes unreviewed imports, invalidates embeddings after corrections and explicitly falls back to lexical search if embeddings are unavailable. Model inputs have a total byte budget; preview and generation can be stopped. [Hybrid retrieval and measured limitations](docs/hybrid-retrieval.md). Run `npm run rag:hybrid` for development recall checks; **More → AI lab** separates current model readiness from historical benchmarks.

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

Requires Node.js 22.12+ and npm (tested with 24.19).

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm test          # outfit, quest, wear-tracking, and listing logic
npm run build    # production files in dist/
npm run preview  # serve the production build locally
```

## Five-minute demo

1. Open **Closet**. Seven photographed sample garments are ready in a new browser. Existing closets retain their data; click **Add photo collection** to add the new samples. Click the desktop profile to set a display name or export your closet.
2. Click **Add a piece**, choose a JPG/PNG/WebP photo (up to 8 MB), edit its details, and save. With local AI running, analysis continues in the background. Open the piece when **Review suggestions** appears, apply the suggestions, correct them, and save. **Import photos** accepts up to eight photos in a batch; review each before it can appear in outfits.
3. Search or filter the wardrobe. Click a garment to edit its metadata, replace its photo, record a wear, prepare a resale listing, or delete it.
4. Open **Outfits**, choose **Local AI stylist** or the explicit **Wardrobe rules · instant** baseline. Generate up to three outfits with the real photos. Save a favorite to **Lookbook**. Quests can start a request with their context and low-use constraint; older closets may need an item tagged `Campus casual` for the rules baseline.
5. Click **Submit outfit + earn XP** to earn 50 XP. Submit before recording a wear if the selected hidden gem already has one wear. Each quest awards XP once; every 100 XP advances a level.
6. Click **Wear this outfit**. Each piece receives one wear and a journal entry appears in **Lookbook**. Use **Undo latest wear** to reverse a mistake. Saved looks support **Wear today**.
7. Open **Resale**, select a low-use garment, edit its listing, and copy the text or export a JSON package. The export includes the actual resized photo and source credits for samples. Replace sample photos with your own item photos before selling.
8. Refresh to show persistence in the same browser. Use garment deletion to demonstrate local data control.

## What works and what is simulated

| Requirement | This demo |
| --- | --- |
| Persistent wardrobe | Browser localStorage, seeded with seven real-photo samples; existing data preserved |
| Account | Local display name only; no authentication or account isolation |
| Upload / metadata correction | Single or batch upload; queued inference, review, editable attributes and retry |
| AI image processing | Validated, normalized photos; local vision-language inference with editable attributes; label text entered manually; no background removal |
| Closet management | Add, view, edit, search, filter, delete garment and stored photo |
| Styling | Local language-model fashion consultant with wardrobe-ID validation; explicit Sprint 3 rules baseline for comparison |
| Gameplay | Three context-specific quests, validated submissions, one-time XP rewards, level progress |
| Usage | Saved lookbook, garment/outfit wear journal, last-worn timestamp and latest-wear undo |
| Low-use discovery | Garments with zero or one recorded wear |
| Resale | Editable template, clipboard copy, JSON export with uploaded photo; no auto-posting |

This is a React web prototype for convenient laptop and mobile-browser demos. The proposed Expo/React Native app, FastAPI backend, PostgreSQL, object storage, real authentication, background cleanup, are future semester implementation work. This frontend does **not** claim completion of those backend/AI requirements or validated research metrics.

## Project structure

```text
src/App.jsx         Screens, local persistence, photo review and lookbook
src/components.jsx  Photo cards, accessible dialogs and credits
src/wardrobe.js      Photo collection, migration, saved looks and wear journal
src/photos.js       Photo preparation, API client and exports
src/logic.js        Frozen original seed, quests and listing template
server/jobs.js      Bounded local asynchronous photo queue
server/recognition.js Image validation, structured recognition and versioned results
public/photos/     Bundled photographs and source/license records
tests/             Business logic, agent guards and queue regression tests
```

The frontend uses React and Vite with a loopback-only development API for local Ollama inference, without cloud API keys. Earlier CLI vision experiments still use Transformers.js with ONNX CPU inference. Real sample photographs are bundled with attribution; garments without photos display a placeholder. Typography uses locally available system fonts, with no external font requests. The lockfile pins dependencies for repeatable installs. Transitive `sharp` and `adm-zip` overrides select patched versions; both earlier model runs were verified after updating them.

## Storage, privacy, and limitations

- Wardrobe metadata and resized photos stay in this browser's localStorage. They are not uploaded to a service. Anyone using the same browser profile can access them: this is not secure account storage.
- Uploaded photos are resized to a maximum dimension of 1,000px. Storage quota errors show a message and leave the previous saved state intact. The AI queue is held in memory; after a service restart, retry unfinished analyses.
- Exporting or copying a listing is an explicit user action. The export includes the stored original-background photo, not an AI-cleaned image.
- Clearing site data resets the demo to seven photographed sample garments. Data does not sync between browsers or devices. Browser storage can be cleared by the user/browser.
- Recorded wears are demo counts, not verified garment condition. Verify all resale details before publishing.
- No body scoring, payments, social feed, marketplace integration, weather service, or claimed AI accuracy/performance benchmarks.

## Static deployment

Run `npm run build` and serve `dist/` with any static web host. A deployment should use HTTPS for clipboard support. The app uses no client-side URL routes, so no route-rewrite configuration is needed. Use `npm run build -- --base=./` if deploying under a repository subpath such as GitHub Pages.

Hosting is not provisioned automatically by this repository. The semester API reliability, real AI accuracy, latency, and user-validation targets require a connected backend and measured tests.
