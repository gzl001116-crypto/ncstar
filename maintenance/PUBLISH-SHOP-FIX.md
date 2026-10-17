# Publish series helper, shop controls and comment year · 2026-10-17

The live app called `fanstarSeriesForm` when publishing or editing multipart works, but its declaration was absent. Restore that helper in the shipped module, preserving standalone, existing-series and new-series field semantics. The JSON publishing path is unchanged. No production works are created for testing.

Creator shop category, sort and search now share a single vertical column. Category and sort apply immediately; submitting search keeps both choices. Search name/tag scope and matching controls appear after a query and no longer duplicate category/sort. Clear filters resets the shop controls together. The global marketplace retains its existing filters.

Visible comment timestamps now include a four-digit year, month, day, hour and minute; they remain on the author's row.

`publish-shop-fix-check.mjs <app.mjs>` runs 97 checks against the actual store publish/edit methods, both readable and compiled, plus combined category/sort/search, clearing and timestamp configuration. Upload, fetch and state actions are stubbed for tests. Syntax-check the served bundle before deployment.

Prepare with `apply-publish-shop-fix.mjs <previous-app.mjs> <previous-css.css> <output-dir>`. Use `locale-release-code.mjs` with explicit live fingerprints and paths. Source fingerprints before this patch: index `71ed4664`, UI `1937c79f`, editable app `b1aaa52b`; old app `/api/ui/app-78961bac.mjs`, CSS `/api/ui/style-ab2ce807.css`. Keep the existing Worker backend, private playback modules, bindings and assets intact.
