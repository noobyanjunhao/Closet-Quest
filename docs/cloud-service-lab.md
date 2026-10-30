# Cloud service lab: understand the import transaction

This increment adds real cloud-oriented code and executable PostgreSQL tests. It does **not** provision another cloud account, rent a GPU, expose this laptop or apply a production migration. Run `npm run imports:test` to exercise it locally with PGlite, an embedded PostgreSQL runtime used only as a development dependency.

## Follow one request

1. React sends a same-origin request to the Node API. The existing HttpOnly cookie identifies the session; purchase text is request data, not authentication.
2. Supabase Auth verifies the user. The server forwards that user's JWT and the existing publishable key to PostgREST. It never uses a service-role key for purchase operations.
3. The owner-scoped draft stores normalized text, immutable predictions, editable review values, revision and job generation.
4. The local worker calls Ollama on the **API host's** loopback address. It validates the returned JSON and quotes, then conditionally publishes a review draft.
5. A confirmed commit calls `save_purchase_import` once. PostgreSQL locks the draft and closet rows, checks the revision, inserts unique unit mappings and a replay receipt, appends to the existing closet snapshot and records the audit event. Any failed insert rolls all of this back.
6. The browser loads the latest cloud snapshot and adopts its revision after flushing pending edits. Existing compare-and-swap sync prevents another device's stale snapshot from overwriting the import silently.

## Concepts worth learning

| Concept | Concrete exercise in this repo | What the test proves |
|---|---|---|
| Authentication vs authorization | Change the synthetic JWT subject in `tests/purchase-cloud.test.js` | A different authenticated owner sees zero drafts and cannot insert another owner's row |
| RLS | Inspect each policy in migration 003 | Owner checks execute in PostgreSQL, independently of React |
| `SECURITY INVOKER` | Inspect `save_purchase_import` | RPC uses the caller's rights; it does not bypass RLS |
| Transaction rollback | Duplicate the second synthetic garment ID | No first garment, mapping or closet snapshot survives the failed transaction |
| Optimistic concurrency | Submit revision 3 after revision 4 exists | Stale review cannot commit |
| Idempotency | Send the same commit key and selection twice | Service returns the saved IDs instead of repeating side effects |
| Pessimistic locking | Read `FOR UPDATE` in the RPC | Concurrent commits serialize against the current draft and closet |
| Durable jobs vs durable data | Restart the local import process | Interrupted local jobs fail recoverably; cloud jobs reconcile through a bounded lease on read |
| Liveness vs readiness | Compare `/healthz` with authenticated `/api/imports/readiness` | A healthy web server does not mean the model is installed |
| CI | `.github/workflows/purchase-import.yml` | Offline fixtures and SQL behavior need no paid keys or model downloads |

PGlite executes PostgreSQL SQL, including roles, functions, RLS and rollback. It does not simulate Supabase Auth, real PostgREST, network partitions or multi-instance production load. Those remain staging integration checks. The adapter's JWT forwarding is tested separately with mocked HTTP.

## Why the hosted app cannot use the laptop model automatically

`127.0.0.1` on Render refers to the Render container, not this laptop. The free web service has neither these installed weights nor this GPU. Setting a model name there does not make it available. Keep purchase imports off on production until an explicit serving design is reviewed.

The smallest next cloud milestone is a separate staging project or isolated staging deployment with migration 003, two test accounts, synthetic drafts and deliberate network failures. An approved inference host would need private connectivity, scoped credentials, request limits, health/readiness, durable queue claiming, token refresh and a rollback route. Do not expose Ollama directly to the public internet. No such network change has been made here.

## Review before enabling a hosted worker

- Apply migration 003 to staging and verify table grants/RLS using two real test accounts. The local suite checks PostgreSQL behavior; it is not a production security audit.
- Test pending browser edits plus a cloud commit, then a stale second device. Verify that the conflict keeps both changes recoverable.
- Terminate a worker during extraction, retry after the lease, and confirm no stale result or duplicate unit appears.
- Authenticate the worker separately from interactive sessions. The M1 adapter currently carries the requesting user token; long queues can outlive it.
- Add distributed rate limits and leased job claims before multiple web/worker instances. M1's queue is intentionally one process with one local model call.
- Set a retention policy and budget before allowing real receipts. Sources are retained until removal; backups may retain deleted data longer.
- Treat stored model metadata as application provenance, not an attestation. Authenticated owners can directly alter their own database rows under current all-operation RLS grants. Other owners remain isolated, but tamper-proof audit would require a separate trusted-write design.

## Rollback

Turn off `CLOSET_PURCHASE_IMPORTS` and restart the API. Existing photo import and styling remain available. Keep the additive tables while deciding retention; dropping them would destroy recovery receipts. Revert the application commit if necessary, without overwriting current closet snapshots. A garment already confirmed into a closet is ordinary wardrobe data and is removed through normal editing.

## Official reading

- [Supabase database functions](https://supabase.com/docs/guides/database/functions): invoker/definer behavior and explicit execution grants.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): user identity and owner policies.
- [PGlite API](https://pglite.dev/docs/api): queries, SQL execution and transactions used by the local test.

These references explain the services; the measured claims above come from the repository's tests, not from vendor promises.
