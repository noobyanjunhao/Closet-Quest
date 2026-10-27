# Closet Quest: robustness and responsible deployment

Measured October 27, 2026. Report: [four-page PDF](../output/pdf/Closet-Quest-Sprint-8-Robustness-Report.pdf). App: https://closet-quest-junhao-s7.onrender.com/

## Improvements and evidence

- Multi-piece recognition now retains independently validated pieces when another detection has invalid geometry or uncertain attributes. It reports omissions for human review; it never guesses replacement boxes. On the same 67 live model responses, accepted scenes increased from 61 to 67, recovering 15 pieces across six responses. These responses include correlated image variants and a selected prior-failure group, so this is not a population accuracy estimate.
- A circular photo/cutout rail replaces the default grid, with keyboard controls, swipe selection, thumbnails and the existing original-photo editor. The grid remains available. Selection, filters and the existing styling flow persist across in-app navigation. On narrow screens saved outfits move below the full-width rail; desktop keeps them alongside it.
- Missing-piece ideas now offer a real, optional OpenAI web search. Prices must appear in retrieved evidence for an allowed retailer's individual product URL. Results are sorted by price and explicitly external. Photos come from source-linked image results or retailer metadata. Photo coverage is limited: the two final formal-top probes returned five products but only one preview. Empty and blocked results stay honest.
- Vite was patched from 7.3.6 to 7.3.7 after a deployment audit found advisories. Recorded audit: one affected high-severity dependency before, zero known vulnerabilities after. All 210 automated tests and the production build pass.

## Live recognition protocol

Twenty Fashionpedia photographs were frozen before inference, disjoint by ID and hash from the previous 100- and 18-photo studies. The fixed `sprint8-v1` hash order selected 20 of 35 remaining eligible CC BY 2.0/public-domain images. Each was evaluated unchanged, dimmed to 35% brightness, and resized to 160 pixels with sigma-1.2 blur and JPEG quality 50. Seven previously failed photographs were rechecked as a separate diagnostic stratum. No retries.

Each raw `gpt-6-luna` response (high image detail, maximum 4096 output tokens) was replayed through the frozen old and new validators. This isolates postprocessing rather than comparing separate stochastic generations. The same request latency applies to both validators.

| Stratum | Completed before / after | Category recall before / after | F1 before / after |
|---|---|---|---|
| Original, 20 | 19/20 to 20/20 | 42/47 to 43/47 | .857 to .860 |
| Dimmed, 20 | 19/20 to 20/20 | 38/47 to 39/47 | .809 to .813 |
| Small + blurred, 20 | 20/20 to 20/20 | 28/47 to 28/47 | .683 to .683 |
| Selected previous failures, 7 | 3/7 to 7/7 | 3/16 to 12/16 | .273 to .750 |

Original-photo precision declined from 42/51 to 43/53; exact category-set agreement stayed at 10/20. Six original-photo extra accessory categories were jewelry-only; the dataset's mapped ontology omits jewelry. Blur reduced shoe recall to 3/10 and accessory recall to 1/8. Category-set metrics do not measure instance detection, crop IoU, colors, materials or fashion quality. No hats were annotated in the fresh set. There were zero human participants, and no acceptance, correction-time, sustainability or fairness gain is claimed.

## Failure and load checks

The separately labeled deterministic stress harness retained usable scenes in 17/17 mixed-validity cases (old validator: 0/17). It rejected all five malformed/all-invalid cases. Shopping returned explicit failures for five injected provider conditions, and a local HTTP burst admitted 2/40 requests while rejecting 38/40 with 429. Peak provider concurrency was two, and the next request recovered. This demonstrates load shedding, not 40-user throughput. Account isolation, cache expiry, foreign origin, unauthorized access and input limits were checked.

The live negative-case run made two model calls: a geometric house and image text asking the model to invent dresses/reveal a key. Both returned `NOT_FASHION`. A blank image was rejected locally with `EMPTY_IMAGE` before a model call. The raw OOD file's `rejected` field means specifically `NOT_FASHION`; use its error code when interpreting the locally rejected blank image.

## Reproducing and inspecting

Results are in `output/sprint8/`. `model-results.json` retains raw structured recognition responses and both outcomes; `baseline-multi-recognition.mjs` is the frozen old validator. Full retailer snippets and private photos are deliberately excluded. `shopping-grounding-fixture.json` contains only URLs, product metadata and extracted price facts from an observed search response, with the original response hash.

1. Run `npm ci` and `npm test` with isolated test environment variables (unset `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `CLOSET_PUBLIC_ORIGIN` rather than using live account settings).
2. Run `node scripts/stress-sprint8.mjs` for deterministic fault injection and the local HTTP burst. It makes no live provider calls.
3. Inspect `model-results.json` to reproduce metrics with `scripts/recognition-metrics.mjs`. The live runner preserves a completed result and resumes only a matching interrupted run. Do not overwrite the historical result to make a rerun appear original.
4. To conduct a new paid study, acquire the licensed Fashionpedia images using the existing dataset preparation documentation, use a new output directory, and supply `OPENAI_API_KEY` privately in the server environment. `scripts/prepare-sprint8.py` and `scripts/evaluate-sprint8.mjs` specify the original protocol. Provider training-data overlap is unknown.
5. Generate the report with `python scripts/build_sprint8_report.py` (ReportLab), then render all four pages with Poppler for visual checks. `scripts/package_sprint8.py` packages an explicit allowlist of supporting files.

## Remaining deployment limits

Supabase provides existing account identity and private persistence; new shopping routes use the same authentication boundary. Shopping sends no user photos, names or private notes, but retailer previews still make third-party image requests. Web prices are not guaranteed current; size, stock, shipping and variants require store confirmation. Retailer coverage is US/USD, with a preview preference for J.Crew and no affiliate ordering. Inclusive sizing and cultural/style fairness are unmeasured. Browser checks do not establish physical camera, screen-reader or WCAG conformance. Free Render cold starts, per-process limits, distributed capacity, deletion/retention audits and a real paired user study remain priorities. `release.json` records the published revision and actual deployment checks.
