# Browser language, footer and mobile clicks — 2026-10-17

This update supersedes the manual language selection described in MULTILINGUAL-UPDATE.md.

The seven existing translations remain. Display language now comes only from navigator.languages, with navigator.language fallback and English for unsupported preferences. The UI has no language picker. A browser languagechange, focus, pageshow or visibility restoration rechecks the browser. Existing fanstar.language localStorage and fanstar_language cookies are retired without touching account, currency or other settings.

The main footer contains the brand, clock and legal/help links. The promotional description and entire account column have been removed. Header avatar actions, authentication and the mobile navigation remain. The play footer has only legal links.

## Click corrections

The former experienceCardOpen canceled navigation whenever window.getSelection() contained any text anywhere on the page. A stale selection could therefore make unrelated work or creator cards seem unresponsive. Cards now track their own pointer gesture. A fresh tap opens the card; real movement over 10 CSS pixels, pointer cancellation, a second pointer or context-menu selection suppresses only that gesture. Subsequent taps reset the state. Existing links, buttons, forms, content editing and modified clicks retain their behavior. No global touch/click prevention or pointer capture is used.

Favorites previously stayed disabled while community state was not ready. The initial community request can fail, leaving the button disabled without an action. Favorites can now retry loading the current state on click, calculate the intended toggle from that fresh state and then submit once. Failed refreshes do not submit a toggle and remain retryable. Busy feedback is visible and errors use the existing inline feedback. Production favorite state was not changed during verification.

Mobile card favorite and share buttons have 44 × 44 CSS pixel targets. Mobile links and buttons use touch-action: manipulation while preserving scrolling and pinch zoom. Decorative icons do not intercept hits.

## Source and validation

- browser-language-runtime.js: automatic provider and retired-preference cleanup.
- card-gesture.js: gesture lifecycle, card routing and favorite retry action.
- browser-language-mobile.css: compact footer and mobile hit targets.
- apply-browser-language-mobile.mjs: one-time, guarded migration of the exact editable live UI; refuses a second application.
- browser-language-mobile-check.mjs: 113 assertions across readable and obfuscated code, including all seven browser languages, ignored old preference, languagechange/focus/pageshow/visibility, cancellation recovery, nested controls, modifier clicks, unrelated selection, favorite refresh failure, and rendered footer structure.

Apply using the current UI asset's internal .source, not the served obfuscated .body. Do not deploy the older TSX full build over existing production maintenance:

    node maintenance/apply-browser-language-mobile.mjs base-app.mjs base.css output-directory
    node --check output-directory/app.mjs
    node --check output-directory/servedApp.mjs
    node maintenance/browser-language-mobile-check.mjs output-directory/app.mjs

Use maintenance/locale-release-code.mjs with explicit old module/source hashes and app/CSS paths. It creates a dry-run-first Cloudflare operation; existing settings, inherited bindings, private playback assets, reader helper and backend stay at the provider. The validated UI payload is public code only. Obfuscation and source-map route protections remain intact.

Verified live: both main site and play show no manual language entry and use browser Chinese; footer has no description or account links; the work card price/body opens the correct work on one click; avatar menu remains functional and closes on outside click. Device-specific physical touch behavior was covered by gesture simulations rather than a real-phone browser session. No publication, purchase, direct message, favorite toggle or deletion was performed during QA.

## Release fingerprints

Before: index e00f0571, UI 75a8314a, editable UI 87c095e2.
After: backend index e00f0571 (unchanged), UI f623693a, editable UI dcd1e0c4.
Served app: /api/ui/app-a55df077.mjs.
CSS: /api/ui/style-c1b8b162.css.
