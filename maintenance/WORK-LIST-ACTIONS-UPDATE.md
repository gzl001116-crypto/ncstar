# Work list visibility and sharing — October 16, 2026

The creator work list now includes a direct Unlist/Relist action and a Share button alongside existing edit/view/delete operations. The listing request changes only products.listed; it does not resubmit work data, alter fixed coin prices, modify files/series/previews or enable play. Existing state filters and row badges update from the server snapshot. The existing list-wide pending flag disables conflicting visibility/delete mutations while the request runs. Errors remain visible beside the affected row.

POST /api/product/listing requires an authenticated creator, verifies origin/fetch-site and work ownership, rejects removed works, and accepts only a boolean listed value. A removed work cannot be restored through this endpoint. Repeated requests for the same visibility are idempotent. Unlisted works disappear from public catalog snapshots; existing purchasers retain snapshot, full play and download access. Existing cart checks reject a newly unlisted work. No extra confirmation is required for this reversible author action.

Share copies the canonical https://fanstar.dev/c/{creator}/shop/{work} link after a user click. If Clipboard API is unavailable or denied, an inline read-only URL field provides a manual copy fallback. Sharing an unlisted work includes an explicit notice that others cannot currently access it. No message is sent to another person and no native share sheet is invoked.

## Release

Base fingerprints: main 90f39c84, UI f84959a5. Released main af5b4d21, UI 6744e258.
App /api/ui/app-1c412f49.mjs, CSS /api/ui/style-17ea01a8.css.

Apply apply-work-actions-update.mjs only to the fingerprinted live modules, identified by name. work-actions-release-code.mjs defaults to dry run, checks expected main/app/CSS output and inherits current bindings, secrets, R2, Durable Objects and static assets. Preserve all private playback assets and unrelated document modules. Do not deploy the stale regular repository main build or commit private live modules.

## Verification

- 33 backend checks: creator authentication, ownership, cross-origin rejection, strict input validation, state-only update fidelity, idempotency, removed work rejection, public visibility, new cart rejection, purchaser reading/download access and relisting.
- 15 UI checks: visibility labels/actions, shared pending state, public link copying, permission-denied manual fallback, error messages and compiled integration.
- 64 series, 59 USD accounting, 124 independent preview and 28 reader control regression checks passed. Final app and main Worker syntax checks passed.
- Live creator work list showed the new controls; clicking Share for an existing work produced the copied-link success toast. The served app matched the tested file and an unauthenticated listing request returned 401.
- Native Cloudflare upload succeeded while preserving current resources. No production work was unlisted/relisted and no synthetic purchase/publication was created for verification.

Run node maintenance/work-actions-backend-check.mjs /path/to/test-enabled-worker.mjs and node maintenance/work-actions-ui-check.mjs /path/to/transformed-app.mjs.
