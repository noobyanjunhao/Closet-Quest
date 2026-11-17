# Sprint 9 delivery checklist and independent-test handoff

[Live beta](https://closet-quest-junhao-s7.onrender.com/) · [Repository](https://github.com/noobyanjunhao/Closet-Quest) · [Validation report](sprint9-beta-validation.md) · [User guide](beta-user-guide.md) · [Developer guide](developer-guide.md) · [Deployment instructions](beta-deployment.md)

This is a requirements-to-evidence map, not a claim that all gates are complete. Recheck release metadata after every deployment. The November 16 verification record identifies code revision `3b90ecc82e547b4c0212f978dd04101cd2b78b69`; a documentation-only commit can be newer without changing the deployed app. The current follow-up has 294 passing local Node tests; publication, CI and hosted verification of this new release remain separate gates.

## Requirement coverage

| Sprint 9 requirement | Delivered capability and evidence | What still closes the gate |
|---|---|---|
| **Beta system completeness — 50%:** accounts and persistence | Supabase authentication, owner policies, private photos and revision-checked sync. Auth/ownership regression tests. | Complete fresh signup/confirmation and sign-out/re-entry on the exact candidate; confirm saved data and cross-account isolation. |
| Core photo workflow | Camera/file selection, multi-image and multi-piece review, retained valid detections, manual correction and durable jobs. Recognition/job regression tests. | Physical phone camera and unseen-photo session; record missed pieces and correction time. Fixture success is not recognition accuracy. |
| Useful stylist output | Owned-clothes RAG, preference/context handling, partial-closet suggestions, validation and same-evidence fallback. Paired experiment, injected failures and two live wedding briefs using Luna/Sol without fallback. | Verify these capabilities through the authenticated deployed interface and collect wearer acceptance; local module calls are not hosted smoke tests. |
| Save, revisit and recovery | Saved looks, wears, private sync, backup export/import and conflict handling. Rehearsal verified save/reload. | Execute backup restoration, not only inspect its button; retest on both local and account modes after changes. |
| Optional shopping | Reusable products, budget ordering, source links, missing-piece separation and bounded retries. Local load experiment plus a bounded live search returning two sourced shoe products with image URLs. | Confirm images/links render in the hosted interface and disclose observed prices, stale variants and incomplete coverage. Shopping is not a purchase flow. |
| **Independent testing / defect resolution — 30%** | Six-task in-app measurement form, release freeze checks, operator mode, safe export; agent-assisted review and three targeted retests. | One actual outside person must operate the core workflow without code changes during the session. Human acceptance/correction results are not yet in the available evidence. |
| **Deployment / documentation — 20%** | Locked dependencies, Node 24, non-root container, GitHub CI, Render deployment runbook, user/developer guides. | Capture exact candidate revision/configuration, authenticated smoke results and rollback procedure with the submission. |

The fixture/agent evidence is useful and remains in the report. It cannot replace the independent-human requirement. A person supervising an agent may provide valuable feedback, but supervision is a different execution mode from operating the app themselves.

## Evidence currently available

- **Current follow-up:** 294 local Node tests pass. New-release hosted verification and CI results must be recorded after publication; do not reuse the previous release's pass as proof.
- [Previous hosted and CI verification](../output/sprint9/nfr-verification.json): November 16 anonymous hosted checks; 268 repository Node tests, 19 Python tests and build/container checks for the prior published revision.
- [Bounded live capabilities](../output/sprint9/live-capabilities.json): four usable OpenAI calls through application modules on public sample data: tee-category recognition (5.197 s), wedding styling with Luna (3.086 s) and Sol (8.108 s), and retailer search (12.241 s; two products with image URLs). The original recognition assertion incorrectly expected `data.items`; it was corrected from the saved first-garment result without another paid call. This checks one tee category, not full-scene recall. These are local module/provider checks, not hosted authentication, human acceptance or independently verified price/stock results.
- [Routing experiment](../output/sprint9/stylist-nfr.json): 36 requests per route, only owned IDs in all requests, 36 versus 18 mocked generation calls. No live model latency or human preference claim.
- [Shopping burst experiment](../output/sprint9/shopping-load.json): equivalent requests 2/40 to 40/40 with one provider call; the slow-provider stress failure remains visible.
- [Ashley review](ashley-review.md): fresh-context agent-operated baseline for human supervision, copied frozen builds and targeted retests. No invented human ratings or real phone-photo results.
- [Acceptance contract](sprint9-nonfunctional-requirements.md): accuracy, latency, usability, privacy, reliability, cost and accessibility targets with their actual evidence boundaries.

## Independent-tester handoff

Give this section and the [user guide](beta-user-guide.md) to a person outside the development team. Do not coach their navigation. A session can reveal failures and still be useful; don't remove failed or skipped tasks from the results.

**Before the session, the release owner records:** candidate Git revision from `/version.json`; selected provider/model profile and any server model overrides (names only, no keys); deployment date; device/browser; test start/end; and a participant code such as `p01`. Agree that no code, environment, model configuration or deployment changes will occur until the session ends. Obtain consent for the anonymized outcomes. Choose the app's direct-human operator mode only when the person actually performs the actions.

**Participant brief:** “Use your own clothes and a real upcoming occasion. Work as you would without a developer beside you. If something fails, record what happened and continue where possible. You do not need to buy anything or upload a sensitive photo.”

| Task | Outcome to attempt | Record separately |
|---|---|---|
| 1. Add clothes | Use the phone camera/upload to add at least three pieces, including one multi-piece photo. | Camera result, photo count, any help. |
| 2. Review | Compare detected pieces with the photo, correct mistakes and save. | Missed pieces, correction count and correction seconds. |
| 3. Style | Request an outfit for the real occasion and inspect the evidence. | Whether any of the first three looks is wearable; evidence usefulness 1–5; fallback observed. |
| 4. Keep a look | Save, record a wear, navigate away and find the look again. | Completion/failure and any lost state. |
| 5. Inspect a missing piece | If relevant, inspect an external find and retailer source. No purchase. | Link/image usefulness, mismatch or missing results; mark skipped if inapplicable. |
| 6. Return | Export a backup, sign out and sign in; find the same clothes and saved look. | Persistence and recovery result. |

Use **More → Beta test & feedback** to time each task and export results. The task timer includes time away from the feedback page. Correction seconds are a separate self-report. Do not invent zeroes for missing measurements; leave unrated fields blank. Save short defect descriptions separately: task, exact action, expected/actual behavior, severity, screenshot without private information, and request ID if available. The export intentionally omits photos, wardrobe names, full prompts and personal note excerpts.

If a serious privacy/data-loss defect appears, stop and preserve the failed attempt. The developer fixes it only after the session ends, then deploys a new revision and asks for a separately recorded retest. One participant provides actionable defect evidence, not a population-wide usability estimate.

## Concise independent-test report to finalize

Fill this table only from the participant export and their actual feedback. Keep the agent-assisted report as a separate appendix.

| Report field | Current verified status / entry to collect |
|---|---|
| Independent participant and completed-session count | No completed direct-human session is recorded in the available results. |
| Frozen revision, configuration, device/browser, start/end | Collect at session start; verify revision remains unchanged. |
| Task completion | Report passed/failed/skipped out of all six tasks, plus assistance. |
| Human impact | Top-three acceptance, correction count/seconds, evidence usefulness; include denominators and missing values. |
| Defects | Prioritize blockers/data loss/privacy over cosmetic issues; preserve reproducible actions. |
| Resolution | Record fix commit, regression check, retest revision and observed outcome. |
| Limits | Participant count, photo diversity, network/provider conditions and any unavailable feature. |

## Submission package

Include the beta URL and candidate revision, the concise report, exported anonymized session results, a defect/fix/retest table, and links to these user/developer/deployment documents. Keep credentials, private photo sets, raw account backups and local caches out of the public repository. “Push everything” means publish the complete implementation and reproducible evidence, not personal data or generated secrets.
