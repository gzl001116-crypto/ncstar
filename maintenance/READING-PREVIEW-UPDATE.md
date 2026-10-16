# Reading and 500 MB previews — October 16, 2026

This release supersedes the preview limits and description behavior in PREVIEW-CURRENCY-UPDATE.md.

- Removes the optional preview description field and excludes saved legacy descriptions, filenames and generated page labels from preview content. Media-only sources render only their actual media. Original text is rendered as paragraphs using source line breaks.
- Custom previews accept multiple image, audio and video files through an accessible styled file picker with drag and drop. Each file and the combined registered preview payload are limited to 500,000,000 bytes. The existing resumable multipart uploader is reused, with server-side ownership, format and size checks.
- Progress previews retain synchronized percentage controls and add independent character, image and fractional-second counts, with totals and a live content preview. Moving the percentage control clears the independent overrides. Limits are saved with version 3 preview metadata; the public response retains version 2 compatibility.
- Removes the fixed 32 MB document/archive validation and rendering limits. ZIP directories are range-read, including ZIP64 offsets; selected entries are decompressed on demand. PDFs load by range and render one page at a time. Office/EPUB packages load selected chapters, slides or sheets, and document text retains paragraph boundaries. Text files use streamed decoding and pagination. Legacy binary XLS and RTF still require parsing the selected document in device memory. Supported formats/codecs, valid nonencrypted containers, browser memory and the existing 5 GB source upload ceiling still apply; this is not a claim of infinite device capacity.
- New source uploads, including text and HTML, use multipart R2 storage. Text manifests point to an authorized stream instead of a truncated SQL preview. Preview readers receive only the saved character prefix through `/api/text-preview`; they cannot access the full original source. Existing original media authorization and playback-time limits remain unchanged; audio/video progress previews are not server-transcoded clips.

## Production integrity

The main repository build predates live application features. Do not deploy the regular main build over production. Apply `apply-reading-update.mjs` only to the fingerprinted live Worker modules, selected by module name. `reading-release-code.mjs` defaults to dry run, validates the transformed main and hashed public assets, preserves private playback data and inherits existing bindings, secrets, R2, Durable Objects and static assets. Never commit private UI modules or production records.

Base FNV-1a UTF-16 fingerprints: main `3f6b4c49`, UI `1a3259e`.
Released fingerprints: main `2574987d`, UI `9a71e294`.
Public app `/api/ui/app-ec9ffd32.mjs`, stylesheet `/api/ui/style-f74a51b.css`, document helper `/api/ui/reading-54c4fda2.mjs`.

## Validation

- 88 backend checks: preview ownership, access revocation, atomic publication, expiry, exact quantity limits, Unicode text prefix streams, accepted 500 MB boundary and rejected oversized/aggregate payloads.
- 22 core checks: sparse 70 MB and 4.4 GB ZIP64 archives, bounded validation reads, selected extraction, text decoding, exact character metrics and paragraph pagination.
- 31 UI checks: removed description, independent counts, percentage reset, media-only rendering, multipart upload, styled picker and paragraphs.
- 64 series, 59 USD accounting, 38 comment policy and 46 comment/dashboard UI regression checks. The older combined October 16 backend fixture expects pre-USD CNY accounting and is superseded for finance by the USD suite; its isolated 38 comment checks pass.
- Syntax checks on final main, app and extended document modules. Actual bundled document helper extracted text and images from a ZIP fixture.
- Live app and document asset contents matched the tested files. Unauthenticated text previews return 401. The original catalog coin prices 0.15 and 0.75 remain unchanged. No synthetic work, purchase or preview setting was saved to customer data during verification.

```sh
node maintenance/reading-backend-check.mjs /path/to/test-enabled-worker.mjs
node maintenance/reading-core-check.mjs
node maintenance/reading-ui-check.mjs /path/to/transformed-app.mjs
node maintenance/series-backend-check.mjs /path/to/test-enabled-worker.mjs
node maintenance/usd-money-backend-check.mjs /path/to/test-enabled-worker.mjs
node maintenance/oct16-ui-check.mjs /path/to/transformed-app.mjs
```
