# Fixed coin pricing and USD accounting

Published to https://fanstar.dev/ on 2026-10-16 after the UTC dashboard/comment-control release.

## Behavior

- Products and membership plans have fixed coin prices. Their authoritative catalog amount is stored in USD accounting units: one coin corresponds to one USD unit in the existing coin model. Fiat reference displays change with the selected currency and latest available rates; the coin price does not change with FX.
- Existing public product coin quotes were captured before migration and retained exactly. The migration archives original fiat amounts/currencies in `usd_catalog_archive` before normalizing catalog prices. New authoring/editing forms use coin amounts and USD units, including prices below one coin.
- New orders record USD gross/fees. Existing order columns are retained; additive `usd_amount`, `usd_fee`, `usd_basis` fields provide a stable USD income basis. Historical coin orders use their actual `coin_amount`, and USD orders retain their recorded USD amount. Earlier non-coin/non-USD orders without a historical USD basis are converted once using the migration quote and marked `migration_fx`; the dashboard discloses their presence. They are not revalued on future FX refreshes.
- Income totals, settlement references and the UTC dashboard use the USD basis. The display selector converts that same income immediately instead of filtering orders by their original currency. Date filters and charts retain the prior UTC behavior.
- FX requests are cached for 30 seconds; visible pages check for the latest available quote every 30 seconds and on focus. The upstream ExchangeRate-API open feed still updates on its own daily cadence. This does not provide market tick data.
- Creator support uses an explicit coin amount, balance checks, duplicate submission protection and server idempotency. Debits, ledger entries, support records and orders are atomic. USD support and fixed-price checkout continue to work if the FX source is unavailable. The browser clears pending state on failures and reports insufficient balance.

## Source and application

`apply-usd-money-update.mjs` applies the three `usd-money-*` source files to the previous live Worker/UI modules and accepts an initial product-quote map. It guards production source boundaries and rejects a second application. Use the current live modules, not the older main-branch build: production includes uploads, playback and community functionality absent from main. Preserve the current assets, bindings, secrets and Durable Object identity when publishing. Private playback data is never copied into this repository.

## Verification

59 money/backend checks cover fixed prices under changing FX, USD order values, historical migration, support debits, replay/conflicting idempotency keys, insufficient balances, authentication, FX outages and atomic rollback on ledger failure. 28 component checks cover immediate display-currency conversion without another dashboard request, persistent currency selection, fixed product-detail coin display, support success/failure behavior and low-price editing. 38 prior comment-policy checks were rerun. Browser behavior checks use a component/hook harness, without screenshot QA. No authenticated live monetary transaction was created for testing.

```bash
node maintenance/usd-money-backend-check.mjs /absolute/path/to/test-index.mjs
node maintenance/usd-money-ui-check.mjs /absolute/path/to/patched-app.mjs /absolute/path/to/transformed-dashboard.js
```

The test-enabled Worker must export the functions listed by the backend harness and a test-only `setTestRates` helper. Do not expose that helper in production.

Published Worker fingerprint (FNV-1a over UTF-16 code units): `14c1601b`.
Published app: `/api/ui/app-2f7d977f.mjs`.
Published extra CSS: `/api/ui/style-737a1c7.css`.
