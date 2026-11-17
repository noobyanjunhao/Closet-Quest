# Closet Quest developer guide

[Live beta](https://closet-quest-junhao-s7.onrender.com/) · [Repository](https://github.com/noobyanjunhao/Closet-Quest) · [User guide](beta-user-guide.md) · [Deployment runbook](beta-deployment.md)

## Run a reproducible local build

Use Node **24** and npm; CI pins Node 24.19.0. Install from the committed lockfile:

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173/`. For frontend development use `npm run dev` at `http://127.0.0.1:5173/`. Vite and the standalone server share the API implementation. Without cloud configuration this is a browser-local wardrobe; Quick styling works without model credentials. Live recognition needs a configured provider. Do not mistake the credential-free review sandbox for a production-capable deployment.

`npm test` removes cloud credentials and disables `.env` loading for its child process. Tests use fixtures and local HTTP sockets. Python 3.12 is optional for purchase-model tests:

```sh
python -m unittest discover -s ml/purchase -p "test_*.py"
node scripts/evaluate-stylist-nfr.mjs
```

The second command runs the paired local routing experiment with network blocked. It does not measure real model quality. Use `node scripts/review-sandbox.mjs --port=4186` for a copied, frozen, credential-free UI rehearsal; live recognition and cloud sync are intentionally unavailable there.

## Configuration

Copy `.env.example` to the ignored `.env.local` for local live services. Never commit filled secrets or use a `VITE_` secret variable. Production values belong in the host's environment.

| Configuration | Purpose |
|---|---|
| `CLOSET_PUBLIC_ORIGIN` | Exact HTTPS app origin, with no trailing slash; enables hosted access protections. |
| `CLOSET_SESSION_SECRET` | Random server-side signing secret, at least 32 characters. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Enable account authentication, owner-scoped database access and private photo storage. Do not substitute an admin/service-role key. |
| `OPENAI_API_KEY` | Server-side live model access. Presence alone does not prove the model or billing works. |
| `CLOSET_OPENAI_RECOGNITION_MODEL`, `CLOSET_OPENAI_RECOMMENDATION_MODEL` | Optional task-specific model overrides. Check actual available model IDs before deployment. |
| `CLOSET_STYLIST_POLICY` | `standard` enables routing; `offline` forces deterministic styling without generation/embeddings. It does not disable recognition or shopping. |
| `CLOSET_PURCHASE_IMPORTS`, `CLOSET_IMPORT_PROVIDER` | Optional purchase-import feature and worker/local execution. Require its migrations and scoped worker setup. |
| `CLOSET_REQUEST_LOGS` | Set `1` for allowlisted request ID/route/status/duration logging, without request bodies or account identity. |

Apply `supabase/migrations/001_accounts.sql` and `002_shopping_library.sql` for accounts/catalog. Optional purchase imports add migrations 003–005. Configure the deployed origin as Supabase's Auth redirect destination, private storage policies and working SMTP confirmation/reset delivery. See the deployment runbook for operational steps; do not expose a loopback-only configuration publicly.

## Where the system lives

| Layer | Main files / responsibility |
|---|---|
| Client | `src/App.jsx`, `AccessGate.jsx`: navigation, wardrobe state, account entry and sync. `OutfitStudio.jsx`: brief and outfit cards. |
| HTTP and access | `server/start.mjs`, `api.js`, `access.js`, `cloud.js`: routes, origin/session checks, owner scope and persistence. |
| Photo recognition | `recognition-provider.js`, `recognition.js`, `jobs.js`: provider selection, image normalization, multi-piece recovery, reviewable jobs and cancellation. |
| Styling / RAG | `recommendation.js`, `stylist-orchestrator.js`, `hybrid-retrieval.js`, `knowledge.js`, `agents.js`: preferences, parallel retrieval, bounded plans, provider selection and validation. |
| Retrieval memory | `personalization.js`, `cloud-knowledge.js`, `retrieval-provider.js`: explicit feedback, owner-scoped document hydration and vector caching. |
| Shopping | `shopping-library.js`, `shopping.js`, `work-limiter.js`: cached public products, source validation, coalescing, deadlines and backpressure. |
| Measurement | `src/beta-test.js`, `BetaTest.jsx`, `tests/`, `scripts/evaluate-stylist-nfr.mjs`: frozen-session records and repeatable engineering checks. |

The app uses JavaScript/React and a native Node HTTP API, not LangChain or a swarm of independent LLMs. Python is used for ML experiments. The six stylist specialists are bounded modules; only selection may generate once. Provider failure uses deterministic planning from the same evidence. Fashion quality still requires wearer feedback. Refer to [the acceptance contract](sprint9-nonfunctional-requirements.md) for the context boundary and architecture.

## API and operating checks

`/healthz` is process liveness, not model readiness. `/version.json` exposes the release revision. Authenticated `/api/status` describes configured capabilities; `/api/beta/status` exposes bounded queue/cache statistics. Client calls use same-origin JSON and session cookies. Important routes include `/api/jobs` and `/api/jobs/:id`, `/api/style`, `/api/cloud/closet`, `/api/knowledge/search`, `/api/shopping/library` and `/api/shopping`. The API replaces caller wardrobe scope with the authenticated namespace; do not bypass it in new endpoints.

Before release: run CI, inspect the exact diff, deploy one revision, verify the hosted revision, then complete the signed-in workflow with a consenting test account. Test recognition, correction, styling, save/wear, sign-out/re-entry and backup recovery. A public 200 response does not verify these features. Freeze code and model configuration during an independent session; restart as a separately labeled retest after fixes.

Rollback uses the previous known-good Render deployment. Supabase is durable; the photo-job queue and rebuildable vector index are process-local. Do not share one job directory between processes or claim horizontal scaling without distributed admission/queue work. Full cloud photo erasure, broad accessibility and real-user quality evidence remain documented release limits. Optional AWS work is separate and must follow the project's approved profile, Region and activation checks.

If sign-in reports a cloud connection interruption, check the configured Supabase hostname and the original project's dashboard status before changing code. A DNS failure is not proof that a password is wrong. Restore a paused project through its owner if available; do not replace it with a fresh empty database or bypass authentication. After recovery, verify login, existing wardrobe retrieval, a new saved change and re-entry. Current release evidence records this dependency as unavailable until that check passes.
