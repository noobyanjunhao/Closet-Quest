# Sprint 3 reproducibility

From the repository root, run `npm ci`, `npm test`, and `npm run benchmark`.
The benchmark is CPU-only and offline after dependency installation. It exits nonzero if prototype constraint success drops below 70%, any returned outfit violates the oracle, or any impossible request fails to abstain. These gates are **not** the semester human-acceptance target.

## Dataset and procedure

`data/wardrobes.json` is a checked-in, deterministic synthetic dataset: seed 20260913, 30 wardrobes (10 scenario families x 3 wear-count variants), and 180 queries (3 contexts x ordinary/low-use quest). It is original metadata, not user observations, fashion-expert annotations, or photos. Item counts vary by scenario; every record and query is inspectable. `npm run data:generate` rebuilds the fixture; its SHA-256 is recorded in each result.

Scenarios: balanced, context conflict, dress only, missing shoes, sparse, unknown tags, all used, mixed-case tags, dress alternatives, and deliberately mislabeled footwear. Three variants of one scenario are correlated; 180 requests must not be presented as 180 independent people or closets. No training/test split exists because there is no trained model. The fixtures are development evaluation data, not a blinded holdout.

The baseline `baseline-v1.js` freezes the initial repository algorithm from commit `dab74ace8072280ad902408b3012acb8a1f2e525`. It selects garments per category, prioritizes low wear counts over context, and rotates each slot together. It does not explicitly enforce low-use quests or exact context eligibility. The ranker in `../src/recommender.js` searches complete outfits, enforces case-normalized exact context tags, requires a low-use piece when requested, and returns at most three distinct outfits. It includes dress and optional outerwear alternatives and explains abstentions.

`evaluate.mjs` has an independent brute-force oracle for feasibility. A constraint-valid outfit must be owned, have a top + bottom or dress, exactly one pair of shoes, at most one outerwear piece, matching context tags on all pieces, and (for quests) at least one piece with <=1 recorded wear. This is an engineering proxy, not aesthetic compatibility. Unknown/wrong metadata can force false abstention relative to the real garment.

Metrics separate feasible requests (success if any top-three outfit passes), impossible requests (success if nothing returned), invalid individual suggestions, ownership, and duplicate options. Raw per-query predictions are saved with IDs. Timing uses 5 warmups + 30 measured repeats for every query (5,400 calls per method), `performance.now()`, nearest-rank percentiles, and no network/storage/model work. Stress tests use 50/100/200 garments, two warmups, and ten measured calls; their P95 is the maximum of ten observations, not a production latency estimate.

## Preserved failure and fix

`results/exhaustive-prototype.json` preserves the first experiment. `exhaustive-recommender.js` preserves its algorithm. It reached the same constraint results but exceeded two seconds on the 200-item stress case.

The shipped algorithm keeps the top three candidates per category, plus low-use candidates when required. For a fixed outfit shape, the score is the average of `1/(1+wears)`, so replacing one slot with a better-ranked item cannot reduce the score. A candidate below third place cannot be needed in the global top three when three superior replacements in the same feasibility group exist. This argument depends on the current separable score: adding color-pair compatibility or diversity penalties invalidates it. Tests compare the optimized and exhaustive outputs on all 180 queries. The runtime refuses closets over 200 items with a visible explanation.

`results/latest.json` is the canonical optimized run. Re-running changes timestamps and timings; deterministic quality counts and dataset hash should match. The report is generated from this file and the vision results using `scripts/build_report.py`. Rerun that report builder after deliberately replacing the canonical evidence.

## Validity limits and next test

Synthetic context tags define both constraints and evaluation. Perfect proxy results demonstrate implementation correctness on these cases, not learned taste, real metadata quality, AI recognition, or 70% human acceptance. Next: collect consenting wardrobe owners, blind/randomize baseline and prototype top-three options, record acceptance/modification/rejection, and report denominators and failures. Do not tune on that held-out evaluation.
