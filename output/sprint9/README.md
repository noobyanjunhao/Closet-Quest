# Sprint 9 supporting results

Prepared November 9, 2026 (raw timestamps use UTC).

- `shopping-load.json`: five local HTTP load scenarios, including the intentionally overloaded failure case. The provider is synthetic, with explicit latency and wait budget. Same-query sharing was introduced by the earlier library work; this beta adds bounded admission and cooldown on misses. Results compare the earlier immediate-rejection behavior against the combined current path, not an isolated ablation of this sprint alone.
- `photo-quality.json`: advisory warning analysis on 20 reused Sprint 8 public photographs, with three correlated variants each. No new model calls or recognition-accuracy claim. The frozen manifest remains `output/sprint8/manifest.json`; raw licensed image bytes stay outside Git.
- `aws-catalog-experiment.json`: official AWS SDK + local Dynalite HTTP experiment with two independent clients, conditional leases, fencing and recovery. No AWS resources or paid calls. Dynalite does not emulate IAM, billing or provisioned-throughput behavior.
- `tests.txt`: 260 passing Node tests, including existing end-to-end API boundaries, privacy export checks, retention and new catalog tests. `build.txt`: production frontend build. `dependency-audit.json`: zero known vulnerabilities at this check; not a security certification.
- `aws-template-lint.txt`: empty output from successful cfn-lint 1.60.0 validation of the SAM/CloudFormation template. This is static validation, not a deployed stack.

Reproduce the offline tests with `npm ci && npm test && npm run build`. Run `node scripts/experiment-aws-catalog.mjs` for the emulated cloud experiment. Run `npm run beta:evaluate` only after acquiring the frozen Sprint 8 public images as documented in the earlier evaluation. It writes this sprint's experiment files; archive previous runs before deliberately rerunning. No production account data or secrets belong in this directory.

The initial developer baseline test attempt was interrupted because local environment configuration and sandbox networking made that run unsuitable; it is not used as evidence of application failure. The credential-isolated suite above is the reported run. Independent user sessions have not yet occurred. Record those separately, with the actual frozen revision and participant consent, then update the report from their measured results.

