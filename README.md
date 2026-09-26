# JFM Hub — Phase 2

Phase 1 was accepted and merged to `main` on September 25, 2026. Phase 2 adds controlled invoice drafting while preserving the hosted calendar, review and recovery safeguards.

Five screens: Overview, searchable Jobs, Review with persistent decision notes, private Invoices, and Connections. Invoice drafts require explicit human decisions and remain internal to the Hub.

The local September 19 import has 187 bookings, 88 review items including 13 possible missed invoices, and four ambiguous titles preserved for review. These are candidates, not proof that a shoot happened or money is owed. Snapshot ages never count as a successful live synchronization. Suggested deadlines remain provisional pending the rule/holiday review.

No AI calls, calendar writes, Sheet writes, client messages, invoice issuance or payment updates. Draft totals are calculated deterministically from manually entered integer-cent prices and explicit tax treatment. Financial master data stays in the original Sheet.

## Run locally

Requires Node 24.19+ and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm build
CALENDAR_EXPORT=/path/to/calendar.ics PHASE0_DIR=../phase0 pnpm import
APP_MODE=local pnpm start
```

Local mode binds to 127.0.0.1 and deliberately has no sign-in. Never tunnel or expose local mode. It is available only while the process and Mac are running. The active preview in this task uses port 4312; a normal start defaults to 4310.

On this Mac, Node is bundled at `/Users/jonathanfolk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. If package-manager script execution is unavailable, use that executable with `node_modules/typescript/bin/tsc --noEmit`, `node_modules/vite/bin/vite.js build`, or `--import tsx server/index.ts` from this directory.

## Verify

```sh
pnpm verify
```

Tests use synthetic clients and temporary databases. The HTTP test needs permission to open a loopback port. Real export repeat-import checks are performed separately. See VERIFICATION.md for results and limitations.

On a configured production host, `pnpm readiness` performs non-secret checks for the build, runtime database, seven-calendar allowlist, recent calendar successes, recent backup and independent backup target. It does not replace the human acceptance checks in `PHASE1_COMPLETION.md`.

## Data and recovery

SQLite stores jobs keyed by source/event identity, previous versions, review decisions, sync metadata, audit actions, encrypted OAuth tokens, short-lived OAuth attempts and hashed sessions. The API excludes sync cursors and tokens. Imports commit atomically. Deletions remain reviewable; missing entries are not silently erased. The scheduler uses hourly deterministic API reads plus a daily full reconciliation, and independently creates daily SQLite recovery copies.

`data/`, `backups/`, `.env` and build output are ignored by source control. These are private local records; do not publish them. Thirty daily and twelve monthly verified copies are retained. `SECONDARY_BACKUP_DIR` can point at a separately administered Canadian recovery mount; configuring the mount, independent outage monitoring and provider recovery drills remain deployment gates.

See SETUP.md for Google authorization and deployment, PHASE1_COMPLETION.md for the Phase 1 record, and PHASE2.md for the invoicing boundary and next increments.

## Repository privacy

Keep client evidence, exports, OAuth credentials, databases and backups outside Git. Optional private register notes are read from `data/register-notes.json` (or `REGISTER_NOTES_FILE`) during import; this file is ignored. Font binaries are not distributed; Gotham uses installed local fonts until licensed webfonts are supplied.
