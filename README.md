# Closet Quest

A minimal, responsive frontend demo for the Closet Quest semester project, maintained in `noobyanjunhao/Closet-Quest`.

## Sprint 3 Technical Feasibility and Baseline

**Submission:** [Four-page feasibility report](output/pdf/Closet-Quest-Sprint-3-Feasibility-Report.pdf). Decision: **Modify** the implementation and continue the core workflow. The course file upload is still a manual submission.

- **Outfit experiment:** 30 synthetic wardrobes, 180 requests. On 98 feasible requests, top-three constraint success improved from 78/98 to 98/98; correct abstention improved from 36/82 to 82/82. These are engineering constraints, not human fashion ratings.
- **Vision smoke test:** real pretrained CLIP and SigLIP inference on 18 original garment illustrations, with no training. CLIP classified 18/18 and SigLIP 17/18. These results do not establish real-photo accuracy. Model selection and any tuning remain collaborative.
- **App improvements:** three ranked outfit options, exact context-tag matching, dress alternatives, explanations, clear abstention messages, stricter quest validation, and an interactive **Lab** screen.
- **Reproduction:** `npm test`, `npm run benchmark`, and `npm run vision:compare`. Vision downloads pinned public model weights on first run; the app itself does not load those models.
- [Outfit experiment protocol and raw evidence](experiments/README.md) · [Vision comparison and next evaluation](vision/README.md).

The benchmark preserves an exhaustive-ranking failure (>2 seconds for a 200-item stress case) and the bounded fix. The PDF is generated from checked-in results, not invented measurements. To regenerate it, install Python packages from `scripts/report-requirements.txt`, then run `python scripts/build_report.py` from the repository root.

Rediscover clothes you own: organize a digital closet, build outfits, complete styling quests, track wears, and prepare resale listings.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm test          # outfit, quest, wear-tracking, and listing logic
npm run build    # production files in dist/
npm run preview  # serve the production build locally
```

## Five-minute demo

1. Open **Closet**. Six illustrated sample garments are ready to use. Click the profile at the bottom of the desktop sidebar to set a local display name.
2. Click **Add a garment**, choose a JPG/PNG/WebP photo (up to 8 MB), review the suggested category, edit the name/color/tags, and save. Repeat to demonstrate five uploads. You can also add a garment without a photo.
3. Search or filter the wardrobe. Click a garment to edit its metadata, replace its photo, record a wear, prepare a resale listing, or delete it.
4. Open **Quests** and start **The hidden gem**. With a fresh sample closet it generates a campus outfit containing a less-worn garment. Older saved closets retain their original tags; edit a low-use piece to include `Campus casual` if needed. Up to three ranked options appear on the Outfits screen.
5. Click **Submit outfit + earn XP** to earn 50 XP. Submit before recording a wear if the selected hidden gem already has one wear. Each quest awards XP once; every 100 XP advances a level.
6. Click **Mark outfit as worn**. Every selected garment receives one wear. This button prevents accidental duplicate recording for that generated outfit.
7. Open **Resale**, select a low-use garment, edit its listing, and copy the text or export a JSON package. Uploaded photos are included as data URLs; sample illustrations are not real listing photos.
8. Refresh to show persistence in the same browser. Use garment deletion to demonstrate local data control.

## What works and what is simulated

| Requirement | This demo |
| --- | --- |
| Persistent wardrobe | Browser localStorage, seeded with six sample garments |
| Account | Local display name only; no authentication or account isolation |
| Upload / metadata correction | Local image resizing; editable name, category, color, and tags |
| AI image processing | **Simulated** category assistance based on filename; default editable color and tags; no background removal or vision model |
| Closet management | Add, view, edit, search, filter, delete garment and stored photo |
| Styling | Complete outfit ranking; matching context tags; top + bottom or dress, shoes and optional presentation outerwear; owned pieces only; up to three options; abstention when impossible |
| Gameplay | Three context-specific quests, validated submissions, one-time XP rewards, level progress |
| Usage | Garment/outfit wear count and last-worn timestamp |
| Low-use discovery | Garments with zero or one recorded wear |
| Resale | Editable template, clipboard copy, JSON export with uploaded photo; no auto-posting |

This is a React web prototype for convenient laptop and mobile-browser demos. The proposed Expo/React Native app, FastAPI backend, PostgreSQL, object storage, real authentication, background cleanup, and AI services are future semester implementation work. This frontend does **not** claim completion of those backend/AI requirements or validated research metrics.

## Project structure

```text
src/main.jsx        Screens, local persistence, uploads, export
src/logic.js        Sample data, outfit rules, quests, usage, listing template
src/style.css       Responsive layout and garment presentation
tests/logic.test.js Focused business-logic tests using Node's test runner
```

The frontend uses React and Vite with no backend or API keys. Local CLI vision experiments use Transformers.js with ONNX CPU inference, independently of the browser upload flow. Garment illustrations are original inline SVGs. Google Fonts is optional; system sans-serif fonts work when offline. The lockfile pins dependencies for repeatable installs. Transitive `sharp` and `adm-zip` overrides select patched versions; both model runs were verified after updating them.

## Storage, privacy, and limitations

- Wardrobe metadata and resized photos stay in this browser's localStorage. They are not uploaded to a service. Anyone using the same browser profile can access them: this is not secure account storage.
- Photos are resized to a maximum dimension of 700px to keep demo storage small. Storage quota errors show a message and leave the previous saved state intact.
- Exporting or copying a listing is an explicit user action. The export includes the stored original-background photo, not an AI-cleaned image.
- Clearing site data resets the demo to the six sample garments. Data does not sync between browsers or devices. Browser storage can be cleared by the user/browser.
- Recorded wears are demo counts, not verified garment condition. Verify all resale details before publishing.
- No body scoring, payments, social feed, marketplace integration, weather service, or claimed AI accuracy/performance benchmarks.

## Static deployment

Run `npm run build` and serve `dist/` with any static web host. A deployment should use HTTPS for clipboard support. The app uses no client-side URL routes, so no route-rewrite configuration is needed. Use `npm run build -- --base=./` if deploying under a repository subpath such as GitHub Pages.

Hosting is not provisioned automatically by this repository. The semester API reliability, real AI accuracy, latency, and user-validation targets require a connected backend and measured tests.
