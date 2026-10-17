# fanstar multilingual interface — 2026-10-17

Production update for the existing ncstar Worker. Seven display languages: Simplified Chinese, Traditional Chinese, Japanese, English, Korean, Thai and Malay. Automatic mode follows navigator.languages in preference order, falling back to English for unsupported languages. A manual choice overrides detection.

Language entry points are the avatar menu, site footer and play footer. The native modal supports keyboard focus containment, Escape, backdrop dismissal and focus return. Language changes update the existing React tree without remounting the app, replacing routes, or rewriting input/data. A one-year fanstar_language cookie shares the preference between fanstar.dev and its subdomains, with localStorage fallback; storage, focus, visibility and browser language changes refresh the setting. No new account API, tracking endpoint or translation provider.

The existing four dictionaries are retained and extended with Korean, Thai and Malay translations for all 665 base keys. New site interface phrases cover search, series, work publishing, preview settings, UTC income reports, comments/replies, notifications, private messages, sharing and soft deletion. Source-owned literals and proven static label arrays are localized; enum values, request fields, creator titles, work bodies, messages and comments are not rewritten. Notification grammar interpolates original titles rather than translating fragments of user text. Interface language affects formatting, not coin prices, currency selection or accounting.

## Files

- locale-core.tsv: Chinese phrase / Korean / Thai / Malay.
- locale-interface.tsv: Chinese / English / Japanese / Traditional Chinese / Korean / Thai / Malay. Overrides resolve old UI wording.
- locale-additional.tsv: original message key / Korean / Thai / Malay, including help, errors and legal summaries.
- locale-runtime.js and locale-interface.css: provider, preference, modal, notification grammar and responsive styles.
- locale-render-plugin.cjs: data-only dictionary extraction and source UI transforms. Never walks DOM text or recursively changes API/user objects.
- apply-locale.mjs: guarded migration from the exact pre-language editable UI. It deliberately refuses a second application.
- locale-check.mjs: detection, invalid preference, storage denial, cross-subdomain cookie, interpolation, raw content/enum preservation, static render fixtures, 665-key placeholder consistency and obfuscated bundle assertions.
- locale-release-code.mjs: creates a hash-guarded Cloudflare execute operation. Current modules and private playback data stay inside Cloudflare. Existing settings, inherited bindings and assets are retained. Dry run is the default.

## Reproduction and validation

The editable app is the current UI asset's internal `.source` property, not its served obfuscated `.body`. Do not expose the source property through any route. The pre-migration source hash was 96cfba86. Existing TSX source predates earlier production maintenance; do not deploy a stale full build over the live Worker.

Extract the four original dictionary objects without executing source:

    node maintenance/apply-locale.mjs extract editable-app.mjs dictionaries.json

For the original one-time migration, pass pre-migration editable app, CSS and extracted dictionaries:

    node maintenance/apply-locale.mjs editable-app.mjs current.css dictionaries.json output-directory
    node --check output-directory/app.mjs
    node --check output-directory/servedApp.mjs
    node maintenance/locale-check.mjs dictionaries.json output-directory/app.mjs output-directory/servedApp.mjs

Use the runtime Babel bundle via CODEX_PRIMARY_RUNTIME_NODE_MODULES, or adapt the compiler import to a locally installed Babel without changing the transformation contract. Babel is used only as a compiler, never for browser automation.

Validated: 2,181 assertions and syntax checks. Live UI verification includes switching languages without navigation, unchanged input text, native dialog interaction, original creator/work text, translated navigation and search options, persistence after reload and shared play preference. No purchase, message, content publication or deletion is part of QA.

## Release

Original backend index: e00f0571, unchanged by the language releases.

Final editable UI hash: 5f01e6fe.
Final UI module hash: 6d7b8d70.
Final served app: /api/ui/app-a69580b3.mjs.
Final CSS: /api/ui/style-c901c580.css.

Delivery keeps lexical obfuscation and source-map blocks. It does not introduce content encryption or alter preview/original-file access controls. The reader helper and private playback assets are retained.
