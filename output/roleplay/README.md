# Role-play scenario implementation

The landscape presentation is `output/pdf/Closet-Quest-Roleplay-Demo.pdf`. Original browser screenshots are under `output/roleplay/screenshots/`. These are real UI captures, not mockups.

Open `http://127.0.0.1:5173/?demo=roleplay` while the development server runs. This uses a separate local-storage key, sample photographs and simulated wear dates. It never replaces the normal wardrobe. Learning feedback is disabled for this wardrobe. Its generated outfits, saved looks, earned XP, inspiration review and listing draft were exercised through the app UI. The script's green jacket is represented by the existing navy blazer photo.

| Scenario | Implementation | Observed result |
| --- | --- | --- |
| Forgotten favorite | More > Closet check & resale compares last-worn dates; unknown history stays unknown | Blazer at 43 days and sneakers at 96 days appeared, including the frequently worn sneakers |
| Add clothes | Existing camera/file upload, local garment analysis and editable review; new reversible plain-background cleanup | Public tee analyzed as White T-shirt / Top / White. Tote cleanup preview removed the plain background; apply and restore worked in the editor |
| Dinner | Existing grounded stylist with a chosen garment anchor and brief | Owned tee, jeans, sneakers and navy blazer; Quick mode honestly labeled non-generative |
| Three-look quest | More > Style quests > Forgotten Favorite. Choose one reviewed piece, save three distinct complete outfit bases, claim 150 XP once | Three different saved combinations counted. UI awarded 150 XP and showed level 2 |
| Inspiration | New local `/api/inspiration` normalizes a photo, extracts bounded clothing ideas with Qwen3-VL, permits review and persistence, then matches owned categories and keywords | Live photo produced shirt, trousers, loafers, belt and a mistaken socks entry. Reviewer removed socks and an unverified leather claim. Reopening after reload retained reviewed ideas. Missing belt is shown as a gap, not a tote |
| Closet check actions | Style anchors the chosen piece, Keep snoozes it for 30 days, Show kept pieces reverses snoozes, Resell opens the item's draft | Keep removed the blazer reminder, and Show kept pieces restored it |
| Resale | Existing copy/photo-export flow, new garment preview and persistent editable draft | Sneakers draft saved and reopened. No external listing was published |
| Wear cycle | Saved looks > Wear today, with journal and exact undo | New journal entry and disabled repeated-wear button appeared. Undo restored previous counts and dates |

## Validation

On 29 September 2026, `npm test` passed 96 tests. The five added checks cover age/unknown-history handling, distinct quest bases and reward idempotence, owned inspiration alternatives and missing accessory types, edge-connected background cleanup, and inference serialization at the inspiration HTTP endpoint. `npm run build -- --configLoader runner` passed. The runner flag avoids this environment's sandbox restriction on esbuild inspecting parent directories.

Phone checks at 390 x 844 verified the quest and inspiration screens without horizontal overflow (375 px document width excluding the scrollbar). Viewport override was reset. Browser console reported no errors at the final UI check.

## Honest boundaries

- The demonstration dates/counts are sample data, not real user history. Session-created actions are real prototype actions.
- Background cleanup is a conservative edge-connected color algorithm for simple backdrops. It is not semantic AI segmentation. It can remove similar garment colors, so preview and recovery are essential.
- Inspiration extraction uses the installed local vision model. Matching uses category and keyword overlap, not a trained image-to-image fashion embedding. A white tee can be an alternative to a striped shirt, but is never described as an exact match. Accessory subtype rules prevent belt-to-tote substitutions for recognized accessory types.
- Prompt refinements tell the vision model to classify socks as accessories and one matching pair of shoes as one piece. Human review remains necessary.
- Physical camera capture was not verified in this session. The existing camera and upload controls are shown in the appendix.
- The export is a listing starter package. Brand, size, measurements, condition, price and shipping still require human verification. Depop requires approved partner credentials and does not automatically publish listings.
- Weather integration, cloud accounts and model fine-tuning are not represented as completed features.

Photo provenance and licenses are in `public/photos/sources.json`, copied into the screenshot package. Model outputs and manual corrections here concern only those public sample photographs.
