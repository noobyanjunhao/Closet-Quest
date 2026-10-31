# Actual purchase ML and cloud experiment evidence

Read [the report](../../docs/purchase-ml-cloud-report.md) for interpretation and limitations. Every receipt in these experiments is synthetic. These are not human-acceptance results or the image-recognition benchmark.

- `training/`: actual training failure log, checkpoint-40 metadata and dependency versions. The 120-step run stopped on CUDA OOM at step 71; no successful final run is claimed.
- `base-test/`, `adapter-test/`: frozen 60-document base/LoRA predictions, canonical validation, manifests and metrics. Invalid outputs count against results.
- `ollama-test-raw.json`, `ollama-test/`: existing application model results, including rejected-output errors. This uses its own schema-constrained serving protocol.
- `rules-test/`, `rules-validation/`: simple Python parser reference.
- `runtime-parser-raw.json`, `runtime-parser-test/`: actual JavaScript fallback implementation, separately evaluated on all 60 test documents.
- `execution-context.json`: concurrent GPU-load and protocol caveats. Do not interpret overlapping quality-run latency as a controlled speedup.
- `serial-latency.json`, `latency-base/`, `latency-adapter/`: five validation receipts timed sequentially. The tuned model was faster but returned four empty results; only one receipt truly contained no garments. Interpret speed together with omissions.
- `cloud/live-sql-results.json`: 8/8 live database checks; experimental wardrobe writes rolled back.
- `cloud/live-http-results.json`: 6/6 live HTTPS queue checks using a fixture, not model inference.
- `cloud/initial-harness-status-mismatch.json`: retained 401-versus-403 assertion mismatch.
- `cloud/live-candidate-result.json`: real saved adapter through the live queue; accepted review draft but zero garments, a semantic failure.
- `cloud/deployment.json`, `cloud/hosted-browser-checks.json`: live Render commit, successful CI and seven observed browser checks, including saved review persistence and cancellation.
- `cloud/*proof.png`: inspected screenshots of live database results; no private wardrobe content.
- `tests.txt`, `build.txt`: local application test/build evidence.

The data manifest is under `data/evaluation/purchase-v1/`. Weights and credentials are not included here. Sources and predictions are published for audit; no private user receipts were added to training.
