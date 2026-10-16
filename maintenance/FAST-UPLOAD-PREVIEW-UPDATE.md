# Parallel uploads and independent previews — October 16, 2026

Uploads now schedule at most three 8 MiB parts concurrently. Completed parts and active byte progress are aggregated across requests. Pause stops scheduling new parts while existing transfers finish; resume skips stored parts. Transient failures retry the affected part, while cancellation or permanent failure aborts every active transport and settles all workers before reporting completion. Only after all chunks succeed does the existing complete endpoint run. The progress indicator displays measured transfer speed. Multipart PUT requests pass their request body directly to the existing private R2 multipart binding instead of collecting the entire chunk in memory first. Creator authentication, same-origin checks, declared part sizes, ordered ETags and final object-size verification remain enforced. Actual throughput depends on the user's network; no numerical speedup was measured or promised.

Preview availability is independent of the full-work play permission. The editor and compiled parent preserve the preview checkbox/settings when play is disabled. The storefront requests enabled previews even if the public play format is empty. Download-only works can provide separate text, images, audio or video previews, including when the original is an unsupported archive. Supported source files can also provide progress previews. Full-work reader URLs remain denied when play is disabled, including for purchasers. Public catalog metadata omits the full play format for these works so play buttons and listings remain accurate. Private parsing metadata is retained for previews, and old attachment metadata can be inferred without modifying stored files. Authors retain access to their own source for preview analysis. Existing preview authentication, 500 MB aggregate limits, asset ownership/revocation, accounting and download permissions remain in place.

## Deployment

Apply only to the exact live modules; the repository's regular main build is stale. `fast-upload-release-code.mjs` defaults to dry run, identifies modules by name, verifies base and transformed fingerprints, and inherits current bindings, secrets, Durable Objects, R2 and static assets. Private playback modules and production user records must never be committed.

Base FNV-1a UTF-16 fingerprints: main `2574987d`, UI `9a71e294`.
Released main `90f39c84`, UI `dcc47673`; app `/api/ui/app-3547c8a0.mjs`; CSS unchanged at `/api/ui/style-f74a51b.css`.

## Validation

- 27 multipart client checks cover bounded concurrency, aggregate progress, saved-part resume, pause, retry, hard failures and cancellation.
- 124 backend checks cover independent custom/progress/media previews, unsupported original upload publication, full-reader denial for author/purchaser, asset revocation, streamed multipart bodies and existing preview/500 MB/atomicity behavior. Stream tests deliberately make request.arrayBuffer throw, verifying that PUT does not buffer the chunk.
- 11 UI checks exercise the transformed editor, independent progress controls, storefront with no full play format and the exact compiled parent retaining preview when play is toggled off.
- 64 series, 59 USD/accounting, 38 comment-policy, 46 comment/dashboard UI and 31 previous preview UI regression checks passed. Final app and Worker syntax checks passed.
- Native Cloudflare module upload succeeded with all current assets/bindings preserved. No synthetic work, purchase or preview setting was published to production during verification.

```sh
node maintenance/fast-upload-check.mjs
node maintenance/independent-preview-check.mjs /path/to/test-enabled-worker.mjs
node maintenance/independent-preview-ui-check.mjs /path/to/transformed-app.mjs
```
