# Creator studio refresh — October 16, 2026

The creator studio now has separate Publish post and Published posts pages. Shared headings and repeated dashboard/work-list introductions were removed. Publishing or editing a work uses one consolidated page with work information, source/preview controls and a sticky price/publish sidebar. Local drafts, resumable uploads, independent previews, existing editing, currency conversion and fixed coin prices remain supported. The native publication-type radio row follows the supplied screenshot: series first, standalone completed work selected by default. Existing series ownership, selection and ordering APIs are unchanged.

Publishing categories are Comic, Video, Novel, Illustration and Game. Snapshot normalization maps historic categories for display without rewriting stored works. Play library filters show only Comic, Video, Novel and Illustration; audio/game formats are excluded from those library filters and rejected for newly enabled full-source play. Independent preview media can still include audio. Historic direct playback authorization and purchaser access remain intact.

Unlist now opens an explicit inline confirmation. Cancel makes no request; only Confirm unlist submits the existing authenticated visibility-only endpoint. Share opens a read-only canonical link first; Copy link is a separate explicit action. Clipboard failure selects the link for manual copying. No messages are sent to another person. Existing delete confirmation remains separate.

## Release constraints

Never deploy the stale regular repository build. Apply the guarded maintenance transform only to exact live modules. Keep R2, Durable Objects, secrets, static assets and private playback resources inside Cloudflare; do not persist private UI modules or production records in git.

Base main/UI fingerprints: `af5b4d21` / `6744e258`. Released main/UI: `b787db5e` / `1e0d3f0a`. App: `/api/ui/app-e184f4aa.mjs`. CSS: `/api/ui/style-681bdbc3.css`.

The initial release UI was `3835830a`. A follow-up style correction removed an inherited two-column span from the narrow price sidebar. `applyStudioLayoutPolish` and `studioRefreshReleaseCode({polish:true,...})` implement that fingerprint-guarded follow-up. A fresh application of the full transform uses the final CSS directly. Native multipart Worker uploads inherited current bindings and preserved assets.

## Validation

- 56 new UI checks: confirm/cancel, separate share/copy, manual fallback, server errors, native series radios, separate post pages, file/category inference, preservation of manual categories, publish payload and preview builder, download-only game setting, local drafts and four play filters.
- 34 backend checks: category normalization without stored-record mutation, reader category metadata, allowed/unsupported play formats and canonical new category display.
- 33 visibility/ownership, 64 series, 59 USD accounting, 124 independent preview and 28 reader-controls regression checks passed.
- Transformed main/app syntax passed; the served app matched tested bytes.
- Signed-in live browser verification covered the consolidated publishing page, default standalone radio, series detail expansion, five categories, final sidebar layout, explicit unlist confirmation/cancel and share-link panel. No production work was unlisted and no synthetic work, purchase or post was created.

Run the new checks with `node maintenance/studio-refresh-check.mjs /path/to/transformed-app.mjs` and `node maintenance/studio-refresh-backend-check.mjs /path/to/test-enabled-worker.mjs`.
