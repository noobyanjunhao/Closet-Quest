# Closet Quest user guide

[Open Closet Quest](https://closet-quest-junhao-s7.onrender.com/). The hosted app saves your wardrobe to your account. The local development version saves it in that browser. A sleeping free server can take time to open.

## Your first outfit

1. **Create an account and confirm your email.** Use a password of at least ten characters. Follow the confirmation link, then sign in. You can explore sample clothes during onboarding or start with your own.
2. **Closet → Add clothes.** Take a photo or choose up to eight JPEG, PNG or WebP photos. A scene can contain multiple pieces. Use a clear, well-lit photo; choose **Add without a photo** if you prefer to enter details yourself.
3. **Review before saving.** Compare the suggestions with the original image. Correct the name, category, color and crop; save each piece. Add anything the model missed. A completed analysis does not mean every garment was found.
4. **Stylist → describe your plans.** For example: “I'm a guest at an evening wedding. I'd like something formal from what I own.” You can choose a starting piece. Small closets receive a starting point with missing-piece ideas. Check the dress code yourself.
5. **Save a look and return to it.** Open an outfit card, choose **Save this look** or **Save this starting point**, then find it in **Saved looks**. **Wear today** records a wear. In account mode, wait for the saved/synced indicator before signing out.

**My style** stores your preferred colors, fit and style. Knowledge notes can add context, and explicit outfit feedback influences future ranking. These preferences do not retrain a model immediately. The explanation and evidence panels show which owned pieces and references support a suggestion. A Quick result uses local rules; a fallback notice means the selected model did not finish successfully.

## Optional shopping and backups

External finds are suggestions to consider, not clothes in your wardrobe. Browse by category and budget; check the retailer's final price, variant, stock and delivery before deciding. Saved catalog entries may be old. The app does not purchase anything for you.

Open **More → Settings & backup** to export your wardrobe or import a previous backup. **Import replaces the current wardrobe:** export the current version first, check the displayed piece/look counts, then confirm only the backup you intended. A wardrobe backup can contain personal data; keep it private. The beta-test results export is a separate, smaller measurement file.

If the download does not open, choose **Show backup text** and save the displayed JSON in a private file. Export waits only a bounded time for cloud photos; read any missing-photo warning before relying on that file as your only copy. Keep the original backup until the restored wardrobe shows **in sync**, then refresh and check the photos again. Importing into a signed-in account binds the restored data to that account; an old backup's account identifier does not grant access to another person's closet.

## If something goes wrong

| Situation | What to do |
|---|---|
| Sign-in asks for email confirmation | Check your inbox and spam folder, open the confirmation email, then sign in again. Use **Forgot password?** for a reset. |
| Signup reports that email could not be sent | Account creation may not have finished. Report the message to the owner; do not repeatedly submit or assume a reset email will fix a missing account. |
| Cloud database cannot be reached | Keep browser data and export pending work. The owner must repair the backend connection; changing your password does not repair a database outage. |
| Photo is blurry, dark or misses a piece | Keep correct detections, retake a closer photo or add the missing piece manually. |
| AI is busy, unavailable or returns a fallback | Your saved clothes remain available. Try Quick matches, keep the useful starting point, or retry later. |
| Changes have not synced | Keep the page open and use **Retry sync**. Export a backup before signing out. |
| Two versions of the closet appear | Export this device's pending changes before loading the latest cloud version. Do not discard the only copy of unsynced work. |

To report a defect, send the team the page/action, expected result, actual message, device/browser and approximate time. Include the request ID if shown. Do not post passwords, API keys, confirmation links or private photographs in a public issue.

## Privacy and beta testing

In **My style → AI preferences**, choose **Manual review** to add photos without AI analysis. Saved account photos still go to private Supabase storage. OpenAI recognition sends the analysis image to OpenAI. In knowledge settings, **Keyword only** avoids embedding API requests; retrieved notes can still reach your chosen styling model. **Quick** styling uses rules without generation. Styling sends reviewed descriptions, preferences and relevant notes, rather than your photo or display name. Removing a garment may leave private photo objects in cloud storage; full erasure and provider retention have not been independently audited. Avoid sensitive images and do not put payment details into purchase import.

For a formal session, open **More → Beta test & feedback** and use a code such as `p01`. Record whether you operate the app yourself or an agent operates it while you review. Use your own untested photos, no sample clothes, and an agreed frozen release. Start each task timer, record passed/failed/skipped and assistance, then export. The team does not receive this file automatically. See the [test handoff](sprint9-delivery-checklist.md#independent-tester-handoff).
