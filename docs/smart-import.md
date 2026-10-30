# Smart Wardrobe Import — M1

Purchase text becomes a draft, never an owned garment automatically. Open **Add clothes → Import purchases**, paste clothing lines, inspect exact source quotes, correct or deselect rows, save the review, then confirm ownership. Quantity two creates two independent garment units. A grey/tan placeholder icon is UI decoration, not an inferred photo or color; the imported garment's color hex remains null. Add a photo later using the existing editor.

## Run the review checkpoint

```powershell
npm ci
npm run build
npm run imports:demo
```

Open `http://127.0.0.1:4180/?demo=sprint6`. The demo uses synthetic fixtures and a separate import ledger. Click **Use synthetic example**. Change a name, inspect the unchanged evidence, save the review and confirm ownership. The closet updates immediately. Close and reopen the importer to resume a draft. Applying an already committed receipt does not duplicate units or restore units deleted after an earlier application.

For real inference, start the already-installed Ollama runtime, then:

```powershell
npm run ai:start
npm run imports:smoke
npm run imports:local
```

The real demo runs at port 4181. It uses Qwen locally, with no remote fallback. Both demo commands bind to loopback and deliberately disable cloud accounts. The ordinary application keeps the feature disabled unless `CLOSET_PURCHASE_IMPORTS=1`. `CLOSET_IMPORT_PROVIDER` is `local` or `fixture`; it is server configuration, not a client-supplied route. `CLOSET_IMPORT_MODEL` selects an installed model. The existing photo and stylist defaults are unchanged.

## Contract and lifecycle

Source normalization preserves NFC/LF text, line IDs and SHA-256. Model output may contain only the canonical JSON fields. Evidence must cite existing lines and exact substrings; non-null explicit attributes require supporting values. Category remains an interpretation to review. Missing color/brand/size stay null. Missing quantity blocks commit. User changes are separate from predictions and marked as corrections or enrichment; neither is automatically a training label.

Lifecycle: `queued → extracting → review_required → committed`. Extraction can fail, be retried with a new generation, or be cancelled. A completion with an old revision/generation/source hash is ignored. Committed drafts are immutable except receipt-source removal. Cancellation keeps the single model slot occupied until the adapter actually settles, avoiding accidental concurrency escalation. There is no automatic retry loop.

Limits: 12,000 characters, 200 lines, 30 rows, 10 units per row, 50 units per commit, eight queued/active jobs, 100 retained imports per owner, 100 review events, bounded draft JSON and 120-second extraction deadline. The model-context bound can reject shorter text. Queue limits are per process; hosted distributed quotas are not implemented.

`GET /api/imports/config` exposes feature/mode/queue information. `/api/imports/readiness` separately checks installed model discovery; a ready response is not proof that a later generation will succeed. `/healthz` means the web process is alive.

| Operation | Route | Safeguard |
|---|---|---|
| List / create | GET / POST `/api/imports` | Owner scope; create key in JSON body; 202 acknowledgment |
| Resume | GET `/api/imports/:id` | Foreign owner gets 404 |
| Review | PATCH `/api/imports/:id/items` | Expected revision, editable field allowlist |
| Commit | POST `/api/imports/:id/commit` | Reviewed selected IDs, confirm_owned=true, stable key |
| Cancel / retry | POST `/api/imports/:id/cancel` or `/retry` | Lifecycle and revision checks |
| Remove source | DELETE `/api/imports/:id` | Cancel active work first; committed receipt tombstone survives |

Idempotency keys are supplied as `idempotency_key` in JSON rather than a new header, matching the app's API helper. Changed payloads under the same key conflict. Local SQLite commits the draft, unit records, mappings and receipt together. The browser then applies that durable receipt idempotently; a browser-storage failure can be recovered by reopening the committed import. This is not a cross-system transaction with localStorage. On Supabase, the RPC appends units directly to `closets.state` inside the same PostgreSQL transaction.

## Privacy and limitations

The full normalized source stays in protected app storage until the user removes it; no automatic PII redactor is claimed. Do not paste addresses or payment details. Local mode relies on the computer account and loopback origin checks, not encryption at rest or multi-user authentication. Cloud storage uses verified JWTs and owner RLS; the new migration has been tested locally but not applied to production in this checkpoint. Source removal keeps commit identity and resulting garment records to prevent duplicate replay. It is logical deletion and does not promise forensic erasure from database backups/WAL.

No OCR, PDFs, receipt screenshots, merchant login, email ingestion, arbitrary URL fetching, scheduled training, fine-tuning or remote model service was added. The next milestone is a versioned evaluation dataset and frozen baseline, after this review.
