# Inbox deletion, preview-link protection and client-code protection

Production update: 2026-10-17.

Notifications support individual deletion, delete-all and undo. Conversations support deleting only the current user's visible history, including attachment access, and undo. Another participant's records remain intact. New messages reintroduce a deleted conversation without restoring old hidden messages. User-scoped hide tables retain the underlying records and tag each deletion with an undo batch. Unread totals and conversation pagination exclude hidden rows. The UI confirms conversation deletion and bulk-notification deletion; request generations prevent stale polls from restoring deleted content. No actual user messages or notifications were deleted during verification.

An access review found no public R2 domain: r2.dev is disabled and no custom domains are configured. Existing original-file authorization and preview limits remain in force. The audited sample returns 30% of its declared image count, rather than the complete work. This does not establish the source of the user's reported copying: authorized readers can still capture content they can see.

Preview asset and bounded text-stream links now use HMAC-SHA-256 signatures, a two-hour expiry and a browser-specific random cookie. The preview cookie is HttpOnly, Secure and SameSite=Strict, and works across fanstar.dev and play.fanstar.dev. The existing COIN_SSO_SECRET stays inside the Worker; a distinct preview-key context is used and its value is never exported. No binding or credential was changed. A copied URL fails in another browser without the cookie. Modified IDs, signatures, expired timestamps and cross-site fetch metadata are rejected before storage reads or Range handling. Private author drafts retain owner access. Published asset membership, listed/removed/preview-enabled state and original-file permissions are still checked. Public previews remain available without login and do not write reading history or library state. Signed responses remain no-store, noarchive and vary on Cookie.

A tiled visible preview watermark shows creator attribution and a pseudonymous per-browser marker. It is a display-layer watermark, not an irreversible modification of file bytes. Signatures reduce durable URL sharing and hotlinking; they cannot stop a viewer from copying pixels/text already delivered to the browser. This release does not claim DRM or an absolute prevention of copying, screenshots, recording or redistribution.

The main client and document helper are compacted and lexical bindings are renamed through Babel. Export names, runtime properties and license notices are preserved. No eval/decrypt wrapper or client-side secret is introduced. Browser-delivered code remains inspectable; this is obfuscation, not secret encryption. Legacy app bundles and unused custom reader versions are removed from the public UI asset map. Old /assets/*.js entries return 410; .map, /src, /worker, /maintenance and /.git routes return 404. The current document helper has a new content-hash URL.

Maintenance: UI_ASSETS[currentApp].body is the protected served code; UI_ASSETS[currentApp].source is the editable readable code and must never be returned by uiAssetResponse. Future guarded transforms should use asset.source || asset.body and compile again. The current reader asset likewise retains an internal source field. No private playback content, complete live UI module or production secrets are included in this repository. inboxSecurityReleaseCode decompresses only the validated public compiled app/reader inside the Cloudflare tool and keeps all private module assets and bindings native.

Validation: 63 direct security/deletion checks; 12 UI assertions in each of readable and protected forms; document exports and syntax match. Existing original-file/comment-policy (78), independent-preview (124), attachment/metadata (52), preview-entry (44) and share/reader (36) regressions pass. Older endpoint fixtures use inbox-security-legacy-client.mjs solely as a signing-aware client adapter; the direct security suite never uses that adapter. Set FANSTAR_TEST_WORKER to the test-enabled Worker module when using the adapter. This is not a production bypass.

Live anonymous HTTP verifies preview issuance, signed Range success (206), denial without the browser cookie (403), no-store/noarchive headers, and blocked old source routes. Served app/CSS match validated bytes. Browser QA verifies the obfuscated app boots, notification deletion controls exist, visible preview watermark and four initially loaded images, and no preview library-save control. Deletion/undo itself was exercised only on synthetic data. No production conversation or notice was deleted; no external sharing or purchase was performed.

Base: server d010c07d, UI 4daa0048.
Published: server e00f0571, UI a3c68099.
App /api/ui/app-8abf0221.mjs.
CSS /api/ui/style-7454ab7a.css.
Reader /api/ui/reader-24649748.mjs.
