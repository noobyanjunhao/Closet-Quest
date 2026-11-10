# Beta deployment and operations

Live app: https://closet-quest-junhao-s7.onrender.com/  
Repository: https://github.com/noobyanjunhao/Closet-Quest

## Reproduce the release

Use Node 24 (CI pins 24.19.0), npm, and the committed lockfile. Python 3.12 is needed only for the purchase-model unit tests; model weights are not required for the beta API. Native `sharp` is installed by npm for the target platform.

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

Record the release SHA, browser/device, test start/end and participant code. Do not deploy, change model IDs, rotate configuration or edit code during the session. A critical safety failure ends the session; preserve the failed attempt, fix the defect, deploy a new revision, and run a separately labeled retest. An independent user must perform the test; an agent, developer rehearsal or synthetic dataset does not satisfy that requirement.

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

