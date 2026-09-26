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
- [ ] Resolve the provider-processing boundary. OVHcloud documents Quebec hosting but possible remote access/communication outside Canada; strict Canada-only processing is not currently proven.
- [x] Deploy reviewed commit `87aee0d` to `/opt/jfm-hub` as unprivileged user `jfm`, retaining the previous deployment for rollback.
- [x] Install `/etc/jfm-hub.env` with administrator-only permissions; verified root-owned mode 600. Never copy its values into this file or Git.
- [ ] Mount and permission a separately administered Canadian recovery target at `/var/lib/jfm-hub-secondary`.
- [x] Start the systemd service and Caddy; confirm only ports 80/443 and key-only, root-disabled SSH are public.
- [x] Confirm the exact `hub.jonathanfolk.ca` DNS record resolves publicly without changing existing website or Google Workspace records.
- [x] Verify a valid HTTPS certificate, security headers and that the deployed Caddy configuration has no access-log handler.
- [ ] Configure independent outage monitoring that does not collect client data outside the approved boundary.
- [ ] `pnpm verify` passes on the host. `pnpm readiness` passes 9/10 gates and will remain incomplete until `SECONDARY_BACKUP_DIR` is configured.

## Google acceptance required

- [x] Create the Google Cloud OAuth client and working production redirect URI. The local redirect remains optional for local OAuth testing.
- [ ] Demonstrate successful production sign-in and separately record rejection of a different account.
- [x] Connect Calendar as `jcwfolk@gmail.com` with read-only scope.
- [ ] Confirm the private allowlist contains exactly the seven approved calendars and no personal/holiday calendars.
- [x] Demonstrate a recorded successful sync for every approved calendar. Observed September 25, 2026.
- [x] Demonstrate hourly incremental sync and daily full reconciliation; current per-calendar timestamps and all seven September 25 nightly records were observed.
- [ ] Demonstrate reconnect behavior after revoked or expired authorization.
- [ ] Compare known moved, cancelled and recurring bookings with the source calendars.
- [ ] Confirm one calendar failure preserves its last success and does not block the other calendars or backup.

## Recovery acceptance required

- [x] Create current primary backup copies and confirm SQLite integrity. The independent copy remains outstanding below.
- [x] Restore a selected standalone backup into a fresh validation directory without mixing WAL/SHM files.
- [x] Verify restored job count, review count and sync metadata against the live database. Known-booking and replacement-host checks remain part of cross-machine acceptance.
- [ ] Demonstrate provider-level recovery and a complete-host outage alert.
- [ ] Confirm both daily and monthly retention on the independent Canadian target.

## Business and interface acceptance required

- [ ] Approve the deadline grid, weekend counting and holiday list; until then every deadline remains provisional.
- [ ] Approve a representative parsing answer key and manually review ambiguous client/service/contractor cases.
- [ ] Complete a shadow run beside the existing calendar and invoicing workflow.
- [x] Review all four screens at phone, tablet and desktop widths with no horizontal overflow or application console errors.
- [ ] Desktop Safari navigation passed on real Apple hardware. Keyboard-only use, 200% zoom, iPad/phone hardware and at least one screen reader remain.
- [ ] Confirm Gotham rendering or formally accept the system-font fallback.
- [x] Jonathan accepted the technical Phase 1 recommendation on September 25, 2026 and authorized commit `102c4bb` to be merged into `main`. Unresolved operational items above remain tracked rather than being represented as completed.

## Phase boundary

Phase 1 must not create or send invoices, calculate final prices or taxes, write to the invoicing Sheet, match or update payments, message clients, or edit calendars. Those actions remain Phase 2 work after this checklist is complete.

Phase 1 was fast-forwarded into `main` and pushed on September 25, 2026. Phase 2 development continues on `codex/phase2-invoicing`.
