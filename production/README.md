# Production patches, 2026-10-16

The current Cloudflare Worker contains newer functionality than `main`'s original Vite sources. These bounded patches apply to that deployed version. Do not deploy the older app over it.

Changes: remove quote-check/source timestamps and refresh/source copy; retain the 30-second refresh behavior; show the settlement-reference disclaimer; add persisted post/work comment replies, server-derived author badges, notifications, and ownership checks. Old comments stay in their original tables. The additive `comment_replies` table records reply relationships. The newest 50 discussion roots and their replies are shown. Deleting a comment deletes its descendant replies atomically, with confirmation when replies exist.

1. Download the current Worker through Cloudflare, selecting multipart modules by **name**, because part order is not stable. Save `index.js` as `live-worker.mjs`. Download the served app/CSS as `live-app.mjs` and `live-style.css` into the same scratch directory. Do not persist private playback data or credentials in this repository.
2. Run `node production/patches/prepare.mjs /absolute/path/to/scratch` to generate ignored local outputs plus the reviewed `deployment-patch.json`.
3. Run `node --check production/index.mjs`, `node --check production/app.mjs`, and `node production/patches/check.mjs` (Node 22+). Checks cover real SQLite writes, reloads, legacy comments, identity, cross-target validation, deletion permissions, cascading deletion, rate limiting, transactional rollback, SSR rendering, and copy.
4. Run `patches/cloudflare-update.js` in the authenticated Cloudflare execute tool, replacing the `PATCH` expression with the packet and `DRY_RUN` with `true`. Confirm the returned hashes. Use `false` to publish the same reviewed result. It stops if any source hash changed, preserves every original module/private asset, and updates code through the content endpoint so bindings and settings stay intact. New UI URLs use content hashes; older assets remain available for already-open sessions.
5. Verify the public HTML references the new paths and that the downloaded app/CSS hashes equal the reviewed outputs. Check `/api/threads` for existing post/work IDs. Browser QA is separate from these checks.

The prior post page also contained an invalid `__DELTA__&` tier guard. This patch repairs that guard while replacing its comment section.
