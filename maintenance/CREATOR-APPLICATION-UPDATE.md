# Simplify creator applications

2026-10-17: Remove category and location from the creator application form and its submitted payload. The form retains the page address and introduction. Update the application instructions in Simplified Chinese, Traditional Chinese, English and Japanese. Existing profile editing is unchanged.

The studio endpoint accepts an omitted category, while still rejecting unsupported nonempty categories from older clients. Newly applied creators have no category or automatically generated category tag. The existing unspecified-location placeholder remains internal. Registration defaults and already-saved creator profiles remain intact, including repeat application requests from an existing creator.

Both the maintained TypeScript sources and the live guarded-transform release are updated. Validation used a synthetic in-memory database: authentication, introduction/address validation, omitted optional fields, duplicate addresses, legacy category/location submissions and existing-profile preservation. The actual production form component was rendered with a minimal React harness and submitted with only handle and bio; navigation to /studio and the two-field payload were verified. Compiled app/server syntax checks pass. The public served application bytes and /page HTML match the release. No production account was created or converted during verification. A full TypeScript build was unavailable because workspace dependencies are not installed.

Deployment preserves the current private playback module, all other UI assets, CSS and bindings. Base: server ec4baffb, UI a1f1b773. Published: server 73c97dde, UI 3c057fb7. App /api/ui/app-388138a7.mjs; CSS remains /api/ui/style-cd975ccf.css.
