# Beta deployment and operations

Live app: https://closet-quest-junhao-s7.onrender.com/  
Repository: https://github.com/noobyanjunhao/Closet-Quest

## Reproduce the release

For this iteration, run `node scripts/evaluate-stylist-nfr.mjs` after `npm test`. It blocks network and writes the paired fixture results to `output/sprint9/stylist-nfr.json`. `node scripts/review-sandbox.mjs --port=4186` creates a frozen local review copy without credentials or server outbound calls; recognition is disabled and recommendations are deterministic. This is a rehearsal, not a production model test. Use a separate port/snapshot for a retest. See [the NFR acceptance contract](sprint9-nonfunctional-requirements.md) and [latest report](sprint9-beta-validation.md).

Set `CLOSET_STYLIST_POLICY=offline` to force local styling even when callers select OpenAI or Deep. Default `standard` enables automatic routing for routine briefs. This setting covers styling generation and embeddings only; it is not a global spending cap. Never run live shopping/recognition as part of a zero-spend smoke test.

Use Node 24 (CI pins 24.19.0), npm, and the committed lockfile. Python 3.12 is needed only for the purchase-model unit tests; model weights are not required for the beta API. Native `sharp` is installed by npm for the target platform.

For CPU-only hosts, set `ONNXRUNTIME_NODE_INSTALL=skip` during dependency installation. This skips optional GPU downloads, while retaining the bundled CPU runtime. CI runs a real numerical CPU inference with `scripts/verify-onnx-cpu.mjs`; do not disable every npm install script to work around a GPU-download failure. See [CPU dependency installation](cpu-dependency-install.md).

```sh
npm ci
npm test
npm run build
npm start
```

The default server binds `127.0.0.1:4173`. `npm test` uses `scripts/test-beta.mjs`, strips cloud credentials from child processes, and disables `.env` loading. Tests use fixture models and a loopback DynamoDB-compatible emulator, not production accounts. In a restrictive desktop sandbox, loopback tests need permission to open local sockets.

