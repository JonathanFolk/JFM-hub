# JFM Hub handover

Last updated: September 25, 2026
Repository: <https://github.com/JonathanFolk/JFM-hub>  
Current milestone: Phase 1 hosted shadow verification; final acceptance is pending.

## Purpose

JFM Hub is Jonathan Folk Media's private operations workspace. Phase 1 provides a read-only view of bookings, review items, connection health and provisional deadlines. It is designed to help Jonathan review evidence before taking financial action.

The application must not send invoices, charge clients, mark payments, edit calendars or write to the master invoicing Sheet in this phase. Hourly calendar synchronization is deterministic and makes no AI calls.

## Current state

- The React/TypeScript frontend and Node/Express server run locally and at `https://hub.jonathanfolk.ca`.
- The application has Overview, Jobs, Review and Connections screens.
- Local snapshot import, review-note persistence, calendar parsing, sync-state isolation, encrypted OAuth-token storage and SQLite backups are implemented.
- Twenty-two automated tests, TypeScript checking, the production build and the dependency audit passed at the last verification.
- Production Google sign-in is active and the application reports successful reads from all seven approved calendars.
- The latest UI uses locally installed Gotham faces when available, with system-font fallbacks. Gotham font binaries are not committed or distributed.
- Desktop, tablet and phone-width browser inspection passed with no horizontal overflow or application console errors on synthetic data; Jonathan's final visual acceptance and real-device accessibility checks remain.
- The active OVHcloud VPS is VPS-1 2027 with 2 vCores, 4 GB RAM, 40 GB storage and Ubuntu 24.04 in Beauharnois, Canada. DNS, Caddy HTTPS and the application are live. Provider-boundary, independent-backup and recovery evidence remain incomplete.

## Privacy and operating boundaries

Jonathan requires client data to remain in Canada. Before production use, verify the actual VPS location, backup location, logs, support access and relevant subprocessors against that requirement.

Never commit or publish:

- `.env` files or OAuth secrets;
- databases, WAL/SHM files or backups;
- calendar exports or private calendar identifiers;
- client evidence, invoice/payment exports or private audit notes;
- licensed font binaries.

The repository `.gitignore` excludes these classes of files. Private runtime data belongs under `/var/lib/jfm-hub`; production secrets belong in `/etc/jfm-hub.env` with restricted permissions.

## Architecture

| Area | Choice |
|---|---|
| Frontend | React 19, TypeScript and Vite |
| Server | Node 24 and Express 5 |
| Database | SQLite with WAL mode |
| Authentication | Google OpenID Connect for the approved business account |
| Calendar access | Separate Google OAuth authorization using read-only Calendar scope |
| Hosting target | OVHcloud VPS in Beauharnois, Canada |
| Public address | `https://hub.jonathanfolk.ca` |
| Reverse proxy/TLS | Caddy, with request access logs disabled |
| Process management | systemd |

Important directories:

- `src/`: frontend application and styling;
- `server/`: API, authentication, parsing, synchronization and SQLite store;
- `tests/`: synthetic automated tests;
- `scripts/`: private-data import and backup operations;
- `deploy/`: example Caddy and systemd configuration;
- `data/` and `backups/`: private, ignored runtime material.

## Local setup

Use Node 24.19 or newer and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
APP_MODE=local pnpm start
```

Local mode binds only to `127.0.0.1` and intentionally bypasses sign-in. Do not expose or tunnel local mode.

To import a private reference snapshot, set `CALENDAR_EXPORT` and `PHASE0_DIR` outside the repository before running `pnpm import`. Optional invoice-register audit notes are read from the ignored `data/register-notes.json` or `REGISTER_NOTES_FILE`.

## Google configuration and remaining acceptance

The production OAuth client and calendar connection are operating. Preserve the following configuration if the client is recreated or local OAuth testing is added:

1. Enable the Google Calendar API.
2. Configure the Google Auth Platform for an external audience because the booking account is a personal Gmail account.
3. Add the business account and booking account as test users during setup.
4. Create a Web application OAuth client.
5. Add the local redirect `http://127.0.0.1:4312/auth/callback` for testing.
6. Add `https://hub.jonathanfolk.ca/auth/callback` only after production HTTPS works.
7. Store the client ID, secret and a separately generated 32-byte token-encryption key in the private environment file.

