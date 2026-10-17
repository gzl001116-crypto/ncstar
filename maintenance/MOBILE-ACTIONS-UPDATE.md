# Mobile header, compact cards, sharing and notification language

Production update: 2026-10-17.

Mobile navigation removes the hamburger and its duplicate function panel. The header retains search and the account avatar and exposes notification and shopping-bag icons with 44 px touch targets. Notifications no longer duplicate in the bottom dock; private messages remain there. Desktop communication links remain available.

Work cards use shorter covers, smaller body spacing and type, and cover-overlay favorite/share buttons. Creator cards also have smaller padding, avatars and bounded biographies. The cover rule explicitly overrides the component's inline aspect ratio. These changes apply at widths up to 760 px; the existing keyboard/safe-area and measured bottom-dock handling remains intact.

Device sharing now checks secure-context and supported share data before rendering the OS entry. The click invokes navigator.share synchronously, without fetching metadata or awaiting other work first. Title-plus-URL falls back to URL-only when required. Cancellation, browser policy denial, an already-open share sheet and other failures have distinct messages. The share sheet remains open with social links, the visible product URL and an explicit copy button. Browsers without the API receive a useful fallback rather than a nonworking device-share button. App availability is controlled by the device/browser; this release cannot add missing OS support. The existing channel icons and server social metadata remain intact.

Comment notification kinds now distinguish a new comment, a reply to the recipient's comment, and a reply elsewhere under the recipient's work or post. Replies continue notifying the content owner and the parent-comment author without duplicate or self notifications. The notifications API resolves the correct target link/title and returns isOwnTarget so legacy replies sent to readers no longer say that the content belongs to them. Missing targets do not claim ownership. No historical rows are rewritten.

Validation: 53 backend notification checks and 41 UI/share/header checks pass. Existing content protection (78), private attachments/metadata/notification read isolation (52), and preview-entry/inline-reply (44) checks also pass. All tests use synthetic data locally. Published app and CSS bytes match the validated output. Live browser QA confirms the header, absence of the removed menu, share fallback with all six channel icons, visible link, copy success and dialog dismissal. The QA browser does not expose device-share support or mobile viewport resizing; real OS share targets and physical-phone layout were not exercised. No external share, notification test insertion, purchase or upload was performed.

Apply only to the validated live Worker modules using applyMobileActions and mobileActionsReleaseCode. The generator checks both starting module hashes and the resulting server hash and asset paths before writing. Private playback assets and existing bindings stay inside Cloudflare.

Validated base: server 48513133, UI f980c227.
Published: server ec4baffb, UI a1f1b773.
App: /api/ui/app-ab3fe42a.mjs.
CSS: /api/ui/style-cd975ccf.css.
Document reader unchanged: /api/ui/preview-entry-reader-3ede48fe.mjs.
