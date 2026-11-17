# Sprint 9 supporting results

Updated November 17, 2026 (raw timestamps use UTC). Earlier experiments retain their own dates and conditions; they are not new independent-user results.

Latest additions:

- `final-release-verification.json`: release `77f50e3` verified live on Free Render; 323 Node/19 Python tests and build checks passed in CI. Actual hosted health/version checks, synthetic invalid-credential rejection and signed-in 19-piece re-entry are recorded separately.
- `recovery-verification.json`: sanitized November 17 owner-account and deployment recovery record. It supersedes the historical outage status in `beta-completeness-verification.json`, without claiming recovery of old cloud-only data. Backup import status remains explicit.
- `shopping-boundaries-before.json` / `shopping-boundaries-after.json`: before/after synthetic checks of 40 equivalent catalog saves (40 to one cloud write), over-budget injection (one to zero returned products) and three local-capacity refusals (no longer counted as provider failures).
- `shopping-http-validation.json`: actual local application HTTP middleware with synthetic auth/products/provider. Equivalent requests complete 40/40 using one provider call; warm repeat uses zero. Distinct cold requests complete 40/40 under the 40 ms fixture. Forced overload preserves 38/40 retryable 503 responses; outage with saved finds preserves 40/40 explicitly stale responses. This is not hosted traffic or retailer-capacity evidence.
- `responsible-deployment-audit.json` and `.tap`: 97/97 focused automated checks, with saved cloud-photo erasure/provider retention open and accessibility partial. The scope and reproduction commands are in `docs/responsible-deployment-audit.md`.
- `closet-ui-review.json`: local browser checks on seven licensed sample garments and three synthetic Quick looks. The paired `mobile-closet.jpg` and `desktop-closet.jpg` are inspected demo-only captures approved for the report. No private wardrobe/account data or human acceptance ratings appear in them.

Earlier supporting evidence:

- `shopping-load.json`: five local HTTP load scenarios, including the intentionally overloaded failure case. The provider is synthetic, with explicit latency and wait budget. Same-query sharing was introduced by the earlier library work; this beta adds bounded admission and cooldown on misses. Results compare the earlier immediate-rejection behavior against the combined current path, not an isolated ablation of this sprint alone.
- `photo-quality.json`: advisory warning analysis on 20 reused Sprint 8 public photographs, with three correlated variants each. No new model calls or recognition-accuracy claim. The frozen manifest remains `output/sprint8/manifest.json`; raw licensed image bytes stay outside Git.
- `aws-catalog-experiment.json`: official AWS SDK + local Dynalite HTTP experiment with two independent clients, conditional leases, fencing and recovery. No AWS resources or paid calls. Dynalite does not emulate IAM, billing or provisioned-throughput behavior.
- `tests.txt`: 261 passing Node tests, including existing end-to-end API boundaries, privacy export checks, retention and new catalog tests. `build.txt`: production frontend build. `dependency-audit.json`: zero known vulnerabilities at this check; not a security certification.
- `aws-template-lint.txt`: empty output from successful cfn-lint 1.60.0 validation of the SAM/CloudFormation template. This is static validation, not a deployed stack.

Reproduce the offline tests with `npm ci && npm test && npm run build`. Run `node scripts/experiment-aws-catalog.mjs` for the emulated cloud experiment. Run `npm run beta:evaluate` only after acquiring the frozen Sprint 8 public images as documented in the earlier evaluation. It writes this sprint's experiment files; archive previous runs before deliberately rerunning. No production account data or secrets belong in this directory.

The initial developer baseline test attempt was interrupted because local environment configuration and sandbox networking made that run unsuitable; it is not used as evidence of application failure. Historical test counts describe their exact runs rather than the latest suite. No completed independent direct-human session is recorded in these files. Record that session separately, with its frozen revision and participant consent, then update the report from the measured results.
