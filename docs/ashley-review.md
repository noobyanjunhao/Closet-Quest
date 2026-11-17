# Ashley review: baseline and follow-up

Date: November 16, 2026. The project owner identifies Ashley as the real person supervising the review. The actions documented here were executed by a fresh-context review agent. Human attendance, ratings and independent task completion were not instrumented or inferred. This is an agent-assisted usability review, separate from a direct-human Sprint 9 session.

The reviewer received only the public app URL, user goals and restrictions. It did not read source code, prior reports or credentials. Public navigation showed a Render startup screen that later resolved (duration unmeasured), sign-in, sign-up and password recovery. No account form was submitted.

The frozen local baseline used build fingerprint `478392750024b8e2f0a11d95bd9dd27f7df4f764d835c0c8a90fd3d842849644`. Paid/cloud calls and server outbound requests were disabled. It contained sample clothes; photo AI and account sync were outside scope. The development source could change while this copied test instance stayed unchanged.

| Action | Observed baseline outcome |
|---|---|
| Add a synthetic garment manually | Saved; count increased from seven to eight. |
| Style the added garment for a formal wedding | Starting piece retained; three suggestions; advice flagged casual shoes and suggested borrowing/renting dress shoes. |
| Inspect evidence | Owned garment facts and styling references visible. |
| Rename and save | Saved look found in Saved looks. |
| Reload | Garment and saved look persisted; current page returned to Closet. |
| Keyboard | Escape closed result modal; Right arrow advanced garment rail. |
| Settings / backup | Export and privacy explanation visible; local import was missing. |

| Defect | Severity and disposition |
|---|---|
| Missing-piece selector retained Top while current advice suggested Shoes | Medium. Select saved category only when it appears in the current suggestion gaps; regression test added. |
| Quick evidence said “Included in the model context” | Medium. Quick evidence now says references are available to read and no generative model was used; technical IDs removed from that summary. |
| Local Settings exposed export without import | Medium. Existing import/review flow now available to local wardrobes too. Full restore and cloud erasure remain unverified. |
| Pre-signup workflow, provider handling and cost explanation too thin | Medium. Added expandable workflow/privacy/recovery introduction. No public demo or paid-tier change added. |
| Save confirmation not persistent | Low. Save succeeded; transient notification was not observed. Remains a discoverability issue. |
| Reload resets navigation page | Low. Data retained; current-page restoration remains open. |
| More menu names unclear in initial accessibility output | Preliminary. Needs a screen-reader audit; not reported as WCAG failure or pass. |

Separate revised snapshot: `22dcd9405860178d5f2aec946f218fb2b5cf94d9ec99b837905760edec5391e0`. The reviewer first selected Top, then repeated the wedding flow: Dress shoes correctly became the initial missing-piece category. Quick evidence correctly stated that no generative model was used and showed zero model attempts. Backup import was visibly present (execution not tested). These three targeted checks passed. Remaining low-severity finding: the collapsed brief summary retained “Campus casual” after the wedding result. No photo recall, human outfit acceptance, correction time, purchases, email delivery or production cloud sync result is claimed from this review.
