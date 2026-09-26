# Phase 1 verification — September 19, 2026

## Passed locally

- TypeScript strict check and production frontend build.
- Twenty-two automated tests: service/client boundaries; contractor For J gate; held/cancelled states; repeat imports; moved-event history; transactional rollback; recurring exceptions; cancelled recurrence tombstones; Google expired-cursor reset/pagination and rolling full-sync window; failed partial downloads; review persistence/reopening; encryption tamper detection; strict production configuration; backup restore, independent-target copies and repeat same-day backup; calendar-failure isolation; HTTP source-origin checks, secret omission and invalid OAuth state rejection. Several tests cover multiple assertions.
- Real export import repeated with **187 jobs, 0 changed jobs, 88 review items** on the final repeat. No financial source writes. Four ambiguous audit titles remain standalone review items.
- Local backup created from the UI and checked for integrity. Synthetic restored database preserved job count and review note. This is not an off-machine disaster-recovery drill.
- Final dependency audit: **0 reported advisories** across all severity levels, after Vite, csv-parse and esbuild patches. This is a dependency advisory check, not a security certification.
- Isolated Chrome inspection: Overview screenshots visually checked at 390, 1180, 1440 and 2560 CSS-pixel widths. Jobs, Review and Connections checked at 390, 1180 and 1440. No horizontal page overflow or uncaught browser errors in these checks. Search/clear, detail open/Escape and backup button exercised. Small-screen Jobs and Connections screenshots reviewed. Background content is inert while the detail dialog is open.
- The original static-file root issue in the hidden project directory was fixed and covered by the HTTP test.

## Not yet verified / required for hosted acceptance

- Real Google OAuth sign-in, wrong-account denial, refresh-token expiry/reconnect and actual background calendar sync. Plugin access and app OAuth are separate.
- Hosted Canadian residency/processing terms, provider account, hostname/TLS, off-machine backups, independent outage alert and provider restore.
- Human-approved answer key, deadline grid and holiday policy. No 95% parsing-accuracy claim is made; business uncertainty remains visible.
- Full assistive-technology audit, actual iPad and phone hardware checks, browser 200% zoom and longer shadow operation. Desktop Safari on the deployment Mac has been exercised successfully.
- Thirty daily and twelve monthly integrity-checked copies are implemented. The separately administered Canadian target is supported but must still be mounted, configured and restore-tested in production.

Phase 1 was technically accepted and merged to `main` on September 25, 2026. Its unresolved operational checks remain recorded in `PHASE1_COMPLETION.md`. App AI usage is zero.

## Phase 2 invoice-drafting verification

- Twenty-four synthetic tests pass with TypeScript checking and the production build.
- Invoice totals use integer cents and a basis-point tax rate.
- A ready draft requires confirmed completion, approximate square-footage review, positive line prices, explicit tax treatment with a note, and no open review item for its job.
- Draft edits retain the prior payload in invoice history and stale edits are rejected.
- Authenticated, same-origin HTTP creation and update are covered; invalid ready-state updates fail server-side.
- No endpoint exists for issuance, Sheet writes, payment changes, deletion or client delivery.
- Production deployment and hands-on invoice workflow acceptance have not yet occurred.

## September 25 hosted observation

- The OVHcloud account shows an active VPS-1 2027 in Beauharnois, Canada (`os-bhs6`) with Ubuntu 24.04, 2 vCores, 4 GB RAM and 40 GB storage.
- `hub.jonathanfolk.ca` resolves publicly and serves a valid Let's Encrypt certificate through Caddy with HSTS, CSP, no-store, no-referrer, frame-denial and MIME-sniffing protections.
- An unauthenticated request to `/api/dashboard` returns HTTP 401.
- The signed-in Connections screen reports all seven approved calendars current, with successful refresh timestamps, and shows a successful local backup.
- The service runs as unprivileged user `jfm`; `/etc/jfm-hub.env` is root-owned mode 600; the app port listens only on loopback; UFW exposes only SSH/HTTP/HTTPS; SSH is key-only with root login disabled; and the active Caddy configuration contains no access-log handler.
- All seven `last-nightly` records show the September 25 reconciliation completed. A standalone backup copied into a fresh validation directory passed integrity and preserved 257 jobs, 123 review records and eight sync states, matching the live database at that moment.
- Current OVHcloud policy says Canadian customer information is hosted in Quebec, but remote access or occasional communication may occur outside Quebec/Canada. Strict Canada-only processing is therefore not proven. The included VPS backup is replicated within the same datacentre and is not an independent regional recovery copy.
- This does not prove wrong-account rejection, unattended refresh longevity, access-log settings, off-machine recovery, provider processing boundaries or accessibility acceptance.

## Seven-calendar update

Twenty-two tests now pass, including explicit calendar selection validation, independent per-calendar IDs/cursors, idempotent multi-calendar resync, failure isolation, titleless contractor cancellations, unknown For J naming review, rolling full-sync bounds, strict deployment configuration and standalone daily/monthly backups. Production OAuth and reads from all seven calendars are operating. A longer unattended run, revoked-token recovery and the next observed nightly reconciliation are still required.

### September 20 — studio UI refresh
TypeScript check and Vite production build pass. CSS/JSX changes only: spacing, Gotham local font faces, responsive panels and natural numeric display. No business rules, source data or external writes changed. The earlier policy-blocked inspection was superseded on September 25 by successful Chrome desktop/tablet/phone-width checks and a native desktop Safari navigation check. Jonathan's aesthetic acceptance remains pending.