Copy `.env.example` to `.env.local` for local live inference. Keep secrets out of Git and never prefix them with `VITE_`. Hosted accounts need `CLOSET_PUBLIC_ORIGIN` (exact HTTPS origin), a random `CLOSET_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `OPENAI_API_KEY`. Supabase must already have migrations 001-005, private photo policies, Auth redirect URLs and working confirmation email delivery. Use the publishable key, never an admin/service-role key in the application. Purchase imports remain optional; they need the existing scoped worker setup for tuned-model inference.

## Render and freeze protocol

The existing `render.yaml` runs `npm ci --include=dev && npm run build -- --configLoader runner`, then `npm start`, with `/healthz` as the liveness check. Automatic deployment stays **off**. Deploy the inspected GitHub commit manually. Verify `/version.json` returns that exact 40-character revision, load the sign-in page, and run the signed-in smoke flow before inviting the tester. `/api/beta/status` requires authentication and reports bounded queue/cache state; it is not proof of provider health.

When changing `SUPABASE_URL`, its publishable key or another environment value, save it and re-open the setting to verify the saved value before deploying. **Save only does not update the running service. Restart service also retains the environment values from its current deployment.** Use **Save and deploy** to apply the new values to the existing build, or deploy the inspected commit again. A successful restart or unchanged revision is not evidence that the replacement database is connected. These distinctions follow [Render's environment-variable options](https://render.com/docs/configure-environment-variables) and [restart behavior](https://render.com/docs/deploys#restarting-a-service).

After the new deployment is live, run this bounded connectivity check with the full expected commit SHA and a new output filename:

```sh
node scripts/verify-hosted-cloud.mjs --origin https://closet-quest-junhao-s7.onrender.com --expect-revision FULL_40_CHARACTER_SHA --out output/sprint9/cloud-connectivity.json
```

The verifier checks process liveness and release identity, then submits exactly one synthetic invalid login through the deployed API with its required Origin header. It makes no signup, reset-email, wardrobe or model requests and uses no real credentials. A normal invalid-credential rejection establishes that this authentication path reached its backend; DNS failures, 5xx responses and ambiguous 401/key failures fail the check. The JSON contains only allowlisted technical fields, never request bodies, cookies, passwords or upstream error text. Existing evidence files are not overwritten. This is technical connectivity evidence only: separately verify real email confirmation, sign-in, private wardrobe save/read/reload and photo access before claiming end-to-end readiness.

Record the release SHA, browser/device, test start/end and participant code. Do not deploy, change model IDs, rotate configuration or edit code during the session. A critical safety failure ends the session; preserve the failed attempt, fix the defect, deploy a new revision, and run a separately labeled retest. An independent user must perform the test; an agent, developer rehearsal or synthetic dataset does not satisfy that requirement.

### Account outage recovery

Keep browser data and private exports intact. Diagnose DNS, project status, saved environment and Auth delivery separately. A process-health 200 or successful redeploy is insufficient. The November 17 incident required a new owner-approved Free Supabase project, migrations and isolation checks, verified environment values, a fresh Render deploy, and repair of an SMTP source-IP block. Verify only the specific source address observed in provider logs; do not disable the entire SMTP protection. A source-IP change can recur, so check Auth/provider logs if confirmation delivery fails again. Keep IPs, emails, keys, backups and screenshots containing private clothes out of public evidence.

After confirmation and sign-in, export the new account before import. Validate the original backup, preserve its checksum, restore through the normal account UI, wait for sync, reload, inspect photos and export a fresh backup. Record exact recovered counts and what could not be recovered; do not equate a new empty database with recovery of cloud-only data. Roll back application code separately from durable data. Never overwrite a newer cloud wardrobe with an older local copy without reviewing the conflict.

### Purchase worker after a backend replacement

Installing migrations 003-005 does not transfer worker credentials from the old project. The November 17 replacement's scoped laptop worker has not yet been re-registered or tested. Keep the fast-parser fallback available and label it accurately. To restore the tuned-worker path, follow [the purchase worker runbook](cloud-service-lab.md), review the new credential's narrow claim/return permissions and expiry, obtain the required approval for new access, register it privately, and run a synthetic purchase job through claim, draft return, user review and acceptance. Verify owner isolation and concurrent-claim behavior before calling the worker operational. Do not copy the old secret into a new project and assume it works, or include worker secrets in a report.

Rollback uses Render's prior known-good deployment. No new Supabase schema migration is required by this beta. Keep optional AWS configuration blank for the existing hosting path. Verify the rollback revision and perform a login/read/style smoke check afterward.

## Container deployment

The multi-stage Dockerfile installs runtime dependencies separately, runs as the unprivileged `node` user and health-checks the loopback server. The build context excludes secrets, private images, checkpoints and local data. CI builds and smoke-tests the container. For a local preview:

```sh
docker build -t closet-beta .
docker run --rm -p 127.0.0.1:4173:4173 -e CLOSET_BIND_HOST=0.0.0.0 closet-beta
```

Production must use HTTPS and the hosted account configuration. A container alone does not provide authentication, durable storage or horizontal coordination. Supabase is the durable wardrobe/document store. The photo queue and rebuildable vector index are local to each process; free Render restarts may interrupt in-flight work. Do not place two processes on the same photo-job folder. The optional AWS catalog coordinates public shopping refreshes only, not every AI job or global account budget.

## AWS implementation and cost gate

`server/catalog-store.js` wires the actual AWS SDK to strongly consistent reads, conditional leases, fencing tokens and validated catalog payloads. `infra/aws/catalog-refresh.mjs` refreshes one deterministic public category per day. `infra/aws/template.yaml` defines DynamoDB (1 read/1 write capacity unit), Lambda (256 MB, 40 seconds, concurrency 1), a disabled-by-default EventBridge schedule, a seven-day log group, and an error alarm. The function has table-specific GetItem/UpdateItem and one-secret GetSecretValue permissions. It never receives account IDs, wardrobe photos, personal notes or raw prompts.

```sh
node scripts/experiment-aws-catalog.mjs
node scripts/prepare-aws-catalog.mjs
sam build --use-container --template-file infra/aws/template.yaml
sam deploy --guided --capabilities CAPABILITY_IAM
```

The preparation script copies an explicit source allowlist to `tmp/aws-catalog`; SAM installs Linux dependencies there. Supply an **existing** Secrets Manager JSON secret `{ "OPENAI_API_KEY": "..." }` through `CatalogSecretArn`, without putting its value in command history. Keep `EnableSchedule=false` for initial validation. Connect Render with `CLOSET_CATALOG_TABLE`, `AWS_REGION`, and approved short-lived role credentials limited to GetItem/UpdateItem on that table; credential provisioning is a separate security action. Never copy AWS root credentials into Render. An AWS-hosted app should use its instance/task role.

**Not yet deployed to AWS.** Free Tier eligibility, credit expiry, account concurrency quotas, DynamoDB capacity, Secrets Manager, logs and alarm charges must be verified in the user's actual account before creating resources. Do not infer that this stack is free from its small size. Scheduled OpenAI searches are separately billed. No NAT gateway, always-on GPU, provisioned Lambda concurrency or OpenSearch cluster is added. A retained table survives stack deletion and may continue incurring charges. Disable the schedule before teardown and explicitly review retained resources. Alerts observe costs; they do not cap them.

The 40-request SDK experiment is local Dynalite emulation, not AWS capacity evidence. It does not simulate IAM, network latency, provisioned throughput throttling or billing. The application fails closed on unavailable distributed coordination instead of silently starting duplicate paid searches; saved local results remain the fallback.

## Failure handling and monitoring

Shopping admits two provider calls and at most 40 waiting distinct searches, with a four-second wait limit. Identical requests share a promise. Recent products are reusable for 24 hours; old entries are eligible as explicitly stale fallback for at most 14 days. Per-query failures cool down for 30 seconds; three failures open a process-local circuit. A successful in-flight request may close it. No prices or products are invented to turn an error into success. Direct remote stylist work admits two calls and eight waiters for up to three seconds. Account inference budgets remain in force. These are bounded beta limits, not a global service SLA.

Every API response gets a server-generated `X-Request-Id`. Optional `CLOSET_REQUEST_LOGS=1` records only that ID, an allowlisted route family, method, status and elapsed time, never bodies, tokens, account IDs or arbitrary URL text. Use 5xx rate, wait rejection count, cache-hit/coalescing rate and provider-call count to decide whether to add capacity. Review repeated errors before increasing limits. Never label `/healthz` as model readiness: it is only process liveness.
