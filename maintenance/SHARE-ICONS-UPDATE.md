# Share channel icons — October 17, 2026

The product share dialog now displays recognizable colored SVG icons above Telegram, WhatsApp, X, Facebook, Weibo and Email labels. Native share and Copy link buttons receive matching monochrome action icons. Text labels remain intact for accessible names. Icons are decorative CSS backgrounds/masks encoded directly into the stylesheet and require no image/font/CDN requests.

Only a share-platform data attribute and appended styles change. Share destinations, explicit native/copy behavior, cancellations, storefront filters, pricing and backend authorization are untouched. Main fingerprint remains b787db5e. Base UI fb4479d2; released UI be431425. App /api/ui/app-133bc4ec.mjs; CSS /api/ui/style-8518b267.css.

73 existing share/storefront checks and app syntax checks passed. The live signed-in share dialog was visually checked with all six icons, labels and the Copy link icon visible. The served app matched validated bytes. No external share was submitted.

Use apply-share-icons.mjs through share-icons-release-code.mjs only against the expected live fingerprints. The release generator defaults to dry run and inherits current settings/bindings, preserving secrets, R2, Durable Objects, static assets and private playback data inside Cloudflare. Do not deploy the stale regular repository build or save private full UI modules in git.
