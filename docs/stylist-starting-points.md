# Useful styling from a small closet

The stylist now returns a starting point when a reviewed wardrobe lacks shoes,
a top, or bottoms. Owned item IDs still come from validated server plans;
unreviewed garments and excluded colors never become owned recommendations.
An empty eligible closet returns advice and missing-piece ideas with no owned IDs.
Starting points containing owned pieces can be saved. Empty shopping ideas cannot
be saved as owned outfits or recorded as wears. Complete-outfit quest checks remain.

A wedding/formal request takes priority over the default everyday occasion.
The model receives bounded wardrobe facts, preferences, retrieved guidance,
personal notes when available, prepared plans and separate shopping suggestions.
It writes a relaxed paragraph explaining what to use and what is missing.
Known casual pieces get transparent dressier-swap suggestions, not assurances
that the outfit satisfies a wedding dress code.

Shopping cards are explicitly placeholders. They have no product URLs, prices,
inventory claims or ownership IDs. Online shopping search is not implemented.

Wardrobe and personal-document retrieval run concurrently with four-second
budgets. Slow wardrobe retrieval falls back to keyword retrieval; unavailable
personal notes are disclosed in the evidence panel. Selection is bounded to
12 seconds for Fast, 18 for Balanced and 25 for Deep, followed by deterministic
advice from the same retrieved wardrobe if the provider fails, stalls, or abstains.
Cancellation propagates and never produces a fallback result.
These budgets cover processing, not a sleeping hosting instance or network transit.

Validation: 197 automated tests pass. Added cases cover a single tee, missing shoes,
empty/unreviewed/excluded wardrobes, formal swaps, anchors, model abstention,
stalled providers, cancellation and saving partial looks without inventing items.
A local production UI check with a public six-piece rehearsal wardrobe and the
brief “im going to wedding give me somthing formlal” returned an OpenAI outfit,
an honest dress-code paragraph and a dress-shoe placeholder in 3.7 seconds.
This is one engineering smoke check, not a latency benchmark or human acceptance study.

The latency approach follows [OpenAI's latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization):
parallel independent work, keep context bounded, and use deterministic work where possible.
