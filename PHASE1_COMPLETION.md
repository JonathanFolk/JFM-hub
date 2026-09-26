# Phase 1 completion record

This is the authoritative exit checklist for the read-only JFM Hub. Phase 2 must not begin until every required item below has evidence and Jonathan accepts the hosted Phase 1 workflow.

## Completed in the repository

- [x] Read-only React/TypeScript interface for Overview, Jobs, Review and Connections.
- [x] SQLite persistence, history, review decisions, audit records and authenticated encryption for OAuth refresh tokens.
- [x] Explicit calendar allowlist, independent cursors, failure isolation, hourly checks and daily full reconciliation.
- [x] Google sign-in/account restrictions, PKCE, state, nonce, browser binding and read-only Calendar scope.
- [x] Local-mode loopback restriction and production fail-closed configuration validation.
- [x] Synthetic tests for parsing, recurrence, cancellation, rollback, authentication boundaries, HTTP controls and restore integrity.
- [x] Thirty daily and twelve monthly integrity-checked backup files, with an optional independent backup target.
- [x] Hardened example systemd and Caddy configurations.
- [x] `pnpm verify` for repository verification and `pnpm readiness` for non-secret production checks.

## Deployment evidence required

- [x] Record the actual OVH plan, Beauharnois/Canadian region, Ubuntu version and public IPv4. Verified September 25, 2026.
- [ ] Record the provider, backup, logging, support-access and subprocessor evidence supporting the Canada-only requirement.
- [ ] Deploy the reviewed Phase 1 completion commit to `/opt/jfm-hub`; the current service already runs as unprivileged user `jfm`.
- [x] Install `/etc/jfm-hub.env` with administrator-only permissions; verified root-owned mode 600. Never copy its values into this file or Git.
- [ ] Mount and permission a separately administered Canadian recovery target at `/var/lib/jfm-hub-secondary`.
- [x] Start the systemd service and Caddy; confirm only ports 80/443 and key-only, root-disabled SSH are public.
- [x] Confirm the exact `hub.jonathanfolk.ca` DNS record resolves publicly without changing existing website or Google Workspace records.
- [x] Verify a valid HTTPS certificate, security headers and that the deployed Caddy configuration has no access-log handler.
- [ ] Configure independent outage monitoring that does not collect client data outside the approved boundary.
- [ ] Run `pnpm verify` and `pnpm readiness`; attach the non-secret output to the deployment record.

## Google acceptance required

- [x] Create the Google Cloud OAuth client and working production redirect URI. The local redirect remains optional for local OAuth testing.
- [ ] Demonstrate successful production sign-in and separately record rejection of a different account.
- [x] Connect Calendar as `jcwfolk@gmail.com` with read-only scope.
- [ ] Confirm the private allowlist contains exactly the seven approved calendars and no personal/holiday calendars.
- [x] Demonstrate a recorded successful sync for every approved calendar. Observed September 25, 2026.
- [ ] Demonstrate hourly incremental sync and the next daily full reconciliation.
- [ ] Demonstrate reconnect behavior after revoked or expired authorization.
- [ ] Compare known moved, cancelled and recurring bookings with the source calendars.
- [ ] Confirm one calendar failure preserves its last success and does not block the other calendars or backup.

## Recovery acceptance required

- [ ] Create current primary and independent backup copies and confirm SQLite integrity.
- [ ] Restore a selected backup into a fresh directory or replacement host without mixing WAL/SHM files.
- [ ] Verify job count, review notes, sync metadata and several known bookings after restoration.
- [ ] Demonstrate provider-level recovery and a complete-host outage alert.
- [ ] Confirm both daily and monthly retention on the independent Canadian target.

## Business and interface acceptance required

- [ ] Approve the deadline grid, weekend counting and holiday list; until then every deadline remains provisional.
- [ ] Approve a representative parsing answer key and manually review ambiguous client/service/contractor cases.
- [ ] Complete a shadow run beside the existing calendar and invoicing workflow.
- [ ] Review all four screens at phone, tablet and desktop widths.
- [ ] Test current Safari on real Apple hardware, keyboard-only use, 200% zoom and at least one screen reader.
- [ ] Confirm Gotham rendering or formally accept the system-font fallback.
- [ ] Jonathan records final acceptance of the hosted read-only workflow, date and deployed commit.

## Phase boundary

Phase 1 must not create or send invoices, calculate final prices or taxes, write to the invoicing Sheet, match or update payments, message clients, or edit calendars. Those actions remain Phase 2 work after this checklist is complete.
