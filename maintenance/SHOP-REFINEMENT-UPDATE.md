# Creator storefront and share refinement — October 17, 2026

Product-card and product-detail Share now opens a native modal dialog with explicit destinations: system sharing when available, Telegram, WhatsApp, X, Facebook, Weibo, email and Copy link. Opening the menu never invokes an external destination or copies data automatically. System sharing is invoked synchronously from its separate user action; cancellation is silent, other errors keep the website/copy fallback available. Clipboard denial allows manual copying. Canonical product URLs and titles are the only shared content; private media URLs, session information and work files are excluded. Social links open their own compose/chooser flow; the application does not automatically send a message or publish a post.

The modal uses the browser top layer to avoid clipping inside work cards, supports native Escape/cancel and a close button, and returns focus to the triggering share button. Available native share targets depend on browser/device capabilities. The workbench's existing two-step link share behavior remains separate and unchanged.

Creator storefront work tabs have a local submitted search, five product categories and sorting. Only that creator's listed works are included. The URL uses shopQ/shopCat/shopSort/shopFields/shopMatch so local filters cannot overwrite global search settings. Search matching controls appear only after a nonempty query is submitted; category and sort remain visible before search. Clearing filters removes the local query and filter settings. Posts and series tabs remain separate.

The global header search now contains only Products and Authors. Legacy kind=posts normalizes to Products and cannot expose a post-search mode. The work catalog has no author/post result tabs. Explicit Author searches through the header still render author results. The creator directory's duplicate local search input is removed, while the shared header remains available. Own-account/studio links now read My shop (我的商城); generic links to other creators' storefronts remain descriptive.

## Release and validation

Base main/UI fingerprints: b787db5e / 627d7374. Released main/UI: b787db5e / fb4479d2. Main Worker bytes remain unchanged. App /api/ui/app-75b01aed.mjs; CSS /api/ui/style-43f47d21.css.

73 new checks cover destination URL encoding, explicit share/copy activation, cancellation/error fallbacks, dialog lifecycle and focus restoration, storefront ownership/listing filters, submitted query state, category filtering, query-only matching controls, removed post search and own-shop labels. 56 studio and 28 reader-control regression checks passed. Transformed app/main syntax checks passed. The served app and stylesheet matched their validated output.

Live signed-in verification covered the default catalog without matching controls or author/post tabs, keyword search revealing those controls, the six website/email share destinations and manual/native capability guidance, modal close/focus, creator-store category filtering, local Enter and button search submission, updated My shop account label and the directory without a duplicate search input. No production work, purchase or post was created/changed, and no external share was sent.

Apply only to the fingerprinted live modules through apply-shop-refinement.mjs and shop-refinement-release-code.mjs (dry run by default). Preserve inherited secrets, R2, Durable Objects, static assets and private playback resources inside Cloudflare. Do not deploy the stale regular repository build or commit private live modules. Run node maintenance/shop-refinement-check.mjs /path/to/transformed-app.mjs.

Implementation references: Web Share API https://www.w3.org/TR/web-share/ ; Telegram custom share buttons https://core.telegram.org/widgets/share ; WhatsApp click-to-chat https://faq.whatsapp.com/5913398998672934 ; Facebook Share Button https://developers.facebook.com/plugins/share-button .
