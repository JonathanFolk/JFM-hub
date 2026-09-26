# JFM Hub — Phase 2

Phase 1 was accepted and merged to `main` on September 25, 2026. Phase 2 adds controlled invoice drafting while preserving the hosted calendar, review and recovery safeguards.

The Review queue now sorts shoots into Real Estate, Commercial, Design or Other; Real Estate requires a square-footage band. Sorting a booked shoot creates a private invoice draft. Deleting a shoot moves it and its linked Hub records to Recently Deleted, where it can be restored. Calendar reimports do not unhide it. The Rates view stores 43 Standard and 44 Legacy 2026 CAD prices from the supplied photo and video PDFs. Invoice drafts now default to the matching Standard or Legacy sheet from uniquely matched imported customer history; general real-estate clients without a Legacy match default to Standard, while ambiguous identities require review. The owner can override pricing for a billing client, an entire invoice, or an individual line. Changing the sheet does not silently replace amounts already entered: matching sheet prices can be applied per line or in one explicit bulk action. Published contact-for-quote cases and ambiguous boundary values prompt a custom amount instead. Premium photo above 7,500 sq ft displays the owner's CAD $1,000–$1,250 expectation for Standard work as guidance, not a fixed price. Commercial drafts can show explicit quote amounts from a separately connected read-only Gmail account (`info@jonathanfolk.ca`); each suggestion must be reviewed and applied by hand. The four supplied PDFs are retained locally under ignored `data/rates-source/` for provenance.

Seven screens: Overview, searchable Jobs, Review with persistent decision notes, private Invoices, Rates, Recently Deleted, and Connections. Invoice drafts require explicit human decisions and remain internal to the Hub. A separate invoice-evidence queue now compares read-only Gmail messages with the live `2026` master Sheet: invoice number, CAD total, client and Paid checkbox. The first manual sync scans the last 30 days; later manual and hourly checks use Gmail change history. Possible sent invoices and received payments appear as suggestions with source links. Confirm or Dismiss records a Hub-only review decision; neither action updates the Sheet or a payment account. Ambiguous and amount-only matches remain explicit. Stripe is not directly connected yet.

The local September 19 import has 187 bookings, 88 review items including 13 possible missed invoices, and four ambiguous titles preserved for review. These are candidates, not proof that a shoot happened or money is owed. Snapshot ages never count as a successful live synchronization. Suggested deadlines remain provisional pending the rule/holiday review.

No AI calls, calendar writes, Sheet writes, client messages, invoice issuance or payment updates. Draft totals and invoice-evidence matching are deterministic. Financial master data stays in the original Sheet.

## Run locally

Requires Node 24.19+ and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm build
CALENDAR_EXPORT=/path/to/calendar.ics PHASE0_DIR=../phase0 pnpm import
pnpm import:reference '/path/to/jfm hub claude.zip' data/hub.sqlite
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

The separate reference import reads only six CSVs from the supplied archive (never its obsolete spec) into private SQLite tables: customers, extracted 2026 invoices, pricing evidence, backtest, Legacy-list matches and acronyms. It does not issue invoices or change calendar records. A unique exact-name customer match can choose the default sheet; conflicting or duplicate matches stay in review. Client-level pricing overrides are stored in SQLite and affect future automatic drafts, while invoices marked ready retain their selected profile. Observed Stripe/invoice/email prices stay outside the approved rate catalog pending the decisions in `PRICING_REVIEW.md`.

See SETUP.md for Google authorization and deployment, PHASE1_COMPLETION.md for the Phase 1 record, and PHASE2.md for the invoicing boundary and next increments.

## Repository privacy

Keep client evidence, exports, OAuth credentials, databases and backups outside Git. Optional private register notes are read from `data/register-notes.json` (or `REGISTER_NOTES_FILE`) during import; this file is ignored. Font binaries are not distributed; Gotham uses installed local fonts until licensed webfonts are supplied.
