# Closet Quest: fewer missed purchase items and reliable local training

**Try the app:** [Closet Quest](https://closet-quest-junhao-s7.onrender.com/). Open **Add clothes → Import purchases**, review the proposed garments and tell us which details need correction. Remove payment and address information before pasting a receipt.

This follow-up evaluates the **purchase-text model**. It does not claim a new clothing-photo recognition result or a user-acceptance study. The [previous report](purchase-ml-cloud-report.md) and its failed training run remain available as the before-change evidence.

**Release decision:** the new adapter substantially improves the frozen benchmark and completes training within the GPU budget, but remains experimental. Only 8/15 broader diagnostic probes passed, including a real-looking store header wrongly accepted as clothing. It has not replaced the production default.

## The problem and the change

The previous LoRA adapter sometimes returned a valid but empty receipt even when a garment was plainly present. It also struggled with unknown attributes and returns. Its 120-step training attempt ran out of GPU memory at step 71, leaving checkpoint 40 as the evaluated artifact. A low teacher-forced validation loss did not predict reliable generated answers.

The new pipeline gives every source line an explicit decision. The model returns a short garment description, category, four attributes and a reason. Code then checks copied values, attaches exact source quotes and builds the existing receipt schema. A missing, malformed or unsupported decision rejects the response; it does not silently become an empty success. Returns remain garments with an ownership-review warning. The application's final validator and human approval step remain in place.

Training examples balance clothing and non-clothing decisions. This prevents repetitive headers, shipping and tax lines from dominating the loss. The model no longer generates repeated source identifiers and evidence objects for an entire receipt. The fine-tuned base remains the pinned Apache-2.0 Qwen2.5-0.5B-Instruct model, with 8,798,208 trainable LoRA parameters. No private purchases entered training.

## Evaluation design

The dataset was frozen before training: **600 training, 100 validation and 100 new test receipts**. All 800 labels pass the application's schema and evidence checks. Merchant/template families and complete source hashes are disjoint across the three splits. Clothing vocabulary overlaps, so this measures generalization across these synthetic formats, not arbitrary real merchants. The new test contains **112 clothing lines and 672 fields**. It covers missing attributes, three garments in a receipt, returns, fees, mixed non-clothing items, embedded commands, Unicode and explicit quantities.

Generated answers from checkpoints 100, 200 and 300 determine selection using validation clothing recall, then precision, field accuracy and exact-document count. The final test is not used to select or retrain the model. The old 60-document test is now a regression set. Four methods are compared on the same new test: the deployed fast parser, the old adapter and receipt protocol, the untuned base with the new line protocol, and the selected new adapter. The untuned line-protocol comparison helps distinguish fine-tuning from the pipeline redesign. The old/new adapter comparison changes the training data and protocol together and cannot isolate either contribution.

Every attempt stays in the results. Invalid application responses count as missing garments. Line recall measures whether a usable item exists on each expected line; field accuracy also requires the right name, category, color, size, brand and quantity. Whole-document exactness covers garment fields and membership, not every exclusion reason. Category F1 and return warnings are separate checks. Evidence matching proves a quote exists, not that a category interpretation is correct.

## Actual before-and-after results

| Method, same 100 new receipts | Contract-valid | Exact receipts | Usable garments | Exact fields |
|---|---:|---:|---:|---:|
| Existing fast parser | 100/100 | 12/100 | 70/112 (62.5%) | 233/672 (34.7%) |
| Untuned base, new line protocol | 0/100 | 0/100 | 0/112 | 0/672 |
| Previous LoRA, receipt protocol | 91/100 | 57/100 | 65/112 (58.0%) | 384/672 (57.1%) |
| New LoRA, line protocol | 99/100 | 99/100 | 111/112 (99.1%) | 666/672 (99.1%) |

The system change recovers **46 additional clothing lines**, a **41.1 percentage-point** recall gain over the previous adapter. A paired bootstrap resampling whole receipts 10,000 times gives a 31.5–51.2 point interval within this synthetic benchmark. It is not a confidence interval for real users or all merchants. New category macro-F1 is 0.995 versus 0.642 before. Return-warning retention rises from 1/12 to 12/12.

| Local inference, same test | Median | p95 |
|---|---:|---:|
| Previous adapter | 4.87 s | 9.16 s |
| New adapter | 1.07 s | 1.40 s |

Median latency is **78.0% lower** in these sequential runs, while usable recall improves. Timing includes failed attempts. Method order and GPU clocks were not randomized or fixed, so this is an observed laptop result rather than a service-level guarantee. The CPU parser is much faster still, but loses garments and attributes in this test. No human correction-time or acceptance improvement is claimed.

The selected candidate recovered **111/112 clothing lines (99.1%)**, with **99/100 fully correct receipts** and no false-positive garments. It matched **666/672 fields**, preserved all **80/80 unknown attributes**, and retained the garment and warning in **12/12 return cases**. Median local generation time was **1.07 seconds**, with p95 **1.40 seconds**. These times cover the short synthetic receipts in this test, not a hosted end-to-end service guarantee.

The remaining test failure is concrete: `v2-test-7-019` contains “Zip hoodie,” but the model generated “Top” as the description. The category and attributes were otherwise plausible. The grounding check rejected the entire receipt because “Top” was absent from the source. It therefore counts as one missed usable garment and six incorrect fields. We did not rename it with a test-specific rule, remove it from the denominator or retrain on this test case. This is why the result is 99.1%, not “never misses clothes.”

On the exposed 60-receipt regression set, usable clothing recall improved from **45/60 to 60/60**, exact fields from **270/360 to 360/360**, and exact receipts from **46/60 to 60/60**. This verifies earlier failures were addressed, but it is not an unseen-test claim.

The untuned model with the same line protocol produced **0/100 usable receipts**. Its first retained decisions were Markdown-wrapped and used invalid values such as `Non-Clothing` and empty strings. A post-hoc diagnostic removed the fences: all 100 retained decisions then parsed, but all 100 still violated the contract. Later decisions were not retained after the first parsing error. This demonstrates a contract-compliance problem, not zero underlying clothing understanding. The diagnostic does not replace the primary score with a more favorable number.

## Why the memory use is lower

The old trainer allowed sequences up to 3,072 tokens and computed large vocabulary logits across the receipt prompt. The new training data reaches only 233 tokens per example, with an explicit 768-token safety bound and no silent truncation. It computes causal loss only for supervised output positions and processes vocabulary logits in 32-token chunks. Decoder and loss checkpointing recompute intermediate values during backward passes. This follows the compute-for-memory tradeoff described in the [PyTorch 2.6 checkpoint documentation](https://docs.pytorch.org/docs/2.6/checkpoint.html).

A float32 toy check compares dense and chunked losses and gradients. The real BF16 model also runs both calculations on the same batch, recording the small numerical difference. Memory numbers are PyTorch allocated/reserved peaks, not total device usage. The old 7,939 MiB observation was a single device sample, not a peak; it should not be subtracted from a new allocator peak to advertise a precise percentage improvement. GPU contention or longer unsupported inputs can still exhaust memory outside the tested bounds.

The earlier traceback does not isolate a single root cause. This run changes sequence length, the loss calculation and GPU workload isolation together; the same-batch preflight measures the loss change separately.

The new run completed **300/300 optimizer steps without OOM**, followed by a successful backward pass on an input padded to 768 tokens while retaining a real completion. Its peak was **1.23 GiB allocated / 1.50 GiB reserved** across training, validation and the stress check. Training wall time was 2,040 seconds, including validation and execution delays; this is not a pure training-throughput benchmark.

| Memory check on the same 221-token batch | Peak allocated | Peak reserved |
|---|---:|---:|
| Standard dense loss | 1.77 GiB | 1.90 GiB |
| Supervised-token chunked loss | 1.54 GiB | 1.66 GiB |

That controlled preflight reduces allocated peak by **12.6%**. The much shorter line task and serialized workload account for additional differences from the old run, which are not isolated by this comparison. The toy losses match, with maximum gradient difference below 3×10⁻⁸. Real-model BF16 losses were 0.31490 and 0.31857, so those paths are not claimed to be bit-identical.

All three checkpoints were exact on all 100 validation receipts: 104/104 garments and 624/624 fields. The tie rule selected **checkpoint 100**. Its 35,237,104-byte adapter contains 336 finite tensors, and every learned B projection is nonzero. The SHA-256 is `d22418a62dc277bada015dddcb43314f2f72e9959127d98a49d106d071ecb5eb`. The artifact verifier loaded safetensors only, not optimizer pickle state.

## Reliability, remaining risks and release decision

The candidate server binds only to loopback, rejects browser origins, limits input and output lengths, batches at most eight lines and allows one GPU request at a time. Busy requests receive HTTP 429; timeouts and invalid outputs remain explicit failures. The existing Node worker still checks source hashes and validates the returned receipt. The Supabase ownership and review transaction are unchanged. No synthetic test garment is inserted into a user's closet.

The broader diagnostic set passed **8/15 cases**, considerably worse than the structured benchmark. It checks category/count expectations, selected fields and explicit rejection; it is not a full field-accuracy study. Successful cases included hats with a hoodie, sparse three-item text, returns, capitalization, one Spanish example, quantity three, rejection of quantity 999 and rejection of an overlong line. A single Spanish success does not establish multilingual reliability.

| Failed probe | What actually happened |
|---|---|
| Previously omitted trousers | Trousers were recovered, but “Harbor Demo” was also accepted as a dress; explicit size and quantity were lost. |
| Fees containing clothing words | Clothing words in shipping/discount/gift-card lines produced invalid decisions; the receipt was rejected. |
| A different embedded command | The model treated part of the command as a dress. Grounding rejected it, also losing the legitimate tee. This is not general injection resistance. |
| Unseen garment names | Both lines were detected, but dungarees were labeled Dress rather than the diagnostic Bottom label. This also exposes ontology ambiguity. |
| Two garments on one line | Only the tee was retained; the coat was missed. |
| OCR-like spelling errors | An unsupported name and wrong category caused rejection. |
| Attributes on a following line | The model created a spurious “Navy” top instead of attaching the attributes to the tee. |

The store-header and attribute-line failures **passed source-quote validation**. They demonstrate that copied evidence cannot prove something is clothing. These findings are the reason not to promote the candidate despite its 99.1% structured-test recall. The model has no tools or access to secrets, but malicious purchase text can still damage extraction quality.

The gap also exposes a dataset shortcut: generated receipts use largely fixed “Fictional merchant” headers and fee wording even when item-template families differ. A plain store name is outside that pattern. More steps on the same generator are therefore a lower priority than varied headers, hard negatives, grouped receipt lines and independently reviewed real examples.

The real loopback HTTP/Node worker check passed **5/6**. The two-garment request, browser-origin rejection, malformed-input rejection, HTTP 429 under concurrent requests, and recovery after the busy response passed. The trousers content check failed because of the extra store-name garment. This is recorded as a failure rather than presented as a successful end-to-end user scenario. The candidate server was stopped afterward; no cloud queue or wardrobe was changed. Separately, **244 Node tests, 19 Python tests, the production build and Linux implementation CI passed**. Simulated provider failures in unit tests are distinguished from the real HTTP checks.

The changes are available in GitHub and the model weights remain local, with hashes and reproduction instructions published. The hosted app's existing parser fallback remains available when the laptop worker is offline. This work does not add a paid cloud GPU or turn free hosting into an always-on inference service. Model quality and cloud availability are separate questions: the earlier live Supabase/Render experiments still describe that deployment; the new model integration check is labeled local.

The next priorities are independent, consented receipt evaluation; explicit handling of multiple products on one line and attributes continued onto later lines; and measurement of correction time in the review interface. These require additional data and user evidence. Synthetic exactness alone does not establish that the product saves time or never misses clothing.

A constrained source-span decoder is a useful next experiment for the remaining unsupported-name failure. Better few-shot prompting or grammar-constrained generation may also improve the untuned baseline; this experiment does not prove fine-tuning is necessary. The comparison uses the existing parser rather than a parser optimized for the new catalog. No demographic or multilingual fairness conclusion follows from the synthetic English benchmark.

## Evidence and reviewer handoff

The [evidence index](../output/purchase-ml-v2/README.md) links training metrics, raw model decisions, failures, paired comparisons and integration results. The [reproduction notes](../ml/purchase/V2.md) specify the model, seeds, data hashes, optimizer, selection rule and serving commands. Reviewers can regenerate canonical validation from the committed sources and predictions. Weights are deliberately excluded from Git; a clean checkout must reproduce training or receive the separately hashed artifact before serving it.
