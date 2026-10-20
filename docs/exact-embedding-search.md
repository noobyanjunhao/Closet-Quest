# Faster exact embedding search

The previous optimization avoided unnecessary embedding API calls. This update accelerates the actual document similarity search after vectors are available.

Previously, each query loaded the full vector rows twice, parsed every JSON vector, normalized every passage vector, and tokenized every passage again. The search now checks whether indexed vectors exist with a small SQL query, then loads the authoritative source rows once after query inference. A bounded, account-separated cache retains prepared text tokens and normalized Float64 vectors. Similarity uses a dot product on normalized vectors.

The search remains exact: it keeps all 512 dimensions and does not use approximate neighbors or quantization. Identity checks still prevent mixing model spaces. Edits, deletes, and reindexing invalidate prepared entries, and comparisons against the current database snapshot also detect changes made outside this process. Cache capacity is 1,024 passages across the store; closing the store clears it.

## Measured effect

The local benchmark used 240 synthetic passages, 512-dimensional deterministic embeddings, and three queries. It alternated cached and uncached preparation, discarded five warm-up rounds, and measured 100 queries per condition. All 210 returned source lists and rounded scores matched exactly. A separate regression test compared 200 vectors against the previous cosine calculation, matching scores within `1e-12` and preserving the complete ordering.

| Metric | Uncached preparation | Prepared cache |
| --- | ---: | ---: |
| Median scoring/preparation | 14.448 ms | 2.147 ms |
| Median full local search | 31.773 ms | 18.611 ms |
| p95 full local search | 56.761 ms | 33.699 ms |

That is about **6.7 times faster scoring** and **41% lower median local search time** in this benchmark. Both conditions use the new single-read database path, so this comparison isolates preparation caching rather than claiming a full old-deployment comparison. It excludes embedding API latency, authentication, cloud note refresh, outfit generation, and hosting cold starts. For a tiny library the absolute saving will be smaller.

Run `node scripts/benchmark-exact-search.mjs` to reproduce. Results are written to `output/mobile/exact-search-benchmark.json`. The complete 206-test suite and production build pass. No recognition prompt/model or prior Sprint 7 result was changed.
