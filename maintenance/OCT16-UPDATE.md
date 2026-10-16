# UTC dashboard and comment controls

Published to https://fanstar.dev/ on 2026-10-16.

The live Worker contains newer upload, playback, community and finance behavior than the repository's main branch. These changes were applied to the live modules, preserving static assets, bindings, secrets and Durable Object identity. Do not deploy the older main-branch build to reproduce this release.

## Source

- `oct16-thread.js`: discussion replies collapse by default; each root discussion has an accessible expand/collapse control. Successful replies expand their discussion. Content owners can toggle comments and replies. Existing discussions remain readable when closed.
- `oct16-server.js`: additive `comment_settings` table, owner checks, and a UTC revenue endpoint. The new and legacy comment routes enforce the same policy. Missing settings mean comments are enabled.
- `oct16-dashboard.js`: UTC preset/custom date filters, recorded-currency revenue totals, an income line chart, category bars and an accessible data table.
- `oct16-update.css`: responsive layouts for the controls and dashboard.
- `apply-oct16-update.mjs`: guarded transformation of the previous production Worker and embedded UI module. It accepts the four source strings and returns updated modules; it deliberately rejects a second application.

Private playback data is retained inside Cloudflare and is not included in these files.

## Revenue contract

`GET /api/creator-dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=CNY` is restricted to the signed-in creator's own orders. The end date is inclusive: filtering uses UTC midnight on `from` up to, but not including, midnight after `to`. SQLite parses stored timestamp offsets before comparison and grouping.

Statistics include every matching order, not only the latest 40. Amounts and platform fees use the order's recorded settlement currency; different currencies are never summed together. The default is CNY. Missing days are filled with zero; ranges over 180 days use calendar months. Ranges are limited to approximately 10 years. Net income is gross revenue minus recorded platform fees.

## Verification

64 backend checks cover ownership, defaults, closing/reopening, legacy route enforcement, preserved discussions, complete order history, currency isolation, UTC boundaries, missing periods and invalid input. 46 component checks cover folding, auto-expansion after a reply, duplicate submission prevention, comment switches, date selection, money labels and SVG data. JavaScript syntax and live HTML, app/CSS, public thread data and dashboard authentication were also verified. Component checks use a hook harness; no browser screenshot validation was performed.

Run the checks with a test-enabled copy of the transformed production Worker (exporting `handleApp`, `ensureSchema`, `communityTables`) and the transformed app:

```bash
node maintenance/oct16-backend-check.mjs /absolute/path/to/test-index.mjs
node maintenance/oct16-ui-check.mjs /absolute/path/to/patched-app.mjs
```

Published Worker fingerprint (FNV-1a over UTF-16 code units): `fdc63319`.
Published app: `/api/ui/app-c84436c.mjs`.
Published extra CSS: `/api/ui/style-9ff1bf41.css`.
