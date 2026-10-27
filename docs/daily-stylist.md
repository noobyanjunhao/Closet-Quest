# Daily Stylist and reusable shopping library

The Stylist page introduces Pip, an original SVG fabric companion, an editable outfit brief, a daily edit, and a discovery library. Product cards link to real retailer pages and remain separate from owned wardrobe items. Opening the daily edit, changing filters, or opening the library does not run an OpenAI search.

## Retrieval and cost control

1. Use the bundled starter catalog and recently retrieved public product results.
2. Read the signed-in user's private Supabase shopping-library records. These records never enter the shared public catalog. Hydration is reused for 60 seconds per account.
3. Reuse compatible category/occasion/presentation results for 24 hours, applying the budget and ordering prices low to high. Repeated identical cloud writes are skipped.
4. Only an explicit search without a recent match calls the existing bounded web-search provider. Identical concurrent queries share one request; one client's cancellation does not cancel other clients.
5. Successful results join the server library and the requesting account's cloud library. Local snapshots speed development restarts; Supabase is the durable account store on Render's ephemeral free instance.
6. Daily selection rotates deterministically by UTC date, selecting up to four products. Library view exposes up to 60 matching products. Results older than 14 days are excluded. Provider failure may return younger saved results, explicitly marked stale with the original checked date.

No recurring paid search or scheduled background refresh was added. The starter catalog contains six sourced products across tops, bottoms and shoes. Four one-time expansion queries returned three new products; outerwear and dress queries returned no accepted products. Empty categories remain empty rather than fabricated. New successful searches expand the shelf. Discovery still favors J.Crew, J.Crew Factory and Everlane, and does not cover the whole market.

## Persistence and privacy

`supabase/migrations/002_shopping_library.sql` creates an owner-scoped table keyed by user and normalized query hash. RLS checks auth.uid() for reads and writes; anonymous access is revoked. It stores public product facts and the user's category/style query, never photos or free-text outfit briefs. JSON size is bounded. Cloud records are revalidated before display, including URL schemes, retailer hosts, prices, dates, and field allowlists. Account deletion cascades to saved library rows. Cloud sync failure does not prevent displaying already retrieved results; database availability still affects durability.

The migration was applied to the existing project. Policy inspection confirmed RLS=true, anonymous SELECT=false, authenticated SELECT=true, and owner predicates for reads and writes. This is a targeted check, not a complete security audit.

## Validation

All 219 regression tests and the production build pass. Six library tests cover zero-call daily browsing, rotation, filters, request coalescing, restart persistence, expiration, stale fallback, private account isolation, cancellation, and untrusted stored values.

`output/daily-stylist/reuse-benchmark.json` records actual local HTTP requests using a deterministic fake provider (not paid provider timing): 12 simultaneous equivalent searches succeeded with one provider call. Thirty daily requests used zero additional provider calls; median 15.34 ms, p95 16.53 ms. No production latency or dollar-saving percentage is inferred.

Browser checks used sample wardrobe data: Pip's dressed-up prompt filled the brief, four daily photos loaded, Library showed all six products, and the Shoes filter and brief survived Closet -> Stylist navigation. Physical touch, screen-reader usability and human outfit acceptance remain unmeasured. Motion respects prefers-reduced-motion. Prices, stock, sizes and default photo color must still be confirmed at the retailer.
