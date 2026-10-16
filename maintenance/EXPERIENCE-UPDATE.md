# Reading, mobile navigation and messaging — October 16, 2026 UTC

Published to fanstar.dev from the exact live Worker, preserving its private playback modules, static assets, R2, Durable Object namespace, bindings and secrets. The ordinary repository build is stale and must not be deployed over this release.

## Behavior

- Scroll reading progress sits at the bottom. Archive reads use bounded parallel 1 MiB ranges, shared pending requests and bounded caches. Document images load near the viewport with two concurrent image jobs; paginated comics prefetch the next two images. Reserved space reduces layout jumps and failed images expose retry controls.
- Previews show text/image counts and a progress slider. The preview image observer is rooted at the preview scroll container, avoiding eagerly fetching an entire long image collection.
- Product and creator card backgrounds support pointer and keyboard navigation while nested controls retain their actions. Historic replacement sentinels in membership and navigation helpers are repaired.
- Mobile navigation fixes products, following, messages, notifications and account links to the bottom safe area. Header layout, product grids, checkout, publishing fields and conversations adapt to narrow screens. Account menus include cart/recharge links, scroll when needed, and dismiss on outside click or Escape.
- Insufficient coins change the checkout action to Recharge coins and navigate to the existing https://coin.starchose.org wallet. Focus/visibility refreshes the wallet state after returning. Sufficient-balance checkout keeps the existing payment path.
- Private messages support emoji, image/GIF stickers and file attachments through scoped resumable uploads. Attachments are limited to five per message and less than 5 GB total. Only the sender and recipient can retrieve files. Server validation checks upload ownership, intended peer, R2 size, readiness, expiration and reuse. Generic attachments download with restrictive headers; supported inline images require matching magic bytes. Retry retains drafts and message idempotency.
- Following has its own page. Opening notifications marks them read. The creator support control and payment endpoint are removed; historic ledgers and memberships remain available.
- Creator and listed product share URLs provide server-rendered canonical, title, description and Open Graph/Twitter metadata, including the actual uploaded cover/avatar where present. Hidden products expose no metadata. Social applications control their own cache refresh and card rendering.

## Validation

52 backend checks cover private attachments, message upload scopes, non-creator authorization, idempotency, CSRF, metadata escaping, removed support and notification reads. 34 UI checks cover card navigation, preview counts/progress, recharge versus payment, following, read-on-open, outside dismissal, composer behavior and repaired membership checks. 24 reader checks cover parallel ranges, decompression integrity, duplicate request coalescing, cache eviction, cancellation and bottom progress. Main, app and document syntax checks pass.

Existing work-action (33), series (64), independent-preview (124), reader-control (28), shop-refinement (73) and studio-refresh (56) checks passed against the main implementation. The older USD suite still expects the intentionally removed support operation and is not claimed as passing unchanged.

Live checks verified bottom reader progress geometry, whole-card navigation, preview counts/progress, outside menu dismissal, following, notification loading/read behavior, inbox entry, account cart/recharge links, and server-rendered product metadata. The final served app matches the validated app byte for byte. In the same 86-image preview, requested images decreased from 86 to 4 at initial view. A synthetic ~6 MiB archive needed eight reads rather than 26 with the old chunk size; this is not a production latency measurement. No real message, upload, payment or external social share was submitted during QA. Narrow-screen rules were checked in source and UI tests; an actual phone viewport was not visually exercised.

## Release guards

Initial base: main b787db5e, UI be431425. Main implementation: main deeb0be7, UI 5731ac91. Preview follow-up: UI 656daed2. Final menu/mobile polish: main deeb0be7, UI bbedaf7f.

Final public assets:

- /api/ui/app-1f7d7000.mjs
- /api/ui/style-3e6dae15.css
- /api/ui/experience-reader-efe5efb.mjs

`apply-experience-update.mjs` contains guarded full and incremental transforms. `experience-release-code.mjs` generates Cloudflare execution code and defaults to dry run. Supply exact expected source fingerprints and validated output paths; a changed source refuses deployment. Full private Worker/UI modules must remain inside Cloudflare and must never be committed or printed. Only these public maintenance helpers and tests belong in git.
