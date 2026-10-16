# Work series — October 16, 2026

Publishing and editing now support standalone work, selection of an author's existing series, or inline creation of a new series with a title and optional description. Leave the position blank to append; enter a positive integer to choose a specific position. A duplicate position is rejected before saving. Existing work can be moved between series or returned to standalone publication.

Creator pages include a **系列作品** tab, collection summaries and an ordered collection view. Work cards show their collection and position. Product detail pages include an ordered public table of contents and previous/next links. Each work retains its independent price, purchase, file and playback permissions. Unlisted and removed works are excluded from public collection listings.

## Data and validation

`work_series` stores creator-owned metadata; `work_series_entries` associates one product with one collection and a unique position. These additive tables do not rewrite existing products, prices, purchases, comments or files. Public catalog entries receive series metadata only after the existing visibility check. `/api/work-series` returns only the authenticated creator's own collection choices, including collections without publicly listed work.

Ownership and request origin are validated before upload attachment. After asynchronous file checks finish, the product write, staged upload attachment and series assignment run in one synchronous SQLite transaction. Any assignment or write failure rolls back the entire transaction. Old clients omitting series fields preserve an existing assignment. A same-title publication reuses the author's existing collection.

## Production source safety

The repository's main application source predates the currently deployed uploader, private playback assets, comments, UTC dashboard and fixed-coin USD accounting. **Do not deploy a regular build of main over production.** This maintenance update transforms the exact live Worker modules and changes only the known publication, catalog and UI integration points. Module names determine parsing, never multipart order. The full live UI module and private assets must not be committed to this repository.

Base production fingerprints (UTF-16 FNV-1a): `index.js=14c1601b`, `ui-assets-v6.js=c238fc7c`. The release generator refuses a different base or a transformed main/UI asset path that differs from the locally validated output. Dry run is the default; setting `dryRun:false` generates an executable deployment body for the connected Cloudflare API. Native upload inherits existing bindings, secrets, assets and the Durable Object namespace.

Live UI QA also found a residual **工作台概览** sidebar label. The final transform changes it to **仪表盘**. Production was reconciled with the guarded `navOnly` release mode, based on intermediate fingerprints `bd4e13e6` / `c198979e`. Final fingerprints: main `bd4e13e6`, UI module `38fc3250`; public app `/api/ui/app-84ccf3bb.mjs`, CSS `/api/ui/style-6634f7d0.css`. The series selector and empty collection page were verified in the signed-in browser without publishing synthetic content.

## Verification

Generate a test fixture by applying `applySeriesUpdate` to the exact base Worker and an embedded UI fixture containing the live public app/CSS. Stub the UI import and export `handleApp`, `ensureSchema`, `snapshot`, `communityTables`, money helpers and `setTestRates` for local SQLite execution. Do not run fixture writes against production.

```sh
node --check /path/to/transformed-index.mjs
node --check /path/to/transformed-app.mjs
node maintenance/series-backend-check.mjs /path/to/test-index.mjs
node maintenance/series-ui-check.mjs /path/to/transformed-app.mjs
node maintenance/usd-money-backend-check.mjs /path/to/test-index.mjs
node maintenance/usd-money-ui-check.mjs /path/to/transformed-app.mjs /path/to/usd-dashboard.js
node maintenance/oct16-ui-check.mjs /path/to/transformed-app.mjs
```

Series checks exercise JSON and multipart publication, automatic continuation, explicit positions, cross-author rejection, editing without file replacement, old-client compatibility, public visibility, standalone publication and transaction rollback. UI checks execute the exact compiled work editor in a React hook harness and verify collection selection, form data, save payloads, ordering and navigation. USD regression tests supersede the original October dashboard test's pre-USD currency expectations. Comment policy regression was also rechecked against the transformed Worker. Live verification uses read-only HTTP requests and unauthenticated permission checks; no synthetic work or collection is added to customer data.
