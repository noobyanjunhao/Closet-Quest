# Closet Quest: operational and responsible-deployment audit

Measured November 17, 2026. [Try the deployed app](https://closet-quest-junhao-s7.onrender.com/) and [inspect the repository](https://github.com/noobyanjunhao/Closet-Quest).

This audit responds to the TA's shopping overload, privacy and retention concerns. It tests application behavior with synthetic data. It is not a user study, a production load guarantee, a formal WCAG assessment or a security certification. No private wardrobe was included, and no external model, retailer or cloud database was contacted by these experiments.

## What changed

The earlier shopping fix introduced a reusable library, one shared search for identical requests, a two-worker queue and clearly marked older results during an outage. This audit found three defects at the boundaries of that design. Forty callers waiting for the same search could still generate forty identical database writes for one account. A queue refusal was counted as evidence that the provider was down. Finally, a malformed provider or saved-library response could return a price above the requested budget.

The library now shares identical pending saves within each account, filters prices against the query budget, and separates local capacity failures from provider failures. Its inference allowance is charged only when a provider call actually starts; a distributed cache hit does not use that allowance. Separate accounts still receive separate writes, and one account's exhausted allowance cannot deny an eligible account waiting for the same query. None of these changes weakens authentication, owner scope or the queue limit.

| Measured boundary | Before this patch | After this patch |
|---|---:|---:|
| Database writes for 40 identical requests from one synthetic account | 40 | 1 |
| Successful responses in that scenario | 40/40 | 40/40 |
| Provider calls in that scenario | 1 | 1 |
| Over-budget products returned from an injected mixed-price response | 1/2 | 0/1 |
| Local capacity refusals incorrectly counted as provider failures | 3/3 | 0/3 |
| Inference allowances consumed for one started call and three refused calls | 4 | 1 |

The before and after measurements were captured during this patch in `output/sprint9/shopping-boundaries-before.json` and `shopping-boundaries-after.json`. These are deliberately constructed defects, not observed customer incidents. A single timing sample is not presented as a speed benchmark.

## Load and failure results

The new harness sends real HTTP requests through the application's `/shopping` middleware. Authentication and the provider are synthetic, and outbound `fetch` is blocked. Each burst contains 40 requests. The old baseline reconstructs the earlier immediate two-request admission limit; it is not a replay of live retailer traffic.

| Scenario | Success | Provider calls | p95 response time |
|---|---:|---:|---:|
| Old immediate-admission baseline | 2/40; 38 returned 429 | 2 | 47.32 ms |
| Current, identical requests, cold library | 40/40 | 1 | 72.47 ms |
| Current, identical requests, warm library | 40/40 | 0 | 15.30 ms |
| Current, 40 distinct queries, cold library | 40/40 | 40 | 900.91 ms |
| Current, 40 distinct queries, warm library | 40/40 | 0 | 68.33 ms |
| Forced overload: 500 ms provider, 250 ms queue wait | 2/40; 38 returned 503 | 2 | 278.89 ms |
| Provider outage with a two-day-old saved result | 40/40, all marked saved fallback | 1 failed call | 69.82 ms |

The normal scenarios inject a 40 ms provider delay and a 4 s queue wait. The overload scenario intentionally makes the queue deadline shorter than the provider response. All 38 refused requests include `Retry-After`, the queue drains, and refusal does not open the provider circuit. This is bounded failure, not successful scale-out. Real shopping calls can take much longer, so unique uncached requests remain an operational risk. Reuse helps most when queries repeat. None of the local latency numbers includes mobile networking, Render cold starts or retailer/model latency.

The saved-result scenario preserves a usable response during an injected failure without calling it fresh. Its next 40 requests make zero additional provider calls during cooldown. Actual prices, variants, sizing, stock and shipping still require checking the retailer. See `output/sprint9/shopping-http-validation.json` for every denominator and parameter.

## Privacy, deletion and retention

The scoped audit passed **97/97 automated checks**. It covers synthetic owner isolation at the application boundary, secure session handling, stale-write rejection, private photo paths, job cancellation and expiry, shopping validation, untrusted-context boundaries, navigation behavior and separation of human outcomes from rehearsals. The JSON matrix and raw TAP log list the tested files and limits. The final [PR #11 CI run](https://github.com/noobyanjunhao/Closet-Quest/actions/runs/44029828697) passed **323/323 Node tests**, 19 Python tests, CPU inference, frontend/container builds and container smoke. Its merged runtime revision is `77f50e358f1ab9ff0da2c00c2e1879c5bb67e9bb`; deployment verification is recorded separately.

| Data or control | What exists now | Remaining limitation |
|---|---|---|
| Recognition job inputs | Finished and cancelled job photos are removed; restart cleanup removes orphaned job files. | Filesystem failures are diagnosed and retried on cleanup/restart; this is not proof of physical-media erasure. |
| Recognition results | Default result retention is 30 minutes. A periodic cleanup runs even without a new request. | Accelerated synthetic tests verify the mechanism; provider copies are outside this cleanup. |
| Saved wardrobe and photos | Authentication and owner-scoped database/storage policies protect the account. Backup export preserves the user's available photos. | Removing a garment updates wardrobe data but **does not delete its saved storage object**. No complete self-service account-erasure workflow exists. |
| Purchase text | Draft ownership, cancellation, deletion routes and duplicate-safe commit behavior are tested. | Deleting a committed import's source/audit data intentionally retains deduplication receipts and the garments already approved by the user. This is not full account erasure. |
| Shopping library | Only constrained category, occasion, presentation and budget reach public product search; personal notes/photos are excluded. Account-controlled records never enter the shared catalog. | Saved product metadata can be stale; a displayed retailer link is not a guarantee of current availability. |
| External AI analysis | Manual photo review and keyword-based retrieval are available where configured. Selected external analysis sends the chosen photo to its provider. | Application `store:false` settings are not a provider-retention audit and do not establish zero retention. |
| Accessibility | Source-level checks cover reduced-motion rules; navigation continuity has unit and browser checks. | OS-level reduced-motion behavior, all contrast/focus paths, screen-reader names and assistive-technology use still need a full manual assessment. |

For now, users can export a backup and remove pieces or notes through the app, but should not interpret those controls as complete account deletion. A request for complete erasure must be handled by the project owner. There is no automated completion receipt or verified retention deadline for that request yet. Before wider release, implement an authenticated, clearly confirmed erasure workflow that inventories the owner's wardrobe, stored photos, style notes, imports and saved shopping data; reports failures; preserves only explicitly justified records; and tests that deletion cannot affect another account. Keep an export opportunity before irreversible deletion. Do not delete live data merely to produce an audit screenshot.

## Accuracy and independent testing remain separate

Keeping valid detections from a malformed response improves technical recovery. It does not prove that every garment was found or that an outfit is acceptable. The prior blurred-photo recall of 59.6% remains a known limit. Existing quality warnings are advisory and never claim an inventory is complete. This audit did not run a new recognition model or introduce a new phone-photo set.

The next independent session must freeze the deployed revision and model configuration, let a person outside the development team use their own phone photos without code changes during the session, and record separate denominators for workflow completion, detected-garment corrections, correction time, top-three outfit acceptance, evidence usefulness, fallback frequency and cold/warm latency. An AI rehearsal, even if supervised, cannot silently replace direct human task execution or self-reported acceptance.

Priority order: (1) complete the independent phone session and resolve its highest-impact defects; (2) implement and verify saved-photo/account erasure; (3) measure production shopping arrival patterns and cold starts before changing capacity; (4) assess accessibility with keyboard and assistive-technology users; (5) expand recognition evaluation using unseen, independently labeled phone photos. Increasing model complexity alone does not resolve these gaps.

## Reproduce without spending

```sh
node scripts/experiment-shopping-boundaries.mjs after
node scripts/experiment-shopping-http.mjs
node scripts/audit-responsible-deployment.mjs
npm test
```

The boundary `before` mode is for the pre-patch library only: it asserts the old defects and refuses to overwrite the saved baseline. To reproduce it, use a separate checkout of the pre-patch release and copy only the harness into that checkout. Do not replace the working production library. The HTTP baseline is contained in its harness and can be rerun alongside the current implementation. On Windows, a restricted sandbox may block loopback sockets or temporary-file rename; the measurements above ran with those local operations permitted, with credentials stripped and external fetch blocked in the HTTP harness.
