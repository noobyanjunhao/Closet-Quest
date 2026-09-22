# Real-photo development increment — September 21, 2026

**Follow-up:** the [September 22 recognition pipeline](ai-pipeline.md) improves the same seven-photo check to 7/7 returned results and 7/7 matching categories, adds image validation and bounded retries, and leaves label text manual. The measurements below preserve the first increment's failures. `photos:test` now runs the revised evaluator and never overwrites that baseline.

This increment follows the technical design's upload → asynchronous processing → human correction flow and its Outfit / WearRecord data relationships. It extends the existing React / local Ollama prototype; it does not complete the proposed hosted FastAPI architecture.

## Delivered

- Seven locally bundled, real garment photographs with author, source URL, license, modification notice and SHA-256 in `public/photos/sources.json`. Credits appear in the app and sample resale exports. The collection is about 1.1 MB and needs no third-party image requests at runtime.
- A new closet starts with photos. Existing browser data, edited items, deletions, submissions and XP survive migration. The photo collection can be added without replacing existing items. The old illustration seed remains unchanged for reproducible Sprint 3 experiments.
- Single photo editing and up to eight photos per batch. Uploaded photos are normalized to JPEG at a maximum dimension of 1,000 px. Batch imports require a metadata review before the stylist can use them.
- `POST /api/jobs` accepts an image and returns HTTP 202. `GET /api/jobs/:id` reports queued / processing / ready / failed / cancelled. `DELETE /api/jobs/:id` cancels work and removes the retained result. One worker serializes inference; the queue holds at most eight unfinished jobs. Results expire 30 minutes after completion. Queue requests and the old synchronous endpoints share the local runtime without overlapping work.
- Browser-persisted job IDs resume polling after refresh. A server restart expires jobs, and the client shows a retry action. The queue itself is in memory, not durable production infrastructure.
- Recognition suggestions are stored separately from garment metadata. They never silently replace user edits. Applying fills a review form; saving accepts the edited fields. Image revision checks prevent results for replaced/deleted photos from attaching to a different photo.
- Saved outfits, context, explanations, a dated wear journal, duplicate-event protection and undo of the latest wear. Deleting a garment removes dependent saved looks and removes its identifiers from wear history and quest submissions.
- Responsive photo cards, outfit boards, review filters, sorting, image credits, focus-trapped dialogs, closet JSON export and resale packages containing the actual resized image plus sample credit.
- `npm run ai:start` now uses a Node launcher, avoiding Windows PowerShell execution-policy failures. No machine policy is changed.

## Verification and actual model limits

`npm test` covers the prior guards and ranking baseline plus migration, saved outfits, wear/undo/cascade behavior, job serialization, cancellation, failures, capacity and expiry. `npm run build` compiles the production frontend. Browser checks exercise real inference, preservation of manual edits, refresh, batch import, outfit generation, save, quest reward, wear history and narrow-screen layouts.

`npm run photos:test` exercises the actual queued API against all seven photographs. Evidence is retained in `vision/results/photo-collection-smoke.json`, including model digest, GPU residency, input hashes and individual outputs. This is a development smoke check, not a held-out evaluation:

- 6 of 7 analyses produced a valid structured result; 4 of 7 matched the intended category.
- Sneakers were rejected as not being a single clear garment. The person-worn trousers and tote were incorrectly labeled Top.
- Acceptance was 12–41 ms in this one local run; completion including polling was about 4.1–6.1 seconds. These are not production P95 or reliability claims.
- A separate browser run misread the sweater's visible label. Label text, material appearance, color and occasion suggestions remain unverified and editable.
- No model selection, prompt tuning or training was performed in this increment. Failed results are kept; `photos:test` exits nonzero when an analysis fails. A minimum 120 distinct garments with an independent locked split is still needed for the design's validation target.

## Still to build from the technical design

Real authentication and cross-user isolation; FastAPI services; PostgreSQL / pgvector; private object storage with signed URLs; durable worker jobs; background removal; hosted deployment; and the independent real-photo/user study. A bounded local retry policy was added in the September 22 follow-up. The existing `GET /api/status`, `POST /api/recognize` and `POST /api/style` remain available. These development `/api/jobs` endpoints are an integration seam, not an implementation of every endpoint in section 2.2 of the PDF.

The application is loopback-only, has no account isolation, and stores wardrobe data and uploads in browser localStorage. Browser quota and site-data deletion still apply. `dist/` is the static frontend; inference needs the development API and Ollama. No cloud credentials, remote photo upload, paid service or deployment is introduced.

## Reproduce

```sh
npm run ai:start
npm run dev
# In another terminal:
npm test
npm run build
npm run photos:test
```

`npm run photos:collect` rebuilds the seven-photo collection from Wikimedia's public API. It verifies reusable license metadata, preserves source attribution and normalizes orientation/size. Run it only when deliberately updating the collection; upstream files can change. Images retain their stated licenses independently of the application code.
