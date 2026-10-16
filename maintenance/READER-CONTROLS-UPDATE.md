# Reader arrows and progress — October 16, 2026

The mode selector remains; the text-size/background buttons and full bottom pagination toolbars are removed from the active text/image reader UI. Horizontal and simulated page modes use visible previous/next arrow buttons on the left/right edges. Bounds disable the appropriate arrow. Text pages reserve side space for controls and size themselves to the available viewport.

A thin draggable progress slider seeks text pages, images and document pages/chapters. Complete content shows page position and percentage; text/document streams whose full length is not known label the loaded range explicitly rather than presenting the current buffer as the whole work. Scrolling readers expose a compact slider next to/under the mode selector. The image reader's active minimal layout uses left-to-right arrows. Existing touch/key navigation and mode persistence remain.

PDF and single-chapter document sliders dispatch an internal renderer seek event for direct jumps; multi-chapter packages seek chapters through the renderer's existing selector. Original bounds, rendering and cleanup own the operation. The old document toolbar is hidden in the arrow layout, with its underlying controls reused to keep navigation consistent. Scroll sliders move to a loaded section. The main Worker, access rules, 500 MB previews, accounting, file upload and comment functionality are unchanged.

## Release

UI-only change; main fingerprint remains 90f39c84. Base UI 7c667cac, released UI f84959a5.
Public app /api/ui/app-77c94948.mjs, CSS /api/ui/style-b4602fd5.css, document helper /api/ui/reader-controls-267d290b.mjs.

Use apply-reader-controls-update.mjs only against the fingerprinted live modules selected by name. reader-controls-release-code.mjs defaults to dry run and validates main/UI hashes plus the transformed asset paths. Preserve private playback assets and inherit all current bindings, secrets, R2, Durable Objects and static assets. Do not deploy the stale repository main build or commit private live modules.

## Checks

- 28 component checks cover removed bars, arrow rendering, boundaries, text/image navigation, slider seeking, progress labels for complete/partial content and scrolling mode.
- 15 document adapter checks cover arrow navigation, direct seek, progress synchronization, scroll seeking and disposal.
- 11 independent-preview, 27 multipart-upload and 46 comment/dashboard UI regression checks passed. Final app and extended document module syntax checks passed.
- Signed-in live play verification confirmed the removed auxiliary buttons, left/right edge positions and visible progress slider.
- Native Cloudflare upload succeeded with the main module unchanged. No synthetic work, purchase or publication was created for verification.

Run node maintenance/reader-controls-check.mjs /path/to/transformed-app.mjs and node maintenance/reader-controls-document-check.mjs.
