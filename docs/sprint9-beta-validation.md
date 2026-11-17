# Closet Quest: a beta people can test

**Try the app:** https://closet-quest-junhao-s7.onrender.com/  
**Repository:** https://github.com/noobyanjunhao/Closet-Quest  
November 16, 2026. Please try the core workflow and tell us where you get stuck. This report separates completed engineering experiments and an agent-assisted usability review from human outcomes that have not yet been recorded.

## 1. Beta completeness and measurable requirements

Closet Quest helps people reuse their clothes: add photos, review recognized pieces, describe an occasion, receive an outfit grounded in their closet, and save or record wearing it. A small closet can produce a starting point rather than a refusal. Missing-piece ideas and optional retailer finds stay separate from owned clothes. Supabase provides accounts, private storage and saved wardrobe data; Render hosts the React/Vite client and Node API.

The Sprint 8 review identified incomplete recognition under blur, fragile shopping bursts and insufficient evidence from real people. Sprint 9 retains valid-piece recovery, adds visible photo-quality warnings, bounded shopping queues and cache reuse, safe study exports, periodic terminal-job cleanup, and a frozen-session feedback flow. This iteration adds a stylist orchestrator, fixes the review's navigation and recovery problems, and checks real OpenAI responses on public sample data.

Six bounded specialists handle preference filtering, wardrobe retrieval, document retrieval, outfit planning, style selection and ownership validation. They are application modules, not six extra paid model calls. Retrieval branches run in parallel. Routine Automatic/Fast briefs can use the local planner; richer briefs and explicit provider choices retain their selected model. There is at most one generation attempt. A provider failure or deadline triggers a local suggestion using the same retrieved wardrobe and a visible fallback notice.

The model receives reviewed descriptions, supplied plan IDs, preferences and bounded document excerpts. Styling does not send photos. Output validation maps selected plans back to owned garment IDs. A new safe trace records the actual route, timing and fallback without copying private prompts or notes. A user-facing explanation clarifies how the suggestion was made. These checks establish grounding, not taste or formal-event suitability.

The acceptance contract sets concrete targets: all returned IDs must belong to reviewed clothes; Fast retrieval and generation have four- and twelve-second budgets; offline styling must make zero remote generation or embedding calls. Usability requires an outside person to attempt all six tasks on an unchanged release, with assistance, correction seconds and top-three acceptance recorded separately. Owner scope, server-only secrets and allowlisted exports are security requirements. Human and independent-audit targets are not marked passed without evidence.

## 2. Before-and-after engineering evidence

We ran twelve synthetic briefs three times per route, giving 36 requests per condition. Half were routine prompts such as “Style me”; half described richer occasions. The baseline always invoked a deterministic 40 ms generation fixture; the new condition used automatic routing. Both used the same wardrobe, planner and validation. Order alternated by repetition. Network access was blocked, so there were zero paid calls.

| Measure | Always-model fixture | Routed fixture | Meaning |
|---|---:|---:|---|
| Requests returning outfits | 36/36 | 36/36 | Structural completion |
| Owned-only output IDs | 36/36 | 36/36 | Grounding, not taste |
| Generation fixture calls | 36 | 18 | 50% fewer on this workload |
| Median latency | 46.52 ms | 1.57 ms | Local fixture measurement |
| p95 latency | 47.64 ms | 47.89 ms | Richer briefs still generate |

The median improves because the routine half skips generation; the tail does not improve. These results cannot establish production model latency or dollar savings. Four injected conditions—provider error, unknown plan, empty selection and timeout—each recovered with owned suggestions after exactly one generation attempt. Offline-policy tests verify that even an explicit Deep request cannot trigger styling generation or embeddings. The updated local suite passes 294/294 Node tests, including rendered-component checks, hosted capability gates, backup validation and three practice-stack checks.

With explicit permission for up to $5, we then made four bounded live calls through the actual application modules. These used a public tee photograph and a sample wardrobe, rather than private photos. Both stylist calls retrieved wardrobe evidence without paid embeddings and returned owned outfits without fallback. This is a capability smoke test, not an accuracy or latency benchmark.

| Live check | Observed result |
|---|---|
| Multi-piece endpoint, gpt-6-luna | Identified the public image as a white T-shirt / Top in 5.20 s. One image does not establish scene recall. |
| Wedding brief, Fast / gpt-6-luna | Valid owned outfit in 3.09 s; explanation acknowledged the missing formal shoes. |
| Same brief, Balanced / gpt-6.1-sol | Valid owned outfit in 8.11 s; no provider fallback. |
| Formal-shoe search | Two J.Crew results with images and prices of $59.99 and $99.99 in 12.24 s. Prices and variants were not independently verified. |

The initial recognition assertion expected the wrong response field. We corrected its category check from saved `data`, retained the failed assertion, and made no repeat call. New accounts default to Balanced; Fast and Quick remain available. One paired brief shows a latency tradeoff, not better outfit quality.

Earlier shopping load tests used 40 simultaneous local HTTP requests and a 40 ms fixture provider. Equivalent searches improved from 2/40 completions to 40/40 with one provider call. Distinct cold searches completed 40/40 at peak concurrency two; warm repeats needed zero calls. A 120 ms provider with a shortened 50 ms queue deadline completed only 2/40, with 38 HTTP 503 responses. This measures bounded backpressure, not live retailer capacity.

