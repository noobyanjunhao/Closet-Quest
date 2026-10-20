# A reproducible 100-photo recognition test

We selected Fashionpedia because its original photos contain people wearing multiple clothes and accessories, with labels and bounding boxes for each item. This is closer to the app's photo-upload task than tiny isolated product thumbnails. The dataset and downloads are maintained by [Fashionpedia/CVDF](https://github.com/cvdfoundation/fashionpedia).

The prepared subset contains exactly **100 original photos and 336 annotated garment/accessory instances**. It excludes all 18 photos from the previous Sprint 7 evaluation, both by image ID and exact file hash. Every selected image decodes successfully, and no image file is duplicated. The manifest was frozen before running recognition.

| App category | Photos containing the category |
| --- | ---: |
| Top | 43 |
| Bottom | 39 |
| Outerwear | 13 |
| Dress | 55 |
| Shoes | 58 |
| Accessory | 39 |

Counts overlap because one photo can contain several categories. Two photos contain annotated hats. That is useful for checking the earlier hat failure, but much too small for a reliable hat-accuracy claim.

## Selection and provenance

We use the official 2020 validation annotations and the validation/test image archive already downloaded for Sprint 7. Selection uses the fixed seed `closet-recognition-100-v1`, restricts image-license metadata to CC BY 2.0 or public domain, excludes earlier evaluation images, includes up to ten available hat examples (only two qualify), then fills the remaining slots by SHA-256 ordering. No prediction or model confidence affects selection.

The annotation license is CC BY 4.0. Image rights are separate; see the [official terms](https://fashionpedia.github.io/home/data_license.html). Each record retains the original source URL, image license, checksum, original category, and bounding box. Original image pixels are unchanged. The photos remain in the ignored local evaluation directory; the repository contains only the manifest, labels, and scripts.

Local bundle: `vision/private/recognition-100/Closet-Quest-Recognition-100.zip` (about 8 MB). It includes the 100 images, manifest, CSV labels, and attribution notice. The public manifest is `data/evaluation/recognition-100/manifest.json`.

## What to measure

Use multi-item recognition as the current system and single-item recognition on the same scenes as the existing capability baseline. The latter is intentionally limited on multi-item scenes; it is not a competing state-of-the-art detector. Report category-set precision, recall and F1, exact-set match, recall for each of the six categories, failures, and p50/p95 latency separately for each mode. Keep failures as empty predictions in the denominator. Report hat recall with its actual denominator of two.

This broad-category test does not measure the correctness of color, material, garment count, or bounding-box localization. Source annotations include fine-grained categories, but the app's category mapping is an operational simplification: for example, jumpsuits map to Dress and tights to Bottom. Public dataset photos may have appeared in foundation-model training; excluding our previous test photos does not prove a model-training holdout. Results on curated fashion photos also do not establish accuracy on unseen phone photos or user acceptance.

## Reproduce

Prepare from the existing archive:

```powershell
python scripts/prepare-recognition-100.py
node scripts/evaluate-recognition-100.mjs
```

The second command checks all 100 image hashes without invoking a model. To run the actual evaluation using the configured server OpenAI key:

```powershell
node scripts/evaluate-recognition-100.mjs --live --mode both
```

This makes up to 200 recognition pipeline requests. Requests run serially with recognition caching disabled, alternate baseline/current order, and checkpoint after each request. The runner resumes completed attempts, including failures, and refuses to mix a different manifest or model into an existing run. Results go to `output/recognition-100/both-100.json`. A partial canary can use `--limit 1`; it is not a 100-image result.

The full evaluation has not been run as part of dataset preparation. Do not present the dataset counts as recognition accuracy.
