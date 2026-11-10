# Closet Quest: beta release and independent testing

**Try the app:** https://closet-quest-junhao-s7.onrender.com/  
**Repository:** https://github.com/noobyanjunhao/Closet-Quest  
Prepared November 9, 2026. Independent-test results are pending. This is a beta-readiness report, not a claim that the Sprint 9 user requirement has already been completed.

## What changed after the review

Sprint 8 recovered valid garments from partially malformed scenes, but its 20-photo experiment and browser walkthrough did not establish real-user acceptance. The review also identified poor shopping burst behavior and incomplete deletion/retention evidence. This release keeps the validated-piece recovery and addresses the next operational and measurement gaps.

Shopping now combines the existing reusable product library with bounded FIFO admission, equivalent-request coalescing, a short failure cooldown and a circuit breaker. Old saved products can remain available with their original checked date when live search fails. Direct stylist calls also get a bounded wait instead of immediate rejection whenever two requests are active. Inference budgets, product-source checks and ownership constraints remain enforced.

Photo processing measures resolution, mean luminance and Laplacian variance before inference. The multi-piece screen prominently explains low-detail conditions and asks the user to compare the retained pieces against the photo. These are advisory heuristics, not calibrated confidence or proof that a closet is complete. The earlier low-resolution warning already existed inside garment uncertainty; this release surfaces it at scene review and adds dark/soft-detail diagnostics. It does not claim to restore information lost to blur.

The beta feedback flow records a pseudonymous participant code, deployment revision, independence/freeze attestations, six core task outcomes, assistance, timings, correction burden, top-three acceptance and evidence usefulness. It persists across navigation and is included in the private account snapshot. Exports use an allowlist. Inspection found that the older paired-study export could include its display payload, including personal source-note excerpts; that payload is now excluded and covered by regression tests.

## Measured engineering results

The load experiment uses a real loopback HTTP server and a deterministic 40 ms shopping provider. It compares the old two-slot immediate-rejection behavior with the current library/queue path. It is deliberately not described as live retailer throughput. Each burst contains 40 simultaneous requests.

| Workload | Before | Beta | Provider calls in beta |
|---|---:|---:|---:|
| Equivalent cold searches | 2/40 completed; 38 HTTP 429 | 40/40 completed | 1 |
| Distinct budget queries | 2/40 completed; 38 HTTP 429 | 40/40 completed | 40, peak concurrency 2 |
| Repeated cached queries | Not part of old burst comparison | 40/40 completed | 0 |
| Provider slower than wait budget (120 ms / 50 ms stress setting) | Not compared | 2/40 completed; 38 HTTP 503 | 2 |

For the distinct-query beta burst, observed median/p95 local response time was 492/912 ms; the cached repeat was 57/58 ms. Equivalent requests completed in 94/96 ms median/p95 and their cached repeat in 36/39 ms. These times include local HTTP overhead and fixture latency. Real searches can take seconds; high-cardinality cold demand can still exceed the queue's wait budget. The stress failure remains in the denominator. Reuse and bounds improve recovery and cost behavior, not unlimited concurrency.

The photo-quality experiment reuses the 20 frozen Sprint 8 photos, each original, dimmed and small/blurred: 20 independent photos and 60 correlated variants. The current heuristic warned on 0/20 originals, 12/20 dimmed variants and 20/20 small/blurred variants. Median analysis time was 7.42, 7.94 and 2.60 ms respectively. All blurred variants triggered the resolution rule, not the soft-detail threshold. These results measure warning coverage under known transformations; they do not establish blur detection sensitivity, phone-photo correctness or improved model recall. No new paid model calls were made, and Sprint 8's 59.6% blurred-image recall remains the last measured recognition result for that stratum.

The optional AWS catalog implementation was exercised with the official AWS SDK against a loopback Dynalite server. Forty requests across two separate SDK clients completed using one synthetic refresh and 39 shared-cache responses. Conditional writes rejected an obsolete worker and prevented it from releasing another worker's lease; recovery after the valid release passed. The corrected run took 367 ms, created zero cloud resources and made zero paid model calls. This is an integration experiment, not evidence of AWS-hosted load capacity. The first Linux CI run exposed a race that performed two refreshes: another worker could publish between the initial read and lock acquisition. A second read under the lock fixes this; a deterministic regression test reproduces that ordering.

