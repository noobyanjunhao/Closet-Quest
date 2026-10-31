# Purchase-text LoRA v2: supporting results

Read the [validation and memory report](../../docs/purchase-ml-v2-report.md). These are actual local model runs on authored synthetic purchase text, not photo-recognition measurements or human-user results. No paid inference or rented GPU was used.

## Main evidence

- [Comparison and receipt-bootstrap calculation](comparison.json): all methods on the new test, the old regression set, training and diagnostic results. Invalid responses remain in denominators.
- [Training result](training/result.json) and [complete training log](training-log.txt): 300 completed optimizer steps, generated validation selection, allocated/reserved GPU peaks, and a 768-token backward-pass stress check.
- [Memory/loss preflight](training/preflight.json): dense versus chunked loss on the same batch and float32 gradient parity.
- [Selected artifact verification](adapter-artifact.json): checkpoint 100, SHA-256, 336 finite tensors, nonzero trained B projections and file size. Weights are local, not in GitHub.
- [Execution context](execution-context.json): RNG clarification, timing limits, test timing and deployment scope.
- [Real local integration](local-integration.json): saved adapter through HTTP and the Node worker validator, busy-request behavior and recovery; no cloud or wardrobe writes.
- [Robustness probes](robustness/result.json): 15 hand-authored unusual/noisy/unsupported cases, including failures. This is separate from the frozen test and was not used to train/select the checkpoint.

## Frozen test: 100 receipts, 112 garments, 672 fields

| Method | Metrics | Every recorded attempt |
|---|---|---|
| New line-decision LoRA | [metrics](adapter-test/metrics.json) | [raw decisions and receipts](adapter-test/raw.json) |
| Previous receipt LoRA | [metrics](v1-on-new-test/metrics.json) | [raw completions and receipts](v1-on-new-test/raw.json) |
| Untuned base, same new protocol | [metrics](base-line-test/metrics.json) | [retained decisions/errors](base-line-test/raw.json) |
| Existing JavaScript fast parser | [metrics](runtime-parser-test/metrics.json) | [raw receipts](runtime-parser-raw.json) |

Each model folder also contains a manifest and canonical validation results. Source receipts and gold fields are in the [frozen dataset](../../data/evaluation/purchase-v2/manifest.json). The new adapter's rejected hoodie description is retained in `adapter-test/raw.json` as `v2-test-7-019`.

The [format diagnostic](base-format-diagnostic.json) strips fences from retained untuned-model decisions without changing its primary score. All 100 retained first decisions still violate the contract. The strict extractor stopped recording at the first malformed decision; subsequent clothing-line generations are unavailable for those failures. Do not interpret the zero usable-receipt score as zero clothing understanding.

## Selection and regression

- Validation checkpoints: [100](validation-100/metrics.json), [200](validation-200/metrics.json), [300](validation-300/metrics.json). Their raw predictions and validator decisions are in the same folders. All three tied; the first best checkpoint was selected.
- [Old 60-receipt regression metrics](adapter-regression/metrics.json) and [raw predictions](adapter-regression/raw.json). This set was already exposed, so it is not a new holdout.
- [Earlier v1 evidence](../purchase-ml/README.md) remains unchanged, including its CUDA OOM and missing garments.

## Software verification

[244 Node tests](node-tests.txt), [19 Python tests](python-tests.txt), and the [production build](build.txt) passed. Provider-failure/deadline unit cases use controlled injection; the local integration file identifies real model/HTTP checks separately. The [implementation Linux CI run](https://github.com/noobyanjunhao/Closet-Quest/actions/runs/41152960883) also passed.

The [reproduction notes](../../ml/purchase/V2.md) and versioned scripts regenerate evaluation and source-grounding checks. Generated `validation-input.jsonl` files duplicate the committed receipts/predictions and are intentionally omitted from this evidence bundle; the corresponding `validation-input.validation.json` results are included. This folder contains synthetic text and model outputs, no keys, private receipts, optimizer pickle files or model weights.
