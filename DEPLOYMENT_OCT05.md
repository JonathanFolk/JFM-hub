# Hub quality-of-life release — October 5, 2026

## October 6 bulk actions

- Deployed code release **`e868a27`** to https://hub.jonathanfolk.ca and pushed it to `origin/codex/phase2-invoicing`. Review and Invoices now support selecting visible items, moving selected shoots to Complete after a unique live 2026 master Sheet match, and recoverable bulk deletion. An unmatched completion batch changes nothing; the Sheet remains read-only.
- The isolated release passed TypeScript, 92 tests and a production build locally, then `pnpm verify` on staged Linux code with no known dependency vulnerabilities. Rehearsal on a private production database copy preserved all record counts.
- Stopped the service for an integrity-checked final backup at `/var/lib/jfm-hub/backups/deploy-e868a27/before.sqlite`. The preceding full application directory is `/opt/jfm-hub-before-e868a27` (`639395b`). The existing rollback procedure below applies.
- Post-deployment HTTPS health passed, signed-out dashboard access remained HTTP 401, and production mode and authentication remained enabled. Public JS/CSS hashes match the verified build. The service is active with zero restarts; database integrity passes and jobs (273), reviews (158), drafts (11), completions (107), and deleted records (30) are unchanged. The master Sheet connection exists, but no authenticated bulk action was performed against live records during deployment.

Jonathan authorized deployment of the reviewed local update on October 5.

## Latest: responsive layout repair

- Deployed **`639395b`** to https://hub.jonathanfolk.ca on October 5, 2026; source pushed to `origin/codex/phase2-invoicing`.
- Local and staged Linux `pnpm verify` passed: 89 tests, TypeScript, production build and dependency audit. Eight browser regression widths passed before release.
- Frontend-only release: copied content-hashed assets first, then atomically switched `dist/index.html`. Retained prior assets for open clients. No service restart (PID 100362), migrations or data imports.
- HTTPS health passed, signed-out dashboard remained 401, and live JS/CSS hashes matched the verified local build. Authenticated browser verification of Katie Burkard's April 25 row confirmed readable content, evidence below the content and no page overflow.
- Before/after hashes matched for all jobs (273), reviews (158), drafts (11), invoice history (1), completions (107), deleted records (30), rates (98) and classifications (11).
- UI rollback: restore the index from `/opt/jfm-hub-dist-before-639395b` with an atomic file replacement; old assets remain available. Previous server source was `df645fb`. **Do not restore a database backup for this UI-only rollback.**
- Existing Google Calendar connection warnings remain separate from this layout fix.

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

## Follow-up UI release

- Jonathan subsequently authorized deployment of **`13d2b46`**: Sort this shoot and the recoverable trash button now appear together directly below the project name. Optional notes remain below booking details. Redundant source/pricing text and the sorting helper sentence are removed; unique review warnings remain visible.
- `pnpm verify` passed locally and on the staged Linux release: 72 tests, TypeScript, production build and clean dependency audit. The layout was visually checked in the isolated preview before deployment.
- Backup: `/var/lib/jfm-hub/backups/deploy-13d2b46/before.sqlite`. Previous complete release: `/opt/jfm-hub-before-ui-13d2b46` (`7a9acd1`). The existing rollback procedure above applies with these paths.
- Post-deployment HTTPS health, production mode, signed-out dashboard protection and byte-for-byte JS/CSS asset checks passed. Database integrity passed; all 273 bookings, 158 reviews, 11 drafts, invoice history, 98 rates, classifications, trash and completion records were unchanged by the deployment.
- This release contains no server logic or database migration changes. It does not migrate preview completions or change the previously documented Google connection/secondary-backup limitations.

## Appointment dates and legacy cancellation cleanup

- Jonathan authorized deployment of **`38601e9`**. Added stacked appointment-date badges with Gotham Book numbers, address subtext in booking dialogs, and the one-time legacy cancellation cleanup.
- Local and staged Linux `pnpm verify` passed: 80 tests, type checks, production build and dependency audit. No preview database or private completion evidence was shipped.
- Rehearsed the migration on a private copy of the current production database before switching. Stopped the service for the final integrity-checked backup at `/var/lib/jfm-hub/backups/deploy-38601e9/before.sqlite`. Previous complete release: `/opt/jfm-hub-before-38601e9` (`13d2b46`). Use the rollback procedure above with these paths.
- **30 previously cancelled live bookings**, including Ffirth on September 19, moved to recoverable Recently Deleted. Verified that booking payloads, invoice drafts, invoice history, completion records, rates, classifications and pre-existing settings were unchanged. Existing review records remain stored but are hidden from active views for trashed jobs.
- Live service is active with zero restarts. HTTPS health, production/preview-disabled mode, signed-out dashboard protection, database integrity and byte-for-byte deployed JS/CSS checks passed. No fresh authenticated browser acceptance or Google reconnection was performed.
- Calendar authorization still needs reconnection for future synchronization. This release does not fix the prior Sheet connection issue or configure an independent secondary backup.

## Gmail rate-limit fix

- Jonathan authorized deployment of **`df645fb`** after a read-only diagnostic reproduced Gmail `403 rateLimitExceeded` during message reads. Authentication and small test reads succeeded; the full scan exceeded Google's per-user query-cost quota.
- Replaced ten-message concurrent bursts with paced serial reads, bounded retry delays and specific safe error messages. Each request processes up to 20 messages. The browser continues automatically with progress text; private checkpoints let a paused or restarted scan resume without advancing the Gmail history cursor prematurely. Pending work can resume through the scheduler.
- Local and staged Linux `pnpm verify` passed: **86 tests**, type checks, production build and dependency audit. A private production-copy rehearsal processed 20 emails, reopened the database, and resumed through 40 emails while preserving booking and financial records. The rehearsal database was not promoted into production.
- Final pre-deployment backup: `/var/lib/jfm-hub/backups/deploy-df645fb/before.sqlite`. Previous full release: `/opt/jfm-hub-before-df645fb` (`38601e9`). Use the existing rollback procedure with these paths; preserve any new email suggestions/checkpoints before a data rollback.
- Post-switch database integrity, booking/financial records, connection material, HTTPS health, production mode, signed-out dashboard protection and deployed asset checks passed. Service active with zero restarts.
- **Authenticated live acceptance passed:** used the website's **Sync invoices & payments** button; all **202 messages** were checked, **41 new evidence suggestions** were added, and **108 suggestions** now await review. The website shows **Last sync: Just now**. Verified a successful sync timestamp, no error, a saved Gmail history cursor and no unfinished checkpoint. Booking, invoice and completion records were unchanged; Gmail and Sheet access remained read-only.