The current automated suite passes **261/261 Node tests**. The production frontend build passes, and the current npm audit reports **zero known vulnerabilities**. The code includes container CI and an AWS SAM template; actual release, CI and infrastructure status are recorded separately rather than inferred from local test success.

## Independent test and defect resolution

The owner has agreed to recruit at least one tester outside the development team. As of this report, **independent participants = 0; completed independent sessions = 0**. Task completion, outfit acceptance and correction time therefore remain unmeasured. Agent rehearsals and synthetic results do not substitute for this requirement.

The tester will use their own previously unseen phone photos and a real occasion. Freeze the deployed revision and model/configuration for the session. The six tasks are upload, review/correct, request an outfit, save/wear/revisit, inspect optional external finds, and export/sign out/sign back in. No code changes or coaching occur during the session. The tester can record a failed or skipped task and continue; these stay in the denominator. Record phone/browser, physical camera result, assistance, correction count/time, acceptance of any of the first three outfits, and evidence usefulness separately.

After the test, import the exported measurements into the final report, list each observed defect with severity, reproduce it on the frozen revision, and resolve the highest-priority defects. A fixed release needs a separate retest. Session timings include navigation and time away from the page; active correction timings from the paired-study tool and self-reported correction seconds must not be mixed silently. One participant is useful defect evidence, not a population-level usability estimate.

| Priority / defect | Current disposition |
|---|---|
| P1: burst shopping rejection | Queue/coalescing/cooldown implemented; local before/after results above. Slow distinct misses still bounded. |
| P1: private style-note excerpts in study export | Explicit measurement allowlist implemented and tested. |
| P1: terminal job retention depended on later requests | Periodic cleanup implemented; test verifies file removal without another request. |
| P1: full saved-photo/account erasure | Still open. UI no longer claims a cloud photo is physically erased when a garment is removed. Requires a coordinated storage/database workflow and independent audit. |
| P1: camera, correction burden and outfit acceptance | Awaiting the independent phone session. |
| P2: affordability, variant accuracy and accessibility | Explicit catalog limitations; targeted UI controls checked, formal WCAG and retailer-variant audit still open. |

## Deployment, privacy and next release gate

The beta retains React/Vite, the Node API on Render, and Supabase Auth/Postgres/private photo storage. A multi-stage non-root container, credential-isolated test runner, release metadata endpoint, request IDs and allowlisted request logging improve reproducibility and diagnosis. The AWS extension adds conditional DynamoDB cache leases, a daily Lambda refresh, disabled-by-default scheduling, scoped IAM, bounded concurrency and seven-day logs. It is fully implemented in code but **not yet deployed to AWS**; account access and free-tier eligibility must be checked first. OpenAI and some AWS components can incur charges even at low volume.

Photo inputs still go to the selected AI provider. Completed photo-job input files are removed; terminal records are cleaned after their 30-minute TTL on a periodic sweep while the server runs (up to roughly one extra minute), or when processing resumes after restart. Saved private cloud photos are a separate retention class. Product prices are observed, USD-only, and may be stale or for another variant. RLS and authentication tests are engineering checks, not an independent security audit.

The release gate is a successful deployed smoke test plus at least one completed frozen independent session, followed by resolution and retesting of its highest-priority defects. Full photo erasure, independently verified camera use, broad accessibility and a real AWS deployment remain visible limitations. A perfect or universally scalable backend is not claimed.

Reproduction: [deployment/runbook](beta-deployment.md), [short user guide](beta-user-guide.md), [AWS source](../infra/aws/template.yaml), [supporting results](../output/sprint9/). AWS design follows [conditional item writes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html), [TTL semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html), and [EventBridge scheduling](https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html). The warning policy respects documented [vision limitations](https://developers.openai.com/api/docs/guides/images-vision); the evaluation separates structure and task outcomes rather than treating valid JSON as user value.

