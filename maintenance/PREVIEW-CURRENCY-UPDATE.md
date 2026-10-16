# Automatic currency and rich previews — October 16, 2026

The global display-currency toolbar and its USD/fixed-coin caption are removed. The client prioritizes explicit browser locale regions, then recognized device timezones and language defaults, with Cloudflare IP country as a fallback. A VPN IP does not override a recognized browser region or timezone. Browser configuration can still differ from a person's physical country; the implementation does not claim to discover a hidden location behind every VPN. No precise location permission or third-party geolocation service is used.

The FX source remains ExchangeRate-API. Supported regional currencies are loaded from available upstream quotes; production verification returned 138 rates. The work editor accepts an amount in a selected fiat currency and displays the corresponding coin amount beside it. The server converts with its current quote, rejects a changed rounded coin quote, and always stores product prices in USD/fixed coins. Existing prices stay fixed when a creator merely edits other fields. Original 0.15/0.75 coin catalog prices were verified unchanged after release.

## Preview behavior

- Custom content supports text and multiple independently uploaded images, videos or audio files, with a shared description and live preview. Each media file is at most 20 MB; a work can reference at most 100 preview files.
- Progress uses a synchronized slider and numeric input from 1% to 100%, with one decimal place. The editor shows selected/total characters and images, media time where applicable, a description, and the actual generated preview.
- Text and HTML reading views generate plain text excerpts. Images and archives select whole image pages, rounding up. Office/EPUB/RTF and spreadsheet previews reuse the existing safe document reader; PDFs render selected pages to JPEGs. A progress preview can generate at most 100 image pages. Larger selections show an explicit error and offer custom content as an alternative. The existing reader's document/parser size limits still apply.
- Audio/video percentage previews derive the playback limit in seconds from the source duration and use the existing media player. This retains the existing inline-media authorization model; it is a playback limit, not a server-transcoded clip or DRM system.
- Existing legacy previews remain readable. When editing a legacy character/page/second limit, the UI computes the equivalent percentage once rather than silently replacing it with the default percentage. Selecting a progress mode before choosing a file is a normal empty state.

## Persistence and access

`work_preview_specs` stores versioned preview metadata; `work_preview_assets` associates registered R2 upload tokens with their owner and, after publication, a product. Uploading uses the existing resumable `/api/uploads` path. `/api/preview-register` checks creator authentication, origin, ownership, expiry, size, MIME type and media container signature before claiming an upload. SVG/HTML previews cannot be registered as images.

The existing publication transaction now includes preview attachment, work changes, staged work upload attachment and collection assignment. Failed publication leaves preview assets pending for retry; it never partially publishes a work. Reusing another author's asset or an asset attached to another work is rejected. Pending media expires after 24 hours and is deleted through the existing Durable Object cleanup alarm; publication and preview registration schedule cleanup. Detached media also expires after 24 hours. A legacy client explicitly changing preview settings downgrades to legacy behavior and detaches old rich-preview assets.

`/api/preview-asset` requires authentication. Pending files are visible only to their uploader. Other readers can access attached preview files only while the corresponding work is listed, not removed, and has previews enabled, and only when its active preview spec references that file. `/api/preview-editor` exposes source metadata/content only to the work's author. Public catalog snapshots omit private preview specs; product previews expose only the selected text/pages and registered preview media. Existing purchase/download checks remain in place.

## Deployment and verification

The repository's main build predates the live uploader and playback assets. **Do not deploy a regular main build over production.** Apply `applyPreviewUpdate` to the exact live modules, identified by module name. Preserve private playback data and every unrelated asset. The generated Cloudflare release body checks both base fingerprints and locally verified transformed main/app/CSS paths before a native upload that inherits current bindings, secrets, R2, Durable Objects and static assets. Dry run is the default. `uiOnly` supports guarded UI follow-ups without modifying backend or CSS.

Base UTF-16 FNV-1a fingerprints: main `bd4e13e6`, UI module `38fc3250`. Initial rich-preview release: main `3f6b4c49`, UI `2730131f`. Final release after UI empty-state and legacy-limit checks: main `3f6b4c49`, UI `1a3259e`; app `/api/ui/app-c8ffbcc7.mjs`, CSS `/api/ui/style-8743390b.css`, document helper `/api/ui/doc-preview-3e6bd8cf.mjs`.

Validation completed:

- 61 backend checks for fiat pricing, percentage conversion, media registration/ownership, publication, range reads, access revocation, atomic rollback and expiry cleanup.
- 46 UI checks for automatic currency, fiat inputs, quote changes, percentage controls, actual excerpts, custom media save payloads, legacy conversion and the exact compiled editor.
- 64 collection checks, 59 USD/accounting checks, 38 comment-policy checks and 46 comment/dashboard UI checks.
- Syntax checks on transformed main, app and document modules; archive extraction fixture verified text and image counts using the actual extended document module.
- Live HTTP checks confirmed locale priority, 138 FX rates, exact public app contents, unchanged catalog coin amounts, omitted private preview specs and unauthenticated asset rejection.
- Signed-in browser checks confirmed the removed toolbar, JPY input converting immediately to coins, custom description/text rendering, and slider/number synchronization changing an existing work's actual preview and character counts. No synthetic work, preview setting or purchase was published to customer data.

Run the maintained checks against a locally reconstructed, test-enabled live Worker and public UI fixtures:

```sh
node maintenance/preview-backend-check.mjs /path/to/test-index.mjs
node maintenance/preview-ui-check.mjs /path/to/transformed-app.mjs
node maintenance/series-backend-check.mjs /path/to/test-index.mjs
node maintenance/usd-money-backend-check.mjs /path/to/test-index.mjs
node maintenance/oct16-ui-check.mjs /path/to/transformed-app.mjs
```

Worker reference retrieved during implementation: Cloudflare Request `cf` country metadata and R2 Workers binding API. The existing document parser and playback container validator were reused rather than replaced.
