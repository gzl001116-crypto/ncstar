# Covers, reader progress and link sharing · 2026-10-17

Production maintenance targets the exact live Worker modules, preserving bindings, assets and private playback code. Do not rebuild the stale application sources over production.

- Header, footer and play use the supplied JPG logo, stored losslessly as base64 text.
- All seven work-cover locations use responsive uploaded images or a gray title cover. Titles are rendered as plain React text and limited to 100 characters. Uploaded-image failures also fall back to the title cover.
- Work title input and JSON publish, multipart upload and edit endpoints now accept up to 100 characters; post and series title limits remain unchanged.
- Comment name, author badge and compact timestamp share one non-wrapping row. Full time remains available in the timestamp title.
- Image readers, document readers and storefront previews toggle progress visibility on content taps. Buttons, sliders, links, media, text selection, cancelled gestures and scrolling do not toggle it. Picture counts remain in use; text does not gain a progress bar.
- Mobile favorite and share actions sit inside the card body below the cover with 44-pixel touch targets.
- Product sharing opens only a URL and copy button in a portal dialog. No device or social website sharing is invoked. Copy uses the modern clipboard API first, with selection/copy fallback and a manual-copy hint on failure.
- Product and creator cards use a real primary anchor stretched across the card, with independent actions above it. Custom card pointer cancellation is removed. Route scroll reset includes search/query changes.

## Checks

Run `cover-reader-link-check.mjs <app.mjs> <index.mjs>` for source and compiled helper behavior. Run `work-title-limit-check.mjs <test-index.mjs>` against an isolated in-memory SQLite database for 100-character publish, file upload, edit and ownership checks. Existing `inbox-security-check.mjs` verifies that private preview access, signed cookies, ranges, deletion/undo and cross-user isolation remain intact.

The browser check covers live logo loading, title fallback, link-only dialog, comment row geometry, card navigation, and hiding/restoring play progress. It uses a desktop browser; no physical-phone verification is claimed. Copy verification compares the clipboard contents for two different work URLs, rather than relying only on a success label.

Use `apply-cover-reader-link.mjs` with the previous readable app, CSS and Worker index to prepare source, compiled app, CSS and patched index. `cover-reader-link-release.mjs` builds a guarded provider-side release from those files, exact old hashes/paths and `nextIndexHash`. It defaults to a dry run and preserves all unmodified Worker modules and bindings. The supplied logo file is `brand-image.base64.txt`.
