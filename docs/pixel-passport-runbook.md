# Pixel Passport runbook

Pixel Passport is the public campus activity at `/event/pixel-passport` (a trailing slash also works). A visitor picks a nickname, builds a pixel character, chooses one of three scenes and saves a private 1080 x 1350 PNG. It needs no account and writes nothing to browser storage. Its only server call is the optional, consented photo step described below.

Design source: `docs/pixel-passport-implementation-handoff.md`.

## Where things live

| File | Role |
| --- | --- |
| `src/main.jsx` | Chooses the event root or the account app from the pathname. Both are lazy imports, so an event visitor never loads `AccessGate`. |
| `server/start.mjs` | Maps the two exact event paths to `dist/index.html`. There is no general SPA fallback. |
| `src/event/event-config.js` | `enabled`, event ID, optional display name and date. Build-time only. |
| `src/event/manifest.js` | Presets, parts, swatches, scenes and captions for renderer `cq-pixel-v1`. |
| `src/event/state.js` | Character specification, validation, edits and the screen reducer. |
| `src/event/render-avatar.js`, `scenes.js`, `render-card.js` | All artwork is drawn from code. One path serves preview, reveal and export. |
| `src/event/capture.js`, `palette.js` | Optional on-device photo reference, camera and colour sampling. |
| `src/event/export-card.js` | PNG blob, download request and optional native share. |
| `src/event/PixelPassport.jsx`, `pixel-passport.css` | Screens and styles, scoped under `.cqpp`. |
| `tests/pixel-passport-*.test.js` | Contract, render/resource and built-server routing tests, picked up by `npm test`. |

## Photo characters (AI)

Approved by the owner on 21 November 2026 with a $5 OpenAI limit. This replaces the handoff's "no upload" rule for this one step.

When switched on, the visitor ticks a consent box, takes or picks one photo, and the browser sends a reduced JPEG (768 px at most) to `POST /api/event/pixel-passport/character`. The server re-encodes it, asks the OpenAI vision model for the top, bottom, shoes, hair, skin colour, headwear and glasses, and returns character settings. The visitor can then change everything. The photo is not written to disk or logged by this app, and it is not on the card. If the step is off, fails or is declined, the hand-built flow is used.

| File | Role |
| --- | --- |
| `server/event-avatar.js` | The public route, limits, prompt and reply mapping. Separate from the authenticated API and the recognition job queue. |
| `src/event/likeness.js` | The only event module that calls the network. Sends no cookies. |

Switches, set on the server (Render environment):

- `CLOSET_EVENT_AI=1` turns the step on. Without it the route answers "not available" and spends nothing.
- `OPENAI_API_KEY` must be set.
- `CLOSET_EVENT_AI_MAX_CALLS` is the total number of model calls per server process (default 150). Each visitor is limited to 6.

The call counter lives in memory and resets when the server restarts, and the price per call depends on the model. The dependable $5 limit is a project budget set in the OpenAI dashboard. Set that before the event.

To stop spending during the event, remove `CLOSET_EVENT_AI` in Render and redeploy; the hand-built flow keeps working.

## One deliberate change from the handoff example

`appearance.headwearColor` was added to the character specification so a cap, beanie or headscarf can be coloured. The manifest, validation and tests all include it.

## Turning the event off

Set `enabled: false` in `src/event/event-config.js`, rebuild and redeploy. The same URL then shows a polite "taking a break" page with no camera, photo or API work. This is not an instant runtime switch.

## Event name and date

Leave `displayName` and `displayDate` empty until confirmed. When set, they replace the "Campus edition" chip on the card.

## Checks before an event

1. `npm test`, `node scripts/verify-onnx-cpu.mjs`, `npm run build`.
2. `npm start`, then open `http://127.0.0.1:4173/event/pixel-passport` directly and refresh it. Vite dev success does not prove the production deep link.
3. With browser dev tools open, complete the journey with a synthetic photo. Apart from the entry HTML and first-party script, style and favicon, the only requests should be to `/api/event/pixel-passport/character`.
4. On a real iPhone (Safari) and Android phone (Chrome): take a photo, deny the camera once, save the card, open the saved image and confirm it is 1080 x 1350 and matches the preview.
5. Tap "Start over for the next person" between visitors on a shared device.

## Not built (extensions)

Shared wall, GIF or video export, saved accounts, wardrobe import and analytics. See section 12 of the handoff before starting any of them.
