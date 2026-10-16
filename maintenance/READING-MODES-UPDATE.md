# Scroll, horizontal and simulated page turns — October 16, 2026

The full play text/image readers now default to continuous vertical scrolling. A visible Reading mode selector offers vertical scrolling, horizontal pages, and simulated paper turns. The choice is stored under `fanstar-reading-mode` in the current origin's local storage and synchronized across mounted readers and browser tabs. Storage denial falls back to scrolling. Compact store/editor previews remain vertical; the play preview surface exposes the same reading modes as full works.

Text streams retain paragraph boundaries and load the next chunk near the bottom, with a manual continuation fallback. Horizontal/paper modes build pages from the available width, height and font size, accounting for paragraph spacing. Navigation supports previous/next buttons, left/right keys in the focused reading area and deliberate horizontal touch gestures. Vertical gestures do not turn pages. `r:` cursors retain normalized character positions across font/mode changes; old streamed `page:` cursors are interpreted. Position reporting is debounced. DOM text anchors handle Unicode offsets when restoring a scrolled location.

Image scrolling shows pages in order and lazily loads later images. Horizontal/paper modes retain the existing comic controls: single/double page, automatic turning and speed, reading direction, slider and fullscreen. The selected image index is retained when changing mode. Paper mode adds a perspective rotation, fold lighting and shadow; reduced-motion preferences suppress these animations.

The document helper supports continuous PDF pages and Office/EPUB/archive content with lazy continuation. PDFs retain range loading; canvases far outside the viewport are released and rendered again on reentry. Horizontal/paper document modes reuse the existing safe renderer and add directional-key/touch navigation and animations. Unlike the text/image React readers, changing a document mode currently remounts its renderer at its initial page. The existing file/preview permissions, sizes, source decoding, 3-way uploads and USD accounting are unchanged.

## Deployment integrity

This is a UI-only release. Main Worker FNV-1a UTF-16 fingerprint stays `90f39c84`. Base UI `dcc47673`; initial modes UI `648db39c`; final UI after character-anchor restoration `7c667cac`. Final app `/api/ui/app-33ee247e.mjs`, CSS `/api/ui/style-82649871.css`, document helper `/api/ui/reading-modes-20f5a0f.mjs`.

`apply-reading-modes-update.mjs` applies to the exact base; `applyReadingModesUiRevision` supports a guarded follow-up that replaces only the appended mode UI. `reading-modes-release-code.mjs` defaults to dry run and verifies main/UI fingerprints and expected hashed public assets before inheriting current bindings, secrets, R2, Durable Objects and static assets. Preserve private playback data and all unrelated document/media assets. Do not deploy the stale regular repository main build over production or commit private live modules.

## Verification

- 36 mode checks cover preference fallback/persistence, Unicode paragraph pagination, Unicode DOM anchors, streamed text, horizontal gestures, ignored vertical gestures, direction keys, default image scrolling and reduced-motion CSS.
- 18 document checks cover continuation, image-only chapters, range PDF options, offscreen canvas recycling, rerendering and cleanup.
- 11 independent-preview, 27 parallel-upload, 31 previous-preview and 46 comment/dashboard UI regression checks passed. The main server module was not modified.
- Syntax checks passed on final app and extended document module. Native Cloudflare upload succeeded and live public app contents matched the tested file.
- Signed-in play verification confirmed the scrolling default, page controls after selecting horizontal mode, simulated-turn classes and persistence after reload. Verification used an existing short authored text work; no synthetic content, purchase or publication was created.

```sh
node maintenance/reading-modes-check.mjs /path/to/transformed-app.mjs
node maintenance/reading-modes-document-check.mjs
node maintenance/independent-preview-ui-check.mjs /path/to/transformed-app.mjs
```
