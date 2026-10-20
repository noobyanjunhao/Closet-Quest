# Recognition on 100 photos: results and failure analysis

Completed 2026-10-20T19:32:46.338Z. Model: gpt-6-luna, Fast profile. All 200 first attempts are retained, including failures. The one-photo canary is separate and is not pooled into this run.

## Primary comparison against the frozen annotations

| Metric | Single-piece baseline | Multi-piece workflow |
| --- | --- | --- |
| Precision | 91/98 (92.9%) | 223/270 (82.6%) |
| Recall | 91/247 (36.8%) | 223/247 (90.3%) |
| Exact category-set match | 15/100 (15.0%) | 52/100 (52.0%) |
| Completion | 98/100 (98.0%) | 93/100 (93.0%) |
| Successful within 20 seconds | 98/100 (98.0%) | 93/100 (93.0%) |
| Hat recall | 1/2 (50.0%) | 2/2 (100.0%) |
| Micro F1 | 0.5275 | 0.8627 |
| Median / p95 latency | 3.16 / 4.84 s | 7.70 / 14.32 s |

Recall gain: 53.4 percentage points. Paired image-bootstrap 95% interval: 46.8 to 59.3 points (10,000 resamples, fixed seed). This interval describes uncertainty within this selected dataset, not a representative user population.

Multi-piece found more correct categories on 78/100 photos, single-piece on 6/100, and coverage tied on 16/100.

## Failed requests

| Image ID | Mode | Saved error code | Seconds |
| --- | --- | --- | --- |
| 18904 | single | AMBIGUOUS_ITEM | 4.17 |
| 13283 | single | AMBIGUOUS_ITEM | 4.06 |
| 20009 | multiple | INVALID_SCENE_RESPONSE | 6.66 |
| 17533 | multiple | INVALID_SCENE_RESPONSE | 8.09 |
| 11859 | multiple | INVALID_SCENE_RESPONSE | 7.01 |
| 9112 | multiple | INVALID_SCENE_RESPONSE | 5.58 |
| 13339 | multiple | INVALID_SCENE_RESPONSE | 5.77 |
| 16221 | multiple | INVALID_SCENE_RESPONSE | 14.19 |
| 13260 | multiple | INVALID_SCENE_RESPONSE | 6.76 |

These are pipeline failures. AMBIGUOUS_ITEM means the validator could not accept an observation as a clear supported item. INVALID_SCENE_RESPONSE identifies invalid scene structure or box geometry, but the saved code alone cannot distinguish them. Other codes must be read literally; none should be relabeled as model hallucination without the rejected response. Failed raw responses were not retained. No failed request was silently retried.
In multi-piece mode, 16 missed category occurrences come from failed requests and 8 from completed responses.

## Completed responses and annotation disagreements

| Category | Single recall | Multi recall | Multi missing | Multi extra |
| --- | --- | --- | --- | --- |
| Top | 15/43 (34.9%) | 37/43 (86.0%) | 6 | 3 |
| Bottom | 14/39 (35.9%) | 34/39 (87.2%) | 5 | 10 |
| Shoes | 0/58 (0.0%) | 54/58 (93.1%) | 4 | 1 |
| Dress | 50/55 (90.9%) | 50/55 (90.9%) | 5 | 4 |
| Outerwear | 9/13 (69.2%) | 13/13 (100.0%) | 0 | 2 |
| Accessory | 3/39 (7.7%) | 35/39 (89.7%) | 4 | 27 |

Diagnostic visual review found:
- Image 9656: matching top/skirt were represented as Dress. This is a garment-boundary/label disagreement.
- Image 17091: a long red top over trousers was called Dress. Long-top versus dress ambiguity needs expert adjudication.
- Image 9914: jeans are visible but the supplied annotations contain only a shirt; the model also reports a visible necklace as Jewelry.
- Image 10471: shorts are visible beneath the top but absent from the supplied annotations.

24 multi-piece photos have an extra Accessory label whose accessory predictions are all Jewelry. Jewelry is supported by the app but absent from the dataset main-category ontology. Scores remain agreement with the published labels; extra labels are not all verified model inventions.

The observations above are assistant visual inspection, not independent expert relabeling. The original labels were not changed. All completed-response mismatches are listed in analysis.json and results.csv.
Across all 100 multi-piece attempts, 4 completed responses combine a missing Top with an extra Dress, and 0 show the reverse. These are category-set co-occurrences, not matched per-instance confusion counts. 10 completed responses return the six-piece maximum; reaching that cap does not itself prove an omission.

## Exploratory taxonomy sensitivity (not the primary result)

After noticing the taxonomy mismatch, we recomputed scores with only Jewelry predictions excluded. This post-hoc analysis is diagnostic, not a replacement headline or a preregistered metric.

| Mode | Precision without Jewelry | Recall without Jewelry | F1 |
| --- | --- | --- | --- |
| single | 91/98 (92.9%) | 91/247 (36.8%) | 0.5275 |
| multiple | 215/238 (90.3%) | 215/247 (87.0%) | 0.8866 |

## Improvement priorities

1. Extend the existing per-piece ambiguity handling to recover valid pieces from a scene containing a malformed entry, without accepting an invalid box. Record bounded diagnostic details for future failures, with appropriate retention controls. Test this behavior on a new set; this run cannot identify which validation check caused a saved scene-error code.
2. Obtain expert-adjudicated labels aligned to the app taxonomy. Include jewelry and all visible pieces; add long-top/dress and coordinated-separates examples. Keep this completed test fixed, and validate changes on a new set.
3. Evaluate more hats, crowded scenes and unseen phone photos. Two hat positives cannot establish reliable hat accuracy. The six-detection cap and category-set scoring can conceal missing instances.
4. Measure user correction seconds, outfit acceptance and upload-to-result latency. Dataset recognition and synthetic preference recovery do not establish human, business or environmental benefit.

The single-piece baseline is intentionally limited to one target and uses less image detail/output budget. The comparison evaluates the two application workflows. It does not isolate a prompt effect or prove superiority to another multi-object detector.

Sources and reproducibility: data/evaluation/recognition-100/manifest.json retains official Fashionpedia source URLs, licenses and labels. provenance.json records the evaluated source and model settings. Raw outcomes: both-100.json. No dataset photographs or credentials are included in the submission-results archive.