The Codex/ChatGPT Google connection cannot be reused by the hosted application. Production sign-in and calendar reads are visibly working; wrong-account rejection, revoked-token reconnect behavior and unattended refresh over a longer shadow period remain acceptance tests.

## Approved calendar behavior

Only the seven calendars explicitly approved by Jonathan may be monitored. The private `data/calendars.json` contains their identifiers and must be transferred separately to the server; it must never be reconstructed from every calendar visible to the Google account.

- Jonathan's primary booking calendar supplies Jonathan's jobs.
- Contractor calendars are George, Richard, 3D Elevate, Allan, John Nie and Wilson.
- Contractor bookings qualify only when the title identifies the contractor and contains `For J`.
- Entries without a sufficiently clear client or service remain review items.
- Cancellations and changes remain auditable; they are not silently deleted.
- Each calendar maintains an independent cursor and last-success state, so one failure does not advance another calendar's state.

## Business rules already confirmed

- `PP` is premium real-estate service naming; it does not mean ALP pricing.
- Pricing families include basic real estate, premium real estate, developer, interior-design and commercial/custom work.
- Commercial work has no automatic legacy rate. Any exception is explicitly assigned per client.
- Developer minimums are $750 per photographed staged unit and $350 per photographed vacant unit, with no volume discount.
- Interior-design work commonly falls between $750 and $1,250, but this is guidance for review rather than an automatic formula.
- Neighborhood work in the confirmed 15–60 minute window is $100 per requested service; photo plus video is two units. Boundary cases require review.
- `EP` means basic/essential photo, `EV` basic/essential video, `3DFP` 3D floor plans and `PPE` a safety-equipment reminder with no fee.
- `Ext` means exterior-only and does not imply drone or twilight. `Weather` is a scheduling note and creates no fee.
- Ask for approximate square footage during invoice drafting.
- Default payment terms are net 30 days.
- Do not automatically infer tax treatment for USD/US clients; tax research remains deferred.
- Payments may cover multiple invoices or use a different account-holder name. Matching requires manual review.
- The Google Sheet remains the financial master. Issued invoices must remain frozen.

## Deployment sequence

1. Wait for OVHcloud provisioning and verify the VPS is in Beauharnois/Canada, uses Ubuntu 24.04 and has the expected public IPv4.
2. Verify the provider and backup arrangements meet the Canada-only requirement.
3. Harden the server, create an unprivileged `jfm` user and install Node 24 and Caddy.
4. Deploy the repository to `/opt/jfm-hub`, install locked dependencies and build the frontend.
5. Place runtime data in `/var/lib/jfm-hub` and secrets in `/etc/jfm-hub.env`.
6. Install and start the prepared systemd service with the application port private.
7. In Namecheap, add one `A` record with host `hub`, value equal to the verified OVH IPv4 and TTL set to Automatic. Preserve all existing website and Google Workspace records.
8. Verify HTTPS at `hub.jonathanfolk.ca`, then add the production Google redirect URI.
9. Complete application OAuth and validate the seven approved calendars against known bookings.
10. Configure and test a second recovery copy that also stays in Canada, plus independent outage monitoring.

## Production acceptance checklist

- Signed-out requests cannot read Hub data.
- Only the approved business account can sign in.
- Calendar authorization uses the approved booking account and read-only scope.
- All seven calendars complete an initial full sync and show independent freshness timestamps.
- Hourly incremental sync and daily reconciliation run without AI calls.
- A failed sync preserves the previous successful data and timestamp.
- Moved, cancelled and recurring bookings reconcile correctly.
- Provider and off-machine backup restores are demonstrated.
- DNS, TLS, restart behavior and outage alerts are verified.
- Mobile, tablet, Safari, 200% zoom and assistive-technology checks are completed.
- Jonathan reviews the hosted interface before it is treated as operational.

## Immediate next actions

1. Review and resolve the live queue's ambiguous booking classifications before treating it as operational.
2. Configure and restore-test the independently administered Canadian backup target.
3. Verify provider/support/subprocessor boundaries and configure independent outage monitoring.
4. Complete wrong-account, revoked-token, nightly reconciliation, real Safari/device, 200% zoom and screen-reader acceptance checks.
5. Deploy the reviewed Phase 1 completion branch and run `pnpm readiness` on the host.

See `SETUP.md` for detailed connection/deployment notes and `VERIFICATION.md` for the latest test evidence and known limitations.
