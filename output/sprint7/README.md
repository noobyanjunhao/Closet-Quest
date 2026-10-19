# Closet Quest research validation — October 19, 2026

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

## Reproduction

Use Node 24 and `npm ci`. Download the official Fashionpedia validation image archive and instance annotations from https://github.com/cvdfoundation/fashionpedia into `vision/private/fashionpedia/images.zip` and `annotations.json`. `python scripts/prepare-fashionpedia.py` creates the deterministic manifest and extracts only the selected images. Run before inference; preserve the manifest when auditing results.

`node scripts/evaluate-sprint7-recognition.mjs --live` resumes saved attempts and runs at most 36 recognition calls for a fresh run. `--recheck-failures` writes a separate file. `node scripts/evaluate-sprint7-stylist.mjs --live` runs up to 12 OpenAI stylist calls, 12 Astra judge calls and bounded embeddings on fictional inputs. A configured server-side OpenAI API key and API charges are required. Saved attempts, including failures, are not silently retried. Existing results should be archived under a different run directory before intentionally rerunning a benchmark.

`node scripts/summarize-sprint7.mjs` regenerates aggregate JSON/CSV. `python scripts/build_sprint7_report.py` generates the PDF; render and inspect it before distribution. Machine timings and model outputs may vary. No dataset photos or credentials are published.

## Attribution and limits

Fashionpedia Consortium (2020), https://github.com/cvdfoundation/fashionpedia. Annotation subsets and category mapping are adaptations of CC BY 4.0 annotations: https://fashionpedia.github.io/home/data_license.html. Image rights are separate; only CC BY 2.0/public-domain metadata entries were selected. Source URLs and license details are preserved in the manifest. Photographs remain in ignored local storage and are not redistributed here.

The pilot favors known feature-aligned scenarios, has a small enriched sample, uses a judge from the generator's provider family, and does not isolate documents from other personalization. Treat results as a diagnostic research pilot. Follow-up priorities are fresh phone photos, human/expert ratings, correction burden, grounded prose, distinct suggestions, durable storage and physical-camera validation.
