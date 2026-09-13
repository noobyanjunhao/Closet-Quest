# Pretrained vision comparison

No model was trained or fine-tuned. The CPU smoke test compares quantized CLIP ViT-B/32 and SigLIP Base through Transformers.js. CLIP and SigLIP ONNX model cards document zero-shot classification [CLIP](https://huggingface.co/Xenova/clip-vit-base-patch32), [SigLIP](https://huggingface.co/Xenova/siglip-base-patch16-224).

```sh
npm ci
npm run vision:compare
npm run vision:classify -- clip vision/data/image-01.png
npm run vision:classify -- siglip path/to/your-photo.jpg
```

First execution downloads public weights to ignored `.model-cache/`; this library also makes model-file metadata requests on cached runs, so network access is required by these CLI commands. Photos are processed locally and are not uploaded. The comparison pins model revisions in `model-revisions.json`, uses q8 CPU inference with four intra-op threads and one inter-op thread, one warmup image, and the same six fixed prompts for both models. The images themselves are anonymous; the baseline filename heuristic defaults every image to Top. A single run records 18 measured inferences per model, complete scores, P50/P95, and model load/download time. Scores are not calibrated probabilities and must not be compared between models as confidence.

## Data provenance and limitations

`data/` contains 18 original, project-authored garment silhouettes: six shapes x three color/background variations, with reference labels and SHA-256 hashes. `npm run vision:fixtures` regenerates them from SVG paths using sharp. These are representative of category shapes and the app's demo assets, **not representative of real wardrobe photographs**. Colors and backgrounds vary; shape variants are strongly correlated. The same simple silhouette is reused three times per category. There is no photo dataset, training data, fine-tuning, background removal, color recognition measurement, or blinded holdout in this experiment.

This smoke test establishes that two off-the-shelf models can run locally and distinguish simple garment illustrations. It cannot establish >=80% real-photo category accuracy, >=85% color accuracy, processing-job reliability, or performance on clutter, occlusion, multiple garments, unusual items, or people wearing clothes. An unrelated photo is still forced into one of six categories; the prototype has no calibrated unknown-class rejection. Human correction remains mandatory.

## Collaborative model decision

Keep both choices available; CLIP is only a provisional candidate for the next real-photo comparison, not a selected production model. The user asked to participate in model selection and tuning. Before fine-tuning, jointly review:

1. A consented dataset of at least 120 distinct garments, balanced across the six app categories, with neutral and cluttered backgrounds. Group alternate views by garment so splits cannot leak the same item.
2. A 60-item development set and a locked 60-item test set. Use development photos to choose label wording; compare unchanged prompts/models on the test set. The small per-class counts are a screening study, not a reliable generalization estimate.
3. Macro F1, per-class recall, confusion matrix, unknown-item failures, P95 image-to-result latency, and correction burden. Include the filename heuristic and manual metadata workflow as baselines.
4. If category performance misses 80% or specific classes fail, discuss prompt revisions, a frozen-embedding linear head, or limited fine-tuning together. Collect additional labeled data before training; do not reuse test labels for tuning.

## Feasibility and access

- CLIP and SigLIP base are available as pretrained ONNX checkpoints; quantized inference avoids installing PyTorch or requiring a GPU for this smoke test. Reproduction needs Node, npm packages, model download access, disk space, and RAM. Measure the actual target device before committing to a phone deployment.
- Google's [SigLIP base model card](https://huggingface.co/google/siglip-base-patch16-224) lists Apache-2.0. Google's [SigLIP 2 card](https://huggingface.co/google/siglip2-base-patch16-224) is a possible later candidate, not benchmarked here. Keep upstream license notices when redistributing models; this repo does not distribute model weights.
- [BRIA RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) is a separate background-removal option with gated access and noncommercial conditions. It was not downloaded or integrated. Its access/licensing must be reviewed before choosing it for the final product.
- Model weights stay outside Git. No paid service, new credential, cloud GPU, or remote upload is needed for the measured runs.
