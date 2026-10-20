# Closet Quest research validation — October 19, 2026

> The current report replaces the initial 18-photo recognition headline with the separate [100-photo / 200-attempt evaluation](../../docs/recognition-100.md) completed October 20. This folder preserves the October 19 research records; its styling studies remain in the report. No historical recognition attempts are pooled into the new run.

This folder contains measured public-dataset results and **synthetic AI feedback**, not a human user study. Human participant count is zero. No human acceptance, correction time, purchase reduction or environmental impact is claimed.

## Results

- `dataset-manifest.json`: pre-inference fixed sample, image IDs, category mapping, file hashes, source URLs and individual license metadata. Twelve hash-ranked general images plus six disjoint hat-enriched images from 127 eligible Fashionpedia validation images. The sample is new to this app evaluation, not guaranteed unseen by foundation models.
- `recognition.json` and `recognition.csv`: all 36 initial attempts, including errors. Category-set precision/recall, not instance detection AP or box IoU. Single mode uses low image detail; multiple uses high detail and a larger output allowance. This is a workflow comparison.
- `recognition-recheck.json`: separate, post-fix recheck of the two failed multi-piece photos. Selected after observing failures, so not a new held-out accuracy estimate. One recovered; one still failed geometry validation.
- `stylist.json`: all six fictional briefs, frozen 11-item wardrobe, 18 pipeline outputs, retrieval provenance and 12 GPT-6 Astra judgments. Same briefs/wardrobe across Quick, OpenAI without memory, and full personal RAG. Judge labels conceal condition, with forward/reverse ordering. Ratings are correlated repeats, not extra participants.
- `synthetic-ratings.csv`: 36 synthetic set ratings. Evidence usefulness rates all retrieved passages, which can exceed the excerpts that reached the generator. Missing evidence scores 1 by rubric.
- `summary.json`: explicit numerators/denominators; human metrics remain null.
- `regression-tests.txt`: actual automated test output. Provider tests and browser inspection are engineering checks, not user outcomes.
- `hosted-smoke.json` and `deployment-status.json`: nine successful HTTPS deployment checks, including actual photo inference and RAG styling. These use synthetic/public inputs and are not human outcome measurements. The public pilot is https://closet-quest-junhao-s7.onrender.com and requires a private participant code.
- `dependency-audit.json`: final dependency audit after compatible security patches; zero known vulnerabilities at the recorded check. This is not a guarantee that the application has no security defects.
- `evaluation-provenance.json`: initial pipeline, targeted-fix and deployed commit IDs; script hashes and model identifiers.
- `screenshots/validation-workspace.png`: real interface showing unmeasured human metrics.
- `ablation.json`: follow-up 2x2 document/feedback experiment with six new fictional briefs, 24 initial calls and six immediate repeats. Targets, wardrobe and protocol hash were saved before inference. Includes actual prompt passages, candidate plans, provider outputs, failures and embedding-cache counters. Three positive feedback votes encode the preferred trio; this is a controlled diagnostic, not observed user behavior.
- `ablation-summary.json` and `ablation.csv`: target-trio hit@3 was 1/6 (neither), 3/6 (documents), 3/6 (feedback), 5/6 (both). All 30 attempts completed with 54/54 structurally valid outfits and 0/30 model fallbacks. The critique target was absent from every arm's candidate plans. Lexical and hybrid both ranked the target note first in every query, so no vector-search advantage is established. Cache-cold versus immediate cache-warm full-pipeline medians were 3.139 s and 2.6045 s, with retrieval medians 509 ms and 231 ms. These are local orchestration plus actual provider timings, not Render cold-start or human task times.

## Reproduction

Use Node 24 and `npm ci`. Download the official Fashionpedia validation image archive and instance annotations from https://github.com/cvdfoundation/fashionpedia into `vision/private/fashionpedia/images.zip` and `annotations.json`. `python scripts/prepare-fashionpedia.py` creates the deterministic manifest and extracts only the selected images. Run before inference; preserve the manifest when auditing results.

`node scripts/evaluate-sprint7-recognition.mjs --live` resumes saved attempts and runs at most 36 recognition calls for a fresh run. `--recheck-failures` writes a separate file. `node scripts/evaluate-sprint7-stylist.mjs --live` runs up to 12 OpenAI stylist calls, 12 Astra judge calls and bounded embeddings on fictional inputs. A configured server-side OpenAI API key and API charges are required. Saved attempts, including failures, are not silently retried. Existing results should be archived under a different run directory before intentionally rerunning a benchmark.

`node scripts/summarize-sprint7.mjs` regenerates aggregate JSON/CSV. `python scripts/build_sprint7_report.py` generates the PDF; render and inspect it before distribution. Machine timings and model outputs may vary. No dataset photos or credentials are published.

`node scripts/evaluate-sprint7-ablation.mjs --live` runs up to 30 new generator calls and 120 embedding HTTP calls, with a fresh per-condition wardrobe cache and prebuilt document indexes. Saved attempts are never silently repeated; a protocol mismatch stops execution. `node scripts/summarize-sprint7-ablation.mjs` validates the 24+6 attempt counts and produces the follow-up aggregates. The five-page report includes both the initial study and this separate experiment. Cache-warm labels should be checked against recorded counters if resuming an interrupted run.

## Attribution and limits

Fashionpedia Consortium (2020), https://github.com/cvdfoundation/fashionpedia. Annotation subsets and category mapping are adaptations of CC BY 4.0 annotations: https://fashionpedia.github.io/home/data_license.html. Image rights are separate; only CC BY 2.0/public-domain metadata entries were selected. Source URLs and license details are preserved in the manifest. Photographs remain in ignored local storage and are not redistributed here.

The pilot favors known feature-aligned scenarios, has a small enriched photo sample and uses a same-provider-family judge in the initial study. The follow-up isolates document and feedback toggles but uses exact authored target combinations rather than human ratings; it does not establish population-level value or a vector-search advantage. Treat results as a diagnostic research pilot. Follow-up priorities are candidate-plan coverage, fresh phone photos, human/expert ratings, correction burden, grounded prose, distinct suggestions, durable storage and physical-camera validation.
