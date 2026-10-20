# Retrieval speed update

Fast styling now skips wardrobe embedding calls when all eligible clothes fit in the 18-piece shortlist. It still includes every reviewed, preference-eligible item, applies local keyword ranking and preferences, and lets the stylist explain the result. Balanced, Deep, larger closets, and named study conditions retain hybrid retrieval.

Document embeddings now share the bounded account-scoped vector cache: up to 512 entries across the process, with a ten-minute expiry and model/schema/dimension checks. Cached entries contain hashed keys and vectors, not plaintext notes. Search results are never cached. Source notes are refreshed from the cloud on each request, and the local index is read again after inference so edits and deletions remain visible.

Fast styling also avoids embedding new cloud notes while the user waits. Those notes are immediately searchable by keyword; semantic indexing remains available through note management/reindexing or Balanced/Deep requests. Existing indexed passages still support semantic search in Fast. Cancellation reaches the cloud read and prevents late indexing writes.

## Measured results

On October 20, 2026, `node scripts/benchmark-retrieval-speed.mjs` measured three synthetic briefs against 18 reviewed synthetic garments, plus three searches of one synthetic style note. OpenAI embeddings were live; timing was measured in the local Node process. Each hybrid wardrobe query was run cold and warm, followed by the Fast path.

| Retrieval operation | Median |
| --- | ---: |
| Hybrid wardrobe, cold query and garment vectors | 739.84 ms |
| Hybrid wardrobe, cached vectors | 2.89 ms |
| Fast small closet, no wardrobe embedding call | 0.65 ms |
| Document search, cold query vector | 197.54 ms |
| Document search, cached query vector | 0.46 ms |

All three Fast runs retained 18/18 eligible pieces and made zero wardrobe embedding calls. These timings isolate retrieval: they exclude authentication, cloud source reads, outfit generation, browser rendering, and Render cold starts. Three synthetic briefs do not establish real-user fashion quality or typical production latency. Local ranking changes ranking evidence and can affect downstream choices even though candidate coverage is unchanged.

The full regression suite passed 202 tests, and the production build passed. New coverage checks complete candidate retention, profile/study boundaries, cache isolation, fresh edits/deletions, deferred indexing, and cancellation.

To reproduce, configure the existing server environment and run the benchmark script. It writes timings and cache counters to `output/mobile/retrieval-speed-benchmark.json` and uses only synthetic fixtures. Run `node --test tests/*.test.js` and `npm run build` for regression checks. Keep the existing Sprint 7 evaluation separate from this engineering benchmark.
