# Mobile sharing, comment names, compact cards and navigation · 2026-10-17

The share dialog changed to a grid while an older, more specific input rule retained `width:0`. Override it explicitly with a full-width link field and a copy button below it. Clipboard behavior from the previous fix remains intact.

The old mobile comment timestamp had `width:100%`. In the new single-line flex header it squeezed the author name to zero width. Reset timestamp width to auto and reserve space for the name. Full year/date/time and author badge remain on the same row; long names truncate within the available width.

Mobile cards have a shallower gray title cover, capped uploaded-image height with contain sizing, smaller padding/type, and actions alongside creator metadata in the body. Favorite/share keep their 44-pixel targets. Two columns remain on narrow phones and three columns apply at 520–760 pixels.

The dock now has a single pending navigation target. It combines queued taps in the next animation frame, ignores repeated taps to the same destination and already-current routes, and does not lock other links during navigation. New taps replace the pending target and cancel older recovery timers. A 1200-ms fallback uses native navigation if the destination never commits; navigation exceptions use the same recovery path. Back navigation, page hiding and unmount cancel pending work. Modified clicks retain normal browser behavior. These changes address duplicate navigation and provide recovery; a specific physical-phone freeze was not reproduced in the desktop browser.

`mobile-response-check.mjs <app.mjs> <css.css>` checks source and compiled navigation behavior, 100 identical/mixed queued taps, newest-target precedence, stale timers, failure recovery, cleanup, modifiers and style overrides. `publish-shop-fix-check.mjs` verifies the preceding publish/edit fix is retained. No production comments, works or messages are written during checks.

Prepare with `apply-mobile-response.mjs <previous-app.mjs> <previous-css.css> <output-dir>` and release through `locale-release-code.mjs` with exact live hash guards. Base fingerprints: index `71ed4664`, UI `71105fe9`, editable app `f0c08ed6`; app `/api/ui/app-c8784fa5.mjs`, CSS `/api/ui/style-d0ff1271.css`. Backend, private playback assets and bindings are preserved.
