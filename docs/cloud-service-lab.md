# Cloud import implementation and experiments

This replaces the earlier learning lab. Read the [actual implementation and validation report](purchase-ml-cloud-report.md) for results, failures and the model promotion decision.

Migrations 003–005 are applied to the existing free Supabase project: owner-scoped drafts, audit records, atomic wardrobe insertion, a durable queue and a private worker registry. An outbound HTTPS worker runs on the existing laptop. Its hashed, seven-day credential can claim queued text and return review drafts, but cannot read wardrobes or approve imports. Model ports remain private; no service-role key is used.

The Node app supports worker mode and an explicitly labeled fast-parser fallback when a new import has no recent worker heartbeat. Every garment still needs review and ownership confirmation. Free services can sleep or reach quotas; durable storage does not guarantee always-on processing.

Actual validation passed 8/8 live SQL isolation/transaction checks and 6/6 live HTTPS queue checks, including three concurrent claims, a wrong lease and completion replay. A separate real LoRA round trip took 3.715 seconds but missed the garment: transport succeeded while extraction failed. Evidence is in output/purchase-ml/cloud/.

The implementation is in server/purchase-cloud-store.js, server/purchase-worker-client.js, server/purchase-rules.js and scripts/purchase-worker.mjs. Executable experiments are in supabase/experiments/ and scripts/experiment-purchase-*.mjs. These are implemented services and measured experiments, not a proposed cloud exercise.

Credential renewal, independent two-browser auth testing and always-on inference remain unfinished. If a worker disappears just after its heartbeat, an existing draft can wait until worker recovery or cancellation; expiry cleanup runs during polling. Roll back with CLOSET_PURCHASE_IMPORTS=0 and retain durable drafts.
