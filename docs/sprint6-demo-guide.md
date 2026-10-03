# Sprint 6 rehearsal guide: personal RAG and provider choice

Recommended duration: approximately five minutes, not a course-mandated limit. Deadline: October 6, 2026, 1 PM Eastern. This guide contains operating instructions; the integration report's demonstration section must describe actual observed outputs. The advanced provider/library flow needs its own rehearsal evidence. The initial local run's timings are historical, not predictions for OpenAI.

## Start and check

Use Node.js 24.x; this workspace reports 24.19.0. On a new machine, run `npm ci` and follow `docs/local-agents.md` to install local models before the presentation. For OpenAI, privately configure the server-only, git-ignored `.env.local` from `.env.example` if needed, then restart the server. Do not overwrite an existing configuration, print its contents, enter keys in the app, or use a `VITE_` secret. A website login alone does not connect the API.

```powershell
Set-Location 'C:\Users\Junha\OneDrive\Documents\ChatGPT\Closet Quest'
npm run ai:start
npm run dev -- --port 5173 --strictPort --configLoader runner
```

Keep the server terminal open. If port 5173 is occupied, check the existing app rather than launching a duplicate. In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:5173/api/status
```

Use the returned `localRecognitionReady`, `stylistReady`, `embeddingReady`, `openai.configured`, and `openai.profiles` fields. They report configuration/readiness, not proof of a successful live OpenAI request. Profile model names come from the current server configuration. The initial local rehearsal used Qwen3-VL, Gemma3 and Qwen embeddings; inspect current status instead of assuming those services or cloud credentials are unchanged.

The built-app path is `npm run build -- --configLoader runner`, then `npm start` (default `http://127.0.0.1:4173`). This serves the frontend and APIs together. `npm run preview` is static only and does not run the AI/library APIs. The first full browser rehearsal was on Vite port 5173.

## Prepare the isolated rehearsal

1. Open `http://127.0.0.1:5173/?demo=sprint6`. Confirm the Sprint 6 rehearsal banner. Choose **Reset rehearsal → Reset sample wardrobe**, then reload. Expect six sample pieces, no saved looks and 0 XP; the tee is deliberately absent. Reset only this rehearsal; never clear all browser storage. Learning is disabled in this mode.
2. Open **More → My style & memory → My style**. Choose **Casual**, **Comfort**, preferred **Navy**, and **Red** under **Avoid in recommendations**. Leave fit open if metadata is sparse. These are demo preferences, not a user's actual profile. Open **AI preferences**. Choose the already verified provider for **Photo recognition** and **Outfit recommendations**. Use **Fast** under **OpenAI model profile** for the timed run, then **Save my style**. If no key is configured, choose Local recognition and either Local model or Quick recommendations. Do not imply that disabled OpenAI controls have been tested live.
3. Open **Knowledge**. Four project-authored starter guides are keyword-searchable initially. Under **Semantic search settings**, choose Local or OpenAI embeddings, then **Build semantic index**. Use the same saved provider for subsequent indexing and searches. OpenAI sends document text, search queries and reviewed garment descriptions externally; use only the public/demo text below. If indexing falls back, demonstrate the honest keyword status.
4. Add a document titled **Campus presentation notes**, source label **Project-authored demo example**, with this text:

   > For an informal campus presentation, prefer comfortable closed-toe shoes and simple layers. A navy blazer can make a relaxed top look more intentional. Reuse existing wardrobe pieces rather than suggesting a purchase. A graphic tee suits a casual campus day; use the reviewed occasion and personal judgment for a formal presentation.

   Click **Add to library**. This is illustrative advice authored for the demo, not an official dress code. There is no URL fetch or PDF import: paste text or import `.txt`/`.md`, at most 20,000 characters.
5. Under **See what your stylist can retrieve**, search **comfortable shoes and navy layers for campus**. Inspect the returned source/excerpt and the actual retrieval mode. A document shown as retrieved may be omitted from the bounded model prompt; styling evidence labels that distinction. If no relevant excerpt appears, report that rather than claiming a citation.
6. Do one complete preflight inference with public samples. Inspect the actual provider, timing, fallback and cache labels. Then reset/reprepare if the live narrative requires a clean wardrobe. Reset creates a new wardrobe namespace; it does not delete an older server library. Remove your imported demo document through **Remove** before resetting if you want to clean that namespace.

