# Catalog and header search — October 17, 2026

The work catalog's duplicate search input is removed. The shared header and mobile menu now contain the keyword input, an adjacent Product / Author / Post selector and an explicit search button. Enter and the button submit to `/explore`, carrying the selected search type and query. The header synchronizes with the URL after navigation, refresh and history changes.

Product search defaults to title OR any tag. Description, category and author name no longer create implicit product matches. The result page includes separate Title and Tags scope checkboxes and an OR / AND relationship selector. One field must remain selected; the relationship selector is disabled when only one field is active. AND requires the query in the title and at least one tag. Matching normalizes Unicode width, ignores case and trims query whitespace. Listed products only are shown, including for creators whose snapshots contain their unlisted works.

Author search uses public name, handle, bio and tags. Post search uses the title and excerpt available in the existing authorized snapshot and never searches private body content. Existing creator/post cards and their access controls remain in use. Result type tabs preserve the query; product category, sort, matching fields and relationship are carried in the URL. Product sort/category filters remain available without a second keyword box.

## Release

Production main remains byte-identical at fingerprint `b787db5e`. Base UI `1e0d3f0a`; released UI `627d7374`. App `/api/ui/app-1a0c4013.mjs`; CSS `/api/ui/style-c3531cb7.css`.

Use `apply-catalog-search-update.mjs` only with the expected live module fingerprints through `catalog-search-release-code.mjs`. The release generator defaults to a dry run and checks the expected main, app and CSS output. It inherits live bindings/secrets, R2, Durable Objects and static assets, and preserves private playback resources inside Cloudflare. Do not deploy the stale regular repository build or commit private full UI modules.

## Validation

- 72 search checks passed: title/tag OR and AND, single-field scopes, field validation, no description/author false positives, unlisted exclusion, Unicode/case handling, URL persistence, type switching, header and mobile submission, result rendering, no private-body searching and sort fidelity.
- 56 studio and 28 reader-control regression checks passed against the transformed app. Main/app syntax checks passed; main bytes remained unchanged.
- Native Cloudflare release succeeded. Live `/explore` returned HTTP 200 and referenced the new app and CSS. Served app bytes and stylesheet fingerprint matched the validated output.
- The verification browser returned a connection-refused gateway error before loading the application. Visual browser verification could not be completed in that session; no production records were created or changed during testing.

Run `node maintenance/catalog-search-check.mjs /path/to/transformed-app.mjs`.
