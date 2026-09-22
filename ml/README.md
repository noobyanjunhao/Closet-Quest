# Local learning, with measured boundaries

`node ml/train-ranker.mjs` really fits eight linear weights with pairwise logistic loss. It uses the exact production lexical scorer and the existing authored Sprint 3 fixtures. The committed `artifacts/ranker.json` contains weights, source/dataset hashes, split membership, training settings and baseline/trained measurements. Repeating the command is deterministic.

The ranking target is **a declared synthetic relevance proxy**: saved occasion match, requested category, and requested rediscovery. It is not human taste, visual compatibility or user preference. Closely related wardrobes, including mixed-case and wear-count variants, remain in the same partition; brief templates differ by partition. Catalog types still recur across partitions. Hyperparameters use validation; test is measured after selection. Neither the rule-based label generator nor this small fixture family supports a claim of real-world fashion quality.

The preset gate requires validation and test NDCG@5 to improve by at least 0.01 without regressing pair accuracy. Current held-out test results are 0.8837 → 0.9974 NDCG@5; validation is 0.9689 → 0.9968. Dense ranks, color and anchor features received no training signal in this dataset; their weights are zero. These results do not measure the complete hybrid pipeline.

**Live learned reranking is OFF by default**, even when the proxy gate passes. `CLOSET_LEARNED_RERANKER=1` explicitly enables experimentation. Real feedback and a separate evaluation of the actual hybrid route are needed before promoting it. Category, ownership, review, anchor and outfit-shape guarantees remain outside the learned model.

## Feedback and privacy

`server/learning.js` saves an allowlist of categorical metadata in `vision/private/learning/events.jsonl`, already excluded from Git. It does not save photos, garment names, raw mood briefs, brand/label text or profile information. IDs are hashed; hashing is not anonymization. Identical event payloads are deduplicated. Negative outfit feedback is retained for future preference learning, but is never treated as a positive SFT answer. All events derived from sample items must be marked `source: "sample"` and are excluded from real-data readiness.

Recognition event:

```json
{"type":"recognition_correction","source":"user","wardrobeId":"local-id","itemId":"garment-id","reviewed":true,"before":{"category":"Top","itemType":"Trousers"},"after":{"category":"Bottom","itemType":"Trousers"}}
```

Optional `photoSha256` groups repeated corrections of a photo without saving photo bytes. Outfit events use `type: "outfit_feedback"`, `feedback: "like" | "dislike"`, `context`, `candidates` (2–18 owned categorical records), and `selectedItemIds` (a complete owned outfit). No implicit like is created from wearing or saving an outfit.

## A runnable LoRA path; no adapter trained yet

```powershell
node ml/prepare-lora.mjs --write
python ml/train_lora.py
```

The first command exports real approved outfit selections as conversational prompt/completion JSONL and creates grouped train/validation/test manifests in the ignored private directory. The Python command validates hashes, duplicate inputs and split leakage without importing PyTorch. It defaults to validation only. The current real-data count is zero, so readiness is false.

The project gate requires at least 60 distinct examples, 12 input groups and split counts of 30/5/5. This is an engineering threshold, not proof that the data is sufficient for useful adaptation. Connected garment/photo groups and identical prompts remain together. Duplicate examples are removed. Conflicting text-correction labels for an identical prompt are omitted.

After collecting and reviewing enough real examples, install `requirements-lora.txt` in an isolated CUDA-capable Python environment. Supply a previously downloaded, appropriately licensed causal language model with a chat template, for example a compatible small Qwen model. The bundled Python currently lacks Torch, Transformers, PEFT and TRL. The script never downloads a model or uploads data.

```powershell
python ml/train_lora.py --train --model-dir C:\path\to\local-model --output-dir vision/private/learning/adapters/run-001
```

The runner defaults to **4-bit NF4 QLoRA**: nested/double quantization, BF16 compute when supported (FP16 otherwise), PEFT preparation for k-bit training, rank-8 adapters, an 8-bit paged optimizer and gradient checkpointing. The base model is loaded on the selected CUDA device; it never first loads a complete FP16 copy on the GPU. `--quantization none` enables ordinary LoRA for smaller models or more capable hardware. The 8 GB RTX 4060 configuration still needs a real memory check with the chosen model; no training-capacity result is claimed.

Completion-only loss, fixed seeds, validation checkpoint selection and separate pre/post-training test loss are used. Overlength examples are rejected instead of silently clipping labels. An adapter and evaluation report are written only after actual training. An adapter is **never deployed automatically**; loss alone does not establish grounded outfit quality, and the output contract differs from the current production plan selector.

`node ml/prepare-lora.mjs --task=metadata-correction --write` prepares **text-only metadata correction**, not vision training. Original image pixels are absent by design. Training the photo recognizer requires a separate explicit opt-in image dataset and a vision-language-model trainer; this repository does not claim to have fine-tuned Gemma's vision model.

The implementation follows the official [TRL 0.23 SFT prompt/completion documentation](https://huggingface.co/docs/trl/v0.23.0/sft_trainer), [PEFT quantized training guide](https://huggingface.co/docs/peft/developer_guides/quantization) and [Transformers 4.56.2 bitsandbytes guide](https://huggingface.co/docs/transformers/v4.56.2/quantization/bitsandbytes). Dependency pins match that documented API generation; the training branch remains unexecuted until readiness and environment requirements are met.

Checks: `node --test ml/checks.test.mjs` and `python -B ml/test_lora.py`. The Python checks require no Torch installation; they check quantization settings, the dry run, readiness enforcement, data hashes and split leakage.
