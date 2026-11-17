# Sprint 9 delivery checklist and independent-test handoff

[Live beta](https://closet-quest-junhao-s7.onrender.com/) · [Repository](https://github.com/noobyanjunhao/Closet-Quest) · [Validation report](sprint9-beta-validation.md) · [User guide](beta-user-guide.md) · [Developer guide](developer-guide.md) · [Deployment instructions](beta-deployment.md)

This is a requirements-to-evidence map, not a claim that all gates are complete. On November 17, release `77f50e358f1ab9ff0da2c00c2e1879c5bb67e9bb` was verified live on Free Render. Its CI passed 323 Node tests, 19 Python tests, CPU inference, frontend/container builds and container smoke. The database connection and SMTP delivery were repaired; real owner signup, email confirmation and sign-in succeeded. All 19 restored/reviewed pieces survived a signed-in reload on this release. [Recovery verification](../output/sprint9/recovery-verification.json) and [final release verification](../output/sprint9/final-release-verification.json) distinguish the observations. The old project was unreachable; deletion is not proven.

## Requirement coverage

| Sprint 9 requirement | Delivered capability and evidence | What still closes the gate |
|---|---|---|
| **Beta system completeness — 50%:** accounts and persistence | Supabase authentication, owner policies, private photos and revision-checked sync. Real owner signup/confirmation/sign-in verified after recovery. Replacement-project SQL verified owner access, stale-write rejection and cross-owner/anonymous denial; signed-in reload retained 19 pieces on the final candidate. | Keep owner recovery separate from the independent-person test; validate physical-phone capture and cross-device use. |
| Core photo workflow | Camera/file selection, multi-image and multi-piece review, retained valid detections, manual correction and durable jobs. Recognition/job regression tests. | Physical phone camera and unseen-photo session; record missed pieces and correction time. Fixture success is not recognition accuracy. |
| Useful stylist output | Owned-clothes RAG, preference/context handling, partial-closet suggestions, validation and same-evidence fallback. Paired experiment, injected failures and two live wedding briefs using Luna/Sol without fallback. | Verify these capabilities through the authenticated deployed interface and collect wearer acceptance; local module calls are not hosted smoke tests. |
| Save, revisit and recovery | Original 17-record cloud restore synced and survived reload; assisted review added two records. Final 19-piece/one-Quick-look re-entry and cloud sync passed on the deployed release. Fresh backup retained all originals and six decodable photo records (four source photos, two reuses). | Independent participant must also save/wear/revisit; no wear or acceptance rating was recorded by the recovery operator. |
| Optional shopping | Reusable products, budget ordering, source links, missing-piece separation and bounded retries. New real-local-HTTP fixture test: 40/40 equivalent requests, one provider call; warm repeat zero. New catalog-save coalescing: 40 to one write. | Confirm images/links render in the hosted interface and disclose observed prices, stale variants and incomplete coverage. Slow distinct requests still receive bounded 503; no production capacity claim. |
| **Independent testing / defect resolution — 30%** | Six-task in-app measurement form, release freeze checks, operator mode, safe export; agent-assisted review and three targeted retests. | One actual outside person must operate the core workflow without code changes during the session. Human acceptance/correction results are not yet in the available evidence. |
| **Deployment / documentation — 20%** | Locked dependencies, Node 24, non-root container, GitHub CI, Render runbook, user/developer guides and final revision/probe evidence. Deployment instructions include rollback and scoped-worker reconnection. | Freeze that revision for the independent session; rerun optional purchase-worker setup against the replacement backend before claiming it verified. |

The fixture/agent evidence is useful and remains in the report. It cannot replace the independent-human requirement. A person supervising an agent may provide valuable feedback, but supervision is a different execution mode from operating the app themselves.

## Evidence currently available

- [Final release verification](../output/sprint9/final-release-verification.json): deployed `77f50e3`, 323 Node/19 Python tests, actual health/version/auth-path checks and signed-in 19-piece reload. [Recovery verification](../output/sprint9/recovery-verification.json) preserves the earlier 312-test authentication repair and the subsequent owner-account restoration. The November 16 [294-test release record](../output/sprint9/beta-completeness-verification.json) remains historical outage evidence. Free hosting is unchanged.
- [Browser retest](../output/sprint9/flow-completeness.json): five synthetic local checks passed (wedding context, save feedback, navigation and reload continuity). Backup round-trip was not completed because the download-event automation stalled; helper tests are separate evidence.
- [Previous hosted and CI verification](../output/sprint9/nfr-verification.json): November 16 anonymous hosted checks; 268 repository Node tests, 19 Python tests and build/container checks for the prior published revision.
- [Bounded live capabilities](../output/sprint9/live-capabilities.json): four usable OpenAI calls through application modules on public sample data: tee-category recognition (5.197 s), wedding styling with Luna (3.086 s) and Sol (8.108 s), and retailer search (12.241 s; two products with image URLs). The original recognition assertion incorrectly expected `data.items`; it was corrected from the saved first-garment result without another paid call. This checks one tee category, not full-scene recall. These are local module/provider checks, not hosted authentication, human acceptance or independently verified price/stock results.
- [Routing experiment](../output/sprint9/stylist-nfr.json): 36 requests per route, only owned IDs in all requests, 36 versus 18 mocked generation calls. No live model latency or human preference claim.
- [Shopping burst experiment](../output/sprint9/shopping-load.json): equivalent requests 2/40 to 40/40 with one provider call; the slow-provider stress failure remains visible.
- [Current shopping HTTP validation](../output/sprint9/shopping-http-validation.json): actual application middleware with synthetic auth/provider; 40/40 equivalent and distinct requests under the stated 40 ms fixture. Forced overload returns 38/40 retryable 503; provider outage with saved results returns 40/40 explicitly stale fallbacks. [Boundary before](../output/sprint9/shopping-boundaries-before.json) and [after](../output/sprint9/shopping-boundaries-after.json) verify duplicate cloud-write reduction, budget filtering and correct capacity accounting.
- [Responsible-deployment audit](responsible-deployment-audit.md): 97/97 scoped automated checks; explicit open cloud-photo erasure/provider-retention issues and partial accessibility coverage. No WCAG or security certification claim.
- [Current closet UI review](../output/sprint9/closet-ui-review.json): three emulated viewport widths, 7/7 sample images loaded, 44-pixel carousel controls, keyboard focus retained, saved rail position preserved, three sample Quick looks saved, and selected 5.19-8.54:1 contrast calculations. No physical phone, camera, screen-reader or full WCAG result is inferred. The report uses the inspected demo-only phone/desktop screenshots.
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

## Direct response to the Sprint 8 review

| TA comment | This iteration's response | Evidence boundary |
|---|---|---|
| Use real phone photos and real users | Six-task frozen-release session, operator provenance, correction timer and safe export are ready. | A human-operated independent session remains pending. No agent rating is relabeled as a human answer. |
| Separate recovery, acceptance and correction burden | Report and export keep completion/owned-ID checks, top-three acceptance and correction seconds in separate fields with denominators. | Human acceptance/correction values are missing, not zero. |
| Treat 38/40 shopping 429s as an operational issue | Bounded queue, equivalent-search sharing, cache reuse, account-save coalescing, retryable overload and stale fallback; new before/after experiment. | Synthetic provider over real local HTTP, not live traffic capacity. |
| Blur still misses clothes | Preserve valid pieces, surface advisory quality warnings, retain manual correction. | 59.6% prior blurred recall is not claimed improved by warnings. 20 photos × 3 conditions equals 60 correlated observations. |
| Document retention, deletion and accessibility | A scoped 97-test audit and explicit open/partial matrix now exist. | Saved cloud-photo erasure, provider retention, full WCAG and real assistive-technology testing remain open. |
| External prices/variants and privacy | Source links, observed price/budget validation, stale labels, manual recognition and photo-free styling context. | Retailer facts still require user verification; selected recognition photos still reach a provider. |