No new human phone photos were tested. Earlier warnings flagged 0/20 original photographs, 12/20 dimmed images and 20/20 small/blurred variants. These 80 correlated samples measure warning coverage, not recall; blurred-image warnings used a resolution rule. Sprint 8's 59.6% blurred recall remains a limitation.

## 3. Ashley's review and resolved defects

The owner identified Ashley as the person supervising a fresh-context review agent. The actions recorded here were agent-operated; human attendance, ratings and independent task completion were not instrumented or inferred. The reviewer received URLs and user goals, without code, previous reports or credentials. The beta form now records who operates the app, allowing supervised reviews to be kept separately from direct-human outcomes.

The public visit initially showed Render's startup screen, then reached sign-in. Delay was not timed. Sign-up and password recovery were inspected without submitting forms. A copied local build then provided a frozen, credential-free sample closet. All server outbound requests were blocked, styling used local rules, and live recognition/account sync were deliberately outside scope. The development source could change while the copied baseline remained unchanged; fixes used a separate retest snapshot.

The reviewer manually added a synthetic shirt, retained it as the starting piece for a formal wedding brief, inspected wardrobe evidence, renamed and saved a look, and found both garment and saved look after reload. Escape closed the modal and the Right arrow advanced the rail. Advice cautioned that the casual shoes might not meet the dress code and suggested borrowing or renting dress shoes. These are observed interface outcomes, not Ashley's endorsement of the outfit.

| Finding | Fix and observed retest |
|---|---|
| Wedding advice suggested shoes but shopping default retained Top | Reuse a previous category only if it fits current gaps. Separate retest selected Dress shoes correctly. |
| Quick evidence claimed “Included in the model context” | Quick now says references are available to read and no model was used. Retest confirmed correct text and zero model attempts. |
| Local settings exposed export without import | Import is now visible locally. Follow-up testing found and fixed a null-account crash; validated backups preserve the current local wardrobe namespace. |
| Public introduction gave little workflow/provider context | Added expandable workflow, privacy, recovery and service-cost explanation. The updated disclosures were verified on the deployed sign-in page. |
| Save confirmation fleeting; reload changed current page | Persistent saved confirmation and a saved-look shortcut were added. Page and scroll position now persist per account in the browser session. |
| Wedding result retained the default occasion label | The collapsed brief and shopping context now use the returned occasion. Rendered-component tests verify the wedding label. |
| Hosted controls offered unavailable local models | Capabilities avoid repeated localhost probes and disable unavailable local generation. Manual photo review and keyword-only search remain selectable privacy options; neither silently switches to OpenAI. |

Hosted receipt retries now use the rules fallback when a worker is offline, with revision checks against concurrent worker claims. These fixes have regression coverage. A preliminary menu-accessibility concern remains; no formal WCAG claim is made. Physical camera use, human correction time, human top-three acceptance and email delivery were not measured here.

Verified direct-human completed sessions remain zero in the available results. To close the independent-testing requirement, Ashley needs to operate the six tasks herself on a frozen deployed revision and export the outcomes. Preserve failed/skipped tasks and assistance. A supervised agent pass is useful defect discovery, but does not establish unassisted usability. Highest-priority defects from that human session must be reproduced, fixed and retested on a separately identified release.

## 4. Deployment, privacy and remaining gates

The runbook specifies Node 24, locked dependencies, credential-isolated tests, frontend build, non-root container and health/version checks. PR #5 passed GitHub CI (294 Node tests, 19 Python tests, frontend and container builds, and container smoke), was merged, and deployed to Render as `d5c7c45b69012db4b38b8e56d36796a06a899675`. The public revision matched; health returned 200 and anonymous access to the protected beta endpoint returned 401. The concise user/developer guides cover tasks, recovery, configuration, APIs and deployment; the checklist maps the evidence to each requirement.

**The hosted beta is not yet ready for an independent end-to-end session.** Sign-in displayed “Cloud connection interrupted” before and after this deployment. A read-only health request to the existing Supabase project failed with DNS `ENOTFOUND`. We have not confirmed whether that project is paused, removed or otherwise unavailable. Recovery requires the original Supabase owner account, then a signed-in photo/style/save/re-entry check. A successful Render deploy and passing unit tests do not establish account availability. No private wardrobe was modified during these checks.

The four live model calls used the separately approved $5 test allowance; no hosting upgrade or AWS deployment was authorized by that allowance. The user explicitly chose to keep Render Free, so cold starts remain a limitation. `CLOSET_STYLIST_POLICY=offline` disables remote styling, but is not a spending cap for shopping, recognition or hosting. The AWS catalog extension remains implemented and locally tested, but undeployed; no free-plan restrictions were bypassed.

Security checks cover authentication, owner scope, bounded input, safe exports and absence of private content from operational traces. They are not a penetration test. Photo analysis still sends images to the chosen provider. Removing a garment does not yet erase every cloud photo copy. Full erasure/retention auditing, formal accessibility review, real phone performance, retailer price/variant verification and human acceptance remain open. The next release gate is the frozen direct-human session followed by resolution and retesting of blocking defects.

Supporting material: [release verification](../output/sprint9/beta-completeness-verification.json), [acceptance contract and architecture](sprint9-nonfunctional-requirements.md), [Ashley review](ashley-review.md), [browser retest](../output/sprint9/flow-completeness.json), [paired experiment](../output/sprint9/stylist-nfr.json), [live API results](../output/sprint9/live-capabilities.json), [deployment instructions](beta-deployment.md), [user guide](beta-user-guide.md), [developer guide](developer-guide.md), and [delivery checklist](sprint9-delivery-checklist.md).