Prepared assets:

- Real public sample: `public/photos/tee.jpg`; license/attribution in `public/photos/sources.json`. This is not the presenter's personally owned garment.
- Invalid input: `output/sprint6/fixtures/invalid-photo.jpg`, intentionally unreadable text named as a JPEG.
- Initial local evidence: `output/sprint6/screenshots/`, `output/sprint6/index.html`, and `output/sprint6/browser-evidence.json`.
- Advanced results, once actually generated: `output/sprint6/advanced/`. Read the recorded status; do not assume every provider check passed.
- Earlier optional role-play: `output/pdf/Closet-Quest-Roleplay-Demo.pdf` (September evidence).

## Five-minute run: clicks and speaking notes

Prepare the document/index before the timed segment. Keep the library settings collapsed; demonstrate the user flow rather than configuration work.

| Time | Actions | Speaking notes and expected checks |
| --- | --- | --- |
| 0:00–0:30 | Show rehearsal wardrobe; More → My style & memory → My style, briefly show selected preferences | “This sample wardrobe shows a personal assistant grounded in owned clothes, explicit preferences and a small reference library.” Explain which provider is selected. |
| 0:30–1:35 | Closet → Add clothes → Choose photos → `tee.jpg`. Review suggestions; correct the name/tags and save | “The model proposes attributes; reviewed details become the source of truth.” Use **Rehearsal graphic tee**, category Top; check White against the actual photo. Keep Campus casual/Coffee date only if appropriate. Do not promise a particular wording or completion time. |
| 1:35–2:35 | Open tee → Style this piece. Occasion Campus casual. Brief: **A relaxed campus look around my graphic tee, with comfortable shoes and navy layers, using only my closet.** Create my looks | “The system filters reviewed clothes, applies my preferences, retrieves references, builds owned outfit plans and asks the selected model to choose and explain them.” If fallback appears, name Quick explicitly. |
| 2:35–3:10 | Expand How this look was made; inspect owned facts and Your knowledge library. Save this look | “These are the garment records and document excerpts available to the request. The display distinguishes retrieved evidence from excerpts actually included in the model context.” Verify the uploaded tee is an anchor in the chosen result. |
| 3:10–3:55 | Wear today → Saved looks → reload → Saved looks. Show the journal, disabled duplicate wear and Undo latest wear | “A recommendation leads to a saved action and persistent history. The same combination cannot be counted twice today. Undo restores the preceding wear state.” The saved look remains after undo. |
| 3:55–4:20 | More → My style & memory → History. Choose Works for me on the demonstrated run | “We record the provider, latency and chosen look. My feedback changes bounded ranking scores; it does not retrain an LLM.” Saved/Chosen/Worn badges should reflect actual actions; after undo, do not describe a remaining stale badge as correct. |
| 4:20–4:45 | Closet → Add clothes → Choose photos → `invalid-photo.jpg`; show useful error and Add without a photo | “Invalid input does not poison the wardrobe. Manual entry remains available when an image or model cannot be used.” The invalid file should add zero pieces. |
| 4:45–5:00 | Show the report's measured table and next priorities | “Provider interfaces and document retrieval are integrated. We still need independent quality/latency evaluation and authenticated shared storage.” Quote only freshly recorded advanced results. |

Quest XP is an optional 20-second extension: before wearing, open **Make this look a style quest → The hidden gem → Submit outfit + earn XP**. The initial local rehearsal earned 50 XP once. Keep inspiration and resale out of the core timed path unless specifically requested.

## Failure and backup paths

