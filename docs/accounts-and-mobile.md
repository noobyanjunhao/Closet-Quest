# Accounts and mobile app

The account upgrade replaces participant codes with Supabase email/password accounts when both `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured. Without them, local and pilot behavior is retained. Partial cloud configuration fails startup instead of exposing a local anonymous API.

## Data and access

Render serves the React app and Node API from one HTTPS origin. The API validates sessions with Supabase Auth and keeps access/refresh tokens in HttpOnly, Secure, SameSite cookies. Browser requests never receive a Supabase administrative key. Data requests use the verified user's JWT, with database and storage row-level security as a second boundary.

`supabase/migrations/001_accounts.sql` creates owner-scoped wardrobe snapshots and style notes, a revision-checked save function, and a private `closet-photos` bucket. Image paths are derived from the verified account. Uploads are decoded, resized, and re-encoded without EXIF metadata. Original photos retained for background restoration are uploaded privately too.

Wardrobe state includes reviewed garment metadata, saved looks, wear records, preferences, and recommendation feedback. Personal documents persist in Postgres. The server's SQLite/vector index is a rebuildable cache, not the durable source of personal documents. Photo-analysis jobs remain temporary on Render's free filesystem; an interrupted job may need retry after deployment or restart.

One writer serializes each browser's saves. Compare-and-swap revisions reject stale device updates. Unsynced edits remain in browser storage, with explicit conflict recovery and backup export. Cross-device updates appear on reload; this is not live collaborative editing. Browser storage quotas can limit large offline photo batches. Backups include downloaded cloud photos when available and otherwise retain account-relative photo links. Import shows a replacement preview first.

## User flow

1. Create an account, confirm email, and sign in. Password recovery returns to the deployed app.
2. Choose a display name and style directions, then start with personal clothes or explicitly opt into a sample closet.
3. Add camera/gallery photos, review recognized pieces, and save them privately.
4. Describe the day. Recommendations open in a mobile bottom sheet with previous/next controls and swipe navigation, garment inspection, save/wear actions, and feedback.
5. Reopen the account on another device to retrieve the saved wardrobe. Export or import a backup from the account screen.

Dialogs render outside animated page containers, isolate background controls, trap keyboard focus, and restore focus on close. Reduced-motion preferences disable decorative transitions.

## Deployment configuration

- Apply the SQL migration once to a dedicated Supabase project.
- Configure the deployed HTTPS origin as Supabase's Site URL and allowed redirect URL.
- Set the two Supabase environment variables on Render using a **publishable/anon** key. Never use `service_role` or `sb_secret_`.
- Retain `CLOSET_PUBLIC_ORIGIN`, `CLOSET_SESSION_SECRET`, and the existing server-only OpenAI key. Participant codes are ignored in account mode.
- Connect a custom SMTP provider before opening registration to outside users. Supabase's default mail service is restricted to organization-authorized addresses and is rate limited. Email confirmation stays enabled.

## Verification

`tests/cloud.test.js` checks session refresh, cookie flags, scoped photos, configuration, stale writes, rapid edits, and failed uploads. `tests/cloud-api.test.js` tests the HTTP authentication/origin boundaries and verified ownership. These use controlled provider responses, not a claim of successful live email delivery.

`supabase/tests/owner-isolation.sql` exercises actual database permissions with transaction-scoped synthetic users, owner reads/writes, stale revisions, cross-owner data/photo isolation, and anonymous denial; successful execution rolls back all fixtures. Live signup, email delivery, camera hardware, and a two-device user session must be reported separately from automated checks.


## Hosted verification — October 19, 2026

Render successfully deployed commit `273e8ca632f7e4eba3af697dc1439379b5f38855`. The Supabase migration completed, and the Site URL and exact redirect URL are the deployed HTTPS origin. The transactional database isolation script passed all assertions and rolled back its synthetic fixtures. Direct unauthenticated Supabase REST reads of both tables returned 401. The hosted health check returned 200, `/api/session` reported account mode with no user, and private wardrobe/photo endpoints returned 401 without a session. Supporting machine-readable checks are in `output/mobile/`.

Brevo Free account setup and sender verification are complete. Custom SMTP was saved in Supabase using the verified Closet Quest sender, `smtp-relay.brevo.com`, and port 587. A dashboard reload confirmed that SMTP remained enabled and the password was stored and hidden. Credentials are held by Supabase and are not committed to the repository. The owner subsequently confirmed receiving the confirmation email and signing in. Password-reset delivery remains unverified. No email confirmation protections were disabled.

### Authenticated browser smoke test

The deployed account flow was exercised with three existing public demonstration photos, labeled `TEST` in the wardrobe. This is one account and known fixtures, not an unseen-photo accuracy study or human acceptance evaluation.

- All three files uploaded together; recognition returned Top, Bottom, and Shoes correctly. Human-review controls applied the suggestions, accepted edited names, and advanced through all three pieces.
- Private images and reviewed metadata survived reload, a fresh tab, and sign-out/sign-in. The existing profile and style selection were preserved.
- Two real OpenAI styling requests returned only owned reviewed pieces. The interface reported 3.2 and 3.4 seconds respectively; these are pipeline-reported durations, not independently instrumented cold/warm end-to-end latency. No fallback notice appeared in either result (0/2 observed).
- A labeled personal note was saved and reported a ready vector index. Hybrid search returned the note; a subsequent outfit's evidence panel showed it was included in model context.
- One renamed outfit persisted in Saved looks. Wear recorded once, disabled the repeat action, and appeared in the journal. Undo restored all three garment counts to zero; the restored state survived reauthentication.
- Export produced a JSON backup containing three embedded photos, one saved outfit, two recommendation records, and zero remaining test wear records.
- Opening a garment from an outfit card replaced the card with the garment editor rather than stacking two dialogs.

Two copy issues were corrected: the initial session check no longer implies browser-only pilot storage, and the style preference screen no longer says all preferences are stored only on the device. The production build passed after these text changes.

Limitations: the browser viewport override did not take effect (observed width 1280), so this run verifies desktop flow, not phone layout, touch gestures, or physical camera capture. Multi-piece detection in a single photo, password reset, multi-device conflicts, and human outfit acceptance remain separate tests. No acceptance feedback was fabricated. The three test pieces, one saved look, and one clearly labeled reference remain available for review; the test wear was undone.
