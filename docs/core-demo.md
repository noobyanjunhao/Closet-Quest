# Four-minute core prototype demonstration

## Start

Use Node 22.12+ (tested 24.19). Run `npm ci`, `npm run ai:start`, then `npm run dev`. Installed Ollama models are required for local recognition/styling; `npm run ai:setup` installs the configured models if needed. Quick styling works without Ollama. The production option is `npm run build` then `npm start` on port 4173. `npm run preview` has no API.

For OpenAI or Depop, copy `.env.example` to `.env.local`, enter credentials on the server and restart. Never put credentials in a `VITE_` variable or a course upload. Auto uses OpenAI only when configured. Depop requires a partner-approved key matching staging/production.

## Demonstrate

1. **0:00 - Capture and review.** Open Closet, Add clothes. Show camera preview/capture/retake on a supported device, or Choose photos and use your own garment photo. A sample image can demonstrate the UI but must be described as a sample. Photos are resized locally; the review dialog opens immediately. Local analysis continues in the background. Untouched fields fill automatically; edits are preserved. Verify name/category, then Save piece (or Save & review next).
2. **1:00 - Recommend.** Open Stylist, choose an occasion, enter a brief and click Create my looks. Auto without a key uses Quick matches. Show three alternatives and their real garment cards. Save a look and find it under Saved looks. In Preferences choose a starting piece; verify every suggested outfit includes it. New unreviewed photos are excluded.
3. **2:00 - Explain the AI.** In Preferences select Local AI, or OpenAI with a configured key. Explain: one retrieval request, up to 18 relevant garments, up to 12 complete plans, model selection, validation. Expand How this look was made to inspect wardrobe evidence. Explain that a labeled Quick fallback is available if inference fails and that Quick is not an LLM output. Show cancellation if needed.
4. **3:00 - Resale and evaluation.** More → Resale drafts. Show an editable draft/export. Expand Connect Depop: the status says whether a key is configured; Check connection & listings validates approved access. Do not describe the unconfigured state as a live integration. Present the PDF's measured comparison and the exact-occasion tradeoff. State that 7/7 photo and 8/8 retrieval results reuse development data, and OpenAI/Depop live results require credentials.

## Expected limitations to state

No cloud account isolation or cross-device storage, no trained LLM/VLM adapter, no measured human styling preference, no automatic Depop publishing. Local inference varies with cold model loading; 8.24 seconds is one observed second-run sample, not a latency guarantee. The 15 ms median is Quick local HTTP, not OpenAI inference. Camera lifecycle and UI recovery were tested separately from physical-device capture.

## Evidence commands

`npm test` (91 tests), `npm run ml:test` (8), `python -m unittest discover -s ml -p test_lora.py` (5), `npm run core:evaluate`, and `npm run core:live`. The last command needs a running app/local models and makes two billable OpenAI calls if its key is configured.
