# Hub quality-of-life release — October 5, 2026

Jonathan authorized deployment of the reviewed local update on October 5.

## Release scope

- Centered, spacious dialogs; invoice draft autosave and 5% GST default with an off toggle.
- Updated palette, status ribbons, address subtitles, Confirmed wording, and trash controls.
- RE packages, Commercial rate choices, grouped rate variants, and Add rate.
- Submit / Submit + Invoice, Catalogued notification with Undo, bounded calendar sync, and protected cancellation handling.
- Complete view and evidence links. **The preview's reconciled completion records are not a production data migration.** No preview database, credentials, invoice edits, or private evidence snapshots are shipped.
- Patched the build dependency `source-map-js` from 1.2.1 to 1.2.2 after the October 5 dependency audit reported [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The September preview history and unresolved pricing decisions remain documented in [LOCAL_UPDATE_SEP27.md](LOCAL_UPDATE_SEP27.md) and [NEXT_UPDATE_REVIEW.md](NEXT_UPDATE_REVIEW.md). These are historical preview records, not claims about current production counts.

## Preflight

- Production currently runs `6b47df2` in `/opt/jfm-hub`, with live data under `/var/lib/jfm-hub/data` and secrets in `/etc/jfm-hub.env`.
- Local `pnpm verify`: TypeScript, all 69 tests, production build, and dependency audit pass after the patch.
- Deploy from a committed release, install the frozen lockfile, and build/test the staged server release before switching.
- Take an integrity-checked SQLite backup and retain the preceding complete code directory before switching. Keep the live database in place; only the update's normal schema/workflow migrations run.
- Verify HTTPS health, production authentication, new static assets, database integrity and retained records after restart.

## Existing limitations

- Independent secondary backup infrastructure is not configured; the on-server rollback backup is not a replacement for it.
- Fresh calendar/Sheet connection health must be checked on the server; a successful application deployment alone does not establish Google access.
- Exact RE boundaries and Interior Design L allowance questions remain guarded for review, not silently decided.
- No invoice delivery, payment processing, Google Calendar edits, or spreadsheet writes are part of this deployment.

## Rollback

Stop `jfm-hub`, preserve the post-deployment database and its WAL/SHM before any restore, switch back to the retained code directory, and restore the matching pre-deployment SQLite backup into a clean data location if a data rollback is required. Never mix old database files with newer WAL/SHM files or overwrite the sole recovery copy. Restart and verify health, authentication and record counts before resuming use.

## Deployment result

- **Deployed:** `7a9acd1` at https://hub.jonathanfolk.ca, October 5 local time. Source pushed to `origin/codex/phase2-invoicing`.
- The staged Linux release passed frozen-lockfile installation and the complete `pnpm verify` suite (69 tests, type checks, build and a clean dependency audit).
- Rehearsed startup migrations on a private server-side SQLite copy before switching. The final live database backup is `/var/lib/jfm-hub/backups/deploy-7a9acd1/before.sqlite`; matching private configuration copies are beside it. The preceding full application directory remains `/opt/jfm-hub-before-20261005-6b47df2`.
- The service is active with zero restarts. Public HTTPS `/healthz` passes; signed-out dashboard requests return 401; session metadata confirms production mode and preview disabled. Both deployed JS/CSS assets match the locally verified build byte-for-byte. Security headers are present.
- Live database integrity passes. All 273 original bookings, existing reviews, rate IDs, original invoice line items and Google connection material were preserved. Approved startup rules added 9 drafts (1 → 10), 11 rate variants (87 → 98), and 10 review records (147 → 157). No jobs were trashed during migration.
- Production has **0 Complete records**: the isolated preview's 93 reconciled entries were not migrated. Porting those requires a separate, evidence-aware reconciliation against current live records; a database replacement is not appropriate.
- Readiness is **8/10**. Outstanding gates are the previously unconfigured independent backup and calendar synchronization. Several calendars already reported expired authorization before this release (last successes October 2); reconnect Calendar in Connections. The newly requested source has not yet been verified through a successful sync.
- The master Sheet's last reconciliation attempt remains the September 27 read-access failure, with no successful reconciliation recorded. This release improves error diagnosis but does not claim to fix that Google connection or sharing. No fresh authenticated browser acceptance or Google reconnection was performed during deployment.