- **Styling slow or unavailable:** use **Stop styling**, then **Preferences → Styling method → Quick matches** and retry. Quick uses lexical retrieval and deterministic planning, not an LLM. The provider reports fallback explicitly; do not call fallback an OpenAI success. Current model calls have bounded budgets, but total time includes retrieval, queueing and validation.
- **Photo analysis slow/offline:** cancel when available, keep the photo, enter reviewed details manually and save. Say “manual recovery.” Use a reviewed sample knit as the styling anchor if necessary. A recognition cache hit reuses a prior validated result, not a new inference; it is not evidence of cold-photo latency.
- **OpenAI access/billing failure:** configuration may be present while a request fails. Keep the local/manual/Quick path ready; do not change credentials or discuss a key on the presentation screen. Signing in to the platform is insufficient by itself.
- **Semantic indexing unavailable:** retain the document and show **Keyword search ready** or a partial index. Search remains usable. Switching providers can make existing vectors incompatible; rebuilding with the selected provider is the recovery, not calling a lexical result “semantic.”
- **Library unavailable:** styling can proceed with wardrobe facts and preferences. Show the failure clearly. SQLite persistence is local server data; wardrobe UUIDs are not authentication and do not justify public hosting.
- **Total app failure:** open the local screenshot gallery or PDF. State the capture date and that the images are recorded evidence. The original October 2 gallery shows the initial local pipeline, not proof of new OpenAI/library UI.
- **Camera/backup:** hardware capture and downloaded backup behavior were not established by the first local rehearsal. Verify them on the presentation device before relying on them. Use file upload and isolated reset as the prepared path.
- Never use a personal wardrobe for destructive reset or send personal documents in this demo. Do not publish sample garment listings to Depop.

## Checks and evidence before presentation

```powershell
npm test
npm run build -- --configLoader runner
node scripts/evaluate-alpha.mjs
```

The alpha evaluator needs the API at 5173 and uses public/sample inputs. It includes injected failure cases, labeled in the output; injected success is not a live provider result. Historical pre-extension results were 100 tests, a successful build and 8 integration checks. Rerun after changes and use the new logs.

For the separate advanced evaluation, `node scripts/evaluate-advanced.mjs --live` sends public sample data through configured providers and writes `output/sprint6/advanced/`. Its explicit live flag distinguishes paid network calls from unit fixtures. Review the actual request ceiling and recorded outcome before running it; `--skip-local` omits the local vision comparison. New OpenAI speed/quality claims remain pending until measured outcomes are available. A single public photo and brief establish integration only, not accuracy or population P95 latency.

On Monday, perform two complete runs and one fallback rehearsal. Record elapsed times and corrections, review report claims against evidence, and open backup artifacts on the presentation computer. Keep charger connected and install models in advance. Manually submit the required file through Canvas; this guide does not submit it.

## Likely instructor questions

**Where is the RAG?** There are two evidence sources. Reviewed wardrobe descriptions use lexical/hybrid retrieval with outfit coverage. The persistent SQLite document library stores overlapping passages and optional provider-specific vectors; relevant excerpts are retrieved alongside saved preferences. The prompt is bounded and evidence is shown in the UI. Quick and fallback modes are identified as lexical/deterministic.

**What prevents invented clothes or document instructions taking over?** Candidate plans use owned, reviewed IDs; final checks enforce ownership, completeness and anchors. Color exclusions use reviewed labels. Documents are untrusted context, not authority for actions or garment facts. Free-text suitability can still be wrong, so validation is not a fashion-quality guarantee.

**What is actually AI?** Selected local/OpenAI vision analyzes photos; local/OpenAI text models choose/explain valid plans; embeddings support semantic retrieval when available. Quick, explicit preference score changes and history feedback updates are deterministic. Simple background cleanup is not semantic segmentation.

**Did you fine-tune?** No. Fast/Balanced/Deep are configured OpenAI model profiles. Current feedback is a bounded retrieval-score adjustment. Earlier experimental ranker/training-data work is separate and does not establish deployed model fine-tuning.

**How much faster is it?** Quote the advanced measurements only after they exist. The initial local photo took 24.903 seconds; that is a different run, not an OpenAI result. Report cold/warm/cache conditions, sample count and failures. One input cannot establish broad latency or accuracy gains.

**Why keep React and Node?** They already support the integrated UI, durable jobs and shared validation. The earlier delay was largely inference time; a new language alone has no demonstrated speed benefit. The update separates provider adapters, retrieval persistence and model-independent validation so they can evolve without rewriting the whole product.

**Is it ready for multiple users?** No. Browser state and local SQLite namespaces organize data but do not authenticate users. Authenticated authorization, private object storage, lifecycle/deletion, durable deployment and cross-user denial tests remain before shared hosting.

**What leaves the computer?** Selected OpenAI vision sends the normalized photo. Selected OpenAI styling sends reviewed descriptions, preferences, brief and relevant excerpts, excluding photos/display name. Selected OpenAI indexing sends text; semantic searches send queries. Keys remain on the server. Local providers process inputs locally. No Depop publication is performed.
